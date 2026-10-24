/**
 * @hyzyn/dsh-rss — systemPrompt 注入的两条口径（2026-10-24）。
 *
 *   ① **开关是热的**：`announceToAgent=false` 启动的宿主，卡片里改成 true 后**不重启**
 *      就要出现注入块。旧实现把判定放在挂载期（`if (announce) { ctx.inject(…) }`），
 *      `systemPromptApi` 永远是 null，热改成 true 也要等到重启——本组用例的第一条就是
 *      钉这个出口：先断言「没 section」，再走一次真实的 `POST /api/dsh-rss/config`，
 *      断言 section 出现。把判定改回挂载期，这一条立刻红。
 *   ② **按条数收口**：段落只列 `digest.items` 的前 `PROMPT_ITEM_LIMIT` 条（分类标题保留），
 *      其余在段尾指向当天的 digest 文件。按字符截断会截在一条条目中间，模型看到的是
 *      一段断头文字——所以这里同时钉「超限只列 8 条」与「未超限原样全列、不出现尾句」。
 *
 * IO 全部隔离到临时目录（`DSH_RSS_CONFIG_FILE` + `config.digestDir`）；`autoGenerateOnMount`
 * 关掉，不发起任何网络请求。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PROMPT_ITEM_LIMIT, apply, buildSystemPromptText, readRssStore, writeRssStore } from '../src/index.js'
import type { DigestResult, FeedItem } from '../src/index.js'

let root: string
let digestRoot: string
let originalConfigFile: string | undefined

beforeEach(() => {
  originalConfigFile = process.env.DSH_RSS_CONFIG_FILE
  root = mkdtempSync(join(tmpdir(), 'dsh-rss-announce-'))
  digestRoot = join(root, 'digest')
  process.env.DSH_RSS_CONFIG_FILE = join(root, 'rss.json')
})

afterEach(() => {
  if (originalConfigFile === undefined) delete process.env.DSH_RSS_CONFIG_FILE
  else process.env.DSH_RSS_CONFIG_FILE = originalConfigFile
  rmSync(root, { recursive: true, force: true })
})

/* ------------------------------------------------------------------ *
 * 假宿主：只需要 tools 之外的四个面（webServer 路由 / systemPrompt section /
 * effect / logger）。与同包已有的假宿主写法一致，不碰真网络。
 * ------------------------------------------------------------------ */

interface FakeRoute {
  kind: string
  path: string
  handler: (req: unknown, res: unknown) => Promise<void>
}

interface SectionOptions {
  name: string
  order?: number
  interpolate?: boolean
  text: unknown
}

interface FakeRes {
  status: number
  headers: Record<string, string>
  body: string | undefined
  writeHead: (status: number, headers?: Record<string, string>) => void
  end: (body?: string) => void
}

function makeRes(): FakeRes {
  const res: FakeRes = {
    status: 0,
    headers: {},
    body: undefined,
    writeHead(status, headers) {
      res.status = status
      res.headers = headers ?? {}
    },
    end(body) {
      res.body = body
    },
  }
  return res
}

/** 回环请求（`guard` 要求 socket.remoteAddress + host 都是本机）。 */
function makeReq(method: string, path: string, body?: unknown): unknown {
  const payload = body === undefined ? '' : JSON.stringify(body)
  const chunks = payload === '' ? [] : [Buffer.from(payload)]
  return {
    method,
    url: path,
    headers: { host: '127.0.0.1:3021', 'content-type': 'application/json' },
    socket: { remoteAddress: '127.0.0.1' },
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) yield chunk
    },
  }
}

interface Mounted {
  /** 当前挂在 systemPrompt 上的 section（name → options）。 */
  sections: Map<string, SectionOptions>
  routes: FakeRoute[]
  /** 跑 `ctx.effect` 收集到的清理函数（用例结束时调用，别留下 30s 定时器）。 */
  dispose: () => void
}

/** 挂一次 `apply()`；`config.digestDir` 指到临时目录，不碰真实 `~/.dsh`。 */
function mountPlugin(digestDir: string): Mounted {
  const sections = new Map<string, SectionOptions>()
  const routes: FakeRoute[] = []
  const disposers: Array<() => void> = []
  const logger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }
  const makeChild = (names: string[]): Record<string, unknown> => {
    const child: Record<string, unknown> = {
      logger: () => logger,
      effect: (callback: () => unknown) => {
        const result = callback()
        const dispose = typeof result === 'function' ? (result as () => void) : () => {}
        disposers.push(dispose)
        return dispose
      },
      inject: (childNames: string[], cb: (ctx: unknown) => void) => {
        cb(makeChild(childNames))
        return () => {}
      },
      on: () => () => {},
      events: { on: () => () => {} },
    }
    if (names.includes('webServer')) {
      child.webServer = {
        register: (route: FakeRoute) => {
          routes.push(route)
          return () => {}
        },
      }
    }
    if (names.includes('systemPrompt')) {
      child.systemPrompt = {
        section: (options: SectionOptions) => {
          sections.set(options.name, options)
          return () => {
            sections.delete(options.name)
          }
        },
      }
    }
    return child
  }
  const rootCtx = makeChild([])
  ;(apply as unknown as (ctx: unknown, config: unknown) => void)(rootCtx, { digestDir })
  return {
    sections,
    routes,
    dispose: () => {
      for (const dispose of disposers.reverse()) {
        try {
          dispose()
        } catch {
          /* 与真实 cordis 一致：释放失败不阻塞 */
        }
      }
    },
  }
}

