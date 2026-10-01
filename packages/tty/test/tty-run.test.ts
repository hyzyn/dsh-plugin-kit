/**
 * @hyzyn/dsh-tty — `tty_run`：一条命令一次调用（0.23.0）。
 *
 * 动机：同样的行为此前要四次调用（tty_open → tty_expect 等 → tty_capture{last} →
 * tty_close），中间还要处理已读水位线与「上一条命令」的在途判定。tty_run 把
 * 「开 → 等结束 → 取输出+退出码 → 收尾」压成一个调用。
 *
 * 三条硬语义（本文件钉的就是它们）：
 *   1. **等进程结束**，不是等某个正则——命令型会话的进程就是那条命令（D78 的 exec 链）；
 *   2. **超时不杀会话**：返回 running:true，把「继续等 / 关掉」的决定权交回调用方；
 *   3. **默认跑完即关**（结果已在本调用返回），keep:true 才留在只读保留态。
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

interface RunResult {
  sid: string
  running: boolean
  tail: string
  closed: boolean
  exitCode?: number
  signal?: string
}

/** 开跑一条命令，吐出给定输出后按给定结局「结束」。 */
async function runWithOutput(mounted: Mounted, output: string, outcome: { exitCode: number | null; signal: string | null }, args: Record<string, unknown> = {}): Promise<RunResult> {
  const started = mounted.tools.get('tty_run')?.execute({ command: 'echo hi', cwd: tmpdir(), timeoutSec: 5, ...args }) as Promise<RunResult>
  await wait(30)
  mounted.ptys[0].output.write(output + '\r\n')
  await wait(30) // 越过 12ms 合并窗口：确保输出已进环形缓冲
  mounted.ptys[0].settle(outcome)
  return await started
}

describe('tty_run：一条命令一次调用（0.23.0）', () => {
  it('命令结束：返回尾部输出 + 退出码，并默认关掉会话', async () => {
    const mounted = mountPlugin()
    const result = await runWithOutput(mounted, 'BUILD OK', { exitCode: 0, signal: null })
    expect(result).toMatchObject({ running: false, exitCode: 0, closed: true })
    expect(result.tail).toContain('BUILD OK')
    const listed = await mounted.tools.get('tty_list')?.execute({}) as { sessions: Array<Record<string, unknown>> }
    expect(listed.sessions.find((session) => session.sid === result.sid), '默认跑完即关').toBeUndefined()
  })

  it('非零退出码照实回传（不抛错：退出码是结果不是异常）', async () => {
    const mounted = mountPlugin()
    const result = await runWithOutput(mounted, 'FAIL 3 tests', { exitCode: 1, signal: null })
    expect(result).toMatchObject({ running: false, exitCode: 1, closed: true })
    expect(result.tail).toContain('FAIL 3 tests')
  })

  it('keep:true：跑完留在只读保留态，输出还能再读一次', async () => {
    const mounted = mountPlugin()
    const result = await runWithOutput(mounted, 'KEEP ME', { exitCode: 0, signal: null }, { keep: true })
    expect(result).toMatchObject({ running: false, closed: false })
    const captured = await mounted.tools.get('tty_capture')?.execute({ sid: result.sid, lines: 20 }) as { tail: string; exited?: boolean }
    expect(captured.exited).toBe(true)
    expect(captured.tail).toContain('KEEP ME')
  })

  it('D87：命令型会话的 last:true 报错指向「用 lines 读尾部」，不再误导成「shell 集成没配」', async () => {
    const mounted = mountPlugin()
    const result = await runWithOutput(mounted, 'KEEP ME', { exitCode: 0, signal: null }, { keep: true })
    // 旧文案只说「shell 集成未生效——shell 不受支持或被配置关闭——或尚未执行过命令」，
    // 用户会去翻设置卡片找一个不存在的开关；命令型会话的真相是「没有 last 这个概念」
    const error = await mounted.tools.get('tty_capture')?.execute({ sid: result.sid, last: true }).then(() => null, (reason: Error) => reason)
    expect(error?.message).toContain('命令型会话')
    expect(error?.message).toContain('lines')
    expect(error?.message).not.toContain('shell 不受支持或被配置关闭')
    // 同一份现场用 lines 读得到（不逼着调用方去猜别的入口）
    const byLines = await mounted.tools.get('tty_capture')?.execute({ sid: result.sid, lines: 20 }) as { tail: string }
    expect(byLines.tail).toContain('KEEP ME')
  })

  it('到点没结束：回 running:true 且**不杀**会话（决定权留给调用方）', async () => {
    const mounted = mountPlugin()
    const started = mounted.tools.get('tty_run')?.execute({ command: 'sleep 30', cwd: tmpdir(), timeoutSec: 1 }) as Promise<RunResult>
    const result = await started
    expect(result).toMatchObject({ running: true, closed: false })
    const listed = await mounted.tools.get('tty_list')?.execute({}) as { sessions: Array<Record<string, unknown>> }
    const entry = listed.sessions.find((session) => session.sid === result.sid)
    expect(entry, '超时不能把还在跑的会话收掉').toBeDefined()
    expect(entry?.exited).toBeUndefined()
    // 收尾：tty_close 是它的释放入口（顺带钉住「agent 开的会话关得掉」）
    await mounted.tools.get('tty_close')?.execute({ sid: result.sid })
  })

  it('被信号打死：signal 照实回传', async () => {
    const mounted = mountPlugin()
    const result = await runWithOutput(mounted, 'segfault!', { exitCode: null, signal: 'SIGSEGV' })
    expect(result).toMatchObject({ running: false, signal: 'SIGSEGV', closed: true })
  })

  it('command 缺失或空白：明确报错，不开会话', async () => {
    const mounted = mountPlugin()
    await expect(mounted.tools.get('tty_run')?.execute({ command: '   ' })).rejects.toThrow(/command/)
    expect(mounted.ptys.length).toBe(0)
  })
})
