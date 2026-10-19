/**
 * @hyzyn/dsh-loglens — 行的「可观性」：标签展平 + 级别推断（2026-10-11，真机反馈第 1、7 条）。
 *
 * 为什么单独一层：这两件事**与后端无关**（ES 的 _source、Loki 的流标签、日后的别的后端都要），
 * 而且面板行视图、loglens_context、agent 工具吃的是同一个 LogLine 模型——判据只能有一份。
 *
 * 现场（agent 在真集群上给的批评，代价最大的那条）：filebeat 的文档里 container / host / agent / log
 * **全是嵌套对象**，而第一版只把标量收进 labels，于是 60 行输出里唯一的标签是 stream=stdout——
 * **看不出是哪台机器、哪个容器**。它只能绕出插件用 curl 自己摸，而一绕出去，
 * 出站围栏 / 认证 / 归一化就全没了。
 */
import type { LogLine } from './backends/types.js'

/**
 * 优先键（点分路径）：**谁在写这行**。按这个顺序先占标签名额，剩下的才轮到文档里的其它字段。
 *
 * 顺序就是「排查时先问什么」：哪个容器 / 哪个 Pod → 哪台机器 → 哪个服务 → 哪个文件 → 什么流。
 * 名单刻意短：它在 LABEL_LIMIT 之内抢位置，多一个就挤掉一个真字段。
 */
export const LABEL_PRIORITY: readonly string[] = [
  'container.name',
  'kubernetes.container.name',
  'kubernetes.pod.name',
  'host.name',
  'host.hostname',
  'service.name',
  'log.file.path',
  'log.logger',
  'stream',
  'kubernetes.namespace',
  'container.image.name',
  'kubernetes.node.name',
  // 采集器（filebeat 之类）**故意排在后面**：它整个集群都一样，是背景不是身份
  'agent.name',
  'cloud.instance.id',
]

/** 已经搬到显式字段上的键，不再进 labels（与后端里那份口径一致）。 */
export const CONSUMED_KEYS: readonly string[] = ['@timestamp', 'timestamp', 'message', 'level', 'log.level']

/** 单个标签值的长度上限：日志里一个字段可能是整段堆栈，labels 不是放它的地方（raw 里有全文）。 */
export const LABEL_VALUE_MAX = 160

/** 展平时最多下钻几层：够覆盖 filebeat / k8s / ECS 的常规嵌套，不至于把整棵树摊开。 */
const MAX_DEPTH = 3

function shortValue(value: string): string {
  return value.length > LABEL_VALUE_MAX ? value.slice(0, LABEL_VALUE_MAX) + '…' : value
}

/** 标量或「标量数组」→ 字符串；对象留给递归，其它（null / 嵌套数组）丢掉。 */
function scalarText(value: unknown): string | undefined {
  if (typeof value === 'string') return value === '' ? undefined : shortValue(value)
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) {
    const parts: string[] = []
    for (const item of value) {
      if (typeof item !== 'string' && typeof item !== 'number' && typeof item !== 'boolean') continue
      parts.push(String(item))
    }
    return parts.length === 0 ? undefined : shortValue(parts.join(','))
  }
  return undefined
}

/**
 * 把一棵文档树摊成「点分路径 → 字符串」。**优先键先占位**，其余按文档顺序补到上限。
 *
 * 传进来的 source 不被改（返回的是新对象）。limit 是标签条数上限；优先键也超过上限时按名单顺序
 * 截断——宁可缺一个次要字段，也不让一行把整页撑爆。
 */
export function flattenLabels(
  source: Record<string, unknown>,
  options: { limit?: number, priority?: readonly string[] } = {},
): Record<string, string> {
  const limit = options.limit === undefined ? 20 : options.limit
  const priority = options.priority === undefined ? LABEL_PRIORITY : options.priority
  const flat: Record<string, string> = {}
  const consumed = new Set<string>(CONSUMED_KEYS)
  const walk = (node: Record<string, unknown>, prefix: string, depth: number): void => {
    for (const [key, value] of Object.entries(node)) {
      const path = prefix === '' ? key : prefix + '.' + key
      if (consumed.has(path)) continue
      const text = scalarText(value)
      if (text !== undefined) {
        flat[path] = text
        continue
      }
      if (depth < MAX_DEPTH && typeof value === 'object' && value !== null && !Array.isArray(value)) {
        walk(value as Record<string, unknown>, path, depth + 1)
      }
    }
  }
  walk(source, '', 0)

  const labels: Record<string, string> = {}
  for (const key of priority) {
    if (Object.keys(labels).length >= limit) break
    const value = flat[key]
    if (value !== undefined) labels[key] = value
  }
  for (const [key, value] of Object.entries(flat)) {
    if (Object.keys(labels).length >= limit) break
    if (labels[key] !== undefined) continue
    labels[key] = value
  }
  return labels
}

