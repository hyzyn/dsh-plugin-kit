/**
 * 配置卡片（客户端半体）的**数据面**用例：patch 校验、快照投影、那条路由。
 *
 * ## 为什么这一层值得单独一组
 *
 * 卡片是**唯一**一条「HTTP 能改插件配置」的路，于是它同时是两个面的边界：
 *
 *   1. **面朝用户的编辑面**（标量 + 目标名单）——写错一个字段，用户以为存了、实际没生效；
 *   2. **面朝提权的判据面**（`writeCapability`）——它就是授权判据本身，能经 HTTP 改就等于
 *      「免重启提权」（根 ROADMAP §5.1：HTTP 不能**凭空**打开能力）。
 *
 * `devfront` 在真机上踩过「保存一个标量把站点整批抹掉」，所以这里有一条专门的用例：
 * **没有 settings 服务**（兜底源那条路）时保存标量，目标名单必须原样在。
 *
 * 路由本身用 `@hyzyn/dsh-kit/testing` 的假宿主（`webServer` 那个开关）驱动，不走真 HTTP：
 * 要钉的是**围栏与状态码**，不是 Node 的 http 模块。
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  CARD_FIELDS,
  configSnapshotFrom,
  normalizeCardPatch,
  normalizeConfig,
  normalizeTargets,
  type LiveConfig,
} from '../src/index.js'
import { makeHost } from './fake-host.js'

const temps: string[] = []

/** 一次性临时目录（审计文件住这里）。 */
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-devenv-card-'))
  temps.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/* ------------------------------------------------------------------ *
 * 夹具
 * ------------------------------------------------------------------ */

/** 一份解析后的配置（`configSnapshotFrom` 的输入）。 */
function liveConfig(overrides: Partial<LiveConfig> = {}): LiveConfig {
  return {
    enabled: true,
    announceToAgent: true,
    targets: [
      { id: 'nas', label: '248 NAS', kind: 'ssh', book: 'TEST', scopeDirs: ['/work/a'] },
      { id: 'here', label: '本机', kind: 'local', book: '', scopeDirs: [] },
    ],
    execTimeoutMs: 10_000,
    logTail: 200,
    probeTimeoutMs: 3000,
    waitTimeoutMs: 180_000,
    pollIntervalMs: 3000,
    stopTimeoutSec: 10,
    auditFile: '',
    hostKeys: [{ host: '10.0.0.9', port: 22, fingerprints: ['SHA256:aaa', 'SHA256:bbb'] }],
    problems: [],
    ...overrides,
  }
}

/** 一份经真实 `Config` schema 解析的目标（卡片保存路径上用的形状）。 */
const TARGET_NAS = { id: 'nas', label: '248 NAS', kind: 'ssh', book: 'TEST', scopeDirs: ['/work/a'] }
const TARGET_HERE = { id: 'here', label: '本机', kind: 'local', scopeDirs: ['/work/b'] }

interface FakeReqInit {
  method?: string
  body?: unknown
  rawBody?: string
  remoteAddress?: string
  host?: string
  origin?: string
  secFetchSite?: string
}

interface RouteResult {
  status: number | undefined
  body: Record<string, unknown> | undefined
}

/** 打一次那条路由（走假宿主登记的 handler；返回状态码与 JSON body）。 */
async function callRoute(host: ReturnType<typeof makeHost>, init: FakeReqInit = {}): Promise<RouteResult> {
  const route = host.routes.get('/api/dsh-devenv/config')
  expect(route, '路由 /api/dsh-devenv/config 没注册').toBeDefined()
  const state: { status?: number; body?: Record<string, unknown> } = {}
  const res = {
    writeHead(status: number): void {
      state.status = status
    },
    end(body?: string): void {
      state.body = body === undefined ? undefined : (JSON.parse(body) as Record<string, unknown>)
    },
  }
  const payload =
    init.rawBody !== undefined
      ? Buffer.from(init.rawBody)
      : init.body === undefined
        ? undefined
        : Buffer.from(JSON.stringify(init.body))
  const headers: Record<string, string> = { host: init.host ?? '127.0.0.1:3082' }
  if (init.origin !== undefined) headers.origin = init.origin
  if (init.secFetchSite !== undefined) headers['sec-fetch-site'] = init.secFetchSite
  const req = {
    method: init.method ?? 'GET',
    url: '/api/dsh-devenv/config',
    headers,
    socket: { remoteAddress: init.remoteAddress ?? '127.0.0.1' },
    async *[Symbol.asyncIterator]() {
      if (payload !== undefined) yield payload
    },
  }
  await route?.handler(req, res)
  return state as RouteResult
}

