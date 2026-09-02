/**
 * @hyzyn/dsh-tty — DSH Web GUI 的终端面板插件（宿主半体）。
 *
 * 机制：浏览器半体打开「终端」大弹窗后，经 WebSocket 连接
 * /api/dsh-tty/ws（webServer.registerUpgrade 注册的 upgrade 路由），
 * spawn 帧创建真实 PTY 会话（ctx.subprocess.spawnTerminal，node-pty），
 * 之后双向透传：input/resize/kill 上行，data/exit/error 下行。
 *
 * 帧协议 v3（JSON 文本帧；sid 维度支持单连接多会话/标签页 + 断线重连）：
 *   C→S  {t:'spawn', sid?, cols?, rows?, cwd?}  创建本地会话；sid 缺省时宿主生成
 *   C→S  {t:'ssh', sid?, cols?, rows?, name? | host, username, ...}
 *                                               创建 SSH 会话（ssh2 原生，见 ssh.ts）；
 *                                               name 引用连接簿条目，内联字段可覆盖
 *   C→S  {t:'input', sid?, d}                  按键/粘贴数据
 *   C→S  {t:'resize', sid?, cols, rows}        xterm fit 触发
 *   C→S  {t:'kill', sid?}                      关闭会话（孤儿会话也可跨连接 kill）
 *   C→S  {t:'sessions'}                        列出全局会话（attachable 标记可重连者）
 *   C→S  {t:'attach', sid}                     重连孤儿会话（断线保活窗口内）：
 *                                               ready 后紧跟一帧 data 回放输出缓冲
 *   S→C  {t:'ready', sid, pid, kind, target?}  会话就绪（ssh 时 pid=null，target=user@host）
 *   S→C  {t:'data', sid, d}                    终端输出（utf8 文本，StringDecoder 兜多字节分帧）
 *   S→C  {t:'exit', sid, code, signal}         PTY 退出事实（恰好一次）
 *   S→C  {t:'error', sid?, m}                  错误
 *   S→C  {t:'sessions', list}                  会话快照（attachable=true 表示前连接已断、可 attach）
 * 省略 sid 时按「该连接唯一会话」路由；连接上存在 0 或多个会话时省略 sid 报错。
 * 旧脚本（spawn 不带 sid）自动兼容：宿主生成 sid，响应帧多带 sid 字段。
 *
 * 断线保活：客户端正常关面板会先逐个 kill 再断开；因此「WS close 且仍有
 * 存活会话」判定为异常断开（刷新/网络抖动），会话转入孤儿状态保活
 * reconnectGraceSec（默认 120s，0 = 旧行为立即结束），等待新连接 attach
 * 并回放 256KB 环形缓冲；到点由回收器清理。
 *
 * shell 集成（src/shell-integration.ts，0.4.0）：spawn 时经 -c 包装层注入
 * OSC 133/7 钩子（zsh ZDOTDIR 桩 / bash --rcfile 桩），输出流解析出命令
 * 边界（tty_capture{last} / tty_expect 早停）与实时 cwd（tty_list）。
 * 辅助路由：/api/dsh-tty/ssh-config（~/.ssh/config 导入候选）、
 * /api/dsh-tty/env-vars（SSH 对话框 env:VAR 下拉，仅变量名）、
 * /api/dsh-tty/shells（设置卡片「Shell 路径」候选，仅路径）。
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
import type { HostKeyRecord, SshHostEntry } from './ssh.js';
import type { TunnelSpec } from './tunnels.js';
export type { HostKeyRecord } from './ssh.js';
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
    /** 异常断开后会话保活秒数（0 = 立即结束；默认 120，最大 3600）。 */
    reconnectGraceSec?: number;
    /** 已记录的 SSH 主机密钥指纹（TOFU 钉扎，按 host:port 唯一）。 */
    hostKeys?: HostKeyRecord[];
    /** 是否注入 OSC 133/7 shell 集成（命令边界标记 + cwd 上报）。默认开。 */
    shellIntegration?: boolean;
    /** 端口转发隧道（引用连接簿条目；宿主自持连接与重连，见 src/tunnels.ts）。 */
    tunnels?: TunnelSpec[];
}
export declare const name: string, inject: string[] | undefined, apply: (ctx: Context, config?: Config | undefined) => void;
