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
 *
 * **两档围栏（2026-09-25 统一，项目级 ROADMAP 第 1 项）**：
 *   - `isLoopbackRequest`：**同步**，口径就是上段那句（127.0.0.1 / localhost / [::1]
 *     三个字面量）。历史上 9 个插件逐字复制的正是它，语义未动。
 *   - `isLoopbackRequestStrict` + `hasSameOriginProof`：自 `docker` 收敛过来的**加固档**
 *     ——127/8 全段、`*.localhost` 与 `/etc/hosts` 别名的 DNS 确认（docker D31/D110）、
 *     来源检查排在 DNS 之前的时序（docker D80）、变更端点与长流端点的同源证明
 *     （docker D32/D139）。`docker` · `tty` · `dsh-mcp` 已改走这一档（三处各写一份
 *     必然漂，见项目级 ROADMAP 第 1 项）；其余包仍用同步档——收敛到同一档要连信任
 *     模型一起定（同文件第 5 项），单包先做只会造出不一致的安全假设。
 */
import { promises as dns } from 'node:dns';
/** readJsonBody 的默认上限（字节）：与 mcp / rss / prompt 外的多数实现一致。 */
export const MAX_JSON_BODY_BYTES = 1024 * 1024;
/** 回环来源允许的 remoteAddress 形态：IPv4、IPv6、IPv4-mapped IPv6。 */
const LOOPBACK_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
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
export function isLoopbackRequest(request) {
    const address = request.socket.remoteAddress;
    if (address === undefined || !LOOPBACK_ADDRESSES.has(address))
        return false;
    const host = request.headers.host;
    if (typeof host !== 'string')
        return false;
    let hostUrl;
    try {
        hostUrl = new URL('http://' + host);
    }
    catch {
        return false;
    }
    if (hostUrl.hostname !== '127.0.0.1' && hostUrl.hostname !== 'localhost' && hostUrl.hostname !== '[::1]')
        return false;
    if (request.headers['sec-fetch-site'] === 'cross-site')
        return false;
    const origin = request.headers.origin;
    if (origin === undefined)
        return true;
    try {
        return new URL(origin).host === hostUrl.host;
    }
    catch {
        return false;
    }
}
/**
 * 环回地址判定（docker D31）：接受 127/8 **全段**（BSD/Linux 惯例——整个
 * 127.0.0.0/8 都是环回，此前各包只认 `127.0.0.1` 一个字面量）与 IPv6 等价形式
 * （`::1`、`::ffff:` 映射）。
 *
 * 与上面的 `LOOPBACK_ADDRESSES` 刻意分开：那个是 9 个插件在用的同步档的既有口径，
 * 改它会同时改掉它们的放行面（属项目级 ROADMAP 第 5 项那类「全仓信任模型」的活）。
 */
export function isLoopbackAddress(address) {
    if (address === undefined || address === '')
        return false;
    let text = address.toLowerCase();
    if (text.startsWith('::ffff:'))
        text = text.slice(7);
    if (text === '::1')
        return true;
    const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(text);
    return v4 !== null && v4[1] === '127';
}
/** 别名 Host 解析结果的缓存与超时（docker D110）：请求路径里的 DNS 不该每请求都打一次，也不该无限等。 */
const HOST_LOOPBACK_TTL_MS = 60_000;
const HOST_LOOPBACK_CACHE_MAX = 64;
const HOST_LOOPBACK_TIMEOUT_MS = 500;
const hostLoopbackCache = new Map();
/**
 * 解析一个主机名是否指向本机（docker D110）。带 500ms 超时与 60s 的 LRU（别名部署下
 * 每个请求都要过一次）。**失败与超时不缓存**：解析器恢复后要立刻生效，而不是把一次
 * 抖动钉 60 秒。
 */
