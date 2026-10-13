/**
 * D100 的最小复现（**裸层**）：只做 `spawnTerminal` + 一层或多层终止，不跑 smoke 其余部分。
 *
 * 用途有两个：
 *   1. 隔离变量——「单次 kill 无害、双重 kill 致命」这句话是拿它跑出来的 A/B（各 150 轮）：
 *        无闸门      `node -r ./scripts/pty-kill-probe.cjs ./scripts/pty-kill-repro.mjs kill+terminate 150`
 *        一次性闸门  `PTY_PROBE_GATE=1 node -r ./scripts/pty-kill-probe.cjs ./scripts/pty-kill-repro.mjs kill+terminate 150`
 *        单次对照    `node -r ./scripts/pty-kill-probe.cjs ./scripts/pty-kill-repro.mjs terminate 150`
 *      真机（Win11 ARM64）实测：无闸门 188 次原生 kill / 94 次双重 → 第 75 轮崩
 *      （退出码 -1073740940 = `0xC0000374`）；装了闸门 150/150 每 pty 恰好 1 次、跑满不崩。
 *   2. 复现**插件实际用的那条顺序**：`kill+terminate` 才是本包 `killSessionNow` 的顺序
 *      （先 D48 的预杀、后 DSH 的 `terminate()`）；反过来（`terminate+kill`）也留着做对照。
 *
 * `kill+terminate` 为什么会双重（D100 的正文）：DSH 的 `stopShellWindows()` 在
 * `rootIdentity === undefined` 时**也**调 `terminal.kill()`，而 Windows 上 rootIdentity 恒为
 * undefined（`pid` 要等 conout 连接才有值，DSH 构造 handler 时取到 0）⇒ 两个调用方叠加。
 * 想看这条证据就跑上面的第一行：探针会打出两行 `NATIVE-KILL id=N`。
 *
 * 进度用 `writeSync` 直写 fd（原生崩溃会丢掉异步写队列里的行，见 D62）。
 *
 * 用法（在包根）：node ./scripts/pty-kill-repro.mjs <mode> <iterations>
 *   mode: spawn-only | terminate | nodepty-kill | terminate+kill | kill+terminate
 *       | kill+kill | terminate+terminate | write+<上面任意终止组合>
 *   例：write+kill+terminate（最接近插件真实路径：先写输入，再预杀，再 terminate）
 */
import { writeSync } from 'node:fs'
import { Context } from '@deepseek-ai/cordis'
import { LocalSubprocessRuntime } from '@deepseek-ai/dsh-subprocess-local'

const mode = process.argv[2] ?? 'kill+terminate'
const iterations = Number(process.argv[3] ?? 15)
const say = (s) => { try { writeSync(1, s + '\n') } catch { /* fd 没了 */ } }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// 这份复现针对的是 Windows 的 ConPTY 终止路径：非 win32 上既没有 `cmd.exe` 也没有那条原生
// `PtyKill`，跑起来只会得到「命令不存在」——直接说清楚，别让人以为复现失败。
if (process.platform !== 'win32') {
  say(`# 这份复现只在 Windows 上有意义（当前 ${process.platform}）：它打的是 ConPTY 的原生终止路径`)
  process.exit(0)
}

const ALLOWED = new Set([
  'spawn-only', 'terminate', 'nodepty-kill', 'terminate+kill', 'kill+terminate',
  'kill+kill', 'terminate+terminate',
  'write+kill', 'write+terminate', 'write+kill+terminate', 'write+terminate+kill',
])
if (!ALLOWED.has(mode)) {
  say(`# 未知 mode=${mode}；可选：${[...ALLOWED].join(' | ')}`)
  process.exit(2)
}
const steps = mode.split('+')
const doWrite = steps[0] === 'write'
const kills = doWrite ? steps.slice(1) : steps

say(`# mode=${mode} iterations=${iterations} node=${process.version} kills=[${kills.join(',')}]`)
const app = new Context()
const fiber = app.plugin(LocalSubprocessRuntime)
await fiber.await()
const subprocess = app.get('subprocess')
if (subprocess === undefined) { say('# subprocess 服务缺失!'); process.exit(2) }

/** 走一层终止：`terminate` = DSH 的 handle.terminate()（closeOnce）；其余 = node-pty 的 kill。 */
const callKill = (handle, kind) => {
  if (kind === 'terminate') {
    return handle.terminate().then(
      () => { say('      terminate() 返回') },
      (e) => { say(`      terminate() 抛: ${e?.message ?? e}`) },
    )
  }
  const kill = handle.terminal?.kill
  if (typeof kill !== 'function') { say('      terminal.kill 不存在'); return Promise.resolve() }
  try {
    kill.call(handle.terminal)
    say('      kill() 返回')
  } catch (e) {
    say(`      kill() 抛: ${e?.message ?? e}`)
  }
  return Promise.resolve()
}

for (let i = 1; i <= iterations; i += 1) {
  say(`[${i}] before-spawn`)
  const handle = await subprocess.spawnTerminal({
    argv: ['cmd.exe'], rows: 30, cols: 100, cwd: process.cwd(), env: { ...process.env }, graceMs: 5000,
  })
  // Windows 上当轮拿到的 pid 就是 0（D100 的另一半证据：node-pty 的 pid 要等 conout 连接才有值）
  say(`[${i}] spawned pid=${handle.pid} (${new Date().toISOString()})`)
  if (doWrite) { await handle.write('echo x\r\n'); await sleep(150); say(`[${i}] wrote`) }
  for (const kind of kills) {
    say(`[${i}] -> ${kind}`)
    await callKill(handle, kind)
    await sleep(kind === 'terminate' ? 0 : 50)
  }
  await Promise.race([
    handle.done.then((d) => say(`[${i}] done ${JSON.stringify(d)}`)),
    sleep(4000).then(() => say(`[${i}] done 超时（不等待）`)),
  ]).catch(() => {})
  await sleep(60)
}
say(`# 全部 ${iterations} 轮跑完（没崩） mode=${mode}`)
process.exit(0)