/** 从一次 GET 里取快照（省掉每处 `as Record<string, unknown>` 的噪音）。 */
function configOf(result: RouteResult): Record<string, unknown> {
  return (result.body?.config ?? {}) as Record<string, unknown>
}

/* ------------------------------------------------------------------ *
 * patch 校验：标量
 * ------------------------------------------------------------------ */

describe('normalizeCardPatch：标量先判后写（非法值不许先落地）', () => {
  it('空 patch / 不认识的字段一律报错（不静默丢弃）', () => {
    expect(normalizeCardPatch({})).toEqual({ error: '没有要改的字段（patch 是空的）' })
    expect(normalizeCardPatch({ nope: 1 })).toEqual({ error: '不认识的字段：nope' })
    // 卡片暴露的就是这六个标量；schema 里另有 execTimeoutMs / logTail / stopTimeoutSec，它们走补丁层
    expect([...CARD_FIELDS]).toEqual(['enabled', 'announceToAgent', 'auditFile', 'probeTimeoutMs', 'waitTimeoutMs', 'pollIntervalMs'])
  })

  it('布尔字段只认布尔值', () => {
    expect(normalizeCardPatch({ enabled: 'yes' })).toEqual({ error: 'enabled 必须是布尔值' })
    expect(normalizeCardPatch({ announceToAgent: 1 })).toEqual({ error: 'announceToAgent 必须是布尔值' })
    expect(normalizeCardPatch({ enabled: false })).toEqual({ patch: { enabled: false } })
  })

  it('数值字段：整数 + 区间，界与外层一致（探针那对界就写在错文案里）', () => {
    expect(normalizeCardPatch({ probeTimeoutMs: 99 })).toEqual({ error: 'probeTimeoutMs 必须是 100~60000 的整数（毫秒）' })
    expect(normalizeCardPatch({ probeTimeoutMs: 60_001 })).toEqual({ error: 'probeTimeoutMs 必须是 100~60000 的整数（毫秒）' })
    expect(normalizeCardPatch({ probeTimeoutMs: 1.5 })).toEqual({ error: 'probeTimeoutMs 必须是 100~60000 的整数（毫秒）' })
    expect(normalizeCardPatch({ probeTimeoutMs: '3000' })).toEqual({ error: 'probeTimeoutMs 必须是 100~60000 的整数（毫秒）' })
    expect(normalizeCardPatch({ waitTimeoutMs: 999 })).toEqual({ error: 'waitTimeoutMs 必须是 1000~900000 的整数（毫秒）' })
    expect(normalizeCardPatch({ pollIntervalMs: 499 })).toEqual({ error: 'pollIntervalMs 必须是 500~60000 的整数（毫秒）' })
  })

  it('**两套界不许分叉**：提交上下界，解析层必须原样收下（夹回去了就是分叉）', () => {
    for (const key of ['probeTimeoutMs', 'waitTimeoutMs', 'pollIntervalMs'] as const) {
      const range = { probeTimeoutMs: [100, 60_000], waitTimeoutMs: [1_000, 900_000], pollIntervalMs: [500, 60_000] }[key]
      for (const value of range) {
        const result = normalizeCardPatch({ [key]: value })
        expect('patch' in result, `${key}=${String(value)}`).toBe(true)
        const parsed = normalizeConfig({ [key]: value }) as unknown as Record<string, unknown>
        expect(parsed[key], `${key}=${String(value)} 被解析层改动了`).toBe(value)
      }
    }
  })

  it('字符串字段去空白；非字符串一律拒', () => {
    expect(normalizeCardPatch({ auditFile: 42 })).toEqual({ error: 'auditFile 必须是字符串' })
    expect(normalizeCardPatch({ auditFile: '  ~/.dsh/devenv-audit.jsonl  ' })).toEqual({ patch: { auditFile: '~/.dsh/devenv-audit.jsonl' } })
  })

  it('一次改多个标量是合法的（卡片「保存」按钮就是这个形状）', () => {
    expect(normalizeCardPatch({ enabled: false, probeTimeoutMs: 5000, auditFile: 'a.jsonl' })).toEqual({
      patch: { enabled: false, probeTimeoutMs: 5000, auditFile: 'a.jsonl' },
    })
  })
})

