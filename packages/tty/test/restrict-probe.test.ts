/**
 * T1 探针：`tools.restrict` 的三条机制事实 —— **先在这个夹具上证明，再谈接线**。
 *
 * 接线（`src/tier-restrict.ts` → `agent/created`）依赖三件事全成立，缺一条整个方案的形状就得改：
 *
 *   1. **只有从 agent 作用域调用才生效**：插件 ctx（无 scope）上调必须抛——正因如此，
 *      `ctx.get('tools')` 那一份实例不能拿来 restrict；
 *   2. **只影响这个 agent**：同一份全局注册集上，另一个 scope 的视图必须原样（否则一次
 *      restrict 会把所有会话的工具一起裁掉）；
 *   3. **未知名字整体抛**：所以 deny 名单**必须与 `schemas()` 求交**，不能把分类表全量传进去。
 *
 * 夹具是 `test/fake-tools.ts`（宿主 `ToolRuntime` 的最小忠实实现，每条语义标了宿主源码行号）。
 * 真机契约由真机验收跑兜底——这里的价值是：宿主换版本时，**偏差会先在用例上变红**，
 * 而不是等到真机上「工具没被裁，但没人发现」。
 *
 * 第三条在真机上最容易翻车：tty 的注册集是**条件式**的（没配连接簿 / 隧道就没有对应的
 * `sftp_*` / `tunnel_*`），而分类表是**能力全集**。所以下面既钉「全量传进去会抛」，
 * 也钉「求交之后的名单永远只含真实注册名」。
 */
import { describe, expect, it } from 'vitest'
import { createFakeToolsHost } from './fake-tools.js'
import { shouldRestrictForTier, tierRestrictedNames } from '@hyzyn/dsh-kit'

/** 一份**缩小版**的分类表：只关心机制，不依赖插件里的真表（真表的对账在 test/tier-gate.test.ts）。 */
const CLASS: Record<string, 'read' | 'write' | 'exec'> = {
  tty_list: 'read',
  tty_capture: 'read',
  sftp_read: 'read',
  tty_run: 'exec',
  tty_send: 'exec',
  sftp_write: 'write',
  tunnel_start: 'exec',
  tunnel_stop: 'write',
}

const classify = (tool: string): 'read' | 'write' | 'exec' | undefined => CLASS[tool]

/** 造一个「只注册了这些工具」的宿主视图（条件注册的仿真：分类表比注册集大）。 */
function hostWith(names: readonly string[]) {
  const host = createFakeToolsHost()
  for (const name of names) host.global.register({ name })
  return host
}

describe('机制 1：从 agent 作用域调用才生效', () => {
  it('插件 ctx（无 scope）上调 restrict 直接抛：上下文全局的限制会遮掉所有 agent', () => {
    const host = hostWith(['tty_list', 'tty_run'])
    expect(() => host.global.restrict({ deny: ['tty_run'] })).toThrow(/requires a scoped context/)
  })

  it('从该 agent 的 scoped ctx 调：它的 schemas 里没有 tty_run，其余工具一个不少', () => {
    const host = hostWith(['tty_list', 'tty_capture', 'tty_run'])
    const agent = {}
    host.handleFor(agent).restrict({ deny: ['tty_run'] })

    expect(host.namesFor(agent)).toEqual(['tty_list', 'tty_capture'])
    // 全局视图（`schemas()` 不传 scope）不受任何 scope 的限制影响——所以 deny 名单要从这里算，
    // 口径才稳定（拿 agent 视图算，第二次就永远算不出第一次的名单）。
    expect(host.namesFor()).toEqual(['tty_list', 'tty_capture', 'tty_run'])
  })

  it('返回的 disposer 撤销即恢复', () => {
    const host = hostWith(['tty_list', 'tty_run'])
    const agent = {}
    const undo = host.handleFor(agent).restrict({ deny: ['tty_run'] })
    expect(host.namesFor(agent)).toEqual(['tty_list'])
    undo()
    expect(host.namesFor(agent)).toEqual(['tty_list', 'tty_run'])
    // 重复撤销不炸（宿主 disposer 幂等）
    expect(() => undo()).not.toThrow()
  })

  it('空过滤不是 no-op：`restrict({})` 抛（物化成空的配置几乎总是 bug）', () => {
    const host = hostWith(['tty_list'])
    expect(() => host.handleFor({}).restrict({})).toThrow(/no-op/)
  })
})

