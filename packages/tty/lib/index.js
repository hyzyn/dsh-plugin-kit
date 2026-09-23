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
import { definePlugin, dshHome as resolveDshHome } from '@hyzyn/dsh-kit';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { spawnSsh, sshTarget, expandHome, setCredentialResolver } from './ssh.js';
import { probeSsh } from './probe.js';
import { buildCommandSpawn, buildShellSpawn, defaultShellPath } from './shell-integration.js';
import { parseSshConfig } from './ssh-config.js';
import { parseKnownHostsDetailed } from './known-hosts.js';
import { TunnelManager } from './tunnels.js';
import { SftpManager } from './sftp.js';
import { buildTmuxSpawnPlan, ensureTmuxAssets, killTmuxSession, listTmuxSessions, probeTmux, refreshTmuxClient, sanitizePersistName } from './tmux.js';
import { buildRemoteStatsCommand, buildWindowsStatsCommand, hasStatsData, localStatsSampler, parseStatsLine } from './stats.js';
/** SFTP 传输限制默认值。 */
const DEFAULT_SFTP_LIMITS = { maxDownloadMb: 1024, maxUploadMb: 2048, maxUploadFiles: 1000 };
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
    fingerprints: z.array(z.string()).default([]),
    fingerprint: z.string().default(''), // 旧版单指纹字段：仅作迁移输入，清洗后并入 fingerprints
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
/** 与「插件配置 → 终端面板」卡片表单对齐的 schema。 */
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
    endOnPageClose: z.boolean().default(false),
    statsEnabled: z.boolean().default(true),
    sftpLimits: z.object({
        maxDownloadMb: z.natural().max(1024 * 1024).default(1024),
        maxUploadMb: z.natural().max(1024 * 1024).default(2048),
        maxUploadFiles: z.natural().max(100000).default(1000),
    }).default({ maxDownloadMb: 1024, maxUploadMb: 2048, maxUploadFiles: 1000 }),
    persistSessions: z.array(z.object({ tmuxName: z.string() })).default([]),
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
/** 自定义命令标签（0.14.0）的长度上限：单条命令，防误传超长脚本。 */
const COMMAND_MAX = 2000;
/**
 * 清洗帧里的 `command`（0.14.0，ttyTerminal 服务用）：必须是单行、非空、
 * 长度受控的字符串。命令来自**宿主侧插件**（如 dsh-docker 的
 * `docker exec -it <容器> sh`），信任级与插件本身相同；这里只做形状校验，
 * 避免换行破坏本地 `-c` 包装层、或超长内容拖垮帧解析。
 */
function sanitizeCommand(value) {
    if (value === undefined)
        return {};
    if (typeof value !== 'string')
        return { error: 'command 必须是字符串' };
    const trimmed = value.trim();
    if (trimmed === '')
        return { error: 'command 不能为空' };
    if (trimmed.length > COMMAND_MAX)
        return { error: `command 过长（≤${String(COMMAND_MAX)} 字符）` };
    if (/[\r\n\0]/.test(trimmed))
        return { error: 'command 必须是单行（不能含换行/NUL）' };
    return { command: trimmed };
}
const BUFFER_CAP = 256 * 1024;
/** TERM/COLORTERM 白名单：防止值里的引号破坏 -c 包装层命令（shellArgv 单引号包裹）。 */
const TERM_RE = /^[A-Za-z0-9_.+-]+$/;
/** 孤儿会话回收器的扫描间隔。 */
const REAPER_INTERVAL_MS = 10_000;
/** 服务器状态条的采集/推送间隔（mvp 固定 1s，不做配置项）。 */
const STATS_INTERVAL_MS = 1000;
const TTY_GUIDANCE = '本机已安装 dsh-tty 插件（终端面板）：Web GUI 侧边栏的「终端」入口可打开交互终端（xterm.js + PTY），可运行任意命令与 TUI 程序（vim/htop 等），支持多标签页与断线自动重连（刷新页面/网络抖动后会话保活并恢复现场）；新标签默认在当前会话工作目录打开。标签栏「+」菜单还能开 SSH 标签页（ssh2 原生连接，连接簿在设置卡片维护，支持 agent forwarding 与主机指纹 TOFU 钉扎），像本地终端一样操作远程主机。设置卡片开启「会话持久化（tmux）」后，新开的本地/SSH 标签默认由 tmux server 托管（宿主重启/断线超时后重开即恢复现场），长任务建议在持久化开启时运行。长驻进程（dev server、watch、交互式程序）用 tty_open 开一个会话跑（或引导用户到终端面板里运行），不要在 bash 工具里挂起等待；用户提到「开个终端 / 在终端里跑 / SSH 到某台机器」时引导其打开该面板。agent 侧配套工具：tty_list 列出活跃终端会话（含 SSH 的 target 与实时 cwd），tty_capture 读取近期输出（默认清洗 ANSI；last:true 拿「上一条命令」的输出+退出码），tty_screen 读取当前可见屏幕（可读懂 vim/htop 等 TUI），tty_expect 用正则等待输出中的就绪信号（如 dev server URL、构建完成），tty_send 发送按键，tunnel_list 列出端口转发隧道状态——操作会实时显示在用户终端里。SFTP 文件传输：面板内可对 SSH 连接簿条目（或 SSH 连接对话框当前填写的信息）打开文件浏览（上传/下载/建目录/重命名/删除），传输期间进度条右侧 ✕ 可取消（半截文件自动清理）；agent 配套 sftp_list 列远程目录、sftp_tree 递归看目录结构、sftp_read 读远程文本文件（≤1MB）、sftp_write 写远程文本文件（≤1MB，可追加）、sftp_mkdir 建目录（parents 可逐级补齐）、sftp_rename 重命名/移动、sftp_remove 删除（目录需 recursive），book 参数为连接簿条目名。端口转发：连接簿条目可配本地/远程隧道（如把远程数据库映射到本地端口），宿主自动保活重连，用户提到「转发端口 / 访问远程库」时引导其到终端面板设置卡片配置。推荐流程：tty_send 启动长任务 → tty_expect 等就绪标记 → tty_capture{last:true} 拿结果。';
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
            killLocalShellTerminal(handle.terminal);
        },
    };
}
/**
 * 本地 PTY 顶层 shell 的 best-effort 强杀（D48）。
 *
 * **Windows 绝不能带 signal**：node-pty 的 `WindowsTerminal.kill(signal)` 会同步
 * `throw new Error('Signals not supported on windows.')`，而且它内部 `_deferNoArgs`
 * 会把回调排进队列、稍后从 socket 回调里执行——调用方的 try/catch 拦不住，直接变成
 * **宿主进程崩溃**。CI 的 windows-latest 上实测：spawn → kill 跑完就崩在
 * `windowsTerminal.js:161`。不带 signal 时 node-pty 走 `_close()` + `agent.kill()`，
 * 正是 Windows 上正确的终止语义。
 *
 * 导出仅供单测（test/host-frames.test.ts）：平台参数注入，两个分支都能在 macOS/Linux 断言。
 */
