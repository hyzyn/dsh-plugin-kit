/**
 * console 消息的**分类**（`docs/devdata-plan.md` §15.2 的 `site_console`）。
 *
 * ## 为什么这一层是必要的，而不是「把 console 里的 error 都列出来」
 *
 * §15.2 说 console 错误是**发布后最常见的前端故障信号**——这句话对，但直接列出全部 error
 * 会把信号淹掉：任何真实站点的 console 里都有常驻噪声（favicon 404、浏览器扩展注入、
 * 第三方埋点被拦截、`ResizeObserver` 的已知告警）。噪声与故障混在一张表里，
 * 结果就是**没人再看这张表**——和第 3.9 节 `unknown` 档要解决的问题是同一类。
 *
 * 所以分类要给的是**措辞以外的证据**：谁报的（来源 URL）、是不是我们自己的资源、
 * 是不是已知噪声形态。三档：
 *
 * | 档位 | 含义 | 该做什么 |
 * |---|---|---|
 * | `error` | 来自**本站资源**的错误 | 发布验活的失败信号 |
 * | `warning` | 来自本站的告警 / 无法判断来源的错 | 记下来，不单独判失败 |
 * | `noise` | 明确的第三方 / 浏览器 / 已知噪声 | 忽略（但**留在报告里**，见下） |
 *
 * **噪声不丢弃**：报告里保留它、并标注为什么算噪声。理由是这条判据本身会被改——
 * 把噪声整个藏掉，等到判据错了（某个真故障被误判成噪声）时就查不出来源了。
 *
 * 依据：`docs/devdata-plan.md` §15.2 / §15.3、`jenkins-release` 技能 §4 的噪声口径。
 */
/** console 消息级别（CDP `Runtime.consoleAPICalled` 的 `type`）。 */
export type ConsoleLevel = 'error' | 'warning' | 'info' | 'log' | 'debug' | 'other';
/** 分类档位。 */
export type ConsoleClass = 'error' | 'warning' | 'noise';
/** 一条 console 消息（从 CDP 事件抽出来后的事实）。 */
export interface ConsoleMessage {
    /** 消息本身的级别。 */
    level: ConsoleLevel;
    /** 拼接后的正文。 */
    text: string;
    /**
     * 来源 URL（CDP 的 `stackTrace.callFrames[0].url` 或 `source`）。
     *
     * **这是分类的主判据**：判断「是不是我们自己的资源」靠它，而不是靠正文措辞——
     * 正文措辞会被业务文案改掉，来源不会。
     */
    sourceUrl?: string;
    /** 页面 URL（用于判断来源是不是同源）。 */
    pageUrl?: string;
    /** 资源加载失败时的 HTTP 状态码。 */
    status?: number;
    /** 时间戳（毫秒）。 */
    at?: number;
}
/** 分类结果。 */
export interface ConsoleFinding {
    message: ConsoleMessage;
    class: ConsoleClass;
    /** 为什么是这个档位（给人看；噪声档尤其要说清）。 */
    reason: string;
    /** 命中的噪声规则名（`noise` 时）。 */
    noiseRule?: string;
}
/**
 * 已知噪声规则。
 *
 * 每条都要能说清「为什么它是噪声」——写不出理由的规则不该在这里，
 * 因为它的代价是把一类真故障静默地划走。
 */
export interface NoiseRule {
    name: string;
    /** 匹配正文。 */
    test: (message: ConsoleMessage) => boolean;
    /** 为什么算噪声。 */
    why: string;
}
/**
 * 内置噪声规则。
 *
 * **刻意保持短**：每加一条都是一次「把某类消息划走」的决定，而划错的代价是真故障被忽略。
 * 只有**确实与本仓前端无关**的几类才进来；业务相关的判断交给「来源是不是本站」这条主判据。
 */
export declare const NOISE_RULES: readonly NoiseRule[];
/**
 * 判断一条消息的来源是否**属于本页**。
 *
 * 口径：
 *   - 没给来源 → `undefined`（未知，不是「同源」也不是「异源」）；
 *   - 有页面 URL 且来源同源 → 本站；
 *   - 有页面 URL 且来源异源 → 不是本站（第三方 CDN / 埋点）；
 *   - 没有页面 URL → 无法判断（只有来源是扩展 / 浏览器内部时才敢说是噪声）。
 */
export declare function sameOrigin(sourceUrl: string | undefined, pageUrl: string | undefined): boolean | undefined;
/**
 * 分类一条 console 消息。
 *
 * 顺序是契约：**先看噪声规则，再看级别与来源**。
 *
 * 为什么不先看级别：`error` 级别里混着大量噪声（favicon、扩展），先按级别筛就会把它们
 * 一律算成故障——而那正是「表里全是噪声、没人看」的成因。
 */
export declare function classifyConsole(message: ConsoleMessage): ConsoleFinding;
/** 把一批消息分类。 */
export declare function classifyConsoleMessages(messages: readonly ConsoleMessage[]): ConsoleFinding[];
/** 一批消息的汇总。 */
export interface ConsoleSummary {
    /** 本站错误（**验活失败信号**）。 */
    errors: ConsoleFinding[];
    warnings: ConsoleFinding[];
    noise: ConsoleFinding[];
    /** 总条数（含噪声——报告里要能看出「一共多少条」）。 */
    total: number;
}
/** 汇总一批分类结果。 */
export declare function summarizeConsole(findings: readonly ConsoleFinding[]): ConsoleSummary;
