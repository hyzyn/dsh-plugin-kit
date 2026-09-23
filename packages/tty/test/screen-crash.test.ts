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
  createHeadlessScreen,
  installXtermScreenCrashGuard,
  isXtermScreenCrash,
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