/* ------------------------------------------------------------------ *
 * patch 校验：能力字段只读（这条是提权面）
 * ------------------------------------------------------------------ */

describe('能力字段在卡片上**只读**：POST 出现 writeCapability 一律 400', () => {
  it('顶层 writeCapability → 专用文案 + 码（不是「不认识的字段」那种普通 400）', () => {
    const result = normalizeCardPatch({ writeCapability: { env: 'HOME', label: 'x' } })
    expect('error' in result).toBe(true)
    if ('error' in result) {
      expect(result.code).toBe('CAPABILITY_READONLY')
      expect(result.error).toContain('writeCapability')
      expect(result.error).toContain('只读')
      // 理由必须写出来：改成 HOME 就等于免重启提权（这是判据，不是措辞）
      expect(result.error).toContain('免重启提权')
      expect(result.error).toContain('HTTP 不能凭空打开能力')
    }
  })

  it('目标行里的 writeCapability 同样拒（它才是配置里真正住着的那一处）', () => {
    const result = normalizeCardPatch({
      confirmTargetEdit: true,
      targets: [{ id: 'nas', kind: 'ssh', book: 'TEST', writeCapability: { env: 'HOME' } }],
    })
    expect('error' in result).toBe(true)
    if ('error' in result) {
      expect(result.code).toBe('CAPABILITY_READONLY')
      expect(result.error).toContain('targets[0].writeCapability')
    }
  })

  it('GET 快照里的只读档（writeGates / hostKeys）回写也一律拒', () => {
    for (const key of ['writeGates', 'hostKeys'] as const) {
      const result = normalizeCardPatch({ [key]: [] })
      expect('error' in result, key).toBe(true)
      if ('error' in result) {
        expect(result.code).toBe('READONLY_FIELD')
        expect(result.error).toContain(key)
      }
    }
  })
})

/* ------------------------------------------------------------------ *
 * patch 校验：目标名单
 * ------------------------------------------------------------------ */

describe('normalizeTargets：逐字段报错，指到 `targets[i].字段`', () => {
  it('不是数组 / 行不是对象 → 报出来', () => {
    expect(normalizeTargets('nope')).toEqual({ error: 'targets 必须是数组' })
    expect(normalizeTargets(['nope'])).toEqual({ error: 'targets[0] 必须是对象' })
  })

  it('逐字段报错（缺 id / 缺 book / kind 认不出 / 未知字段）', () => {
    const cases: Array<[unknown, string]> = [
      [[{ kind: 'local' }], 'targets[0].id'],
      [[{ id: 'a', kind: 'ftp' }], 'targets[0].kind'],
      [[{ id: 'a', kind: 'ssh' }], 'targets[0].book'],
      [[{ id: 'a', kind: 'local', scopeDirs: 'a,b' }], 'targets[0].scopeDirs 必须是字符串数组'],
      [[{ id: 'a', kind: 'local', nope: 1 }], 'targets[0].nope'],
      [[{ id: 'a', kind: 'local' }, { id: 'a', kind: 'ssh', book: 'x' }], '重名'],
    ]
    for (const [input, needle] of cases) {
      const result = normalizeTargets(input)
      expect('error' in result, JSON.stringify(input)).toBe(true)
      if ('error' in result) expect(result.error, JSON.stringify(input)).toContain(needle)
    }
  })

  it('`kind` 认不出的目标**不许**被当成 ssh 收下（那是静默换了一条通道）', () => {
    const result = normalizeTargets([{ id: 'a', kind: 'ssh ', book: 'TEST' }, { id: 'b', kind: 'SSH', book: 'TEST' }])
    expect('error' in result).toBe(true)
    if ('error' in result) expect(result.error).toContain('targets[1].kind')
  })

  it('合法行：去空白、`scopeDirs` 去空、`book` 只在非空时带上，且解析层一行不少地收下', () => {
    const result = normalizeTargets([
      { id: ' nas ', label: '  248  ', kind: 'ssh', book: ' TEST ', scopeDirs: ['/work/a', '  '] },
      { id: 'here', kind: 'local', scopeDirs: [] },
    ])
    expect(result).toEqual({
      targets: [
        { id: 'nas', label: '248', kind: 'ssh', book: 'TEST', scopeDirs: ['/work/a'] },
        { id: 'here', kind: 'local', scopeDirs: [] },
      ],
    })
  })

  it('空 `scopeDirs` 是合法状态（= 处处拒绝），**不**在保存路径上被拦', () => {
    // 拦它会逼用户填一个「看起来能用」的目录——那正是替用户授权。解析层会报一条配置问题（提醒），
    // 但不该变成「存不下去」。
    expect(normalizeTargets([{ id: 'a', kind: 'local', scopeDirs: [] }])).toEqual({
      targets: [{ id: 'a', kind: 'local', scopeDirs: [] }],
    })
  })

  it('`~` 展开是解析层的事：保存路径原样收下（快照里看到的是展开后的值）', () => {
    const result = normalizeTargets([{ id: 'a', kind: 'local', scopeDirs: ['~/work'] }])
    expect(result).toEqual({ targets: [{ id: 'a', kind: 'local', scopeDirs: ['~/work'] }] })
    const parsed = normalizeConfig({ targets: [{ id: 'a', kind: 'local', scopeDirs: ['~/work'] }] })
    expect(parsed.targets[0]?.scopeDirs[0]?.endsWith('/work')).toBe(true)
  })
})

