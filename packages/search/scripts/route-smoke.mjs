#!/usr/bin/env node
/**
 * @hyzyn/dsh-search — 宿主端路由冒烟（假 ctx + 假 req/res，无宿主依赖）。
 *
 * 覆盖：
 *   0. 挂载面：plugin 导出形态（name/inject/apply）、/api/dsh-search/query 路由注册、能力公告
 *   a. 空 q：200 短路，四类结果均为空数组，且不触碰会话/工具服务
 *   b. 信任围栏：非 loopback 地址、跨站 host、跨站 origin、sec-fetch-site: cross-site 一律 403；
 *      非 GET 405；同源 origin / IPv4-mapped loopback 放行
 *   c. FTS 正常路径：header.id / bestMatch 映射、条数按 limit 截断、query/eventFilters/signal 透传
 *   d. FTS 抛错（openAt: "never"）回退扫描：会话最近优先截断到 maxScanSessions、
 *      命中按时间倒序、maxScanSessions 可放宽（对照组证明空结果源于截断）
 *   e. 结果缓存：同 query 二次请求不再调用宿主 FTS，也不再重跑回退扫描
 *   f. 可见会话过滤：只保留 sessions.list() / sessionPersistence.list()（带 cwd）里的会话；
 *      可见集合为空时宁可不返回
 *   g. 设置面板：registry 未加载的卡片不出现、加载后出现、官方恒有条目恒可搜
 *   h. Prompt 托管区块：name / 版本 content 命中、snippet 来源、active 标记；
 *      坏 YAML 与缺结束标记不 500、prompts 为空
 *   i. 单字 query：sessions 短路（不触碰宿主 FTS）但 panels / tools 照常返回
 *   j. MCP 工具：只返回 mcp__ 前缀工具，name / description 均可命中
 *
 * 隔离说明：插件在模块级持有结果缓存 / 会话文档缓存 / 可见集合缓存 / Prompt 解析缓存，
 * 用例之间会互相残留。这里每个用例组用 `?smoke=N` 重新 import 一次 lib（Node 的 ESM
 * 缓存以含 query 的完整 URL 为 key），拿到全新模块状态 + 全新假 ctx/路由集。
 *
 * 用法：pnpm --filter @hyzyn/dsh-search build && node scripts/route-smoke.mjs
 */
import { strict as assert } from 'node:assert'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/* ------------------------------------------------------------------ *
 * 假 cordis ctx（范式同 packages/docker/scripts/route-smoke.mjs）
 * ------------------------------------------------------------------ */

function makeCtx(options = {}) {
  const state = {
    routes: [],
    sections: [],
    disposers: [],
    registryNames: [...(options.registryNames ?? [])],
    services: { ...(options.services ?? {}) },
    // 走 ctx.get(name) 渠道的服务名；其余服务挂成 ctx 属性（getService 的兜底分支）
    viaGet: new Set(options.viaGet ?? []),
  }

  const makeChild = (names) => {
    const child = {
      logger: { info: () => {}, warn: () => {}, debug: () => {} },
      effect: (callback) => {
        const dispose = callback()
        state.disposers.push(typeof dispose === 'function' ? dispose : () => {})
        return () => {}
      },
      inject: (childNames, cb) => {
        cb(makeChild(childNames))
        return () => {}
      },
    }
    if (names.includes('webServer')) {
      child.webServer = {
        register: (route) => {
          state.routes.push(route)
          return () => {
            const index = state.routes.indexOf(route)
            if (index >= 0) state.routes.splice(index, 1)
          }
        },
      }
    }
    if (names.includes('systemPrompt')) {
      child.systemPrompt = {
        section: (section) => {
          state.sections.push(section)
          return () => {
            const index = state.sections.indexOf(section)
            if (index >= 0) state.sections.splice(index, 1)
          }
        },
      }
    }
    return child
  }

  const root = makeChild([])
  root.inject = (names, cb) => {
    cb(makeChild(names))
    return () => {}
  }
  // getLoadedRegistryNames 直接枚举 ctx.registry.values()
  root.registry = { values: () => state.registryNames.map((name) => ({ name })) }
  root.get = (name) => (state.viaGet.has(name) ? state.services[name] : undefined)
  for (const [name, service] of Object.entries(state.services)) {
    if (!state.viaGet.has(name)) root[name] = service
  }

  return { ctx: root, state }
}

