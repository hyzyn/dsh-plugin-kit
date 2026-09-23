/**
 * @hyzyn/dsh-docker — DSH Web GUI 的 Docker 容器面板（host 半体）。
 *
 * 与 dsh-tty 的关系（方案 A：独立插件，tty 零改动）：
 *   - **连接簿**：只读复用 tty 的 entry settings（DSH ≥0.1.7 的
 *     `settings.describe()`，经 kit 的 `readSettingsEntry(ctx, 'tty')`）的
 *     `sshHosts`。tty 未安装时退化为「只支持本机 / 内联 SSH 字段」。
 *   - **主机指纹**：本插件自持一份 `hostKeys`（TOFU），并优先读取 tty 已记录
 *     的指纹作为种子，避免同一主机在两处重复确认。
 *   - **执行通道**：自持池化 SSH exec（src/ssh-exec.ts），与 tty 的 PTY 会话
 *     完全独立；本机目标直接 spawn docker CLI。
 *
 * 信任模型（与 tty 不同，必须强调）：
 *   docker socket ≈ 该主机的 root 权限。因此**默认只读**：
 *   `allowMutations` 未开启时 start/stop/restart/remove 一律拒绝，
 *   `allowExec` 未开启时 `docker exec` 一律拒绝；两个开关都需用户在设置卡片
 *   显式打开。agent 工具同样受这两个开关约束（未开启时连工具都不注册）。
 */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { definePlugin, plainConfig, readSettingsEntry, settingsEntryScope, suppressAutoSettingsPage } from '@hyzyn/dsh-kit'
import type { SettingsEntryScope } from '@hyzyn/dsh-kit'
import { defineTool } from '@deepseek-ai/dsh-tools'
import * as dns from 'node:dns'
import {
  DockerApi,
  assertBin,
  assertImageRef,
  assertName,
  assertRef,
  assertSince,
  createRunner,
  parseImageHistoryJson,
  parseImageHistoryText,
  parseContainerEvent,
  parseEventsJson,
  parseImageInspectJson,
  parseInspectJson,
  parsePsJson,
  parseStatsJson,
} from './docker.js'
import type {
  AttentionItem,
  ContainerDetail,
  ContainerEvent,
  ContainerStats,
  ContainerSummary,
  DockerTarget,
  ImageDetail,
  ImageHistoryEntry,
  ImageSummary,
  NetworkDetail,
  NetworkSummary,
  ResolvedTarget,
  StreamHandlers,
  VolumeDetail,
  VolumeSummary,
} from './docker.js'
import { RemoteExec, setCredentialResolver, sshTarget } from './ssh-exec.js'
import type { CredentialResolver, ExecLogger, HostKeyRecord, HostKeyStore, SshSpec } from './ssh-exec.js'

export type { HostKeyRecord } from './ssh-exec.js'
export type { ContainerSummary, ContainerDetail, ContainerStats, ContainerEvent, ImageSummary, NetworkSummary, NetworkDetail, VolumeSummary, VolumeDetail, DockerTarget } from './docker.js'

/* ------------------------------------------------------------------ *
 * 配置
 * ------------------------------------------------------------------ */

export interface Config {
  /** 关闭整个插件。默认开。 */
  enabled?: boolean
  /** 是否向 agent 注入插件能力公告。默认开。 */
  announceToAgent?: boolean
  /** docker CLI 可执行文件名 / 路径（podman 可填 podman）。默认 docker。 */
  dockerBin?: string
  /** 允许 start/stop/restart/remove（含对应 agent 工具）。默认关。 */
  allowMutations?: boolean
  /** 允许一次性 docker exec（含对应 agent 工具）。默认关。 */
  allowExec?: boolean
  /** exec 默认超时秒数（1~120）。默认 30。 */
  execTimeoutSec?: number
  /** 面板统计刷新间隔秒数（1~60）。默认 5。 */
  pollIntervalSec?: number
  /** 日志默认尾部行数（1~5000）。默认 200。 */
  logTailDefault?: number
  /** 单次命令输出上限（KB，1~8192）。默认 512。 */
  maxOutputKb?: number
  /** 目标列表（本机 / SSH）。 */
  targets?: DockerTarget[]
  /** SSH 主机指纹记录（TOFU，随 settings 落盘）。 */
  hostKeys?: HostKeyRecord[]
}

const TARGET_SCHEMA = z.object({
  name: z.string().required(),
  kind: z.union([z.const('local'), z.const('ssh')]).default('local'),
  /** kind=ssh：引用 tty 连接簿条目名（可留空，改用下方内联字段）。 */
  book: z.string().default(''),
  host: z.string().default(''),
  port: z.natural().max(65535).default(22),
  username: z.string().default(''),
  auth: z.union([z.const('agent'), z.const('key'), z.const('password')]).default('agent'),
  keyPath: z.string().default(''),
  /** 建议写 `env:NAME` 凭据引用（官方凭据层解析），避免明文落盘。 */
  password: z.string().default(''),
  passphrase: z.string().default(''),
  agentForward: z.boolean().default(false),
})

const HOST_KEY_SCHEMA = z.object({
  host: z.string().required(),
  port: z.natural().max(65535).default(22),
  /** 同一 host:port 的全部主机密钥指纹（rsa / ed25519 等各一条）。 */
  fingerprints: z.array(z.string()).default([]),
  /** 旧版单指纹字段：仅作迁移输入（sanitizeHostKeys 会并进 fingerprints）。 */
  fingerprint: z.string().default(''),
})

/**
 * 运行时 Config schema——DSH ≥0.1.7 起同时就是本插件的 settings 存储。
 *
 * 全部字段都标 `.volatile()`：它们都是卡片可改项（见 KNOWN_CONFIG_KEYS），而
 * `settings.update(entryId, patch)` 只接受 volatile 路径；loader 对 volatile-only
 * 变更原地更新引用并发 `loader/volatile-update`，不重挂插件——插件订阅后走
 * `applySection` 热应用（见 kit 的 settingsEntryScope）。
 */
export const Config: z = z.object({
  enabled: z.boolean().default(true).volatile(),
  announceToAgent: z.boolean().default(true).volatile(),
  dockerBin: z.string().default('docker').volatile(),
  allowMutations: z.boolean().default(false).volatile(),
  allowExec: z.boolean().default(false).volatile(),
  execTimeoutSec: z.natural().max(120).default(30).volatile(),
  pollIntervalSec: z.natural().max(60).default(5).volatile(),
  logTailDefault: z.natural().max(5000).default(200).volatile(),
  maxOutputKb: z.natural().max(8192).default(512).volatile(),
  targets: z.array(TARGET_SCHEMA).default([]).volatile(),
  hostKeys: z.array(HOST_KEY_SCHEMA).default([]).volatile(),
})

/** 可经 HTTP POST 写入的配置键（白名单）。 */
const KNOWN_CONFIG_KEYS = new Set([
  'enabled',
  'announceToAgent',
  'dockerBin',
  'allowMutations',
  'allowExec',
  'execTimeoutSec',
  'pollIntervalSec',
  'logTailDefault',
  'maxOutputKb',
  'targets',
  'hostKeys',
  /** 显式清空全部目标的确认位（见 POST /config 的空数组防丢保护）。 */
  'clearTargets',
  /** 显式删除 SSH 主机密钥记录：[{host, port}]（hostKeys 是并集合并，删除必须显式）。 */
  'hostKeysRemove',
])

/** 解析后的运行期配置（settings 与 composition 两条来源统一到这一形状）。 */
interface LiveConfig {
  enabled: boolean
  announceToAgent: boolean
  dockerBin: string
  allowMutations: boolean
  allowExec: boolean
  execTimeoutSec: number
  pollIntervalSec: number
  logTailDefault: number
  maxOutputKb: number
  targets: DockerTarget[]
  hostKeys: HostKeyRecord[]
}

/** 工具返回值形状（与 defineTool 的 output.schema 推断结果一致）。 */
interface ToolTargetRow {
  name: string
  kind: string
  label: string
  ok?: boolean
  error?: string
}

interface ToolAttentionRow {
  id: string
  name: string
  image: string
  state: string
  health?: string
  reasons: string[]
  exitCode?: number
  oomKilled: boolean
  restartCount?: number
}

interface ToolPsRow {
  id: string
  name: string
  image: string
  state: string
  status: string
  health?: string
  ports?: string
  composeProject?: string
  composeService?: string
}

interface ToolLogRow {
  target: string
  id: string
  text: string
  truncated?: boolean
}

interface ToolStatRow {
  id: string
  name: string
  cpuPercent?: number
  memUsage: string
  memPercent?: number
  netIO: string
  blockIO: string
  pids?: number
}

interface ToolEventRow {
  action: string
  name: string
  image: string
  composeProject?: string
  time?: number
  exitCode?: number
}

interface ToolImageRow {
  reference: string
  sizeText: string
  createdSince?: string
  id: string
}

interface ToolNetworkRow {
  name: string
  driver: string
  scope: string
  internal?: boolean
  id: string
}

interface ToolVolumeRow {
  name: string
  driver: string
  scope: string
  mountpoint?: string
}

interface ToolImageDetailRow {
  target: string
  ref: string
  detail: string
}

interface ToolImagePullRow {
  target: string
  ref: string
  code?: number
  text: string
  truncated?: boolean
}

interface ToolExecRow {
  target: string
  id: string
  code?: number
  stdout: string
  stderr: string
  truncated?: boolean
}

/* ------------------------------------------------------------------ *
 * 常量
 * ------------------------------------------------------------------ */

const ROUTE_PREFIX = '/api/dsh-docker'
const BODY_LIMIT = 1024 * 1024

/** 变更类子路由（D32）：要求同源证明（Origin 或 Sec-Fetch-Site: same-origin）。 */
const MUTATION_SUBROUTES = new Set([
  '/action',
  '/images/remove',
  '/images/prune',
  '/networks/remove',
  '/networks/prune',
  '/volumes/remove',
  '/volumes/prune',
  '/exec',
])

const DOCKER_GUIDANCE =
  '本机已安装 dsh-docker 插件（Docker 容器面板）：Web GUI 侧边栏「容器」入口可查看各目标（本机 / SSH 主机）上的容器列表（含 Compose 项目视图、事件「活动」条）、状态、端口、日志（含实时跟随）与资源占用（含实时跟随 + 迷你趋势图），以及镜像列表与镜像详情（层 / 大小 / 构建历史、拉取进度流）、网络与卷（列表 + 详情；删除 / 清理同样在开关之后）；目标在 插件配置 → Docker 容器面板 里维护（SSH 目标可直接引用 tty 终端面板的连接簿条目）。**默认只读**：启动/停止/重启/删除容器、删除镜像 / 清理 dangling / 拉取镜像、docker exec，都需要用户在设置里显式打开「允许变更操作」「允许 exec」后才有对应工具与按钮。agent 侧配套只读工具 docker_targets（列目标）、docker_ps（列容器，含 compose 项目与服务；**target 传 `*` 可一次列出所有目标**）、docker_attention（**需关注汇总**：unhealthy / 反复重启 / OOM / 非零退出 / 僵死，同样支持 `*` 跨目标）、docker_inspect（容器详情）、docker_logs（日志快照）、docker_stats（CPU/内存/IO 快照）、docker_images（镜像列表）、docker_image_inspect（镜像详情 + 构建历史）、docker_events（容器事件快照，见面板容器列表的「活动」条）、docker_networks（网络列表）、docker_volumes（卷列表）；排障推荐顺序：不确定从哪台/哪个容器看起时先 docker_attention（可 `*` 跨目标）→ docker_ps → docker_logs → docker_inspect → docker_stats → docker_events，镜像排查用 docker_images → docker_image_inspect。docker_action（容器生命周期）、docker_image_remove（删镜像）、docker_image_prune（清理 dangling）、docker_image_pull（拉取镜像）、docker_exec 仅在用户打开对应开关后可用，执行前须确认目标，破坏性操作（容器 remove / 镜像删除与清理）要向用户复述后果。网络 / 卷的删除与 prune 目前只提供面板按钮（HTTP 端点），没有对应的 agent 工具——不要在 agent 侧绕过面板做这些变更。docker socket 等价于目标主机的 root 权限，不要在用户未明确要求时执行变更操作。'

/* ------------------------------------------------------------------ *
 * 工具函数
 * ------------------------------------------------------------------ */

interface ReqLike {
  method?: string
  url?: string
  headers: Record<string, string | string[] | undefined>
  socket: { remoteAddress?: string | undefined }
}

interface ResLike {
  writeHead(status: number, headers?: Record<string, string>): void
  end(body?: string | Uint8Array): void
  /*
   * SSE 长连接的最小扩展面（结构化类型，不 import node:http）：宿主 webServer
   * 直接把原生 ServerResponse 交给 handler，这些方法天然存在；可选是为了让
   * 既有 JSON 路由与离线冒烟的极简假 res 不必全部实现。
   */
  write?(chunk: string): boolean | void
  flushHeaders?(): void
  on?(event: 'close' | 'drain', listener: () => void): void
}

/**
 * SSE 帧封装：data 一律 `JSON.stringify` 成**单行**——换行 / 引号被转义，
 * 多字节字符也不会被 SSE 的 `\n` 行边界截断（客户端 JSON.parse 还原）。
 */
export function sseFrame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

/** SSE 心跳间隔（毫秒）：注释帧只保活，客户端 EventSource 会忽略。 */
const SSE_HEARTBEAT_MS = 15_000

/** HTTP 路由的 loopback 信任围栏（与 tty / dsh-mcp 同思路）。 */
/*
 * 环回地址判定（D31）：接受 127/8 全段（BSD/Linux 惯例——整个 127.0.0.0/8 都是
 * 环回，此前只认 127.0.0.1 一个字面量）与 IPv6 等价形式（::1、::ffff: 映射）。
 */
function isLoopbackAddress(address: string | undefined): boolean {
  if (address === undefined || address === '') return false
  let text = address.toLowerCase()
  if (text.startsWith('::ffff:')) text = text.slice(7)
  if (text === '::1') return true
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(text)
  return v4 !== null && v4[1] === '127'
}

/** 别名 Host 解析结果的缓存与超时（D110）：请求路径里的 DNS 不该每请求都打一次，也不该无限等。 */
const HOST_LOOPBACK_TTL_MS = 60_000
const HOST_LOOPBACK_CACHE_MAX = 64
const HOST_LOOPBACK_TIMEOUT_MS = 500
const hostLoopbackCache = new Map<string, { at: number; loopback: boolean }>()

/**
 * 解析一个主机名是否指向本机（D110）。带 500ms 超时与 60s 的 LRU（别名部署下每个请求都要过一次）。
 * **失败与超时不缓存**：解析器恢复后要立刻生效，而不是把一次抖动钉 60 秒。
 */
async function lookupHostLoopback(host: string): Promise<boolean> {
  const cached = hostLoopbackCache.get(host)
  if (cached !== undefined && Date.now() - cached.at <= HOST_LOOPBACK_TTL_MS) return cached.loopback
  let timer: NodeJS.Timeout | null = null
  try {
    const records = await Promise.race([
      dns.promises.lookup(host, { all: true }),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`DNS 解析超时（>${String(HOST_LOOPBACK_TIMEOUT_MS)}ms）`)), HOST_LOOPBACK_TIMEOUT_MS)
        timer.unref?.()
      }),
    ])
    const loopback = records.some((record) => isLoopbackAddress(record.address))
    if (hostLoopbackCache.size >= HOST_LOOPBACK_CACHE_MAX) {
      const oldest = hostLoopbackCache.keys().next().value
      if (oldest !== undefined) hostLoopbackCache.delete(oldest)
    }
    hostLoopbackCache.set(host, { at: Date.now(), loopback })
    return loopback
  } catch {
    return false
  } finally {
    if (timer !== null) clearTimeout(timer)
  }
}

/**
 * Host 是否指向本机（D31）：字面量环回直接判；主机名 / /etc/hosts 别名走一次带超时的
 * DNS 解析。判不出来就拒绝——围栏宁可误拦一个怪别名，不能放行一个能解析到公网的 Host。
 */
async function hostResolvesToLoopback(hostname: string): Promise<boolean> {
  const host = hostname.toLowerCase().replace(/\.$/, '')
  if (host === 'localhost' || host.endsWith('.localhost') || isLoopbackAddress(host)) return true
  return await lookupHostLoopback(host)
}

/**
 * loopback 信任围栏（D31）：字面量环回（绝大多数请求）**同步**判定——保持
 * 「请求进来即建流」的原有时序（SSE 测试与 EventSource 都依赖第一拍就写头）；
 * 只有主机名 / /etc/hosts 别名才走异步 DNS 确认。
 *
 * **来源检查必须在解析 Host 之前**（D80）：别名主机名（`127.0.0.1.nip.io`、`/etc/hosts` 里
 * 的别名）走的是异步分支，若在那里提前 return，`Sec-Fetch-Site` 与 Origin 两段检查会被
 * 整段跳过 —— 围栏等于没设，跨站页面就能写 `/config`（它不要求同源证明）。
 */
function isLoopbackHttp(req: ReqLike): boolean | Promise<boolean> {
  if (!isLoopbackAddress(req.socket.remoteAddress)) return false
  const host = req.headers.host
  if (typeof host !== 'string') return false
  let hostUrl: URL
  try {
    hostUrl = new URL('http://' + host)
  } catch {
    return false
  }
  if (req.headers['sec-fetch-site'] === 'cross-site') return false
  const origin = req.headers.origin
  if (origin !== undefined) {
    let sameOrigin = false
    try {
      sameOrigin = new URL(origin).host === hostUrl.host
    } catch {
      sameOrigin = false
    }
    if (!sameOrigin) return false
  }
  const hostname = hostUrl.hostname.toLowerCase().replace(/\.$/, '')
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || isLoopbackAddress(hostname)) return true
  return hostResolvesToLoopback(hostname)
}

