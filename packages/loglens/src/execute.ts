/**
 * @hyzyn/dsh-loglens — 查询执行层（agent 工具与浏览器面板**共用**的那一段）。
 *
 * 为什么单独一层：同一份查询要从两条入口发起——agent 工具（`loglens_search`）与面板的
 * `POST /api/dsh-loglens/query`。两处各写一遍「怎么找来源 / 怎么夹取 / 怎么拼返回形状」就是两份
 * 会漂的真相源；这一层是唯一实现，工具与路由各自只加一层自己的东西（工具加渲染、路由加围栏）。
 */
import type { LoglensConfig, LoglensTarget, SourceKind } from './config.js'
import type { BackendCaps, FacetBucket, FacetsResult, LogBackend, LogCounts, LogLine, Truncation } from './backends/types.js'
import { CANONICAL_LEVELS, canonicalLevel, levelHint, levelMatches } from './line.js'
import type { CanonicalLevel } from './line.js'
import { normalizeQuery } from './query.js'

export interface ExecuteDeps {
  /** 当前生效的配置（宿主侧那一份，volatile 更新后跟着变）。 */
  config: () => LoglensConfig
  backendFor: (kind: SourceKind) => LogBackend | undefined
}

/** 没有适配器时的指路文案：说清「怎么绕」，而不是一句「不支持」。 */
export function adapterHint(kind: SourceKind): string {
  if (kind === 'docker') {
    return 'Docker 是采集来源（设计 §5 选项 0）：agent 侧请用现成的 docker_logs / docker_logs_grep——本插件刻意不包一层'
  }
  return '来源类型 ' + kind + ' 没有适配器（本插件支持 loki / elasticsearch / opensearch；Docker 走现成的 docker_logs）'
}

/** 按 id 或名称找来源；省略时只在「恰好一个来源」时回落。 */
export function resolveTarget(
  config: LoglensConfig,
  wanted: unknown,
): { ok: true; target: LoglensTarget } | { ok: false; error: string } {
  const targets = config.targets
  if (targets.length === 0) {
    return { ok: false, error: '还没有配置任何日志来源：请到「设置 → 插件配置 → 日志查询」加一个' }
  }
  if (wanted === undefined || wanted === null || wanted === '') {
    if (targets.length === 1) return { ok: true, target: targets[0] }
    return { ok: false, error: 'target 必填（有 ' + String(targets.length) + ' 个来源）：' + targets.map((target) => target.id).join(' / ') }
  }
  if (typeof wanted !== 'string') return { ok: false, error: 'target 必须是来源 id 或名称' }
  const key = wanted.trim().toLowerCase()
  const exact = targets.find((target) => target.id.toLowerCase() === key)
  if (exact !== undefined) return { ok: true, target: exact }
  const byLabel = targets.filter((target) => target.label.toLowerCase() === key)
  if (byLabel.length === 1) return { ok: true, target: byLabel[0] }
  if (byLabel.length > 1) {
    return { ok: false, error: '名称「' + wanted + '」对应多个来源，请改用 id：' + byLabel.map((target) => target.id).join(' / ') }
  }
  return { ok: false, error: '找不到来源「' + wanted + '」：现有 ' + targets.map((target) => target.id).join(' / ') }
}

/** 目标的自述（工具返回值与路由响应里统一用这一形状）。 */
export function describeTarget(target: LoglensTarget): { id: string; kind: string; label: string } {
  return { id: target.id, kind: target.kind, label: target.label }
}

/**
 * 一条来源的指路文案（P5 的 agent 侧交付物，P6 的面板也照用）。
 *
 * 三条都不是「说明文」，是**会出现在返回值里的判据**：
 *   - docker：选项 0 的替代路径（现成的 docker_logs / docker_logs_grep），本插件不包一层；
 *   - 声明了 pagination:'none' 的来源：被 limit 截断时只会报 hit_limit，得缩小时间窗
 *     （**当前没有来源走这条**——Loki 已在 2026-10-12 真机验收后翻成 'cursor'）；
 *   - ES / OpenSearch：分页走 PIT，游标有寿命，过期后要重新发起带时间窗的查询。
 *
 * **刻意不做**「探测 docker 插件在不在」：设计 §5 的「装了没装」判据是给**面板**用的（浏览器侧 registry
 * 存在性 + health），而宿主侧的工具注册表**没有公开的列举 API**（实测 @deepseek-ai/dsh-tools 0.1.2-rc.1
 * 的 ctx.tools 只有 register / restrict / guard）——猜一个私有字段去读，比不读更糟。
 */
