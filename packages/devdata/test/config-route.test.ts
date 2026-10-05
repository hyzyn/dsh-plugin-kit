/**
 * 配置卡片的**数据面**：patch 校验（`normalizeCardPatch`）、目标校验（`normalizeTargets`）、
 * 快照（`configSnapshotFrom`）与那条 `GET/POST /api/dsh-devdata/config` 路由。
 *
 * ## 为什么值得一整份文件
 *
 * 卡片是**唯一**一条能经 HTTP 改这份配置的路径，于是它同时是：
 *
 *   1. **提权面**：两档能力（`writeCapability` / `dangerousReadCapability`）的授权判据是
 *      「宿主启动时那个环境变量是不是 TRUTHY」，而变量名来自配置——若能经 POST 改 `env` 名，
 *      页内脚本一条请求就等于免重启提权。所以那两档在写入路径上**一律 400**（本文件有一组用例钉住，
 *      含藏在 `targets[i]` 里的那种写法）；
 *   2. **静默降级面**：卡片改目标是**替换整份 targets**，而能力字段又不许出现在 body 里——
 *      两者叠起来会「编辑一次目标，能力声明全被抹掉」。`preserveCapabilities` 是那条补丁，
 *      本文件把它钉住；
 *   3. **错诊断面**：类型/范围必须**先判后写**（docker 踩过：非法值写进 settings 之后整段配置
 *      在下次启动静默退回默认）。所以「被拒时 settings 一次都没被写过」也要断言。
 *
 * 假宿主只做三件事的真：服务注入、事件广播、登记可撤销（与 `plugin.test.ts` 那份同一套夹具）。
 * 不碰真 profile、不连任何目标。
 *
 * **一条诚实的边界**：假宿主的 `settings.update` 是 `Object.assign`（浅合并），而真宿主的
 * `dsh-settings` 用 `mergeLayers`（**深**合并）。所以「写 `plan.maxRows` 不会把 `plan.maxCost`
 * 抹掉」这条**只能在两条路径上断言**：① 没有 settings 服务时的兜底路径（`mergeSection`，本文件
 * 用 `settings:false` 的假宿主验）；② 真机（`scripts/verify-devdata-card.mjs` 走真 settings 栈）。
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  CARD_FIELDS,
  capabilityEditRefusal,
  configSnapshotFrom,
  declaredDbs,
  mergeSection,
  normalizeCardPatch,
  normalizeConfig,
  normalizeProjectContext,
  normalizeTargets,
  preserveCapabilities,
} from '../src/index.js'
import { callRoute, makeReq, makeRes, type CallResult, type RequestOptions } from './fake-route.js'
import { CWD, makeHost, redisTarget } from './fake-host.js'

/* ------------------------------------------------------------------ *
 * 一次性目录（审计落点）
 * ------------------------------------------------------------------ */

const tempDirs: string[] = []
afterEach(() => {
  while (tempDirs.length > 0) rmSync(tempDirs.pop() as string, { recursive: true, force: true })
})
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-devdata-card-'))
  tempDirs.push(dir)
  return dir
}

/* ------------------------------------------------------------------ *
 * 路由夹具（与 docker 的 config-route.test.ts 同形：极简 req/res）
 * ------------------------------------------------------------------ */

async function call(host: Host, options: RequestOptions = {}): Promise<CallResult> {
  return callRoute(host, '/api/dsh-devdata/config', options)
}

/** 两个目标 + 两档能力声明 + 持久审计的起手配置（卡片要展示与保存的东西）。 */
function seeded(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    enabled: true,
    announceToAgent: true,
    timeoutMs: 5000,
    plan: { maxRows: 10_000, maxCost: 5 },
    auditFile: '',
    targets: [
      redisTarget({
        writeCapability: { env: 'DSH_DEVDATA_WRITE', label: '受限写' },
        dangerousReadCapability: { env: 'DSH_DEVDATA_DANGEROUS_READ', label: '危险读' },
      }),
      redisTarget({ id: 'redis-other', label: '第二个', scopeDirs: [CWD], port: 6380 }),
    ],
    ...overrides,
  }
}

/* ================================================================== *
 * 一、patch 校验：先判后写、能力只读、目标要确认
 * ================================================================== */

describe('normalizeCardPatch：字段白名单与范围（先判后写）', () => {
  it('空的 patch 与不认识的字段都报错（**不静默丢弃**：静默丢弃会让人以为保存成功）', () => {
    expect(normalizeCardPatch({})).toEqual({ error: '没有要改的字段（patch 是空的）' })
    expect(normalizeCardPatch({ nope: 1 })).toEqual({ error: '不认识的字段：nope' })
    // 计划护栏用扁平键：写成嵌套对象会被点出来（两种写法都能落地，但 patch 里看不出改的是哪一个）
    expect(normalizeCardPatch({ plan: { maxRows: 1 } })).toEqual({
      error: '不认识的字段：plan（计划护栏用扁平键 `plan.maxRows` / `plan.maxCost`，不是嵌套对象）',
    })
    expect(CARD_FIELDS).toEqual(['enabled', 'announceToAgent', 'auditFile', 'timeoutMs', 'plan.maxRows', 'plan.maxCost'])
  })

  it('类型与范围先判：非法值一律 400，且**patch 里什么都没有**（不许先落地再抛）', () => {
    const bad: Array<[Record<string, unknown>, string]> = [
      [{ enabled: 'yes' }, 'enabled 必须是布尔值'],
      [{ announceToAgent: 1 }, 'announceToAgent 必须是布尔值'],
      [{ auditFile: 7 }, 'auditFile 必须是字符串'],
      [{ timeoutMs: 99 }, 'timeoutMs 必须是 100~60000 的整数（毫秒）'],
      [{ timeoutMs: 60_001 }, 'timeoutMs 必须是 100~60000 的整数（毫秒）'],
      [{ timeoutMs: 1.5 }, 'timeoutMs 必须是 100~60000 的整数（毫秒）'],
      [{ 'plan.maxRows': -1 }, '必须是非负数字'],
      [{ 'plan.maxRows': '10' }, '必须是非负数字'],
      [{ 'plan.maxCost': Number.NaN }, '必须是非负数字'],
    ]
    for (const [input, needle] of bad) {
      const result = normalizeCardPatch(input)
      expect('error' in result, JSON.stringify(input)).toBe(true)
      if ('error' in result) {
        expect(result.error, JSON.stringify(input)).toContain(needle)
        expect(result.patch, JSON.stringify(input)).toBeUndefined()
      }
    }
  })

  it('合法标量收敛成 patch：字符串去空白、`plan.*` 合成一个 plan 对象', () => {
    expect(normalizeCardPatch({ enabled: false, auditFile: '  ~/.dsh/devdata-audit.jsonl  ', timeoutMs: 100 })).toEqual({
      patch: { enabled: false, auditFile: '~/.dsh/devdata-audit.jsonl', timeoutMs: 100 },
    })
    expect(normalizeCardPatch({ 'plan.maxRows': 0, 'plan.maxCost': 3 })).toEqual({ patch: { plan: { maxRows: 0, maxCost: 3 } } })
  })

  it('`plan.maxRows: 0` 是**有意收紧**（一行都不许），与「留空 = 不做这一层检查」不是一回事', () => {
    expect(normalizeCardPatch({ 'plan.maxRows': 0 })).toEqual({ patch: { plan: { maxRows: 0 } } })
  })
})

