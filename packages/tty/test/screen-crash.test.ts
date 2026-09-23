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

  /** 停摆屏：`scrollback: 0` 上崩溃被兜底吞掉 → 回调再也不来 → 看门狗判定停摆。 */
  it('停摆屏被判出：崩溃后回调不再来，看门狗回调一次', async () => {
    guard() // 先挂兜底，否则这条用例会把 vitest worker 打死
    const hostile = new HeadlessTerminal({ cols: 60, rows: 3, scrollback: 0, allowProposedApi: true })
    const heartbeat = newScreenHeartbeat()
    let stalls = 0
    try {
      for (const op of CRASH_OPS) {
        if (op[0] === 'write') writeToScreen(hostile, heartbeat, op[1], () => stalls++, 60)
        else hostile.resize(op[1], op[2])
        await tick()
      }
      expect(stalls).toBe(0) // 还没到窗口
      await new Promise((r) => setTimeout(r, 250))
      expect(stalls).toBe(1) // 判出且只回调一次
      expect(heartbeat.inflight).toBeGreaterThan(0) // 出错那批的回调永远不会回来
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
})
