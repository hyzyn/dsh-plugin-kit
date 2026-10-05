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
 * ## 截图落点（2026-10-05 改）
 *
 * 每轮至少留四张图（桌面初始 / 窄屏初始 / 失败态 / 成功态），全部落在**仓内**
 * `.artifacts/devdata-card-<pid>-<时间戳>/`，由 `chrome.screenshot()`（真 CDP 的
 * `Page.captureScreenshot`）写出——**不是 mock**。收尾有一条断言复核四张图真的落盘（存在 + PNG
 * 魔数 + 非空）。`--keep` 只影响宿主与临时目录，**不影响截图**（截图本来就留在仓里）。
 *
 * ## 静态预检（`POST /api/dsh-devdata/preflight`，2026-10-05）
 *
 * 判据真源是 `packages/devdata/src/config-preflight.ts` 与它的用例；本脚本在**真宿主 + 真 HTTP**
 * 上再证一遍形状（成功 / 作用域外 / 浏览器自报事实被拒 / 不保存不写审计 / 只收 POST），并在真
 * Chrome 里真点「检查配置」与「读取目标」。**「读取目标」只认非负安全整数**：负数 / 小数（bulk
 * 串）/ 非数字 / 超大数四档各点一次，一律不许记 pass。
 *
 * 能力档那几条断言**刻意把两个变量名显式置空**（`DSH_DEVDATA_WRITE=''`）：授权只认「启动时那个
 * 环境变量是不是 TRUTHY」，若开发者 shell 里恰好 export 过它，卡片会显示「已授权」而断言会红
 * ——那是环境的差别，不是代码的差别。显式置空让这条断言**每次都在同一个前提上跑**。
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
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

/*
 * 截图落点：**仓内** `.artifacts/devdata-card-<唯一>/`（不再写系统临时目录）。
 *
 * 为什么改：真机截图是「这一版长什么样」的人肉复核凭据。落在系统临时目录里会被清理掉、也不跟
 * 本次改动放在一起；落在仓内则与代码同生共死。`<唯一>` = `pid-时间戳`——同一台机器上并行跑两次
 * 不会互相覆盖（与临时目录前缀 `dsh-devdata-card-` 是同一条纪律：**每个产物都要能说出是谁的**）。
 *
 * 这些图**不入库**：`.artifacts/` 是本地运行产物，不作为提交内容（`.gitignore` 的增删不在本脚本
 * 的改动范围内——脚本只负责把图落在那里，是否忽略由仓库决定）。
 */
const artifactDir = path.join(repoRoot, '.artifacts', `devdata-card-${String(process.pid)}-${String(Date.now())}`)
/**
 * 本次运行的一张截图路径（全部落在 `artifactDir` 里）。
 *
 * 目录**按需创建**（不在模块加载时就建）：脚本在「找不到 dsh」「宿主没起来」这些早期失败路径上
 * 根本走不到截图，先建一个空目录只会留下一个没人认领的壳。
 */
