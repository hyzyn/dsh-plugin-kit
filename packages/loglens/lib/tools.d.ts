import type { TierClass } from '@hyzyn/dsh-kit';
import type { LogBackend, LogLine } from './backends/types.js';
import type { LoglensConfig, SourceKind } from './config.js';
export { adapterHint, describeTarget, hintFor, resolveTarget } from './execute.js';
export { backendFor } from './backends/registry.js';
/** 分类表：四个工具全是只读（查日志不改任何东西，也不在目标机上执行命令）。 */
export declare const LOGLENS_TIER_CLASS: Record<string, TierClass>;
/** 档位闸只认这些前缀（名单外一个都不碰）。 */
export declare const LOGLENS_TIER_PREFIXES: readonly string[];
export interface ToolDeps {
    /** 当前生效的配置（宿主侧那一份，volatile 更新后跟着变）。 */
    config: () => LoglensConfig;
    backendFor: (kind: SourceKind) => LogBackend | undefined;
    /** Docker 容器面板装没装（判据见 src/execute.ts 的 hintFor 与 index.ts 的接线）。 */
    dockerLoaded?: () => boolean;
    /** 注册漏斗：与 docker 的 add 同款（单个工具注册失败不该把一整批带下去）。 */
    add: (name: string, definition: unknown) => void;
}
/**
 * 时间戳的渲染形态：**本地时间 + 显式偏移**，如 `2026-10-18T22:01:43.123+08:00`（真机反馈第 5 条）。
 *
 * 为什么不直接用 `toISOString()`：那是 **UTC**，而日志正文里的时间几乎都是**本地时间**——同一行里于是
 * 出现两套时间（行首 UTC、正文本地），换算 epoch 时必然出错，问「这条是几点」也要在脑子里加 8 小时。
 * 带上偏移之后这个字符串**自己就说明**了是哪个时区：`Date.parse()` 能原样解析回同一个瞬间
 * （所以它仍是机器可用的），而人眼看到的时刻与正文里的时刻一致。
 *
 * 时区取**宿主进程的本地时区**（`getTimezoneOffset()`）：工具跑在宿主里，与用户的机器通常是同一台；
 * 远端宿主的情形由偏移显式标注，不会含糊成「不知道哪个时区」。
 *
 * **已知边界（复核 F3/F4，2026-10-19 如实记下）**：
 * - 偏移只有**分钟**粒度（`getTimezoneOffset()` 如此）。1970 年前某些地区用秒级 LMT（如 Monrovia 的
 *   `-00:44:30`），这里会写成 `-00:44`，`Date.parse()` 回来差几十秒。现代日志不受影响（复核实测
 *   1976–2035 全时区逐年 0 坏）。
 * - 年份超出 `0000–9999` 时（只可能是把 µs / ns 当成 ms 用），四位补零写不出 ISO 8601 的扩展年份
 *   （那要带符号），`Date.parse` 会得到 `NaN`。这类输入直接回退到 `toISOString()`——它写得对，
 *   而**不可解析的字符串比不好读的字符串更坏**。
 *
 * 非法时间（`NaN`）不渲染成 `Invalid Date`——那不是一句人话，也解析不回去。
 */
export declare function formatTimestamp(ts: number): string;
/**
 * 正文的渲染：多行（堆栈）**保留层次**，续行加一个前缀（真机反馈第 6 条）。
 *
 * 为什么：采集侧把 `log.flags=multiline` 的一整段堆栈存成**一个文档**，它的 `message` 里本来就带换行。
 * 原样吐出去时它是一条「行内嵌换行」的扁平文本——读者分不清哪一行是新的日志、哪一行是堆栈的续行。
 * 续行加 `    | ` 前缀之后，层次回来了，而正文一个字都没改（前缀在行首，不在内容里）。
 *
 * **超过 {@link MESSAGE_MAX_LINES} 行就截断并报出还有多少行**：一整段异常链能上百行，全铺开会把
 * 后面的日志行挤出视野，而「悄悄少显示几行」比截断更坏（与 `raw` 的 2 万字符预览同一口径）。
 */
