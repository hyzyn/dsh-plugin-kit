/**
 * @hyzyn/dsh-loglens — agent 工具的用例（P3）。
 *
 * 用**假后端**注入（真后端的行为在 test/loki.test.ts 里按 wire 级验过），这里锁的是工具层的三件事：
 * 目标怎么解析、参数怎么过归一化与夹取、以及**诚实的信号**（截断 / 提示 / 报错文案里的指路）。
 * 工具定义是 SDK 的 `defineTool` 产物，用例只认它的 `execute`。
 */
import { describe, expect, it, vi } from 'vitest'
import { validateJsonSchemaValue } from '@deepseek-ai/dsh-tools'
import type { BackendCaps, LogBackend, LogLine, LogQueryResult, NormalizedQuery } from '../src/backends/types.js'
import type { LoglensConfig, LoglensTarget, SourceKind } from '../src/config.js'
import { adapterHint, clampCount, findAnchor, formatLine, formatTimestamp, hintFor, LINE_CONTRACT_KEYS, LINE_SCHEMA, registerLoglensTools, renderFields, renderLines, renderMessage, resolveTarget } from '../src/tools.js'

interface Captured {
  execute: (args: unknown) => Promise<unknown>
  parameters: Record<string, unknown>
  isConcurrencySafe?: () => boolean
}

function capture(addSpy?: () => void) {
  const captured = new Map<string, Captured>()
  const order: string[] = []
  const add = (name: string, definition: unknown): void => {
    order.push(name)
    captured.set(name, definition as Captured)
    if (addSpy !== undefined) addSpy()
  }
  return { add, captured, order }
}

const CAPS: BackendCaps = {
  queryLanguage: 'logql',
  follow: true,
  aggregations: true,
  requiresTimeRange: true,
  fields: 'discovered',
  pagination: 'none',
  maxPageSize: 100,
  maxWindowMs: 60 * 60 * 1000,
}

function line(ts: number, message: string, id?: string): LogLine {
  return { ts, message, source: '0@' + String(ts), labels: { app: 'demo' }, raw: message, id: id === undefined ? '0:' + String(ts) : id }
}

function resultOf(lines: LogLine[], patch: Partial<LogQueryResult> = {}): LogQueryResult {
  return {
    lines,
    counts: { returned: lines.length, totalKnown: false },
    truncation: { truncated: false, reasons: [] },
    ...patch,
  }
}

function fakeBackend(overrides: Partial<LogBackend> = {}): LogBackend {
  return {
    id: 'fake',
    capabilities: () => CAPS,
    fields: async () => ({ fields: [{ name: 'app', kind: 'discovered' }], total: 1, truncated: false }),
    query: async () => resultOf([]),
    health: async () => ({ ok: true, detail: 'ready' }),
    ...overrides,
  }
}

function target(id: string, kind: SourceKind, label?: string): LoglensTarget {
  return { id, kind, label: label === undefined ? id : label, url: 'http://127.0.0.1:3100' }
}

function configWith(...targets: LoglensTarget[]): LoglensConfig {
  return { enabled: true, targets }
}

describe('resolveTarget：按 id 或名称找一个来源', () => {
  it('没有来源时给出设置入口，而不是干巴巴一句「不存在」', () => {
    const picked = resolveTarget(configWith(), undefined)
    expect(picked.ok).toBe(false)
    expect(picked.ok === false ? picked.error : '').toContain('设置 → 插件配置 → 日志查询')
  })

  it('省略 target：只有一个来源时回落，多个时列出候选', () => {
    const one = resolveTarget(configWith(target('loki', 'loki')), undefined)
    expect(one.ok && one.target.id).toBe('loki')
    const many = resolveTarget(configWith(target('a', 'loki'), target('b', 'loki')), undefined)
    expect(many.ok === false ? many.error : '').toContain('target 必填')
    expect(many.ok === false ? many.error : '').toContain('a / b')
  })

  it('id 匹配不分大小写；名称重名时要 id', () => {
    const config = configWith(target('loki-local', 'loki', '本地 Loki'), target('es', 'elasticsearch', '本地 Loki'))
    const byId = resolveTarget(config, 'LOKI-LOCAL')
    expect(byId.ok && byId.target.id).toBe('loki-local')
    const ambiguous = resolveTarget(config, '本地 loki')
    expect(ambiguous.ok === false ? ambiguous.error : '').toContain('请改用 id')
  })

  it('找不到 / 类型不对都说清原因', () => {
    const config = configWith(target('loki', 'loki'))
    expect(resolveTarget(config, 'ghost').ok).toBe(false)
    expect(resolveTarget(config, 42).ok).toBe(false)
  })
})

describe('loglens_sources', () => {
  it('有适配器的报能力，没有适配器的报「怎么绕」', async () => {
    const { add, captured } = capture()
    registerLoglensTools({
      config: () => configWith(target('loki', 'loki'), target('es', 'elasticsearch'), target('docker', 'docker')),
      backendFor: (kind) => (kind === 'loki' ? fakeBackend() : undefined),
      add,
    })
    const value = await captured.get('loglens_sources')!.execute({}) as { targets: Array<Record<string, unknown>> }
    expect(value.targets).toHaveLength(3)
    expect(value.targets[0].adapter).toBe('fake')
    expect(value.targets[0].pagination).toBe('none')
    expect(String(value.targets[1].adapter)).toContain('没有适配器')
    expect(String(value.targets[2].adapter)).toContain('docker_logs')
    // P5：docker 那行必须带「替代路径」这句（选项 0 的 agent 侧交付物）
    expect(String(value.targets[2].hint)).toContain('docker_logs_grep')
    // 声明 pagination:'none' 的来源（这里的假后端就是）要提醒「截断时只会报 hit_limit」
    expect(String(value.targets[0].hint)).toContain('hit_limit')
  })

  it('probe 只探有适配器的来源（没有适配器就没得探）', async () => {
    const health = vi.fn(async () => ({ ok: false, detail: 'connection refused' }))
    const { add, captured } = capture()
    registerLoglensTools({
      config: () => configWith(target('loki', 'loki'), target('docker', 'docker')),
      backendFor: (kind) => (kind === 'loki' ? fakeBackend({ health }) : undefined),
      add,
    })
    const value = await captured.get('loglens_sources')!.execute({ probe: true }) as { targets: Array<Record<string, unknown>> }
    expect(health).toHaveBeenCalledTimes(1)
    expect(value.targets[0].ok).toBe(false)
    expect(String(value.targets[0].error)).toContain('connection refused')
    expect(value.targets[1].ok).toBeUndefined()
  })

  it('回显范围（scope）与「最近 N 分钟多少条」（recent）——别让 agent 猜自己在打哪个范围', async () => {
    const { add, captured } = capture()
    const backend = fakeBackend({
      scope: () => 'app-logs-*',
      health: async () => ({ ok: true, detail: '7.10.2', recent: { windowMs: 15 * 60 * 1000, count: 1234 } }),
    })
    registerLoglensTools({ config: () => configWith(target('es', 'elasticsearch')), backendFor: () => backend, add })
    const value = await captured.get('loglens_sources')!.execute({ probe: true }) as { targets: Array<Record<string, unknown>> }
    expect(value.targets[0].scope).toBe('app-logs-*')
    expect(value.targets[0].recent).toEqual({ windowMs: 900000, count: 1234 })
    // 没有 scope 的适配器（Loki）不许凭空造一个
    const bare = capture()
    registerLoglensTools({ config: () => configWith(target('loki', 'loki')), backendFor: () => fakeBackend(), add: bare.add })
    const loki = await bare.captured.get('loglens_sources')!.execute({}) as { targets: Array<Record<string, unknown>> }
    expect(loki.targets[0].scope).toBeUndefined()
    expect(loki.targets[0].recent).toBeUndefined()
  })

  it('空清单是空数组，不是错误', async () => {
    const { add, captured } = capture()
    registerLoglensTools({ config: () => configWith(), backendFor: () => undefined, add })
    expect(await captured.get('loglens_sources')!.execute({})).toEqual({ targets: [] })
  })
})

