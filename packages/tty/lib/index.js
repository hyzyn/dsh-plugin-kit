import z from '@deepseek-ai/schemastery';
import { randomUUID } from 'node:crypto';
import { accessSync, constants as fsConstants, existsSync, readFileSync } from 'node:fs';
import { mkdir as fsMkdir, readdir as fsReaddir, rename as fsRename, rm as fsRm, stat as fsStat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { PassThrough } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { StringDecoder } from 'node:string_decoder';
import WebSocket, { WebSocketServer } from 'ws';
// @xterm/headless 是 CJS 包：ESM 具名导入在 Node 运行时会炸（Named export not
// found），必须默认导入后取 Terminal；类型用 InstanceType 别名保持同名可用
import xtermHeadless from '@xterm/headless';
const HeadlessTerminal = xtermHeadless.Terminal;
import { definePlugin } from '@hyzyn/dsh-kit';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { spawnSsh, sshTarget, expandHome } from './ssh.js';
import { buildShellSpawn } from './shell-integration.js';
import { parseSshConfig } from './ssh-config.js';
import { parseKnownHosts } from './known-hosts.js';
import { TunnelManager } from './tunnels.js';
import { SftpManager } from './sftp.js';
import { buildTmuxSpawnPlan, ensureTmuxAssets, killTmuxSession, probeTmux, sanitizePersistName } from './tmux.js';
const SSH_HOST_SCHEMA = z.object({
    name: z.string(),
    host: z.string(),
    port: z.natural().max(65535).default(22),
    username: z.string(),
    auth: z.union([z.const('agent'), z.const('key'), z.const('password')]).default('agent'),
    keyPath: z.string().default(''),
    passphrase: z.string().default(''),
    password: z.string().default(''),
    agentForward: z.boolean().default(false),
    /** 该条目的 SSH 标签默认以 tmux 持久会话打开（仅 persistence=tmux 时生效）。 */
    persist: z.boolean().default(false),
});
const HOST_KEY_SCHEMA = z.object({
    host: z.string(),
    port: z.natural().max(65535).default(22),
    fingerprint: z.string(),
});
const TUNNEL_SCHEMA = z.object({
    name: z.string(),
    bookName: z.string(),
    direction: z.union([z.const('local'), z.const('remote')]).default('local'),
    localPort: z.natural().max(65535).default(0),
    remoteHost: z.string().default(''),
    remotePort: z.natural().max(65535).default(0),
    localTargetHost: z.string().default(''),
    localTargetPort: z.natural().max(65535).default(0),
    enabled: z.boolean().default(true),
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
    reconnectGraceSec: z.natural().max(3600).default(120),
    sshHosts: z.array(SSH_HOST_SCHEMA).default([]),
    hostKeys: z.array(HOST_KEY_SCHEMA).default([]),
    tunnels: z.array(TUNNEL_SCHEMA).default([]),
    shellIntegration: z.boolean().default(true),
    sftpStyle: z.union([z.const('dialog'), z.const('dual')]).default('dialog'),
    persistence: z.union([z.const('off'), z.const('tmux')]).default('off'),
});
/* ------------------------------------------------------------------ *
 * 常量
 * ------------------------------------------------------------------ */
const WS_PATH = '/api/dsh-tty/ws';
const DEFAULT_MAX_SESSIONS = 4;
/** 断线保活默认秒数（reconnectGraceSec；0 = 旧行为，断开立即结束会话）。 */
const DEFAULT_RECONNECT_GRACE_SEC = 120;
/** 下行背压阈值（ws.bufferedAmount 字节）。 */
const BACKPRESSURE_HIGH = 512 * 1024;
const BACKPRESSURE_LOW = 128 * 1024;
const SID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const BUFFER_CAP = 256 * 1024;
/** TERM/COLORTERM 白名单：防止值里的引号破坏 -c 包装层命令（shellArgv 单引号包裹）。 */
const TERM_RE = /^[A-Za-z0-9_.+-]+$/;
/** 孤儿会话回收器的扫描间隔。 */
const REAPER_INTERVAL_MS = 10_000;
const TTY_GUIDANCE = '本机已安装 dsh-tty 插件（终端面板）：Web GUI 侧边栏的「终端」入口可打开交互终端（xterm.js + PTY），可运行任意命令与 TUI 程序（vim/htop 等），支持多标签页与断线自动重连（刷新页面/网络抖动后会话保活并恢复现场）；新标签默认在当前会话工作目录打开。标签栏「+」菜单还能开 SSH 标签页（ssh2 原生连接，连接簿在设置卡片维护，支持 agent forwarding 与主机指纹 TOFU 钉扎），像本地终端一样操作远程主机。开启「会话持久化（tmux）」后「+」菜单有「持久终端」：会话由 tmux server 托管，宿主重启/断线超时后重开标签即恢复现场，长任务建议放持久终端里跑。长驻进程（dev server、watch、交互式程序）应引导用户到终端面板里运行，不要在 bash 工具里挂起等待；用户提到「开个终端 / 在终端里跑 / SSH 到某台机器」时引导其打开该面板。agent 侧配套工具：tty_list 列出活跃终端会话（含 SSH 的 target 与实时 cwd），tty_capture 读取近期输出（默认清洗 ANSI；last:true 拿「上一条命令」的输出+退出码），tty_screen 读取当前可见屏幕（可读懂 vim/htop 等 TUI），tty_expect 用正则等待输出中的就绪信号（如 dev server URL、构建完成），tty_send 发送按键，tunnel_list 列出端口转发隧道状态——操作会实时显示在用户终端里。SFTP 文件传输：面板内可对 SSH 连接簿条目（或 SSH 连接对话框当前填写的信息）打开文件浏览（上传/下载/建目录/重命名/删除），agent 配套 sftp_list 列远程目录、sftp_tree 递归看目录结构、sftp_read 读远程文本文件（≤1MB）、sftp_write 写远程文本文件（≤1MB，可追加）、sftp_mkdir 建目录（parents 可逐级补齐）、sftp_rename 重命名/移动、sftp_remove 删除（目录需 recursive），book 参数为连接簿条目名。端口转发：连接簿条目可配本地/远程隧道（如把远程数据库映射到本地端口），宿主自动保活重连，用户提到「转发端口 / 访问远程库」时引导其到终端面板设置卡片配置。推荐流程：tty_send 启动长任务 → tty_expect 等就绪标记 → tty_capture{last:true} 拿结果。';
/** 本地 PTY 包装成 TermHandle（resize/kill 仍是透传 node-pty 的内部耦合；防御性降级）。 */
function wrapLocalPty(handle) {
    let resizeWarned = false;
    return {
        kind: 'local',
        pid: handle.pid,
        output: handle.output,
        done: handle.done,
        write: (data) => handle.write(data),
        resize: (cols, rows) => {
            try {
                handle.terminal?.resize?.(cols, rows);
            }
            catch (error) {
                // DSH 升级若改内部结构，降级为固定尺寸而不是每帧抛错
                if (!resizeWarned) {
                    resizeWarned = true;
                    console.warn('[dsh-tty] resize 透传失败（DSH 内部结构可能已变化，退化为固定尺寸）: ' + String(error?.message ?? error));
                }
            }
        },
        terminate: () => handle.terminate(),
        forceKill: () => {
            try {
                handle.terminal?.kill?.('SIGKILL');
            }
            catch {
                /* 已退出 */
            }
        },
    };
}
/** TERM/COLORTERM 值白名单校验：不合法回退 fallback（防止破坏 -c 包装层）。 */
function sanitizeTermValue(value, fallback) {
    const trimmed = value.trim();
    return TERM_RE.test(trimmed) ? trimmed : fallback;
}
/** 可热更新的运行时配置（settings/updated 动态应用）。 */
class LiveConfig {
    shell;
    term;
    colorTerm;
    cwd;
    /** 异常断开后会话保活毫秒数（0 = 立即结束）。 */
    reconnectGraceMs;
    sshHosts;
    hostKeys;
    /** 是否注入 OSC 133/7 shell 集成。 */
    shellIntegration;
    /** 端口转发隧道规格。 */
    tunnels;
    /** 会话持久化模式（off / tmux）。 */
    persistence;
    constructor(init) {
        this.shell = init.shell;
        this.term = sanitizeTermValue(init.term, 'xterm-256color');
        this.colorTerm = sanitizeTermValue(init.colorTerm, 'truecolor');
        this.cwd = init.cwd;
        this.reconnectGraceMs = Math.max(0, Math.min(3600, init.reconnectGraceSec)) * 1000;
        this.sshHosts = init.sshHosts ?? [];
        this.hostKeys = init.hostKeys ?? [];
        this.shellIntegration = init.shellIntegration;
        this.tunnels = init.tunnels ?? [];
        this.persistence = init.persistence === 'tmux' ? 'tmux' : 'off';
    }
    /** 合并部分更新；空字符串/undefined 保持原值；sshHosts/hostKeys/tunnels 传数组即整体替换。 */
    apply(partial) {
        if (typeof partial.shell === 'string' && partial.shell.trim() !== '')
            this.shell = partial.shell.trim();
        if (typeof partial.term === 'string' && partial.term.trim() !== '')
            this.term = sanitizeTermValue(partial.term, this.term);
        if (typeof partial.colorTerm === 'string' && partial.colorTerm.trim() !== '')
            this.colorTerm = sanitizeTermValue(partial.colorTerm, this.colorTerm);
        if (typeof partial.cwd === 'string' && partial.cwd.trim() !== '')
            this.cwd = partial.cwd.trim();
        if (typeof partial.reconnectGraceSec === 'number' && Number.isInteger(partial.reconnectGraceSec) && partial.reconnectGraceSec >= 0 && partial.reconnectGraceSec <= 3600) {
            this.reconnectGraceMs = partial.reconnectGraceSec * 1000;
        }
        if (Array.isArray(partial.sshHosts))
            this.sshHosts = partial.sshHosts;
        if (Array.isArray(partial.hostKeys))
            this.hostKeys = partial.hostKeys;
        if (typeof partial.shellIntegration === 'boolean')
            this.shellIntegration = partial.shellIntegration;
        if (Array.isArray(partial.tunnels))
            this.tunnels = partial.tunnels;
        if (partial.persistence === 'tmux' || partial.persistence === 'off')
            this.persistence = partial.persistence;
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
function send(ws, msg) {
    if (ws === null || ws.readyState !== WebSocket.OPEN)
        return;
    ws.send(JSON.stringify(msg));
}
/**
 * tty_capture 的默认清洗：剥离 OSC/CSI/杂项转义序列，并把同行内 \r 覆盖
 * 收敛为最后一次覆盖结果（进度条不再刷屏）。逐行近似，不追求完整 VT 语义
 * （要完整画面用 tty_screen / xterm-headless 虚拟屏）。
 */
function cleanAnsiTail(raw) {
    const withoutOsc = raw.replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '');
    const withoutCsi = withoutOsc.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '');
    const withoutEsc = withoutCsi.replace(/\x1b[@-Z\\-_]/g, '');
    // 先把「行尾 \r\n」（zsh 行结束常为 \r\r\n）归一成 \n，再按同行覆盖处理
    // 剩余孤立的 \r —— 否则回显/输出行会被误判为覆盖而整行抹掉
    const normalized = withoutEsc.replace(/\r+\n/g, '\n');
    return normalized.split('\n').map((line) => {
        const idx = line.lastIndexOf('\r');
        return idx === -1 ? line : line.slice(idx + 1);
    }).join('\n');
}
/** OSC 133 命令标记帧：\x1b]133;<A|B|D|T>[;<payload>](BEL|ST)。
 * T（0.10.0）= tmux 持久标签的 pane 内容快照（base64）：tmux 的 pane 重画是
 * 异步批量的，命令输出会落在 D 标记之后逃出 B..D 捕获窗口，故由钩子在发 D
 * 前 capture-pane 随流直送，宿主优先采用。 */
const OSC133_RE = /\x1b\]133;([ABDCT])(?:;([^\x07\x1b]*))?(?:\x07|\x1b\\)/g;
/** OSC 7 cwd 上报帧：\x1b]7;file://<host><path>(BEL|ST)。 */
const OSC7_RE = /\x1b\]7;([^\x07\x1b]*)(?:\x07|\x1b\\)/g;
/** 单条命令输出捕获上限（环形，超出丢头部）。 */
const COMMAND_CAP = 256 * 1024;
/** data 帧合并窗口（毫秒）：窗口内的 PTY chunk 合成一帧，显著降帧/降 CPU。 */
const FLUSH_INTERVAL_MS = 12;
/** 待发输出超过该字符数时跳过窗口立即冲刷（防超长输出无限延迟）。 */
const FLUSH_SIZE_CHARS = 64 * 1024;
function createShellState() {
    return { carry: '', inCommand: false, cmdBuffer: '', pendingT: null, lastCommand: null };
}
/** OSC 133;T 的 base64 payload → utf8 文本（无效输入返回 null）。 */
function decodeBase64Utf8(payload) {
    if (payload === undefined || payload === '')
        return null;
    const text = Buffer.from(payload, 'base64').toString('utf8');
    return text !== '' ? text : null;
}
/** OSC 7 body（file://host/path）→ 解码后的路径；解析失败返回 undefined。 */
function osc7Path(body) {
    try {
        const url = new URL(body);
        if (url.protocol !== 'file:')
            return undefined;
        const decoded = decodeURIComponent(url.pathname);
        return decoded !== '' ? decoded : undefined;
    }
    catch {
        return undefined;
    }
}
/**
 * 把一块输出喂进 shell 集成解析（cwd 跟随 + 命令边界捕获）。
 * 残包处理：尾部若有未闭合的 OSC 序列（lastIndexOf('\x1b]') 起无终结符），
 * 扣回 carry 等下一块拼齐；扣留部分不进命令捕获，避免半截序列混入。
 * 命令捕获按「标记之间的文本段」累积——B、输出、D 常在同一 chunk 到达，
 * 先处理段再翻转状态，才能把 B..D 之间的输出完整收进 lastCommand。
 */
