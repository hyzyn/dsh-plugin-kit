/**
 * @hyzyn/dsh-rss — AI 摘要的回归测试。
 *
 * 覆盖：摘要消息构造 / 输出清洗、缓存 key·TTL·LRU、模型路由解析优先级、
 * store 白名单校验（ai 成对与夹紧）、Markdown 渲染的摘要优先与失败说明、
 * 宿主 llm 调用的终止原因分支，以及 generateDigest 的端到端降级路径。
 *
 * IO 全部隔离到临时目录：读 store 走 DSH_RSS_CONFIG_FILE，digest / ai-cache
 * 走 config.digestDir，测试后清理，不碰真实 ~/.dsh。网络用 stub 的 fetch。
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import {
  aiCacheKey,
  aiCachePath,
  buildAiSummaryMessages,
  callAiSummary,
  cleanAiSummary,
  generateDigest,
  isAiCacheEntryFresh,
  pruneAiCacheEntries,
  readAiCache,
  readRssStore,
  renderDigestMarkdown,
  resolveAiRoute,
  validateRssStoreInput,
  writeAiCache,
  writeRssStore,
  type AiCacheEntry,
  type AiStoreConfig,
  type FeedItem,
  type LlmRuntimeLike,
  type LlmStreamChunk,
} from '../src/index.js'

/* ------------------------------------------------------------------ *
 * 公共夹具
 * ------------------------------------------------------------------ */

function item(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    id: 'id-1',
    title: '标题',
    link: 'https://example.com/1',
    summary: '原文摘要',
    source: '测试源',
    ...overrides,
  }
}

/** 宿主 llm 服务 mock：按顺序吐出给定 chunk，可回看调用参数。 */
function mockLlm(chunks: LlmStreamChunk[], onCall?: (options: Record<string, unknown>) => void): LlmRuntimeLike {
  return {
    stream(options) {
      onCall?.(options as unknown as Record<string, unknown>)
      return (async function* () {
        for (const chunk of chunks) yield chunk
      })()
    },
  }
}

/** cordis Context mock：只实现 getService 用到的 ctx.get。 */
function mockCtx(services: Record<string, unknown>): Context {
  return { get: (name: string) => services[name] } as unknown as Context
}

function cacheEntry(text: string, at: number, model = 'm'): AiCacheEntry {
  return { text, model, at }
}

let root: string
let originalConfigFile: string | undefined

beforeAll(() => {
  originalConfigFile = process.env.DSH_RSS_CONFIG_FILE
})

afterAll(() => {
  if (originalConfigFile === undefined) delete process.env.DSH_RSS_CONFIG_FILE
  else process.env.DSH_RSS_CONFIG_FILE = originalConfigFile
})

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'dsh-rss-ai-'))
  process.env.DSH_RSS_CONFIG_FILE = join(root, 'rss.json')
})

afterEach(() => {
  vi.unstubAllGlobals()
  rmSync(root, { recursive: true, force: true })
})

/* ------------------------------------------------------------------ *
 * 摘要消息构造与输出清洗
 * ------------------------------------------------------------------ */

describe('buildAiSummaryMessages', () => {
  it('user 为 JSON 框架，字段齐全；system 是中文一句话指令', () => {
    const messages = buildAiSummaryMessages(item({ title: 'T', category: '科技', summary: '正文' }))
    expect(JSON.parse(messages.user)).toEqual({ title: 'T', source: '测试源', category: '科技', text: '正文' })
    expect(messages.system).toContain('60 字')
    expect(messages.system).toContain('不要 Markdown')
  })

  it('正文截断到 1200 字；缺 category 时用空串', () => {
    const messages = buildAiSummaryMessages(item({ summary: 'x'.repeat(2000), category: undefined }))
    const parsed = JSON.parse(messages.user) as { text: string; category: string }
    expect(parsed.text).toHaveLength(1200)
    expect(parsed.category).toBe('')
  })

  it('缺 summary 时 text 为空串，不抛错', () => {
    const messages = buildAiSummaryMessages(item({ summary: undefined }))
    expect((JSON.parse(messages.user) as { text: string }).text).toBe('')
  })
})

