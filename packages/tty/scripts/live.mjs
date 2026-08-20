#!/usr/bin/env node
/**
 * @hyzyn/dsh-tty — 对「正在运行的 dsh web」做存活探测与端到端冒烟。
 * 用法：node scripts/live.mjs [wsUrl]   （默认 ws://127.0.0.1:3080/api/dsh-tty/ws）
 * 用途：确认用户重启 dsh web 后插件宿主半体已加载；未重启时路由不存在，连接即失败。
 * 退出码：0 = 路由存在且 spawn→echo→kill→exit 全链路通过；1 = 失败；2 = 路由未注册。
 */
import WebSocket from 'ws'

const url = process.argv[2] ?? 'ws://127.0.0.1:3080/api/dsh-tty/ws'
const client = new WebSocket(url)
client.setMaxListeners(0)

const timer = setTimeout(() => {
  console.error('[live] 连接超时（路由可能未注册或服务未启动）')
  process.exit(2)
}, 8000)

let text = ''
let sawReady = false
let sawExit = false

client.on('open', () => {
  clearTimeout(timer)
  console.log('[live] 路由存在，WS 已连接（插件宿主半体已加载）')
  client.send(JSON.stringify({ t: 'spawn', cols: 80, rows: 24 }))
})

client.on('message', (raw) => {
  const msg = JSON.parse(raw.toString())
  if (msg.t === 'ready') {
    sawReady = true
    console.log('[live] ready pid=' + msg.pid)
    client.send(JSON.stringify({ t: 'input', d: 'printf "LIVE_OK_%s\\n" "$TERM"\n' }))
  } else if (msg.t === 'data') {
    text += String(msg.d ?? '')
    if (/LIVE_OK_xterm-256color/.test(text)) {
      console.log('[live] TERM 注入 + 数据通道 OK（xterm-256color）')
      client.send(JSON.stringify({ t: 'kill' }))
    }
  } else if (msg.t === 'exit') {
    sawExit = true
    console.log('[live] exit code=' + msg.code + ' signal=' + msg.signal)
    client.close()
    console.log('[live] 端到端冒烟通过')
    process.exit(0)
  } else if (msg.t === 'error') {
    console.error('[live] 服务端错误：' + String(msg.m ?? ''))
    process.exit(1)
  }
})

client.on('error', (error) => {
  clearTimeout(timer)
  console.error('[live] 连接失败：' + error.message + '（dsh web 可能尚未重启，插件未加载）')
  process.exit(2)
})

client.on('close', () => {
  if (!sawExit) {
    clearTimeout(timer)
    console.error('[live] 连接意外关闭（sawReady=' + sawReady + '）')
    process.exit(1)
  }
})
