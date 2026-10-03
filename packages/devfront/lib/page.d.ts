/**
 * 前端验证的**工具面**（`docs/devdata-plan.md` §15.2）与**边界**（§15.3）。
 *
 * ## 这一层为什么存在，而不是「让 agent 直接开个浏览器」
 *
 * §15.3 的边界是硬要求：**它是「验证」工具，不是「自动化」工具**——不做定时任务、
 * 不做爬虫、不做批量操作。边界不能靠「叫 agent 别那么干」来守（那是一条没有守卫的规矩），
 * 得靠**工具面里根本没有那些动作**。所以这里的动作是一份**白名单**：
 * 未登记的动作一律拒，与数据面（`operations.ts`）同一条口径。
 *
 * ## 三个判据，顺序是契约
 *
 * 1. **动作在不在白名单里**（未登记一律拒）；
 * 2. **当前目录在不在目标的 `scopeDirs` 内**——空 = 处处拒绝（fail closed）。
 *    这条与数据面共用 `scope.ts`：前端验证同样会打到**共享的测试环境**上；
 * 3. **目标站点对不对**：`site_open` 只能打开目标**声明过的站点**。
 *    这条是本层特有的：数据面的目标是一个连接串，而这里的目标是一个**站点**——
 *    给一个 URL 就能打开，是最容易被顺手扩成爬虫的入口。所以站点必须在 `WebTarget` 里声明，
 *    且只允许同源 + 声明路径前缀之内。
 *
 * ## 与 §15.2 工具面的对应
 *
 * | 计划里的工具 | 本层的动作 | 驱动方法 |
 * |---|---|---|
 * | `site_open` | `open` | `driver.open` |
 * | `site_shot` | `shot` | `driver.screenshot` |
 * | `site_click` / `site_fill` | `click` / `fill` | `driver.click` / `driver.fill` |
 * | `site_console` | `console` | `driver.console` |
 * | `site_text` | `text` | `driver.text` |
 *
 * 依据：`docs/devdata-plan.md` §15.2 / §15.3 / §5（审计面）、`jenkins-release` 技能 §3.2。
 */
import { classifyConsoleMessages, type ConsoleMessage, type ConsoleSummary } from './console.js';
/** 动作名。**这份清单就是白名单**——不在其中的一律拒。 */
export declare const WEB_ACTIONS: readonly ["open", "shot", "click", "fill", "text", "console"];
/** 动作名类型。 */
export type WebAction = (typeof WEB_ACTIONS)[number];
/**
 * 一个可验证的站点。
 *
 * `url` 是**必须声明**的：前端验证的入口是「打开一个 URL」，而给一个 URL 就能打开，
 * 是最容易被顺手扩成爬虫的地方。声明之后，`open` 只能落在它的同源 + 路径前缀之内。
 */