describe('cleanAiSummary', () => {
  it('去掉整体包裹的引号 / 书名号', () => {
    expect(cleanAiSummary('"摘要内容"')).toBe('摘要内容')
    expect(cleanAiSummary('“摘要内容”')).toBe('摘要内容')
    expect(cleanAiSummary('「摘要内容」')).toBe('摘要内容')
  })

  it('去掉 markdown 加粗 / 标题 / 列表前缀', () => {
    expect(cleanAiSummary('**加粗摘要**')).toBe('加粗摘要')
    expect(cleanAiSummary('## 标题式摘要')).toBe('标题式摘要')
    expect(cleanAiSummary('- 列表摘要')).toBe('列表摘要')
    expect(cleanAiSummary('1. 有序摘要')).toBe('有序摘要')
  })

  it('换行压成空格，多行前缀逐行去掉', () => {
    expect(cleanAiSummary('- 第一行\n- 第二行')).toBe('第一行 第二行')
    expect(cleanAiSummary('第一行\n\n  第二行')).toBe('第一行 第二行')
  })

  it('纯空白 / 空串返回空串（视为失败）', () => {
    expect(cleanAiSummary('')).toBe('')
    expect(cleanAiSummary('   \n  ')).toBe('')
    expect(cleanAiSummary('""')).toBe('')
  })

  it('保留正文中间的数字与实体，不做额外改写', () => {
    expect(cleanAiSummary('OpenAI 发布 GPT-5，性能提升 30%。')).toBe('OpenAI 发布 GPT-5，性能提升 30%。')
  })
})

/* ------------------------------------------------------------------ *
 * 缓存 key / TTL / LRU / 读写
 * ------------------------------------------------------------------ */

describe('aiCacheKey', () => {
  it('同一条目 key 稳定，是 40 位 sha1 十六进制', () => {
    const key = aiCacheKey(item())
    expect(key).toMatch(/^[0-9a-f]{40}$/)
    expect(aiCacheKey(item())).toBe(key)
  })

  it('link 优先于 id / title，trim + 小写归一', () => {
    const key = aiCacheKey(item({ link: 'https://Example.com/A', id: 'x', title: 'y' }))
    expect(aiCacheKey(item({ link: '  https://example.com/a  ', id: '', title: '' }))).toBe(key)
    expect(aiCacheKey(item({ link: '', id: 'x', title: 'y' }))).not.toBe(key)
  })

  it('link / id 都缺时退回 title', () => {
    expect(aiCacheKey(item({ link: '', id: '', title: ' 仅标题 ' }))).toBe(aiCacheKey(item({ link: '', id: '', title: '仅标题' })))
  })
})

describe('isAiCacheEntryFresh / pruneAiCacheEntries', () => {
  const now = 1_800_000_000_000
  const day = 24 * 60 * 60 * 1000

  it('30 天内新鲜，超过 30 天过期；空文本 / 非法时间戳一律过期', () => {
    expect(isAiCacheEntryFresh(cacheEntry('摘要', now - day), now)).toBe(true)
    expect(isAiCacheEntryFresh(cacheEntry('摘要', now - 31 * day), now)).toBe(false)
    expect(isAiCacheEntryFresh(cacheEntry('   ', now), now)).toBe(false)
    expect(isAiCacheEntryFresh({ text: '摘要', model: 'm', at: Number.NaN }, now)).toBe(false)
    expect(isAiCacheEntryFresh(undefined, now)).toBe(false)
  })

  it('淘汰过期条目', () => {
    const pruned = pruneAiCacheEntries({ old: cacheEntry('旧', now - 40 * day), fresh: cacheEntry('新', now - day) }, now)
    expect(Object.keys(pruned)).toEqual(['fresh'])
  })

  it('超过上限时保留 at 最新的条目（LRU 淘汰最旧）', () => {
    const entries: Record<string, AiCacheEntry> = {
      a: cacheEntry('a', now - 3 * day),
      b: cacheEntry('b', now - 2 * day),
      c: cacheEntry('c', now - day),
    }
    expect(Object.keys(pruneAiCacheEntries(entries, now, 2)).sort()).toEqual(['b', 'c'])
  })
})

