/**
 * 工具面测试（`docs/devdata-plan.md` §3.6.1 + §3.6 + §17.14）。
 *
 * 这一组用例把几条**结构性质**钉成可执行断言：
 *   - `never` 的动作**没有入口**（不是「注册了再拒」）；
 *   - 结构化引擎上写 / 危险读默认不露入口，且**未接入闸门也不露**；
 *   - **命令原文形态的引擎（Redis）只有一条入口**：结构化的动作名不是工具名（§17.12 的代价）；
 *   - 读类始终可见（可见性 ≠ 可执行性）；
 *   - 每次调用都进审计，**含被拒绝的尝试**；
 *   - 可见性与可执行性解耦：环境为 `unknown` 时读类仍可见，写类由 `adjudicate` 拒。
 */

import { HOST_SERVICES, LAUNCH_ENV_LAYERS, bindCapabilitySources } from '@hyzyn/dsh-kit'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  AGNOSTIC_TOOL_NAMES,
  CAP_ENV,
  ENGINES,
  RAW_COMMAND_TOOL,
  RAW_COMMAND_TOOL_NAME,
  TOOL_PREFIX,
  TOOL_SPECS,
  entryShapeFor,
  invokeRedisCommand,
  toolNameFor,
  invokeTool,
  isToolVisible,
  matrixFor,
  neverActions,
  visibleToolNames,
  visibleTools,
  type AuditEntry,
  type CapabilitySpec,
  type DevDataTarget,
  type ToolExecutor,
} from '../src/index.js'

const SPEC: CapabilitySpec = { env: 'TEST_DEVDATA_WRITE', label: '测试写能力' }
const DANGEROUS: CapabilitySpec = { env: 'TEST_DEVDATA_DANGEROUS', label: '测试危险读' }
const CWD = '/work/project-a'

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
    writeCapability: SPEC,
    dangerousReadCapability: DANGEROUS,
    ...overrides,
  }
}

/** 记录调用的假执行器。 */
function fakeExecutor(outcome: { ok: boolean; result?: unknown; message?: string } = { ok: true, result: { rows: [] } }): {
  executor: ToolExecutor
  calls: string[]
} {
  const calls: string[] = []
  return {
    calls,
    executor: {
      run: (request) => {
        calls.push(request.action)
        return Promise.resolve(outcome)
      },
    },
  }
}

describe('可见性：never 不提供入口', () => {
  it('每个引擎的 never 动作都不出现在可见面里', () => {
    // 失败意味着：FLUSHALL / EVAL 这类不可逆命令有了入口——有入口的白名单在它们面前是装饰。
    for (const engine of ENGINES) {
      const names = visibleToolNames(target({ engine }))
      for (const action of neverActions(engine)) {
        expect(names, `${engine} 的 never 动作 ${action} 不该有入口`).not.toContain(action)
      }
    }
  })

  it('可见面整体与 never 不相交（把断言抬到「集合层面」）', () => {
    for (const engine of ENGINES) {
      const names = visibleToolNames(target({ engine }))
      const managed = Object.keys(matrixFor(engine).operations)
      const forbidden = neverActions(engine)
      // 可见面只可能来自受管动作 + 引擎无关项，且不许与 never 相交。
      expect(names.filter((name) => forbidden.includes(name))).toEqual([])
      /*
       * 引擎相关项必须是受管动作。**做法是把工具名换回动作名**（去掉域前缀），而不是把
       * `managed` 加上前缀——那样等于在断言里复制一份命名规则。
       * 两个例外是设计的一部分：命令原文入口（动作由解析层算出，没有矩阵登记项，§17.12）
       * 与引擎无关的自证项（list_targets / doctor / capabilities）。
       */
      const engineSpecific = names
        .filter((name) => !AGNOSTIC_TOOL_NAMES.includes(name) && name !== RAW_COMMAND_TOOL_NAME)
        .map((name) => name.slice(TOOL_PREFIX.length))
      expect(engineSpecific.every((name) => managed.includes(name)), engineSpecific.join(',')).toBe(true)
    }
  })
})

