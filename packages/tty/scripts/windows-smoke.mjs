#!/usr/bin/env node
/**
 * @hyzyn/dsh-tty — Windows 端到端冒烟（DEFECTS D45 的最后一格）。
 *
 * 为什么单独一个脚本：integration.mjs 的 103 个用例是 POSIX 形状的（TERM 注入的
 * `-c` 包装层、shell 集成 OSC 桩、tmux、`stty size` 校验），在 Windows 上一条都
 * 不适用；而 0.18.1 修的那类 bug（默认 shell 回落 /bin/zsh、POSIX 包装层让 cmd
 * 空跑一场就退出）恰好只在「真实 cmd.exe + ConPTY」上暴露。所以这里只钉最小
 * 但真实的一条链路：挂载真实插件 → ws 协议 → spawn → ready(pid) → 输入回显 →
 * kill → exit，外加「跑起来的是 %COMSPEC% 而不是 POSIX 包装层」的直接证据。
 *
 * 非 Windows 平台**优雅跳过**（退出码 0，打印原因）：本脚本是给 CI 的
 * windows-latest 用的，在 macOS/Linux 上假装跑过没有意义。
 *
 * 用法：pnpm --filter @hyzyn/dsh-tty windows-smoke
 * 退出码：0 = 全部 PASS 或跳过，1 = 任一 FAIL。
 */
import { Context } from '@deepseek-ai/cordis'
import WebServerRuntime from '@deepseek-ai/dsh-host-webserver'
import { LocalSubprocessRuntime } from '@deepseek-ai/dsh-subprocess-local'
import WebSocket from 'ws'
import { name, inject, apply } from '../lib/index.js'

if (process.platform !== 'win32') {
  console.log(`[windows-smoke] 跳过：当前平台 ${process.platform}——本脚本只在 Windows 上跑（真实验证 cmd.exe / ConPTY 链路），CI 的 windows-latest job 会执行它`)
  process.exit(0)
}

/* 看门狗：任何环节卡死时留痕退出（正常路径会先 process.exit）。 */
const watchdog = setTimeout(() => {
  console.error('[watchdog] 90s 看门狗触发：windows-smoke 卡死')
  process.exit(2)
}, 90000)
watchdog.unref()

const RESULTS = []
function pass(label) { RESULTS.push(['PASS', label]); console.log('  ✔ PASS  ' + label) }
function fail(label, detail) { RESULTS.push(['FAIL', label, detail]); console.error('  ✘ FAIL  ' + label + (detail ? ' — ' + detail : '')) }
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** 简易 ws 会话客户端（与 integration.mjs 同形，只保留本脚本要用的部分）。 */
function openSession(port) {
  const client = new WebSocket(`ws://127.0.0.1:${port}/api/dsh-tty/ws`)
  client.setMaxListeners(0)
  const state = { frames: [], text: '', ready: null, exited: null, errors: [], waiters: [], closed: false }
  client.on('message', (raw) => {
    const msg = JSON.parse(raw.toString())
    state.frames.push(msg)
    if (msg.t === 'data') state.text += String(msg.d ?? '')
    if (msg.t === 'ready') state.ready = msg
    if (msg.t === 'exit') state.exited = { sid: msg.sid, code: msg.code, signal: msg.signal }
    if (msg.t === 'error') state.errors.push(String(msg.m ?? ''))
    for (const w of [...state.waiters]) w()
  })
  client.on('close', () => {
    state.closed = true
    for (const w of [...state.waiters]) w()
  })
  const waitFor = async (pred, timeoutMs = 15000, label = '条件') => {
    const start = Date.now()
    while (!pred()) {
      if (Date.now() - start > timeoutMs) {
        const details = [`已收文本: ${JSON.stringify(state.text.slice(-300))}`]
        if (state.errors.length > 0) details.push(`error 帧: ${JSON.stringify(state.errors.slice(-3))}`)
        if (state.exited !== null) details.push(`进程已退出: ${JSON.stringify(state.exited)}`)
        throw new Error(`等待${label}超时（${details.join('；')}）`)
      }
      await Promise.race([new Promise((resolve) => state.waiters.push(resolve)), sleep(200)])
    }
  }
  const open = async () => {
    const start = Date.now()
    let lastError = ''
    while (client.readyState !== WebSocket.OPEN) {
      if (Date.now() - start > 10000) throw new Error('ws 连接超时：' + (lastError || '无错误事件'))
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, 100)
        client.once('open', () => { clearTimeout(timer); resolve() })
        client.once('error', (error) => { lastError = error.message })
        client.once('close', () => { clearTimeout(timer); resolve() })
      })
    }
  }
  return { client, state, waitFor, open }
}

/** ConPTY 里按 Enter 是 \r（顺带补 \n 兼容两种翻译），cmd 才会执行。 */
const ENTER = '\r\n'

