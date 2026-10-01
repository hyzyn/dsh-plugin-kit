/**
 * @hyzyn/dsh-tty — 配置往返（/api/dsh-tty/config）的回归测试：DEFECTS **D91**。
 *
 * 用户现场（2026-10-01）：设置卡片里勾上「AI 辅助 → 失败即解释」，点保存，**勾自己又弹回去了**。
 *
 * 根因不是一处，而是**同一个根因的两个实例**——「新增 volatile 字段要记得回来补一行」的显式清单：
 *   ① 客户端 `toPayload` 的**肯定清单**没带 `assistEnabled`：POST 的 body 里**压根没有它**；
 *   ② 宿主 `applyPatch` 的字段清单也没带它：就算带到了，`live` 也不会变，
 *      `snapshot()` 回给卡片的还是旧值（客户端保存成功后就拿这份响应重置表单）。
 * 两处都**静默**：保存返回 ok、界面提示「已保存」，而字段退回原样。
 *
 * 所以这里钉的是**往返不变量**：POST 一份补丁 → 响应（以及随后的 GET）里的 config 必须反映新值。
 * 这是唯一能抓住 ② 的地方：preview 夹具自己扮演宿主，没有 `applyPatch`/`live` 这一层，
 * 它只能验客户端那一半。
 */
import './isolated-home.js'
import { describe, expect, it } from 'vitest'
import { apply } from '../src/index.js'

/* ----------------------------- 最小假宿主 ----------------------------- */

interface FakeRoute {
  kind: string
  path: string
  handler: (req: unknown, res: unknown) => Promise<void>
}

interface FakeRes {
  status: number
  endBody: string | undefined
  writeHead(status: number, headers?: Record<string, string>): void
  end(body?: string): void
}

function makeRes(): FakeRes {
  const res: FakeRes = {
    status: 0,
    endBody: undefined,
    writeHead(status) { res.status = status },
    end(body) { if (body !== undefined) res.endBody = body },
  }
  return res
}

function makeReq(url: string, method: string, body?: unknown): unknown {
  const payload = body === undefined ? '' : JSON.stringify(body)
  const chunks = payload === '' ? [] : [Buffer.from(payload)]
  return {
    method,
    url,
    headers: { host: '127.0.0.1:3092', 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' },
    socket: { remoteAddress: '127.0.0.1' },
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) yield chunk
    },
  }
}

interface Harness {
  callPath(path: string, method: string, body?: unknown): Promise<{ status: number; json: Record<string, unknown> }>
}

function mount(config: Record<string, unknown> = {}): Harness {
  const routes: FakeRoute[] = []
  const makeChild = (names: string[]): Record<string, unknown> => {
    const child: Record<string, unknown> = {
      logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
      effect: (callback: () => unknown) => { callback(); return () => {} },
      inject: (childNames: string[], cb: (ctx: unknown) => void) => { cb(makeChild(childNames)); return () => {} },
      on: () => () => {},
      events: { on: () => () => {} },
      get: () => undefined,
    }
    if (names.includes('webServer')) {
      child.webServer = {
        register: (route: FakeRoute) => { routes.push(route); return () => {} },
        registerUpgrade: () => () => {},
      }
    }
    if (names.includes('systemPrompt')) child.systemPrompt = { section: () => () => {}, context: () => () => {} }
    return child
  }
  const root = makeChild([])
  root.inject = (names: string[], cb: (ctx: unknown) => void) => { cb(makeChild(names)); return () => {} }
  ;(apply as unknown as (ctx: unknown, config: unknown) => void)(root, config)
  return {
    async callPath(path, method, body) {
      const target = routes.find((item) => item.kind === 'exact' && item.path === path)
      if (target === undefined) throw new Error('未注册路由: ' + path)
      const res = makeRes()
      await target.handler(makeReq(path, method, body), res)
      return { status: res.status, json: res.endBody === undefined ? {} : (JSON.parse(res.endBody) as Record<string, unknown>) }
    },
  }
}

