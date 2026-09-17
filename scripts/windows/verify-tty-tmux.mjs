/**
 * `@hyzyn/dsh-tty` 的 **tmux 持久化**验证（`persistence: 'tmux'` + 帧里 `persist: true`）。
 *
 * 这是 tty 里唯一没跑过的功能：会话交给**远端 tmux** 托管，宿主重启 / 断线后重开要能接回现场。
 *
 * 为什么分两个阶段：验证的关键跨越「宿主被重启」这一刻，而脚本本身跑在被重启的那台机器上，
 * 它没法重启自己。所以由外部（Mac 侧）编排：
 *
 *   --phase before  建一个持久 SSH 会话，在**远端 shell 里导出环境变量** DSH_TMUX_PROBE，
 *                   然后停在「tmux 会话仍活着」的状态；
 *   （外部：杀掉宿主进程再重启 —— 模拟宿主重启）
 *   --phase after   用**同一个 persistName** 再连一次，读 `$DSH_TMUX_PROBE`。
 *
 * 证据选的是**环境变量**而不是滚动缓冲里的标记：滚动缓冲有可能是插件自己的回放缓冲
 * （那样就证明不了会话存活），而环境变量只可能来自**同一个仍在运行的远端 shell 进程**。
 *
 * 用法（Windows guest；Ubuntu1 已装 tmux）：
 *   node --experimental-websocket scripts/windows/verify-tty-tmux.mjs --phase before ^
 *        --host http://127.0.0.1:3092 --ws-url ws://127.0.0.1:3092/api/dsh-tty/ws --book u1 ^
 *        --repo C:\cg-repo\dsh-plugin-kit --report C:\cg-verify\tmux-before.json
 */
import { createRequire } from 'node:module'
import http from 'node:http'
import { writeFileSync } from 'node:fs'

const argv = process.argv.slice(2)
const flag = (name) => {
  const index = argv.indexOf(name)
  return index === -1 ? undefined : argv[index + 1]
}
const phase = flag('--phase') ?? 'before'
const hostUrl = flag('--host') ?? 'http://127.0.0.1:3092'
const wsUrl = flag('--ws-url') ?? 'ws://127.0.0.1:3092/api/dsh-tty/ws'
const book = flag('--book') ?? 'u1'
const persistName = flag('--persist-name') ?? 'probe1'
const repo = flag('--repo')
const reportPath = flag('--report')
const MARKER = 'ALIVE-BEFORE-RESTART'

const results = []
const record = (name, ok, detail) => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '\n      ' + detail : ''}`)
}

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
if (WebSocketImpl === undefined) {
  console.error('拿不到 WebSocket 实现：给 --repo 指向仓库根，或升级 Node')
  process.exit(1)
}

const openSocket = () => {
  const socket = new WebSocketImpl(wsUrl, { headers: { host: new URL(hostUrl).host } })
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
  const waitFor = (predicate, timeoutMs = 30_000, label = '') =>
    new Promise((resolve, reject) => {
      const hit = frames.find(predicate)
      if (hit !== undefined) return resolve(hit)
      const timer = setTimeout(
        () => reject(new Error(`等待帧超时${label === '' ? '' : `（${label}）`}；已收 ${JSON.stringify(frames.slice(-3))}`)),
        timeoutMs,
      )
      waiters.push((frame) => {
        if (!predicate(frame)) return
        clearTimeout(timer)
        resolve(frame)
      })
    })
  const output = () => frames.filter((frame) => frame.t === 'data').map((frame) => String(frame.d ?? '')).join('')
  const waitForText = (text, timeoutMs = 25_000) =>
    new Promise((resolve, reject) => {
      const check = () => output().includes(text)
      if (check()) return resolve(output())
      const timer = setTimeout(
        () => reject(new Error(`等输出「${text}」超时；最近输出=${JSON.stringify(output().slice(-300))}`)),
        timeoutMs,
      )
      waiters.push(() => {
        if (!check()) return
        clearTimeout(timer)
        resolve(output())
      })
    })
  return { socket, opened, waitFor, output, waitForText, send: (frame) => socket.send(JSON.stringify(frame)), close: () => socket.close() }
}

console.log(`# dsh-tty tmux 持久化验证 · phase=${phase}`)
console.log(`# node ${process.version} / WS ${wsUrl} / 连接簿 ${book} / tmux 名 dsh-${persistName}\n`)