function feedShellIntegration(session, text) {
    const state = session.shellState;
    let data = state.carry + text;
    state.carry = '';
    const lastOpen = data.lastIndexOf('\x1b]');
    if (lastOpen !== -1) {
        const tail = data.slice(lastOpen);
        if (!/\x07|\x1b\\/.test(tail)) {
            if (tail.length <= 64 * 1024) {
                state.carry = tail;
                data = data.slice(0, lastOpen);
            }
            // 超过 64KB 仍不闭合视为垃圾：放弃扣留，整块照常处理（上限容纳 T 快照）
        }
    }
    for (const match of data.matchAll(OSC7_RE)) {
        const path = osc7Path(match[1]);
        if (path !== undefined)
            session.cwd = path;
    }
    OSC133_RE.lastIndex = 0;
    let cursor = 0;
    for (const match of data.matchAll(OSC133_RE)) {
        const segment = data.slice(cursor, match.index).replace(OSC7_RE, '');
        if (state.inCommand && segment !== '') {
            state.cmdBuffer = (state.cmdBuffer + segment).slice(-COMMAND_CAP);
        }
        const kind = match[1];
        if (kind === 'B') {
            state.inCommand = true;
            state.cmdBuffer = '';
            state.pendingT = null;
        }
        else if (kind === 'T') {
            state.pendingT = decodeBase64Utf8(match[2]);
        }
        else if (kind === 'D') {
            if (state.inCommand) {
                const exitCode = match[2] !== undefined && /^\d+$/.test(match[2]) ? Number(match[2]) : null;
                state.lastCommand = {
                    output: (state.pendingT ?? state.cmdBuffer).slice(-COMMAND_CAP),
                    exitCode: exitCode !== null && Number.isFinite(exitCode) ? exitCode : null,
                    endedAt: Date.now(),
                };
                state.inCommand = false;
                state.cmdBuffer = '';
                state.pendingT = null;
            }
        }
        // A（prompt 开始）无需记录
        cursor = match.index + match[0].length;
    }
    if (state.inCommand) {
        const rest = data.slice(cursor).replace(OSC7_RE, '');
        if (rest !== '')
            state.cmdBuffer = (state.cmdBuffer + rest).slice(-COMMAND_CAP);
    }
}
/** 宽松清洗一份 tunnels 输入；输入不是数组时返回 undefined（表示「未提供，保持原值」）。 */
function sanitizeTunnels(input) {
    if (!Array.isArray(input))
        return undefined;
    const out = [];
    for (const item of input) {
        if (typeof item !== 'object' || item === null)
            continue;
        const raw = item;
        if (typeof raw.name !== 'string' || raw.name.trim() === '')
            continue;
        if (typeof raw.bookName !== 'string' || raw.bookName.trim() === '')
            continue;
        const num = (value) => {
            const n = Number(value);
            return Number.isInteger(n) && n >= 1 && n <= 65535 ? n : 0;
        };
        out.push({
            name: raw.name.trim(),
            bookName: raw.bookName.trim(),
            direction: raw.direction === 'remote' ? 'remote' : 'local',
            localPort: num(raw.localPort),
            remoteHost: typeof raw.remoteHost === 'string' ? raw.remoteHost.trim() : '',
            remotePort: num(raw.remotePort),
            localTargetHost: typeof raw.localTargetHost === 'string' ? raw.localTargetHost.trim() : '',
            localTargetPort: num(raw.localTargetPort),
            enabled: raw.enabled !== false,
        });
    }
    return out;
}
/** 严格校验 tunnels（HTTP POST 路径）；bookNames 为同次提交（或现有）的连接簿名字集合。 */
function validateTunnels(input, bookNames) {
    if (!Array.isArray(input))
        return { error: 'tunnels 必须是数组' };
    const names = new Set();
    for (const item of input) {
        if (typeof item !== 'object' || item === null)
            return { error: 'tunnels 条目必须是对象' };
        const raw = item;
        if (typeof raw.name !== 'string' || raw.name.trim() === '')
            return { error: 'tunnels.name 必须是非空字符串' };
        const name = raw.name.trim();
        if (names.has(name))
            return { error: `tunnels.name 重复: ${name}` };
        names.add(name);
        if (typeof raw.bookName !== 'string' || raw.bookName.trim() === '')
            return { error: `tunnels「${name}」bookName 必须是非空字符串` };
        if (!bookNames.has(raw.bookName.trim()))
            return { error: `tunnels「${name}」引用的连接簿条目不存在: ${String(raw.bookName)}` };
        const direction = raw.direction === 'remote' ? 'remote' : 'local';
        const intIn = (value) => {
            const n = Number(value);
            return Number.isInteger(n) && n >= 1 && n <= 65535 ? n : null;
        };
        if (direction === 'local') {
            if (intIn(raw.localPort) === null)
                return { error: `tunnels「${name}」local 方向需要 localPort（1~65535）` };
            if (typeof raw.remoteHost !== 'string' || raw.remoteHost.trim() === '')
                return { error: `tunnels「${name}」local 方向需要 remoteHost` };
            if (intIn(raw.remotePort) === null)
                return { error: `tunnels「${name}」local 方向需要 remotePort（1~65535）` };
        }
        else {
            if (intIn(raw.remotePort) === null)
                return { error: `tunnels「${name}」remote 方向需要 remotePort（服务端监听端口 1~65535）` };
            if (intIn(raw.localTargetPort) === null)
                return { error: `tunnels「${name}」remote 方向需要 localTargetPort（1~65535）` };
            if (raw.remoteHost !== undefined && typeof raw.remoteHost !== 'string')
                return { error: `tunnels「${name}」remoteHost 必须是字符串` };
            if (raw.localTargetHost !== undefined && typeof raw.localTargetHost !== 'string')
                return { error: `tunnels「${name}」localTargetHost 必须是字符串` };
        }
        if (raw.enabled !== undefined && typeof raw.enabled !== 'boolean')
            return { error: `tunnels「${name}」enabled 必须是布尔值` };
    }
    return { tunnels: sanitizeTunnels(input) };
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
            agentForward: raw.agentForward === true,
            persist: raw.persist === true,
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
        if (raw.agentForward !== undefined && typeof raw.agentForward !== 'boolean') {
            return { error: 'sshHosts.agentForward 必须是布尔值' };
        }
        if (raw.persist !== undefined && typeof raw.persist !== 'boolean') {
            return { error: 'sshHosts.persist 必须是布尔值' };
        }
        if ((raw.auth === 'key') && (typeof raw.keyPath !== 'string' || raw.keyPath.trim() === '')) {
            return { error: `sshHosts「${String(raw.name)}」auth=key 需要 keyPath` };
        }
    }
    return { hosts: sanitizeSshHosts(input) };
}
/** 宽松清洗一份 hostKeys 输入；输入不是数组时返回 undefined（表示「未提供，保持原值」）。 */
function sanitizeHostKeys(input) {
    if (!Array.isArray(input))
        return undefined;
    const out = [];
    for (const item of input) {
        if (typeof item !== 'object' || item === null)
            continue;
        const raw = item;
        if (typeof raw.host !== 'string' || raw.host.trim() === '')
            continue;
        if (typeof raw.fingerprint !== 'string' || raw.fingerprint.trim() === '' || raw.fingerprint.length > 256)
            continue;
        const port = Number(raw.port);
        out.push({
            host: raw.host.trim().toLowerCase(),
            port: Number.isInteger(port) && port >= 1 && port <= 65535 ? port : 22,
            fingerprint: raw.fingerprint.trim(),
        });
    }
    return out;
}
/** 严格校验一份 hostKeys 输入（HTTP POST 路径）；返回错误信息或清洗后的数组。 */
function validateHostKeys(input) {
    if (!Array.isArray(input))
        return { error: 'hostKeys 必须是数组' };
    const seen = new Set();
    for (const item of input) {
        if (typeof item !== 'object' || item === null)
            return { error: 'hostKeys 条目必须是对象' };
        const raw = item;
        if (typeof raw.host !== 'string' || raw.host.trim() === '')
            return { error: 'hostKeys.host 必须是非空字符串' };
        if (typeof raw.fingerprint !== 'string' || raw.fingerprint.trim() === '')
            return { error: 'hostKeys.fingerprint 必须是非空字符串' };
        const port = Number(raw.port ?? 22);
        if (!Number.isInteger(port) || port < 1 || port > 65535)
            return { error: 'hostKeys.port 必须是 1~65535 的整数' };
        const key = `${raw.host.trim().toLowerCase()}:${port}`;
        if (seen.has(key))
            return { error: `hostKeys 主机重复: ${key}` };
        seen.add(key);
    }
    return { keys: sanitizeHostKeys(input) };
}
/**
 * TOFU 主机指纹存储：get/record 面向 spawnSsh 的 hostVerifier；
 * record 时经 persist 回调写入 settings（宿主重启后钉扎仍在）。
 */
