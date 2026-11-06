/**
 * @hyzyn/dsh-docker — Docker CLI 封装与输出解析。
 *
 * 设计要点：
 *   - **命令一律以 argv 数组构造**，远程经 shJoin 单引号转义、本机直接
 *     spawn（不经 shell）；用户输入（容器名/ID/命令）先过 assertRef 白名单。
 *   - **解析容错优先**：docker CLI 的 `--format '{{json .}}'` 字段随版本增减，
 *     解析器对缺字段一律降级（State 缺失就从 Status 推导），不抛异常；
 *     需要权威数据时用 `docker inspect`。
 *   - 纯函数（parse*）单独导出，供 scripts/smoke.mjs 用固定输出做回归。
 */
import type { ExecResult, HostKeyStore, SshSpec, ExecLogger, StreamHandlers, StreamResult } from './ssh-exec.js';
import { RemoteExec } from './ssh-exec.js';
import type { Diagnosis } from './diagnose.js';
import type { RecreateResult } from './recreate.js';
export type { StreamHandlers, StreamResult } from './ssh-exec.js';
/** 校验一个 docker 引用（容器名 / ID / 镜像）。不合法直接抛错，绝不拼接进命令。 */
export declare function assertRef(value: unknown, field: string): string;
/** 校验 docker CLI 可执行文件路径；空值回落到 `docker`。 */
export declare function assertBin(value: unknown): string;
/** 校验一个镜像引用（tag / digest / ID）。不合法直接抛错，绝不拼接进命令。 */
export declare function assertImageRef(value: unknown, field: string): string;
/** 校验一个 docker 网络 / 卷名（也是 inspect / rm 的引用）。 */
export declare function assertName(value: unknown, field: string): string;
/**
 * 容器名过滤（`docker ps --filter name=<值>`）的校验。
 *
 * 与 `assertRef` 分开：那里是**引用**（要能在 argv 里寻址一个对象，宽松了就可能
 * 被当成 flag），这里是**过滤词**（含空串 = 不过滤，交给调用方决定）。它同样进
 * argv，所以仍拒绝空串以外的注入面（空白 / 换行 / 引号 / shell 元字符）。
 *
 * 为什么允许 `.` `_` `-`：compose 生成的容器名常是 `proj-web-1` / `proj_db_1`，
 * 名字过滤的主要用途正是「在一台跑了几十个容器的机器上找出一个 compose 项目」。
 */
export declare function assertPsName(value: unknown): string | undefined;
/** `docker exec` 精确参数数组的上限（与命令串的 8000 字符上限是两套口径）。 */
export declare const EXEC_ARGV_MAX_ITEMS = 128;
export declare const EXEC_ARGV_MAX_CHARS = 32768;
/**
 * 校验 `docker exec` 的**精确参数数组**（argv 模式）。
 *
 * 与 `command` 字符串模式的差别就是这里存在的理由：字符串交给容器内 `sh -c`，
 * 空格、引号、空参数都要经过一层 shell 解析；argv 模式一个 token 一个参数，
 * 宿主与容器都不做展开。代价是**不能再依赖 shell**（管道 / 变量要自己显式写
 * `["sh", "-c", "..."]`），所以这是一条可选的第二条通道，不是替换。
 *
 * 逐项保留原样（不 trim）：空参数 `""` 是合法且**有意义**的（`printf '%s' ""`）。
 * 只拒绝会让 docker CLI 无法安全传参的形状：非字符串、NUL、首项为空、总量过大。
 */
export declare function assertExecArgv(value: unknown): string[];
/** 逐行 JSON 解析：兼容 `{{json .}}`（每行一个对象）与整体 JSON 数组。 */
export declare function parseJsonLines(text: string): Record<string, unknown>[];
/** `12.3MiB` / `1.2kB` / `0B` → 字节数（解析失败返回 null）。 */
export declare function parseDockerSize(text: string): number | null;
/** `12.34%` → 12.34（解析失败返回 null）。 */
export declare function parsePercent(text: string): number | null;
/** `1.2kB / 0B` → { rx, tx }（解析失败一侧为 null）。 */
export declare function parseIOPair(text: string): {
    rx: number | null;
    tx: number | null;
};
/**
 * 把 docker 的原始 stderr 映射成一句**可执行的下一步**（没有命中返回 null）。
 *
 * 为什么不是「把所有失败都包一层」（D105 的口径）：agent 能做的下一步与它执行过
 * 哪条命令无关，只与**失败类型**有关——daemon 没起、权限不足、CLI 不在 PATH、
 * 容器名写错、端口冲突、超时，修法各自不同。此前这些都只回一句 docker 的英文原话，
 * 模型只能原样重试；加上这一层之后，同一段原文后面直接跟「该去做什么」。
 *
 * 判据刻意保守：只认**docker / 我们自己的 SSH 层真的会打出来**的片段。猜测式的
 * 匹配（比如任何包含 error 的行）会把真正的业务报错也改写成运维建议，那比不提示更糟。
 */
export declare function dockerErrorHint(text: string): string | null;
/**
 * `--since` 的统一口径（D45）：时长（docker 的 Go duration 语法，允许复合如
 * `1h30m`）、Unix 秒或时间戳。events 与 logs 两条路径此前各有一套——events
 * 白名单偏窄（复合 duration 被拒）、logs 完全不校验（docker 的参数错误变成
 * 不可读的报错）。纯校验函数：合法返回原样串，不合法抛错。
 *
 * 与 docker 的口径**双向对齐**（D99）：
 *   ① duration 支持小数与 `0`——Go 的 `time.ParseDuration` 接受 `1.5h` 与 `0`，
 *      旧正则的 `\d+` 把它们当成非法输入拒了（用户明明写的是合法参数）；
 *   ② 裸数字仍按 docker 语义当 Unix 秒（`--since 3600` = 一小时前）；
 *   ③ 时间戳必须**带时间部分**——`2026-09-13` 这种裸日期此前被放行，docker
 *      多半原样报参数错误，不如在这里拒绝；
 *   ④ 报错回显原始值，否则调用方（尤其是 agent）不知道是哪一段没通过。
 */
