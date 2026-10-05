/**
 * 快速开始的**静态预检**：`POST /api/dsh-devdata/preflight`。
 *
 * ## 这条路由要钉的是什么
 *
 * 它是「快速开始」那一区在动手之前唯一的**静态**判据面，所以它同时是三样东西：
 *
 *   1. **不接受浏览器自报事实的地方**：请求只认 `{ root, project, target }`，`target` 是
 *      **已保存目标的 id**。作用域、引擎、`host`/`port`、能力声明一律由宿主从 `live.targets`
 *      现取——所以本文件有一整组「伪造字段」用例（`scopeDirs` / `engine` / `host` / `port` /
 *      `writeCapability` / `enabled` / `mode` / `readOnly` / `connection` / `targets`），
 *      它们必须**逐条被拒**，而且被拒之后**没有任何一条**来自浏览器的值进了判定；
 *   2. **纯静态**：不读盘（不查目录是否存在）、不联网、不保存、不改环境、不申请能力、不进审计。
 *      所以这里要断言的不是「连不连得上」，而是**一个连不上的目标照样预检通过**——
 *      真去连了就会在这里露出来；
 *   3. **拒绝码是契约**：`BAD_TARGET` / `UNKNOWN_TARGET` / `PLUGIN_DISABLED` / `OUT_OF_SCOPE` /
 *      `ENGINE_NOT_SERVED` / `CONNECTION_INCOMPLETE` 各有各的恢复路径，不许混成一个「不可用」。
 *
 * ## 作用域那条的判据（任务里点名的反例）
 *
 * 目标声明 `['/declared/scope']`，请求根 `/work/demo` → `OUT_OF_SCOPE`，且响应里必须带上
 * **已归一化的 root 与允许目录**（拒绝文案说不清「判的是哪个目录、允许的是哪些」就等于让人猜，
 * 那是 `devdata D09` 的同族）。空作用域是另一档：它**永远**拒，恢复路径是「去声明目录」。
 *
 * 假宿主与假 req/res 与其它路由用例同一套夹具（`fake-host.ts` / `fake-route.ts`）——这里不另造，
 * 免得两套夹具在 `webServer.register` 的契约上漂开。
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { normalizeProjectContext, preflightProjectContext } from '../src/index.js'
import { callRoute, type CallResult, type RequestOptions } from './fake-route.js'
import { CWD, makeHost, redisTarget } from './fake-host.js'

const PATH = '/api/dsh-devdata/preflight'

/* 一次性目录（审计落点）：与 config-route.test.ts 同款，本文件自己收尾。 */
const tempDirs: string[] = []
afterEach(() => {
  while (tempDirs.length > 0) rmSync(tempDirs.pop() as string, { recursive: true, force: true })
})
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-devdata-preflight-'))
  tempDirs.push(dir)
  return dir
}

/** 起手配置：一个作用域在 `CWD` 的 redis 目标 + 一个作用域在别处的目标 + 一个没有连接的目标。 */
function seeded(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    enabled: true,
    announceToAgent: true,
    timeoutMs: 5000,
    plan: { maxRows: 10_000, maxCost: 5 },
    auditFile: '',
    targets: [
      redisTarget(),
      redisTarget({ id: 'redis-declared', label: '声明目录在别处', scopeDirs: ['/declared/scope'] }),
      redisTarget({ id: 'redis-empty-scope', label: '空作用域', scopeDirs: [] }),
      redisTarget({ id: 'redis-noconn', label: '缺连接', host: undefined, port: undefined }),
      redisTarget({ id: 'mysql-1', label: 'MySQL', engine: 'mysql' }),
    ],
    ...overrides,
  }
}

async function call(host: ReturnType<typeof makeHost>, options: RequestOptions = {}): Promise<CallResult> {
  return callRoute(host, PATH, options)
}

function fields(result: CallResult): string[] {
  return (result.json?.problems as Array<{ field: string }>).map((problem) => problem.field)
}

function codes(result: CallResult): string[] {
  return (result.json?.problems as Array<{ code?: string }>)
    .map((problem) => problem.code)
    .filter((code): code is string => code !== undefined)
}

/* ================================================================== *
 * 一、成功路径与「纯静态」的性质
 * ================================================================== */

