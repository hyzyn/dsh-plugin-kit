/**
 * 真机：**SSH 目标的 HTTP 探针**（门控在环境变量上，默认跳过）。
 *
 * ```sh
 * DEVENV_REAL=1 \
 * DEVENV_REAL_SSH_HOST=<目标> \
 * DEVENV_REAL_SSH_PASSWORD=… \
 * DEVENV_REAL_PROBE_PORT=<从本机可达、会回 2xx/3xx 的端口> \
 * DEVENV_REAL_PROBE_TIMEOUT_PORT=<从本机发 HTTP 会一直没响应的端口> \
 * npx vitest run packages/devenv/test/real-probe.test.ts
 * ```
 *
 * ## 它补的是哪个洞（ROADMAP 待办 A 的第 2 条；落点见 ROADMAP 记-10）
 *
 * 探针**从运行本工具的机器发出**（`probe.ts` 的头注），而对 SSH 目标它是打到**那台主机的地址**上
 * （`channel.ts` 的 `probeHost = spec.host`）。2026-10-02 那一档跑过：那台机器上的容器只跑在容器
 * 网络里、**没有发布端口**，所以「探针真的从本机探到远端一个端口」这件事从没被跑过——单测里的
 * 探针打的是**本机**起的真 HTTP 服务，验不到「跨机器 + 真网络」。
 *
 * 于是这一档要两件东西，各自一条用例：
 *
 * 1. **真 200**：`ready: { kind: httpProbe }` 在真机上取回一个真状态码（报告里的证据是
 *    `HTTP <status> <path>`）——顺带证明 `probeHost` 真的是那台主机的地址（本机上没有那个端口）；
 * 2. **真超时**：一个「连得上、但 HTTP 请求永远没响应」的端口。这一档是**等待的常态**（服务还没
 *    起来时端口就是这个样子），不亲眼见一次，「等满超时」那条路径就只是单测里的想象。
 *
 * ## 为什么端口要人给（`DEVENV_REAL_PROBE_PORT` / `DEVENV_REAL_PROBE_TIMEOUT_PORT`）
 *
 * 「目标机上有一个从本机可达的端口」是**环境事实**，不是代码能决定的：共享联调机上的容器多半没发布
 * 端口（这正是这个盲区的成因），而哪台机器上恰好有可达端口、哪个端口会黑洞，只有现场知道。
 * 不给就**整档跳过**，理由写在套件名里——**验不到的不许报 ✓**。
 *
 * ## 只读
 *
 * 用例只发 `GET`（读完响应头就断）与观测层那两条只读 docker 命令（`inspect`，以及声明了
 * `logPattern` 时的 `logs`——本档不声明）。**没有任何变更操作**。口令只从环境变量取
 * （同 `real-machine.test.ts`：仓库里不落凭据）。
 */
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { makeHost } from './fake-host.js'

/** 与 `real-machine.test.ts` 同一套环境变量口径。 */
const HOST = process.env.DEVENV_REAL_SSH_HOST ?? ''
const USER = process.env.DEVENV_REAL_SSH_USER ?? 'root'
const PASSWORD = process.env.DEVENV_REAL_SSH_PASSWORD
const KEY_PATH = process.env.DEVENV_REAL_SSH_KEY_PATH
/** 一个已知在跑的容器：清单里的服务名就是它（探针判据挂在同一个服务上）。 */
const CONTAINER = process.env.DEVENV_REAL_CONTAINER ?? 'ems-service-test'

/** 从本机可达、会回 2xx/3xx 的端口（**必填**，否则这一条跳过）。 */
const PROBE_PORT = Number(process.env.DEVENV_REAL_PROBE_PORT ?? '')
/** 探针要打的路径（缺省 `/`）。 */
const PROBE_PATH = process.env.DEVENV_REAL_PROBE_PATH ?? '/'
/** 从本机发 HTTP 会一直没响应的端口（**必填**，否则这一条跳过）。 */
const TIMEOUT_PORT = Number(process.env.DEVENV_REAL_PROBE_TIMEOUT_PORT ?? '')
/** 探针超时（缺省 3000ms，与插件缺省一致；超时那一档要等满它才算数）。 */
const PROBE_TIMEOUT_MS = Number(process.env.DEVENV_REAL_PROBE_TIMEOUT_MS ?? '3000')

const CAN_RUN = process.env.DEVENV_REAL === '1' && HOST !== '' && CONTAINER !== ''