describe('readAiCache / writeAiCache', () => {
  it('写读往返：version 1 + entries 结构，默认上限 500', () => {
    writeAiCache(root, { k1: cacheEntry('摘要一', Date.now()) })
    const raw = JSON.parse(readFileSync(aiCachePath(root), 'utf8')) as { version: number; entries: Record<string, AiCacheEntry> }
    expect(raw.version).toBe(1)
    expect(raw.entries.k1.text).toBe('摘要一')
    expect(readAiCache(root).k1.text).toBe('摘要一')
  })

  it('读缺失 / 损坏 / 版本不符的文件返回空表', () => {
    expect(readAiCache(join(root, 'nope'))).toEqual({})
    writeAiCache(root, {})
    writeFileSync(aiCachePath(root), '{ not json')
    expect(readAiCache(root)).toEqual({})
    writeFileSync(aiCachePath(root), JSON.stringify({ version: 2, entries: { k: cacheEntry('x', Date.now()) } }))
    expect(readAiCache(root)).toEqual({})
  })

  it('读取时过滤过期条目，写回时不让过期条目复活', () => {
    const now = Date.now()
    writeFileSync(aiCachePath(root), JSON.stringify({
      version: 1,
      entries: { old: cacheEntry('旧', now - 40 * 24 * 60 * 60 * 1000), fresh: cacheEntry('新', now) },
    }))
    expect(Object.keys(readAiCache(root))).toEqual(['fresh'])
    writeAiCache(root, readAiCache(root))
    expect(Object.keys(readAiCache(root))).toEqual(['fresh'])
  })
})

/* ------------------------------------------------------------------ *
 * 模型路由解析优先级
 * ------------------------------------------------------------------ */

describe('resolveAiRoute', () => {
  const explicit = { enabled: true, provider: 'p', model: 'm' }

  it('显式配置对优先于宿主默认模型 / settings', () => {
    const ctx = mockCtx({
      agentDefaultModel: { source: () => ({ provider: 'host', model: 'h' }) },
      settings: { get: () => ({ provider: 's', model: 's' }) },
    })
    expect(resolveAiRoute(ctx, explicit)).toEqual({ provider: 'p', model: 'm' })
  })

  it('没有显式配置时读 agentDefaultModel.source()，值做 trim', () => {
    const ctx = mockCtx({ agentDefaultModel: { source: () => ({ provider: ' host ', model: ' h ' }) } })
    expect(resolveAiRoute(ctx, { enabled: true })).toEqual({ provider: 'host', model: 'h' })
  })

  it('source 不存在时兼容 currentSelection()', () => {
    const ctx = mockCtx({ agentDefaultModel: { currentSelection: () => ({ provider: 'c', model: 'c1' }) } })
    expect(resolveAiRoute(ctx, undefined)).toEqual({ provider: 'c', model: 'c1' })
  })

  it('agentDefaultModel 缺失时回退 settings 的 agent-default-model 命名空间', () => {
    const ctx = mockCtx({ settings: { get: (ns: string) => (ns === 'agent-default-model' ? { provider: 's', model: 's1' } : undefined) } })
    expect(resolveAiRoute(ctx, undefined)).toEqual({ provider: 's', model: 's1' })
  })

  it('只有半个显式配置（provider 或 model）不算成对，继续走宿主默认模型', () => {
    const ctx = mockCtx({ agentDefaultModel: { source: () => ({ provider: 'host', model: 'h' }) } })
    expect(resolveAiRoute(ctx, { enabled: true, provider: 'p' })).toEqual({ provider: 'host', model: 'h' })
    expect(resolveAiRoute(ctx, { enabled: true, model: 'm' })).toEqual({ provider: 'host', model: 'h' })
  })

  it('服务缺失 / 抛错 / ctx 为空都返回 null', () => {
    expect(resolveAiRoute(mockCtx({}), undefined)).toBeNull()
    expect(resolveAiRoute(undefined, { enabled: true })).toBeNull()
    const throwing = mockCtx({
      agentDefaultModel: { source: () => { throw new Error('boom') } },
      settings: { get: () => { throw new TypeError('unknown namespace') } },
    })
    expect(resolveAiRoute(throwing, undefined)).toBeNull()
  })
})

/* ------------------------------------------------------------------ *
 * store 白名单校验
 * ------------------------------------------------------------------ */

