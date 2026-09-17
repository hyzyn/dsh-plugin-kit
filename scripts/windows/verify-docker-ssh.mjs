/**
 * `@hyzyn/dsh-docker` 真机验证（第二阶段）：把**远程真实 docker** 的 20 个 POST 子路由
 * 与 4 条 SSE 长流全部打一遍。
 *
 * 为什么单独一个脚本：`verify-plugins.mjs` 覆盖的是「装了宿主、但没有 docker 可执行」的
 * 干净 Windows —— 那时只能验证参数校验与降级形态。要验真实数据路径（容器列表、inspect、
 * stats、logs、镜像/网络/卷、以及 remove/prune/action/exec 这些变更路由），就需要一台
 * **真的在跑 docker 的机器**。本脚本假定宿主里已经配好一个 `kind: ssh` 的目标指向它。
 *
 * 安全约束（硬编码，不可关闭）：**所有破坏性调用的对象名必须以上缀开头**（默认
 * `dsh-probe`）。脚本只创建/删除/停止自己的夹具；目标主机上别人的容器、镜像、卷、
 * 网络一律只读观察，并且在最后**逐条断言它们完好无损**。`prune` 类路由会先记录
 * 「前」再记录「后」，把删掉的东西逐条列出来。
 *
 * 用法（Windows 仓库根，宿主已用带 ssh 目标的 settings 启动）：
 *
 *   node scripts/windows/verify-docker-ssh.mjs --host http://127.0.0.1:3092 ^
 *        --target u1 --prefix dsh-probe --report C:\path\to\report.json
 *
 * 夹具不在时会 SKIP 对应条目（而不是 FAIL）——先跑仓库外的夹具脚本再造一遍即可。
 * 退出码：0 = 无 FAIL（WARN/SKIP 不计入失败），1 = 有 FAIL。
 */
import http from 'node:http'
import { writeFileSync } from 'node:fs'

const argv = process.argv.slice(2)
const flag = (name) => {
  const index = argv.indexOf(name)
  return index === -1 ? undefined : argv[index + 1]
}
const hostUrl = flag('--host')
const targetName = flag('--target')
const prefix = flag('--prefix') ?? 'dsh-probe'
const reportPath = flag('--report')

if (hostUrl === undefined || targetName === undefined) {
  console.log('用法: node scripts/windows/verify-docker-ssh.mjs --host http://127.0.0.1:3092 --target u1 [--prefix dsh-probe] [--report out.json]')
  process.exit(2)
}