/**
 * 「同源证明」（D32）：变更类与长流端点要求请求带 Origin（浏览器 fetch 对
 * cross-site 一定带）或 Sec-Fetch-Site: same-origin 之一。恶意页面可以用
 * `<img src="GET /images/pull/stream?...">` 触发副作用 / 拉起 docker 子进程，
 * 而旧 Safari / 部分 WebView 既不发 Origin 也不发 Sec-Fetch-Site——这两类端点
 * 对「无来源证明」的请求拒绝；只读端点维持 loopback-only 的原信任模型。
 */
function hasSameOriginProof(req: ReqLike): boolean {
  const site = req.headers['sec-fetch-site']
  if (typeof site === 'string' && site === 'same-origin') return true
  const origin = req.headers.origin
  if (typeof origin !== 'string' || origin === '') return false
  const host = req.headers.host
  if (typeof host !== 'string') return false
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

function writeJson(res: ResLike, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'referrer-policy': 'no-referrer' })
  res.end(JSON.stringify(body))
}

/** 读取并解析 JSON 请求体；超限/非对象/非法 JSON 返回 undefined。 */
async function readJsonBody(req: AsyncIterable<Uint8Array>): Promise<Record<string, unknown> | undefined> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.byteLength
    if (size > BODY_LIMIT) return undefined
    chunks.push(Buffer.from(chunk))
  }
  if (size === 0) return {}
  try {
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined
    return parsed as Record<string, unknown>
  } catch {
    return undefined
  }
}

/** 清洗一份 targets 输入（settings 存储 / 热更新路径共用）。 */
export function sanitizeTargets(input: unknown): DockerTarget[] | undefined {
  if (!Array.isArray(input)) return undefined
  const out: DockerTarget[] = []
  const seen = new Set<string>()
  for (const raw of input) {
    if (typeof raw !== 'object' || raw === null) continue
    const item = raw as Record<string, unknown>
    const name = typeof item.name === 'string' ? item.name.trim() : ''
    if (name === '' || name.length > 64 || seen.has(name)) continue
    const kind = item.kind === 'ssh' ? 'ssh' : 'local'
    const port = typeof item.port === 'number' && Number.isInteger(item.port) && item.port >= 1 && item.port <= 65535 ? item.port : 22
    const auth = item.auth === 'key' || item.auth === 'password' ? item.auth : 'agent'
    seen.add(name)
    out.push({
      name,
      kind,
      book: typeof item.book === 'string' ? item.book.trim() : '',
      host: typeof item.host === 'string' ? item.host.trim() : '',
      port,
      username: typeof item.username === 'string' ? item.username.trim() : '',
      auth,
      keyPath: typeof item.keyPath === 'string' ? item.keyPath.trim() : '',
      password: typeof item.password === 'string' ? item.password : '',
      passphrase: typeof item.passphrase === 'string' ? item.passphrase : '',
      agentForward: item.agentForward === true,
    })
  }
  return out
}

/**
 * 清洗一份 hostKeys 输入（settings 存储 / 热更新 / 种子复制共用）。
 *
 * 同时接受两种形状（D03）：
 *   - tty 0.19.0+ 的 `{host, port, fingerprints: [...]}`（多指纹集合）；
 *   - docker 0.6.x 自己落盘的 `{host, port, fingerprint}`（迁移输入）。
 * host 统一 trim + 小写（与 tty 的落盘口径一致，否则种子命中与否取决于大小写），
 * 同一 host:port 的多条记录合并成一组指纹。
 */
export function sanitizeHostKeys(input: unknown): HostKeyRecord[] | undefined {
  if (!Array.isArray(input)) return undefined
  const byKey = new Map<string, HostKeyRecord>()
  for (const raw of input) {
    if (typeof raw !== 'object' || raw === null) continue
    const item = raw as Record<string, unknown>
    const host = typeof item.host === 'string' ? item.host.trim().toLowerCase() : ''
    const port = typeof item.port === 'number' && Number.isInteger(item.port) && item.port >= 1 && item.port <= 65535 ? item.port : 22
    const list = Array.isArray(item.fingerprints) ? item.fingerprints : []
    const single = typeof item.fingerprint === 'string' && item.fingerprint.trim() !== '' ? [item.fingerprint.trim()] : []
    const fingerprints = [...new Set([
      ...list.filter((fp): fp is string => typeof fp === 'string' && fp.trim() !== '').map((fp) => fp.trim()),
      ...single,
    ])]
    if (host === '' || fingerprints.length === 0) continue
    const key = `${host}:${String(port)}`
    const existing = byKey.get(key)
    if (existing !== undefined) {
      existing.fingerprints = [...new Set([...existing.fingerprints, ...fingerprints])]
      continue
    }
    byKey.set(key, { host, port, fingerprints })
  }
  return [...byKey.values()]
}

/**
 * hostKeys **并集**合并（D10）：客户端表单快照回传的表不得整表覆盖 TOFU 运行期
 * 新增的记录——面板一次无关保存就把钉扎回退掉，指纹变更检测随之失效。按
 * host:port 合并指纹集合；删除某条记录走显式的 `hostKeysRemove`。
 */
export function mergeHostKeys(base: HostKeyRecord[], incoming: unknown): HostKeyRecord[] {
  const byKey = new Map<string, HostKeyRecord>()
  for (const record of base) {
    byKey.set(`${record.host}:${String(record.port)}`, { host: record.host, port: record.port, fingerprints: [...record.fingerprints] })
  }
  for (const record of sanitizeHostKeys(incoming) ?? []) {
    const key = `${record.host}:${String(record.port)}`
    const existing = byKey.get(key)
    if (existing === undefined) {
      byKey.set(key, { host: record.host, port: record.port, fingerprints: [...record.fingerprints] })
      continue
    }
    existing.fingerprints = [...new Set([...existing.fingerprints, ...record.fingerprints])]
  }
  return [...byKey.values()]
}

/**
 * 合并凭证：配置卡片从不回显密码 / 口令（只回 passwordSet），因此浏览器提交的
 * targets 里往往**没有** password/passphrase 字段。按目标名把已有值补回来，
 * 避免「改个名字就把密码清了」。（显式传空字符串仍然按清空处理。）
 *
 * 改名的目标按**连接身份**（book / host / port / username / auth / keyPath）认领
 * 旧凭证（D15）：只按名字找的话，改名 = 凭证凭空消失。身份对不上就不继承——
 * 「删一个目标、另建一个无关目标」不应该串密码，宁缺勿错。
 */
export function mergeTargetSecrets(prev: DockerTarget[], incoming: unknown): unknown {
  if (!Array.isArray(incoming)) return incoming
  const incomingNames = new Set<string>()
  for (const raw of incoming) {
    if (typeof raw !== 'object' || raw === null) continue
    const name = (raw as Record<string, unknown>).name
    if (typeof name === 'string' && name.trim() !== '') incomingNames.add(name.trim())
  }
  // 名字没出现在新表里的旧目标 = 改名 / 删除的候选
  const renamed = prev.filter((target) => !incomingNames.has(target.name))
  return incoming.map((raw) => {
    if (typeof raw !== 'object' || raw === null) return raw
    const item = raw as Record<string, unknown>
    const name = typeof item.name === 'string' ? item.name.trim() : ''
    let before = prev.find((target) => target.name === name)
    if (before === undefined && renamed.length > 0) {
      const book = typeof item.book === 'string' ? item.book.trim() : ''
      const host = typeof item.host === 'string' ? item.host.trim() : ''
      const username = typeof item.username === 'string' ? item.username.trim() : ''
      const keyPath = typeof item.keyPath === 'string' ? item.keyPath.trim() : ''
      const auth = item.auth === 'key' || item.auth === 'password' ? item.auth : 'agent'
      const port = typeof item.port === 'number' && Number.isInteger(item.port) ? item.port : 22
      before = renamed.find((target) =>
        (target.book ?? '') === book
        && target.host === host
        && (target.port ?? 22) === port
        && target.username === username
        && (target.auth ?? 'agent') === auth
        && target.keyPath === keyPath)
    }
    if (before === undefined) return item
    const next: Record<string, unknown> = { ...item }
    if (typeof next.password !== 'string') next.password = before.password ?? ''
    if (typeof next.passphrase !== 'string') next.passphrase = before.passphrase ?? ''
    return next
  })
}

/** 把一份任意来源的配置归一成 LiveConfig。 */
export function normalizeConfig(section: Record<string, unknown>): LiveConfig {
  const targets = sanitizeTargets(section.targets)
  const hostKeys = sanitizeHostKeys(section.hostKeys)
  return {
    enabled: section.enabled !== false,
    announceToAgent: section.announceToAgent !== false,
    dockerBin: assertBin(section.dockerBin),
    allowMutations: section.allowMutations === true,
    allowExec: section.allowExec === true,
    execTimeoutSec: clampInt(section.execTimeoutSec, 1, 120, 30),
    pollIntervalSec: clampInt(section.pollIntervalSec, 1, 60, 5),
    logTailDefault: clampInt(section.logTailDefault, 1, 5000, 200),
    maxOutputKb: clampInt(section.maxOutputKb, 1, 8192, 512),
    targets: targets ?? [],
    hostKeys: hostKeys ?? [],
  }
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) return fallback
  return Math.min(Math.max(value, min), max)
}

/**
 * 事件时间（Unix 秒）→ 本机时区的 HH:MM:SS（agent 文本输出用）。
 * 只回时间不回日期：事件快照窗口最多几小时，日期对排障没有信息量；
 * 浏览器侧不用这个——那里用 Date 按用户本地时区现算。
 */
export function formatEventTime(seconds: number): string {
  const date = new Date(seconds * 1000)
  if (Number.isNaN(date.getTime())) return '--:--:--'
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

/** 字节 → docker 风格的人类可读大小（十进制单位，与 `docker images` 的 SIZE 一致）。 */
export function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '—'
  const units = ['B', 'kB', 'MB', 'GB', 'TB']
  let size = value
  let unit = 0
  while (size >= 1000 && unit < units.length - 1) {
    size /= 1000
    unit += 1
  }
  const text = unit === 0 ? String(Math.round(size)) : size.toFixed(size >= 100 ? 0 : 1)
  return `${text} ${units[unit] ?? 'B'}`
}

/** 从 tty 的 entry settings 读取连接簿（只读；tty 未安装时为空表）。 */
function readTtyBooks(settings: SettingsLookup | undefined): Map<string, SshSpec> {
  const out = new Map<string, SshSpec>()
  if (settings === undefined) return out
  let raw: unknown
  try {
    raw = settings.get('tty')
  } catch {
    return out
  }
  if (typeof raw !== 'object' || raw === null) return out
  const hosts = (raw as { sshHosts?: unknown }).sshHosts
  if (!Array.isArray(hosts)) return out
  for (const entry of hosts) {
    if (typeof entry !== 'object' || entry === null) continue
    const item = entry as Record<string, unknown>
    const name = typeof item.name === 'string' ? item.name.trim() : ''
    const host = typeof item.host === 'string' ? item.host.trim() : ''
    const username = typeof item.username === 'string' ? item.username.trim() : ''
    if (name === '' || host === '' || username === '') continue
    out.set(name, {
      host,
      port: typeof item.port === 'number' && Number.isInteger(item.port) ? item.port : 22,
      username,
      auth: item.auth === 'key' || item.auth === 'password' ? item.auth : 'agent',
      keyPath: typeof item.keyPath === 'string' ? item.keyPath : '',
      password: typeof item.password === 'string' ? item.password : '',
      passphrase: typeof item.passphrase === 'string' ? item.passphrase : '',
      agentForward: item.agentForward === true,
    })
  }
  return out
}

/** 从 tty 的 hostKeys 读取已钉扎指纹（作为本插件 TOFU 的种子）。 */
function readTtyHostKeys(settings: SettingsLookup | undefined): HostKeyRecord[] {
  if (settings === undefined) return []
  let raw: unknown
  try {
    raw = settings.get('tty')
  } catch {
    return []
  }
  if (typeof raw !== 'object' || raw === null) return []
  const keys = (raw as { hostKeys?: unknown }).hostKeys
  return sanitizeHostKeys(keys) ?? []
}

/** 把一个配置目标解析成可连接的规格（连接簿查找在此完成）。 */
export function resolveTarget(target: DockerTarget, books: Map<string, SshSpec>): { resolved?: ResolvedTarget; error?: string } {
  if (target.kind === 'local') return { resolved: { name: target.name, kind: 'local' } }
  if (target.book !== undefined && target.book !== '') {
    const spec = books.get(target.book)
    if (spec === undefined) {
      /*
       * 指引必须指向**用户真能做的动作**。旧文案说"请在 tty 终端面板的设置卡片里添加"——
       * 但那张卡片管的是 tty 自己的连接簿条目，改不了 docker 目标引用的名字：用户照着找
       * 只会扑空（实测：目标引用 HS-248、连接簿里只有 HS_248_ADMIN，进 tty 卡片什么也改不了）。
       * 真正要改的字段是**本卡片这条目标的「连接簿」下拉**，所以先把这里说清楚，再说备选。
       */
      return { error: `目标「${target.name}」引用的连接簿条目不存在：${target.book}（在本卡片这条目标的「连接簿」下拉里改选一个已有条目；或把 tty 终端面板的连接簿补一个同名条目；也可清空下拉改为手填 host/username）` }
    }
    return { resolved: { name: target.name, kind: 'ssh', spec } }
  }
  const host = target.host ?? ''
  const username = target.username ?? ''
  if (host === '' || username === '') {
    return { error: `目标「${target.name}」缺少 SSH 信息：需要 book（连接簿条目名）或 host + username` }
  }
  const spec: SshSpec = {
    host,
    port: target.port ?? 22,
    username,
    auth: target.auth ?? 'agent',
    keyPath: target.keyPath ?? '',
    password: target.password ?? '',
    passphrase: target.passphrase ?? '',
    agentForward: target.agentForward === true,
  }
  return { resolved: { name: target.name, kind: 'ssh', spec } }
}

/* ------------------------------------------------------------------ *
 * 宿主服务的最小类型面（避免把 DSH 内部类型写进本包）
 * ------------------------------------------------------------------ */

/** 只读其它插件 entry 的 settings（旧 `settings.get(ns)` 的替代）。 */
interface SettingsLookup {
  get(ns: string): unknown
}

interface ToolsLike {
  register(definition: unknown): () => void
}

interface WebServerLike {
  register(route: unknown): () => void
}

interface SystemPromptLike {
  section(options: { name: string; order?: number; text: string }): () => void
}

/* ------------------------------------------------------------------ *
 * 插件
 * ------------------------------------------------------------------ */