/* ------------------------------------------------------------------ *
 * 假 HTTP 请求 / 响应
 * ------------------------------------------------------------------ */

const ROUTE_PATH = '/api/dsh-search/query'

function makeReq(sub, options = {}) {
  return {
    method: options.method ?? 'GET',
    url: ROUTE_PATH + sub,
    headers: { host: '127.0.0.1:3080', ...(options.headers ?? {}) },
    socket: { remoteAddress: options.remoteAddress ?? '127.0.0.1' },
    // handler 用 once/removeListener 挂 AbortController 的 close 监听
    once: () => {},
    removeListener: () => {},
  }
}

function makeRes() {
  return {
    status: 0,
    headers: undefined,
    body: null,
    writeHead(status, headers) {
      this.status = status
      this.headers = headers
    },
    end(text) {
      try {
        this.body = text === undefined ? null : JSON.parse(text)
      } catch {
        this.body = text
      }
    },
  }
}

async function callRoute(route, sub, options) {
  const res = makeRes()
  await route.handler(makeReq(sub, options), res)
  return res
}

const queryParam = (query) => '?q=' + encodeURIComponent(query)

let moduleSeq = 0

/** 全新模块状态 + 全新假 ctx：apply 后取回该实例的 /api/dsh-search/query 路由。 */
async function mount(options = {}) {
  const host = await import(`../lib/index.js?smoke=${++moduleSeq}`)
  const { ctx, state } = makeCtx(options)
  const muted = console.log
  console.log = () => {} // apply 会打印挂载日志，冒烟输出保持干净
  try {
    host.apply({ ...ctx }, options.config ?? {})
  } finally {
    console.log = muted
  }
  const route = state.routes.find((item) => item.path === ROUTE_PATH)
  assert.ok(route !== undefined, '未注册 /api/dsh-search/query 路由')
  assert.equal(route.kind, 'exact')
  return { host, ctx, state, route, call: (sub, request) => callRoute(route, sub, request) }
}

const results = []
async function test(name, fn) {
  try {
    await fn()
    results.push({ name, ok: true })
  } catch (error) {
    results.push({ name, ok: false, message: error instanceof Error ? error.message : String(error) })
  }
}

/* ------------------------------------------------------------------ *
 * 0. 挂载面
 * ------------------------------------------------------------------ */

await test('0. 挂载面：导出形态 + 路由注册 + 能力公告', async () => {
  const { host, state, route } = await mount()
  assert.equal(typeof host.apply, 'function')
  assert.equal(host.name, 'global-search')
  assert.deepEqual(host.inject, [])
  assert.equal(route.kind, 'exact')
  assert.equal(route.path, ROUTE_PATH)
  assert.equal(state.routes.length, 1, '只应注册一条路由')
  // 两处 effect（路由 + 能力公告）在挂载时同步执行，disposer 被逐个收纳
  assert.equal(state.disposers.length, 2)
  assert.equal(state.sections.length, 1)
  assert.equal(state.sections[0].name, 'plugin:dsh-global-search')
  assert.equal(state.sections[0].order, 170)
  assert.match(state.sections[0].text, /全局搜索/)
})

/* ------------------------------------------------------------------ *
 * a. 空 q：200 短路
 * ------------------------------------------------------------------ */

await test('a. 空 q：200 短路，四类结果为空且不触碰服务', async () => {
  const { call } = await mount({
    services: {
      sessionQuery: { searchSessions: async () => { throw new Error('空 q 不应触碰会话搜索') } },
      tools: { schemas: () => { throw new Error('空 q 不应枚举工具') } },
    },
    viaGet: ['sessionQuery'],
  })
  for (const sub of ['', '?q=', '?q=%20%20']) {
    const res = await call(sub)
    assert.equal(res.status, 200)
    assert.deepEqual(res.body, { ok: true, query: '', sessions: [], prompts: [], tools: [], panels: [] })
  }
})

