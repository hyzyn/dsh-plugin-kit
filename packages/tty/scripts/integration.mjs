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
import { assertSupportedJsonSchema } from '@deepseek-ai/dsh-tools'


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
    if (msg.t === 'exit') state.exited = { sid: msg.sid, code: msg.code, signal: msg.signal }
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
  // 最小 settings 服务 stub：让插件的 settings 注入回调触发，并可手动派发
  // settings/updated 事件（与 dsh-settings 的 dispatch 方式一致）来测配置热生效。
  const toolDefs = []
  const stubFiber = app.plugin({
    name: 'settings-stub',
    apply: (ctx) => {
      ctx.provide('settings', { register: () => ({ get: () => ({}), update: async () => {} }) })
      ctx.provide('tools', {
        register: (definition) => {
          toolDefs.push(definition)
          return () => {}
        },
      })
    },
  })
  await stubFiber.await()
  const emitSettingsUpdated = (ns, next) => {
    const args = ['settings/updated', ns, next, {}, 'test']
    for (const cb of app.events.dispatch('emit', args)) cb(...args)
  }
  const pluginFiber = app.plugin({ name, inject, apply }, { maxSessions: 2, term: 'xterm-256color', colorTerm: 'truecolor' })
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

  // B3: sid 冲突约束（v2：同连接多会话，同 sid 才拒绝）
  console.log('\n[3] sid 冲突约束')
  {
    const s = openSession(port)
    await s.open()
    s.client.send(JSON.stringify({ t: 'spawn', sid: 'tab-a' }))
    await s.waitFor(() => s.state.ready, 10000, 'ready')
    s.client.send(JSON.stringify({ t: 'spawn', sid: 'tab-a' }))
    await s.waitFor(() => s.state.errors.length > 0, 10000, '重复 sid 错误')
    if (/sid 已存在/.test(s.state.errors[0])) pass('B3 同 sid 二次 spawn 被拒')
    else fail('B3 同 sid 二次 spawn 被拒', s.state.errors[0])
    s.client.send(JSON.stringify({ t: 'kill', sid: 'tab-a' }))
    await s.waitFor(() => s.state.exited !== null, 10000, 'exit')
    s.client.close()
  }

  // B4: maxSessions 上限（跨连接）
  console.log('\n[4] maxSessions 上限')
  {
    const s1 = openSession(port)
    await s1.open()
    s1.client.send(JSON.stringify({ t: 'spawn', sid: 's1' }))
    await s1.waitFor(() => s1.state.ready, 10000, 's1 ready')
    const s2 = openSession(port)
    await s2.open()
    s2.client.send(JSON.stringify({ t: 'spawn', sid: 's2' }))
    await s2.waitFor(() => s2.state.ready, 10000, 's2 ready')
    const s3 = openSession(port)
    await s3.open()
    s3.client.send(JSON.stringify({ t: 'spawn', sid: 's3' }))
    await s3.waitFor(() => s3.state.errors.length > 0, 10000, 's3 上限错误')
    if (/会话数已达上限/.test(s3.state.errors[0])) pass('B4 maxSessions=2 生效（第三连接被拒）')
    else fail('B4 maxSessions=2 生效（第三连接被拒）', s3.state.errors[0])
    s3.client.close()
    s2.client.send(JSON.stringify({ t: 'kill', sid: 's2' }))
    await s2.waitFor(() => s2.state.exited !== null, 10000, 's2 exit')
    s2.client.close()
    s1.client.send(JSON.stringify({ t: 'kill', sid: 's1' }))
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

  // B7: 单连接多会话（共存、数据隔离、单独 kill）
  console.log('\n[6] 单连接多会话')
  {
    const s = openSession(port)
    await s.open()
    s.client.send(JSON.stringify({ t: 'spawn', sid: 'tab-1' }))
    await s.waitFor(() => s.state.ready, 10000, 'tab-1 ready')
    s.state.ready = false
    s.client.send(JSON.stringify({ t: 'spawn', sid: 'tab-2' }))
    await s.waitFor(() => s.state.ready, 10000, 'tab-2 ready')
    s.client.send(JSON.stringify({ t: 'input', sid: 'tab-1', d: 'printf "TAB1_%s\\n" OK\n' }))
    await s.waitFor(() => /TAB1_OK/.test(s.state.text), 10000, 'tab-1 回显')
    s.client.send(JSON.stringify({ t: 'input', sid: 'tab-2', d: 'printf "TAB2_%s\\n" OK\n' }))
    await s.waitFor(() => /TAB2_OK/.test(s.state.text), 10000, 'tab-2 回显')
    s.client.send(JSON.stringify({ t: 'kill', sid: 'tab-1' }))
    await s.waitFor(() => s.state.exited !== null && s.state.exited.sid === 'tab-1', 10000, 'tab-1 exit（带 sid）')
    s.client.send(JSON.stringify({ t: 'input', sid: 'tab-2', d: 'printf "TAB2_%s\\n" STILL\n' }))
    await s.waitFor(() => /TAB2_STILL/.test(s.state.text), 10000, 'tab-2 仍可用')
    // 竞态回归：对已删除 sid 发 input/resize 应静默忽略（无错误帧）
    const errorsBefore = s.state.errors.length
    s.client.send(JSON.stringify({ t: 'input', sid: 'tab-1', d: 'echo ghost\n' }))
    s.client.send(JSON.stringify({ t: 'resize', sid: 'tab-1', cols: 90, rows: 20 }))
    await sleep(600)
    if (s.state.errors.length === errorsBefore) pass('B7b 已删除 sid 的 input/resize 静默忽略（无错误帧）')
    else fail('B7b 已删除 sid 的 input/resize 静默忽略（无错误帧）', JSON.stringify(s.state.errors.slice(errorsBefore)))
    pass('B7 单连接多会话：双 tab 共存、数据隔离、单独 kill 后另一 tab 存活')
    s.client.send(JSON.stringify({ t: 'kill', sid: 'tab-2' }))
    await s.waitFor(() => s.state.exited !== null && s.state.exited.sid === 'tab-2', 10000, 'tab-2 exit')
    s.client.close()
  }

  // B8: cwd 跟随与校验
  console.log('\n[7] cwd 跟随与校验')
  {
    const s = openSession(port)
    await s.open()
    s.client.send(JSON.stringify({ t: 'spawn', sid: 'cwd-tab', cwd: '/tmp' }))
    await s.waitFor(() => s.state.ready, 10000, 'ready')
    s.client.send(JSON.stringify({ t: 'input', sid: 'cwd-tab', d: 'pwd\n' }))
    await s.waitFor(() => s.state.text.includes('/tmp'), 10000, 'pwd 输出')
    pass('B8 spawn 携带 cwd 生效（pwd=/tmp）')
    s.client.send(JSON.stringify({ t: 'spawn', sid: 'bad-cwd', cwd: '/nonexistent-dir-xyz' }))
    await s.waitFor(() => s.state.errors.some((m) => /cwd 不存在/.test(m)), 10000, 'cwd 错误')
    pass('B8b 不存在的 cwd 被拒')
    s.client.send(JSON.stringify({ t: 'kill', sid: 'cwd-tab' }))
    await s.waitFor(() => s.state.exited !== null, 10000, 'exit')
    s.client.close()
  }

  // B9: 配置热生效（settings/updated → LiveConfig / maxSessions）
  console.log('\n[8] 配置热生效')
  {
    const s = openSession(port)
    await s.open()
    emitSettingsUpdated('tty', { shell: '', term: 'xterm-256color', colorTerm: 'truecolor', cwd: '/tmp', maxSessions: 1 })
    await sleep(300)
    s.client.send(JSON.stringify({ t: 'spawn', sid: 'hot' })) // 不带 cwd → 应落到热改后的 /tmp
    await s.waitFor(() => s.state.ready, 10000, 'ready')
    s.client.send(JSON.stringify({ t: 'input', sid: 'hot', d: 'pwd\n' }))
    await s.waitFor(() => s.state.text.includes('/tmp'), 10000, 'pwd=/tmp')
    pass('B9 配置热生效：cwd 动态更新后新会话生效（pwd=/tmp）')
    const s2 = openSession(port)
    await s2.open()
    s2.client.send(JSON.stringify({ t: 'spawn', sid: 's2' }))
    await s2.waitFor(() => s2.state.errors.length > 0, 10000, 's2 上限错误')
    if (/会话数已达上限/.test(s2.state.errors[0])) pass('B9b maxSessions 热改生效（上限降为 1）')
    else fail('B9b maxSessions 热改生效（上限降为 1）', s2.state.errors[0])
    s2.client.close()
    s.client.send(JSON.stringify({ t: 'kill', sid: 'hot' }))
    await s.waitFor(() => s.state.exited !== null, 10000, 'exit')
    s.client.close()
  }

  // B10: /api/dsh-tty/config 读写 API
  console.log('\n[9] 配置 API')
  {
    const base = `http://127.0.0.1:${port}/api/dsh-tty/config`
    const res1 = await fetch(base)
    const d1 = await res1.json().catch(() => ({}))
    if (res1.status === 200 && d1.ok === true && typeof d1.config?.shell === 'string') pass('B10a GET 当前配置')
    else fail('B10a GET 当前配置', res1.status + ' ' + JSON.stringify(d1))
    const res2 = await fetch(base, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ maxSessions: 3, term: 'xterm-256color' }) })
    const d2 = await res2.json().catch(() => ({}))
    if (res2.status === 200 && d2.ok === true && d2.config?.maxSessions === 3) pass('B10b POST 配置生效（maxSessions=3）')
    else fail('B10b POST 配置生效（maxSessions=3）', res2.status + ' ' + JSON.stringify(d2))
    const res3 = await fetch(base, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ maxSessions: 99 }) })
    const d3 = await res3.json().catch(() => ({}))
    if (res3.status === 400 && /maxSessions/.test(String(d3.error ?? ''))) pass('B10c 非法 maxSessions 被拒')
    else fail('B10c 非法 maxSessions 被拒', res3.status + ' ' + JSON.stringify(d3))
  }

  // B11: 超限被拒后的恢复（用户场景：kill 一个会话后新 spawn 必须成功）
  console.log('\n[10] 超限恢复')
  {
    const base = `http://127.0.0.1:${port}/api/dsh-tty/config`
    await fetch(base, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ maxSessions: 2 }) })
    await sleep(200)
    const s1 = openSession(port)
    await s1.open()
    s1.client.send(JSON.stringify({ t: 'spawn', sid: 'x1' }))
    await s1.waitFor(() => s1.state.ready, 10000, 'x1 ready')
    const s2 = openSession(port)
    await s2.open()
    s2.client.send(JSON.stringify({ t: 'spawn', sid: 'x2' }))
    await s2.waitFor(() => s2.state.ready, 10000, 'x2 ready')
    const s3 = openSession(port)
    await s3.open()
    s3.client.send(JSON.stringify({ t: 'spawn', sid: 'x3' }))
    await s3.waitFor(() => s3.state.errors.length > 0, 10000, 'x3 被拒')
    if (/会话数已达上限/.test(s3.state.errors[0])) pass('B11a 超限拒绝（cap=2 第三个被拒）')
    else fail('B11a 超限拒绝（cap=2 第三个被拒）', s3.state.errors[0])
    s1.client.send(JSON.stringify({ t: 'kill', sid: 'x1' }))
    await s1.waitFor(() => s1.state.exited !== null, 10000, 'x1 exit')
    s3.client.send(JSON.stringify({ t: 'spawn', sid: 'x3b' }))
    await s3.waitFor(() => s3.state.ready, 10000, 'x3b ready')
    pass('B11b 释放名额后新 spawn 成功')
    s2.client.send(JSON.stringify({ t: 'kill', sid: 'x2' }))
    await s2.waitFor(() => s2.state.exited !== null, 10000, 'x2 exit')
    s3.client.send(JSON.stringify({ t: 'kill', sid: 'x3b' }))
    await s3.waitFor(() => s3.state.exited !== null, 10000, 'x3b exit')
    s1.client.close()
    s2.client.close()
    s3.client.close()
    await fetch(base, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ maxSessions: 4 }) })
  }

  // B12: agent 工具集（tty_list / tty_capture / tty_send）
  console.log('\n[11] agent 工具集')
  {
    const s = openSession(port)
    await s.open()
    s.client.send(JSON.stringify({ t: 'spawn', sid: 't12' }))
    await s.waitFor(() => s.state.ready, 10000, 't12 ready')
    const list = toolDefs.find((d) => d.name === 'tty_list')
    const capture = toolDefs.find((d) => d.name === 'tty_capture')
    const send = toolDefs.find((d) => d.name === 'tty_send')
    if (list === undefined || capture === undefined || send === undefined) {
      fail('B12 agent 工具集', '工具未注册: ' + toolDefs.map((d) => d.name).join(','))
    } else {
      // 真实宿主同样的校验（注册时 assertSupportedJsonSchema）
      let schemaOk = true
      for (const d of toolDefs.filter((x) => x.name.startsWith('tty_'))) {
        try {
          assertSupportedJsonSchema(d.parameters)
          assertSupportedJsonSchema(d.output?.schema ?? {})
        } catch (e) {
          schemaOk = false
          fail('B12e 工具 schema 通过 DSH 校验', d.name + ': ' + String(e && e.message ? e.message : e))
        }
      }
      if (schemaOk) pass('B12e 工具 schema 通过 DSH 校验（assertSupportedJsonSchema）')
      const listed = await list.execute({})
      if (Array.isArray(listed.sessions) && listed.sessions.some((x) => x.sid === 't12')) pass('B12a tty_list 列出活跃会话')
      else fail('B12a tty_list 列出活跃会话', JSON.stringify(listed))
      const sent = await send.execute({ sid: 't12', data: 'printf "CAPTURE_%s\\n" OK\n' })
      if (sent.ok === true && sent.sent > 0) pass('B12b tty_send 发送输入')
      else fail('B12b tty_send 发送输入', JSON.stringify(sent))
      await sleep(600)
      // shell 执行有延迟（.zshrc 启动），轮询等待标记出现在输出缓冲
      let captured = null
      for (let i = 0; i < 16; i++) {
        await sleep(250)
        captured = await capture.execute({ sid: 't12', lines: 20 })
        if (typeof captured.tail === 'string' && captured.tail.includes('CAPTURE_OK')) break
      }
      if (captured !== null && typeof captured.tail === 'string' && captured.tail.includes('CAPTURE_OK')) pass('B12c tty_capture 读到会话输出')
      else fail('B12c tty_capture 读到会话输出', JSON.stringify(captured === null ? null : captured.tail).slice(0, 120))
      let rejected = false
      try {
        await capture.execute({ sid: 'ghost-session' })
      } catch {
        rejected = true
      }
      if (rejected) pass('B12d 不存在的 sid 调用工具被拒')
      else fail('B12d 不存在的 sid 调用工具被拒', '未抛错')
    }
    s.client.send(JSON.stringify({ t: 'kill', sid: 't12' }))
    await s.waitFor(() => s.state.exited !== null, 10000, 't12 exit')
    s.client.close()
  }

  // B13: 断线保活与重连（sessions/attach 帧，协议 v3）
  console.log('\n[12] 断线保活与重连')
  {
    const s1 = openSession(port)
    await s1.open()
    s1.client.send(JSON.stringify({ t: 'spawn', sid: 're-1' }))
    await s1.waitFor(() => s1.state.ready, 10000, 're-1 ready')
    s1.client.send(JSON.stringify({ t: 'input', sid: 're-1', d: 'printf "REPLAY_%s\\n" MARK\n' }))
    await s1.waitFor(() => /REPLAY_MARK/.test(s1.state.text), 10000, '回放标记输出')
    // 不 kill 直接断开 = 异常断开：会话应转孤儿保活（默认 reconnectGraceSec=120）
    s1.client.close()
    await sleep(400)
    const s2 = openSession(port)
    await s2.open()
    s2.client.send(JSON.stringify({ t: 'sessions' }))
    await s2.waitFor(() => s2.state.frames.some((f) => f.t === 'sessions'), 10000, 'sessions 帧')
    const sessionsFrame = s2.state.frames.find((f) => f.t === 'sessions')
    const entry = (sessionsFrame?.list ?? []).find((x) => x.sid === 're-1')
    if (entry !== undefined && entry.attachable === true) pass('B13a 异常断开后会话保活且 attachable')
    else fail('B13a 异常断开后会话保活且 attachable', JSON.stringify(sessionsFrame))
    // attach → ready（reattached:true）→ data 帧回放断线前输出
    s2.client.send(JSON.stringify({ t: 'attach', sid: 're-1' }))
    await s2.waitFor(() => s2.state.frames.some((f) => f.t === 'ready' && f.sid === 're-1'), 10000, 'attach ready')
    if (s2.state.frames.some((f) => f.t === 'ready' && f.sid === 're-1' && f.reattached === true)) pass('B13b attach 成功（ready.reattached）')
    else fail('B13b attach 成功（ready.reattached）', '缺 reattached 标记')
    await s2.waitFor(() => /REPLAY_MARK/.test(s2.state.text), 10000, '缓冲回放')
    pass('B13c attach 后回放断线前输出（REPLAY_MARK）')
    s2.client.send(JSON.stringify({ t: 'input', sid: 're-1', d: 'printf "AFTER_%s\\n" ATTACH\n' }))
    await s2.waitFor(() => /AFTER_ATTACH/.test(s2.state.text), 10000, 'attach 后输入')
    pass('B13d attach 后会话继续交互')
    // 已连接会话的重复 attach 被拒（防多窗口抢绑）
    const errorsBefore = s2.state.errors.length
    s2.client.send(JSON.stringify({ t: 'attach', sid: 're-1' }))
    await s2.waitFor(() => s2.state.errors.length > errorsBefore, 10000, '重复 attach 错误')
    if (/已连接/.test(s2.state.errors[s2.state.errors.length - 1])) pass('B13e 已连接会话的重复 attach 被拒')
    else fail('B13e 已连接会话的重复 attach 被拒', s2.state.errors[s2.state.errors.length - 1])
    s2.client.send(JSON.stringify({ t: 'kill', sid: 're-1' }))
    await s2.waitFor(() => s2.state.exited !== null && s2.state.exited.sid === 're-1', 10000, 're-1 exit')
    s2.client.close()
  }

  // B14: tty_screen 虚拟屏 + tty_capture ANSI 清洗
  console.log('\n[13] tty_screen 与 tty_capture 清洗')
  {
    const s = openSession(port)
    await s.open()
    s.client.send(JSON.stringify({ t: 'spawn', sid: 'screen-1' }))
    await s.waitFor(() => s.state.ready, 10000, 'screen-1 ready')
    const screenTool = toolDefs.find((d) => d.name === 'tty_screen')
    const capture = toolDefs.find((d) => d.name === 'tty_capture')
    if (screenTool === undefined || capture === undefined) {
      fail('B14 工具注册', '缺工具: ' + toolDefs.map((d) => d.name).join(','))
    } else {
      s.client.send(JSON.stringify({ t: 'input', sid: 'screen-1', d: 'printf "SCREEN_%s\\n" OK\n' }))
      await s.waitFor(() => /SCREEN_OK/.test(s.state.text), 10000, '屏幕标记输出')
      // tty_screen：虚拟屏渲染的可见屏幕应包含标记（等价用户此刻看到的画面）
      let shot = null
      for (let i = 0; i < 16; i++) {
        await sleep(250)
        shot = await screenTool.execute({ sid: 'screen-1' })
        if (typeof shot?.text === 'string' && shot.text.includes('SCREEN_OK')) break
      }
      if (shot !== null && typeof shot.text === 'string' && shot.text.includes('SCREEN_OK')) pass('B14a tty_screen 虚拟屏渲染可见屏幕（SCREEN_OK）')
      else fail('B14a tty_screen 虚拟屏渲染可见屏幕（SCREEN_OK）', JSON.stringify(shot === null ? null : shot.text).slice(0, 120))
      // tty_capture：默认清洗后尾部应为纯文本（无 ESC 转义）且包含标记
      let cap = null
      for (let i = 0; i < 16; i++) {
        await sleep(250)
        cap = await capture.execute({ sid: 'screen-1', lines: 80 })
        if (typeof cap.tail === 'string' && cap.tail.includes('SCREEN_OK')) break
      }
      const cleanOk = cap !== null && typeof cap.tail === 'string' && cap.tail.includes('SCREEN_OK') && !/\x1b/.test(cap.tail)
      if (cleanOk) pass('B14b tty_capture 默认清洗 ANSI（尾部为纯文本且含标记）')
      else fail('B14b tty_capture 默认清洗 ANSI（尾部为纯文本且含标记）', JSON.stringify(cap === null ? null : cap.tail).slice(0, 120))
    }
    s.client.send(JSON.stringify({ t: 'kill', sid: 'screen-1' }))
    await s.waitFor(() => s.state.exited !== null, 10000, 'screen-1 exit')
    s.client.close()
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
