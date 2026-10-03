/**
 * 最小 Chrome DevTools Protocol 客户端（零依赖：Node 22 自带 `fetch` 与全局 `WebSocket`）。
 *
 * ## 为什么它在 `kit` 里
 *
 * 它原先住在仓根的 `scripts/chrome-cdp.mjs`。那是**跨包共用的实现**——消费者有
 * `scripts/verify-client-ui.mjs`、`scripts/verify-rss-opml.mjs`、
 * `packages/docker/scripts/log-perf.mjs`，以及 `packages/devfront` 的浏览器驱动。
 * 按本仓「`kit` 是唯一的库」的规矩（见 `docs/architecture.md`），这种实现该收在 `kit`：
 * 放在任何**插件包**里，根 `scripts/` 就得反向依赖一个插件——依赖方向是错的。
 *
 * ## 它做什么
 *
 * 起一个 headless Chrome，连上它的 CDP WebSocket，发命令、收事件、截图。刻意**不引入依赖**：
 * Node 22 自带 `fetch` 与全局 `WebSocket`，而这个客户端要用的只是五个 CDP 方法。
 *
 * 用法（真实消费者见 `packages/devfront/src/cdp-driver.ts`）：
 *
 * ```ts
 * const chrome = await Chrome.launch()
 * await chrome.attachToPage()
 * await chrome.send('Page.navigate', { url })
 * await chrome.screenshot('/tmp/shot.png')
 * chrome.close()
 * ```
 */
import { type ChildProcess } from 'node:child_process';
/** 默认的 Chrome 可执行文件（macOS）。其它平台用 `path` 选项或 `CHROME_PATH` 覆盖。 */
export declare const DEFAULT_CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
/** `Chrome.launch` 的选项。 */
export interface ChromeLaunchOptions {
    /** 可执行文件路径。 */
    path?: string;
    /** 调试端口；`0` / 不给 = 让 Chrome 自己挑（从它的 stderr 读回来）。 */
    port?: number;
    /** profile 目录；不给则用临时目录。 */
    userDataDir?: string;
    /** 额外命令行参数。 */
    extraArgs?: string[];
    /**
     * 关掉 Chrome 的沙箱（加 `--no-sandbox`）。
     *
     * **默认关，只在必要时开**。受限环境（容器、CI、某些 macOS 沙箱）里 Chrome 的沙箱初始化
     * 会失败（stderr 里是 `Failed to initialize sandbox`），进程随后以 `SIGTRAP` 退出——
     * 表现为「端点起来了 1 秒就没了」，很难归因。这种情况必须显式打开本项。
     *
     * **代价要说清**：这是把浏览器的进程隔离关掉。验活会打开内网站点，所以它不该是默认值；
     * 换了环境（本机开发 vs 容器）应当由调用方决定，而不是由这个库替你决定。
     */
    noSandbox?: boolean;
}
/** CDP 事件参数（形状由各方法自定，这里只做结构约束）。 */
export type CdpParams = Record<string, unknown>;
/** `/json/version` 的返回。 */
export interface CdpVersionInfo {
    Browser?: string;
    'Protocol-Version'?: string;
    webSocketDebuggerUrl?: string;
}
/** 一个可附加的 target。 */
export interface CdpTarget {
    type?: string;
    url?: string;
    webSocketDebuggerUrl: string;
}
/** CDP 事件监听器。 */
export type CdpListener = (params: CdpParams) => void;
/**
 * 默认的 Chrome 用户数据目录（**每次调用都必须唯一**）。
 *
 * 为什么必须唯一：`launch` 拿到目录后先 `rmSync` 再 `mkdirSync`。同一个进程里可以同时存在多个
 * Chrome（一个插件实例 + 一个测试里的探测客户端、或两个插件实例），目录名一旦撞上，
 * 第二次启动就会**去删一个正在跑的 Chrome 的 profile**——轻则
 * `ENOTEMPTY: directory not empty, rmdir …`，重则把在跑的那个弄坏。
 *
 * 从前这个名字是 `dsh-cdp-<pid>-<port>`，而 `port` 缺省是 `0` →
 * **同一进程里的第二个 Chrome 必然撞上**（2026-10-02 被
 * `packages/devfront/test/tool-smoke.test.ts` 那个「另开一条 CDP 通路独立测量」的用例打出来）。
 * 换成进程内自增序号：pid 区分进程、序号区分同进程内的多次启动。
 */
export declare function defaultUserDataDir(): string;
export declare class Chrome {
    /** Chrome 子进程（`close()` 会 kill 它）。 */
    readonly child: ChildProcess;
    /** 实际使用的调试端口。 */
    readonly port: number | undefined;
    /** `/json/version` 的返回。 */
    readonly version: CdpVersionInfo;
    /** profile 目录（`close()` 会尝试清理）。 */
    readonly userDataDir: string;
    /** 起一个 headless Chrome 并等 CDP 端点可用。 */
    static launch(options?: ChromeLaunchOptions): Promise<Chrome>;
    /** 下一个命令 id。 */
    private nextId;
    /** 已发出但未收到回应的命令。 */
    private readonly pending;
    /** 事件监听器。 */
    private readonly listeners;
    /** CDP WebSocket；未连接时为 `undefined`。 */
    private socket;
    constructor(
    /** Chrome 子进程（`close()` 会 kill 它）。 */
    child: ChildProcess, 
    /** 实际使用的调试端口。 */
    port: number | undefined, 
    /** `/json/version` 的返回。 */
    version: CdpVersionInfo, 
    /** profile 目录（`close()` 会尝试清理）。 */
    userDataDir: string);
    /** 附到第一个 page target 上并连上它的 CDP WebSocket。 */
    attachToPage(): Promise<CdpTarget>;
    /** 连一个 CDP WebSocket 端点。 */
    connect(url: string): Promise<void>;
    /** 发一条 CDP 命令。 */
    send<T = unknown>(method: string, params?: CdpParams): Promise<T>;
    /** 订阅一个 CDP 事件。 */
    on(method: string, listener: CdpListener): void;
    /** 在页面里求值（默认等 Promise）。 */
    evaluate(expression: string, options?: {
        awaitPromise?: boolean;
    }): Promise<unknown>;
    /** 截图到文件，返回路径。 */
    screenshot(file: string): Promise<string>;
    /** 关连接、kill 子进程、清 profile。 */
    close(): void;
}
