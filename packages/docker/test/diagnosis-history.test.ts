/**
 * @hyzyn/dsh-docker — 诊断历史（批三）的回归测试。
 *
 * 覆盖四层：
 *   1. **样本压缩**：`sampleFromDiagnosis()` 只留结论与数字——日志原文与 finding 的 detail
 *      绝不能落盘（它们会带凭证）；这条用一个「诊断里塞了哨兵字符串」的用例正面钉住。
 *   2. **去重窗口**：29s 内同签名不追加、31s 追加；签名不同（哪怕只隔 1s）必须留下。
 *   3. **配额与容错**：每容器 50 条、整文件 2000 条、坏行 / 半行 / 未知 `v` 一律跳过、
 *      超限走原子重写（重写后全文可解析、没留临时文件）。
 *   4. **趋势七条判据**：每条正例 + 反例，外加「只有首尾真的变了才进 numbers」
 *      与 `newFindings` / `resolvedFindings` 的方向。
 *
 * 时钟一律从参数注入（`history.ts` / `history-store.ts` 都不读时钟）：所以这里没有
 * fake timer，样本的 `at` 就是显式给的时间戳。
 */
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import type { Diagnosis } from '../src/diagnose.js'
import {
  HISTORY_DEDUPE_MS,
  HISTORY_MAX_LINES,
  HISTORY_PER_CONTAINER,
  historyTrend,
  sampleFromDiagnosis,
  shouldAppend,
} from '../src/history.js'
import type { DiagnosisSample } from '../src/history.js'
import { DiagnosisHistoryStore, HISTORY_FILE_NAME, diagnosisHistoryPaths } from '../src/history-store.js'

/* ------------------------------------------------------------------ *
 * 夹具
 * ------------------------------------------------------------------ */

const T0 = Date.parse('2026-11-03T08:00:00.000Z')

/** 第 `index` 次诊断的时间（默认每次隔 31s：越过去重窗口，可自由拼时间序列）。 */
function at(index: number, stepMs = HISTORY_DEDUPE_MS + 1000): string {
  return new Date(T0 + index * stepMs).toISOString()
}

/** 一条样本；只写要断言的字段，其余给「什么都没变」的默认值。 */
function sample(overrides: Partial<DiagnosisSample> & { at: string }): DiagnosisSample {
  return {
    severity: 'ok',
    code: 'running-ok',
    findings: [],
    state: 'running',
    exitCode: 0,
    oomKilled: false,
    restartCount: 0,
    memPercent: 10,
    cpuPercent: 1,
    errorLines: 0,
    eventCount: 2,
    logLines: 10,
    ...overrides,
  }
}

/** 一条完整诊断（用来测压缩）；哨兵字符串必须**不出现在**样本里。 */
function diagnosis(overrides: Partial<Diagnosis> = {}): Diagnosis {
  return {
    id: '9f2c1d4e5a6b7c8d',
    name: 'web-1',
    verdict: { severity: 'critical', code: 'oom-killed', summary: '被 OOM 杀掉' },
    findings: [
      { code: 'oom-killed', severity: 'critical', title: '被 OOM 杀掉', detail: 'SECRET_SENTINEL_日志原文_abc123' },
    ],
    evidence: {
      state: 'exited',
      status: 'Exited (137) 2 minutes ago',
      health: null,
      healthLastOutput: 'SECRET_SENTINEL_HEALTH_xyz',
      exitCode: 137,
      oomKilled: true,
      restartCount: 7,
      startedAt: null,
      finishedAt: null,
      memoryLimitBytes: 536870912,
      cpuQuota: null,
      logLines: 80,
      errorLines: 12,
      eventCount: 9,
      cpuPercent: 0.5,
      memBytes: 100,
      memPercent: 96.5,
    },
    timeline: [],
    logTail: 'level=error msg="SECRET_SENTINEL_日志原文_abc123"',
    suggestions: ['提高内存上限'],
    ...overrides,
  }
}

const tempDirs: string[] = []

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-docker-history-test-'))
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    try { rmSync(dir, { recursive: true, force: true }) } catch { /* 忽略 */ }
  }
})

/* ------------------------------------------------------------------ *
 * 1. 样本压缩
 * ------------------------------------------------------------------ */

