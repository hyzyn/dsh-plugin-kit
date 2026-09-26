#!/usr/bin/env node
/**
 * 真宿主验收（仓库级）：能力开关的授权阶梯 + 代理命令文案（**本地门槛，不进 CI**）。
 *
 * ## 为什么要有这个脚本
 *
 * `pnpm test` 用的是**假 ctx + 假 settings**，`preview.mjs` 用的是**没有宿主的静态夹具**。
 * 两者都测不到下面这一类：
 *   - 真 DSH 的 settings 存储 / loader 有没有按我们以为的方式把值交下来；
 *   - profile 组合后插件**到底挂没挂上**、HTTP 路由是不是真的在；
 *   - 真 spawn 的时序（tty D66 就是这么被挖出来的：探针结算后被后到的事件覆写结果）；
 *   - 浏览器真正加载的那份 `client.js` 里有没有新键。
 *
 * 2026-09-26 第一次真机验收（手工）就是靠它抓到 **tty D66**——所以把它固化成脚本，让
 * [RELEASING.md](../RELEASING.md) 的发布门槛 #3「动了运行行为的改动，真实装进 DSH 跑一遍」
 * 变成一条命令，而不是一段记忆。
 *
 * ## 它怎么保证不动你的东西
 *
 * - **不碰你的 profile**：从你已有的某个「link 到本仓」的 profile 复制两份到
 *   `~/.dsh/profiles/live-smoke-<pid>-{a,b}`（每个实例一份——共用会让 A 的降权写盘污染 B
 *   的断言，第一次跑就撞上），跑完删掉。**不能换 `DSH_HOME` 来隔离**：profile 里的
 *   node_modules 是指向本仓的**相对**符号链接，挪到别处就全断、插件被整批跳过（实测过）；
 * - 起的是**独立端口**的宿主实例（`--port` 现选空闲口），不碰你正在用的那些；
 * - 复制来的 profile 里，docker 的 `allowMutations` / `allowExec` 会被**改成 true**——
 *   这正是要验的东西：「配置里写着 true，但宿主没授权 → 有效值仍是 false」；
 * - 需要本机装了 DSH（`dsh` 在 PATH 上，或 `--dsh <path>`）。没装就 **SKIP**（退出 0），
 *   加 `--strict` 则视为失败（CI/发布流水里想强制时用）；
 * - 机器上**没有**「link 到本仓」的 profile 时（干净 CI 腿 / VM / 新克隆都是这样），默认 SKIP；
 *   加 `--bootstrap` 会**现场造一个**一次性模板 profile 再来跑（[live-profile.mjs](./live-profile.mjs)：
 *   从 dsh 自带的 `web` 模板初始化 + link 本仓的 docker/tty + 自证插件真进了阵容），跑完连它
 *   一起删。所以干净环境上一条命令就能连宿主一起验：`node scripts/live-host-smoke.mjs --bootstrap --strict`。
 *
 * ## 断言什么（两个实例：A 无授权 / B 带授权环境变量）
 *
 * | # | 场景 | 期望 |
 * |---|---|---|
 * | A1 | 配置里 `allowMutations/allowExec: true`、无授权 | 快照 `false` / `*Granted: false` |
 * | A2 | `POST /config {allowMutations:true}` | 400，文案点名 `DSH_DOCKER_ALLOW_MUTATIONS` 与「重启宿主」 |
 * | A3 | `POST /config {allowExec:true}` | 400，点名 `DSH_DOCKER_ALLOW_EXEC` |
 * | A4 | 降权 `POST {allowMutations:false}` | 200（紧急刹车不依赖授权） |
 * | A1b | 播种的本地目标（`live-smoke-local`） | 出现在快照里（验收只碰本机） |
 * | A5 | agent 工具清单 | 只有只读工具，没有 `docker_action` / `docker_exec` |
 * | A5b/A5c | 绕开工具直接打 `/action`、`/exec` | 403，文案点名对应环境变量 |
 * | A6 | tty：`POST {allowProxyCommand:true}` | 400，点名 `DSH_TTY_ALLOW_PROXY_COMMAND` |
 * | A7 | 试连带 `proxyCommand` | `proxy.active:false` + 「未获宿主授权」，且**不拨号** |
 * | B1 | 带授权启动 | `*Granted: true`；`allowExec` 按配置生效为 true |
 * | B2 | `POST {allowMutations:true}` | 200，有效值 true |
 * | B3 | agent 工具清单 | 多出 `docker_action` / `docker_image_*` / `docker_exec` |
 * | B3b | 授权后打 `/action` | 不再 403（过了门控，落到 docker 自身错误） |
 * | B4 | tty：打开 `allowProxyCommand` | 200 |
 * | B5 | 真跑一条必然失败的代理命令 | 文案带子进程 stderr（tty D66 的回归） |
 * | B6 | 浏览器加载的那份 client.js | 含 `allowProxyCommandGranted` / `hint.proxyCommandNotGranted` / `allowMutationsGranted` |
 *
 * 用法：
 *   node scripts/live-host-smoke.mjs [--dsh <path>] [--from <profile>] [--bootstrap] [--strict] [--keep]
 *   （等价入口：`pnpm live-smoke`）
 *
 * 退出码：全 PASS → 0；任一 FAIL → 1；没装 DSH / 没扫到 link profile → 0（打印 SKIP），
 * 加 `--strict` 则算失败；**显式 `--from <name>` 却不合格 → 1**（用户点名了它，跳过等于假装验过）。
 */
import { execFileSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { bootstrapLinkProfile } from './live-profile.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dshHome = process.env.DSH_HOME ?? path.join(os.homedir(), '.dsh')
const profilesDir = path.join(dshHome, 'profiles')
/**
 * 拿来当代理命令的桥（`ssh -W %h:%p` 的原语）。
 *
 * 用它而不是系统 ssh / nc：CI 与本机都不保证有那两个，而这是本仓自带的、十几行的等价物；
 * 也让「真 spawn 一个子进程、它的 stdio 就是 SSH 传输」这件事在验收里被真的跑一遍。
 */
const bridgePath = path.join(repoRoot, 'packages', 'tty', 'scripts', 'lib', 'proxy-bridge.mjs')
/**
 * 播种进 profile 的**本地** docker 目标名。
 *
 * 为什么必须自己播一个：源 profile 里的目标可能全是 SSH 主机——`/action` 会先解析目标、再判能力门，
 * 拿一个不存在的名字去试只会得到「未知目标」（而不是我们要验的 403）；而拿 SSH 目标去试，
 * 授权那一半会**真的去连别人的机器**（慢，而且不该在验收里发生）。
 */
const LIVE_TARGET = 'live-smoke-local'

/* ------------------------------- 参数 ------------------------------- */

const argv = process.argv.slice(2)
const flag = (name) => argv.includes(name)
const value = (name) => {
  const i = argv.indexOf(name)
  return i === -1 ? undefined : argv[i + 1]
}
const strict = flag('--strict')
const keep = flag('--keep')
const bootstrap = flag('--bootstrap')

/* ------------------------------ 断言框架 ------------------------------ */

const results = []
function pass(name) {
  results.push(['PASS', name])
  console.log(`  ✔ PASS  ${name}`)
}
function fail(name, detail) {
  results.push(['FAIL', name, detail])
  console.log(`  ✘ FAIL  ${name}${detail === undefined ? '' : ` — ${detail}`}`)
}
function check(name, ok, detail) {
  if (ok) pass(name)
  else fail(name, detail)
}

/* ------------------------------ 工具函数 ------------------------------ */

/** 让 OS 给一个空闲端口（拿完就关，紧接着被宿主占用）。 */
async function freePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port
      server.close(() => resolve(port))
    })
  })
}

function findDsh() {
  const explicit = value('--dsh')
  if (explicit !== undefined) return fs.existsSync(explicit) ? explicit : null
  try {
    // Windows 上没有 `which`（`where` 才是等价物）：写错的话脚本会永远 SKIP，看起来像「没装 DSH」
    const found = execFileSync(process.platform === 'win32' ? 'where' : 'which', ['dsh'], { encoding: 'utf8' })
      .split('\n')[0].trim()
    return found !== '' && fs.existsSync(found) ? found : null
  } catch {
    return null
  }
}

