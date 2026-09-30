/**
 * `@hyzyn/dsh-codegraph` 的**真浏览器 UI** 验证：自起一个隔离宿主，用真 Chrome（CDP）
 * 把插件的配置卡片真的渲染一遍。
 *
 * > ✅ **2026-09-30 起是绿的**：本脚本以 `--mode full` 调 `verify-client-ui.mjs`，那条链上的四处
 * > 旧选择器口径已在当日修好（行文案改全包名、行级 `配置` 入口被内联卡片 `[data-plugin-config]`
 * > 取代、侧边栏「终端」变成 `div[role=button]`、UI12 的设置面板定位）——实测
 * > **18 PASS / 1 WARN / 0 FAIL**（唯一的 WARN 是沙箱里 `posix_openpt` 被拒，见
 * > [docs/agent-real-test.md § 三条硬约束 ②](../docs/agent-real-test.md)）。
 * > 本脚本自己那半边（自起隔离宿主、抓带 token 的 URL、「真实 DSH_HOME 补丁逐字节未变」的自证）
 * > 照旧全绿；修复细节与新旧口径对照见 `verify-client-ui.mjs` 文件头。
 *
 * 为什么需要它（它补的是前三个脚本都够不到的一层）：
 *
 *   | 脚本 | 层次 | 够不到的地方 |
 *   | --- | --- | --- |
 *   | `verify-codegraph-agent-scope.mjs` | 机制 | 假 agent、不跑真 `apply()` |
 *   | `verify-codegraph-agent-integration.mjs` | 集成 | 真插件 + 真 `agent/created`，但**不渲染 UI** |
 *   | `verify-codegraph-host-contract.mjs` | 路由/开关 | 真宿主 25 条路由，但只断言「产物可供给」，**不执行浏览器里的 React** |
 *   | `preview-card.mjs` + `preview-card.test.ts` | 卡片结构 | 离线渲染（假 React）——测得到 DOM 结构与 CSS，测不到**真 React + 宿主主题 + 插槽布局** |
 *   | **本脚本** | **真浏览器** | —— |
 *
 * 这一层是仓库自己的历史教训逼出来的：codegraph CG37（样式引用计数跨代失效）与 codegraph CG44（工具栏被裁）
 * 都是**只有真浏览器才暴露**的问题，离线预览与单测全绿。
 *
 * 做法：把 `scripts/verify-client-ui.mjs`（已有的通用 UI 验证器，其 UI8 逐插件断言
 * 「配置页可达 / 两视图渲染 / 有控件 / 不新增错误」）跑在**我们自起的隔离宿主**上：
 *
 *   - 宿主用隔离 `DSH_HOME`（拷一份 profile），端口独立 → **不碰用户正在跑的实例**；
 *   - 从宿主 stdout 抓带 launch token 的 URL（宿主自己的鉴权要它）；
 *   - 跑完杀掉宿主、删临时目录。
 *
 * 用法：
 *   node scripts/verify-codegraph-client-ui.mjs [--profile test] [--port 3110] [--shots 目录]
 */
import { spawn } from 'node:child_process'
import { existsSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createLiveHarness, verifyRealPatchUnchanged } from './lib/live-harness.mjs'

const argv = process.argv.slice(2)
const flag = (name) => {
  const index = argv.indexOf(name)
  return index === -1 ? undefined : argv[index + 1]
}
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const profile = flag('--profile') ?? 'test'
const port = Number(flag('--port') ?? 3110)
const shotDir = flag('--shots')
/** 报告路径：`verify-client-ui.mjs` 会把 consoleErrors / exceptions 的**原文**写进去，
 *  只看 stdout 的话失败行只有一个计数，指不到是什么错。 */
const reportPath = flag('--report')
const dshBin = flag('--dsh-bin') ?? 'dsh'

/**
 * 隔离引导统一在 [`scripts/lib/live-harness.mjs`](./lib/live-harness.mjs)（临时目录 + 隔离
 * `DSH_HOME` + 「先清空目标再拷」的 profile 播种 + 补丁快照），五个 codegraph 真机脚本共用一份。
 */
const harness = createLiveHarness({ prefix: 'cg-client-ui-', profile })
const { workDir } = harness

/**
 * 卡片要指向一个**真有索引**的项目。
 *
 * 不能用「临时目录 + 空 codegraph.db」凑数：那是假索引，真 CLI 跑 `status --json` 会失败，
 * `/api/dsh-codegraph/status` 按设计回 500，浏览器控制台于是记一条
 * 「Failed to load resource: 500」——UI8 判「本次新增错误 1」而红。
 * 我第一版就是这么写的，红得很有误导性：看起来像插件的 bug，其实是夹具的。
 *
 * 默认指向本仓库（它自己有 `.codegraph/`），只读用途；也可用 `--project` 指定。
 */
