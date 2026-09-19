/**
 * @hyzyn/dsh-tty — shell 集成命令行捕获的解析语义（DEFECTS D46 的回归护栏）。
 *
 * 背景（CI 首跑 ubuntu 时暴露）：bash ≥4.4 的 B 标记由 `PS0` 发，而 PS0 的展开在
 * **子 shell** 里，设不了父 shell 的 `__DSH_TTY_IN_CMD`——桩里那句 `if IN_CMD` 于是
 * 让 D 标记永远不发：B 到了、D 没到，`tty_capture{last:true}` 恒返回 `inProgress`、
 * `tty_expect` 永远超时（本机 macOS 是 bash 3.2 走 DEBUG trap，测不出来）。
 *
 * 修法：桩里 **D 标记无条件发**，配对交给解析器——不变量就是本文件钉住的四条：
 *   1. B → 输出 → D 正常配对，拿到输出与退出码；
 *   2. **没有配对 B 的 D 必须被忽略**（空回车/首个 prompt 都会发 D，不能造出假命令）；
 *   3. D 的退出码非数字 → null（不能把垃圾塞进 lastCommand）；
 *   4. 跨 chunk 的残包（B 与 D 分属两次 write）仍要正确配对。
 */
import { describe, expect, it } from 'vitest'
import { feedShellIntegration } from '../src/index.js'

const B = '\x1b]133;B\x07'
const A = '\x1b]133;A\x07'
const D = (code: string): string => `\x1b]133;D;${code}\x07`
const CWD = '\x1b]7;file://host/tmp\x07'

/** 解析器只碰 shellState / cwd 两个字段，替身给最小集合即可。 */
function makeSession(): { shellState: Record<string, unknown>; cwd: string } {
  return {
    shellState: { carry: '', inCommand: false, cmdBuffer: '', pendingT: null, lastCommand: null },
    cwd: '',
  }
}

function feed(session: unknown, text: string): void {
  feedShellIntegration(session as never, text)
}

describe('feedShellIntegration：B/D 配对', () => {
  it('B → 输出 → D 配对：输出与退出码都拿到', () => {
    const s = makeSession()
    feed(s, `prompt$ ${B}hello-si\n${D('0')}${A}prompt$ `)
    const last = (s.shellState as { lastCommand: { output: string; exitCode: number | null } | null }).lastCommand
    expect(last).not.toBeNull()
    expect(last?.output).toContain('hello-si')
    expect(last?.exitCode).toBe(0)
  })

  it('【D46 前提】没有配对 B 的 D 被忽略（空回车/首个 prompt 不发假命令）', () => {
    const s = makeSession()
    feed(s, `${A}prompt$ ${D('0')}${A}prompt$ `)
    expect((s.shellState as { lastCommand: unknown }).lastCommand).toBeNull()
    // 已有真命令时，后续的空回车（裸 D）也不能把它顶掉
    feed(s, `${B}real-out\n${D('3')}`)
    const before = (s.shellState as { lastCommand: { output: string; exitCode: number } }).lastCommand
    expect(before.exitCode).toBe(3)
    feed(s, `${D('0')}${A}prompt$ `)
    const after = (s.shellState as { lastCommand: { output: string; exitCode: number } }).lastCommand
    expect(after.output).toBe(before.output)
    expect(after.exitCode).toBe(3)
  })

  it('退出码非数字 → null（不把垃圾塞进 lastCommand）', () => {
    const s = makeSession()
    feed(s, `${B}x\n${D('oops')}`)
    expect((s.shellState as { lastCommand: { exitCode: number | null } }).lastCommand.exitCode).toBeNull()
  })

  it('跨 chunk 残包：B 与 D 分属两次 write 仍配对', () => {
    const s = makeSession()
    feed(s, `${B}split-out\n`)
    feed(s, `${D('7')}`)
    const last = (s.shellState as { lastCommand: { output: string; exitCode: number } | null }).lastCommand
    expect(last?.output).toContain('split-out')
    expect(last?.exitCode).toBe(7)
  })

  it('OSC 7 的 cwd 上报与命令捕获互不干扰', () => {
    const s = makeSession()
    feed(s, `${B}out\n${CWD}${D('0')}`)
    expect(s.cwd).toBe('/tmp')
    expect((s.shellState as { lastCommand: { output: string } }).lastCommand.output).toContain('out')
  })
})