export interface HintOptions {
  /** Docker 容器面板（@hyzyn/dsh-docker）装没装：判据见 src/plugins.ts（cordis 的 plugin registry）。 */
  dockerLoaded?: boolean
}

export function hintFor(kind: SourceKind, caps: BackendCaps | undefined, options: HintOptions = {}): string | undefined {
  if (kind === 'docker') {
    if (options.dockerLoaded === true) {
      return 'Docker 是采集来源（选项 0）：面板里可以直接看容器日志（走 Docker 面板插件自己的 /api/dsh-docker/logs）；'
        + 'agent 侧用现成的 docker_logs / docker_logs_grep——本插件不包一层'
    }
    return 'Docker 是采集来源（选项 0）：agent 侧用现成的 docker_logs / docker_logs_grep；'
      + '面板那条日志视图要「Docker 容器面板」插件（当前没检测到它）'
  }
  if (caps === undefined) return undefined
  if (caps.pagination === 'none') {
    return '这个来源目前不给游标：命中被 limit 截断时只报 hit_limit，请缩小时间窗分几次查'
  }
  if (caps.flavor === 'es' || caps.flavor === 'os') {
    return '分页走 PIT：游标有寿命，过期后要重新发起一次带时间窗的查询'
  }
  return undefined
}

/**
 * 一次查询的结果形状（工具与路由共用；路由直接把它序列化成 JSON）。
 *
 * 刻意写成 **type alias 而不是 interface**：接口没有隐式索引签名，赋给 Record<string, unknown>
 * （路由那边的签名）会被 TS 拒掉——这是本仓已经踩过一次的坑。
 */
export type SearchOutcome = {
  target: { id: string; kind: string; label: string }
  window: { from: number; to: number }
  returned: number
  counts: LogCounts
  truncation: Truncation
  lines: LogLine[]
  nextCursor?: string
  warnings: string[]
  hint?: string
  /** 生效的 level 过滤（只回显，便于调用方知道这一页被筛过；语义见 runSearch 的注释）。 */
  level?: string
}

/**
 * level 参数：归一化成 CanonicalLevel；认不出来就报错（**不猜**）。
 *
 * 语义是「**及以上**」：level=warn 得到 warn + error + fatal（日志查看器的通行口径）。
 * 行上没有级别**不算命中**——不能把「不知道」当成「是 error」。
 */
export function readLevel(value: unknown): { ok: true, level?: CanonicalLevel } | { ok: false, error: string } {
  if (value === undefined || value === null || value === '') return { ok: true }
  const level = canonicalLevel(value)
  if (level === undefined) {
    return { ok: false, error: 'level 只能是 ' + CANONICAL_LEVELS.join(' / ') + '（收到 ' + JSON.stringify(value) + '）' }
  }
  return { ok: true, level }
}

