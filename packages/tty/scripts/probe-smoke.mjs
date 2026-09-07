#!/usr/bin/env node
/**
 * @hyzyn/dsh-tty — probe 冒烟：内存 SSH server（ssh2.Server password 认证
 * test/secret）× 真实 lib/probe.js 端到端。验证 probe 分类：
 *   P1 正确密码 + 无 store → auth.ok=true，hostkey.state='matched'（只比对不落盘）
 *   P2 正确密码 + store → hostkey.state='recorded'（TOFU 记录新指纹）
 *   P3 错误密码 → auth.ok=false，error 含「认证被拒绝」
 *   P4 端口未监听（TCP 层）→ tcp.ok=false，error 含「连接被拒绝」
 *   P5 DNS 解析失败 → tcp.ok=false，error 含「DNS」
 *   P6 TOFU mismatch：同 host:port 换服务器 host key → hostkey.state='mismatch'
 *      （含指引文案与 known/current 指纹），auth.ok=false
 *   P7 TCP 通但无 SSH banner（裸 TCP 服务）→ auth.ok=false（tcp.ok=true）
 *
 * 用法：pnpm --filter @hyzyn/dsh-tty build && node scripts/probe-smoke.mjs
 * 退出码：0 = 全部 PASS，1 = 任一 FAIL。
 */
import { generateKeyPairSync } from 'node:crypto'
import net from 'node:net'
import ssh2 from 'ssh2'
import { probeSsh } from '../lib/probe.js'
import { TEST_PASSWORD, TEST_USER } from './lib/test-sshd.mjs'

const RESULTS = []
function pass(name) { RESULTS.push(['PASS', name]); console.log('  ✔ PASS  ' + name) }
function fail(name, detail) { RESULTS.push(['FAIL', name, detail]); console.error('  ✘ FAIL  ' + name + (detail ? ' — ' + detail : '')) }

/* 一次性内存 sshd（password 认证）；只认证不开 shell（probe 不需要） */
function startSshd(hostKey, listenPort) {
  return new Promise((resolve, reject) => {
    const server = new ssh2.Server({ hostKeys: [hostKey] }, (client) => {
      client.on('authentication', (ctx) => {
        if (ctx.method === 'password' && ctx.username === TEST_USER && ctx.password === TEST_PASSWORD) ctx.accept()
        else ctx.reject()
      })
      client.on('ready', () => { /* probe 不开 channel */ })
      client.on('error', () => { /* 忽略 */ })
    })
    server.once('error', reject)
    const onListen = () => resolve({ server, port: server.address().port })
    if (listenPort !== undefined) server.listen(listenPort, '127.0.0.1', onListen)
    else server.listen(0, '127.0.0.1', onListen)
  })
}
/** 彻底关停：closeAllConnections 释放残留连接（probe 的 client 已 end，但
 *  ssh2 Server 侧 socket 可能仍占用端口，必须强关才可同端口复用）。 */
function closeSshd(s) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, 3000).unref()
    s.server.close(() => {
      clearTimeout(timer)
      resolve()
    })
    s.server.closeAllConnections?.()
  })
}

const keyA = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs1', format: 'pem' } }).privateKey
const keyB = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs1', format: 'pem' } }).privateKey

/* 内存 hostKeyStore */
function makeStore() {
  const map = new Map()
  return {
    get: (host, port) => map.get(host + ':' + port),
    record: (host, port, fingerprint) => { map.set(host + ':' + port, fingerprint) },
    _dump: () => map,
  }
}