export declare function renderMessage(message: string): string;
/**
 * 一行的可读形式：时间用 ISO（人看日志时以本地时间为准，ISO UTC 至少不含糊）+ 级别 + **id** + 正文 + 标签。
 *
 * 级别带个问号（`error?`）= 它是**从正文推断**的（文档里没有级别字段）：agent 据此决定
 * 「这条我能当级别用吗」。标签按 host / container 这类**谁写的**排在前面（src/line.ts 的优先键），
 * 只平铺前几条身份键、其余折叠成计数（见 {@link renderLabels}）。
 *
 * 为什么把 id 也渲染出来（loglens D06）：`loglens_context` 的**精确**锚点是 id，而 id 只在返回值里、
 * 不在渲染文本里——人眼/模型从渲染文本里复盘一条行时，唯一能拿到的定位物就是它，没有它就只能拿
 * 正文片段去猜，而正文在来源侧常被加了前缀后缀（真机那条是 `[ERROR] [时间] T:[] 1 … Application run failed`）。
 *
 * 形态取舍：**正文之后**追加一个 `#id`，正文因此一个字都不动（前缀形态会把每条日志的正文推后，
 * 而正文才是要用眼睛扫的东西）；`#` 让 id 自证身份，不会被当成日志正文的一部分。
 * 这个 token 是**回抄格式**：`loglens_context` 的 id 参数会剥掉一个前导 `#`，原样抄回去就能用。
 * 代价是每行多 `2 + id 长度` 个字符——id 本身很短（ES 侧是文档 `_id`，Loki 侧是 `ts:内容序`），
 * 且只在**渲染文本**里加，工具返回值与面板用的是结构化字段，不受这层影响。
 */
export declare function formatLine(line: LogLine): string;
export declare function renderLines(lines: readonly LogLine[], markId?: string): string;
/** `loglens_fields` 的渲染输入（从工具返回值里取用的那一小撮）。 */
export interface FieldsView {
    fields?: Array<{
        name: string;
        kind: string;
        preferred?: boolean;
        conflict?: boolean;
        esTypes?: string[];
    }>;
    total?: number;
    truncated?: boolean;
    warnings?: string[];
}
/**
 * `loglens_fields` 的渲染文本（导出是为了能直接测：冲突标记这种东西不该只靠人肉看）。
 *
 * 两件事必须出现在文本里：
 * ① 一共多少个 / 是不是被截断（截断只在显式 limit 时才会发生）；
 * ② **每个类型冲突的字段逐个标出来**——同名在不同索引里类型不一致，拿它分组只会覆盖一部分索引，
 *    而候选里它的名字跟别人长得一模一样，不标就等于没说。
 */
export declare function renderFields(result: FieldsView): string;
/**
 * 契约键集：`LogLine` 的**每一个**键各占一项。
 *
 * **为什么必须放在 `src/` 里**（loglens D05 收口 F7）：`Record<keyof LogLine, true>` 只有在
 * **被 tsc 编到**的时候，才能在「契约加了字段、这里没跟」时报错；而全仓**没有任何 tsconfig 收
 * `test/`**（本包 include 只有 `"src"`，`pnpm typecheck` = `pnpm -r typecheck` = 各包 `tsc --noEmit`）。
 * 所以这半守卫放 `test/` 里等于挂在一条**没人执行的闸门**上——实测过：给 `LogLine` 加字段后
 * 包 typecheck exit 0、对账用例全绿，而运行期照样炸 `is not a declared property`（D05 原症状）。
 *
 * 分工（别把对账挪回 test/）：
 *   - **本常量管「契约加了字段」**——编译期，`LogLine` 加键而这里没跟就报 missing property；
 *   - test/tools.test.ts 的运行期对账管「`LINE_SCHEMA` 与这份键集逐字一致」——钉住另一半。
 * 两半合起来才覆盖 `LogLine` →（人）→ `LINE_SCHEMA` 这条链。
 */
export declare const LINE_CONTRACT_KEYS: Record<keyof LogLine, true>;
/**
 * 一行的输出 schema：与契约的 LogLine 同形（工具返回值与 render 都按它）。
 *
 * **导出给用例**：test/tools.test.ts 拿它跟 {@link LINE_CONTRACT_KEYS} 的键集对账——契约加了字段而
 * 这里忘了跟，就是「行模型有、输出 schema 没有」的漂移，而它的表现是**运行时**才炸
 * （`"value.lines[0].x" is not a declared property`，宿主在返回值校验那一关拦下整个工具）。
 * 对账让这种漂移在测试期就变红，而不是等真机查询撞上（loglens D05）。
 */