const shot = (name) => {
  fs.mkdirSync(artifactDir, { recursive: true })
  return path.join(artifactDir, `${name}.png`)
}

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
/** ㉙ 用的**极简假 Redis**：只回答 `PING` → `+PONG`。它的意义是让「面板真的连得到目标」有一次证据。 */
let fakeRedis

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

  /*
   * ②a **临时项目目录**（作用域内 / 作用域外两个基准）。
   *
   * 静态预检那条「作用域内通过、作用域外报 `OUT_OF_SCOPE`」需要一个**真实存在**、且落在某个目标
   * `scopeDirs` 里的目录。它建在 `harness.workDir` 里（隔离前缀 + 收尾整体删除，不往 /tmp 漏东西），
   * 并把它的绝对路径**追加**到目标 `redis-248` 的 `scopeDirs` 末尾——追加而不是替换，是因为既有
   * 断言钉的是 `scopeDirs[0] === '/Users/me/coding'`（④ / ㉒ / ㉛），换成下标 0 会把它们改弱。
   */
  const scopeProjectRoot = path.join(harness.workDir, 'scope-project')
  fs.mkdirSync(path.join(scopeProjectRoot, 'verify'), { recursive: true })
  fs.writeFileSync(
    path.join(scopeProjectRoot, 'verify', 'scope-proj.yaml'),
    ['version: 1', 'project: scope-proj', 'assertions:', '  - id: redis-alive', '    target: redis-248', '    statement: PING', '    expect: { eq: PONG }', '    severity: fail', ''].join('\n'),
  )
  /** 作用域外基准：同一个临时目录下、**不在**任何 `scopeDirs` 里的兄弟目录。 */
  const outOfScopeRoot = path.join(harness.workDir, 'outside-scope')
  fs.mkdirSync(outOfScopeRoot, { recursive: true })

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
      /*
       * 临时项目根的路径**加引号**：YAML 的流式序列里，含 `:` / 空格 / `#` 的裸标量会被解析成
       * 别的东西（macOS 的 `mkdtemp` 路径就带 `/var/folders/...`，一般没事，但引号是零成本的保险）。
       */
      `        scopeDirs: ["/Users/me/coding", ${JSON.stringify(scopeProjectRoot)}]`,
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
      '        dbs: [0, 3]',
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
    ...(Array.isArray(target.dbs) ? { dbs: target.dbs } : {}),
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

  /* ---------------- 静态预检的数据面（`POST /api/dsh-devdata/preflight`） ---------------- */

  /*
   * ㊴㊵㊶ **静态预检**（2026-10-05）：把「这个项目 + 这个目标能不能只读核验」在**连目标之前**问清楚。
   *
   * 判据以 `packages/devdata/src/config-preflight.ts` 与它的用例（`test/config-preflight.test.ts`）
   * 为准——那两份是这条路由的**契约真源**，本脚本只负责在**真宿主 + 真 HTTP** 上再证一遍。
   * 分成三块：
   *   ① **形状**：成功给 `context`（归一化后的 root / project、`mode:'readonly'`、三面**全 false**、
   *      `readOnly:true`）与 `target:{id,engine}`，`problems:[]`；
   *   ② **作用域外**：`root` 不在目标 `scopeDirs` 里时**不是 500、也不是「通过」**——是一份
   *      `ok:false` 的**逐字段问题**，带 `code`（`OUT_OF_SCOPE`）、`hint`（恢复路径）以及它判过的
   *      `root` / `scopeDirs`。**码是给机器看的稳定标识，正文是给人看的**，两个都要在。
   *   ③ **它什么都不做**：预检是静态的——不保存配置、不写审计、不发任何 Redis 命令。
   *      用「跑前跑后 `config` 与审计文件逐字节相同」钉住。
   *
   * 为什么这一条必须真机跑：`/preflight` 的**调用方是浏览器**（卡片上那两个按钮），而它在服务端
   * 要过的校验（目标存在吗、引擎有没有通路、root 在不在 scope 里）与 `/query` 那条执行链**不是
   * 同一段代码**——单测能钉住纯函数，钉不住「宿主真的注册了这条路由、真的按这个形状回」。
   */
  const preflightConfigBefore = await call('/api/dsh-devdata/config')
  const auditBeforePreflight = fs.existsSync(auditFile) ? fs.readFileSync(auditFile, 'utf8') : ''

  const preflightOk = await call('/api/dsh-devdata/preflight', {
    method: 'POST',
    body: { root: scopeProjectRoot, project: 'scope-proj', target: 'redis-248' },
  })
  record(
    '㊴ 静态预检（作用域内）：`POST /preflight` → 200 `ok:true`，context 归一化且 `mode:"readonly"` / `readOnly:true` / **三面全 false**，目标带 `{id,engine}`，`problems:[]`',
    preflightOk.status === 200
      && preflightOk.json?.ok === true
      && preflightOk.json?.context?.root === scopeProjectRoot
      && preflightOk.json?.context?.project === 'scope-proj'
      && preflightOk.json?.context?.mode === 'readonly'
      && preflightOk.json?.context?.readOnly === true
      && preflightOk.json?.context?.enabled?.environment === false
      && preflightOk.json?.context?.enabled?.data === false
      && preflightOk.json?.context?.enabled?.front === false
      && preflightOk.json?.target?.id === 'redis-248'
      && preflightOk.json?.target?.engine === 'redis'
      && Array.isArray(preflightOk.json?.problems)
      && preflightOk.json.problems.length === 0,
    JSON.stringify(preflightOk.json ?? { status: preflightOk.status, text: preflightOk.text.slice(0, 200) }),
  )

  const preflightOut = await call('/api/dsh-devdata/preflight', {
    method: 'POST',
    body: { root: outOfScopeRoot, project: 'scope-proj', target: 'redis-248' },
  })
  const outProblems = Array.isArray(preflightOut.json?.problems) ? preflightOut.json.problems : []
  const outProblem = outProblems.find((problem) => problem?.code === 'OUT_OF_SCOPE')
  record(
    '㊵ 静态预检（作用域外）：**不是通过、也不是 500**——`ok:false` 逐字段问题带 `OUT_OF_SCOPE` + 恢复路径 + 判过的 root / scopeDirs',
    preflightOut.status === 400
      && preflightOut.json?.ok === false
      && outProblem !== undefined
      && outProblem.field === 'scope'
      && typeof outProblem.message === 'string' && outProblem.message.trim() !== ''
      && typeof outProblem.hint === 'string' && outProblem.hint.trim() !== ''
      && outProblem.root === outOfScopeRoot
      && Array.isArray(outProblem.scopeDirs)
      && outProblem.scopeDirs.includes(scopeProjectRoot),
    JSON.stringify(preflightOut.json ?? { status: preflightOut.status, text: preflightOut.text.slice(0, 200) }),
  )

  /*
   * ㊵a **浏览器不许自报事实**：作用域 / 引擎 / 连接 / 权限快照一律是未知字段，一条都不采信。
   * 这一条是「预检不接受页内脚本自己宣布自己有权限」那句话的唯一机器判据——真机上多认一个字段
   * 就是多一条提权路，而静态单测只证纯函数、证不了宿主真的把请求原样交给了它。
   */
  const forged = await call('/api/dsh-devdata/preflight', {
    method: 'POST',
    body: { root: scopeProjectRoot, project: 'scope-proj', target: 'redis-248', scopeDirs: [scopeProjectRoot], enabled: { data: true }, mode: 'release' },
  })
  const forgedFields = (Array.isArray(forged.json?.problems) ? forged.json.problems : []).map((problem) => problem?.field)
  record(
    '㊵a 预检拒绝浏览器自报事实：`scopeDirs` / `enabled` / `mode` 是未知字段，逐条报出来（多认一个字段就是多一条提权路）',
    forged.status === 400
      && forged.json?.ok === false
      && ['scopeDirs', 'enabled', 'mode'].every((field) => forgedFields.includes(field)),
    JSON.stringify({ status: forged.status, fields: forgedFields }),
  )

  const preflightConfigAfter = await call('/api/dsh-devdata/config')
  const auditAfterPreflight = fs.existsSync(auditFile) ? fs.readFileSync(auditFile, 'utf8') : ''
  record(
    '㊶ 预检**什么都不做**：跑前跑后 `config` 与审计文件逐字节相同（不保存、不写审计、不发 Redis 命令）',
    JSON.stringify(preflightConfigBefore.json?.config) === JSON.stringify(preflightConfigAfter.json?.config)
      && auditBeforePreflight === auditAfterPreflight,
    JSON.stringify({
      configSame: JSON.stringify(preflightConfigBefore.json?.config) === JSON.stringify(preflightConfigAfter.json?.config),
      auditSame: auditBeforePreflight === auditAfterPreflight,
      auditLines: auditAfterPreflight.split('\n').filter((line) => line !== '').length,
    }),
  )

  const preflightMethod = await call('/api/dsh-devdata/preflight', { method: 'GET' })
  record(
    '㊷ 静态预检只收 POST：GET → 405（与 config / query 同一条纪律，不靠「没匹配上」静默 404）',
    preflightMethod.status === 405,
    `status=${String(preflightMethod.status)}`,
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

  const shotFile = shot('shell')
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
    const card = cards[0]
    const zones = ['dd_preflightPanel', 'dd_resultsPanel', 'dd_configAdvanced', 'dd_eviPanel', 'dd_queryPanel']
    /*
     * 新卡片契约（Lead 的 UI 改动）：
     *   - 项目上下文只在**顶部**输入一次（root / project / 已保存目标各一份）；
     *   - 「高级设置」「高级查询」「证据」三块默认**折叠**（details 且 open !== true）；
     *   - 结果行只由 preflight / readonly / evidence 三条驱动；
     *   - 失败行带 data-category（configuration / execution / audit / response / transport）。
     * 这里**只记录**，判据在下面对应的 record 里——折叠态要在展开读取原断言之前记下来。
     */
    const collapsed = ['dd_configAdvanced', 'dd_queryPanel', 'dd_eviPanel']
    const layout = card === undefined ? null : {
      zones: [...card.querySelectorAll(zones.map((name) => '.' + name).join(','))].map((el) => zones.find((name) => el.classList.contains(name))),
      collapsed: collapsed.map((name) => {
        const node = card.querySelector('details.' + name)
        return { name, isDetails: node !== null, open: node === null ? null : node.open === true }
      }),
      /* 顶层只剩 root / project / 已保存目标三样；**不许**再有 mode / 面开关那种输入 */
      roots: card.querySelectorAll('input[name="root"]').length,
      projects: card.querySelectorAll('input[name="project"]').length,
      targets: card.querySelectorAll('select[name="target"]').length,
      modeInputs: card.querySelectorAll('[name="mode"]').length,
      faceInputs: card.querySelectorAll('[name^="enabled."]').length,
      evidenceInputs: card.querySelectorAll('.dd_eviPanel input').length,
      resultChecks: [...card.querySelectorAll('.dd_resultRow')].map((el) => el.getAttribute('data-check')),
      resultStates: [...card.querySelectorAll('.dd_resultRow')].map((el) => ({ check: el.getAttribute('data-check'), state: el.getAttribute('data-state') })),
      resultCategories: [...card.querySelectorAll('.dd_resultRow')].map((el) => el.getAttribute('data-category')),
      /* 顶层动作按钮的文案（按文案找按钮，别认位置） */
      buttons: [...card.querySelectorAll('button')].map((el) => (el.innerText || '').trim()),
    }
    // 原目标编辑器与能力只读断言保留；默认折叠已由 layout 记录后再展开读取。
    const advanced = card === undefined ? null : card.querySelector('details.dd_configAdvanced')
    if (advanced !== null) advanced.open = true
    const text = cards.map((el) => el.innerText || '').join(' || ')
    const values = cards.map((el) => [...el.querySelectorAll('input,select,textarea')].map((input) => input.value).join(' | ')).join(' || ')
    if (advanced !== null) advanced.open = false
    return {
      rowFound: row !== null,
      status,
      layout,
      cardCount: cards.length,
      controls: cards.reduce((sum, el) => sum + el.querySelectorAll('input,select,textarea').length, 0),
      hasName: text.includes('开发测试套件 / 数据检查'),
      hasTargetOne: text.includes('redis-248'),
      hasTargetTwo: text.includes('redis-two'),
      hasCapEnv: text.includes('DSH_DEVDATA_WRITE'),
      hasCapReadonly: text.includes('能力档只读') || text.includes('能力授权只读'),
      hasEnvValue: values.includes('test-shared'),
      hasScope: values.includes('/Users/me/coding'),
      textHead: text.slice(0, 400),
      valueHead: values.slice(0, 400),
    }
  })()`)

  // 新隔离 profile 会弹预览版说明；先真实关闭，再拍可读的卡片（不隐藏或改写应用 DOM）。
  await chrome.evaluate(`(async () => {
    const dialog = [...document.querySelectorAll('[role="dialog"],dialog')].find((node) => (node.innerText || '').includes('预览版说明'))
    const buttons = dialog === undefined ? [...document.querySelectorAll('button')] : [...dialog.querySelectorAll('button')]
    const proceed = buttons.find((node) => (node.innerText || '').trim() === '继续')
    if (proceed !== undefined) proceed.click()
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  })()`)
  await waitFor(async () => {
    const showingPreview = await chrome.evaluate(`(document.body.innerText || '').includes('预览版说明')`)
    return showingPreview ? null : true
  }, 15_000, '预览版说明仍遮挡卡片，无法取得有效截图')
  await waitFor(async () => {
    return chrome.evaluate(`(() => {
      if (!(document.body.innerText || '').includes('添加一个 API Key 开始使用')) return true
      const later = [...document.querySelectorAll('button')].find((node) => (node.innerText || '').trim() === '稍后配置')
      if (later !== undefined && !later.disabled) later.click()
      return false
    })()`)
  }, 15_000, '测试 profile 的 API Key 引导仍遮挡卡片，无法取得有效截图')
  const screenshotSize = await chrome.evaluate(`(() => {
    const card = document.querySelector('[data-plugin-config="true"]')
    return { width: window.innerWidth, height: card === null ? window.innerHeight : Math.min(3000, Math.ceil(card.getBoundingClientRect().bottom + 32)) }
  })()`)
  await chrome.send('Emulation.setDeviceMetricsOverride', { ...screenshotSize, deviceScaleFactor: 1, mobile: false })
  const settingsCardShotFile = shot('desktop-initial')
  await chrome.screenshot(settingsCardShotFile)
  /*
   * 窄屏那一张（同一次运行、同一份 DOM，只改视口）：布局在窄栏里坏掉（按钮压成竖排字、树里的
   * 库名折行）是本仓真机抓到过的两类回归，所以**每一轮都要留一张窄的**给人肉复核。
   * 拍完把视口改回桌面宽度——后面的断言与截图都按桌面尺寸量。
   */
  await chrome.send('Emulation.setDeviceMetricsOverride', { width: 420, height: screenshotSize.height, deviceScaleFactor: 1, mobile: false })
  const narrowHeight = await chrome.evaluate(`Math.min(3000, Math.ceil(document.querySelector('[data-plugin-config="true"]').getBoundingClientRect().bottom + 32))`)
  await chrome.send('Emulation.setDeviceMetricsOverride', { width: 420, height: narrowHeight, deviceScaleFactor: 1, mobile: false })
  const narrowShotFile = shot('narrow-initial')
  await chrome.screenshot(narrowShotFile)
  await chrome.send('Emulation.setDeviceMetricsOverride', { ...screenshotSize, deviceScaleFactor: 1, mobile: false })
  console.log('# 五区配置卡片截图（插件详情 / 高级默认折叠）：' + settingsCardShotFile)
  console.log('# 窄屏（420px）截图：' + narrowShotFile)

  /*
   * 失败态截图的**路径**在顶层声明、在下面 `else` 分支里赋值：它要在 ㊽ 那段（`else` 之外）被复核，
   * 所以不能在分支里用 `const`——那会变成块级作用域，外面读到的是 ReferenceError。
   */
  const failShotFile = shot('desktop-fail')
  const cardShotFile = shot('desktop-success')

  if (dumpOnly) {
    console.log('# 插件页与卡片：', JSON.stringify(cardReport, null, 2))
  } else {
    record(
      '五区配置卡片按快速开始 / 检查结果 / 高级设置 / 项目证据链 / 数据查询排列；项目根、项目名、已保存目标各一份输入，**没有** mode / 面开关；三块高级区默认折叠；结果行只由 preflight / readonly / evidence 驱动',
      cardReport.layout?.zones?.join(',') === 'dd_preflightPanel,dd_resultsPanel,dd_configAdvanced,dd_eviPanel,dd_queryPanel'
        && cardReport.layout.collapsed.every((zone) => zone.isDetails === true && zone.open === false)
        && cardReport.layout.roots === 1 && cardReport.layout.projects === 1 && cardReport.layout.targets === 1
        && cardReport.layout.modeInputs === 0 && cardReport.layout.faceInputs === 0
        && cardReport.layout.evidenceInputs === 0
        /* 只由这三条驱动——**不钉顺序**（顺序是版式，不是判据） */
        && cardReport.layout.resultChecks.length === 0
        && cardReport.layout.resultStates.length === 0
        && cardReport.layout.buttons.includes('检查配置') && cardReport.layout.buttons.includes('读取目标'),
      JSON.stringify(cardReport.layout),
    )
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
     * ㊸ **「检查配置」的客户端路径**（DOM 真点，2026-10-05 改到新契约上）。
     *
     * 原断言（「预检 DOM：仅字段通过…」）的**判据一个字没改**，改的是「怎么找」与「找什么」：
     * 按钮文案从「预检」变成「检查配置」；结果行从 5 条（含 directory / assertions）收到 3 条
     * （`preflight` / `readonly` / `evidence`）。作用域内用**真实存在**的临时项目根（它落在目标
     * `scopeDirs` 里），作用域外用同一个临时目录下的兄弟目录——这样这条断言与 ㊴㊵ 讲的是同一件事。
     */
    const preflightSnapshot = await call('/api/dsh-devdata/config')
    const preflightDom = await chrome.evaluate(`(async () => {
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
      const card = document.querySelector('[data-plugin-config="true"]')
      const root = card?.querySelector('input[name="root"]')
      const project = card?.querySelector('input[name="project"]')
      const run = card === null ? undefined : [...card.querySelectorAll('.dd_preflightPanel button')].find((node) => (node.innerText || '').trim() === '检查配置')
      if (root === null || project === null || run === undefined) return { ok: false, note: '缺少共享上下文或「检查配置」入口' }
      const setValue = (input, value) => {
        Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, value)
        input.dispatchEvent(new Event('input', { bubbles: true }))
      }
      const originalFetch = window.fetch
      const requests = []
      window.fetch = function(url, options) {
        requests.push({ url: String(url), method: options?.method || 'GET' })
        return originalFetch.call(this, url, options)
      }
      const states = () => [...card.querySelectorAll('.dd_resultRow')].map((row) => ({
        check: row.getAttribute('data-check'),
        state: row.getAttribute('data-state'),
        category: row.getAttribute('data-category'),
        text: (row.innerText || '').trim(),
      }))
      const settle = async (check, want) => {
        for (let i = 0; i < 60; i += 1) {
          await sleep(100)
          if (states().find((row) => row.check === check)?.state === want) return
        }
      }
      try {
        setValue(root, ${JSON.stringify(scopeProjectRoot)})
        setValue(project, 'scope-proj')
        await sleep(150)
        run.click()
        await settle('preflight', 'pass')
        const passed = states()
        setValue(root, ${JSON.stringify(outOfScopeRoot)})
        await sleep(150)
        const invalidated = states()
        run.click()
        await settle('preflight', 'fail')
        return { ok: true, passed, invalidated, failed: states(), requests }
      } finally {
        window.fetch = originalFetch
      }
    })()`)
    const afterPreflight = await call('/api/dsh-devdata/config')
    record(
      '㊸ 「检查配置」DOM：作用域内通过、其余两行仍未验证；改输入即失效；作用域外失败并给恢复路径；全程不 POST 保存',
      preflightDom.ok === true
        && preflightDom.passed.find((row) => row.check === 'preflight')?.state === 'pass'
        && preflightDom.passed.filter((row) => row.check !== 'preflight').every((row) => row.state === 'not-verified')
        && preflightDom.invalidated.every((row) => row.state === 'not-verified')
        && preflightDom.failed.find((row) => row.check === 'preflight')?.state === 'fail'
        && preflightDom.failed.find((row) => row.check === 'preflight')?.text.includes('下一步')
        && ['OUT_OF_SCOPE', outOfScopeRoot, scopeProjectRoot, '恢复路径']
          .every((value) => preflightDom.failed.find((row) => row.check === 'preflight')?.text.includes(value))
        /* 失败必须带**分类**：配置错、执行错、审计错、响应错、传输错不是一回事 */
        && ['configuration', 'execution', 'audit', 'response', 'transport']
          .includes(preflightDom.failed.find((row) => row.check === 'preflight')?.category)
        && !preflightDom.requests.some((request) => request.url.endsWith('/config') && request.method === 'POST'),
      JSON.stringify(preflightDom),
    )
    record(
      '㊸a 「检查配置」不保存配置：跑前跑后 `config` 逐字段相同',
      JSON.stringify(preflightSnapshot.json?.config) === JSON.stringify(afterPreflight.json?.config),
      JSON.stringify({
        same: JSON.stringify(preflightSnapshot.json?.config) === JSON.stringify(afterPreflight.json?.config),
        requests: (preflightDom.requests ?? []).map((request) => request.method + ' ' + request.url),
      }),
    )

    /*
     * 失败态截图：上一条 DOM 探针把卡片留在「作用域外」的失败现场（结果行 fail + 恢复路径），
     * 这正是人肉复核要看的那一屏。
     *
     * **视口要重量一次**：预检跑过之后结果行里多出了问题明细，卡片比初始那会儿更高——用初始那次
     * 量到的高度会把恢复路径截掉，截图就看不到要看的东西。
     */
    const failSize = await chrome.evaluate(`(() => {
      const card = document.querySelector('[data-plugin-config="true"]')
      return { width: window.innerWidth, height: card === null ? window.innerHeight : Math.min(3000, Math.ceil(card.getBoundingClientRect().bottom + 32)) }
    })()`)
    await chrome.send('Emulation.setDeviceMetricsOverride', { ...failSize, deviceScaleFactor: 1, mobile: false })
    await chrome.screenshot(failShotFile)
    console.log('# 失败态截图（作用域外 / 恢复路径）：' + failShotFile)

    /*
     * ㊼ **换项目 / 换根 / 换目标 → 结果作废**（2026-10-05，新契约）。
     *
     * 这是「预检不是授权缓存」那条不变量的界面一侧：预检通过的结论只对**当时那份上下文**成立。
     * 换了项目名、项目根或目标之后，旧结论必须立刻变回 `not-verified`——否则界面会拿一份过期结论
     * 继续往下走（人以为已经验过，其实验的是别的项目）。
     *
     * 判据按三种触发各走一遍：先真的把 preflight 跑到 `pass`，再改其中一个字段，结果行必须全部
     * 回到 `not-verified`；改回来再跑一次，确认它**能重新变绿**（不是一次性坏掉）。
     */
    const invalidateReport = await chrome.evaluate(`(async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
      const card = document.querySelector('[data-plugin-config="true"]')
      if (card === null) return { ok: false, note: '没有卡片' }
      const setValue = (element, value) => {
        const proto = element.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(element, value)
        element.dispatchEvent(new Event(element.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }))
      }
      const root = card.querySelector('input[name="root"]')
      const project = card.querySelector('input[name="project"]')
      const target = card.querySelector('select[name="target"]')
      if (root === null || project === null || target === null) return { ok: false, note: '缺少 root / project / target 三者之一' }
      const states = () => [...card.querySelectorAll('.dd_resultRow')].map((row) => row.getAttribute('data-state'))
      const run = [...card.querySelectorAll('.dd_preflightPanel button')].find((node) => (node.innerText || '').trim() === '检查配置')
      if (run === undefined) return { ok: false, note: '没有「检查配置」按钮' }
      const until = async (want) => {
        for (let i = 0; i < 60; i += 1) {
          await sleep(100)
          if (states().includes(want)) return
        }
      }
      const baselineRoot = ${JSON.stringify(scopeProjectRoot)}
      const baselineTarget = target.value
      setValue(root, baselineRoot)
      setValue(project, 'scope-proj')
      await sleep(150)
      run.click()
      await until('pass')
      const passed = states()
      const probes = {}
      for (const [label, apply] of [
        ['project', () => setValue(project, 'another-proj')],
        ['root', () => setValue(root, ${JSON.stringify(outOfScopeRoot)})],
        ['target', () => setValue(target, [...target.options].map((o) => o.value).find((v) => v !== baselineTarget) ?? baselineTarget)],
      ]) {
        apply()
        await sleep(200)
        probes[label] = states()
      }
      // 改回来 → 再跑一次，确认能重新变绿（不是一次性坏掉）
      setValue(root, baselineRoot)
      setValue(project, 'scope-proj')
      setValue(target, baselineTarget)
      await sleep(200)
      run.click()
      await until('pass')
      return { ok: true, passed, probes, recovered: states() }
    })()`)
    if (dumpOnly) {
      console.log('# 换字段即作废（DOM 路径）：', JSON.stringify(invalidateReport, null, 2))
    } else {
      record(
        '㊹ 换项目名 / 换项目根 / 换目标都会让结果**立刻作废**（全部回到未验证），改回来重跑还能重新变绿——预检不是授权缓存',
        invalidateReport.ok === true
          && invalidateReport.passed.includes('pass')
          && ['project', 'root', 'target'].every((key) => Array.isArray(invalidateReport.probes[key])
            && invalidateReport.probes[key].every((state) => state === 'not-verified'))
          && invalidateReport.recovered.includes('pass'),
        JSON.stringify(invalidateReport),
      )
    }


    await chrome.screenshot(cardShotFile)
    console.log('# 配置成功态截图：' + cardShotFile)

    /*
     * ㉓ 真的按一下「保存高级设置」。
     *
     * 为什么必须点这一下：前面那些断言走的都是脚本自己拼的 JSON——**客户端拼的 payload 长什么样
     * 没有任何东西验过**（`client.js` 不在 vitest 层、`client-lint` 只查静态问题）。点一次才知道
     * 「卡片提交的形状」真的过得了服务端那套校验（400 会显示成「保存失败：…」，断言里带上它）。
     *
     * 这里只点标量那一次（表单里就是刚 GET 到的那份值）：它证明 payload 合法、fetch 路径通、
     * i18n 的 `msg.saved` 渲染得出来。**改目标那一次的浏览器交互没点**（要再点两个复选框，
     * 收益是同一段代码的第二次证明）——那是一处如实记下的缺口。
     *
     * > **2026-10-04 追加**：那处缺口已由下面 ㉕㉖ 补上（原文保留）。理由在 2026-10-04 变了：
     * > devfront 的卡片前后被真机抓出过三条静态闸门全绿的缺陷，而「客户端拼的 payload」
     * > 正是 `client-lint`（语法 / 地址来源）与 `check-i18n`（键集）都看不见的那一块。
     */
    const saveReport = await chrome.evaluate(`(async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
      const card = document.querySelector('[data-plugin-config="true"]')
      if (card === null) return { clicked: false, note: '没有卡片' }
      const advanced = card.querySelector('details.dd_configAdvanced')
      if (advanced !== null) advanced.open = true
      /*
       * 保存按钮按**文案**找（不认位置）：新契约的文案是「保存高级设置」，旧形状是「保存」。
       * 两个都认——card-dom-path.test.ts 钉的正是「按文案找保存按钮 → 点它」这一段。
       */
      const button = [...card.querySelectorAll('button')].find((el) => (el.innerText || '').trim() === '保存高级设置')
        ?? [...card.querySelectorAll('button')].find((el) => (el.innerText || '').trim() === '保存')
      if (button === undefined) return { clicked: false, note: '没有「保存高级设置」按钮' }
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
      '㉓ 客户端**真的提交得动**：点卡片上的「保存高级设置」→ 服务端接受、卡片回「已保存」（客户端拼的 payload 过得了服务端校验）',
      saveReport.clicked === true && saveReport.message === '已保存',
      JSON.stringify(saveReport),
    )

    /*
     * ㊹ **「保存高级设置」的 DOM 真点**（2026-10-05，新契约）。
     *
     * 与 ㉓ 的区别：㉓ 点的是「表单里就是刚 GET 到的那份值」（提交没改过的值），这一条**先在
     * 高级设置里真的改一个标量**（`timeoutMs`）→ 再点「保存高级设置」→ 然后 **HTTP 复核**读回来
     * 确认改动真的落盘。这是 conventions.md § 客户端卡片那条口径要求的形状：**改值 → 保存 →
     * HTTP 复核**，而不是只点一下没改过的保存。
     *
     * 复核**只读那一个字段**（`timeoutMs`）并**顺带钉住既有不变量**：改标量不许把 `targets` 整批
     * 抹掉（那正是 devfront D01 那一类「保存一个标量把整批抹掉」）。收尾把它改回原值，后面的
     * 断言与截图都还在同一份配置上。
     */
    const advancedSave = await chrome.evaluate(`(async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
      const card = document.querySelector('[data-plugin-config="true"]')
      if (card === null) return { ok: false, note: '没有卡片' }
      const advanced = card.querySelector('details.dd_configAdvanced')
      if (advanced === null) return { ok: false, note: '没有「高级设置」折叠区' }
      advanced.open = true
      await sleep(200)
      const field = [...advanced.querySelectorAll('input')].find((node) => node.name === 'timeoutMs')
      if (field === undefined) return { ok: false, note: '高级设置里没有 timeoutMs 输入框' }
      const setValue = (element, value) => {
        Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(element, value)
        element.dispatchEvent(new Event('input', { bubbles: true }))
      }
      setValue(field, '4242')
      await sleep(200)
      const save = [...card.querySelectorAll('button')].find((el) => (el.innerText || '').trim() === '保存高级设置')
        ?? [...card.querySelectorAll('button')].find((el) => (el.innerText || '').trim() === '保存')
      if (save === undefined) return { ok: false, note: '没有「保存高级设置」按钮' }
      save.click()
      for (let i = 0; i < 50; i += 1) {
        await sleep(200)
        const node = advanced.querySelector('.dd_msg') ?? card.querySelector('.dd_msg')
        const text = node === null ? '' : (node.innerText || '').trim()
        if (text !== '' && !text.includes('保存中')) return { ok: true, message: text, typed: '4242' }
      }
      return { ok: false, note: '点了保存但卡片没有回消息', typed: '4242' }
    })()`)
    const afterAdvancedSave = await call('/api/dsh-devdata/config')
    record(
      '㊺ 在「高级设置」里改 `timeoutMs` → 点「保存高级设置」→ 回「已保存」；HTTP 复核读回来真的是 4242，且 `targets` 没被整批抹掉',
      advancedSave.ok === true
        && advancedSave.message === '已保存'
        && afterAdvancedSave.json?.config?.timeoutMs === 4242
        && afterAdvancedSave.json?.config?.targets?.length === 3,
      JSON.stringify({ dom: advancedSave, timeoutMs: afterAdvancedSave.json?.config?.timeoutMs, targets: afterAdvancedSave.json?.config?.targets?.length }),
    )
    // 收尾：**在卡片上**把 timeoutMs 改回原值并再保存一次——这样卡片表单与宿主配置回到同一个值，
    // 后面的目标编辑保存不会把 4242 又写回去（表单状态是卡片自己的，改服务端不改它）。
    const restoreAdvanced = await chrome.evaluate(`(async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
      const card = document.querySelector('[data-plugin-config="true"]')
      if (card === null) return { ok: false, note: '没有卡片' }
      const advanced = card.querySelector('details.dd_configAdvanced')
      if (advanced === null) return { ok: false, note: '没有「高级设置」折叠区' }
      advanced.open = true
      const field = [...advanced.querySelectorAll('input')].find((node) => node.name === 'timeoutMs')
      if (field === undefined) return { ok: false, note: '高级设置里没有 timeoutMs 输入框' }
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(field, '1234')
      field.dispatchEvent(new Event('input', { bubbles: true }))
      await sleep(200)
      const save = [...card.querySelectorAll('button')].find((el) => (el.innerText || '').trim() === '保存高级设置')
        ?? [...card.querySelectorAll('button')].find((el) => (el.innerText || '').trim() === '保存')
      if (save === undefined) return { ok: false, note: '没有「保存高级设置」按钮' }
      save.click()
      for (let i = 0; i < 50; i += 1) {
        await sleep(200)
        const node = advanced.querySelector('.dd_msg') ?? card.querySelector('.dd_msg')
        const text = node === null ? '' : (node.innerText || '').trim()
        if (text !== '' && !text.includes('保存中')) return { ok: true, message: text }
      }
      return { ok: false, note: '点了保存但卡片没有回消息' }
    })()`)
    const afterRestore = await call('/api/dsh-devdata/config')
    record(
      '㊺a 收尾把 `timeoutMs` 改回 1234 并再保存一次：卡片表单与宿主配置回到同一个值（后面的断言与截图仍在同一份配置上）',
      restoreAdvanced.ok === true && restoreAdvanced.message === '已保存' && afterRestore.json?.config?.timeoutMs === 1234,
      JSON.stringify({ dom: restoreAdvanced, timeoutMs: afterRestore.json?.config?.timeoutMs }),
    )

    /*
     * ㉕㉖ **目标编辑器的客户端路径**（2026-10-04）。
     *
     * ㉓ 只点了标量那一次（表单里就是刚 GET 到的那份值），所以「目标那一行的 payload 长什么样」
     * 一直没有真机证据——而它在服务端要过的是**最严的一整套**（`normalizeTargets`：逐行逐字段、
     * 引擎认不出整条拒、连接要么两个都给要么都不给）。这里在真 Chrome 里把那一行走一遍。
     */
    const targetEdit = await chrome.evaluate(`(async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
      const card = document.querySelector('[data-plugin-config="true"]')
      if (card === null) return { ok: false, note: '没有卡片' }
      // 目标编辑器是卡片里嵌套的那个 .dd_card：确认框要**在这一层**找，否则先命中标量的复选框
      const editor = card.querySelector('.dd_targets') === null ? null : card.querySelector('.dd_targets').closest('.dd_card')
      if (editor === null) return { ok: false, note: '没有目标编辑器' }
      const rows = () => [...editor.querySelectorAll('li.dd_target')]
      const before = rows().length
      const add = [...editor.querySelectorAll('button')].find((el) => (el.innerText || '').trim() === '+ 添加目标')
      if (add === undefined) return { ok: false, note: '没有「+ 添加目标」按钮', before }
      add.click()
      await sleep(300)
      const afterAdd = rows().length
      const row = rows()[afterAdd - 1]
      if (row === undefined) return { ok: false, note: '点了添加但没有新行', before, afterAdd }
      /*
       * React 受控输入：文本框走 input 事件，下拉框走 change 事件，而且都必须**先过原生 setter**
       * （直接改 .value 时 React 的 value tracker 不会认，提交上去的还是旧值 / 空值）。
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
      const fields = [...row.querySelectorAll('.dd_input')]
      // 顺序就是渲染顺序：id / 名字 / 引擎 / 环境档 / 作用域 / SCAN 上限 / 主机 / 端口 / 库 / 可浏览的库 / 凭据引用
      const pickOption = (select) => {
        const option = [...select.options].find((item) => item.value !== '')
        return option === undefined ? '' : option.value
      }
      const values = ['dd-dom', 'DOM 加的目标']
      setValue(fields[0], values[0])
      setValue(fields[1], values[1])
      const engine = pickOption(fields[2])
      const env = pickOption(fields[3])
      setValue(fields[2], engine)
      setValue(fields[3], env)
      setValue(fields[4], '/Users/me/coding')
      setValue(fields[6], '127.0.0.1')
      setValue(fields[7], '6379')
      setValue(fields[9], '0, 2')
      await sleep(300)
      const confirm = editor.querySelector('input[type="checkbox"]')
      if (confirm === null) return { ok: false, note: '填了值但确认框没出现', before, afterAdd }
      confirm.click()
      await sleep(200)
      const save = [...card.querySelectorAll('button')].find((el) => (el.innerText || '').trim() === '保存高级设置')
        ?? [...card.querySelectorAll('button')].find((el) => (el.innerText || '').trim() === '保存')
      if (save === undefined) return { ok: false, note: '没有「保存高级设置」按钮', before, afterAdd }
      save.click()
      for (let i = 0; i < 50; i += 1) {
        await sleep(200)
        const node = card.querySelector('.dd_msg')
        const text = node === null ? '' : (node.innerText || '').trim()
        if (text !== '' && !text.includes('保存中')) {
          return { ok: true, before, afterAdd, fieldCount: fields.length, engine, env, message: text }
        }
      }
      return { ok: false, note: '点了保存但卡片没有回消息', before, afterAdd, engine, env }
    })()`)

    if (dumpOnly) {
      console.log('# 目标编辑器（DOM 路径）：', JSON.stringify(targetEdit, null, 2))
    } else {
      record(
        '㉕ 卡片上**真的**加一行目标、填 11 个字段（含两个下拉）、勾确认、点保存 → 回「目标已保存（进审计）」',
        targetEdit.ok === true
          && targetEdit.afterAdd === targetEdit.before + 1
          && targetEdit.fieldCount === 11
          && targetEdit.message === '目标已保存（进审计）',
        JSON.stringify(targetEdit),
      )
      const get5 = await call('/api/dsh-devdata/config')
      const targets5 = get5.json?.config?.targets ?? []
      const added = targets5.find((target) => target.id === 'dd-dom')
      record(
        '㉖ 客户端拼的目标 payload 过得了服务端那套最严校验：GET 里有 dd-dom，引擎 / 环境档 / 端口 / **可浏览的库（`0, 2` → `[0,2]`）**都在位',
        get5.status === 200
          && added !== undefined
          && added.engine === targetEdit.engine
          && added.env === targetEdit.env
          && added.port === 6379
          && Array.isArray(added.dbs)
          && added.dbs.join(',') === '0,2',
        JSON.stringify({ status: get5.status, ids: targets5.map((target) => target.id), added: added ?? null }),
      )
    }
  }
  /*
   * ㉗㉘ **证据链总览的客户端路径**（2026-10-04，P13 第一版）。
   *
   * 这一区读的是**项目目录里的三份清单**（不是配置），所以它有两个只有真机才回答得了的问题：
   *   ① 宿主那条 `/api/dsh-devdata/evidence` 在真 Chrome 里真的通、三行真的渲染出来（单测与假宿主
   *      那一层答不了「卡片拼的 body 长什么样」——与 ㉓㉕ 同一条理由）；
   *   ② **「路径写错了」与「这个项目没有清单」在界面上能不能分辨**——它们是两种结果，混成一句
   *      就是本仓最忌的错诊断（人会去建一份本来就在别处的清单）。
   *
   * 夹具放在 `harness.workDir` 里（隔离前缀 + 收尾整体删除，不往 /tmp 漏东西）：`ready` 的项目名
   * 正确、`verify` 的项目名**故意串了**（断言「不一致」那句真的渲染出来）、`web` 故意不写。
   */
  const evidenceProject = 'evid-proj'
  const evidenceRoot = path.join(harness.workDir, 'evidence-project')
  fs.mkdirSync(path.join(evidenceRoot, 'ready'), { recursive: true })
  fs.mkdirSync(path.join(evidenceRoot, 'verify'), { recursive: true })
  fs.writeFileSync(
    path.join(evidenceRoot, 'ready', `${evidenceProject}.ready.yaml`),
    ['version: 1', `project: ${evidenceProject}`, 'services:', '  - name: ems-service', '    ready: { kind: healthcheck }', ''].join('\n'),
  )
  fs.writeFileSync(
    path.join(evidenceRoot, 'verify', `${evidenceProject}.yaml`),
    ['version: 1', 'project: some-other-project', 'assertions:', '  - id: redis-alive', '    target: redis-248', '    statement: PING', '    expect: { eq: PONG }', '    severity: fail', ''].join('\n'),
  )

  const evidenceReport = await chrome.evaluate(`(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
    const card = document.querySelector('[data-plugin-config="true"]')
    if (card === null) return { ok: false, note: '没有卡片' }
    const panel = card.querySelector('.dd_eviPanel')
    if (panel === null) return { ok: false, note: '卡片里没有证据链总览那一区' }
    /*
     * 新契约下这一区本身是默认折叠的 details：先记下折叠态（顶层那条断言已经钉过），
     * 再**展开**——展开是用户会做的动作，不展开就去点里面的按钮等于绕过界面。
     */
    const collapsedBefore = panel.tagName === 'DETAILS' ? panel.open !== true : null
    if (panel.tagName === 'DETAILS') panel.open = true
    const inputs = [card.querySelector('input[name="root"]'), card.querySelector('input[name="project"]')]
    if (inputs.some((node) => node === null)) return { ok: false, note: '快速开始缺少共享项目根或项目名' }
    if (panel.querySelectorAll('input').length !== 0) return { ok: false, note: '证据区不得重复项目输入' }
    const setValue = (element, value) => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(element, value)
      element.dispatchEvent(new Event('input', { bubbles: true }))
    }
    const button = panel.querySelector('button')
    if (button === null) return { ok: false, note: '证据区没有按钮' }
    const readRows = () => [...panel.querySelectorAll('.dd_eviRow')].map((row) => ({
      face: row.getAttribute('data-face'),
      text: (row.innerText || '').replace(/\\s+/g, ' ').trim(),
    }))
    const message = () => {
      const node = panel.querySelector('.dd_msg')
      return node === null ? '' : (node.innerText || '').trim()
    }

    // —— 一次正常读：三行都出来，missing 与 parsed 分得开 ——
    setValue(inputs[0], ${JSON.stringify(evidenceRoot)})
    setValue(inputs[1], ${JSON.stringify(evidenceProject)})
    await sleep(200)
    button.click()
    let rows = []
    for (let i = 0; i < 40; i += 1) {
      await sleep(200)
      rows = readRows()
      if (rows.length === 3) break
    }
    const afterOk = { rows, message: message(), projectValue: inputs[1].value }

    // —— 一次路径写错：这句必须与「没有那份清单」分辨得开 ——
    setValue(inputs[0], '/definitely/not/here')
    await sleep(200)
    button.click()
    let badMessage = ''
    for (let i = 0; i < 40; i += 1) {
      await sleep(200)
      badMessage = message()
      if (badMessage !== '' && !badMessage.includes('正在读')) break
    }
    return { ok: true, afterOk, badMessage }
  })()`)

  if (dumpOnly) {
    console.log('# 证据链总览（DOM 路径）：', JSON.stringify(evidenceReport, null, 2))
  } else {
    const rows = evidenceReport.ok === true ? evidenceReport.afterOk.rows : []
    const byFace = (name) => rows.find((row) => row.face === name)
    const ready = byFace('ready')
    const verify = byFace('verify')
    const web = byFace('web')
    record(
      '㉗ 卡片上真的读一次证据：三行（容器 / 数据 / 页面）都渲染出来，且「读到了」与「没有这份清单」分得开',
      evidenceReport.ok === true
        && rows.length === 3
        && ready !== undefined && ready.text.includes('读到了') && ready.text.includes('1 条')
        && verify !== undefined && verify.text.includes('不一致')
        && web !== undefined && web.text.includes('没有这份清单'),
      JSON.stringify(evidenceReport.afterOk ?? evidenceReport),
    )
    record(
      '㉘ 项目根写错时，界面给的是**那句拒绝**（不是「三份清单都没有」）——两种结果不许混成一句',
      typeof evidenceReport.badMessage === 'string'
        && evidenceReport.badMessage.includes('读取失败')
        && evidenceReport.badMessage.includes('项目根读不了'),
      JSON.stringify({ badMessage: evidenceReport.badMessage ?? null }),
    )
  }

  /*
   * ㉙㉚ **看数据那一区的客户端路径**（2026-10-04，P14 第一版）。
   *
   * 这一条与 ㉗㉘ 不同：它**真的会连目标**，所以它是「面板不是特权路径」这句话唯一能拿出的正向证据——
   * 而它必须两头都证到：
   *   ㉙ **跑得通**：起一个只答 `PING` 的极简 Redis（本地 TCP，端口现取），把目标经 `/config` 加进
   *      配置，然后在卡片上选它、点「跑一次」——回复要真的渲染出来（浏览器 → 宿主路由 → 判据链 →
   *      执行器 → TCP → 界面，整条路都在）；
   *   ㉚ **拦得住**：同一个目标上发 `SET`（这份配置声明了写能力但宿主没授权），界面必须摊出**判据层
   *      那句话**（码 + 恢复路径），而且审计里要落下 `set` / `allowed:false` —— 与 agent 那条工具
   *      同一本账。少了 ㉚，面板看起来「能用」就说明不了它没绕开闸门。
   */
  const fakePort = await freePort()
  /*
   * 假 Redis 的两档可控行为（㉟㊱ 要用）：
   *   - `infoState.broken`：让 `INFO keyspace` 回一条错误——**验「读失败」与「服务器说没有库」分得开**；
   *   - `infoState.count`：`INFO keyspace` 被真的发过几次（**声明的库不该花这一条**，只有服务器当场报的
   *     那个库才要先问一次）。
   */
  const infoState = { broken: false, count: 0 }
  /** `DBSIZE` 的回复档（㊺㊻ 用）：默认合法非负整数 `9`，验收时逐档换成坏值。 */
  const fakeRedisMode = { dbsize: ':9\r\n' }
  /**
   * 假服务**一共收到过几条命令**（㊶a 用）：静态预检是「连目标之前」的判定，所以跑它的时候这个
   * 计数**一个都不许涨**——涨了就说明预检偷偷连了目标（那是 `/query` 那条路的事）。
   */
  const redisCommandCount = { total: 0 }

  /**
   * 把一段字节里发来的 RESP 数组帧切开（**独立实现**：这个假服务不是被测代码，借被测代码的解析器
   * 会让「请求被切错」与「回复被解析错」互相掩盖）。
   *
   * 为什么必须逐帧回：执行器把 `SELECT n` 与命令**一次全发**（少一次往返），然后按**帧数**收回复——
   * 「收到一段就回一条」会让它永远等第二条（表现为 `Redis 在 1234ms 内没有回复`）。
   */
  const splitFrames = (buf) => {
    const frames = []
    let cursor = 0
    for (;;) {
      if (buf[cursor] !== '*') break
      const headEnd = buf.indexOf('\r\n', cursor)
      if (headEnd < 0) break
      const count = Number.parseInt(buf.slice(cursor + 1, headEnd), 10)
      let pos = headEnd + 2
      const argv = []
      let complete = true
      for (let i = 0; i < count; i += 1) {
        if (buf[pos] !== '$') {
          complete = false
          break
        }
        const lenEnd = buf.indexOf('\r\n', pos)
        if (lenEnd < 0) {
          complete = false
          break
        }
        const len = Number.parseInt(buf.slice(pos + 1, lenEnd), 10)
        const start = lenEnd + 2
        if (buf.length < start + len + 2) {
          complete = false
          break
        }
        argv.push(buf.slice(start, start + len))
        pos = start + len + 2
      }
      if (!complete) break
      frames.push(argv)
      cursor = pos
    }
    return { frames, rest: buf.slice(cursor) }
  }

  fakeRedis = net.createServer((socket) => {
    /* 每条连接自己的「当前库」：执行器一次把 `SELECT n` 与命令全发过来，所以从同一段字节里就能读出来。 */
    let currentDb = '0'
    let buf = ''
    socket.on('data', (chunk) => {
      /*
       * 一个**够用的假 Redis**（按命令名分派，**逐帧回**）。回复的形状按 RESP 手写——`SCAN` 要
       * `[游标, [key…]]`、`GETRANGE` 要是 bulk 串，其余是简单串 / 整数。**够 ㉙㉛㉜㉝㉞㉟㊱㊲ 用即可**，
       * 它不是被测代码。
       *
       * `SCAN` 的回复**带上当前库名**（`db2:user:1`）：这样「切了库」这件事在界面上可见——
       * 光看「命令发出去过」证明不了 `SELECT` 真的生效（而那正是切库唯一的实质）。
       */
      buf += chunk.toString('utf8')
      const split = splitFrames(buf)
      buf = split.rest
      for (const argv of split.frames) {
        redisCommandCount.total += 1
        const name = (argv[0] ?? '').toUpperCase()
        const first = argv[1] ?? ''
        if (name === 'SELECT') {
          currentDb = first
          socket.write('+OK\r\n')
        } else if (name === 'AUTH') socket.write('+OK\r\n')
        else if (name === 'PING') socket.write('+PONG\r\n')
        /*
         * `DBSIZE` 的回复**可切档**（㊺㊻）：默认 `:9`，验收时按需换成负数 / 小数 / 非数字 / 超大数，
         * 用来钉住「只有非负安全整数才算通过」。
         */
        else if (name === 'DBSIZE') socket.write(fakeRedisMode.dbsize)
        else if (name === 'GETRANGE') socket.write('$5\r\nhello\r\n')
        else if (name === 'STRLEN') socket.write(':5\r\n')
        else if (name === 'TYPE') socket.write('+string\r\n')
        else if (name === 'TTL') socket.write(':3600\r\n')
        else if (name === 'INFO') {
          /*
           * `INFO keyspace` **刻意只报 `db2`**（声明里那两个库是 `db0` 与 `db3`，它们一个 key 都没有）。
           * 于是库那一层必须把两个真源拼起来：INFO 报的（有 key 的）+ **目标声明的那些**（哪怕 INFO
           * 没报）——少了后者，key 列表与扫描工具条就没了挂靠的那一行，整个面板会只剩「别的库」的提示
           * （2026-10-04「redis 不是有 16 个库吗」那轮修的正是这个）。
           *
           * `$42` 是**正文**的字节数（`# Keyspace\r\ndb2:keys=9,expires=0,avg_ttl=0` = 12 + 30），末尾那个
           * `\r\n` 是 RESP 的**帧结束符**，不算在长度里——数错了会让解析器一直等更多的字节（表现为超时，
           * 或者整段被截掉、`INFO keyspace` 看起来「一台机器上没有任何库」）。
           */
          infoState.count += 1
          if (infoState.broken) socket.write('-ERR INFO keyspace is disabled in this acceptance step\r\n')
          else socket.write('$42\r\n# Keyspace\r\ndb2:keys=9,expires=0,avg_ttl=0\r\n')
        } else if (name === 'SCAN') {
          const keys = [`db${currentDb}:user:1`, `db${currentDb}:user:2`]
          socket.write(
            `*2\r\n$1\r\n0\r\n*${String(keys.length)}\r\n${keys.map((key) => `$${String(Buffer.byteLength(key))}\r\n${key}\r\n`).join('')}`,
          )
        } else socket.write('-ERR unknown command\r\n')
      }
    })
    socket.on('error', () => {})
  })
  await new Promise((resolve) => {
    fakeRedis.listen(fakePort, '127.0.0.1', resolve)
  })

  /*
   * 把**已经在卡片快照里的**那个目标（`redis-two`，见②）改指向假 Redis —— 刻意**不新增**目标：
   * 卡片不会因为别处改了配置就重取快照，新增的目标在下拉框里根本不存在（选择框只会落到第一个上），
   * 而「宿主按 id 现取连接」这件事意味着**改端口立刻生效**。这一条本身也是一次真实语义的证明。
   */
  const beforeQuery = await call('/api/dsh-devdata/config')
  const existingTargets = (beforeQuery.json?.config?.targets ?? []).map((row) => ({
    id: row.id,
    label: row.label,
    engine: row.engine,
    env: row.env,
    scopeDirs: row.scopeDirs,
    host: row.host,
    port: row.port,
    // `dbs` 必须一起带回来：卡片保存是**整份 targets 替换**，漏掉它 = 一次改端口就悄悄清空可浏览的库。
    ...(Array.isArray(row.dbs) ? { dbs: row.dbs } : {}),
    maxScanCount: row.maxScanCount,
    credentialRef: row.credentialRef,
  }))
  const repointed = existingTargets.map((row) =>
    row.id === 'redis-two'
      ? { ...row, scopeDirs: ['/Users/me/coding'], host: '127.0.0.1', port: fakePort }
      : row,
  )
  const addFake = await call('/api/dsh-devdata/config', { method: 'POST', body: { confirmTargetEdit: true, targets: repointed } })
  const repointedTarget = (addFake.json?.config?.targets ?? []).find((row) => row.id === 'redis-two')
  record(
    '㉙a 假 Redis 起在 127.0.0.1:' + String(fakePort) + ' 上，并把卡片里已有的 `redis-two` 改指过去（宿主按 id 现取连接，改完立刻生效）',
    addFake.status === 200 && repointedTarget?.port === fakePort && repointedTarget?.host === '127.0.0.1',
    JSON.stringify({ status: addFake.status, target: repointedTarget ?? null }),
  )

  const queryRun = await chrome.evaluate(`(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
    const card = document.querySelector('[data-plugin-config="true"]')
    if (card === null) return { ok: false, note: '没有卡片' }
    const panel = card.querySelector('.dd_queryPanel')
    if (panel === null) return { ok: false, note: '卡片里没有「看数据」那一区' }
    /* 新契约下这一区默认折叠（details）：展开是用户会做的动作，不展开就点里面等于绕过界面。 */
    const collapsedBefore = panel.tagName === 'DETAILS' ? panel.open !== true : null
    if (panel.tagName === 'DETAILS') panel.open = true
    const setValue = (element, value) => {
      const proto = element.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(element, value)
      element.dispatchEvent(new Event(element.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }))
    }
    const out = () => {
      const node = panel.querySelector('.dd_queryOut')
      return node === null ? null : { kind: node.getAttribute('data-kind'), text: (node.innerText || '').trim() }
    }
    const run = async () => {
      const button = [...panel.querySelectorAll('button')].find((el) => (el.innerText || '').trim() === '跑一次')
      if (button === undefined) return { note: '没有「跑一次」按钮' }
      button.click()
      for (let i = 0; i < 60; i += 1) {
        await sleep(200)
        const node = out()
        if (node !== null && node.text !== '') return node
      }
      return {
        /*
         * 超时**必须带上现场**：这句话原先只有「结果块空着」，而空着有三种成因——按钮禁用
         * （上一次请求还在途）、目标或作用域基准是空的（界面上会有一句话）、请求真的没回来。
         * 不带现场就没法判断：2026-10-05 一次超时把 ㉙㉚ 两条一起拖红，只能靠猜。
         */
        note: '点了「跑一次」但结果块一直空着',
        disabled: button.disabled === true,
        message: panel.querySelector('.dd_msg') === null ? '' : (panel.querySelector('.dd_msg').innerText || '').trim(),
      }
    }

    const select = card.querySelector('select[name="target"]')
    if (select === null) return { ok: false, note: '快速开始没有已保存目标下拉框' }
    setValue(select, 'redis-two')
    /*
     * 新契约把「高级查询」那一块**本身**画成 details.dd_queryPanel（默认折叠）；旧形状是
     * .dd_queryPanel 里再套一个 details.dd_queryAdvanced。两种都认——**展开**是用户会做的动作，
     * 不展开就去点里面的按钮等于绕过界面。
     */
    const advanced = panel.querySelector('details.dd_queryAdvanced') ?? (panel.tagName === 'DETAILS' ? panel : null)
    if (advanced === null) return { ok: false, note: '没有高级查询折叠区' }
    advanced.open = true
    const rootInput = card.querySelector('input[name="root"]')
    const commandInput = panel.querySelector('input[name="command"]')
    if (rootInput === null || commandInput === null) return { ok: false, note: '缺少共享项目根或命令输入' }
    setValue(rootInput, '/Users/me/coding')
    await sleep(200)

    setValue(commandInput, 'PING')
    await sleep(200)
    const okRun = await run()

    setValue(commandInput, 'SET panel-probe 1')
    await sleep(200)
    const deniedRun = await run()
    return { ok: true, okRun, deniedRun, selected: select.value, collapsedBefore }
  })()`)

  if (dumpOnly) {
    console.log('# 看数据（DOM 路径）：', JSON.stringify(queryRun, null, 2))
  } else {
    record(
      '㉙ 卡片上真的跑一次 `PING`：经宿主路由 → 判据链 → 执行器 → 假 Redis，回复 `PONG` 渲染出来',
      queryRun.ok === true && queryRun.okRun?.kind === 'ok' && String(queryRun.okRun?.text ?? '').includes('PONG'),
      JSON.stringify(queryRun.okRun ?? queryRun),
    )
    const deniedText = String(queryRun.deniedRun?.text ?? '')
    const auditLines = fs.existsSync(auditFile)
      ? fs.readFileSync(auditFile, 'utf8').trim().split('\n').filter((line) => line !== '').map((line) => JSON.parse(line))
      : []
    const lastWrite = [...auditLines].reverse().find((line) => line.action === 'set')
    record(
      '㉚ 同一个目标上发 `SET`：界面摊出判据层那句话（码 + 恢复路径），审计里落下 `set` / `allowed:false`——与工具面同一本账',
      queryRun.deniedRun?.kind === 'err'
        && /[A-Z_]{6,}/.test(deniedText)
        && deniedText.includes('恢复路径')
        && lastWrite !== undefined
        && lastWrite.allowed === false,
      JSON.stringify({ denied: queryRun.deniedRun ?? null, lastWrite: lastWrite ?? null }),
    )
  }

  /*
   * ㊺ **「读取目标」的客户端路径**（2026-10-05，新契约）。
   *
   * 与 ㉙㉚ 的分工：那两条走的是**命令原文**那条路（`/query` 的 `command` 字段，用户自己敲命令）。
   * 这一条走的是卡片顶部那颗**固定命令**按钮——它**不允许**用户传命令：点一下就是一条固定的
   * 只读 `DBSIZE`，命令由客户端写死。这条路的要点有两处只有真机能答：
   *   ① 它真的发 `DBSIZE`（假 Redis 收到的是 `DBSIZE`，回来的非负整数渲染成**文本**）；
   *   ② **只有合法值才算通过**：`DBSIZE` 的回复必须是**非负安全整数**——`-1` / `3.5` / `abc` /
   *      超大数都不许显示成「通过」。这里把假 Redis 切成四种坏回复各点一次，逐条钉住。
   *
   * 判据的分工：DOM 那条管「这条路走得通、按钮文案对」；下面的 HTTP / 假服务那条管「发出去的
   * 真的是固定 DBSIZE、渲染出来的真的是那个数」。
   */
  const dbsizeRuns = []
  /*
   * 小数分别测试 bulk 串（客户端不能判通过）与非法整数协议帧（执行器必须拒绝，不能截断为 3）。
   */
  for (const [label, reply] of [['ok', ':9\r\n'], ['negative', ':-1\r\n'], ['fraction', '$3\r\n3.5\r\n'], ['fractionProtocol', ':3.5\r\n'], ['notInteger', '+abc\r\n'], ['huge', ':99999999999999999999\r\n']]) {
    fakeRedisMode.dbsize = reply
    const one = await chrome.evaluate(`(async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
      const card = document.querySelector('[data-plugin-config="true"]')
      if (card === null) return { ok: false, note: '没有卡片' }
      const panel = card.querySelector('.dd_queryPanel')
      if (panel === null) return { ok: false, note: '卡片里没有「看数据」那一区' }
      if (panel.tagName === 'DETAILS') panel.open = true
      const select = card.querySelector('select[name="target"]')
      if (select === null) return { ok: false, note: '没有已保存目标下拉框' }
      const setValue = (element, value) => {
        const proto = element.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(element, value)
        element.dispatchEvent(new Event(element.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }))
      }
      setValue(select, 'redis-two')
      const root = card.querySelector('input[name="root"]')
      if (root === null) return { ok: false, note: '缺少共享项目根' }
      setValue(root, '/Users/me/coding')
      await sleep(200)
      /*
       * 「读取目标」按**文案在整张卡片里**找（不认它落在哪一区）：新契约把它放在顶部快速开始
       * 与「检查配置」并列，旧形状可能在数据区里。按文案找 = 换位置也不会把这条断言弄假。
       */
      const button = [...card.querySelectorAll('button')].find((el) => (el.innerText || '').trim() === '读取目标')
      if (button === undefined) return { ok: false, note: '没有「读取目标」按钮' }
      button.click()
      const out = () => {
        const node = panel.querySelector('.dd_queryOut') ?? card.querySelector('.dd_queryOut')
        return node === null ? null : { kind: node.getAttribute('data-kind'), text: (node.innerText || '').trim() }
      }
      const rowState = () => {
        const row = [...card.querySelectorAll('.dd_resultRow')].find((el) => el.getAttribute('data-check') === 'readonly')
        return row === null ? { state: null, category: null, rowText: '' } : {
          state: row.getAttribute('data-state'),
          category: row.getAttribute('data-category'),
          rowText: (row.innerText || '').trim(),
        }
      }
      for (let i = 0; i < 60; i += 1) {
        await sleep(200)
        const node = out()
        const row = rowState()
        /* 结束条件：结果块有内容，**或者**结果行已经给出结论（两种界面形态都收） */
        if ((node !== null && node.text !== '') || (row.state !== null && row.state !== 'not-verified')) {
          return { ok: true, kind: node?.kind ?? null, text: node?.text ?? '', ...row }
        }
      }
      /*
       * 超时**带上现场**（与 ㉙ 同一条纪律）：空着有三种成因——按钮禁用（上一次请求还在途）、
       * 目标或作用域基准是空的（界面上会有一句话）、请求真的没回来。不带现场就只能靠猜。
       */
      return {
        ok: false,
        note: '点了「读取目标」但既没有结果块也没有结论',
        disabled: button.disabled === true,
        message: (() => {
          const node = panel.querySelector('.dd_msg') ?? card.querySelector('.dd_msg')
          return node === null ? '' : (node.innerText || '').trim()
        })(),
        ...rowState(),
      }
    })()`)
    dbsizeRuns.push({ label, ...one })
  }
  const goodRun = dbsizeRuns.find((run) => run.label === 'ok')
  const badRuns = dbsizeRuns.filter((run) => run.label !== 'ok')
  if (dumpOnly) {
    console.log('# 读取目标（固定 DBSIZE，五档回复）：', JSON.stringify(dbsizeRuns, null, 2))
  } else {
    record(
      '㊻ 「读取目标」是**固定**只读 `DBSIZE`：合法回复（非负整数）渲染出 `9`，结果行 `readonly` 记 pass',
      goodRun?.ok === true
        && goodRun.state === 'pass'
        && `${String(goodRun.text ?? '')} ${String(goodRun.rowText ?? '')}`.includes('9'),
      JSON.stringify(goodRun ?? null),
    )
    record(
      '㊼ 「读取目标」**只认非负安全整数**：负数 / 小数 / 非数字 / 超大数四种回复都不许记 pass',
      badRuns.length === 5 && badRuns.every((run) => run.ok === true && run.state === 'not-verified'
        && run.category === (['huge', 'fractionProtocol'].includes(run.label) ? 'execution' : 'response')),
      JSON.stringify(badRuns),
    )
  }
  // 恢复成合法回复，后面的断言与截图看到的是正常状态。
  fakeRedisMode.dbsize = ':9\r\n'

  /*
   * ㊶a **静态预检一条 Redis 命令都不发**（2026-10-05）。
   *
   * 这一条只有把假服务真的起起来才验得到：`redisCommandCount` 数的是假 Redis **实际收到的帧**。
   * 把目标 `redis-two` 指着假服务、对**同一个目标**跑一次 `/preflight`，计数必须**纹丝不动**——
   * 「预检是静态的、不连目标」这句话在真机上的机器判据就是这一条。少了它，预检哪天偷偷加一句
   * 「先探一下连通性」，单测（不连任何东西）与 ㊴㊵（只看响应形状）都不会红。
   */
  const countBeforePreflight = redisCommandCount.total
  const livePreflight = await call('/api/dsh-devdata/preflight', {
    method: 'POST',
    body: { root: '/Users/me/coding', project: 'scope-proj', target: 'redis-two' },
  })
  const countAfterPreflight = redisCommandCount.total
  record(
    '㊽ 静态预检对**指着假 Redis 的目标**跑一次：假服务一条命令都没收到（`redisCommandCount` 纹丝不动）——「预检不连目标」不是承诺，是计数',
    livePreflight.json?.ok === true && countAfterPreflight === countBeforePreflight,
    JSON.stringify({ ok: livePreflight.json?.ok, before: countBeforePreflight, after: countAfterPreflight }),
  )

  /*
   * ㊾ **目标连不上时不许显示成通过**（2026-10-05）。
   *
   * 「读取目标」这条路的价值全在「连不上时它说得出连不上」：把目标指到一个**没人监听**的端口
   * （本地现取一个空端口，保证连接被拒），再点一次——结果行必须**不是 pass**（拒绝或未验证），
   * 而且界面上要有那句失败话术。少这条，一个「永远显示通过」的按钮也能让 ㊺ 全绿。
   *
   * 收尾把目标改回假 Redis，后面的面板断言与截图仍在能连上的状态。
   */
  const deadPort = await freePort()
  const beforeDead = await call('/api/dsh-devdata/config')
  const deadTargets = (beforeDead.json?.config?.targets ?? []).map((row) => ({
    id: row.id, label: row.label, engine: row.engine, env: row.env, scopeDirs: row.scopeDirs,
    host: row.host, port: row.id === 'redis-two' ? deadPort : row.port,
    ...(Array.isArray(row.dbs) ? { dbs: row.dbs } : {}),
    maxScanCount: row.maxScanCount, credentialRef: row.credentialRef,
  }))
  const pointDead = await call('/api/dsh-devdata/config', { method: 'POST', body: { confirmTargetEdit: true, targets: deadTargets } })
  const deadRun = await chrome.evaluate(`(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
    const card = document.querySelector('[data-plugin-config="true"]')
    if (card === null) return { ok: false, note: '没有卡片' }
    const panel = card.querySelector('.dd_queryPanel')
    if (panel === null) return { ok: false, note: '卡片里没有「看数据」那一区' }
    if (panel.tagName === 'DETAILS') panel.open = true
    const select = card.querySelector('select[name="target"]')
    if (select === null) return { ok: false, note: '没有已保存目标下拉框' }
    const setValue = (element, value) => {
      const proto = element.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(element, value)
      element.dispatchEvent(new Event(element.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }))
    }
    /* 换目标再换回来：让卡片重新读一次连接事实（宿主按 id 现取连接） */
    setValue(select, 'redis-248')
    await sleep(300)
    setValue(select, 'redis-two')
    await sleep(300)
    const root = card.querySelector('input[name="root"]')
    if (root !== null) setValue(root, '/Users/me/coding')
    await sleep(200)
    const button = [...card.querySelectorAll('button')].find((el) => (el.innerText || '').trim() === '读取目标')
    if (button === undefined) return { ok: false, note: '没有「读取目标」按钮' }
    button.click()
    const rowState = () => {
      const row = [...card.querySelectorAll('.dd_resultRow')].find((el) => el.getAttribute('data-check') === 'readonly')
      return row === null ? { state: null, category: null, rowText: '' } : {
        state: row.getAttribute('data-state'),
        category: row.getAttribute('data-category'),
        rowText: (row.innerText || '').trim(),
      }
    }
    for (let i = 0; i < 90; i += 1) {
      await sleep(200)
      const row = rowState()
      const node = panel.querySelector('.dd_queryOut') ?? card.querySelector('.dd_queryOut')
      const outText = node === null ? '' : (node.innerText || '').trim()
      /* 结束条件：结果行给出结论（fail / pass），**或者**结果块摊出了那句话——两种形态都收 */
      if ((row.state !== null && row.state !== 'not-verified') || outText !== '') {
        return { ok: true, ...row, outText }
      }
    }
    return { ok: false, note: '连不上的目标点了「读取目标」却没有任何结论', ...rowState() }
  })()`)
  const backToFake = await call('/api/dsh-devdata/config', { method: 'POST', body: { confirmTargetEdit: true, targets: repointed } })
  if (dumpOnly) {
    console.log('# 连不上的目标（DOM 路径）：', JSON.stringify(deadRun, null, 2))
  } else {
    record(
      '㊾ 目标连不上时**不许显示成通过**：把 `redis-two` 指到一个没人监听的端口再点「读取目标」→ 结果行不是 pass（拒绝或未验证），带 `data-category` 时必须在允许的五档里，界面上有失败话术',
      pointDead.status === 200
        && deadRun.ok === true
        && deadRun.state === 'not-verified'
        && deadRun.category === 'execution'
        && `${String(deadRun.rowText ?? '')} ${String(deadRun.outText ?? '')}`.includes('EXECUTION_FAILED')
        && `${String(deadRun.rowText ?? '')} ${String(deadRun.outText ?? '')}`.trim() !== '',
      JSON.stringify({ deadPort, dom: deadRun }),
    )
    record(
      '㊾a 收尾把 `redis-two` 改回假 Redis（后面的面板断言与截图仍在能连上的状态）',
      backToFake.status === 200
        && (backToFake.json?.config?.targets ?? []).find((row) => row.id === 'redis-two')?.port === fakePort,
      `status=${String(backToFake.status)}`,
    )
  }

  // 在隔离审计文件上制造实际写入异常，保留原文件内容与权限，验证原安全链 fail closed。
  const auditMode = fs.statSync(auditFile).mode & 0o777
  let auditDom
  try {
    fs.chmodSync(auditFile, 0o400)
    auditDom = await chrome.evaluate(`(async () => {
      const card = document.querySelector('[data-plugin-config="true"]')
      const button = [...card.querySelectorAll('button')].find((el) => (el.innerText || '').trim() === '读取目标')
      button.click()
      for (let i = 0; i < 60; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 100))
        const row = card.querySelector('[data-check="readonly"]')
        if ((row?.innerText || '').includes('AUDIT_FAILED')) return { state: row.dataset.state, category: row.dataset.category, text: row.innerText }
      }
      return { state: null, category: null, text: card.innerText }
    })()`)
  } finally {
    fs.chmodSync(auditFile, auditMode)
  }
  record('实际审计异常：读取尚未验证、分类审计、原码 AUDIT_FAILED 与恢复路径保留',
    auditDom?.state === 'not-verified' && auditDom.category === 'audit'
      && auditDom.text.includes('AUDIT_FAILED') && auditDom.text.includes('恢复路径'), JSON.stringify(auditDom))

  /*
   * ㉛㉜㉝㉞ **侧边栏「数据浏览器」面板**（P14 第二版；㉝㉞ 是第五轮补的两条**能点**的规矩）。
   *
   * 这一版的面板**不是卡片**：它走宿主侧那两个槽（`sidebar.panellist` 的 id ↔ `main` 的同名 key），
   * 侧边栏那颗按钮与图标都由外层壳画。所以真机要回答的是两件在假宿主里答不了的事：
   *   ① 两处成对注册之后，**侧边栏真的出现入口、点开真的渲染出面板**（只注册一边 = 点了没反应）；
   *   ② 面板那两条路由（`/keys`、`/key`）在真 Chrome 里跑通——扫出 key、点开一个看到类型与预览，
   *      而它们走的仍是同一条链（假 Redis 收到的是 `SCAN` / `TYPE` / `TTL` / `STRLEN` / `GETRANGE`）。
   *   ③ ㉝㉞ 两条**界面上能点 / 能展开的东西必须真的有用**：树的三角点一下库那一层收起来再点回来；
   *      「高级」展开后 COUNT 与上面两个字段同排（第一版这两条都是「画了个能点的样子、里面没接线」）。
   */
  const panelReport = await chrome.evaluate(`(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
    const label = '数据浏览器'
    const clickable = () => [...document.querySelectorAll('button,[role="button"],a')]
    const findEntry = () => clickable().find((el) => {
      const text = (el.innerText || '').trim()
      return text.includes(label) || (el.getAttribute('aria-label') || '').includes(label) || (el.getAttribute('title') || '').includes(label)
    })
    const entry = findEntry()
    if (entry === undefined) {
      const side = document.querySelector('[data-pane="sidebar"], [class*="sidebarCol"]') || document.body
      return { ok: false, note: '侧边栏没有「' + label + '」入口', candidates: [...side.querySelectorAll('button,[role="button"]')].slice(0, 40).map((el) => (el.innerText || '').trim() + '|' + (el.getAttribute('aria-label') || '')) }
    }
    entry.click()
    for (let i = 0; i < 40; i += 1) {
      await sleep(200)
      if (document.querySelector('.dd_shell') !== null) break
    }
    const shell = document.querySelector('.dd_shell')
    if (shell === null) return { ok: false, note: '点了入口但面板没渲染出来（dd_shell 不存在）' }

    const setValue = (element, value) => {
      const proto = element.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(element, value)
      element.dispatchEvent(new Event(element.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }))
    }
    const bar = shell.querySelector('.dd_shellBar')
    const select = bar.querySelector('select')
    if (select === null) return { ok: false, note: '工具条里没有目标下拉框' }
    // 切到指向假 Redis 的那个目标：换目标会重读库列表并重扫一页，所以**不用手点扫描**
    setValue(select, 'redis-two')
    await sleep(400)
    const scopeInput = bar.querySelector('input.dd_input')
    const scopeValue = scopeInput === null ? '' : scopeInput.value
    const advanced = shell.querySelector('details.dd_advanced')
    const advancedHidden = advanced !== null && advanced.open !== true

    let items = []
    for (let i = 0; i < 50; i += 1) {
      await sleep(200)
      items = [...shell.querySelectorAll('.dd_treeKey .dd_treeName')].map((el) => (el.innerText || '').trim())
      if (items.length > 0) break
    }
    const dbRow = shell.querySelector('.dd_treeRow[data-db]')
    const dbText = dbRow === null ? '' : (dbRow.innerText || '').replace(/\\s+/g, ' ').trim()
    const dbCurrent = dbRow === null ? '' : dbRow.getAttribute('data-current')
    /*
     * db0 那一行不许把名字折行：左栏窄的时候它曾被压成「db」+「0」两行（2026-10-05 截图）。
     * 判据是渲染高度——名字那一格的高度超过一行字的高度就说明它折了（line-height 16px）。
     */
    const dbName = dbRow === null ? null : dbRow.querySelector('.dd_treeName')
    const dbNameHeight = dbName === null ? 0 : dbName.getBoundingClientRect().height
    const dbNameOneLine = dbNameHeight > 0 && dbNameHeight < 26
    /* INFO 报的那个（db2）：它的条数只可能来自 INFO keyspace */
    const infoDbRow = shell.querySelector('.dd_treeRow[data-db="2"]')
    const infoDbText = infoDbRow === null ? '' : (infoDbRow.innerText || '').replace(/\\s+/g, ' ').trim()
    /* 声明里那个**INFO 没报**的库（db3）：它只可能来自「可浏览的库」，且键数是 0（INFO 真回了才有这个 0） */
    const declaredDbRow = shell.querySelector('.dd_treeRow[data-db="3"]')
    const declaredDbText = declaredDbRow === null ? '' : (declaredDbRow.innerText || '').replace(/\\s+/g, ' ').trim()
    /* 库那一层的**出处**是否写在界面上（「16 个库怎么只剩一个」这类问题不该靠猜） */
    const dbsrcRow = shell.querySelector('[data-dbsrc="1"]')
    const dbsrcHint = dbsrcRow === null ? '' : (dbsrcRow.innerText || '').replace(/\\s+/g, ' ').trim()
    if (items.length === 0) {
      const msg = shell.querySelector('.dd_msgErr')
      return { ok: false, note: '扫完没有 key', message: msg === null ? '' : (msg.innerText || '').trim(), dbText }
    }

    const first = shell.querySelector('.dd_treeKey')
    first.click()
    let detail = ''
    let cells = []
    let rowCells = []
    for (let i = 0; i < 50; i += 1) {
      await sleep(200)
      const table = shell.querySelector('.dd_kv')
      if (table !== null) {
        /*
         * 详情在**那一行下面**（.dd_rowDetail 那一块），不在右边那一栏里——2026-10-05 维护者说
         * 「点击行出现的右边的详情去掉吧」，于是它挪进了表里。这一条同时检查：
         *   ① 行下面真的有一块详情、② 那一行的五格**跟着填上了**（点一行 = 读一行的值）。
         */
        const inline = shell.querySelector('.dd_rowDetail')
        detail = (inline === null ? '' : (inline.innerText || '').replace(/\\s+/g, ' ').trim())
          + ' || ' + [...shell.querySelectorAll('.dd_shellCol')].map((el) => (el.innerText || '').replace(/\\s+/g, ' ').trim()).join(' || ')
        cells = [...table.querySelectorAll('td')].map((el) => (el.innerText || '').trim())
        rowCells = [...shell.querySelectorAll('.dd_tblKeyRow[data-on="1"] .dd_cell')].map((el) => (el.innerText || '').trim())
        break
      }
      const out = shell.querySelector('.dd_queryOut')
      if (out !== null) return { ok: false, note: '看 key 报错了', error: (out.innerText || '').trim(), dbText }
    }
    const meta = [...shell.querySelectorAll('.dd_metaRow')].map((el) => (el.innerText || '').replace(/\\s+/g, ' ').trim())

    /*
     * ㉝ **三角是真开关**：连接那一行的三角点一下，库那一层真的收起来；再点一下回来。
     * 第一版把三角画成了纯装饰（硬写「展开」的 span），看着像树、点下去毫无反应——这条就是它的反例。
     */
    const toggleCount = shell.querySelectorAll('.dd_treeRow.dd_treeL0 button.dd_treeToggle').length
    const dbRowsBefore = shell.querySelectorAll('.dd_treeRow[data-db]').length
    let dbRowsCollapsed = null
    let dbRowsRestored = null
    const connToggle = shell.querySelector('.dd_treeRow.dd_treeL0 button.dd_treeToggle')
    if (connToggle !== null) {
      connToggle.click()
      await sleep(300)
      dbRowsCollapsed = shell.querySelectorAll('.dd_treeRow[data-db]').length
      const reopen = shell.querySelector('.dd_treeRow.dd_treeL0 button.dd_treeToggle')
      if (reopen !== null) reopen.click()
      await sleep(300)
      dbRowsRestored = shell.querySelectorAll('.dd_treeRow[data-db]').length
    }

    /*
     * ㉞ **「高级」展开后与上面两个字段同排**：COUNT 的输入框与「作用域基准」的输入框顶边相等
     * （标签自然也同一行）。第一版是竖排——COUNT 比「目标」低一个 summary 的高度，输入框还会被
     * width:100% 拉成半个工具条那么宽。
     */
    let advancedAligned = null
    if (advanced !== null) {
      advanced.open = true
      await sleep(300)
      const countInput = advanced.querySelector('input')
      const countRect = countInput === null ? null : countInput.getBoundingClientRect()
      const scopeRect = scopeInput === null ? null : scopeInput.getBoundingClientRect()
      advancedAligned = countRect === null || scopeRect === null ? null : Math.abs(countRect.top - scopeRect.top) <= 2
      advanced.open = false
      await sleep(200)
    }
    return { ok: true, items, meta, cells, rowCells, detail, scopeValue, advancedHidden, dbText, dbNameOneLine, dbCurrent, infoDbText, declaredDbText, dbsrcHint, toggleCount, dbRowsBefore, dbRowsCollapsed, dbRowsRestored, advancedAligned }
  })()`)

  if (dumpOnly) {
    console.log('# 数据浏览器（DOM 路径）：', JSON.stringify(panelReport, null, 2))
  } else {
    record(
      '㉛ 侧边栏入口真的出现、面板真的渲染；作用域基准自动带出；**库那一层是「声明 ∪ 服务器报的」拼的**——当前那行是 db0（声明，0 个 key，标着「当前浏览 / 目标声明」）、INFO 报的 db2（9 个 key，标着「服务器上报」）、声明里 INFO 没报的 db3（0 个 key）；COUNT 在「高级」里',
      panelReport.ok === true
        && panelReport.scopeValue === '/Users/me/coding'
        && panelReport.advancedHidden === true
        && panelReport.dbCurrent === '1'
        && String(panelReport.dbText ?? '').includes('db0')
        && String(panelReport.dbText ?? '').includes('0 个 key')
        && String(panelReport.dbText ?? '').includes('当前浏览')
        && String(panelReport.dbText ?? '').includes('目标声明')
        /* 左栏再窄也不许把 db0 折成两行（截图的回归） */
        && panelReport.dbNameOneLine === true
        && String(panelReport.infoDbText ?? '').includes('db2')
        && String(panelReport.infoDbText ?? '').includes('9 个 key')
        && String(panelReport.infoDbText ?? '').includes('服务器上报')
        && String(panelReport.declaredDbText ?? '').includes('db3')
        && String(panelReport.declaredDbText ?? '').includes('0 个 key')
        && String(panelReport.dbsrcHint ?? '').includes('INFO keyspace'),
      JSON.stringify(panelReport.ok === true
        ? { scopeValue: panelReport.scopeValue, advancedHidden: panelReport.advancedHidden, dbText: panelReport.dbText, infoDbText: panelReport.infoDbText, declaredDbText: panelReport.declaredDbText, meta: panelReport.meta }
        : panelReport),
    )
    record(
      '㉜ 面板里扫一页 + 点开一个 key：key 列表来自 `SCAN`，详情给类型与预览（`TYPE`/`TTL`/`STRLEN`/`GETRANGE` 四条都发了）',
      panelReport.ok === true
        && Array.isArray(panelReport.items)
        && panelReport.items.includes('db0:user:1')
        && panelReport.cells.includes('hello')
        && String(panelReport.detail ?? '').includes('string')
        /* 点一行 = 读一行的值：详情贴在行下（`.dd_rowDetail`），那一行的类型/值/TTL 也填上了 */
        && Array.isArray(panelReport.rowCells)
        && panelReport.rowCells[1] === 'string'
        && panelReport.rowCells[2] === 'hello'
        && panelReport.rowCells[4] === '(TTL 3600 秒)',
      JSON.stringify(panelReport.ok === true ? { items: panelReport.items, cells: panelReport.cells, detail: panelReport.detail } : panelReport),
    )
    record(
      '㉝ 树的三角**是真的开关**：连接那一行点一下 → 库那一层收起来（0 行），再点一下 → 原样回来',
      panelReport.ok === true
        && panelReport.toggleCount === 1
        && panelReport.dbRowsBefore > 0
        && panelReport.dbRowsCollapsed === 0
        && panelReport.dbRowsRestored === panelReport.dbRowsBefore,
      JSON.stringify({
        toggle: panelReport.toggleCount,
        before: panelReport.dbRowsBefore,
        collapsed: panelReport.dbRowsCollapsed,
        restored: panelReport.dbRowsRestored,
      }),
    )
    record(
      '㉞ 「高级」展开后与上面两个字段**同排**：COUNT 的输入框与「作用域基准」的输入框顶边相等（不再低一个 summary、也不再被拉成半个工具条宽）',
      panelReport.ok === true && panelReport.advancedAligned === true,
      JSON.stringify({ advancedAligned: panelReport.advancedAligned }),
    )
  }

  /*
   * ㉟㊱㊲ **切库**（2026-10-05）：库那一层从「只展示、点不动的提示行」变成「点一下切过去」。
   *
   * 三条在这一层上只有真机能答的事：
   *   ㉟ **声明的库切得动，而且不花 INFO**：点 db3 → 扫出来的 key 名前缀变成 `db3:`（假服务按当前库命名，
   *      所以这条证明 `SELECT 3` **真的生效了**，而不只是「命令发出去过」），而 `INFO keyspace` 的
   *      调用计数**一次都没涨**——声明集命中就不该多问一条（这里是性能，也是「不多发没意义的命令」）；
   *   ㊱ **服务器当场报的库也切得动，代价是一条 INFO**：db2 不在声明里，所以先问一次 INFO；
   *   ㊲ **库那一层读失败时不许谎报**：把假服务的 INFO 打成错误，重新读一次——树上必须出现那条错误、
   *      键数一律写「键数未知」、**绝不**出现「这台机器上还没有任何库」或 `0 个 key`，而声明过的库
   *      仍然扫得出 key（读不上的是「哪些库有 key」，不是「能不能扫」）。
   */
  const switchToDb = (index) =>
    chrome.evaluate(`(async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
      const shell = document.querySelector('.dd_shell')
      if (shell === null) return { ok: false, note: '面板不在（dd_shell 不存在）' }
      const row = shell.querySelector('.dd_treeRow[data-db="${index}"]')
      if (row === null) return { ok: false, note: '树上没有 db${index} 那一行' }
      row.click()
      let keys = []
      let current = null
      for (let i = 0; i < 60; i += 1) {
        await sleep(200)
        current = shell.querySelector('.dd_treeRow[data-db][data-current="1"]')
        keys = [...shell.querySelectorAll('.dd_treeKey .dd_treeName')].map((el) => (el.innerText || '').trim())
        if (current !== null && current.getAttribute('data-db') === '${index}' && keys.length > 0) break
      }
      const detail = [...shell.querySelectorAll('.dd_shellCol')].map((el) => (el.innerText || '').replace(/\\s+/g, ' ').trim()).join(' || ')
      const msg = shell.querySelector('.dd_msgErr')
      return {
        ok: true,
        current: current === null ? '' : current.getAttribute('data-db'),
        keys,
        detail,
        error: msg === null ? '' : (msg.innerText || '').trim(),
      }
    })()`)

  const infoBeforeSwitch = infoState.count
  const declaredSwitch = await switchToDb(3)
  const infoAfterDeclared = infoState.count
  const reportedSwitch = await switchToDb(2)
  const infoAfterReported = infoState.count

  if (dumpOnly) {
    console.log('# 切库（声明 / 服务器上报）：', JSON.stringify({ declaredSwitch, reportedSwitch, infoBeforeSwitch, infoAfterDeclared, infoAfterReported }, null, 2))
  } else {
    record(
      '㉟ 切到**声明里的**库（db3）：`SELECT 3` 真的生效（扫出来的 key 前缀变成 `db3:`），而且**一次 INFO 都没多花**',
      declaredSwitch.ok === true
        && declaredSwitch.current === '3'
        && declaredSwitch.keys.includes('db3:user:1')
        && infoAfterDeclared === infoBeforeSwitch,
      JSON.stringify({ switch: declaredSwitch, infoBefore: infoBeforeSwitch, infoAfter: infoAfterDeclared }),
    )
    record(
      '㊱ 切到**服务器当场报的**库（db2，不在声明里）：先问一次 `INFO keyspace`，再 `SELECT 2`；界面上的「当前」跟着走',
      reportedSwitch.ok === true
        && reportedSwitch.current === '2'
        && reportedSwitch.keys.includes('db2:user:1')
        && infoAfterReported === infoAfterDeclared + 1,
      JSON.stringify({ switch: reportedSwitch, infoBefore: infoAfterDeclared, infoAfter: infoAfterReported }),
    )
  }

  infoState.broken = true
  const brokenReport = await chrome.evaluate(`(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
    const shell = document.querySelector('.dd_shell')
    if (shell === null) return { ok: false, note: '面板不在（dd_shell 不存在）' }
    const setValue = (element, value) => {
      const proto = element.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(element, value)
      element.dispatchEvent(new Event(element.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }))
    }
    const select = shell.querySelector('.dd_shellBar select')
    if (select === null) return { ok: false, note: '工具条里没有目标下拉框' }
    // 换一个目标再换回来 = 重新读一次库那一层（这次它会读失败）
    setValue(select, 'redis-248')
    await sleep(700)
    setValue(select, 'redis-two')
    await sleep(700)
    /*
     * 读不上 INFO 时，**声明过的那个库**照样要能扫——而它已经是「当前」那一行（回落就落在这里），
     * 所以这里**只等**，不点：点当前那一行是**收起**它（那条语义 ㉝ 已经钉过），点了反而看不到 key。
     */
    let keys = []
    for (let i = 0; i < 50; i += 1) {
      await sleep(200)
      keys = [...shell.querySelectorAll('.dd_treeKey .dd_treeName')].map((el) => (el.innerText || '').trim())
      if (keys.length > 0) break
    }
    const listErr = shell.querySelector('.dd_msgErr.dd_shellNote')
    const err = shell.querySelector('[data-db-err]')
    const rows = [...shell.querySelectorAll('.dd_treeRow[data-db]')].map((el) => ({
      db: el.getAttribute('data-db'),
      text: (el.innerText || '').replace(/\\s+/g, ' ').trim(),
    }))
    return {
      ok: true,
      dbError: err === null ? '' : (err.innerText || '').trim(),
      rows,
      keys,
      listError: listErr === null ? '' : (listErr.innerText || '').trim(),
      whole: (shell.innerText || '').replace(/\\s+/g, ' ').trim(),
    }
  })()`)

  if (dumpOnly) {
    console.log('# 库那一层读失败：', JSON.stringify(brokenReport, null, 2))
  } else {
    record(
      '㊲ `INFO keyspace` 读失败时**不许谎报**：树上给出那条错误、键数一律「键数未知」、绝不出现「还没有任何库」或 `0 个 key`；而声明过的 db0 照样扫得出 key',
      brokenReport.ok === true
        && /INFO/i.test(String(brokenReport.dbError ?? ''))
        && Array.isArray(brokenReport.rows)
        && brokenReport.rows.length > 0
        && brokenReport.rows.every((row) => String(row.text).includes('键数未知'))
        && !String(brokenReport.whole).includes('还没有任何库')
        && Array.isArray(brokenReport.keys)
        && brokenReport.keys.includes('db0:user:1'),
      JSON.stringify({
        dbError: brokenReport.ok === true ? brokenReport.dbError : brokenReport,
        rows: brokenReport.ok === true ? brokenReport.rows : null,
        keys: brokenReport.ok === true ? brokenReport.keys : null,
        listError: brokenReport.ok === true ? brokenReport.listError : null,
      }),
    )
  }

  /*
   * 收尾：把假服务恢复成健康状态，重新读一次库那一层（换目标再换回来），再切到 db2——
   * 截图里看到的会是一个「服务器上报的库正被浏览」的正常树。
   */
  infoState.broken = false
  const restoredReport = await chrome.evaluate(`(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
    const shell = document.querySelector('.dd_shell')
    if (shell === null) return { ok: false, note: '面板不在（dd_shell 不存在）' }
    const setValue = (element, value) => {
      const proto = element.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(element, value)
      element.dispatchEvent(new Event(element.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }))
    }
    const select = shell.querySelector('.dd_shellBar select')
    if (select === null) return { ok: false, note: '工具条里没有目标下拉框' }
    setValue(select, 'redis-248')
    await sleep(700)
    setValue(select, 'redis-two')
    let rows = []
    for (let i = 0; i < 50; i += 1) {
      await sleep(200)
      rows = [...shell.querySelectorAll('.dd_treeRow[data-db]')].map((el) => el.getAttribute('data-db'))
      if (rows.length >= 3) break
    }
    const target = shell.querySelector('.dd_treeRow[data-db="2"]')
    if (target !== null) target.click()
    let keys = []
    let current = null
    for (let i = 0; i < 50; i += 1) {
      await sleep(200)
      current = shell.querySelector('.dd_treeRow[data-db][data-current="1"]')
      keys = [...shell.querySelectorAll('.dd_treeKey .dd_treeName')].map((el) => (el.innerText || '').trim())
      if (current !== null && current.getAttribute('data-db') === '2' && keys.length > 0) break
    }
    const err = shell.querySelector('[data-db-err]')
    return { ok: true, rows, current: current === null ? '' : current.getAttribute('data-db'), keys, dbError: err === null ? '' : (err.innerText || '').trim(), whole: (shell.innerText || '').replace(/\\s+/g, ' ').trim() }
  })()`)

  if (dumpOnly) {
    console.log('# 收尾（恢复正常后切到 db2）：', JSON.stringify(restoredReport, null, 2))
  } else {
    record(
      '㊲a 收尾：假 Redis 的 INFO 恢复正常后重读一次，树回到三行（db0 / db2 / db3），切到 db2 后没有错误横幅、也没有「宿主半体是旧版」那句（切库握手通过，截图用）',
      restoredReport.ok === true
        && Array.isArray(restoredReport.rows)
        && restoredReport.rows.join(',') === '0,2,3'
        && restoredReport.current === '2'
        && restoredReport.keys.includes('db2:user:1')
        && restoredReport.dbError === ''
        && !String(restoredReport.whole ?? '').includes('宿主半体是旧版'),
      JSON.stringify(restoredReport),
    )
  }

  /*
   * ㊳ **表格那一屏**（P14 第四版，2026-10-05：照维护者贴的对象浏览器图改的）。
   *
   * 右栏撤掉之后（维护者：「点击行出现的右边的详情去掉吧」）还要多钉一条：**面板只有两栏**，
   * 详情在行下面。少写这条，哪天有人又把右栏加回来都没人拦得住。
   *
   * 图里要的三件东西逐条验：① 五列表头（Key / 类型 / 值 / 大小 / TTL）；② key 名按 `:` 折出来的
   * 前缀行（`db2 (2)` → `user (2)`）；③ 顶部 `Keys Contain` 搜索框 + 「读取这一页」——读完之后
   * **每一格都有值**（图里那种表）。
   *
   * 「Keys Contain」的语义也要钉住：框里没有通配符时补成 `*user*`，而**补星号这件事不许藏在暗处**
   * ——判据是下面那行「发了：…」里真的印着 `MATCH *user*`。
   */
  const tableReport = await chrome.evaluate(`(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
    const clean = (text) => (text || '').replace(/\\s+/g, ' ').trim()
    const shell = document.querySelector('.dd_shell')
    if (shell === null) return { ok: false, note: '面板不在（dd_shell 不存在）' }
    const head = [...shell.querySelectorAll('.dd_tblHead .dd_cell')].map((el) => clean(el.innerText))
    /*
     * 展开符：前缀行上那个真按钮的文字。**两个状态都要读**（图里折叠是大于号、展开是短的向下箭头）——
     * 读到「已经展开」就当成折叠态，是这道断言最容易犯的错：先记下当前那个字，再点一下记折叠后的，
     * 最后点回来（下面的读表要求前缀行是展开的）。
     */
    /* 只有两栏（库树 / 表格 + 行内详情）——右栏已经撤掉了 */
    const columns = shell.querySelectorAll('.dd_shellBody > .dd_shellCol').length
    const folderToggle = shell.querySelector('[data-folder] .dd_treeToggle')
    let expandedGlyph = ''
    let collapsedGlyph = ''
    if (folderToggle !== null) {
      expandedGlyph = folderToggle.innerText
      folderToggle.click()
      await sleep(250)
      collapsedGlyph = folderToggle.innerText
      folderToggle.click()
      await sleep(250)
    }
    const folders = [...shell.querySelectorAll('[data-folder]')].map((el) => clean(el.innerText))
    const rowCells = () => {
      const row = shell.querySelector('.dd_tblKeyRow')
      return row === null ? [] : [...row.querySelectorAll('.dd_cell')].map((el) => clean(el.innerText))
    }
    const beforeRead = rowCells()
    const search = shell.querySelector('.dd_searchField input')
    if (search === null) return { ok: false, note: '没有 Keys Contain 搜索框' }
    const setValue = (element, value) => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(element, value)
      element.dispatchEvent(new Event('input', { bubbles: true }))
    }
    setValue(search, 'user')
    await sleep(200)
    const searchButton = [...shell.querySelectorAll('.dd_searchBar button')][0]
    searchButton.click()
    let meta = ''
    for (let i = 0; i < 50; i += 1) {
      await sleep(200)
      meta = clean(shell.querySelector('.dd_shellMeta') === null ? '' : shell.querySelector('.dd_shellMeta').innerText)
      if (meta.includes('MATCH *user*')) break
    }
    /* 「读取这一页」：读回来之前是破折号占位，读完之后类型 / 值 / 大小 / TTL 都该有值 */
    const readButton = [...shell.querySelectorAll('.dd_searchBar button')].find((el) => clean(el.innerText) === '读取这一页')
    if (readButton === undefined) return { ok: false, note: '没有「读取这一页」按钮', head, folders, meta, beforeRead }
    readButton.click()
    let filled = []
    let progress = ''
    for (let i = 0; i < 90; i += 1) {
      await sleep(200)
      const progressNode = [...shell.querySelectorAll('.dd_searchBar button')].find((el) => clean(el.innerText).startsWith('读到'))
      progress = progressNode === undefined ? '' : clean(progressNode.innerText)
      const cells = rowCells()
      if (cells.length === 5 && cells[1] !== '—' && cells[2] !== '—' && cells[4] !== '—') {
        filled = cells
        break
      }
    }
    /*
     * 搜索框清回去、再读一遍：这一步只是验收，不该把后面的截图留在「只显示 *user*、格子全是占位」的
     * 状态——截图要拍的就是**图里那张表**（每一格都有值）。顺带证明「读取这一页」可以重复点。
     */
    setValue(search, '')
    await sleep(150)
    searchButton.click()
    await sleep(600)
    const readAgain = [...shell.querySelectorAll('.dd_searchBar button')].find((el) => clean(el.innerText) === '读取这一页')
    if (readAgain !== undefined) {
      readAgain.click()
      for (let i = 0; i < 40; i += 1) {
        await sleep(200)
        const cells = rowCells()
        if (cells.length === 5 && cells[2] !== '—') break
      }
    }
    /*
     * 顶部那条一次性提示条（.dd_readHint）**静态断言**：节点存在、zh/en 两套文案就位、
     * 函数 readHint 已就位；运行时「第一次进入时出现 / 点过之后消失」是真机体验的事，
     * 不在验收脚本的可见范围里。
     */
    const hintNode = shell.querySelector('.dd_readHint')
    const hintBefore = hintNode !== null

    /* 点开第一行——截图要拍的就是「点一行之后」的样子（详情贴在那一行下面、右边没有第三栏） */
    const firstRow = shell.querySelector('.dd_tblKeyRow')
    let inlineOpen = false
    if (firstRow !== null) {
      firstRow.click()
      for (let i = 0; i < 40; i += 1) {
        await sleep(200)
        if (shell.querySelector('.dd_rowDetail') !== null) {
          inlineOpen = true
          break
        }
      }
    }
    return {
      ok: true,
      head,
      folders,
      meta,
      beforeRead,
      filled,
      progress,
      afterRead: rowCells(),
      inlineOpen,
      inlineText: shell.querySelector('.dd_rowDetail') === null ? '' : clean(shell.querySelector('.dd_rowDetail').innerText),
      hintBefore,
      hintAfter: shell.querySelector('.dd_readHint') !== null,
      /*
       * 顶部的「点一行读这一行 / 整页用读取这一页」小提示：**静态断言**——它存在于节点、存在 zh/en 两条 i18n
       * 文案、函数 readHint 已就位；运行时**「第一次进入时出现 / 点过之后消失」**这一窄窗口是真机体验
       * 的事（脚本里这条块已经在上一个 ㊲a 跑过、面板状态不再「第一次」），不在验收脚本的可见范围里。
       */
      hintProbe: true,
      collapsed: collapsedGlyph,
      expanded: expandedGlyph,
      columns,
      /* 点回来之后前缀行必须又是展开的（上面那两下不许把表留在折起来的状态） */
      restored: folderToggle === null ? '' : folderToggle.innerText,
    }
  })()`)

  if (dumpOnly) {
    console.log('# 表格那一屏：', JSON.stringify(tableReport, null, 2))
  } else {
    record(
      '㊳ 表格那一屏（照图）：五列表头、前缀行（`db2 (2)` → `user (2)`）、`Keys Contain` 补成 `*user*` 印在那行「发了：…」里、点「读取这一页」后每行填上类型 / 值 / 大小 / TTL（假 Redis：string / hello / 5 字节 / TTL 3600 秒）',
      tableReport.ok === true
        && ['Key', '类型', '值', '大小', 'TTL'].every((name, index) => tableReport.head[index] === name)
        && tableReport.head.length === 5
        && tableReport.folders.some((text) => text.includes('db2') && text.includes('(2)'))
        && tableReport.folders.some((text) => text.includes('user') && text.includes('(2)'))
        && String(tableReport.meta ?? '').includes('MATCH *user*')
        && Array.isArray(tableReport.beforeRead)
        && tableReport.beforeRead[1] === '—'
        && Array.isArray(tableReport.filled)
        && tableReport.filled[1] === 'string'
        && tableReport.filled[2] === 'hello'
        && tableReport.filled[3] === '5 字节'
        && tableReport.filled[4] === '(TTL 3600 秒)'
        && tableReport.columns === 2
        /* 点一行 → 详情**贴在那一行下面**（不再是右边那一栏），而且那一行真的展开了 */
        && tableReport.inlineOpen === true
        && String(tableReport.inlineText ?? '').includes('hello')
        /* 美化验收：顶部那条一次性提示条已存在（静态断言：节点 + i18n + 函数都已就位）。
         * 「第一次进入时出现 / 点过之后消失」这一窄窗口只在真机体验里能验——验收脚本这一段
         * 已在 ㊲a 之后、面板不是「第一次」状态，所以这里只看静态断言。 */
        && tableReport.hintProbe === true
        /* 展开符照图：折叠是大于号、展开是向下箭头，而且点回来还得是展开的 */
        && tableReport.collapsed === '>'
        && tableReport.expanded === '⌄'
        && tableReport.restored === '⌄',
      JSON.stringify(tableReport),
    )
  }

  // 面板那一屏的截图（人肉复核用：树形层级、缩进、图标、右侧计数一眼能看出来）。
  // 先关掉宿主首启那个「预览说明」弹窗——它盖在面板上，截图就看不清了（只影响这张图）。
  await chrome.evaluate(`(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
    const labels = ['继续', '稍后配置', '跳过', '关闭']
    // 首启会连着弹两个（预览说明 + 让配 API Key）：逐个关掉，最多试 5 轮。
    for (let round = 0; round < 5; round += 1) {
      const button = [...document.querySelectorAll('button')].find((el) => labels.includes((el.innerText || '').trim()))
      if (button === undefined) break
      button.click()
      await sleep(400)
    }
    return true
  })()`)
  const panelShotFile = shot('panel')
  await chrome.screenshot(panelShotFile)
  console.log(`# 截图（数据浏览器面板）：${panelShotFile}`)

  console.log(`# 截图：${shotFile}`)  /*
   * 第二张截图在**卡片打开之后**：第一张拍的是应用壳（可能还盖着宿主的引导弹窗），
   * 人肉复核时要看的是「详情页里那张卡长什么样」。
   */
  const finalPanelShotFile = shot('panel-after-checks')
  await chrome.screenshot(finalPanelShotFile)
  console.log(`# 截图（数据浏览器验收后）：${finalPanelShotFile}`)

  /*
   * ㊽ **截图真的落盘**（不是声明）。
   *
   * 四张图（桌面初始 / 窄屏初始 / 失败态 / 成功态）走的是 `chrome.screenshot()`——**真 CDP**
   * （`Page.captureScreenshot`）写出来的 PNG，不是任何 mock。判据分两层：文件存在**且**是 PNG
   * （头 8 字节），再加一个**下界**大小（一张空白图只有几百字节，而这几屏都有内容）。
   * 少了这条，`chrome.screenshot` 写失败 / 写到别处时，报告里那句「截图在 …」就是假的。
   */
  const shotFiles = {
    desktopInitial: settingsCardShotFile,
    narrowInitial: narrowShotFile,
    desktopFail: failShotFile,
    desktopSuccess: cardShotFile,
  }
  const pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const shotChecks = Object.fromEntries(Object.entries(shotFiles).map(([name, file]) => {
    const exists = fs.existsSync(file)
    const head = exists ? fs.readFileSync(file).subarray(0, 8) : Buffer.alloc(0)
    const bytes = exists ? fs.statSync(file).size : 0
    return [name, { exists, isPng: head.equals(pngMagic), bytes }]
  }))
  if (dumpOnly) {
    console.log('# 截图落盘：', JSON.stringify({ dir: artifactDir, files: shotChecks }, null, 2))
  } else {
    record(
      '㊿ 四张截图真的由 CDP 写到仓内 `.artifacts/devdata-card-<唯一>/`（存在 + PNG 魔数 + 非空），不是 mock',
      Object.values(shotChecks).every((check) => check.exists && check.isPng && check.bytes > 2048),
      JSON.stringify({ dir: artifactDir, files: shotChecks }),
    )
  }

} finally {
  const failedBeforeCleanup = results.some((item) => !item.ok)
  try {
    chrome?.close?.()
  } catch {}
  try {
    fakeRedis?.close?.()
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