/* ------------------------------------------------------------------ *
 * b. loopback 信任围栏
 * ------------------------------------------------------------------ */

await test('b. 信任围栏：非 loopback / 跨站来源 403，方法非 GET 405', async () => {
  const { call } = await mount()

  const nonLoopback = await call(queryParam('abc'), { remoteAddress: '10.0.0.5' })
  assert.equal(nonLoopback.status, 403)
  assert.deepEqual(nonLoopback.body, { error: 'forbidden: loopback-only' })

  const hostileHost = await call(queryParam('abc'), { headers: { host: 'evil.example:3080' } })
  assert.equal(hostileHost.status, 403)

  const crossOrigin = await call(queryParam('abc'), { headers: { origin: 'https://evil.example' } })
  assert.equal(crossOrigin.status, 403)
  assert.match(crossOrigin.body.error, /loopback-only/)

  const crossSite = await call(queryParam('abc'), { headers: { 'sec-fetch-site': 'cross-site' } })
  assert.equal(crossSite.status, 403)

  const sameOrigin = await call(queryParam('abc'), { headers: { origin: 'http://127.0.0.1:3080' } })
  assert.equal(sameOrigin.status, 200)
  const mapped = await call(queryParam('abc'), { remoteAddress: '::ffff:127.0.0.1' })
  assert.equal(mapped.status, 200)

  const post = await call(queryParam('abc'), { method: 'POST' })
  assert.equal(post.status, 405)
  assert.match(post.body.error, /method not allowed/)
})

/* ------------------------------------------------------------------ *
 * c. FTS 正常路径
 * ------------------------------------------------------------------ */

await test('c. FTS 正常路径：映射 / limit 截断 / query+eventFilters+signal 透传', async () => {
  const ids = Array.from({ length: 20 }, (_, index) => 'fts-' + String(index + 1).padStart(2, '0'))
  const calls = []
  const { call } = await mount({
    services: {
      sessionQuery: {
        searchSessions: async (request, exec) => {
          calls.push({ request, exec })
          return {
            items: ids.map((id, index) => ({
              header: { id },
              bestMatch: { snippet: '片段 ' + id, time: 1_700_000_000_000 + index },
            })),
          }
        },
      },
      sessions: { list: () => ids.map((id) => ({ id })) },
    },
    viaGet: ['sessionQuery'],
  })

  const res = await call(queryParam('fts 命中'))
  assert.equal(res.status, 200)
  assert.equal(res.body.ok, true)
  assert.equal(res.body.query, 'fts 命中')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].request.query, 'fts 命中')
  assert.equal(calls[0].request.limit, 8, '默认 maxResults = 8')
  assert.deepEqual(calls[0].request.eventFilters, [
    { kind: 'type', values: ['user/message', 'assistant/message'] },
    { kind: 'surface', values: ['current'] },
  ])
  assert.ok(calls[0].exec.signal instanceof AbortSignal, '应把请求 abort signal 透传给宿主 FTS')
  // 20 条命中截断到 limit=8，字段按 header.id / bestMatch.{snippet,time} 映射
  assert.equal(res.body.sessions.length, 8)
  assert.deepEqual(res.body.sessions[0], { id: 'fts-01', snippet: '片段 fts-01', time: 1_700_000_000_000 })
  assert.deepEqual(res.body.sessions[7], { id: 'fts-08', snippet: '片段 fts-08', time: 1_700_000_000_007 })
  for (const hit of res.body.sessions) {
    assert.deepEqual(Object.keys(hit).sort(), ['id', 'snippet', 'time'])
  }
  assert.deepEqual(res.body.prompts, [])
  assert.deepEqual(res.body.tools, [])
  assert.deepEqual(res.body.panels, [])
})

/* ------------------------------------------------------------------ *
 * d. FTS 抛错 → 逐会话回退扫描
 * ------------------------------------------------------------------ */

