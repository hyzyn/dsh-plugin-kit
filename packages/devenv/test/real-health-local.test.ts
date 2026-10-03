/**
 * `Health` 路径的**真机档**：本机真 daemon 上的一次性健康检查容器。
 *
 * ## 它补的是哪个洞（ROADMAP 待办 A 的第 1 条，2026-10-03 闭合；落点见 ROADMAP 记-10）
 *
 * `INSPECT_TEMPLATE` 的最后一段是 `{{if .State.Health}}{{.State.Health.Status}}{{end}}`——这条
 * **字段路径**在 2026-10-02 时没有真机样本：那台机器上 24 个容器**没有一个**配健康检查，所以
 * 守卫只能验它「写成受 `{{if}}` 保护」，验不到「路径真的对」。而路径写错的代价已经被 `RestartCount`
 * 那一次证明过：docker 的模板对缺失的键**直接报错**，于是每条 inspect 都失败、`env_status` 只会说
 * 「取观测失败」——**假 docker 夹具照样全绿**（它照自己的想象回一行，模板对不对它不关心）。
 *
 * 这一档把靶子放在**自己这台机器的真 daemon** 上：`docker run --health-cmd …` 起两个一次性容器
 * （一个转 `healthy`、一个永远是 `unhealthy`），于是
 *
 *   - 真 `docker inspect` 的**结构**（`State.Health` 在不在、`Status` 是什么类型）被当下这台
 *     daemon 验一遍，并和入库样本 `fixtures/docker-inspect.health.json` 对上；
 *   - 真输出喂进**插件本体**（清单 `ready: { kind: healthcheck }` → 观测 → 判定 → 渲染），
 *     两档结论都出现：转 healthy 的给 `✓`，unhealthy 的给 `✗` 并**别等了**。
 *
 * ## 为什么在本机、而不是那台共享的 248
 *
 * 248 上（与公网的 `cdc-test-161` 上）**没有**任何容器配健康检查——要在那儿取样本就得**新建**一个
 * 容器，而那台机器上有同事在联调（`real-write.test.ts` 因此连启停都要求人指名）。本机 docker 是
 * 真 daemon（Docker Desktop）、容器是自己建的、收尾自己删：同一个「真」不需要往共享机器上落东西。
 *
 * ## 前提缺失就 SKIP（不是红）
 *
 * 连不上 daemon、或本机没有可用镜像且拉不下来 → 整档 SKIP，理由写在套件名里。可用
 * `DEVENV_LOCAL_IMAGE` 指定本机已有镜像（见 [README](../README.md) 的验证表）。
 *
 * ## 自己建的自己删，而且要看得见
 *
 * `afterAll` 里 `docker rm -f` 之后**读回**两个名字都真的没了（独立通道，不经过被测代码）。
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { INSPECT_TEMPLATE } from '../src/observe.js'
import { makeHost } from './fake-host.js'
import { readShape, shapeOf, templatePaths, templateProblems, walkSample } from './inspect-shape.js'
import { containerExists, docker, pickImage, probeDaemon, uniqueName } from './local-docker.js'

/** 靶子标签：一眼看出这是本用例建的（人肉兜底清理时不必猜）。 */
const LABEL = 'dsh.devenv.test=health-local'

const daemon = probeDaemon()
const prepared: { image: string } | { problem: string } = daemon.ok ? pickImage() : { problem: daemon.detail }
const IMAGE = 'image' in prepared ? prepared.image : ''
const SKIP_REASON = 'problem' in prepared ? prepared.problem : undefined

/** 转 healthy 的那个（健康命令检查一个真的会被创建出来的文件）。 */
const HEALTHY = uniqueName('dsh-devenv-health-')
/** 永远 unhealthy 的那个（健康命令检查一个永远不存在的文件，`--health-retries 1` 让它很快定档）。 */
const UNHEALTHY = uniqueName('dsh-devenv-unhealthy-')

/** 入库样本：这一档要证的是「真 daemon 的输出与它一致」。 */
const FIXTURE = readShape('health')

/** 独立通道读回健康状态（不是 `docker inspect` 的整份输出，只要那一个字段）。 */
function healthStatus(name: string): string {
  return docker(['inspect', '-f', '{{if .State.Health}}{{.State.Health.Status}}{{end}}', name], 20_000).out.trim()
}

/** 轮询到期望的健康状态；到点返回最后读到的值（由断言去报「它没转过去」）。 */
async function waitForHealth(name: string, want: string, timeoutMs = 30_000): Promise<string> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const status = healthStatus(name)
    if (status === want || Date.now() > deadline) return status
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
}

const projectDirs: string[] = []

/** 造一个项目根 + 一份把 `ready` 声明成 `healthcheck` 的清单（清单名必须等于目录名）。 */
function projectFor(service: string, ready: 'healthcheck' | undefined): string {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-devenv-health-'))
  projectDirs.push(dir)
  const project = basename(dir)
  mkdirSync(join(dir, 'ready'), { recursive: true })
  const lines = ['version: 1', `project: ${project}`, 'services:', `  - name: ${service}`]
  if (ready !== undefined) lines.push(`    ready: { kind: ${ready} }`)
  writeFileSync(join(dir, 'ready', `${project}.ready.yaml`), lines.join('\n') + '\n')
  return dir
}