describe('改目标要逐次确认', () => {
  it('不带 `confirmTargetEdit` → 400 那一档（码 `CONFIRMATION_REQUIRED`）', () => {
    const result = normalizeCardPatch({ targets: [TARGET_HERE] })
    expect('error' in result).toBe(true)
    if ('error' in result) {
      expect(result.code).toBe('CONFIRMATION_REQUIRED')
      expect(result.error).toContain('confirmTargetEdit')
      expect(result.error).toContain('profile 补丁层')
    }
  })

  it('带了确认 → patch 里是校验过的行，且 `confirmTargetEdit` **不进配置**', () => {
    expect(normalizeCardPatch({ confirmTargetEdit: true, targets: [TARGET_HERE] })).toEqual({
      patch: { targets: [{ id: 'here', kind: 'local', label: '本机', scopeDirs: ['/work/b'] }] },
    })
    // 清空目标也是合法状态（「没配目标 = 一个工具都不注册」那条 fail-closed 判据由注册面钉住）
    expect(normalizeCardPatch({ confirmTargetEdit: true, targets: [] })).toEqual({ patch: { targets: [] } })
  })

  it('标量与目标可以一次改（卡片就是一次 POST）', () => {
    expect(normalizeCardPatch({ confirmTargetEdit: true, targets: [TARGET_NAS], pollIntervalMs: 5000 })).toEqual({
      patch: { targets: [TARGET_NAS], pollIntervalMs: 5000 },
    })
  })

  it('★ 改目标**不抹掉**已声明的写闸门（同 id 带过去；改 id 才丢——那是换了一个目标）', () => {
    // 客户端提交的行里没有 writeCapability（它在卡片上只读），若照原样写回就会把它静默抹掉：
    // 用户只改了一个 scopeDirs 的错别字，`env_up` / `env_down` 却从工具面消失了。
    const current = [{ id: 'nas', label: '248 NAS', kind: 'ssh' as const, book: 'TEST', scopeDirs: ['/work/a'], writeCapability: { env: 'DSH_DEVENV_WRITE', label: '变更操作' } }]
    const kept = normalizeCardPatch(
      { confirmTargetEdit: true, targets: [{ id: 'nas', kind: 'ssh', book: 'TEST', scopeDirs: ['/work/fixed'] }] },
      { currentTargets: current },
    )
    expect(kept).toEqual({
      patch: {
        targets: [{ id: 'nas', kind: 'ssh', book: 'TEST', scopeDirs: ['/work/fixed'], writeCapability: { env: 'DSH_DEVENV_WRITE', label: '变更操作' } }],
      },
    })
    const renamed = normalizeCardPatch({ confirmTargetEdit: true, targets: [{ id: 'nas-2', kind: 'ssh', book: 'TEST', scopeDirs: ['/work/a'] }] }, { currentTargets: current })
    expect(renamed).toEqual({ patch: { targets: [{ id: 'nas-2', kind: 'ssh', book: 'TEST', scopeDirs: ['/work/a'] }] } })
  })
})

