/* eslint-disable */
/**
 * @hyzyn/dsh-codegraph — 浏览器半体里**与 DOM / React 无关**的纯逻辑。
 *
 * 为什么单独成文件：这几段判定（CG11 索引可信度、CG15 重试退避、CG17 截断计数）
 * 原先都是 React 组件闭包里的私有实现，只能靠「真渲染到那条分支」才发现写错；
 * 而仓库的测试底座（vitest.config.ts）刻意只收宿主半体，浏览器半体一个测试都没有
 * （codegraph/DEFECTS.md「验收记录」里点名的最大覆盖空洞）。抽到这里之后它们是
 * 可直接 import 的纯函数，进 vitest（test/client-pure.test.ts）。
 *
 * **不进 package.json 的 files、也不是运行时依赖**：scripts/build-client.mjs 去掉本
 * 文件的 `export` 前缀后，把整段内联进 client-src/index.js 的 factory 体内（放 factory
 * 里而不是文件顶层，是为了页面重载 / HMR 再次执行同一份 client.js 时不重声明报错）。
 * 产物仍是单文件、无 import 的 client.js，CG28 的「产物 = 源码」artifact-diff 闸不变。
 */

/** 关系列表一次最多渲染多少条（CG17：超出时给截断计数，不再静默丢）。 */
export const REL_LIMIT = 30

/**
 * CG11：索引「可信吗」的判定。CLI 的 status --json 里躺着四个可用性字段
 * （本机 1.6.0 实测）：index.reindexRecommended、index.builtWithVersion（对
 * version）、builtWithExtractionVersion（对 currentExtractionVersion）、
 * worktreeMismatch。CLI 明说「建议重建」时，卡片只报「● 已索引」而 MCP 继续给
 * 旧提取器产出的图——这是最容易被当成「codegraph 结果不准」的那类状态。字段
 * 位置随 CLI 版本可能有顶层 / 嵌套差异，两处都读。
 */
export function staleReasons(status) {
  if (!status || typeof status !== 'object') return []
  const meta = status.index && typeof status.index === 'object' ? status.index : {}
  const reasons = []
  if (status.reindexRecommended === true || meta.reindexRecommended === true) {
    reasons.push('CLI 建议重建索引（reindexRecommended）')
  }
  const builtWith = meta.builtWithVersion ?? status.builtWithVersion
  if (typeof builtWith === 'string' && builtWith !== '' && typeof status.version === 'string' && builtWith !== status.version) {
    reasons.push('索引由 CLI ' + builtWith + ' 构建，当前 CLI 是 ' + status.version)
  }
  const builtExtraction = meta.builtWithExtractionVersion ?? status.builtWithExtractionVersion
  const currentExtraction = meta.currentExtractionVersion ?? status.currentExtractionVersion
  if (typeof builtExtraction === 'number' && typeof currentExtraction === 'number' && builtExtraction < currentExtraction) {
    reasons.push('索引的提取器版本 ' + builtExtraction + ' 已落后于当前的 ' + currentExtraction)
  }
  if (status.worktreeMismatch === true || meta.worktreeMismatch === true) {
    reasons.push('索引与当前 worktree 不匹配')
  }
  return reasons
}

/**
 * CG15：会话上报失败后**下一次**退避间隔（毫秒）。1s 起、每次翻倍、封顶 30s；
 * 传 0（上一次成功 / 首次失败）得到首档 1s。
 *
 * 抽出来的意义：这段是「退避」这条修复的全部判定，写错方向（比如忘了封顶或首档
 * 不是 1s）不会报错，只会让失败重试变成打爆宿主或永不重试。
 */
export function nextRetryDelayMs(current) {
  return current === 0 ? 1_000 : Math.min(current * 2, 30_000)
}

/**
 * CG17：关系列表的截断提示；未截断时返回 ''（调用方据此决定要不要渲染那一行）。
 * 以前是静默 slice(0, 30)——用户看到的是「就这么多」，真相是被截了。
 */
export function truncationNote(total, shown) {
  return total > shown ? '已显示前 ' + shown + ' 条，共 ' + total + ' 条' : ''
}
