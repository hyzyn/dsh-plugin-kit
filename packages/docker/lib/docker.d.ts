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
import type { ExecResult, HostKeyStore, SshSpec, ExecLogger } from './ssh-exec.js';
import { RemoteExec } from './ssh-exec.js';
/** 校验一个 docker 引用（容器名 / ID / 镜像）。不合法直接抛错，绝不拼接进命令。 */
export declare function assertRef(value: unknown, field: string): string;
/** docker CLI 可执行文件白名单（argv[0]，不设默认值以免误用其他程序）。 */
export declare function assertBin(value: unknown): string;
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
}
export interface DockerAction {
    action: 'start' | 'stop' | 'restart' | 'remove';
    id: string;
}
export interface LogsOptions {
    tail?: number;
    timestamps?: boolean;
    since?: string;
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
    images(): Promise<ImageSummary[]>;
    /** 日志：stdout / stderr 分别收，再按到达顺序合并（docker logs 两者都有内容）。 */
    logs(id: string, options?: LogsOptions): Promise<{
        id: string;
        text: string;
        truncated: boolean;
    }>;
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
