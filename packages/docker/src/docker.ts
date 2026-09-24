/**
 * @hyzyn/dsh-docker — Docker CLI 封装与输出解析。
 *
 * 设计要点：
 *   - **命令一律以 argv 数组构造**，远程经 shJoin 单引号转义、本机直接
 *     spawn（不经 shell）；用户输入（容器名/ID/命令）先过 assertRef 白名单。
 *   - **解析容错优先**：docker CLI 的 `--format '{{json .}}'` 字段随版本增减，
 *     解析器对缺字段一律降级（State 缺失就从 Status 推导），不抛异常；
 *     需要权威数据时用 `docker inspect`。
 *   - 纯函数（parse*）单独导出，供 scripts/smoke.mjs 用固定输出做回归。
 */
import type { ExecResult, HostKeyStore, SshSpec, ExecLogger, StreamHandlers, StreamResult } from './ssh-exec.js'
import { RemoteExec, runLocal, runLocalStream, sshTarget } from './ssh-exec.js'

export type { StreamHandlers, StreamResult } from './ssh-exec.js'

/* ------------------------------------------------------------------ *
 * 通用：校验与解析工具
 * ------------------------------------------------------------------ */

/** 容器名 / ID / 镜像引用白名单（docker 允许字母数字与 _.- ，首字符为字母数字）。 */
const REF_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/

/** 校验一个 docker 引用（容器名 / ID / 镜像）。不合法直接抛错，绝不拼接进命令。 */
export function assertRef(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${field} 不能为空`)
  const trimmed = value.trim()
  if (trimmed.length > 128) throw new Error(`${field} 过长（≤128 字符）`)
  if (!REF_RE.test(trimmed)) throw new Error(`${field} 含非法字符（仅允许字母、数字、_ . -）：${trimmed}`)
  return trimmed
}

/**
 * docker CLI 可执行文件 / 路径的白名单（argv[0]，不设默认值以免误用其他程序）。
 *
 * 字符集必须容得下 **Windows 绝对路径**：`C:\Program Files\Docker\Docker\resources\
 * bin\docker.exe` 里有盘符 `:`、分隔符 `\` 和空格。这三样缺任何一个，Windows 用户都
 * 填不进自己的 docker —— 而填不进时拿到的是 400，却没有一句话解释为什么（真机实测）。
 *
 * 仍然拒绝：`;` `&` `|` `<` `>` 引号 反引号 `$` `%` `!` `^` 换行等 shell 元字符，
 * 以及**任何**以 `-` 开头的 token（看起来像 flag 的值会被 docker 当选项解析）——
 * 校验的是每一个空格分隔的 token，不是只看整串首字符（D43）。空格只允许出现在
 * 内部且不成串。本机通道一律以 argv 数组启动、不经 shell（远程走 shJoin），这层是纵深防御。
 */
const BIN_RE = /^(?!-)[A-Za-z0-9_./:\\-]+(?: (?!-)[A-Za-z0-9_./:\\-]+)*$/

/** 校验 docker CLI 可执行文件路径；空值回落到 `docker`。 */
export function assertBin(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') return 'docker'
  const trimmed = value.trim()
  if (!BIN_RE.test(trimmed)) throw new Error(`dockerBin 含非法字符（仅允许字母、数字与 _ . / \\ : - 及内部空格，且不能以 - 开头）：${trimmed}`)
  return trimmed
}

/**
 * 镜像引用白名单：比容器名宽松——允许 registry / 仓库路径 / tag / digest
 * （`ghcr.io/foo/bar:1.2`、`sha256:...`、`repo@sha256:...`），但仍拒绝空格、
 * 引号、`;`、`$()`、反引号等 shell 元字符，且**首字符必须是字母数字**——
 * 这样 `-f` / `--force` 这类看起来像 flag 的输入会被直接拒绝，不会被 docker
 * 当成选项解析。命令一律以 argv 数组构造（本机不经 shell、远程经 shJoin 转义），
 * 这层白名单是纵深防御。
 */
const IMAGE_REF_RE = /^[A-Za-z0-9][A-Za-z0-9_.:/@-]*$/

/** 校验一个镜像引用（tag / digest / ID）。不合法直接抛错，绝不拼接进命令。 */
export function assertImageRef(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${field} 不能为空`)
  const trimmed = value.trim()
  if (trimmed.length > 255) throw new Error(`${field} 过长（≤255 字符）`)
  if (!IMAGE_REF_RE.test(trimmed)) throw new Error(`${field} 含非法字符（仅允许字母、数字与 _ . : / @ -）：${trimmed}`)
  return trimmed
}

/**
 * 网络 / 卷名白名单：比镜像引用更窄——docker 的网络名与卷名都不允许 `/` 和 `:`。
 * 刻意**不复用** assertImageRef：那一个为了 registry / digest 放行了 `/:@`，
 * 拿来做这里的校验等于把口径放宽了（比如 `a/b` 会被放行）。
 * 首字符必须是字母数字，`--force` 这类看起来像 flag 的输入在进 argv 前就被拒。
 */
const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/

/** 校验一个 docker 网络 / 卷名（也是 inspect / rm 的引用）。 */
export function assertName(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${field} 不能为空`)
  const trimmed = value.trim()
  if (trimmed.length > 128) throw new Error(`${field} 过长（≤128 字符）`)
  if (!NAME_RE.test(trimmed)) throw new Error(`${field} 含非法字符（仅允许字母、数字与 _ . -）：${trimmed}`)
  return trimmed
}

/** 逐行 JSON 解析：兼容 `{{json .}}`（每行一个对象）与整体 JSON 数组。 */
export function parseJsonLines(text: string): Record<string, unknown>[] {
  const trimmed = text.trim()
  if (trimmed === '') return []
  if (trimmed.startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(trimmed)
      if (Array.isArray(parsed)) return parsed.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    } catch {
      /* 落到逐行解析 */
    }
  }
  const rows: Record<string, unknown>[] = []
  for (const line of trimmed.split(/\r?\n/)) {
    const one = line.trim()
    if (one === '' || !one.startsWith('{')) continue
    try {
      const parsed: unknown = JSON.parse(one)
      if (typeof parsed === 'object' && parsed !== null) rows.push(parsed as Record<string, unknown>)
    } catch {
      /* 跳过非 JSON 行（警告文本等） */
    }
  }
  return rows
}

/** 取字符串字段（大小写不敏感，兼容不同版本字段名）。 */
function str(row: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const direct = row[key]
    if (typeof direct === 'string') return direct
    const lower = row[key.toLowerCase()]
    if (typeof lower === 'string') return lower
    const upper = row[key.toUpperCase()]
    if (typeof upper === 'string') return upper
  }
  return ''
}

/** `12.3MiB` / `1.2kB` / `0B` → 字节数（解析失败返回 null）。 */
export function parseDockerSize(text: string): number | null {
  const match = /^\s*([0-9]+(?:\.[0-9]+)?)\s*([a-zA-Z]*)\s*$/.exec(text)
  if (match === null) return null
  const value = Number(match[1])
  const unit = (match[2] ?? '').toLowerCase()
  const scale: Record<string, number> = {
    '': 1,
    b: 1,
    kb: 1e3,
    kib: 1024,
    mb: 1e6,
    mib: 1024 ** 2,
    gb: 1e9,
    gib: 1024 ** 3,
    tb: 1e12,
    tib: 1024 ** 4,
    pb: 1e15,
    pib: 1024 ** 5,
  }
  const factor = scale[unit]
  if (factor === undefined) return null
  return Math.round(value * factor)
}

/** `12.34%` → 12.34（解析失败返回 null）。 */
export function parsePercent(text: string): number | null {
  const match = /^\s*([0-9]+(?:\.[0-9]+)?)\s*%\s*$/.exec(text)
  if (match === null) return null
  return Number(match[1])
}

/** `1.2kB / 0B` → { rx, tx }（解析失败一侧为 null）。 */
export function parseIOPair(text: string): { rx: number | null; tx: number | null } {
  const [left = '', right = ''] = text.split('/')
  return { rx: parseDockerSize(left), tx: parseDockerSize(right) }
}

/** docker 失败时的单行摘要：优先 stderr，其次 stdout，最后退出码。 */
function firstLine(stderr: string, stdout: string, code: number | null): string {
  return (stderr.trim() || stdout.trim() || `退出码 ${String(code)}`).split('\n')[0] ?? `退出码 ${String(code)}`
}

/**
 * `--since` 的统一口径（D45）：时长（docker 的 Go duration 语法，允许复合如
 * `1h30m`）、Unix 秒或时间戳。events 与 logs 两条路径此前各有一套——events
 * 白名单偏窄（复合 duration 被拒）、logs 完全不校验（docker 的参数错误变成
 * 不可读的报错）。纯校验函数：合法返回原样串，不合法抛错。
 *
 * 与 docker 的口径**双向对齐**（D99）：
 *   ① duration 支持小数与 `0`——Go 的 `time.ParseDuration` 接受 `1.5h` 与 `0`，
 *      旧正则的 `\d+` 把它们当成非法输入拒了（用户明明写的是合法参数）；
 *   ② 裸数字仍按 docker 语义当 Unix 秒（`--since 3600` = 一小时前）；
 *   ③ 时间戳必须**带时间部分**——`2026-09-13` 这种裸日期此前被放行，docker
 *      多半原样报参数错误，不如在这里拒绝；
 *   ④ 报错回显原始值，否则调用方（尤其是 agent）不知道是哪一段没通过。
 */
export function assertSince(value: unknown, field: string = 'since'): string {
  const usage = '时长（如 30m、2h、1h30m、1.5h）、Unix 秒（如 3600）或含时间的时间戳（如 2026-09-13T10:00:00）'
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${field} 必填（${usage}）`)
  const text = value.trim()
  // Go duration：`0` 单独合法，其余每段「数字[.小数]+单位」，可复合。单位含
  // µs（U+00B5，Go 文档里的写法）与 μs（U+03BC，常见的希腊字母替代）两种
  if (text === '0' || /^(?:\d+(?:\.\d+)?(?:ns|us|µs|μs|ms|s|m|h))+$/.test(text)) return text
  // 裸数字：docker 按 Unix 秒解释
  if (/^\d+$/.test(text)) return text
  // 时间戳：RFC3339 风格，但 `T` 可写成空格、秒与小数秒可省、时区可省
  if (/^\d{4}-\d{2}-\d{2}[Tt ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?$/.test(text)) return text
  throw new Error(`${field} 无法识别：${text}（只支持 ${usage}）`)
}

/* ------------------------------------------------------------------ *
 * 容器列表（docker ps）
 * ------------------------------------------------------------------ */

