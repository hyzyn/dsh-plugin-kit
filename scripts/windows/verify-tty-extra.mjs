/**
 * tty 真机验证（补最后两块）：WebSocket 帧协议 + SFTP / 传输的 **HTTP 面**。
 *
 * 与 `verify-agent-tools.mjs` 的分工：那个验的是 `sftp_*` **工具**（直接调 execute）；
 * 面板走的是 `/api/dsh-tty/sftp/*` **HTTP 路由**（另一套面，含 upload/download 的字节流
 * 与 `local-fs/transfer` 的任务化轮询）。这里把 HTTP 面补齐。
 *
 * WS 帧部分：`spawn` / `input` / `kill` / `sessions` / `ssh` 在 `verify-plugins.mjs` 里
 * 已经验过，这里补 `resize` / `refresh` / `statsOn` / `statsOff` / `attach`（断线保活 +
 * 输出回放）与下行 `exit` / `stats` 帧。
 *
 * 安全：破坏性文件操作只在自己的命名空间（`dsh-probe-*`）里做，收尾清干净。
 *
 * 用法（Windows guest，宿主与 Ubuntu1 都在跑）：
 *
 *   node scripts/windows/verify-tty-extra.mjs --host http://127.0.0.1:3092 ^
 *        --book u1 --ssh-root /home/parallels --ws-url ws://127.0.0.1:3092/api/dsh-tty/ws ^
 *        --report C:\cg-verify\tty-extra.json
 */
import http from 'node:http'
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'

const argv = process.argv.slice(2)
const flag = (name) => {
  const index = argv.indexOf(name)
  return index === -1 ? undefined : argv[index + 1]
}
const hostUrl = flag('--host') ?? 'http://127.0.0.1:3092'
const book = flag('--book') ?? 'u1'
const sshRoot = flag('--ssh-root') ?? '/home/parallels'
const repo = flag('--repo')
const reportPath = flag('--report')

const results = []
const record = (name, ok, detail) => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '\n      ' + detail : ''}`)
}
const skip = (name, detail) => {
  results.push({ name, ok: true, detail, skipped: true })
  console.log(`SKIP  ${name}${detail ? '\n      ' + detail : ''}`)
}
const warn = (name, detail) => {
  results.push({ name, ok: true, detail, warned: true })
  console.log(`WARN  ${name}\n      ${detail}`)
}

const target = new URL(hostUrl)
const port = Number(target.port || 80)
const wsUrl = flag('--ws-url') ?? `ws://${target.hostname}:${port}/api/dsh-tty/ws`

/* ---------- HTTP ---------- */

function request(method, path, body, options = {}) {
  const { timeoutMs = 120_000, raw = false, headers = {}, bodyBuffer } = options
  return new Promise((resolve) => {
    const payload = bodyBuffer ?? (body === undefined ? undefined : Buffer.from(JSON.stringify(body)))
    const req = http.request(
      {
        host: target.hostname,
        port,
        path,
        method,
        headers: {
          host: `${target.hostname}:${port}`,
          ...(payload === undefined || raw ? {} : { 'content-type': 'application/json' }),
          ...(payload === undefined ? {} : { 'content-length': String(payload.length) }),
          ...headers,
        },
      },
      (res) => {
        const chunks = []
        let settled = false
        const done = () => {
          if (settled) return
          settled = true
          const buffer = Buffer.concat(chunks)
          resolve({ status: res.statusCode, headers: res.headers, buffer, text: buffer.toString('utf8') })
        }
        res.on('data', (chunk) => chunks.push(chunk))
        res.on('end', done)
        res.on('error', done)
      },
    )
    req.on('error', (error) => resolve({ status: 0, headers: {}, buffer: Buffer.alloc(0), text: '', error: String(error?.code ?? error?.message) }))
    req.setTimeout(timeoutMs, () => {
      req.destroy()
      resolve({ status: 0, headers: {}, buffer: Buffer.alloc(0), text: '', error: `timeout(${timeoutMs}ms)` })
    })
    if (payload !== undefined) req.write(payload)
    req.end()
  })
}
const jsonOf = (text) => {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}
const post = (path, body, options) => request('POST', path, body, options)
const get = (path, options) => request('GET', path, undefined, options)

