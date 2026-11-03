/**
 * @hyzyn/dsh-docker — `docker_diagnose` 的回归测试（纯判据 + 采集夹紧）。
 *
 * 分两层，**断言面都在出口**：
 *
 *   1. `src/diagnose.ts` 的纯函数：契约 §3 的十二条判据**逐条正例 + 反例**（一条不命中时
 *      必须不出现）、severity 排序、verdict 选取、退出码含义映射、日志命中行截断、
 *      时间线升序与 ISO 转换，以及「三路采集失败」的降级判据。
 *   2. `DockerApi.diagnose()` 的采集层（假 Runner，不碰 shell）：四路 argv 逐字、
 *      inspect 先跑且失败即整体失败、后三路失败只降级、`logTail` 夹紧与 `since` 校验。
 *
 * 为什么反例和正例一样多：这批判据是**会给用户下结论**的（「被 OOM 杀掉」「反复重启」），
 * 一条恒真的判据比没有判据更糟——它会让人照着错误的结论去改配置。每条判据的反例就是
 * 它的判别性证明。
 */
import { describe, expect, it } from 'vitest'
import { containerStatusText, diagnose, humanDuration } from '../src/diagnose.js'
import type { Diagnosis, DiagnosisInput } from '../src/diagnose.js'
import { DIAGNOSE_LOG_TAIL_DEFAULT, DIAGNOSE_LOG_TAIL_MAX, DockerApi } from '../src/docker.js'
import type { ContainerDetail, ContainerEvent, ContainerStats, Runner } from '../src/docker.js'
import type { ExecResult } from '../src/ssh-exec.js'

/* ------------------------------------------------------------------ *
 * 夹具
 * ------------------------------------------------------------------ */

const BASE_DETAIL: ContainerDetail = {
  id: 'abc123def4567890abc123def4567890',
  shortId: 'abc123def456',
  name: 'shop-web-1',
  image: 'nginx:1.27',
  imageId: 'sha256:deadbeef',
  state: 'running',
  status: 'Up 2 hours (healthy)',
  health: 'healthy',
  healthLogTail: null,
  created: '2026-11-02T12:00:00Z',
  startedAt: '2026-11-02T14:00:00Z',
  finishedAt: null,
  exitCode: 0,
  oomKilled: false,
  restartCount: 0,
  restartPolicy: 'unless-stopped',
  platform: 'linux',
  pid: 10,
  ports: [],
  mounts: [],
  networks: [],
  command: 'nginx',
  entrypoint: '',
  workingDir: '',
  user: '',
  composeProject: null,
  composeService: null,
  labels: {},
}

function detail(overrides: Partial<ContainerDetail> = {}): ContainerDetail {
  return { ...BASE_DETAIL, ...overrides }
}

function stats(overrides: Partial<ContainerStats> = {}): ContainerStats {
  return {
    id: BASE_DETAIL.id,
    shortId: BASE_DETAIL.shortId,
    name: BASE_DETAIL.name,
    cpuPercent: 0.5,
    memPercent: 10,
    memUsed: 10 * 1024 * 1024,
    memLimit: 536_870_912,
    memUsage: '10MiB / 512MiB',
    netRx: 1,
    netTx: 2,
    netIO: '1B / 2B',
    blockRead: 0,
    blockWrite: 0,
    blockIO: '0B / 0B',
    pids: 3,
    ...overrides,
  }
}

function input(overrides: Partial<DiagnosisInput> = {}): DiagnosisInput {
  return {
    detail: detail(),
    memoryLimitBytes: 536_870_912,
    cpuQuota: null,
    logText: 'listening on :8080\nready\n',
    logLines: 2,
    events: [],
    stats: stats(),
    ...overrides,
  }
}

/** 命中的判据 code（按 findings 的输出顺序）。 */
function codes(diagnosis: Diagnosis): string[] {
  return diagnosis.findings.map((finding) => finding.code)
}

/** 容器「什么毛病都没有」的基准：把它当反例的起点。 */
const HEALTHY: DiagnosisInput = input()

/* ------------------------------------------------------------------ *
 * 1. 十二条判据：逐条正例 + 反例
 * ------------------------------------------------------------------ */

describe('判据 1：oom-killed', () => {
  it('正例：被 OOM 杀 → critical，且不再重复报 exit-nonzero', () => {
    const diagnosis = diagnose(input({ detail: detail({ state: 'exited', exitCode: 137, oomKilled: true, restartCount: 7 }) }))
    expect(codes(diagnosis)).toContain('oom-killed')
    expect(diagnosis.findings[0]?.severity).toBe('critical')
    expect(diagnosis.verdict).toMatchObject({ severity: 'critical', code: 'oom-killed' })
    // 判据 2 的排除项：OOM 是更精确的结论，不该同时出现「非零退出」
    expect(codes(diagnosis)).not.toContain('exit-nonzero')
    // 证据片段里给的是人能读的内存上限，不是字节数
    expect(diagnosis.findings[0]?.detail).toContain('512MiB')
  })

  it('反例：正常退出 + oomKilled=false → 不出现', () => {
    expect(codes(diagnose(input({ detail: detail({ state: 'exited', exitCode: 0 }) })))).not.toContain('oom-killed')
  })
})

