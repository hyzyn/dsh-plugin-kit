/**
 * 真机：`248` 那台 Redis 上的**完整链路**（门控在环境变量上，默认跳过）。
 *
 * ```
 * DEVDATA_REDIS_248=1 npx vitest run packages/devdata/test/redis-real-machine.test.ts
 * ```
 *
 * ## 为什么这条值得单独存在
 *
 * 单测覆盖的是「执行器按裁决结果老实地发命令」；**这里要验的是真机上的两端**：
 * ① 自写 RESP 与真实 Redis（4.0.14）说得上话、整形正确；
 * ② **代码层那道闸门真的守得住**——因为这台 Redis **无密码且没有 ACL**，
 *    「只读账号」那层**根本不存在**（`ACL WHOAMI` → `unknown command`），
 *    只读**只**由白名单 + 矩阵 + 能力闸门保证。所以这里要**实证**危险读与被排除的命令都进不来。
 *
 * 主机与端口可用 `DEVDATA_REDIS_HOST` / `DEVDATA_REDIS_PORT` 覆盖；用例**只发读类命令**
 * （外加一条「被拒的写**真的没发生**」的只读核对）。
 */

import { describe, expect, it } from 'vitest'

import { createRedisExecutor, invokeRedisCommand, type DevDataTarget, type ToolOutcome } from '../src/index.js'
import { makeHost } from './fake-host.js'

const HOST = process.env.DEVDATA_REDIS_HOST ?? '192.168.80.248'
const PORT = Number(process.env.DEVDATA_REDIS_PORT ?? '6379')
const CAN_PROBE = process.env.DEVDATA_REDIS_248 === '1'

describe.skipIf(!CAN_PROBE)(`真机：Redis 通路 A（${HOST}:${String(PORT)}）`, () => {
  const cwd = process.cwd()
  const target: DevDataTarget = { id: 'redis-248', label: '248 Redis', engine: 'redis', env: 'test', scopeDirs: [cwd] }
  const audit: string[] = []
  const executor = createRedisExecutor({
    connections: { 'redis-248': { host: HOST, port: PORT } },
    timeoutMs: 5000,
  })

  const call = (commandText: string): Promise<ToolOutcome> =>
    invokeRedisCommand({
      target,
      commandText,
      cwd,
      maxScanCount: 50,
      executor,
      audit: { record: (entry) => audit.push(`${entry.allowed ? '允许' : '拒绝'} ${entry.action}`) },
    })

  it('① 白名单读类放行，且整形正确（PING / DBSIZE / INFO）', async () => {
    /*
     * 每条断言都把**执行器给的那句话**带进失败信息（`ok` 为假时的 `message`）。
     * 理由：真机用例跨 VPN，偶发的连接层抖动会让它红一条——而「红在哪一步、为什么」若不在输出里，
     * 下一个人只能靠重跑猜。（2026-10-02 实测过一次无法复现的红：15 次里 1 次，耗时 84ms，
     * 与 5s 超时对不上，更像是连接被拒；当时没留下原因，这条改动就是补这个缺口。）
     */
    const ping = await call('PING')
    expect(ping.ok, ping.ok ? '' : ping.message).toBe(true)
    if (ping.ok) expect(ping.result).toBe('PONG')

    const size = await call('DBSIZE')
    expect(size.ok, size.ok ? '' : size.message).toBe(true)
    if (size.ok) {
      expect(typeof size.result).toBe('number')
      expect(size.result as number).toBeGreaterThanOrEqual(0)
    }

    const info = await call('INFO server')
    expect(info.ok, info.ok ? '' : info.message).toBe(true)
    if (info.ok) expect(String(info.result)).toContain('redis_version')
  })

  it('② `SCAN` 的**嵌套数组**整形正确（游标 + 键数组）', async () => {
    const scan = await call('SCAN 0 COUNT 5')
    expect(scan.ok).toBe(true)
    if (!scan.ok) return
    const [cursor, keys] = scan.result as [unknown, unknown]
    expect(typeof cursor).toBe('string')
    expect(Array.isArray(keys)).toBe(true)
    for (const key of keys as unknown[]) expect(typeof key).toBe('string')
  })

  it('③ **危险读**（`KEYS` / `MONITOR`）被拒——没给 `dangerousReadCapability`', async () => {
    for (const command of ['KEYS *', 'MONITOR 1']) {
      const outcome = await call(command)
      expect(outcome.ok, `${command} 不该放行`).toBe(false)
    }
  })

  it('④ 被**明确排除**的命令（`FLUSHALL` / `CONFIG SET` / `EVAL`）一律进不来', async () => {
    for (const command of ['FLUSHALL', 'CONFIG SET requirepass x', 'EVAL "return 1" 0']) {
      const outcome = await call(command)
      expect(outcome.ok, `${command} 不该有入口`).toBe(false)
    }
  })

  it('⑤ 写类被拒——没给 `writeCapability`；且**真的没写进去**（只读核对）', async () => {
    const write = await call('SET devdata:probe 1')
    expect(write.ok).toBe(false)

    // 反向核对：这个键不存在（= 上一步的「拒绝」不是嘴上说说）
    const exists = await call('EXISTS devdata:probe')
    expect(exists.ok).toBe(true)
    if (exists.ok) expect(exists.result).toBe(0)
  })

  it('⑥ 审计出口记下了**被拒绝的尝试**（那才是「agent 试过什么」的证据）', () => {
    expect(audit.some((line) => line.startsWith('拒绝'))).toBe(true)
    expect(audit.some((line) => line.startsWith('允许'))).toBe(true)
  })
})

