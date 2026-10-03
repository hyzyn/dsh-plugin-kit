/**
 * tty 连接簿 / 指纹记录的**只读读取与清洗**（机制层，2026-10-02 plan §16.1 B1）。
 *
 * ## 为什么它在 `kit` 里
 *
 * 「tty 的连接簿条目 → SSH 连接规格」这一跳有两个消费者（`@hyzyn/dsh-docker` 容器面板、
 * `@hyzyn/dsh-devenv` 环境编排），而两边**必须逐字一致**：漏带 `jump` / `proxyCommand`
 * 就是「终端连得上、面板连不上」那种半吊子状态。判据（plan §16.1）：共享的是**机制**
 * （怎么读连接簿、怎么清洗）→ 上收 `kit`；共享的是**数据/配置** → 读对方的 settings entry。
 * 连接簿本身仍归 tty——这里只**只读**它的 entry，不写、不缓存、不自建第二份界面。
 *
 * ## 这个模块**不依赖 ssh2**
 *
 * 它只有纯函数：没有 `ssh2`、没有网络、没有文件 IO。所以 `kit` 的主入口可以原样导出它，
 * 而十个不需要 SSH 的插件不会因此多加载一个传输库（传输在 `./ssh-exec`，见那个文件的头注）。
 */
import type { HostKeyRecord, SshSpec } from './ssh-exec.js'
import { sanitizeJumpSpec, sanitizeProxyCommand } from './ssh-exec.js'

/*
 * 上面两条 import 的分工是刻意的：`SshSpec` / `HostKeyRecord` 是**类型**（`import type`，
 * 编译后整条消失），两个 `sanitize*` 是**纯函数**。于是本模块虽然位于 `ssh-exec` 之下的
 * 依赖方向上，却不会把 `ssh2` 拉进调用方的加载图。
 */

/**
 * 只读其它插件 entry 的 settings（旧 `settings.get(ns)` 的替代）。
 *
 * 结构类型而不是 DSH 的内部类型：既不必把 DSH 的声明面写进 `kit`，也能在句柄缺失时
 * （启动早期、`ctx.inject` 未就绪）静态看出「没有它」——四个读取函数都按 **缺省即无** 处理。
 */
export interface SettingsLookup {
  get(ns: string): unknown
}

/** 读某个 entry 的原始值；句柄缺失 / 该 entry 读失败都算「没有」。 */
function readEntry(settings: SettingsLookup | undefined, ns: string): Record<string, unknown> | undefined {
  if (settings === undefined) return undefined
  let raw: unknown
  try {
    raw = settings.get(ns)
  } catch {
    // 拿不到 settings 句柄时**不能**当成「没配」以外的任何东西：这四个读取点的调用方
    // 都在「决定要不要连、连哪里」，读失败时给出空表 = 不连（失败方向安全）。
    return undefined
  }
  if (typeof raw !== 'object' || raw === null) return undefined
  return raw as Record<string, unknown>
}

/**
 * 清洗一份 hostKeys 输入（settings 存储 / 热更新 / 种子复制共用）。
 *
 * 同时接受两种形状：
 *   - tty 0.19.0+ 的 `{host, port, fingerprints: [...]}`（多指纹集合）；
 *   - 某个消费者旧版自己落盘的 `{host, port, fingerprint}`（迁移输入）。
 * host 统一 trim + 小写（与 tty 的落盘口径一致，否则种子命中与否取决于大小写），
 * 同一 host:port 的多条记录合并成一组指纹。
 *
 * 非数组输入返回 `undefined`（「没这一项」），空数组返回 `[]`（「有一项，但里面没内容」）——
 * 调用方对这两者的处置不同（前者用默认值，后者算用户显式清空）。
 */
export function sanitizeHostKeys(input: unknown): HostKeyRecord[] | undefined {
  if (!Array.isArray(input)) return undefined
  const byKey = new Map<string, HostKeyRecord>()
  for (const raw of input) {
    if (typeof raw !== 'object' || raw === null) continue
    const item = raw as Record<string, unknown>
    const host = typeof item.host === 'string' ? item.host.trim().toLowerCase() : ''
    const port = typeof item.port === 'number' && Number.isInteger(item.port) && item.port >= 1 && item.port <= 65535 ? item.port : 22
    const list = Array.isArray(item.fingerprints) ? item.fingerprints : []
    const single = typeof item.fingerprint === 'string' && item.fingerprint.trim() !== '' ? [item.fingerprint.trim()] : []
    const fingerprints = [...new Set([
      ...list.filter((fp): fp is string => typeof fp === 'string' && fp.trim() !== '').map((fp) => fp.trim()),
      ...single,
    ])]
    if (host === '' || fingerprints.length === 0) continue
    const key = `${host}:${String(port)}`
    const existing = byKey.get(key)
    if (existing !== undefined) {
      existing.fingerprints = [...new Set([...existing.fingerprints, ...fingerprints])]
      continue
    }
    byKey.set(key, { host, port, fingerprints })
  }
  return [...byKey.values()]
}