/** 一个只读的本机目标（作用域就是那个临时项目根）。 */
function mountReadOnly(dir: string): ReturnType<typeof makeHost> {
  const host = makeHost()
  host.mount({ probeTimeoutMs: 1000, targets: [{ id: 'here', kind: 'local', scopeDirs: [dir] }] })
  return host
}

describe.skipIf(SKIP_REASON !== undefined)(
  `Health 路径真机档（本机一次性健康检查容器：${SKIP_REASON ?? `${IMAGE} · daemon ${daemon.serverVersion}`}）`,
  () => {
    beforeAll(async () => {
      const healthy = docker([
        'run', '-d', '--name', HEALTHY, '--label', LABEL,
        '--health-cmd', 'test -f /tmp/dsh-devenv-healthy',
        '--health-interval', '1s', '--health-timeout', '2s', '--health-retries', '3',
        '--entrypoint', 'sh', IMAGE, '-c', 'touch /tmp/dsh-devenv-healthy; sleep 300',
      ])
      expect(healthy.code, `起 healthy 靶子失败：${healthy.out}`).toBe(0)
      const unhealthy = docker([
        'run', '-d', '--name', UNHEALTHY, '--label', LABEL,
        '--health-cmd', 'test -f /tmp/dsh-devenv-never-created',
        '--health-interval', '1s', '--health-timeout', '2s', '--health-retries', '1',
        '--entrypoint', 'sh', IMAGE, '-c', 'sleep 300',
      ])
      expect(unhealthy.code, `起 unhealthy 靶子失败：${unhealthy.out}`).toBe(0)
      // 先把两档**等到位**再断言：报告说的必须是稳定状态，而不是抓拍到的那个瞬间
      expect(await waitForHealth(HEALTHY, 'healthy'), `healthy 靶子没转成 healthy（现在：${healthStatus(HEALTHY)}）`).toBe('healthy')
      expect(await waitForHealth(UNHEALTHY, 'unhealthy'), `unhealthy 靶子没转成 unhealthy（现在：${healthStatus(UNHEALTHY)}）`).toBe('unhealthy')
    }, 120_000)

    afterAll(() => {
      docker(['rm', '-f', HEALTHY, UNHEALTHY], 60_000)
      for (const dir of projectDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
      expect(containerExists(HEALTHY), 'healthy 靶子没被清掉').toBe(false)
      expect(containerExists(UNHEALTHY), 'unhealthy 靶子没被清掉').toBe(false)
    })

    it('真 daemon 的结构满足模板，且与入库样本的字段类型一致', () => {
      const raw = docker(['inspect', HEALTHY], 20_000)
      expect(raw.code, `docker inspect 失败：${raw.out}`).toBe(0)
      const shape = shapeOf(JSON.parse(raw.out)[0])
      expect(templateProblems(INSPECT_TEMPLATE, shape)).toEqual([])
      // 样本与当下这台 daemon 的**类型**逐条对上：样本过期的表现就是这一条开始红
      for (const { path } of templatePaths(INSPECT_TEMPLATE)) {
        expect(walkSample(shape, path), `路径 .${path} 与入库样本的类型不一致`).toBe(walkSample(FIXTURE, path))
      }
    })

    it('真 CLI 渲染的那一行是五段，最后一段就是健康状态', () => {
      const rendered = docker(['inspect', '--format', INSPECT_TEMPLATE, HEALTHY], 20_000)
      expect(rendered.code, `模板没渲染出来（模板写错时 docker 会直接报错）：${rendered.out}`).toBe(0)
      const parts = rendered.out.trim().split('|')
      expect(parts).toHaveLength(5)
      expect(parts[0]).toBe('running')
      expect(parts[4]).toBe('healthy')
    })

    it('插件本体：清单要 `healthcheck` 时，真 healthy 容器给 `✓`', async () => {
      const dir = projectFor(HEALTHY, 'healthcheck')
      const text = await mountReadOnly(dir).call('env_status', { target: 'here', cwd: dir })
      expect(text, text).toContain(`✓ ${HEALTHY}`)
      expect(text, text).toContain('健康检查 healthy')
    })

    it('插件本体：真 unhealthy 容器给 `✗`，且 `env_wait` 不空等', async () => {
      const dir = projectFor(UNHEALTHY, 'healthcheck')
      const status = await mountReadOnly(dir).call('env_status', { target: 'here', cwd: dir })
      expect(status, status).toContain(`✗ ${UNHEALTHY}`)
      expect(status, status).toContain('健康检查 unhealthy')

      // 否证 ≠ 未就绪：等到的是「别等了」，而不是等满超时（20 秒的上限只为兜住回归）
      const wait = await mountReadOnly(dir).call('env_wait', { target: 'here', cwd: dir, timeoutMs: 20_000 })
      expect(wait, wait).toContain('明确否证')
      expect(wait, wait).not.toContain('等满')
    }, 30_000)
  },
)