export interface PortMapping {
  hostIp?: string
  hostPort?: number
  /** 端口区间映射的宿主侧原文（`8000-8005`）；单端口映射无此字段。 */
  hostPortRange?: [number, number]
  containerPort: number
  /** 端口区间映射的容器侧区间（`8000-8005`）；单端口映射无此字段。 */
  containerPortRange?: [number, number]
  protocol: string
}

export interface ContainerSummary {
  id: string
  shortId: string
  name: string
  image: string
  state: string
  status: string
  health: string | null
  createdAt: string | null
  runningFor: string
  ports: PortMapping[]
  /**
   * 容器所在网络（ps 的 `.Networks`，逗号分隔）。为什么要采（D131）：host 网络容器
   * 在 ps 里**没有端口映射**，`ports` 空与「确实没暴露端口」长得一模一样——只有
   * inspect 才能看出是 host。这个字段让 docker_ps 自己就能说清那一列为什么空。
   */
  networks: string[]
  /** compose 项目 / 服务（有标签时）。 */
  composeProject: string | null
  composeService: string | null
  /** ps 的 `.Size`（需 --size，缺省不请求，通常为空）。 */
  size: string
  /** 已退出容器的退出码（从 `.Status` 的 `Exited (137) …` 解析；非退出态为 null）。 */
  exitCode: number | null
}

/**
 * 「需要关注」的容器（0.15.0）：由摘要筛出候选、再用一次 `docker inspect` 补权威
 * 字段（OOM / 真实退出码 / 重启次数），供面板「需关注」页与 agent 工具使用。
 */
export interface AttentionItem {
  id: string
  shortId: string
  name: string
  image: string
  state: string
  health: string | null
  status: string
  /** 关注原因（可多条；前端据此渲染徽标，agent 侧直出文本）。 */
  reasons: AttentionReason[]
  exitCode: number | null
  oomKilled: boolean
  restartCount: number | null
  startedAt: string | null
  finishedAt: string | null
}

/** 关注原因：不健康 / 正在重启 / 被 OOM 杀 / 非零退出 / 僵死。 */
export type AttentionReason = 'unhealthy' | 'restarting' | 'oom' | 'exit-nonzero' | 'dead'

/** 从 ps 的 `.Status` 解析退出码：`Exited (137) 2 hours ago` → 137。 */
export function parseExitCode(status: string): number | null {
  const match = /^\s*exited\s*\((\d+)\)/i.exec(status)
  if (match === null) return null
  const code = Number(match[1])
  return Number.isInteger(code) ? code : null
}

/* ------------------------------------------------------------------ *
 * attention() 的判据常量（抽在模块级便于回归）
 * ------------------------------------------------------------------ */

/**
 * 「反复重启」的判据阈值（D11）：重启计数 ≥ 该值且刚刚启动的运行中容器计入
 * reasons。阈值不能太低——合法的重新部署也会重启一两次。
 */
const ATTENTION_RESTART_THRESHOLD = 3

/** crash-loop 疑似的「刚启动」窗口：重启退避最长 1 分钟，Up 时间几乎总是秒级。 */
const ATTENTION_FRESH_MS = 120_000

/** inspect 批量上限（候选 + 补捞总量的保险丝）：防巨型主机把输出顶到 maxBytes。 */
const ATTENTION_INSPECT_CAP = 300

/**
 * crash-loop **补捞的独立预算**（D87）：合法三类候选（不健康 / 正在重启 / 非零退出）
 * 先占 ATTENTION_INSPECT_CAP 的名额，补捞另有这 50 个名额。此前补捞与合法候选共用
 * 同一个 300（`if (picked.length >= CAP) break`），主机越乱（300 个 unhealthy）
 * 补捞越一个都进不去——与「反复重启最容易被忽略、才需要补捞」的初衷正好相反。
 * 总量上限因此是 CAP + 本值（≈350），不会随主机规模放大。
 */
const ATTENTION_FRESH_BUDGET = 50

/**
 * 单批 inspect 的 id 数硬上限（D86）：默认 512KB ÷ 40 ≈ 12.8KB/容器，容得下真实的
 * inspect JSON（Config/Labels/Mounts/NetworkSettings/HostConfig，2–6KB）。旧写法一次
 * 送 300 个 id（512KB ÷ 300 ≈ 1.7KB/容器）必然截断，而 assertComplete 一抛错，
 * catch 就把**整批**详情丢掉——比修复前的「尾部静默丢弃」更糟。
 */
const ATTENTION_INSPECT_BATCH = 40

/** 估算单个容器 inspect JSON 的字节数（D86）：用于按 maxBytes 收缩单批大小。 */
const ATTENTION_INSPECT_BYTES_PER_CONTAINER = 8 * 1024

/**
 * 单批 inspect 的 id 数（D86）：既有硬上限，也按调用方配置的 maxBytes 收缩——
 * 把 maxOutputKb 调小的人不该每一批都撞截断（分批的意义就是让失败只影响一批）。
 *
 * 下限 8（而不是 1）：`maxOutputKb` 被调到 1KB 这种极端值下，单容器 inspect 本身就会
 * 超限，每批 1 个只会把「注定降级」变成最多 300 次串行 docker 调用；给个下限让调用次数
 * 有界（≈38 批），降级信号照常由 `degraded` 给出、文案也会提示调大上限。
 */
const ATTENTION_INSPECT_MIN_BATCH = 8
function attentionInspectBatch(maxBytes: number): number {
  const byBudget = Math.floor(maxBytes / ATTENTION_INSPECT_BYTES_PER_CONTAINER)
  return Math.min(ATTENTION_INSPECT_BATCH, Math.max(ATTENTION_INSPECT_MIN_BATCH, byBudget))
}

/**
 * docker ps 的 Status 里「刚刚启动」的形状。**必须覆盖到 ATTENTION_FRESH_MS（D106）**：
 * docker 的 HumanDuration 在 60–119s 给的是 `About a minute`，而判据窗口是 120s——
 * 旧 RE 只认 `\d+ seconds?`（<60s），于是「跑 1–2 分钟才崩」的 crash-loop 在运行
 * 阶段一次都不会入候选（只在刚好崩掉的那一瞬是 exited，很容易错过）。
 * `\d+ minutes?` 由 RE 多放行、再由 freshStart 的 120s 判据挡回：多放行无害，
 * 少放行才是静默漏报——两个窗口必须对齐。
 */
