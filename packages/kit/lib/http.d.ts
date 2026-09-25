/** 宿主路由请求的最小形状（node:http 的 IncomingMessage 结构上兼容）。 */
export interface ReqLike {
    method?: string;
    url?: string;
    headers: Record<string, string | string[] | undefined>;
    socket: {
        remoteAddress?: string;
    };
}
/** 宿主路由响应的最小形状（node:http 的 ServerResponse 结构上兼容）。 */
export interface ResLike {
    writeHead(status: number, headers?: Record<string, string>): void;
    end(body?: string): void;
}
/** readJsonBody 的默认上限（字节）：与 mcp / rss / prompt 外的多数实现一致。 */
export declare const MAX_JSON_BODY_BYTES: number;
/**
 * loopback-only 请求围栏：全部条件满足才放行。以
 * packages/search/src/index.ts:826-846 的实现为准（全仓 9 份副本的基准），
 * 语义逐条对齐：
 *   1. remoteAddress 必须是 127.0.0.1 / ::1 / ::ffff:127.0.0.1；
 *   2. 必须有 Host 头，且 hostname 是 127.0.0.1 / localhost / [::1]（防 DNS
 *      rebinding：本机进程用外部域名解析到回环时 Host 不是本机名）；
 *   3. sec-fetch-site: cross-site 直接拒（浏览器发起的跨站请求即使 Origin 缺失
 *      也不放行）；
 *   4. Origin 缺省（非浏览器客户端，如 curl）放行；存在时其 host 必须与 Host
 *      完全一致（同源，含端口——不同端口的本机页面也不算同源）。
 */
export declare function isLoopbackRequest(request: ReqLike): boolean;
/**
 * 环回地址判定（docker D31）：接受 127/8 **全段**（BSD/Linux 惯例——整个
 * 127.0.0.0/8 都是环回，此前各包只认 `127.0.0.1` 一个字面量）与 IPv6 等价形式
 * （`::1`、`::ffff:` 映射）。
 *
 * 与上面的 `LOOPBACK_ADDRESSES` 刻意分开：那个是 9 个插件在用的同步档的既有口径，
 * 改它会同时改掉它们的放行面（属项目级 ROADMAP 第 5 项那类「全仓信任模型」的活）。
 */
export declare function isLoopbackAddress(address: string | undefined): boolean;
/**
 * loopback 信任围栏（加固档，docker D31/D80/D110）：字面量环回（绝大多数请求）**同步**
 * 判定——保持「请求进来即建流」的原有时序（SSE 测试与 EventSource 都依赖第一拍就写头）；
 * 只有主机名 / `/etc/hosts` 别名才走异步 DNS 确认，所以返回 `boolean | Promise<boolean>`，
 * **调用方必须处理 Promise 那一支**（`await` 或按 docker 的写法分流）。
 *
 * **来源检查必须在解析 Host 之前**（docker D80）：别名主机名（`127.0.0.1.nip.io`、
 * `/etc/hosts` 里的别名）走的是异步分支，若在那里提前 return，`Sec-Fetch-Site` 与 Origin
 * 两段检查会被整段跳过——围栏等于没设，跨站页面就能写 `/config`（它不要求同源证明）。
 */
export declare function isLoopbackRequestStrict(request: ReqLike): boolean | Promise<boolean>;
/**
 * 「同源证明」（docker D32/D139）：变更类与长流端点要求请求带 Origin（浏览器 fetch 对
 * cross-site 一定带）或 `Sec-Fetch-Site: same-origin` 之一。恶意页面可以用
 * `<img src="GET /images/pull/stream?...">` 触发副作用 / 拉起子进程，而旧 Safari / 部分
 * WebView 既不发 Origin 也不发 Sec-Fetch-Site——这两类端点对「无来源证明」的请求拒绝；
 * 只读端点维持 loopback-only 的原信任模型。
 *
 * **桌面版例外（docker D139）**：桌面壳把页面发往 `dsh-app://app/api/…` 的请求转给真实
 * 宿主时**会删掉 `origin` 与 `sec-fetch-site`**（`app.asar/lib/main.js` 的
 * `forwardWebRequest`，只重写 `host` / `cookie`），于是要求证明的端点在桌面版全部 403
 * ——症状是长流无限「连接中断，正在自动重连…」，而同一面板的只读路由照常可用（它们不
 * 要求证明）。
 *
 * 桌面壳在这条转发链上**必带宿主会话 Cookie**：`hostCookie` 由 `authenticateWebHost()`
 * 拿 `set-cookie` 换来，取不到时 `forwardWebRequest` 整体 503、根本走不到这里。而浏览器
 * 页面**伪造不了 Cookie 头**——跨站请求带不带它由 SameSite 决定，且现代浏览器一定同时带
 * `sec-fetch-site: cross-site`（已被上一条 loopback 围栏拒掉）。
 *
 * 所以把「两条证明都缺省」收窄成「都缺省 **且** 带宿主 Cookie」：桌面版放行、旧 Safari /
 * 裸 curl 仍然拒。这不是 D32 的松动——本函数从来没挡住本机进程（它们随时可以自带
 * `Origin: http://127.0.0.1:<port>` 过闸），防的一直是**浏览器**，而 Cookie 恰恰是浏览器
 * 侧最不可伪造的那一件。
 */
export declare function hasSameOriginProof(request: ReqLike): boolean;
/**
 * 403 的成因摘要（docker D139）：那次桌面版长流全断，宿主侧**一条日志都没有**，只能靠读
 * 客户端源码 + 拆 `app.asar` 反推。以后同类问题第一眼就能定位：只报这三个头「有没有」，
 * **绝不落 Cookie 的值**（它是宿主会话凭据）。
 */
export declare function originProofHint(request: ReqLike): string;
/**
 * JSON 响应基线：content-type / referrer-policy 是各包公共基线，cache-control
 * no-store 与 x-content-type-options nosniff 取自 env 的收紧版本（含配置与密钥
 * 的路由不该被浏览器缓存；各包既有调用行为不变）。headers 参数可覆盖单条。
 */
export declare function writeJson(res: ResLike, status: number, body: unknown, headers?: Record<string, string>): void;
/**
 * 读取并解析 JSON 请求体，失败一律返回 undefined（调用方按 400 处理）。
 *
 * 语义取自多数实现（mcp / env / prompt / codegraph / rss / tty / profile 逐字
 * 相同的那份）：
 *   - 边读边累计，超过 maxBytes 立即放弃（不再继续消费流，防内存放大）；
 *   - 流读取报错、JSON.parse 失败、解析结果不是「非 null 非数组的对象」→
 *     undefined；
 *   - 空 body 同样走 JSON.parse 失败分支 → undefined。
 * 与 docker 的实现有两点刻意差异：默认上限取 1MB（docker 更小，各插件本就
 * 可按需传 maxBytes），空 body 不特殊化为 {}（调用方无法区分「空」与「非法」，
 * 按失败处理更安全）。
 */
export declare function readJsonBody(req: ReqLike & AsyncIterable<Uint8Array>, maxBytes?: number): Promise<Record<string, unknown> | undefined>;
