/** shell 集成的 spawn 片段：argv（-c 包装层）与额外 env。 */
export interface ShellSpawnPlan {
    argv: string[];
    env: Record<string, string>;
}
/**
 * 当前 profile 的**路径 / socket 安全段**；未设 profile（不带 profile 启动）时返回空串。
 *
 * 为什么需要它（tty D60）：插件有两样东西按**机器**这一层落盘——tmux 专用 socket 与
 * 运行时资产目录（tmux.conf / inner.sh / shell 桩）。两者都必须**按 profile 各存一份**：
 * `shellIntegration` 等配置是 per-profile 的，共用一个 `inner.sh` 就是「A 的 pane 用
 * B 的启动器」；共用 socket 则让会话清单跨 profile 串味、`kill-server` 误杀别人。
 *
 * **只在调用时读 `process.env.DSH_PROFILE`**（不在模块加载时快照）：测试里要造两个
 * profile 各断言一次，模块级快照会让第二组永远读到第一组的值。名字含字符集外字符
 * （空格 / 斜杠 / 中文…）或超长时退化为「干净前缀 + 6 位摘要」，保证两个不同的
 * profile **永不**落到同一段。
 */
export declare function dshProfileSegment(): string;
/**
 * 专用 tmux socket 名，**按 profile 区分**（tty D60 的第二半）。
 *
 * 为什么必须是函数而不是常量：socket 是**机器级资源**，而写死的 `-L dsh-tty` 让同一台
 * 机器上所有 profile 的宿主共用一个 tmux server——两个后果都实测过：
 *   1. `tty_list` 的持久会话清单**跨 profile 出现**（另一个 profile 的 dev server 会话
 *      被当成自己的）；
 *   2. 「改完 tmux 配置要 `kill-server` 才生效」这一步会**一并杀掉另一个 profile 的
 *      持久会话**。
 *
 * 未设 `DSH_PROFILE`（不带 profile 启动的宿主）时退回历史名 `dsh-tty`：单 profile 的
 * 用户行为与从前**完全一致**，升级也不需要迁移（老会话仍能用老 socket 接回）。设了
 * profile 时是 `dsh-tty-<profile 段>`。
 *
 * 住在 shell-integration 而不是 tmux：**shell 桩里也要用它**（pane 内的
 * `tmux capture-pane` 必须连本 profile 的 server，否则 `tty_capture{last}` 永远拿不到
 * 快照），而 tmux.ts 反过来 import 本模块——放这边才不会形成循环依赖。
 */
export declare function tmuxSocketName(): string;
/**
 * 插件运行时资产根目录（稳定路径；DSH_HOME 优先，与 env 插件同语义）。
 *
 * **按 profile 分层**（tty D60）：有 profile 时是 `<DSH_HOME>/tty/<profile>/`，无 profile
 * 时仍是历史的 `<DSH_HOME>/tty/`——单 profile 用户路径一字不变（老会话的资产仍在原处，
 * 升级不需要一次性迁移）。内容静态（不含配置），write-if-changed 原子覆盖。
 */
export declare function pluginRuntimeDir(): string;
/**
 * 组装 shell 启动计划：在原有 TERM/COLORTERM 包装层之上，按 shell basename
 * 注入集成（zsh → ZDOTDIR 桩；bash → --rcfile 桩）。integration=false 或不
 * 支持的 shell 返回最简包装层。
 */
/**
 * 带自定义命令的本地 spawn 计划（0.14.0）：给「开一个标签直接跑某条命令」用
 * （如 dsh-docker 的 `docker exec -it <容器> sh`）。命令由**宿主侧插件**提供，
 * 信任级与插件本身相同；TERM / COLORTERM 仍走白名单值。
 * 命令必须单行（换行会破坏 -c 包装层），由调用方（src/index.ts 的帧解析）保证。
 */
export declare function buildCommandSpawn(shell: string, term: string, colorTerm: string, command: string, platform?: NodeJS.Platform): ShellSpawnPlan;
/**
 * 本地终端默认 shell。
 *
 * POSIX 取 `$SHELL`（macOS 上通常 /bin/zsh）；**Windows 上根本没有 `$SHELL`** —— 旧实现
 * 无条件回落 `/bin/zsh`，于是 Windows 宿主上每个本地标签都在 spawn 阶段 ENOENT（2026-09
 * 在 Windows 11 ARM 上实测：`spawn /bin/zsh -> ENOENT`，而 `%COMSPEC%` 可用），整个面板
 * 一条终端都开不起来。Windows 取 `%COMSPEC%`（系统保证存在），要 PowerShell 就在设置卡片
 * 里把「Shell 路径」填成 powershell.exe / pwsh.exe。
 */
export declare function defaultShellPath(platform?: NodeJS.Platform, env?: NodeJS.ProcessEnv): string;
/**
 * PowerShell 家族（Windows PowerShell 5.1 与 PowerShell 7）——启动参数与 cmd 不同。
 *
 * 这里**不用 `path.basename`**：它按当前平台的规则切，在 POSIX 上拿到
 * `C:\Program Files\PowerShell\7\pwsh.exe` 会整串返回（没有 `/`），判定就漏了。
 * 两个分隔符一起切，任何平台上都对。
 */
/**
 * 本地「跑一条命令」时，**命令由哪个 shell 执行、按什么语法**（D78 补，2026-09-27 复核报告）。
 *
 * 为什么需要它：`command` 是整段交给宿主 shell 的（POSIX 分支 `exec <shell> -c`，Windows 分支
 * `cmd /c` / `-Command` / `bash -c`），也就是**语法随宿主平台与「Shell 路径」设置变**。
 * 只写「按整段 shell 代码执行、`a; b` 都可以」会误导模型：在 Windows 的 cmd 上，`;`、`for …; do`、
 * `$?`、`$$`、单引号全都不是 cmd 语法——报告方就是在 Windows 上按 POSIX 语法复测，9 条全红。
 *
 * 文案要短（进 systemPrompt 每轮都出现），但必须点明「哪些不是这个 shell 的语法」。
 */
export declare function commandShellHint(shell: string, platform?: NodeJS.Platform): string;
export declare function isPowerShellShell(shell: string): boolean;
export declare function buildShellSpawn(shell: string, term: string, colorTerm: string, integration: boolean, platform?: NodeJS.Platform): ShellSpawnPlan;
/** POSIX 单引号安全包裹（路径/值进 inner.sh 与 -c 包装层用）。 */
export declare function shSingleQuote(value: string): string;
/**
 * 生成 tmux `default-command` 指向的内层启动器脚本：pane 里的 shell 由它
 * exec 出来（非登录式，与非持久标签语义一致），并按当前配置注入 shell 集成。
 * 脚本内容随配置重写（路径稳定、内容原子覆盖），tmux server 无需重启即可
 * 让新 pane 用上新配置。
 */
export declare function buildTmuxInnerLauncher(shell: string, colorTerm: string, integration: boolean): string;
