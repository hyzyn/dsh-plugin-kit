/**
 * Redis 通路 A 执行器测试。
 *
 * 用一个**假 Redis 服务**（`node:net` + 独立的极简请求解析）来测——不连真机，就能覆盖
 * 真机上难复现的路径：**AUTH 的帧顺序**、**超时**、**Redis 自己的错误回复**、**凭据解析不出来**。
 *
 * 真机那一半在 `docs/devdata-plan.md` §8 记着：`248` 那台是 4.0.14、**无密码且无 ACL**——所以
 * 只读**只**由代码层保证。这份用例不改变那个事实，只保证「执行器按裁决结果老实地发命令」。
 */

import { afterEach, describe, expect, it } from 'vitest'

import { simpleReplies, startFakeRedis, type FakeRedisServer } from './fake-redis.js'

import { createRedisExecutor, shapeReply, type ExecOutcome } from '../src/index.js'
import type { DevDataTarget } from '../src/index.js'

/* --------------------------------- 假服务 --------------------------------- */

/** 收到过的服务器与它们的关闭（用例之间互不干扰）。 */
const servers: FakeRedisServer[] = []
afterEach(async () => {
  while (servers.length > 0) await servers.pop()?.close()
})

async function withServer(respond: (argv: string[]) => string | null): Promise<FakeRedisServer> {
  const s = await startFakeRedis(respond)
  servers.push(s)
  return s
}

const ok = simpleReplies

const target: DevDataTarget = { id: 'redis-248', label: '测试 Redis', engine: 'redis', env: 'test-shared' }
const base = { cwd: process.cwd(), target, action: 'get' }

/* ---------------------------------- 用例 ---------------------------------- */

describe('Redis 通路 A 执行器', () => {
  it('把已裁决的原文切开发出去，并整形回复（`args.raw` 的多余空格不该变成空参数）', async () => {
    const server = await withServer(ok)
    const executor = createRedisExecutor({ connections: { 'redis-248': { host: '127.0.0.1', port: server.port } } })
    const outcome = (await executor.run({ ...base, args: { raw: '  GET   order:1  ', key: 'order:1' } })) as ExecOutcome
    expect(outcome).toEqual({ ok: true, result: 'hello' })
    expect(server.requests).toEqual([['GET', 'order:1']])
  })

  it('Redis 自己的错误回复 → 原样带出去（`ok:false`，不是抛异常）', async () => {
    const server = await withServer(() => '-WRONGTYPE Operation against a key holding the wrong kind of value\r\n')
    const executor = createRedisExecutor({ connections: { 'redis-248': { host: '127.0.0.1', port: server.port } } })
    const outcome = (await executor.run({ ...base, args: { raw: 'GET k' } })) as ExecOutcome
    expect(outcome.ok).toBe(false)
    expect(outcome.message).toContain('WRONGTYPE')
  })

  it('**没配连接** → 报的是可执行的那句（含 target id 与恢复路径），而不是静默', async () => {
    const executor = createRedisExecutor({ connections: {} })
    const outcome = (await executor.run({ ...base, args: { raw: 'GET k' } })) as ExecOutcome
    expect(outcome.ok).toBe(false)
    expect(outcome.message).toContain('redis-248')
    expect(outcome.message).toContain('host/port')
  })

  it('**超时** → ok:false 且说的是超时（把「没回话」说成成功，比报错坏得多）', async () => {
    const server = await withServer(() => null) // 永不回复
    const executor = createRedisExecutor({
      connections: { 'redis-248': { host: '127.0.0.1', port: server.port } },
      timeoutMs: 200,
    })
    const outcome = (await executor.run({ ...base, args: { raw: 'GET k' } })) as ExecOutcome
    expect(outcome.ok).toBe(false)
    expect(outcome.message).toContain('200ms')
  })

  it('AUTH 在**用户命令之前**发（帧顺序是契约：先认证再执行）', async () => {
    const server = await withServer((argv) => (argv[0] === 'AUTH' ? '+OK\r\n' : '$5\r\nhello\r\n'))
    const executor = createRedisExecutor({
      connections: { 'redis-248': { host: '127.0.0.1', port: server.port, password: 'pw' } },
    })
    const outcome = (await executor.run({ ...base, args: { raw: 'GET k' } })) as ExecOutcome
    expect(outcome).toEqual({ ok: true, result: 'hello' })
    expect(server.requests.map((r) => r[0])).toEqual(['AUTH', 'GET'])
    expect(server.requests[0]).toEqual(['AUTH', 'pw'])
  })

  it('`SELECT` 也在用户命令之前（AUTH → SELECT → 命令）', async () => {
    const server = await withServer((argv) => (argv[0] === 'GET' ? '$1\r\nx\r\n' : '+OK\r\n'))
    const executor = createRedisExecutor({
      connections: { 'redis-248': { host: '127.0.0.1', port: server.port, password: 'pw', db: 3 } },
    })
    await executor.run({ ...base, args: { raw: 'GET k' } })
    expect(server.requests.map((r) => r[0])).toEqual(['AUTH', 'SELECT', 'GET'])
  })

  it('凭据引用**解析不出来** → 报清楚，且**一个请求都不发**（不要用空密码去试）', async () => {
    const server = await withServer(ok)
    const executor = createRedisExecutor({
      connections: { 'redis-248': { host: '127.0.0.1', port: server.port } },
      resolveSecret: () => Promise.resolve(undefined),
    })
    const outcome = (await executor.run({
      ...base,
      target: { ...target, credentialRef: 'env:NOPE' },
      args: { raw: 'GET k' },
    })) as ExecOutcome
    expect(outcome.ok).toBe(false)
    expect(outcome.message).toContain('env:NOPE')
    expect(server.requests).toEqual([])
  })
})

describe('shapeReply：RESP → 普通值', () => {
  it('五种类型各自映射，`null` 与空串保持可区分', () => {
    expect(shapeReply({ kind: 'simple', value: 'OK' })).toBe('OK')
    expect(shapeReply({ kind: 'integer', value: 59 })).toBe(59)
    expect(shapeReply({ kind: 'bulk', value: null })).toBeNull()
    expect(shapeReply({ kind: 'bulk', value: '' })).toBe('')
    expect(shapeReply({ kind: 'array', value: null })).toBeNull()
    expect(
      shapeReply({
        kind: 'array',
        value: [
          { kind: 'bulk', value: 'sysMenu' },
          { kind: 'integer', value: 1 },
        ],
      }),
    ).toEqual(['sysMenu', 1])
  })
})