describe('可见性：结构化引擎上，写 / 危险读默认关', () => {
  /*
   * 这条规则用 **RocketMQ 的 `send`** 验，因为它是结构化引擎里唯一登记过的写动作：
   * SQL 档永久只读（没有写动作），Redis 档走命令原文入口（下一组单说）。
   */
  const mq = (overrides: Partial<DevDataTarget> = {}): DevDataTarget =>
    target({ engine: 'rocketmq', id: 't-mq', label: '测试 MQ', ...overrides })

  it('未接入闸门 → 不露入口（防止「配了一半」的目标把写路径露出去）', () => {
    const names = visibleToolNames(mq({ writeCapability: undefined }))
    expect(names).not.toContain(toolNameFor('send'))
    // 读类不受影响。
    expect(names).toContain(toolNameFor('lag'))
    expect(names).toContain(toolNameFor('list_topics'))
  })

  it('接入闸门后写才可见（可执行性另行判定）', () => {
    expect(visibleToolNames(mq())).toContain(toolNameFor('send'))
  })

  it('环境不允许写时，写类连入口都不露（unknown / production）', () => {
    for (const env of ['unknown', 'production'] as const) {
      const names = visibleToolNames(mq({ env }))
      expect(names).not.toContain(toolNameFor('send'))
      // 读类照常可见（可见性 ≠ 可执行性）。
      expect(names).toContain(toolNameFor('lag'))
    }
  })

  it('SQL 档没有写入口（永久只读）：无 set/insert 之类', () => {
    const names = visibleToolNames(target({ engine: 'mysql' }))
    expect(names).toContain(toolNameFor('query'))
    expect(names).toContain(toolNameFor('schema'))
    expect(names).not.toContain(toolNameFor('set'))
    expect(names).not.toContain(toolNameFor('insert'))
  })

  it('引擎专属工具不会串台（Redis 上看不到 SQL 的 query，反之亦然）', () => {
    const redis = visibleToolNames(target({ engine: 'redis' }))
    expect(redis).not.toContain(toolNameFor('query'))
    const sql = visibleToolNames(target({ engine: 'mysql' }))
    expect(sql).not.toContain(toolNameFor('get'))
    expect(sql).not.toContain(toolNameFor('keys'))
    expect(sql).not.toContain(RAW_COMMAND_TOOL_NAME)
  })

  it('引擎无关的自证工具在任何目标上都可见', () => {
    for (const engine of ENGINES) {
      const names = visibleToolNames(target({ engine }))
      for (const agnostic of AGNOSTIC_TOOL_NAMES) expect(names, agnostic).toContain(agnostic)
    }
  })

  it('SQL 档的查询工具在 SQL 目标上可见（Redis 专属项不串台）', () => {
    const sql = visibleToolNames(target({ engine: 'mysql' }))
    expect(sql).toContain(toolNameFor('query'))
    expect(sql).toContain(toolNameFor('explain'))
    expect(sql).not.toContain(toolNameFor('get'))
    expect(sql).not.toContain(toolNameFor('keys'))
  })

  it('可见工具都带分组与参数清单（描述来自注册表，不另写一份）', () => {
    for (const tool of visibleTools(target())) {
      expect(tool.name.trim()).not.toBe('')
      expect(['discovery', 'understanding', 'query', 'diagnosis']).toContain(tool.group)
      expect(Array.isArray(tool.params)).toBe(true)
      expect(tool.why.trim()).not.toBe('')
    }
  })

  it('注册表里的引擎专属项都能在某个引擎的矩阵里找到（防拼写漂移）', () => {
    for (const spec of TOOL_SPECS) {
      // 引擎无关项与命令原文入口没有矩阵登记项（后者由解析层算动作，见 §17.12）。
      if (AGNOSTIC_TOOL_NAMES.includes(spec.name) || spec.action === RAW_COMMAND_TOOL) continue
      const managedSomewhere = ENGINES.some((engine) => matrixFor(engine).operations[spec.action] !== undefined)
      expect(managedSomewhere, `注册表里的 ${spec.name} 不在任何引擎矩阵里`).toBe(true)
    }
  })

  /*
   * 反方向的断言——这一条是**补上一个已经真实发生的漏网**（2026-10-02）：
   * `ENGINE_SPECIFIC` 原先手写，RocketMQ 的矩阵后加时没跟着长，于是 `lag` / `list_topics` /
   * `send` 这些受管动作**在工具面上永远不可见**，而当时只有「可见面里的都在矩阵里」这个方向
   * 的断言，查不出来。现在清单从矩阵现算，这条用例把「矩阵里的读动作都该可见」钉住。
   */
  it('每个引擎的每个受管**读**动作都在该引擎的目标上可见（反方向：矩阵 → 工具面）', () => {
    for (const engine of ENGINES) {
      // 命令原文形态的引擎把读动作也收进一条入口，没有同名的工具（见下一组）。
      if (entryShapeFor(engine) === 'raw-command') continue
      const names = visibleToolNames(target({ engine }))
      for (const spec of Object.values(matrixFor(engine).operations)) {
        // 写类默认关，另有专门用例；这里只管读与危险读。
        if (spec.kind === 'write-scoped') continue
        // 工具名 = 域前缀 + 动作名（仓库守卫要求 `<域>_<动作>`）。
        expect(names, `${engine} 的受管动作 ${spec.action} 在工具面上不可见`).toContain(toolNameFor(spec.action))
      }
    }
  })
})