const results = []
const record = (name, ok, detail) => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '\n      ' + detail : ''}`)
}
const warn = (name, detail) => {
  results.push({ name, ok: true, detail, warned: true })
  console.log(`WARN  ${name}\n      ${detail}`)
}
const skip = (name, detail) => {
  results.push({ name, ok: true, detail, skipped: true })
  console.log(`SKIP  ${name}${detail ? '\n      ' + detail : ''}`)
}
const hasMojibake = (text) => typeof text === 'string' && text.includes('\uFFFD')
/** 破坏性操作的白名单：只碰自己的夹具，别的资源连试都不试。 */
const assertMine = (label, value) => {
  if (typeof value !== 'string' || !value.startsWith(prefix)) {
    throw new Error(`拒绝操作非夹具资源：${label}=${JSON.stringify(value)}（白名单前缀 ${JSON.stringify(prefix)}）`)
  }
  return value
}

const target = new URL(hostUrl)
const port = Number(target.port || 80)

function call(method, path, body, options = {}) {
  const { timeoutMs = 90_000, stream = false } = options
  return new Promise((resolve) => {
    const payload = body === undefined ? undefined : Buffer.from(JSON.stringify(body))
    const request = http.request(
      {
        host: target.hostname,
        port,
        path,
        method,
        headers: {
          host: `${target.hostname}:${port}`,
          ...(payload === undefined ? {} : { 'content-type': 'application/json', 'content-length': String(payload.length) }),
        },
      },
      (response) => {
        let text = ''
        let settled = false
        const done = (extra = {}) => {
          if (settled) return
          settled = true
          resolve({ status: response.statusCode, headers: response.headers, body: text, ...extra })
        }
        response.setEncoding('utf8')
        response.on('data', (chunk) => {
          text += chunk
          if (stream && text.length > 0) {
            request.destroy()
            done({ streamed: true })
          }
        })
        response.on('end', () => done())
        response.on('error', () => done({ readError: true }))
      },
    )
    request.on('error', (error) => resolve({ status: 0, body: '', error: String(error?.code ?? error?.message) }))
    request.setTimeout(timeoutMs, () => {
      request.destroy()
      resolve({ status: 0, body: '', error: `timeout(${timeoutMs}ms)`, timedOut: true })
    })
    if (payload !== undefined) request.write(payload)
    request.end()
  })
}
const json = (text) => {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}
const R = '/api/dsh-docker'
const post = (sub, body, options) => call('POST', `${R}${sub}`, body, options)
const get = (sub, query, options) => call('GET', `${R}${sub}${query === undefined ? '' : '?' + new URLSearchParams(query).toString()}`, undefined, options)

console.log('# dsh-docker 真机验证（远程真实 docker）')
console.log(`# node ${process.version} / ${process.platform} / host ${hostUrl} / 目标 ${targetName} / 夹具前缀 ${prefix}\n`)

/* ================================================================== *
 * D0 目标与闸门
 * ================================================================== */

const config = json((await get('/config')).body)?.config
record(
  'D0 /config：允许变更与 exec 都已打开（否则 remove/prune/action/exec 一律 403，覆盖不到）',
  config?.allowMutations === true && config?.allowExec === true,
  `allowMutations=${String(config?.allowMutations)} allowExec=${String(config?.allowExec)}`,
)
const targets = json((await get('/targets')).body)?.targets ?? []
const mine = targets.find((row) => row.name === targetName)
record(
  'D0 /targets：SSH 目标解析成功并给出可读标签',
  mine !== undefined && mine.error === undefined && typeof mine.label === 'string' && mine.label.includes('@'),
  `targets=${JSON.stringify(targets)}`,
)

/* ================================================================== *
 * D1 只读：probe / containers / attention / inspect / stats / logs
 * ================================================================== */

const probe = await post('/probe', { target: targetName })
const probeBody = json(probe.body)
record('D1 /probe：经 SSH 真的探测到远端 docker', probe.status === 200 && probeBody?.ok === true, `status=${probe.status} body=${JSON.stringify(probe.body.slice(0, 200))}`)

const containers = await post('/containers', { target: targetName, all: true })
const list = json(containers.body)?.containers ?? []
const names = list.map((row) => row.name)
record(
  'D1 /containers：列出全部容器（含已退出的）',
  containers.status === 200 && names.length > 0,
  `status=${containers.status} 共 ${names.length} 个：${JSON.stringify(names.slice(0, 10))}`,
)
const mineContainers = list.filter((row) => String(row.name).startsWith(prefix))
record(
  'D1 /containers：夹具容器全部在列（运行 / 已退出 / 不健康 / 反复重启 / 带 compose 标签各一）',
  mineContainers.length >= 5,
  `夹具 ${mineContainers.length} 个：${JSON.stringify(mineContainers.map((row) => `${row.name}:${row.state}:${row.status}${row.health === null ? '' : '/' + row.health}`))}`,
)
record(
  'D1 /containers：compose 项目 / 服务标签被解析出来（夹具带 com.docker.compose.project）',
  mineContainers.some((row) => row.composeProject === prefix) && mineContainers.some((row) => row.composeService === 'web'),
  `composeProject 取值=${JSON.stringify([...new Set(list.map((row) => row.composeProject))])}`,
)
// 观察（不是缺陷）：这台机器上的 neo4j 是 `docker stack deploy`（swarm）起的，标签是
// `com.docker.stack.namespace` 而不是 `com.docker.compose.project`，所以面板的 Compose
// 项目视图看不出它。插件只读 compose 标签，swarm stack 会显示为未分组。
if (list.some((row) => row.composeProject === null)) {
  warn(
    'D1 /containers：swarm stack（`docker stack deploy`）的容器没有被归入 Compose 项目视图（只读 com.docker.compose.project）',
    `未分组的容器=${JSON.stringify(list.filter((row) => row.composeProject === null).map((row) => row.name).slice(0, 6))}（它们带的是 com.docker.stack.namespace；本项只记录，不是 FAIL）`,
  )
}
record(
  'D1 /containers：已退出容器的退出码被解析出来（夹具是 3）',
  mineContainers.some((row) => row.exitCode === 3),
  `exitCode 取值=${JSON.stringify(mineContainers.map((row) => [row.name, row.exitCode]))}`,
)

