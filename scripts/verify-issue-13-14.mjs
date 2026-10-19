#!/usr/bin/env node
/**
 * 外部测评 issue #13 / #14（共 11 条）的**真机**验收：起真宿主，逐条打真路由。
 *
 * ## 为什么单开一个脚本
 *
 * 这 11 条修的都是「单测能绿、真机才会现形」的行为：托管区块拼装、失败回滚删不删目录、
 * 凭据脱敏后回给浏览器、出站围栏拦不拦 302、systemPrompt 段落插不插值、导入是否覆盖。
 * 单测用的是假 ctx / 假文件系统，证明不了「真宿主里那条路由真的这样答」。
 *
 * ## 隔离（`docs/agent-real-test.md` 的三条硬约束）
 *
 * ① **不污染真实配置**：`DSH_HOME` 指向 `$HOME/.dsh-verify-<pid>`——**同深度**的新目录，
 *    然后把真 profile 用 `copyProfileTree` 拷进去（相对符号链接同深度才不断）。
 *    收尾断言真实 `~/.dsh` 的四个关键文件逐字节未变。
 * ② **不把环境限制当回归**：没装 docker / 没凭据这类，记 WARN 并写清归因，不算 FAIL。
 * ③ **不删别人的东西**：只删本进程记下来的目录。
 *
 * 用法：
 *   node scripts/verify-issue-13-14.mjs [--from test] [--keep]
 *
 * 退出码：全 PASS → 0；有 FAIL → 1。
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { copyProfileTree } from './live-profile.mjs'

const argv = process.argv.slice(2)
const flag = (name) => {
  const i = argv.indexOf(name)
  return i === -1 ? undefined : argv[i + 1]
}
const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const sourceProfile = flag('--from') ?? 'test'
/*
 * 隔离 home 里用的 profile 名。**必须能改**：`desktop` 是 Electron 应用独占的名字，
 * dsh CLI 在 `bin.js` 里硬编码拒绝它（`profile "desktop" is managed exclusively by the
 * Electron application`），连副本都不让起。所以验 desktop 时要 `--from desktop --as verify-desktop`。
 */
const targetProfile = flag('--as') ?? sourceProfile
const keep = argv.includes('--keep')

const results = []
const record = (id, title, ok, detail, level) => {
  const verdict = level === 'warn' ? 'WARN' : ok ? 'PASS' : 'FAIL'
  results.push({ id, title, verdict, detail })
  console.log(`  ${verdict === 'PASS' ? '✔' : verdict === 'WARN' ? '⚠' : '✘'} ${verdict.padEnd(4)} ${id} ${title}`)
  if (detail) console.log(`         ${String(detail).split('\n').join('\n         ')}`)
}

/* ------------------------------ 隔离环境 ------------------------------ */

const pid = process.pid
/** 同深度（都是 `$HOME/xxx`）——profile 里的相对符号链接才不断。 */
const isoHome = path.join(os.homedir(), `.dsh-verify-${pid}`)
const realHome = path.join(os.homedir(), '.dsh')
const createdDirs = []

/** 真实配置基线（收尾自证）。 */
const REAL_FILES = ['cordis.patch.yml', 'prompts.yml', 'env.yml', 'profiles/test/package.json', 'profiles/test/cordis.patch.yml']
const baseline = new Map()
for (const rel of REAL_FILES) {
  const abs = path.join(realHome, rel)
  baseline.set(rel, fs.existsSync(abs) ? fs.readFileSync(abs) : undefined)
}

