#!/usr/bin/env node
/**
 * @hyzyn/dsh-tty — M0 验证探针（standalone，不依赖 dsh web 宿主）。
 *
 * 验证四个关键假设：
 *   A1. ctx.subprocess.spawnTerminal 能用 $SHELL 起真实 PTY，output 流能收到输出；
 *   A2. spec.env 里覆盖 TERM=xterm-256color 能压过 node-pty 的 name:"dumb"（TUI 必需）；
 *   A3. (handle).terminal.resize(cols, rows) 透传 node-pty 原生 resize 生效（DSH 未暴露该 API）；
 *   A4. webServer.registerUpgrade + ws 的 WebSocketServer({noServer:true}) 握手端到端可用。
 *
 * 用法：pnpm --filter @hyzyn/dsh-tty probe
 * 退出码：0 = 全部 PASS，1 = 任一 FAIL。
 */
import { Context } from '@deepseek-ai/cordis'
import WebServerRuntime from '@deepseek-ai/dsh-host-webserver'
import { LocalSubprocessRuntime } from '@deepseek-ai/dsh-subprocess-local'
import WebSocket, { WebSocketServer } from 'ws'

const RESULTS = []
function pass(name) { RESULTS.push(['PASS', name]); console.log('  ✔ PASS  ' + name) }
function fail(name, detail) { RESULTS.push(['FAIL', name, detail]); console.error('  ✘ FAIL  ' + name + (detail ? ' — ' + detail : '')) }

/** 累积终端输出直到匹配正则，超时 reject。 */
function expectOutput(handle, re, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    let buffer = ''
    const timer = setTimeout(() => {
      handle.output.off('data', onData)
      reject(new Error(`timeout waiting for ${re}; got: ${JSON.stringify(buffer.slice(-300))}`))
    }, timeoutMs)
    const onData = (chunk) => {
      buffer += chunk.toString('utf8')
      const match = buffer.match(re)
      if (match) {
        clearTimeout(timer)
        handle.output.off('data', onData)
        resolve(match)
      }
    }
    handle.output.on('data', onData)
  })
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * 构造 shell argv。DSH 的 spawnTerminal 硬编码 node-pty name:"dumb"，且 node-pty
 * 里 name 优先于 env.TERM——必须在 exec 真正的 shell 之前 export，才能让
 * vim/htop 等 TUI 拿到 xterm-256color（M0 A2 实测结论）。
 */
function shellArgv(shell, { term = 'xterm-256color', colorTerm = 'truecolor' } = {}) {
  return [shell, '-c', `export TERM='${term}'; export COLORTERM='${colorTerm}'; exec "${shell}"`]
}

