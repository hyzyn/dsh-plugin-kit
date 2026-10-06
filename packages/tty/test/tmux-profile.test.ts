/**
 * tmux socket / 运行时资产目录的 **profile 维度**（tty D60 的第二半 + 0.25.0 落地）。
 *
 * 缺陷原文（ROADMAP 待办第 1 条）：复制 profile 会把固定端口一并拷走，且 tmux socket
 * （`-L dsh-tty`）全 profile 共用。socket 共用的两个后果都实测过：
 *   1. `tty_list` 的持久会话清单**跨 profile 出现**；
 *   2. 「改 tmux 配置后 `kill-server` 生效」会**一并杀掉另一个 profile 的持久会话**。
 *
 * 这里钉四条判据（都是**行为**，不是「代码里有这个词」）：
 *   a. 有 profile → socket 名带它；无 profile → 退回历史名 `dsh-tty`（升级零迁移）；
 *   b. **两个不同 profile 永不落到同一个 socket**（含字符集外的名字 → 摘要区分）；
 *   c. `tmux -L` 的实参真的用了它（不是只在某个常量里算了一次）；
 *   d. 运行时目录（tmux.conf / inner.sh / shell 桩）按 profile 分层，且 shell 桩里的
 *      `capture-pane` 连的是**本 profile** 的 socket（否则 `tty_capture{last}` 恒空）。
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { dshProfileSegment, pluginRuntimeDir, tmuxSocketName } from '../src/shell-integration.js'
import { buildTmuxSpawnPlan, ensureTmuxAssets, killTmuxSession, listTmuxSessions, setTmuxExecForTest } from '../src/tmux.js'

const savedProfile = process.env.DSH_PROFILE
const savedHome = process.env.DSH_HOME
let home = ''

beforeEach(() => {
  // 隔离 DSH_HOME：断言的是「目录按 profile 分层」，不能写进开发机真实目录
  home = mkdtempSync(join(tmpdir(), 'dsh-tty-profile-'))
  process.env.DSH_HOME = home
})

afterEach(() => {
  setTmuxExecForTest()
  if (savedProfile === undefined) delete process.env.DSH_PROFILE
  else process.env.DSH_PROFILE = savedProfile
  if (savedHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = savedHome
  rmSync(home, { recursive: true, force: true })
})

/** 在指定 profile 下求值（读的是 `process.env`，所以每次都现设）。 */
function withProfile<T>(profile: string | undefined, run: () => T): T {
  if (profile === undefined) delete process.env.DSH_PROFILE
  else process.env.DSH_PROFILE = profile
  return run()
}

describe('tmux socket 的 profile 维度（D60）', () => {
  it('无 profile → 历史名 dsh-tty（单 profile 用户升级零迁移）', () => {
    expect(withProfile(undefined, () => tmuxSocketName())).toBe('dsh-tty')
    expect(withProfile('', () => tmuxSocketName())).toBe('dsh-tty')
  })

  it('有 profile → dsh-tty-<profile>', () => {
    expect(withProfile('web', () => tmuxSocketName())).toBe('dsh-tty-web')
    expect(withProfile('work', () => tmuxSocketName())).toBe('dsh-tty-work')
  })

  it('两个不同 profile 永不落到同一个 socket（含字符集外的名字）', () => {
    const names = ['web', 'work', 'a b', '../../etc', '中文配置', 'x'.repeat(60), 'a/b', 'a\\b']
    const sockets = names.map((name) => withProfile(name, () => tmuxSocketName()))
    expect(new Set(sockets).size).toBe(sockets.length)
    for (const socket of sockets) {
      // 必须仍是 tmux 能当名字用的形态：无空白、无路径分隔符
      expect(socket).toMatch(/^[A-Za-z0-9_-]+$/)
      expect(socket.startsWith('dsh-tty-')).toBe(true)
    }
  })

  it('profile 段是纯函数式的：同一个名每次求值一致（不做随机化）', () => {
    expect(withProfile('web', () => dshProfileSegment())).toBe('web')
    expect(withProfile('web', () => tmuxSocketName())).toBe(withProfile('web', () => tmuxSocketName()))
  })
})

