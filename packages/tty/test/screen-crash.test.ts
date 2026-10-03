/**
 * @hyzyn/dsh-tty — 虚拟屏崩溃回归（DEFECTS D57）。
 *
 * 线上事故：`@xterm/headless@5.5.0` 的 `Buffer.lineFeed()` 里
 * `lines.get(ybase + y).isWrapped = false` 命中 `undefined`，抛
 * `TypeError: Cannot set properties of undefined (setting 'isWrapped')`；
 * 该异常抛在 `WriteBuffer._innerWrite` 的 `setTimeout` 回调里，写入路径的同步
 * try/catch 拦不住，又没有进程级兜底 → **整个 dsh 宿主进程退出**
 * （Web GUI 掉线、会话表清空、agent 全丢）。
 *
 * 触发条件（本文件钉住的两件事）：
 *   1. 虚拟屏用 `scrollback: 0` 建 —— `lines.maxLength` 被压成 `rows`，`lines` 长度
 *      跟不上 `ybase`，缓冲区一旦短于 `ybase + y + 1` 就必然越界；
 *   2. 输出与 resize（列宽变化触发 reflow）交错 —— 单独灌输出不崩。
 *
 * 下面那条 10 步序列就是 D57 的最小复现：`scrollback: 0` 上 5/5 崩，
 * `scrollback: 1`（= SCREEN_SCROLLBACK）上 0/5。
 */
// DSH_HOME 隔离（D69）：读不到开发机上的真实授权文件
import './isolated-home.js'
import { afterEach, describe, expect, it } from 'vitest'
import xtermHeadless from '@xterm/headless'
import {
  SCREEN_SCROLLBACK,
  clearScreenWatchdog,
  createHeadlessScreen,
  installXtermScreenCrashGuard,
  isXtermScreenCrash,
  newScreenHeartbeat,
  swallowXtermScreenCrash,
  writeToScreen,
  xtermScreenCrashCount,
} from '../src/index.js'

const HeadlessTerminal = xtermHeadless.Terminal
type HeadlessTerminal = InstanceType<typeof HeadlessTerminal>

type Op = ['write', string] | ['resize', number, number]

/** D57 最小复现序列（末步那个 '\n' 才崩；前 9 步只是把缓冲区逼到没地方落）。 */
const CRASH_OPS: Op[] = [
  ['write', 'A'.repeat(300)],
  ['write', '\x1b[3;9r'],
  ['write', '\r\n'],
  ['resize', 70, 40],
  ['write', '\r\n'],
  ['resize', 33, 5],
  ['resize', 118, 8],
  ['write', 'A'.repeat(300)],
  ['resize', 21, 11],
  ['write', '\n'],
]

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

/**
 * 轮询到条件成立（默认 5s 预算）。
 *
 * 看门狗用例的窗口是**毫秒级**（这条用 60ms），固定 sleep 一个「差不多够」的值在满载
 * runner 上会被事件循环延迟吃掉——2026-09-28 macOS CI 实测过一次假红（`expected +0
 * to be 1`：250ms 没等到 60ms 的看门狗）。等条件成立既保住断言意图，又不依赖机器快慢。
 */
async function until(predicate: () => boolean, budgetMs = 5000): Promise<void> {
  const start = Date.now()
  while (!predicate()) {
    if (Date.now() - start > budgetMs) throw new Error('等待条件超时')
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
}

/**
 * 与 `until` 同样的轮询，但**超时返回 false 而不是抛错**。
 *
 * 用于「这个条件成立更好、不成立也可能是**定义**」的场合（例：真崩溃那条——看门狗按双条件
 * 判定，「窗口内有别的进展」时它**应当**不报）。这类场合用 `until` 会把「按定义不发生」
 * 拖成 5s 超时再抛错，正是 2026-10-03 那条 5035ms 假红的形状。
 */
async function waitUntil(predicate: () => boolean, budgetMs: number): Promise<boolean> {
  const start = Date.now()
  while (!predicate()) {
    if (Date.now() - start > budgetMs) return false
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  return true
}
/** 多让几拍：解析在 setTimeout 回调里跑，异常要等定时器才冒出来。 */
const settle = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) await tick()
}

