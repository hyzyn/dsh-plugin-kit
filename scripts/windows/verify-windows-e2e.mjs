/**
 * Windows 真机端到端验证：走**已构建的插件本体**，覆盖
 *   - `@hyzyn/dsh-codegraph` 的外部真机缺陷报告 #1 / #2 / #3（`#N` 是**报告序号**，不是任何包的台账编号）；
 *   - `@hyzyn/dsh-mcp` 连接测试的启动方式与 stderr 解码（本仓库唯一会起 MCP 服务器的地方）。
 *
 * 与 `packages/codegraph/test/cli-route.test.ts` 的区别：那个跑在 vitest 上（需要 rollup 的
 * 原生模块 + MSVC 运行库）；这个只用 Node 直接 import `lib/index.js`，因此在只装了 Node 的
 * 干净 Windows 上也能跑，用来给「真机上到底还乱不乱码、重新探测到底管不管用」留证据。
 *
 * 用法（Windows 仓库根，先 `pnpm -r build`）：
 *
 *   node scripts/windows/verify-windows-e2e.mjs
 *   node scripts/windows/verify-windows-e2e.mjs --report C:\path\to\report.json
 *
 * 退出码：0 = 全部 PASS，1 = 有 FAIL。
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const args = process.argv.slice(2)
const flag = (name) => {
  const index = args.indexOf(name)
  return index === -1 ? undefined : args[index + 1]
}
const repo = resolve(flag('--repo') ?? process.cwd())
const reportPath = flag('--report')

const results = []
const record = (name, ok, detail) => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '\n      ' + detail : ''}`)
}

console.log('# Windows 真机端到端验证（codegraph D1/D2/D3 + mcp 连接测试）')
console.log(`# node ${process.version} / ${process.platform} / repo ${repo}\n`)

if (process.platform !== 'win32') {
  console.log('FAIL  本脚本验证的是 Windows 的 cmd.exe shim 与代码页行为，只能在 Windows 上跑')
  process.exit(1)
}

const pluginUrl = pathToFileURL(join(repo, 'packages', 'codegraph', 'lib', 'index.js')).href
let apply
try {
  ;({ apply } = await import(pluginUrl))
} catch (error) {
  console.log(`FAIL  无法加载已构建的插件（先在仓库根跑 pnpm -r build）：${String(error?.message ?? error)}`)
  process.exit(1)
}

const sandbox = mkdtempSync(join(tmpdir(), 'cg-e2e-'))
const dshHome = join(sandbox, 'dsh-home')
const project = join(sandbox, 'project')
mkdirSync(dshHome, { recursive: true })
mkdirSync(project, { recursive: true })
process.env.DSH_HOME = dshHome

/**
 * 最小假宿主：只提供 apply() 会用到的 webServer / settings / systemPrompt。
 * `target` 覆盖默认项目路径（测 init 时需要指向一个干净目录）。
 */
function mountPlugin(command, target) {
  const routes = new Map()
  const sections = new Map()
  const listeners = []
  const settingsStore = {}
  const settings = {
    register() {
      return {
        get: () => ({ ...settingsStore }),
        update: async (patch) => {
          Object.assign(settingsStore, patch)
          for (const listener of [...listeners]) listener('codegraph', { ...settingsStore })
          return settingsStore
        },
      }
    },
  }
  const systemPrompt = {
    section(section) {
      sections.set(section.name, section)
      return () => sections.delete(section.name)
    },
  }
  const on = (name, listener) => {
    if (name !== 'settings/updated') return () => {}
    listeners.push(listener)
    return () => {}
  }
  const base = { events: { on }, on, effect: (fn) => fn() }
  const ctx = {
    ...base,
    inject(names, callback) {
      const sub = { ...base }
      if (names.includes('webServer')) {
        sub.webServer = { register: (route) => (routes.set(route.path, route), () => {}) }
      }
      if (names.includes('settings')) sub.settings = settings
      if (names.includes('systemPrompt')) sub.systemPrompt = systemPrompt
      callback(sub)
    },
  }
  apply(ctx, { command, defaultPath: target ?? project, announceToAgent: true, usageGuidance: true })
  return { routes, sections }
}

function fakeReq(init = {}) {
  const payload = init.body === undefined ? undefined : Buffer.from(JSON.stringify(init.body))
  return {
    method: init.method ?? 'GET',
    url: init.url ?? '/',
    headers: { host: '127.0.0.1:3082' },
    socket: { remoteAddress: '127.0.0.1' },
    async *[Symbol.asyncIterator]() {
      if (payload !== undefined) yield payload
    },
  }
}
async function call(routes, path, init = {}) {
  const route = routes.get(path)
  if (route === undefined) throw new Error(`未注册路由 ${path}`)
  let status
  let body
  await route.handler(fakeReq(init), {
    writeHead: (code) => (status = code),
    end: (text) => (body = text === undefined ? undefined : JSON.parse(text)),
  })
  return { status, body }
}
const mojibake = (text) => typeof text === 'string' && text.includes('\uFFFD')
const readableChinese = (text) => typeof text === 'string' && /[\u4e00-\u9fff]/.test(text) && !mojibake(text)

