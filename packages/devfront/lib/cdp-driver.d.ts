/**
 * CDP 驱动的 `WebDriver` 实现（`docs/devdata-plan.md` §15.2）。
 *
 * ## 这一层的职责边界
 *
 * `page.ts` 管判定（能不能做），本模块管**怎么在浏览器里做**。它不做任何安全判定——
 * 那是上游的事，而且这样分工才让判定层能在没有浏览器的情况下被完整测试。
 *
 * ## 三处实现要点（都是踩过的地方）
 *
 * 1. **console 收集必须在导航之前订阅**。`Runtime.consoleAPICalled` 与
 *    `Log.entryAdded` 是**事件**：页面加载期间产生的错误在订阅之前就发出去了，事后再开订阅
 *    什么都收不到——而发布验活最关心的恰恰是首屏那几秒的错误。
 * 2. **`sourceUrl` 要专门取**。分类的主判据是来源：`ConsoleMessage.sourceUrl` 为空时
 *    一律只能算「告警」（见 `console.ts`）。所以这里要尽力从 `stackTrace` / `Log` 的
 *    `url` 字段里把它捞出来，而不是只留一句文本。
 * 3. **`text` 取的是可见文本**，不是 `outerHTML`：断言里的 `toContain` 是给人写的
 *    （「订单编号」），拿 HTML 去比会把标签也带上，于是「明明页面上有」却匹配不上。
 *
 * 依据：`docs/devdata-plan.md` §15.2 / §15.3。
 */
import { type CdpParams } from '@hyzyn/dsh-kit';
import type { ConsoleLevel, ConsoleMessage } from './console.js';
import type { ShotResult, WebDriver, WebTarget } from './page.js';
import type { PageObservation } from './web-verify.js';
/** `CdpWebDriver` 的选项。 */
export interface CdpWebDriverOptions {
    /** Chrome 可执行文件路径（缺省 `CHROME_PATH`，再缺省 macOS 默认位置）。 */
    chromePath?: string;
    /** 截图默认输出目录（缺省系统临时目录）。 */
    shotDir?: string;
    /** 每次导航后等多久（毫秒），给首屏渲染留时间。缺省 800。 */
    settleMs?: number;
    /** 导航超时（毫秒）。缺省 30 秒（与 `Chrome.send` 的 CDP 超时一致）。 */
    navigationTimeoutMs?: number;
    /**
     * **默认**视口（`WebTarget.viewport` 没写时用它）。加它的原因见 `ensurePage`：
     * 按站点的视口优先，这一项只是没配站点时的兜底。
     */
    viewport?: {
        width: number;
        height: number;
    };
    /**
     * 关掉 Chrome 的沙箱（`--no-sandbox`）。
     *
     * **默认关**（`false`）。受限环境里 Chrome 的沙箱初始化会失败、进程带 `SIGTRAP` 退出，
     * 表现为「端点起来了 1 秒就没了」。那种环境必须显式打开——代价是关掉浏览器进程隔离，
     * 而验活会打开内网站点，所以不该是默认值（见 `@hyzyn/dsh-kit` 的 `ChromeLaunchOptions.noSandbox`）。
     */
    noSandbox?: boolean;
    /** 额外传给 Chrome 的参数（透传给 `Chrome.launch`）。 */
    chromeArgs?: string[];
}
/** 把 CDP 的 console type 归一成本模块的级别。 */
export declare function normalizeLevel(type: string | undefined): ConsoleLevel;
/**
 * 从资源失败的正文明文里取 HTTP 状态码。
 *
 * CDP 的资源失败事件只有一句人话（`Failed to load resource: the server responded with a
 * status of 404 (Not Found)`），没有结构化的状态字段。取不到就返回 `undefined`——
 * **不猜**：给一个错的状态码会让按状态分档的规则反向生效。
 */
export declare function extractStatus(text: string): number | undefined;
/** 把 CDP 的 `RemoteObject` 拼成人能读的一行（console 的消息正文可能不是字符串）。 */
export declare function textOfArgs(args: readonly CdpParams[] | undefined): string;
/**
 * 从 `stackTrace` 里取第一帧的 URL。
 *
 * 为什么要专门做：分类的主判据是「来源是不是本站」——拿不到来源就只能算告警，
 * 而一个真实故障被降级成告警，正是「噪声淹掉信号」的另一种形态。
 */
export declare function sourceOfStack(stackTrace: CdpParams | undefined): string | undefined;
/**
 * 一个 headless Chrome 驱动的 `WebDriver`。
 *
 * **生命周期**：`open()` 会按需起浏览器并**保持**它（后续 `click` / `text` / `console`
 * 都作用于同一个页面）。`dispose()` 负责关掉——调用方必须调它，否则 Chrome 进程会留下来。
 * 这一点写在这里是因为它不是「可选清理」：忘了就是每验一次泄漏一个浏览器进程。
 */
