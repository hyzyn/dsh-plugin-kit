/**
 * @hyzyn/dsh-tty — 本地终端的启动计划：POSIX 与 **Windows** 两条分支。
 *
 * 为什么单独立一档：Windows 宿主的失败是「装得上、起得来、但一条终端都开不了」——
 *   1. `$SHELL` 在 Windows 上根本不存在，旧实现无条件回落 `/bin/zsh`，spawn 直接 ENOENT；
 *   2. 包装层是 POSIX 语法（`-c 'export TERM=…; exec "$shell"'`），cmd.exe 不认 `-c`
 *      （忽略整行、空跑一场就退出）、PowerShell 认 `-c` 但把 `export` 当不存在的 cmdlet 报错。
 * 两条都在 Windows 11 ARM 上实测复现过（见 README「Windows 宿主」一节）。
 *
 * 平台用**参数注入**（默认 process.platform），所以两个分支都能在 macOS/Linux 上断言，
 * 不必等 Windows runner —— 而 Windows runner 上跑同一份用例同样成立。
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  buildCommandSpawn,
  buildShellSpawn,
  defaultShellPath,
  isPowerShellShell,
} from '../src/shell-integration.js'

/*
 * 桩文件写在 $DSH_HOME/tty/shell/… 下。把它指到测试自己的临时目录，有两个好处：
 *   1. 不依赖机器上 ~/.dsh 里那份桩是否恰好最新——`writeIfChanged` 只在内容变了才写，
 *      若恰好一致就走 early-return，测试的成立条件会悄悄依赖外部状态；
 *   2. 受限文件沙箱（写不了工作区之外）下不再假红。
 */