/**
 * 读 tty 连接簿 → 连接规格。**导出即公开 API**：连接簿 → 规格这一跳是「一处配置、两处生效」
 * 的落地处（漏带 jump / proxyCommand 就是「tty 能连、面板连不上」那种半吊子状态）。
 *
 * 缺任何一项必需字段（name / host / username）的条目**跳过**：它们连不上，留在表里只会让
 * 调用方在下游报一个指不到配置的错误。
 */
export function readTtyBooks(settings: SettingsLookup | undefined): Map<string, SshSpec> {
  const out = new Map<string, SshSpec>()
  const entry = readEntry(settings, 'tty')
  if (entry === undefined) return out
  const hosts = entry.sshHosts
  if (!Array.isArray(hosts)) return out
  for (const item of hosts) {
    if (typeof item !== 'object' || item === null) continue
    const raw = item as Record<string, unknown>
    const name = typeof raw.name === 'string' ? raw.name.trim() : ''
    const host = typeof raw.host === 'string' ? raw.host.trim() : ''
    const username = typeof raw.username === 'string' ? raw.username.trim() : ''
    if (name === '' || host === '' || username === '') continue
    const spec: SshSpec = {
      host,
      port: typeof raw.port === 'number' && Number.isInteger(raw.port) ? raw.port : 22,
      username,
      auth: raw.auth === 'key' || raw.auth === 'password' ? raw.auth : 'agent',
      keyPath: typeof raw.keyPath === 'string' ? raw.keyPath : '',
      password: typeof raw.password === 'string' ? raw.password : '',
      passphrase: typeof raw.passphrase === 'string' ? raw.passphrase : '',
      agentForward: raw.agentForward === true,
    }
    /*
     * 跳板机跟着连接簿一起走（消费方**不自建跳板机界面**：目标是「一处配置、两处生效」）。
     * 漏了这一段就是「终端能连、面板连不上」——本项立项时点名的半吊子状态。
     */
    const jump = sanitizeJumpSpec(raw.jump)
    if (jump !== undefined) spec.jump = jump
    /*
     * 代理命令同理跟着连接簿走（消费方**不自建界面**）。闸门不在这里判：它归 tty settings 的
     * `allowProxyCommand`，由 `readTtyProxyCommandAllowed()` 现读、在**每次拨号**时求值
     * （见 `RemoteExec` 的 options.proxyCommandAllowed）——这样用户一关开关就立刻生效。
     */
    const proxyCommand = sanitizeProxyCommand(raw.proxyCommand)
    if (proxyCommand !== undefined) spec.proxyCommand = proxyCommand
    out.set(name, spec)
  }
  return out
}

/**
 * 读 tty settings 里的 ProxyCommand 闸门（`allowProxyCommand`，默认关）。
 *
 * 为什么用 **tty 的**开关而不是每个消费者自己再加一个：连接簿只有一处（tty），代理命令也只有
 * 一处能填；两个开关会让「连接簿配了、这个面板不认」变成说不清的状态。代价是多依赖一个
 * 只读 settings 字段——settings 句柄缺失（启动早期）时恒 false，即**关**（失败方向安全）。
 */
export function readTtyProxyCommandAllowed(settings: SettingsLookup | undefined): boolean {
  const entry = readEntry(settings, 'tty')
  if (entry === undefined) return false
  return entry.allowProxyCommand === true
}

/**
 * 从 tty 的 hostKeys 读取已钉扎指纹，作为消费者自己那份 TOFU 记录的**种子**。
 *
 * 为什么要读它：tty 里已经确认过一次的主机，不该在新面板上被当成「首次连接」——
 * 那样用户就在不知情的情况下把指纹信任了两遍，而第二遍是静默的（TOFU 首次即放行）。
 */
export function readTtyHostKeys(settings: SettingsLookup | undefined): HostKeyRecord[] {
  const entry = readEntry(settings, 'tty')
  if (entry === undefined) return []
  return sanitizeHostKeys(entry.hostKeys) ?? []
}
