/**
 * @hyzyn/dsh-tty — 服务器状态条的数据层（0.17.0）。
 *
 * 形态与职责（为什么这么切）：
 *   - **SSH 会话**：在会话已保留的 ssh2 连接上再开一条非 PTY 的 exec channel，
 *     远端跑一段 POSIX sh + awk 的常驻循环，每秒吐一行 JSON。速率类（CPU%、
 *     网速）必须在采集端算好——只有远端同时握着前后两次采样，宿主拿到的
 *     已经是现成值，中间不经过 PTY（本模块只给命令文本，channel 由 ssh.ts 建）。
 *   - **本地会话**：宿主进程自己就是「那台机器」，用 node:os + /proc（Linux）
 *     或 netstat（macOS）采，产出与远端同形状的帧。
 *   - **纯函数**：所有文本解析、数值清洗、脚本常量都放这里，不碰 IO 与状态机，
 *     便于 vitest 直接测（test/stats.test.ts）。
 *
 * 不变式：**best-effort**。任何字段拿不到就省略，解析失败返回空对象/null，
 * 绝不抛错打断终端；帧的字段白名单与数值边界由 sanitizeStatsFrame 统一把关
 * （远端脚本、本地采样器、将来可能的第三方采集器都过这一道）。
 */
import { execFile } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { cpus, freemem, loadavg, totalmem, uptime as osUptime } from 'node:os';
import { shSingleQuote } from './shell-integration.js';
const STATS_KEYS = ['cpuPct', 'cores', 'memUsed', 'memTotal', 'memPct', 'diskUsed', 'diskTotal', 'diskPct', 'uptimeSec', 'tcpConns', 'rxRate', 'txRate', 'tempC', 'load1', 'swapUsed', 'swapTotal', 'pingMs'];
/** 每核数组的上限：超过就是别人塞的垃圾，不上送（正常物理机 ≤ 256 核）。 */
const MAX_CORES_REPORTED = 128;
/**
 * 每个榜单取几条（卡片只列前 5 条）。
 *
 * 注意它限制的是**每个榜单**：帧里带的是「CPU 前 5 ∪ 内存前 5」（见 `pickProcLeaders`），
 * 所以最多 10 条。客户端的列头可以在两把尺子之间切换，候选集必须两边都覆盖。
 */
export const MAX_PROCS_REPORTED = 5;
/**
 * 一帧里最多带几条进程候选：**CPU 前 5 ∪ 内存前 5**（去重后 ≤ 10）。
 *
 * 客户端按 CPU 或内存排序都用这一份候选集，所以上限必须是两个榜单之和——
 * 只留 5 条的话，内存榜的头部会在上送这一步被切掉（用户报的「内存排名不对」的另一半）。
 */
const MAX_PROCS_CANDIDATES = MAX_PROCS_REPORTED * 2;
/** 数值边界：超出即视为解析垃圾丢弃（远端脚本被改写、df 输出异常、计数器回绕）。 */
const LIMITS = {
    cpuPct: { min: 0, max: 100, int: false },
    cores: { min: 1, max: 4096, int: true },
    memUsed: { min: 0, max: 2 ** 50, int: true },
    memTotal: { min: 1, max: 2 ** 50, int: true },
    memPct: { min: 0, max: 100, int: false },
    diskUsed: { min: 0, max: 2 ** 50, int: true },
    diskTotal: { min: 1, max: 2 ** 50, int: true },
    diskPct: { min: 0, max: 100, int: false },
    uptimeSec: { min: 0, max: 100 * 365 * 24 * 3600, int: true },
    tcpConns: { min: 0, max: 10_000_000, int: true },
    rxRate: { min: 0, max: 2 ** 40, int: true },
    txRate: { min: 0, max: 2 ** 40, int: true },
    tempC: { min: -100, max: 200, int: false },
    // 负载没有上界（100 核跑满就是 100），给一个「明显是解析垃圾」的天花板即可；
    // 两位小数是 loadavg 的惯例（`0.15`），与 pct / 温度那位小数不同
    load1: { min: 0, max: 100_000, int: false, decimals: 2 },
    swapUsed: { min: 0, max: 2 ** 50, int: true },
    // swapTotal 允许 0：没有交换分区的机器，客户端据此整格隐藏（不是「已用 0」）
    swapTotal: { min: 0, max: 2 ** 50, int: true },
    // 5 位数的毫秒已经是不健康的连接了，但别把慢连接的读数当垃圾丢掉
    pingMs: { min: 0, max: 600_000, int: true },
};
/**
 * 帧的白名单清洗：非对象/未知键/非有限数值/越界一律丢弃，pct 与温度保留
 * 一位小数，字节与速率取整。返回 null = 这根本不是一帧 stats（调用方静默
 * 忽略）；返回 {} = 结构合法但一个指标都没拿到（调用方不发帧，让客户端按
 * 「无数据」隐藏状态条）。
 */
export function sanitizeStatsFrame(input) {
    if (typeof input !== 'object' || input === null || Array.isArray(input))
        return null;
    const raw = input;
    const out = {};
    for (const key of STATS_KEYS) {
        const value = raw[key];
        if (typeof value !== 'number' || !Number.isFinite(value))
            continue;
        const limit = LIMITS[key];
        if (value < limit.min || value > limit.max)
            continue;
        const decimals = limit.decimals ?? 1;
        out[key] = limit.int ? Math.round(value) : Math.round(value * 10 ** decimals) / 10 ** decimals;
    }
    const cores = sanitizeCpuCores(raw.cpuCores);
    if (cores !== undefined)
        out.cpuCores = cores;
    const procs = sanitizeProcs(raw.procs);
    if (procs !== undefined)
        out.procs = procs;
    return out;
}
/**
 * 每核数组的清洗：只留 0~100 的有限数，超长截断（半截数组也保留——前几个核的
 * 信息仍然有用，卡片按实际长度画）。
 */
function sanitizeCpuCores(input) {
    if (!Array.isArray(input))
        return undefined;
    const list = [];
    for (const item of input) {
        if (list.length >= MAX_CORES_REPORTED)
            break;
        if (typeof item !== 'number' || !Number.isFinite(item))
            continue;
        if (item < 0 || item > 100)
            continue;
        list.push(Math.round(item * 10) / 10);
    }
    return list.length > 0 ? list : undefined;
}
/**
 * 进程名的清洗：去掉控制字符 / 折叠空白 / 截断（远端 `ps` 的 comm 可能是任意字节）。
 *
 * **超长时保留尾部、砍掉开头**（2026-10-31，用户问「进程名对不上」的真因）：
 * macOS 的 `ps comm` 是**完整路径**，而卡片上显示的是可执行文件名（`procDisplayName`）。
 * 原来从头部截断（`/System/Library/PrivateFrameworks/Ecosystem.fra…`），客户端再取
 * basename 就只剩被切断的路径片段——于是出现了 `Ecosystem.fra…` / `SkyLight.fram…` /
 * `Ma…` 这种既不是路径也不是文件名的东西。保留尾部后，basename 一定完整，tooltip 里
 * 也仍能看到路径的末段（`…/Contents/MacOS/Google Chrome`）。
 */
export function cleanProcName(input) {
    const text = input.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
    if (text.length <= 48)
        return text;
    return '…' + text.slice(text.length - 47);
}
function sanitizeProcs(input) {
    if (!Array.isArray(input))
        return undefined;
    const list = [];
    for (const item of input) {
        if (list.length >= MAX_PROCS_CANDIDATES)
            break;
        if (typeof item !== 'object' || item === null || Array.isArray(item))
            continue;
        const row = item;
        const cmd = typeof row.cmd === 'string' ? cleanProcName(row.cmd) : '';
        if (cmd === '')
            continue;
        const cpuRaw = typeof row.cpuPct === 'number' && Number.isFinite(row.cpuPct) ? row.cpuPct : Number.NaN;
        const memRaw = typeof row.memPct === 'number' && Number.isFinite(row.memPct) ? row.memPct : Number.NaN;
        if (!Number.isFinite(cpuRaw))
            continue;
        const pidRaw = typeof row.pid === 'number' && Number.isFinite(row.pid) ? Math.round(row.pid) : 0;
        list.push({
            pid: pidRaw > 0 && pidRaw < 2 ** 31 ? pidRaw : 0,
            cmd,
            // 多线程进程的 %CPU 会超过 100（top 口径），上限放到 100×核数后夹一刀
            cpuPct: Math.round(Math.min(Math.max(cpuRaw, 0), 100_000) * 10) / 10,
            memPct: Number.isFinite(memRaw) ? Math.round(Math.min(Math.max(memRaw, 0), 100) * 10) / 10 : 0,
        });
    }
    return list.length > 0 ? list : undefined;
}
/** 清洗后是否至少有一个指标（决定要不要发帧）。 */
export function hasStatsData(frame) {
    if (STATS_KEYS.some((key) => frame[key] !== undefined))
        return true;
    return (frame.cpuCores !== undefined && frame.cpuCores.length > 0) || (frame.procs !== undefined && frame.procs.length > 0);
}
/**
 * 解析 /proc/stat 的聚合行与 cpuN 行。iowait 计入 idle——与 top/htop 的默认口径
 * 一致（把等 IO 视为空闲，否则虚拟机上会长期虚高）。
 */