export interface WebTarget {
    /** 稳定 id。 */
    id: string;
    label: string;
    /** 站点根 URL（如 `https://cdqas.example.com/`）。 */
    url: string;
    /**
     * 允许访问的目录；**空 / 缺失 = 处处拒绝**。
     *
     * 与数据面共用 `scope.ts` 的语义：前端验活同样会打到共享的测试环境上。
     */
    scopeDirs?: readonly string[];
    /**
     * **允许动手的额外源**（缺省 / 空 = 只能在声明源上动手）。
     *
     * 为什么需要它：登录 / SSO 会把页面跳到另一个源（IdP），而**填账号密码就是在那个源上动手**。
     * 于是「动作只允许在声明源上做」会把登录流程整条掐掉。代价不能由规则偷偷承担，
     * 得由人显式声明——写下一个源就是一次值得看一眼的决定。
     *
     * 只影响**动作**（`click` / `fill`）；读（`text` / `shot` / `console`）不受它约束，
     * 因为跳转后**读**是登录流程的必要部分（见 `MUTATING_WEB_ACTIONS`）。
     */
    allowedOrigins?: readonly string[];
    /**
     * 视口尺寸（**按站点**，2026-10-02 加）。
     *
     * 为什么按站点而不是全局：同一个仓里既有**移动端 H5**（`hcckc-h5` / `bpaimsm-v4` /
     * `bpaossm-v3.1`）又有桌面后台，而「验活」要看的正是**用户实际会看到的那个尺寸**——
     * 在桌面视口下看移动 H5，看到的不是手机上的样子，移动端专属的布局问题会漏掉。
     * 缺省（不写）= 浏览器默认视口。
     *
     * **只改视口尺寸**：不模拟移动设备（touch / DPR / UA 都不变），见 ROADMAP 记-17。
     */
    viewport?: {
        width: number;
        height: number;
    };
    /** 登录凭据引用（`env:NAME` 一类）。**永不存明文**，与数据面同口径。 */
    credentialRef?: string;
}
/** 一次动作请求。 */
export interface WebActionRequest {
    target: WebTarget;
    action: WebAction;
    cwd: string;
    /** `open` 的 URL / `click` 的选择器 / `fill` 的选择器与值 / `shot` 的输出路径。 */
    url?: string;
    selector?: string;
    value?: string;
    /** `shot` 的输出文件（不给则由驱动决定临时路径）。 */
    path?: string;
}
/** 判定结果。 */
export type WebDecision = {
    allowed: true;
    action: WebAction;
    url?: string;
} | {
    allowed: false;
    action: WebAction;
    code: WebRejectionCode;
    message: string;
    hint?: string;
};
/** 拒绝码。 */
export declare const WEB_REJECTION_CODES: {
    /** 动作不在白名单里（未登记一律拒）。 */
    readonly UNKNOWN_ACTION: "UNKNOWN_ACTION";
    /** 当前目录不在目标的允许目录内（空 = 处处拒绝）。 */
    readonly OUT_OF_SCOPE: "OUT_OF_SCOPE";
    /** 目标没声明站点 URL。 */
    readonly SITE_NOT_DECLARED: "SITE_NOT_DECLARED";
    /** 要打开的 URL 不在目标声明的站点范围内（异源 / 越出路径前缀）。 */
    readonly SITE_NOT_ALLOWED: "SITE_NOT_ALLOWED";
    /** 参数缺失（如 `click` 没给选择器）。 */
    readonly ARGUMENT_MISSING: "ARGUMENT_MISSING";
    /**
     * **动手时当前页面不在允许的源上**（或读不到当前页面的源）。
     *
     * `open` 的站点范围判据只管**入口**：页面自己 `location.replace` 到别的源是浏览器行为，
     * 驱动拦不住。所以动作类必须在**执行前**再核一次**实时**页面源——否则「审入口」就退化成
     * 「审入口，除非页面自己把你带出去」，任何一个声明站点上的跳转（登录 / SSO / 第三方重定向 /
     * 被投毒的页面）都能换来对任意源执行点击与填值的能力（2026-10-02 验收实测）。
     */
    readonly PAGE_ORIGIN_NOT_ALLOWED: "PAGE_ORIGIN_NOT_ALLOWED";
    /** 执行失败。 */
    readonly EXECUTION_FAILED: "EXECUTION_FAILED";
};
/** 拒绝码类型。 */
export type WebRejectionCode = (typeof WEB_REJECTION_CODES)[keyof typeof WEB_REJECTION_CODES];
/** 判断一个字符串是不是已登记的动作。 */
export declare function isWebAction(value: string): value is WebAction;
/**
 * 一个 URL 是否落在目标声明的站点范围内。
 *
 * 口径：**同源**，且**路径在声明路径前缀之内**。两点都要：
 *   - 只判同源会让 `https://site/admin` 这类越权路径也能打开；
 *   - 只判前缀会在换域名后静默放行到别的站点。
 *
 * 返回 `undefined` = 无法判断（URL 不合法），调用方按拒绝处理。
 */
export declare function urlAllowed(url: string, siteUrl: string): boolean | undefined;
/**
 * **会在页面上动手的动作** —— 只有这些需要「当前页面的源」判据。
 *
 * 为什么读类不在其中：跳转后**读**是登录流程的必要部分（登录页要读、要截图给人看），
 * 而且读本身不改变对面任何东西，读到的东西按**不受信的数据**处理。
 * 但「对异源页动手」是另一回事：它把「审查入口」退化成「审查入口，除非页面自己把你带出去」。
 */
