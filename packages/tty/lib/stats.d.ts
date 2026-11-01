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
    /** 每核使用率 0~100（按 cpuN 顺序）。明细仪表盘的「CPU 核心」卡片用它。 */
    cpuCores?: number[];
    /**
     * 进程候选集：**CPU 前 5 ∪ 内存前 5**（去重后最多 10 条）。客户端按 CPU 或内存排序，
     * 各自都能拿到真正的头部——只发 CPU 前 5 的话，「按内存降序」只能在那 5 条里重排。
     */
    procs?: StatsProc[];
}
/** 一条进程占用（`procs` 的元素）。`cmd` 已去掉控制字符并截断。 */
export interface StatsProc {
    pid: number;
    cmd: string;
    /** 该进程占用的 CPU 百分比（多线程可 >100，上限 100×核数）。 */
    cpuPct: number;
    /** 该进程占用的内存百分比 0~100。 */
    memPct: number;
}
/**
 * 每个榜单取几条（卡片只列前 5 条）。
 *
 * 注意它限制的是**每个榜单**：帧里带的是「CPU 前 5 ∪ 内存前 5」（见 `pickProcLeaders`），
 * 所以最多 10 条。客户端的列头可以在两把尺子之间切换，候选集必须两边都覆盖。
 */
export declare const MAX_PROCS_REPORTED = 5;
/**
 * 帧的白名单清洗：非对象/未知键/非有限数值/越界一律丢弃，pct 与温度保留
 * 一位小数，字节与速率取整。返回 null = 这根本不是一帧 stats（调用方静默
 * 忽略）；返回 {} = 结构合法但一个指标都没拿到（调用方不发帧，让客户端按
 * 「无数据」隐藏状态条）。
 */
export declare function sanitizeStatsFrame(input: unknown): StatsFrame | null;
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
export declare function cleanProcName(input: string): string;
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
/** 单核的累计计数器（`parseProcStatCores` / `os.cpus()` 两路共用）。 */
export interface CpuCoreCounters {
    total: number;
    idle: number;
}
/**
 * /proc/stat 的 cpuN 行 → 每核计数器（按出现顺序）。
 *
 * 与 `parseProcStat` 分开遍历是有意的：聚合值必须**在**每核都读到时才可信，
 * 而每核是明细仪表盘的附加信息——任一处拿不到只影响那一张卡片，不影响整条状态条。
 */
export declare function parseProcStatCores(text: string): CpuCoreCounters[];
/**
 * 两次每核读数 → 每核使用率。核数对不上（热插拔 / 两次读的是不同来源）时
 * 返回 undefined：宁可这一帧不画，也不要按错位的序号张冠李戴。
 */
export declare function cpuCoresPctBetween(prev: CpuCoreCounters[], next: CpuCoreCounters[]): number[] | undefined;
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
export declare function parseCpuTime(text: string): number | null;
/** 本地 `ps` 的一行：`pid pcpu time pmem comm`（`comm` 里可以有空格）。 */
export interface ProcCpuRow {
    pid: number;
    /** ps 给的衰减平均（只有首次采样 / 计数器回退时用它兜底）。 */
    cpuPct: number;
    /** 累计 CPU 秒数。 */
    cpuTime: number;
    memPct: number;
    cmd: string;
}
/**
 * 解析 `ps -Ao pid=,pcpu=,time=,pmem=,comm=`（本地路径用；远端 awk 走 `parsePsOutput`）。
 * 组的顺序是硬契约：前四个是数字列，剩下整段是命令（含空格）。
 */
export declare function parseProcCpuRows(text: string): ProcCpuRow[];
/** 「上一次采样」的累计 CPU 时间标记（pid → 值与墙钟）。 */
export interface ProcCpuMark {
    cpuTime: number;
    at: number;
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
export declare function procCpuUsage(rows: ProcCpuRow[], prev: Record<string, ProcCpuMark>, nowMs: number): {
    pct: number[];
    state: Record<string, ProcCpuMark>;
};
export declare function parsePsOutput(text: string, limit?: number): StatsProc[];
/**
 * 发给客户端的候选集：**CPU 前 `top` 条 ∪ 内存前 `top` 条**（按 pid 去重）。
 *
 * 为什么不是「CPU 前 5」：2026-11-01 用户拿本机对活动监视器，说「内存排名取得不对」——
 * 根因就在这。帧里只有 CPU 前 5，客户端切到「按内存降序」时只能在这 5 条里重排，
 * 微信那种 1.2 GB、CPU 却只有个位数的进程根本不在候选集里，于是内存榜第一名成了
 * 某个 Chrome 辅助进程（它的 rss 高、CPU 也高）。两个榜单各取前 `top` 条再合并，
 * 客户端按任一侧排序都能拿到真正的头部；去重后最多 `top * 2` 条，帧大小可以忽略。
 */
export declare function pickProcLeaders(list: StatsProc[], top?: number): StatsProc[];
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
/**
 * 远端循环里**子进程类字段**（磁盘 `df` / Top 进程 `ps`）的刷新间隔：1 秒一帧，
 * 5 拍（= 5 秒）才 fork 一次。
 *
 * 为什么要有这个门（2026-10-31）：这两项都是 fork（df 还会先起一个 `sh -c`），而它们
 * 的变化量远小于 1 秒——磁盘容量要几分钟才动、谁在吃 CPU 也不需要秒级分辨率。本地路径
 * 早就按 `SLOW_TTL_MS = 5000` 缓存了同一批字段，远端循环当时只有 `ps` 压了频率、`df`
 * 还在每秒跑，成了这条常驻循环里唯一「每秒一个子进程」的开销。
 */
export declare const REMOTE_SLOW_EVERY = 5;
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
 * @param deps 测试注入点：`exec` 替换子进程执行、`platform` 覆盖平台判定、
 *   `readFile` 覆盖「可选文件」读取（默认读真实文件系统）。
 *
 * 为什么 `readFile` 也要能注入：平台分支的第**一**判据是文件系统——darwin 分支只在
 * `/proc/*` 读不到时才走。想在任何平台（CI 的 ubuntu 也在跑这套用例）上验 darwin 的命令，
 * 就得能说「这里没有 /proc」，否则用例在 Linux 上会悄悄走成 /proc 路径、断言看似通过或
 * 直接失败（D50 首次推送就打在这上面：ubuntu 红、macOS/Windows 绿）。
 */
export declare function createLocalSampler(deps?: {
    exec?: (command: string, args: string[]) => Promise<string>;
    platform?: NodeJS.Platform;
    readFile?: (path: string) => string | undefined;
}): LocalStatsSampler;
export declare function localStatsSampler(): LocalStatsSampler;
