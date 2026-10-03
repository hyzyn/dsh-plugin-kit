/**
 * 就绪判据求值测试（`docs/devdata-plan.md` §13.2）。
 *
 * > **归属（2026-10-02）**：随判据层一起从 `packages/devdata/test/env-ready.test.ts` 迁来
 * > （plan §16.1 第 2 步：建包与迁移必须同一步，否则要么先建空包、要么让 `devdata` 暂时少一块
 * > 已声明能力）。用例内容未改，只加了这一段。
 *
 * 这一层的失败方式不是崩溃，而是**判错时机**：
 *   - 判早了 → 测试跑在热启动中间 → 一串假阴性，人再去查一圈代码；
 *   - 判晚了 → 容器崩了还等满超时，agent 拿到「超时」只会**再等一次**。
 *
 * 所以用例的重点是那两条边界：**重启后残留的启动完成行**，与 **`refuted` 必须与 `unready` 分开**。
 */

import { describe, expect, it } from 'vitest'

import {
  evaluateProfile,
  evaluateService,
  formatDuration,
  lineInstant,
  parseInstant,
  profilesIn,
  validateProfile,
  type ReadyProfile,
  type ServiceObservation,
  type ServiceRequirement,
} from '../src/index.js'

const T0 = '2026-10-01T12:00:00.000000000Z'
const T1 = '2026-10-01T12:00:05.000000000Z'
const T2 = '2026-10-01T12:00:10.000000000Z'

/** 造一个观测。 */
function obs(overrides: Partial<ServiceObservation> = {}): ServiceObservation {
  return { name: 'ems-service', found: true, status: 'running', startedAt: T0, ...overrides }
}

/** 造一个要求。 */
function req(overrides: Partial<ServiceRequirement> = {}): ServiceRequirement {
  return { name: 'ems-service', ...overrides }
}

describe('容器层：不在跑就是明确否证', () => {
  it('exited → refuted，并带上退出码（143 = SIGTERM 要认出来）', () => {
    const result = evaluateService(req(), obs({ status: 'exited', exitCode: 143 }))
    expect(result.verdict).toBe('refuted')
    expect(result.message).toContain('143')
    expect(result.message).toContain('SIGTERM')
  })

  it('restarting → 也算 refuted（等下去只会看到又一次重启）', () => {
    expect(evaluateService(req(), obs({ status: 'restarting' })).verdict).toBe('refuted')
  })

  it('dead / created / paused 都否证', () => {
    for (const status of ['dead', 'created', 'paused'] as const) {
      expect(evaluateService(req(), obs({ status })).verdict, status).toBe('refuted')
    }
  })

  it('没观测到容器 → unready（缺证，不是否证）', () => {
    expect(evaluateService(req(), undefined).verdict).toBe('unready')
    expect(evaluateService(req(), obs({ found: false })).verdict).toBe('unready')
  })

  it('只要求容器在跑（清单没给 ready）→ running 就就绪', () => {
    const result = evaluateService(req(), obs())
    expect(result.verdict).toBe('ready')
    expect(result.dimension).toBe('container')
  })

  it('重启次数不为 0 **不否证**，但要留在证据里', () => {
    const result = evaluateService(req(), obs({ restartCount: 3 }))
    expect(result.verdict).toBe('ready')
    expect(result.met.join(' ')).toContain('已重启 3 次')
  })
})

describe('时间基准：StartedAt 必须能解析', () => {
  it('StartedAt 缺失 → unready，且说清要什么格式', () => {
    const result = evaluateService(req({ ready: { kind: 'healthcheck' } }), obs({ startedAt: undefined, health: 'healthy' }))
    expect(result.verdict).toBe('unready')
    expect(result.missing.join(' ')).toContain('StartedAt')
  })

  it('**没有时区的时间串算取不到**（它是歧义的，而这里在做先后比较）', () => {
    // 失败意味着：判定结果会随机器时区而变。
    expect(parseInstant('2026-10-01T12:00:00')).toBeUndefined()
    expect(parseInstant(T0)).toBeTypeOf('number')
    expect(parseInstant('2026-10-01T12:00:00+08:00')).toBeTypeOf('number')
  })

  it('非法 / 空串取不到', () => {
    for (const value of ['', '  ', 'not-a-time', '12:00:00']) {
      expect(parseInstant(value), value).toBeUndefined()
    }
  })
})

