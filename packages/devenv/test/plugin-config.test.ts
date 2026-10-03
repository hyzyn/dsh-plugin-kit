/**
 * 配置面的回归（`src/plugin-config.ts`）。
 *
 * ## 为什么这一层值得单独一组用例
 *
 * schema 只管「形状对不对」，**语义上算不算数**全在这里：认不出的目标要**丢掉**（不是回落某个默认
 * 值）、`ssh` 缺 `book` 要**报出来**（否则症状是运行期一句指不到配置的话）、空的 `scopeDirs` 要报
 * 「处处拒绝」（不替用户填默认目录 = 不替他授权）、越界的数值要**夹回**（坏了要更严）。
 *
 * 这些判断全是纯函数，所以能逐条钉；而它们错了的代价都在真机上（配了没反应、连错目标）。
 *
 * ## 一条从中诞生的真事
 *
 * `hostKeys` 那组是 **2026-10-02 写 demo 时**发现假问题后补的：没写这一项也会报「不是数组」——
 * 把「没写」当成了「写错」。真宿主上被 schema 的 `.default([])` 挡住看不见，但这是 `devdata`
 * 那一轮真机踩过的同一类错，所以修的时候顺手把三种形态都钉住。
 */
import { describe, expect, it } from 'vitest'

import {
  DEFAULT_EXEC_TIMEOUT_MS,
  DEFAULT_POLL_INTERVAL_MS,
  DEFAULT_WAIT_TIMEOUT_MS,
  MAX_LOG_TAIL,
  MIN_POLL_INTERVAL_MS,
  normalizeConfig,
  pickTarget,
  targetIds,
} from '../src/plugin-config.js'

/** 一个合法的 ssh 目标。 */
function sshTarget(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { id: 'nas', label: 'NAS', kind: 'ssh', book: 'TEST', scopeDirs: ['/w'], ...overrides }
}

describe('目标：认不出来就丢掉，而且要说清为什么', () => {
  it('合法目标原样收下（label 缺省用 id）', () => {
    const config = normalizeConfig({ targets: [sshTarget({ label: '' })] })
    expect(config.problems).toEqual([])
    expect(config.targets).toEqual([{ id: 'nas', label: 'nas', kind: 'ssh', book: 'TEST', scopeDirs: ['/w'] }])
  })

  it('缺 id → 丢掉并报（工具是按 id 选的）', () => {
    const config = normalizeConfig({ targets: [sshTarget({ id: '  ' })] })
    expect(config.targets).toEqual([])
    expect(config.problems.join('\n')).toContain('必须有 id')
  })

  it('id 重复 → 第二个丢掉并报（重名意味着「选中的是哪一个」说不清）', () => {
    const config = normalizeConfig({ targets: [sshTarget(), sshTarget({ book: '别的' })] })
    expect(config.targets).toHaveLength(1)
    expect(config.problems.join('\n')).toContain('重复')
  })

  it('kind 不是 local / ssh → 丢掉并报（**不是**「当成 ssh」）', () => {
    const config = normalizeConfig({ targets: [sshTarget({ kind: 'ftp' })] })
    expect(config.targets).toEqual([])
    expect(config.problems.join('\n')).toContain('必须是 local 或 ssh')
  })

  it('ssh 缺 book → 丢掉并报（本插件不自建连接簿界面，一处配置两处生效）', () => {
    const config = normalizeConfig({ targets: [sshTarget({ book: '' })] })
    expect(config.targets).toEqual([])
    expect(config.problems.join('\n')).toContain('连接簿的条目名')
  })

  it('local 不需要 book', () => {
    const config = normalizeConfig({ targets: [{ id: 'here', kind: 'local', scopeDirs: ['/w'] }] })
    expect(config.problems).toEqual([])
    expect(config.targets[0]?.kind).toBe('local')
  })

  it('空的 scopeDirs → 报「处处拒绝」（不替用户填默认目录 = 不替他授权）', () => {
    const config = normalizeConfig({ targets: [sshTarget({ scopeDirs: [] })] })
    expect(config.targets).toHaveLength(1)
    expect(config.problems.join('\n')).toContain('处处拒绝')
  })

  it('scopeDirs 去空、去空白、去重', () => {
    const config = normalizeConfig({ targets: [sshTarget({ scopeDirs: ['/w', ' /w ', '', '  ', '/x'] })] })
    expect(config.targets[0]?.scopeDirs).toEqual(['/w', '/x'])
  })

  it('targets 不是数组 / 项不是对象 → 报出来，不崩', () => {
    expect(normalizeConfig({ targets: 'x' }).targets).toEqual([])
    expect(normalizeConfig({ targets: [null, 'x', 7] }).problems).toHaveLength(3)
  })
})