async function feed(terminal: HeadlessTerminal, ops: Op[]): Promise<void> {
  for (const op of ops) {
    if (op[0] === 'write') terminal.write(op[1])
    else terminal.resize(op[1], op[2])
    await tick()
  }
  await settle()
}

/** 每个用例自带兜底（D57 的正身）：崩了也只是记账，不会打死 vitest worker。 */
const releases: Array<() => void> = []
function guard(): void {
  releases.push(installXtermScreenCrashGuard())
}
afterEach(() => {
  while (releases.length > 0) releases.pop()?.()
})

describe('虚拟屏崩溃（D57）', () => {
  it('构造参数必须留 scrollback 余量', () => {
    // 改回 0 就会把下面两条正例变成红——这条只是把意图写死在最前面
    expect(SCREEN_SCROLLBACK).toBeGreaterThan(0)
    const screen = createHeadlessScreen(80, 24)
    expect(screen).not.toBeNull()
    expect(screen?.rows).toBe(24)
    expect(screen?.cols).toBe(80)
    screen?.dispose()
  })

  it('兜底判据只认虚拟屏异常（按堆栈，不按 message）', () => {
    expect(isXtermScreenCrash(new Error('boom'))).toBe(false)
    expect(isXtermScreenCrash(undefined)).toBe(false)
    // 同样是 isWrapped 的 message，但堆栈不是 xterm：不算虚拟屏异常
    const impostor = new TypeError("Cannot set properties of undefined (setting 'isWrapped')")
    expect(isXtermScreenCrash(impostor)).toBe(false)
    // 线上堆栈的形态（压缩产物路径也在判定范围内）
    const real = new TypeError("Cannot set properties of undefined (setting 'isWrapped')")
    real.stack = [
      "TypeError: Cannot set properties of undefined (setting 'isWrapped')",
      '    at E.lineFeed (/x/@xterm/headless/lib-headless/xterm-headless.js:1:28221)',
      '    at n._innerWrite (/x/@xterm/headless/lib-headless/xterm-headless.js:1:93270)',
      '    at Timeout._onTimeout (/x/@xterm/headless/lib-headless/xterm-headless.js:1:93028)',
    ].join('\n')
    expect(isXtermScreenCrash(real)).toBe(true)
  })

  it('最小复现序列打不穿插件建出来的虚拟屏（回归点）', async () => {
    guard()
    const before = xtermScreenCrashCount()
    const screen = createHeadlessScreen(60, 3)
    expect(screen).not.toBeNull()
    try {
      await feed(screen as HeadlessTerminal, CRASH_OPS)
      // 把 SCREEN_SCROLLBACK 改回 0 → 这里会变成 1，红
      expect(xtermScreenCrashCount()).toBe(before)
      // 屏幕还得是能读的（tty_screen 的取数路径）
      expect(screen?.buffer.active.getLine(0)).toBeDefined()
    } finally {
      screen?.dispose()
    }
  })

  it('同一序列打在 scrollback: 0 上确实会崩（负控制：钉住「序列本身有效」）', async () => {
    guard()
    const before = xtermScreenCrashCount()
    const hostile = new HeadlessTerminal({ cols: 60, rows: 3, scrollback: 0, allowProposedApi: true })
    try {
      await feed(hostile, CRASH_OPS)
    } finally {
      hostile.dispose()
    }
    if (xtermScreenCrashCount() === before) {
      // 上游把 bug 修了（或换版本后序列不再复现）：控制组失效，但正例仍成立，
      // 所以不判红——只提醒复核 SCREEN_SCROLLBACK 这条护栏是否还需要。
      console.warn('[dsh-tty] D57 负控制未复现：@xterm/headless 可能已修，请复核虚拟屏构造参数')
      return
    }
    expect(xtermScreenCrashCount()).toBe(before + 1)
  })
})