/* ---- D3：CLI 不存在时，失败原因是实测原文且可读 ---- */
const missing = join(sandbox, 'no-such-cli.cmd')
{
  const mount = mountPlugin(missing)
  const deadline = Date.now() + 8_000
  let body
  while (Date.now() < deadline) {
    body = (await call(mount.routes, '/api/dsh-codegraph/default-path')).body
    if (body?.cliAvailable === false) break
    await new Promise((r) => setTimeout(r, 50))
  }
  const detail = String(body?.cliProbeError ?? '')
  record('D3：探测失败时 /default-path 带出实测原因（不再是布尔）', body?.cliAvailable === false && detail !== '', `cliAvailable=${body?.cliAvailable} cliProbeError=${JSON.stringify(detail.slice(0, 140))}`)
  record('D2+D3：原因里没有替换字符（CP936 的 cmd.exe 报错被正确解码）', !mojibake(detail), mojibake(detail) ? `含 \\uFFFD：${JSON.stringify(detail.slice(0, 120))}` : '无 \\uFFFD')
  record('D2+D3：原因可读（要么 ENOENT，要么中文原文）', detail.includes('ENOENT') || readableChinese(detail), `readable=${readableChinese(detail)}`)
  record('D3：带上探测时刻（卡片据此显示「上次探测」）', typeof body?.cliProbeAt === 'number', `cliProbeAt=${body?.cliProbeAt}`)
}

/* ---- D2：CLI 存在但非零退出、且往 stderr 写 CP936 中文 ---- */
{
  const failing = join(sandbox, 'failing-cli.cmd')
  writeFileSync(failing, '@echo off\r\nthis-command-does-not-exist-9f3a\r\nexit /b 3\r\n')
  const mount = mountPlugin(failing)
  const deadline = Date.now() + 8_000
  let body
  while (Date.now() < deadline) {
    body = (await call(mount.routes, '/api/dsh-codegraph/default-path')).body
    if (body?.cliAvailable === false) break
    await new Promise((r) => setTimeout(r, 50))
  }
  const detail = String(body?.cliProbeError ?? '')
  record(
    'D2：非零退出 + CP936 stderr 的组合，卡片拿到的是中文原文',
    readableChinese(detail) && detail.includes('不是内部或外部命令'),
    `cliProbeError=${JSON.stringify(detail.slice(0, 160))}`,
  )
}

/* ---- D1：CLI 在挂载之后才出现，重新探测能否就地恢复 ---- */
{
  const late = join(sandbox, 'late-cli.cmd')
  const mount = mountPlugin(late)
  const deadline = Date.now() + 8_000
  while (Date.now() < deadline) {
    const body = (await call(mount.routes, '/api/dsh-codegraph/default-path')).body
    if (body?.cliAvailable === false) break
    await new Promise((r) => setTimeout(r, 50))
  }
  const before = mount.sections.size
  // 只把 CLI 补上：不动补丁、不重启宿主（报告 #1 的确定性复现步骤）
  writeFileSync(late, '@echo off\r\necho 9.9.9\r\n')
  const reprobed = await call(mount.routes, '/api/dsh-codegraph/reprobe', { method: 'POST' })
  record(
    'D1：CLI 后装好时 POST /reprobe 就地翻真（原实现永远读同一个缓存）',
    reprobed.status === 200 && reprobed.body?.cliAvailable === true,
    `status=${reprobed.status} cliAvailable=${reprobed.body?.cliAvailable} cliProbeError=${JSON.stringify(reprobed.body?.cliProbeError ?? null)}`,
  )
  record('D1：重探结果真的推到 systemPrompt 门禁（两段 section 都注入）', mount.sections.size === 2, `注入前 ${before} 段 → 注入后 ${mount.sections.size} 段`)
  record(
    'D1：GET 不允许触发重探（有副作用，只认 POST）',
    (await call(mount.routes, '/api/dsh-codegraph/reprobe')).status === 405,
    'GET /reprobe → 405',
  )
}

/* ---- 附：stdio MCP 服务器的启动方式（本仓库的「连接测试」踩过的坑） ---- *
 * 需要区分两条路径，别把结论说过头：
 *   - **真正的工具加载**走 DSH 核心的 `@deepseek-ai/dsh-mcp-client` → 官方 SDK 的
 *     StdioClientTransport，它内部用 cross-spawn，Windows 上本来就没问题；
 *   - **本仓库 `@hyzyn/dsh-mcp` 的「连接测试」**是自己手写 JSON-RPC 探测（README 明说
 *     「不经 MCP SDK」），原先用裸 `spawn`，Windows 上拉 `.cmd` 必报 EINVAL——
 *     于是诊断按钮本身永久报错，把用户引向「CLI 没装好」的错判。
 * 下面同时断言「裸 spawn 会失败」与「经 spawnPortable 能真正握手成功」。
 */