/* ------------------------------------------------------------------ *
 * 快照
 * ------------------------------------------------------------------ */

describe('configSnapshotFrom：可改的、只读的，各自摆对', () => {
  it('标量 + 目标全量（目标带 kind / book / scopeDirs —— 编辑器要靠它们回填）', () => {
    const snapshot = configSnapshotFrom(liveConfig())
    expect(snapshot).toMatchObject({ enabled: true, announceToAgent: true, probeTimeoutMs: 3000, waitTimeoutMs: 180_000, pollIntervalMs: 3000 })
    expect(snapshot.targets).toEqual([
      { id: 'nas', label: '248 NAS', kind: 'ssh', book: 'TEST', scopeDirs: ['/work/a'] },
      { id: 'here', label: '本机', kind: 'local', book: '', scopeDirs: [] },
    ])
  })

  it('写闸门只读档：没声明的目标也要出现（`declared:false`）——否则用户不知道它为什么不注册', () => {
    const withGate = liveConfig({
      targets: [
        { id: 'nas', label: '248 NAS', kind: 'ssh', book: 'TEST', scopeDirs: ['/work/a'], writeCapability: { env: 'DSH_DEVENV_UNSET_FOR_TEST', label: '变更操作' } },
        { id: 'here', label: '本机', kind: 'local', book: '', scopeDirs: [] },
      ],
    })
    const gates = configSnapshotFrom(withGate).writeGates as Array<Record<string, unknown>>
    expect(gates).toHaveLength(2)
    expect(gates[0]).toMatchObject({ targetId: 'nas', declared: true, env: 'DSH_DEVENV_UNSET_FOR_TEST', granted: false })
    expect(String(gates[0]?.howTo)).toContain('DSH_DEVENV_UNSET_FOR_TEST')
    expect(gates[1]).toEqual({ targetId: 'here', label: '本机', declared: false })
  })

  it('指纹只给 host / 端口 / **条数**（不给指纹本身，也不给编辑）', () => {
    const hostKeys = configSnapshotFrom(liveConfig()).hostKeys as Array<Record<string, unknown>>
    expect(hostKeys).toEqual([{ host: '10.0.0.9', port: 22, fingerprints: 2 }])
    expect(Object.keys(hostKeys[0] ?? {}).sort()).toEqual(['fingerprints', 'host', 'port'])
  })

  it('快照里没有 writeCapability 这个**可写形状**的字段（只读档叫 writeGates）', () => {
    const snapshot = configSnapshotFrom(liveConfig())
    expect(snapshot.writeCapability).toBeUndefined()
    expect(snapshot.writeGates).toBeDefined()
  })
})

/* ------------------------------------------------------------------ *
 * 路由
 * ------------------------------------------------------------------ */

const AUDIT_TARGETS = [TARGET_NAS, TARGET_HERE]