/**
 * ## 第二层：**插件层**真的打 248
 *
 * 上面那组走的是内核（`invokeRedisCommand`）。这一组再往上一层：**挂载插件**（假宿主，其余全真），
 * 从 agent 会调用的那个工具名进去，一路到真 Redis。多验到的东西：
 *
 *   - 插件注册出来的**工具名**（`devdata_redis_command`）与描述里的目标名单是对的；
 *   - `entryTools` → 注册 → 调用 → 解析层 → 裁决 → 执行器 这条**宿主接线**是通的；
 *   - 拒绝在工具层被转成 agent 看到的那句话（`[CODE]` + 恢复路径）。
 *
 * 假掉的只有 **DSH 宿主本身**（服务注入与事件广播）——真宿主的挂载由
 * `scripts/verify-devdata-host-mount.mjs` 单独验（那条不连真 Redis）。
 */
describe.skipIf(!CAN_PROBE)(`真机：插件层打 ${HOST}:${String(PORT)}`, () => {
  const CWD = process.cwd()

  /** 挂一个只配了 248 的插件实例。 */
  function mount(toolName: string, extra: Record<string, unknown> = {}) {
    const host = makeHost()
    host.mount({
      auditFile: '',
      targets: [
        {
          id: 'redis-248',
          label: '248 Redis（共享联调）',
          engine: 'redis',
          env: 'test-shared',
          scopeDirs: [CWD],
          host: HOST,
          port: PORT,
        },
      ],
      ...extra,
    })
    void toolName
    return host
  }

  it('① `devdata_redis_command` 只读放行，回复交付给 agent', async () => {
    const host = mount('devdata_redis_command')
    expect(host.names()).toContain('devdata_redis_command')
    const text = await host.call('devdata_redis_command', { target: 'redis-248', command: 'PING', cwd: CWD })
    expect(text).toBe('PONG')
    const size = await host.call('devdata_redis_command', { target: 'redis-248', command: 'DBSIZE', cwd: CWD })
    expect(Number.isInteger(Number(size))).toBe(true)
  })

  it('② `SCAN` 的嵌套数组经工具层照样整形正确', async () => {
    const host = mount('devdata_redis_command')
    const text = await host.call('devdata_redis_command', { target: 'redis-248', command: 'SCAN 0 COUNT 5', cwd: CWD })
    const parsed = JSON.parse(text) as [unknown, unknown]
    expect(typeof parsed[0]).toBe('string')
    expect(Array.isArray(parsed[1])).toBe(true)
  })

  it('③ 危险读与写类：工具层给出的那句话**带码与恢复路径**，且真的没写进去', async () => {
    const host = mount('devdata_redis_command')
    const keys = await host
      .call('devdata_redis_command', { target: 'redis-248', command: 'KEYS *', cwd: CWD })
      .catch((error: unknown) => String(error))
    expect(keys).toContain('[CAPABILITY_NOT_DECLARED]')
    expect(keys).toContain('恢复路径：')

    const write = await host
      .call('devdata_redis_command', { target: 'redis-248', command: 'SET devdata:probe 1', cwd: CWD })
      .catch((error: unknown) => String(error))
    expect(write).toContain('[CAPABILITY_NOT_DECLARED]')

    // 反向核对：这个键不存在（= 上一步的「拒绝」不是嘴上说说）
    const exists = await host.call('devdata_redis_command', { target: 'redis-248', command: 'EXISTS devdata:probe', cwd: CWD })
    expect(Number(exists)).toBe(0)
  })

  it('④ 不可逆命令没有入口（报的是「被排除」，不是「不认识」）', async () => {
    const host = mount('devdata_redis_command')
    const text = await host
      .call('devdata_redis_command', { target: 'redis-248', command: 'FLUSHALL', cwd: CWD })
      .catch((error: unknown) => String(error))
    expect(text).toContain('[OPERATION_FORBIDDEN]')
  })

  it('⑤ `capabilities` / `doctor` 对着真目标给出的是**配置事实**（不连目标也不撒谎）', async () => {
    const host = mount('devdata_redis_command')
    const caps = await host.call('devdata_capabilities', { target: 'redis-248', cwd: CWD })
    expect(caps).toContain('devdata_redis_command')
    // 没声明能力规格 = **未接入闸门**（不是「接了但没授权」——这两句话指向不同的动作）。
    expect(caps).toContain('未接入闸门')

    // 声明了能力规格、但宿主没授权时，给出的必须是**怎么授权**而不是一句「未授权」。
    const declared = mount('devdata_redis_command', {
      targets: [
        {
          id: 'redis-248',
          label: '248 Redis（共享联调）',
          engine: 'redis',
          env: 'test-shared',
          scopeDirs: [CWD],
          host: HOST,
          port: PORT,
          writeCapability: { env: 'DSH_DEVDATA_WRITE', label: '写操作' },
        },
      ],
    })
    const declaredCaps = await declared.call('devdata_capabilities', { target: 'redis-248', cwd: CWD })
    expect(declaredCaps).toContain('当前未获授权')
    expect(declaredCaps).toContain('DSH_DEVDATA_WRITE')
    expect(declaredCaps).toContain('重启宿主')

    const doctor = await host.call('devdata_doctor', { target: 'redis-248', cwd: CWD })
    /*
     * Redis 的账号级只读是「**不适用**」（`—`）而不是「验不到」（`!`）：那台 4.0.14 没有 ACL，
     * 这一档**根本不存在**——报告要区分这两件事，否则用户会去找一个不可能有的东西。
     * 而 SQL 目标上同一层就是 `!`（缺证 = 拒绝启用），见 `plugin.test.ts`。
     */
    expect(doctor).toContain('— 账号级只读自证')
    expect(doctor).toContain('没有账号级只读概念')
    expect(doctor).toContain('! 审计出口')
  })
})
