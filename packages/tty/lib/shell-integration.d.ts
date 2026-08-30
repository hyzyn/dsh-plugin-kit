/** shell 集成的 spawn 片段：argv（-c 包装层）与额外 env。 */
export interface ShellSpawnPlan {
    argv: string[];
    env: Record<string, string>;
}
/**
 * 组装 shell 启动计划：在原有 TERM/COLORTERM 包装层之上，按 shell basename
 * 注入集成（zsh → ZDOTDIR 桩；bash → --rcfile 桩）。integration=false 或不
 * 支持的 shell 返回最简包装层。
 */
export declare function buildShellSpawn(shell: string, term: string, colorTerm: string, integration: boolean): ShellSpawnPlan;
