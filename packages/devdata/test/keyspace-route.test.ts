/**
 * **keyspace 树那两条路由**（`/api/dsh-devdata/keys` / `/key`）的端到端用例。
 *
 * 与 `/query` 那组不同的地方：这里有一条**真 TCP**——用 `startFakeRedis` 起一个假 Redis，于是
 * 「命令真的发出去了吗、发的是哪几个参数、回复被怎么整形」全都能断言，而不用连真 248。
 *
 * 三件必须钉住的：
 *   1. **拼出来的命令就是发出去的那条**：把假服务收到的 argv 与预期逐字对齐（`SCAN` 的
 *      MATCH / COUNT 顺序错一位，行为就完全不同）；
 *   2. **拒在连之前**：含空白的模式 / key 被拒时，假服务**一个请求都不该收到**——档位判据走在
 *      任何 I/O 前面，这正是「界面按 A 判、执行按 B 跑」不会发生的原因；
 *   3. **每条命令各进一次审计**：一个 key 的视图 = 3~4 条命令 = 3~4 行账，动作名与命令对得上。
 */

import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { callRoute } from './fake-route.js'
import { startFakeRedis, type FakeRedisServer } from './fake-redis.js'
import { CWD, makeHost, redisTarget } from './fake-host.js'

const KEYS_PATH = '/api/dsh-devdata/keys'
const KEY_PATH = '/api/dsh-devdata/key'

const dirs: string[] = []
const servers: FakeRedisServer[] = []

