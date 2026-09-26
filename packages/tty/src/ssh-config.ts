/**
 * @hyzyn/dsh-tty — ~/.ssh/config 迷你解析器（连接簿导入候选）。
 *
 * 宽容优先：目标是把常见配置安全搬进连接簿，而不是完整实现 OpenSSH 语法——
 *   - 键大小写不敏感，`key value` 与 `key=value` 都收；
 *   - `Host` 多模式时只收「全具体」块（任一模式含 * ? ! 或首字符为空格否定
 *     即整块跳过），块名取第一个模式；
 *   - 只映射 HostName / User / Port / IdentityFile；Include 不展开（跳过），
 *     其余选项（ServerAliveInterval 等）原样忽略；
 *   - **`ProxyJump` 解析成结构化的 `jump` 一起导入**（单跳）：值是 `[user@]host[:port]`，
 *     也可以引用**同一份 config 里的另一个具体 Host**（按块名解析，块序任意）；
 *     解析不出来（别名缺失 / 别名自己还依赖跳板机）就整块跳过并把块名报回去；
 *   - **`ProxyCommand` 仍整块跳过并报数**：它是「设置字段驱动的本地任意命令执行」，
 *     信任级与回环围栏之后的其它字段不同，要单独定闸门（见 ROADMAP 第 2 项）；
 *   - `ProxyJump none` / `ProxyCommand none` 是显式直连，照常导入（OpenSSH 用它抵消
 *     上层 `Host *` 的设置）；
 *   - 没有 User 的块无法构成连接簿条目（username 必填），跳过；
 *   - IdentityFile 取第一个 → auth=key + keyPath，否则 auth=agent；
 *   - 单文件最多产出 100 条，**超出部分报数**（`droppedOverflow`）：静默少列是本仓
 *     反复出现的一类缺陷（见 docs/architecture.md § 7 的「截断要有信号」）。
 */
import type { SshHostEntry, SshJumpSpec } from './ssh.js'

/** 单文件最多产出多少条连接簿候选（防异常巨型文件）。 */
export const MAX_IMPORT_ENTRIES = 100
/** `proxy` 名单最多回报多少个块名（超出的只计数）：导入提示不该被一份巨型配置撑爆。 */
export const MAX_PROXY_NAMES = 50

/** `parseSshConfigDetailed` 的结果：候选 + **每一种丢弃都要有信号**。 */
export interface ParseSshConfigResult {
  entries: SshHostEntry[]
  /** 用了 `ProxyJump` 但**解析不出跳板机**（别名缺失 / 别名自己也依赖跳板机）的块名。 */
  proxy: string[]
  /** 上一类块的总数（即使名单被截断，这个数也是准的）。 */
  proxyCount: number
  /** 用了 `ProxyCommand` 而跳过的块名（本版本不支持，信任级需单独定闸门）。 */
  proxyCommand: string[]
  /** 上一类块的总数。 */
  proxyCommandCount: number
  /** **成功带上跳板机**的条目数（对照组：让用户看得出导入到底生效了没有）。 */
  jumpImported: number
  /** 其余跳过（通配 / 否定 Host 模式、没有 User）的块数。 */
  skippedOther: number
  /** 超过 MAX_IMPORT_ENTRIES 被丢弃的块数。 */
  droppedOverflow: number
}

/**
 * 这个块是不是显式要求直连（`ProxyJump none` / `ProxyCommand none`）。
 * OpenSSH 用 `none` 抵消上层（`Host *`）的跳板机设置——这类块照常可导入。
 */
function proxyOptOut(value: string | undefined): boolean {
  return typeof value === 'string' && value.trim().toLowerCase() === 'none'
}

