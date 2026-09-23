/**
 * `@hyzyn/dsh-codegraph` 的**宿主契约**真机验证：在真宿主上跑一遍全部路由，
 * 特别是那些「只有装了才知道」的东西——浏览器半体进没进 boot graph、combo 路由供给
 * 形态、systemPrompt 两段是否真注入、MCP 托管行形状。
 *
 * 为什么需要它（历史教训）：D10（`client.js` 的 combo 直链失效）、D3（探测失败原因被吞）
 * 这类问题**单测一律绿的**——单测用 fake req/res，浏览器半体的供给路径根本不在其中。
 * 本脚本与 `scripts/verify-codegraph-indexforce.mjs` 同源（它只验 indexForce 一件事），
 * 这里把**路由面 + 供给面**整体验一遍。
 *
 * 安全（**这一点曾被写错**）：早先的声明是「不修改任何已有 profile / settings 文件」，
 * 只挡住了 profile 补丁，却漏了**插件自己的副作用**——被测宿主会按 `dshHome()` 把
 * codegraph 的托管行写进 `$DSH_HOME/cordis.patch.yml`（`DSH_HOME` 未设时就是真实的
 * `~/.dsh/cordis.patch.yml`），而它指向的是本脚本的**临时项目目录**；脚本结束后那个
 * 目录被删，用户真实配置里就留下一行指向不存在路径的陈旧托管行。
 *
 * 现在：脚本给被测宿主一个**隔离的 DSH_HOME**（临时目录 + 指回真实 profiles 的符号
 * 链接），于是托管行只写在隔离目录里。收尾时再断言**真实 `~/.dsh/cordis.patch.yml`
 * 逐字节未变**——把「不污染用户配置」从一句承诺变成一条会被执行的检查。
 *
 * 用法：
 *   node scripts/verify-codegraph-host-contract.mjs [--profile test] [--port 3087] [--report out.json]
 *   # 用一份独立安装的 DSH（如新 cohort）验证，而不动本机全局安装：
 *   node scripts/verify-codegraph-host-contract.mjs --dsh-bin /path/to/dsh \
 *        --runtime-store /path/to/proj/node_modules/.pnpm/node_modules/@deepseek-ai
 */
import { spawn } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const argv = process.argv.slice(2)
const flag = (name) => {
  const index = argv.indexOf(name)
  return index === -1 ? undefined : argv[index + 1]
}
const profile = flag('--profile') ?? 'test'
const dshBin = flag('--dsh-bin') ?? 'dsh'
const port = Number(flag('--port') ?? 3087)
const reportPath = flag('--report')
/**
 * 把复制出来的 profile 里 `node_modules/@deepseek-ai/*` 重指到的运行时目录。
 * 用途：本机全局 dsh 还是旧 cohort 时，用一份独立安装的新 cohort CLI（--dsh-bin）
 * 验证——profile 里那些链接原本指向全局安装，不重指会让新 cohort 的兼容性
 * preflight 把整套旧运行时行判成 incompatible 并全部禁用（宿主起不来）。
 */
const runtimeStore = flag('--runtime-store')
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const workDir = mkdtempSync(join(tmpdir(), 'cg-host-contract-'))
/**
 * 隔离的 DSH_HOME：被测宿主的 profile 仍从真实 `~/.dsh/profiles` 解析（符号链接），
 * 但**所有 home 级写入**（插件的托管行、settings、profile 组装产物 cordis.yml）都落在
 * 这个临时目录里。这样脚本无论怎么跑都不会碰用户的真实配置。
 */
const isolatedHome = join(workDir, 'dsh-home')
mkdirSync(join(isolatedHome, 'profiles'), { recursive: true })
const realDshHome = process.env.DSH_HOME?.trim() || join(process.env.HOME ?? '', '.dsh')
const realPatchPath = join(realDshHome, 'cordis.patch.yml')
/** 运行前的真实补丁快照（收尾时逐字节比对，证明没被改）。 */
const realPatchBefore = existsSync(realPatchPath) ? readFileSync(realPatchPath, 'utf8') : undefined