const CONFIG_PATH = '/api/dsh-tty/config'
const configOf = (json: Record<string, unknown>): Record<string, unknown> =>
  (json.config ?? {}) as Record<string, unknown>

/* ----------------------------- 往返 ----------------------------- */

describe('/config 往返：POST 的字段必须反映在响应快照里（D91）', () => {
  it('AI 辅助三件套：开着保存后**仍然是开着的**（用户现场就是这一条）', async () => {
    const h = mount()
    const res = await h.callPath(CONFIG_PATH, 'POST', { assistEnabled: true, assistProvider: 'acme', assistModel: 'big-1' })
    expect(res.status).toBe(200)
    // 客户端保存成功后就拿这份 config 重置表单（见 save()）——它回旧值，勾就弹回去
    expect(configOf(res.json)).toMatchObject({ assistEnabled: true, assistProvider: 'acme', assistModel: 'big-1' })
    const again = await h.callPath(CONFIG_PATH, 'GET')
    expect(configOf(again.json)).toMatchObject({ assistEnabled: true, assistProvider: 'acme', assistModel: 'big-1' })
  })

  it('关掉再打开、打开再关掉，来回都跟着走（不是「只能开不能关」的半截状态）', async () => {
    const h = mount()
    await h.callPath(CONFIG_PATH, 'POST', { assistEnabled: true })
    expect(configOf((await h.callPath(CONFIG_PATH, 'GET')).json).assistEnabled).toBe(true)
    await h.callPath(CONFIG_PATH, 'POST', { assistEnabled: false })
    expect(configOf((await h.callPath(CONFIG_PATH, 'GET')).json).assistEnabled).toBe(false)
  })

  it('清空模型路由：空串是「清空」这个真实意图，必须真的落到快照上', async () => {
    const h = mount()
    await h.callPath(CONFIG_PATH, 'POST', { assistProvider: 'acme', assistModel: 'big-1' })
    await h.callPath(CONFIG_PATH, 'POST', { assistProvider: '', assistModel: '' })
    expect(configOf((await h.callPath(CONFIG_PATH, 'GET')).json)).toMatchObject({ assistProvider: '', assistModel: '' })
  })

  it('对照组：其它 volatile 字段同样往返（说明这不是「只有 assist 特判」）', async () => {
    const h = mount()
    await h.callPath(CONFIG_PATH, 'POST', { statsEnabled: false, shellIntegration: false, endOnPageClose: true })
    expect(configOf((await h.callPath(CONFIG_PATH, 'GET')).json)).toMatchObject({
      statsEnabled: false,
      shellIntegration: false,
      endOnPageClose: true,
    })
  })

  it('成对规则不在这里拦：只填一个也存得下去（卡片是逐字段保存的，中间态必须能保存）', async () => {
    const h = mount()
    const res = await h.callPath(CONFIG_PATH, 'POST', { assistProvider: 'acme' })
    expect(res.status).toBe(200)
    expect(configOf(res.json).assistProvider).toBe('acme')
  })
})

describe('/config 的拒绝面：客户端「否定清单」的另一半', () => {
  /*
   * 客户端 0.24.0 起把 payload 从**肯定清单**改成**否定清单**（除了几个派生键，其余默认提交）。
   * 这条不变量是那个改动的前提：**快照里的派生键确实会被明确拒绝**——否则它们会跟着 payload
   * 一起提交，把每一次保存都变成 400。
   */
  it('快照里的派生键不是配置项，提交它们会被点名拒绝', async () => {
    const h = mount()
    const derived: Array<[string, unknown]> = [
      ['toolsRegistered', true],
      ['platform', 'linux'],
      ['allowProxyCommandGranted', true],
      ['allowProxyCommandGrantSource', 'file'],
      ['allowProxyCommandGrantedAt', 1],
    ]
    for (const [key, value] of derived) {
      const res = await h.callPath(CONFIG_PATH, 'POST', { [key]: value })
      expect(res.status).toBe(400)
      expect(String(res.json.error)).toContain('未知配置项: ' + key)
    }
  })
})