class HostKeyStore {
    live;
    persist;
    constructor(live, persist) {
        this.live = live;
        this.persist = persist;
    }
    key(host, port) {
        return `${host.trim().toLowerCase()}:${port}`;
    }
    get(host, port) {
        const key = this.key(host, port);
        return this.live.hostKeys.find((record) => `${record.host}:${record.port}` === key)?.fingerprint;
    }
    record(host, port, fingerprint) {
        const key = this.key(host, port);
        const next = this.live.hostKeys.filter((record) => `${record.host}:${record.port}` !== key);
        next.push({ host: host.trim().toLowerCase(), port, fingerprint });
        this.live.hostKeys = next;
        this.persist(next);
    }
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
    /** 会话的只读快照（SSH 会话无本地 pid，该字段省略；tmux 持久会话带 persist）。 */
    snapshotOf(session) {
        const base = {
            sid: session.id,
            cwd: session.cwd,
            kind: session.kind,
            target: session.target,
            startedAt: session.startedAt,
            lastOutputAt: session.lastOutputAt,
            ...(session.tmuxName !== null ? { persist: true } : {}),
        };
        return session.handle.pid === null ? base : { ...base, pid: session.handle.pid };
    }
    /** agent 工具用的只读快照。 */
    list() {
        return [...this.sessions.values()].map((session) => this.snapshotOf(session));
    }
    /** sessions 帧用：额外带 attachable（孤儿且未关闭的会话可被新连接 attach）。 */
    listForAttach() {
        return [...this.sessions.values()].map((session) => ({
            ...this.snapshotOf(session),
            attachable: session.ws === null && !session.closed,
        }));
    }
    /** 同步退役：移出全局表 + 释放虚拟屏（幂等，不杀进程）。 */
    retire(session) {
        session.closed = true;
        this.sessions.delete(session.id);
        try {
            session.screen?.dispose();
        }
        catch {
            /* 已释放 */
        }
    }
    /** 释放并销毁会话：退役 + 树级终止（等待 terminate 完成，最慢 ~20s）。 */
    async destroy(session) {
        this.retire(session);
        await forceKill(session.handle);
    }
    /** 回收超过保活期的孤儿会话（回收器定时调用；graceMs<=0 时不动作）。 */
    async reapOrphans(graceMs) {
        if (graceMs <= 0)
            return;
        const now = Date.now();
        for (const session of [...this.sessions.values()]) {
            if (session.orphanedAt !== null && now - session.orphanedAt >= graceMs) {
                void this.destroy(session); // 后台收尾：terminate 最慢可达 ~20s，不阻塞回收器
            }
        }
    }
    async disposeAll() {
        const all = [...this.sessions.values()];
        this.sessions.clear();
        await Promise.all(all.map((session) => {
            session.closed = true;
            try {
                session.screen?.dispose();
            }
            catch {
                /* 已释放 */
            }
            return forceKill(session.handle);
        }));
    }
}
/* ------------------------------------------------------------------ *
 * WebSocket 连接处理
 * ------------------------------------------------------------------ */