export declare function assertSince(value: unknown, field?: string): string;
export interface PortMapping {
    hostIp?: string;
    hostPort?: number;
    /** 端口区间映射的宿主侧原文（`8000-8005`）；单端口映射无此字段。 */
    hostPortRange?: [number, number];
    containerPort: number;
    /** 端口区间映射的容器侧区间（`8000-8005`）；单端口映射无此字段。 */
    containerPortRange?: [number, number];
    protocol: string;
}
export interface ContainerSummary {
    id: string;
    shortId: string;
    name: string;
    image: string;
    state: string;
    status: string;
    health: string | null;
    createdAt: string | null;
    runningFor: string;
    ports: PortMapping[];
    /**
     * 容器所在网络（ps 的 `.Networks`，逗号分隔）。为什么要采（D131）：host 网络容器
     * 在 ps 里**没有端口映射**，`ports` 空与「确实没暴露端口」长得一模一样——只有
     * inspect 才能看出是 host。这个字段让 docker_ps 自己就能说清那一列为什么空。
     */
    networks: string[];
    /** compose 项目 / 服务（有标签时）。 */
    composeProject: string | null;
    composeService: string | null;
    /** ps 的 `.Size`（需 --size，缺省不请求，通常为空）。 */
    size: string;
    /** 已退出容器的退出码（从 `.Status` 的 `Exited (137) …` 解析；非退出态为 null）。 */
    exitCode: number | null;
}
/**
 * 「需要关注」的容器（0.15.0）：由摘要筛出候选、再用一次 `docker inspect` 补权威
 * 字段（OOM / 真实退出码 / 重启次数），供面板「需关注」页与 agent 工具使用。
 */
export interface AttentionItem {
    id: string;
    shortId: string;
    name: string;
    image: string;
    state: string;
    health: string | null;
    status: string;
    /** 关注原因（可多条；前端据此渲染徽标，agent 侧直出文本）。 */
    reasons: AttentionReason[];
    exitCode: number | null;
    oomKilled: boolean;
    restartCount: number | null;
    startedAt: string | null;
    finishedAt: string | null;
}
/** 关注原因：不健康 / 正在重启 / 被 OOM 杀 / 非零退出 / 僵死。 */
export type AttentionReason = 'unhealthy' | 'restarting' | 'oom' | 'exit-nonzero' | 'dead';
/** 从 ps 的 `.Status` 解析退出码：`Exited (137) 2 hours ago` → 137。 */
export declare function parseExitCode(status: string): number | null;
/** 从 ps 的 `.Status`（`Up 2 hours (healthy)`）推导状态。健康态单独由 deriveHealth 提供。 */
export declare function deriveState(status: string): string;
/** 从 ps 的 `.Status` 提取健康态（`Up 2 hours (healthy)` → healthy）。 */
export declare function deriveHealth(status: string): string | null;
/** 解析 ps 的 `.Ports` 串：`0.0.0.0:8080->80/tcp, [::]:8080->80/tcp, 9000/tcp, 0.0.0.0:8000-8005->8000-8005/tcp`。 */
export declare function parsePorts(text: string): PortMapping[];
/** `docker ps --format '{{json .}}'` → ContainerSummary[]。 */
export declare function parsePsJson(text: string): ContainerSummary[];
/**
 * inspect 未命中时的候选名（D132）：把 `No such object: rmqnamesrv` 变成
 * 「是否想找 607023340cbb_rmqnamesrv？」。
 *
 * 纯函数（名字列表由调用方取，便于离线断言）：前缀命中优先、其次包含；去重后最多 3 个。
 * 精确名匹配是 docker 语义、不改；这里只是**在报错里补一句**，让人少猜一次。
 */
export declare function suggestContainerNames(id: string, names: string[]): string[];
/** ps 的 `.Labels` 是 `k=v,k2=v2` 串。 */
export declare function parseLabels(text: string): Record<string, string>;
export interface ContainerStats {
    id: string;
    shortId: string;
    name: string;
    cpuPercent: number | null;
    memPercent: number | null;
    memUsed: number | null;
    memLimit: number | null;
    memUsage: string;
    netRx: number | null;
    netTx: number | null;
    netIO: string;
    blockRead: number | null;
    blockWrite: number | null;
    blockIO: string;
    pids: number | null;
}
/** `docker stats --no-stream --format '{{json .}}'` → ContainerStats[]。 */
export declare function parseStatsJson(text: string): ContainerStats[];
/**
 * `docker top <id> -eo <列>` 的列清单：**唯一构造点**（argv 与解析共用同一份顺序）。
 *
 * 为什么钉这八列：本机实测（docker 28.3.2）`docker top <id> -eo <这串>` 的表头稳定，
 * 且 `-eo` 选的列名与 `docker top` 的默认列不同（默认给 `PID TTY TIME CMD`，那是
 * 「容器里那个 tty 在跑什么」，排障没用）。`pcpu` / `pmem` 的表头是 `%CPU` / `%MEM`
 * （ps 的默认 header），所以解析**按表头名归一**而不是按下标猜——见 TOP_HEADER_ALIASES。
 */
export declare const TOP_PS_FORMAT = "pid,ppid,user,stat,etime,pcpu,pmem,cmd";
/** `docker top` 单次返回的进程行上限（第二道闸：字节闸之外按行兜一层，超了给 truncated）。 */
export declare const TOP_MAX_ROWS = 500;
/** 容器内一个进程（字段**全 string**：docker 打印什么就是什么，不做单位换算）。 */
export interface TopProcessRow {
    pid: string;
    ppid: string;
    user: string;
    stat: string;
    /** ps 的 `etime`（已运行时长，如 `03:24:48`）。 */
    elapsed: string;
    /** ps 的 `pcpu`（%CPU）。 */
    cpu: string;
    /** ps 的 `pmem`（%MEM）。 */
    mem: string;
    /** ps 的 `cmd`（可能含空格，由剩余列合并）。 */
    command: string;
}
/**
 * `docker top -eo …` 的文本输出 → 结构化的进程行。
 *
 * 解析规则（全部由**表头行**驱动）：
 *   - 第一行非空行是表头；每个单元格归一成字段名（`PID` → pid、`%CPU` → cpu）；
 *   - 之后的每一行按空白切成 token：**token 数少于表头列数 → 丢弃该行**（半行 / 被
 *     字节闸切断的行不能当成一条进程）;
 *   - 多出来的 token 全部并进**命令列**（`cmd` 是唯一可以含空格的列，无论它排在
 *     第几列）——其余列各取一个 token，这样列顺序变了也不会错位；
 *   - 表头里认不出的列（不同 ps 版本多给的列）忽略，认不出的行照样保留；
 *   - 输出为空（容器里没有进程 / docker 没打印）→ 空数组，不是错误。
 */
export declare function parseTopOutput(text: string): {
    rows: TopProcessRow[];
    truncated: boolean;
};
/** 一条容器事件（SSE 帧协议与 docker_events 工具共用同一形状）。 */
export interface ContainerEvent {
    /** 完整动作串；health_status 带状态后缀（如 'health_status: healthy'）。 */
    action: string;
    name: string;
    image: string;
    composeProject: string | null;
    /** 事件时间（Unix 秒；缺失为 null，客户端按本地时区格式化）。 */
    time: number | null;
    /** 仅 die 事件有：容器退出码。 */
    exitCode: number | null;
}
/**
 * 单行 docker events --format '{{json .}}' → ContainerEvent；坏行 / 非白名单动作
 * 返回 null，由调用方丢弃：事件流里混进一条解析不了的行（daemon 版本差异、
 * 被截断的 chunk）不该把整条流掐掉，也不该变成 error 帧。
 *
 * Action 在老版本里叫 status；health_status 的两种写法都要吃：
 *   Action: 'health_status: healthy'（新）与 Action: 'health_status'（老）。
 */
