/**
 * @hyzyn/dsh-mcp — POST /api/dsh-mcp/restart：重启一条托管实例（`fiber.restart()`）。
 *
 * 现场：`reconnect` 的预算用尽后实例**放弃重连**（README 排障表里那条最常见的误判点），
 * 而热加载只认补丁文件的改动——用户为了「让它重连一次」得去改一行配置再改回来。这条路由就是
 * 那个动作的入口：不写文件、不改配置，只重跑**本卡已托管**的那一条 entry。
 *
 * 契约（本文件按**出口**钉住，不只验 happy path）：
 * - 200 `{ ok: true, settled, warning? , ...buildServersDto(ctx) }`——超时不算失败，
 *   回 200 + `settled:false` + warning（此刻重启**已经发出**，报失败会让用户重试叠第二次重启）；
 * - 400：非法 id / 不在托管区块 / 该行已停用 / loader 里找不到 entry / fiber 还没起来；
 * - 500：`fiber.restart()` 抛出。
 *
 * 全部用假 ctx 与假 fiber，**不起真宿主**（真机那条在 scripts/ 的 live 脚本层）。
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { apply, restartManagedEntry, spliceManagedBlock } from '../src/index.js'

type ManagedRows = Parameters<typeof spliceManagedBlock>[1]

const row = (id: string, serverName: string, extra: { disabled?: boolean } = {}) => ({
  id,
  config: { serverName, transport: 'stdio' as const, command: 'node' },
  ...(extra.disabled === true ? { disabled: true } : {}),
})

/**
 * 一条已挂载的 loader entry（形状照 cordis 4.1.0：`{ options, fiber }`）。
 *
 * `fibre.restart()` 在 cordis 里的语义是「重跑这条 entry 的 apply」——单测里它就是一个
 * 可观察的假函数，`calls` 用来看**拒绝分支有没有误调**（那才是真机上的破坏）。
 */
function liveEntry(id: string, serverName: string, restart: () => Promise<void> | void = async () => {}) {
  const state: { calls: number } = { calls: 0 }
  const entry = {
    options: { id, name: '@deepseek-ai/dsh-mcp-client', config: { serverName } },
    fiber: {
      uid: 1,
      state: 2,
      restart: async () => {
        state.calls += 1
        return await restart()
      },
    },
  }
  return { entry, state }
}

/**
 * restartManagedEntry 只用 ctx 的 loader（`entries()`）；`ctx.get` 是未声明服务的反射层取法。
 *
 * `throwingProperty` 钉的是宿主真实形状：cordis 里 `ctx.loader`（属性访问）走严格解析链，
 * 服务不在本 fiber 链上时**直接抛**；`ctx.get('loader')` 不抛、取不到返回 undefined。
 * 访问器必须用 `defineProperty` 装（写成对象字面量再 spread 会在构造时就把 getter 跑掉）。
 */
/**
 * `options.tools`：注册表里的工具名（`ctx.tools.schemas()` 的产物）。
 *
 * `restartManagedEntry` 用**注册表**判「连上没连上」——这是它与 `restart()` 返回值的唯一区别，
 * 所以夹具必须能表达「重启了但仍无工具」这一档（真机上人不在内网时就是它）。
 */
const ctxWith = (entries: unknown[], options: { throwingProperty?: boolean; tools?: string[] } = {}) => {
  const tools = { schemas: () => (options.tools ?? []).map((name) => ({ name, description: 'x' })) }
  const ctx: Record<string, unknown> = {
    loader: { entries: () => entries },
    tools,
    get(name: string) {
      if (name === 'loader') return { entries: () => entries }
      return name === 'tools' ? tools : undefined
    },
  }
  if (options.throwingProperty === true) {
    Object.defineProperty(ctx, 'loader', {
      configurable: true,
      get(): never {
        throw new Error('cannot get property "loader" without inject')
      },
    })
  }
  return ctx as unknown as Parameters<typeof restartManagedEntry>[0]
}

