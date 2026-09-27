/**
 * @hyzyn/dsh-tty — 「退出后仍可读」在**工具层**的行为（D77，issue #4 的正题）。
 *
 * 用户的现场：`tty_open` 跑一条会结束的命令（他那边是一个 python 程序崩了），
 * 进程退出后 `tty_capture` 只报「会话不存在或已退出」——输出就在面板上，AI 一个
 * 字符都取不回来，逼得人先开 `/bin/sh` 再把命令塞进去。本文件钉的就是修好之后
 * 那条链路：tty_list / tty_capture / tty_screen 仍可读、tty_send 明确拒写、
 * tty_close 负责释放。
 *
 * 假件与 `tool-concurrency.test.ts` 同构（最小假 ctx + 假 subprocess），但这里的
 * 假 PTY 可编程：能吐输出、能「退出」。
 */
// DSH_HOME 隔离（D69）：读不到开发机上的真实授权文件
import './isolated-home.js'
import { tmpdir } from 'node:os'
import { PassThrough } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { apply } from '../src/index.js'

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
}

interface FakeTool {
  name: string
  execute?: (args: unknown) => Promise<unknown>
}

interface Mounted {
  tools: Map<string, FakeTool>
  ptys: FakePty[]
}

/** 最小假 cordis ctx（照 tool-concurrency.test.ts 的写法），多给一个可编程的 subprocess。 */
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
                write: async () => {},
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

/** 开一条会结束的命令会话，让它吐一行输出后「崩掉」（signal=SIGSEGV）。 */
async function openCrashedSession(mounted: Mounted): Promise<string> {
  const opened = await mounted.tools.get('tty_open')?.execute({ cwd: tmpdir(), command: 'python3 crash.py' }) as { sid: string }
  const pty = mounted.ptys[0]
  pty.output.write('Traceback: FAULT-LINE\r\n')
  await wait(40) // 越过 12ms 合并窗口：确保输出已进环形缓冲（否则测的是「面板丢尾巴」那件事）
  pty.settle({ exitCode: null, signal: 'SIGSEGV' })
  await wait(40) // 让 done → finishSession 跑完
  return opened.sid
}

describe('退出后的只读保留（D77）：工具层', () => {
  it('tty_open 的命令退出后：tty_list 仍列得到，且带 exited/exitCode|signal/retainMs', async () => {
    const mounted = mountPlugin()
    const sid = await openCrashedSession(mounted)
    const listed = await mounted.tools.get('tty_list')?.execute({}) as { sessions: Array<Record<string, unknown>> }
    const entry = listed.sessions.find((session) => session.sid === sid)
    expect(entry, '退出后会话应从表里消失是旧行为').toBeDefined()
    expect(entry).toMatchObject({ exited: true, signal: 'SIGSEGV', owner: 'agent' })
    expect(Number(entry?.retainMs)).toBeGreaterThan(0)
  })

  it('tty_capture 读得到退出前的输出（带 exited 标记）', async () => {
    const mounted = mountPlugin()
    const sid = await openCrashedSession(mounted)
    const captured = await mounted.tools.get('tty_capture')?.execute({ sid, lines: 50 }) as { tail: string; exited?: boolean; signal?: string }
    expect(captured.tail).toContain('FAULT-LINE')
    expect(captured.exited).toBe(true)
    expect(captured.signal).toBe('SIGSEGV')
  })

  it('tty_screen 读得到退出那一刻的屏（带 exited 标记）', async () => {
    const mounted = mountPlugin()
    const sid = await openCrashedSession(mounted)
    const screen = await mounted.tools.get('tty_screen')?.execute({ sid }) as { text: string; exited?: boolean }
    expect(screen.text).toContain('FAULT-LINE')
    expect(screen.exited).toBe(true)
  })

  it('tty_send 对保留态明确拒写（不是「会话不存在」那种含糊报错）', async () => {
    const mounted = mountPlugin()
    const sid = await openCrashedSession(mounted)
    await expect(mounted.tools.get('tty_send')?.execute({ sid, data: 'echo still-alive\n' })).rejects.toThrow(/只读保留/)
  })

  it('tty_stats 对保留态如实回 available:false（不拿宿主的此刻指标冒充）', async () => {
    const mounted = mountPlugin()
    const sid = await openCrashedSession(mounted)
    const stats = await mounted.tools.get('tty_stats')?.execute({ sid }) as { available: boolean; reason?: string }
    expect(stats.available).toBe(false)
    expect(String(stats.reason)).toContain('已退出')
  })

  it('tty_close 是保留态的释放入口：关掉之后 tty_list 里就没有它了', async () => {
    const mounted = mountPlugin()
    const sid = await openCrashedSession(mounted)
    const closed = await mounted.tools.get('tty_close')?.execute({ sid }) as { ok: boolean }
    expect(closed.ok).toBe(true)
    const listed = await mounted.tools.get('tty_list')?.execute({}) as { sessions: Array<Record<string, unknown>> }
    expect(listed.sessions.find((session) => session.sid === sid)).toBeUndefined()
  })

  it('tty_expect 对保留态不白等满超时：立刻按现存输出结算', async () => {
    const mounted = mountPlugin()
    const sid = await openCrashedSession(mounted)
    const started = Date.now()
    const result = await mounted.tools.get('tty_expect')?.execute({ sid, pattern: 'NEVER-APPEARS', timeoutSec: 30 }) as { matched: boolean; timedOut: boolean; exited?: boolean }
    expect(Date.now() - started, '保留态不该再等满 30s').toBeLessThan(2000)
    expect(result.matched).toBe(false)
    expect(result.exited).toBe(true)
  })
})
