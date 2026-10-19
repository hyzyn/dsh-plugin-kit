/**
 * @hyzyn/dsh-loglens — agent 工具（P3）。
 *
 * 四个工具，**全部归 read 档**（名单在 LOGLENS_TIER_CLASS，闸门接线在 src/index.ts；对账守卫在
 * test/tier-gate.test.ts，从本文件注册处的 add() 调用（字面量工具名）现算名单——漏分类会红；注释里别写那种字面量）。
 *
 * 三条贯穿全文件的规矩：
 *   1. **一次一个来源**：v1 不做跨后端 fan-out（设计 §1 非目标）。省略 target 只在「恰好一个来源」
 *      时回落，多个来源时把候选名列出来让人/模型自己选。
 *   2. **没有适配器就说清楚怎么绕**：docker 走现成的 docker_logs / docker_logs_grep（选项 0），
 *      ES / OpenSearch 还没有适配器（P4）——别回一句「不支持」把路堵死。
 *   3. **诚实的截断信号**：来源不支持游标时只报 `hit_limit` + 一句「命中可能不完整，请缩小时间窗」，
 *      不给会丢行的游标（判据在 src/backends/loki.ts 的 LOKI_PAGINATION 与设计 §3.3）。
 */
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { TierClass } from '@hyzyn/dsh-kit'
import { backendFor } from './backends/registry.js'
import type { BackendCaps, LogBackend, LogLine } from './backends/types.js'
import type { LoglensConfig, SourceKind } from './config.js'
import { adapterHint, describeTarget, facetsHint, hintFor, resolveTarget, runFacets, runFields, runSearch } from './execute.js'
/*
 * 身份键名单只有一份，在 src/line.ts（`LABEL_PRIORITY`）：它既决定哪些键能进 labels，也决定
 * 渲染文本里谁排前面。这里复用它，**不要**另起一份「渲染用的优先键」——两份名单一定会漂。
 */
import { LABEL_PRIORITY } from './line.js'
import { normalizeQuery } from './query.js'

/*
 * 找来源 / 夹取 / 拼返回形状都在 src/execute.ts——agent 工具与面板路由共用那一层，避免两份会漂的
 * 真相源；这里只负责**注册**与**渲染**。下面这几个再导出一次，方便用例与调用方从一处取。
 */
export { adapterHint, describeTarget, hintFor, resolveTarget } from './execute.js'
export { backendFor } from './backends/registry.js'

/** 分类表：四个工具全是只读（查日志不改任何东西，也不在目标机上执行命令）。 */
export const LOGLENS_TIER_CLASS: Record<string, TierClass> = {
  loglens_sources: 'read',
  loglens_search: 'read',
  loglens_fields: 'read',
  loglens_facets: 'read',
  loglens_context: 'read',
}

/** 档位闸只认这些前缀（名单外一个都不碰）。 */
export const LOGLENS_TIER_PREFIXES: readonly string[] = ['loglens_']


export interface ToolDeps {
  /** 当前生效的配置（宿主侧那一份，volatile 更新后跟着变）。 */
  config: () => LoglensConfig
  backendFor: (kind: SourceKind) => LogBackend | undefined
  /** Docker 容器面板装没装（判据见 src/execute.ts 的 hintFor 与 index.ts 的接线）。 */
  dockerLoaded?: () => boolean
  /** 注册漏斗：与 docker 的 add 同款（单个工具注册失败不该把一整批带下去）。 */
  add: (name: string, definition: unknown) => void
}



/** 渲染文本里平铺的「身份键」条数：其余标签折叠成一个计数（`+N labels`）。 */
const IDENTITY_LABEL_MAX = 3

/** 多行正文（堆栈）的续行前缀：让「这条日志自己占了几行」一眼可见。 */
const CONTINUATION_PREFIX = '    | '

/** 多行正文最多渲染几行：堆栈能上百行，整段铺开会把后面的行挤走。 */
const MESSAGE_MAX_LINES = 20

/**
 * 时间戳的渲染形态：**本地时间 + 显式偏移**，如 `2026-10-18T22:01:43.123+08:00`（真机反馈第 5 条）。
 *
 * 为什么不直接用 `toISOString()`：那是 **UTC**，而日志正文里的时间几乎都是**本地时间**——同一行里于是
 * 出现两套时间（行首 UTC、正文本地），换算 epoch 时必然出错，问「这条是几点」也要在脑子里加 8 小时。
 * 带上偏移之后这个字符串**自己就说明**了是哪个时区：`Date.parse()` 能原样解析回同一个瞬间
 * （所以它仍是机器可用的），而人眼看到的时刻与正文里的时刻一致。
 *
 * 时区取**宿主进程的本地时区**（`getTimezoneOffset()`）：工具跑在宿主里，与用户的机器通常是同一台；
 * 远端宿主的情形由偏移显式标注，不会含糊成「不知道哪个时区」。
 *
 * **已知边界（复核 F3/F4，2026-10-19 如实记下）**：
 * - 偏移只有**分钟**粒度（`getTimezoneOffset()` 如此）。1970 年前某些地区用秒级 LMT（如 Monrovia 的
 *   `-00:44:30`），这里会写成 `-00:44`，`Date.parse()` 回来差几十秒。现代日志不受影响（复核实测
 *   1976–2035 全时区逐年 0 坏）。
 * - 年份超出 `0000–9999` 时（只可能是把 µs / ns 当成 ms 用），四位补零写不出 ISO 8601 的扩展年份
 *   （那要带符号），`Date.parse` 会得到 `NaN`。这类输入直接回退到 `toISOString()`——它写得对，
 *   而**不可解析的字符串比不好读的字符串更坏**。
 *
 * 非法时间（`NaN`）不渲染成 `Invalid Date`——那不是一句人话，也解析不回去。
 */
export function formatTimestamp(ts: number): string {
  const date = new Date(ts)
  if (Number.isNaN(date.getTime())) return String(ts)
  const year = date.getFullYear()
  // 扩展年份（负年份 / 五位以上）超出 `YYYY` 能表达的范围：交给 toISOString 的带符号写法（复核 F4）
  if (year < 0 || year > 9999) return date.toISOString()
  const pad = (value: number, width = 2): string => String(Math.trunc(Math.abs(value))).padStart(width, '0')
  const offset = -date.getTimezoneOffset()   // 分钟；东八区是 +480
  return String(year).padStart(4, '0') + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate())
    + 'T' + pad(date.getHours()) + ':' + pad(date.getMinutes()) + ':' + pad(date.getSeconds())
    + '.' + pad(date.getMilliseconds(), 3)
    + (offset >= 0 ? '+' : '-') + pad(Math.trunc(offset / 60)) + ':' + pad(offset % 60)
}

/**
 * 正文的渲染：多行（堆栈）**保留层次**，续行加一个前缀（真机反馈第 6 条）。
 *
 * 为什么：采集侧把 `log.flags=multiline` 的一整段堆栈存成**一个文档**，它的 `message` 里本来就带换行。
 * 原样吐出去时它是一条「行内嵌换行」的扁平文本——读者分不清哪一行是新的日志、哪一行是堆栈的续行。
 * 续行加 `    | ` 前缀之后，层次回来了，而正文一个字都没改（前缀在行首，不在内容里）。
 *
 * **超过 {@link MESSAGE_MAX_LINES} 行就截断并报出还有多少行**：一整段异常链能上百行，全铺开会把
 * 后面的日志行挤出视野，而「悄悄少显示几行」比截断更坏（与 `raw` 的 2 万字符预览同一口径）。
 */