export function parseProcStat(text) {
    let counters = null;
    let cores = 0;
    for (const line of text.split('\n')) {
        if (/^cpu[0-9]/.test(line)) {
            cores += 1;
            continue;
        }
        if (!/^cpu /.test(line))
            continue;
        const cols = line.trim().split(/\s+/);
        let total = 0;
        for (let i = 1; i < cols.length; i += 1) {
            const value = Number(cols[i]);
            if (Number.isFinite(value))
                total += value;
        }
        const idle = (Number(cols[4]) || 0) + (Number(cols[5]) || 0);
        if (total > 0)
            counters = { total, idle, cores: 1 };
    }
    if (counters === null)
        return null;
    return { ...counters, cores: cores > 0 ? cores : 1 };
}
/** 两次累计计数器差值 → 使用率 0~100；窗口无效（无变化/回绕）返回 undefined。 */
export function cpuPctBetween(prev, next) {
    const deltaTotal = next.total - prev.total;
    const deltaIdle = next.idle - prev.idle;
    if (!Number.isFinite(deltaTotal) || deltaTotal <= 0)
        return undefined;
    const value = ((deltaTotal - deltaIdle) * 100) / deltaTotal;
    if (!Number.isFinite(value))
        return undefined;
    return Math.min(100, Math.max(0, Math.round(value * 10) / 10));
}
/**
 * /proc/stat 的 cpuN 行 → 每核计数器（按出现顺序）。
 *
 * 与 `parseProcStat` 分开遍历是有意的：聚合值必须**在**每核都读到时才可信，
 * 而每核是明细仪表盘的附加信息——任一处拿不到只影响那一张卡片，不影响整条状态条。
 */
export function parseProcStatCores(text) {
    const list = [];
    for (const line of text.split('\n')) {
        if (!/^cpu[0-9]/.test(line))
            continue;
        const cols = line.trim().split(/\s+/);
        let total = 0;
        for (let i = 1; i < cols.length; i += 1) {
            const value = Number(cols[i]);
            if (Number.isFinite(value))
                total += value;
        }
        const idle = (Number(cols[4]) || 0) + (Number(cols[5]) || 0);
        if (total <= 0)
            continue;
        list.push({ total, idle });
        if (list.length >= MAX_CORES_REPORTED)
            break;
    }
    return list;
}
/**
 * 两次每核读数 → 每核使用率。核数对不上（热插拔 / 两次读的是不同来源）时
 * 返回 undefined：宁可这一帧不画，也不要按错位的序号张冠李戴。
 */
export function cpuCoresPctBetween(prev, next) {
    if (prev.length === 0 || prev.length !== next.length)
        return undefined;
    const out = [];
    for (let i = 0; i < next.length; i += 1) {
        const pct = cpuPctBetween({ total: prev[i].total, idle: prev[i].idle, cores: 1 }, { total: next[i].total, idle: next[i].idle, cores: 1 });
        if (pct === undefined)
            return undefined;
        out.push(pct);
    }
    return out;
}
/**
 * `ps -o pid=,pcpu=,pmem=,comm=` 的输出 → 前 `limit` 条进程。
 *
 * 只按**行首三列**切（pid / %CPU / %MEM），第四列之后全是命令名——`comm` 里带空格
 * 的情况（macOS 的 app 路径）必须整体保留，不能用 split 后的最后一列。
 * 列顺序与 `=` 号后缀是 `ps` 的 POSIX 写法，两平台一致（Linux procps / macOS BSD）。
 */
/**
 * `ps` 的 `time` 列（累计 CPU 时间）→ 秒。macOS / Linux 的格式都覆盖：
 * `mm:ss`、`mm:ss.cc`、`hh:mm:ss`、`[[dd-]hh:]mm:ss`。
 *
 * 为什么要解析这一列（2026-10-31，用户问「为什么和活动监视器对不上」）：macOS 的
 * `ps %cpu` 是**最长一分钟的衰减平均**（man ps 原话），而活动监视器是**瞬时**采样；
 * 两者本来就不该相等——突发型的 WindowServer 在 ps 里偏低，早先忙过后闲下来的进程在
 * ps 里偏高。拿**两次采样的累计 CPU 时间之差**除以墙钟，才是同一口径的瞬时占用。
 */
export function parseCpuTime(text) {
    const value = text.trim();
    if (value === '')
        return null;
    let days = 0;
    let rest = value;
    const dash = rest.lastIndexOf('-');
    if (dash > 0) {
        days = Number(rest.slice(0, dash));
        rest = rest.slice(dash + 1);
        if (!Number.isFinite(days) || days < 0)
            return null;
    }
    const parts = rest.split(':');
    if (parts.length < 2 || parts.length > 3)
        return null;
    let seconds = 0;
    for (const part of parts) {
        const num = Number(part);
        if (!Number.isFinite(num) || num < 0)
            return null;
        seconds = seconds * 60 + num;
    }
    return days * 86400 + seconds;
}
/**
 * 解析 `ps -Ao pid=,pcpu=,time=,pmem=,comm=`（本地路径用；远端 awk 走 `parsePsOutput`）。
 * 组的顺序是硬契约：前四个是数字列，剩下整段是命令（含空格）。
 */
export function parseProcCpuRows(text) {
    const rows = [];
    for (const line of text.split('\n')) {
        const match = /^\s*(\d+)\s+([\d.]+)\s+(\S+)\s+([\d.]+)\s+(.+?)\s*$/.exec(line);
        if (match === null)
            continue;
        const cmd = cleanProcName(match[5]);
        if (cmd === '')
            continue;
        const cpuTime = parseCpuTime(match[3]);
        if (cpuTime === null)
            continue;
        const cpu = Number(match[2]);
        if (!Number.isFinite(cpu))
            continue;
        const mem = Number(match[4]);
        rows.push({
            pid: Number(match[1]),
            cpuPct: Math.min(Math.max(cpu, 0), 100_000),
            cpuTime,
            memPct: Number.isFinite(mem) ? Math.min(Math.max(mem, 0), 100) : 0,
            cmd,
        });
    }
    return rows;
}
/**
 * 瞬时 CPU%：`Δ累计CPU / Δ墙钟 × 100`，与活动监视器同一口径。
 *
 * 兜底（退回 ps 的衰减平均）的四种情况，都会在真实机器上出现：
 *   - **首见**（刚启动 / 新建的进程）：没有上一次可减；
 *   - **计数器回退**（pid 复用、ps 输出异常）：差值 < 0 时不能算成负占用；
 *   - **间隔太短**（< 1s，例如两次刷新挨在一起）：除出来的噪声极大；
 *   - **ps 这一行没出现**（进程退出 / 被过滤）：直接从状态里剔除，免得 map 无限长。
 *
 * @param rows 本次采样
 * @param prev 上次的标记（pid 字符串键，便于原样存进 JSON 友好的对象）
 * @param nowMs 本次采样的墙钟
 * @returns `pct`（与 rows 一一对应，0~100×核数）与新的状态
 */
export function procCpuUsage(rows, prev, nowMs) {
    const state = {};
    const pct = [];
    for (const row of rows) {
        const key = String(row.pid);
        const last = prev[key];
        let value = row.cpuPct;
        if (last !== undefined) {
            const elapsed = (nowMs - last.at) / 1000;
            const delta = row.cpuTime - last.cpuTime;
            if (elapsed >= 1 && delta >= 0)
                value = (delta / elapsed) * 100;
        }
        state[key] = { cpuTime: row.cpuTime, at: nowMs };
        pct.push(Math.round(Math.min(Math.max(value, 0), 100 * 1024) * 10) / 10);
    }
    return { pct, state };
}
export function parsePsOutput(text, limit = MAX_PROCS_REPORTED) {
    const list = [];
    for (const line of text.split('\n')) {
        if (list.length >= limit)
            break;
        const match = /^\s*(\d+)\s+([\d.]+)\s+([\d.]+)\s+(.+?)\s*$/.exec(line);
        if (match === null)
            continue;
        const cmd = cleanProcName(match[4]);
        if (cmd === '')
            continue;
        const cpu = Number(match[2]);
        const mem = Number(match[3]);
        if (!Number.isFinite(cpu))
            continue;
        list.push({
            pid: Number(match[1]),
            cmd,
            cpuPct: Math.round(Math.min(Math.max(cpu, 0), 100_000) * 10) / 10,
            memPct: Number.isFinite(mem) ? Math.round(Math.min(Math.max(mem, 0), 100) * 10) / 10 : 0,
        });
    }
    return list;
}
/**
 * 发给客户端的候选集：**CPU 前 `top` 条 ∪ 内存前 `top` 条**（按 pid 去重）。
 *
 * 为什么不是「CPU 前 5」：2026-11-01 用户拿本机对活动监视器，说「内存排名取得不对」——
 * 根因就在这。帧里只有 CPU 前 5，客户端切到「按内存降序」时只能在这 5 条里重排，
 * 微信那种 1.2 GB、CPU 却只有个位数的进程根本不在候选集里，于是内存榜第一名成了
 * 某个 Chrome 辅助进程（它的 rss 高、CPU 也高）。两个榜单各取前 `top` 条再合并，
 * 客户端按任一侧排序都能拿到真正的头部；去重后最多 `top * 2` 条，帧大小可以忽略。
 */