describe('判据 2：exit-nonzero', () => {
  const at = (exitCode: number, overrides: Partial<ContainerDetail> = {}): Diagnosis =>
    diagnose(input({ detail: detail({ state: 'exited', exitCode, oomKilled: false, health: null, ...overrides }) }))

  it('正例：退出码 1 → critical，detail 给出「应用自己报错」', () => {
    const diagnosis = at(1)
    expect(codes(diagnosis)).toContain('exit-nonzero')
    expect(diagnosis.verdict).toMatchObject({ severity: 'critical', code: 'exit-nonzero' })
    expect(diagnosis.findings[0]?.title).toContain('退出码 1')
    expect(diagnosis.findings[0]?.detail).toContain('应用自己报错')
  })

  it('退出码常见含义逐条映射（126 / 127 / 137 / 143 / 139 / 1 / 其它只说非零）', () => {
    expect(at(126).findings[0]?.detail).toContain('无法执行')
    expect(at(127).findings[0]?.detail).toContain('不存在')
    expect(at(137).findings[0]?.detail).toContain('强制杀死')
    expect(at(143).findings[0]?.detail).toContain('终止信号')
    expect(at(139).findings[0]?.detail).toContain('段错误')
    // 字典外的码：不猜，只说「非零」
    const other = at(42).findings[0]?.detail ?? ''
    expect(other).toContain('非零退出')
    expect(other).not.toContain('应用自己报错')
  })

  it('反例：退出码 0 → 不出现（那是 stopped-ok 的领地）', () => {
    expect(codes(at(0))).not.toContain('exit-nonzero')
  })

  it('反例：OOM 场景下不出现（判据 2 明确排除 oomKilled）', () => {
    const diagnosis = diagnose(input({ detail: detail({ state: 'exited', exitCode: 137, oomKilled: true }) }))
    expect(codes(diagnosis)).not.toContain('exit-nonzero')
  })
})

describe('判据 3：crash-loop', () => {
  it('正例：重启次数 ≥ 3 → critical，summary 用重启次数', () => {
    const diagnosis = diagnose(input({ detail: detail({ restartCount: 4 }) }))
    expect(codes(diagnosis)).toContain('crash-loop')
    expect(diagnosis.verdict).toMatchObject({ severity: 'critical', code: 'crash-loop' })
    expect(diagnosis.verdict.summary).toContain('4')
  })

  it('正例：state=restarting（重启次数缺失）也算', () => {
    const diagnosis = diagnose(input({ detail: detail({ state: 'restarting', restartCount: null, health: null }) }))
    expect(codes(diagnosis)).toContain('crash-loop')
  })

  it('反例：重启 2 次（合法重部署）→ 不出现', () => {
    expect(codes(diagnose(input({ detail: detail({ restartCount: 2 }) })))).not.toContain('crash-loop')
  })
})

describe('判据 4：unhealthy', () => {
  it('正例：critical，detail 附健康检查最后一次输出（截断 200 字）', () => {
    const longOutput = 'x'.repeat(400)
    const diagnosis = diagnose(input({ detail: detail({ health: 'unhealthy', healthLogTail: longOutput }) }))
    expect(codes(diagnosis)).toContain('unhealthy')
    expect(diagnosis.verdict).toMatchObject({ severity: 'critical', code: 'unhealthy' })
    const evidenceInDetail = (diagnosis.findings[0]?.detail ?? '').split('最后一次输出：')[1]?.replace(/。$/, '') ?? ''
    expect(evidenceInDetail.endsWith('…')).toBe(true)
    expect([...evidenceInDetail].length).toBeLessThanOrEqual(200)
    // evidence 里保留原文（截断只发生在给人看的 detail 上）
    expect(diagnosis.evidence.healthLastOutput).toBe(longOutput)
  })

  it('反例：healthy → 不出现', () => {
    expect(codes(diagnose(HEALTHY))).not.toContain('unhealthy')
  })
})

describe('判据 5：health-starting', () => {
  it('正例：info（启动期正常状态，不是故障）', () => {
    const diagnosis = diagnose(input({ detail: detail({ health: 'starting' }) }))
    expect(codes(diagnosis)).toContain('health-starting')
    expect(diagnosis.findings[0]?.severity).toBe('info')
  })

  it('反例：healthy → 不出现', () => {
    expect(codes(diagnose(HEALTHY))).not.toContain('health-starting')
  })
})

describe('判据 6：stopped-ok', () => {
  it('正例：exited + 退出码 0 → info', () => {
    const diagnosis = diagnose(input({ detail: detail({ state: 'exited', exitCode: 0, health: null, finishedAt: '2026-11-02T15:00:00Z' }) }))
    expect(codes(diagnosis)).toContain('stopped-ok')
    expect(diagnosis.findings[0]?.severity).toBe('info')
    expect(diagnosis.verdict.code).toBe('stopped-ok')
  })

  it('反例：运行中 → 不出现', () => {
    expect(codes(diagnose(HEALTHY))).not.toContain('stopped-ok')
  })

  it('反例：exited + 非零退出 → 是 exit-nonzero 而不是 stopped-ok', () => {
    const diagnosis = diagnose(input({ detail: detail({ state: 'exited', exitCode: 3, health: null }) }))
    expect(codes(diagnosis)).toContain('exit-nonzero')
    expect(codes(diagnosis)).not.toContain('stopped-ok')
  })
})

