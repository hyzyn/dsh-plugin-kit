/**
 * 前端验活断言（`docs/devdata-plan.md` §15.3 的「与 §3.9 同构」）。
 *
 * ## 为什么前端也要断言化，而不是让 agent 每次现编操作序列
 *
 * §15.3 把这条列为边界之一：agent 现编的序列**不可积累、不可复审**——
 * 这次验过了，下次换个人（或换个 agent）又从头编一遍，而且没人能review「它到底验了什么」。
 * 断言写进项目仓库之后，它随项目一起评审、一起演进。
 *
 * ## 与数据面断言库（§3.9）的关系：同构，但**判据不同**
 *
 * 同构的部分：项目内文本清单 + DSH 侧只读 + 缺省即无（fail-closed）+ 三态。
 *
 * 判据不同的部分，也是这个模块独立存在的理由：
 *
 * | | 数据面（§3.9） | 前端（本模块） |
 * |---|---|---|
 * | 观察对象 | 结果集（一列标量） | **页面**（文本 / DOM / console） |
 * | 典型判据 | `eq` / `gte` / `regex` / `rowCount` | 文本包含 / 元素存在 / 元素文本 |
 * | 特有的一档 | — | **console 无错**（发布后最常见的前端故障信号） |
 *
 * 所以预期算子不复用：把 `gte` / `rowCount` 搬到 DOM 上没有意义，而 `toContain` 搬到结果集上
 * 又要先决定「比第几列」，那是数据面已经解决过的问题。
 *
 * ## 一处**刻意不合并**的判断（写出来，免得下次有人顺手合并）
 *
 * 就绪判据（`devenv` 的 `env-ready.ts`，2026-10-02 从 `devdata` 迁出）与前端断言看着都能挂在「一个服务的页面」上，
 * 于是很容易想合并成一份清单。但两者的**时机与判据都不同**：
 *   - 就绪是**等待期**的判据（服务起来了吗），要 `unready` 这一档；
 *   - 断言是**验证期**的判据（起来之后页面对吗），不需要等待语义。
 * 合并会让「等就绪」与「验效果」用同一套码，于是「页面还没渲染完」会被报成「验证失败」——
 * 而那正是 §15.1 说的假阴性来源。
 *
 * 依据：`docs/devdata-plan.md` §15.1 / §15.2 / §15.3。
 */
import { type ConsoleMessage } from './console.js';
/** 预期算子。与数据面断言库**刻意不同**（见文件头那张表）。 */
export declare const WEB_EXPECT_OPERATORS: readonly ["toContain", "elementExists", "elementText", "consoleClean"];
/** 预期算子名。 */
export type WebExpectOperator = (typeof WEB_EXPECT_OPERATORS)[number];
/** 一条前端断言的预期。多个算子同时给出时是**合取**（AND）。 */
export interface WebExpect {
    /** 页面文本包含它（断言页面**真的渲染出了内容**）。 */
    toContain?: string;
    /** 存在匹配该 CSS 选择器的元素。 */
    elementExists?: string;
    /** 匹配该选择器的元素的文本。 */
    elementText?: {
        selector: string;
        toContain?: string;
        equals?: string;
    };
    /**
     * console 里**没有本站错误**（`console.ts` 的 `error` 档）。
     *
     * 注意是「本站错误」而不是「没有任何 error」：真实站点的 console 里常驻噪声，
     * 按「一条 error 都不许有」判会让这一档永远红——那就是噪声淹掉信号。
     */
    consoleClean?: boolean;
}
/** 一条前端断言。 */
export interface WebAssertion {
    id: string;
    /** 项目名（由文件名推出，清单里写第二遍必须与它一致）。 */
    project: string;
    /** 要验的页面 URL（必须落在目标声明的站点范围内——范围判据在 `page.ts`）。 */
    url: string;
    /** 目标 `WebTarget.id`。 */
    target: string;
    expect: WebExpect;
    severity: 'fail' | 'warn';
    /** 现有噪声说明（照 `jenkins-release` 技能 §4 的口径）。 */
    note?: string;
}
/** 一份前端验活清单。 */
export interface WebManifest {
    version: number;
    project: string;
    assertions: readonly WebAssertion[];
}
/** 加载结果。三种「读不到」分开——与数据面断言库同构。 */
export type WebManifestLoad = {
    kind: 'no-manifest';
    project: string;
} | {
    kind: 'unreadable';
    project: string;
    message: string;
} | {
    kind: 'config-error';
    project: string;
    errors: readonly WebConfigError[];
} | {
    kind: 'ok';
    manifest: WebManifest;
};
/** 一条配置错误。 */
export interface WebConfigError {
    path: string;
    message: string;
}
/**
 * 校验一份已解析的前端清单。
 *
 * **一次报全部错误**（清单是给人改的）。与数据面断言库同样，判据在**加载时**抓：
 * 一条写错选择器的断言留到运行时，会表现为「元素不存在」——那看起来像**站点的问题**。
 */