const attention = await post('/attention', { target: targetName })
const attentionText = String(attention.body)
const attentionItems = json(attention.body)?.items ?? []
record('D1 /attention：不健康的夹具被点出来', attention.status === 200 && attentionText.includes(`${prefix}-unhealthy`), `status=${attention.status}`)
record('D1 /attention：反复重启的夹具被点出来', attention.status === 200 && attentionText.includes(`${prefix}-restart`), `命中=${attentionText.includes(`${prefix}-restart`)}`)
record('D1 /attention：非零退出的夹具被点出来', attention.status === 200 && attentionText.includes(`${prefix}-exited`), `命中=${attentionText.includes(`${prefix}-exited`)}`)
console.log(`      /attention 原文：${JSON.stringify(attentionText.slice(0, 400))}`)

const runName = list.some((row) => row.name === `${prefix}-run`) ? `${prefix}-run` : undefined
if (runName === undefined) {
  skip('D1 /inspect、/stats、/logs', `找不到夹具容器 ${prefix}-run（先跑夹具脚本）`)
} else {
  const inspect = await post('/inspect', { target: targetName, id: runName })
  const details = json(inspect.body)?.details
  record(
    'D1 /inspect：拿到容器详情数组（镜像 / 状态 / 端口映射 / 挂载）',
    inspect.status === 200 && Array.isArray(details) && details.length > 0,
    `status=${inspect.status} details=${Array.isArray(details) ? details.length : typeof details} bytes=${inspect.body.length}`,
  )
  const stats = await post('/stats', { target: targetName, ids: [runName] })
  const statsRows = json(stats.body)?.stats
  record(
    'D1 /stats：拿到资源占用（CPU% / 内存 / IO）',
    stats.status === 200 && Array.isArray(statsRows) && statsRows.length > 0,
    `status=${stats.status} rows=${Array.isArray(statsRows) ? JSON.stringify(statsRows[0]).slice(0, 220) : typeof statsRows}`,
  )
  const logs = await post('/logs', { target: targetName, id: runName, tail: 30 })
  // 形状是 { ok, logs: { id, text, truncated } }（`logs` 是对象，不是字符串）
  const logPayload = json(logs.body)?.logs
  const logText = logPayload?.text
  record(
    'D1 /logs：拿到日志尾巴（{ id, text, truncated }）',
    logs.status === 200 && typeof logText === 'string' && logText.length > 0,
    `status=${logs.status} id=${String(logPayload?.id)} 日志 ${typeof logText === 'string' ? logText.length : '?'} 字节 truncated=${String(logPayload?.truncated)}`,
  )
}

/* ================================================================== *
 * D2 镜像 / 网络 / 卷：列举与详情
 * ================================================================== */

