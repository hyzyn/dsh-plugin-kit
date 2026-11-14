/**
 * @hyzyn/dsh-search — 会话全文搜索「先多取、再过滤、后截断」的回归测试。
 *
 * 现场（PR #25）：`searchSessions` 向宿主只问 `maxResults` 条命中，拿到之后才丢掉
 * 子代理会话与 GUI 打不开的会话。命中榜前面几屏若多是子代理会话，面板就只剩一两条、
 * 甚至为空——哪怕还有大量可打开的会话命中。修法是向宿主多取几倍，过滤后再截断。
 *
 * 为什么这里还要一条 vitest：同一行为在 `scripts/route-smoke.mjs` 的 c2 里已经有用例，
 * 但 `@hyzyn/dsh-search run smoke` **不在 `ci.yml` 里**（也不在 `pnpm verify:list`——
 * 它是 hermetic 的假 ctx 脚本，不是真机脚本），所以那条守卫只在有人手跑时才存在。
 * 这里用**真 cordis** 把同一条判据钉进 `pnpm test`，让回归在 CI 就红。
 *
 * 边界（刻意不覆盖）：只钉宿主 FTS 正常的那条出口。FTS 不可用时的回退扫描
 * （`searchSessionsByScan`）仍是「先收集到 limit 条、再过滤可见性且不回填」，本文件
 * 不假装覆盖它；那条路径的既有判据在 `scan-truncation.test.ts` 与 smoke 的 f3。
 *
 * 判据为什么能钉住宿主契约：`dsh-session-query` 分页是**超出 `maxLimit` 直接抛
 * `SESSION_QUERY_INVALID_LIMIT`**（不是静默夹取），默认 `maxLimit = 100`。所以多取的
 * 那个数字既不能小于 `maxResults`（等于白取），也不能越过宿主默认上限（会让整条 FTS
 * 路径抛错、退化成逐会话扫描）。两头的边界都在下面钉住。
 */
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Config } from '../src/index.js'

type Route = {
  kind: string
  path: string
  handler: (req: unknown, res: unknown) => Promise<void>
}

interface SearchRequest {
  query: string
  limit?: number
  eventFilters?: unknown[]
}

interface Hit {
  header: { id: string; origin?: string }
  bestMatch: { snippet: string; time: number }
}

interface World {
  /** GUI 打得开的会话（`sessions.list()` 的返回）。 */
  visible: string[]
  /** 宿主命中榜：顺序即宿主的相关度排序，`searchSessions` 按 limit 截前面的。 */
  ranked: Hit[]
}

const QUERY_PATH = '/api/dsh-search/query'

const hit = (id: string, header: { origin?: string } = {}): Hit => ({
  header: { id, ...header },
  bestMatch: { snippet: `命中 ${id}`, time: 1 },
})

/** 8 条子代理 + 4 条打不开 + 10 条正常：修之前只取 8 条时，面板会是空的。 */
const subagentIds = Array.from({ length: 8 }, (_, index) => `sub-${index}`)
const hiddenIds = Array.from({ length: 4 }, (_, index) => `hidden-${index}`)
const normalIds = Array.from({ length: 10 }, (_, index) => `main-${index}`)

const world: World = {
  // 子代理会话也进 `sessions.list()`：这样「子代理不出现」只能来自 header 判定，
  // 而不是被可见性过滤顺手挡掉——两条判据各自被单独钉住。
  visible: [...subagentIds, ...normalIds],
  ranked: [
    ...subagentIds.map((id) => hit(id, { origin: 'subagent' })),
    ...hiddenIds.map((id) => hit(id)),
    ...normalIds.map((id) => hit(id)),
  ],
}

/** 记录 writeHead / end 的假响应（与 route-admission.test.ts 同形）。 */
function makeRes(): { status: number; body: unknown; writeHead: (status: number) => void; end: (text?: string) => void } {
  const res = {
    status: 0,
    body: undefined as unknown,
    writeHead(status: number) {
      res.status = status
    },
    end(text?: string) {
      try {
        res.body = text === undefined ? undefined : JSON.parse(text)
      } catch {
        res.body = text
      }
    },
  }
  return res
}

/** 本机回环、无 Origin 的裸请求：与真机脚本 / curl 的形态一致。 */
function makeReq(query: string): unknown {
  return {
    method: 'GET',
    url: `${QUERY_PATH}?q=${encodeURIComponent(query)}`,
    headers: { host: '127.0.0.1:3080' },
    socket: { remoteAddress: '127.0.0.1' },
    once() {},
    removeListener() {},
  }
}