describe('能力档在写入路径上**只读**（免重启提权那条不变量）', () => {
  it('顶层出现能力字段 → 400 + 专用码与文案（说清为什么、以及该去哪儿改）', () => {
    for (const field of ['writeCapability', 'dangerousReadCapability']) {
      const result = normalizeCardPatch({ [field]: { env: 'HOME', label: 'x' } })
      expect('error' in result, field).toBe(true)
      if ('error' in result) {
        expect(result.code, field).toBe('CAPABILITY_READONLY')
        expect(result.error).toContain('只读')
        // 恢复路径必须点名 profile 补丁层：一句「不允许」不产生新信息
        expect(result.error).toContain('profile 补丁层')
        expect(result.error).toContain(field)
      }
    }
  })

  it('**藏在 `targets[i]` 里也一样拒**（换位置不等于换语义——这是提权面，不是字段名问题）', () => {
    const result = normalizeCardPatch({
      confirmTargetEdit: true,
      targets: [{ id: 'x', engine: 'redis', scopeDirs: [CWD], writeCapability: { env: 'HOME' } }],
    })
    expect('error' in result).toBe(true)
    if ('error' in result) {
      expect(result.code).toBe('CAPABILITY_READONLY')
      expect(result.error).toContain('targets[0].writeCapability')
    }
  })

  it('拒绝文案把「为什么」说全：判据是启动环境、改 env 名等于免重启提权', () => {
    const text = capabilityEditRefusal('writeCapability')
    expect(text).toContain('启动时')
    expect(text).toContain('免重启提权')
    expect(text).toContain('HTTP 只能关、不能开')
  })

  it('**能力字段改名不算绕过**：`normalizeTargets` 也拦（路由与纯函数两条路都过它）', () => {
    const result = normalizeTargets([{ id: 'x', engine: 'redis', dangerousReadCapability: { env: 'HOME' } }])
    expect('error' in result).toBe(true)
    if ('error' in result) expect(result.code).toBe('CAPABILITY_READONLY')
  })
})

describe('normalizeCardPatch：改目标要逐次确认', () => {
  it('不带 `confirmTargetEdit` → CONFIRMATION_REQUIRED（目标声明与 `env_down` 同一档）', () => {
    const result = normalizeCardPatch({ targets: [{ id: 'x', engine: 'redis' }] })
    expect('error' in result).toBe(true)
    if ('error' in result) {
      expect(result.code).toBe('CONFIRMATION_REQUIRED')
      expect(result.error).toContain('confirmTargetEdit')
      expect(result.error).toContain('profile 补丁层')
    }
  })

  it('带了确认位 → patch 里是**校验过**的行；确认位本身不进配置', () => {
    const result = normalizeCardPatch({
      confirmTargetEdit: true,
      timeoutMs: 800,
      targets: [
        {
          id: 'redis-248',
          label: '  248 Redis  ',
          engine: 'redis',
          env: 'test-shared',
          scopeDirs: ['/w/project-a', '   '],
          host: '127.0.0.1',
          port: 6379,
          maxScanCount: 50,
          credentialRef: 'env:REDIS_PASS',
        },
      ],
    })
    expect(result).toEqual({
      patch: {
        timeoutMs: 800,
        targets: [
          {
            id: 'redis-248',
            label: '248 Redis',
            engine: 'redis',
            env: 'test-shared',
            scopeDirs: ['/w/project-a'],
            host: '127.0.0.1',
            port: 6379,
            maxScanCount: 50,
            credentialRef: 'env:REDIS_PASS',
          },
        ],
      },
    })
  })

  it('删光目标也是合法状态（「没配目标 = 一个工具都不注册」那条由注册面钉住）', () => {
    expect(normalizeCardPatch({ confirmTargetEdit: true, targets: [] })).toEqual({ patch: { targets: [] } })
  })
})

