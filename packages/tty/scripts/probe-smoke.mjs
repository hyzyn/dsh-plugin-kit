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
/** 汇总打出来过没有（`beforeExit` 护栏据此区分「真的跑完了」与「挂死了」）。 */
let verdictPrinted = false
function pass(name) { RESULTS.push(['PASS', name]); console.log('  ✔ PASS  ' + name) }
function fail(name, detail) { RESULTS.push(['FAIL', name, detail]); console.error('  ✘ FAIL  ' + name + (detail ? ' — ' + detail : '')) }
/*
 * SKIP 与 PASS、FAIL 都不同：**断言在本机不可达**（环境限制），既不算过也不算回归。
 * 依据是 docs/agent-real-test.md § B0 第 2 条「不把环境限制当成代码回归」。
 */
function skip(name, why) { RESULTS.push(['SKIP', name, why]); console.log('  … SKIP  ' + name + (why ? ' — ' + why : '')) }

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
// 0.19.0 起 HostKeyStore.get 返回该 host:port 的指纹集合（一机多把钥匙）
function makeStore() {
  const map = new Map()
  return {
    get: (host, port) => {
      const fps = map.get(host + ':' + port)
      return fps === undefined ? undefined : [fps]
    },
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
  if (p6.auth.ok === false && p6.hostkey.state === 'mismatch' && typeof p6.hostkey.error === 'string' && p6.hostkey.error.includes('MITM') && Array.isArray(p6.hostkey.known) && p6.hostkey.known.length === 1 && p6.hostkey.known[0] === known) pass('P6 host key 变更 → mismatch + 指引')
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
  /*
   * `.invalid` 按 RFC 2606 必须 NXDOMAIN；它若连上了，说明**本机的解析器在劫持**
   * （路由器 / 运营商 / Clash 式 fake-ip 会给任何名字一个假地址，2026-10-27 实测
   * `dig no-such-host.invalid` → 198.18.0.204）。此时「DNS 失败」这条断言在本机
   * 根本不可达 —— 跳过而不是判红：判红会把环境限制写成代码回归，下一次真红就淹在里面。
   */
  else if (p5.tcp.ok === true) skip('P5 DNS 解析失败 → tcp DNS', '本机 DNS 把 no-such-host.invalid 解析成功了（fake-ip / 劫持），这条断言在本机不可达')
  else fail('P5 DNS 解析失败', JSON.stringify(p5))

  // P7 TCP 通但无 SSH banner（裸 TCP 服务）
  const plain = net.createServer((sock) => { sock.on('error', () => {}) })
  await new Promise((resolve) => plain.listen(0, '127.0.0.1', resolve))
  const plainPort = plain.address().port
  const p7 = await probeSsh({ ...spec, port: plainPort }, undefined)
  if (p7.tcp.ok === true && p7.auth.ok === false) pass('P7 裸 TCP（无 SSH）→ tcp 通 + auth 失败')
  else fail('P7 裸 TCP', JSON.stringify(p7))
  /*
   * `server.close(cb)` 的回调要等**所有连接都结束**才来。P7 的探针连上后不等 banner
   * 就被我们抛下，那条 socket 可能一直挂着 ⇒ 回调永不到来 ⇒ `main()` 悬在这个 await 上，
   * 事件循环排空后 node **以 0 自然退出、连汇总都不打**（2026-10-27 实测：`--trace-exit`
   * 没有任何退出栈，日志停在 P7 之后）。这正是本仓最忌讳的「闸门静默恒绿」。
   * 这个临时 server 关不关都不影响后面的断言，所以**不 await**：先踢残留连接，尽力关掉，
   * 紧接着就出汇总并 `process.exit()`。下面 `beforeExit` 那道护栏兜的是别的挂死形状。
   */
  plain.closeAllConnections?.()
  plain.close()

  const failedCount = RESULTS.filter(([kind]) => kind === 'FAIL').length
  const skippedCount = RESULTS.filter(([kind]) => kind === 'SKIP').length
  verdictPrinted = true
  console.log(
    failedCount === 0
      ? `\nprobe smoke: 全部 PASS${skippedCount === 0 ? '' : `（${String(skippedCount)} 条 SKIP：本机环境不可达，见上）`}`
      : `\nprobe smoke: ${String(failedCount)} 个 FAIL${skippedCount === 0 ? '' : `，${String(skippedCount)} 条 SKIP`}`,
  )
  process.exit(failedCount === 0 ? 0 : 1)
}

/*
 * 兜底：**没有汇总就不算通过**（0 命中 ≠ 没跑，同一条道理的另一个出口）。
 *
 * 正常路径在 `main()` 末尾 `process.exit()`，不会走到这里；只有「挂在某个 await 上、
 * 事件循环排空后自然退出」这种形状会触发（上面 P7 那处就是实例，已修根因，这条是护栏）。
 */
process.on('beforeExit', (code) => {
  if (verdictPrinted) return
  console.error('\n[probe-smoke] 没走到汇总就退出了（挂在某个 await 上）——按失败处理；这不是「通过」')
  process.exitCode = code === 0 ? 1 : code
})

main().catch((error) => {
  console.error('[probe-smoke] 未捕获错误: ' + (error && error.stack ? error.stack : error))
  process.exit(2)
})
