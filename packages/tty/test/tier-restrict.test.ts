/**
 * @hyzyn/dsh-tty — 档位裁剪（`tools.restrict`）的**接线**用例：走真的 `apply()` + 真的分类表，
 * 断言的是「宿主最终看见的那份工具表」，不是源码文本。
 *
 * 矩阵（与 `attachTierGate` 的逐调用闸同源，但这一层管的是**工具面**）：
 *
 * | 会话档位 | tty 工具表 | 为什么 |
 * | --- | --- | --- |
 * | 仅可查看 / 工作区内修改 | 10（只剩 read 类） | write / exec 这一档本来就调不动（闸会拒 / 问） |
 * | 完全权限 | 19（全在） | 工具本来就能用，藏起来等于替用户改档 |
 * | 档位服务未组合 | 19（全在） | 与闸同一口径：宿主没有档位概念时不许自作聪明 |
 * | agent 销毁 | 回到 19 | 限制是**跟随 scope 生命周期**的一层，不是一个开关 |
 *
 * 另外钉住三条容易在重构里悄悄失效的性质：
 *
 *   - **条件注册集才是裁剪的输入**：只配了基础九件时，deny 名单里不许出现没注册的
 *     `sftp_*` / `tunnel_*`（宿主对未知名字**整体抛错**，整次裁剪会炸掉，见 restrict-probe.test.ts）；
 *   - **热应用配置后按新注册集重算**：新出现的 `sftp_*` 该裁的照样裁（`tools/change` 合并成一次）；
 *   - **热重注册不许把已有 agent 的裁剪撤掉**：`applySettings()` 每次都会先撤后挂全部工具，
 *     而 `agent/created` 不会为老 agent 再发一次。
 *
 * 夹具 `test/mount-plugin.ts` 的 agent / 档位 / 卸载三个面就是为这组用例加的。
 */
import './isolated-home.js'
import { describe, expect, it } from 'vitest'
import { mountPlugin, sshHostEntry, tunnelSpec } from './mount-plugin.js'
import { TTY_TIER_CLASS } from '../src/index.js'

/** 无条件注册的基础工具（与配置无关：本地终端永远可用）。 */
const BASE_TOOLS = ['tty_list', 'tty_open', 'tty_close', 'tty_run', 'tty_stats', 'tty_capture', 'tty_screen', 'tty_expect', 'tty_send']
/** 能力全集（连接簿 + 隧道都配齐；顺序 = 注册顺序 = 宿主 `schemas()` 的顺序）。 */
const CAPABILITY = [
  ...BASE_TOOLS,
  'tunnel_list', 'tunnel_start', 'tunnel_stop',
  'sftp_list', 'sftp_read', 'sftp_write', 'sftp_mkdir', 'sftp_rename', 'sftp_remove', 'sftp_tree',
]

/** 能力全集里该剩下的（read 类，顺序跟随注册顺序）。 */
const READ_VISIBLE = CAPABILITY.filter((name) => TTY_TIER_CLASS[name] === 'read')
/** 能力全集里该被裁掉的（write / exec 类）。 */
const MUTATING_NAMES = CAPABILITY.filter((name) => TTY_TIER_CLASS[name] !== 'read')

/** 能力全集挂载：连接簿与隧道都配齐（隧道 `enabled: false`，不负网）。 */
const FULL_CONFIG = { sshHosts: [sshHostEntry()], tunnels: [tunnelSpec()] }

const READ_ONLY = { mode: 'read-only', policy: 'never' } as const
const WORKSPACE_WRITE = { mode: 'workspace-write', policy: 'ask' } as const
const FULL_ACCESS = { mode: 'danger-full-access', policy: 'never' } as const

/** 让 `tools/change` 的合并重算（microtask）跑完——工具表是在下一次请求构建时才投影的。 */
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

describe('按档位裁 write / exec（能力全集 19 件）', () => {
  it('仅可查看：19 → 10（只剩 read 类，write / exec 一个不剩）', () => {
    const mounted = mountPlugin(FULL_CONFIG, { tier: READ_ONLY })
    const agent = mounted.createAgent()
    const names = mounted.schemas(agent)

    expect(names).toEqual(READ_VISIBLE)
    expect(names).toHaveLength(10)
    for (const name of MUTATING_NAMES) expect(names, `${name} 应被裁掉`).not.toContain(name)
  })

  it('工作区内修改：同样 19 → 10（这一档的 write / exec 要逐次询问，先别让模型看见）', () => {
    const mounted = mountPlugin(FULL_CONFIG, { tier: WORKSPACE_WRITE })
    const agent = mounted.createAgent()

    expect(mounted.schemas(agent)).toEqual(READ_VISIBLE)
    for (const name of ['tty_open', 'tty_run', 'tty_send', 'tunnel_start', 'sftp_write', 'sftp_mkdir', 'sftp_rename', 'sftp_remove', 'tunnel_stop']) {
      expect(mounted.schemas(agent), `${name} 应被裁掉`).not.toContain(name)
    }
  })

  it('完全权限：19 件全在（不裁）', () => {
    const mounted = mountPlugin(FULL_CONFIG, { tier: FULL_ACCESS })
    const agent = mounted.createAgent()

    expect(mounted.schemas(agent)).toEqual(CAPABILITY)
    expect(mounted.schemas(agent)).toHaveLength(19)
  })

  it('auto review 档：19 件全在（宿主预审接管，工具是能用的）', () => {
    const mounted = mountPlugin(FULL_CONFIG, { tier: { ...FULL_ACCESS, auto: true } })
    const agent = mounted.createAgent()

    expect(mounted.schemas(agent)).toEqual(CAPABILITY)
  })

  it('档位服务未组合（宿主没有档位概念）：19 件全在，且不报错', () => {
    const mounted = mountPlugin(FULL_CONFIG)
    const agent = mounted.createAgent()

    expect(mounted.schemas(agent)).toEqual(CAPABILITY)
    expect(mounted.logs.some((line) => line.includes('sandboxPolicy 未组合'))).toBe(true)
  })
})