describe('normalizeTargets：逐行逐字段报错（不静默丢行）', () => {
  it('认不出的引擎 / 环境 / 缺字段 → 指到 `targets[i].字段`', () => {
    const cases: Array<[unknown, string]> = [
      ['not-an-array', 'targets 必须是数组'],
      [[null], 'targets[0] 必须是对象'],
      [[{ engine: 'redis' }], 'targets[0].id'],
      [[{ id: 'x' }], 'targets[0].engine'],
      [[{ id: 'x', engine: 'oracle' }], 'targets[0].engine 认不出'],
      [[{ id: 'x', engine: 'redis', env: 'test' }], 'targets[0].env 认不出'],
      [[{ id: 'x', engine: 'redis', scopeDirs: 'a,b' }], 'targets[0].scopeDirs'],
      [[{ id: 'x', engine: 'redis', maxScanCount: 0 }], 'targets[0].maxScanCount'],
      [[{ id: 'x', engine: 'redis', maxScanCount: 1001 }], 'targets[0].maxScanCount'],
      [[{ id: 'x', engine: 'redis', label: 3 }], 'targets[0].label'],
      [[{ id: 'x', engine: 'redis', credentialRef: 3 }], 'targets[0].credentialRef'],
      [
        [
          { id: 'x', engine: 'redis' },
          { id: 'x', engine: 'redis' },
        ],
        '重名',
      ],
    ]
    for (const [input, needle] of cases) {
      const result = normalizeTargets(input)
      expect('error' in result, JSON.stringify(input)).toBe(true)
      if ('error' in result) expect(result.error, JSON.stringify(input)).toContain(needle)
    }
  })

  it('连接信息要么两个都给、要么都不给（少一个不是「用默认端口」，是配置没写完）', () => {
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ id: 'x', engine: 'redis', port: 6379 }, 'targets[0].port 给了但 host 是空的'],
      [{ id: 'x', engine: 'redis', host: '127.0.0.1' }, 'targets[0].port 必须与 host 一起给'],
      [{ id: 'x', engine: 'redis', host: '127.0.0.1', port: 0 }, 'targets[0].port 必须是 1~65535 的整数'],
      [{ id: 'x', engine: 'redis', host: '127.0.0.1', port: 65_536 }, 'targets[0].port 必须是 1~65535 的整数'],
      [{ id: 'x', engine: 'redis', host: '127.0.0.1', port: 6379, db: -1 }, 'targets[0].db 必须是非负整数'],
      [{ id: 'x', engine: 'redis', db: 2 }, 'targets[0].db 给了但没有连接'],
    ]
    for (const [row, needle] of cases) {
      const result = normalizeTargets([row])
      expect('error' in result, JSON.stringify(row)).toBe(true)
      if ('error' in result) expect(result.error, JSON.stringify(row)).toContain(needle)
    }
  })

  it('`dbs`（可浏览的库）：坏值 / 非数组 / 没有连接时逐条报错——**卡片与解析层同一套判据**', () => {
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ id: 'x', engine: 'redis', host: '127.0.0.1', port: 6379, dbs: '0,1' }, 'targets[0].dbs 必须是库号数组'],
      [{ id: 'x', engine: 'redis', host: '127.0.0.1', port: 6379, dbs: [0, -1] }, 'targets[0].dbs 里有不是库号的值'],
      [{ id: 'x', engine: 'redis', host: '127.0.0.1', port: 6379, dbs: [999] }, 'targets[0].dbs 里有不是库号的值'],
      [{ id: 'x', engine: 'redis', dbs: [1] }, 'targets[0].dbs 给了但没有连接'],
    ]
    for (const [row, needle] of cases) {
      const result = normalizeTargets([row])
      expect('error' in result, JSON.stringify(row)).toBe(true)
      if ('error' in result) expect(result.error, JSON.stringify(row)).toContain(needle)
    }
  })

  it('空的 `scopeDirs` / 空的环境标签都**保留为空**（不替用户填默认值 = 不替他授权）', () => {
    const result = normalizeTargets([{ id: 'x', engine: 'redis', scopeDirs: [] }])
    expect(result).toEqual({ targets: [{ id: 'x', engine: 'redis', scopeDirs: [] }] })
  })

  it('校验过的行必须被解析层**一行不少**地收下、且**一条 problem 都不报**（两套规则分叉时在这里红）', () => {
    const result = normalizeTargets([
      { id: 'x', engine: 'redis', env: 'dev', scopeDirs: [CWD], host: '127.0.0.1', port: 6379, db: 1, dbs: [1, 3] },
    ])
    expect('targets' in result).toBe(true)
    if ('targets' in result) {
      const parsed = normalizeConfig({ targets: result.targets })
      expect(parsed.targets).toHaveLength(1)
      expect(parsed.problems).toEqual([])
      expect(parsed.targets[0]?.connection).toEqual({ host: '127.0.0.1', port: 6379, db: 1 })
      // 存下来的就是用户写的那份（去重升序），允许集另由 `declaredDbs` 把 `db` 并进去。
      expect(parsed.targets[0]?.dbs).toEqual([1, 3])
      expect(declaredDbs(parsed.targets[0]!)).toEqual([1, 3])
    }
  })
})

/* ================================================================== *
 * 二、快照与两条补丁（能力声明、深合并）
 * ================================================================== */

describe('configSnapshotFrom：目标全量只读 + 两档能力的**当前状态**', () => {
  const live = normalizeConfig(
    seeded() as Record<string, unknown>,
  )

  it('标量、计划护栏与目标字段都在（含连接与凭据**引用**）', () => {
    const snapshot = configSnapshotFrom(live)
    expect(snapshot).toMatchObject({
      enabled: true,
      announceToAgent: true,
      timeoutMs: 5000,
      plan: { maxRows: 10_000, maxCost: 5 },
      auditFile: '',
    })
    expect(snapshot.targets).toHaveLength(2)
    expect(snapshot.targets[0]).toMatchObject({
      id: 'redis-248',
      label: '248 Redis',
      engine: 'redis',
      env: 'test-shared',
      scopeDirs: [CWD],
      maxScanCount: 200,
      host: '127.0.0.1',
      port: 6379,
    })
  })

  it('枚举列表由宿主侧给（卡片渲染下拉框，不自己抄一份必然漂的字面量）', () => {
    const snapshot = configSnapshotFrom(live)
    expect(snapshot.engines).toEqual(['sqlserver', 'mysql', 'postgres', 'redis', 'rocketmq', 'dm'])
    expect(snapshot.envs).toEqual(['dev', 'test-shared', 'test-isolated', 'production', 'unknown'])
  })

  it('环境档的**写权限事实**也由宿主侧给（卡片的环境胶囊不许按名字猜）', () => {
    const snapshot = configSnapshotFrom(live)
    expect(snapshot.envFacts).toEqual([
      { env: 'dev', allowsWrite: true, requiresConfirm: false },
      { env: 'test-shared', allowsWrite: true, requiresConfirm: true },
      { env: 'test-isolated', allowsWrite: true, requiresConfirm: false },
      { env: 'production', allowsWrite: false, requiresConfirm: true },
      { env: 'unknown', allowsWrite: false, requiresConfirm: true },
    ])
  })

  it('两档能力给出「声明的变量名 + 是否已授权 + 怎么授权」；没接入闸门的**键缺席**（不是 null 占位）', () => {
    const snapshot = configSnapshotFrom(live)
    const first = snapshot.targets[0] as Record<string, unknown>
    expect(first.writeCapability).toMatchObject({ env: 'DSH_DEVDATA_WRITE', label: '受限写', granted: false })
    expect(String((first.writeCapability as Record<string, unknown>).howTo)).toContain('DSH_DEVDATA_WRITE')
    const second = snapshot.targets[1] as Record<string, unknown>
    expect('writeCapability' in second).toBe(false)
    expect('dangerousReadCapability' in second).toBe(false)
  })

  it('凭据只给**引用**（`credentialRef`），不给任何明文', () => {
    const withRef = normalizeConfig({ targets: [redisTarget({ credentialRef: 'env:REDIS_PASS' })] })
    const snapshot = configSnapshotFrom(withRef)
    expect((snapshot.targets[0] as Record<string, unknown>).credentialRef).toBe('env:REDIS_PASS')
  })
})