let savedDshHome: string | undefined
let stubHome = ''
beforeAll(() => {
  savedDshHome = process.env.DSH_HOME
  stubHome = mkdtempSync(join(tmpdir(), 'dsh-tty-stub-'))
  process.env.DSH_HOME = stubHome
})
afterAll(() => {
  if (savedDshHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = savedDshHome
  rmSync(stubHome, { recursive: true, force: true })
})

describe('defaultShellPath', () => {
  it('POSIX 取 $SHELL，缺省 /bin/zsh', () => {
    expect(defaultShellPath('darwin', { SHELL: '/opt/homebrew/bin/zsh' })).toBe('/opt/homebrew/bin/zsh')
    expect(defaultShellPath('darwin', { SHELL: '  ' })).toBe('/bin/zsh')
    expect(defaultShellPath('linux', {})).toBe('/bin/zsh')
  })

  it('Windows 取 %COMSPEC%，不再回落 /bin/zsh（回归）', () => {
    expect(defaultShellPath('win32', { COMSPEC: 'C:\\WINDOWS\\system32\\cmd.exe' })).toBe('C:\\WINDOWS\\system32\\cmd.exe')
    expect(defaultShellPath('win32', { COMSPEC: '  ' })).toBe('cmd.exe')
    // 就算环境里塞了个 $SHELL（MSYS/Git Bash 会），Windows 也不该拿它当默认：
    // 面板默认要的是「系统保证存在」的那个解释器
    expect(defaultShellPath('win32', { SHELL: '/bin/zsh' })).not.toBe('/bin/zsh')
  })
})

describe('isPowerShellShell', () => {
  it('认得 Windows PowerShell 5.1 与 PowerShell 7（全路径 / 大小写都算）', () => {
    expect(isPowerShellShell('powershell.exe')).toBe(true)
    expect(isPowerShellShell('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe')).toBe(true)
    expect(isPowerShellShell('C:\\Program Files\\PowerShell\\7\\pwsh.exe')).toBe(true)
    expect(isPowerShellShell('PWSH')).toBe(true)
    expect(isPowerShellShell('cmd.exe')).toBe(false)
    expect(isPowerShellShell('/bin/zsh')).toBe(false)
  })
})

describe('buildShellSpawn：Windows 分支', () => {
  it('cmd 直接跑本体——没有 -c 包装层（cmd 会忽略 -c、空跑一场然后退出）', () => {
    const plan = buildShellSpawn('C:\\WINDOWS\\system32\\cmd.exe', 'xterm-256color', 'truecolor', true, 'win32')
    expect(plan.argv).toEqual(['C:\\WINDOWS\\system32\\cmd.exe'])
    expect(plan.env).toEqual({})
  })

  it('PowerShell 补 -NoLogo；不补 -NoProfile（用户的 profile 正是别名与函数的来源）', () => {
    const plan = buildShellSpawn('C:\\Program Files\\PowerShell\\7\\pwsh.exe', 'xterm-256color', 'truecolor', true, 'win32')
    expect(plan.argv).toEqual(['C:\\Program Files\\PowerShell\\7\\pwsh.exe', '-NoLogo'])
  })

  it('integration=true 在 Windows 上也不注入（那边没有 POSIX 的 rc 桩）', () => {
    const text = buildShellSpawn('powershell.exe', 'xterm-256color', 'truecolor', true, 'win32').argv.join(' ')
    expect(text).not.toMatch(/export|ZDOTDIR|rcfile|DSH_TTY_ORIG/)
  })
})

describe('buildCommandSpawn：Windows 分支', () => {
  it('cmd 走 /c，PowerShell 走 -Command', () => {
    expect(buildCommandSpawn('cmd.exe', 'xterm-256color', 'truecolor', 'docker ps', 'win32').argv)
      .toEqual(['cmd.exe', '/c', 'docker ps'])
    expect(buildCommandSpawn('pwsh.exe', 'xterm-256color', 'truecolor', 'docker ps', 'win32').argv)
      .toEqual(['pwsh.exe', '-NoLogo', '-Command', 'docker ps'])
  })

  it('Git Bash / WSL 用 -c / -e sh -c，不再一律 /c（0.19.0：/c 对它们静默失败）', () => {
    expect(buildCommandSpawn('C:\\Program Files\\Git\\bin\\bash.exe', 'xterm-256color', 'truecolor', 'docker ps', 'win32').argv)
      .toEqual(['C:\\Program Files\\Git\\bin\\bash.exe', '-c', 'docker ps'])
    expect(buildCommandSpawn('wsl.exe', 'xterm-256color', 'truecolor', 'docker ps', 'win32').argv)
      .toEqual(['wsl.exe', '-e', 'sh', '-c', 'docker ps'])
  })

  it('Windows 分支不带 POSIX 包装（回归：PowerShell 会报 export 不是 cmdlet）', () => {
    const text = buildCommandSpawn('powershell.exe', 'xterm-256color', 'truecolor', 'ls', 'win32').argv.join(' ')
    expect(text).not.toContain('export')
    expect(text).not.toContain('exec ')
  })
})

describe('POSIX 分支回归（改动不能碰现有的 zsh/bash 路径）', () => {
  it('integration=false 时是最简包装层', () => {
    expect(buildShellSpawn('/bin/zsh', 'xterm-256color', 'truecolor', false, 'linux').argv).toEqual([
      '/bin/zsh',
      '-c',
      "export TERM='xterm-256color'; export COLORTERM='truecolor'; exec \"/bin/zsh\"",
    ])
  })

  it('zsh + integration 仍走 ZDOTDIR 桩', () => {
    const plan = buildShellSpawn('/bin/zsh', 'xterm-256color', 'truecolor', true, 'darwin')
    expect(plan.argv[0]).toBe('/bin/zsh')
    expect(plan.argv[1]).toBe('-c')
    expect(plan.argv[2]).toContain('DSH_TTY_ORIG_ZDOTDIR')
    expect(plan.argv[2]).toContain('ZDOTDIR=')
    expect(plan.argv[2]).toContain('exec "/bin/zsh"')
  })

  it('zsh 桩链全四个 rc（含 .zlogout——ZDOTDIR 指过去后用户的退出钩子不该被吞）', () => {
    const plan = buildShellSpawn('/bin/zsh', 'xterm-256color', 'truecolor', true, 'darwin')
    const stubDir = String(plan.argv[2]).match(/ZDOTDIR='([^']+)'/)?.[1]
    expect(stubDir).toBeDefined()
    for (const name of ['.zshenv', '.zprofile', '.zlogin', '.zlogout']) {
      const content = readFileSync(join(stubDir as string, name), 'utf8')
      expect(content).toContain('DSH_TTY_ORIG_ZDOTDIR')
    }
  })

  it('钩子必须前置挂载（0.19.0：后置追加会让前序钩子的返回码污染 $?）', () => {
    const plan = buildShellSpawn('/bin/bash', 'xterm-256color', 'truecolor', true, 'linux')
    const stubRc = String(plan.argv[2]).match(/--rcfile '([^']+)'/)?.[1]
    expect(stubRc).toBeDefined()
    const rc = readFileSync(stubRc as string, 'utf8')
    // bash 数组形态：插到数组头部而不是 +=
    expect(rc).toContain('PROMPT_COMMAND=("__dsh_tty_precmd" "${PROMPT_COMMAND[@]}")')
    expect(rc).not.toContain('PROMPT_COMMAND+=')
    // zsh：precmd/preexec 同样前置
    const zshPlan = buildShellSpawn('/bin/zsh', 'xterm-256color', 'truecolor', true, 'linux')
    const zshDir = String(zshPlan.argv[2]).match(/ZDOTDIR='([^']+)'/)?.[1]
    const zshrc = readFileSync(join(zshDir as string, '.zshrc'), 'utf8')
    expect(zshrc).toContain('precmd_functions=(__dsh_tty_precmd "${precmd_functions[@]}")')
    expect(zshrc).not.toContain('precmd_functions+=')
  })

  it('带命令的本地 spawn 仍是 -c + export 包装（docker exec 这类标签依赖它）', () => {
    const plan = buildCommandSpawn('/bin/zsh', 'xterm-256color', 'truecolor', 'docker exec -it web sh', 'darwin')
    expect(plan.argv).toEqual([
      '/bin/zsh',
      '-c',
      "export TERM='xterm-256color'; export COLORTERM='truecolor'; exec docker exec -it web sh",
    ])
  })

  it('bash 的 D 标记必须无条件发（0.19.0 修 D46：PS0 的展开在子 shell 里，设不了 IN_CMD）', () => {
    const plan = buildShellSpawn('/bin/bash', 'xterm-256color', 'truecolor', true, 'linux')
    const stubRc = String(plan.argv[2]).match(/--rcfile '([^']+)'/)?.[1]
    expect(stubRc).toBeDefined()
    const rc = readFileSync(stubRc as string, 'utf8')
    // 无条件发 D：不能再被 __DSH_TTY_IN_CMD 的 if 包住（否则 bash ≥4.4 上 D 永远不发，
    // capture{last} 恒 inProgress、tty_expect 永远超时——CI 首跑 ubuntu 暴露）
    expect(rc).toContain('printf "$__DSH_TTY_FMT_D" "$ec"; __DSH_TTY_IN_CMD=0')
    expect(rc).not.toContain('if [ "$__DSH_TTY_IN_CMD" = "1" ]; then')
    // <4.4 的 DEBUG trap 仍要设这个 flag（3.2 上它是 B 的唯一来源）
    expect(rc).toContain('__DSH_TTY_IN_CMD=1')
  })
})