class TtyServer {
    ctx;
    sessions;
    options;
    hostKeyStore;
    wss = new WebSocketServer({ noServer: true });
    constructor(ctx, sessions, options, hostKeyStore) {
        this.ctx = ctx;
        this.sessions = sessions;
        this.options = options;
        this.hostKeyStore = hostKeyStore;
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
                if (session.closed)
                    return;
                if (this.options.reconnectGraceMs > 0) {
                    // 客户端正常关面板会先逐个 kill（会话已移出 local），走到这里的都是
                    // 「异常断开仍有存活会话」：转孤儿保活，等待新连接 attach，到点由回收器清理
                    this.flushPendingOutput(session); // 没了收件人，待发帧直接丢弃（回放走环形缓冲）
                    session.ws = null;
                    session.orphanedAt = Date.now();
                    return;
                }
                this.flushPendingOutput(session);
                this.killSessionNow(session);
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
    /**
     * 立即终止会话：同步退役 + 顶层 shell 直接 SIGKILL，让 done/exit 帧立刻可发；
     * 树级子进程清理（SIGTERM→grace→SIGKILL，交互式 zsh 忽略 SIGTERM 时最慢
     * 可拖 ~20s）由 terminate 在后台继续收尾，不阻塞 kill 帧处理。
     * tmux 背书会话先向 tmux server 发 kill-session（杀客户端只会 detach，
     * 会话会留在 tmux server 上）；2.5s 兜底 forceKill 防收尾悬挂。
     */
    killSessionNow(session) {
        this.sessions.retire(session);
        const teardown = session.handle.tmuxTeardown;
        if (teardown !== undefined) {
            let settled = false;
            const finish = () => {
                if (settled)
                    return;
                settled = true;
                void forceKill(session.handle);
            };
            const timer = setTimeout(finish, 2500);
            timer.unref?.();
            void teardown().catch(() => { }).then(finish);
            return;
        }
        try {
            session.handle.forceKill?.();
        }
        catch {
            /* 已退出 */
        }
        void forceKill(session.handle);
    }
    /** 每会话一块虚拟屏（xterm-headless）：tty_screen 的数据源；失败降级为 null。 */
    createScreen(cols, rows) {
        try {
            // buffer 命名空间在 xterm 5.x 是提案 API，必须开 allowProposedApi
            return new HeadlessTerminal({ cols, rows, scrollback: 0, allowProposedApi: true });
        }
        catch {
            return null;
        }
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
                // 持久化（0.10.0）：配置 persistence=tmux 且帧带 persist 时，spawn 包装层
                // 换成 `exec tmux -L dsh-tty -A -s <名>`（tmux 托管）；tmux 未安装则降级
                // 普通会话并回灰字提示。持久名稳定（客户端生成、随标签规格保存），
                // 宿主重启后重开标签按同名 attach 回原 tmux 会话
                const wantsPersist = msg.persist === true && this.options.persistence === 'tmux';
                let spawnPlan = buildShellSpawn(this.options.shell, this.options.term, this.options.colorTerm, this.options.shellIntegration);
                let tmuxName = null;
                if (wantsPersist) {
                    const probe = await probeTmux();
                    if (probe.available) {
                        tmuxName = sanitizePersistName(msg.persistName, sid);
                        ensureTmuxAssets({ shell: this.options.shell, colorTerm: this.options.colorTerm, shellIntegration: this.options.shellIntegration, passthrough: probe.passthrough });
                        spawnPlan = buildTmuxSpawnPlan({ shell: this.options.shell, term: this.options.term, colorTerm: this.options.colorTerm, tmuxName });
                    }
                }
                const handle = wrapLocalPty(await subprocess.spawnTerminal({
                    argv: spawnPlan.argv,
                    rows: Number(msg.rows) || 24,
                    cols: Number(msg.cols) || 80,
                    cwd,
                    env: { TERM: this.options.term, COLORTERM: this.options.colorTerm, ...spawnPlan.env },
                    graceMs: 5000,
                }));
                if (tmuxName !== null)
                    handle.tmuxTeardown = () => killTmuxSession(tmuxName);
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
                    decoder: new StringDecoder('utf8'),
                    screen: this.createScreen(Number(msg.cols) || 80, Number(msg.rows) || 24),
                    orphanedAt: null,
                    shellState: createShellState(),
                    pendingOutput: '',
                    flushTimer: null,
                    tmuxName,
                };
                local.set(sid, next);
                this.sessions.add(next);
                send(ws, { t: 'ready', sid, pid: handle.pid, kind: 'local', ...(tmuxName !== null ? { persist: true } : {}) });
                if (wantsPersist && tmuxName === null) {
                    const notice = '\x1b[2m[dsh-tty] 未检测到 tmux，本标签以普通会话运行；安装 tmux 后新开的「持久终端」可跨宿主重启恢复现场\x1b[0m\r\n';
                    next.buffer = (next.buffer + notice).slice(-BUFFER_CAP);
                    send(ws, { t: 'data', sid, d: notice });
                }
                this.attachOutput(next);
                this.watchDone(next, local);
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
                // name 引用连接簿条目作基底，内联字段可逐项覆盖（与 SFTP 路由共用 mergeSshSpec）
                const merged = mergeSshSpec((name) => this.options.findSshHost(name), msg.name, msg);
                if (merged.error !== undefined || merged.spec === undefined) {
                    send(ws, { t: 'error', sid, m: merged.error ?? 'SSH 连接参数缺失' });
                    return;
                }
                const spec = merged.spec;
                const target = sshTarget(spec);
                send(ws, { t: 'data', sid, d: `\x1b[2mConnecting ${target} …\x1b[0m\r\n` });
                // 持久化（0.10.0）：远程 `exec tmux new-session -A` 托管；远程无 tmux 时
                // spawnSsh 降级普通 shell channel 并经 startupNotice 回灰字提示
                const wantsPersist = msg.persist === true && this.options.persistence === 'tmux';
                const persistOpt = wantsPersist ? { name: sanitizePersistName(msg.persistName, sid) } : undefined;
                let handle;
                try {
                    handle = await spawnSsh(spec, {
                        term: this.options.term,
                        cols: Number(msg.cols) || 80,
                        rows: Number(msg.rows) || 24,
                        logger: { info: (m) => this.ctx.logger.info(m), warn: (m) => this.ctx.logger.warn(m) },
                        hostKeyStore: this.hostKeyStore,
                        ...(persistOpt !== undefined ? { persist: persistOpt } : {}),
                    });
                }
                catch (error) {
                    send(ws, { t: 'error', sid, m: error instanceof Error ? error.message : String(error) });
                    return;
                }
                const tmuxName = persistOpt !== undefined && handle.startupNotice === undefined ? persistOpt.name : null;
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
                    decoder: new StringDecoder('utf8'),
                    screen: this.createScreen(Number(msg.cols) || 80, Number(msg.rows) || 24),
                    orphanedAt: null,
                    shellState: createShellState(),
                    pendingOutput: '',
                    flushTimer: null,
                    tmuxName,
                };
                local.set(sid, next);
                this.sessions.add(next);
                send(ws, { t: 'ready', sid, pid: null, kind: 'ssh', target, ...(tmuxName !== null ? { persist: true } : {}) });
                if (handle.startupNotice !== undefined) {
                    const notice = `\x1b[2m[dsh-tty] ${handle.startupNotice}\x1b[0m\r\n`;
                    next.buffer = (next.buffer + notice).slice(-BUFFER_CAP);
                    send(ws, { t: 'data', sid, d: notice });
                }
                this.attachOutput(next);
                this.watchDone(next, local);
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
                    const cols = Number(msg.cols) || 80;
                    const rows = Number(msg.rows) || 24;
                    session.handle.resize(cols, rows);
                    try {
                        session.screen?.resize(cols, rows);
                    }
                    catch {
                        /* 非法尺寸或已释放 */
                    }
                }
            }
            else if (msg.t === 'kill') {
                const resolved = this.resolveSid(ws, msg, local);
                if (resolved === undefined)
                    return;
                if ('unknown' in resolved) {
                    // 本连接没有该 sid：若是孤儿会话（前连接已断）也允许 kill，
                    // 避免「关闭面板杀不掉孤儿」泄漏到保活期结束
                    const orphan = this.sessions.get(String(msg.sid ?? ''));
                    if (orphan !== undefined && !orphan.closed) {
                        this.flushPendingOutput(orphan);
                        this.killSessionNow(orphan);
                    }
                    return;
                }
                const session = local.get(resolved.sid);
                if (session === undefined)
                    return;
                local.delete(resolved.sid);
                this.killSessionNow(session);
            }
            else if (msg.t === 'sessions') {
                send(ws, { t: 'sessions', list: this.sessions.listForAttach() });
            }
            else if (msg.t === 'attach') {
                const raw = msg.sid;
                if (typeof raw !== 'string' || raw === '' || !SID_RE.test(raw)) {
                    send(ws, { t: 'error', m: 'attach 需要合法 sid' });
                    return;
                }
                const session = this.sessions.get(raw);
                if (session === undefined || session.closed) {
                    send(ws, { t: 'error', sid: raw, m: `会话不存在或已结束: ${raw}` });
                    return;
                }
                if (session.ws !== null) {
                    send(ws, { t: 'error', sid: raw, m: '会话已连接到其它窗口' });
                    return;
                }
                // 重新绑定到本连接：解孤儿态，恢复被背压暂停的输出流
                session.ws = ws;
                session.orphanedAt = null;
                local.set(session.id, session);
                if (session.paused) {
                    session.paused = false;
                    try {
                        session.handle.output.resume();
                    }
                    catch {
                        /* 已退出 */
                    }
                }
                send(ws, { t: 'ready', sid: session.id, pid: session.handle.pid, kind: session.kind, target: session.target !== '' ? session.target : undefined, reattached: true, ...(session.tmuxName !== null ? { persist: true } : {}) });
                // 断线期间的输出经 256KB 环形缓冲回放（缓冲为空则跳过）
                if (session.buffer !== '')
                    send(ws, { t: 'data', sid: session.id, d: session.buffer });
            }
        }
        catch (error) {
            send(ws, { t: 'error', m: error instanceof Error ? error.message : String(error) });
        }
    }
    /** 会话退出事实 → exit 帧（恰好一次；本地 PTY 与 SSH 共用）。 */
    watchDone(session, local) {
        session.handle.done.then((outcome) => {
            // kill 主动关闭时会话可能已被移出 local，用 exitSent 保证 exit 帧恰好一次；
            // 发送走 session.ws 动态取值——attach 换连接后 exit 也能跟着新连接走
            if (session.exitSent === true)
                return;
            session.exitSent = true;
            session.closed = true;
            local.delete(session.id);
            this.sessions.remove(session.id);
            try {
                session.screen?.dispose();
            }
            catch {
                /* 已释放 */
            }
            this.flushPendingOutput(session); // exit 前冲掉合并窗口里的尾巴，保序
            send(session.ws, { t: 'exit', sid: session.id, code: outcome.exitCode, signal: outcome.signal });
        }).catch(() => { });
    }
    /** 输出下行 + 基于 ws.bufferedAmount 的背压（暂停/恢复 PassThrough）。 */
    attachOutput(session) {
        const output = session.handle.output;
        const flush = () => {
            session.flushTimer = null;
            const ws = session.ws;
            const pending = session.pendingOutput;
            if (session.closed || ws === null || pending === '')
                return;
            session.pendingOutput = '';
            ws.send(JSON.stringify({ t: 'data', sid: session.id, d: pending }), () => {
                if (session.paused && ws.bufferedAmount < BACKPRESSURE_LOW && output.readableFlowing === false) {
                    output.resume();
                }
            });
            if (!session.paused && ws.bufferedAmount > BACKPRESSURE_HIGH) {
                session.paused = true;
                output.pause();
            }
        };
        const onData = (chunk) => {
            if (session.closed)
                return;
            // StringDecoder 兜跨 chunk 多字节序列，再喂 shell 集成解析与虚拟屏
            const text = session.decoder.write(chunk);
            session.lastOutputAt = Date.now();
            session.buffer = (session.buffer + text).slice(-BUFFER_CAP);
            feedShellIntegration(session, text);
            try {
                session.screen?.write(text);
            }
            catch {
                /* 虚拟屏异常不阻断输出链路 */
            }
            const ws = session.ws;
            if (ws === null)
                return; // 孤儿会话：仅积累缓冲，等待重连 attach 回放
            // data 帧合并：窗口内攒批，超阈值立即冲刷；exit/kill 前会强制 flush 保序
            session.pendingOutput += text;
            if (session.pendingOutput.length >= FLUSH_SIZE_CHARS) {
                if (session.flushTimer !== null) {
                    clearTimeout(session.flushTimer);
                    session.flushTimer = null;
                }
                flush();
            }
            else if (session.flushTimer === null) {
                const timer = setTimeout(flush, FLUSH_INTERVAL_MS);
                timer.unref?.();
                session.flushTimer = timer;
            }
        };
        output.on('data', onData);
    }
    /** 立即冲刷待发的合并输出（exit/kill 前调用，保证 exit 帧永远在最后一帧 data 之后）。 */
    flushPendingOutput(session) {
        if (session.flushTimer !== null) {
            clearTimeout(session.flushTimer);
            session.flushTimer = null;
        }
        const ws = session.ws;
        const pending = session.pendingOutput;
        session.pendingOutput = '';
        if (session.closed || ws === null || pending === '')
            return;
        send(ws, { t: 'data', sid: session.id, d: pending });
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
/**
 * env 插件托管变量名（~/.dsh/env.yml 托管区块内的 key，路径解析与 env 插件
 * 一致：DSH_ENV_FILE / DSH_HOME 优先）。只提取键名、绝不读值——这些是用户
 * 明确交给 dsh-env-manager 托管的变量，才是 env:VAR 引用的推荐来源；键行由
 * env 插件以 yaml 数组渲染（`- key: NAME`），逐行宽容提取即可，不引 YAML 依赖。
 */
function readManagedEnvKeys() {
    const dshHome = process.env.DSH_HOME?.trim() || join(homedir(), '.dsh');
    const file = process.env.DSH_ENV_FILE?.trim() || join(dshHome, 'env.yml');
    try {
        const lines = readFileSync(file, 'utf8').split('\n');
        const start = lines.findIndex((line) => line.includes('dsh-env-manager managed'));
        if (start === -1)
            return [];
        const end = lines.findIndex((line, index) => index > start && line.includes('end dsh-env-manager managed'));
        if (end === -1)
            return [];
        const keys = [];
        for (const line of lines.slice(start + 1, end)) {
            const match = line.match(/^\s*-\s*key:\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1\s*$/);
            if (match !== null)
                keys.push(match[2]);
        }
        return [...new Set(keys)].sort().slice(0, 200);
    }
    catch {
        return [];
    }
}
/**
 * 设置卡片「Shell 路径」候选（可选可输入的数据源）：/etc/shells + $SHELL +
 * 常见安装路径，去重后过滤「存在且可执行」，$SHELL 排最前。只回路径，
 * 不做任何执行。
 */
function listCandidateShells() {
    const candidates = [];
    const push = (value) => {
        const path = value?.trim() ?? '';
        if (path !== '' && !candidates.includes(path))
            candidates.push(path);
    };
    try {
        for (const line of readFileSync('/etc/shells', 'utf8').split('\n')) {
            const path = line.trim();
            if (path !== '' && !path.startsWith('#'))
                push(path);
        }
    }
    catch {
        /* 无 /etc/shells（如 Windows）时跳过 */
    }
    push(process.env.SHELL);
    for (const path of [
        '/bin/zsh', '/usr/bin/zsh', '/usr/local/bin/zsh', '/opt/homebrew/bin/zsh',
        '/bin/bash', '/usr/bin/bash', '/usr/local/bin/bash', '/opt/homebrew/bin/bash',
        '/bin/fish', '/usr/bin/fish', '/usr/local/bin/fish', '/opt/homebrew/bin/fish',
        '/bin/sh', '/bin/dash', '/bin/ksh', '/bin/tcsh', '/bin/csh',
    ])
        push(path);
    const usable = candidates.filter((path) => {
        try {
            accessSync(path, fsConstants.X_OK);
            return true;
        }
        catch {
            return false;
        }
    });
    const shell = process.env.SHELL?.trim() ?? '';
    usable.sort((a, b) => (a === shell ? -1 : b === shell ? 1 : a.localeCompare(b)));
    return usable;
}
/**
 * 「连接簿条目作基底 + 内联字段逐项覆盖」的共享解析（WS ssh 帧与 SFTP 路由共用）。
 * name 指向连接簿缺失条目、或解析结果缺 host/username 时返回 error。
 */
function mergeSshSpec(findSshHost, name, inline) {
    const profile = typeof name === 'string' && name !== '' ? findSshHost(name) : undefined;
    if (typeof name === 'string' && name !== '' && profile === undefined)
        return { error: `连接簿中不存在: ${name}` };
    const spec = {
        host: typeof inline.host === 'string' && inline.host.trim() !== '' ? inline.host.trim() : profile?.host ?? '',
        port: Number(inline.port) || profile?.port || 22,
        username: typeof inline.username === 'string' && inline.username.trim() !== '' ? inline.username.trim() : profile?.username ?? '',
        auth: inline.auth === 'key' || inline.auth === 'password' || inline.auth === 'agent' ? inline.auth : profile?.auth ?? 'agent',
        keyPath: typeof inline.keyPath === 'string' && inline.keyPath !== '' ? inline.keyPath : profile?.keyPath,
        passphrase: typeof inline.passphrase === 'string' && inline.passphrase !== '' ? inline.passphrase : profile?.passphrase,
        password: typeof inline.password === 'string' && inline.password !== '' ? inline.password : profile?.password,
        agentForward: typeof inline.agentForward === 'boolean' ? inline.agentForward : profile?.agentForward ?? false,
    };
    if (spec.host === '' || spec.username === '')
        return { error: 'SSH 会话需要 host 与 username（或用 name 引用连接簿）' };
    return { spec };
}
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
/** 下载响应的 content-disposition：ASCII 兜底 + RFC 5987 UTF-8 扩展（非 ASCII 文件名）。 */
function contentDispositionValue(name) {
    const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
    return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}
/** 远程路径取末段（下载文件名展示用）；空串/根路径退化为 'download'。 */
function remoteBasename(path) {
    const trimmed = path.trim().replace(/\/+$/, '');
    const index = trimmed.lastIndexOf('/');
    const base = index >= 0 ? trimmed.slice(index + 1) : trimmed;
    return base === '' ? 'download' : base;
}
/** 人类可读文件大小（sftp_list render 用）。 */
function humanFileSize(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0)
        return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let value = bytes;
    let index = 0;
    while (value >= 1024 && index < units.length - 1) {
        value /= 1024;
        index += 1;
    }
    return `${value >= 100 || index === 0 ? Math.round(value) : Math.round(value * 10) / 10} ${units[index]}`;
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
/**
 * 本机目录列表（/api/dsh-tty/local-fs/list）：path 空 = 用户 home，返回实际
 * 绝对路径。stat 失败的条目（悬空符号链接等）按 size/mtime = 0 占位仍列出。
 */
async function listLocalDir(rawPath) {
    const root = rawPath !== '' ? expandHome(rawPath) : homedir();
    const resolved = resolve(root);
    const dirents = await fsReaddir(resolved, { withFileTypes: true });
    const entries = [];
    for (const dirent of dirents) {
        let isDir = dirent.isDirectory();
        let isFile = dirent.isFile();
        let size = 0;
        let mtime = 0;
        try {
            const stats = await fsStat(join(resolved, dirent.name));
            isDir = stats.isDirectory();
            isFile = stats.isFile();
            size = Number(stats.size ?? 0);
            mtime = Number(stats.mtimeMs ?? 0);
        }
        catch {
            /* stat 失败：保留 dirent 类型判断，占位展示 */
        }
        entries.push({ name: dirent.name, isDir, isFile, isSymlink: dirent.isSymbolicLink(), size, mtime });
    }
    return { path: resolved, entries };
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
            reconnectGraceSec: typeof config?.reconnectGraceSec === 'number' && Number.isInteger(config.reconnectGraceSec) && config.reconnectGraceSec >= 0 ? config.reconnectGraceSec : DEFAULT_RECONNECT_GRACE_SEC,
            sshHosts: Array.isArray(config?.sshHosts) ? config.sshHosts : [],
            hostKeys: Array.isArray(config?.hostKeys) ? config.hostKeys : [],
            shellIntegration: config?.shellIntegration !== false,
            tunnels: Array.isArray(config?.tunnels) ? config.tunnels : [],
            persistence: config?.persistence === 'tmux' ? 'tmux' : 'off',
        });
        const sessions = new SessionManager(config?.maxSessions ?? DEFAULT_MAX_SESSIONS);
        /** TOFU 指纹记录持久化：写入 settings 命名空间（合并语义），失败不影响连接。 */
        const persistHostKeys = (records) => {
            const scope = settingsScope;
            if (scope === undefined)
                return;
            void Promise.resolve(scope.update({ hostKeys: records })).catch((error) => {
                console.warn('[dsh-tty] 主机密钥记录持久化失败: ' + (error instanceof Error ? error.message : String(error)));
            });
        };
        const hostKeyStore = new HostKeyStore(live, persistHostKeys);
        const tunnelManager = new TunnelManager({ info: (m) => ctx.logger.info(m), warn: (m) => ctx.logger.warn(m) }, hostKeyStore, (bookName) => live.findSshHost(bookName));
        // SFTP 文件传输：懒连接池 + TOFU 同源（见 src/sftp.ts）；spec 由各请求携带
        // （连接簿名或内联字段），连接簿凭证热改后天然生效
        const sftpManager = new SftpManager({ info: (m) => ctx.logger.info(m), warn: (m) => ctx.logger.warn(m) }, hostKeyStore);
        const server = new TtyServer(ctx, sessions, live, hostKeyStore);
        const stateRef = { enabled: true, announceToAgent: config?.announceToAgent !== false, toolsRegistered: false, sftpStyle: config?.sftpStyle === 'dual' ? 'dual' : 'dialog' };
        let settingsScope;
        const snapshot = () => ({
            enabled: stateRef.enabled,
            announceToAgent: stateRef.announceToAgent,
            maxSessions: sessions.limitValue,
            shell: live.shell,
            term: live.term,
            colorTerm: live.colorTerm,
            cwd: live.cwd,
            reconnectGraceSec: Math.round(live.reconnectGraceMs / 1000),
            sshHosts: live.sshHosts,
            hostKeys: live.hostKeys,
            tunnels: live.tunnels,
            shellIntegration: live.shellIntegration,
            sftpStyle: stateRef.sftpStyle,
            persistence: live.persistence,
            toolsRegistered: stateRef.toolsRegistered,
        });
        /** 规范化并应用一份配置补丁（settings/updated 事件与 HTTP POST 共用；幂等）。 */
        const applyPatch = (section) => {
            live.apply({
                shell: typeof section.shell === 'string' ? section.shell : undefined,
                term: typeof section.term === 'string' ? section.term : undefined,
                colorTerm: typeof section.colorTerm === 'string' ? section.colorTerm : undefined,
                cwd: typeof section.cwd === 'string' ? section.cwd : undefined,
                reconnectGraceSec: typeof section.reconnectGraceSec === 'number' ? section.reconnectGraceSec : undefined,
                sshHosts: sanitizeSshHosts(section.sshHosts),
                hostKeys: sanitizeHostKeys(section.hostKeys),
                shellIntegration: typeof section.shellIntegration === 'boolean' ? section.shellIntegration : undefined,
                tunnels: sanitizeTunnels(section.tunnels),
                persistence: section.persistence === 'tmux' || section.persistence === 'off' ? section.persistence : undefined,
            });
            // 隧道按最新规格对齐（幂等；sshHosts 变更也会触发，让重连取到新凭证）
            tunnelManager.reconcile(live.tunnels);
            if (typeof section.maxSessions === 'number' && Number.isInteger(section.maxSessions) && section.maxSessions >= 1 && section.maxSessions <= 16) {
                sessions.setLimit(section.maxSessions);
            }
            if (typeof section.enabled === 'boolean')
                stateRef.enabled = section.enabled;
            if (typeof section.announceToAgent === 'boolean')
                stateRef.announceToAgent = section.announceToAgent;
            if (section.sftpStyle === 'dialog' || section.sftpStyle === 'dual')
                stateRef.sftpStyle = section.sftpStyle;
            console.log(`[dsh-tty] config applied (shell=${live.shell}, term=${live.term}, cwd=${live.cwd}, maxSessions=${sessions.limitValue}, sshHosts=${live.sshHosts.length})`);
        };
        /** 校验 HTTP POST 的配置体；返回规范化补丁或错误信息。 */
        const normalizePatch = (input) => {
            const patch = {};
            const known = new Set(['enabled', 'announceToAgent', 'maxSessions', 'shell', 'term', 'colorTerm', 'cwd', 'reconnectGraceSec', 'sshHosts', 'hostKeys', 'tunnels', 'shellIntegration', 'sftpStyle', 'persistence']);
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
            if (input.reconnectGraceSec !== undefined) {
                const value = Number(input.reconnectGraceSec);
                if (!Number.isInteger(value) || value < 0 || value > 3600)
                    return { error: 'reconnectGraceSec 必须是 0~3600 的整数' };
                patch.reconnectGraceSec = value;
            }
            if (input.shellIntegration !== undefined) {
                if (typeof input.shellIntegration !== 'boolean')
                    return { error: 'shellIntegration 必须是布尔值' };
                patch.shellIntegration = input.shellIntegration;
            }
            if (input.sftpStyle !== undefined) {
                if (input.sftpStyle !== 'dialog' && input.sftpStyle !== 'dual')
                    return { error: 'sftpStyle 必须是 dialog 或 dual' };
                patch.sftpStyle = input.sftpStyle;
            }
            if (input.persistence !== undefined) {
                if (input.persistence !== 'off' && input.persistence !== 'tmux')
                    return { error: 'persistence 必须是 off 或 tmux' };
                patch.persistence = input.persistence;
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
            if (input.hostKeys !== undefined) {
                const validated = validateHostKeys(input.hostKeys);
                if (validated.error !== undefined)
                    return { error: validated.error };
                patch.hostKeys = validated.keys;
            }
            if (input.tunnels !== undefined) {
                // bookName 交叉校验：优先用同次提交的 sshHosts（整体替换语义），否则用现有连接簿
                const bookSource = Array.isArray(patch.sshHosts) ? patch.sshHosts : live.sshHosts;
                const bookNames = new Set(bookSource.map((host) => host.name));
                const validated = validateTunnels(input.tunnels, bookNames);
                if (validated.error !== undefined)
                    return { error: validated.error };
                patch.tunnels = validated.tunnels;
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
                // ~/.ssh/config 导入候选（连接簿）：loopback 围栏，只回解析结果不落盘
                disposers.push(webServer.register({
                    kind: 'exact',
                    path: '/api/dsh-tty/ssh-config',
                    handler: async (req, res) => {
                        if (!isLoopbackHttp(req)) {
                            writeJson(res, 403, { error: 'forbidden: loopback-only' });
                            return;
                        }
                        if (req.method !== 'GET') {
                            writeJson(res, 405, { error: 'method not allowed: ' + String(req.method) });
                            return;
                        }
                        try {
                            const text = readFileSync(expandHome('~/.ssh/config'), 'utf8');
                            writeJson(res, 200, { ok: true, entries: parseSshConfig(text) });
                        }
                        catch (error) {
                            writeJson(res, 200, { ok: false, error: '无法读取 ~/.ssh/config: ' + (error instanceof Error ? error.message : String(error)) });
                        }
                    },
                }));
                // env:VAR 下拉数据源（SSH 对话框）：只回 env 插件托管变量名，绝不含值
                disposers.push(webServer.register({
                    kind: 'exact',
                    path: '/api/dsh-tty/env-vars',
                    handler: async (req, res) => {
                        if (!isLoopbackHttp(req)) {
                            writeJson(res, 403, { error: 'forbidden: loopback-only' });
                            return;
                        }
                        if (req.method !== 'GET') {
                            writeJson(res, 405, { error: 'method not allowed: ' + String(req.method) });
                            return;
                        }
                        writeJson(res, 200, { ok: true, names: readManagedEnvKeys() });
                    },
                }));
                // known_hosts 指纹导入候选（TOFU 预填充）：hashed 条目用连接簿主机名还原
                disposers.push(webServer.register({
                    kind: 'exact',
                    path: '/api/dsh-tty/known-hosts',
                    handler: async (req, res) => {
                        if (!isLoopbackHttp(req)) {
                            writeJson(res, 403, { error: 'forbidden: loopback-only' });
                            return;
                        }
                        if (req.method !== 'GET') {
                            writeJson(res, 405, { error: 'method not allowed: ' + String(req.method) });
                            return;
                        }
                        try {
                            const text = readFileSync(expandHome('~/.ssh/known_hosts'), 'utf8');
                            const candidates = live.sshHosts.flatMap((entry) => [entry.host, `[${entry.host}]:${entry.port}`]);
                            writeJson(res, 200, { ok: true, entries: parseKnownHosts(text, candidates) });
                        }
                        catch (error) {
                            writeJson(res, 200, { ok: false, error: '无法读取 ~/.ssh/known_hosts: ' + (error instanceof Error ? error.message : String(error)) });
                        }
                    },
                }));
                // 已安装 shell 候选（设置卡片「Shell 路径」可选可输入）：loopback 围栏，只回路径不执行
                disposers.push(webServer.register({
                    kind: 'exact',
                    path: '/api/dsh-tty/shells',
                    handler: async (req, res) => {
                        if (!isLoopbackHttp(req)) {
                            writeJson(res, 403, { error: 'forbidden: loopback-only' });
                            return;
                        }
                        if (req.method !== 'GET') {
                            writeJson(res, 405, { error: 'method not allowed: ' + String(req.method) });
                            return;
                        }
                        writeJson(res, 200, { ok: true, shells: listCandidateShells(), current: process.env.SHELL ?? '' });
                    },
                }));
                // 端口转发隧道实时状态（设置卡片轮询徽标 + tunnel_list 工具数据源）
                disposers.push(webServer.register({
                    kind: 'exact',
                    path: '/api/dsh-tty/tunnels',
                    handler: async (req, res) => {
                        if (!isLoopbackHttp(req)) {
                            writeJson(res, 403, { error: 'forbidden: loopback-only' });
                            return;
                        }
                        if (req.method !== 'GET') {
                            writeJson(res, 405, { error: 'method not allowed: ' + String(req.method) });
                            return;
                        }
                        writeJson(res, 200, { ok: true, tunnels: tunnelManager.list() });
                    },
                }));
                // SFTP 文件传输（0.7.0，src/sftp.ts）：loopback 围栏；spec 解析与 WS ssh
                // 帧同款（mergeSshSpec：连接簿条目作基底 + 内联字段覆盖）。list/mkdir/
                // rename/remove/download 走 JSON 体（凭证不进 URL/查询串）；download 响应
                // 为文件字节流（stat 成功时带 content-length）；upload 以 x-dsh-sftp-meta
                // 头携带 base64url(JSON)（spec + path + append），请求体即原始文件字节，
                // pipeline 直灌 SFTP 写流——上传下载都不整文件进内存。
                disposers.push(webServer.register({
                    kind: 'prefix',
                    path: '/api/dsh-tty/sftp',
                    handler: async (req, res) => {
                        if (!isLoopbackHttp(req)) {
                            writeJson(res, 403, { error: 'forbidden: loopback-only' });
                            return;
                        }
                        const sub = new URL(req.url ?? '/', 'http://loopback').pathname.slice('/api/dsh-tty/sftp'.length);
                        const jsonAction = ['/list', '/mkdir', '/rename', '/remove', '/download'].find((action) => action === sub);
                        if (jsonAction !== undefined) {
                            if (req.method !== 'POST') {
                                writeJson(res, 405, { error: 'method not allowed: ' + String(req.method) });
                                return;
                            }
                            const body = await readJsonBody(req);
                            if (body === undefined) {
                                writeJson(res, 400, { error: 'invalid JSON body' });
                                return;
                            }
                            const parsed = mergeSshSpec((name) => live.findSshHost(name), body.name, body);
                            if (parsed.spec === undefined) {
                                writeJson(res, 400, { error: parsed.error ?? '无效的 SSH 连接规格' });
                                return;
                            }
                            const spec = parsed.spec;
                            const strField = (key) => (typeof body[key] === 'string' ? body[key].trim() : '');
                            try {
                                if (jsonAction === '/list') {
                                    const result = await sftpManager.list(spec, strField('path'));
                                    writeJson(res, 200, { ok: true, path: result.path, entries: result.entries });
                                    return;
                                }
                                if (jsonAction === '/mkdir') {
                                    if (strField('path') === '')
                                        throw new Error('path 必填');
                                    await sftpManager.mkdir(spec, strField('path'), body.parents === true);
                                    writeJson(res, 200, { ok: true });
                                    return;
                                }
                                if (jsonAction === '/rename') {
                                    if (strField('from') === '' || strField('to') === '')
                                        throw new Error('from/to 必填');
                                    await sftpManager.rename(spec, strField('from'), strField('to'));
                                    writeJson(res, 200, { ok: true });
                                    return;
                                }
                                if (jsonAction === '/remove') {
                                    if (strField('path') === '')
                                        throw new Error('path 必填');
                                    await sftpManager.remove(spec, strField('path'), body.recursive === true);
                                    writeJson(res, 200, { ok: true });
                                    return;
                                }
                                // download：路径必填（无 home 兜底），流式回包
                                const target = strField('path');
                                if (target === '')
                                    throw new Error('path 必填');
                                const { stream, size } = await sftpManager.openDownload(spec, target);
                                res.writeHead(200, {
                                    'content-type': 'application/octet-stream',
                                    'content-disposition': contentDispositionValue(remoteBasename(target)),
                                    ...(size !== null ? { 'content-length': String(size) } : {}),
                                });
                                // 客户端中断或写流失败都要回收 SFTP 读流，避免连接池通道悬挂
                                res.on('close', () => {
                                    if (res.writableEnded !== true)
                                        stream.destroy();
                                });
                                stream.on('error', (error) => {
                                    ctx.logger.warn('[dsh-tty] sftp 下载流错误: ' + error.message);
                                    res.destroy();
                                });
                                stream.pipe(res);
                                return;
                            }
                            catch (error) {
                                writeJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
                                return;
                            }
                        }
                        if (sub === '/upload') {
                            if (req.method !== 'POST') {
                                writeJson(res, 405, { error: 'method not allowed: ' + String(req.method) });
                                return;
                            }
                            const metaRaw = req.headers['x-dsh-sftp-meta'];
                            let meta;
                            if (typeof metaRaw === 'string' && metaRaw !== '') {
                                try {
                                    const parsedMeta = JSON.parse(Buffer.from(metaRaw, 'base64url').toString('utf8'));
                                    if (typeof parsedMeta === 'object' && parsedMeta !== null && !Array.isArray(parsedMeta))
                                        meta = parsedMeta;
                                }
                                catch {
                                    /* 落到下面的 400 */
                                }
                            }
                            if (meta === undefined) {
                                writeJson(res, 400, { error: '缺少或非法的 x-dsh-sftp-meta 头' });
                                return;
                            }
                            const target = typeof meta.path === 'string' ? meta.path.trim() : '';
                            if (target === '') {
                                writeJson(res, 400, { error: 'meta.path 必填' });
                                return;
                            }
                            const parsed = mergeSshSpec((name) => live.findSshHost(name), meta.name, meta);
                            if (parsed.spec === undefined) {
                                writeJson(res, 400, { error: parsed.error ?? '无效的 SSH 连接规格' });
                                return;
                            }
                            try {
                                const { stream, done } = await sftpManager.openUpload(parsed.spec, target, meta.append === true);
                                let bytes = 0;
                                req.on('data', (chunk) => {
                                    bytes += chunk.length;
                                });
                                await pipeline(req, stream);
                                await done;
                                writeJson(res, 200, { ok: true, bytes });
                            }
                            catch (error) {
                                const message = error instanceof Error ? error.message : String(error);
                                if (res.headersSent)
                                    res.destroy();
                                else
                                    writeJson(res, 500, { error: message });
                            }
                            return;
                        }
                        writeJson(res, 404, { error: 'not found: ' + sub });
                    },
                }));
                // 本机文件浏览（0.9.0，双栏 SFTP 的本机一侧）：loopback 围栏。信任模型
                // 与终端/SFTP 一致——浏览器仅同源可访问，且本机能做的 SSH 会话也能做；
                // list/mkdir/rename/remove 操作本机路径；transfer 在服务端把本机路径与
                // 远程路径流式对拷（凭证不落浏览器，字节不经过浏览器）。
                disposers.push(webServer.register({
                    kind: 'prefix',
                    path: '/api/dsh-tty/local-fs',
                    handler: async (req, res) => {
                        if (!isLoopbackHttp(req)) {
                            writeJson(res, 403, { error: 'forbidden: loopback-only' });
                            return;
                        }
                        const sub = new URL(req.url ?? '/', 'http://loopback').pathname.slice('/api/dsh-tty/local-fs'.length);
                        if (req.method !== 'POST') {
                            writeJson(res, 405, { error: 'method not allowed: ' + String(req.method) });
                            return;
                        }
                        const body = await readJsonBody(req);
                        if (body === undefined) {
                            writeJson(res, 400, { error: 'invalid JSON body' });
                            return;
                        }
                        const strField = (key) => (typeof body[key] === 'string' ? body[key].trim() : '');
                        try {
                            if (sub === '/list') {
                                const result = await listLocalDir(strField('path'));
                                writeJson(res, 200, { ok: true, path: result.path, entries: result.entries });
                                return;
                            }
                            if (sub === '/mkdir') {
                                const target = strField('path');
                                if (target === '')
                                    throw new Error('path 必填');
                                await fsMkdir(target, { recursive: body.parents === true });
                                writeJson(res, 200, { ok: true });
                                return;
                            }
                            if (sub === '/rename') {
                                const from = strField('from');
                                const to = strField('to');
                                if (from === '' || to === '')
                                    throw new Error('from/to 必填');
                                await fsRename(from, to);
                                writeJson(res, 200, { ok: true });
                                return;
                            }
                            if (sub === '/remove') {
                                const target = strField('path');
                                if (target === '')
                                    throw new Error('path 必填');
                                await fsRm(target, { recursive: body.recursive === true });
                                writeJson(res, 200, { ok: true });
                                return;
                            }
                            if (sub === '/transfer') {
                                // up = 本机→远程（上传），down = 远程→本机（下载）；目录递归
                                const direction = strField('direction');
                                const localPath = strField('localPath');
                                const remotePath = strField('remotePath');
                                if (localPath === '' || remotePath === '')
                                    throw new Error('localPath/remotePath 必填');
                                if (direction !== 'up' && direction !== 'down')
                                    throw new Error('direction 必须是 up 或 down');
                                const parsed = mergeSshSpec((name) => live.findSshHost(name), body.name, body);
                                if (parsed.spec === undefined) {
                                    writeJson(res, 400, { error: parsed.error ?? '无效的 SSH 连接规格' });
                                    return;
                                }
                                if (direction === 'up')
                                    await sftpManager.uploadFromLocal(parsed.spec, localPath, remotePath);
                                else
                                    await sftpManager.downloadToLocal(parsed.spec, remotePath, localPath);
                                writeJson(res, 200, { ok: true });
                                return;
                            }
                            writeJson(res, 404, { error: 'not found: ' + sub });
                        }
                        catch (error) {
                            writeJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
                        }
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
                if (stored.reconnectGraceSec !== 120 && typeof stored.reconnectGraceSec === 'number' && Number.isInteger(stored.reconnectGraceSec) && stored.reconnectGraceSec >= 0 && stored.reconnectGraceSec <= 3600) {
                    startup.reconnectGraceSec = stored.reconnectGraceSec;
                }
                if (stored.shellIntegration === false)
                    startup.shellIntegration = false;
                if (stored.sftpStyle === 'dual')
                    startup.sftpStyle = 'dual';
                if (stored.persistence === 'tmux')
                    startup.persistence = 'tmux';
                const storedHosts = sanitizeSshHosts(stored.sshHosts);
                if (storedHosts !== undefined && storedHosts.length > 0)
                    startup.sshHosts = storedHosts;
                const storedKeys = sanitizeHostKeys(stored.hostKeys);
                if (storedKeys !== undefined && storedKeys.length > 0)
                    startup.hostKeys = storedKeys;
                const storedTunnels = sanitizeTunnels(stored.tunnels);
                if (storedTunnels !== undefined && storedTunnels.length > 0)
                    startup.tunnels = storedTunnels;
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
                                            persist: { type: 'boolean' },
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
                                    const persist = s.persist === true ? ' [tmux 持久]' : '';
                                    return `\n- sid=${s.sid} [${s.kind}]${persist} ${where} (启动于 ${new Date(s.startedAt).toLocaleString()})`;
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
                    description: '读取某个终端面板会话（tty_list 提供 sid）的近期输出。默认读取尾部 N 行（60，最多 500，已剥离 ANSI 转义序列并收敛同行覆盖）；last:true 时只返回「上一条已完成命令」的输出与退出码（依赖 shell 集成标记，更适合拿单条命令的结果）。',
                    parameters: {
                        sid: { type: 'string', required: true, description: '会话 id（来自 tty_list）' },
                        lines: { type: 'number', description: '读取尾部行数（1~500，默认 60）；last:true 时忽略' },
                        last: { type: 'boolean', description: 'true 只返回上一条命令的输出+退出码（默认 false 读尾部）' },
                        raw: { type: 'boolean', description: 'true 返回含 ANSI 转义序列的原始输出（默认 false 清洗为纯文本）' },
                    },
                    output: {
                        schema: {
                            type: 'object',
                            additionalProperties: false,
                            properties: {
                                sid: { type: 'string', required: true },
                                tail: { type: 'string', required: true },
                                source: { type: 'string' },
                                exitCode: { type: 'number' },
                            },
                        },
                        render: (_args, value) => {
                            const v = value;
                            const head = v.source === 'last'
                                ? `终端会话 ${v.sid ?? '?'} 上一条命令的输出（exitCode=${String(v.exitCode ?? '?')}）：\n\n`
                                : `终端会话 ${v.sid ?? '?'} 尾部输出：\n\n`;
                            return [{ type: 'text', text: head + (v.tail ?? '') }];
                        },
                    },
                    async execute(args) {
                        const input = args;
                        if (typeof input.sid !== 'string' || input.sid === '')
                            throw new Error('sid 必须是非空字符串');
                        const session = sessions.get(input.sid);
                        if (session === undefined || session.closed)
                            throw new Error(`会话不存在或已退出: ${input.sid}`);
                        const useRaw = input.raw === true;
                        if (input.last === true) {
                            const last = session.shellState.lastCommand;
                            if (last === null) {
                                throw new Error('暂无「上一条命令」记录（shell 集成未生效——shell 不受支持或被配置关闭——或尚未执行过命令）；可改用 lines 读尾部');
                            }
                            return { sid: input.sid, source: 'last', exitCode: last.exitCode ?? undefined, tail: (useRaw ? last.output : cleanAnsiTail(last.output)).slice(0, 128 * 1024) };
                        }
                        const lines = Math.max(1, Math.min(500, typeof input.lines === 'number' && Number.isInteger(input.lines) && input.lines >= 1 ? input.lines : 60));
                        const rawTail = tailLines(session, lines);
                        return { sid: input.sid, source: 'tail', tail: useRaw ? rawTail : cleanAnsiTail(rawTail) };
                    },
                })));
                disposers.push(tools.register(defineTool({
                    name: 'tty_screen',
                    description: '读取某个终端面板会话（tty_list 提供 sid）当前可见屏幕的渲染结果（纯文本，等价于用户此刻看到的画面）。适合查看全屏交互程序（vim / htop / 菜单选择）的当前界面状态；要历史滚动输出用 tty_capture。',
                    parameters: {
                        sid: { type: 'string', required: true, description: '会话 id（来自 tty_list）' },
                    },
                    output: {
                        schema: {
                            type: 'object',
                            additionalProperties: false,
                            properties: {
                                sid: { type: 'string', required: true },
                                cols: { type: 'number', required: true },
                                rows: { type: 'number', required: true },
                                text: { type: 'string', required: true },
                            },
                        },
                        render: (_args, value) => {
                            const v = value;
                            return [{ type: 'text', text: `终端会话 ${v.sid ?? '?'} 当前屏幕（${String(v.cols ?? '?')}×${String(v.rows ?? '?')}）：\n\n${v.text ?? ''}` }];
                        },
                    },
                    async execute(args) {
                        const input = args;
                        if (typeof input.sid !== 'string' || input.sid === '')
                            throw new Error('sid 必须是非空字符串');
                        const session = sessions.get(input.sid);
                        if (session === undefined || session.closed)
                            throw new Error(`会话不存在或已退出: ${input.sid}`);
                        const screen = session.screen;
                        if (screen === null)
                            throw new Error(`虚拟屏不可用: ${input.sid}`);
                        const buffer = screen.buffer.active;
                        const lines = [];
                        for (let row = 0; row < screen.rows; row++) {
                            lines.push(buffer.getLine(row)?.translateToString(true) ?? '');
                        }
                        while (lines.length > 0 && lines[lines.length - 1].trim() === '')
                            lines.pop();
                        return { sid: input.sid, cols: screen.cols, rows: screen.rows, text: lines.join('\n').slice(0, 32 * 1024) };
                    },
                })));
                disposers.push(tools.register(defineTool({
                    name: 'tty_expect',
                    description: '在某个终端面板会话（tty_list 提供 sid）的后续输出中等待一个正则出现（如 dev server 的 ready/URL、构建完成标记、交互提示）。匹配到立即返回 matched:true 与周边输出；超时不抛错，返回 matched:false + 尾部输出供判断重试或放弃；期间该命令若已结束（shell 集成标记）也会提前返回并带退出码。适合先 tty_send 启动长任务、再 tty_expect 等就绪信号的流程。',
                    parameters: {
                        sid: { type: 'string', required: true, description: '会话 id（来自 tty_list）' },
                        pattern: { type: 'string', required: true, description: '等待匹配的正则表达式（JavaScript RegExp 语法）' },
                        timeoutSec: { type: 'number', description: '等待秒数（1~600，默认 30）' },
                    },
                    output: {
                        schema: {
                            type: 'object',
                            additionalProperties: false,
                            properties: {
                                matched: { type: 'boolean', required: true },
                                timedOut: { type: 'boolean', required: true },
                                text: { type: 'string', required: true },
                                exitCode: { type: 'number' },
                            },
                        },
                        render: (_args, value) => {
                            const v = value;
                            if (v.matched === true)
                                return [{ type: 'text', text: `已匹配到等待的模式：\n\n${v.text ?? ''}` }];
                            const why = v.timedOut === true ? '等待超时' : `命令已结束（exitCode=${String(v.exitCode ?? '?')}）但未出现匹配`;
                            return [{ type: 'text', text: `${why}。尾部输出：\n\n${v.text ?? ''}` }];
                        },
                    },
                    async execute(args) {
                        const input = args;
                        if (typeof input.sid !== 'string' || input.sid === '')
                            throw new Error('sid 必须是非空字符串');
                        if (typeof input.pattern !== 'string' || input.pattern === '')
                            throw new Error('pattern 必须是非空字符串');
                        const session = sessions.get(input.sid);
                        if (session === undefined || session.closed)
                            throw new Error(`会话不存在或已退出: ${input.sid}`);
                        let re;
                        try {
                            re = new RegExp(input.pattern);
                        }
                        catch (error) {
                            throw new Error('pattern 不是合法的正则表达式: ' + (error instanceof Error ? error.message : String(error)));
                        }
                        const timeoutSec = Math.max(1, Math.min(600, typeof input.timeoutSec === 'number' && Number.isInteger(input.timeoutSec) && input.timeoutSec >= 1 ? input.timeoutSec : 30));
                        const timeoutMs = timeoutSec * 1000;
                        return await new Promise((resolve) => {
                            const startedAt = Date.now();
                            const startedInCommand = session.shellState.inCommand;
                            let acc = '';
                            let settled = false;
                            const decoder = new StringDecoder('utf8');
                            const output = session.handle.output;
                            const finish = (result) => {
                                if (settled)
                                    return;
                                settled = true;
                                clearTimeout(timer);
                                output.off('data', onData);
                                resolve(result);
                            };
                            const onData = (chunk) => {
                                acc += decoder.write(chunk);
                                const hay = acc.length > 16 * 1024 ? acc.slice(-16 * 1024) : acc;
                                if (re.test(hay)) {
                                    finish({ matched: true, timedOut: false, text: cleanAnsiTail(hay.slice(-6 * 1024)) });
                                    return;
                                }
                                // 命令早停：注册时命令在飞（B..D 之间），如今 D 已到仍未匹配
                                const state = session.shellState;
                                if (startedInCommand && !state.inCommand && state.lastCommand !== null && state.lastCommand.endedAt >= startedAt) {
                                    finish({ matched: false, timedOut: false, exitCode: state.lastCommand.exitCode ?? undefined, text: cleanAnsiTail(acc.slice(-6 * 1024)) });
                                }
                            };
                            const timer = setTimeout(() => {
                                finish({ matched: false, timedOut: true, text: cleanAnsiTail(acc.slice(-6 * 1024)) });
                            }, timeoutMs);
                            timer.unref?.();
                            output.on('data', onData);
                            void session.handle.done.then(() => {
                                finish({ matched: false, timedOut: false, text: cleanAnsiTail(acc.slice(-6 * 1024)) });
                            });
                        });
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
                disposers.push(tools.register(defineTool({
                    name: 'tunnel_list',
                    description: '列出端口转发隧道及其实时状态（活跃/连接中/错误/停止、规则、当前与累计连接数、最近错误）。用户说「隧道连不上 / 转发挂了 / 端口转发不通」时先用它诊断；隧道在 设置 → 插件 → 终端面板 卡片维护。',
                    parameters: {},
                    output: {
                        schema: {
                            type: 'object',
                            additionalProperties: false,
                            properties: {
                                tunnels: {
                                    type: 'array',
                                    required: true,
                                    items: {
                                        type: 'object',
                                        additionalProperties: false,
                                        properties: {
                                            name: { type: 'string', required: true },
                                            direction: { type: 'string', required: true },
                                            rule: { type: 'string', required: true },
                                            bookName: { type: 'string', required: true },
                                            state: { type: 'string', required: true },
                                            error: { type: 'string' },
                                            connections: { type: 'number', required: true },
                                            totalConnections: { type: 'number', required: true },
                                        },
                                    },
                                },
                            },
                        },
                        render: (_args, value) => {
                            const v = value;
                            const tunnels = v.tunnels ?? [];
                            if (tunnels.length === 0)
                                return [{ type: 'text', text: '当前没有配置端口转发隧道（设置 → 插件 → 终端面板 卡片可添加）' }];
                            const text = '端口转发隧道：' + tunnels.map((t) => {
                                const tail = t.error !== null && t.error !== undefined ? `（错误: ${t.error}）` : t.lastForwardError !== null && t.lastForwardError !== undefined ? `（最近转发失败: ${t.lastForwardError}）` : `（连接 ${String(t.connections)}）`;
                                return `\n- ${t.name} [${t.direction}] ${t.rule} — ${t.state}${tail}`;
                            }).join('');
                            return [{ type: 'text', text }];
                        },
                    },
                    async execute() {
                        return { tunnels: tunnelManager.list().map((t) => ({ ...t, error: t.error ?? undefined })) };
                    },
                })));
                // —— SFTP 文件传输工具（0.7.0）——
                // 只收连接簿条目名（book），不接受内联凭证：agent 上下文不进明文密钥；
                // 连接与终端/隧道共用同一 HostKeyStore（TOFU 同源）。
                const sftpBookSpec = (book) => {
                    if (typeof book !== 'string' || book.trim() === '')
                        throw new Error('book 必须是 SSH 连接簿条目名');
                    const entry = live.findSshHost(book.trim());
                    if (entry === undefined)
                        throw new Error(`连接簿中不存在: ${book.trim()}`);
                    return entry;
                };
                disposers.push(tools.register(defineTool({
                    name: 'sftp_list',
                    description: '列出 SSH 远程目录内容（名称/类型/大小/修改时间，目录在前）。book 为 SSH 连接簿条目名；path 缺省为远程登录 home。用于查找远程文件、确认上传下载结果。',
                    parameters: {
                        book: { type: 'string', required: true, description: 'SSH 连接簿条目名（设置 → 插件 → 终端面板 维护）' },
                        path: { type: 'string', description: '远程目录路径（缺省 = 登录 home）' },
                    },
                    output: {
                        schema: {
                            type: 'object',
                            additionalProperties: false,
                            properties: {
                                path: { type: 'string', required: true },
                                entries: {
                                    type: 'array',
                                    required: true,
                                    items: {
                                        type: 'object',
                                        additionalProperties: false,
                                        properties: {
                                            name: { type: 'string', required: true },
                                            isDir: { type: 'boolean', required: true },
                                            size: { type: 'number', required: true },
                                            mtime: { type: 'number', required: true },
                                        },
                                    },
                                },
                            },
                        },
                        render: (_args, value) => {
                            const v = value;
                            const entries = v.entries ?? [];
                            if (entries.length === 0)
                                return [{ type: 'text', text: `远程目录 ${v.path ?? '?'} 为空` }];
                            const text = `远程目录 ${v.path ?? '?'}（${String(entries.length)} 项）：` + entries.map((e) => `\n- ${e.name}${e.isDir ? '/' : ''} — ${e.isDir ? '目录' : humanFileSize(e.size)}`).join('');
                            return [{ type: 'text', text }];
                        },
                    },
                    async execute(args) {
                        const input = args;
                        const spec = sftpBookSpec(input.book);
                        const result = await sftpManager.list(spec, typeof input.path === 'string' ? input.path : '');
                        return { path: result.path, entries: result.entries.map((e) => ({ name: e.name, isDir: e.isDir, size: e.size, mtime: e.mtime })) };
                    },
                })));
                disposers.push(tools.register(defineTool({
                    name: 'sftp_read',
                    description: '读取 SSH 远程文本文件（book 连接簿条目 + path）。默认最多 256KB（可调至 1MB），超出截断；检测到 NUL 字节按二进制文件拒绝。适合查看远程配置、小日志。',
                    parameters: {
                        book: { type: 'string', required: true, description: 'SSH 连接簿条目名' },
                        path: { type: 'string', required: true, description: '远程文件路径' },
                        maxBytes: { type: 'number', description: '最大读取字节数（1~1048576，默认 262144）' },
                    },
                    output: {
                        schema: {
                            type: 'object',
                            additionalProperties: false,
                            properties: {
                                path: { type: 'string', required: true },
                                content: { type: 'string', required: true },
                                truncated: { type: 'boolean', required: true },
                            },
                        },
                        render: (_args, value) => {
                            const v = value;
                            const head = `远程文件 ${v.path ?? '?'}${v.truncated === true ? '（已截断）' : ''}：`;
                            return [{ type: 'text', text: head + '\n' + String(v.content ?? '') }];
                        },
                    },
                    async execute(args) {
                        const input = args;
                        const spec = sftpBookSpec(input.book);
                        if (typeof input.path !== 'string' || input.path.trim() === '')
                            throw new Error('path 必须是非空字符串');
                        const maxBytes = typeof input.maxBytes === 'number' && Number.isInteger(input.maxBytes) && input.maxBytes >= 1 && input.maxBytes <= 1024 * 1024 ? input.maxBytes : 256 * 1024;
                        const { stream } = await sftpManager.openDownload(spec, input.path);
                        const chunks = [];
                        let total = 0;
                        try {
                            for await (const chunk of stream) {
                                const piece = chunk;
                                chunks.push(piece);
                                total += piece.length;
                                if (total > maxBytes)
                                    break; // 只多读一段用于判定截断，其余丢弃
                            }
                        }
                        finally {
                            stream.destroy();
                        }
                        const buf = Buffer.concat(chunks);
                        const truncated = buf.length > maxBytes;
                        const sliced = truncated ? buf.subarray(0, maxBytes) : buf;
                        if (sliced.includes(0))
                            throw new Error('疑似二进制文件（含 NUL 字节），sftp_read 只支持文本内容');
                        return { path: input.path.trim(), content: sliced.toString('utf8'), truncated };
                    },
                })));
                disposers.push(tools.register(defineTool({
                    name: 'sftp_write',
                    description: '写 SSH 远程文本文件（book 连接簿条目 + path + content）。默认覆盖写入，append:true 追加到文件尾；单次最多 1MB。适合远程写配置、落结果文件。',
                    parameters: {
                        book: { type: 'string', required: true, description: 'SSH 连接簿条目名' },
                        path: { type: 'string', required: true, description: '远程文件路径' },
                        content: { type: 'string', required: true, description: '要写入的文本内容（≤1MB）' },
                        append: { type: 'boolean', description: 'true 追加到文件尾（默认覆盖）' },
                    },
                    output: {
                        schema: {
                            type: 'object',
                            additionalProperties: false,
                            properties: {
                                ok: { type: 'boolean', required: true },
                                path: { type: 'string', required: true },
                                bytes: { type: 'number', required: true },
                                append: { type: 'boolean', required: true },
                            },
                        },
                        render: (_args, value) => {
                            const v = value;
                            return [{ type: 'text', text: `已${v.append === true ? '追加' : '写入'}远程文件 ${v.path ?? '?'}（${String(v.bytes ?? 0)} 字节）` }];
                        },
                    },
                    async execute(args) {
                        const input = args;
                        const spec = sftpBookSpec(input.book);
                        if (typeof input.path !== 'string' || input.path.trim() === '')
                            throw new Error('path 必须是非空字符串');
                        if (typeof input.content !== 'string')
                            throw new Error('content 必须是字符串');
                        const bytes = Buffer.byteLength(input.content, 'utf8');
                        if (bytes > 1024 * 1024)
                            throw new Error(`content 超过上限：${String(bytes)} 字节 > 1MB（大文件请用终端 scp 或面板上传）`);
                        const append = input.append === true;
                        const { stream, done } = await sftpManager.openUpload(spec, input.path, append);
                        stream.write(input.content, 'utf8');
                        stream.end();
                        await done;
                        return { ok: true, path: input.path.trim(), bytes, append };
                    },
                })));
                // —— SFTP 管理闭环（0.8.0）——
                // mkdir（可逐级补齐）/ rename（可跨目录，等效移动）/ remove（目录
                // 递归）/ tree（限深限数的递归列举），与 sftp_list/read/write 一起
                // 让 agent 不开面板也能完整管理远程文件；同样只收连接簿条目名。
                disposers.push(tools.register(defineTool({
                    name: 'sftp_mkdir',
                    description: '在 SSH 远程创建目录（book 连接簿条目 + path）。parents:true 时逐级补齐缺失的父目录（等效 mkdir -p，默认 false，父目录缺失直接报错）。',
                    parameters: {
                        book: { type: 'string', required: true, description: 'SSH 连接簿条目名（设置 → 插件 → 终端面板 维护）' },
                        path: { type: 'string', required: true, description: '要创建的远程目录路径' },
                        parents: { type: 'boolean', description: 'true 逐级补齐缺失父目录（默认 false）' },
                    },
                    output: {
                        schema: {
                            type: 'object',
                            additionalProperties: false,
                            properties: {
                                ok: { type: 'boolean', required: true },
                                path: { type: 'string', required: true },
                            },
                        },
                        render: (_args, value) => {
                            const v = value;
                            return [{ type: 'text', text: `已创建远程目录 ${v.path ?? '?'}` }];
                        },
                    },
                    async execute(args) {
                        const input = args;
                        const spec = sftpBookSpec(input.book);
                        if (typeof input.path !== 'string' || input.path.trim() === '')
                            throw new Error('path 必须是非空字符串');
                        await sftpManager.mkdir(spec, input.path, input.parents === true);
                        return { ok: true, path: input.path.trim() };
                    },
                })));
                disposers.push(tools.register(defineTool({
                    name: 'sftp_rename',
                    description: '在 SSH 远程重命名 / 移动文件或目录（book 连接簿条目 + from + to）。to 与 from 不同目录即为移动（目标目录需已存在）；不会覆盖已存在的目标（服务端 rename 语义）。',
                    parameters: {
                        book: { type: 'string', required: true, description: 'SSH 连接簿条目名' },
                        from: { type: 'string', required: true, description: '原远程路径' },
                        to: { type: 'string', required: true, description: '新远程路径（跨目录即移动）' },
                    },
                    output: {
                        schema: {
                            type: 'object',
                            additionalProperties: false,
                            properties: {
                                ok: { type: 'boolean', required: true },
                                from: { type: 'string', required: true },
                                to: { type: 'string', required: true },
                            },
                        },
                        render: (_args, value) => {
                            const v = value;
                            return [{ type: 'text', text: `已将远程 ${v.from ?? '?'} 重命名/移动为 ${v.to ?? '?'}` }];
                        },
                    },
                    async execute(args) {
                        const input = args;
                        const spec = sftpBookSpec(input.book);
                        if (typeof input.from !== 'string' || input.from.trim() === '')
                            throw new Error('from 必须是非空字符串');
                        if (typeof input.to !== 'string' || input.to.trim() === '')
                            throw new Error('to 必须是非空字符串');
                        await sftpManager.rename(spec, input.from, input.to);
                        return { ok: true, from: input.from.trim(), to: input.to.trim() };
                    },
                })));
                disposers.push(tools.register(defineTool({
                    name: 'sftp_remove',
                    description: '删除 SSH 远程文件或目录（book 连接簿条目 + path）。文件直接删除；目录默认走 rmdir（非空明确报错），recursive:true 整目录递归删除（不可恢复，谨慎使用）。',
                    parameters: {
                        book: { type: 'string', required: true, description: 'SSH 连接簿条目名' },
                        path: { type: 'string', required: true, description: '要删除的远程路径' },
                        recursive: { type: 'boolean', description: '目录 true 时递归删除全部内容（默认 false）' },
                    },
                    output: {
                        schema: {
                            type: 'object',
                            additionalProperties: false,
                            properties: {
                                ok: { type: 'boolean', required: true },
                                path: { type: 'string', required: true },
                                recursive: { type: 'boolean', required: true },
                            },
                        },
                        render: (_args, value) => {
                            const v = value;
                            return [{ type: 'text', text: `已删除远程 ${v.path ?? '?'}${v.recursive === true ? '（含全部内容）' : ''}` }];
                        },
                    },
                    async execute(args) {
                        const input = args;
                        const spec = sftpBookSpec(input.book);
                        if (typeof input.path !== 'string' || input.path.trim() === '')
                            throw new Error('path 必须是非空字符串');
                        const recursive = input.recursive === true;
                        await sftpManager.remove(spec, input.path, recursive);
                        return { ok: true, path: input.path.trim(), recursive };
                    },
                })));
                disposers.push(tools.register(defineTool({
                    name: 'sftp_tree',
                    description: '递归列举 SSH 远程目录结构（book 连接簿条目 + path）：深度优先、目录优先，maxDepth（1~8，默认 3）限层、maxEntries（1~2000，默认 500）限条数，超限 truncated:true；符号链接不跟随；读取失败的子目录列入 errors。适合先看远程项目结构再定位文件。',
                    parameters: {
                        book: { type: 'string', required: true, description: 'SSH 连接簿条目名' },
                        path: { type: 'string', description: '远程目录路径（缺省 = 登录 home）' },
                        maxDepth: { type: 'number', description: '最大下钻层数（1~8，默认 3）' },
                        maxEntries: { type: 'number', description: '最大条目数（1~2000，默认 500）' },
                    },
                    output: {
                        schema: {
                            type: 'object',
                            additionalProperties: false,
                            properties: {
                                path: { type: 'string', required: true },
                                entries: {
                                    type: 'array',
                                    required: true,
                                    items: {
                                        type: 'object',
                                        additionalProperties: false,
                                        properties: {
                                            path: { type: 'string', required: true },
                                            name: { type: 'string', required: true },
                                            depth: { type: 'number', required: true },
                                            isDir: { type: 'boolean', required: true },
                                            size: { type: 'number', required: true },
                                            mtime: { type: 'number', required: true },
                                        },
                                    },
                                },
                                truncated: { type: 'boolean', required: true },
                                errors: {
                                    type: 'array',
                                    required: true,
                                    items: {
                                        type: 'object',
                                        additionalProperties: false,
                                        properties: {
                                            path: { type: 'string', required: true },
                                            message: { type: 'string', required: true },
                                        },
                                    },
                                },
                            },
                        },
                        render: (_args, value) => {
                            const v = value;
                            const entries = v.entries ?? [];
                            if (entries.length === 0)
                                return [{ type: 'text', text: `远程目录 ${v.path ?? '?'} 为空` }];
                            const head = `远程目录 ${v.path ?? '?'} 结构（${String(entries.length)} 项${v.truncated === true ? '，已截断' : ''}）：`;
                            const lines = entries.map((e) => {
                                const indent = '  '.repeat(Math.max(0, e.depth - 1));
                                const tail = e.isDir ? '/' : ' — ' + humanFileSize(e.size);
                                return `${indent}- ${e.name}${tail}`;
                            });
                            for (const item of v.errors ?? [])
                                lines.push(`! ${item.path}（${item.message}）`);
                            return [{ type: 'text', text: head + '\n' + lines.join('\n') }];
                        },
                    },
                    async execute(args) {
                        const input = args;
                        const spec = sftpBookSpec(input.book);
                        const result = await sftpManager.tree(spec, typeof input.path === 'string' ? input.path : '', {
                            maxDepth: typeof input.maxDepth === 'number' && Number.isInteger(input.maxDepth) ? input.maxDepth : undefined,
                            maxEntries: typeof input.maxEntries === 'number' && Number.isInteger(input.maxEntries) ? input.maxEntries : undefined,
                        });
                        return result;
                    },
                })));
                stateRef.toolsRegistered = true;
                console.log('[dsh-tty] agent tools registered (tty_list, tty_capture, tty_screen, tty_expect, tty_send, tunnel_list, sftp_list, sftp_read, sftp_write, sftp_mkdir, sftp_rename, sftp_remove, sftp_tree)');
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
        // 向 agent 公告终端面板能力（静态 section）+ 每轮注入活跃会话快照（动态 context）
        if (config?.announceToAgent !== false) {
            ctx.inject(['systemPrompt'], (promptCtx) => {
                promptCtx.effect(() => {
                    const systemPrompt = promptCtx.systemPrompt;
                    const contextDisposable = systemPrompt.context({
                        name: 'plugin:dsh-tty:terminals',
                        order: 150,
                        text: () => {
                            const list = sessions.list();
                            if (list.length === 0)
                                return '当前没有活跃的终端面板会话（可引导用户打开「终端」面板，或用 spawn 类工作流替代）。';
                            return '当前活跃的终端面板会话（可用 tty_capture / tty_screen / tty_expect / tty_send 操作，sid 如下）：\n' + list.map((s) => {
                                const where = s.kind === 'ssh' ? `ssh ${s.target}` : `pid=${String(s.pid ?? '?')} cwd=${s.cwd}`;
                                return `- sid=${s.sid} [${s.kind}]${s.persist === true ? ' [tmux 持久]' : ''} ${where} (最后活动 ${new Date(s.lastOutputAt).toLocaleTimeString()})`;
                            }).join('\n');
                        },
                    });
                    const sectionDisposable = systemPrompt.section({ name: 'plugin:dsh-tty', order: 150, text: TTY_GUIDANCE });
                    return () => {
                        sectionDisposable();
                        contextDisposable();
                    };
                }, 'dsh-tty: announcement');
            });
        }
        // 孤儿会话回收器：超过保活期的异常断开会话定期清理（grace=0 时为 no-op，
        // 断开时立即结束）；插件卸载时随 effect 一起停掉
        const reaperTimer = setInterval(() => {
            void sessions.reapOrphans(live.reconnectGraceMs);
        }, REAPER_INTERVAL_MS);
        reaperTimer.unref?.();
        ctx.effect(() => () => clearInterval(reaperTimer), 'dsh-tty: orphan reaper');
        // 插件卸载时回收全部会话、隧道与 SFTP 连接
        ctx.effect(() => {
            return () => {
                void sessions.disposeAll();
                tunnelManager.disposeAll();
                sftpManager.disposeAll();
            };
        }, 'dsh-tty: session cleanup');
        console.log(`[dsh-tty] mounted (shell=${live.shell}, term=${live.term}, cwd=${live.cwd}, maxSessions=${sessions.limitValue})`);
    },
});
export const { name, inject, apply } = plugin;
//# sourceMappingURL=index.js.map