describe('路由 /api/dsh-devenv/config：围栏与状态码', () => {
  it('GET：200 + 快照（persisted 如实标出有没有 settings 服务）', async () => {
    const host = makeHost()
    host.mount({ targets: AUDIT_TARGETS })
    const got = await callRoute(host)
    expect(got.status).toBe(200)
    expect(got.body?.ok).toBe(true)
    expect(got.body?.persisted).toBe(true)
    expect(configOf(got).targets).toHaveLength(2)
  })

  it('非 GET/POST → 405；JSON 坏了 → 400', async () => {
    const host = makeHost()
    host.mount({ targets: AUDIT_TARGETS })
    expect((await callRoute(host, { method: 'DELETE' })).status).toBe(405)
    expect((await callRoute(host, { method: 'PUT' })).status).toBe(405)
    const broken = await callRoute(host, { method: 'POST', rawBody: '{ nope' })
    expect(broken.status).toBe(400)
    expect(broken.body?.error).toBe('invalid JSON body')
  })

  it('非回环来源 → 403（围栏在最前，读也拦）', async () => {
    const host = makeHost()
    host.mount({ targets: AUDIT_TARGETS })
    const denied = await callRoute(host, { remoteAddress: '10.1.2.3' })
    expect(denied.status).toBe(403)
    expect(String(denied.body?.error)).toContain('loopback-only')
    // 跨站（浏览器带 sec-fetch-site: cross-site）同样拒
    expect((await callRoute(host, { secFetchSite: 'cross-site' })).status).toBe(403)
    // Origin 与 Host 不同源也拒
    expect((await callRoute(host, { origin: 'http://evil.example.com' })).status).toBe(403)
  })

  it('**插件停用后 /config 照旧可用**（它是重新启用的唯一 UI 入口）', async () => {
    const host = makeHost()
    host.mount({ enabled: false, targets: AUDIT_TARGETS })
    expect(host.names()).toEqual([]) // 工具面确实撤了
    const got = await callRoute(host)
    expect(got.status).toBe(200)
    expect(configOf(got).enabled).toBe(false)
  })
})

describe('路由：POST 真的写进去、且不抹掉别的字段', () => {
  it('改一个标量 → 200 + persisted:true，**目标名单原样在**', async () => {
    const host = makeHost()
    host.mount({ targets: AUDIT_TARGETS })
    const posted = await callRoute(host, { method: 'POST', body: { probeTimeoutMs: 1234 } })
    expect(posted.status).toBe(200)
    expect(posted.body?.persisted).toBe(true)
    const after = await callRoute(host)
    expect(configOf(after).probeTimeoutMs).toBe(1234)
    expect(configOf(after).targets).toHaveLength(2)
    expect(configOf(posted).targets).toHaveLength(2)
  })

  it('**没有 settings 服务**时：persisted:false（不假装落盘），标量生效且目标仍在', async () => {
    // 兜底源（`rawSectionRef`）初值若是 `{}`，这一条会看到 `targets: []`——`devfront` 真机踩过。
    const host = makeHost({ settings: false })
    host.mount({ targets: AUDIT_TARGETS })
    const got = await callRoute(host)
    expect(got.body?.persisted).toBe(false)
    const posted = await callRoute(host, { method: 'POST', body: { pollIntervalMs: 5000 } })
    expect(posted.status).toBe(200)
    expect(posted.body?.persisted).toBe(false)
    expect(configOf(posted).pollIntervalMs).toBe(5000)
    expect(configOf(posted).targets).toHaveLength(2)
  })

  it('非法值 → 400，且**配置没被动过**（先判后写）', async () => {
    const host = makeHost()
    host.mount({ targets: AUDIT_TARGETS, probeTimeoutMs: 3000 })
    const bad = await callRoute(host, { method: 'POST', body: { probeTimeoutMs: 10 } })
    expect(bad.status).toBe(400)
    const after = await callRoute(host)
    expect(configOf(after).probeTimeoutMs).toBe(3000)
  })

  it('`writeCapability` → 400 + 码（提权面那条）', async () => {
    const host = makeHost()
    host.mount({ targets: AUDIT_TARGETS })
    const denied = await callRoute(host, { method: 'POST', body: { writeCapability: { env: 'HOME', label: 'x' } } })
    expect(denied.status).toBe(400)
    expect(denied.body?.code).toBe('CAPABILITY_READONLY')
    expect(String(denied.body?.error)).toContain('免重启提权')
  })

  it('改目标不带确认 → 400 + `CONFIRMATION_REQUIRED`；带确认 → 200 且真的多一个目标', async () => {
    const host = makeHost()
    host.mount({ targets: AUDIT_TARGETS })
    const needConfirm = await callRoute(host, { method: 'POST', body: { targets: [TARGET_HERE] } })
    expect(needConfirm.status).toBe(400)
    expect(needConfirm.body?.code).toBe('CONFIRMATION_REQUIRED')
    expect(configOf(await callRoute(host)).targets).toHaveLength(2)

    const done = await callRoute(host, {
      method: 'POST',
      body: { confirmTargetEdit: true, targets: [...AUDIT_TARGETS, { id: 'third', kind: 'local', scopeDirs: ['/work/c'] }] },
    })
    expect(done.status).toBe(200)
    expect(configOf(done).targets).toHaveLength(3)
  })

  it('★ 经 HTTP 改目标后，已声明的写闸门仍在（只读档与工具面都不许被静默关掉）', async () => {
    const targets = [{ id: 'nas', kind: 'ssh', book: 'TEST', scopeDirs: ['/work/a'], writeCapability: { env: 'DSH_DEVENV_WRITE', label: '变更操作' } }]
    const host = makeHost()
    host.mount({ targets })
    expect(host.names()).toEqual(['env_down', 'env_status', 'env_up', 'env_wait']) // 有闸门 → 四个工具

    const edited = await callRoute(host, {
      method: 'POST',
      body: { confirmTargetEdit: true, targets: [{ id: 'nas', kind: 'ssh', book: 'TEST', scopeDirs: ['/work/fixed'] }] },
    })
    expect(edited.status).toBe(200)
    const gate = (configOf(edited).writeGates as Array<Record<string, unknown>>)[0]
    expect(gate).toMatchObject({ targetId: 'nas', declared: true, env: 'DSH_DEVENV_WRITE' })
    expect(gate?.granted).toBe(false) // 授权与否只认宿主启动环境（这里没授权）
    expect(configOf(edited).targets).toEqual([{ id: 'nas', label: 'nas', kind: 'ssh', book: 'TEST', scopeDirs: ['/work/fixed'] }])
    // 工具面也还在（闸门没被抹掉）
    expect(host.names()).toEqual(['env_down', 'env_status', 'env_up', 'env_wait'])
  })

  it('写闸门的授权状态**来自宿主启动环境**（假宿主里 `grant()` 就是那件事）', async () => {
    const env = 'DSH_DEVENV_CARD_GRANT_TEST'
    const targets = [{ id: 'w', kind: 'local', scopeDirs: ['/work/a'], writeCapability: { env, label: '变更操作' } }]
    const granted = makeHost()
    granted.grant(env) // 必须在 mount 之前（判定源在 apply 期绑定）
    granted.mount({ targets })
    const yes = (configOf(await callRoute(granted)).writeGates as Array<Record<string, unknown>>)[0]
    expect(yes?.granted).toBe(true)

    const notGranted = makeHost()
    notGranted.mount({ targets })
    const no = (configOf(await callRoute(notGranted)).writeGates as Array<Record<string, unknown>>)[0]
    expect(no?.granted).toBe(false)
  })
})