/**
 * 找一个「link 到本仓」的 profile 当模板。
 *
 * 判据是**它的 package.json 里至少一个 @hyzyn/* 是指向本仓 packages/ 的 link:**——否则复制
 * 出来验的是 npm 上的旧版本，本脚本的结论会假绿（这正是最容易骗过自己的地方）。
 *
 * **没有 profiles/ 目录本身不是错误**（DSH 装了但从没起过任何 profile 的干净机器就是这样；
 * 隔离的 DSH_HOME 更是必然如此）——那只是「扫不到模板」，由调用方决定 SKIP 还是 `--bootstrap`。
 */
function pickSourceProfile(preferred) {
  const wanted = preferred ?? value('--from')
  let names
  if (wanted === undefined) {
    if (!fs.existsSync(profilesDir)) return null
    names = ['test', ...fs.readdirSync(profilesDir).filter((n) => n !== 'test')]
  } else {
    names = [wanted]
  }
  for (const name of names) {
    const pkgPath = path.join(profilesDir, name, 'package.json')
    if (!fs.existsSync(pkgPath)) continue
    let deps = {}
    try {
      deps = JSON.parse(fs.readFileSync(pkgPath, 'utf8')).dependencies ?? {}
    } catch {
      continue
    }
    const linked = Object.entries(deps).filter(([dep, spec]) =>
      dep.startsWith('@hyzyn/') && typeof spec === 'string' && spec.startsWith('link:') && spec.includes('/packages/'))
    if (linked.length === 0) continue
    const repoLinked = linked.filter(([, spec]) => path.resolve(spec.slice('link:'.length)).startsWith(repoRoot))
    if (repoLinked.length === 0) continue
    return { name, deps, repoLinked: repoLinked.map(([dep]) => dep) }
  }
  return null
}

/** 复制 profile（保留相对符号链接——它们靠「与源 profile 同深度」成立）。 */
function copyProfile(sourceName, destName) {
  const from = path.join(profilesDir, sourceName)
  const to = path.join(profilesDir, destName)
  if (fs.existsSync(to)) throw new Error(`临时 profile 已存在，拒绝覆盖：${to}（换个 PID 或先手动删掉）`)
  fs.cpSync(from, to, { recursive: true, verbatimSymlinks: true, dereference: false })
  return to
}

/**
 * 给复制出来的 profile 播种：
 *   - `profile.runtime.json` 的端口改成现选的空闲口（宿主也显式传 `--port`，这里只是不留旧值）；
 *   - `package.json` 改个名（免得日志里看起来像在动源 profile）；
 *   - **把 docker 的 `allowMutations` / `allowExec` 改成 true**——本脚本要验的正是
 *     「配置里写着 true，但宿主没授权时有效值仍是 false」。
 */
function seedProfile(profileDir, port) {
  const runtime = path.join(profileDir, 'profile.runtime.json')
  if (fs.existsSync(runtime)) fs.writeFileSync(runtime, JSON.stringify({ port }, null, 2))
  const pkgPath = path.join(profileDir, 'package.json')
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
  pkg.name = 'dsh-profile-live-smoke'
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2))
  const patchPath = path.join(profileDir, 'cordis.patch.yml')
  const text = fs.readFileSync(patchPath, 'utf8')
  /*
   * 播种**按 entry 作用域**做（别全局替换）：patch 文件里其它插件也可能有同名键。
   * 目标：docker 的两个开关写成 true（验「配置里 true 也不算授权」），tty 的代理命令开关
   * 写成 false（验「授权后能把开关打开」那一步）。
   */
  let entry = ''
  let seededMutations = false
  // 已经在 patch 里播过本机目标就不再插一遍（bootstrap 造的模板 profile 里本来就有一条）
  let seededTarget = text.includes(`name: ${LIVE_TARGET}`)
  const seeded = text.split('\n').flatMap((line) => {
    const idMatch = /^-\s+id:\s*(\S+)\s*$/.exec(line)
    if (idMatch !== null) {
      entry = idMatch[1]
      return line
    }
    if (entry === 'docker' && /^(\s*)(allowMutations|allowExec):\s*(true|false)\s*$/.test(line)) {
      seededMutations = true
      return [line.replace(/:\s*(true|false)\s*$/, ': true')]
    }
    if (entry === 'docker') {
      // `targets:` 之后插一条本地目标（`targets: []` 也一并处理）——验收只碰本机
      const inlineEmpty = /^(\s*)targets:\s*\[\s*\]\s*$/.exec(line)
      if (inlineEmpty !== null) {
        seededTarget = true
        return [`${inlineEmpty[1]}targets:`, `${inlineEmpty[1]}  - name: ${LIVE_TARGET}`, `${inlineEmpty[1]}    kind: local`]
      }
      const block = /^(\s*)targets:\s*$/.exec(line)
      if (block !== null) {
        seededTarget = true
        return [line, `${block[1]}  - name: ${LIVE_TARGET}`, `${block[1]}    kind: local`]
      }
    }
    if (entry === 'tty' && /^(\s*)allowProxyCommand:\s*(true|false)\s*$/.test(line)) {
      return [line.replace(/:\s*(true|false)\s*$/, ': false')]
    }
    return [line]
  }).join('\n')
  if (!seededMutations) {
    console.log('  ⚠ 没在 docker entry 里找到 allowMutations/allowExec——「配置里写着 true」这条断言会失去意义')
  }
  if (!seededTarget) {
    console.log(`  ⚠ 没能在 docker entry 里播入本地目标 ${LIVE_TARGET}——/action 的门控断言会落到「未知目标」上`)
  }
  fs.writeFileSync(patchPath, seeded)
}

