#!/usr/bin/env node
/**
 * @hyzyn/dsh-tty — SSH 冒烟：内存 SSH server（ssh2.Server）× 真实 spawnSsh 端到端。
 *
 * 本机不依赖真实 sshd —— 用 ssh2 的 Server 在 127.0.0.1 随机端口起一个内存 SSH
 * 服务端（临时 RSA host key，crypto.generateKeyPairSync 导出 pkcs1 PEM），只放行
 * 密码用户 test/secret。shell 回调实现一个微型伪 shell：
 *   - 连上先发送 prompt；
 *   - 收到 `printf "X%s\n" OK` / `echo X` 时返回可匹配文本（不回显输入行，匹配零歧义）；
 *   - 处理 `stty size`（返回 "rows cols"），验证 pty-req 初始尺寸与 resize 后的
 *     window-change 真正到达服务端（同 channel 顺序投递，resize 后紧跟的 stty
 *     必然读到新尺寸）；
 *   - `exit` 回送 exit-status 后关 channel。
 * 注意：客户端 conn.shell({term,cols,rows}) 会先发 pty-req，ssh2 服务端在没有
 * 'pty' 监听时会「自动拒绝」该请求导致 shell 开不起来 —— 必须接住并 accept。
 *
 * 然后用构建产物 ../lib/ssh.js 的 spawnSsh 以 auth=password 连上来，验证：
 *   S1 password 认证 + shell channel 建立，prompt 经输出流可见
 *   S2 printf / echo 命令输出可匹配（channel 数据往返）
 *   S3 stty size 返回 pty-req 初始尺寸（24x80 → "24 80"）
 *   S4 resize(110,33) 不抛错且生效（window-change → stty "33 110"）
 *   S5 terminate 后 done 恰好 resolve（含退出事实）
 *   S6 第二轮会话 exit 命令 → 服务端 exit-status → done.exitCode=0
 *
 * 用法：pnpm --filter @hyzyn/dsh-tty ssh-smoke（需先 build 产出 lib/ssh.js）
 * 退出码：0 = 全部 PASS，1 = 任一 FAIL。
 */
import ssh2 from 'ssh2'
import { generateKeyPairSync } from 'node:crypto'
import { spawnSsh } from '../lib/ssh.js'

const USER = 'test'
const PASSWORD = 'secret'
const PROMPT = 'dsh-ssh-smoke:~$ '

/* 全局看门狗：任何环节卡死时留痕退出（正常路径会先 process.exit）。 */
setTimeout(() => {
  console.error('[watchdog] 90s 看门狗触发：ssh-smoke 卡死')
  process.exit(2)
}, 90000).unref()
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason)
})

const RESULTS = []
function pass(name) { RESULTS.push(['PASS', name]); console.log('  ✔ PASS  ' + name) }
function fail(name, detail) { RESULTS.push(['FAIL', name, detail]); console.error('  ✘ FAIL  ' + name + (detail ? ' — ' + detail : '')) }
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** 累积终端输出直到匹配正则，超时 reject（先建订阅再写输入，无竞态窗口）。 */
function expectOutput(handle, re, timeoutMs = 8000, label = '输出') {
  return new Promise((resolve, reject) => {
    let buffer = ''
    const onData = (chunk) => {
      buffer += chunk.toString('utf8')
      const match = buffer.match(re)
      if (match) {
        clearTimeout(timer)
        handle.output.off('data', onData)
        resolve(match)
      }
    }
    const timer = setTimeout(() => {
      handle.output.off('data', onData)
      reject(new Error(`等待「${label}」超时；尾部输出: ${JSON.stringify(buffer.slice(-200))}`))
    }, timeoutMs)
    handle.output.on('data', onData)
  })
}

/** done 竞速：超时给出可读 FAIL 而不是等看门狗。 */
function expectDone(handle, timeoutMs = 10000) {
  return Promise.race([
    handle.done,
    new Promise((_, reject) => setTimeout(() => reject(new Error('done 未在 ' + timeoutMs + 'ms 内 resolve')), timeoutMs)),
  ])
}

/* ------------------------------------------------------------------ *
 * 内存 SSH server（伪 shell）
 * ------------------------------------------------------------------ */