afterEach(async () => {
  for (const server of servers.splice(0)) await server.close()
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-devdata-keys-'))
  dirs.push(dir)
  return dir
}

/** 起一个假 Redis，并把目标指向它（`CWD` 在作用域里）。 */
async function hostWith(respond: (argv: string[]) => string | null) {
  const fake = await startFakeRedis(respond)
  servers.push(fake)
  const host = makeHost()
  host.mount({ enabled: true, announceToAgent: true, targets: [redisTarget({ port: fake.port })] })
  return { host, fake }
}

/** RESP bulk 串的简写（`INFO` / `GETRANGE` 这类回复用它）。 */
const bulk = (text: string): string => `$${String(Buffer.byteLength(text))}\r\n${text}\r\n`

/** `SCAN` 的一条完整回复：`[游标, [key…]]`（游标 0 = 这一页扫完了）。 */
const scanPage = (...items: string[]): string => `*2\r\n$1\r\n0\r\n${array(...items)}`

/** RESP 数组的简写（用例里手写太啰嗦，而且写错一次就要 debug 半天）。 */
const array = (...items: string[]): string => `*${String(items.length)}\r\n${items.map((item) => `$${String(Buffer.byteLength(item))}\r\n${item}\r\n`).join('')}`

describe('POST /api/dsh-devdata/keys', () => {
  it('★ 扫一页：拼出来的 `SCAN` 就是假服务收到的那条，回复按 `[游标, [key…]]` 解析', async () => {
    const { host, fake } = await hostWith((argv) => (argv[0] === 'SCAN' ? `*2\r\n$1\r\n7\r\n${array('k:1', 'k:2')}` : '+OK\r\n'))
    const res = await callRoute(host, KEYS_PATH, { method: 'POST', body: { target: 'redis-248', cwd: CWD, match: 'k:*', count: 50 } })
    expect(res.status).toBe(200)
    expect(res.json?.ok).toBe(true)
    expect(res.json?.command).toBe('SCAN 0 MATCH k:* COUNT 50')
    expect(res.json?.cursor).toBe('7')
    expect(res.json?.keys).toEqual(['k:1', 'k:2'])
    // 发出去的就是拼出来的那条：MATCH / COUNT 的顺序错一位，行为完全不同。
    expect(fake.requests).toEqual([['SCAN', '0', 'MATCH', 'k:*', 'COUNT', '50']])
  })

  it('★ 拒在连之前：含空白的模式被拒时，假服务**一个请求都没收到**', async () => {
    const { host, fake } = await hostWith(() => '+OK\r\n')
    const res = await callRoute(host, KEYS_PATH, { method: 'POST', body: { target: 'redis-248', cwd: CWD, match: 'x COUNT 1' } })
    expect([res.status, res.json?.code]).toEqual([400, 'BAD_PATTERN'])
    expect(fake.requests).toEqual([])
  })

  it('游标不合法 → `BAD_CURSOR`（走私进游标的 `0 COUNT 1` 也拦）', async () => {
    const { host, fake } = await hostWith(() => '+OK\r\n')
    const res = await callRoute(host, KEYS_PATH, { method: 'POST', body: { target: 'redis-248', cwd: CWD, cursor: '0 COUNT 1' } })
    expect([res.status, res.json?.code]).toEqual([400, 'BAD_CURSOR'])
    expect(fake.requests).toEqual([])
  })

  it('回复不是 `[游标, [key…]]` → **502**（上游的错，不是调用方写错）', async () => {
    const { host } = await hostWith(() => '$3\r\nabc\r\n')
    const res = await callRoute(host, KEYS_PATH, { method: 'POST', body: { target: 'redis-248', cwd: CWD } })
    expect([res.status, res.json?.code]).toEqual([502, 'UNEXPECTED_REPLY'])
  })

  it('与面板另外两条路由同一套入参判据：缺目标 / 目标不存在 / 引擎没通路 / 基准不是绝对路径', async () => {
    const { host } = await hostWith(() => '+OK\r\n')
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ cwd: CWD }, 'BAD_TARGET'],
      [{ target: 'nope', cwd: CWD }, 'UNKNOWN_TARGET'],
      [{ target: 'redis-248', cwd: 'a/b' }, 'BAD_CWD'],
    ]
    for (const [body, code] of cases) {
      const res = await callRoute(host, KEYS_PATH, { method: 'POST', body })
      expect([res.status, res.json?.code], JSON.stringify(body)).toEqual([400, code])
    }
  })

  it('围栏与方法：非回环 → 403；GET → 405；坏 JSON → 400', async () => {
    const { host } = await hostWith(() => '+OK\r\n')
    expect((await callRoute(host, KEYS_PATH, { method: 'POST', body: {}, remoteAddress: '10.0.0.1' })).status).toBe(403)
    expect((await callRoute(host, KEYS_PATH, { method: 'GET' })).status).toBe(405)
    expect((await callRoute(host, KEYS_PATH, { method: 'POST', raw: '{not json' })).status).toBe(400)
  })
})

