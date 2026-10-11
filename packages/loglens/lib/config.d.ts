/**
 * @hyzyn/dsh-loglens — 来源清单的纯逻辑层。
 *
 * 本模块不 import cordis / 网络 / 文件系统：路由层（src/index.ts）与用例直接调它，
 * 「什么样的来源算合法」「id 怎么生成」「坏行丢掉还是整份丢掉」三类判据只有一处归宿。
 * 契约与安全口径见 docs/design.md 的 §3（归一化行模型）与 §4（安全与凭据）。
 */
/** 支持的后端 / 来源类型（设计 §2 后端分层）。 */
export type SourceKind = 'loki' | 'elasticsearch' | 'opensearch' | 'docker';
export declare const SOURCE_KINDS: readonly SourceKind[];
/** 一个日志来源。id 是稳定标识：浏览器侧只传它，查询面永不传 URL。 */
export interface LoglensTarget {
    id: string;
    kind: SourceKind;
    /** 展示名；留空则回落 id。 */
    label: string;
    /** 地址；docker 是采集来源，允许留空（设计 §5 选项 0）。 */
    url: string;
    /**
     * 只对 `docker` 有意义：**Docker 面板里的目标名**（如 `local`）。
     *
     * 面板那条日志视图走的是 Docker 插件自己的 `/api/dsh-docker/logs`，那条路由按**它自己的**目标名
     * 找主机——两个插件各有各的目标清单，名字不会自动对上，所以这里显式存一个。留空时面板不传 target，
     * 由 Docker 插件自己在「只有一个目标」时回落（多个目标时它会回一句带候选名的 400，面板照显）。
     */
    dockerTarget?: string;
    /**
     * 只对 ES / OpenSearch 有意义：**索引表达式**（如 `app-logs-*`、`logs-2026.*,-logs-2026.09.*`）。
     *
     * 为什么要有它（2026-10-11 真机反馈第 3 条）：原先索引表达式是从**地址的路径**悄悄推出来的，
     * 没写路径就落 `*`——配置里只写了 `http://host:9200` 的一条来源，其实是**全集群通配**，
     * 里面混着 grafana / prometheus / filebeat 的索引与 `.kibana_1` / `.infini_*` 一堆系统索引。
     * 「路径即索引」是条暗号，agent 与人都猜不到；现在它可以显式写在这里，也会被回显出来。
     *
     * 留空时的口径（兼容旧配置）：地址里有路径就用路径，没有就用 `*,-.*`（**默认排除点号索引**：
     * 那是系统索引，不是日志）。
     */
    index?: string;
}
export interface LoglensConfig {
    enabled: boolean;
    targets: LoglensTarget[];
}
/** 来源条数上限：够用，且挡住「一次注入几千条」的配置面。 */
export declare const MAX_TARGETS = 32;
export declare function emptyConfig(): LoglensConfig;
export declare function isSourceKind(value: unknown): value is SourceKind;
/** docker 是采集来源而不是查询后端：它的地址可以留空（设计 §5 选项 0）。 */
export declare function urlRequired(kind: SourceKind): boolean;
/**
 * 链路本地 / 云元数据地址：设计 §1 明列的非目标，添加动作直接拒。
 *
 * 这里是**添加期的字面量快筛**；真正的出站围栏在 src/net.ts（2026-10-11 落地）：那边判的是
 * **解析之后的 IP**，还管重定向、体积与超时。两层都要有——本层让「填进来就明显不对的」当场报错，
 * net.ts 那层才挡得住域名解析出来的东西。
 */
export declare function isLinkLocalHost(hostname: string): boolean;
/**
 * 地址校验：只收 http / https 的绝对地址，并把链路本地 / 云元数据拒在门外。
 *
 * **连接面 = 你配置的来源**：回环、私网、公网一律放行（托管日志服务是正常用法）；唯一被
 * 无条件拒绝的是链路本地 / 云元数据那一档。这条语义在设计 §4.1 里写明，别在后端适配器里再收紧一遍。
 */
export declare function normalizeUrl(raw: unknown): {
    ok: true;
    url: string;
} | {
    ok: false;
    error: string;
};
/** 由名称 / 地址推一个 id 基底；都不成词时回落 target（中文名会整段被过滤掉）。 */
export declare function slugId(...sources: string[]): string;
/** 在已有 id 集合里取一个不冲突的 id（-2 / -3 …）。 */
export declare function uniqueId(base: string, taken: readonly string[]): string;
export type TargetValidation = {
    ok: true;
    target: LoglensTarget;
} | {
    ok: false;
    error: string;
};
/**
 * 校验并归一化一条来源。taken 用于 id 去重（新增与改判都走同一条路，避免两处判据）。
 * input.id 只在**新建**时起作用；改判时 id 由调用方钉住（id 不可改，见 updateTarget）。
 */
/** 由地址推一个 id 基底：取 host + path，别把协议与斜杠也变成连字符（那会得到 http-127-0-0-1-3100 这种）。 */
export declare function slugSourceForUrl(url: string): string;
export declare function validateTargetInput(input: unknown, taken?: readonly string[]): TargetValidation;
/**
 * 宽松读盘：坏行计入 dropped 后丢掉，**不整份作废**——一条脏数据不该让整张卡片空白
 * （与 docker 的 normalizeConfig 同一口径：能救回来的部分照常可用，丢掉的必须有信号）。
 */
export declare function normalizeConfig(input: unknown): {
    config: LoglensConfig;
    dropped: number;
};
export type ConfigUpdate = {
    ok: true;
    config: LoglensConfig;
} | {
    ok: false;
    error: string;
};
export declare function findTarget(config: LoglensConfig, id: unknown): LoglensTarget | undefined;
export declare function addTarget(config: LoglensConfig, input: unknown): ConfigUpdate;
/** 改一条来源。**id 不可改**：它是浏览器侧唯一的引用方式，改 id 等于换了一条来源。 */
export declare function updateTarget(config: LoglensConfig, id: unknown, patch: unknown): ConfigUpdate;
export declare function removeTarget(config: LoglensConfig, id: unknown): ConfigUpdate;