/** 查一次（抛错即失败，调用方把 message 回给对面：工具抛出去、路由回 400）。 */
export async function runSearch(deps: ExecuteDeps, input: Record<string, unknown>): Promise<SearchOutcome> {
  const picked = resolveTarget(deps.config(), input.target)
  if (!picked.ok) throw new Error(picked.error)
  const backend = deps.backendFor(picked.target.kind)
  if (backend === undefined) throw new Error(adapterHint(picked.target.kind))
  const caps = backend.capabilities()
  /*
   * `filters` 必须**原样传下去**（2026-10-17 真机抓到的洞）：这一层被抽出来的时候漏了它，
   * 而下面的 `runFacets` 那份传了——于是结构化筛选只收窄了榜与分布，**行**照旧是全量：
   * 真机上 `filters: {container.name: prometheus}` 发出去，回来的 100 行里躺着 6 个容器，
   * matched 也是未筛的 26264（面板那句「行、时间分布与分组榜都跟着收窄」里，第一个是假的）。
   *
   * 一起漏掉的还有 Loki 那句**诚实的报错**：适配器见不得 filters 就抛「暂不支持结构化 filters」，
   * 传不到它那儿就变成「静默给了全量」——正是那段注释里说的最坏情况。守卫见
   * `test/query-route.test.ts`：走 /query 路由，断言桩后端真的收到了 filters、Loki 真的回了 400。
   */
  const normalized = normalizeQuery({
    targetId: picked.target.id,
    q: input.q,
    from: input.from,
    to: input.to,
    limit: input.limit,
    direction: input.direction,
    cursor: input.cursor,
    filters: input.filters,
  }, caps)
  if (!normalized.ok) throw new Error(normalized.error)
  const wanted = readLevel(input.level)
  if (!wanted.ok) throw new Error(wanted.error)
  const result = await backend.query(normalized.query, picked.target)
  /*
   * 适配器自己要说的话排在最前面（**宿主原话**）：它们解释的是「为什么这一页是这样」，
   * 比上面那些「你给的参数被夹过」更该先被看到。真机那条：ES 的分片级错误回 200，
   * 原文（`Failed to parse query [...]`）只有适配器读得到——不接上这一条，
   * `level:(ERROR` 与真的分片故障在界面上长得一模一样。
   */
  const warnings = [...(result.warnings ?? []), ...normalized.warnings]
  /*
   * level 过滤在**这一页**上做（真机反馈第 7 条）。
   *
   * 为什么不推给后端：级别字段在各家索引里名字与存在性都不一样（这套集群里 log.level 是空桶，
   * 级别其实长在正文里），推下去就会变成「有时候筛了、有时候静默没筛」。所以本层如实做页内筛 +
   * 一条明说范围的 warning：counts 与 truncation 仍是**未筛的整页**。**不要**在这里指一条
   * 「用聚合看全量」的路——ES 上 log.level 常为空，按它分组也是空桶（真机实测）；后端没有
   * 级别字段时，面板与 agent 都只能页内筛 + 在查询串里搜关键字。
   */
  let lines = result.lines
  if (wanted.level !== undefined) {
    const kept = lines.filter((line) => levelMatches(line.level, wanted.level as CanonicalLevel))
    /*
     * 这句 warning 是**原话照抄**到面板上的（meta 行里那个 `.ll_warn`），所以不写 Markdown
     * 的 `**`——宿主不把文案当 Markdown 渲染，界面上会原样露出星号。另外，后半句要给一条
     * **走得通**的路：ES 上 `log.level` 常常整列是空的（级别从正文推断），那种来源连
     * `loglens_facets` 按它分组也是空桶（真机 2026-10-17 实测），只指聚合等于指一条死路。
     */
    /*
     * 续行要**单独报数**（真机 2026-10-19）：采集侧没配 multiline 时，一次异常会被拆成 5–30 个文档，
     * 其中只有首文档带级别、其余是 `\tat …` / `Caused by:` 这类续行（实测样本 63%）。
     * 它们本来就"没有级别"，按级别筛必然把它们全筛掉——**不报数就等于让它们静默消失**，
     * 而用户看到的 error 数会因此偏小、且完全不知道为什么。
     */
    const continuation = lines.filter((line) => line.levelContinuation === true).length
    warnings.push(
      'level=' + wanted.level + '（' + levelHint(wanted.level) + '）是按「返回的这一页」筛的：'
      + String(lines.length - kept.length) + ' / ' + String(lines.length) + ' 行被筛掉'
      + (continuation === 0 ? '' : '（其中 ' + String(continuation) + ' 行是**堆栈续行**——它们本身没有级别，'
        + '是上一条日志的后半截，所以必然被筛掉）')
      + '，counts 与 truncation 仍是未筛的整页——按级别看全量要求后端真有级别字段'
      + '（ES 上 log.level 常为空、级别是从正文推断的），否则只能在查询串里搜级别关键字',
    )
    lines = kept
  }
  const reasons = result.truncation.reasons
  const limited = reasons.includes('hit_limit')
  const hint = reasons.includes('cursor_expired')
    ? '游标已过期（PIT 有寿命）：请重新发起一次带时间窗的查询，不要接着用这个游标'
    : limited && caps.pagination === 'none'
      ? '这个来源不支持游标，命中可能不完整：请缩小时间窗（或把 limit 调小后分段查）'
      : undefined
  return {
    target: describeTarget(picked.target),
    window: { from: normalized.query.from, to: normalized.query.to },
    returned: lines.length,
    counts: result.counts,
    truncation: result.truncation,
    lines,
    ...(result.nextCursor === undefined ? {} : { nextCursor: result.nextCursor }),
    warnings,
    ...(hint === undefined ? {} : { hint }),
    ...(wanted.level === undefined ? {} : { level: wanted.level }),
  }
}

/* ============================ 聚合（facets） ============================ */

