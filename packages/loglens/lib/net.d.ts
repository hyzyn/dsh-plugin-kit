/** 地址分档：判据只认这几档，错误文案与放行面都挂在档位上。 */
export type AddressTier = 'loopback' | 'private' | 'link-local' | 'metadata' | 'public' | 'other';
/** 响应体上限（字节）。日志行可以很大，但一份 8 MiB 的 JSON 已经超出「查日志」的语义了。 */
export declare const NET_MAX_RESPONSE_BYTES: number;
/** 单次请求默认超时；两个适配器各有各的口径，这是兜底值。 */
export declare const NET_DEFAULT_TIMEOUT_MS = 20000;
/** 域名解析的超时：解析卡住不该把一次查询也跟着卡住。 */
export declare const NET_LOOKUP_TIMEOUT_MS = 2000;
/** 失败分档：路由与工具**按码**给下一步建议，不去匹配文案。 */
export type NetErrorCode = 'blocked_address' | 'dns_failed' | 'redirect' | 'too_large' | 'timeout' | 'transport';
export declare class LoglensNetError extends Error {
    readonly code: NetErrorCode;
    /** 已去掉凭据的地址（错误文案里**不该出现密码**）。 */
    readonly url: string;
    constructor(code: NetErrorCode, message: string, url: string);
}
/** 解析器注入点：用例喂假解析结果（DNS rebinding 那几条判据只有注入了才能写）。 */
export type LookupFn = (host: string) => Promise<string[]>;
/** 默认解析器：一次拿全（A + AAAA），交给上面的判据逐条过。 */
export declare const defaultLookup: LookupFn;
/**
 * 这是不是一个 IP 字面量（而不是主机名）。
 *
 * 不用自己解析各种怪写法：**WHATWG URL 已经把 IPv4 的十六进制 / 八进制 / 少段形态归一成点分四段**
 * （实测 http://0x7f.0.0.1:3100 → 127.0.0.1、http://2130706433/ → 127.0.0.1），
 * 所以这里只要认「点分四段」与「带冒号的 IPv6」两种形态。
 */
export declare function isIpLiteral(host: string): boolean;
/**
 * 地址分档。IPv4-mapped IPv6 要**还原成 IPv4 再判**：::ffff:169.254.169.254 与
 * 169.254.169.254 是同一个地址，而 URL 会把前者归一成 ::ffff:a9fe:a9fe（实测），
 * 所以两种写法（点分 / 十六进制）都得认。
 */
export declare function classifyAddress(address: string): AddressTier;
/** 硬拒档（无豁免）：链路本地 / 云元数据 / 保留段。 */
export declare function isHardBlockedTier(tier: AddressTier): boolean;
/** 错误文案里给地址的档位说个人话。 */
export declare function tierText(tier: AddressTier): string;
/** 去掉地址里的 user:pass：错误文案与日志里都不该出现密码。 */
export declare function sanitizeUrl(raw: string): string;
export interface FenceOptions {
    /** 前缀（'[loki]' / '[es]'）：文案与两个适配器的既有前缀一致。 */
    label: string;
    /** 解析器注入点（用例）；缺省走 node:dns。 */
    lookupImpl?: LookupFn;
    lookupTimeoutMs?: number;
}
/**
 * 解析主机名 → 地址清单。字面量与 localhost / *.localhost **不打 DNS**（RFC 6761 保留，
 * 也顺带让用例不必碰真解析器）。
 */
export declare function resolveHost(hostname: string, options: FenceOptions): Promise<string[]>;
export interface FenceVerdict {
    /** 已去凭据的地址（给文案用）。 */
    url: string;
    host: string;
    addresses: string[];
    tiers: AddressTier[];
}
/**
 * 出站前的判据：解析 → 分档 → 逐条过。
 *
 * **抛错即不放行**，且错误里必须说清「打到哪个地址、为什么不行、下一步改什么」——
 * 这条文案会原样出现在设置卡片与 agent 工具返回值里。
 */
export declare function assertReachable(url: string, options: FenceOptions): Promise<FenceVerdict>;
export interface NetRequestOptions extends FenceOptions {
    fetchImpl: typeof fetch;
    url: string;
    init?: RequestInit;
    timeoutMs?: number;
    maxBytes?: number;
}
export interface NetResponse {
    ok: boolean;
    status: number;
    text: string;
    /** 解析成功才是对象；不是 JSON 时 undefined（由适配器决定怎么报）。 */
    body: unknown;
}
/**
 * 一次出站 JSON 请求：围栏 → 不跟随重定向 → 超时 → 体积上限 → 原样回响应。
 *
 * **非 2xx 不在这里抛**：ES 的失败响应是要读 body 的（游标过期的判定就在里面），
 * 所以这一层把 status / text / body 原样交给适配器，由它决定抛什么、算什么码。
 * 这一层抛的只有「请求根本没打成 / 打成了但形状不能要」那几件事。
 */
export declare function requestJson(options: NetRequestOptions): Promise<NetResponse>;