describe('判据 7：not-running（created / paused / dead）', () => {
  it('正例：三种状态都给 warning，且标题说清是哪种', () => {
    for (const [state, needle] of [['created', '没启动'], ['paused', '已暂停'], ['dead', '已死亡']] as const) {
      const diagnosis = diagnose(input({ detail: detail({ state, health: null }) }))
      expect(codes(diagnosis), state).toContain('not-running')
      expect(diagnosis.findings[0]?.severity).toBe('warning')
      expect(diagnosis.findings[0]?.title, state).toContain(needle)
    }
  })

  it('反例：running / exited 都不出现', () => {
    expect(codes(diagnose(HEALTHY))).not.toContain('not-running')
    expect(codes(diagnose(input({ detail: detail({ state: 'exited', exitCode: 0, health: null }) })))).not.toContain('not-running')
  })
})

describe('判据 8：mem-pressure', () => {
  it('正例：≥90% 且设了上限 → warning，summary 给「已用 % / 上限」', () => {
    const diagnosis = diagnose(input({ stats: stats({ memPercent: 96.5, memUsed: 517_000_000 }) }))
    expect(codes(diagnosis)).toContain('mem-pressure')
    expect(diagnosis.verdict).toMatchObject({ severity: 'warning', code: 'mem-pressure' })
    expect(diagnosis.verdict.summary).toContain('96.5%')
    expect(diagnosis.verdict.summary).toContain('512MiB')
  })

  it('反例：89% → 不出现', () => {
    expect(codes(diagnose(input({ stats: stats({ memPercent: 89 }) })))).not.toContain('mem-pressure')
  })

  it('反例：没设内存上限（memoryLimitBytes=null）时，99% 也不判「逼近上限」', () => {
    const diagnosis = diagnose(input({ memoryLimitBytes: null, stats: stats({ memPercent: 99 }) }))
    expect(codes(diagnosis)).not.toContain('mem-pressure')
  })
})

describe('判据 9：cpu-pressure', () => {
  it('正例：≥90% → warning，设了 CPU 上限时 detail 说「核」而不是纳核', () => {
    const diagnosis = diagnose(input({ cpuQuota: 1_500_000_000, stats: stats({ cpuPercent: 92.4 }) }))
    expect(codes(diagnosis)).toContain('cpu-pressure')
    expect(diagnosis.findings[0]?.detail).toContain('1.5 核')
    expect(diagnosis.findings[0]?.detail).not.toContain('NanoCpus')
  })

  it('反例：89% → 不出现', () => {
    expect(codes(diagnose(input({ stats: stats({ cpuPercent: 89 }) })))).not.toContain('cpu-pressure')
  })
})

describe('判据 10：log-errors', () => {
  it('正例：info，detail 给行数与第一条命中行', () => {
    const diagnosis = diagnose(input({
      logText: 'listening\nERROR: redis connect failed\nready\nfatal: cannot start\n',
      logLines: 4,
    }))
    expect(codes(diagnosis)).toContain('log-errors')
    expect(diagnosis.findings.find((f) => f.code === 'log-errors')?.severity).toBe('info')
    expect(diagnosis.verdict.summary).toContain('2')
    expect(diagnosis.findings.find((f) => f.code === 'log-errors')?.detail).toContain('ERROR: redis connect failed')
    expect(diagnosis.evidence.errorLines).toBe(2)
  })

  it('反例：干净日志 → 不出现（「stderr / ERROR 两个词在别的词里」不算命中）', () => {
    const diagnosis = diagnose(input({ logText: 'stderr redirected\nlisten_on_errors=0\nall good\n', logLines: 3 }))
    expect(codes(diagnosis)).not.toContain('log-errors')
    expect(diagnosis.evidence.errorLines).toBe(0)
  })

  it('命中行截断：超长行在 detail 里截到 200 字并带 …（evidence 不截）', () => {
    const longLine = `ERROR ${'y'.repeat(400)}`
    const diagnosis = diagnose(input({ logText: `${longLine}\n`, logLines: 1 }))
    const hit = ((diagnosis.findings.find((f) => f.code === 'log-errors')?.detail ?? '').split('第一条：')[1] ?? '').replace(/。$/, '')
    expect(hit.endsWith('…')).toBe(true)
    expect([...hit].length).toBeLessThanOrEqual(200)
    expect(diagnosis.evidence.errorLines).toBe(1)
  })

  it('反例：日志采集失败（logText=null）时不判「日志没报错」，也不判 log-errors', () => {
    const diagnosis = diagnose(input({ logText: null, logLines: null }))
    expect(codes(diagnosis)).not.toContain('log-errors')
    expect(diagnosis.evidence.errorLines).toBeNull()
  })
})

describe('判据 11：no-healthcheck', () => {
  it('正例：运行中 + 没有健康检查 → info', () => {
    const diagnosis = diagnose(input({ detail: detail({ health: null }) }))
    expect(codes(diagnosis)).toContain('no-healthcheck')
    expect(diagnosis.findings[0]?.severity).toBe('info')
  })

  it('反例：配了健康检查（healthy / unhealthy）→ 不出现', () => {
    expect(codes(diagnose(HEALTHY))).not.toContain('no-healthcheck')
    expect(codes(diagnose(input({ detail: detail({ health: 'unhealthy' }) })))).not.toContain('no-healthcheck')
  })

  it('反例：已退出的容器不判（探不到活是废话）', () => {
    const diagnosis = diagnose(input({ detail: detail({ state: 'exited', exitCode: 0, health: null }) }))
    expect(codes(diagnosis)).not.toContain('no-healthcheck')
  })
})

