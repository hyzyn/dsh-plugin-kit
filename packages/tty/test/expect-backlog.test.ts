/**
 * @hyzyn/dsh-tty — `tty_expect` 的「已读水位线」回溯匹配回归（DEFECTS **D72**）。
 *
 * 线上痛点：AI 无法预测一条命令跑多久。`tty_send` 与 `tty_expect` 之间隔着一次
 * 模型推理（秒级），命令若在这个窗口里跑完，要等的标记早就落在 `session.buffer`
 * 里了——而旧实现只匹配**注册之后**到达的输出（`acc` 从空开始 + 只挂 data 监听），
 * 于是：
 *   1. 永远等不到 → 白等满 `timeoutSec`；
 *   2. 早停也失效（它的判定写在 `onData` 里，注册后没有新 chunk 就根本不执行）；
 *   3. 返回的还是**空文本**，看起来像「命令没执行」。
 * 而插件推荐的流程正是 `tty_send → tty_expect → tty_capture{last}`。
 *
 * 本文件钉住修法（两层回溯 + 水位线语义），**每条都能反向验证**：
 *   - 注册时先拿「上一条命令」的完整输出（B..D 窗口）试 → `matchedFrom:'last'`；
 *   - 泛化到「水位线之后的未读缓冲」→ `matchedFrom:'buffered'`；
 *   - 回显**不算命中**（用 A..B 标记边界排除，不做文本启发式）；
 *   - 已经读过的输出**不**回扫（否则旧匹配会当新事件误报）；
 *   - 超时**不吞**未读区（那次只交回了注册之后的增量）；
 *   - 环形缓冲裁剪后水位线仍能定位（绝对字符计数，不是「存偏移量」）；
 *   - 无 shell 集成（没有 B 标记）时的降级语义如实钉住（分不清回显）。
 *
 * 用假 PTY 驱动**真实**工具执行路径（`apply` → tools.register → execute）：`tty_open`
 * 起一个 agent 会话，再由测试把「带 OSC 133 标记的原始输出」灌进 PTY 的 output。
 */
// DSH_HOME 隔离（D69）：读不到开发机上的真实授权文件
import './isolated-home.js'
import { PassThrough } from 'node:stream'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { apply } from '../src/index.js'
import type { TermHandle } from '../src/ssh.js'

/* ----------------------------- 假件 ----------------------------- */

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))
const tick = (): Promise<void> => sleep(5)

interface FakePty extends TermHandle {
  writes: string[]
  settle: (outcome: { exitCode: number | null; signal: string | null }) => void
}

function makePty(): FakePty {
  let settleDone!: (outcome: { exitCode: number | null; signal: string | null }) => void
  const done = new Promise<{ exitCode: number | null; signal: string | null }>((resolve) => {
    settleDone = resolve
  })
  const fake: FakePty = {
    kind: 'local',
    pid: 4242,
    output: new PassThrough(),
    done,
    write: async (data: string) => {
      fake.writes.push(data)
    },
    terminal: {
      resize: () => {},
      kill: () => {},
    },
    terminate: async () => true,
    forceKill: () => {},
    writes: [],
    settle: (outcome) => settleDone(outcome),
  }
  return fake
}

interface ToolDef {
  name: string
  output: { render: (args: unknown, value: unknown) => Array<{ type: string; text: string }> }
  execute: (args: unknown) => Promise<Record<string, unknown>>
}

/**
 * 最小假 cordis ctx（同 tool-concurrency.test.ts 的思路）+ 假 subprocess：
 * tty 的 `apply` 会真构造 SessionManager / TtyServer，但没 webServer 就不注册
 * 路由、`spawnTerminal` 被换掉就不开真终端。
 */
