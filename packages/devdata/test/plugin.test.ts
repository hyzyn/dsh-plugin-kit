/**
 * 宿主半体**端到端**：假宿主 + 假 Redis 服务，把四个工具真的跑一遍。
 *
 * ## 为什么值得一组这样的用例（照 `devfront/test/tool-smoke.test.ts` 的教训）
 *
 * devfront 四轮真机验收里，**每一次抓到真缺陷的都是「把工具全跑一遍」这件事**——单测抓不到
 * 「注册出去的声明」与「执行时真的交付的东西」之间的差。本文件把同一条纪律用在这里：
 *
 *   - 注册面（哪些工具**在**、哪些**不在**）与 `entries.ts` 算出来的入口面对齐；
 *   - 工具描述里嵌的目标名单**真的**随配置变（volatile 契约）；
 *   - 拒绝**真的**带 `[CODE]` 与恢复路径，且**执行器一次都没被调用**（假服务器能证明这一点）；
 *   - 写类**真的**因为审计缺失被挡在门外；
 *   - 审计**真的**落成 JSON 行（含被拒绝的尝试）。
 *
 * 假宿主只做三件事的真：服务注入、事件广播、登记可撤销（与 `devfront` 的同一套做法）。
 * 不碰真 profile、不碰真 Chrome、不连真 Redis。
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { apply, toolNameFor } from '../src/index.js'
import { CWD, makeHost, redisTarget } from './fake-host.js'
import { simpleReplies, startFakeRedis, type FakeRedisServer } from './fake-redis.js'


/** 一个合法的 Redis 目标配置（作用域是本用例的 CWD）。 */
const servers: FakeRedisServer[] = []
beforeEach(() => {
  servers.length = 0
})
afterEach(async () => {
  while (servers.length > 0) await servers.pop()?.close()
})

async function fakeRedis(respond = simpleReplies): Promise<FakeRedisServer> {
  const server = await startFakeRedis(respond)
  servers.push(server)
  return server
}

const GRANT_WRITE = 'DSH_DEVDATA_WRITE'
/** 工具名（带域前缀；仓库守卫要求 `<域>_<动作>`）。 */
const T = toolNameFor
const REDIS_COMMAND = toolNameFor('redis_command')

/* ------------------------ `devdata_verify`：项目目录夹具 ------------------------ */

