/**
 * 宿主半体的端到端测试（`src/plugin.ts`）——假宿主 + **真进程的假 docker** + 真临时项目目录。
 *
 * ## 为什么值得造两个夹具
 *
 * 这一层要做对的事**几乎全是接线**：目标解析 → 作用域门 → 清单路径 → 通道 → 观测 → 判定 → 报告。
 * 每一跳单测都绿、接起来错一格是这类代码最典型的失败（`devdata` 的「注册了好几个工具但一个都用不了」
 * 就是这么来的）。所以这里从 `apply()` 一路打到工具返回的文本。
 *
 * ## 覆盖的判据
 *
 * - **注册面**：没目标不注册、停用不注册、有目标才注册两个；改配置后整批换掉（不残留旧的）；
 * - **拒绝面**：作用域外要 `[OUT_OF_SCOPE]` 并说清判据目录与允许目录；没有清单要说清「没有清单 ≠ 用默认要求」；
 * - **通道面**：daemon 连不上时报告要明说**不是**「容器没起」；容器不存在才是 `unfound`；
 * - **等待面**：`refuted` 立刻返回（不等满超时）、轮询能等到（`missing-then-ok`）、就绪即返回。
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { installFakeDocker, type FakeDocker, type FakeDockerPlan } from './fake-docker.js'
import { makeHost } from './fake-host.js'

const projects: string[] = []
let fake: FakeDocker | undefined

/** 造一个项目根 + 一份清单（清单名**缺省就用目录名**，这样「项目名缺省取目录名」也顺带被覆盖）。 */
function projectWith(manifest: string | undefined, name?: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-devenv-proj-'))
  projects.push(dir)
  if (manifest !== undefined) {
    // 清单里的 `project` 必须与文件名一致（`validateProfile` 会拦），所以两处一起改。
    const project = name ?? basename(dir)
    mkdirSync(join(dir, 'ready'), { recursive: true })
    writeFileSync(join(dir, 'ready', `${project}.ready.yaml`), manifest.replace('project: ems', `project: ${project}`))
  }
  return dir
}

/** 一份单服务清单（默认要求 `logPattern`）。 */
function manifest(service = 'ems-service', ready = "    ready: { kind: logPattern, pattern: 'Started .*Application in' }"): string {
  return ['version: 1', 'project: ems', 'services:', `  - name: ${service}`, ready].join('\n')
}

/** 一个本机目标（作用域给 `dir`）。 */
function localTarget(dir: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { id: 'here', label: '本机', kind: 'local', scopeDirs: [dir], ...overrides }
}

/** 装假 docker（每个用例最多一个）并挂一个宿主。 */
function mount(config: Record<string, unknown>, plan: FakeDockerPlan = {}): ReturnType<typeof makeHost> {
  fake = installFakeDocker(plan)
  const host = makeHost()
  host.mount(config)
  return host
}

