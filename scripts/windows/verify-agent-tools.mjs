/**
 * agent 工具真机验证：把 `@hyzyn/dsh-tty` 的 13 个与 `@hyzyn/dsh-docker` 的 16 个
 * agent 工具（共 29 个）**真的调一遍** —— 参数、execute、输出与 render。
 *
 * 为什么是「进程内挂载」而不是打活宿主：DSH 的工具是交给 agent loop 调的，而 agent loop
 * 需要 LLM；核心的 `/api/*` 又全部走 web app 的鉴权层，没有任何「直接调工具」的 HTTP 面
 * （真机上探测过）。所以本脚本自己当最小宿主：
 *
 *   - 用假 cordis ctx 把插件挂起来，从 `ctx.tools.register` 捕获 29 个 `defineTool` 定义；
 *   - **后端全是真的**：docker 走真 SSH 到远端真 daemon；PTY 用 DSH 自带的那份 node-pty；
 *     SFTP 走真 ssh2；隧道列表来自真实 TunnelManager；
 *   - 为了拿到终端会话，脚本起一个**真的 http.Server** 并把插件的 `register` /
 *     `registerUpgrade` 路由接上去，然后用真 WebSocket 走插件自己的帧协议 spawn
 *     本地与 SSH 会话 —— 于是 tty_capture / tty_send / tty_expect / tty_screen
 *     拿到的都是有真输出的会话。
 *
 * 边界如实说明：这样验的是**工具层**（参数 schema、execute 接线、输出形状、render、
 * 权限门禁）。agent 调度 → 工具的那段管线是 DSH 核心的职责，不在本仓库范围内。
 *
 * 安全约束（不可关闭）：所有破坏性工具调用的对象名必须以上缀（默认 `dsh-probe`）开头。
 *
 * 用法（Windows guest，宿主不必在跑）：
 *
 *   node scripts/windows/verify-agent-tools.mjs --repo C:\cg-repo\dsh-plugin-kit ^
 *        --node-pty "C:\...\dsh\node_modules\node-pty" --docker-target u1 --ssh-book u1 ^
 *        --port 3199 --report C:\cg-verify\agent-tools.json
 */
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { existsSync, writeFileSync } from 'node:fs'
import { PassThrough } from 'node:stream'
import { pathToFileURL } from 'node:url'

const argv = process.argv.slice(2)
const flag = (name) => {
  const index = argv.indexOf(name)
  return index === -1 ? undefined : argv[index + 1]
}
const repo = flag('--repo') ?? process.cwd()
const nodePtyPath = flag('--node-pty')
const dockerTarget = flag('--docker-target') ?? 'u1'
const sshBook = flag('--ssh-book') ?? dockerTarget
const port = Number(flag('--port') ?? 3199)
const prefix = flag('--prefix') ?? 'dsh-probe'
const reportPath = flag('--report')
const sshHost = flag('--ssh-host') ?? '10.211.55.5'
const sshUser = flag('--ssh-user') ?? 'parallels'
const keyPath = flag('--ssh-key') ?? 'C:\\cg-verify\\ssh\\id_ed25519'

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
const assertMine = (label, value) => {
  if (typeof value !== 'string' || !value.startsWith(prefix)) throw new Error(`拒绝操作非夹具资源：${label}=${JSON.stringify(value)}`)
  return value
}

console.log('# agent 工具真机验证（29 个：tty 13 + docker 16）')
console.log(`# node ${process.version} / ${process.platform} / repo ${repo}\n`)

/* ================================================================== *
 * node-pty：模拟 DSH 的 spawnTerminal（形状抄 dsh-subprocess-local）
 * ================================================================== */

let nodePty
if (nodePtyPath === undefined) {
  console.log('提示：未给 --node-pty，本地终端会话相关工具会 SKIP')
} else {
  try {
    nodePty = createRequire(import.meta.url)(nodePtyPath)
    console.log(`# node-pty 已加载：${nodePtyPath}\n`)
  } catch (error) {
    console.log(`提示：node-pty 加载失败（${String(error?.message ?? error)}），本地终端工具会 SKIP\n`)
  }
}

