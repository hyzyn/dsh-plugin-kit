/**
 * Redis **命令原文入口**的接线测试（`docs/devdata-plan.md` §3.6.1 / §17.11，ROADMAP 待办 C9）。
 *
 * 这一组用例守的是 C9 的真正风险，而不是「能不能跑」：原文入口把「这条命令属于哪一族」交给内核
 * 自己算，于是**档位是按参数定的**（`INFO ALL` 危险读、`INFO memory` 普通读），而矩阵按动作名
 * 分档（`info` 是普通读）。两者差一档，就会从这条缝里绕过能力闸门。
 *
 * 所以重点断言三条：
 *   1. 解析层的档位**不会被矩阵抹平**（`INFO ALL` 必须走危险读闸门）；
 *   2. 解析不过的命令**不用原文兜底**（兜底 = 把白名单关掉）；
 *   3. 执行器拿到的是**原文**，不是重新拼装的命令（审过的和跑了的必须是同一条）。
 */

import { HOST_SERVICES, LAUNCH_ENV_LAYERS, bindCapabilitySources } from '@hyzyn/dsh-kit'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  CLASS_RANK,
  invokeRedisCommand,
  parseRejectionCode,
  stricterClass,
  type AuditEntry,
  type CapabilitySpec,
  type DevDataTarget,
  type ToolExecutor,
} from '../src/index.js'

const WRITE: CapabilitySpec = { env: 'TEST_DEVDATA_WRITE', label: '测试写能力' }
const DANGEROUS: CapabilitySpec = { env: 'TEST_DEVDATA_DANGEROUS', label: '测试危险读' }
const CWD = '/work/project-a'
const MAX_SCAN = 100

const envMap = new Map<string, string>()
const launchEnv = {
  getFrom(env: string, layers: readonly string[]): { value?: string } | undefined {
    if (!layers.includes(LAUNCH_ENV_LAYERS.process)) return undefined
    const value = envMap.get(env)
    return value === undefined ? undefined : { value }
  },
}
function bind(): void {
  bindCapabilitySources({ get: (name: string) => (name === HOST_SERVICES.launchEnvironment ? launchEnv : undefined) })
}
function grant(env: string): void {
  envMap.set(env, '1')
  bind()
}

beforeEach(() => {
  envMap.clear()
  bind()
})

function target(overrides: Partial<DevDataTarget> = {}): DevDataTarget {
  return {
    id: 't-redis',
    label: '测试 Redis',
    engine: 'redis',
    env: 'test-isolated',
    scopeDirs: [CWD],
    writeCapability: WRITE,
    dangerousReadCapability: DANGEROUS,
    ...overrides,
  }
}

/** 记录调用与参数的假执行器。 */
function fakeExecutor(outcome: { ok: boolean; result?: unknown; message?: string } = { ok: true, result: { rows: [] } }): {
  executor: ToolExecutor
  calls: { action: string; args: Readonly<Record<string, unknown>> }[]
} {
  const calls: { action: string; args: Readonly<Record<string, unknown>> }[] = []
  return {
    calls,
    executor: {
      run: (request) => {
        calls.push({ action: request.action, args: request.args })
        return Promise.resolve(outcome)
      },
    },
  }
}

describe('档位只能更严（stricterClass）', () => {
  it('排序把 never 放最后、read 放最前', () => {
    expect(CLASS_RANK.read).toBeLessThan(CLASS_RANK['read-dangerous'])
    expect(CLASS_RANK['read-dangerous']).toBeLessThan(CLASS_RANK['write-scoped'])
    expect(CLASS_RANK['write-scoped']).toBeLessThan(CLASS_RANK.never)
  })

  it('取更严的那个；不给则用矩阵自己的', () => {
    expect(stricterClass('read', 'read-dangerous')).toBe('read-dangerous')
    expect(stricterClass('read-dangerous', 'read')).toBe('read-dangerous')
    expect(stricterClass('read', undefined)).toBe('read')
    expect(stricterClass('write-scoped', 'read')).toBe('write-scoped')
  })

  it('**不许更松**：传一个更宽的档位换不来放行', () => {
    // 失败意味着：调用方能靠「少报一档」把闸门关掉。
    expect(stricterClass('read-dangerous', 'read')).not.toBe('read')
  })
})

