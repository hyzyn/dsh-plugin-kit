/**
 * @hyzyn/dsh-tty — `tty_send` 在 Windows 上的输入归一化回归（DEFECTS **D74**）。
 *
 * 线上痛点（2026-09-27 真机报告，Windows 11 / cmd.exe）：agent 按工具描述发
 * `echo X\n`，命令**停在输入行上**——没有输出、没有新提示符。报告方用
 * `@xterm/headless` 渲染屏幕后做了字节级判定（同一 PTY 依次写入真实字节）：
 *
 *   | 写入                | 屏幕结果                          |
 *   |---------------------|-----------------------------------|
 *   | `echo M\r`          | 输出行 + 新提示符（提交并执行）   |
 *   | `echo M\n`          | 只有回显，停在输入行（**没提交**）|
 *   | `echo M\r\n`        | 输出行 + 新提示符（提交并执行）   |
 *
 * 即 Windows 的 Enter = **CR**（或 CRLF），LF 不提交。修法取报告建议里改动最小的一条：
 * win32 上把行尾补成 CRLF，让「照描述写 `\n`」这条主路径直接可用；非 win32 原样透传。
 *
 * 本文件钉两件事：
 *   1. `normalizePtyInput` 的纯函数语义（含**不许把 CRLF 补成 CRCRLF**——那会多提交
 *      一次空命令，等于凭空多一个提示符）；
 *   2. **写入路径真的接了这一步**：把 `process.platform` 临时改成 `win32`（它是
 *      configurable 的数据属性），走 `tty_send` 的真实工具路径，断言落到假 PTY 上的字节。
 *
 * 第 2 条是必须的：只测纯函数的话，「忘了在 `tty_send` 里调用它」这种回归一条都拦不住。
 */
// DSH_HOME 隔离（D69）：读不到开发机上的真实授权文件
import './isolated-home.js'
import { PassThrough } from 'node:stream'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { apply, normalizePtyInput } from '../src/index.js'
import type { TermHandle } from '../src/ssh.js'

/* ----------------------------- 假件 ----------------------------- */

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

interface FakePty extends TermHandle {
  writes: string[]
}

function makePty(): FakePty {
  const fake: FakePty = {
    kind: 'local',
    pid: 4242,
    output: new PassThrough(),
    done: new Promise(() => {}),
    write: async (data: string) => {
      fake.writes.push(data)
    },
    terminal: { resize: () => {}, kill: () => {} },
    terminate: async () => true,
    forceKill: () => {},
    writes: [],
  }
  return fake
}

interface ToolDef {
  name: string
  execute: (args: unknown) => Promise<Record<string, unknown>>
}

/** 最小假 cordis ctx（同 expect-backlog.test.ts 的思路）+ 假 subprocess。 */
function mount(): { byName: Map<string, ToolDef>; ptys: FakePty[] } {
  const registered: ToolDef[] = []
  const ptys: FakePty[] = []
  const makeChild = (names: string[]): Record<string, unknown> => {
    const on = (): (() => void) => () => {}
    const child: Record<string, unknown> = {
      logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
      effect: (callback: () => unknown) => {
        callback()
        return () => {}
      },
      inject: (childNames: string[], cb: (ctx: unknown) => void) => {
        cb(makeChild(childNames))
        return () => {}
      },
      on,
      events: { on },
      get: (name: string) => {
        if (name === 'tools') {
          return {
            register: (definition: ToolDef) => {
              registered.push(definition)
              return () => {}
            },
          }
        }
        if (name === 'subprocess') {
          return {
            spawnTerminal: async () => {
              const pty = makePty()
              ptys.push(pty)
              return pty
            },
          }
        }
        return undefined
      },
    }
    if (names.includes('webServer')) child.webServer = { register: () => () => {}, registerUpgrade: () => () => {} }
    if (names.includes('settings')) child.settings = { describe: () => [], update: async () => {}, configure: () => () => {} }
    if (names.includes('systemPrompt')) child.systemPrompt = { section: () => () => {}, context: () => () => {} }
    if (names.includes('credentials')) child.credentials = { resolve: async () => ({ value: undefined }) }
    return child
  }
  const root = makeChild([])
  root.inject = (names: string[], cb: (ctx: unknown) => void) => {
    cb(makeChild(names))
    return () => {}
  }
  ;(apply as unknown as (ctx: unknown, config: unknown) => void)(root, {})
  return { byName: new Map(registered.map((tool) => [tool.name, tool])), ptys }
}