async function main() {
  const host = '127.0.0.1'
  const sshd = await startSshd(keyA)
  const port = sshd.port
  const spec = { host, port, username: TEST_USER, auth: 'password', password: TEST_PASSWORD }
  const store = makeStore()

  // P1 成功无 store
  const p1 = await probeSsh(spec, undefined)
  if (p1.auth.ok === true && p1.tcp.ok === true && p1.hostkey.state === 'matched') pass('P1 正确密码（无 store）→ auth.ok / hostkey.matched')
  else fail('P1 正确密码（无 store）', JSON.stringify(p1))

  // P2 成功 + store 记录
  const p2 = await probeSsh(spec, store)
  const recorded = store._dump().get(host + ':' + port)
  if (p2.auth.ok === true && p2.hostkey.state === 'recorded' && typeof recorded === 'string' && recorded.length === 64) pass('P2 正确密码 + store → hostkey.recorded（指纹已记录）')
  else fail('P2 正确密码 + store', JSON.stringify(p2) + ' / store=' + String(recorded))

  // P3 错误密码
  const p3 = await probeSsh({ ...spec, password: 'wrong' }, undefined)
  if (p3.auth.ok === false && /认证被拒绝/.test(p3.auth.error || '')) pass('P3 错误密码 → 认证被拒绝')
  else fail('P3 错误密码', JSON.stringify(p3))

  // P6 TOFU mismatch：关掉 keyA 服务端，同端口换 keyB
  const p6port = port
  await closeSshd(sshd)
  const sshdB = await startSshd(keyB, p6port)
  const store6 = makeStore()
  const first6 = await probeSsh({ ...spec, port: p6port }, store6)
  if (first6.hostkey.state !== 'recorded') fail('P6 预记录', JSON.stringify(first6))
  await closeSshd(sshdB)
  const sshdA2 = await startSshd(keyA, p6port) // 同 host:port 换回 keyA → 指纹与 store6 不一致
  const p6 = await probeSsh({ ...spec, port: p6port }, store6)
  const known = store6._dump().get(host + ':' + p6port)
  if (p6.auth.ok === false && p6.hostkey.state === 'mismatch' && typeof p6.hostkey.error === 'string' && p6.hostkey.error.includes('MITM') && p6.hostkey.known === known) pass('P6 host key 变更 → mismatch + 指引')
  else fail('P6 host key 变更', JSON.stringify(p6) + ' / known=' + String(known))
  await closeSshd(sshdA2)

  // P4 TCP 拒绝（未监听端口）
  const closed = net.createServer()
  await new Promise((resolve) => closed.listen(0, '127.0.0.1', resolve))
  const deadPort = closed.address().port
  await new Promise((resolve) => closed.close(resolve))
  const p4 = await probeSsh({ ...spec, port: deadPort }, undefined)
  if (p4.tcp.ok === false && p4.auth.ok === false && /拒绝|ECONNREFUSED/.test((p4.tcp.error || '') + (p4.auth.error || ''))) pass('P4 端口未监听 → tcp 拒绝')
  else fail('P4 端口未监听', JSON.stringify(p4))

  // P5 DNS 失败
  const p5 = await probeSsh({ ...spec, host: 'no-such-host.invalid' }, undefined)
  if (p5.tcp.ok === false && /DNS/.test(p5.tcp.error || '')) pass('P5 DNS 解析失败 → tcp DNS')
  else fail('P5 DNS 解析失败', JSON.stringify(p5))

  // P7 TCP 通但无 SSH banner（裸 TCP 服务）
  const plain = net.createServer((sock) => { sock.on('error', () => {}) })
  await new Promise((resolve) => plain.listen(0, '127.0.0.1', resolve))
  const plainPort = plain.address().port
  const p7 = await probeSsh({ ...spec, port: plainPort }, undefined)
  if (p7.tcp.ok === true && p7.auth.ok === false) pass('P7 裸 TCP（无 SSH）→ tcp 通 + auth 失败')
  else fail('P7 裸 TCP', JSON.stringify(p7))
  await new Promise((resolve) => plain.close(resolve))

  const failedCount = RESULTS.filter(([kind]) => kind === 'FAIL').length
  console.log(failedCount === 0 ? '\nprobe smoke: 全部 PASS' : `\nprobe smoke: ${failedCount} 个 FAIL`)
  process.exit(failedCount === 0 ? 0 : 1)
}

main().catch((error) => {
  console.error('[probe-smoke] 未捕获错误: ' + (error && error.stack ? error.stack : error))
  process.exit(2)
})
