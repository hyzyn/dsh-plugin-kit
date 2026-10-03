/**
 * 「SSH 机制只许一份实现」守卫（L0）。
 *
 * ## 为什么是 L0 而不是包内
 *
 * 这条判据跨两个包（`kit` 是唯一实现方、`docker` 是消费者），而且第三个消费者
 * （`devenv`）即将进来。放在任一包里都会变成「另一个包的事，我不看」——与
 * [docs/conventions.md § L0 / L1 的边界判据](../../docs/conventions.md#l0--l1-的边界判据)
 * 里 `defects-table`（跨包）vs `defects-ledger`（包内）同一套分法。
 *
 * ## 它守的三件事（都来自 2026-10-02 那次上收，见 docs/devdata-plan.md § 16.1 的 B1）
 *
 * 1. **`packages/docker/src/ssh-exec.ts` 里没有实现**：它是纯再导出。有人把实现抄回来
 *    （「就差一个参数，复制一下最快」）时这里会红——因为那正是 TOFU 口径 / 通道额度（D150）/
 *    跳板机语义开始分叉的起点，而分叉后的症状是「容器面板连得上、环境编排连不上」，
 *    两边各自看着都对；
 * 2. **全仓只有一处 `class RemoteExec`**（tty 的 PTY 实现是**刻意**的第二份，不在这条判据里
 *    —— 见下面的 `PTY_COPY_ALLOWLIST`，它开的是「另一个东西」，判据的正文在 `kit` 那份头注里）；
 * 3. **每个 `new RemoteExec(...)` 都带 `tag:`**：日志前缀属调用方，缺了它，容器面板与
 *    环境编排的日志会互相冒充——而这些行恰好都出现在「连接出问题」的路径上。
 *
 * ## 为什么每条都配 fixture 反例
 *
 * 静态守卫最容易的失败形态是**恒绿**：正则匹配不到任何东西、或者匹配上了但断言写反。
 * 所以下面每个检查函数都是纯函数（喂源码就能造反例），并且每个反例都断言
 * 「检查函数**报出**了对应的违规」，而不是「没抛异常」。
 */
import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const REPO = new URL('../../', import.meta.url)
const read = (rel: string): string => readFileSync(new URL(rel, REPO), 'utf8')

/** 唯一实现方的路径（判据里点名的那个，不靠扫描推断）。 */
export const KIT_SSH_EXEC = 'packages/kit/src/ssh-exec.ts'
/** 连接簿读取的唯一实现方。 */
export const KIT_TTY_BOOKS = 'packages/kit/src/tty-books.ts'
/** 消费者的再导出壳。 */
export const DOCKER_SHIM = 'packages/docker/src/ssh-exec.ts'
/**
 * tty 的 PTY 实现：**刻意**的第二份，不在「只许一份」判据内。
 *
 * 它开的是交互式 PTY（`shell` channel / `env` / `pty` 尺寸 / 窗口 resize），失败模式与一次性
 * exec 不同（它会挂住、没有总超时）。合并两者等于让一边的取舍吃进另一边的失败模式——
 * 判据的正文见 `packages/kit/src/ssh-exec.ts` 头注「与 dsh-tty 的关系」。
 */
export const PTY_COPY_ALLOWLIST = ['packages/tty/src/ssh.ts']

/** 实现标记：出现即说明这个文件里有实现，而不是在再导出。 */
const IMPLEMENTATION_MARKERS = [
  'class RemoteExec',
  'export function dialJump',
  'export function dialProxyCommand',
  'export function buildConnectConfig',
  'export function runLocal',
]

/**
 * 判据 1：消费者那份壳里没有实现、也没有 `ssh2`。
 *
 * 输入是**源码文本**而不是路径，所以 fixture 可以直接喂改坏的文本。
 */