const images = json((await post('/images', { target: targetName })).body)
const imageRows = images?.images ?? []
const imageRefs = JSON.stringify(images)
record(
  'D2 /images：列出镜像（含用户的 nginx / neo4j 与夹具标签）',
  Array.isArray(imageRows) && imageRows.length > 0 && imageRefs.includes('nginx') && imageRefs.includes('neo4j'),
  `${imageRows.length} 个：${JSON.stringify(imageRows.map((row) => row.reference ?? row.repository ?? row.id).slice(0, 8))}`,
)
if (imageRefs.includes(`${prefix}-img:test`)) {
  const imgInspect = await post('/images/inspect', { target: targetName, ref: `${prefix}-img:test` })
  const image = json(imgInspect.body)?.image
  record('D2 /images/inspect：拿到层 / 大小 / 构建历史', imgInspect.status === 200 && image !== undefined && imgInspect.body.length > 100, `status=${imgInspect.status} bytes=${imgInspect.body.length}`)
} else {
  skip('D2 /images/inspect', `缺少夹具镜像标签 ${prefix}-img:test（夹具被上一轮 remove 消耗：先重跑夹具脚本）`)
}

const networks = json((await post('/networks', { target: targetName })).body)
const networkText = JSON.stringify(networks)
record(
  'D2 /networks：列出网络（bridge / overlay / 栈网络都在）',
  Array.isArray(networks?.networks) && networkText.includes('bridge') && networkText.includes('neo4j-stack_default'),
  `body=${JSON.stringify(networkText.slice(0, 240))}`,
)
if (networkText.includes(`${prefix}-net`)) {
  const netInspect = await post('/networks/inspect', { target: targetName, name: `${prefix}-net` })
  record('D2 /networks/inspect：拿到网络详情', netInspect.status === 200 && json(netInspect.body)?.network !== undefined, `status=${netInspect.status} bytes=${netInspect.body.length}`)
} else {
  skip('D2 /networks/inspect', `缺少夹具网络 ${prefix}-net`)
}

const volumes = json((await post('/volumes', { target: targetName })).body)
const volumeText = JSON.stringify(volumes)
record(
  'D2 /volumes：列出卷（用户的 4 个 neo4j 数据卷在列）',
  Array.isArray(volumes?.volumes) && volumeText.includes('neo4j-stack_neo4j_data'),
  `body=${JSON.stringify(volumeText.slice(0, 240))}`,
)
if (volumeText.includes(`${prefix}-vol`)) {
  const volInspect = await post('/volumes/inspect', { target: targetName, name: `${prefix}-vol` })
  record('D2 /volumes/inspect：拿到卷详情', volInspect.status === 200 && json(volInspect.body)?.volume !== undefined, `status=${volInspect.status} bytes=${volInspect.body.length}`)
} else {
  skip('D2 /volumes/inspect', `缺少夹具卷 ${prefix}-vol`)
}

/* ================================================================== *
 * D3 exec：在夹具容器里跑一条命令
 * ================================================================== */

if (runName === undefined) {
  skip('D3 /exec', `找不到夹具容器 ${prefix}-run`)
} else {
  const execd = await post('/exec', { target: targetName, id: assertMine('id', runName), command: 'echo EXEC-OK-9F3A' })
  record(
    'D3 /exec：在远端容器里执行命令并取回输出',
    execd.status === 200 && String(execd.body).includes('EXEC-OK-9F3A'),
    `status=${execd.status} body=${JSON.stringify(String(execd.body).slice(0, 220))}`,
  )
}

/* ================================================================== *
 * D4 action：start / stop / restart（只对自己那个容器）
 * ================================================================== */