describe('POST /api/dsh-devdata/key', () => {
  it('★ string：四条命令按序发出，视图给出类型 / TTL / 字节数 / 一段值', async () => {
    const replies: Record<string, string> = {
      TYPE: '+string\r\n',
      TTL: ':120\r\n',
      STRLEN: ':5\r\n',
      GETRANGE: '$5\r\nhello\r\n',
    }
    const { host, fake } = await hostWith((argv) => replies[argv[0] ?? ''] ?? '-ERR unexpected\r\n')
    const res = await callRoute(host, KEY_PATH, { method: 'POST', body: { target: 'redis-248', cwd: CWD, key: 'user:1' } })
    expect(res.status).toBe(200)
    const view = res.json?.key as Record<string, unknown>
    expect(view).toMatchObject({ key: 'user:1', type: 'string', kind: 'string', ttl: 120, total: 5, totalKind: 'bytes', truncated: false })
    expect(view.rows).toEqual([['hello']])
    expect(fake.requests).toEqual([['TYPE', 'user:1'], ['TTL', 'user:1'], ['STRLEN', 'user:1'], ['GETRANGE', 'user:1', '0', '199']])
  })

  it('hash：`HSCAN` 的嵌套回复摊成字段 / 值两列；游标不是 0 就是被截断', async () => {
    const replies: Record<string, string> = {
      TYPE: '+hash\r\n',
      TTL: ':-1\r\n',
      HLEN: ':2\r\n',
      HSCAN: `*2\r\n$1\r\n9\r\n${array('a', '1', 'b', '2')}`,
    }
    const { host } = await hostWith((argv) => replies[argv[0] ?? ''] ?? '-ERR unexpected\r\n')
    const res = await callRoute(host, KEY_PATH, { method: 'POST', body: { target: 'redis-248', cwd: CWD, key: 'h:1' } })
    const view = res.json?.key as Record<string, unknown>
    expect(view).toMatchObject({ kind: 'hash', total: 2, totalKind: 'fields', truncated: true })
    expect(view.rows).toEqual([['a', '1'], ['b', '2']])
  })

  it('不存在的 key（`TYPE` = none）：没有预览命令，视图如实说「没有」而不是「空」', async () => {
    const replies: Record<string, string> = { TYPE: '+none\r\n', TTL: ':-2\r\n' }
    const { host, fake } = await hostWith((argv) => replies[argv[0] ?? ''] ?? '-ERR unexpected\r\n')
    const res = await callRoute(host, KEY_PATH, { method: 'POST', body: { target: 'redis-248', cwd: CWD, key: 'gone' } })
    const view = res.json?.key as Record<string, unknown>
    expect(view).toMatchObject({ kind: 'none', ttl: -2, rows: null, totalKind: 'none' })
    // 只发了 TYPE 与 TTL：没做预览的类型不该顺手多发一条命令。
    expect(fake.requests).toEqual([['TYPE', 'gone'], ['TTL', 'gone']])
  })

  it('★ 拒在连之前：含空白的 key 被拒时，假服务一个请求都没收到', async () => {
    const { host, fake } = await hostWith(() => '+OK\r\n')
    const res = await callRoute(host, KEY_PATH, { method: 'POST', body: { target: 'redis-248', cwd: CWD, key: 'a b' } })
    expect([res.status, res.json?.code]).toEqual([400, 'BAD_KEY'])
    expect(fake.requests).toEqual([])
  })

  it('预览那一步被拒 / 跑不动 → **整条视图失败**（半截视图比失败更难看出问题）', async () => {
    // 只答 TYPE 与 TTL：STRLEN 收到 `-ERR` 会让执行器回 ok:false
    const { host } = await hostWith((argv) => {
      if (argv[0] === 'TYPE') return '+string\r\n'
      if (argv[0] === 'TTL') return ':-1\r\n'
      return '-ERR nope\r\n'
    })
    const res = await callRoute(host, KEY_PATH, { method: 'POST', body: { target: 'redis-248', cwd: CWD, key: 'k' } })
    expect(res.status).toBe(400)
    expect(typeof res.json?.code).toBe('string')
  })

  it('每条命令各进一次审计：动作名与发出去的命令一一对应', async () => {
    const auditFile = join(tempDir(), 'audit.jsonl')
    const replies: Record<string, string> = { TYPE: '+string\r\n', TTL: ':-1\r\n', STRLEN: ':5\r\n', GETRANGE: '$5\r\nhello\r\n' }
    const fake = await startFakeRedis((argv) => replies[argv[0] ?? ''] ?? '-ERR unexpected\r\n')
    servers.push(fake)
    const host = makeHost()
    host.mount({ enabled: true, announceToAgent: true, auditFile, targets: [redisTarget({ port: fake.port })] })
    await callRoute(host, KEY_PATH, { method: 'POST', body: { target: 'redis-248', cwd: CWD, key: 'user:1' } })
    const lines = readFileSync(auditFile, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as Record<string, unknown>)
    // 审计记的是**矩阵动作名**（这几条读命令都归 `get`）：一次浏览四行，靠 `operationId` 串起来。
    expect(lines.map((line) => [line.action, line.allowed])).toEqual([
      ['get', true],
      ['get', true],
      ['get', true],
      ['get', true],
    ])
    expect(lines.every((line) => line.targetId === 'redis-248' && line.operationId === 'panel.keyspace')).toBe(true)
  })
})

