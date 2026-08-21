import z from '@deepseek-ai/schemastery';
import { randomUUID } from 'node:crypto';
import { PassThrough } from 'node:stream';
import WebSocket, { WebSocketServer } from 'ws';
import { definePlugin } from '@hyzyn/dsh-kit';
/** 与「设置 → 插件 → 终端面板」卡片表单对齐的 schema。 */
const TTY_SETTINGS_SCHEMA = z.object({
    enabled: z.boolean().default(true),
    announceToAgent: z.boolean().default(true),
    maxSessions: z.natural().max(16).default(4),
    shell: z.string().default(''),
    term: z.string().default('xterm-256color'),
    colorTerm: z.string().default('truecolor'),
    cwd: z.string().default(''),
});
/* ------------------------------------------------------------------ *
 * 常量
 * ------------------------------------------------------------------ */
const WS_PATH = '/api/dsh-tty/ws';
const DEFAULT_MAX_SESSIONS = 4;
/** 下行背压阈值（ws.bufferedAmount 字节）。 */
const BACKPRESSURE_HIGH = 512 * 1024;
const BACKPRESSURE_LOW = 128 * 1024;
const TTY_GUIDANCE = '本机已安装 dsh-tty 插件（终端面板）：Web GUI 侧边栏的「终端」入口可打开交互终端（xterm.js + PTY），可运行任意命令与 TUI 程序（vim/htop 等），工作目录为宿主进程启动目录。长驻进程（dev server、watch、交互式程序）应引导用户到终端面板里运行，不要在 bash 工具里挂起等待；用户提到「开个终端 / 在终端里跑」时引导其打开该面板。';
/* ------------------------------------------------------------------ *
 * 工具
 * ------------------------------------------------------------------ */
/** best-effort 终止：terminate() 抛「幸存者」竞态时降级为对顶层 shell 直接 SIGKILL。 */
async function forceKill(handle) {
    try {
        await handle.terminate();
    }
    catch {
        try {
            handle.terminal.kill('SIGKILL');
        }
        catch {
            /* 已退出 */
        }
    }
}
/**
 * shell argv。node-pty 的 name 优先于 env.TERM，而 DSH 硬编码 name:"dumb"，
 * 只能在 exec 真正的 shell 之前 export（M0 A2 实测结论）。
 */
function shellArgv(shell, term, colorTerm) {
    return [shell, '-c', `export TERM='${term}'; export COLORTERM='${colorTerm}'; exec "${shell}"`];
}
function send(ws, msg) {
    if (ws.readyState !== WebSocket.OPEN)
        return;
    ws.send(JSON.stringify(msg));
}
/** upgrade 路由的 loopback 信任围栏（与 dsh-mcp 的 HTTP 围栏同思路，socket 版）。 */
function isLoopbackUpgrade(req) {
    const address = req.socket.remoteAddress;
    if (address !== '127.0.0.1' && address !== '::1' && address !== '::ffff:127.0.0.1')
        return false;
    const host = req.headers.host;
    if (typeof host !== 'string')
        return false;
    let hostUrl;
    try {
        hostUrl = new URL('http://' + host);
    }
    catch {
        return false;
    }
    if (hostUrl.hostname !== '127.0.0.1' && hostUrl.hostname !== 'localhost' && hostUrl.hostname !== '[::1]')
        return false;
    if (req.headers['sec-fetch-site'] === 'cross-site')
        return false;
    const origin = req.headers.origin;
    if (origin === undefined)
        return true;
    try {
        return new URL(origin).host === hostUrl.host;
    }
    catch {
        return false;
    }
}
/* ------------------------------------------------------------------ *
 * 会话管理
 * ------------------------------------------------------------------ */