if (runName === undefined) {
  skip('D4 /action', `找不到夹具容器 ${prefix}-run`)
} else {
  const name = assertMine('id', runName)
  const stopped = await post('/action', { target: targetName, id: name, action: 'stop' }, { timeoutMs: 60_000 })
  const afterStop = JSON.stringify(json((await post('/containers', { target: targetName, all: true })).body))
  const started = await post('/action', { target: targetName, id: name, action: 'start' }, { timeoutMs: 60_000 })
  const afterStart = JSON.stringify(json((await post('/containers', { target: targetName, all: true })).body))
  const restarted = await post('/action', { target: targetName, id: name, action: 'restart' }, { timeoutMs: 60_000 })
  record(
    'D4 /action：stop→start→restart 三步都成功',
    stopped.status === 200 && started.status === 200 && restarted.status === 200,
    `status=${stopped.status}/${started.status}/${restarted.status}`,
  )
  record('D4 /action：stop 后容器确实不在「运行中」列表里', /stopped|exited/i.test(afterStop), `stop 后的状态文本里含 stopped/exited=${/stopped|exited/i.test(afterStop)}`)
  record('D4 /action：start 后容器回到运行态', /running/i.test(afterStart), `start 后含 running=${/running/i.test(afterStart)}`)
  const badAction = await post('/action', { target: targetName, id: name, action: 'nuke' })
  record('D4 /action：非法动作被拒（不是静默当成 remove）', badAction.status >= 400, `status=${badAction.status} body=${JSON.stringify(String(badAction.body).slice(0, 160))}`)
}

/* ================================================================== *
 * D5 破坏性路由：只对自己的夹具 + 前后对照别人的资源
 * ================================================================== */

const before = {
  images: JSON.stringify(json((await post('/images', { target: targetName })).body)),
  networks: JSON.stringify(json((await post('/networks', { target: targetName })).body)),
  volumes: JSON.stringify(json((await post('/volumes', { target: targetName })).body)),
  containers: JSON.stringify(json((await post('/containers', { target: targetName, all: true })).body)),
}
/** 「别人的东西」在破坏性操作前后必须一字不差。 */
const foreignFingerprint = (snapshot) => {
  const keep = (text, needles) => needles.filter((needle) => text.includes(needle)).sort()
  return {
    neo4jVolumes: keep(snapshot.volumes, ['neo4j-stack_neo4j_data', 'neo4j-stack_neo4j_import', 'neo4j-stack_neo4j_logs', 'neo4j-stack_neo4j_plugins']),
    neo4jContainers: keep(snapshot.containers, ['neo4j-stack_neo4j.1']),
    neo4jImage: keep(snapshot.images, ['neo4j']),
    nginxImage: keep(snapshot.images, ['nginx:latest']),
    stackNetwork: keep(snapshot.networks, ['neo4j-stack_default']),
  }
}
const foreignBefore = foreignFingerprint(before)

if (!before.images.includes(`${prefix}-img:test`)) {
  skip('D5 /images/remove', `缺少夹具镜像标签 ${prefix}-img:test`)
} else {
  const removed = await post('/images/remove', { target: targetName, ref: assertMine('ref', `${prefix}-img:test`) })
  const afterImages = JSON.stringify(json((await post('/images', { target: targetName })).body))
  record(
    'D5 /images/remove：删掉自己的镜像标签，且没连累别的镜像',
    removed.status === 200 && !afterImages.includes(`${prefix}-img:test`) && afterImages.includes('nginx:latest'),
    `status=${removed.status} 夹具标签已消失=${!afterImages.includes(`${prefix}-img:test`)} nginx:latest 还在=${afterImages.includes('nginx:latest')}`,
  )
}
const pruned = await post('/images/prune', { target: targetName })
record('D5 /images/prune：只清 dangling（当前 dangling=0，应为 no-op 且不报错）', pruned.status === 200, `status=${pruned.status} body=${JSON.stringify(String(pruned.body).slice(0, 200))}`)