describe('validateRssStoreInput 的 ai 白名单', () => {
  it('成对配置通过，数值越界时夹紧到范围内', () => {
    const result = validateRssStoreInput({
      sources: [],
      ai: { enabled: true, provider: ' p ', model: ' m ', maxItems: 99, concurrency: 0, timeoutMs: 1000 },
    })
    expect(result.error).toBeUndefined()
    expect(result.warnings).toBeUndefined()
    expect(result.store?.ai).toEqual({ enabled: true, provider: 'p', model: 'm', maxItems: 50, concurrency: 1, timeoutMs: 5000 })
  })

  it('provider / model 只填一个：整体忽略 ai 并给出告警', () => {
    const result = validateRssStoreInput({ sources: [], ai: { enabled: true, provider: 'p' } })
    expect(result.store?.ai).toBeUndefined()
    expect(result.warnings?.[0]).toContain('成对')
  })

  it('都留空时合法（跟随宿主默认模型），默认值补齐', () => {
    const result = validateRssStoreInput({ sources: [], ai: { enabled: false, maxItems: 5 } })
    expect(result.store?.ai).toEqual({ enabled: false, maxItems: 5, concurrency: 3, timeoutMs: 20000 })
  })

  it('ai 非对象 / enabled 非布尔：告警且不崩', () => {
    const notObject = validateRssStoreInput({ sources: [], ai: 'on' })
    expect(notObject.store?.ai).toBeUndefined()
    expect(notObject.warnings?.[0]).toContain('必须是对象')
    const badEnabled = validateRssStoreInput({ sources: [], ai: { enabled: 'yes' } })
    expect(badEnabled.store?.ai?.enabled).toBe(false)
    expect(badEnabled.warnings?.[0]).toContain('布尔')
  })

  it('未知字段被丢弃（白名单），不落盘', () => {
    const result = validateRssStoreInput({ sources: [], ai: { enabled: true, apiKey: 'secret', purpose: 'x' } })
    expect(result.store?.ai).not.toHaveProperty('apiKey')
    expect(result.store?.ai).not.toHaveProperty('purpose')
  })
})

describe('readRssStore 的 ai 读取', () => {
  it('从 rss.json 读出并归一化 ai', () => {
    writeRssStore({ sources: [], categories: [], catalogs: [], ai: { enabled: true, provider: 'p', model: 'm' } })
    expect(readRssStore().ai).toEqual({ enabled: true, provider: 'p', model: 'm', maxItems: 20, concurrency: 3, timeoutMs: 20000 })
  })

  it('文件里不成对的 ai 静默丢弃，按未启用处理', () => {
    writeFileSync(join(root, 'rss.json'), JSON.stringify({ sources: [], categories: [], catalogs: [], ai: { enabled: true, provider: 'p' } }))
    expect(readRssStore().ai).toBeUndefined()
  })

  it('文件缺失时 ai 不存在（默认关闭）', () => {
    expect(readRssStore().ai).toBeUndefined()
  })
})

/* ------------------------------------------------------------------ *
 * Markdown 渲染
 * ------------------------------------------------------------------ */

describe('renderDigestMarkdown 的 AI 摘要', () => {
  it('有 aiSummary 时优先展示，不再输出原文摘要', () => {
    const markdown = renderDigestMarkdown(
      [item({ aiSummary: 'AI 摘要正文', summary: '不应出现的原文摘要' })],
      '2026-09-13',
      [],
      1,
    )
    expect(markdown).toContain('AI 摘要正文')
    expect(markdown).not.toContain('不应出现的原文摘要')
  })

  it('没有 aiSummary 时维持原文摘要的 140 字截断', () => {
    const long = '字'.repeat(200)
    const markdown = renderDigestMarkdown([item({ summary: long })], '2026-09-13', [], 1)
    expect(markdown).toContain('字'.repeat(140) + '…')
    expect(markdown).not.toContain('字'.repeat(141))
  })

  it('部分失败时在「抓取失败」小节补一行说明', () => {
    const markdown = renderDigestMarkdown([item()], '2026-09-13', [], 1, {
      enabled: true,
      route: 'p/m',
      summarized: 1,
      failed: 2,
    })
    expect(markdown).toContain('## 抓取失败')
    expect(markdown).toContain('- AI 摘要: 2 条失败，已回落到原文摘要')
  })

  it('整体不可用时输出原因行（即使没有抓取错误也开小节）', () => {
    const markdown = renderDigestMarkdown([item()], '2026-09-13', [], 1, {
      enabled: true,
      summarized: 0,
      failed: 0,
      reason: '宿主 llm 服务不可用',
    })
    expect(markdown).toContain('## 抓取失败')
    expect(markdown).toContain('- AI 摘要: 宿主 llm 服务不可用')
  })

  it('无错误且无 AI 提示时不出现「抓取失败」小节', () => {
    expect(renderDigestMarkdown([item()], '2026-09-13', [], 1, { enabled: true, summarized: 1, failed: 0 })).not.toContain('## 抓取失败')
    expect(renderDigestMarkdown([item()], '2026-09-13', [], 1)).not.toContain('## 抓取失败')
  })
})