describe('判据 12：running-ok', () => {
  it('正例：运行中且一条都不命中 → findings 为空，verdict = ok / running-ok', () => {
    const diagnosis = diagnose(HEALTHY)
    expect(diagnosis.findings).toEqual([])
    expect(diagnosis.verdict).toMatchObject({ severity: 'ok', code: 'running-ok' })
    expect(diagnosis.suggestions).toEqual([])
  })

  it('反例：有 finding 时绝不能给 running-ok', () => {
    const diagnosis = diagnose(input({ stats: stats({ memPercent: 95 }) }))
    expect(diagnosis.verdict.code).not.toBe('running-ok')
    expect(diagnosis.verdict.severity).not.toBe('ok')
  })

  it('非运行中也无命中（exited + 退出码未知）→ ok，但 code 是兜底的 ok 而不是 running-ok', () => {
    const diagnosis = diagnose(input({ detail: detail({ state: 'exited', exitCode: null, health: null }), stats: null, logText: null, logLines: null }))
    // stats / logs 都失败会带两条 unavailable（info），所以这里只钉「没有 running-ok」
    expect(diagnosis.verdict.code).not.toBe('running-ok')
  })
})

/* ------------------------------------------------------------------ *
 * 2. severity 排序与 verdict 选取
 * ------------------------------------------------------------------ */

describe('findings 排序与 verdict 选取', () => {
  it('按 severity 降序、同级按判据编号升序（critical → warning → info）', () => {
    const diagnosis = diagnose(input({
      detail: detail({ restartCount: 5, health: null }),
      stats: stats({ memPercent: 95, cpuPercent: 95 }),
      logText: 'ERROR boom\n',
      logLines: 1,
    }))
    expect(codes(diagnosis)).toEqual(['crash-loop', 'mem-pressure', 'cpu-pressure', 'log-errors', 'no-healthcheck'])
    expect(diagnosis.verdict).toMatchObject({ severity: 'critical', code: 'crash-loop' })
  })

  it('verdict 取最高 severity；同级取最靠前那条（mem-pressure 在 cpu-pressure 之前）', () => {
    const diagnosis = diagnose(input({ stats: stats({ memPercent: 95, cpuPercent: 95 }) }))
    expect(diagnosis.verdict).toMatchObject({ severity: 'warning', code: 'mem-pressure' })
  })

  it('info 级结论也不能被说成 ok（只有一条 info 时 verdict 是 info）', () => {
    const diagnosis = diagnose(input({ detail: detail({ health: 'starting' }) }))
    expect(diagnosis.verdict).toMatchObject({ severity: 'info', code: 'health-starting' })
  })
})

/* ------------------------------------------------------------------ *
 * 2.5 文案纪律：给用户看的话里不许出现实现术语，summary ≤ 60 字
 * ------------------------------------------------------------------ */

describe('文案纪律（判据是给用户看的，不是给 docker 源码看的）', () => {
  const SCENARIOS: DiagnosisInput[] = [
    input({ detail: detail({ state: 'exited', exitCode: 137, oomKilled: true, restartCount: 7 }) }),
    input({ detail: detail({ state: 'exited', exitCode: 127, health: null }) }),
    input({ detail: detail({ restartCount: 9 }) }),
    input({ detail: detail({ health: 'unhealthy', healthLogTail: 'curl: (7) Failed to connect' }) }),
    input({ detail: detail({ health: 'starting' }) }),
    input({ detail: detail({ state: 'exited', exitCode: 0, health: null }) }),
    input({ detail: detail({ state: 'dead', health: null }) }),
    input({ cpuQuota: 1_500_000_000, stats: stats({ memPercent: 97, cpuPercent: 98 }) }),
    input({ logText: 'ERROR boom\n', logLines: 1 }),
    input({ detail: detail({ health: null }) }),
    input({ logText: null, logLines: null, events: null, stats: null }),
    HEALTHY,
  ]

  it('标题 / detail / summary 里不出现 HostConfig / NanoCpus / OOMKilled 这类实现术语', () => {
    for (const scenario of SCENARIOS) {
      const diagnosis = diagnose(scenario)
      const userFacing = [diagnosis.verdict.summary, ...diagnosis.findings.flatMap((finding) => [finding.title, finding.detail]), ...diagnosis.suggestions].join('\n')
      expect(userFacing).not.toMatch(/HostConfig|NanoCpus|OOMKilled|ExitCode|ContainerDetail|docker inspect/)
      // summary 是「一句话结论」：≤ 60 字
      expect([...diagnosis.verdict.summary].length).toBeLessThanOrEqual(60)
      // suggestions 0~5 条、不重复
      expect(diagnosis.suggestions.length).toBeLessThanOrEqual(5)
      expect(new Set(diagnosis.suggestions).size).toBe(diagnosis.suggestions.length)
    }
  })
})

/* ------------------------------------------------------------------ *
 * 3. 降级路径：三路采集失败仍然产出诊断
 * ------------------------------------------------------------------ */