function spawnTerminal(spec) {
  const ptyProcess = nodePty.spawn(spec.argv[0], spec.argv.slice(1), {
    name: 'dumb',
    cols: Number(spec.cols) || 80,
    rows: Number(spec.rows) || 24,
    cwd: spec.cwd,
    env: { ...process.env, ...(spec.env ?? {}) },
  })
  const output = new PassThrough()
  ptyProcess.onData((data) => output.write(Buffer.from(data, 'utf8')))
  const done = new Promise((resolve) => {
    ptyProcess.onExit(({ exitCode, signal }) => {
      output.end()
      resolve({ exitCode: exitCode === undefined ? null : exitCode, signal: signal === undefined ? null : String(signal) })
    })
  })
  return {
    pid: ptyProcess.pid,
    output,
    write: async (data) => ptyProcess.write(data),
    terminate: async () => {
      try {
        ptyProcess.kill()
      } catch {
        /* 已退出 */
      }
    },
    done,
    terminal: {
      resize: (cols, rows) => ptyProcess.resize(cols, rows),
      kill: (signal) => ptyProcess.kill(signal),
    },
  }
}

/* ================================================================== *
 * 最小宿主
 * ================================================================== */

const TTY_SETTINGS = {
  enabled: true,
  announceToAgent: false,
  shell: process.env.ComSpec ?? 'cmd.exe',
  term: 'xterm-256color',
  // 注意：真实配置里 colorTerm 是**字符串**（'truecolor'），不是布尔 —— 插件对它调 .trim()
  colorTerm: 'truecolor',
  shellIntegration: false,
  cwd: repo,
  maxSessions: 8,
  reconnectGraceSec: 60,
  persistence: 'none',
  statsEnabled: true,
  sshHosts: [
    { name: sshBook, host: sshHost, port: 22, username: sshUser, auth: 'key', keyPath, passphrase: '', password: '', agentForward: false, persist: false },
  ],
  hostKeys: [],
  tunnels: [],
}

const DOCKER_SETTINGS = {
  enabled: true,
  announceToAgent: false,
  dockerBin: 'docker',
  allowMutations: true,
  allowExec: true,
  execTimeoutSec: 30,
  pollIntervalSec: 5,
  logTailDefault: 200,
  maxOutputKb: 512,
  targets: [{ name: dockerTarget, kind: 'ssh', book: '', host: sshHost, port: 22, username: sshUser, auth: 'key', keyPath, password: '', passphrase: '', agentForward: false }],
  hostKeys: [],
}

const routes = []
const upgrades = []
const tools = new Map()
/** 工具的注册表服务：docker 经 inject(['tools'])、tty 经 ctx.get('tools')，两边同一个实例。 */
const toolsService = {
  register: (definition) => {
    tools.set(definition.name, definition)
    return () => tools.delete(definition.name)
  },
}

function makeCtx(namespace) {
  const settingsSection = namespace === 'tty' ? TTY_SETTINGS : namespace === 'docker' ? DOCKER_SETTINGS : {}
  const scope = {
    get: () => structuredClone(settingsSection),
    update: async () => {},
  }
  const makeChild = (names) => {
    const child = {
      logger: { info: () => {}, warn: () => {}, error: () => {} },
      effect: (callback) => {
        callback()
        return () => {}
      },
      inject: (childNames, cb) => {
        cb(makeChild(childNames))
        return () => {}
      },
      events: { on: () => () => {}, emit: () => {} },
      on: () => () => {},
      // tty 走 ctx.get('tools') / ctx.get('subprocess')，不走 inject
      get: (name) => {
        if (name === 'tools') return toolsService
        if (name === 'subprocess' && nodePty !== undefined) return { spawnTerminal }
        return undefined
      },
    }
    if (names.includes('webServer')) {
      child.webServer = {
        register: (route) => {
          routes.push(route)
          return () => {}
        },
        registerUpgrade: (route) => {
          upgrades.push(route)
          return () => {}
        },
      }
    }
    if (names.includes('settings')) {
      child.settings = {
        register: () => scope,
        get: () => settingsSection,
        scope: () => scope,
        update: async () => {},
      }
    }
    if (names.includes('tools')) child.tools = toolsService
    if (names.includes('credentials')) {
      child.credentials = { resolve: async () => undefined, list: async () => [], set: async () => {} }
    }
    if (names.includes('systemPrompt')) child.systemPrompt = { section: () => () => {} }
    return child
  }
  const root = makeChild([])
  root.inject = (names, cb) => {
    cb(makeChild(names))
    return () => {}
  }
  return root
}

// tty 优先挂载：它注册 WS 升级路由，需要一个真的 http.Server 才能拿到会话
const ttyUrl = pathToFileURL(`${repo}/packages/tty/lib/index.js`).href
const dockerUrl = pathToFileURL(`${repo}/packages/docker/lib/index.js`).href
const ttyModule = await import(ttyUrl)
const dockerModule = await import(dockerUrl)