describe('POST /api/dsh-devdata/keyspace：树里「库」那一层', () => {
  it('★ `INFO keyspace` 一条命令拿到每个库的 key 数；同时把「目标声明的库」一起给出来', async () => {
    const text = '# Keyspace\r\ndb0:keys=2,expires=0,avg_ttl=0\r\ndb1:keys=1,expires=0,avg_ttl=0\r\n'
    const fake = await startFakeRedis((argv) => (argv[0] === 'INFO' ? bulk(text) : '-ERR unexpected\r\n'))
    servers.push(fake)
    const host = makeHost()
    host.mount({ enabled: true, announceToAgent: true, targets: [redisTarget({ port: fake.port, db: 1 })] })
    const res = await callRoute(host, '/api/dsh-devdata/keyspace', { method: 'POST', body: { target: 'redis-248', cwd: CWD } })
    expect(res.status).toBe(200)
    expect(res.json?.command).toBe('INFO keyspace')
    /*
     * 两件不同的事，界面上也是两行不同的话：`dbs` 是「这台机器上有什么」（INFO 报的），
     * `declared` 才是「面板能去哪」，`current` 是打开时的默认那个。
     */
    expect(res.json?.current).toBe(1)
    expect(res.json?.declared).toEqual([1])
    expect(res.json?.dbs).toEqual([
      { index: 0, keys: 2, expires: 0, avgTtl: 0 },
      { index: 1, keys: 1, expires: 0, avgTtl: 0 },
    ])
    // 目标声明了 `db: 1`，所以执行器先发 `SELECT 1`——**能扫的库由声明决定**，这条断言就是它。
    expect(fake.requests).toEqual([['SELECT', '1'], ['INFO', 'keyspace']])
  })

  it('声明了 `dbs` 时允许集是 `db` ∪ `dbs`（升序去重）——空库也能列出来', async () => {
    const fake = await startFakeRedis((argv) => (argv[0] === 'INFO' ? bulk('# Keyspace\r\ndb2:keys=1\r\n') : '-ERR unexpected\r\n'))
    servers.push(fake)
    const host = makeHost()
    host.mount({ enabled: true, announceToAgent: true, targets: [redisTarget({ port: fake.port, db: 0, dbs: [2, 0, 5, 5] })] })
    const res = await callRoute(host, '/api/dsh-devdata/keyspace', { method: 'POST', body: { target: 'redis-248', cwd: CWD } })
    expect(res.status).toBe(200)
    expect(res.json?.declared).toEqual([0, 2, 5])
    expect(res.json?.current).toBe(0)
  })

  it('与另外两条面板路由同一套入参判据（缺目标 → `BAD_TARGET`）', async () => {
    const { host } = await hostWith(() => '+OK\r\n')
    const res = await callRoute(host, '/api/dsh-devdata/keyspace', { method: 'POST', body: { cwd: CWD } })
    expect([res.status, res.json?.code]).toEqual([400, 'BAD_TARGET'])
  })
})

/*
 * ---------- **切库**（2026-10-05：库那一层从「只展示」变成「能点着切」） ----------
 *
 * 这一组的判据只有一条：**库号只能来自两个宿主侧的事实源**——目标的声明（`db` / `dbs`）或
 * `INFO keyspace` 当场报的。浏览器传上来的编号要么命中其中之一，要么被 `BAD_DB` 拒掉。
 * 所以每条用例都断言**假服务到底收到了什么**：允许的那些必须真的带上 `SELECT <n>` 那一帧，
 * 被拒的那些必须**一个请求都没收到**（判据走在 I/O 之前）。
 */
