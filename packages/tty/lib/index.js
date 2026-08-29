import z from '@deepseek-ai/schemastery';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { PassThrough } from 'node:stream';
import WebSocket, { WebSocketServer } from 'ws';
import { definePlugin } from '@hyzyn/dsh-kit';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { spawnSsh, sshTarget } from './ssh.js';
const SSH_HOST_SCHEMA = z.object({
    name: z.string(),
    host: z.string(),
    port: z.natural().max(65535).default(22),
    username: z.string(),
    auth: z.union([z.const('agent'), z.const('key'), z.const('password')]).default('agent'),
    keyPath: z.string().default(''),
    passphrase: z.string().default(''),
    password: z.string().default(''),
});
/** 与「设置 → 插件 → 终端面板」卡片表单对齐的 schema。 */
const TTY_SETTINGS_SCHEMA = z.object({
    enabled: z.boolean().default(true),
    announceToAgent: z.boolean().default(true),
    maxSessions: z.natural().max(16).default(4),
    shell: z.string().default(''),
    term: z.string().default('xterm-256color'),
    colorTerm: z.string().default('truecolor'),
    cwd: z.string().default(''),
    sshHosts: z.array(SSH_HOST_SCHEMA).default([]),
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
const BUFFER_CAP = 256 * 1024;
const TTY_GUIDANCE = '本机已安装 dsh-tty 插件（终端面板）：Web GUI 侧边栏的「终端」入口可打开交互终端（xterm.js + PTY），可运行任意命令与 TUI 程序（vim/htop 等），支持多标签页；新标签默认在当前会话工作目录打开，工作目录可随当前会话切换。标签栏「+」菜单还能开 SSH 标签页（ssh2 原生连接，连接簿在设置卡片维护），像本地终端一样操作远程主机。长驻进程（dev server、watch、交互式程序）应引导用户到终端面板里运行，不要在 bash 工具里挂起等待；用户提到「开个终端 / 在终端里跑 / SSH 到某台机器」时引导其打开该面板。agent 侧也有配套工具：tty_list 列出活跃终端会话（含 SSH 会话的 target），tty_capture 读取会话近期输出（可查看 dev server/NPM 日志），tty_send 向会话发送按键——操作会实时显示在用户终端里。';
/** 本地 PTY 包装成 TermHandle（resize/kill 仍是透传 node-pty 的内部耦合）。 */
function wrapLocalPty(handle) {
    return {
        kind: 'local',
        pid: handle.pid,
        output: handle.output,
        done: handle.done,
        write: (data) => handle.write(data),
        resize: (cols, rows) => handle.terminal.resize(cols, rows),
        terminate: () => handle.terminate(),
        forceKill: () => handle.terminal.kill('SIGKILL'),
    };
}
/** 可热更新的运行时配置（settings/updated 动态应用）。 */
class LiveConfig {
    shell;
    term;
    colorTerm;
    cwd;
    sshHosts;
    constructor(init) {
        this.shell = init.shell;
        this.term = init.term;
        this.colorTerm = init.colorTerm;
        this.cwd = init.cwd;
        this.sshHosts = init.sshHosts ?? [];
    }
    /** 合并部分更新；空字符串/undefined 保持原值；sshHosts 传数组即整体替换。 */
    apply(partial) {
        if (typeof partial.shell === 'string' && partial.shell.trim() !== '')
            this.shell = partial.shell.trim();
        if (typeof partial.term === 'string' && partial.term.trim() !== '')
            this.term = partial.term.trim();
        if (typeof partial.colorTerm === 'string' && partial.colorTerm.trim() !== '')
            this.colorTerm = partial.colorTerm.trim();
        if (typeof partial.cwd === 'string' && partial.cwd.trim() !== '')
            this.cwd = partial.cwd.trim();
        if (Array.isArray(partial.sshHosts))
            this.sshHosts = partial.sshHosts;
    }
    findSshHost(name) {
        return this.sshHosts.find((entry) => entry.name === name);
    }
}
/* ------------------------------------------------------------------ *
 * 工具
 * ------------------------------------------------------------------ */
/** best-effort 终止：terminate() 抛「幸存者」竞态时降级为 forceKill（本地 PTY：对顶层 shell 直接 SIGKILL）。 */
async function forceKill(handle) {
    try {
        await handle.terminate();
    }
    catch {
        try {
            handle.forceKill?.();
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
/**
 * 宽松清洗一份 sshHosts 输入（settings 存储/热更新事件路径）：
 * 不合法条目直接丢弃；输入不是数组时返回 undefined（表示「未提供，保持原值」）。
 */
function sanitizeSshHosts(input) {
    if (!Array.isArray(input))
        return undefined;
    const out = [];
    for (const item of input) {
        if (typeof item !== 'object' || item === null)
            continue;
        const raw = item;
        if (typeof raw.name !== 'string' || raw.name.trim() === '')
            continue;
        if (typeof raw.host !== 'string' || raw.host.trim() === '')
            continue;
        if (typeof raw.username !== 'string' || raw.username.trim() === '')
            continue;
        const port = Number(raw.port);
        out.push({
            name: raw.name.trim(),
            host: raw.host.trim(),
            port: Number.isInteger(port) && port >= 1 && port <= 65535 ? port : 22,
            username: raw.username.trim(),
            auth: raw.auth === 'key' || raw.auth === 'password' ? raw.auth : 'agent',
            keyPath: typeof raw.keyPath === 'string' ? raw.keyPath : '',
            passphrase: typeof raw.passphrase === 'string' ? raw.passphrase : '',
            password: typeof raw.password === 'string' ? raw.password : '',
        });
    }
    return out;
}
/** 严格校验一份 sshHosts 输入（HTTP POST 路径）；返回错误信息或清洗后的数组。 */
function validateSshHosts(input) {
    if (!Array.isArray(input))
        return { error: 'sshHosts 必须是数组' };
    const names = new Set();
    for (const item of input) {
        if (typeof item !== 'object' || item === null)
            return { error: 'sshHosts 条目必须是对象' };
        const raw = item;
        for (const key of ['name', 'host', 'username']) {
            if (typeof raw[key] !== 'string' || raw[key].trim() === '')
                return { error: `sshHosts.${key} 必须是非空字符串` };
        }
        if (names.has(raw.name.trim()))
            return { error: `sshHosts.name 重复: ${String(raw.name)}` };
        names.add(raw.name.trim());
        if (raw.port !== undefined) {
            const port = Number(raw.port);
            if (!Number.isInteger(port) || port < 1 || port > 65535)
                return { error: 'sshHosts.port 必须是 1~65535 的整数' };
        }
        if (raw.auth !== undefined && raw.auth !== 'agent' && raw.auth !== 'key' && raw.auth !== 'password') {
            return { error: 'sshHosts.auth 必须是 agent / key / password' };
        }
        for (const key of ['keyPath', 'passphrase', 'password']) {
            if (raw[key] !== undefined && typeof raw[key] !== 'string')
                return { error: `sshHosts.${key} 必须是字符串` };
        }
        if ((raw.auth === 'key') && (typeof raw.keyPath !== 'string' || raw.keyPath.trim() === '')) {
            return { error: `sshHosts「${String(raw.name)}」auth=key 需要 keyPath` };
        }
    }
    return { hosts: sanitizeSshHosts(input) };
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
    get(id) {
        return this.sessions.get(id);
    }
    /** agent 工具用的只读快照（SSH 会话无本地 pid，该字段省略）。 */
    list() {
        return [...this.sessions.values()].map((session) => {
            const base = {
                sid: session.id,
                cwd: session.cwd,
                kind: session.kind,
                target: session.target,
                startedAt: session.startedAt,
                lastOutputAt: session.lastOutputAt,
            };
            return session.handle.pid === null ? base : { ...base, pid: session.handle.pid };
        });
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
     * 解析帧里的 sid。返回：
     *   { sid }        目标会话；
     *   { unknown }    显式 sid 但本连接无此会话（客户端竞态，如 resize 先于
     *                  spawn 就绪到达；调用方应静默忽略，而不是报错）；
     *   undefined      已发送错误帧（非法 sid / sid 缺省但无法唯一路由）。
     */
    resolveSid(ws, msg, local) {
        const raw = msg.sid;
        if (typeof raw === 'string' && raw !== '') {
            if (!SID_RE.test(raw)) {
                send(ws, { t: 'error', m: '非法 sid' });
                return undefined;
            }
            if (!local.has(raw))
                return { unknown: true };
            return { sid: raw };
        }
        if (local.size === 1)
            return { sid: [...local.keys()][0] };
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
                const handle = wrapLocalPty(await subprocess.spawnTerminal({
                    argv: shellArgv(this.options.shell, this.options.term, this.options.colorTerm),
                    rows: Number(msg.rows) || 24,
                    cols: Number(msg.cols) || 80,
                    cwd,
                    env: { TERM: this.options.term, COLORTERM: this.options.colorTerm },
                    graceMs: 5000,
                }));
                const next = {
                    id: sid,
                    handle,
                    ws,
                    closed: false,
                    paused: false,
                    cwd,
                    kind: 'local',
                    target: '',
                    startedAt: Date.now(),
                    lastOutputAt: Date.now(),
                    buffer: '',
                };
                local.set(sid, next);
                this.sessions.add(next);
                send(ws, { t: 'ready', sid, pid: handle.pid, kind: 'local' });
                this.attachOutput(next);
                this.watchDone(next, local, ws);
            }
            else if (msg.t === 'ssh') {
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
                // name 引用连接簿条目作基底，内联字段可逐项覆盖
                const profile = typeof msg.name === 'string' && msg.name !== '' ? this.options.findSshHost(msg.name) : undefined;
                if (typeof msg.name === 'string' && msg.name !== '' && profile === undefined) {
                    send(ws, { t: 'error', sid, m: `连接簿中不存在: ${msg.name}` });
                    return;
                }
                const spec = {
                    host: typeof msg.host === 'string' && msg.host.trim() !== '' ? msg.host.trim() : profile?.host ?? '',
                    port: Number(msg.port) || profile?.port || 22,
                    username: typeof msg.username === 'string' && msg.username.trim() !== '' ? msg.username.trim() : profile?.username ?? '',
                    auth: msg.auth === 'key' || msg.auth === 'password' || msg.auth === 'agent' ? msg.auth : profile?.auth ?? 'agent',
                    keyPath: typeof msg.keyPath === 'string' && msg.keyPath !== '' ? msg.keyPath : profile?.keyPath,
                    passphrase: typeof msg.passphrase === 'string' && msg.passphrase !== '' ? msg.passphrase : profile?.passphrase,
                    password: typeof msg.password === 'string' && msg.password !== '' ? msg.password : profile?.password,
                };
                if (spec.host === '' || spec.username === '') {
                    send(ws, { t: 'error', sid, m: 'SSH 会话需要 host 与 username（或用 name 引用连接簿）' });
                    return;
                }
                const target = sshTarget(spec);
                send(ws, { t: 'data', sid, d: `\x1b[2mConnecting ${target} …\x1b[0m\r\n` });
                let handle;
                try {
                    handle = await spawnSsh(spec, {
                        term: this.options.term,
                        cols: Number(msg.cols) || 80,
                        rows: Number(msg.rows) || 24,
                        logger: { info: (m) => this.ctx.logger.info(m), warn: (m) => this.ctx.logger.warn(m) },
                    });
                }
                catch (error) {
                    send(ws, { t: 'error', sid, m: error instanceof Error ? error.message : String(error) });
                    return;
                }
                const next = {
                    id: sid,
                    handle,
                    ws,
                    closed: false,
                    paused: false,
                    cwd: '',
                    kind: 'ssh',
                    target,
                    startedAt: Date.now(),
                    lastOutputAt: Date.now(),
                    buffer: '',
                };
                local.set(sid, next);
                this.sessions.add(next);
                send(ws, { t: 'ready', sid, pid: null, kind: 'ssh', target });
                this.attachOutput(next);
                this.watchDone(next, local, ws);
            }
            else if (msg.t === 'input') {
                const resolved = this.resolveSid(ws, msg, local);
                if (resolved === undefined || 'unknown' in resolved)
                    return;
                const session = local.get(resolved.sid);
                if (session !== undefined)
                    await session.handle.write(String(msg.d ?? ''));
            }
            else if (msg.t === 'resize') {
                const resolved = this.resolveSid(ws, msg, local);
                if (resolved === undefined || 'unknown' in resolved)
                    return;
                const session = local.get(resolved.sid);
                if (session !== undefined) {
                    session.handle.resize(Number(msg.cols) || 80, Number(msg.rows) || 24);
                }
            }
            else if (msg.t === 'kill') {
                const resolved = this.resolveSid(ws, msg, local);
                if (resolved === undefined || 'unknown' in resolved)
                    return;
                const session = local.get(resolved.sid);
                if (session === undefined)
                    return;
                session.closed = true;
                local.delete(resolved.sid);
                this.sessions.remove(resolved.sid);
                await forceKill(session.handle);
            }
        }
        catch (error) {
            send(ws, { t: 'error', m: error instanceof Error ? error.message : String(error) });
        }
    }
    /** 会话退出事实 → exit 帧（恰好一次；本地 PTY 与 SSH 共用）。 */
    watchDone(session, local, ws) {
        session.handle.done.then((outcome) => {
            // kill 主动关闭时会话可能已被移出 local，用 exitSent 保证 exit 帧恰好一次
            if (session.exitSent === true)
                return;
            session.exitSent = true;
            session.closed = true;
            local.delete(session.id);
            this.sessions.remove(session.id);
            send(ws, { t: 'exit', sid: session.id, code: outcome.exitCode, signal: outcome.signal });
        }).catch(() => { });
    }
    /** 输出下行 + 基于 ws.bufferedAmount 的背压（暂停/恢复 PassThrough）。 */
    attachOutput(session) {
        const output = session.handle.output;
        const onData = (chunk) => {
            if (session.closed)
                return;
            const text = chunk.toString('utf8');
            session.lastOutputAt = Date.now();
            session.buffer = (session.buffer + text).slice(-BUFFER_CAP);
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
/** HTTP 路由的 loopback 信任围栏（与 dsh-mcp 同思路）。 */
function isLoopbackHttp(req) {
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
function writeJson(res, status, body) {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'referrer-policy': 'no-referrer' });
    res.end(JSON.stringify(body));
}
async function readJsonBody(req) {
    const chunks = [];
    let size = 0;
    try {
        for await (const chunk of req) {
            size += chunk.length;
            if (size > 512 * 1024)
                return undefined;
            chunks.push(chunk);
        }
    }
    catch {
        return undefined;
    }
    try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? parsed : undefined;
    }
    catch {
        return undefined;
    }
}
const plugin = definePlugin({
    name: 'tty',
    // 声明 inject：tools 服务只有声明式 inject 才能解析（动态 ctx.inject/ctx.get
    // 均拿不到，实测 mcp-client 同款模式），声明后 ctx.get('tools') 才能取到。
    inject: ['tools'],
    apply(ctx, config) {
        if (config?.enabled === false)
            return;
        const live = new LiveConfig({
            shell: config?.shell?.trim() || process.env.SHELL || '/bin/zsh',
            term: config?.term?.trim() || 'xterm-256color',
            colorTerm: config?.colorTerm?.trim() || 'truecolor',
            cwd: config?.cwd?.trim() || process.cwd(),
            sshHosts: Array.isArray(config?.sshHosts) ? config.sshHosts : [],
        });
        const sessions = new SessionManager(config?.maxSessions ?? DEFAULT_MAX_SESSIONS);
        const server = new TtyServer(ctx, sessions, live);
        const stateRef = { enabled: true, announceToAgent: config?.announceToAgent !== false, toolsRegistered: false };
        let settingsScope;
        const snapshot = () => ({
            enabled: stateRef.enabled,
            announceToAgent: stateRef.announceToAgent,
            maxSessions: sessions.limitValue,
            shell: live.shell,
            term: live.term,
            colorTerm: live.colorTerm,
            cwd: live.cwd,
            sshHosts: live.sshHosts,
            toolsRegistered: stateRef.toolsRegistered,
        });
        /** 规范化并应用一份配置补丁（settings/updated 事件与 HTTP POST 共用；幂等）。 */
        const applyPatch = (section) => {
            live.apply({
                shell: typeof section.shell === 'string' ? section.shell : undefined,
                term: typeof section.term === 'string' ? section.term : undefined,
                colorTerm: typeof section.colorTerm === 'string' ? section.colorTerm : undefined,
                cwd: typeof section.cwd === 'string' ? section.cwd : undefined,
                sshHosts: sanitizeSshHosts(section.sshHosts),
            });
            if (typeof section.maxSessions === 'number' && Number.isInteger(section.maxSessions) && section.maxSessions >= 1 && section.maxSessions <= 16) {
                sessions.setLimit(section.maxSessions);
            }
            if (typeof section.enabled === 'boolean')
                stateRef.enabled = section.enabled;
            if (typeof section.announceToAgent === 'boolean')
                stateRef.announceToAgent = section.announceToAgent;
            console.log(`[dsh-tty] config applied (shell=${live.shell}, term=${live.term}, cwd=${live.cwd}, maxSessions=${sessions.limitValue}, sshHosts=${live.sshHosts.length})`);
        };
        /** 校验 HTTP POST 的配置体；返回规范化补丁或错误信息。 */
        const normalizePatch = (input) => {
            const patch = {};
            const known = new Set(['enabled', 'announceToAgent', 'maxSessions', 'shell', 'term', 'colorTerm', 'cwd', 'sshHosts']);
            for (const key of Object.keys(input)) {
                if (!known.has(key))
                    return { error: '未知配置项: ' + key };
            }
            if (input.enabled !== undefined) {
                if (typeof input.enabled !== 'boolean')
                    return { error: 'enabled 必须是布尔值' };
                patch.enabled = input.enabled;
            }
            if (input.announceToAgent !== undefined) {
                if (typeof input.announceToAgent !== 'boolean')
                    return { error: 'announceToAgent 必须是布尔值' };
                patch.announceToAgent = input.announceToAgent;
            }
            if (input.maxSessions !== undefined) {
                const value = Number(input.maxSessions);
                if (!Number.isInteger(value) || value < 1 || value > 16)
                    return { error: 'maxSessions 必须是 1~16 的整数' };
                patch.maxSessions = value;
            }
            for (const key of ['shell', 'term', 'colorTerm']) {
                if (input[key] === undefined)
                    continue;
                if (typeof input[key] !== 'string')
                    return { error: key + ' 必须是字符串' };
                if (input[key].trim() !== '')
                    patch[key] = input[key].trim();
            }
            if (input.cwd !== undefined) {
                if (typeof input.cwd !== 'string')
                    return { error: 'cwd 必须是字符串' };
                const cwd = input.cwd.trim();
                if (cwd !== '') {
                    if (!existsSync(cwd))
                        return { error: 'cwd 不存在: ' + cwd };
                    patch.cwd = cwd;
                }
            }
            if (input.sshHosts !== undefined) {
                const validated = validateSshHosts(input.sshHosts);
                if (validated.error !== undefined)
                    return { error: validated.error };
                patch.sshHosts = validated.hosts;
            }
            return { patch };
        };
        // webServer：WS upgrade 路由 + 配置读写路由（/api/dsh-tty/config）
        ctx.inject(['webServer'], (webCtx) => {
            webCtx.effect(() => {
                const webServer = webCtx.webServer;
                const disposers = [];
                disposers.push(webServer.registerUpgrade({
                    path: WS_PATH,
                    handler: (req, socket, head) => server.handleUpgrade(req, socket, head),
                }));
                disposers.push(webServer.register({
                    kind: 'exact',
                    path: '/api/dsh-tty/config',
                    handler: async (req, res) => {
                        if (!isLoopbackHttp(req)) {
                            writeJson(res, 403, { error: 'forbidden: loopback-only' });
                            return;
                        }
                        if (req.method === 'GET') {
                            writeJson(res, 200, { ok: true, config: snapshot() });
                            return;
                        }
                        if (req.method !== 'POST') {
                            writeJson(res, 405, { error: 'method not allowed: ' + String(req.method) });
                            return;
                        }
                        const body = await readJsonBody(req);
                        if (body === undefined) {
                            writeJson(res, 400, { error: 'invalid JSON body' });
                            return;
                        }
                        const normalized = normalizePatch(body);
                        if (normalized.error !== undefined) {
                            writeJson(res, 400, { error: normalized.error });
                            return;
                        }
                        const patch = normalized.patch ?? {};
                        const scope = settingsScope;
                        if (scope !== undefined) {
                            try {
                                // 官方持久化通道：写入 settings 命名空间（dsh-settings-file），
                                // 成功后触发 settings/updated → applyPatch 热应用
                                await scope.update(patch);
                            }
                            catch (error) {
                                writeJson(res, 500, { error: '保存配置失败: ' + (error instanceof Error ? error.message : String(error)) });
                                return;
                            }
                        }
                        // 无 settings 服务（或 stub）时直接应用；有服务时也再应用一次（幂等）
                        applyPatch(patch);
                        writeJson(res, 200, { ok: true, config: snapshot() });
                    },
                }));
                return () => {
                    server.close();
                    for (const dispose of disposers) {
                        try {
                            dispose();
                        }
                        catch {
                            /* 路由已释放 */
                        }
                    }
                };
            }, 'dsh-tty: web routes');
        });
        // settings 命名空间：注册 + 启动合并持久化值 + settings/updated 热应用
        ctx.inject(['settings'], (settingsCtx) => {
            settingsCtx.effect(() => {
                const settings = settingsCtx.settings;
                const scope = settings.register('tty', TTY_SETTINGS_SCHEMA);
                settingsScope = scope;
                // 启动合并：字符串字段非空才覆盖；maxSessions/布尔用「非默认值才覆盖」启发式
                //（schema 默认值会混入 resolved，无法区分「显式保存的 4」与「从未保存」）。
                const stored = scope.get();
                const startup = {};
                if (typeof stored.shell === 'string' && stored.shell.trim() !== '')
                    startup.shell = stored.shell;
                if (typeof stored.term === 'string' && stored.term.trim() !== '')
                    startup.term = stored.term;
                if (typeof stored.colorTerm === 'string' && stored.colorTerm.trim() !== '')
                    startup.colorTerm = stored.colorTerm;
                if (typeof stored.cwd === 'string' && stored.cwd.trim() !== '')
                    startup.cwd = stored.cwd;
                if (stored.maxSessions !== 4 && typeof stored.maxSessions === 'number')
                    startup.maxSessions = stored.maxSessions;
                if (stored.enabled === false)
                    startup.enabled = false;
                if (stored.announceToAgent === false)
                    startup.announceToAgent = false;
                const storedHosts = sanitizeSshHosts(stored.sshHosts);
                if (storedHosts !== undefined && storedHosts.length > 0)
                    startup.sshHosts = storedHosts;
                if (Object.keys(startup).length > 0)
                    applyPatch(startup);
                const events = settingsCtx;
                const off = events.events.on('settings/updated', (ns, next) => {
                    if (ns !== 'tty' || typeof next !== 'object' || next === null)
                        return;
                    applyPatch(next);
                });
                return () => {
                    off();
                    settingsScope = undefined;
                };
            }, 'dsh-tty: settings');
        });
        // agent 工具集（P1）：tty_list / tty_capture / tty_send。
        // 信任模型：与 bash 工具同权（agent 本就能执行任意命令），不额外加确认层；
        // agent 对终端的操作会实时出现在浏览器面板里（同一 PTY），天然可被用户观察。
        // inject: ['tools'] 声明后（见上方），ctx.get('tools') 才能解析到服务。
        const toolsHost = ctx.get('tools');
        if (toolsHost !== undefined) {
            ctx.effect(() => {
                const tools = toolsHost;
                const tailLines = (session, lines) => {
                    const parts = session.buffer.split('\n');
                    return parts.slice(-(lines + 1)).join('\n').replace(/^\n+/, '');
                };
                const disposers = [];
                disposers.push(tools.register(defineTool({
                    name: 'tty_list',
                    description: '列出当前活跃的终端面板会话（sid / kind(local|ssh) / target / pid / cwd / 创建与最后活动时间）。用户开了终端面板后，用 tty_capture 读取某个 sid 的终端输出，用 tty_send 向该终端发送按键。',
                    parameters: {},
                    output: {
                        schema: {
                            type: 'object',
                            additionalProperties: false,
                            properties: {
                                sessions: {
                                    type: 'array',
                                    required: true,
                                    items: {
                                        type: 'object',
                                        additionalProperties: false,
                                        properties: {
                                            sid: { type: 'string', required: true },
                                            kind: { type: 'string', required: true },
                                            target: { type: 'string', required: true },
                                            pid: { type: 'number' },
                                            cwd: { type: 'string', required: true },
                                            startedAt: { type: 'number', required: true },
                                            lastOutputAt: { type: 'number', required: true },
                                        },
                                    },
                                },
                            },
                        },
                        render: (_args, value) => {
                            const sessions = value?.sessions ?? [];
                            const text = sessions.length === 0
                                ? '当前没有活跃的终端面板会话（请引导用户先打开终端面板，或用户尚未打开）'
                                : '终端面板会话：' + sessions.map((s) => {
                                    const where = s.kind === 'ssh' ? `ssh ${s.target}` : `pid=${String(s.pid ?? '?')} cwd=${s.cwd}`;
                                    return `\n- sid=${s.sid} [${s.kind}] ${where} (启动于 ${new Date(s.startedAt).toLocaleString()})`;
                                }).join('');
                            return [{ type: 'text', text }];
                        },
                    },
                    async execute() {
                        return { sessions: sessions.list() };
                    },
                })));
                disposers.push(tools.register(defineTool({
                    name: 'tty_capture',
                    description: '读取某个终端面板会话（tty_list 提供 sid）的近期输出（默认尾部 60 行，最多 500 行）。适合查看用户终端里正在运行的 dev server / watch / 构建输出。',
                    parameters: {
                        sid: { type: 'string', required: true, description: '会话 id（来自 tty_list）' },
                        lines: { type: 'number', description: '读取尾部行数（1~500，默认 60）' },
                    },
                    output: {
                        schema: {
                            type: 'object',
                            additionalProperties: false,
                            properties: {
                                sid: { type: 'string', required: true },
                                tail: { type: 'string', required: true },
                            },
                        },
                        render: (_args, value) => {
                            const v = value;
                            return [{ type: 'text', text: `终端会话 ${v.sid ?? '?'} 尾部输出：\n\n${v.tail ?? ''}` }];
                        },
                    },
                    async execute(args) {
                        const input = args;
                        if (typeof input.sid !== 'string' || input.sid === '')
                            throw new Error('sid 必须是非空字符串');
                        const lines = Math.max(1, Math.min(500, typeof input.lines === 'number' && Number.isInteger(input.lines) && input.lines >= 1 ? input.lines : 60));
                        const session = sessions.get(input.sid);
                        if (session === undefined || session.closed)
                            throw new Error(`会话不存在或已退出: ${input.sid}`);
                        return { sid: input.sid, tail: tailLines(session, lines) };
                    },
                })));
                disposers.push(tools.register(defineTool({
                    name: 'tty_send',
                    description: '向某个终端面板会话（tty_list 提供 sid）的 PTY 发送按键/文本（命令以 \\n 结尾）。适合给用户终端里运行的程序发交互输入（如 dev server 的 q 键、menu 选择、回答提示）。操作会实时显示在用户的终端面板里。',
                    parameters: {
                        sid: { type: 'string', required: true, description: '会话 id（来自 tty_list）' },
                        data: { type: 'string', required: true, description: '要发送的文本（含换行则直接发送命令）' },
                    },
                    output: {
                        schema: {
                            type: 'object',
                            additionalProperties: false,
                            properties: {
                                ok: { type: 'boolean', required: true },
                                sent: { type: 'number', required: true },
                            },
                        },
                        render: (_args, value) => {
                            const v = value;
                            return [{ type: 'text', text: `已向终端会话发送 ${v.sent ?? 0} 个字符` }];
                        },
                    },
                    async execute(args) {
                        const input = args;
                        if (typeof input.sid !== 'string' || input.sid === '')
                            throw new Error('sid 必须是非空字符串');
                        if (typeof input.data !== 'string' || input.data === '')
                            throw new Error('data 必须是非空字符串');
                        const session = sessions.get(input.sid);
                        if (session === undefined || session.closed)
                            throw new Error(`会话不存在或已退出: ${input.sid}`);
                        await session.handle.write(input.data);
                        return { ok: true, sent: input.data.length };
                    },
                })));
                stateRef.toolsRegistered = true;
                console.log('[dsh-tty] agent tools registered (tty_list, tty_capture, tty_send)');
                return () => {
                    stateRef.toolsRegistered = false;
                    for (const dispose of disposers) {
                        try {
                            dispose();
                        }
                        catch {
                            /* 工具已注销 */
                        }
                    }
                };
            }, 'dsh-tty: agent tools');
        }
        else {
            console.log('[dsh-tty] tools service unavailable; agent tools skipped');
        }
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