describe('路由：审计（被拒的与成功的都进）', () => {
  it('成功分 `config.scalars` / `config.targets`；被拒带码', async () => {
    const dir = tempDir()
    const auditFile = join(dir, 'audit.jsonl')
    const host = makeHost()
    host.mount({ targets: AUDIT_TARGETS, auditFile })

    await callRoute(host, { method: 'POST', body: { probeTimeoutMs: 2000 } })
    await callRoute(host, { method: 'POST', body: { confirmTargetEdit: true, targets: [TARGET_HERE] } })
    await callRoute(host, { method: 'POST', body: { targets: [TARGET_HERE] } }) // 缺确认 → 被拒
    await callRoute(host, { method: 'POST', body: { writeCapability: { env: 'HOME' } } }) // 提权面 → 被拒

    const lines = readFileSync(auditFile, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as Record<string, unknown>)
    expect(lines.map((line) => [line.action, line.allowed, line.code])).toEqual([
      ['config.scalars', true, undefined],
      ['config.targets', true, undefined],
      ['config.save', false, 'CONFIRMATION_REQUIRED'],
      ['config.save', false, 'CAPABILITY_READONLY'],
    ])
    expect(lines.every((line) => line.targetId === 'card')).toBe(true)
    expect(typeof lines[0]?.atIso).toBe('string')
  })

  it('审计写不进去 → 本次请求**不返回成功**（fail-closed，不假装记下了）', async () => {
    const dir = tempDir()
    const asDirectory = join(dir, 'not-a-file')
    mkdirSync(asDirectory)
    const host = makeHost()
    host.mount({ targets: AUDIT_TARGETS, auditFile: asDirectory })
    await expect(callRoute(host, { method: 'POST', body: { probeTimeoutMs: 2000 } })).rejects.toThrow('审计写入失败')
  })
})