/* ============================ 级别 ============================ */

/** 归一化后的级别（严重度从低到高）。 */
export type CanonicalLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'

/** 严重度排序：level=warn 是「warn 及以上」，这是日志查看器的通行语义。 */
const SEVERITY: Record<CanonicalLevel, number> = { trace: 0, debug: 1, info: 2, warn: 3, error: 4, fatal: 5 }

/** 级别参数的合法取值（工具 schema 与文案都取它）。 */
export const CANONICAL_LEVELS: readonly CanonicalLevel[] = ['trace', 'debug', 'info', 'warn', 'error', 'fatal']

/** 各家写法 → 归一化级别（logback / python / syslog / ECS 都在里面）。 */
const LEVEL_ALIASES: Record<string, CanonicalLevel> = {
  trace: 'trace', verbose: 'trace',
  debug: 'debug', dbg: 'debug', fine: 'debug',
  info: 'info', information: 'info', notice: 'info',
  warn: 'warn', warning: 'warn',
  error: 'error', err: 'error', severe: 'error',
  fatal: 'fatal', critical: 'fatal', crit: 'fatal', alert: 'fatal', emergency: 'fatal', panic: 'fatal',
}

/** 任意写法 → 归一化级别；认不出就是 undefined（**不猜**）。 */
export function canonicalLevel(raw: unknown): CanonicalLevel | undefined {
  if (typeof raw !== 'string') return undefined
  const key = raw.trim().toLowerCase()
  return LEVEL_ALIASES[key]
}

/**
 * 这个级别算不算「够严重」。undefined（行上没有级别）**不算命中**：不能把「不知道」当成「是 error」。
 *
 * 语义是**及以上**：问 level=warn 得到 warn + error + fatal——这是日志查看器的通行口径，
 * 也是排查时真正的意思（「把值得看的都给我」）。
 */
export function levelMatches(actual: string | undefined, wanted: CanonicalLevel): boolean {
  const mine = canonicalLevel(actual)
  if (mine === undefined) return false
  return SEVERITY[mine] >= SEVERITY[wanted]
}

/** 级别文案（工具与 README 共用）：warn 的意思是 warn 及以上。 */
export function levelHint(wanted: CanonicalLevel): string {
  return wanted === 'fatal' ? 'fatal' : wanted + ' 及以上'
}

/*
 * 推断的正则（按顺序试，第一条命中就停）。**刻意只在「级别该出现的位置」找**：
 * 正文里恰好有 ERROR 这个词（如 logback 的 Propagating ERROR level on Logger[...]）不算——
 * 那类噪声正是用户点名不要的。
 */