const SCAN_COUNT = 100
const SCAN_BASE_TIME = 1_700_000_000_000
const scanRecords = Array.from({ length: SCAN_COUNT }, (_, index) => ({
  header: { id: 'scan-' + String(index).padStart(3, '0'), time: SCAN_BASE_TIME + index * 60_000 },
}))
const scanDoc = (text, index) => [{ text, time: scanRecords[index].header.time, type: 'user/message', surface: 'current' }]
/** 关键词文档一次备齐：会话文档缓存跨查询复用，后续改写会读到旧文档。 */
const scanDocs = new Map([
  ['scan-000', scanDoc('只有这个最旧会话写着「尾古老词」', 0)],
  ['scan-099', scanDoc('最新会话里的「新生词」', 99)],
  ['scan-090', scanDoc('两个命中会话都有「并列词」', 90)],
  ['scan-050', scanDoc('两个命中会话都有「并列词」', 50)],
])
const scanFilterEventsCalls = { count: 0 }

function scanMountOptions(extra = {}) {
  return {
    services: {
      sessionQuery: {
        searchSessions: async () => {
          throw new Error('session search disabled (openAt: "never")')
        },
        listSessions: async () => scanRecords,
        filterEvents: async (sessionId) => {
          scanFilterEventsCalls.count += 1
          return scanDocs.get(sessionId) ?? [{ text: '与查询无关的普通内容', time: 0, type: 'user/message', surface: 'current' }]
        },
      },
      sessions: { list: () => scanRecords.map((record) => ({ id: record.header.id })) },
    },
    viaGet: ['sessionQuery'],
    ...extra,
  }
}

await test('d. FTS 抛错回退扫描：最近优先截断 + 命中时间倒序', async () => {
  const fallback = await mount(scanMountOptions())

  // 关键词只在最旧的 1 个会话：默认 maxScanSessions=80 按最近优先截断 → 搜不到
  const timeoutsBefore = process.getActiveResourcesInfo().filter((name) => name === 'Timeout').length
  const truncated = await fallback.call(queryParam('尾古老词'))
  assert.equal(truncated.status, 200)
  assert.deepEqual(truncated.body.sessions, [], '最旧会话应落入「最近 80」之外')
  // 回退扫描的兜底超时不清理会拖住进程退出（ref 计时器跨请求残留）
  const timeoutsAfter = process.getActiveResourcesInfo().filter((name) => name === 'Timeout').length
  assert.equal(timeoutsAfter, timeoutsBefore, '回退扫描结束后不应残留超时定时器')

  // 对照：maxScanSessions=100 不截断时能搜到最旧会话 → 证明上面的空结果源于截断而非过滤
  const widened = await mount(scanMountOptions({ config: { maxScanSessions: 100 } }))
  const foundOldest = await widened.call(queryParam('尾古老词'))
  assert.deepEqual(foundOldest.body.sessions.map((item) => item.id), ['scan-000'])
  assert.match(foundOldest.body.sessions[0].snippet, /尾古老词/)

  // 关键词在最新会话 → 搜得到（回退路径复用已缓存的会话文档）
  const newest = await fallback.call(queryParam('新生词'))
  assert.deepEqual(newest.body.sessions.map((item) => item.id), ['scan-099'])
  assert.match(newest.body.sessions[0].snippet, /新生词/)

  // 两个不同时间的会话命中 → 按 time 降序
  const pair = await fallback.call(queryParam('并列词'))
  assert.deepEqual(pair.body.sessions.map((item) => item.id), ['scan-090', 'scan-050'])
  assert.ok(pair.body.sessions[0].time > pair.body.sessions[1].time, '命中应按时间倒序')
})

/* ------------------------------------------------------------------ *
 * e. 结果缓存
 * ------------------------------------------------------------------ */