export function shimViolations(source: string): string[] {
  const problems: string[] = []
  if (!/export\s+\*\s+from\s+'@hyzyn\/dsh-kit\/ssh-exec'/.test(source)) {
    problems.push(`没有从 '@hyzyn/dsh-kit/ssh-exec' 再导出：消费者就取不到 RemoteExec 等了`)
  }
  // 注释里写 `from 'ssh2'` 是允许的（头注就在解釋这件事），所以先去掉注释再判。
  const code = stripComments(source)
  if (/from\s+'ssh2'|require\(\s*'ssh2'\s*\)/.test(code)) {
    problems.push(`壳里出现了 ssh2 的 import：实现被抄回来了`)
  }
  for (const marker of IMPLEMENTATION_MARKERS) {
    if (code.includes(marker)) problems.push(`壳里出现实现标记「${marker}」：这是第二份实现`)
  }
  return problems
}

/**
 * 判据 2：全仓只有一处 `class RemoteExec`（PTY 那份除外）。
 *
 * @param files - 路径（仓库相对）→ 源码。
 */
export function implementationsOf(files: ReadonlyMap<string, string>): Map<string, string[]> {
  const hits = new Map<string, string[]>()
  for (const [path, source] of files) {
    if (PTY_COPY_ALLOWLIST.includes(path)) continue
    const code = stripComments(source)
    const markers = IMPLEMENTATION_MARKERS.filter((marker) => code.includes(marker))
    if (markers.length > 0) hits.set(path, markers)
  }
  return hits
}

/**
 * 判据 3：每个 `new RemoteExec(` 的实参里必须有 `tag:`。
 *
 * 用**括号配对**取实参而不是「往后看 N 个字符」：后者会在格式变动（换行、注释）后
 * 悄悄看进下一条语句，闸门依然绿——那正是本仓已经吃过一次的假绿形态。
 */
export function constructionViolations(path: string, source: string): string[] {
  const code = stripComments(source)
  const problems: string[] = []
  const NEEDLE = 'new RemoteExec('
  let at = code.indexOf(NEEDLE)
  while (at !== -1) {
    const start = at + NEEDLE.length
    const args = readArgList(code, start)
    if (args === undefined) {
      problems.push(`${path}: ${NEEDLE} 的实参括号不配对（守卫无法判定，按违规算）`)
      break
    }
    if (!/\btag\s*:/.test(args)) {
      const line = code.slice(0, at).split('\n').length
      problems.push(`${path}:${String(line)} 的 ${NEEDLE} 没有传 tag：日志会冒充别的插件`)
    }
    at = code.indexOf(NEEDLE, at + NEEDLE.length)
  }
  return problems
}

/** 从 `(` 之后读到配对的 `)`，返回中间文本；不配对返回 `undefined`。 */
function readArgList(code: string, start: number): string | undefined {
  let depth = 1
  for (let i = start; i < code.length; i += 1) {
    const ch = code[i]
    if (ch === '(') depth += 1
    else if (ch === ')') {
      depth -= 1
      if (depth === 0) return code.slice(start, i)
    }
  }
  return undefined
}

/**
 * 去掉 `//` 行注释与块注释。
 *
 * 必须去：本仓的规矩是「**静态守卫不许被注释满足**」——上收之后头注里到处是
 * `RemoteExec`、`from 'ssh2'` 这样的词，不去注释的话第一条判据会在注释上假绿/假红。
 */
export function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

/* ------------------------------------------------------------------ *
 * 真实源码上的判据
 * ------------------------------------------------------------------ */

/** 递归列出各 `packages/<pkg>/src` 下的 `.ts`（仓库相对路径 → 源码）。 */
function listPackageSources(): Map<string, string> {
  const out = new Map<string, string>()
  const packagesDir = new URL('packages/', REPO)
  for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    for (const rel of walkSrc(`packages/${entry.name}/src`)) out.set(rel, read(rel))
  }
  return out
}

/** 递归列出目录下的 `.ts` 文件（返回仓库相对路径）。 */
function walkSrc(rel: string): string[] {
  let entries
  try {
    entries = readdirSync(new URL(`${rel}/`, REPO), { withFileTypes: true })
  } catch {
    return []
  }
  const out: string[] = []
  for (const entry of entries) {
    const child = `${rel}/${entry.name}`
    if (entry.isDirectory()) out.push(...walkSrc(child))
    else if (entry.name.endsWith('.ts')) out.push(child)
  }
  return out
}