describe('作用域边界：裁的是 agent 的视图，不是全局注册集', () => {
  it('全局注册集仍是 19（面板 / 其它会话不受影响）', () => {
    const mounted = mountPlugin(FULL_CONFIG, { tier: READ_ONLY })
    const agent = mounted.createAgent()

    expect(mounted.schemas(agent)).toHaveLength(10)
    expect(mounted.names()).toEqual(CAPABILITY) // 注册集原样
    expect(mounted.schemas()).toEqual(CAPABILITY) // 全局视图（`schemas()` 不传 agent）原样
  })

  it('同进程多个会话各裁各的，视图一致且都不影响全局', () => {
    const mounted = mountPlugin(FULL_CONFIG, { tier: READ_ONLY })
    const first = mounted.createAgent()
    const second = mounted.createAgent()

    expect(mounted.schemas(first)).toEqual(READ_VISIBLE)
    expect(mounted.schemas(second)).toEqual(READ_VISIBLE)
    expect(mounted.names()).toEqual(CAPABILITY)
  })
})

describe('条件注册集：deny 名单必须与 schemas() 求交', () => {
  it('只配基础九件时不炸，且只裁基础工具里的 write / exec', () => {
    const mounted = mountPlugin({}, { tier: READ_ONLY })
    const agent = mounted.createAgent()

    // 没有 sftp_* / tunnel_*：裁完只剩基础工具里的 read 类（顺序 = 注册顺序）
    expect(mounted.schemas(agent)).toEqual(BASE_TOOLS.filter((name) => TTY_TIER_CLASS[name] === 'read'))
    // 关键：没有因为点名 `sftp_write` / `tunnel_start` 而整体抛错
    expect(mounted.logs.some((line) => line.includes('下发工具限制失败'))).toBe(false)
  })

  it('热应用配置新增连接簿：新出现的 sftp_* 同样按档位裁（按新注册集重算）', async () => {
    const mounted = mountPlugin({}, { tier: READ_ONLY })
    const agent = mounted.createAgent()
    expect(mounted.schemas(agent)).not.toContain('sftp_read')

    mounted.applySettings({ sshHosts: [sshHostEntry()] })
    await settle()

    // 注册集扩到 16（基础九件 + 七个 sftp），裁剪跟着重算：读的留下、写的裁掉
    expect(mounted.names()).toHaveLength(16)
    expect(mounted.schemas(agent)).toContain('sftp_read')
    expect(mounted.schemas(agent)).not.toContain('sftp_write')
    expect(mounted.schemas(agent)).not.toContain('sftp_mkdir')
  })

  it('关掉插件（enabled:false）→ 限制撤干净；重新打开 → 按新注册集再裁回来', async () => {
    const mounted = mountPlugin(FULL_CONFIG, { tier: READ_ONLY })
    const agent = mounted.createAgent()
    expect(mounted.host.restrictionCount(agent)).toBe(1)

    mounted.applySettings({ enabled: false })
    await settle()
    expect(mounted.names()).toEqual([]) // 工具全撤了
    expect(mounted.host.restrictionCount(agent)).toBe(0) // 限制也撤了（否则重新打开时会带着旧名单）

    mounted.applySettings({ enabled: true })
    await settle()
    expect(mounted.names()).toEqual(CAPABILITY)
    expect(mounted.schemas(agent)).toEqual(READ_VISIBLE)
  })
})

describe('撤销：限制跟随 scope 生命周期', () => {
  it('agent 销毁 → 该 agent 的视图回到 19（scope 回收，disposer 也照样能跑）', () => {
    const mounted = mountPlugin(FULL_CONFIG, { tier: READ_ONLY })
    const agent = mounted.createAgent()
    expect(mounted.schemas(agent)).toHaveLength(10)

    mounted.disposeAgent(agent)
    expect(mounted.schemas(agent)).toEqual(CAPABILITY)
    expect(mounted.host.restrictionCount(agent)).toBe(0)
  })

  it('插件卸载 → 限制层被撤掉（跑的是 effect 收回的 cleaner）', () => {
    const mounted = mountPlugin(FULL_CONFIG, { tier: READ_ONLY })
    const agent = mounted.createAgent()
    expect(mounted.host.restrictionCount(agent)).toBe(1)

    mounted.unmount()
    // 卸载时工具本身也一起撤了（registerAll 的 disposer），所以断言的是**限制层**没有残留：
    // 残留的限制会让「禁用后再启用」的会话带着上一次的名单位。
    expect(mounted.names()).toEqual([])
    expect(mounted.host.restrictionCount(agent)).toBe(0)
  })

  it('热重注册不撤已有 agent 的裁剪（先撤后挂全部工具，限制层留在 scope 上）', async () => {
    const mounted = mountPlugin(FULL_CONFIG, { tier: READ_ONLY })
    const agent = mounted.createAgent()
    expect(mounted.schemas(agent)).toHaveLength(10)

    // 宿主顺序：落盘 → volatile-update → applyPatch → refreshToolsHook（= registerAll 先撤后挂）
    mounted.applySettings({ pollIntervalSec: 3 })
    await settle()

    expect(mounted.names()).toEqual(CAPABILITY)
    expect(mounted.schemas(agent)).toEqual(READ_VISIBLE)
  })
})
