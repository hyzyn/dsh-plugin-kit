/**
 * @hyzyn/dsh-loglens — 查询执行层（agent 工具与浏览器面板**共用**的那一段）。
 *
 * 为什么单独一层：同一份查询要从两条入口发起——agent 工具（`loglens_search`）与面板的
 * `POST /api/dsh-loglens/query`。两处各写一遍「怎么找来源 / 怎么夹取 / 怎么拼返回形状」就是两份
 * 会漂的真相源；这一层是唯一实现，工具与路由各自只加一层自己的东西（工具加渲染、路由加围栏）。
 */
import type { LoglensConfig, LoglensTarget, SourceKind } from './config.js'
import type { BackendCaps, LogBackend, LogCounts, LogLine, Truncation } from './backends/types.js'
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
 *   - 声明了 pagination:'none' 的来源（当前是 Loki）：被 limit 截断时只会报 hit_limit，得缩小时间窗；
 *   - ES / OpenSearch：分页走 PIT，游标有寿命，过期后要重新发起带时间窗的查询。
 *
 * **刻意不做**「探测 docker 插件在不在」：设计 §5 的「装了没装」判据是给**面板**用的（浏览器侧 registry
 * 存在性 + health），而宿主侧的工具注册表**没有公开的列举 API**（实测 @deepseek-ai/dsh-tools 0.1.2-rc.1
 * 的 ctx.tools 只有 register / restrict / guard）——猜一个私有字段去读，比不读更糟。
 */
export function hintFor(kind: SourceKind, caps: BackendCaps | undefined): string | undefined {
  if (kind === 'docker') {
    return 'Docker 是采集来源（选项 0）：agent 侧用现成的 docker_logs / docker_logs_grep，本插件不包一层'
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
}

/** 查一次（抛错即失败，调用方把 message 回给对面：工具抛出去、路由回 400）。 */
export async function runSearch(deps: ExecuteDeps, input: Record<string, unknown>): Promise<SearchOutcome> {
  const picked = resolveTarget(deps.config(), input.target)
  if (!picked.ok) throw new Error(picked.error)
  const backend = deps.backendFor(picked.target.kind)
  if (backend === undefined) throw new Error(adapterHint(picked.target.kind))
  const caps = backend.capabilities()
  const normalized = normalizeQuery({
    targetId: picked.target.id,
    q: input.q,
    from: input.from,
    to: input.to,
    limit: input.limit,
    direction: input.direction,
    cursor: input.cursor,
  }, caps)
  if (!normalized.ok) throw new Error(normalized.error)
  const result = await backend.query(normalized.query, picked.target)
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
    returned: result.counts.returned,
    counts: result.counts,
    truncation: result.truncation,
    lines: result.lines,
    ...(result.nextCursor === undefined ? {} : { nextCursor: result.nextCursor }),
    warnings: normalized.warnings,
    ...(hint === undefined ? {} : { hint }),
  }
}

/** 列字段的结果形状（同样用 type alias，理由见上）。 */
export type FieldsOutcome = {
  target: { id: string; kind: string; label: string }
  fields: Array<{ name: string; kind: string; label?: string }>
}

export async function runFields(deps: ExecuteDeps, input: Record<string, unknown>): Promise<FieldsOutcome> {
  const picked = resolveTarget(deps.config(), input.target)
  if (!picked.ok) throw new Error(picked.error)
  const backend = deps.backendFor(picked.target.kind)
  if (backend === undefined) throw new Error(adapterHint(picked.target.kind))
  const fields = await backend.fields(picked.target)
  return {
    target: describeTarget(picked.target),
    fields: fields.map((field) => (field.label === undefined
      ? { name: field.name, kind: field.kind }
      : { name: field.name, kind: field.kind, label: field.label })),
  }
}