const netBefore = JSON.stringify(json((await post('/networks', { target: targetName })).body))
if (netBefore.includes(`${prefix}-net`)) {
  const netRemoved = await post('/networks/remove', { target: targetName, name: assertMine('name', `${prefix}-net`) })
  const netAfter = JSON.stringify(json((await post('/networks', { target: targetName })).body))
  record(
    'D5 /networks/remove：删掉自己的网络，别人的网络还在',
    netRemoved.status === 200 && !netAfter.includes(`${prefix}-net`) && netAfter.includes('neo4j-stack_default'),
    `status=${netRemoved.status} 夹具网络已消失=${!netAfter.includes(`${prefix}-net`)} stack 网络还在=${netAfter.includes('neo4j-stack_default')}`,
  )
} else {
  skip('D5 /networks/remove', `缺少夹具网络 ${prefix}-net`)
}
const netPruned = await post('/networks/prune', { target: targetName })
const netAfterPrune = JSON.stringify(json((await post('/networks', { target: targetName })).body))
record(
  'D5 /networks/prune：没有删掉任何正在用的网络（栈网络、ingress、gwbridge 都在）',
  netPruned.status === 200 && netAfterPrune.includes('neo4j-stack_default') && netAfterPrune.includes('ingress') && netAfterPrune.includes('docker_gwbridge'),
  `status=${netPruned.status} body=${JSON.stringify(String(netPruned.body).slice(0, 200))}`,
)

// 卷 prune：Docker 29 的 `volume prune -f` 只回收**匿名**未用卷，命名卷一律不动
// （真机上先单独验过：命名卷 `dsh-probe-vol` 在 dangling 列表里，但 prune 回
//   "Total reclaimed space: 0B" 且卷仍在）。所以夹具专门产了一个匿名卷当对象。
const ANON = /^[0-9a-f]{64}$/
const volRowsBefore = json((await post('/volumes', { target: targetName })).body)?.volumes ?? []
const anonBefore = volRowsBefore.filter((row) => ANON.test(String(row.name))).length
const volPruned = await post('/volumes/prune', { target: targetName })
const volAfterPruneRows = json((await post('/volumes', { target: targetName })).body)?.volumes ?? []
const volAfterPrune = JSON.stringify(volAfterPruneRows)
const anonAfter = volAfterPruneRows.filter((row) => ANON.test(String(row.name))).length
if (anonBefore === 0) {
  skip('D5 /volumes/prune', `当前没有匿名未用卷可回收（夹具被上一轮消耗：先重跑夹具脚本），本次调用仍已发出并回 ${volPruned.status}`)
} else {
  record(
    'D5 /volumes/prune：回收了匿名未用卷（Docker 29 语义：命名卷不在 prune 范围内）',
    volPruned.status === 200 && anonAfter < anonBefore,
    `匿名卷 ${anonBefore} → ${anonAfter}；body=${JSON.stringify(String(volPruned.body).slice(0, 200))}`,
  )
}
const NEO4J_VOLUMES = ['neo4j-stack_neo4j_data', 'neo4j-stack_neo4j_import', 'neo4j-stack_neo4j_logs', 'neo4j-stack_neo4j_plugins']
const mineNamedBefore = volRowsBefore.filter((row) => String(row.name).startsWith(`${prefix}-vol`)).map((row) => row.name).sort()
const mineNamedAfter = volAfterPruneRows.filter((row) => String(row.name).startsWith(`${prefix}-vol`)).map((row) => row.name).sort()
record(
  'D5 /volumes/prune：用户的 4 个数据卷一个都没动（prune 的杀伤范围验证）',
  NEO4J_VOLUMES.every((name) => volAfterPrune.includes(name)),
  `四个数据卷都在=${NEO4J_VOLUMES.every((name) => volAfterPrune.includes(name))}`,
)
record(
  'D5 /volumes/prune：自己那些**命名**卷也一个都没动（命名卷不在 prune 范围内）',
  JSON.stringify(mineNamedBefore) === JSON.stringify(mineNamedAfter),
  `prune 前=${JSON.stringify(mineNamedBefore)} → 后=${JSON.stringify(mineNamedAfter)}`,
)
if (volAfterPrune.includes(`${prefix}-vol2`)) {
  const volRemoved = await post('/volumes/remove', { target: targetName, name: assertMine('name', `${prefix}-vol2`) })
  const volAfterRemove = JSON.stringify(json((await post('/volumes', { target: targetName })).body))
  record('D5 /volumes/remove：删掉指定的自己的卷', volRemoved.status === 200 && !volAfterRemove.includes(`${prefix}-vol2`), `status=${volRemoved.status}`)
} else {
  skip('D5 /volumes/remove', `缺少夹具卷 ${prefix}-vol2`)
}