export function parseSshConfigDetailed(text: string): ParseSshConfigResult {
  const entries: SshHostEntry[] = []
  const proxy: string[] = []
  const proxyCommand: string[] = []
  let proxyCount = 0
  let proxyCommandCount = 0
  let jumpImported = 0
  let skippedOther = 0
  let droppedOverflow = 0

  /*
   * **两遍**：第一遍只把 config 切成块（逐行状态机原样保留），第二遍才产出条目。
   * 为什么要两遍：`ProxyJump bastion` 里的 `bastion` 常常是**同一份 config 里的另一个
   * Host**，而那个块可能写在**后面**——边切边产出就没法解析别名。
   */
  const blocks: Array<{ patterns: string[]; options: Map<string, string> }> = []
  let block: { patterns: string[]; options: Map<string, string> } | null = null

  for (const rawLine of text.split(/\r?\n/)) {
    let line = rawLine.trim()
    if (line === '' || line.startsWith('#')) continue
    // 行内注释（非引号内的第一个 ' #'）：宽容处理为直接截断
    const hash = line.indexOf(' #')
    if (hash !== -1) line = line.slice(0, hash).trim()
    if (line === '') continue
    let key: string
    let rest: string
    const eq = line.indexOf('=')
    if (eq > 0 && !/\s/.test(line.slice(0, eq))) {
      key = line.slice(0, eq).trim()
      rest = line.slice(eq + 1).trim()
    } else {
      const match = line.match(/^(\S+)\s+(.*)$/)
      if (match === null) continue
      key = match[1]
      rest = match[2].replace(/^=\s*/, '') // 宽容「key = value」的空格等号写法
    }
    const keyLower = key.toLowerCase()
    if (keyLower === 'host') {
      if (block !== null) blocks.push(block)
      // 「Host = name」的孤立等号当作分隔符宽容丢弃
      block = { patterns: rest.split(/\s+/).filter((p) => p !== '' && p !== '='), options: new Map() }
      continue
    }
    if (block === null) continue
    if (keyLower === 'include') continue // 不展开，避免读入用户无法预期的文件
    if (block.options.has(keyLower)) continue // 首个生效（OpenSSH 语义）
    block.options.set(keyLower, rest.replace(/^"+|"+$/g, ''))
  }
  if (block !== null) blocks.push(block)

  /** 一个块是不是「全具体」的 Host 模式（通配 / 否定整块不要）。 */
  const isConcrete = (item: { patterns: string[] }): boolean =>
    item.patterns.length > 0 && item.patterns.every((pattern) => pattern !== '' && !/[*?!]/.test(pattern))

  /** 具体块名 → 选项表（同名取第一个，与 OpenSSH「首个生效」一致）：别名解析用。 */
  const concrete = new Map<string, Map<string, string>>()
  for (const item of blocks) {
    if (!isConcrete(item)) continue
    const name = item.patterns[0]
    if (!concrete.has(name)) concrete.set(name, item.options)
  }

  /**
   * 解析 `ProxyJump` 的值 → `SshJumpSpec`；解析不出返回 undefined（调用方会把块名报回去）。
   *
   * 支持 `[user@]host[:port]`（IPv6 写 `[::1]:22`）与**同文件别名**；别名的 IdentityFile
   * **不进 jump**——v1 的跳板机凭据缺省继承目标那一跳（企业内网里最常见的就是共用一把钥匙
   * 或同一个 agent），显式要不同的凭据时在连接条目里手填。
   */
  const resolveJump = (value: string): SshJumpSpec | undefined => {
    let rest = value.trim()
    if (rest === '') return undefined
    let username = ''
    const at = rest.lastIndexOf('@')
    if (at > 0) {
      username = rest.slice(0, at).trim()
      rest = rest.slice(at + 1).trim()
    }
    let host = rest
    let port = 22
    const match = /^\[([^\]]+)\](?::(\d+))?$/.exec(rest) ?? /^([^:]+):(\d+)$/.exec(rest)
    if (match !== null) {
      host = match[1]
      const parsedPort = Number(match[2])
      if (Number.isInteger(parsedPort) && parsedPort >= 1 && parsedPort <= 65535) port = parsedPort
    }
    if (host === '') return undefined
    const alias = concrete.get(host)
    if (alias !== undefined) {
      // 别名自己还依赖跳板机 → 不支持嵌套（单跳），按「解析不出」处理
      if (alias.has('proxyjump') || alias.has('proxycommand')) return undefined
      const aliasHost = alias.get('hostname') ?? host
      const aliasPortRaw = Number(alias.get('port'))
      const jump: SshJumpSpec = {
        host: aliasHost,
        port: Number.isInteger(aliasPortRaw) && aliasPortRaw >= 1 && aliasPortRaw <= 65535 ? aliasPortRaw : port,
      }
      const user = username !== '' ? username : alias.get('user')
      if (typeof user === 'string' && user.trim() !== '') jump.username = user.trim()
      return jump
    }
    const jump: SshJumpSpec = { host, port }
    if (username !== '') jump.username = username
    return jump
  }

  for (const item of blocks) {
    if (!isConcrete(item)) {
      skippedOther += 1
      continue
    }
    const name = item.patterns[0]
    // ProxyCommand 与 ProxyJump 同时给时按 OpenSSH 语义：ProxyJump 优先（这里先判 ProxyCommand
    // 是为了「只配了 ProxyCommand」这种情况能被明确报数，而不是静默直连）
    const hasJump = item.options.has('proxyjump') && !proxyOptOut(item.options.get('proxyjump'))
    const hasCommand = item.options.has('proxycommand') && !proxyOptOut(item.options.get('proxycommand'))
    let jump: SshJumpSpec | undefined
    if (hasJump) {
      jump = resolveJump(item.options.get('proxyjump') ?? '')
      if (jump === undefined) {
        proxyCount += 1
        if (proxy.length < MAX_PROXY_NAMES) proxy.push(name)
        continue
      }
    } else if (hasCommand) {
      proxyCommandCount += 1
      if (proxyCommand.length < MAX_PROXY_NAMES) proxyCommand.push(name)
      continue
    }
    const user = item.options.get('user')
    if (typeof user !== 'string' || user.trim() === '') {
      skippedOther += 1
      continue
    }
    if (entries.length >= MAX_IMPORT_ENTRIES) {
      droppedOverflow += 1
      continue
    }
    const host = item.options.get('hostname') ?? name
    const portRaw = Number(item.options.get('port'))
    const port = Number.isInteger(portRaw) && portRaw >= 1 && portRaw <= 65535 ? portRaw : 22
    const identityFile = item.options.get('identityfile')
    const entry: SshHostEntry = {
      name,
      host,
      port,
      username: user.trim(),
      auth: identityFile !== undefined && identityFile.trim() !== '' ? 'key' : 'agent',
      keyPath: identityFile !== undefined ? identityFile.trim() : '',
      passphrase: '',
      password: '',
      agentForward: false,
    }
    if (jump !== undefined) {
      entry.jump = jump
      jumpImported += 1
    }
    entries.push(entry)
  }

  return { entries, proxy, proxyCount, proxyCommand, proxyCommandCount, jumpImported, skippedOther, droppedOverflow }
}

/** 只要导入候选（老调用点与既有用例的形状）；需要「跳过了什么」时用 detailed 版。 */
export function parseSshConfig(text: string): SshHostEntry[] {
  return parseSshConfigDetailed(text).entries
}