/** 桶数上限（工具面默认 10、硬上限 100）——与适配器那边各有一份默认值，硬上限取小的那个。 */
export const FACETS_DEFAULT_SIZE = 10
export const FACETS_MAX_SIZE = 100
/** 时间分桶的间隔形态：5m / 1h / 1d（不合形态的当场报错，别丢给后端回一句难懂的 400）。 */
const FACET_INTERVAL = /^\d+(s|m|h|d)$/u

/** 没有聚合适配器时的指路文案（说清「怎么绕」，不是一句「不支持」）。 */
export function facetsHint(kind: SourceKind): string {
  if (kind === 'docker') {
    return 'Docker 是采集来源（设计 §5 选项 0）：聚合请用现成的 docker 工具，本插件不包一层'
  }
  return '这个来源目前没有聚合适配器（当前只有 ES / OpenSearch 有）：Loki 的指标查询（LogQL）还没接——'
    + '先用 loglens_search 缩小时间窗看行，或把统计写进 LogQL'
}

/** 聚合的结果形状（type alias，理由同 SearchOutcome）。 */
export type FacetsOutcome = {
  target: { id: string, kind: string, label: string }
  window: { from: number, to: number }
  by?: string
  interval?: string
  buckets?: Array<{ key: string, count: number }>
  overTime?: Array<{ ts: number, count: number }>
  /** 没列出来的桶里还有多少条（terms 的 sum_other_doc_count）：**截断信号**。 */
  otherCount?: number
  /** 桶计数的误差上界（terms 的近似性）：>0 时桶里的数字是近似值。 */
  countErrorUpperBound?: number
  warnings: string[]
  hint?: string
}

/**
 * 0 桶时给一句解释（loglens D07）——**判据先行，别假装知道原因**。
 *
 * 为什么需要：0 桶有两种成因，而它们指向的「下一步」完全相反。「这个字段一条有值的都没有（空壳）」
 * 该换字段 / 承认级别得从正文推断；「这段时间压根没日志」该放大时间窗或放宽 filters。上一版只把
 * 0 桶原样回报，调用方只能自己试错。`totalHits`（窗口内命中数）就是这两者的**唯一**判据——由适配器
 * 带上来，只在这一层用，**不进返回值**（facets 的输出 schema 是 additionalProperties: false，
 * 多一个键就是崩溃；信息一律走 warnings 通道）。
 *
 * 措辞把 **判据本身（totalHits 是多少、精确还是下界）说出来**：这只是「这个数字给出的结论」，
 * 不是对一个看不见的索引下的断语。桶里**还有**计数时就**一句都不说**——聚合自己已经说清楚了，
 * 多说一句就是刷屏。
 *
 * **判据的边界也要认**（第二轮对抗复核的 F8）：`totalHits > 0` 只证明「窗口里有日志」，
 * **证明不了这个字段有值**——字段名拼错 / 索引里没这个字段，同样一个桶都没有。这一层没拿 `by`
 * 跟字段清单对过，所以它没资格在两种成因里挑一个说；那种情形把两种可能都摆出来、再给两条
 * 「调用方自己验」的路，比给一个猜的结论有用。
 *
 * 为什么**不**在这里补一次 `fields()` 校验：那是每次 facets 都多一跳（而 facets 本来就是
 * 「先看一眼分布」的便宜动作），代价与收益不成比例；而 `loglens_fields` 那条路调用方一次就能验完，
 * 费用落在真需要它的人身上。另外 ES 适配器那层对未知字段会走 text 分支直接报错（不是回 0 桶）——
 * 那是那一层的实现细节，不是这一层能依赖的判据（别的适配器没有这条），所以措辞照样两种都留。
 */