export declare function parseContainerEvent(line: string): ContainerEvent | null;
/** 多行事件输出 → ContainerEvent[]（逐行解析，坏行直接丢）。 */
export declare function parseEventsJson(text: string): ContainerEvent[];
export interface ImageSummary {
    id: string;
    shortId: string;
    repository: string;
    tag: string;
    /** `repository:tag`（dangling 时 ` <none>:<none>`）。 */
    reference: string;
    size: number | null;
    sizeText: string;
    createdAt: string;
    createdSince: string;
    dangling: boolean;
}
/** `docker images --format '{{json .}}'` → ImageSummary[]。 */
export declare function parseImagesJson(text: string): ImageSummary[];
/** 镜像详情（`docker image inspect <ref>` 的权威数据）。 */
export interface ImageDetail {
    id: string;
    shortId: string;
    /** 标签列表（dangling 镜像为空数组）。 */
    repoTags: string[];
    repoDigests: string[];
    /** 压缩后大小（字节；缺字段为 null）。 */
    size: number | null;
    /** 含父层的虚拟大小（老版本无此字段）。 */
    virtualSize: number | null;
    created: string;
    architecture: string;
    os: string;
    entrypoint: string;
    command: string;
    workingDir: string;
    user: string;
    exposedPorts: string[];
    volumes: string[];
    /** 层（RootFS.Layers 的 diff id，底层 → 顶层）。 */
    layers: string[];
    /** 层数（= layers.length，单独给出便于直接展示）。 */
    layerCount: number;
    /** 镜像标签（截断展示用；值可能很长，仅回传前 50 条）。 */
    labels: Record<string, string>;
}
/** `docker image inspect <ref>` 的 JSON 数组 → ImageDetail[]。 */
export declare function parseImageInspectJson(text: string): ImageDetail[];
/** 构建历史的一条（`docker history`）。 */
export interface ImageHistoryEntry {
    id: string;
    shortId: string;
    created: string;
    createdSince: string;
    createdBy: string;
    size: number | null;
    sizeText: string;
    comment: string;
    tags: string[];
}
/**
 * `docker history --no-trunc --format '{{json .}}'` → ImageHistoryEntry[]。
 * `--format` 只有 Docker ≥ 26 才支持；老版本输出的是纯文本表格，
 * 由 parseImageHistoryText 兜底（调用方先试 JSON）。
 */
export declare function parseImageHistoryJson(text: string): ImageHistoryEntry[];
/**
 * `docker history --no-trunc` 的纯文本表格兜底解析（老版本 docker 没有 --format）。
 *
 * 表格列以 2 个以上空格对齐，但 **CREATED BY 内部也常出现连续双空格**
 * （`#(nop)  CMD`、`#(nop)  ADD`），所以不按 `\s{2,}` 盲切：先从右往左定位 SIZE
 * （行内最后一个「数字 + 单位」），再用第一个连续双空格把 CREATED 与 CREATED BY 分开。
 * 这是 best-effort：列宽截断（尾部 `…`）与极端构建命令可能让个别字段不完整，
 * 但不会抛错，也不会把整行吞掉。
 */
export declare function parseImageHistoryText(text: string): ImageHistoryEntry[];
export interface NetworkSummary {
    id: string;
    shortId: string;
    name: string;
    driver: string;
    scope: string;
    internal: boolean;
    ipv6: boolean;
}
/** `docker network ls --format '{{json .}}'` → NetworkSummary[]。 */
export declare function parseNetworksJson(text: string): NetworkSummary[];
/** 网络详情（`docker network inspect <name>` 的权威数据）。 */
export interface NetworkDetail {
    id: string;
    shortId: string;
    name: string;
    driver: string;
    scope: string;
    created: string;
    internal: boolean;
    attachable: boolean;
    ingress: boolean;
    enableIpv6: boolean;
    /** IPAM.Config 的每一项（子网 / 网关；老 daemon 可能没有）。 */
    subnets: {
        subnet: string;
        gateway: string;
    }[];
    options: Record<string, string>;
    labels: Record<string, string>;
    /** 接入这个网络的容器（Endpoint 视角的数据）。 */
    containers: {
        id: string;
        shortId: string;
        name: string;
        ipv4: string;
        ipv6: string;
        mac: string;
    }[];
}
/** `docker network inspect <name>` 的 JSON 数组 → NetworkDetail[]。 */
export declare function parseNetworkInspectJson(text: string): NetworkDetail[];
export interface VolumeSummary {
    name: string;
    driver: string;
    scope: string;
    /**
     * 挂载点。`volume ls` 的模板里**没有** CreatedAt（实测 27.5.1），所以列表不带时间；
     * Mountpoint 也不是所有版本都提供，缺字段就退化成空串，列表显示 '—'。
     */
    mountpoint: string;
}
/** `docker volume ls --format '{{json .}}'` → VolumeSummary[]。 */
export declare function parseVolumesJson(text: string): VolumeSummary[];
/** 卷详情（`docker volume inspect <name>` 的权威数据）。 */
export interface VolumeDetail {
    name: string;
    driver: string;
    scope: string;
    mountpoint: string;
    created: string;
    options: Record<string, string>;
    labels: Record<string, string>;
}
/** `docker volume inspect <name>` 的 JSON 数组 → VolumeDetail[]。 */
export declare function parseVolumeInspectJson(text: string): VolumeDetail[];
export interface MountInfo {
    type: string;
    source: string;
    destination: string;
    mode: string;
    readWrite: boolean;
}
export interface ContainerDetail {
    id: string;
    shortId: string;
    name: string;
    image: string;
    imageId: string;
    state: string;
    status: string;
    health: string | null;
    healthLogTail: string | null;
    created: string | null;
    startedAt: string | null;
    finishedAt: string | null;
    exitCode: number | null;
    oomKilled: boolean;
    restartCount: number | null;
    restartPolicy: string | null;
    platform: string;
    pid: number | null;
    ports: PortMapping[];
    mounts: MountInfo[];
    networks: {
        name: string;
        ip: string | null;
    }[];
    command: string;
    entrypoint: string;
    workingDir: string;
    user: string;
    composeProject: string | null;
    composeService: string | null;
    /** 镜像标签（截断展示用；值可能很长，仅回传前 50 条）。 */
    labels: Record<string, string>;
}
/** `docker inspect <id…>` 的 JSON 数组 → ContainerDetail[]。 */
export declare function parseInspectJson(text: string): ContainerDetail[];
/**
 * `docker inspect` 里的**资源上限**（`diagnose()` 用）。
 *
 * 刻意不进 `ContainerDetail` 契约：那是「面板详情页要显示什么」的形状，而这两个字段
 * 只有诊断判据（内存 / CPU 逼近上限）需要。0 一律归一成 `null`——docker 用 0 表示
 * **不限制**，把 0 当成上限会让「内存上限 0B」这种假象混进判据与文案里。
 */
