/**
 * @hyzyn/dsh-tty — shell 集成注入（OSC 133 命令边界标记 + OSC 7 cwd 上报）。
 *
 * 动机：tty_capture 只能读原始尾部，agent 拿不到「上一条命令」的边界与退出码；
 * tty_list 的 cwd 是 spawn 时的快照，用户 cd 之后失真。借 shell 钩子在输出流里
 * 打标记即可两全，不需要动 DSH 的 spawnTerminal 协议。
 *
 * 注入方式（对用户透明，不要求改 rc）：
 *   - zsh：把桩文件写到**稳定目录**（<DSH_HOME|~/.dsh>/tty/shell/zsh/ 下的
 *     .zshenv/.zprofile/.zshrc/.zlogin，各自先 source 用户 ZDOTDIR/HOME 下的
 *     原文件，.zshrc 追加钩子），spawn 时经 `-c` 包装层 `export ZDOTDIR=<桩目录>`
 *     生效 —— VS Code 同款成熟方案；
 *   - bash：写桩 rc（先 source ~/.bashrc 再挂钩子），`exec bash --rcfile <桩>`；
 *     B 标记按版本二选一：bash ≥ 4.4 走 PS0；bash < 4.4（macOS 自带 3.2）无
 *     PS0，用**自卸式 DEBUG trap** 兜底——首次触发即发 B 并卸载（避免复合命令
 *     内部逐条触发），再由 PROMPT_COMMAND 尾段在每轮 prompt 前重新武装；
 *     PROMPT_COMMAND 挂钩兼容字符串与数组（bash 5.1+）两种形态；
 *   - 其他 shell：返回 null，集成静默关闭（tty_capture{last} 会明确报错）。
 *
 * 稳定目录（0.10.0）：桩文件必须在跨进程、跨宿主重启的路径上 —— tmux 持久
 * 会话的内层 pane 由 tmux server（比宿主进程活得久）按 inner.sh 启动，若桩
 * 在每次进程的临时目录里，宿主重启后新开 pane 的钩子会指向已失效路径。内容
 * 静态（不含配置），write-if-changed 原子覆盖。
 *
 * tmux passthrough（0.10.0）：持久标签的 pane 跑在 tmux 里，tmux 会吞掉不认
 * 识的转义序列 —— 钩子检测 $TMUX，把 OSC 133/7 包进 DCS tmux; 信封
 * （`\ePtmux;\e\e]133;…\a\e\\`，payload 内 ESC 需双写），tmux ≥3.3 且
 * allow-passthrough on 时解包后原样转发到外层终端；宿主侧解析器看到的仍是
 * 裸标记，零改动。低版本 tmux（<3.3）会吞掉信封：持久化本身可用，
 * capture{last} / expect 的命令粒度降级（README 已知限制）。
 *
 * 标记语义（iTerm2/kitty/VS Code 同一约定）：
 *   OSC 133;A —— prompt 开始；OSC 133;B —— 命令开始（preexec/PS0）；
 *   OSC 133;D;<exit> —— 命令结束带退出码；OSC 7;file://<host><path> —— cwd 上报。
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, basename } from 'node:path';
/** 插件运行时资产根目录（稳定路径；DSH_HOME 优先，与 env 插件同语义）。 */
export function pluginRuntimeDir() {
    const dshHome = process.env.DSH_HOME?.trim() || join(homedir(), '.dsh');
    return join(dshHome, 'tty');
}
/** 原子 write-if-changed：内容相同跳过；不同则写同目录临时文件后 rename（避免半截文件）。 */
function writeIfChanged(file, content) {
    try {
        if (readFileSync(file, 'utf8') === content)
            return;
    }
    catch {
        /* 不存在：继续写入 */
    }
    mkdirSync(dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, content);
    renameSync(tmp, file);
}
function dirname(path) {
    const index = path.lastIndexOf('/');
    return index > 0 ? path.slice(0, index) : '/';
}
/** 桩文件目录（稳定路径，zsh/bash 各一份；进程内缓存避免重复 stat）。 */
const stubDirs = new Map();
const ZSH_HOOKS = [
    '',
    '# >>> dsh-tty shell integration >>>',
    'if [ -z "$DSH_TTY_HOOKS_LOADED" ]; then',
    '  export DSH_TTY_HOOKS_LOADED=1',
    '  typeset -g __DSH_TTY_IN_CMD=0',
    '  # tmux 持久标签：标记包 DCS passthrough 信封（payload 内 ESC 双写），',
    '  # tmux ≥3.3 + allow-passthrough 解包后原样转发；低版本 tmux 吞信封 → 降级',
    '  if [ -n "$TMUX" ]; then',
    "    __DSH_TTY_FMT_A='\\ePtmux;\\e\\e]133;A\\a\\e\\\\'",
    "    __DSH_TTY_FMT_B='\\ePtmux;\\e\\e]133;B\\a\\e\\\\'",
    "    __DSH_TTY_FMT_D='\\ePtmux;\\e\\e]133;D;%s\\a\\e\\\\'",
    "    __DSH_TTY_FMT_CWD='\\ePtmux;\\e\\e]7;file://%s%s\\a\\e\\\\'",
    "    __DSH_TTY_FMT_T='\\ePtmux;\\e\\e]133;T;%s\\a\\e\\\\'",
    '  else',
    "    __DSH_TTY_FMT_A='\\e]133;A\\a'",
    "    __DSH_TTY_FMT_B='\\e]133;B\\a'",
    "    __DSH_TTY_FMT_D='\\e]133;D;%s\\a'",
    "    __DSH_TTY_FMT_CWD='\\e]7;file://%s%s\\a'",
    '  fi',
    '  # tmux 里 pane 内容的重画是异步批量的（passthrough 标记即时直写），命令',
    '  # 输出会落在 D 标记之后、逃出宿主的 B..D 捕获窗口。precmd 在发 D 前先',
    '  # capture-pane 快照 pane 内容，经 OSC 133;T（base64）随流直送宿主，',
    '  # 宿主优先用 T 快照作为 tty_capture{last} 的输出',
    '  __dsh_tty_capture() {',
    '    local __dsh_tty_precmd_cap',
    '    __dsh_tty_precmd_cap=$(tmux -L dsh-tty capture-pane -p -t "$TMUX_PANE" -S -200 2>/dev/null)',
    '    if [ -n "$__dsh_tty_precmd_cap" ]; then',
    '      printf "$__DSH_TTY_FMT_T" "$(printf \'%s\' "$__dsh_tty_precmd_cap" | base64 | tr -d \'\\n\')"',
    '    fi',
    '  }',
    '  __dsh_tty_precmd() {',
    '    local ec=$?',
    '    if (( __DSH_TTY_IN_CMD )); then',
    '      [ -n "$TMUX" ] && __dsh_tty_capture',
    '      printf "$__DSH_TTY_FMT_D" "$ec"; __DSH_TTY_IN_CMD=0; fi',
    '    printf "$__DSH_TTY_FMT_A"',
    '    printf "$__DSH_TTY_FMT_CWD" "${HOST}" "${PWD}"',
    '  }',
    '  __dsh_tty_preexec() {',
    '    __DSH_TTY_IN_CMD=1',
    '    printf "$__DSH_TTY_FMT_B"',
    '  }',
    '  precmd_functions+=(__dsh_tty_precmd)',
    '  preexec_functions+=(__dsh_tty_preexec)',
    'fi',
    '# <<< dsh-tty shell integration <<<',
    '',
];
const BASH_PRELUDE = [
    '',
    '# >>> dsh-tty shell integration >>>',
    'if [ -z "$DSH_TTY_HOOKS_LOADED" ]; then',
    '  export DSH_TTY_HOOKS_LOADED=1',
    '  __DSH_TTY_IN_CMD=0',
    '  # tmux 持久标签：标记包 DCS passthrough 信封（同 zsh 桩说明）',
    '  if [ -n "$TMUX" ]; then',
    "    __DSH_TTY_FMT_A='\\ePtmux;\\e\\e]133;A\\a\\e\\\\'",
    "    __DSH_TTY_FMT_B='\\ePtmux;\\e\\e]133;B\\a\\e\\\\'",
    "    __DSH_TTY_FMT_D='\\ePtmux;\\e\\e]133;D;%s\\a\\e\\\\'",
    "    __DSH_TTY_FMT_CWD='\\ePtmux;\\e\\e]7;file://%s%s\\a\\e\\\\'",
    "    __DSH_TTY_FMT_T='\\ePtmux;\\e\\e]133;T;%s\\a\\e\\\\'",
    '  else',
    "    __DSH_TTY_FMT_A='\\e]133;A\\a'",
    "    __DSH_TTY_FMT_B='\\e]133;B\\a'",
    "    __DSH_TTY_FMT_D='\\e]133;D;%s\\a'",
    "    __DSH_TTY_FMT_CWD='\\e]7;file://%s%s\\a'",
    '  fi',
    '  # tmux 重画异步：precmd 发 D 前 capture-pane 快照（OSC 133;T base64，同 zsh 桩说明）',
    '  __dsh_tty_capture() {',
    '    local __dsh_tty_precmd_cap',
    '    __dsh_tty_precmd_cap=$(tmux -L dsh-tty capture-pane -p -t "$TMUX_PANE" -S -200 2>/dev/null)',
    '    if [ -n "$__dsh_tty_precmd_cap" ]; then',
    '      printf "$__DSH_TTY_FMT_T" "$(printf \'%s\' "$__dsh_tty_precmd_cap" | base64 | tr -d \'\\n\')"',
    '    fi',
    '  }',
    '  __dsh_tty_precmd() {',
    '    local ec=$?',
    '    if [ "$__DSH_TTY_IN_CMD" = "1" ]; then',
    '      [ -n "$TMUX" ] && __dsh_tty_capture',
    '      printf "$__DSH_TTY_FMT_D" "$ec"; __DSH_TTY_IN_CMD=0; fi',
    '    printf "$__DSH_TTY_FMT_A"',
    '    printf "$__DSH_TTY_FMT_CWD" "${HOSTNAME}" "${PWD}"',
    '  }',
];
const BASH_POSTLUDE = [
    'fi',
    '# <<< dsh-tty shell integration <<<',
    '',
];
function ensureZshStubDir() {
    const cached = stubDirs.get('zsh');
    if (cached !== undefined)
        return cached;
    try {
        const dir = join(pluginRuntimeDir(), 'shell', 'zsh');
        // 桩只做「source 用户原文件 + 追加钩子」；DSH_TTY_ORIG_ZDOTDIR 在包装层里
        // 固化为用户原 ZDOTDIR（无则 $HOME），保证用户 rc 链路不变
        for (const name of ['.zshenv', '.zprofile', '.zlogin']) {
            writeIfChanged(join(dir, name), [
                '# dsh-tty shell integration stub (chain to user file)',
                '[ -f "$DSH_TTY_ORIG_ZDOTDIR/' + name + '" ] && source "$DSH_TTY_ORIG_ZDOTDIR/' + name + '"',
                '',
            ].join('\n'));
        }
        writeIfChanged(join(dir, '.zshrc'), [
            '# dsh-tty shell integration stub (chain to user file, then add hooks)',
            '[ -f "$DSH_TTY_ORIG_ZDOTDIR/.zshrc" ] && source "$DSH_TTY_ORIG_ZDOTDIR/.zshrc"',
            ...ZSH_HOOKS,
        ].join('\n'));
        stubDirs.set('zsh', dir);
        return dir;
    }
    catch {
        return undefined;
    }
}
function ensureBashStubRc() {
    const cached = stubDirs.get('bash');
    if (cached !== undefined)
        return cached;
    try {
        const dir = join(pluginRuntimeDir(), 'shell', 'bash');
        const rc = join(dir, 'bashrc');
        writeIfChanged(rc, [
            '# dsh-tty shell integration stub (chain to user file, then add hooks)',
            '[ -f "$HOME/.bashrc" ] && source "$HOME/.bashrc"',
            ...BASH_PRELUDE,
            '  # —— B 标记（命令开始）：按 bash 版本二选一 ——',
            '  __dsh_tty_major=${BASH_VERSION%%.*}',
            '  __dsh_tty_minor=${BASH_VERSION#*.}; __dsh_tty_minor=${__dsh_tty_minor%%.*}',
            '  if [ "$__dsh_tty_major" -gt 4 ] || { [ "$__dsh_tty_major" -eq 4 ] && [ "$__dsh_tty_minor" -ge 4 ]; }; then',
            '    # bash ≥ 4.4：PS0 在每个提示符后、命令输出前展开',
            '    case "${PS0:-}" in',
            "      *'133;B'*) ;;",
            '      *) PS0="$__DSH_TTY_FMT_B""$PS0" ;;',
            '    esac',
            '    # PROMPT_COMMAND 挂钩：兼容字符串与数组（bash 5.1+）两种形态',
            '    case "$(declare -p PROMPT_COMMAND 2>/dev/null)" in',
            '      "declare -a"*)',
            '        case "${PROMPT_COMMAND[*]}" in',
            '          *__dsh_tty_precmd*) ;;',
            '          *) PROMPT_COMMAND+=("__dsh_tty_precmd") ;;',
            '        esac ;;',
            '      *)',
            '        case "${PROMPT_COMMAND:-}" in',
            '          *__dsh_tty_precmd*) ;;',
            '          *) PROMPT_COMMAND="__dsh_tty_precmd${PROMPT_COMMAND:+;$PROMPT_COMMAND}" ;;',
            '        esac ;;',
            '    esac',
            '  else',
            '    # bash < 4.4（macOS 自带 3.2）：无 PS0，用 DEBUG trap 兜底。实测两个 3.2 怪癖：',
            '    #   1) handler 内 trap - DEBUG 卸载不生效（trap 保持武装）；',
            '    #   2) PROMPT_COMMAND 机制自身（precmd/rearm 段）也会触发 DEBUG fire。',
            '    # 因此按「永久武装 + handler 过滤」设计：$BASH_COMMAND 含桩内函数名的',
            '    # fire 直接忽略（否则幻影 B 会重启捕获区间，把用户输出切出 last 区域）；',
            '    # PROMPT_COMMAND 尾段每轮重新武装（bash 4.0~4.3 上 trap - DEBUG 生效时',
            '    # 走正常卸载/重装轮转）。副作用：循环体等内部命令会多发 B，仅影响',
            '    # capture{last} 的截取起点，D/退出码与 tty_expect 不受影响。',
            '    __dsh_tty_preexec() {',
            '      case "$BASH_COMMAND" in',
            '        ""|*__dsh_tty_precmd*|*__dsh_tty_rearm*) return ;;',
            '      esac',
            '      __DSH_TTY_IN_CMD=1',
            '      printf "$__DSH_TTY_FMT_B"',
            '      trap - DEBUG',
            '    }',
            '    __dsh_tty_rearm() { trap \'__dsh_tty_preexec\' DEBUG; }',
            '    # 不在 rc 加载时武装：bash 启动横幅（"default interactive shell" 等）',
            '    # 会触发一次无主 fire，产生幻影 B/D；首次 PROMPT_COMMAND 尾段武装即可',
            '    case "${PROMPT_COMMAND:-}" in',
            '      *__dsh_tty_precmd*) ;;',
            '      *) PROMPT_COMMAND="__dsh_tty_precmd${PROMPT_COMMAND:+;$PROMPT_COMMAND}; __dsh_tty_rearm" ;;',
            '    esac',
            '  fi',
            ...BASH_POSTLUDE,
        ].join('\n'));
        stubDirs.set('bash', rc);
        return rc;
    }
    catch {
        return undefined;
    }
}
/**
 * 组装 shell 启动计划：在原有 TERM/COLORTERM 包装层之上，按 shell basename
 * 注入集成（zsh → ZDOTDIR 桩；bash → --rcfile 桩）。integration=false 或不
 * 支持的 shell 返回最简包装层。
 */