describe('sampleFromDiagnosis：只留结论与数字', () => {
  it('日志原文与 finding 的 detail 不进样本（序列化后不含哨兵）', () => {
    const value = sampleFromDiagnosis(diagnosis(), T0)
    const text = JSON.stringify(value)
    expect(text.includes('SECRET_SENTINEL')).toBe(false)
    // 结构上也别偷偷带上：所有值必须是原始类型（数字 / 字符串 / 布尔 / 字符串数组）
    for (const [key, item] of Object.entries(value)) {
      const ok = item === null || ['string', 'number', 'boolean'].includes(typeof item) || (Array.isArray(item) && item.every((entry) => typeof entry === 'string'))
      expect(ok, `字段 ${key} 不该是复合结构`).toBe(true)
    }
  })

  it('判据只留 code，且排序去重', () => {
    const value = sampleFromDiagnosis(diagnosis({
      findings: [
        { code: 'oom-killed', severity: 'critical', title: 'A', detail: 'a' },
        { code: 'crash-loop', severity: 'critical', title: 'B', detail: 'b' },
        { code: 'oom-killed', severity: 'critical', title: 'A2', detail: 'a2' },
      ],
    }), T0)
    expect(value.findings).toEqual(['crash-loop', 'oom-killed'])
    expect(Object.hasOwn(value, 'title')).toBe(false)
    expect(Object.hasOwn(value, 'detail')).toBe(false)
  })

  it('数字与结论逐个搬过来；时间戳按注入的毫秒生成（模块不读时钟）', () => {
    const value = sampleFromDiagnosis(diagnosis(), T0)
    expect(value).toMatchObject({
      at: new Date(T0).toISOString(),
      severity: 'critical',
      code: 'oom-killed',
      state: 'exited',
      exitCode: 137,
      oomKilled: true,
      restartCount: 7,
      memPercent: 96.5,
      cpuPercent: 0.5,
      errorLines: 12,
      eventCount: 9,
      logLines: 80,
    })
  })
})

/* ------------------------------------------------------------------ *
 * 2. 去重窗口
 * ------------------------------------------------------------------ */

describe('shouldAppend：30 秒窗口 + 签名', () => {
  const first = sample({ at: at(0) })

  it('没有上一条 → 追加', () => {
    expect(shouldAppend(undefined, first, T0)).toBe(true)
  })

  it('29s 且签名完全相同 → 不追加', () => {
    expect(shouldAppend(first, sample({ at: at(1, 29_000) }), T0 + 29_000)).toBe(false)
  })

  it('31s → 追加（窗口过了，哪怕完全一样也是一条新的时间点）', () => {
    expect(shouldAppend(first, sample({ at: new Date(T0 + 31_000).toISOString() }), T0 + 31_000)).toBe(true)
  })

  it('签名不同（判据多了一条）→ 1 秒内也要追加', () => {
    const next = sample({ at: new Date(T0 + 1000).toISOString(), findings: ['oom-killed'] })
    expect(shouldAppend(first, next, T0 + 1000)).toBe(true)
  })

  it('签名不同（重启次数变了）→ 追加', () => {
    const next = sample({ at: new Date(T0 + 1000).toISOString(), restartCount: 3 })
    expect(shouldAppend(first, next, T0 + 1000)).toBe(true)
  })

  it('上一条时间戳坏了 → 按可追加处理（不能因为一条坏时间戳让历史停摆）', () => {
    const broken = sample({ at: 'not-a-date' })
    expect(shouldAppend(broken, sample({ at: at(1) }), T0)).toBe(true)
  })
})

/* ------------------------------------------------------------------ *
 * 3. 存储：配额、容错、原子重写
 * ------------------------------------------------------------------ */

