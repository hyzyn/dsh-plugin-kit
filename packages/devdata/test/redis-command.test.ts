/**
 * Redis 命令解析测试。
 *
 * 这一档**没有第二层网**（Redis 没有只读账号），所以用例的重点是**漏判**：
 * 一条被放行的未登记命令、一条没被夹紧的 SCAN、一条解析不出 key 的写命令——
 * 每一个都是真实的暴露面。
 */

import { describe, expect, it } from 'vitest'

import { actionOf, matrixFor, parseRedisCommand } from '../src/index.js'

const CAP = 100

/** 断言解析成功并返回命令。 */
function ok(raw: string, cap = CAP) {
  const parsed = parseRedisCommand(raw, cap)
  expect(parsed.ok, `期望解析成功但被拒：${raw}`).toBe(true)
  return parsed.ok ? parsed.command : (undefined as never)
}

/** 断言解析被拒并返回原因。 */
function denied(raw: string, cap = CAP): string {
  const parsed = parseRedisCommand(raw, cap)
  expect(parsed.ok, `期望被拒但解析成功：${raw}`).toBe(false)
  return parsed.ok ? '' : parsed.reason
}

describe('只读命令', () => {
  it('取值的命令归到 read（族名 get）', () => {
    expect(ok('GET user:1').kind).toBe('read')
    expect(actionOf(ok('GET user:1'))).toBe('get')
    expect(actionOf(ok('HGETALL cart:9'))).toBe('get')
    expect(actionOf(ok('LRANGE queue 0 -1'))).toBe('get')
    expect(ok('GET user:1').key).toBe('user:1')
  })

  it('诊断类归到 info', () => {
    expect(actionOf(ok('INFO memory'))).toBe('info')
    expect(actionOf(ok('DBSIZE'))).toBe('info')
    expect(ok('INFO memory').kind).toBe('read')
  })

  it('命令名大小写不敏感', () => {
    expect(ok('get user:1').name).toBe('GET')
    expect(actionOf(ok('  hgetall   cart:9 '))).toBe('get')
  })
})

describe('危险读：与普通读分档', () => {
  it('KEYS / MONITOR 归为 read-dangerous', () => {
    expect(ok('KEYS user:*').kind).toBe('read-dangerous')
    expect(actionOf(ok('KEYS user:*'))).toBe('keys')
    expect(ok('MONITOR').kind).toBe('read-dangerous')
    expect(actionOf(ok('MONITOR'))).toBe('monitor')
  })

  it('`INFO ALL` 与 `INFO memory` **同一个命令判得不同**（Redis 侧按参数分档是常态）', () => {
    expect(ok('INFO ALL').kind).toBe('read-dangerous')
    expect(ok('INFO everything').kind).toBe('read-dangerous')
    expect(ok('INFO memory').kind).toBe('read')
  })

  it('危险读在矩阵里确有独立的闸门（否则分档没意义）', () => {
    const spec = matrixFor('redis').operations.keys
    expect(spec?.kind).toBe('read-dangerous')
    expect(typeof spec?.capabilityEnv).toBe('string')
  })
})

describe('不提供入口的命令', () => {
  it('flushdb / flushall / eval / script / config / shutdown 一律拒', () => {
    // 失败意味着：不可逆命令有了通道——有入口的白名单在它们面前是装饰。
    for (const raw of [
      'FLUSHDB',
      'FLUSHALL',
      'EVAL "return 1" 0',
      'EVALSHA abc 0',
      'SCRIPT LOAD "return 1"',
      'CONFIG SET maxmemory 1gb',
      'REPLICAOF no one',
      'SHUTDOWN',
      'DEBUG SLEEP 10',
      'RESTORE k 0 v',
      'SWAPDB 0 1',
    ]) {
      expect(denied(raw), raw).toBe('FORBIDDEN_COMMAND')
    }
  })

  it('「带壳」命令也拒（MULTI / EXEC / SUBSCRIBE / CLIENT / ACL / MODULE）', () => {
    for (const raw of ['MULTI', 'EXEC', 'SUBSCRIBE ch', 'CLIENT LIST', 'ACL LIST', 'MODULE LIST', 'FUNCTION LIST']) {
      expect(denied(raw), raw).toBe('FORBIDDEN_COMMAND')
    }
  })

  it('未登记的命令一律拒（不是默认放行）', () => {
    expect(denied('FROBNICATE key')).toBe('UNKNOWN_COMMAND')
    expect(denied('XADD stream * f v')).toBe('UNKNOWN_COMMAND')
  })
})