const server = createServer((req, res) => {
  const pathname = new URL(req.url ?? '/', 'http://127.0.0.1').pathname
  for (const route of routes) {
    const hit = route.kind === 'prefix' ? pathname.startsWith(route.path) : pathname === route.path
    if (hit) {
      Promise.resolve(route.handler(req, res)).catch((error) => {
        try {
          res.writeHead(500)
          res.end(String(error?.message ?? error))
        } catch {
          /* 已响应 */
        }
      })
      return
    }
  }
  res.writeHead(404, { 'content-type': 'application/json' })
  res.end(JSON.stringify({ error: 'no route: ' + pathname }))
})
server.on('upgrade', (req, socket, head) => {
  const pathname = new URL(req.url ?? '/', 'http://127.0.0.1').pathname
  const hit = upgrades.find((route) => route.path === pathname)
  if (hit === undefined) {
    socket.destroy()
    return
  }
  try {
    hit.handler(req, socket, head)
  } catch {
    socket.destroy()
  }
})

ttyModule.apply(makeCtx('tty'), TTY_SETTINGS)
dockerModule.apply(makeCtx('docker'), DOCKER_SETTINGS)
await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve))
console.log(`# 最小宿主已就绪：http://127.0.0.1:${port}（路由 ${routes.length} / 升级 ${upgrades.length}）`)
console.log(`# 捕获到工具 ${tools.size} 个：${JSON.stringify([...tools.keys()])}\n`)

/* ================================================================== *
 * 工具调用脚手架
 * ================================================================== */

/** 每个工具实际收到的 args（供 schema 自洽检查用）。 */
const calledArgs = new Map()

/** 静态 schema 自检：parameters 规范化成 JSON Schema 且每项都有 type，execute/render 都在。 */
const schemaProblems = []
for (const [name, definition] of tools) {
  if (typeof definition.description !== 'string' || definition.description.length < 10) schemaProblems.push(`${name}: description 缺失`)
  if (typeof definition.execute !== 'function') schemaProblems.push(`${name}: 没有 execute`)
  if (definition.output?.render === undefined) schemaProblems.push(`${name}: 没有 output.render`)
  if (definition.output?.schema === undefined) schemaProblems.push(`${name}: 没有 output.schema`)
  // defineTool 把源码里那种 `{ sid: { type:'string', required:true } }` 规范化成了
  // 标准 JSON Schema：`{ type:'object', properties:{...}, required:[...] }`。
  const params = definition.parameters ?? {}
  const normalized = params.type === 'object' && params.properties !== undefined
  if (!normalized) schemaProblems.push(`${name}: parameters 未规范化成 JSON Schema`)
  const properties = normalized ? params.properties : params
  for (const [key, spec] of Object.entries(properties)) {
    if (typeof spec?.type !== 'string') schemaProblems.push(`${name}.${key}: 缺 type`)
  }
  // 我实际传进去的 args 必须满足它自己声明的 required —— 参数自洽
  const args = calledArgs.get(name)
  if (args !== undefined) {
    for (const key of Array.isArray(params.required) ? params.required : []) {
      if (args[key] === undefined) schemaProblems.push(`${name}: 调用时漏了 required 参数 ${key}`)
    }
  }
}

async function callTool(name, args) {
  const definition = tools.get(name)
  if (definition === undefined) throw new Error(`工具未注册：${name}`)
  calledArgs.set(name, args)
  const value = await definition.execute(args)
  let rendered
  try {
    rendered = definition.output.render(args, value)
  } catch (error) {
    rendered = `render 抛错：${String(error?.message ?? error)}`
  }
  return { value, rendered }
}
const callSafe = async (name, args) => {
  try {
    return { ok: true, ...(await callTool(name, args)) }
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error) }
  }
}
const renderedText = (rendered) => (Array.isArray(rendered) ? rendered.map((part) => part?.text ?? '').join('\n') : String(rendered))

/* ================================================================== *
 * T1 docker 工具（16 个）
 * ================================================================== */

const dockerTools = [...tools.keys()].filter((name) => name.startsWith('docker_'))
record(
  'T1 工具注册：docker 的 16 个工具都在（含 5 个变更/exec 工具 —— allowMutations/allowExec 打开后才注册）',
  dockerTools.length === 16,
  `${dockerTools.length} 个：${JSON.stringify(dockerTools)}`,
)