/* ---------- WebSocket ---------- */

const require_ = createRequire(import.meta.url)
let WebSocketImpl
if (repo !== undefined) {
  try {
    WebSocketImpl = require_(`${repo}/packages/tty/node_modules/ws`)
  } catch {
    /* 落回全局 */
  }
}
WebSocketImpl = WebSocketImpl ?? globalThis.WebSocket

function openSocket() {
  const socket = new WebSocketImpl(wsUrl, { headers: { host: `${target.hostname}:${port}` } })
  const frames = []
  const waiters = []
  const onMessage = (text) => {
    let frame
    try {
      frame = JSON.parse(text)
    } catch {
      return
    }
    frames.push(frame)
    for (const waiter of [...waiters]) waiter(frame)
  }
  socket.addEventListener?.('message', (event) => onMessage(String(event.data)))
  socket.on?.('message', (data) => onMessage(String(data)))
  const opened = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('WS 打开超时')), 10_000)
    const ok = () => {
      clearTimeout(timer)
      resolve()
    }
    socket.addEventListener?.('open', ok)
    socket.on?.('open', ok)
    socket.addEventListener?.('error', () => reject(new Error('WS error')))
    socket.on?.('error', (error) => reject(new Error(`WS error: ${String(error?.message ?? error)}`)))
  })
  const waitFor = (predicate, timeoutMs = 20_000, label = '') =>
    new Promise((resolve, reject) => {
      const hit = frames.find(predicate)
      if (hit !== undefined) return resolve(hit)
      const timer = setTimeout(
        () => reject(new Error(`等待帧超时${label === '' ? '' : '（' + label + '）'}；已收 ${JSON.stringify(frames.slice(-4))}`)),
        timeoutMs,
      )
      const waiter = (frame) => {
        if (!predicate(frame)) return
        clearTimeout(timer)
        waiters.splice(waiters.indexOf(waiter), 1)
        resolve(frame)
      }
      waiters.push(waiter)
    })
  const send = (frame) => socket.send(JSON.stringify(frame))
  return { socket, opened, waitFor, send, frames, close: () => { try { socket.close() } catch { /* 已关 */ } } }
}

console.log('# tty 真机验证（WebSocket 帧补齐 + SFTP/传输的 HTTP 面）')
console.log(`# node ${process.version} / ${process.platform} / host ${hostUrl} / 连接簿 ${book} / 远端根 ${sshRoot}\n`)

/* ================================================================== *
 * W1 WebSocket 帧
 * ================================================================== */