function explainEmptyFacets(
  byField: string,
  buckets: FacetBucket[] | undefined,
  totalHits: { value: number, basis: 'exact' | 'lower_bound' } | undefined,
): string | undefined {
  /*
   * 判定范围：一个桶都没有，或所有桶都是 0 条（terms 的 min_doc_count 默认是 1，所以第二种在 ES 上
   * 基本见不到——但契约里 buckets 可以来自任何适配器，判定照「桶里到底有没有条数」来，不靠这个假设）。
   */
  if (buckets !== undefined && buckets.some((bucket) => bucket.count > 0)) return undefined
  if (totalHits === undefined) {
    // 适配器没给这个判据（不知道就不写，别拿 0 冒充「没有数据」）：给一句不冒充原因的话，指一条能自己验的路
    return '按 ' + byField + ' 没分到任何桶，而这次查询没能拿到「窗口内共有多少条」这个判据：'
      + '先用 loglens_search 看这个窗口里到底有没有日志——有日志就说明问题出在**这个字段**上'
      + '（它在这批日志里没值，或者字段名压根不存在：用 loglens_fields 对一下拼写），'
      + '没有日志则是窗口或查询串的问题'
  }
  // 下界（ES 的 relation: 'gte'）照样能用：它 > 0 就已经证明窗口里有日志了，只是不谎报成精确值
  const bound = totalHits.basis === 'lower_bound' ? '（下界，非精确值）' : ''
  if (totalHits.value > 0) {
    /*
     * 两种可能都摆出来（F8）：这个判据只证明「窗口里有日志」，证明不了「字段有值」——
     * 字段名拼错 / 索引里没这个字段，同样是 0 桶。两条下一步各验一种可能：
     * `loglens_fields` 验「字段名存在吗」，`loglens_search` 的 `?` 验「值是不是长在正文里」。
     */
    return '这个窗口里有 ' + String(totalHits.value) + ' 条日志' + bound + '（所以不是窗口里没日志），但按 ' + byField + ' 分组一个桶都没有：'
      + '要么这个字段名压根不存在（索引里没这个字段，多半是拼错），要么它在这批日志里一条有值的都没有（空壳）——'
      + '这次查询没校验过 by 是不是真字段，两种可能都排除不掉。自己验两步：'
      + '① 用 loglens_fields 对拼写（它列出的就是索引里真有的字段名，逐字一致才算有）；'
      + '② 用 loglens_search 看行里的级别带不带 `?`（形如 `error?`）——ES 上 log.level 这类字段常常整列是空的、'
      + '级别其实长在正文里，带 `?` 就说明那一行的级别是从正文推断出来的，不是字段值'
  }
  return '这个窗口里没有任何命中（共 ' + String(totalHits.value) + ' 条' + bound + '），所以按 ' + byField + ' 也没有桶：'
    + '这次是窗口或查询串的问题，**不是这个字段的问题**——把时间窗放大，或检查查询串 / filters 是不是筛太紧了'
}

export async function runFacets(deps: ExecuteDeps, input: Record<string, unknown>): Promise<FacetsOutcome> {
  const picked = resolveTarget(deps.config(), input.target)
  if (!picked.ok) throw new Error(picked.error)
  const backend = deps.backendFor(picked.target.kind)
  if (backend === undefined) throw new Error(adapterHint(picked.target.kind))
  if (backend.facets === undefined) throw new Error(facetsHint(picked.target.kind))

  const by = typeof input.by === 'string' ? input.by.trim() : ''
  const interval = typeof input.interval === 'string' ? input.interval.trim() : ''
  if (by === '' && interval === '') {
    throw new Error('至少要给 by（按字段分组，如 container.name）或 interval（按时间分桶，如 5m）之一')
  }
  if (interval !== '' && !FACET_INTERVAL.test(interval)) {
    throw new Error('interval 形态不对（要 5m / 1h / 1d 这种）：' + interval)
  }
  let size = FACETS_DEFAULT_SIZE
  const warnings: string[] = []
  if (input.size !== undefined && input.size !== null) {
    if (typeof input.size !== 'number' || !Number.isInteger(input.size) || input.size < 1) {
      throw new Error('size 必须是正整数（桶数上限）')
    }
    size = input.size
    if (size > FACETS_MAX_SIZE) {
      warnings.push('size ' + String(size) + ' 超过硬上限，已夹到 ' + String(FACETS_MAX_SIZE))
      size = FACETS_MAX_SIZE
    }
  }

  const caps = backend.capabilities()
  const normalized = normalizeQuery({
    targetId: picked.target.id,
    q: input.q,
    from: input.from,
    to: input.to,
    filters: input.filters,
  }, caps)
  if (!normalized.ok) throw new Error(normalized.error)
  warnings.unshift(...normalized.warnings)

  const result: FacetsResult = await backend.facets(normalized.query, picked.target, { ...(by === '' ? {} : { by }), ...(interval === '' ? {} : { interval }), size })
  if (result.otherCount !== undefined) {
    warnings.push('还有 ' + String(result.otherCount) + ' 条落在没列出来的桶里：把 size 调大（上限 '
      + String(FACETS_MAX_SIZE) + '）或收窄时间窗 / 加 filters')
  }
  if (result.countErrorUpperBound !== undefined) {
    warnings.push('桶计数是**近似值**（误差上界 ' + String(result.countErrorUpperBound) + ' 条，terms 聚合在多分片上本来就是这个精度）')
  }
  /* 0 桶的解释见 explainEmptyFacets：判据与措辞的理由都在那一段里。 */
  if (by !== '') {
    const emptyFacets = explainEmptyFacets(by, result.buckets, result.totalHits)
    if (emptyFacets !== undefined) warnings.push(emptyFacets)
  }
  /*
   * 这个返回值**只挑明写出来的键**：`result.totalHits` 是执行层内部判据（上面已经换成措辞了），
   * 它出现在这里就是一次 schema 崩溃（facets 的 output schema 是 additionalProperties: false）。
   */
  return {
    target: describeTarget(picked.target),
    window: { from: normalized.query.from, to: normalized.query.to },
    ...(by === '' ? {} : { by }),
    ...(interval === '' ? {} : { interval }),
    ...(result.buckets === undefined ? {} : { buckets: result.buckets }),
    ...(result.overTime === undefined ? {} : { overTime: result.overTime }),
    ...(result.otherCount === undefined ? {} : { otherCount: result.otherCount }),
    ...(result.countErrorUpperBound === undefined ? {} : { countErrorUpperBound: result.countErrorUpperBound }),
    warnings,
  }
}