{
  const r = await callSafe('docker_targets', { probe: false })
  record('T1 docker_targets：列出目标', r.ok === true && (r.value?.targets ?? []).some((row) => row.name === dockerTarget), `${JSON.stringify(r.value).slice(0, 240)}`)
}
{
  const r = await callSafe('docker_ps', { target: dockerTarget, all: true })
  const rows = r.value?.containers ?? []
  const mine = rows.filter((row) => String(row.name).startsWith(prefix))
  record(
    'T1 docker_ps：列出容器并在结果里带上夹具与 compose 标签',
    r.ok === true && rows.length > 0 && mine.length >= 5,
    `${rows.length} 个容器，夹具 ${mine.length} 个：${JSON.stringify(mine.map((row) => row.name).slice(0, 6))}`,
  )
}
{
  const r = await callSafe('docker_attention', { target: dockerTarget })
  const text = JSON.stringify(r.value)
  record(
    'T1 docker_attention：三类需关注都被识别（unhealthy / 反复重启 / 非零退出）',
    r.ok === true && text.includes(`${prefix}-unhealthy`) && text.includes(`${prefix}-restart`) && text.includes(`${prefix}-exited`),
    `渲染=${JSON.stringify(renderedText(r.rendered).slice(0, 300))}`,
  )
}
{
  const r = await callSafe('docker_inspect', { target: dockerTarget, id: assertMine('id', `${prefix}-run`) })
  const detail = String(r.value?.detail ?? '')
  record(
    'T1 docker_inspect：拿到容器详情（{ target, detail } 文本）',
    r.ok === true && detail.length > 40 && detail.includes(assertMine('id', `${prefix}-run`)),
    `detail ${detail.length} 字符：${JSON.stringify(detail.slice(0, 160))}`,
  )
}
{
  const r = await callSafe('docker_stats', { target: dockerTarget, ids: `${prefix}-run` })
  record('T1 docker_stats：拿到资源占用', r.ok === true && r.value?.stats !== undefined, JSON.stringify(r.value).slice(0, 240))
}
{
  const r = await callSafe('docker_logs', { target: dockerTarget, id: assertMine('id', `${prefix}-run`), tail: 20 })
  const text = r.value?.logs?.text ?? r.value?.text ?? ''
  record('T1 docker_logs：拿到日志尾巴', r.ok === true && typeof text === 'string' && text.length > 0, `${typeof text === 'string' ? text.length : 0} 字节`)
}
{
  const r = await callSafe('docker_events', { target: dockerTarget, since: '10m' })
  record('T1 docker_events：拿到事件快照', r.ok === true, JSON.stringify(r.value).slice(0, 200))
}
{
  const r = await callSafe('docker_images', { target: dockerTarget })
  const text = JSON.stringify(r.value)
  record('T1 docker_images：列出镜像（含用户的 nginx / neo4j）', r.ok === true && text.includes('nginx') && text.includes('neo4j'), `${(r.value?.images ?? []).length} 个`)
}
{
  const r = await callSafe('docker_image_inspect', { target: dockerTarget, ref: `${prefix}-img:test` })
  const imageDetail = String(r.value?.detail ?? '')
  record(
    'T1 docker_image_inspect：拿到层/大小/构建历史（{ target, ref, detail } 文本）',
    r.ok === true && imageDetail.length > 40 && imageDetail.includes('dsh-probe-img'),
    `detail ${imageDetail.length} 字符：${JSON.stringify(imageDetail.slice(0, 160))}`,
  )
}
{
  const r = await callSafe('docker_networks', { target: dockerTarget })
  record('T1 docker_networks：列出网络（栈网络在）', r.ok === true && JSON.stringify(r.value).includes('neo4j-stack_default'), `${(r.value?.networks ?? []).length} 个`)
}
{
  const r = await callSafe('docker_volumes', { target: dockerTarget })
  record('T1 docker_volumes：列出卷（4 个数据卷在）', r.ok === true && JSON.stringify(r.value).includes('neo4j-stack_neo4j_data'), `${(r.value?.volumes ?? []).length} 个`)
}
{
  const r = await callSafe('docker_exec', { target: dockerTarget, id: assertMine('id', `${prefix}-run`), command: 'echo TOOL-EXEC-9F3A' })
  record('T1 docker_exec：在容器里执行命令并取回 stdout', r.ok === true && JSON.stringify(r.value).includes('TOOL-EXEC-9F3A'), JSON.stringify(r.value).slice(0, 200))
}
{
  // 变更类：只对自己那个容器
  const stop = await callSafe('docker_action', { target: dockerTarget, id: assertMine('id', `${prefix}-run`), action: 'stop' })
  const start = await callSafe('docker_action', { target: dockerTarget, id: assertMine('id', `${prefix}-run`), action: 'start' })
  const restart = await callSafe('docker_action', { target: dockerTarget, id: assertMine('id', `${prefix}-run`), action: 'restart' })
  record('T1 docker_action：stop → start → restart 都成功', stop.ok && start.ok && restart.ok, `stop=${stop.ok} start=${start.ok} restart=${restart.ok}`)
  const bad = await callSafe('docker_action', { target: dockerTarget, id: assertMine('id', `${prefix}-run`), action: 'nuke' })
  record('T1 docker_action：非法 action 被工具自己拒绝（抛错而不是静默执行）', bad.ok === false, `error=${String(bad.error).slice(0, 120)}`)
}
{
  const r = await callSafe('docker_image_prune', { target: dockerTarget })
  record('T1 docker_image_prune：清理 dangling（当前无 dangling，应为 no-op 且不报错）', r.ok === true, JSON.stringify(r.value).slice(0, 160))
}
{
  const before = await callSafe('docker_images', { target: dockerTarget })
  if (!JSON.stringify(before.value).includes(`${prefix}-img:gone`)) {
    skip('T1 docker_image_remove', `夹具标签 ${prefix}-img:gone 不存在（上一轮已删：先重跑夹具脚本）`)
  } else {
    const r = await callSafe('docker_image_remove', { target: dockerTarget, ref: assertMine('ref', `${prefix}-img:gone`) })
    const after = await callSafe('docker_images', { target: dockerTarget })
    record(
      'T1 docker_image_remove：删掉自己的镜像标签，没连累别的镜像',
      r.ok === true && !JSON.stringify(after.value).includes(`${prefix}-img:gone`) && JSON.stringify(after.value).includes('nginx:latest'),
      `ok=${r.ok} 已消失=${!JSON.stringify(after.value).includes(`${prefix}-img:gone`)} nginx:latest 还在=${JSON.stringify(after.value).includes('nginx:latest')}`,
    )
  }
}
{
  // 无外网的机器上这条会失败——但「失败也要是可读的失败」正是要验的
  const r = await callSafe('docker_image_pull', { target: dockerTarget, ref: 'alpine:3.20' })
  if (r.ok) record('T1 docker_image_pull：拉取镜像成功', true, JSON.stringify(r.value).slice(0, 160))
  else record('T1 docker_image_pull：无外网时给出可读失败（而不是挂死或裸栈）', typeof r.error === 'string' && r.error.length > 10, `error=${String(r.error).slice(0, 200)}`)
}
{
  const r = await callSafe('docker_ps', { target: 'nope-does-not-exist' })
  record('T1 docker_ps：未知目标被拒（抛错并给出原因）', r.ok === false && typeof r.error === 'string', `error=${String(r.error).slice(0, 160)}`)
}

