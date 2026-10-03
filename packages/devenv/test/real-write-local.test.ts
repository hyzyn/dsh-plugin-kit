/**
 * 写入口（`env_up` / `env_down`）的**常态验证**：本机 docker、一次性容器、不需要人指容器。
 *
 * ## 它补的是哪个洞（2026-10-03）
 *
 * 写路径此前只有两档：**假 docker 的单测**（快、到处能跑，但「第四层」——真的 `docker` 进程——
 * 从没被跑过）与**真机那一档**（`test/real-write.test.ts`，打 248 那台共享机器）。后者刻意要求
 * 人**指名**一个可以动的容器（那台机器上有同事在联调），所以它**不可能**进 CI、也就不可能常态跑。
 * 于是这条链路长期处在「逻辑有单测、真 CLI 只在人记得时验一次」的状态。
 *
 * 这一档把靶子换成**本机的一次性容器**：用例自己 `docker create` 一个 `sleep` 着的
 * busybox/alpine（唯一名字 + 标签，不绑端口、不挂卷、不进任何网络），跑完 `docker rm -f` 掉。
 * 于是「真 `docker start` / `docker stop --time` / 真 `docker inspect --format` 的模板」每次
 * `pnpm test` 都过一遍——**不需要人指任何东西**，CI 的 ubuntu 腿上自动跑。
 *
 * ## 前提缺失就 SKIP（不是红）
 *
 * 连不上 daemon、或本机没有可用镜像且拉不下来 → 整档 SKIP，理由写在套件名里。
 * 口径与本仓其余真机档一致：拿环境状况当失败信号只会训练人忽略红灯。
 *
 * ## 自己建的自己删，而且要看得见
 *
 * `afterAll` 里 `docker rm -f` 并**断言容器真的没了**（读回一次 `docker ps -a`）。理由与
 * `fixture-hygiene.test.ts` 同源：不留垃圾这件事，得有行为断言盯着，否则它只是在注释里。
 *
 * ## 仍然验不到的那一档
 *
 * 这台机器**没有 daemon** 时本档只会 SKIP；「真 daemon 上端到端」的验证面是**有 daemon 的机器**
 * （CI ubuntu 腿 / 维护者起了 Docker Desktop 时）。这一点在 ROADMAP 的落点里写明了，不靠注释暗示。
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { makeHost } from './fake-host.js'

/** 靶子的名字前缀与标签：一眼看出这是本用例建的（人肉兜底清理时不必猜）。 */
const CONTAINER_PREFIX = 'dsh-devenv-write-local-'
const CONTAINER_LABEL = 'dsh.devenv.test=write-local'

/** 跑一条 docker 命令（同步；靶子的准备与读回都是短命令）。 */
function docker(args: string[], timeoutMs = 60_000): { code: number; out: string } {
  const result = spawnSync('docker', args, { encoding: 'utf8', timeout: timeoutMs })
  const out = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim()
  return { code: result.status ?? 1, out }
}

/**
 * 挑一个能长跑的靶子镜像：**先看本机有没有**（不联网），没有才拉最小的那个。
 *
 * 可用 `DEVENV_LOCAL_WRITE_IMAGE` 指定（例如本机只有内网仓库里的镜像）。
 */
function pickImage(): { image: string } | { problem: string } {
  const override = process.env.DEVENV_LOCAL_WRITE_IMAGE
  const candidates = override === undefined || override === '' ? ['busybox:latest', 'alpine:latest'] : [override]

  for (const image of candidates) {
    if (docker(['image', 'inspect', image], 20_000).code === 0) return { image }
  }
  for (const image of candidates) {
    // 90 秒是有界的：拉不到就当「前提缺失」SKIP，不让它在收集期把整轮测试拖住
    const pulled = docker(['pull', image], 90_000)
    if (pulled.code === 0) return { image }
  }
  return {
    problem: `本机没有 ${candidates.join(' / ')} 且拉取失败——这是前提缺失，不是代码坏了（可用 DEVENV_LOCAL_WRITE_IMAGE 指定一个本机镜像）`,
  }
}

/**
 * 探 daemon；连不上就是「没起 Docker」，不是失败。
 *
 * **只看退出码、不依赖任何模板**：实测（2026-10-03，Docker Desktop 的 CLI 28.3.2）——
 * `docker version --format '{{.ServerVersion}}'` 在这台机器上直接报模板错（那个字段在
 * `version` 的 JSON 里不存在，正确写法是 `{{.Server.Version}}` 或 `docker info`），
 * 于是「daemon 明明在跑」也会被判成 SKIP。探针必须比被探的东西更笨。
 */
const daemon = docker(['info'], 20_000)
const serverVersion = daemon.code === 0 ? docker(['info', '--format', '{{.ServerVersion}}'], 20_000).out : ''
const prepared: { image: string } | { problem: string } =
  daemon.code === 0
    ? pickImage()
    : { problem: `连不上 docker daemon（${daemon.out.split('\n')[0] ?? ''}）` }

const IMAGE = 'image' in prepared ? prepared.image : ''
const SKIP_REASON = 'problem' in prepared ? prepared.problem : undefined

const CONTAINER = `${CONTAINER_PREFIX}${String(process.pid)}-${Math.random().toString(36).slice(2, 8)}`

let projectDir = ''
let created = false