/* ------------------------------------------------------------------ *
 * 宿主 llm 调用
 * ------------------------------------------------------------------ */

describe('callAiSummary', () => {
  const route = { provider: 'p', model: 'm' }

  it('finish=stop 时返回清洗后的正文，并传对路由 / 消息 / 信号', async () => {
    let captured: Record<string, unknown> = {}
    const llm = mockLlm([
      { type: 'text-delta', text: ' "AI 摘要正文" ' },
      { type: 'finish', reason: { kind: 'stop' } },
    ], (options) => { captured = options })
    await expect(callAiSummary(llm, route, item(), 1000)).resolves.toBe('AI 摘要正文')
    expect(captured.provider).toBe('p')
    expect(captured.model).toBe('m')
    expect(String(captured.system)).toContain('60 字')
    expect(captured.messages).toEqual([{ role: 'user', content: [{ type: 'text', text: expect.any(String) }] }])
    expect(captured.maxTokens).toBeGreaterThan(0)
    expect(captured.signal).toBeInstanceOf(AbortSignal)
    // purpose 是宿主保留字段（compaction / session-title），本插件不得占用
    expect('purpose' in captured).toBe(false)
  })

  it('error / max-tokens / aborted 终止都算失败', async () => {
    const errorLlm = mockLlm([
      { type: 'text-delta', text: '部分正文' },
      { type: 'finish', reason: { kind: 'error', failure: { message: 'provider boom', code: 'E1' } } },
    ])
    await expect(callAiSummary(errorLlm, route, item(), 1000)).rejects.toThrow(/error: provider boom/)

    const maxTokensLlm = mockLlm([{ type: 'text-delta', text: '部分正文' }, { type: 'finish', reason: { kind: 'max-tokens' } }])
    await expect(callAiSummary(maxTokensLlm, route, item(), 1000)).rejects.toThrow(/max-tokens/)

    const abortedLlm = mockLlm([{ type: 'finish', reason: { kind: 'aborted' } }])
    await expect(callAiSummary(abortedLlm, route, item(), 1000)).rejects.toThrow(/aborted/)
  })

  it('messages[].content 必须是 ContentBlock[] —— 字符串会在下游 .some(...) 上炸', async () => {
    let captured: Record<string, unknown> = {}
    const llm = mockLlm(
      [{ type: 'text-delta', text: '摘要' }, { type: 'finish', reason: { kind: 'stop' } }],
      (options) => { captured = options },
    )
    await expect(callAiSummary(llm, route, item(), 1000)).resolves.toBe('摘要')
    const first = (captured.messages as Array<{ content: unknown }>)[0]
    // 事故形状是 content: '<字符串>'，下游 contentHasImage(content) 会抛
    // `content.some is not a function`，表现为「AI 摘要每条都失败」
    expect(Array.isArray(first.content)).toBe(true)
    expect(first.content).toEqual([{ type: 'text', text: expect.any(String) }])
  })

  it('finish 块的判别式在 reason 里 —— 顶层 kind 不算数（AI 摘要整体失效那个 bug 的回归钉）', async () => {
    // 权威形状（dsh-llm 的 types.d.ts：`type: 'finish'; reason: FinishReason`，
    // 而 FinishReason 是以 kind 为判别式的联合）：
    await expect(
      callAiSummary(mockLlm([{ type: 'text-delta', text: '正文' }, { type: 'finish', reason: { kind: 'stop' } }]), route, item(), 1000),
    ).resolves.toBe('正文')
    // 事故形状：kind 写在块顶层 —— 必须**失败**。这条断言逼着实现去读 reason.kind；
    // 谁要是把契约改回顶层，上面那条就会红，而不是让功能静默失效。
    await expect(
      callAiSummary(mockLlm([{ type: 'text-delta', text: '正文' }, { type: 'finish', kind: 'stop' } as never]), route, item(), 1000),
    ).rejects.toThrow(/终止原因 unknown/)
  })

  it('空输出 / 缺终止块 / 迭代器抛错都算失败', async () => {
    await expect(callAiSummary(mockLlm([{ type: 'text-delta', text: '   ' }, { type: 'finish', reason: { kind: 'stop' } }]), route, item(), 1000))
      .rejects.toThrow(/空摘要/)
    await expect(callAiSummary(mockLlm([{ type: 'text-delta', text: '正文' }]), route, item(), 1000))
      .rejects.toThrow(/终止标记/)
    const throwing: LlmRuntimeLike = { stream: () => (async function* () { throw new Error('network down') })() }
    await expect(callAiSummary(throwing, route, item(), 1000)).rejects.toThrow(/network down/)
  })

  it('超时：到点 abort 并按失败抛出', async () => {
    const hanging: LlmRuntimeLike = {
      stream: ({ signal }) => (async function* () {
        await new Promise((_, reject) => {
          signal?.addEventListener('abort', () => reject(new Error('aborted by signal')))
        })
      })(),
    }
    await expect(callAiSummary(hanging, route, item(), 20)).rejects.toThrow(/请求超时（20ms）/)
  })
})