describe('POST /api/dsh-devdata/preflight：成功路径', () => {
  it('回环 POST + 已保存目标 → 200 { ok, context, target:{id,engine}, problems:[] }', async () => {
    const host = makeHost()
    host.mount(seeded())
    const res = await call(host, { method: 'POST', body: { root: CWD, project: 'demo', target: 'redis-248' } })
    expect(res.status).toBe(200)
    expect(res.json).toEqual({
      ok: true,
      context: {
        root: CWD,
        project: 'demo',
        mode: 'readonly',
        enabled: { environment: false, data: false, front: false },
        readOnly: true,
      },
      target: { id: 'redis-248', engine: 'redis' },
      problems: [],
    })
  })

  it('`mode` / `enabled` 固定只读：输入里**没有**这两个字段，成功结果也照模型缺省', async () => {
    const host = makeHost()
    host.mount(seeded())
    const res = await call(host, { method: 'POST', body: { root: CWD, project: 'demo', target: 'redis-248' } })
    expect(res.json?.context).toEqual(normalizeProjectContext({ root: CWD, project: 'demo' }).context)
    expect((res.json?.context as Record<string, unknown>).readOnly).toBe(true)
  })

  it('`root` / `project` 两端空白被去掉、路径词法归一化（与纯模型同一份判据）', async () => {
    const host = makeHost()
    host.mount(seeded())
    const res = await call(host, {
      method: 'POST',
      body: { root: ` ${CWD}/../project-a `, project: ' demo-app ', target: ' redis-248 ' },
    })
    expect(res.status).toBe(200)
    expect((res.json?.context as Record<string, unknown>).root).toBe(CWD)
    expect((res.json?.context as Record<string, unknown>).project).toBe('demo-app')
  })

  it('**不查目录是否存在**：作用域内一个不存在的根照样预检通过（只做词法归一化）', async () => {
    const host = makeHost()
    host.mount(seeded())
    const res = await call(host, {
      method: 'POST',
      body: { root: '/declared/scope/does-not-exist/../app', project: 'demo', target: 'redis-declared' },
    })
    expect(res.status).toBe(200)
    expect((res.json?.context as Record<string, unknown>).root).toBe('/declared/scope/app')
  })

  it('**不联网**：目标地址根本解析不了也照样通过（真去连了这条就会红）', async () => {
    const host = makeHost()
    host.mount(seeded({ targets: [redisTarget({ host: 'no-such-host.invalid' })] }))
    const res = await call(host, { method: 'POST', body: { root: CWD, project: 'demo', target: 'redis-248' } })
    expect(res.status).toBe(200)
    expect(res.json?.ok).toBe(true)
  })

  it('**不保存 / 不注册工具 / 不写审计**：成功与失败都一个字节都不动', async () => {
    const file = join(tempDir(), 'audit.jsonl')
    writeFileSync(file, 'unchanged\n')
    const host = makeHost()
    host.mount(seeded({ auditFile: file }))
    const stored = JSON.stringify(host.stored)
    const tools = host.names()

    const ok = await call(host, { method: 'POST', body: { root: CWD, project: 'demo', target: 'redis-248' } })
    expect(ok.status).toBe(200)
    const bad = await call(host, { method: 'POST', body: { root: CWD, project: 'demo', target: 'redis-nope' } })
    expect(bad.status).toBe(400)

    expect(JSON.stringify(host.stored)).toBe(stored)
    expect(host.names()).toEqual(tools)
    expect(readFileSync(file, 'utf8')).toBe('unchanged\n')
  })

  it('登记契约：`kind: exact` + `/api/dsh-devdata/preflight`（与既有路由同一套）', () => {
    const host = makeHost()
    host.mount(seeded())
    expect(host.routes.get(PATH)?.kind).toBe('exact')
    expect(host.routes.get(PATH)?.path).toBe(PATH)
    // 旧路由**原样还在**（这一条加得、旧的删不得）。
    expect(host.routes.get('/api/dsh-devdata/project-context')?.kind).toBe('exact')
  })
})

/* ================================================================== *
 * 二、上下文：坏输入逐字段报，且不产出 context
 * ================================================================== */