const FRESH_UP_RE = /^up (less than a second|\d+ seconds?|about a minute|\d+ minutes?)( \(|$)/i

/** `startedAt` 落在「刚启动」窗口内（crash-loop 容器最近一次拉起的时间）。 */
function freshStart(iso: string | null): boolean {
  if (iso === null || iso === '') return false
  const time = Date.parse(iso)
  return Number.isFinite(time) && Date.now() - time < ATTENTION_FRESH_MS
}

/** 从 ps 的 `.Status`（`Up 2 hours (healthy)`）推导状态。健康态单独由 deriveHealth 提供。 */
export function deriveState(status: string): string {
  const lower = status.toLowerCase()
  if (lower.startsWith('up')) {
    if (lower.includes('(paused)')) return 'paused'
    if (lower.includes('(restarting)')) return 'restarting'
    // Up 但 unhealthy 的容器状态仍是 running，健康态见 health 字段
    return 'running'
  }
  if (lower.startsWith('exited')) return 'exited'
  if (lower.startsWith('created')) return 'created'
  if (lower.startsWith('restarting')) return 'restarting'
  if (lower.startsWith('paused')) return 'paused'
  if (lower.startsWith('dead')) return 'dead'
  if (lower.startsWith('removal in progress')) return 'removing'
  return 'unknown'
}

/** 从 ps 的 `.Status` 提取健康态（`Up 2 hours (healthy)` → healthy）。 */
export function deriveHealth(status: string): string | null {
  const match = /\((healthy|unhealthy|health: starting)\)/i.exec(status)
  if (match === null) return null
  const value = match[1].toLowerCase()
  return value === 'health: starting' ? 'starting' : value
}

/** 端口号 / 端口区间的解析结果（区间至少保留原文，不再整行丢弃）；port 区间时取下界。 */
function parsePortToken(text: string): { port: number; range?: [number, number] } | null {
  const single = Number(text)
  if (Number.isInteger(single) && single > 0) return { port: single }
  const range = /^(\d+)-(\d+)$/.exec(text)
  if (range !== null) return { port: Number(range[1]), range: [Number(range[1]), Number(range[2])] }
  return null
}

/**
 * 通配 hostIp 归一族（D130）：双栈发布（`0.0.0.0:8848->8848/tcp` 与
 * `[::]:8848->8848/tcp`）是**同一次 -p** 的两种展开，不是两条映射。此前按原文参与
 * 去重，两条都留下；而 ps 的渲染丢掉 hostIp 后就成了「8848→8848/tcp」重复两遍
 * （docker_inspect 因为保留 hostIp 才看着正常）。
 *
 * 只归一化通配符这一族：`127.0.0.1:8080` 与 `0.0.0.0:8080` 并存是真实的两种绑定，
 * 必须继续算两条——所以这里不做「同 hostPort 一律合并」。
 */
function hostIpDedupeKey(hostIp: string): string {
  const trimmed = hostIp.trim()
  return trimmed === '' || trimmed === '0.0.0.0' || trimmed === '::' || trimmed === '[::]' ? '*' : trimmed
}

/** 解析 ps 的 `.Ports` 串：`0.0.0.0:8080->80/tcp, [::]:8080->80/tcp, 9000/tcp, 0.0.0.0:8000-8005->8000-8005/tcp`。 */
export function parsePorts(text: string): PortMapping[] {
  const out: PortMapping[] = []
  const seen = new Set<string>()
  for (const raw of text.split(',')) {
    const item = raw.trim()
    if (item === '') continue
    const arrow = item.split('->')
    if (arrow.length === 2) {
      const [hostPart = '', containerPart = ''] = arrow
      const [containerPortText = '', protocol = 'tcp'] = containerPart.split('/')
      const containerToken = parsePortToken(containerPortText)
      if (containerToken === null) continue
      // hostPart 有两种形态：`0.0.0.0:8080` 与（少数驱动/版本的）裸 `8080`。后者用
      // lastIndexOf(':') = -1 去 slice(0, -1) 会**砍掉最后一个字符**（`84` → hostIp
      // `'8'`）——D130 同批修掉这个既有解析错误。
      const colonAt = hostPart.lastIndexOf(':')
      const hostPortText = colonAt >= 0 ? hostPart.slice(colonAt + 1) : hostPart
      const hostToken = parsePortToken(hostPortText)
      const hostIp = colonAt >= 0 ? hostPart.slice(0, colonAt) : ''
      // 去重键用归一化后的 hostIp（D130）：双栈只留首条；hostIp 原文照旧写进结果
      const key = `${hostIpDedupeKey(hostIp)}:${hostPortText}:${containerPortText}/${protocol}`
      if (seen.has(key)) continue
      seen.add(key)
      // 端口区间（`8000-8005->8000-8005/tcp`）：保留区间字段（D40）——此前 Number 得
      // NaN 直接 continue，整行端口凭空消失
      out.push({
        ...(hostIp === '' ? {} : { hostIp }),
        ...(hostToken?.port !== undefined ? { hostPort: hostToken.port } : {}),
        ...(hostToken?.range !== undefined ? { hostPortRange: hostToken.range } : {}),
        containerPort: containerToken.port,
        ...(containerToken.range !== undefined ? { containerPortRange: containerToken.range } : {}),
        protocol,
      })
      continue
    }
    // 仅暴露容器端口（未映射）：`9000/tcp`
    const [containerPortText = '', protocol = 'tcp'] = item.split('/')
    const containerToken = parsePortToken(containerPortText)
    if (containerToken === null) continue
    const key = `-:${containerPortText}/${protocol}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({
      containerPort: containerToken.port,
      ...(containerToken.range !== undefined ? { containerPortRange: containerToken.range } : {}),
      protocol,
    })
  }
  return out
}

/** `docker ps --format '{{json .}}'` → ContainerSummary[]。 */
export function parsePsJson(text: string): ContainerSummary[] {
  return parseJsonLines(text).map((row) => {
    const id = str(row, 'ID', 'Id')
    const status = str(row, 'Status')
    const labels = parseLabels(str(row, 'Labels'))
    return {
      id,
      shortId: id.slice(0, 12),
      name: str(row, 'Names', 'Name'),
      image: str(row, 'Image'),
      state: str(row, 'State') === '' ? deriveState(status) : str(row, 'State').toLowerCase(),
      status,
      health: deriveHealth(status),
      createdAt: str(row, 'CreatedAt') === '' ? null : str(row, 'CreatedAt'),
      runningFor: str(row, 'RunningFor'),
      ports: parsePorts(str(row, 'Ports')),
      // ps 的 `.Networks` 是逗号分隔串（host 网络容器为 `host`）
      networks: str(row, 'Networks').split(',').map((name) => name.trim()).filter((name) => name !== ''),
      composeProject: labels['com.docker.compose.project'] ?? null,
      composeService: labels['com.docker.compose.service'] ?? null,
      size: str(row, 'Size'),
      exitCode: parseExitCode(status),
    }
  })
}

/**
 * inspect 未命中时的候选名（D132）：把 `No such object: rmqnamesrv` 变成
 * 「是否想找 607023340cbb_rmqnamesrv？」。
 *
 * 纯函数（名字列表由调用方取，便于离线断言）：前缀命中优先、其次包含；去重后最多 3 个。
 * 精确名匹配是 docker 语义、不改；这里只是**在报错里补一句**，让人少猜一次。
 */
export function suggestContainerNames(id: string, names: string[]): string[] {
  const needle = id.trim().toLowerCase()
  if (needle === '') return []
  const prefix: string[] = []
  const contains: string[] = []
  for (const name of names) {
    if (name === '') continue
    const lower = name.toLowerCase()
    if (lower.startsWith(needle)) prefix.push(name)
    else if (lower.includes(needle)) contains.push(name)
  }
  return [...new Set([...prefix, ...contains])].slice(0, 3)
}

/** ps 的 `.Labels` 是 `k=v,k2=v2` 串。 */
export function parseLabels(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  if (text.trim() === '') return out
  for (const pair of text.split(',')) {
    const eq = pair.indexOf('=')
    if (eq <= 0) continue
    out[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim()
  }
  return out
}

/* ------------------------------------------------------------------ *
 * 统计（docker stats --no-stream）
 * ------------------------------------------------------------------ */

export interface ContainerStats {
  id: string
  shortId: string
  name: string
  cpuPercent: number | null
  memPercent: number | null
  memUsed: number | null
  memLimit: number | null
  memUsage: string
  netRx: number | null
  netTx: number | null
  netIO: string
  blockRead: number | null
  blockWrite: number | null
  blockIO: string
  pids: number | null
}

/** `docker stats --no-stream --format '{{json .}}'` → ContainerStats[]。 */
export function parseStatsJson(text: string): ContainerStats[] {
  return parseJsonLines(text).map((row) => {
    const id = str(row, 'ID', 'Container', 'ContainerID')
    const mem = str(row, 'MemUsage')
    const [memUsedText = '', memLimitText = ''] = mem.split('/')
    const net = parseIOPair(str(row, 'NetIO'))
    const block = parseIOPair(str(row, 'BlockIO'))
    // PIDs 缺字段时是空串：Number('') === 0 会显示「0 个进程」（D39），与同函数里
    // memUsed / memLimit 缺字段时给 null 的口径对齐
    const pidsText = str(row, 'PIDs')
    const pids = pidsText.trim() === '' ? Number.NaN : Number(pidsText)
    return {
      id,
      shortId: id.slice(0, 12),
      name: str(row, 'Name'),
      cpuPercent: parsePercent(str(row, 'CPUPerc')),
      memPercent: parsePercent(str(row, 'MemPerc')),
      memUsed: parseDockerSize(memUsedText),
      memLimit: parseDockerSize(memLimitText),
      memUsage: mem.trim(),
      netRx: net.rx,
      netTx: net.tx,
      netIO: str(row, 'NetIO').trim(),
      blockRead: block.rx,
      blockWrite: block.tx,
      blockIO: str(row, 'BlockIO').trim(),
      pids: Number.isInteger(pids) ? pids : null,
    }
  })
}

/* ------------------------------------------------------------------ *
 * 事件（docker events）
 * ------------------------------------------------------------------ */

/**
 * 事件白名单：只放行「容器生命周期」里真正值得刷 UI 的动作。
 *
 * 为什么必须在服务端过滤：docker events 会输出大量噪音（exec_create /
 * exec_start / exec_die 每次 docker exec 三条、attach / detach / resize；
 * network / volume / image 事件已被 --filter type=container 挡掉）。一个跑批的
 * 容器几条 exec 就能把 SSE 帧率顶上去，而客户端收到每一帧都要走一次列表防抖
 * 重取。白名单放服务端，浏览器与 agent 工具（docker_events）拿到的就是同一份。
 */
const EVENT_ACTIONS = new Set(['start', 'die', 'stop', 'kill', 'oom', 'health_status', 'destroy', 'rename', 'update'])

/** 一条容器事件（SSE 帧协议与 docker_events 工具共用同一形状）。 */
export interface ContainerEvent {
  /** 完整动作串；health_status 带状态后缀（如 'health_status: healthy'）。 */
  action: string
  name: string
  image: string
  composeProject: string | null
  /** 事件时间（Unix 秒；缺失为 null，客户端按本地时区格式化）。 */
  time: number | null
  /** 仅 die 事件有：容器退出码。 */
  exitCode: number | null
}

/** 取 Actor.Attributes 里的字符串字段（缺失回空串）。 */
function attr(attributes: Record<string, unknown>, key: string): string {
  const value = attributes[key]
  return typeof value === 'string' ? value : ''
}

/**
 * 单行 docker events --format '{{json .}}' → ContainerEvent；坏行 / 非白名单动作
 * 返回 null，由调用方丢弃：事件流里混进一条解析不了的行（daemon 版本差异、
 * 被截断的 chunk）不该把整条流掐掉，也不该变成 error 帧。
 *
 * Action 在老版本里叫 status；health_status 的两种写法都要吃：
 *   Action: 'health_status: healthy'（新）与 Action: 'health_status'（老）。
 */
export function parseContainerEvent(line: string): ContainerEvent | null {
  const text = line.trim()
  if (text === '' || !text.startsWith('{')) return null
  let row: Record<string, unknown>
  try {
    const parsed: unknown = JSON.parse(text)
    if (typeof parsed !== 'object' || parsed === null) return null
    row = parsed as Record<string, unknown>
  } catch {
    return null
  }
  const rawAction = (str(row, 'Action') || str(row, 'status')).trim()
  if (rawAction === '') return null
  // 'health_status: healthy' → 用冒号前的基础动作过白名单，完整串留给 UI
  const base = (rawAction.split(':')[0] ?? '').trim().toLowerCase()
  if (!EVENT_ACTIONS.has(base)) return null
  const actor = asRecord(row.Actor)
  const attributes = asRecord(actor.Attributes)
  const name = attr(attributes, 'name')
  const exitText = attr(attributes, 'exitCode')
  const exitCode = exitText === '' ? Number.NaN : Number(exitText)
  const timeText = row.time
  const time = typeof timeText === 'number' && Number.isFinite(timeText) ? timeText : null
  const project = attributes['com.docker.compose.project']
  return {
    action: rawAction,
    // 少数事件没有 name（比如容器已删）：回落到 Actor.ID 前 12 位，别让活动条出现空名字
    name: name !== '' ? name : str(actor, 'ID').slice(0, 12),
    image: attr(attributes, 'image'),
    composeProject: project === undefined ? null : String(project),
    time,
    exitCode: Number.isFinite(exitCode) ? exitCode : null,
  }
}

/** 多行事件输出 → ContainerEvent[]（逐行解析，坏行直接丢）。 */
export function parseEventsJson(text: string): ContainerEvent[] {
  const out: ContainerEvent[] = []
  for (const line of text.split(/\r?\n/)) {
    const event = parseContainerEvent(line)
    if (event !== null) out.push(event)
  }
  return out
}

/* ------------------------------------------------------------------ *
 * 镜像（docker images）
 * ------------------------------------------------------------------ */

export interface ImageSummary {
  id: string
  shortId: string
  repository: string
  tag: string
  /** `repository:tag`（dangling 时 ` <none>:<none>`）。 */
  reference: string
  size: number | null
  sizeText: string
  createdAt: string
  createdSince: string
  dangling: boolean
}

/** `docker images --format '{{json .}}'` → ImageSummary[]。 */
export function parseImagesJson(text: string): ImageSummary[] {
  return parseJsonLines(text).map((row) => {
    const id = str(row, 'ID', 'Id')
    const repository = str(row, 'Repository') || '<none>'
    const tag = str(row, 'Tag') || '<none>'
    const sizeText = str(row, 'Size')
    return {
      id,
      shortId: id.replace(/^sha256:/, '').slice(0, 12),
      repository,
      tag,
      reference: `${repository}:${tag}`,
      size: parseDockerSize(sizeText),
      sizeText,
      createdAt: str(row, 'CreatedAt'),
      createdSince: str(row, 'CreatedSince'),
      dangling: repository === '<none>' && tag === '<none>',
    }
  })
}

/* ------------------------------------------------------------------ *
 * 镜像详情（docker image inspect / docker history）
 * ------------------------------------------------------------------ */

/** 镜像详情（`docker image inspect <ref>` 的权威数据）。 */
export interface ImageDetail {
  id: string
  shortId: string
  /** 标签列表（dangling 镜像为空数组）。 */
  repoTags: string[]
  repoDigests: string[]
  /** 压缩后大小（字节；缺字段为 null）。 */
  size: number | null
  /** 含父层的虚拟大小（老版本无此字段）。 */
  virtualSize: number | null
  created: string
  architecture: string
  os: string
  entrypoint: string
  command: string
  workingDir: string
  user: string
  exposedPorts: string[]
  volumes: string[]
  /** 层（RootFS.Layers 的 diff id，底层 → 顶层）。 */
  layers: string[]
  /** 层数（= layers.length，单独给出便于直接展示）。 */
  layerCount: number
  /** 镜像标签（截断展示用；值可能很长，仅回传前 50 条）。 */
  labels: Record<string, string>
}

/** `docker image inspect <ref>` 的 JSON 数组 → ImageDetail[]。 */
export function parseImageInspectJson(text: string): ImageDetail[] {
  return parseJsonLines(text).map((row) => {
    const config = asRecord(row.Config)
    const rootfs = asRecord(row.RootFS)
    const labels = asRecord(config.Labels)
    const layers = Array.isArray(rootfs.Layers) ? rootfs.Layers.map(String) : []
    const id = str(row, 'Id', 'ID')
    const size = typeof row.Size === 'number' ? row.Size : null
    return {
      id,
      shortId: id.replace(/^sha256:/, '').slice(0, 12),
      repoTags: Array.isArray(row.RepoTags) ? row.RepoTags.map(String) : [],
      repoDigests: Array.isArray(row.RepoDigests) ? row.RepoDigests.map(String) : [],
      size,
      virtualSize: typeof row.VirtualSize === 'number' ? row.VirtualSize : null,
      created: typeof row.Created === 'string' ? row.Created : '',
      architecture: str(row, 'Architecture'),
      os: str(row, 'Os', 'OS'),
      entrypoint: Array.isArray(config.Entrypoint) ? config.Entrypoint.map(String).join(' ') : str(config, 'Entrypoint'),
      command: Array.isArray(config.Cmd) ? config.Cmd.map(String).join(' ') : str(config, 'Cmd'),
      workingDir: typeof config.WorkingDir === 'string' ? config.WorkingDir : '',
      user: typeof config.User === 'string' ? config.User : '',
      exposedPorts: Object.keys(asRecord(config.ExposedPorts)).sort(),
      volumes: Object.keys(asRecord(config.Volumes)).sort(),
      layers,
      layerCount: layers.length,
      // env 刻意不回传：inspect 的 Env 里常含密钥，浏览器与 agent 都不需要
      labels: Object.fromEntries(Object.entries(labels).slice(0, 50).map(([k, v]) => [k, String(v)])),
    }
  })
}

/** 构建历史的一条（`docker history`）。 */
export interface ImageHistoryEntry {
  id: string
  shortId: string
  created: string
  createdSince: string
  createdBy: string
  size: number | null
  sizeText: string
  comment: string
  tags: string[]
}

/**
 * `docker history --no-trunc --format '{{json .}}'` → ImageHistoryEntry[]。
 * `--format` 只有 Docker ≥ 26 才支持；老版本输出的是纯文本表格，
 * 由 parseImageHistoryText 兜底（调用方先试 JSON）。
 */
export function parseImageHistoryJson(text: string): ImageHistoryEntry[] {
  return parseJsonLines(text).map((row) => {
    const id = str(row, 'ID', 'Id')
    const sizeText = str(row, 'Size')
    const tags = str(row, 'Tags')
    return {
      id,
      shortId: id.replace(/^sha256:/, '').slice(0, 12),
      created: str(row, 'CreatedAt'),
      createdSince: str(row, 'CreatedSince'),
      createdBy: str(row, 'CreatedBy'),
      size: parseDockerSize(sizeText),
      sizeText,
      comment: str(row, 'Comment'),
      tags: tags === '' ? [] : tags.split(',').map((tag) => tag.trim()).filter((tag) => tag !== ''),
    }
  })
}

/**
 * `docker history --no-trunc` 的纯文本表格兜底解析（老版本 docker 没有 --format）。
 *
 * 表格列以 2 个以上空格对齐，但 **CREATED BY 内部也常出现连续双空格**
 * （`#(nop)  CMD`、`#(nop)  ADD`），所以不按 `\s{2,}` 盲切：先从右往左定位 SIZE
 * （行内最后一个「数字 + 单位」），再用第一个连续双空格把 CREATED 与 CREATED BY 分开。
 * 这是 best-effort：列宽截断（尾部 `…`）与极端构建命令可能让个别字段不完整，
 * 但不会抛错，也不会把整行吞掉。
 */
export function parseImageHistoryText(text: string): ImageHistoryEntry[] {
  const out: ImageHistoryEntry[] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trimEnd()
    const trimmed = line.trim()
    if (trimmed === '') continue
    if (/^IMAGE\s+(CREATED|CREATED BY)/i.test(trimmed)) continue
    const head = /^(\S+)\s+(.+)$/.exec(trimmed)
    if (head === null) continue
    const id = head[1]
    const rest = head[2]
    // SIZE 列：取行内最后一个「数字 + 单位」——构建命令里出现尺寸样式文本的概率远低于 SIZE 列本身
    const sizeRe = /(\d+(?:\.\d+)?)\s*([kKmMgGtTpP]?[bB])/g
    let last: RegExpExecArray | null = null
    let hit: RegExpExecArray | null
    while ((hit = sizeRe.exec(rest)) !== null) last = hit
    if (last === null) continue
    const beforeSize = rest.slice(0, last.index).trimEnd()
    const comment = rest.slice(last.index + last[0].length).trim()
    // CREATED 与 CREATED BY 之间是第一个连续双空格（CREATED BY 内部的双空格留给它自己）
    const createdSplit = /\s{2,}/.exec(beforeSize)
    const created = createdSplit === null ? beforeSize : beforeSize.slice(0, createdSplit.index).trim()
    const createdBy = createdSplit === null ? '' : beforeSize.slice(createdSplit.index).trim()
    const sizeText = last[0].trim()
    out.push({
      id,
      shortId: id.replace(/^sha256:/, '').slice(0, 12),
      created: '',
      createdSince: created,
      createdBy,
      size: parseDockerSize(sizeText),
      sizeText,
      comment,
      tags: [],
    })
  }
  return out
}

/* ------------------------------------------------------------------ *
 * 网络 / 卷（docker network ls|inspect、docker volume ls|inspect）
 * ------------------------------------------------------------------ */

/**
 * docker 的 `ls --format '{{json .}}'` 把布尔值也输出成字符串（`"false"`），
 * 而 `inspect` 里是真 boolean。同一个字段两条路径都要能吃。
 */
function boolish(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') return value.trim().toLowerCase() === 'true'
  return false
}

/** 对象型字段（inspect 的 Options / Labels）→ 字符串字典。 */
function stringMap(value: unknown): Record<string, string> {
  return Object.fromEntries(Object.entries(asRecord(value)).map(([key, item]) => [key, String(item)]))
}

export interface NetworkSummary {
  id: string
  shortId: string
  name: string
  driver: string
  scope: string
  internal: boolean
  ipv6: boolean
}

/** `docker network ls --format '{{json .}}'` → NetworkSummary[]。 */
export function parseNetworksJson(text: string): NetworkSummary[] {
  return parseJsonLines(text).map((row) => {
    const id = str(row, 'ID', 'Id')
    return {
      id,
      shortId: id.slice(0, 12),
      name: str(row, 'Name'),
      driver: str(row, 'Driver'),
      scope: str(row, 'Scope'),
      internal: boolish(row.Internal),
      ipv6: boolish(row.IPv6),
    }
  })
}

/** 网络详情（`docker network inspect <name>` 的权威数据）。 */
export interface NetworkDetail {
  id: string
  shortId: string
  name: string
  driver: string
  scope: string
  created: string
  internal: boolean
  attachable: boolean
  ingress: boolean
  enableIpv6: boolean
  /** IPAM.Config 的每一项（子网 / 网关；老 daemon 可能没有）。 */
  subnets: { subnet: string; gateway: string }[]
  options: Record<string, string>
  labels: Record<string, string>
  /** 接入这个网络的容器（Endpoint 视角的数据）。 */
  containers: { id: string; shortId: string; name: string; ipv4: string; ipv6: string; mac: string }[]
}

/** `docker network inspect <name>` 的 JSON 数组 → NetworkDetail[]。 */
export function parseNetworkInspectJson(text: string): NetworkDetail[] {
  return parseJsonLines(text).map((row) => {
    const id = str(row, 'Id', 'ID')
    const ipam = asRecord(row.IPAM)
    const config = Array.isArray(ipam.Config) ? ipam.Config : []
    const containers = asRecord(row.Containers)
    return {
      id,
      shortId: id.slice(0, 12),
      name: str(row, 'Name'),
      driver: str(row, 'Driver'),
      scope: str(row, 'Scope'),
      created: typeof row.Created === 'string' ? row.Created : '',
      internal: boolish(row.Internal),
      attachable: boolish(row.Attachable),
      ingress: boolish(row.Ingress),
      enableIpv6: boolish(row.EnableIPv6),
      subnets: config.map((item) => {
        const entry = asRecord(item)
        return { subnet: typeof entry.Subnet === 'string' ? entry.Subnet : '', gateway: typeof entry.Gateway === 'string' ? entry.Gateway : '' }
      }).filter((entry) => entry.subnet !== '' || entry.gateway !== ''),
      options: stringMap(row.Options),
      labels: stringMap(row.Labels),
      containers: Object.entries(containers).map(([key, value]) => {
        const item = asRecord(value)
        return {
          id: key,
          shortId: key.slice(0, 12),
          name: typeof item.Name === 'string' ? item.Name : '',
          ipv4: typeof item.IPv4Address === 'string' ? item.IPv4Address : '',
          ipv6: typeof item.IPv6Address === 'string' ? item.IPv6Address : '',
          mac: typeof item.MacAddress === 'string' ? item.MacAddress : '',
        }
      }),
    }
  })
}

export interface VolumeSummary {
  name: string
  driver: string
  scope: string
  /**
   * 挂载点。`volume ls` 的模板里**没有** CreatedAt（实测 27.5.1），所以列表不带时间；
   * Mountpoint 也不是所有版本都提供，缺字段就退化成空串，列表显示 '—'。
   */
  mountpoint: string
}

/** `docker volume ls --format '{{json .}}'` → VolumeSummary[]。 */
export function parseVolumesJson(text: string): VolumeSummary[] {
  return parseJsonLines(text).map((row) => ({
    name: str(row, 'Name'),
    driver: str(row, 'Driver'),
    scope: str(row, 'Scope'),
    mountpoint: str(row, 'Mountpoint'),
  }))
}

/** 卷详情（`docker volume inspect <name>` 的权威数据）。 */
export interface VolumeDetail {
  name: string
  driver: string
  scope: string
  mountpoint: string
  created: string
  options: Record<string, string>
  labels: Record<string, string>
}

/** `docker volume inspect <name>` 的 JSON 数组 → VolumeDetail[]。 */
export function parseVolumeInspectJson(text: string): VolumeDetail[] {
  return parseJsonLines(text).map((row) => ({
    name: str(row, 'Name'),
    driver: str(row, 'Driver'),
    scope: str(row, 'Scope'),
    mountpoint: str(row, 'Mountpoint'),
    created: typeof row.CreatedAt === 'string' ? row.CreatedAt : '',
    options: stringMap(row.Options),
    labels: stringMap(row.Labels),
  }))
}

/* ------------------------------------------------------------------ *
 * 详情（docker inspect）
 * ------------------------------------------------------------------ */

export interface MountInfo {
  type: string
  source: string
  destination: string
  mode: string
  readWrite: boolean
}

export interface ContainerDetail {
  id: string
  shortId: string
  name: string
  image: string
  imageId: string
  state: string
  status: string
  health: string | null
  healthLogTail: string | null
  created: string | null
  startedAt: string | null
  finishedAt: string | null
  exitCode: number | null
  oomKilled: boolean
  restartCount: number | null
  restartPolicy: string | null
  platform: string
  pid: number | null
  ports: PortMapping[]
  mounts: MountInfo[]
  networks: { name: string; ip: string | null }[]
  command: string
  entrypoint: string
  workingDir: string
  user: string
  composeProject: string | null
  composeService: string | null
  /** 镜像标签（截断展示用；值可能很长，仅回传前 50 条）。 */
  labels: Record<string, string>
}

/** `docker inspect <id…>` 的 JSON 数组 → ContainerDetail[]。 */
export function parseInspectJson(text: string): ContainerDetail[] {
  const parsed = parseJsonLines(text)
  return parsed.map((row) => {
    const state = asRecord(row.State)
    const config = asRecord(row.Config)
    const hostConfig = asRecord(row.HostConfig)
    const networkSettings = asRecord(row.NetworkSettings)
    const labels = asRecord(config.Labels)
    const mountsRaw = Array.isArray(row.Mounts) ? row.Mounts : []
    const networksRaw = asRecord(networkSettings.Networks)
    const health = asRecord(state.Health)
    const healthLog = Array.isArray(health.Log) ? health.Log : []
    const lastHealth = healthLog.length > 0 ? asRecord(healthLog[healthLog.length - 1]) : {}
    const id = str(row, 'Id', 'ID')
    const name = str(row, 'Name').replace(/^\//, '')
    return {
      id,
      shortId: id.slice(0, 12),
      name,
      image: str(config, 'Image'),
      imageId: str(row, 'Image'),
      state: str(state, 'Status') === '' ? 'unknown' : str(state, 'Status').toLowerCase(),
      status: str(state, 'Status'),
      health: typeof health.Status === 'string' ? health.Status : null,
      healthLogTail: typeof lastHealth.Output === 'string' ? lastHealth.Output.trim() : null,
      created: typeof row.Created === 'string' ? row.Created : null,
      startedAt: dockerTime(state.StartedAt),
      finishedAt: dockerTime(state.FinishedAt),
      exitCode: typeof state.ExitCode === 'number' ? state.ExitCode : null,
      oomKilled: state.OOMKilled === true,
      restartCount: typeof row.RestartCount === 'number' ? row.RestartCount : null,
      restartPolicy: typeof asRecord(hostConfig.RestartPolicy).Name === 'string' ? String(asRecord(hostConfig.RestartPolicy).Name) : null,
      platform: typeof row.Platform === 'string' ? row.Platform : '',
      pid: typeof state.Pid === 'number' ? state.Pid : null,
      ports: parseInspectPorts(networkSettings.Ports),
      mounts: mountsRaw.map((item) => {
        const mount = asRecord(item)
        return {
          type: typeof mount.Type === 'string' ? mount.Type : '',
          source: typeof mount.Source === 'string' ? mount.Source : '',
          destination: typeof mount.Destination === 'string' ? mount.Destination : '',
          mode: typeof mount.Mode === 'string' ? mount.Mode : '',
          readWrite: mount.RW !== false,
        }
      }),
      networks: Object.entries(networksRaw).map(([name, value]) => {
        const net = asRecord(value)
        return { name, ip: typeof net.IPAddress === 'string' && net.IPAddress !== '' ? net.IPAddress : null }
      }),
      command: Array.isArray(config.Cmd) ? config.Cmd.map(String).join(' ') : str(config, 'Cmd'),
      entrypoint: Array.isArray(config.Entrypoint) ? config.Entrypoint.map(String).join(' ') : str(config, 'Entrypoint'),
      workingDir: typeof config.WorkingDir === 'string' ? config.WorkingDir : '',
      user: typeof config.User === 'string' ? config.User : '',
      composeProject: typeof labels['com.docker.compose.project'] === 'string' ? labels['com.docker.compose.project'] : null,
      composeService: typeof labels['com.docker.compose.service'] === 'string' ? labels['com.docker.compose.service'] : null,
      labels: Object.fromEntries(Object.entries(labels).slice(0, 50).map(([k, v]) => [k, String(v)])),
    }
  })
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
}

/**
 * docker 的零值时间不是有效时间（D41）：从未退出的容器 `FinishedAt` 是
 * `0001-01-01T00:00:00Z`（不是空串），`Date.parse` 还能解析成功 → 「最近出事
 * 优先」排序被打乱、详情/hover 显示公元 1 年。归一成 null。
 */
function dockerTime(value: unknown): string | null {
  if (typeof value !== 'string' || value === '') return null
  if (value.startsWith('0001-01-01')) return null
  return value
}

/** inspect 的 `NetworkSettings.Ports`：`{ "80/tcp": [{HostIp, HostPort}] }`。 */
export function parseInspectPorts(value: unknown): PortMapping[] {
  const ports = asRecord(value)
  const out: PortMapping[] = []
  for (const [key, mappings] of Object.entries(ports)) {
    const [containerPortText = '', protocol = 'tcp'] = key.split('/')
    // 键本身可能是**端口区间**（`8000-8005/tcp`）：复用 parsePortToken（D102）。
    // 此前用 Number('8000-8005') 得 NaN → continue，整段端口凭空消失，详情页比
    // 列表页（parsePorts 已在 D40 支持区间）少一条。
    const containerToken = parsePortToken(containerPortText)
    if (containerToken === null) continue
    const containerPort = containerToken.port
    const containerRange = containerToken.range === undefined ? {} : { containerPortRange: containerToken.range }
    const list = Array.isArray(mappings) ? mappings : []
    if (list.length === 0) {
      out.push({ containerPort, ...containerRange, protocol })
      continue
    }
    const seen = new Set<string>()
    for (const item of list) {
      const map = asRecord(item)
      const hostIp = typeof map.HostIp === 'string' ? map.HostIp : ''
      const hostPortRaw = map.HostPort
      const hostPortText = hostPortRaw === undefined || hostPortRaw === null ? '' : String(hostPortRaw)
      // HostPort 与键同口径（D102）：区间映射的 HostPort 也可能是 `8000-8005`；
      // 缺失/空串时 parsePortToken 返回 null → 不产出 Number('') === 0 的幻影映射（D38）
      const hostToken = parsePortToken(hostPortText)
      const hostRange = hostToken === null || hostToken.range === undefined ? {} : { hostPortRange: hostToken.range }
      // 去重键含 hostIp（D38）：`-p 8080:8080` 的 inspect 会给 `0.0.0.0` 与 `::` 两条，
      // 只按端口去重会把 IPv6 那条并掉，详情页比列表页少端口
      const dedupe = `${hostIp}:${hostPortText}`
      if (seen.has(dedupe)) continue
      seen.add(dedupe)
      out.push({
        ...(hostIp === '' ? {} : { hostIp }),
        ...(hostToken === null ? {} : { hostPort: hostToken.port }),
        ...hostRange,
        containerPort,
        ...containerRange,
        protocol,
      })
    }
  }
  return out
}

/* ------------------------------------------------------------------ *
 * 执行器抽象：本地 / SSH 共用一套 DockerApi
 * ------------------------------------------------------------------ */

/** 一个目标（target）背后的命令执行通道。 */
export interface Runner {
  /** 展示用标签：`本机` 或 `user@host`。 */
  readonly label: string
  run(argv: readonly string[], options?: { timeoutMs?: number; maxBytes?: number; keepTail?: boolean }): Promise<ExecResult>
  /** 长流（logs --follow）：逐块回调，signal 中止；无总超时与输出上限。 */
  stream(argv: readonly string[], handlers: StreamHandlers, signal?: AbortSignal): Promise<StreamResult>
}

export interface DockerAction {
  action: 'start' | 'stop' | 'restart' | 'remove'
  id: string
}

export interface LogsOptions {
  tail?: number
  timestamps?: boolean
  since?: string
  /** 实时跟随（`docker logs --follow`）：仅 logsStream() 使用，logs() 忽略。 */
  follow?: boolean
}

export interface ProbeResult {
  ok: boolean
  bin: string
  /** 服务端版本（`docker version --format {{.Server.Version}}`）。 */
  serverVersion: string | null
  /** 失败原因（daemon 未运行 / 未安装 / 权限不足）。 */
  error: string | null
  target: string
}

/** 单个目标上的 Docker 操作集合。 */
export class DockerApi {
  constructor(
    private readonly runner: Runner,
    private readonly bin: string,
    private readonly limits: { timeoutMs: number; maxBytes: number },
  ) {}

  /** 探测：docker CLI 是否可用 + daemon 是否可达。 */
  async probe(): Promise<ProbeResult> {
    const base = { bin: this.bin, target: this.runner.label }
    try {
      const result = await this.runner.run([this.bin, 'version', '--format', '{{.Server.Version}}'], { timeoutMs: 15_000 })
      if (result.code === 0) {
        return { ok: true, serverVersion: result.stdout.trim() || null, error: null, ...base }
      }
      const message = (result.stderr.trim() || result.stdout.trim() || `退出码 ${String(result.code)}`).split('\n')[0]
      return { ok: false, serverVersion: null, error: message ?? '未知错误', ...base }
    } catch (error) {
      return { ok: false, serverVersion: null, error: error instanceof Error ? error.message : String(error), ...base }
    }
  }

  /**
   * assertOk + 截断检查（D13）：列表 / 详情类方法拿到的必须是**完整**输出。
   * 只检查 code 的话，「输出被截断」会被当成「本来就这么少」——面板静默少列
   * 容器，inspect 系列更会把截断误报成「对象不存在」，把用户引向错误方向。
   *
   * `alternative` 是**这个调用方真正能执行的替代做法**（D105）：agent 改不了插件
   * 设置，「请调大 maxOutputKb」对它不可执行——ps 能改 all、stats 能传 ids、
   * events 能缩小 since。文案里还会回显当前上限（见 truncationHint）。
   */
  private assertComplete(result: ExecResult, what: string, alternative?: string): void {
    this.assertOk(result, what)
    if (result.truncated) {
      throw new Error(`${what}的输出${this.truncationHint(alternative)}`)
    }
  }

  /**
   * 截断提示的统一文案（D105）：带上当前上限（KB）与目标标签——只说「超过上限」
   * 无法判断差多少；再拼上调用方的可执行替代做法。
   * 不抛错的路径（imageInspect 的 history，D104）复用同一句话，保持口径一致。
   */
  private truncationHint(alternative?: string): string {
    const limitKb = Math.round(this.limits.maxBytes / 1024)
    const suggest =
      alternative === undefined || alternative === ''
        ? '调大「单次命令输出上限」（maxOutputKb）'
        : `${alternative}；或调大「单次命令输出上限」（maxOutputKb）`
    return `因超过上限被截断（目标 ${this.runner.label}，当前上限 ${limitKb} KB）：结果不完整。请${suggest}后重试`
  }

  async listContainers(all: boolean): Promise<ContainerSummary[]> {
    const argv = [this.bin, 'ps', ...(all ? ['-a'] : []), '--no-trunc', '--format', '{{json .}}']
    const result = await this.runner.run(argv, { timeoutMs: this.limits.timeoutMs, maxBytes: this.limits.maxBytes })
    this.assertComplete(result, '列出容器', '改传 all=false（默认只看运行中的容器）')
    return parsePsJson(result.stdout)
  }

  async inspect(ids: readonly string[]): Promise<ContainerDetail[]> {
    const safe = ids.map((id) => assertRef(id, 'container'))
    if (safe.length === 0) return []
    const result = await this.runner.run([this.bin, 'inspect', ...safe], {
      timeoutMs: this.limits.timeoutMs,
      maxBytes: this.limits.maxBytes,
    })
    this.assertComplete(result, '读取容器详情', '改用更少的容器 id 分批读取')
    return parseInspectJson(result.stdout)
  }

  /**
   * 「需要关注」的容器（0.15.0）：先按摘要筛候选（不健康 / 重启中 / 僵死 /
   * 非零退出），再**分块** `docker inspect` 补权威字段——OOM 与真实退出码在 ps
   * 摘要里拿不到（137 也可能是手动 kill），只看摘要会误报。inspect 失败时退回摘要，
   * 但一定带 `degraded` 信号（D85/D86）。
   *
   * 反复重启（D11）：crash-loop 的容器多数时间显示 Up（退避最长 1 分钟，其余
   * 时间在跑），RestartCount 只在 inspect 里有——摘要筛不出来。这里把「刚刚
   * 启动」的运行中容器一并送进 inspect，按「重启计数高 + 刚启动」补捞；补捞有
   * 独立预算（D87）：合法候选再多也挤不掉它。
   *
   * 截断在过滤 + 排序**之后**（D12）：先切后拍的话，名额被一堆老的非零退出
   * 容器占满时，最严重的 OOM / unhealthy 反而会被切掉；返回值带 total / truncated
   * 截断信号，不静默。
   */
  async attention(options?: { limit?: number }): Promise<{ items: AttentionItem[]; total: number; truncated: boolean; degraded: boolean }> {
    const containers = await this.listContainers(true)
    const limit = Math.min(Math.max(Math.trunc(options?.limit ?? 100), 1), 500)
    // 合法三类候选（不健康 / 重启中 / 僵死 / 非零退出）：**不设总量闸**——超出的
    // 部分仍然进 items（它们是真实的问题容器），只是拿不到详情，见下面的 uninspected
    const candidates = containers.filter((item) => {
      if (item.health === 'unhealthy') return true
      if (item.state === 'restarting' || item.state === 'dead') return true
      if (item.state === 'exited' && item.exitCode !== null && item.exitCode !== 0) return true
      return false
    })
    // crash-loop 补捞（D11）：合法候选优先，但补捞有**独立预算**（D87）——此前共用
    // ATTENTION_INSPECT_CAP，300 个 unhealthy 一占满，真正的 crash-loop 一个都进不来
    const candidateIds = new Set(candidates.map((item) => item.id))
    const supplemented: ContainerSummary[] = []
    let droppedFresh = 0
    for (const item of containers) {
      if (candidateIds.has(item.id)) continue
      if (!(item.state === 'running' && FRESH_UP_RE.test(item.status))) continue
      if (supplemented.length >= ATTENTION_FRESH_BUDGET) {
        // 预算吃满后仍然「刚启动」的容器没被检查：计入降级信号（D87），不静默
        droppedFresh += 1
        continue
      }
      supplemented.push(item)
    }
    const picked = [...candidates, ...supplemented]
    if (picked.length === 0) return { items: [], total: 0, truncated: false, degraded: false }
    // inspect 集 = 合法候选的前 CAP 条 + **全部**补捞（总量 ≤ CAP + FRESH_BUDGET）
    const inspectIds = [...candidates.slice(0, ATTENTION_INSPECT_CAP), ...supplemented].map((item) => item.id)
    const details = new Map<string, ContainerDetail>()
    // inspect 失败必须有信号（D42）：静默退回摘要口径会把 OOM 降级成 exit-nonzero、
    // 重启次数 / 时间全部缺失，调用方无法区分「没有 OOM」与「权威数据没取到」。
    // 因此**分块** inspect、每块独立 catch（D86）：一块 300 个 id 时 512KB 必然截断，
    // 旧写法一抛错就是整批详情全丢——分块后失败只丢那一块，其余块照常可用。
    let uninspected = picked.length - inspectIds.length + droppedFresh
    const batch = attentionInspectBatch(this.limits.maxBytes)
    for (let offset = 0; offset < inspectIds.length; offset += batch) {
      const chunk = inspectIds.slice(offset, offset + batch)
      try {
        for (const detail of await this.inspect(chunk)) details.set(detail.id, detail)
      } catch {
        uninspected += chunk.length
      }
    }
    // 「有候选没取到详情」同样是降级（D85）：旧写法只在整批抛错时置位，于是 320 个
    // 候选里第 301–320 条静默退回摘要口径（真 OOM 被降成 exit-nonzero、排到最后，
    // 默认 limit 一截就没了），调用方却看到 degraded=false 而以为数据齐全
    const degraded = uninspected > 0
    const items = picked.map((item) => {
      const detail = details.get(item.id)
      const health = detail?.health ?? item.health
      const exitCode = detail?.exitCode ?? item.exitCode
      const oomKilled = detail?.oomKilled === true
      const restartCount = detail?.restartCount ?? null
      const reasons: AttentionReason[] = []
      if (health === 'unhealthy') reasons.push('unhealthy')
      if (item.state === 'restarting' || detail?.state === 'restarting') {
        reasons.push('restarting')
      } else if (restartCount !== null && restartCount >= ATTENTION_RESTART_THRESHOLD && freshStart(detail?.startedAt ?? null)) {
        // 运行中但刚启动 + 重启计数高 = 疑似 crash-loop（D11）
        reasons.push('restarting')
      }
      if (oomKilled) reasons.push('oom')
      else if (exitCode !== null && exitCode !== 0) reasons.push('exit-nonzero')
      if (item.state === 'dead' || detail?.state === 'dead') reasons.push('dead')
      return {
        id: item.id,
        shortId: item.shortId,
        name: item.name,
        image: item.image,
        state: detail?.state ?? item.state,
        health,
        status: item.status,
        reasons,
        exitCode,
        oomKilled,
        restartCount,
        startedAt: detail?.startedAt ?? null,
        finishedAt: detail?.finishedAt ?? null,
      }
    })
    // 严重度排序：OOM/僵死 > 不健康 > 重启中 > 非零退出；同级按名字稳定排序
    const weight = (item: AttentionItem): number => {
      if (item.reasons.includes('oom')) return 0
      if (item.reasons.includes('dead')) return 1
      if (item.reasons.includes('unhealthy')) return 2
      if (item.reasons.includes('restarting')) return 3
      return 4
    }
    // 同权重内按「最近出事」排：一堆非零退出的历史容器里，刚刚崩的那个应该在最上面
    const at = (item: AttentionItem): number => {
      const iso = item.finishedAt ?? item.startedAt
      if (typeof iso !== 'string' || iso === '') return 0
      const time = Date.parse(iso)
      return Number.isFinite(time) ? time : 0
    }
    const sorted = items
      .filter((item) => item.reasons.length > 0)
      .sort((a, b) => weight(a) - weight(b) || at(b) - at(a) || a.name.localeCompare(b.name))
    return { items: sorted.slice(0, limit), total: sorted.length, truncated: sorted.length > limit, degraded }
  }

  async stats(ids: readonly string[]): Promise<ContainerStats[]> {
    const safe = ids.map((id) => assertRef(id, 'container'))
    const result = await this.runner.run(this.statsArgv(safe, false), {
      timeoutMs: Math.max(this.limits.timeoutMs, 20_000),
      maxBytes: this.limits.maxBytes,
    })
    this.assertComplete(result, '读取容器统计', '传具体 ids（docker_stats 的 ids 参数）而不是全量')
    return parseStatsJson(result.stdout)
  }

  /**
   * 实时统计流：`docker stats`（**不带 --no-stream**）每秒为每个容器输出一行
   * `{{json .}}`。与快照共用 statsArgv 的构造，只差 --no-stream。
   *
   * 与日志流的语义差异：这条流**不会自然结束**——容器一直跑，docker stats 就
   * 一直输出；只有全部被统计的容器退出（或 id 无效）时 docker 才自己退出。
   * 因此「关闭」由浏览器主动断（EventSource.close → res close → abort），
   * 服务端在这条路径上静默中止，不写任何帧。
   */
  async statsStream(ids: readonly string[], handlers: StreamHandlers, signal?: AbortSignal): Promise<StreamResult> {
    const safe = ids.map((id) => assertRef(id, 'container'))
    return await this.runner.stream(this.statsArgv(safe, true), handlers, signal)
  }

  /** 统计 argv 的唯一构造点：快照与流式只在 --no-stream 上有差异。 */
  private statsArgv(ids: readonly string[], stream: boolean): string[] {
    return [this.bin, 'stats', ...(stream ? [] : ['--no-stream']), '--format', '{{json .}}', ...ids]
  }

  /**
   * 事件流：docker events 持续输出 JSON 行，**不会自然结束**，关闭由浏览器主动断。
   * 不带 --since：默认只从「现在」开始推，活动条要的是新动静而不是历史回放。
   * 带 --filter type=container 挡掉 network / volume / image 事件。
   */
  async eventsStream(handlers: StreamHandlers, signal?: AbortSignal): Promise<StreamResult> {
    return await this.runner.stream(this.eventsArgv({}), handlers, signal)
  }

  /**
   * 事件快照（agent 工具用）：必须先有 --until 才能让它退出——docker events
   * 只给 --since 时会一直 follow 下去，run() 会挂到超时。这里把 until 取成**请求
   * 时刻的 RFC3339**（不是字符串 'now'：docker 的 --until 只认时间戳或时长）。
   */
  async events(since: string): Promise<ContainerEvent[]> {
    const result = await this.runner.run(this.eventsArgv({ since, until: new Date().toISOString() }), {
      // 跨 10m 窗口的事件量取决于容器活动量，给足超时但别学流那样无上限
      timeoutMs: Math.max(this.limits.timeoutMs, 30_000),
      maxBytes: this.limits.maxBytes,
    })
    this.assertComplete(result, '读取容器事件', '缩小 since 窗口（如 10m）')
    return parseEventsJson(result.stdout)
  }

  /** 事件 argv 的唯一构造点：流式与快照只差 --since / --until。 */
  private eventsArgv(options: { since?: string; until?: string }): string[] {
    const since = options.since === undefined ? '' : options.since.trim()
    const until = options.until === undefined ? '' : options.until.trim()
    return [
      this.bin,
      'events',
      ...(since === '' ? [] : ['--since', since]),
      ...(until === '' ? [] : ['--until', until]),
      '--format', '{{json .}}',
      '--filter', 'type=container',
    ]
  }

  async images(): Promise<ImageSummary[]> {
    const result = await this.runner.run([this.bin, 'images', '--format', '{{json .}}'], {
      timeoutMs: this.limits.timeoutMs,
      maxBytes: this.limits.maxBytes,
    })
    this.assertComplete(result, '列出镜像', 'agent 侧没有分页参数，这是该目标的全量镜像列表')
    return parseImagesJson(result.stdout)
  }

  /**
   * 镜像详情：`docker image inspect`（权威元数据 + 层列表）加上
   * `docker history`（构建历史）。
   *
   * history 走 **两段降级**：先试 `--format '{{json .}}'`（Docker ≥ 26），
   * 老版本会因 unknown flag 失败，再退回纯文本表格；两段都失败只是
   * `historyError` 非空、detail 照常返回——详情页不该因为构建历史取不到就整页报错。
   */
  async imageInspect(ref: string): Promise<{ ref: string; detail: ImageDetail; history: ImageHistoryEntry[]; historyError: string | null }> {
    const safe = assertImageRef(ref, 'image')
    const result = await this.runner.run([this.bin, 'image', 'inspect', safe], {
      timeoutMs: this.limits.timeoutMs,
      maxBytes: this.limits.maxBytes,
    })
    this.assertComplete(result, '读取镜像详情')
    const detail = parseImageInspectJson(result.stdout)[0]
    if (detail === undefined) throw new Error(`镜像不存在或输出无法解析：${safe}`)

    let history: ImageHistoryEntry[] = []
    let historyError: string | null = null
    try {
      const jsonAttempt = await this.runner.run([this.bin, 'history', '--no-trunc', '--format', '{{json .}}', safe], {
        timeoutMs: this.limits.timeoutMs,
        maxBytes: this.limits.maxBytes,
      })
      if (jsonAttempt.code === 0) {
        history = parseImageHistoryJson(jsonAttempt.stdout)
        if (history.length === 0) history = parseImageHistoryText(jsonAttempt.stdout)
        // 截断必须留痕（D104）：层数多的镜像会静默「变短」，而 historyError 是这条
        // 降级路径唯一的信号位——写进去而不是抛错（历史取不到不该整页报错）
        if (jsonAttempt.truncated) historyError = `构建历史${this.truncationHint()}`
      } else {
        // 老 docker 没有 history --format：退回纯文本表格（仍带 --no-trunc 拿完整命令）
        const plainAttempt = await this.runner.run([this.bin, 'history', '--no-trunc', safe], {
          timeoutMs: this.limits.timeoutMs,
          maxBytes: this.limits.maxBytes,
        })
        if (plainAttempt.code === 0) {
          history = parseImageHistoryText(plainAttempt.stdout)
          if (plainAttempt.truncated) historyError = `构建历史${this.truncationHint()}`
        } else {
          historyError = firstLine(plainAttempt.stderr, plainAttempt.stdout, plainAttempt.code)
        }
      }
    } catch (error) {
      historyError = error instanceof Error ? error.message : String(error)
    }
    return { ref: safe, detail, history, historyError }
  }

  /** 删除镜像（`docker image rm`，不带 -f）。调用方负责 allowMutations 门禁。 */
  async imageRemove(ref: string): Promise<{ ref: string; message: string }> {
    const safe = assertImageRef(ref, 'image')
    const result = await this.runner.run([this.bin, 'image', 'rm', safe], {
      timeoutMs: Math.max(this.limits.timeoutMs, 60_000),
      maxBytes: 64 * 1024,
    })
    if (result.code !== 0) {
      const message = firstLine(result.stderr, result.stdout, result.code)
      const inUse = /image is being used|conflict|must be forced|being used by/i.test(message)
      const hint = inUse ? '（镜像仍被容器或子镜像引用：先删除相关容器；确实要强删请到终端面板手动执行 docker image rm -f）' : ''
      throw new Error(`删除镜像 ${safe} 失败：${message}${hint}`)
    }
    return { ref: safe, message: result.stdout.trim() || 'ok' }
  }

  /**
   * 清理 dangling（无标签）镜像：`docker image prune -f`。
   *
   * 刻意**不加 --all**：`--all` 会删掉所有未被容器使用的镜像（含普通 tag 的
   * 基础镜像），破坏性远超「清 dangling」的直觉。要删有标签的镜像请走单个删除
   * （imageRemove）并二次确认。
   */
  async imagePrune(): Promise<{ message: string }> {
    const result = await this.runner.run([this.bin, 'image', 'prune', '-f'], {
      timeoutMs: Math.max(this.limits.timeoutMs, 120_000),
      maxBytes: 256 * 1024,
      keepTail: true, // Total reclaimed space 在输出末尾（D14）
    })
    this.assertOk(result, '清理 dangling 镜像')
    return { message: result.stdout.trim() || 'ok' }
  }

  /* ---------------- 网络 ---------------- */

  async networks(): Promise<NetworkSummary[]> {
    const result = await this.runner.run([this.bin, 'network', 'ls', '--format', '{{json .}}'], {
      timeoutMs: this.limits.timeoutMs,
      maxBytes: this.limits.maxBytes,
    })
    this.assertComplete(result, '列出网络', 'agent 侧没有分页参数，这是该目标的全量网络列表')
    return parseNetworksJson(result.stdout)
  }

  /**
   * 网络详情。inspect 顺带返回接入的容器，所以列表行**不**逐行 inspect 算容器数
   * （N 条网络就是 N 次 docker 调用），改成点进详情才取一次。
   */
  async networkInspect(name: string): Promise<{ name: string; detail: NetworkDetail }> {
    const safe = assertName(name, 'network')
    const result = await this.runner.run([this.bin, 'network', 'inspect', safe], {
      timeoutMs: this.limits.timeoutMs,
      maxBytes: this.limits.maxBytes,
    })
    this.assertComplete(result, '读取网络详情')
    const detail = parseNetworkInspectJson(result.stdout)[0]
    if (detail === undefined) throw new Error(`网络不存在或输出无法解析：${safe}`)
    return { name: safe, detail }
  }

  /** 删除网络（`docker network rm`）。调用方负责 allowMutations 门禁。 */
  async networkRemove(name: string): Promise<{ name: string; message: string }> {
    const safe = assertName(name, 'network')
    const result = await this.runner.run([this.bin, 'network', 'rm', safe], {
      timeoutMs: Math.max(this.limits.timeoutMs, 60_000),
      maxBytes: 64 * 1024,
    })
    if (result.code !== 0) {
      const message = firstLine(result.stderr, result.stdout, result.code)
      // 还有容器接着的时候 docker 会拒绝：给出可执行的下一步，而不是只回一句英文
      const inUse = /active endpoints|has active endpoints|in use/i.test(message)
      const hint = inUse ? '（还有容器接着这个网络：先把它们断开或删除；本插件不做 disconnect）' : ''
      throw new Error(`删除网络 ${safe} 失败：${message}${hint}`)
    }
    return { name: safe, message: result.stdout.trim() || 'ok' }
  }

  /**
   * 清理未被使用的网络：`docker network prune -f`。
   * `-f` 是必须的（否则 docker 会等交互确认，我们是非交互调用），
   * 且 prune 只动「没有容器接入」的网络——但 compose 的自定义网络也会被清掉
   * （下次 up 会重建），所以调用方仍然要二次确认。
   */
  async networkPrune(): Promise<{ message: string }> {
    const result = await this.runner.run([this.bin, 'network', 'prune', '-f'], {
      timeoutMs: Math.max(this.limits.timeoutMs, 120_000),
      maxBytes: 256 * 1024,
      keepTail: true,
    })
    this.assertOk(result, '清理未使用的网络')
    return { message: result.stdout.trim() || 'ok' }
  }

  /* ---------------- 卷 ---------------- */

  async volumes(): Promise<VolumeSummary[]> {
    const result = await this.runner.run([this.bin, 'volume', 'ls', '--format', '{{json .}}'], {
      timeoutMs: this.limits.timeoutMs,
      maxBytes: this.limits.maxBytes,
    })
    this.assertComplete(result, '列出卷', 'agent 侧没有分页参数，这是该目标的全量卷列表')
    return parseVolumesJson(result.stdout)
  }

  /** 卷详情（`docker volume inspect <name>`）。 */
  async volumeInspect(name: string): Promise<{ name: string; detail: VolumeDetail }> {
    const safe = assertName(name, 'volume')
    const result = await this.runner.run([this.bin, 'volume', 'inspect', safe], {
      timeoutMs: this.limits.timeoutMs,
      maxBytes: this.limits.maxBytes,
    })
    this.assertComplete(result, '读取卷详情')
    const detail = parseVolumeInspectJson(result.stdout)[0]
    if (detail === undefined) throw new Error(`卷不存在或输出无法解析：${safe}`)
    return { name: safe, detail }
  }

  /** 删除卷（`docker volume rm`）。数据随卷一起没，调用方负责 allowMutations 门禁。 */
  async volumeRemove(name: string): Promise<{ name: string; message: string }> {
    const safe = assertName(name, 'volume')
    const result = await this.runner.run([this.bin, 'volume', 'rm', safe], {
      timeoutMs: Math.max(this.limits.timeoutMs, 60_000),
      maxBytes: 64 * 1024,
    })
    if (result.code !== 0) {
      const message = firstLine(result.stderr, result.stdout, result.code)
      const inUse = /volume is in use|in use/i.test(message)
      const hint = inUse ? '（卷还被容器占用：先停掉/删除用它的容器）' : ''
      throw new Error(`删除卷 ${safe} 失败：${message}${hint}`)
    }
    return { name: safe, message: result.stdout.trim() || 'ok' }
  }

  /**
   * 清理未被容器使用的卷：`docker volume prune -f`。
   *
   * **破坏性最高的一个 prune**：卷里装的是数据。刻意不带 `--all`——实测 docker 27
   * 的 `volume prune` 有 `-a/--all` 开关、不带时只删**匿名**卷；但 docker < 23 没有这个
   * 开关，plain prune 会把命名卷一起删。所以调用方必须二次确认，并且确认文案要写明
   * 这个版本差异（见 README「已知限制」）。
   */
  async volumePrune(): Promise<{ message: string }> {
    const result = await this.runner.run([this.bin, 'volume', 'prune', '-f'], {
      timeoutMs: Math.max(this.limits.timeoutMs, 120_000),
      maxBytes: 256 * 1024,
      keepTail: true,
    })
    this.assertOk(result, '清理未使用的卷')
    return { message: result.stdout.trim() || 'ok' }
  }

  /**
   * 拉取镜像（`docker pull`）。逐层进度天然是流：非 TTY 下 docker 按状态行输出
   * （Pulling fs layer / Downloading / Extracting / Pull complete），直接复用
   * ssh-exec 的长流通道（runLocalStream / RemoteExec.stream），无总超时，
   * 由连接生命周期收尾。调用方负责 allowMutations 门禁。
   */
  async pullStream(ref: string, handlers: StreamHandlers, signal?: AbortSignal): Promise<StreamResult> {
    const safe = assertImageRef(ref, 'image')
    return await this.runner.stream([this.bin, 'pull', safe], handlers, signal)
  }

  /** 拉取的快照形态（agent 工具用）：一次性跑完，输出有上限。 */
  async pull(ref: string, timeoutMs?: number): Promise<{ ref: string; code: number | null; text: string; truncated: boolean; durationMs: number }> {
    const safe = assertImageRef(ref, 'image')
    const result = await this.runner.run([this.bin, 'pull', safe], {
      timeoutMs: Math.min(Math.max(timeoutMs ?? 600_000, 10_000), 1_800_000),
      maxBytes: this.limits.maxBytes,
      keepTail: true, // digest / Downloaded 结论在输出末尾（D14）
    })
    // 超时必须报错而不是当成功返回（D16）：模型看到半截「Downloading 12MB/80MB」
    // 且没有 error，会判定为已拉取，直到 start 才暴露 image not found
    if (result.timedOut) {
      throw new Error(`拉取 ${safe} 超时中止（已运行 ${String(Math.round(result.durationMs / 1000))}s），镜像未拉完。可加大 timeoutSec 后重试，或在面板镜像页用进度流观察`)
    }
    const text = result.stdout + (result.stderr === '' ? '' : (result.stdout === '' ? '' : '\n') + result.stderr)
    return { ref: safe, code: result.code, text, truncated: result.truncated, durationMs: result.durationMs }
  }

  /**
   * 日志：stdout / stderr 分别收，stdout 整段在前、stderr 在后。
   *
   * 注意这不是「按到达顺序合并」（D44 注释纠正）：一次性命令的两路输出在
   * run() 里分别累积，时序信息已经丢了；容器交替写两路时快照日志的先后顺序
   * 与真实到达序可能不同。要真实时序请用实时跟随（FOLLOW 流是逐块按到达序推的）。
   */
  async logs(id: string, options?: LogsOptions): Promise<{ id: string; text: string; truncated: boolean }> {
    const safe = assertRef(id, 'container')
    const result = await this.runner.run(this.logsArgv(safe, options, false), {
      timeoutMs: this.limits.timeoutMs,
      maxBytes: this.limits.maxBytes,
      keepTail: true, // 超限时该丢的是最旧的行，最新行在尾部（D14）
    })
    this.assertOk(result, '读取容器日志')
    const text = result.stdout + (result.stderr === '' ? '' : (result.stdout === '' ? '' : '\n') + result.stderr)
    return { id: safe, text, truncated: result.truncated }
  }

  /**
   * 实时日志流：`docker logs --follow`，stdout/stderr 逐块回调，直到容器退出 /
   * 远端关闭 / signal 中止。argv 与快照 logs() 共用同一构造（tail 夹紧
   * 1..5000、timestamps / since 语义完全一致），只多一个 --follow。
   */
  async logsStream(id: string, options: LogsOptions | undefined, handlers: StreamHandlers, signal?: AbortSignal): Promise<StreamResult> {
    const safe = assertRef(id, 'container')
    return await this.runner.stream(this.logsArgv(safe, options, true), handlers, signal)
  }

  /**
   * 日志 argv 的唯一构造点：快照与流式只在 `--follow` 上有差异，
   * 校验与夹紧必须逐字一致（否则同一 id 在两条路径上行为漂移）。
   */
  private logsArgv(id: string, options: LogsOptions | undefined, follow: boolean): string[] {
    const tail = Math.min(Math.max(Math.trunc(options?.tail ?? 200), 1), 5000)
    return [
      this.bin,
      'logs',
      ...(follow ? ['--follow'] : []),
      '--tail',
      String(tail),
      ...(options?.timestamps === true ? ['--timestamps'] : []),
      ...(typeof options?.since === 'string' && options.since.trim() !== '' ? ['--since', options.since.trim()] : []),
      id,
    ]
  }

  /** 生命周期操作；调用方负责 readOnly / allowMutations 门禁。 */
  async action(request: DockerAction): Promise<{ id: string; action: string; message: string }> {
    const safe = assertRef(request.id, 'container')
    const map: Record<DockerAction['action'], string[]> = {
      start: ['start'],
      stop: ['stop'],
      restart: ['restart'],
      remove: ['rm'],
    }
    const sub = map[request.action]
    const result = await this.runner.run([this.bin, ...sub, safe], {
      // stop / restart 可能要等容器优雅退出（docker 默认 10s 超时）
      timeoutMs: Math.max(this.limits.timeoutMs, 60_000),
      maxBytes: 64 * 1024,
    })
    if (result.code !== 0) {
      const message = firstLine(result.stderr, result.stdout, result.code)
      const hint = request.action === 'remove' && /running/i.test(message) ? '（容器仍在运行：先停止再删除）' : ''
      throw new Error(`${request.action} ${safe} 失败：${message}${hint}`)
    }
    return { id: safe, action: request.action, message: result.stdout.trim() || 'ok' }
  }

  /** 一次性 exec（无 TTY）：`docker exec <id> sh -c <command>`。 */
  async exec(id: string, command: string, timeoutMs?: number): Promise<{ id: string; command: string; code: number | null; stdout: string; stderr: string; truncated: boolean; durationMs: number }> {
    const safe = assertRef(id, 'container')
    if (typeof command !== 'string' || command.trim() === '') throw new Error('command 不能为空')
    if (command.length > 8000) throw new Error('command 过长（≤8000 字符）')
    const result = await this.runner.run([this.bin, 'exec', safe, 'sh', '-c', command], {
      timeoutMs: Math.min(Math.max(timeoutMs ?? 30_000, 1_000), 120_000),
      maxBytes: this.limits.maxBytes,
    })
    if (result.timedOut) throw new Error(`exec 超时（${String(Math.round(result.durationMs / 1000))}s）：${safe}`)
    return {
      id: safe,
      command,
      code: result.code,
      stdout: result.stdout,
      stderr: result.stderr,
      truncated: result.truncated,
      durationMs: result.durationMs,
    }
  }

  private assertOk(result: ExecResult, what: string): void {
    if (result.code === 0) return
    throw new Error(`${what}失败（${this.runner.label}）：${firstLine(result.stderr, result.stdout, result.code)}`)
  }
}

/* ------------------------------------------------------------------ *
 * 目标 → Runner
 * ------------------------------------------------------------------ */

/** 目标定义（settings 里的 `targets[]`）。 */
export interface DockerTarget {
  /** 展示名（唯一）。 */
  name: string
  /** 本机 / SSH 远程。 */
  kind: 'local' | 'ssh'
  /** kind=ssh 时引用 tty 连接簿条目名（可选；也可直接给内联字段）。 */
  book?: string
  host?: string
  port?: number
  username?: string
  auth?: 'agent' | 'key' | 'password'
  keyPath?: string
  password?: string
  passphrase?: string
  agentForward?: boolean
}

/** 已解析出 SSH 规格的目标（连接簿查找完成）。 */
export interface ResolvedTarget {
  name: string
  kind: 'local' | 'ssh'
  spec?: SshSpec
}

/** 为一个目标构造 Runner。 */
export function createRunner(options: {
  target: ResolvedTarget
  remote: RemoteExec
  logger: ExecLogger
}): Runner {
  const { target, remote, logger } = options
  if (target.kind === 'local') {
    return {
      label: `本机（${target.name}）`,
      run: (argv, runOptions) => runLocal(argv, runOptions),
      stream: (argv, handlers, signal) => runLocalStream(argv, handlers, signal),
    }
  }
  const spec = target.spec
  if (spec === undefined) throw new Error(`目标 ${target.name} 缺少 SSH 规格`)
  return {
    label: `${sshTarget(spec)}（${target.name}）`,
    run: (argv, runOptions) => remote.run(spec, argv, runOptions),
    stream: (argv, handlers, signal) => remote.stream(spec, argv, handlers, signal),
  }
}

/** 供宿主半体复用：把 HostKeyStore 与 logger 绑到 RemoteExec。 */
export function createRemoteExec(logger: ExecLogger, store: HostKeyStore): RemoteExec {
  return new RemoteExec(logger, store)
}
