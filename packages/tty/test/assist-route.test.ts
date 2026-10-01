/**
 * @hyzyn/dsh-tty — `POST /api/dsh-tty/assist` 的回归测试（0.24.0）。
 *
 * 这个路由此前**一条直接测试都没有**（只有纯函数层面的 assist-context / assist-model），
 * 于是两类问题都拦不住：
 *
 *   1. **重复调用**：客户端拦了重复点击，但两个标签页 / 竞态仍可能同时打进来，而每一发
 *      都是真金白银的一次模型调用（abort 只停客户端这一头，宿主照跑）；
 *   2. **启动路径漏字段**（tty D93，D91 的第三个实例）：`new LiveConfig` 的显式清单漏了 assist*，
 *      配置文件里写着开着、宿主里 `live` 还是 false —— 症状是「配了没反应」。
 *
 * 这里用假 PTY 开一个真会话（同 tty-run.test.ts），把路由当普通函数调用，最快也最确定。
 */
// DSH_HOME 隔离（D69）：读不到开发机上的真实授权文件
import './isolated-home.js'
import { tmpdir } from 'node:os'
import { PassThrough } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { apply } from '../src/index.js'

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

/**
 * `readJsonBody` 走的是 `for await (const chunk of req)`，所以假请求必须是**异步可迭代**的，
 * 不是塞一个 `body` 字段就行。
 */
function makeReq(body: unknown): unknown {
  const bytes = Buffer.from(JSON.stringify(body), 'utf8')
  return {
    method: 'POST',
    url: '/api/dsh-tty/assist',
    headers: { host: '127.0.0.1:3080', 'sec-fetch-site': 'same-origin' },
    socket: { remoteAddress: '127.0.0.1' },
    async *[Symbol.asyncIterator]() {
      yield bytes
    },
  }
}

interface Llm {
  calls: number
  release: () => void
}

interface Mounted {
  route: (req: unknown, res: FakeRes) => Promise<void>
  tools: Map<string, { execute?: (args: unknown) => Promise<unknown> }>
  llm: Llm
}

/** 假模型：**卡在闸门上**直到测试放行，好让「在途」这个状态稳定可断言。 */
function makeLlm(): { llm: Record<string, unknown>; state: Llm } {
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const state: Llm = { calls: 0, release }
  const llm = {
    async *stream() {
      state.calls += 1
      await gate
      yield { type: 'text-delta', text: '发生了什么：依赖没装。\n\n\u0060\u0060\u0060sh\nnpm install\n\u0060\u0060\u0060' }
      yield { type: 'finish', reason: { kind: 'stop' } }
    },
  }
  return { llm, state }
}

function mountPlugin(config: Record<string, unknown>): Mounted {
  const routes: FakeRoute[] = []
  const registered: Array<{ name: string; execute?: (args: unknown) => Promise<unknown> }> = []
  const { llm, state } = makeLlm()
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
      get: (name: string) => {
        if (name === 'llm') return llm
        if (name === 'tools') {
          return {
            register: (definition: { name: string }) => {
              registered.push(definition)
              return () => {}
            },
          }
        }
        if (name === 'subprocess') {
          return {
            spawnTerminal: async () => {
              let settleDone!: (outcome: { exitCode: number | null; signal: string | null }) => void
              const done = new Promise<{ exitCode: number | null; signal: string | null }>((resolve) => {
                settleDone = resolve
              })
              return {
                kind: 'local',
                pid: 4242,
                output: new PassThrough(),
                done,
                write: async () => {},
                resize: () => {},
                terminal: { resize: () => {}, kill: () => {} },
                terminate: async () => true,
                forceKill: () => {},
                settle: (outcome: { exitCode: number | null; signal: string | null }) => settleDone(outcome),
              }
            },
          }
        }
        return undefined
      },
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
  ;(apply as unknown as (ctx: unknown, config: unknown) => void)(root, config)
  const route = routes.find((item) => item.path === '/api/dsh-tty/assist')
  if (route === undefined) throw new Error('未注册 /api/dsh-tty/assist 路由')
  return { route: route.handler, tools: new Map(registered.map((tool) => [tool.name, tool])), llm: state }
}

