/**
 * @hyzyn/dsh-loglens — 客户端半体的纯逻辑。
 *
 * 这里只放「判对错」的部分：草稿的合法性判定与提交载荷。DOM / React / fetch 都不进来，
 * 于是它能被 vitest 锁住（conventions 的客户端半体规矩 ②：要判对错的逻辑留在组件闭包里
 * 等于没有测试入口）。插件之间不许互相 import，所以类型清单在这里有一份对偶——宿主侧
 * 那份在 src/config.ts，两边漂了会在真机验收里露出来。
 */

/** 支持的类型（与宿主 src/config.ts 的 SOURCE_KINDS 对齐）。 */
const KIND_OPTIONS = ['loki', 'elasticsearch', 'opensearch', 'docker']
const DEFAULT_KIND = 'loki'

/** 类型下拉的选项（返回副本：调用方改了它不该影响本模块）。 */
export function kindOptions() {
  return KIND_OPTIONS.slice()
}

/** 新行的草稿：id 为空表示「还没落盘」，提交走 targets.add。 */
export function emptyDraft() {
  return { id: '', kind: DEFAULT_KIND, label: '', url: '' }
}

/** 把宿主返回的一条来源还原成草稿（缺字段一律补成空串，界面里不出现 undefined）。 */
export function draftFromTarget(target) {
  const row = target == null ? {} : target
  return {
    id: typeof row.id === 'string' ? row.id : '',
    kind: KIND_OPTIONS.indexOf(row.kind) === -1 ? DEFAULT_KIND : row.kind,
    label: typeof row.label === 'string' ? row.label : '',
    url: typeof row.url === 'string' ? row.url : '',
  }
}

/**
 * 草稿能不能提交：空串表示可以，否则是 i18n 键名的后缀（badKind / needUrl / badUrl）。
 *
 * 判据与宿主 src/config.ts 对齐：地址要 http / https 的绝对地址；docker 是采集来源，
 * 地址可以留空。这里只做**即时反馈**，真正的判据与围栏都在宿主——所以链路本地地址
 * 刻意不在这层拦（宿主会带原因回 400，界面直接显示那句话）。
 */
export function draftProblem(draft) {
  if (KIND_OPTIONS.indexOf(draft.kind) === -1) return 'badKind'
  if (draft.kind === 'docker') return ''
  const url = String(draft.url == null ? '' : draft.url).trim()
  if (url === '') return 'needUrl'
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    return 'badUrl'
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return 'badUrl'
  return ''
}

/** 提交载荷：只发这三列（新建时 id 由宿主生成；改判时 id 走请求的 id 字段）。 */
export function draftPayload(draft) {
  return {
    kind: draft.kind,
    label: String(draft.label == null ? '' : draft.label).trim(),
    url: String(draft.url == null ? '' : draft.url).trim(),
  }
}