describe('DiagnosisHistoryStore：落盘', () => {
  it('构造不碰磁盘（目录里什么都没有，直到第一次 append）', () => {
    const dir = tempDir()
    const store = new DiagnosisHistoryStore(join(dir, 'nested'))
    expect(readdirSync(dir)).toEqual([])
    expect(store.read('本机', 'web-1')).toEqual([])
    store.append({ v: 1, target: '本机', container: 'web-1', id: 'a1', sample: sample({ at: at(0) }) })
    expect(store.read('本机', 'web-1')).toHaveLength(1)
  })

  it('去重命中返回 false，且文件里只有一条', () => {
    const dir = tempDir()
    const store = new DiagnosisHistoryStore(dir)
    const record = { v: 1, target: '本机', container: 'web-1', id: 'a1', sample: sample({ at: at(0) }) }
    expect(store.append(record)).toBe(true)
    expect(store.append({ ...record, sample: sample({ at: new Date(T0 + 5_000).toISOString() }) })).toBe(false)
    expect(store.read('本机', 'web-1')).toHaveLength(1)
  })

  it('按 target + container 分组，互不串', () => {
    const dir = tempDir()
    const store = new DiagnosisHistoryStore(dir)
    store.append({ v: 1, target: '本机', container: 'web-1', id: 'a1', sample: sample({ at: at(0) }) })
    store.append({ v: 1, target: '本机', container: 'db-1', id: 'b1', sample: sample({ at: at(0) }) })
    store.append({ v: 1, target: '目标2', container: 'web-1', id: 'c1', sample: sample({ at: at(0) }) })
    expect(store.read('本机', 'web-1')).toHaveLength(1)
    expect(store.read('本机', 'db-1')).toHaveLength(1)
    expect(store.read('目标2', 'web-1')).toHaveLength(1)
    expect(store.read('目标2', 'db-1')).toHaveLength(0)
  })

  it(`每个容器只留最近 ${HISTORY_PER_CONTAINER} 条（丢最旧）`, () => {
    const dir = tempDir()
    const store = new DiagnosisHistoryStore(dir)
    for (let index = 0; index < HISTORY_PER_CONTAINER + 3; index += 1) {
      // restartCount 变化 → 签名不同 → 不会被去重吃掉
      store.append({ v: 1, target: '本机', container: 'web-1', id: 'a1', sample: sample({ at: at(index), restartCount: index }) })
    }
    const samples = store.read('本机', 'web-1')
    expect(samples).toHaveLength(HISTORY_PER_CONTAINER)
    // 最旧的 3 条被丢掉：剩下的第一条 restartCount = 3
    expect(samples[0]!.restartCount).toBe(3)
    expect(samples[samples.length - 1]!.restartCount).toBe(HISTORY_PER_CONTAINER + 2)
    // 重写之后全文仍然是可解析的 JSONL，且没留下临时文件
    const text = readFileSync(join(dir, HISTORY_FILE_NAME), 'utf8')
    expect(text.endsWith('\n')).toBe(true)
    expect(text.trim().split('\n')).toHaveLength(HISTORY_PER_CONTAINER)
    expect(readdirSync(dir).filter((name) => name.endsWith('.tmp'))).toEqual([])
  })

  it(`整文件超过 ${HISTORY_MAX_LINES} 条时丢最旧（跨容器一起算）`, () => {
    const dir = tempDir()
    // 直接铺 2000 行（每容器 50 条 × 40 个容器）：走 append 会慢成 O(n²)，这里模拟「盘上已有」
    const rows: string[] = []
    for (let bucket = 0; bucket < 40; bucket += 1) {
      for (let index = 0; index < HISTORY_PER_CONTAINER; index += 1) {
        rows.push(JSON.stringify({ v: 1, target: '本机', container: `c${String(bucket)}`, id: 'x', sample: sample({ at: at(index) }) }))
      }
    }
    writeFileSync(join(dir, HISTORY_FILE_NAME), rows.join('\n') + '\n')
    const store = new DiagnosisHistoryStore(dir)
    expect(store.read('本机', 'c0')).toHaveLength(HISTORY_PER_CONTAINER)

    // 新容器追加一条 → 总数 2001 → 裁剪回 2000（丢最旧的一行，即 c0 的第一条）
    expect(store.append({ v: 1, target: '本机', container: 'fresh', id: 'y', sample: sample({ at: at(0) }) })).toBe(true)
    const text = readFileSync(join(dir, HISTORY_FILE_NAME), 'utf8')
    expect(text.trim().split('\n')).toHaveLength(HISTORY_MAX_LINES)
    expect(store.read('本机', 'c0')).toHaveLength(HISTORY_PER_CONTAINER - 1)
    expect(store.read('本机', 'fresh')).toHaveLength(1)
  })

  it('坏行 / 半行 / 不认识的 v 一律跳过，其余照常读（截断留痕不整体失败）', () => {
    const dir = tempDir()
    const good = JSON.stringify({ v: 1, target: '本机', container: 'web-1', id: 'a1', sample: sample({ at: at(0) }) })
    const good2 = JSON.stringify({ v: 1, target: '本机', container: 'web-1', id: 'a1', sample: sample({ at: at(1), restartCount: 4 }) })
    const lines = [
      good,
      '{"v":1,"target":"本机","container":"web-1","id":"a1","sample":{"at":"2026-11-03T08:0', // 半行：进程被杀的现场
      'not json at all',
      JSON.stringify({ v: 99, target: '本机', container: 'web-1', id: 'a1', sample: sample({ at: at(2) }) }),
      JSON.stringify({ v: 1, target: '本机', container: 'web-1' }), // 缺 sample
      good2,
      '',
    ]
    writeFileSync(join(dir, HISTORY_FILE_NAME), lines.join('\n'))
    const store = new DiagnosisHistoryStore(dir)
    const samples = store.read('本机', 'web-1')
    expect(samples).toHaveLength(2)
    expect(samples.map((item) => item.restartCount)).toEqual([0, 4])
  })

  it('read 按时间升序返回（盘上是乱序写入的）', () => {
    const dir = tempDir()
    const rows = [at(2), at(0), at(1)].map((time, index) => JSON.stringify({
      v: 1, target: '本机', container: 'web-1', id: 'a1', sample: sample({ at: time, restartCount: index }),
    }))
    writeFileSync(join(dir, HISTORY_FILE_NAME), rows.join('\n') + '\n')
    const store = new DiagnosisHistoryStore(dir)
    expect(store.read('本机', 'web-1').map((item) => item.at)).toEqual([at(0), at(1), at(2)])
  })

  it('文件不存在时 read 是空数组（不建目录、不建文件）', () => {
    const dir = tempDir()
    const store = new DiagnosisHistoryStore(join(dir, 'missing'))
    expect(store.read('本机', 'web-1')).toEqual([])
    expect(readdirSync(dir)).toEqual([])
  })
})