describe('POST /api/dsh-devdata/keys：选哪个库（`db` 参数）', () => {
  it('★ 声明的库：直接放行，执行器发 `SELECT 1`——**不多发一条 INFO**', async () => {
    const { host, fake } = await hostWith((argv) => (argv[0] === 'SCAN' ? scanPage('k:1') : '-ERR unexpected\r\n'))
    const host2 = host
    // 先换一份带 `dbs` 的配置（`withPort` 之外还要带库号，所以整份重挂）
    const fakePort = fake.port
    host2.mount({ enabled: true, announceToAgent: true, targets: [redisTarget({ port: fakePort, db: 0, dbs: [1, 2] })] })
    const res = await callRoute(host2, KEYS_PATH, { method: 'POST', body: { target: 'redis-248', cwd: CWD, db: 1 } })
    expect(res.status).toBe(200)
    expect(res.json?.db).toBe(1)
    expect(res.json?.keys).toEqual(['k:1'])
    // 声明集命中 → 不查 INFO；`SELECT 1` 是执行器按这个库发的。
    expect(fake.requests).toEqual([['SELECT', '1'], ['SCAN', '0']])
  })

  it('★ 服务器当场报的库（声明里没有）：先问一次 `INFO keyspace`，报了就放行', async () => {
    const text = '# Keyspace\r\ndb3:keys=4\r\n'
    const { host, fake } = await hostWith((argv) => {
      if (argv[0] === 'INFO') return bulk(text)
      if (argv[0] === 'SCAN') return scanPage('k:9')
      return '-ERR unexpected\r\n'
    })
    const res = await callRoute(host, KEYS_PATH, { method: 'POST', body: { target: 'redis-248', cwd: CWD, db: 3 } })
    expect(res.status).toBe(200)
    expect(res.json?.db).toBe(3)
    expect(fake.requests).toEqual([['INFO', 'keyspace'], ['SELECT', '3'], ['SCAN', '0']])
  })

  it('★ 两个来源都没有的库 → `BAD_DB` + 恢复路径，且**一个请求都没收到**（声明命中不了、INFO 也没报它）', async () => {
    const { host, fake } = await hostWith((argv) => (argv[0] === 'INFO' ? bulk('# Keyspace\r\ndb0:keys=1\r\n') : '-ERR unexpected\r\n'))
    const res = await callRoute(host, KEYS_PATH, { method: 'POST', body: { target: 'redis-248', cwd: CWD, db: 7 } })
    expect([res.status, res.json?.code]).toEqual([400, 'BAD_DB'])
    expect(String(res.json?.hint)).toContain('可浏览的库')
    // 只发了那一条**判据用的** INFO：没有 SELECT 7，也没有 SCAN。
    expect(fake.requests).toEqual([['INFO', 'keyspace']])
  })

  it('库号不是非负整数 → `BAD_DB`，**连 INFO 都不发**（判据走在 I/O 之前）', async () => {
    const { host, fake } = await hostWith(() => '+OK\r\n')
    for (const bad of [-1, 1.5, 'db1', '1 COUNT 2']) {
      const res = await callRoute(host, KEYS_PATH, { method: 'POST', body: { target: 'redis-248', cwd: CWD, db: bad } })
      expect([res.status, res.json?.code], JSON.stringify(bad)).toEqual([400, 'BAD_DB'])
    }
    expect(fake.requests).toEqual([])
  })

  it('没写 `db` → 走目标声明的缺省库：`db: 1` 的目标发 `SELECT 1`；`db` 没写就一条 `SELECT` 都不发', async () => {
    const fakeWithDb = await startFakeRedis((argv) => (argv[0] === 'SCAN' ? scanPage('k:1') : '-ERR unexpected\r\n'))
    servers.push(fakeWithDb)
    const hostA = makeHost()
    hostA.mount({ enabled: true, announceToAgent: true, targets: [redisTarget({ port: fakeWithDb.port, db: 1 })] })
    await callRoute(hostA, KEYS_PATH, { method: 'POST', body: { target: 'redis-248', cwd: CWD } })
    expect(fakeWithDb.requests).toEqual([['SELECT', '1'], ['SCAN', '0']])

    const fakeNoDb = await startFakeRedis((argv) => (argv[0] === 'SCAN' ? scanPage('k:1') : '-ERR unexpected\r\n'))
    servers.push(fakeNoDb)
    const hostB = makeHost()
    hostB.mount({ enabled: true, announceToAgent: true, targets: [redisTarget({ port: fakeNoDb.port })] })
    await callRoute(hostB, KEYS_PATH, { method: 'POST', body: { target: 'redis-248', cwd: CWD } })
    expect(fakeNoDb.requests).toEqual([['SCAN', '0']])
  })

  it('`/key` 与 `/types` 也认 `db`：预览那一串命令同样在选中的库上跑', async () => {
    const replies: Record<string, string> = {
      TYPE: '+string\r\n',
      TTL: ':-1\r\n',
      STRLEN: ':5\r\n',
      GETRANGE: '$5\r\nhello\r\n',
    }
    const fake = await startFakeRedis((argv) => replies[argv[0] ?? ''] ?? '-ERR unexpected\r\n')
    servers.push(fake)
    const host = makeHost()
    host.mount({ enabled: true, announceToAgent: true, targets: [redisTarget({ port: fake.port, dbs: [2] })] })
    const keyRes = await callRoute(host, KEY_PATH, { method: 'POST', body: { target: 'redis-248', cwd: CWD, db: 2, key: 'user:1' } })
    expect(keyRes.status).toBe(200)
    expect(fake.requests.slice(0, 2)).toEqual([['SELECT', '2'], ['TYPE', 'user:1']])

    const typesRes = await callRoute(host, '/api/dsh-devdata/types', { method: 'POST', body: { target: 'redis-248', cwd: CWD, db: 2, keys: ['user:1'] } })
    expect(typesRes.status).toBe(200)
    expect(fake.requests.at(-2)).toEqual(['SELECT', '2'])
    expect(fake.requests.at(-1)).toEqual(['TYPE', 'user:1'])
  })
})