/* ================================================================== *
 * T2 tty 工具（13 个）
 * ================================================================== */

const ttyTools = [...tools.keys()].filter((name) => name.startsWith('tty_') || name.startsWith('tunnel_') || name.startsWith('sftp_'))
record(
  'T2 工具注册：tty 的 13 个工具都在（13 = 5 会话 + 1 隧道 + 7 SFTP）',
  ttyTools.length === 13,
  `${ttyTools.length} 个：${JSON.stringify(ttyTools)}`,
)

// 用真 WebSocket 走插件自己的帧协议，spawn 一个本地会话与一个 SSH 会话
const wsRequire = createRequire(import.meta.url)
let WebSocketImpl
try {
  WebSocketImpl = wsRequire(`${repo}/packages/tty/node_modules/ws`)
} catch {
  WebSocketImpl = globalThis.WebSocket
}

async function withSocket(fn) {
  const socket = new WebSocketImpl(`ws://127.0.0.1:${port}/api/dsh-tty/ws`, { headers: { host: `127.0.0.1:${port}` } })
  const frames = []
  const waiters = []
  socket.addEventListener?.('message', (event) => onMessage(String(event.data)))
  socket.on?.('message', (data) => onMessage(String(data)))
  function onMessage(text) {
    let frame
    try {
      frame = JSON.parse(text)
    } catch {
      return
    }
    frames.push(frame)
    for (const waiter of [...waiters]) waiter(frame)
  }
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('WS 打开超时')), 10_000)
    const open = () => {
      clearTimeout(timer)
      resolve()
    }
    socket.addEventListener?.('open', open)
    socket.on?.('open', open)
    socket.addEventListener?.('error', () => reject(new Error('WS error')))
    socket.on?.('error', (error) => reject(new Error(`WS error: ${String(error?.message ?? error)}`)))
  })
  const waitFor = (predicate, timeoutMs = 20_000) =>
    new Promise((resolve, reject) => {
      const hit = frames.find(predicate)
      if (hit !== undefined) return resolve(hit)
      const timer = setTimeout(() => reject(new Error('等待帧超时；已收 ' + JSON.stringify(frames.slice(-3)))), timeoutMs)
      const waiter = (frame) => {
        if (!predicate(frame)) return
        clearTimeout(timer)
        waiters.splice(waiters.indexOf(waiter), 1)
        resolve(frame)
      }
      waiters.push(waiter)
    })
  try {
    return await fn(socket, waitFor, frames)
  } finally {
    try {
      socket.close()
    } catch {
      /* 已关 */
    }
  }
}