export function renderMessage(message: string): string {
  // Windows 侧采集的日志常带 `\r\n`：统一成 `\n` 再分行，否则续行前缀后面会跟一个看不见的 `\r`
  const lines = message.replace(/\r\n?/g, '\n').split('\n')
  if (lines.length === 1) return message
  const shown = lines.slice(0, MESSAGE_MAX_LINES)
  const body = shown.map((text, index) => (index === 0 ? text : CONTINUATION_PREFIX + text)).join('\n')
  const dropped = lines.length - shown.length
  return dropped === 0
    ? body
    : body + '\n' + CONTINUATION_PREFIX + '…（还有 ' + String(dropped) + ' 行未显示，共 ' + String(lines.length) + ' 行）'
}

/**
 * labels 的渲染：**只平铺身份键，其余折叠成一个计数**（真机反馈第 4 条）。
 *
 * 为什么：一条 filebeat 文档能摊出 20 条标签（`container.labels.*` / `agent.*` / `log.file.*`），
 * 全平铺时正文被 metadata 淹没，而 agent 扫日志时**先看正文、再问是谁写的**。
 *
 * 名单不另造：直接用 `src/line.ts` 的 `LABEL_PRIORITY`（它就是「排查时先问什么」的顺序，
 * 且已经决定了哪些键能进 labels）。**只取它排在最前面的几个命中项**——`agent.name` 这类
 * 整个集群都一样的采集器信息排在名单尾部，自然落进折叠里。
 *
 * 折叠**不是丢弃**：完整的 labels 在工具返回值里（`lines[].labels`），这里只是渲染层不铺开。
 * 计数写作 `+N labels` 而不是省略号，是为了让调用方知道「还有东西没显示」而不是以为这就是全部。
 */
function renderLabels(labels: Record<string, string>): string {
  const shown: string[] = []
  let hidden = 0
  for (const key of LABEL_PRIORITY) {
    if (!Object.hasOwn(labels, key)) continue
    if (shown.length < IDENTITY_LABEL_MAX) shown.push(key + '=' + labels[key])
    else hidden += 1
  }
  for (const key of Object.keys(labels)) {
    if (!LABEL_PRIORITY.includes(key)) hidden += 1
  }
  const parts = [shown.join(' '), hidden === 0 ? '' : '+' + String(hidden) + ' labels'].filter((part) => part !== '')
  return parts.length === 0 ? '' : '  ' + parts.join('  ')
}

/**
 * 一行的可读形式：时间用 ISO（人看日志时以本地时间为准，ISO UTC 至少不含糊）+ 级别 + **id** + 正文 + 标签。
 *
 * 级别带个问号（`error?`）= 它是**从正文推断**的（文档里没有级别字段）：agent 据此决定
 * 「这条我能当级别用吗」。标签按 host / container 这类**谁写的**排在前面（src/line.ts 的优先键），
 * 只平铺前几条身份键、其余折叠成计数（见 {@link renderLabels}）。
 *
 * 为什么把 id 也渲染出来（loglens D06）：`loglens_context` 的**精确**锚点是 id，而 id 只在返回值里、
 * 不在渲染文本里——人眼/模型从渲染文本里复盘一条行时，唯一能拿到的定位物就是它，没有它就只能拿
 * 正文片段去猜，而正文在来源侧常被加了前缀后缀（真机那条是 `[ERROR] [时间] T:[] 1 … Application run failed`）。
 *
 * 形态取舍：**正文之后**追加一个 `#id`，正文因此一个字都不动（前缀形态会把每条日志的正文推后，
 * 而正文才是要用眼睛扫的东西）；`#` 让 id 自证身份，不会被当成日志正文的一部分。
 * 这个 token 是**回抄格式**：`loglens_context` 的 id 参数会剥掉一个前导 `#`，原样抄回去就能用。
 * 代价是每行多 `2 + id 长度` 个字符——id 本身很短（ES 侧是文档 `_id`，Loki 侧是 `ts:内容序`），
 * 且只在**渲染文本**里加，工具返回值与面板用的是结构化字段，不受这层影响。
 */
export function formatLine(line: LogLine): string {
  const level = line.level === undefined ? '' : line.level + (line.levelInferred === true ? '? ' : ' ')
  const id = typeof line.id === 'string' && line.id !== '' ? '  #' + line.id : ''
  return formatTimestamp(line.ts) + '  ' + level + renderMessage(line.message) + id + renderLabels(line.labels)
}

export function renderLines(lines: readonly LogLine[], markId?: string): string {
  if (lines.length === 0) return '（没有命中）'
  return lines.map((line) => (line.id === markId ? '→ ' : '  ') + formatLine(line)).join('\n')
}

/** `loglens_fields` 的渲染输入（从工具返回值里取用的那一小撮）。 */
export interface FieldsView {
  fields?: Array<{ name: string, kind: string, preferred?: boolean, conflict?: boolean, esTypes?: string[] }>
  total?: number
  truncated?: boolean
  warnings?: string[]
}

/**
 * `loglens_fields` 的渲染文本（导出是为了能直接测：冲突标记这种东西不该只靠人肉看）。
 *
 * 两件事必须出现在文本里：
 * ① 一共多少个 / 是不是被截断（截断只在显式 limit 时才会发生）；
 * ② **每个类型冲突的字段逐个标出来**——同名在不同索引里类型不一致，拿它分组只会覆盖一部分索引，
 *    而候选里它的名字跟别人长得一模一样，不标就等于没说。
 */
export function renderFields(result: FieldsView): string {
  const fields = result.fields ?? []
  if (fields.length === 0) return '这个来源没有报告任何字段。'
  const head = '字段 ' + String(fields.length) + (result.total === undefined ? '' : ' / 共 ' + String(result.total)) + ' 个'
    + (result.truncated === true ? '（已截断）' : '')
  const body = fields.map((field) => (field.preferred === true ? '* ' : '  ') + field.name + '（' + field.kind
    + (field.conflict === true ? '，**类型冲突**：' + (field.esTypes ?? []).join(' / ') : '') + '）').join('\n')
  const conflictCount = fields.filter((field) => field.conflict === true).length
  const tail = conflictCount === 0 ? [] : ['有 ' + String(conflictCount) + ' 个字段**类型冲突**（同名在不同索引里类型不一致）：'
    + '拿它分组或筛值可能只覆盖一部分索引，先按上面标出来的类型确认你要的是哪一种。']
  return [head, body, ...tail, ...(result.warnings ?? [])].join('\n')
}