export declare const MUTATING_WEB_ACTIONS: readonly ["click", "fill"];
/** 该动作是否需要在执行前核当前页面的源。 */
export declare function needsPageOriginCheck(action: WebAction): boolean;
/**
 * 允许**动手**的源集合：声明源 + 显式声明的额外源（`allowedOrigins`）。
 *
 * 解析不出来的条目**不授予任何权限**——一条写错的配置不该变成一次静默放行。
 */
export declare function allowedActionOrigins(target: WebTarget): Set<string>;
/** 当前页面的源是否允许动手。`undefined` = 读不到 → 调用方按拒绝处理。 */
export declare function pageOriginAllowed(currentUrl: string | undefined, target: WebTarget): boolean | undefined;
/**
 * 裁决一次动作。**纯函数**：不连浏览器、不读环境变量、不读文件。
 *
 * 顺序见文件头的三条判据。
 */
export declare function adjudicateWebAction(request: WebActionRequest): WebDecision;
/** 一次执行的结果。 */
export type WebOutcome = {
    ok: true;
    action: WebAction;
    result: unknown;
} | {
    ok: false;
    action: WebAction;
    code: WebRejectionCode;
    message: string;
    hint?: string;
};
/** 截图结果。 */
export interface ShotResult {
    /** 落盘路径。 */
    path: string;
    /** 宽高（报告里带上，便于判断是不是截了个空页面）。 */
    width?: number;
    height?: number;
}
/**
 * 页面驱动接口。
 *
 * 内核只依赖这个接口，**不依赖 Chrome / CDP**：真实实现（`@hyzyn/dsh-kit` 的 `Chrome`，
 * 原先从仓根 `scripts/chrome-cdp.mjs` 导入，那个转发 shim 已于 2026-10-02 删除）与测试里的
 * 假实现都实现它。这也是为什么本模块
 * 能在**没有浏览器**的情况下被完整测试——而「判定对不对」正是这一层最容易悄悄错掉的地方。
 */
export interface WebDriver {
    /** 打开 URL（可用目标的已验证会话）。 */
    open(request: {
        target: WebTarget;
        url: string;
        cwd: string;
    }): Promise<{
        url: string;
        title?: string;
    }>;
    /** 截图。 */
    screenshot(request: {
        target: WebTarget;
        path?: string;
    }): Promise<ShotResult>;
    /** 点击。 */
    click(request: {
        target: WebTarget;
        selector: string;
    }): Promise<void>;
    /** 填值。 */
    fill(request: {
        target: WebTarget;
        selector: string;
        value: string;
    }): Promise<void>;
    /** 取页面文本。 */
    text(request: {
        target: WebTarget;
    }): Promise<string>;
    /** 取 console 消息（**原始事实**，分类由 `console.ts` 做）。 */
    console(request: {
        target: WebTarget;
    }): Promise<readonly ConsoleMessage[]>;
    /**
     * **实时**问浏览器：当前页面的 URL 是什么。
     *
     * 必须是**实时的**，不能用驱动记的「上次导航的 URL」代替——客户端跳转（`location.replace`、
     * SPA 路由、`<meta refresh>`）只有浏览器自己知道，驱动的记账会漏掉它们，
     * 而那恰好是这道判据要防的东西。拿不到时返回 `undefined`（调用方按拒绝处理）。
     */
    currentUrl(request: {
        target: WebTarget;
    }): Promise<string | undefined>;
}
/** 一次动作的审计行（**含被拒绝的尝试**）。 */
export interface WebAuditEntry {
    at: number;
    targetId: string;
    action: string;
    allowed: boolean;
    code?: string;
    /** 打开 / 点击的目标（URL 或选择器）。 */
    subject?: string;
    operationId?: string;
}
/** 审计出口。写不进去时不返回结果（fail closed），由调用方实现这条语义。 */
export interface WebAuditSink {
    record(entry: WebAuditEntry): void;
}
/** 调一个动作：**先裁决，再执行**，每次都进审计。 */
export declare function invokeWebAction(input: {
    request: WebActionRequest;
    driver: WebDriver;
    audit?: WebAuditSink;
    operationId?: string;
}): Promise<WebOutcome>;
/** `console` 动作的返回形状（给调用方与用例用）。 */
export interface ConsoleActionResult {
    messages: ReturnType<typeof classifyConsoleMessages>;
    summary: ConsoleSummary;
}