describe('logPattern：**重启后残留的启动完成行不算数**', () => {
  const ready = { kind: 'logPattern' as const, pattern: 'Started .*Application in' }

  it('命中且晚于本次 StartedAt → 就绪', () => {
    const result = evaluateService(
      req({ ready }),
      obs({ startedAt: T0, logLines: [`${T1} INFO Started EmsApplication in 12.5 seconds`] }),
    )
    expect(result.verdict).toBe('ready')
    expect(result.met.join(' ')).toContain('晚于本次 StartedAt')
  })

  it('**命中但早于本次 StartedAt → unready**（这是最危险的一刻）', () => {
    // 场景：容器刚重启，日志缓冲区里还留着上一个进程的启动完成行。
    // 只看「有没有这一行」会在重启那一瞬间判成就绪——而那正是最不该放行的一刻。
    const result = evaluateService(
      req({ ready }),
      // 容器在 T2 才启动，但日志里的完成行是 T1 的（上一次启动留下的）。
      obs({ startedAt: T2, logLines: [`${T1} INFO Started EmsApplication in 12.5 seconds`] }),
    )
    expect(result.verdict).toBe('unready')
    expect(result.message).toContain('上一次启动留下的')
    expect(result.missing.join(' ')).toContain('之后')
  })

  it('命中行没有时间戳 → unready（**不猜**它是不是本次的）', () => {
    const result = evaluateService(req({ ready }), obs({ startedAt: T0, logLines: ['INFO Started EmsApplication in 12s'] }))
    expect(result.verdict).toBe('unready')
    expect(result.message).toContain('无法确认它来自本次启动')
  })

  it('还没出现这一行 → unready（等待的常态）', () => {
    const result = evaluateService(req({ ready }), obs({ logLines: [`${T1} INFO Starting EmsApplication...`] }))
    expect(result.verdict).toBe('unready')
    expect(result.missing.join(' ')).toContain('Started')
  })

  it('日志一行都没有 → unready，并说清是「没拿到日志」', () => {
    const result = evaluateService(req({ ready }), obs({ logLines: [] }))
    expect(result.missing.join(' ')).toContain('日志')
  })

  it('docker logs 的 `--timestamps` 前缀能取到时刻，且**小数秒截到毫秒**', () => {
    // 期望值用 `.123`：**纳秒被截到 3 位**（`.123456789` → `.123`）。
    // 不截的话 `Date.parse` 对超过 3 位小数的处理各引擎不一致（实测会读成 123 毫秒的偏差），
    // 而这里在做先后比较，偏差是致命的。本用例钉的就是「截断发生过」。
    expect(lineInstant('2026-10-01T12:00:05.123456789Z INFO Started App in 3s')).toBe(Date.parse('2026-10-01T12:00:05.123Z'))
    // 与「无小数秒」的时刻差 123 毫秒——这正好证明截的是纳秒、留的是毫秒。
    expect(
      lineInstant('2026-10-01T12:00:05.123456789Z INFO x') - Date.parse('2026-10-01T12:00:05Z'),
    ).toBe(123)
  })

  it('行内带时区的时刻也能取到（时区可能隔着别的内容）', () => {
    // 实测形态：偏移量不在时间后面紧挨着，中间隔着日志级别与正文。
    expect(lineInstant('2026-10-01 12:00:05.123 INFO Started App in 3s +08:00')).toBeTypeOf('number')
    expect(lineInstant('2026-10-01 12:00:05 INFO Started App in 3s +0800')).toBeTypeOf('number')
  })

  it('行内没时区 → 取不到（不按本地时区猜）', () => {
    expect(lineInstant('2026-10-01 12:00:05.123 INFO Started App in 3s')).toBeUndefined()
    expect(lineInstant('INFO Started App in 3s')).toBeUndefined()
  })
})

describe('healthcheck 维度', () => {
  const ready = { kind: 'healthcheck' as const }

  it('healthy → 就绪', () => {
    expect(evaluateService(req({ ready }), obs({ health: 'healthy' })).verdict).toBe('ready')
  })

  it('starting → unready（还没转过来）', () => {
    const result = evaluateService(req({ ready }), obs({ health: 'starting' }))
    expect(result.verdict).toBe('unready')
    expect(result.message).toContain('starting')
  })

  it('unhealthy → **refuted**（别等了）', () => {
    expect(evaluateService(req({ ready }), obs({ health: 'unhealthy' })).verdict).toBe('refuted')
  })

  it('容器根本没配健康检查 → unready，且说清是「没配」而不是「没转过来」', () => {
    const result = evaluateService(req({ ready }), obs({ health: undefined }))
    expect(result.verdict).toBe('unready')
    expect(result.message).toContain('没有配健康检查')
  })
})