/** 把一行命令翻译成响应；返回 true 表示 shell 应当结束（exit）。 */
function respondTo(stream, cmd, dims) {
  // stty size → "rows cols"（与真实 stty 输出格式一致）
  if (/^stty\s+size$/.test(cmd)) {
    stream.write(`${dims.rows} ${dims.cols}\r\n`)
    return false
  }
  // printf "FMT" [args…]：只支持 %s 占位符逐个吃参数（冒烟所需最小子集）
  const printf = cmd.match(/^printf\s+(["'])(.*?)\1(?:\s+(.*))?$/)
  if (printf) {
    const args = printf[3] === undefined ? [] : printf[3].split(/\s+/)
    let i = 0
    const text = printf[2].replace(/%s/g, () => args[i++] ?? '')
    stream.write(text.replace(/\\n/g, '\r\n') + '\r\n')
    return false
  }
  // echo [args…]
  const echo = cmd.match(/^echo\s+(.+?)\s*$/)
  if (echo) {
    const quoted = echo[1].match(/^(["'])(.*)\1$/)
    stream.write((quoted ? quoted[2] : echo[1].split(/\s+/).join(' ')) + '\r\n')
    return false
  }
  stream.write(`ssh-smoke: command not found: ${cmd}\r\n`)
  return false
}

function onClientConnection(client) {
  client.on('authentication', (ctx) => {
    if (ctx.method === 'password' && ctx.username === USER && ctx.password === PASSWORD) {
      ctx.accept()
      return
    }
    ctx.reject()
  })
  client.on('ready', () => {
    client.on('session', (accept) => {
      const session = accept()
      // 终端尺寸：pty-req 给初值，window-change 跟进（resize 验证的数据源）
      const dims = { rows: 24, cols: 80 }
      session.on('pty', (acceptPty, _rejectPty, info) => {
        if (Number.isFinite(info?.rows)) dims.rows = info.rows
        if (Number.isFinite(info?.cols)) dims.cols = info.cols
        acceptPty()
      })
      session.on('window-change', (_accept, _reject, info) => {
        if (Number.isFinite(info?.rows)) dims.rows = info.rows
        if (Number.isFinite(info?.cols)) dims.cols = info.cols
      })
      session.on('shell', (acceptShell) => {
        const stream = acceptShell()
        stream.write(PROMPT)
        let line = ''
        stream.on('data', (chunk) => {
          for (const ch of chunk.toString('utf8')) {
            if (ch === '\r' || ch === '\n') {
              const cmd = line.trim()
              line = ''
              if (cmd === 'exit' || cmd === 'logout') {
                // 先 exit-status 再 eof+close：客户端 channel 依次收到
                // exit(exitCode=0) 与 close → done resolve
                stream.exit(0)
                stream.end()
                return
              }
              if (cmd !== '') respondTo(stream, cmd, dims)
              stream.write(PROMPT)
            } else if (ch === '\x7f') {
              line = line.slice(0, -1) // 退格
            } else if (ch >= ' ') {
              line += ch
            }
          }
        })
      })
    })
  })
  client.on('error', (error) => {
    console.error('[ssh-smoke] 服务端 client 连接错误: ' + error.message)
  })
}

async function startServer() {
  // 临时 RSA host key：pkcs1 PEM（-----BEGIN RSA PRIVATE KEY-----），不落盘
  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
  })
  const server = new ssh2.Server({ hostKeys: [privateKey] }, onClientConnection)
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject)
      resolve()
    })
  })
  server.on('error', (error) => {
    console.error('[ssh-smoke] server 错误: ' + error.message)
  })
  return server
}

async function stopServer(server) {
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 3000).unref() // close 回调兜底，避免清理环节卡死
    server.close(() => {
      clearTimeout(timer)
      resolve()
    })
  })
  server.closeAllConnections?.()
}

/* ------------------------------------------------------------------ *
 * 主流程
 * ------------------------------------------------------------------ */

async function runSession(server, port, options, label) {
  console.log(`\n[${label}] spawnSsh → 127.0.0.1:${port}（auth=password, ${USER}/${PASSWORD}）`)
  const handle = await spawnSsh(
    { host: '127.0.0.1', port, username: USER, auth: 'password', password: PASSWORD },
    options,
  )
  return handle
}

