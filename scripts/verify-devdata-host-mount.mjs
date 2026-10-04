#!/usr/bin/env node
/**
 * 真宿主挂载验收（`packages/devdata` 的验证脚本；**脚本在仓根，守卫在包内**——与 codegraph 的 5 个同款）：**真 DSH 宿主 + 真 profile 组合**，
 * 验的是「这个包能不能作为插件被装上、挂上、并把工具注册进工具面」。
 *
 * ## 它验什么（三条，都是只有真宿主能回答的）
 *
 * 1. **可安装**：`dsh plugin add link:<包目录>` 之后，`--dump-config` 的组合结果里有
 *    `@hyzyn/dsh-devdata` —— 没有就是被兼容性闸门跳过了（peer 范围不符那种，本地一切正常）；
 * 2. **挂得上、配置真的交下来了**：启动日志里出现
 *    `[dsh-devdata] mounted (enabled=true, targets=1, ...)`；
 * 3. **工具真的注册进了工具面**：`[dsh-devdata] agent tools registered (...)` 里的名字**恰好**是
 *    命令原文形态该有的**五个**（四条引擎入口 / 自证项 + 清单驱动的 `devdata_verify`），且**没有**
 *    任何一个结构化动作名（`devdata_query` / `devdata_set` …）
 *    ——「跑起来必失败的工具不注册」这条判据在真宿主上也成立。
 *
 * 它**不**连真 Redis（那由 `test/redis-real-machine.test.ts` 的门控用例覆盖）。目标配的是
 * `127.0.0.1:1`：本脚本只关心注册面，不关心链路。
 *
 * ## 它怎么保证不碰你的东西（三条，与 `docs/agent-real-test.md` 同口径）
 *
 * - **独立 `DSH_HOME`**：profile 建在 `mkdtemp('dsh-devdata-mount-')` 里的 `dsh-home`，
 *   全程只读真实 `~/.dsh`（只取一份 `cordis.patch.yml` 快照，收尾逐字节比对自证未变）；
 * - **临时资源带可识别前缀**：跑完删掉自己的临时目录；宿主的带外授权落点
 *   （`DSH_KIT_HOME`）也重指到临时目录里，不写真实的 `dsh-kit/`；
 * - **独立端口**：现选一个空闲口，不碰你正在用的宿主。
 *
 * 没装 `dsh` 时 **SKIP**（退出 0，与本仓其余真机脚本同口径；`--strict` 视为失败）。
 *
 * ## 用法
 *
 * ```sh
 * node scripts/verify-devdata-host-mount.mjs
 * node scripts/verify-devdata-host-mount.mjs --keep    # 失败时保留临时目录
 * ```
 */

import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { snapshotRealPatch, verifyRealPatchUnchanged } from './lib/live-harness.mjs'

const here = dirname(fileURLToPath(import.meta.url))
/** 本脚本住在仓根 `scripts/`（与 codegraph 的 verify 脚本同款：脚本在根、守卫在包内）。 */
const repoRoot = resolve(here, '..')
const pkgDir = join(repoRoot, 'packages', 'devdata')

/** 临时资源前缀（**删除时的唯一凭据**，别省）。 */
const PREFIX = 'dsh-devdata-mount-'
/**
 * 注册面期望（命令原文形态的引擎：一条入口 + 引擎无关的三个自证项 + 清单驱动的 `devdata_verify`）。
 *
 * `devdata_verify` 的可见性判据是「**这份配置里存在 redis 目标**」——本脚本的 profile 正是 redis
 * （见下面写配置那一段），所以它会注册；换成只有 SQL 目标的 profile 时它**不该**出现。
 */
const EXPECTED_TOOLS = ['devdata_capabilities', 'devdata_doctor', 'devdata_list_targets', 'devdata_redis_command', 'devdata_verify']
/** 结构化动作名**不该**出现在工具面上（执行器只收命令原文）。 */
const FORBIDDEN_TOOLS = ['devdata_query', 'devdata_set', 'devdata_get', 'devdata_keys', 'devdata_schema']

const KEEP = process.argv.includes('--keep')
const STRICT = process.argv.includes('--strict')

