#!/usr/bin/env node
/**
 * `@hyzyn/dsh-devdata` — **配置卡片的真机验收**：起一个真宿主 + 真 Chrome，把「卡片到底能不能用」
 * 跑成可重复的一条命令。
 *
 * ## 为什么必须有它（照 `scripts/verify-devfront-card.mjs` 的三条由来）
 *
 * 卡片的宿主侧数据面有纯函数与假宿主用例、客户端半体过了 `check-i18n` 与 `client-lint`——
 * 而 `devfront` 的三轮真机验收**每一轮都抓到「本地全绿、真机必坏」**：
 *
 *   1. `package.json` 缺 `exports["./client"]` → 宿主不知道这个包有客户端半体 → **bundle 404、
 *      卡片永远不渲染**；
 *   2. 卡片保存一个标量把 `targets` 整批抹掉（保存路径的兜底源初值错了）；
 *   3. 点「查看」进的**详情页**要求注册 `plugins.bundle.config`（只注册行槽时卡片是空的）。
 *
 * 本包还多一条**只有真机才验得到**的东西：真 settings 栈的 `update()` 是**深合并**
 * （`dsh-settings` 的 `mergeLayers`），假宿主的 `Object.assign` 是浅合并——所以「写
 * `plan.maxRows` 不会把 `plan.maxCost` 抹掉」这条在这里才第一次被真的验到。
 *
 * ## 隔离口径（照 `scripts/lib/live-harness.mjs` 的红线，一个字不改）
 *
 * - **独立 `DSH_HOME`**：被测宿主与本脚本的所有 `dsh` 调用都走 `harness.hostEnv()`；
 * - **自证真实配置未变**：收尾比对 `~/.dsh/cordis.patch.yml` 的字节，**结果是断言**（不是只声明）；
 * - **临时资源带前缀**：`dsh-devdata-card-`，收尾整体删除。
 *
 * ## 用法
 *
 * ```sh
 * node scripts/verify-devdata-card.mjs            # 起宿主 + 跑全部断言（约 30~60 秒）
 * node scripts/verify-devdata-card.mjs --dump     # 只把插件页 / 卡片的结构打出来（迭代 DOM 断言时用）
 * node scripts/verify-devdata-card.mjs --keep     # 失败时留着宿主与临时目录，便于人肉看
 * ```
 *
 * 需要：本机有 `dsh`、有 Chrome（`--chrome` 可指定路径）。**不进 CI**：它起真宿主、开真浏览器
 * （与 `verify-devfront-card.mjs` 同一档，见 docs/agent-real-test.md）。
 *
 * 能力档那几条断言**刻意把两个变量名显式置空**（`DSH_DEVDATA_WRITE=''`）：授权只认「启动时那个
 * 环境变量是不是 TRUTHY」，若开发者 shell 里恰好 export 过它，卡片会显示「已授权」而断言会红
 * ——那是环境的差别，不是代码的差别。显式置空让这条断言**每次都在同一个前提上跑**。
 */
import { spawn } from 'node:child_process'
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

const harness = createLiveHarness({ prefix: 'dsh-devdata-card-' })

const auditFile = path.join(harness.workDir, 'devdata-audit.jsonl')
let child
let chrome

