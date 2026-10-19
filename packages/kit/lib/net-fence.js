/**
 * @hyzyn/dsh-kit — 出站围栏（地址判据 + 不跟随重定向 + 体积 / 超时上限）。
 *
 * ## 这个模块从哪来
 *
 * 它原本是 `@hyzyn/dsh-loglens` 的 `src/net.ts`（2026-10-11 落地，设计 §4.1 的第一份实现）。
 * 当时就写明「**第二个消费者出现时上收到 kit**」——2026-10-19 那个条件满足了：
 * `@hyzyn/dsh-rss` 要抓外部订阅源，而它此前只有 `new URL()` 一层校验、`redirect: 'follow'`
 * 默认跟随跳转（外部测评 issue #13 第 6 条：一个 302 就能把请求带到 `169.254.169.254`，
 * 元数据响应作为条目写进 `latest.json` 并注入 systemPrompt）。两处各写一套判据必然漂，
 * 所以按原计划上收，loglens 改为 re-export（它的适配器与用例不用改 import 路径）。
 *
 * ## 判据是「解析之后的 IP」，不是 URL 字符串
 *
 * 三条现实路径都能绕过「地址看起来是白名单里的」：
 *   1. **重定向**：fetch 默认 `redirect:'follow'`，来源回一个 302 就把请求带走；
 *   2. **主机名**：用户填域名 / 别名，字面量校验看不到它解析出来的 IP；
 *   3. **响应体无上限**：`response.text()` 对面给多少读多少（也就能把宿主的堆吃光）。
 *
 * 产品语义（沿用 loglens 2026-10-11 的定稿，**别在消费包里另立一套**）：
 *   - **连接面 = 你配置的来源**：回环 / 私网 / 公网都放行——地址是操作者自己加的白名单，
 *     托管日志服务、内网 RSS 都是正常用法，一刀切拒只会变成一次多余的点击；
 *   - **链路本地 / 云元数据一律拒，且无豁免**（`169.254.169.254` 这类地址能换出云凭据，
 *     是这套东西里唯一真正危险的一面；阿里云的 `100.100.100.200` 由各包自己的
 *     `isLinkLocalHost` 快筛覆盖，这里按私网放行——那是**添加期**的字面量判据）；
 *   - 其余保护照旧：只认 http(s)、**不跟随重定向**、解析后的 IP 判定、体积与超时上限。
 *
 * ## 三条分寸（别把这一层当成完整的 SSRF 防护）
 *
 *   - 判定在 dns.lookup **之后**、真正建连**之前**：两步之间 DNS 翻脸（rebinding）仍有窗口。
 *     来源地址是操作者自己填的，本层的活是挡事故与过期的名字，不是对抗一个持有域名的对手；
 *   - **不跟随重定向**：`redirect:'manual'` 把 3xx 直接当失败，并回显 Location（便于改地址）；
 *   - 一个主机名解析出**多个**地址时**每一个都要过判据**：客户端会挑一个打（Happy Eyeballs），
 *     只看第一个等于没看。
 *
 * @see packages/kit/DEFECTS.md 的 `kit D16`
 */
