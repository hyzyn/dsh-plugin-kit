/**
 * 一帧服务器状态（与 WS 的 {t:'stats'} 帧一致）。全部字段可选：缺失 = 该指标
 * 拿不到，客户端渲染「无」。字节类字段单位一律 bytes，rxRate/txRate 为 B/s——
 * 客户端负责人类可读格式化（与 FinalShell 的 K/s 观感对齐）。
 */
export interface StatsFrame {
    /** CPU 总使用率 0~100（采集端算好的差值）。 */
    cpuPct?: number;
    /** 逻辑核心数。 */
    cores?: number;
    /** 已用内存（bytes）。 */
    memUsed?: number;
    /** 总内存（bytes）。 */
    memTotal?: number;
    /** 内存使用率 0~100。 */
    memPct?: number;
    /** 已用磁盘（bytes，根文件系统）。 */
    diskUsed?: number;
    /** 磁盘总量（bytes）。 */
    diskTotal?: number;
    /** 磁盘使用率 0~100。 */
    diskPct?: number;
    /** 开机时长（秒）。 */
    uptimeSec?: number;
    /** TCP established 连接数。 */
    tcpConns?: number;
    /** 下行速率（B/s）。 */
    rxRate?: number;
    /** 上行速率（B/s）。 */
    txRate?: number;
    /** CPU 温度（摄氏度）。 */
    tempC?: number;
}
/**
 * 帧的白名单清洗：非对象/未知键/非有限数值/越界一律丢弃，pct 与温度保留
 * 一位小数，字节与速率取整。返回 null = 这根本不是一帧 stats（调用方静默
 * 忽略）；返回 {} = 结构合法但一个指标都没拿到（调用方不发帧，让客户端按
 * 「无数据」隐藏状态条）。
 */
export declare function sanitizeStatsFrame(input: unknown): StatsFrame | null;
/** 清洗后是否至少有一个指标（决定要不要发帧）。 */
export declare function hasStatsData(frame: StatsFrame): boolean;
/** /proc/stat 聚合行的累计计数器（差值即使用率）。 */
export interface CpuCounters {
    /** user+nice+system+idle+iowait+irq+softirq+steal 之和。 */
    total: number;
    /** idle+iowait。 */
    idle: number;
    /** 逻辑核心数（cpuN 行数）。 */
    cores: number;
}
/**
 * 解析 /proc/stat 的聚合行与 cpuN 行。iowait 计入 idle——与 top/htop 的默认口径
 * 一致（把等 IO 视为空闲，否则虚拟机上会长期虚高）。
 */
export declare function parseProcStat(text: string): CpuCounters | null;
/** 两次累计计数器差值 → 使用率 0~100；窗口无效（无变化/回绕）返回 undefined。 */
export declare function cpuPctBetween(prev: CpuCounters, next: CpuCounters): number | undefined;
/** /proc/meminfo → 内存用量（bytes）。MemAvailable 优于 MemFree（缓存可回收）。 */
export declare function parseMeminfo(text: string): {
    total: number;
    used: number;
    pct: number;
} | null;
/** /proc/net/dev → 非 lo 接口收发字节累计（速率由调用方差值）。 */
export declare function parseNetDev(text: string): {
    rx: number;
    tx: number;
};
/** /proc/loadavg → 1/5/15 分钟负载。 */
export declare function parseLoadavg(text: string): {
    load1: number;
    load5: number;
    load15: number;
} | null;
/** /proc/uptime → 开机秒数（取整）。 */
export declare function parseProcUptime(text: string): number | null;
/**
 * /proc/net/tcp{,6} 的 established 计数：数据行按空白切分后第 4 列是状态码，
 * established = "01"（proc(5) 的 16 进制状态码），首行表头跳过。
 */
