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
import type { ExecResult, HostKeyStore, SshSpec, ExecLogger } from './ssh-exec.js'
import { RemoteExec, runLocal, sshTarget } from './ssh-exec.js'

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
}

export interface DockerAction {
  action: 'start' | 'stop' | 'restart' | 'remove'
  id: string
}

export interface LogsOptions {
  tail?: number
  timestamps?: boolean
  since?: string
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
    const result = await this.runner.run(
      [this.bin, 'stats', '--no-stream', '--format', '{{json .}}', ...safe],
      { timeoutMs: Math.max(this.limits.timeoutMs, 20_000), maxBytes: this.limits.maxBytes },
    )
    this.assertOk(result, '读取容器统计')
    return parseStatsJson(result.stdout)
  }

  async images(): Promise<ImageSummary[]> {
    const result = await this.runner.run([this.bin, 'images', '--format', '{{json .}}'], {
      timeoutMs: this.limits.timeoutMs,
      maxBytes: this.limits.maxBytes,
    })
    this.assertOk(result, '列出镜像')
    return parseImagesJson(result.stdout)
  }

  /** 日志：stdout / stderr 分别收，再按到达顺序合并（docker logs 两者都有内容）。 */
  async logs(id: string, options?: LogsOptions): Promise<{ id: string; text: string; truncated: boolean }> {
    const safe = assertRef(id, 'container')
    const tail = Math.min(Math.max(Math.trunc(options?.tail ?? 200), 1), 5000)
    const argv = [
      this.bin,
      'logs',
      '--tail',
      String(tail),
      ...(options?.timestamps === true ? ['--timestamps'] : []),
      ...(typeof options?.since === 'string' && options.since.trim() !== '' ? ['--since', options.since.trim()] : []),
      safe,
    ]
    const result = await this.runner.run(argv, { timeoutMs: this.limits.timeoutMs, maxBytes: this.limits.maxBytes })
    this.assertOk(result, '读取容器日志')
    const text = result.stdout + (result.stderr === '' ? '' : (result.stdout === '' ? '' : '\n') + result.stderr)
    return { id: safe, text, truncated: result.truncated }
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
      const message = (result.stderr.trim() || result.stdout.trim() || `退出码 ${String(result.code)}`).split('\n')[0]
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
    const message = (result.stderr.trim() || result.stdout.trim() || `退出码 ${String(result.code)}`).split('\n')[0]
    throw new Error(`${what}失败（${this.runner.label}）：${message}`)
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
    }
  }
  const spec = target.spec
  if (spec === undefined) throw new Error(`目标 ${target.name} 缺少 SSH 规格`)
  return {
    label: `${sshTarget(spec)}（${target.name}）`,
    run: (argv, runOptions) => remote.run(spec, argv, runOptions),
  }
}

/** 供宿主半体复用：把 HostKeyStore 与 logger 绑到 RemoteExec。 */
export function createRemoteExec(logger: ExecLogger, store: HostKeyStore): RemoteExec {
  return new RemoteExec(logger, store)
}
