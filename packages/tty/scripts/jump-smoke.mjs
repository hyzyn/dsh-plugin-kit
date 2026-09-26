#!/usr/bin/env node
/**
 * @hyzyn/dsh-tty — 跳板机（ProxyJump 单跳）的真机冒烟。
 *
 * 为什么必须真机跑一遍：`forwardOut → ConnectConfig.sock` 这条链路的正确性**不可能**靠单测
 * 证明——假 ssh2 只能验「谁先连、config 长什么样」，而「通道真的把字节送到了另一台 sshd、
 * 目标在通道上完成了握手并开了 SFTP 通道」只有真实现才能给。本脚本起**两个真的 ssh2 服务端**：
 *
 *   - bastion：接受密码认证，并处理 `direct-tcpip`（把通道接到目标端口）；
 *   - target：`scripts/lib/test-sshd.mjs` 的内存 SFTP 服务端。
 *
 * **两者的凭据刻意不同**（bastion: jump/jump-secret，target: test/secret）：这样「跳板机凭据
 * 没被目标凭据顶掉」也能一并验到——那正是 `jumpSpecOf` 的继承规则最容易写错的地方。
 *
 * 三个用例：
 *   J1 经跳板机列 SFTP 目录（正向：通道 + 目标握手 + 通道建立）
 *   J2 跳板机密码错 → 文案点名**跳板机**（而不是笼统的目标超时）
 *   J3 通道通了但目标不可达 → 文案同时点名目标与**经跳板机 X**（两跳归属不能混）
 *
 * 退出码：全部 PASS → 0；任一 FAIL → 1（CI 与发布闸都跑它）。
 */
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import fsp from 'node:fs/promises'
import ssh2 from 'ssh2'
import { generateKeyPairSync } from 'node:crypto'
import { SftpManager } from '../lib/sftp.js'
import { startSftpSshd } from './lib/test-sshd.mjs'

const BASTION_USER = 'jump'
const BASTION_PASSWORD = 'jump-secret'

let failed = 0
function pass(name) {
  console.log(`  ✔ PASS  ${name}`)
}
function fail(name, detail) {
  failed += 1
  console.log(`  ✘ FAIL  ${name}${detail === undefined ? '' : ` — ${detail}`}`)
}

/** 起一个「能当跳板机」的 sshd：密码认证 + `direct-tcpip` 转发到目标端口。 */
async function startBastion() {
  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
  })
  /** 观测量：建了几条连接、开了几条转发通道（用例里断言「确实过了跳板机」）。 */
  const seen = { connections: 0, forwards: 0, closed: 0 }
  const server = new ssh2.Server({ hostKeys: [privateKey] }, (client) => {
    seen.connections += 1
    client.on('authentication', (ctx) => {
      if (ctx.method === 'password' && ctx.username === BASTION_USER && ctx.password === BASTION_PASSWORD) {
        ctx.accept()
        return
      }
      ctx.reject()
    })
    client.on('ready', () => {
      // direct-tcpip：这就是 forwardOut 落在服务端的那一半
      client.on('tcpip', (accept, reject, info) => {
        seen.forwards += 1
        const channel = accept()
        const socket = net.connect(info.destPort, info.destIP)
        socket.on('connect', () => {
          channel.pipe(socket).pipe(channel)
        })
        socket.on('error', () => {
          try {
            channel.close()
          } catch {
            /* 已关闭 */
          }
        })
        channel.on('close', () => socket.destroy())
      })
    })
    client.on('close', () => {
      seen.closed += 1
    })
    client.on('error', () => {
      /* 认证失败 / 断开：用例自己断言 */
    })
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })
  const port = server.address().port
  return {
    port,
    seen,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  }
}

const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'dsh-tty-jump-'))
await fsp.writeFile(path.join(root, 'hello.txt'), 'via bastion\n')

const bastion = await startBastion()
const target = await startSftpSshd({ rootDir: root })

/** 经跳板机连目标的规格（凭据刻意不同：bastion 用 jump/jump-secret）。 */
const specWithJump = (jumpOverride = {}) => ({
  host: '127.0.0.1',
  port: target.port,
  username: 'test',
  auth: 'password',
  password: 'secret',
  jump: { host: '127.0.0.1', port: bastion.port, username: BASTION_USER, auth: 'password', password: BASTION_PASSWORD, ...jumpOverride },
})

const sftp = new SftpManager({ info: () => {}, warn: () => {} })

try {
  // ---- J1：正向。SFTP 的 list 要经跳板机通道到达目标 ----
  try {
    const listed = await sftp.list(specWithJump(), root)
    const names = listed.entries.map((entry) => entry.name)
    if (names.includes('hello.txt') && bastion.seen.forwards >= 1) {
      pass(`J1 经跳板机列 SFTP 目录（跳板机转发 ${bastion.seen.forwards} 次，目标 ${names.length} 项）`)
    } else {
      fail('J1 经跳板机列 SFTP 目录', `files=${JSON.stringify(names)} forwards=${bastion.seen.forwards}`)
    }
  } catch (error) {
    fail('J1 经跳板机列 SFTP 目录', error instanceof Error ? error.message : String(error))
  }

  // ---- J2：跳板机密码错 → 必须点名跳板机 ----
  try {
    await sftp.list(specWithJump({ password: 'wrong' }), root)
    fail('J2 跳板机密码错', '竟然没报错')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('跳板机') && message.includes(`${BASTION_USER}@127.0.0.1:${String(bastion.port)}`)) {
      pass('J2 跳板机密码错 → 文案点名跳板机')
    } else {
      fail('J2 跳板机密码错 → 文案点名跳板机', message)
    }
  }

  // ---- J3：通道通了但目标不可达 → 目标与「经跳板机 X」都要出现 ----
  try {
    const deadPort = target.port + 1
    // 指向一个没人监听的端口：bastion 的 net.connect 会成功（本机 127.0.0.1），
    // 但通道上的目标握手会失败
    await sftp.list({ ...specWithJump(), port: deadPort }, root)
    fail('J3 通道通了但目标不可达', '竟然没报错')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('经跳板机') && message.includes('127.0.0.1')) {
      pass('J3 目标不可达 → 文案同时点名目标与跳板机')
    } else {
      fail('J3 目标不可达 → 文案同时点名目标与跳板机', message)
    }
  }

  // ---- 清理：跳板机连接必须被关掉（不留 keepalive 养着的连接） ----
  await sftp.disposeAll()
  await new Promise((resolve) => setTimeout(resolve, 200))
  if (bastion.seen.closed >= bastion.seen.connections) {
    pass(`J4 收尾后跳板机连接全部关闭（${bastion.seen.closed}/${bastion.seen.connections}）`)
  } else {
    fail('J4 收尾后跳板机连接全部关闭', `closed=${bastion.seen.closed} opened=${bastion.seen.connections}`)
  }
} finally {
  await bastion.close().catch(() => {})
  await target.close().catch(() => {})
  await fsp.rm(root, { recursive: true, force: true }).catch(() => {})
}

console.log(failed === 0 ? '\njump smoke: 全部 PASS' : `\njump smoke: ${failed} 个 FAIL`)
process.exit(failed === 0 ? 0 : 1)
