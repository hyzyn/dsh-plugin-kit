/**
 * @hyzyn/dsh-loglens — 宿主半体的接入用例。
 *
 * 三件事必须有反例：回环围栏（加固档）、按动作豁免的同源证明（enabled 免 / targets 要）、
 * 以及「没有 settings 服务时如实回报只在本次进程内有效」。用例喂的是极简假 req/res
 * （kit 的围栏刻意用结构化 ReqLike / ResLike，见其文件头），所以不起真实 HTTP 服务。
 */
import type { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { emptyConfig } from '../src/config.js'
import type { LoglensConfig } from '../src/config.js'
import { CONFIG_ACTIONS, LOGLENS_GUIDANCE, ROUTE_PREFIX, apply, inject, makeRoutes, name } from '../src/index.js'
import { LOGLENS_TIER_CLASS } from '../src/tools.js'

afterEach(() => {
  vi.restoreAllMocks()
})

interface FakeRoute {
  kind: string
  path: string
  handler: (req: never, res: never) => unknown
}

interface FakeRequestInit {
  method?: string
  body?: unknown
  rawBody?: string
  origin?: string
  cookie?: string
  remoteAddress?: string
  host?: string
  sub?: string
}

function makeRequest(init: FakeRequestInit = {}) {
  const text = init.rawBody !== undefined
    ? init.rawBody
    : (init.body === undefined ? '' : JSON.stringify(init.body))
  const headers: Record<string, string> = { host: init.host ?? '127.0.0.1:3080' }
  if (init.origin !== undefined) headers.origin = init.origin
  if (init.cookie !== undefined) headers.cookie = init.cookie
  return {
    method: init.method ?? 'GET',
    url: ROUTE_PREFIX + (init.sub ?? '/config'),
    headers,
    socket: { remoteAddress: init.remoteAddress ?? '127.0.0.1' },
    [Symbol.asyncIterator]: async function * iterate() {
      if (text !== '') yield Buffer.from(text, 'utf8')
    },
  }
}

function makeResponse() {
  let status = 0
  let payload = ''
  const res = {
    writeHead(code: number) { status = code },
    end(body?: string) { payload = body ?? '' },
  }
  return {
    res,
    read(): { status: number; body: Record<string, unknown> | undefined } {
      return { status, body: payload === '' ? undefined : JSON.parse(payload) as Record<string, unknown> }
    },
  }
}

function fakeContext(options: { webServer?: boolean; settings?: Record<string, unknown>; tools?: boolean; systemPrompt?: boolean } = {}) {
  const routes: FakeRoute[] = []
  const webServer = {
    register(route: FakeRoute) {
      routes.push(route)
      return () => {
        const at = routes.indexOf(route)
        if (at >= 0) routes.splice(at, 1)
      }
    },
  }
  const webCtx = { effect: (run: () => unknown) => { run(); return () => undefined }, webServer }
  const registeredTools: string[] = []
  const toolsApi = {
    register(definition: { name: string }): () => void {
      registeredTools.push(definition.name)
      return () => {
        const at = registeredTools.indexOf(definition.name)
        if (at >= 0) registeredTools.splice(at, 1)
      }
    },
  }
  const toolsCtx = { effect: (run: () => unknown) => { run(); return () => undefined }, tools: toolsApi }
  const sections: Array<{ name: string; order?: number; text: string }> = []
  const systemPrompt = {
    section(options: { name: string; order?: number; text: string }): () => void {
      sections.push(options)
      return () => {
        const at = sections.findIndex((item) => item.name === options.name)
        if (at >= 0) sections.splice(at, 1)
      }
    },
  }
  const promptCtx = { effect: (run: () => unknown) => { run(); return () => undefined }, systemPrompt }
  const ctx = {
    get: (service: string) => (service === 'settings' ? options.settings : undefined),
    inject: (names: string[], callback: (value: unknown) => void) => {
      if (options.webServer === true && names.includes('webServer')) callback(webCtx)
      if (options.tools === true && names.includes('tools')) callback(toolsCtx)
      if (options.systemPrompt === true && names.includes('systemPrompt')) callback(promptCtx)
      return () => undefined
    },
    effect: (run: () => unknown) => { run(); return () => undefined },
    on: () => () => undefined,
  }
  return {
    ctx: ctx as unknown as Context,
    routes,
    registeredTools,
    sections,
  }
}

/** 直接用 makeRoutes 起一条路由（read / write 由用例自己掌账，于是断言能看见落盘值）。 */
function harness() {
  let live: LoglensConfig = emptyConfig()
  const writes: LoglensConfig[] = []
  const route = makeRoutes({
    read: () => live,
    write: async (next) => {
      live = next
      writes.push(next)
      return undefined
    },
    runQuery: async () => ({}),
    runFields: async () => ({}),
    dockerLoaded: () => false,
    // 能力自述要描述**真正跑的那个后端**，所以路由与执行层共用同一个 backendFor（见 RouteState 的注释）。
    // 这一份 harness 只打 /config，用不上它；但字段是必需的——缺了会在「以后加一条 /query 用例」时
    // 以 `state.backendFor is not a function` 的样子炸掉，那种失败很难对回到原因。
    backendFor: () => undefined,
  })[0]
  return {
    route,
    writes,
    state: () => live,
    async request(init: FakeRequestInit = {}) {
      const { res, read } = makeResponse()
      await route.handler(makeRequest(init) as never, res as never)
      return read()
    },
  }
}

describe('插件形状与挂载日志', () => {
  it('默认打印一行 mounted（含来源计数）', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    apply(fakeContext().ctx)
    expect(log).toHaveBeenCalledTimes(1)
    expect(String(log.mock.calls[0][0])).toContain('[dsh-loglens] mounted')
  })

  it('announce 关闭时不打印；插件形状完整', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    apply(fakeContext().ctx, { announce: false })
    expect(log).not.toHaveBeenCalled()
    expect(name).toBe('loglens')
    expect(Array.isArray(inject)).toBe(true)
  })

  it('有 webServer 才注册路由：没有时不抛错也不注册（老宿主）', () => {
    const withServer = fakeContext({ webServer: true })
    apply(withServer.ctx, { announce: false })
    expect(withServer.routes.map((route) => route.path)).toEqual([ROUTE_PREFIX])
    expect(withServer.routes[0].kind).toBe('prefix')

    const without = fakeContext()
    expect(() => { apply(without.ctx, { announce: false }) }).not.toThrow()
    expect(without.routes).toHaveLength(0)
  })

  it('动作白名单是写死的四条（别把它扩成「照单全收」）', () => {
    expect([...CONFIG_ACTIONS]).toEqual(['enabled', 'targets.add', 'targets.update', 'targets.remove'])
  })
})