describe('loglens_search', () => {
  function harness(backend: LogBackend, config?: LoglensConfig) {
    const { add, captured } = capture()
    registerLoglensTools({
      config: () => (config === undefined ? configWith(target('loki', 'loki')) : config),
      backendFor: () => backend,
      add,
    })
    return captured.get('loglens_search')!
  }

  it('参数过归一化：夹取 limit、默认窗口、透传方向，并把生效的窗口回给调用方', async () => {
    const seen: NormalizedQuery[] = []
    const backend = fakeBackend({ query: async (query) => { seen.push(query); return resultOf([]) } })
    const value = await harness(backend).execute({ from: 1_700_000_000_000, to: 1_700_000_060_000, limit: 900, direction: 'forward' }) as Record<string, unknown>
    expect(seen[0].limit).toBe(CAPS.maxPageSize)
    expect(seen[0].direction).toBe('forward')
    expect(value.window).toEqual({ from: 1_700_000_000_000, to: 1_700_000_060_000 })
    expect((value.warnings as string[]).join()).toContain('夹到 100')
  })

  it('from / to 收 ISO 与相对时间（2026-10-11 真机反馈：让模型手算毫秒是真的会错）', async () => {
    const seen: NormalizedQuery[] = []
    const backend = fakeBackend({ query: async (query) => { seen.push(query); return resultOf([]) } })
    const now = Date.now()
    const relative = await harness(backend).execute({ from: '-30m', to: 'now' }) as Record<string, unknown>
    const window = relative.window as { from: number, to: number }
    expect(Math.abs(window.to - now)).toBeLessThan(5_000)
    expect(window.to - window.from).toBe(30 * 60 * 1000)
    const iso = await harness(backend).execute({ from: '2026-10-11T14:00:00Z', to: '2026-10-11T15:00:00Z' }) as Record<string, unknown>
    expect(iso.window).toEqual({ from: Date.parse('2026-10-11T14:00:00Z'), to: Date.parse('2026-10-11T15:00:00Z') })
    // 只给 to = 「给我看最新的日志」：不再被打回，from 按 15 分钟兜底并附一条 warning
    const onlyTo = await harness(backend).execute({ to: '2026-10-11T15:00:00Z' }) as Record<string, unknown>
    expect((onlyTo.window as { from: number }).from).toBe(Date.parse('2026-10-11T14:45:00Z'))
    expect((onlyTo.warnings as string[]).join()).toContain('未给 from')
    // 窗口上限对相对时间同样有效
    await expect(harness(backend).execute({ from: '-1d', to: 'now' })).rejects.toThrow('超过这个来源的上限')
    expect(seen.length).toBeGreaterThan(0)
  })

  it('level 过滤：及以上语义、只筛本页并明说范围、认不出的级别直接报错', async () => {
    const withLevel = (ts: number, message: string, level?: string): LogLine => (level === undefined
      ? line(ts, message)
      : { ...line(ts, message), level })
    const backend = fakeBackend({
      query: async () => resultOf([
        withLevel(1, 'info line', 'info'),
        withLevel(2, 'warn line', 'warn'),
        withLevel(3, 'error line', 'error'),
        withLevel(4, 'no level line'),
      ]),
    })
    const value = await harness(backend).execute({ from: 1_700_000_000_000, to: 1_700_000_060_000, level: 'warn' }) as Record<string, unknown>
    const lines = value.lines as Array<{ message: string, level?: string }>
    expect(lines.map((item) => item.message)).toEqual(['warn line', 'error line'])
    expect(value.returned).toBe(2)
    expect(value.level).toBe('warn')
    // 范围必须写在明面上：counts 是**未筛的整页**，不然 agent 会以为「就这么多」
    const warnings = (value.warnings as string[]).join()
    expect(warnings).toContain('这一页')
    expect(warnings).toContain('2 / 4')
    await expect(harness(backend).execute({ from: 1_700_000_000_000, to: 1_700_000_060_000, level: 'loud' })).rejects.toThrow('level 只能是')
    // 不筛时不许冒出这一条 warning（否则每条查询都带噪音）
    const plain = await harness(backend).execute({ from: 1_700_000_000_000, to: 1_700_000_060_000 }) as Record<string, unknown>
    expect((plain.warnings as string[]).join()).not.toContain('这一页')
  })

  it('来源不支持游标 + 命中被 limit 截断 → 明说「可能不完整，缩小时间窗」', async () => {
    const backend = fakeBackend({
      query: async () => resultOf([line(1, 'a')], { truncation: { truncated: true, reasons: ['hit_limit'] } }),
    })
    const value = await harness(backend).execute({ from: 1_700_000_000_000, to: 1_700_000_060_000 }) as Record<string, unknown>
    expect(String(value.hint)).toContain('命中可能不完整')
    expect(value.nextCursor).toBeUndefined()
  })

  it('来源声明了游标就透传 nextCursor，且不误报「可能不完整」', async () => {
    const cursorCaps = { ...CAPS, pagination: 'cursor' as const }
    const backend = fakeBackend({
      capabilities: () => cursorCaps,
      query: async () => resultOf([line(1, 'a')], { truncation: { truncated: true, reasons: ['hit_limit'] }, nextCursor: 'next-page' }),
    })
    const value = await harness(backend).execute({ from: 1_700_000_000_000, to: 1_700_000_060_000 }) as Record<string, unknown>
    expect(value.nextCursor).toBe('next-page')
    expect(value.hint).toBeUndefined()
  })

  it('游标过期时不装作「查完了」：给一句「重新发起带时间窗的查询」', async () => {
    const backend = fakeBackend({
      query: async () => resultOf([], { truncation: { truncated: true, reasons: ['cursor_expired'] } }),
    })
    const value = await harness(backend).execute({ from: 1_700_000_000_000, to: 1_700_000_060_000, cursor: 'x' }) as Record<string, unknown>
    expect(String(value.hint)).toContain('游标已过期')
    expect(value.nextCursor).toBeUndefined()
  })

  it('时间戳写成秒 / 窗口非法：原样把原因抛出去（错的是调用方）', async () => {
    await expect(harness(fakeBackend()).execute({ from: 1_700_000_000, to: 1_700_000_060_000 })).rejects.toThrow('看起来是**秒**')
    await expect(harness(fakeBackend()).execute({ from: 1_700_000_060_000, to: 1_700_000_000_000 })).rejects.toThrow('to 必须晚于 from')
  })

  it('target 找不到 / 没有适配器 / docker 来源：报错都带下一步怎么做', async () => {
    const { add, captured } = capture()
    registerLoglensTools({ config: () => configWith(target('loki', 'loki')), backendFor: () => undefined, add })
    await expect(captured.get('loglens_search')!.execute({ target: 'ghost' })).rejects.toThrow('找不到来源')
    await expect(captured.get('loglens_search')!.execute({})).rejects.toThrow('没有适配器')

    const dockerOnly = capture()
    registerLoglensTools({ config: () => configWith(target('d', 'docker')), backendFor: () => undefined, add: dockerOnly.add })
    await expect(dockerOnly.captured.get('loglens_search')!.execute({})).rejects.toThrow('docker_logs')
  })
})

describe('loglens_fields', () => {
  /** 一个会照 `limit` 截的后端：调用方不给 limit 就全给（判据与两边适配器同形）。 */
  function manyFieldsBackend(count: number): LogBackend {
    return fakeBackend({
      fields: async (_target, options) => {
        const all = Array.from({ length: count }, (_item, index) => ({ name: 'f' + String(index), kind: 'indexed' as const }))
        const shown = options?.limit === undefined ? all : all.slice(0, options.limit)
        return { fields: shown, total: all.length, truncated: options?.limit !== undefined && all.length > options.limit }
      },
    })
  }

  it('**不传 limit 就是不截断**：120 个字段全给、truncated 恒 false（2026-10-14 对齐 Kibana）', async () => {
    const { add, captured } = capture()
    registerLoglensTools({ config: () => configWith(target('es', 'elasticsearch')), backendFor: () => manyFieldsBackend(120), add })
    const value = await captured.get('loglens_fields')!.execute({}) as { fields: unknown[], total: number, truncated: boolean, warnings: string[] }
    expect(value.fields).toHaveLength(120)
    expect(value.total).toBe(120)
    expect(value.truncated).toBe(false)
    // 没截就不许有那句警告——警告只在真截了的时候出现，不能变成常驻噪声
    expect(value.warnings).toEqual([])
  })

  it('传了 limit 才截：只列前 N 个，total / truncated / 警告都在（真机反馈第 4 条）', async () => {
    const { add, captured } = capture()
    registerLoglensTools({ config: () => configWith(target('es', 'elasticsearch')), backendFor: () => manyFieldsBackend(120), add })
    const value = await captured.get('loglens_fields')!.execute({ limit: 50 }) as { fields: unknown[], total: number, truncated: boolean, warnings: string[] }
    expect(value.fields).toHaveLength(50)
    expect(value.total).toBe(120)
    expect(value.truncated).toBe(true)
    expect(value.warnings.join()).toContain('只列了前 50 个')
    expect(value.warnings.join()).toContain('去掉 limit 就是全部')
    // limit 只校验正整数：没有硬上限了（默认本来就是全部，再给个「上限」只会出现
    // 「要 300 被夹到 200，比不传还少」这种自相矛盾）
    await expect(captured.get('loglens_fields')!.execute({ limit: 0 })).rejects.toThrow('limit 必须是正整数')
    await expect(captured.get('loglens_fields')!.execute({ limit: 1.5 })).rejects.toThrow('limit 必须是正整数')
  })

  it('直接搬运后端报的字段', async () => {
    const { add, captured } = capture()
    registerLoglensTools({ config: () => configWith(target('loki', 'loki')), backendFor: () => fakeBackend(), add })
    const value = await captured.get('loglens_fields')!.execute({}) as { fields: unknown[], total: number, truncated: boolean, warnings: string[] }
    expect(value.fields).toEqual([{ name: 'app', kind: 'discovered' }])
    expect(value.total).toBe(1)
    expect(value.truncated).toBe(false)
    expect(value.warnings).toEqual([])
  })

  it('多类型字段的 esTypes / conflict / conflictDescriptions 在**执行层不许丢**，一路到渲染', async () => {
    const { add, captured } = capture()
    const backend = fakeBackend({
      fields: async () => ({
        fields: [
          { name: 'app.name', kind: 'indexed' as const, esTypes: ['text', 'keyword'] },
          {
            name: 'container.labels.x',
            kind: 'indexed' as const,
            esTypes: ['date', 'text'],
            conflict: true,
            conflictDescriptions: { date: ['app-1'], text: ['app-2'] },
          },
        ],
        total: 2,
        truncated: false,
      }),
    })
    registerLoglensTools({ config: () => configWith(target('es', 'elasticsearch')), backendFor: () => backend, add })
    const value = await captured.get('loglens_fields')!.execute({}) as { fields: Array<Record<string, unknown>> }
    // 「同名但同族」不算冲突：只搬 esTypes，不带 conflict（真机那个 date+text 才算）
    expect(value.fields[0]).toEqual({ name: 'app.name', kind: 'indexed', esTypes: ['text', 'keyword'] })
    expect(value.fields[1]).toEqual({
      name: 'container.labels.x',
      kind: 'indexed',
      esTypes: ['date', 'text'],
      conflict: true,
      conflictDescriptions: { date: ['app-1'], text: ['app-2'] },
    })
  })
})