function mount(): { byName: Map<string, ToolDef>; ptys: FakePty[] } {
  const registered: ToolDef[] = []
  const ptys: FakePty[] = []
  const listeners = new Map<string, Array<(...args: unknown[]) => void>>()
  const makeChild = (names: string[]): Record<string, unknown> => {
    const on = (name: string, listener: (...args: unknown[]) => void): (() => void) => {
      const list = listeners.get(name) ?? []
      list.push(listener)
      listeners.set(name, list)
      return () => {}
    }
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

/** 开一个 agent 会话（tty_open 的真实路径），并让「打开时刻」与后续输出错开毫秒级。 */
async function setup(): Promise<Rig> {
  const { byName, ptys } = mount()
  const opened = await byName.get('tty_open')!.execute({ cwd: tmpdir() }) as { sid: string }
  await tick()
  return { tools: byName, pty: ptys[0], sid: opened.sid }
}

/** 把原始输出灌进假 PTY（写前后各让一拍：命令边界的 `endedAt` 必须晚于水位线时刻）。 */
async function feed(pty: FakePty, text: string): Promise<void> {
  await tick()
  pty.output.write(Buffer.from(text, 'utf8'))
  await sleep(20)
}

const call = async (rig: Rig, name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> =>
  await rig.tools.get(name)!.execute({ sid: rig.sid, ...args })

/* --------------------- 带 shell 集成标记的现场 --------------------- */

const A = '\x1b]133;A\x07'
const B = '\x1b]133;B\x07'
const D = (code = 0): string => `\x1b]133;D;${String(code)}\x07`
/** 一条「瞬间跑完」的命令的完整现场：prompt(A) → 回显 → 命令开始(B) → 输出 → 结束(D) */
const finished = (cmd: string, out: string, code = 0): string => A + cmd + '\r\n' + B + out + D(code)

/* ----------------------------- 用例 ----------------------------- */

describe('tty_expect 的回溯匹配与已读水位线（D72）', () => {
  it('命令在注册之前就跑完：立刻回溯到「上一条命令」的输出（核心回归）', async () => {
    const rig = await setup()
    await call(rig, 'tty_send', { data: 'echo HELLO\n' })
    await feed(rig.pty, finished('echo HELLO', 'HELLO\r\n', 0))
    const startedAt = Date.now()
    const result = await call(rig, 'tty_expect', { pattern: 'HELLO', timeoutSec: 3 })
    // 旧实现：这里必然等满 3s 并且 text 为空（acc 里没有注册前的输出）
    expect(Date.now() - startedAt).toBeLessThan(500)
    expect(result.matched).toBe(true)
    expect(result.matchedFrom).toBe('last')
    expect(result.exitCode).toBe(0)
    expect(String(result.text)).toContain('HELLO')
  })

  it('泛化回溯：未读缓冲里的标记（无 shell 集成标记也算）命中 buffered', async () => {
    const rig = await setup()
    await call(rig, 'tty_send', { data: 'run-something\n' })
    await feed(rig.pty, 'READY-2\r\n')
    const result = await call(rig, 'tty_expect', { pattern: 'READY-2', timeoutSec: 2 })
    expect(result.matched).toBe(true)
    expect(result.matchedFrom).toBe('buffered')
  })

  it('回显不算命中：A..B 之间的回显被 B 标记边界排除（不做文本启发式）', async () => {
    const rig = await setup()
    await call(rig, 'tty_send', { data: 'echo MARKER\n' })
    await feed(rig.pty, finished('echo MARKER', 'DONE-OUT\r\n', 0))
    const result = await call(rig, 'tty_expect', { pattern: 'MARKER', timeoutSec: 1 })
    // 若不按 B 边界切片，回显里的 MARKER 会被当成 buffered 命中（假阳性）
    expect(result.matched).toBe(false)
    expect(result.timedOut).toBe(true)
  })

  it('注册之后才到达的输出照旧走 live（原语义不变）', async () => {
    const rig = await setup()
    const pending = call(rig, 'tty_expect', { pattern: 'LATER', timeoutSec: 3 })
    await feed(rig.pty, 'LATER\r\n')
    const result = await pending
    expect(result.matched).toBe(true)
    expect(result.matchedFrom).toBe('live')
  })

  it('已经读过的输出不回扫：capture 读过的内容再 expect 不会报 matched', async () => {
    const rig = await setup()
    await feed(rig.pty, 'SEEN-1\r\n')
    await call(rig, 'tty_capture', { lines: 60 })
    const stale = await call(rig, 'tty_expect', { pattern: 'SEEN-1', timeoutSec: 1 })
    expect(stale.matched).toBe(false)
    expect(stale.timedOut).toBe(true)
    // 读之后新到的输出仍然可回溯
    await feed(rig.pty, 'SEEN-2\r\n')
    const fresh = await call(rig, 'tty_expect', { pattern: 'SEEN-2', timeoutSec: 1 })
    expect(fresh.matched).toBe(true)
    expect(fresh.matchedFrom).toBe('buffered')
  })

  it('超时不吞未读区：换个 pattern 还能回溯到同一段输出', async () => {
    const rig = await setup()
    await feed(rig.pty, 'OLD-ONLY\r\n')
    const miss = await call(rig, 'tty_expect', { pattern: 'NOPE-XYZ', timeoutSec: 1 })
    expect(miss.timedOut).toBe(true)
    const hit = await call(rig, 'tty_expect', { pattern: 'OLD-ONLY', timeoutSec: 1 })
    expect(hit.matched).toBe(true)
    expect(hit.matchedFrom).toBe('buffered')
  })

  it('环形缓冲裁剪之后水位线仍能定位（绝对字符计数，裁剪不破坏定位）', async () => {
    const rig = await setup()
    await feed(rig.pty, 'A'.repeat(200 * 1024))
    await call(rig, 'tty_capture', { lines: 1 }) // 水位线推进到 200K
    await feed(rig.pty, 'B'.repeat(200 * 1024)) // 缓冲裁剪：起点前移到 ~144K
    await feed(rig.pty, 'DEEP-MARK\r\n')
    const result = await call(rig, 'tty_expect', { pattern: 'DEEP-MARK', timeoutSec: 2 })
    // 若拿水位线当「缓冲区下标」用（不做 bufferStart 折算），这里会切错位置 → 超时
    expect(result.matched).toBe(true)
    expect(result.matchedFrom).toBe('buffered')
  })

  it('无 shell 集成标记时的降级语义：回显分不出来（已知限制，如实钉住）', async () => {
    const rig = await setup()
    await feed(rig.pty, 'echo FALLBACK\r\n')
    const result = await call(rig, 'tty_expect', { pattern: 'FALLBACK', timeoutSec: 1 })
    expect(result.matched).toBe(true)
    expect(result.matchedFrom).toBe('buffered')
  })

  it('超时且没有新输出时，render 不再给一段空白（否则像「命令没执行」）', async () => {
    const { byName } = mount()
    const def = byName.get('tty_expect')!
    const empty = def.output.render({}, { matched: false, timedOut: true, text: '' })
    expect(empty[0].text).toContain('tty_capture{last:true}')
    const withText = def.output.render({}, { matched: false, timedOut: true, text: 'some output' })
    expect(withText[0].text).toContain('some output')
    const backtracked = def.output.render({}, { matched: true, timedOut: false, text: 'X', matchedFrom: 'buffered' })
    expect(backtracked[0].text).toContain('回溯')
  })
})