describe('POST /api/dsh-devdata/preflight：上下文问题', () => {
  it('缺 root / project → 400，context 与 target 都为 null，逐字段问题与纯模型一致', async () => {
    const host = makeHost()
    host.mount(seeded())
    const res = await call(host, { method: 'POST', body: { target: 'redis-248' } })
    expect(res.status).toBe(400)
    expect(res.json?.context).toBeNull()
    expect(res.json?.target).toBeNull()
    expect(fields(res)).toEqual(['root', 'project'])
  })

  it('相对路径 / 非法项目名 / NUL → 逐字段问题（模型说什么就是什么）', async () => {
    const host = makeHost()
    host.mount(seeded())
    const res = await call(host, { method: 'POST', body: { root: './relative', project: '../other', target: 'redis-248' } })
    expect(res.status).toBe(400)
    expect(fields(res)).toEqual(['root', 'project'])
  })

  it('非对象体（数组 / null / 标量）→ 400 `invalid JSON body`（readJsonBody 的口径）', async () => {
    const host = makeHost()
    host.mount(seeded())
    for (const raw of ['[]', 'null', 'true', '42', '"x"']) {
      expect(await call(host, { method: 'POST', raw })).toEqual({ status: 400, json: { error: 'invalid JSON body' } })
    }
  })
})

/* ================================================================== *
 * 三、目标：只认已保存的 id，不接受浏览器自报的任何事实
 * ================================================================== */

describe('POST /api/dsh-devdata/preflight：目标解析全在宿主', () => {
  it('缺 target / 非字符串 target → `BAD_TARGET`（内联目标也不收）', async () => {
    const host = makeHost()
    host.mount(seeded())
    for (const target of [undefined, '', '   ', 42, null, { id: 'redis-248' }, ['redis-248']]) {
      const res = await call(host, { method: 'POST', body: { root: CWD, project: 'demo', target } })
      expect(res.status, JSON.stringify(target)).toBe(400)
      expect(fields(res)).toContain('target')
      expect(codes(res)).toContain('BAD_TARGET')
      // 上下文本身是合法的，所以照给；目标认不出 → null。
      expect(res.json?.context).not.toBeNull()
      expect(res.json?.target).toBeNull()
    }
  })

  it('配置里没有这个 id → `UNKNOWN_TARGET`，恢复路径列出**已保存**的目标', async () => {
    const host = makeHost()
    host.mount(seeded())
    const res = await call(host, { method: 'POST', body: { root: CWD, project: 'demo', target: 'redis-999' } })
    expect(res.status).toBe(400)
    expect(codes(res)).toContain('UNKNOWN_TARGET')
    const problem = (res.json?.problems as Array<{ hint?: string }>)[0]
    expect(problem?.hint).toContain('redis-248')
  })

  it.each([
    'scopeDirs',
    'engine',
    'host',
    'port',
    'connection',
    'writeCapability',
    'dangerousReadCapability',
    'readOnly',
    'enabled',
    'mode',
    'targets',
    'problems',
  ])('伪造字段 `%s` 被拒：预检不接受浏览器的作用域 / 引擎 / 连接 / 权限快照', async (field) => {
    const host = makeHost()
    host.mount(seeded())
    const body = { root: CWD, project: 'demo', target: 'redis-248', [field]: { env: 'CI', id: 'evil' } }
    const res = await call(host, { method: 'POST', body })
    expect(res.status).toBe(400)
    expect(fields(res)).toContain(field)
  })

  it('★ 伪造的 `scopeDirs` **不参与**判定：宿主照它自己那份声明判（`/declared/scope`）', async () => {
    const host = makeHost()
    host.mount(seeded())
    const res = await call(host, {
      method: 'POST',
      body: {
        root: '/work/demo',
        project: 'demo',
        target: 'redis-declared',
        // 浏览器自称「我有作用域」——它没有用，判定仍按配置里那份走。
        scopeDirs: ['/work/demo'],
        enabled: { data: true },
      },
    })
    expect(res.status).toBe(400)
    expect(codes(res)).toContain('OUT_OF_SCOPE')
    expect(fields(res)).toEqual(expect.arrayContaining(['scopeDirs', 'enabled']))
  })
})

/* ================================================================== *
 * 四、宿主侧事实：停用 / 作用域 / 执行器 / 连接
 * ================================================================== */