async function wait(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

/** 用假 PTY 开一个真会话，拿它的 sid（路由要求会话真实存在）。 */
async function openSession(mounted: Mounted): Promise<string> {
  const opened = await mounted.tools.get('tty_open')?.execute({ cwd: tmpdir() }) as { sid?: string } | undefined
  const sid = opened?.sid
  if (typeof sid !== 'string' || sid === '') throw new Error('夹具失效：开不出会话')
  return sid
}

const ON = { assistEnabled: true, assistProvider: 'prov', assistModel: 'mod' }

describe('POST /api/dsh-tty/assist（0.24.0）', () => {
  it('配置里的开关与路由在**启动**路径上就生效（不必等 settings 热应用）', async () => {
    const mounted = mountPlugin(ON)
    const sid = await openSession(mounted)
    // 路由的返回值是 void，状态码在 res 上——必须自己拿着 res，不能 await 出参
    const res = makeRes()
    const started = mounted.route(makeReq({ sid }), res)
    await wait(20)
    mounted.llm.release()
    await started
    expect(res.status, '配置文件写着开着，路由就不该 403').toBe(200)
    // route 字段来自 resolveAssistRoute：能填出来就说明 assistProvider/assistModel 也进了 live
    expect(JSON.parse(String(res.body))).toMatchObject({ ok: true, route: 'prov/mod' })
  })

  it('同一个会话同时在途：第二发 409，模型只被调一次', async () => {
    const mounted = mountPlugin(ON)
    const sid = await openSession(mounted)
    const firstRes = makeRes()
    const first = mounted.route(makeReq({ sid }), firstRes)
    await wait(20)
    expect(mounted.llm.calls, '夹具失效：第一发还没进模型').toBe(1)

    /*
     * 第二发**不要 await 在闸门前面**：没有去重时它会跟着进模型、一起卡在闸门上，
     * 断言就只剩一句「20s 超时」——把原因糊掉了。先取计数、再放行、最后断言。
     */
    const secondRes = makeRes()
    const second = mounted.route(makeReq({ sid }), secondRes)
    await wait(20)
    const callsAfterSecond = mounted.llm.calls
    mounted.llm.release()
    await Promise.all([first, second])

    expect(callsAfterSecond, '重复请求不许再花一次模型调用').toBe(1)
    expect(secondRes.status).toBe(409)
    expect(String(secondRes.body)).toContain('正在生成中')
    expect(firstRes.status).toBe(200)
  })

  it('在途那次收尾之后又能问（finally 放行，不是把会话锁死）', async () => {
    const mounted = mountPlugin(ON)
    const sid = await openSession(mounted)
    const first = mounted.route(makeReq({ sid }), makeRes())
    await wait(20)
    mounted.llm.release()
    await first
    const again = makeRes()
    await mounted.route(makeReq({ sid }), again)
    expect(again.status, '前一次结束后应当可以再问').toBe(200)
    expect(mounted.llm.calls).toBe(2)
  })

  it('开关关着：403，且一次模型都不碰', async () => {
    const mounted = mountPlugin({})
    const sid = await openSession(mounted)
    const res = makeRes()
    await mounted.route(makeReq({ sid }), res)
    expect(res.status).toBe(403)
    expect(String(res.body)).toContain('AI 辅助未开启')
    expect(mounted.llm.calls).toBe(0)
  })

  it('会话不存在：404，且不碰模型', async () => {
    const mounted = mountPlugin(ON)
    const res = makeRes()
    await mounted.route(makeReq({ sid: 'nope' }), res)
    expect(res.status).toBe(404)
    expect(mounted.llm.calls).toBe(0)
  })

  it('路由没配全（只填一个）：409 说明要成对，且不碰模型', async () => {
    const mounted = mountPlugin({ assistEnabled: true, assistProvider: 'prov' })
    const sid = await openSession(mounted)
    const res = makeRes()
    await mounted.route(makeReq({ sid }), res)
    expect(res.status).toBe(409)
    expect(String(res.body)).toContain('成对')
    expect(mounted.llm.calls).toBe(0)
  })
})
