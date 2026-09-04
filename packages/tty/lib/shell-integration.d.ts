/** shell 集成的 spawn 片段：argv（-c 包装层）与额外 env。 */
export interface ShellSpawnPlan {
    argv: string[];
    env: Record<string, string>;
}
/** 插件运行时资产根目录（稳定路径；DSH_HOME 优先，与 env 插件同语义）。 */
export declare function pluginRuntimeDir(): string;
/**
 * 组装 shell 启动计划：在原有 TERM/COLORTERM 包装层之上，按 shell basename
 * 注入集成（zsh → ZDOTDIR 桩；bash → --rcfile 桩）。integration=false 或不
 * 支持的 shell 返回最简包装层。
 */
export declare function buildShellSpawn(shell: string, term: string, colorTerm: string, integration: boolean): ShellSpawnPlan;
/** POSIX 单引号安全包裹（路径/值进 inner.sh 与 -c 包装层用）。 */
export declare function shSingleQuote(value: string): string;
/**
 * 生成 tmux `default-command` 指向的内层启动器脚本：pane 里的 shell 由它
 * exec 出来（非登录式，与非持久标签语义一致），并按当前配置注入 shell 集成。
 * 脚本内容随配置重写（路径稳定、内容原子覆盖），tmux server 无需重启即可
 * 让新 pane 用上新配置。
 */
export declare function buildTmuxInnerLauncher(shell: string, colorTerm: string, integration: boolean): string;
