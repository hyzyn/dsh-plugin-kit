/**
 * 预载探针：把 node-pty 的**原生终止调用**记账落盘（`node -r ./scripts/pty-kill-probe.cjs …`）。
 *
 * 为什么要有它（[DEFECTS.md](../DEFECTS.md) 的 D100）：`0xC0000374` 是**原生**堆损坏，
 * 崩的时候拿不到 JS 栈、也不一定有 WER 记录，事后只剩一个退出码。而这类崩溃的共同触发形态是
 * 「同一个 pty 被原生 kill 两次」——把每一次 `NATIVE-KILL id=N` 记下来，"谁在什么时候多杀了一次"
 * 就变成可读的一串行。D100 的定位就是靠它：3/3 个会话上抓到同一个 id 被 kill 两次，间隔约 40 ms。
 *
 * 用法：
 *   set PTY_PROBE_LOG=C:\dsh-smoke\logs\probe.log      # 缺省写 <cwd>\pty-probe.log
 *   node -r ./scripts/pty-kill-probe.cjs ./scripts/pty-kill-repro.mjs kill+terminate 150
 *
 * 行的写法用 `writeSync` 直写 fd——原生崩溃发生时进程级的异步写队列会一起没掉（本包
 * D62 / scripts/crash-trace.mjs 记过同一条），`console.log` 会把这批证据留在缓冲里。
 *
 * 插桩方式是 patch `Module._load`、按**实际被加载的模块对象**下手：pnpm 的软链布局下
 * `require.resolve` 拿到的路径会随 hoist 变化，按对象插桩与布局无关。
 */
'use strict'
const fs = require('node:fs')
const path = require('node:path')

const logPath = process.env.PTY_PROBE_LOG ?? path.join(process.cwd(), 'pty-probe.log')
let fd = null
try { fd = fs.openSync(logPath, 'a') } catch (error) { process.stderr.write('probe: open log failed: ' + error.message + '\n') }

function log(line) {
  const text = '[probe ' + new Date().toISOString() + ' pid=' + process.pid + '] ' + line + '\n'
  if (fd !== null) { try { fs.writeSync(fd, text) } catch { /* fd 没了 */ } }
  try { fs.writeSync(2, text) } catch { /* stderr 没了 */ }
}

log('probe loaded; node=' + process.version + ' log=' + logPath)

const Module = require('node:module')
const origLoad = Module._load
const seen = new Set()

Module._load = function (request, parent, isMain) {
  const mod = origLoad.apply(this, arguments)
  try { patch(request, mod) } catch (error) { log('patch error for ' + request + ': ' + (error && error.message)) }
  return mod
}

function patch(request, mod) {
  if (mod === null || mod === undefined) return
  if (seen.has(request)) return
  seen.add(request)

  // 1) conpty.node（原生导出）：startProcess / connect / kill 是仅有的三个原生入口
  if (typeof mod.kill === 'function' && typeof mod.startProcess === 'function' && typeof mod.connect === 'function') {
    if (mod.__probePatched !== true) {
      mod.__probePatched = true
      const kill = mod.kill
      mod.kill = function (id) { log('NATIVE-KILL id=' + String(id) + '（第 ' + nextKill(id) + ' 次）'); return kill.apply(mod, arguments) }
      const start = mod.startProcess
      mod.startProcess = function () { const result = start.apply(mod, arguments); log('NATIVE-START pty=' + String(result && result.pty)); return result }
      const connect = mod.connect
      mod.connect = function (id) { const result = connect.apply(mod, arguments); log('NATIVE-CONNECT pty=' + String(id) + ' shellPid=' + String(result && result.pid)); return result }
      log('patched native conpty exports (' + request + ')')
    }
    return
  }

  // 2) WindowsTerminal.kill / destroy
  if (mod.WindowsTerminal && mod.WindowsTerminal.prototype && mod.WindowsTerminal.prototype.__probePatched !== true) {
    const proto = mod.WindowsTerminal.prototype
    proto.__probePatched = true
    const kill = proto.kill
    proto.kill = function () {
      log('WT-KILL ready=' + String(this._isReady) + ' pty=' + String(this._pty) + ' pid=' + String(this._pid))
      return kill.apply(this, arguments)
    }
    if (typeof proto.destroy === 'function') {
      const destroy = proto.destroy
      proto.destroy = function () { log('WT-DESTROY pty=' + String(this._pty)); return destroy.apply(this, arguments) }
    }
    log('patched WindowsTerminal (' + request + ')')
    return
  }

  // 3) WindowsPtyAgent.kill —— `_ptyNative.kill` 唯一的调用点，也是 D100 闸门所在的那一层
  if (mod.WindowsPtyAgent && mod.WindowsPtyAgent.prototype && mod.WindowsPtyAgent.prototype.__probePatched !== true) {
    const proto = mod.WindowsPtyAgent.prototype
    proto.__probePatched = true
    if (typeof proto.kill === 'function') {
      const kill = proto.kill
      proto.kill = function () {
        // PTY_PROBE_GATE=1：一次性闸门，**只用来做因果验证**（同一 harness 只差这一个变量）。
        if (process.env.PTY_PROBE_GATE === '1') {
          if (this.__probeAgentKilled === true) { log('AGENT-KILL 已闸门：跳过第 2 次原生 kill pty=' + String(this._pty)); return }
          this.__probeAgentKilled = true
        }
        log('AGENT-KILL pty=' + String(this._pty) + ' innerPid=' + String(this._innerPid) + ' exitCode=' + String(this._exitCode))
        return kill.apply(this, arguments)
      }
    }
    log('patched WindowsPtyAgent (' + request + ') gate=' + String(process.env.PTY_PROBE_GATE))
    return
  }

  // 4) ConoutConnection（每个终端一个 worker 线程，dispose 会 terminate 它）
  if (mod.ConoutConnection && mod.ConoutConnection.prototype && typeof mod.ConoutConnection.prototype.dispose === 'function' && mod.ConoutConnection.prototype.__probePatched !== true) {
    const proto = mod.ConoutConnection.prototype
    proto.__probePatched = true
    const dispose = proto.dispose
    proto.dispose = function () {
      log('CONOUT-DISPOSE pipe=' + String(this._conoutPipeName) + ' alreadyDisposed=' + String(this._isDisposed) + ' ready=' + String(this._isReady))
      return dispose.apply(this, arguments)
    }
    log('patched ConoutConnection (' + request + ')')
  }
}

const killCounts = new Map()
function nextKill(id) {
  const key = String(id)
  const next = (killCounts.get(key) ?? 0) + 1
  killCounts.set(key, next)
  // 这一行就是 D100 的判据：同一个 pty 出现第 2 次就说明两个调用方叠加了
  if (next > 1) log('!! 同一个 pty 被原生 kill 第 ' + next + ' 次：id=' + key)
  return next
}