const codegraphCli = flag('--codegraph-cli')
if (codegraphCli === undefined) {
  console.log('SKIP  附：stdio MCP 启动检查（未给 --codegraph-cli）')
} else {
  const rawSpawn = await new Promise((resolve) => {
    let child
    try {
      child = spawn(codegraphCli, ['serve', '--mcp'], { stdio: ['pipe', 'pipe', 'pipe'] })
    } catch (error) {
      return resolve(String(error?.code ?? error?.message))
    }
    child.on('error', (error) => resolve(String(error?.code ?? error?.message)))
    child.on('exit', () => resolve(undefined))
    setTimeout(() => {
      try {
        child.kill()
      } catch {
        /* 已退出 */
      }
    }, 400)
  })
  record(
    '附 A：裸 spawn 一个 .cmd 确实失败（复现被修掉的缺陷本身）',
    rawSpawn !== undefined,
    rawSpawn === undefined ? '居然成功了——缺陷前提不成立，请复核' : `裸 spawn → ${rawSpawn}`,
  )

  const { spawnPortable } = await import(pathToFileURL(join(repo, 'packages', 'kit', 'lib', 'windows-shim.js')).href)
  const handshake = await new Promise((resolve) => {
    let child
    try {
      child = spawnPortable(codegraphCli, ['serve', '--mcp'], { stdio: ['pipe', 'pipe', 'pipe'] })
    } catch (error) {
      return resolve({ ok: false, error: String(error?.code ?? error?.message) })
    }
    let buffer = ''
    let stderr = ''
    const done = (result) => {
      clearTimeout(timer)
      try {
        child.kill()
      } catch {
        /* 已退出 */
      }
      resolve(result)
    }
    const timer = setTimeout(() => done({ ok: false, error: `握手超时；stderr=${stderr.slice(0, 160)}` }), 20_000)
    child.on('error', (error) => done({ ok: false, error: String(error?.code ?? error?.message) }))
    child.stderr?.on('data', (chunk) => (stderr += chunk.toString()))
    child.stdout?.on('data', (chunk) => {
      buffer += chunk.toString()
      // tools/list 的响应一回来就算握手成功（与 mcp 的「连接测试」同一个判据）
      if (/"id":\s*1/.test(buffer) && /"result"/.test(buffer)) done({ ok: true, tools: (buffer.match(/"name"/g) ?? []).length })
      if (/"id":\s*0/.test(buffer) && /"result"/.test(buffer)) {
        child.stdin?.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`)
        child.stdin?.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })}\n`)
      }
    })
    child.stdin?.write(
      `${JSON.stringify({
        jsonrpc: '2.0',
        id: 0,
        method: 'initialize',
        params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'dsh-verify', version: '1' } },
      })}\n`,
    )
  })
  record(
    '附 B：经 spawnPortable（kit 的 Windows shim）能完成 initialize + tools/list 握手',
    handshake.ok === true,
    handshake.ok ? `握手成功，响应里出现 ${handshake.tools} 个 "name" 字段` : `失败：${handshake.error}`,
  )
}