export function pickProcLeaders(list, top = MAX_PROCS_REPORTED) {
    const byCpu = [...list].sort((a, b) => b.cpuPct - a.cpuPct).slice(0, top);
    const byMem = [...list].sort((a, b) => b.memPct - a.memPct).slice(0, top);
    const seen = new Set();
    const out = [];
    for (const proc of [...byCpu, ...byMem]) {
        if (seen.has(proc.pid))
            continue;
        seen.add(proc.pid);
        out.push(proc);
    }
    return out;
}
/** /proc/meminfo → 内存用量（bytes）。MemAvailable 优于 MemFree（缓存可回收）。 */
export function parseMeminfo(text) {
    let totalKb = 0;
    let availableKb = 0;
    let freeKb = 0;
    let buffersKb = 0;
    let cachedKb = 0;
    for (const line of text.split('\n')) {
        const cols = line.trim().split(/\s+/);
        const value = Number(cols[1]);
        if (!Number.isFinite(value))
            continue;
        if (cols[0] === 'MemTotal:')
            totalKb = value;
        else if (cols[0] === 'MemAvailable:')
            availableKb = value;
        else if (cols[0] === 'MemFree:')
            freeKb = value;
        else if (cols[0] === 'Buffers:')
            buffersKb = value;
        else if (cols[0] === 'Cached:')
            cachedKb = value;
    }
    if (totalKb <= 0)
        return null;
    // 老内核没有 MemAvailable：自由 + Buffers + Cached 是最接近的近似
    const available = availableKb > 0 ? availableKb : freeKb + buffersKb + cachedKb;
    const usedKb = Math.max(0, totalKb - available);
    return { total: totalKb * 1024, used: usedKb * 1024, pct: Math.round((usedKb * 10000) / totalKb) / 100 };
}
/**
 * /proc/meminfo → 交换分区 `{used,total}`（bytes）。**没有 swap 的机器返回 null**
 * （`SwapTotal: 0`）：那是「没有这个能力」，不是「已用 0」，客户端据此整格隐藏。
 */
export function parseSwapMeminfo(text) {
    let totalKb = 0;
    let freeKb = 0;
    for (const line of text.split('\n')) {
        const cols = line.trim().split(/\s+/);
        const value = Number(cols[1]);
        if (!Number.isFinite(value))
            continue;
        if (cols[0] === 'SwapTotal:')
            totalKb = value;
        else if (cols[0] === 'SwapFree:')
            freeKb = value;
    }
    if (totalKb <= 0)
        return null;
    return { total: totalKb * 1024, used: Math.max(0, totalKb - Math.max(0, freeKb)) * 1024 };
}
/**
 * macOS 的 `sysctl -n vm.swapusage` → `total = 2048.00M  used = 512.25M  free = …`。
 * 单位按 1024 进（与 sysctl 自己的换算一致）；解析不出来返回 null。
 */
export function parseSwapUsage(text) {
    const pick = (label) => {
        const match = new RegExp(label + '\\s*=\\s*([\\d.]+)([KMGT])').exec(text);
        if (match === null)
            return Number.NaN;
        const scale = { K: 1024, M: 1024 ** 2, G: 1024 ** 3, T: 1024 ** 4 }[match[2]];
        return Number(match[1]) * scale;
    };
    const total = pick('total');
    const used = pick('used');
    if (!Number.isFinite(total) || !Number.isFinite(used) || total <= 0)
        return null;
    return { total: Math.round(total), used: Math.round(Math.min(used, total)) };
}
/** /proc/net/dev → 非 lo 接口收发字节累计（速率由调用方差值）。 */
export function parseNetDev(text) {
    let rx = 0;
    let tx = 0;
    for (const line of text.split('\n')) {
        const colon = line.indexOf(':');
        if (colon === -1)
            continue;
        const name = line.slice(0, colon).replace(/\s/g, '');
        if (name === '' || name === 'lo')
            continue;
        const cols = line.slice(colon + 1).trim().split(/\s+/);
        if (cols.length < 9)
            continue;
        const rxBytes = Number(cols[0]);
        const txBytes = Number(cols[8]);
        if (Number.isFinite(rxBytes))
            rx += rxBytes;
        if (Number.isFinite(txBytes))
            tx += txBytes;
    }
    return { rx, tx };
}
/** /proc/loadavg → 1/5/15 分钟负载。 */
export function parseLoadavg(text) {
    // Number("") 是 0：空文本必须显式挡掉，否则会被当成「负载 0」
    if (text.trim() === '')
        return null;
    const cols = text.trim().split(/\s+/);
    const load1 = Number(cols[0]);
    if (!Number.isFinite(load1))
        return null;
    const load5 = Number(cols[1]);
    const load15 = Number(cols[2]);
    return { load1, load5: Number.isFinite(load5) ? load5 : load1, load15: Number.isFinite(load15) ? load15 : load1 };
}
/** /proc/uptime → 开机秒数（取整）。 */
export function parseProcUptime(text) {
    if (text.trim() === '')
        return null;
    const value = Number(text.trim().split(/\s+/)[0]);
    if (!Number.isFinite(value) || value < 0)
        return null;
    return Math.floor(value);
}
/**
 * /proc/net/tcp{,6} 的 established 计数：数据行按空白切分后第 4 列是状态码，
 * established = "01"（proc(5) 的 16 进制状态码），首行表头跳过。
 */
export function countTcpEstablished(text) {
    let count = 0;
    const lines = text.split('\n');
    for (let i = 1; i < lines.length; i += 1) {
        const cols = lines[i].trim().split(/\s+/);
        if (cols.length >= 4 && cols[3] === '01')
            count += 1;
    }
    return count;
}
/** df -kP 输出（取最后一行数据行）→ 容量（bytes）。 */
export function parseDfKb(text) {
    const lines = text.split('\n').filter((line) => line.trim() !== '');
    for (let i = lines.length - 1; i >= 0; i -= 1) {
        const cols = lines[i].trim().split(/\s+/);
        if (cols.length < 3)
            continue;
        const totalKb = Number(cols[1]);
        const usedKb = Number(cols[2]);
        if (!Number.isFinite(totalKb) || totalKb <= 0)
            continue;
        if (!Number.isFinite(usedKb) || usedKb < 0)
            continue;
        return { total: totalKb * 1024, used: usedKb * 1024, pct: Math.round((usedKb * 10000) / totalKb) / 100 };
    }
    return null;
}
/**
 * macOS/BSD netstat -ib → 非 lo 接口收发字节累计。
 *
 * 为什么取「每行最后 7 列」而不是固定下标：Link 行的 Address 列可能为空（lo0）
 * 也可能是 MAC（en0），空白切分后字段数不同；而 Ipkts/Ierrs/Ibytes/Opkts/
 * Oerrs/Obytes/Coll 恒定收尾，取尾部 7 列对两种行都成立（macOS 15 实测）。
 */
export function parseNetstatIb(text) {
    let rx = 0;
    let tx = 0;
    for (const line of text.split('\n')) {
        const cols = line.trim().split(/\s+/);
        if (cols.length < 9)
            continue;
        const name = cols[0];
        if (name === 'Name' || name === 'lo0')
            continue;
        if (!cols.some((col) => col.startsWith('<Link#')))
            continue;
        const tail = cols.slice(-7);
        const rxBytes = Number(tail[2]);
        const txBytes = Number(tail[5]);
        if (Number.isFinite(rxBytes))
            rx += rxBytes;
        if (Number.isFinite(txBytes))
            tx += txBytes;
    }
    return { rx, tx };
}
/** macOS/BSD netstat -an -p tcp → established 计数。 */
export function countNetstatEstablished(text) {
    let count = 0;
    for (const line of text.split('\n')) {
        if (line.includes('ESTABLISHED'))
            count += 1;
    }
    return count;
}
/** sysfs 温度节点文本（毫摄氏度）→ 摄氏度；不可用返回 undefined。 */
export function parseThermalTemp(text) {
    const value = Number(text.trim());
    if (!Number.isFinite(value) || value === 0)
        return undefined;
    const celsius = value > 10000 ? value / 1000 : value;
    if (celsius <= -100 || celsius >= 200)
        return undefined;
    return Math.round(celsius * 10) / 10;
}
export function parseVmStat(text) {
    const header = text.match(/page size of (\d+) bytes/);
    if (header === null)
        return null;
    const pageSize = Number(header[1]);
    if (!Number.isFinite(pageSize) || pageSize <= 0)
        return null;
    const pages = (label) => {
        const match = text.match(label);
        if (match === null)
            return 0;
        const value = Number(match[1]);
        return Number.isFinite(value) ? value : 0;
    };
    const free = pages(/Pages free:\s+(\d+)/);
    const active = pages(/Pages active:\s+(\d+)/);
    const inactive = pages(/Pages inactive:\s+(\d+)/);
    const speculative = pages(/Pages speculative:\s+(\d+)/);
    const wired = pages(/Pages wired down:\s+(\d+)/);
    const compressed = pages(/Pages occupied by compressor:\s+(\d+)/);
    if (active + wired + compressed === 0)
        return null;
    return { pageSize, free, active, inactive, speculative, wired, compressed };
}
/* ------------------------------------------------------------------ *
 * 远端采集脚本（POSIX sh + awk，常驻循环）
 * ------------------------------------------------------------------ */