/** 一条最小 FeedItem（link 必须是 http(s)，否则会被 safeLink 丢掉）。 */
function feedItem(index: number, category: string): FeedItem {
  return {
    id: `item-${String(index)}`,
    title: `标题${String(index)}`,
    link: `https://example.com/${String(index)}`,
    source: '测试源',
    category,
  }
}

function digestOf(items: FeedItem[]): DigestResult {
  return {
    date: '2026-10-24',
    file: join(digestRoot, '2026-10-24.md'),
    items,
    errors: [],
    generatedAt: '2026-10-24T00:00:00.000Z',
  }
}

/** 用 store 的原子写落一份「关掉公告、关掉自动生成」的配置。 */
function seedStore(announceToAgent: boolean): void {
  writeRssStore({
    sources: [],
    categories: [],
    catalogs: [],
    autoGenerateOnMount: false,
    announceToAgent,
  })
}

/** 落一份 latest.json（`apply` 挂载时会读它作为当前 digest）。 */
function seedLatest(digest: DigestResult): void {
  mkdirSync(digestRoot, { recursive: true })
  writeFileSync(join(digestRoot, 'latest.json'), JSON.stringify(digest))
}

describe('announceToAgent 是热开关（钉住「注入恒注册」）', () => {
  it('announce=false 启动 → 没有 section；POST /config 改成 true → 不重启就出现', async () => {
    seedStore(false)
    seedLatest(digestOf([feedItem(1, '科技'), feedItem(2, '技术')]))
    const mounted = mountPlugin(digestRoot)
    try {
      // 启动态：开关关着，注入块必须不在
      expect(mounted.sections.size).toBe(0)

      const route = mounted.routes.find((item) => item.path === '/api/dsh-rss/config')
      expect(route, '未注册 /api/dsh-rss/config 路由').toBeDefined()
      const body = { config: { ...readRssStore(), announceToAgent: true } }
      const res = makeRes()
      await route?.handler(makeReq('POST', '/api/dsh-rss/config', body), res)
      expect(res.status).toBe(200)

      // 热应用：同一个插件实例（没有重新 apply），section 立刻出现
      const section = mounted.sections.get('plugin:dsh-rss-digest')
      expect(section, '热改成 true 后注入块没有出现——挂载期静态门控又回来了').toBeDefined()
      expect(String(section?.text)).toContain('今日值得读')
      expect(String(section?.text)).toContain('标题1')
    } finally {
      mounted.dispose()
    }
  })

  it('（反例）announce=true 启动时本来就有 section——热关闭也必须即时撤下', async () => {
    seedStore(true)
    seedLatest(digestOf([feedItem(1, '科技')]))
    const mounted = mountPlugin(digestRoot)
    try {
      expect(mounted.sections.has('plugin:dsh-rss-digest')).toBe(true)
      const route = mounted.routes.find((item) => item.path === '/api/dsh-rss/config')
      const res = makeRes()
      await route?.handler(makeReq('POST', '/api/dsh-rss/config', { config: { ...readRssStore(), announceToAgent: false } }), res)
      expect(res.status).toBe(200)
      expect(mounted.sections.has('plugin:dsh-rss-digest')).toBe(false)
    } finally {
      mounted.dispose()
    }
  })
})

describe('段落按条数收口（不是按字符）', () => {
  it('13 条 → 只列前 8 条，分类标题保留，段尾给 .md 全文路径', () => {
    const items = Array.from({ length: 13 }, (_, index) => feedItem(index + 1, index % 2 === 0 ? '科技' : '技术'))
    const text = buildSystemPromptText(digestOf(items), { digestDir: digestRoot })
    const listed = text.split('\n').filter((line) => line.startsWith('- ['))
    expect(listed).toHaveLength(PROMPT_ITEM_LIMIT)
    // 前 8 条都在、第 9 条及以后不在
    expect(text).toContain('标题8')
    expect(text).not.toContain('标题9')
    // 分类标题按「前 8 条里真实存在的分类」保留（两种分类都还有条目）
    expect(text).toContain('## 科技')
    expect(text).toContain('## 技术')
    // 段尾：总数 + 已列条数 + 当天的 digest 文件（路径现算，不是写死的字符串）
    expect(text).toContain('共 13 条')
    expect(text).toContain(`已列前 ${String(PROMPT_ITEM_LIMIT)} 条`)
    expect(text).toContain(join(digestRoot, '2026-10-24.md'))
  })

  it('（反例）≤8 条 → 原样全列，不出现尾句', () => {
    const items = Array.from({ length: 5 }, (_, index) => feedItem(index + 1, '科技'))
    const text = buildSystemPromptText(digestOf(items), { digestDir: digestRoot })
    const listed = text.split('\n').filter((line) => line.startsWith('- ['))
    expect(listed).toHaveLength(5)
    expect(text).toContain('标题5')
    expect(text).not.toContain('已列前')
    expect(text).not.toContain('全文见')
  })

  it('恰好 8 条：全列且不出现尾句（边界不抖）', () => {
    const items = Array.from({ length: PROMPT_ITEM_LIMIT }, (_, index) => feedItem(index + 1, '科技'))
    const text = buildSystemPromptText(digestOf(items), { digestDir: digestRoot })
    expect(text.split('\n').filter((line) => line.startsWith('- ['))).toHaveLength(PROMPT_ITEM_LIMIT)
    expect(text).not.toContain('已列前')
  })
})
