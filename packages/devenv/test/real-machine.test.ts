/**
 * 真机：`248` 那台机器上的**完整观测链路**（门控在环境变量上，默认跳过）。
 *
 * ```sh
 * DEVENV_REAL=1 \
 * DEVENV_REAL_SSH_PASSWORD=… \
 * npx vitest run packages/devenv/test/real-machine.test.ts
 * ```
 *
 * ## 为什么这条值得单独存在
 *
 * 单测覆盖的是「观测层按给定的命令输出算出正确结论」——那部分喂假 docker 就够了。**这里要验的是
 * 字符串契约本身**，而它只有真机能回答：
 *
 * 1. `docker inspect --format '{{.State.Status}}|{{.State.StartedAt}}|…'` 在真 docker 上到底
 *    打出什么（`StartedAt` 是**纳秒精度**的 RFC3339，而 `Date.parse` 对超过 3 位小数的处理各引擎
 *    不一致——`env-ready-eval.ts` 的 `parseInstant` 专门为此截断到毫秒）；
 * 2. 那条把五个字段串起来的 `|` 分隔约定在被真 docker 渲染后**仍然成立**（字段值域里没有 `|`）；
 * 3. 「容器不存在」与「通道不通」在真机上确实是**两种不同的输出**（前者 stderr 里是
 *    `No such object`，后者是连接类错误）。
 *
 * ## 它绝不碰的秘密
 *
 * SSH 口令**只从环境变量取**（`DEVENV_REAL_SSH_PASSWORD`，或 `…_KEY_PATH` 走密钥）。仓库里没有
 * 任何口令、也没有指向某个人的 profile 的路径——这是本仓真机脚本的硬约束（见
 * [docs/agent-real-test.md](../../../docs/agent-real-test.md)）。
 *
 * 主机与用户名可以用 `DEVENV_REAL_SSH_HOST` / `DEVENV_REAL_SSH_USER` / `DEVENV_REAL_CONTAINER`
 * 覆盖；默认值对齐数据面那份真机用例（同一个共享测试环境）。
 *
 * ## 用例只发只读命令
 *
 * `docker inspect` 与 `docker logs`（外加一次注定失败的 `inspect`）。**没有任何变更操作**——
 * 这台机器上有同事在联调（plan §13 的写类工具因此今天一个都没有）。
 */

import { afterAll, describe, expect, it } from 'vitest'

import { RemoteExec } from '@hyzyn/dsh-kit/ssh-exec'
import type { HostKeyRecord, SshSpec } from '@hyzyn/dsh-kit/ssh-exec'

import { toObserved } from '../src/channel.js'
import { evaluateProfile, parseInstant } from '../src/env-ready-eval.js'
import type { ReadyProfile } from '../src/env-ready.js'
import { observeServices, type ObservationIo } from '../src/observe.js'

const HOST = process.env.DEVENV_REAL_SSH_HOST ?? '192.168.80.248'
const USER = process.env.DEVENV_REAL_SSH_USER ?? 'root'
const PASSWORD = process.env.DEVENV_REAL_SSH_PASSWORD
const KEY_PATH = process.env.DEVENV_REAL_SSH_KEY_PATH
/** 这台机器上一个已知在跑的容器（可用环境变量换）。 */
const CONTAINER = process.env.DEVENV_REAL_CONTAINER ?? 'ems-service-test'
const CAN_PROBE = process.env.DEVENV_REAL === '1'

