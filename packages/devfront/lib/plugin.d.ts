/**
 * `devfront` 的**宿主半体**：把判定层与 CDP 驱动接成 agent 能用的工具（`docs/devdata-plan.md` §15.2）。
 *
 * ## 三层分工（本文件是第三层）
 *
 * | 层 | 文件 | 职责 |
 * |---|---|---|
 * | 判定 | `page.ts` / `console.ts` / `web-verify.ts` | 允不允许、算不算噪声、断言过没过（**纯函数，不连浏览器**） |
 * | 驱动 | `cdp-driver.ts` | 怎么在浏览器里做 |
 * | **宿主** | **本文件** | 注册工具、读配置、写审计、把拒绝转成 agent 能据以行动的话 |
 *
 * 前两层都能在没有宿主、没有浏览器的情况下被测；本层很薄，只做搬运与接线。
 *
 * ## 两条刻意的注册纪律（与 docker 的「默认只读」同口径）
 *
 * 1. **没启用 / 没配站点 → 一个工具都不注册**。未注册的工具 agent 根本看不到，于是它不会去试、
 *    也不会撞墙（§3.6.1 的实现要求：可见的工具才会被尝试）。
 * 2. **作用域是 fail-closed**：`WebTarget.scopeDirs` 为空 = 处处拒绝。这不是保守过头——
 *    前端验活会打到**共享的测试环境**上，而「一份空列表」与「没配过」在语义上无法区分，
 *    两者都不构成授权。所以这里**不替用户填默认目录**：那等于替他授权。
 *
 * ## 拒绝怎么报给 agent
 *
 * 判定层的拒绝（越界 / 异源 / 缺参数）带着 `hint`（恢复路径），这里把它拼进错误消息**抛出去**。
 * 不返回 `{ok:false}` 那种信封：DSH 的工具错误本身就是给模型看的一句话，抛错是最短的路径，
 * 而且不会出现「调用方忘了看 ok 字段」这种沉默失败。
 */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import { type AuditLoggerLike } from '@hyzyn/dsh-kit/audit';
import { type ProtectionLevel } from './credential.js';
import { denialMessage, type WebAuditEntry, type WebAuditSink, type WebTarget } from './page.js';
import { type WebVerifyRunResult } from './web-run.js';
import { type WebStatus } from './web-verify.js';
/**
 * 拒绝话术（`[CODE] 正文`）的实现住在判定层 `page.ts`——跑批执行器也要用同一份格式，
 * 而它不能 import 宿主半体。这里重新导出，是为了让「本包对外的门面」保持原样
 * （`index.ts` 与既有用例都从 `plugin.js` 取它）。
 */
export { denialMessage };
/**
 * 插件配置的**类型**。
 *
 * 与下面的 `const Config`（schemastery schema）同名并存：一个是类型空间的形状，
 * 一个是值空间的校验器，DSH 两个都要（本仓既有写法，见 docker / tty）。
 */
export interface Config {
    enabled?: boolean;
    announceToAgent?: boolean;
    targets?: Array<{
        id?: string;
        label?: string;
        url?: string;
        scopeDirs?: string[];
        allowedOrigins?: string[];
        /** 视口 `"390x844"`；不写 = 浏览器默认。 */
        viewport?: string;
        credentialRef?: string;
    }>;
    /** 每次导航后等多久（毫秒），给首屏渲染留时间。 */
    settleMs?: number;
    /** 关掉 Chrome 沙箱。**只在受限环境开**（见 kit 的 `ChromeLaunchOptions.noSandbox`）。 */
    noSandbox?: boolean;
    chromePath?: string;
    shotDir?: string;
    /** 持久审计出口（JSON 行）；省略 / 空串 = 只进宿主日志（不持久）。 */
    auditFile?: string;
    /** 站点声明随项目走的宿主开关（空 = 关闭，见 zod schema 上那段注释）。 */
    projectSitesFile?: string;
}
/** 插件配置的 schema。 */
export declare const Config: z;
/** 解析后的站点。 */
interface LiveTarget extends WebTarget {
    scopeDirs: string[];
}
/** 解析后的配置（导出是为了让 `configSnapshotFrom` 能出现在 `.d.ts` 里）。 */
export interface LiveConfig {
    enabled: boolean;
    announceToAgent: boolean;
    targets: LiveTarget[];
    settleMs: number;
    noSandbox: boolean;
    chromePath: string;
    shotDir: string;
    /** 持久审计出口；空串 = 只进宿主日志（不持久）。 */
    auditFile: string;
    projectSitesFile: string;
}
/**
 * 把原始配置解析成纯数据。
 *
 * 空 `scopeDirs` **保留为空**而不是补一个默认值：作用域的判据是「空 = 处处拒绝」，
 * 在这里替用户填上一个默认目录等于**替他授权**——那正是这套东西要防的事。
 */
