/**
 * @hyzyn/dsh-loglens — 出站围栏的**再导出**（实现已上收到 `@hyzyn/dsh-kit`）。
 *
 * 这个文件原来装着整套实现（地址分档、DNS 解析、不跟随重定向、体积与超时上限）。
 * 2026-10-19 出现**第二个消费者**——`@hyzyn/dsh-rss` 也要抓外部地址，而它此前只有
 * `new URL()` 一层校验、`redirect:'follow'` 默认跟随跳转（外部测评 issue #13 第 6 条）。
 * 设计 §4.1 当初就写明「第二个消费者出现时上收到 kit」，于是实现搬去
 * `packages/kit/src/net-fence.ts`，这里只保留 re-export：
 *
 *   - 两个包共用**同一份**判据，不会再出现「一边拦了、一边没拦」的漂移；
 *   - 本包的适配器与用例不用改 import 路径（`LoglensNetError` 是 `FenceError` 的别名，
 *     `instanceof` 照样成立）。
 *
 * 判据与分寸的正文在 kit 那份文件头里，**不要在这里再抄一遍**。
 *
 * 本文件里**本包自己的**只有错误面的人话层（渐进披露 T8）：`httpFailureHint`（HTTP 状态 →
 * 下一步）与 `requestJsonWithHint`（连接面失败 → 下一步）。kit 的文案不动——它是共享层，
 * loglens 特有的措辞落在 loglens 的地盘上。
 */
export {
  NET_DEFAULT_TIMEOUT_MS,
  NET_LOOKUP_TIMEOUT_MS,
  NET_MAX_RESPONSE_BYTES,
  assertReachable,
  classifyAddress,
  defaultLookup,
  isHardBlockedTier,
  isIpLiteral,
  requestJson,
  resolveHost,
  sanitizeErrorMessage,
  sanitizeUrl,
  tierText,
} from '@hyzyn/dsh-kit'
export type {
  AddressTier,
  FenceOptions,
  FenceVerdict,
  LookupFn,
  NetErrorCode,
  NetRequestOptions,
  NetResponse,
} from '@hyzyn/dsh-kit'
import { FenceError, requestJson as requestJsonImpl } from '@hyzyn/dsh-kit'
import type { NetResponse } from '@hyzyn/dsh-kit'
export { FenceError as LoglensNetError } from '@hyzyn/dsh-kit'

/**
 * HTTP 状态 → 一句可执行的下一步（渐进披露 T8，2026-10-24）。
 *
 * 两个适配器抛「HTTP <status>：<正文>」时把这句缀在后面：状态码本身不告诉模型该改哪里，
 * 而 401 / 403 / 404 的下一步是稳定的（凭据或权限 / 索引或路径）。其余状态**不加**——
 * 5xx 是后端自己的故障，硬指一个「检查配置」的方向等于把锅甩给配置（ES 侧 404 里的
 * 游标过期由 looksLikeExpiredCursor 在上层转成 truncation，不会被这句污染）。
 */
export function httpFailureHint(status: number): string {
  if (status === 401 || status === 403) return '（凭据或权限对不上：检查来源地址里的用户名密码 / API Key 与账号权限）'
  if (status === 404) return '（404：索引或路径不对——检查来源地址与索引表达式）'
  return ''
}

/**
 * 连接面失败（transport / dns_failed）→ 缀一句「地址与网络是否可达」（渐进披露 T8）。
 *
 * kit 的 FenceError 文案不动（那是共享层）：两个适配器的 callJson 在 fetchJson 外接这一层，
 * 把「请求失败：<原始错误>」补上模型能照着做的下一步。其余 code 的文案自己已带方向
 * （redirect 回显地址、timeout 报了时长、too_large 报了上限、blocked_address 说明了档位），不缀。
 */
export function withConnectionHint(error: unknown): unknown {
  if (error instanceof FenceError && (error.code === 'transport' || error.code === 'dns_failed')) {
    return new FenceError(error.code, error.message + '（先确认来源地址与网络是否可达）', error.url)
  }
  return error
}

/**
 * 「fetch 一次 + 连接面补下一步」合起来，两个适配器的 callJson 共用（渐进披露 T8）。
 * 收一层的理由与全仓其他判据一样：两处各写一遍 try/catch 就会漂。
 */
export async function requestJsonWithHint(options: Parameters<typeof requestJsonImpl>[0]): Promise<NetResponse> {
  try {
    return await requestJsonImpl(options)
  } catch (error) {
    throw withConnectionHint(error)
  }
}