describe('可见性：命令原文形态的引擎（Redis）只有一条入口', () => {
  /*
   * 这一组钉的是 §17.12 的**代价**（`tool.ts` 文件头「例外」一节）：
   * Redis 上 `GET` 与 `SET` 从同一个入口进来，所以「写入口不注册」在这里退化成
   * 「写在判据层拒」。断言必须把两件事分开看：
   *   - **工具名**：只有 `redis_command`；
   *   - **动作**：`get` / `set` / `keys`… 仍然在矩阵里、仍然可达（经解析层），闸门照走。
   */
  it('Redis 的可见面 = 一个命令原文入口 + 引擎无关的自证项', () => {
    const names = visibleToolNames(target())
    expect([...names].sort()).toEqual([...AGNOSTIC_TOOL_NAMES, RAW_COMMAND_TOOL_NAME].sort())
  })

  it('结构化动作名**不是** Redis 上的工具名（执行器只收命令原文，注册了也是跑起来必失败）', () => {
    const names = visibleToolNames(target())
    for (const structured of ['get', 'set', 'keys', 'monitor', 'info', 'search', 'describe', 'sample', 'del', 'expire']) {
      expect(names, `${structured} 不该是 Redis 上的工具名`).not.toContain(structured)
    }
  })

  it('但那些动作仍然登记在矩阵里（解析层算出的动作名要靠它们分档）', () => {
    for (const action of ['get', 'set', 'keys', 'monitor', 'info', 'search']) {
      expect(matrixFor('redis').operations[action], action).toBeDefined()
    }
  })

  it('入口存在 ≠ 写放行：走结构化入口的老名字会被**说清原因**地拒（不是「没接入闸门」）', async () => {
    // 目标上 `writeCapability` **是配好的**；拒的理由必须是「这个引擎没有结构化入口」，
    // 否则 agent 会去配置里找一个已经在那儿的东西。
    const { executor, calls } = fakeExecutor()
    const outcome = await invokeTool({ target: target(), toolName: 'set', cwd: CWD, executor })
    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.code).toBe('UNCLASSIFIED_OPERATION')
    expect(outcome.hint ?? '').toContain(RAW_COMMAND_TOOL)
    expect(calls).toEqual([])
  })

  it('命令原文入口在**别的引擎**上没有入口（否则 Redis 的判据会被别的引擎复用）', async () => {
    const { executor, calls } = fakeExecutor()
    const outcome = await invokeTool({ target: target({ engine: 'mysql', id: 't-sql' }), toolName: RAW_COMMAND_TOOL, cwd: CWD, executor })
    expect(outcome.ok).toBe(false)
    expect(calls).toEqual([])
  })
})