const projectDir = flag('--project') ?? repoRoot
if (!existsSync(join(projectDir, '.codegraph'))) {
  console.error(`崩溃：${projectDir} 没有 .codegraph/ 索引——本脚本要求一个**真索引**的项目（见注释）。`)
  process.exit(1)
}

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

/**
 * 把被测 profile 拷进隔离 home：`harness.syncProfile()`。
 * **它先清空目标**：本脚本只拷一次，但沿用 indexforce 的教训（codegraph CG48）——往已存在的
 * 目标上拷时，里面残留的符号链接会指回源树，`cpSync` 报 "Cannot copy X to a subdirectory of self"。
 */

let host
let exitCode = 1
try {
  harness.syncProfile()
  host = spawn(dshBin, ['--profile', profile, '--patch', overlay], {
    stdio: ['ignore', 'pipe', 'pipe'],
    // 隔离 DSH_HOME 由 harness 显式覆盖（codegraph CG45）
    env: harness.hostEnv(),
  })
  let stdout = ''
  let stderr = ''
  host.stdout.on('data', (chunk) => { stdout += String(chunk) })
  host.stderr.on('data', (chunk) => { stderr += String(chunk) })

  // 宿主把「带 launch token 的 URL」打在 stdout（dsh web: http://127.0.0.1:PORT/?token=…）
  const authenticatedUrl = await new Promise((resolve, reject) => {
    const deadline = Date.now() + 60_000
    const tick = () => {
      const matched = /dsh web: (\S+)/.exec(stdout)
      if (matched !== null) return resolve(matched[1])
      if (host.exitCode !== null) return reject(new Error(`宿主提前退出；stderr=${stderr.slice(-400)}`))
      if (Date.now() > deadline) return reject(new Error(`等不到启动 URL；stdout=${stdout.slice(-300)} stderr=${stderr.slice(-300)}`))
      setTimeout(tick, 200)
    }
    tick()
  })

  const url = new URL(authenticatedUrl)
  const token = url.searchParams.get('token') ?? ''
  const baseUrl = url.origin
  console.log(`# 隔离宿主已就绪：${baseUrl}（token 已取得，${String(token.length)} 字符）`)
  console.log(`# 临时项目：${projectDir}\n`)

  // 交给已有的通用 UI 验证器：它的 UI8 会逐插件打开配置页并断言渲染
  const child = spawn(process.execPath, [
    join(repoRoot, 'scripts', 'verify-client-ui.mjs'),
    '--url', baseUrl,
    '--token', token,
    // full = 应用壳（UI1-6）+ 逐插件配置页（UI7-9）。UI7-9 才是「卡片真的渲染出来了」，
    // 只在 cards/full 模式下跑（boot 模式到 UI6 就结束）。
    '--mode', 'full',
    // 受限环境（含 DSH 文件沙箱）里 Chrome 自己的 sandbox 起不来，必须关掉才能连上 CDP；
    // 否则表现是 `Runtime.enable 超时`，完全指不到真因。
    '--chrome-arg', '--no-sandbox',
    ...(shotDir === undefined ? [] : ['--shot-dir', shotDir]),
    ...(reportPath === undefined ? [] : ['--report', reportPath]),
  ], { stdio: 'inherit' })
  exitCode = await new Promise((resolve) => child.on('exit', (code) => resolve(code ?? 1)))
} catch (error) {
  console.error(`崩溃：${error instanceof Error ? error.message : String(error)}`)
  exitCode = 1
} finally {
  try { host?.kill('SIGTERM') } catch { /* 已退 */ }
  await new Promise((resolve) => setTimeout(resolve, 800))
  try { host?.kill('SIGKILL') } catch { /* 已退 */ }

  // 收尾自证：真实补丁逐字节未变（与另几个真机脚本同款）
  const realPatchCheck = verifyRealPatchUnchanged(harness.patch)
  console.log(`${realPatchCheck.unchanged ? 'PASS' : 'FAIL'}  真实 DSH_HOME 的 cordis.patch.yml 未被改动`)
  console.log(`      ${realPatchCheck.path}（${realPatchCheck.unchanged ? '逐字节一致' : '❌ 被改动了'}）`)
  if (!realPatchCheck.unchanged) exitCode = 1
  harness.cleanup()
}
process.exit(exitCode)
