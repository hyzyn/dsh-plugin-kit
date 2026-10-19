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
export { FenceError as LoglensNetError } from '@hyzyn/dsh-kit'