/** 起一个宿主实例（独立端口、可选环境变量授权），返回句柄。 */
async function startHost({ profileName, grants }) {
  const port = await freePort()
  const base = `http://127.0.0.1:${String(port)}`
  let output = ''
  const child = spawn(dshBin, ['--profile', profileName, '--no-open', '--port', String(port)], {
    cwd: repoRoot,
    env: { ...process.env, ...grants },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.on('data', (chunk) => { output += chunk.toString('utf8') })
  child.stderr.on('data', (chunk) => { output += chunk.toString('utf8') })
  const handle = { child, port, base, log: () => output, cookie: '' }

  // 就绪：日志里出现带 token 的 URL（DSH 的浏览器信任需要它换 cookie）
  const tokenUrl = await waitFor(() => {
    const m = /http:\/\/127\.0\.0\.1:\d+\/\?token=([A-Za-z0-9_-]+)/.exec(handle.log())
    return m === null ? null : { url: m[0], token: m[1] }
  }, 30_000, '宿主未在 30s 内打印带 token 的 URL（启动失败？日志见下）')
  // 换 cookie：DSH 把「浏览器信任」绑在一次带 token 的访问上
  const authRes = await fetch(tokenUrl.url, { redirect: 'manual' })
  const setCookie = authRes.headers.getSetCookie?.() ?? []
  handle.cookie = setCookie.map((line) => line.split(';')[0]).join('; ')
  await waitFor(async () => {
    const res = await request(handle, '/', { raw: true })
    return res.status === 200 ? true : null
  }, 20_000, '宿主已起但页面不返回 200（启动未完成？）')
  return handle
}

async function waitFor(probe, timeoutMs, errorMessage) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const value = await probe()
    if (value) return value
    if (Date.now() > deadline) throw new Error(errorMessage)
    await new Promise((resolve) => setTimeout(resolve, 150))
  }
}

/** 打宿主的一次请求（自动带上 cookie 与同源证明头）。 */
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
  })
  if (options.raw === true) return res
  const text = await res.text()
  let json
  try {
    json = JSON.parse(text)
  } catch {
    json = undefined
  }
  return { status: res.status, text, json }
}

function stopHost(host) {
  try {
    host.child.kill('SIGTERM')
  } catch {
    /* 已退出 */
  }
}

/* ------------------------------- 主流程 ------------------------------- */

/**
 * 本次运行**自己建的** profile 目录（模板 profile + 两份拷贝）——删除只走这个列表，
 * 绝不按前缀扫 `profiles/`（那会把别人的 `live-smoke-*` 一起删掉）。
 */
const profileDirs = []
const hosts = []

const dshBin = findDsh()
if (dshBin === null) {
  console.log('[live-host-smoke] SKIP：本机 PATH 上没有 dsh（本脚本验的是真宿主，只在装了 DSH 的机器上有意义）。')
  console.log('                  装了之后重跑；想让它在这种情况下也失败，加 --strict。')
  process.exit(strict ? 1 : 0)
}