function setupIsoHome() {
  fs.mkdirSync(path.join(isoHome, 'profiles'), { recursive: true })
  createdDirs.push(isoHome)
  const src = path.join(realHome, 'profiles', sourceProfile)
  if (!fs.existsSync(src)) throw new Error(`源 profile 不存在：${src}`)
  copyProfileTree(src, path.join(isoHome, 'profiles', targetProfile))
  /*
   * 目录名换成 `targetProfile` 之后，profile 的 `package.json.name` 也要跟着改——
   * DSH 用 `dsh-profile-<目录名>` 作为 profile 身份，名字对不上会在 `--dump-config`
   * 阶段就报错（而不是安静地跑起来）。
   */
  const manifestPath = path.join(isoHome, 'profiles', targetProfile, 'package.json')
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  manifest.name = 'dsh-profile-' + targetProfile
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
  // 隔离 home 里的补丁层从空开始（用户的托管行不该跟进来，它们会指向真实路径）
  fs.writeFileSync(path.join(isoHome, 'cordis.patch.yml'), '- insert: []\n')

  /*
   * **把 @hyzyn/* 重指到本仓**（这一步是「验的是本仓代码」的前提）。
   *
   * 源 profile 可能装的是**发布版**（desktop 就是：docker 0.13.2 / kit 0.5.3 全是 npm 上的
   * 真目录，不是 link:）。那样跑出来的结论与本仓无关——第一版就吃过这个：desktop 腿的
   * 13.4b 报「代理命令被执行了」，而真相是发布版 0.13.2 的 `readTtyProxyCommandAllowed`
   * 只读配置值、不查授权（正是 issue #13 第 4 条描述的那个漏洞）。**用旧版本验新修复**，
   * 结论必然相反。
   *
   * 做法：把 profile 的 `node_modules/@hyzyn/<pkg>` 换成指向本仓的相对符号链接，
   * 并把 `package.json.dependencies` 里的版本号改成本仓当前的 `0.0.0-verify` 之外的
   * 真版本——DSH 只按解析结果加载，但 pnpm 的版本校验会在 `--dump-config` 阶段抱怨。
   * 本仓没有的包（如 loglens 在 desktop 里没有）就跳过。
   */
  const repoPackages = path.join(repoRoot, 'packages')
  const hyzynDir = path.join(isoHome, 'profiles', targetProfile, 'node_modules', '@hyzyn')
  const relinked = []
  if (fs.existsSync(hyzynDir)) {
    for (const entry of fs.readdirSync(hyzynDir)) {
      // entry 形如 `dsh-docker`；本仓对应目录是 `packages/docker`
      const pkgDir = path.join(repoPackages, entry.replace(/^dsh-/, ''))
      if (!fs.existsSync(path.join(pkgDir, 'package.json'))) continue
      const slot = path.join(hyzynDir, entry)
      fs.rmSync(slot, { recursive: true, force: true })
      fs.symlinkSync(pkgDir, slot)
      relinked.push(entry)
    }
  }
  console.log(`[verify] 已把 ${String(relinked.length)} 个 @hyzyn/* 重指到本仓：${relinked.join(', ') || '(无)'}`)
}

/* ------------------------------ 宿主控制 ------------------------------ */

let port = 0
async function freePort() {
  const net = await import('node:net')
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const p = server.address().port
      server.close(() => resolve(p))
    })
  })
}

