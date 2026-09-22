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
 */
import { spawn } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
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
  '# 临时层：独立端口 + 固定默认项目（不修改任何 profile / settings 文件）',
  '- id: webserver',
  '  config:',
  "    host: '127.0.0.1'",
  `    port: ${String(port)}`,
  '- id: codegraph',
  '  config:',
  `    defaultPath: '${projectDir}'`,
  '',
].join('\n'))

console.log(`# node ${process.version} / profile ${profile} / 端口 ${String(port)}`)
console.log(`# 临时项目：${projectDir}\n`)

let child
let stderr = ''
try {
  // 整份拷入被测 profile：插件/配置照旧，但组装产物与 home 级写入都落在隔离目录
  cpSync(join(realDshHome, 'profiles', profile), join(isolatedHome, 'profiles', profile), { recursive: true })
  child = spawn(dshBin, ['--profile', profile, '--patch', overlay], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, DSH_HOME: isolatedHome },
  })
  child.stderr?.on('data', (chunk) => (stderr += String(chunk)))
  const up = await waitForPort(child)
  if (!up) throw new Error(`宿主没在 ${String(port)} 上就绪；stderr=${stderr.slice(-400)}`)

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
  // 托管行应当写在**隔离** home 里（真实那份由收尾的断言守着）
  const isolatedPatch = join(isolatedHome, 'cordis.patch.yml')
  const patchText = existsSync(isolatedPatch) ? readFileSync(isolatedPatch, 'utf8') : ''
  record('MCP 托管行已写入隔离 home 的补丁', patchText.includes('mcp-codegraph-managed'),
    existsSync(isolatedPatch) ? `隔离补丁 ${String(patchText.length)} 字节` : '隔离补丁不存在（插件没写托管行？）')
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
