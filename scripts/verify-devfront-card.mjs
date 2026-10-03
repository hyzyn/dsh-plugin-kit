#!/usr/bin/env node
/**
 * `@hyzyn/dsh-devfront` — **配置卡片的真机验收**：起一个真宿主 + 真 Chrome，把「卡片到底能不能用」
 * 跑成可重复的一条命令。
 *
 * ## 为什么必须有它（2026-10-03 的由来）
 *
 * 卡片的宿主侧数据面有纯函数用例、客户端半体过了 `check-i18n` 与 `client-lint`——**但两次真机
 * 验收各抓到一条「本地全绿、真机必坏」**：
 *
 *   1. `package.json` 缺 `exports["./client"]` → 宿主不知道这个包有客户端半体 → **bundle 404、
 *      卡片永远不渲染**（判据是控制实验：同一个宿主里同时装 `search` 与 `devfront`，前者在宿主的
 *      批量 URL 里、后者不在）；
 *   2. 卡片保存一个标量把 `targets` 整批抹掉（保存路径的兜底源初值错了）。
 *
 * 两条都不是静态检查能发现的。所以这里把「起真宿主 → 打数据面 → 看 bundle 有没有被加载 → 看卡片
 * 渲染成什么样」钉成一条可重复的命令。
 *
 * ## 隔离口径（照 `scripts/lib/live-harness.mjs` 的红线，一个字不改）
 *
 * - **独立 `DSH_HOME`**：被测宿主与本脚本的所有 `dsh` 调用都走 `harness.hostEnv()`；
 * - **自证真实配置未变**：收尾比对 `~/.dsh/cordis.patch.yml` 的字节，**结果是断言**（不是只声明）；
 * - **临时资源带前缀**：`dsh-devfront-card-`，收尾整体删除。
 *
 * ## 用法
 *
 * ```sh
 * node scripts/verify-devfront-card.mjs            # 起宿主 + 跑全部断言（约 30~60 秒）
 * node scripts/verify-devfront-card.mjs --dump     # 只把插件页的结构打出来（迭代 DOM 断言时用）
 * node scripts/verify-devfront-card.mjs --keep     # 失败时留着宿主与临时目录，便于人肉看
 * ```
 *
 * 需要：本机有 `dsh`、有 Chrome（`--chrome` 可指定路径）。**不进 CI**：它起真宿主、开真浏览器
 * （与 `verify-client-ui.mjs` 同一档，见 docs/agent-real-test.md）。
 */
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { Chrome } from '@hyzyn/dsh-kit'

import { createLiveHarness, verifyRealPatchUnchanged } from './lib/live-harness.mjs'
import { findDsh } from './dsh-exec.mjs'
import { bootstrapLinkProfile } from './live-profile.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const flag = (name) => {
  const index = argv.indexOf(name)
  return index === -1 ? undefined : argv[index + 1]
}
const dumpOnly = argv.includes('--dump')
const keep = argv.includes('--keep')
const chromePath = flag('--chrome') ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