describe('降级路径（采集失败仍然产出诊断）', () => {
  it('日志失败：evidence 给 null（不是 0）、logTail 空串、多一条 logs-unavailable 且带原因', () => {
    const diagnosis = diagnose(input({
      logText: null,
      logLines: null,
      logError: '读取容器日志失败（本机）：Cannot connect to the Docker daemon',
    }))
    expect(diagnosis.evidence.logLines).toBeNull()
    expect(diagnosis.evidence.errorLines).toBeNull()
    expect(diagnosis.logTail).toBe('')
    const finding = diagnosis.findings.find((item) => item.code === 'logs-unavailable')
    expect(finding?.severity).toBe('info')
    expect(finding?.detail).toContain('Cannot connect to the Docker daemon')
    // 结论不再是「一切正常」
    expect(diagnosis.verdict.code).toBe('logs-unavailable')
  })

  it('「采集失败」与「确实是空日志」必须可区分', () => {
    const empty = diagnose(input({ logText: '', logLines: 0 }))
    expect(empty.evidence.logLines).toBe(0)
    expect(codes(empty)).not.toContain('logs-unavailable')
    expect(empty.verdict.code).toBe('running-ok')

    const failed = diagnose(input({ logText: null, logLines: null }))
    expect(failed.evidence.logLines).toBeNull()
    expect(codes(failed)).toContain('logs-unavailable')
  })

  it('事件失败：eventCount=null、timeline 为空，并给 events-unavailable', () => {
    const diagnosis = diagnose(input({ events: null, eventError: '读取容器事件失败（本机）：超时' }))
    expect(diagnosis.evidence.eventCount).toBeNull()
    expect(diagnosis.timeline).toEqual([])
    expect(codes(diagnosis)).toContain('events-unavailable')
  })

  it('统计失败：CPU / 内存整组 null，mem/cpu-pressure 不出现（不拿 0 去判）', () => {
    const diagnosis = diagnose(input({ stats: null, statsError: '读取容器统计失败：容器未运行' }))
    expect(diagnosis.evidence.cpuPercent).toBeNull()
    expect(diagnosis.evidence.memBytes).toBeNull()
    expect(diagnosis.evidence.memPercent).toBeNull()
    expect(codes(diagnosis)).not.toContain('mem-pressure')
    expect(codes(diagnosis)).not.toContain('cpu-pressure')
    expect(codes(diagnosis)).toContain('stats-unavailable')
  })

  it('三路全失败：三条 unavailable 按契约顺序（logs → events → stats）', () => {
    const diagnosis = diagnose(input({ logText: null, logLines: null, events: null, stats: null }))
    expect(codes(diagnosis)).toEqual(['logs-unavailable', 'events-unavailable', 'stats-unavailable'])
    expect(diagnosis.verdict).toMatchObject({ severity: 'info', code: 'logs-unavailable' })
  })

  it('事件确实是空的（[]）与事件失败（null）可区分', () => {
    const empty = diagnose(input({ events: [] }))
    expect(empty.evidence.eventCount).toBe(0)
    expect(codes(empty)).not.toContain('events-unavailable')
  })
})

/* ------------------------------------------------------------------ *
 * 4. 时间线
 * ------------------------------------------------------------------ */

describe('timeline', () => {
  const event = (overrides: Partial<ContainerEvent> = {}): ContainerEvent => ({
    action: 'start',
    name: 'shop-web-1',
    image: 'nginx:1.27',
    composeProject: null,
    time: 1_700_000_000,
    exitCode: null,
    ...overrides,
  })

  it('按时间升序（输入乱序），at 转秒级 ISO 8601', () => {
    const diagnosis = diagnose(input({
      events: [
        event({ action: 'die', time: 1_700_000_300, exitCode: 137 }),
        event({ action: 'start', time: 1_700_000_100 }),
        event({ action: 'health_status: healthy', time: 1_700_000_200 }),
      ],
    }))
    expect(diagnosis.timeline.map((entry) => entry.kind)).toEqual(['start', 'health_status: healthy', 'die'])
    expect(diagnosis.timeline[0]?.at).toBe('2023-11-14T22:15:00Z')
    expect(diagnosis.timeline[2]?.at).toBe('2023-11-14T22:18:20Z')
    expect(diagnosis.evidence.eventCount).toBe(3)
  })

  it('kind 原样保留（带后缀的 health_status），text 是中文一句话', () => {
    const diagnosis = diagnose(input({
      events: [
        event({ action: 'start', time: 1 }),
        event({ action: 'die', time: 2, exitCode: 137 }),
        event({ action: 'health_status: unhealthy', time: 3 }),
        event({ action: 'oom', time: 4 }),
      ],
    }))
    expect(diagnosis.timeline.map((entry) => entry.kind)).toEqual(['start', 'die', 'health_status: unhealthy', 'oom'])
    expect(diagnosis.timeline.map((entry) => entry.text)).toEqual([
      '启动',
      '退出（码 137）',
      '健康检查结果：unhealthy',
      '内存不足被系统杀掉',
    ])
  })

  it('没有时间的事件排最前、at 为 null（不丢、也不伪造时间）', () => {
    const diagnosis = diagnose(input({
      events: [event({ action: 'start', time: 100 }), event({ action: 'rename', time: null })],
    }))
    expect(diagnosis.timeline[0]).toMatchObject({ at: null, kind: 'rename' })
    expect(diagnosis.timeline[1]?.at).not.toBeNull()
  })
})

/* ------------------------------------------------------------------ *
 * 4.5 evidence.status：ps 风格的 STATUS（不是 State.Status 的裸值）
 * ------------------------------------------------------------------ */