let home = ''
const previousHome = process.env.DSH_HOME

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'dsh-mcp-restart-'))
  process.env.DSH_HOME = home
})

afterEach(() => {
  if (previousHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = previousHome
  rmSync(home, { recursive: true, force: true })
})

function writeManagedBlock(rows: ManagedRows): void {
  writeFileSync(join(home, 'cordis.patch.yml'), spliceManagedBlock('# dsh home patch layer\n', rows), 'utf8')
}

describe('restartManagedEntry：七个出口', () => {
  it('① 成功且工具真的回来了：connection=connected、toolCount>0', async () => {
    writeManagedBlock([row('mcp-jenkins', 'jenkins')])
    const { entry, state } = liveEntry('mcp-jenkins', 'jenkins')

    const result = await restartManagedEntry(ctxWith([entry], { tools: ['mcp__jenkins__triggerBuild'] }), 'mcp-jenkins')

    expect(result).toEqual({ ok: true, settled: true, connection: 'connected', toolCount: 1 })
    expect(state.calls).toBe(1)
  })

  /**
   * ⑦′ 真机事故（2026-11-18，截图现场）：「重启成功了」与「工具一个都没回来」可以**同时为真**。
   *
   * `fiber.restart()` 只等到 apply 返回，而 mcp-client 连不上时 apply 照常 resolve
   * （`failOnStartupError` 默认 false）。原来这里无条件报成功，于是卡片弹「已重连，
   * 工具会重新注册」而同一行仍显示「未连接 / 工具 0」——**提示在撒谎**。
   * 判据改成「注册表里真有工具」，这个出口才能被区分出来。
   */
  it('⑦′ 重启跑完了但工具始终没回来（连不上）→ connection=pending，不谎报已重连', async () => {
    writeManagedBlock([row('mcp-remote', 'remote')])
    const { entry, state } = liveEntry('mcp-remote', 'remote')

    // 注册表里没有该 server 的任何工具：等价于「重启了，但仍未连上」
    const result = await restartManagedEntry(ctxWith([entry], { tools: [] }), 'mcp-remote', 120, 0)

    expect(result).toEqual({ ok: true, settled: true, connection: 'pending', toolCount: 0 })
    expect(state.calls).toBe(1)
  })

  it('② 非法 id → 400，且一次 restart 都不调', async () => {
    writeManagedBlock([row('mcp-jenkins', 'jenkins')])
    const { entry, state } = liveEntry('mcp-jenkins', 'jenkins')
    const ctx = ctxWith([entry])

    for (const id of ['', 'jenkins', 'mcp-JENKINS', 'mcp-' + 'a'.repeat(65)]) {
      const result = await restartManagedEntry(ctx, id)
      expect(result.ok).toBe(false)
      expect(result).toMatchObject({ status: 400 })
      expect((result as { error: string }).error).toContain('非法 id')
    }
    expect(state.calls).toBe(0)
  })

  it('③ 不在托管区块里 → 400（loader 里有同名 entry 也不行：只认本卡的行）', async () => {
    writeManagedBlock([row('mcp-jenkins', 'jenkins')])
    const { entry, state } = liveEntry('mcp-other', 'other')

    const result = await restartManagedEntry(ctxWith([entry]), 'mcp-other')

    expect(result).toMatchObject({ ok: false, status: 400 })
    expect((result as { error: string }).error).toContain('不是本插件托管的行')
    expect(state.calls).toBe(0)
  })

  it('④ 该行已停用 → 400，不把它强制拉起（restart 不看 disabled）', async () => {
    writeManagedBlock([row('mcp-jenkins', 'jenkins', { disabled: true })])
    const { entry, state } = liveEntry('mcp-jenkins', 'jenkins')

    const result = await restartManagedEntry(ctxWith([entry]), 'mcp-jenkins')

    expect(result).toMatchObject({ ok: false, status: 400 })
    expect((result as { error: string }).error).toContain('已停用')
    expect(state.calls).toBe(0)
  })

  it('④-b 文件里没停用、但 loader entry 是 disabled（HMR 窗口）→ 仍按停用拒', async () => {
    writeManagedBlock([row('mcp-jenkins', 'jenkins')])
    const { entry, state } = liveEntry('mcp-jenkins', 'jenkins')
    const disabledEntry = { ...entry, disabled: true }

    const result = await restartManagedEntry(ctxWith([disabledEntry]), 'mcp-jenkins')

    expect(result).toMatchObject({ ok: false, status: 400 })
    expect((result as { error: string }).error).toContain('已停用')
    expect(state.calls).toBe(0)
  })

  it('⑤ fiber 缺失 / uid===null（还没起来）→ 400，不调 restart（它会抛 INACTIVE_EFFECT）', async () => {
    writeManagedBlock([row('mcp-jenkins', 'jenkins')])
    const shapes = [
      { options: { id: 'mcp-jenkins' } }, // fiber 根本没有
      { options: { id: 'mcp-jenkins' }, fiber: null },
      { options: { id: 'mcp-jenkins' }, fiber: { uid: null } }, // cordis：uid 被清 = 已 dispose
    ]

    for (const shape of shapes) {
      const result = await restartManagedEntry(ctxWith([shape]), 'mcp-jenkins')
      expect(result).toMatchObject({ ok: false, status: 400 })
      expect((result as { error: string }).error).toContain('还没起来')
    }
  })

  it('⑤-b loader 里找不到 entry（刚保存，热加载还没跑完）→ 400', async () => {
    writeManagedBlock([row('mcp-jenkins', 'jenkins')])

    const result = await restartManagedEntry(ctxWith([]), 'mcp-jenkins')

    expect(result).toMatchObject({ ok: false, status: 400 })
    expect((result as { error: string }).error).toContain('loader 里找不到')
  })

  it('⑥ restart() 抛出 → 500，原因原样带上', async () => {
    writeManagedBlock([row('mcp-jenkins', 'jenkins')])
    const { entry } = liveEntry('mcp-jenkins', 'jenkins', async () => {
      throw new Error('spawn ENOENT')
    })

    const result = await restartManagedEntry(ctxWith([entry]), 'mcp-jenkins')

    expect(result).toMatchObject({ ok: false, status: 500 })
    expect((result as { error: string }).error).toBe('重启失败: spawn ENOENT')
  })

  it('⑥-b fiber 上没有 restart（宿主版本不符）→ 500，不是静默成功', async () => {
    writeManagedBlock([row('mcp-jenkins', 'jenkins')])
    const entry = { options: { id: 'mcp-jenkins' }, fiber: { uid: 1, state: 2 } }

    const result = await restartManagedEntry(ctxWith([entry]), 'mcp-jenkins')

    expect(result).toMatchObject({ ok: false, status: 500 })
    expect((result as { error: string }).error).toContain('没有 restart()')
  })

  it('⑦ 超时未 settle → ok:true + settled:false（不报失败），预算可注入', async () => {
    writeManagedBlock([row('mcp-jenkins', 'jenkins')])
    let started = false
    const { entry, state } = liveEntry('mcp-jenkins', 'jenkins', () => {
      started = true
      return new Promise<void>(() => {}) // 永不 settle
    })

    const result = await restartManagedEntry(ctxWith([entry]), 'mcp-jenkins', 20, 0)

    expect(result).toEqual({ ok: true, settled: false, connection: 'pending', toolCount: 0 })
    expect(state.calls).toBe(1)
    expect(started).toBe(true)
  })

  it('默认预算就是 RESTART_TIMEOUT_MS（25s）：不传第三参时不会用 0 立刻超时', async () => {
    writeManagedBlock([row('mcp-jenkins', 'jenkins')])
    const { entry } = liveEntry('mcp-jenkins', 'jenkins')

    // 同步 resolve 的 restart 在任何正预算下都跑得完；这条钉的是「默认值没被写成 0/undefined」
    await expect(restartManagedEntry(ctxWith([entry]), 'mcp-jenkins', undefined, 0))
      .resolves.toEqual({ ok: true, settled: true, connection: 'pending', toolCount: 0 })
  })

  it('ctx.loader 属性访问抛（宿主真实形状）→ 走 ctx.get 仍能找到 entry', async () => {
    writeManagedBlock([row('mcp-jenkins', 'jenkins')])
    const { entry, state } = liveEntry('mcp-jenkins', 'jenkins')

    const result = await restartManagedEntry(ctxWith([entry], { throwingProperty: true }), 'mcp-jenkins', undefined, 0)

    expect(result).toEqual({ ok: true, settled: true, connection: 'pending', toolCount: 0 })
    expect(state.calls).toBe(1)
  })
})

/**
 * 路由层：`POST /api/dsh-mcp/restart` 的状态码与**返回体字段名**。
 *
 * 字段名是客户端半体逐字引用的契约（`settled` / `warning` / `error` / `servers`），
 * 所以这里断言的是**布线**，纯判据已在上面按出口钉过。
 */
describe('POST /api/dsh-mcp/restart：路由布线', () => {
  const makeRes = () => {
    const res = {
      status: 0 as number,
      body: undefined as string | undefined,
      writeHead(status: number) {
        res.status = status
      },
      end(body?: string) {
        if (body !== undefined) res.body = body
      },
    }
    return res
  }

  /** 回环 + POST + 同源证明：过得了围栏（围栏自己的负例在 route-gate.test.ts）。 */
  const makeReq = (body: unknown) => {
    const chunks = [Buffer.from(JSON.stringify(body), 'utf8')]
    return {
      method: 'POST',
      url: '/api/dsh-mcp/restart',
      headers: { host: '127.0.0.1:3080', 'sec-fetch-site': 'same-origin' },
      socket: { remoteAddress: '127.0.0.1' },
      async *[Symbol.asyncIterator]() {
        for (const chunk of chunks) yield chunk
      },
    }
  }

  /** 走 apply 把三条路由收集下来（与 tool-count.test.ts 的夹具同款：不起真宿主）。 */
  function mountRoutes(ctxExtras: Record<string, unknown>) {
    const routes: Array<{ path: string; handler: (req: unknown, res: unknown) => Promise<void> }> = []
    const ctx = {
      inject(deps: string[], callback: (inner: unknown) => void) {
        if (deps.includes('webServer')) {
          callback({
            effect: (fn: () => void) => {
              fn()
              return () => {}
            },
            webServer: {
              register(route: { path: string; handler: (req: unknown, res: unknown) => Promise<void> }) {
                routes.push(route)
                return () => {}
              },
            },
          })
        }
      },
      effect: (fn: () => void) => {
        fn()
        return () => {}
      },
      logger: { warn() {} },
      ...ctxExtras,
    } as unknown as Parameters<typeof apply>[0]
    const log = console.log
    console.log = () => {}
    try {
      apply(ctx, { announceToAgent: false })
    } finally {
      console.log = log
    }
    const route = routes.find((item) => item.path === '/api/dsh-mcp/restart')
    expect(route).toBeDefined()
    return route as { path: string; handler: (req: unknown, res: unknown) => Promise<void> }
  }

  /**
   * 两条布线用例，对应**两种真实结局**（都必须是 200 + DTO）：
   *
   * - `connected`：工具真的回到了注册表 → 不带 `warning`（提示语走客户端那句「已重连」）；
   * - `pending`：重启发出去了但一个工具都没有（人不在内网）→ **必须带 warning**，
   *   且 `connection` 字段让客户端能说「仍未连上」。2026-11-18 真机事故说的就是这个出口：
   *   以前两种结局都只回 `settled:true`，客户端只能一律报「已重连」。
   */
  it('成功且真连上 → 200 + connection=connected + DTO，且**没有** warning', async () => {
    writeManagedBlock([row('mcp-jenkins', 'jenkins')])
    const { entry } = liveEntry('mcp-jenkins', 'jenkins')
    const route = mountRoutes({
      loader: { entries: () => [entry] },
      tools: { schemas: () => [{ name: 'mcp__jenkins__triggerBuild', description: 'x' }] },
    })

    const res = makeRes()
    await route.handler(makeReq({ id: 'mcp-jenkins' }), res)

    expect(res.status).toBe(200)
    const payload = JSON.parse(String(res.body)) as Record<string, unknown>
    expect(payload.ok).toBe(true)
    expect(payload.settled).toBe(true)
    expect(payload.connection).toBe('connected')
    expect(payload.toolCount).toBe(1)
    expect('warning' in payload).toBe(false)
    expect(Array.isArray(payload.servers)).toBe(true)
    expect(payload.patchFile).toBeTypeOf('string')
    expect(payload.toolBudget).toBeTypeOf('number')
  })

  it('重启了但仍未连上 → 200 + connection=pending + warning（不谎报已重连）', async () => {
    writeManagedBlock([row('mcp-remote', 'remote')])
    const { entry } = liveEntry('mcp-remote', 'remote')
    const route = mountRoutes({
      loader: { entries: () => [entry] },
      tools: { schemas: () => [] },
    })

    const res = makeRes()
    await route.handler(makeReq({ id: 'mcp-remote' }), res)

    expect(res.status).toBe(200)
    const payload = JSON.parse(String(res.body)) as Record<string, unknown>
    expect(payload.ok).toBe(true)
    expect(payload.connection).toBe('pending')
    expect(payload.toolCount).toBe(0)
    expect(String(payload.warning)).toContain('仍未连上')
    expect(Array.isArray(payload.servers)).toBe(true)
  })

  it('拒绝 → 400 且 body 只有 error（不夹带 DTO）', async () => {
    writeManagedBlock([row('mcp-jenkins', 'jenkins')])
    const route = mountRoutes({ loader: { entries: () => [] } })

    const res = makeRes()
    await route.handler(makeReq({ id: 'mcp-jenkins' }), res)

    expect(res.status).toBe(400)
    const payload = JSON.parse(String(res.body)) as Record<string, unknown>
    expect(Object.keys(payload)).toEqual(['error'])
    expect(payload.error).toBeTypeOf('string')
  })

  it('restart 抛出 → 500 + error 前缀「重启失败: 」', async () => {
    writeManagedBlock([row('mcp-jenkins', 'jenkins')])
    const { entry } = liveEntry('mcp-jenkins', 'jenkins', async () => {
      throw new Error('boom')
    })
    const route = mountRoutes({ loader: { entries: () => [entry] } })

    const res = makeRes()
    await route.handler(makeReq({ id: 'mcp-jenkins' }), res)

    expect(res.status).toBe(500)
    const payload = JSON.parse(String(res.body)) as { error: string }
    expect(payload.error).toBe('重启失败: boom')
  })

  it('body 不是合法 JSON → 400 invalid JSON body', async () => {
    writeManagedBlock([row('mcp-jenkins', 'jenkins')])
    const route = mountRoutes({ loader: { entries: () => [] } })

    const req = {
      method: 'POST',
      url: '/api/dsh-mcp/restart',
      headers: { host: '127.0.0.1:3080', 'sec-fetch-site': 'same-origin' },
      socket: { remoteAddress: '127.0.0.1' },
      async *[Symbol.asyncIterator]() {
        yield Buffer.from('{not json', 'utf8')
      },
    }
    const res = makeRes()
    await route.handler(req, res)

    expect(res.status).toBe(400)
    expect(JSON.parse(String(res.body))).toEqual({ error: 'invalid JSON body' })
  })
})