await test('e. 结果缓存：同 query 二次请求不再打宿主服务', async () => {
  // ① FTS 路径
  let searchCalls = 0
  const ftsHit = { id: 'cache-fts', snippet: '缓存片段', time: 1 }
  const ftsLoop = await mount({
    services: {
      sessionQuery: {
        searchSessions: async () => {
          searchCalls += 1
          return { items: [{ header: { id: ftsHit.id }, bestMatch: { snippet: ftsHit.snippet, time: ftsHit.time } }] }
        },
      },
      sessions: { list: () => [{ id: ftsHit.id }] },
    },
    viaGet: ['sessionQuery'],
  })
  const first = await ftsLoop.call(queryParam('cache-probe-fts'))
  const second = await ftsLoop.call(queryParam('cache-probe-fts'))
  assert.equal(first.body.sessions.length, 1)
  assert.equal(searchCalls, 1, '二次相同 query 应命中结果缓存')
  assert.deepEqual(second.body, first.body)
  await ftsLoop.call(queryParam('cache-probe-fts-2'))
  assert.equal(searchCalls, 2, '不同 query 应重新查询')

  // ② 回退扫描路径
  let scanSearchCalls = 0
  let listCalls = 0
  let filterCalls = 0
  const scanLoop = await mount({
    services: {
      sessionQuery: {
        searchSessions: async () => {
          scanSearchCalls += 1
          throw new Error('openAt: "never"')
        },
        listSessions: async () => {
          listCalls += 1
          return [{ header: { id: 'cache-scan', time: 1 } }]
        },
        filterEvents: async () => {
          filterCalls += 1
          return [{ text: '命中 cache-probe-scan 的内容', time: 1, type: 'user/message', surface: 'current' }]
        },
      },
      sessions: { list: () => [{ id: 'cache-scan' }] },
    },
    viaGet: ['sessionQuery'],
  })
  const cold = await scanLoop.call(queryParam('cache-probe-scan'))
  assert.equal(cold.body.sessions.length, 1)
  assert.equal(listCalls, 1)
  await scanLoop.call(queryParam('cache-probe-scan'))
  assert.equal(scanSearchCalls, 1, '二次请求应命中结果缓存（不再走 FTS 兜底）')
  assert.equal(listCalls, 1, '二次请求不应再枚举会话')
  assert.equal(filterCalls, 1, '二次请求不应再扫描会话文档')
})

/* ------------------------------------------------------------------ *
 * f. 可见会话过滤
 * ------------------------------------------------------------------ */

await test('f. 可见会话过滤：只保留 live / persistence 里的会话（快照 + 扁平两种形状）', async () => {
  const { call } = await mount({
    services: {
      sessionQuery: {
        searchSessions: async () => ({
          items: [
            { header: { id: 'ghost-1' }, bestMatch: { snippet: 'g', time: 3 } },
            { header: { id: 'alive-1' }, bestMatch: { snippet: 'a', time: 2 } },
            { header: { id: 'cold-1' }, bestMatch: { snippet: 'c', time: 1 } },
            { header: { id: 'cold-flat' }, bestMatch: { snippet: 'f', time: 0 } },
          ],
        }),
      },
      // sessions 走属性渠道，sessionPersistence 走 ctx.get 渠道，两条喂法都要能生效。
      // persistence.list 宿主真实返回快照形状 { header: { id, cwd }, revision, size }；
      // 扁平 { id, cwd } 是兼容旧形状的路径，两种都要能进可见集合。
      sessions: { list: () => [{ id: 'alive-1' }] },
      sessionPersistence: {
        list: async () => [
          { header: { id: 'cold-1', cwd: '/tmp/project' }, revision: 'r1', sizeBytes: 10 },
          { id: 'cold-flat', cwd: '/tmp/project' },
        ],
      },
    },
    viaGet: ['sessionQuery', 'sessionPersistence'],
  })

  const res = await call(queryParam('visible-probe'))
  assert.equal(res.status, 200)
  assert.deepEqual(res.body.sessions.map((item) => item.id), ['alive-1', 'cold-1', 'cold-flat'])
  assert.equal(res.body.sessions.some((item) => item.id === 'ghost-1'), false, '不可见会话必须被过滤')

  // 可见集合为空时宁可不返回，避免「能搜到但点不开」
  const blind = await mount({
    services: {
      sessionQuery: {
        searchSessions: async () => ({ items: [{ header: { id: 'ghost-2' }, bestMatch: { snippet: '', time: 1 } }] }),
      },
      sessions: { list: () => [] },
      sessionPersistence: { list: async () => [] },
    },
    viaGet: ['sessionQuery'],
  })
  const empty = await blind.call(queryParam('visible-probe-2'))
  assert.equal(empty.status, 200)
  assert.deepEqual(empty.body.sessions, [])
})