export declare class CdpWebDriver implements WebDriver {
    private readonly options;
    private chrome;
    private readonly collector;
    private shotDir;
    private ownShotDir;
    private lastUrl;
    /**
     * 已经施加给当前页面的视口（`'390x844'` 或空串 = 浏览器默认）。
     *
     * 为什么要记账：**一个浏览器服务多个站点**，视口按站点配（`WebTarget.viewport`），
     * 所以每次动作前都要核一次；但核不等于发——CDP 调用是白花的开销，值没变就不该发。
     */
    private appliedViewport;
    /** console 事件是否已订阅（**必须在导航之前**，见文件头）。 */
    private subscribed;
    constructor(options?: CdpWebDriverOptions);
    /** 起浏览器并订阅 console 事件（幂等）。 */
    private ensureChrome;
    /**
     * 起浏览器 **+ 按当前站点施加视口**（每个动作的第一个入口）。
     *
     * 视口为什么不能只在起浏览器时定一次：**同一个浏览器服务多个站点**，而视口是**按站点配**的
     * （`WebTarget.viewport`，2026-10-02 加：原先 `CdpWebDriverOptions.viewport` 存在、实现了、
     * 却**没有任何调用方**，于是六个工具永远用默认桌面视口——而本机要验的前端里 `hcckc-h5` /
     * `bpaimsm-v4` / `bpaossm-v3.1` 都是移动端 H5，看到的不是手机上的样子）。
     *
     * 优先级：站点的 `viewport` > 构造时的 `options.viewport`（默认视口）> 浏览器默认。
     * 值没变就不发 CDP（见 `appliedViewport` 的注释）。
     */
    private ensurePage;
    open(input: {
        target: WebTarget;
        url: string;
        cwd: string;
    }): Promise<{
        url: string;
        title?: string;
    }>;
    /** 等页面真正停下（轮询 `document.readyState`，不依赖 CDP 的加载事件竞态）。 */
    private waitForLoad;
    /** 给 SPA 的首屏渲染留一点时间（不是启发式判据，只是避免必然失败的一读）。 */
    private settle;
    screenshot(input: {
        target: WebTarget;
        path?: string;
    }): Promise<ShotResult>;
    /** 截图默认落盘位置（懒建临时目录；`dispose()` 负责清理自己建的那个）。 */
    private defaultShotPath;
    click(input: {
        target: WebTarget;
        selector: string;
    }): Promise<void>;
    fill(input: {
        target: WebTarget;
        selector: string;
        value: string;
    }): Promise<void>;
    text(input: {
        target: WebTarget;
    }): Promise<string>;
    console(input: {
        target: WebTarget;
    }): Promise<readonly ConsoleMessage[]>;
    /**
     * **一次取全**：一次 `Runtime.evaluate` 把文本、若干选择器的事实与当前 URL 一起取回来
     * （console 走已经订阅的累积缓冲，不再多问一次）。
     *
     * 两处刻意的实现选择：
     *
     * 1. **一个选择器不合法不许把整次观察带下去**。`querySelectorAll` 对坏选择器是**抛错**，
     *    而在页面里逐个 `try/catch` 之后把错误**原样**带回 `error` 字段——于是一条写错的选择器
     *    只让**用它**的那几条断言判 `unknown`，同页其它断言照样有结论。不这么做的话，
     *    清单里一个错别字会让整页（含 console 判据）变成一句「观察失败」。
     * 2. **取的是 `innerText`（可见文本）**，与 `text()` 同一口径：断言里的 `toContain` 是给人写的
     *    （「订单编号」），拿 HTML 去比会把标签也带上，于是「明明页面上有」却匹配不上。
     */
    observe(input: {
        target: WebTarget;
        selectors: readonly string[];
    }): Promise<PageObservation>;
    /**
     * 实时问浏览器：当前页面的 URL。
     *
     * **刻意不用 `this.lastUrl`**：那是驱动「上次导航到哪」的记账，客户端跳转
     * （`location.replace` / SPA 路由 / `<meta refresh>`）不会更新它——而这道判据要防的
     * 恰恰就是客户端跳转。只有问浏览器才拿得到真话。问不到就返回 `undefined`（调用方按拒绝处理）。
     */
    currentUrl(input: {
        target: WebTarget;
    }): Promise<string | undefined>;
    /** console 事件是否已订阅（给集成测试与排障用）。 */
    get consoleSubscribed(): boolean;
    /** 关浏览器并清理自己建的临时截图目录。 */
    dispose(): void;
}