/**
 * 解析站点视口 `"390x844"`（`x` / `X` / `×` 都收）。
 *
 * 为什么**不做默认值、也不「修一修就对」**：这是**验活的窗口尺寸**——猜出来的尺寸会让一次
 * 验活在一个没人选过的窗口里通过或失败，那比完全不设视口更坏。所以只接受
 * 「两到四位数 + 分隔符 + 两到四位数」，其余一律当作**没写**（= 浏览器默认）。
 * 个位数那一档（`5x5`）也拒：那不是窗口尺寸，是打错。
 */
export declare function parseViewport(value: unknown): {
    width: number;
    height: number;
} | undefined;
export declare function normalizeConfig(section: Record<string, unknown>): LiveConfig;
/**
 * 日志出口的一句话（**含被拒的尝试**——那才是「agent 试过什么」的证据）。
 *
 * 话术留在本包：它带站点的 `subject`（URL 或选择器），而 `/audit` 里那句通用文案不知道这些。
 * 路由（允许 → `info`、拒绝 → `warn`）由 `kit` 统一。
 */
export declare function webAuditText(entry: WebAuditEntry): string;
/**
 * 建审计出口：配了 `auditFile` 走**持久**出口，否则只进宿主日志。
 *
 * 2026-10-03 起改用 `@hyzyn/dsh-kit/audit`（与 `devdata` / `devenv` 同一份实现）：
 * 一条 JSON 行 / 调用、**含被拒绝的尝试**、写不进去 = 抛（fail-closed）。日志话术留在本包
 * （`webAuditText`），因为它带站点与 subject，是给人看的。
 *
 * 抽成导出函数是为了**可测**：宿主半体那一层在本包没有假宿主夹具，而这条判据（「配了就落盘、
 * 没配就进日志」）不该只靠真机验收。
 */
export declare function webAuditSink(options: {
    auditFile: string;
    logger: AuditLoggerLike;
}): WebAuditSink;
/** 给 agent 的能力公告（只在 `announceToAgent` 打开时注入）。 */
export declare const DEVFONT_GUIDANCE: string;
/** `site_text` 的截断上限。 */
export declare const SITE_TEXT_MAX = 4000;
/**
 * 把驱动拿到的正文包成 `site_text` 的输出契约。
 *
 * 单独抽出来是为了让这份契约**有单测**：它是工具声明的一部分，而声明与实际不符时 DSH 会在
 * 运行时把整次调用判成 `invalid output`——那种失败在浏览器那侧看起来是「什么都没发生」。
 */
export declare function textOutput(raw: unknown): {
    text: string;
    truncated: boolean;
    length: number;
};
/** `site_console` 输出契约的具体类型。 */
export interface ConsoleOutput {
    errorCount: number;
    warningCount: number;
    noiseCount: number;
    total: number;
    errors: string[];
    warnings: string[];
    /** 噪声**按规则**拆开（如 `favicon-404 ×1`）——被排除的东西必须可核对。 */
    noiseRules: string[];
}
/**
 * 把驱动/分类层的结果包成 `site_console` 的输出契约。
 *
 * 与 `textOutput` 同理抽出来：**这份契约是工具声明的一部分，必须有单测**（见
 * `test/tool-contract.test.ts`）。告警的**正文**必须给出去——只给计数等于「记下来了但不让人看」。
 */
export declare function consoleOutput(raw: unknown): ConsoleOutput;
/** `site_fill` 的输出契约（与 `textOutput` / `consoleOutput` 同理：契约必须有单测）。 */
export interface FillOutput {
    selector: string;
    /** 用了凭据引用时才有：**引用名**（不是值——值从不进输出）。 */
    credentialRef?: string;
    /** 该引用的保护强度（`none` / `weak` / `strong` / `unknown`）。 */
    protection?: ProtectionLevel;
    /** 一句话说清它到底防不防（plan §3.7-1：不许把「方便」说成「防护」）。 */
    protectionNote?: string;
}
/**
 * `site_fill` 的渲染。
 *
 * 用引用时**必须把两件事说出来**：这是引用（不是值），以及这道防线有多硬。只说「已配置」等于
 * 对外宣称了一个不成立的性质——而 agent 会据此判断「这个口令是安全的」。
 */
export declare function fillRenderText(value: unknown): string;
/** `site_verify` 输出契约里的一条断言。 */
export interface VerifyLine {
    id: string;
    url: string;
    status: WebStatus;
    severity: 'fail' | 'warn';
    message: string;
    /** 证据行（期望 vs 实际）——失败与「验不了」都必须能看见依据。 */
    evidence: string[];
}
/** `site_verify` 的输出契约。 */
export interface VerifyOutput {
    project: string;
    target: string;
    overall: 'pass' | 'fail' | 'warn' | 'unknown';
    total: number;
    passed: number;
    failed: number;
    warned: number;
    unknown: number;
    /** 清单里声明、这次真的去打开的页面数。 */
    pages: number;
    /** 真的观察到结果的页面数（`pages` 里打不开 / 观察失败的那些不算）。 */
    pagesObserved: number;
    lines: VerifyLine[];
    /** 页级问题：打不开 / 观察失败（**没验成**，与「验出问题」分列）。 */
    problems: string[];
}
/**
 * 把一次跑批结果收敛成工具的输出契约（**纯函数**，与 `textOutput` / `consoleOutput` 同理：
 * 声明与实际不符时 DSH 会把整次调用判成 `invalid output`，所以这份契约也要有单测）。
 */
