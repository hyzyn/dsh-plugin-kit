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

/** docker CLI 可执行文件白名单（argv[0]，不设默认值以免误用其他程序）。 */
export function assertBin(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') return 'docker'
  const trimmed = value.trim()
  if (!/^[A-Za-z0-9_./-]+$/.test(trimmed)) throw new Error(`dockerBin 含非法字符：${trimmed}`)
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

/* ------------------------------------------------------------------ *
 * 容器列表（docker ps）
 * ------------------------------------------------------------------ */

export interface PortMapping {
  hostIp?: string
  hostPort?: number
  containerPort: number
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
  /** compose 项目 / 服务（有标签时）。 */
  composeProject: string | null
  composeService: string | null
  /** ps 的 `.Size`（需 --size，缺省不请求，通常为空）。 */
  size: string
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

/** 解析 ps 的 `.Ports` 串：`0.0.0.0:8080->80/tcp, [::]:8080->80/tcp, 9000/tcp`。 */
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
      const containerPort = Number(containerPortText)
      if (!Number.isInteger(containerPort)) continue
      const hostPortText = hostPart.slice(hostPart.lastIndexOf(':') + 1)
      const hostPort = Number(hostPortText)
      const hostIp = hostPart.slice(0, hostPart.lastIndexOf(':'))
      const key = `${hostIp}:${hostPortText}:${containerPortText}/${protocol}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({
        ...(hostIp === '' ? {} : { hostIp }),
        ...(Number.isInteger(hostPort) ? { hostPort } : {}),
        containerPort,
        protocol,
      })
      continue
    }
    // 仅暴露容器端口（未映射）：`9000/tcp`
    const [containerPortText = '', protocol = 'tcp'] = item.split('/')
    const containerPort = Number(containerPortText)
    if (!Number.isInteger(containerPort)) continue
    const key = `-:${containerPortText}/${protocol}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ containerPort, protocol })
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
      composeProject: labels['com.docker.compose.project'] ?? null,
      composeService: labels['com.docker.compose.service'] ?? null,
      size: str(row, 'Size'),
    }
  })
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
    const pids = Number(str(row, 'PIDs'))
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
      startedAt: typeof state.StartedAt === 'string' ? state.StartedAt : null,
      finishedAt: typeof state.FinishedAt === 'string' ? state.FinishedAt : null,
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

/** inspect 的 `NetworkSettings.Ports`：`{ "80/tcp": [{HostIp, HostPort}] }`。 */
export function parseInspectPorts(value: unknown): PortMapping[] {
  const ports = asRecord(value)
  const out: PortMapping[] = []
  for (const [key, mappings] of Object.entries(ports)) {
    const [containerPortText = '', protocol = 'tcp'] = key.split('/')
    const containerPort = Number(containerPortText)
    if (!Number.isInteger(containerPort)) continue
    const list = Array.isArray(mappings) ? mappings : []
    if (list.length === 0) {
      out.push({ containerPort, protocol })
      continue
    }
    const seen = new Set<string>()
    for (const item of list) {
      const map = asRecord(item)
      const hostIp = typeof map.HostIp === 'string' ? map.HostIp : ''
      const hostPort = Number(map.HostPort)
      const dedupe = `${hostPort}`
      if (seen.has(dedupe)) continue
      seen.add(dedupe)
      out.push({
        ...(hostIp === '' ? {} : { hostIp }),
        ...(Number.isInteger(hostPort) ? { hostPort } : {}),
        containerPort,
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
  run(argv: readonly string[], options?: { timeoutMs?: number; maxBytes?: number }): Promise<ExecResult>
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

  async listContainers(all: boolean): Promise<ContainerSummary[]> {
    const argv = [this.bin, 'ps', ...(all ? ['-a'] : []), '--no-trunc', '--format', '{{json .}}']
    const result = await this.runner.run(argv, { timeoutMs: this.limits.timeoutMs, maxBytes: this.limits.maxBytes })
    this.assertOk(result, '列出容器')
    return parsePsJson(result.stdout)
  }

  async inspect(ids: readonly string[]): Promise<ContainerDetail[]> {
    const safe = ids.map((id) => assertRef(id, 'container'))
    if (safe.length === 0) return []
    const result = await this.runner.run([this.bin, 'inspect', ...safe], {
      timeoutMs: this.limits.timeoutMs,
      maxBytes: this.limits.maxBytes,
    })
    this.assertOk(result, '读取容器详情')
    return parseInspectJson(result.stdout)
  }

  async stats(ids: readonly string[]): Promise<ContainerStats[]> {
    const safe = ids.map((id) => assertRef(id, 'container'))
    const result = await this.runner.run(this.statsArgv(safe, false), {
      timeoutMs: Math.max(this.limits.timeoutMs, 20_000),
      maxBytes: this.limits.maxBytes,
    })
    this.assertOk(result, '读取容器统计')
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
    this.assertOk(result, '读取容器事件')
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
    this.assertOk(result, '列出镜像')
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
    this.assertOk(result, '读取镜像详情')
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
      } else {
        // 老 docker 没有 history --format：退回纯文本表格（仍带 --no-trunc 拿完整命令）
        const plainAttempt = await this.runner.run([this.bin, 'history', '--no-trunc', safe], {
          timeoutMs: this.limits.timeoutMs,
          maxBytes: this.limits.maxBytes,
        })
        if (plainAttempt.code === 0) history = parseImageHistoryText(plainAttempt.stdout)
        else historyError = firstLine(plainAttempt.stderr, plainAttempt.stdout, plainAttempt.code)
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
    this.assertOk(result, '列出网络')
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
    this.assertOk(result, '读取网络详情')
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
    this.assertOk(result, '列出卷')
    return parseVolumesJson(result.stdout)
  }

  /** 卷详情（`docker volume inspect <name>`）。 */
  async volumeInspect(name: string): Promise<{ name: string; detail: VolumeDetail }> {
    const safe = assertName(name, 'volume')
    const result = await this.runner.run([this.bin, 'volume', 'inspect', safe], {
      timeoutMs: this.limits.timeoutMs,
      maxBytes: this.limits.maxBytes,
    })
    this.assertOk(result, '读取卷详情')
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
    })
    const text = result.stdout + (result.stderr === '' ? '' : (result.stdout === '' ? '' : '\n') + result.stderr)
    return { ref: safe, code: result.code, text, truncated: result.truncated, durationMs: result.durationMs }
  }

  /** 日志：stdout / stderr 分别收，再按到达顺序合并（docker logs 两者都有内容）。 */
  async logs(id: string, options?: LogsOptions): Promise<{ id: string; text: string; truncated: boolean }> {
    const safe = assertRef(id, 'container')
    const result = await this.runner.run(this.logsArgv(safe, options, false), {
      timeoutMs: this.limits.timeoutMs,
      maxBytes: this.limits.maxBytes,
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