export declare function validateWebManifest(project: string, data: unknown): {
    ok: true;
    manifest: WebManifest;
} | {
    ok: false;
    errors: WebConfigError[];
};
/**
 * 清单的文件名（唯一一处）：`<project>.yaml`。
 *
 * 必须与 `webManifestsIn` 的筛选口径**逐字一致**。两处不一致时 `loadWebManifest` 永远找不到
 * `webManifestsIn` 报出来的那份文件，表现为「明明有清单却报无断言」——
 * 而那正好命中「缺省即无」这条 fail-closed 判据的**假阴性**（看起来像设计使然，实际是 bug）。
 */
export declare function webManifestFileName(project: string): string;
/** 清单在项目里的相对路径：`web/<project>.yaml`。 */
export declare function webManifestRelativePath(project: string): string;
/** 从一批已列好的文件名里挑出前端清单（不读目录——保持可测）。实现在 `@hyzyn/dsh-kit/manifest`。 */
export declare function webManifestsIn(files: readonly string[]): Map<string, string>;
/** 加载选项。 */
export interface LoadWebManifestOptions {
    /** 找清单的根目录（按顺序找；多个根下都有会报歧义）。 */
    roots?: readonly string[];
}
/**
 * 从项目里读一份前端清单（**只读**）。
 *
 * YAML 用 `JSON_SCHEMA`：清单是配置数据，不是能求值的表达式（与数据面断言库同一口径）。
 */
export declare function loadWebManifest(project: string, options?: LoadWebManifestOptions): WebManifestLoad;
/** 断言求值的状态。 */
export type WebStatus = 'pass' | 'fail' | 'unknown';
/** got / expected 并排的一行。 */
export interface WebDiffLine {
    op: string;
    expected: unknown;
    got: unknown;
    verdict: WebStatus;
    note?: string;
}
/** 一条断言的求值结果。 */
export interface WebAssertionResult {
    id: string;
    url: string;
    status: WebStatus;
    severity: 'fail' | 'warn';
    message: string;
    diff: WebDiffLine[];
}
/**
 * 一次页面的**观察**（由驱动取好）。
 *
 * 只放事实：文本、元素、console 消息。「对不对」是 `evaluateWebAssertion` 的事。
 */
export interface PageObservation {
    url: string;
    /** 页面文本（去标签后的可见文本）。 */
    text?: string;
    /** 选择器 → 命中数量 与 首个命中的文本。 */
    elements?: Readonly<Record<string, {
        count: number;
        text?: string;
    }>>;
    /** console 原始消息（分类由 `console.ts` 做）。 */
    console?: readonly ConsoleMessage[];
}
/** 求一条断言。 */
export declare function evaluateWebAssertion(input: {
    assertion: WebAssertion;
    observation: PageObservation;
}): WebAssertionResult;
/** 一批断言的汇总。 */
export interface WebAssertionSummary {
    total: number;
    passed: number;
    failed: number;
    warned: number;
    unknown: number;
    overall: 'pass' | 'fail' | 'warn' | 'unknown';
}
/** 汇总一批前端断言结果（口径与数据面断言库一致）。 */
export declare function summarizeWebResults(results: readonly WebAssertionResult[]): WebAssertionSummary;
/**
 * 一份断言需要页面提供哪些选择器的观察结果。
 *
 * 给驱动用：它照着这份清单一次把该取的都取回来（**一次拿全**，不是 N 轮对话——
 * 与数据面断言库的第 3 条约束同源）。
 */
export declare function selectorsNeeded(assertions: readonly WebAssertion[]): string[];