/**
 * 契约键集：`LogLine` 的**每一个**键各占一项。
 *
 * **为什么必须放在 `src/` 里**（loglens D05 收口 F7）：`Record<keyof LogLine, true>` 只有在
 * **被 tsc 编到**的时候，才能在「契约加了字段、这里没跟」时报错；而全仓**没有任何 tsconfig 收
 * `test/`**（本包 include 只有 `"src"`，`pnpm typecheck` = `pnpm -r typecheck` = 各包 `tsc --noEmit`）。
 * 所以这半守卫放 `test/` 里等于挂在一条**没人执行的闸门**上——实测过：给 `LogLine` 加字段后
 * 包 typecheck exit 0、对账用例全绿，而运行期照样炸 `is not a declared property`（D05 原症状）。
 *
 * 分工（别把对账挪回 test/）：
 *   - **本常量管「契约加了字段」**——编译期，`LogLine` 加键而这里没跟就报 missing property；
 *   - test/tools.test.ts 的运行期对账管「`LINE_SCHEMA` 与这份键集逐字一致」——钉住另一半。
 * 两半合起来才覆盖 `LogLine` →（人）→ `LINE_SCHEMA` 这条链。
 */
export const LINE_CONTRACT_KEYS: Record<keyof LogLine, true> = {
  ts: true,
  message: true,
  level: true,
  levelInferred: true,
  highlights: true,
  source: true,
  id: true,
  labels: true,
  raw: true,
}

/**
 * 一行的输出 schema：与契约的 LogLine 同形（工具返回值与 render 都按它）。
 *
 * **导出给用例**：test/tools.test.ts 拿它跟 {@link LINE_CONTRACT_KEYS} 的键集对账——契约加了字段而
 * 这里忘了跟，就是「行模型有、输出 schema 没有」的漂移，而它的表现是**运行时**才炸
 * （`"value.lines[0].x" is not a declared property`，宿主在返回值校验那一关拦下整个工具）。
 * 对账让这种漂移在测试期就变红，而不是等真机查询撞上（loglens D05）。
 */
export const LINE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ts: { type: 'number', required: true },
    message: { type: 'string', required: true },
    level: { type: 'string', description: '归一化级别（trace / debug / info / warn / error / fatal）' },
    levelInferred: { type: 'boolean', description: 'true = 级别是从正文推断的（文档里没有级别字段），不是来源自己标的' },
    /*
     * 高亮区间是**数组套数组**（契约是 `Array<[number, number]>`）。宿主校验器是递归下钻的
     * （`items` 里还能再是 array），所以这么写能被真正执行；而它在契约里是**可选**字段，
     * 不带时不写这个键（ES 适配器只在后端真报了 highlight 时才带）。
     * 面板要用它画高亮，所以修法是补 schema、不是把字段剥掉（loglens D05）。
     */
    highlights: {
      type: 'array',
      description: 'message 里命中查询串的字符区间 [start, end)，按 start 升序、互不重叠；只有后端明确报了高亮（ES 的 highlight）才带',
      items: { type: 'array', items: { type: 'number' } },
    },
    source: { type: 'string', required: true },
    id: { type: 'string', required: true },
    labels: { type: 'object', additionalProperties: true, properties: {} },
    raw: { type: 'string', required: true },
  },
} as const

/** 计数的输出 schema：五个字段各占一格，语义不同的量不许挤进同一个数（设计 §3.2）。 */
const COUNT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    returned: { type: 'number', required: true },
    matched: { type: 'number' },
    scannedRows: { type: 'number' },
    scannedBytes: { type: 'number' },
    totalKnown: { type: 'boolean', required: true },
  },
} as const

/** loglens_sources 的一行（工具返回值形状显式写出来，别用 Record<string, unknown> 糊过去）。 */
interface SourceRow {
  id: string
  kind: string
  label: string
  url: string
  adapter: string
  /** 这条来源覆盖的范围（ES / OpenSearch 是**解析后的索引表达式**——见真机反馈第 3 条）。 */
  scope?: string
  /** 探测窗口内的条数（probe 时才有；探测不到就不写，别拿 0 冒充「没有数据」）。 */
  recent?: { windowMs: number, count: number }
  queryLanguage?: string
  pagination?: string
  follow?: boolean
  ok?: boolean
  error?: string
  /** 这条来源的**下一步怎么走**（选项 0 的替代路径、不给游标的后果、PIT 的寿命）。 */
  hint?: string
}