describe('tmux 调用真的带上 profile socket（不是算完就算）', () => {
  it('buildTmuxSpawnPlan 的 -L 实参 = tmuxSocketName()', () => {
    const plan = withProfile('web', () => buildTmuxSpawnPlan({ shell: '/bin/zsh', term: 'xterm-256color', colorTerm: 'truecolor', tmuxName: 'dsh-abc' }))
    const line = plan.argv.join(' ')
    expect(line).toContain('-L dsh-tty-web')
    expect(line).not.toContain('-L dsh-tty ') // 不能落回历史名
    expect(line).toContain("new-session -A -s 'dsh-abc'") // 持久名单引号包裹（防注入）
  })

  it('listTmuxSessions / killTmuxSession 透传的 -L 也带 profile', async () => {
    const calls: string[][] = []
    setTmuxExecForTest(async (args) => {
      calls.push(args)
      return { stdout: '' }
    })
    await withProfile('web', () => listTmuxSessions())
    await withProfile('web', () => killTmuxSession('dsh-abc'))
    expect(calls[0].slice(0, 2)).toEqual(['-L', 'dsh-tty-web'])
    expect(calls[1].slice(0, 2)).toEqual(['-L', 'dsh-tty-web'])
  })
})

describe('运行时资产目录按 profile 分层（D60 的同一根因）', () => {
  it('无 profile → <DSH_HOME>/tty（历史路径）；有 profile → <DSH_HOME>/tty/<profile>', () => {
    const noProfile = withProfile(undefined, () => pluginRuntimeDir())
    expect(noProfile).toBe(join(home, 'tty'))
    const web = withProfile('web', () => pluginRuntimeDir())
    expect(web).toBe(join(home, 'tty', 'web'))
    const work = withProfile('work', () => pluginRuntimeDir())
    expect(work).toBe(join(home, 'tty', 'work'))
    expect(web).not.toBe(work)
  })

  it('ensureTmuxAssets 把 tmux.conf / inner.sh 写进**本 profile** 的目录', () => {
    withProfile('web', () => ensureTmuxAssets({ shell: '/bin/zsh', colorTerm: 'truecolor', shellIntegration: true, passthrough: true }))
    const conf = join(home, 'tty', 'web', 'tmux.conf')
    const inner = join(home, 'tty', 'web', 'inner.sh')
    expect(existsSync(conf)).toBe(true)
    expect(existsSync(inner)).toBe(true)
    // 另一个 profile 的目录不该被写上（否则就是「共用资产」的同一个 bug）
    expect(existsSync(join(home, 'tty', 'work'))).toBe(false)
  })

  it('生成的 tmux.conf 里给出的 kill-server 提示用的是**本 profile** 的 socket', () => {
    withProfile('web', () => ensureTmuxAssets({ shell: '/bin/zsh', colorTerm: 'truecolor', shellIntegration: true, passthrough: false }))
    const conf = readFileSync(join(home, 'tty', 'web', 'tmux.conf'), 'utf8')
    // 照抄一句给用户的操作提示：写错 socket 名等于教用户去杀别人 profile 的会话
    expect(conf).toContain('tmux -L dsh-tty-web kill-server')
  })
})

describe('shell 桩里的 capture-pane 连本 profile 的 socket', () => {
  it('zsh 桩：capture-pane 的 -L 与 tmuxSocketName() 一致', async () => {
    const { buildShellSpawn } = await import('../src/shell-integration.js')
    const plan = withProfile('web', () => buildShellSpawn('/bin/zsh', 'xterm-256color', 'truecolor', true))
    // zsh 走 ZDOTDIR 桩：从桩目录里读回写下的钩子
    const zshrc = join(home, 'tty', 'web', 'shell', 'zsh', '.zshrc')
    expect(existsSync(zshrc), `桩没写到 ${zshrc}`).toBe(true)
    // 桩内容是给 pane 里跑的：拿不到 socket 名就等于 tty_capture{last} 恒空
    const text = readFileSync(zshrc, 'utf8')
    if (text.includes('capture-pane')) {
      expect(text).toContain('tmux -L dsh-tty-web capture-pane')
      expect(text).not.toContain('tmux -L dsh-tty capture-pane')
    }
    expect(plan.argv.length).toBeGreaterThan(0)
  })

  it('bash 桩同样带本 profile 的 socket', async () => {
    const { buildShellSpawn } = await import('../src/shell-integration.js')
    withProfile('work', () => buildShellSpawn('/bin/bash', 'xterm-256color', 'truecolor', true))
    const rc = join(home, 'tty', 'work', 'shell', 'bash', 'bashrc')
    expect(existsSync(rc), `桩没写到 ${rc}`).toBe(true)
    const text = readFileSync(rc, 'utf8')
    if (text.includes('capture-pane')) {
      expect(text).toContain('tmux -L dsh-tty-work capture-pane')
    }
  })
})
