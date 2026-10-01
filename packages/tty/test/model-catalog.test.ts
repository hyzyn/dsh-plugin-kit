/**
 * @hyzyn/dsh-tty — 模型候选目录（0.24.0）的回归测试。
 *
 * 设置卡片里 provider / model 两栏从「纯手输」改成「可输可选」，候选来自宿主的 llm 服务。
 * 两条硬契约：
 *
 *   1. **目录只是建议，不是白名单**。dsh-llm 明写「核心路由接受未列出的 model id」，而且
 *      「基础空目录、不提供 GUI 选择」是**合法**状态。所以每条失败路径（方法缺失 / 抛错 /
 *      挂住不返回 / 返回形状不对）都必须收敛成**空候选**——输入框照旧手输，
 *      绝不放任「取候选失败」变成「配不了路由」。
 *   2. **不许把设置卡片吊住**：`listModels` 背后是远端目录（pi-ai 那一族会去问服务端点），
 *      必须**有超时**——打开设置像卡死，比「没有候选」糟得多。
 */
// DSH_HOME 隔离（D69）：读不到开发机上的真实授权文件
import './isolated-home.js'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { apply, listGroupsOf, listModelsOf, listProvidersOf } from '../src/index.js'

describe('模型候选目录：取不到候选绝不放任成「配不了」', () => {
  it('服务没有这两个方法（没装 llm / 老宿主）：空候选，不抛', () => {
    expect(listProvidersOf(undefined)).toEqual([])
    expect(listProvidersOf(null)).toEqual([])
    expect(listProvidersOf({})).toEqual([])
    expect(listProvidersOf({ listProviders: 'not a function' })).toEqual([])
  })

  it('listProviders 抛错：空候选（不是异常）', () => {
    expect(listProvidersOf({
      listProviders: () => {
        throw new Error('boom')
      },
    })).toEqual([])
  })

  it('归一化：丢掉没有 id 的、按 id 去重、name 缺省用 id、空白 id 丢掉', () => {
    expect(listProvidersOf({
      listProviders: () => [
        { id: 'a', name: 'A' },
        { id: 'a', name: 'A again' },
        { name: 'no id' },
        null,
        { id: '  b  ' },
        { id: '   ' },
      ],
    })).toEqual([{ id: 'a', name: 'A' }, { id: 'b', name: 'b' }])
  })

  it('listModels 抛错 → 空', async () => {
    await expect(listModelsOf({
      listModels: async () => {
        throw new Error('provider 401')
      },
    }, 'p')).resolves.toEqual([])
  })

  it('listModels 挂住不返回 → 到点放弃（设置卡片不会被吊住）', async () => {
    const started = Date.now()
    const result = await listModelsOf({ listModels: () => new Promise(() => {}) }, 'p', 30)
    expect(result).toEqual([])
    expect(Date.now() - started).toBeLessThan(2000)
  })

  it('返回值不是数组（远端给了个对象 / 字符串）→ 空', async () => {
    await expect(listModelsOf({ listModels: async () => ({ models: ['x'] }) }, 'p')).resolves.toEqual([])
    await expect(listModelsOf({ listModels: async () => 'nope' }, 'p')).resolves.toEqual([])
  })

  it('正常路径：id / name 归一化后返回（name 空则回落 id）', async () => {
    await expect(listModelsOf({
      listModels: async () => [
        { provider: 'p', id: 'm1', name: 'Model One' },
        { provider: 'p', id: 'm2', name: '' },
      ],
    }, 'p')).resolves.toEqual([{ id: 'm1', name: 'Model One' }, { id: 'm2', name: 'm2' }])
  })
})

describe('listGroupsOf：一个渠道坏掉不许把整张候选表清空', () => {
  it('并行取回每个渠道的模型', async () => {
    const groups = await listGroupsOf(
      { listModels: async (provider: string) => [{ id: provider + '-m', name: provider + '-m' }] },
      [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }],
    )
    expect(groups).toEqual([
      { id: 'a', name: 'A', models: [{ id: 'a-m', name: 'a-m' }] },
      { id: 'b', name: 'B', models: [{ id: 'b-m', name: 'b-m' }] },
    ])
  })

  it('其中一个渠道抛错：它自己空，别的照常列出（用户至少还能从别的渠道选）', async () => {
    const groups = await listGroupsOf({
      listModels: async (provider: string) => {
        if (provider === 'bad') throw new Error('provider unreachable')
        return [{ id: 'ok-model', name: 'ok-model' }]
      },
    }, [{ id: 'bad', name: 'Bad' }, { id: 'good', name: 'Good' }])
    expect(groups).toEqual([
      { id: 'bad', name: 'Bad', models: [] },
      { id: 'good', name: 'Good', models: [{ id: 'ok-model', name: 'ok-model' }] },
    ])
  })

  it('没有渠道：空表（不是异常）', async () => {
    await expect(listGroupsOf({ listModels: async () => [] }, [])).resolves.toEqual([])
  })
})

interface FakeRoute {
  kind: string
  path: string
  handler: (req: unknown, res: unknown) => Promise<void>
}

interface FakeRes {
  status: number
  body: string | undefined
  writeHead(status: number): void
  end(body?: string): void
}

function makeRes(): FakeRes {
  const res: FakeRes = {
    status: 0,
    body: undefined,
    writeHead(status) {
      res.status = status
    },
    end(body) {
      if (body !== undefined) res.body = body
    },
  }
  return res
}