let localSid
let sshSid
if (nodePty === undefined) {
  skip('T2 会话类工具', '未加载 node-pty')
} else {
  try {
    localSid = await withSocket(async (socket, waitFor) => {
      socket.send(JSON.stringify({ t: 'spawn', cols: 100, rows: 30, cwd: repo }))
      const ready = await waitFor((frame) => frame.t === 'ready' || frame.t === 'error')
      if (ready.t === 'error') throw new Error(`spawn 失败：${JSON.stringify(ready)}`)
      socket.send(JSON.stringify({ t: 'input', sid: ready.sid, d: 'echo LOCAL-TOOL-9F3A\r\n' }))
      await waitFor((frame) => frame.t === 'data' && String(frame.d ?? '').includes('LOCAL-TOOL-9F3A'))
      return ready.sid
    })
  } catch (error) {
    record('T2 建立本地 PTY 会话（真 node-pty）', false, String(error?.message ?? error))
  }
  if (localSid !== undefined) record('T2 建立本地 PTY 会话（真 node-pty）并回显命令', true, `sid=${localSid}`)
}

{
  const r = await callSafe('tty_list', {})
  const sessions = r.value?.sessions ?? []
  record(
    'T2 tty_list：列出活跃会话（本地会话在列，字段齐全）',
    r.ok === true && sessions.some((row) => row.sid === localSid),
    `${sessions.length} 个：${JSON.stringify(sessions.map((row) => ({ sid: row.sid, kind: row.kind, pid: row.pid })))}`,
  )
}
if (localSid === undefined) {
  skip('T2 tty_capture / tty_send / tty_expect / tty_screen', '没有本地会话')
} else // 观察（根因在 DSH 内核，不在本仓库）：Windows 上 node-pty 的 `pid` 在 spawn 之后
// 约 200ms 才可用（真机直读：立刻 = 0，200ms 后 = 11696），而 dsh-subprocess-local
// 在构造 handle 时就 `this.pid = terminal.pid` 快照成 0，tty 的 wrapLocalPty 再快照
// 一次 —— 于是 Windows 上 `tty_list` 的 pid 与 ready 帧的 pid 永远是 0（活宿主实测
// ready 帧也是 pid:0）。字段是信息性的，不影响 kill/terminate，但按工具文档它本该
// 给出进程号。要修得在内核里改成惰性读取，本仓库无从取得真值。
{
  const listed = await callSafe('tty_list', {})
  const row = (listed.value?.sessions ?? []).find((session) => session.sid === localSid)
  if (row !== undefined && row.pid === 0) {
    warn(
      'T2 tty_list：Windows 上本地会话的 pid 恒为 0（DSH 内核快照了 node-pty 尚未就绪的 pid；非本仓库可修）',
      `tty_list 报 ${JSON.stringify({ sid: row.sid, kind: row.kind, pid: row.pid })}；根因 dsh-subprocess-local 的 \`this.pid = terminal.pid\` 快照`,
    )
  }
}

