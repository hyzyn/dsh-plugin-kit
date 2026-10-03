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
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
/** 默认的 Chrome 可执行文件（macOS）。其它平台用 `path` 选项或 `CHROME_PATH` 覆盖。 */
export const DEFAULT_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
/**
 * 起浏览器**失败时的解释**。
 *
 * 为什么值得单独写一段：Chrome 起不来有好几种表现（端点没起来 / 起来了又断 / 进程带信号退出），
 * 而它们的修法完全不同。原先把这些统统归到「CDP 端点没起来」——一句不产生新信息的话，
 * 使用者只能猜。这里按 stderr 里的已知特征给出可执行的下一步。
 */
function explainLaunchFailure(stderr, signal) {
    const hint = stderr.includes('Failed to initialize sandbox') || stderr.includes('sandbox initialization failed')
        ? '\n这是**沙箱初始化失败**：受限环境（容器 / CI / 受限的 macOS 沙箱）里需要显式关掉沙箱——' +
            '传 `noSandbox: true`（或 `extraArgs: ["--no-sandbox"]`）。代价是关掉浏览器进程隔离，只在必要环境这么做。'
        : '';
    const crashed = signal === null ? '' : `\nChrome 进程带信号退出：${signal}（SIGTRAP 常见于沙箱初始化失败或崩溃）`;
    return `Chrome 的 CDP 端点没起来。${crashed}${hint}\nstderr=${stderr.slice(0, 600)}`;
}
/** 本进程内已起过多少个 Chrome——只用来给默认 profile 目录去重。 */
let launchSeq = 0;
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
export function defaultUserDataDir() {
    launchSeq += 1;
    return join(tmpdir(), `dsh-cdp-${String(process.pid)}-${String(launchSeq)}`);
}
export class Chrome {
    child;
    port;
    version;
    userDataDir;
    /** 起一个 headless Chrome 并等 CDP 端点可用。 */
    static async launch(options = {}) {
        const { path = DEFAULT_CHROME, port, userDataDir, extraArgs = [], noSandbox = false } = options;
        const dir = userDataDir ?? defaultUserDataDir();
        rmSync(dir, { recursive: true, force: true });
        mkdirSync(dir, { recursive: true });
        const child = spawn(path, [
            '--headless=new',
            `--remote-debugging-port=${String(port ?? 0)}`,
            `--user-data-dir=${dir}`,
            '--no-first-run',
            '--no-default-browser-check',
            '--disable-gpu',
            '--disable-extensions',
            '--window-size=1440,900',
            ...(noSandbox ? ['--no-sandbox'] : []),
            ...extraArgs,
            'about:blank',
        ], { stdio: ['ignore', 'pipe', 'pipe'] });
        let stderr = '';
        child.stderr?.on('data', (chunk) => (stderr += String(chunk)));
        // 端口可能由 Chrome 自己挑（`--remote-debugging-port=0`）：那就从它的 stderr 里读回来。
        // 早先这里只会去轮询 9222，于是「不指定端口」直接失败。
        const deadline = Date.now() + 20_000;
        let version;
        let actualPort = port === undefined || port === 0 ? undefined : port;
        while (Date.now() < deadline) {
            // **进程已经死了就别再等**：否则要等满 20 秒才拿到一句「端点没起来」，
            // 而真正的原因（沙箱初始化失败 / 崩溃）就在 stderr 里。
            if (child.exitCode !== null || child.signalCode !== null) {
                throw new Error(explainLaunchFailure(stderr, child.signalCode));
            }
            if (actualPort === undefined) {
                const match = /DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//.exec(stderr);
                if (match !== null)
                    actualPort = Number(match[1]);
            }
            if (actualPort !== undefined) {
                try {
                    version = (await (await fetch(`http://127.0.0.1:${String(actualPort)}/json/version`)).json());
                    break;
                }
                catch {
                    /* 端点还没起来 */
                }
            }
            await new Promise((resolve) => setTimeout(resolve, 250));
        }
        if (version === undefined) {
            try {
                child.kill();
            }
            catch {
                /* 已退 */
            }
            throw new Error(explainLaunchFailure(stderr, child.signalCode));
        }
        return new Chrome(child, actualPort, version, dir);
    }
    /** 下一个命令 id。 */
    nextId = 1;
    /** 已发出但未收到回应的命令。 */
    pending = new Map();
    /** 事件监听器。 */
    listeners = new Map();
    /** CDP WebSocket；未连接时为 `undefined`。 */
    socket;
    constructor(
    /** Chrome 子进程（`close()` 会 kill 它）。 */
    child, 
    /** 实际使用的调试端口。 */
    port, 
    /** `/json/version` 的返回。 */
    version, 
    /** profile 目录（`close()` 会尝试清理）。 */
    userDataDir) {
        this.child = child;
        this.port = port;
        this.version = version;
        this.userDataDir = userDataDir;
    }
    /** 附到第一个 page target 上并连上它的 CDP WebSocket。 */
    async attachToPage() {
        const list = (await (await fetch(`http://127.0.0.1:${String(this.port)}/json/list`)).json());
        const page = list.find((item) => item.type === 'page') ?? list[0];
        if (page === undefined)
            throw new Error('没有可附加的 target');
        await this.connect(page.webSocketDebuggerUrl);
        return page;
    }
    /** 连一个 CDP WebSocket 端点。 */
    connect(url) {
        return new Promise((resolve, reject) => {
            const socket = new WebSocket(url);
            this.socket = socket;
            socket.addEventListener('open', () => resolve());
            socket.addEventListener('error', (event) => {
                const message = event.message;
                reject(new Error(`CDP WS error: ${message ?? 'unknown'}`));
            });
            socket.addEventListener('message', (event) => {
                let message;
                try {
                    message = JSON.parse(String(event.data));
                }
                catch {
                    return;
                }
                if (message.id !== undefined) {
                    const pending = this.pending.get(message.id);
                    if (pending === undefined)
                        return;
                    this.pending.delete(message.id);
                    if (message.error !== undefined)
                        pending.reject(new Error(JSON.stringify(message.error)));
                    else
                        pending.resolve(message.result);
                    return;
                }
                if (message.method === undefined)
                    return;
                for (const listener of this.listeners.get(message.method) ?? [])
                    listener(message.params ?? {});
            });
        });
    }
    /** 发一条 CDP 命令。 */
    send(method, params = {}) {
        const id = this.nextId++;
        return new Promise((resolve, reject) => {
            this.pending.set(id, { resolve: resolve, reject });
            this.socket?.send(JSON.stringify({ id, method, params }));
            setTimeout(() => {
                if (!this.pending.has(id))
                    return;
                this.pending.delete(id);
                reject(new Error(`CDP ${method} 超时`));
            }, 30_000);
        });
    }
    /** 订阅一个 CDP 事件。 */
    on(method, listener) {
        const list = this.listeners.get(method) ?? [];
        list.push(listener);
        this.listeners.set(method, list);
    }
    /** 在页面里求值（默认等 Promise）。 */
    async evaluate(expression, options = {}) {
        const { awaitPromise = true } = options;
        const result = await this.send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
        if (result.exceptionDetails !== undefined) {
            const description = result.exceptionDetails.exception?.description;
            throw new Error(`页面里抛错：${description ?? JSON.stringify(result.exceptionDetails)}`);
        }
        return result.result?.value;
    }
    /** 截图到文件，返回路径。 */
    async screenshot(file) {
        const shot = await this.send('Page.captureScreenshot', {
            format: 'png',
            captureBeyondViewport: false,
        });
        writeFileSync(file, Buffer.from(shot.data, 'base64'));
        return file;
    }
    /** 关连接、kill 子进程、清 profile。 */
    close() {
        try {
            this.socket?.close();
        }
        catch {
            /* 已关 */
        }
        try {
            this.child.kill();
        }
        catch {
            /* 已退 */
        }
        // Chrome 可能还在收尾写 profile：清理失败不该影响退出码
        try {
            rmSync(this.userDataDir, { recursive: true, force: true, maxRetries: 3 });
        }
        catch {
            /* 临时目录交给系统回收 */
        }
    }
}
//# sourceMappingURL=chrome-cdp.js.map