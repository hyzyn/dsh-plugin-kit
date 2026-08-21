#!/usr/bin/env node
/**
 * @hyzyn/dsh-tty — M1 集成测试：把构建后的真实插件（lib/index.js）加载进
 * 真实 DSH 服务组合（dsh-host-webserver + dsh-subprocess-local），模拟浏览器
 * 半体用 ws 客户端完整走一遍协议，并验证边界：
 *   B1. spawn → ready → data（输入回显）→ kill → exit 全链路
 *   B2. resize 帧生效（stty size 校验）
 *   B3. 单会话约束：同连接二次 spawn 报「会话已存在」
 *   B4. maxSessions 上限：第二连接 spawn 报「会话数已达上限」
 *   B5. loopback 围栏：伪造 Host 的 upgrade 请求被拒
 *   B6. TERM 注入（-c 包装层）生效
 *
 * 用法：pnpm --filter @hyzyn/dsh-tty integration
 * 退出码：0 = 全部 PASS，1 = 任一 FAIL。
 */
import { Context } from '@deepseek-ai/cordis'
import WebServerRuntime from '@deepseek-ai/dsh-host-webserver'
import { LocalSubprocessRuntime } from '@deepseek-ai/dsh-subprocess-local'
import WebSocket from 'ws'
import { name, inject, apply } from '../lib/index.js'


/* 全局看门狗：任何环节卡死时留痕退出（正常路径会先 process.exit）。 */
setTimeout(() => {
  console.error('[watchdog] 120s 看门狗触发：集成测试卡死')
  process.exit(2)
}, 120000).unref()
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason)
})