/**
 * 远端循环里**子进程类字段**（磁盘 `df` / Top 进程 `ps`）的刷新间隔：1 秒一帧，
 * 5 拍（= 5 秒）才 fork 一次。
 *
 * 为什么要有这个门（2026-10-31）：这两项都是 fork（df 还会先起一个 `sh -c`），而它们
 * 的变化量远小于 1 秒——磁盘容量要几分钟才动、谁在吃 CPU 也不需要秒级分辨率。本地路径
 * 早就按 `SLOW_TTL_MS = 5000` 缓存了同一批字段，远端循环当时只有 `ps` 压了频率、`df`
 * 还在每秒跑，成了这条常驻循环里唯一「每秒一个子进程」的开销。
 */
export const REMOTE_SLOW_EVERY = 5;
/**
 * 远端脚本的 awk 主体。设计要点：
 *   - **单进程常驻**：awk 自己死循环，每秒读一遍 /proc 再 system("sleep 1")。
 *     比起 sh 里每秒起 6 个进程，开销可忽略（1 个常驻 awk，几百 KB 内存）；
 *     子进程类字段（df / ps）另有 `REMOTE_SLOW_EVERY` 拍的门，不在每秒那一档。
 *   - **只依赖 POSIX awk**：getline/close/split/sprintf/system/fflush，无 gawk 扩展，
 *     busybox awk 亦可用。
 *   - **速率在远端算好**：CPU% = /proc/stat 差值，网速 = /proc/net/dev 差值 ÷
 *     /proc/uptime 差值（用 uptime 当单调钟，避开 systime 的整秒粒度）。
 *   - **数值一律 sprintf 成字符串**再拼接：awk 的字符串拼接走 OFMT("%.6g")，
 *     直接拼 16 位字节数会输出 1.66654e+10（有效数字被截断）。
 *   - **stdout 只出 JSON**：诊断信息一律不输出（stderr 也被 ssh.ts 丢弃）。
 */