async function run() {
  const app = new Context()
  const wsFiber = app.plugin(WebServerRuntime, { host: '127.0.0.1', port: 0 })
  const subFiber = app.plugin(LocalSubprocessRuntime)
  const stubFiber = app.plugin({
    name: 'windows-smoke-stub',
    apply: (ctx) => {
      // DSH ≥0.1.7 的 settings 服务（SettingsForms）：describe / update / configure。
      // 本用例不测配置持久化，空 describe 即可（插件的 settings effect 拿到空值）。
      ctx.provide('settings', { describe: () => [], update: async () => {}, configure: () => () => {} })
      ctx.provide('tools', { register: () => () => {} })
    },
  })
  await stubFiber.await()
  const pluginFiber = app.plugin({ name, inject, apply }, { maxSessions: 2, term: 'xterm-256color', colorTerm: 'truecolor' })
  await wsFiber.await()
  await subFiber.await()
  await pluginFiber.await()
  const port = app.webServer.port
  console.log(`webServer on 127.0.0.1:${port}，插件已挂载`)
  await sleep(400) // 等 ctx.inject(['webServer']) 回调完成路由注册

  // W1：spawn → ready（默认 shell 必须是 %COMSPEC%，且真的起来了）
  console.log('\n[W1] spawn → ready（默认 shell = %COMSPEC%）')
  const s = openSession(port)
  await s.open()
  s.client.send(JSON.stringify({ t: 'spawn', cols: 100, rows: 30 }))
  try {
    await s.waitFor(() => s.state.ready !== null, 20000, 'ready')
    const pid = s.state.ready.pid
    // ConPTY 不给本机 pid：Windows 上 node-pty 的 pid 恒为 0（首个 CI 跑就是被这条
    // 断言卡的，而 W2/W3 早已证明会话真的活着）。所以这里只要求「是数字且非负」，
    // 会话是否真跑起来交给 W2/W3 的输出断言。
    if (typeof pid === 'number' && pid >= 0) pass(`W1 spawn → ready（pid=${pid}${pid === 0 ? '（ConPTY 不暴露本机 pid）' : ''}）`)
    else fail('W1 spawn → ready', `ready 帧的 pid 不是数字：${JSON.stringify(s.state.ready)}`)
  } catch (error) {
    fail('W1 spawn → ready', error.message)
  }

  // W2：跑起来的是 %COMSPEC%（cmd.exe），不是 POSIX 包装层
  console.log('\n[W2] 输入回显：跑起来的是 cmd.exe')
  try {
    s.client.send(JSON.stringify({ t: 'input', d: `echo IT_SHELL_%COMSPEC%${ENTER}` }))
    await s.waitFor(() => /IT_SHELL_.*cmd\.exe/i.test(s.state.text), 15000, 'cmd.exe 回显')
    pass('W2 %COMSPEC% 生效（cmd.exe 在跑，说明没有 POSIX 包装层把命令吃掉）')
  } catch (error) {
    fail('W2 %COMSPEC% 生效', error.message)
  }

  // W3：命令真的被执行（不是只回显了输入）——靠 %OS% 展开证明
  console.log('\n[W3] 命令执行（%OS% 由 shell 展开）')
  try {
    s.client.send(JSON.stringify({ t: 'input', d: `echo IT_WIN_%OS%${ENTER}` }))
    await s.waitFor(() => /IT_WIN_Windows_NT/.test(s.state.text), 15000, '%OS% 展开')
    pass('W3 命令执行生效（IT_WIN_Windows_NT —— %OS% 由 cmd 展开，回显里只有 %OS% 字面量）')
  } catch (error) {
    fail('W3 命令执行生效', error.message)
  }

  // W4：kill 帧 → exit，会话名额释放
  console.log('\n[W4] kill → exit')
  try {
    s.client.send(JSON.stringify({ t: 'kill' }))
    await s.waitFor(() => s.state.exited !== null, 15000, 'exit 帧')
    pass('W4 kill 帧结束会话（收到 exit）')
  } catch (error) {
    fail('W4 kill 帧结束会话', error.message)
  }
  try { s.client.close() } catch { /* 已关闭 */ }

  // W5：kill 之后还能再开一个（名额与清理都正确）
  console.log('\n[W5] kill 后重新 spawn')
  const s2 = openSession(port)
  try {
    await s2.open()
    s2.client.send(JSON.stringify({ t: 'spawn', cols: 80, rows: 24 }))
    await s2.waitFor(() => s2.state.ready !== null, 20000, '第二次 ready')
    pass('W5 kill 后可重新 spawn（会话清理与名额释放正确）')
    s2.client.send(JSON.stringify({ t: 'kill' }))
    await s2.waitFor(() => s2.state.exited !== null, 15000, '第二次 exit')
  } catch (error) {
    fail('W5 kill 后可重新 spawn', error.message)
  }
  try { s2.client.close() } catch { /* 已关闭 */ }
}

await run()
const failed = RESULTS.filter((row) => row[0] === 'FAIL')
console.log('\n==== Windows 冒烟：' + String(RESULTS.length - failed.length) + '/' + String(RESULTS.length) + ' PASS ====')
for (const row of failed) console.error('  ✘ ' + row[1] + (row[2] ? ' — ' + row[2] : ''))
clearTimeout(watchdog)
process.exit(failed.length === 0 ? 0 : 1)