/* ------------------------------------------------------------------ *
 * generateDigest 端到端：摘要落盘 / 缓存复用 / 降级路径
 * ------------------------------------------------------------------ */

const FEED_XML = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<rss version="2.0"><channel><title>测试频道</title>',
  '<item><title>旧闻</title><link>https://s.example/old</link><guid>old</guid>',
  '<description>旧摘要</description><pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate></item>',
  '<item><title>新闻</title><link>https://s.example/new</link><guid>new</guid>',
  '<description>新摘要</description><pubDate>Tue, 02 Jan 2024 00:00:00 GMT</pubDate></item>',
  '</channel></rss>',
].join('')

const FEED_XML_ONE = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<rss version="2.0"><channel><title>测试频道</title>',
  '<item><title>单条</title><link>https://s.example/one</link><guid>one</guid>',
  `<description>${'长'.repeat(200)}</description><pubDate>Tue, 02 Jan 2024 00:00:00 GMT</pubDate></item>`,
  '</channel></rss>',
].join('')

function stubFetch(xml: string): void {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, statusText: 'OK', text: async () => xml })))
}

function storeWithAi(ai?: AiStoreConfig): void {
  writeRssStore({
    sources: [{ name: '测试源', url: 'https://s.example/feed' }],
    categories: [],
    catalogs: [],
    ...(ai !== undefined ? { ai } : {}),
  })
}