describe('POST /api/dsh-devdata/preflight：宿主侧事实逐条报', () => {
  it('插件停用 → `PLUGIN_DISABLED`（预检不会自动启用它）', async () => {
    const host = makeHost()
    host.mount(seeded({ enabled: false }))
    const res = await call(host, { method: 'POST', body: { root: CWD, project: 'demo', target: 'redis-248' } })
    expect(res.status).toBe(400)
    expect(codes(res)).toContain('PLUGIN_DISABLED')
    expect(fields(res)).toContain('enabled')
  })

  it('★ 声明目录 `/declared/scope` vs 项目根 `/work/demo` → `OUT_OF_SCOPE`，带上归一化 root 与允许目录', async () => {
    const host = makeHost()
    host.mount(seeded())
    const res = await call(host, { method: 'POST', body: { root: '/work/demo', project: 'demo', target: 'redis-declared' } })
    expect(res.status).toBe(400)
    const problem = (res.json?.problems as Array<Record<string, unknown>>).find((row) => row.code === 'OUT_OF_SCOPE')
    expect(problem).toBeDefined()
    expect(problem?.root).toBe('/work/demo')
    expect(problem?.scopeDirs).toEqual(['/declared/scope'])
    expect(String(problem?.hint)).toContain('/declared/scope')
    // 上下文与目标引用照给（它们是事实），只有判定失败。
    expect((res.json?.context as Record<string, unknown>).root).toBe('/work/demo')
    expect(res.json?.target).toEqual({ id: 'redis-declared', engine: 'redis' })
  })

  it('项目根正好落在声明目录内 → 放行（同一条判据的另一侧）', async () => {
    const host = makeHost()
    host.mount(seeded())
    const res = await call(host, { method: 'POST', body: { root: '/declared/scope/app', project: 'demo', target: 'redis-declared' } })
    expect(res.status).toBe(200)
    expect(res.json?.ok).toBe(true)
  })

  it('★ 空作用域 → `OUT_OF_SCOPE`（fail closed），恢复路径是「去声明目录」而不是「随便填一个」', async () => {
    const host = makeHost()
    host.mount(seeded())
    const res = await call(host, { method: 'POST', body: { root: CWD, project: 'demo', target: 'redis-empty-scope' } })
    expect(res.status).toBe(400)
    const problem = (res.json?.problems as Array<Record<string, unknown>>).find((row) => row.code === 'OUT_OF_SCOPE')
    expect(problem?.scopeDirs).toEqual([])
    expect(problem?.root).toBe(CWD)
    expect(String(problem?.message)).toContain('处处拒绝')
    expect(String(problem?.hint)).toContain('scopeDirs')
  })

  it('未接通执行器的引擎 → `ENGINE_NOT_SERVED`（点名本宿主接了哪些）', async () => {
    const host = makeHost()
    host.mount(seeded())
    const res = await call(host, { method: 'POST', body: { root: CWD, project: 'demo', target: 'mysql-1' } })
    expect(res.status).toBe(400)
    const problem = (res.json?.problems as Array<Record<string, unknown>>).find((row) => row.code === 'ENGINE_NOT_SERVED')
    expect(problem?.field).toBe('engine')
    expect(String(problem?.message)).toContain('mysql')
    expect(String(problem?.hint)).toContain('redis')
    // 目标引用照给（id 与引擎都是事实），只是不可运行。
    expect(res.json?.target).toEqual({ id: 'mysql-1', engine: 'mysql' })
  })

  it('连接信息不完整 → `CONNECTION_INCOMPLETE`（不补默认端口、不假装能连）', async () => {
    const host = makeHost()
    host.mount(seeded())
    const res = await call(host, { method: 'POST', body: { root: CWD, project: 'demo', target: 'redis-noconn' } })
    expect(res.status).toBe(400)
    expect(codes(res)).toContain('CONNECTION_INCOMPLETE')
    expect(fields(res)).toContain('connection')
  })

  it('多条问题一次全报（停用 + 越界 + 缺连接），不让人修一样撞一次', async () => {
    const host = makeHost()
    host.mount(seeded({
      enabled: false,
      targets: [redisTarget({ id: 'redis-noconn-declared', scopeDirs: ['/declared/scope'], host: undefined, port: undefined })],
    }))
    const res = await call(host, { method: 'POST', body: { root: '/work/demo', project: 'demo', target: 'redis-noconn-declared' } })
    expect(res.status).toBe(400)
    expect(codes(res).sort()).toEqual(['CONNECTION_INCOMPLETE', 'OUT_OF_SCOPE', 'PLUGIN_DISABLED'])
  })
})