/** 真 WebServer 服务的最小替身：路由注册进来。 */
function makeWebServer(routes: Route[]): unknown {
  return {
    host: '127.0.0.1',
    protocol: 'http:',
    register(route: Route) {
      routes.push(route)
      return () => {}
    },
    on() {},
    waterfall() {},
  }
}

const mounted: Array<{ stop?: () => unknown }> = []

/**
 * 用真 cordis 把插件挂起来，并把四个被读到的服务都真提供出来
 * （真 cordis 上读一个没 `inject`、也没 `provide` 的服务名会抛，
 * 假 ctx 的冒烟测不到这一层——见 route-admission.test.ts 的文件头）。
 */
async function mount(config: Config = {}): Promise<{
  calls: SearchRequest[]
  call: (query: string) => Promise<{ status: number; body: { sessions?: Array<{ id: string }> } }>
}> {
  const routes: Route[] = []
  const calls: SearchRequest[] = []
  const { apply, inject, name } = await import('../src/index.js')
  const ctx = new Context()
  ctx.provide('webServer', makeWebServer(routes) as never)
  ctx.provide('sessionQuery', {
    searchSessions: async (request: SearchRequest) => {
      calls.push(request)
      // 宿主行为：分页按相关度取前 limit 条。
      return { items: world.ranked.slice(0, request.limit ?? world.ranked.length) }
    },
  } as never)
  ctx.provide('sessions', { list: () => world.visible.map((id) => ({ id })) } as never)
  ctx.provide('sessionPersistence', { list: async () => [] } as never)
  ctx.provide('tools', { schemas: () => [] } as never)
  await ctx.plugin({ name, inject, apply }, config)
  mounted.push(ctx)

  const call = async (query: string) => {
    const route = routes.find((item) => item.path === QUERY_PATH)
    if (route === undefined) throw new Error(`路由未注册：${QUERY_PATH}（已注册 ${routes.map((r) => r.path).join(', ')}）`)
    const res = makeRes()
    await route.handler(makeReq(query), res)
    return res as { status: number; body: { sessions?: Array<{ id: string }> } }
  }

  return { calls, call }
}

describe('会话 FTS：先多取、再过滤、后截断（真 cordis）', () => {
  afterEach(async () => {
    for (const ctx of mounted.splice(0)) await ctx.stop?.()
    vi.restoreAllMocks()
  })

  it('默认 maxResults = 8 时向宿主多取（40 条），且不越过宿主默认 maxLimit', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      const { calls, call } = await mount()
      const res = await call('多取倍数')
      expect(res.status).toBe(200)
      expect(calls).toHaveLength(1)
      expect(calls[0].limit).toBe(40)
      // 多取绝不能小于 maxResults——否则比修之前还少取。
      expect(calls[0].limit as number).toBeGreaterThanOrEqual(8)
      // 宿主的 maxLimit 是**校验**而不是夹取：越过它会让 FTS 整条路径抛错退化成逐会话扫描。
      expect(calls[0].limit as number).toBeLessThanOrEqual(100)
    } finally {
      spy.mockRestore()
    }
  })

  it('子代理 / 打不开的会话不占名额：过滤后仍然给满 8 条正常会话', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      // 修之前只取 8 条：宿主前 8 条全是子代理，过滤后为空。
      const { calls, call } = await mount()
      const res = await call('过滤 截断')
      expect(res.status).toBe(200)
      // 先断言**行为**（拿到 8 条正常会话），再断言 mechanism（多取了多少）：
      // 反证时前者先红，说的才是「用户看不到结果」而不是「常量对不上」。
      expect(res.body.sessions?.map((session) => session.id)).toEqual(normalIds.slice(0, 8))
      expect(calls[0].limit).toBe(40)
    } finally {
      spy.mockRestore()
    }
  })

  it('多取随 maxResults 缩放，并在 50 封顶（宿主默认上限的余量）', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      const small = await mount({ maxResults: 3 })
      await small.call('缩放 三')
      expect(small.calls[0].limit).toBe(15)

      const capped = await mount({ maxResults: 12 })
      await capped.call('封顶 十二')
      expect(capped.calls[0].limit).toBe(50)

      // 边界：多取只能比 maxResults 多，不能比它少。
      const wide = await mount({ maxResults: 50 })
      await wide.call('封顶 五十')
      expect(wide.calls[0].limit as number).toBeGreaterThanOrEqual(50)
      expect(wide.calls[0].limit as number).toBeLessThanOrEqual(100)
    } finally {
      spy.mockRestore()
    }
  })
})
