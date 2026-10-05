/**
 * @hyzyn/dsh-docker — DSH Web GUI 的 Docker 容器面板（host 半体）。
 *
 * 与 dsh-tty 的关系（方案 A：独立插件，tty 零改动）：
 *   - **连接簿**：只读复用 tty 的 entry settings（DSH ≥0.1.7 的
 *     `settings.describe()`，经 kit 的 `readSettingsEntry(ctx, 'tty')`）的
 *     `sshHosts`。tty 未安装时退化为「只支持本机 / 内联 SSH 字段」。
 *   - **主机指纹**：本插件自持一份 `hostKeys`（TOFU），并优先读取 tty 已记录
 *     的指纹作为种子，避免同一主机在两处重复确认。
 *   - **执行通道**：自持池化 SSH exec（src/ssh-exec.ts），与 tty 的 PTY 会话
 *     完全独立；本机目标直接 spawn docker CLI。
 *
 * 信任模型（与 tty 不同，必须强调）：
 *   docker socket ≈ 该主机的 root 权限。因此**默认只读**：
 *   `allowMutations` 未开启时 start/stop/restart/remove 一律拒绝，
 *   `allowExec` 未开启时 `docker exec` 一律拒绝；两个开关都需用户在设置卡片
 *   显式打开。agent 工具同样受这两个开关约束（未开启时连工具都不注册）。
 */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import { DockerApi, assertBin, assertImageRef, parseImageHistoryJson, parseImageHistoryText, parseImageInspectJson, parseInspectJson, parsePsJson, parseStatsJson } from './docker.js';
import type { DockerTarget, ResolvedTarget } from './docker.js';
import type { HostKeyRecord, SshSpec } from './ssh-exec.js';
export type { HostKeyRecord } from './ssh-exec.js';
export type { ContainerSummary, ContainerDetail, ContainerStats, ContainerEvent, ImageSummary, NetworkSummary, NetworkDetail, VolumeSummary, VolumeDetail, DockerTarget } from './docker.js';
export interface Config {
    /** 关闭整个插件。默认开。 */
    enabled?: boolean;
    /** 是否向 agent 注入插件能力公告。默认开。 */
    announceToAgent?: boolean;
    /** docker CLI 可执行文件名 / 路径（podman 可填 podman）。默认 docker。 */
    dockerBin?: string;
    /** 允许 start/stop/restart/remove（含对应 agent 工具）。默认关。 */
    allowMutations?: boolean;
    /** 允许一次性 docker exec（含对应 agent 工具）。默认关。 */
    allowExec?: boolean;
    /** exec 默认超时秒数（1~120）。默认 30。 */
    execTimeoutSec?: number;
    /** 面板统计刷新间隔秒数（1~60）。默认 5。 */
    pollIntervalSec?: number;
    /** 日志默认尾部行数（1~5000）。默认 200。 */
    logTailDefault?: number;
    /** 单次命令输出上限（KB，1~8192）。默认 512。 */
    maxOutputKb?: number;
    /** 目标列表（本机 / SSH）。 */
    targets?: DockerTarget[];
    /** SSH 主机指纹记录（TOFU，随 settings 落盘）。 */
    hostKeys?: HostKeyRecord[];
}
/**
 * 运行时 Config schema——DSH ≥0.1.7 起同时就是本插件的 settings 存储。
 *
 * 全部字段都标 `.volatile()`：它们都是卡片可改项（见 KNOWN_CONFIG_KEYS），而
 * `settings.update(entryId, patch)` 只接受 volatile 路径；loader 对 volatile-only
 * 变更原地更新引用并发 `loader/volatile-update`，不重挂插件——插件订阅后走
 * `applySection` 热应用（见 kit 的 settingsEntryScope）。
 */
export declare const Config: z;
/** 解析后的运行期配置（settings 与 composition 两条来源统一到这一形状）。 */
interface LiveConfig {
    enabled: boolean;
    announceToAgent: boolean;
    dockerBin: string;
    allowMutations: boolean;
    allowExec: boolean;
    execTimeoutSec: number;
    pollIntervalSec: number;
    logTailDefault: number;
    maxOutputKb: number;
    targets: DockerTarget[];
    hostKeys: HostKeyRecord[];
}
/**
 * `describeLocalProbeFailure` 的额外上下文（都只能由调用方探测得到，所以外挂进来——
 * 那个函数刻意保持**纯文本进、纯文本出**，好让它能被单测直接驱动）。
 */
interface LocalProbeHint {
    /** 失败是不是超时（来自 `ProbeResult.timedOut`）。 */
    timedOut?: boolean;
    /** CLI 缺失时，PATH 里找到的别的容器 CLI（见 findAlternativeLocalCli），如 `podman`。 */
    alternativeCli?: string;
}
/**
 * SSE 帧封装：data 一律 `JSON.stringify` 成**单行**——换行 / 引号被转义，
 * 多字节字符也不会被 SSE 的 `\n` 行边界截断（客户端 JSON.parse 还原）。
 */