describe('preserveCapabilities：改目标不许把能力声明抹掉（静默安全降级）', () => {
  const previous = normalizeConfig(seeded() as Record<string, unknown>).targets

  it('按 id 把原有声明带回来；新增的行**没有**声明（不凭空授权）', () => {
    const rows = preserveCapabilities(
      [{ id: 'redis-248', engine: 'redis', scopeDirs: [] }, { id: 'redis-new', engine: 'redis', scopeDirs: [] }],
      previous,
    )
    expect(rows[0]?.writeCapability).toEqual({ env: 'DSH_DEVDATA_WRITE', label: '受限写' })
    expect(rows[0]?.dangerousReadCapability).toEqual({ env: 'DSH_DEVDATA_DANGEROUS_READ', label: '危险读' })
    expect('writeCapability' in (rows[1] as Record<string, unknown>)).toBe(false)
  })

  it('改名的行算新增（它已经不是同一个目标了）——卡片上也写着这条', () => {
    const rows = preserveCapabilities([{ id: 'renamed', engine: 'redis' }], previous)
    expect('writeCapability' in rows[0]).toBe(false)
  })

  it('原来就没声明的目标，补一次也不会凭空长出来', () => {
    const rows = preserveCapabilities([{ id: 'redis-other', engine: 'redis' }], previous)
    expect('writeCapability' in rows[0]).toBe(false)
  })
})

describe('mergeSection：兜底路径的深合并（数组与标量一律替换）', () => {
  it('普通对象递归合并（写 `plan.maxRows` 不会把 `plan.maxCost` 抹掉）', () => {
    expect(mergeSection({ plan: { maxRows: 10, maxCost: 5 }, timeoutMs: 5000 }, { plan: { maxRows: 3 } })).toEqual({
      plan: { maxRows: 3, maxCost: 5 },
      timeoutMs: 5000,
    })
  })

  it('数组整段替换（目标列表是「这一份声明」，不是逐元素合并）', () => {
    expect(mergeSection({ targets: [{ id: 'a' }, { id: 'b' }] }, { targets: [{ id: 'c' }] })).toEqual({ targets: [{ id: 'c' }] })
  })

  it('不认识的键照原样进结果（合并层不做校验，校验在上游），但 `__proto__` 一类被跳掉', () => {
    const merged = mergeSection({}, JSON.parse('{"__proto__":{"polluted":true},"ok":1}') as Record<string, unknown>)
    expect(merged.ok).toBe(1)
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    expect(Object.getPrototypeOf(merged)).toBe(Object.prototype)
  })
})

/* ================================================================== *
 * 三、路由：围栏、恢复入口、失败审计、热应用
 * ================================================================== */