import { lookup as dnsLookup } from 'node:dns/promises';
/** 响应体上限（字节）。日志行可以很大，但一份 8 MiB 的 JSON 已经超出「查日志」的语义了。 */
export const NET_MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
/** 单次请求默认超时；各消费者有自己的口径，这是兜底值。 */
export const NET_DEFAULT_TIMEOUT_MS = 20_000;
/** 域名解析的超时：解析卡住不该把一次查询也跟着卡住。 */
export const NET_LOOKUP_TIMEOUT_MS = 2_000;
/** 出站围栏抛出的错误：`code` 是给调用方分支用的，`url` 已去掉凭据。 */
export class FenceError extends Error {
    code;
    /** 已去掉凭据的地址（错误文案里**不该出现密码**）。 */
    url;
    constructor(code, message, url) {
        super(message);
        this.name = 'FenceError';
        this.code = code;
        this.url = url;
    }
}
const IPV4 = /^(\d{1,3})[.](\d{1,3})[.](\d{1,3})[.](\d{1,3})$/u;
const IPV6_TAIL = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/u;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
/** 默认解析器：一次拿全（A + AAAA），交给判据逐条过。 */
export const defaultLookup = async (host) => {
    const records = await dnsLookup(host, { all: true });
    return records.map((record) => record.address);
};
function octetsOf(text) {
    const matched = IPV4.exec(text);
    if (matched === null)
        return undefined;
    const parts = [matched[1], matched[2], matched[3], matched[4]].map((part) => Number(part));
    if (parts.some((part) => part > 255))
        return undefined;
    return parts;
}
/**
 * 这是不是一个 IP 字面量（而不是主机名）。
 *
 * 不用自己解析各种怪写法：**WHATWG URL 已经把 IPv4 的十六进制 / 八进制 / 少段形态归一成点分四段**
 * （实测 http://0x7f.0.0.1:3100 → 127.0.0.1、http://2130706433/ → 127.0.0.1），
 * 所以这里只要认「点分四段」与「带冒号的 IPv6」两种形态。
 */
export function isIpLiteral(host) {
    const text = host.trim().toLowerCase();
    if (text.includes(':'))
        return true;
    return IPV4.test(text);
}
function classifyIpv4(parts) {
    const [a, b, c, d] = parts;
    if (a === 127)
        return 'loopback';
    if (a === 169 && b === 254) {
        // 云元数据服务（AWS / Azure / GCP 都是 169.254.169.254，ECS 用 169.254.170.2）
        if (c === 169 && d === 254)
            return 'metadata';
        if (c === 170 && d === 2)
            return 'metadata';
        return 'link-local';
    }
    if (a === 10)
        return 'private';
    if (a === 172 && b >= 16 && b <= 31)
        return 'private';
    if (a === 192 && b === 168)
        return 'private';
    // 100.64/10 是运营商级 NAT 段：内网语义，照私网放行
    if (a === 100 && b >= 64 && b <= 127)
        return 'private';
    // 0.0.0.0/8「本机」、组播、保留段：不是能打的地址，硬拒
    if (a === 0)
        return 'other';
    if (a >= 224)
        return 'other';
    return 'public';
}
function classifyIpv6(text) {
    if (text === '::1')
        return 'loopback';
    if (text === '::')
        return 'other';
    // AWS 的 IMDS IPv6 端点
    if (text === 'fd00:ec2::254')
        return 'metadata';
    const head = text.split(':')[0];
    const value = head === '' ? 0 : parseInt(head, 16);
    if (Number.isNaN(value))
        return 'other';
    // fe80::/10
    if ((value & 0xffc0) === 0xfe80)
        return 'link-local';
    // fc00::/7 唯一本地地址
    if ((value & 0xfe00) === 0xfc00)
        return 'private';
    // ff00::/8 组播
    if ((value & 0xff00) === 0xff00)
        return 'other';
    // 2000::/3 全球单播
    if ((value & 0xe000) === 0x2000)
        return 'public';
    return 'other';
}
/**
 * 地址分档。IPv4-mapped IPv6 要**还原成 IPv4 再判**：::ffff:169.254.169.254 与
 * 169.254.169.254 是同一个地址，而 URL 会把前者归一成 ::ffff:a9fe:a9fe（实测），
 * 所以两种写法（点分 / 十六进制）都得认。
 */
