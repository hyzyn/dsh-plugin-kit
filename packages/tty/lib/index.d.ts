/**
 * @hyzyn/dsh-tty — DSH Web GUI 的终端面板插件（宿主半体）。
 *
 * 机制：浏览器半体打开「终端」大弹窗后，经 WebSocket 连接
 * /api/dsh-tty/ws（webServer.registerUpgrade 注册的 upgrade 路由），
 * 首帧 spawn 一个真实 PTY 会话（ctx.subprocess.spawnTerminal，node-pty），
 * 之后双向透传：input/resize/kill 上行，data/exit/error 下行。
 *
 * 帧协议（JSON 文本帧）：
 *   C→S  {t:'spawn', cols?, rows?}        连接后首帧，创建会话（单会话/连接）
 *   C→S  {t:'input', d}                   按键/粘贴数据
 *   C→S  {t:'resize', cols, rows}         xterm fit 触发
 *   C→S  {t:'kill'}                       用户关闭会话
 *   S→C  {t:'ready', pid}                 会话就绪
 *   S→C  {t:'data', d}                    终端输出（utf8 文本）
 *   S→C  {t:'exit', code, signal}         PTY 退出事实
 *   S→C  {t:'error', m}                   错误
 *
 * M0 探针（scripts/probe.mjs）验证过的三个关键结论：
 *   1. TERM 必须用 `shell -c 'export TERM=...; exec "$shell"'` 包装层注入——
 *     DSH 的 spawnTerminal 硬编码 node-pty name:"dumb"，且 node-pty 里
 *     name 优先于 env.TERM，直接传 env 覆盖无效；
 *   2. resize 通过 (handle).terminal.resize(cols, rows) 透传 node-pty 原生
 *     API（DSH 的 terminal handle 未暴露 resize，属内部耦合，见 README）；
 *   3. terminate() 偶发「幸存者」竞态（SIGTERM→SIGKILL 升级后仍扫描到存活
 *     子进程），必须 best-effort：失败降级为对顶层 shell 直接 SIGKILL。
 */
import type { Context } from '@deepseek-ai/cordis';
export interface Config {
    /** 关闭整个插件。默认开。 */
    enabled?: boolean;
    /** 是否向 agent 注入插件能力公告。默认开。 */
    announceToAgent?: boolean;
    /** 并发 PTY 会话上限（1~16）。默认 4。 */
    maxSessions?: number;
    /** shell 路径；缺省 $SHELL（macOS 上通常 /bin/zsh）。 */
    shell?: string;
    /** TERM 值（经 -c 包装层注入）。默认 xterm-256color。 */
    term?: string;
    /** COLORTERM 值。默认 truecolor。 */
    colorTerm?: string;
    /** 会话工作目录；缺省为宿主进程启动目录。 */
    cwd?: string;
}
export declare const name: string, inject: string[] | undefined, apply: (ctx: Context, config?: Config | undefined) => void;
