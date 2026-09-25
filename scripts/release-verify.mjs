/**
 * `scripts/release-publish-tag.mjs` 发布后回查的**判定规则**（纯逻辑，I/O 留在调用方）。
 *
 * 为什么单独拆出来：这条规则是「publish 成功、回查却说没读到」这个反复出现的问题的**唯一出口**。
 * v0.1.39 / v0.1.41 / v0.1.44 三次发布都因为「读不到」就直接判红，每次都要人工删 tag 重打一遍
 * 才收场——而 `publish` 命令当时已经退出 0，registry 的传播延迟不由我们控制。
 *
 * 拆成纯函数是为了让 `scripts/test/release-verify.test.ts` 钉住三种出口的分界，拦住两种漂法：
 *
 *   ① **改回无条件判红**：把 `unconfirmed` 当失败 → 假失败复活（就是当初那个 bug）；
 *   ② **删掉牙齿**：把 `failed` 也降级成 warning → 回查再也拦不住「publish 悄悄没落地」；
 *   ③ **对字段类型不设防**：`Date.parse` 会把数字 ToString（`12345` → 年份 12345 → 远超发布
 *      起点），于是 `modified` 被改成 epoch 数字这类格式漂移会伪装成「文档很新」→ 误判 `failed`。
 *
 * 三种都会让这条防线白给，而它平时不出声，漂了没人会发现。
 */

/**
 * 回查窗口耗尽后，用整份 packument（权威文档）做一次判定。
 *
 * 三种出口：
 *   - `verified`    文档里有这个版本（`versions[version]` 或 `time[version]`）→ 确实发出去了，
 *                   只是 tag 端点还没跟上；
 *   - `failed`      文档**已刷新到本次发布起点之后**、却仍没有这个版本 → 发布确实没落地；
 *   - `unconfirmed` 文档读不到，或文档最后刷新早于本次发布起点（还是陈旧副本）→ 无法判定。
 *
 * `unconfirmed` 不判红是**刻意的**：能拿到的证据不足以证明「没发出去」，而 publish 命令
 * 已经退出 0；凭「读不到」判红只会制造假失败（见文件头）。
 *
 * @param {{ version: string, startedMs: number, doc: unknown }} input
 *   `startedMs` 是本次 publish 命令启动的时刻（本地时钟）；比较用 `>=`，时钟偏快只会落到
 *   `unconfirmed`（安全侧），不会误判成 `failed`。
 * @returns {{ verdict: 'verified' | 'failed' | 'unconfirmed', reason: string }}
 */
export function judgeAfterWindow({ version, startedMs, doc }) {
  if (!doc || typeof doc !== 'object') return { verdict: 'unconfirmed', reason: 'doc-unreadable' }
  // time[version] 是「这个版本何时被写进 registry」，它存在就足以证明发布落地（哪怕 versions 表没跟上）
  if (doc.versions?.[version] || doc.time?.[version]) {
    return { verdict: 'verified', reason: 'doc-confirms-version' }
  }
  const modified = doc.time?.modified
  // 必须是非空字符串才认：`Date.parse` 会把数字 ToString（`12345` → 年份 12345 → 远超发布起点），
  // 于是「字段类型变了」会伪装成「文档很新」→ 误判成 failed（③ 号漂法，见文件头）
  const modifiedMs = typeof modified === 'string' && modified !== '' ? Date.parse(modified) : NaN
  // 解析不出来（缺失 / 类型不对 / 格式变了）视同「拿不到新鲜度证据」，走安全侧
  if (!Number.isFinite(modifiedMs) || modifiedMs < startedMs) {
    return { verdict: 'unconfirmed', reason: 'doc-stale' }
  }
  return { verdict: 'failed', reason: 'doc-fresh-without-version' }
}