let source = pickSourceProfile()
if (source === null && bootstrap && value('--from') === undefined) {
  /*
   * `--bootstrap`：干净机器（CI 腿 / VM / 新克隆）上唯一缺的就是「link 到本仓」的 profile。
   * 现场造一个当模板——它和两份拷贝一样属于本次运行，跑完一起删。
   */
  console.log('[live-host-smoke] --bootstrap：本机没有「link 到本仓」的 profile，现场造一个模板 profile。')
  try {
    const made = bootstrapLinkProfile({
      dsh: dshBin,
      profilesDir,
      repoRoot,
      target: LIVE_TARGET,
      log: (line) => console.log(`[live-host-smoke] ${line}`),
    })
    profileDirs.push(made.dir)
    source = { name: made.name, repoLinked: made.mounted.map((pkg) => `@hyzyn/dsh-${pkg}`) }
  } catch (error) {
    console.log(`[live-host-smoke] FAIL：--bootstrap 失败 —— ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }
}
if (source === null) {
  const asked = value('--from')
  /*
   * 显式 `--from <name>` 却不合格 → **失败**（不是跳过）：用户明确点名了一个 profile，
   * 这时「静默跳过」会让人以为验过了。默认扫描（没点名）才只 SKIP。
   */
  if (asked !== undefined) {
    console.log(`[live-host-smoke] FAIL：--from ${asked} 不是「link 到本仓」的 profile。`)
    console.log(`                  它的 package.json 里需要至少一个 @hyzyn/* 依赖写成 link:${path.join(repoRoot, 'packages')}/<pkg>`)
    console.log('                  否则验的是 npm 上的旧版本，结论会假绿。')
    process.exit(1)
  }
  console.log('[live-host-smoke] SKIP：没找到「link 到本仓」的 profile（本仓 packages/ 至少一个 @hyzyn/* 用 link: 指过来）。')
  console.log(`                  看过的目录：${profilesDir}`)
  console.log('                  建一个：dsh plugin --profile <name> add link:' + path.join(repoRoot, 'packages/tty'))
  console.log('                  或者加 --bootstrap 让本脚本自己造一个（干净 CI 腿 / VM 上就是这么跑的）。')
  process.exit(strict ? 1 : 0)
}

const profileName = `live-smoke-${String(process.pid)}`
/**
 * **每个实例一份 profile 拷贝**。
 *
 * 为什么不能共用一份：验收里 A 那一半会 `POST {allowMutations:false}`（降权）与
 * `{allowProxyCommand:true}`——这些是**真写盘**的，共用 profile 时 B 启动读到的就是 A 改过的值，
 * B 的断言会莫名其妙地失败（第一次跑就撞上：B 的启动注册里没有 `docker_action`）。
 */
const grants = {
  DSH_DOCKER_ALLOW_MUTATIONS: '1',
  DSH_DOCKER_ALLOW_EXEC: '1',
  DSH_TTY_ALLOW_PROXY_COMMAND: '1',
}

console.log(`[live-host-smoke] dsh=${dshBin}`)
console.log(`[live-host-smoke] 模板 profile=${source.name}（link 到本仓：${source.repoLinked.join(', ')}）`)
console.log(`[live-host-smoke] 一次性 profile=${profileName}（跑完删除；${keep ? '--keep 已指定，保留' : '不碰你的 profile'}）`)

/** 建一份一次性 profile 拷贝（各自独立，跑完统一删）。 */
async function makeProfile(suffix) {
  const name = `${profileName}-${suffix}`
  const dir = copyProfile(source.name, name)
  profileDirs.push(dir)
  seedProfile(dir, await freePort())
  return name
}
try {
  // ---- 实例 A：无授权（配置里却写着 true） ----
  const nameA = await makeProfile('a')
  const hostA = await startHost({ profileName: nameA, grants: {} })
  hosts.push(hostA)
  console.log(`\n[A] 无授权实例 ${hostA.base}\n`)
  await assertUngranted(hostA)

  // ---- 实例 B：带宿主侧授权 ----
  const nameB = await makeProfile('b')
  const hostB = await startHost({ profileName: nameB, grants })
  hosts.push(hostB)
  console.log(`\n[B] 带授权实例 ${hostB.base}\n`)
  await assertGranted(hostB)
} catch (error) {
  fail('脚本自身执行', error instanceof Error ? error.message : String(error))
  for (const host of hosts) console.log(`\n---- ${host.base} 启动日志尾部 ----\n` + host.log().split('\n').slice(-25).join('\n'))
} finally {
  for (const host of hosts) stopHost(host)
  await new Promise((resolve) => setTimeout(resolve, 800))
  for (const host of hosts) {
    try {
      host.child.kill('SIGKILL')
    } catch {
      /* 已退出 */
    }
  }
  for (const dir of profileDirs) {
    if (keep) {
      console.log(`\n[live-host-smoke] --keep：保留 ${dir}`)
      continue
    }
    fs.rmSync(dir, { recursive: true, force: true })
    console.log(`\n[live-host-smoke] 已删除一次性 profile：${path.basename(dir)}`)
  }
}

const failed = results.filter(([kind]) => kind === 'FAIL').length
console.log(failed === 0
  ? `\nlive-host-smoke: 全部 PASS（${String(results.length)} 条断言）——这是本地门槛，不进 CI（CI 里没有 DSH）`
  : `\nlive-host-smoke: ${String(failed)} 个 FAIL（共 ${String(results.length)} 条断言）`)
process.exit(failed === 0 ? 0 : 1)

/* ------------------------------ 断言实现 ------------------------------ */

/** A：无授权。配置里写着 true，但一切都必须打不开、且文案要说清怎么授权。 */
async function assertUngranted(host) {
  const docker = await request(host, '/api/dsh-docker/config')
  const dc = docker.json?.config ?? {}
  check('A1 配置里 true 但无授权 → 有效值仍 false 且 *Granted=false',
    dc.allowMutations === false && dc.allowMutationsGranted === false
      && dc.allowExec === false && dc.allowExecGranted === false,
    JSON.stringify({ allowMutations: dc.allowMutations, allowMutationsGranted: dc.allowMutationsGranted, allowExec: dc.allowExec, allowExecGranted: dc.allowExecGranted }))

  check('A1b 播种的本地目标出现在快照里（否则后面的门控断言会落到「未知目标」上）',
    Array.isArray(dc.targets) && dc.targets.some((t) => t.name === LIVE_TARGET && t.kind === 'local'),
    JSON.stringify(dc.targets?.map((t) => `${t.name}:${t.kind}`) ?? null))

  const postMutations = await request(host, '/api/dsh-docker/config', { method: 'POST', body: { allowMutations: true } })
  check('A2 无授权时 HTTP 提权 allowMutations → 400 且点名环境变量与「重启宿主」',
    postMutations.status === 400
      && String(postMutations.json?.error).includes('DSH_DOCKER_ALLOW_MUTATIONS')
      && String(postMutations.json?.error).includes('重启宿主'),
    `${String(postMutations.status)} ${String(postMutations.json?.error).slice(0, 120)}`)

  const postExec = await request(host, '/api/dsh-docker/config', { method: 'POST', body: { allowExec: true } })
  check('A3 无授权时 HTTP 提权 allowExec → 400 且点名 DSH_DOCKER_ALLOW_EXEC',
    postExec.status === 400 && String(postExec.json?.error).includes('DSH_DOCKER_ALLOW_EXEC'),
    `${String(postExec.status)} ${String(postExec.json?.error).slice(0, 120)}`)

  const lower = await request(host, '/api/dsh-docker/config', { method: 'POST', body: { allowMutations: false } })
  check('A4 降权不需要授权 → 200', lower.status === 200, `${String(lower.status)} ${String(lower.json?.error ?? '')}`)

  const tools = await waitForTools(host, (list) => list.length > 0)
  check('A5 无授权时 docker 只注册只读工具（没有 docker_action / docker_exec）',
    tools.length > 0 && !tools.includes('docker_action') && !tools.includes('docker_exec'),
    tools.join(', '))

  /*
   * A5b/A5c：**行为**断言（不依赖日志）。日志只能说明「注册了什么」，而这里要证明的是
   * 「即使有人绕开工具直接打路由，门也拦得住」。容器名用不存在的，动作本身无害。
   */
  const action = await request(host, '/api/dsh-docker/action', {
    method: 'POST',
    body: { target: LIVE_TARGET, action: 'start', id: 'dsh-live-smoke-nonexistent' },
  })
  check('A5b 无授权时直接打 /action → 403 且点名环境变量',
    action.status === 403 && String(action.json?.error).includes('DSH_DOCKER_ALLOW_MUTATIONS'),
    `${String(action.status)} ${String(action.json?.error).slice(0, 120)}`)

  const exec = await request(host, '/api/dsh-docker/exec', {
    method: 'POST',
    body: { target: LIVE_TARGET, id: 'dsh-live-smoke-nonexistent', command: 'true' },
  })
  check('A5c 无授权时直接打 /exec → 403 且点名 DSH_DOCKER_ALLOW_EXEC',
    exec.status === 403 && String(exec.json?.error).includes('DSH_DOCKER_ALLOW_EXEC'),
    `${String(exec.status)} ${String(exec.json?.error).slice(0, 120)}`)

  const tty = await request(host, '/api/dsh-tty/config')
  const tc = tty.json?.config ?? {}
  const postProxy = await request(host, '/api/dsh-tty/config', { method: 'POST', body: { allowProxyCommand: true } })
  check('A6 tty：无授权时 HTTP 提权 allowProxyCommand → 400 且点名 DSH_TTY_ALLOW_PROXY_COMMAND',
    tc.allowProxyCommandGranted === false && postProxy.status === 400
      && String(postProxy.json?.error).includes('DSH_TTY_ALLOW_PROXY_COMMAND'),
    `${String(postProxy.status)} ${String(postProxy.json?.error).slice(0, 120)}`)

  const probe = await request(host, '/api/dsh-tty/probe', {
    method: 'POST',
    body: {
      host: '203.0.113.7',
      username: 'u',
      proxyCommand: '"' + process.execPath + '" "' + bridgePath + '" %h %p',
    },
  })
  const pr = probe.json?.result ?? {}
  check('A7 试连带代理命令 → 阶段 0 返回「未获宿主授权」（且 tcp 预检没跑）',
    pr.proxy?.active === false && String(pr.proxy?.error).includes('未获宿主授权')
      && String(pr.auth?.error).includes('未获宿主授权'),
    JSON.stringify(pr.proxy ?? null))
}

/** B：带宿主侧授权。开关能开、工具会注册、真跑起来的命令失败时文案要带 stderr。 */
async function assertGranted(host) {
  const docker = await request(host, '/api/dsh-docker/config')
  const dc = docker.json?.config ?? {}
  /*
   * 顺带证明「播种生效」：两个开关在**授权后都按配置的 true 生效**，这就反证了 A1 的前提——
   * 那份配置里确实写着 true（否则 A1 的「配置里 true 却打不开」是个空断言）。
   */
  check('B1 授权后 *Granted=true，且配置里的 allowMutations/allowExec:true 都按原样生效',
    dc.allowMutationsGranted === true && dc.allowExecGranted === true
      && dc.allowMutations === true && dc.allowExec === true,
    JSON.stringify({ allowMutations: dc.allowMutations, allowMutationsGranted: dc.allowMutationsGranted, allowExec: dc.allowExec, allowExecGranted: dc.allowExecGranted }))

  const postMutations = await request(host, '/api/dsh-docker/config', { method: 'POST', body: { allowMutations: true } })
  check('B2 授权后 HTTP 打开 allowMutations → 200 且有效值 true',
    postMutations.status === 200 && postMutations.json?.config?.allowMutations === true,
    `${String(postMutations.status)} ${JSON.stringify(postMutations.json?.config?.allowMutations)}`)

  /*
   * B3：**启动注册**里就该有变更工具（配置写着 true + 宿主授权 → 有效值 true）。
   * 用日志而不是路由来断言「注册了哪些工具」是刻意的：工具清单就是 agent 看到的东西，
   * 它由启动注册决定；而**热重注册**那条路径不打日志，拿它做断言会变成看运气。
   */
  const tools = await waitForTools(host, (list) => list.length > 0)
  check('B3 授权后 docker 注册变更工具（docker_action / docker_exec / 镜像三件套都在）',
    tools.includes('docker_action') && tools.includes('docker_exec') && tools.includes('docker_image_pull'),
    tools.join(', '))

  // B3b：行为断言——同一个不存在的容器，这次不该再被门拦下（403），而应落到 docker 自身的错误上
  const action = await request(host, '/api/dsh-docker/action', {
    method: 'POST',
    body: { target: LIVE_TARGET, action: 'start', id: 'dsh-live-smoke-nonexistent' },
  })
  check('B3b 授权后 /action 过了门控（不再 403 缺口令文案）',
    action.status !== 403,
    `${String(action.status)} ${String(action.json?.error ?? '').slice(0, 120)}`)

  const postProxy = await request(host, '/api/dsh-tty/config', { method: 'POST', body: { allowProxyCommand: true } })
  check('B4 授权后 HTTP 打开 allowProxyCommand → 200',
    postProxy.status === 200 && postProxy.json?.config?.allowProxyCommand === true,
    `${String(postProxy.status)} ${String(postProxy.json?.error ?? '')}`)

  /*
   * B5：真跑一条**必然失败**的代理命令（桥指向没人监听的端口）。
   * 这一条是 tty D66 的回归：真机上 ssh2 会连报两条错，若不守住「第一次结算即定稿」，
   * 用户看到的会是「连接已关闭（服务端主动断开）」——而真相（ECONNREFUSED）就在子进程 stderr 里。
   */
  const probe = await request(host, '/api/dsh-tty/probe', {
    method: 'POST',
    body: {
      host: '127.0.0.1',
      port: 9,
      username: 'u',
      auth: 'password',
      password: 'x',
      proxyCommand: '"' + process.execPath + '" "' + bridgePath + '" %h %p',
    },
  })
  const pr = probe.json?.result ?? {}
  const authError = String(pr.auth?.error ?? '')
  check('B5 真跑失败的代理命令 → 文案带子进程 stderr（tty D66 回归）',
    pr.proxy?.active === true && pr.tcp?.skipped === true && authError.includes('ECONNREFUSED'),
    authError.slice(0, 160))

  // B6：浏览器真正加载的那份 client.js（不是本仓产物，是宿主正在服务的字节）
  const bundle = await fetchClientBundle(host)
  check('B6 宿主服务的 client.js 含新键（授权状态 / 未授权提示）',
    bundle.includes('allowProxyCommandGranted')
      && bundle.includes('hint.proxyCommandNotGranted')
      && bundle.includes('allowMutationsGranted'),
    bundle === null ? '没能取到 bundle' : 'bundle=' + String(bundle.length) + 'B')
}

/**
 * 等「docker 的工具注册清单」满足条件，返回最后一次读到的清单。
 *
 * 两处必须等：① 启动早期注册日志还没打印；② **重注册**的日志行与触发它的 HTTP 响应走不同
 * 通道（响应先到是常态）。等不到时把最后读到的清单交回去——由调用方断言并给出可读的详情，
 * 而不是在这里抛错。
 */
async function waitForTools(host, predicate, timeoutMs = 4000) {
  const deadline = Date.now() + timeoutMs
  let last = registeredDockerTools(host)
  for (;;) {
    last = registeredDockerTools(host)
    if (predicate(last)) return last
    if (Date.now() > deadline) return last
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
}

/**
 * 从启动日志里读 agent 工具注册清单（docker 那一条）——**取最后一条**。
 *
 * 为什么不能取第一条：docker 会注册两次（settings 还没解析时先按默认值注册一次只读工具，
 * settings 就绪 / 配置变更后再按有效值注册一次）。取第一条的话，「授权后变更工具会注册」
 * 会被那条**默认值**的注册判成失败——第一次跑这个脚本就踩了（B3）。
 */
function registeredDockerTools(host) {
  const matches = [...host.log().matchAll(/\[dsh-docker\] agent tools registered \(([^)]*)\)/g)]
  const last = matches.at(-1)
  return last === undefined ? [] : last[1].split(',').map((s) => s.trim()).filter((s) => s !== '')
}

/** 取宿主**正在服务**的 tty client.js 字节（验证客户端半体真被送达浏览器）。 */
async function fetchClientBundle(host) {
  const page = await request(host, '/', { raw: true })
  const html = await page.text()
  const href = /href="(plugins\/\?\?[^"]*dsh-tty\/client\.js[^"]*)"/.exec(html)
  if (href === null) return ''
  const url = href[1].replaceAll('&amp;', '&')
  const res = await fetch(`${host.base}/${url}`, { headers: { cookie: host.cookie, 'sec-fetch-site': 'same-origin', origin: host.base } })
  return res.ok ? await res.text() : ''
}