const REMOTE_AWK = String.raw `function slurp(path,   line, out) {
  out = ""
  while ((getline line < path) > 0) out = out line "\n"
  close(path)
  return out
}
function jput(key, val) {
  if (val == "") return
  if (j != "") j = j ","
  j = j "\"" key "\":" val
}
# 直接拼一段**已经合法的 JSON**（数组 / 对象数组）：jput 只接标量，这两个字段是结构体
function jraw(key, val) {
  if (val == "") return
  if (j != "") j = j ","
  j = j "\"" key "\":" val
}
# JSON 字符串转义：进程名里可能有双引号/反斜杠，直接拼会破坏整帧
function jesc(s,   out, i, ch) {
  out = ""
  for (i = 1; i <= length(s); i++) {
    ch = substr(s, i, 1)
    if (ch == "\\") out = out "\\\\"
    else if (ch == "\"") out = out "\\\""
    else out = out ch
  }
  return out
}
# Top 进程：先试 POSIX 的 ps -o（procps / BSD 都认 "=" 后缀写法），拿不到再退 ps aux
# ——busybox 之类不认 -eo 的实现也有机会给出数据。只在每 5 拍跑一次（见主循环）。
#
# 一次 ps 读进数组，返回行数。shift 区分两种格式（0 = ps -eo pid=,pcpu=,pmem=,comm=，
# 1 = ps aux）：两种格式的列序不同，分开取才不会把 CPU 读成 pid。
function psread(cmd, shift, PIDS, CPUS, MEMS, CMDS,   line, f, m, c, n, pid, cpu, mem, cmdname) {
  n = 0
  while ((cmd | getline line) > 0) {
    # 列右对齐 → 行首全是空格：先削掉再 split，否则会多出一个空首字段、整行列错位
    sub(/^[ \t]+/, "", line)
    m = split(line, f, /[ \t]+/)
    if (shift == 0) {
      if (m < 4) continue
      if (f[1] !~ /^[0-9]+$/) continue
      pid = f[1] + 0
      cpu = f[2] + 0
      mem = f[3] + 0
      cmdname = f[4]
      for (c = 5; c <= m; c++) cmdname = cmdname " " f[c]
    } else {
      if (m < 11) continue
      if (f[2] !~ /^[0-9]+$/) continue
      pid = f[2] + 0
      cpu = f[3] + 0
      mem = f[4] + 0
      cmdname = f[11]
      for (c = 12; c <= m; c++) cmdname = cmdname " " f[c]
    }
    if (cmdname == "") continue
    n++
    PIDS[n] = pid
    CPUS[n] = cpu
    MEMS[n] = mem
    CMDS[n] = cmdname
    if (n >= 6000) break
  }
  close(cmd)
  return n
}
#
# Top 进程的候选集：**CPU 前 5 + 内存前 5 的并集**（按 pid 去重，最多 10 条）。
#
# 为什么不能顺着 ps --sort=-pcpu 只取前 5 条：那是「CPU 前 5」，客户端切到
# 「按内存降序」时只能在这 5 条里重排——微信那种 1.2 GB、CPU 却只有个位数的进程
# 根本不在候选集里，内存榜第一名于是变成某个 Chrome 辅助进程（用户报的「本机的内存
# 排名取得不对」，本地路径同一个根因，见 pickProcLeaders）。一次读完、按两把尺子
# 各选 5 条再合并，两个榜单的头都在里面。
function pslist(   n, PIDS, CPUS, MEMS, CMDS, used, out, k, i, best, bv, v, cnt) {
  n = psread("ps -eo pid=,pcpu=,pmem=,comm= --sort=-pcpu 2>/dev/null", 0, PIDS, CPUS, MEMS, CMDS)
  if (n == 0) n = psread("ps aux 2>/dev/null", 1, PIDS, CPUS, MEMS, CMDS)
  out = ""
  for (k = 1; k <= 2; k++) {
    for (cnt = 0; cnt < 5; cnt++) {
      best = 0
      bv = -1
      for (i = 1; i <= n; i++) {
        if (i in used) continue
        v = (k == 1) ? CPUS[i] : MEMS[i]
        if (v > bv) {
          bv = v
          best = i
        }
      }
      if (best == 0) break
      used[best] = 1
      if (out != "") out = out ","
      out = out "{\"pid\":" sprintf("%d", PIDS[best]) ",\"cmd\":\"" jesc(CMDS[best]) "\",\"cpuPct\":" sprintf("%.1f", CPUS[best]) ",\"memPct\":" sprintf("%.1f", MEMS[best]) "}"
    }
  }
  return out
}
# /proc/net/tcp{,6} 的 established 计数（状态码 01），读不到任何一份时返回 -1
# ——调用方据此省略字段（前端显示「无」），而不是报 0（0 会被当成「没有连接」）。
#
# 为什么必须先 sub() 去掉行首空白：这两份文件的 sl 列是右对齐的（行首有空格），
# 而 awk 的显式正则分隔符与默认 FS 不同——它不会吃掉行首空白，反而会为之产出一个
# 空首字段，于是状态码从 f[4] 滑到 f[5]，f[4] == "01" 永不成立、计数恒为 0。
# （真实踩过：只有远端 TCP 一直是 0，CPU / 内存 / 磁盘 / 网速全都正常。）
function tcpest(base,   fi, tp, td, n, L, i, m, f, tcp, have, ln) {
  tcp = 0
  have = 0
  for (fi = 1; fi <= 2; fi++) {
    tp = (fi == 1) ? base "/net/tcp" : base "/net/tcp6"
    td = slurp(tp)
    if (td == "") continue
    have = 1
    n = split(td, L, "\n")
    for (i = 2; i <= n; i++) {
      ln = L[i]
      sub(/^[ \t]+/, "", ln)
      m = split(ln, f, /[ \t]+/)
      if (m >= 4 && f[4] == "01") tcp++
    }
  }
  if (have == 0) return -1
  return tcp
}
BEGIN {
  seenCpu = 0
  seenNet = 0
  coreReady = 0
  tick = 0
  dhave = 0
  while (1) {
    # tick 在**帧首**自增：磁盘容量与 Top 进程这两处慢字段共用它当「每 N 拍一次」的相位，
    # 放在循环末尾会让第一帧落在 tick=0 上（% 5 != 1）——首帧就没有磁盘与进程数据。
    tick++
    j = ""
    st = slurp("/proc/stat")
    cpuPct = ""
    cores = 0
    coreJson = ""
    coreN = 0
    if (st != "") {
      n = split(st, L, "\n")
      for (i = 1; i <= n; i++) {
        if (L[i] ~ /^cpu[0-9]/) {
          cores++
          # 每核明细：与聚合值同一口径（全列求和当分母，idle+iowait 当空闲）。
          # coreReady 单独一个标志：聚合行在 cpuN 之前，用 seenCpu 会让第一拍拿
          # 0 作基线算出一整排假百分比。
          m = split(L[i], c, /[ \t]+/)
          cTot = 0
          for (k = 2; k <= m; k++) if (c[k] != "") cTot = cTot + c[k]
          cIdle = c[5] + c[6]
          if (coreReady == 1 && cores <= 128 && cTot > pCoreTot[cores]) {
            dtc = cTot - pCoreTot[cores]
            dic = cIdle - pCoreIdle[cores]
            v = (dtc - dic) * 100 / dtc
            if (v < 0) v = 0
            if (v > 100) v = 100
            if (coreJson != "") coreJson = coreJson ","
            coreJson = coreJson sprintf("%.1f", v)
            coreN++
          }
          pCoreTot[cores] = cTot
          pCoreIdle[cores] = cIdle
        }
        else if (L[i] ~ /^cpu /) {
          m = split(L[i], c, /[ \t]+/)
          tot = 0
          for (k = 2; k <= m; k++) if (c[k] != "") tot = tot + c[k]
          idle = c[5] + c[6]
          if (seenCpu == 1) {
            dt = tot - pTot
            di = idle - pIdle
            if (dt > 0) {
              cpuPct = (dt - di) * 100 / dt
              if (cpuPct < 0) cpuPct = 0
              if (cpuPct > 100) cpuPct = 100
              cpuPct = sprintf("%.1f", cpuPct)
            }
          }
          pTot = tot
          pIdle = idle
          seenCpu = 1
        }
      }
      if (cores > 0) coreReady = 1
    }
    jput("cpuPct", cpuPct)
    if (cores > 0) jput("cores", sprintf("%d", cores))
    if (coreN > 0) jraw("cpuCores", "[" coreJson "]")

    mi = slurp("/proc/meminfo")
    memTot = 0
    memAvail = 0
    if (mi != "") {
      n = split(mi, L, "\n")
      for (i = 1; i <= n; i++) {
        m = split(L[i], f, /[ \t]+/)
        if (f[1] == "MemTotal:") memTot = f[2] + 0
        else if (f[1] == "MemAvailable:") memAvail = f[2] + 0
        else if (f[1] == "MemFree:" && memAvail == 0) memAvail = f[2] + 0
        else if (f[1] == "SwapTotal:") swapTot = f[2] + 0
        else if (f[1] == "SwapFree:") swapFree = f[2] + 0
      }
    }
    if (memTot > 0) {
      memUsed = memTot - memAvail
      if (memUsed < 0) memUsed = 0
      jput("memTotal", sprintf("%.0f", memTot * 1024))
      jput("memUsed", sprintf("%.0f", memUsed * 1024))
      jput("memPct", sprintf("%.1f", memUsed * 100 / memTot))
    }
    # 交换分区：同一份 /proc/meminfo 里就有。SwapTotal 为 0 = 这台机器没有 swap，
    # 整段省略（客户端据此隐藏那一格），而不是报「已用 0」
    if (swapTot > 0) {
      swapUsed = swapTot - swapFree
      if (swapUsed < 0) swapUsed = 0
      jput("swapTotal", sprintf("%.0f", swapTot * 1024))
      jput("swapUsed", sprintf("%.0f", swapUsed * 1024))
    }

    nd = slurp("/proc/net/dev")
    rx = 0
    tx = 0
    haveNet = 0
    if (nd != "") {
      n = split(nd, L, "\n")
      for (i = 1; i <= n; i++) {
        p = index(L[i], ":")
        if (p == 0) continue
        ifn = substr(L[i], 1, p - 1)
        gsub(/[ \t]/, "", ifn)
        if (ifn == "" || ifn == "lo") continue
        cols = substr(L[i], p + 1)
        gsub(/^[ \t]+/, "", cols)
        m = split(cols, f, /[ \t]+/)
        if (m >= 9) {
          rx = rx + f[1] + 0
          tx = tx + f[9] + 0
          haveNet = 1
        }
      }
    }

    up = slurp("/proc/uptime")
    nowSec = 0
    if (up != "") { split(up, f, /[ \t]+/); nowSec = f[1] + 0 }
    if (nowSec > 0) jput("uptimeSec", sprintf("%.0f", nowSec))
    # 1 分钟平均负载：读不到的机器（没有 /proc/loadavg 的 BSD 变种）整段省略，前端显示「无」。
    # 变量名刻意不复用 f / L：它们在后面几段里还要重新 split，复用容易出「读到上一段残留」的错
    laText = slurp("/proc/loadavg")
    if (laText != "") {
      split(laText, laCols, /[ \t]+/)
      if (laCols[1] != "" && (laCols[1] + 0) >= 0) jput("load1", sprintf("%.2f", laCols[1] + 0))
    }
    if (haveNet == 1) {
      if (seenNet == 1 && nowSec > pNow && rx >= pRx && tx >= pTx) {
        el = nowSec - pNow
        jput("rxRate", sprintf("%.0f", (rx - pRx) / el))
        jput("txRate", sprintf("%.0f", (tx - pTx) / el))
      }
      pRx = rx
      pTx = tx
      pNow = nowSec
      seenNet = 1
    }

    tcp = tcpest("/proc")
    if (tcp >= 0) jput("tcpConns", sprintf("%d", tcp))

    # 磁盘容量：df 会 fork 一个 "sh -c" + 一个 df，和 Top 进程一样压到每 5 拍一次；
    # 中间的帧沿用上次读数（容量本来也不会每秒变）。读不到的拍不覆盖旧值——按「沿用」
    # 处理，而不是把字段变成「无」再变回来。
    if (tick % ${REMOTE_SLOW_EVERY} == 1) {
      cmd = "df -kP / 2>/dev/null"
      dn = 0
      dfl = ""
      while ((cmd | getline dline) > 0) { dn++; dfl = dline }
      close(cmd)
      if (dn > 0) {
        m = split(dfl, f, /[ \t]+/)
        if (m >= 3 && (f[2] + 0) > 0) {
          dtot = (f[2] + 0) * 1024
          dused = (f[3] + 0) * 1024
          if (dused < 0) dused = 0
          dhave = 1
        }
      }
    }
    if (dhave == 1) {
      jput("diskTotal", sprintf("%.0f", dtot))
      jput("diskUsed", sprintf("%.0f", dused))
      jput("diskPct", sprintf("%.1f", dused * 100 / dtot))
    }

    if (tempf != "") {
      if ((getline tline < tempf) > 0) {
        close(tempf)
        tv = tline + 0
        if (tv > 10000) tv = tv / 1000
        if (tv > -100 && tv < 200) jput("tempC", sprintf("%.1f", tv))
      } else {
        close(tempf)
      }
    }

    # Top 进程：5 拍一次（ps 是子进程，秒级分辨率没有意义，还会给远端加负载）
    if (tick % ${REMOTE_SLOW_EVERY} == 1) {
      plist = pslist()
      if (plist != "") jraw("procs", "[" plist "]")
    }

    printf "{%s}\n", j
    fflush()
    system("sleep 1")
  }
}`;
/** 导出 awk 主体（测试用：把死循环换成 if(0) 后可做语法自检）。 */
export function remoteStatsAwk() {
    return REMOTE_AWK;
}
/**
 * 远端采集脚本（未转义的原文；导出仅供测试做语法检查）。
 *
 * 外层用 sh -c 显式包一层：sshd 是拿**用户的登录 shell** 执行 exec 请求的
 * （$SHELL -c 命令串），fish/csh 账户下不保证能解析 POSIX 循环，所以不能把
 * 脚本裸着交出去。脚本里也刻意不出现参数展开语法——保持能被单引号整体包裹，
 * 经 shSingleQuote 内嵌后引号结构不可能被撑破。
 */
export function remoteStatsScript() {
    return "[ -r /proc/stat ] || exit 0\nexport LC_ALL=C\ntempf=''\nfallback=''\nfor z in /sys/class/thermal/thermal_zone*; do\n  if [ -r \"$z/temp\" ]; then\n    if [ -z \"$fallback\" ]; then fallback=\"$z/temp\"; fi\n    t=$(cat \"$z/type\" 2>/dev/null)\n    case \"$t\" in\n      *x86_pkg_temp*|*cpu-thermal*|*coretemp*|*soc_thermal*) tempf=\"$z/temp\"; break ;;\n    esac\n  fi\ndone\nif [ -z \"$tempf\" ]; then tempf=\"$fallback\"; fi\nexec awk -v tempf=\"$tempf\" '" + REMOTE_AWK + "' /dev/null\n";
}
/**
 * 交给 ssh2 conn.exec 的完整命令（已按 shSingleQuote 转义）。
 * 远端命令拼接一律走它：命令里出现单引号/换行/美元符都不能破坏外层引号结构。
 */