describe('POST /api/dsh-devdata/project-context：只读模型预检', () => {
  const PATH = '/api/dsh-devdata/project-context'

  it('成功结果与纯模型一致：归一化、缺省开关；停用和无 settings 时仍可用', async () => {
    const host = makeHost({ settings: false })
    host.mount(seeded({ enabled: false }))
    const input = { root: ' /nonexistent/devdata-preflight/../project ', project: ' demo-app ' }
    const res = await callRoute(host, PATH, { method: 'POST', body: input })
    expect(res.status).toBe(200)
    expect(res.json).toEqual(normalizeProjectContext(input))
    expect(res.json?.context).toEqual({
      root: '/nonexistent/project', project: 'demo-app', mode: 'readonly',
      enabled: { environment: false, data: false, front: false }, readOnly: true,
    })
    expect(host.names()).toEqual([])
  })

  it('release + 三面启用仍只读；成功与失败均不改配置、工具或审计文件', async () => {
    const file = join(tempDir(), 'audit.jsonl')
    writeFileSync(file, 'unchanged\n')
    const host = makeHost()
    host.mount(seeded({ auditFile: file }))
    const before = await call(host)
    const stored = JSON.stringify(host.stored)
    const tools = host.names()
    const input = { root: CWD, project: 'release-app', mode: 'release', enabled: { environment: true, data: true, front: true } }
    const res = await callRoute(host, PATH, { method: 'POST', body: input })
    expect(res.status).toBe(200)
    expect(res.json).toEqual(normalizeProjectContext(input))
    const refused = await callRoute(host, PATH, { method: 'POST', body: { ...input, writeCapability: { env: 'CI' }, targets: [] } })
    expect(refused.status).toBe(400)
    expect(refused.json?.context).toBeNull()
    expect(refused.json?.problems).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'writeCapability' }), expect.objectContaining({ field: 'targets' }),
    ]))
    expect(JSON.stringify(host.stored)).toBe(stored)
    expect(await call(host)).toEqual(before)
    expect(host.names()).toEqual(tools)
    expect(readFileSync(file, 'utf8')).toBe('unchanged\n')
  })

  it('逐字段问题与模型一致，不把非法输入产成 context', async () => {
    const host = makeHost()
    host.mount(seeded())
    const input = { root: './relative', project: '../other', mode: 'write', enabled: { data: 'true', extra: true }, readOnly: false }
    const res = await callRoute(host, PATH, { method: 'POST', body: input })
    expect(res.status).toBe(400)
    expect(res.json).toEqual(normalizeProjectContext(input))
    expect((res.json?.problems as Array<{ field: string }>).map((problem) => problem.field))
      .toEqual(['readOnly', 'root', 'project', 'mode', 'enabled.extra', 'enabled.data'])
  })

  it.each([
    { remoteAddress: '10.0.0.1' },
    { host: '192.0.2.1:3080' },
    { headers: { 'sec-fetch-site': 'cross-site' } },
    { headers: { origin: 'http://example.invalid:3080' } },
  ])('严格围栏先于方法与 JSON：%j', async (options) => {
    const host = makeHost()
    host.mount(seeded())
    const res = await callRoute(host, PATH, { ...options, method: 'DELETE', raw: '{broken' })
    expect(res).toEqual({ status: 403, json: { error: 'forbidden: loopback-only' } })
  })

  it('只允许 POST；坏 JSON、空体、非对象与超大 body 沿用 400 风格', async () => {
    const host = makeHost()
    host.mount(seeded())
    for (const method of ['GET', 'PUT', 'DELETE']) {
      expect(await callRoute(host, PATH, { method }))
        .toEqual({ status: 405, json: { error: `method not allowed: ${method}` } })
    }
    for (const raw of ['', '{broken', 'null', '[]', 'true', '{"root":"' + 'x'.repeat(1024 * 1024) + '"}']) {
      expect(await callRoute(host, PATH, { method: 'POST', raw }))
        .toEqual({ status: 400, json: { error: 'invalid JSON body' } })
    }
  })

  it('回环无来源证明可用；JSON 响应保持 no-store / nosniff', async () => {
    const host = makeHost()
    host.mount(seeded())
    const req = makeReq({ method: 'POST', body: { root: CWD, project: 'demo' }, headers: { 'sec-fetch-site': '' } })
    const res = makeRes()
    await host.routes.get(PATH)!.handler(req as never, res as never)
    expect(res.status).toBe(200)
    expect(res.headers['cache-control']).toBe('no-store')
    expect(res.headers['x-content-type-options']).toBe('nosniff')
  })

  /*
   * **旧 API 原样**：`POST /api/dsh-devdata/preflight` 是**另加**的一条，这一条的行为一个字都不许动
   * （2026-10-05）。所以这里钉住它与新路由的分工——它**不看配置**（停用、没有目标、没有 settings
   * 都照常 200），也**不认** `target`（那是新路由的字段，在这里是未知字段 → 400）。
   * 判据见 `docs/devkit-config.md` 的「模型 MVP」那一行。
   */
  it('**不看配置**：停用 + 没有任何目标时照样 200（新路由 `/preflight` 才会因配置不可运行而失败）', async () => {
    const host = makeHost({ settings: false })
    host.mount({ enabled: false, targets: [] })
    const res = await callRoute(host, PATH, { method: 'POST', body: { root: CWD, project: 'demo' } })
    expect(res.status).toBe(200)
    expect(res.json).toEqual(normalizeProjectContext({ root: CWD, project: 'demo' }))
    expect(host.routes.get('/api/dsh-devdata/preflight')?.kind).toBe('exact')
  })

  it('`target` 是**新路由**的字段：旧路由按未知字段拒（两条 API 不混）', async () => {
    const host = makeHost()
    host.mount(seeded())
    const res = await callRoute(host, PATH, { method: 'POST', body: { root: CWD, project: 'demo', target: 'redis-248' } })
    expect(res.status).toBe(400)
    expect(res.json?.context).toBeNull()
    expect((res.json?.problems as Array<{ field: string }>).map((problem) => problem.field)).toEqual(['target'])
  })
})