/* ------------------------------------------------------------------ *
 * 4. 路径拼装（只在一处）
 * ------------------------------------------------------------------ */

describe('diagnosisHistoryPaths', () => {
  const previous = process.env.DSH_DOCKER_HISTORY_DIR
  afterEach(() => {
    if (previous === undefined) delete process.env.DSH_DOCKER_HISTORY_DIR
    else process.env.DSH_DOCKER_HISTORY_DIR = previous
  })

  it('默认落在 <DSH home>/dsh-docker/diagnosis-history.jsonl', () => {
    delete process.env.DSH_DOCKER_HISTORY_DIR
    const paths = diagnosisHistoryPaths('/tmp/example-home')
    expect(paths.dir).toBe('/tmp/example-home/dsh-docker')
    expect(paths.file).toBe(join('/tmp/example-home/dsh-docker', HISTORY_FILE_NAME))
  })

  it('DSH_DOCKER_HISTORY_DIR 覆写的是**目录**', () => {
    process.env.DSH_DOCKER_HISTORY_DIR = '/tmp/override-dir'
    const paths = diagnosisHistoryPaths('/tmp/example-home')
    expect(paths.dir).toBe('/tmp/override-dir')
    expect(paths.file).toBe(join('/tmp/override-dir', HISTORY_FILE_NAME))
  })

  it('覆写成空串 / 纯空白视为没设（落到默认目录，不报错）', () => {
    process.env.DSH_DOCKER_HISTORY_DIR = '   '
    expect(diagnosisHistoryPaths('/tmp/example-home').dir).toBe('/tmp/example-home/dsh-docker')
  })
})

/* ------------------------------------------------------------------ *
 * 5. 趋势
 * ------------------------------------------------------------------ */

describe('historyTrend：样本不够', () => {
  it('0 / 1 条 → insufficient，且不编造数字', () => {
    for (const list of [[], [sample({ at: at(0) })]]) {
      const trend = historyTrend(list)
      expect(trend.count).toBe(list.length)
      expect(trend.window).toBeNull()
      expect(trend.verdict.code).toBe('insufficient')
      expect(trend.verdict.severity).toBe('info')
      expect(trend.numbers).toEqual([])
      expect(trend.newFindings).toEqual([])
      expect(trend.resolvedFindings).toEqual([])
      expect(trend.aggravating).toBe(false)
    }
  })
})