export declare function parseInspectLimits(text: string): {
    memoryLimitBytes: number | null;
    cpuQuota: number | null;
};
/** inspect 的 `NetworkSettings.Ports`：`{ "80/tcp": [{HostIp, HostPort}] }`。 */
export declare function parseInspectPorts(value: unknown): PortMapping[];
/**
 * 明细每类最多回多少行（宿主侧闸）。客户端要的是「治理视图」，不是迁移清单：
 * 259 个匿名卷全列出来既读不了、也顶爆模型上下文。
 */
export declare const DISK_DETAIL_LIMIT = 100;
/**
 * 明细采集的字节预算下限（与配置的单命令上限取较大者）。
 *
 * `docker system df -v --format '{{json .}}'` 是**一条**大 JSON（真机实测 259 个卷
 * ≈120KB），卷多时会线性涨；512KB 的默认上限在几千个卷的机器上会截断，而截断会让
 * JSON 解析失败 → 白白降级成「只有汇总」。给一份独立预算（同 logsGrep / diagnose 的
 * events 采集），超了仍然如实降级。
 */
export declare const DISK_DETAIL_SCAN_BYTES: number;
/** `docker system df` 的汇总行（`Type` 原样保留 docker 的英文分类）。 */
export interface DiskSummaryRow {
    type: string;
    totalCount: number;
    active: number;
    size: string;
    reclaimable: string;
}
/** 镜像明细（`containers` 就是「谁在用」：`Images[].Containers`，不是按 ps 反推的）。 */
export interface DiskImageRow {
    id: string;
    repository: string;
    tag: string;
    size: string;
    sharedSize: string;
    uniqueSize: string;
    containers: number;
}
/** 卷明细（`links` 就是「谁在用」：`Volumes[].Links`）。 */
export interface DiskVolumeRow {
    name: string;
    driver: string;
    size: string;
    links: number;
}
export interface DiskBuildCacheRow {
    id: string;
    type: string;
    size: string;
    inUse: boolean;
}
export interface DiskUsageTruncated {
    images: boolean;
    volumes: boolean;
    buildCache: boolean;
}
/** 每类明细的**真实条数**（截断前；agent 工具据此在 20 行上限下仍报得准）。 */
export interface DiskUsageTotals {
    images: number;
    volumes: number;
    buildCache: number;
}
/** `docker system df` 的完整结果（路由与 agent 工具共用形状）。 */
export interface DiskUsage {
    summary: DiskSummaryRow[];
    images: DiskImageRow[];
    volumes: DiskVolumeRow[];
    buildCache: DiskBuildCacheRow[];
    /** 截断前的条数（**不进 HTTP 契约**：客户端靠 truncated 就够，工具要报 total）。 */
    totals: DiskUsageTotals;
    truncated: DiskUsageTruncated;
    /** 只拿到汇总（明细取不到）时为 true；`summary` 仍然可用。 */
    degraded: boolean;
    degradedReason: string | null;
}
/** 明细解析结果（`null` = 输出解析不了，调用方据此降级）。 */
export interface DiskDetail {
    images: DiskImageRow[];
    volumes: DiskVolumeRow[];
    buildCache: DiskBuildCacheRow[];
    totals: DiskUsageTotals;
    truncated: DiskUsageTruncated;
}
/**
 * `docker system df --format '{{json .}}'` → 汇总行。
 *
 * 每行一个 JSON 对象（真机实测四行：Images / Containers / Local Volumes / Build Cache）。
 * `type` 原样保留英文——翻译是客户端 i18n 的事（`status.diskTypeImages` 等）。
 */
export declare function parseDiskSummary(text: string): DiskSummaryRow[];
/**
 * `docker system df -v --format '{{json .}}'` → 明细（images / volumes / buildCache）。
 *
 * 真机实测：整个输出是**一个 JSON 对象**（键 `Images` / `Containers` / `Volumes` /
 * `BuildCache`），`--format` 把它序列化成一行。`Containers` 段刻意不解析——容器明细
 * 与 `docker ps` 重复，而磁盘治理关心的是「谁在用」（Images[].Containers / Volumes[].Links）。
 *
 * **排序**：镜像按 `UniqueSize`、卷按 `Size` 降序（同值保持 docker 原序）。磁盘页要的
 * 「先看占用最大的」在这里就成立，客户端不必再排一遍、也不会排错（字符串大小不可比）。
 * 截断在排序**之后**（`truncated` 如实置位），否则名额会被一堆 0B 的空卷占满。
 *
 * 解析不了（老 docker 不支持 `-v --format`、输出被截断、JSON 坏了）→ `null`：
 * 降级由调用方决定，这里不抛——「明细没有」不该把汇总也带走。
 */
export declare function parseDiskDetail(text: string, limit?: number): DiskDetail | null;
/**
 * 一次性命令的选项**子集**（Runner 面）：= `ExecOptions` 去掉 `input`（这条通道喂不了
 * stdin）并加上 `signal`。
 *
 * 刻意写成具名类型：它原先在 `Runner.run` 与 `createRunner` 的 `withSignal` 里各写了一份
 * 字面量，于是新增一个字段只能靠对象字面量处的 tsc 报错兜住——`lineAlign` 那次就是先漏在
 * 第二份上。具名类型之后不存在「第二份」。
 */
export interface RunnerRunOptions {
    timeoutMs?: number;
    maxBytes?: number;
    keepTail?: boolean;
    /** 截断后对齐到行边界（见 `ExecOptions.lineAlign`）；只有 `docker_logs_grep` 用。 */
    lineAlign?: boolean;
    signal?: AbortSignal;
}
/** 一个目标（target）背后的命令执行通道。 */
export interface Runner {
    /** 展示用标签：`本机` 或 `user@host`。 */
    readonly label: string;
    /**
     * `signal` 是**可选**的（D161）：已有 20+ 个调用点与测试里的假 runner 只传前两个
     * 参数，加成必填会把它们全部波及，而它们的命令都是短命、不需要外部取消的。
     * 目前只有跨目标聚合（`aggregateAcrossTargets`）会传——单目标路径的截止时间是
     * `timeoutMs`，它本来就够。
     */
    run(argv: readonly string[], options?: RunnerRunOptions): Promise<ExecResult>;
    /** 长流（logs --follow）：逐块回调，signal 中止；无总超时与输出上限。 */
    stream(argv: readonly string[], handlers: StreamHandlers, signal?: AbortSignal): Promise<StreamResult>;
}
export interface DockerAction {
    action: 'start' | 'stop' | 'restart' | 'remove';
    id: string;
}
export interface LogsOptions {
    tail?: number;
    timestamps?: boolean;
    since?: string;
    /** 结束时间（docker --until 语法：ISO 8601 时间戳或 Go duration，如 2026-09-09T10:00:00、1h）。*/
    until?: string;
    /** 实时跟随（`docker logs --follow`）：仅 logsStream() 使用，logs() 忽略。 */
    follow?: boolean;
}
/**
 * 日志检索选项：**默认字面子串**匹配（grep -F 等价），零 ReDoS 风险；
 * `regexp: true` 时才按 JS 正则解释 pattern（仍建议配 since/until 收窄窗口）。
 */