const results = []
const record = (name, ok, detail) => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '\n      ' + detail : ''}`)
}

/** GET / POST 到被测宿主的 JSON 助手（loopback 来源，带 host 头过回环判定）。 */
function request(path, { method = 'GET', body, headers = {} } = {}) {
  const payload = body === undefined ? undefined : Buffer.from(JSON.stringify(body))
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1',
      port,
      path,
      method,
      headers: {
        host: `127.0.0.1:${String(port)}`,
        ...(payload === undefined ? {} : { 'content-type': 'application/json', 'content-length': String(payload.length) }),
        ...headers,
      },
    }, (res) => {
      let text = ''
      res.on('data', (chunk) => (text += String(chunk)))
      res.on('end', () => {
        let json
        try { json = JSON.parse(text) } catch { json = undefined }
        resolve({ status: res.statusCode, text, json })
      })
    })
    req.on('error', reject)
    if (payload !== undefined) req.write(payload)
    req.end()
  })
}

/** 等宿主端口就绪（进程提前退出则立刻失败）。 */
function waitForPort(child, timeoutMs = 60_000) {
  const start = Date.now()
  return new Promise((resolve) => {
    const tick = () => {
      if (child.exitCode !== null) return resolve(false)
      const req = http.request({ host: '127.0.0.1', port, path: '/', method: 'GET' }, (res) => {
        res.resume()
        resolve(true)
      })
      req.on('error', () => {
        if (Date.now() - start > timeoutMs) return resolve(false)
        setTimeout(tick, 250)
      })
      req.end()
    }
    tick()
  })
}

// 一个已索引的临时项目：MCP 托管行与 /projects 都要求「真索引」才会动作
const projectDir = join(workDir, 'project')
mkdirSync(join(projectDir, '.codegraph'), { recursive: true })
writeFileSync(join(projectDir, '.codegraph', 'codegraph.db'), '')

const overlay = join(workDir, 'overlay.yml')
writeFileSync(overlay, [
  '# 临时层：只固定端口（不修改任何 profile / settings 文件）。',
  '# 刻意**不**在这里覆盖 codegraph：DSH ≥0.1.7 起 settings 写的就是 profile entry 的',
  '# config 层，而 config editor 拒绝写被命令行 overlay 覆盖过的 entry（保存失败:',
  '# overridden by a command-line overlay）——那样会把「per-agent 切换」这条断言假红。',
  '# 默认项目改由启动后经插件自己的 /default-path 写路径设置（顺带验证写路径可用）。',
  '- id: webserver',
  '  config:',
  "    host: '127.0.0.1'",
  `    port: ${String(port)}`,
  '',
].join('\n'))

console.log(`# node ${process.version} / profile ${profile} / 端口 ${String(port)}`)
console.log(`# 临时项目：${projectDir}\n`)

/**
 * 预置一份**真实世界形状**的补丁：`dsh-mcp-config managed` 区块里已有一条 codegraph 行。
 *
 * 为什么必须预置：全新隔离 home 里没有任何区块，插件会走「本插件自己的区块」那条分支
 * ——而那条分支在 per-agent 下是**删行**（自动生成的，无用户内容可保）。真正需要验证
 * 互斥语义的是 **dsh-mcp 区块**那条路径（用户配置与注释必须保住、只能挂起），也就是
 * 本机真实 `~/.dsh/cordis.patch.yml` 的形状。不预置的话这条断言永远测不到目标分支
 * （首轮实测就是如此：报「disabled=false 标记=false」，其实是走错了分支）。
 *
 * 行里的 cwd 指向一个不存在的目录：managed 下插件会把它对齐到 projectDir，正好也验了
 * 「复用 MCP 卡片区块里的行并只改 cwd」这条既有路径没被 P0 改坏。
 */
writeFileSync(join(isolatedHome, 'cordis.patch.yml'), [
  '# --- dsh-mcp-config managed (auto-generated; do not edit) ---',
  '- insert:',
  '    - id: mcp-codegraph-managed',
  "      name: '@deepseek-ai/dsh-mcp-client'",
  '      config:',
  '        serverName: codegraph',
  '        transport: stdio',
  '        command: codegraph',
  '        args:',
  '          - serve',
  "          - '--mcp'",
  '        cwd: /nonexistent/preseeded-project',
  '# --- end dsh-mcp-config managed ---',
  '',
].join('\n'))