class SessionManager {
    maxSessions;
    sessions = new Map();
    constructor(maxSessions) {
        this.maxSessions = maxSessions;
    }
    get limit() {
        return this.maxSessions;
    }
    get count() {
        return this.sessions.size;
    }
    canSpawn() {
        return this.sessions.size < this.maxSessions;
    }
    add(session) {
        this.sessions.set(session.id, session);
    }
    remove(id) {
        this.sessions.delete(id);
    }
    async disposeAll() {
        const all = [...this.sessions.values()];
        this.sessions.clear();
        await Promise.all(all.map((session) => forceKill(session.handle)));
    }
}
/* ------------------------------------------------------------------ *
 * WebSocket 连接处理
 * ------------------------------------------------------------------ */
class TtyServer {
    ctx;
    sessions;
    options;
    wss = new WebSocketServer({ noServer: true });
    constructor(ctx, sessions, options) {
        this.ctx = ctx;
        this.sessions = sessions;
        this.options = options;
        this.wss.on('connection', (ws) => this.onConnection(ws));
    }
    /** registerUpgrade 的 handler（loopback 围栏 + ws 握手）。 */
    handleUpgrade(req, socket, head) {
        if (!isLoopbackUpgrade(req)) {
            socket.destroy();
            return;
        }
        this.wss.handleUpgrade(req, socket, head, (ws) => {
            this.wss.emit('connection', ws, req);
        });
    }
    onConnection(ws) {
        let session;
        const cleanup = async () => {
            if (session === undefined)
                return;
            const handle = session.handle;
            session.closed = true;
            this.sessions.remove(session.id);
            session = undefined;
            await forceKill(handle);
        };
        ws.on('message', (raw) => {
            let msg;
            try {
                msg = JSON.parse(raw.toString());
            }
            catch {
                return;
            }
            void this.handleMessage(ws, msg, () => session, (next) => {
                session = next;
            }, cleanup);
        });
        ws.on('close', () => {
            void cleanup();
        });
        ws.on('error', (error) => {
            this.ctx.logger.warn('[dsh-tty] ws error: ' + error.message);
        });
    }
    async handleMessage(ws, msg, getSession, setSession, cleanup) {
        try {
            if (msg.t === 'spawn') {
                if (getSession() !== undefined) {
                    send(ws, { t: 'error', m: '会话已存在（单会话模式，先发 kill 或重连）' });
                    return;
                }
                if (!this.sessions.canSpawn()) {
                    send(ws, { t: 'error', m: `会话数已达上限（${this.sessions.limit}）` });
                    return;
                }
                // 运行时取服务：cordis 的 inject 门禁禁止在未声明的 inject 里直接
                // 访问 ctx.subprocess 属性，用 ctx.get() 免声明读取（mcp 同款模式）。
                const subprocess = this.ctx.get('subprocess');
                if (subprocess === undefined) {
                    send(ws, { t: 'error', m: 'subprocess 服务不可用' });
                    return;
                }
                const handle = await subprocess.spawnTerminal({
                    argv: shellArgv(this.options.shell, this.options.term, this.options.colorTerm),
                    rows: Number(msg.rows) || 24,
                    cols: Number(msg.cols) || 80,
                    cwd: this.options.cwd,
                    env: { TERM: this.options.term, COLORTERM: this.options.colorTerm },
                    graceMs: 5000,
                });
                const next = { id: randomUUID(), handle, ws, closed: false, paused: false };
                setSession(next);
                this.sessions.add(next);
                send(ws, { t: 'ready', pid: handle.pid });
                this.attachOutput(next);
                handle.done.then((outcome) => {
                    // 注意：kill 主动关闭时 cleanup 已把 session 置空，这里不能再依赖
                    // 会话存在性判断，用 exitSent 保证 exit 帧恰好发一次。
                    if (next.exitSent === true)
                        return;
                    next.exitSent = true;
                    next.closed = true;
                    setSession(undefined);
                    this.sessions.remove(next.id);
                    send(ws, { t: 'exit', code: outcome.exitCode, signal: outcome.signal });
                }).catch(() => { });
            }
            else if (msg.t === 'input') {
                const session = getSession();
                if (session !== undefined)
                    await session.handle.write(String(msg.d ?? ''));
            }
            else if (msg.t === 'resize') {
                const session = getSession();
                if (session !== undefined) {
                    session.handle.terminal.resize(Number(msg.cols) || 80, Number(msg.rows) || 24);
                }
            }
            else if (msg.t === 'kill') {
                await cleanup();
            }
        }
        catch (error) {
            send(ws, { t: 'error', m: error instanceof Error ? error.message : String(error) });
        }
    }
    /** 输出下行 + 基于 ws.bufferedAmount 的背压（暂停/恢复 PassThrough）。 */
    attachOutput(session) {
        const output = session.handle.output;
        const onData = (chunk) => {
            if (session.closed)
                return;
            const text = chunk.toString('utf8');
            const ws = session.ws;
            ws.send(JSON.stringify({ t: 'data', d: text }), () => {
                if (session.paused && ws.bufferedAmount < BACKPRESSURE_LOW && output.readableFlowing === false) {
                    output.resume();
                }
            });
            if (!session.paused && ws.bufferedAmount > BACKPRESSURE_HIGH) {
                session.paused = true;
                output.pause();
            }
        };
        output.on('data', onData);
    }
    close() {
        for (const client of this.wss.clients) {
            try {
                client.close();
            }
            catch {
                /* 已关闭 */
            }
        }
    }
}
/* ------------------------------------------------------------------ *
 * 插件本体
 * ------------------------------------------------------------------ */