const LEVEL_PATTERNS: readonly RegExp[] = [
  /^\[(TRACE|DEBUG|INFO|NOTICE|WARN|WARNING|ERROR|ERR|FATAL|CRITICAL|SEVERE)\s*\]/iu,
  /(?:^|[\s,{"'])(?:level|severity|lvl)["']?\s*[=:]\s*["']?([A-Za-z]+)/iu,
  /*
   * JSON 正文里的 **`"log.level":"info"`**（真机 2026-10-19）：上一条模式只认裸 `level`，
   * 而 ECS 惯例的键名带点（`log.level`），那个 `.` 把匹配打断了。补一条专门认带点前缀的键。
   */
  /["']?(?:log\.)?level["']?\s*:\s*["']?([A-Za-z]+)/iu,
  /^(TRACE|DEBUG|INFO|NOTICE|WARN|WARNING|ERROR|ERR|FATAL|CRITICAL|SEVERE)\b/u,
  /\d{2}:\d{2}:\d{2}[.,]\d{3}\s+(TRACE|DEBUG|INFO|WARN|ERROR)\s/u,
  /^(TRACE|DEBUG|INFO|WARN|ERROR)\s+\d{4}-\d{2}-\d{2}/u,
  /*
   * logback 自己的状态日志（真机 2026-10-19 抓到，固定窗口里 139 条未分类中占大头）：
   *   `18:31:54,850 |-INFO in ch.qos.logback.classic.joran.action.ConfigurationAction - …`
   *   `18:31:54,849 |-WARN in ch.qos.logback.core.joran.spi.ConfigurationWatchList@…`
   * 形态是「时间 + `|-` + 级别 + ` in ` + 类名」。级别**不在行首**、也没有 `level=`，所以前面几条
   * 模式都落空；而它确实是**独立日志**（不是上一条的续行），所以必须在这里认出来，
   * 否则它会被误判成"无级别"，进而被按级别筛时静默丢掉。
   */
  /\d{2}:\d{2}:\d{2}[.,]\d{3}\s+\|-\s*(TRACE|DEBUG|INFO|WARN|ERROR)/u,
]

/**
 * 从正文推断级别。测的形态都是真机里出现过的：方括号包着的断语、level=ERROR、
 * ERROR 开头的行、以及 logback 的 14:00:00.123 ERROR 12345 --- [main] 这种。
 */
export function inferLevel(message: string): CanonicalLevel | undefined {
  const text = message.length > 400 ? message.slice(0, 400) : message
  for (const pattern of LEVEL_PATTERNS) {
    const matched = pattern.exec(text)
    if (matched === null) continue
    const level = canonicalLevel(matched[1])
    if (level !== undefined) return level
  }
  return undefined
}

/*
 * 「堆栈续行」的形状。**这不是级别推断**，是「这条压根不是一条独立的日志」的判据。
 *
 * 为什么需要它（真机 2026-10-19）：采集侧没配 multiline，一次 Java 异常会被拆成 5–30 个文档——
 * 首文档带 `[ERROR] …` 前缀，其余是 `\tat …` / `Caused by:` / `### Error querying …` / `... N more`。
 * 实测 400 条样本里 **63% 属于这一类**：正文里没有任何级别词，`inferLevel` 返回 undefined，
 * 于是它们在「按级别筛 / 按级别分组」时被**静默丢掉**——用户看到的 error 数因此偏小，
 * 而偏小的原因（"它们是同一次异常的后半截"）界面上一个字都没有。
 *
 * 判据刻意保守：只认**堆栈语法本身的形态**，不靠"看起来像"。宁可漏标（漏标只是维持现状），
 * 也不能把一条正常日志标成续行（那会让它被排除在任何级别之外）。
 */
const CONTINUATION_PATTERNS: readonly RegExp[] = [
  /^\s+at\s+\S/u,                    // \tat com.foo.Bar.method(Bar.java:42)
  /^\s*\.\.\.\s*\d+\s+more\s*$/u,   // ... 23 more
  /^\s*Caused by:\s/u,                // Caused by: java.lang.IllegalStateException
  /^\s*Suppressed:\s/u,               // Suppressed: （try-with-resources / addSuppressed）
  /^\s*###\s/u,                       // MyBatis 的 ### Error querying / ### The error may exist
  /^\s*(?:Exception|Error)\s+in\s+thread\b/u,
  /*
   * 下面两条是真机补的（2026-10-19，200 条样本里各占 11/11 条）：MyBatis 把一次异常拆成固定 11 条，
   * 其中两条既没有 `###` 前缀、也不是 `\tat`：
   *   · `org.springframework.jdbc.BadSqlGrammarException: ` —— **异常类名 + 冒号**（无 message 的头）
   *   · `; bad SQL grammar []`                                  —— 上一行的**续句**（以分号开头）
   * 前者靠「整行就是一个类名:」的形态认，后者靠「行首分号」认——两者都只可能是续行：
   * 一条独立日志不会以分号开头，也不会以「类名:」结束而没有内容。
   */
  /^[\w$]+(?:\.[\w$]+)+Exception:\s*$/u,
  /^\s*;/u,
]

/**
 * 这一行是不是**上一条日志的续行**（堆栈后半截 / MyBatis 诊断块），而不是一条独立的日志。
 *
 * 只对「正文里没有级别」的行有意义——有级别就是一条独立日志，不必问。所以调用方是
 * {@link withLevel}：推断不出级别时再问这一句，避免把 `[ERROR] \tat …` 这种（首行带级别的）
 * 误标成续行。
 */
export function isContinuation(message: string): boolean {
  const head = message.split('\n', 1)[0] ?? ''
  // 首行就有级别 → 它是一条独立日志（哪怕后面跟着堆栈）
  if (inferLevel(head) !== undefined) return false
  const text = head.length > 400 ? head.slice(0, 400) : head
  for (const pattern of CONTINUATION_PATTERNS) {
    if (pattern.test(text)) return true
  }
  return false
}

/**
 * 给一行补级别：**文档 / 流标签里有就用它，没有才从正文推断**，并标出级别是推断来的。
 *
 * 为什么要标：level 是筛选项，而「文档说它是 error」与「我从正文看着像 error」是两种可信度——
 * 契约里不许把后者写成前者（与 totalKnown 同一口径）。
 */
export function withLevel(line: LogLine, candidates: Array<unknown>): LogLine {
  for (const candidate of candidates) {
    const level = canonicalLevel(candidate)
    if (level !== undefined) return { ...line, level }
  }
  const guessed = inferLevel(line.message)
  if (guessed === undefined) {
    /*
     * 推断不出级别：先问「它是不是上一条的续行」（真机 63% 属于这一类）。
     * 标出来之后，按级别筛 / 分组时就能说清「另有 N 条是无级别的堆栈续行」，
     * 而不是让它们静默消失——**「不知道」与「不属于任何级别」是两件事**。
     */
    return isContinuation(line.message) ? { ...line, levelContinuation: true } : line
  }
  return { ...line, level: guessed, levelInferred: true }
}
