/**
 * @hyzyn/dsh-tty — `tty_send` 的具名按键 `keys`（0.23.0）。
 *
 * 要修的是**静默错输入**：`data` 是原样写进 PTY 的字节，所以驱动 TUI 时 agent 得自己
 * 拼转义序列——`"\u001b[B"` 是下箭头，而 `"\\x1b[B"` / `"^[[B"` 会被当成普通字符
 * **打印进终端**，`sent` 计数一样、没有任何报错。`keys` 把这一步变成白名单查表：
 * 认得的名字发对应字节，不认得的**明确报错**（绝不静默当字面量发出去）。
 *
 * 两条边界也在本文件里：`data` 的原样语义**不变**（加解释层会砸掉现有调用方），
 * 单字符仍按字面发（vim 的 `:` `w` `q`）。
 */
// DSH_HOME 隔离（D69）：读不到开发机上的真实授权文件
import './isolated-home.js'
import { tmpdir } from 'node:os'
import { PassThrough } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { apply } from '../src/index.js'
import { resolveKeys } from '../src/keys.js'
import { withPlatform } from './platform.js'

interface FakePty {
  kind: 'local'
  pid: number
  output: PassThrough
  done: Promise<{ exitCode: number | null; signal: string | null }>
  write: (data: string) => Promise<void>
  resize: () => void
  terminal: { resize: () => void; kill: () => void }
  terminate: () => Promise<boolean>
  forceKill: () => void
  settle: (outcome: { exitCode: number | null; signal: string | null }) => void
  writes: string[]
}

interface FakeTool {
  name: string
  execute?: (args: unknown) => Promise<unknown>
}

interface Mounted {
  tools: Map<string, FakeTool>
  ptys: FakePty[]
}

function mountPlugin(): Mounted {
  const registered: FakeTool[] = []
  const ptys: FakePty[] = []
  const makeChild = (names: string[]): Record<string, unknown> => {
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
      on: () => () => {},
      events: { on: () => () => {} },
      get: (name: string) => {
        if (name === 'tools') {
          return {
            register: (definition: FakeTool) => {
              registered.push(definition)
              return () => {}
            },
          }
        }
        if (name === 'subprocess') {
          return {
            spawnTerminal: async () => {
              let settleDone!: (outcome: { exitCode: number | null; signal: string | null }) => void
              const done = new Promise<{ exitCode: number | null; signal: string | null }>((resolve) => {
                settleDone = resolve
              })
              const pty: FakePty = {
                kind: 'local',
                pid: 4242,
                output: new PassThrough(),
                done,
                writes: [],
                write: async (data: string) => {
                  pty.writes.push(data)
                },
                resize: () => {},
                terminal: { resize: () => {}, kill: () => {} },
                terminate: async () => true,
                forceKill: () => {},
                settle: (outcome) => settleDone(outcome),
              }
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
  return { tools: new Map(registered.map((tool) => [tool.name, tool])), ptys }
}

async function wait(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

/** 开一个本地交互会话（不跑命令），返回 sid。 */
async function openSession(mounted: Mounted): Promise<string> {
  const opened = await mounted.tools.get('tty_open')?.execute({ cwd: tmpdir() }) as { sid: string }
  await wait(20)
  return opened.sid
}

describe('具名按键的解析表（纯函数）', () => {
  it('方向键 / 控制键 / 功能键都映射到真实字节序列', () => {
    expect(resolveKeys(['Down'])).toBe('\x1b[B')
    expect(resolveKeys(['Up', 'Enter'])).toBe('\x1b[A\n')
    expect(resolveKeys(['C-c'])).toBe('\x03')
    expect(resolveKeys(['Esc'])).toBe('\x1b')
    expect(resolveKeys(['Shift+Tab'])).toBe('\x1b[Z')
    expect(resolveKeys(['PageDown'])).toBe('\x1b[6~')
    expect(resolveKeys(['F5'])).toBe('\x1b[15~')
    expect(resolveKeys(['Space'])).toBe(' ')
  })

  it('大小写与前缀都认（c- / ctrl- / control-，键名不区分大小写）', () => {
    expect(resolveKeys(['c-d'])).toBe('\x04')
    expect(resolveKeys(['Ctrl-D'])).toBe('\x04')
    expect(resolveKeys(['CONTROL-d'])).toBe('\x04')
    expect(resolveKeys(['ENTER'])).toBe('\n')
  })

  it('单字符按字面（vim 的 : w q），多字符的未知名一律报错并列词表', () => {
    expect(resolveKeys([':', 'w', 'q'])).toBe(':wq')
    expect(() => resolveKeys(['FooBar'])).toThrow(/未知按键名: FooBar/)
    expect(() => resolveKeys(['FooBar'])).toThrow(/Enter/)
    expect(() => resolveKeys([''])).toThrow(/空字符串/)
  })
})

describe('tty_send 的 keys 走真实工具路径（字节落到 PTY 上）', () => {
  it('keys 按序发成字节；data 在前、keys 在后', async () => {
    /*
     * 平台**钉在非 win32**：这条用例看的是 keys 的字节映射与顺序，而写入路径会过
     * `normalizePtyInput`（D74：Windows 本地会话的裸 LF 变 CRLF）——不钉住的话，
     * 同一个期望值在 windows 腿上必红（CI run 36864303722 实测）。平台两个分支由
     * `send-normalize.test.ts` 各测一遍。
     */
    await withPlatform('darwin', async () => {
      const mounted = mountPlugin()
      const sid = await openSession(mounted)
      await mounted.tools.get('tty_send')?.execute({ sid, keys: ['Down', 'Down', 'Enter'] })
      expect(mounted.ptys[0].writes).toEqual(['\x1b[B\x1b[B\n'])
      await mounted.tools.get('tty_send')?.execute({ sid, data: ':wq', keys: ['Enter'] })
      expect(mounted.ptys[0].writes.at(-1)).toBe(':wq\n')
    })
  })

  it('裸 data 依旧是**原样字节**：拼错的转义序列会照字面打进去（这就是 keys 要消灭的形态）', async () => {
    const mounted = mountPlugin()
    const sid = await openSession(mounted)
    await mounted.tools.get('tty_send')?.execute({ sid, data: '\\x1b[B' })
    expect(mounted.ptys[0].writes.at(-1)).toBe('\\x1b[B') // 6 个普通字符，不是方向键
  })

  it('data 与 keys 都不给：明确报错（不再要求 data 必填，但至少得有一个）', async () => {
    const mounted = mountPlugin()
    const sid = await openSession(mounted)
    await expect(mounted.tools.get('tty_send')?.execute({ sid })).rejects.toThrow(/data 与 keys 至少要有一个/)
    await expect(mounted.tools.get('tty_send')?.execute({ sid, data: '' })).rejects.toThrow(/data 与 keys 至少要有一个/)
  })

  it('未知按键名：报错且**一个字节都不写**（不静默当字面量发出去）', async () => {
    const mounted = mountPlugin()
    const sid = await openSession(mounted)
    const before = mounted.ptys[0].writes.length
    await expect(mounted.tools.get('tty_send')?.execute({ sid, keys: ['Down', 'DownArrow'] })).rejects.toThrow(/未知按键名: DownArrow/)
    expect(mounted.ptys[0].writes.length).toBe(before)
  })
})
