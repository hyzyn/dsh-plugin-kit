#!/usr/bin/env node
/**
 * @hyzyn/dsh-tty — probe 路由定向冒烟：只验证 /api/dsh-tty/probe（不依赖
 * spawn/PTY，独立于 integration.mjs 的 B1 环境要求）。
 *
 * 用法：node scripts/probe-route-smoke.mjs
 * 退出码：0 = 全部 PASS，1 = 任一 FAIL。
 */
import { Context } from '@deepseek-ai/cordis'
import WebServerRuntime from '@deepseek-ai/dsh-host-webserver'
import { LocalSubprocessRuntime } from '@deepseek-ai/dsh-subprocess-local'
import net from 'node:net'
import { name, inject, apply } from '../lib/index.js'
import { startSftpSshd, TEST_USER, TEST_PASSWORD } from './lib/test-sshd.mjs'

const RESULTS = []
function pass(name) { RESULTS.push(['PASS', name]); console.log('  ✔ PASS  ' + name) }
function fail(name, detail) { RESULTS.push(['FAIL', name, detail]); console.error('  ✘ FAIL  ' + name + (detail ? ' — ' + detail : '')) }

async function run() {
  const app = new Context()
  const wsFiber = app.plugin(WebServerRuntime, { host: '127.0.0.1', port: 0 })
  // settings / tools stub（probe 路由本身不需要，但插件启动时会注入）
  const stubFiber = app.plugin({
    name: 'settings-stub',
    apply: (ctx) => {
      ctx.provide('settings', { register: () => ({ get: () => ({}), update: async () => {} }) })
      ctx.provide('tools', { register: () => () => {} })
      // 与真实契约同形（section/context 返回注销器）：插件热应用时会调用重建
      ctx.provide('systemPrompt', {
        section: () => () => {},
        context: () => () => {},
      })
    },
  })
  await stubFiber.await()
  const pluginFiber = app.plugin({ name, inject, apply }, { maxSessions: 4, term: 'xterm-256color' })
  await wsFiber.await()
  await pluginFiber.await()
  const port = app.webServer.port
  await new Promise((resolve) => setTimeout(resolve, 300)) // 等路由注册
  const probe = async (body) => {
    const res = await fetch(`http://127.0.0.1:${port}/api/dsh-tty/probe`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    return res.json()
  }
  const getConfig = async () => (await (await fetch(`http://127.0.0.1:${port}/api/dsh-tty/config`)).json()).config

  const sftpd = await startSftpSshd({ rootDir: process.cwd() })
  const spec = { host: '127.0.0.1', port: sftpd.port, username: TEST_USER, auth: 'password', password: TEST_PASSWORD }
  const hostsBefore = (Array.isArray((await getConfig()).hostKeys) ? (await getConfig()).hostKeys : []).length

  // R1 试连成功（bookRecord=false）：auth.ok，不落盘
  const r1 = await probe({ ...spec, bookRecord: false })
  if (r1.ok === true && r1.result?.auth?.ok === true && r1.result?.tcp?.ok === true) pass('R1 试连成功（hostkey=' + String(r1.result?.hostkey?.state) + '）')
  else fail('R1 试连成功', JSON.stringify(r1))
  const hostsMid = (Array.isArray((await getConfig()).hostKeys) ? (await getConfig()).hostKeys : []).length
  if (hostsMid === hostsBefore) pass('R2 试连不落盘 hostKeys')
  else fail('R2 试连不落盘 hostKeys', `before=${hostsBefore} after=${hostsMid}`)

  // R3 连接簿测试（bookRecord=true）：新指纹 TOFU 记录
  const r3 = await probe({ ...spec, bookRecord: true })
  if (r3.ok === true && r3.result?.auth?.ok === true && r3.result?.hostkey?.state === 'recorded') pass('R3 连接簿测试：新指纹 TOFU 记录')
  else fail('R3 连接簿测试：新指纹 TOFU 记录', JSON.stringify(r3))
  const hostsAfter = (Array.isArray((await getConfig()).hostKeys) ? (await getConfig()).hostKeys : [])
  const recordedKey = hostsAfter.some((hk) => hk.host === '127.0.0.1' && Number(hk.port) === sftpd.port && typeof hk.fingerprint === 'string')
  if (recordedKey) pass('R4 指纹已持久化到 hostKeys')
  else fail('R4 指纹已持久化到 hostKeys', JSON.stringify(hostsAfter))
  const r5 = await probe({ ...spec, bookRecord: true })
  if (r5.ok === true && r5.result?.auth?.ok === true && r5.result?.hostkey?.state === 'matched') pass('R5 二次测试：指纹匹配放行')
  else fail('R5 二次测试：指纹匹配放行', JSON.stringify(r5))

  // R6 坏密码 → 认证被拒
  const r6 = await probe({ ...spec, password: 'wrong', bookRecord: true })
  if (r6.ok === false && r6.result?.auth?.ok === false && /认证被拒绝/.test(r6.result?.auth?.error || '')) pass('R6 坏密码 → 认证被拒绝')
  else fail('R6 坏密码 → 认证被拒绝', JSON.stringify(r6))

  // R7 端口不通 → TCP 拒绝
  const dead = net.createServer()
  await new Promise((resolve) => dead.listen(0, '127.0.0.1', resolve))
  const deadPort = dead.address().port
  await new Promise((resolve) => dead.close(resolve))
  const r7 = await probe({ ...spec, port: deadPort, bookRecord: false })
  if (r7.ok === false && r7.result?.tcp?.ok === false && r7.result?.auth?.ok === false) pass('R7 端口不通 → tcp 拒绝')
  else fail('R7 端口不通 → tcp 拒绝', JSON.stringify(r7))

  // R8/R9 字段校验
  const r8 = await probe({ host: '127.0.0.1', port: 22, username: '', auth: 'password', password: 'x' })
  if (r8.ok === false && /主机|用户名/.test(r8.error || '')) pass('R8 缺字段 → 友好错误')
  else fail('R8 缺字段 → 友好错误', JSON.stringify(r8))
  const r9 = await probe({ host: '127.0.0.1', port: 70000, username: 'u', auth: 'password', password: 'x' })
  if (r9.ok === false && /端口/.test(r9.error || '')) pass('R9 非法端口 → 友好错误')
  else fail('R9 非法端口 → 友好错误', JSON.stringify(r9))

  // loopback 围栏与既有路由同源（isLoopbackHttp：非 loopback 拒绝）；host
  // 头伪造在带同源 Origin 的浏览器 fetch 里不适用，此处不重复断言。

  await sftpd.close()
  const failedCount = RESULTS.filter(([kind]) => kind === 'FAIL').length
  console.log(failedCount === 0 ? '\nprobe route smoke: 全部 PASS' : `\nprobe route smoke: ${failedCount} 个 FAIL`)
  process.exit(failedCount === 0 ? 0 : 1)
}

run().catch((error) => {
  console.error('[probe-route-smoke] 崩溃: ' + (error && error.stack ? error.stack : error))
  process.exit(2)
})
