/**
 * D100 的最小复现（**插件层**）：把 W1–W5 的形状（经插件 + WS 的 spawn → 输入回显 → kill →
 * 关连接）在一只进程里循环 N 次，**不带** W6/W7（agent 工具与只读保留）与 W8（第二个 app + PowerShell）。
 *
 * 它回答的是「触发点在插件这一层，还是要更后面的档」：D100 定位时用它在**没有任何 W8 代码**的
 * 树上崩了 2/168 个会话（≈1.2%/会话），从而把「与 W8 相关」这条排除掉——W8 只是**加多了掷骰子
 * 的次数**（每多一条会话就多一次 kill），不是成因。
 *
 * 跑法（真机 / Windows VM，用 `lib/` 的构建产物）：
 *   node -r ./scripts/pty-kill-probe.cjs ./scripts/pty-kill-repro-plugin.mjs 150
 * 装上 D100 闸门之后：150 个会话一轮跑满、探针里 150 次 `NATIVE-KILL`、**0 次双重 kill**。
 *
 * 进度用 `writeSync` 直写 fd（原生崩溃会丢掉异步写队列里的行，见 D62）。
 */
import { writeSync } from 'node:fs'
import { Context } from '@deepseek-ai/cordis'
import WebServerRuntime from '@deepseek-ai/dsh-host-webserver'
import { LocalSubprocessRuntime } from '@deepseek-ai/dsh-subprocess-local'
import WebSocket from 'ws'
import { name, inject, apply } from '../lib/index.js'

const loops = Number(process.argv[2] ?? 12)
const say = (s) => { try { writeSync(1, s + '\n') } catch { /* fd 没了 */ } }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// 同 pty-kill-repro.mjs：只在 Windows 上有意义（默认 shell 是 %COMSPEC%，打的是 ConPTY 的终止路径）。
if (process.platform !== 'win32') {
  say(`# 这份复现只在 Windows 上有意义（当前 ${process.platform}）：它打的是 ConPTY 的原生终止路径`)
  process.exit(0)
}

const app = new Context()
app.plugin(WebServerRuntime, { host: '127.0.0.1', port: 0 })
app.plugin(LocalSubprocessRuntime)
app.plugin({
  name: 'repro-stub',
  apply: (ctx) => {
    ctx.provide('settings', { describe: () => [], update: async () => {}, configure: () => () => {} })
    ctx.provide('tools', { register: () => () => {} })
  },
})
await app.plugin({ name, inject, apply }, { maxSessions: 4, term: 'xterm-256color', colorTerm: 'truecolor' }).await?.()
await sleep(400)
const port = app.webServer.port
say(`# loops=${loops} port=${port}`)

for (let i = 1; i <= loops; i += 1) {
  say(`[${i}] connect`)
  const ws = new WebSocket(`ws://127.0.0.1:${port}/api/dsh-tty/ws`)
  let ready = false
  let exited = false
  ws.on('message', (raw) => {
    const m = JSON.parse(raw.toString())
    if (m.t === 'ready') ready = true
    if (m.t === 'exit') exited = true
  })
  await new Promise((r) => ws.once('open', r))
  ws.send(JSON.stringify({ t: 'spawn', cols: 100, rows: 30 }))
  let t0 = Date.now()
  while (!ready && Date.now() - t0 < 20000) await sleep(50)
  say(`[${i}] ready=${String(ready)}`)
  ws.send(JSON.stringify({ t: 'input', d: 'echo x\r\n' }))
  await sleep(200)
  ws.send(JSON.stringify({ t: 'kill' }))
  t0 = Date.now()
  while (!exited && Date.now() - t0 < 15000) await sleep(50)
  say(`[${i}] exited=${String(exited)}`)
  try { ws.close() } catch { /* 已关 */ }
  await sleep(150)
}
say(`# 全部 ${loops} 轮跑完（没崩）`)
process.exit(0)