await test('f2. 空结果不缓存：回退扫描结果为空后，重试必须重新扫描而不是 30s 内固化空结果', async () => {
  let listCalls = 0
  // FTS 抛错走回退扫描；listSessions 返回空 → sessions 为空。
  // 旧实现会把空结果写入 30s 结果缓存（重试直接命中缓存）；修复后空结果不写缓存。
  const { call } = await mount({
    services: {
      sessionQuery: {
        searchSessions: async () => { throw new Error('openAt: "never"') },
        listSessions: async () => {
          listCalls += 1
          return []
        },
        filterEvents: async () => [],
      },
      sessions: { list: () => [{ id: 'live-1' }] },
      sessionPersistence: { list: async () => [{ header: { id: 'live-1', cwd: '/tmp' } }] },
    },
    viaGet: ['sessionQuery'],
  })

  const first = await call(queryParam('empty-scan-probe'))
  assert.equal(first.status, 200)
  assert.deepEqual(first.body.sessions, [])
  const second = await call(queryParam('empty-scan-probe'))
  assert.equal(second.status, 200)
  assert.equal(listCalls, 2, `空结果不应写结果缓存（listSessions 仅调用 ${listCalls} 次）`)
})

await test('f3. subagent 会话排除：子代理会话打不开，FTS 与回退扫描两条路径都不应出现', async () => {
  // ① FTS 路径：searchSessions 混入 subagent 命中
  const fts = await mount({
    services: {
      sessionQuery: {
        searchSessions: async () => ({
          items: [
            { header: { id: 'main-1' }, bestMatch: { snippet: '主会话', time: 2 } },
            { header: { id: 'sub-1', origin: 'subagent' }, bestMatch: { snippet: '子会话', time: 3 } },
            { header: { id: 'sub-2', delegationDepth: 2 }, bestMatch: { snippet: '子会话2', time: 1 } },
          ],
        }),
      },
      sessions: { list: () => [] },
      sessionPersistence: { list: async () => [{ header: { id: 'main-1', cwd: '/tmp' } }] },
    },
    viaGet: ['sessionQuery'],
  })
  const ftsRes = await fts.call(queryParam('subagent-fts-probe'))
  assert.deepEqual(ftsRes.body.sessions.map((item) => item.id), ['main-1'], 'FTS 路径 subagent 命中必须被剔除')

  // ② 回退扫描路径：listSessions 混入 subagent 记录
  let filterCalls = []
  const scan = await mount({
    services: {
      sessionQuery: {
        searchSessions: async () => { throw new Error('openAt: "never"') },
        listSessions: async () => [
          { header: { id: 'scan-main', createdAt: 2, cwd: '/tmp' } },
          { header: { id: 'scan-sub', createdAt: 3, origin: 'subagent', delegationDepth: 1, cwd: '/tmp' } },
        ],
        filterEvents: async (sessionId) => {
          filterCalls.push(sessionId)
          return [{ text: '命中 subagent-scan-probe 的内容', time: 1, type: 'user/message', surface: 'current' }]
        },
      },
      sessions: { list: () => [] },
      sessionPersistence: { list: async () => [{ header: { id: 'scan-main', cwd: '/tmp' } }] },
    },
    viaGet: ['sessionQuery'],
  })
  const scanRes = await scan.call(queryParam('subagent-scan-probe'))
  assert.deepEqual(scanRes.body.sessions.map((item) => item.id), ['scan-main'], '回退扫描不得扫描/返回 subagent 会话')
  assert.deepEqual(filterCalls, ['scan-main'], 'subagent 会话不应消耗扫描与名额')
})

/* ------------------------------------------------------------------ *
 * g. 设置面板
 * ------------------------------------------------------------------ */

