/**
 * @hyzyn/dsh-tty — SFTP 下载的**断点续传决策**（纯逻辑）。
 *
 * 为什么单独成文件：宿主侧的 `openDownload(spec, path, { offset })` 从 0.19.0 起就支持
 * 从任意字节起读（agent 的 `sftp_read` 分页一直在用），但**面板没接**——浏览器下载一旦
 * 因网络抖动中断，已收到的那些字节就白扔了，用户只能整份重来。这是「能力已有、只差接线」
 * 的一档。
 *
 * 接线的关键是**什么时候值得续、从哪续**：这两点判错了比不续更糟——
 *   - 从 0 重来：大文件反复重试会把用户按在地上；
 *   - 从错的偏移续：拼出来的文件**悄悄是坏的**（比下载失败严重得多）。
 * 所以判定抽成纯函数，`test/sftp-resume.test.ts` 直接单测边界，而不是埋进浏览器半体
 * （埋进去就等于没有测试入口，本仓 D61 的教训）。
 *
 * 三条不续的硬边界（都在 `planResume` 里给理由，调用方只需照做）：
 *   1. **用户主动取消**不续——`✕` 的语义就是「不要了」，自动重试是无视用户意图；
 *   2. **没有进度**（received === 0）不续——从 0 续等于重来，没有意义；
 *   3. **重试用尽**不续——无限重试会把一次故障变成一场拉锯。
 *
 * 另外：**总量已知且已经收满**时不续（那不是断线，是调用方判错了终态）。
 */

/** 单次下载最多自动续传几次（0 = 每次都是首试，不重试）。 */
export const MAX_RESUME_ATTEMPTS = 3

/**
 * 判断一次下载失败后要不要接着续、从哪个字节续。
 *
 * @param {object} input
 * @param {number} input.received - 已经收到的字节数（含此前所有续传段）
 * @param {number|null} input.total - 文件总字节；未知传 null
 * @param {number} input.attempt - 这是第几次失败后的决策（1 = 首试失败）
 * @param {boolean} [input.canceled] - 是不是**用户主动取消**（取消一律不续）
 * @param {number} [input.maxAttempts] - 最多续几次
 * @returns {{ resume: true, offset: number } | { resume: false, reason: string }}
 */
export function planResume(input) {
  const received = Number(input?.received)
  const attempt = Number(input?.attempt)
  const maxAttempts = Number.isInteger(input?.maxAttempts) ? input.maxAttempts : MAX_RESUME_ATTEMPTS
  const total = input?.total === null || input?.total === undefined ? null : Number(input.total)
  if (input?.canceled === true) return { resume: false, reason: 'canceled' }
  if (!Number.isFinite(received) || received <= 0) return { resume: false, reason: 'noProgress' }
  if (!Number.isInteger(attempt) || attempt < 1) return { resume: false, reason: 'badAttempt' }
  if (attempt > maxAttempts) return { resume: false, reason: 'attemptsExhausted' }
  if (total !== null && Number.isFinite(total) && total > 0 && received >= total) {
    return { resume: false, reason: 'complete' }
  }
  return { resume: true, offset: received }
}

/**
 * 把「已收字节 + 新到的一块」拼成下一段的起点；`total` 未知（无 content-length）时
 * 按已收字节推进——服务端 206 的响应体就是剩余部分，累加即可。
 *
 * 单独抽出来的理由：续传最容易错的地方是**偏移的累加口径**（把本段长度当总量、
 * 或忘了加上此前的 received），而它在浏览器里只能靠真下载才看得出来。
 *
 * @param {number} receivedBefore - 本次续传前已收字节
 * @param {number} chunkLength - 本段新收到的字节
 * @returns {number} 新的已收字节
 */
export function advanceReceived(receivedBefore, chunkLength) {
  const base = Number.isFinite(Number(receivedBefore)) && Number(receivedBefore) > 0 ? Number(receivedBefore) : 0
  const add = Number.isFinite(Number(chunkLength)) && Number(chunkLength) > 0 ? Number(chunkLength) : 0
  return base + add
}