describe('LINE_SCHEMA 与 LogLine 契约对账（loglens D05）', () => {
  /*
   * 契约键集（`LINE_CONTRACT_KEYS`）**住在 src/tools.ts**，不在这里——分工是刻意的，
   * 因为「编译期那一半」必须挂在**会被 tsc 编到的文件**上：全仓没有任何 tsconfig 收 `test/`
   * （包 tsconfig 的 include 只有 "src"），把 `Record<keyof LogLine, true>` 写在 test/ 里，
   * 给 `LogLine` 加字段时包 typecheck 照样 exit 0、下面的对账也照样全绿——那是空头支票（收口 F7）。
   * 所以：**src 里那份管「契约加了字段」（编译期），下面这几条管「schema 与键集一致」（运行期）**。
   */

  it('schema 的字段集与契约键集逐字相等（多一个、少一个都红）', () => {
    expect(new Set(Object.keys(LINE_SCHEMA.properties))).toEqual(new Set(Object.keys(LINE_CONTRACT_KEYS)))
  })

  it('契约里的可选字段在 schema 里不能是 required（可选性也是契约的一部分）', () => {
    const required = Object.entries(LINE_SCHEMA.properties)
      .filter(([, node]) => (node as { required?: boolean }).required === true)
      .map(([key]) => key)
      .sort()
    expect(required).toEqual(['id', 'message', 'raw', 'source', 'ts'])
    for (const optional of ['level', 'levelInferred', 'highlights', 'labels'] as const) {
      expect(Object.keys(LINE_SCHEMA.properties)).toContain(optional)
      expect(required).not.toContain(optional)
    }
    // 键集本身不许是空壳（它要是被清空了，上面两条会「等于空集」而假绿）
    expect(Object.keys(LINE_CONTRACT_KEYS)).toHaveLength(9)
  })

  it('**宿主真校验器**接受带 highlights 的行，也仍然拦得住未声明的键', () => {
    /*
     * 这一条是 D05 的现场：宿主用 `validateJsonSchemaValue` 校验工具返回值，崩的正是这句
     * `is not a declared property (additionalProperties: false)`。
     * 用真实现（不是自己写个假校验器）才能证明「数组套数组的 items」真的被支持——
     * 契约是 `Array<[number, number]>`，而宿主 schema 子集不接受元组写法。
     */
    const base = { ts: 1_700_000_000_000, message: 'boom', source: '0@x', id: '0:1', labels: { app: 'demo' }, raw: 'boom' }
    expect(validateJsonSchemaValue(LINE_SCHEMA, base, 'value')).toEqual([])
    // ES 只在真命中高亮时才带这个键（src/backends/elastic.ts）：带上必须过
    expect(validateJsonSchemaValue(LINE_SCHEMA, { ...base, highlights: [[0, 4], [10, 12]] }, 'value')).toEqual([])
    // 空数组也是合法形态（发了 highlight 子句但这段没命中）
    expect(validateJsonSchemaValue(LINE_SCHEMA, { ...base, highlights: [] }, 'value')).toEqual([])
    // 反例：未声明的键照旧被拦——证明上面对的不是「校验器没在跑」
    const violations = validateJsonSchemaValue(LINE_SCHEMA, { ...base, bogus: 1 }, 'value')
    expect(violations.join()).toContain('is not a declared property')
    // 反例：高亮区间必须是数字（写成字符串要被抓）
    expect(validateJsonSchemaValue(LINE_SCHEMA, { ...base, highlights: [['a', 'b']] }, 'value').join()).toContain('must be a number')
  })

  it('带 highlights 的行能一路穿过 loglens_search 的返回值', async () => {
    // 值校验之外还要证明它真的在工具输出 schema 的**那个位置**上（items 嵌套一层）
    const { add, captured } = capture()
    const highlighted: LogLine = { ...line(1_700_000_000_000, 'boom'), highlights: [[0, 4]] }
    const backend = fakeBackend({ query: async () => resultOf([highlighted]) })
    registerLoglensTools({ config: () => configWith(target('loki', 'loki')), backendFor: () => backend, add })
    const value = await captured.get('loglens_search')!.execute({ from: 1_700_000_000_000, to: 1_700_000_060_000 }) as { lines: LogLine[] }
    const searchSchema = (captured.get('loglens_search') as unknown as { output: { schema: unknown } }).output.schema
    expect(validateJsonSchemaValue(searchSchema, value, 'value')).toEqual([])
    expect(value.lines[0].highlights).toEqual([[0, 4]])
  })
})

describe('renderFields（loglens_fields 的文本）', () => {
  it('冲突字段逐个标出来 + 末尾一句合计（不标就会拿一个类型不一致的字段去分组）', () => {
    const text = renderFields({
      fields: [
        { name: 'host.name', kind: 'indexed', preferred: true },
        { name: 'container.labels.x', kind: 'indexed', conflict: true, esTypes: ['date', 'text'] },
        { name: 'app.name', kind: 'indexed', esTypes: ['text', 'keyword'] },
      ],
      total: 3,
      truncated: false,
      warnings: [],
    })
    expect(text).toContain('字段 3 / 共 3 个')
    expect(text).toContain('* host.name（indexed）')
    expect(text).toContain('container.labels.x（indexed，**类型冲突**：date / text）')
    // 同族多类型只把类型摆出来，不打冲突标记
    expect(text).toContain('app.name（indexed）')
    expect(text).toContain('有 1 个字段**类型冲突**')
  })

  it('没有冲突字段时不多说一句；空清单说的是一句人话', () => {
    const text = renderFields({ fields: [{ name: 'app', kind: 'indexed' }], total: 1, truncated: false, warnings: [] })
    expect(text).toBe('字段 1 / 共 1 个\n  app（indexed）')
    expect(text).not.toContain('类型冲突')
    expect(renderFields({ fields: [], total: 0, truncated: false, warnings: [] })).toBe('这个来源没有报告任何字段。')
  })

  it('截断与警告照旧跟着文本走（只有显式 limit 才会走到这里）', () => {
    const text = renderFields({
      fields: [{ name: 'a', kind: 'indexed' }],
      total: 120,
      truncated: true,
      warnings: ['只列了前 1 个（这个来源共有 120 个字段）：…'],
    })
    expect(text).toContain('字段 1 / 共 120 个（已截断）')
    expect(text).toContain('只列了前 1 个')
  })
})

describe('loglens_facets', () => {
  function facetsBackend(result: Partial<import('../src/backends/types.js').FacetsResult> = {}): LogBackend {
    return fakeBackend({
      facets: async () => ({ buckets: [{ key: 'api', count: 2 }, { key: 'web', count: 1 }], otherCount: 7, countErrorUpperBound: 2, ...result }),
    })
  }

  it('按字段分组：把桶、截断（otherCount）与近似性（误差上界）都报出来', async () => {
    const { add, captured } = capture()
    registerLoglensTools({ config: () => configWith(target('es', 'elasticsearch')), backendFor: () => facetsBackend(), add })
    const value = await captured.get('loglens_facets')!.execute({ by: 'container.name', from: 1_700_000_000_000, to: 1_700_000_060_000 }) as Record<string, unknown>
    expect(value.by).toBe('container.name')
    expect(value.buckets).toEqual([{ key: 'api', count: 2 }, { key: 'web', count: 1 }])
    expect(value.otherCount).toBe(7)
    const warnings = (value.warnings as string[]).join()
    expect(warnings).toContain('落在没列出来的桶里')
    expect(warnings).toContain('近似值')
  })

  it('时间分桶：interval 透传，非法形态与「两个都没给」都当场报错', async () => {
    const { add, captured } = capture()
    registerLoglensTools({ config: () => configWith(target('es', 'elasticsearch')), backendFor: () => facetsBackend({ overTime: [{ ts: 1_700_000_000_000, count: 3 }] }), add })
    const value = await captured.get('loglens_facets')!.execute({ interval: '5m', from: 1_700_000_000_000, to: 1_700_000_060_000 }) as Record<string, unknown>
    expect(value.interval).toBe('5m')
    expect(value.overTime).toEqual([{ ts: 1_700_000_000_000, count: 3 }])
    await expect(captured.get('loglens_facets')!.execute({ from: 1_700_000_000_000, to: 1_700_000_060_000 })).rejects.toThrow('至少要给 by')
    await expect(captured.get('loglens_facets')!.execute({ interval: '5 minutes' })).rejects.toThrow('interval 形态不对')
    await expect(captured.get('loglens_facets')!.execute({ by: 'x', size: 0 })).rejects.toThrow('size 必须是正整数')
    const huge = await captured.get('loglens_facets')!.execute({ by: 'x', size: 5000, from: 1_700_000_000_000, to: 1_700_000_060_000 }) as Record<string, unknown>
    expect((huge.warnings as string[]).join()).toContain('硬上限')
  })

  it('没有聚合能力的来源：给指路文案，而不是一个永远报错的入口', async () => {
    const { add, captured } = capture()
    registerLoglensTools({
      config: () => configWith(target('loki', 'loki')),
      backendFor: () => fakeBackend(),   // 假后端没实现 facets
      add,
    })
    await expect(captured.get('loglens_facets')!.execute({ by: 'app' })).rejects.toThrow('没有聚合适配器')
    const docker = capture()
    registerLoglensTools({ config: () => configWith(target('d', 'docker')), backendFor: () => undefined, add: docker.add })
    await expect(docker.captured.get('loglens_facets')!.execute({ by: 'app' })).rejects.toThrow('docker')
  })
})