export function buildRemoteStatsCommand() {
    return 'sh -c ' + shSingleQuote(remoteStatsScript());
}
/**
 * Windows 远端的采集脚本（PowerShell 5.1+，随 Windows 自带）。
 *
 * 与 POSIX 分支同帧形状、同节奏：每秒一行 JSON 到 stdout。设计取舍：
 *   - **不用 ConvertTo-Json**：它把大整数写成科学计数法（1.7179869184E+10），
 *     且随当前区域变（德语区小数点是逗号，直接毁 JSON）。这里手工拼串，
 *     并且**只输出整数**——整数的隐式 ToString 在任何区域下都不带分隔符，
 *     从根上避开文化差异（pct/温度取整对状态条足够）。
 *   - **速率在远端算好**：Get-NetAdapterStatistics 的收发字节是累计值，用
 *     Stopwatch 算差值（与 POSIX 分支拿 /proc/uptime 当单调钟同一个思路）。
 *   - **显式 Console.Out.Flush()**：stdout 是管道时 PowerShell 会缓冲，不刷就
 *     要等缓冲满才过 channel（表现为前端迟迟收不到帧）。
 *   - **TCP 走 netstat**：Get-NetTCPConnection 要 Win8+/Server2012+，netstat
 *     每个 Windows 都有，少一个分支也少一份体积。
 *   - **整段送 -EncodedCommand**：绕过 cmd.exe / PowerShell / Git Bash 的引号
 *     与换行差异，也不出现反引号（PowerShell 的转义符）；脚本压到 ~1.9KB，
 *     base64 后命令总长 ~5.2KB，远低于 cmd.exe 的 8191 字符上限。
 *   - 每轮都查 WMI（约几十毫秒/次），对监控循环可接受；拿不到的项一律省略。
 */
const WINDOWS_STATS_SCRIPT = String.raw `$ErrorActionPreference = 'SilentlyContinue'
$pr = -1; $pt = -1; $pv = -1.0
$w = [Diagnostics.Stopwatch]::StartNew()
while (1) {
  $p = @()
  $o = Get-CimInstance Win32_OperatingSystem
  if ($o) {
    $p += '"cores":' + [int]$o.NumberOfLogicalProcessors
    $mt = [double]$o.TotalVisibleMemorySize * 1024
    $mu = ([double]$o.TotalVisibleMemorySize - [double]$o.FreePhysicalMemory) * 1024
    if ($mt -gt 0) {
      $p += '"memTotal":' + [long]$mt
      $p += '"memUsed":' + [long]$mu
      $p += '"memPct":' + [int][math]::Round($mu * 100 / $mt)
    }
    $u = ((Get-Date) - $o.LastBootUpTime).TotalSeconds
    $p += '"uptimeSec":' + [long]$u
  }
  $c = (Get-CimInstance Win32_Processor | Measure-Object LoadPercentage -Average).Average
  if ($null -ne $c) {
    $v = [int][math]::Round([double]$c)
    if ($v -lt 0) { $v = 0 }
    if ($v -gt 100) { $v = 100 }
    $p += '"cpuPct":' + $v
  }
  $d = $env:SystemDrive
  if (-not $d) { $d = 'C:' }
  $l = Get-CimInstance Win32_LogicalDisk -Filter ("DeviceID='" + $d + "'")
  if ($l -and [double]$l.Size -gt 0) {
    $dt = [double]$l.Size
    $du = $dt - [double]$l.FreeSpace
    if ($du -lt 0) { $du = 0 }
    $p += '"diskTotal":' + [long]$dt
    $p += '"diskUsed":' + [long]$du
    $p += '"diskPct":' + [int][math]::Round($du * 100 / $dt)
  }
  $p += '"tcpConns":' + [int]@(netstat -an | Select-String 'ESTABLISHED').Count
  $rx = 0; $tx = 0
  $n = Get-NetAdapterStatistics
  if ($n) {
    foreach ($a in $n) { if ($a.Name -notmatch 'Loopback') { $rx += [double]$a.ReceivedBytes; $tx += [double]$a.SentBytes } }
    $t = $w.Elapsed.TotalSeconds
    if ($pv -ge 0 -and $t -gt $pv -and $rx -ge $pr -and $tx -ge $pt) {
      $e = $t - $pv
      $p += '"rxRate":' + [long](($rx - $pr) / $e)
      $p += '"txRate":' + [long](($tx - $pt) / $e)
    }
    $pr = $rx; $pt = $tx; $pv = $t
  }
  $z = Get-CimInstance Win32_PerfFormattedData_Counters_ThermalZoneInformation | Select-Object -First 1
  if ($z -and [double]$z.HighPrecisionTemperature -gt 0) {
    $tv = [int][math]::Round(([double]$z.HighPrecisionTemperature / 10) - 273.15)
    if ($tv -gt -100 -and $tv -lt 200) { $p += '"tempC":' + $tv }
  }
  [Console]::Out.WriteLine('{' + ($p -join ',') + '}')
  [Console]::Out.Flush()
  Start-Sleep 1
}`;
/**
 * 交给 ssh2 conn.exec 的 Windows 命令。
 *
 * 用 -EncodedCommand（UTF-16LE base64，字母表 A-Za-z0-9+/=）而不是引号拼接：
 * 这条命令可能由 cmd.exe、PowerShell 或 Git Bash 解释，base64 在这三者里都
 * 无歧义——不需要（也不能）走 shSingleQuote。命令总长约 3KB，远低于 cmd.exe
 * 的 8191 字符上限。
 */
export function buildWindowsStatsCommand() {
    const encoded = Buffer.from(WINDOWS_STATS_SCRIPT, 'utf16le').toString('base64');
    return 'powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand ' + encoded;
}
/** 导出 PowerShell 原文（测试用：与 base64 解码结果逐字节比对）。 */
export function remoteWindowsStatsScript() {
    return WINDOWS_STATS_SCRIPT;
}
/* ------------------------------------------------------------------ *
 * 帧行缓冲（远端 stdout → 逐行 JSON）
 * ------------------------------------------------------------------ */
/** 单行上限：远端往 stdout 灌垃圾时不能让服务端缓冲无界增长。 */
const MAX_STATS_LINE = 64 * 1024;
/** 一次 push 最多处理的行数（正常每秒 1 行；防突发灌爆主循环）。 */
const MAX_STATS_LINES_PER_PUSH = 64;
/** 跨 chunk 拼行；超限丢弃（远端已不正常，静默不吐数据即可）。 */
export class StatsLineBuffer {
    buffer = '';
    push(chunk) {
        this.buffer += chunk;
        const parts = this.buffer.split('\n');
        this.buffer = parts.pop() ?? '';
        if (this.buffer.length > MAX_STATS_LINE)
            this.buffer = '';
        if (parts.length > MAX_STATS_LINES_PER_PUSH)
            return parts.slice(-MAX_STATS_LINES_PER_PUSH);
        return parts;
    }
    reset() {
        this.buffer = '';
    }
}
/** 一行 stdout → 清洗后的帧；不是合法 JSON 对象时返回 null（静默跳过）。 */
export function parseStatsLine(line) {
    const text = line.trim();
    if (text === '' || text === '{}')
        return null;
    try {
        return sanitizeStatsFrame(JSON.parse(text));
    }
    catch {
        return null;
    }
}
/** 同一秒内多个订阅者（多个本地标签）共享一次采样。 */
const LOCAL_MEMO_MS = 900;
/** 磁盘与 TCP 连接数变化慢，低频子进程刷新（1s 帧节奏不受影响）。 */
const SLOW_TTL_MS = 5000;
/** df/netstat 单次执行上限（卡住的挂载点不能拖住采集）。 */
const EXEC_TIMEOUT_MS = 3000;
/** 子进程类字段「拿不到」后的退避：别每秒去敲同一台卡住的机器。 */
const SLOT_FAILED_TTL_MS = 30_000;
function emptySlot() {
    return { value: null, at: 0, attempted: false, inflight: false };
}
/**
 * 读槽里的值，必要时**顺手**起一次后台刷新（不 await）。
 * 拿不到数据（value 还是 null）时用 `SLOT_FAILED_TTL_MS` 退避。
 */