/** 缺哪个旋钮（写进套件名，免得「跳过了」看起来像「验过了」）。 */
const MISSING = [
  PROBE_PORT === 0 ? 'DEVENV_REAL_PROBE_PORT' : '',
  TIMEOUT_PORT === 0 ? 'DEVENV_REAL_PROBE_TIMEOUT_PORT' : '',
].filter((item) => item !== '')

/** 造一个项目根 + 一份「服务 + httpProbe 判据」的清单（清单名必须等于目录名）。 */
function projectFor(port: number): string {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-devenv-probe-'))
  const project = basename(dir)
  mkdirSync(join(dir, 'ready'), { recursive: true })
  writeFileSync(join(dir, 'ready', `${project}.ready.yaml`), [
    'version: 1',
    `project: ${project}`,
    'services:',
    `  - name: ${JSON.stringify(CONTAINER)}`,
    `    ready: { kind: httpProbe, path: ${JSON.stringify(PROBE_PATH)}, port: ${String(port)} }`,
  ].join('\n') + '\n')
  return dir
}

/**
 * 走一遍**插件本体**（目标 → 清单 → 通道 → 观测 → 判定 → 报告）。
 *
 * 连接簿条目**在内存里造**（真机用例不往任何持久存储里写东西）；跑完 `unmount()` 把插件那条
 * SSH 连接池收掉——否则这一档会在测试进程里留一条真实连接。
 */
async function statusText(dir: string): Promise<string> {
  const host = makeHost({
    extraEntries: {
      tty: {
        sshHosts: [{
          name: 'probe-book',
          host: HOST,
          port: Number(process.env.DEVENV_REAL_SSH_PORT ?? '22'),
          username: USER,
          auth: KEY_PATH === undefined ? 'password' : 'key',
          ...(KEY_PATH === undefined ? { password: PASSWORD ?? '' } : { keyPath: KEY_PATH }),
        }],
      },
    },
  })
  host.mount({
    probeTimeoutMs: PROBE_TIMEOUT_MS,
    execTimeoutMs: 20_000,
    targets: [{ id: 'real', label: '真机', kind: 'ssh', book: 'probe-book', scopeDirs: [dir] }],
  })
  try {
    return await host.call('env_status', { target: 'real', cwd: dir, project: basename(dir) })
  } finally {
    host.unmount()
  }
}

/** 自己建的临时目录自己删，而且**看得见**（读回一次）。 */
function cleanup(dir: string): void {
  rmSync(dir, { recursive: true, force: true })
  expect(existsSync(dir), '临时项目目录没清掉').toBe(false)
}

describe.skipIf(!CAN_RUN)(
  `真机：SSH 目标的 HTTP 探针（${USER}@${HOST}${MISSING.length === 0 ? '' : ` · 缺 ${MISSING.join(' / ')} 的用例会跳过`}）`,
  () => {
    it.skipIf(PROBE_PORT === 0)('真 200：探针从本机打到远端端口，报告里带着真状态码', async () => {
      const dir = projectFor(PROBE_PORT)
      try {
        const text = await statusText(dir)
        // 探针 `probeHost` 就是连接簿里那台主机：本机没有这个端口，所以这条 ✓ 只可能来自远端。
        expect(text, text).toContain(`✓ ${CONTAINER}`)
        const status = /HTTP (\d{3}) /.exec(text)?.[1]
        expect(status, `报告里没有探针状态码：\n${text}`).toBeDefined()
        expect(Number(status), `探针拿到的状态码不在 2xx/3xx：${String(status)}`).toBeGreaterThanOrEqual(200)
        expect(Number(status), `探针拿到的状态码不在 2xx/3xx：${String(status)}`).toBeLessThan(400)
      } finally {
        cleanup(dir)
      }
    })

    it.skipIf(TIMEOUT_PORT === 0)('真超时：一个没响应的端口等满探针预算，且**不是**否证（继续等才是对的）', async () => {
      const dir = projectFor(TIMEOUT_PORT)
      try {
        const text = await statusText(dir)
        // 端口没起来 = `unready`（继续等），不是 `refuted`（别等了）——两者处置相反。
        expect(text, text).toContain(`! ${CONTAINER}`)
        expect(text, `探针没报超时（文案依赖 probeFailureDetail）：\n${text}`).toContain(`${String(PROBE_TIMEOUT_MS)}ms 内没有响应`)
        expect(text, text).toContain('探针还没通过')
        expect(text, text).not.toContain('✗')
      } finally {
        cleanup(dir)
      }
    })
  },
)