export declare const LINE_SCHEMA: {
    readonly type: "object";
    readonly additionalProperties: false;
    readonly properties: {
        readonly ts: {
            readonly type: "number";
            readonly required: true;
        };
        readonly message: {
            readonly type: "string";
            readonly required: true;
        };
        readonly level: {
            readonly type: "string";
            readonly description: "归一化级别（trace / debug / info / warn / error / fatal）";
        };
        readonly levelInferred: {
            readonly type: "boolean";
            readonly description: "true = 级别是从正文推断的（文档里没有级别字段），不是来源自己标的";
        };
        readonly highlights: {
            readonly type: "array";
            readonly description: "message 里命中查询串的字符区间 [start, end)，按 start 升序、互不重叠；只有后端明确报了高亮（ES 的 highlight）才带";
            readonly items: {
                readonly type: "array";
                readonly items: {
                    readonly type: "number";
                };
            };
        };
        readonly source: {
            readonly type: "string";
            readonly required: true;
        };
        readonly id: {
            readonly type: "string";
            readonly required: true;
        };
        readonly labels: {
            readonly type: "object";
            readonly additionalProperties: true;
            readonly properties: {};
        };
        readonly raw: {
            readonly type: "string";
            readonly required: true;
        };
    };
};
export declare function registerLoglensTools(deps: ToolDeps): void;
export declare function clampCount(value: unknown, fallback: number): number;
/**
 * `loglens_context` 的锚点匹配档位，数字越小越可信（顺序就是优先级）。
 *
 * `idStripped` 单独占一档而不是并进 `id`：它是「剥掉一个前导 `#` 的变体」，只在**原值没命中**时
 * 才轮得到（收口 H1）。两者都是精确坐标档、都不发 warnings，但**原值必须优先**——否则真以 `#`
 * 开头的 id 会被剥过的变体压掉，坐标就被改写了（H1 那个回退正是这么来的）。
 */
declare const ANCHOR_TIERS: readonly ["id", "idStripped", "exact", "normalized", "substring", "ts"];
export type AnchorTier = typeof ANCHOR_TIERS[number];
/**
 * 找锚点行：**一次遍历**，逐档降级，取命中的最高档；同档取离 anchorTs 最近的。
 *
 * 三条规则必须写下来，否则「宽松匹配」会不声不响地挑错行（loglens D06）：
 *
 * 1. **逐档降级，ts 永远兜底**：id 原值 → id 的剥 `#` 变体 → 正文严格相等 → 规范化空白后相等
 *    → 规范化空白后**单向包含** → `line.ts === anchorTs`。**ts 档不受「有没有给 message」影响**——
 *    给了一个匹配不上的正文，也仍然退回到时间戳那一档，而不是报「锚点行没在这次重查里返回」
 *    （行明明就在返回值里，那是假话）。这一档正是旧实现 `lines.findIndex(line => line.ts === anchorTs)`
 *    的无条件兜底，收口 F2 时恢复。
 * 2. **包含档两边都规范化**（`normalizeWhitespace(line.message).includes(needle)`）：needle 是调用方
 *    从 `formatLine` 的渲染文本里抄的，抄出尾随空格 / 行内双空格 / 首尾空白是常态，而它们规范化后
 *    都是子串。只对整条相等做规范化、包含档还用原始串，等于只修好一半（收口 F1）。
 *    **不做反向包含**（`needle.includes(line.message)`）：那会让一条短行（如 `error`）匹配掉整段长正文，
 *    等于「随便找一行」——语义危险。
 * 3. **同档多候选有确定的挑法**：先比 `|line.ts - anchorTs|`（小的赢），并列再比 id、message 的字典序
 *    （小的赢，但**空 id 排最后**——优先挑「有坐标」的那一行），最后才比 ts。为什么非要一个
 *    **与数组顺序无关**的次级键：正文片段这类匹配天生不唯一（`Connection refused` 一小时内能出现
 *    几十次），而来源的返回次序会随查询窗口变化（`loglens_search` 有 direction，context 的重查恒
 *    backward）——只按「谁在前」挑，等于让调用方读到的那一行与这里挑中的那一行**可以不是同一行**，
 *    且全程无声（收口 F5）。
 *
 * 档位是**启发式**，所以调用方必须能看见它挑中了哪一档——`findAnchor` 把 kind 返回出去，
 * 由 `loglens_context` 转成 warnings（收口 F4）。
 */
export declare function findAnchor(lines: readonly LogLine[], wanted: {
    anchorTs: number;
    wantedId?: string;
    wantedIdStripped?: string;
    wantedMessage?: string;
}): {
    index: number;
    kind: AnchorTier;
    ties: number;
} | undefined;