{
  const capture = await callSafe('tty_capture', { sid: localSid, lines: 50 })
  record(
    'T2 tty_capture：读到本地会话输出（默认清洗 ANSI）',
    capture.ok === true && String(capture.value?.tail ?? '').includes('LOCAL-TOOL-9F3A'),
    `tail 长度=${String(capture.value?.tail ?? '').length} 含标记=${String(capture.value?.tail ?? '').includes('LOCAL-TOOL-9F3A')}`,
  )
  const send = await callSafe('tty_send', { sid: localSid, data: 'echo SENT-BY-TOOL-7B2C\r\n' })
  record('T2 tty_send：向会话发送按键', send.ok === true, JSON.stringify(send.value ?? send.error).slice(0, 160))
  const expect = await callSafe('tty_expect', { sid: localSid, pattern: 'SENT-BY-TOOL-7B2C', timeoutSec: 15 })
  record('T2 tty_expect：等到正则命中', expect.ok === true && expect.value?.matched === true, JSON.stringify(expect.value ?? expect.error).slice(0, 200))
  const screen = await callSafe('tty_screen', { sid: localSid })
  record('T2 tty_screen：渲染当前可见屏幕', screen.ok === true && typeof (screen.value?.screen ?? screen.value?.text ?? '') === 'string', `屏幕 ${String(screen.value?.screen ?? screen.value?.text ?? '').length} 字符`)
  const raw = await callSafe('tty_capture', { sid: localSid, lines: 20, raw: true })
  record('T2 tty_capture{raw:true}：返回未清洗输出', raw.ok === true, `长度=${String(raw.value?.tail ?? '').length}`)
  const badSid = await callSafe('tty_capture', { sid: 'no-such-sid' })
  record('T2 tty_capture：未知 sid 给出可读失败', badSid.ok === false || badSid.value?.error !== undefined, JSON.stringify(badSid.value ?? badSid.error).slice(0, 160))
}

{
  const r = await callSafe('tunnel_list', {})
  record('T2 tunnel_list：返回隧道状态表（当前无隧道 → 空表）', r.ok === true && r.value?.tunnels !== undefined, JSON.stringify(r.value).slice(0, 200))
}

// SFTP 七个：走真 ssh2 到 Ubuntu1
const remoteRoot = `/home/${sshUser}`
const remoteFile = `${remoteRoot}/dsh-probe-tool.txt`
const remoteDir = `${remoteRoot}/dsh-probe-tool-dir`
{
  const list = await callSafe('sftp_list', { book: sshBook, path: remoteRoot })
  record(
    'T2 sftp_list：列出远程目录（真 ssh2 到 Ubuntu1）',
    list.ok === true && Array.isArray(list.value?.entries) && list.value.entries.length > 0,
    `${(list.value?.entries ?? []).length} 项：${JSON.stringify((list.value?.entries ?? []).slice(0, 5).map((row) => row.name))}`,
  )
  const tree = await callSafe('sftp_tree', { book: sshBook, path: remoteRoot, maxDepth: 1 })
  record('T2 sftp_tree：递归看目录结构', tree.ok === true && tree.value?.entries !== undefined, JSON.stringify(tree.value).slice(0, 200))
  const mkdir = await callSafe('sftp_mkdir', { book: sshBook, path: remoteDir, parents: true })
  record('T2 sftp_mkdir：建远程目录（parents 逐级补齐）', mkdir.ok === true, JSON.stringify(mkdir.value ?? mkdir.error).slice(0, 160))
  const write = await callSafe('sftp_write', { book: sshBook, path: remoteFile, content: 'tool-write-中文-9F3A\n' })
  record('T2 sftp_write：写远程文本文件', write.ok === true, JSON.stringify(write.value ?? write.error).slice(0, 160))
  const read = await callSafe('sftp_read', { book: sshBook, path: remoteFile })
  record(
    'T2 sftp_read：读回内容逐字节一致（含中文）',
    read.ok === true && String(read.value?.content ?? '').includes('tool-write-中文-9F3A'),
    JSON.stringify(read.value).slice(0, 200),
  )
  const append = await callSafe('sftp_write', { book: sshBook, path: remoteFile, content: 'appended\n', append: true })
  const readBack = await callSafe('sftp_read', { book: sshBook, path: remoteFile })
  record('T2 sftp_write{append:true}：追加写入生效', append.ok === true && String(readBack.value?.content ?? '').includes('appended'), JSON.stringify(readBack.value).slice(0, 200))
  const rename = await callSafe('sftp_rename', { book: sshBook, from: remoteFile, to: `${remoteFile}.moved` })
  record('T2 sftp_rename：重命名/移动', rename.ok === true, JSON.stringify(rename.value ?? rename.error).slice(0, 160))
  const removeFile = await callSafe('sftp_remove', { book: sshBook, path: `${remoteFile}.moved` })
  const removeDir = await callSafe('sftp_remove', { book: sshBook, path: remoteDir, recursive: true })
  record('T2 sftp_remove：删文件 + 递归删目录', removeFile.ok === true && removeDir.ok === true, `file=${removeFile.ok} dir=${removeDir.ok}`)
  const badBook = await callSafe('sftp_list', { book: 'no-such-book' })
  record('T2 sftp_list：未知连接簿条目给出可读失败', badBook.ok === false, `error=${String(badBook.error).slice(0, 160)}`)
}