export function killLocalShellTerminal(terminal, platform = process.platform) {
    const kill = terminal?.kill;
    if (typeof kill !== 'function')
        return;
    try {
        if (platform === 'win32')
            kill.call(terminal);
        else
            kill.call(terminal, 'SIGKILL');
    }
    catch {
        /* 已退出 */
    }
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
    /** 页面断开且保活期结束时是否结束 tmux 持久会话（默认 false = 留存）。 */
    endOnPageClose;
    /** 服务器状态条：是否采集并推送会话资源指标（默认 true）。 */
    statsEnabled;
    /** SSH 持久会话名（远程 tmux 托管；本机 socket 清单看不到，随 settings 留存）。 */
    persistSessions;
    /** SFTP 传输限制（客户端浏览器侧执行）。 */
    sftpLimits;
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
        this.endOnPageClose = init.endOnPageClose === true;
        // 只有显式 false 才关（缺省/旧配置一律视为开）
        this.statsEnabled = init.statsEnabled !== false;
        this.sftpLimits = sanitizeSftpLimits(init.sftpLimits);
        this.persistSessions = init.persistSessions ?? [];
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
        if (typeof partial.endOnPageClose === 'boolean')
            this.endOnPageClose = partial.endOnPageClose;
        if (typeof partial.statsEnabled === 'boolean')
            this.statsEnabled = partial.statsEnabled;
        if (partial.sftpLimits !== undefined)
            this.sftpLimits = sanitizeSftpLimits({ ...this.sftpLimits, ...partial.sftpLimits });
        if (Array.isArray(partial.persistSessions))
            this.persistSessions = partial.persistSessions;
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
 * 文本判定（0.19.0，sftp_read）：NUL 之外再加「非法 UTF-8/控制字节占比」——
 * 只看已读前缀是否含 NUL 时，>256KB 的二进制文件前段恰好没 NUL 就被当文本
 * 返回乱码；UTF-16 文本（字节偶位 NUL）由 NUL 判据捕获。样本只取前 64KB。
 */
function looksLikeBinary(buf) {
    if (buf.includes(0))
        return true;
    const decoder = new TextDecoder('utf-8', { fatal: true });
    try {
        decoder.decode(buf);
        return false;
    }
    catch {
        let suspicious = 0;
        const sample = buf.subarray(0, 64 * 1024);
        for (let i = 0; i < sample.length; i++) {
            const b = sample[i];
            // 控制字节（除 \t \n \r \f \e）：合法 UTF-8 文本里几乎不出现，二进制里大量出现
            if (b < 0x20 && b !== 0x09 && b !== 0x0a && b !== 0x0d && b !== 0x0c && b !== 0x1b)
                suspicious += 1;
        }
        return suspicious / sample.length > 0.02;
    }
}
/** 去掉截断点上的未完成 UTF-8 序列（≤3 字节残包）：解码不再在尾部出 U+FFFD。 */
function trimIncompleteUtf8Tail(buf) {
    if (buf.length === 0)
        return buf;
    const start = Math.max(0, buf.length - 3);
    for (let i = buf.length - 1; i >= start; i--) {
        const b = buf[i];
        if (b < 0x80)
            return buf; // 末尾就是 ASCII：没有残包
        if ((b & 0xc0) === 0x80)
            continue; // 续字节：向前找 lead
        const need = (b & 0xe0) === 0xc0 ? 2 : (b & 0xf0) === 0xe0 ? 3 : (b & 0xf8) === 0xf0 ? 4 : 0;
        if (need === 0)
            return buf; // 非法字节：交给 decode 按错误处理
        return buf.length - i >= need ? buf : buf.subarray(0, i);
    }
    return buf;
}
function decodeUtf8ForAgent(buf) {
    return trimIncompleteUtf8Tail(buf).toString('utf8');
}
/**
 * 保尾截断并避开「切割点落在转义序列 / UTF-16 代理对中间」（0.19.0）：
 * 环形回放缓冲按字符 slice 时，起点可能落进 ANSI 序列内部（回放首行出现
 * 残破转义）或代理对之间（单个孤立代理）。找到安全边界后再切。
 */
function tailFromSafeBoundary(text, cap) {
    if (text.length <= cap)
        return text;
    let start = text.length - cap;
    // 截断点前 64 字符内的 ESC：序列若跨过截断点，把起点挪到终结符之后
    const esc = text.lastIndexOf('\x1b', start);
    if (esc !== -1 && esc >= start - 64) {
        const m = /\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-Z\\-_]/.exec(text.slice(esc, esc + 160));
        if (m === null) {
            start = esc; // 窗口内不见终结符：整个序列丢弃（最多 ~64 字符）
        }
        else if (esc + m.index + m[0].length > start) {
            start = esc + m.index + m[0].length;
        }
    }
    if (start > 0 && start < text.length) {
        const code = text.charCodeAt(start);
        if (code >= 0xdc00 && code <= 0xdfff)
            start += 1; // 低位代理：跳过，避免孤立
    }
    return text.slice(start);
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
/** 同一会话允许的在途 tty_expect 上限（每个都挂常驻 data 监听器直到 settle）。 */
const MAX_EXPECT_PER_SESSION = 5;
/** 在途 tty_expect 计数（按会话弱引用，会话回收不泄漏）。 */
const expectCounts = new WeakMap();
/**
 * 整数夹紧（0.19.0）：ws 帧输入零信任——`Number('abc')=NaN`、`-5`、`1.5`、
 * `1e9` 都不能原样透传给 node-pty 的 ioctl 与 xterm-headless（后者曾在
 * resize 帧路径直接炸出未捕获异常）。非法值回落 fallback，范围内取整。
 */
function clampInt(value, fallback, min, max) {
    const n = Number(value);
    if (!Number.isFinite(n))
        return fallback;
    return Math.min(max, Math.max(min, Math.round(n)));
}
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
/** 导出仅供单测（test/shell-capture.test.ts）：B/D 配对与未配对 D 的忽略语义。 */
export function feedShellIntegration(session, text) {
    const state = session.shellState;
    let data = state.carry + text;
    state.carry = '';
    const lastOpen = data.lastIndexOf('\x1b]');
    if (lastOpen !== -1) {
        const tail = data.slice(lastOpen);
        if (!/\x07|\x1b\\/.test(tail)) {
            // 上限按 T 快照量级（512KB）：200 行 tmux capture-pane 的 base64 可到
            // 数百 KB，64KB 装不下时会整块照常处理，残余 base64 混进命令缓冲
            if (tail.length <= 512 * 1024) {
                state.carry = tail;
                data = data.slice(0, lastOpen);
            }
            // 超过上限仍不闭合视为垃圾：放弃扣留，整块照常处理
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
/** 单个 host:port 保留的指纹上限（与 known-hosts.ts / ssh.ts 的 TOFU 集合同参数）。 */
const MAX_FINGERPRINTS_PER_HOST = 8;
/** 归集一条输入里的指纹（新 fingerprints 数组 + 旧版单指纹字段都收），去重保序。 */
function collectFingerprints(raw) {
    const out = [];
    const push = (value) => {
        if (typeof value !== 'string')
            return;
        const trimmed = value.trim();
        if (trimmed === '' || trimmed.length > 256 || out.includes(trimmed))
            return;
        out.push(trimmed);
    };
    push(raw.fingerprint); // 旧版单指纹字段：兼容迁移
    if (Array.isArray(raw.fingerprints))
        for (const fp of raw.fingerprints)
            push(fp);
    return out;
}
/**
 * 宽松清洗一份 hostKeys 输入；输入不是数组时返回 undefined（表示「未提供，
 * 保持原值」）。0.19.0 起一机多指纹：同 host:port 的多条合并为一条
 * （fingerprints 取并集，上限 8）；旧版 `{fingerprint}` 单指纹条目迁移读取。
 */
function sanitizeHostKeys(input) {
    if (!Array.isArray(input))
        return undefined;
    const byKey = new Map();
    for (const item of input) {
        if (typeof item !== 'object' || item === null)
            continue;
        const raw = item;
        if (typeof raw.host !== 'string' || raw.host.trim() === '')
            continue;
        const fps = collectFingerprints(raw);
        if (fps.length === 0)
            continue;
        const host = raw.host.trim().toLowerCase();
        const portNum = Number(raw.port);
        const port = Number.isInteger(portNum) && portNum >= 1 && portNum <= 65535 ? portNum : 22;
        const key = `${host}:${port}`;
        const existing = byKey.get(key);
        if (existing === undefined) {
            byKey.set(key, { host, port, fingerprints: fps.slice(0, MAX_FINGERPRINTS_PER_HOST) });
            continue;
        }
        for (const fp of fps) {
            if (!existing.fingerprints.includes(fp) && existing.fingerprints.length < MAX_FINGERPRINTS_PER_HOST)
                existing.fingerprints.push(fp);
        }
    }
    return [...byKey.values()];
}
/** 清洗一份 sftpLimits 输入：每项取 0~上限 的整数（0 = 不限），缺省回落默认值。 */
function sanitizeSftpLimits(input) {
    const num = (value, fallback, max) => {
        const n = Number(value);
        return Number.isInteger(n) && n >= 0 && n <= max ? n : fallback;
    };
    return {
        maxDownloadMb: num(input?.maxDownloadMb, DEFAULT_SFTP_LIMITS.maxDownloadMb, 1024 * 1024),
        maxUploadMb: num(input?.maxUploadMb, DEFAULT_SFTP_LIMITS.maxUploadMb, 1024 * 1024),
        maxUploadFiles: num(input?.maxUploadFiles, DEFAULT_SFTP_LIMITS.maxUploadFiles, 100000),
    };
}
/** 严格校验一份 hostKeys 输入（HTTP POST 路径）；返回错误信息或清洗后的数组。
 *  同 host:port 允许出现多条（清洗时合并为一条的多指纹集合，见 sanitizeHostKeys）。 */
function validateHostKeys(input) {
    if (!Array.isArray(input))
        return { error: 'hostKeys 必须是数组' };
    for (const item of input) {
        if (typeof item !== 'object' || item === null)
            return { error: 'hostKeys 条目必须是对象' };
        const raw = item;
        if (typeof raw.host !== 'string' || raw.host.trim() === '')
            return { error: 'hostKeys.host 必须是非空字符串' };
        if (collectFingerprints(raw).length === 0)
            return { error: 'hostKeys 条目需要 fingerprint(s)（至少一个非空指纹）' };
        const port = Number(raw.port ?? 22);
        if (!Number.isInteger(port) || port < 1 || port > 65535)
            return { error: 'hostKeys.port 必须是 1~65535 的整数' };
    }
    return { keys: sanitizeHostKeys(input) };
}
/** 宽松清洗一份 persistSessions（内部状态：SSH 持久会话名）；非法条目丢弃。 */
function sanitizePersistSessions(input) {
    if (!Array.isArray(input))
        return undefined;
    const out = [];
    for (const item of input) {
        if (typeof item !== 'object' || item === null)
            continue;
        const name = item.tmuxName;
        if (typeof name === 'string' && /^dsh-[A-Za-z0-9_-]{1,64}$/.test(name) && !out.includes(name))
            out.push(name);
    }
    return out;
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
        const record = this.live.hostKeys.find((record) => `${record.host}:${record.port}` === key);
        return record !== undefined && record.fingerprints.length > 0 ? record.fingerprints : undefined;
    }
    /** 记录指纹：同 host:port 已有记录则并入集合（一机多把钥匙），否则新建。 */
    record(host, port, fingerprint) {
        const key = this.key(host, port);
        const existing = this.live.hostKeys.find((record) => `${record.host}:${record.port}` === key);
        if (existing !== undefined) {
            if (!existing.fingerprints.includes(fingerprint)) {
                if (existing.fingerprints.length >= MAX_FINGERPRINTS_PER_HOST)
                    existing.fingerprints.shift();
                existing.fingerprints.push(fingerprint);
            }
            this.persist(this.live.hostKeys);
            return;
        }
        const next = [...this.live.hostKeys, { host: host.trim().toLowerCase(), port, fingerprints: [fingerprint] }];
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
 * 虚拟屏（xterm-headless）——构造与异常兜底（D57）
 * ------------------------------------------------------------------ */
/**
 * 虚拟屏的 scrollback 余量（D57）。
 *
 * **不能是 0。** xterm 的 `Buffer` 在 `scrollback: 0` 时把 `lines.maxLength` 压成
 * `rows`，但 normal buffer 的 `_hasScrollback` 仍是 true（reflow 照常开启）：输出与
 * resize（列宽变化触发 reflow）交错时，`lines` 会短于 `ybase + y`，于是
 * `lineFeed()` 里 `lines.get(ybase + y).isWrapped = false` 命中 `undefined` →
 * 未捕获 `TypeError: Cannot set properties of undefined (setting 'isWrapped')`。
 *
 * 该异常抛在 `WriteBuffer._innerWrite` 的 `setTimeout` 回调里，写入路径的同步
 * try/catch 结构性拦不住，会直接打死整个宿主进程（线上 `last-failure-web.log`
 * 的堆栈即此）。
 *
 * 关键在 `lines.maxLength`（= rows + scrollback）：`BufferService.scroll` 只在「没满」时
 * 才 `lines.push` + `ybase++`（成对）。`scrollback: 0` 把 maxLength 钉死成 rows，
 * 一旦有别的路径把 `ybase` 顶上去（resize 收缩 / reflow），`lines` 长度就再也追不上，
 * `ybase + y + 1` 越界只是时间问题。留 1 行余量（maxLength = rows + 1）即维持住成对增长：
 * 同一最小序列 `scrollback: 0` 崩 5/5，`scrollback: 1` 崩 0/5；700 块随机屏压测里
 * `ybase` 涨到 16 也没再出现越界（见 test/screen-crash.test.ts）。
 *
 * 余量不影响 `tty_screen` 读数——它走 `buffer.getLine(row)`（内部 `ybase + row`，
 * 即视口），多出来的行只在回滚区，不进读数。
 */
export const SCREEN_SCROLLBACK = 1;
/**
 * 建一块虚拟屏（`tty_screen` 的数据源）；失败降级为 null。
 *
 * 导出仅供单测（test/screen-crash.test.ts）钉住构造参数——生产路径是
 * `SessionManager.createScreen`，它必须与这里同源（就一行委托）。
 */
export function createHeadlessScreen(cols, rows) {
    try {
        // buffer 命名空间在 xterm 5.x 是提案 API，必须开 allowProposedApi
        return new HeadlessTerminal({ cols, rows, scrollback: SCREEN_SCROLLBACK, allowProposedApi: true });
    }
    catch {
        return null;
    }
}
/** xterm-headless 的异常都带这个文件名（压缩产物的堆栈里也是它）。 */
const XTERM_SCREEN_CRASH_RE = /xterm-headless|@xterm\/headless/;
/** 累计吞掉的虚拟屏异常数（只增不减；排障可见 + 单测断言用）。 */
let screenCrashTotal = 0;
/** 读累计吞掉的虚拟屏异常数。 */
export function xtermScreenCrashCount() {
    return screenCrashTotal;
}
/** 判定未捕获异常是否来自虚拟屏（xterm-headless）。导出仅供单测。 */
export function isXtermScreenCrash(err) {
    const stack = err instanceof Error ? (err.stack ?? '') : String(err);
    return XTERM_SCREEN_CRASH_RE.test(stack);
}
let xtermGuardRefs = 0;
let xtermGuardHandler;
/** 解绑兜底（引用计数归零才真正摘监听器）。 */
function releaseXtermScreenCrashGuard() {
    if (xtermGuardRefs === 0)
        return;
    if (--xtermGuardRefs > 0)
        return;
    if (xtermGuardHandler !== undefined) {
        process.off('uncaughtException', xtermGuardHandler);
        xtermGuardHandler = undefined;
    }
}
/**
 * 注册进程级虚拟屏异常兜底（D57）：把来自 xterm-headless 的未捕获异常吞掉并记账，
 * 让插件自己的 bug 不再拖垮整个 harness。幂等 + 引用计数，返回解绑函数。
 *
 * 两条边界（刻意如此，不是随手 `process.on`）：
 *   1. **只吞虚拟屏异常**——`isXtermScreenCrash` 按堆栈判定；其余异常照旧。
 *   2. **其余异常只在「我们是唯一的 uncaughtException 监听者」时抛回**：没有本兜底
 *      时未捕获异常会让宿主退出，抛回保住这个语义；已经有别的监听者（宿主/其它插件）
 *      时保持沉默，由它们决定——此时抛回反而会抢在别人前面把进程杀掉。
 */
export function installXtermScreenCrashGuard() {
    if (xtermGuardRefs++ > 0)
        return releaseXtermScreenCrashGuard;
    const handler = (err) => {
        if (isXtermScreenCrash(err)) {
            screenCrashTotal++;
            const message = err instanceof Error ? err.message : String(err);
            console.warn(`[dsh-tty] 虚拟屏（xterm-headless）未捕获异常已吞掉，不影响宿主（累计 ${screenCrashTotal} 次）：${message}`);
            return;
        }
        if (process.listenerCount('uncaughtException') <= 1)
            throw err;
    };
    xtermGuardHandler = handler;
    process.on('uncaughtException', handler);
    return releaseXtermScreenCrashGuard;
}
/* ------------------------------------------------------------------ *
 * 会话管理
 * ------------------------------------------------------------------ */
/** 导出仅供单测（test/host-frames.test.ts）：上限 / 孤儿回收 / grace 热改的行为护栏。 */
export class SessionManager {
    sessions = new Map();
    limit;
    /** 回收器销毁孤儿时是否连 tmux 持久会话一起结束（endOnPageClose 策略）。 */
    endTmuxOnReap = () => false;
    constructor(maxSessions, endTmuxOnReap) {
        this.limit = maxSessions;
        if (endTmuxOnReap !== undefined)
            this.endTmuxOnReap = endTmuxOnReap;
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
            owner: session.owner,
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
            attachable: session.clients.size === 0 && !session.closed,
        }));
    }
    /** 遍历全部会话（状态条采集器的批量收尾等按会话维度的操作）。 */
    forEach(fn) {
        for (const session of this.sessions.values())
            fn(session);
    }
    /** 按 tmux 持久会话名查找存活会话（跨窗口共享用）；不存在/已关闭返回 undefined。 */
    findByTmuxName(tmuxName) {
        for (const session of this.sessions.values()) {
            if (session.tmuxName === tmuxName && !session.closed)
                return session;
        }
        return undefined;
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
    /** 释放并销毁会话：退役 + 树级终止（等待 terminate 完成，最慢 ~20s）。
     *  endOnPageClose 策略下，回收器销毁孤儿时连 tmux 持久会话一起结束。 */
    async destroy(session) {
        this.retire(session);
        if (session.tmuxName !== null && this.endTmuxOnReap()) {
            try {
                await session.handle.tmuxTeardown?.();
            }
            catch {
                /* tmux 收尾失败不阻断回收 */
            }
        }
        await forceKill(session.handle);
    }
    /**
     * 回收孤儿会话（回收器定时调用）：超过保活期的回收。graceMs<=0 时立即回收
     * 全部孤儿——孤儿只在「断开瞬间 grace>0」时产生，热改 grace 为 0 不能只管
     * 以后：已存在的孤儿会永久占 PTY 与名额，满额后新标签一直报「会话数已达上限」。
     *
     * agent 开的会话（owner:'agent'）不走这条：它从出生起就没有客户端，判据
     * 「orphanedAt !== null」对它要么永不成立（不回收）要么被误当孤儿（一开就收）。
     * 它的关闭入口是 agent 的 tty_close 或用户在面板里接管后关标签。
     */
    async reapOrphans(graceMs) {
        const now = Date.now();
        for (const session of [...this.sessions.values()]) {
            if (session.owner === 'agent')
                continue;
            if (session.orphanedAt === null)
                continue;
            if (graceMs <= 0 || now - session.orphanedAt >= graceMs) {
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
/** 导出仅供单测（test/host-frames.test.ts）：帧校验 / 绑定 / 孤儿语义的行为护栏。 */
export class TtyServer {
    ctx;
    sessions;
    options;
    hostKeyStore;
    trackPersist;
    // maxPayload：ws 默认 100MiB，恶意/畸形帧会把内存打爆再 JSON.parse 复制一份；
    // 最大的合法帧是 input（128KB 上限，见 input 分支），给 4MiB 余量
    wss = new WebSocketServer({ noServer: true, maxPayload: 4 * 1024 * 1024 });
    /** 在途的持久会话创建（tmuxName → 创建 promise）：dsh 重启后多页面并发恢复时收敛竞态。 */
    pendingTmux = new Map();
    /** 已接线的面板连接（sessions 帧广播用；比 wss.clients 更贴合「面板」语义，单测也可驱动）。 */
    panels = new Set();
    /** WS 闸门（插件禁用时关闭）：拒绝新升级 + 断开存量连接。 */
    wsGateOpen = true;
    /** 服务器状态条总开关（配置热生效；关闭时停掉全部采集，重开按订阅恢复）。 */
    statsOn = true;
    constructor(ctx, sessions, options, hostKeyStore, 
    /** SSH 持久会话名留存回调（apply 闭包实现，settings 落盘）。 */
    trackPersist) {
        this.ctx = ctx;
        this.sessions = sessions;
        this.options = options;
        this.hostKeyStore = hostKeyStore;
        this.trackPersist = trackPersist;
        this.statsOn = options.statsEnabled;
        this.wss.on('connection', (ws) => this.onConnection(ws));
    }
    /**
     * 按启用状态对齐 WS 闸门（幂等）。关闭时对存量连接发正常关闭帧：客户端走
     * 既有重连循环，禁用期间升级被拒，重新启用后自动重连并 attach 孤儿会话。
     * PTY 进程不受影响（转孤儿保活），不因禁用杀用户进程。
     */
    setWsGate(open) {
        if (open === this.wsGateOpen)
            return;
        this.wsGateOpen = open;
        if (open)
            return;
        // 禁用：采集器先停（远端 exec channel / 本地定时器都不该活过闸门）
        this.stopAllStats();
        for (const ws of this.wss.clients) {
            try {
                ws.close(1001, 'dsh-tty disabled');
            }
            catch {
                /* 已关闭 */
            }
        }
    }
    /* --------------------------- 服务器状态条（0.17.0） --------------------------- */
    /**
     * 配置热生效：关闭时停掉全部采集（本地定时器 + 远端 exec channel）；重新打开
     * 时对**仍有订阅**的会话懒启动。订阅集合刻意不清——客户端只在标签可见性变化
     * 时发 statsOn/statsOff，开关来回切不该要求它重发。
     */
    setStatsEnabled(enabled) {
        this.statsOn = enabled;
        if (!enabled) {
            this.stopAllStats();
            return;
        }
        this.sessions.forEach((session) => {
            if (session.statsSubs.size > 0)
                this.startStats(session);
        });
    }
    /** 订阅/退订（tab 可见性驱动）：退到 0 即停表，任何路径都不会让采集器空转。键 = 绑定键（connId:sid）。 */
    setStatsSub(session, bindingKey, on) {
        if (on) {
            session.statsSubs.add(bindingKey);
            this.startStats(session);
            return;
        }
        session.statsSubs.delete(bindingKey);
        if (session.statsSubs.size === 0)
            this.stopStats(session);
    }
    /** 清掉指向已解绑客户端（WS 关闭 / 标签换 sid 重绑）的订阅，防采集器永不收尾。 */
    pruneStatsSubs(session) {
        for (const bindingKey of [...session.statsSubs]) {
            if (!session.clients.has(bindingKey))
                this.setStatsSub(session, bindingKey, false);
        }
    }
    /**
     * 懒启动采集（首个 statsOn 才起）。两条路径产出同形状的帧：
     *   - 本地：宿主进程就是那台机器，1s 定时器 + 进程级共享采样器（多个本地标签
     *     共享一次 df/netstat）；
     *   - SSH：远端 sh + awk 常驻循环，每秒一行 JSON 走**非 PTY** exec channel；
     *     速率类由远端算好，宿主只解析 + 清洗。
     * 任何失败都静默停表并置 statsFailed（粘性，避免每秒重启）：前端靠「无数据」
     * 隐藏状态条，PTY 数据路径与终端体验完全不受影响。
     */
    startStats(session) {
        if (!this.statsOn || session.closed || session.stats !== null || session.statsFailed)
            return;
        if (session.kind === 'local') {
            const sampler = localStatsSampler();
            let busy = false;
            let timer = null;
            const collector = {
                stop: () => {
                    if (timer !== null)
                        clearInterval(timer);
                    timer = null;
                },
            };
            const tick = () => {
                if (session.closed) {
                    collector.stop(); // 会话已回收：定时器自收尾，不依赖外部钩子是否齐全
                    return;
                }
                if (busy)
                    return; // 上一拍还没回来（df 卡住）就跳过，不堆积
                busy = true;
                void sampler.sample().then((frame) => {
                    busy = false;
                    if (session.stats !== collector || session.closed)
                        return;
                    if (hasStatsData(frame))
                        this.sendStats(session, frame);
                });
            };
            timer = setInterval(tick, STATS_INTERVAL_MS);
            timer.unref?.();
            session.stats = collector;
            tick(); // 首个订阅立刻出值，不让状态条空一个周期
            return;
        }
        const statsExec = session.handle.statsExec;
        if (statsExec === undefined) {
            session.statsFailed = true;
            return;
        }
        let stopped = false;
        /** 本次采集是否读到过合法帧——决定「这一跳结束」算失败还是算远端自己收摊。 */
        let sawFrame = false;
        let handle = null;
        const collector = {
            stop: () => {
                stopped = true;
                handle?.stop();
            },
        };
        /**
         * 起一跳采集。远端平台事先不知道，所以先跑 POSIX 脚本；若 channel 在**一帧
         * 数据都没读过**的情况下结束，说明对端不是 POSIX 平台（Windows 上 cmd.exe /
         * PowerShell 根本解析不了 sh -c 脚本），再换 PowerShell 版（-EncodedCommand，
         * 同帧形状）试一次。两跳都失败（如 macOS/BSD 远端：既无 /proc 也无 PowerShell）
         * 才置粘性失败位，前端按「无数据」隐藏状态条。
         */
        const attempt = (command, powershell) => {
            handle = statsExec(command, (line) => {
                if (stopped || session.closed)
                    return;
                const frame = parseStatsLine(line);
                if (frame === null)
                    return;
                sawFrame = true;
                if (hasStatsData(frame))
                    this.sendStats(session, frame);
            }, () => {
                if (stopped)
                    return; // 我们自己停的，不算失败
                if (!sawFrame && !powershell) {
                    attempt(buildWindowsStatsCommand(), true);
                    return;
                }
                // 读过帧 = 远端采集进程自己停了；一帧未读 = 彻底失败——都停表并置粘性失败位
                session.statsFailed = true;
                session.stats = null;
                collector.stop();
            });
        };
        // 先登记再起采集：同步失败（conn.exec 直接抛错）也走同一套收尾
        session.stats = collector;
        attempt(buildRemoteStatsCommand(), false);
        // 双跳同步失败时 collector.stop() 已把当时在手的句柄停掉；conn.exec 直接抛错的
        // 那一跳压根没建 channel，句柄是惰性的，不需要额外收尾。
    }
    /** 停表（幂等）：订阅清零 / 会话结束 / 插件禁用 / 配置关闭都走它。 */
    stopStats(session) {
        const collector = session.stats;
        session.stats = null;
        if (collector !== null)
            collector.stop();
    }
    stopAllStats() {
        this.sessions.forEach((session) => this.stopStats(session));
    }
    /** 帧只发给订阅了该会话的客户端（绑定键寻址，回帧带各连接自己的 sid，跨窗口共享也成立）。 */
    sendStats(session, frame) {
        // agent 侧 tty_stats 的数据源：不留档的话「没有面板订阅」的会话（agent 开的
        // 终端天然没有面板订阅）永远拿不到指标
        session.lastStats = frame;
        for (const bindingKey of session.statsSubs) {
            const client = session.clients.get(bindingKey);
            if (client === undefined)
                continue;
            try {
                send(client.ws, { t: 'stats', sid: client.sid, stats: frame });
            }
            catch {
                // readyState 检查与 send 之间对端可能刚关：不 try 的话异常会落在 ws 事件
                // 回调或采样 promise 里（未处理异常/未处理拒绝 → 宿主进程直接退出）
            }
        }
    }
    /** registerUpgrade 的 handler（loopback 围栏 + ws 握手）。 */
    handleUpgrade(req, socket, head) {
        if (!isLoopbackUpgrade(req)) {
            socket.destroy();
            return;
        }
        if (!this.wsGateOpen) {
            socket.destroy();
            return;
        }
        this.wss.handleUpgrade(req, socket, head, (ws) => {
            this.wss.emit('connection', ws, req);
        });
    }
    onConnection(ws) {
        /** 本连接的上下文：id 参与跨连接绑定键（D07）；open 供在途异步路径判「连接已死」（D06）。 */
        const conn = { id: randomUUID(), open: true };
        /** 本连接上的会话表（sid → session）；单连接多会话（标签页）。 */
        const local = new Map();
        this.panels.add(ws);
        ws.on('close', () => { this.panels.delete(ws); });
        const cleanupAll = async () => {
            const all = [...local.entries()];
            local.clear();
            await Promise.all(all.map(async ([clientSid, session]) => {
                if (session.closed)
                    return;
                // 解绑本连接的客户端（键 = connId:sid）；其余窗口仍绑定着（跨连接共享）时会话继续在线
                session.clients.delete(conn.id + ':' + clientSid);
                // WS 关闭/转孤儿：该端的 stats 订阅一并解绑（退到 0 就停表关 channel）
                this.pruneStatsSubs(session);
                if (session.clients.size > 0) {
                    this.flushPendingOutput(session);
                    return;
                }
                if (this.options.reconnectGraceMs > 0) {
                    // 客户端正常关面板会先逐个 kill（会话已移出 local），走到这里的都是
                    // 「异常断开仍有存活会话」：转孤儿保活，等待新连接 attach，到点由回收器清理
                    this.flushPendingOutput(session); // 没了收件人，待发帧直接丢弃（回放走环形缓冲）
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
            void this.handleMessage(ws, msg, local, cleanupAll, conn);
        });
        ws.on('close', () => {
            conn.open = false;
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
    /** 把一个客户端连接重绑定到既有会话（跨窗口共享 / 并发恢复收敛共用）。 */
    rebindClient(session, sid, ws, local, connId) {
        session.clients.set(connId + ':' + sid, { ws, sid });
        session.orphanedAt = null;
        this.pruneStatsSubs(session);
        if (session.paused) {
            session.paused = false;
            try {
                session.handle.output.resume();
            }
            catch {
                /* 已退出 */
            }
        }
        local.set(sid, session);
        send(ws, {
            t: 'ready',
            sid,
            pid: session.handle.pid,
            kind: session.kind,
            target: session.target !== '' ? session.target : undefined,
            ...(session.tmuxName !== null ? { persist: true } : {}),
        });
        if (session.tmuxName !== null)
            void session.handle.tmuxRefresh?.();
    }
    /**
     * agent 开一个本地终端（tty_open 的实现）。
     *
     * 设计前提（与用户确认过）：**开成面板里的普通会话，不做隐形会话** ——
     * 会话照常进 `sessions` 快照、面板能看见并接管、用户随时可以关。理由是
     * D06 那类「僵尸会话」正是隐形会话的产物：用户不知道机器上跑着什么。
     *
     * 与 `spawn` 帧的差别只有两处：没有 ws（clients 空表）、owner:'agent'
     * （逃过孤儿回收，见 reapOrphans）。
     */
    async openAgentSession(input) {
        if (!this.sessions.canSpawn()) {
            throw new Error(`会话数已达上限（${this.sessions.limitValue}）——先在面板里关掉不用的标签，或调大「并发会话上限」`);
        }
        const cwd = typeof input.cwd === 'string' && input.cwd.trim() !== '' ? input.cwd.trim() : this.options.cwd;
        if (!existsSync(cwd))
            throw new Error(`cwd 不存在: ${cwd}`);
        const sid = randomUUID();
        const command = typeof input.command === 'string' && input.command.trim() !== '' ? input.command.trim() : null;
        // 命令型会话不做 tmux 持久化（命令短命，与 spawn 帧同规则）
        const persistName = command === null && typeof input.persistName === 'string' && input.persistName !== '' && this.options.persistence === 'tmux'
            ? sanitizePersistName(input.persistName, sid)
            : null;
        // 同 persistName 已有存活会话：直接复用（跨窗口共享同语义），不新建 PTY
        if (persistName !== null) {
            const existing = this.sessions.findByTmuxName(persistName);
            if (existing !== undefined)
                return { sid: existing.id, persist: true };
        }
        const { session, degraded } = await this.createLocalSession({
            sid,
            cols: input.cols,
            rows: input.rows,
            cwd,
            command,
            persistName,
            client: null, // agent 路径：无客户端
            local: new Map(),
            owner: 'agent',
        });
        // 面板可见性：新会话推给所有已连接的面板（客户端据此建「agent 开的」标签）
        this.broadcastSessions();
        return { sid: session.id, persist: session.tmuxName !== null && !degraded };
    }
    /** agent 关掉一个会话（tty_close 的实现）：只允许关 agent 自己开的，用户标签不越权。 */
    async closeAgentSession(sid) {
        const session = this.sessions.get(sid);
        if (session === undefined || session.closed)
            throw new Error(`会话不存在或已结束: ${sid}`);
        if (session.owner !== 'agent') {
            throw new Error(`会话 ${sid} 是用户在面板里开的（owner=user）：请在面板里关闭那个标签，不要由 agent 越权结束`);
        }
        this.flushPendingOutput(session);
        this.killSessionNow(session);
        this.broadcastSessions();
        return { ok: true };
    }
    /**
     * 把当前会话清单推给所有已连接面板（agent 开关会话后让面板即时反映）。
     *
     * 用自己登记的连接集合而不是 `this.wss.clients`：后者只在真实 WS 服务器
     * 接线时才有值（单测直接调 onConnection 时为空），且语义上我们要的是
     * 「已接线的面板连接」。
     */
    broadcastSessions() {
        const list = this.sessions.listForAttach();
        for (const ws of this.panels) {
            send(ws, { t: 'sessions', list, tmux: [] });
        }
    }
    /**
     * 取一次会话所在机器的指标（tty_stats 的实现）。
     *
     * 按需采样、不依赖面板是否订阅状态条：本地会话直接跑本地采样器；SSH 会话在
     * 同一连接上开一次性 exec channel 跑一帧脚本（statsExec 的常驻循环不适合
     * 一次性取数，故用 handle.statsExec 的单帧变体——没有的话返回最近留档）。
     * 失败不抛给 agent 的判断链：返回 available:false + 原因。
     */
    async sampleStats(session) {
        if (session.kind === 'local') {
            try {
                const frame = await localStatsSampler().sample();
                if (!hasStatsData(frame))
                    return { available: false, reason: '本机未采到可用指标（平台不支持或字段全缺）' };
                session.lastStats = frame;
                return { available: true, frame };
            }
            catch (error) {
                return { available: false, reason: `本机采样失败: ${error instanceof Error ? error.message : String(error)}` };
            }
        }
        const statsExec = session.handle.statsExec;
        if (statsExec === undefined) {
            // 没有 exec 通道（或远端不支持）：退回最近留档（面板订阅过就有）
            if (session.lastStats !== null)
                return { available: true, frame: session.lastStats };
            return { available: false, reason: '该 SSH 会话没有可用的采集通道，且没有历史留档' };
        }
        // 一次性取一帧：脚本是常驻循环，收到第一帧即 stop
        return await new Promise((resolve) => {
            let settled = false;
            let handle = null;
            const finish = (result) => {
                if (settled)
                    return;
                settled = true;
                try {
                    handle?.stop();
                }
                catch {
                    /* 已停 */
                }
                resolve(result);
            };
            const timer = setTimeout(() => { finish({ available: false, reason: '远端采集超时（3s）' }); }, 3000);
            timer.unref?.();
            try {
                handle = statsExec(buildRemoteStatsCommand(), (line) => {
                    const frame = parseStatsLine(line);
                    if (frame === null)
                        return;
                    clearTimeout(timer);
                    session.lastStats = frame;
                    finish({ available: true, frame });
                }, () => {
                    clearTimeout(timer);
                    // 一帧未读就结束：远端可能非 POSIX（Windows 远端走 PowerShell 版）
                    if (session.lastStats !== null)
                        finish({ available: true, frame: session.lastStats });
                    else
                        finish({ available: false, reason: '远端采集通道结束且未产出数据' });
                });
            }
            catch (error) {
                clearTimeout(timer);
                finish({ available: false, reason: `远端采集启动失败: ${error instanceof Error ? error.message : String(error)}` });
            }
        });
    }
    /** 等待同 tmuxName 的在途创建完成；返回可重绑定的会话（null = 无在途/已失败）。 */
    async waitPendingTmux(tmuxName) {
        const inflight = this.pendingTmux.get(tmuxName);
        if (inflight === undefined)
            return null;
        try {
            return await inflight;
        }
        catch {
            return null;
        }
    }
    /**
     * 创建本地会话（0.20.0 抽出，供 WS `spawn` 帧与 agent `tty_open` 共用）。
     *
     * 与连接无关是这次抽出的全部意义：`spawn` 帧带一个 ws（用户开的标签要立刻
     * ready + 收输出），`tty_open` 没有 ws（agent 开的会话从出生起就没有客户端，
     * 靠 owner:'agent' 逃过孤儿回收）。两条路径共用同一套：
     *   - tmux 持久化探测与资源准备（同 persistName 复用既有会话，名额不翻倍）；
     *   - cwd 校验、spawnPlan 组装、并发在途收敛（pendingTmux）；
     *   - 会话对象装配 + 输出下行挂载 + 退出收尾。
     *
     * 调用方负责：上限检查（canSpawn）、错误帧、ready/notice 的呈现。
     * `client` 为 null 时创建无客户端的会话（agent 路径）。
     */
    async createLocalSession(input) {
        const { sid, cols, rows, cwd, command, persistName, client, local, owner } = input;
        const subprocess = this.ctx.get('subprocess');
        if (subprocess === undefined)
            throw new Error('subprocess 服务不可用');
        const wantsPersist = persistName !== null;
        let spawnPlan = command !== null
            ? buildCommandSpawn(this.options.shell, this.options.term, this.options.colorTerm, command)
            : buildShellSpawn(this.options.shell, this.options.term, this.options.colorTerm, this.options.shellIntegration);
        let tmuxName = null;
        let degraded = false;
        if (wantsPersist) {
            const probe = await probeTmux();
            if (probe.available) {
                tmuxName = persistName;
                ensureTmuxAssets({ shell: this.options.shell, colorTerm: this.options.colorTerm, shellIntegration: this.options.shellIntegration, passthrough: probe.passthrough });
                spawnPlan = buildTmuxSpawnPlan({ shell: this.options.shell, term: this.options.term, colorTerm: this.options.colorTerm, tmuxName });
            }
            else {
                degraded = true; // tmux 不在：降级普通会话，由调用方给灰字提示
            }
        }
        const create = (async () => {
            const handle = wrapLocalPty(await subprocess.spawnTerminal({
                argv: spawnPlan.argv,
                rows: clampInt(rows, 24, 2, 200),
                cols: clampInt(cols, 80, 2, 500),
                cwd,
                env: { TERM: this.options.term, COLORTERM: this.options.colorTerm, ...spawnPlan.env },
                graceMs: 5000,
            }));
            if (tmuxName !== null) {
                handle.tmuxTeardown = () => killTmuxSession(tmuxName);
                handle.tmuxRefresh = () => refreshTmuxClient(tmuxName);
            }
            const next = {
                id: sid,
                handle,
                clients: new Map(),
                closed: false,
                paused: false,
                owner,
                cwd,
                kind: 'local',
                target: '',
                startedAt: Date.now(),
                lastOutputAt: Date.now(),
                lastInputAt: Date.now(),
                buffer: '',
                decoder: new StringDecoder('utf8'),
                screen: this.createScreen(clampInt(cols, 80, 2, 500), clampInt(rows, 24, 2, 200)),
                orphanedAt: null,
                shellState: createShellState(),
                pendingOutput: '',
                flushTimer: null,
                tmuxName,
                statsSubs: new Set(),
                lastStats: null,
                stats: null,
                statsFailed: false,
            };
            // 绑定：有客户端才绑（agent 路径 client === null → 保持空表 = 无客户端会话）。
            // 空表但 owner:'agent'，故不会被孤儿回收器当孤儿收掉。
            if (client !== null)
                next.clients.set(client.connId + ':' + sid, { ws: client.ws, sid });
            local.set(sid, next);
            this.sessions.add(next);
            // spawn 在途连接断开（0.19.0）：cleanupAll 已跑过、扫不到此刻才入表的
            // 会话——转孤儿（等重连 attach 或回收器清理）。不处理的话会话绑死已
            // 关闭的 ws 且 orphanedAt 永为 null：回收器永不扫到，PTY 与名额永久泄漏，
            // 重连 attach 还被拒并谎报「会话已连接到其它窗口」。
            if (client !== null && (!client.ws.readyState || client.ws.readyState !== WebSocket.OPEN)) {
                next.clients.clear();
                next.orphanedAt = Date.now();
            }
            return next;
        })();
        if (tmuxName !== null) {
            const registered = create.catch(() => null);
            this.pendingTmux.set(tmuxName, registered);
            void registered.finally(() => {
                if (this.pendingTmux.get(tmuxName) === registered)
                    this.pendingTmux.delete(tmuxName);
            });
        }
        const session = await create;
        this.attachOutput(session);
        this.watchDone(session, local);
        return { session, wantsPersist, degraded };
    }
    /**
     * 立即终止会话：同步退役 + 顶层 shell 直接 SIGKILL，让 done/exit 帧立刻可发；
     * 树级子进程清理（SIGTERM→grace→SIGKILL，交互式 zsh 忽略 SIGTERM 时最慢
     * 可拖 ~20s）由 terminate 在后台继续收尾，不阻塞 kill 帧处理。
     * tmux 背书会话先向 tmux server 发 kill-session（杀客户端只会 detach，
     * 会话会留在 tmux server 上）；2.5s 兜底 forceKill 防收尾悬挂。
     */
    killSessionNow(session) {
        // 采集器先收（远端 exec channel 与本地定时器都不该活过会话）
        session.statsSubs.clear();
        this.stopStats(session);
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
    /** 每会话一块虚拟屏（xterm-headless）：tty_screen 的数据源；失败降级为 null。
     *  构造参数在 createHeadlessScreen（D57：scrollback 不能是 0），这里只做委托。 */
    createScreen(cols, rows) {
        return createHeadlessScreen(cols, rows);
    }
    async handleMessage(ws, msg, local, cleanupAll, conn) {
        try {
            // 连接已关闭（close 后仍有在途帧排队）：任何绑定/创建都不再落到死连接上
            if (!conn.open)
                return;
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
                // 持久化（0.10.0）：配置 persistence=tmux 且帧带 persist 时，spawn 包装层
                // 换成 `exec tmux -L dsh-tty -A -s <名>`（tmux 托管）；tmux 未安装则降级
                // 普通会话并回灰字提示。持久名稳定（客户端生成、随标签规格保存），
                // 宿主重启后重开标签按同名 attach 回原 tmux 会话
                // 命令标签（0.14.0）：直接跑一条命令，不做 tmux 持久化（命令短命）
                const parsedCommand = sanitizeCommand(msg.command);
                if (parsedCommand.error !== undefined) {
                    send(ws, { t: 'error', sid, m: parsedCommand.error });
                    return;
                }
                const command = parsedCommand.command ?? null;
                const persistName = command === null && msg.persist === true && this.options.persistence === 'tmux'
                    ? sanitizePersistName(msg.persistName, sid)
                    : null;
                // 跨窗口共享（0.10.1）：同 tmuxName 的宿主会话还活着（别的窗口接回过，
                // 或同刻并发恢复的在途创建）时不再新建 PTY，本连接重绑定到它——
                // 单 PTY 多客户端扇出，名额不翻倍
                if (persistName !== null) {
                    const existing = (this.sessions.findByTmuxName(persistName) ?? (await this.waitPendingTmux(persistName))) ?? null;
                    if (existing !== null) {
                        if (!conn.open)
                            return; // 等待在途创建期间连接断了：不往死连接上绑
                        this.rebindClient(existing, sid, ws, local, conn.id);
                        return;
                    }
                }
                if (!this.sessions.canSpawn()) {
                    send(ws, { t: 'error', sid, m: `会话数已达上限（${this.sessions.limitValue}）——每个窗口的每个标签各占一个名额：关闭不用的窗口/标签，或在设置卡片调大「并发会话上限」` });
                    return;
                }
                // 客户端（当前会话）cwd 优先；校验存在性，避免 node-pty 抛难懂错误
                const cwd = typeof msg.cwd === 'string' && msg.cwd.trim() !== '' ? msg.cwd.trim() : this.options.cwd;
                if (!existsSync(cwd)) {
                    send(ws, { t: 'error', sid, m: `cwd 不存在: ${cwd}` });
                    return;
                }
                // 会话创建走共用工厂（与 agent tty_open 同一套）；用户开的标签带连接，
                // 立刻 ready + 收输出
                let created;
                try {
                    created = await this.createLocalSession({
                        sid,
                        cols: msg.cols,
                        rows: msg.rows,
                        cwd,
                        command,
                        persistName,
                        client: { ws, connId: conn.id },
                        local,
                        owner: 'user',
                    });
                }
                catch (error) {
                    send(ws, { t: 'error', sid, m: error instanceof Error ? error.message : String(error) });
                    return;
                }
                const next = created.session;
                send(ws, { t: 'ready', sid, pid: next.handle.pid, kind: 'local', ...(next.tmuxName !== null ? { persist: true } : {}) });
                if (created.wantsPersist && created.degraded) {
                    const notice = '\x1b[2m[dsh-tty] 未检测到 tmux，本标签以普通会话运行；安装 tmux 后持久化标签可跨宿主重启恢复现场\x1b[0m\r\n';
                    next.buffer = tailFromSafeBoundary(next.buffer + notice, BUFFER_CAP);
                    send(ws, { t: 'data', sid, d: notice });
                }
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
                // 跨窗口共享（0.10.1）：同 tmuxName 的 SSH 持久会话还活着时不重建远程
                // 连接，本连接重绑定到现有会话（单 PTY 多客户端扇出）
                const parsedCommand = sanitizeCommand(msg.command);
                if (parsedCommand.error !== undefined) {
                    send(ws, { t: 'error', sid, m: parsedCommand.error });
                    return;
                }
                const command = parsedCommand.command ?? null;
                const persistName = command === null && msg.persist === true && this.options.persistence === 'tmux'
                    ? sanitizePersistName(msg.persistName, sid)
                    : null;
                if (persistName !== null) {
                    const existing = (this.sessions.findByTmuxName(persistName) ?? (await this.waitPendingTmux(persistName))) ?? null;
                    if (existing !== null && existing.kind === 'ssh' && !existing.closed) {
                        if (!conn.open)
                            return; // 等待在途创建期间连接断了：不往死连接上绑
                        this.rebindClient(existing, sid, ws, local, conn.id);
                        return;
                    }
                }
                if (!this.sessions.canSpawn()) {
                    send(ws, { t: 'error', sid, m: `会话数已达上限（${this.sessions.limitValue}）——每个窗口的每个标签各占一个名额：关闭不用的窗口/标签，或在设置卡片调大「并发会话上限」` });
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
                const wantsPersist = persistName !== null;
                const persistOpt = wantsPersist ? { name: persistName } : undefined;
                // 在途注册：同 persistName 的并发恢复等待本次创建完成后重绑定（防竞态翻倍）
                const create = (async () => {
                    let handle;
                    try {
                        handle = await spawnSsh(spec, {
                            term: this.options.term,
                            cols: clampInt(msg.cols, 80, 2, 500),
                            rows: clampInt(msg.rows, 24, 2, 200),
                            logger: { info: (m) => this.ctx.logger.info(m), warn: (m) => this.ctx.logger.warn(m) },
                            hostKeyStore: this.hostKeyStore,
                            ...(command !== null ? { command } : {}),
                            ...(persistOpt !== undefined ? { persist: persistOpt } : {}),
                        });
                    }
                    catch (error) {
                        send(ws, { t: 'error', sid, m: error instanceof Error ? error.message : String(error) });
                        throw error;
                    }
                    const tmuxName = persistOpt !== undefined && handle.startupNotice === undefined ? persistOpt.name : null;
                    const next = {
                        id: sid,
                        handle,
                        clients: new Map([[conn.id + ':' + sid, { ws, sid }]]),
                        closed: false,
                        paused: false,
                        owner: 'user',
                        cwd: '',
                        kind: 'ssh',
                        target,
                        startedAt: Date.now(),
                        lastOutputAt: Date.now(),
                        lastInputAt: Date.now(),
                        buffer: '',
                        decoder: new StringDecoder('utf8'),
                        screen: this.createScreen(clampInt(msg.cols, 80, 2, 500), clampInt(msg.rows, 24, 2, 200)),
                        orphanedAt: null,
                        shellState: createShellState(),
                        pendingOutput: '',
                        flushTimer: null,
                        tmuxName,
                        statsSubs: new Set(),
                        lastStats: null,
                        stats: null,
                        statsFailed: false,
                    };
                    local.set(sid, next);
                    this.sessions.add(next);
                    // spawn 在途连接断开（0.19.0）：转孤儿，理由与本地分支相同；SSH 连接
                    // （含远程 tmux 持久会话）保持存活等重连 attach，到点由回收器收尾
                    if (!conn.open || ws.readyState !== WebSocket.OPEN) {
                        next.clients.clear();
                        next.orphanedAt = Date.now();
                    }
                    send(ws, { t: 'ready', sid, pid: null, kind: 'ssh', target, ...(tmuxName !== null ? { persist: true } : {}) });
                    if (tmuxName !== null)
                        this.trackPersist(tmuxName, true); // 留存：远程 tmux 本机清单看不到
                    if (handle.startupNotice !== undefined) {
                        const notice = `\x1b[2m[dsh-tty] ${handle.startupNotice}\x1b[0m\r\n`;
                        next.buffer = tailFromSafeBoundary(next.buffer + notice, BUFFER_CAP);
                        send(ws, { t: 'data', sid, d: notice });
                    }
                    this.attachOutput(next);
                    this.watchDone(next, local);
                    return next;
                })();
                if (persistName !== null) {
                    const registered = create.catch(() => null);
                    this.pendingTmux.set(persistName, registered);
                    void registered.finally(() => {
                        if (this.pendingTmux.get(persistName) === registered)
                            this.pendingTmux.delete(persistName);
                    });
                }
                try {
                    await create;
                }
                catch {
                    return; // 错误帧已在创建闭包内发送
                }
            }
            else if (msg.t === 'input') {
                const data = typeof msg.d === 'string' ? msg.d : '';
                // 长度上限（对照 sanitizeCommand 的 2000）：粘贴大文本是正常用例，
                // >128KB 的「按键输入」只能是畸形/滥用——拒绝而不是让它进 PTY
                if (data.length > 128 * 1024) {
                    send(ws, { t: 'error', m: 'input 帧过大（>128K 字符），已拒绝' });
                    return;
                }
                const resolved = this.resolveSid(ws, msg, local);
                if (resolved === undefined || 'unknown' in resolved)
                    return;
                const session = local.get(resolved.sid);
                if (session !== undefined && !session.closed) {
                    session.lastInputAt = Date.now();
                    await session.handle.write(data);
                }
            }
            else if (msg.t === 'resize') {
                const resolved = this.resolveSid(ws, msg, local);
                if (resolved === undefined || 'unknown' in resolved)
                    return;
                const session = local.get(resolved.sid);
                if (session !== undefined) {
                    const cols = clampInt(msg.cols, 80, 2, 500);
                    const rows = clampInt(msg.rows, 24, 2, 200);
                    session.handle.resize(cols, rows);
                    try {
                        session.screen?.resize(cols, rows);
                    }
                    catch {
                        /* 非法尺寸或已释放 */
                    }
                }
            }
            else if (msg.t === 'refresh') {
                // 强制 tmux 重画（0.10.1）：客户端 reset 清掉残 scrollback 后请宿主
                // refresh-client 重画现场——不碰尺寸，规避隐藏标签下 proposeDimensions
                // 返回垃圾尺寸把 pane 压扁的隐患；非 tmux 会话为无害 no-op
                const resolved = this.resolveSid(ws, msg, local);
                if (resolved === undefined || 'unknown' in resolved)
                    return;
                const session = local.get(resolved.sid);
                if (session !== undefined && !session.closed && session.tmuxName !== null) {
                    void session.handle.tmuxRefresh?.();
                }
            }
            else if (msg.t === 'kill') {
                const resolved = this.resolveSid(ws, msg, local);
                if (resolved === undefined)
                    return;
                if ('unknown' in resolved) {
                    // 本连接没有该 sid：若是孤儿会话（前连接已断、无人绑定）也允许 kill，
                    // 避免「关闭面板杀不掉孤儿」泄漏到保活期结束。仍被任何连接绑定的会话
                    // 绝不在此路径杀——任意 loopback 帧（含失效旧 sid）凭 sid 就能 SIGKILL
                    // 别的窗口正在跑的构建，那是提权级事故（0.19.0 加前提）。
                    const orphan = this.sessions.get(String(msg.sid ?? ''));
                    if (orphan !== undefined && !orphan.closed) {
                        if (orphan.clients.size > 0) {
                            send(ws, { t: 'error', sid: String(msg.sid ?? ''), m: '该会话正连接在其它窗口：请到那个窗口关闭标签，或先在本窗口 attach' });
                            return;
                        }
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
                // tmux 字段（0.10.1）：本机 socket 现存持久会话 + SSH 持久会话名（远程
                // tmux 托管、本机清单看不到，从 settings 留存读取）——客户端用它确认
                // localStorage 里的持久标签规格是否仍可恢复（新窗口/新浏览器）
                const localTmux = await listTmuxSessions();
                const tmuxSessions = [...new Set([...localTmux, ...this.options.persistSessions])];
                send(ws, { t: 'sessions', list: this.sessions.listForAttach(), tmux: tmuxSessions });
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
                // 跨连接共享（0.10.1）：tmux 持久会话允许多窗口同时绑定（单 PTY 扇出）；
                // 非 tmux 会话仍独占（两个视图交错输入无意义）
                if (session.clients.size > 0 && session.tmuxName === null) {
                    send(ws, { t: 'error', sid: raw, m: '会话已连接到其它窗口' });
                    return;
                }
                // 重新绑定到本连接（键 = connId:sid，连接侧 sid 供帧寻址）：解孤儿态，
                // 恢复被背压暂停的输出流
                session.clients.set(conn.id + ':' + raw, { ws, sid: raw });
                session.orphanedAt = null;
                local.set(raw, session);
                if (session.paused) {
                    session.paused = false;
                    try {
                        session.handle.output.resume();
                    }
                    catch {
                        /* 已退出 */
                    }
                }
                send(ws, { t: 'ready', sid: raw, pid: session.handle.pid, kind: session.kind, target: session.target !== '' ? session.target : undefined, reattached: true, ...(session.tmuxName !== null ? { persist: true } : {}) });
                // 断线期间的输出经 256KB 环形缓冲回放（缓冲为空则跳过）。
                // tmux 背书会话例外：现场由 tmux 负责重画——回放会把缓冲里的可见屏
                // 先写进全新 xterm（制造屏外幽灵滚动历史 → 莫名滚动条），随后 tmux
                // 整屏重画再画一遍（内容重影）；故跳过回放，强制 tmux 重画一次
                if (session.tmuxName !== null) {
                    void session.handle.tmuxRefresh?.();
                }
                else if (session.buffer !== '') {
                    send(ws, { t: 'data', sid: raw, d: session.buffer });
                }
            }
            else if (msg.t === 'statsOn' || msg.t === 'statsOff') {
                this.handleStatsFrame(ws, msg, local, conn.id);
            }
        }
        catch (error) {
            send(ws, { t: 'error', m: error instanceof Error ? error.message : String(error) });
        }
    }
    /**
     * 服务器状态条订阅（0.17.0）：按「标签可见性」驱动——只有可见标签才发
     * statsOn。未知 sid（客户端竞态）静默忽略，不回错误帧。订阅键与客户端
     * 绑定键同构（connId:sid），跨连接共享同一 sid 时互不踩。
     */
    handleStatsFrame(ws, msg, local, connId) {
        const resolved = this.resolveSid(ws, msg, local);
        if (resolved === undefined || 'unknown' in resolved)
            return;
        const session = local.get(resolved.sid);
        if (session === undefined || session.closed)
            return;
        this.setStatsSub(session, connId + ':' + resolved.sid, msg.t === 'statsOn');
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
            session.statsSubs.clear();
            this.stopStats(session);
            local.delete(session.id);
            this.sessions.remove(session.id);
            if (session.kind === 'ssh' && session.tmuxName !== null)
                this.trackPersist(session.tmuxName, false);
            try {
                session.screen?.dispose();
            }
            catch {
                /* 已释放 */
            }
            this.flushPendingOutput(session); // exit 前冲掉合并窗口里的尾巴，保序
            // exit 广播到所有绑定连接（跨窗口共享），各客户端按自己的 sid 收址
            for (const client of session.clients.values()) {
                send(client.ws, { t: 'exit', sid: client.sid, code: outcome.exitCode, signal: outcome.signal });
            }
            session.clients.clear();
        }).catch(() => { });
    }
    /** 输出下行 + 基于 ws.bufferedAmount 的背压（暂停/恢复 PassThrough）。 */
    attachOutput(session) {
        const output = session.handle.output;
        const flush = () => {
            session.flushTimer = null;
            const pending = session.pendingOutput;
            if (session.closed || session.clients.size === 0 || pending === '')
                return;
            session.pendingOutput = '';
            let maxBuffered = 0;
            for (const client of session.clients.values()) {
                try {
                    client.ws.send(JSON.stringify({ t: 'data', sid: client.sid, d: pending }), () => {
                        if (session.paused && client.ws.bufferedAmount < BACKPRESSURE_LOW && output.readableFlowing === false) {
                            output.resume();
                        }
                    });
                    maxBuffered = Math.max(maxBuffered, client.ws.bufferedAmount);
                }
                catch {
                    /* 客户端已断开 */
                }
            }
            if (!session.paused && maxBuffered > BACKPRESSURE_HIGH) {
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
            session.buffer = tailFromSafeBoundary(session.buffer + text, BUFFER_CAP);
            feedShellIntegration(session, text);
            try {
                session.screen?.write(text);
            }
            catch {
                /* 同步抛出（尺寸非法等）；异步解析异常拦不住，由 installXtermScreenCrashGuard 兜底（D57） */
            }
            if (session.clients.size === 0)
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
        const pending = session.pendingOutput;
        session.pendingOutput = '';
        if (session.closed || session.clients.size === 0 || pending === '')
            return;
        for (const client of session.clients.values()) {
            send(client.ws, { t: 'data', sid: client.sid, d: pending });
        }
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
    // 托管区块标记（与 env 插件 MARK_START/MARK_END 逐字符一致）
    const MARK_START = '# --- dsh-env-manager managed (auto-generated; do not edit) ---';
    const MARK_END = '# --- end dsh-env-manager managed ---';
    const dshHome = resolveDshHome();
    const file = process.env.DSH_ENV_FILE?.trim() || join(dshHome, 'env.yml');
    try {
        const lines = readFileSync(file, 'utf8').split('\n');
        // 标记必须整行精确匹配（trimEnd 仅容忍 \r 与尾部空格）：值经 yaml literal block
        // 缩进渲染，子串匹配会把值内的标记文本误判为区块边界，导致键名提取落空。
        const start = lines.findIndex((line) => line.trimEnd() === MARK_START);
        if (start === -1)
            return [];
        const end = lines.findIndex((line, index) => index > start && line.trimEnd() === MARK_END);
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
 * 凭据存储里**已知的引用名**（~/.dsh/.credentials.yaml 的 `refs:` 块键），只读给
 * SSH 对话框的引用选择器当候选。
 *
 * 为什么必须读文件：官方把「引用半边」设计成**不可枚举**——
 * `CredentialProvider.listRecords` 的注释原话是 "Unlike the reference half, which has no
 * enumeration because configuration surfaces learn which references exist from settings
 * schemas"，而浏览器侧 `ctx.remote.credentials`（dsh-api-settings-controller）只开
 * `describe` / `set` / `unset`，连 `listRecords` 都没开。所以要让用户在下拉里看见
 * "这本存储里已经有什么名字"，宿主侧读文件是唯一出路；**只要键名、不取值**（值只在本函数
 * 的局部 `lines` 里路过，不进任何返回值，也不写日志）。
 *
 * 解析刻意最小（与上面 readManagedEnvKeys 同款，不为它引 YAML 依赖）：只认 `refs:` 顶层
 * 区块内「恰好两个空格 + POSIX 标识符 + 冒号」的行。本地 provider 写入时用 `yaml` 严格
 * 校验过（version: 1 / 值必须非空字符串 / 键必须是标识符），所以这个格式是稳的；真被手改
 * 坏了也只是候选少几个 —— 引用最终仍由连接时的凭据层校验存在性。
 *
 * 路径解析与本地 provider 的默认一致（$DSH_HOME 优先，空串视为未设，再退 ~/.dsh）。边界：
 * 若有人给 provider 配了自定义 `path` / `dshHome`，这里看不到那些引用（字段仍可手输名字）。
 */
/**
 * `/api/dsh-tty/credential-refs` 的路由逻辑（导出仅供单测
 * test/credential-refs.test.ts）：loopback 闸门 + 方法闸门 + 只回引用名的载荷。
 * 值在任何分支都不进响应——SSH 对话框的选择器只需要「我存过哪些名字」。
 */
export async function handleCredentialRefsRoute(req, res) {
    if (!isLoopbackHttp(req)) {
        writeJson(res, 403, { error: 'forbidden: loopback-only' });
        return;
    }
    if (req.method !== 'GET') {
        writeJson(res, 405, { error: 'method not allowed: ' + String(req.method) });
        return;
    }
    writeJson(res, 200, { ok: true, names: readCredentialRefNames() });
}
/** 导出仅供单测（test/credential-refs.test.ts）：只验键名解析，不取值。 */
export function readCredentialRefNames() {
    const dshHome = resolveDshHome();
    const file = join(dshHome, '.credentials.yaml');
    try {
        const names = [];
        let inRefs = false;
        for (const line of readFileSync(file, 'utf8').split('\n')) {
            // 顶层键（0 缩进）切换区块；`refs:` 之后的条目才是引用名
            if (/^[A-Za-z_][A-Za-z0-9_]*:/.test(line)) {
                inRefs = line.startsWith('refs:');
                continue;
            }
            if (!inRefs)
                continue;
            const match = line.match(/^ {2}([A-Za-z_][A-Za-z0-9_]*):/);
            if (match !== null)
                names.push(match[1]);
        }
        return [...new Set(names)].sort().slice(0, 500);
    }
    catch {
        // 没有存储文件（还没存过任何东西）/ 没有读权限：候选为空，不报错
        return [];
    }
}
/**
 * 设置卡片「Shell 路径」候选（可选可输入的数据源）：POSIX 走 /etc/shells + $SHELL +
 * 常见安装路径；**Windows 走 %COMSPEC% + Windows PowerShell + PowerShell 7**（原先这套
 * 候选在 Windows 上恒为空——/bin/zsh 那批路径一个都不存在）。去重后过滤「存在且可执行」，
 * 默认 shell 排最前。只回路径，不做任何执行。
 */
function listCandidateShells() {
    const candidates = [];
    const push = (value) => {
        const path = value?.trim() ?? '';
        if (path !== '' && !candidates.includes(path))
            candidates.push(path);
    };
    const fallback = defaultShellPath();
    if (process.platform === 'win32') {
        const systemRoot = process.env.SystemRoot?.trim() || 'C:\\Windows';
        const programFiles = process.env.ProgramFiles?.trim() || 'C:\\Program Files';
        const localAppData = process.env.LOCALAPPDATA?.trim() || '';
        // 全给**绝对路径**：候选的过滤口径是「存在且可执行」，裸命令名（pwsh.exe）在这里判不了，
        // 而这三处覆盖了 Windows 上实际存在的 shell（%COMSPEC% 必在，Windows PowerShell 必在，
        // PowerShell 7 装了才有）。
        push(process.env.COMSPEC);
        push(join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'));
        push(join(programFiles, 'PowerShell', '7', 'pwsh.exe'));
        if (localAppData !== '')
            push(join(localAppData, 'Microsoft', 'WindowsApps', 'pwsh.exe'));
    }
    else {
        try {
            for (const line of readFileSync('/etc/shells', 'utf8').split('\n')) {
                const path = line.trim();
                if (path !== '' && !path.startsWith('#'))
                    push(path);
            }
        }
        catch {
            /* 无 /etc/shells 时跳过 */
        }
        push(process.env.SHELL);
        for (const path of [
            '/bin/zsh', '/usr/bin/zsh', '/usr/local/bin/zsh', '/opt/homebrew/bin/zsh',
            '/bin/bash', '/usr/bin/bash', '/usr/local/bin/bash', '/opt/homebrew/bin/bash',
            '/bin/fish', '/usr/bin/fish', '/usr/local/bin/fish', '/opt/homebrew/bin/fish',
            '/bin/sh', '/bin/dash', '/bin/ksh', '/bin/tcsh', '/bin/csh',
        ])
            push(path);
    }
    const usable = candidates.filter((path) => {
        try {
            accessSync(path, fsConstants.X_OK);
            return true;
        }
        catch {
            return false;
        }
    });
    usable.sort((a, b) => (a === fallback ? -1 : b === fallback ? 1 : a.localeCompare(b)));
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
/** 人类可读时长（tty_stats 的「在线时长」用）。 */
function humanDuration(seconds) {
    const s = Math.max(0, Math.floor(seconds));
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (d > 0)
        return `${String(d)} 天 ${String(h)} 小时`;
    if (h > 0)
        return `${String(h)} 小时 ${String(m)} 分`;
    return `${String(m)} 分`;
}
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
    // 与远程栏同一套排序（0.19.0，见 SftpManager.list）：目录优先 + localeCompare
    // ——此前本机栏完全不排，同一面板左右两栏规则不一致，定位文件靠肉眼扫
    entries.sort((a, b) => {
        const kindDiff = (a.isDir ? 0 : 1) - (b.isDir ? 0 : 1);
        if (kindDiff !== 0)
            return kindDiff;
        return a.name.localeCompare(b.name);
    });
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
            // 默认 shell 按平台取（Windows 没有 $SHELL，回落 /bin/zsh 会让本地终端一条都开不起来；
            // 见 defaultShellPath）。用户显式填了「Shell 路径」就照用。
            shell: config?.shell?.trim() || defaultShellPath(),
            term: config?.term?.trim() || 'xterm-256color',
            colorTerm: config?.colorTerm?.trim() || 'truecolor',
            cwd: config?.cwd?.trim() || process.cwd(),
            reconnectGraceSec: typeof config?.reconnectGraceSec === 'number' && Number.isInteger(config.reconnectGraceSec) && config.reconnectGraceSec >= 0 ? config.reconnectGraceSec : DEFAULT_RECONNECT_GRACE_SEC,
            sshHosts: Array.isArray(config?.sshHosts) ? config.sshHosts : [],
            hostKeys: Array.isArray(config?.hostKeys) ? config.hostKeys : [],
            // shell 集成（OSC 133/7）靠 POSIX rc 注入 + `-c` 包装层：Windows 上的 cmd / PowerShell
            // 两者都不成立（实测 cmd 忽略 -c 空跑、PowerShell 报 export 不存在），所以恒关。
            // 配置项照旧留着（快照里会显示 false），界面上也说明原因。
            shellIntegration: process.platform !== 'win32' && config?.shellIntegration !== false,
            tunnels: Array.isArray(config?.tunnels) ? config.tunnels : [],
            persistence: config?.persistence === 'tmux' ? 'tmux' : 'off',
            endOnPageClose: config?.endOnPageClose === true,
            statsEnabled: config?.statsEnabled !== false,
            sftpLimits: sanitizeSftpLimits(config?.sftpLimits),
            persistSessions: sanitizePersistSessions(config?.persistSessions) ?? [],
        });
        const sessions = new SessionManager(config?.maxSessions ?? DEFAULT_MAX_SESSIONS, () => live.endOnPageClose);
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
        /** SSH 持久会话名留存（远程 tmux 本机 socket 看不到；新窗口恢复确认的数据源）。 */
        const persistPersistSessions = () => {
            const scope = settingsScope;
            if (scope === undefined)
                return;
            void Promise.resolve(scope.update({ persistSessions: live.persistSessions.map((name) => ({ tmuxName: name })) })).catch((error) => {
                console.warn('[dsh-tty] 持久会话名留存失败: ' + (error instanceof Error ? error.message : String(error)));
            });
        };
        /** 记录/移除一个 SSH 持久会话名并落盘（幂等）。 */
        const trackPersistSession = (tmuxName, present) => {
            const next = present
                ? (live.persistSessions.includes(tmuxName) ? live.persistSessions : [...live.persistSessions, tmuxName])
                : live.persistSessions.filter((name) => name !== tmuxName);
            if (next.join('|') === live.persistSessions.join('|'))
                return;
            live.persistSessions = next;
            persistPersistSessions();
        };
        const tunnelManager = new TunnelManager({ info: (m) => ctx.logger.info(m), warn: (m) => ctx.logger.warn(m) }, hostKeyStore, (bookName) => live.findSshHost(bookName));
        // SFTP 文件传输：懒连接池 + TOFU 同源（见 src/sftp.ts）；spec 由各请求携带
        // （连接簿名或内联字段），连接簿凭证热改后天然生效
        const sftpManager = new SftpManager({ info: (m) => ctx.logger.info(m), warn: (m) => ctx.logger.warn(m) }, hostKeyStore);
        const server = new TtyServer(ctx, sessions, live, hostKeyStore, trackPersistSession);
        const stateRef = { enabled: true, announceToAgent: config?.announceToAgent !== false, toolsRegistered: false, sftpStyle: config?.sftpStyle === 'dual' ? 'dual' : 'dialog' };
        let settingsScope;
        // 工具/公告的重注册钩子：真正的实现由各自的注入 effect 挂载时回填。
        // applyPatch 定义在注入之前，只能先拿 noop——启动顺序无论是 settings 先行
        // （registerAll 读 stateRef 自行短路）还是 tools/announcement 先行（applyPatch
        // 再触发一次重注册，幂等），两种顺序最终状态一致。
        let refreshToolsHook = () => { };
        let refreshAnnouncementHook = () => { };
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
            endOnPageClose: live.endOnPageClose,
            statsEnabled: live.statsEnabled,
            sftpLimits: live.sftpLimits,
            toolsRegistered: stateRef.toolsRegistered,
            /**
             * 宿主平台（`process.platform`）：客户端据此把「Shell 路径 / shell 集成」的说明与候选
             * 按平台写（Windows 上不提 zsh/bash 那套，也不摆一个恒关闭的集成开关）。
             */
            platform: process.platform,
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
                endOnPageClose: typeof section.endOnPageClose === 'boolean' ? section.endOnPageClose : undefined,
                statsEnabled: typeof section.statsEnabled === 'boolean' ? section.statsEnabled : undefined,
                sftpLimits: typeof section.sftpLimits === 'object' && section.sftpLimits !== null ? section.sftpLimits : undefined,
                persistSessions: sanitizePersistSessions(section.persistSessions),
            });
            if (typeof section.enabled === 'boolean')
                stateRef.enabled = section.enabled;
            if (typeof section.announceToAgent === 'boolean')
                stateRef.announceToAgent = section.announceToAgent;
            if (section.sftpStyle === 'dialog' || section.sftpStyle === 'dual')
                stateRef.sftpStyle = section.sftpStyle;
            // 隧道按最新规格对齐（幂等；sshHosts 变更也会触发，让重连取到新凭证）。
            // 禁用态清空目标列表（拆掉活跃转发），重新启用后的下一次对齐自动恢复
            tunnelManager.reconcile(stateRef.enabled ? live.tunnels : []);
            if (typeof section.maxSessions === 'number' && Number.isInteger(section.maxSessions) && section.maxSessions >= 1 && section.maxSessions <= 16) {
                sessions.setLimit(section.maxSessions);
            }
            // 禁用/启用热生效（enabled 不再只是记账）：工具与公告重注册（幂等）、
            // WS 闸门与隧道随开关对齐。PTY 进程不杀——会话转孤儿保活，重新启用后
            // 客户端重连即 attach 回来
            refreshToolsHook();
            refreshAnnouncementHook();
            server.setWsGate(stateRef.enabled);
            // 状态条开关热生效：关的时候停掉全部采集（本地定时器 + 远端 exec channel）
            server.setStatsEnabled(live.statsEnabled);
            console.log(`[dsh-tty] config applied (shell=${live.shell}, term=${live.term}, cwd=${live.cwd}, maxSessions=${sessions.limitValue}, sshHosts=${live.sshHosts.length}, enabled=${String(stateRef.enabled)})`);
        };
        /** 校验 HTTP POST 的配置体；返回规范化补丁或错误信息。 */
        const normalizePatch = (input) => {
            const patch = {};
            const known = new Set(['enabled', 'announceToAgent', 'maxSessions', 'shell', 'term', 'colorTerm', 'cwd', 'reconnectGraceSec', 'sshHosts', 'hostKeys', 'tunnels', 'shellIntegration', 'sftpStyle', 'persistence', 'endOnPageClose', 'statsEnabled', 'sftpLimits']);
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
            if (input.endOnPageClose !== undefined) {
                if (typeof input.endOnPageClose !== 'boolean')
                    return { error: 'endOnPageClose 必须是布尔值' };
                patch.endOnPageClose = input.endOnPageClose;
            }
            if (input.statsEnabled !== undefined) {
                if (typeof input.statsEnabled !== 'boolean')
                    return { error: 'statsEnabled 必须是布尔值' };
                patch.statsEnabled = input.statsEnabled;
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
            if (input.sftpLimits !== undefined) {
                if (typeof input.sftpLimits !== 'object' || input.sftpLimits === null || Array.isArray(input.sftpLimits))
                    return { error: 'sftpLimits 必须是对象' };
                const raw = input.sftpLimits;
                const next = {};
                for (const key of ['maxDownloadMb', 'maxUploadMb', 'maxUploadFiles']) {
                    if (raw[key] === undefined)
                        continue;
                    const value = Number(raw[key]);
                    if (!Number.isInteger(value) || value < 0 || value > (key === 'maxUploadFiles' ? 100000 : 1024 * 1024)) {
                        return { error: key + ' 必须是 0~' + (key === 'maxUploadFiles' ? '100000' : '1048576') + ' 的整数（0 = 不限）' };
                    }
                    next[key] = value;
                }
                patch.sftpLimits = next;
            }
            return { patch };
        };
        /*
         * credentials（**可选**依赖）：连接簿里的 `env:NAME` 是**引用**，值归官方凭据 provider ——
         * 它自己叠 `file`（`$DSH_HOME/.credentials.yaml`）/ `env` / `project-env` / `user-env` 各层，
         * 并保证「每次操作重新解析」（改完下一个操作即生效，不必重启宿主）。
         *
         * 为什么必须走它：凭据存储里的值**永远不会 materialize 进环境**（provider README 原话），
         * 所以只读 `process.env` 等于"存进凭据存储的密码连接时读不到" —— 「保存时存入凭据存储」
         * 那条链此前就是断在这里（客户端那半切好了、宿主这半没切）。
         *
         * 服务缺失（老宿主 / 未装该 bundle）时不注册，`resolveSecret` 自己退回 `process.env`，行为与
         * 从前一致 —— 所以这是**可选**依赖，不抬高 engines 下限。
         */
        ctx.inject(['credentials'], (credCtx) => {
            setCredentialResolver(credCtx.credentials ?? null);
            return () => { setCredentialResolver(null); };
        });
        // webServer：WS upgrade 路由 + 配置读写路由（/api/dsh-tty/config）
        ctx.inject(['webServer'], (webCtx) => {
            webCtx.effect(() => {
                const webServer = webCtx.webServer;
                const disposers = [];
                // 数据路由的禁用守卫：enabled=false 时一律 403。/config 不走它——设置
                // 卡片靠它渲染，也是重新启用插件的唯一 UI 入口（不能一并关掉）。
                // never 参数做签名擦除：原样适配 ReqLike / IncomingMessage 等各种 handler。
                const guardDisabled = (handler) => (req, res) => {
                    if (!stateRef.enabled) {
                        writeJson(res, 403, { error: '插件已禁用（插件配置 → 终端面板 → 启用插件）' });
                        return;
                    }
                    return handler(req, res);
                };
                const registerGated = (route) => {
                    disposers.push(webServer.register({ ...route, handler: guardDisabled(route.handler) }));
                };
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
                registerGated({
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
                });
                // env:VAR 下拉数据源（SSH 对话框）：只回 env 插件托管变量名，绝不含值
                registerGated({
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
                });
                // 凭据存储里已知的引用名（SSH 对话框选择器候选）：只回**名字**，绝不回值。
                // 为什么不像其它设置界面那样只列"自己 schema 里的引用"：官方那条路对这本存储
                // 来说列不全（引用半边不可枚举，见 readCredentialRefNames），而这个选择器的用途
                // 恰恰就是"我存过什么、能不能复用"。
                registerGated({
                    kind: 'exact',
                    path: '/api/dsh-tty/credential-refs',
                    handler: handleCredentialRefsRoute,
                });
                // known_hosts 指纹导入候选（TOFU 预填充）：hashed 条目用连接簿主机名还原
                registerGated({
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
                            // truncated（0.19.0）：超 500 条截断时明确告知，用户不再蒙在鼓里
                            const parsedKnownHosts = parseKnownHostsDetailed(text, candidates);
                            writeJson(res, 200, { ok: true, entries: parsedKnownHosts.entries, truncated: parsedKnownHosts.truncated });
                        }
                        catch (error) {
                            writeJson(res, 200, { ok: false, error: '无法读取 ~/.ssh/known_hosts: ' + (error instanceof Error ? error.message : String(error)) });
                        }
                    },
                });
                // SSH 连接测试（0.11.0，src/probe.ts）：连接簿行「测试」与 SSH 对话框
                // 「试连」共用。body 携带完整内联 SSH 规格（不引用连接簿——卡片测试
                // 由客户端先行展开条目），免去服务端按 name 解析；只诊断不建会话。
                // 连接簿条目测试传 store（新指纹当场 TOFU record）；对话框试连不带
                // store（只比对不落盘，避免给未保存草稿建立钉扎）。
                registerGated({
                    kind: 'exact',
                    path: '/api/dsh-tty/probe',
                    handler: async (req, res) => {
                        if (!isLoopbackHttp(req)) {
                            writeJson(res, 403, { error: 'forbidden: loopback-only' });
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
                        const host = typeof body.host === 'string' ? body.host.trim() : '';
                        const username = typeof body.username === 'string' ? body.username.trim() : '';
                        if (host === '' || username === '') {
                            writeJson(res, 200, { ok: false, error: '主机与用户名必填' });
                            return;
                        }
                        let port = 22;
                        if (body.port !== undefined && body.port !== '') {
                            const value = Number(body.port);
                            if (!Number.isInteger(value) || value < 1 || value > 65535) {
                                writeJson(res, 200, { ok: false, error: '端口必须是 1~65535 的整数' });
                                return;
                            }
                            port = value;
                        }
                        const auth = body.auth === 'key' || body.auth === 'password' ? body.auth : 'agent';
                        const spec = { host, port, username, auth };
                        if (auth === 'key') {
                            const keyPath = typeof body.keyPath === 'string' ? body.keyPath.trim() : '';
                            if (keyPath === '') {
                                writeJson(res, 200, { ok: false, error: 'auth=key 需要私钥路径' });
                                return;
                            }
                            spec.keyPath = keyPath;
                            const passphrase = typeof body.passphrase === 'string' ? body.passphrase : '';
                            if (passphrase !== '')
                                spec.passphrase = passphrase;
                        }
                        if (auth === 'password') {
                            const password = typeof body.password === 'string' ? body.password : '';
                            if (password === '') {
                                writeJson(res, 200, { ok: false, error: 'auth=password 需要密码' });
                                return;
                            }
                            spec.password = password;
                        }
                        if (body.agentForward === true)
                            spec.agentForward = true;
                        // bookRecord=true：来自连接簿条目的完整 TOFU（store 记录新指纹）；
                        // 缺省（对话框试连）只比对不落盘
                        const result = await probeSsh(spec, body.bookRecord === true ? hostKeyStore : undefined);
                        writeJson(res, 200, { ok: result.auth.ok, result });
                    },
                });
                // 已安装 shell 候选（设置卡片「Shell 路径」可选可输入）：loopback 围栏，只回路径不执行
                registerGated({
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
                });
                // 端口转发隧道实时状态（设置卡片轮询徽标 + tunnel_list 工具数据源）
                registerGated({
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
                });
                // SFTP 文件传输（0.7.0，src/sftp.ts）：loopback 围栏；spec 解析与 WS ssh
                // 帧同款（mergeSshSpec：连接簿条目作基底 + 内联字段覆盖）。list/mkdir/
                // rename/remove/download 走 JSON 体（凭证不进 URL/查询串）；download 响应
                // 为文件字节流（stat 成功时带 content-length）；upload 以 x-dsh-sftp-meta
                // 头携带 base64url(JSON)（spec + path + append），请求体即原始文件字节，
                // pipeline 直灌 SFTP 写流——上传下载都不整文件进内存。
                registerGated({
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
                                const message = error instanceof Error ? error.message : String(error);
                                // 下载路径不存在 → 404（0.19.0：openDownload 现在会明确抛错而不是 200+断流）
                                writeJson(res, message.includes('远程路径不存在') ? 404 : 500, { error: message });
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
                            // 取消上传（0.12.0）：客户端中断 → 打断 pipeline 并清理远端半截产物。
                            // 判据用「close 时请求未完整收到」——req 'aborted' 事件已废弃。
                            // 0.19.0 起覆盖写走临时分片 + rename（见 openUpload）：取消清理删的
                            // 是分片（writePath），目标原文件不受影响；追加写内容已进目标尾部，
                            // 没有可回滚的半截，不删整个文件。
                            const controller = new AbortController();
                            let abortedByClient = false;
                            let writePath = target;
                            req.on('close', () => {
                                if (req.complete !== true && res.writableEnded !== true && !abortedByClient) {
                                    abortedByClient = true;
                                    controller.abort();
                                }
                            });
                            try {
                                const upload = await sftpManager.openUpload(parsed.spec, target, meta.append === true);
                                writePath = upload.writePath;
                                let bytes = 0;
                                req.on('data', (chunk) => {
                                    bytes += chunk.length;
                                });
                                await pipeline(req, upload.stream, { signal: controller.signal });
                                await upload.done;
                                writeJson(res, 200, { ok: true, bytes });
                            }
                            catch (error) {
                                if (abortedByClient) {
                                    if (meta.append !== true)
                                        void sftpManager.deleteRemoteQuiet(parsed.spec, writePath);
                                    return;
                                }
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
                });
                // 本机文件浏览（0.9.0，双栏 SFTP 的本机一侧）：loopback 围栏。信任模型
                // 与终端/SFTP 一致——浏览器仅同源可访问，且本机能做的 SSH 会话也能做；
                // list/mkdir/rename/remove 操作本机路径；transfer 在服务端把本机路径与
                // 远程路径流式对拷（凭证不落浏览器，字节不经过浏览器）。
                registerGated({
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
                                // 0.12.0：任务化（start 返回 jobId，浏览器可轮询进度 / 取消），
                                // 代替原先「一个 HTTP 请求同步跑完、无法打断」的直传。
                                const action = strField('action');
                                const jobId = strField('job');
                                if (action === 'status') {
                                    if (jobId === '')
                                        throw new Error('job 必填');
                                    const job = sftpManager.getTransfer(jobId);
                                    if (job === undefined) {
                                        writeJson(res, 404, { error: '传输任务不存在或已回收' });
                                        return;
                                    }
                                    writeJson(res, 200, { ok: true, job });
                                    return;
                                }
                                if (action === 'cancel') {
                                    if (jobId === '')
                                        throw new Error('job 必填');
                                    const job = sftpManager.cancelTransfer(jobId);
                                    if (job === undefined) {
                                        writeJson(res, 404, { error: '传输任务不存在或已回收' });
                                        return;
                                    }
                                    writeJson(res, 200, { ok: true, job });
                                    return;
                                }
                                if (action !== '' && action !== 'start')
                                    throw new Error('action 必须是 start/status/cancel');
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
                                const job = sftpManager.startTransfer(parsed.spec, direction, localPath, remotePath);
                                writeJson(res, 200, { ok: true, job });
                                return;
                            }
                            writeJson(res, 404, { error: 'not found: ' + sub });
                        }
                        catch (error) {
                            writeJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
                        }
                    },
                });
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
                if (stored.endOnPageClose === true)
                    startup.endOnPageClose = true;
                const storedPersistSessions = sanitizePersistSessions(stored.persistSessions);
                if (storedPersistSessions !== undefined && storedPersistSessions.length > 0)
                    startup.persistSessions = storedPersistSessions;
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
        // agent 工具集（P1）：tty_list / tty_open / tty_close / tty_stats / tty_capture / tty_send …
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
                let activeDisposers = [];
                /** 幂等重注册：撤下现有工具后按 enabled 决定是否重挂（禁用热生效的入口；由 applyPatch 经 refreshToolsHook 触发）。 */
                const registerAll = () => {
                    for (const dispose of activeDisposers) {
                        try {
                            dispose();
                        }
                        catch {
                            /* 工具已注销 */
                        }
                    }
                    activeDisposers = [];
                    if (!stateRef.enabled) {
                        stateRef.toolsRegistered = false;
                        console.log('[dsh-tty] agent tools skipped (disabled)');
                        return;
                    }
                    activeDisposers.push(tools.register(defineTool({
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
                                                owner: { type: 'string', required: true },
                                            },
                                        },
                                    },
                                },
                            },
                            render: (_args, value) => {
                                const sessions = value?.sessions ?? [];
                                const text = sessions.length === 0
                                    ? '当前没有活跃的终端面板会话（可用 tty_open 自己开一个，或引导用户打开终端面板）'
                                    : '终端面板会话：' + sessions.map((s) => {
                                        const where = s.kind === 'ssh' ? `ssh ${s.target}` : `pid=${String(s.pid ?? '?')} cwd=${s.cwd}`;
                                        const persist = s.persist === true ? ' [tmux 持久]' : '';
                                        const owner = s.owner === 'agent' ? ' [agent 开的]' : '';
                                        return `\n- sid=${s.sid} [${s.kind}]${owner}${persist} ${where} (启动于 ${new Date(s.startedAt).toLocaleString()})`;
                                    }).join('');
                                return [{ type: 'text', text }];
                            },
                        },
                        async execute() {
                            return { sessions: sessions.list() };
                        },
                    })));
                    activeDisposers.push(tools.register(defineTool({
                        name: 'tty_open',
                        description: '开一个新的终端会话（本地 shell，或 `command` 直接跑一条长驻命令，如 dev server）。会话出现在用户的终端面板里、用户可见可接管，长驻进程与 watch 类任务应该用它（不要在 bash 工具里挂起等待）。开了之后用 tty_expect 等就绪信号、tty_capture{last:true} 拿结果；用完用 tty_close 关闭。cwd 缺省为插件配置的工作目录。',
                        parameters: {
                            cwd: { type: 'string', description: '工作目录（必须是已存在的绝对路径）；缺省用插件配置的 cwd' },
                            command: { type: 'string', description: '直接执行的命令（非交互）；给出时不做 tmux 持久化。缺省 = 交互式 shell' },
                            persistName: { type: 'string', description: 'tmux 持久会话名（开启「会话持久化」时有效；同名复用既有会话）。适合宿主重启后仍需存活的长任务' },
                            cols: { type: 'number', description: '列数（2~500，默认 80）' },
                            rows: { type: 'number', description: '行数（2~200，默认 24）' },
                        },
                        output: {
                            schema: {
                                type: 'object',
                                additionalProperties: false,
                                properties: {
                                    sid: { type: 'string', required: true },
                                    persist: { type: 'boolean', required: true },
                                },
                            },
                            render: (_args, value) => {
                                const v = value;
                                return [{ type: 'text', text: `已开终端会话 sid=${v.sid ?? '?'}${v.persist === true ? '（tmux 持久）' : ''}。它在用户的终端面板里可见；下一步可用 tty_send 执行命令、tty_expect 等就绪信号。` }];
                            },
                        },
                        async execute(args) {
                            const input = args;
                            return await server.openAgentSession({
                                ...(typeof input.cwd === 'string' ? { cwd: input.cwd } : {}),
                                ...(typeof input.command === 'string' ? { command: input.command } : {}),
                                ...(typeof input.persistName === 'string' ? { persistName: input.persistName } : {}),
                                cols: input.cols,
                                rows: input.rows,
                            });
                        },
                    })));
                    activeDisposers.push(tools.register(defineTool({
                        name: 'tty_close',
                        description: '关闭一个由 tty_open 开的终端会话（结束其中的进程）。**只能关 agent 自己开的会话**：用户在面板里开的标签会被拒绝，请让用户自己在面板里关，不要越权结束用户正在用的终端。',
                        parameters: {
                            sid: { type: 'string', required: true, description: '会话 id（tty_open 或 tty_list 提供）' },
                        },
                        output: {
                            schema: {
                                type: 'object',
                                additionalProperties: false,
                                properties: { ok: { type: 'boolean', required: true } },
                            },
                            render: (_args, value) => {
                                const v = value;
                                return [{ type: 'text', text: v.ok === true ? '会话已关闭' : '会话未能关闭' }];
                            },
                        },
                        async execute(args) {
                            const input = args;
                            if (typeof input.sid !== 'string' || input.sid === '')
                                throw new Error('sid 必须是非空字符串');
                            return await server.closeAgentSession(input.sid);
                        },
                    })));
                    activeDisposers.push(tools.register(defineTool({
                        name: 'tty_stats',
                        description: '读取某个终端会话所在机器的实时指标（CPU / 内存 / 磁盘 / TCP 连接数 / 网速 / 温度 / 在线时长）——本地会话取宿主机，SSH 会话取那台远程主机（另开一条非 PTY 通道，不影响终端）。部署、压测、排查「机器是不是满了」之前先看它。仅 Linux 远端字段齐全，Windows 远端部分字段可采，macOS/BSD 远端取不到。',
                        parameters: {
                            sid: { type: 'string', required: true, description: '会话 id（tty_list 提供）' },
                        },
                        output: {
                            schema: {
                                type: 'object',
                                additionalProperties: false,
                                properties: {
                                    sid: { type: 'string', required: true },
                                    available: { type: 'boolean', required: true },
                                    reason: { type: 'string' },
                                    target: { type: 'string' },
                                    cpuPct: { type: 'number' },
                                    cores: { type: 'number' },
                                    memPct: { type: 'number' },
                                    memUsed: { type: 'number' },
                                    memTotal: { type: 'number' },
                                    diskPct: { type: 'number' },
                                    diskUsed: { type: 'number' },
                                    diskTotal: { type: 'number' },
                                    tcpConns: { type: 'number' },
                                    rxRate: { type: 'number' },
                                    txRate: { type: 'number' },
                                    tempC: { type: 'number' },
                                    uptimeSec: { type: 'number' },
                                },
                            },
                            render: (_args, value) => {
                                const v = value;
                                if (v.available !== true)
                                    return [{ type: 'text', text: `会话 ${v.sid ?? '?'} 取不到指标：${v.reason ?? '未知原因'}` }];
                                const parts = [
                                    v.cpuPct !== undefined ? `CPU ${v.cpuPct.toFixed(0)}%${v.cores !== undefined ? `（${String(v.cores)} 核）` : ''}` : null,
                                    v.memPct !== undefined ? `内存 ${v.memPct.toFixed(0)}%${v.memUsed !== undefined && v.memTotal !== undefined ? `（${humanFileSize(v.memUsed)} / ${humanFileSize(v.memTotal)}）` : ''}` : null,
                                    v.diskPct !== undefined ? `磁盘 ${v.diskPct.toFixed(0)}%${v.diskUsed !== undefined && v.diskTotal !== undefined ? `（${humanFileSize(v.diskUsed)} / ${humanFileSize(v.diskTotal)}）` : ''}` : null,
                                    v.tcpConns !== undefined ? `TCP 连接 ${String(v.tcpConns)}` : null,
                                    v.rxRate !== undefined ? `网速 ↓${humanFileSize(v.rxRate)}/s ↑${humanFileSize(v.txRate ?? 0)}/s` : null,
                                    v.tempC !== undefined ? `温度 ${v.tempC.toFixed(0)}°C` : null,
                                    v.uptimeSec !== undefined ? `在线 ${humanDuration(v.uptimeSec)}` : null,
                                ].filter((x) => x !== null);
                                const head = `会话 ${v.sid ?? '?'}${v.target !== undefined && v.target !== '' ? `（${v.target}）` : ''} 指标：`;
                                return [{ type: 'text', text: head + (parts.length > 0 ? parts.join(' · ') : '（无可用字段）') }];
                            },
                        },
                        async execute(args) {
                            const input = args;
                            if (typeof input.sid !== 'string' || input.sid === '')
                                throw new Error('sid 必须是非空字符串');
                            const session = sessions.get(input.sid);
                            if (session === undefined || session.closed)
                                throw new Error(`会话不存在或已退出: ${input.sid}`);
                            const result = await server.sampleStats(session);
                            if (result.available !== true || result.frame === undefined) {
                                return { sid: input.sid, available: false, reason: result.reason ?? '未知原因' };
                            }
                            return { sid: input.sid, available: true, ...(session.target !== '' ? { target: session.target } : {}), ...result.frame };
                        },
                    })));
                    activeDisposers.push(tools.register(defineTool({
                        name: 'tty_capture',
                        description: '读取某个终端面板会话（tty_list 提供 sid）的近期输出。默认读取尾部 N 行（60，最多 500，已剥离 ANSI 转义序列并收敛同行覆盖）；last:true 时只返回「上一条已完成命令」的输出与退出码（依赖 shell 集成标记，更适合拿单条命令的结果）——若命令在途（刚发送/未收到完成标记）返回 inProgress:true 且不携带旧结果，请稍后重试或改用 tty_expect。',
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
                                    inProgress: { type: 'boolean' },
                                },
                            },
                            render: (_args, value) => {
                                const v = value;
                                if (v.inProgress === true) {
                                    return [{ type: 'text', text: `终端会话 ${v.sid ?? '?'} 有命令正在执行（尚未收到完成标记），当前取不到「上一条已完成命令」的结果：稍后重试，或改用 tty_expect 等待特定输出。` }];
                                }
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
                                const state = session.shellState;
                                const last = state.lastCommand;
                                // 在途判定（0.19.0）：①命令的 D 标记未到（inCommand）；②D 到了但
                                // 之后又有 PTY 输入（新命令刚发、B 标记还在路上）。lastCommand
                                // 此时是上一条的旧结果——形状正常却答非所问，必须显式标出来，
                                // 否则 agent 拿旧结果当本次结果用（静默错数据）。
                                if (state.inCommand || (last !== null && last.endedAt < session.lastInputAt)) {
                                    return { sid: input.sid, source: 'last', inProgress: true, tail: '' };
                                }
                                if (last === null) {
                                    throw new Error('暂无「上一条命令」记录（shell 集成未生效——shell 不受支持或被配置关闭——或尚未执行过命令）；可改用 lines 读尾部');
                                }
                                // 保尾截断：last.output 本身已是环形保尾（COMMAND_CAP），这里再
                                // 收一刀也保尾——最近输出才是 agent 要的。
                                // exitCode 用「键不存在」表达缺失（`?? undefined` 会留下一个
                                // undefined 键，不是无损 JSON 值，宿主输出校验会判工具错，见 B33）。
                                return { sid: input.sid, source: 'last', ...(last.exitCode === null ? {} : { exitCode: last.exitCode }), tail: (useRaw ? last.output : cleanAnsiTail(last.output)).slice(-128 * 1024) };
                            }
                            const lines = Math.max(1, Math.min(500, typeof input.lines === 'number' && Number.isInteger(input.lines) && input.lines >= 1 ? input.lines : 60));
                            const rawTail = tailLines(session, lines);
                            return { sid: input.sid, source: 'tail', tail: useRaw ? rawTail : cleanAnsiTail(rawTail) };
                        },
                    })));
                    activeDisposers.push(tools.register(defineTool({
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
                            // 保尾截断：屏幕末尾（提示符行）才是有效区，丢头部不丢尾部
                            return { sid: input.sid, cols: screen.cols, rows: screen.rows, text: lines.join('\n').slice(-32 * 1024) };
                        },
                    })));
                    activeDisposers.push(tools.register(defineTool({
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
                            // 并发上限：每次 expect 挂一个常驻 data 监听器（直到 settle），
                            // 无上限时批量调用会堆出 MaxListenersExceededWarning + 白耗 CPU
                            const inflight = expectCounts.get(session) ?? 0;
                            if (inflight >= MAX_EXPECT_PER_SESSION) {
                                throw new Error(`该会话已有 ${String(inflight)} 个在途 tty_expect（上限 ${String(MAX_EXPECT_PER_SESSION)}）：等其中一个返回再发起新的`);
                            }
                            expectCounts.set(session, inflight + 1);
                            return await new Promise((resolve) => {
                                const startedAt = Date.now();
                                const startedInCommand = session.shellState.inCommand;
                                // 尾部窗口：匹配只看最近 16KB，acc 全量囤积对刷屏会话可涨到数百 MB
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
                                    expectCounts.set(session, Math.max(0, (expectCounts.get(session) ?? 1) - 1));
                                    resolve(result);
                                };
                                const onData = (chunk) => {
                                    acc = (acc + decoder.write(chunk)).slice(-64 * 1024);
                                    const hay = acc.length > 16 * 1024 ? acc.slice(-16 * 1024) : acc;
                                    if (re.test(hay)) {
                                        finish({ matched: true, timedOut: false, text: cleanAnsiTail(hay.slice(-6 * 1024)) });
                                        return;
                                    }
                                    // 命令早停：注册时命令在飞（B..D 之间），如今 D 已到仍未匹配
                                    const state = session.shellState;
                                    if (startedInCommand && !state.inCommand && state.lastCommand !== null && state.lastCommand.endedAt >= startedAt) {
                                        finish({ matched: false, timedOut: false, ...(state.lastCommand.exitCode === null ? {} : { exitCode: state.lastCommand.exitCode }), text: cleanAnsiTail(acc.slice(-6 * 1024)) });
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
                    activeDisposers.push(tools.register(defineTool({
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
                            session.lastInputAt = Date.now();
                            await session.handle.write(input.data);
                            return { ok: true, sent: input.data.length };
                        },
                    })));
                    activeDisposers.push(tools.register(defineTool({
                        name: 'tunnel_list',
                        description: '列出端口转发隧道及其实时状态（活跃/连接中/错误/停止、规则、当前与累计连接数、最近错误）。用户说「隧道连不上 / 转发挂了 / 端口转发不通」时先用它诊断；隧道在 插件配置 → 终端面板 卡片维护。',
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
                                    return [{ type: 'text', text: '当前没有配置端口转发隧道（插件配置 → 终端面板 卡片可添加）' }];
                                const text = '端口转发隧道：' + tunnels.map((t) => {
                                    const tail = t.error !== null && t.error !== undefined ? `（错误: ${t.error}）` : t.lastForwardError !== null && t.lastForwardError !== undefined ? `（最近转发失败: ${t.lastForwardError}）` : `（连接 ${String(t.connections)}）`;
                                    return `\n- ${t.name} [${t.direction}] ${t.rule} — ${t.state}${tail}`;
                                }).join('');
                                return [{ type: 'text', text }];
                            },
                        },
                        async execute() {
                            // 显式挑字段（0.19.0）：list() 还带 enabled / lastForwardError，
                            // 整包展开会突破 schema 的 additionalProperties:false——PTC 生成的
                            // TS 类型会漏字段。
                            // error 必须是「**键不存在**」而不是「键存在但值为 undefined」：后者
                            // 保留了一个 undefined，不是无损 JSON 值，宿主校验会判
                            // 「must be a lossless JSON object」直接把工具调用变成 Error（B33 抓到）。
                            return {
                                tunnels: tunnelManager.list().map((t) => ({
                                    name: t.name,
                                    bookName: t.bookName,
                                    direction: t.direction,
                                    rule: t.rule,
                                    state: t.state,
                                    ...(t.error === null || t.error === undefined ? {} : { error: t.error }),
                                    connections: t.connections,
                                    totalConnections: t.totalConnections,
                                })),
                            };
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
                    activeDisposers.push(tools.register(defineTool({
                        name: 'sftp_list',
                        description: '列出 SSH 远程目录内容（名称/类型/大小/修改时间，目录在前；isSymlink 区分符号链接与真目录）。book 为 SSH 连接簿条目名；path 缺省为远程登录 home。默认最多列 500 项（超限 truncated:true，可按子目录分批）。',
                        parameters: {
                            book: { type: 'string', required: true, description: 'SSH 连接簿条目名（插件配置 → 终端面板 维护）' },
                            path: { type: 'string', description: '远程目录路径（缺省 = 登录 home）' },
                            maxEntries: { type: 'number', description: '最大条目数（1~2000，默认 500）' },
                        },
                        output: {
                            schema: {
                                type: 'object',
                                additionalProperties: false,
                                properties: {
                                    path: { type: 'string', required: true },
                                    truncated: { type: 'boolean', required: true },
                                    entries: {
                                        type: 'array',
                                        required: true,
                                        items: {
                                            type: 'object',
                                            additionalProperties: false,
                                            properties: {
                                                name: { type: 'string', required: true },
                                                isDir: { type: 'boolean', required: true },
                                                isSymlink: { type: 'boolean', required: true },
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
                                const text = `远程目录 ${v.path ?? '?'}（${String(entries.length)} 项${v.truncated === true ? '，已截断——按子目录分批或加大 maxEntries' : ''}）：` + entries.map((e) => `\n- ${e.name}${e.isDir ? '/' : e.isSymlink ? '@' : ''} — ${e.isDir ? '目录' : e.isSymlink ? '符号链接' : humanFileSize(e.size)}`).join('');
                                return [{ type: 'text', text }];
                            },
                        },
                        async execute(args) {
                            const input = args;
                            const spec = sftpBookSpec(input.book);
                            const maxEntries = Math.max(1, Math.min(2000, typeof input.maxEntries === 'number' && Number.isInteger(input.maxEntries) && input.maxEntries >= 1 ? input.maxEntries : 500));
                            const result = await sftpManager.list(spec, typeof input.path === 'string' ? input.path : '');
                            const truncated = result.entries.length > maxEntries;
                            const entries = result.entries.slice(0, maxEntries).map((e) => ({ name: e.name, isDir: e.isDir, isSymlink: e.isSymlink, size: e.size, mtime: e.mtime }));
                            return { path: result.path, truncated, entries };
                        },
                    })));
                    activeDisposers.push(tools.register(defineTool({
                        name: 'sftp_read',
                        description: '读取 SSH 远程文本文件（book 连接簿条目 + path）。默认最多 256KB（可调至 1MB，非法值直接报错）；offset 可从指定字节起读（配合 maxBytes 分页拿到大文件尾部）；二进制判定用 NUL + 非法 UTF-8 占比双重检测，拒绝时说明原因。',
                        parameters: {
                            book: { type: 'string', required: true, description: 'SSH 连接簿条目名' },
                            path: { type: 'string', required: true, description: '远程文件路径' },
                            maxBytes: { type: 'number', description: '最大读取字节数（1~1048576，默认 262144；非法值报错不再静默回落）' },
                            offset: { type: 'number', description: '起始字节偏移（0~2^53-1，默认 0；>0 时跳过前缀，适合读日志尾部）' },
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
                                const head = `远程文件 ${v.path ?? '?'}${v.truncated === true ? '（已截断——加大 maxBytes 或用 offset 分页）' : ''}：`;
                                return [{ type: 'text', text: head + '\n' + String(v.content ?? '') }];
                            },
                        },
                        async execute(args) {
                            const input = args;
                            const spec = sftpBookSpec(input.book);
                            if (typeof input.path !== 'string' || input.path.trim() === '')
                                throw new Error('path 必须是非空字符串');
                            if (input.maxBytes !== undefined && (typeof input.maxBytes !== 'number' || !Number.isInteger(input.maxBytes) || input.maxBytes < 1 || input.maxBytes > 1024 * 1024)) {
                                throw new Error('maxBytes 必须是 1~1048576 的整数');
                            }
                            const maxBytes = input.maxBytes === undefined ? 256 * 1024 : input.maxBytes;
                            if (input.offset !== undefined && (typeof input.offset !== 'number' || !Number.isInteger(input.offset) || input.offset < 0)) {
                                throw new Error('offset 必须是非负整数');
                            }
                            const offset = input.offset === undefined ? 0 : input.offset;
                            const { stream } = await sftpManager.openDownload(spec, input.path, offset > 0 ? { offset } : undefined);
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
                            if (looksLikeBinary(sliced))
                                throw new Error('疑似二进制文件（含 NUL 或非法 UTF-8 占比过高），sftp_read 只支持文本内容');
                            return { path: input.path.trim(), content: decodeUtf8ForAgent(sliced), truncated };
                        },
                    })));
                    activeDisposers.push(tools.register(defineTool({
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
                    activeDisposers.push(tools.register(defineTool({
                        name: 'sftp_mkdir',
                        description: '在 SSH 远程创建目录（book 连接簿条目 + path）。parents:true 时逐级补齐缺失的父目录（等效 mkdir -p，默认 false，父目录缺失直接报错）。',
                        parameters: {
                            book: { type: 'string', required: true, description: 'SSH 连接簿条目名（插件配置 → 终端面板 维护）' },
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
                    activeDisposers.push(tools.register(defineTool({
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
                    activeDisposers.push(tools.register(defineTool({
                        name: 'sftp_remove',
                        description: '删除 SSH 远程文件或目录（book 连接簿条目 + path）。文件直接删除；目录默认走 rmdir（非空明确报错），recursive:true 整目录递归删除（不可恢复，谨慎使用）。根目录 / home / 含 . .. 相对段的路径会被直接拒绝（防整树误删），请先解析出具体的绝对路径。',
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
                            // 护栏在 SftpManager.remove 里（agent 工具与面板 HTTP 路由共用同一道）
                            await sftpManager.remove(spec, input.path, recursive);
                            return { ok: true, path: input.path.trim(), recursive };
                        },
                    })));
                    activeDisposers.push(tools.register(defineTool({
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
                    console.log('[dsh-tty] agent tools registered (tty_list, tty_open, tty_close, tty_stats, tty_capture, tty_screen, tty_expect, tty_send, tunnel_list, sftp_list, sftp_read, sftp_write, sftp_mkdir, sftp_rename, sftp_remove, sftp_tree)');
                };
                refreshToolsHook = registerAll;
                registerAll();
                return () => {
                    stateRef.toolsRegistered = false;
                    refreshToolsHook = () => { };
                    for (const dispose of activeDisposers) {
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
        ctx.inject(['systemPrompt'], (promptCtx) => {
            promptCtx.effect(() => {
                const systemPrompt = promptCtx.systemPrompt;
                let contextDisposable;
                let sectionDisposable;
                /** 幂等重建：按 enabled && announceToAgent 撤下/恢复公告与动态快照（禁用热生效入口）。 */
                const rebuild = () => {
                    if (sectionDisposable !== undefined) {
                        try {
                            sectionDisposable();
                        }
                        catch {
                            /* 已注销 */
                        }
                        sectionDisposable = undefined;
                    }
                    if (contextDisposable !== undefined) {
                        try {
                            contextDisposable();
                        }
                        catch {
                            /* 已注销 */
                        }
                        contextDisposable = undefined;
                    }
                    if (!stateRef.enabled || !stateRef.announceToAgent)
                        return;
                    contextDisposable = systemPrompt.context({
                        name: 'plugin:dsh-tty:terminals',
                        order: 150,
                        text: () => {
                            const list = sessions.list();
                            if (list.length === 0)
                                return '当前没有活跃的终端面板会话（可用 tty_open 自己开一个，或引导用户打开「终端」面板）。';
                            return '当前活跃的终端面板会话（可用 tty_capture / tty_screen / tty_expect / tty_send 操作，用 tty_open / tty_close 开关，sid 如下）：\n' + list.map((s) => {
                                const where = s.kind === 'ssh' ? `ssh ${s.target}` : `pid=${String(s.pid ?? '?')} cwd=${s.cwd}`;
                                const owner = s.owner === 'agent' ? ' [agent 开的]' : '';
                                return `- sid=${s.sid} [${s.kind}]${owner}${s.persist === true ? ' [tmux 持久]' : ''} ${where} (最后活动 ${new Date(s.lastOutputAt).toLocaleTimeString()})`;
                            }).join('\n');
                        },
                    });
                    sectionDisposable = systemPrompt.section({ name: 'plugin:dsh-tty', order: 150, text: TTY_GUIDANCE });
                };
                refreshAnnouncementHook = rebuild;
                rebuild();
                return () => {
                    refreshAnnouncementHook = () => { };
                    if (sectionDisposable !== undefined) {
                        try {
                            sectionDisposable();
                        }
                        catch {
                            /* 已注销 */
                        }
                    }
                    if (contextDisposable !== undefined) {
                        try {
                            contextDisposable();
                        }
                        catch {
                            /* 已注销 */
                        }
                    }
                };
            }, 'dsh-tty: announcement');
        });
        // 孤儿会话回收器：超过保活期的异常断开会话定期清理（grace=0 时为 no-op，
        // 断开时立即结束）；插件卸载时随 effect 一起停掉
        const reaperTimer = setInterval(() => {
            void sessions.reapOrphans(live.reconnectGraceMs);
        }, REAPER_INTERVAL_MS);
        reaperTimer.unref?.();
        ctx.effect(() => () => clearInterval(reaperTimer), 'dsh-tty: orphan reaper');
        // 虚拟屏异常兜底（D57）：xterm-headless 的解析跑在 WriteBuffer 的 setTimeout
        // 回调里，写入路径的同步 try/catch 结构性拦不住；没有兜底时任何一处虚拟屏异常
        // 都会直接打死宿主进程（Web GUI 掉线、会话表清空、agent 全丢）。插件卸载时摘掉。
        ctx.effect(() => installXtermScreenCrashGuard(), 'dsh-tty: xterm crash guard');
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