export declare function countTcpEstablished(text: string): number;
/** df -kP 输出（取最后一行数据行）→ 容量（bytes）。 */
export declare function parseDfKb(text: string): {
    total: number;
    used: number;
    pct: number;
} | null;
/**
 * macOS/BSD netstat -ib → 非 lo 接口收发字节累计。
 *
 * 为什么取「每行最后 7 列」而不是固定下标：Link 行的 Address 列可能为空（lo0）
 * 也可能是 MAC（en0），空白切分后字段数不同；而 Ipkts/Ierrs/Ibytes/Opkts/
 * Oerrs/Obytes/Coll 恒定收尾，取尾部 7 列对两种行都成立（macOS 15 实测）。
 */
export declare function parseNetstatIb(text: string): {
    rx: number;
    tx: number;
};
/** macOS/BSD netstat -an -p tcp → established 计数。 */
export declare function countNetstatEstablished(text: string): number;
/** sysfs 温度节点文本（毫摄氏度）→ 摄氏度；不可用返回 undefined。 */
export declare function parseThermalTemp(text: string): number | undefined;
/**
 * macOS `vm_stat` → 页统计（含页大小，字节换算由调用方做）。
 *
 * 为什么需要它：os.freemem() 在 macOS 上把文件缓存算作已用，长期停在 99%——
 * 那是「内核没在闲置」，不是用户理解的「内存吃紧」。active + wired +
 * compressed 才近似活动监视器的「已用内存」。
 */
export interface VmStat {
    pageSize: number;
    free: number;
    active: number;
    inactive: number;
    speculative: number;
    wired: number;
    compressed: number;
}
export declare function parseVmStat(text: string): VmStat | null;
/** 导出 awk 主体（测试用：把死循环换成 if(0) 后可做语法自检）。 */
export declare function remoteStatsAwk(): string;
/**
 * 远端采集脚本（未转义的原文；导出仅供测试做语法检查）。
 *
 * 外层用 sh -c 显式包一层：sshd 是拿**用户的登录 shell** 执行 exec 请求的
 * （$SHELL -c 命令串），fish/csh 账户下不保证能解析 POSIX 循环，所以不能把
 * 脚本裸着交出去。脚本里也刻意不出现参数展开语法——保持能被单引号整体包裹，
 * 经 shSingleQuote 内嵌后引号结构不可能被撑破。
 */
export declare function remoteStatsScript(): string;
/**
 * 交给 ssh2 conn.exec 的完整命令（已按 shSingleQuote 转义）。
 * 远端命令拼接一律走它：命令里出现单引号/换行/美元符都不能破坏外层引号结构。
 */
export declare function buildRemoteStatsCommand(): string;
/**
 * 交给 ssh2 conn.exec 的 Windows 命令。
 *
 * 用 -EncodedCommand（UTF-16LE base64，字母表 A-Za-z0-9+/=）而不是引号拼接：
 * 这条命令可能由 cmd.exe、PowerShell 或 Git Bash 解释，base64 在这三者里都
 * 无歧义——不需要（也不能）走 shSingleQuote。命令总长约 3KB，远低于 cmd.exe
 * 的 8191 字符上限。
 */
export declare function buildWindowsStatsCommand(): string;
/** 导出 PowerShell 原文（测试用：与 base64 解码结果逐字节比对）。 */
export declare function remoteWindowsStatsScript(): string;
/** 跨 chunk 拼行；超限丢弃（远端已不正常，静默不吐数据即可）。 */
export declare class StatsLineBuffer {
    private buffer;
    push(chunk: string): string[];
    reset(): void;
}
/** 一行 stdout → 清洗后的帧；不是合法 JSON 对象时返回 null（静默跳过）。 */
export declare function parseStatsLine(line: string): StatsFrame | null;
export interface LocalStatsSampler {
    /** 采一帧；永远 resolve（失败字段直接缺失），不抛错。 */
    sample(): Promise<StatsFrame>;
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
 * @param deps 测试注入点：`exec` 替换子进程执行、`platform` 覆盖平台判定（默认取本进程）
 */
export declare function createLocalSampler(deps?: {
    exec?: (command: string, args: string[]) => Promise<string>;
    platform?: NodeJS.Platform;
}): LocalStatsSampler;
export declare function localStatsSampler(): LocalStatsSampler;