/* ---- @hyzyn/dsh-mcp：连接测试的 stderr 也要能读 ----
 * 这个包是官方 `@deepseek-ai/dsh-mcp-client` 的**配置管理器**（写 patch 行 / 读 loader 存活
 * 状态），它自己只在「连接测试」里起一次进程。全仓库唯一会起 MCP 服务器的地方就是它。
 * 这里走真实路由 POST /api/dsh-mcp/test，断言失败原因里的 stderr 不是 `���`。
 */
{
  const mcpUrl = pathToFileURL(join(repo, 'packages', 'mcp', 'lib', 'index.js')).href
  try {
    const { apply: applyMcp } = await import(mcpUrl)
    const routes = new Map()
    const base = { events: { on: () => () => {} }, on: () => () => {}, effect: (fn) => fn() }
    const ctx = {
      ...base,
      inject(names, callback) {
        const sub = { ...base }
        if (names.includes('webServer')) sub.webServer = { register: (route) => (routes.set(route.path, route), () => {}) }
        if (names.includes('settings')) sub.settings = { register: () => ({ get: () => ({}), update: async () => ({}) }) }
        if (names.includes('systemPrompt')) sub.systemPrompt = { section: () => () => {} }
        callback(sub)
      },
    }
    applyMcp(ctx, { enabled: true })

    // 一个跑不起来的 stdio 服务器：cmd.exe 会用自己的代码页写「不是内部或外部命令」，
    // 进程随即退出 —— 正好命中 probeStdio 的 exit 分支（那里会带上 stderr 尾巴）。
    const brokenServer = join(sandbox, 'broken-mcp-server.cmd')
    writeFileSync(brokenServer, '@echo off\r\nthis-command-does-not-exist-9f3a\r\n')

    const probe = await call(routes, '/api/dsh-mcp/test', {
      method: 'POST',
      body: { config: { serverName: 'probe-target', transport: 'stdio', command: brokenServer, args: [] } },
    })
    const errorText = String(probe.body?.result?.error ?? '')
    record(
      'mcp：POST /api/dsh-mcp/test 走到了失败分支并带回 stderr',
      probe.status === 200 && probe.body?.result?.ok === false && errorText.includes('stderr:'),
      `status=${probe.status} ok=${probe.body?.result?.ok} error=${JSON.stringify(errorText.slice(0, 140))}`,
    )
    record(
      'mcp：stderr 里的 cmd.exe 报错是中文原文，不是 `���`',
      errorText.includes('不是内部或外部命令') && !mojibake(errorText),
      mojibake(errorText) ? '含 \\uFFFD（解码没生效）' : `readable=${readableChinese(errorText)}`,
    )
  } catch (error) {
    record('mcp：连接测试的 stderr 解码', false, `挂载/调用失败：${String(error?.message ?? error)}`)
  }
}

/* ---- 一键初始化：对**真实 CLI**跑 `init -y -- <path>` ---- *
 * 这条同时压到两件事：新功能本身，以及 `-y` / `--` 经 cmd.exe shim 的转义（Windows 上
 * 参数要先被 cmd 重新解析一遍，写错就是「init 挂起等输入」或「路径被当成选项」）。
 */
{
  const fresh = join(sandbox, 'fresh-project')
  mkdirSync(fresh, { recursive: true })
  const mount = mountPlugin(codegraphCli ?? 'codegraph', fresh)

  const before = (await call(mount.routes, '/api/dsh-codegraph/default-path')).body
  record('init：干净目录挂载时报告未索引', before?.indexed === false, `indexed=${before?.indexed} indexState=${before?.indexState}`)

  const created = await call(mount.routes, '/api/dsh-codegraph/init', { method: 'POST', body: { path: fresh } })
  record(
    'init：POST /api/dsh-codegraph/init 真的建立了索引',
    created.status === 200 && created.body?.indexed === true,
    `status=${created.status} indexed=${created.body?.indexed} output=${JSON.stringify(String(created.body?.output ?? '').replace(/\s+/g, ' ').slice(0, 120))}`,
  )
  record(
    'init：.codegraph/ 与索引库真的落在磁盘上',
    existsSync(join(fresh, '.codegraph', 'codegraph.db')),
    `存在 ${join(fresh, '.codegraph', 'codegraph.db')}：${existsSync(join(fresh, '.codegraph', 'codegraph.db'))}`,
  )
  record(
    "init：源文件与项目根 .gitignore 没被动过（只在 .codegraph/ 里写东西）",
    !existsSync(join(fresh, '.gitignore')),
    existsSync(join(fresh, '.gitignore')) ? '项目根被建了 .gitignore，超出预期' : '根 .gitignore 未创建（.codegraph/.gitignore 自忽略，符合实测）',
  )

  const after = (await call(mount.routes, '/api/dsh-codegraph/default-path')).body
  record('init：索引态随之翻成已索引（卡片不再显示未索引警告）', after?.indexed === true, `indexed=${after?.indexed} indexState=${after?.indexState}`)

  const again = await call(mount.routes, '/api/dsh-codegraph/init', { method: 'POST', body: { path: fresh } })
  record('init：对已索引目录返回 409，不重复初始化', again.status === 409, `status=${again.status} error=${JSON.stringify(again.body?.error)}`)
}

/* ---- 汇总 ---- */
const failed = results.filter((entry) => !entry.ok)
console.log(`\n# 汇总：${results.length - failed.length}/${results.length} PASS`)
if (reportPath !== undefined) {
  writeFileSync(
    reportPath,
    JSON.stringify({ node: process.version, platform: process.platform, arch: process.arch, results, failed: failed.map((e) => e.name) }, null, 2),
    'utf8',
  )
  console.log(`# 报告已写出（UTF-8）：${reportPath}`)
}
try {
  rmSync(sandbox, { recursive: true, force: true })
} catch {
  /* 真机上可能有子进程还占着 cwd：临时目录交给系统回收 */
}
if (failed.length > 0) {
  console.log(`# FAIL 项：${failed.map((entry) => entry.name).join('；')}`)
  process.exit(1)
}
console.log('# 全部通过')
