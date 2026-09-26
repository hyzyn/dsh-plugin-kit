#!/usr/bin/env node
/**
 * @hyzyn/dsh-tty — 代理命令（ProxyCommand）的真机冒烟。
 *
 * 为什么必须真机跑一遍：`child_process.spawn → Duplex.from({readable, writable}) → ConnectConfig.sock`
 * 这条链路的正确性单测证明不了——测试里只能断言「sock 是个 Duplex」；「stdin/stdout 真的把字节
 * 送到了对端 sshd、目标真的在这条流上完成了握手、会话与 SFTP 都通、收尾真的没留下子进程」
 * 只有真实现能给。这里刻意**不用系统 ssh / nc**（CI 上未必有、参数还各不相同），而是自己写一个
 * 十几行的桥（`scripts/lib/proxy-bridge.mjs`）：把 stdio 接到 `host port`——这正是
 * `ssh -W %h:%p bastion` 的原语，于是 `%h` / `%p` 的展开也被一并验到。
 *
 * 用例：
 *   P1 终端会话经代理命令连上（spawnSsh：握手 + shell channel + 命令往返）
 *   P2 SFTP 经代理命令列目录（同一份传输被 sftp.ts 那条路径复用）
 *   P3 闸门关着 → 明确失败（文案点名开关），**且没有起进程**
 *   P4 命令本身失败（桥不存在）→ 文案带上代理命令的失败事实（stderr 摘要），而不是笼统的目标超时
 *   P5 含 shell 特殊字符的主机名 → 拒绝代入（不执行任何命令）
 *   P6 收尾后没有残留的桥进程（子进程不许变常驻孤儿）
 *
 * 退出码：全部 PASS → 0；任一 FAIL → 1（已进 CI 的 dsh-tty 端到端那一档）。
 */
import { execFileSync, spawn } from 'node:child_process'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { generateKeyPairSync } from 'node:crypto'
import ssh2 from 'ssh2'
import { SftpManager } from '../lib/sftp.js'
import { setProxyCommandPolicy, spawnSsh } from '../lib/ssh.js'
import { startSftpSshd, TEST_PASSWORD, TEST_USER } from './lib/test-sshd.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const BRIDGE = path.join(here, 'lib', 'proxy-bridge.mjs')

let failed = 0
function pass(name) {
  console.log(`  ✔ PASS  ${name}`)
}
function fail(name, detail) {
  failed += 1
  console.log(`  ✘ FAIL  ${name}${detail === undefined ? '' : ` — ${detail}`}`)
}

/* 全局看门狗：任何环节卡死时留痕退出（正常路径会先 process.exit）。 */
setTimeout(() => {
  console.error('[watchdog] 60s 看门狗触发：proxycommand-smoke 卡死')
  process.exit(1)
}, 60_000).unref?.()

/** 数一数现在还活着几个桥进程（按命令行里的脚本路径匹配；本脚本只在 POSIX 跑）。 */
function bridgeProcessCount() {
  try {
    const out = execFileSync('ps', ['-A', '-o', 'command'], { encoding: 'utf8' })
    return out.split('\n').filter((line) => line.includes('proxy-bridge.mjs')).length
  } catch {
    return -1
  }
}

const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'dsh-tty-proxycmd-'))
await fsp.writeFile(path.join(root, 'hello.txt'), 'via proxy command\n')

const target = await startSftpSshd({ rootDir: root })

/**
 * 最小「能开 shell」的内存 sshd（只做密码认证 + pty + 回一句标记）。
 *
 * 为什么要另一个服务端：`test-sshd.mjs` 是 SFTP 专用（不接 pty 请求），而终端那条路
 * `spawnSsh` 一定要 pty（`shell channel 打开失败: Unable to request a pseudo-terminal`）。
 * 这里只需要能证明「终端真的跑在代理命令的 stdio 上」与「收尾后子进程没了」。
 */
async function startShellSshd() {
  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
  })
  const server = new ssh2.Server({ hostKeys: [privateKey] }, (client) => {
    client.on('authentication', (ctx) => {
      if (ctx.method === 'password' && ctx.username === TEST_USER && ctx.password === TEST_PASSWORD) {
        ctx.accept()
        return
      }
      ctx.reject()
    })
    client.on('ready', () => {
      client.on('session', (accept) => {
        const session = accept()
        session.on('pty', (acceptPty) => acceptPty())
        session.on('shell', (acceptShell) => {
          const stream = acceptShell()
          stream.on('data', (chunk) => {
            // 极简伪 shell：收到 printf 就回一句可匹配标记（传输通了就够，不解释命令）
            if (chunk.toString('utf8').includes('printf')) stream.write('PROXYCMD:OK\r\n')
          })
        })
      })
    })
    client.on('error', () => {
      /* 断开：用例自己断言 */
    })
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })
  return {
    port: server.address().port,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  }
}

const shellTarget = await startShellSshd()

/**
 * 代理命令串：`"<node>" "<bridge>" %h %p`。
 *
 * 用 JSON.stringify 包引号是为了两平台都对：POSIX 的 sh 与 Windows 的 cmd 都认双引号，
 * 而 execPath 在 Windows 上常含空格（`C:\Program Files\nodejs\node.exe`）。
 */
const proxyCommand = `${JSON.stringify(process.execPath)} ${JSON.stringify(BRIDGE)} %h %p`
const specOf = (extra = {}) => ({
  host: '127.0.0.1',
  port: target.port,
  username: TEST_USER,
  auth: 'password',
  password: TEST_PASSWORD,
  proxyCommand,
  ...extra,
})