/** 列字段的结果形状（同样用 type alias，理由见上）。截断信号跟着结果走（真机反馈第 4 条）。 */
export type FieldsOutcome = {
  target: { id: string; kind: string; label: string }
  fields: Array<{ name: string; kind: string; label?: string, preferred?: boolean }>
  /** 来源里一共有多少字段（截断前）。 */
  total: number
  truncated: boolean
  warnings: string[]
}

/**
 * 列字段的**长度处理**（2026-10-14，对齐 Kibana）：**不传 limit 就是不截断**，来源有多少字段列多少。
 *
 * 原来这里是「默认 80 + 硬上限 200」。真机反馈第 4 条要的是**看得出被截断**（45KB 那份清单被当成全部），
 * 不是「一律砍到 80」——Kibana 的 `_field_caps` 从来不 slice，长度交给界面（字段名搜索 + 分区 + 虚拟滚动）。
 * 所以这层同理：默认给全，要收窄是调用方**显式**说的事；只有真截了才带上 total / truncated 与那句警告
 * （形状不变，信号仍然跟着结果走）。工具面的成本提示写在工具描述里，不靠这里的默认值替调用方做决定。
 */
export async function runFields(deps: ExecuteDeps, input: Record<string, unknown>): Promise<FieldsOutcome> {
  const picked = resolveTarget(deps.config(), input.target)
  if (!picked.ok) throw new Error(picked.error)
  const backend = deps.backendFor(picked.target.kind)
  if (backend === undefined) throw new Error(adapterHint(picked.target.kind))
  // `limit` 是**可选的收窄手段**，没有默认值、也没有硬顶：调用方要前 N 个就明说，不说就是全部
  let limit: number | undefined
  if (input.limit !== undefined && input.limit !== null) {
    if (typeof input.limit !== 'number' || !Number.isInteger(input.limit) || input.limit < 1) {
      throw new Error('limit 必须是正整数（列字段的条数上限）')
    }
    limit = input.limit
  }
  const result = await backend.fields(picked.target, limit === undefined ? {} : { limit })
  const warnings: string[] = []
  if (result.truncated) {
    warnings.push(
      '只列了前 ' + String(result.fields.length) + ' 个（这个来源共有 ' + String(result.total) + ' 个字段）：'
      + '这正是「字段表看不出被截断」的坑——去掉 limit 就是全部，'
      + '或先用 loglens_facets 看哪些字段真有数据',
    )
  }
  return {
    target: describeTarget(picked.target),
    fields: result.fields.map((field) => ({
      name: field.name,
      kind: field.kind,
      ...(field.label === undefined ? {} : { label: field.label }),
      ...(field.preferred === true ? { preferred: true } : {}),
      // 多类型才有（Kibana 的 esTypes / type: conflict / conflictDescriptions）：**必须原样搬过去**，
      // 在这一层丢掉的话，工具面就再也说不出「这个字段在不同索引里类型不一致」（渲染与面板都靠它）
      ...(field.esTypes === undefined ? {} : { esTypes: field.esTypes }),
      ...(field.conflict === true ? { conflict: true } : {}),
      ...(field.conflictDescriptions === undefined ? {} : { conflictDescriptions: field.conflictDescriptions }),
    })),
    total: result.total,
    truncated: result.truncated,
    warnings,
  }
}