export declare function verifyOutput(result: WebVerifyRunResult): VerifyOutput;
/**
 * `site_verify` 的渲染：一屏读完「哪几条过了、哪几条没过、凭什么、哪几页压根没验成」。
 *
 * 证据要**逐条列出来**：只报「失败 2 条」等于把复核的活又推回给 agent，而它下一步只能重跑一次。
 */
export declare function verifyRenderText(value: unknown): string;
/**
 * 配置卡片（客户端半体）能改的**标量**字段。
 *
 * `targets`（站点列表）不在这一列里——它有自己那条路（`normalizeTargets` + 逐次确认），
 * 因为它是「这个站点、这个范围、这个源」的**声明**，与就绪清单、验活断言同一类东西。
 * **回答「这个表单凭什么评审」**（2026-10-03 定的口径，四条一起才成立）：
 *
 *   1. **结构化表单**：每行站点按字段填（id / url / 范围 / 允许源 / 视口 / 凭据引用），不是 YAML 自由文本；
 *   2. **服务端同一套判据**：`normalizeTargets` 严格校验（**不静默丢弃**），并要求 `normalizeConfig`
 *      把校验过的行**原样**收下（两套规则一旦分叉就在保存时报错，而不是悄悄少一个站点）；
 *   3. **逐次确认**：保存站点必须带 `confirmSiteEdit: true`——它是会影响「工具能在哪些站点上动手」的
 *      变更，与 `env_down` 同一档；
 *   4. **每次变更进审计**（含被拒的尝试）：`auditFile` 配了就是持久 JSON 行，没配就是宿主日志。
 *
 * 更彻底的那条路（站点声明**随项目走**，像 `verify/` / `ready/` 那样进项目仓库评审）是**下一件**，
 * 记在 ROADMAP 待办 6b。
 */
export declare const CARD_FIELDS: readonly ["enabled", "announceToAgent", "settleMs", "noSandbox", "chromePath", "shotDir", "auditFile"];
/**
 * 站点列表的**严格**校验（卡片保存路径专用）。
 *
 * 为什么不能直接拿 `normalizeConfig` 的结果：它对缺 id / 缺 url 的行是**静默跳过**
 * （那是给「配置里本来就写坏了一行」的容错），而保存路径上静默跳过 = 用户以为存了 3 个、实际只有 2 个。
 * 这里逐行逐字段报错、**指到 `targets[i].字段`**，并在最后用 `normalizeConfig` 复核「校验过的行
 * 一行不少地被收下」——两套规则分叉时在这里就红。
 */
export declare function normalizeTargets(input: unknown): {
    targets: Record<string, unknown>[];
} | {
    error: string;
};
/**
 * 把卡片提交上来的 patch 收敛成「能写进 settings entry 的那几个字段」。
 *
 * **纯函数**，所以这条判据有单测（宿主半体那一层没有假宿主夹具，抽出来才能断言）。
 * 三条规矩：
 *   - 不认识的字段 → 报错（**不静默丢弃**：卡片与宿主版本不一致时，静默丢弃会让用户以为保存成功）；
 *   - `targets` → 报错并说清它该去哪儿改（见 `CARD_FIELDS` 的注释）；
 *   - 类型/范围先判、再写：非法值**不许**先落地再抛（docker 踩过：非法值写进 settings.yaml 之后
 *     整段配置在下次启动时静默退回默认）。
 */
export declare function normalizeCardPatch(input: Record<string, unknown>): {
    patch: Record<string, unknown>;
    code?: string;
} | {
    error: string;
    code?: string;
};
/**
 * 卡片的 GET 快照（**纯函数**：把 `live` 投影成客户端要的形状）。
 *
 * 站点**全量只读展示**（含 `scopeDirs` / `allowedOrigins` / `viewport`）：卡片不改它们，但要把
 * 「这台机器上现在配了哪些站点、各自的范围是什么」摆出来——这正是记-15 那个缺口的一半。
 * `credentialRef` 是**引用**不是口令（值在凭据服务里），所以可以照原样给卡片。
 */
export declare function configSnapshotFrom(live: LiveConfig): Record<string, unknown>;
export declare const name: string, inject: string[] | undefined, apply: (ctx: Context, config?: Config | undefined) => void;