const results = []
const record = (name, ok, detail) => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail === undefined ? '' : `\n      ${detail}`}`)
}

const freePort = () =>
  new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port
      server.close(() => {
        resolve(port)
      })
    })
  })

const waitFor = async (probe, timeoutMs, message) => {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const value = await probe()
    if (value) return value
    if (Date.now() > deadline) throw new Error(message)
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
}

/** 一次性 profile 名（`bootstrapLinkProfile` 按 PID 生成；宿主用它启动）。 */
let PROFILE = ''

const harness = createLiveHarness({ prefix: 'dsh-devfront-card-' })

const auditFile = path.join(harness.workDir, 'devfront-audit.jsonl')
let child
let chrome

try {
  const dsh = findDsh()
  console.log(`# dsh = ${dsh.label ?? dsh.binary}\n# 隔离 home = ${harness.isolatedHome}`)

  /*
   * ① 在隔离 home 里**新建**一次性 profile 并 link 本包装进去。
   *
   * 为什么不是「拷一份真实 profile」：拷来的 `node_modules` 是符号链接，pnpm 在它上面装 link 会报
   * 「node_modules was installed with a different major version of pnpm」。新建 profile 从 dsh 自带
   * 模板起，干净且仍然**只写隔离 home**（`bootstrapLinkProfile` 里 spawn 的 dsh 继承 `process.env`，
   * 所以下面先把 `DSH_HOME` 指过去）。
   */
  const previousHome = process.env.DSH_HOME
  process.env.DSH_HOME = harness.isolatedHome
  let bootstrapped
  try {
    bootstrapped = bootstrapLinkProfile({
      dsh,
      profilesDir: path.join(harness.isolatedHome, 'profiles'),
      repoRoot,
      target: 'local',
      packages: ['devfront'],
      log: (message) => {
        console.log(`  · ${message}`)
      },
    })
  } finally {
    if (previousHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previousHome
  }
  PROFILE = bootstrapped.name
  record('① 隔离 home 里新建一次性 profile 并装上本包', bootstrapped.mounted.includes('devfront'), `profile=${PROFILE} mounted=${bootstrapped.mounted.join(',')}`)

  // ② 播一份 devfront 配置：两个站点 + 审计文件（卡片要展示与保存的东西）
  fs.appendFileSync(
    path.join(bootstrapped.dir, 'cordis.patch.yml'),
    [
      '',
      '# verify-devfront-card：本文件由脚本生成，profile 在隔离 home 里，收尾整体删除。',
      '- id: devfront',
      '  config:',
      '    enabled: true',
      '    announceToAgent: true',
      '    settleMs: 800',
      `    auditFile: ${auditFile}`,
      '    targets:',
      '      - id: w-one',
      '        label: 验收站点一',
      '        url: https://one.example.com/app/',
      '        scopeDirs: [/Users/me/coding]',
      '        allowedOrigins: [https://sso.example.com]',
      '        viewport: 390x844',
      '        credentialRef: secret:one',
      '      - id: w-two',
      '        label: 验收站点二',
      '        url: https://two.example.com/',
      '        scopeDirs: [/Users/me/coding/other]',
      '',
    ].join('\n'),
  )

  // ③ 起真宿主
  const port = await freePort()
  const base = `http://127.0.0.1:${String(port)}`
  let output = ''
  child = spawn(dsh.binary, [...dsh.argv0, '--profile', PROFILE, '--no-open', '--port', String(port)], {
    cwd: repoRoot,
    env: harness.hostEnv({ DSH_KIT_HOME: path.join(harness.workDir, 'kit-home') }),
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.on('data', (chunk) => {
    output += chunk.toString('utf8')
  })
  child.stderr.on('data', (chunk) => {
    output += chunk.toString('utf8')
  })
  const tokenUrl = await waitFor(
    () => {
      const matched = /http:\/\/127\.0\.0\.1:\d+\/\?token=([A-Za-z0-9_-]+)/.exec(output)
      return matched === null ? null : { url: matched[0], token: matched[1] }
    },
    45_000,
    `宿主未在 45s 内打印 token URL。日志尾部：\n${output.slice(-1500)}`,
  )
  console.log(`# 宿主 ${base}（profile=${PROFILE}）`)
  const authRes = await fetch(tokenUrl.url, { redirect: 'manual' })
  const cookie = (authRes.headers.getSetCookie?.() ?? []).map((line) => line.split(';')[0]).join('; ')
  await waitFor(async () => ((await fetch(`${base}/`, { headers: { cookie } })).status === 200 ? true : null), 20_000, '宿主已起但 / 不是 200')

  const call = async (pathname, options = {}) => {
    const headers = { cookie, 'sec-fetch-site': 'same-origin', origin: base, ...(options.headers ?? {}) }
    if (options.body !== undefined) headers['content-type'] = 'application/json'
    const res = await fetch(base + pathname, {
      method: options.method ?? 'GET',
      headers,
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    })
    const text = await res.text()
    let json
    try {
      json = JSON.parse(text)
    } catch {
      json = undefined
    }
    return { status: res.status, json, text }
  }

  /* ---------------- 数据面 ---------------- */

  const get1 = await call('/api/dsh-devfront/config')
  record(
    '③ GET /api/dsh-devfront/config → 200，快照含两个站点',
    get1.status === 200 && get1.json?.ok === true && get1.json?.config?.targets?.length === 2,
    `status=${String(get1.status)} targets=${String(get1.json?.config?.targets?.length)} persisted=${String(get1.json?.persisted)}`,
  )
  record(
    '④ 只读展示要的字段都在（范围 / 允许源 / 视口 / 凭据引用）',
    get1.json?.config?.targets?.[0]?.scopeDirs?.[0] === '/Users/me/coding'
      && get1.json?.config?.targets?.[0]?.allowedOrigins?.[0] === 'https://sso.example.com'
      && get1.json?.config?.targets?.[0]?.viewport === '390x844'
      && get1.json?.config?.targets?.[0]?.credentialRef === 'secret:one',
    JSON.stringify(get1.json?.config?.targets?.[0] ?? {}),
  )

  const post1 = await call('/api/dsh-devfront/config', { method: 'POST', body: { settleMs: 1234 } })
  const get2 = await call('/api/dsh-devfront/config')
  record(
    '⑤ POST 一个标量 → 200 落盘（persisted:true），且**站点没被抹掉**',
    post1.status === 200 && post1.json?.persisted === true && get2.json?.config?.settleMs === 1234 && get2.json?.config?.targets?.length === 2,
    `persisted=${String(post1.json?.persisted)} settleMs=${String(get2.json?.config?.settleMs)} targets=${String(get2.json?.config?.targets?.length)}`,
  )
  const bad = await call('/api/dsh-devfront/config', { method: 'POST', body: { targets: [] } })
  record('⑥ POST targets → 400 且指到 profile 补丁层', bad.status === 400 && String(bad.json?.error ?? '').includes('cordis.patch.yml'), `status=${String(bad.status)}`)
  const unknown = await call('/api/dsh-devfront/config', { method: 'POST', body: { nope: 1 } })
  record('⑦ POST 不认识的字段 → 400（不静默丢弃）', unknown.status === 400, `status=${String(unknown.status)}`)
  const wrongMethod = await call('/api/dsh-devfront/config', { method: 'DELETE' })
  record('⑧ 非 GET/POST → 405', wrongMethod.status === 405, `status=${String(wrongMethod.status)}`)

  /* ---------------- 真 Chrome ---------------- */

  chrome = await Chrome.launch({ path: chromePath, port: 9400 + Math.floor(Math.random() * 400), extraArgs: ['--no-sandbox', '--disable-gpu'] })
  await chrome.attachToPage()
  await chrome.send('Page.enable')
  await chrome.send('Runtime.enable')
  await chrome.send('Page.navigate', { url: `${base}/?token=${encodeURIComponent(tokenUrl.token)}` })
  await waitFor(
    async () => {
      const state = await chrome.evaluate(
        '({ children: document.body ? document.body.children.length : 0, text: document.body ? document.body.innerText.length : 0 })',
      )
      return state.children > 0 && state.text > 80 ? state : null
    },
    45_000,
    '应用壳没起来',
  )

  const pluginUrls = await chrome.evaluate('performance.getEntriesByType("resource").map((e) => e.name).filter((n) => n.includes("/plugins/"))')
  const batchUrl = pluginUrls.find((url) => url.includes('@hyzyn/dsh-devfront/client.js')) ?? ''
  record('⑨ 客户端半体**真的**被加载（宿主按批量 URL 发；单包路径在 0.2 上不存在）', batchUrl !== '', batchUrl.slice(0, 120))
  if (batchUrl !== '') {
    const bundleText = await (await fetch(batchUrl)).text()
    record('⑩ bundle 内容含 i18n 目录与卡片注册面', bundleText.includes('dsh-i18n') && bundleText.includes('settings.kit.item'), `bytes=${String(bundleText.length)}`)
  }

  const shotFile = path.join(os.tmpdir(), `devfront-card-${String(Date.now())}.png`)
  await chrome.screenshot(shotFile)

  /*
   * 插件页的行是 `li[data-plugin-package="@hyzyn/dsh-devfront"]`（2026-10-03 用 `--dump` 探到的形状：
   * 这一版没有 `[data-plugin-row]`，行里那个 `aria-label="查看 …"` 的按钮才是进详情页的入口，
   * 而配置卡片**内联在详情页里** —— 与 `verify-client-ui.mjs` 记的「卡片认内联的
   * `[data-plugin-config="true"]`」一致）。
   */
  const cardReport = await chrome.evaluate(`(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
    const side = document.querySelector('[data-pane="sidebar"], [class*="sidebarCol"]') || document.body
    const entry = [...side.querySelectorAll('button,[role="button"]')].find((el) => (el.innerText || '').includes('插件'))
    if (entry) entry.click()
    await sleep(2500)
    const row = document.querySelector('[data-plugin-package="@hyzyn/dsh-devfront"]')
    const status = row === null ? '' : String(row.getAttribute('data-plugin-status'))
    const open = row === null ? null : row.querySelector('button[aria-label^="查看"]')
    if (open !== null) open.click()
    await sleep(3000)
    const cards = [...document.querySelectorAll('[data-plugin-config="true"]')]
    const text = cards.map((el) => el.innerText || '').join(' || ')
    return {
      rowFound: row !== null,
      status,
      cardCount: cards.length,
      inputs: cards.reduce((sum, el) => sum + el.querySelectorAll('input,select,textarea').length, 0),
      hasName: text.includes('前端效果验证'),
      hasSiteOne: text.includes('w-one'),
      hasSiteTwo: text.includes('w-two'),
      hasViewport: text.includes('390x844'),
      hasOrigin: text.includes('sso.example.com'),
      textHead: text.slice(0, 400),
    }
  })()`)

  if (dumpOnly) {
    console.log('# 插件页与卡片：', JSON.stringify(cardReport, null, 2))
  } else {
    record('⑪ 插件页里有 devfront 那一行，且状态是 running', cardReport.rowFound === true && cardReport.status === 'running', JSON.stringify({ rowFound: cardReport.rowFound, status: cardReport.status }))
    record(
      '⑫ 详情页里的配置卡片渲染出标量控件 + 两个站点的只读信息（含视口与允许源）',
      cardReport.cardCount > 0 && cardReport.inputs >= 5 && cardReport.hasName && cardReport.hasSiteOne && cardReport.hasSiteTwo && cardReport.hasViewport && cardReport.hasOrigin,
      JSON.stringify(cardReport),
    )
  }
  console.log(`# 截图：${shotFile}`)

} finally {
  const failedBeforeCleanup = results.some((item) => !item.ok)
  try {
    chrome?.close?.()
  } catch {}
  try {
    child?.kill('SIGTERM')
  } catch {}
  await new Promise((resolve) => setTimeout(resolve, 1200))
  try {
    child?.kill('SIGKILL')
  } catch {}
  // 红线②：真实配置未变**必须被断言**（不是只声明快照）
  const realPatch = verifyRealPatchUnchanged(harness.patch)
  record('⑬ 真实 `~/.dsh/cordis.patch.yml` 逐字节未变（隔离自证）', realPatch.unchanged === true, `${realPatch.path}（${String(realPatch.bytes ?? 0)} 字节）`)
  if (keep && failedBeforeCleanup) {
    console.log(`# --keep：临时目录留在 ${harness.workDir}`)
  } else {
    harness.cleanup()
  }
}

const failed = results.filter((item) => !item.ok)
console.log(`\n# 汇总：${String(results.length - failed.length)} PASS / ${String(failed.length)} FAIL`)
process.exit(failed.length === 0 ? 0 : 1)