await test('g. 设置面板：registry 未加载的卡片不出现，官方条目恒可搜', async () => {
  const { state, call } = await mount()

  const hidden = await call(queryParam('rss'))
  assert.deepEqual(hidden.body.panels, [], '未加载 rss-digest 时不应出现该卡片')
  const hiddenCodegraph = await call(queryParam('codegraph'))
  assert.deepEqual(hiddenCodegraph.body.panels, [])

  state.registryNames.push('rss-digest')
  const shown = await call(queryParam('rss'))
  assert.deepEqual(shown.body.panels.map((panel) => panel.id), ['rss-digest'])
  assert.equal(shown.body.panels[0].kind, 'card')
  assert.deepEqual(shown.body.panels[0].titles, ['RSS / 新闻聚合', 'RSS / News Aggregation'])
  assert.match(shown.body.panels[0].snippet, /RSS/)

  // 无 registryName 的官方条目恒可搜（不依赖 registry）
  const official = await call(queryParam('终端'))
  assert.deepEqual(official.body.panels.map((panel) => panel.id), ['terminal'])
  const section = await call(queryParam('模型'))
  assert.deepEqual(section.body.panels.map((panel) => panel.id), ['s-models'])
  assert.equal(section.body.panels[0].kind, 'section')
})

/* ------------------------------------------------------------------ *
 * h. Prompt 托管区块
 * ------------------------------------------------------------------ */

const promptDir = mkdtempSync(join(tmpdir(), 'dsh-search-smoke-'))
const goodPromptFile = join(promptDir, 'prompts.yml')
writeFileSync(goodPromptFile, [
  'unmanaged: true',
  '# --- dsh-prompt-manager managed ---',
  'activePromptId: p-review',
  'prompts:',
  '  - id: p-review',
  '    name: 代码审查助手',
  '    description: 让模型逐行审查变更',
  '    versions:',
  '      - id: v1',
  '        content: 请逐行审查这段代码，重点关注边界条件',
  '        label: 严格模式',
  '        createdAt: 2026-01-01T00:00:00.000Z',
  '  - id: p-greet',
  '    name: Greeting Writer',
  '    description: 生成问候语',
  '    versions:',
  '      - id: v1',
  '        content: Write a friendly greeting',
  '        createdAt: 2026-01-02T00:00:00.000Z',
  '    activeVersionId: v1',
  '# --- end dsh-prompt-manager managed ---',
  '',
].join('\n'))

await test('h. Prompt：name / 版本 content 命中、active 标记、坏 YAML 不 500', async () => {
  const previousPromptFile = process.env.DSH_PROMPT_FILE
  process.env.DSH_PROMPT_FILE = goodPromptFile
  try {
    const { call } = await mount()

    // 按 name 命中：snippet 回落 description，activePromptId 对应条目 active=true
    const byName = await call(queryParam('代码审查'))
    assert.equal(byName.status, 200)
    assert.deepEqual(byName.body.prompts, [{
      id: 'p-review',
      name: '代码审查助手',
      description: '让模型逐行审查变更',
      snippet: '让模型逐行审查变更',
      active: true,
    }])

    // 按版本 content 命中：snippet 取自 content 且 active=false（非 activePromptId）
    const byContent = await call(queryParam('friendly'))
    assert.deepEqual(byContent.body.prompts.map((prompt) => prompt.id), ['p-greet'])
    assert.match(byContent.body.prompts[0].snippet, /friendly/)
    assert.equal(byContent.body.prompts[0].active, false)

    const byVersion = await call(queryParam('边界条件'))
    assert.deepEqual(byVersion.body.prompts.map((prompt) => prompt.id), ['p-review'])
    assert.match(byVersion.body.prompts[0].snippet, /边界条件/)
    assert.equal(byVersion.body.prompts[0].active, true)

    const miss = await call(queryParam('绝不存在的提示词'))
    assert.deepEqual(miss.body.prompts, [])

    // 坏 YAML：托管区块解析失败 → fileError 走空 store，请求仍是 200 + prompts []
    const badPromptFile = join(promptDir, 'bad.yml')
    writeFileSync(badPromptFile, [
      '# --- dsh-prompt-manager managed ---',
      'activePromptId: p1',
      'prompts:',
      '  - id: broken',
      '    name: "未闭合的引号',
      '# --- end dsh-prompt-manager managed ---',
      '',
    ].join('\n'))
    process.env.DSH_PROMPT_FILE = badPromptFile
    const broken = await call(queryParam('代码审查'))
    assert.equal(broken.status, 200, '坏托管区块不应 500')
    assert.equal(broken.body.ok, true)
    assert.deepEqual(broken.body.prompts, [])

    // 缺结束标记：同样按 fileError 处理
    const unclosedPromptFile = join(promptDir, 'unclosed.yml')
    writeFileSync(unclosedPromptFile, [
      '# --- dsh-prompt-manager managed ---',
      'prompts: []',
      '',
    ].join('\n'))
    process.env.DSH_PROMPT_FILE = unclosedPromptFile
    const unclosed = await call(queryParam('代码审查'))
    assert.equal(unclosed.status, 200)
    assert.deepEqual(unclosed.body.prompts, [])
  } finally {
    if (previousPromptFile === undefined) delete process.env.DSH_PROMPT_FILE
    else process.env.DSH_PROMPT_FILE = previousPromptFile
  }
})