/* ================================================================== *
 * 五、护栏：围栏 / 方法 / 坏 body（与既有路由同一套）
 * ================================================================== */

describe('POST /api/dsh-devdata/preflight：护栏', () => {
  it.each([
    { remoteAddress: '10.0.0.1' },
    { host: '192.0.2.1:3080' },
    { headers: { 'sec-fetch-site': 'cross-site' } },
    { headers: { origin: 'http://example.invalid:3080' } },
  ])('严格围栏先于方法与 JSON：%j', async (options) => {
    const host = makeHost()
    host.mount(seeded())
    const res = await call(host, { ...options, method: 'DELETE', raw: '{broken' })
    expect(res).toEqual({ status: 403, json: { error: 'forbidden: loopback-only' } })
  })

  it('只允许 POST；坏 JSON / 空体沿用 400 风格', async () => {
    const host = makeHost()
    host.mount(seeded())
    for (const method of ['GET', 'PUT', 'DELETE']) {
      expect(await call(host, { method })).toEqual({ status: 405, json: { error: `method not allowed: ${method}` } })
    }
    for (const raw of ['', '{broken', '{"root":"' + 'x'.repeat(1024 * 1024) + '"}']) {
      expect(await call(host, { method: 'POST', raw })).toEqual({ status: 400, json: { error: 'invalid JSON body' } })
    }
  })

  it('`webServer` 不可用时整条路由不登记（不抛错）', () => {
    const host = makeHost({ webServer: false })
    host.mount(seeded())
    expect(host.routes.get(PATH)).toBeUndefined()
  })
})

/* ================================================================== *
 * 六、纯函数那一层（判据不依赖宿主）
 * ================================================================== */

describe('preflightProjectContext：纯函数', () => {
  const live = {
    enabled: true,
    announceToAgent: true,
    auditFile: '',
    plan: {},
    timeoutMs: 5000,
    targets: [
      { id: 'redis-248', label: 'r', engine: 'redis' as const, env: 'test-shared' as const, scopeDirs: [CWD], maxScanCount: 200, connection: { host: '127.0.0.1', port: 6379 } },
    ],
    problems: [],
  }

  it('成功：固定只读上下文 + 只有 id / engine 的目标引用', () => {
    const result = preflightProjectContext({ root: CWD, project: 'demo', target: 'redis-248' }, { live, servedEngines: ['redis'] })
    expect(result).toEqual({
      ok: true,
      context: { root: CWD, project: 'demo', mode: 'readonly', enabled: { environment: false, data: false, front: false }, readOnly: true },
      target: { id: 'redis-248', engine: 'redis' },
      problems: [],
    })
  })

  it('不修改输入，重复调用结果一致', () => {
    const input = Object.freeze({ root: CWD, project: 'demo', target: 'redis-248' })
    const first = preflightProjectContext(input, { live, servedEngines: ['redis'] })
    const second = preflightProjectContext(input, { live, servedEngines: ['redis'] })
    expect(first).toEqual(second)
    expect(input).toEqual({ root: CWD, project: 'demo', target: 'redis-248' })
  })

  it('非对象输入 → `input` 一条问题，context / target 都是 null', () => {
    const result = preflightProjectContext(null, { live, servedEngines: ['redis'] })
    expect(result.ok).toBe(false)
    expect(result.context).toBeNull()
    expect(result.target).toBeNull()
    expect(result.problems.map((problem) => problem.field)).toEqual(['input'])
  })

  it('`servedEngines` 是宿主给的事实：同一个目标在「已接通路」的宿主上通过', () => {
    const result = preflightProjectContext({ root: CWD, project: 'demo', target: 'redis-248' }, { live, servedEngines: ['redis', 'mysql'] })
    expect(result.ok).toBe(true)
  })
})