describe('loglens_context', () => {
  /*
   * 五行，新的在前（backward）。时间戳必须是**真实的 epoch 毫秒**（用例里拿小数字会被
   * normalizeQuery 的「看起来是秒」判据拦下——那是它的活）。
   */
  const BASE = 1_700_000_000_000
  const at = (offsetMs: number): number => BASE + offsetMs
  const LINES = [line(at(5000), 'e'), line(at(4000), 'd', 'anchor-id'), line(at(3000), 'c'), line(at(2000), 'b'), line(at(1000), 'a')]

  function contextBackend() {
    return fakeBackend({ query: async () => resultOf(LINES) })
  }

  function harness(backend: LogBackend) {
    const { add, captured } = capture()
    registerLoglensTools({ config: () => configWith(target('loki', 'loki')), backendFor: () => backend, add })
    return captured.get('loglens_context')!
  }

  it('高密度窗口：按窗口**真过滤**的后端上，锚点仍要能被取到（loglens D09）', async () => {
    /*
     * 这条用例对付的是一个具体的坏形状：既有用例的 `contextBackend()` **无视 query 参数**、
     * 永远返回同一份 5 行假数据，于是「窗口里只有 5 条」这个前提被白送了——`limit=11` 必然覆盖全窗。
     * 真机上那条前提不成立（窗口 60s 内 636 条），旧实现取到的全是**最新**的 11 条，锚点根本不在页里。
     *
     * 所以这里的后端**按 from/to/direction/limit 真过滤**，模拟真实高密度：
     * 在锚点前后各铺 200 条（每 100ms 一条），锚点位于中间。旧实现会取到窗口里最新的 11 条而失配，
     * 新实现（两段取）必须命中。
     */
    const anchorTs = at(10_000)
    const dense: LogLine[] = []
    for (let offset = -200; offset <= 200; offset++) {
      const ts = anchorTs + offset * 100
      dense.push({ ts, message: 'row-' + String(offset), source: 's', labels: {}, raw: '', id: 'id-' + String(offset) })
    }
    const windowed = fakeBackend({
      query: async (query) => {
        // 按方向与边界真过滤，再按方向取 limit —— 与真实后端的语义一致
        const inWindow = dense.filter((line) => line.ts >= query.from && line.ts <= query.to)
        const ordered = query.direction === 'forward'
          ? [...inWindow].sort((a, b) => a.ts - b.ts)
          : [...inWindow].sort((a, b) => b.ts - a.ts)
        const lines = ordered.slice(0, query.limit)
        return resultOf(lines, {
          counts: { returned: lines.length, matched: inWindow.length, totalKnown: true },
          truncation: { truncated: inWindow.length > lines.length, reasons: inWindow.length > lines.length ? ['hit_limit'] : [] },
        })
      },
    })
    const value = await harness(windowed).execute({ ts: anchorTs, id: 'id-0', before: 2, after: 2 }) as {
      anchor: LogLine
      before: LogLine[]
      after: LogLine[]
    }
    // 锚点必须真的被取到，两侧各 2 行、且顺序为时间升序
    expect(value.anchor.id).toBe('id-0')
    expect(value.before.map((line) => line.id)).toEqual(['id--2', 'id--1'])
    expect(value.after.map((line) => line.id)).toEqual(['id-1', 'id-2'])
  })

  it('按 id 定位锚点，两侧都按时间升序返回（读起来跟日志文件一样）', async () => {
    const value = await harness(contextBackend()).execute({ ts: at(4000), id: 'anchor-id', before: 1, after: 1 }) as {
      anchor: LogLine
      before: LogLine[]
      after: LogLine[]
    }
    expect(value.anchor.message).toBe('d')
    expect(value.before.map((item) => item.message)).toEqual(['c'])
    expect(value.after.map((item) => item.message)).toEqual(['e'])
  })

  it('没有 id 时用 ts + message 定位；只有一个 ts 也能落', async () => {
    const byMessage = await harness(contextBackend()).execute({ ts: at(3000), message: 'c', before: 1, after: 0 }) as { anchor: LogLine }
    expect(byMessage.anchor.message).toBe('c')
    const byTs = await harness(contextBackend()).execute({ ts: at(2000), before: 0, after: 0 }) as { anchor: LogLine }
    expect(byTs.anchor.message).toBe('b')
  })

  it('**正文片段**也能定位到锚点（真机那条 message 是整行、片段只是其中一段）', async () => {
    /*
     * 真机形态：message 是整行（前缀 + 时间 + logger + 正文），调用方手里只有正文片段。
     * 严格相等那版在这里必然失败——而它恰恰是最常见的用法（人从渲染文本里只看得见正文片段）。
     */
    const full = '[ERROR] [2026-10-18 22:01:43] T:[] 1 o.s.boot.SpringApplication Application run failed'
    const backend = fakeBackend({ query: async () => resultOf([{ ...line(at(4000), full, 'doc-9') }]) })
    const value = await harness(backend).execute({ ts: at(4000), message: 'Application run failed', before: 0, after: 0 }) as { anchor: LogLine }
    expect(value.anchor.message).toBe(full)
    expect(value.anchor.id).toBe('doc-9')
  })

  it('空白差异不算差异（规范化后相等）；规范化仍不等时才退到子串', async () => {
    const backend = fakeBackend({ query: async () => resultOf([line(at(3000), 'a   b\tc', 'w-1')]) })
    const value = await harness(backend).execute({ ts: at(3000), message: '  a b c  ' }) as { anchor: LogLine }
    expect(value.anchor.id).toBe('w-1')
  })

  it('包含档**两边都规范化**：从渲染文本抄出来的四种空白差异都要能命中（收口 F1）', async () => {
    /*
     * needle 是调用方从 `formatLine` 的渲染文本里抄的，抄出空白差异是常态。
     * 上一版只对「整条相等」做了规范化、包含档还用原始串，于是这四种输入全部失配——只修好了一半。
     */
    const full = '[ERROR] [2026-10-18 22:01:43] T:[] 1 o.s.boot.SpringApplication Application run failed'
    const picked = async (needle: string): Promise<string> => {
      const backend = fakeBackend({ query: async () => resultOf([line(at(4000), full, 'doc-9')]) })
      const value = await harness(backend).execute({ ts: at(4000), message: needle }) as { anchor: LogLine }
      return value.anchor.id
    }
    // 干净片段（对照组）
    expect(await picked('Application run failed'), '干净片段').toBe('doc-9')
    // ① 尾随空格（抄到行尾 `  #doc-9` 一带时很容易带上）
    expect(await picked('Application run failed '), '尾随空格').toBe('doc-9')
    // ② 行内连续空格被抄成两个
    expect(await picked('Application  run failed'), '行内双空格').toBe('doc-9')
    // ③ 首尾都有空白
    expect(await picked('  Application run failed  '), '首尾空白').toBe('doc-9')
    // ④ 连前缀一起抄
    expect(await picked(' [ERROR] [2026-10-18 22:01:43] T:[]'), '连前缀一起抄').toBe('doc-9')
  })

  it('子串只做**单向**包含：短行不会匹配掉长正文（反向包含是危险的）', async () => {
    /*
     * 候选里只有 `err`，而调用方给的是一大段——反向包含会把它认成锚点，这里必须落空。
     * 候选行的 ts **刻意不等于** anchorTs（收口 F3）：上一版这两者相等，于是「落空」其实是
     * ts 兜底档被摘掉造成的，这条用例并没有证明反向包含被排除，还把回退固化成期望行为。
     */
    const backend = fakeBackend({ query: async () => resultOf([line(at(9000), 'err', 'short-1')]) })
    await expect(harness(backend).execute({ ts: at(3000), message: 'a much longer text containing err', spanMs: 60_000 }))
      .rejects.toThrow('锚点行没在这次重查里返回')
  })

  it('同一份数据里 ts 相等时反向包含**仍不命中**，由 ts 档兜住（收口 F3 + F2）', async () => {
    const backend = fakeBackend({ query: async () => resultOf([line(at(3000), 'err', 'short-1')]) })
    const value = await harness(backend).execute({ ts: at(3000), message: 'a much longer text containing err' }) as { anchor: LogLine, warnings: string[] }
    // 命中的原因是**时间戳**，不是「err 被长文包住」——warnings 必须说清这两者的区别
    expect(value.anchor.id).toBe('short-1')
    expect(value.warnings.join()).toContain('只按时间戳')
  })

  it('**ts 档永远兜底**：给了匹配不上的正文也不能说「锚点行没返回」（收口 F2）', async () => {
    /*
     * 行就在返回值里、ts 与锚点完全相等，只是正文对不上——旧实现（HEAD）这里返回 doc-9，
     * 上一版却抛「锚点行没在这次重查里返回」并归因到保留期/窗口（**假话**）。
     */
    const backend = fakeBackend({ query: async () => resultOf([line(at(4000), 'some other line', 'doc-9')]) })
    const value = await harness(backend).execute({ ts: at(4000), message: 'totally different text' }) as { anchor: LogLine, warnings: string[] }
    expect(value.anchor.id).toBe('doc-9')
    expect(value.warnings.join()).toContain('只按时间戳')
  })

  it('ts 档与「有没有给正文」无关：不给正文、正文对不上、正文为空白，三种都给同一条', async () => {
    const rows = [line(at(4000), 'some other line', 'doc-9')]
    const run = async (args: Record<string, unknown>): Promise<string> => {
      const value = await harness(fakeBackend({ query: async () => resultOf(rows) })).execute(args) as { anchor: LogLine }
      return value.anchor.id
    }
    expect(await run({ ts: at(4000) })).toBe('doc-9')
    expect(await run({ ts: at(4000), message: 'nope' })).toBe('doc-9')
    expect(await run({ ts: at(4000), message: ' ' })).toBe('doc-9')
  })

  it('空白 needle 一律当「没给正文」：一个空格不该成为定位依据（收口 F6）', async () => {
    // 候选 ts ≠ anchorTs：旧实现在这里会凭一个空格「成功」返回一条含空格的行，毫无信号
    const noise = [line(at(9000), 'has space here', 'noise')]
    const run = async (message: string): Promise<unknown> => harness(fakeBackend({ query: async () => resultOf(noise) }))
      .execute({ ts: at(3000), message, spanMs: 60_000 })
    await expect(run(' ')).rejects.toThrow('锚点行没在这次重查里返回')
    await expect(run('   ')).rejects.toThrow('锚点行没在这次重查里返回')
    await expect(run('\t')).rejects.toThrow('锚点行没在这次重查里返回')
    // 同一份数据里给一个非空片段照旧能命中——不是把整条路堵死
    const value = await harness(fakeBackend({ query: async () => resultOf(noise) }))
      .execute({ ts: at(9000), message: 'has space' }) as { anchor: LogLine }
    expect(value.anchor.id).toBe('noise')
  })

  it('同档多候选取 |ts - anchorTs| 最小的那条（不是「来源排序靠前的」那条）', async () => {
    // backward：新的在前。`Connection refused` 三条，离 at(10_000) 最近的是 at(12_000)（近的那条**排在后面**）
    const backend = fakeBackend({
      query: async () => resultOf([
        line(at(12_000), 'Connection refused', 'near'),
        line(at(90_000), 'Connection refused', 'far'),
        line(at(3000), 'Connection refused', 'farther'),
      ]),
    })
    const value = await harness(backend).execute({ ts: at(10_000), message: 'Connection refused' }) as { anchor: LogLine }
    expect(value.anchor.id).toBe('near')
  })

  it('同档同距按 **id 字典序**取小（不是按 ts、也不是按数组顺序）', async () => {
    // 距离并列（各差 1000）；字典序小的是 `a-later`，而它**不是**更早的那条 —— 结果只能由 id 次序解释
    const backend = fakeBackend({
      query: async () => resultOf([
        line(at(11_000), 'Connection refused', 'a-later'),
        line(at(9_000), 'Connection refused', 'z-earlier'),
      ]),
    })
    const value = await harness(backend).execute({ ts: at(10_000), message: 'Connection refused' }) as { anchor: LogLine }
    expect(value.anchor.id).toBe('a-later')
  })

  it('同档同距同 ts 时**两种排列挑出同一行**（收口 F5：结果与返回顺序无关）', async () => {
    /*
     * 两条 ts 相同、正文都严格相等，只有 id 不同。只按「数组里靠后那条胜」挑的话，
     * 两种排列会挑出**不同的行**——而 context 的重查恒 backward、search 可以 forward，
     * 真机里调用方读到的那一行与这里挑中的那一行就可以不是同一行（且全程无声）。
     */
    const a = line(at(4000), 'Connection refused', 'id-a')
    const b = line(at(4000), 'Connection refused', 'id-b')
    const pick = async (rows: LogLine[]): Promise<string> => {
      const value = await harness(fakeBackend({ query: async () => resultOf(rows) }))
        .execute({ ts: at(4000), message: 'Connection refused' }) as { anchor: LogLine }
      return value.anchor.id
    }
    const backward = await pick([a, b])
    const forward = await pick([b, a])
    expect(forward).toBe(backward)
    expect(backward).toBe('id-a')   // 确定的次级键：id 字典序小的那个
  })

  it('id 优先于正文匹配：即便另一条正文长得更像锚点', async () => {
    const backend = fakeBackend({
      query: async () => resultOf([
        line(at(4000), 'exactly what was asked', 'exact-ish'),
        line(at(3000), 'Application run failed', 'doc-7'),
      ]),
    })
    const value = await harness(backend).execute({ ts: at(3000), id: 'doc-7', message: 'Application run failed' }) as { anchor: LogLine }
    expect(value.anchor.id).toBe('doc-7')
  })

  it('渲染 token `#doc-42` 原样抄进 id 能用（剥一个前导 #），精确命中就不唠叨（收口 F4）', async () => {
    // anchorTs 刻意**不落在任何一行上**：能命中只能是 id 档，排除了 ts 兜底顺手救回来的可能
    const backend = fakeBackend({
      query: async () => resultOf([line(at(4000), 'boom', 'doc-42'), line(at(5000), 'other', 'other-1')]),
    })
    const value = await harness(backend).execute({ ts: at(9000), id: '#doc-42' }) as { anchor: LogLine, warnings: string[] }
    expect(value.anchor.id).toBe('doc-42')
    expect(value.warnings).toEqual([])
    // 不带 `#` 的原样 id 当然也认
    const plain = await harness(backend).execute({ ts: at(9000), id: 'doc-42' }) as { anchor: LogLine, warnings: string[] }
    expect(plain.anchor.id).toBe('doc-42')
    expect(plain.warnings).toEqual([])
  })

  it('**真以 `#` 开头的 id 照抄回来要能命中**（原值优先，收口 H1）', async () => {
    /*
     * ES 的 `_id` 用户可自定、可以含 `#`，而结构化返回值 `lines[].id` 给的就是 `#abc`。
     * 上一版**先剥** `#`，于是这个坐标被改写、反而失配（旧版是命中的）——一条真回退。
     * anchorTs 不落在任何一行上，能命中只能是 id 档。
     */
    const backend = fakeBackend({ query: async () => resultOf([line(at(4000), 'boom', '#abc'), line(at(5000), 'other', 'other-1')]) })
    const value = await harness(backend).execute({ ts: at(9000), id: '#abc' }) as { anchor: LogLine, warnings: string[] }
    expect(value.anchor.id).toBe('#abc')
    expect(value.warnings).toEqual([])      // 精确坐标档，不唠叨
  })

  it('原值命中优先于剥 `#` 变体命中（两个候选都算精确档，但原值在前）', async () => {
    // 结果里同时有 `#abc` 与 `abc` 两行：给的 id 是 `#abc`，必须挑 `#abc` 那条
    const rows = [line(at(5000), 'the plain one', 'abc'), line(at(4000), 'the hashed one', '#abc')]
    const backend = fakeBackend({ query: async () => resultOf(rows) })
    const value = await harness(backend).execute({ ts: at(9000), id: '#abc' }) as { anchor: LogLine, warnings: string[] }
    expect(value.anchor.id).toBe('#abc')
    expect(value.warnings).toEqual([])
    // findAnchor 层把两档分开：原值 → 'id'，剥 # 变体 → 'idStripped'
    expect(findAnchor(rows, { anchorTs: at(9000), wantedId: '#abc', wantedIdStripped: 'abc' })?.kind).toBe('id')
    expect(findAnchor(rows, { anchorTs: at(9000), wantedId: '#zzz', wantedIdStripped: 'abc' })?.kind).toBe('idStripped')
  })

  it('id 两个候选都不中时照旧报错，且文案回显的是**原值**、不改写坐标（收口 H1）', async () => {
    const backend = fakeBackend({ query: async () => resultOf([line(at(5000), 'other')]) })
    const error = await harness(backend)
      .execute({ ts: at(4000), id: '#abc' })
      .then(() => undefined, (reason: Error) => reason.message)
    expect(error).toContain('锚点行没在这次重查里返回')
    expect(error).toContain('① id 精确等于 "#abc"')          // 原值在前
    expect(error).toContain('剥掉一个前导 # 的 "abc"')        // 变体也如实列出来
  })

  it('ts 档的措辞按**实际入参**说（收口 H2：不许说「没给 id 也没给正文」那种假话）', async () => {
    // 三种入参都落到 ts 兜底档（行在上、ts 相等，只是 id/正文对不上）
    const rows = () => [line(at(4000), 'the actual line', 'doc-9')]
    const run = async (args: Record<string, unknown>): Promise<string> => {
      const value = await harness(fakeBackend({ query: async () => resultOf(rows()) }))
        .execute(args) as { anchor: LogLine, warnings: string[] }
      expect(value.anchor.id).toBe('doc-9')      // 三种都靠 ts 档兜住
      return value.warnings.join()
    }
    // ① 给了 id 但落空、没给正文 → 说「给的 id 没匹配到」，不许说「没给 id」
    const withId = await run({ ts: at(4000), id: 'stale-id' })
    expect(withId).toContain('给的 id 没匹配到')
    expect(withId).not.toContain('没给 id')
    expect(withId).not.toContain('也没给正文')
    // ② 给了正文但规范化后是空的 → 说「正文去掉空白后是空的」，不许说「没给正文」
    const blank = await run({ ts: at(4000), message: '   ' })
    expect(blank).toContain('正文去掉空白后是空的')
    expect(blank).not.toContain('没给 id 也没给正文')
    // ③ 真的两样都没给 → 才说这句
    const neither = await run({ ts: at(4000) })
    expect(neither).toContain('调用方没给 id 也没给正文')
  })

  it('给了全是空白的 id：按「没给」处理，但**措辞要说出来**（收口 G1）', async () => {
    /*
     * 与上一条同一口径，只是上一轮漏在 id 那一侧：`id: '   '` 时旧措辞会说「调用方没给 id 也没给正文」
     * ——调用方明明给了。「给了东西但被规范化丢掉」与「压根没给」是两件事，措辞不许混成一件。
     */
    const rows = () => [line(at(4000), 'the actual line', 'doc-9')]
    const run = async (args: Record<string, unknown>): Promise<string> => {
      const value = await harness(fakeBackend({ query: async () => resultOf(rows()) }))
        .execute(args) as { anchor: LogLine, warnings: string[] }
      expect(value.anchor.id).toBe('doc-9')      // 空白 id 当没给 → 落到 ts 兜底档
      return value.warnings.join()
    }
    const blankId = await run({ ts: at(4000), id: '   ' })
    expect(blankId).toContain('给的 id 去掉空白后是空的')
    expect(blankId).not.toContain('调用方没给 id 也没给正文')
    // 两侧都是空白时两句话都要在，不许被其中一句吃掉
    const both = await run({ ts: at(4000), id: ' ', message: '\t\n' })
    expect(both).toContain('给的 id 去掉空白后是空的')
    expect(both).toContain('正文去掉空白后是空的')
    expect(both).not.toContain('调用方没给 id 也没给正文')
    // 失配（连 ts 都对不上）那条路上也要说清楚，别让调用方以为工具把他的 id 弄丢了
    await expect(harness(fakeBackend({ query: async () => resultOf(rows()) }))
      .execute({ ts: at(9999), id: '   ' })).rejects.toThrow('你给的 id 去掉空白后是空的')
  })

  it('并列时优先挑「有坐标」的那一行：空 id 排在字典序最后（收口 H4）', async () => {
    /*
     * 同距 + 同 ts + 同正文，只有 id 一个空一个有值。空串在字典序里最小，旧比较会挑中**没有坐标**
     * 的那一行（调用方拿它没法继续精确定位）。两种排列都要挑有坐标的那条。
     */
    const withId = line(at(4000), 'duplicated line', 'has-coordinate')
    const noId = line(at(4000), 'duplicated line', '')
    const pick = async (rows: LogLine[]): Promise<string> => {
      const value = await harness(fakeBackend({ query: async () => resultOf(rows) }))
        .execute({ ts: at(4000), message: 'duplicated line' }) as { anchor: LogLine }
      return value.anchor.id
    }
    expect(await pick([noId, withId])).toBe('has-coordinate')
    expect(await pick([withId, noId])).toBe('has-coordinate')   // 与排列顺序无关
  })

  it('id 落空提示回显**调用方给的原文**，不是剥过 `#` 的内部候选（收口 H5）', async () => {
    // 行落在 anchorTs 上（走 ts 兜底档 → 产生 warnings），但 id 两个候选都对不上
    const backend = fakeBackend({ query: async () => resultOf([line(at(4000), 'the actual line', 'other')]) })
    const value = await harness(backend).execute({ ts: at(4000), id: '#stale#id' }) as { anchor: LogLine, warnings: string[] }
    expect(value.anchor.id).toBe('other')
    const warnings = value.warnings.join()
    expect(warnings).toContain('"#stale#id"')     // 原文（带 #）
    expect(warnings).not.toContain('"stale#id"')  // 剥过的内部候选不该出现在回显里
  })

  it('**【已知残余·本轮不修】四键全并列时仍由数组顺序决定**（H3：钉住边界，不是在宣告它是对的）', async () => {
    /*
     * 两条行在「距离 / id / 正文 / ts」四键上完全相同、只在 labels 上不同——比较函数四个键都判不出高下，
     * 于是由 lines 的排列顺序决定挑哪一条。`findAnchor` 的注释里已把这条写明（并注了为什么本轮不修：
     * ES 的 `_id` 唯一、Loki 的 id 是 `tsNs:序号` 唯一，只有 ES `_id` 缺失回落成 `''` 时才可能）。
     * 这条用例的作用是让那条边界**可被验证**，而不是宣告顺序依赖是对的：真要收口得再找一个
     * 与顺序无关的键（例如 labels 的序列化），那属于另一轮的判断。
     */
    const x = line(at(4000), 'same message', 'same-id')
    const y = { ...line(at(4000), 'same message', 'same-id'), labels: { app: 'demo', pod: 'y' } }
    const pick = async (rows: LogLine[]): Promise<string | undefined> => {
      const value = await harness(fakeBackend({ query: async () => resultOf(rows) }))
        .execute({ ts: at(4000), message: 'same message' }) as { anchor: LogLine }
      return value.anchor.labels.pod
    }
    // 两种排列给出的行可以不同（这就是那条残余）；它们是不同的行，不是同一行
    expect([await pick([x, y]), await pick([y, x])].sort()).toEqual([undefined, 'y'].sort())
  })

  it('给了 id 但对不上：warnings 明说「id 没匹配到、改用哪一档」（收口 F4）', async () => {
    const backend = fakeBackend({ query: async () => resultOf([line(at(4000), 'Application run failed', 'doc-8')]) })
    const value = await harness(backend)
      .execute({ ts: at(4000), id: 'stale-id', message: 'Application run failed' }) as { anchor: LogLine, warnings: string[] }
    // 悄悄换成 doc-8 这件事必须被说出来（旧版 warnings 是空的）
    expect(value.anchor.id).toBe('doc-8')
    const warnings = value.warnings.join()
    expect(warnings).toContain('stale-id')
    expect(warnings).toContain('没匹配到')
    expect(warnings).toContain('严格相等')      // 说清改用了哪一档
  })

  it('两档的可信度不同，措辞也不同：substring 才是「可能不是你要的那一行」（降噪 2）', async () => {
    /*
     * 2026-10-19 降噪：`normalized`（整条正文只差空白）与 `substring`（片段）**可信度差一个量级**——
     * 前者内容完全相同、后者能在几十条里出现。上一版对两档用同一句警报级措辞，对前者是过度惊吓，
     * 而「每次都响的警报没人读」会让真正该怕的那档失效。
     */
    const rows = [line(at(4000), 'a   b c', 'spaced'), line(at(4000), 'xx Application run failed yy', 'inside')]
    const run = async (message: string): Promise<string[]> => {
      const value = await harness(fakeBackend({ query: async () => resultOf(rows) }))
        .execute({ ts: at(4000), message }) as { warnings: string[] }
      return value.warnings
    }
    // ① normalized：说清「内容是同一条，只是空白被折叠」，**不再**用警报级措辞
    const normalized = (await run('a b c')).join()
    expect(normalized).toContain('规范化空白后')
    expect(normalized).toContain('内容是同一条')
    expect(normalized).not.toContain('**这是模糊命中')
    // ② substring：保留警报级措辞——这一档真的可能挑错行
    const substring = (await run('Application run failed')).join()
    expect(substring).toContain('**这是模糊命中，可能不是你要的那一行**')
    expect(substring).toContain('单向包含')
    /*
     * ③ 降噪 1：窗口内**唯一**命中时两档都不提「多解」。上面对照的 rows 里各只有一条能命中，
     * 所以措辞里不该出现「N 行」那种多解计数。
     */
    expect(normalized).not.toContain('行规范化后相同')
    expect(substring).not.toContain('行都含这个片段')
    /*
     * ④ 反过来：窗口内真有第二条也含这个片段时，substring 必须把多解说出来的（否则调用方以为它是唯一的）。
     */
    const many = [
      line(at(4000), 'xx Application run failed yy', 'inside-1'),
      line(at(4000), 'zz Application run failed ww', 'inside-2'),
    ]
    const duplicated = await harness(fakeBackend({ query: async () => resultOf(many) }))
      .execute({ ts: at(4000), message: 'Application run failed' }) as { anchor: LogLine, warnings: string[] }
    expect(duplicated.warnings.join()).toContain('有 2 行都命中')
  })

  it('降噪**不许**把「页内唯一」当成「窗内唯一」：页被截断时仍要提醒（复核 F1）', async () => {
    /*
     * 这是本轮最贵的一条回归，值得把现场写清楚：
     *
     * context 的重查是 `limit = before + after + 1`（默认 11）**且 backward**（新的在前、旧的在后），
     * 所以**最旧的行最先被截掉**。只看「返回的这一页里正文只出现一次」（`ties === 1`）就闭嘴，会在
     * 「调用方要的是被截到页外的那条、而页内恰有一条同正文的行」时**静默换成另一个时刻的同一段正文**
     * ——复核实测随机窗口里 36% 会这样，而且 warnings 是空的（调用方毫不知情）。
     *
     * 判据必须加上「整窗取全了吗」：`counts.matched` 给了就比行数，没给就看 `truncation.truncated`。
     */
    const target = line(at(0), 'Application run failed', 'target-oldest')
    const decoy = line(at(60_000), 'Application run failed', 'decoy-newest')
    // 后端只回了一页（目标那条被截掉了），而 matched=2 说明窗里其实有两条
    const pageOnly = fakeBackend({
      query: async () => resultOf([decoy], { counts: { returned: 1, matched: 2, totalKnown: true } }),
    })
    const truncated = await harness(pageOnly).execute({ ts: at(0), message: 'Application run failed' }) as {
      anchor: LogLine, warnings: string[]
    }
    // 锚点确实被换成了另一时刻的那条（这一层无法避免——页里只有它），但**必须说出来**
    expect(truncated.anchor.id).toBe('decoy-newest')
    const warnings = truncated.warnings.join()
    expect(warnings).not.toBe('')                    // 旧实现这里静默，正是缺陷所在
    expect(warnings).toContain('严格相等')            // 说清是按正文挑的
    expect(warnings).toContain('这一页')              // 且只说「这一页」，不谎称「同一时间窗」
    /*
     * 对照组：整窗取全（matched === 返回行数）且正文唯一 → 允许闭嘴。
     * 两组的唯一差别是 counts.matched，这正是「页内 vs 窗内」的分界线。
     */
    const complete = fakeBackend({ query: async () => resultOf([target]) })
    const quiet = await harness(complete).execute({ ts: at(0), message: 'Application run failed' }) as { warnings: string[] }
    expect(quiet.warnings.join()).toBe('')
    /*
     * 第二个判据：后端没给 matched 时看 truncation.truncated。
     * 标记为「截断」→ 不许闭嘴；标记为「未截断」→ 可以闭嘴。
     */
    const noCountButTruncated = fakeBackend({
      query: async () => resultOf([decoy], { truncation: { truncated: true, reasons: ['hit_limit'] } }),
    })
    const warned = await harness(noCountButTruncated).execute({ ts: at(0), message: 'Application run failed' }) as {
      warnings: string[]
    }
    expect(warned.warnings.join()).not.toBe('')
  })

  it('多解计数只说「这一页里有 N 行」，不谎称「同一时间窗」（复核 F2）', async () => {
    /*
     * 窗口里可能有 30 行同正文、而这一页只有 11 行。旧措辞写「同一时间窗里有 11 行」——**低报**，
     * 会让调用方以为缩一点窗口就够了，而实际上还差得远。手里只有这一页，就只说这一页。
     */
    const rows = [line(at(4000), 'dup', 'a'), line(at(5000), 'dup', 'b'), line(at(6000), 'dup', 'c')]
    const value = await harness(fakeBackend({
      query: async () => resultOf(rows, { counts: { returned: 3, matched: 30, totalKnown: true } }),
    })).execute({ ts: at(4000), message: 'dup' }) as { warnings: string[] }
    const warnings = value.warnings.join()
    expect(warnings).toContain('3 行正文完全相同')
    expect(warnings).not.toContain('同一时间窗里有 3 行')
  })

  it('exact 档：窗口内**唯一**命中时不唠叨，有多解时才提醒（降噪 1）', async () => {
    /*
     * 2026-10-19 降噪：`exact` 是「正文逐字对上」。窗口里只有这一条时，没有任何挑错行的空间，
     * 上一版每次都说一句「（不是 id）…要精确锁定请传 id」——常见路径每次都多一行噪音。
     * 改成**只在真有多个候选时**才提醒。
     */
    const single = await harness(fakeBackend({ query: async () => resultOf([line(at(4000), 'Application run failed', 'doc-8')]) }))
      .execute({ ts: at(4000), message: 'Application run failed' }) as { anchor: LogLine, warnings: string[] }
    expect(single.anchor.id).toBe('doc-8')       // 照常命中
    expect(single.warnings.join()).toBe('')      // 唯一命中 → 一句都不说
    // 多解：必须把「有几行一样、取的是哪一条」说出来（否则调用方以为锚点是唯一的）
    const duplicated = await harness(fakeBackend({
      query: async () => resultOf([
        line(at(4000), 'Application run failed', 'doc-a'),
        line(at(5000), 'Application run failed', 'doc-b'),
      ]),
    })).execute({ ts: at(4000), message: 'Application run failed' }) as { anchor: LogLine, warnings: string[] }
    const warnings = duplicated.warnings.join()
    expect(warnings).toContain('严格相等')
    expect(warnings).toContain('不是 id')
    expect(warnings).toContain('2 行正文完全相同')
  })

  it('只给 ts 仍只认时间戳相等（宽容匹配不许污染这条退路）', async () => {
    const backend = fakeBackend({ query: async () => resultOf([line(at(3001), 'Application run failed', 'off-by-one')]) })
    await expect(harness(backend).execute({ ts: at(3000), spanMs: 60_000 })).rejects.toThrow('锚点行没在这次重查里返回')
  })

  it('失配文案说清试过哪几档匹配 + 下一步（传 id / 调大 spanMs）', async () => {
    const backend = fakeBackend({ query: async () => resultOf([line(at(5000), 'other')]) })
    const messageOnly = await harness(backend)
      .execute({ ts: at(4000), message: 'Application run failed', spanMs: 30_000 })
      .then(() => undefined, (reason: Error) => reason.message)
    expect(messageOnly).toContain('锚点行没在这次重查里返回')
    // 编号连续、依次列出这次**真试过**的档：没给 id 时正文占 ①②③、时间戳是 ④
    expect(messageOnly).toContain('① 正文严格相等')
    expect(messageOnly).toContain('③ 正文')
    expect(messageOnly).toContain('Application run failed')
    expect(messageOnly).toContain('30000')          // 当前 spanMs 回显出来，别让人去猜该调哪个数
    expect(messageOnly).toContain('spanMs')
    expect(messageOnly).toContain('保留期')
    expect(messageOnly).toContain('④ 时间戳')
    expect(messageOnly).toContain('永远兜底')
    // 没传 id 时不该谎称试过 id 那一档
    expect(messageOnly).not.toContain('id 精确等于')

    const withId = await harness(backend)
      .execute({ ts: at(4000), id: 'doc-7', message: 'Application run failed' })
      .then(() => undefined, (reason: Error) => reason.message)
    expect(withId).toContain('① id 精确等于 "doc-7"')
    expect(withId).toContain('⑤ 时间戳')
  })

  it('findAnchor 锁住五档链：逐档降级、ts 永远兜底、并列有确定次序', () => {
    const rows: LogLine[] = [
      line(at(0), 'aaa', 'a'),
      line(at(50), 'bbb bbb', 'exact-far'),        // 严格相等，但离 anchorTs 更远
      line(at(-50), 'xx bbb yy', 'sub-earlier'),   // 只是子串，但更近
      line(at(50), 'xx bbb yy', 'sub-later'),
    ]
    // 档位优先于距离：exact 比 substring 高一档，哪怕它离得更远
    expect(findAnchor(rows, { anchorTs: at(0), wantedMessage: 'bbb bbb' })?.kind).toBe('exact')
    /*
     * 只给片段 `yy`：只有后两条含它（第一条 `bbb bbb` 不含），两条同距 → 按 id 字典序取小，
     * 即 `sub-earlier`（若按数组顺序/ts 早的挑，结果都会是 `sub-earlier` 或 `sub-later` 之一，
     * 这条同时把「与顺序无关的次级键」钉在 findAnchor 这一层）
     */
    expect(findAnchor(rows, { anchorTs: at(0), wantedMessage: 'yy' })).toEqual({ index: 2, kind: 'substring', ties: 2 })
    // ties 是「这一档在窗口里命中了几行」——降噪靠它（==1 时没有挑错行的空间，不必吓人）
    expect(findAnchor(rows, { anchorTs: at(0), wantedMessage: 'aaa' })?.ties).toBe(1)
    expect(findAnchor(rows, { anchorTs: at(0), wantedId: 'sub-later' })?.ties).toBe(1)
    // 高档位出现时 ties 重来：`exact-far` 是唯一严格相等的，低档那两条子串不算进它的多解
    expect(findAnchor(rows, { anchorTs: at(0), wantedMessage: 'bbb bbb' })?.ties).toBe(1)
    expect(findAnchor(rows, { anchorTs: at(0), wantedId: 'sub-later' })?.kind).toBe('id')
    expect(findAnchor(rows, { anchorTs: at(0), wantedMessage: 'aaa' })?.kind).toBe('exact')
    // 规范化包含（F1）：原串对不上、规范化后是子串
    expect(findAnchor(rows, { anchorTs: at(0), wantedMessage: 'xx   bbb   yy' })?.kind).toBe('normalized')
    expect(findAnchor(rows, { anchorTs: at(0), wantedMessage: '  bbb  ' })?.kind).toBe('substring')
    // ts 永远兜底（F2）：给了对不上的正文、也没有 id，仍然落到时间戳那一档
    expect(findAnchor(rows, { anchorTs: at(0), wantedMessage: 'zzz' })).toEqual({ index: 0, kind: 'ts', ties: 1 })
    expect(findAnchor(rows, { anchorTs: at(50) })?.kind).toBe('ts')
    // 空白 needle 当没给（F6）：' ' 与 undefined 等价 → 也落到 ts 档/'落空'
    expect(findAnchor(rows, { anchorTs: at(0), wantedMessage: ' ' })).toEqual({ index: 0, kind: 'ts', ties: 1 })
    // 没有任何一行落在 anchorTs 上，且正文也对不上 → 落空（不是「随便挑一行」）
    expect(findAnchor(rows, { anchorTs: at(7) })).toBeUndefined()
    expect(findAnchor(rows, { anchorTs: at(7), wantedMessage: 'zzz' })).toBeUndefined()
  })

  it('锚点没在重查结果里：报错说清可能是保留期或窗口太窄', async () => {
    await expect(harness(contextBackend()).execute({ ts: at(999_000) })).rejects.toThrow('保留期')
    await expect(harness(contextBackend()).execute({ ts: at(999_000) })).rejects.toThrow('spanMs')
  })

  it('缺 ts 直接报错（它是唯一的定位锚）', async () => {
    await expect(harness(contextBackend()).execute({ id: 'anchor-id' })).rejects.toThrow('ts 必填')
  })

  it('锚点两侧**分段取**，各段窗口按 spanMs、limit 按 before/after（loglens D09）', async () => {
    /*
     * 旧实现是单个窗口 `[ts-span, ts+span]` + `limit = before+after+1` + backward，真机上
     * 锚点经常落不进那一页（窗口 636 条只取 11 条，取到的全是最新的）。现在改两段：
     *   早段  [ts-span, ts] + backward + limit=before+1
     *   晚段  [ts, ts+span] + forward  + limit=after+1
     * 这条用例钉的就是**两段**这个契约——退回单窗口会让下面第一个断言（长度 2）立刻红。
     */
    const queries: NormalizedQuery[] = []
    const backend = fakeBackend({ query: async (query) => { queries.push(query); return resultOf(LINES) } })
    await harness(backend).execute({ ts: at(3000), id: 'anchor-id', before: 999, after: -3, spanMs: 5000 })
    expect(queries).toHaveLength(2)
    // 早段：before 夹到 50 → limit = 50 + 1（锚点自己也算一行）；after -3 夹到 0 → limit = 0 + 1
    expect(queries[0].direction).toBe('backward')
    expect(queries[0].from).toBe(at(3000) - 5000)
    expect(queries[0].to).toBe(at(3000))
    expect(queries[0].limit).toBe(51)
    expect(queries[1].direction).toBe('forward')
    expect(queries[1].from).toBe(at(3000))
    expect(queries[1].to).toBe(at(3000) + 5000)
    expect(queries[1].limit).toBe(1)
    expect(clampCount(3, 5)).toBe(3)
    expect(clampCount(-1, 5)).toBe(0)
    expect(clampCount(99, 5)).toBe(50)
    expect(clampCount('x', 5)).toBe(5)
  })
})

