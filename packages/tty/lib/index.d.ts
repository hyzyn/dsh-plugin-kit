/**
 * @hyzyn/dsh-tty — DSH Web GUI 的终端面板插件（宿主半体）。
 *
 * 机制：浏览器半体打开「终端」大弹窗后，经 WebSocket 连接
 * /api/dsh-tty/ws（webServer.registerUpgrade 注册的 upgrade 路由），
 * spawn 帧创建真实 PTY 会话（ctx.subprocess.spawnTerminal，node-pty），
 * 之后双向透传：input/resize/kill 上行，data/exit/error 下行。
 *
 * 帧协议 v2（JSON 文本帧；sid 维度支持单连接多会话/标签页）：
 *   C→S  {t:'spawn', sid?, cols?, rows?, cwd?}  创建本地会话；sid 缺省时宿主生成
 *   C→S  {t:'ssh', sid?, cols?, rows?, name? | host, username, ...}
 *                                               创建 SSH 会话（ssh2 原生，见 ssh.ts）；
 *                                               name 引用连接簿条目，内联字段可覆盖
 *   C→S  {t:'input', sid?, d}                  按键/粘贴数据
 *   C→S  {t:'resize', sid?, cols, rows}        xterm fit 触发
 *   C→S  {t:'kill', sid?}                      关闭会话
 *   S→C  {t:'ready', sid, pid, kind, target?}  会话就绪（ssh 时 pid=null，target=user@host）
 *   S→C  {t:'data', sid, d}                    终端输出（utf8 文本）
 *   S→C  {t:'exit', sid, code, signal}         PTY 退出事实（恰好一次）
 *   S→C  {t:'error', sid?, m}                  错误
 * 省略 sid 时按「该连接唯一会话」路由；连接上存在 0 或多个会话时省略 sid 报错。
 * 旧脚本（spawn 不带 sid）自动兼容：宿主生成 sid，响应帧多带 sid 字段。
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
import type { SshHostEntry } from './ssh.js';
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
    /** 会话工作目录（客户端 spawn 带 cwd 时优先）；缺省为宿主进程启动目录。 */
    cwd?: string;
    /** SSH 连接簿（面板「+」菜单可选；密码/口令支持 env:VAR 引用）。 */
    sshHosts?: SshHostEntry[];
}
export declare const name: string, inject: string[] | undefined, apply: (ctx: Context, config?: Config | undefined) => void;
