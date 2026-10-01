/**
 * @hyzyn/dsh-tty — tty_list 的「有没有命令在跑」（0.23.0）。
 *
 * 动机：`tty_capture{last:true}` 早就用 `shellState.inCommand` 判在途，而 `tty_list`
 * 只报进程死没死——agent 发完命令只能靠 `tty_expect` 超时猜：猜错一次就是白等
 * 满超时，或者往正在跑的 vim / apt / less 里塞输入（那些字节被当输入吃掉，
 * 是下一次 expect 超时才发现的静默事故）。
 *
 * 三态是本文件的主角：true（在跑）/ false（命令已结束、进程已退出）/ **省略**
 * （这个会话没有 shell 集成标记 = 命令边界不可信 = 无法判断）。把「未知」报成
 * false 比不报还糟：agent 会以为可以发命令了。
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
  /** 工具声明的渲染投影（D88：三态必须在喂给模型的文本里分得开，所以要直接断言它）。 */
  output?: { render?: (args: unknown, value: unknown) => Array<{ type: string; text?: string }> }
}

interface Mounted {
  tools: Map<string, FakeTool>
  ptys: FakePty[]
  /** systemPrompt 的动态快照回调（apply 注册时捕获）。 */
  prompts: Array<() => string>
}

/** 最小假 cordis ctx（照 exited-retain.test.ts 的写法）。 */
function mountPlugin(): Mounted {
  const registered: FakeTool[] = []
  const ptys: FakePty[] = []
  const prompts: Array<() => string> = []
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
    if (names.includes('systemPrompt')) {
      child.systemPrompt = {
        section: () => () => {},
        context: (options: { text?: unknown }) => {
          if (typeof options?.text === 'function') prompts.push(options.text as () => string)
          return () => {}
        },
      }
    }
    if (names.includes('credentials')) child.credentials = { resolve: async () => ({ value: undefined }) }
    return child
  }
  const root = makeChild([])
  root.inject = (names: string[], cb: (ctx: unknown) => void) => {
    cb(makeChild(names))
    return () => {}
  }
  ;(apply as unknown as (ctx: unknown, config: unknown) => void)(root, {})
  return { tools: new Map(registered.map((tool) => [tool.name, tool])), ptys, prompts }
}