describe('containerStatusText — ps 风格 STATUS', () => {
  /** 固定的「现在」，与夹具的 startedAt/finishedAt 对齐（本模块自己绝不读时钟）。 */
  const NOW = Date.parse('2026-11-02T15:00:00Z')

  it('running + healthy：Up <时长> (healthy)', () => {
    expect(containerStatusText(detail({ startedAt: '2026-11-02T11:00:00Z' }), NOW)).toBe('Up 4 hours (healthy)')
  })

  it('running + starting：附 (health: starting)', () => {
    expect(containerStatusText(detail({ health: 'starting', startedAt: '2026-11-02T11:00:00Z' }), NOW)).toBe('Up 4 hours (health: starting)')
  })

  it('running + 没有健康检查：不带后缀', () => {
    expect(containerStatusText(detail({ health: null, startedAt: '2026-11-02T11:00:00Z' }), NOW)).toBe('Up 4 hours')
  })

  it('exited：Exited (137) 2 minutes ago', () => {
    const at = detail({ state: 'exited', exitCode: 137, health: null, finishedAt: '2026-11-02T14:58:00Z' })
    expect(containerStatusText(at, NOW)).toBe('Exited (137) 2 minutes ago')
  })

  it('exited 没有完成时间（零值已被归一成 null）→ 不编「多久以前」', () => {
    const at = detail({ state: 'exited', exitCode: 1, health: null, finishedAt: null })
    expect(containerStatusText(at, NOW)).toBe('Exited (1)')
  })

  it('created / dead / paused / restarting 各有自己的说法', () => {
    expect(containerStatusText(detail({ state: 'created', health: null }), NOW)).toBe('Created')
    expect(containerStatusText(detail({ state: 'dead', health: null }), NOW)).toBe('Dead')
    expect(containerStatusText(detail({ state: 'paused', startedAt: '2026-11-02T11:00:00Z' }), NOW)).toBe('Up 4 hours (Paused)')
    const restarting = detail({ state: 'restarting', exitCode: 1, health: null, finishedAt: '2026-11-02T14:59:55Z' })
    expect(containerStatusText(restarting, NOW)).toBe('Restarting (1) 5 seconds ago')
  })

  it('nowMs 缺席 → 不带时长（诊断不读时钟，缺时间就不编时间）', () => {
    expect(containerStatusText(detail({ startedAt: '2026-11-02T11:00:00Z' }))).toBe('Up (healthy)')
    expect(containerStatusText(detail({ state: 'exited', exitCode: 137, health: null, finishedAt: '2026-11-02T14:58:00Z' }))).toBe('Exited (137)')
  })

  it('humanDuration 的分档与 docker ps 同口径（含 About a minute / About an hour）', () => {
    expect(humanDuration(500)).toBe('Less than a second')
    expect(humanDuration(1000)).toBe('1 second')
    expect(humanDuration(5000)).toBe('5 seconds')
    expect(humanDuration(60_000)).toBe('About a minute')
    expect(humanDuration(120_000)).toBe('2 minutes')
    expect(humanDuration(3_600_000)).toBe('About an hour')
    expect(humanDuration(4 * 3_600_000)).toBe('4 hours')
    expect(humanDuration(3 * 86_400_000)).toBe('3 days')
    expect(humanDuration(20 * 86_400_000)).toBe('2 weeks')
    expect(humanDuration(90 * 86_400_000)).toBe('3 months')
    expect(humanDuration(800 * 86_400_000)).toBe('2 years')
    expect(humanDuration(-1)).toBe('')
  })
})

/* ------------------------------------------------------------------ *
 * 5. 采集层：DockerApi.diagnose()（假 Runner，不碰 shell）
 * ------------------------------------------------------------------ */

const INSPECT_JSON = JSON.stringify([{
  Id: 'abc123def4567890abc123def4567890',
  Name: '/shop-web-1',
  Image: 'sha256:deadbeef',
  RestartCount: 1,
  State: {
    Status: 'running',
    ExitCode: 0,
    Pid: 10,
    StartedAt: '2026-11-02T14:00:00Z',
    FinishedAt: '0001-01-01T00:00:00Z',
    Health: { Status: 'healthy', Log: [] },
  },
  Config: { Image: 'nginx:1.27', Cmd: ['nginx'], Labels: {} },
  HostConfig: { Memory: 536_870_912, NanoCpus: 1_000_000_000, RestartPolicy: { Name: 'unless-stopped' } },
  Mounts: [],
  NetworkSettings: { Ports: {}, Networks: {} },
}])

const STATS_LINE = JSON.stringify({ ID: 'abc123def456', Name: 'shop-web-1', CPUPerc: '0.50%', MemUsage: '10MiB / 512MiB', MemPerc: '2.00%', NetIO: '0B / 0B', BlockIO: '0B / 0B', PIDs: '3' })

const EVENT_LINE = JSON.stringify({
  Action: 'die',
  Type: 'container',
  Actor: { ID: 'abc123def456', Attributes: { name: 'shop-web-1', image: 'nginx:1.27', exitCode: '137' } },
  time: 1_700_000_300,
})

interface FakeReply {
  code?: number
  stdout?: string
  stderr?: string
  truncated?: boolean
}

interface FakePlan {
  inspect?: FakeReply
  logs?: FakeReply
  events?: FakeReply
  stats?: FakeReply
}

interface Recorded {
  argv: string[]
  options?: { maxBytes?: number; keepTail?: boolean }
}

