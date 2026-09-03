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
 *   B7. 单连接多会话：共存、数据隔离、单独 kill
 *   B8. cwd 跟随与校验
 *   B9. 配置热生效（settings/updated）
 *   B10. /api/dsh-tty/config 读写 API
 *   B11. 超限被拒后的恢复
 *   B12. agent 工具集（tty_list / tty_capture / tty_screen / tty_expect / tty_send）
 *   B13. 断线保活与重连（sessions/attach 帧，协议 v3）
 *   B14. tty_screen 虚拟屏 + tty_capture ANSI 清洗
 *   B15. shell 集成（OSC 133 命令捕获/退出码 + OSC 7 cwd 跟随）
 *   B16. ~/.ssh/config 解析器
 *   B17. tty_expect 匹配与超时
 *   B18. data 帧合并后帧序不变量（exit 在最后一帧 data 之后）
 *   B19. known_hosts 解析器
 *   B20. 端口转发隧道（forwardOut 往返 + forwardIn 就绪 + 状态与工具）
 *   B21. /api/dsh-tty/shells 候选列表（Shell 路径可选可输入的数据源）
 *   B22. bash 3.2（无 PS0）shell 集成：DEBUG trap 兜底 B 标记（capture{last} + expect 早停）
 *   B23. SFTP 文件传输（/api/dsh-tty/sftp/* 路由：list/mkdir/upload/download/remove
 *        + agent 工具 sftp_list/sftp_read/sftp_write，test-sshd 内存 sshd）
 *   B24. SFTP 管理闭环（agent sftp_mkdir/sftp_rename/sftp_remove/sftp_tree：
 *        mkdir -p、tree 限深截断、跨目录 rename、非空删除拒绝与递归删除）
 *
 * 用法：pnpm --filter @hyzyn/dsh-tty integration
 * 退出码：0 = 全部 PASS，1 = 任一 FAIL。
 */
