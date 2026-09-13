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
export type { StreamHandlers, StreamResult } from './ssh-exec.js';
/** 校验一个 docker 引用（容器名 / ID / 镜像）。不合法直接抛错，绝不拼接进命令。 */
export declare function assertRef(value: unknown, field: string): string;
/** docker CLI 可执行文件白名单（argv[0]，不设默认值以免误用其他程序）。 */
export declare function assertBin(value: unknown): string;
/** 校验一个镜像引用（tag / digest / ID）。不合法直接抛错，绝不拼接进命令。 */
export declare function assertImageRef(value: unknown, field: string): string;
/** 校验一个 docker 网络 / 卷名（也是 inspect / rm 的引用）。 */
export declare function assertName(value: unknown, field: string): string;
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
export interface PortMapping {
    hostIp?: string;
    hostPort?: number;
    containerPort: number;
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
    /** compose 项目 / 服务（有标签时）。 */
    composeProject: string | null;
    composeService: string | null;
    /** ps 的 `.Size`（需 --size，缺省不请求，通常为空）。 */
    size: string;
}
/** 从 ps 的 `.Status`（`Up 2 hours (healthy)`）推导状态。健康态单独由 deriveHealth 提供。 */
export declare function deriveState(status: string): string;
/** 从 ps 的 `.Status` 提取健康态（`Up 2 hours (healthy)` → healthy）。 */
export declare function deriveHealth(status: string): string | null;
/** 解析 ps 的 `.Ports` 串：`0.0.0.0:8080->80/tcp, [::]:8080->80/tcp, 9000/tcp`。 */
export declare function parsePorts(text: string): PortMapping[];
/** `docker ps --format '{{json .}}'` → ContainerSummary[]。 */
export declare function parsePsJson(text: string): ContainerSummary[];
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
/** inspect 的 `NetworkSettings.Ports`：`{ "80/tcp": [{HostIp, HostPort}] }`。 */
export declare function parseInspectPorts(value: unknown): PortMapping[];
/** 一个目标（target）背后的命令执行通道。 */
export interface Runner {
    /** 展示用标签：`本机` 或 `user@host`。 */
    readonly label: string;
    run(argv: readonly string[], options?: {
        timeoutMs?: number;
        maxBytes?: number;
    }): Promise<ExecResult>;
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
    /** 实时跟随（`docker logs --follow`）：仅 logsStream() 使用，logs() 忽略。 */
    follow?: boolean;
}
export interface ProbeResult {
    ok: boolean;
    bin: string;
    /** 服务端版本（`docker version --format {{.Server.Version}}`）。 */
    serverVersion: string | null;
    /** 失败原因（daemon 未运行 / 未安装 / 权限不足）。 */
    error: string | null;
    target: string;
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
    /** 探测：docker CLI 是否可用 + daemon 是否可达。 */
    probe(): Promise<ProbeResult>;
    listContainers(all: boolean): Promise<ContainerSummary[]>;
    inspect(ids: readonly string[]): Promise<ContainerDetail[]>;
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
     */
    events(since: string): Promise<ContainerEvent[]>;
    /** 事件 argv 的唯一构造点：流式与快照只差 --since / --until。 */
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
    /** 日志：stdout / stderr 分别收，再按到达顺序合并（docker logs 两者都有内容）。 */
    logs(id: string, options?: LogsOptions): Promise<{
        id: string;
        text: string;
        truncated: boolean;
    }>;
    /**
     * 实时日志流：`docker logs --follow`，stdout/stderr 逐块回调，直到容器退出 /
     * 远端关闭 / signal 中止。argv 与快照 logs() 共用同一构造（tail 夹紧
     * 1..5000、timestamps / since 语义完全一致），只多一个 --follow。
     */
    logsStream(id: string, options: LogsOptions | undefined, handlers: StreamHandlers, signal?: AbortSignal): Promise<StreamResult>;
    /**
     * 日志 argv 的唯一构造点：快照与流式只在 `--follow` 上有差异，
     * 校验与夹紧必须逐字一致（否则同一 id 在两条路径上行为漂移）。
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
/** 为一个目标构造 Runner。 */
export declare function createRunner(options: {
    target: ResolvedTarget;
    remote: RemoteExec;
    logger: ExecLogger;
}): Runner;
/** 供宿主半体复用：把 HostKeyStore 与 logger 绑到 RemoteExec。 */
export declare function createRemoteExec(logger: ExecLogger, store: HostKeyStore): RemoteExec;