/** 读一条 SSH 会话的输出直到匹配（或超时）。 */
async function readUntil(handle, pattern, timeoutMs = 8000) {
  let text = ''
  return await new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ text, matched: pattern.test(text) }), timeoutMs)
    handle.output.on('data', (chunk) => {
      text += chunk.toString('utf8')
      if (pattern.test(text)) {
        clearTimeout(timer)
        resolve({ text, matched: true })
      }
    })
  })
}

try {
  // ---- P3 放在最前：闸门关着时**不该起任何进程**（先测这条，后面的用例才有干净的计数） ----
  const before = bridgeProcessCount()
  setProxyCommandPolicy(false)
  try {
    await new SftpManager({ info: () => {}, warn: () => {} }).list(specOf(), root)
    fail('P3 闸门关着 → 明确失败', '竟然连上了')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await new Promise((resolve) => setTimeout(resolve, 150))
    const after = bridgeProcessCount()
    if (message.includes('ProxyCommand') && message.includes('未启用') && after <= before) {
      pass(`P3 闸门关着 → 明确失败且没起进程（桥进程 ${String(before)} → ${String(after)}）`)
    } else {
      fail('P3 闸门关着 → 明确失败且没起进程', `msg=${message} before=${String(before)} after=${String(after)}`)
    }
  }

  // ---- P5：代入值含 shell 特殊字符 → 拒绝执行（连进程都不该起） ----
  setProxyCommandPolicy(true)
  try {
    await new SftpManager({ info: () => {}, warn: () => {} }).list(specOf({ host: '127.0.0.1; touch /tmp/dsh-pwned' }), root)
    fail('P5 主机名含 shell 特殊字符 → 拒绝代入', '竟然没报错')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('无法代入')) pass('P5 主机名含 shell 特殊字符 → 拒绝代入')
    else fail('P5 主机名含 shell 特殊字符 → 拒绝代入', message)
  }
  const pwned = await fsp.access('/tmp/dsh-pwned').then(() => true).catch(() => false)
  if (pwned) {
    await fsp.rm('/tmp/dsh-pwned', { force: true })
    fail('P5b 注入没有落地', '竟然真的创建了 /tmp/dsh-pwned')
  } else {
    pass('P5b 注入没有落地（/tmp/dsh-pwned 不存在）')
  }

  // ---- P1：终端会话经代理命令连上，并在上面跑一条命令 ----
  let session = null
  try {
    session = await spawnSsh(specOf({ port: shellTarget.port }), { term: 'xterm-256color', cols: 80, rows: 24, logger: { info: () => {}, warn: () => {} } })
    session.write('printf "PROXYCMD:%s\\n" OK\n')
    const { text } = await readUntil(session, /PROXYCMD:OK/)
    if (text.includes('PROXYCMD:OK')) pass('P1 终端会话经代理命令连上并完成命令往返')
    else fail('P1 终端会话经代理命令连上并完成命令往返', JSON.stringify(text.slice(-200)))
  } catch (error) {
    fail('P1 终端会话经代理命令连上并完成命令往返', error instanceof Error ? error.message : String(error))
  } finally {
    if (session !== null) await session.terminate().catch(() => {})
    session?.forceKill?.()
  }

  // ---- P2：SFTP 走同一条准备路径（prepareSshConnect） ----
  const sftp = new SftpManager({ info: () => {}, warn: () => {} })
  try {
    const listed = await sftp.list(specOf(), root)
    const names = listed.entries.map((entry) => entry.name)
    if (names.includes('hello.txt')) pass(`P2 SFTP 经代理命令列目录（${String(names.length)} 项）`)
    else fail('P2 SFTP 经代理命令列目录', JSON.stringify(names))
  } catch (error) {
    fail('P2 SFTP 经代理命令列目录', error instanceof Error ? error.message : String(error))
  } finally {
    sftp.disposeAll()
  }

  // ---- P4：命令自己失败 → 文案点名「代理命令已退出」+ 退出码 ----
  try {
    const dial = new SftpManager({ info: () => {}, warn: () => {} })
    await dial.list(specOf({ proxyCommand: `${JSON.stringify(process.execPath)} ${JSON.stringify(path.join(os.tmpdir(), 'definitely-missing-bridge.mjs'))} %h %p` }), root)
    fail('P4 命令失败 → 文案点名代理命令', '竟然连上了')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    /*
     * 断言刻意宽松：子进程「结束输出」与「exit」相差 1~2ms，而 ssh2 一看流断了就报错——
     * 谁先到不确定。两种时序都必须**至少**把 stderr 摘要交出来（那才是可排查的信息）：
     *   - exit 先到 → 「代理命令已退出（退出码 1）…」；
     *   - 传输先关 → 「代理命令传输已关闭；stderr: …」。
     */
    const named = message.includes('代理命令')
    const explained = message.includes('Cannot find module') || message.includes('退出码')
    if (named && explained) pass('P4 命令失败 → 文案带上代理命令的失败事实（stderr 摘要可见）')
    else fail('P4 命令失败 → 文案带上代理命令的失败事实（stderr 摘要可见）', message)
  }

  // ---- P6：收尾后没有残留的桥进程 ----
  await new Promise((resolve) => setTimeout(resolve, 400))
  const leaked = bridgeProcessCount()
  if (leaked === 0) pass('P6 收尾后没有残留的代理命令进程')
  else fail('P6 收尾后没有残留的代理命令进程', `ps 里还有 ${String(leaked)} 个 proxy-bridge.mjs`)
} finally {
  await target.close().catch(() => {})
  await shellTarget.close().catch(() => {})
  await fsp.rm(root, { recursive: true, force: true }).catch(() => {})
}

console.log(failed === 0 ? '\nproxycommand smoke: 全部 PASS' : `\nproxycommand smoke: ${String(failed)} 个 FAIL`)
process.exit(failed === 0 ? 0 : 1)