const plugin = definePlugin<Config>({
  name: 'docker',
  apply(ctx: Context, rawConfig?: Config) {
    // volatile 字段解析后是 `{ get() }` 引用，先还原成纯数据（见 @hyzyn/dsh-kit 的 plainConfig）。
    const config = plainConfig((rawConfig ?? {}) as Config)
    let live = normalizeConfig(config as Record<string, unknown>)
    if (!live.enabled) return

    const logger: ExecLogger = {
      info: (msg) => ctx.logger.info(msg),
      warn: (msg) => ctx.logger.warn(msg),
    }

    /* ---------- 主机指纹（TOFU，本插件自持；tty 记录作种子） ---------- */

    let settingsScope: SettingsEntryScope | undefined
    /**
     * 只读他人 entry（如 tty 的连接簿）：旧 `settings.get(ns)` 在新宿主已不存在，
     * 改走 `settings.describe()` 的 entry 查找（kit 的 readSettingsEntry）。settings
     * 子上下文就绪前保持 undefined，调用方当空表处理——与旧行为一致。
     */
    let settingsApi: SettingsLookup | undefined
    const ttySeed = (): Map<string, string[]> => {
      const map = new Map<string, string[]>()
      for (const record of readTtyHostKeys(settingsApi)) map.set(`${record.host}:${String(record.port)}`, record.fingerprints)
      return map
    }
    const persistHostKeys = (records: HostKeyRecord[]): void => {
      const scope = settingsScope
      if (scope === undefined) return
      void Promise.resolve(scope.update({ hostKeys: records })).catch((error: unknown) => {
        console.warn('[dsh-docker] 主机密钥记录持久化失败: ' + (error instanceof Error ? error.message : String(error)))
      })
    }
    const hostKeyStore: HostKeyStore = {
      get(host, port) {
        // host 键统一 trim + 小写（D03）：tty 落盘时把 host 小写化，比较口径必须一致
        const key = host.trim().toLowerCase()
        const own = live.hostKeys.find((record) => record.host === key && record.port === port)
        if (own !== undefined && own.fingerprints.length > 0) return own.fingerprints
        // tty 已确认过的主机不再重复确认：种子命中即视为可信，并**整组**复制进本插件的
        // 记录（D03）——此前只认单数 fingerprint 字段，tty 0.19.0 改存 fingerprints[] 后
        // 种子恒为空，对 tty 钉扎过的主机会静默重新 TOFU（指纹变更不再拒绝）。
        const seeded = ttySeed().get(`${key}:${String(port)}`)
        if (seeded !== undefined && seeded.length > 0) {
          live.hostKeys = [...live.hostKeys, { host: key, port, fingerprints: [...seeded] }]
          persistHostKeys(live.hostKeys)
          return seeded
        }
        return own?.fingerprints
      },
      record(host, port, fingerprint) {
        const key = host.trim().toLowerCase()
        const existing = live.hostKeys.find((record) => record.host === key && record.port === port)
        if (existing !== undefined) {
          // 同一主机的第二把主机密钥（rsa + ed25519）：并入集合而不是覆盖（D03）
          if (!existing.fingerprints.includes(fingerprint)) {
            existing.fingerprints = [...existing.fingerprints, fingerprint]
            persistHostKeys(live.hostKeys)
          }
          return
        }
        const next = live.hostKeys.filter((record) => !(record.host === key && record.port === port))
        next.push({ host: key, port, fingerprints: [fingerprint] })
        live.hostKeys = next
        persistHostKeys(next)
      },
    }

    const remote = new RemoteExec(logger, hostKeyStore)

    /**
     * 当前生效的 targets：**以 settings 解析值为准**。
     * 为什么不能只读内存里的 live：settings 解析是异步的（服务就绪后才读一次），存在一个
     * 窗口期内 live 仍是 composition 配置（targets 为空）。若此时 GET /config 被
     * 调用，卡片会拿到空目标列表，用户随后保存就把空数组写回 → 目标被清空。
     */
    const targetsNow = (): DockerTarget[] => {
      const scope = settingsScope
      if (scope !== undefined) {
        try {
          const resolved = scope.get()
          if (typeof resolved === 'object' && resolved !== null) {
            const fromScope = sanitizeTargets((resolved as Record<string, unknown>).targets)
            if (fromScope !== undefined) return fromScope
          }
        } catch {
          /* 回落到内存值 */
        }
      }
      return live.targets
    }

    /* ---------- 目标解析与 DockerApi ---------- */

    /** 目标名 → 解析结果（每次现算，连接簿热改立即生效）。 */
    const resolveByName = (name: string): { resolved?: ResolvedTarget; error?: string } => {
      const target = targetsNow().find((item) => item.name === name)
      if (target === undefined) {
        const names = targetsNow().map((item) => item.name).join('、')
        return { error: `未知目标：${name}${names === '' ? '（尚未配置任何目标）' : `（已配置：${names}）`}` }
      }
      return resolveTarget(target, readTtyBooks(settingsApi))
    }

    /** 取某个目标上的 DockerApi（Runner 每次新建，连接由 RemoteExec 池化）。 */
    const apiFor = (name: string): { api?: DockerApi; resolved?: ResolvedTarget; error?: string } => {
      const { resolved, error } = resolveByName(name)
      if (resolved === undefined) return { error }
      try {
        const runner = createRunner({ target: resolved, remote, logger })
        return { api: new DockerApi(runner, live.dockerBin, { timeoutMs: 30_000, maxBytes: live.maxOutputKb * 1024 }), resolved }
      } catch (error_) {
        return { error: error_ instanceof Error ? error_.message : String(error_) }
      }
    }

    /** 单目标省略 target 参数时的默认目标。 */
    const defaultTargetName = (): string | undefined => {
      const list = targetsNow()
      return list.length === 1 ? list[0]?.name : undefined
    }

    /** 解析工具/路由里的 target 参数。 */
    const pickTarget = (input: unknown): { name?: string; error?: string } => {
      if (typeof input === 'string' && input.trim() !== '') {
        const name = input.trim()
        // `*` 聚合只有 docker_ps / docker_attention 支持（D46）：到这里说明是单目标
        // 工具传了 `*`——给专门文案，而不是一句「未知目标：*」
        if (name === '*') return { error: '`*`（全部目标）只有 docker_ps / docker_attention 支持；请传具体目标名（docker_targets 列出）' }
        return { name }
      }
      // 类型不对（数字 / 数组 / 对象）必须报错（D34）：静默回落到默认目标会让
      // 破坏性操作打错主机的最后一道防线失效
      if (input !== undefined && input !== null && typeof input !== 'string') {
        return { error: 'target 必须是字符串（目标名见 docker_targets）' }
      }
      const fallback = defaultTargetName()
      if (fallback !== undefined) return { name: fallback }
      const list = targetsNow()
      if (list.length === 0) return { error: '尚未配置任何 Docker 目标（插件配置 → Docker 容器面板）' }
      return { error: 'target 必填（已配置多个目标：' + list.map((item) => item.name).join('、') + '）' }
    }

    /**
     * 跨目标聚合（0.15.0）：所有目标的容器 / 需关注列表在面板与 agent 工具里共用同
     * 一套逻辑。三个必须的性质：
     *   - **并发上限**：ssh exec 扇出太多会互相挤（远端 sshd MaxStartups / 本机 fd）；
     *   - **单目标超时**：一台网络不通不能把整个聚合页拖住；
     *   - **错误隔离**：失败的组带上 error 照常返回，其余目标的结果照常可用。
     */
    const AGG_CONCURRENCY = 4
    const AGG_TIMEOUT_MS = 45_000

    async function mapLimit<T, R>(items: readonly T[], limit: number, run: (item: T, index: number) => Promise<R>): Promise<R[]> {
      const results = new Array<R>(items.length)
      let cursor = 0
      const workers = new Array(Math.min(Math.max(limit, 1), Math.max(items.length, 1))).fill(null).map(async () => {
        for (;;) {
          const index = cursor
          cursor += 1
          if (index >= items.length) return
          results[index] = await run(items[index] as T, index)
        }
      })
      await Promise.all(workers)
      return results
    }

    interface TargetGroup<T> {
      target: string
      label: string
      ok: boolean
      error?: string
      /** 该目标上聚合出来的数据（形状由调用方决定：容器数组 / 需关注数组）。 */
      data?: T
    }

    /** 在所有（或指定）目标上跑同一件事，返回按目标分组的「部分成功」结果。 */
    const aggregateAcrossTargets = async <T>(
      names: readonly string[],
      run: (api: DockerApi, name: string) => Promise<T>,
    ): Promise<Array<TargetGroup<T>>> => {
      return await mapLimit(names, AGG_CONCURRENCY, async (name): Promise<TargetGroup<T>> => {
        const built = apiFor(name)
        const resolved = built.resolved
        const label = resolved === undefined
          ? name
          : (resolved.kind === 'local' ? '本机' : sshTarget(resolved.spec as SshSpec))
        if (built.api === undefined) return { target: name, label, ok: false, error: built.error ?? '无法构造执行通道' }
        const api = built.api
        let timer: NodeJS.Timeout | null = null
        try {
          const timeout = new Promise<never>((_resolve, reject) => {
            timer = setTimeout(() => reject(new Error(`聚合超时（>${String(AGG_TIMEOUT_MS / 1000)}s）`)), AGG_TIMEOUT_MS)
            timer.unref?.()
          })
          const data = await Promise.race([run(api, name), timeout])
          return { target: name, label, ok: true, data }
        } catch (error) {
          return { target: name, label, ok: false, error: error instanceof Error ? error.message : String(error) }
        } finally {
          if (timer !== null) clearTimeout(timer)
        }
      })
    }

    /** 目标名列表：'*' / 空 表示全部（保持配置顺序）。 */
    const targetsFor = (input: unknown): string[] => {
      if (typeof input === 'string' && input.trim() !== '' && input.trim() !== '*') return [input.trim()]
      return targetsNow().map((item) => item.name)
    }

    /* ---------- 配置快照（凭证不外泄） ---------- */

    const snapshotTarget = (target: DockerTarget): Record<string, unknown> => ({
      name: target.name,
      kind: target.kind,
      book: target.book ?? '',
      host: target.host ?? '',
      port: target.port ?? 22,
      username: target.username ?? '',
      auth: target.auth ?? 'agent',
      keyPath: target.keyPath ?? '',
      agentForward: target.agentForward === true,
      // 密码 / 口令只回「是否已设置」，值永不回传浏览器
      passwordSet: typeof target.password === 'string' && target.password !== '',
      passphraseSet: typeof target.passphrase === 'string' && target.passphrase !== '',
    })

    const snapshot = (): Record<string, unknown> => {
      const books = readTtyBooks(settingsApi)
      return {
        enabled: live.enabled,
        announceToAgent: live.announceToAgent,
        dockerBin: live.dockerBin,
        allowMutations: live.allowMutations,
        allowExec: live.allowExec,
        execTimeoutSec: live.execTimeoutSec,
        pollIntervalSec: live.pollIntervalSec,
        logTailDefault: live.logTailDefault,
        maxOutputKb: live.maxOutputKb,
        targets: targetsNow().map(snapshotTarget),
        hostKeys: live.hostKeys,
        // 只读复用 tty 连接簿：卡片用它渲染「从连接簿选择」下拉
        ttyBooks: [...books.keys()],
        /*
         * 连接簿条目 → 解析后的 host:port（**只 name/host/port，凭据永不出宿主**）。
         *
         * 客户端「当前会话主机 ↔ 目标」的匹配要在**连接之前**就能判定：从连接簿打开的
         * SSH 标签，spec 里只有条目名；宿主回显的 `tab.target` 只在**连接成功**后才
         * 有值，而连不上（握手超时 / 主机没开机）恰恰是最需要面板的时候。少了这张表，
         * 面板只能判成「该主机没配目标」，然后沿用上一次选的目标——把另一台主机的容器
         * 显示出来。有了它，按主机配的目标（如目标绑 lab-a 条目、会话走
         * 192.0.2.10 条目）在连接失败时也能对上。
         */
        ttyBookHosts: [...books.entries()].map(([name, spec]) => ({ name, host: spec.host, port: spec.port })),
        ttyAvailable: books.size > 0,
        toolsRegistered: registeredNames,
      }
    }

    /* ---------- 活跃 SSE 长流清点 ---------- */

    /**
     * 活跃的 SSE 长流句柄（日志 / 统计 / 拉取三条流共用）。流本身由 HTTP handler
     * 持有并自清理；这里登记一份，供插件禁用 / 配置热更新 / 卸载时统一收尾
     * （end + abort 执行器）。句柄是每个插件实例一份（不共享模块级集合），
     * 多实例挂载时不会互相误杀。
     */
    const activeStreams = new Set<{ end(): void }>()

    const closeAllStreams = (): void => {
      for (const stream of [...activeStreams]) {
        try {
          stream.end()
        } catch {
          /* 连接已断开 */
        }
      }
      activeStreams.clear()
    }

    /* ---------- 通用 SSE 长连接（三条流共用一份基建） ---------- */

    /**
     * 通用 SSE 长连接。日志流（`docker logs -f`）、统计流（`docker stats`）、
     * 拉取流（`docker pull`）三者只差「执行器 + 结束原因 + end 附加字段」，
     * 其余全部共用这一份实现：
     *
     *   - 响应头（text/event-stream / no-cache / keep-alive / x-accel-buffering）
     *     统一在这里写，写完立即 flushHeaders（宿主 gzip 对 SSE 显式跳过）；
     *   - 每 15s 一帧 `: ping` 注释心跳（SSE 规范里客户端忽略）；
     *   - 活跃流登记：插件禁用 / 配置热更新 / 卸载时由 closeAllStreams 统一收尾；
     *   - 客户端断开 → 静默清理（不写任何帧）+ abort 执行器；
     *   - 执行器正常退出 → `end` 帧（带 reason / code / 附加字段）后关闭响应；
     *   - 执行器抛错 → `error` 帧后关闭响应。
     *
     * 调用方负责「参数校验」——校验失败时写常规 JSON（4xx）并直接返回，不建流。
     */
    const openSseStream = async (
      res: ResLike,
      options: {
        /** `end` 帧的 reason（执行器自然退出时发）。 */
        reason: string
        /** 执行器：sendEvent 发帧，signal 中止；resolve 得到 docker 退出码。 */
        run: (sendEvent: (event: string, data: unknown) => void, signal: AbortSignal) => Promise<number | null>
        /** `end` 帧的附加字段（如 ref / ids）。 */
        endData?: (code: number | null) => Record<string, unknown>
      },
    ): Promise<void> => {
      const write = res.write?.bind(res)
      const flushHeaders = res.flushHeaders?.bind(res)
      if (write === undefined || flushHeaders === undefined) {
        writeJson(res, 500, { error: '宿主响应不支持 SSE 长连接' })
        return
      }

      res.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
        'referrer-policy': 'no-referrer',
        // 反代（nginx 等）默认缓冲响应体：不关掉的话流要等缓冲区满才到浏览器
        'x-accel-buffering': 'no',
      })
      flushHeaders()

      const controller = new AbortController()
      let done = false
      let heartbeat: NodeJS.Timeout | null = null

      /*
       * 背压（D04）：write() 返回 false = socket 写缓冲已满。无视返回值继续写，
       * 慢客户端（后台标签 / 慢链路）+ 话痨容器会让宿主侧缓冲无界增长直至 OOM。
       * 处理：缓冲已满时把帧暂存进内存队列、等 drain 再续写；队列超过上限视为
       * 客户端事实上已死（消费速度跟不上产出），主动收尾——宿主内存上限从
       * 「无界」变成「每条流 ≤ MAX_PENDING_BYTES」。上游（docker logs -f 的
       * stdout）由 finish/clientGone 里的 abort 停掉，不需要逐帧 pause。
       */
      const MAX_PENDING_BYTES = 8 * 1024 * 1024
      let pendingFrames: string[] = []
      let pendingBytes = 0

      const stopHeartbeat = (): void => {
        if (heartbeat === null) return
        clearInterval(heartbeat)
        heartbeat = null
      }
      /** 客户端断开 / 写失败：静默清理（不写帧），中止执行器。 */
      const clientGone = (): void => {
        if (done) return
        done = true
        stopHeartbeat()
        pendingFrames = []
        pendingBytes = 0
        activeStreams.delete(handle)
        controller.abort()
      }
      /** 服务端主动收尾（正常结束 / 出错 / 插件禁用 / 卸载）：关响应。 */
      const finish = (): void => {
        if (done) return
        done = true
        stopHeartbeat()
        activeStreams.delete(handle)
        controller.abort()
        /*
         * 收尾前把没写完的帧交给 res.end 落地（D83）：直接清空队列会把已经入队、还没进
         * socket 的帧（含 end / error 帧）一起丢掉。客户端凭「连接关了但没有 end 帧」
         * 判定异常 → EventSource 自动重连 → **拉取流会把 docker pull 再跑一遍**。
         * 队列本身有 8MB 上限，这里一次 append 不会放大内存。
         */
        const tail = pendingFrames.join('')
        pendingFrames = []
        pendingBytes = 0
        try {
          res.end(tail === '' ? undefined : tail)
        } catch {
          /* 连接已断开 */
        }
      }
      const writeFrame = (frame: string): boolean => {
        try {
          return write(frame) !== false
        } catch {
          // 写失败 = 连接已断：与 res close 同一收尾路径
          clientGone()
          return false
        }
      }
      /** drain 后续写暂存的帧；中途再遇 false 就停手等下一次 drain。 */
      const flushPending = (): void => {
        while (!done && pendingFrames.length > 0) {
          const frame = pendingFrames[0] as string
          if (!writeFrame(frame)) return
          pendingBytes -= frame.length
          pendingFrames.shift()
        }
      }
      const send = (frame: string): void => {
        if (done) return
        if (pendingFrames.length === 0 && writeFrame(frame)) return
        if (done) return
        pendingFrames.push(frame)
        pendingBytes += frame.length
        if (pendingBytes > MAX_PENDING_BYTES) finish()
      }
      const sendEvent = (event: string, data: unknown): void => send(sseFrame(event, data))

      const handle = { end: finish }
      activeStreams.add(handle)
      res.on?.('close', clientGone)
      res.on?.('drain', flushPending)

      heartbeat = setInterval(() => send(': ping\n\n'), SSE_HEARTBEAT_MS)
      heartbeat.unref?.()

      try {
        const code = await options.run(sendEvent, controller.signal)
        if (done) return
        sendEvent('end', { reason: options.reason, code, ...(options.endData?.(code) ?? {}) })
        finish()
      } catch (error) {
        if (done) return
        sendEvent('error', { message: error instanceof Error ? error.message : String(error) })
        finish()
      }
    }

    /* ---------- 配置热应用 ---------- */

    /**
     * 逐字段比较目标列表（含凭证）：凭证变了，已开的流按旧凭据在跑，也要收尾。
     * **顺序无关**（D108）：面板上重排一次目标不该被当成「目标变了」而收流 —— 那会把
     * 在途的 docker pull 一起 abort 掉（正是 D09 要消除的「一次白拉」）。
     */
    const sameTargets = (a: DockerTarget[], b: DockerTarget[]): boolean => {
      if (a.length !== b.length) return false
      const byName = new Map(b.map((item) => [item.name, item]))
      return a.every((item) => {
        const other = byName.get(item.name)
        if (other === undefined) return false
        return item.kind === other.kind
          && item.book === other.book
          && item.host === other.host
          && item.port === other.port
          && item.username === other.username
          && item.auth === other.auth
          && item.keyPath === other.keyPath
          && item.password === other.password
          && item.passphrase === other.passphrase
          && item.agentForward === other.agentForward
      })
    }

    const applySection = (section: Record<string, unknown>, options?: { forceRefreshTools?: boolean }): void => {
      const before = live
      // hostKeys 只在显式传入时覆盖（避免把 TOFU 运行期新增的记录冲掉）
      const merged: Record<string, unknown> = { ...live, ...section }
      if (section.hostKeys === undefined) merged.hostKeys = live.hostKeys
      live = normalizeConfig(merged)
      /*
       * 执行通道相关的键**变了**才收流（D09）：TOFU 落盘会走到这里（hostKeys 变化、
       * 其余不变），此前无差别 closeAllStreams 会把刚开的日志 FOLLOW 掐断、把在途的
       * docker pull abort 掉——一次白拉。浏览器侧 EventSource 虽会自动重连，但拉取
       * 不会自己重来。
       */
      // 能力开关被**撤销**时也必须收流（D84）：在途的 /images/pull/stream 是写操作，
      // 关掉「允许变更操作」就该立刻停手（旧代码无条件收流，D09 收窄条件时漏了这条）。
      const mutationsRevoked = before.allowMutations && !live.allowMutations
      if (before.enabled !== live.enabled || before.dockerBin !== live.dockerBin || !sameTargets(before.targets, live.targets) || mutationsRevoked) {
        closeAllStreams()
      }
      // 工具注册面只受启用态 / 能力开关影响；dockerBin 不改变工具清单但影响执行，
      // 一起重注册是幂等的，保守带上。forceRefreshTools 给「保存路径」用：上一次注册
      // 可能只成功了一部分，重存同一份配置也要能重试（D107）。
      if (options?.forceRefreshTools === true
        || before.enabled !== live.enabled
        || before.dockerBin !== live.dockerBin
        || before.allowMutations !== live.allowMutations
        || before.allowExec !== live.allowExec) {
        refreshTools()
      }
      if (before.enabled !== live.enabled || before.announceToAgent !== live.announceToAgent) {
        refreshAnnouncement()
      }
      console.log(`[dsh-docker] config applied (enabled=${String(live.enabled)}, bin=${live.dockerBin}, targets=${String(live.targets.length)}, allowMutations=${String(live.allowMutations)}, allowExec=${String(live.allowExec)})`)
    }

    /* ---------- agent 工具 ---------- */

    let toolsApi: ToolsLike | undefined
    let toolDisposers: Array<() => void> = []
    let registeredNames: string[] = []

    const renderTargets = (rows: Array<{ name: string; kind: string; label: string; ok?: boolean; error?: string; serverVersion?: string }>): string => {
      if (rows.length === 0) return '尚未配置任何 Docker 目标（插件配置 → Docker 容器面板 → 目标）。'
      return 'Docker 目标：' + rows.map((row) => {
        const state = row.ok === undefined ? '' : row.ok ? ' [可达]' : ` [不可用：${row.error ?? '未知'}]`
        const version = row.serverVersion === undefined ? '' : ` docker ${row.serverVersion}`
        return `\n- ${row.name} (${row.kind}) ${row.label}${version}${state}`
      }).join('')
    }

    /**
     * 容器行 → 一行文本。入参是**工具 schema 的扁平形状**（不是领域类型 `ContainerSummary`）：
     * `ports` 已经是拼好的字符串、id 在 `id` 上、可省字段用 `undefined` 表示「无」。
     *
     * 这里踩过一次：渲染器按领域类型写（`row.ports.map(...)` / `row.shortId` /
     * `row.health === null`），而工具返回的是扁平形状——于是 `ports.map is not a function`
     * 直接崩、`id=undefined`。render 的入参是 `unknown` + 一个不受检查的 `as` 断言，
     * 所以 tsc 抓不到。现在两侧共用下面这些 Tool*Row 类型，形状一变就编译报错。
     */
    const renderPsRow = (row: ToolPsRow): string => {
      const ports = row.ports === undefined || row.ports === '' ? '' : ' ports=' + row.ports
      const health = row.health === undefined ? '' : ` health=${row.health}`
      const compose = row.composeProject === undefined ? '' : ` compose=${row.composeProject}/${row.composeService ?? '-'}`
      return `\n- ${row.name} [${row.state}]${health} image=${row.image}${ports}${compose} id=${row.id}`
    }

    /** 跨目标容器渲染：按目标分组，失败的目标单独一行说明（部分成功也要可读）。 */
    const renderAggregatedContainers = (
      groups: Array<{ target: string; label: string; ok: boolean; error?: string; containers?: ToolPsRow[] }>,
    ): string => {
      if (groups.length === 0) return '尚未配置任何 Docker 目标（插件配置 → Docker 容器面板）。'
      const total = groups.reduce((sum, group) => sum + (group.containers?.length ?? 0), 0)
      const failed = groups.filter((group) => !group.ok)
      const head = `所有目标共 ${String(total)} 个容器（${String(groups.length)} 个目标${failed.length > 0 ? `，${String(failed.length)} 个不可达` : ''}）：`
      return head + groups.map((group) => {
        if (!group.ok) return `\n\n■ ${group.target}（${group.label}）— 不可用：${group.error ?? '未知错误'}`
        const rows = group.containers ?? []
        return `\n\n■ ${group.target}（${group.label}）— ${String(rows.length)} 个容器` + rows.map(renderPsRow).join('')
      }).join('')
    }

    const ATTENTION_LABEL: Record<string, string> = {
      unhealthy: '不健康',
      restarting: '反复重启',
      oom: '被 OOM 杀',
      'exit-nonzero': '非零退出',
      dead: '僵死',
    }

    /** 需关注列表渲染（单目标 / 跨目标共用）。入参同样是**工具扁平形状**，不是 AttentionItem。 */
    const renderAttention = (
      groups: Array<{ target: string; label: string; ok: boolean; error?: string; items?: ToolAttentionRow[]; total?: number; truncated?: boolean; degraded?: boolean }>,
    ): string => {
      // 零目标不是「一切正常」（D53）：排障入口给出假阴性比报错更糟——与 docker_ps
      // 的「尚未配置任何 Docker 目标」兜底同款
      if (groups.length === 0) return '尚未配置任何 Docker 目标（插件配置 → Docker 容器面板）。'
      const total = groups.reduce((sum, group) => sum + (group.items?.length ?? 0), 0)
      if (total === 0 && groups.every((group) => group.ok)) return '所有目标上没有需要关注的容器（无 unhealthy / 反复重启 / OOM / 非零退出 / 僵死）。'
      return `需关注容器共 ${String(total)} 个：` + groups.map((group) => {
        if (!group.ok) return `\n\n■ ${group.target}（${group.label}）— 不可用：${group.error ?? '未知错误'}`
        const items = group.items ?? []
        if (items.length === 0) return `\n\n■ ${group.target}（${group.label}）— 无异常`
        // 降级信号的措辞要覆盖全部三种成因（D42/D85）：inspect 整体失败、候选超出检查预算、
        // 补捞预算被吃满 —— 都是「权威字段按摘要口径」，而不是单纯的 inspect 失败
        const warn = group.degraded === true ? '（部分条目未取到权威详情：inspect 失败或候选超出检查预算，OOM / 重启次数等按摘要口径）' : ''
        // 截断信号（D12）：名额按严重度排序后切，超出的不静默
        const cut = group.truncated === true && group.total !== undefined && group.total > items.length
          ? `（该目标实际共 ${String(group.total)} 条，已按严重度截断为 ${String(items.length)} 条，可传更大的 limit）`
          : ''
        const notes = [warn, cut].filter((part) => part !== '').join(' ')
        return `\n\n■ ${group.target}（${group.label}）${notes === '' ? '' : '\n' + notes}` + items.map((item) => {
          const reasons = item.reasons.map((reason) => ATTENTION_LABEL[reason] ?? reason).join(' + ')
          const extra = [
            item.exitCode === undefined ? '' : `exit=${String(item.exitCode)}`,
            item.restartCount === undefined ? '' : `restarts=${String(item.restartCount)}`,
            item.oomKilled ? 'OOMKilled=true' : '',
          ].filter((part) => part !== '').join(' ')
          const health = item.health === undefined ? '' : '/' + item.health
          return `\n- ${item.name} [${item.state}${health}] ${reasons} image=${item.image}${extra === '' ? '' : ' ' + extra} id=${item.id}`
        }).join('')
      }).join('')
    }

    const renderContainers = (target: string, rows: ToolPsRow[]): string => {
      if (rows.length === 0) return `目标 ${target}：没有容器。`
      return `目标 ${target} 的容器（${String(rows.length)} 个）：` + rows.map(renderPsRow).join('')
    }

    const renderStats = (target: string, rows: ToolStatRow[]): string => {
      if (rows.length === 0) return `目标 ${target}：没有运行中的容器。`
      return `目标 ${target} 的资源占用：` + rows.map((row) => `\n- ${row.name} cpu=${row.cpuPercent === undefined ? '?' : String(row.cpuPercent) + '%'} mem=${row.memUsage} (${row.memPercent === undefined ? '?' : String(row.memPercent) + '%'}) net=${row.netIO} block=${row.blockIO} pids=${row.pids === undefined ? '?' : String(row.pids)}`).join('')
    }

    const renderEvents = (target: string, since: string, rows: ToolEventRow[]): string => {
      if (rows.length === 0) return `目标 ${target}：最近 ${since} 没有容器事件。`
      return `目标 ${target} 的容器事件（最近 ${since}，${String(rows.length)} 条）：` + rows.map((row) => {
        const at = row.time === undefined ? '--:--:--' : formatEventTime(row.time)
        const exit = row.exitCode === undefined ? '' : ` exit=${String(row.exitCode)}`
        const compose = row.composeProject === undefined ? '' : ` compose=${row.composeProject}`
        return `\n- ${at} ${row.name} ${row.action}${exit}${compose} image=${row.image}`
      }).join('')
    }

    const renderDetail = (detail: ContainerDetail): string => {
      const lines = [
        `容器 ${detail.name}（${detail.shortId}）`,
        `- 状态：${detail.state}${detail.health === null ? '' : ' / ' + detail.health}${detail.status === '' ? '' : '（' + detail.status + '）'}`,
        `- 镜像：${detail.image}`,
        `- 启动：${detail.startedAt ?? '—'}  结束：${detail.finishedAt ?? '—'}`,
        `- 退出码：${detail.exitCode === null ? '—' : String(detail.exitCode)}  重启次数：${detail.restartCount === null ? '—' : String(detail.restartCount)}  重启策略：${detail.restartPolicy ?? '—'}`,
        `- 端口：${detail.ports.length === 0 ? '—' : detail.ports.map((p) => (p.hostPort === undefined ? `${String(p.containerPort)}/${p.protocol}` : `${p.hostIp ?? ''}:${String(p.hostPort)}→${String(p.containerPort)}/${p.protocol}`)).join(', ')}`,
        `- 挂载：${detail.mounts.length === 0 ? '—' : detail.mounts.map((m) => `${m.source}→${m.destination}${m.readWrite ? '' : '(ro)'}`).join(', ')}`,
        `- 网络：${detail.networks.length === 0 ? '—' : detail.networks.map((n) => `${n.name}${n.ip === null ? '' : '(' + n.ip + ')'}`).join(', ')}`,
        `- 命令：${detail.entrypoint}${detail.command === '' ? '' : ' ' + detail.command}`,
      ]
      if (detail.healthLogTail !== null) lines.push(`- 最近健康检查：${detail.healthLogTail}`)
      return lines.join('\n')
    }

    const renderNetworks = (target: string, rows: ToolNetworkRow[]): string => {
      if (rows.length === 0) return `目标 ${target}：没有网络。`
      return `目标 ${target} 的网络（${String(rows.length)} 个）：` + rows.map((row) => {
        const internal = row.internal === true ? ' internal=true' : ''
        return `\n- ${row.name} driver=${row.driver} scope=${row.scope}${internal} id=${row.id}`
      }).join('')
    }

    const renderVolumes = (target: string, rows: ToolVolumeRow[]): string => {
      if (rows.length === 0) return `目标 ${target}：没有卷。`
      return `目标 ${target} 的卷（${String(rows.length)} 个）：` + rows.map((row) => {
        const mount = row.mountpoint === undefined || row.mountpoint === '' ? '' : ` mount=${row.mountpoint}`
        return `\n- ${row.name} driver=${row.driver} scope=${row.scope}${mount}`
      }).join('')
    }

    const renderImages = (target: string, rows: ToolImageRow[]): string => {
      if (rows.length === 0) return `目标 ${target}：没有镜像。`
      return `目标 ${target} 的镜像（${String(rows.length)} 个）：` + rows.map((row) => {
        const created = row.createdSince === undefined || row.createdSince === '' ? '' : ' (' + row.createdSince + ')'
        return `\n- ${row.reference} ${row.sizeText}${created} id=${row.id}`
      }).join('')
    }

    /** 镜像详情 + 构建历史（agent 工具 docker_image_inspect 的可读渲染）。 */
    const renderImageDetail = (payload: { detail: ImageDetail; history: ImageHistoryEntry[]; historyError: string | null }): string => {
      const d = payload.detail
      const title = d.repoTags.length === 0 ? `<none>（${d.shortId}）` : d.repoTags.join(', ')
      const lines = [
        `镜像 ${title}`,
        `- ID：${d.id}`,
        `- 大小：${d.size === null ? '—' : formatBytes(d.size)}${d.virtualSize === null || d.virtualSize === d.size ? '' : `（含父层 ${formatBytes(d.virtualSize)}）`}`,
        `- 创建：${d.created === '' ? '—' : d.created}`,
        `- 平台：${d.os === '' && d.architecture === '' ? '—' : `${d.os}/${d.architecture}`}`,
        `- 层：${String(d.layerCount)} 层`,
        `- 入口：${(d.entrypoint + ' ' + d.command).trim() || '—'}`,
        ...(d.exposedPorts.length === 0 ? [] : [`- 暴露端口：${d.exposedPorts.join(', ')}`]),
        ...(d.repoDigests.length === 0 ? [] : [`- digest：${d.repoDigests.join(', ')}`]),
      ]
      if (payload.historyError !== null) lines.push(`- 构建历史：读取失败（${payload.historyError}）`)
      else if (payload.history.length === 0) lines.push('- 构建历史：无')
      else {
        lines.push(`- 构建历史（${String(payload.history.length)} 步，从新到旧）：`)
        for (const step of payload.history.slice(0, 30)) {
          lines.push(`  · ${step.shortId} ${step.createdSince} ${step.sizeText} ${step.createdBy.slice(0, 160)}`)
        }
        if (payload.history.length > 30) lines.push(`  …（其余 ${String(payload.history.length - 30)} 步略）`)
      }
      return lines.join('\n')
    }

    /** 重新注册 agent 工具（能力开关变化时调用；幂等）。 */
    const refreshTools = (): void => {
      for (const dispose of toolDisposers) {
        try {
          dispose()
        } catch {
          /* 工具已注销 */
        }
      }
      toolDisposers = []
      registeredNames = []
      const tools = toolsApi
      if (tools === undefined) return
      // 插件禁用（设置卡片关掉「启用插件」）时不注册任何工具：运行期关掉也要立刻生效
      if (!live.enabled) return
      // 文案要跟语义一致（D46）：`*` 聚合只有 docker_ps / docker_attention 真支持，
      // 其余 12 个单目标工具省略时只在「恰好一个目标」时回落、多目标则报 target 必填
      const targetParam = { type: 'string', description: '目标名（docker_targets 列出；只有一个目标时可省略。`*` 仅 docker_ps / docker_attention 支持，其他工具请传具体目标名）' } as const

      /*
       * 单个工具注册失败不该把整批带下去（D107）：以前 add 直接抛，调用方（applySection）
       * 也就抛了，结果是「旧工具已全拆 + 新工具只注册了一半」，而重存同一份配置又因为
       * 差异判定不再触发 refreshTools —— 半套状态一直缺到重启。现在逐条兜住并汇总，
       * 下次配置变更（或保存路径的 forceRefreshTools）会自然重试。
       */
      const failures: string[] = []
      const add = (toolName: string, definition: unknown): void => {
        try {
          toolDisposers.push(tools.register(definition))
          registeredNames.push(toolName)
        } catch (error) {
          failures.push(`${toolName}: ${error instanceof Error ? error.message : String(error)}`)
        }
      }

      add('docker_targets', defineTool({
        name: 'docker_targets',
        description: '列出已配置的 Docker 目标（本机 / SSH 主机），可选探测每个目标的 docker daemon 是否可达。其他 docker_* 工具的 target 参数取自这里。',
        parameters: { probe: { type: 'boolean', description: 'true 时逐个探测 docker 版本与 daemon 可达性（SSH 目标会建连接，较慢）' } },
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
                    name: { type: 'string', required: true },
                    kind: { type: 'string', required: true },
                    label: { type: 'string', required: true },
                    ok: { type: 'boolean' },
                    error: { type: 'string' },
                    serverVersion: { type: 'string' },
                  },
                },
              },
            },
          },
          render: (_args: unknown, value: unknown) => {
            const rows = (value as { targets?: Array<{ name: string; kind: string; label: string; ok?: boolean; error?: string; serverVersion?: string }> }).targets ?? []
            return [{ type: 'text', text: renderTargets(rows) }]
          },
        },
        async execute(args: unknown): Promise<{ targets: Array<{ name: string; kind: string; label: string; ok?: boolean; error?: string; serverVersion?: string }> }> {
          const input = (args ?? {}) as { probe?: unknown }
          const books = readTtyBooks(settingsApi)
          const rows: Array<{ name: string; kind: string; label: string; ok?: boolean; error?: string; serverVersion?: string }> = []
          for (const target of targetsNow()) {
            const { resolved, error } = resolveTarget(target, books)
            if (resolved === undefined) {
              rows.push({ name: target.name, kind: target.kind, label: '解析失败', ok: false, error: error ?? '未知错误' })
              continue
            }
            const label = resolved.kind === 'local' ? '本机' : sshTarget(resolved.spec as SshSpec)
            if (input.probe !== true) {
              rows.push({ name: target.name, kind: target.kind, label })
              continue
            }
            const { api } = apiFor(target.name)
            if (api === undefined) {
              rows.push({ name: target.name, kind: target.kind, label, ok: false, error: '无法构造执行通道' })
              continue
            }
            const probe = await api.probe()
            // serverVersion 随 probe 回传（D48）：README 承诺「探测 docker 版本」，
            // probe() 本来就返回了它，只是这里被丢掉了
            rows.push({
              name: target.name,
              kind: target.kind,
              label,
              ok: probe.ok,
              ...(probe.ok ? { ...(probe.serverVersion === null ? {} : { serverVersion: probe.serverVersion }) } : { error: probe.error ?? '未知错误' }),
            })
          }
          return { targets: rows }
        },
      }))

      add('docker_ps', defineTool({
        name: 'docker_ps',
        description: '列出容器（默认只列运行中的；all:true 含已停止）。**target 传 `*` = 一次列出所有目标**（跨主机，按目标分组返回，单个目标不可达不影响其他目标）。排障第一步。',
        parameters: {
          target: { type: 'string', description: '目标名；传 `*` 或省略（仅一个目标时）表示当前目标/全部目标（docker_targets 列出）' },
          all: { type: 'boolean', description: 'true 时包含已停止容器（默认 false）' },
        },
        output: {
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              target: { type: 'string' },
              containers: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    id: { type: 'string', required: true },
                    name: { type: 'string', required: true },
                    image: { type: 'string', required: true },
                    state: { type: 'string', required: true },
                    status: { type: 'string', required: true },
                    health: { type: 'string' },
                    ports: { type: 'string' },
                    composeProject: { type: 'string' },
                    composeService: { type: 'string' },
                  },
                },
              },
              groups: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    target: { type: 'string', required: true },
                    label: { type: 'string', required: true },
                    ok: { type: 'boolean', required: true },
                    error: { type: 'string' },
                    containers: {
                      type: 'array',
                      items: {
                        type: 'object',
                        additionalProperties: false,
                        properties: {
                          id: { type: 'string', required: true },
                          name: { type: 'string', required: true },
                          image: { type: 'string', required: true },
                          state: { type: 'string', required: true },
                          status: { type: 'string', required: true },
                          health: { type: 'string' },
                          ports: { type: 'string' },
                          composeProject: { type: 'string' },
                          composeService: { type: 'string' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          render: (_args: unknown, value: unknown) => {
            const v = value as {
              target?: string
              containers?: ToolPsRow[]
              groups?: Array<{ target: string; label: string; ok: boolean; error?: string; containers?: ToolPsRow[] }>
            }
            if (Array.isArray(v.groups)) return [{ type: 'text', text: renderAggregatedContainers(v.groups) }]
            return [{ type: 'text', text: renderContainers(v.target ?? '?', v.containers ?? []) }]
          },
        },
        async execute(args: unknown): Promise<{
          target?: string
          containers?: ToolPsRow[]
          groups?: Array<{ target: string; label: string; ok: boolean; error?: string; containers?: ToolPsRow[] }>
        }> {
          const input = (args ?? {}) as { target?: unknown; all?: unknown }
          const isAll = typeof input.target === 'string' && input.target.trim() === '*'
          const toRow = (row: ContainerSummary): ToolPsRow => ({
            // 短 ID（D47）：docker_attention 已是 shortId，同一字段跨工具宽度要一致
            //（ps 带 --no-trunc，完整 64 位既与 README 的「短 ID」矛盾也多烧 token）
            id: row.shortId,
            name: row.name,
            image: row.image,
            state: row.state,
            status: row.status,
            ...(row.health === null ? {} : { health: row.health }),
            ports: row.ports.map((p) => (p.hostPort === undefined ? `${String(p.containerPort)}/${p.protocol}` : `${String(p.hostPort)}→${String(p.containerPort)}/${p.protocol}`)).join(','),
            ...(row.composeProject === null ? {} : { composeProject: row.composeProject }),
            ...(row.composeService === null ? {} : { composeService: row.composeService }),
          })
          if (isAll || (input.target === undefined && targetsNow().length > 1)) {
            const names = targetsFor('*')
            const collected = await aggregateAcrossTargets(names, (targetApi) => targetApi.listContainers(input.all === true))
            return {
              groups: collected.map((group) => ({
                target: group.target,
                label: group.label,
                ok: group.ok,
                ...(group.error === undefined ? {} : { error: group.error }),
                ...(group.data === undefined ? {} : { containers: group.data.map(toRow) }),
              })),
            }
          }
          const picked = pickTarget(input.target)
          if (picked.name === undefined) throw new Error(picked.error ?? '无效的 target')
          const { api } = apiFor(picked.name)
          if (api === undefined) throw new Error(resolveByName(picked.name).error ?? '无法构造执行通道')
          const containers = await api.listContainers(input.all === true)
          return { target: picked.name, containers: containers.map(toRow) }
        },
      }))

      add('docker_attention', defineTool({
        name: 'docker_attention',
        description: '列出「需要关注」的容器：不健康（unhealthy）/ 反复重启 / 被 OOM 杀 / 非零退出 / 僵死。target 传 `*` 时**跨所有目标聚合**（单目标不可达不影响其他目标）。排障入口：不确定从哪台机器看起时先调它。',
        parameters: {
          target: { type: 'string', description: '目标名；传 `*` 表示全部目标（docker_targets 列出）' },
          limit: { type: 'number', description: '每个目标最多返回多少条（1~500，默认 100）' },
        },
        output: {
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              target: { type: 'string' },
              total: { type: 'number' },
              truncated: { type: 'boolean' },
              degraded: { type: 'boolean' },
              items: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    id: { type: 'string', required: true },
                    name: { type: 'string', required: true },
                    image: { type: 'string', required: true },
                    state: { type: 'string', required: true },
                    health: { type: 'string' },
                    reasons: { type: 'array', required: true, items: { type: 'string' } },
                    exitCode: { type: 'number' },
                    oomKilled: { type: 'boolean' },
                    restartCount: { type: 'number' },
                  },
                },
              },
              groups: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    target: { type: 'string', required: true },
                    label: { type: 'string', required: true },
                    ok: { type: 'boolean', required: true },
                    error: { type: 'string' },
                    total: { type: 'number' },
                    truncated: { type: 'boolean' },
                    degraded: { type: 'boolean' },
                    items: {
                      type: 'array',
                      items: {
                        type: 'object',
                        additionalProperties: false,
                        properties: {
                          id: { type: 'string', required: true },
                          name: { type: 'string', required: true },
                          image: { type: 'string', required: true },
                          state: { type: 'string', required: true },
                          health: { type: 'string' },
                          reasons: { type: 'array', required: true, items: { type: 'string' } },
                          exitCode: { type: 'number' },
                          oomKilled: { type: 'boolean' },
                          restartCount: { type: 'number' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          render: (_args: unknown, value: unknown) => {
            const v = value as {
              target?: string
              items?: ToolAttentionRow[]
              total?: number
              truncated?: boolean
              degraded?: boolean
              groups?: Array<{ target: string; label: string; ok: boolean; error?: string; items?: ToolAttentionRow[]; total?: number; truncated?: boolean; degraded?: boolean }>
            }
            if (Array.isArray(v.groups)) return [{ type: 'text', text: renderAttention(v.groups) }]
            /*
             * 单目标分支也要把 total / truncated / degraded 带上（D100）：renderAttention 的
             * 「实际共 N 条、已截断」与「inspect 降级」两段提示读的就是这三个字段，漏传时
             * 最常用的单目标调用仍然静默截断 —— D12/D42 想消除的假阴性就还在。
             */
            return [{
              type: 'text',
              text: renderAttention([{
                target: v.target ?? '?',
                label: v.target ?? '?',
                ok: true,
                items: v.items ?? [],
                ...(v.total === undefined ? {} : { total: v.total }),
                ...(v.truncated === true ? { truncated: true } : {}),
                ...(v.degraded === true ? { degraded: true } : {}),
              }]),
            }]
          },
        },
        async execute(args: unknown): Promise<{
          target?: string
          total?: number
          truncated?: boolean
          degraded?: boolean
          items?: ToolAttentionRow[]
          groups?: Array<{ target: string; label: string; ok: boolean; error?: string; total?: number; truncated?: boolean; degraded?: boolean; items?: ToolAttentionRow[] }>
        }> {
          const input = (args ?? {}) as { target?: unknown; limit?: unknown }
          const limit = typeof input.limit === 'number' && Number.isInteger(input.limit) ? input.limit : undefined
          const toRow = (item: AttentionItem): ToolAttentionRow => ({
            id: item.shortId,
            name: item.name,
            image: item.image,
            state: item.state,
            ...(item.health === null ? {} : { health: item.health }),
            reasons: item.reasons,
            ...(item.exitCode === null ? {} : { exitCode: item.exitCode }),
            oomKilled: item.oomKilled,
            ...(item.restartCount === null ? {} : { restartCount: item.restartCount }),
          })
          const isAll = typeof input.target === 'string' && input.target.trim() === '*'
          if (isAll || (input.target === undefined && targetsNow().length > 1)) {
            const names = targetsFor('*')
            const collected = await aggregateAcrossTargets(names, (targetApi) => targetApi.attention(limit === undefined ? undefined : { limit }))
            return {
              groups: collected.map((group) => ({
                target: group.target,
                label: group.label,
                ok: group.ok,
                ...(group.error === undefined ? {} : { error: group.error }),
                ...(group.data === undefined ? {} : {
                  items: group.data.items.map(toRow),
                  total: group.data.total,
                  ...(group.data.truncated ? { truncated: true } : {}),
                  ...(group.data.degraded ? { degraded: true } : {}),
                }),
              })),
            }
          }
          const picked = pickTarget(input.target)
          if (picked.name === undefined) throw new Error(picked.error ?? '无效的 target')
          const { api } = apiFor(picked.name)
          if (api === undefined) throw new Error(resolveByName(picked.name).error ?? '无法构造执行通道')
          const attention = await api.attention(limit === undefined ? undefined : { limit })
          return {
            target: picked.name,
            items: attention.items.map(toRow),
            total: attention.total,
            ...(attention.truncated ? { truncated: true } : {}),
            ...(attention.degraded ? { degraded: true } : {}),
          }
        },
      }))

      add('docker_inspect', defineTool({
        name: 'docker_inspect',
        description: '读取某个容器的权威详情（docker inspect）：状态/健康检查/退出码/重启次数/端口映射/挂载/网络/启动命令。',
        parameters: { target: targetParam, id: { type: 'string', required: true, description: '容器名或 ID（来自 docker_ps）' } },
        output: {
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              target: { type: 'string', required: true },
              detail: { type: 'string', required: true },
            },
          },
          render: (_args: unknown, value: unknown) => {
            const v = value as { detail?: string }
            return [{ type: 'text', text: v.detail ?? '' }]
          },
        },
        async execute(args: unknown): Promise<{ target: string; detail: string }> {
          const input = (args ?? {}) as { target?: unknown; id?: unknown }
          const picked = pickTarget(input.target)
          if (picked.name === undefined) throw new Error(picked.error ?? '无效的 target')
          if (typeof input.id !== 'string') throw new Error('id 必填')
          const { api } = apiFor(picked.name)
          if (api === undefined) throw new Error(resolveByName(picked.name).error ?? '无法构造执行通道')
          const details = await api.inspect([input.id])
          const detail = details[0]
          if (detail === undefined) throw new Error(`容器不存在：${input.id}`)
          return { target: picked.name, detail: renderDetail(detail) }
        },
      }))

      add('docker_logs', defineTool({
        name: 'docker_logs',
        description: '读取某个容器的日志尾部（docker logs --tail）。默认行数取插件配置 logTailDefault（出厂 200）、不带时间戳；可加 timestamps / since。日志可能很大，优先用 tail 而不是全量。',
        parameters: {
          target: targetParam,
          id: { type: 'string', required: true, description: '容器名或 ID' },
          tail: { type: 'number', description: '尾部行数（1~5000，默认取配置 logTailDefault；越界值会被静默夹紧到边界）' },
          timestamps: { type: 'boolean', description: 'true 时每行带时间戳' },
          since: { type: 'string', description: '起始时间（docker --since 语法，如 10m、2026-09-09T10:00:00）' },
        },
        output: {
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              target: { type: 'string', required: true },
              id: { type: 'string', required: true },
              text: { type: 'string', required: true },
              truncated: { type: 'boolean' },
            },
          },
          render: (_args: unknown, value: unknown) => {
            const v = value as { target?: string; id?: string; text?: string; truncated?: boolean }
            const head = `容器 ${v.id ?? '?'}（目标 ${v.target ?? '?'}）日志${v.truncated === true ? '（输出已截断）' : ''}：\n\n`
            return [{ type: 'text', text: head + (v.text === undefined || v.text === '' ? '(无日志)' : v.text) }]
          },
        },
        async execute(args: unknown): Promise<ToolLogRow> {
          const input = (args ?? {}) as { target?: unknown; id?: unknown; tail?: unknown; timestamps?: unknown; since?: unknown }
          const picked = pickTarget(input.target)
          if (picked.name === undefined) throw new Error(picked.error ?? '无效的 target')
          if (typeof input.id !== 'string') throw new Error('id 必填')
          const { api } = apiFor(picked.name)
          if (api === undefined) throw new Error(resolveByName(picked.name).error ?? '无法构造执行通道')
          const result = await api.logs(input.id, {
            tail: typeof input.tail === 'number' && Number.isInteger(input.tail) ? input.tail : live.logTailDefault,
            timestamps: input.timestamps === true,
            // since 统一口径（D45）：与 docker_events 同一个 assertSince——此前 logs
            // 完全不校验，docker 的参数错误会变成一句不可读的报错。空/纯空白按「未传」处理（D98）：
            // 否则模型传个空串会拿到「since 必填」这种与事实相反的提示。
            ...(typeof input.since === 'string' && input.since.trim() !== '' ? { since: assertSince(input.since) } : {}),
          })
          return { target: picked.name, id: result.id, text: result.text, truncated: result.truncated }
        },
      }))

      add('docker_stats', defineTool({
        name: 'docker_stats',
        description: '读取容器实时资源占用（docker stats --no-stream）：CPU%、内存用量/上限、网络与磁盘 IO、PIDs。不传 ids 时返回该目标上全部运行中容器。',
        parameters: {
          target: targetParam,
          ids: { type: 'string', description: '容器名/ID，逗号分隔（省略 = 全部运行中）' },
        },
        output: {
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              target: { type: 'string', required: true },
              stats: {
                type: 'array',
                required: true,
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    id: { type: 'string', required: true },
                    name: { type: 'string', required: true },
                    cpuPercent: { type: 'number' },
                    memUsage: { type: 'string', required: true },
                    memPercent: { type: 'number' },
                    netIO: { type: 'string', required: true },
                    blockIO: { type: 'string', required: true },
                    pids: { type: 'number' },
                  },
                },
              },
            },
          },
          render: (_args: unknown, value: unknown) => {
            const v = value as { target?: string; stats?: ToolStatRow[] }
            return [{ type: 'text', text: renderStats(v.target ?? '?', v.stats ?? []) }]
          },
        },
        async execute(args: unknown): Promise<{ target: string; stats: ToolStatRow[] }> {
          const input = (args ?? {}) as { target?: unknown; ids?: unknown }
          const picked = pickTarget(input.target)
          if (picked.name === undefined) throw new Error(picked.error ?? '无效的 target')
          const ids = typeof input.ids === 'string'
            ? input.ids.split(',').map((id) => id.trim()).filter((id) => id !== '')
            : []
          // 传了 ids 但解析为空（空串 / 纯空白 / 全是逗号）必须报错（D52）：静默变成
          // 「全部容器」会让模型把别的容器数据当成目标容器的
          if (typeof input.ids === 'string' && input.ids.trim() !== '' && ids.length === 0) {
            throw new Error('ids 只包含空白：请传容器名/ID（逗号分隔），或干脆省略 ids 表示全部运行中容器')
          }
          const { api } = apiFor(picked.name)
          if (api === undefined) throw new Error(resolveByName(picked.name).error ?? '无法构造执行通道')
          const stats = await api.stats(ids)
          return {
            target: picked.name,
            stats: stats.map((row) => ({
              id: row.id,
              name: row.name,
              ...(row.cpuPercent === null ? {} : { cpuPercent: row.cpuPercent }),
              memUsage: row.memUsage,
              ...(row.memPercent === null ? {} : { memPercent: row.memPercent }),
              netIO: row.netIO,
              blockIO: row.blockIO,
              ...(row.pids === null ? {} : { pids: row.pids }),
            })),
          }
        },
      }))

      add('docker_events', defineTool({
        name: 'docker_events',
        description: '读取某个目标最近的容器事件（docker events 快照）：start / die / stop / kill / oom / health_status / destroy / rename / update 九类，已过滤掉 exec_* 等噪音。默认看最近 10m。要持续观察请让用户打开面板容器列表的「活动」条。',
        parameters: {
          target: targetParam,
          since: { type: 'string', description: '起始时间（docker --since 语法，如 30m、2h；默认 10m）' },
        },
        output: {
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              target: { type: 'string', required: true },
              since: { type: 'string', required: true },
              events: {
                type: 'array',
                required: true,
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    action: { type: 'string', required: true },
                    name: { type: 'string', required: true },
                    image: { type: 'string', required: true },
                    composeProject: { type: 'string' },
                    time: { type: 'number' },
                    exitCode: { type: 'number' },
                  },
                },
              },
            },
          },
          render: (_args: unknown, value: unknown) => {
            const v = value as { target?: string; since?: string; events?: ToolEventRow[] }
            return [{ type: 'text', text: renderEvents(v.target ?? '?', v.since ?? '10m', v.events ?? []) }]
          },
        },
        async execute(args: unknown): Promise<{ target: string; since: string; events: ToolEventRow[] }> {
          const input = (args ?? {}) as { target?: unknown; since?: unknown }
          const picked = pickTarget(input.target)
          if (picked.name === undefined) throw new Error(picked.error ?? '无效的 target')
          // since 统一口径（D45）：assertSince 接受复合 duration（1h30m）——旧白名单
          // 会拒掉 docker 明明支持的写法
          const since = assertSince(typeof input.since === 'string' && input.since.trim() !== '' ? input.since : '10m')
          const { api } = apiFor(picked.name)
          if (api === undefined) throw new Error(resolveByName(picked.name).error ?? '无法构造执行通道')
          const rows = await api.events(since)
          return {
            target: picked.name,
            since,
            events: rows.map((row) => ({
              action: row.action,
              name: row.name,
              image: row.image,
              ...(row.composeProject === null ? {} : { composeProject: row.composeProject }),
              ...(row.time === null ? {} : { time: row.time }),
              ...(row.exitCode === null ? {} : { exitCode: row.exitCode }),
            })),
          }
        },
      }))

      add('docker_images', defineTool({
        name: 'docker_images',
        description: '列出某个目标上的镜像（仓库:标签、大小、创建时间、短 ID）。',
        parameters: { target: targetParam },
        output: {
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              target: { type: 'string', required: true },
              images: {
                type: 'array',
                required: true,
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    reference: { type: 'string', required: true },
                    sizeText: { type: 'string', required: true },
                    createdSince: { type: 'string' },
                    id: { type: 'string', required: true },
                  },
                },
              },
            },
          },
          render: (_args: unknown, value: unknown) => {
            const v = value as { target?: string; images?: ToolImageRow[] }
            return [{ type: 'text', text: renderImages(v.target ?? '?', v.images ?? []) }]
          },
        },
        async execute(args: unknown): Promise<{ target: string; images: ToolImageRow[] }> {
          const input = (args ?? {}) as { target?: unknown }
          const picked = pickTarget(input.target)
          if (picked.name === undefined) throw new Error(picked.error ?? '无效的 target')
          const { api } = apiFor(picked.name)
          if (api === undefined) throw new Error(resolveByName(picked.name).error ?? '无法构造执行通道')
          const images = await api.images()
          return {
            target: picked.name,
            images: images.map((row) => ({
              reference: row.reference,
              sizeText: row.sizeText,
              ...(row.createdSince === '' ? {} : { createdSince: row.createdSince }),
              id: row.shortId,
            })),
          }
        },
      }))

      add('docker_image_inspect', defineTool({
        name: 'docker_image_inspect',
        description: '读取某个镜像的详情（docker image inspect）与构建历史（docker history）：大小 / 创建时间 / 平台 / 层数与层列表 / 入口与命令 / 暴露端口 / digest / 每步构建命令与大小。',
        parameters: {
          target: targetParam,
          ref: { type: 'string', required: true, description: '镜像引用：repository:tag、镜像 ID（sha256:…）或 digest' },
        },
        output: {
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              target: { type: 'string', required: true },
              ref: { type: 'string', required: true },
              detail: { type: 'string', required: true },
            },
          },
          render: (_args: unknown, value: unknown) => {
            const v = value as { detail?: string }
            return [{ type: 'text', text: v.detail ?? '' }]
          },
        },
        async execute(args: unknown): Promise<ToolImageDetailRow> {
          const input = (args ?? {}) as { target?: unknown; ref?: unknown }
          const picked = pickTarget(input.target)
          if (picked.name === undefined) throw new Error(picked.error ?? '无效的 target')
          if (typeof input.ref !== 'string' || input.ref.trim() === '') throw new Error('ref 必填')
          const { api } = apiFor(picked.name)
          if (api === undefined) throw new Error(resolveByName(picked.name).error ?? '无法构造执行通道')
          const image = await api.imageInspect(input.ref)
          return { target: picked.name, ref: image.ref, detail: renderImageDetail(image) }
        },
      }))

      add('docker_networks', defineTool({
        name: 'docker_networks',
        description: '列出某个目标上的 docker 网络（名称 / 驱动 / 范围 / 是否 internal / 短 ID）。接入的容器列表要进详情页看，不在列表里逐条 inspect。',
        parameters: { target: targetParam },
        output: {
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              target: { type: 'string', required: true },
              networks: {
                type: 'array',
                required: true,
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    name: { type: 'string', required: true },
                    driver: { type: 'string', required: true },
                    scope: { type: 'string', required: true },
                    internal: { type: 'boolean' },
                    id: { type: 'string', required: true },
                  },
                },
              },
            },
          },
          render: (_args: unknown, value: unknown) => {
            const v = value as { target?: string; networks?: ToolNetworkRow[] }
            return [{ type: 'text', text: renderNetworks(v.target ?? '?', v.networks ?? []) }]
          },
        },
        async execute(args: unknown): Promise<{ target: string; networks: ToolNetworkRow[] }> {
          const input = (args ?? {}) as { target?: unknown }
          const picked = pickTarget(input.target)
          if (picked.name === undefined) throw new Error(picked.error ?? '无效的 target')
          const { api } = apiFor(picked.name)
          if (api === undefined) throw new Error(resolveByName(picked.name).error ?? '无法构造执行通道')
          const rows = await api.networks()
          return {
            target: picked.name,
            networks: rows.map((row) => ({
              name: row.name,
              driver: row.driver,
              scope: row.scope,
              ...(row.internal ? { internal: true } : {}),
              id: row.shortId,
            })),
          }
        },
      }))

      add('docker_volumes', defineTool({
        name: 'docker_volumes',
        description: '列出某个目标上的 docker 卷（名称 / 驱动 / 范围 / 挂载点）。',
        parameters: { target: targetParam },
        output: {
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              target: { type: 'string', required: true },
              volumes: {
                type: 'array',
                required: true,
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    name: { type: 'string', required: true },
                    driver: { type: 'string', required: true },
                    scope: { type: 'string', required: true },
                    mountpoint: { type: 'string' },
                  },
                },
              },
            },
          },
          render: (_args: unknown, value: unknown) => {
            const v = value as { target?: string; volumes?: ToolVolumeRow[] }
            return [{ type: 'text', text: renderVolumes(v.target ?? '?', v.volumes ?? []) }]
          },
        },
        async execute(args: unknown): Promise<{ target: string; volumes: ToolVolumeRow[] }> {
          const input = (args ?? {}) as { target?: unknown }
          const picked = pickTarget(input.target)
          if (picked.name === undefined) throw new Error(picked.error ?? '无效的 target')
          const { api } = apiFor(picked.name)
          if (api === undefined) throw new Error(resolveByName(picked.name).error ?? '无法构造执行通道')
          const rows = await api.volumes()
          return {
            target: picked.name,
            volumes: rows.map((row) => ({
              name: row.name,
              driver: row.driver,
              scope: row.scope,
              ...(row.mountpoint === '' ? {} : { mountpoint: row.mountpoint }),
            })),
          }
        },
      }))

      if (live.allowMutations) {
        add('docker_action', defineTool({
          name: 'docker_action',
          description: '对容器执行生命周期操作：start / stop / restart / remove。**破坏性**：remove 会删除容器（数据卷不在其中，但容器配置与可写层丢失），执行前必须向用户确认目标容器。仅当用户在设置里打开「允许变更操作」时可用。',
          parameters: {
            target: targetParam,
            // enum 把「四选一」前移到派发前（D51 残留）：实测 dsh-tools 的参数 DSL 支持 enum
            // （不支持的是 minimum/maximum），此前只在执行期拒绝，模型会先浪费一次往返
            action: { type: 'string', enum: ['start', 'stop', 'restart', 'remove'], required: true, description: 'start | stop | restart | remove（四选一）' },
            id: { type: 'string', required: true, description: '容器名或 ID' },
          },
          output: {
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                target: { type: 'string', required: true },
                id: { type: 'string', required: true },
                action: { type: 'string', required: true },
                message: { type: 'string', required: true },
              },
            },
            render: (_args: unknown, value: unknown) => {
              const v = value as { id?: string; action?: string; message?: string; target?: string }
              return [{ type: 'text', text: `${v.action ?? '?'} ${v.id ?? '?'}（目标 ${v.target ?? '?'}）：${v.message ?? 'ok'}` }]
            },
          },
          async execute(args: unknown): Promise<{ target: string; id: string; action: string; message: string }> {
            if (!live.allowMutations) throw new Error('变更操作未启用（插件配置 → Docker 容器面板 → 允许变更操作）')
            const input = (args ?? {}) as { target?: unknown; action?: unknown; id?: unknown }
            const picked = pickTarget(input.target)
            if (picked.name === undefined) throw new Error(picked.error ?? '无效的 target')
            if (typeof input.id !== 'string') throw new Error('id 必填')
            const action = input.action
            if (action !== 'start' && action !== 'stop' && action !== 'restart' && action !== 'remove') {
              throw new Error('action 必须是 start / stop / restart / remove')
            }
            const { api } = apiFor(picked.name)
            if (api === undefined) throw new Error(resolveByName(picked.name).error ?? '无法构造执行通道')
            const result = await api.action({ action, id: input.id })
            return { target: picked.name, id: result.id, action: result.action, message: result.message }
          },
        }))

        add('docker_image_remove', defineTool({
          name: 'docker_image_remove',
          description: '删除一个镜像（docker image rm，不带 -f）。**破坏性**：镜像被容器或子镜像引用时会失败；执行前须向用户确认目标镜像，并复述后果（需要重新拉取或构建才能恢复）。仅当用户在设置里打开「允许变更操作」时可用。',
          parameters: {
            target: targetParam,
            ref: { type: 'string', required: true, description: '镜像引用：repository:tag 或镜像 ID（sha256:…）' },
          },
          output: {
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                target: { type: 'string', required: true },
                ref: { type: 'string', required: true },
                message: { type: 'string', required: true },
              },
            },
            render: (_args: unknown, value: unknown) => {
              const v = value as { ref?: string; message?: string; target?: string }
              return [{ type: 'text', text: '已删除镜像 ' + String(v.ref ?? '?') + '（目标 ' + String(v.target ?? '?') + '）：' + String(v.message ?? 'ok') }]
            },
          },
          async execute(args: unknown): Promise<{ target: string; ref: string; message: string }> {
            if (!live.allowMutations) throw new Error('变更操作未启用（插件配置 → Docker 容器面板 → 允许变更操作）')
            const input = (args ?? {}) as { target?: unknown; ref?: unknown }
            const picked = pickTarget(input.target)
            if (picked.name === undefined) throw new Error(picked.error ?? '无效的 target')
            if (typeof input.ref !== 'string' || input.ref.trim() === '') throw new Error('ref 必填')
            const { api } = apiFor(picked.name)
            if (api === undefined) throw new Error(resolveByName(picked.name).error ?? '无法构造执行通道')
            const result = await api.imageRemove(input.ref)
            return { target: picked.name, ref: result.ref, message: result.message }
          },
        }))

        add('docker_image_prune', defineTool({
          name: 'docker_image_prune',
          description: '清理 dangling（无标签 <none>:<none>）镜像（docker image prune -f）。只删无标签镜像，不动有 tag 的镜像（刻意不加 --all，避免误删未使用的普通镜像）。返回删除列表与释放的空间。仅当用户在设置里打开「允许变更操作」时可用。',
          parameters: { target: targetParam },
          output: {
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                target: { type: 'string', required: true },
                message: { type: 'string', required: true },
              },
            },
            render: (_args: unknown, value: unknown) => {
              const v = value as { message?: string; target?: string }
              return [{ type: 'text', text: '已清理 dangling 镜像（目标 ' + String(v.target ?? '?') + '）：\n' + String(v.message ?? 'ok') }]
            },
          },
          async execute(args: unknown): Promise<{ target: string; message: string }> {
            if (!live.allowMutations) throw new Error('变更操作未启用（插件配置 → Docker 容器面板 → 允许变更操作）')
            const input = (args ?? {}) as { target?: unknown }
            const picked = pickTarget(input.target)
            if (picked.name === undefined) throw new Error(picked.error ?? '无效的 target')
            const { api } = apiFor(picked.name)
            if (api === undefined) throw new Error(resolveByName(picked.name).error ?? '无法构造执行通道')
            const result = await api.imagePrune()
            return { target: picked.name, message: result.message }
          },
        }))

        add('docker_image_pull', defineTool({
          name: 'docker_image_pull',
          description: '拉取镜像（docker pull），例 nginx:1.27、ghcr.io/org/app:latest。**可能耗时数分钟**（逐层下载）；可用 timeoutSec 调整上限（10~1800 秒，默认 600）。仅当用户在设置里打开「允许变更操作」时可用。交互式观察进度请让用户到面板镜像页的「拉取」里看 SSE 进度流。',
          parameters: {
            target: targetParam,
            ref: { type: 'string', required: true, description: '镜像引用：repository:tag 或 digest' },
            timeoutSec: { type: 'number', description: '超时秒数（10~1800，默认 600；越界值会被静默夹紧）' },
          },
          output: {
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                target: { type: 'string', required: true },
                ref: { type: 'string', required: true },
                code: { type: 'number' },
                text: { type: 'string', required: true },
                truncated: { type: 'boolean' },
              },
            },
            render: (_args: unknown, value: unknown) => {
              const v = value as { ref?: string; code?: number; text?: string; truncated?: boolean; target?: string }
              const head = '拉取 ' + String(v.ref ?? '?') + '（目标 ' + String(v.target ?? '?') + '）退出码 ' + String(v.code ?? '?') + (v.truncated === true ? ' · 输出已截断' : '') + '：\n\n'
              return [{ type: 'text', text: head + ((v.text ?? '') === '' ? '(无输出)' : (v.text ?? '')) }]
            },
          },
          async execute(args: unknown): Promise<ToolImagePullRow> {
            if (!live.allowMutations) throw new Error('变更操作未启用（插件配置 → Docker 容器面板 → 允许变更操作）')
            const input = (args ?? {}) as { target?: unknown; ref?: unknown; timeoutSec?: unknown }
            const picked = pickTarget(input.target)
            if (picked.name === undefined) throw new Error(picked.error ?? '无效的 target')
            if (typeof input.ref !== 'string' || input.ref.trim() === '') throw new Error('ref 必填')
            const { api } = apiFor(picked.name)
            if (api === undefined) throw new Error(resolveByName(picked.name).error ?? '无法构造执行通道')
            const timeoutSec = typeof input.timeoutSec === 'number' && Number.isInteger(input.timeoutSec) ? input.timeoutSec : 600
            const result = await api.pull(input.ref, timeoutSec * 1000)
            return {
              target: picked.name,
              ref: result.ref,
              ...(result.code === null ? {} : { code: result.code }),
              text: result.text,
              ...(result.truncated ? { truncated: true } : {}),
            }
          },
        }))
      }

      if (live.allowExec) {
        add('docker_exec', defineTool({
          name: 'docker_exec',
          description: '在容器内执行一条一次性命令（docker exec，无 TTY）：如 `ls -la /app`、`cat /etc/nginx/nginx.conf`、`env`。仅当用户在设置里打开「允许 exec」时可用；不要在容器里做破坏性操作，交互式排障请让用户到终端面板执行 `docker exec -it <容器> sh`。',
          parameters: {
            target: targetParam,
            id: { type: 'string', required: true, description: '容器名或 ID' },
            command: { type: 'string', required: true, description: '要执行的命令（经容器内 sh -c 执行）' },
            timeoutSec: { type: 'number', description: '超时秒数（1~120，默认取插件配置 execTimeoutSec；越界值会被静默夹紧）' },
          },
          output: {
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                target: { type: 'string', required: true },
                id: { type: 'string', required: true },
                code: { type: 'number' },
                stdout: { type: 'string', required: true },
                stderr: { type: 'string', required: true },
                truncated: { type: 'boolean' },
              },
            },
            render: (_args: unknown, value: unknown) => {
              const v = value as { id?: string; code?: number; stdout?: string; stderr?: string; truncated?: boolean }
              const parts = [`容器 ${v.id ?? '?'} 退出码 ${v.code === undefined ? '?' : String(v.code)}`]
              if ((v.stdout ?? '') !== '') parts.push('stdout:\n' + (v.stdout ?? ''))
              if ((v.stderr ?? '') !== '') parts.push('stderr:\n' + (v.stderr ?? ''))
              if (v.truncated === true) parts.push('（输出已截断）')
              return [{ type: 'text', text: parts.join('\n\n') }]
            },
          },
          async execute(args: unknown): Promise<ToolExecRow> {
            if (!live.allowExec) throw new Error('exec 未启用（插件配置 → Docker 容器面板 → 允许 exec）')
            const input = (args ?? {}) as { target?: unknown; id?: unknown; command?: unknown; timeoutSec?: unknown }
            const picked = pickTarget(input.target)
            if (picked.name === undefined) throw new Error(picked.error ?? '无效的 target')
            if (typeof input.id !== 'string') throw new Error('id 必填')
            if (typeof input.command !== 'string' || input.command.trim() === '') throw new Error('command 必填')
            const timeoutSec = typeof input.timeoutSec === 'number' && Number.isInteger(input.timeoutSec) ? input.timeoutSec : live.execTimeoutSec
            const { api } = apiFor(picked.name)
            if (api === undefined) throw new Error(resolveByName(picked.name).error ?? '无法构造执行通道')
            const result = await api.exec(input.id, input.command, timeoutSec * 1000)
            return {
              target: picked.name,
              id: result.id,
              ...(result.code === null ? {} : { code: result.code }),
              stdout: result.stdout,
              stderr: result.stderr,
              truncated: result.truncated,
            }
          },
        }))
      }
      if (failures.length > 0) {
        console.warn(`[dsh-docker] ${String(failures.length)} 个 agent 工具注册失败（下次配置变更会重试）：${failures.join('；')}`)
      }
    }

    // tools 服务（可选）：拿到后注册一次，能力开关变化时 refreshTools 重注册
    /*
     * 官方凭据层（可选，`@deepseek-ai/dsh-credentials` 提供的 `ctx.credentials`）。
     *
     * 配置里的 `env:NAME` 是一个**引用**（这正是官方的模式：配置只持引用，值归 provider），
     * 而 provider 会叠 `file`（`$DSH_HOME/.credentials.yaml`）/ `env` / `project-env` /
     * `user-env` 各层，并保证「每次操作重新解析」——改完下一个操作即生效，不必重启宿主。
     * 我们从前直接读 `process.env`，等于只认其中一层，而且拿的是进程启动时的快照。
     *
     * 服务缺失（老宿主 / 未装该 bundle）时不注册，`resolveSecret` 自己退回 `process.env`，
     * 行为与从前一致——所以这是**可选**依赖，不抬高 engines 下限。
     */
    ctx.inject(['credentials'], (credCtx: Context) => {
      setCredentialResolver((credCtx as unknown as { credentials?: CredentialResolver }).credentials ?? null)
      return () => { setCredentialResolver(null) }
    })

    ctx.inject(['tools'], (toolsCtx: Context) => {
      toolsCtx.effect(() => {
        toolsApi = (toolsCtx as unknown as { tools: ToolsLike }).tools
        refreshTools()
        console.log('[dsh-docker] agent tools ' + (live.enabled ? 'registered (' + registeredNames.join(', ') + ')' : 'skipped (disabled)'))
        return () => {
          toolsApi = undefined
          for (const dispose of toolDisposers) {
            try {
              dispose()
            } catch {
              /* 工具已注销 */
            }
          }
          toolDisposers = []
          registeredNames = []
        }
      }, 'dsh-docker: agent tools')
    })

    /* ---------- 能力公告 ---------- */

    let systemPromptApi: SystemPromptLike | undefined
    let announcementDispose: (() => void) | undefined

    /** 按当前配置重建公告 section（enabled / announceToAgent 热变化时调用；幂等）。 */
    const refreshAnnouncement = (): void => {
      if (announcementDispose !== undefined) {
        try {
          announcementDispose()
        } catch {
          /* 已注销 */
        }
        announcementDispose = undefined
      }
      const systemPrompt = systemPromptApi
      if (systemPrompt === undefined) return
      if (!live.enabled || !live.announceToAgent) return
      announcementDispose = systemPrompt.section({ name: 'plugin:dsh-docker', order: 152, text: DOCKER_GUIDANCE })
    }

    /* ---------- 日志实时流（SSE） ---------- */

    /**
     * GET /logs/stream — 容器日志实时流（`docker logs --follow` → SSE）。
     *
     * 事件协议（每帧 `event:` + 单行 JSON `data:`）：
     *   - `line`  `{"d":"..."}` stdout 分片 / `{"e":"..."}` stderr 分片
     *   - `end`   `{"reason":"container-exit","code":N}` 容器停止、docker logs -f 自然退出
     *   - `error` `{"message":"..."}` 后关闭（参数 / 执行失败）
     * 心跳：每 15s 一帧 `: ping` 注释；客户端断开则静默中止执行器（SIGTERM 阶梯 /
     * channel KILL），不写任何帧。安全语义与快照 /logs 一致：只读能力，不走
     * allowMutations / allowExec 门控；loopback 围栏与容器 ID 白名单在外层校验。
     */
    const serveLogsStream = async (req: ReqLike, res: ResLike, params: URLSearchParams): Promise<void> => {
      const picked = pickTarget(params.get('target'))
      if (picked.name === undefined) {
        writeJson(res, 400, { error: picked.error ?? '无效的 target' })
        return
      }
      const idParam = params.get('id')
      if (idParam === null || idParam.trim() === '') {
        writeJson(res, 400, { error: 'id 必填' })
        return
      }
      let safeId: string
      try {
        safeId = assertRef(idParam, 'container')
      } catch (error) {
        writeJson(res, 400, { error: error instanceof Error ? error.message : String(error) })
        return
      }
      const built = apiFor(picked.name)
      const api = built.api
      if (api === undefined) {
        writeJson(res, 400, { error: built.error ?? '无法构造执行通道' })
        return
      }

      const tailParam = params.get('tail')
      const tail = tailParam === null ? live.logTailDefault : Number(tailParam)
      const timestampsParam = params.get('timestamps')
      const sinceParam = params.get('since')
      // SSE 与快照同一套 since 校验（D45）；非法直接 400（此处不在 POST 的 try 内）
      let since: string | undefined
      if (sinceParam !== null && sinceParam.trim() !== '') {
        try {
          since = assertSince(sinceParam)
        } catch (error) {
          writeJson(res, 400, { error: error instanceof Error ? error.message : String(error) })
          return
        }
      }

      await openSseStream(res, {
        reason: 'container-exit',
        run: async (sendEvent, signal) => {
          // 事件协议与快照 /logs 完全一致，只多一个 end.reason
          const handlers: StreamHandlers = {
            onStdout: (chunk) => sendEvent('line', { d: chunk }),
            onStderr: (chunk) => sendEvent('line', { e: chunk }),
          }
          const result = await api.logsStream(safeId, {
            // 与 POST /logs 同一条取值规则：非法/越界交给 DockerApi 内的夹紧
            tail: Number.isInteger(tail) ? tail : live.logTailDefault,
            timestamps: timestampsParam === '1' || timestampsParam === 'true',
            ...(since !== undefined ? { since } : {}),
          }, handlers, signal)
          return result.code
        },
      })
    }

    /**
     * GET /stats/stream — 容器资源占用实时流（`docker stats` → SSE）。
     *
     * 与日志流的**本质差异**：这条流不会自然结束（容器在跑，docker stats 就每秒
     * 出一行），关闭语义是「浏览器主动断」——EventSource.close() → res close →
     * 静默 abort。docker stats 因全部容器退出而自行退出时，发 `end`
     * （reason=stats-exit）让客户端回到快照轮询。
     *
     * 事件：`stats` 每行一个 ContainerStats JSON；`end` / `error` 同日志流。
     * 只读能力：不受 allowMutations / allowExec 门控。
     */
    const serveStatsStream = async (req: ReqLike, res: ResLike, params: URLSearchParams): Promise<void> => {
      const picked = pickTarget(params.get('target'))
      if (picked.name === undefined) {
        writeJson(res, 400, { error: picked.error ?? '无效的 target' })
        return
      }
      const rawIds = params.get('ids')
      let safeIds: string[]
      try {
        safeIds = (rawIds === null || rawIds.trim() === '' ? [] : rawIds.split(','))
          .map((id) => id.trim())
          .filter((id) => id !== '')
          .map((id) => assertRef(id, 'container'))
      } catch (error) {
        writeJson(res, 400, { error: error instanceof Error ? error.message : String(error) })
        return
      }
      const built = apiFor(picked.name)
      const api = built.api
      if (api === undefined) {
        writeJson(res, 400, { error: built.error ?? '无法构造执行通道' })
        return
      }

      await openSseStream(res, {
        reason: 'stats-exit',
        run: async (sendEvent, signal) => {
          /*
           * docker stats 的输出**不看 stdout 是不是 TTY**——它一律走 TTY 渲染器，
           * 每帧都被 ESC[H / ESC[K / ESC[J 包着，而且同一个采样会重复渲染两次：
           *   \x1b[H{"CPUPerc":"0.04%",...}\n\x1b[H{"CPUPerc":"0.04%",...} \x1b[K\n \x1b[K\n\x1b[J
           * 所以不能按行解析：行首是 ESC 不是 `{`，parseJsonLines 会把整行跳过，
           * 结果就是「流建上了、一个采样都不来」。这里直接抽取扁平的 {...} 对象——
           * docker stats 的 {{json .}} 字段全是标量、没有嵌套括号，抽取是安全的——
           * 再用与 /stats 快照同一个 parseStatsJson 归一，客户端拿到的形状与快照一致。
           * 同一 chunk 内的重复采样（键相同）只发一次，免得环形缓冲被重复点占掉半窗。
           */
          let pending = ''
          /*
           * 跨 chunk 去重：实测 docker stats 会把**同一个采样渲染两次**（约 500ms 一轮，
           * 0.04 / 0.04 / 0.16 / 0.16 …），两次是逐字节相同的 JSON 且可能落在不同 chunk 里。
           * 不去重的话，客户端 60 点环形缓冲会被重复点占掉一半窗口（实际只剩 ~30 秒）。
           * 去重键按**容器**记（D33）：此前只与紧邻上一条比较——单容器序列 A A 能去重，
           * 多容器交错 A B A B 就漏了；按 Name 各记上次值，交错情形同样覆盖。
           */
          const lastRawByName = new Map<string, string>()
          const handlers: StreamHandlers = {
            onStdout: (chunk) => {
              pending += chunk
              const re = /\{[^{}]*\}/g
              const found: string[] = []
              let consumed = 0
              let hit: RegExpExecArray | null
              while ((hit = re.exec(pending)) !== null) {
                found.push(hit[0])
                consumed = hit.index + hit[0].length
              }
              // 只丢已消费的前缀：半截 JSON（未闭合的对象）留给下一个 chunk
              if (consumed > 0) pending = pending.slice(consumed)
              // 对方吐的不是我们认识的输出时别让缓冲无限涨（最多留 4KB 尾巴）
              if (pending.length > 64 * 1024) pending = pending.slice(-4096)
              for (const raw of found) {
                const rows = parseStatsJson(raw)
                if (rows.length === 0) continue
                const key = rows[0]?.name === undefined || rows[0].name === '' ? raw : rows[0].name
                if (lastRawByName.get(key) === raw) continue
                lastRawByName.set(key, raw)
                for (const row of rows) sendEvent('stats', row)
              }
            },
            onStderr: (chunk) => sendEvent('line', { e: chunk }),
          }
          const result = await api.statsStream(safeIds, handlers, signal)
          // 收尾：最后一个对象可能还没闭合（进程退出前只写了半行），能解析就发
          if (pending !== '') for (const row of parseStatsJson(pending)) sendEvent('stats', row)
          return result.code
        },
      })
    }

    /**
     * GET /events/stream — 容器事件活动流（`docker events` → SSE）。
     *
     * 与统计流同构：**不会自然结束**（docker events 会一直跟着 daemon 推），关闭
     * 语义是浏览器主动断；docker events 自己退出时发 `end`（reason=events-exit）。
     *
     * 帧：`event` 一条一个 ContainerEvent（已在服务端过白名单，见 docker.ts 的
     * EVENT_ACTIONS）；`line{e}` 透传 stderr；`end` / `error` 与其它流一致。
     * 只读能力：不受 allowMutations / allowExec 门控。
     */
    const serveEventsStream = async (req: ReqLike, res: ResLike, params: URLSearchParams): Promise<void> => {
      const picked = pickTarget(params.get('target'))
      if (picked.name === undefined) {
        writeJson(res, 400, { error: picked.error ?? '无效的 target' })
        return
      }
      const built = apiFor(picked.name)
      const api = built.api
      if (api === undefined) {
        writeJson(res, 400, { error: built.error ?? '无法构造执行通道' })
        return
      }

      await openSseStream(res, {
        reason: 'events-exit',
        run: async (sendEvent, signal) => {
          /*
           * docker events 与 docker stats 不同：输出是老老实实一行一个 JSON，没有 TTY
           * 渲染器的转义码，所以按行合帧即可（stats 那边才需要抽扁平对象）。这里**不能**
           * 学 stats 做「相同行去重」——两条内容完全一样的 health_status 是两次真实事件，
           * 去重会把活动条吞掉一半。
           */
          let pending = ''
          /** 帧里省略值为 null 的字段（agent 工具那边同样处理），客户端按缺失判断。 */
          const frame = (event: ContainerEvent): Record<string, unknown> => ({
            action: event.action,
            name: event.name,
            image: event.image,
            ...(event.composeProject === null ? {} : { composeProject: event.composeProject }),
            ...(event.time === null ? {} : { time: event.time }),
            ...(event.exitCode === null ? {} : { exitCode: event.exitCode }),
          })
          const handlers: StreamHandlers = {
            onStdout: (chunk) => {
              pending += chunk
              const parts = pending.split('\n')
              pending = parts.pop() ?? ''
              for (const line of parts) {
                const event = parseContainerEvent(line)
                if (event !== null) sendEvent('event', frame(event))
              }
              // 对方吐的不是我们认识的输出时别让缓冲无限涨（最多留 4KB 尾巴）
              if (pending.length > 64 * 1024) pending = pending.slice(-4096)
            },
            onStderr: (chunk) => sendEvent('line', { e: chunk }),
          }
          const result = await api.eventsStream(handlers, signal)
          // 收尾：最后一行可能没换行符（进程退出前只写半行），能解析就发
          if (pending !== '') {
            const tail = parseContainerEvent(pending)
            if (tail !== null) sendEvent('event', frame(tail))
          }
          return result.code
        },
      })
    }

    /**
     * GET /images/pull/stream — 镜像拉取进度流（`docker pull` → SSE）。
     *
     * **变更能力**：拉取会写入目标机的镜像存储、占用磁盘与带宽，因此与
     * /action、/images/remove、/images/prune 同一把 allowMutations 门（未开启
     * 时 403，且不建流）。逐层进度天然是流，直接复用 ssh-exec 的长流通道；
     * 事件与日志流同构（line{d|e} / end{reason:pull-exit,code,ref} / error）。
     */
    const servePullStream = async (req: ReqLike, res: ResLike, params: URLSearchParams): Promise<void> => {
      if (!live.allowMutations) {
        writeJson(res, 403, { error: '变更操作未启用（插件配置 → Docker 容器面板 → 允许变更操作）' })
        return
      }
      const picked = pickTarget(params.get('target'))
      if (picked.name === undefined) {
        writeJson(res, 400, { error: picked.error ?? '无效的 target' })
        return
      }
      const refParam = params.get('ref')
      if (refParam === null || refParam.trim() === '') {
        writeJson(res, 400, { error: 'ref 必填' })
        return
      }
      let safeRef: string
      try {
        safeRef = assertImageRef(refParam, 'image')
      } catch (error) {
        writeJson(res, 400, { error: error instanceof Error ? error.message : String(error) })
        return
      }
      const built = apiFor(picked.name)
      const api = built.api
      if (api === undefined) {
        writeJson(res, 400, { error: built.error ?? '无法构造执行通道' })
        return
      }

      await openSseStream(res, {
        reason: 'pull-exit',
        endData: () => ({ ref: safeRef }),
        run: async (sendEvent, signal) => {
          const handlers: StreamHandlers = {
            onStdout: (chunk) => sendEvent('line', { d: chunk }),
            onStderr: (chunk) => sendEvent('line', { e: chunk }),
          }
          const result = await api.pullStream(safeRef, handlers, signal)
          return result.code
        },
      })
    }

    /* ---------- HTTP 路由（loopback 围栏） ---------- */

    ctx.inject(['webServer'], (webCtx: Context) => {
      webCtx.effect(() => {
        const webServer = (webCtx as unknown as { webServer: WebServerLike }).webServer
        const dispose = webServer.register({
          kind: 'prefix',
          path: ROUTE_PREFIX,
          handler: async (req: ReqLike & AsyncIterable<Uint8Array>, res: ResLike) => {
            const loopback = isLoopbackHttp(req)
            // 字面量环回同步判定（保持「第一拍就建流」的时序）；仅别名主机名才等 DNS
            if (loopback instanceof Promise) {
              if (!(await loopback)) {
                writeJson(res, 403, { error: 'forbidden: loopback-only' })
                return
              }
            } else if (!loopback) {
              writeJson(res, 403, { error: 'forbidden: loopback-only' })
              return
            }
            const sub = new URL(req.url ?? '/', 'http://loopback').pathname.slice(ROUTE_PREFIX.length)

            // 插件禁用时只保留 /config 读写：设置卡片靠它渲染，也是重新启用插件的唯一
            // UI 入口（不能一并关掉，否则卡片消失就没有恢复路径了）；其余数据路由一律
            // 403——agent 工具已由 refreshTools 同步清空，这里只管 HTTP 半体。
            if (!live.enabled && sub !== '/config') {
              writeJson(res, 403, { error: '插件已禁用（插件配置 → Docker 容器面板 → 启用插件）' })
              return
            }

            if (sub === '/config') {
              if (req.method === 'GET') {
                writeJson(res, 200, { ok: true, config: snapshot() })
                return
              }
              if (req.method !== 'POST') {
                writeJson(res, 405, { error: 'method not allowed: ' + String(req.method) })
                return
              }
              const body = await readJsonBody(req)
              if (body === undefined) {
                writeJson(res, 400, { error: 'invalid JSON body' })
                return
              }
              const patch: Record<string, unknown> = {}
              let warning: string | undefined
              for (const key of Object.keys(body)) {
                if (!KNOWN_CONFIG_KEYS.has(key)) {
                  writeJson(res, 400, { error: '未知配置项: ' + key })
                  return
                }
                if (key === 'clearTargets' || key === 'hostKeysRemove') continue
                patch[key] = body[key]
              }
              // 空 targets 只在显式 clearTargets 时才允许清空：卡片若因启动竞态拿到
              // 空列表，保存不会再把已配置的目标抹掉（防数据丢失）
              if (Array.isArray(patch.targets) && patch.targets.length === 0 && body.clearTargets !== true) {
                const existing = targetsNow()
                if (existing.length > 0) {
                  delete patch.targets
                  warning = `已忽略空的目标列表：当前仍有 ${String(existing.length)} 个目标。请刷新设置卡片后重试（若确实要清空全部目标，请逐个删除后保存）。`
                }
              }
              // 凭证补全必须在写盘之前：否则提交的 targets 会把密码清空
              if (patch.targets !== undefined) {
                // 读路径会丢弃的条目（重名 / 空名 / 超 64 字符）要有信号（D35）：否则
                // 面板只看到留下来的那条，下一次保存把丢弃结果固化，另一台主机凭空消失
                const rawTargets = Array.isArray(patch.targets) ? patch.targets.length : 0
                patch.targets = mergeTargetSecrets(targetsNow(), patch.targets)
                /*
                 * 计数必须取**真正会丢弃**的那一步（D89）：mergeTargetSecrets 是 1:1 的
                 * map（只补凭证、从不删条目），丢弃发生在 sanitizeTargets（读路径与
                 * normalizeConfig 都用它）—— 原来的判据恒为 false，warning 是死代码。
                 */
                const keptTargets = sanitizeTargets(patch.targets)?.length ?? 0
                if (rawTargets > keptTargets) {
                  warning = [warning, `目标列表中有 ${String(rawTargets - keptTargets)} 条无效条目（重名 / 名称为空 / 超过 64 字符）已被丢弃。`].filter((part) => part !== undefined && part !== '').join(' ')
                }
              }
              /*
               * hostKeys 采用「并集合并 + 显式删除」（D10）：客户端表单快照里的
               * hostKeys 落后于运行期（打开卡片期间可能刚记录了新指纹），整表覆盖
               * 会把 TOFU 钉扎回退掉。传上来的记录按 host:port 并入现有记录；
               * 删除某条记录走显式的 hostKeysRemove: [{host, port}]。
               */
              if (patch.hostKeys !== undefined || body.hostKeysRemove !== undefined) {
                let removeRequested = false
                const removeKeys = new Set<string>()
                if (Array.isArray(body.hostKeysRemove)) {
                  for (const raw of body.hostKeysRemove) {
                    if (typeof raw !== 'object' || raw === null) continue
                    const item = raw as Record<string, unknown>
                    const host = typeof item.host === 'string' ? item.host.trim().toLowerCase() : ''
                    const port = typeof item.port === 'number' && Number.isInteger(item.port) ? item.port : 22
                    if (host !== '') removeKeys.add(`${host}:${String(port)}`)
                  }
                  removeRequested = true
                } else if (body.hostKeysRemove !== undefined) {
                  // 形状非法不能静默忽略（D109）：用户点了「删除」却什么都没发生，且没有任何反馈
                  warning = [warning, 'hostKeysRemove 必须是 [{host, port}] 数组，本条已忽略。'].filter((part) => part !== undefined && part !== '').join(' ')
                }
                patch.hostKeys = mergeHostKeys(live.hostKeys, patch.hostKeys ?? [])
                /*
                 * 删除在并集**之后**生效（D109）：同一请求既带 hostKeys 又带 hostKeysRemove 时，
                 * 「删除」必须赢 —— 否则手写请求 / 旧客户端会把刚删掉的指纹又并回来，同样没有提示。
                 */
                if (removeKeys.size > 0) {
                  const merged = patch.hostKeys as HostKeyRecord[]
                  const kept = merged.filter((record) => !removeKeys.has(`${record.host}:${String(record.port)}`))
                  patch.hostKeys = kept
                  if (removeRequested && kept.length === merged.length) {
                    warning = [warning, '要删除的主机指纹记录不存在（可能已被别处删除）。'].filter((part) => part !== undefined && part !== '').join(' ')
                  }
                }
              }
              // 校验必须在**落盘之前**。原先只有 applySection 会做校验，而它跑在
              // scope.update 之后：值不合法的 patch 已经被写进 settings.yaml，随后
              // applySection 抛出，异常穿到宿主 HTTP 层 → 用户收到一个**没有正文的
              // 400**，而配置里已经留下一个非法值；下次启动 normalizeConfig 再抛，
              // 整段 docker 配置（含目标列表）静默退回默认。这里先按同一套合并规则
              // 干跑一遍 normalizeConfig：不合法就地 400 并带上原因，不写盘。
              {
                const dryRun: Record<string, unknown> = { ...live, ...patch }
                if (patch.hostKeys === undefined) dryRun.hostKeys = live.hostKeys
                try {
                  normalizeConfig(dryRun)
                } catch (error) {
                  writeJson(res, 400, { error: '配置无效: ' + (error instanceof Error ? error.message : String(error)) })
                  return
                }
              }
              const scope = settingsScope
              if (scope !== undefined) {
                try {
                  await scope.update(patch)
                } catch (error) {
                  writeJson(res, 400, { error: error instanceof Error ? error.message : String(error) })
                  return
                }
                // volatile 更新事件会触发 applySection；无事件时也应用一次（幂等）
              }
              // applySection 也可能抛（tools.register / systemPrompt.section，D36）：
              // 此时配置已落盘，必须把原因带回给用户，而不是一个空 400/500。
              // forceRefreshTools：保存路径无条件重注册一次（幂等），这样「上一次只注册了
              // 一半」的状态能被用户的**重试**修复，而不是必须等到下一次真实配置变化（D107）。
              try {
                applySection(patch, { forceRefreshTools: true })
              } catch (error) {
                writeJson(res, 500, { error: '配置已保存但应用失败：' + (error instanceof Error ? error.message : String(error)) })
                return
              }
              writeJson(res, 200, { ok: true, config: snapshot(), ...(warning === undefined ? {} : { warning }) })
              return
            }

            if (sub === '/targets') {
              if (req.method !== 'GET' && req.method !== 'POST') {
                writeJson(res, 405, { error: 'method not allowed: ' + String(req.method) })
                return
              }
              const books = readTtyBooks(settingsApi)
              writeJson(res, 200, {
                ok: true,
                targets: targetsNow().map((target) => {
                  const { resolved, error } = resolveTarget(target, books)
                  return {
                    name: target.name,
                    kind: target.kind,
                    ...(resolved === undefined ? { error } : { label: resolved.kind === 'local' ? '本机' : sshTarget(resolved.spec as SshSpec) }),
                  }
                }),
              })
              return
            }

            // SSE 长连接（GET）：必须放在下面「非 POST 一律 405」之前，否则
            // GET 会被 method 检查拦掉。四条流共用 openSseStream，各自只做参数
            // 校验与执行器接线；响应由对应的 serve*Stream 长持有。
            const serveStream = sub === '/logs/stream'
              ? serveLogsStream
              : sub === '/stats/stream'
                ? serveStatsStream
                : sub === '/events/stream'
                  ? serveEventsStream
                  : sub === '/images/pull/stream'
                    ? servePullStream
                    : undefined
            if (serveStream !== undefined) {
              if (req.method !== 'GET') {
                writeJson(res, 405, { error: 'method not allowed: ' + String(req.method) })
                return
              }
              // 四条 SSE 都要有「同源证明」（D32）：无 Origin 且无 Sec-Fetch-Site 的
              // 请求（旧 Safari / 部分 WebView / 裸 curl）在长流端点上拒绝——浏览器
              // 的 EventSource / fetch 同源请求都会带其中之一
              if (!hasSameOriginProof(req)) {
                writeJson(res, 403, { error: '缺少同源证明（需要 Origin 或 Sec-Fetch-Site: same-origin）：实时流端点拒绝无来源请求' })
                return
              }
              const params = new URL(req.url ?? '/', 'http://loopback').searchParams
              await serveStream(req, res, params)
              return
            }

            // 变更类端点（写操作）同样要求同源证明（D32）；/config 刻意不在名单里：
            // 它是禁用状态下的唯一恢复入口，跨站 POST 已由 loopback + Origin 比对拦住
            if (req.method === 'POST' && MUTATION_SUBROUTES.has(sub) && !hasSameOriginProof(req)) {
              writeJson(res, 403, { error: '缺少同源证明（需要 Origin 或 Sec-Fetch-Site: same-origin）：变更端点拒绝无来源请求' })
              return
            }

            if (req.method !== 'POST') {
              writeJson(res, 405, { error: 'method not allowed: ' + String(req.method) })
              return
            }
            const body = await readJsonBody(req)
            if (body === undefined) {
              writeJson(res, 400, { error: 'invalid JSON body' })
              return
            }
            // 跨目标聚合（0.15.0）：target='*' 不是目标名，必须在 pickTarget 之前分流，
            // 否则会被当成「未知目标」直接 400
            const wantsAllTargets = typeof body.target === 'string' && body.target.trim() === '*'
            if (wantsAllTargets && (sub === '/containers' || sub === '/attention')) {
              const names = targetsFor('*')
              try {
                if (sub === '/containers') {
                  const groups = await aggregateAcrossTargets(names, (targetApi) => targetApi.listContainers(body.all === true))
                  writeJson(res, 200, { ok: true, groups })
                  return
                }
                const groups = await aggregateAcrossTargets(names, (targetApi) => targetApi.attention())
                writeJson(res, 200, { ok: true, groups })
              } catch (error) {
                writeJson(res, 500, { error: error instanceof Error ? error.message : String(error) })
              }
              return
            }

            const picked = pickTarget(body.target)
            if (picked.name === undefined) {
              writeJson(res, 400, { error: picked.error ?? '无效的 target' })
              return
            }
            const built = apiFor(picked.name)
            if (built.api === undefined) {
              writeJson(res, 400, { error: built.error ?? '无法构造执行通道' })
              return
            }
            const api = built.api

            // 引用白名单在路由层先跑一次（D37）：非法引用是**客户端**错误，直接 400
            // 带原因——落到 DockerApi 里才抛的话会被外层 catch 统一写成 500。
            // D97：`/action` 的 id、`/stats` 的 ids[] 与 `/exec` 的空 command 原先漏在外，
            // 于是同一类错误在有的路由是 400、有的是 500。
            try {
              if ((sub === '/inspect' || sub === '/logs' || sub === '/exec' || sub === '/action') && typeof body.id === 'string') assertRef(body.id, 'container')
              if (sub === '/stats' && Array.isArray(body.ids)) {
                for (const id of body.ids) if (typeof id === 'string') assertRef(id, 'container')
              }
              if ((sub === '/images/inspect' || sub === '/images/remove') && typeof body.ref === 'string') assertImageRef(body.ref, 'image')
              if ((sub === '/networks/inspect' || sub === '/networks/remove') && typeof body.name === 'string') assertName(body.name, 'network')
              if ((sub === '/volumes/inspect' || sub === '/volumes/remove') && typeof body.name === 'string') assertName(body.name, 'volume')
              if (sub === '/exec' && typeof body.command === 'string' && body.command.trim() === '') {
                writeJson(res, 400, { error: 'command 不能为空' })
                return
              }
            } catch (error) {
              writeJson(res, 400, { error: error instanceof Error ? error.message : String(error) })
              return
            }

            try {
              switch (sub) {
                case '/probe': {
                  writeJson(res, 200, { ok: true, probe: await api.probe() })
                  return
                }
                case '/containers': {
                  writeJson(res, 200, { ok: true, containers: await api.listContainers(body.all === true) })
                  return
                }
                case '/attention': {
                  // limit 可由调用方给（D101）：面板想一次拿全量时不必被隐式钉在默认 100
                  const limitRaw = body.limit
                  const limit = typeof limitRaw === 'number' && Number.isInteger(limitRaw)
                    ? Math.min(Math.max(limitRaw, 1), 500)
                    : undefined
                  const attention = await api.attention(limit === undefined ? undefined : { limit })
                  writeJson(res, 200, { ok: true, items: attention.items, total: attention.total, truncated: attention.truncated, degraded: attention.degraded })
                  return
                }
                case '/inspect': {
                  if (typeof body.id !== 'string') {
                    writeJson(res, 400, { error: 'id 必填' })
                    return
                  }
                  writeJson(res, 200, { ok: true, details: await api.inspect([body.id]) })
                  return
                }
                case '/stats': {
                  const ids = Array.isArray(body.ids) ? body.ids.filter((id): id is string => typeof id === 'string') : []
                  writeJson(res, 200, { ok: true, stats: await api.stats(ids) })
                  return
                }
                case '/logs': {
                  if (typeof body.id !== 'string') {
                    writeJson(res, 400, { error: 'id 必填' })
                    return
                  }
                  const tail = typeof body.tail === 'number' && Number.isInteger(body.tail) ? body.tail : live.logTailDefault
                  writeJson(res, 200, {
                    ok: true,
                    logs: await api.logs(body.id, {
                      tail,
                      timestamps: body.timestamps === true,
                      // `/logs` 此前裸透传（D98）：同一参数在 `/logs/stream` 与 agent 工具上是 400/抛错，
                      // 在快照路由上却变成 docker 的参数错误再被写成 500。空/纯空白 = 未传。
                      ...(typeof body.since === 'string' && body.since.trim() !== '' ? { since: assertSince(body.since) } : {}),
                    }),
                  })
                  return
                }
                case '/images': {
                  writeJson(res, 200, { ok: true, images: await api.images() })
                  return
                }
                case '/images/inspect': {
                  if (typeof body.ref !== 'string' || body.ref.trim() === '') {
                    writeJson(res, 400, { error: 'ref 必填' })
                    return
                  }
                  writeJson(res, 200, { ok: true, image: await api.imageInspect(body.ref) })
                  return
                }
                case '/images/remove': {
                  if (!live.allowMutations) {
                    writeJson(res, 403, { error: '变更操作未启用（插件配置 → Docker 容器面板 → 允许变更操作）' })
                    return
                  }
                  if (typeof body.ref !== 'string' || body.ref.trim() === '') {
                    writeJson(res, 400, { error: 'ref 必填' })
                    return
                  }
                  writeJson(res, 200, { ok: true, result: await api.imageRemove(body.ref) })
                  return
                }
                case '/images/prune': {
                  if (!live.allowMutations) {
                    writeJson(res, 403, { error: '变更操作未启用（插件配置 → Docker 容器面板 → 允许变更操作）' })
                    return
                  }
                  writeJson(res, 200, { ok: true, result: await api.imagePrune() })
                  return
                }
                case '/networks': {
                  writeJson(res, 200, { ok: true, networks: await api.networks() })
                  return
                }
                case '/networks/inspect': {
                  if (typeof body.name !== 'string' || body.name.trim() === '') {
                    writeJson(res, 400, { error: 'name 必填' })
                    return
                  }
                  writeJson(res, 200, { ok: true, network: await api.networkInspect(body.name) })
                  return
                }
                case '/networks/remove': {
                  if (!live.allowMutations) {
                    writeJson(res, 403, { error: '变更操作未启用（插件配置 → Docker 容器面板 → 允许变更操作）' })
                    return
                  }
                  if (typeof body.name !== 'string' || body.name.trim() === '') {
                    writeJson(res, 400, { error: 'name 必填' })
                    return
                  }
                  writeJson(res, 200, { ok: true, result: await api.networkRemove(body.name) })
                  return
                }
                case '/networks/prune': {
                  if (!live.allowMutations) {
                    writeJson(res, 403, { error: '变更操作未启用（插件配置 → Docker 容器面板 → 允许变更操作）' })
                    return
                  }
                  writeJson(res, 200, { ok: true, result: await api.networkPrune() })
                  return
                }
                case '/volumes': {
                  writeJson(res, 200, { ok: true, volumes: await api.volumes() })
                  return
                }
                case '/volumes/inspect': {
                  if (typeof body.name !== 'string' || body.name.trim() === '') {
                    writeJson(res, 400, { error: 'name 必填' })
                    return
                  }
                  writeJson(res, 200, { ok: true, volume: await api.volumeInspect(body.name) })
                  return
                }
                case '/volumes/remove': {
                  if (!live.allowMutations) {
                    writeJson(res, 403, { error: '变更操作未启用（插件配置 → Docker 容器面板 → 允许变更操作）' })
                    return
                  }
                  if (typeof body.name !== 'string' || body.name.trim() === '') {
                    writeJson(res, 400, { error: 'name 必填' })
                    return
                  }
                  writeJson(res, 200, { ok: true, result: await api.volumeRemove(body.name) })
                  return
                }
                case '/volumes/prune': {
                  if (!live.allowMutations) {
                    writeJson(res, 403, { error: '变更操作未启用（插件配置 → Docker 容器面板 → 允许变更操作）' })
                    return
                  }
                  writeJson(res, 200, { ok: true, result: await api.volumePrune() })
                  return
                }
                case '/action': {
                  if (!live.allowMutations) {
                    writeJson(res, 403, { error: '变更操作未启用（插件配置 → Docker 容器面板 → 允许变更操作）' })
                    return
                  }
                  if (typeof body.id !== 'string') {
                    writeJson(res, 400, { error: 'id 必填' })
                    return
                  }
                  const action = body.action
                  if (action !== 'start' && action !== 'stop' && action !== 'restart' && action !== 'remove') {
                    writeJson(res, 400, { error: 'action 必须是 start / stop / restart / remove' })
                    return
                  }
                  writeJson(res, 200, { ok: true, result: await api.action({ action, id: body.id }) })
                  return
                }
                case '/exec': {
                  if (!live.allowExec) {
                    writeJson(res, 403, { error: 'exec 未启用（插件配置 → Docker 容器面板 → 允许 exec）' })
                    return
                  }
                  if (typeof body.id !== 'string' || typeof body.command !== 'string') {
                    writeJson(res, 400, { error: 'id 与 command 必填' })
                    return
                  }
                  const timeoutSec = typeof body.timeoutSec === 'number' && Number.isInteger(body.timeoutSec) ? body.timeoutSec : live.execTimeoutSec
                  writeJson(res, 200, { ok: true, result: await api.exec(body.id, body.command, timeoutSec * 1000) })
                  return
                }
                default: {
                  writeJson(res, 404, { error: 'unknown route: ' + sub })
                }
              }
            } catch (error) {
              writeJson(res, 500, { error: error instanceof Error ? error.message : String(error) })
            }
          },
        })
        return () => dispose()
      }, 'dsh-docker: web routes')
    })

    /* ---------- settings ---------- */

    ctx.inject(['settings'], (settingsCtx: Context) => {
      settingsCtx.effect(() => {
        const scope = settingsEntryScope(settingsCtx, 'docker')
        if (scope === undefined) return () => {}
        // 卡片是自定义页（plugins.row.config），别再让 DSH 为本 entry 自动生成一份。
        const offAutoPage = suppressAutoSettingsPage(settingsCtx, ctx)
        settingsScope = scope
        settingsApi = { get: (ns: string) => readSettingsEntry(settingsCtx, ns) }
        // 立刻读一次 resolved 值（schema 默认值 ← composition base ← 用户层）
        const resolved = scope.get()
        if (typeof resolved === 'object' && resolved !== null) live = normalizeConfig(resolved as Record<string, unknown>)
        const diag = (resolved ?? {}) as Record<string, unknown>
        console.log(`[dsh-docker] settings resolved (keys=${Object.keys(diag).join('|')}, targets=${Array.isArray(diag.targets) ? String(diag.targets.length) : 'not-array'}, hostKeys=${Array.isArray(diag.hostKeys) ? String(diag.hostKeys.length) : 'not-array'})`)
        refreshTools()
        refreshAnnouncement()
        const off = scope.onChanged(() => applySection(scope.get()))
        return () => {
          off()
          offAutoPage()
          settingsScope = undefined
          settingsApi = undefined
        }
      }, 'dsh-docker: settings')
    })

    /* ---------- 能力公告 ---------- */

    ctx.inject(['systemPrompt'], (promptCtx: Context) => {
      promptCtx.effect(() => {
        systemPromptApi = (promptCtx as unknown as { systemPrompt: SystemPromptLike }).systemPrompt
        refreshAnnouncement()
        return () => {
          systemPromptApi = undefined
          if (announcementDispose !== undefined) {
            try {
              announcementDispose()
            } catch {
              /* 已注销 */
            }
            announcementDispose = undefined
          }
        }
      }, 'dsh-docker: announcement')
    })

    /* ---------- 卸载清理 ---------- */

    ctx.effect(() => {
      return () => {
        // 先收掉长流（结束响应 + 中止 docker logs -f），再关连接池
        closeAllStreams()
        remote.disposeAll()
      }
    }, 'dsh-docker: cleanup')

    console.log(`[dsh-docker] mounted (bin=${live.dockerBin}, targets=${String(live.targets.length)}, allowMutations=${String(live.allowMutations)}, allowExec=${String(live.allowExec)})`)
  },
})

export const { name, inject, apply } = plugin

/* ------------------------------------------------------------------ *
 * 供 scripts/smoke.mjs 直接复用的纯函数（解析器回归）
 * ------------------------------------------------------------------ */

export { parsePsJson, parseStatsJson, parseInspectJson, assertBin, assertImageRef, parseImageInspectJson, parseImageHistoryJson, parseImageHistoryText, DockerApi }
export type { Runner } from './docker.js'