describe('SSH 机制只许一份实现（B1 上收的守卫）', () => {
  it('docker 的 ssh-exec.ts 是纯再导出', () => {
    expect(shimViolations(read(DOCKER_SHIM))).toEqual([])
  })

  it('全仓只有 kit 一处实现（tty 的 PTY 实现在白名单里）', () => {
    const hits = implementationsOf(listPackageSources())
    expect([...hits.keys()]).toEqual([KIT_SSH_EXEC])
  })

  it('连接簿读取也只在 kit 一处', () => {
    const sources = listPackageSources()
    const definers = [...sources.entries()]
      .filter(([, source]) => /export function (readTtyBooks|readTtyProxyCommandAllowed|sanitizeHostKeys)\b/.test(source))
      .map(([path]) => path)
    expect(definers).toEqual([KIT_TTY_BOOKS])
  })

  it('每个 new RemoteExec(...) 都带 tag', () => {
    const problems: string[] = []
    for (const [path, source] of listPackageSources()) {
      if (path === KIT_SSH_EXEC) continue // 自己内部不 new 自己
      problems.push(...constructionViolations(path, source))
    }
    expect(problems).toEqual([])
  })
})

/* ------------------------------------------------------------------ *
 * fixture 反例：每个检查函数都必须能报出对应的违规
 * ------------------------------------------------------------------ */

describe('守卫的反例（否则它是恒绿的）', () => {
  it('壳里抄回实现 → 报违规', () => {
    const source = `${read(DOCKER_SHIM)}\nexport class RemoteExec {}\n`
    expect(shimViolations(source)).toEqual([expect.stringContaining('class RemoteExec')])
  })

  it('壳里 import ssh2 → 报违规', () => {
    expect(shimViolations(`${read(DOCKER_SHIM)}\nimport { Client } from 'ssh2'\n`))
      .toEqual([expect.stringContaining('ssh2')])
  })

  it('壳不再导出 kit → 报违规', () => {
    expect(shimViolations('export const nothing = 1\n'))
      .toEqual([expect.stringContaining('再导出')])
  })

  it('注释里的 ssh2 / RemoteExec 不算违规（守卫不许被注释满足）', () => {
    const source = `/* import { Client } from 'ssh2' —— 只是解释 */\n// class RemoteExec 也只在注释里\n`
    expect(stripComments(source)).not.toContain('ssh2')
    expect(shimViolations(`${source}\nexport * from '@hyzyn/dsh-kit/ssh-exec'\n`)).toEqual([])
  })

  it('第二处实现 → 被 implementationsOf 抓到', () => {
    const files = new Map([
      [KIT_SSH_EXEC, 'export class RemoteExec {}\n'],
      ['packages/devenv/src/copy.ts', 'export class RemoteExec {}\n'],
    ])
    expect([...implementationsOf(files).keys()]).toEqual([KIT_SSH_EXEC, 'packages/devenv/src/copy.ts'])
  })

  it('tty 的 PTY 实现在白名单里 → 不报', () => {
    const files = new Map([[PTY_COPY_ALLOWLIST[0] as string, 'export class RemoteExec {}\n']])
    expect(implementationsOf(files).size).toBe(0)
  })

  it('少传 tag → 报违规，且指到行号', () => {
    const source = 'const r = new RemoteExec(logger, store, {\n  proxyCommandAllowed: () => true,\n})\n'
    expect(constructionViolations('x.ts', source)).toEqual([
      expect.stringContaining('x.ts:1'), // eslint 无关：行号断言即「指得到现场」
    ])
    expect(constructionViolations('x.ts', source)[0]).toContain('没有传 tag')
  })

  it('传了 tag（含跨行 / 嵌套调用）→ 不报', () => {
    const source = 'const r = new RemoteExec(logger, store, {\n  proxyCommandAllowed: () => readTtyProxyCommandAllowed(s),\n  tag: DOCKER_LOG_TAG,\n})\n'
    expect(constructionViolations('x.ts', source)).toEqual([])
  })

  it('括号不配对 → 按违规算（守卫判不了就报，不静默跳过）', () => {
    expect(constructionViolations('x.ts', 'new RemoteExec(logger\n'))
      .toEqual([expect.stringContaining('括号不配对')])
  })
})