describe('GET/POST /api/dsh-devdata/config', () => {
  it('GET → 200 快照；`persisted` 如实反映有没有 settings 服务', async () => {
    const host = makeHost()
    host.mount(seeded())
    const res = await call(host)
    expect(res.status).toBe(200)
    expect(res.json?.ok).toBe(true)
    expect(res.json?.persisted).toBe(true)
    expect((res.json?.config as Record<string, unknown>).targets).toHaveLength(2)
  })

  it('**插件停用后 `/config` 照样能用**（它是重新启用插件的唯一 UI 入口）', async () => {
    const host = makeHost()
    host.mount(seeded({ enabled: false }))
    expect(host.names()).toEqual([]) // 停用时一个工具都不注册
    const res = await call(host)
    expect(res.status).toBe(200)
    expect((res.json?.config as Record<string, unknown>).enabled).toBe(false)
    const saved = await call(host, { method: 'POST', body: { enabled: true } })
    expect(saved.status).toBe(200)
    expect((saved.json?.config as Record<string, unknown>).enabled).toBe(true)
  })

  it('非回环来源 → 403（围栏在方法判定之前）', async () => {
    const host = makeHost()
    host.mount(seeded())
    const res = await call(host, { remoteAddress: '10.0.0.1' })
    expect(res.status).toBe(403)
    expect(res.json?.error).toBe('forbidden: loopback-only')
  })

  it('跨站来源 → 403（`sec-fetch-site: cross-site`，围栏先于一切）', async () => {
    const host = makeHost()
    host.mount(seeded())
    const res = await call(host, { headers: { 'sec-fetch-site': 'cross-site' } })
    expect(res.status).toBe(403)
  })

  it('非 GET/POST → 405；JSON 坏了 → 400', async () => {
    const host = makeHost()
    host.mount(seeded())
    const wrongMethod = await call(host, { method: 'DELETE' })
    expect(wrongMethod.status).toBe(405)
    const broken = await call(host, { method: 'POST', raw: '{not json' })
    expect(broken.status).toBe(400)
    expect(broken.json?.error).toBe('invalid JSON body')
    const arrayBody = await call(host, { method: 'POST', raw: '[1,2]' })
    expect(arrayBody.status).toBe(400)
  })

  it('非法 patch → 400，且 **settings 一次都没被写过**（先判后写）', async () => {
    const host = makeHost()
    host.mount(seeded())
    const before = JSON.stringify(host.stored)
    const res = await call(host, { method: 'POST', body: { timeoutMs: 5 } })
    expect(res.status).toBe(400)
    expect(String(res.json?.error)).toContain('timeoutMs')
    expect(JSON.stringify(host.stored)).toBe(before)
    // 拒绝**没有**把配置改坏：GET 里的目标还在
    const after = await call(host)
    expect((after.json?.config as Record<string, unknown>).targets).toHaveLength(2)
  })

  it('POST 一个标量 → 200 落盘，**目标没被抹掉**（`rawSectionRef` 那条真机教训）', async () => {
    const host = makeHost()
    host.mount(seeded())
    const res = await call(host, { method: 'POST', body: { timeoutMs: 1234 } })
    expect(res.status).toBe(200)
    expect(res.json?.persisted).toBe(true)
    const config = res.json?.config as Record<string, unknown>
    expect(config.timeoutMs).toBe(1234)
    expect(config.targets).toHaveLength(2)
  })

  it('**entry 未就绪**（`scope.get()` 还是空对象）时保存标量也不许抹掉目标（真机抓到过的那条）', async () => {
    const host = makeHost()
    host.mount(seeded())
    host.notReady()
    const res = await call(host, { method: 'POST', body: { timeoutMs: 4321 } })
    expect(res.status).toBe(200)
    const config = res.json?.config as Record<string, unknown>
    expect(config.timeoutMs).toBe(4321)
    expect(config.targets).toHaveLength(2)
  })

  it('没有 settings 服务时：只在本进程生效 + 如实标 `persisted:false`，且计划护栏不丢兄弟键', async () => {
    const host = makeHost({ settings: false })
    host.mount(seeded())
    const res = await call(host, { method: 'POST', body: { 'plan.maxRows': 3 } })
    expect(res.status).toBe(200)
    expect(res.json?.persisted).toBe(false)
    const config = res.json?.config as Record<string, unknown>
    // 兜底路径走 mergeSection：写 maxRows 不许把 maxCost 抹掉
    expect(config.plan).toEqual({ maxRows: 3, maxCost: 5 })
    expect(config.targets).toHaveLength(2)
  })

  it('改目标：不带确认 → 400 且码可认；带确认 → 200 且能力声明跟着 id 回来', async () => {
    const host = makeHost()
    host.mount(seeded())
    const denied = await call(host, { method: 'POST', body: { targets: [{ id: 'x', engine: 'redis' }] } })
    expect(denied.status).toBe(400)
    expect(denied.json?.code).toBe('CONFIRMATION_REQUIRED')

    const edited = await call(host, {
      method: 'POST',
      body: {
        confirmTargetEdit: true,
        targets: [
          { id: 'redis-248', engine: 'redis', env: 'test-shared', scopeDirs: [CWD], host: '127.0.0.1', port: 6379 },
          { id: 'redis-new', engine: 'redis', scopeDirs: [CWD] },
        ],
      },
    })
    expect(edited.status).toBe(200)
    expect(edited.json?.persisted).toBe(true)
    const targets = (edited.json?.config as Record<string, unknown>).targets as Array<Record<string, unknown>>
    expect(targets.map((target) => target.id)).toEqual(['redis-248', 'redis-new'])
    // 原有声明按 id 带回来；新行没有（不凭空授权）
    expect(targets[0]?.writeCapability).toMatchObject({ env: 'DSH_DEVDATA_WRITE', granted: false })
    expect('writeCapability' in (targets[1] as Record<string, unknown>)).toBe(false)
    // 工具面跟着热应用（目标从 2 个变成 2 个，但身份变了：这里断言的是列表真的被换掉了）
    expect(host.names()).toContain('devdata_redis_command')
  })

  it('能力字段经 HTTP 提交 → 400 专用码（顶层与 `targets[i]` 里各一条）', async () => {
    const host = makeHost()
    host.mount(seeded())
    const top = await call(host, { method: 'POST', body: { writeCapability: { env: 'HOME' } } })
    expect(top.status).toBe(400)
    expect(top.json?.code).toBe('CAPABILITY_READONLY')
    const nested = await call(host, {
      method: 'POST',
      body: { confirmTargetEdit: true, targets: [{ id: 'x', engine: 'redis', dangerousReadCapability: { env: 'HOME' } }] },
    })
    expect(nested.status).toBe(400)
    expect(nested.json?.code).toBe('CAPABILITY_READONLY')
    // 拒了就是拒了：配置没动、目标数没变
    const after = await call(host)
    expect((after.json?.config as Record<string, unknown>).targets).toHaveLength(2)
  })

  it('能力已授权时快照样如实说（`granted:true` + 通道）——只读面板靠它区分两种通道', async () => {
    const host = makeHost()
    host.grant('DSH_DEVDATA_WRITE') // 必须在 mount 之前：授权只认启动时的环境
    host.mount(seeded())
    const res = await call(host)
    const targets = (res.json?.config as Record<string, unknown>).targets as Array<Record<string, unknown>>
    expect(targets[0]?.writeCapability).toMatchObject({ granted: true, via: 'env' })
    expect(targets[0]?.dangerousReadCapability).toMatchObject({ granted: false })
  })

  it('被拒与成功**都进审计**（配了 auditFile 就落 JSON 行：成功分 `config.targets` / `config.scalars`）', async () => {
    const file = join(tempDir(), 'audit.jsonl')
    const host = makeHost()
    host.mount(seeded({ auditFile: file }))
    await call(host, { method: 'POST', body: { timeoutMs: 900 } })
    await call(host, { method: 'POST', body: { targets: [{ id: 'x', engine: 'redis' }] } })
    await call(host, {
      method: 'POST',
      body: { confirmTargetEdit: true, targets: [{ id: 'redis-248', engine: 'redis', scopeDirs: [CWD] }] },
    })
    const lines = readFileSync(file, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as Record<string, unknown>)
    expect(lines.map((line) => [line.action, line.allowed])).toEqual([
      ['config.scalars', true],
      ['config.save', false],
      ['config.targets', true],
    ])
    expect(lines[1]?.code).toBe('CONFIRMATION_REQUIRED')
    // 卡片变更**没有引擎**（它不是一次引擎调用）——审计行不许编一个
    expect('engine' in (lines[0] as Record<string, unknown>)).toBe(false)
  })

  it('审计写不进去就让它抛（fail-closed：不许「改完了、没记下」）', async () => {
    // 把 auditFile 指到一个**目录**：appendFileSync 会 EISDIR
    const host = makeHost()
    host.mount(seeded({ auditFile: tempDir() }))
    await expect(
      call(host, { method: 'POST', body: { timeoutMs: 900 } }),
    ).rejects.toThrow('审计写入失败')
  })

  it('没配 auditFile 时至少进日志（拒绝走 warn 并带码）', async () => {
    const host = makeHost()
    host.mount(seeded())
    await call(host, { method: 'POST', body: { targets: [{ id: 'x', engine: 'redis' }] } })
    const warned = host.loggerLines().filter((line) => line.startsWith('warn '))
    expect(warned.some((line) => line.includes('拒绝 config.save') && line.includes('CONFIRMATION_REQUIRED'))).toBe(true)
  })
})