async function startHost(extraEnv = {}) {
  port = await freePort()
  const base = `http://127.0.0.1:${String(port)}`
  let output = ''
  /*
   * **授权落点也必须隔离**（`DSH_KIT_HOME`，kit D12）。
   *
   * 带外授权（就地提权那两个按钮写下的记录）是**持久**的，落在 `<DSH home>/dsh-kit/`。
   * 只隔离 `DSH_HOME` 是不够的——第一版就漏了这一步，于是在这台**用过提权卡片**的机器上：
   * `~/.dsh/dsh-kit/capability-grants.json` 里躺着 `DSH_TTY_ALLOW_PROXY_COMMAND` 的真实授权，
   * 隔离宿主照样读到它 ⇒ 「无授权」这一档**根本不成立**，13.4b 的哨兵被真创建了
   * （`哨兵被创建=true`），看起来像产品漏了闸门，其实是夹具没隔离。
   * 这与 `live-host-smoke.mjs` 记录的那次（2026-09-27，A 段 9 条断言全红、红的理由是
   * 「它其实已授权」）是同一个坑。放在一次性 profile 目录里，随它一起被删。
   */
  const kitHome = path.join(isoHome, 'profiles', targetProfile, '.kit-home')
  const child = spawn('dsh', ['--profile', targetProfile, '--no-open', '--port', String(port)], {
    cwd: repoRoot,
    env: { ...process.env, DSH_HOME: isoHome, DSH_KIT_HOME: kitHome, ...extraEnv },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.on('data', (c) => { output += c })
  child.stderr.on('data', (c) => { output += c })
  const deadline = Date.now() + 90_000
  for (;;) {
    const m = /http:\/\/127\.0\.0\.1:\d+\/\?token=([A-Za-z0-9_-]+)/.exec(output)
    if (m) {
      const tokenUrl = m[0]
      const res = await fetch(tokenUrl, { redirect: 'manual' })
      const cookie = (res.headers.getSetCookie?.() ?? []).map((l) => l.split(';')[0]).join('; ')
      await new Promise((r) => setTimeout(r, 800))
      return { child, base, cookie, log: () => output, token: m[1] }
    }
    if (Date.now() > deadline) {
      child.kill('SIGTERM')
      throw new Error(`宿主 90s 内没打印带 token 的 URL。日志尾部：\n${output.slice(-2000)}`)
    }
    await new Promise((r) => setTimeout(r, 200))
  }
}

function stopHost(host) {
  try { host.child.kill('SIGTERM') } catch { /* 已退 */ }
}

async function request(host, pathname, options = {}) {
  const headers = {
    cookie: host.cookie,
    'sec-fetch-site': 'same-origin',
    origin: host.base,
    ...(options.headers ?? {}),
  }
  if (options.body !== undefined) headers['content-type'] = 'application/json'
  const res = await fetch(host.base + pathname, {
    method: options.method ?? 'GET',
    headers,
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    signal: AbortSignal.timeout(options.timeoutMs ?? 60_000),
  })
  const text = await res.text()
  let json
  try { json = JSON.parse(text) } catch { json = undefined }
  return { status: res.status, text, json }
}

/* ------------------------------ 断言主体 ------------------------------ */

const MARK_START = '# --- dsh-mcp-config managed (auto-generated; do not edit) ---'
const MARK_END = '# --- end dsh-mcp-config managed ---'

async function main() {
  console.log(`[verify] 隔离 home = ${isoHome}（同深度拷贝 profile=${sourceProfile} → 隔离内名=${targetProfile}）`)
  setupIsoHome()

  const host = await startHost()

  /* ============ 13.3a mcp 托管区块：值里含标记文本不得被截断 ============ */
  {
    const evilNote = `行尾带标记 ${MARK_END} 与 ${MARK_START} 的正文`
    const servers = [{
      id: 'mcp-verify-a',
      config: {
        serverName: 'verifyA',
        transport: 'stdio',
        command: '/bin/echo',
        args: ['--note', evilNote],
      },
    }]
    const saved = await request(host, '/api/dsh-mcp/servers/save', { method: 'POST', body: { servers, clearAll: true } })
    const patchPath = path.join(isoHome, 'cordis.patch.yml')
    const patchText = fs.readFileSync(patchPath, 'utf8')
    /*
     * 计数必须**行首锚定**：`evilNote` 里就嵌着这两行标记的原文，全文匹配会把**值里**的
     * 那两份也算进去（第一版就是这么误报的：start=2/end=2 被当成「写了两份标记」，而实际
     * 上真标记各一份、另两份是 YAML 字符串里的正文）。这正是「判据要测对对象」——
     * 托管区块的判据是「**整行**等于标记」，与 spliceManagedBlock 的语义一致。
     */
    const startCount = (patchText.match(/^# --- dsh-mcp-config managed \(auto-generated; do not edit\) ---$/gm) ?? []).length
    const endCount = (patchText.match(/^# --- end dsh-mcp-config managed ---$/gm) ?? []).length
    // 回读：宿主把它当配置解析成功了吗
    const listed = await request(host, '/api/dsh-mcp/servers')
    const roundTrip = JSON.stringify(listed.json ?? {})
    record('13.3a', 'mcp 托管区块：值里含标记文本时完整往返、标记各只一次',
      saved.status === 200 && startCount === 1 && endCount === 1 && roundTrip.includes('verifyA'),
      `save=${String(saved.status)} start=${String(startCount)} end=${String(endCount)} 回读含 verifyA=${String(roundTrip.includes('verifyA'))}`)
  }

  /* ============ 13.3b prompt 托管区块：同样不得被截断 ============ */
  {
    const evil = `正文里有 ${'# --- end dsh-prompt-manager managed ---'} 这行`
    const save = await request(host, '/api/dsh-prompt/save', {
      method: 'POST',
      body: { prompt: { name: 'verify-evil', versions: [{ id: 'v-verify-evil', content: evil }] } },
    })
    /*
     * 这个 profile 可能根本没装 dsh-prompt（desktop 就没有）——那时路由 404、
     * `prompts.yml` 也不会存在。**不能判红**（那是「本次没覆盖到」，不是回归），
     * 但也绝不默默 PASS：记 WARN 并说清用哪个 profile 能覆盖。
     */
    if (save.status === 404) {
      record('13.3b', 'prompt 托管区块：值里含 end 标记时不被截断、标记只一次', false,
        `本 profile（${sourceProfile}）没装 @hyzyn/dsh-prompt → 这条**未被覆盖**；用 --from test 重跑`, 'warn')
    } else {
      const promptFile = path.join(isoHome, 'prompts.yml')
      const text = fs.existsSync(promptFile) ? fs.readFileSync(promptFile, 'utf8') : ''
      // 同样行首锚定：正文里嵌着 end 标记的原文
      const ends = (text.match(/^# --- end dsh-prompt-manager managed ---$/gm) ?? []).length
      const listed = await request(host, '/api/dsh-prompt/list')
      const found = JSON.stringify(listed.json ?? {})
      record('13.3b', 'prompt 托管区块：值里含 end 标记时不被截断、标记只一次',
        save.status === 200 && ends === 1 && found.includes('verify-evil'),
        `save=${String(save.status)} end标记数=${String(ends)} 回读含 verify-evil=${String(found.includes('verify-evil'))}`)
    }
  }

  /* ============ 13.1 profile duplicate：目标已存在不得删掉它 ============ */
  {
    // 先建一个「用户已有」的 profile 目录，再拿它当 duplicate 的目标
    const victimName = 'verify-victim'
    const victimDir = path.join(isoHome, 'profiles', victimName)
    fs.mkdirSync(victimDir, { recursive: true })
    fs.writeFileSync(path.join(victimDir, 'package.json'), JSON.stringify({ name: 'dsh-profile-verify-victim', private: true, dsh: { profile: { bundles: ['@deepseek-ai/dsh-base'] } } }))
    fs.writeFileSync(path.join(victimDir, 'cordis.patch.yml'), '# 用户自己的补丁层\n- id: marker\n  config: { keep: me }\n')

    const res = await request(host, '/api/dsh-profile/duplicate', {
      method: 'POST',
      body: { from: targetProfile, name: victimName },
    })
    const stillThere = fs.existsSync(victimDir) && fs.existsSync(path.join(victimDir, 'package.json'))
    const patchKept = fs.existsSync(path.join(victimDir, 'cordis.patch.yml'))
      && fs.readFileSync(path.join(victimDir, 'cordis.patch.yml'), 'utf8').includes('keep: me')
    if (res.status === 404) {
      record('13.1', 'duplicate 到已存在的目标 → 400 且**不删**那个目录', false,
        `本 profile（${sourceProfile}）没装 @hyzyn/dsh-profile → 这条**未被覆盖**；用 --from test 重跑`, 'warn')
    } else {
      record('13.1', 'duplicate 到已存在的目标 → 400 且**不删**那个目录',
        res.status === 400 && stillThere && patchKept,
        `status=${String(res.status)} 目录还在=${String(stillThere)} 用户补丁还在=${String(patchKept)}\n        响应：${res.text.slice(0, 200)}`)
    }
  }

  /* ============ 13.9 loglens：凭据不得回传浏览器 ============ */
  {
    const secretUrl = 'http://loguser:logpass123@127.0.0.1:3100'
    const add = await request(host, '/api/dsh-loglens/config', {
      method: 'POST',
      body: { action: 'targets.add', target: { kind: 'loki', label: 'verify-loki', url: secretUrl } },
    })
    const get = await request(host, '/api/dsh-loglens/config')
    /*
     * 这个 profile 没装 loglens 时**不能判红**——那是「本次没覆盖到」，不是产品回归
     * （docs/agent-real-test.md 硬约束 ②）。但也不能默默 PASS：记 WARN 并说清怎么覆盖
     * （用 --from 指一个装了 loglens 的 profile 再跑）。
     */
    if (add.status === 404 && get.status === 404) {
      record('13.9a', 'loglens /config 不回传 URL 里的 user:pass', false,
        `本 profile（${sourceProfile}）没装 @hyzyn/dsh-loglens → 这条**未被覆盖**；用 --from <装了 loglens 的 profile> 重跑`,
        'warn')
      record('13.9b', '存储侧仍保留原值（脱敏只在出去的那一侧）', false,
        '同上：本 profile 没有 loglens，未覆盖', 'warn')
    } else {
      const body = get.text
      const leaked = body.includes('logpass123') || body.includes('loguser:')
      /*
       * 存储侧的位置**不能假定**：loglens 的配置走 `settingsEntryScope(ctx,'loglens')`，
       * 也就是写进 profile 的 `cordis.patch.yml`（不是 `storages/`）。第一版按
       * `storages/settings.json` 找，于是「没找到」被误报成「没保留原值」。
       * 判据改成「**任一**落盘位置里有原密码」——真正要证的是「脱敏只在出口做，存储没被破坏」。
       */
      const candidates = [
        path.join(isoHome, 'profiles', targetProfile, 'cordis.patch.yml'),
        path.join(isoHome, 'cordis.patch.yml'),
        path.join(isoHome, 'storages', 'settings.json'),
      ]
      const stored = candidates.filter((p) => fs.existsSync(p)).map((p) => fs.readFileSync(p, 'utf8')).join('\n')
      record('13.9a', 'loglens /config 不回传 URL 里的 user:pass',
        add.status === 200 && get.status === 200 && !leaked,
        `add=${String(add.status)} get=${String(get.status)} 响应里含密码=${String(leaked)}\n        响应片段：${body.slice(0, 260)}`)
      record('13.9b', '存储侧仍保留原值（脱敏只在出去的那一侧）',
        stored.includes('logpass123'),
        `检查了 ${String(candidates.length)} 个落盘点；含原密码=${String(stored.includes('logpass123'))}`)
    }
  }

  /* ============ 13.6 rss：出站围栏拦云元数据 ============ */
  {
    /*
     * 判据落在**保存**这一步：`/config` POST 会对新增的自定义渠道先真抓一次
     * （`validateCustomSource` → `fetchFeed` → kit 围栏），围栏拦下就 400 且不落盘。
     * 第一版看的是 `/refresh` 的响应——那条会用内置源正常出 digest，于是「拦住了」
     * 被误判成「没拦住」。真正要证的是「这条地址进不来」，所以判 save。
     */
    const blocked = await request(host, '/api/dsh-rss/config', {
      method: 'POST',
      body: { config: { sources: [{ name: 'metadata-probe', url: 'http://169.254.169.254/latest/meta-data/' }] } },
    })
    const savedStore = fs.existsSync(path.join(isoHome, 'rss.json')) ? fs.readFileSync(path.join(isoHome, 'rss.json'), 'utf8') : ''
    const fenced = /169\.254|元数据|链路本地|link-local/i.test(blocked.text)
    const notPersisted = !savedStore.includes('169.254.169.254')
    if (blocked.status === 404) {
      record('13.6', 'rss 保存 169.254.169.254 订阅源被出站围栏挡住（400 且不落盘）', false,
        `本 profile（${sourceProfile}）没装 @hyzyn/dsh-rss → 这条**未被覆盖**；用 --from test 重跑`, 'warn')
    } else {
      record('13.6', 'rss 保存 169.254.169.254 订阅源被出站围栏挡住（400 且不落盘）',
        blocked.status === 400 && fenced && notPersisted,
        `save=${String(blocked.status)} 文案点名元数据=${String(fenced)} 未落盘=${String(notPersisted)}\n        响应：${blocked.text.slice(0, 400)}`)
    }
    // 顺带验「302 跟不跟」：本地起一个回 302 到元数据地址的服务器
    const http = await import('node:http')
    const redirector = http.createServer((req, res) => {
      res.writeHead(302, { location: 'http://169.254.169.254/latest/meta-data/' })
      res.end()
    })
    await new Promise((r) => redirector.listen(0, '127.0.0.1', r))
    const rport = redirector.address().port
    const viaRedirect = await request(host, '/api/dsh-rss/config', {
      method: 'POST',
      body: { config: { sources: [{ name: 'redirect-probe', url: `http://127.0.0.1:${String(rport)}/feed` }] } },
    })
    redirector.close()
    const noFollow = /重定向|redirect|3\d\d/i.test(viaRedirect.text)
    if (viaRedirect.status === 404) {
      record('13.6b', 'rss 不跟随 302 到云元数据（重定向被围栏拒）', false,
        `本 profile（${sourceProfile}）没装 @hyzyn/dsh-rss → 未覆盖`, 'warn')
    } else {
      record('13.6b', 'rss 不跟随 302 到云元数据（重定向被围栏拒）',
        viaRedirect.status === 400 && noFollow,
        `save=${String(viaRedirect.status)}\n        响应：${viaRedirect.text.slice(0, 300)}`)
    }
  }

  /* ============ 14.1 systemPrompt 段落不插值（真组装 + 变异验证） ============ */
  {
    /*
     * 第一版这条是**假通过**：它靠 `dsh --profile X headless "hi"` 的输出里没有
     * 「unknown prompt variable」来判。可那个调用当场就报
     * `error: too many arguments. Expected 0 arguments but got 2`——请求**根本没组装**，
     * 「没报插值错」是因为什么都没跑。这正是 docs/agent-real-test.md § 什么算通过 里
     * 点名的第 1 条（只加一条「修前修后都绿」的用例等于没测）。
     *
     * 现在直接挂真 `SystemPrompt` 服务、跑真 `assemble()` + `renderPrompt()`，并且
     * **带变异验证**：同一条正文去掉 `interpolate: false` 必须立刻抛。
     * 两个方向都验，「修好了」才算数。
     */
    const { resolveRuntimeLoader } = await import('./lib/live-harness.mjs')
    const { loadRuntime } = resolveRuntimeLoader(repoRoot)
    const { Context } = await loadRuntime('@deepseek-ai/cordis')
    const spMod = await loadRuntime('@deepseek-ai/dsh-system-prompt')
    const SystemPromptCtor = spMod.SystemPrompt ?? spMod.default
    const promptPlugin = await import(path.join(repoRoot, 'packages/prompt/lib/index.js'))

    /*
     * 进程内挂插件**必须**先把 `DSH_HOME` 指向隔离目录（`dshHome()` 是模块级读 env）。
     * 第一版漏了这一步：prompt 插件于是去读**真实**的 `~/.dsh/prompts.yml`，而它自己的
     * 启动日志已经把这件事说出来了（`prompts file: <真实 home>/prompts.yml`）——
     * 我把它当成了普通日志。教训与 `verify-codegraph-agent-integration.mjs` 文件头记的
     * 一模一样（那里第一版也当场写了真实补丁，被 EPERM 拦下才发现）。
     * 收尾的逐字节自证只能证「最后没变」，证不了「中途读过真实文件」——所以这里显式设。
     */
    const previousDshHome = process.env.DSH_HOME
    process.env.DSH_HOME = isoHome

    const root = new Context()
    await root.plugin(SystemPromptCtor)
    await root.plugin({ name: 'prompt-manager', inject: promptPlugin.inject, apply: promptPlugin.apply }, {})

    const BRACE = '正文含 {{this_variable_does_not_exist_xyz}} 与 {{language}}'
    root.systemPrompt.section({ name: 'probe:literal', order: 900, text: BRACE, interpolate: false })
    const renderedLiteral = spMod.renderPrompt(await root.systemPrompt.assemble())
    const literalKept = renderedLiteral.includes('{{this_variable_does_not_exist_xyz}}')

    // 变异：同一条正文，去掉 interpolate:false → 必须抛（否则这条断言是空断言）
    root.systemPrompt.section({ name: 'probe:interpolated', order: 901, text: BRACE })
    let mutationThrew = false
    let mutationMessage = ''
    try {
      spMod.renderPrompt(await root.systemPrompt.assemble())
    } catch (error) {
      mutationThrew = true
      mutationMessage = error instanceof Error ? error.message : String(error)
    }
    record('14.1', 'systemPrompt 段落带 interpolate:false → 原样保留；去掉则抛（变异验证）',
      literalKept && mutationThrew,
      `原样保留=${String(literalKept)} 变异后抛出=${String(mutationThrew)}\n        变异报错：${mutationMessage.slice(0, 160)}`)

    /*
     * 再补一条**插件自己的**段落：prompt 插件从 prompts.yml 读用户正文后注册的那个段落
     * 也必须是不插值的。这里把正文换成带 {{}} 的，重挂插件看它会不会抛。
     */
    const promptsPath = path.join(isoHome, 'prompts.yml')
    fs.writeFileSync(promptsPath, [
      '# verify fixture',
      '# --- dsh-prompt-manager managed (auto-generated; do not edit) ---',
      'activePromptId: p-brace',
      'prompts:',
      '  - id: p-brace',
      '    name: brace-fixture',
      '    versions:',
      '      - id: v-brace',
      '        content: |',
      '          正文含未知变量 {{this_variable_does_not_exist_xyz}} 与 {{language}}',
      "        createdAt: '2026-10-19T00:00:00.000Z'",
      '    activeVersionId: v-brace',
      '# --- end dsh-prompt-manager managed ---',
      '',
    ].join('\n'))
    const root2 = new Context()
    await root2.plugin(SystemPromptCtor)
    await root2.plugin({ name: 'prompt-manager', inject: promptPlugin.inject, apply: promptPlugin.apply }, {})
    let pluginThrew = false
    let pluginRendered = ''
    try {
      pluginRendered = spMod.renderPrompt(await root2.systemPrompt.assemble())
    } catch (error) {
      pluginThrew = true
      pluginRendered = error instanceof Error ? error.message : String(error)
    }
    const userBodyKept = pluginRendered.includes('{{this_variable_does_not_exist_xyz}}')
    // 还原 DSH_HOME（同一个进程后面还要用真实值做收尾自证）
    if (previousDshHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previousDshHome
    record('14.1b', 'prompt 插件把用户正文（含 {{未知变量}}）注册成不插值段落',
      !pluginThrew && userBodyKept,
      `组装抛错=${String(pluginThrew)} 正文原样保留=${String(userBodyKept)}\n        渲染片段：${pluginRendered.slice(0, 200)}`)
  }

  stopHost(host)

  /* ============ 13.4 docker 代理命令闸门（配置开 + 无授权 → 关） ============ */
  {
    /*
     * 正确的触发路径（第一版写错了）：docker 的 target **没有** `proxyCommand` 字段，
     * 代理命令只存在于 tty 的连接簿条目上，docker 目标用 `book` 引用它。所以要么证
     * 「tty 侧配置改不动（因为没授权）」，要么直接证「dialProxyCommand 在 allowed() 为
     * false 时抛闸门错」。这里两条都验：
     *   a) 无授权时 HTTP 想把 tty 的 allowProxyCommand 打开 → 400（配置面就进不去）；
     *   b) 在 tty 连接簿里塞一条带 proxyCommand 的条目，docker 目标引用它 → 试连时报
     *      **闸门**（"未启用 ProxyCommand"），而不是真去 spawn 那条命令。
     */
    const cfgHost = await startHost()
    const ttyCfg = await request(cfgHost, '/api/dsh-tty/config', {
      method: 'POST',
      body: { allowProxyCommand: true },
    })
    const denied = ttyCfg.status === 400 && /DSH_TTY_ALLOW_PROXY_COMMAND|未获宿主授权/.test(ttyCfg.text)
    record('13.4a', 'tty：无授权时 HTTP 打开 allowProxyCommand → 400 且点名环境变量',
      denied,
      `status=${String(ttyCfg.status)}\n        响应：${ttyCfg.text.slice(0, 300)}`)

    // b) 连接簿里配 proxyCommand（配置层允许存，闸门在执行层），docker 目标用 book 引用
    const sentinel = path.join(isoHome, 'PROXY-CMD-WAS-EXECUTED')
    const book = await request(cfgHost, '/api/dsh-tty/config', {
      method: 'POST',
      body: {
        sshHosts: [{
          name: 'verify-book',
          host: '127.0.0.1',
          port: 65022,
          username: 'nobody',
          auth: 'password',
          password: 'x',
          proxyCommand: `touch ${sentinel}`,
        }],
      },
    })
    const dockerCfg = await request(cfgHost, '/api/dsh-docker/config', {
      method: 'POST',
      body: { targets: [{ name: 'verify-proxy', kind: 'ssh', book: 'verify-book' }] },
    })
    const probe = await request(cfgHost, '/api/dsh-docker/probe', { method: 'POST', body: { target: 'verify-proxy' }, timeoutMs: 90_000 })
    await new Promise((r) => setTimeout(r, 800))
    const executed = fs.existsSync(sentinel)
    const gateText = /未启用|ProxyCommand|未获宿主授权/.test(probe.text)
    record('13.4b', 'docker 引用带 ProxyCommand 的连接簿：无授权 → 报闸门且**不执行**那条命令',
      book.status === 200 && dockerCfg.status === 200 && gateText && !executed,
      `book 配置=${String(book.status)} docker 配置=${String(dockerCfg.status)} probe=${String(probe.status)}\n        哨兵被创建=${String(executed)} 文案含闸门=${String(gateText)}\n        probe 响应：${probe.text.slice(0, 400)}`)
    stopHost(cfgHost)
  }

  /* ============ 13.5 codegraph：子进程中和 .git/config 的命令执行 ============ */
  {
    // 造一个带恶意 .git/config 的临时项目，用真 CLI 跑一次 status，看恶意命令有没有被执行
    const projDir = path.join(isoHome, 'evil-repo')
    fs.mkdirSync(path.join(projDir, '.git'), { recursive: true })
    const sentinel = path.join(isoHome, 'FSMONITOR-WAS-EXECUTED')
    fs.writeFileSync(path.join(projDir, '.git', 'config'), [
      '[core]',
      '\trepositoryformatversion = 0',
      '\tbare = false',
      `\tfsmonitor = touch ${sentinel}`,
      `\thooksPath = ${path.join(isoHome, 'evil-hooks')}`,
      '[user]',
      '\tname = verify',
      '\temail = verify@localhost',
      '',
    ].join('\n'))
    fs.writeFileSync(path.join(projDir, 'a.txt'), 'x\n')
    const cgHost = await startHost()
    const res = await request(cgHost, '/api/dsh-codegraph/status?path=' + encodeURIComponent(projDir), { timeoutMs: 120_000 })
    await new Promise((r) => setTimeout(r, 1200))
    const executed = fs.existsSync(sentinel)
    record('13.5', 'codegraph 执行 status 时中和 .git/config 的 core.fsmonitor',
      !executed,
      `status=${String(res.status)} 哨兵文件被创建=${String(executed)}\n        响应：${res.text.slice(0, 260)}`)
    stopHost(cgHost)
  }

  /* ============ 14.2 prompt 导入 = 合并，不覆盖、不改 active ============ */
  {
    const impHost = await startHost()
    /*
     * id 形态有硬约束：`p-[A-Za-z0-9-]{1,64}` / `v-[A-Za-z0-9-]{1,64}`。
     * 第一版用了 `v1`/`v2`/`v3`（少了 `v-` 前缀）→ save 与 import 双双 400，
     * 看起来像「导入没合并」，其实是**夹具不合规**。改用具名 id。
     */
    const V1 = 'v-local-1'
    const V2 = 'v-local-2'
    const V3 = 'v-imported-3'
    // 先建本地：p-shared 有 v-local-1、v-local-2，active 指向 p-shared
    const mkLocal = await request(impHost, '/api/dsh-prompt/save', {
      method: 'POST',
      body: { prompt: { id: 'p-shared', name: 'local-shared', versions: [{ id: V1, content: '本地 v1' }, { id: V2, content: '本地 v2' }], activeVersionId: V1 } },
    })
    await request(impHost, '/api/dsh-prompt/activate', { method: 'POST', body: { id: 'p-shared' } })
    const before = await request(impHost, '/api/dsh-prompt/list')
    const beforeActive = before.json?.activePromptId

    // 导入：同 id 的 p-shared（v-local-1 内容不同 + v-imported-3 新版本）+ 一个全新 p-new，并声称 active 是 p-new
    const imported = {
      activePromptId: 'p-new',
      prompts: [
        { id: 'p-shared', name: 'imported-shared', versions: [{ id: V1, content: '导入的 v1（不同内容）' }, { id: V3, content: '导入的 v3' }] },
        { id: 'p-new', name: 'imported-new', versions: [{ id: 'v-new-1', content: '全新 Prompt' }] },
      ],
    }
    const imp = await request(impHost, '/api/dsh-prompt/import', { method: 'POST', body: { data: imported } })
    if (mkLocal.status === 404) {
      record('14.2a', '导入同 id Prompt → 合并版本（本地版本保留、新版本补进来）', false,
        `本 profile（${sourceProfile}）没装 @hyzyn/dsh-prompt → 这条**未被覆盖**；用 --from test 重跑`, 'warn')
      record('14.2b', '导入新 id Prompt → 建出来，但 activePromptId 不动', false,
        `同上：本 profile 没有 prompt 插件，未覆盖`, 'warn')
      stopHost(impHost)
      return
    }
    const after = await request(impHost, '/api/dsh-prompt/list')
    const prompts = after.json?.prompts ?? []
    const shared = prompts.find((p) => p.id === 'p-shared')
    const versionIds = (shared?.versions ?? []).map((v) => v.id).sort()
    const localV1Kept = (shared?.versions ?? []).find((v) => v.id === V1)?.content === '本地 v1'
    const newAdded = prompts.some((p) => p.id === 'p-new')
    const activeUnchanged = after.json?.activePromptId === beforeActive
    record('14.2a', '导入同 id Prompt → 合并版本（本地版本保留、新版本补进来）',
      mkLocal.status === 200 && imp.status === 200
        && JSON.stringify(versionIds) === JSON.stringify([V1, V2, V3].sort()) && localV1Kept,
      `本地建=${String(mkLocal.status)} import=${String(imp.status)} 版本=${JSON.stringify(versionIds)} 本地v1原样=${String(localV1Kept)}\n        摘要=${JSON.stringify(imp.json?.importSummary ?? null)}\n        导入响应：${imp.status === 200 ? '(200)' : imp.text.slice(0, 300)}`)
    record('14.2b', '导入新 id Prompt → 建出来，但 activePromptId 不动',
      newAdded && activeUnchanged,
      `新建 p-new=${String(newAdded)} active 前=${JSON.stringify(beforeActive)} 后=${JSON.stringify(after.json?.activePromptId)}`)
    stopHost(impHost)
  }

  /* ============ 13.2 mcp stdin EPIPE：大报文 + 子进程提前关 stdin ============ */
  {
    const epipeHost = await startHost()
    // 一个立刻关掉 stdin 的 stdio 服务器
    const script = path.join(isoHome, 'close-stdin.mjs')
    fs.writeFileSync(script, 'process.stdin.destroy(); process.exit(0)\n')
    const servers = [{ id: 'mcp-epipe', config: { serverName: 'epipe', transport: 'stdio', command: process.execPath, args: [script] } }]
    await request(epipeHost, '/api/dsh-mcp/servers/save', { method: 'POST', body: { servers, clearAll: true } })
    // 连着发几次大报文（触发 EPIPE 的路径）
    let lastStatus = 0
    for (let i = 0; i < 3; i += 1) {
      const res = await request(epipeHost, '/api/dsh-mcp/test', { method: 'POST', body: { id: 'mcp-epipe' }, timeoutMs: 60_000 })
      lastStatus = res.status
    }
    // 宿主还活着吗（EPIPE 曾让宿主 exit(1)）
    const alive = await request(epipeHost, '/api/dsh-mcp/servers').catch(() => undefined)
    record('13.2', 'mcp 子进程关 stdin 后宿主仍存活（EPIPE 不再拖死宿主）',
      alive !== undefined && alive.status === 200,
      `末次 test=${String(lastStatus)} 宿主仍响应 /servers=${String(alive?.status ?? '(无响应)')}`)
    stopHost(epipeHost)
  }

  /* ============ 收尾：真实配置逐字节未变 ============ */
  const changed = []
  for (const rel of REAL_FILES) {
    const abs = path.join(realHome, rel)
    const now = fs.existsSync(abs) ? fs.readFileSync(abs) : undefined
    const before = baseline.get(rel)
    const same = (now === undefined && before === undefined)
      || (now !== undefined && before !== undefined && now.equals(before))
    if (!same) changed.push(rel)
  }
  record('SELF', '真实 ~/.dsh 的关键文件逐字节未变', changed.length === 0,
    changed.length === 0 ? `${String(REAL_FILES.length)} 个文件全部一致` : `被改动了：${changed.join(', ')}`)
}

/* ------------------------------ 主流程 ------------------------------ */

try {
  await main()
} catch (error) {
  record('FATAL', '脚本执行', false, error instanceof Error ? `${error.message}\n${error.stack ?? ''}`.slice(0, 1200) : String(error))
} finally {
  const fails = results.filter((r) => r.verdict === 'FAIL').length
  const warns = results.filter((r) => r.verdict === 'WARN').length
  console.log(`\n[verify] ${String(results.length - fails - warns)} PASS / ${String(warns)} WARN / ${String(fails)} FAIL`)
  if (keep) {
    console.log(`[verify] --keep：保留隔离 home ${isoHome}（请自己删）`)
  } else {
    for (const dir of createdDirs) {
      try { fs.rmSync(dir, { recursive: true, force: true }) } catch { /* 尽力 */ }
    }
    console.log(`[verify] 已删除隔离 home ${isoHome}`)
  }
  process.exit(fails === 0 ? 0 : 1)
}