describe('POST /api/dsh-devdata/types：按本页统计类型（用户点了才付）', () => {
  it('★ 逐个 `TYPE`：每个 key 一条命令、一行审计；回复按 key 对齐返回', async () => {
    const { host, fake } = await hostWith((argv) => {
      if (argv[0] !== 'TYPE') return '-ERR unexpected\r\n'
      return argv[1] === 'h:1' ? '+hash\r\n' : '+string\r\n'
    })
    const res = await callRoute(host, '/api/dsh-devdata/types', {
      method: 'POST',
      body: { target: 'redis-248', cwd: CWD, keys: ['s:1', 'h:1'] },
    })
    expect(res.status).toBe(200)
    expect(res.json?.types).toEqual([
      { key: 's:1', type: 'string' },
      { key: 'h:1', type: 'hash' },
    ])
    expect(fake.requests).toEqual([['TYPE', 's:1'], ['TYPE', 'h:1']])
  })

  it('上限写死在服务端：超过 50 个 key 直接拒（它等于 50 次调用 + 50 行审计）', async () => {
    const { host, fake } = await hostWith(() => '+string\r\n')
    const keys = Array.from({ length: 51 }, (_item, index) => `k:${String(index)}`)
    const res = await callRoute(host, '/api/dsh-devdata/types', { method: 'POST', body: { target: 'redis-248', cwd: CWD, keys } })
    expect([res.status, res.json?.code]).toEqual([400, 'TOO_MANY_KEYS'])
    expect(fake.requests).toEqual([])
  })

  it('空数组 → `BAD_KEYS`；含空白的 key → `BAD_KEY`，且**一个请求都不发**', async () => {
    const { host, fake } = await hostWith(() => '+string\r\n')
    const empty = await callRoute(host, '/api/dsh-devdata/types', { method: 'POST', body: { target: 'redis-248', cwd: CWD, keys: [] } })
    expect([empty.status, empty.json?.code]).toEqual([400, 'BAD_KEYS'])
    const bad = await callRoute(host, '/api/dsh-devdata/types', { method: 'POST', body: { target: 'redis-248', cwd: CWD, keys: ['a b'] } })
    expect([bad.status, bad.json?.code]).toEqual([400, 'BAD_KEY'])
    expect(fake.requests).toEqual([])
  })
})

