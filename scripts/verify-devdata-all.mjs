#!/usr/bin/env node
/**
 * `packages/devdata` 的**一键验证**（L1 脚本）：一条命令跑完「产物 → 单测 → 真机链路 → 真宿主挂载」。
 *
 * ## 为什么要有它（2026-10-02 的教训）
 *
 * 那次修复的验收被拆成三段散落在对话里：产物/单测在仓库门禁、真机链路在一个门控用例、真宿主挂载
 * 在另一个脚本。结果是维护者需要**手工粘一段带注释的清单**——而 zsh 交互式**不把 `#` 当注释**
 * （`interactive_comments` 默认关），于是每一行注释都被当成命令跑，屏幕上一串
 * `zsh: command not found: #`。分享「怎么验证」不该靠粘贴注释来实现。
 *
 * ## 五步，以及每步的语义
 *
 * | 步 | 命令 | 失败意味着 |
 * |---|---|---|
 * | 1 | `pnpm -r typecheck` | 类型层坏了 |
 * | 2 | `pnpm -r build` | 产物建不出来；**这一步不能省**——第 5 步加载的是 `lib/`，不重建就可能验的是**旧代码**（今天就踩过） |
 * | 3 | `npx vitest run packages/devdata` | 判据层/宿主层用例红了（含门控真机用例的「跳过」） |
 * | 4 | `DEVDATA_REDIS_248=1 npx vitest run …/redis-real-machine.test.ts` | 真机链路或闸门坏了 |
 * | 5 | `node scripts/verify-devdata-host-mount.mjs` | 真 DSH 宿主挂不上（那一步自己会起隔离 profile） |
 *
 * **第 4 步先探可达性**：目标不可达时**报 SKIP，不报红**——真机用例需要 VPN 与那台 Redis，
 * 拿网络状况当失败信号只会训练人忽略红灯（本仓真机脚本一贯如此，见 `docs/agent-real-test.md`）。
 * 目标要**显式给**：`DEVDATA_REDIS_HOST`（**没有默认值**——公开仓库里不留内网地址）/ `DEVDATA_REDIS_PORT`。
 *
 * ## 它**不**做什么
 *
 * - **不碰真实的 `~/.dsh`**：它自己不建临时目录也不起宿主，需要动 DSH 的第 5 步**委托**给
 *   [`verify-devdata-host-mount.mjs`](./verify-devdata-host-mount.mjs)——那个脚本有自己的隔离守卫
 *   （`test/host-mount-script-safety.test.ts`）与收尾自证（真实补丁逐字节未变）；
 * - **不管发布**：仓库级门禁（`pnpm typecheck && pnpm build && pnpm test && pnpm aggregate`）是另一回事，
 *   本脚本只做 devdata 专项，不跑 `aggregate`、不碰发布清单。
 *
 * ## 用法
 *
 * ```sh
 * node scripts/verify-devdata-all.mjs                 # 或 pnpm --filter @hyzyn/dsh-devdata run verify
 * # 真机那一档要显式给目标（公开仓库里不留内网默认地址）；不给就报 SKIP
 * DEVDATA_REDIS_HOST=<目标> node scripts/verify-devdata-all.mjs
 * ```
 *
 * 任何一步 FAIL → 退出码 1；全过（含 SKIP）→ 0。
 */

import { spawnSync } from 'node:child_process'
import { connect } from 'node:net'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '..')

/** 真机目标（与 `test/redis-real-machine.test.ts` 同一套环境变量口径；**没有默认地址**）。 */
const REDIS_HOST = process.env.DEVDATA_REDIS_HOST ?? ''
const REDIS_PORT = Number(process.env.DEVDATA_REDIS_PORT ?? '6379')

const results = []

/** 跑一条命令，stdio 直通（维护者要看得到原始证据），只看退出码。 */
function run(label, command, args, env = {}) {
  console.log(`\n${'─'.repeat(72)}\n▶ ${label}\n  $ ${command} ${args.join(' ')}\n`)
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    env: { ...process.env, ...env },
    stdio: 'inherit',
  })
  const status = result.status ?? 1
  results.push({ label, state: status === 0 ? 'PASS' : 'FAIL', detail: `exit=${String(status)}` })
  return status === 0
}

