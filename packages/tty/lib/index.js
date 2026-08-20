import z from '@deepseek-ai/schemastery';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
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
const SID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const TTY_GUIDANCE = '本机已安装 dsh-tty 插件（终端面板）：Web GUI 侧边栏的「终端」入口可打开交互终端（xterm.js + PTY），可运行任意命令与 TUI 程序（vim/htop 等），支持多标签页；新标签默认在当前会话工作目录打开，工作目录可随当前会话切换。长驻进程（dev server、watch、交互式程序）应引导用户到终端面板里运行，不要在 bash 工具里挂起等待；用户提到「开个终端 / 在终端里跑」时引导其打开该面板。';
/** 可热更新的运行时配置（settings/updated 动态应用）。 */
class LiveConfig {
    shell;
    term;
    colorTerm;
    cwd;
    constructor(init) {
        this.shell = init.shell;
        this.term = init.term;
        this.colorTerm = init.colorTerm;
        this.cwd = init.cwd;
    }
    /** 合并部分更新；空字符串/undefined 保持原值。 */
    apply(partial) {
        if (typeof partial.shell === 'string' && partial.shell.trim() !== '')
            this.shell = partial.shell.trim();
        if (typeof partial.term === 'string' && partial.term.trim() !== '')
            this.term = partial.term.trim();
        if (typeof partial.colorTerm === 'string' && partial.colorTerm.trim() !== '')
            this.colorTerm = partial.colorTerm.trim();
        if (typeof partial.cwd === 'string' && partial.cwd.trim() !== '')
            this.cwd = partial.cwd.trim();
    }
}
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
    sessions = new Map();
    limit;
    constructor(maxSessions) {
        this.limit = maxSessions;
    }
    get limitValue() {
        return this.limit;
    }
    /** 配置热生效时调整上限（1~16）。 */
    setLimit(maxSessions) {
        this.limit = Math.max(1, Math.min(16, maxSessions));
    }
    get count() {
        return this.sessions.size;
    }
    canSpawn() {
        return this.sessions.size < this.limit;
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
        /** 本连接上的会话表（sid → session）；单连接多会话（标签页）。 */
        const local = new Map();
        const cleanupAll = async () => {
            const all = [...local.values()];
            local.clear();
            await Promise.all(all.map(async (session) => {
                session.closed = true;
                this.sessions.remove(session.id);
                await forceKill(session.handle);
            }));
        };
        ws.on('message', (raw) => {
            let msg;
            try {
                msg = JSON.parse(raw.toString());
            }
            catch {
                return;
            }
            void this.handleMessage(ws, msg, local, cleanupAll);
        });
        ws.on('close', () => {
            void cleanupAll();
        });
        ws.on('error', (error) => {
            this.ctx.logger.warn('[dsh-tty] ws error: ' + error.message);
        });
    }
    /**
     * 解析帧里的 sid：显式 sid 校验格式；缺省时仅当连接恰好一个会话才可用。
     * 返回 undefined 并已发送错误帧时，调用方应直接返回。
     */
    resolveSid(ws, msg, local) {
        const raw = msg.sid;
        if (typeof raw === 'string' && raw !== '') {
            if (!SID_RE.test(raw)) {
                send(ws, { t: 'error', m: '非法 sid' });
                return undefined;
            }
            return raw;
        }
        if (local.size === 1)
            return [...local.keys()][0];
        send(ws, { t: 'error', m: local.size === 0 ? '没有可用会话（先发 spawn）' : '存在多个会话，请指定 sid' });
        return undefined;
    }
    async handleMessage(ws, msg, local, cleanupAll) {
        try {
            if (msg.t === 'spawn') {
                const sid = typeof msg.sid === 'string' && msg.sid !== '' ? msg.sid : randomUUID();
                if (!SID_RE.test(sid)) {
                    send(ws, { t: 'error', m: '非法 sid' });
                    return;
                }
                if (local.has(sid)) {
                    send(ws, { t: 'error', sid, m: 'sid 已存在' });
                    return;
                }
                if (!this.sessions.canSpawn()) {
                    send(ws, { t: 'error', sid, m: `会话数已达上限（${this.sessions.limitValue}）` });
                    return;
                }
                // 客户端（当前会话）cwd 优先；校验存在性，避免 node-pty 抛难懂错误
                const cwd = typeof msg.cwd === 'string' && msg.cwd.trim() !== '' ? msg.cwd.trim() : this.options.cwd;
                if (!existsSync(cwd)) {
                    send(ws, { t: 'error', sid, m: `cwd 不存在: ${cwd}` });
                    return;
                }
                const subprocess = this.ctx.get('subprocess');
                if (subprocess === undefined) {
                    send(ws, { t: 'error', sid, m: 'subprocess 服务不可用' });
                    return;
                }
                const handle = await subprocess.spawnTerminal({
                    argv: shellArgv(this.options.shell, this.options.term, this.options.colorTerm),
                    rows: Number(msg.rows) || 24,
                    cols: Number(msg.cols) || 80,
                    cwd,
                    env: { TERM: this.options.term, COLORTERM: this.options.colorTerm },
                    graceMs: 5000,
                });
                const next = { id: sid, handle, ws, closed: false, paused: false };
                local.set(sid, next);
                this.sessions.add(next);
                send(ws, { t: 'ready', sid, pid: handle.pid });
                this.attachOutput(next);
                handle.done.then((outcome) => {
                    // kill 主动关闭时会话可能已被移出 local，用 exitSent 保证 exit 帧恰好一次
                    if (next.exitSent === true)
                        return;
                    next.exitSent = true;
                    next.closed = true;
                    local.delete(sid);
                    this.sessions.remove(sid);
                    send(ws, { t: 'exit', sid, code: outcome.exitCode, signal: outcome.signal });
                }).catch(() => { });
            }
            else if (msg.t === 'input') {
                const sid = this.resolveSid(ws, msg, local);
                if (sid === undefined)
                    return;
                const session = local.get(sid);
                if (session !== undefined)
                    await session.handle.write(String(msg.d ?? ''));
            }
            else if (msg.t === 'resize') {
                const sid = this.resolveSid(ws, msg, local);
                if (sid === undefined)
                    return;
                const session = local.get(sid);
                if (session !== undefined) {
                    session.handle.terminal.resize(Number(msg.cols) || 80, Number(msg.rows) || 24);
                }
            }
            else if (msg.t === 'kill') {
                const sid = this.resolveSid(ws, msg, local);
                if (sid === undefined)
                    return;
                const session = local.get(sid);
                if (session === undefined)
                    return;
                session.closed = true;
                local.delete(sid);
                this.sessions.remove(sid);
                await forceKill(session.handle);
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
            const sid = session.id;
            ws.send(JSON.stringify({ t: 'data', sid, d: text }), () => {
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
        const live = new LiveConfig({
            shell: config?.shell?.trim() || process.env.SHELL || '/bin/zsh',
            term: config?.term?.trim() || 'xterm-256color',
            colorTerm: config?.colorTerm?.trim() || 'truecolor',
            cwd: config?.cwd?.trim() || process.cwd(),
        });
        const sessions = new SessionManager(config?.maxSessions ?? DEFAULT_MAX_SESSIONS);
        const server = new TtyServer(ctx, sessions, live);
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
        // settings 命名空间 + 配置热生效：settings/updated 事件（dsh-settings 提交事件，
        // 监听器签名 (ns, next, prev, source)）动态应用 shell/term/colorTerm/cwd/maxSessions
        ctx.inject(['settings'], (settingsCtx) => {
            settingsCtx.effect(() => {
                const settings = settingsCtx.settings;
                settings.register('tty', TTY_SETTINGS_SCHEMA);
                const events = settingsCtx;
                const off = events.events.on('settings/updated', (ns, next) => {
                    if (ns !== 'tty' || typeof next !== 'object' || next === null)
                        return;
                    const section = next;
                    live.apply({
                        shell: typeof section.shell === 'string' ? section.shell : undefined,
                        term: typeof section.term === 'string' ? section.term : undefined,
                        colorTerm: typeof section.colorTerm === 'string' ? section.colorTerm : undefined,
                        cwd: typeof section.cwd === 'string' ? section.cwd : undefined,
                    });
                    if (typeof section.maxSessions === 'number' && Number.isInteger(section.maxSessions) && section.maxSessions >= 1) {
                        sessions.setLimit(section.maxSessions);
                    }
                    console.log(`[dsh-tty] config hot-applied (shell=${live.shell}, term=${live.term}, cwd=${live.cwd}, maxSessions=${sessions.limitValue})`);
                });
                return () => {
                    off();
                };
            }, 'dsh-tty: settings');
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
        console.log(`[dsh-tty] mounted (shell=${live.shell}, term=${live.term}, cwd=${live.cwd}, maxSessions=${sessions.limitValue})`);
    },
});
export const { name, inject, apply } = plugin;
//# sourceMappingURL=index.js.map