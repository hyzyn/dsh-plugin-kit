#!/usr/bin/env node
/**
 * `packages/devenv` 的**一键验证**（L1 脚本）：一条命令跑完
 * 「产物 → 单测 → 真机只读链路 → 真机写入口 → 真宿主挂载」。
 *
 * ## 为什么要有它（与 `verify-devdata-all.mjs` 同因）
 *
 * 「怎么验证」不该靠手工粘一段带注释的清单：zsh 交互式**不把 `#` 当注释**
 * （`interactive_comments` 默认关），于是每一行注释都被当成命令跑，屏幕上一串
 * `zsh: command not found: #`。分享验证方式要么是一行命令，要么就是别人踩坑。
 *
 * ## 六步，以及每步的失败意味着什么
 *
 * | 步 | 命令 | 失败意味着 |
 * |---|---|---|
 * | 1 | `pnpm -r typecheck` | 类型层坏了 |
 * | 2 | `pnpm -r build` | 产物建不出来；**不能省**——第 ⑤⑥ 步加载的是 `lib/`，不重建就可能验的是旧代码 |
 * | 3 | `npx vitest run packages/devenv` | 本包用例红了（门控真机用例在这里是「跳过」） |
 * | 4 | 真机只读链路（`test/real-machine.test.ts`） | SSH → `docker inspect` / `docker logs` → 解析 → 判定，这条链断了 |
 * | 5 | 真机写入口（`test/real-write.test.ts`） | 四道门槛、白名单、幂等、启停本身有问题 |
 * | 6 | `node scripts/verify-devenv-host-mount.mjs` | 真 DSH 宿主挂不上（那一步自己起隔离 profile） |
 *
 * ## 第 4、5 步为什么要**两个前提**才对跑
 *
 * 它们都打真机（默认 248），所以先探可达性；而**写入口还多一个前提**：必须有人**指名**一个可以动的
 * 容器（`DEVENV_REAL_WRITE_CONTAINER`）。理由是这台机器上有同事在联调——「启停一台共享机器上的容器」
 * 不该由脚本自动挑一个目标。缺任何一个前提都报 **SKIP 不报红**：拿环境状况当失败信号只会训练人
 * 忽略红灯（本仓真机脚本一贯如此，见 [docs/agent-real-test.md](../docs/agent-real-test.md)）。
 *
 * ## 它**刻意不去读凭据存储**
 *
 * 真机那两档要 SSH 凭据，而本脚本**不会**自己去读 `~/.dsh/.credentials.yaml`——那属于凭据服务，
 * 一个验证脚本伸手进去就等于绕过了它的所有权（而且会把口令带进自己的进程环境与可能的日志）。
 * 所以：**要么你自己 export，要么那两步跳过**。
 *
 * ```sh
 * # 自己把口令读进变量再跑（不进 shell 历史的话用 read -s）
 * read -rs DEVENV_REAL_SSH_PASSWORD && export DEVENV_REAL_SSH_PASSWORD
 * node scripts/verify-devenv-all.mjs
 *
 * # 写入口那一步另外要指名一个可以动的容器（自己起一个一次性的最稳妥）
 * DEVENV_REAL_WRITE_CONTAINER=dsh-devenv-write-test node scripts/verify-devenv-all.mjs
 * ```
 *
 * ## 它**不**做什么
 *
 * - **不碰真实的 `~/.dsh`**：自己不建临时目录也不起宿主，需要动 DSH 的第 6 步**委托**给
 *   [`verify-devenv-host-mount.mjs`](./verify-devenv-host-mount.mjs)（那个脚本有自己的隔离守卫
 *   `test/host-mount-script-safety.test.ts` 与收尾自证）；
 * - **不创建、不删除容器**：第 5 步只启停你指名的那一个（`docker start` / `docker stop`）；
 * - **不管发布**：仓库级门禁（`pnpm typecheck && pnpm build && pnpm test && pnpm aggregate`）是另一回事。
 *
 * ## 用法
 *
 * ```sh
 * node scripts/verify-devenv-all.mjs          # 或 pnpm --filter @hyzyn/dsh-devenv run verify
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

/** 真机目标（与两个真机用例同一套环境变量口径）。 */
const SSH_HOST = process.env.DEVENV_REAL_SSH_HOST ?? '192.168.80.248'
const SSH_PORT = Number(process.env.DEVENV_REAL_SSH_PORT ?? '22')
/** 有人在用例里指名了容器吗（**写入口那一档的唯一门控**）。 */
const WRITE_CONTAINER = process.env.DEVENV_REAL_WRITE_CONTAINER ?? ''

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
 * 用 `net.connect` 而不是 shell 的 `nc` / `/dev/tcp`：后者存在性不一，而且本仓踩过
 * 「本机没有 `timeout` 二进制导致所有主机都被判不可达」那一次（plan §17.4）。
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