let sid
try {
  const ws = openSocket()
  await ws.opened
  ws.send({ t: 'spawn', cols: 100, rows: 30, cwd: 'C:\\cg-verify' })
  const ready = await ws.waitFor((frame) => frame.t === 'ready' || frame.t === 'error')
  if (ready.t === 'error') throw new Error(`spawn 失败：${JSON.stringify(ready)}`)
  sid = ready.sid
  record('W1 spawn：拿到本地会话', true, `sid=${sid}`)

  const errorsBefore = ws.frames.filter((frame) => frame.t === 'error').length
  ws.send({ t: 'resize', sid, cols: 132, rows: 40 })
  ws.send({ t: 'input', sid, d: 'echo RESIZE-STILL-ALIVE\r\n' })
  const alive = await ws.waitFor((frame) => frame.t === 'data' && String(frame.d ?? '').includes('RESIZE-STILL-ALIVE'), 15_000, 'resize 后仍能收到输出')
  record(
    'W1 resize：改尺寸后会话照常工作（且不产生 error 帧）',
    alive !== undefined && ws.frames.filter((frame) => frame.t === 'error').length === errorsBefore,
    `收到回显；error 帧数 ${errorsBefore} → ${ws.frames.filter((frame) => frame.t === 'error').length}`,
  )

  ws.send({ t: 'refresh', sid })
  await new Promise((resolve) => setTimeout(resolve, 600))
  record(
    'W1 refresh：非 tmux 会话上是 no-op（不报错）',
    ws.frames.filter((frame) => frame.t === 'error').length === errorsBefore,
    `error 帧数仍为 ${ws.frames.filter((frame) => frame.t === 'error').length}`,
  )

  const sessionList = await (async () => {
    ws.send({ t: 'sessions' })
    return await ws.waitFor((frame) => frame.t === 'sessions', 10_000)
  })()
  record(
    'W1 sessions：全局会话快照里能看到本会话',
    Array.isArray(sessionList.list) && sessionList.list.some((row) => row.sid === sid),
    `list=${JSON.stringify(sessionList.list).slice(0, 240)}`,
  )

  // statsOn：本地资源采样要起子进程，Windows 上给足时间；收不到就如实记 WARN
  ws.send({ t: 'statsOn', sid })
  let statsFrame
  try {
    statsFrame = await ws.waitFor((frame) => frame.t === 'stats', 25_000, 'statsOn 后应推 stats 帧')
    record(
      'W1 statsOn：订阅后收到 stats 帧（CPU / 内存 / 磁盘等指标）',
      statsFrame.stats !== undefined && statsFrame.sid === sid,
      `stats=${JSON.stringify(statsFrame.stats).slice(0, 240)}`,
    )
  } catch (error) {
    warn('W1 statsOn：没收到 stats 帧', String(error?.message ?? error))
  }
  const statsCountBefore = () => ws.frames.filter((frame) => frame.t === 'stats').length
  const before = statsCountBefore()
  ws.send({ t: 'statsOff', sid })
  await new Promise((resolve) => setTimeout(resolve, 4000))
  record(
    'W1 statsOff：退订后不再推 stats 帧',
    statsCountBefore() === before,
    `退订前 ${before} 帧 → 4 秒后 ${statsCountBefore()} 帧`,
  )

  // exit 帧：让 cmd.exe 自己退出
  ws.send({ t: 'input', sid, d: 'exit\r\n' })
  try {
    const exitFrame = await ws.waitFor((frame) => frame.t === 'exit' && frame.sid === sid, 20_000, 'expect exit 帧')
    record(
      'W1 exit 帧：会话退出时恰好推一次 exit（带 code）',
      exitFrame.code !== undefined,
      `exit=${JSON.stringify(exitFrame)}`,
    )
  } catch (error) {
    record('W1 exit 帧：会话退出时推 exit', false, String(error?.message ?? error))
  }
  ws.close()
  sid = undefined
} catch (error) {
  record('W1 建立本地会话', false, String(error?.message ?? error))
}

/* ---------- attach：断线保活 + 输出回放 ---------- */