export interface LogGrepOptions {
    /** 要搜索的字面子串，或（regexp=true 时）正则表达式源文。 */
    pattern: string;
    /** true = 把 pattern 当正则；默认 false = 字面子串。 */
    regexp?: boolean;
    /** 忽略大小写（字面模式 = grep -i，正则模式 = /i 标志）。 */
    ignoreCase?: boolean;
    /** 扫描行数上限（1~5000）；缺省 = `--tail all` 扫全部历史。 */
    tail?: number;
    /** 起始时间（与 docker_logs 的 since 同一口径，D45）。 */
    since?: string;
    /** 结束时间（docker --until 语法，与 since 同一口径）。 */
    until?: string;
    /** 每个命中前后各保留的上下文行数（0~20，默认 2）。 */
    context?: number;
    /** 返回命中数上限（1~500，默认 200）。 */
    limit?: number;
    /** 时间戳（默认开——深处的命中没有时间等于没用）。 */
    timestamps?: boolean;
}
/** 检索结果里的一行（命中行或它的上下文行）。 */
export interface LogGrepLine {
    /** 该通道内的行号（从 1 开始；stdout 在前、stderr 在后，与 logs() 的拼接序一致）。 */
    seq: number;
    stream: 'out' | 'err';
    text: string;
    /** 这行本身是否命中（false = 只是上下文）。 */
    hit: boolean;
    /** 命中时：匹配到的子串（供调用方定位；上下文行为 null）。 */
    highlight: string | null;
}
/**
 * logsGrep 的**返回侧行闸**（与扫描侧的 8~32MB 字节预算是两件事）。
 *
 * 扫描预算管「能从多少原文里筛」，这个常量管「筛出来的能塞回多少给模型」：
 * limit 上限 500 × context 上限 20 ⇒ 最多约 20500 行，一次性返回会把模型上下文撑爆
 * （命中多的时候返回的是真有用的行，不是噪音，但超长的结果是另一种不可用）。
 * 超了截到本上限，并给 `truncatedForSize` 与 `notes`——**不给**一个静默截断。
 * `matched` 不受此闸影响：全量命中数仍如实上报，那是缩小窗口时最有用的信号。
 */
export declare const MAX_RESULT_LINES = 4000;
/**
 * 日志检索结果。三个「截断」要分清：truncated = 扫描侧字节闸截断，limited = 命中数达到
 * limit，truncatedForSize = 返回侧行闸截断（见 MAX_RESULT_LINES）。
 */
export interface LogGrepResult {
    id: string;
    /** 命中总行数（即使超过 limit 也如实计数；返回侧行闸**不改变**它）。 */
    matched: number;
    /** 实际扫描的行数。 */
    scanned: number;
    /** **实际返回**的行数（命中 + 去重后的上下文；被返回侧行闸截过就是截断后的条数）。 */
    returned: number;
    /** 命中数达到 limit、还有命中没返回。 */
    limited: boolean;
    /**
     * 扫描输出超过字节上限（按**字节**丢最旧——窗口偏新，缩小 since/until 或换目标时段）。
     * 窗口已对齐到行边界，所以 `lines` 里不会出现半行；但切口之前的内容确实没参与检索。
     */
    truncated: boolean;
    /** 组装出的行数超过 MAX_RESULT_LINES、`lines` 已按上限截断。 */
    truncatedForSize?: boolean;
    /** 面向调用方的可执行提示（目前只有返回侧行闸这一档）：缩小 limit / 减小 context / 圈 since~until。 */
    notes?: string[];
    contextLines: number;
    lines: LogGrepLine[];
}
export interface ProbeResult {
    ok: boolean;
    bin: string;
    /** 服务端版本（`docker version --format {{.Server.Version}}`）。 */
    serverVersion: string | null;
    /** 失败原因（daemon 未运行 / 未安装 / 权限不足 / 超时）。 */
    error: string | null;
    target: string;
    /**
     * 失败是不是「CLI 挂住到超时」。单独一档而不并进 `error` 文案：调用方要靠它
     * 区分「没装」与「装了但不应答」——前者去装、后者去看 daemon / context。
     */
    timedOut: boolean;
}
/** 诊断默认抓多少行日志（契约 §1.2）。 */
export declare const DIAGNOSE_LOG_TAIL_DEFAULT = 80;
/** 诊断日志行数的上限（与 `docker_logs` 的夹紧风格一致：越界夹到边界，不报错）。 */
export declare const DIAGNOSE_LOG_TAIL_MAX = 500;
/** 诊断默认的事件窗口（契约 §1.2）。 */
export declare const DIAGNOSE_SINCE_DEFAULT = "1h";
/**
 * 诊断的事件扫描预算（字节，下限；实际取与配置上限的较大者）。
 *
 * 这不是「调大上限」：`docker_events` 工具的默认预算不变。单容器 + `--since 1h` 的
 * 事件里，健康检查每个周期产生 exec_create / exec_start / exec_die 三条，每条都带
 * 整份镜像标签（真机实测 ≈2.3KB/条、256 条/小时、合计 588KB），而这三类在解析时会被
 * 白名单整条丢掉——花 512KB 的预算把 95% 的字节买来再扔掉，正是「时间线永远是空」的成因。
 */