describe('调用：先裁决再执行', () => {
  /*
   * Redis 的调用一律走**命令原文入口**（那是它唯一的入口，见上一组）。
   * 结构化入口留给 SQL / MQ，本文件里由 `invokeTool` 的那几条用例覆盖。
   */
  const raw = (
    commandText: string,
    executor: ToolExecutor,
    extra: { target?: DevDataTarget; cwd?: string; audit?: { record(entry: AuditEntry): void } } = {},
  ) =>
    invokeRedisCommand({
      target: extra.target ?? target(),
      commandText,
      cwd: extra.cwd ?? CWD,
      maxScanCount: 50,
      executor,
      ...(extra.audit === undefined ? {} : { audit: extra.audit }),
    })

  it('入口不可见 → 被拒，且**不进入执行路径**', async () => {
    const { executor, calls } = fakeExecutor()
    // 在 SQL 目标上，Redis 的命令原文入口不存在。
    const outcome = await raw('GET k', executor, { target: target({ engine: 'mysql', id: 't-sql' }) })
    expect(outcome.ok).toBe(false)
    expect(outcome.ok === false && outcome.code).toBe('UNCLASSIFIED_OPERATION')
    expect(calls).toEqual([])
  })

  it('可见但未授权 → 被 adjudicate 拒，同样不执行', async () => {
    const { executor, calls } = fakeExecutor()
    const outcome = await raw('SET k v', executor)
    expect(outcome.ok).toBe(false)
    expect(outcome.ok === false && outcome.code).toBe('CAPABILITY_NOT_GRANTED')
    expect(calls).toEqual([])
  })

  it('共享环境里的不可逆写：**先拒**（CONFIRMATION_REQUIRED），带 confirmed 重试才执行', async () => {
    grant(SPEC.env)
    const { executor, calls } = fakeExecutor({ ok: true, result: { shaped: true } })
    const target0 = target({ env: 'test-shared' })

    // 第一枪：拒，且**执行器一次都没被调用**。
    const first = await raw('DEL user:1', executor, { target: target0 })
    expect(first.ok).toBe(false)
    expect(first.ok === false && first.code).toBe('CONFIRMATION_REQUIRED')
    expect(calls).toEqual([])

    // 说清楚影响之后带 confirmed 重试：这次才真的执行。
    const second = await invokeRedisCommand({
      target: target0,
      commandText: 'DEL user:1',
      cwd: CWD,
      maxScanCount: 50,
      executor,
      confirmed: true,
    })
    expect(second.ok).toBe(true)
    expect(second.ok === true && second.result).toEqual({ shaped: true })
    expect(calls).toEqual(['del'])
  })

  it('可丢弃副本（test-isolated）里的**可逆**写不需要二次确认（那是它存在的意义）', async () => {
    // 用 `SET` 而不是 `DEL`：`DEL` 在矩阵里 `reversible: false`，**任何**环境都要确认
    // （删了就没了）。二次确认有两个来源——环境档位（`test-shared` 要）与操作本身不可逆——
    // 这条用例要验的是前者的**缺席**。
    grant(SPEC.env)
    const { executor, calls } = fakeExecutor({ ok: true, result: {} })
    const outcome = await raw('SET k v', executor, { target: target({ env: 'test-isolated' }) })
    expect(outcome.ok).toBe(true)
    expect(calls).toEqual(['set'])
  })

  it('即使环境不需要确认，**不可逆操作自己也要求**（`DEL` 在可丢弃副本里同样先拒）', async () => {
    grant(SPEC.env)
    const { executor, calls } = fakeExecutor({ ok: true, result: {} })
    const outcome = await raw('DEL k', executor, { target: target({ env: 'test-isolated' }) })
    expect(outcome.ok === false && outcome.code).toBe('CONFIRMATION_REQUIRED')
    expect(calls).toEqual([])
  })

  it('环境不允许写时，**能力已授权也拒写**（不变量 2 与授权顺序无关）', async () => {
    grant(SPEC.env)
    const { executor, calls } = fakeExecutor()
    const outcome = await raw('SET k v', executor, { target: target({ env: 'unknown' }) })
    expect(outcome.ok === false && outcome.code).toBe('ENV_NOT_WRITABLE')
    expect(calls).toEqual([])
  })

  it('读类在 unknown 环境仍然可执行（读不改变状态）', async () => {
    const { executor } = fakeExecutor({ ok: true, result: 'v' })
    const outcome = await raw('GET k', executor, { target: target({ env: 'unknown' }) })
    expect(outcome.ok).toBe(true)
  })

  it('结构化入口在 SQL 目标上照常工作（读类在 unknown 也可执行）', async () => {
    const { executor } = fakeExecutor({ ok: true, result: { rows: [1] } })
    const outcome = await invokeTool({
      target: target({ engine: 'mysql', env: 'unknown' }),
      toolName: 'query',
      cwd: CWD,
      executor,
    })
    expect(outcome.ok).toBe(true)
  })

  it('作用域外被拒（读类同样受管）', async () => {
    const { executor, calls } = fakeExecutor()
    const outcome = await raw('GET k', executor, { cwd: '/elsewhere' })
    expect(outcome.ok === false && outcome.code).toBe('OUT_OF_SCOPE')
    expect(calls).toEqual([])
  })

  it('执行器失败 → EXECUTION_FAILED，不伪装成成功', async () => {
    const { executor } = fakeExecutor({ ok: false, message: '连接被拒绝' })
    const outcome = await raw('GET k', executor)
    expect(outcome.ok).toBe(false)
    expect(outcome.ok === false && outcome.code).toBe('EXECUTION_FAILED')
    expect(outcome.ok === false && outcome.message).toBe('连接被拒绝')
  })
})