export function classifyAddress(address) {
    let text = address.trim().toLowerCase();
    if (text.startsWith('[') && text.endsWith(']'))
        text = text.slice(1, -1);
    if (text.startsWith('::ffff:')) {
        const tail = text.slice(7);
        const mapped = octetsOf(tail);
        if (mapped !== undefined)
            return classifyIpv4(mapped);
        const hex = IPV6_TAIL.exec(tail);
        if (hex !== null) {
            const high = parseInt(hex[1], 16);
            const low = parseInt(hex[2], 16);
            return classifyIpv4([(high >> 8) & 255, high & 255, (low >> 8) & 255, low & 255]);
        }
    }
    const v4 = octetsOf(text);
    if (v4 !== undefined)
        return classifyIpv4(v4);
    return classifyIpv6(text);
}
/** 硬拒档（无豁免）：链路本地 / 云元数据 / 保留段。 */
export function isHardBlockedTier(tier) {
    return tier === 'link-local' || tier === 'metadata' || tier === 'other';
}
/** 错误文案里给地址的档位说个人话。 */
export function tierText(tier) {
    if (tier === 'link-local')
        return '链路本地地址';
    if (tier === 'metadata')
        return '云元数据地址';
    if (tier === 'other')
        return '保留 / 组播地址';
    if (tier === 'public')
        return '公网地址';
    if (tier === 'loopback')
        return '回环地址';
    return '私网地址';
}
/** 去掉地址里的 user:pass：错误文案与日志里都不该出现密码。 */
export function sanitizeUrl(raw) {
    try {
        const parsed = new URL(raw);
        if (parsed.username !== '' || parsed.password !== '') {
            parsed.username = '';
            parsed.password = '';
            return parsed.href;
        }
        return raw;
    }
    catch {
        return raw;
    }
}
/**
 * 解析主机名 → 地址清单。字面量与 localhost / *.localhost **不打 DNS**（RFC 6761 保留，
 * 也顺带让用例不必碰真解析器）。
 */
export async function resolveHost(hostname, options) {
    const host = hostname.trim().toLowerCase().replace(/[.]$/u, '');
    if (host === '')
        return [];
    if (host === 'localhost' || host.endsWith('.localhost'))
        return ['127.0.0.1'];
    if (isIpLiteral(host))
        return [host];
    const lookupImpl = options.lookupImpl === undefined ? defaultLookup : options.lookupImpl;
    const timeoutMs = options.lookupTimeoutMs === undefined ? NET_LOOKUP_TIMEOUT_MS : options.lookupTimeoutMs;
    let timer;
    try {
        return await Promise.race([
            lookupImpl(host),
            new Promise((_resolve, reject) => {
                timer = setTimeout(() => {
                    reject(new Error('解析超时（>' + String(timeoutMs) + 'ms）'));
                }, timeoutMs);
                timer.unref?.();
            }),
        ]);
    }
    finally {
        if (timer !== undefined)
            clearTimeout(timer);
    }
}
/**
 * 出站前的判据：解析 → 分档 → 逐条过。
 *
 * **抛错即不放行**，且错误里必须说清「打到哪个地址、为什么不行、下一步改什么」——
 * 这条文案会原样出现在设置卡片与 agent 工具返回值里。
 */
export async function assertReachable(url, options) {
    const shown = sanitizeUrl(url);
    let parsed;
    try {
        parsed = new URL(url);
    }
    catch {
        throw new FenceError('transport', options.label + ' 地址不是合法 URL：' + shown, shown);
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new FenceError('blocked_address', options.label + ' 只支持 http / https 的来源地址：' + shown, shown);
    }
    const host = parsed.hostname;
    let addresses;
    try {
        addresses = await resolveHost(host, options);
    }
    catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new FenceError('dns_failed', options.label + ' 域名解析失败：' + host + '（' + detail + '）', shown);
    }
    if (addresses.length === 0) {
        throw new FenceError('dns_failed', options.label + ' 域名没有解析出任何地址：' + host, shown);
    }
    const tiers = addresses.map((address) => classifyAddress(address));
    for (let index = 0; index < addresses.length; index += 1) {
        const tier = tiers[index];
        const address = addresses[index];
        if (isHardBlockedTier(tier)) {
            throw new FenceError('blocked_address', options.label + ' 出站围栏拦下了 ' + host + '：它解析到' + tierText(tier) + ' ' + address
                + '（链路本地 / 云元数据是明列的非目标，没有豁免；'
                + '要访问这类地址请换成可达的内网 / 回环地址）', shown);
        }
        // 公网档**不拦**（常规做法，见文件头）：只有硬拒档在本层的射程内
    }
    return { url: shown, host, addresses, tiers };
}
/**
 * 读响应体，**边读边数**：超限就掐断连接并报 too_large（不静默截断成半份 JSON）。
 *
 * 对**响应对象形状**刻意宽容（`headers` / `body` 都可能缺）：
 *   - 本仓用例会喂只带 `text()` 的轻量桩；
 *   - 某些 fetch 实现 / polyfill 不暴露 `body` 流。
 * 缺什么就退回能用的那条路，但**上限判定一条不少**——保护不能因为形状不同而失效。
 */
