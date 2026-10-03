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
import { decideScope } from '@hyzyn/dsh-kit';
import { classifyConsoleMessages, summarizeConsole } from './console.js';
/** 动作名。**这份清单就是白名单**——不在其中的一律拒。 */
export const WEB_ACTIONS = ['open', 'shot', 'click', 'fill', 'text', 'console'];
/** 拒绝码。 */
export const WEB_REJECTION_CODES = {
    /** 动作不在白名单里（未登记一律拒）。 */
    UNKNOWN_ACTION: 'UNKNOWN_ACTION',
    /** 当前目录不在目标的允许目录内（空 = 处处拒绝）。 */
    OUT_OF_SCOPE: 'OUT_OF_SCOPE',
    /** 目标没声明站点 URL。 */
    SITE_NOT_DECLARED: 'SITE_NOT_DECLARED',
    /** 要打开的 URL 不在目标声明的站点范围内（异源 / 越出路径前缀）。 */
    SITE_NOT_ALLOWED: 'SITE_NOT_ALLOWED',
    /** 参数缺失（如 `click` 没给选择器）。 */
    ARGUMENT_MISSING: 'ARGUMENT_MISSING',
    /**
     * **动手时当前页面不在允许的源上**（或读不到当前页面的源）。
     *
     * `open` 的站点范围判据只管**入口**：页面自己 `location.replace` 到别的源是浏览器行为，
     * 驱动拦不住。所以动作类必须在**执行前**再核一次**实时**页面源——否则「审入口」就退化成
     * 「审入口，除非页面自己把你带出去」，任何一个声明站点上的跳转（登录 / SSO / 第三方重定向 /
     * 被投毒的页面）都能换来对任意源执行点击与填值的能力（2026-10-02 验收实测）。
     */
    PAGE_ORIGIN_NOT_ALLOWED: 'PAGE_ORIGIN_NOT_ALLOWED',
    /** 执行失败。 */
    EXECUTION_FAILED: 'EXECUTION_FAILED',
};
/** 判断一个字符串是不是已登记的动作。 */
export function isWebAction(value) {
    return WEB_ACTIONS.includes(value);
}
/**
 * 一个 URL 是否落在目标声明的站点范围内。
 *
 * 口径：**同源**，且**路径在声明路径前缀之内**。两点都要：
 *   - 只判同源会让 `https://site/admin` 这类越权路径也能打开；
 *   - 只判前缀会在换域名后静默放行到别的站点。
 *
 * 返回 `undefined` = 无法判断（URL 不合法），调用方按拒绝处理。
 */
export function urlAllowed(url, siteUrl) {
    let target;
    let site;
    try {
        target = new URL(url);
        site = new URL(siteUrl);
    }
    catch {
        return undefined;
    }
    if (target.origin !== site.origin)
        return false;
    // 站点的路径前缀按「目录」比：声明的 `/app/` 允许 `/app/x`，不允许 `/appx`。
    const prefix = site.pathname.endsWith('/') ? site.pathname : `${site.pathname}/`;
    return target.pathname === site.pathname || target.pathname.startsWith(prefix);
}
/**
 * **会在页面上动手的动作** —— 只有这些需要「当前页面的源」判据。
 *
 * 为什么读类不在其中：跳转后**读**是登录流程的必要部分（登录页要读、要截图给人看），
 * 而且读本身不改变对面任何东西，读到的东西按**不受信的数据**处理。
 * 但「对异源页动手」是另一回事：它把「审查入口」退化成「审查入口，除非页面自己把你带出去」。
 */
export const MUTATING_WEB_ACTIONS = ['click', 'fill'];
/** 该动作是否需要在执行前核当前页面的源。 */
export function needsPageOriginCheck(action) {
    return MUTATING_WEB_ACTIONS.includes(action);
}
/** 把一个 URL 规约成源；不合法则 `undefined`。 */
function originOf(url) {
    if (url === undefined || url.trim() === '')
        return undefined;
    try {
        return new URL(url).origin;
    }
    catch {
        return undefined;
    }
}
/**
 * 允许**动手**的源集合：声明源 + 显式声明的额外源（`allowedOrigins`）。
 *
 * 解析不出来的条目**不授予任何权限**——一条写错的配置不该变成一次静默放行。
 */