describe('原文入口：解析决定动作与档位', () => {
  it('GET → 动作 get，普通读，参数照原文传', async () => {
    const { executor, calls } = fakeExecutor()
    const outcome = await invokeRedisCommand({
      target: target(),
      commandText: 'GET user:1',
      cwd: CWD,
      maxScanCount: MAX_SCAN,
      executor,
    })
    expect(outcome.ok).toBe(true)
    expect(calls[0]?.action).toBe('get')
    expect(calls[0]?.args.raw).toBe('GET user:1')
    expect(calls[0]?.args.key).toBe('user:1')
  })

  it('SCAN → 动作 search，COUNT 被夹紧后进参数', async () => {
    const { executor, calls } = fakeExecutor()
    await invokeRedisCommand({
      target: target(),
      commandText: 'SCAN 0 MATCH a:* COUNT 1000000',
      cwd: CWD,
      maxScanCount: MAX_SCAN,
      executor,
    })
    expect(calls[0]?.action).toBe('search')
    expect(calls[0]?.args.count).toBe(MAX_SCAN)
  })

  it('SET → 动作 set，过写闸门', async () => {
    grant(WRITE.env)
    const { executor, calls } = fakeExecutor()
    const outcome = await invokeRedisCommand({
      target: target(),
      commandText: 'SET user:1 v',
      cwd: CWD,
      maxScanCount: MAX_SCAN,
      executor,
    })
    expect(outcome.ok).toBe(true)
    expect(calls[0]?.action).toBe('set')
    expect(calls[0]?.args.key).toBe('user:1')
  })

  it('写命令未授权 → 闸门拒，且**不进入执行路径**', async () => {
    const { executor, calls } = fakeExecutor()
    const outcome = await invokeRedisCommand({
      target: target(),
      commandText: 'SET user:1 v',
      cwd: CWD,
      maxScanCount: MAX_SCAN,
      executor,
    })
    expect(outcome.ok === false && outcome.code).toBe('CAPABILITY_NOT_GRANTED')
    expect(calls).toEqual([])
  })
})

describe('原文入口：解析不过就不用原文兜底', () => {
  it.each(['FLUSHALL', 'EVAL "return 1" 0', 'CONFIG SET maxmemory 1gb', 'MULTI'])(
    '%s 被明确排除 → OPERATION_FORBIDDEN，执行器一次都没被调',
    async (raw) => {
      // 失败意味着：不可逆命令有了通道——有入口的白名单在它们面前是装饰。
      const { executor, calls } = fakeExecutor()
      const outcome = await invokeRedisCommand({
        target: target(),
        commandText: raw,
        cwd: CWD,
        maxScanCount: MAX_SCAN,
        executor,
      })
      expect(outcome.ok === false && outcome.code).toBe('OPERATION_FORBIDDEN')
      expect(calls).toEqual([])
    },
  )

  it('未登记的命令报 UNCLASSIFIED_OPERATION——与「被排除」分开（agent 该做的事不同）', async () => {
    // 失败意味着：打错字和「这条路不存在」被报成同一条，agent 会一直在命令名上找问题。
    const { executor, calls } = fakeExecutor()
    const outcome = await invokeRedisCommand({
      target: target(),
      commandText: 'FROBNICATE k',
      cwd: CWD,
      maxScanCount: MAX_SCAN,
      executor,
    })
    expect(outcome.ok === false && outcome.code).toBe('UNCLASSIFIED_OPERATION')
    expect(calls).toEqual([])
  })

  it('解析原因 → 拒绝码的映射**逐条**覆盖（不抽样）', () => {
    // 抽样会让「多加一种原因、忘了归码」从缝里过去；这里把 6 种原因全部钉住。
    expect(parseRejectionCode('FORBIDDEN_COMMAND')).toBe('OPERATION_FORBIDDEN')
    for (const reason of ['EMPTY', 'UNKNOWN_COMMAND', 'DANGEROUS_READ', 'KEY_REQUIRED', 'CONTAINER_COMMAND'] as const) {
      expect(parseRejectionCode(reason), reason).toBe('UNCLASSIFIED_OPERATION')
    }
  })

  it('拒绝文案带上解析层的原因与恢复路径', async () => {
    const { executor } = fakeExecutor()
    const outcome = await invokeRedisCommand({
      target: target(),
      commandText: 'FLUSHALL',
      cwd: CWD,
      maxScanCount: MAX_SCAN,
      executor,
    })
    expect(outcome.ok === false && outcome.message).toContain('FORBIDDEN_COMMAND')
    expect(outcome.ok === false && (outcome.hint ?? '').length).toBeGreaterThan(0)
  })
})