async function readCapped(response, maxBytes, label, shown) {
    const declared = response.headers?.get?.('content-length') ?? null;
    if (declared !== null && Number(declared) > maxBytes) {
        try {
            await response.body?.cancel();
        }
        catch {
            /* 取消失败不阻塞报错 */
        }
        throw new FenceError('too_large', label + ' 响应体 ' + declared + ' 字节，超过上限 ' + String(maxBytes) + '：' + shown, shown);
    }
    const stream = response.body ?? null;
    /*
     * 没有可读流（`body === null`）时的两条分支，**顺序很重要**：
     *
     *   1. 没有 `text()` 方法 → 真的没内容，返回空串（204 之类）；
     *   2. 有 `text()` → 用它读，**但读完再按 maxBytes 判一次**。
     *
     * 为什么不能只看 `body`：本仓的用例（以及一些非标准 fetch 实现）会返回一个
     * 只带 `text()` 的轻量响应对象。2026-10-19 把围栏上收到 kit 之后，rss 的 stub
     * 正是这种形态——如果这里直接 `return ''`，feed 会解析出 0 条、表现为「订阅源
     * 全是空的」，而不是一个显眼的报错。用 `text()` 兜底并**补上上限判定**，既不
     * 破坏这些调用方，也不让「响应体无上限」那条保护在有 `text()` 时失效。
     */
    if (stream === null) {
        if (typeof response.text !== 'function')
            return '';
        const fallback = await response.text();
        // 按 UTF-8 字节数判（与流式分支同一口径：中文 / emoji 一个字节能占 3–4 字节）
        const bytes = Buffer.byteLength(fallback, 'utf8');
        if (bytes > maxBytes) {
            throw new FenceError('too_large', label + ' 响应体 ' + String(bytes) + ' 字节，超过上限 ' + String(maxBytes) + '（' + shown + '）', shown);
        }
        return fallback;
    }
    const reader = stream.getReader();
    const chunks = [];
    let total = 0;
    try {
        for (;;) {
            const step = await reader.read();
            if (step.done === true)
                break;
            const value = step.value;
            if (value === undefined)
                continue;
            total += value.byteLength;
            if (total > maxBytes) {
                try {
                    await reader.cancel();
                }
                catch {
                    /* 同上 */
                }
                throw new FenceError('too_large', label + ' 响应体超过上限 ' + String(maxBytes) + ' 字节：请缩小请求范围或把上限调小（' + shown + '）', shown);
            }
            chunks.push(value);
        }
    }
    finally {
        try {
            reader.releaseLock();
        }
        catch {
            /* 已取消时释放会抛，忽略 */
        }
    }
    return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString('utf8');
}
function isAbort(error) {
    if (!(error instanceof Error))
        return false;
    return error.name === 'AbortError' || error.name === 'TimeoutError';
}
/**
 * 一次出站 JSON 请求：围栏 → 不跟随重定向 → 超时 → 体积上限 → 原样回响应。
 *
 * **非 2xx 不在这里抛**：调用方常常要读失败响应的 body（游标过期、错误详情就在里面），
 * 所以这一层把 status / text / body 原样交出去，由调用方决定抛什么、算什么码。
 * 这一层抛的只有「请求根本没打成 / 打成了但形状不能要」那几件事。
 */