/* ================================================================== *
 * 证据链总览：`POST /api/dsh-devdata/evidence`（P13 第一版，2026-10-04）
 *
 * 这条路上的东西**一个都不许改**：它只读项目里的三份清单（存在性 / 可否解析 / 项目名一致 /
 * 条目数），不连目标、不写文件。所以这里要钉的不是「权限够不够」，而是两件相反的事：
 *   ① **护栏还在**（回环围栏、方法、坏 body）；
 *   ② **不装**——路径写错与清单缺失分开报；Jenkins 那一格如实说「未接」；
 *      参数校验在读文件之前（浏览器是本模块新增的调用方）。
 * ================================================================== */

describe('POST /api/dsh-devdata/evidence', () => {
  const PATH = '/api/dsh-devdata/evidence'
  const PROJECT = 'cdqas'

  /** 一个项目目录：只有 `verify/<项目>.yaml`（另两面故意留空，用来看「缺失」那两格）。 */
  function evidenceRoot(): string {
    const root = tempDir()
    mkdirSync(join(root, 'verify'), { recursive: true })
    writeFileSync(
      join(root, 'verify', `${PROJECT}.yaml`),
      ['version: 1', `project: ${PROJECT}`, 'assertions:', '  - id: redis-alive', '    target: redis-248', '    statement: PING', '    expect: { eq: PONG }', '    severity: fail', ''].join('\n'),
    )
    return root
  }

  it('回环 POST → 200，报告里三面都有；**没有的清单如实说没有**，Jenkins 说「未接」', async () => {
    const host = makeHost()
    host.mount(seeded())
    const res = await callRoute(host, PATH, { method: 'POST', body: { root: evidenceRoot(), project: PROJECT } })
    expect(res.status).toBe(200)
    expect(res.json?.ok).toBe(true)
    const report = res.json?.report as Record<string, unknown>
    expect(report.project).toBe(PROJECT)
    expect(report.jenkins).toEqual({ state: 'unwired' })
    const faces = report.faces as Array<Record<string, unknown>>
    expect(faces.map((item) => [item.face, item.state])).toEqual([
      ['ready', 'missing'],
      ['verify', 'parsed'],
      ['web', 'missing'],
    ])
    expect(faces[1]?.count).toBe(1)
    // 三面各自的归属与「看结论要敲哪个工具」都在——总览只给入口，不给结论。
    expect(faces.map((item) => item.tool)).toEqual(['env_wait', 'devdata_verify', 'site_verify'])
  })

  it('非回环 → 403；GET → 405；坏 JSON → 400（围栏先于一切，与 `/config` 同一套）', async () => {
    const host = makeHost()
    host.mount(seeded())
    const forbidden = await callRoute(host, PATH, { method: 'POST', body: {}, remoteAddress: '10.0.0.1' })
    expect(forbidden.status).toBe(403)
    expect(forbidden.json?.error).toBe('forbidden: loopback-only')

    const wrongMethod = await callRoute(host, PATH, { method: 'GET' })
    expect(wrongMethod.status).toBe(405)

    const broken = await callRoute(host, PATH, { method: 'POST', raw: '{not json' })
    expect(broken.status).toBe(400)
  })

  it('路径写错与项目名不合法 → 400 带**各自的码**（不是「三份清单都没有」）', async () => {
    const host = makeHost()
    host.mount(seeded())
    const badRoot = await callRoute(host, PATH, { method: 'POST', body: { root: '/definitely/not/here', project: PROJECT } })
    expect(badRoot.status).toBe(400)
    expect(badRoot.json?.code).toBe('BAD_ROOT')

    const badProject = await callRoute(host, PATH, { method: 'POST', body: { root: evidenceRoot(), project: '../evil' } })
    expect(badProject.status).toBe(400)
    expect(badProject.json?.code).toBe('BAD_PROJECT')
  })

  it('这一读也进审计（成功与拒绝各一行，`targetId` 记 `card`：调用方就是那张卡）', async () => {
    const file = join(tempDir(), 'audit.jsonl')
    const host = makeHost()
    host.mount(seeded({ auditFile: file }))
    await callRoute(host, PATH, { method: 'POST', body: { root: evidenceRoot(), project: PROJECT } })
    await callRoute(host, PATH, { method: 'POST', body: { root: evidenceRoot(), project: 'a/b' } })
    const lines = readFileSync(file, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as Record<string, unknown>)
    expect(lines.map((line) => [line.action, line.allowed])).toEqual([
      ['evidence.read', true],
      ['evidence.read', false],
    ])
    expect(lines[0]?.targetId).toBe('card')
  })

  it('**插件停用时这条路由照常能用**（与 `/config` 同口径：卡片是重新启用的唯一 UI 入口）', async () => {
    const host = makeHost()
    host.mount(seeded({ enabled: false }))
    expect(host.names()).toEqual([])
    const res = await callRoute(host, PATH, { method: 'POST', body: { root: evidenceRoot(), project: PROJECT } })
    expect(res.status).toBe(200)
  })
})