describe('数值：越界夹回、没写用缺省、非整数截断', () => {
  it('没写 → 缺省', () => {
    const config = normalizeConfig({})
    expect(config.execTimeoutMs).toBe(DEFAULT_EXEC_TIMEOUT_MS)
    expect(config.logTail).toBe(200)
    expect(config.pollIntervalMs).toBe(DEFAULT_POLL_INTERVAL_MS)
    expect(config.waitTimeoutMs).toBe(DEFAULT_WAIT_TIMEOUT_MS)
  })

  it('越界夹回（坏了要更严，不是更松）', () => {
    const config = normalizeConfig({ execTimeoutMs: 10, logTail: MAX_LOG_TAIL + 999, pollIntervalMs: 1 })
    expect(config.execTimeoutMs).toBe(500)
    expect(config.logTail).toBe(MAX_LOG_TAIL)
    expect(config.pollIntervalMs).toBe(MIN_POLL_INTERVAL_MS)
  })

  it('非数字 / NaN 用缺省，非整数截断', () => {
    expect(normalizeConfig({ logTail: 'x' }).logTail).toBe(200)
    expect(normalizeConfig({ logTail: Number.NaN }).logTail).toBe(200)
    expect(normalizeConfig({ logTail: 12.7 }).logTail).toBe(12)
  })
})

describe('hostKeys：没写不是问题，写了却被全丢掉才是', () => {
  it('没这一项 → 静默（全新安装：指纹种子来自 tty 连接簿）', () => {
    expect(normalizeConfig({ targets: [] }).problems).toEqual([])
    expect(normalizeConfig({ targets: [] }).hostKeys).toEqual([])
  })

  it('是数组但一条都收不下 → 报（静默忽略比报出来糟）', () => {
    const config = normalizeConfig({ targets: [], hostKeys: [{ host: '', fingerprints: [] }] })
    expect(config.problems.join('\n')).toContain('一条都没收下')
  })

  it('不是数组 → 报「不是数组」', () => {
    expect(normalizeConfig({ targets: [], hostKeys: 'x' }).problems.join('\n')).toContain('不是数组')
  })

  it('合法的记录原样收下（host 小写化、端口缺省 22）', () => {
    const config = normalizeConfig({ targets: [], hostKeys: [{ host: 'Nas.Example', fingerprints: ['sha256:a'] }] })
    expect(config.problems).toEqual([])
    expect(config.hostKeys).toEqual([{ host: 'nas.example', port: 22, fingerprints: ['sha256:a'] }])
  })
})

describe('开关与辅助函数', () => {
  it('enabled / announceToAgent 缺省为真，显式 false 才关', () => {
    expect(normalizeConfig({}).enabled).toBe(true)
    expect(normalizeConfig({ enabled: false }).enabled).toBe(false)
    expect(normalizeConfig({ announceToAgent: false }).announceToAgent).toBe(false)
  })

  it('targetIds 在空名单时给一句可读的话；pickTarget 按 id 取', () => {
    expect(targetIds([])).toContain('一个都没配')
    const targets = normalizeConfig({ targets: [sshTarget()] }).targets
    expect(targetIds(targets)).toBe('nas')
    expect(pickTarget(targets, 'nas')?.id).toBe('nas')
    expect(pickTarget(targets, 'typo')).toBeUndefined()
  })
})