function readSlot(slot, ttlMs, run) {
    const now = Date.now();
    const ttl = slot.value === null ? SLOT_FAILED_TTL_MS : ttlMs;
    if (!slot.inflight && now - slot.at >= ttl) {
        slot.inflight = true;
        run()
            .then((value) => {
            slot.value = value;
            slot.at = Date.now();
            slot.inflight = false;
        }, () => {
            slot.at = Date.now();
            slot.inflight = false;
        });
    }
    return slot.value;
}
/** 冷启动那一次：等它跑完（首帧要完整），之后一律由 readSlot 走后台。 */
async function primeSlot(slot, run) {
    if (slot.attempted)
        return;
    slot.attempted = true;
    slot.value = await run();
    slot.at = Date.now();
}
function execFileText(command, args) {
    return new Promise((resolve) => {
        try {
            execFile(command, args, { timeout: EXEC_TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024 }, (error, stdout) => {
                // best-effort：命令缺失/超时/非零退出都当作「拿不到」，返回空串由解析层降级
                resolve(error === null || error === undefined ? String(stdout) : '');
            });
        }
        catch {
            /*
             * 沙箱 / 系统策略拒绝 spawn 时，`execFile` 是**同步抛**（实测 EPERM: spawn ps）——
             * 不是走回调。以前这条路径没人踩到（df/netstat 都还允许），明细仪表盘加了 `ps`
             * 之后一上来就把它踩穿了：一次同步异常能让整帧采样 reject → 状态条全空。
             * 按「拿不到」返回空串，符合本模块的 best-effort 不变式。
             */
            resolve('');
        }
    });
}
function readTextFile(path) {
    try {
        return readFileSync(path, 'utf8');
    }
    catch {
        return '';
    }
}
/** 读不到就是 undefined（不吞错误语义；调用方据此区分「没有这个文件」）。 */
function tryRead(path) {
    try {
        return readFileSync(path, 'utf8');
    }
    catch {
        return undefined;
    }
}
/** Linux 的 CPU 温度节点：优先 CPU 相关 zone（type 命中），否则第一个可读 zone。 */
function readThermalC() {
    if (process.platform !== 'linux')
        return undefined;
    let names = [];
    try {
        names = readdirSync('/sys/class/thermal').filter((name) => name.startsWith('thermal_zone'));
    }
    catch {
        return undefined;
    }
    let fallback;
    for (const name of names) {
        const raw = tryRead('/sys/class/thermal/' + name + '/temp');
        if (raw === undefined)
            continue;
        const value = parseThermalTemp(raw);
        if (value === undefined)
            continue;
        const type = readTextFile('/sys/class/thermal/' + name + '/type');
        if (/x86_pkg_temp|cpu-thermal|coretemp|soc_thermal/.test(type))
            return value;
        if (fallback === undefined)
            fallback = value;
    }
    return fallback;
}
/**
 * 宿主本机采集器。平台分工：
 *   - Linux：/proc 直读（同步、零子进程），只有 df 走子进程、温度走 sysfs；
 *   - macOS/BSD：node:os 的 cpus/内存/uptime + df -kP + netstat（TCP 计数与网卡
 *     累计字节）——macOS 没有 /proc、没有 ss、也没有 sysfs 温度，这几项天然缺席；
 *   - 其他平台：能拿多少拿多少（CPU/内存/uptime 来自 node:os）。
 *
 * **出帧节奏只由便宜字段决定（D50）**：走子进程的字段（df / netstat / vm_stat）一律经
 * `AsyncSlot` 取值——首次采样等一次（首帧要完整），此后「用上一次的值 + 到点后台刷新」。
 * 理由是一个实测过的线上现象：这台 macOS 上 `netstat -ib` 要 **30 秒**才返回（缺 `-n`
 * 会做地址反查，DNS 不响应就一直等），被 `EXEC_TIMEOUT_MS` 砍在 3s —— 于是每次采样都要
 * 3s、每秒的 tick 被 busy 守卫跳过，帧变成 **每 4 秒**才出一帧；前端「3s 收不到新帧就收起」
 * 的陈旧窗口正好卡在中间 → 状态条每秒跳一下变成**整条每 4 秒消失又出现**。命令本身也修了
 * （`netstat -ibn`，8ms），但这个槽位是防备下一个「某台机器上某个命令很慢」的兜底：
 * 再慢也只能让自己那一格显示「无/旧值」，不能拖垮整条时间轴。
 *
 * @param deps 测试注入点：`exec` 替换子进程执行、`platform` 覆盖平台判定、
 *   `readFile` 覆盖「可选文件」读取（默认读真实文件系统）。
 *
 * 为什么 `readFile` 也要能注入：平台分支的第**一**判据是文件系统——darwin 分支只在
 * `/proc/*` 读不到时才走。想在任何平台（CI 的 ubuntu 也在跑这套用例）上验 darwin 的命令，
 * 就得能说「这里没有 /proc」，否则用例在 Linux 上会悄悄走成 /proc 路径、断言看似通过或
 * 直接失败（D50 首次推送就打在这上面：ubuntu 红、macOS/Windows 绿）。
 */
