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
 *   S7 TOFU：首次连接经 HostKeyStore 记录 sha256 指纹
 *   S8 TOFU：同 host:port 换服务器密钥后，指纹变更拒绝连接（带重置指引）
 *   S9 SFTP（0.7.0）：scripts/lib/test-sshd.mjs 的 sftp subsystem（映射临时目录
 *      真实 fs）× 真实 SftpManager——list/realpath home/上传覆盖+追加/下载
 *      （含 content-length）/mkdir+rename+递归与非递归删除/TOFU 指纹变更拒绝；
 *      S9g（0.8.0）：mkdir parents 自底向上逐级补齐（幂等）+ tree 限深截断/全量
 *
 * 用法：pnpm --filter @hyzyn/dsh-tty ssh-smoke（需先 build 产出 lib/ssh.js、lib/sftp.js）
 * 退出码：0 = 全部 PASS，1 = 任一 FAIL。
 */
import ssh2 from 'ssh2'
import { generateKeyPairSync } from 'node:crypto'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawnSsh } from '../lib/ssh.js'
import { SftpManager } from '../lib/sftp.js'
import { startSftpSshd, TEST_USER, TEST_PASSWORD } from './lib/test-sshd.mjs'

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

async function startServer(preferredPort) {
  // 临时 RSA host key：pkcs1 PEM（-----BEGIN RSA PRIVATE KEY-----），不落盘。
  // 传 preferredPort 时复用同一端口（TOFU 用例：同 host:port 换密钥模拟指纹变更）
  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
  })
  let lastError = null
  for (let attempt = 0; attempt < 10; attempt++) {
    const server = new ssh2.Server({ hostKeys: [privateKey] }, onClientConnection)
    try {
      await new Promise((resolve, reject) => {
        server.once('error', reject)
        server.listen(preferredPort ?? 0, '127.0.0.1', () => {
          server.removeListener('error', reject)
          resolve()
        })
      })
      server.on('error', (error) => {
        console.error('[ssh-smoke] server 错误: ' + error.message)
      })
      return server
    } catch (error) {
      lastError = error
      await sleep(300) // 端口尚未完全释放（TIME_WAIT 等）：稍后重试
    }
  }
  throw lastError ?? new Error('startServer 重试耗尽')
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

  // TOFU 指纹存储（内存实现）：S1/S6 走 record + match，S8 用换密钥的服务端走 mismatch
  const fingerprintMap = new Map()
  const hostKeyStore = {
    get: (host, p) => fingerprintMap.get(host + ':' + p),
    record: (host, p, fp) => fingerprintMap.set(host + ':' + p, fp),
  }
  const options = { term: 'xterm-256color', cols: 80, rows: 24, hostKeyStore, logger: { info: (m) => console.log('  ' + m), warn: (m) => console.warn('  ' + m) } }

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

  // ---- TOFU 主机指纹钉扎（协议层）----
  console.log('\n[3] TOFU 主机指纹钉扎')
  {
    // S7：前两轮连接应已在 HostKeyStore 记录指纹
    const fp = hostKeyStore.get('127.0.0.1', port)
    if (typeof fp === 'string' && fp.length > 0) pass('S7 首次连接经 HostKeyStore 记录 sha256 指纹（' + fp.slice(0, 16) + '…）')
    else fail('S7 首次连接经 HostKeyStore 记录 sha256 指纹', String(fp))

    // S8：同 host:port 换一把服务器密钥 → 指纹变更必须拒绝连接
    await stopServer(server)
    const server2 = await startServer(port)
    console.log(`    已在 127.0.0.1:${port} 起新 server（不同 host key），验证指纹变更拒绝…`)
    let mismatchError = null
    try {
      await spawnSsh(
        { host: '127.0.0.1', port, username: USER, auth: 'password', password: PASSWORD },
        options,
      )
    } catch (error) {
      mismatchError = error instanceof Error ? error.message : String(error)
    }
    if (mismatchError !== null && /主机密钥指纹变更/.test(mismatchError)) pass('S8 指纹变更拒绝连接（错误含重置指引）')
    else fail('S8 指纹变更拒绝连接（错误含重置指引）', mismatchError === null ? '连接意外成功' : String(mismatchError))

    await stopServer(server2)
    console.log('两个内存 SSH server 均已关闭（端口已释放）')
  }

  // ---- SFTP（0.7.0）：test-sshd 的 sftp subsystem × 真实 SftpManager ----
  console.log('\n[4] SFTP 文件传输（test-sshd sftp subsystem × lib/sftp.js）')
  {
    const rootDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'dsh-tty-sftp-'))
    const sftpd = await startSftpSshd({ rootDir })
    console.log(`    sftp sshd on 127.0.0.1:${sftpd.port}，rootDir=${rootDir}`)
    await fsp.writeFile(path.join(rootDir, 'a.txt'), Buffer.alloc(100, 0x61))
    await fsp.mkdir(path.join(rootDir, 'sub'))
    await fsp.writeFile(path.join(rootDir, 'sub', 'nested.txt'), 'nested')

    const sftpLogger = { info: () => {}, warn: (m) => console.warn('  ' + m) }
    const acceptStore = { get: () => undefined, record: () => {} }
    const manager = new SftpManager(sftpLogger, acceptStore)
    const spec = { host: '127.0.0.1', port: sftpd.port, username: TEST_USER, auth: 'password', password: TEST_PASSWORD }

    // S9a 目录列表：真实路径、文件/目录判定与 size
    try {
      const listed = await manager.list(spec, rootDir)
      const aTxt = listed.entries.find((e) => e.name === 'a.txt')
      const sub = listed.entries.find((e) => e.name === 'sub')
      const ok = listed.path === rootDir
        && Array.isArray(listed.entries) && listed.entries.length === 2
        && aTxt?.isFile === true && aTxt?.size === 100
        && sub?.isDir === true && sub?.isFile === false
      if (ok) pass('S9a list 目录列表（真实路径、文件/目录判定与 size）')
      else fail('S9a list 目录列表（真实路径、文件/目录判定与 size）', JSON.stringify(listed).slice(0, 200))
    } catch (error) {
      fail('S9a list 目录列表（真实路径、文件/目录判定与 size）', error.message)
    }

    // S9b path 缺省 → realpath('.') 解析到登录 home（test-sshd 映射为 rootDir）
    try {
      const home = await manager.list(spec, '')
      if (home.path === rootDir) pass('S9b path 缺省 realpath 解析到登录 home')
      else fail('S9b path 缺省 realpath 解析到登录 home', 'path=' + String(home.path))
    } catch (error) {
      fail('S9b path 缺省 realpath 解析到登录 home', error.message)
    }

    // S9c 上传：覆盖写 + 追加写，字节逐一比对
    try {
      const data = Buffer.alloc(5000, 0x5a)
      const first = await manager.openUpload(spec, rootDir + '/up.bin')
      first.stream.write(data)
      first.stream.end()
      await first.done
      const second = await manager.openUpload(spec, rootDir + '/up.bin', true)
      second.stream.write('tail')
      second.stream.end()
      await second.done
      const expected = Buffer.concat([data, Buffer.from('tail')])
      const stored = await fsp.readFile(path.join(rootDir, 'up.bin'))
      if (stored.equals(expected)) pass('S9c 上传覆盖 + 追加（5000+4 字节逐一一致）')
      else fail('S9c 上传覆盖 + 追加（5000+4 字节逐一一致）', `落盘 ${String(stored.length)} 字节，期望 ${String(expected.length)}`)
    } catch (error) {
      fail('S9c 上传覆盖 + 追加（5000+4 字节逐一一致）', error.message)
    }

    // S9d 下载：字节一致 + size（content-length 数据源）
    try {
      const { stream, size } = await manager.openDownload(spec, rootDir + '/up.bin')
      const chunks = []
      for await (const chunk of stream) chunks.push(chunk)
      const downloaded = Buffer.concat(chunks)
      const expected = Buffer.concat([Buffer.alloc(5000, 0x5a), Buffer.from('tail')])
      if (downloaded.equals(expected) && size === expected.length) {
        pass('S9d 下载字节一致（stat size=' + String(size) + ' = 实际字节数）')
      } else {
        fail('S9d 下载字节一致（stat size 与实际一致）', `size=${String(size)} 实际=${String(downloaded.length)}`)
      }
    } catch (error) {
      fail('S9d 下载字节一致（stat size 与实际一致）', error.message)
    }

    // S9e mkdir / rename / 非递归删除拒绝 / 递归删除
    try {
      await manager.mkdir(spec, rootDir + '/nested')
      await manager.rename(spec, rootDir + '/a.txt', rootDir + '/nested/b.txt')
      const moved = await fsp.access(path.join(rootDir, 'nested', 'b.txt')).then(() => true, () => false)
      let refused = null
      try { await manager.remove(spec, rootDir + '/nested', false) } catch (error) { refused = error.message }
      const refusedOk = refused !== null && /recursive|非空/.test(refused)
      await manager.remove(spec, rootDir + '/nested', true)
      const gone = await fsp.access(path.join(rootDir, 'nested')).then(() => false, () => true)
      if (moved && refusedOk && gone) pass('S9e mkdir/rename/非递归删除拒绝/递归删除')
      else fail('S9e mkdir/rename/非递归删除拒绝/递归删除', `moved=${String(moved)} refused=${JSON.stringify(refused)} gone=${String(gone)}`)
    } catch (error) {
      fail('S9e mkdir/rename/非递归删除拒绝/递归删除', error.message)
    }

    // S9f TOFU：预置指纹与服务器不符 → SFTP 连接同样拒绝（与终端同源钉扎）
    try {
      const mismatchMap = new Map([[`127.0.0.1:${String(sftpd.port)}`, 'deadbeef'.repeat(8)]])
      const strictStore = { get: (host, p) => mismatchMap.get(host + ':' + String(p)), record: () => {} }
      const strictManager = new SftpManager(sftpLogger, strictStore)
      let mismatch = null
      try { await strictManager.list(spec, '') } catch (error) { mismatch = error.message }
      strictManager.disposeAll()
      if (mismatch !== null && /主机密钥指纹变更/.test(mismatch)) pass('S9f TOFU 指纹变更拒绝 SFTP 连接（错误含重置指引）')
      else fail('S9f TOFU 指纹变更拒绝 SFTP 连接（错误含重置指引）', mismatch === null ? '连接意外成功' : String(mismatch))
    } catch (error) {
      fail('S9f TOFU 指纹变更拒绝 SFTP 连接（错误含重置指引）', error.message)
    }

    // S9g mkdir parents 自底向上逐级补齐（mkdir -p 语义）+ tree 递归列举与限深
    try {
      const deep = rootDir + '/p/a/b/c'
      await manager.mkdir(spec, deep, true)
      await manager.mkdir(spec, rootDir + '/p', true) // 幂等：已存在目录不报错
      await fsp.writeFile(path.join(rootDir, 'p', 'a', 'b', 'c', 'leaf.txt'), 'leaf\n')
      const shallow = await manager.tree(spec, rootDir + '/p', { maxDepth: 1 })
      const full = await manager.tree(spec, rootDir + '/p', { maxDepth: 4 })
      const shallowOk = shallow.entries.length === 1 && shallow.entries[0].path === rootDir + '/p/a'
        && shallow.entries[0].isDir === true && shallow.truncated === true
      const fullOk = full.entries.map((e) => e.path).join('|') === [rootDir + '/p/a', rootDir + '/p/a/b', rootDir + '/p/a/b/c', rootDir + '/p/a/b/c/leaf.txt'].join('|')
        && full.truncated === false
        && full.entries[3].size === 'leaf\n'.length
      let noParentsRejected = false
      try { await manager.mkdir(spec, rootDir + '/q/r/s') } catch { noParentsRejected = true }
      await manager.remove(spec, rootDir + '/p', true)
      const cleaned = await fsp.access(path.join(rootDir, 'p')).then(() => false, () => true)
      if (shallowOk && fullOk && noParentsRejected && cleaned) pass('S9g mkdir parents 逐级补齐/幂等 + tree 限深截断/全量')
      else fail('S9g mkdir parents 逐级补齐/幂等 + tree 限深截断/全量', `shallow=${JSON.stringify(shallow.entries).slice(0, 100)} truncated=${String(shallow.truncated)} full=${full.entries.map((e) => e.path).join('|')} noParents=${String(noParentsRejected)} cleaned=${String(cleaned)}`)
    } catch (error) {
      fail('S9g mkdir parents 逐级补齐/幂等 + tree 限深截断/全量', error.message)
    }

    manager.disposeAll()
    await sftpd.close()
    await fsp.rm(rootDir, { recursive: true, force: true })
    console.log('    sftp sshd 已关闭，临时目录已清理')
  }

  {
    const failed = RESULTS.filter(([kind]) => kind === 'FAIL')
    console.log(`\n==== SSH 冒烟：${RESULTS.length - failed.length}/${RESULTS.length} PASS ====`)
    for (const [kind, name, detail] of RESULTS) console.log(`  ${kind === 'PASS' ? '✔' : '✘'} ${name}${detail ? ' — ' + detail : ''}`)
    process.exit(failed.length > 0 ? 1 : 0)
  }
}

main().catch((error) => {
  console.error('ssh-smoke 崩溃：', error)
  process.exit(1)
})
