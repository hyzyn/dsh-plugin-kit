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
 *   - 无 shell 集成（没有 B 标记）时的降级语义如实钉住（回显在 D75 那组用例里单独修）。
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

  it('无 shell 集成标记时的降级语义：**没经过 tty_send** 的文本仍分不出回显（D75 的边界）', async () => {
    const rig = await setup()
    // 这里是「面板里用户敲的 / 远端自己打印的」——插件没有它的发送记录，无从剔除
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

/* ------------------------------------------------------------------ *
 * D75：`tty_expect` 不拿「刚发进去的命令回显」当命中（2026-09-27 真机报告）
 *
 * 报告现场（Windows 11 / cmd.exe）：`tty_send "echo ECHO_DEMO_2\n"` 的 LF 没提交命令
 * （D74），屏幕上只有回显、命令一次都没跑；紧接着 `tty_expect pattern="echo ECHO_DEMO_2"`
 * 却**立刻返回 matched**（来源标注「回溯自此前已到达、还没读过的缓冲输出」）——
 * 于是「等就绪标记」变成了一句谎：命令没执行，等待却自称成功。
 *
 * 判据：把**最近 tty_send 提交过的命令行**从候选文本里削掉再试一次，只有
 * 「削掉后不再命中」才算纯回显。这组用例正反两面都钉：
 *   - 只有回显 → 不命中，超时带 echoOnly（反例：旧实现秒回 matched）；
 *   - 回显之后再出现真输出 → 照旧命中（不许把真标记一起误杀）；
 *   - live 路径同样剔除（注册后先到的就是回显）；
 *   - 命令还在跑（TUI 全屏重画 / 长任务）时**不**启用剔除——那时屏上出现
 *     输入文本是真实输出，不是回显。
 * ------------------------------------------------------------------ */

/** 回显一份输入：PTY 把 `tty_send` 写进去的文本原样吐回来（cmd / 未关 echo 的 shell）。 */
const echoed = (data: string): string => data.replace(/\r\n|\r|\n/g, '\r\n')

describe('tty_expect 剔除「刚提交命令的回显」命中（D75）', () => {
  it('报告现场：命令没提交（只有回显）→ 不再秒回 matched，超时如实带 echoOnly', async () => {
    const rig = await setup()
    await call(rig, 'tty_send', { data: 'echo ECHO_DEMO_2\n' })
    await feed(rig.pty, echoed('echo ECHO_DEMO_2\n'))
    const startedAt = Date.now()
    const result = await call(rig, 'tty_expect', { pattern: 'echo ECHO_DEMO_2', timeoutSec: 1 })
    // 旧实现：回显躺在未读缓冲里 → 立刻 matchedFrom:'buffered'（假阳性）
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(900)
    expect(result.matched).toBe(false)
    expect(result.timedOut).toBe(true)
    expect(result.echoOnly).toBe(true)
  })

  it('不误杀真输出：回显之后命令真跑出了同一段文本 → 照旧命中', async () => {
    const rig = await setup()
    await call(rig, 'tty_send', { data: 'echo MARK_REAL\n' })
    await feed(rig.pty, echoed('echo MARK_REAL\n') + 'MARK_REAL\r\n')
    const result = await call(rig, 'tty_expect', { pattern: 'MARK_REAL', timeoutSec: 2 })
    expect(result.matched).toBe(true)
    expect(result.matchedFrom).toBe('buffered')
    expect(result.echoOnly).toBeUndefined()
  })

  it('live 路径同样剔除：注册后先到回显 → 不结算，真输出到了才命中', async () => {
    const rig = await setup()
    await call(rig, 'tty_send', { data: 'echo LIVE_MARK\n' })
    const pending = call(rig, 'tty_expect', { pattern: 'LIVE_MARK', timeoutSec: 3 })
    await feed(rig.pty, echoed('echo LIVE_MARK\n'))
    // 旧实现：回显一到就 matchedFrom:'live'。这里必须还挂着
    expect(await Promise.race([pending, sleep(300).then(() => 'pending')])).toBe('pending')
    await feed(rig.pty, 'LIVE_MARK\r\n')
    const result = await pending
    expect(result.matched).toBe(true)
    expect(result.matchedFrom).toBe('live')
  })

  it('命令还在跑（TUI / 长任务）时不启用剔除：屏上出现输入文本照旧算命中', async () => {
    const rig = await setup()
    await call(rig, 'tty_send', { data: 'vim\n' })
    await feed(rig.pty, A + 'vim\r\n' + B) // 命令开始、未结束 → inCommand
    await call(rig, 'tty_send', { data: 'hello_world\r' }) // 往 TUI 里敲（带行尾 → 记为回显候选）
    await feed(rig.pty, 'hello_world\r\n') // 「屏上重画」把它画了出来
    const result = await call(rig, 'tty_expect', { pattern: 'hello_world', timeoutSec: 1 })
    expect(result.matched).toBe(true)
    expect(result.matchedFrom).toBe('buffered')
  })

  it('echoOnly 的返回文案如实说明「回显不是输出」', () => {
    const { byName } = mount()
    const def = byName.get('tty_expect')!
    const render = def.output.render({}, { matched: false, timedOut: true, echoOnly: true, text: 'echo X' })
    expect(render[0].text).toContain('回显')
    expect(render[0].text).toContain('没有')
  })
})
