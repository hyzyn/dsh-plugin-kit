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
import { type WebAuditEntry, type WebAuditSink, type WebTarget } from './page.js';
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
}
/** 插件配置的 schema。 */
export declare const Config: z;
/** 解析后的站点。 */
interface LiveTarget extends WebTarget {
    scopeDirs: string[];
}
/** 解析后的配置。 */
interface LiveConfig {
    enabled: boolean;
    announceToAgent: boolean;
    targets: LiveTarget[];
    settleMs: number;
    noSandbox: boolean;
    chromePath: string;
    shotDir: string;
    /** 持久审计出口；空串 = 只进宿主日志（不持久）。 */
    auditFile: string;
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
/**
 * 把一次拒绝拼成给 agent 看的一句话。
 *
 * **拒绝码要带出去**：判定层算出来的 `OUT_OF_SCOPE` / `SITE_NOT_ALLOWED` 是这件事唯一的稳定
 * 标识符，而消息正文是给人读的中文（会随文案调整）。从前只抛 `message`，于是码只活在单测和
 * 审计日志里——agent 拿到一段散文，只能靠正则去猜（2026-10-02 端到端发现：两次拒绝里都找不到
 * 任何机器可判的错误码）。
 *
 * 格式是契约：`[CODE] 正文`，恢复路径另起一行。抽成纯函数是为了让这份格式有单测。
 */
export declare function denialMessage(outcome: {
    code: string;
    message: string;
    hint?: string;
}): string;
export declare const name: string, inject: string[] | undefined, apply: (ctx: Context, config?: Config | undefined) => void;
export {};