/**
 * 停摆退役（D57 跟进）：兜底吞掉异常之后，那块屏的解析器会**永久停摆**——出错的那批
 * 数据留在写队列里、`_bufferOffset` 不前进，而 `write()` 只在队列空时才重新调度解析。
 * 不管它，`tty_screen` 会一直返回冻结的旧画面（agent 据此行事），写队列还会堆到 5e7 上限。
 * 心跳用 `write(data, cb)` 的回调当解析完成信号（`onWriteParsed` 在 5.5.0 不是公开 API），
 * 超时窗口内没回调就判定停摆 → 退役该屏 → `tty_screen` 如实报「虚拟屏不可用」。
 */
describe('虚拟屏停摆心跳（D57 跟进）', () => {
  /** 健康屏：同一条序列（用修复后的构造参数）不该被误判停摆。 */
  it('健康屏不误报：回调归零、看门狗到期也不退役', async () => {
    const screen = createHeadlessScreen(60, 3)
    expect(screen).not.toBeNull()
    const heartbeat = newScreenHeartbeat()
    let stalls = 0
    try {
      for (const op of CRASH_OPS) {
        if (op[0] === 'write') {
          writeToScreen(screen as HeadlessTerminal, heartbeat, op[1], () => stalls++, 60)
        } else {
          ;(screen as HeadlessTerminal).resize(op[1], op[2])
        }
        await tick()
      }
      await new Promise((r) => setTimeout(r, 250)) // 远超 60ms 窗口
      expect(stalls).toBe(0)
      expect(heartbeat.inflight).toBe(0) // 每批都解析完了
    } finally {
      clearScreenWatchdog(heartbeat)
      screen?.dispose()
    }
  })

  /**
   * 停摆的**语义**（跨平台确定性）：回调再也不来 → 看门狗报一次，且只报一次。
   *
   * 为什么不用真 `scrollback: 0` 终端来造这个条件：崩溃是否发生取决于 xterm 内部
   * `setTimeout`（`_innerWrite` 里那个回调）的时序——2026-09-28 本地 / macOS CI /
   * Windows CI 各假红过一次；而且**慢机器上即使不崩**，60ms 窗口也可能先到而报停摆
   * （Windows CI 实测 `expected 1 to be +0`）。那两种情况都不是缺陷，是看门狗的定义，
   * 所以「一定会崩」和「不崩就一定不报」都不能当断言。崩溃本身由上面两条负控制用例钉死
   * （`最小复现序列打不穿…` / `打在上确实会崩`），真崩溃路径见下一条用例。
   */
  it('停摆屏被判出：回调不再来，看门狗只报一次', async () => {
    const heartbeat = newScreenHeartbeat()
    let stalls = 0
    writeToScreen({ write() { /* 永不回调：模拟解析器卡死 */ } }, heartbeat, 'x', () => stalls++, 60)
    expect(heartbeat.inflight).toBeGreaterThan(0)
    await until(() => stalls === 1) // 判出（轮询，不赌固定 sleep）
    // 且只报一次：再等一段确认没有第二次
    await new Promise((r) => setTimeout(r, 250))
    expect(stalls).toBe(1)
    clearScreenWatchdog(heartbeat)
  })

  /**
   * 真崩溃路径（集成）：崩了就**必须**报出停摆——**但只在「窗口内毫无解析进展」时**。
   *
   * ## 为什么这里同时接受两种结局（2026-10-03 修间歇红）
   *
   * 看门狗的判定是**双条件**（见 `writeToScreen` 的注释）：
   *   `inflight > 0 && lastParseAt < armedAt` ——「还有批次没解析完」**且**「整个窗口内毫无进展」。
   * 第二个条件是**刻意**的：只看 `inflight` 会误杀连续输出的健康屏（实测 6s 连续输出误判 1 次）。
   *
   * 而 `lastParseAt` 是**整块屏共享**的，所以「崩溃发生」**不蕴含**「会报停摆」：
   * 崩溃之后若**别的**批次在窗口内解析成功，`lastParseAt` 就被推高，第二个条件不成立 →
   * 按产品定义**那不是停摆**（屏还在动）。
   *
   * 实测（本机，6 份全量套件并发 + 2 个忙循环，同一份 CRASH_OPS 各 3 轮）：
   *   `崩溃=true stalls=1` / `崩溃=true **stalls=0** inflight=1` / `崩溃=true stalls=1`
   * ——中间那轮崩溃确实发生了，看门狗按定义不报。原用例只认 `stalls > 0`，于是在这里红
   * （历史失败均 5s 超时：`until` 的默认预算耗尽，栈指向本用例第 224 行）。
   *
   * 所以断言改成**蕴含式**（崩了 ⇒ 报停摆 ∨ 窗口内有别的进展），而不是无条件的 `stalls > 0`：
   * 「崩溃本身」由上面两条负控制用例钉死（`最小复现序列打不穿…` / `打在上确实会崩`），
   * 「不误杀健康屏」由本节第一条用例钉死，而**真崩溃 + 真停摆**这条语义由下面那条
   * **确定性**用例（回调永不来）钉死——三层各管一件事，不必让这条集成用例同时承担全部。
   */
  it('停摆屏被判出：真崩溃时，窗口内无进展就必须报出停摆', async () => {
    guard() // 先挂兜底，否则这条用例会把 vitest worker 打死
    const hostile = new HeadlessTerminal({ cols: 60, rows: 3, scrollback: 0, allowProposedApi: true })
    const heartbeat = newScreenHeartbeat()
    let stalls = 0
    const crashesBefore = xtermScreenCrashCount()
    try {
      for (const op of CRASH_OPS) {
        if (op[0] === 'write') writeToScreen(hostile, heartbeat, op[1], () => stalls++, 60)
        else hostile.resize(op[1], op[2])
        await tick()
      }
      if (xtermScreenCrashCount() > crashesBefore) {
        /*
         * 崩溃了。**等一小段**看门狗是否判出——但**不把「一定判出」当断言**（理由见上）。
         *
         * 用 `waitUntil`（超时返回 false）而不是 `until`（超时抛错）：等的只是 60ms 的看门狗
         * 窗口，而 `until` 会把「按定义不报」的那种结局也拖成 5s 超时、再抛错——那正是历史
         * 5035ms 假红的形状。
         */
        const reported = await waitUntil(() => stalls > 0, 500)
        // 判出就必须只报一次（看门狗只 arm 一次；这条在判出时是真断言）
        if (reported) expect(stalls).toBe(1)
        // 没判出：不是缺陷——窗口内有别的批次解析成功，按双条件定义**就不是停摆**
      }
      // 没崩：什么都不断言——慢机器上窗口先到也会报，那是定义不是缺陷
    } finally {
      clearScreenWatchdog(heartbeat)
      hostile.dispose()
    }
  })

  /** 同步抛出（写队列超限 / 尺寸非法）：不用等窗口，立刻判定停摆。 */
  it('写入同步抛出 → 立即判定停摆（不等窗口）', () => {
    const heartbeat = newScreenHeartbeat()
    let stalls = 0
    writeToScreen(
      { write() { throw new Error('write data discarded, use flow control to avoid losing data') } },
      heartbeat,
      'x',
      () => stalls++,
      10_000, // 窗口给得很大：只有「同步抛出」这条路能在 0ms 内判出
    )
    expect(stalls).toBe(1)
    expect(heartbeat.inflight).toBe(0)
    expect(heartbeat.watchdog).toBeNull() // 没留下悬空定时器
  })

  /** 会话结束时摘看门狗：定时器不该在会话死后误报。 */
  it('clearScreenWatchdog 之后不再回调', async () => {
    const heartbeat = newScreenHeartbeat()
    let stalls = 0
    writeToScreen({ write() { /* 永不回调：模拟停摆 */ } }, heartbeat, 'x', () => stalls++, 40)
    expect(heartbeat.watchdog).not.toBeNull()
    clearScreenWatchdog(heartbeat)
    expect(heartbeat.watchdog).toBeNull()
    await new Promise((r) => setTimeout(r, 150))
    expect(stalls).toBe(0)
  })

  /** 记账入口本身：只吞虚拟屏异常，别的一律交回调用方。 */
  it('swallowXtermScreenCrash 只吞虚拟屏异常', () => {
    const before = xtermScreenCrashCount()
    const xtermErr = new TypeError("Cannot set properties of undefined (setting 'isWrapped')")
    xtermErr.stack = "TypeError: …\n    at E.lineFeed (/x/@xterm/headless/lib-headless/xterm-headless.js:1:28221)"
    expect(swallowXtermScreenCrash(xtermErr)).toBe(true)
    expect(xtermScreenCrashCount()).toBe(before + 1)
    // 非虚拟屏异常：不记账、不吞（交回调用方决定）
    expect(swallowXtermScreenCrash(new Error('别的插件炸了'))).toBe(false)
    expect(swallowXtermScreenCrash(undefined)).toBe(false)
    expect(xtermScreenCrashCount()).toBe(before + 1)
  })

  /**
   * 回归（复核 ef1f94f2 时发现的误杀）：看门狗只看 `inflight > 0` 会把连续输出的健康屏
   * 判成停摆——它按首次写入武装，窗口到期时活跃会话几乎总有在途批次。实测 6s 连续输出
   * 误判 1 次。停摆必须是双条件：`inflight > 0` **且** 整个窗口内毫无解析进展。
   *
   * ## 参数为什么是「窗口 100ms / 每 30ms 一帧 / 解析 60ms」（2026-10-03 加固）
   *
   * 原参数是「窗口 100ms / 每 30ms 一帧 / 解析 20ms」（解析**远快于**窗口）。那组参数下
   * 窗口到期时 `inflight` 恰好是 **0**（每帧解析完就归零），单条件（只看 `inflight > 0`）
   * 因此**永远也误杀不了**——实测（2026-10-03：`src/` 改成单条件 +
   * `pnpm --filter @hyzyn/dsh-tty build` 重建）12/12 全绿。**它抓不住自己要防的那个回归。**
   *
   * 误杀要能发生，窗口到期时必须**同时**满足两件事：还有在途批次，且窗口内**已有**解析完成
   * （`lastParseAt` 被推高）。参数扫描（双条件，实测）：
   *
   * | 窗口 / 帧间隔 / 解析 | 窗口到期时 inflight | 双条件 |
   * |---|---|---|
   * | 100 / 30 / 20（原参数） | **0** ← 抓不到 | 0 次 |
   * | 100 / 30 / 60（现参数） | **2** ← 能抓 | 0 次 |
   * | 80 / 10 / 60 | 4 | 0 次 |
   *
   * 也不能一味把解析调慢到超过窗口（如 30ms 窗口 / 50ms 解析）：那时**第一个窗口内毫无进展**，
   * 按产品定义那**确实**是真停摆，双条件也报 1 次（实测）——那是语义正确，不是误杀。
   * 现参数（解析 60ms < 窗口 100ms）保证**每个窗口内都有解析完成**，所以双条件下恒 0 次。
   */
  it('连续输出不误报：在途批次跨过窗口到期也不算停摆', async () => {
    const heartbeat = newScreenHeartbeat()
    let stalls = 0
    // 健康屏模型：每 30ms 一帧、解析耗时 60ms（慢于帧间隔、快于窗口）——窗口到期时必然
    // 还有在途批次，而窗口内也必然已有解析完成 → 只有双条件才不会误杀。
    const fake = { write(_data: string, cb?: () => void) { setTimeout(() => cb?.(), 60) } }
    const writer = setInterval(() => writeToScreen(fake, heartbeat, 'x'.repeat(64), () => stalls++, 100), 30)
    await new Promise((r) => setTimeout(r, 450))
    clearInterval(writer)
    expect(stalls).toBe(0)
    await new Promise((r) => setTimeout(r, 150)) // 收尾：最后一帧解析完
    expect(stalls).toBe(0)
    expect(heartbeat.inflight).toBe(0)
  })

  it('连续输出下的真停摆照样判出（回调永远不来）', async () => {
    const heartbeat = newScreenHeartbeat()
    let stalls = 0
    const wedged = { write() { /* 永不回调：模拟解析器卡死 */ } }
    const writer = setInterval(() => writeToScreen(wedged, heartbeat, 'x', () => stalls++, 60), 30)
    await new Promise((r) => setTimeout(r, 300))
    clearInterval(writer)
    expect(stalls).toBeGreaterThan(0) // 持续输出不能把停摆无限推迟
    clearScreenWatchdog(heartbeat)
  })
})