describe('审计：记的是「试过什么」，不只是成功', () => {
  const raw = (
    commandText: string,
    executor: ToolExecutor,
    extra: { target?: DevDataTarget; cwd?: string; audit?: { record(entry: AuditEntry): void }; operationId?: string } = {},
  ) =>
    invokeRedisCommand({
      target: extra.target ?? target(),
      commandText,
      cwd: extra.cwd ?? CWD,
      maxScanCount: 50,
      executor,
      ...(extra.audit === undefined ? {} : { audit: extra.audit }),
      ...(extra.operationId === undefined ? {} : { operationId: extra.operationId }),
    })

  it('放行、拒绝、入口不可见三种情况都进审计', async () => {
    const entries: AuditEntry[] = []
    const audit = { record: (entry: AuditEntry) => entries.push(entry) }
    const { executor } = fakeExecutor()

    await raw('GET k', executor, { audit })
    await raw('SET k v', executor, { audit }) // 未授权
    await raw('GET k', executor, { audit, target: target({ engine: 'mysql', id: 't-sql' }) }) // 入口不可见
    await raw('GET k', executor, { audit, cwd: '/elsewhere' }) // 越界

    expect(entries).toHaveLength(4)
    expect(entries[0]?.allowed).toBe(true)
    expect(entries[1]?.allowed).toBe(false)
    expect(entries[1]?.code).toBe('CAPABILITY_NOT_GRANTED')
    expect(entries[2]?.allowed).toBe(false)
    expect(entries[2]?.code).toBe('UNCLASSIFIED_OPERATION')
    expect(entries[3]?.code).toBe('OUT_OF_SCOPE')
    // 审计里记的是**动作名**（解析层算出来的那个），不是入口名——「试过什么」问的是动作。
    expect(entries[0]?.action).toBe('get')
    expect(entries[1]?.action).toBe('set')
  })

  it('审计带上 operationId（把一次操作串起来）', async () => {
    const entries: AuditEntry[] = []
    const audit = { record: (entry: AuditEntry) => entries.push(entry) }
    const { executor } = fakeExecutor()
    await raw('GET k', executor, { audit, operationId: 'op-123' })
    expect(entries[0]?.operationId).toBe('op-123')
  })

  it('审计 sink 抛错时**不**吞掉：调用方据此实现 fail closed', async () => {
    // 本内核不替调用方决定「审计写不进去怎么办」，但必须**不静默吞掉**——
    // 否则一个坏掉的审计出口会变成「操作照做、记录没有」。
    const audit = {
      record: vi.fn(() => {
        throw new Error('审计盘不可写')
      }),
    }
    const { executor } = fakeExecutor()
    await expect(raw('GET k', executor, { audit })).rejects.toThrow('审计盘不可写')
  })
})

describe('工具名与能力变量名的稳定性', () => {
  it('CAP_ENV 的四个能力名都在 kit 的判定口径里（`export X=1` 后重启宿主）', () => {
    for (const value of Object.values(CAP_ENV)) {
      expect(value.startsWith('DSH_DEVDATA_')).toBe(true)
    }
  })

  it('isToolVisible 与 visibleToolNames 口径一致', () => {
    const t = target()
    for (const name of visibleToolNames(t)) {
      expect(isToolVisible(t, name)).toBe(true)
    }
    expect(isToolVisible(t, 'eval')).toBe(false)
  })
})