export function registerLoglensTools(deps: ToolDeps): void {
  const add = deps.add

  add('loglens_sources', defineTool({
    name: 'loglens_sources',
    // 只读：与其他只读工具并发执行（宿主默认把未声明的工具当独占）
    isConcurrencySafe: () => true,
    description: '列出已配置的日志来源（类型 / 名称 / 地址 / 查询方言 / 分页能力），可选探测连通性。其他 loglens_* 工具的 target 参数取自这里。',
    parameters: {
      probe: { type: 'boolean', description: 'true 时逐个探测来源（Loki 是 /ready）；远端来源会建连接，慢一些' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          targets: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                id: { type: 'string', required: true },
                kind: { type: 'string', required: true },
                label: { type: 'string', required: true },
                url: { type: 'string', required: true },
                adapter: { type: 'string', required: true },
                queryLanguage: { type: 'string' },
                pagination: { type: 'string' },
                follow: { type: 'boolean' },
                scope: { type: 'string', description: '这条来源覆盖的范围（ES / OpenSearch 是解析后的索引表达式；默认 *,-.* 表示全局且排除点号索引）' },
                recent: {
                  type: 'object',
                  additionalProperties: false,
                  description: 'probe 时数出来的「探测窗口内有多少条」',
                  properties: { windowMs: { type: 'number', required: true }, count: { type: 'number', required: true } },
                },
                ok: { type: 'boolean' },
                error: { type: 'string' },
                hint: { type: 'string' },
              },
            },
          },
        },
      },
      render: (_args: unknown, value: unknown) => {
        const rows = (value as { targets?: Array<Record<string, unknown>> }).targets ?? []
        if (rows.length === 0) return [{ type: 'text', text: '还没有配置任何日志来源（设置 → 插件配置 → 日志查询）。' }]
        const text = rows.map((row) => {
          const head = String(row.id) + '（' + String(row.kind) + '）：' + String(row.label)
          const health = row.ok === undefined ? '' : row.ok === true ? ' · 就绪' : ' · 不可用：' + String(row.error ?? '')
          const recent = row.recent === undefined || typeof row.recent !== 'object'
            ? ''
            : '，最近 ' + String(Math.round((row.recent as { windowMs: number }).windowMs / 60000)) + ' 分钟 ' + String((row.recent as { count: number }).count) + ' 条'
          const scope = row.scope === undefined ? '' : '\n    范围：' + String(row.scope)
          const tail = row.hint === undefined ? '' : '\n    → ' + String(row.hint)
          return head + health + recent + '\n    ' + String(row.url) + scope + '\n    适配器：' + String(row.adapter) + (row.pagination === undefined ? '' : ' · 分页 ' + String(row.pagination)) + tail
        }).join('\n')
        return [{ type: 'text', text }]
      },
    },
    async execute(args: unknown): Promise<{ targets: SourceRow[] }> {
      const input = (args ?? {}) as { probe?: unknown }
      const config = deps.config()
      const rows: SourceRow[] = []
      for (const target of config.targets) {
        const backend = deps.backendFor(target.kind)
        const caps = backend === undefined ? undefined : backend.capabilities()
        const row: SourceRow = {
          id: target.id,
          kind: target.kind,
          label: target.label,
          url: target.url,
          adapter: backend === undefined ? adapterHint(target.kind) : backend.id,
          ...(caps === undefined ? {} : { queryLanguage: caps.queryLanguage, pagination: caps.pagination, follow: caps.follow }),
          // 范围要回显：ES 的索引表达式可能来自配置、地址路径或默认通配，agent 猜不出来（真机反馈第 3 条）
          ...(backend === undefined || backend.scope === undefined ? {} : { scope: backend.scope(target) }),
        }
        if (input.probe === true && backend !== undefined) {
          const health = await backend.health(target)
          row.ok = health.ok
          if (!health.ok) row.error = health.detail === undefined ? '未知错误' : health.detail
          if (health.recent !== undefined) row.recent = health.recent
        }
        const hint = hintFor(target.kind, caps, { dockerLoaded: deps.dockerLoaded === undefined ? undefined : deps.dockerLoaded() })
        if (hint !== undefined) row.hint = hint
        rows.push(row)
      }
      return { targets: rows }
    },
  }))

  add('loglens_search', defineTool({
    name: 'loglens_search',
    isConcurrencySafe: () => true,
    description: '查一个日志来源：返回归一化后的行 + 诚实的计数与截断信号。一次只查一个来源（v1 不做跨后端 fan-out）。'
      + '返回值里的时间戳一律 epoch 毫秒；**入参**的 from / to 还能写 ISO 8601 或 -30m 这类相对时间（省得自己算毫秒）。',
    parameters: {
      target: { type: 'string', description: '来源 id 或名称（loglens_sources 列出）；只有一个来源时可省略' },
      q: { type: 'string', description: '查询串（Loki 是 LogQL，ES / OpenSearch 是各自的方言）；留空即全量' },
      from: {
        description: '起始时间：epoch 毫秒整数、ISO 8601（不带时区按本机时区）或相对时间；缺省 = to 前面 15 分钟',
        oneOf: [
          { type: 'number', description: 'epoch 毫秒整数，如 1760000000000（填成秒会报错）' },
          { type: 'string', description: 'ISO 8601（2026-10-11T14:00:00Z）或相对时间（-30m / -2h / -1d）' },
        ],
      },
      to: {
        description: '结束时间，写法同 from；缺省取当前时刻（只给 to，「看最新日志」就够）。实际生效的时间窗见返回值 window',
        oneOf: [
          { type: 'number', description: 'epoch 毫秒整数' },
          { type: 'string', description: 'ISO 8601 或相对时间（-30m / now 等）' },
        ],
      },
      limit: { type: 'number', description: '返回条数上限（默认 100）；超过来源单页上限会被夹取，warnings 里会说明' },
      direction: { type: 'string', description: 'forward（旧的在前）或 backward（新的在前，默认）' },
      cursor: { type: 'string', description: '上一页返回的 nextCursor；来源声明 pagination=none 时不会有它' },
      filters: {
        type: 'object',
        additionalProperties: true,
        description: '结构化过滤：字段 → 值（如 {"container.name":"app-svc-1","log.level":"error"}）。'
          + '**字段该不该带 .keyword 由适配器查 _field_caps 决定**，你不用管；是 text 且没有子字段时自动退回 match_phrase（近似匹配）。'
          + 'Loki 不支持它（过滤写进 LogQL 的 {} 或过滤表达式）',
      },
      level: {
        type: 'string',
        description: '只要这个级别**及以上**的行（trace / debug / info / warn / error / fatal）。'
          + '注意：级别可能是从正文推断的（lines[].levelInferred），且来源侧没有统一的级别字段——'
          + '所以这是在**返回的这一页**上筛的，counts 仍是整页。要按级别看全量，后端得真有级别字段'
          + '（ES 上 log.level 常为空、级别是从正文推断的，按它分组也是空桶）；没有时只能在查询串里搜级别关键字',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          target: { type: 'object', required: true, additionalProperties: false, properties: { id: { type: 'string', required: true }, kind: { type: 'string', required: true }, label: { type: 'string', required: true } } },
          window: { type: 'object', required: true, additionalProperties: false, properties: { from: { type: 'number', required: true }, to: { type: 'number', required: true } } },
          returned: { type: 'number', required: true },
          counts: { ...COUNT_SCHEMA, required: true },
          truncation: { type: 'object', required: true, additionalProperties: false, properties: { truncated: { type: 'boolean', required: true }, reasons: { type: 'array', required: true, items: { type: 'string' } } } },
          lines: { type: 'array', required: true, items: LINE_SCHEMA },
          nextCursor: { type: 'string' },
          warnings: { type: 'array', required: true, items: { type: 'string' } },
          hint: { type: 'string' },
          level: { type: 'string', description: '生效的 level 过滤（回显）' },
        },
      },
      render: (_args: unknown, value: unknown) => {
        const result = value as { returned: number; truncation?: { truncated?: boolean; reasons?: string[] }; lines?: LogLine[]; hint?: string; level?: string; counts?: { scannedRows?: number }; warnings?: string[] }
        const lines = result.lines === undefined ? [] : result.lines
        const head = '返回 ' + String(result.returned) + ' 行' + (result.level === undefined ? '' : '（level ≥ ' + result.level + '）') + (result.counts?.scannedRows === undefined ? '' : '，扫描 ' + String(result.counts.scannedRows) + ' 行') + (result.truncation?.truncated === true ? '（截断：' + (result.truncation.reasons ?? []).join(' / ') + '）' : '')
        const tail = [result.hint === undefined ? '' : result.hint, ...(result.warnings ?? [])].filter((item) => item !== '')
        return [{ type: 'text', text: [head, renderLines(lines), ...tail].join('\n') }]
      },
    },
    async execute(args: unknown) {
      return await runSearch(deps, (args ?? {}) as Record<string, unknown>)
    },
  }))

  add('loglens_fields', defineTool({
    name: 'loglens_fields',
    isConcurrencySafe: () => true,
    description: '列出一个日志来源可用的字段 / 标签（Loki 走 /loki/api/v1/labels；ES / OpenSearch 走 _field_caps）。'
      + '常用筛选项（container.name / host.name / log.level 这类）排在最前面，**默认不截断、列全部**'
      + '（与 Kibana 的 _field_caps 同口径：长度在那边交给界面，在这边交给调用方自己权衡）——'
      + '一台通配全集群的来源可能有上千个字段、响应几十 KB，只想确认某几个字段在不在就先传 limit 收窄，'
      + '或用 loglens_facets 看哪些字段真有数据。'
      + '传了 limit 才可能截断，那时返回值里的 total / truncated 与 warnings 会说明。'
      + '容器行（`object` / `nested`，如 `container` / `host` 这类没有自己值的父级）不列；'
      + '同名在不同索引里落到不同宽类型族的标 `conflict: true`（带 esTypes 与 conflictDescriptions）——'
      + '那种字段拿去分组或筛值可能只覆盖一部分索引。'
      + '字段名**不用带 .keyword**（子字段行也不列）：适配器会自己按 _field_caps 决定怎么打。',
    parameters: {
      target: { type: 'string', description: '来源 id 或名称（loglens_sources 列出）；只有一个来源时可省略' },
      limit: { type: 'number', description: '最多列几个字段（不传 = 全部；传了就只列前这么多，正整数，无硬上限）' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          target: { type: 'object', required: true, additionalProperties: false, properties: { id: { type: 'string', required: true }, kind: { type: 'string', required: true }, label: { type: 'string', required: true } } },
          fields: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                name: { type: 'string', required: true },
                kind: { type: 'string', required: true },
                label: { type: 'string' },
                preferred: { type: 'boolean', description: 'true = 常用筛选项（排在前面）' },
                esTypes: { type: 'array', items: { type: 'string' }, description: '同名在不同索引里出现过的原生 ES 类型（只有多类型时才返回）' },
                conflict: { type: 'boolean', description: 'true = 同名在不同索引里落到了不同的**宽类型族**（Kibana 的 type: conflict）；拿它分组 / 筛值可能只覆盖一部分索引' },
                conflictDescriptions: { type: 'object', additionalProperties: true, properties: {}, description: '冲突时：每个原生类型各出现在哪些索引里' },
              },
            },
          },
          total: { type: 'number', required: true, description: '这个来源一共有多少字段（截断前；已去掉内部字段、.keyword 子行与 object/nested 容器行）' },
          truncated: { type: 'boolean', required: true },
          warnings: { type: 'array', required: true, items: { type: 'string' } },
        },
      },
      render: (_args: unknown, value: unknown) => [{ type: 'text', text: renderFields(value as FieldsView) }],
    },
    async execute(args: unknown) {
      return await runFields(deps, (args ?? {}) as Record<string, unknown>)
    },
  }))

  add('loglens_facets', defineTool({
    name: 'loglens_facets',
    isConcurrencySafe: () => true,
    description: '聚合：按字段分组（terms）看「谁在报错」/  按时间分桶（date_histogram）看趋势。'
      + '这是回答「某个服务健不健康」的正确工具——拉一页行到本地数既慢又错。'
      + '返回里的 otherCount（没列出来的桶还有多少条）与 countErrorUpperBound（计数误差上界）是**截断与近似信号**，别当成精确值。'
      + '当前只有 ES / OpenSearch 有它。',
    parameters: {
      target: { type: 'string', description: '来源 id 或名称（loglens_sources 列出）；只有一个来源时可省略' },
      by: { type: 'string', description: '按这个字段分组（terms），如 container.name / host.name / log.level' },
      interval: { type: 'string', description: '按时间分桶（如 5m / 1h / 1d）；与 by 可以同时要' },
      q: { type: 'string', description: '查询串（先筛出要统计的那部分日志；留空即全量）' },
      filters: {
        type: 'object',
        additionalProperties: true,
        description: '结构化过滤：字段 → 值（与 loglens_search 同一口径）',
      },
      from: {
        description: '起始时间：epoch 毫秒整数 / ISO 8601 / 相对时间；缺省 = to 前面 15 分钟',
        oneOf: [
          { type: 'number', description: 'epoch 毫秒整数' },
          { type: 'string', description: 'ISO 8601 或相对时间（-30m / -2h）' },
        ],
      },
      to: {
        description: '结束时间，写法同 from；缺省取当前时刻',
        oneOf: [
          { type: 'number', description: 'epoch 毫秒整数' },
          { type: 'string', description: 'ISO 8601 或相对时间' },
        ],
      },
      size: { type: 'number', description: '桶数上限（默认 10，硬上限 100）' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          target: { type: 'object', required: true, additionalProperties: false, properties: { id: { type: 'string', required: true }, kind: { type: 'string', required: true }, label: { type: 'string', required: true } } },
          window: { type: 'object', required: true, additionalProperties: false, properties: { from: { type: 'number', required: true }, to: { type: 'number', required: true } } },
          by: { type: 'string' },
          interval: { type: 'string' },
          buckets: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: { key: { type: 'string', required: true }, count: { type: 'number', required: true } },
            },
          },
          overTime: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: { ts: { type: 'number', required: true }, count: { type: 'number', required: true } },
            },
          },
          otherCount: { type: 'number', description: '没列出来的桶里还有多少条（截断信号）' },
          countErrorUpperBound: { type: 'number', description: '桶计数的误差上界（>0 = 近似值）' },
          warnings: { type: 'array', required: true, items: { type: 'string' } },
          hint: { type: 'string' },
        },
      },
      render: (_args: unknown, value: unknown) => {
        const result = value as {
          by?: string
          interval?: string
          buckets?: Array<{ key: string, count: number }>
          overTime?: Array<{ ts: number, count: number }>
          otherCount?: number
          countErrorUpperBound?: number
          warnings?: string[]
        }
        const parts: string[] = []
        if (result.buckets !== undefined) {
          const total = result.buckets.reduce((sum, bucket) => sum + bucket.count, 0)
          parts.push('按 ' + String(result.by) + ' 分组（' + String(result.buckets.length) + ' 个桶，共 ' + String(total) + ' 条）：')
          for (const bucket of result.buckets) parts.push('  ' + String(bucket.count) + '  ' + bucket.key)
          if (result.otherCount !== undefined) parts.push('  （另有 ' + String(result.otherCount) + ' 条在没列出来的桶里）')
        }
        if (result.overTime !== undefined) {
          parts.push('按 ' + String(result.interval) + ' 分桶（' + String(result.overTime.length) + ' 个时间点）：')
          for (const point of result.overTime) parts.push('  ' + formatTimestamp(point.ts) + '  ' + String(point.count))
        }
        for (const warning of result.warnings ?? []) parts.push(warning)
        return [{ type: 'text', text: parts.length === 0 ? '（没有结果）' : parts.join('\n') }]
      },
    },
    async execute(args: unknown) {
      return await runFacets(deps, (args ?? {}) as Record<string, unknown>)
    },
  }))

  add('loglens_context', defineTool({
    name: 'loglens_context',
    isConcurrencySafe: () => true,
    description: '取某一行的上下文：拿 loglens_search 返回的 ts（+ id 或 message）回到来源重查一遍，返回它前后各若干行（时间升序）。三个后端都没有原生的「某行前后 N 行」，所以这是重查，不是缓存。',
    parameters: {
      target: { type: 'string', description: '来源 id 或名称（loglens_sources 列出）；只有一个来源时可省略' },
      ts: { type: 'number', description: '锚点行的时间，epoch 毫秒（loglens_search 的 lines[].ts）' },
      id: { type: 'string', description: '锚点行的 id（loglens_search 的 lines[].id）；给了它就用它精确定位' },
      message: { type: 'string', description: '锚点行的正文（没有 id 时配合 ts 一起定位）' },
      before: { type: 'number', description: '要几行更早的（默认 5，上限 50）' },
      after: { type: 'number', description: '要几行更晚的（默认 5，上限 50）' },
      spanMs: { type: 'number', description: '重查的时间窗半径（默认 60000，即锚点前后各一分钟）' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          target: { type: 'object', required: true, additionalProperties: false, properties: { id: { type: 'string', required: true }, kind: { type: 'string', required: true }, label: { type: 'string', required: true } } },
          anchor: { ...LINE_SCHEMA, required: true },
          before: { type: 'array', required: true, items: LINE_SCHEMA },
          after: { type: 'array', required: true, items: LINE_SCHEMA },
          warnings: { type: 'array', required: true, items: { type: 'string' } },
        },
      },
      render: (_args: unknown, value: unknown) => {
        const result = value as { anchor?: LogLine; before?: LogLine[]; after?: LogLine[]; warnings?: string[] }
        const anchor = result.anchor
        if (anchor === undefined) return [{ type: 'text', text: '（没有锚点行）' }]
        return [{
          type: 'text',
          text: [
            '…更早 ' + String((result.before ?? []).length) + ' 行',
            renderLines(result.before ?? []),
            '→ ' + formatLine(anchor),
            renderLines(result.after ?? []),
            '…更晚 ' + String((result.after ?? []).length) + ' 行',
            ...(result.warnings ?? []),
          ].join('\n'),
        }]
      },
    },
    async execute(args: unknown) {
      const input = (args ?? {}) as Record<string, unknown>
      const picked = resolveTarget(deps.config(), input.target)
      if (!picked.ok) throw new Error(picked.error)
      const backend = deps.backendFor(picked.target.kind)
      if (backend === undefined) throw new Error(adapterHint(picked.target.kind))
      if (typeof input.ts !== 'number' || !Number.isInteger(input.ts)) {
        throw new Error('ts 必填：锚点行的时间（epoch 毫秒，取自 loglens_search 的 lines[].ts）')
      }
      const anchorTs = input.ts
      const before = clampCount(input.before, 5)
      const after = clampCount(input.after, 5)
      const spanMs = typeof input.spanMs === 'number' && Number.isInteger(input.spanMs) && input.spanMs > 0 ? input.spanMs : 60_000
      const normalized = normalizeQuery({
        targetId: picked.target.id,
        from: anchorTs - spanMs,
        to: anchorTs + spanMs,
        limit: before + after + 1,
        direction: 'backward',
      }, backend.capabilities())
      if (!normalized.ok) throw new Error(normalized.error)
      const result = await backend.query(normalized.query, picked.target)
      const lines = result.lines
      /*
       * id 有两个候选，**原值优先**（收口 H1）：
       *   ① 调用方给的原文（只去首尾空白）——ES 的 `_id` 用户可自定、**可以含 `#`**，而结构化返回值
       *      `lines[].id` 给的就是那个原文，照抄回来必须按原值命中；
       *   ② 剥掉一个前导 `#` 的变体——渲染文本给的坐标是 `#doc-42`（formatLine 的形态），原样抄回来也要能用。
       * 上一版**先剥**，于是真以 `#` 开头的 id 被剥没了、反而失配（坐标被改写）；现在两个都当精确档试，
       * 原值那档排在前面，所以两种抄法都不牺牲。
       */
      const givenId = typeof input.id === 'string' ? input.id.trim() : undefined
      const wantedId = givenId === undefined || givenId === '' ? undefined : givenId
      /*
       * 给了 id 但去掉空白后是空的：**按「没给」处理，但要说出来**（收口 G1）——否则 ts 兜底档的措辞会写
       * 「调用方没给 id」，而那是一句假话（他给了，只是全是空白）。与正文那侧的 messageBlank 同一口径：
       * 「被规范化丢掉」和「压根没给」是两件事，措辞不许把它们混成一件。
       */
      const idBlank = givenId === ''
      const strippedCandidate = wantedId === undefined || !wantedId.startsWith('#') ? undefined : wantedId.slice(1)
      const wantedIdStripped = strippedCandidate === undefined || strippedCandidate === '' || strippedCandidate === wantedId
        ? undefined
        : strippedCandidate
      const rawMessage = typeof input.message === 'string' ? input.message : undefined
      // 规范化后为空串的正文当「没给」（与 findAnchor 同一口径，同一个助手函数）：一个空格不该成为定位依据
      const needle = rawMessage === undefined ? undefined : normalizeWhitespace(rawMessage)
      const messageBlank = rawMessage !== undefined && (needle === undefined || needle === '')
      const wantedMessage = messageBlank ? undefined : rawMessage
      const found = findAnchor(lines, { anchorTs, wantedId, wantedIdStripped, wantedMessage })
      /*
       * 「锚点在整窗里唯一」不能只看 `ties`（复核 F1，2026-10-19）：`ties` 数的是**这次重查返回的这一页**，
       * 而这一页被 `limit = before + after + 1`（默认 11）截过、方向还是 backward——**最旧的那条最先被
       * 截掉**。于是完全可能出现「页内唯一」而「窗内还有一条同正文、更早的行」，那时闭嘴就等于把锚点
       * 静默换成了另一个时刻的同一段正文（复核实证：随机窗口里 36% 会这样）。
       * 所以要先把「整窗取全了吗」问出来：命中数与返回行数相等、或截断标记为假，两个判据任一到手才算。
       */
      const matched = result.counts.matched
      const windowComplete = matched !== undefined ? matched === lines.length : result.truncation.truncated === false
      if (found === undefined) {
        // 说清**这次实际试过哪几档**：不然调用方只能看到一句「没找到」，无从判断该补 id 还是放宽窗口
        const tried = [
          ...(wantedId === undefined ? [] : ['id 精确等于 ' + JSON.stringify(wantedId)
            + (wantedIdStripped === undefined ? '' : '（或剥掉一个前导 # 的 ' + JSON.stringify(wantedIdStripped) + '）')]),
          ...(wantedMessage === undefined ? [] : [
            '正文严格相等',
            '正文（去掉首尾与行内多余空白后）相等',
            '正文（去掉首尾与行内多余空白后）单向下标包含 —— 正文是 ' + JSON.stringify(needle),
          ]),
          '时间戳等于 ' + String(anchorTs) + '（**永远兜底**，不看有没有给正文）',
        ]
        const circled = ['①', '②', '③', '④', '⑤']
        /*
         * 被规范化丢掉的入参也要说出来（收口 G1，与 warnings 侧同一口径）：调用方发现列表里没有 id 档时，
         * 得知道那是因为他给的东西去掉空白后是空的，而不是工具把它弄丢了。
         */
        const dropped = [
          ...(idBlank ? ['你给的 id 去掉空白后是空的（按「没给 id」处理）'] : []),
          ...(messageBlank ? ['你给的正文去掉空白后是空的（按「没给正文」处理）'] : []),
        ]
        throw new Error('锚点行没在这次重查里返回。这次重查的定位方式（按优先级，逐档降级）：'
          + tried.map((item, index) => circled[index] + ' ' + item).join('；')
          + '。' + (dropped.length === 0 ? '' : '（注：' + dropped.join('；') + '。）')
          + '下一步：用 loglens_search 拿到该行的 id 再传 id（最稳），或把 spanMs 调大'
          + '（当前 ' + String(spanMs) + ' 毫秒）重查；也可能这行已被来源的保留期截掉。')
      }
      const index = found.index
      const anchor = lines[index]
      // lines 是 backward（新的在前）：比锚点更早的在 index 之后，更晚的在 index 之前。两侧都按时间升序返回，读起来跟日志文件一样。
      const older = lines.slice(index + 1, index + 1 + before).reverse()
      const newer = lines.slice(Math.max(0, index - after), index).reverse()
      /*
       * 锚点档位必须回给调用方（收口 F4）：非 id 档都是启发式挑出来的，静默换行等于让调用方
       * 以为自己拿的是精确坐标。warnings 通道 schema 里本来就有（output.warnings），render 也输出。
       * idMissed 回显的是**调用方给的原文**（收口 H5）——剥 `#` 只是内部候选，不该改写回显给他的东西。
       */
      const warnings = [
        ...normalized.warnings,
        ...anchorWarnings(found, {
          anchorTs,
          ...(wantedId === undefined ? {} : { idMissed: wantedId }),
          ...(needle === undefined || needle === '' ? {} : { needle }),
          ...(messageBlank ? { messageBlank: true } : {}),
          ...(idBlank ? { idBlank: true } : {}),
          windowComplete,
        }),
      ]
      return { target: describeTarget(picked.target), anchor, before: older, after: newer, warnings }
    },
  }))
}