describe('渲染', () => {
  it('时间戳带**显式偏移**，且与正文里的本地时间对得上（真机反馈第 5 条）', () => {
    /*
     * 症状：行首是 `14:01:43Z`（UTC）、正文里是 `22:01:43`（本地），同一行两套时间，换算 epoch 时必错。
     * 改法见 `formatTimestamp` 的头注释：本地时间 + 显式偏移，仍是可 `Date.parse` 的 ISO 8601。
     */
    const rendered = formatTimestamp(1_700_000_000_000)
    // 形态：`YYYY-MM-DDTHH:MM:SS.mmm±HH:MM`——**必须带偏移**，不能是裸的 `Z`
    expect(rendered).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{2}:\d{2}$/)
    // 仍能被解析回同一个瞬间（机器侧不因这次改动而需要改解析）
    expect(Date.parse(rendered)).toBe(1_700_000_000_000)
    // offset 与本地时区自洽
    const minutes = -new Date(1_700_000_000_000).getTimezoneOffset()
    const pad = (value: number) => String(Math.trunc(Math.abs(value))).padStart(2, '0')
    expect(rendered.slice(-6)).toBe((minutes >= 0 ? '+' : '-') + pad(Math.trunc(minutes / 60)) + ':' + pad(minutes % 60))
    // 非法时间不渲染成 `Invalid Date`（那不是人话，也解析不回去）
    expect(formatTimestamp(Number.NaN)).toBe('NaN')
    /*
     * 扩展年份（复核 F4）：年份超出 `0000–9999` 时，四位补零写不出 ISO 8601 的扩展年份（那要带符号），
     * `Date.parse` 会得到 NaN。而**不可解析的字符串比不好读的字符串更坏**——这种输入回退到
     * `toISOString()`（它写得对）。触发条件只可能是把 µs / ns 当成 ms 用，但错了要错得可解析。
     */
    for (const weird of [Date.UTC(10_000, 0, 1), Date.UTC(-1, 0, 1)]) {
      const text = formatTimestamp(weird)
      expect(Number.isFinite(Date.parse(text)), text + ' 应可被 Date.parse 解回').toBe(true)
    }
    // 行首用的就是它，不再是 toISOString()
    expect(formatLine(line(1_700_000_000_000, 'x'))).toContain(rendered)
  })

  it('多行正文（堆栈）保留层次：续行加前缀、超量截断并报出还有多少行（真机反馈第 6 条）', () => {
    /*
     * 症状：`log.flags=multiline` 的堆栈被采集侧折成一个文档，`message` 里本来就带换行；原样吐出去时
     * 是一条「行内嵌换行」的扁平文本，读者分不清哪行是新日志、哪行是堆栈续行。
     * 改法见 `renderMessage`：续行加前缀（正文一个字不改），超量截断并**报出**还有多少行。
     */
    const stack = 'java.lang.RuntimeException: boom\n\tat a.b.C(C.java:1)\n\tat a.b.D(D.java:2)'
    const rendered = renderMessage(stack)
    // 首行原样、续行有前缀（层次可见），而**正文内容一个字都没改**
    expect(rendered.split('\n')[0]).toBe('java.lang.RuntimeException: boom')
    expect(rendered).toContain('    | \tat a.b.C(C.java:1)')
    expect(rendered).toContain('    | \tat a.b.D(D.java:2)')
    // 单行正文不加任何前缀（绝大多数日志走这条路，不该多出字符）
    expect(renderMessage('one line')).toBe('one line')
    // Windows 的 `\r\n` 归一：续行前缀后面不能跟一个看不见的 `\r`
    expect(renderMessage('a\r\nb')).toBe('a\n    | b')
    /*
     * 超量截断：一整段异常链能上百行，全铺开会把后面的日志行挤出视野；而「悄悄少显示几行」比截断更坏
     * ——所以必须**报出**总行数与未显示行数（与 raw 的 2 万字符预览同一口径）。
     */
    const huge = Array.from({ length: 25 }, (_unused, index) => 'frame-' + String(index)).join('\n')
    const truncated = renderMessage(huge)
    expect(truncated).toContain('frame-0')
    expect(truncated).toContain('frame-19')
    expect(truncated).not.toContain('frame-20')
    expect(truncated).toContain('还有 5 行未显示，共 25 行')
    // 行内嵌换行的行经 formatLine 出来后，续行前缀仍在（外层分隔只影响首行）
    expect(formatLine(line(1_700_000_000_000, 'a\nb'))).toMatch(/a\n {4}\| b/)
  })

  it('formatLine 带出标签；renderLines 标出锚点、空结果不装样子', () => {
    expect(formatLine(line(1_700_000_000_000, 'hello'))).toContain('hello')
    // `app` 不是身份键 → 折进计数，不再逐条铺开（渲染口径②：正文不该被 metadata 淹没）
    expect(formatLine(line(1_700_000_000_000, 'hello'))).toContain('+1 labels')
    expect(formatLine(line(1_700_000_000_000, 'hello'))).not.toContain('app=demo')
    expect(renderLines([line(1, 'a')])).toContain('a')
    expect(renderLines([], 'x')).toBe('（没有命中）')
  })

  it('labels 只平铺身份键，其余折叠成 `+N labels`（真机反馈第 4 条）', () => {
    /*
     * 一条 filebeat 文档能摊出 20 条标签（container.labels.* / agent.* / log.file.*），全平铺时正文
     * 被 metadata 淹没。改法是**只平铺身份键、其余折叠成计数**，而「哪些算身份键」复用
     * src/line.ts 的 LABEL_PRIORITY——不另造名单。
     */
    const three: LogLine = {
      ...line(1_700_000_000_000, 'hello', 'doc-1'),
      labels: {
        'container.name': 'prometheus',
        'host.name': 'node-1',
        stream: 'stderr',
        app: 'demo',                                  // 非身份键 → 折叠
        'container.labels.io.kubernetes.pod.name': 'p-1', // 非身份键（点分路径不在名单里）→ 折叠
      },
    }
    const rendered = formatLine(three)
    expect(rendered).toContain('container.name=prometheus')
    expect(rendered).toContain('host.name=node-1')
    expect(rendered).toContain('stream=stderr')
    expect(rendered).toContain('+2 labels')
    expect(rendered).not.toContain('app=demo')
    // 展开顺序与 LABEL_PRIORITY 一致（谁在写这行 → 哪台机器 → 什么流），不是对象插入顺序
    expect(rendered.indexOf('container.name')).toBeLessThan(rendered.indexOf('host.name'))
    expect(rendered.indexOf('host.name')).toBeLessThan(rendered.indexOf('stream'))
    // 折叠标记与 id 都在正文之后：正文一个字都没动
    expect(rendered).toContain('hello  #doc-1  container.name=prometheus')
    /*
     * 超过 3 条身份键时**按名单顺序截断**：`log.file.path` 在名单里排在 `stream` 之前，所以它进
     * 平铺、`stream` 被折叠——即使 `stream` 是先插进 labels 的那个键（排序依据是名单，不是插入顺序）。
     */
    const four: LogLine = {
      ...line(1_700_000_000_000, 'hello', 'doc-2'),
      labels: { stream: 'stderr', 'log.file.path': '/var/log/app.log', 'container.name': 'c', 'host.name': 'h' },
    }
    const narrowed = formatLine(four)
    expect(narrowed).toContain('log.file.path=/var/log/app.log')
    expect(narrowed).not.toContain('stream=stderr')
    expect(narrowed).toContain('+1 labels')
    /*
     * `agent.name` 在名单里**排在最后**（整个集群都一样，是背景不是身份）：只有当身份键不足 3 条时
     * 它才会露出来——这条钉的是「折叠不是按字母序/随机挑，而是按排查时的提问顺序」。
     */
    const collectorOnly: LogLine = {
      ...line(1_700_000_000_000, 'x', 'doc-3'),
      labels: { 'agent.name': 'filebeat', app: 'demo' },
    }
    expect(formatLine(collectorOnly)).toContain('agent.name=filebeat')
    // 一条身份键都没有时，整份 labels 折叠成一个计数（不是什么都不显示，那会让人以为没有标签）
    expect(formatLine({ ...line(1_700_000_000_000, 'x', 'doc-4'), labels: { app: 'a', pod: 'b' } })).toContain('+2 labels')
    // 没有 labels 时不留空壳
    expect(formatLine({ ...line(1_700_000_000_000, 'x', 'doc-5'), labels: {} })).not.toContain('labels')
  })

  it('formatLine 把 id 渲染成 `#id`（loglens D06：渲染文本里要能拿到精确锚点）', () => {
    const rendered = formatLine(line(1_700_000_000_000, 'hello', 'doc-42'))
    expect(rendered).toContain('#doc-42')
    // id 排在正文**之后**：正文一个字都不动（前缀形态会把每条日志的正文推后）
    expect(rendered.indexOf('hello')).toBeLessThan(rendered.indexOf('#doc-42'))
    // 没有 id 时不留下一个空壳（别每行多两个没用的字符）
    expect(formatLine({ ...line(1_700_000_000_000, 'hello'), id: '' })).not.toContain('#')
    // 锚点行同样带 id（它正是要去 loglens_context 精确定位的那一行）
    expect(renderLines([line(1_700_000_000_000, 'hello', 'doc-42')], 'doc-42')).toBe('→ ' + rendered)
  })

  it('id 缺失（运行时 undefined）不渲染出 `#undefined`（收口 F9）', () => {
    /*
     * 契约上 id 必填，但运行时可能给不出（适配器遇到空的文档 _id）。渲染出 `#undefined` 比不渲染更坏：
     * 调用方会把它当成可抄的坐标抄进 loglens_context，然后静默退档。
     */
    const noId = { ...line(1_700_000_000_000, 'hello'), id: undefined as unknown as string }
    expect(formatLine(noId)).not.toContain('#undefined')
    /*
     * 时间戳现在是**本地时间 + 显式偏移**（真机反馈第 5 条）：不再是 `toISOString()` 的 UTC。
     * 断言直接复用被测的 formatTimestamp 会把这条用例变成同义反复，所以只钉**形态**：
     * 以 `+HH:MM` / `-HH:MM` 结尾、且能被 `Date.parse` 解回同一个瞬间（机器仍可用）。
     */
    expect(formatLine(noId)).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{2}:\d{2} {2}hello {2}\+1 labels$/)
    expect(Date.parse(formatLine(noId).slice(0, 29))).toBe(1_700_000_000_000)
  })

  it('adapterHint 对 docker 指路到现成工具', () => {
    expect(adapterHint('docker')).toContain('docker_logs_grep')
    expect(adapterHint('opensearch')).toContain('loki / elasticsearch / opensearch')
  })

  it('hintFor：docker 给替代路径、无游标的来源提醒截断、ES/OS 提醒 PIT 寿命', () => {
    const lokiCaps = { ...CAPS, pagination: 'none' as const }
    expect(String(hintFor('docker', undefined))).toContain('选项 0')
    // dockerLoaded 决定那句「面板那条路有没有」：装了指向它的路由，没装说清缺什么
    expect(String(hintFor('docker', undefined, { dockerLoaded: true }))).toContain('/api/dsh-docker/logs')
    expect(String(hintFor('docker', undefined, { dockerLoaded: false }))).toContain('没检测到')
    expect(String(hintFor('loki', lokiCaps))).toContain('hit_limit')
    expect(String(hintFor('elasticsearch', { ...CAPS, pagination: 'cursor' as const, flavor: 'es' }))).toContain('PIT')
    expect(String(hintFor('opensearch', { ...CAPS, pagination: 'cursor' as const, flavor: 'os' }))).toContain('PIT')
    expect(hintFor('loki', { ...CAPS, pagination: 'cursor' as const })).toBeUndefined()
    expect(hintFor('elasticsearch', undefined)).toBeUndefined()
  })
})