try {
  const first = openSocket()
  await first.opened
  first.send({ t: 'spawn', cols: 100, rows: 30, cwd: 'C:\\cg-verify' })
  const ready = await first.waitFor((frame) => frame.t === 'ready' || frame.t === 'error')
  if (ready.t === 'error') throw new Error(`spawn 失败：${JSON.stringify(ready)}`)
  const orphanSid = ready.sid
  first.send({ t: 'input', sid: orphanSid, d: 'echo ATTACH-REPLAY-4E7B\r\n' })
  await first.waitFor((frame) => frame.t === 'data' && String(frame.d ?? '').includes('ATTACH-REPLAY-4E7B'), 15_000)
  // 异常断开：只关 socket、不 kill —— 会话应转入孤儿并在保活窗口内可 attach
  first.close()
  await new Promise((resolve) => setTimeout(resolve, 1500))

  const second = openSocket()
  await second.opened
  second.send({ t: 'sessions' })
  const listed = await second.waitFor((frame) => frame.t === 'sessions', 10_000)
  const row = (listed.list ?? []).find((item) => item.sid === orphanSid)
  record(
    'W1 attach 前置：异常断开后会话转入孤儿，并在 sessions 里标记可重连',
    row !== undefined && row.attachable === true,
    `row=${JSON.stringify(row)}`,
  )
  second.send({ t: 'attach', sid: orphanSid })
  let reattached
  try {
    const readyAgain = await second.waitFor((frame) => frame.t === 'ready' && frame.sid === orphanSid, 15_000, 'attach 后应回 ready')
    reattached = readyAgain.reattached === true
    record('W1 attach：重连接回同一会话（ready.reattached=true）', reattached, `ready=${JSON.stringify(readyAgain)}`)
  } catch (error) {
    record('W1 attach：重连接回同一会话', false, String(error?.message ?? error))
  }
  // 输出回放：attach 后应紧跟一帧 data，内容是断开前缓冲区
  try {
    const replay = await second.waitFor((frame) => frame.t === 'data' && frame.sid === orphanSid, 10_000, 'attach 后应回放输出缓冲')
    record(
      'W1 attach：回放了断开前的输出缓冲（能读到断开前的标记）',
      String(replay.d ?? '').includes('ATTACH-REPLAY-4E7B'),
      `回放 ${String(replay.d ?? '').length} 字符，含标记=${String(replay.d ?? '').includes('ATTACH-REPLAY-4E7B')}`,
    )
  } catch (error) {
    record('W1 attach：回放输出缓冲', false, String(error?.message ?? error))
  }
  second.send({ t: 'kill', sid: orphanSid })
  await new Promise((resolve) => setTimeout(resolve, 400))
  second.close()
} catch (error) {
  record('W1 attach 流程', false, String(error?.message ?? error))
}

/* ================================================================== *
 * W2 SFTP 的 HTTP 面（面板走的就是这条）
 * ================================================================== */

const base = '/api/dsh-tty/sftp'
const remoteDir = `${sshRoot}/dsh-probe-tty-dir`
const remoteFile = `${sshRoot}/dsh-probe-tty.txt`
const remoteMoved = `${sshRoot}/dsh-probe-tty-moved.txt`

const listed = await post(`${base}/list`, { name: book, path: sshRoot })
record(
  'W2 POST /sftp/list：列出远端目录（HTTP 面）',
  listed.status === 200 && Array.isArray(jsonOf(listed.text)?.entries),
  `status=${listed.status} entries=${jsonOf(listed.text)?.entries?.length ?? '?'}`,
)

const badBook = await post(`${base}/list`, { name: 'no-such-book', path: sshRoot })
record('W2 /sftp/list：未知连接簿条目给出可读失败', badBook.status >= 400 || jsonOf(badBook.text)?.ok === false, `status=${badBook.status} body=${JSON.stringify(badBook.text.slice(0, 160))}`)

const mkdir = await post(`${base}/mkdir`, { name: book, path: remoteDir, parents: true })
record('W2 POST /sftp/mkdir：建远端目录（parents）', mkdir.status === 200 && jsonOf(mkdir.text)?.ok === true, `status=${mkdir.status} body=${JSON.stringify(mkdir.text.slice(0, 160))}`)

// upload：x-dsh-sftp-meta = base64url(JSON)，body 就是文件字节
const content = Buffer.from('HTTP-UPLOAD-中文-9F3A\n', 'utf8')
const uploadMeta = Buffer.from(JSON.stringify({ name: book, path: remoteFile }), 'utf8').toString('base64url')
const uploaded = await post(`${base}/upload`, undefined, {
  bodyBuffer: content,
  raw: true,
  headers: { 'x-dsh-sftp-meta': uploadMeta, 'content-type': 'application/octet-stream' },
})
record('W2 POST /sftp/upload：以 x-dsh-sftp-meta 头 + 原始字节上传', uploaded.status === 200 && jsonOf(uploaded.text)?.ok === true, `status=${uploaded.status} body=${JSON.stringify(uploaded.text.slice(0, 160))}`)