describe('注册面收窄（渐进披露 T2/T7）：工具名单随配置现算', () => {
  it('零来源：注册表里只有 loglens_sources（其余四个调用期必然抛错，注册了就是必然报错的工具）', () => {
    const harness = fakeContext({ tools: true })
    apply(harness.ctx, { announce: false })
    expect(harness.registeredTools).toEqual(['loglens_sources'])
  })

  it('有来源：五个都在（既有行为）', () => {
    const harness = fakeContext({ tools: true })
    apply(harness.ctx, { announce: false, targets: [{ id: 'es', kind: 'elasticsearch', label: '本地', url: 'http://127.0.0.1:9200' }] })
    expect([...harness.registeredTools].sort()).toEqual([
      'loglens_context', 'loglens_facets', 'loglens_fields', 'loglens_search', 'loglens_sources',
    ])
  })

  it('只有 Loki / Docker 来源时不注册 loglens_facets（它对所有现役来源都只会抛 facetsHint）', () => {
    const lokiOnly = fakeContext({ tools: true })
    apply(lokiOnly.ctx, { announce: false, targets: [{ id: 'loki', kind: 'loki', label: 'L', url: 'http://127.0.0.1:3100' }] })
    expect([...lokiOnly.registeredTools].sort()).toEqual(['loglens_context', 'loglens_fields', 'loglens_search', 'loglens_sources'])

    const dockerOnly = fakeContext({ tools: true })
    apply(dockerOnly.ctx, { announce: false, targets: [{ id: 'd', kind: 'docker', label: 'D', url: '' }] })
    expect(dockerOnly.registeredTools).not.toContain('loglens_facets')
  })

  it('混着来：Loki + ES 时 facets 回来了（有一个可聚合来源就够）', () => {
    const harness = fakeContext({ tools: true })
    apply(harness.ctx, {
      announce: false,
      targets: [
        { id: 'loki', kind: 'loki', label: 'L', url: 'http://127.0.0.1:3100' },
        { id: 'es', kind: 'elasticsearch', label: 'E', url: 'http://127.0.0.1:9200' },
      ],
    })
    expect(harness.registeredTools).toContain('loglens_facets')
  })

  it('分类对账不受收窄影响：LOGLENS_TIER_CLASS 仍是五项全量（闸门要能分类任何一个前缀内工具）', () => {
    expect(Object.keys(LOGLENS_TIER_CLASS).sort()).toEqual([
      'loglens_context', 'loglens_facets', 'loglens_fields', 'loglens_search', 'loglens_sources',
    ])
  })
})