async function wait(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

async function entryOf(mounted: Mounted, sid: string): Promise<Record<string, unknown> | undefined> {
  const listed = await mounted.tools.get('tty_list')?.execute({}) as { sessions: Array<Record<string, unknown>> }
  return listed.sessions.find((session) => session.sid === sid)
}

/** 直接往某条会话的输出流里写一串字节（模拟 shell 集成钩子吐出的 OSC 133 标记）。 */
async function feed(pty: FakePty, bytes: string): Promise<void> {
  pty.output.write(bytes)
  await wait(20)
}

/** 走声明的 render 拿「模型实际看到的文本」（execute 的返回值不是模型看到的东西）。 */
async function listText(mounted: Mounted): Promise<string> {
  const tool = mounted.tools.get('tty_list') as FakeTool & { execute: (args: unknown) => Promise<unknown> }
  const value = await tool.execute({})
  const blocks = tool.output?.render?.({}, value) ?? []
  return blocks.map((block) => block.text ?? '').join('')
}

describe('tty_list 的 running / lastExitCode（0.23.0）', () => {
  it('命令型会话：进程活着就是「在跑」（不依赖 shell 集成标记）', async () => {
    const mounted = mountPlugin()
    const opened = await mounted.tools.get('tty_open')?.execute({ cwd: tmpdir(), command: 'npm run build' }) as { sid: string }
    await wait(20)
    const entry = await entryOf(mounted, opened.sid)
    expect(entry?.running).toBe(true)
    expect(entry?.exited).toBeUndefined()
  })

  it('命令型会话退出后：running 变 false，退出码走既有 exited 字段', async () => {
    const mounted = mountPlugin()
    const opened = await mounted.tools.get('tty_open')?.execute({ cwd: tmpdir(), command: 'exit 3' }) as { sid: string }
    mounted.ptys[0].settle({ exitCode: 3, signal: null })
    await wait(40)
    const entry = await entryOf(mounted, opened.sid)
    expect(entry).toMatchObject({ running: false, exited: true, exitCode: 3 })
  })

  it('交互会话没见过标记：running 键**不出现**（未知 ≠ 没在跑）', async () => {
    const mounted = mountPlugin()
    const opened = await mounted.tools.get('tty_open')?.execute({ cwd: tmpdir() }) as { sid: string }
    await wait(20)
    const entry = await entryOf(mounted, opened.sid)
    expect(entry).toBeDefined()
    expect(Object.prototype.hasOwnProperty.call(entry, 'running'), '未知必须省略，不能报 false').toBe(false)
    expect(Object.prototype.hasOwnProperty.call(entry, 'lastExitCode')).toBe(false)
  })

  it('交互会话见过标记后：B..D 之间为 true，D 之后为 false 并带 exitCode/endedAt', async () => {
    const mounted = mountPlugin()
    const opened = await mounted.tools.get('tty_open')?.execute({ cwd: tmpdir() }) as { sid: string }
    await feed(mounted.ptys[0], '\x1b]133;A\x07') // prompt 开始（标记可信了）
    expect((await entryOf(mounted, opened.sid))?.running).toBe(false)

    await feed(mounted.ptys[0], '\x1b]133;B\x07') // 命令开始
    expect((await entryOf(mounted, opened.sid))?.running).toBe(true)

    await feed(mounted.ptys[0], 'build output\r\n\x1b]133;D;3\x07') // 命令结束（退出码 3）
    const entry = await entryOf(mounted, opened.sid)
    expect(entry?.running).toBe(false)
    expect(entry?.lastExitCode).toBe(3)
    expect(typeof entry?.lastExitAt).toBe('number')
  })

  it('D88：喂给模型的**文本**里三态分得开（旧写法把「未知」与「空闲」都渲染成没有标记）', async () => {
    const mounted = mountPlugin()
    // ① 有集成标记的空闲会话
    const idle = await mounted.tools.get('tty_open')?.execute({ cwd: tmpdir() }) as { sid: string }
    await feed(mounted.ptys[0], '\x1b]133;A\x07')
    // ② 命令型会话：活着就是在跑
    const command = await mounted.tools.get('tty_open')?.execute({ cwd: tmpdir(), command: 'sleep 30' }) as { sid: string }
    // ③ 没有集成标记的交互会话：无法判断
    const unknown = await mounted.tools.get('tty_open')?.execute({ cwd: tmpdir() }) as { sid: string }
    await wait(20)

    const text = await listText(mounted)
    const lineOf = (sid: string): string => text.split('\n').find((line) => line.includes(`sid=${sid}`)) ?? ''
    expect(lineOf(idle.sid), '空闲要有自己的标记').toContain('[空闲]')
    expect(lineOf(command.sid), '在跑的会话要有警告').toContain('[运行中——现在别往里发命令]')
    expect(lineOf(unknown.sid), '未知态必须与空闲长得不一样').toContain('[命令状态未知')
    expect(lineOf(unknown.sid), '未知态不能借用「空闲」的说法').not.toContain('[空闲]')
    expect(unknown.sid, '三态得是三段不同的文本').not.toBe(idle.sid)
  })

  it('systemPrompt 的每轮快照直接标出「运行中」（agent 不调 tty_list 也看得到）', async () => {
    const mounted = mountPlugin()
    await mounted.tools.get('tty_open')?.execute({ cwd: tmpdir(), command: 'sleep 30' })
    await wait(20)
    const text = mounted.prompts.at(-1)?.() ?? ''
    expect(mounted.prompts.length, 'systemPrompt 动态快照应已注册').toBeGreaterThan(0)
    expect(text).toContain('运行中')
  })
})