/* ================================================================== *
 * 只读数据浏览面：`POST /api/dsh-devdata/query`（P14 第一版，2026-10-04）
 *
 * 这条路的全部要点只有一句：**面板不是特权路径**。路由不新写判据，它把请求交给
 * `invokeRedisCommand`——与 agent 的 `devdata_redis_command` 同一个函数。所以本文件的用例盯的是
 * 「两边会不会漂开」：同一个写命令，工具面与面板必须得到**同一个拒绝码**；而作用域门照旧按调用方
 * 给的那个 `cwd` 判（卡片上那个「项目根」），不拿浏览器猜的路径。
 * ================================================================== */

describe('POST /api/dsh-devdata/query', () => {
  const PATH = '/api/dsh-devdata/query'

  it('非回环 → 403；GET → 405；坏 JSON → 400', async () => {
    const host = makeHost()
    host.mount(seeded())
    const forbidden = await callRoute(host, PATH, { method: 'POST', body: {}, remoteAddress: '10.0.0.1' })
    expect(forbidden.status).toBe(403)
    const wrongMethod = await callRoute(host, PATH, { method: 'GET' })
    expect(wrongMethod.status).toBe(405)
    const broken = await callRoute(host, PATH, { method: 'POST', raw: '{not json' })
    expect(broken.status).toBe(400)
  })

  it('三个入参各自有码：缺目标 / 缺命令 / 作用域基准不是绝对路径（恢复路径是「把输入框填对」）', async () => {
    const host = makeHost()
    host.mount(seeded())
    const noTarget = await callRoute(host, PATH, { method: 'POST', body: { command: 'DBSIZE', cwd: CWD } })
    expect([noTarget.status, noTarget.json?.code]).toEqual([400, 'BAD_TARGET'])
    const noCommand = await callRoute(host, PATH, { method: 'POST', body: { target: 'redis-248', cwd: CWD } })
    expect([noCommand.status, noCommand.json?.code]).toEqual([400, 'BAD_COMMAND'])
    const relative = await callRoute(host, PATH, { method: 'POST', body: { target: 'redis-248', command: 'DBSIZE', cwd: 'a/b' } })
    expect([relative.status, relative.json?.code]).toEqual([400, 'BAD_CWD'])
  })

  it('目标不存在 / 引擎没有执行通路 → 各自的码（不是「命令解析不出来」那种错诊断）', async () => {
    const host = makeHost()
    host.mount(seeded({ targets: [redisTarget(), redisTarget({ id: 'sql-1', engine: 'sqlserver', port: 1433 })] }))
    const unknown = await callRoute(host, PATH, { method: 'POST', body: { target: 'nope', command: 'PING', cwd: CWD } })
    expect([unknown.status, unknown.json?.code]).toEqual([400, 'UNKNOWN_TARGET'])
    const unserved = await callRoute(host, PATH, { method: 'POST', body: { target: 'sql-1', command: 'PING', cwd: CWD } })
    expect([unserved.status, unserved.json?.code]).toEqual([400, 'ENGINE_NOT_SERVED'])
  })

  it('★ 与工具面**同一档拒绝码**：未授权的写命令（`SET`）在两边得到同一个码', async () => {
    const host = makeHost()
    host.mount(seeded())
    const viaPanel = await callRoute(host, PATH, { method: 'POST', body: { target: 'redis-248', command: 'SET k v', cwd: CWD } })
    expect(viaPanel.status).toBe(400)
    const viaTool = await host.callError('devdata_redis_command', { target: 'redis-248', command: 'SET k v', cwd: CWD })
    const codeOf = (text) => {
      const found = /^\[([A-Z_]+)\]/.exec(text)
      return found === null ? text : found[1]
    }
    expect(viaPanel.json?.code).toBe(codeOf(viaTool))
    // 恢复路径也带出来（判据层那句「怎么开闸门」不该在面板上被丢掉）
    expect(typeof viaPanel.json?.error).toBe('string')
  })

  it('★ 作用域门照旧生效：基准是**调用方给的 cwd**，不在 scopeDirs 里就拒', async () => {
    const host = makeHost()
    host.mount(seeded())
    const outside = await callRoute(host, PATH, { method: 'POST', body: { target: 'redis-248', command: 'DBSIZE', cwd: '/tmp' } })
    expect([outside.status, outside.json?.code]).toEqual([400, 'OUT_OF_SCOPE'])
  })

  it('审计出口实际异常 → 结构化 AUDIT_FAILED，不返回未审计的观察', async () => {
    const file = join(tempDir(), 'not-a-directory')
    writeFileSync(file, 'block parent directory')
    const host = makeHost()
    host.mount(seeded({ auditFile: join(file, 'audit.jsonl') }))
    const result = await callRoute(host, PATH, { method: 'POST', body: { target: 'redis-248', command: 'DBSIZE', cwd: '/outside' } })
    expect(result.status).toBe(500)
    expect(result.json).toMatchObject({ code: 'AUDIT_FAILED', category: 'audit' })
    expect(typeof result.json?.error).toBe('string')
    expect(result.json?.hint).toContain('尚未验证')
    expect(result.json?.ok).not.toBe(true)
    expect(result.json?.text).toBeUndefined()
  })

  it('被拒也进审计（与工具面同一本账：`allowed:false` + 码 + 解析出的动作名）', async () => {
    const file = join(tempDir(), 'audit.jsonl')
    const host = makeHost()
    host.mount(seeded({ auditFile: file }))
    await callRoute(host, PATH, { method: 'POST', body: { target: 'redis-248', command: 'SET k v', cwd: CWD } })
    const lines = readFileSync(file, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as Record<string, unknown>)
    expect(lines).toHaveLength(1)
    expect([lines[0]?.action, lines[0]?.allowed]).toEqual(['set', false])
    expect(lines[0]?.targetId).toBe('redis-248')
  })
})
