/**
 * @hyzyn/dsh-tty — shell 集成注入（OSC 133 命令边界标记 + OSC 7 cwd 上报）。
 *
 * 动机：tty_capture 只能读原始尾部，agent 拿不到「上一条命令」的边界与退出码；
 * tty_list 的 cwd 是 spawn 时的快照，用户 cd 之后失真。借 shell 钩子在输出流里
 * 打标记即可两全，不需要动 DSH 的 spawnTerminal 协议。
 *
 * 注入方式（对用户透明，不要求改 rc）：
 *   - zsh：进程级懒创建临时目录写四个桩文件（.zshenv/.zprofile/.zshrc/.zlogin，
 *     各自先 source 用户 ZDOTDIR/HOME 下的原文件，.zshrc 追加钩子），spawn 时经
 *     `-c` 包装层 `export ZDOTDIR=<桩目录>` 生效 —— VS Code 同款成熟方案；
 *   - bash：写桩 rc（先 source ~/.bashrc 再挂钩子），`exec bash --rcfile <桩>`；
 *     命令开始标记走 PS0（bash ≥ 4.4，macOS 自带 bash 3.2 无 PS0 时优雅降级：
 *     只丢 B 标记，A/D/OSC 7 照常）；
 *   - 其他 shell：返回 null，集成静默关闭（tty_capture{last} 会明确报错）。
 *
 * 标记语义（iTerm2/kitty/VS Code 同一约定）：
 *   OSC 133;A —— prompt 开始；OSC 133;B —— 命令开始（preexec/PS0）；
 *   OSC 133;D;<exit> —— 命令结束带退出码；OSC 7;file://<host><path> —— cwd 上报。
 */
import { mkdtempSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join, basename } from 'node:path'

/** shell 集成的 spawn 片段：argv（-c 包装层）与额外 env。 */
export interface ShellSpawnPlan {
  argv: string[]
  env: Record<string, string>
}

/** 桩文件目录（进程级懒创建，zsh/bash 共用进程生命周期）。 */
const stubDirs = new Map<string, string>()

function ensureZshStubDir(): string | undefined {
  const cached = stubDirs.get('zsh')
  if (cached !== undefined) return cached
  try {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-tty-zsh-'))
    // 桩只做「source 用户原文件 + 追加钩子」；DSH_TTY_ORIG_ZDOTDIR 在包装层里
    // 固化为用户原 ZDOTDIR（无则 $HOME），保证用户 rc 链路不变
    for (const name of ['.zshenv', '.zprofile', '.zlogin'] as const) {
      writeFileSync(join(dir, name), [
        '# dsh-tty shell integration stub (chain to user file)',
        '[ -f "$DSH_TTY_ORIG_ZDOTDIR/' + name + '" ] && source "$DSH_TTY_ORIG_ZDOTDIR/' + name + '"',
        '',
      ].join('\n'))
    }
    writeFileSync(join(dir, '.zshrc'), [
      '# dsh-tty shell integration stub (chain to user file, then add hooks)',
      '[ -f "$DSH_TTY_ORIG_ZDOTDIR/.zshrc" ] && source "$DSH_TTY_ORIG_ZDOTDIR/.zshrc"',
      '',
      '# >>> dsh-tty shell integration >>>',
      'if [ -z "$DSH_TTY_HOOKS_LOADED" ]; then',
      '  export DSH_TTY_HOOKS_LOADED=1',
      '  typeset -g __DSH_TTY_IN_CMD=0',
      '  __dsh_tty_precmd() {',
      '    local ec=$?',
      '    if (( __DSH_TTY_IN_CMD )); then printf \'\\e]133;D;%s\\a\' "$ec"; __DSH_TTY_IN_CMD=0; fi',
      '    printf \'\\e]133;A\\a\'',
      '    printf \'\\e]7;file://%s%s\\a\' "${HOST}" "${PWD}"',
      '  }',
      '  __dsh_tty_preexec() {',
      '    __DSH_TTY_IN_CMD=1',
      '    printf \'\\e]133;B\\a\'',
      '  }',
      '  precmd_functions+=(__dsh_tty_precmd)',
      '  preexec_functions+=(__dsh_tty_preexec)',
      'fi',
      '# <<< dsh-tty shell integration <<<',
      '',
    ].join('\n'))
    stubDirs.set('zsh', dir)
    return dir
  } catch {
    return undefined
  }
}

function ensureBashStubRc(): string | undefined {
  const cached = stubDirs.get('bash')
  if (cached !== undefined) return cached
  try {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-tty-bash-'))
    const rc = join(dir, 'bashrc')
    writeFileSync(rc, [
      '# dsh-tty shell integration stub (chain to user file, then add hooks)',
      '[ -f "$HOME/.bashrc" ] && source "$HOME/.bashrc"',
      '',
      '# >>> dsh-tty shell integration >>>',
      'if [ -z "$DSH_TTY_HOOKS_LOADED" ]; then',
      '  export DSH_TTY_HOOKS_LOADED=1',
      '  __DSH_TTY_IN_CMD=0',
      '  __dsh_tty_precmd() {',
      '    local ec=$?',
      '    if [ "$__DSH_TTY_IN_CMD" = "1" ]; then printf \'\\e]133;D;%s\\a\' "$ec"; __DSH_TTY_IN_CMD=0; fi',
      '    printf \'\\e]133;A\\a\'',
      '    printf \'\\e]7;file://%s%s\\a\' "${HOSTNAME}" "${PWD}"',
      '  }',
      '  case "${PROMPT_COMMAND:-}" in',
      '    *__dsh_tty_precmd*) ;;',
      '    *) PROMPT_COMMAND="__dsh_tty_precmd${PROMPT_COMMAND:+;$PROMPT_COMMAND}" ;;',
      '  esac',
      '  # PS0 需要 bash ≥ 4.4；老 bash 无 PS0，仅丢 B 标记（A/D/OSC 7 照常）',
      '  case "${PS0:-}" in',
      '    *\'133;B\'*) ;;',
      '    *) PS0=\'\\e]133;B\\a\'"$PS0" ;;',
      '  esac',
      'fi',
      '# <<< dsh-tty shell integration <<<',
      '',
    ].join('\n'))
    stubDirs.set('bash', rc)
    return rc
  } catch {
    return undefined
  }
}

/**
 * 组装 shell 启动计划：在原有 TERM/COLORTERM 包装层之上，按 shell basename
 * 注入集成（zsh → ZDOTDIR 桩；bash → --rcfile 桩）。integration=false 或不
 * 支持的 shell 返回最简包装层。
 */
export function buildShellSpawn(shell: string, term: string, colorTerm: string, integration: boolean): ShellSpawnPlan {
  const pre = `export TERM='${term}'; export COLORTERM='${colorTerm}';`
  const exec = `exec "${shell}"`
  if (integration) {
    const kind = basename(shell)
    if (kind === 'zsh') {
      const stubDir = ensureZshStubDir()
      if (stubDir !== undefined) {
        return {
          argv: [shell, '-c', `${pre} export DSH_TTY_ORIG_ZDOTDIR="\${ZDOTDIR:-${homedir()}}"; export ZDOTDIR='${stubDir}'; ${exec}`],
          env: {},
        }
      }
    } else if (kind === 'bash') {
      const stubRc = ensureBashStubRc()
      if (stubRc !== undefined) {
        return {
          argv: [shell, '-c', `${pre} ${exec} --rcfile '${stubRc}'`],
          env: {},
        }
      }
    }
  }
  return { argv: [shell, '-c', `${pre} ${exec}`], env: {} }
}
