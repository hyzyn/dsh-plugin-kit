/**
 * @hyzyn/dsh-loglens — 出站围栏（本仓第一个），设计 §4.1 的唯一实现处。
 *
 * 为什么需要它：来源清单是**用户显式添加**的白名单，浏览器侧只传来源 id、永不传 URL；
 * 但「加了一个地址」不等于「打出去是安全的」，三条现实路径都能绕过白名单：
 *   1. **重定向**：fetch 默认 redirect:'follow'，来源回一个 302 就把请求带到 169.254.169.254；
 *   2. **主机名**：用户填域名 / 别名（内网 DNS 名、/etc/hosts 里的别名），字面量校验看不到它解析出来的 IP；
 *   3. **响应体无上限**：response.text() 对面给多少读多少（也就能把宿主的堆吃光）。
 * 所以判据是「**解析之后的 IP**」，而不是 URL 字符串——这是设计 §4.1 明写的那一句。
 *
 * 产品语义（同样出自 §4.1，明写在此以免日后被「顺手放宽」）：
 *   - **回环与私网是允许面**（否则这个插件没有用法：Loki / ES 多数就装在内网与本机）；
 *   - **链路本地 / 云元数据一律拒，且无豁免**（169.254.169.254 这类地址能换出云凭据，
 *     是这套东西里唯一真正危险的一面）；
 *   - **公网默认拒**：本插件的定位是内网日志；确实要打托管日志服务（Elastic Cloud 之类）
 *     的来源要在配置里显式打开 allowPublic。
 *
 * 三条分寸（别把这一层当成完整的 SSRF 防护）：
 *   - 判定在 dns.lookup **之后**、真正建连**之前**：两步之间 DNS 翻脸（rebinding）仍有窗口。
 *     来源地址是操作者自己填的，本层的活是挡事故与过期的名字，不是对抗一个持有域名的对手；
 *   - **不跟随重定向**：redirect:'manual' 把 3xx 直接当失败，并回显 Location（便于改地址）；
 *   - 一个主机名解析出**多个**地址时**每一个都要过判据**：客户端会挑一个打（Happy Eyeballs），
 *     只看第一个等于没看。
 *
 * 上游不要把这一层当成「kit 的替代品」：设计 §4.1 记着「第二个消费者出现时上收到 kit」——
 * 当前消费者是 loglens 的两个适配器（Loki / ES+OS），仍在同一个包内，所以先落在包里。
 */
import { lookup as dnsLookup } from 'node:dns/promises';
/** 响应体上限（字节）。日志行可以很大，但一份 8 MiB 的 JSON 已经超出「查日志」的语义了。 */
export const NET_MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
/** 单次请求默认超时；两个适配器各有各的口径，这是兜底值。 */
export const NET_DEFAULT_TIMEOUT_MS = 20_000;
/** 域名解析的超时：解析卡住不该把一次查询也跟着卡住。 */
export const NET_LOOKUP_TIMEOUT_MS = 2_000;
export class LoglensNetError extends Error {
    code;
    /** 已去掉凭据的地址（错误文案里**不该出现密码**）。 */
    url;
    constructor(code, message, url) {
        super(message);
        this.name = 'LoglensNetError';
        this.code = code;
        this.url = url;
    }
}
const IPV4 = /^(\d{1,3})[.](\d{1,3})[.](\d{1,3})[.](\d{1,3})$/u;
const IPV6_TAIL = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/u;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
/** 默认解析器：一次拿全（A + AAAA），交给上面的判据逐条过。 */
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
        throw new LoglensNetError('transport', options.label + ' 地址不是合法 URL：' + shown, shown);
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new LoglensNetError('blocked_address', options.label + ' 只支持 http / https 的来源地址：' + shown, shown);
    }
    const host = parsed.hostname;
    let addresses;
    try {
        addresses = await resolveHost(host, options);
    }
    catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new LoglensNetError('dns_failed', options.label + ' 域名解析失败：' + host + '（' + detail + '）', shown);
    }
    if (addresses.length === 0) {
        throw new LoglensNetError('dns_failed', options.label + ' 域名没有解析出任何地址：' + host, shown);
    }
    const tiers = addresses.map((address) => classifyAddress(address));
    for (let index = 0; index < addresses.length; index += 1) {
        const tier = tiers[index];
        const address = addresses[index];
        if (isHardBlockedTier(tier)) {
            throw new LoglensNetError('blocked_address', options.label + ' 出站围栏拦下了 ' + host + '：它解析到' + tierText(tier) + ' ' + address
                + '（链路本地 / 云元数据是设计 §4.1 明列的非目标，没有豁免；'
                + '要查这类地址请把来源换成可达的内网 / 回环地址）', shown);
        }
        if (tier === 'public' && options.allowPublic !== true) {
            throw new LoglensNetError('public_address', options.label + ' 出站围栏拦下了 ' + host + '：它解析到公网地址 ' + address
                + '。本插件默认只打回环与私网地址（RFC 1918 / CGNAT：10/8、172.16/12、192.168/16、100.64/10）。'
                + '两种情况下打开这条来源的「允许公网地址」（allowPublic）即可放行：'
                + '① 服务装在公网（托管日志服务）；'
                + '② **内网用了非 RFC 1918 网段**——这不罕见（实测就有内网日志服务器落在 172.172/16 这类'
                + '公网段上的环境），此时「公网段」只是地址分类，流量并没有出内网', shown);
        }
    }
    return { url: shown, host, addresses, tiers };
}
/** 读响应体，**边读边数**：超限就掐断连接并报 too_large（不静默截断成半份 JSON）。 */
async function readCapped(response, maxBytes, label, shown) {
    const declared = response.headers.get('content-length');
    if (declared !== null && Number(declared) > maxBytes) {
        try {
            await response.body?.cancel();
        }
        catch {
            /* 取消失败不阻塞报错 */
        }
        throw new LoglensNetError('too_large', label + ' 响应体 ' + declared + ' 字节，超过上限 ' + String(maxBytes) + '：' + shown, shown);
    }
    const stream = response.body;
    if (stream === null)
        return '';
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
                throw new LoglensNetError('too_large', label + ' 响应体超过上限 ' + String(maxBytes) + ' 字节：请缩小时间窗或把 limit 调小（' + shown + '）', shown);
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
 * **非 2xx 不在这里抛**：ES 的失败响应是要读 body 的（游标过期的判定就在里面），
 * 所以这一层把 status / text / body 原样交给适配器，由它决定抛什么、算什么码。
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
            const location = response.headers.get('location');
            try {
                await response.body?.cancel();
            }
            catch {
                /* 忽略 */
            }
            throw new LoglensNetError('redirect', options.label + ' 来源回了 ' + String(response.status) + ' 重定向到 '
                + (location === null ? '（没给 Location）' : sanitizeUrl(location))
                + '：本插件**不跟随重定向**（一次 302 就能绕过来源白名单），请把地址直接改成最终地址', verdict.url);
        }
        text = await readCapped(response, maxBytes, options.label + ' ', verdict.url);
    }
    catch (error) {
        if (error instanceof LoglensNetError)
            throw error;
        if (isAbort(error)) {
            throw new LoglensNetError('timeout', options.label + ' 请求超时（>' + String(timeoutMs) + 'ms）：' + verdict.url, verdict.url);
        }
        throw new LoglensNetError('transport', options.label + ' 请求失败：' + (error instanceof Error ? error.message : String(error)), verdict.url);
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
//# sourceMappingURL=net.js.map