describe('面向模型的公告（渐进披露 T5）：plugin:dsh-loglens section', () => {
  it('announce 缺省（true）时注册 section：名字、顺序、文本都在', () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined)   // mounted 那条日志与本用例无关
    const harness = fakeContext({ systemPrompt: true })
    apply(harness.ctx)
    expect(harness.sections).toHaveLength(1)
    const section = harness.sections[0]
    expect(section.name).toBe('plugin:dsh-loglens')
    expect(section.order).toBe(151)
    // 文本 ≤300 字符：section 是给每一步请求都要带的常驻面，长文案是税
    expect(section.text.length).toBeLessThanOrEqual(300)
  })

  it('announce=false 时不注册 section（启动日志与模型公告同一颗开关）', () => {
    const harness = fakeContext({ systemPrompt: true })
    apply(harness.ctx, { announce: false })
    expect(harness.sections).toHaveLength(0)
  })

  it('宿主没有 systemPrompt 服务时不抛错（老宿主）', () => {
    const harness = fakeContext()
    expect(() => { apply(harness.ctx) }).not.toThrow()
  })

  it('section 文本的禁区：流程与门禁可以有，内部 API 名 / 仓内文档引用 / 配置文件路径不许有', () => {
    const text = LOGLENS_GUIDANCE
    expect(text).not.toContain('design §')
    expect(text).not.toContain('设计 §')
    expect(text).not.toContain('_field_caps')
    expect(text).not.toContain('cordis.patch.yml')
    expect(text).not.toContain('PIT')
    // 门禁的两句话要在：facets 的能力门、零来源时的去处
    expect(text).toContain('loglens_sources')
    expect(text).toContain('Elasticsearch')
    expect(text).toContain('设置 → 插件配置 → 日志查询')
  })
})

describe('回环围栏与方法/路由判定', () => {
  it('GET /config 回环可读', async () => {
    const { request } = harness()
    const response = await request()
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ ok: true, config: { enabled: true, targets: [] }, plugins: { docker: false } })
  })

  it('非回环来源 403（且不读 body）', async () => {
    const { request } = harness()
    const response = await request({ method: 'POST', remoteAddress: '10.0.0.5', rawBody: 'not json' })
    expect(response.status).toBe(403)
    expect(String(response.body?.error)).toContain('仅允许本机回环')
  })

  it('未知子路由 404、非 GET/POST 405', async () => {
    const { request } = harness()
    expect((await request({ sub: '/other' })).status).toBe(404)
    expect((await request({ method: 'PUT' })).status).toBe(405)
  })

  it('非法 JSON body 一律 400（含空 body）', async () => {
    const { request } = harness()
    expect((await request({ method: 'POST', rawBody: 'not json' })).status).toBe(400)
    expect((await request({ method: 'POST' })).status).toBe(400)
    expect((await request({ method: 'POST', rawBody: '[1,2]' })).status).toBe(400)
  })
})