/* ================================================================== *
 * T3 SSH 会话（顺带覆盖 tty 的 SSH 侧）
 * ================================================================== */

if (nodePty === undefined) {
  skip('T3 SSH 会话', '未加载 node-pty（SSH 会话不需要 PTY，但为对称起见跳过）')
} else {
  try {
    sshSid = await withSocket(async (socket, waitFor) => {
      socket.send(JSON.stringify({ t: 'ssh', name: sshBook, cols: 100, rows: 30 }))
      const ready = await waitFor((frame) => frame.t === 'ready' || frame.t === 'error', 30_000)
      if (ready.t === 'error') throw new Error(`ssh 失败：${JSON.stringify(ready)}`)
      socket.send(JSON.stringify({ t: 'input', sid: ready.sid, d: 'echo SSH-TOOL-5C1D\n' }))
      await waitFor((frame) => frame.t === 'data' && String(frame.d ?? '').includes('SSH-TOOL-5C1D'), 25_000)
      return ready.sid
    })
    record('T3 建立 SSH 会话（ssh2 到 Ubuntu1）并回显命令', true, `sid=${sshSid}`)
  } catch (error) {
    record('T3 建立 SSH 会话（ssh2 到 Ubuntu1）并回显命令', false, String(error?.message ?? error))
  }
}
if (sshSid !== undefined) {
  const listed = await callSafe('tty_list', {})
  const row = (listed.value?.sessions ?? []).find((session) => session.sid === sshSid)
  record(
    'T3 tty_list：SSH 会话的 kind=ssh 且 target=user@host 被如实带出',
    row !== undefined && row.kind === 'ssh' && String(row.target).includes(sshUser),
    `row=${JSON.stringify(row)}`,
  )
  const captured = await callSafe('tty_capture', { sid: sshSid, lines: 40 })
  record('T3 tty_capture：读到 SSH 会话的远端输出', captured.ok === true && String(captured.value?.tail ?? '').includes('SSH-TOOL-5C1D'), `含标记=${String(captured.value?.tail ?? '').includes('SSH-TOOL-5C1D')}`)
}

/* ================================================================== *
 * T4 schema 自检 + 汇总
 * ================================================================== */

record(
  'T4 静态 schema：29 个工具都有 description / execute / output.schema / output.render，parameters 每项都带 type',
  schemaProblems.length === 0 && tools.size === 29,
  schemaProblems.length === 0 ? `工具 ${tools.size} 个全部合规` : schemaProblems.join('；'),
)

// 收尾：把两个会话关掉，别把 PTY 留着
for (const sid of [localSid, sshSid]) {
  if (sid === undefined) continue
  try {
    await withSocket(async (socket) => {
      socket.send(JSON.stringify({ t: 'kill', sid }))
      await new Promise((resolve) => setTimeout(resolve, 300))
    })
  } catch {
    /* 关不掉就算了 */
  }
}

const failed = results.filter((r) => r.ok !== true)
console.log(`\n# 汇总：PASS ${results.filter((r) => r.ok === true && r.warned !== true && r.skipped !== true).length} / WARN ${results.filter((r) => r.warned === true).length} / SKIP ${results.filter((r) => r.skipped === true).length} / FAIL ${failed.length}`)
if (failed.length > 0) {
  console.log('# 失败项：')
  for (const item of failed) console.log(`  - ${item.name}${item.detail ? `：${item.detail.split('\n')[0]}` : ''}`)
}
if (reportPath !== undefined) {
  writeFileSync(reportPath, `${JSON.stringify({ repo, tools: [...tools.keys()], results }, null, 2)}\n`)
  console.log(`# 报告：${reportPath}`)
}
server.close()
process.exit(failed.length === 0 ? 0 : 1)