describe('机制 2：只影响这个 agent', () => {
  it('同一份全局注册集上，另一个 scope 的视图原样', () => {
    const host = hostWith(['tty_list', 'tty_run', 'sftp_write'])
    const restricted = {}
    const untouched = {}
    host.handleFor(restricted).restrict({ deny: ['tty_run', 'sftp_write'] })

    expect(host.namesFor(restricted)).toEqual(['tty_list'])
    expect(host.namesFor(untouched)).toEqual(['tty_list', 'tty_run', 'sftp_write'])
  })

  it('两个 agent 的限制互不叠加（各裁各的）', () => {
    const host = hostWith(['tty_list', 'tty_run', 'sftp_write'])
    const a = {}
    const b = {}
    host.handleFor(a).restrict({ deny: ['tty_run'] })
    host.handleFor(b).restrict({ deny: ['sftp_write'] })

    expect(host.namesFor(a)).toEqual(['tty_list', 'sftp_write'])
    expect(host.namesFor(b)).toEqual(['tty_list', 'tty_run'])
  })
})

describe('机制 3：未知名字整体抛 ⇒ deny 必须与 schemas() 求交', () => {
  it('点名一个没注册的工具 → 整体抛（不是忽略那一条）', () => {
    const host = hostWith(['tty_list', 'tty_run'])
    expect(() => host.handleFor({}).restrict({ deny: ['tty_not_a_tool'] })).toThrow(/unknown global tool/)
  })

  it('没有通配：`tty_*` 也是一个未知名字', () => {
    const host = hostWith(['tty_list', 'tty_run'])
    expect(() => host.handleFor({}).restrict({ deny: ['tty_*'] })).toThrow(/unknown global tool/)
  })

  it('保留的 run_code 不能点名（裁它等于裁掉整档的呈现载体）', () => {
    const host = hostWith(['tty_list', 'run_code'])
    expect(() => host.handleFor({}).restrict({ deny: ['run_code'] })).toThrow(/cannot name reserved/)
  })

  it('直接传分类表全量会抛：只配了基础工具的会话上，裁剪会整个炸掉', () => {
    const host = hostWith(['tty_list', 'tty_run']) // sftp_* / tunnel_* 本会话没注册
    expect(() => host.handleFor({}).restrict({ deny: Object.keys(CLASS) })).toThrow(/unknown global tool/)
  })

  it('与 schemas() 求交后的名单：只含真实注册名，能直接下发', () => {
    const host = hostWith(['tty_list', 'tty_run', 'sftp_write'])
    const deny = tierRestrictedNames(host.names(), classify, ['tty_', 'sftp_', 'tunnel_'])

    expect(deny).toEqual(['tty_run', 'sftp_write'])
    // 关键：交出来的每个名字都真的在全局注册集里（否则下面这句会抛）
    expect(() => host.handleFor({}).restrict({ deny })).not.toThrow()
    // 名单里没有分类表里那些「本会话没注册」的名字
    expect(deny).not.toContain('tunnel_start')
  })

  it('前缀外的同名工具不误伤（跨插件同名是唯一需要前缀的理由）', () => {
    const host = hostWith(['tty_list', 'tty_run', 'docker_run'])
    const deny = tierRestrictedNames(host.names(), (tool) => (tool === 'docker_run' ? 'exec' : classify(tool)), ['tty_', 'sftp_', 'tunnel_'])
    expect(deny).toEqual(['tty_run'])
  })
})

describe('裁剪判据：三条「不裁」与 decideTierCall 的 allow 硬分支一致', () => {
  const tier = (patch: Partial<{ mode: 'read-only' | 'workspace-write' | 'danger-full-access'; auto: boolean; sandbox: boolean }>) => ({
    mode: patch.mode ?? ('read-only' as const),
    policy: 'ask' as const,
    auto: patch.auto ?? false,
    services: { sandboxPolicy: patch.sandbox ?? true, approval: true },
  })

  it('服务未组合 → 不裁（没有档位概念，照做会把所有工具裁光）', () => {
    expect(shouldRestrictForTier(tier({ sandbox: false }))).toBe(false)
  })

  it('完全权限 → 不裁（工具本来就能用，藏起来等于替用户改档）', () => {
    expect(shouldRestrictForTier(tier({ mode: 'danger-full-access' }))).toBe(false)
  })

  it('auto review → 不裁（宿主预审接管，工具是能用的）', () => {
    expect(shouldRestrictForTier(tier({ auto: true }))).toBe(false)
  })

  it('只读 / 工作区内修改 → 裁', () => {
    expect(shouldRestrictForTier(tier({ mode: 'read-only' }))).toBe(true)
    expect(shouldRestrictForTier(tier({ mode: 'workspace-write' }))).toBe(true)
  })
})