describe('**按参数分档不许被矩阵抹平**（这一组是 C9 存在的理由）', () => {
  it('INFO ALL 解析为危险读 → 必须走危险读闸门（矩阵里 info 是普通读）', async () => {
    // 失败意味着：`INFO ALL` 走动作 `info`（普通读）直接放行，一次吐出全部节（含客户端与命令统计）。
    // 这正是「从旁边那条路绕过去」——矩阵按动作名分档，解析层按参数分档，两者差一档就得按更严的判。
    const { executor, calls } = fakeExecutor()
    const outcome = await invokeRedisCommand({
      target: target(),
      commandText: 'INFO ALL',
      cwd: CWD,
      maxScanCount: MAX_SCAN,
      executor,
    })
    expect(outcome.ok).toBe(false)
    expect(outcome.ok === false && outcome.code).toBe('CAPABILITY_NOT_GRANTED')
    expect(calls).toEqual([])
  })

  it('授权危险读后 INFO ALL 才放行，且动作仍是 info', async () => {
    grant(DANGEROUS.env)
    const { executor } = fakeExecutor()
    const outcome = await invokeRedisCommand({
      target: target(),
      commandText: 'INFO ALL',
      cwd: CWD,
      maxScanCount: MAX_SCAN,
      executor,
    })
    expect(outcome.ok).toBe(true)
    expect(outcome.ok === true && outcome.action).toBe('info')
  })

  it('INFO memory 仍是普通读：不需要危险读授权', async () => {
    const { executor, calls } = fakeExecutor()
    const outcome = await invokeRedisCommand({
      target: target(),
      commandText: 'INFO memory',
      cwd: CWD,
      maxScanCount: MAX_SCAN,
      executor,
    })
    expect(outcome.ok).toBe(true)
    expect(calls[0]?.action).toBe('info')
  })

  it('目标没配危险读能力时，INFO ALL 报「未接入闸门」而不是放行', async () => {
    const { executor, calls } = fakeExecutor()
    const outcome = await invokeRedisCommand({
      target: target({ dangerousReadCapability: undefined }),
      commandText: 'INFO ALL',
      cwd: CWD,
      maxScanCount: MAX_SCAN,
      executor,
    })
    expect(outcome.ok === false && outcome.code).toBe('CAPABILITY_NOT_DECLARED')
    expect(calls).toEqual([])
  })

  it('KEYS / MONITOR 走各自动作的同名闸门', async () => {
    for (const raw of ['KEYS user:*', 'MONITOR']) {
      const { executor, calls } = fakeExecutor()
      const outcome = await invokeRedisCommand({
        target: target(),
        commandText: raw,
        cwd: CWD,
        maxScanCount: MAX_SCAN,
        executor,
      })
      expect(outcome.ok === false && outcome.code, raw).toBe('CAPABILITY_NOT_GRANTED')
      expect(calls, raw).toEqual([])
    }
  })
})

describe('原文入口与结构化入口走同一条判据链', () => {
  it('作用域外被拒（原文入口不例外）', async () => {
    const { executor, calls } = fakeExecutor()
    const outcome = await invokeRedisCommand({
      target: target(),
      commandText: 'GET k',
      cwd: '/elsewhere',
      maxScanCount: MAX_SCAN,
      executor,
    })
    expect(outcome.ok === false && outcome.code).toBe('OUT_OF_SCOPE')
    expect(calls).toEqual([])
  })

  it('未标注环境时写命令报环境那一条（不变量 2）', async () => {
    grant(WRITE.env)
    const { executor } = fakeExecutor()
    const outcome = await invokeRedisCommand({
      target: target({ env: 'unknown' }),
      commandText: 'SET k v',
      cwd: CWD,
      maxScanCount: MAX_SCAN,
      executor,
    })
    expect(outcome.ok === false && outcome.code).toBe('ENV_NOT_WRITABLE')
  })

  it('读命令在 unknown 环境仍可执行', async () => {
    const { executor } = fakeExecutor()
    const outcome = await invokeRedisCommand({
      target: target({ env: 'unknown' }),
      commandText: 'GET k',
      cwd: CWD,
      maxScanCount: MAX_SCAN,
      executor,
    })
    expect(outcome.ok).toBe(true)
  })

  it('审计按**解析出的动作名**记（不是原文），含被拒的尝试', async () => {
    const entries: AuditEntry[] = []
    const audit = { record: (entry: AuditEntry) => entries.push(entry) }
    const { executor } = fakeExecutor()

    await invokeRedisCommand({ target: target(), commandText: 'GET k', cwd: CWD, maxScanCount: MAX_SCAN, executor, audit })
    await invokeRedisCommand({ target: target(), commandText: 'SET k v', cwd: CWD, maxScanCount: MAX_SCAN, executor, audit })
    await invokeRedisCommand({ target: target(), commandText: 'FLUSHALL', cwd: CWD, maxScanCount: MAX_SCAN, executor, audit })

    expect(entries.map((entry) => entry.action)).toEqual(['get', 'set', 'FLUSHALL'])
    expect(entries.map((entry) => entry.allowed)).toEqual([true, false, false])
  })

  it('执行器失败 → EXECUTION_FAILED（不伪装成成功）', async () => {
    const { executor } = fakeExecutor({ ok: false, message: '连接被拒绝' })
    const outcome = await invokeRedisCommand({
      target: target(),
      commandText: 'GET k',
      cwd: CWD,
      maxScanCount: MAX_SCAN,
      executor,
    })
    expect(outcome.ok === false && outcome.code).toBe('EXECUTION_FAILED')
    expect(outcome.ok === false && outcome.message).toBe('连接被拒绝')
  })
})