describe('按动作豁免：enabled 免同源证明、targets 要', () => {
  it('无 Origin / Cookie 的请求能改 enabled（禁用后唯一的恢复入口）', async () => {
    const { request, state } = harness()
    const response = await request({ method: 'POST', body: { action: 'enabled', enabled: false } })
    expect(response.status).toBe(200)
    expect(state().enabled).toBe(false)
  })

  it('同一个请求改 targets 必须 403（跨站页面能加内网来源就是绕穿围栏）', async () => {
    const { request, state } = harness()
    const response = await request({
      method: 'POST',
      body: { action: 'targets.add', target: { kind: 'loki', label: 'loki', url: 'http://127.0.0.1:3100' } },
    })
    expect(response.status).toBe(403)
    expect(String(response.body?.error)).toContain('缺少同源证明')
    expect(state().targets).toHaveLength(0)
  })

  it('带同源证明（Origin 与 Host 同源）即可增删改', async () => {
    const { request, state } = harness()
    const proof = { origin: 'http://127.0.0.1:3080' }
    const added = await request({
      method: 'POST',
      ...proof,
      body: { action: 'targets.add', target: { kind: 'loki', label: 'Loki 本地', url: 'http://127.0.0.1:3100' } },
    })
    expect(added.status).toBe(200)
    expect(state().targets.map((target) => target.id)).toEqual(['loki'])
    expect(state().targets[0].label).toBe('Loki 本地')
  })
  it('targets.update 改地址保留 id；targets.remove 只删一条', async () => {
    const { request, state } = harness()
    const proof = { origin: 'http://127.0.0.1:3080' }
    await request({ method: 'POST', ...proof, body: { action: 'targets.add', target: { kind: 'loki', label: 'loki', url: 'http://127.0.0.1:3100' } } })
    await request({ method: 'POST', ...proof, body: { action: 'targets.add', target: { kind: 'docker', label: 'docker' } } })
    const updated = await request({ method: 'POST', ...proof, body: { action: 'targets.update', id: 'loki', patch: { url: 'http://127.0.0.1:3200' } } })
    expect(updated.status).toBe(200)
    expect(state().targets[0].url).toBe('http://127.0.0.1:3200')
    const removed = await request({ method: 'POST', ...proof, body: { action: 'targets.remove', id: 'loki' } })
    expect(removed.status).toBe(200)
    expect(state().targets.map((target) => target.id)).toEqual(['docker'])
  })

  it('index 从 HTTP body 一路落到配置（ES 来源写得进、也清得掉）', async () => {
    const { request, state } = harness()
    const proof = { origin: 'http://127.0.0.1:3080' }
    const added = await request({
      method: 'POST',
      ...proof,
      body: { action: 'targets.add', target: { kind: 'elasticsearch', label: 'es', url: 'https://logs.example.com:9200', index: 'app-logs-*' } },
    })
    expect(added.status).toBe(200)
    expect(state().targets[0].index).toBe('app-logs-*')
    const cleared = await request({ method: 'POST', ...proof, body: { action: 'targets.update', id: 'es', patch: { index: '' } } })
    expect(cleared.status).toBe(200)
    expect(state().targets[0].index).toBeUndefined()
  })

  it('非法值 / 未知 id 都是 400，且不改动已生效的配置', async () => {
    const { request, state } = harness()
    const proof = { origin: 'http://127.0.0.1:3080' }
    const badKind = await request({ method: 'POST', ...proof, body: { action: 'targets.add', target: { kind: 'splunk', url: 'http://127.0.0.1:3100' } } })
    expect(badKind.status).toBe(400)
    const badUrl = await request({ method: 'POST', ...proof, body: { action: 'targets.add', target: { kind: 'loki', url: 'http://169.254.169.254/' } } })
    expect(badUrl.status).toBe(400)
    const ghost = await request({ method: 'POST', ...proof, body: { action: 'targets.remove', id: 'ghost' } })
    expect(ghost.status).toBe(400)
    expect(state()).toEqual({ enabled: true, targets: [] })
  })

  it('未知动作 400；enabled 不是布尔也 400', async () => {
    const { request } = harness()
    const unknown = await request({ method: 'POST', body: { action: 'wipe' } })
    expect(unknown.status).toBe(400)
    expect(String(unknown.body?.error)).toContain('未知动作')
    const missing = await request({ method: 'POST', body: { action: 'enabled' } })
    expect(missing.status).toBe(400)
  })
})

describe('落盘', () => {
  it('没有 settings 服务时如实回报「只在本次进程内有效」', async () => {
    const { ctx, routes } = fakeContext({ webServer: true })
    apply(ctx, { announce: false })
    const { res, read } = makeResponse()
    await routes[0].handler(makeRequest({ method: 'POST', body: { action: 'enabled', enabled: false } }) as never, res as never)
    const response = read()
    expect(response.status).toBe(200)
    expect(String(response.body?.warning)).toContain('只在本次进程内有效')
  })

  it('有 settings 服务时按 entry id 写回整份来源', async () => {
    const calls: Array<{ ns: string; patch: Record<string, unknown> }> = []
    const settings = {
      describe: () => [{ ns: 'loglens', value: { enabled: true, targets: [] } }],
      update: async (ns: string, patch: Record<string, unknown>) => { calls.push({ ns, patch }) },
    }
    const { ctx, routes } = fakeContext({ webServer: true, settings: settings as unknown as Record<string, unknown> })
    apply(ctx, { announce: false })
    const { res, read } = makeResponse()
    await routes[0].handler(makeRequest({
      method: 'POST',
      origin: 'http://127.0.0.1:3080',
      body: { action: 'targets.add', target: { kind: 'loki', label: 'loki', url: 'http://127.0.0.1:3100' } },
    }) as never, res as never)
    expect(read().status).toBe(200)
    expect(calls).toHaveLength(1)
    expect(calls[0].ns).toBe('loglens')
    expect(calls[0].patch.enabled).toBe(true)
    expect((calls[0].patch.targets as Array<{ id: string }>)[0].id).toBe('loki')
  })

  it('落盘抛错时把原因回给界面（不静默丢弃）', async () => {
    const settings = {
      describe: () => [{ ns: 'loglens', value: { enabled: true, targets: [] } }],
      update: async () => { throw new Error('boom') },
    }
    const { ctx, routes } = fakeContext({ webServer: true, settings: settings as unknown as Record<string, unknown> })
    apply(ctx, { announce: false })
    const { res, read } = makeResponse()
    await routes[0].handler(makeRequest({ method: 'POST', body: { action: 'enabled', enabled: false } }) as never, res as never)
    const response = read()
    expect(response.status).toBe(200)
    expect(String(response.body?.warning)).toContain('boom')
  })
})