export async function requestJson(options) {
    const timeoutMs = options.timeoutMs === undefined ? NET_DEFAULT_TIMEOUT_MS : options.timeoutMs;
    const maxBytes = options.maxBytes === undefined ? NET_MAX_RESPONSE_BYTES : options.maxBytes;
    const verdict = await assertReachable(options.url, options);
    const controller = new AbortController();
    const timer = setTimeout(() => { controller.abort(); }, timeoutMs);
    let response;
    let text;
    try {
        response = await options.fetchImpl(options.url, { ...options.init, redirect: 'manual', signal: controller.signal });
        if (REDIRECT_STATUSES.has(response.status)) {
            const location = response.headers?.get?.('location') ?? null;
            try {
                await response.body?.cancel();
            }
            catch {
                /* 忽略 */
            }
            throw new FenceError('redirect', options.label + ' 来源回了 ' + String(response.status) + ' 重定向到 '
                + (location === null ? '（没给 Location）' : sanitizeUrl(location))
                + '：**不跟随重定向**（一次 302 就能绕过来源白名单），请把地址直接改成最终地址', verdict.url);
        }
        text = await readCapped(response, maxBytes, options.label + ' ', verdict.url);
    }
    catch (error) {
        if (error instanceof FenceError)
            throw error;
        if (isAbort(error)) {
            throw new FenceError('timeout', options.label + ' 请求超时（>' + String(timeoutMs) + 'ms）：' + verdict.url, verdict.url);
        }
        // transport 报错来自 fetch 实现本身，它的 message 里可能带**原始 URL**（含 user:pass）。
        // 实测 undici：`Request cannot be constructed from a URL that includes credentials: http://user:secret@…`。
        // 所以整条 message 过一遍 sanitizeUrl，再去掉可能残留的裸凭据片段。
        throw new FenceError('transport', options.label + ' 请求失败：' + sanitizeErrorMessage(error, verdict.url), verdict.url);
    }
    finally {
        clearTimeout(timer);
    }
    let body;
    try {
        body = JSON.parse(text);
    }
    catch {
        body = undefined;
    }
    return { ok: response.ok, status: response.status, text, body };
}
/**
 * 把底层传输错误洗成不含凭据的一句话。
 *
 * 为什么需要：`FenceError.url` 已经是脱敏的，但**message** 是从底层异常原样拼进来的——
 * undici 的凭据拒绝、DNS 错误、TLS 错误都可能把完整 URL（含 `user:pass@`）写进 message。
 * 这条 message 会进 `/config` 的 `error` 字段、`loglens_sources` 的工具输出、以及设置卡片，
 * 也就是会到浏览器和模型手里（2026-10-19 外部测评 issue #13 第 9 条）。
 *
 * 做法：① 把 message 里出现的 URL 逐个过 `sanitizeUrl`；② 兜底再抹一遍 `//user:pass@` 形态
 * （有些实现只吐 authority、不带 scheme，`new URL` 解析不了）。
 */
export function sanitizeErrorMessage(error, fallbackUrl) {
    const raw = error instanceof Error ? error.message : String(error);
    // ① 带 scheme 的 URL：交给 sanitizeUrl（它认得 user:pass）
    let text = raw.replace(/[a-z][a-z0-9+.-]*:\/\/[^\s'"，。）)]+/giu, (matched) => sanitizeUrl(matched));
    // ② 没有 scheme 的 authority（`//user:pass@host`）：直接抹掉凭据段
    text = text.replace(/\/\/[^\s/@]+:[^\s/@]+@/gu, '//');
    return text === '' ? fallbackUrl : text;
}
//# sourceMappingURL=net-fence.js.map