describe('historyTrend：七条判据', () => {
  it('restart-growth：0 → 2 是 warning', () => {
    const trend = historyTrend([
      sample({ at: at(0), restartCount: 0 }),
      sample({ at: at(1), restartCount: 2, severity: 'warning', code: 'crash-loop', findings: ['crash-loop'] }),
    ])
    expect(trend.verdict.code).toBe('restart-growth')
    expect(trend.verdict.severity).toBe('warning')
    expect(trend.aggravating).toBe(true)
    expect(trend.verdict.summary).toContain('重启次数')
    expect(trend.verdict.summary).not.toContain('restartCount')
  })

  it('restart-growth：0 → 5 升级成 critical', () => {
    const trend = historyTrend([
      sample({ at: at(0), restartCount: 0 }),
      sample({ at: at(1), restartCount: 5, severity: 'critical', code: 'crash-loop', findings: ['crash-loop'] }),
    ])
    expect(trend.verdict.code).toBe('restart-growth')
    expect(trend.verdict.severity).toBe('critical')
  })

  it('restart-growth 反例：只涨 1 次不算', () => {
    const trend = historyTrend([
      sample({ at: at(0), restartCount: 0 }),
      sample({ at: at(1), restartCount: 1 }),
    ])
    expect(trend.verdict.code).toBe('stable')
    expect(trend.aggravating).toBe(false)
  })

  it('oom-recurring：两次 OOM 是 critical', () => {
    const trend = historyTrend([
      sample({ at: at(0), oomKilled: true, severity: 'critical', code: 'oom-killed', findings: ['oom-killed'], restartCount: 7 }),
      sample({ at: at(1), oomKilled: true, severity: 'critical', code: 'oom-killed', findings: ['oom-killed'], restartCount: 7 }),
    ])
    // 首尾重启次数相同 → 不命中 restart-growth，落到 oom-recurring
    expect(trend.verdict.code).toBe('oom-recurring')
    expect(trend.verdict.severity).toBe('critical')
    expect(trend.verdict.summary).toContain('2 次')
  })

  it('oom-recurring 反例：只出现一次不算', () => {
    const trend = historyTrend([
      sample({ at: at(0), oomKilled: true, severity: 'critical', code: 'oom-killed', findings: ['oom-killed'] }),
      sample({ at: at(1), oomKilled: false }),
    ])
    expect(trend.verdict.code).toBe('stable')
  })

  it('memory-creep：3 次里从 50% 涨到 85% 是 warning', () => {
    const trend = historyTrend([
      sample({ at: at(0), memPercent: 50 }),
      sample({ at: at(1), memPercent: 70 }),
      sample({ at: at(2), memPercent: 85 }),
    ])
    expect(trend.verdict.code).toBe('memory-creep')
    expect(trend.verdict.severity).toBe('warning')
    expect(trend.verdict.summary).toContain('内存占用')
  })

  it('memory-creep 反例①：末值没到 80 不算（涨 30 也不行）', () => {
    const trend = historyTrend([
      sample({ at: at(0), memPercent: 20 }),
      sample({ at: at(1), memPercent: 40 }),
      sample({ at: at(2), memPercent: 50 }),
    ])
    expect(trend.verdict.code).toBe('stable')
  })

  it('memory-creep 反例②：只有 2 条样本不算（要求 ≥3）', () => {
    const trend = historyTrend([
      sample({ at: at(0), memPercent: 50 }),
      sample({ at: at(1), memPercent: 95 }),
    ])
    expect(trend.verdict.code).toBe('stable')
  })

  it('error-growth：从 0 变正（3 条样本）是 warning', () => {
    const trend = historyTrend([
      sample({ at: at(0), errorLines: 0 }),
      sample({ at: at(1), errorLines: 0 }),
      sample({ at: at(2), errorLines: 1 }),
    ])
    expect(trend.verdict.code).toBe('error-growth')
    expect(trend.verdict.summary).toContain('报错行')
  })

  it('error-growth：涨 5 行是 warning；只涨 3 行（且起点非 0）不算', () => {
    const grown = historyTrend([
      sample({ at: at(0), errorLines: 2 }),
      sample({ at: at(1), errorLines: 4 }),
      sample({ at: at(2), errorLines: 7 }),
    ])
    expect(grown.verdict.code).toBe('error-growth')

    const flat = historyTrend([
      sample({ at: at(0), errorLines: 5 }),
      sample({ at: at(1), errorLines: 6 }),
      sample({ at: at(2), errorLines: 8 }),
    ])
    expect(flat.verdict.code).toBe('stable')
  })

  it('new-serious-findings：新出现的 oom-killed 是 warning', () => {
    const trend = historyTrend([
      sample({ at: at(0) }),
      sample({ at: at(1), findings: ['oom-killed'], severity: 'warning', code: 'oom-killed' }),
    ])
    expect(trend.verdict.code).toBe('new-serious-findings')
    expect(trend.verdict.summary).toContain('oom-killed')
    expect(trend.newFindings).toEqual(['oom-killed'])
  })

  it('new-serious-findings 反例：新出现的「没有健康检查」不是严重判据', () => {
    const trend = historyTrend([
      sample({ at: at(0) }),
      sample({ at: at(1), findings: ['no-healthcheck'], severity: 'info', code: 'no-healthcheck' }),
    ])
    expect(trend.verdict.code).toBe('stable')
    expect(trend.newFindings).toEqual(['no-healthcheck'])
    expect(trend.aggravating).toBe(false)
  })

  it('severity-creep：最近 3 条非降且末条 ≥ warning', () => {
    const trend = historyTrend([
      sample({ at: at(0), severity: 'ok' }),
      sample({ at: at(1), severity: 'warning' }),
      sample({ at: at(2), severity: 'warning' }),
    ])
    expect(trend.verdict.code).toBe('severity-creep')
  })

  it('severity-creep 反例：中间回落过（不是「持续变严重」）', () => {
    const trend = historyTrend([
      sample({ at: at(0), severity: 'warning' }),
      sample({ at: at(1), severity: 'ok' }),
      sample({ at: at(2), severity: 'warning' }),
    ])
    expect(trend.verdict.code).toBe('stable')
  })

  it('stable：什么都没变', () => {
    const trend = historyTrend([sample({ at: at(0) }), sample({ at: at(1) }), sample({ at: at(2) })])
    expect(trend.verdict).toMatchObject({ severity: 'ok', code: 'stable' })
    expect(trend.numbers).toEqual([])
    expect(trend.aggravating).toBe(false)
    expect(trend.window).toEqual({ from: at(0), to: at(2) })
  })

  it('优先级：重启增长压过同时命中的内存爬升', () => {
    const trend = historyTrend([
      sample({ at: at(0), restartCount: 0, memPercent: 50 }),
      sample({ at: at(1), restartCount: 1, memPercent: 70 }),
      sample({ at: at(2), restartCount: 3, memPercent: 90 }),
    ])
    expect(trend.verdict.code).toBe('restart-growth')
  })
})