try {
  const dsh = findDsh()
  console.log(`# dsh = ${dsh.label ?? dsh.binary}\n# 隔离 home = ${harness.isolatedHome}`)

  /*
   * ① 在隔离 home 里**新建**一次性 profile 并 link 本包装进去（理由与 devfront 那份一致：
   * 拷真实 profile 会把 pnpm 的符号链接一起拷进来，`link:` 会报「不同 pnpm 大版本装的」）。
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
      packages: ['devdata'],
      log: (message) => {
        console.log(`  · ${message}`)
      },
    })
  } finally {
    if (previousHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previousHome
  }
  PROFILE = bootstrapped.name
  record('① 隔离 home 里新建一次性 profile 并装上本包', bootstrapped.mounted.includes('devdata'), `profile=${PROFILE} mounted=${bootstrapped.mounted.join(',')}`)

  // ② 播一份 devdata 配置：两个目标（都带能力声明）+ 计划护栏 + 持久审计
  fs.appendFileSync(
    path.join(bootstrapped.dir, 'cordis.patch.yml'),
    [
      '',
      '# verify-devdata-card：本文件由脚本生成，profile 在隔离 home 里，收尾整体删除。',
      '- id: devdata',
      '  config:',
      '    enabled: true',
      '    announceToAgent: true',
      '    timeoutMs: 5000',
      '    plan: { maxRows: 100000, maxCost: 5 }',
      `    auditFile: ${auditFile}`,
      '    targets:',
      '      - id: redis-248',
      '        label: 验收目标一',
      '        engine: redis',
      '        env: test-shared',
      '        scopeDirs: [/Users/me/coding]',
      '        host: 127.0.0.1',
      '        port: 1',
      '        maxScanCount: 50',
      '        credentialRef: env:REDIS_PASS',
      '        writeCapability:',
      '          env: DSH_DEVDATA_WRITE',
      '          label: 受限写',
      '        dangerousReadCapability:',
      '          env: DSH_DEVDATA_DANGEROUS_READ',
      '          label: 危险读',
      '      - id: redis-two',
      '        label: 验收目标二',
      '        engine: redis',
      '        env: test-isolated',
      '        scopeDirs: [/Users/me/coding/other]',
      '        host: 127.0.0.1',
      '        port: 2',
      '',
    ].join('\n'),
  )

  // ③ 起真宿主
  const port = await freePort()
  const base = `http://127.0.0.1:${String(port)}`
  let output = ''
  child = spawn(dsh.binary, [...dsh.argv0, '--profile', PROFILE, '--no-open', '--port', String(port)], {
    cwd: repoRoot,
    env: harness.hostEnv({
      DSH_KIT_HOME: path.join(harness.workDir, 'kit-home'),
      // 显式的**未授权**前提（见文件头）：别让开发者 shell 里的 export 决定这条断言
      DSH_DEVDATA_WRITE: '',
      DSH_DEVDATA_DANGEROUS_READ: '',
    }),
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
    if (options.body !== undefined || options.rawBody !== undefined) headers['content-type'] = 'application/json'
    const res = await fetch(base + pathname, {
      method: options.method ?? 'GET',
      headers,
      ...(options.body === undefined && options.rawBody === undefined
        ? {}
        : { body: options.rawBody !== undefined ? options.rawBody : JSON.stringify(options.body) }),
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

  /* ---------------- 数据面：快照 ---------------- */

  const get1 = await call('/api/dsh-devdata/config')
  record(
    '③ GET /api/dsh-devdata/config → 200，快照含两个目标',
    get1.status === 200 && get1.json?.ok === true && get1.json?.config?.targets?.length === 2,
    `status=${String(get1.status)} targets=${String(get1.json?.config?.targets?.length)} persisted=${String(get1.json?.persisted)}`,
  )
  record(
    '④ 只读展示要的字段都在（引擎 / 环境档 / 作用域 / SCAN 上限 / 连接 / 凭据引用）',
    get1.json?.config?.targets?.[0]?.engine === 'redis'
      && get1.json?.config?.targets?.[0]?.env === 'test-shared'
      && get1.json?.config?.targets?.[0]?.scopeDirs?.[0] === '/Users/me/coding'
      && get1.json?.config?.targets?.[0]?.maxScanCount === 50
      && get1.json?.config?.targets?.[0]?.host === '127.0.0.1'
      && get1.json?.config?.targets?.[0]?.port === 1
      && get1.json?.config?.targets?.[0]?.credentialRef === 'env:REDIS_PASS',
    JSON.stringify(get1.json?.config?.targets?.[0] ?? {}),
  )
  record(
    '⑤ 枚举列表由宿主给（卡片的下拉框不自己抄一份字面量）',
    Array.isArray(get1.json?.config?.engines) && get1.json.config.engines.includes('redis') && get1.json.config.envs?.includes('test-shared'),
    `engines=${JSON.stringify(get1.json?.config?.engines)} envs=${JSON.stringify(get1.json?.config?.envs)}`,
  )
  record(
    '⑥ 能力档只读快照：变量名 + **当前未授权** + 怎么授权（两个变量名都显式置空过）',
    get1.json?.config?.targets?.[0]?.writeCapability?.env === 'DSH_DEVDATA_WRITE'
      && get1.json?.config?.targets?.[0]?.writeCapability?.granted === false
      && String(get1.json?.config?.targets?.[0]?.writeCapability?.howTo).includes('DSH_DEVDATA_WRITE')
      && get1.json?.config?.targets?.[1]?.writeCapability === undefined,
    JSON.stringify(get1.json?.config?.targets?.[0]?.writeCapability ?? {}),
  )

  /* ---------------- 数据面：写 ---------------- */

  const post1 = await call('/api/dsh-devdata/config', { method: 'POST', body: { timeoutMs: 1234 } })
  const get2 = await call('/api/dsh-devdata/config')
  record(
    '⑦ POST 一个标量 → 200 落盘（persisted:true），且**目标没被抹掉**',
    post1.status === 200 && post1.json?.persisted === true && get2.json?.config?.timeoutMs === 1234 && get2.json?.config?.targets?.length === 2,
    `persisted=${String(post1.json?.persisted)} timeoutMs=${String(get2.json?.config?.timeoutMs)} targets=${String(get2.json?.config?.targets?.length)}`,
  )
  const postPlan = await call('/api/dsh-devdata/config', { method: 'POST', body: { 'plan.maxRows': 7 } })
  const get3 = await call('/api/dsh-devdata/config')
  record(
    '⑧ 写 `plan.maxRows` → 真 settings 的**深合并**保住了 `plan.maxCost`（假宿主的浅合并验不到这条）',
    postPlan.status === 200 && get3.json?.config?.plan?.maxRows === 7 && get3.json?.config?.plan?.maxCost === 5,
    `plan=${JSON.stringify(get3.json?.config?.plan)}`,
  )
  const unknown = await call('/api/dsh-devdata/config', { method: 'POST', body: { nope: 1 } })
  record('⑨ POST 不认识的字段 → 400（不静默丢弃）', unknown.status === 400, `status=${String(unknown.status)}`)
  const nestedPlan = await call('/api/dsh-devdata/config', { method: 'POST', body: { plan: { maxRows: 1 } } })
  record(
    '⑩ POST 嵌套 `plan` 对象 → 400 且指到扁平键（两种写法都能落地，但 patch 里看不出改的是哪一个）',
    nestedPlan.status === 400 && String(nestedPlan.json?.error).includes('plan.maxRows'),
    `status=${String(nestedPlan.status)}`,
  )
  const badRange = await call('/api/dsh-devdata/config', { method: 'POST', body: { timeoutMs: 5 } })
  const afterBad = await call('/api/dsh-devdata/config')
  record(
    '⑪ 非法范围 → 400，且配置**一点没动**（先判后写）',
    badRange.status === 400 && afterBad.json?.config?.timeoutMs === 1234,
    `status=${String(badRange.status)} timeoutMs=${String(afterBad.json?.config?.timeoutMs)}`,
  )
  const wrongMethod = await call('/api/dsh-devdata/config', { method: 'DELETE' })
  record('⑫ 非 GET/POST → 405', wrongMethod.status === 405, `status=${String(wrongMethod.status)}`)
  const brokenJson = await call('/api/dsh-devdata/config', { method: 'POST', rawBody: '{not json' })
  record('⑬ JSON 坏了 → 400', brokenJson.status === 400, `status=${String(brokenJson.status)}`)

  /* ---------------- 能力只读那条不变量 ---------------- */

  const capTop = await call('/api/dsh-devdata/config', { method: 'POST', body: { writeCapability: { env: 'HOME' } } })
  const capNested = await call('/api/dsh-devdata/config', {
    method: 'POST',
    body: { confirmTargetEdit: true, targets: [{ id: 'x', engine: 'redis', dangerousReadCapability: { env: 'HOME' } }] },
  })
  record(
    '⑭ 能力字段经 HTTP 提交 → 400 + `CAPABILITY_READONLY`（顶层与 `targets[i]` 里各一条）',
    capTop.status === 400 && capTop.json?.code === 'CAPABILITY_READONLY'
      && capNested.status === 400 && capNested.json?.code === 'CAPABILITY_READONLY'
      && String(capTop.json?.error).includes('免重启提权'),
    `top=${String(capTop.status)}/${String(capTop.json?.code)} nested=${String(capNested.status)}/${String(capNested.json?.code)}`,
  )

  /* ---------------- 目标编辑器（逐次确认 + 能力声明跟回来） ---------------- */

  const needConfirm = await call('/api/dsh-devdata/config', {
    method: 'POST',
    body: { targets: [{ id: 'redis-three', engine: 'redis', scopeDirs: [] }] },
  })
  record(
    '⑮ 改目标不带 `confirmTargetEdit` → 400 且码是 CONFIRMATION_REQUIRED',
    needConfirm.status === 400 && needConfirm.json?.code === 'CONFIRMATION_REQUIRED',
    `status=${String(needConfirm.status)} code=${String(needConfirm.json?.code)}`,
  )

  const current = (afterBad.json?.config?.targets ?? []).map((target) => ({
    id: target.id,
    engine: target.engine,
    scopeDirs: target.scopeDirs ?? [],
    ...(target.label === undefined ? {} : { label: target.label }),
    ...(target.env === undefined ? {} : { env: target.env }),
    ...(target.host === undefined ? {} : { host: target.host }),
    ...(target.port === undefined ? {} : { port: target.port }),
    ...(target.maxScanCount === undefined ? {} : { maxScanCount: target.maxScanCount }),
    ...(target.credentialRef === undefined ? {} : { credentialRef: target.credentialRef }),
  }))
  const targetEdit = await call('/api/dsh-devdata/config', {
    method: 'POST',
    body: {
      confirmTargetEdit: true,
      targets: [...current, { id: 'redis-three', label: '验收目标三', engine: 'redis', scopeDirs: [] }],
    },
  })
  const get4 = await call('/api/dsh-devdata/config')
  const editedTargets = get4.json?.config?.targets ?? []
  record(
    '⑯ 带确认改目标 → 200，GET 里真的多出第三个目标（不是「放行但没做事」）',
    targetEdit.status === 200 && targetEdit.json?.persisted === true && editedTargets.length === 3,
    `status=${String(targetEdit.status)} targets=${String(editedTargets.length)}`,
  )
  record(
    '⑰ 改目标**没有把能力声明抹掉**（按 id 带回来；新行没有——静默安全降级那条）',
    editedTargets[0]?.writeCapability?.env === 'DSH_DEVDATA_WRITE'
      && editedTargets[0]?.dangerousReadCapability?.env === 'DSH_DEVDATA_DANGEROUS_READ'
      && editedTargets[2]?.writeCapability === undefined,
    JSON.stringify(editedTargets.map((target) => [target.id, target.writeCapability?.env ?? null])),
  )

  const auditText = fs.existsSync(auditFile) ? fs.readFileSync(auditFile, 'utf8') : ''
  record(
    '⑱ 被拒与成功**都进审计**（`config.scalars` / `config.targets` / `config.save` + 两个码）',
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
  const batchUrl = pluginUrls.find((url) => url.includes('@hyzyn/dsh-devdata/client.js')) ?? ''
  record('⑲ 客户端半体**真的**被加载（宿主按批量 URL 发；单包路径在 0.2 上不存在）', batchUrl !== '', batchUrl.slice(0, 120))
  if (batchUrl !== '') {
    const bundleText = await (await fetch(batchUrl)).text()
    record(
      '⑳ bundle 内容含 i18n 目录与卡片注册面',
      bundleText.includes('dsh-i18n') && bundleText.includes('settings.kit.item') && bundleText.includes('plugins.bundle.config'),
      `bytes=${String(bundleText.length)}`,
    )
  }

  const shotFile = path.join(os.tmpdir(), `devdata-card-${String(Date.now())}.png`)
  await chrome.screenshot(shotFile)

  /*
   * 卡片落在插件**详情页**（内联渲染，`[data-plugin-config="true"]`）——行的形状与 devfront
   * 验证脚本一致：`li[data-plugin-package="@hyzyn/dsh-devdata"]`，行里那个 `aria-label^="查看"`
   * 的按钮才是进详情页的入口。
   */
  const cardReport = await chrome.evaluate(`(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
    const side = document.querySelector('[data-pane="sidebar"], [class*="sidebarCol"]') || document.body
    const entry = [...side.querySelectorAll('button,[role="button"]')].find((el) => (el.innerText || '').includes('插件'))
    if (entry) entry.click()
    await sleep(2500)
    const row = document.querySelector('[data-plugin-package="@hyzyn/dsh-devdata"]')
    const status = row === null ? '' : String(row.getAttribute('data-plugin-status'))
    const open = row === null ? null : row.querySelector('button[aria-label^="查看"]')
    if (open !== null) open.click()
    await sleep(3000)
    const cards = [...document.querySelectorAll('[data-plugin-config="true"]')]
    const text = cards.map((el) => el.innerText || '').join(' || ')
    const values = cards.map((el) => [...el.querySelectorAll('input,select,textarea')].map((input) => input.value).join(' | ')).join(' || ')
    return {
      rowFound: row !== null,
      status,
      cardCount: cards.length,
      controls: cards.reduce((sum, el) => sum + el.querySelectorAll('input,select,textarea').length, 0),
      hasName: text.includes('开发数据面'),
      hasTargetOne: text.includes('redis-248'),
      hasTargetTwo: text.includes('redis-two'),
      hasCapEnv: text.includes('DSH_DEVDATA_WRITE'),
      hasCapReadonly: text.includes('免重启提权'),
      hasEnvValue: values.includes('test-shared'),
      hasScope: values.includes('/Users/me/coding'),
      textHead: text.slice(0, 400),
      valueHead: values.slice(0, 400),
    }
  })()`)

  if (dumpOnly) {
    console.log('# 插件页与卡片：', JSON.stringify(cardReport, null, 2))
  } else {
    record(
      '㉑ 插件页里有 devdata 那一行，且状态是 running',
      cardReport.rowFound === true && cardReport.status === 'running',
      JSON.stringify({ rowFound: cardReport.rowFound, status: cardReport.status }),
    )
    record(
      '㉒ 详情页里的卡片渲染出控件 + **目标编辑器** + **能力只读面板**（id / 环境档 / 作用域 / 只读说明都在）',
      cardReport.cardCount > 0
        && cardReport.controls >= 20
        && cardReport.hasName
        && cardReport.hasTargetOne
        && cardReport.hasTargetTwo
        && cardReport.hasCapEnv
        && cardReport.hasCapReadonly
        && cardReport.hasEnvValue
        && cardReport.hasScope,
      JSON.stringify(cardReport),
    )

    /*
     * ㉓ 真的按一下「保存」。
     *
     * 为什么必须点这一下：前面那些断言走的都是脚本自己拼的 JSON——**客户端拼的 payload 长什么样
     * 没有任何东西验过**（`client.js` 不在 vitest 层、`client-lint` 只查静态问题）。点一次才知道
     * 「卡片提交的形状」真的过得了服务端那套校验（400 会显示成「保存失败：…」，断言里带上它）。
     *
     * 这里只点标量那一次（表单里就是刚 GET 到的那份值）：它证明 payload 合法、fetch 路径通、
     * i18n 的 `msg.saved` 渲染得出来。**改目标那一次的浏览器交互没点**（要再点两个复选框，
     * 收益是同一段代码的第二次证明）——那是一处如实记下的缺口。
     */
    const saveReport = await chrome.evaluate(`(async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
      const card = document.querySelector('[data-plugin-config="true"]')
      if (card === null) return { clicked: false, note: '没有卡片' }
      const button = [...card.querySelectorAll('button')].find((el) => (el.innerText || '').trim() === '保存')
      if (button === undefined) return { clicked: false, note: '没有「保存」按钮' }
      button.click()
      for (let i = 0; i < 50; i += 1) {
        await sleep(200)
        const node = card.querySelector('.dd_msg')
        const text = node === null ? '' : (node.innerText || '').trim()
        if (text !== '' && !text.includes('保存中')) return { clicked: true, message: text }
      }
      return { clicked: true, message: '' }
    })()`)
    record(
      '㉓ 客户端**真的提交得动**：点卡片上的「保存」→ 服务端接受、卡片回「已保存」（客户端拼的 payload 过得了服务端校验）',
      saveReport.clicked === true && saveReport.message === '已保存',
      JSON.stringify(saveReport),
    )
  }
  console.log(`# 截图：${shotFile}`)
  /*
   * 第二张截图在**卡片打开之后**：第一张拍的是应用壳（可能还盖着宿主的引导弹窗），
   * 人肉复核时要看的是「详情页里那张卡长什么样」。
   */
  const cardShotFile = path.join(os.tmpdir(), `devdata-card-open-${String(Date.now())}.png`)
  await chrome.screenshot(cardShotFile)
  console.log(`# 截图（卡片已打开）：${cardShotFile}`)

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
  record('㉔ 真实 `~/.dsh/cordis.patch.yml` 逐字节未变（隔离自证）', realPatch.unchanged === true, `${realPatch.path}（${String(realPatch.bytes ?? 0)} 字节）`)
  if (keep && failedBeforeCleanup) {
    console.log(`# --keep：临时目录留在 ${harness.workDir}`)
  } else {
    harness.cleanup()
  }
}

const failed = results.filter((item) => !item.ok)
console.log(`\n# 汇总：${String(results.length - failed.length)} PASS / ${String(failed.length)} FAIL`)
process.exit(failed.length === 0 ? 0 : 1)
