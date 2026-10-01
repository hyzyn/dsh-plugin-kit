/**
 * @hyzyn/dsh-mcp — 「已挂载但没连上」的判据：工具注册表里 `mcp__<serverName>__*` 的计数。
 *
 * 现场：jenkins 的地址不可达（人不在内网），卡片却显示绿色「运行中」。根因是 `liveStatus()`
 * 读的是 fiber 生命周期，而连不上时 mcp-client 的 apply 照样 resolve（`failOnStartupError`
 * 默认 false，不抛错）——于是「已挂载」被当成了「已连接」。而它同时还有代价：宿主每次启动
 * 都要为这行等一次连接尝试（地址不可达约 10s、能连上但不回应最长 60s）才判定启动完成。
 *
 * 工具是「连接成功 + tools/list」之后**唯一**会留下的产物，所以数它就等于拿到真实连接态，
 * 而且零成本（读内存注册表，不做网络探测）。
 *
 * 契约（本文件钉住）：
 * 1. `toolCount` = 注册表里以 `mcp__<serverName>__` 开头的工具数；
 * 2. **读不到** `tools` 服务时字段**缺失**（不是 0）——界面据此不下结论，绝不把「读不到」
 *    渲染成「未连接」（那是把噪音当信号）；
 * 3. 前缀归因不能被相邻名字串味（`jenkins` 不能把 `jenkins2` / `jenkins-extra` 的工具算给自己）。
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { apply, buildServersDto, spliceManagedBlock } from '../src/index.js'

type ManagedRows = Parameters<typeof spliceManagedBlock>[1]

const row = (id: string, serverName: string) => ({ id, config: { serverName, transport: 'stdio' as const, command: 'node' } })

/** 本卡托管行的 loader entry（fiber.state=2 = ACTIVE，与「apply 已 resolve」一致）。 */
const liveEntry = (id: string, serverName: string) => ({
  options: { id, name: '@deepseek-ai/dsh-mcp-client', config: { serverName } },
  fiber: { state: 2 },
})

/** 注册表。`names` 是 `ctx.tools.schemas()` 的产物（真实形状见 core 的 createMcpToolDefinition）。 */
const toolsRegistry = (names: string[]) => ({ schemas: () => names.map((name) => ({ name, description: 'x' })) })

/** buildServersDto 只用 ctx 的 loader.entries() 与 tools.schemas()。 */
const ctxWith = (entries: unknown[], tools?: unknown) =>
  ({ loader: { entries: () => entries }, ...(tools === undefined ? {} : { tools }) }) as unknown as Parameters<typeof buildServersDto>[0]

/**
 * 「属性访问会抛」的 ctx —— **真机就是这个形状**。
 *
 * cordis 里读服务有两条路，严格程度不同：
 * - `ctx.tools`（属性访问）走 Proxy 的服务解析链，服务不在本 fiber 的解析链上时**直接抛**
 *   `cannot get property "tools" without inject`；
 * - `ctx.get('tools')` 走反射层的非严格取值，取不到返回 `undefined`，不抛。
 *
 * 这不是构造出来的边角：宿主里就是这个报错把 `GET /api/dsh-mcp/servers` 变成空 400 的
 * （假 ctx 上完全看不出来，只有真机才暴露）。所以夹具必须钉住「属性会抛、get 正常」这一档。
 */
const ctxWithThrowingProperty = (entries: unknown[], registry: unknown) =>
  ({
    loader: { entries: () => entries },
    get(name: string) {
      return name === 'tools' ? registry : undefined
    },
    get tools(): never {
      throw new Error('cannot get property "tools" without inject')
    },
  }) as unknown as Parameters<typeof buildServersDto>[0]

let home = ''
const previousHome = process.env.DSH_HOME

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'dsh-mcp-toolcount-'))
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

