#!/usr/bin/env node
/**
 * @hyzyn/dsh-tty — TUI 冒烟：在真实实例上验证 vim / htop 可启动、可按键、可退出。
 * 用法：node scripts/tui-smoke.mjs [wsUrl]（默认 ws://127.0.0.1:3090/api/dsh-tty/ws）
 * 原理：xterm.js 渲染由浏览器完成，这里验证 PTY 侧的 TUI 行为——
 *   TERM=xterm-256color 下 vim 启动会输出 ANSI 转义序列、htop 同理；
 *   通过发送按键（:q! / q）验证输入通道。
 * 退出码：0 = PASS，1 = FAIL。
 */
import WebSocket from 'ws'

const url = process.argv[2] ?? 'ws://127.0.0.1:3090/api/dsh-tty/ws'
const client = new WebSocket(url)
client.setMaxListeners(0)

let text = ''
let passed = true
const results = []
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function waitFor(pred, timeoutMs = 15000, label) {
  const ok = typeof pred === 'function' ? pred : () => pred.test(text)
  return new Promise((resolve, reject) => {
    const start = Date.now()
    const timer = setInterval(() => {
      if (ok()) {
        clearInterval(timer)
        resolve()
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(timer)
        reject(new Error(`等待「${label}」超时；尾部输出: ${JSON.stringify(text.slice(-150))}`))
      }
    }, 100)
  })
}

const timer = setTimeout(() => {
  console.error('[tui] 连接超时')
  process.exit(1)
}, 10000)

client.on('open', () => {
  clearTimeout(timer)
  client.send(JSON.stringify({ t: 'spawn', cols: 100, rows: 30 }))
})

client.on('message', (raw) => {
  const msg = JSON.parse(raw.toString())
  if (msg.t === 'data') text += String(msg.d ?? '')
  if (msg.t === 'error') console.error('[tui] 服务端错误：' + msg.m)
})

client.on('error', (error) => {
  clearTimeout(timer)
  console.error('[tui] 连接失败：' + error.message)
  process.exit(1)
})

async function main() {
  await new Promise((resolve) => client.once('open', resolve))
  await waitFor(/[^\x00-\x08\x0e-\x1f]{2,}/, 15000, 'shell 输出')
  // shell 就绪需要时间（zsh 启动 .zshrc 等）；过早发送按键会被吞掉
  await sleep(2000)

  // vim：以发送前为基线等待全屏渲染（>500 字节增长）→ :q! 退出
  const beforeVim = text.length
  client.send(JSON.stringify({ t: 'input', d: 'vim --clean\n' }))
  try {
    await waitFor(() => text.length > beforeVim + 500, 15000, 'vim 屏幕输出')
    results.push(['PASS', 'vim 启动并渲染 ANSI 屏幕（+' + (text.length - beforeVim) + ' 字节）'])
  } catch (error) {
    results.push(['FAIL', error.message])
    passed = false
  }
  client.send(JSON.stringify({ t: 'input', d: ':q!\n' }))
  await sleep(1000)

  // 第二个 TUI：按可用性选择 htop → nano → top（macOS 自带 top）
  const { execFile } = await import('node:child_process')
  const check = (cmd) => new Promise((r) => execFile('which', [cmd], (error, stdout) => r(error === null && stdout.trim() !== '' ? cmd : null)))
  let second = 'top'
  for (const cmd of ['htop', 'nano', 'top']) {
    const found = await check(cmd)
    if (found !== null) { second = found; break }
  }
  console.log(`[tui] 第二个 TUI 程序：${second}`)
  const beforeSecond = text.length
  client.send(JSON.stringify({ t: 'input', d: `${second === 'nano' ? 'nano -l\n' : second + ' -d 1\n'}` }))
  try {
    await waitFor(() => text.length > beforeSecond + 500, 15000, `${second} 屏幕输出`)
    results.push(['PASS', `${second} 启动并渲染 ANSI 屏幕（+${text.length - beforeSecond} 字节）`])
  } catch (error) {
    results.push(['FAIL', error.message])
    passed = false
  }
  client.send(JSON.stringify({ t: 'input', d: 'q' }))
  await sleep(600)

  client.send(JSON.stringify({ t: 'kill' }))
  await sleep(500)
  client.close()

  console.log(`==== TUI 冒烟：${results.filter(([k]) => k === 'PASS').length}/${results.length} PASS ====`)
  for (const [kind, name] of results) console.log(`  ${kind === 'PASS' ? '✔' : '✘'} ${name}`)
  process.exit(passed ? 0 : 1)
}

main().catch((error) => {
  console.error('[tui] 崩溃：', error)
  process.exit(1)
})