interface Rig {
  tools: Map<string, ToolDef>
  pty: FakePty
  sid: string
}

async function setup(): Promise<Rig> {
  const { byName, ptys } = mount()
  const opened = await byName.get('tty_open')!.execute({ cwd: tmpdir() }) as { sid: string }
  await sleep(5)
  return { tools: byName, pty: ptys[0], sid: opened.sid }
}

/**
 * 临时把 `process.platform` 换成指定值跑一段：`tty_send` 的平台判定读的就是它
 * （vitest 默认按文件隔离 worker，所以这次改写不会外溢到别的用例文件）。
 */
async function withPlatform<T>(platform: NodeJS.Platform, run: () => Promise<T>): Promise<T> {
  const original = process.platform
  Object.defineProperty(process, 'platform', { value: platform, configurable: true })
  try {
    return await run()
  } finally {
    Object.defineProperty(process, 'platform', { value: original, configurable: true })
  }
}

/* ----------------------------- 用例 ----------------------------- */

describe('normalizePtyInput（D74：Windows 的 Enter 是 CR，裸 LF 不提交）', () => {
  it('win32：行尾裸 LF 补成 CRLF（agent 按工具描述写 \\n 的主路径）', () => {
    expect(normalizePtyInput('echo X\n', 'win32')).toBe('echo X\r\n')
  })

  it('win32：已经是 CRLF 的不再补（补成 \\r\\r\\n 会多提交一次空命令）', () => {
    expect(normalizePtyInput('echo X\r\n', 'win32')).toBe('echo X\r\n')
  })

  it('win32：一次写多行时每一行的裸 LF 都补', () => {
    expect(normalizePtyInput('a\nb\n', 'win32')).toBe('a\r\nb\r\n')
  })

  it('win32：裸 CR 与单键按键原样不动（xterm 的 Enter / TUI 的 q 本来就是 CR）', () => {
    expect(normalizePtyInput('echo X\r', 'win32')).toBe('echo X\r')
    expect(normalizePtyInput('q', 'win32')).toBe('q')
  })

  it('非 win32 原样透传（POSIX 的 Enter 就是 LF）', () => {
    expect(normalizePtyInput('echo X\n', 'darwin')).toBe('echo X\n')
    expect(normalizePtyInput('echo X\r\n', 'linux')).toBe('echo X\r\n')
  })
})

describe('tty_send 的写入路径真的接了归一化（D74）', () => {
  // 三条都**显式指定平台**，不依赖运行主机：本文件在 CI 的三平台矩阵（含 windows-latest）
  // 上都会跑，「非 win32 透传」那条若不定平台，在真 Windows 上会因为插件确实归一化了而红。
  it('非 win32 宿主：字节原样进 PTY，sent = 写入长度', async () => {
    const rig = await setup()
    const out = await withPlatform('darwin', async () =>
      await rig.tools.get('tty_send')!.execute({ sid: rig.sid, data: 'echo X\n' }))
    expect(rig.pty.writes).toEqual(['echo X\n'])
    expect(out.sent).toBe(7)
  })

  it('win32 宿主：尾随 LF 以 CRLF 落到 PTY，sent 报实际写入长度', async () => {
    const rig = await setup()
    const out = await withPlatform('win32', async () =>
      await rig.tools.get('tty_send')!.execute({ sid: rig.sid, data: 'echo X\n' }))
    expect(rig.pty.writes).toEqual(['echo X\r\n'])
    expect(out.sent).toBe(8)
  })

  it('win32 宿主的单键按键不被改写（给 TUI 发 q 仍是 1 个字符）', async () => {
    const rig = await setup()
    const out = await withPlatform('win32', async () =>
      await rig.tools.get('tty_send')!.execute({ sid: rig.sid, data: 'q' }))
    expect(rig.pty.writes).toEqual(['q'])
    expect(out.sent).toBe(1)
  })
})
