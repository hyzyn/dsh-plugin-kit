#!/usr/bin/env node
/**
 * `@hyzyn/dsh-devenv` — **配置卡片的真机验收**：起一个真宿主 + 真 Chrome，把「卡片到底能不能用」
 * 跑成可重复的一条命令。
 *
 * ## 为什么必须有它（照 `verify-devfront-card.mjs` 的由来）
 *
 * 卡片的宿主侧数据面有纯函数用例、客户端半体过了 `check-i18n` 与 `client-lint`——**但 `devfront`
 * 两次真机验收各抓到一条「本地全绿、真机必坏」**：
 *
 *   1. `package.json` 缺 `exports["./client"]` → 宿主不知道这个包有客户端半体 → **bundle 404、
 *      卡片永远不渲染**；
 *   2. 卡片保存一个标量把 `targets` 整批抹掉（保存路径的兜底源初值错了）。
 *
 * 本包这次是**从零加客户端半体**，所以第 1 条正是最容易漏的（加 `client.js` 只是第一步：
 * `dsh.client` / `exports["./client"]` / `files` 三处都要齐）。两条都不是静态检查能发现的。
 *
 * ## 隔离口径（照 `scripts/lib/live-harness.mjs` 的红线，一个字不改）
 *
 * - **独立 `DSH_HOME`**：被测宿主与本脚本的所有 `dsh` 调用都走 `harness.hostEnv()`；
 * - **自证真实配置未变**：收尾比对 `~/.dsh/cordis.patch.yml` 的字节，**结果是断言**（不是只声明）；
 * - **临时资源带前缀**：`dsh-devenv-card-`，收尾整体删除。
 *
 * ## 用法
 *
 * ```sh
 * node scripts/verify-devenv-card.mjs            # 起宿主 + 跑全部断言（约 30~60 秒）
 * node scripts/verify-devenv-card.mjs --dump     # 只把插件页与卡片的结构打出来（迭代 DOM 断言时用）
 * node scripts/verify-devenv-card.mjs --keep     # 失败时留着宿主与临时目录，便于人肉看
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

const harness = createLiveHarness({ prefix: 'dsh-devenv-card-' })

const auditFile = path.join(harness.workDir, 'devenv-audit.jsonl')
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
      packages: ['devenv'],
      log: (message) => {
        console.log(`  · ${message}`)
      },
    })
  } finally {
    if (previousHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previousHome
  }
  PROFILE = bootstrapped.name
  record('① 隔离 home 里新建一次性 profile 并装上本包', bootstrapped.mounted.includes('devenv'), `profile=${PROFILE} mounted=${bootstrapped.mounted.join(',')}`)

  /*
   * ② 播一份 devenv 配置：两个目标（一个 ssh + 写闸门、一个 local）+ 六个标量里的三个 + 审计文件
   *    + 一份 TOFU 指纹记录。卡片要展示与保存的东西都在这里——**写闸门与指纹是只读档**，
   *    它们在不在 DOM 里，正是这次验收要看的。
   */
  fs.appendFileSync(
    path.join(bootstrapped.dir, 'cordis.patch.yml'),
    [
      '',
      '# verify-devenv-card：本文件由脚本生成，profile 在隔离 home 里，收尾整体删除。',
      '- id: devenv',
      '  config:',
      '    enabled: true',
      '    announceToAgent: true',
      '    probeTimeoutMs: 3000',
      '    waitTimeoutMs: 180000',
      '    pollIntervalMs: 3000',
      `    auditFile: ${auditFile}`,
      '    hostKeys:',
      '      - host: 10.0.0.9',
      '        port: 22',
      '        fingerprints:',
      '          - SHA256:cardOne',
      '          - SHA256:cardTwo',
      '    targets:',
      '      - id: nas-one',
      '        label: 验收目标一',
      '        kind: ssh',
      '        book: TEST',
      '        scopeDirs: [/Users/me/coding]',
      '        writeCapability:',
      '          env: DSH_DEVENV_WRITE',
      '          label: 变更操作（启停容器）',
      '      - id: here-two',
      '        label: 验收目标二',
      '        kind: local',
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

  const get1 = await call('/api/dsh-devenv/config')
  record(
    '③ GET /api/dsh-devenv/config → 200，快照含两个目标与三个标量',
    get1.status === 200
      && get1.json?.ok === true
      && get1.json?.config?.targets?.length === 2
      && get1.json?.config?.probeTimeoutMs === 3000
      && get1.json?.config?.waitTimeoutMs === 180000
      && get1.json?.config?.pollIntervalMs === 3000,
    `status=${String(get1.status)} targets=${String(get1.json?.config?.targets?.length)} persisted=${String(get1.json?.persisted)}`,
  )
  record(
    '④ 目标全量带出来（编辑器要回填 kind / book / scopeDirs）',
    get1.json?.config?.targets?.[0]?.kind === 'ssh'
      && get1.json?.config?.targets?.[0]?.book === 'TEST'
      && get1.json?.config?.targets?.[0]?.scopeDirs?.[0] === '/Users/me/coding'
      && get1.json?.config?.targets?.[1]?.kind === 'local',
    JSON.stringify(get1.json?.config?.targets ?? []),
  )
  record(
    '⑤ 写闸门只读档：声明的环境变量名 + 未授权（宿主没带 DSH_DEVENV_WRITE）+ 怎么授权；没声明的目标也在',
    get1.json?.config?.writeGates?.[0]?.declared === true
      && get1.json?.config?.writeGates?.[0]?.env === 'DSH_DEVENV_WRITE'
      && get1.json?.config?.writeGates?.[0]?.granted === false
      && String(get1.json?.config?.writeGates?.[0]?.howTo).includes('DSH_DEVENV_WRITE')
      && get1.json?.config?.writeGates?.[1]?.declared === false,
    JSON.stringify(get1.json?.config?.writeGates ?? []),
  )
  record(
    '⑥ TOFU 指纹只读档：只给 host / 端口 / 条数（不给指纹本身）',
    get1.json?.config?.hostKeys?.[0]?.host === '10.0.0.9'
      && get1.json?.config?.hostKeys?.[0]?.port === 22
      && get1.json?.config?.hostKeys?.[0]?.fingerprints === 2
      && Object.keys(get1.json?.config?.hostKeys?.[0] ?? {}).sort().join(',') === 'fingerprints,host,port',
    JSON.stringify(get1.json?.config?.hostKeys ?? []),
  )

  const post1 = await call('/api/dsh-devenv/config', { method: 'POST', body: { probeTimeoutMs: 1234 } })
  const get2 = await call('/api/dsh-devenv/config')
  record(
    '⑦ POST 一个标量 → 200 落盘（persisted:true），且**目标没被抹掉**',
    post1.status === 200 && post1.json?.persisted === true && get2.json?.config?.probeTimeoutMs === 1234 && get2.json?.config?.targets?.length === 2,
    `persisted=${String(post1.json?.persisted)} probeTimeoutMs=${String(get2.json?.config?.probeTimeoutMs)} targets=${String(get2.json?.config?.targets?.length)}`,
  )
  const unknown = await call('/api/dsh-devenv/config', { method: 'POST', body: { nope: 1 } })
  record('⑧ POST 不认识的字段 → 400（不静默丢弃）', unknown.status === 400, `status=${String(unknown.status)}`)
  const wrongMethod = await call('/api/dsh-devenv/config', { method: 'DELETE' })
  record('⑨ 非 GET/POST → 405', wrongMethod.status === 405, `status=${String(wrongMethod.status)}`)

  /* ---------------- 能力字段只读（提权面） ---------------- */

  const capAttempt = await call('/api/dsh-devenv/config', { method: 'POST', body: { writeCapability: { env: 'HOME', label: 'x' } } })
  record(
    '⑩ POST `writeCapability` → 400 且码是 CAPABILITY_READONLY（HTTP 不能凭空打开能力）',
    capAttempt.status === 400 && capAttempt.json?.code === 'CAPABILITY_READONLY' && String(capAttempt.json?.error).includes('免重启提权'),
    `status=${String(capAttempt.status)} code=${String(capAttempt.json?.code)}`,
  )
  const hostKeysAttempt = await call('/api/dsh-devenv/config', { method: 'POST', body: { hostKeys: [] } })
  record(
    '⑪ POST `hostKeys` → 400 且码是 READONLY_FIELD（指纹由 TOFU 自己维护）',
    hostKeysAttempt.status === 400 && hostKeysAttempt.json?.code === 'READONLY_FIELD',
    `status=${String(hostKeysAttempt.status)} code=${String(hostKeysAttempt.json?.code)}`,
  )

  /* ---------------- 目标编辑器（逐次确认 + 写闸门不许被抹掉） ---------------- */

  const needConfirm = await call('/api/dsh-devenv/config', {
    method: 'POST',
    body: { targets: [{ id: 'third-one', kind: 'local', scopeDirs: ['/Users/me/coding/third'] }] },
  })
  record(
    '⑫ 改目标不带 `confirmTargetEdit` → 400 且码是 CONFIRMATION_REQUIRED',
    needConfirm.status === 400 && needConfirm.json?.code === 'CONFIRMATION_REQUIRED',
    `status=${String(needConfirm.status)} code=${String(needConfirm.json?.code)}`,
  )

  const current = (get2.json?.config?.targets ?? []).map((target) => ({
    id: target.id,
    kind: target.kind,
    ...(target.label === undefined ? {} : { label: target.label }),
    ...(target.book === undefined || target.book === '' ? {} : { book: target.book }),
    scopeDirs: target.scopeDirs ?? [],
  }))
  const targetEdit = await call('/api/dsh-devenv/config', {
    method: 'POST',
    body: {
      confirmTargetEdit: true,
      targets: [...current, { id: 'third-one', kind: 'local', label: '验收目标三', scopeDirs: ['/Users/me/coding/third'] }],
    },
  })
  const get3 = await call('/api/dsh-devenv/config')
  record(
    '⑬ 带确认改目标 → 200，且 GET 里真的多出第三个目标（不是「放行但没做事」）',
    targetEdit.status === 200 && targetEdit.json?.persisted === true && get3.json?.config?.targets?.length === 3,
    `status=${String(targetEdit.status)} targets=${String(get3.json?.config?.targets?.length)}`,
  )
  record(
    '⑭ ★ 改目标**没抹掉**已声明的写闸门（nas-one 仍是 declared + DSH_DEVENV_WRITE）',
    get3.json?.config?.writeGates?.[0]?.targetId === 'nas-one'
      && get3.json?.config?.writeGates?.[0]?.declared === true
      && get3.json?.config?.writeGates?.[0]?.env === 'DSH_DEVENV_WRITE',
    JSON.stringify(get3.json?.config?.writeGates ?? []),
  )

  const auditText = fs.existsSync(auditFile) ? fs.readFileSync(auditFile, 'utf8') : ''
  record(
    '⑮ 变更**进了审计**：成功分 `config.scalars` / `config.targets`，被拒带码（`CONFIRMATION_REQUIRED` / `CAPABILITY_READONLY`）',
    auditText.includes('"action":"config.scalars"')
      && auditText.includes('"action":"config.targets"')
      && auditText.includes('"action":"config.save"')
      && auditText.includes('CONFIRMATION_REQUIRED')
      && auditText.includes('CAPABILITY_READONLY'),
    `auditFile=${auditFile}（${String(auditText.split('\n').filter((line) => line !== '').length)} 行）`,
  )

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
  const batchUrl = pluginUrls.find((url) => url.includes('@hyzyn/dsh-devenv/client.js')) ?? ''
  record('⑯ 客户端半体**真的**被加载（宿主按批量 URL 发；单包路径在 0.2 上不存在）', batchUrl !== '', batchUrl.slice(0, 120))
  if (batchUrl !== '') {
    const bundleText = await (await fetch(batchUrl)).text()
    record(
      '⑰ bundle 内容含 i18n 目录与**四个槽**的注册（漏一个就会有一处空白）',
      bundleText.includes('dsh-i18n')
        && bundleText.includes('settings.kit.item')
        && bundleText.includes('plugins.bundle.config')
        && bundleText.includes('plugins.row.config')
        && bundleText.includes('settings.plugin.item'),
      `bytes=${String(bundleText.length)}`,
    )
  }

  const shotFile = path.join(os.tmpdir(), `devenv-card-${String(Date.now())}.png`)
  await chrome.screenshot(shotFile)

  /*
   * 插件页的行是 `li[data-plugin-package="@hyzyn/dsh-devenv"]`；行里那个 `aria-label="查看 …"` 的按钮
   * 才是进详情页的入口，而配置卡片**内联在详情页里**（`[data-plugin-config="true"]`）。
   */
  const cardReport = await chrome.evaluate(`(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
    const side = document.querySelector('[data-pane="sidebar"], [class*="sidebarCol"]') || document.body
    const entry = [...side.querySelectorAll('button,[role="button"]')].find((el) => (el.innerText || '').includes('插件'))
    if (entry) entry.click()
    await sleep(2500)
    const row = document.querySelector('[data-plugin-package="@hyzyn/dsh-devenv"]')
    const status = row === null ? '' : String(row.getAttribute('data-plugin-status'))
    const open = row === null ? null : row.querySelector('button[aria-label^="查看"]')
    if (open !== null) open.click()
    await sleep(3000)
    const cards = [...document.querySelectorAll('[data-plugin-config="true"]')]
    const text = cards.map((el) => el.innerText || '').join(' || ')
    // 目标现在是**编辑器**：值在 input.value 里，不在 innerText 里 —— 两条都收
    const values = cards.map((el) => [...el.querySelectorAll('input')].map((input) => input.value).join(' | ')).join(' || ')
    return {
      rowFound: row !== null,
      status,
      cardCount: cards.length,
      inputs: cards.reduce((sum, el) => sum + el.querySelectorAll('input,select,textarea').length, 0),
      hasName: text.includes('环境编排'),
      hasTargetOne: values.includes('nas-one') || text.includes('nas-one'),
      hasTargetTwo: values.includes('here-two') || text.includes('here-two'),
      hasBook: values.includes('TEST'),
      hasWriteGateEnv: text.includes('DSH_DEVENV_WRITE'),
      hasNotGranted: text.includes('未授权'),
      hasHostKey: text.includes('10.0.0.9'),
      hasHostKeyCount: text.includes('指纹 2 条'),
      // 写闸门**不可编辑**：那个环境变量名不许出现在任何输入框的值里
      writeGateEditable: values.includes('DSH_DEVENV_WRITE'),
      textHead: text.slice(0, 500),
      valueHead: values.slice(0, 500),
    }
  })()`)

  /*
   * ㉓㉔㉕ **目标编辑器的客户端路径**（2026-10-04）。
   *
   * 记-19 的门槛只验了两样：数据面（脚本自己拼的 POST：⑦⑫⑬⑭）与渲染（⑲）。而
   * **在卡片上真的加一行、填 5 个控件、勾确认、点保存**这条路一次都没走过——它恰好是
   * devfront 那三条「本地全绿、真机必坏」的藏身处：客户端拼的 payload 长什么样，
   * `client-lint` 与 `check-i18n` 都看不见（一个只管语法与地址来源，一个只管键集）。
   *
   * 这一步也是「同一个动作有两条写入口」的证据：HTTP 那条（⑬⑭）与卡片这条写的都是同一份
   * 配置，而卡片提交的是**它那份完整清单**——所以这里只断言「我加的那个目标在位且字段没串位」，
   * 不断言别人后写的还在不在（那是「最后写入者获胜」的语义，不是缺陷）。
   *
   * 故意选 `kind: ssh` + `book`：那是宿主**最严**的一条判据（ssh 目标没给 book 会被整个丢掉，
   * 见 `plugin-config.ts` 的 `targets[i].book` 那条），所以一个「下拉框的变更没进 React state」
   * 的坏实现会在这里露出来——提交上去的 kind 停在 local，字段就串了。
   */
  const domEdit = await chrome.evaluate(`(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
    const card = [...document.querySelectorAll('[data-plugin-config="true"]')].find(
      (el) => [...el.querySelectorAll('button')].some((b) => (b.innerText || '').trim() === '+ 添加目标'),
    )
    if (card === undefined) return { ok: false, note: '没有带目标编辑器的卡片' }
    const add = [...card.querySelectorAll('button')].find((el) => (el.innerText || '').trim() === '+ 添加目标')
    /*
     * 目标编辑器是卡片里嵌套的那个 .dv_card：行与确认框都要**在编辑器里**找，否则会先命中
     * 写闸门 / 指纹那两张只读卡片里的 li.dv_item，或标量那一段的复选框。
     */
    const editor = add.closest('.dv_card')
    const rows = () => [...editor.querySelectorAll('li.dv_item')]
    const before = rows().length
    add.click()
    await sleep(300)
    const afterAdd = rows().length
    const row = rows()[afterAdd - 1]
    if (row === undefined) return { ok: false, note: '点了添加但没有新行', before, afterAdd }
    /*
     * React 受控输入：必须走**原生 setter + input 事件**。直接改 input.value 时 React 的 state
     * 不会变（它靠事件与自己的 value tracker），提交上去的还是空行——而这条在静态闸门里看不出来。
     * select 同理，只是事件名是 change（与 devdata 卡片那条、devfront 那条同一手法）。
     */
    const setValue = (element, value) => {
      if (element.tagName === 'SELECT') {
        Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set.call(element, value)
        element.dispatchEvent(new Event('change', { bubbles: true }))
        return
      }
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(element, value)
      element.dispatchEvent(new Event('input', { bubbles: true }))
    }
    const fields = [...row.querySelectorAll('.dv_input')]
    // 顺序就是渲染顺序：id / 文案 / kind（下拉）/ 连接簿条目 / 作用域（逗号分隔）
    const wanted = ['dv-dom', 'DOM 验收目标', 'ssh', 'TEST', '/Users/me/coding/dom, /Users/me/coding/dom2']
    wanted.forEach((value, index) => {
      if (fields[index] !== undefined) setValue(fields[index], value)
    })
    await sleep(300)
    // 有改动才会出现那个确认框（targetsDirty）
    const confirm = editor.querySelector('input[type="checkbox"]')
    if (confirm === null) return { ok: false, note: '填了值但确认框没出现', before, afterAdd }
    confirm.click()
    await sleep(200)
    const save = [...card.querySelectorAll('button')].find((el) => (el.innerText || '').trim() === '保存')
    if (save === undefined) return { ok: false, note: '没有「保存」按钮', before, afterAdd }
    save.click()
    for (let i = 0; i < 50; i += 1) {
      await sleep(200)
      const node = card.querySelector('.dv_msg')
      const text = node === null ? '' : (node.innerText || '').trim()
      if (text !== '' && !text.includes('保存中')) {
        return { ok: true, before, afterAdd, fieldCount: fields.length, tags: fields.map((f) => f.tagName), message: text, values: fields.map((f) => f.value) }
      }
    }
    return { ok: false, note: '点了保存但卡片没有回消息', before, afterAdd }
  })()`)

  if (dumpOnly) {
    console.log('# 插件页与卡片：', JSON.stringify(cardReport, null, 2))
    console.log('# 目标编辑器（DOM 路径）：', JSON.stringify(domEdit, null, 2))
  } else {
    // 卡片开着的时候再截一张：出问题时人第一眼看的是它（DOM 断言给的是判据，截图给的是现场）。
    const cardShotFile = path.join(os.tmpdir(), `devenv-card-detail-${String(Date.now())}.png`)
    await chrome.screenshot(cardShotFile)
    console.log(`# 卡片截图：${cardShotFile}`)
    record('⑱ 插件页里有 devenv 那一行，且状态是 running', cardReport.rowFound === true && cardReport.status === 'running', JSON.stringify({ rowFound: cardReport.rowFound, status: cardReport.status }))
    record(
      '⑲ 详情页里的卡片渲染出控件 + **目标编辑器**（两个已有目标都在，kind/book 也回填了）',
      cardReport.cardCount > 0 && cardReport.inputs >= 12 && cardReport.hasName && cardReport.hasTargetOne && cardReport.hasTargetTwo && cardReport.hasBook,
      JSON.stringify({ cardCount: cardReport.cardCount, inputs: cardReport.inputs, hasName: cardReport.hasName, hasTargetOne: cardReport.hasTargetOne, hasTargetTwo: cardReport.hasTargetTwo, hasBook: cardReport.hasBook }),
    )
    record(
      '⑳ 写闸门只读面板真的渲染出来（环境变量名 + 未授权），且**没有任何输入框能改它**',
      cardReport.hasWriteGateEnv === true && cardReport.hasNotGranted === true && cardReport.writeGateEditable === false,
      JSON.stringify({ hasWriteGateEnv: cardReport.hasWriteGateEnv, hasNotGranted: cardReport.hasNotGranted, writeGateEditable: cardReport.writeGateEditable }),
    )
    record(
      '㉑ TOFU 指纹只读列表渲染出 host 与指纹条数',
      cardReport.hasHostKey === true && cardReport.hasHostKeyCount === true,
      JSON.stringify({ hasHostKey: cardReport.hasHostKey, hasHostKeyCount: cardReport.hasHostKeyCount }),
    )
    record(
      '㉓ 卡片上**真的**加一行目标、填 5 个控件（含 kind 下拉）、勾确认、点保存 → 回「目标已保存（进审计）」',
      domEdit.ok === true && domEdit.afterAdd === domEdit.before + 1 && domEdit.message === '目标已保存（进审计）',
      JSON.stringify(domEdit),
    )
    const get4 = await call('/api/dsh-devenv/config')
    const targets4 = get4.json?.config?.targets ?? []
    const added = targets4.find((target) => target.id === 'dv-dom')
    record(
      '㉔ 客户端拼的目标 payload 过得了服务端**最严**那条判据（ssh 必须给 book）：GET 里有 dv-dom，kind / book / 文案 / 两个作用域都没串位',
      get4.status === 200
        && added !== undefined
        && added.kind === 'ssh'
        && added.book === 'TEST'
        && added.label === 'DOM 验收目标'
        && (added.scopeDirs ?? []).join(',') === '/Users/me/coding/dom,/Users/me/coding/dom2',
      JSON.stringify({ status: get4.status, ids: targets4.map((target) => target.id), added: added ?? null }),
    )
    record(
      '㉕ 卡片这条写入口**也没抹掉**写闸门（nas-one 仍是 declared + DSH_DEVENV_WRITE）',
      get4.json?.config?.writeGates?.[0]?.targetId === 'nas-one'
        && get4.json?.config?.writeGates?.[0]?.declared === true
        && get4.json?.config?.writeGates?.[0]?.env === 'DSH_DEVENV_WRITE',
      JSON.stringify(get4.json?.config?.writeGates ?? []),
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
  record('㉒ 真实 `~/.dsh/cordis.patch.yml` 逐字节未变（隔离自证）', realPatch.unchanged === true, `${realPatch.path}（${String(realPatch.bytes ?? 0)} 字节）`)
  if (keep && failedBeforeCleanup) {
    console.log(`# --keep：临时目录留在 ${harness.workDir}`)
  } else {
    harness.cleanup()
  }
}

const failed = results.filter((item) => !item.ok)
console.log(`\n# 汇总：${String(results.length - failed.length)} PASS / ${String(failed.length)} FAIL`)
process.exit(failed.length === 0 ? 0 : 1)