/* ------------------------------------------------------------------ *
 * i. 单字 query
 * ------------------------------------------------------------------ */

await test('i. 单字 query：sessions 短路，panels / tools 照常', async () => {
  let searchCalls = 0
  const { call } = await mount({
    services: {
      sessionQuery: {
        searchSessions: async () => {
          searchCalls += 1
          return { items: [{ header: { id: 'never' }, bestMatch: { snippet: '', time: 1 } }] }
        },
        listSessions: async () => {
          throw new Error('单字 query 不应触发回退扫描')
        },
        filterEvents: async () => {
          throw new Error('单字 query 不应触发回退扫描')
        },
      },
      tools: { schemas: () => [{ name: 'mcp__demo', description: '模型相关工具' }] },
    },
    viaGet: ['sessionQuery'],
  })

  const res = await call(queryParam('模'))
  assert.equal(res.status, 200)
  assert.deepEqual(res.body.sessions, [], '单字 query 不搜会话')
  assert.equal(searchCalls, 0, '单字 query 不应触碰宿主 FTS')
  // 官方大类恒可搜：模型（关键词「模型」）与 Agent 预设（描述含「角色模板」）都命中「模」
  assert.deepEqual(res.body.panels.map((panel) => panel.id), ['s-models', 's-agent-presets'])
  assert.deepEqual(res.body.tools.map((tool) => tool.name), ['mcp__demo'])
})

/* ------------------------------------------------------------------ *
 * j. MCP 工具
 * ------------------------------------------------------------------ */

await test('j. MCP 工具：只返回 mcp__ 前缀，name / description 均可命中', async () => {
  const { call } = await mount({
    services: {
      tools: {
        schemas: () => [
          { name: 'mcp__github__create_issue', description: 'Create an issue in a repository' },
          { name: 'mcp__filesystem__read_file', description: 'Read a file from disk' },
          { name: 'dsh_internal_reader', description: 'internal helper that can read files' },
          { name: 'mcp__other', description: 'unrelated' },
        ],
      },
    },
  })

  const byName = await call(queryParam('filesystem'))
  assert.deepEqual(byName.body.tools, [{ name: 'mcp__filesystem__read_file', description: 'Read a file from disk' }])

  const byDescription = await call(queryParam('read'))
  assert.deepEqual(byDescription.body.tools.map((tool) => tool.name), ['mcp__filesystem__read_file'])
  assert.equal(byDescription.body.tools.every((tool) => tool.name.startsWith('mcp__')), true, '非 mcp__ 工具不得出现')

  const noHit = await call(queryParam('internal helper'))
  assert.deepEqual(noHit.body.tools, [], '非前缀工具即使在描述里命中也不返回')
})

/* ------------------------------------------------------------------ *
 * 结果
 * ------------------------------------------------------------------ */

let failed = 0
for (const result of results) {
  if (result.ok) {
    console.log(`  ✓ ${result.name}`)
  } else {
    failed += 1
    console.error(`  ✗ ${result.name}\n      ${result.message}`)
  }
}
console.log(`\n[dsh-search] route-smoke: ${String(results.length - failed)}/${String(results.length)} 通过`)
if (failed > 0) process.exit(1)
