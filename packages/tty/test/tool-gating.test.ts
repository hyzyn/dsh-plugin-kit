/**
 * @hyzyn/dsh-tty — agent 工具**按配置能力条件注册**：隧道三件 / SFTP 七件只在「配了才有意义」时挂。
 *
 * ## 为什么做（这组用例钉的是什么）
 *
 * `registerAll()` 原先对全部工具**无条件**注册，于是两种工具常驻却只有报错一条路：
 *
 *   - 一条隧道都没配时，`tunnel_start` / `tunnel_stop` 必然失败——它们只改**既有**配置
 *     （`TunnelManager.setEnabled` 找不到名字就报错），不能凭空建隧道；
 *   - 连接簿为空时，七个 `sftp_*` 的 `sftpBookSpec` 必然抛「连接簿中不存在」（它每次都走
 *     `live.findSshHost`）。
 *
 * 现在两处按 `live.tunnels` / `live.sshHosts` 条件注册。热应用不需要额外接线：`applyPatch`
 * 每次都无条件调 `refreshToolsHook()`（= `registerAll`），所以配置一变就重算注册集——本文件
 * **两条路径都测**：启动配置（`mountPlugin(config)`）与热应用（`applySettings` 走
 * `loader/volatile-update` → `applyPatch` → `refreshToolsHook`）。
 *
 * ## 走的是真 `apply()`
 *
 * 夹具是 `test/mount-plugin.ts` 的最小假宿主（只装 tools / settings / prompt 几个面），
 * 不是把 `registerAll` 抠出来单跑——注册集的判据是**宿主看到的那份**名单，不是源码文本。
 * 它的边界（不碰网络、隧道一律 `enabled: false`）写在那个文件头。
 */
import './isolated-home.js'
import { describe, expect, it } from 'vitest'
import { mountPlugin, sshHostEntry, tunnelSpec } from './mount-plugin.js'

/** 无条件注册的基础工具（与配置无关：本地终端永远可用）。 */
const BASE_TOOLS = ['tty_list', 'tty_open', 'tty_close', 'tty_run', 'tty_stats', 'tty_capture', 'tty_screen', 'tty_expect', 'tty_send']
/** 有已配置隧道（`live.tunnels` 非空）才注册。 */
const TUNNEL_TOOLS = ['tunnel_list', 'tunnel_start', 'tunnel_stop']
/** 连接簿有条目（`live.sshHosts` 非空）才注册。 */
const SFTP_TOOLS = ['sftp_list', 'sftp_read', 'sftp_write', 'sftp_mkdir', 'sftp_rename', 'sftp_remove', 'sftp_tree']
/** 能力全集：三组都配齐时宿主应当看到的那份名单（顺序 = 注册顺序）。 */
const CAPABILITY = [...BASE_TOOLS, ...TUNNEL_TOOLS, ...SFTP_TOOLS]

/** 从启动日志里取**最后一次** active 行（每次重注册都会打一条）。 */
function lastActiveLine(logs: string[]): string[] {
  const lines = logs.filter((line) => line.includes('[dsh-tty] agent tools active ('))
  expect(lines.length, '没有 active 日志行（注册路径没走到？）').toBeGreaterThan(0)
  const match = lines[lines.length - 1].match(/agent tools active \(([^)]*)\)/)
  expect(match, 'active 日志行格式变了，取数口径跟着改').not.toBeNull()
  return match![1].split(',').map((name) => name.trim()).filter((name) => name !== '')
}