describe('historyTrend：numbers 与判据增减', () => {
  it('只列首尾真的变了的项；没变的、以及一端为 null 的都不列', () => {
    const trend = historyTrend([
      sample({ at: at(0), restartCount: 1, memPercent: 40, errorLines: null }),
      sample({ at: at(1), restartCount: 1, memPercent: 40, errorLines: null }),
    ])
    expect(trend.numbers).toEqual([])

    const changed = historyTrend([
      sample({ at: at(0), restartCount: 1, memPercent: 40 }),
      sample({ at: at(1), restartCount: 2, memPercent: 40 }),
    ])
    expect(changed.numbers).toEqual([{ key: 'restartCount', from: 1, to: 2, delta: 1 }])
  })

  it('null 不当作 0：errorLines 从 null 变 9 不产生数字项', () => {
    const trend = historyTrend([
      sample({ at: at(0), errorLines: null }),
      sample({ at: at(1), errorLines: 9 }),
    ])
    expect(trend.numbers.find((item) => item.key === 'errorLines')).toBeUndefined()
  })

})

describe('historyTrend：numbers 的噪声闸与归一', () => {
  /** 两条样本的 numbers（其余字段保持「什么都没变」的默认值，避免别的 key 混进来）。 */
  const run = (first: Partial<DiagnosisSample>, second: Partial<DiagnosisSample>): ReturnType<typeof historyTrend>['numbers'] =>
    historyTrend([sample({ at: at(0), ...first }), sample({ at: at(1), ...second })]).numbers

  it('restartCount：多 1 次就报（这一项本来就不该动），没动不报', () => {
    expect(run({ restartCount: 3 }, { restartCount: 3 })).toEqual([])
    expect(run({ restartCount: 3 }, { restartCount: 4 })).toEqual([{ key: 'restartCount', from: 3, to: 4, delta: 1 }])
  })

  it('memPercent：1 个百分点以内是噪声，超过才报', () => {
    expect(run({ memPercent: 52 }, { memPercent: 52.7 })).toEqual([])
    expect(run({ memPercent: 52 }, { memPercent: 53.2 })).toEqual([{ key: 'memPercent', from: 52, to: 53.2, delta: 1.2 }])
  })

  it('cpuPercent：真机那组 1.11 → 1.09 不进趋势；5 个百分点才是负载变化', () => {
    expect(run({ cpuPercent: 1.11 }, { cpuPercent: 1.09 })).toEqual([])
    expect(run({ cpuPercent: 40 }, { cpuPercent: 43 })).toEqual([])
    expect(run({ cpuPercent: 40 }, { cpuPercent: 46.4 })).toEqual([{ key: 'cpuPercent', from: 40, to: 46.4, delta: 6.4 }])
  })

  it('errorLines：3 行以内是滑动窗口漂移（真机 22 → 21），3 行以上才报', () => {
    expect(run({ errorLines: 4 }, { errorLines: 4 })).toEqual([])
    // 真机实测那组：80 行窗口往前滑，一条老报错滑出去，计数就从 22 掉到 21
    expect(run({ errorLines: 22 }, { errorLines: 21 })).toEqual([])
    expect(run({ errorLines: 4 }, { errorLines: 7 })).toEqual([{ key: 'errorLines', from: 4, to: 7, delta: 3 }])
  })

  it('eventCount：5 条以内是窗口抖动', () => {
    expect(run({ eventCount: 10 }, { eventCount: 13 })).toEqual([])
    expect(run({ eventCount: 10 }, { eventCount: 16 })).toEqual([{ key: 'eventCount', from: 10, to: 16, delta: 6 }])
  })

  it('logLines：50 行以内不报（尾部行数受采样窗口影响）', () => {
    expect(run({ logLines: 100 }, { logLines: 130 })).toEqual([])
    expect(run({ logLines: 100 }, { logLines: 160 })).toEqual([{ key: 'logLines', from: 100, to: 160, delta: 60 }])
  })

  it('百分比归一后**没有浮点尾巴**（真机那串 -0.020000000000000018 不许出门）', () => {
    const numbers = run({ memPercent: 52.04 }, { memPercent: 88.06 })
    const mem = numbers.find((item) => item.key === 'memPercent')
    expect(mem).toBeDefined()
    expect(mem!.to).toBe(88.1)
    expect(mem!.delta).toBe(36.1)
    expect(String(mem!.delta)).toBe('36.1')
    expect(String(mem!.delta).includes('000')).toBe(false)
  })

  it('计数类取整（浮点采样值也不带小数出门）', () => {
    const numbers = run({ errorLines: 4.4 }, { errorLines: 9.6 })
    const errors = numbers.find((item) => item.key === 'errorLines')
    expect(errors).toEqual({ key: 'errorLines', from: 4, to: 10, delta: 6 })
  })

  it('负向变化同样要报（错误变少是好事，但不是「没变化」）', () => {
    expect(run({ errorLines: 12 }, { errorLines: 3 })).toEqual([{ key: 'errorLines', from: 12, to: 3, delta: -9 }])
  })

  it('newFindings 是「最早没有、最近有」，resolvedFindings 反过来', () => {
    const trend = historyTrend([
      sample({ at: at(0), findings: ['a', 'b'] }),
      sample({ at: at(1), findings: ['b', 'c'] }),
    ])
    expect(trend.newFindings).toEqual(['c'])
    expect(trend.resolvedFindings).toEqual(['a'])
  })
})