export declare const DIAGNOSE_EVENTS_SCAN_BYTES: number;
/** `diagnose()` 的结果：结论 + 三路降级的**原因**（原因同时进 findings，这里留给宿主胶水）。 */
export interface DiagnoseResult {
    diagnosis: Diagnosis;
    logError: string | null;
    eventError: string | null;
    statsError: string | null;
}
/** 单个目标上的 Docker 操作集合。 */
export declare class DockerApi {
    private readonly runner;
    private readonly bin;
    private readonly limits;
    constructor(runner: Runner, bin: string, limits: {
        timeoutMs: number;
        maxBytes: number;
    });
    /**
     * 探测：docker CLI 是否可用 + daemon 是否可达。
     *
     * 超时必须单独成一档（`timedOut`），不能落进「退出码 null」——`code` 为 null 时
     * 那句兜底文案对用户零信息量（D159），而超时的真实成因（daemon 卡死 / `docker
     * context` 指向连不上的远端 / CLI 是个挂住的包装脚本）恰恰是可修的那一类。
     */
    probe(): Promise<ProbeResult>;
    /**
     * assertOk + 截断检查（D13）：列表 / 详情类方法拿到的必须是**完整**输出。
     * 只检查 code 的话，「输出被截断」会被当成「本来就这么少」——面板静默少列
     * 容器，inspect 系列更会把截断误报成「对象不存在」，把用户引向错误方向。
     *
     * `alternative` 是**这个调用方真正能执行的替代做法**（D105）：agent 改不了插件
     * 设置，「请调大 maxOutputKb」对它不可执行——ps 能改 all、stats 能传 ids、
     * events 能缩小 since。文案里还会回显当前上限（见 truncationHint）。
     */
    private assertComplete;
    /**
     * 截断提示的统一文案（D105）：带上当前上限（KB）与目标标签——只说「超过上限」
     * 无法判断差多少；再拼上调用方的可执行替代做法。
     * 不抛错的路径（imageInspect 的 history，D104）复用同一句话，保持口径一致。
     */
    private truncationHint;
    /**
     * 容器列表。`name` 是**服务端过滤**（`docker ps --filter name=`），不是本地筛：
     * 本插件对列表做 limit/offset 分页，先取全量再在内存里筛的话，「第 2 页」会随
     * 过滤词变化而变化，分页语义就与总数对不上了。docker 的 name 过滤是**子串**
     * 匹配（不是精确匹配），对「在一台跑了几十个容器的机器上找 compose 项目」够用。
     */
    listContainers(all: boolean, name?: string): Promise<ContainerSummary[]>;
    inspect(ids: readonly string[]): Promise<ContainerDetail[]>;
    /**
     * 「需要关注」的容器（0.15.0）：先按摘要筛候选（不健康 / 重启中 / 僵死 /
     * 非零退出），再**分块** `docker inspect` 补权威字段——OOM 与真实退出码在 ps
     * 摘要里拿不到（137 也可能是手动 kill），只看摘要会误报。inspect 失败时退回摘要，
     * 但一定带 `degraded` 信号（D85/D86）。
     *
     * 反复重启（D11）：crash-loop 的容器多数时间显示 Up（退避最长 1 分钟，其余
     * 时间在跑），RestartCount 只在 inspect 里有——摘要筛不出来。这里把「刚刚
     * 启动」的运行中容器一并送进 inspect，按「重启计数高 + 刚启动」补捞；补捞有
     * 独立预算（D87）：合法候选再多也挤不掉它。
     *
     * 截断在过滤 + 排序**之后**（D12）：先切后拍的话，名额被一堆老的非零退出
     * 容器占满时，最严重的 OOM / unhealthy 反而会被切掉；返回值带 total / truncated
     * 截断信号，不静默。
     */
    attention(options?: {
        limit?: number;
    }): Promise<{
        items: AttentionItem[];
        total: number;
        truncated: boolean;
        degraded: boolean;
    }>;
    stats(ids: readonly string[]): Promise<ContainerStats[]>;
    /**
     * 实时统计流：`docker stats`（**不带 --no-stream**）每秒为每个容器输出一行
     * `{{json .}}`。与快照共用 statsArgv 的构造，只差 --no-stream。
     *
     * 与日志流的语义差异：这条流**不会自然结束**——容器一直跑，docker stats 就
     * 一直输出；只有全部被统计的容器退出（或 id 无效）时 docker 才自己退出。
     * 因此「关闭」由浏览器主动断（EventSource.close → res close → abort），
     * 服务端在这条路径上静默中止，不写任何帧。
     */
    statsStream(ids: readonly string[], handlers: StreamHandlers, signal?: AbortSignal): Promise<StreamResult>;
    /** 统计 argv 的唯一构造点：快照与流式只在 --no-stream 上有差异。 */
    private statsArgv;
    /**
     * 事件流：docker events 持续输出 JSON 行，**不会自然结束**，关闭由浏览器主动断。
     * 不带 --since：默认只从「现在」开始推，活动条要的是新动静而不是历史回放。
     * 带 --filter type=container 挡掉 network / volume / image 事件。
     */
    eventsStream(handlers: StreamHandlers, signal?: AbortSignal): Promise<StreamResult>;
    /**
     * 事件快照（agent 工具用）：必须先有 --until 才能让它退出——docker events
     * 只给 --since 时会一直 follow 下去，run() 会挂到超时。这里把 until 取成**请求
     * 时刻的 RFC3339**（不是字符串 'now'：docker 的 --until 只认时间戳或时长）。
     *
     * `container`（诊断用）补一条 `--filter container=<id>`：过滤在**服务端**做，
     * 宿主侧绝不按名字匹配（名字会在 rename / compose 重建后对不上，而 id 不会）。
     * 不传时 argv 与引入前逐字一致。
     *
     * `options`（诊断用）只调**采集预算**，不动 argv：单容器窗口的事件里混着大量
     * `exec_*` 噪音（每次健康检查三连，每条都带着整份镜像标签），真机实测一个
     * 20s 健康检查的容器 1h 就 588KB——而 `exec_*` 在解析时本来就会被白名单丢掉。
     * 所以诊断给一份独立的扫描预算（同 `logsGrep` 的做法）并 `keepTail`（溢出丢最旧：
     * 判断「现在为什么不行」要的是最近的一段）。既有调用点不传，行为逐字不变。
     */
    events(since: string, container?: string, options?: {
        maxBytes?: number;
        keepTail?: boolean;
    }): Promise<ContainerEvent[]>;
    /** 事件 argv 的唯一构造点：流式与快照只差 --since / --until，诊断再多一条 container 过滤。 */
    private eventsArgv;
    images(): Promise<ImageSummary[]>;
    /**
     * 镜像详情：`docker image inspect`（权威元数据 + 层列表）加上
     * `docker history`（构建历史）。
     *
     * history 走 **两段降级**：先试 `--format '{{json .}}'`（Docker ≥ 26），
     * 老版本会因 unknown flag 失败，再退回纯文本表格；两段都失败只是
     * `historyError` 非空、detail 照常返回——详情页不该因为构建历史取不到就整页报错。
     */
    imageInspect(ref: string): Promise<{
        ref: string;
        detail: ImageDetail;
        history: ImageHistoryEntry[];
        historyError: string | null;
    }>;
    /** 删除镜像（`docker image rm`，不带 -f）。调用方负责 allowMutations 门禁。 */
    imageRemove(ref: string): Promise<{
        ref: string;
        message: string;
    }>;
    /**
     * 清理 dangling（无标签）镜像：`docker image prune -f`。
     *
     * 刻意**不加 --all**：`--all` 会删掉所有未被容器使用的镜像（含普通 tag 的
     * 基础镜像），破坏性远超「清 dangling」的直觉。要删有标签的镜像请走单个删除
     * （imageRemove）并二次确认。
     */
    imagePrune(): Promise<{
        message: string;
    }>;
    networks(): Promise<NetworkSummary[]>;
    /**
     * 网络详情。inspect 顺带返回接入的容器，所以列表行**不**逐行 inspect 算容器数
     * （N 条网络就是 N 次 docker 调用），改成点进详情才取一次。
     */
    networkInspect(name: string): Promise<{
        name: string;
        detail: NetworkDetail;
    }>;
    /** 删除网络（`docker network rm`）。调用方负责 allowMutations 门禁。 */
    networkRemove(name: string): Promise<{
        name: string;
        message: string;
    }>;
    /**
     * 清理未被使用的网络：`docker network prune -f`。
     * `-f` 是必须的（否则 docker 会等交互确认，我们是非交互调用），
     * 且 prune 只动「没有容器接入」的网络——但 compose 的自定义网络也会被清掉
     * （下次 up 会重建），所以调用方仍然要二次确认。
     */
    networkPrune(): Promise<{
        message: string;
    }>;
    volumes(): Promise<VolumeSummary[]>;
    /** 卷详情（`docker volume inspect <name>`）。 */
    volumeInspect(name: string): Promise<{
        name: string;
        detail: VolumeDetail;
    }>;
    /** 删除卷（`docker volume rm`）。数据随卷一起没，调用方负责 allowMutations 门禁。 */
    volumeRemove(name: string): Promise<{
        name: string;
        message: string;
    }>;
    /**
     * 清理未被容器使用的卷：`docker volume prune -f`。
     *
     * **破坏性最高的一个 prune**：卷里装的是数据。刻意不带 `--all`——实测 docker 27
     * 的 `volume prune` 有 `-a/--all` 开关、不带时只删**匿名**卷；但 docker < 23 没有这个
     * 开关，plain prune 会把命名卷一起删。所以调用方必须二次确认，并且确认文案要写明
     * 这个版本差异（见 README「已知限制」）。
     */
    volumePrune(): Promise<{
        message: string;
    }>;
    /**
     * 磁盘占用（`docker system df`）：**两条命令、两份预算**。
     *
     *   - 汇总 `system df --format '{{json .}}'`：失败即整体失败（连汇总都拿不到，
     *     这个视图没有意义）；
     *   - 明细 `system df -v --format '{{json .}}'`：**独立失败**——老 docker 不认
     *     `-v --format`（unknown flag）、输出被截断、JSON 坏了，都只让 `degraded=true`
     *     并带一句人话原因，汇总照常返回。
     *
     * 两条命令不合并（契约 §2.1）：`-v` 是重活（会去 stat 每个卷），而汇总很便宜——
     * 合并后一个慢/一个失败就互相拖累。
     */
    systemDf(): Promise<DiskUsage>;
    /**
     * 现场还原：从 inspect 的原始 JSON 反推等价 `docker run`（只生成文本，**不执行**）。
     *
     * 为什么另起一条读 inspect 的路径而不是复用 `inspect()`：`ContainerDetail` 刻意不含
     * env / binds / hostConfig（那会把凭证灌进 `docker_inspect` 的模型上下文），而还原
     * 需要它们。所以这里拿**原始行**交给纯模块 `src/recreate.ts`，产出纯文本。
     */
    recreate(id: string): Promise<RecreateResult>;
    /**
     * 拉取镜像（`docker pull`）。逐层进度天然是流：非 TTY 下 docker 按状态行输出
     * （Pulling fs layer / Downloading / Extracting / Pull complete），直接复用
     * ssh-exec 的长流通道（runLocalStream / RemoteExec.stream），无总超时，
     * 由连接生命周期收尾。调用方负责 allowMutations 门禁。
     */
    pullStream(ref: string, handlers: StreamHandlers, signal?: AbortSignal): Promise<StreamResult>;
    /** 拉取的快照形态（agent 工具用）：一次性跑完，输出有上限。 */
    pull(ref: string, timeoutMs?: number): Promise<{
        ref: string;
        code: number | null;
        text: string;
        truncated: boolean;
        durationMs: number;
    }>;
    /**
     * 日志：stdout / stderr 分别收，stdout 整段在前、stderr 在后。
     *
     * 注意这不是「按到达顺序合并」（D44 注释纠正）：一次性命令的两路输出在
     * run() 里分别累积，时序信息已经丢了；容器交替写两路时快照日志的先后顺序
     * 与真实到达序可能不同。要真实时序请用实时跟随（FOLLOW 流是逐块按到达序推的）。
     */
    logs(id: string, options?: LogsOptions): Promise<{
        id: string;
        text: string;
        truncated: boolean;
    }>;
    /**
     * 实时日志流：`docker logs --follow`，stdout/stderr 逐块回调，直到容器退出 /
     * 远端关闭 / signal 中止。argv 与快照 logs() 共用同一构造（timestamps / since
     * 语义完全一致），只多一个 --follow，且 **tail 允许 0**（D133：客户端断线重连时
     * 只要新行、不要重放历史；`--tail 0` 正是不补历史、只跟随的原生语义）。
     */
    logsStream(id: string, options: LogsOptions | undefined, handlers: StreamHandlers, signal?: AbortSignal): Promise<StreamResult>;
    /**
     * 日志检索（grep）：**宿主侧逐行过滤，不碰远端 shell**——绝不拼 `| grep`
     * （那会违反「argv 构造、绝不做字符串拼接」的铁律，且 SSH 路径的转义面完全不同）。
     *
     * 与 logs() 的分工（写进工具描述，供模型选择）：「报错在最近尾部」→ docker_logs；
     * 「埋在深处 / 特定时间窗 / 找关键词」→ docker_logs_grep。扫描与返回的预算是**分开**
     * 的：扫描侧给到 8~32MB（maxOutputKb 只是单命令返回闸，grep 的意义就是从大量原文里
     * 筛出少量命中），返回侧由 limit × context 夹住，且另有**返回侧行闸**
     * MAX_RESULT_LINES（limit 上限 500 × context 上限 20 能凑出两万行，一次返回会撑爆
     * 上下文）；三处截断各有独立信号位（truncated = 扫描侧溢出丢最旧、limited = 命中超过
     * limit、truncatedForSize = 返回行数超上限），都不静默。扫描窗口
     * **对齐到行边界**（`lineAlign`）：切口处的半行不当作一行返回，否则它会以没有时间戳的
     * 噪音形式进模型上下文，看起来像「检索结果里有脏行」。
     *
     * 默认字面子串匹配（grep -F 等价，零 ReDoS）；regexp=true 才按 JS 正则解释，
     * pattern 上限 512 字符。时间戳默认开——深处的命中没有时间等于没用。
     */
    logsGrep(id: string, options: LogGrepOptions): Promise<LogGrepResult>;
    /**
     * 日志 argv 的唯一构造点：快照与流式只在 `--follow` 与 tail 下限上有差异，
     * 校验与夹紧必须逐字一致（否则同一 id 在两条路径上行为漂移）。
     * `tailOverride` 供 logsGrep 传 `all`（检索要扫全部历史，而不是尾部 5000 行）。
     */
    private logsArgv;
    /** 生命周期操作；调用方负责 readOnly / allowMutations 门禁。 */
    action(request: DockerAction): Promise<{
        id: string;
        action: string;
        message: string;
    }>;
    /** 一次性 exec（无 TTY）：`docker exec <id> sh -c <command>`。 */
    exec(id: string, command: string, timeoutMs?: number): Promise<{
        id: string;
        command: string;
        code: number | null;
        stdout: string;
        stderr: string;
        truncated: boolean;
        durationMs: number;
    }>;
    /**
     * 一次性 exec 的 **argv 模式**：`docker exec <id> <argv…>`，不经容器内 shell。
     *
     * 与上面 command 模式互补，不是替代：
     *   - 字符串模式把整条命令交给容器内 `sh -c`，管道 / 变量 / 重定向都能用，代价是
     *     空格与引号要再过一层 shell 解析（空参数、相邻引号、反斜杠都容易被改写）；
     *   - argv 模式一个 token 一个参数，宿主与容器都不做展开，`["printf","%s","a b"]`
     *     里的 `a b` 就是**一个**参数。需要 shell 语义时显式写 `["sh","-c","…"]`。
     * 两条通道都受同一个 `allowExec` 静态闸与档位闸约束（工具层负责），这里只保证
     * 参数形状合法、不会以字符串拼接的方式进入 argv。
     */
    execArgv(id: string, argv: unknown, timeoutMs?: number): Promise<{
        id: string;
        argv: string[];
        command: string;
        code: number | null;
        stdout: string;
        stderr: string;
        truncated: boolean;
        durationMs: number;
    }>;
    /**
     * 容器内的进程快照（`docker top <id> -eo <TOP_PS_FORMAT>`）。
     *
     * **容器名要单独取一次**：`docker top` 的输出里没有容器名（本机实测表头就是那八列），
     * 而契约要求返回 `name`。这条是**次要信息**——只读、输出一行、失败不影响 top 的
     * 成功路径（回落成传入的 id，绝不编造）。所以它**不在** top 的 fail-fast 里：
     * top 自己失败照旧走 assertOk 抛错（容器不存在 / 未运行时 docker 就是这么答的）。
     *
     * 容器没在运行时 `docker top` 报错 → assertOk 抛错，**不返回空列表**：空列表会被
     * 读成「容器里没有进程」，而真实情况是「问不了」。
     */
    top(id: string): Promise<{
        id: string;
        name: string;
        rows: TopProcessRow[];
        truncated: boolean;
    }>;
    /**
     * 容器名（`docker inspect --format '{{.Name}}'`）。
     *
     * `.Name` 带前导斜杠（`/dsh-remote-server`），必须 strip；strip 后为空、或这条命令
     * 失败，都回落成传入的 id——名字是次要信息，不该把已经成功的 top 带下去。
     */
    private containerName;
    /** 容器名 argv 的唯一构造点（`docker top` 的输出里没有名字，top 用这条补）。 */
    private containerNameArgv;
    /**
     * 「容器为什么不行」：一次采集四路，交给纯判据（`src/diagnose.ts`）出结论。
     *
     * **顺序与预算**（契约 §1.2）：
     *   ① 先 `inspect`——它是权威状态（退出码 / OOM / 重启次数 / 健康），**失败即整体失败**；
     *   ② 再并发 `logs` / `events`（带 `--filter container=<id>`，服务端过滤）/ `stats`——
     *      任何一路失败**只降级不抛**：该路给 `null`（与「确实是空的」区分），
     *      findings 里多一条 `*-unavailable` 说明原因，evidence 对应字段给 null。
     *
     * 三路各自独立 catch 而不是 `Promise.allSettled`：失败原因要变成给人看的文案
     * （`*Error`），而 allSettled 的 reason 还得再剖一层。
     *
     * `logTail` 夹到 1~500（默认 80），`since` 走 `assertSince`（D45 同一口径，默认 1h）——
     * 两处夹紧都在这里做，HTTP 路由与 agent 工具拿到的是同一套语义。
     */
    diagnose(id: string, options?: {
        logTail?: number;
        since?: string;
    }): Promise<DiagnoseResult>;
    private assertOk;
}
/** 目标定义（settings 里的 `targets[]`）。 */
export interface DockerTarget {
    /** 展示名（唯一）。 */
    name: string;
    /** 本机 / SSH 远程。 */
    kind: 'local' | 'ssh';
    /** kind=ssh 时引用 tty 连接簿条目名（可选；也可直接给内联字段）。 */
    book?: string;
    host?: string;
    port?: number;
    username?: string;
    auth?: 'agent' | 'key' | 'password';
    keyPath?: string;
    password?: string;
    passphrase?: string;
    agentForward?: boolean;
}
/** 已解析出 SSH 规格的目标（连接簿查找完成）。 */
export interface ResolvedTarget {
    name: string;
    kind: 'local' | 'ssh';
    spec?: SshSpec;
}
/**
 * 为一个目标构造 Runner。
 *
 * `signal`（D161）是**构造时**绑定的外部取消信号：跨目标聚合给每个目标各配一个
 * `AbortController`，预算到点就 abort 这一条。绑定在构造期而不是每个调用点，是为了
 * **不改那 20+ 个 `runner.run(...)` 调用点**——它们都不需要这个信号（单目标路径的
 * 截止时间本来就是 `timeoutMs`）。
 *
 * 两个分支（local / ssh）**必须都透传**：只给一边接，就会出现「本机能取消、SSH 不能」
 * 的半截行为——比不改更糟（见项目级 ROADMAP 里跳板机那条的同一判据）。
 */
export declare function createRunner(options: {
    target: ResolvedTarget;
    remote: RemoteExec;
    logger: ExecLogger;
    signal?: AbortSignal;
}): Runner;
/**
 * 供宿主半体复用：把 HostKeyStore 与 logger 绑到 RemoteExec。
 *
 * `proxyCommandAllowed` 缺省 = 恒关（ProxyCommand 这一档要显式给闸门求值器才开，见
 * `RemoteExec` 的构造参数注释）。
 */
export declare function createRemoteExec(logger: ExecLogger, store: HostKeyStore, options?: {
    proxyCommandAllowed?: () => boolean;
}): RemoteExec;