/** 假 Runner：按 `argv[1]` 分派（inspect / logs / events / stats），并逐字记录 argv。 */
function fakeApi(plan: FakePlan = {}): { api: DockerApi; calls: Recorded[] } {
  const calls: Recorded[] = []
  const reply = (sub: keyof FakePlan, fallback: string): ExecResult => {
    const given = plan[sub] ?? {}
    return {
      code: given.code ?? 0,
      stdout: given.stdout ?? fallback,
      stderr: given.stderr ?? '',
      timedOut: false,
      truncated: given.truncated ?? false,
      durationMs: 1,
    }
  }
  const runner: Runner = {
    label: '本机（test）',
    async run(argv, options) {
      calls.push({ argv: [...argv], options })
      switch (argv[1]) {
        case 'inspect':
          return reply('inspect', INSPECT_JSON)
        case 'logs':
          return reply('logs', 'listening on :8080\nready\n')
        case 'events':
          return reply('events', `${EVENT_LINE}\n`)
        case 'stats':
          return reply('stats', `${STATS_LINE}\n`)
        default:
          throw new Error(`意外的 argv：${argv.join(' ')}`)
      }
    },
    async stream() {
      throw new Error('diagnose 不应走 stream')
    },
  }
  return { api: new DockerApi(runner, 'docker', { timeoutMs: 1_000, maxBytes: 512 * 1024 }), calls }
}