/** 有凭据吗（**只查有没有**，不读任何文件、不打印任何值）。 */
function hasCredential() {
  const password = process.env.DEVENV_REAL_SSH_PASSWORD ?? ''
  const keyPath = process.env.DEVENV_REAL_SSH_KEY_PATH ?? ''
  return password !== '' || keyPath !== ''
}

/* ------------------------------- 开始跑 ------------------------------- */

console.log('[devenv-verify] 一键验证：产物 → 单测 → 真机只读 → 真机写 → 真宿主挂载')
console.log(`[devenv-verify] 仓库：${repoRoot}`)

run('① 类型检查（pnpm -r typecheck）', 'pnpm', ['-r', 'typecheck'])
// ② 产物必须在 ⑤⑥ 之前重建：那两个脚本加载的是 `lib/`，不重建可能验的是旧代码。
run('② 构建产物（pnpm -r build）', 'pnpm', ['-r', 'build'])
run('③ devenv 全量单测（含门控真机用例的跳过）', 'npx', ['vitest', 'run', 'packages/devenv'])

/* ④⑤ 真机那两档：可达性 → 凭据 → （写那档还要人指名容器） */
const reachable = await canConnect(SSH_HOST, SSH_PORT)
if (!reachable) {
  skip(`④ 真机只读链路（${SSH_HOST}:${String(SSH_PORT)}）`, '目标不可达（需要 VPN / 内网）。想换目标：DEVENV_REAL_SSH_HOST=…')
  skip('⑤ 真机写入口', '目标不可达（同上）')
} else if (!hasCredential()) {
  const reason = '缺凭据：这两档要 SSH 凭据，而本脚本**刻意不去读凭据存储**（那属于凭据服务）。用法见脚本头注：先 read -rs 读进 DEVENV_REAL_SSH_PASSWORD 或给 DEVENV_REAL_SSH_KEY_PATH 再重跑'
  skip(`④ 真机只读链路（${SSH_HOST}:${String(SSH_PORT)}）`, reason)
  skip('⑤ 真机写入口', reason)
} else {
  run(
    `④ 真机只读链路（${SSH_HOST}:${String(SSH_PORT)}）`,
    'npx',
    ['vitest', 'run', 'packages/devenv/test/real-machine.test.ts'],
    { DEVENV_REAL: '1' },
  )
  if (WRITE_CONTAINER === '') {
    skip(
      '⑤ 真机写入口',
      '没人指名可以动的容器：这一步会在目标机上**真启停**容器，而那是台共享机器（有同事在联调），'
        + '所以它要人指名：DEVENV_REAL_WRITE_CONTAINER=<容器名>（自己起一个一次性的最稳妥，用例只启停、不创建不删除）',
    )
  } else {
    run(
      `⑤ 真机写入口（容器 ${WRITE_CONTAINER}）`,
      'npx',
      ['vitest', 'run', 'packages/devenv/test/real-write.test.ts'],
      { DEVENV_REAL: '1' },
    )
  }
}

// ⑥ 委托给已隔离、已守卫的挂载验收脚本（它自己起一次性 profile，跑完即删）。
run('⑥ 真 DSH 宿主挂载验收（隔离 profile）', 'node', [join(here, 'verify-devenv-host-mount.mjs')])

/* ------------------------------- 汇总 ------------------------------- */

const failed = results.filter((result) => result.state === 'FAIL')
console.log(`\n${'═'.repeat(72)}\n[devenv-verify] 汇总`)
for (const result of results) {
  const icon = result.state === 'PASS' ? '✓' : result.state === 'SKIP' ? '▷' : '✗'
  console.log(`  ${icon} ${result.state.padEnd(4)} ${result.label}${result.detail === '' ? '' : `  [${result.detail}]`}`)
}
if (failed.length > 0) {
  console.error(`\n[devenv-verify] ${String(failed.length)} 步失败`)
  process.exit(1)
}
const passed = results.filter((result) => result.state === 'PASS').length
const skipped = results.filter((result) => result.state === 'SKIP').length
console.log(`\n[devenv-verify] 通过（${String(passed)} PASS / ${String(skipped)} SKIP）`)