export function createLocalSampler(deps = {}) {
    const exec = deps.exec ?? execFileText;
    const platform = deps.platform ?? process.platform;
    /** 「可选文件」读取（读不到 = undefined，与 tryRead 同语义）。 */
    const readOptional = deps.readFile ?? tryRead;
    let prevCpu = null;
    /** 每核的上一次读数（明细仪表盘的「CPU 核心」卡片；与聚合值各走各的来源）。 */
    let prevCores = null;
    let prevNet = null;
    const netSlot = emptySlot();
    const diskSlot = emptySlot();
    const tcpSlot = emptySlot();
    const vmSlot = emptySlot();
    const swapSlot = emptySlot();
    const procSlot = emptySlot();
    let memo = null;
    let inflight = null;
    /**
     * 1 分钟平均负载（`/proc/loadavg` → `os.loadavg()` 兜底）。
     *
     * Windows 上**两处都拿不到**：没有 `/proc`，而 `os.loadavg()` 恒返回 `[0,0,0]`——那不能当成
     * 「负载 0」，所以显式返回 undefined（状态条显示「无」）。Linux / macOS 都走得到真值
     * （Linux 优先 `/proc/loadavg`，与 `uptime` 同一个口径）。
     */
    const loadOne = () => {
        const fromProc = parseLoadavg(readOptional('/proc/loadavg') ?? '');
        if (fromProc !== null)
            return fromProc.load1;
        if (platform === 'win32')
            return undefined;
        const values = loadavg();
        const first = values.length > 0 ? values[0] : Number.NaN;
        return Number.isFinite(first) ? first : undefined;
    };
    /** 首次采样没有差值窗口：退化为 load1/核心数（明确标注的 best-effort 近似）。 */
    const loadApprox = (cores) => {
        if (cores <= 0)
            return undefined;
        const load1 = loadOne();
        if (load1 === undefined)
            return undefined;
        return Math.min(100, Math.round((load1 / cores) * 1000) / 10);
    };
    const cpuCounters = () => {
        const stat = readOptional('/proc/stat');
        const fromProc = stat !== undefined ? parseProcStat(stat) : null;
        if (fromProc !== null)
            return fromProc;
        const list = cpus();
        if (list.length === 0)
            return null;
        let total = 0;
        let idle = 0;
        for (const cpu of list) {
            const times = cpu.times;
            total += times.user + times.nice + times.sys + times.idle + times.irq;
            idle += times.idle;
        }
        return total > 0 ? { total, idle, cores: list.length } : null;
    };
    const cpuNow = () => {
        const next = cpuCounters();
        if (next === null)
            return {};
        const prev = prevCpu;
        prevCpu = next;
        const pct = prev !== null ? cpuPctBetween(prev, next) : loadApprox(next.cores);
        return pct === undefined ? { cores: next.cores } : { pct, cores: next.cores };
    };
    /**
     * 每核使用率：Linux 读 /proc/stat 的 cpuN 行，其余平台用 `os.cpus()` 的每核累计时间。
     *
     * 首次采样没有差值窗口就**省略**（不发一排 0）：卡片上「16 核全部 0%」比「暂无每核数据」
     * 更容易被误读成机器空闲。核数变化（热插拔 / 两次来源不一致）也走省略。
     */
    const cpuCoresNow = () => {
        let next = [];
        const stat = readOptional('/proc/stat');
        if (stat !== undefined)
            next = parseProcStatCores(stat);
        if (next.length === 0) {
            next = cpus().map((cpu) => {
                const times = cpu.times;
                return { total: times.user + times.nice + times.sys + times.idle + times.irq, idle: times.idle };
            });
        }
        if (next.length === 0)
            return undefined;
        const prev = prevCores;
        prevCores = next;
        if (prev === null)
            return undefined;
        return cpuCoresPctBetween(prev, next);
    };
    /**
     * Top 进程（明细仪表盘）：`ps` 是子进程，走 5s TTL 槽位——帧每秒都在推，
     * 但「谁在吃 CPU」不需要秒级分辨率，压到 5s 一次也就不会每秒 fork 一个 ps。
     */
    /*
     * 上一次采样时每个进程的累计 CPU 秒数。用两次差值算「瞬时占用」——`ps` 的 `%cpu`
     * 是**最长一分钟的衰减平均**（man ps），跟活动监视器那种瞬时采样对不上；用户第一眼
     * 就会觉得「这数据是错的」。差值窗口正好是 `SLOW_TTL_MS`（5 秒），与活动监视器的
     * 默认刷新间隔同量级。
     */
    let prevProcMarks = {};
    const procRun = async () => {
        const text = platform === 'darwin'
            ? await exec('ps', ['-Ao', 'pid=,pcpu=,time=,pmem=,comm=', '-r'])
            : await exec('ps', ['-eo', 'pid=,pcpu=,time=,pmem=,comm=', '--sort=-pcpu']);
        const rows = text === '' ? [] : parseProcCpuRows(text);
        if (rows.length === 0) {
            /*
             * 兼容性兜底：`time=` 是「累计 CPU 时间」的关键字，macOS / Linux(procps) 都认，
             * 但精简版 ps（busybox 等）可能整个命令报错 → 空输出。那时退回**只有 pcpu 的
             * 老格式**：数值退化成衰减平均（与旧行为一致），但进程列表不会因此整段消失。
             */
            const plain = platform === 'darwin'
                ? await exec('ps', ['-Ao', 'pid=,pcpu=,pmem=,comm=', '-r'])
                : await exec('ps', ['-eo', 'pid=,pcpu=,pmem=,comm=', '--sort=-pcpu']);
            prevProcMarks = {};
            // 同上：先全量解析，再由 pickProcLeaders 取两个榜单的并集
            const all = plain === '' ? [] : parsePsOutput(plain, Number.POSITIVE_INFINITY);
            const fallback = pickProcLeaders(all);
            return fallback.length > 0 ? fallback : null;
        }
        const nowMs = Date.now();
        const usage = procCpuUsage(rows, prevProcMarks, nowMs);
        prevProcMarks = usage.state;
        const list = rows.map((row, index) => ({
            pid: row.pid,
            cmd: row.cmd,
            cpuPct: usage.pct[index],
            memPct: Math.round(row.memPct * 10) / 10,
        }));
        // 不在这里按 CPU 切 5 条：客户端还要按内存排序，候选集得覆盖两个榜单
        return pickProcLeaders(list);
    };
    const procsNow = async () => {
        await primeSlot(procSlot, procRun);
        return readSlot(procSlot, SLOW_TTL_MS, procRun);
    };
    /**
     * macOS 的内存口径：vm_stat（active + wired + compressed），失败退回 os.freemem。
     * vm_stat 是子进程，所以走槽位（TTL 5s）；`total` 每次按当前值算，总量本来也不会变。
     */
    const vmStatMem = async () => {
        const total = totalmem();
        if (!Number.isFinite(total) || total <= 0)
            return null;
        const text = await exec('vm_stat', []);
        const vm = text !== '' ? parseVmStat(text) : null;
        if (vm === null)
            return null;
        const used = Math.min(total, (vm.active + vm.wired + vm.compressed) * vm.pageSize);
        return { used, total, pct: Math.round((used * 10000) / total) / 100 };
    };
    const memNow = async () => {
        const info = readOptional('/proc/meminfo');
        const fromProc = info !== undefined ? parseMeminfo(info) : null;
        if (fromProc !== null)
            return fromProc; // Linux：同步直读，每秒都是新的
        const total = totalmem();
        if (!Number.isFinite(total) || total <= 0)
            return null;
        if (platform === 'darwin') {
            await primeSlot(vmSlot, vmStatMem);
            const fromVmStat = readSlot(vmSlot, SLOW_TTL_MS, vmStatMem);
            if (fromVmStat !== null)
                return fromVmStat;
        }
        const free = freemem();
        const used = Math.max(0, total - (Number.isFinite(free) ? free : 0));
        return { used, total, pct: Math.round((used * 10000) / total) / 100 };
    };
    const uptimeNow = () => {
        const raw = readOptional('/proc/uptime');
        const fromProc = raw !== undefined ? parseProcUptime(raw) : null;
        if (fromProc !== null)
            return fromProc;
        const value = osUptime();
        return Number.isFinite(value) && value > 0 ? Math.floor(value) : undefined;
    };
    /** /proc/net/dev（Linux，同步）或 netstat（macOS，子进程）。 */
    const netRun = async () => {
        const dev = readOptional('/proc/net/dev');
        if (dev !== undefined)
            return { ...parseNetDev(dev), at: Date.now() };
        if (platform === 'darwin') {
            /*
             * 必须带 `-n`：不带时 netstat 会对每个接口地址做反查，DNS 不响应就一直等
             * （本机实测 `netstat -ib` 30s 不返回、`netstat -ibn` 8ms）。这正是 D50 的根因：
             * 每次采样卡满 3s 超时 → 帧变成每 4s 一帧 → 前端 3s 陈旧窗口把状态条整条收起。
             */
            const text = await exec('netstat', ['-ibn']);
            if (text !== '')
                return { ...parseNetstatIb(text), at: Date.now() };
        }
        return null;
    };
    /**
     * 网速要的是「相邻两次读数之差」，所以 TTL = 0：每次都触发一次后台刷新，
     * 新鲜计数一到就在下一帧算出差值（拿不到时用退避，别每秒敲）。
     */
    const netNow = async () => {
        await primeSlot(netSlot, netRun);
        return readSlot(netSlot, 0, netRun);
    };
    const tcpRun = async () => {
        const v4 = readOptional('/proc/net/tcp');
        const v6 = readOptional('/proc/net/tcp6');
        if (v4 !== undefined || v6 !== undefined) {
            return countTcpEstablished(v4 ?? '') + countTcpEstablished(v6 ?? '');
        }
        if (platform === 'darwin') {
            const text = await exec('netstat', ['-an', '-p', 'tcp']);
            if (text !== '')
                return countNetstatEstablished(text);
        }
        return null;
    };
    const tcpNow = async () => {
        await primeSlot(tcpSlot, tcpRun);
        return readSlot(tcpSlot, SLOW_TTL_MS, tcpRun);
    };
    const diskRun = async () => {
        const text = await exec('df', ['-kP', '/']);
        const parsed = text !== '' ? parseDfKb(text) : null;
        return parsed === null ? null : { used: parsed.used, total: parsed.total };
    };
    const diskNow = async () => {
        await primeSlot(diskSlot, diskRun);
        return readSlot(diskSlot, SLOW_TTL_MS, diskRun);
    };
    /**
     * 交换分区：Linux 从 /proc/meminfo 拿（同步、零成本），macOS 走 `sysctl -n vm.swapusage`
     * 并压到慢槽位（每秒 fork 一个 sysctl 不值得）。没有 swap 的机器返回 null —— 那不是
     * 「已用 0」，客户端据此整格隐藏。
     */
    const swapRun = async () => {
        const info = readOptional('/proc/meminfo');
        if (info !== undefined)
            return parseSwapMeminfo(info);
        if (platform === 'darwin') {
            const text = await exec('sysctl', ['-n', 'vm.swapusage']);
            if (text !== '')
                return parseSwapUsage(text);
        }
        return null;
    };
    const swapNow = async () => {
        await primeSlot(swapSlot, swapRun);
        return readSlot(swapSlot, SLOW_TTL_MS, swapRun);
    };
    const collect = async () => {
        const raw = {};
        const cpu = cpuNow();
        if (cpu.pct !== undefined)
            raw.cpuPct = cpu.pct;
        if (cpu.cores !== undefined)
            raw.cores = cpu.cores;
        const mem = await memNow();
        if (mem !== null) {
            raw.memUsed = mem.used;
            raw.memTotal = mem.total;
            raw.memPct = mem.pct;
        }
        const up = uptimeNow();
        if (up !== undefined)
            raw.uptimeSec = up;
        const load1 = loadOne();
        if (load1 !== undefined)
            raw.load1 = load1;
        const swap = await swapNow();
        if (swap !== null) {
            raw.swapUsed = swap.used;
            raw.swapTotal = swap.total;
        }
        const net = await netNow();
        if (net !== null) {
            // 本地采样器自己就是「采集端」：速率在前后两次采样之间算，宿主不再二次差值
            if (prevNet !== null) {
                const elapsed = (net.at - prevNet.at) / 1000;
                if (elapsed > 0.2) {
                    raw.rxRate = Math.max(0, Math.round((net.rx - prevNet.rx) / elapsed));
                    raw.txRate = Math.max(0, Math.round((net.tx - prevNet.tx) / elapsed));
                }
            }
            prevNet = net;
        }
        const tcp = await tcpNow();
        if (tcp !== null)
            raw.tcpConns = tcp;
        const disk = await diskNow();
        if (disk !== null) {
            raw.diskUsed = disk.used;
            raw.diskTotal = disk.total;
            raw.diskPct = Math.round((disk.used * 10000) / disk.total) / 100;
        }
        const temp = readThermalC();
        if (temp !== undefined)
            raw.tempC = temp;
        // 明细仪表盘的额外字段：拿不到就整段省略（卡片按「暂无数据」降级，不影响整条）
        try {
            const corePcts = cpuCoresNow();
            if (corePcts !== undefined)
                raw.cpuCores = corePcts;
            const procs = await procsNow();
            if (procs !== null)
                raw.procs = procs;
        }
        catch {
            /* 附加信息失败不影响整帧：主指标照发 */
        }
        return sanitizeStatsFrame(raw) ?? {};
    };
    return {
        sample() {
            const now = Date.now();
            if (memo !== null && now - memo.at < LOCAL_MEMO_MS)
                return Promise.resolve(memo.value);
            if (inflight !== null)
                return inflight;
            inflight = collect().then((value) => {
                memo = { at: Date.now(), value };
                inflight = null;
                return value;
            }, () => {
                inflight = null;
                return {};
            });
            return inflight;
        },
    };
}
/**
 * 进程级单例：所有本地标签采的是同一台机器，按标签各起一份采样器只会让
 * df/netstat 成倍执行、数字还可能不一致。单例内的 memo 让同一秒的多个订阅者
 * 共享结果，且 CPU/网速差值窗口连续（跨订阅更稳）。
 */
let localSingleton = null;
export function localStatsSampler() {
    if (localSingleton === null)
        localSingleton = createLocalSampler();
    return localSingleton;
}
//# sourceMappingURL=stats.js.map