describe('generateDigest 的 AI 摘要', () => {
  it('启用 ai：摘要写入 items / latest.json / ai-cache.json，并优先渲染', async () => {
    const digestDir = join(root, 'digest')
    storeWithAi({ enabled: true, provider: 'p', model: 'm', maxItems: 1 })
    stubFetch(FEED_XML)
    let calls = 0
    const ctx = mockCtx({
      llm: mockLlm([{ type: 'text-delta', text: 'AI 一句话摘要' }, { type: 'finish', reason: { kind: 'stop' } }], () => { calls += 1 }),
      // 显式配置对应胜过宿主默认模型
      agentDefaultModel: { source: () => ({ provider: 'host', model: 'h' }) },
    })

    const first = await generateDigest({ digestDir }, { ctx })
    expect(calls).toBe(1)
    expect(first.aiSummary).toEqual({ enabled: true, route: 'p/m', summarized: 1, failed: 0 })
    expect(first.items[0].title).toBe('新闻')
    expect(first.items[0].aiSummary).toBe('AI 一句话摘要')
    // maxItems=1：超出的条目保持原文摘要
    expect(first.items[1].title).toBe('旧闻')
    expect(first.items[1].aiSummary).toBeUndefined()

    const latest = JSON.parse(readFileSync(join(digestDir, 'latest.json'), 'utf8')) as {
      items: FeedItem[]
      aiSummary: { summarized: number }
    }
    expect(latest.items[0].aiSummary).toBe('AI 一句话摘要')
    expect(latest.aiSummary.summarized).toBe(1)

    expect(readAiCache(digestDir)[aiCacheKey(first.items[0])]).toMatchObject({ text: 'AI 一句话摘要', model: 'm' })
    const markdown = readFileSync(join(digestDir, `${first.date}.md`), 'utf8')
    expect(markdown).toContain('AI 一句话摘要')

    // 第二次生成：缓存命中，llm 一次都不该被调用
    calls = 0
    const second = await generateDigest({ digestDir }, {
      ctx: mockCtx({ llm: { stream() { calls += 1; throw new Error('不应被调用') } } }),
    })
    expect(second.aiSummary).toEqual({ enabled: true, route: 'p/m', summarized: 1, failed: 0 })
    expect(second.items[0].aiSummary).toBe('AI 一句话摘要')
    expect(calls).toBe(0)
  })

  it('全部失败：条目回落原文摘要，DigestResult 记录原因，Markdown 加说明行', async () => {
    const digestDir = join(root, 'digest')
    storeWithAi({ enabled: true, provider: 'p', model: 'm' })
    stubFetch(FEED_XML_ONE)
    const ctx = mockCtx({ llm: mockLlm([{ type: 'finish', reason: { kind: 'max-tokens' } }]) })

    const result = await generateDigest({ digestDir }, { ctx })
    expect(result.items[0].aiSummary).toBeUndefined()
    expect(result.aiSummary?.summarized).toBe(0)
    expect(result.aiSummary?.failed).toBe(1)
    expect(result.aiSummary?.reason).toContain('全部 1 条失败')
    expect(result.aiSummary?.reason).toContain('max-tokens')

    const markdown = readFileSync(join(digestDir, `${result.date}.md`), 'utf8')
    expect(markdown).toContain('## 抓取失败')
    expect(markdown).toContain('- AI 摘要: 全部 1 条失败：终止原因 max-tokens')
    // 回落路径 = 原文摘要 140 字截断
    expect(markdown).toContain('长'.repeat(140) + '…')
  })

  it('部分失败：failures 给出原因分布，Markdown 也带上（原先只有计数、原因全丢）', async () => {
    const digestDir = join(root, 'digest')
    // concurrency=1 → 两条的顺序确定：第一条成功、第二条失败
    storeWithAi({ enabled: true, provider: 'p', model: 'm', concurrency: 1 })
    stubFetch(FEED_XML)
    let calls = 0
    const llm: LlmRuntimeLike = {
      stream() {
        const index = calls
        calls += 1
        return (async function* () {
          if (index === 0) {
            yield { type: 'text-delta', text: '第一条的 AI 摘要' } as never
            yield { type: 'finish', reason: { kind: 'stop' } }
          } else {
            yield { type: 'finish', reason: { kind: 'max-tokens' } }
          }
        })()
      },
    }

    const result = await generateDigest({ digestDir }, { ctx: mockCtx({ llm }) })
    expect(result.aiSummary?.summarized).toBe(1)
    expect(result.aiSummary?.failed).toBe(1)
    // 关键：部分失败也要给出**原因分布**，而不是只留一个数字
    expect(result.aiSummary?.failures?.[0]?.error).toContain('max-tokens')
    expect(result.aiSummary?.failures?.[0]?.error).toContain('推理 token')

    const markdown = readFileSync(join(digestDir, `${result.date}.md`), 'utf8')
    expect(markdown).toContain('1 条失败，已回落到原文摘要（原因：终止原因 max-tokens')
    expect(markdown).toContain('×1）')
  })

  it('启用 ai 但解析不到路由：整体跳过并记录原因', async () => {
    const digestDir = join(root, 'digest')
    storeWithAi({ enabled: true })
    stubFetch(FEED_XML_ONE)

    const result = await generateDigest({ digestDir }, { ctx: mockCtx({}) })
    expect(result.items[0].aiSummary).toBeUndefined()
    expect(result.aiSummary).toEqual({ enabled: true, summarized: 0, failed: 0, reason: '未解析到可用模型（可填写 provider/model，或先配置宿主默认模型）' })
    const markdown = readFileSync(join(digestDir, `${result.date}.md`), 'utf8')
    expect(markdown).toContain('- AI 摘要: 未解析到可用模型')
  })

  it('未启用 ai：不产生摘要字段，也不写缓存文件', async () => {
    const digestDir = join(root, 'digest')
    storeWithAi()
    stubFetch(FEED_XML)
    const ctx = mockCtx({ llm: mockLlm([{ type: 'text-delta', text: '不该出现' }, { type: 'finish', reason: { kind: 'stop' } }]) })

    const result = await generateDigest({ digestDir }, { ctx })
    expect(result.aiSummary).toBeUndefined()
    expect(result.items.every((entry) => entry.aiSummary === undefined)).toBe(true)
    expect(existsSync(aiCachePath(digestDir))).toBe(false)
  })
})