/**
 * before / after 的夹取：负数夹到 **0**（不是回落缺省值——「要 0 行更早的」是合法诉求，夹成 5 就多给了），
 * 超过 50 夹到 50，**非整数**（含非 number）才回落缺省值。
 */
export function clampCount(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) return fallback
  if (value < 0) return 0
  return value > 50 ? 50 : value
}

/**
 * `loglens_context` 的锚点匹配档位，数字越小越可信（顺序就是优先级）。
 *
 * `idStripped` 单独占一档而不是并进 `id`：它是「剥掉一个前导 `#` 的变体」，只在**原值没命中**时
 * 才轮得到（收口 H1）。两者都是精确坐标档、都不发 warnings，但**原值必须优先**——否则真以 `#`
 * 开头的 id 会被剥过的变体压掉，坐标就被改写了（H1 那个回退正是这么来的）。
 */
const ANCHOR_TIERS = ['id', 'idStripped', 'exact', 'normalized', 'substring', 'ts'] as const
export type AnchorTier = typeof ANCHOR_TIERS[number]

/** 把行内连续空白折成一个空格再去首尾：日志正文里的对齐空白不该让锚点定位失败。 */
function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/**
 * 找锚点行：**一次遍历**，逐档降级，取命中的最高档；同档取离 anchorTs 最近的。
 *
 * 三条规则必须写下来，否则「宽松匹配」会不声不响地挑错行（loglens D06）：
 *
 * 1. **逐档降级，ts 永远兜底**：id 原值 → id 的剥 `#` 变体 → 正文严格相等 → 规范化空白后相等
 *    → 规范化空白后**单向包含** → `line.ts === anchorTs`。**ts 档不受「有没有给 message」影响**——
 *    给了一个匹配不上的正文，也仍然退回到时间戳那一档，而不是报「锚点行没在这次重查里返回」
 *    （行明明就在返回值里，那是假话）。这一档正是旧实现 `lines.findIndex(line => line.ts === anchorTs)`
 *    的无条件兜底，收口 F2 时恢复。
 * 2. **包含档两边都规范化**（`normalizeWhitespace(line.message).includes(needle)`）：needle 是调用方
 *    从 `formatLine` 的渲染文本里抄的，抄出尾随空格 / 行内双空格 / 首尾空白是常态，而它们规范化后
 *    都是子串。只对整条相等做规范化、包含档还用原始串，等于只修好一半（收口 F1）。
 *    **不做反向包含**（`needle.includes(line.message)`）：那会让一条短行（如 `error`）匹配掉整段长正文，
 *    等于「随便找一行」——语义危险。
 * 3. **同档多候选有确定的挑法**：先比 `|line.ts - anchorTs|`（小的赢），并列再比 id、message 的字典序
 *    （小的赢，但**空 id 排最后**——优先挑「有坐标」的那一行），最后才比 ts。为什么非要一个
 *    **与数组顺序无关**的次级键：正文片段这类匹配天生不唯一（`Connection refused` 一小时内能出现
 *    几十次），而来源的返回次序会随查询窗口变化（`loglens_search` 有 direction，context 的重查恒
 *    backward）——只按「谁在前」挑，等于让调用方读到的那一行与这里挑中的那一行**可以不是同一行**，
 *    且全程无声（收口 F5）。
 *
 * 档位是**启发式**，所以调用方必须能看见它挑中了哪一档——`findAnchor` 把 kind 返回出去，
 * 由 `loglens_context` 转成 warnings（收口 F4）。
 */