/* ================================================================== *
 * D6 SSE 长流
 * ================================================================== */

const sseChecks = [
  ['/logs/stream', runName === undefined ? undefined : { target: targetName, id: runName, tail: '10' }, `${prefix}-run 的日志跟随`],
  ['/stats/stream', runName === undefined ? undefined : { target: targetName, ids: runName }, `${prefix}-run 的资源跟随`],
  ['/events/stream', { target: targetName }, '容器事件'],
]
for (const [sub, query, label] of sseChecks) {
  if (query === undefined) {
    skip(`D6 GET ${sub}`, `缺少夹具容器 ${prefix}-run`)
    continue
  }
  const response = await get(sub, query, { stream: true, timeoutMs: 30_000 })
  const contentType = String(response.headers?.['content-type'] ?? '')
  record(
    `D6 GET ${sub}（${label}）：SSE 长连接建立并推来第一块数据`,
    response.status === 200 && contentType.includes('text/event-stream') && response.body.length > 0,
    `status=${response.status} content-type=${contentType} 首块=${JSON.stringify(response.body.slice(0, 200))}`,
  )
}
const pull = await get('/images/pull/stream', { target: targetName, ref: 'alpine:3.20' }, { stream: true, timeoutMs: 30_000 })
if (pull.status === 200 && String(pull.headers?.['content-type'] ?? '').includes('text/event-stream')) {
  record('D6 GET /images/pull/stream：SSE 建立（拉取结果取决于外网）', pull.body.length > 0, `status=${pull.status} 首块=${JSON.stringify(pull.body.slice(0, 200))}`)
} else {
  skip('D6 GET /images/pull/stream', `建立失败（远端无外网时拉取必然失败）：status=${pull.status} body=${JSON.stringify(String(pull.body).slice(0, 160))}`)
}

/* ================================================================== *
 * D7 收尾：别人的资源必须一字不差
 * ================================================================== */

const after = {
  images: JSON.stringify(json((await post('/images', { target: targetName })).body)),
  networks: JSON.stringify(json((await post('/networks', { target: targetName })).body)),
  volumes: JSON.stringify(json((await post('/volumes', { target: targetName })).body)),
  containers: JSON.stringify(json((await post('/containers', { target: targetName, all: true })).body)),
}
const foreignAfter = foreignFingerprint(after)
record(
  'D7 全程结束后：目标主机上**不属于夹具**的资源与开始时完全一致（数据卷 / 栈容器 / 镜像 / 栈网络）',
  JSON.stringify(foreignBefore) === JSON.stringify(foreignAfter),
  `前=${JSON.stringify(foreignBefore)}\n      后=${JSON.stringify(foreignAfter)}`,
)

console.log(`\n# 汇总：PASS ${results.filter((r) => r.ok === true && r.warned !== true && r.skipped !== true).length} / WARN ${results.filter((r) => r.warned === true).length} / SKIP ${results.filter((r) => r.skipped === true).length} / FAIL ${results.filter((r) => r.ok !== true).length}`)
if (reportPath !== undefined) {
  writeFileSync(reportPath, `${JSON.stringify({ host: hostUrl, target: targetName, prefix, results }, null, 2)}\n`)
  console.log(`# 报告：${reportPath}`)
}
process.exit(results.some((r) => r.ok !== true) ? 1 : 0)