import { Context } from '@deepseek-ai/cordis'
import WebServerRuntime from '@deepseek-ai/dsh-host-webserver'
import { LocalSubprocessRuntime } from '@deepseek-ai/dsh-subprocess-local'
import WebSocket from 'ws'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { name, inject, apply } from '../lib/index.js'
import { parseSshConfig } from '../lib/ssh-config.js'
import { parseKnownHosts } from '../lib/known-hosts.js'
import { assertSupportedJsonSchema } from '@deepseek-ai/dsh-tools'
import { startSftpSshd, TEST_USER, TEST_PASSWORD } from './lib/test-sshd.mjs'


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
    // 收集器剥掉 shell 集成标记（133;B 与命令输出同行，会粘住 ^…$ 行匹配）
    if (msg.t === 'data') state.text += String(msg.d ?? '').replace(/\x1b\]133;[ABDC](?:;\d+)?(?:\x07|\x1b\\)|\x1b\]7;[^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
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

  // B15: shell 集成（OSC 133/7）—— 命令捕获 + 退出码 + cwd 跟随（真实 zsh）
  console.log('\n[14] shell 集成（OSC 133/7）')
  {
    const s = openSession(port)
    await s.open()
    s.client.send(JSON.stringify({ t: 'spawn', sid: 'si-1' }))
    await s.waitFor(() => s.state.ready, 10000, 'si-1 ready')
    const capture = toolDefs.find((d) => d.name === 'tty_capture')
    const list = toolDefs.find((d) => d.name === 'tty_list')
    const expect = toolDefs.find((d) => d.name === 'tty_expect')
    if (capture === undefined || list === undefined || expect === undefined) {
      fail('B15 工具注册', '缺工具: ' + toolDefs.map((d) => d.name).join(','))
    } else {
      s.client.send(JSON.stringify({ t: 'input', sid: 'si-1', d: 'printf "SI_%s\\n" OK\n' }))
      await s.waitFor(() => /SI_OK/.test(s.state.text), 10000, 'SI_OK 输出')
      await sleep(600) // 等 D 标记（precmd 在下一 prompt 前发出）
      let last = null
      for (let i = 0; i < 12; i++) {
        await sleep(250)
        try {
          last = await capture.execute({ sid: 'si-1', last: true })
        } catch (error) {
          last = { error: error.message }
        }
        if (last !== null && last.source === 'last') break
      }
      if (last !== null && last.source === 'last' && String(last.tail).includes('SI_OK') && last.exitCode === 0) pass('B15a tty_capture{last:true} 拿到命令输出 + exitCode=0')
      else fail('B15a tty_capture{last:true} 拿到命令输出 + exitCode=0', JSON.stringify(last).slice(0, 160))
      // OSC 7：cd 之后 tty_list 的 cwd 跟随
      s.client.send(JSON.stringify({ t: 'input', sid: 'si-1', d: 'cd /tmp\n' }))
      let cwdOk = false
      for (let i = 0; i < 16 && !cwdOk; i++) {
        await sleep(300)
        const listed = await list.execute({})
        const entry = listed.sessions.find((x) => x.sid === 'si-1')
        cwdOk = entry !== undefined && entry.cwd === '/tmp'
      }
      if (cwdOk) pass('B15b OSC 7 cwd 上报生效（tty_list 跟随 cd /tmp）')
      else fail('B15b OSC 7 cwd 上报生效（tty_list 跟随 cd /tmp）', 'cwd 未更新')
    }
    s.client.send(JSON.stringify({ t: 'kill', sid: 'si-1' }))
    await s.waitFor(() => s.state.exited !== null, 10000, 'si-1 exit')
    s.client.close()
  }

  // B16: ~/.ssh/config 解析器（纯函数，不读文件系统）
  console.log('\n[15] ssh-config 解析器')
  {
    const sample = [
      '# comment',
      'Host web1',
      '  HostName web1.example.com',
      '  User alice',
      '  Port 2222',
      '  IdentityFile ~/.ssh/id_ed25519',
      '',
      'Host = db1',
      '  hostname = db1.internal # inline comment',
      '  user = bob',
      '',
      'Host *',
      '  Compression yes',
      '',
      'Host nouser',
      '  HostName nowhere',
    ].join('\n')
    const entries = parseSshConfig(sample)
    const web1 = entries.find((e) => e.name === 'web1')
    const db1 = entries.find((e) => e.name === 'db1')
    const ok = entries.length === 2
      && web1 !== undefined && web1.host === 'web1.example.com' && web1.username === 'alice'
      && web1.port === 2222 && web1.auth === 'key' && web1.keyPath === '~/.ssh/id_ed25519'
      && db1 !== undefined && db1.host === 'db1.internal' && db1.username === 'bob' && db1.auth === 'agent'
      && db1.port === 22
    if (ok) pass('B16 ssh-config 解析（别名/=/行内注释/IdentityFile→key/通配与无User跳过）')
    else fail('B16 ssh-config 解析（别名/=/行内注释/IdentityFile→key/通配与无User跳过）', JSON.stringify(entries))
  }

  // B17: tty_expect —— 匹配与超时两分支
  console.log('\n[16] tty_expect')
  {
    const s = openSession(port)
    await s.open()
    s.client.send(JSON.stringify({ t: 'spawn', sid: 'ex-1' }))
    await s.waitFor(() => s.state.ready, 10000, 'ex-1 ready')
    const expect = toolDefs.find((d) => d.name === 'tty_expect')
    if (expect === undefined) {
      fail('B17 tty_expect 注册', '未找到 tty_expect')
    } else {
      // 先注册等待再发命令（工具内部同步挂 output 监听，无竞态窗口）
      const pendingOk = expect.execute({ sid: 'ex-1', pattern: 'EXPECT_HIT', timeoutSec: 15 })
      await sleep(300)
      s.client.send(JSON.stringify({ t: 'input', sid: 'ex-1', d: 'sleep 1; printf "EXPECT_%s\\n" HIT\n' }))
      const okResult = await pendingOk
      if (okResult.matched === true && okResult.timedOut === false && /EXPECT_HIT/.test(okResult.text)) pass('B17a tty_expect 等到就绪标记（matched=true）')
      else fail('B17a tty_expect 等到就绪标记（matched=true）', JSON.stringify(okResult).slice(0, 160))
      await sleep(800) // 等上一条命令的 D 标记与 prompt 落定，走纯超时分支
      const missResult = await expect.execute({ sid: 'ex-1', pattern: 'NEVER_APPEARS_XYZ', timeoutSec: 1 })
      if (missResult.matched === false && missResult.timedOut === true && typeof missResult.text === 'string') pass('B17b tty_expect 超时不抛错（matched=false, timedOut=true）')
      else fail('B17b tty_expect 超时不抛错（matched=false, timedOut=true）', JSON.stringify(missResult).slice(0, 160))
    }
    s.client.send(JSON.stringify({ t: 'kill', sid: 'ex-1' }))
    await s.waitFor(() => s.state.exited !== null, 10000, 'ex-1 exit')
    s.client.close()
  }

  // B18: data 帧合并与帧序不变量（exit 永远在最后一帧 data 之后）
  console.log('\n[17] data 帧合并与帧序')
  {
    const s = openSession(port)
    await s.open()
    console.log('    [B18] spawning…')
    s.client.send(JSON.stringify({ t: 'spawn', sid: 'co-1' }))
    await s.waitFor(() => s.state.ready, 10000, 'co-1 ready')
    console.log('    [B18] ready ✓')
    s.client.send(JSON.stringify({ t: 'input', sid: 'co-1', d: 'printf "COARSE_%s\\n" OK\n' }))
    console.log('    [B18] input sent')
    await s.waitFor(() => /COARSE_OK/.test(s.state.text), 10000, 'COARSE_OK 输出')
    console.log('    [B18] COARSE_OK ✓')
    await sleep(300)
    console.log('    [B18] killing…')
    s.client.send(JSON.stringify({ t: 'kill', sid: 'co-1' }))
    await s.waitFor(() => s.state.exited !== null && s.state.exited.sid === 'co-1', 10000, 'co-1 exit')
    console.log('    [B18] exit ✓')
    const exitIndex = s.state.frames.findIndex((f) => f.t === 'exit' && f.sid === 'co-1')
    const lastDataIndex = s.state.frames.reduce((acc, f, i) => (f.t === 'data' && f.sid === 'co-1' ? i : acc), -1)
    if (exitIndex > lastDataIndex && /COARSE_OK/.test(s.state.text)) pass('B18 帧合并后帧序不变量（exit 在最后一帧 data 之后，输出完整）')
    else fail('B18 帧合并后帧序不变量（exit 在最后一帧 data 之后，输出完整）', `exitIndex=${exitIndex} lastDataIndex=${lastDataIndex}`)
    s.client.close()
  }

  // B19: known_hosts 解析器（非 hashed / [host]:port / 通配跳过 / @marker 跳过 / hashed 候选还原）
  console.log('\n[18] known_hosts 解析器')
  {
    const { createHash, createHmac, randomBytes } = await import('node:crypto')
    const blob1 = Buffer.from('web1-host-key-bytes', 'utf8').toString('base64')
    const blob2 = Buffer.from('db1-host-key-bytes', 'utf8').toString('base64')
    const blob3 = Buffer.from('hashed-host-key-bytes', 'utf8').toString('base64')
    const salt = randomBytes(20)
    const hmac = createHmac('sha1', salt).update('web1.example.com').digest('base64')
    const sample = [
      '# comment',
      '@cert-authority *.example.com ssh-ed25519 ' + blob1,
      'web1.example.com,alias ssh-ed25519 ' + blob1,
      '[db1.internal]:2222 ssh-rsa ' + blob2,
      '*.wildcard ssh-ed25519 ' + blob1,
      '|1|' + salt.toString('base64') + '|' + hmac + ' ssh-ed25519 ' + blob3,
    ].join('\n')
    const entries = parseKnownHosts(sample, ['web1.example.com'])
    const fp1 = createHash('sha256').update(Buffer.from('web1-host-key-bytes')).digest('hex')
    const fp2 = createHash('sha256').update(Buffer.from('db1-host-key-bytes')).digest('hex')
    const web1 = entries.find((e) => e.host === 'web1.example.com')
    const alias = entries.find((e) => e.host === 'alias')
    const db1 = entries.find((e) => e.host === 'db1.internal')
    const hashedReplayed = entries.filter((e) => e.host === 'web1.example.com').length
    const ok = entries.length === 3
      && web1 !== undefined && web1.port === 22 && web1.fingerprint === fp1
      && alias !== undefined && alias.port === 22 && alias.fingerprint === fp1
      && db1 !== undefined && db1.port === 2222 && db1.fingerprint === fp2
      && hashedReplayed === 1
    if (ok) pass('B19 known_hosts 解析（别名拆分/[host]:port/@marker与通配跳过/hashed 候选还原+去重）')
    else fail('B19 known_hosts 解析（别名拆分/[host]:port/@marker与通配跳过/hashed 候选还原+去重）', JSON.stringify(entries))
  }

  // B20: 端口转发隧道（内存 SSH 服务桥接 + 双隧道 + 本地转发往返）
  console.log('\n[19] 端口转发隧道')
  {
    const ssh2mod = await import('ssh2')
    const ssh2 = ssh2mod.default ?? ssh2mod
    const netMod = await import('node:net')
    const net = netMod.default ?? netMod
    const { generateKeyPairSync } = await import('node:crypto')
    const mkEcho = () => new Promise((resolve) => {
      const server = net.createServer((socket) => socket.on('data', (d) => socket.write(d)))
      server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }))
    })
    const targetA = await mkEcho() // local 方向的「远程服务」
    const targetB = await mkEcho() // remote 方向的「本地服务」
    const freePort = () => new Promise((resolve, reject) => {
      const probe = net.createServer()
      probe.on('error', reject)
      probe.listen(0, '127.0.0.1', () => {
        const p = probe.address().port
        probe.close(() => resolve(p))
      })
    })
    const tunnelLocalPort = await freePort()
    const remoteBindPort = await freePort()
    const { privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
    })
    const sshServer = new ssh2.Server({ hostKeys: [privateKey] }, (client) => {
      client.on('authentication', (ctx) => {
        if (ctx.method === 'password' && ctx.username === 'test' && ctx.password === 'secret') ctx.accept()
        else ctx.reject()
      })
      client.on('request', (accept, reject, name) => {
        if (name === 'tcpip-forward' || name === 'cancel-tcpip-forward') accept()
        else reject()
      })
      client.on('tcpip', (accept, reject, info) => {
        const stream = accept()
        const upstream = net.connect(info.destPort, info.destIP, () => {
          stream.pipe(upstream)
          upstream.pipe(stream)
        })
        upstream.on('error', () => stream.end())
        stream.on('error', () => upstream.end())
      })
      client.on('error', () => {})
    })
    await new Promise((resolve, reject) => {
      sshServer.once('error', reject)
      sshServer.listen(0, '127.0.0.1', () => {
        sshServer.removeListener('error', reject)
        resolve()
      })
    })
    const sshPort = sshServer.address().port
    const post = async (body) => {
      const res = await fetch(`http://127.0.0.1:${port}/api/dsh-tty/config`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      return res.json()
    }
    const put = await post({
      sshHosts: [{ name: 'it-ssh', host: '127.0.0.1', port: sshPort, username: 'test', auth: 'password', password: 'secret', keyPath: '', passphrase: '', agentForward: false }],
      tunnels: [
        { name: 't-local', bookName: 'it-ssh', direction: 'local', localPort: tunnelLocalPort, remoteHost: '127.0.0.1', remotePort: targetA.port, enabled: true },
        { name: 't-remote', bookName: 'it-ssh', direction: 'remote', remotePort: remoteBindPort, localTargetPort: targetB.port, enabled: true },
      ],
    })
    if (put.ok === true && Array.isArray(put.config?.tunnels) && put.config.tunnels.length === 2) pass('B20a tunnels 配置热生效（POST → reconcile）')
    else fail('B20a tunnels 配置热生效（POST → reconcile）', JSON.stringify(put).slice(0, 160))
    let statuses = []
    for (let i = 0; i < 30; i++) {
      await sleep(400)
      const r = await (await fetch(`http://127.0.0.1:${port}/api/dsh-tty/tunnels`)).json()
      statuses = r.tunnels ?? []
      if (statuses.length === 2 && statuses.every((t) => t.state === 'active')) break
    }
    if (statuses.length === 2 && statuses.every((t) => t.state === 'active')) pass('B20b 双隧道到达 active（forwardOut + forwardIn）')
    else fail('B20b 双隧道到达 active（forwardOut + forwardIn）', JSON.stringify(statuses))
    const roundtrip = await new Promise((resolve) => {
      const socket = net.connect(tunnelLocalPort, '127.0.0.1', () => socket.write('PING_B20'))
      let buf = ''
      socket.on('data', (d) => {
        buf += d.toString()
        if (buf.includes('PING_B20')) {
          socket.end()
          resolve(buf)
        }
      })
      socket.on('error', (e) => resolve('ERR:' + e.message))
      setTimeout(() => resolve('TIMEOUT:' + buf), 6000)
    })
    if (typeof roundtrip === 'string' && roundtrip.includes('PING_B20')) pass('B20c 本地转发往返（TCP → forwardOut → 服务端桥 → echo 目标）')
    else fail('B20c 本地转发往返（TCP → forwardOut → 服务端桥 → echo 目标）', String(roundtrip).slice(0, 120))
    const tunnelList = toolDefs.find((d) => d.name === 'tunnel_list')
    if (tunnelList === undefined) {
      fail('B20d tunnel_list 注册', '未找到 tunnel_list')
    } else {
      const listed = await tunnelList.execute({})
      const names = (listed.tunnels ?? []).map((t) => `${t.name}:${t.state}`).join(',')
      if (Array.isArray(listed.tunnels) && listed.tunnels.some((t) => t.name === 't-local' && t.state === 'active')) pass('B20d tunnel_list 工具可见隧道状态（' + names + '）')
      else fail('B20d tunnel_list 工具可见隧道状态', names)
    }
    await post({ tunnels: [] })
    await sleep(400)
    const after = await (await fetch(`http://127.0.0.1:${port}/api/dsh-tty/tunnels`)).json()
    if ((after.tunnels ?? []).length === 0) pass('B20e tunnels 清空即停止（reconcile 移除）')
    else fail('B20e tunnels 清空即停止（reconcile 移除）', JSON.stringify(after.tunnels))
    targetA.server.close()
    targetB.server.close()
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, 1000).unref()
      sshServer.close(() => {
        clearTimeout(timer)
        resolve()
      })
    })
    sshServer.closeAllConnections?.()
  }

  // B21: /api/dsh-tty/shells 候选列表（设置卡片「Shell 路径」数据源）
  console.log('\n[19] shells 候选路由')
  {
    const { existsSync } = await import('node:fs')
    const data = await (await fetch(`http://127.0.0.1:${port}/api/dsh-tty/shells`)).json()
    const shells = Array.isArray(data.shells) ? data.shells : []
    const allAbsolute = shells.every((p) => typeof p === 'string' && p.startsWith('/'))
    const hasCurrent = typeof process.env.SHELL !== 'string' || process.env.SHELL.trim() === '' || shells.includes(process.env.SHELL)
    const hasBash = !existsSync('/bin/bash') || shells.includes('/bin/bash')
    if (data.ok === true && shells.length > 0 && allAbsolute && hasCurrent && hasBash) pass('B21 shells 候选路由（/etc/shells + $SHELL 去重、存在且可执行、$SHELL 优先）')
    else fail('B21 shells 候选路由（/etc/shells + $SHELL 去重、存在且可执行、$SHELL 优先）', JSON.stringify(data).slice(0, 200))
  }

  // B22: bash 3.2（macOS 自带，无 PS0）shell 集成 —— DEBUG trap 兜底 B 标记
  // 注意：本用例把 config.shell 热切成 /bin/bash（内存 settings stub 不持久），
  // 必须放在所有依赖默认 shell 的用例之后。
  console.log('\n[20] bash 3.2 shell 集成（DEBUG trap 兜底）')
  {
    const { existsSync } = await import('node:fs')
    if (!existsSync('/bin/bash')) {
      console.log('  ⊘ SKIP  B22（本机无 /bin/bash）')
    } else {
      await fetch(`http://127.0.0.1:${port}/api/dsh-tty/config`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ shell: '/bin/bash' }),
      })
      const s = openSession(port)
      await s.open()
      s.client.send(JSON.stringify({ t: 'spawn', sid: 'b32-1' }))
      await s.waitFor(() => s.state.ready, 10000, 'b32-1 ready')
      const capture = toolDefs.find((d) => d.name === 'tty_capture')
      const expect = toolDefs.find((d) => d.name === 'tty_expect')
      if (capture === undefined || expect === undefined) {
        fail('B22 工具注册', '缺工具: ' + toolDefs.map((d) => d.name).join(','))
      } else {
        // a) DEBUG trap 补出 B 标记 → capture{last:true} 可用
        s.client.send(JSON.stringify({ t: 'input', sid: 'b32-1', d: 'printf "B32_%s\\n" OK\n' }))
        await s.waitFor(() => /B32_OK/.test(s.state.text), 10000, 'B32_OK 输出')
        await sleep(600) // 等 D 标记（PROMPT_COMMAND 在下一 prompt 前发出）
        let last = null
        for (let i = 0; i < 12; i++) {
          await sleep(250)
          try {
            last = await capture.execute({ sid: 'b32-1', last: true })
          } catch (error) {
            last = { error: error.message }
          }
          if (last !== null && last.source === 'last') break
        }
        if (last !== null && last.source === 'last' && String(last.tail).includes('B32_OK') && last.exitCode === 0) pass('B22a bash 3.2 tty_capture{last:true} 拿到命令输出 + exitCode=0（DEBUG trap 补 B 标记）')
        else fail('B22a bash 3.2 tty_capture{last:true} 拿到命令输出 + exitCode=0（DEBUG trap 补 B 标记）', JSON.stringify(last).slice(0, 160))
        // b) 命令在飞时注册 expect → 命令结束（D 标记）早停并带退出码
        await sleep(600) // 等 B22a 的 prompt 落定，避免吃到上一条的 D
        const startedAt = Date.now()
        s.client.send(JSON.stringify({ t: 'input', sid: 'b32-1', d: 'sleep 2\n' }))
        await sleep(500) // B 标记已到（inCommand=true）后再注册
        const early = await expect.execute({ sid: 'b32-1', pattern: 'NEVER_APPEARS_B32', timeoutSec: 20 })
        const elapsed = Date.now() - startedAt
        if (early.matched === false && early.timedOut === false && early.exitCode === 0 && elapsed < 10000) pass(`B22b bash 3.2 tty_expect 命令结束早停（exitCode=0，${elapsed}ms << 20s 超时）`)
        else fail('B22b bash 3.2 tty_expect 命令结束早停（exitCode=0）', JSON.stringify(early).slice(0, 160) + ` elapsed=${elapsed}ms`)
      }
      s.client.send(JSON.stringify({ t: 'kill', sid: 'b32-1' }))
      await s.waitFor(() => s.state.exited !== null, 10000, 'b32-1 exit')
      s.client.close()
    }
  }

  // B23: SFTP 文件传输（0.7.0）—— /api/dsh-tty/sftp/* 路由 + sftp_* agent 工具
  // 数据源是 scripts/lib/test-sshd.mjs 的内存 sshd（sftp subsystem 映射临时目录）。
  console.log('\n[21] SFTP 文件传输（HTTP 路由 + agent 工具）')
  {
    const rootDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'dsh-tty-b23-'))
    const sftpd = await startSftpSshd({ rootDir })
    const post = async (body) => {
      const res = await fetch(`http://127.0.0.1:${port}/api/dsh-tty/config`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      return res.json()
    }
    const put = await post({ sshHosts: [{ name: 'b23-ssh', host: '127.0.0.1', port: sftpd.port, username: TEST_USER, auth: 'password', password: TEST_PASSWORD, keyPath: '', passphrase: '', agentForward: false }] })
    if (put.ok === true) pass('B23a 连接簿写入（POST config sshHosts → SFTP 走连接簿凭证）')
    else fail('B23a 连接簿写入（POST config sshHosts → SFTP 走连接簿凭证）', JSON.stringify(put).slice(0, 160))
    await fsp.writeFile(path.join(rootDir, 'seed.txt'), 'SEED_CONTENT_B23')

    const sftpApi = async (action, payload) => {
      const res = await fetch(`http://127.0.0.1:${port}/api/dsh-tty/sftp/${action}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'b23-ssh', ...payload }),
      })
      const data = await res.json().catch(() => ({}))
      return { status: res.status, data }
    }

    // b) list：path 缺省 → realpath home（rootDir）+ 预置文件可见
    const listed = await sftpApi('list', { path: '' })
    const seed = (listed.data.entries ?? []).find((e) => e.name === 'seed.txt')
    if (listed.data.ok === true && listed.data.path === rootDir && seed?.isFile === true && seed?.size === 16) {
      pass('B23b list 路由（path 缺省 realpath 到 rootDir，seed.txt 文件属性正确）')
    } else {
      fail('B23b list 路由（path 缺省 realpath 到 rootDir，seed.txt 文件属性正确）', JSON.stringify(listed).slice(0, 200))
    }

    // c) mkdir + upload（原始字节 body，x-dsh-sftp-meta 头带 spec+path）
    const mk = await sftpApi('mkdir', { path: rootDir + '/b23dir' })
    const payload = Buffer.alloc(4096, 0x62)
    const up = await fetch(`http://127.0.0.1:${port}/api/dsh-tty/sftp/upload`, {
      method: 'POST',
      headers: { 'x-dsh-sftp-meta': Buffer.from(JSON.stringify({ name: 'b23-ssh', path: rootDir + '/b23dir/up.bin' })).toString('base64url') },
      body: payload,
    })
    const upData = await up.json().catch(() => ({}))
    let stored = null
    try {
      stored = await fsp.readFile(path.join(rootDir, 'b23dir', 'up.bin'))
    } catch {
      stored = null
    }
    if (mk.data.ok === true && up.status === 200 && upData.ok === true && upData.bytes === 4096 && stored !== null && stored.equals(payload)) {
      pass('B23c mkdir + upload 路由（4096 字节流式落盘逐一一致）')
    } else {
      fail('B23c mkdir + upload 路由（4096 字节流式落盘逐一一致）', `mk=${JSON.stringify(mk.data).slice(0, 80)} up=${up.status}/${JSON.stringify(upData).slice(0, 80)} stored=${stored === null ? '缺失' : String(stored.length) + 'B'}`)
    }

    // d) download：流式响应 + content-disposition + 字节一致
    const dl = await fetch(`http://127.0.0.1:${port}/api/dsh-tty/sftp/download`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'b23-ssh', path: rootDir + '/b23dir/up.bin' }),
    })
    const dlBuf = Buffer.from(await dl.arrayBuffer())
    const disposition = dl.headers.get('content-disposition') ?? ''
    if (dl.status === 200 && dlBuf.equals(payload) && disposition.includes('up.bin')) {
      pass('B23d download 路由（octet-stream + content-disposition + 字节一致）')
    } else {
      fail('B23d download 路由（octet-stream + content-disposition + 字节一致）', `status=${String(dl.status)} bytes=${String(dlBuf.length)} disposition=${JSON.stringify(disposition)}`)
    }

    // e) agent 工具：schema 校验 + sftp_list / sftp_write（追加）/ sftp_read
    const sftpList = toolDefs.find((d) => d.name === 'sftp_list')
    const sftpRead = toolDefs.find((d) => d.name === 'sftp_read')
    const sftpWrite = toolDefs.find((d) => d.name === 'sftp_write')
    if (sftpList === undefined || sftpRead === undefined || sftpWrite === undefined) {
      fail('B23e sftp_* agent 工具（schema + list/read/write）', '缺工具: ' + toolDefs.map((d) => d.name).filter((n) => n.startsWith('sftp')).join(',') || '无')
    } else {
      let schemaOk = true
      for (const d of [sftpList, sftpRead, sftpWrite]) {
        try {
          assertSupportedJsonSchema(d.parameters)
          assertSupportedJsonSchema(d.output?.schema ?? {})
        } catch (e) {
          schemaOk = false
          fail('B23e sftp_* agent 工具（schema + list/read/write）', d.name + ' schema: ' + String(e && e.message ? e.message : e))
        }
      }
      const toolListed = schemaOk ? await sftpList.execute({ book: 'b23-ssh', path: rootDir + '/b23dir' }) : null
      const saw = toolListed !== null && (toolListed.entries ?? []).some((e) => e.name === 'up.bin' && e.isDir === false && e.size === 4096)
      let noteOk = false
      let readBack = null
      try {
        await sftpWrite.execute({ book: 'b23-ssh', path: rootDir + '/b23dir/note.txt', content: 'hello-b23', append: true })
        await sftpWrite.execute({ book: 'b23-ssh', path: rootDir + '/b23dir/note.txt', content: '-again', append: true })
        readBack = await sftpRead.execute({ book: 'b23-ssh', path: rootDir + '/b23dir/note.txt' })
        noteOk = readBack.content === 'hello-b23-again' && readBack.truncated === false
      } catch (error) {
        readBack = { error: error.message }
      }
      if (schemaOk && saw === true && noteOk) pass('B23e sftp_* agent 工具（schema 通过 + list 可见上传文件 + write 追加后 read 一致）')
      else fail('B23e sftp_* agent 工具（schema 通过 + list 可见上传文件 + write 追加后 read 一致）', `saw=${String(saw)} note=${JSON.stringify(readBack).slice(0, 120)}`)
    }

    // f) remove 递归 + 连接簿清空
    const rm = await sftpApi('remove', { path: rootDir + '/b23dir', recursive: true })
    const gone = await fsp.access(path.join(rootDir, 'b23dir')).then(() => false, () => true)
    if (rm.data.ok === true && gone) pass('B23f remove 路由（目录递归删除）')
    else fail('B23f remove 路由（目录递归删除）', `status=${String(rm.status)} data=${JSON.stringify(rm.data).slice(0, 120)} gone=${String(gone)}`)
    await post({ sshHosts: [] })
    await sftpd.close()
    await fsp.rm(rootDir, { recursive: true, force: true })
    console.log('    sftp sshd 已关闭，临时目录已清理')
  }

  // B24: SFTP 管理闭环（0.8.0）—— agent sftp_mkdir/sftp_rename/sftp_remove/
  // sftp_tree（test-sshd 内存 sshd，覆盖 parents 逐级补齐、tree 限深截断、
  // 跨目录 rename = mv、非空目录非递归删除拒绝、递归删除与不存在路径报错）。
  console.log('\n[22] SFTP 管理闭环（agent sftp_mkdir/rename/remove/tree）')
  {
    const rootDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'dsh-tty-b24-'))
    const sftpd = await startSftpSshd({ rootDir })
    const post = async (body) => {
      const res = await fetch(`http://127.0.0.1:${port}/api/dsh-tty/config`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      return res.json()
    }
    const put = await post({ sshHosts: [{ name: 'b24-ssh', host: '127.0.0.1', port: sftpd.port, username: TEST_USER, auth: 'password', password: TEST_PASSWORD, keyPath: '', passphrase: '', agentForward: false }] })
    if (put.ok === true) pass('B24a 连接簿写入（b24-ssh）')
    else fail('B24a 连接簿写入（b24-ssh）', JSON.stringify(put).slice(0, 160))

    const sftpMkdir = toolDefs.find((d) => d.name === 'sftp_mkdir')
    const sftpRename = toolDefs.find((d) => d.name === 'sftp_rename')
    const sftpRemove = toolDefs.find((d) => d.name === 'sftp_remove')
    const sftpTree = toolDefs.find((d) => d.name === 'sftp_tree')
    const sftpWrite = toolDefs.find((d) => d.name === 'sftp_write')
    const sftpRead = toolDefs.find((d) => d.name === 'sftp_read')
    if (sftpMkdir === undefined || sftpRename === undefined || sftpRemove === undefined || sftpTree === undefined || sftpWrite === undefined || sftpRead === undefined) {
      fail('B24 工具注册', '缺工具: ' + toolDefs.map((d) => d.name).filter((n) => n.startsWith('sftp')).join(',') || '无')
    } else {
      let schemaOk = true
      for (const d of [sftpMkdir, sftpRename, sftpRemove, sftpTree]) {
        try {
          assertSupportedJsonSchema(d.parameters)
          assertSupportedJsonSchema(d.output?.schema ?? {})
        } catch (e) {
          schemaOk = false
          fail('B24 工具注册（schema 校验）', d.name + ' schema: ' + String(e && e.message ? e.message : e))
        }
      }
      if (schemaOk) pass('B24a sftp_mkdir/rename/remove/tree schema 校验')

      // b) mkdir parents 逐级补齐（等效 mkdir -p）
      const libDir = rootDir + '/b24/proj/src/lib'
      await sftpMkdir.execute({ book: 'b24-ssh', path: libDir, parents: true })
      const libStat = await fsp.stat(libDir).then((s) => s.isDirectory(), () => false)
      let noParentsRejected = false
      try {
        await sftpMkdir.execute({ book: 'b24-ssh', path: rootDir + '/b24/no/such/dir' })
      } catch {
        noParentsRejected = true
      }
      if (libStat && noParentsRejected) pass('B24b sftp_mkdir（parents 逐级补齐 + 缺父目录被拒）')
      else fail('B24b sftp_mkdir（parents 逐级补齐 + 缺父目录被拒）', `libDir=${String(libStat)} noParentsRejected=${String(noParentsRejected)}`)

      // seed 一个文件（sftp_write），供 tree / rename / 移动断言
      await sftpWrite.execute({ book: 'b24-ssh', path: libDir + '/util.ts', content: 'export const b24 = 1\n' })

      // c) tree：深度优先目录优先 + maxDepth 限深截断
      const treeShallow = await sftpTree.execute({ book: 'b24-ssh', path: rootDir + '/b24', maxDepth: 1 })
      const shallowOk = treeShallow.entries.length === 1 && treeShallow.entries[0].path === rootDir + '/b24/proj' && treeShallow.entries[0].depth === 1 && treeShallow.entries[0].isDir === true && treeShallow.truncated === true
      const treeFull = await sftpTree.execute({ book: 'b24-ssh', path: rootDir + '/b24', maxDepth: 4 })
      const names = treeFull.entries.map((e) => e.path)
      const fullOk = names.join('|') === [rootDir + '/b24/proj', rootDir + '/b24/proj/src', rootDir + '/b24/proj/src/lib', rootDir + '/b24/proj/src/lib/util.ts'].join('|')
        && treeFull.truncated === false
        && treeFull.entries[3].size === 'export const b24 = 1\n'.length
      if (shallowOk && fullOk) pass('B24c sftp_tree（深度优先目录优先 + maxDepth 截断标记）')
      else fail('B24c sftp_tree（深度优先目录优先 + maxDepth 截断标记）', `shallow=${JSON.stringify(treeShallow).slice(0, 160)} full=${names.join('|')} truncated=${String(treeFull.truncated)}`)

      // d) rename 文件 + 内容不变
      await sftpRename.execute({ book: 'b24-ssh', from: libDir + '/util.ts', to: libDir + '/helper.ts' })
      const renamed = await fsp.access(libDir + '/util.ts').then(() => false, () => true)
      const readBack = await sftpRead.execute({ book: 'b24-ssh', path: libDir + '/helper.ts' })
      if (renamed && readBack.content === 'export const b24 = 1\n') pass('B24d sftp_rename（文件重命名 + 内容不变）')
      else fail('B24d sftp_rename（文件重命名 + 内容不变）', `renamed=${String(renamed)} content=${JSON.stringify(readBack.content ?? readBack).slice(0, 80)}`)

      // e) rename 跨目录 = 移动
      await sftpMkdir.execute({ book: 'b24-ssh', path: rootDir + '/b24/dest' })
      await sftpRename.execute({ book: 'b24-ssh', from: libDir + '/helper.ts', to: rootDir + '/b24/dest/helper.ts' })
      const movedAway = await fsp.access(libDir + '/helper.ts').then(() => false, () => true)
      const movedContent = await fsp.readFile(rootDir + '/b24/dest/helper.ts', 'utf8').catch(() => null)
      if (movedAway && movedContent === 'export const b24 = 1\n') pass('B24e sftp_rename（跨目录移动 = mv）')
      else fail('B24e sftp_rename（跨目录移动 = mv）', `movedAway=${String(movedAway)} content=${JSON.stringify(movedContent).slice(0, 80)}`)

      // f) remove：非空目录不带 recursive 被拒；recursive 整树删除；已删路径再操作报错
      let nonEmptyRejected = false
      try {
        await sftpRemove.execute({ book: 'b24-ssh', path: rootDir + '/b24/proj' })
      } catch {
        nonEmptyRejected = true
      }
      await sftpRemove.execute({ book: 'b24-ssh', path: rootDir + '/b24', recursive: true })
      const treeGone = await fsp.access(rootDir + '/b24').then(() => false, () => true)
      let missingRejected = false
      try {
        await sftpTree.execute({ book: 'b24-ssh', path: rootDir + '/b24' })
      } catch {
        missingRejected = true
      }
      if (nonEmptyRejected && treeGone && missingRejected) pass('B24f sftp_remove（非空目录需 recursive + 递归删除 + 复查报错）')
      else fail('B24f sftp_remove（非空目录需 recursive + 递归删除 + 复查报错）', `nonEmptyRejected=${String(nonEmptyRejected)} treeGone=${String(treeGone)} missingRejected=${String(missingRejected)}`)
    }

    await post({ sshHosts: [] })
    await sftpd.close()
    await fsp.rm(rootDir, { recursive: true, force: true })
    console.log('    sftp sshd 已关闭，临时目录已清理')
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