export function findAnchor(
  lines: readonly LogLine[],
  wanted: { anchorTs: number, wantedId?: string, wantedIdStripped?: string, wantedMessage?: string },
): { index: number, kind: AnchorTier, ties: number } | undefined {
  /*
   * 规范化后为空串的 needle 一律当「没给 message」（收口 F6）：否则 `message: " "` 会退化成
   * 「任何含空格的行」，凭一个空格就命中一行，且毫无信号。
   */
  const rawNeedle = wanted.wantedMessage
  const needle = rawNeedle === undefined ? undefined : normalizeWhitespace(rawNeedle)
  const message = needle === undefined || needle === '' ? undefined : rawNeedle
  const activeNeedle = message === undefined ? undefined : needle
  let best: { index: number, tier: number } | undefined
  /** 当前最低档被命中的行数：`1` = 锚点在窗口内唯一（降噪靠它，见下面的注释）。 */
  let ties = 0
  /*
   * 同档并列的次级键：距离 → id → message → ts，逐级比较，取**小**者。
   *
   * 这是一份**确定**的比较，但仍**不是数学意义上的全序**：四个键可以全部并列（同距 + 同 id +
   * 同 message + 同 ts），此时两条行只在 labels / source 之类上不同，比较两边都返回 false，
   * 于是由 lines 的排列顺序决定（收口 H3，本轮明确不修：ES 的 `_id` 唯一、Loki 的 id 是
   * `tsNs:序号` 唯一，只有 ES `_id` 缺失回落成 `''` 时才可能，可达性极低）。
   * 除了那个残余，结果与排列顺序无关。
   */
  const wins = (candidate: LogLine, champion: LogLine): boolean => {
    const byDistance = Math.abs(candidate.ts - wanted.anchorTs) - Math.abs(champion.ts - wanted.anchorTs)
    if (byDistance !== 0) return byDistance < 0
    if (candidate.id !== champion.id) {
      // 空 id 排最后（收口 H4）：并列时优先挑「有坐标」的那一行，调用方拿它还能继续精确定位
      if (candidate.id === '') return false
      if (champion.id === '') return true
      return candidate.id < champion.id
    }
    if (candidate.message !== champion.message) return candidate.message < champion.message
    return candidate.ts < champion.ts
  }
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    if (line === undefined) continue   // noUncheckedIndexedAccess：下标访问在类型上可能是 undefined
    const normalized = activeNeedle === undefined ? '' : normalizeWhitespace(line.message)
    const tier = wanted.wantedId !== undefined && line.id === wanted.wantedId
      ? 0
      : wanted.wantedIdStripped !== undefined && line.id === wanted.wantedIdStripped
        ? 1
        : message !== undefined && line.message === message
          ? 2
          : activeNeedle !== undefined && normalized === activeNeedle
            ? 3
            : activeNeedle !== undefined && normalized.includes(activeNeedle)
              ? 4
              : line.ts === wanted.anchorTs ? 5 : undefined
    if (tier === undefined) continue
    /*
     * ties 数的是**同一档**被命中的行数（不只是「谁赢了」）：它是「这个锚点是否唯一」的手里唯一的判据，
     * 降噪要靠它——窗口内正文只出现一次时不必警告「可能不是你要的那一行」。
     * 只在**当前最低档**上累积：更高档出现时把计数清零重来（低档的命中不算这一档的多解）。
     */
    if (best === undefined || tier < best.tier) {
      best = { index, tier }
      ties = 1
      continue
    }
    if (tier > best.tier) continue
    ties += 1
    // 同档：让 wins 决定谁留下（它决定不了就保留先到的那个，见上面 H3 的说明）
    if (!wins(line, lines[best.index] as LogLine)) continue
    best = { index, tier }
  }
  return best === undefined
    ? undefined
    : { index: best.index, kind: ANCHOR_TIERS[best.tier] as AnchorTier, ties }
}