describe.skipIf(!CAN_PROBE)(`真机：观测链路（${USER}@${HOST}）`, () => {
  const spec: SshSpec = {
    host: HOST,
    port: Number(process.env.DEVENV_REAL_SSH_PORT ?? '22'),
    username: USER,
    auth: KEY_PATH === undefined ? 'password' : 'key',
    ...(KEY_PATH === undefined ? { password: PASSWORD ?? '' } : { keyPath: KEY_PATH }),
  }

  /*
   * TOFU 记录**只放在内存里**：这一条用例不该往任何持久存储里写东西（真机用例的收尾自证要求
   * 「用完即还原」，而写指纹是一个会留下来的副作用）。代价是每次跑都当「首次连接」——
   * 对只读观测没有影响。
   */
  const known = new Map<string, HostKeyRecord>()
  const store = {
    get: (host: string, port: number): string[] | undefined => known.get(`${host}:${port}`)?.fingerprints,
    record: (host: string, port: number, fingerprint: string): void => {
      const key = `${host}:${port}`
      const existing = known.get(key)
      if (existing === undefined) known.set(key, { host, port, fingerprints: [fingerprint] })
      else existing.fingerprints = [...existing.fingerprints, fingerprint]
    },
  }

  const exec = new RemoteExec({ info: () => {}, warn: (message) => console.log(`  · [warn] ${message}`) }, store, { tag: 'dsh-devenv-real' })
  const io: ObservationIo = {
    run: async (argv, options) => toObserved(await exec.run(spec, argv, {
      timeoutMs: options?.timeoutMs ?? 15_000,
      ...(options?.maxBytes === undefined ? {} : { maxBytes: options.maxBytes }),
      ...(options?.keepTail === true ? { keepTail: true } : {}),
    })),
    // 探针不在这一档里（它要的是「从这台机器可达的端口」，与 SSH 那条链路无关）。
    probe: async () => ({ ok: false, detail: '本用例不使用探针' }),
  }

  it('① 真 docker 上取到观测：容器在跑、`StartedAt` 可解析、五个字段那条约定成立', async () => {
    const result = await observeServices({
      io,
      host: HOST,
      services: [{ name: CONTAINER }],
      logTail: 20,
    })
    // 失败信息里带上远端那句话：真机用例跨 VPN，偶发抖动时「红在哪一步」必须在输出里。
    expect(result.failure, result.failure ?? '').toBeUndefined()
    const observation = result.observations[0]
    expect(observation?.found, `没在 ${HOST} 上观测到容器 ${CONTAINER}（用 DEVENV_REAL_CONTAINER 换一个）`).toBe(true)
    expect(observation?.status, `容器 ${CONTAINER} 现在的状态是 ${String(observation?.status)}`).toBe('running')
    /*
     * **这一条是真机才有的价值**：`StartedAt` 的纳秒形态（`.123456789Z`）能不能被我们的
     * `parseInstant` 读成一个有限数。解析不了的话，判定层会给 `unready`（缺证）而不是 `ready`，
     * 而报告里只会说「需要带时区的 RFC3339 时刻」——一个在上游完全正确的读数被判成缺证。
     */
    expect(observation?.startedAt, '没取到 StartedAt').toBeTruthy()
    expect(Number.isFinite(parseInstant(observation?.startedAt)), `parseInstant 读不了 ${String(observation?.startedAt)}`).toBe(true)
    expect(observation?.restartCount, '重启次数应当是数字（0 也算）').toBeTypeOf('number')
  })

  it('② 真日志：`docker logs --timestamps` 取回尾部，行内时刻可解析', async () => {
    const result = await observeServices({
      io,
      host: HOST,
      services: [{ name: CONTAINER, ready: { kind: 'logPattern', pattern: '.' } }],
      logTail: 20,
    })
    expect(result.failure, result.failure ?? '').toBeUndefined()
    const lines = result.observations[0]?.logLines
    expect(Array.isArray(lines), '声明了 logPattern 就该取到行数组').toBe(true)
    if (lines !== undefined && lines.length > 0) {
      // 行首必须是 `--timestamps` 的前缀形态（判定层靠它比 StartedAt）。
      expect(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(lines[0] as string), `日志行前缀不对：${String(lines[0]).slice(0, 60)}`).toBe(true)
    }
  })

  it('③ 判定层对真观测给得出结论（容器层就绪 + logPattern 那一档）', async () => {
    const result = await observeServices({ io, host: HOST, services: [{ name: CONTAINER }], logTail: 20 })
    const profile: ReadyProfile = { version: 1, project: 'real', services: [{ name: CONTAINER }] }
    const evaluation = evaluateProfile({ profile, observations: result.observations })
    expect(evaluation.summary, JSON.stringify(result.observations)).toContain('就绪')
    expect(evaluation.ready).toBe(true)
  })

  it('④ 容器不存在 → `found: false`（**不是**通道失败：两者的处置相反）', async () => {
    const result = await observeServices({
      io,
      host: HOST,
      services: [{ name: 'dsh-devenv-不存在-的容器' }],
    })
    expect(result.failure, '把「不存在」报成通道失败会让等的人去修一条好的通道').toBeUndefined()
    expect(result.observations[0]).toMatchObject({ found: false })
  })

  /*
   * ⑤ 走**插件本体**：配置 → 作用域门 → 清单 → 通道 → 观测 → 判定 → 报告。
   *
   * 前面四条验的是观测层；这一条验的是「把这些接起来」——而接线的错误（目标解析、清单位置、
   * 通道选择、渲染）单测里是用假 docker 验的，**只有这一条是真机**。
   * 连接簿用一个假 settings entry 喂进去（口令来自环境变量），所以它同时验到了
   * 「读别人的 entry → 建 SSH 规格」那一跳。
   */
  it('⑤ 插件本体：`env_status` 走真机取回观测并给出结论', async () => {
    const { makeHost } = await import('./fake-host.js')
    const { mkdirSync, mkdtempSync, rmSync, writeFileSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const dir = mkdtempSync(join(tmpdir(), 'dsh-devenv-real-proj-'))
    try {
      mkdirSync(join(dir, 'ready'), { recursive: true })
      writeFileSync(join(dir, 'ready', 'real.ready.yaml'), [
        'version: 1',
        'project: real',
        'services:',
        `  - name: ${CONTAINER}`,
      ].join('\n') + '\n')
      const host = makeHost({
        extraEntries: {
          tty: {
            sshHosts: [{
              name: 'real-book',
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
        targets: [{
          id: 'real',
          label: '真机',
          kind: 'ssh',
          book: 'real-book',
          scopeDirs: [dir],
          // 目标机上 docker 调用要一会儿（NAS 上首次连接 + inspect）。
        }],
        execTimeoutMs: 20_000,
      })
      // 显式点名项目名（清单文件名是 `real.ready.yaml`；缺省会用临时目录名，那份不存在）
      const text = await host.call('env_status', { target: 'real', cwd: dir, project: 'real' })
      expect(text, text).toContain(`✓ ${CONTAINER}`)
      expect(text, text).toContain('全部 1 个服务就绪')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  afterAll(() => {
    exec.disposeAll()
  })
})