describe('DockerApi.diagnose 采集层', () => {
  it('四路 argv 逐字：inspect 无额外参数、logs 带 tail+since、events 带服务端 container 过滤、stats 指名单容器', async () => {
    const { api, calls } = fakeApi()
    await api.diagnose('shop-web-1')
    const bySub = (sub: string): string[] => calls.find((call) => call.argv[1] === sub)?.argv ?? []
    expect(bySub('inspect')).toEqual(['docker', 'inspect', 'shop-web-1'])
    expect(bySub('logs')).toEqual(['docker', 'logs', '--tail', String(DIAGNOSE_LOG_TAIL_DEFAULT), '--since', '1h', 'shop-web-1'])
    expect(bySub('stats')).toEqual(['docker', 'stats', '--no-stream', '--format', '{{json .}}', 'shop-web-1'])
    // events 的 --until 是「此刻」，所以只钉前缀、结尾与那条过滤——过滤必须在**服务端**
    const eventsArgv = bySub('events')
    expect(eventsArgv.slice(0, 4)).toEqual(['docker', 'events', '--since', '1h'])
    expect(eventsArgv.slice(-4)).toEqual(['--filter', 'type=container', '--filter', 'container=shop-web-1'])
    // 四路都采了，且 inspect 是第一条（权威状态先拿到）
    expect(calls.map((call) => call.argv[1])).toEqual(['inspect', 'logs', 'events', 'stats'])
  })

  it('evidence 从四路汇总：内存 / CPU 上限来自 inspect，健康与退出码来自权威状态', async () => {
    const { api } = fakeApi()
    const { diagnosis } = await api.diagnose('shop-web-1')
    expect(diagnosis.evidence).toMatchObject({
      state: 'running',
      health: 'healthy',
      memoryLimitBytes: 536_870_912,
      cpuQuota: 1_000_000_000,
      logLines: 2,
      eventCount: 1,
      cpuPercent: 0.5,
      memPercent: 2,
    })
    // 时间线来自事件（die 137），并且排序与文案都对
    expect(diagnosis.timeline).toHaveLength(1)
    expect(diagnosis.timeline[0]).toMatchObject({ kind: 'die', text: '退出（码 137）' })
    // 一切正常（running + healthy + 无报错日志）→ 不应命中任何判据
    expect(diagnosis.findings).toEqual([])
    expect(diagnosis.verdict).toMatchObject({ severity: 'ok', code: 'running-ok' })
  })

  it('evidence.status 用 ps 风格文案（不是 State.Status 的裸值 running）', async () => {
    const { api } = fakeApi()
    const { diagnosis } = await api.diagnose('shop-web-1')
    expect(diagnosis.evidence.state).toBe('running')
    expect(diagnosis.evidence.status).not.toBe('running')
    expect(diagnosis.evidence.status).toMatch(/^Up /)
    expect(diagnosis.evidence.status).toContain('(healthy)')
  })

  it('events 采集有独立扫描预算 + keepTail（噪音占满 512KB 时时间线不该永远是空）', async () => {
    const { api, calls } = fakeApi()
    await api.diagnose('shop-web-1')
    const eventsCall = calls.find((call) => call.argv[1] === 'events')
    // 真机实测：单容器 1h 的事件 588KB，其中 exec_* 三连（解析时会被白名单丢掉）占绝大多数
    expect(eventsCall?.options?.maxBytes).toBeGreaterThan(512 * 1024)
    expect(eventsCall?.options?.keepTail).toBe(true)
    // 但 argv 不变：只多一条 container 过滤（契约 §1.2 的口径）
    expect(eventsCall?.argv.filter((token) => token === '--filter')).toHaveLength(2)
  })

  it('logTail 夹紧：9999 → 500、0 → 1、非有限数 → 默认 80（不进 argv 当字面量 NaN）', async () => {
    const tailOf = async (logTail: number): Promise<string> => {
      const { api, calls } = fakeApi()
      await api.diagnose('shop-web-1', { logTail })
      return calls.find((call) => call.argv[1] === 'logs')?.argv[3] ?? ''
    }
    expect(await tailOf(9999)).toBe(String(DIAGNOSE_LOG_TAIL_MAX))
    expect(await tailOf(0)).toBe('1')
    expect(await tailOf(Number.NaN)).toBe(String(DIAGNOSE_LOG_TAIL_DEFAULT))
  })

  it('since：默认 1h；合法值原样透传到 logs 与 events；非法值抛错（D45 同一口径）', async () => {
    const { api, calls } = fakeApi()
    await api.diagnose('shop-web-1', { since: '30m' })
    expect(calls.find((call) => call.argv[1] === 'logs')?.argv).toContain('30m')
    expect(calls.find((call) => call.argv[1] === 'events')?.argv).toContain('30m')

    const bad = fakeApi()
    await expect(bad.api.diagnose('shop-web-1', { since: '昨天' })).rejects.toThrow(/since 无法识别/)
    // 参数在触达 docker 之前就被拒：一条命令都没跑
    expect(bad.calls).toHaveLength(0)
  })

  it('容器 id 过白名单：注入尝试一条命令都不发', async () => {
    const { api, calls } = fakeApi()
    await expect(api.diagnose('app; rm -rf /')).rejects.toThrow()
    expect(calls).toHaveLength(0)
  })

  it('inspect 失败 → 整体失败（权威状态都没有，别拿三路补丁编结论）', async () => {
    const { api, calls } = fakeApi({ inspect: { code: 1, stdout: '', stderr: 'Error: No such container: gone' } })
    await expect(api.diagnose('gone')).rejects.toThrow(/读取容器详情失败/)
    // 失败即返回：后三路不会被发出去
    expect(calls.map((call) => call.argv[1])).toEqual(['inspect'])
  })

  it('logs 失败 → 仍然产出 diagnosis，logs-unavailable 带原因、evidence.logLines 为 null', async () => {
    const { api } = fakeApi({ logs: { code: 1, stdout: '', stderr: 'Error: reading logs: no such container' } })
    const result = await api.diagnose('shop-web-1')
    expect(result.logError).toContain('no such container')
    expect(result.diagnosis.evidence.logLines).toBeNull()
    expect(result.diagnosis.findings.map((finding) => finding.code)).toContain('logs-unavailable')
    // 另外两路照常采到
    expect(result.diagnosis.evidence.eventCount).toBe(1)
    expect(result.diagnosis.evidence.cpuPercent).toBe(0.5)
  })

  it('events 失败 → 仍然产出 diagnosis，时间线为空 + events-unavailable', async () => {
    const { api } = fakeApi({ events: { code: 1, stdout: '', stderr: 'Error: 事件读取超时' } })
    const result = await api.diagnose('shop-web-1')
    expect(result.eventError).toContain('超时')
    expect(result.diagnosis.evidence.eventCount).toBeNull()
    expect(result.diagnosis.timeline).toEqual([])
    expect(result.diagnosis.findings.map((finding) => finding.code)).toContain('events-unavailable')
  })

  it('stats 失败（含截断）→ 仍然产出 diagnosis，CPU / 内存整组 null + stats-unavailable', async () => {
    const { api } = fakeApi({ stats: { code: 0, stdout: '', truncated: true } })
    const result = await api.diagnose('shop-web-1')
    expect(result.statsError).not.toBeNull()
    expect(result.diagnosis.evidence.cpuPercent).toBeNull()
    expect(result.diagnosis.evidence.memPercent).toBeNull()
    expect(result.diagnosis.findings.map((finding) => finding.code)).toContain('stats-unavailable')
  })

  it('健康检查没有输出（parseInspectJson 给空串）→ evidence 归一成 null', async () => {
    const emptyHealthLog = JSON.stringify([{
      Id: 'abc123def4567890abc123def4567890',
      Name: '/shop-web-1',
      State: {
        Status: 'running',
        ExitCode: 0,
        Health: { Status: 'healthy', Log: [{ ExitCode: 0, Output: '', Start: '2026-11-02T14:00:00Z' }] },
      },
      Config: { Cmd: ['nginx'], Labels: {} },
      HostConfig: {},
      Mounts: [],
      NetworkSettings: { Ports: {}, Networks: {} },
    }])
    const { api } = fakeApi({ inspect: { stdout: emptyHealthLog } })
    const { diagnosis } = await api.diagnose('shop-web-1')
    expect(diagnosis.evidence.healthLastOutput).toBeNull()
  })

  it('内存上限 0（docker 的「不限制」）归一成 null，不写成「上限 0B」', async () => {
    const zeroLimit = JSON.stringify([{
      Id: 'abc123def4567890abc123def4567890',
      Name: '/shop-web-1',
      State: { Status: 'running', ExitCode: 0, Health: { Status: 'healthy', Log: [] } },
      Config: { Cmd: ['nginx'], Labels: {} },
      HostConfig: { Memory: 0, NanoCpus: 0 },
      Mounts: [],
      NetworkSettings: { Ports: {}, Networks: {} },
    }])
    const { api } = fakeApi({ inspect: { stdout: zeroLimit } })
    const { diagnosis } = await api.diagnose('shop-web-1')
    expect(diagnosis.evidence.memoryLimitBytes).toBeNull()
    expect(diagnosis.evidence.cpuQuota).toBeNull()
  })
})