async function lookupHostLoopback(host) {
    const cached = hostLoopbackCache.get(host);
    if (cached !== undefined && Date.now() - cached.at <= HOST_LOOPBACK_TTL_MS)
        return cached.loopback;
    let timer = null;
    try {
        const records = await Promise.race([
            dns.lookup(host, { all: true }),
            new Promise((_resolve, reject) => {
                timer = setTimeout(() => { reject(new Error(`DNS 解析超时（>${String(HOST_LOOPBACK_TIMEOUT_MS)}ms）`)); }, HOST_LOOPBACK_TIMEOUT_MS);
                timer.unref?.();
            }),
        ]);
        const loopback = records.some((record) => isLoopbackAddress(record.address));
        if (hostLoopbackCache.size >= HOST_LOOPBACK_CACHE_MAX) {
            const oldest = hostLoopbackCache.keys().next().value;
            if (oldest !== undefined)
                hostLoopbackCache.delete(oldest);
        }
        hostLoopbackCache.set(host, { at: Date.now(), loopback });
        return loopback;
    }
    catch {
        return false;
    }
    finally {
        if (timer !== null)
            clearTimeout(timer);
    }
}
/**
 * Host 是否指向本机（docker D31）：字面量环回直接判；主机名 / `/etc/hosts` 别名走一次
 * 带超时的 DNS 解析。判不出来就拒绝——围栏宁可误拦一个怪别名，不能放行一个能解析到
 * 公网的 Host。
 */
async function hostResolvesToLoopback(hostname) {
    const host = hostname.toLowerCase().replace(/\.$/, '');
    if (host === 'localhost' || host.endsWith('.localhost') || isLoopbackAddress(host))
        return true;
    return await lookupHostLoopback(host);
}
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
export function isLoopbackRequestStrict(request) {
    if (!isLoopbackAddress(request.socket.remoteAddress))
        return false;
    const host = request.headers.host;
    if (typeof host !== 'string')
        return false;
    let hostUrl;
    try {
        hostUrl = new URL('http://' + host);
    }
    catch {
        return false;
    }
    if (request.headers['sec-fetch-site'] === 'cross-site')
        return false;
    const origin = request.headers.origin;
    if (origin !== undefined) {
        let sameOrigin = false;
        try {
            sameOrigin = new URL(origin).host === hostUrl.host;
        }
        catch {
            sameOrigin = false;
        }
        if (!sameOrigin)
            return false;
    }
    const hostname = hostUrl.hostname.toLowerCase().replace(/\.$/, '');
    if (hostname === 'localhost' || hostname.endsWith('.localhost') || isLoopbackAddress(hostname))
        return true;
    return hostResolvesToLoopback(hostname);
}
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
export function hasSameOriginProof(request) {
    const site = request.headers['sec-fetch-site'];
    if (typeof site === 'string' && site === 'same-origin')
        return true;
    const origin = request.headers.origin;
    if (origin !== undefined) {
        // Origin 出现就一律以它为准：非字符串 / 空串 / 不同源都拒，**不回落**到 Cookie——
        // 否则一个畸形 Origin 反倒成了绕过同源比对的入口
        if (typeof origin !== 'string' || origin === '')
            return false;
        const host = request.headers.host;
        if (typeof host !== 'string')
            return false;
        try {
            return new URL(origin).host === host;
        }
        catch {
            return false;
        }
    }
    const cookie = request.headers.cookie;
    return typeof cookie === 'string' && cookie.trim() !== '';
}
/**
 * 403 的成因摘要（docker D139）：那次桌面版长流全断，宿主侧**一条日志都没有**，只能靠读
 * 客户端源码 + 拆 `app.asar` 反推。以后同类问题第一眼就能定位：只报这三个头「有没有」，
 * **绝不落 Cookie 的值**（它是宿主会话凭据）。
 */
export function originProofHint(request) {
    const has = (name) => {
        const value = request.headers[name];
        return typeof value === 'string' && value !== '' ? '有' : '无';
    };
    return `origin=${has('origin')} sec-fetch-site=${has('sec-fetch-site')} cookie=${has('cookie')}`;
}
/**
 * JSON 响应基线：content-type / referrer-policy 是各包公共基线，cache-control
 * no-store 与 x-content-type-options nosniff 取自 env 的收紧版本（含配置与密钥
 * 的路由不该被浏览器缓存；各包既有调用行为不变）。headers 参数可覆盖单条。
 */
export function writeJson(res, status, body, headers) {
    res.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        'referrer-policy': 'no-referrer',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
        ...headers,
    });
    res.end(JSON.stringify(body));
}
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
export async function readJsonBody(req, maxBytes = MAX_JSON_BODY_BYTES) {
    const chunks = [];
    let size = 0;
    try {
        for await (const chunk of req) {
            size += chunk.length;
            if (size > maxBytes)
                return undefined;
            chunks.push(chunk);
        }
    }
    catch {
        return undefined;
    }
    try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
            ? parsed
            : undefined;
    }
    catch {
        return undefined;
    }
}
//# sourceMappingURL=http.js.map