/* --------------------------------- 断言与日志 --------------------------------- */

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok })
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail === '' ? '' : `  [${detail}]`}`)
}

function skip(reason) {
  console.log(`[devdata-host-mount] SKIP：${reason}`)
  process.exit(STRICT ? 1 : 0)
}

/* --------------------------------- 宿主与端口 --------------------------------- */

/** `dsh` 在不在（不在就 SKIP，而不是红掉）。 */
function findDsh() {
  const binary = process.env.DSH_BIN?.trim() || 'dsh'
  const probe = spawnSync(binary, ['--version'], { encoding: 'utf8', timeout: 60_000 })
  if (probe.error !== undefined || probe.status !== 0) return undefined
  return binary
}

function runDsh(binary, args, env, timeout = 120_000) {
  const result = spawnSync(binary, args, { cwd: repoRoot, env, encoding: 'utf8', timeout })
  return { status: result.status ?? 1, stdout: result.stdout ?? '', stderr: (result.stderr ?? '') + (result.error === undefined ? '' : String(result.error)) }
}

/** 一个当前空闲的端口（listen(0) 拿完就关）。 */
async function freePort() {
  const server = createServer()
  await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen))
  const address = server.address()
  const port = typeof address === 'object' && address !== null ? address.port : 0
  await new Promise((resolveClose) => server.close(resolveClose))
  return port
}

/** 等一段日志里出现匹配（超时不抛，交给调用方断言）。 */
async function waitFor(getLog, pattern, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const matched = pattern.exec(getLog())
    if (matched !== null) return matched
    if (Date.now() > deadline) return null
    await new Promise((resolveWait) => setTimeout(resolveWait, 250))
  }
}

/* --------------------------------- 主流程 --------------------------------- */

const binary = findDsh()
if (binary === undefined) skip('本机没有可用的 `dsh`（PATH 或 DSH_BIN），无处挂载')

// 临时目录带**可识别前缀**：删除时只认自己记录下来的那个路径。
const workDir = mkdtempSync(join(tmpdir(), PREFIX))
const isolatedHome = join(workDir, 'dsh-home')
const profileName = 'devdata-mount'
const profileDir = join(isolatedHome, 'profiles', profileName)
const patchSnapshot = snapshotRealPatch()
let child

console.log(`[devdata-host-mount] 隔离 home=${isolatedHome}`)
console.log(`[devdata-host-mount] dsh=${binary}，包=${pkgDir}`)

try {
  mkdirSync(join(isolatedHome, 'profiles'), { recursive: true })
  const shellEnv = { ...process.env, DSH_HOME: isolatedHome }

  // ① 从 dsh 自带模板起一个**一次性** profile（--dump-config = 只准备与组合，不启动宿主）
  const init = runDsh(binary, ['--profile', profileName, '--from-default-profile', 'web', '--dump-config'], shellEnv)
  check('初始化一次性 profile', init.status === 0, `exit=${String(init.status)} ${init.stderr.trim().slice(-200)}`)

  // ② link 本包（插件真的被「装上」，不是被 import 进来）
  const added = runDsh(binary, ['plugin', '--profile', profileName, 'add', `link:${pkgDir}`], shellEnv)
  check('`dsh plugin add link:` 装上本包', added.status === 0, `exit=${String(added.status)} ${added.stderr.trim().slice(-200)}`)

  // ③ 写配置层：一个目标（127.0.0.1:1，不连真机）+ 持久审计
  writeFileSync(
    join(profileDir, 'cordis.patch.yml'),
    [
      '# 一次性验证 profile：由 scripts/verify-devdata-host-mount.mjs 生成，跑完即删。',
      '- id: devdata',
      '  config:',
      '    enabled: true',
      `    auditFile: ${join(workDir, 'audit.jsonl')}`,
      '    targets:',
      '      - id: redis-local',
      '        label: 仅供挂载验收（不连真机）',
      '        engine: redis',
      '        env: test-isolated',
      '        scopeDirs:',
      `          - ${repoRoot}`,
      '        host: 127.0.0.1',
      '        port: 1',
      '        writeCapability:',
      '          env: DSH_DEVDATA_WRITE',
      '          label: 受限写（SET/DEL/EXPIRE 一类）',
      '        dangerousReadCapability:',
      '          env: DSH_DEVDATA_DANGEROUS_READ',
      '          label: 危险读（KEYS/MONITOR）',
      '',
    ].join('\n'),
  )

  // ④ 组合结果里必须有本包那一行（否则就是被兼容性闸门整批跳过了）
  const dump = runDsh(binary, ['--profile', profileName, '--dump-config'], shellEnv)
  check('组合结果里有 `@hyzyn/dsh-devdata` 行', dump.status === 0 && dump.stdout.includes('@hyzyn/dsh-devdata'))
  check('配置真的交下来了（dump 里能看到 redis-local）', dump.stdout.includes('redis-local'))

  // ⑤ 起真宿主（独立端口），从启动日志读「挂上了没有」与「注册了什么」
  const port = await freePort()
  const kitHome = join(profileDir, '.kit-home')
  shellEnv.DSH_KIT_HOME = kitHome
  let log = ''
  child = spawn(binary, ['--profile', profileName, '--no-open', '--port', String(port)], {
    cwd: repoRoot,
    env: shellEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.on('data', (chunk) => { log += chunk.toString('utf8') })
  child.stderr.on('data', (chunk) => { log += chunk.toString('utf8') })

  const mounted = await waitFor(() => log, /\[dsh-devdata\] mounted \(([^)]*)\)/, 60_000)
  check('宿主启动日志里有 `[dsh-devdata] mounted`', mounted !== null, mounted === null ? log.trim().slice(-300) : mounted[1])

  const registered = await waitFor(() => log, /\[dsh-devdata\] agent tools registered \(([^)]*)\)/, 30_000)
  const names = registered === null ? [] : registered[1].split(',').map((name) => name.trim()).filter((name) => name !== '')
  check('工具注册行了（真 ToolRuntime 接受了这些定义）', registered !== null, names.join(', '))
  check(
    '注册的**恰好**是命令原文形态该有的五个',
    JSON.stringify([...names].sort()) === JSON.stringify(EXPECTED_TOOLS),
    names.join(', '),
  )
  check(
    '结构化动作名**没有**出现在工具面上（跑起来必失败的不注册）',
    FORBIDDEN_TOOLS.every((forbidden) => !names.includes(forbidden)),
    FORBIDDEN_TOOLS.filter((forbidden) => names.includes(forbidden)).join(', '),
  )
  /*
   * 这一条**必须有牙齿**：`reportProblems()` 走 `console.warn`（stdout/stderr），启动日志里看得到。
   * 2026-10-02 之前它走 `ctx.logger.warn`，报告进的是另一个 sink——这条断言永远为真，于是没能拦住
   * 「schema 把『没写』伪造成『写错了』」那一轮假问题。夹具也据此改成**真实形状**（含能力声明）。
   */
  check('配置没有报问题（启动日志里没有「配置问题」）', !log.includes('[devdata] 配置问题') && !log.includes('配置问题'))
} finally {
  if (child !== undefined && child.exitCode === null) child.kill('SIGTERM')
  // 复位自证：真实 ~/.dsh 的那份补丁**逐字节没变**（本脚本只读它）。
  const patch = verifyRealPatchUnchanged(patchSnapshot)
  check('真实 `~/.dsh/cordis.patch.yml` 逐字节未变', patch.unchanged === true, patch.unchanged ? '' : '被改动了！')
  if (KEEP && results.some((result) => !result.ok)) console.log(`[devdata-host-mount] --keep：保留 ${workDir}`)
  else rmSync(workDir, { recursive: true, force: true })
}

const failed = results.filter((result) => !result.ok)
console.log(`\n[devdata-host-mount] ${String(results.length - failed.length)}/${String(results.length)} PASS`)
if (failed.length > 0) {
  for (const result of failed) console.error(`  ✗ ${result.name}`)
  process.exit(1)
}
console.log('[devdata-host-mount] 通过')
