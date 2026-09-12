#!/usr/bin/env node
/**
 * @hyzyn/dsh-tty — sftpLimits 配置贯通冒烟：POST /api/dsh-tty/config 带
 * sftpLimits → GET 回读正确；缺省回落默认；非法值拒绝；normalizePatch 拦截。
 * 用法：node scripts/sftplimits-smoke.mjs
 */
import { Context } from '@deepseek-ai/cordis'
import WebServerRuntime from '@deepseek-ai/dsh-host-webserver'
import { name, inject, apply } from '../lib/index.js'

const RESULTS = []
function pass(name) { RESULTS.push(['PASS', name]); console.log('  ✔ PASS  ' + name) }
function fail(name, detail) { RESULTS.push(['FAIL', name, detail]); console.error('  ✘ FAIL  ' + name + (detail ? ' — ' + detail : '')) }

async function run() {
  const app = new Context()
  const wsFiber = app.plugin(WebServerRuntime, { host: '127.0.0.1', port: 0 })
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
  const pluginFiber = app.plugin({ name, inject, apply }, { maxSessions: 4 })
  await wsFiber.await()
  await pluginFiber.await()
  const port = app.webServer.port
  await new Promise((resolve) => setTimeout(resolve, 300))

  const getConfig = async () => (await (await fetch(`http://127.0.0.1:${port}/api/dsh-tty/config`)).json()).config
  const post = async (body) => {
    const res = await fetch(`http://127.0.0.1:${port}/api/dsh-tty/config`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    return { status: res.status, data: await res.json().catch(() => ({})) }
  }

  // 1. 缺省值：配置未提供 → 默认 1024/2048/1000
  const c0 = await getConfig()
  if (c0.sftpLimits?.maxDownloadMb === 1024 && c0.sftpLimits?.maxUploadMb === 2048 && c0.sftpLimits?.maxUploadFiles === 1000) pass('S1 缺省 sftpLimits（1024/2048/1000）')
  else fail('S1 缺省 sftpLimits', JSON.stringify(c0.sftpLimits))

  // 2. 提交合法值 → 回读生效
  const r2 = await post({ sftpLimits: { maxDownloadMb: 512, maxUploadMb: 0, maxUploadFiles: 200 } })
  if (r2.status === 200 && r2.data.ok === true) {
    const c2 = await getConfig()
    if (c2.sftpLimits.maxDownloadMb === 512 && c2.sftpLimits.maxUploadMb === 0 && c2.sftpLimits.maxUploadFiles === 200) pass('S2 提交 sftpLimits 热生效（512/0/200，0=不限）')
    else fail('S2 提交 sftpLimits 热生效', JSON.stringify(c2.sftpLimits))
  } else fail('S2 提交 sftpLimits 热生效', JSON.stringify(r2))

  // 3. 部分提交（只改一项）→ 其余保持
  const r3 = await post({ sftpLimits: { maxDownloadMb: 256 } })
  if (r3.status === 200 && r3.data.ok === true) {
    const c3 = await getConfig()
    if (c3.sftpLimits.maxDownloadMb === 256 && c3.sftpLimits.maxUploadMb === 0 && c3.sftpLimits.maxUploadFiles === 200) pass('S3 部分提交只改对应项')
    else fail('S3 部分提交只改对应项', JSON.stringify(c3.sftpLimits))
  } else fail('S3 部分提交只改对应项', JSON.stringify(r3))

  // 4. 非法值拒绝
  const r4 = await post({ sftpLimits: { maxDownloadMb: -5 } })
  if (r4.status === 400 && /整数/.test(r4.data.error || '')) pass('S4 负值拒绝')
  else fail('S4 负值拒绝', JSON.stringify(r4))
  const r5 = await post({ sftpLimits: { maxUploadFiles: 99999999 } })
  if (r5.status === 400 && /整数/.test(r5.data.error || '')) pass('S5 超上限拒绝')
  else fail('S5 超上限拒绝', JSON.stringify(r5))
  const r6 = await post({ sftpLimits: 'not-an-object' })
  if (r6.status === 400 && /对象/.test(r6.data.error || '')) pass('S6 非对象拒绝')
  else fail('S6 非对象拒绝', JSON.stringify(r6))

  // 7. 未知键仍拦截（原行为保持）
  const r7 = await post({ bogus: 1 })
  if (r7.status === 400 && /未知配置项/.test(r7.data.error || '')) pass('S7 未知配置项仍拒绝')
  else fail('S7 未知配置项仍拒绝', JSON.stringify(r7))

  const failedCount = RESULTS.filter(([kind]) => kind === 'FAIL').length
  console.log(failedCount === 0 ? '\nsftpLimits smoke: 全部 PASS' : `\nsftpLimits smoke: ${failedCount} 个 FAIL`)
  process.exit(failedCount === 0 ? 0 : 1)
}

run().catch((error) => {
  console.error('[sftplimits-smoke] 崩溃: ' + (error && error.stack ? error.stack : error))
  process.exit(2)
})