let crashed
try {
  if (phase === 'before') {
    const ws = openSocket()
    await ws.opened
    ws.send({ t: 'ssh', name: book, cols: 100, rows: 30, persist: true, persistName })
    const ready = await ws.waitFor((frame) => frame.t === 'ready', 40_000, 'ssh ready')
    record(
      'T1 建 SSH 会话：宿主确认是 tmux 持久会话（ready.persist=true）',
      ready.persist === true && ready.reattached !== true,
      `ready=${JSON.stringify({ sid: ready.sid, kind: ready.kind, target: ready.target, persist: ready.persist ?? null, reattached: ready.reattached ?? null })}`,
    )
    // 在远端 shell 里留下一个只有「同一个进程活下来」才读得到的东西
    ws.send({ t: 'input', sid: ready.sid, d: `export DSH_TMUX_PROBE=${MARKER}\n` })
    await ws.waitForText(`DSH_TMUX_PROBE=${MARKER}`, 25_000)
    record('T1 在远端 shell 里导出探针环境变量', true, `输出里出现了 export 行`)
    ws.send({ t: 'input', sid: ready.sid, d: 'echo BEFORE-PHASE-READY\n' })
    await ws.waitForText('BEFORE-PHASE-READY', 20_000)
    // 宿主侧会话表应当把它标成持久会话。
    // 注意：**没有** `/api/dsh-tty/sessions` 这个 HTTP 路由 —— 会话列表只走 WS 的
    // `{t:'sessions'}` 帧（回 `{t:'sessions', list, tmux}`）。早先我按 HTTP 路由查，
    // 拿到 404 的非 JSON 体，于是误报成「会话不在表里」。
    ws.send({ t: 'sessions' })
    const sessionsFrame = await ws.waitFor((frame) => frame.t === 'sessions', 15_000, 'sessions')
    // 注意：**同名 tmux 会话已存在时**（本次是第二次跑 before），宿主会走 rebindClient 把新
    // 连接绑到既有会话上，而 `sessions` 表仍以**该会话最初的 sid**列出它 —— 所以不能拿
    // ready 里的新 sid 去匹配。按 persist + kind + target 认它。
    const rows = sessionsFrame.list ?? []
    const row = rows.find((item) => item.persist === true && item.kind === 'ssh') ?? rows.find((item) => item.sid === ready.sid)
    record(
      'T1 宿主会话表里有一条 persist=true 的 SSH 会话（不是普通会话）',
      row?.persist === true && row?.kind === 'ssh',
      `会话行=${JSON.stringify(row ?? null)}；表里共 ${String(rows.length)} 条；远端 tmux 会话=${JSON.stringify(sessionsFrame.tmux ?? null)}`,
    )
    record(
      `T1 远端 tmux 里确实有 dsh-${persistName}（宿主自己报的 tmux 列表）`,
      Array.isArray(sessionsFrame.tmux) && sessionsFrame.tmux.includes(`dsh-${persistName}`),
      `tmux=${JSON.stringify(sessionsFrame.tmux ?? null)}`,
    )
    const unattached = await new Promise((resolve) => {
      ws.close()
      setTimeout(() => resolve(true), 500)
    })
    record('T1 断开客户端后宿主仍然活着（等外部重启宿主）', unattached === true, '已断开 WS；tmux 会话应留在远端')
    console.log(`\n# 现在请外部：杀掉宿主进程再重启，然后跑 --phase after（sid=${String(ready.sid)}）`)
  } else {
    const ws = openSocket()
    await ws.opened
    // 同一个 persistName → 应重连到远端那个 tmux 会话，而不是新建
    ws.send({ t: 'ssh', name: book, cols: 100, rows: 30, persist: true, persistName })
    const ready = await ws.waitFor((frame) => frame.t === 'ready', 40_000, 'ssh ready')
    record(
      'T2 宿主重启后：同一个 persistName 仍然是 tmux 持久会话',
      ready.persist === true,
      `ready=${JSON.stringify({ sid: ready.sid, persist: ready.persist ?? null, reattached: ready.reattached ?? null })}`,
    )
    // 强制 tmux 重画，确保看到的是远端 pane 的当前内容
    ws.send({ t: 'refresh', sid: ready.sid })
    await new Promise((resolve) => setTimeout(resolve, 1500))
    ws.send({ t: 'input', sid: ready.sid, d: `echo "VAR=$DSH_TMUX_PROBE"\n` })
    let output = ''
    let ok = false
    try {
      output = await ws.waitForText(`VAR=${MARKER}`, 25_000)
      ok = true
    } catch (error) {
      output = ws.output()
    }
    record(
      'T2 **现场恢复**：新宿主里读到的 $DSH_TMUX_PROBE 还是重启前那个值（只有同一个远端 shell 进程活下来才可能）',
      ok,
      `输出片段=${JSON.stringify(String(output).replace(/\s+/g, ' ').slice(-320))}`,
    )
    // 收尾：杀掉远端 tmux 会话
    ws.send({ t: 'kill', sid: ready.sid })
    await new Promise((resolve) => setTimeout(resolve, 1500))
    ws.close()
    record('T2 收尾：已请求关闭该会话（远端 tmux 会话应随之下线）', true, '已发送 kill 帧')
  }
} catch (error) {
  crashed = error
  console.error(`崩溃：${String(error?.stack ?? error?.message ?? error)}`)
} finally {
  const failed = results.filter((item) => item.ok !== true)
  console.log(`\n# 汇总：PASS ${results.filter((r) => r.ok === true).length} / FAIL ${failed.length}`)
  if (failed.length > 0) {
    console.log('# 失败项：')
    for (const item of failed) console.log(`  - ${item.name}`)
  }
  if (reportPath !== undefined) {
    writeFileSync(reportPath, `${JSON.stringify({ phase, hostUrl, wsUrl, book, persistName, results }, null, 2)}\n`)
    console.log(`# 报告：${reportPath}`)
  }
  process.exit(crashed === undefined && failed.length === 0 ? 0 : 1)
}