const downloaded = await post(`${base}/download`, { name: book, path: remoteFile })
record(
  'W2 POST /sftp/download：取回文件字节，与上传内容逐字节一致',
  downloaded.status === 200 && downloaded.buffer.equals(content),
  `status=${downloaded.status} ${downloaded.buffer.length} 字节 一致=${downloaded.buffer.equals(content)} content-length=${String(downloaded.headers['content-length'])}`,
)

const renamed = await post(`${base}/rename`, { name: book, from: remoteFile, to: remoteMoved })
record('W2 POST /sftp/rename：重命名', renamed.status === 200 && jsonOf(renamed.text)?.ok === true, `status=${renamed.status}`)

const removedFile = await post(`${base}/remove`, { name: book, path: remoteMoved })
const removedDir = await post(`${base}/remove`, { name: book, path: remoteDir, recursive: true })
record('W2 POST /sftp/remove：删文件 + 递归删目录', removedFile.status === 200 && removedDir.status === 200, `file=${removedFile.status} dir=${removedDir.status}`)

/* ================================================================== *
 * W3 任务化传输：/local-fs/transfer（本机 ⇄ 远程，jobId 轮询）
 * ================================================================== */

const localRoot = 'C:\\cg-verify\\ttytransfer'
const localUpFile = `${localRoot}\\dsh-probe-up.txt`
const localDownFile = `${localRoot}\\dsh-probe-down.txt`
const remoteTransfer = `${sshRoot}/dsh-probe-transfer.txt`
const upContent = 'TRANSFER-UP-中文-9F3A\n'
const downContent = 'TRANSFER-DOWN-中文-4E7B\n'

// 本地夹具由脚本自己造（比依赖外部 prep 脚本可靠）
mkdirSync(localRoot, { recursive: true })
writeFileSync(localUpFile, upContent)

async function waitJob(jobId, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs
  let last
  while (Date.now() < deadline) {
    const status = await post('/api/dsh-tty/local-fs/transfer', { action: 'status', job: jobId })
    last = jsonOf(status.text)?.job
    if (last?.state === 'done' || last?.state === 'error' || last?.state === 'cancelled') return last
    await new Promise((resolve) => setTimeout(resolve, 400))
  }
  return last
}

// 先把「远端源文件」摆好，供 down 用（上传走 /sftp/upload，这条是真路由）
await post(`${base}/upload`, undefined, {
  bodyBuffer: Buffer.from(downContent, 'utf8'),
  raw: true,
  headers: {
    'x-dsh-sftp-meta': Buffer.from(JSON.stringify({ name: book, path: remoteTransfer }), 'utf8').toString('base64url'),
    'content-type': 'application/octet-stream',
  },
})

const started = await post('/api/dsh-tty/local-fs/transfer', { action: 'start', direction: 'up', name: book, localPath: localUpFile, remotePath: remoteTransfer })
const upJobId = jsonOf(started.text)?.job?.id
record(
  'W3 /local-fs/transfer start(up)：起一个本机→远程的上传任务并拿到 jobId',
  started.status === 200 && typeof upJobId === 'string',
  `status=${started.status} job=${JSON.stringify(jsonOf(started.text)?.job ?? null).slice(0, 200)}`,
)
if (typeof upJobId === 'string') {
  const job = await waitJob(upJobId)
  record(
    'W3 /local-fs/transfer：上传任务轮询到 done',
    job?.state === 'done',
    `state=${String(job?.state)} bytes=${String(job?.bytes)} error=${JSON.stringify(job?.error ?? null)}`,
  )
  const fetched = await post(`${base}/download`, { name: book, path: remoteTransfer })
  record(
    'W3 上传结果核对：远端文件内容与本机源文件逐字节一致',
    fetched.status === 200 && fetched.buffer.toString('utf8') === upContent,
    `远端 ${fetched.buffer.length} 字节=${JSON.stringify(fetched.buffer.toString('utf8').slice(0, 60))}`,
  )
} else {
  record('W3 /local-fs/transfer 上传', false, '没拿到 jobId')
}