export function buildShellSpawn(shell, term, colorTerm, integration) {
    const pre = `export TERM='${term}'; export COLORTERM='${colorTerm}';`;
    const exec = `exec "${shell}"`;
    if (integration) {
        const kind = basename(shell);
        if (kind === 'zsh') {
            const stubDir = ensureZshStubDir();
            if (stubDir !== undefined) {
                return {
                    argv: [shell, '-c', `${pre} export DSH_TTY_ORIG_ZDOTDIR="\${ZDOTDIR:-${homedir()}}"; export ZDOTDIR='${stubDir}'; ${exec}`],
                    env: {},
                };
            }
        }
        else if (kind === 'bash') {
            const stubRc = ensureBashStubRc();
            if (stubRc !== undefined) {
                return {
                    argv: [shell, '-c', `${pre} ${exec} --rcfile '${stubRc}'`],
                    env: {},
                };
            }
        }
    }
    return { argv: [shell, '-c', `${pre} ${exec}`], env: {} };
}
/* ------------------------------------------------------------------ *
 * tmux 持久会话的内层 pane 启动器（0.10.0）
 * ------------------------------------------------------------------ */
/** POSIX 单引号安全包裹（路径/值进 inner.sh 与 -c 包装层用）。 */
export function shSingleQuote(value) {
    return "'" + value.replace(/'/g, `'\\''`) + "'";
}
/**
 * 生成 tmux `default-command` 指向的内层启动器脚本：pane 里的 shell 由它
 * exec 出来（非登录式，与非持久标签语义一致），并按当前配置注入 shell 集成。
 * 脚本内容随配置重写（路径稳定、内容原子覆盖），tmux server 无需重启即可
 * 让新 pane 用上新配置。
 */
export function buildTmuxInnerLauncher(shell, colorTerm, integration) {
    const lines = [
        '#!/bin/sh',
        '# generated by dsh-tty（tmux 持久会话内层 shell 启动器）— 手改会被覆盖',
        `export COLORTERM=${shSingleQuote(colorTerm)}`,
    ];
    if (integration) {
        const kind = basename(shell);
        if (kind === 'zsh') {
            const stubDir = ensureZshStubDir();
            if (stubDir !== undefined) {
                lines.push(`export DSH_TTY_ORIG_ZDOTDIR="\${ZDOTDIR:-$HOME}"`, `export ZDOTDIR=${shSingleQuote(stubDir)}`, `exec ${shSingleQuote(shell)}`);
                return lines.join('\n') + '\n';
            }
        }
        else if (kind === 'bash') {
            const stubRc = ensureBashStubRc();
            if (stubRc !== undefined) {
                lines.push(`exec ${shSingleQuote(shell)} --rcfile ${shSingleQuote(stubRc)}`);
                return lines.join('\n') + '\n';
            }
        }
    }
    lines.push(`exec ${shSingleQuote(shell)}`);
    return lines.join('\n') + '\n';
}
//# sourceMappingURL=shell-integration.js.map