const plugin = definePlugin({
    name: 'tty',
    inject: [],
    apply(ctx, config) {
        if (config?.enabled === false)
            return;
        const shell = config?.shell?.trim() || process.env.SHELL || '/bin/zsh';
        const term = config?.term?.trim() || 'xterm-256color';
        const colorTerm = config?.colorTerm?.trim() || 'truecolor';
        const cwd = config?.cwd?.trim() || process.cwd();
        const maxSessions = Math.max(1, Math.min(16, config?.maxSessions ?? DEFAULT_MAX_SESSIONS));
        const sessions = new SessionManager(maxSessions);
        const server = new TtyServer(ctx, sessions, { shell, term, colorTerm, cwd });
        // upgrade 路由（/api/dsh-tty/ws）
        ctx.inject(['webServer'], (webCtx) => {
            webCtx.effect(() => {
                const webServer = webCtx.webServer;
                const dispose = webServer.registerUpgrade({
                    path: WS_PATH,
                    handler: (req, socket, head) => server.handleUpgrade(req, socket, head),
                });
                return () => {
                    server.close();
                    try {
                        dispose();
                    }
                    catch {
                        /* 路由已释放 */
                    }
                };
            }, 'dsh-tty: upgrade route');
        });
        // settings 命名空间：让「设置 → 插件 → 插件配置」派发本插件卡片
        ctx.inject(['settings'], (settingsCtx) => {
            const settings = settingsCtx.settings;
            settings.register('tty', TTY_SETTINGS_SCHEMA);
        });
        // 向 agent 公告终端面板能力
        if (config?.announceToAgent !== false) {
            ctx.inject(['systemPrompt'], (promptCtx) => {
                promptCtx.effect(() => {
                    const systemPrompt = promptCtx.systemPrompt;
                    return systemPrompt.section({ name: 'plugin:dsh-tty', order: 150, text: TTY_GUIDANCE });
                }, 'dsh-tty: announcement');
            });
        }
        // 插件卸载时回收全部会话
        ctx.effect(() => {
            return () => {
                void sessions.disposeAll();
            };
        }, 'dsh-tty: session cleanup');
        console.log(`[dsh-tty] mounted (shell=${shell}, term=${term}, cwd=${cwd}, maxSessions=${maxSessions})`);
    },
});
export const { name, inject, apply } = plugin;
//# sourceMappingURL=index.js.map