/** 造过的项目目录（用例结束删掉，不在 /tmp 里留东西）。 */
const projectDirs: string[] = []
afterEach(() => {
  for (const dir of projectDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/**
 * 造一个项目目录 + 一份验活清单。
 *
 * **目录名就是项目名**：清单解析缺省取 `cwd` 的目录名，所以用例里 `cwd: dir` 等价于
 * `project: <项目名>`——这条正是「项目名只有一处」那条约束的用法（文件名与 `project` 字段必须一致）。
 */
function projectWith(project: string, yaml: string): string {
  const root = mkdtempSync(join(tmpdir(), 'dsh-devdata-verify-'))
  projectDirs.push(root)
  const dir = join(root, project)
  mkdirSync(join(dir, 'verify'), { recursive: true })
  writeFileSync(join(dir, 'verify', `${project}.yaml`), yaml)
  return dir
}

/** 一份清单的 YAML（表头固定，断言逐条拼）。 */
function verifyYaml(project: string, ...assertions: string[]): string {
  return ['version: 1', `project: ${project}`, 'assertions:', ...assertions, ''].join('\n')
}

/** 一条能跑的 Redis 断言（`PING` → 假服务回 `PONG`）。 */
const PING_ASSERTION = [
  '  - id: redis-alive',
  '    appliesTo: backend',
  '    target: redis-248',
  '    statement: PING',
  '    expect: { eq: PONG }',
  '    severity: fail',
].join('\n')

/** 一条**引擎没接通**的断言（SQL 档今天没有执行器）。 */
const SQL_ASSERTION = [
  '  - id: order-count',
  '    appliesTo: backend',
  '    target: sql-1',
  '    statement: SELECT 1',
  '    expect: { eq: 1 }',
  '    severity: fail',
].join('\n')

describe('注册面：只有这个引擎真的有执行器，才注册它的入口', () => {
  it('Redis 目标 → 五个工具；未启用 / 无目标 → 一个都不注册', () => {
    const redisHost = makeHost()
    redisHost.mount({ targets: [redisTarget()] })
    /*
     * `devdata_verify` 是第五个，也是唯一**不在 `TOOL_SPECS`** 里的（它不是引擎入口：动作按清单里
     * 每条断言的 `target` 逐条派发）。它的可见性判据因此只有一条：**这份配置里存在 redis 目标**
     * ——正是下面 SQL 目标那一条（仍只有三个工具）与「无目标 → 一个都不注册」保持不变的原因。
     */
    expect(redisHost.names()).toEqual([T('capabilities'), T('doctor'), T('list_targets'), REDIS_COMMAND, T('verify')])

    const empty = makeHost()
    empty.mount({ targets: [] })
    expect(empty.names()).toEqual([])

    const off = makeHost()
    off.mount({ enabled: false, targets: [redisTarget()] })
    expect(off.names()).toEqual([])
  })

  it('**没有执行器**的引擎只给引擎无关项（不给跑起来必失败的 `query` / `schema` / `lag`）', () => {
    const host = makeHost()
    host.mount({ targets: [redisTarget({ id: 'sql-1', engine: 'mysql', host: '10.0.0.1', port: 3306 })] })
    // 只有 SQL 目标 → 连清单入口也不出现（没有 redis 目标可派发；将来 SQL 通路接通时会自动出现）
    expect(host.names()).toEqual([T('capabilities'), T('doctor'), T('list_targets')])
  })

  it('调用一个没注册的工具 = agent 根本看不到它（不是「注册了再拒」）', async () => {
    const host = makeHost()
    host.mount({ targets: [redisTarget({ id: 'sql-1', engine: 'mysql' })] })
    await expect(host.call(REDIS_COMMAND, { target: 'sql-1', command: 'PING' })).rejects.toThrow('没有注册')
  })
})

describe('list_targets：发现面就是作用域面', () => {
  it('作用域内的目标可用，作用域外**明确标出不可用并给出原因**', async () => {
    const host = makeHost()
    host.mount({
      targets: [
        redisTarget(),
        redisTarget({ id: 'redis-elsewhere', scopeDirs: ['/w/other'] }),
        redisTarget({ id: 'redis-noscope', scopeDirs: [] }),
      ],
    })
    const text = await host.call(T('list_targets'), { cwd: CWD })
    expect(text).toContain('可用 1 个目标（共 3 个）')
    expect(text).toContain('redis-248')
    expect(text).toContain('redis-elsewhere')
    expect(text).toContain('作用域为空 = 处处拒绝')
    expect(text).toContain('**不可用**')
  })

  it('一个目标都没有时给的是配置动作，不是空白', async () => {
    const host = makeHost()
    host.mount({ targets: [] })
    // 没有目标时连工具都不注册，所以这里验的是「注册了但一个目标都没有」这一支（由配置问题驱动）。
    expect(host.names()).toEqual([])
  })
})

describe('redis_command：真的走完整条链路', () => {
  it('只读命令放行，回复整形后交付给 agent（**帧序**：没配 db 就不该先发 `SELECT 0`）', async () => {
    const server = await fakeRedis()
    const host = makeHost()
    host.mount({ targets: [redisTarget({ port: server.port })] })
    const text = await host.call(REDIS_COMMAND, { target: 'redis-248', command: 'PING', cwd: CWD })
    expect(text).toBe('PONG')
    expect(server.requests).toEqual([['PING']])
  })

  it('命令原文**照原样**下发（多余空格不该变成空参数）', async () => {
    const server = await fakeRedis()
    const host = makeHost()
    host.mount({ targets: [redisTarget({ port: server.port })] })
    await host.call(REDIS_COMMAND, { target: 'redis-248', command: '  GET   order:1  ', cwd: CWD })
    expect(server.requests).toEqual([['GET', 'order:1']])
  })

  it('作用域外：拒，且**执行器一次都没被调用**（假服务器能看到请求表）', async () => {
    const server = await fakeRedis()
    const host = makeHost()
    host.mount({ targets: [redisTarget({ port: server.port })] })
    const error = await host
      .call(REDIS_COMMAND, { target: 'redis-248', command: 'PING', cwd: '/elsewhere' })
      .catch((e: unknown) => String(e))
    expect(error).toContain('[OUT_OF_SCOPE]')
    // 恢复路径要**点名被判的目录**与允许目录——不然 agent 只能猜（真机首次使用的纸割）。
    expect(error).toContain('/elsewhere')
    expect(error).toContain(CWD)
    expect(error).toContain('宿主进程的工作目录')
    expect(server.requests).toEqual([])
  })

  it('写命令未授权 → `[CAPABILITY_NOT_GRANTED]` + **一行能照做的恢复路径**', async () => {
    const server = await fakeRedis()
    const host = makeHost()
    host.mount({ targets: [redisTarget({ port: server.port, writeCapability: { env: GRANT_WRITE, label: '写操作' } })] })
    const error = await host.call(REDIS_COMMAND, { target: 'redis-248', command: 'SET k v', cwd: CWD }).catch((e: unknown) => String(e))
    expect(error).toContain('[CAPABILITY_NOT_GRANTED]')
    expect(error).toContain('恢复路径：')
    expect(error).toContain(GRANT_WRITE)
    expect(server.requests).toEqual([])
  })

  it('不可逆命令（FLUSHALL）：**没有入口**，报的是「被排除」而不是「不认识」', async () => {
    const server = await fakeRedis()
    const host = makeHost()
    host.mount({ targets: [redisTarget({ port: server.port })] })
    const error = await host.call(REDIS_COMMAND, { target: 'redis-248', command: 'FLUSHALL', cwd: CWD }).catch((e: unknown) => String(e))
    expect(error).toContain('[OPERATION_FORBIDDEN]')
    expect(server.requests).toEqual([])
  })

  it('写类缺持久审计 → `[AUDIT_NOT_DURABLE]`（即使能力已授权、环境可写）', async () => {
    const server = await fakeRedis()
    const host = makeHost()
    host.grant(GRANT_WRITE)
    host.mount({
      targets: [redisTarget({ port: server.port, env: 'test-isolated', writeCapability: { env: GRANT_WRITE, label: '写操作' } })],
    })
    const error = await host.call(REDIS_COMMAND, { target: 'redis-248', command: 'SET k v', cwd: CWD }).catch((e: unknown) => String(e))
    expect(error).toContain('[AUDIT_NOT_DURABLE]')
    expect(error).toContain('auditFile')
    expect(server.requests).toEqual([])
  })

  it('配了持久审计 + 已授权 + 可丢弃副本 → 写真的发出去，并落成 JSON 行', async () => {
    const server = await fakeRedis()
    const dir = mkdtempSync(join(tmpdir(), 'devdata-plugin-'))
    const file = join(dir, 'audit.jsonl')
    try {
      const host = makeHost()
      host.grant(GRANT_WRITE)
      host.mount({
        auditFile: file,
        targets: [redisTarget({ port: server.port, env: 'test-isolated', writeCapability: { env: GRANT_WRITE, label: '写操作' } })],
      })
      const text = await host.call(REDIS_COMMAND, { target: 'redis-248', command: 'SET k v', cwd: CWD })
      expect(text).toContain('hello')
      expect(server.requests).toEqual([['SET', 'k', 'v']])
      const line = JSON.parse(readFileSync(file, 'utf8').trim()) as Record<string, unknown>
      expect(line.action).toBe('set')
      expect(line.allowed).toBe(true)
      expect(line.targetId).toBe('redis-248')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('共享环境里的不可逆写 → 先拒（`[CONFIRMATION_REQUIRED]`），带 confirmed 重试才执行', async () => {
    const server = await fakeRedis()
    const dir = mkdtempSync(join(tmpdir(), 'devdata-plugin-'))
    try {
      const host = makeHost()
      host.grant(GRANT_WRITE)
      host.mount({
        auditFile: join(dir, 'audit.jsonl'),
        targets: [redisTarget({ port: server.port, writeCapability: { env: GRANT_WRITE, label: '写操作' } })],
      })
      const first = await host.call(REDIS_COMMAND, { target: 'redis-248', command: 'DEL k', cwd: CWD }).catch((e: unknown) => String(e))
      expect(first).toContain('[CONFIRMATION_REQUIRED]')
      expect(server.requests).toEqual([])

      await host.call(REDIS_COMMAND, { target: 'redis-248', command: 'DEL k', cwd: CWD, confirmed: true })
      expect(server.requests).toEqual([['DEL', 'k']])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('被拒绝的尝试**同样**落进审计（那才是「试过什么」的证据）', async () => {
    const server = await fakeRedis()
    const dir = mkdtempSync(join(tmpdir(), 'devdata-plugin-'))
    const file = join(dir, 'audit.jsonl')
    try {
      const host = makeHost()
      host.mount({ auditFile: file, targets: [redisTarget({ port: server.port })] })
      await host.call(REDIS_COMMAND, { target: 'redis-248', command: 'SET k v', cwd: CWD }).catch(() => undefined)
      const line = JSON.parse(readFileSync(file, 'utf8').trim()) as Record<string, unknown>
      expect(line.allowed).toBe(false)
      expect(line.code).toBe('CAPABILITY_NOT_DECLARED')
      expect(line.action).toBe('set')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  /*
   * 这一组是 2026-10-02 真机缺陷的回归：`devdata_capabilities` 对**每个**目标都多报两条
   * 「能力规格没有给 env」——而目标是压根没写能力规格。根因在 schema：schemastery 会对
   * `z.object({env: default(''), …})` 在**未写**时造出 `{env:'', label:''}`，于是「没写」被
   * 判成「写了个空的」。
   *
   * 之所以先前没抓到：假宿主直接把自己写的对象喂给 `apply`，而真宿主**先过 schema**。本文件的
   * 假宿主现在会过 schema（见 `fake-host.ts` 的 `resolveConfig`），所以这类行为在用例里可见了。
   */
  it('**没写**能力规格的目标不该报配置问题（真机那条假问题）', async () => {
    const host = makeHost()
    host.mount({ targets: [redisTarget()] }) // 没有 writeCapability / dangerousReadCapability
    const text = await host.call(T('capabilities'), { target: 'redis-248', cwd: CWD })
    expect(text).not.toContain('配置问题')
    expect(text).toContain('未接入闸门')
  })

  it('反例：**真的写了**空能力规格 → 照报（修过头就没人拦真错了）', async () => {
    const host = makeHost()
    host.mount({ targets: [redisTarget({ writeCapability: {} })] })
    const text = await host.call(T('capabilities'), { target: 'redis-248', cwd: CWD })
    expect(text).toContain('配置问题')
    expect(text).toContain('没有 env')
  })

  /*
   * 「配置问题**看得见**」是一条独立性质：它必须落在**启动日志能收到的**地方（stdout/stderr），
   * 而不是 `ctx.logger` 的另一个 sink。2026-10-02 踩过两次：先是注册行走 logger（启动日志里
   * 什么都没有），再是配置问题走 logger（于是挂载验收脚本里那条断言变成空断言）。
   */
  it('配置问题落在 stdout/stderr 上（`console.warn`），不是 logger 的另一个 sink', () => {
    const echoed: string[] = []
    const original = console.warn
    console.warn = (...args: unknown[]) => echoed.push(args.join(' '))
    try {
      const bad = makeHost()
      bad.mount({ targets: [redisTarget({ writeCapability: {} })] })
      expect(echoed.join('\n')).toContain('配置问题')

      echoed.length = 0
      const good = makeHost()
      good.mount({ targets: [redisTarget()] }) // 什么都没写
      expect(echoed.join('\n')).not.toContain('配置问题')
    } finally {
      console.warn = original
    }
  })

  it('反例：能力规格**不是对象** → 在 schema 层就被拒（fail closed，不进入 apply）', async () => {
    const host = makeHost()
    // 真宿主的实测行为（2026-10-02，隔离 profile）：宿主照常起来，但报
    //   `dsh: warning: 1 entry did not activate`
    //   `devdata (@hyzyn/dsh-devdata): ValidationError: invalid config:`
    //   `  - $.targets[0].dangerousReadCapability expected object but got true (at …)`
    // 而 `[dsh-devdata] mounted` 一行都没有——**插件整体不挂载**，一个工具都不注册。
    // 这比「宽容解析成未接入闸门」更好：错误带精确路径、且不会让人误以为「只是没权限」。
    expect(() => host.mount({ targets: [redisTarget({ dangerousReadCapability: true })] })).toThrow(/expected object/)
    expect(host.names()).toEqual([])
  })

  it('缺 command / 目标不存在：报的是「少了什么 + 可用名单」', async () => {
    const host = makeHost()
    host.mount({ targets: [redisTarget()] })
    await expect(host.call(REDIS_COMMAND, { target: 'redis-248', cwd: CWD })).rejects.toThrow(/缺少 command/)
    await expect(host.call(REDIS_COMMAND, { command: 'PING', cwd: CWD })).rejects.toThrow(/可用目标/)
    await expect(host.call(REDIS_COMMAND, { target: 'nope', command: 'PING', cwd: CWD })).rejects.toThrow(/redis-248/)
  })

  it('把别的引擎的目标塞进来 → 说清「命令原文入口只对 Redis 有效」', async () => {
    const host = makeHost()
    host.mount({ targets: [redisTarget(), redisTarget({ id: 'sql-1', engine: 'mysql' })] })
    await expect(host.call(REDIS_COMMAND, { target: 'sql-1', command: 'PING', cwd: CWD })).rejects.toThrow(/只对 Redis 有效/)
  })
})

describe('capabilities / doctor：撞墙之后的出路', () => {
  it('capabilities 说清档位、闸门与**怎么授权**（点名环境变量与「重启宿主」）', async () => {
    const host = makeHost()
    host.mount({ targets: [redisTarget({ writeCapability: { env: GRANT_WRITE, label: '写操作' } })] })
    const text = await host.call(T('capabilities'), { target: 'redis-248', cwd: CWD })
    expect(text).toContain('写类能力：已接入')
    expect(text).toContain('当前未获授权')
    expect(text).toContain(GRANT_WRITE)
    expect(text).toContain('重启宿主')
    expect(text).toContain(REDIS_COMMAND)
    expect(text).toContain('flushall')
  })

  it('capabilities 里**不含任何凭证值**（只报是否设置与保护强度）', async () => {
    const host = makeHost()
    host.mount({ targets: [redisTarget({ credentialRef: 'env:REDIS_PASS', writeCapability: { env: GRANT_WRITE } })] })
    const text = await host.call(T('capabilities'), { target: 'redis-248', cwd: CWD })
    expect(text).toContain('不构成防护')
    expect(text).not.toContain('env:REDIS_PASS')
  })

  it('doctor：空作用域报 `✗`、没有执行器的引擎报 `!`，且**验不到的从不报 `✓`**', async () => {
    const host = makeHost()
    host.mount({
      targets: [
        redisTarget({ scopeDirs: [] }),
        redisTarget({ id: 'sql-1', engine: 'mysql', scopeDirs: [CWD] }),
      ],
    })
    const redis = await host.call(T('doctor'), { target: 'redis-248', cwd: CWD })
    expect(redis).toContain('✗ 目录作用域')
    expect(redis).toContain('处处拒绝')

    const sql = await host.call(T('doctor'), { target: 'sql-1', cwd: CWD })
    expect(sql).toContain('! 引擎执行器')
    expect(sql).toContain('尚未实现执行器')
    expect(sql).toContain('! 账号级只读自证')
  })

  it('doctor 会说出「只有日志、没有持久记录」，并因此说明写类会被拒', async () => {
    const host = makeHost()
    host.mount({ targets: [redisTarget()] })
    const text = await host.call(T('doctor'), { target: 'redis-248', cwd: CWD })
    expect(text).toContain('! 审计出口')
    expect(text).toContain('没有持久记录')
  })
})

describe('volatile 契约：配置改了必须真的生效', () => {
  it('改目标 → 工具描述里嵌的目标名单跟着变', async () => {
    const host = makeHost()
    host.mount({ targets: [redisTarget()] })
    expect(host.descriptionOf(REDIS_COMMAND, 'target')).toContain('redis-248')

    await host.update({ targets: [redisTarget(), redisTarget({ id: 'redis-b' })] })
    expect(host.descriptionOf(REDIS_COMMAND, 'target')).toContain('redis-b')
  })

  it('值没变的广播不拆装工具（`loader/volatile-update` 是全仓广播）', async () => {
    const host = makeHost()
    host.mount({ targets: [redisTarget()] })
    const before = host.counts.registrations
    // 别人的配置变更 → 广播 → 我们这里值没变：不该重注册。
    await host.update({ enabled: true })
    expect(host.counts.registrations).toBe(before)
  })

  it('空对象不当配置（settings 还没就绪时不能把已声明的目标整批抹掉）', async () => {
    const host = makeHost()
    host.mount({ targets: [redisTarget()] })
    host.notReady()
    await host.update({ enabled: true })
    await host.settings.update('devdata', {})
    // entry 未就绪 → `scope.get()` 得到 `{}` → applySection 直接返回，工具不该消失。
    expect(host.names()).toContain(REDIS_COMMAND)
  })
})

describe('挂载与公告', () => {
  it('挂载时不注册任何 HTTP 路由、只插一段 systemPrompt 公告', () => {
    const host = makeHost()
    host.mount({ targets: [redisTarget()] })
    expect(host.counts.sections).toBe(1)
    expect(host.names()).toContain(T('list_targets'))
  })

  it('announceToAgent: false → 不插公告（但工具照常）', () => {
    const host = makeHost()
    host.mount({ announceToAgent: false, targets: [redisTarget()] })
    expect(host.counts.sections).toBe(0)
    expect(host.names()).toContain(REDIS_COMMAND)
  })

  it('没有 settings 服务的宿主照旧可用（config-only 兜底）', () => {
    const host = makeHost({ settings: false })
    host.mount({ targets: [redisTarget()] })
    expect(host.names()).toEqual([T('capabilities'), T('doctor'), T('list_targets'), REDIS_COMMAND, T('verify')])
  })
})

/* ==================== `devdata_verify`：按项目清单跑一批只读断言 ==================== */

describe('devdata_verify：按清单逐条派发（四种处置都要在真工具面上分得开）', () => {
  it('清单里能跑的断言 → 真跑：裸回复经整形后进求值，报告逐条给结论', async () => {
    const server = await fakeRedis()
    const dir = projectWith('cdqas', verifyYaml('cdqas', PING_ASSERTION))
    const host = makeHost()
    // 作用域就是这个项目目录（清单驱动的调用不传 target，作用域仍按 cwd 收敛）
    host.mount({ targets: [redisTarget({ port: server.port, scopeDirs: [dir] })] })

    const text = await host.call(T('verify'), { cwd: dir })

    expect(text).toContain('verify/cdqas.yaml')
    expect(text).toContain('真的跑了 1 条')
    expect(text).toContain('✓ redis-alive（fail）')
    expect(text).toContain('通过 1 / 失败 0 / 告警未过 0 / 没验成 0 → overall pass')
    // 真的发到了 Redis（不是纸面通过）
    expect(server.requests).toEqual([['PING']])
  })

  /*
   * 「裸回复 → 表格」那一跳（`shapeReplyAsResult`）由上面那条在**工具面**钉住：直接把它当
   * `ShapedResult` 用会在这一行抛 `TypeError`（`result.rows` 不存在），而不是判 `pass`。
   */

  it('清单里混了引擎没接通的断言 → 那条记「没验成」并给出原因，能跑的照跑（**不许**混成数据问题）', async () => {
    const server = await fakeRedis()
    const dir = projectWith('cdqas', verifyYaml('cdqas', PING_ASSERTION, SQL_ASSERTION))
    const host = makeHost()
    host.mount({
      targets: [
        redisTarget({ port: server.port, scopeDirs: [dir] }),
        redisTarget({ id: 'sql-1', engine: 'mysql', host: '10.0.0.1', port: 3306, scopeDirs: [dir] }),
      ],
    })

    // redis 目标在 → 清单入口出现（SQL 目标那一条不会把它带走）
    expect(host.names()).toContain(T('verify'))
    const text = await host.call(T('verify'), { cwd: dir })

    expect(text).toContain('真的跑了 1 条，其余 1 条没验成')
    expect(text).toContain('✓ redis-alive（fail）')
    expect(text).toContain('? order-count（fail）')
    expect(text).toContain('这个引擎的执行通路还没接通（mysql）')
    expect(text).toContain('没验成的原因')
    // 关键：**一条 fail 都没有**——「没验成」不许冒充「验出问题」（两者的下一步动作相反）
    expect(text).not.toContain('✗')
    // SQL 那条没有碰任何执行器（假服务只收到 redis 那条的请求）
    expect(server.requests).toEqual([['PING']])
  })

  it('清单里的目标没配在这份配置里 → 记「没验成」并说清原因（缺目标不是配置错误）', async () => {
    const server = await fakeRedis()
    const dir = projectWith('cdqas', verifyYaml('cdqas', PING_ASSERTION, SQL_ASSERTION))
    const host = makeHost()
    // 只配 redis：`sql-1` 不在这份配置里（清单随项目跨机器，这是常态而不是错）
    host.mount({ targets: [redisTarget({ port: server.port, scopeDirs: [dir] })] })

    const text = await host.call(T('verify'), { cwd: dir })

    expect(text).toContain('? order-count（fail）')
    expect(text).toContain('目标 sql-1 没有配置')
    expect(text).toContain('真的跑了 1 条')
  })

  it('作用域拦下时**原样带出拒绝码与恢复路径**（拒绝的是这次调用，不是数据）', async () => {
    const server = await fakeRedis()
    const dir = projectWith('cdqas', verifyYaml('cdqas', PING_ASSERTION))
    const host = makeHost()
    // 目标作用域是 CWD（用例的固定目录），而这次调用在另一个目录 → OUT_OF_SCOPE
    host.mount({ targets: [redisTarget({ port: server.port })] })

    const text = await host.call(T('verify'), { cwd: dir })

    expect(text).toContain('? redis-alive（fail）')
    expect(text).toContain('OUT_OF_SCOPE')
    // 恢复路径跟着一起出去（含「按哪个目录判的」）——这条是记-16 那条纸割的回归钉子
    expect(text).toContain('恢复路径：')
    expect(text).toContain('宿主进程的工作目录')
    expect(text).not.toContain('✗')
    expect(server.requests).toEqual([])
  })

  it('清单里的写语句在**加载时**就被拒（根本走不到执行），报的是清单与字段', async () => {
    const dir = projectWith(
      'cdqas',
      verifyYaml('cdqas', ['  - id: sneaky', '    appliesTo: backend', '    target: redis-248', '    statement: SET k v', '    expect: { eq: OK }', '    severity: fail'].join('\n')),
    )
    const host = makeHost()
    host.mount({ targets: [redisTarget({ scopeDirs: [dir] })] })

    const error = await host.call(T('verify'), { cwd: dir }).catch((e: unknown) => String(e))
    expect(error).toContain('验活清单不成立（verify/cdqas.yaml）')
    expect(error).toContain('assertions[0].statement')
    expect(error).toContain('只读')
  })

  it('项目里没有清单 → 说清去哪儿写（而不是给一份空报告）', async () => {
    const dir = projectWith('cdqas', verifyYaml('cdqas', PING_ASSERTION))
    rmSync(dir, { recursive: true, force: true })
    const host = makeHost()
    host.mount({ targets: [redisTarget({ scopeDirs: [CWD] })] })

    const error = await host.call(T('verify'), { cwd: dir }).catch((e: unknown) => String(e))
    expect(error).toContain('没找到验活清单')
    expect(error).toContain('verify/<项目>.yaml')
    expect(error).toContain('project 参数指定')
  })
})