export declare function sseFrame(event: string, data: unknown): string;
/** 合帧器句柄（生命周期：`flush()` 收尾、`dispose()` 停表）。 */
export interface SseCoalescer {
    /** 追加一个分片：窗口到点（或攒满 maxBytes）时按通道合并成一帧推出去。 */
    push(channel: 'd' | 'e', text: string): void;
    /** 立刻把两个通道里攒着的分片推出去（顺序：stdout 先、stderr 后）。 */
    flush(): void;
    /** 停掉定时器并丢掉残帧（客户端已走 / 流已收尾，再推只会写进关掉的响应）。 */
    dispose(): void;
}
/**
 * SSE 分片合帧器（D151）：把「一个 stdout chunk 一帧」压成「一个窗口一帧」。
 *
 * 为什么要有它：`docker logs -f` / `docker pull` 的分片大小由上游决定，话痨容器
 * （未缓冲 stdout、逐行 flush 的应用）能到每秒几千个 chunk，而每个 chunk 在链路上
 * 的固定成本并不小——服务端一次 `JSON.stringify` + 一次 `res.write`，客户端一次
 * SSE 事件派发 + 一次 `JSON.parse` + 一次 `pushChunk`（字符串拼接 + 扫描换行）。
 * 这些成本与「一行日志多少个字节」无关，只与**事件个数**成正比。
 *
 * 实测（scripts/log-perf.mjs 的事件洪泛剖面，同一行速率 6.2k 行/秒）：每事件 1 行
 * 时事件循环最大延迟 53ms、出现 1 个 >50ms 的长帧；每事件 50 行时 37ms、0 个。
 * 差距在事件率再高一个数量级时会继续放大（浏览器真实 SSE 解析比冒烟桩更贵）。
 *
 * 语义约束（客户端按到达序落行，合帧不能改变「看到的内容」）：
 *   - 同一通道内部**严格保序**（就是字符串拼接）；
 *   - 两个通道各攒各的，一帧最多推 `d` 一条 + `e` 一条——`docker logs` 的 stdout /
 *     stderr 本就是两路，跨通道的先后从来不由单帧保证；
 *   - 收尾前调用方必须 `flush()`：`end` 帧得排在这些 `line` 帧之后（见调用点）。
 */
export declare function createSseCoalescer(options: {
    emit: (channel: 'd' | 'e', text: string) => void;
    windowMs?: number;
    maxBytes?: number;
}): SseCoalescer;
/** 清洗一份 targets 输入（settings 存储 / 热更新路径共用）。 */
export declare function sanitizeTargets(input: unknown): DockerTarget[] | undefined;
/** 一键连接本机时新建目标的基准名。刻意用稳定的小写 `local`（不是 `本机`）：它是可预测的 id，重名时另起 `local-2`…。 */
export declare const LOCAL_TARGET_NAME = "local";
/** 目标列表里第一个 `kind=local` 的名称（没有则 undefined）——「连接本机」靠它判断该新建还是复用。 */
export declare function findLocalTargetName(targets: readonly DockerTarget[]): string | undefined;
/**
 * 新建本机目标时挑一个**确定性无冲突**的名称：`local` 被占就顺着 `local-2`、`local-3`… 找第一个空位。
 *
 * 为什么不做随机 / 时间戳后缀：同一个工作区里重复点「连接本机」应当**幂等**（第二次复用第一次那条），
 * 而重名只可能来自用户自己配的其它 `local*`；顺序探测既确定又与用户已有的名字不冲突（不覆盖、不改名）。
 * 上界 1000 是防御性截断（真到那时说明列表已经病态，宁可失败也不能无限循环）。
 */
export declare function nextLocalTargetName(taken: readonly string[]): string | undefined;
/**
 * 「探不到 CLI」的判据（`runLocal` 的 ENOENT 抛错形态）。
 *
 * 抽出来当单一来源：文案分档与「要不要去找 podman」都用它，两处各写一遍正则
 * 迟早会漂移——那时会出现「文案说 CLI 缺失、但不去找候选」或反过来。
 */
export declare function isLocalCliMissing(raw: string): boolean;
/**
 * 在 PATH 里找**别的**容器 CLI（`dockerBin` 缺失时的候选），返回名字数组（可能为空）。
 *
 * 只读探测，**绝不改配置**：返回的候选交给文案去说「你可以把 docker CLI 改成它」，
 * 改不改由用户在设置卡片决定。静默改写 `dockerBin` 会违背本插件「不替用户决定」的
 * 一贯取向（何况 podman 与本插件的输出格式兼容性并未逐项验证，见 README）。
 *
 * `env` 可注入（测试用）；Windows 按 PATHEXT 补扩展名——本插件明确支持 Windows
 * 盘符路径，不能只认无扩展名的 POSIX 查找。
 */
