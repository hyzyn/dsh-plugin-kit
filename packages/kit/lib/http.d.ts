/**
 * @hyzyn/dsh-kit — 宿主半体 HTTP 路由的共用辅助。
 *
 * 每个插件的 HTTP 路由都重复了同一套围栏与响应样板（全仓 9 份 loopback 校验、
 * 9 份 writeJson、7 份 readJsonBody），差异只在 body 上限等常量。收敛到 kit 后
 * 安全围栏只有一份，修一处即全生态生效，新插件默认站在正确的一侧。
 *
 * 信任模型（loopback-only + 同源）：DSH Web GUI 的宿主半体监听本机回环，浏览器
 * 页面与插件路由同源。isLoopbackRequest 同时要求「TCP 来源是回环地址」「Host 头
 * 指向本机」「sec-fetch-site 不是 cross-site」「Origin（若有）与 Host 同源」——
 * 防的是本机其它进程 / 恶意网页借浏览器（DNS rebinding、跨站请求）打本机端口。
 * 任何一条不满足都拒绝；插件路由里拿它当第一道闸，403 走 writeJson 输出。
 *
 * 类型刻意用结构化的 ReqLike / ResLike（不 import node:http 类型）：
 *   - 宿主注入的 req/res 只需满足这些形状，不绑死 Node 版本；
 *   - 测试可以传极简假对象，不需要起真实 HTTP 服务；
 *   - client 半体 / 未来其它宿主实现也能直接复用同一函数。
 */
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