const RESULTS = []
function pass(name) { RESULTS.push(['PASS', name]); console.log('  ✔ PASS  ' + name) }
function fail(name, detail) { RESULTS.push(['FAIL', name, detail]); console.error('  ✘ FAIL  ' + name + (detail ? ' — ' + detail : '')) }
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** 简易 ws 会话客户端：收集 data 帧文本，提供 send 与等待匹配。 */
function openSession(port, headers) {
  const client = new WebSocket(`ws://127.0.0.1:${port}/api/dsh-tty/ws`, { headers })
  client.setMaxListeners(0) // 测试里多次重连会反复挂 once 监听，避免告警
  const state = {
    frames: [],
    text: '',
    ready: false,
    exited: null,
    errors: [],
    closed: false,
    waiters: [],
  }
  client.on('message', (raw) => {
    const msg = JSON.parse(raw.toString())
    state.frames.push(msg)
    if (msg.t === 'data') state.text += String(msg.d ?? '')
    if (msg.t === 'ready') state.ready = true
    if (msg.t === 'exit') state.exited = { code: msg.code, signal: msg.signame ?? msg.signal }
    if (msg.t === 'error') state.errors.push(String(msg.m ?? ''))
    for (const w of [...state.waiters]) w()
  })
  client.on('close', () => {
    state.closed = true
    for (const w of [...state.waiters]) w()
  })
  const waitFor = async (pred, timeoutMs = 12000, label = '条件') => {
    const start = Date.now()
    while (!pred()) {
      if (Date.now() - start > timeoutMs) throw new Error(`等待${label}超时；已收文本: ${JSON.stringify(state.text.slice(-200))}`)
      await Promise.race([
        new Promise((resolve) => state.waiters.push(resolve)),
        sleep(200),
      ])
    }
  }
  const open = async () => {
    const start = Date.now()
    let lastError = ''
    while (client.readyState !== WebSocket.OPEN) {
      if (Date.now() - start > 10000) throw new Error('ws 连接超时：' + (lastError || '无错误事件') + '（可能 upgrade 路由未就绪）')
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

async function run() {
  const app = new Context()
  const wsFiber = app.plugin(WebServerRuntime, { host: '127.0.0.1', port: 0 })
  const subFiber = app.plugin(LocalSubprocessRuntime)
  const pluginFiber = app.plugin({ name, inject, apply }, { maxSessions: 1, term: 'xterm-256color', colorTerm: 'truecolor' })
  await wsFiber.await()
  await subFiber.await()
  await pluginFiber.await()
  const port = app.webServer.port
  console.log(`webServer on 127.0.0.1:${port}，插件已挂载`)
  await sleep(400) // 等 ctx.inject(['webServer']) 回调完成路由注册

  // B1 + B6: 全链路 + TERM
  console.log('\n[1] 全链路（spawn→data→kill→exit）与 TERM 注入')
  {
    const s = openSession(port)
    await s.open()
    s.client.send(JSON.stringify({ t: 'spawn', cols: 80, rows: 24 }))
    await s.waitFor(() => s.state.ready, 10000, 'ready')
    s.client.send(JSON.stringify({ t: 'input', d: 'printf "IT_TERM_%s\\n" "$TERM"\n' }))
    await s.waitFor(() => /IT_TERM_xterm-256color/.test(s.state.text), 10000, 'TERM 输出')
    pass('B6 TERM 注入生效（xterm-256color）')
    s.client.send(JSON.stringify({ t: 'input', d: 'printf "IT_READY_%s\\n" OK\n' }))
    await s.waitFor(() => /IT_READY_OK/.test(s.state.text), 10000, '回显')
    pass('B1a spawn→data 全链路（输入回显可见）')
    s.client.send(JSON.stringify({ t: 'kill' }))
    await s.waitFor(() => s.state.exited !== null, 10000, 'exit 帧')
    pass('B1b kill→exit 帧（code=' + s.state.exited.code + ' signal=' + s.state.exited.signal + '）')
    s.client.close()
  }

  // B2: resize
  console.log('\n[2] resize 帧')
  {
    const s = openSession(port)
    await s.open()
    s.client.send(JSON.stringify({ t: 'spawn', cols: 80, rows: 24 }))
    await s.waitFor(() => s.state.ready, 10000, 'ready')
    s.client.send(JSON.stringify({ t: 'input', d: 'stty size\n' }))
    await s.waitFor(() => /^\d+ \d+$/m.test(s.state.text), 10000, '初始尺寸')
    const before = s.state.text.match(/^(\d+) (\d+)$/m)
    s.client.send(JSON.stringify({ t: 'resize', cols: 110, rows: 33 }))
    await sleep(400)
    s.client.send(JSON.stringify({ t: 'input', d: 'stty size\n' }))
    const after = await new Promise((resolve, reject) => {
      const start = Date.now()
      const check = () => {
        const matches = [...s.state.text.matchAll(/^(\d+) (\d+)$/gm)]
        const last = matches[matches.length - 1]
        if (last !== undefined && last.index !== before.index) return resolve(last)
        if (Date.now() - start > 10000) return reject(new Error('resize 后 stty size 超时'))
        setTimeout(check, 50)
      }
      check()
    })
    const ok = Number(after[1]) === 33 && Number(after[2]) === 110
    console.log(`    before=${before[1]}x${before[2]} after=${after[1]}x${after[2]}（期望 33x110）`)
    if (ok) pass('B2 resize 帧生效')
    else fail('B2 resize 帧生效', `${after[1]}x${after[2]}`)
    s.client.send(JSON.stringify({ t: 'kill' }))
    await s.waitFor(() => s.state.exited !== null, 10000, 'exit')
    s.client.close()
  }

  // B3: 单会话约束
  console.log('\n[3] 单会话约束')
  {
    const s = openSession(port)
    await s.open()
    s.client.send(JSON.stringify({ t: 'spawn' }))
    await s.waitFor(() => s.state.ready, 10000, 'ready')
    s.client.send(JSON.stringify({ t: 'spawn' }))
    await s.waitFor(() => s.state.errors.length > 0, 10000, '重复 spawn 错误')
    if (/会话已存在/.test(s.state.errors[0])) pass('B3 同连接二次 spawn 被拒')
    else fail('B3 同连接二次 spawn 被拒', s.state.errors[0])
    s.client.send(JSON.stringify({ t: 'kill' }))
    await s.waitFor(() => s.state.exited !== null, 10000, 'exit')
    s.client.close()
  }

  // B4: maxSessions 上限（跨连接）
  console.log('\n[4] maxSessions 上限')
  {
    const s1 = openSession(port)
    await s1.open()
    s1.client.send(JSON.stringify({ t: 'spawn' }))
    await s1.waitFor(() => s1.state.ready, 10000, 's1 ready')
    const s2 = openSession(port)
    await s2.open()
    s2.client.send(JSON.stringify({ t: 'spawn' }))
    await s2.waitFor(() => s2.state.errors.length > 0, 10000, 's2 上限错误')
    if (/会话数已达上限/.test(s2.state.errors[0])) pass('B4 maxSessions=1 生效（第二连接被拒）')
    else fail('B4 maxSessions=1 生效（第二连接被拒）', s2.state.errors[0])
    s2.client.close()
    s1.client.send(JSON.stringify({ t: 'kill' }))
    await s1.waitFor(() => s1.state.exited !== null, 10000, 's1 exit')
    s1.client.close()
  }

  // B5: loopback 围栏
  console.log('\n[5] loopback 围栏')
  {
    const s = openSession(port, { Host: 'attacker.example.com' })
    let outcome
    try {
      await s.open()
      outcome = 'open'
    } catch {
      outcome = s.client.readyState === WebSocket.CLOSED ? 'rejected' : 'other'
    }
    if (outcome === 'rejected') pass('B5 伪造 Host 的 upgrade 被拒')
    else fail('B5 伪造 Host 的 upgrade 被拒', '连接意外建立（' + outcome + '）')
    try { s.client.terminate() } catch { /* 忽略 */ }
  }

  const failed = RESULTS.filter(([kind]) => kind === 'FAIL')
  console.log(`\n==== 集成测试：${RESULTS.length - failed.length}/${RESULTS.length} PASS ====`)
  for (const [kind, name, detail] of RESULTS) console.log(`  ${kind === 'PASS' ? '✔' : '✘'} ${name}${detail ? ' — ' + detail : ''}`)
  process.exit(failed.length > 0 ? 1 : 0)
}

run().catch((error) => {
  console.error('集成测试崩溃：', error)
  process.exit(1)
})