export declare function findAlternativeLocalCli(bin: string, env?: NodeJS.ProcessEnv): string[];
/**
 * 只读探测失败 → 用户能照着做的一句话。按**成因**分档（而不是原样甩 `exit status 1`）：
 * CLI 不在（装 Docker / 改 `dockerBin`）、超时（daemon 卡死 / context 指错）、
 * daemon 不可达、socket 无权、其它（原样透出）。
 *
 * `probe()` 的两条失败路径形状不同：`runLocal` 对 ENOENT 是**抛错**（`无法执行 docker：spawn docker ENOENT`），
 * 而 daemon 连不上是 docker CLI 自己以非零退出 + stderr 文案返回；两条都要认得出。
 */
export declare function describeLocalProbeFailure(raw: string, bin?: string, hint?: LocalProbeHint): string;
/**
 * 清洗一份 hostKeys 输入（settings 存储 / 热更新 / 种子复制共用）。
 *
 * 同时接受两种形状（D03）：
 *   - tty 0.19.0+ 的 `{host, port, fingerprints: [...]}`（多指纹集合）；
 *   - docker 0.6.x 自己落盘的 `{host, port, fingerprint}`（迁移输入）。
 * host 统一 trim + 小写（与 tty 的落盘口径一致，否则种子命中与否取决于大小写），
 * 同一 host:port 的多条记录合并成一组指纹。
 */
export declare function sanitizeHostKeys(input: unknown): HostKeyRecord[] | undefined;
/**
 * hostKeys **并集**合并（D10）：客户端表单快照回传的表不得整表覆盖 TOFU 运行期
 * 新增的记录——面板一次无关保存就把钉扎回退掉，指纹变更检测随之失效。按
 * host:port 合并指纹集合；删除某条记录走显式的 `hostKeysRemove`。
 */
export declare function mergeHostKeys(base: HostKeyRecord[], incoming: unknown): HostKeyRecord[];
/**
 * 合并凭证：配置卡片从不回显密码 / 口令（只回 passwordSet），因此浏览器提交的
 * targets 里往往**没有** password/passphrase 字段。按目标名把已有值补回来，
 * 避免「改个名字就把密码清了」。（显式传空字符串仍然按清空处理。）
 *
 * 改名的目标按**连接身份**（book / host / port / username / auth / keyPath）认领
 * 旧凭证（D15）：只按名字找的话，改名 = 凭证凭空消失。身份对不上就不继承——
 * 「删一个目标、另建一个无关目标」不应该串密码，宁缺勿错。
 */
export declare function mergeTargetSecrets(prev: DockerTarget[], incoming: unknown): unknown;
/** 把一份任意来源的配置归一成 LiveConfig。 */
export declare function normalizeConfig(section: Record<string, unknown>): LiveConfig;
/**
 * 事件时间（Unix 秒）→ 本机时区的 HH:MM:SS（agent 文本输出用）。
 * 只回时间不回日期：事件快照窗口最多几小时，日期对排障没有信息量；
 * 浏览器侧不用这个——那里用 Date 按用户本地时区现算。
 */
export declare function formatEventTime(seconds: number): string;
/** 字节 → docker 风格的人类可读大小（十进制单位，与 `docker images` 的 SIZE 一致）。 */
export declare function formatBytes(value: number): string;
/** 从 tty 的 entry settings 读取连接簿（只读；tty 未安装时为空表）。 */
/**
 * 读 tty 连接簿 → 本包的连接规格。**导出仅供单测**（连接簿 → 规格这一跳是「一处配置、两处
 * 生效」的落地处：漏带 jump / proxyCommand 就是「tty 能连、docker 连不上」那种半吊子状态）。
 */
export declare function readTtyBooks(settings: SettingsLookup | undefined): Map<string, SshSpec>;
/**
 * 读 tty settings 里的 ProxyCommand 闸门（`allowProxyCommand`，默认关）。
 *
 * 为什么本包要用 **tty 的**开关而不是自己再加一个：连接簿只有一处（tty），代理命令也只有
 * 一处能填；两个开关会让「连接簿配了、这个面板不认」变成说不清的状态。代价是本包多依赖一个
 * 只读 settings 字段——settings 句柄缺失（启动早期）时恒 false，即**关**（失败方向安全）。
 */
export declare function readTtyProxyCommandAllowed(settings: SettingsLookup | undefined): boolean;
/** 把一个配置目标解析成可连接的规格（连接簿查找在此完成）。 */
export declare function resolveTarget(target: DockerTarget, books: Map<string, SshSpec>): {
    resolved?: ResolvedTarget;
    error?: string;
};
/** 只读其它插件 entry 的 settings（旧 `settings.get(ns)` 的替代）。 */
interface SettingsLookup {
    get(ns: string): unknown;
}
export declare const name: string, inject: string[] | undefined, apply: (ctx: Context, config?: Config | undefined) => void;
export { parsePsJson, parseStatsJson, parseInspectJson, assertBin, assertImageRef, parseImageInspectJson, parseImageHistoryJson, parseImageHistoryText, DockerApi };
export type { Runner } from './docker.js';