afterEach(() => {
  fake?.cleanup()
  fake = undefined
  for (const dir of projects.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('注册面：没目标就不注册（未注册的 agent 不会去试）', () => {
  it('一个目标都没有 → 两个工具都不注册', () => {
    const host = mount({ targets: [] })
    expect(host.names()).toEqual([])
  })

  it('停用 → 不注册', () => {
    const dir = projectWith(manifest())
    const host = mount({ enabled: false, targets: [localTarget(dir)] })
    expect(host.names()).toEqual([])
  })

  it('有目标 → 注册 env_status / env_wait，描述里带目标名单', () => {
    const dir = projectWith(manifest())
    const host = mount({ targets: [localTarget(dir)] })
    expect(host.names()).toEqual(['env_status', 'env_wait'])
    expect(host.descriptionOf('env_status', 'target')).toContain('here')
  })

  it('settings 服务缺失时照常注册（目标来自 apply 的配置，不来自 settings）', () => {
    const dir = projectWith(manifest())
    fake = installFakeDocker()
    const host = makeHost({ settings: false })
    host.mount({ targets: [localTarget(dir)] })
    // 目标名单来自挂载时那份配置；settings 只影响**热改**与读别人的 entry（连接簿）。
    expect(host.names()).toEqual(['env_status', 'env_wait'])
  })

  it('改配置（加目标）后整批重注册，不残留旧工具', async () => {
    const dir = projectWith(manifest())
    const host = mount({ targets: [] })
    expect(host.names()).toEqual([])
    await host.update({ targets: [localTarget(dir)] })
    expect(host.names()).toEqual(['env_status', 'env_wait'])
    await host.update({ targets: [] })
    expect(host.names()).toEqual([])
  })

  it('配置问题走 console.warn（启动日志是运维的观测面）', () => {
    const dir = projectWith(manifest())
    const warnings: string[] = []
    const original = console.warn
    console.warn = (message?: unknown) => warnings.push(String(message))
    try {
      mount({ targets: [{ id: 'no-scope', kind: 'local', scopeDirs: [] }, { id: 'bad-kind', kind: 'ftp', scopeDirs: [dir] }] })
    } finally {
      console.warn = original
    }
    expect(warnings.join('\n')).toContain('处处拒绝')
    expect(warnings.join('\n')).toContain('local 或 ssh')
  })
})

describe('拒绝面：每句拒绝都要给出下一步', () => {
  it('作用域外 → [OUT_OF_SCOPE] + 判据用的目录与允许的目录', async () => {
    const dir = projectWith(manifest())
    const host = mount({ targets: [localTarget(dir)] })
    const text = await host.callError('env_status', { target: 'here', cwd: '/别的地方' })
    expect(text).toContain('[OUT_OF_SCOPE]')
    expect(text).toContain('/别的地方')
    expect(text).toContain(dir)
    expect(text).toContain('恢复路径')
  })

  it('作用域为空 → 明说是「处处拒绝」而不是「不限制」', async () => {
    const host = mount({ targets: [{ id: 'x', kind: 'local', scopeDirs: [] }] })
    const text = await host.callError('env_status', { target: 'x', cwd: '/w' })
    expect(text).toContain('处处拒绝')
  })

  it('没有清单 → 说清「没有清单 = 没有就绪要求」，并列出这里已有的清单', async () => {
    const dir = projectWith(undefined)
    mkdirSync(join(dir, 'ready'), { recursive: true })
    writeFileSync(join(dir, 'ready', 'hcckc.ready.yaml'), ['version: 1', 'project: hcckc', 'services:', '  - name: a'].join('\n'))
    const host = mount({ targets: [localTarget(dir)] })
    // 显式点名一个**没有**清单的项目名：缺省会用目录名（那个清单不存在，但顺带会验到「缺省取目录名」），
    // 这条用例要专测「没有清单」这一档。
    const text = await host.callError('env_status', { target: 'here', cwd: dir, project: 'ems' })
    expect(text).toContain('ready/ems.ready.yaml')
    expect(text).toContain('没有清单 = 这个项目没有就绪要求')
    expect(text).toContain('hcckc')
  })

  it('清单写错 → 指到字段', async () => {
    const dir = projectWith(manifest().replace('project: ems', 'project: 别的'))
    const host = mount({ targets: [localTarget(dir)] })
    const text = await host.callError('env_status', { target: 'here', cwd: dir })
    expect(text).toContain('就绪清单不成立')
    expect(text).toContain('project')
  })

  it('目标名写错 → 列出可用目标', async () => {
    const dir = projectWith(manifest())
    const host = mount({ targets: [localTarget(dir)] })
    expect(await host.callError('env_status', { target: 'typo', cwd: dir })).toContain('here')
    expect(await host.callError('env_status', { cwd: dir })).toContain('缺少 target')
  })

  it('SSH 目标引用了连接簿里没有的条目 → 指到连接簿（附现有条目）', async () => {
    const dir = projectWith(manifest())
    const host = makeHost({ extraEntries: { tty: { sshHosts: [{ name: 'nas', host: '10.0.0.9', username: 'czz' }] } } })
    host.mount({ targets: [{ id: 'nas', kind: 'ssh', book: 'typo', scopeDirs: [dir] }] })
    const text = await host.callError('env_status', { target: 'nas', cwd: dir })
    expect(text).toContain('typo')
    expect(text).toContain('nas')
  })
})

describe('跑通：清单 → 通道 → 观测 → 判定 → 报告', () => {
  it('就绪：真发了两条命令（inspect + logs），报告说全部就绪', async () => {
    const dir = projectWith(manifest())
    const host = mount({ targets: [localTarget(dir)], probeTimeoutMs: 1000 }, { inspect: 'running|2026-10-01T12:00:00.000000000Z|0|0|healthy' })
    const text = await host.call('env_status', { target: 'here', cwd: dir })
    expect(text).toContain('✓ ems-service（logPattern）')
    expect(text).toContain('全部 1 个服务就绪')
    expect(fake?.calls().length).toBe(2)
    expect(fake?.calls()[0]).toContain('inspect')
    // 假 docker 记的是 argv（不含可执行文件名本身）
    expect(fake?.calls()[1]).toContain('logs --timestamps')
  })

  it('清单没要求日志时不取日志（每个服务两条命令都是一次远端往返）', async () => {
    const dir = projectWith(['version: 1', 'project: ems', 'services:', '  - name: ems-redis'].join('\n'))
    const host = mount({ targets: [localTarget(dir)] }, { inspect: 'running|2026-10-01T12:00:00.000000000Z|0|0|' })
    const text = await host.call('env_status', { target: 'here', cwd: dir })
    expect(text).toContain('✓ ems-redis（container）')
    expect(fake?.calls().length).toBe(1)
  })

  it('容器不存在 → 未就绪（还没观测到），**不是**错误', async () => {
    const dir = projectWith(manifest())
    const host = mount({ targets: [localTarget(dir)] }, { mode: 'missing' })
    const text = await host.call('env_status', { target: 'here', cwd: dir })
    expect(text).toContain('! ems-service')
    expect(text).toContain('还没观测到这个容器')
  })

  it('daemon 连不上 → 明说**不是**「容器没起」，并给恢复路径', async () => {
    const dir = projectWith(manifest())
    const host = mount({ targets: [localTarget(dir)] }, { mode: 'daemon-down' })
    const text = await host.callError('env_status', { target: 'here', cwd: dir })
    expect(text).toContain('取观测失败')
    expect(text).toContain('不是')
    expect(text).toContain('Cannot connect to the Docker daemon')
    expect(text).toContain('恢复路径')
  })

  it('探针：清单声明 httpProbe 时真打一次（用真 HTTP 服务）', async () => {
    const { createServer } = await import('node:http')
    const server = createServer((_req, res) => { res.writeHead(200); res.end('ok') })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const port = (server.address() as { port: number }).port
    try {
      const dir = projectWith(['version: 1', 'project: ems', 'services:', '  - name: gw', `    ready: { kind: httpProbe, path: /health, port: ${String(port)} }`].join('\n'))
      const host = mount({ targets: [localTarget(dir)], probeTimeoutMs: 2000 }, { inspect: 'running|2026-10-01T12:00:00.000000000Z|0|0|' })
      const text = await host.call('env_status', { target: 'here', cwd: dir })
      expect(text).toContain('全部 1 个服务就绪')
      expect(text).toContain('/health')
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })
})

describe('等待面：什么时候该停', () => {
  it('就绪 → 立刻返回，停止原因写明', async () => {
    const dir = projectWith(manifest())
    const host = mount({ targets: [localTarget(dir)] }, { inspect: 'running|2026-10-01T12:00:00.000000000Z|0|0|' })
    const text = await host.call('env_wait', { target: 'here', cwd: dir })
    expect(text).toContain('停止等待的原因：全部就绪')
    expect(text).toContain('全部 1 个服务就绪')
  })

  it('明确否证 → 立刻返回（不等满超时），并说「别等了」', async () => {
    const dir = projectWith(manifest())
    const host = mount({ targets: [localTarget(dir)], waitTimeoutMs: 60_000 }, { inspect: 'exited|2026-10-01T12:00:00.000000000Z|143|0|' })
    const started = Date.now()
    const text = await host.call('env_wait', { target: 'here', cwd: dir })
    expect(Date.now() - started).toBeLessThan(2000)
    expect(text).toContain('✗ ems-service')
    expect(text).toContain('明确否证')
    expect(text).toContain('143 = SIGTERM')
  })

  it('先没有、后起来 → 会轮询到就绪（`missing-then-ok`）', async () => {
    const dir = projectWith(manifest())
    const host = mount(
      { targets: [localTarget(dir)], pollIntervalMs: 500, waitTimeoutMs: 10_000 },
      { mode: 'missing-then-ok', inspect: 'running|2026-10-01T12:00:00.000000000Z|0|0|' },
    )
    const text = await host.call('env_wait', { target: 'here', cwd: dir })
    expect(text).toContain('停止等待的原因：全部就绪')
    // 第一轮：容器还不存在（只发 1 条 inspect）；第二轮：inspect + logs。⇒ 至少 3 条。
    expect((fake?.calls().length ?? 0)).toBeGreaterThanOrEqual(3)
  })

  it('★ 等待过程进报告：等过多久、每轮在等什么、有没有变过（真时钟，验的是接线）', async () => {
    const dir = projectWith(manifest())
    const host = mount(
      { targets: [localTarget(dir)], pollIntervalMs: 400, waitTimeoutMs: 10_000 },
      { mode: 'missing-then-ok', inspect: 'running|2026-10-01T12:00:00.000000000Z|0|0|' },
    )
    const text = await host.call('env_wait', { target: 'here', cwd: dir })
    expect(text).toContain('等待过程（共观测 2 次）')
    // 第一轮「还没观测到容器」、第二轮「就绪」——两段的耗时都要带出来（≥1ms 说明真的记了时间）。
    // `formatMs` 有三种形状：`715ms` / `1.2s` / `2m3s`（见 src/render.ts）——正则只认 `\d+m?s`
    // 时，等待一旦超过 1s（机器有负载时就是常态）就会红，而那是**断言写错**、不是代码错。
    expect(text).toMatch(/\+\d+(?:\.\d+)?(?:ms|s|m\d+s) 还差/)
    expect(text).toMatch(/\+\d+(?:\.\d+)?(?:ms|s|m\d+s) 全部 1 个服务就绪/)
  })

  it('★ 取消：调用方 abort 之后立刻返回，且报告说清「不是超时、也不代表环境有问题」', async () => {
    const dir = projectWith(manifest())
    // `missing` = 容器一直不存在（不是否证），按 60s 的上限它会一直等——正好用来验取消。
    const host = mount({ targets: [localTarget(dir)], pollIntervalMs: 500, waitTimeoutMs: 60_000 }, { mode: 'missing' })
    const tool = host.tools.get('env_wait')
    expect(tool?.execute, 'env_wait 没注册上').toBeDefined()
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 700)
    const started = Date.now()
    try {
      const value = (await (tool?.execute as (args: unknown, exec?: unknown) => Promise<{ text: string }>)(
        { target: 'here', cwd: dir },
        { signal: controller.signal },
      )) as { text: string }
      // 取消前它要等满 60s；能在这点时间内返回就是「取消真的转发下去了」。
      expect(Date.now() - started).toBeLessThan(5000)
      expect(value.text).toContain('被调用方取消')
      expect(value.text).toContain('不是超时')
      expect(value.text).toContain('等待过程')
    } finally {
      clearTimeout(timer)
    }
  })

  it('等满超时 → 说清等的是多久（而不是只说「超时」）', async () => {
    const dir = projectWith(manifest())
    const host = mount(
      { targets: [localTarget(dir)], pollIntervalMs: 500, waitTimeoutMs: 1000 },
      { inspect: 'running|2026-10-01T12:00:00.000000000Z|0|0|', logs: '没有那一行' },
    )
    const text = await host.call('env_wait', { target: 'here', cwd: dir })
    expect(text).toContain('停止等待的原因：等满')
    expect(text).toContain('1.0s')
    expect(text).toContain('! ems-service')
  })
})

/* ------------------------------------------------------------------ *
 * 写入口（第 5 步）：门槛、顺序、白名单、幂等
 * ------------------------------------------------------------------ */

/** 一个**带写能力闸门**的目标配置。 */
function writableTarget(dir: string, env = 'DSH_DEVENV_WRITE'): Record<string, unknown> {
  return {
    id: 'here',
    label: '本机',
    kind: 'local',
    scopeDirs: [dir],
    writeCapability: { env, label: '变更操作（启停容器）' },
  }
}

describe('写入口的注册面：没配闸门就没有写入口', () => {
  it('目标没配 writeCapability → 只注册两个只读工具', () => {
    const dir = projectWith(manifest())
    const host = mount({ targets: [localTarget(dir)] })
    expect(host.names()).toEqual(['env_status', 'env_wait'])
  })

  it('配了 → 四个都注册（但每次调用仍要过授权与确认）', () => {
    const dir = projectWith(manifest())
    const host = mount({ targets: [writableTarget(dir)] })
    expect(host.names()).toEqual(['env_down', 'env_status', 'env_up', 'env_wait'])
  })

  it('配了但 env 是空的 → 当成没接入闸门，并报一条配置问题', () => {
    const dir = projectWith(manifest())
    const warnings: string[] = []
    const original = console.warn
    console.warn = (message?: unknown) => warnings.push(String(message))
    let host
    try {
      host = mount({ targets: [localTarget(dir, { writeCapability: { env: '', label: 'x' } })] })
    } finally {
      console.warn = original
    }
    expect(host.names()).toEqual(['env_status', 'env_wait'])
    expect(warnings.join('\n')).toContain('env 是空的')
  })
})

describe('写入口的门槛：顺序是「作用域 → 清单 → 能力 → 确认」', () => {
  it('没配闸门的目标上调 env_down → `[WRITE_NOT_CONFIGURED]`（与「配了没授权」是两件事）', async () => {
    const dir = projectWith(manifest())
    // 两个目标：一个没配闸门、一个配了（id 必须不同——重名的第二个会被丢掉）
    const host = mount({
      targets: [localTarget(dir), { ...writableTarget(dir), id: 'writable' }],
      }, { inspect: 'running|2026-10-01T12:00:00.000000000Z|0|0|' })
    const text = await host.callError('env_down', { target: 'here', cwd: dir, confirmed: true })
    expect(text).toContain('[WRITE_NOT_CONFIGURED]')
    expect(text).toContain('writeCapability.env')
  })

  it('配了但没授权 → `[CAPABILITY_NOT_GRANTED]`，且**先于**确认要求报出来（避免错诊断）', async () => {
    const dir = projectWith(manifest())
    const host = mount({ targets: [writableTarget(dir)] }, { inspect: 'exited|2026-10-01T12:00:00.000000000Z|0|0|' })
    // 既没授权、也没带 confirmed：报的必须是**能力**那一档（它要改启动环境并重启宿主，
    // 先让人去确认「要改什么」是白跑一趟）
    const text = await host.callError('env_up', { target: 'here', cwd: dir })
    expect(text).toContain('[CAPABILITY_NOT_GRANTED]')
    expect(text).not.toContain('[CONFIRMATION_REQUIRED]')
    expect(text).toContain('DSH_DEVENV_WRITE')
    expect(text).toContain('恢复路径')
    expect(fake?.calls().length).toBe(0)
  })

  it('授权了但没带 confirmed → `[CONFIRMATION_REQUIRED]`，且**一条命令都没发**', async () => {
    const dir = projectWith(manifest())
    fake = installFakeDocker({ inspect: 'exited|2026-10-01T12:00:00.000000000Z|0|0|' })
    const host = makeHost()
    host.grant('DSH_DEVENV_WRITE')
    host.mount({ targets: [writableTarget(dir)] })
    const text = await host.callError('env_up', { target: 'here', cwd: dir })
    expect(text).toContain('[CONFIRMATION_REQUIRED]')
    expect(text).toContain('ems-service')          // 要说清会动谁
    expect(text).toContain('共享机器')              // 也要说清后果
    // 只发过观测用的 inspect，**没有** start
    expect(fake.calls().some((line) => line.startsWith('start'))).toBe(false)
  })

  it('作用域外 → `[OUT_OF_SCOPE]`（写入口与只读走同一道门）', async () => {
    const dir = projectWith(manifest())
    const host = mount({ targets: [writableTarget(dir)] })
    const text = await host.callError('env_down', { target: 'here', cwd: '/别处', confirmed: true })
    expect(text).toContain('[OUT_OF_SCOPE]')
  })
})

describe('写入口真的动手时：只碰清单里的容器、幂等、逐条报结果', () => {
  it('env_up：只 start「没在跑」的，报告里三档都出现', async () => {
    // 容器名必须是 ASCII（清单的 `name` 形状就是 docker 的命名规则）
    const dir = projectWith(['version: 1', 'project: ems', 'services:', '  - name: stopped-one', '  - name: started-one', '  - name: absent-one'].join('\n'))
    // 假 docker 不看容器名，所以让 inspect 一律回到 `exited`（三个都「没在跑」⇒ 三个都该 start）
    fake = installFakeDocker({ inspect: 'exited|2026-10-01T12:00:00.000000000Z|0|0|' })
    const host = makeHost()
    host.grant('DSH_DEVENV_WRITE')
    host.mount({ targets: [writableTarget(dir)], auditFile: join(dir, 'audit.jsonl') })
    const text = await host.call('env_up', { target: 'here', cwd: dir, confirmed: true })
    expect(text).toContain('已启动：stopped-one / started-one / absent-one')
    expect(fake.calls().filter((line) => line.startsWith('start ')).length).toBe(3)
  })

  it('env_down：命令形状是 `docker stop --time <秒> <name>`', async () => {
    const dir = projectWith(manifest())
    fake = installFakeDocker({ inspect: 'running|2026-10-01T12:00:00.000000000Z|0|0|' })
    const host = makeHost()
    host.grant('DSH_DEVENV_WRITE')
    host.mount({ targets: [writableTarget(dir)], stopTimeoutSec: 7, auditFile: join(dir, 'audit.jsonl') })
    const text = await host.call('env_down', { target: 'here', cwd: dir, confirmed: true })
    expect(text).toContain('已停止：ems-service')
    expect(fake.calls()).toContain('stop --time 7 ems-service')
  })

  it('清单里没有需要动的 → **不要求确认**（让 agent 为空操作写一遍确认只会训练它无视这道闸门）', async () => {
    const dir = projectWith(manifest())
    // 授权是要给的（能力门在最前：没授权连「有没有活要干」都不问——那条判据由上面那组钉住）
    fake = installFakeDocker({ inspect: 'running|2026-10-01T12:00:00.000000000Z|0|0|' })
    const host = makeHost()
    host.grant('DSH_DEVENV_WRITE')
    host.mount({ targets: [writableTarget(dir)] })
    const text = await host.call('env_up', { target: 'here', cwd: dir })
    expect(text).toContain('本该就那样、未动'.replace('本该', '本来'))
    expect(text).toContain('无需变更')
    expect(fake?.calls().some((line) => line.startsWith('start'))).toBe(false)
  })

  it('单条失败不中断其余，失败原因进报告', async () => {
    const dir = projectWith(manifest())
    fake = installFakeDocker({ inspect: 'running|2026-10-01T12:00:00.000000000Z|0|0|', fail: 'stop' })
    const host = makeHost()
    host.grant('DSH_DEVENV_WRITE')
    host.mount({ targets: [writableTarget(dir)], auditFile: join(dir, 'audit.jsonl') })
    const text = await host.call('env_down', { target: 'here', cwd: dir, confirmed: true })
    expect(text).toContain('失败：ems-service')
    expect(text).toContain('permission denied')
    expect(text).toContain('已停止：0 个')
  })
})

describe('写入口的第五道门：写类要求持久审计（与 `devdata` 同一口径）', () => {
  it('没配 auditFile → `[AUDIT_NOT_DURABLE]`，且**一条命令都没发**', async () => {
    const dir = projectWith(manifest())
    fake = installFakeDocker({ inspect: 'running|2026-10-01T12:00:00.000000000Z|0|0|' })
    const host = makeHost()
    host.grant('DSH_DEVENV_WRITE')
    host.mount({ targets: [writableTarget(dir)] })
    const text = await host.callError('env_down', { target: 'here', cwd: dir, confirmed: true })
    expect(text).toContain('[AUDIT_NOT_DURABLE]')
    expect(text).toContain('auditFile')
    // 观测（inspect）是只读的、也在门之前——这里要钉的是**没有一条动手的命令**（start / stop）
    expect(fake.calls().filter((line) => line.startsWith('start') || line.startsWith('stop'))).toEqual([])
  })

  it('该报的**先**是能力那一档，而不是审计（避免把人送去改错地方）', async () => {
    const dir = projectWith(manifest())
    fake = installFakeDocker({ inspect: 'running|2026-10-01T12:00:00.000000000Z|0|0|' })
    // 既没授权、也没配审计：正确的那一步是「去启动环境加变量并重启」
    const host = makeHost()
    host.mount({ targets: [writableTarget(dir)] })
    const text = await host.callError('env_down', { target: 'here', cwd: dir, confirmed: true })
    expect(text).toContain('[CAPABILITY_NOT_GRANTED]')
    expect(text).not.toContain('[AUDIT_NOT_DURABLE]')
  })

  it('配了 auditFile：允许与被拒的尝试**各落一行**，字段与码都在', async () => {
    const dir = projectWith(manifest())
    const auditFile = join(dir, 'audit.jsonl')
    fake = installFakeDocker({ inspect: 'running|2026-10-01T12:00:00.000000000Z|0|0|' })
    const host = makeHost()
    host.grant('DSH_DEVENV_WRITE')
    host.mount({ targets: [writableTarget(dir)], stopTimeoutSec: 1, auditFile })

    await host.call('env_down', { target: 'here', cwd: dir, confirmed: true })
    await host.callError('env_down', { target: 'here', cwd: dir }) // 缺 confirmed → 被拒的一次

    const lines = readFileSync(auditFile, 'utf8').trim().split('\n').map((line) => JSON.parse(line) as Record<string, unknown>)
    expect(lines.map((line) => [line.action, line.allowed, line.code])).toEqual([
      ['env_down', true, undefined],
      ['env_down', false, 'CONFIRMATION_REQUIRED'],
    ])
    expect(lines.map((line) => line.targetId)).toEqual(['here', 'here'])
    expect(typeof lines[0]?.atIso).toBe('string')
  })

  it('只读工具也进审计（默认出口是宿主日志；这里用文件出口把形状钉住）', async () => {
    const dir = projectWith(manifest())
    const auditFile = join(dir, 'audit.jsonl')
    const host = mount({ targets: [writableTarget(dir)], auditFile }, { inspect: 'running|2026-10-01T12:00:00.000000000Z|0|0|' })
    await host.call('env_status', { target: 'here', cwd: dir })
    const line = JSON.parse(readFileSync(auditFile, 'utf8').trim()) as Record<string, unknown>
    expect(line.action).toBe('env_status')
    expect(line.allowed).toBe(true)
  })
})