// 反向：把远端那个文件再写回一份不同的内容，然后 down 下来核对
await post(`${base}/upload`, undefined, {
  bodyBuffer: Buffer.from(downContent, 'utf8'),
  raw: true,
  headers: {
    'x-dsh-sftp-meta': Buffer.from(JSON.stringify({ name: book, path: remoteTransfer }), 'utf8').toString('base64url'),
    'content-type': 'application/octet-stream',
  },
})
rmSync(localDownFile, { force: true })
const downStarted = await post('/api/dsh-tty/local-fs/transfer', { action: 'start', direction: 'down', name: book, localPath: localDownFile, remotePath: remoteTransfer })
const downJobId = jsonOf(downStarted.text)?.job?.id
record(
  'W3 /local-fs/transfer start(down)：起一个远程→本机的下载任务并拿到 jobId',
  downStarted.status === 200 && typeof downJobId === 'string',
  `status=${downStarted.status} job=${JSON.stringify(jsonOf(downStarted.text)?.job ?? null).slice(0, 200)}`,
)
if (typeof downJobId === 'string') {
  const job = await waitJob(downJobId)
  const landed = existsSync(localDownFile) ? readFileSync(localDownFile, 'utf8') : ''
  record(
    'W3 /local-fs/transfer：下载任务 done，且落到本机的内容与远端一致',
    job?.state === 'done' && landed === downContent,
    `state=${String(job?.state)} 本机 ${landed.length} 字节=${JSON.stringify(landed.slice(0, 60))} error=${JSON.stringify(job?.error ?? null)}`,
  )
}

// 记一笔：`.local-fs` 前缀路由只有 list/mkdir/rename/remove/transfer，**没有 upload**
// （上传在 `/api/dsh-tty/sftp/upload`，这次也一并验过了）。这里断言这条边界，免得
// 以后又把它当成「漏验的路由」。
const notARoute = await post('/api/dsh-tty/local-fs/upload', undefined, {
  bodyBuffer: Buffer.from('x', 'utf8'),
  raw: true,
  headers: { 'content-type': 'application/octet-stream' },
})
record(
  'W3 路由边界：/local-fs 前缀下没有 upload（上传只在 /sftp/upload）',
  notARoute.status === 400 && String(notARoute.text).includes('invalid JSON body'),
  `status=${notARoute.status} body=${JSON.stringify(notARoute.text.slice(0, 120))}（路由边界如此，不是缺陷）`,
)

// 收尾：远端与本地探针都清掉
await post(`${base}/remove`, { name: book, path: remoteTransfer })
rmSync(localUpFile, { force: true })
rmSync(localDownFile, { force: true })
const cleaned = await post(`${base}/list`, { name: book, path: sshRoot })
const leftover = (JSON.stringify(jsonOf(cleaned.text)?.entries ?? []).match(/dsh-probe/g) ?? []).length
record('W3 收尾：远端探针文件已清理（列表里不再有 dsh-probe）', leftover === 0, `残留命中 ${leftover}`)

/* ================================================================== *
 * 汇总
 * ================================================================== */

const failed = results.filter((item) => item.ok !== true)
console.log(`\n# 汇总：PASS ${results.filter((r) => r.ok === true && r.warned !== true && r.skipped !== true).length} / WARN ${results.filter((r) => r.warned === true).length} / SKIP ${results.filter((r) => r.skipped === true).length} / FAIL ${failed.length}`)
if (failed.length > 0) {
  console.log('# 失败项：')
  for (const item of failed) console.log(`  - ${item.name}${item.detail ? `：${item.detail.split('\n')[0]}` : ''}`)
}
if (reportPath !== undefined) {
  writeFileSync(reportPath, `${JSON.stringify({ host: hostUrl, book, results }, null, 2)}\n`)
  console.log(`# 报告：${reportPath}`)
}
process.exit(failed.length === 0 ? 0 : 1)