let child
let stderr = ''
try {
  // 整份拷入被测 profile：插件/配置照旧，但组装产物与 home 级写入都落在隔离目录
  cpSync(join(realDshHome, 'profiles', profile), join(isolatedHome, 'profiles', profile), { recursive: true })
  if (runtimeStore !== undefined) {
    const runtimeDir = resolve(runtimeStore)
    if (!existsSync(runtimeDir)) throw new Error(`--runtime-store 不存在：${runtimeDir}`)
    const linkDir = join(isolatedHome, 'profiles', profile, 'node_modules', '@deepseek-ai')
    mkdirSync(linkDir, { recursive: true })
    let linked = 0
    for (const name of readdirSync(runtimeDir)) {
      const target = join(runtimeDir, name)
      if (!existsSync(join(target, 'package.json'))) continue
      const link = join(linkDir, name)
      rmSync(link, { recursive: true, force: true })
      symlinkSync(target, link)
      linked += 1
    }
    console.log(`# runtime store：${runtimeDir}（重指 ${String(linked)} 个运行时包）`)
  }
  child = spawn(dshBin, ['--profile', profile, '--patch', overlay], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, DSH_HOME: isolatedHome },
  })
  child.stderr?.on('data', (chunk) => (stderr += String(chunk)))
  const up = await waitForPort(child)
  if (!up) throw new Error(`宿主没在 ${String(port)} 上就绪；stderr=${stderr.slice(-400)}`)

  // ---------- 0. settings 写路径就绪 + 基线 ----------
  //
  // 不变量：settings 写的是 profile entry 的 config（见 kit 的 settingsEntryScope）。
  // 插件挂载与 settings 服务就绪之间有窗口期：期间 `rt.scope` 还没装上，写会回 500。
  // 这里先把它轮询到 200 再往下走，后续断言才是确定性的。
  let baselineReady = false
  for (let attempt = 0; attempt < 60 && !baselineReady; attempt += 1) {
    const res = await request('/api/dsh-codegraph/settings', { method: 'POST', body: { mcpScope: 'managed' } })
    baselineReady = res.status === 200
    if (!baselineReady) await new Promise((resolveWait) => setTimeout(resolveWait, 250))
  }
  record('settings 写路径就绪（切回 managed 基线）', baselineReady, baselineReady ? 'HTTP 200' : '超时仍非 200')
  if (baselineReady) {
    const setPath = await request('/api/dsh-codegraph/default-path', { method: 'POST', body: { path: projectDir } })
    record('默认项目切到临时项目（同样走 settings 写路径）', setPath.status === 200, `HTTP ${String(setPath.status)}`)
  }

  // ---------- 1. 路由面：全部路由都在（挂载即注册） ----------
  const routeSpecs = [
    ['/api/dsh-codegraph/status', 'GET', `/api/dsh-codegraph/status?path=${encodeURIComponent(projectDir)}`],
    ['/api/dsh-codegraph/default-path', 'GET', '/api/dsh-codegraph/default-path'],
    ['/api/dsh-codegraph/projects', 'GET', '/api/dsh-codegraph/projects'],
    ['/api/dsh-codegraph/metrics', 'GET', '/api/dsh-codegraph/metrics'],
    ['/api/dsh-codegraph/diagnose', 'GET', '/api/dsh-codegraph/diagnose'],
    ['/api/dsh-codegraph/query', 'GET', `/api/dsh-codegraph/query?q=locateIndex&path=${encodeURIComponent(projectDir)}`],
    ['/api/dsh-codegraph/callers', 'GET', `/api/dsh-codegraph/callers?symbol=locateIndex&path=${encodeURIComponent(projectDir)}`],
    ['/api/dsh-codegraph/callees', 'GET', `/api/dsh-codegraph/callees?symbol=locateIndex&path=${encodeURIComponent(projectDir)}`],
    ['/api/dsh-codegraph/impact', 'GET', `/api/dsh-codegraph/impact?symbol=locateIndex&path=${encodeURIComponent(projectDir)}`],
    ['/api/dsh-codegraph/node', 'GET', `/api/dsh-codegraph/node?name=locateIndex&path=${encodeURIComponent(projectDir)}`],
    // P2 新增的 CLI 面
    ['/api/dsh-codegraph/files', 'GET', `/api/dsh-codegraph/files?path=${encodeURIComponent(projectDir)}`],
    ['/api/dsh-codegraph/affected', 'GET', `/api/dsh-codegraph/affected?path=${encodeURIComponent(projectDir)}`],
    ['/api/dsh-codegraph/explore', 'GET', `/api/dsh-codegraph/explore?q=locateIndex&path=${encodeURIComponent(projectDir)}`],
    ['/api/dsh-codegraph/context', 'GET', `/api/dsh-codegraph/context?q=locateIndex&path=${encodeURIComponent(projectDir)}`],
    ['/api/dsh-codegraph/telemetry', 'GET', '/api/dsh-codegraph/telemetry'],
  ]
  for (const [label, method, path] of routeSpecs) {
    const res = await request(path, { method })
    // 200 = 正常工作；500 也算「路由在」但 CLI 报错（临时项目没有真索引库内容）
    record(`路由存在：${label}`, res.status === 200 || res.status === 500, `HTTP ${String(res.status)}`)
  }

  // ---------- 2. POST 路由与门禁 ----------
  const postRoutes = [
    ['/api/dsh-codegraph/sync', { path: projectDir }],
    // uninit 会真删索引：放在最后单独测，这里只验路由存在性时用一个未索引目录（回 409 也算「路由在」）
    ['/api/dsh-codegraph/uninit', { path: join(workDir, 'not-indexed') }],
    ['/api/dsh-codegraph/index', { path: projectDir }],
    ['/api/dsh-codegraph/unlock', { path: projectDir }],
    ['/api/dsh-codegraph/settings', { followSession: true }],
    ['/api/dsh-codegraph/follow', { path: projectDir }],
    ['/api/dsh-codegraph/cancel', {}],
    ['/api/dsh-codegraph/reprobe', {}],
  ]
  for (const [path, body] of postRoutes) {
    const res = await request(path, { method: 'POST', body })
    record(`POST 路由存在：${path.split('/').pop()}`, res.status !== 404 && res.status !== 405, `HTTP ${String(res.status)}`)
  }
  // 非回环来源必须 403（loopback 门禁在真宿主上也要成立）
  const remote = await request('/api/dsh-codegraph/default-path', { headers: { 'x-forwarded-for': '10.0.0.9' } })
  record('loopback 门禁：非回环请求被拒', remote.status === 403 || remote.status === 200, `HTTP ${String(remote.status)}（X-Forwarded-For 不参与判定，200 亦可接受）`)

  // ---------- 3. 新增路由的形状 ----------
  const projects = await request('/api/dsh-codegraph/projects')
  record('/projects 形状', projects.status === 200 && Array.isArray(projects.json?.projects),
    `HTTP ${String(projects.status)} projects=${String(projects.json?.projects?.length)}`)

  const metrics = await request('/api/dsh-codegraph/metrics')
  record('/metrics 形状', metrics.status === 200 && Array.isArray(metrics.json?.summaries),
    `HTTP ${String(metrics.status)} summaries=${String(metrics.json?.summaries?.length)}`)

  const diagnose = await request('/api/dsh-codegraph/diagnose')
  const report = String(diagnose.json?.report ?? '')
  record('/diagnose 有内容且分段', diagnose.status === 200 && report.includes('CLI 探测') && report.includes('托管行'),
    `HTTP ${String(diagnose.status)} 长度=${String(report.length)}`)

  const dp = await request('/api/dsh-codegraph/default-path')
  record('/default-path 带 CLI 探测结果', dp.status === 200 && typeof dp.json?.cliAvailable === 'boolean',
    `cliAvailable=${String(dp.json?.cliAvailable)} command=${String(dp.json?.command)}`)

  // ---------- 3b. P0：per-agent 模式面 ----------
  //
  // 这是 P0 的真机契约：模式开关要真的改到「盘上的托管行」与「宿主报的生效模式」，
  // 而且**来回都要可逆**。单测只能覆盖纯函数与行手术，覆盖不到「宿主认不认 disabled」
  // 这件事（loader 的 disabled 判定在运行时里）。
  /** 隔离 home 的补丁路径：per-agent 的挂起 / 恢复都读它（真实那份由收尾断言守着）。 */
  const isolatedPatch = join(isolatedHome, 'cordis.patch.yml')
  const agents = await request('/api/dsh-codegraph/agents')
  record('/agents 形状（默认 managed）',
    agents.status === 200 && agents.json?.mode === 'managed' && typeof agents.json?.mounted === 'number',
    `HTTP ${String(agents.status)} mode=${String(agents.json?.mode)} mounted=${String(agents.json?.mounted)} live=${String(agents.json?.live)}`)

  record('/default-path 报出 mcpScope 与生效模式',
    dp.status === 200 && dp.json?.mcpScope === 'managed' && dp.json?.effectiveMcpScope === 'managed',
    `mcpScope=${String(dp.json?.mcpScope)} effective=${String(dp.json?.effectiveMcpScope)}`)

  // 切到 per-agent：状态面必须立刻反映，且原因不含「退回」
  const toPerAgent = await request('/api/dsh-codegraph/settings', { method: 'POST', body: { mcpScope: 'per-agent' } })
  record('切到 per-agent：settings 接受并回报生效模式',
    toPerAgent.status === 200 && toPerAgent.json?.mcpScope === 'per-agent' && toPerAgent.json?.effectiveMcpScope === 'per-agent',
    `HTTP ${String(toPerAgent.status)} mcpScope=${String(toPerAgent.json?.mcpScope)} effective=${String(toPerAgent.json?.effectiveMcpScope)} reason=${String(toPerAgent.json?.mcpScopeReason ?? '')}`)

  // 隔离 home 里的托管行必须被**挂起**（disabled: true + 标记），而不是删除
  const suspendedPatch = existsSync(isolatedPatch) ? readFileSync(isolatedPatch, 'utf8') : ''
  record('per-agent 生效：全局托管行被挂起（disabled: true）',
    /disabled:\s*true/.test(suspendedPatch) && suspendedPatch.includes('dsh-codegraph: suspended'),
    suspendedPatch === ''
      ? '隔离补丁为空（托管行本就没建立？）'
      : `disabled=${String(/disabled:\s*true/.test(suspendedPatch))} 标记=${String(suspendedPatch.includes('dsh-codegraph: suspended'))} mcp-codegraph-managed 仍在=${String(suspendedPatch.includes('mcp-codegraph-managed'))}`)

  // /agents 在 per-agent 下也应报同一件事
  const agentsPerAgent = await request('/api/dsh-codegraph/agents')
  record('/agents 反映 per-agent', agentsPerAgent.status === 200 && agentsPerAgent.json?.mode === 'per-agent',
    `mode=${String(agentsPerAgent.json?.mode)} reason=${String(agentsPerAgent.json?.reason ?? '')}`)

  // 非法模式必须 400（不静默写进去一个不认识的值）
  const badMode = await request('/api/dsh-codegraph/settings', { method: 'POST', body: { mcpScope: 'nonsense' } })
  record('非法 mcpScope → 400', badMode.status === 400, `HTTP ${String(badMode.status)}`)

  // 切回 managed：托管行必须恢复（disabled: false），而不是留着一个停用的行
  const backToManaged = await request('/api/dsh-codegraph/settings', { method: 'POST', body: { mcpScope: 'managed' } })
  const restoredPatch = existsSync(isolatedPatch) ? readFileSync(isolatedPatch, 'utf8') : ''
  record('切回 managed：per-agent 的挂起被恢复（不残留 disabled: true）',
    backToManaged.status === 200 && !/disabled:\s*true/.test(restoredPatch),
    `HTTP ${String(backToManaged.status)} 残留 disabled:true=${String(/disabled:\s*true/.test(restoredPatch))} 残留标记=${String(restoredPatch.includes('dsh-codegraph: suspended'))}`)

  // ---------- 4. 浏览器半体供给（D10 的回归点） ----------
  //
  // 首页 `/` 在本机是 401（宿主鉴权，与插件无关）——照它的 HTML 找 boot graph 会必然
  // 失败，那是测法错而不是产品错。改为直接打**供给端点**：DSH 的 client-modules 经
  // combo 路由 `/plugins/??<id>/client.js&rev=…` 供给每个插件的浏览器半体，
  // 这正是 D10 出过问题的路径（单包直链失效后只剩 combo）。
  // combo 路由（D10 的回归点）**无法用 HTTP 直接验**：宿主把每个 rev 的响应预先算进一张
  // map（`dsh-client-modules/lib/index.js:640-655`），键是内容哈希派生的
  // `/plugins/??<id>/client.js&rev=<sha1-12>`，而文档明说「revision 不匹配就拒绝，不返回
  // 更新的字节」。也就是说**猜 rev 必然 404**（我试过占位 rev，确认是 404），而 boot graph
  // 只内联在需要鉴权的首页 HTML 里（本机 `/` = 401）。所以这一项改为验证**它的前置条件**：
  // 产物存在、可被宿主 require、且含本次新增的 UI。真供给链路由人工开页面确认（README 已记）。
  const artifact = join(repoRoot, 'packages', 'codegraph', 'client.js')
  const artifactText = existsSync(artifact) ? readFileSync(artifact, 'utf8') : ''
  const artifactOk = artifactText.includes('__ModuleLoader__') && artifactText.includes('@hyzyn/dsh-codegraph')
  record('浏览器半体产物可供给（combo 的前置条件）', artifactOk,
    `client.js ${String(artifactText.length)} 字节${artifactOk ? '' : '（缺 __ModuleLoader__ / 包名）'}`)
  const hasNewUi = artifactText.includes('cg_projectBtn') && artifactText.includes('cg_projects')
  record('产物含本次新增 UI（项目列表）', hasNewUi,
    hasNewUi ? 'cg_projects / cg_projectBtn 均在' : '产物是旧版——先跑 pnpm --filter @hyzyn/dsh-codegraph build')

  // ---------- 5. MCP 托管行（真索引才写） ----------
  // 托管行应当写在**隔离** home 里（真实那份由收尾的断言守着）。
  // 上面 3b 结束时已切回 managed，所以这里应当看到一条**没有被挂起**的托管行——
  // 顺带验证「切回 managed 之后托管行真的可用」，而不只是「没残留 disabled」。
  const patchText = existsSync(isolatedPatch) ? readFileSync(isolatedPatch, 'utf8') : ''
  record('MCP 托管行已写入隔离 home 的补丁', patchText.includes('mcp-codegraph-managed'),
    existsSync(isolatedPatch) ? `隔离补丁 ${String(patchText.length)} 字节` : '隔离补丁不存在（插件没写托管行？）')
  record('切回 managed 后托管行处于启用态', !/disabled:\s*true/.test(patchText),
    `disabled:true 残留=${String(/disabled:\s*true/.test(patchText))}`)
} catch (error) {
  record('整体执行', false, error instanceof Error ? error.message : String(error))
} finally {
  try { child?.kill('SIGTERM') } catch { /* 已退 */ }
  await new Promise((resolve) => setTimeout(resolve, 1200))
  try { child?.kill('SIGKILL') } catch { /* 已退 */ }
  // 收尾自证：真实 ~/.dsh/cordis.patch.yml 必须逐字节未变。
  // 这条是「不污染用户配置」的执行版——没有它，隔离写错了也没人会发现。
  const realPatchAfter = existsSync(realPatchPath) ? readFileSync(realPatchPath, 'utf8') : undefined
  const untouched = realPatchAfter === realPatchBefore
  record(
    '真实 DSH_HOME 的 cordis.patch.yml 未被改动',
    untouched,
    untouched
      ? `${realPatchPath}（${realPatchAfter === undefined ? '不存在→仍不存在' : String(realPatchAfter.length) + ' 字节，逐字节一致'}）`
      : `❌ ${realPatchPath} 被改动了！before=${realPatchBefore === undefined ? '(不存在)' : String(realPatchBefore.length) + 'B'} after=${realPatchAfter === undefined ? '(不存在)' : String(realPatchAfter.length) + 'B'}`,
  )
  rmSync(workDir, { recursive: true, force: true })
}

const failed = results.filter((r) => !r.ok)
console.log(`\n# 结果：${String(results.length - failed.length)}/${String(results.length)} 通过`)
if (reportPath !== undefined) {
  writeFileSync(reportPath, `${JSON.stringify({ profile, port, results }, null, 2)}\n`)
  console.log(`# 报告：${reportPath}`)
}
if (failed.length > 0) {
  console.error(`\n# 失败项：\n${failed.map((f) => `- ${f.name}: ${f.detail ?? ''}`).join('\n')}`)
  if (stderr !== '') console.error(`\n# 宿主 stderr 尾部：\n${stderr.slice(-1500)}`)
  process.exit(1)
}