async function testPty(app) {
  console.log('\n[1/2] PTY 基础能力（spawnTerminal + TERM + resize）')
  const shell = process.env.SHELL || '/bin/zsh'
  const handle = await app.subprocess.spawnTerminal({
    argv: shellArgv(shell),
    rows: 24,
    cols: 80,
    cwd: process.cwd(),
    env: { TERM: 'xterm-256color', COLORTERM: 'truecolor' },
    graceMs: 3000,
  })
  console.log(`  spawned ${shell} pid=${handle.pid}`)

  // 关掉终端回显：避免「输入行本身」被 expectOutput 误匹配（真实输出才可靠）。
  await sleep(600) // 等 shell 就绪
  handle.write('stty -echo\n').catch(() => {})
  await sleep(200)

  // A1: 输出流（printf 构造唯一标记，回显已关，匹配到的必是真实输出）
  handle.write('printf "__PTY_READY_%s\\n" OK\n').catch(() => {})
  try {
    await expectOutput(handle, /__PTY_READY_[A-Z]+/)
    pass('A1 spawnTerminal 输出流可达')
  } catch (error) {
    fail('A1 spawnTerminal 输出流可达', error.message)
  }

  // A2: TERM 覆盖（zsh 的 ZLE 会渲染输入行，回显行含 "%s\n"；用排除 % 与引号的正则只匹配真实输出）
  handle.write('printf "TERMIS:%s\\n" "$TERM"\n').catch(() => {})
  try {
    const match = await expectOutput(handle, /TERMIS:([^\s"%']+)/)
    if (match[1] === 'xterm-256color') pass('A2 TERM 覆盖生效（' + match[1] + '）')
    else fail('A2 TERM 覆盖生效', '得到 ' + match[1] + '，期望 xterm-256color')
  } catch (error) {
    fail('A2 TERM 覆盖生效', error.message)
  }

  // A3: resize 透传（stty size 输出 "rows cols"）
  handle.write('stty size\n').catch(() => {})
  const before = await expectOutput(handle, /^(\d+) (\d+)$/m).catch(() => null)
  try {
    ;(handle).terminal.resize(100, 30)
    await sleep(300)
    handle.write('stty size\n').catch(() => {})
    const resized = await expectOutput(handle, /^(\d+) (\d+)$/m)
    const ok = Number(resized[1]) === 30 && Number(resized[2]) === 100
    console.log(`    before=${before ? before[1] + 'x' + before[2] : 'n/a'} after-resize=${resized[1]}x${resized[2]}（期望 30x100）`)
    if (ok) pass('A3 resize 透传生效')
    else fail('A3 resize 透传生效', `stty 报告 ${resized[1]}x${resized[2]}`)
  } catch (error) {
    fail('A3 resize 透传生效', error.message)
  }

  handle.write('stty echo\n').catch(() => {})

  // A1b: terminate 树级清理（best-effort：幸存者竞态时降级为直接 SIGKILL）
  try {
    const donePromise = handle.done
    await handle.terminate()
    const outcome = await donePromise
    console.log(`    terminate → exitCode=${outcome.exitCode} signal=${outcome.signal}`)
    pass('A1b terminate 树级清理并给出退出事实')
  } catch (error) {
    fail('A1b terminate 树级清理并给出退出事实', error.message)
  }
}

/** best-effort 终止：terminate() 抛「幸存者」竞态时降级为对顶层 shell 直接 SIGKILL。 */
async function forceKill(handle) {
  try {
    await handle.terminate()
  } catch (error) {
    console.warn('    terminate() 报幸存者竞态，降级 SIGKILL：' + error.message)
    try {
      await handle.terminal.kill('SIGKILL')
    } catch {
      /* 已退出 */
    }
  }
}

async function testWs(app) {
  console.log('\n[2/2] WebSocket upgrade 路由（registerUpgrade + ws 握手）')
  const wss = new WebSocketServer({ noServer: true })

  /** 宿主侧会话逻辑（M1 会照此骨架落进 src/index.ts） */
  const onConnection = (ws) => {
    let handle = null
    const send = (msg) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg)) }
    ws.on('message', async (raw) => {
      let msg
      try { msg = JSON.parse(raw.toString()) } catch { return }
      if (msg.t === 'spawn') {
        try {
          handle = await app.subprocess.spawnTerminal({
            argv: shellArgv(process.env.SHELL || '/bin/zsh'),
            rows: msg.rows ?? 24,
            cols: msg.cols ?? 80,
            cwd: process.cwd(),
            env: { TERM: 'xterm-256color', COLORTERM: 'truecolor' },
            graceMs: 3000,
          })
          send({ t: 'ready', pid: handle.pid })
          handle.output.on('data', (chunk) => send({ t: 'data', d: chunk.toString('utf8') }))
          handle.done.then((outcome) => {
            send({ t: 'exit', code: outcome.exitCode, signal: outcome.signal })
            ws.close()
          })
        } catch (error) {
          send({ t: 'error', m: error.message })
        }
      } else if (msg.t === 'input' && handle) {
        handle.write(String(msg.d ?? '')).catch(() => {})
      } else if (msg.t === 'resize' && handle) {
        try { handle.terminal.resize(Number(msg.cols), Number(msg.rows)) } catch { /* 透传失败不致命 */ }
      } else if (msg.t === 'kill' && handle) {
        await forceKill(handle)
      }
    })
    ws.on('close', () => { if (handle) forceKill(handle) })
  }
  wss.on('connection', onConnection)
  app.webServer.registerUpgrade({
    path: '/api/dsh-tty/ws',
    handler: (req, socket, head) => {
      wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req))
    },
  })

  const url = `ws://127.0.0.1:${app.webServer.port}/api/dsh-tty/ws`
  const client = new WebSocket(url)
  const received = []
  let sawExit = false
  let sawResizeAck = false

  const result = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ ok: false, error: 'WS 端到端超时', received }), 15000)
    client.on('open', () => {
      client.send(JSON.stringify({ t: 'spawn', cols: 80, rows: 24 }))
    })
    client.on('message', (raw) => {
      const msg = JSON.parse(raw.toString())
      received.push(msg.t)
      if (msg.t === 'ready') {
        client.send(JSON.stringify({ t: 'resize', cols: 100, rows: 30 }))
        client.send(JSON.stringify({ t: 'input', d: 'echo __WS_PROBE_OK__\n' }))
      } else if (msg.t === 'data' && String(msg.d).includes('__WS_PROBE_OK__')) {
        client.send(JSON.stringify({ t: 'kill' }))
      } else if (msg.t === 'exit') {
        sawExit = true
        clearTimeout(timer)
        client.close()
        resolve({ ok: true, received })
      }
    })
    client.on('error', (error) => {
      clearTimeout(timer)
      resolve({ ok: false, error: error.message, received })
    })
  })

  if (result.ok && sawExit) pass('A4 registerUpgrade + ws 握手端到端（spawn→resize→input→data→kill→exit）')
  else fail('A4 registerUpgrade + ws 握手端到端（spawn→resize→input→data→kill→exit）', result.error || '未见 exit 帧')
}

async function main() {
  const app = new Context()
  const wsFiber = app.plugin(WebServerRuntime, { host: '127.0.0.1', port: 0 })
  const subFiber = app.plugin(LocalSubprocessRuntime)
  await wsFiber.await()
  await subFiber.await()
  console.log(`webServer listening on 127.0.0.1:${app.webServer.port}`)

  await testPty(app)
  await testWs(app)

  const failed = RESULTS.filter(([kind]) => kind === 'FAIL')
  console.log(`\n==== M0 结果：${RESULTS.length - failed.length}/${RESULTS.length} PASS ====`)
  for (const [kind, name, detail] of RESULTS) console.log(`  ${kind === 'PASS' ? '✔' : '✘'} ${name}${detail ? ' — ' + detail : ''}`)
  process.exit(failed.length > 0 ? 1 : 0)
}

main().catch((error) => {
  console.error('probe 崩溃：', error)
  process.exit(1)
})