/** 档位的人话说法（进 warnings，让调用方知道这个锚点是**怎么**挑出来的，收口 F4）。 */
const ANCHOR_TIER_LABEL: Record<AnchorTier, string> = {
  id: 'id 精确相等',
  idStripped: 'id 精确相等（剥掉一个前导 `#` 的变体）',
  exact: '正文严格相等',
  normalized: '正文（规范化空白后）相等',
  substring: '正文（规范化空白后）单向包含',
  ts: '只按时间戳相等',
}

/**
 * 「精确坐标」档：命中它说明调用方给的 id 真的对上了某一行，可以闭嘴。
 *
 * 两档都算（收口 H1）：原值档与剥 `#` 变体档都是同一件事——id 对上号了；
 * 「照渲染 token `#doc-42` 回抄」走的正是 `idStripped`，不该因此被当成模糊命中来唠叨。
 */
const PRECISE_ID_TIERS: readonly AnchorTier[] = ['id', 'idStripped']

/**
 * 锚点档位 → 一句 warnings（收口 F4：kind 不能被丢掉）。
 *
 * 为什么必须说：模糊档（normalized / substring）和 ts 兜底档都是**启发式**，候选不唯一时挑中的
 * 未必是调用方要的那一行，而唯一能暴露启发式的东西就是**档位**——不说等于静默换行。
 * 只有精确坐标档（见 {@link PRECISE_ID_TIERS}）可以闭嘴。
 *
 * 措辞必须**按实际入参**分支（收口 H2）：`idMissed` 在场就别说「没给 id」，
 * 正文是「给了但规范化后为空」也别说「没给正文」——同一条 warnings 里自相矛盾比不说更坏。
 */