async function main() {
  console.log('启动内存 SSH server（ssh2.Server @ 127.0.0.1 随机端口）…')
  const server = await startServer()
  const port = server.address().port
  console.log(`server 就绪 on 127.0.0.1:${port}，放行密码用户 ${USER}`)

  const options = { term: 'xterm-256color', cols: 80, rows: 24, logger: { info: (m) => console.log('  ' + m), warn: (m) => console.warn('  ' + m) } }

  // ---- 会话 1：认证/输出/resize/terminate ----
  console.log('\n[1] 全链路（spawn→prompt→printf/echo→stty→resize→terminate）')
  {
    let handle
    try {
      handle = await runSession(server, port, options, '1')
    } catch (error) {
      fail('S1 password 认证 + shell channel 建立（prompt 可见）', error.message)
      throw error
    }
    try {
      await expectOutput(handle, /dsh-ssh-smoke:~\$ /, 8000, 'prompt')
      pass('S1 password 认证 + shell channel 建立（prompt 经输出流可见）')
    } catch (error) {
      fail('S1 password 认证 + shell channel 建立（prompt 可见）', error.message)
    }

    // printf（先建订阅再写输入，无竞态窗口）
    try {
      const pending = expectOutput(handle, /SSH_SMOKE_OK/, 8000, 'printf 输出')
      await handle.write('printf "SSH_SMOKE_%s\\n" OK\n')
      await pending
      pass('S2a printf 命令输出可匹配（channel 数据往返）')
    } catch (error) {
      fail('S2a printf 命令输出可匹配（channel 数据往返）', error.message)
    }
    // echo
    try {
      const pending = expectOutput(handle, /SMOKE_ECHO_OK/, 8000, 'echo 输出')
      await handle.write('echo SMOKE_ECHO_OK\n')
      await pending
      pass('S2b echo 命令输出可匹配')
    } catch (error) {
      fail('S2b echo 命令输出可匹配', error.message)
    }

    // stty size：pty-req 初始尺寸（rows cols = "24 80"）
    try {
      const pending = expectOutput(handle, /(\d+)\s+(\d+)/, 8000, 'stty 初始尺寸')
      await handle.write('stty size\n')
      const m = await pending
      const ok = Number(m[1]) === 24 && Number(m[2]) === 80
      console.log(`    stty size → ${m[1]} ${m[2]}（期望 24 80）`)
      if (ok) pass('S3 stty size 命中 pty-req 初始尺寸（rows=24 cols=80）')
      else fail('S3 stty size 命中 pty-req 初始尺寸（rows=24 cols=80）', `得到 ${m[1]} ${m[2]}`)
    } catch (error) {
      fail('S3 stty size 命中 pty-req 初始尺寸（rows=24 cols=80）', error.message)
    }

    // resize：不抛错 + window-change 生效（同 channel 顺序投递，紧跟的 stty 必读到新尺寸）
    try {
      let threw = null
      try { handle.resize(110, 33) } catch (error) { threw = error }
      if (threw !== null) fail('S4 resize(110,33) 不抛错', threw.message)
      else {
        await sleep(100)
        const pending = expectOutput(handle, /(\d+)\s+(\d+)/, 8000, 'stty resize 后尺寸')
        await handle.write('stty size\n')
        const m = await pending
        const ok = Number(m[1]) === 33 && Number(m[2]) === 110
        console.log(`    resize(110,33) 后 stty size → ${m[1]} ${m[2]}（期望 33 110）`)
        if (ok) pass('S4 resize(110,33) 不抛错且 window-change 生效')
        else fail('S4 resize(110,33) 不抛错且 window-change 生效', `stty 报告 ${m[1]} ${m[2]}`)
      }
    } catch (error) {
      fail('S4 resize(110,33) 不抛错且 window-change 生效', error.message)
    }

    // terminate → done resolve（此时 channel 未自然退出，done 由 terminate 触发）
    try {
      let threw = null
      try { await handle.terminate() } catch (error) { threw = error }
      if (threw !== null) throw threw
      const outcome = await expectDone(handle)
      console.log(`    terminate → done resolve（exitCode=${outcome.exitCode} signal=${outcome.signal}）`)
      pass('S5 terminate 后 done resolve（含退出事实）')
    } catch (error) {
      fail('S5 terminate 后 done resolve（含退出事实）', error.message)
    }
  }

  // ---- 会话 2：exit 命令 → 服务端 exit-status → done.exitCode=0 ----
  console.log('\n[2] exit 命令自然退出（exit-status 路径）')
  {
    let handle
    try {
      handle = await runSession(server, port, options, '2')
      await expectOutput(handle, /dsh-ssh-smoke:~\$ /, 8000, 'prompt')
      const pending = expectDone(handle)
      await handle.write('exit\n')
      const outcome = await pending
      console.log(`    exit → done resolve（exitCode=${outcome.exitCode} signal=${outcome.signal}）`)
      if (outcome.exitCode === 0) pass('S6 exit 命令 → 服务端 exit-status → done.exitCode=0')
      else fail('S6 exit 命令 → 服务端 exit-status → done.exitCode=0', `exitCode=${outcome.exitCode}`)
    } catch (error) {
      fail('S6 exit 命令 → 服务端 exit-status → done.exitCode=0', error.message)
    }
  }

  // ---- 清理 ----
  console.log('\n[3] 清理内存 SSH server')
  await stopServer(server)
  console.log('server 已关闭（端口已释放）')

  const failed = RESULTS.filter(([kind]) => kind === 'FAIL')
  console.log(`\n==== SSH 冒烟：${RESULTS.length - failed.length}/${RESULTS.length} PASS ====`)
  for (const [kind, name, detail] of RESULTS) console.log(`  ${kind === 'PASS' ? '✔' : '✘'} ${name}${detail ? ' — ' + detail : ''}`)
  process.exit(failed.length > 0 ? 1 : 0)
}

main().catch((error) => {
  console.error('ssh-smoke 崩溃：', error)
  process.exit(1)
})