describe('buildServersDto：toolCount = 工具注册表里属于这行的工具数', () => {
  it('【现场】active 但一个工具都没注册 → toolCount=0（卡片据此把绿色「运行中」换成「未连接」）', () => {
    writeManagedBlock([row('mcp-jenkins', 'jenkins')])

    const dto = buildServersDto(ctxWith([liveEntry('mcp-jenkins', 'jenkins')], toolsRegistry(['mcp__other__thing'])))

    expect(dto.servers[0].status).toBe('active')
    expect(dto.servers[0].toolCount).toBe(0)
  })

  it('连上了（注册了工具）→ 数出正确的个数', () => {
    writeManagedBlock([row('mcp-jenkins', 'jenkins')])

    const dto = buildServersDto(
      ctxWith([liveEntry('mcp-jenkins', 'jenkins')], toolsRegistry(['mcp__jenkins__build', 'mcp__jenkins__status', 'mcp__other__x', 'read_file'])),
    )

    expect(dto.servers[0].toolCount).toBe(2)
  })

  it('读不到 tools 服务 → 字段**缺失**（不是 0）：界面不下结论，不能把「读不到」当「未连接」', () => {
    writeManagedBlock([row('mcp-jenkins', 'jenkins')])

    const dto = buildServersDto(ctxWith([liveEntry('mcp-jenkins', 'jenkins')]))

    expect('toolCount' in dto.servers[0]).toBe(false)
  })

  it('注册表抛错也按「不知道」处理（字段缺失），不让整个列表接口 500', () => {
    writeManagedBlock([row('mcp-jenkins', 'jenkins')])

    const dto = buildServersDto(ctxWith([liveEntry('mcp-jenkins', 'jenkins')], { schemas: () => { throw new Error('boom') } }))

    expect('toolCount' in dto.servers[0]).toBe(false)
  })

  it('前缀归因不串味：jenkins 不认领 jenkins2 / jenkins-extra / 自己的子串', () => {
    writeManagedBlock([row('mcp-jenkins', 'jenkins'), row('mcp-other', 'jenkins2')])

    const dto = buildServersDto(
      ctxWith(
        [liveEntry('mcp-jenkins', 'jenkins'), liveEntry('mcp-other', 'jenkins2')],
        toolsRegistry(['mcp__jenkins2__a', 'mcp__jenkins2__b', 'mcp__jenkins-extra__c', 'mcp__jenkins__mine', 'mcp__jenkins']),
      ),
    )

    // 只有 `mcp__jenkins__mine` 算 jenkins 的（裸 `mcp__jenkins` 没有第二段分隔符，不是它的工具）
    expect(dto.servers.map((server) => server.toolCount)).toEqual([1, 2])
  })

  it('serverName 带 `-` 时前缀照样对得上（核心允许 `-`，不做替换）', () => {
    writeManagedBlock([row('mcp-context7', 'context7-mcp')])

    const dto = buildServersDto(ctxWith([liveEntry('mcp-context7', 'context7-mcp')], toolsRegistry(['mcp__context7-mcp__resolve'])))

    expect(dto.servers[0].toolCount).toBe(1)
  })

  it('【真机回归】属性访问抛 `without inject` 时，必须走 ctx.get 把数算出来', () => {
    writeManagedBlock([row('mcp-jenkins', 'jenkins')])

    const dto = buildServersDto(
      ctxWithThrowingProperty([liveEntry('mcp-jenkins', 'jenkins')], toolsRegistry(['mcp__jenkins__build', 'mcp__other__x'])),
    )

    // 反了顺序（属性在前、且不包 try）就是宿主里那个空 400：这一行是它的守卫。
    expect(dto.servers[0].toolCount).toBe(1)
  })

  it('get 与属性两条路都不可用 → 字段缺失，仍不抛（可选信号不许带崩列表）', () => {
    writeManagedBlock([row('mcp-jenkins', 'jenkins')])

    const ctx = {
      loader: { entries: () => [liveEntry('mcp-jenkins', 'jenkins')] },
      get() {
        throw new Error('reflect unavailable')
      },
      get tools(): never {
        throw new Error('cannot get property "tools" without inject')
      },
    } as unknown as Parameters<typeof buildServersDto>[0]

    const dto = buildServersDto(ctx)

    expect('toolCount' in dto.servers[0]).toBe(false)
  })
})

/**
 * 安全网：`buildServersDto` 抛错时，路由必须自己交代原因。
 *
 * 为什么单独钉：宿主 webserver 对 handler 抛错只回 **400 + 空 body**（`handle().catch` →
 * `writeHead(400)`），界面上只能看到「HTTP 400」，原因只进了宿主 stderr。真机排查那次
 * 「卡片一打开就 400」正是被这条吃掉了一个小时——所以哪怕 DTO 挂了，接口也得把话说清楚。
 */
describe('GET /api/dsh-mcp/servers：DTO 读失败时不返回空 400', () => {
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

  /** 回环 + GET：过得了围栏（围栏本身的负例在 route-gate.test.ts）。 */
  const makeReq = () => ({
    method: 'GET',
    url: '/api/dsh-mcp/servers',
    headers: { host: '127.0.0.1:3080' },
    socket: { remoteAddress: '127.0.0.1' },
  })

  it('loader 不可读（构造出的真实故障）→ 500 + 原因，而不是把异常抛给宿主', async () => {
    writeManagedBlock([row('mcp-jenkins', 'jenkins')])
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
      get tools() {
        return { schemas: () => [] }
      },
      get loader(): never {
        throw new Error('loader unavailable')
      },
    } as unknown as Parameters<typeof apply>[0]

    // apply 会打一行 mounted 日志：夹住它，别把测试输出搅浑
    const log = console.log
    console.log = () => {}
    try {
      apply(ctx, { announceToAgent: false })
    } finally {
      console.log = log
    }
    const route = routes.find((item) => item.path === '/api/dsh-mcp/servers')
    expect(route).toBeDefined()

    const res = makeRes()
    await route?.handler(makeReq(), res)

    expect(res.status).toBe(500)
    const payload = JSON.parse(String(res.body)) as { ok: boolean; error: string }
    expect(payload.ok).toBe(false)
    expect(payload.error).toContain('loader unavailable')
  })
})