describe('httpProbe 维度：判定层不发请求', () => {
  const ready = { kind: 'httpProbe' as const, path: '/actuator/health', port: 8080 }

  it('没带探测结果 → unready，并说清是「执行层还没探」', () => {
    const result = evaluateService(req({ ready }), obs())
    expect(result.verdict).toBe('unready')
    // 判据要让 agent 知道缺的是**一次探测**，不是一个它自己没法补的数据项。
    expect(result.missing.join(' ')).toContain('执行层探一次')
    expect(result.message).toContain('/actuator/health')
  })

  it('探针 200 → 就绪', () => {
    expect(evaluateService(req({ ready }), obs({ probe: { ok: true, status: 200 } })).verdict).toBe('ready')
  })

  it('连不上 → unready（端口还没起来，继续等）', () => {
    const result = evaluateService(req({ ready }), obs({ probe: { ok: false, detail: 'ECONNREFUSED' } }))
    expect(result.verdict).toBe('unready')
    expect(result.message).toContain('ECONNREFUSED')
  })

  it('**5xx → refuted**（服务起来了但自己报错，等下去不会有结果）', () => {
    // 失败意味着：「启动就报错」的服务会被一直等到超时，而 agent 只会再等一次。
    const result = evaluateService(req({ ready }), obs({ probe: { ok: false, status: 503, detail: '503' } }))
    expect(result.verdict).toBe('refuted')
    expect(result.message).toContain('503')
  })

  it('404 之类的 4xx 不算否证（路径可能只是还没注册）', () => {
    expect(evaluateService(req({ ready }), obs({ probe: { ok: false, status: 404 } })).verdict).toBe('unready')
  })
})

describe('整份清单的汇总', () => {
  const profile: ReadyProfile = {
    version: 1,
    project: 'ems',
    services: [
      { name: 'redis', ready: undefined },
      { name: 'ems-service', ready: { kind: 'logPattern', pattern: 'Started' } },
    ],
  }

  it('全部就绪 → ready，summary 说清数量', () => {
    const evaluation = evaluateProfile({
      profile,
      observations: [
        obs({ name: 'redis' }),
        obs({ name: 'ems-service', logLines: [`${T1} Started EmsApplication`] }),
      ],
    })
    expect(evaluation.ready).toBe(true)
    expect(evaluation.anyRefuted).toBe(false)
    expect(evaluation.summary).toContain('2 个服务就绪')
  })

  it('还差服务 → 不就绪，summary 点名「缺什么」', () => {
    const evaluation = evaluateProfile({
      profile,
      observations: [obs({ name: 'redis' }), obs({ name: 'ems-service', logLines: [] })],
    })
    expect(evaluation.ready).toBe(false)
    expect(evaluation.anyRefuted).toBe(false)
    expect(evaluation.summary).toContain('ems-service')
    expect(evaluation.summary).toContain('还差 1 个服务')
  })

  it('**有服务被否证 → summary 明确说「别再等了」**', () => {
    const evaluation = evaluateProfile({
      profile,
      observations: [obs({ name: 'redis' }), obs({ name: 'ems-service', status: 'exited', exitCode: 1 })],
    })
    expect(evaluation.ready).toBe(false)
    expect(evaluation.anyRefuted).toBe(true)
    expect(evaluation.summary).toContain('别再等了')
  })

  it('没观测到的服务也要出现在结果里（不能静默少一项）', () => {
    const evaluation = evaluateProfile({ profile, observations: [obs({ name: 'redis' })] })
    expect(evaluation.services).toHaveLength(2)
    expect(evaluation.services.find((service) => service.name === 'ems-service')?.verdict).toBe('unready')
  })

  it('已等多久会带进结果（报告里要显示）', () => {
    const evaluation = evaluateProfile({
      profile,
      observations: [obs({ name: 'redis' }), obs({ name: 'ems-service', logLines: [] })],
      elapsedMs: { 'ems-service': 12345 },
    })
    expect(evaluation.services.find((service) => service.name === 'ems-service')?.elapsedMs).toBe(12345)
  })

  it('note 从清单带进结果（已知噪声要跟着走）', () => {
    const evaluation = evaluateProfile({
      profile: { ...profile, services: [{ name: 'x', note: '冷启动可达 150s' }] },
      observations: [obs({ name: 'x' })],
    })
    expect(evaluation.services[0]?.note).toBe('冷启动可达 150s')
  })
})