export function allowedActionOrigins(target) {
    const origins = new Set();
    for (const candidate of [target.url, ...(target.allowedOrigins ?? [])]) {
        const origin = originOf(candidate);
        if (origin !== undefined)
            origins.add(origin);
    }
    return origins;
}
/** 当前页面的源是否允许动手。`undefined` = 读不到 → 调用方按拒绝处理。 */
export function pageOriginAllowed(currentUrl, target) {
    const origin = originOf(currentUrl);
    if (origin === undefined)
        return undefined;
    return allowedActionOrigins(target).has(origin);
}
/** 目标声明的站点是否可用（能解析、是 http/https）。 */
function siteUsable(siteUrl) {
    if (siteUrl === undefined || siteUrl.trim() === '')
        return false;
    try {
        const url = new URL(siteUrl);
        return url.protocol === 'http:' || url.protocol === 'https:';
    }
    catch {
        return false;
    }
}
/**
 * 裁决一次动作。**纯函数**：不连浏览器、不读环境变量、不读文件。
 *
 * 顺序见文件头的三条判据。
 */
export function adjudicateWebAction(request) {
    const { target, action, cwd } = request;
    // ① 白名单。
    if (!isWebAction(action)) {
        return {
            allowed: false,
            action,
            code: WEB_REJECTION_CODES.UNKNOWN_ACTION,
            message: `动作 ${action} 未登记在前端验证的白名单里，一律拒绝`,
            hint: `可用动作：${WEB_ACTIONS.join(' / ')}。本套件是**验证**工具，不是浏览器自动化工具（不做定时 / 爬虫 / 批量）`,
        };
    }
    // ② 目录作用域（与数据面同一份实现，语义：空 = 处处拒绝）。
    const scope = decideScope(target.scopeDirs, cwd);
    if (!scope.allowed) {
        return {
            allowed: false,
            action,
            code: WEB_REJECTION_CODES.OUT_OF_SCOPE,
            message: `当前目录不在目标 ${target.id} 的允许目录内（作用域为空表示处处拒绝）`,
            hint: `在目标 ${target.id} 的配置里声明 scopeDirs；前端验活会打到共享的测试环境，所以缺省拒绝`,
        };
    }
    // ③ 站点范围：只对 `open` 有意义（其余动作作用于「已经打开的那个页面」）。
    if (action === 'open') {
        if (!siteUsable(target.url)) {
            return {
                allowed: false,
                action,
                code: WEB_REJECTION_CODES.SITE_NOT_DECLARED,
                message: `目标 ${target.id} 没有声明可访问的站点（或声明的不是 http/https URL）`,
                hint: '在目标配置里声明 url；声明之后 open 只能落在它的同源与路径前缀之内',
            };
        }
        // 不给 URL = 打开**目标声明的站点根**。这是最常见的第一次调用（站点已经声明过、
        // 也已经被这条判据验证过），没理由逼调用方把同一个 URL 再抄一遍。
        if (request.url === undefined || request.url.trim() === '') {
            return { allowed: true, action, url: target.url };
        }
        const allowed = urlAllowed(request.url, target.url);
        if (allowed !== true) {
            return {
                allowed: false,
                action,
                code: WEB_REJECTION_CODES.SITE_NOT_ALLOWED,
                message: allowed === undefined
                    ? `URL 不合法：${request.url}`
                    : `${request.url} 不在目标 ${target.id} 声明的站点范围内（${target.url}）`,
                hint: `open 只允许同源且落在声明路径前缀之内的 URL；要验别的站点请先在配置里声明它`,
            };
        }
        return { allowed: true, action, url: request.url };
    }
    // ③' 其余动作的参数要求。
    if ((action === 'click' || action === 'fill') && (request.selector === undefined || request.selector.trim() === '')) {
        return {
            allowed: false,
            action,
            code: WEB_REJECTION_CODES.ARGUMENT_MISSING,
            message: `${action} 需要一个选择器（selector）`,
            hint: '给一个 CSS 选择器；本套件不做「按坐标点击」——那没有可复审的选择依据',
        };
    }
    if (action === 'fill' && request.value === undefined) {
        return {
            allowed: false,
            action,
            code: WEB_REJECTION_CODES.ARGUMENT_MISSING,
            message: 'fill 需要一个值（value）',
            hint: '给要填进输入框的值',
        };
    }
    return { allowed: true, action };
}
/* --------------------------------- 调用 --------------------------------- */
/** 调一个动作：**先裁决，再执行**，每次都进审计。 */
export async function invokeWebAction(input) {
    const { request, driver, audit, operationId } = input;
    const { target, action } = request;
    const denial = (code, message, hint) => {
        audit?.record({
            at: Date.now(),
            targetId: target.id,
            action,
            allowed: false,
            code,
            ...(request.url === undefined ? {} : { subject: request.url }),
            ...(operationId === undefined ? {} : { operationId }),
        });
        return hint === undefined ? { ok: false, action, code, message } : { ok: false, action, code, message, hint };
    };
    const decision = adjudicateWebAction(request);
    if (!decision.allowed) {
        return denial(decision.code, decision.message, decision.hint);
    }
    // ④ **动手前核实时页面源**（只对动作类；读类放行，理由见 `MUTATING_WEB_ACTIONS`）。
    //
    // 这一道不能并进 `adjudicateWebAction`：那里是纯函数，看不到浏览器。而 `open` 那道站点范围判据
    // 只管**入口 URL**——页面自己 `location.replace` 到别的源，驱动拦不住。
    // 少了这一道，「审入口」就变成「审入口，除非页面自己把你带出去」。
    if (needsPageOriginCheck(action)) {
        let currentUrl;
        try {
            currentUrl = await driver.currentUrl({ target });
        }
        catch {
            currentUrl = undefined; // 问不到 = 不知道在谁的页面上 → 不敢动手
        }
        const verdict = pageOriginAllowed(currentUrl, target);
        if (verdict !== true) {
            const declared = [...allowedActionOrigins(target)].join(' / ');
            return verdict === undefined
                ? denial(WEB_REJECTION_CODES.PAGE_ORIGIN_NOT_ALLOWED, '读不到当前页面的源，因此不敢在它上面动手', '先 site_open 一个已声明的 URL 并确认页面真的加载起来；动作只允许在声明源上执行')
                : denial(WEB_REJECTION_CODES.PAGE_ORIGIN_NOT_ALLOWED, `当前页面在 ${originOf(currentUrl) ?? ''}，不在允许动手的源里（允许：${declared}）`, `登录 / SSO 若确实需要在别的源上点击或填值，把那个源加进目标的 allowedOrigins（缺省为空 = 只能在声明源上动手）。注意：**页面自己跳转到异源不构成授权**`);
        }
    }
    const allow = (result) => {
        audit?.record({
            at: Date.now(),
            targetId: target.id,
            action,
            allowed: true,
            ...(request.url === undefined ? {} : { subject: request.url }),
            ...(operationId === undefined ? {} : { operationId }),
        });
        return { ok: true, action, result };
    };
    try {
        switch (action) {
            case 'open': {
                // 裁决已确认 URL；下面这个 `??` 只是让类型收窄，实际到不了。
                const url = decision.url ?? request.url ?? target.url;
                return allow(await driver.open({ target, url, cwd: request.cwd }));
            }
            case 'shot':
                return allow(await driver.screenshot({ target, ...(request.path === undefined ? {} : { path: request.path }) }));
            case 'click':
                // 选择器非空已由裁决保证。
                await driver.click({ target, selector: request.selector ?? '' });
                // 回显的键必须是 `selector`：这是工具声明的输出契约（`additionalProperties: false`），
                // 且渲染层按 `value.selector` 取字。曾经写成 `clicked`/`filled`，结果是**动作成功但工具报错**
                // （2026-10-02 端到端复现）——最坏的一种失败：agent 以为没点成，会去重试一个有副作用的动作。
                return allow({ selector: request.selector ?? '' });
            case 'fill':
                await driver.fill({ target, selector: request.selector ?? '', value: request.value ?? '' });
                return allow({ selector: request.selector ?? '' });
            case 'text':
                return allow(await driver.text({ target }));
            case 'console': {
                const messages = await driver.console({ target });
                const findings = classifyConsoleMessages(messages);
                return allow({ messages: findings, summary: summarizeConsole(findings) });
            }
        }
    }
    catch (error) {
        // 驱动报错是**执行层**失败，与「被闸门拦下」不同（agent 的后续动作也不同）。
        return denial(WEB_REJECTION_CODES.EXECUTION_FAILED, error instanceof Error ? error.message : String(error), '这是执行失败（不是被闸门拦下）：检查站点是否可达、选择器是否存在');
    }
}
//# sourceMappingURL=page.js.map