describe('启动配置决定注册集', () => {
  it('默认配置（连接簿与隧道都空）：只挂基础工具，sftp_* / tunnel_* 一个都不挂', () => {
    const mounted = mountPlugin()
    expect(mounted.names()).toEqual(BASE_TOOLS)
  })

  it('只配连接簿：七个 sftp 工具出现，隧道工具仍然不挂', () => {
    const mounted = mountPlugin({ sshHosts: [sshHostEntry()] })
    expect(mounted.names()).toEqual([...BASE_TOOLS, ...SFTP_TOOLS])
  })

  it('只配隧道：隧道三件出现，sftp 工具仍然不挂', () => {
    const mounted = mountPlugin({ tunnels: [tunnelSpec()] })
    expect(mounted.names()).toEqual([...BASE_TOOLS, ...TUNNEL_TOOLS])
  })

  it('两者都配：能力全集全在（不多不少）', () => {
    const mounted = mountPlugin({ sshHosts: [sshHostEntry()], tunnels: [tunnelSpec()] })
    expect(mounted.names()).toEqual(CAPABILITY)
  })

  it('热应用路径按清洗后的条目算（缺 name/host/username 的条目被 sanitize 丢掉 → 不注册）', () => {
    // 启动路径不同：`apply(ctx, config)` 收到的是宿主按 schema 校验过的配置，直接进 live
    // （本仓不在启动路径重复清洗）。所以两处判据只能是「数组长度 > 0」；这里钉热应用那条的真实行为。
    const mounted = mountPlugin()
    mounted.applySettings({ sshHosts: [{ name: 'half' }] })
    expect(mounted.names()).toEqual(BASE_TOOLS)
  })
})

describe('热应用：配置一变就重注册（applyPatch → refreshToolsHook）', () => {
  it('空配置 → 配连接簿 → 再配隧道 → 全清空，每一步都跟到位', () => {
    const mounted = mountPlugin()
    expect(mounted.names()).toEqual(BASE_TOOLS)

    mounted.applySettings({ sshHosts: [sshHostEntry()] })
    expect(mounted.names()).toEqual([...BASE_TOOLS, ...SFTP_TOOLS])

    mounted.applySettings({ tunnels: [tunnelSpec()] })
    expect(mounted.names()).toEqual(CAPABILITY)

    // 反向同样要跟：清空连接簿后 sftp 工具必须撤下（不是只增不减）
    mounted.applySettings({ sshHosts: [] })
    expect(mounted.names()).toEqual([...BASE_TOOLS, ...TUNNEL_TOOLS])

    mounted.applySettings({ tunnels: [] })
    expect(mounted.names()).toEqual(BASE_TOOLS)
  })

  it('重注册不留重复名字（disposer 先撤后挂）', () => {
    const mounted = mountPlugin({ sshHosts: [sshHostEntry()], tunnels: [tunnelSpec()] })
    mounted.applySettings({ sshHosts: [sshHostEntry()] })
    mounted.applySettings({ sshHosts: [sshHostEntry()] })
    expect(mounted.names()).toEqual(CAPABILITY)
    expect(new Set(mounted.names()).size).toBe(CAPABILITY.length)
  })
})

describe('启动日志：能力全集 ≠ 实际注册集（不许用日志撒谎）', () => {
  it('registered 行始终是能力全集（档位闸的分类对账从它取数）', () => {
    const mounted = mountPlugin()
    const line = mounted.logs.find((entry) => entry.includes('[dsh-tty] agent tools registered ('))
    expect(line, '能力全集日志行没打出来').toBeDefined()
    const listed = line!.match(/agent tools registered \(([^)]*)\)/)![1].split(',').map((name) => name.trim())
    expect(listed).toEqual(CAPABILITY)
  })

  it('active 行等于**这次真的注册了**的那份名单', () => {
    const bare = mountPlugin()
    expect(lastActiveLine(bare.logs)).toEqual(BASE_TOOLS)

    const full = mountPlugin({ sshHosts: [sshHostEntry()], tunnels: [tunnelSpec()] })
    expect(lastActiveLine(full.logs)).toEqual(CAPABILITY)
  })

  it('热应用后 active 行跟着变（不是启动时打一份就完事）', () => {
    const mounted = mountPlugin()
    mounted.applySettings({ sshHosts: [sshHostEntry()] })
    expect(lastActiveLine(mounted.logs)).toEqual([...BASE_TOOLS, ...SFTP_TOOLS])
  })
})
