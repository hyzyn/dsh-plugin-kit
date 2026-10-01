#!/usr/bin/env node
/**
 * 测试夹具：把「代理命令已退出」与「它的 stderr 到手」**必然**拆成两拍。
 *
 * 为什么需要它：真机上这两件事的先后是**竞态**（负载下 stderr 的数据事件可能排在 exit/close
 * 之后），而竞态在单测里没法用「跑得快一点」来复现——只会偶发红（tty D95 就是这么来的）。
 * 这里用**结构**把顺序钉死：
 *   1. 主进程立刻 `exit(1)` —— 父进程马上拿到「已退出（退出码 1）」这个事实；
 *   2. stderr 交给一个 **detached** 的孙进程，120ms 后才写 —— 父进程那一刻手里**必然**没有 stderr。
 *
 * `detached: true` 不是随便加的：父进程在传输关闭时会 `kill(-pid)` 收掉代理命令的**整个进程组**，
 * 孙进程不另起一组就会被一起杀掉，「晚到的 stderr」就永远不来（= 夹具失效、测试恒绿）。
 *
 * 用法：`node proxy-late-evidence.mjs`（不需要参数；它不读 stdin）。
 */
import { spawn } from 'node:child_process'

const WRITE_AFTER_MS = 120

const grandchild = spawn(
  process.execPath,
  ['-e', `setTimeout(() => { process.stderr.write('LATE-EVIDENCE-9\\n'); process.exit(0) }, ${String(WRITE_AFTER_MS)})`],
  // stderr 继承 → 写进**父进程的那根管道**（也就是代理命令的传输证据）
  { stdio: ['ignore', 'ignore', 'inherit'], detached: true },
)
grandchild.unref()
process.exit(1)