/*
 * ---------- 表格那一页（`/api/dsh-devdata/rows`） ----------
 *
 * 这条路由存在的理由只有一个：**Navicat 那张表**（Key / Type / Value / Size / TTL）每一行都要
 * 类型 / 大小 / 值 / TTL，而 Redis 没有批量取这些的命令。所以这里要钉住三件事：
 *   1. 一行 = 3~4 条命令（`TYPE` → 元素数 → 预览 → `TTL`），**一条都不许多发**；
 *   2. 上限**写死在服务端**（`ROW_BATCH_MAX`），超了不连、不发；
 *   3. **逐行标错**：某一行读不动时，那一行如实带 `error`，**别的行照常给值**——但不许把
 *      读不动的那行画成空值（空值看着像「这个 key 是空的」）。
 */
describe('POST /api/dsh-devdata/rows', () => {
  const ROWS_PATH = '/api/dsh-devdata/rows'

  it('★ 一行 = 四条命令：string 与 hash 各一行，「值」压成单行（哈希是 `field:value`）', async () => {
    const replies: Record<string, string> = {
      TYPE: '+string\r\n',
      TTL: ':120\r\n',
      STRLEN: ':5\r\n',
      GETRANGE: '$5\r\nhello\r\n',
      HLEN: ':2\r\n',
      HSCAN: `*2\r\n$1\r\n0\r\n${array('a', '1', 'b', '2')}`,
    }
    const { host, fake } = await hostWith((argv) => {
      const name = argv[0] ?? ''
      if (name === 'TYPE') return argv[1] === 'h:1' ? '+hash\r\n' : '+string\r\n'
      return replies[name] ?? '-ERR unexpected\r\n'
    })
    const res = await callRoute(host, ROWS_PATH, { method: 'POST', body: { target: 'redis-248', cwd: CWD, keys: ['s:1', 'h:1'] } })
    expect(res.status).toBe(200)
    expect(res.json?.rows).toEqual([
      { key: 's:1', type: 'string', ttl: 120, total: 5, totalKind: 'bytes', preview: 'hello', truncated: false },
      { key: 'h:1', type: 'hash', ttl: 120, total: 2, totalKind: 'fields', preview: '[a:1, b:2]', truncated: false },
    ])
    expect(fake.requests).toEqual([
      ['TYPE', 's:1'],
      ['TTL', 's:1'],
      ['STRLEN', 's:1'],
      ['GETRANGE', 's:1', '0', '199'],
      ['TYPE', 'h:1'],
      ['TTL', 'h:1'],
      ['HLEN', 'h:1'],
      ['HSCAN', 'h:1', '0', 'COUNT', '50'],
    ])
  })

  it('★ 上限写死在服务端：超过 `ROW_BATCH_MAX` 个 key 直接拒，且**一个请求都不发**', async () => {
    const { host, fake } = await hostWith(() => '+string\r\n')
    const keys = Array.from({ length: 21 }, (_item, index) => `k:${String(index)}`)
    const res = await callRoute(host, ROWS_PATH, { method: 'POST', body: { target: 'redis-248', cwd: CWD, keys } })
    expect([res.status, res.json?.code]).toEqual([400, 'TOO_MANY_KEYS'])
    expect(fake.requests).toEqual([])
  })

  it('★ 逐行标错：第 2 行的预览跑不动时，第 2 行带 `error` 而不是空值，第 1 行照常给值', async () => {
    const { host } = await hostWith((argv) => {
      const name = argv[0] ?? ''
      if (name === 'TYPE') return '+string\r\n'
      if (name === 'TTL') return ':-1\r\n'
      if (name === 'STRLEN') return argv[1] === 'bad' ? '-ERR nope\r\n' : ':5\r\n'
      if (name === 'GETRANGE') return '$5\r\nhello\r\n'
      return '-ERR unexpected\r\n'
    })
    const res = await callRoute(host, ROWS_PATH, { method: 'POST', body: { target: 'redis-248', cwd: CWD, keys: ['ok', 'bad'] } })
    expect(res.status).toBe(200)
    const rows = res.json?.rows as Record<string, unknown>[]
    expect(rows[0]).toMatchObject({ key: 'ok', type: 'string', preview: 'hello' })
    expect(typeof rows[1]?.error).toBe('string')
    expect(String(rows[1]?.error)).not.toBe('')
    // 标错的那一行**没有值**：不许把读不动画成「空值」
    expect(rows[1]?.preview).toBeUndefined()
  })

  it('发不出去的 key（含空白）：那一行标错且**一个字节都没发**，别的行照读', async () => {
    const { host, fake } = await hostWith((argv) => {
      const name = argv[0] ?? ''
      if (name === 'TYPE') return '+string\r\n'
      if (name === 'TTL') return ':-1\r\n'
      if (name === 'STRLEN') return ':5\r\n'
      if (name === 'GETRANGE') return '$5\r\nhello\r\n'
      return '-ERR unexpected\r\n'
    })
    const res = await callRoute(host, ROWS_PATH, { method: 'POST', body: { target: 'redis-248', cwd: CWD, keys: ['a b', 'ok'] } })
    expect(res.status).toBe(200)
    const rows = res.json?.rows as Record<string, unknown>[]
    expect(String(rows[0]?.error)).toContain('BAD_KEY')
    expect(rows[1]).toMatchObject({ key: 'ok', preview: 'hello' })
    expect(fake.requests).toEqual([
      ['TYPE', 'ok'],
      ['TTL', 'ok'],
      ['STRLEN', 'ok'],
      ['GETRANGE', 'ok', '0', '199'],
    ])
  })

  it('库参数照 `/keys` 的同一套判据：声明的库命中就发 `SELECT <n>`，不合法就 `BAD_DB` 且不发命令', async () => {
    const { host, fake } = await hostWith((argv) => (argv[0] === 'TYPE' ? '+string\r\n' : argv[0] === 'TTL' ? ':-1\r\n' : argv[0] === 'STRLEN' ? ':1\r\n' : '$1\r\nx\r\n'))
    const declared = makeHost()
    declared.mount({ enabled: true, announceToAgent: true, targets: [redisTarget({ port: fake.port, db: 1 })] })
    const ok = await callRoute(declared, ROWS_PATH, { method: 'POST', body: { target: 'redis-248', cwd: CWD, keys: ['ok'], db: 1 } })
    expect(ok.status).toBe(200)
    expect(ok.json?.db).toBe(1)
    expect(fake.requests[0]).toEqual(['SELECT', '1'])
    const before = fake.requests.length
    const bad = await callRoute(host, ROWS_PATH, { method: 'POST', body: { target: 'redis-248', cwd: CWD, keys: ['ok'], db: 9 } })
    expect([bad.status, bad.json?.code]).toEqual([400, 'BAD_DB'])
    /*
     * 判据那**一条** `INFO keyspace` 是允许的（不在声明集里 → 再看服务器当场报的库，见 `panelDb`）；
     * 不许出现的是 `SELECT 9` 与任何 `TYPE`——那才是「浏览器把库号硬塞进命令」。
     */
    expect(fake.requests.slice(before)).toEqual([['INFO', 'keyspace']])
  })

  it('空数组 → `BAD_KEYS`；没写 keys → 同上（这条路由不接受「随便读点什么」）', async () => {
    const { host, fake } = await hostWith(() => '+string\r\n')
    const empty = await callRoute(host, ROWS_PATH, { method: 'POST', body: { target: 'redis-248', cwd: CWD, keys: [] } })
    expect([empty.status, empty.json?.code]).toEqual([400, 'BAD_KEYS'])
    const missing = await callRoute(host, ROWS_PATH, { method: 'POST', body: { target: 'redis-248', cwd: CWD } })
    expect([missing.status, missing.json?.code]).toEqual([400, 'BAD_KEYS'])
    expect(fake.requests).toEqual([])
  })
})