/** 独立通道读回「现在到底在不在跑」——**不经过被测代码**，否则就是自证。 */
function isRunning(): boolean {
  return docker(['inspect', '-f', '{{.State.Running}}', CONTAINER], 20_000).out.trim() === 'true'
}

/** 造一个项目根 + 一份只要求「容器在跑」的清单（清单名缺省取目录名，project 必须与之一致）。 */
function projectFor(service: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-devenv-writelocal-'))
  const project = basename(dir)
  mkdirSync(join(dir, 'ready'), { recursive: true })
  writeFileSync(
    join(dir, 'ready', `${project}.ready.yaml`),
    ['version: 1', `project: ${project}`, 'services:', `  - name: ${service}`].join('\n'),
  )
  return dir
}

/** 一个带写闸门的本机目标（`stopTimeoutSec: 1` 让 `docker stop` 一秒收尾，不给用例塞 10 秒等待）。 */
function mountWritable(dir: string, grant: boolean): ReturnType<typeof makeHost> {
  const host = makeHost()
  if (grant) host.grant('DSH_DEVENV_WRITE')
  host.mount({
    stopTimeoutSec: 1,
    targets: [
      {
        id: 'here',
        label: '本机',
        kind: 'local',
        scopeDirs: [dir],
        writeCapability: { env: 'DSH_DEVENV_WRITE', label: '变更操作（启停容器）' },
      },
    ],
  })
  return host
}

describe.skipIf(SKIP_REASON !== undefined)(`写入口常态验证（本机一次性容器：${SKIP_REASON ?? `${IMAGE} · daemon ${serverVersion}`}）`, () => {
  beforeAll(() => {
    const made = docker(['create', '--name', CONTAINER, '--label', CONTAINER_LABEL, '--entrypoint', 'sleep', IMAGE, '600'])
    expect(made.code, `docker create 失败：${made.out}`).toBe(0)
    created = true
    projectDir = projectFor(CONTAINER)
    // 先让它跑起来：被拒的那两次要能证明「容器没被动过」，而「没被动过」只有在它本来在跑时才看得见。
    expect(docker(['start', CONTAINER]).code, 'docker start 前提准备失败').toBe(0)
  })

  afterAll(() => {
    if (created) docker(['rm', '-f', CONTAINER], 60_000)
    if (projectDir !== '') rmSync(projectDir, { recursive: true, force: true })
    // 收尾自证：容器真的没了（自己建的自己删，且这件事要有断言盯着）
    const left = docker(['ps', '-a', '--filter', `name=^/${CONTAINER}$`, '--format', '{{.Names}}'], 30_000)
    expect(left.out, '一次性靶子没被清掉').toBe('')
  })

  it('被拒的两次一条命令都没发：读回容器仍在跑', async () => {
    // 没授权：报能力那一档（它要先改启动环境并重启宿主，让人先说「改什么」是白跑一趟）
    const ungranted = await mountWritable(projectDir, false).callError('env_down', {
      target: 'here',
      cwd: projectDir,
      confirmed: true,
    })
    expect(ungranted).toContain('[CAPABILITY_NOT_GRANTED]')
    expect(isRunning(), '没授权的那次竟然动了容器').toBe(true)

    // 授权了但没带 confirmed：报确认那一档
    const unconfirmed = await mountWritable(projectDir, true).callError('env_down', {
      target: 'here',
      cwd: projectDir,
    })
    expect(unconfirmed).toContain('[CONFIRMATION_REQUIRED]')
    expect(isRunning(), '没带 confirmed 的那次竟然动了容器').toBe(true)
  })

  it('带 confirmed 的 env_down 真的停、env_up 真的启，且报告与真实状态一致', async () => {
    const host = mountWritable(projectDir, true)

    const down = await host.call('env_down', { target: 'here', cwd: projectDir, confirmed: true })
    expect(down).toContain('停止')
    expect(isRunning(), '报告说停了，而容器还在跑').toBe(false)

    // 观测面跟着真实状态走：清单只要求「容器在跑」，停掉之后检查项不该再是 ✓
    const status = await host.call('env_status', { target: 'here', cwd: projectDir })
    expect(status).toContain(CONTAINER)
    expect(status).not.toContain('✓')

    const up = await host.call('env_up', { target: 'here', cwd: projectDir, confirmed: true })
    expect(up).toContain('启动')
    expect(isRunning(), '报告说起了，而容器没在跑').toBe(true)
  })

  it('已经在跑时 env_up 是「无需变更」：不需要确认，也不动手', async () => {
    const host = mountWritable(projectDir, true)
    const text = await host.call('env_up', { target: 'here', cwd: projectDir })
    expect(text).toContain('无需变更')
    expect(text).not.toContain('[CONFIRMATION_REQUIRED]')
    expect(isRunning()).toBe(true)
  })

  it('清单里的名字在目标上不存在：报告单列「观测不到」，且**不碰**别的容器', async () => {
    const other = projectFor('dsh-devenv-nonexistent-service')
    const host = mountWritable(other, true)
    const text = await host.call('env_up', { target: 'here', cwd: other, confirmed: true })
    expect(text).toContain('观测不到')
    expect(isRunning(), '清单外的东西被动了').toBe(true)
    rmSync(other, { recursive: true, force: true })
  })
})