function skip(label, reason) {
  console.log(`\n${'─'.repeat(72)}\n▷ ${label}\n  SKIP：${reason}`)
  results.push({ label, state: 'SKIP', detail: reason })
}

/**
 * 目标可达吗（**先探再跑**：不可达是环境问题，不是判据问题）。
 *
 * 用 `net.connect` 而不是 shell 的 `nc` / `/dev/tcp`：后者在不同机器上存在性不一，
 * 而且本仓踩过「本机没有 `timeout` 二进制导致所有主机都被判不可达」那一次（plan §17.4）。
 */
async function canConnect(host, port, timeoutMs = 3000) {
  return await new Promise((settle) => {
    const socket = connect({ host, port })
    const done = (ok) => {
      socket.destroy()
      settle(ok)
    }
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => { done(true) })
    socket.once('timeout', () => { done(false) })
    socket.once('error', () => { done(false) })
  })
}

/* ------------------------------- 开始跑 ------------------------------- */

console.log('[devdata-verify] 一键验证：产物 → 单测 → 真机链路 → 真宿主挂载')
console.log(`[devdata-verify] 仓库：${repoRoot}`)

run('① 类型检查（pnpm -r typecheck）', 'pnpm', ['-r', 'typecheck'])
// ② 产物必须在第 ⑤ 步之前重建：`verify-host-mount` 加载的是 `lib/`，不重建可能验的是旧代码。
run('② 构建产物（pnpm -r build）', 'pnpm', ['-r', 'build'])
run('③ devdata 全量单测', 'npx', ['vitest', 'run', 'packages/devdata'])

if (REDIS_HOST === '') {
  skip(
    '④ 真机链路与闸门',
    '没给 DEVDATA_REDIS_HOST——本仓不留内网默认地址（公开仓库）。用法：DEVDATA_REDIS_HOST=… DEVDATA_REDIS_PORT=… pnpm --filter @hyzyn/dsh-devdata run verify',
  )
} else if (await canConnect(REDIS_HOST, REDIS_PORT)) {
  run(
    `④ 真机链路与闸门（${REDIS_HOST}:${String(REDIS_PORT)}）`,
    'npx',
    ['vitest', 'run', 'packages/devdata/test/redis-real-machine.test.ts'],
    { DEVDATA_REDIS_248: '1' },
  )
} else {
  skip(
    `④ 真机链路与闸门（${REDIS_HOST}:${String(REDIS_PORT)}）`,
    `目标不可达（需要 VPN / 内网）。想换目标：DEVDATA_REDIS_HOST=… DEVDATA_REDIS_PORT=…`,
  )
}

// ⑤ 委托给已隔离、已守卫的挂载验收脚本（它自己起一次性 profile，跑完即删）。
run('⑤ 真 DSH 宿主挂载验收（隔离 profile）', 'node', [join(here, 'verify-devdata-host-mount.mjs')])

/* ------------------------------- 汇总 ------------------------------- */

const failed = results.filter((result) => result.state === 'FAIL')
console.log(`\n${'═'.repeat(72)}\n[devdata-verify] 汇总`)
for (const result of results) {
  const icon = result.state === 'PASS' ? '✓' : result.state === 'SKIP' ? '▷' : '✗'
  console.log(`  ${icon} ${result.state.padEnd(4)} ${result.label}${result.detail === '' ? '' : `  [${result.detail}]`}`)
}
if (failed.length > 0) {
  console.error(`\n[devdata-verify] ${String(failed.length)} 步失败`)
  process.exit(1)
}
console.log(`\n[devdata-verify] 通过（${String(results.filter((r) => r.state === 'PASS').length)} PASS / ${String(results.filter((r) => r.state === 'SKIP').length)} SKIP）`)