function makeReq(method: string, search: string): unknown {
  return {
    method,
    url: '/api/dsh-tty/model-catalog' + search,
    headers: { host: '127.0.0.1:3080', 'sec-fetch-site': 'same-origin' },
    socket: { remoteAddress: '127.0.0.1' },
  }
}

/** 挂载插件并取出 /api/dsh-tty/model-catalog 路由；llm 用假件（不需要 PTY：这条路由不带会话）。 */
function mountPlugin(llm: unknown): (req: unknown, res: FakeRes) => Promise<void> {
  const routes: FakeRoute[] = []
  const makeChild = (names: string[]): Record<string, unknown> => {
    const child: Record<string, unknown> = {
      logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
      effect: (callback: () => unknown) => {
        callback()
        return () => {}
      },
      inject: (childNames: string[], cb: (ctx: unknown) => void) => {
        cb(makeChild(childNames))
        return () => {}
      },
      on: () => () => {},
      events: { on: () => () => {} },
      get: (name: string) => (name === 'llm' ? llm : undefined),
    }
    if (names.includes('webServer')) {
      child.webServer = {
        register: (route: FakeRoute) => {
          routes.push(route)
          return () => {}
        },
        registerUpgrade: () => () => {},
      }
    }
    if (names.includes('settings')) child.settings = { describe: () => [], update: async () => {}, configure: () => () => {}, get: () => undefined }
    if (names.includes('systemPrompt')) child.systemPrompt = { section: () => () => {}, context: () => () => {} }
    if (names.includes('credentials')) child.credentials = { resolve: async () => ({ value: undefined }) }
    return child
  }
  const root = makeChild([])
  root.inject = (names: string[], cb: (ctx: unknown) => void) => {
    cb(makeChild(names))
    return () => {}
  }
  ;(apply as unknown as (ctx: unknown, config: unknown) => void)(root, {})
  const route = routes.find((item) => item.path === '/api/dsh-tty/model-catalog')
  if (route === undefined) throw new Error('未注册 /api/dsh-tty/model-catalog 路由')
  return route.handler
}

let previousHome: string | undefined
beforeEach(() => {
  previousHome = process.env.HOME
})
afterEach(() => {
  if (previousHome === undefined) delete process.env.HOME
  else process.env.HOME = previousHome
})

const FAKE_LLM = {
  listProviders: () => [{ id: 'mock-provider', name: 'Mock Provider' }],
  listModels: async (provider: string) => [{ provider, id: 'mock-fast', name: 'mock-fast' }],
}

describe('GET /api/dsh-tty/model-catalog', () => {
  it('providers 恒有；models 按 provider 取，并回带 provider', async () => {
    const handler = mountPlugin(FAKE_LLM)
    const res = makeRes()
    await handler(makeReq('GET', '?provider=mock-provider'), res)
    expect(res.status).toBe(200)
    expect(JSON.parse(String(res.body))).toMatchObject({
      ok: true,
      available: true,
      providers: [{ id: 'mock-provider', name: 'Mock Provider' }],
      models: [{ id: 'mock-fast', name: 'mock-fast' }],
      provider: 'mock-provider',
    })
  })

  it('不带 provider：一次往返把**每个**渠道的模型都取回来（groups）', async () => {
    const asked: string[] = []
    const handler = mountPlugin({
      listProviders: () => [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }],
      listModels: async (provider: string) => {
        asked.push(provider)
        return [{ provider, id: provider + '-m', name: provider + '-m' }]
      },
    })
    const res = makeRes()
    await handler(makeReq('GET', ''), res)
    expect(res.status).toBe(200)
    expect(JSON.parse(String(res.body))).toMatchObject({
      ok: true,
      groups: [
        { id: 'a', name: 'A', models: [{ id: 'a-m', name: 'a-m' }] },
        { id: 'b', name: 'B', models: [{ id: 'b-m', name: 'b-m' }] },
      ],
      provider: '',
    })
    expect(asked.sort(), '候选表要一次把每个渠道都问到').toEqual(['a', 'b'])
  })

  it('listModels 抛错：providers 照样列出（一个坏适配器不许把整张卡片清空）', async () => {
    const handler = mountPlugin({
      listProviders: FAKE_LLM.listProviders,
      listModels: async () => {
        throw new Error('provider unreachable')
      },
    })
    const res = makeRes()
    await handler(makeReq('GET', '?provider=mock-provider'), res)
    expect(res.status).toBe(200)
    expect(JSON.parse(String(res.body))).toMatchObject({
      ok: true,
      providers: [{ id: 'mock-provider', name: 'Mock Provider' }],
      models: [],
    })
  })

  it('宿主没有 llm 服务：available=false、候选为空，仍是 200（输入框照旧手输）', async () => {
    const handler = mountPlugin(undefined)
    const res = makeRes()
    await handler(makeReq('GET', '?provider=whatever'), res)
    expect(res.status).toBe(200)
    expect(JSON.parse(String(res.body))).toMatchObject({ ok: true, available: false, providers: [], models: [] })
  })

  it('非 GET → 405', async () => {
    const handler = mountPlugin(FAKE_LLM)
    const res = makeRes()
    await handler(makeReq('POST', ''), res)
    expect(res.status).toBe(405)
    expect(String(res.body)).toContain('method not allowed')
  })
})
