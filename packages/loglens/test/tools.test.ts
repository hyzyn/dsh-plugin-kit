/**
 * @hyzyn/dsh-loglens — agent 工具的用例（P3）。
 *
 * 用**假后端**注入（真后端的行为在 test/loki.test.ts 里按 wire 级验过），这里锁的是工具层的三件事：
 * 目标怎么解析、参数怎么过归一化与夹取、以及**诚实的信号**（截断 / 提示 / 报错文案里的指路）。
 * 工具定义是 SDK 的 `defineTool` 产物，用例只认它的 `execute`。
 */
import { describe, expect, it, vi } from 'vitest'
import type { BackendCaps, LogBackend, LogLine, LogQueryResult, NormalizedQuery } from '../src/backends/types.js'
import type { LoglensConfig, LoglensTarget, SourceKind } from '../src/config.js'
import { adapterHint, clampCount, formatLine, hintFor, registerLoglensTools, renderLines, resolveTarget } from '../src/tools.js'

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
    fields: async () => [{ name: 'app', kind: 'discovered' }],
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
  it('直接搬运后端报的字段', async () => {
    const { add, captured } = capture()
    registerLoglensTools({ config: () => configWith(target('loki', 'loki')), backendFor: () => fakeBackend(), add })
    const value = await captured.get('loglens_fields')!.execute({}) as { fields: unknown[] }
    expect(value.fields).toEqual([{ name: 'app', kind: 'discovered' }])
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

  it('锚点没在重查结果里：报错说清可能是保留期或窗口太窄', async () => {
    await expect(harness(contextBackend()).execute({ ts: at(999_000) })).rejects.toThrow('保留期')
    await expect(harness(contextBackend()).execute({ ts: at(999_000) })).rejects.toThrow('spanMs')
  })

  it('缺 ts 直接报错（它是唯一的定位锚）', async () => {
    await expect(harness(contextBackend()).execute({ id: 'anchor-id' })).rejects.toThrow('ts 必填')
  })

  it('before / after 夹取到 0~50，且重查的窗口半径按 spanMs', async () => {
    const queries: NormalizedQuery[] = []
    const backend = fakeBackend({ query: async (query) => { queries.push(query); return resultOf(LINES) } })
    await harness(backend).execute({ ts: at(3000), id: 'anchor-id', before: 999, after: -3, spanMs: 5000 })
    // limit = before + after + 1（锚点自己也算一行）：before 夹到 50、after 0，所以是 51
    expect(queries[0].limit).toBe(51)
    expect(queries[0].from).toBe(at(3000) - 5000)
    expect(queries[0].to).toBe(at(3000) + 5000)
    expect(clampCount(3, 5)).toBe(3)
    expect(clampCount(-1, 5)).toBe(0)
    expect(clampCount(99, 5)).toBe(50)
    expect(clampCount('x', 5)).toBe(5)
  })
})

describe('渲染', () => {
  it('formatLine 带出标签；renderLines 标出锚点、空结果不装样子', () => {
    expect(formatLine(line(1_700_000_000_000, 'hello'))).toContain('hello')
    expect(formatLine(line(1_700_000_000_000, 'hello'))).toContain('app=demo')
    expect(renderLines([line(1, 'a')])).toContain('a')
    expect(renderLines([], 'x')).toBe('（没有命中）')
  })

  it('adapterHint 对 docker 指路到现成工具', () => {
    expect(adapterHint('docker')).toContain('docker_logs_grep')
    expect(adapterHint('opensearch')).toContain('loki / elasticsearch / opensearch')
  })

  it('hintFor：docker 给替代路径、无游标的来源提醒截断、ES/OS 提醒 PIT 寿命', () => {
    const lokiCaps = { ...CAPS, pagination: 'none' as const }
    expect(String(hintFor('docker', undefined))).toContain('选项 0')
    expect(String(hintFor('loki', lokiCaps))).toContain('hit_limit')
    expect(String(hintFor('elasticsearch', { ...CAPS, pagination: 'cursor' as const, flavor: 'es' }))).toContain('PIT')
    expect(String(hintFor('opensearch', { ...CAPS, pagination: 'cursor' as const, flavor: 'os' }))).toContain('PIT')
    expect(hintFor('loki', { ...CAPS, pagination: 'cursor' as const })).toBeUndefined()
    expect(hintFor('elasticsearch', undefined)).toBeUndefined()
  })
})