describe('清单校验', () => {
  const project = 'ems'

  function fixture(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      version: 1,
      project,
      services: [{ name: 'ems-service', ready: { kind: 'logPattern', pattern: 'Started .*Application in' } }],
      ...overrides,
    }
  }

  function pathsOf(data: unknown): string[] {
    const result = validateProfile(project, data)
    expect(result.ok, '期望被拒但通过了').toBe(false)
    return result.ok ? [] : result.errors.map((error) => error.path)
  }

  it('合法清单通过', () => {
    expect(validateProfile(project, fixture()).ok).toBe(true)
  })

  it('version / project 判据与断言库一致', () => {
    expect(pathsOf(fixture({ version: 2 }))).toContain('version')
    expect(pathsOf(fixture({ project: 'cdc' }))).toContain('project')
  })

  it('空 services / 非数组 → 拒', () => {
    expect(pathsOf(fixture({ services: [] }))).toContain('services')
    expect(pathsOf(fixture({ services: {} }))).toContain('services')
  })

  it('服务名形状：拒空、拒含 `/`、拒重复', () => {
    expect(pathsOf(fixture({ services: [{ name: '' }] }))).toContain('services[0].name')
    expect(pathsOf(fixture({ services: [{ name: 'a/b' }] }))).toContain('services[0].name')
    expect(pathsOf(fixture({ services: [{ name: 'a' }, { name: 'a' }] }))).toContain('services[1].name')
  })

  it('就绪维度必须是三类之一', () => {
    expect(pathsOf(fixture({ services: [{ name: 'a', ready: { kind: 'ping' } }] }))).toContain('services[0].ready.kind')
  })

  it('logPattern 的正则在加载时就编译（语法错不留到等待中途）', () => {
    const errors = validateProfile(project, fixture({ services: [{ name: 'a', ready: { kind: 'logPattern', pattern: '(' } }] }))
    expect(errors.ok).toBe(false)
    expect(errors.ok === false && errors.errors.some((error) => error.path === 'services[0].ready.pattern')).toBe(true)
  })

  it('httpProbe 的 path 必须以 / 开头、port 必须是 1–65535', () => {
    const base = { name: 'a' }
    expect(pathsOf(fixture({ services: [{ ...base, ready: { kind: 'httpProbe', path: 'health', port: 80 } }] }))).toContain(
      'services[0].ready.path',
    )
    for (const port of [0, 65536, 80.5, '80']) {
      expect(
        pathsOf(fixture({ services: [{ ...base, ready: { kind: 'httpProbe', path: '/h', port } }] })),
        String(port),
      ).toContain('services[0].ready.port')
    }
  })

  it('未知字段一律拒（不静默忽略）', () => {
    // `healthcheck` 不接参数：多写一个 `pattern` 说明作者把两种维度搞混了，必须报出来。
    expect(pathsOf(fixture({ services: [{ name: 'a', ready: { kind: 'healthcheck', pattern: 'x' } }] }))).toContain(
      'services[0].ready',
    )
    // 未知字段：`logPattern` 只认 `pattern`。
    expect(pathsOf(fixture({ services: [{ name: 'a', ready: { kind: 'logPattern', regex: 'x' } }] }))).toContain(
      'services[0].ready.regex',
    )
  })

  it('timeoutMs 必须是正整数', () => {
    for (const timeoutMs of [0, -1, 1.5]) {
      expect(pathsOf(fixture({ services: [{ name: 'a', timeoutMs }] })), String(timeoutMs)).toContain(
        'services[0].timeoutMs',
      )
    }
  })

  it('一次报全部错误', () => {
    const result = validateProfile(project, { version: 2, project: 'x', services: [{ name: '' }] })
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.errors.length).toBeGreaterThanOrEqual(3)
  })
})

describe('文件名与时长格式', () => {
  it('从一批文件名里挑出就绪清单（目录由调用方定）', () => {
    const found = profilesIn([
      'environments/ems.ready.yaml',
      'environments/cdc.ready.yaml',
      'verify/ems.yaml',
      'environments/ems.ready.yml',
      'environments/.ready.yaml',
    ])
    expect([...found.keys()].sort()).toEqual(['cdc', 'ems'])
    expect(found.get('ems')).toBe('environments/ems.ready.yaml')
  })

  it('时长按人读的方式格式化（报告里别让人数毫秒）', () => {
    expect(formatDuration(500)).toBe('500ms')
    expect(formatDuration(1500)).toBe('1.5s')
    expect(formatDuration(150_000)).toBe('2m30s')
    expect(formatDuration(Number.NaN)).toBe('—')
    expect(formatDuration(-1)).toBe('—')
  })
})