function anchorWarnings(found: { kind: AnchorTier, ties: number }, context: {
  anchorTs: number
  /** 调用方给过 id（**原文**，没剥过 `#`）但没匹配上任何行。 */
  idMissed?: string
  /** 规范化后有效的正文 needle（空串按没给处理）。 */
  needle?: string
  /** 调用方给了正文，但它规范化后是空串、于是按「没给」处理。 */
  messageBlank?: boolean
  /** 调用方给了 id，但它去掉空白后是空串、于是按「没给」处理（收口 G1：与 messageBlank 同一口径）。 */
  idBlank?: boolean
  /**
   * 这次重查**把整个时间窗都取回来了吗**（复核 F1）。`false` 表示这一页被 `limit` 截过——
   * 于是 `found.ties === 1` 只说明「**这一页**里唯一」，不等于「窗里唯一」，不能据此闭嘴。
   */
  windowComplete: boolean
}): string[] {
  const warnings: string[] = []
  if (context.idMissed !== undefined && !PRECISE_ID_TIERS.includes(found.kind)) {
    warnings.push('给的 id ' + JSON.stringify(context.idMissed) + ' 在这次重查里没匹配到任何行，'
      + '锚点是用「' + ANCHOR_TIER_LABEL[found.kind] + '」定的——如果你要的是那一行，先核对 id 有没有抄错、'
      + '或它是否已过来源的保留期。')
  }
  if (PRECISE_ID_TIERS.includes(found.kind)) return warnings
  const basis = context.needle === undefined ? '' : '，依据是正文 ' + JSON.stringify(context.needle)
  /*
   * 降噪（2026-10-19，复核 F1 修正）：**只有「整窗都取回来了」且「页内唯一」时才值得闭嘴**。
   *
   * `ties === 1` 只是「**这一页**里这一档只命中一行」——而这一页被 `limit`（默认 11）截过、方向还是
   * backward（最旧的行最先被截掉）。把「页内唯一」当成「窗内唯一」，就会在调用方给的锚点恰好被截到
   * 页外、而页内又有一条同正文的行时**静默换行**（复核实证 36%）。所以额外要求 `windowComplete`。
   */
  const unique = found.ties === 1 && context.windowComplete
  /** 多解计数只能说成「这一页里有 N 行」：我们手里只有这一页，窗里究竟几条并不知道。 */
  const scope = context.windowComplete ? '同一时间窗里' : '**这一页**里'
  if (found.kind === 'exact') {
    if (!unique) {
      warnings.push('锚点按「正文严格相等」定位（不是 id）' + basis + '：' + scope + '有 '
        + String(found.ties) + ' 行正文完全相同，取的是离 ts = ' + String(context.anchorTs)
        + ' 最近的一条。要精确锁定请传 id。')
    }
    // 唯一命中时一句都不说：正文逐字对上了、窗口里只有这一条，没有可误导的地方
  } else if (found.kind === 'normalized' || found.kind === 'substring') {
    /*
     * 两档的**可信度不同**，措辞不该一样（降噪 2）：`normalized` 是「整条正文只差空白」——内容完全
     * 相同，只是空白被折叠过，它跟严格相等几乎一样可靠；`substring` 才是真正「可能挑错行」的那一档
     * （片段能在几十条里出现）。上一版对两档用同一句「**这是模糊命中，可能不是你要的那一行**」，
     * 对前者是过度惊吓。
     */
    if (found.kind === 'normalized') {
      warnings.push('锚点按「正文（规范化空白后）相等」定位' + basis + '：整条正文对上了，只是空白与原文'
        + '不完全一致（换行/缩进/多余空格被折叠）——内容是同一条。'
        + (unique ? '' : scope + '有 ' + String(found.ties) + ' 行规范化后相同，取的是离 ts 最近的一条。'))
    } else {
      warnings.push('**这是模糊命中，可能不是你要的那一行**：锚点按「' + ANCHOR_TIER_LABEL[found.kind] + '」'
        + '定位' + basis + '——原文并不逐字相同'
        + (unique ? '' : '，且' + scope + '有 ' + String(found.ties) + ' 行都含这个片段')
        + '。请核对上面的 anchor 是不是你要的行，或改用 id 精确定位。')
    }
  } else {
    // ts 兜底档：把「为什么退到这一档」按**实际入参**说清楚，别拿一句笼统的「没给」糊过去（收口 H2）
    const reasons: string[] = []
    if (context.idMissed !== undefined) reasons.push('给的 id 没匹配到')
    else if (context.idBlank === true) reasons.push('给的 id 去掉空白后是空的（按「没给 id」处理）')
    if (context.messageBlank === true) reasons.push('正文去掉空白后是空的（按「没给正文」处理）')
    else if (context.needle !== undefined) reasons.push('给的正文没匹配上任何一行')
    if (reasons.length === 0) reasons.push('调用方没给 id 也没给正文')
    warnings.push('锚点**只按时间戳**定位（ts = ' + String(context.anchorTs) + '）：'
      + reasons.join('、') + '，于是退回到时间戳兜底。同一毫秒若有多行，这不保证是你要的那一行——请传 id。')
  }
  return warnings
}