describe('SCAN：唯一的遍历手段，COUNT 只能收紧', () => {
  it('SCAN 归到 search（不是 keys）', () => {
    const cmd = ok('SCAN 0 MATCH user:* COUNT 50')
    expect(cmd.kind).toBe('read')
    expect(actionOf(cmd)).toBe('search')
    expect(cmd.count).toBe(50)
  })

  it('COUNT 超过策略上限被**夹回**（候选只能请求更小）', () => {
    // 失败意味着：一次 `COUNT 1000000` 就能把整个键空间拖进上下文。
    const cmd = ok('SCAN 0 COUNT 1000000', 100)
    expect(cmd.count).toBe(100)
    expect(cmd.note).toContain('夹到策略上限')
  })

  it('请求更小的 COUNT 被尊重', () => {
    expect(ok('SCAN 0 COUNT 5', 100).count).toBe(5)
  })

  it('不给 COUNT → 不注入（由策略默认决定）', () => {
    expect(ok('SCAN 0 MATCH a:*').count).toBeUndefined()
  })

  it('策略上限非法 → 收紧到 1（配置坏了不该变成「无上限」）', () => {
    expect(ok('SCAN 0 COUNT 999', 0).count).toBe(1)
    expect(ok('SCAN 0 COUNT 999', Number.NaN).count).toBe(1)
  })

  it('HSCAN / SSCAN / ZSCAN 同样受管', () => {
    expect(actionOf(ok('HSCAN h 0 COUNT 10'))).toBe('search')
    expect(actionOf(ok('SSCAN s 0'))).toBe('search')
    expect(actionOf(ok('ZSCAN z 0'))).toBe('search')
  })

  it('游标必须是数字（不许拿别的当游标）', () => {
    expect(denied('SCAN abc')).toBe('KEY_REQUIRED')
    expect(denied('SCAN')).toBe('KEY_REQUIRED')
  })
})

describe('写命令：必须解析出目标 key', () => {
  it('SET / DEL / EXPIRE 归到对应的矩阵动作', () => {
    expect(ok('SET user:1 v').kind).toBe('write-scoped')
    expect(actionOf(ok('SET user:1 v'))).toBe('set')
    expect(actionOf(ok('DEL user:1'))).toBe('del')
    expect(actionOf(ok('EXPIRE user:1 60'))).toBe('expire')
    expect(actionOf(ok('PERSIST user:1'))).toBe('expire')
    expect(actionOf(ok('HSET h f v'))).toBe('set')
  })

  it('写命令解析出 key（审计里要能说清「改了什么」）', () => {
    expect(ok('SET user:1 v').key).toBe('user:1')
    expect(ok('DEL user:1').key).toBe('user:1')
    expect(ok('EXPIRE user:1 60').key).toBe('user:1')
    expect(ok('RENAME old new').key).toBe('old')
  })

  it('缺 key 的写命令被拒（写不出「改了什么」就不放行）', () => {
    expect(denied('SET')).toBe('KEY_REQUIRED')
    expect(denied('DEL')).toBe('KEY_REQUIRED')
  })

  it('写命令映射到的动作在矩阵里都存在（防拼写漂移）', () => {
    for (const raw of ['SET k v', 'DEL k', 'EXPIRE k 1', 'HSET h f v', 'LPUSH q v', 'INCR n']) {
      const action = actionOf(ok(raw))
      expect(matrixFor('redis').operations[action], `${raw} → ${action} 不在矩阵里`).toBeDefined()
    }
  })
})

describe('输入边界', () => {
  it('空 / 空白输入被拒', () => {
    expect(denied('')).toBe('EMPTY')
    expect(denied('   ')).toBe('EMPTY')
  })

  it('每条拒绝都带恢复路径', () => {
    for (const raw of ['', 'FLUSHALL', 'FROBNICATE k', 'SET', 'SCAN abc']) {
      const parsed = parseRedisCommand(raw, CAP)
      expect(parsed.ok).toBe(false)
      expect(parsed.ok === false && parsed.hint.length).toBeGreaterThan(0)
    }
  })
})
