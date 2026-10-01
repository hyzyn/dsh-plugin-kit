/**
 * @hyzyn/dsh-tty — DSH Web GUI 的终端面板插件（宿主半体）。
 *
 * 机制：浏览器半体打开「终端」大弹窗后，经 WebSocket 连接
 * /api/dsh-tty/ws（webServer.registerUpgrade 注册的 upgrade 路由），
 * spawn 帧创建真实 PTY 会话（ctx.subprocess.spawnTerminal，node-pty），
 * 之后双向透传：input/resize/kill 上行，data/exit/error 下行。
 *
 * 帧协议 v3（JSON 文本帧；sid 维度支持单连接多会话/标签页 + 断线重连）：
 *   C→S  {t:'spawn', sid?, cols?, rows?, cwd?, persist?, persistName?}
 *                                              创建本地会话；sid 缺省时宿主生成；
 *                                              persist=true 且配置 persistence=tmux
 *                                              时以 tmux 持久会话托管（0.10.0）
 *   C→S  {t:'ssh', sid?, cols?, rows?, name? | host, username, ...,
 *         persist?, persistName?}              创建 SSH 会话（ssh2 原生，见 ssh.ts）；
 *                                              name 引用连接簿条目，内联字段可覆盖；
 *                                              persist 语义同 spawn（远程 tmux 托管）
 *   C→S  {t:'input', sid?, d}                  按键/粘贴数据
 *   C→S  {t:'resize', sid?, cols, rows}        xterm fit 触发
 *   C→S  {t:'refresh', sid?}                   请宿主 refresh-client 强制 tmux
 *                                              重画（tmux 会话；非 tmux no-op）
 *   C→S  {t:'kill', sid?}                      关闭会话（孤儿会话也可跨连接 kill；
 *                                              tmux 会话先 kill-session 再杀客户端）
 *   C→S  {t:'sessions'}                        列出全局会话（attachable 标记可重连者）
 *   C→S  {t:'attach', sid}                     重连孤儿会话（断线保活窗口内）：
 *                                              ready 后紧跟一帧 data 回放输出缓冲
 *   S→C  {t:'ready', sid, pid, kind, target?, persist?, reattached?}
 *                                              会话就绪（ssh 时 pid=null，target=user@host；
 *                                              persist=true 表示 tmux 持久会话）
 *   S→C  {t:'data', sid, d}                    终端输出（utf8 文本，StringDecoder 兜多字节分帧）
 *   S→C  {t:'exit', sid, code, signal}         PTY 退出事实（恰好一次）
 *   S→C  {t:'error', sid?, m}                  错误
 *   S→C  {t:'sessions', list}                  会话快照（attachable=true 表示前连接已断、可 attach）
 *   C→S  {t:'statsOn'|'statsOff', sid}        订阅/退订该会话的服务器状态条（0.17.0，
 *                                              按标签可见性驱动：首个 statsOn 才启动采集，
 *                                              退订清零即停表并关远端 exec channel）
 *   S→C  {t:'stats', sid, stats}               资源指标帧（0.17.0）：cpuPct/cores/memUsed/
 *                                              memTotal/memPct/diskUsed/diskTotal/diskPct/
 *                                              uptimeSec/tcpConns/rxRate/txRate/tempC；缺失
 *                                              即省略（best-effort），字节类为 bytes、速率为 B/s
 * 省略 sid 时按「该连接唯一会话」路由；连接上存在 0 或多个会话时省略 sid 报错。
 * 旧脚本（spawn 不带 sid）自动兼容：宿主生成 sid，响应帧多带 sid 字段。
 *
 * 断线保活：客户端正常关面板会先逐个 kill 再断开；因此「WS close 且仍有
 * 存活会话」判定为异常断开（刷新/网络抖动），会话转入孤儿状态保活
 * reconnectGraceSec（默认 120s，0 = 旧行为立即结束），等待新连接 attach
 * 并回放 256KB 环形缓冲；到点由回收器清理。
 *
 * shell 集成（src/shell-integration.ts，0.4.0）：spawn 时经 -c 包装层注入
 * OSC 133/7 钩子（zsh ZDOTDIR 桩 / bash --rcfile 桩），输出流解析出命令
 * 边界（tty_capture{last} / tty_expect 早停）与实时 cwd（tty_list）。
 * 辅助路由：/api/dsh-tty/ssh-config（~/.ssh/config 导入候选）、
 * /api/dsh-tty/credential-refs（凭据存储里已知的引用名，SSH 对话框选择器候选，只要名字）、
 * /api/dsh-tty/env-vars（env 插件托管变量名；SSH 对话框已改从连接簿 + 凭据存储取候选，此路由保留兼容）、
 * /api/dsh-tty/shells（设置卡片「Shell 路径」候选，仅路径）、
 * /api/dsh-tty/sftp/*（SFTP 文件传输 0.7.0：list/mkdir/rename/remove/
 * download/upload；0.8.0 起 mkdir 支持 parents 逐级补齐，spec 解析与
 * WS ssh 帧同款，见 src/sftp.ts）。
 *
 * M0 探针（scripts/probe.mjs）验证过的三个关键结论：
 *   1. TERM 必须用 `shell -c 'export TERM=...; exec "$shell"'` 包装层注入——
 *     DSH 的 spawnTerminal 硬编码 node-pty name:"dumb"，且 node-pty 里
 *     name 优先于 env.TERM，直接传 env 覆盖无效；
 *   2. resize 通过 (handle).terminal.resize(cols, rows) 透传 node-pty 原生
 *     API（DSH 的 terminal handle 未暴露 resize，属内部耦合，见 README）；
 *   3. terminate() 偶发「幸存者」竞态（SIGTERM→SIGKILL 升级后仍扫描到存活
 *     子进程），必须 best-effort：失败降级为对顶层 shell 直接 SIGKILL。
 */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { accessSync, constants as fsConstants, existsSync, readFileSync } from 'node:fs'
import { mkdir as fsMkdir, readdir as fsReaddir, rename as fsRename, rm as fsRm, stat as fsStat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { PassThrough } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { StringDecoder } from 'node:string_decoder'
import WebSocket, { WebSocketServer } from 'ws'
// @xterm/headless 是 CJS 包：ESM 具名导入在 Node 运行时会炸（Named export not
// found），必须默认导入后取 Terminal；类型用 InstanceType 别名保持同名可用
import xtermHeadless from '@xterm/headless'
const HeadlessTerminal = xtermHeadless.Terminal
type HeadlessTerminal = InstanceType<typeof HeadlessTerminal>
import { definePlugin, dshHome as resolveDshHome, getService, hasSameOriginProof, isLoopbackRequestStrict, plainConfig, settingsEntryScope, suppressAutoSettingsPage } from '@hyzyn/dsh-kit'
import type { SettingsEntryScope } from '@hyzyn/dsh-kit'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { sanitizeJumpSpec, sanitizeProxyCommand, spawnSsh, sshTarget, expandHome, setCredentialResolver, setProxyCommandPolicy, validateJumpSpec, validateProxyCommand } from './ssh.js'
import {
  sharedGrantStore,
  auditLoadedGrants,
  bindCapabilitySources,
  capabilityDeniedMessage,
  capabilityGrantAt,
  capabilityGrantVia,
  capabilityGranted,
  capabilityPaths,
  createElevationManager,
} from '@hyzyn/dsh-kit'
import type { CredentialResolver, HostKeyRecord, SshHostEntry, SshSpec, TermExit, TermHandle } from './ssh.js'
import { probeSsh } from './probe.js'
import { buildCommandSpawn, buildShellSpawn, commandShellHint, defaultShellPath } from './shell-integration.js'
import { KEY_VOCABULARY, resolveKeys } from './keys.js'
import { parseSshConfigDetailed } from './ssh-config.js'
import { parseKnownHostsDetailed } from './known-hosts.js'
import { TunnelManager } from './tunnels.js'
import type { TunnelSpec } from './tunnels.js'
import { SftpManager } from './sftp.js'
import { buildTmuxSpawnPlan, ensureTmuxAssets, killTmuxSession, listTmuxSessions, probeTmux, refreshTmuxClient, sanitizePersistName } from './tmux.js'
import { buildRemoteStatsCommand, buildWindowsStatsCommand, hasStatsData, localStatsSampler, parseStatsLine } from './stats.js'
import type { StatsFrame } from './stats.js'
import { cleanAnsi } from './ansi.js'
import { buildFailurePrompt, extractCommandFromAnswer, plainAnswerText, shouldExplainExit } from './assist.js'
import type { AssistPromptInput } from './assist.js'

export type { HostKeyRecord } from './ssh.js'

export interface Config {
  /** 关闭整个插件。默认开。 */
  enabled?: boolean
  /** 是否向 agent 注入插件能力公告。默认开。 */
  announceToAgent?: boolean
  /** 并发 PTY 会话上限（1~16）。默认 4。 */
  maxSessions?: number
  /** shell 路径；缺省 $SHELL（macOS 上通常 /bin/zsh）。 */
  shell?: string
  /** TERM 值（经 -c 包装层注入）。默认 xterm-256color。 */
  term?: string
  /** COLORTERM 值。默认 truecolor。 */
  colorTerm?: string
  /** 会话工作目录（客户端 spawn 带 cwd 时优先）；缺省为宿主进程启动目录。 */
  cwd?: string
  /** SSH 连接簿（面板「+」菜单可选；密码/口令支持 env:VAR 引用）。 */
  sshHosts?: SshHostEntry[]
  /** 异常断开后会话保活秒数（0 = 立即结束；默认 120，最大 3600）。 */
  reconnectGraceSec?: number
  /** 已记录的 SSH 主机密钥指纹（TOFU 钉扎，按 host:port 唯一）。 */
  hostKeys?: HostKeyRecord[]
  /** 是否注入 OSC 133/7 shell 集成（命令边界标记 + cwd 上报）。默认开。 */
  shellIntegration?: boolean
  /** 端口转发隧道（引用连接簿条目；宿主自持连接与重连，见 src/tunnels.ts）。 */
  tunnels?: TunnelSpec[]
  /** SFTP 文件浏览界面风格：dialog = 单窗体（默认）/ dual = 本机+远程双栏。 */
  sftpStyle?: 'dialog' | 'dual'
  /** 会话持久化：off = 会话随宿主生死（默认）；tmux = 「持久终端」标签由 tmux server 托管，可跨宿主重启恢复。 */
  persistence?: 'off' | 'tmux'
  /** 页面（最后一个连接）断开且保活期结束时，是否连 tmux 持久会话一起结束（默认 false = 留存可恢复）。 */
  endOnPageClose?: boolean
  /** SFTP 传输限制（0 = 不限）。 */
  sftpLimits?: Partial<SftpLimits>
  /** 服务器状态条（0.17.0）：是否采集并推送会话资源指标（CPU/内存/磁盘/uptime/TCP/网速/温度）。默认开。 */
  statsEnabled?: boolean
  /**
   * AI 辅助「失败即解释」（0.24.0）：**默认关**（见下方 assistProvider 的成对规则）。
   *
   * 打开后，命令以非零状态结束时宿主会把**那条命令的输出尾部**（经清洗、去重、截断
   * 与轻量遮盖）发给模型，换回一段「发生了什么 / 下一步」。所以这个开关不只是功能开关，
   * 它同时是一次**数据外发**的授权——默认关，卡片上必须把这件事写清楚。
   */
  assistEnabled?: boolean
  /** AI 辅助的模型路由 provider；与 assistModel **成对**（都留空 = 跟随宿主默认模型，只填一个按未配置处理）。 */
  assistProvider?: string
  /** AI 辅助的模型路由 model；与 assistProvider 成对。 */
  assistModel?: string
  /**
   * 允许 ProxyCommand（本机命令执行）：**默认关**。
   *
   * 本插件唯一「由设置字段驱动本机任意命令执行」的开关，与跳板机（只连一跳 TCP）不同档：
   * 关着时携带 `proxyCommand` 的连接**明确失败**（不退回直连），`~/.ssh/config` 导入也
   * 永不自动带入该字段——要用的条目必须自己开开关再手填。
   */
  allowProxyCommand?: boolean
  /** 内部状态：SSH 持久会话名（远程 tmux 托管，本机 socket 清单看不到，随 settings 留存供新窗口恢复确认）。 */
  persistSessions?: Array<{ tmuxName: string }>
}

/** SFTP 传输限制（均为 0 = 不限；客户端浏览器侧执行，宿主不做总量闸）。 */
export interface SftpLimits {
  /** 单文件下载上限（MB）。默认 1024。 */
  maxDownloadMb: number
  /** 单文件上传上限（MB）。默认 2048。 */
  maxUploadMb: number
  /** 一次批量/拖拽上传的文件数上限。默认 1000。 */
  maxUploadFiles: number
}

/** SFTP 传输限制默认值。 */
const DEFAULT_SFTP_LIMITS: Required<SftpLimits> = { maxDownloadMb: 1024, maxUploadMb: 2048, maxUploadFiles: 1000 }

/**
 * 跳板机（ProxyJump 单跳）的 settings schema。
 *
 * 刻意**不给 `auth` / `keyPath` / `passphrase` / `password` / `username` 默认值**：
 * 缺省的含义是「继承目标那一跳的凭据」，一旦给默认值（如 auth 默认 agent）就会把
 * 「继承」变成「显式 agent」，用户配了密码的跳板机就会认证失败。
 */
const SSH_JUMP_SCHEMA = z.object({
  host: z.string(),
  port: z.natural().max(65535).default(22),
  username: z.string().default(''),
  auth: z.union([z.const('agent'), z.const('key'), z.const('password')]),
  keyPath: z.string().default(''),
  passphrase: z.string().default(''),
  password: z.string().default(''),
})

const SSH_HOST_SCHEMA = z.object({
  name: z.string(),
  host: z.string(),
  port: z.natural().max(65535).default(22),
  username: z.string(),
  auth: z.union([z.const('agent'), z.const('key'), z.const('password')]).default('agent'),
  keyPath: z.string().default(''),
  passphrase: z.string().default(''),
  password: z.string().default(''),
  agentForward: z.boolean().default(false),
  /** 经跳板机连接（ProxyJump 单跳）；缺省 = 直连。 */
  jump: SSH_JUMP_SCHEMA,
  /**
   * 代理命令（ProxyCommand）：本机执行、stdio 当 SSH 传输。**需要 allowProxyCommand 才生效**。
   * `~/.ssh/config` 导入永不自动带入（那一档信任级要用户自己开开关并手填）。
   */
  proxyCommand: z.string().default(''),
  /** 该条目的 SSH 标签默认以 tmux 持久会话打开（仅 persistence=tmux 时生效）。 */
  persist: z.boolean().default(false),
})

const HOST_KEY_SCHEMA = z.object({
  host: z.string(),
  port: z.natural().max(65535).default(22),
  fingerprints: z.array(z.string()).default([]),
  fingerprint: z.string().default(''), // 旧版单指纹字段：仅作迁移输入，清洗后并入 fingerprints
})

const TUNNEL_SCHEMA = z.object({
  name: z.string(),
  bookName: z.string(),
  direction: z.union([z.const('local'), z.const('remote')]).default('local'),
  localPort: z.natural().max(65535).default(0),
  remoteHost: z.string().default(''),
  remotePort: z.natural().max(65535).default(0),
  localTargetHost: z.string().default(''),
  localTargetPort: z.natural().max(65535).default(0),
  enabled: z.boolean().default(true),
})

/**
 * 运行时 Config schema——DSH ≥0.1.7 起同时就是本插件的 settings 存储。
 *
 * 全部字段都标 `.volatile()`：它们都是「插件配置 → 终端面板」卡片可改项，而
 * `settings.update(entryId, patch)` 只接受 volatile 路径；loader 对 volatile-only
 * 变更原地更新引用并发 `loader/volatile-update`，不重挂插件——插件订阅后走
 * `applyPatch` 热应用（见 @hyzyn/dsh-kit 的 settingsEntryScope）。
 */
export const Config: z = z.object({
  enabled: z.boolean().default(true).volatile(),
  announceToAgent: z.boolean().default(true).volatile(),
  maxSessions: z.natural().max(16).default(4).volatile(),
  shell: z.string().default('').volatile(),
  term: z.string().default('xterm-256color').volatile(),
  colorTerm: z.string().default('truecolor').volatile(),
  cwd: z.string().default('').volatile(),
  reconnectGraceSec: z.natural().max(3600).default(120).volatile(),
  sshHosts: z.array(SSH_HOST_SCHEMA).default([]).volatile(),
  hostKeys: z.array(HOST_KEY_SCHEMA).default([]).volatile(),
  tunnels: z.array(TUNNEL_SCHEMA).default([]).volatile(),
  shellIntegration: z.boolean().default(true).volatile(),
  sftpStyle: z.union([z.const('dialog'), z.const('dual')]).default('dialog').volatile(),
  persistence: z.union([z.const('off'), z.const('tmux')]).default('off').volatile(),
  endOnPageClose: z.boolean().default(false).volatile(),
  statsEnabled: z.boolean().default(true).volatile(),
  assistEnabled: z.boolean().default(false).volatile(),
  assistProvider: z.string().default('').volatile(),
  assistModel: z.string().default('').volatile(),
  sftpLimits: z.object({
    maxDownloadMb: z.natural().max(1024 * 1024).default(1024),
    maxUploadMb: z.natural().max(1024 * 1024).default(2048),
    maxUploadFiles: z.natural().max(100000).default(1000),
  }).default({ maxDownloadMb: 1024, maxUploadMb: 2048, maxUploadFiles: 1000 }).volatile(),
  /**
   * 允许 ProxyCommand（本机命令执行）：**默认 false**。
   *
   * 这是本插件唯一「由设置字段驱动本机任意命令执行」的开关，与跳板机（只连一跳 TCP）不同档；
   * 关着时携带 proxyCommand 的连接**明确失败**（不退回直连），导入也永不自动带入该字段。
   */
  allowProxyCommand: z.boolean().default(false).volatile(),
  persistSessions: z.array(z.object({ tmuxName: z.string() })).default([]).volatile(),
})

/* ------------------------------------------------------------------ *
 * 常量
 * ------------------------------------------------------------------ */

const WS_PATH = '/api/dsh-tty/ws'

/**
 * 代理命令这条能力的宿主侧授权（见 kit 的 capability.js 与 docs/architecture.md）。
 *
 * 两条提权通道（见 kit 的 capability.ts）：
 *   ① 启动环境变量（最严档，判定源是宿主的启动环境快照）；
 *   ② 就地提权（免重启）：卡片上点开关 → 在宿主文件系统上落地一个随机名确认文件。
 * HTTP 侧**不能凭空打开**它——回环围栏与同源证明都拦不住跨站页面与页内脚本，配置路由若能
 * 凭空提权，这道闸门等于没有；而「关掉」永远可用（紧急刹车不依赖重启）。
 */
const CAP_PROXY_COMMAND = { env: 'DSH_TTY_ALLOW_PROXY_COMMAND', label: '代理命令（ProxyCommand）' } as const
const DEFAULT_MAX_SESSIONS = 4
/** 断线保活默认秒数（reconnectGraceSec；0 = 旧行为，断开立即结束会话）。 */
const DEFAULT_RECONNECT_GRACE_SEC = 120
/**
 * 会话退出后的**只读保留策略**（D77）。
 *
 * 进程没了之后把会话留在 `sessions` 表里：`tty_list` / `tty_capture` / `tty_screen`
 * 照常能读到它最后那些输出（用户上报的痛点原话：「结果明明就在那里但我看不到」——
 * `tty_open` 跑一条命令，跑完会话就退役，AI 一个字符都取不回来，逼得人先开
 * `/bin/sh` 再往里发命令）。
 *
 * 取 **∞ = 保留到显式关闭**（`tty_close` / 面板关标签 / 宿主重启），不由时间淘汰：
 *
 * - 时间上界对用户是**第二重惊喜**——「命令跑完 → 下一轮读结果」之间隔着人离开、
 *   模型排队，多久都有可能；一个到期就消失的输出比「要主动关」更难理解；
 * - 内存与句柄本来也不由时间决定：条数由 [`MAX_EXITED_SESSIONS`](#) 兜（16 条，
 *   单条几百 KB~一两 MB），而「永久」还有一条天然上界——保留是**内存态**，
 *   宿主 / 插件重启即清空，不会跨天累积；
 * - 连续跑很多短命令时，淘汰节奏变成「超过 16 条按最旧淘汰」（`capExited`），
 *   正是想要的语义：近的才有人读。
 *
 * 需要时间上界的人把这里改成任意毫秒数即可——`reapExited` 那条通路还在
 * （回收器每轮都会调它）。导出仅供单测（test/host-frames.test.ts）：到点退役与
 * 条数上限的行为护栏。
 */
export const EXITED_RETAIN_MS = Number.POSITIVE_INFINITY
/**
 * 只读保留的会话数上限（超出按最旧淘汰，见 SessionManager.capExited）。
 *
 * 与「并发会话上限」（maxSessions，默认 4）是两个口径：那个数**只数活着的会话**
 * （retained 的不占名额，否则跑几条短命令就把面板顶成「会话数已达上限」，
 * 比原缺陷更糟）。这里兜的是内存：每条 retained 约 = 256KB 环形缓冲 + 一块
 * xterm-headless 虚拟屏，16 条仍在 ~20MB 量级。
 *
 * 为什么从 8 抬到 16（D77 补，2026-09-27 真机验收反馈）：保留改成「留到显式关闭」
 * 之后，上限就是唯一会**自动**挤掉结果的东西，而 agent 一口气开二十几条一次性
 * 会话是常态——8 条意味着「几分钟前那份结果」被最旧淘汰挤掉，用户只看到「没了」。
 * 淘汰一律 `logger.warn` 留痕（见 finishSession），否则这件事在事后完全不可查。
 */
export const MAX_EXITED_SESSIONS = 16
/** 下行背压阈值（ws.bufferedAmount 字节）。 */
const BACKPRESSURE_HIGH = 512 * 1024
const BACKPRESSURE_LOW = 128 * 1024
/**
 * 显式 kill 后的 exit 帧兜底（毫秒）。PTY 句柄的 `done` 承诺「恰好 resolve 一次」，
 * 但个别平台/后端上 forceKill 之后它迟迟不兑现（实测 rc.1 的 subprocess-local 在
 * Linux 上会卡住），而「发过 kill 就必须收到一条 exit 帧」是前端契约（B1/B3 用例
 * 钉的就是它）。超时即按 SIGKILL 结案；done 真回来时靠 session.exitSent 幂等忽略。
 */
const KILL_EXIT_FALLBACK_MS = 2000
const SID_RE = /^[A-Za-z0-9_-]{1,64}$/
/** 自定义命令标签（0.14.0）的长度上限：单条命令，防误传超长脚本。 */
const COMMAND_MAX = 2000

/**
 * 清洗帧里的 `command`（0.14.0，ttyTerminal 服务用）：必须是单行、非空、
 * 长度受控的字符串。命令来自**宿主侧插件**（如 dsh-docker 的
 * `docker exec -it <容器> sh`），信任级与插件本身相同；这里只做形状校验，
 * 避免换行破坏本地 `-c` 包装层、或超长内容拖垮帧解析。
 */
function sanitizeCommand(value: unknown): { command?: string; error?: string } {
  if (value === undefined) return {}
  if (typeof value !== 'string') return { error: 'command 必须是字符串' }
  const trimmed = value.trim()
  if (trimmed === '') return { error: 'command 不能为空' }
  if (trimmed.length > COMMAND_MAX) return { error: `command 过长（≤${String(COMMAND_MAX)} 字符）` }
  if (/[\r\n\0]/.test(trimmed)) return { error: 'command 必须是单行（不能含换行/NUL）' }
  return { command: trimmed }
}
const BUFFER_CAP = 256 * 1024
/** TERM/COLORTERM 白名单：防止值里的引号破坏 -c 包装层命令（shellArgv 单引号包裹）。 */
const TERM_RE = /^[A-Za-z0-9_.+-]+$/
/** 孤儿会话回收器的扫描间隔。 */
const REAPER_INTERVAL_MS = 10_000
/** 服务器状态条的采集/推送间隔（mvp 固定 1s，不做配置项）。 */
const STATS_INTERVAL_MS = 1000
/**
 * 采集失败后的退避重挂：`base × 2^(失败次数-1)`，上限 `MAX`（D83）。
 *
 * 上限 5 分钟是给「远端压根没有采集源」那种稳态失败留的——既要重挂（瞬态故障能自愈），
 * 又不能把必然失败的 channel 重开得太勤。出过帧即计数归零，恢复正常节奏。
 */
const STATS_RETRY_BASE_MS = 30_000
const STATS_RETRY_MAX_MS = 300_000
/**
 * agent `tty_stats` 一发式远端采样的超时（D84）。
 *
 * 原先写死 3s，而这条路径要等**第一帧**：远端 shell 启动 + 脚本首次迭代，Windows
 * 远端还要算 PowerShell 冷启动 + 多次 WMI 查询——状态条那条推送路径没有这个上限，
 * 于是出现过「面板有数据、agent tty_stats 每次都报超时」的错位。放宽到 15s：工具
 * 调用等得起，而写死的小值会把慢首帧误报成「采不到」。
 */
const STATS_ONESHOT_TIMEOUT_MS = 15_000

const TTY_GUIDANCE =
  '本机已安装 dsh-tty 插件（终端面板）：Web GUI 侧边栏的「终端」入口可打开交互终端（xterm.js + PTY），可运行任意命令与 TUI 程序（vim/htop 等），支持多标签页与断线自动重连（刷新页面/网络抖动后会话保活并恢复现场）；新标签默认在当前会话工作目录打开。标签栏「+」菜单还能开 SSH 标签页（ssh2 原生连接，连接簿在设置卡片维护，支持 agent forwarding 与主机指纹 TOFU 钉扎；连接簿条目可配单跳跳板机 ProxyJump），像本地终端一样操作远程主机。设置卡片开启「会话持久化（tmux）」后，新开的本地/SSH 标签默认由 tmux server 托管（宿主重启/断线超时后重开即恢复现场），长任务建议在持久化开启时运行。长驻进程（dev server、watch、交互式程序）用 tty_open 开一个会话跑（或引导用户到终端面板里运行），不要在 bash 工具里挂起等待；用户提到「开个终端 / 在终端里跑 / SSH 到某台机器」时引导其打开该面板。agent 侧配套工具：tty_list 列出活跃终端会话（含 SSH 的 target、实时 cwd，以及 `running`——这个会话**有没有命令在跑**，文本里三态写作 `[空闲]` / `[运行中——现在别往里发命令]` / `[命令状态未知]`；命令状态未知**不是**没在跑），tty_capture 读取近期输出（默认清洗 ANSI；last:true 拿「上一条命令」的输出+退出码），tty_screen 读取当前可见屏幕（可读懂 vim/htop 等 TUI），tty_expect 用正则等待输出中的就绪信号（如 dev server URL、构建完成；它**先回看还没读过的已到达输出**，命令瞬间跑完也不会白等——超时若只返回一句诊断文案，别当成「命令没执行」），tty_send 发送按键（控制键/方向键用具名 `keys`，别在 data 里拼转义序列），tty_run 一次调用跑完一条命令并直接拿回尾部输出+退出码（想省掉 open→等→capture→close 四步时用它），tunnel_list 列出端口转发隧道状态——操作会实时显示在用户终端里。SFTP 文件传输：面板内可对 SSH 连接簿条目（或 SSH 连接对话框当前填写的信息）打开文件浏览（上传/下载/建目录/重命名/删除），传输期间进度条右侧 ✕ 可取消（半截文件自动清理）；agent 配套 sftp_list 列远程目录、sftp_tree 递归看目录结构、sftp_read 读远程文本文件（≤1MB）、sftp_write 写远程文本文件（≤1MB，可追加）、sftp_mkdir 建目录（parents 可逐级补齐）、sftp_rename 重命名/移动、sftp_remove 删除（目录需 recursive），book 参数为连接簿条目名。端口转发：连接簿条目可配本地/远程隧道（如把远程数据库映射到本地端口），宿主自动保活重连，用户提到「转发端口 / 访问远程库」时引导其到终端面板设置卡片配置。推荐流程：tty_send 启动长任务 → tty_expect 等就绪标记 → tty_capture{last:true} 拿结果。'

/* ------------------------------------------------------------------ *
 * 类型
 * ------------------------------------------------------------------ */

/** DSH spawnTerminal 返回 handle 的最小形状（含内部耦合的 terminal 字段）。 */
interface PtyHandle {
  pid: number
  output: PassThrough
  write(data: string): Promise<unknown>
  terminate(): Promise<unknown>
  done: Promise<{ exitCode: number | null; signal: string | null }>
  /** 内部耦合：DSH 的 LocalTerminalHandle 未暴露 resize/kill，直接透传 node-pty。 */
  terminal?: {
    resize?(cols: number, rows: number): void
    kill?(signal: string): void
  }
}

/** 本地 PTY 包装成 TermHandle（resize/kill 仍是透传 node-pty 的内部耦合；防御性降级）。 */
export function wrapLocalPty(handle: PtyHandle): TermHandle {
  let resizeWarned = false
  // D79：README 承诺「DSH 升级若改内部结构会警告一次并退化为固定尺寸」，但老写法是
  // `handle.terminal?.resize?.(…)` —— `?.` 只在**抛错**时才进 catch，DSH 若把
  // `handle.terminal` 改名 / 移除（而不是让 resize 抛错），这里既不 resize 也不警告，
  // 排查时一点线索都没有（承诺成了空头支票）。两种坏法现在都记一条日志。
  const warnResizeDegraded = (reason: string): void => {
    if (resizeWarned) return
    resizeWarned = true
    console.warn('[dsh-tty] resize 透传失败（DSH 内部结构可能已变化，退化为固定尺寸）: ' + reason)
  }
  return {
    kind: 'local',
    pid: handle.pid,
    output: handle.output,
    done: handle.done,
    write: (data) => handle.write(data),
    resize: (cols, rows) => {
      const terminal = handle.terminal
      if (terminal === undefined || typeof terminal.resize !== 'function') {
        warnResizeDegraded('handle.terminal.resize 不存在')
        return
      }
      try {
        terminal.resize(cols, rows)
      } catch (error) {
        warnResizeDegraded(String((error as Error | undefined)?.message ?? error))
      }
    },
    terminate: () => handle.terminate(),
    forceKill: () => {
      killLocalShellTerminal(handle.terminal)
    },
  }
}

/**
 * 本地 PTY 顶层 shell 的 best-effort 强杀（D48）。
 *
 * **Windows 绝不能带 signal**：node-pty 的 `WindowsTerminal.kill(signal)` 会同步
 * `throw new Error('Signals not supported on windows.')`，而且它内部 `_deferNoArgs`
 * 会把回调排进队列、稍后从 socket 回调里执行——调用方的 try/catch 拦不住，直接变成
 * **宿主进程崩溃**。CI 的 windows-latest 上实测：spawn → kill 跑完就崩在
 * `windowsTerminal.js:161`。不带 signal 时 node-pty 走 `_close()` + `agent.kill()`，
 * 正是 Windows 上正确的终止语义。
 *
 * 导出仅供单测（test/host-frames.test.ts）：平台参数注入，两个分支都能在 macOS/Linux 断言。
 */
export function killLocalShellTerminal(terminal: unknown, platform: NodeJS.Platform = process.platform): void {
  const kill = (terminal as { kill?: (signal?: string) => void } | undefined)?.kill
  if (typeof kill !== 'function') return
  try {
    if (platform === 'win32') kill.call(terminal)
    else kill.call(terminal, 'SIGKILL')
  } catch {
    /* 已退出 */
  }
}

/**
 * Windows 本地 PTY 的**输入归一化**（D74，2026-09-27 真机报告）：conhost 把 Enter 当
 * **CR**，裸 LF 只把光标下移一格、**不提交命令行**——于是 `tty_send` 按工具描述发
 * `echo X\n` 时，命令停在输入行上：没有输出、没有新提示符，看起来像「发出去了但没执行」。
 *
 * 修法取报告建议里改动最小的一条：win32 上把行尾补成 CRLF（已有 CR 的不重复补），
 * 让「照描述写 `\n`」这条主路径直接可用。非 win32 原样透传（POSIX 的 Enter 就是 LF），
 * SSH 会话也不归一化（远端是什么系统、什么 shell 插件不知道，乱改会破坏 `cat` 之类的原始输入）。
 *
 * 导出仅供单测：平台参数注入，两个分支都能在 macOS/Linux 断言。
 */
export function normalizePtyInput(data: string, platform: NodeJS.Platform = process.platform): string {
  if (platform !== 'win32') return data
  return data.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n')
}

/** 一次「会话 → 帧」采集器的句柄（本地 = 定时器，SSH = 远端长驻 exec channel）。 */
interface StatsCollector {
  stop(): void
}

interface TtySession {
  id: string
  handle: TermHandle
  /**
   * 绑定的 WS 连接集合（0.19.0 起支持跨连接共享）：持久（tmux）会话可被多个
   * 窗口同时绑定——同 tmuxName 的 spawn 不再新建 PTY 而是重绑定到现有会话
   * （单 PTY 多客户端扇出，名额不翻倍）。
   *
   * 键 = `<连接 id>:<该连接侧标签 sid>`，值 = { ws, sid }（帧寻址用连接侧
   * sid）：只用 sid 做键时，「复制标签页」复制出的同 sid 第二连接会覆盖第一
   * 连接的绑定（前者收不到输出还自以为在线），且前者关闭时误删后者的绑定。
   * map 为空 = 孤儿状态。
   */
  clients: Map<string, { ws: WebSocket; sid: string }>
  closed: boolean
  paused: boolean
  /**
   * 会话归属（agent 侧 tty_open）：'user' = 面板标签开的、有客户端绑定；
   * 'agent' = agent 用 tty_open 开的，**可能长时间无客户端**。
   *
   * 为什么必须区分：孤儿回收器的判据是「无客户端绑定」（`orphanedAt !== null`），
   * 而 agent 开的会话从出生起就没有客户端——不豁免的话会被回收器当孤儿秒收，
   * 长驻任务（dev server / build）刚起来就没了。豁免之后关闭入口只有两个：
   * agent 的 `tty_close`，或用户在面板里接管后照常关标签。
   */
  owner: 'user' | 'agent'
  /**
   * **只读保留态**（D77）：进程已退出，但会话**还留在表里**——读侧工具照常可用，
   * 写侧明确拒写，用户与 agent 都能显式关掉它（`tty_close` / 面板关标签 / TTL 到点）。
   *
   * 与 `closed` 是两件事：`closed` = 真退役（出表 + 释放屏，见 SessionManager.retire），
   * 而「进程退出」**不再**等于退役——否则退出瞬间那些输出就再也取不回来了。
   */
  exited: { code: number | null; signal: string | null; at: number } | null
  /** exit 帧只发一次（kill 主动关闭与 shell 自然退出共用同一回调）。 */
  exitSent?: boolean
  /** agent 工具展示用的元数据。 */
  cwd: string
  kind: 'local' | 'ssh'
  /** SSH 会话的展示目标（user@host[:port]）；本地会话为空串。 */
  target: string
  /**
   * 命令型会话（0.23.0）：`tty_open command=` / `tty_run` / SSH 的 exec 标签 ——
   * 进程本身就是那条命令，**活着就等于在跑**、退出就等于命令结束。
   * tty_list 的 `running` 对这类会话不依赖 shell 集成（它们不注入钩子）。
   */
  commandSession: boolean
  startedAt: number
  lastOutputAt: number
  /** 最近一次 PTY 输入（input 帧 / tty_send）的时间戳：tty_capture{last} 的在途判据之一。 */
  lastInputAt: number
  /** 累计写入环形缓冲的原始输出字符数（单调，D72）：buffer 起点 = `outputSeq - buffer.length`。 */
  outputSeq: number
  /** agent 已读水位线（绝对字符计数，D72）；-1 = 还没被 agent 工具碰过（首次触达时落在当下）。 */
  readSeq: number
  /** 水位线最近一次推进的时刻（D72）：`lastCommand.endedAt > readMarkAt` = 这条命令的输出还没被读过。 */
  readMarkAt: number
  /** 已经就「失败」弹过徽标的那条命令的 `lastCommand.seq`（0.24.0）；-1 = 还没弹过。 */
  assistHintedSeq: number
  /**
   * 最近若干条「agent 提交过的命令行」（D75，来自 `tty_send` 且带行尾的那些）：
   * 无 shell 集成时 PTY 会把它们**原样回显**进输出流，`tty_expect` 拿回显当命中
   * 就是假阳性（命令还没执行就报 matched）。用这份清单把回显行从匹配窗口里剔掉。
   * 只记 `tty_send` 的写入：面板逐键输入不做行编辑模拟（宁可少抑制，不可错抑制）。
   */
  recentInputs: string[]
  /** 输出环形缓冲（尾部 256KB，供 tty_capture 与断线重连回放）。 */
  buffer: string
  /** utf8 分帧兜底：跨 chunk 的多字节序列由 StringDecoder 缓存补齐。 */
  decoder: StringDecoder
  /** 虚拟屏（xterm-headless）：tty_screen 的数据源；创建失败为 null。 */
  screen: HeadlessTerminal | null
  /** 虚拟屏心跳（D57 停摆检测）：在途批次 + 看门狗。 */
  screenHeartbeat: ScreenHeartbeat
  /** 虚拟屏被退役的原因（停摆 / 写队列满）；null = 正常。tty_screen 据此如实报错。 */
  screenDownReason: string | null
  /** 转入孤儿状态的时间戳；null 表示已连接（客户端在线）。 */
  orphanedAt: number | null
  /** shell 集成状态（OSC 133/7 解析；本地与 SSH 会话都喂）。 */
  shellState: ShellIntegrationState
  /** data 帧合并暂存区（flush 前不发）。 */
  pendingOutput: string
  /** 合并冲刷定时器；null 表示无待冲刷窗口。 */
  flushTimer: NodeJS.Timeout | null
  /** tmux 持久会话名（本地与 SSH 同语义）；null = 非持久会话。 */
  tmuxName: string | null
  /**
   * 服务器状态条（0.17.0）：已订阅该会话 stats 的客户端 sid 集合（tab 可见性
   * 驱动）。空集合 = 该会话不需要采集，采集器必须停（防定时器/远程 channel 泄漏）。
   */
  statsSubs: Set<string>
  /** 最近一帧服务器状态指标（tty_stats 的一条数据源；未采过为 null）。 */
  lastStats: StatsFrame | null
  /** 采集器句柄；null = 未启动（懒启动：首个 statsOn 才起）。 */
  stats: StatsCollector | null
  /** 采集已永久失败（远端无 /proc、exec 被拒、连接断开）：不再重启，前端隐藏状态条。 */
  statsFailed: boolean
  /** 采集失败后的重挂时刻（0 = 没有待重挂）：失败位不再是粘性的（D83）。 */
  statsRetryAt: number
  /** 连续失败次数：退避倍数按它递增，出过帧即归零。 */
  statsFailures: number
}

/** 退出事实的一句话描述（工具文案共用同一措辞：`exitCode=3` / `signal=SIGSEGV`）。 */
function describeExit(exited: { code: number | null; signal: string | null }): string {
  if (exited.signal !== null && exited.signal !== '') return `signal=${exited.signal}`
  return exited.code === null ? '退出码未知' : `exitCode=${String(exited.code)}`
}

/**
 * 只读保留的剩余毫秒（D77）；`null` = **不按时间释放**（策略为 ∞）或不是保留态。
 *
 * 工具结果带上它，agent 才知道「这个 sid 还能读多久」——否则它会以为读到的
 * 是一具刚刚咽气的尸体、下次照样能读，而实际上屏与缓冲到点就释放了。
 *
 * 注意这个值会进工具输出：**不能返回 `Infinity`**——`JSON.stringify` 会把它变成
 * `null`，撞上宿主对 `output.schema`（`type: 'number'`）的校验，整个工具调用直接
 * 变成 Error（B33 抓过同一类）。所以「无限期」一律用**省略该字段**表达。
 */
function retainLeftMs(session: TtySession, now: number = Date.now()): number | null {
  if (session.exited === null) return null
  if (!Number.isFinite(EXITED_RETAIN_MS)) return null
  return Math.max(0, session.exited.at + EXITED_RETAIN_MS - now)
}

/** 单条 WS 连接的上下文：绑定键的连接侧成分 + 存活标志（spawn 在途竞态用）。 */
interface TtyConnContext {
  id: string
  open: boolean
}

interface ReqLike {
  method?: string
  headers: Record<string, string | string[] | undefined>
  socket: { remoteAddress?: string }
  url?: string
}

interface SocketLike {
  destroy(): void
}

type WsMessage = Record<string, unknown>

/** TERM/COLORTERM 值白名单校验：不合法回退 fallback（防止破坏 -c 包装层）。 */
function sanitizeTermValue(value: string, fallback: string): string {
  const trimmed = value.trim()
  return TERM_RE.test(trimmed) ? trimmed : fallback
}

/** 可热更新的运行时配置（loader 的 volatile 更新事件动态应用）。 */
class LiveConfig {
  shell: string
  term: string
  colorTerm: string
  cwd: string
  /** 异常断开后会话保活毫秒数（0 = 立即结束）。 */
  reconnectGraceMs: number
  sshHosts: SshHostEntry[]
  hostKeys: HostKeyRecord[]
  /** 是否注入 OSC 133/7 shell 集成。 */
  shellIntegration: boolean
  /** 端口转发隧道规格。 */
  tunnels: TunnelSpec[]
  /** 会话持久化模式（off / tmux）。 */
  persistence: 'off' | 'tmux'
  /** 页面断开且保活期结束时是否结束 tmux 持久会话（默认 false = 留存）。 */
  endOnPageClose: boolean
  /** 服务器状态条：是否采集并推送会话资源指标（默认 true）。 */
  statsEnabled: boolean
  /** AI 辅助「失败即解释」：默认关（见 Config.assistEnabled）。 */
  assistEnabled: boolean
  /** AI 辅助的模型路由（provider / model 成对；都空 = 跟随宿主默认模型）。 */
  assistProvider: string
  assistModel: string
  /** SSH 持久会话名（远程 tmux 托管；本机 socket 清单看不到，随 settings 留存）。 */
  persistSessions: string[]
  /** SFTP 传输限制（客户端浏览器侧执行）。 */
  sftpLimits: Required<SftpLimits>
  /** 允许 ProxyCommand（本机命令执行）：默认关（见 Config.allowProxyCommand）。 */
  allowProxyCommand: boolean

  constructor(init: { shell: string; term: string; colorTerm: string; cwd: string; reconnectGraceSec: number; sshHosts?: SshHostEntry[]; hostKeys?: HostKeyRecord[]; shellIntegration: boolean; tunnels?: TunnelSpec[]; persistence?: 'off' | 'tmux'; endOnPageClose?: boolean; statsEnabled?: boolean; sftpLimits?: Partial<SftpLimits>; allowProxyCommand?: boolean; persistSessions?: string[]; assistEnabled?: boolean; assistProvider?: string; assistModel?: string }) {
    this.shell = init.shell
    this.term = sanitizeTermValue(init.term, 'xterm-256color')
    this.colorTerm = sanitizeTermValue(init.colorTerm, 'truecolor')
    this.cwd = init.cwd
    this.reconnectGraceMs = Math.max(0, Math.min(3600, init.reconnectGraceSec)) * 1000
    this.sshHosts = init.sshHosts ?? []
    this.hostKeys = init.hostKeys ?? []
    this.shellIntegration = init.shellIntegration
    this.tunnels = init.tunnels ?? []
    this.persistence = init.persistence === 'tmux' ? 'tmux' : 'off'
    this.endOnPageClose = init.endOnPageClose === true
    // 只有显式 false 才关（缺省/旧配置一律视为开）
    this.statsEnabled = init.statsEnabled !== false
    this.sftpLimits = sanitizeSftpLimits(init.sftpLimits)
    // 缺省/旧配置一律视为**关**（这一档是「本机命令执行」，只有显式 true 才开）
    this.allowProxyCommand = init.allowProxyCommand === true
    this.persistSessions = init.persistSessions ?? []
    // AI 辅助同样「只有显式 true 才开」：它会把终端内容发往模型，缺省必须是关
    this.assistEnabled = init.assistEnabled === true
    this.assistProvider = typeof init.assistProvider === 'string' ? init.assistProvider.trim() : ''
    this.assistModel = typeof init.assistModel === 'string' ? init.assistModel.trim() : ''
  }

  /** 合并部分更新；空字符串/undefined 保持原值；sshHosts/hostKeys/tunnels 传数组即整体替换。 */
  apply(partial: Partial<{ shell: string; term: string; colorTerm: string; cwd: string; reconnectGraceSec: number; sshHosts: SshHostEntry[]; hostKeys: HostKeyRecord[]; shellIntegration: boolean; tunnels: TunnelSpec[]; persistence: 'off' | 'tmux'; endOnPageClose: boolean; statsEnabled: boolean; sftpLimits?: Partial<SftpLimits>; allowProxyCommand: boolean; persistSessions: string[]; assistEnabled: boolean; assistProvider: string; assistModel: string }>): void {
    if (typeof partial.shell === 'string' && partial.shell.trim() !== '') this.shell = partial.shell.trim()
    if (typeof partial.term === 'string' && partial.term.trim() !== '') this.term = sanitizeTermValue(partial.term, this.term)
    if (typeof partial.colorTerm === 'string' && partial.colorTerm.trim() !== '') this.colorTerm = sanitizeTermValue(partial.colorTerm, this.colorTerm)
    if (typeof partial.cwd === 'string' && partial.cwd.trim() !== '') this.cwd = partial.cwd.trim()
    if (typeof partial.reconnectGraceSec === 'number' && Number.isInteger(partial.reconnectGraceSec) && partial.reconnectGraceSec >= 0 && partial.reconnectGraceSec <= 3600) {
      this.reconnectGraceMs = partial.reconnectGraceSec * 1000
    }
    if (Array.isArray(partial.sshHosts)) this.sshHosts = partial.sshHosts
    if (Array.isArray(partial.hostKeys)) this.hostKeys = partial.hostKeys
    if (typeof partial.shellIntegration === 'boolean') this.shellIntegration = partial.shellIntegration
    if (Array.isArray(partial.tunnels)) this.tunnels = partial.tunnels
    if (partial.persistence === 'tmux' || partial.persistence === 'off') this.persistence = partial.persistence
    if (typeof partial.endOnPageClose === 'boolean') this.endOnPageClose = partial.endOnPageClose
    if (typeof partial.statsEnabled === 'boolean') this.statsEnabled = partial.statsEnabled
    if (partial.sftpLimits !== undefined) this.sftpLimits = sanitizeSftpLimits({ ...this.sftpLimits, ...partial.sftpLimits })
    if (typeof partial.allowProxyCommand === 'boolean') this.allowProxyCommand = partial.allowProxyCommand
    if (Array.isArray(partial.persistSessions)) this.persistSessions = partial.persistSessions
    if (typeof partial.assistEnabled === 'boolean') this.assistEnabled = partial.assistEnabled
    /*
     * 这两个字段**刻意偏离**本方法的「空串保持原值」惯例：空串是「清掉路由、跟随宿主
     * 默认模型」这个**真实意图**，按惯例处理的话路由一旦填上就再也删不掉（只能重启）。
     */
    if (typeof partial.assistProvider === 'string') this.assistProvider = partial.assistProvider.trim()
    if (typeof partial.assistModel === 'string') this.assistModel = partial.assistModel.trim()
  }

  findSshHost(name: string): SshHostEntry | undefined {
    return this.sshHosts.find((entry) => entry.name === name)
  }
}

/* ------------------------------------------------------------------ *
 * 工具
 * ------------------------------------------------------------------ */

/** best-effort 终止：terminate() 抛「幸存者」竞态时降级为 forceKill（本地 PTY：对顶层 shell 直接 SIGKILL）。 */
async function forceKill(handle: TermHandle): Promise<void> {
  try {
    await handle.terminate()
  } catch {
    try {
      handle.forceKill?.()
    } catch {
      /* 已退出 */
    }
  }
}

function send(ws: WebSocket | null, msg: unknown): void {
  if (ws === null || ws.readyState !== WebSocket.OPEN) return
  ws.send(JSON.stringify(msg))
}

/**
 * 文本判定（0.19.0，sftp_read）：NUL 之外再加「非法 UTF-8/控制字节占比」——
 * 只看已读前缀是否含 NUL 时，>256KB 的二进制文件前段恰好没 NUL 就被当文本
 * 返回乱码；UTF-16 文本（字节偶位 NUL）由 NUL 判据捕获。样本只取前 64KB。
 */
function looksLikeBinary(buf: Buffer): boolean {
  if (buf.includes(0)) return true
  const decoder = new TextDecoder('utf-8', { fatal: true })
  try {
    decoder.decode(buf)
    return false
  } catch {
    let suspicious = 0
    const sample = buf.subarray(0, 64 * 1024)
    for (let i = 0; i < sample.length; i++) {
      const b = sample[i]
      // 控制字节（除 \t \n \r \f \e）：合法 UTF-8 文本里几乎不出现，二进制里大量出现
      if (b < 0x20 && b !== 0x09 && b !== 0x0a && b !== 0x0d && b !== 0x0c && b !== 0x1b) suspicious += 1
    }
    return suspicious / sample.length > 0.02
  }
}

/** 去掉截断点上的未完成 UTF-8 序列（≤3 字节残包）：解码不再在尾部出 U+FFFD。 */
function trimIncompleteUtf8Tail(buf: Buffer): Buffer {
  if (buf.length === 0) return buf
  const start = Math.max(0, buf.length - 3)
  for (let i = buf.length - 1; i >= start; i--) {
    const b = buf[i]
    if (b < 0x80) return buf // 末尾就是 ASCII：没有残包
    if ((b & 0xc0) === 0x80) continue // 续字节：向前找 lead
    const need = (b & 0xe0) === 0xc0 ? 2 : (b & 0xf0) === 0xe0 ? 3 : (b & 0xf8) === 0xf0 ? 4 : 0
    if (need === 0) return buf // 非法字节：交给 decode 按错误处理
    return buf.length - i >= need ? buf : buf.subarray(0, i)
  }
  return buf
}

function decodeUtf8ForAgent(buf: Buffer): string {
  return trimIncompleteUtf8Tail(buf).toString('utf8')
}

/**
 * 保尾截断并避开「切割点落在转义序列 / UTF-16 代理对中间」（0.19.0）：
 * 环形回放缓冲按字符 slice 时，起点可能落进 ANSI 序列内部（回放首行出现
 * 残破转义）或代理对之间（单个孤立代理）。找到安全边界后再切。
 */
function tailFromSafeBoundary(text: string, cap: number): string {
  if (text.length <= cap) return text
  let start = text.length - cap
  // 截断点前 64 字符内的 ESC：序列若跨过截断点，把起点挪到终结符之后
  const esc = text.lastIndexOf('\x1b', start)
  if (esc !== -1 && esc >= start - 64) {
    const m = /\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-Z\\-_]/.exec(text.slice(esc, esc + 160))
    if (m === null) {
      start = esc // 窗口内不见终结符：整个序列丢弃（最多 ~64 字符）
    } else if (esc + m.index + m[0].length > start) {
      start = esc + m.index + m[0].length
    }
  }
  if (start > 0 && start < text.length) {
    const code = text.charCodeAt(start)
    if (code >= 0xdc00 && code <= 0xdfff) start += 1 // 低位代理：跳过，避免孤立
  }
  return text.slice(start)
}

/**
 * tty_capture 的默认清洗：剥离 OSC/CSI/杂项转义序列，并把同行内 \r 覆盖
 * 收敛为最后一次覆盖结果（进度条不再刷屏）。逐行近似，不追求完整 VT 语义
 * （要完整画面用 tty_screen / xterm-headless 虚拟屏）。
 */
function cleanAnsiTail(raw: string): string {
  // 实现已抽到 ./ansi.ts（0.24.0）：「失败即解释」的上下文压缩建立在同一套正则上，
  // 各留一份必然漂移。这里保持名字与逐字节相同的行为，调用点一个都不用改。
  return cleanAnsi(raw)
}

/** OSC 133 命令标记帧：\x1b]133;<A|B|D|T>[;<payload>](BEL|ST)。
 * T（0.10.0）= tmux 持久标签的 pane 内容快照（base64）：tmux 的 pane 重画是
 * 异步批量的，命令输出会落在 D 标记之后逃出 B..D 捕获窗口，故由钩子在发 D
 * 前 capture-pane 随流直送，宿主优先采用。 */
const OSC133_RE = /\x1b\]133;([ABDCT])(?:;([^\x07\x1b]*))?(?:\x07|\x1b\\)/g
/** OSC 7 cwd 上报帧：\x1b]7;file://<host><path>(BEL|ST)。 */
const OSC7_RE = /\x1b\]7;([^\x07\x1b]*)(?:\x07|\x1b\\)/g
/** 单条命令输出捕获上限（环形，超出丢头部）。 */
const COMMAND_CAP = 256 * 1024
/** 同一会话允许的在途 tty_expect 上限（每个都挂常驻 data 监听器直到 settle）。 */
const MAX_EXPECT_PER_SESSION = 5
/** 在途 tty_expect 计数（按会话弱引用，会话回收不泄漏）。 */
const expectCounts = new WeakMap<TtySession, number>()

/**
 * 整数夹紧（0.19.0）：ws 帧输入零信任——`Number('abc')=NaN`、`-5`、`1.5`、
 * `1e9` 都不能原样透传给 node-pty 的 ioctl 与 xterm-headless（后者曾在
 * resize 帧路径直接炸出未捕获异常）。非法值回落 fallback，范围内取整。
 *
 * D79 补的一档（0.22.1）：`null` / `''` / 布尔 / 对象也**不是数字**，但
 * `Number(null)` = 0、`Number('')` = 0 会通过 isFinite 检查 ⇒ 被夹成下限 2。而客户端
 * 把 NaN 发成 JSON 时正是 `null`（FitAddon 对游离 / 隐藏容器给 NaN，见
 * `client-src/fit-size.js`），于是「根本不该发」的尺寸被翻译成「合法的极小尺寸」——
 * 后台标签的 PTY 就是这么变成 2×2 的。非数值一律与 NaN 同档：回落 fallback。
 */
function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : Number.NaN
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}
/** data 帧合并窗口（毫秒）：窗口内的 PTY chunk 合成一帧，显著降帧/降 CPU。 */
const FLUSH_INTERVAL_MS = 12
/** 待发输出超过该字符数时跳过窗口立即冲刷（防超长输出无限延迟）。 */
const FLUSH_SIZE_CHARS = 64 * 1024

/**
 * shell 集成状态：OSC 133/7 解析产物（每会话一份）。
 */
interface ShellIntegrationState {
  /** 跨 chunk 未闭合 OSC 序列的残包缓冲（≤512KB，超限丢弃；上限容纳 T 快照——200 行 tmux capture-pane 的 base64 可到数百 KB）。 */
  carry: string
  /**
   * 这个会话**见过至少一个 OSC 133 标记**（0.23.0）。tty_list 的 `running` 能不能
   * 下结论全看它：没有标记 = 命令边界不可信（非持久 SSH / fish·csh / Windows 本地 /
   * 集成被关 / tmux <3.3 吞了 DCS 信封），此时**必须报「未知」而不是「没在跑」**。
   */
  sawMark: boolean
  /** B..D 之间：命令输出捕获中。 */
  inCommand: boolean
  cmdBuffer: string
  /** T 标记带来的 pane 快照（tmux 持久标签；D 时优先于 cmdBuffer）。 */
  pendingT: string | null
  /**
   * 上一条已完成命令。`seq` 是**单调序号**（每见到一个 D 自增）：AI 辅助的失败徽标按它
   * 去重——用 `endedAt`（Date.now()）的话，同一毫秒内连跑两条命令会撞成同一条，第二条
   * 就再也弹不出徽标。
   */
  lastCommand: { output: string; exitCode: number | null; endedAt: number; seq: number } | null
  /** 命令完成序号（单调自增，见 lastCommand.seq）。 */
  cmdSeq: number
}

function createShellState(): ShellIntegrationState {
  return { carry: '', sawMark: false, inCommand: false, cmdBuffer: '', pendingT: null, lastCommand: null, cmdSeq: 0 }
}

/** OSC 133;T 的 base64 payload → utf8 文本（无效输入返回 null）。 */
function decodeBase64Utf8(payload: string | undefined): string | null {
  if (payload === undefined || payload === '') return null
  const text = Buffer.from(payload, 'base64').toString('utf8')
  return text !== '' ? text : null
}

/** OSC 7 body（file://host/path）→ 解码后的路径；解析失败返回 undefined。 */
function osc7Path(body: string): string | undefined {
  try {
    const url = new URL(body)
    if (url.protocol !== 'file:') return undefined
    const decoded = decodeURIComponent(url.pathname)
    return decoded !== '' ? decoded : undefined
  } catch {
    return undefined
  }
}

/**
 * 把一块输出喂进 shell 集成解析（cwd 跟随 + 命令边界捕获）。
 * 残包处理：尾部若有未闭合的 OSC 序列（lastIndexOf('\x1b]') 起无终结符），
 * 扣回 carry 等下一块拼齐；扣留部分不进命令捕获，避免半截序列混入。
 * 命令捕获按「标记之间的文本段」累积——B、输出、D 常在同一 chunk 到达，
 * 先处理段再翻转状态，才能把 B..D 之间的输出完整收进 lastCommand。
 */
/** 导出仅供单测（test/shell-capture.test.ts）：B/D 配对与未配对 D 的忽略语义。 */
export function feedShellIntegration(session: TtySession, text: string): void {
  const state = session.shellState
  let data = state.carry + text
  state.carry = ''
  const lastOpen = data.lastIndexOf('\x1b]')
  if (lastOpen !== -1) {
    const tail = data.slice(lastOpen)
    if (!/\x07|\x1b\\/.test(tail)) {
      // 上限按 T 快照量级（512KB）：200 行 tmux capture-pane 的 base64 可到
      // 数百 KB，64KB 装不下时会整块照常处理，残余 base64 混进命令缓冲
      if (tail.length <= 512 * 1024) {
        state.carry = tail
        data = data.slice(0, lastOpen)
      }
      // 超过上限仍不闭合视为垃圾：放弃扣留，整块照常处理
    }
  }
  for (const match of data.matchAll(OSC7_RE)) {
    const path = osc7Path(match[1])
    if (path !== undefined) session.cwd = path
  }
  OSC133_RE.lastIndex = 0
  let cursor = 0
  for (const match of data.matchAll(OSC133_RE)) {
    state.sawMark = true // 命令边界从此可信（A/B/D/T 任意一个都算）
    const segment = data.slice(cursor, match.index).replace(OSC7_RE, '')
    if (state.inCommand && segment !== '') {
      state.cmdBuffer = (state.cmdBuffer + segment).slice(-COMMAND_CAP)
    }
    const kind = match[1]
    if (kind === 'B') {
      state.inCommand = true
      state.cmdBuffer = ''
      state.pendingT = null
    } else if (kind === 'T') {
      state.pendingT = decodeBase64Utf8(match[2])
    } else if (kind === 'D') {
      if (state.inCommand) {
        const exitCode = match[2] !== undefined && /^\d+$/.test(match[2]) ? Number(match[2]) : null
        state.cmdSeq += 1
        state.lastCommand = {
          output: (state.pendingT ?? state.cmdBuffer).slice(-COMMAND_CAP),
          exitCode: exitCode !== null && Number.isFinite(exitCode) ? exitCode : null,
          endedAt: Date.now(),
          seq: state.cmdSeq,
        }
        state.inCommand = false
        state.cmdBuffer = ''
        state.pendingT = null
      }
    }
    // A（prompt 开始）无需记录
    cursor = match.index + match[0].length
  }
  if (state.inCommand) {
    const rest = data.slice(cursor).replace(OSC7_RE, '')
    if (rest !== '') state.cmdBuffer = (state.cmdBuffer + rest).slice(-COMMAND_CAP)
  }
}

/**
 * 「这个会话有没有命令在跑」的判据（0.23.0，tty_list 的 `running`）。
 *
 * 三态是刻意的：`running` **省略**表示这个会话根本没有可信的命令边界（没见过
 * OSC 133 标记），而**不是**「没在跑」。把未知报成 false 会让 agent 往一个正在
 * 跑的程序里塞命令——往 vim / apt / less 的交互提示里打字，那些字节被当输入吃掉，
 * 是要等下一次 expect 超时才发现的静默事故。
 *
 * 两条不依赖 shell 集成的确定性判据：
 *   - 进程已退出 → 没在跑（false）；
 *   - **命令型会话**（`tty_open command=` / `tty_run` / SSH 的 exec 标签）的进程
 *     **就是**那条命令 → 活着就等于在跑（true）。这里刻意不看 inCommand：命令型
 *     会话不注入 shell 集成钩子，D 标记永远不会来。
 */
function runningOf(session: TtySession): { running?: boolean; lastExitCode?: number; lastExitAt?: number } {
  const state = session.shellState
  const last = state.lastCommand
  // 「上一条已完成命令」只在标记可信时说（否则 lastCommand 永远是 null，
  // 本来也不会进这条分支；sawMark 是给「标记中途失效」留的守卫）
  const lastInfo = last === null || !state.sawMark
    ? {}
    : {
        ...(last.exitCode === null ? {} : { lastExitCode: last.exitCode }),
        lastExitAt: last.endedAt,
      }
  if (session.exited !== null) return { running: false, ...lastInfo }
  if (session.commandSession) return { running: true, ...lastInfo }
  if (!state.sawMark) return {}
  return { running: state.inCommand, ...lastInfo }
}

/**
 * 等一个命令型会话的进程结束（tty_run 用；超时返回 false，不抛错、不杀会话）。
 *
 * 为什么用 `handle.done` 而不是轮询 `session.exited`：`watchDone` 在同一 promise 上
 * **先**注册（spawn 时就挂上了），promise 回调按注册顺序跑，所以本函数的 then 一定
 * 排在 `finishSession` 之后——回来时缓冲已 force 冲刷（D76 的终局尾巴）、
 * `session.exited` 已就位。命令瞬间跑完也不会白等：done 早已 resolve，then 立刻跑。
 */
async function waitForSessionExit(session: TtySession, timeoutMs: number): Promise<boolean> {
  if (session.exited !== null) return true
  let timer: ReturnType<typeof setTimeout> | null = null
  try {
    return await Promise.race([
      session.handle.done.then(() => true, () => true),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => { resolve(false) }, timeoutMs)
      }),
    ])
  } finally {
    if (timer !== null) clearTimeout(timer)
  }
}

/* ------------------------------------------------------------------ *
 * AI 辅助「失败即解释」（0.24.0）
 * ------------------------------------------------------------------ */

/**
 * 宿主 llm 服务的流式块（只声明本插件用到的字段，其余块忽略）。
 *
 * ⚠️ **finish 块的权威形状是 `{ type:'finish', reason: FinishReason }`**，而 FinishReason
 * 是**以 `kind` 为判别式**的联合——也就是 `kind` 与 `failure` 都在 `reason` **里面**，
 * 不在块的顶层。rss 曾经把这两个字段声明在顶层，于是**每一次成功**都被判成「终止原因
 * unknown」，AI 摘要 100% 失败而单测全绿（假 llm 照着同一个错形状造数据）。这里照抄它
 * 修好后的形状。
 */
interface LlmStreamChunk {
  type?: string
  text?: string
  reason?: { kind?: string; failure?: { message?: string; code?: string } }
  [key: string]: unknown
}

/**
 * 宿主 llm 服务的最小结构（cordis Context 上的 llm 服务）。
 *
 * ⚠️ `messages[].content` 必须是 **ContentBlock[]**（`[{ type:'text', text }]`），不是
 * 字符串：字符串会在下游 `contentHasImage(content)` 之类对 content 调 `.some(...)`
 * 的地方炸成 `content.some is not a function`（rss 踩过，表现是每条都失败）。
 */
interface LlmLike {
  stream(options: {
    provider: string
    model: string
    system?: string
    messages: Array<{ role: 'user'; content: Array<{ type: 'text'; text: string }> }>
    maxTokens?: number
    temperature?: number
    signal?: AbortSignal
  }): AsyncIterable<LlmStreamChunk>
  /**
   * 已注册的 provider 路由（设置卡片里 provider 栏的候选）。**可选**：宿主没装 llm 服务、
   * 或该版本没有这个方法时就是「没有候选」，卡片里的输入框照旧手输。
   */
  listProviders?: () => unknown
  /**
   * 某个 provider 广告的模型（model 栏的候选）。**可选**，且**可能空**。
   *
   * 契约见 dsh-llm 的注释：目录只是**建议**——核心路由接受未列出的 model id，
   * 「基础空目录、不提供 GUI 选择」是合法状态。所以这里永远不许把空候选当成错误。
   */
  listModels?: (provider: string) => Promise<unknown>
}

/** 一次解释请求的超时（毫秒）。用户正盯着屏幕等，30s 是「还能忍」的上限。 */
const ASSIST_TIMEOUT_MS = 30_000
/**
 * 解释请求的 maxTokens。
 *
 * 取 4096 是 rss 的**真机实测拐点**（见 packages/rss/src/index.ts 的长注释）：推理模型
 * 与最终答案**共享**这个预算，200 / 1024 都会让一部分请求死在 `max-tokens` 上，4096
 * 才既容得下推理开销又不至于把整轮拖过超时。
 */
const ASSIST_MAX_TOKENS = 4096
/**
 * 取模型候选的超时（毫秒）。
 *
 * 比一次解释请求短得多是**故意**的：候选只是输入框旁边的建议，等不到就该让用户直接手输；
 * 而远端目录一慢（有的适配器要去问服务端点）会把整张设置卡片吊住，那种「打开设置像卡死」
 * 比「没有候选」糟得多。
 */
const MODEL_CATALOG_TIMEOUT_MS = 6_000

/**
 * 解析模型路由：显式配置对 > 宿主默认模型（服务 agentDefaultModel，兼容 currentSelection）
 * > settings 的 agent-default-model 命名空间；全拿不到返回 error（**不是** null —— 界面要
 * 一句能照做的原因，而不是一个「点了没反应」的徽标）。
 *
 * 与 rss 的 resolveAiRoute 同构，但多一条**成对规则**的显式报错：只填一个时既不生效、
 * 也不该静默回落到宿主默认（用户以为自己配了，实际走的是别的模型）。
 */
export function resolveAssistRoute(ctx: Context, provider: string, model: string): { route?: { provider: string; model: string }; error?: string } {
  const p = provider.trim()
  const m = model.trim()
  if (p !== '' && m !== '') return { route: { provider: p, model: m } }
  if (p !== '' || m !== '') {
    return { error: 'provider 与 model 需要成对填写（只填一个不生效）：补齐另一个，或两个都清空以跟随宿主默认模型' }
  }
  try {
    const defaultModel = getService(ctx, 'agentDefaultModel') as { source?: () => unknown; currentSelection?: () => unknown } | undefined
    const read = typeof defaultModel?.source === 'function'
      ? defaultModel.source
      : typeof defaultModel?.currentSelection === 'function'
        ? defaultModel.currentSelection
        : undefined
    if (read !== undefined) {
      const picked = pickRoute(read.call(defaultModel))
      if (picked !== null) return { route: picked }
    }
    const settings = getService(ctx, 'settings') as { get?: (ns: string) => unknown } | undefined
    if (typeof settings?.get === 'function') {
      const picked = pickRoute(settings.get('agent-default-model'))
      if (picked !== null) return { route: picked }
    }
  } catch {
    /* 服务异常 / 命名空间未注册（get 抛 TypeError）：当作解析不到，如实回报 */
  }
  return { error: '没有可用的模型路由：在卡片里填 provider / model，或先给宿主配一个默认模型' }
}

/**
 * 一次性调用宿主 llm 服务：收集 text-delta 直到 finish（导出仅供单测，照 rss 的
 * callAiSummary 先例——只测假件的话，「忘了在路由里调用它」这种回归一条都拦不住，
 * 而 finish 块的形状错误又恰好是 rss 踩过的坑）。
 */
export async function askModelOnce(llm: LlmLike, route: { provider: string; model: string }, prompt: { system: string; user: string }, timeoutMs: number = ASSIST_TIMEOUT_MS): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  timer.unref?.()
  let text = ''
  let finishKind: string | undefined
  let finishMessage: string | undefined
  try {
    for await (const chunk of llm.stream({
      provider: route.provider,
      model: route.model,
      system: prompt.system,
      // content 必须是 ContentBlock[]（字符串会在下游 .some(...) 上炸）
      messages: [{ role: 'user', content: [{ type: 'text', text: prompt.user }] }],
      maxTokens: ASSIST_MAX_TOKENS,
      temperature: 0.2,
      signal: controller.signal,
    })) {
      if (chunk.type === 'text-delta' && typeof chunk.text === 'string') {
        text += chunk.text
      } else if (chunk.type === 'finish') {
        // kind / failure 在 reason **里面**（顶层读它们会把每次成功都判成 unknown）
        const reason = chunk.reason
        finishKind = typeof reason?.kind === 'string' ? reason.kind : 'unknown'
        finishMessage = reason?.failure?.message
      }
    }
  } catch (error) {
    // 主动 abort 视作超时；其余错误原样抛出（provider 报的错比「请求失败」有用得多）
    if (controller.signal.aborted) throw new Error('请求超时（' + String(timeoutMs) + 'ms）')
    throw error instanceof Error ? error : new Error(String(error))
  } finally {
    clearTimeout(timer)
  }
  if (finishKind === undefined) throw new Error('模型未返回终止标记')
  if (finishKind !== 'stop') {
    if (finishKind === 'max-tokens') {
      // 最容易被误读成「provider 坏了」的一档：把「该调什么」直接写进原因里
      throw new Error('输出被 maxTokens=' + String(ASSIST_MAX_TOKENS) + ' 截断（推理模型会先消耗推理 token）：换一个更轻的模型，或把上面的路由指向非推理模型')
    }
    throw new Error(finishMessage !== undefined ? finishKind + ': ' + finishMessage : '终止原因 ' + finishKind)
  }
  const answer = text.trim()
  if (answer === '') throw new Error('模型返回了空答案')
  return answer
}

/** 从任意值里取 provider/model 对；不完整返回 null（与 rss 的 pickRoute 同构）。 */
function pickRoute(value: unknown): { provider: string; model: string } | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as { provider?: unknown; model?: unknown }
  const provider = typeof record.provider === 'string' ? record.provider.trim() : ''
  const model = typeof record.model === 'string' ? record.model.trim() : ''
  return provider !== '' && model !== '' ? { provider, model } : null
}

/**
 * 模型候选目录（设置卡片 provider / model 两栏的候选列表）。
 *
 * ⚠️ 目录是**建议**、不是白名单：dsh-llm 明写「核心路由接受未列出的 model id」，而
 * 「基础空目录」是**合法**状态（那种适配器压根不提供 GUI 选择）。所以下面每一条失败路径
 * 都收敛成**空候选**——卡片里的输入框照旧可以手输，绝不因为「取不到候选」把人锁死。
 */

/** 把目录项归一成 { id, name }：丢掉没有 id 的、按 id 去重（远端目录会重复）。 */
function normalizeCatalogEntries(raw: unknown): Array<{ id: string; name: string }> {
  if (!Array.isArray(raw)) return []
  const out: Array<{ id: string; name: string }> = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue
    const record = item as { id?: unknown; name?: unknown }
    const id = typeof record.id === 'string' ? record.id.trim() : ''
    if (id === '' || seen.has(id)) continue
    seen.add(id)
    const name = typeof record.name === 'string' && record.name.trim() !== '' ? record.name.trim() : id
    out.push({ id, name })
  }
  return out
}

/** 已注册的 provider 路由；服务没有这个方法、或抛错，都只当「没有候选」。导出仅供单测。 */
export function listProvidersOf(llm: unknown): Array<{ id: string; name: string }> {
  try {
    const fn = (llm as { listProviders?: unknown } | null | undefined)?.listProviders
    if (typeof fn !== 'function') return []
    return normalizeCatalogEntries((fn as () => unknown).call(llm))
  } catch {
    return []
  }
}

/**
 * 某个 provider 广告的模型。
 *
 * **必须有超时**：适配器是拿远端目录喂这个方法的（pi-ai 那一族会去问服务端点），网络一慢
 * 就会把设置卡片吊住——而候选只是「建议」，等不到就该立刻放弃、让用户直接手输。
 */
export async function listModelsOf(llm: unknown, provider: string, timeoutMs: number = MODEL_CATALOG_TIMEOUT_MS): Promise<Array<{ id: string; name: string }>> {
  try {
    const fn = (llm as { listModels?: unknown } | null | undefined)?.listModels
    if (typeof fn !== 'function') return []
    const pending = Promise.resolve((fn as (name: string) => unknown).call(llm, provider))
    return normalizeCatalogEntries(await withSoftTimeout(pending, timeoutMs))
  } catch {
    return []
  }
}

/**
 * 每个 provider 的模型**并行**取回来，给「一个控件同时选渠道 + 模型」的候选表用。
 *
 * 判据同 listModelsOf：拿不到就是空数组——**一个 provider 坏掉不许把整张候选表清空**，
 * 用户至少还能从别的渠道里选。并行 + 每个自带软超时，所以总时长仍被一次超时界住。
 */
export async function listGroupsOf(llm: unknown, providers: Array<{ id: string; name: string }>): Promise<Array<{ id: string; name: string; models: Array<{ id: string; name: string }> }>> {
  return await Promise.all(providers.map(async (item) => ({
    id: item.id,
    name: item.name,
    models: await listModelsOf(llm, item.id),
  })))
}

/** 到点就放弃（原 promise 继续跑，结果丢弃）：只给「建议」类查询用，绝不让 UI 等网络。 */
function withSoftTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('catalog timeout')), ms)
    timer.unref?.()
    void promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error instanceof Error ? error : new Error(String(error)))
      },
    )
  })
}

/**
 * 虚拟屏的可见文本：每行去尾空格、去掉末尾空行（屏幕末尾的提示符行才是有效区）。
 *
 * 与 `tty_screen` 工具共用同一份实现——「屏幕上是什么」只能有一个答案，两处各写一份
 * 迟早会漂（一处按 rows 遍历、一处按 buffer 长度遍历，就差出去了）。
 */
function screenTextOf(screen: HeadlessTerminal): string {
  const buffer = screen.buffer.active
  const lines: string[] = []
  for (let row = 0; row < screen.rows; row++) {
    lines.push(buffer.getLine(row)?.translateToString(true) ?? '')
  }
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop()
  return lines.join('\n')
}

/* ------------------------------------------------------------------ *
 * agent 已读水位线（D72）
 *
 * 症状：`tty_expect` 此前只看**注册之后**到达的输出（`acc` 从空开始 + 只挂
 * data 监听），于是「命令瞬间就跑完」这条最常见路径必然等满超时——要等的
 * 标记早就落在 `session.buffer` 里，`acc` 里却永远没有它，返回的还是**空
 * 文本**（看起来像命令没执行）。而插件推荐的流程正是
 * `tty_send → tty_expect → tty_capture{last}`，所以这不是边缘 case。
 *
 * 修法分两层：① 注册时先拿「上一条命令」的完整输出试一次（B..D 窗口，
 * 无回显、无提示符、自带退出码）；② 泛化到「水位线之后的未读缓冲」，覆盖
 * 长驻输出、shell 集成关闭等情形。两层都只碰**还没被读过**的输出，所以
 * 不会把 AI 已经看过的旧匹配翻出来误报。
 * ------------------------------------------------------------------ */

/** tty_expect 的返回值（D72 起带 matchedFrom：匹配是回溯到的还是本次等待期间新产生的）。 */
interface ExpectResult {
  matched: boolean
  timedOut: boolean
  text: string
  exitCode?: number
  matchedFrom?: 'live' | 'last' | 'buffered'
  /** D75：没匹配到，但 pattern **只**命中过「刚发进去的命令回显」——命令多半根本没执行。 */
  echoOnly?: boolean
  /** D77：会话的进程已退出（只读保留）——不会再有新输出，这一轮是按现存输出结算的。 */
  exited?: boolean
}

/**
 * 唯一追加点（D72）：环形缓冲与单调字符计数一起维护。水位线用绝对值定位
 * 未读区（`buffer 起点 = outputSeq - buffer.length`，裁剪只会前移起点，
 * 公式恒成立），漏掉任何一处追加都会让它错位——notice 注入那两处此前也是
 * 各写各的 `tailFromSafeBoundary`。
 */
function appendOutput(session: TtySession, text: string): void {
  session.outputSeq += text.length
  session.buffer = tailFromSafeBoundary(session.buffer + text, BUFFER_CAP)
}

/** 原始流里最后一个「命令开始」B 标记的结束位置；-1 = 窗口内没有（无 shell 集成 → 降级）。 */
function lastCommandStart(text: string): number {
  OSC133_RE.lastIndex = 0
  let end = -1
  for (const match of text.matchAll(OSC133_RE)) {
    if (match[1] === 'B') end = (match.index ?? 0) + match[0].length
  }
  OSC133_RE.lastIndex = 0 // 归位：这个正则是共用的（feedShellIntegration 也用它）
  return end
}

/** 首次被 agent 工具触达时把水位线落在当下——否则第一次回扫会把用户此前的历史输出当成「还没读过」。 */
function ensureReadMark(session: TtySession): void {
  if (session.readSeq >= 0) return
  session.readSeq = session.outputSeq
  session.readMarkAt = Date.now()
}

/** 读侧工具返回前推进水位线：返回时刻 = 「AI 真正看到的内容」的上界。 */
function advanceReadMark(session: TtySession): void {
  session.readSeq = session.outputSeq
  session.readMarkAt = Date.now()
}

/**
 * 水位线之后的**未读**原始输出。下界再抬到「最后一个 B 标记之后」：回显落在
 * A（prompt 开始）与 B（命令开始）之间，所以这样能零启发式地排除回显——按
 * 文本比对「跳过与发送内容相同的行」会被折行 / ANSI / 多行粘贴打碎。
 * 没有 B 标记（未开 shell 集成 / Windows PowerShell / 远端未装集成）时无法按边界切片：
 * D75 起改用「最近提交过的输入」这份回显候选把回显行从匹配窗口里剔掉（见 echoOnlyMatch），
 * 不再直接拿回显当命中。
 */
function unreadRegion(session: TtySession): string {
  ensureReadMark(session)
  const bufferStart = session.outputSeq - session.buffer.length
  const text = session.buffer.slice(Math.max(0, session.readSeq - bufferStart))
  const start = lastCommandStart(text)
  return start === -1 ? text : text.slice(start)
}

/**
 * pattern 匹配的统一入口（D72）：先对含 ANSI 的原始流试（live 路径原语义），
 * 未命中再对清洗后文本试一次——这样承诺才是「tty_capture 里看得到的，
 * tty_expect 也能匹配到」，而不是回扫命中、返回文案里却看不到。
 */
function testPattern(re: RegExp, text: string): boolean {
  re.lastIndex = 0
  if (re.test(text)) return true
  re.lastIndex = 0
  return re.test(cleanAnsiTail(text))
}

/* ------------------------------------------------------------------ *
 * 回显命中剔除（D75）
 *
 * 症状：`tty_expect` 会命中**命令回显本身**——命令还没执行（Windows 上裸 LF 不提交，
 * 见 D74；或只是被 shell 集成之外的环境回显），`tty_send` 写进去的那行文本先回到了
 * 输出流里，于是「等就绪标记」立刻返回 matched。报告侧的现场：LF 没提交、命令一次
 * 都没跑，`tty_expect pattern="echo ECHO_DEMO_2"` 秒回 matched（来源标注 buffered）。
 *
 * 判据（不动 B 标记那条零启发式路径，只补它够不着的场景）：把**最近提交过的命令行**
 * 从候选文本里削掉再试一次，只有「削掉后不再命中」才算纯回显。这样：
 *   - 真实输出里也出现的标记照旧命中（不误杀）；
 *   - 只在回显行**末尾**匹配才削（cmd 的回显与提示符同行，所以按行尾切）；
 *   - 有 B 标记 / 命令正在跑（TUI 全屏重画里出现输入文本是正常输出）时不启用。
 * ------------------------------------------------------------------ */

/** 回显候选的行数上限（最近几条提交的输入）与单行长度上限。 */
const ECHO_INPUT_CAP = 8
const ECHO_LINE_CAP = 512

/**
 * 记录一次「提交过的输入」的回显候选（只在 `tty_send` 且带行尾时调用）：
 * 单键按键（TUI 的 `q` / 方向键）不是命令行，不记——否则一个 `q` 就能把
 * 之后任何只匹配到 `q` 的等待吞掉。
 */
function noteSubmittedInput(session: TtySession, data: string): void {
  if (!/[\r\n]/.test(data)) return
  const lines = data
    .split(/\r\n|\r|\n/)
    .map((line) => line.trim())
    // 控制字符（多为转义序列，如 `vim` 的 `\x1b:wq`）不做行编辑模拟，直接不记
    .filter((line) => line !== '' && line.length <= ECHO_LINE_CAP && !/[\x00-\x1f\x7f]/.test(line))
  if (lines.length === 0) return
  session.recentInputs = [...session.recentInputs, ...lines].slice(-ECHO_INPUT_CAP)
}

/**
 * 这批回显候选在当前现场是否该启用剔除。三条都得成立：
 *   - 有候选（没 `tty_send` 过就无从判断，保持原语义）；
 *   - 命令没在跑（`inCommand`：TUI 重画 / 长任务把输入文本画到屏上是真实输出）；
 *   - 候选文本里没有 B 标记（有 B 就说明 shell 集成在管边界，回显已被切掉）。
 */
function echoStrippable(session: TtySession, text: string): boolean {
  if (session.recentInputs.length === 0) return false
  if (session.shellState.inCommand) return false
  return lastCommandStart(text) === -1
}

/**
 * 把回显候选行从文本里削掉（保行结构）。按**行尾**匹配：cmd 的回显与提示符同行
 * （`C:\>echo X`），所以只削后缀、保留提示符前缀。行尾空白（含 `\r`）先归一。
 */
function stripEchoLines(text: string, echoes: string[]): string {
  if (echoes.length === 0) return text
  const sorted = [...echoes].sort((a, b) => b.length - a.length)
  return text
    .split('\n')
    .map((line) => {
      const trimmed = line.replace(/[ \t\r]+$/, '')
      for (const echo of sorted) {
        if (trimmed.endsWith(echo)) return trimmed.slice(0, trimmed.length - echo.length)
      }
      return line
    })
    .join('\n')
}

/**
 * 命中是否**只**落在回显上（纯回显 → 不算命中）。
 * 原始流与清洗后文本各削一次：回显行里可能夹着 ANSI（zsh 的 zle / 彩色提示符）。
 */
function echoOnlyMatch(re: RegExp, text: string, session: TtySession): boolean {
  if (!echoStrippable(session, text)) return false
  const stripped = stripEchoLines(text, session.recentInputs)
  const strippedClean = stripEchoLines(cleanAnsiTail(text), session.recentInputs)
  return !testPattern(re, stripped) && !testPattern(re, strippedClean)
}

/** 宽松清洗一份 tunnels 输入；输入不是数组时返回 undefined（表示「未提供，保持原值」）。 */
function sanitizeTunnels(input: unknown): TunnelSpec[] | undefined {
  if (!Array.isArray(input)) return undefined
  const out: TunnelSpec[] = []
  for (const item of input) {
    if (typeof item !== 'object' || item === null) continue
    const raw = item as Record<string, unknown>
    if (typeof raw.name !== 'string' || raw.name.trim() === '') continue
    if (typeof raw.bookName !== 'string' || raw.bookName.trim() === '') continue
    const num = (value: unknown): number => {
      const n = Number(value)
      return Number.isInteger(n) && n >= 1 && n <= 65535 ? n : 0
    }
    out.push({
      name: raw.name.trim(),
      bookName: raw.bookName.trim(),
      direction: raw.direction === 'remote' ? 'remote' : 'local',
      localPort: num(raw.localPort),
      remoteHost: typeof raw.remoteHost === 'string' ? raw.remoteHost.trim() : '',
      remotePort: num(raw.remotePort),
      localTargetHost: typeof raw.localTargetHost === 'string' ? raw.localTargetHost.trim() : '',
      localTargetPort: num(raw.localTargetPort),
      enabled: raw.enabled !== false,
    })
  }
  return out
}

/** 严格校验 tunnels（HTTP POST 路径）；bookNames 为同次提交（或现有）的连接簿名字集合。 */
function validateTunnels(input: unknown, bookNames: Set<string>): { tunnels?: TunnelSpec[]; error?: string } {
  if (!Array.isArray(input)) return { error: 'tunnels 必须是数组' }
  const names = new Set<string>()
  for (const item of input) {
    if (typeof item !== 'object' || item === null) return { error: 'tunnels 条目必须是对象' }
    const raw = item as Record<string, unknown>
    if (typeof raw.name !== 'string' || raw.name.trim() === '') return { error: 'tunnels.name 必须是非空字符串' }
    const name = raw.name.trim()
    if (names.has(name)) return { error: `tunnels.name 重复: ${name}` }
    names.add(name)
    if (typeof raw.bookName !== 'string' || raw.bookName.trim() === '') return { error: `tunnels「${name}」bookName 必须是非空字符串` }
    if (!bookNames.has(raw.bookName.trim())) return { error: `tunnels「${name}」引用的连接簿条目不存在: ${String(raw.bookName)}` }
    const direction = raw.direction === 'remote' ? 'remote' : 'local'
    const intIn = (value: unknown): number | null => {
      const n = Number(value)
      return Number.isInteger(n) && n >= 1 && n <= 65535 ? n : null
    }
    if (direction === 'local') {
      if (intIn(raw.localPort) === null) return { error: `tunnels「${name}」local 方向需要 localPort（1~65535）` }
      if (typeof raw.remoteHost !== 'string' || raw.remoteHost.trim() === '') return { error: `tunnels「${name}」local 方向需要 remoteHost` }
      if (intIn(raw.remotePort) === null) return { error: `tunnels「${name}」local 方向需要 remotePort（1~65535）` }
    } else {
      if (intIn(raw.remotePort) === null) return { error: `tunnels「${name}」remote 方向需要 remotePort（服务端监听端口 1~65535）` }
      if (intIn(raw.localTargetPort) === null) return { error: `tunnels「${name}」remote 方向需要 localTargetPort（1~65535）` }
      if (raw.remoteHost !== undefined && typeof raw.remoteHost !== 'string') return { error: `tunnels「${name}」remoteHost 必须是字符串` }
      if (raw.localTargetHost !== undefined && typeof raw.localTargetHost !== 'string') return { error: `tunnels「${name}」localTargetHost 必须是字符串` }
    }
    if (raw.enabled !== undefined && typeof raw.enabled !== 'boolean') return { error: `tunnels「${name}」enabled 必须是布尔值` }
  }
  return { tunnels: sanitizeTunnels(input) }
}

/**
 * 宽松清洗一份 sshHosts 输入（settings 存储/热更新事件路径）：
 * 不合法条目直接丢弃；输入不是数组时返回 undefined（表示「未提供，保持原值」）。
 */
function sanitizeSshHosts(input: unknown): SshHostEntry[] | undefined {
  if (!Array.isArray(input)) return undefined
  const out: SshHostEntry[] = []
  for (const item of input) {
    if (typeof item !== 'object' || item === null) continue
    const raw = item as Record<string, unknown>
    if (typeof raw.name !== 'string' || raw.name.trim() === '') continue
    if (typeof raw.host !== 'string' || raw.host.trim() === '') continue
    if (typeof raw.username !== 'string' || raw.username.trim() === '') continue
    const port = Number(raw.port)
    out.push({
      name: raw.name.trim(),
      host: raw.host.trim(),
      port: Number.isInteger(port) && port >= 1 && port <= 65535 ? port : 22,
      username: raw.username.trim(),
      auth: raw.auth === 'key' || raw.auth === 'password' ? raw.auth : 'agent',
      keyPath: typeof raw.keyPath === 'string' ? raw.keyPath : '',
      passphrase: typeof raw.passphrase === 'string' ? raw.passphrase : '',
      password: typeof raw.password === 'string' ? raw.password : '',
      agentForward: raw.agentForward === true,
      persist: raw.persist === true,
    })
    // 跳板机：清洗不出可用对象（host 为空）就当没配——不给下游留半个对象
    const jump = sanitizeJumpSpec(raw.jump)
    if (jump !== undefined) out[out.length - 1].jump = jump
    // 代理命令：形状不合法（含换行 / 超长 / 非字符串）就当没配（**失败方向是关**）
    const proxyCommand = sanitizeProxyCommand(raw.proxyCommand)
    if (proxyCommand !== undefined) out[out.length - 1].proxyCommand = proxyCommand
  }
  return out
}

/** 严格校验一份 sshHosts 输入（HTTP POST 路径）；返回错误信息或清洗后的数组。 */
function validateSshHosts(input: unknown): { hosts?: SshHostEntry[]; error?: string } {
  if (!Array.isArray(input)) return { error: 'sshHosts 必须是数组' }
  const names = new Set<string>()
  for (const item of input) {
    if (typeof item !== 'object' || item === null) return { error: 'sshHosts 条目必须是对象' }
    const raw = item as Record<string, unknown>
    for (const key of ['name', 'host', 'username'] as const) {
      if (typeof raw[key] !== 'string' || (raw[key] as string).trim() === '') return { error: `sshHosts.${key} 必须是非空字符串` }
    }
    if (names.has((raw.name as string).trim())) return { error: `sshHosts.name 重复: ${String(raw.name)}` }
    names.add((raw.name as string).trim())
    if (raw.port !== undefined) {
      const port = Number(raw.port)
      if (!Number.isInteger(port) || port < 1 || port > 65535) return { error: 'sshHosts.port 必须是 1~65535 的整数' }
    }
    if (raw.auth !== undefined && raw.auth !== 'agent' && raw.auth !== 'key' && raw.auth !== 'password') {
      return { error: 'sshHosts.auth 必须是 agent / key / password' }
    }
    for (const key of ['keyPath', 'passphrase', 'password'] as const) {
      if (raw[key] !== undefined && typeof raw[key] !== 'string') return { error: `sshHosts.${key} 必须是字符串` }
    }
    if (raw.agentForward !== undefined && typeof raw.agentForward !== 'boolean') {
      return { error: 'sshHosts.agentForward 必须是布尔值' }
    }
    if (raw.persist !== undefined && typeof raw.persist !== 'boolean') {
      return { error: 'sshHosts.persist 必须是布尔值' }
    }
    if ((raw.auth === 'key') && (typeof raw.keyPath !== 'string' || raw.keyPath.trim() === '')) {
      return { error: `sshHosts「${String(raw.name)}」auth=key 需要 keyPath` }
    }
    if (raw.jump !== undefined) {
      const checked = validateJumpSpec(raw.jump)
      if (checked.error !== undefined) return { error: `sshHosts「${String(raw.name)}」${checked.error}` }
    }
    if (raw.proxyCommand !== undefined) {
      const checked = validateProxyCommand(raw.proxyCommand)
      if (checked.error !== undefined) return { error: `sshHosts「${String(raw.name)}」${checked.error}` }
    }
  }
  return { hosts: sanitizeSshHosts(input) }
}

/** 单个 host:port 保留的指纹上限（与 known-hosts.ts / ssh.ts 的 TOFU 集合同参数）。 */
const MAX_FINGERPRINTS_PER_HOST = 8

/** 归集一条输入里的指纹（新 fingerprints 数组 + 旧版单指纹字段都收），去重保序。 */
function collectFingerprints(raw: Record<string, unknown>): string[] {
  const out: string[] = []
  const push = (value: unknown): void => {
    if (typeof value !== 'string') return
    const trimmed = value.trim()
    if (trimmed === '' || trimmed.length > 256 || out.includes(trimmed)) return
    out.push(trimmed)
  }
  push(raw.fingerprint) // 旧版单指纹字段：兼容迁移
  if (Array.isArray(raw.fingerprints)) for (const fp of raw.fingerprints) push(fp)
  return out
}

/**
 * 宽松清洗一份 hostKeys 输入；输入不是数组时返回 undefined（表示「未提供，
 * 保持原值」）。0.19.0 起一机多指纹：同 host:port 的多条合并为一条
 * （fingerprints 取并集，上限 8）；旧版 `{fingerprint}` 单指纹条目迁移读取。
 */
function sanitizeHostKeys(input: unknown): HostKeyRecord[] | undefined {
  if (!Array.isArray(input)) return undefined
  const byKey = new Map<string, HostKeyRecord>()
  for (const item of input) {
    if (typeof item !== 'object' || item === null) continue
    const raw = item as Record<string, unknown>
    if (typeof raw.host !== 'string' || raw.host.trim() === '') continue
    const fps = collectFingerprints(raw)
    if (fps.length === 0) continue
    const host = raw.host.trim().toLowerCase()
    const portNum = Number(raw.port)
    const port = Number.isInteger(portNum) && portNum >= 1 && portNum <= 65535 ? portNum : 22
    const key = `${host}:${port}`
    const existing = byKey.get(key)
    if (existing === undefined) {
      byKey.set(key, { host, port, fingerprints: fps.slice(0, MAX_FINGERPRINTS_PER_HOST) })
      continue
    }
    for (const fp of fps) {
      if (!existing.fingerprints.includes(fp) && existing.fingerprints.length < MAX_FINGERPRINTS_PER_HOST) existing.fingerprints.push(fp)
    }
  }
  return [...byKey.values()]
}

/** 清洗一份 sftpLimits 输入：每项取 0~上限 的整数（0 = 不限），缺省回落默认值。 */
function sanitizeSftpLimits(input: Partial<SftpLimits> | undefined): Required<SftpLimits> {
  const num = (value: unknown, fallback: number, max: number): number => {
    const n = Number(value)
    return Number.isInteger(n) && n >= 0 && n <= max ? n : fallback
  }
  return {
    maxDownloadMb: num(input?.maxDownloadMb, DEFAULT_SFTP_LIMITS.maxDownloadMb, 1024 * 1024),
    maxUploadMb: num(input?.maxUploadMb, DEFAULT_SFTP_LIMITS.maxUploadMb, 1024 * 1024),
    maxUploadFiles: num(input?.maxUploadFiles, DEFAULT_SFTP_LIMITS.maxUploadFiles, 100000),
  }
}

/** 严格校验一份 hostKeys 输入（HTTP POST 路径）；返回错误信息或清洗后的数组。
 *  同 host:port 允许出现多条（清洗时合并为一条的多指纹集合，见 sanitizeHostKeys）。 */
function validateHostKeys(input: unknown): { keys?: HostKeyRecord[]; error?: string } {
  if (!Array.isArray(input)) return { error: 'hostKeys 必须是数组' }
  for (const item of input) {
    if (typeof item !== 'object' || item === null) return { error: 'hostKeys 条目必须是对象' }
    const raw = item as Record<string, unknown>
    if (typeof raw.host !== 'string' || raw.host.trim() === '') return { error: 'hostKeys.host 必须是非空字符串' }
    if (collectFingerprints(raw).length === 0) return { error: 'hostKeys 条目需要 fingerprint(s)（至少一个非空指纹）' }
    const port = Number(raw.port ?? 22)
    if (!Number.isInteger(port) || port < 1 || port > 65535) return { error: 'hostKeys.port 必须是 1~65535 的整数' }
  }
  return { keys: sanitizeHostKeys(input) }
}

/** 宽松清洗一份 persistSessions（内部状态：SSH 持久会话名）；非法条目丢弃。 */
function sanitizePersistSessions(input: unknown): string[] | undefined {
  if (!Array.isArray(input)) return undefined
  const out: string[] = []
  for (const item of input) {
    if (typeof item !== 'object' || item === null) continue
    const name = (item as Record<string, unknown>).tmuxName
    if (typeof name === 'string' && /^dsh-[A-Za-z0-9_-]{1,64}$/.test(name) && !out.includes(name)) out.push(name)
  }
  return out
}

/**
 * TOFU 主机指纹存储：get/record 面向 spawnSsh 的 hostVerifier；
 * record 时经 persist 回调写入 settings（宿主重启后钉扎仍在）。
 */
class HostKeyStore {
  constructor(
    private readonly live: LiveConfig,
    private readonly persist: (records: HostKeyRecord[]) => void,
  ) {}

  private key(host: string, port: number): string {
    return `${host.trim().toLowerCase()}:${port}`
  }

  get(host: string, port: number): string[] | undefined {
    const key = this.key(host, port)
    const record = this.live.hostKeys.find((record) => `${record.host}:${record.port}` === key)
    return record !== undefined && record.fingerprints.length > 0 ? record.fingerprints : undefined
  }

  /** 记录指纹：同 host:port 已有记录则并入集合（一机多把钥匙），否则新建。 */
  record(host: string, port: number, fingerprint: string): void {
    const key = this.key(host, port)
    const existing = this.live.hostKeys.find((record) => `${record.host}:${record.port}` === key)
    if (existing !== undefined) {
      if (!existing.fingerprints.includes(fingerprint)) {
        if (existing.fingerprints.length >= MAX_FINGERPRINTS_PER_HOST) existing.fingerprints.shift()
        existing.fingerprints.push(fingerprint)
      }
      this.persist(this.live.hostKeys)
      return
    }
    const next = [...this.live.hostKeys, { host: host.trim().toLowerCase(), port, fingerprints: [fingerprint] }]
    this.live.hostKeys = next
    this.persist(next)
  }
}

/**
 * upgrade 路由的 loopback 信任围栏（socket 版）：直接用 kit 的加固档（docker D31/D80/D110）。
 *
 * 与 HTTP 路由的差别只有一处刻意为之：**不放开 Cookie 例外**。升级请求在浏览器里必带
 * `Origin`，而加固档「Origin 有就必须与 Host 同源」这条已经等价于同源证明；而长连
 * （PTY / 隧道帧）一旦建立就一直活着，没必要为桌面壳那种「只带 Cookie」的转发链开口子
 * ——真要支持，也应该先在桌面壳上验一条真机链路（docker 的 D139 是那样定下来的）。
 */
function isLoopbackUpgrade(req: ReqLike): boolean | Promise<boolean> {
  return isLoopbackRequestStrict(req)
}

/* ------------------------------------------------------------------ *
 * 虚拟屏（xterm-headless）——构造与异常兜底（D57）
 * ------------------------------------------------------------------ */

/**
 * 虚拟屏的 scrollback 余量（D57）。
 *
 * **不能是 0。** xterm 的 `Buffer` 在 `scrollback: 0` 时把 `lines.maxLength` 压成
 * `rows`，但 normal buffer 的 `_hasScrollback` 仍是 true（reflow 照常开启）：输出与
 * resize（列宽变化触发 reflow）交错时，`lines` 会短于 `ybase + y`，于是
 * `lineFeed()` 里 `lines.get(ybase + y).isWrapped = false` 命中 `undefined` →
 * 未捕获 `TypeError: Cannot set properties of undefined (setting 'isWrapped')`。
 *
 * 该异常抛在 `WriteBuffer._innerWrite` 的 `setTimeout` 回调里，写入路径的同步
 * try/catch 结构性拦不住，会直接打死整个宿主进程（线上 `last-failure-web.log`
 * 的堆栈即此）。
 *
 * 关键在 `lines.maxLength`（= rows + scrollback）：`BufferService.scroll` 只在「没满」时
 * 才 `lines.push` + `ybase++`（成对）。`scrollback: 0` 把 maxLength 钉死成 rows，
 * 一旦有别的路径把 `ybase` 顶上去（resize 收缩 / reflow），`lines` 长度就再也追不上，
 * `ybase + y + 1` 越界只是时间问题。留 1 行余量（maxLength = rows + 1）即维持住成对增长：
 * 同一最小序列 `scrollback: 0` 崩 5/5，`scrollback: 1` 崩 0/5；700 块随机屏压测里
 * `ybase` 涨到 16 也没再出现越界（见 test/screen-crash.test.ts）。
 *
 * 余量不影响 `tty_screen` 读数——它走 `buffer.getLine(row)`（内部 `ybase + row`，
 * 即视口），多出来的行只在回滚区，不进读数。
 */
export const SCREEN_SCROLLBACK = 1

/**
 * 建一块虚拟屏（`tty_screen` 的数据源）；失败降级为 null。
 *
 * 导出仅供单测（test/screen-crash.test.ts）钉住构造参数——生产路径是
 * `SessionManager.createScreen`，它必须与这里同源（就一行委托）。
 */
export function createHeadlessScreen(cols: number, rows: number): HeadlessTerminal | null {
  try {
    // buffer 命名空间在 xterm 5.x 是提案 API，必须开 allowProposedApi
    return new HeadlessTerminal({ cols, rows, scrollback: SCREEN_SCROLLBACK, allowProposedApi: true })
  } catch {
    return null
  }
}

/** xterm-headless 的异常都带这个文件名（压缩产物的堆栈里也是它）。 */
const XTERM_SCREEN_CRASH_RE = /xterm-headless|@xterm\/headless/

/** 累计吞掉的虚拟屏异常数（只增不减；排障可见 + 单测断言用）。 */
let screenCrashTotal = 0

/** 读累计吞掉的虚拟屏异常数。 */
export function xtermScreenCrashCount(): number {
  return screenCrashTotal
}

/** 判定未捕获异常是否来自虚拟屏（xterm-headless）。导出仅供单测。 */
export function isXtermScreenCrash(err: unknown): boolean {
  const stack = err instanceof Error ? (err.stack ?? '') : String(err)
  return XTERM_SCREEN_CRASH_RE.test(stack)
}

/**
 * 记账并吞掉一个虚拟屏异常；返回 true 表示已吞（非虚拟屏异常返回 false，交回调用方）。
 * 导出仅供单测。
 */
export function swallowXtermScreenCrash(err: unknown): boolean {
  if (!isXtermScreenCrash(err)) return false
  screenCrashTotal++
  const message = err instanceof Error ? err.message : String(err)
  console.warn(`[dsh-tty] 虚拟屏（xterm-headless）未捕获异常已吞掉，不影响宿主（累计 ${screenCrashTotal} 次）：${message}`)
  return true
}

let xtermGuardRefs = 0
let xtermGuardHandler: ((err: unknown) => void) | undefined
let xtermGuardRejectionHandler: ((reason: unknown) => void) | undefined

/** 解绑兜底（引用计数归零才真正摘监听器）。 */
function releaseXtermScreenCrashGuard(): void {
  if (xtermGuardRefs === 0) return
  if (--xtermGuardRefs > 0) return
  if (xtermGuardHandler !== undefined) {
    process.off('uncaughtException', xtermGuardHandler)
    xtermGuardHandler = undefined
  }
  if (xtermGuardRejectionHandler !== undefined) {
    process.off('unhandledRejection', xtermGuardRejectionHandler)
    xtermGuardRejectionHandler = undefined
  }
}

/**
 * 注册进程级虚拟屏异常兜底（D57）：把来自 xterm-headless 的未捕获异常 / 未处理 rejection
 * 吞掉并记账，让插件自己的 bug 不再拖垮整个 harness。幂等 + 引用计数，返回解绑函数。
 *
 * 覆盖两个入口：
 *   - `uncaughtException`：同步路径（`_innerWrite` 的定时器回调里抛出，见上）；
 *   - `unhandledRejection`：xterm 的异步 handler（DCS/OSC）rejection 走这里，宿主实测
 *     **0 处**监听，Node 15+ 下未处理 rejection 直接杀进程。
 *
 * 三条边界（刻意如此，不是随手 `process.on`）：
 *   1. **只吞虚拟屏异常**——`isXtermScreenCrash` 按堆栈判定；其余异常照旧。
 *   2. **其余异常只在「我们是唯一的监听者」时抛回**：没有本兜底时未捕获异常会让宿主退出，
 *      抛回保住这个语义；已经有别的监听者（宿主/其它插件）时保持沉默，由它们决定——
 *      此时抛回反而会抢在别人前面把进程杀掉。
 *   3. `unhandledRejection` 的「抛回」还有一层必要性：**只要挂了监听器，Node 就不再走
 *      默认的致命处理**，所以非虚拟屏的 rejection 必须由我们抛出来还原默认行为
 *      （已实测：抛回后进程照旧 exit 1）。
 */
export function installXtermScreenCrashGuard(): () => void {
  if (xtermGuardRefs++ > 0) return releaseXtermScreenCrashGuard
  const onUncaught = (err: unknown): void => {
    if (swallowXtermScreenCrash(err)) return
    if (process.listenerCount('uncaughtException') <= 1) throw err
  }
  const onRejection = (reason: unknown): void => {
    if (swallowXtermScreenCrash(reason)) return
    if (process.listenerCount('unhandledRejection') <= 1) throw reason
  }
  xtermGuardHandler = onUncaught
  xtermGuardRejectionHandler = onRejection
  process.on('uncaughtException', onUncaught)
  process.on('unhandledRejection', onRejection)
  return releaseXtermScreenCrashGuard
}

/* ------------------------------------------------------------------ *
 * 虚拟屏心跳（D57 停摆检测）
 * ------------------------------------------------------------------ */

/**
 * 停摆判定窗口：写出去的数据超过这么久还没解析完，就认定那块屏的解析器已停摆。
 * 正常屏的解析是毫秒级（回调随 `_innerWrite` 逐批回来），5s 不会误伤。
 */
export const SCREEN_STALL_MS = 5000

/** 退役原因①：写队列超限 / 尺寸非法导致的同步抛出。 */
export const SCREEN_DOWN_WRITE_REJECTED = '写入被拒（写队列超限或尺寸非法）'

/** 退役原因②：解析器停摆（超时窗口内没有任何一批数据被解析完）。 */
export const SCREEN_DOWN_STALLED = '解析停摆（xterm 在超时窗口内未回调）'

/** 虚拟屏心跳：在途批次 + 看门狗（D57）。 */
export interface ScreenHeartbeat {
  /** 已写出、尚未被 xterm 解析完的批次（`write(data, cb)` 的回调未回来即 >0）。 */
  inflight: number
  /** 看门狗；null = 当前没有挂着的窗口。 */
  watchdog: NodeJS.Timeout | null
  /** 最近一次解析完成的时间戳（0 = 从未）。看门狗靠它区分「解析在途」与「真停摆」。 */
  lastParseAt: number
}

/** 建一份空心跳。 */
export function newScreenHeartbeat(): ScreenHeartbeat {
  return { inflight: 0, watchdog: null, lastParseAt: 0 }
}

/** 摘掉看门狗（会话结束 / 屏退役时调用，避免定时器在会话死后误报）。 */
export function clearScreenWatchdog(heartbeat: ScreenHeartbeat): void {
  if (heartbeat.watchdog !== null) {
    clearTimeout(heartbeat.watchdog)
    heartbeat.watchdog = null
  }
}

/**
 * 写一帧到虚拟屏，并维护停摆看门狗（D57）。
 *
 * **为什么需要心跳**：xterm 的解析在 `WriteBuffer._innerWrite` 的 setTimeout 回调里跑，
 * 异常被进程级兜底吞掉之后，那块屏的解析器**永久停摆**——出错的那批数据留在写队列里、
 * `_bufferOffset` 不前进，而 `write()` 只在队列**空**时才重新调度解析。后果：`tty_screen`
 * 一直返回**冻结的旧画面**（agent 会据此行事），写队列还会一路堆到 5e7 字符上限。
 * 心跳把这种屏识别出来退役，`tty_screen` 改为如实报「虚拟屏不可用」。
 *
 * 信号用 `write(data, cb)` 的回调（xterm 解析完这批数据才回调）：停摆时回调永远不来 →
 * `inflight` 不归零 → 看门狗判定。**不能用 `onWriteParsed` 事件**——它在 5.5.0 不是
 * 公开 API（`Terminal` 只暴露 onBell/onBinary/onCursorMove/onData/onLineFeed/onResize/
 * onScroll/onTitleChange）。
 */
export function writeToScreen(
  screen: { write(data: string, callback?: () => void): void },
  heartbeat: ScreenHeartbeat,
  text: string,
  onStall: (reason: string) => void,
  stallMs: number = SCREEN_STALL_MS,
): void {
  heartbeat.inflight++
  try {
    screen.write(text, () => {
      heartbeat.inflight = Math.max(0, heartbeat.inflight - 1)
      heartbeat.lastParseAt = Date.now()
      if (heartbeat.inflight === 0) clearScreenWatchdog(heartbeat)
    })
  } catch {
    // 同步抛出（写队列超限 5e7 / 尺寸非法）：屏已不可用，立刻判定停摆
    heartbeat.inflight = Math.max(0, heartbeat.inflight - 1)
    onStall(SCREEN_DOWN_WRITE_REJECTED)
    return
  }
  if (heartbeat.watchdog === null) {
    const armedAt = Date.now()
    heartbeat.watchdog = setTimeout(() => {
      heartbeat.watchdog = null
      // 停摆要**双条件**：还有批次没解析完，且整个窗口内**毫无**解析进展。
      // 只看 inflight 会误杀连续输出的健康屏——看门狗按首次写入武装、5s 后到期时，
      // 活跃会话几乎总有在途批次（实测：6s 连续输出误判 1 次，见 DEFECTS D57）。
      if (heartbeat.inflight > 0 && heartbeat.lastParseAt < armedAt) onStall(SCREEN_DOWN_STALLED)
    }, stallMs)
    heartbeat.watchdog.unref?.()
  }
}

/* ------------------------------------------------------------------ *
 * 会话管理
 * ------------------------------------------------------------------ */

/** 会话的只读快照形状（tty_list 与 sessions 帧共用；D77 起含只读保留态字段）。 */
export interface SessionSnapshot {
  sid: string
  pid?: number
  cwd: string
  kind: 'local' | 'ssh'
  target: string
  startedAt: number
  lastOutputAt: number
  persist?: true
  owner: 'user' | 'agent'
  /** 进程已退出、会话仍在只读保留期内（D77）。 */
  exited?: true
  /** 退出码（拿不到时省略）。 */
  exitCode?: number
  /** 退出信号（正常退出时省略）。 */
  signal?: string
  /** 只读保留的剩余毫秒；**省略 = 不按时间释放**（策略为 ∞，关闭或宿主重启才清）。 */
  retainMs?: number
  /**
   * 有命令正在执行（0.23.0）：true = 在跑；false = 命令已结束（或进程已退出）；
   * **省略 = 无法判断**——这个会话没有 shell 集成标记（非持久 SSH / fish·csh /
   * Windows 本地 / 集成被关 / tmux <3.3 吞了信封），或命令型会话尚未收到终局。
   * 拿它当「现在可以往里发命令」的许可时要按三态处理：省略 ≠ 没在跑。
   */
  running?: boolean
  /** 上一条已完成命令的退出码（0.23.0；来自 OSC 133;D，拿不到时省略）。 */
  lastExitCode?: number
  /** 上一条已完成命令的结束时刻（epoch ms，0.23.0；与 running/lastExitCode 同源）。 */
  lastExitAt?: number
}

/** 导出仅供单测（test/host-frames.test.ts）：上限 / 孤儿回收 / grace 热改的行为护栏。 */
export class SessionManager {
  private readonly sessions = new Map<string, TtySession>()
  private limit: number
  /** 回收器销毁孤儿时是否连 tmux 持久会话一起结束（endOnPageClose 策略）。 */
  private endTmuxOnReap: () => boolean = () => false

  constructor(maxSessions: number, endTmuxOnReap?: () => boolean) {
    this.limit = maxSessions
    if (endTmuxOnReap !== undefined) this.endTmuxOnReap = endTmuxOnReap
  }

  get limitValue(): number {
    return this.limit
  }

  /** 配置热生效时调整上限（1~16）。 */
  setLimit(maxSessions: number): void {
    this.limit = Math.max(1, Math.min(16, maxSessions))
  }

  get count(): number {
    return this.sessions.size
  }

  /** 活着的会话数（**不含**只读保留的，见 canSpawn）。 */
  get liveCount(): number {
    let live = 0
    for (const session of this.sessions.values()) if (session.exited === null) live += 1
    return live
  }

  /** 只读保留的会话数（D77）。 */
  get exitedCount(): number {
    let exited = 0
    for (const session of this.sessions.values()) if (session.exited !== null) exited += 1
    return exited
  }

  /**
   * 名额判据**只数活着的会话**（D77）：只读保留的不占名额。不这样分的话，
   * 「跑几条短命令」就能把面板顶成「会话数已达上限」——用户一条会话都没开，
   * 比原来那个「AI 取不到结果」的缺陷更糟。
   */
  canSpawn(): boolean {
    return this.liveCount < this.limit
  }

  add(session: TtySession): void {
    this.sessions.set(session.id, session)
  }

  remove(id: string): void {
    this.sessions.delete(id)
  }

  get(id: string): TtySession | undefined {
    return this.sessions.get(id)
  }

  /** 会话的只读快照（SSH 会话无本地 pid，该字段省略；tmux 持久会话带 persist；
   *  只读保留态（D77）额外带 exited/exitCode|signal/retainMs）。 */
  private snapshotOf(session: TtySession): SessionSnapshot {
    const exitRetainMs = retainLeftMs(session)
    const exitInfo = session.exited === null
      ? {}
      : {
          exited: true as const,
          ...(session.exited.code === null ? {} : { exitCode: session.exited.code }),
          ...(session.exited.signal === null ? {} : { signal: session.exited.signal }),
          // 省略 = 不按时间释放（策略 ∞）：不能塞 Infinity，理由见 retainLeftMs
          ...(exitRetainMs === null ? {} : { retainMs: exitRetainMs }),
        }
    // 命令边界三态（0.23.0）：省略的键必须**不出现**（`?? undefined` 会留下一个
    // undefined 键，宿主输出校验判「不是无损 JSON」（D52/B33））
    const runInfo = runningOf(session)
    const runFields = {
      ...(runInfo.running === undefined ? {} : { running: runInfo.running }),
      ...(runInfo.lastExitCode === undefined ? {} : { lastExitCode: runInfo.lastExitCode }),
      ...(runInfo.lastExitAt === undefined ? {} : { lastExitAt: runInfo.lastExitAt }),
    }
    const base: SessionSnapshot = {
      sid: session.id,
      cwd: session.cwd,
      kind: session.kind,
      target: session.target,
      startedAt: session.startedAt,
      lastOutputAt: session.lastOutputAt,
      owner: session.owner,
      ...runFields,
      ...(session.tmuxName !== null ? { persist: true as const } : {}),
      ...exitInfo,
    }
    return session.handle.pid === null ? base : { ...base, pid: session.handle.pid }
  }

  /** agent 工具用的只读快照。 */
  list(): SessionSnapshot[] {
    return [...this.sessions.values()].map((session) => this.snapshotOf(session))
  }

  /** sessions 帧用：额外带 attachable（孤儿且未关闭的会话可被新连接 attach）。 */
  listForAttach(): Array<SessionSnapshot & { attachable: boolean }> {
    return [...this.sessions.values()].map((session) => ({
      ...this.snapshotOf(session),
      // 只读保留态不可 attach（没有活着的 PTY 可接）：客户端据此不建幽灵标签
      attachable: session.clients.size === 0 && !session.closed && session.exited === null,
    }))
  }

  /** 遍历全部会话（状态条采集器的批量收尾等按会话维度的操作）。 */
  forEach(fn: (session: TtySession) => void): void {
    for (const session of this.sessions.values()) fn(session)
  }

  /** 按 tmux 持久会话名查找**活着**的会话（跨窗口共享用）；不存在/已关闭/只读保留态返回 undefined。
   *  D77：保留态必须排除——否则「同名 persistName 的新标签」会 rebind 到一具尸体上，
   *  拿到 ready 却永远没有输出。 */
  findByTmuxName(tmuxName: string): TtySession | undefined {
    for (const session of this.sessions.values()) {
      if (session.tmuxName === tmuxName && !session.closed && session.exited === null) return session
    }
    return undefined
  }

  /** 同步退役：移出全局表 + 释放虚拟屏（幂等，不杀进程）。 */
  retire(session: TtySession): void {
    session.closed = true
    this.sessions.delete(session.id)
    clearScreenWatchdog(session.screenHeartbeat)
    try {
      session.screen?.dispose()
    } catch {
      /* 已释放 */
    }
  }

  /** 释放并销毁会话：退役 + 树级终止（等待 terminate 完成，最慢 ~20s）。
   *  endOnPageClose 策略下，回收器销毁孤儿时连 tmux 持久会话一起结束。 */
  async destroy(session: TtySession): Promise<void> {
    this.retire(session)
    if (session.tmuxName !== null && this.endTmuxOnReap()) {
      try {
        await session.handle.tmuxTeardown?.()
      } catch {
        /* tmux 收尾失败不阻断回收 */
      }
    }
    await forceKill(session.handle)
  }

  /**
   * 回收孤儿会话（回收器定时调用）：超过保活期的回收。graceMs<=0 时立即回收
   * 全部孤儿——孤儿只在「断开瞬间 grace>0」时产生，热改 grace 为 0 不能只管
   * 以后：已存在的孤儿会永久占 PTY 与名额，满额后新标签一直报「会话数已达上限」。
   *
   * agent 开的会话（owner:'agent'）不走这条：它从出生起就没有客户端，判据
   * 「orphanedAt !== null」对它要么永不成立（不回收）要么被误当孤儿（一开就收）。
   * 它的关闭入口是 agent 的 tty_close 或用户在面板里接管后关标签。
   */
  async reapOrphans(graceMs: number): Promise<void> {
    const now = Date.now()
    for (const session of [...this.sessions.values()]) {
      if (session.owner === 'agent') continue
      // D77：只读保留态不归孤儿回收管——它可能本来就带着 orphanedAt（断线后
      // 才退出），被这里收掉就等于「退出即退役」，保留期形同虚设。它的到点
      // 退役由 reapExited 统一负责。
      if (session.exited !== null) continue
      if (session.orphanedAt === null) continue
      if (graceMs <= 0 || now - session.orphanedAt >= graceMs) {
        void this.destroy(session) // 后台收尾：terminate 最慢可达 ~20s，不阻塞回收器
      }
    }
  }

  /**
   * 只读保留到点退役（D77；回收器每轮调用）：超过保留期的会话出表 + 释放屏。
   *
   * 默认策略是 ∞（保留到显式关闭）⇒ 本方法是 no-op，条数由 `capExited` 兜；
   * 把 `EXITED_RETAIN_MS` 改成有限值它就照常工作（策略可调，通路留着）。
   *
   * **不 kill 进程**：这里收的全是已经退出的会话（进程早没了），`retire()` 就够；
   * 真退役（显式 `tty_close` / 面板关标签）走 `killSessionNow`，那条路要处理
   * tmux teardown 与 forceKill 的兜底。
   */
  reapExited(retainMs: number): void {
    const now = Date.now()
    for (const session of [...this.sessions.values()]) {
      if (session.exited === null) continue
      if (retainMs <= 0 || now - session.exited.at >= retainMs) this.retire(session)
    }
  }

  /**
   * 只读保留的数量上限（超出按最旧淘汰，D77）：返回被淘汰的会话，便于单测断言。
   *
   * 为什么必须有：`owner:'agent'` 的会话不会走孤儿回收，agent 若不显式 `tty_close`
   * （它常常不会），保留态就是**永久泄漏**——屏与 256KB 缓冲一直挂着。
   */
  capExited(max: number): TtySession[] {
    const exited = [...this.sessions.values()]
      .filter((session) => session.exited !== null)
      .sort((a, b) => (a.exited?.at ?? 0) - (b.exited?.at ?? 0))
    const victims = exited.slice(0, Math.max(0, exited.length - max))
    for (const session of victims) this.retire(session)
    return victims
  }

  async disposeAll(): Promise<void> {
    const all = [...this.sessions.values()]
    this.sessions.clear()
    await Promise.all(all.map((session) => {
      session.closed = true
      clearScreenWatchdog(session.screenHeartbeat)
      try {
        session.screen?.dispose()
      } catch {
        /* 已释放 */
      }
      // D77：只读保留态（进程已退出）没有要收的进程——`forceKill` 只会对死句柄再戳一遍
      if (session.exited !== null) return Promise.resolve(true)
      return forceKill(session.handle)
    }))
  }
}

/* ------------------------------------------------------------------ *
 * WebSocket 连接处理
 * ------------------------------------------------------------------ */

/** 导出仅供单测（test/host-frames.test.ts）：帧校验 / 绑定 / 孤儿语义的行为护栏。 */
export class TtyServer {
  // maxPayload：ws 默认 100MiB，恶意/畸形帧会把内存打爆再 JSON.parse 复制一份；
  // 最大的合法帧是 input（128KB 上限，见 input 分支），给 4MiB 余量
  private readonly wss = new WebSocketServer({ noServer: true, maxPayload: 4 * 1024 * 1024 })
  /** 在途的持久会话创建（tmuxName → 创建 promise）：dsh 重启后多页面并发恢复时收敛竞态。 */
  private readonly pendingTmux = new Map<string, Promise<TtySession | null>>()
  /** 已接线的面板连接（sessions 帧广播用；比 wss.clients 更贴合「面板」语义，单测也可驱动）。 */
  private readonly panels = new Set<WebSocket>()
  /** 会话 → 它所属连接的 sid 映射（kill 兜底结案时要从本地表里摘除）。 */
  private readonly sessionLocals = new WeakMap<TtySession, Map<string, TtySession>>()
  /** WS 闸门（插件禁用时关闭）：拒绝新升级 + 断开存量连接。 */
  private wsGateOpen = true
  /** 服务器状态条总开关（配置热生效；关闭时停掉全部采集，重开按订阅恢复）。 */
  private statsOn = true

  constructor(
    private readonly ctx: Context,
    private readonly sessions: SessionManager,
    private readonly options: LiveConfig,
    private readonly hostKeyStore: HostKeyStore,
    /** SSH 持久会话名留存回调（apply 闭包实现，settings 落盘）。 */
    private readonly trackPersist: (tmuxName: string, present: boolean) => void,
  ) {
    this.statsOn = options.statsEnabled
    this.wss.on('connection', (ws) => this.onConnection(ws))
  }

  /**
   * 按启用状态对齐 WS 闸门（幂等）。关闭时对存量连接发正常关闭帧：客户端走
   * 既有重连循环，禁用期间升级被拒，重新启用后自动重连并 attach 孤儿会话。
   * PTY 进程不受影响（转孤儿保活），不因禁用杀用户进程。
   */
  setWsGate(open: boolean): void {
    if (open === this.wsGateOpen) return
    this.wsGateOpen = open
    if (open) return
    // 禁用：采集器先停（远端 exec channel / 本地定时器都不该活过闸门）
    this.stopAllStats()
    for (const ws of this.wss.clients) {
      try {
        ws.close(1001, 'dsh-tty disabled')
      } catch {
        /* 已关闭 */
      }
    }
  }

  /* --------------------------- 服务器状态条（0.17.0） --------------------------- */

  /**
   * 配置热生效：关闭时停掉全部采集（本地定时器 + 远端 exec channel）；重新打开
   * 时对**仍有订阅**的会话懒启动。订阅集合刻意不清——客户端只在标签可见性变化
   * 时发 statsOn/statsOff，开关来回切不该要求它重发。
   */
  setStatsEnabled(enabled: boolean): void {
    this.statsOn = enabled
    if (!enabled) {
      this.stopAllStats()
      return
    }
    this.sessions.forEach((session) => {
      if (session.statsSubs.size > 0) this.startStats(session)
    })
  }

  /** 订阅/退订（tab 可见性驱动）：退到 0 即停表，任何路径都不会让采集器空转。键 = 绑定键（connId:sid）。 */
  private setStatsSub(session: TtySession, bindingKey: string, on: boolean): void {
    if (on) {
      session.statsSubs.add(bindingKey)
      this.startStats(session)
      return
    }
    session.statsSubs.delete(bindingKey)
    if (session.statsSubs.size === 0) this.stopStats(session)
  }

  /** 清掉指向已解绑客户端（WS 关闭 / 标签换 sid 重绑）的订阅，防采集器永不收尾。 */
  private pruneStatsSubs(session: TtySession): void {
    for (const bindingKey of [...session.statsSubs]) {
      if (!session.clients.has(bindingKey)) this.setStatsSub(session, bindingKey, false)
    }
  }

  /**
   * 懒启动采集（首个 statsOn 才起）。两条路径产出同形状的帧：
   *   - 本地：宿主进程就是那台机器，1s 定时器 + 进程级共享采样器（多个本地标签
   *     共享一次 df/netstat）；
   *   - SSH：远端 sh + awk 常驻循环，每秒一行 JSON 走**非 PTY** exec channel；
   *     速率类由远端算好，宿主只解析 + 清洗。
   * 失败时静默停表并置 statsFailed：前端靠「无数据」隐藏状态条，PTY 数据路径与
   * 终端体验完全不受影响。
   *
   * 但失败位**不再粘死整个会话**（D83）：原先置位后永不复位，一次瞬态故障
   * （sshd MaxSessions 拒绝并发 channel、单通道 ECONNRESET）就让状态条与 agent
   * tty_stats 在会话余生里彻底没有数据，而主 PTY 通道其实是健康的。现在按指数
   * 退避自动重挂（出过帧即计数归零），既保住「别每秒重启」的本意，又能自愈。
   */
  private startStats(session: TtySession): void {
    // D77：只读保留态没有进程可采（本地会取到宿主、远端 channel 早断了）——直接不起表
    if (!this.statsOn || session.closed || session.exited !== null || session.stats !== null || session.statsFailed) return
    if (session.kind === 'local') {
      const sampler = localStatsSampler()
      let busy = false
      let timer: NodeJS.Timeout | null = null
      const collector: StatsCollector = {
        stop: () => {
          if (timer !== null) clearInterval(timer)
          timer = null
        },
      }
      const tick = (): void => {
        if (session.closed) {
          collector.stop() // 会话已回收：定时器自收尾，不依赖外部钩子是否齐全
          return
        }
        if (busy) return // 上一拍还没回来（df 卡住）就跳过，不堆积
        busy = true
        void sampler.sample().then((frame) => {
          busy = false
          if (session.stats !== collector || session.closed) return
          if (hasStatsData(frame)) this.sendStats(session, frame)
        })
      }
      timer = setInterval(tick, STATS_INTERVAL_MS)
      timer.unref?.()
      session.stats = collector
      tick() // 首个订阅立刻出值，不让状态条空一个周期
      return
    }
    const statsExec = session.handle.statsExec
    if (statsExec === undefined) {
      // 句柄缺失（连接已断等）同样退避重挂，而不是永久放弃（D83）
      session.statsFailed = true
      this.scheduleStatsRetry(session)
      return
    }
    let stopped = false
    /** 本次采集是否读到过合法帧——决定「这一跳结束」算失败还是算远端自己收摊。 */
    let sawFrame = false
    let handle: { stop(): void } | null = null
    const collector: StatsCollector = {
      stop: () => {
        stopped = true
        handle?.stop()
      },
    }
    /**
     * 起一跳采集。远端平台事先不知道，所以先跑 POSIX 脚本；若 channel 在**一帧
     * 数据都没读过**的情况下结束，说明对端不是 POSIX 平台（Windows 上 cmd.exe /
     * PowerShell 根本解析不了 sh -c 脚本），再换 PowerShell 版（-EncodedCommand，
     * 同帧形状）试一次。两跳都失败（如 macOS/BSD 远端：既无 /proc 也无 PowerShell）
     * 才置粘性失败位，前端按「无数据」隐藏状态条。
     */
    const attempt = (command: string, powershell: boolean): void => {
      handle = statsExec(command, (line) => {
        if (stopped || session.closed) return
        const frame = parseStatsLine(line)
        if (frame === null) return
        sawFrame = true
        session.statsFailures = 0 // 出过帧：退避计数归零，下次失败从头退避
        if (hasStatsData(frame)) this.sendStats(session, frame)
      }, () => {
        if (stopped) return // 我们自己停的，不算失败
        if (!sawFrame && !powershell) {
          attempt(buildWindowsStatsCommand(), true)
          return
        }
        // 读过帧 = 远端采集进程自己停了；一帧未读 = 这一跳没起来——都停表。
        // D83：置失败位让前端先隐藏状态条，但排一次退避重挂，恢复后自愈
        session.statsFailed = true
        session.stats = null
        collector.stop()
        this.scheduleStatsRetry(session)
      })
    }
    // 先登记再起采集：同步失败（conn.exec 直接抛错）也走同一套收尾
    session.stats = collector
    attempt(buildRemoteStatsCommand(), false)
    // 双跳同步失败时 collector.stop() 已把当时在手的句柄停掉；conn.exec 直接抛错的
    // 那一跳压根没建 channel，句柄是惰性的，不需要额外收尾。
  }

  /**
   * 采集失败后的退避重挂（D83）。
   *
   * 退避而不是立刻重试，是为了保住原先「粘性失败位」想解决的问题——远端平台压根
   * 没有采集源（macOS/BSD：既无 /proc 也无 PowerShell）时不能每秒重启一个必然失败
   * 的 channel。指数退避 + 上限把这种「稳态失败」压到几分钟一次，同时让瞬态故障
   * 在恢复后自动回到有数据状态（出过帧就归零）。
   */
  private scheduleStatsRetry(session: TtySession): void {
    if (session.closed || session.exited !== null || !this.statsOn) return
    session.statsFailures += 1
    const delay = Math.min(STATS_RETRY_BASE_MS * 2 ** (session.statsFailures - 1), STATS_RETRY_MAX_MS)
    session.statsRetryAt = Date.now() + delay
    const timer = setTimeout(() => {
      session.statsRetryAt = 0
      if (session.closed || session.exited !== null || !this.statsOn) return
      session.statsFailed = false // 清位后 startStats 的门禁才放行
      this.startStats(session)
    }, delay)
    timer.unref?.()
  }

  /** 停表（幂等）：订阅清零 / 会话结束 / 插件禁用 / 配置关闭都走它。 */
  private stopStats(session: TtySession): void {
    const collector = session.stats
    session.stats = null
    if (collector !== null) collector.stop()
  }

  private stopAllStats(): void {
    this.sessions.forEach((session) => this.stopStats(session))
  }

  /** 帧只发给订阅了该会话的客户端（绑定键寻址，回帧带各连接自己的 sid，跨窗口共享也成立）。 */
  private sendStats(session: TtySession, frame: StatsFrame): void {
    // agent 侧 tty_stats 的数据源：不留档的话「没有面板订阅」的会话（agent 开的
    // 终端天然没有面板订阅）永远拿不到指标
    session.lastStats = frame
    for (const bindingKey of session.statsSubs) {
      const client = session.clients.get(bindingKey)
      if (client === undefined) continue
      try {
        send(client.ws, { t: 'stats', sid: client.sid, stats: frame })
      } catch {
        // readyState 检查与 send 之间对端可能刚关：不 try 的话异常会落在 ws 事件
        // 回调或采样 promise 里（未处理异常/未处理拒绝 → 宿主进程直接退出）
      }
    }
  }

  /** registerUpgrade 的 handler（loopback 围栏 + ws 握手）。 */
  handleUpgrade(req: ReqLike, socket: SocketLike, head: Buffer): void {
    const loopback = isLoopbackUpgrade(req)
    // 字面量环回同步判定（绝大多数请求：握手第一拍就继续，不引入额外时序）；
    // 只有主机名 / /etc/hosts 别名才等一次 DNS 确认（≤500ms），期间不碰 socket
    if (loopback instanceof Promise) {
      void loopback.then((ok) => {
        if (ok) this.finishUpgrade(req, socket, head)
        else socket.destroy()
      }).catch(() => { socket.destroy() })
      return
    }
    if (!loopback) {
      socket.destroy()
      return
    }
    this.finishUpgrade(req, socket, head)
  }

  /** 围栏放行之后的实际握手（与上面的异步分支共用）。 */
  private finishUpgrade(req: ReqLike, socket: SocketLike, head: Buffer): void {
    if (!this.wsGateOpen) {
      socket.destroy()
      return
    }
    this.wss.handleUpgrade(req as never, socket as never, head, (ws) => {
      this.wss.emit('connection', ws, req)
    })
  }

  private onConnection(ws: WebSocket): void {
    /** 本连接的上下文：id 参与跨连接绑定键（D07）；open 供在途异步路径判「连接已死」（D06）。 */
    const conn: TtyConnContext = { id: randomUUID(), open: true }
    /** 本连接上的会话表（sid → session）；单连接多会话（标签页）。 */
    const local = new Map<string, TtySession>()
    this.panels.add(ws)
    ws.on('close', () => { this.panels.delete(ws) })

    const cleanupAll = async (): Promise<void> => {
      const all = [...local.entries()]
      local.clear()
      await Promise.all(all.map(async ([clientSid, session]) => {
        if (session.closed) return
        // 解绑本连接的客户端（键 = connId:sid）；其余窗口仍绑定着（跨连接共享）时会话继续在线
        session.clients.delete(conn.id + ':' + clientSid)
        // WS 关闭/转孤儿：该端的 stats 订阅一并解绑（退到 0 就停表关 channel）
        this.pruneStatsSubs(session)
        if (session.clients.size > 0) {
          this.flushPendingOutput(session)
          return
        }
        if (this.options.reconnectGraceMs > 0) {
          // 客户端正常关面板会先逐个 kill（会话已移出 local），走到这里的都是
          // 「异常断开仍有存活会话」：转孤儿保活，等待新连接 attach，到点由回收器清理
          this.flushPendingOutput(session) // 没了收件人，待发帧直接丢弃（回放走环形缓冲）
          session.orphanedAt = Date.now()
          return
        }
        this.flushPendingOutput(session)
        this.killSessionNow(session)
      }))
    }

    ws.on('message', (raw) => {
      let msg: WsMessage
      try {
        msg = JSON.parse(raw.toString()) as WsMessage
      } catch {
        return
      }
      void this.handleMessage(ws, msg, local, cleanupAll, conn)
    })

    ws.on('close', () => {
      conn.open = false
      void cleanupAll()
    })
    ws.on('error', (error) => {
      this.ctx.logger.warn('[dsh-tty] ws error: ' + error.message)
    })
  }

  /**
   * 摘掉同 sid 上残留的**只读保留**会话（D77）：spawn / ssh 新建同名会话前调用。
   *
   * 不摘会真泄漏：`sessions.add()` 用同一个键把旧对象顶出表，而旧对象的虚拟屏与
   * 256KB 环形缓冲再没有任何引用能释放它们（`retire` 是唯一的释放口）。只处理
   * 保留态——活着的同 sid 会话属于「跨连接同名」的既有语义，不在这里动。
   */
  private retireStaleExited(sid: string): void {
    const stale = this.sessions.get(sid)
    if (stale === undefined || stale.exited === null) return
    this.sessionLocals.get(stale)?.delete(stale.id)
    this.sessions.retire(stale)
  }

  /**
   * 解析帧里的 sid。返回：
   *   { sid }        目标会话；
   *   { unknown }    显式 sid 但本连接无此会话（客户端竞态，如 resize 先于
   *                  spawn 就绪到达；调用方应静默忽略，而不是报错）；
   *   undefined      已发送错误帧（非法 sid / sid 缺省但无法唯一路由）。
   */
  private resolveSid(ws: WebSocket, msg: WsMessage, local: Map<string, TtySession>): { sid: string } | { unknown: true } | undefined {
    const raw = msg.sid
    if (typeof raw === 'string' && raw !== '') {
      if (!SID_RE.test(raw)) {
        send(ws, { t: 'error', m: '非法 sid' })
        return undefined
      }
      if (!local.has(raw)) return { unknown: true }
      return { sid: raw }
    }
    if (local.size === 1) return { sid: [...local.keys()][0] }
    send(ws, { t: 'error', m: local.size === 0 ? '没有可用会话（先发 spawn）' : '存在多个会话，请指定 sid' })
    return undefined
  }

  /** 把一个客户端连接重绑定到既有会话（跨窗口共享 / 并发恢复收敛共用）。 */
  private rebindClient(session: TtySession, sid: string, ws: WebSocket, local: Map<string, TtySession>, connId: string): void {
    session.clients.set(connId + ':' + sid, { ws, sid })
    session.orphanedAt = null
    this.pruneStatsSubs(session)
    if (session.paused) {
      session.paused = false
      try {
        session.handle.output.resume()
      } catch {
        /* 已退出 */
      }
    }
    local.set(sid, session)
    send(ws, {
      t: 'ready',
      sid,
      pid: session.handle.pid,
      kind: session.kind,
      target: session.target !== '' ? session.target : undefined,
      ...(session.tmuxName !== null ? { persist: true as const } : {}),
    })
    if (session.tmuxName !== null) void session.handle.tmuxRefresh?.()
  }

  /**
   * agent 开一个本地终端（tty_open 的实现）。
   *
   * 设计前提（与用户确认过）：**开成面板里的普通会话，不做隐形会话** ——
   * 会话照常进 `sessions` 快照、面板能看见并接管、用户随时可以关。理由是
   * D06 那类「僵尸会话」正是隐形会话的产物：用户不知道机器上跑着什么。
   *
   * 与 `spawn` 帧的差别只有两处：没有 ws（clients 空表）、owner:'agent'
   * （逃过孤儿回收，见 reapOrphans）。
   */
  async openAgentSession(input: { cwd?: string; command?: string | null; persistName?: string | null; cols?: unknown; rows?: unknown }): Promise<{ sid: string; persist: boolean }> {
    if (!this.sessions.canSpawn()) {
      throw new Error(`会话数已达上限（${this.sessions.limitValue}）——先在面板里关掉不用的标签，或调大「并发会话上限」`)
    }
    const cwd = typeof input.cwd === 'string' && input.cwd.trim() !== '' ? input.cwd.trim() : this.options.cwd
    if (!existsSync(cwd)) throw new Error(`cwd 不存在: ${cwd}`)
    const sid = randomUUID()
    const command = typeof input.command === 'string' && input.command.trim() !== '' ? input.command.trim() : null
    // 命令型会话不做 tmux 持久化（命令短命，与 spawn 帧同规则）
    const persistName = command === null && typeof input.persistName === 'string' && input.persistName !== '' && this.options.persistence === 'tmux'
      ? sanitizePersistName(input.persistName, sid)
      : null
    // 同 persistName 已有存活会话：直接复用（跨窗口共享同语义），不新建 PTY
    if (persistName !== null) {
      const existing = this.sessions.findByTmuxName(persistName)
      if (existing !== undefined) return { sid: existing.id, persist: true }
    }
    const { session, degraded } = await this.createLocalSession({
      sid,
      cols: input.cols,
      rows: input.rows,
      cwd,
      command,
      persistName,
      client: null, // agent 路径：无客户端
      local: new Map(),
      owner: 'agent',
    })
    // D72：agent 自己开的会话从出生起「什么都没读过」（水位线落在 seq 0）——
    // 包括 `command` 型会话在第一次 expect 之前打印的启动输出。用户开的标签
    // 相反：历史输出不算未读，首次被 agent 触达时才把水位线落在当下。
    ensureReadMark(session)
    // 面板可见性：新会话推给所有已连接的面板（客户端据此建「agent 开的」标签）
    this.broadcastSessions()
    return { sid: session.id, persist: session.tmuxName !== null && !degraded }
  }

  /** agent 关掉一个会话（tty_close 的实现）：只允许关 agent 自己开的，用户标签不越权。 */
  async closeAgentSession(sid: string): Promise<{ ok: true }> {
    const session = this.sessions.get(sid)
    if (session === undefined || session.closed) throw new Error(`会话不存在或已结束: ${sid}`)
    if (session.owner !== 'agent') {
      throw new Error(`会话 ${sid} 是用户在面板里开的（owner=user）：请在面板里关闭那个标签，不要由 agent 越权结束`)
    }
    // D77：只读保留态（进程已退出）也走这条路——`killSessionNow` 对死句柄是安全的，
    // 它做的正是「退役 + 释放屏」。这也是 issue 里要的那个「显式关闭」入口。
    this.flushPendingOutput(session)
    this.killSessionNow(session)
    this.broadcastSessions()
    return { ok: true }
  }

  /**
   * 把当前会话清单推给所有已连接面板（agent 开关会话后让面板即时反映）。
   *
   * 用自己登记的连接集合而不是 `this.wss.clients`：后者只在真实 WS 服务器
   * 接线时才有值（单测直接调 onConnection 时为空），且语义上我们要的是
   * 「已接线的面板连接」。
   */
  private broadcastSessions(): void {
    const list = this.sessions.listForAttach()
    for (const ws of this.panels) {
      send(ws, { t: 'sessions', list, tmux: [] })
    }
  }

  /**
   * 取一次会话所在机器的指标（tty_stats 的实现）。
   *
   * 按需采样、不依赖面板是否订阅状态条：本地会话直接跑本地采样器；SSH 会话在
   * 同一连接上开一次性 exec channel 跑一帧脚本（statsExec 的常驻循环不适合
   * 一次性取数，故用 handle.statsExec 的单帧变体——没有的话返回最近留档）。
   * 失败不抛给 agent 的判断链：返回 available:false + 原因。
   */
  async sampleStats(session: TtySession): Promise<{ available: boolean; reason?: string; frame?: StatsFrame }> {
    if (session.kind === 'local') {
      try {
        const frame = await localStatsSampler().sample()
        if (!hasStatsData(frame)) return { available: false, reason: '本机未采到可用指标（平台不支持或字段全缺）' }
        session.lastStats = frame
        return { available: true, frame }
      } catch (error) {
        return { available: false, reason: `本机采样失败: ${error instanceof Error ? error.message : String(error)}` }
      }
    }
    const statsExec = session.handle.statsExec
    if (statsExec === undefined) {
      // 没有 exec 通道（或远端不支持）：退回最近留档（面板订阅过就有）
      if (session.lastStats !== null) return { available: true, frame: session.lastStats }
      return { available: false, reason: '该 SSH 会话没有可用的采集通道，且没有历史留档' }
    }
    // 一次性取一帧：脚本是常驻循环，收到第一帧即 stop
    return await new Promise((resolve) => {
      let settled = false
      let handle: { stop(): void } | null = null
      const finish = (result: { available: boolean; reason?: string; frame?: StatsFrame }): void => {
        if (settled) return
        settled = true
        try {
          handle?.stop()
        } catch {
          /* 已停 */
        }
        resolve(result)
      }
      const timer = setTimeout(() => { finish({ available: false, reason: `远端采集超时（${String(STATS_ONESHOT_TIMEOUT_MS / 1000)}s）` }) }, STATS_ONESHOT_TIMEOUT_MS)
      timer.unref?.()
      try {
        handle = statsExec(buildRemoteStatsCommand(), (line) => {
          const frame = parseStatsLine(line)
          if (frame === null) return
          clearTimeout(timer)
          session.lastStats = frame
          finish({ available: true, frame })
        }, () => {
          clearTimeout(timer)
          // 一帧未读就结束：远端可能非 POSIX（Windows 远端走 PowerShell 版）
          if (session.lastStats !== null) finish({ available: true, frame: session.lastStats })
          else finish({ available: false, reason: '远端采集通道结束且未产出数据' })
        })
      } catch (error) {
        clearTimeout(timer)
        finish({ available: false, reason: `远端采集启动失败: ${error instanceof Error ? error.message : String(error)}` })
      }
    })
  }


  /** 等待同 tmuxName 的在途创建完成；返回可重绑定的会话（null = 无在途/已失败）。 */
  private async waitPendingTmux(tmuxName: string): Promise<TtySession | null> {
    const inflight = this.pendingTmux.get(tmuxName)
    if (inflight === undefined) return null
    try {
      return await inflight
    } catch {
      return null
    }
  }

  /**
   * 创建本地会话（0.20.0 抽出，供 WS `spawn` 帧与 agent `tty_open` 共用）。
   *
   * 与连接无关是这次抽出的全部意义：`spawn` 帧带一个 ws（用户开的标签要立刻
   * ready + 收输出），`tty_open` 没有 ws（agent 开的会话从出生起就没有客户端，
   * 靠 owner:'agent' 逃过孤儿回收）。两条路径共用同一套：
   *   - tmux 持久化探测与资源准备（同 persistName 复用既有会话，名额不翻倍）；
   *   - cwd 校验、spawnPlan 组装、并发在途收敛（pendingTmux）；
   *   - 会话对象装配 + 输出下行挂载 + 退出收尾。
   *
   * 调用方负责：上限检查（canSpawn）、错误帧、ready/notice 的呈现。
   * `client` 为 null 时创建无客户端的会话（agent 路径）。
   */
  private async createLocalSession(input: {
    sid: string
    cols: unknown
    rows: unknown
    cwd: string
    command: string | null
    persistName: string | null
    client: { ws: WebSocket; connId: string } | null
    local: Map<string, TtySession>
    owner: 'user' | 'agent'
  }): Promise<{ session: TtySession; wantsPersist: boolean; degraded: boolean; degradedInconclusive: boolean }> {
    const { sid, cols, rows, cwd, command, persistName, client, local, owner } = input
    const subprocess = (this.ctx as unknown as { get(name: string): { spawnTerminal(spec: unknown): Promise<PtyHandle> } | undefined }).get('subprocess')
    if (subprocess === undefined) throw new Error('subprocess 服务不可用')
    const wantsPersist = persistName !== null
    let spawnPlan = command !== null
      ? buildCommandSpawn(this.options.shell, this.options.term, this.options.colorTerm, command)
      : buildShellSpawn(this.options.shell, this.options.term, this.options.colorTerm, this.options.shellIntegration)
    let tmuxName: string | null = null
    let degraded = false
    /** 降级原因：探测**超时**（机器忙）还是确定没装——提示文案必须分开（D80）。 */
    let degradedInconclusive = false
    if (wantsPersist) {
      const probe = await probeTmux()
      if (probe.available) {
        tmuxName = persistName
        ensureTmuxAssets({ shell: this.options.shell, colorTerm: this.options.colorTerm, shellIntegration: this.options.shellIntegration, passthrough: probe.passthrough })
        spawnPlan = buildTmuxSpawnPlan({ shell: this.options.shell, term: this.options.term, colorTerm: this.options.colorTerm, tmuxName })
      } else {
        degraded = true // 降级普通会话，由调用方给灰字提示；原因（超时/没装）一并带出去
        degradedInconclusive = probe.inconclusive === true
      }
    }
    const create = (async (): Promise<TtySession> => {
      const handle = wrapLocalPty(await subprocess.spawnTerminal({
        argv: spawnPlan.argv,
        rows: clampInt(rows, 24, 2, 200),
        cols: clampInt(cols, 80, 2, 500),
        cwd,
        env: { TERM: this.options.term, COLORTERM: this.options.colorTerm, ...spawnPlan.env },
        graceMs: 5000,
      }))
      if (tmuxName !== null) {
        handle.tmuxTeardown = () => killTmuxSession(tmuxName)
        handle.tmuxRefresh = () => refreshTmuxClient(tmuxName)
      }
      const next: TtySession = {
        id: sid,
        handle,
        clients: new Map(),
        closed: false,
        exited: null,
        paused: false,
        owner,
        cwd,
        kind: 'local',
        target: '',
        commandSession: command !== null,
        startedAt: Date.now(),
        lastOutputAt: Date.now(),
        lastInputAt: Date.now(),
        outputSeq: 0,
        readSeq: -1,
        readMarkAt: 0,
        assistHintedSeq: -1,
        recentInputs: [],
        buffer: '',
        decoder: new StringDecoder('utf8'),
        screen: this.createScreen(clampInt(cols, 80, 2, 500), clampInt(rows, 24, 2, 200)),
        screenHeartbeat: newScreenHeartbeat(),
        screenDownReason: null,
        orphanedAt: null,
        shellState: createShellState(),
        pendingOutput: '',
        flushTimer: null,
        tmuxName,
        statsSubs: new Set(),
        lastStats: null,
        stats: null,
        statsFailed: false,
        statsRetryAt: 0,
        statsFailures: 0,
      }
      // 绑定：有客户端才绑（agent 路径 client === null → 保持空表 = 无客户端会话）。
      // 空表但 owner:'agent'，故不会被孤儿回收器当孤儿收掉。
      if (client !== null) next.clients.set(client.connId + ':' + sid, { ws: client.ws, sid })
      local.set(sid, next)
      this.sessions.add(next)
      // spawn 在途连接断开（0.19.0）：cleanupAll 已跑过、扫不到此刻才入表的
      // 会话——转孤儿（等重连 attach 或回收器清理）。不处理的话会话绑死已
      // 关闭的 ws 且 orphanedAt 永为 null：回收器永不扫到，PTY 与名额永久泄漏，
      // 重连 attach 还被拒并谎报「会话已连接到其它窗口」。
      if (client !== null && (!client.ws.readyState || client.ws.readyState !== WebSocket.OPEN)) {
        next.clients.clear()
        next.orphanedAt = Date.now()
      }
      return next
    })()
    if (tmuxName !== null) {
      const registered = create.catch(() => null)
      this.pendingTmux.set(tmuxName, registered)
      void registered.finally(() => {
        if (this.pendingTmux.get(tmuxName) === registered) this.pendingTmux.delete(tmuxName)
      })
    }
    const session = await create
    this.attachOutput(session)
    this.watchDone(session, local)
    return { session, wantsPersist, degraded, degradedInconclusive }
  }

  /**
   * 立即终止会话：同步退役 + 顶层 shell 直接 SIGKILL，让 done/exit 帧立刻可发；
   * 树级子进程清理（SIGTERM→grace→SIGKILL，交互式 zsh 忽略 SIGTERM 时最慢
   * 可拖 ~20s）由 terminate 在后台继续收尾，不阻塞 kill 帧处理。
   * tmux 背书会话先向 tmux server 发 kill-session（杀客户端只会 detach，
   * 会话会留在 tmux server 上）；2.5s 兜底 forceKill 防收尾悬挂。
   */
  private killSessionNow(session: TtySession): void {
    // 采集器先收（远端 exec channel 与本地定时器都不该活过会话）
    session.statsSubs.clear()
    this.stopStats(session)
    this.sessions.retire(session)
    if (session.exited !== null) {
      // D77：只读保留态（进程已经退出）**只退役、不再碰句柄**。下面那几条收尾
      // （tmux kill-session / forceKill / done 兜底）语义都是「把一个还活着的 PTY
      // 收掉」；对一具尸体再戳一遍收益为零，而在个别后端（win-arm64 的 ConPTY）
      // 恰好是纯风险。tmux 那条也不做：D77 之前「退出」本来就不 teardown（tmux
      // 会话留存），保持一致。
      return
    }
    const teardown = session.handle.tmuxTeardown
    if (teardown !== undefined) {
      let settled = false
      const finish = (): void => {
        if (settled) return
        settled = true
        void forceKill(session.handle)
      }
      const timer = setTimeout(finish, 2500)
      timer.unref?.()
      void teardown().catch(() => {}).then(finish)
      return
    }
    try {
      session.handle.forceKill?.()
    } catch {
      /* 已退出 */
    }
    void forceKill(session.handle)
    // 兜底：handle.done 不兑现时也要按「用户已 kill」结案（见 KILL_EXIT_FALLBACK_MS）。
    const timer = setTimeout(() => {
      this.finishSession(session, { exitCode: null, signal: 'SIGKILL' })
    }, KILL_EXIT_FALLBACK_MS)
    timer.unref?.()
  }

  /** 每会话一块虚拟屏（xterm-headless）：tty_screen 的数据源；失败降级为 null。
   *  构造参数在 createHeadlessScreen（D57：scrollback 不能是 0），这里只做委托。 */
  private createScreen(cols: number, rows: number): HeadlessTerminal | null {
    return createHeadlessScreen(cols, rows)
  }

  /**
   * 退役一块**不可用**的虚拟屏（D57）：解析停摆或写队列满时调用。
   *
   * 只摘虚拟屏，**不动会话**——PTY 还活着、浏览器面板照常收发（虚拟屏只是 `tty_screen`
   * 的数据源）。退役后 `tty_screen` 会如实报「虚拟屏不可用（原因）」，而不是返回冻结的
   * 旧画面让 agent 据此行事。
   */
  private dropScreen(session: TtySession, reason: string): void {
    if (session.screen === null) return
    const screen = session.screen
    session.screen = null
    session.screenDownReason = reason
    clearScreenWatchdog(session.screenHeartbeat)
    try {
      screen.dispose()
    } catch {
      /* 已释放 */
    }
    console.warn(`[dsh-tty] 虚拟屏已退役（${reason}），会话 ${session.id} 的 tty_screen 将报不可用；PTY 与前端不受影响`)
  }

  private async handleMessage(
    ws: WebSocket,
    msg: WsMessage,
    local: Map<string, TtySession>,
    cleanupAll: () => Promise<void>,
    conn: TtyConnContext,
  ): Promise<void> {
    try {
      // 连接已关闭（close 后仍有在途帧排队）：任何绑定/创建都不再落到死连接上
      if (!conn.open) return
      if (msg.t === 'spawn') {
        const sid = typeof msg.sid === 'string' && msg.sid !== '' ? msg.sid : randomUUID()
        if (!SID_RE.test(sid)) {
          send(ws, { t: 'error', m: '非法 sid' })
          return
        }
        if (local.has(sid)) {
          send(ws, { t: 'error', sid, m: 'sid 已存在' })
          return
        }
        this.retireStaleExited(sid) // D77：同 sid 上的只读保留态先摘掉，别让 add() 把它顶成泄漏
        // 持久化（0.10.0）：配置 persistence=tmux 且帧带 persist 时，spawn 包装层
        // 换成 `exec tmux -L dsh-tty -A -s <名>`（tmux 托管）；tmux 未安装则降级
        // 普通会话并回灰字提示。持久名稳定（客户端生成、随标签规格保存），
        // 宿主重启后重开标签按同名 attach 回原 tmux 会话
        // 命令标签（0.14.0）：直接跑一条命令，不做 tmux 持久化（命令短命）
        const parsedCommand = sanitizeCommand(msg.command)
        if (parsedCommand.error !== undefined) {
          send(ws, { t: 'error', sid, m: parsedCommand.error })
          return
        }
        const command = parsedCommand.command ?? null
        const persistName = command === null && msg.persist === true && this.options.persistence === 'tmux'
          ? sanitizePersistName(msg.persistName, sid)
          : null
        // 跨窗口共享（0.10.1）：同 tmuxName 的宿主会话还活着（别的窗口接回过，
        // 或同刻并发恢复的在途创建）时不再新建 PTY，本连接重绑定到它——
        // 单 PTY 多客户端扇出，名额不翻倍
        if (persistName !== null) {
          const existing = (this.sessions.findByTmuxName(persistName) ?? (await this.waitPendingTmux(persistName))) ?? null
          if (existing !== null) {
            if (!conn.open) return // 等待在途创建期间连接断了：不往死连接上绑
            this.rebindClient(existing, sid, ws, local, conn.id)
            return
          }
        }
        if (!this.sessions.canSpawn()) {
          send(ws, { t: 'error', sid, m: `会话数已达上限（${this.sessions.limitValue}）——每个窗口的每个标签各占一个名额：关闭不用的窗口/标签，或在设置卡片调大「并发会话上限」` })
          return
        }
        // 客户端（当前会话）cwd 优先；校验存在性，避免 node-pty 抛难懂错误
        const cwd = typeof msg.cwd === 'string' && msg.cwd.trim() !== '' ? msg.cwd.trim() : this.options.cwd
        if (!existsSync(cwd)) {
          send(ws, { t: 'error', sid, m: `cwd 不存在: ${cwd}` })
          return
        }
        // 会话创建走共用工厂（与 agent tty_open 同一套）；用户开的标签带连接，
        // 立刻 ready + 收输出
        let created: { session: TtySession; wantsPersist: boolean; degraded: boolean; degradedInconclusive: boolean }
        try {
          created = await this.createLocalSession({
            sid,
            cols: msg.cols,
            rows: msg.rows,
            cwd,
            command,
            persistName,
            client: { ws, connId: conn.id },
            local,
            owner: 'user',
          })
        } catch (error) {
          send(ws, { t: 'error', sid, m: error instanceof Error ? error.message : String(error) })
          return
        }
        const next = created.session
        send(ws, { t: 'ready', sid, pid: next.handle.pid, kind: 'local', ...(next.tmuxName !== null ? { persist: true } : {}) })
        if (created.wantsPersist && created.degraded) {
          // 超时与「确定没装」的提示分开（D80）：前者让用户重开一次标签即可（那时
          // 机器已经不忙了），后者才需要去装 tmux。原先一律写「未检测到 tmux」，
          // 把「机器忙」误报成「没装」，排障方向被带偏。
          const notice = created.degradedInconclusive
            ? '\x1b[2m[dsh-tty] tmux 探测超时（机器较忙），本标签以普通会话运行；重开一个标签页即可再试持久化\x1b[0m\r\n'
            : '\x1b[2m[dsh-tty] 未检测到 tmux，本标签以普通会话运行；安装 tmux 后持久化标签可跨宿主重启恢复现场\x1b[0m\r\n'
          appendOutput(next, notice)
          send(ws, { t: 'data', sid, d: notice })
        }
      } else if (msg.t === 'ssh') {
        const sid = typeof msg.sid === 'string' && msg.sid !== '' ? msg.sid : randomUUID()
        if (!SID_RE.test(sid)) {
          send(ws, { t: 'error', m: '非法 sid' })
          return
        }
        if (local.has(sid)) {
          send(ws, { t: 'error', sid, m: 'sid 已存在' })
          return
        }
        this.retireStaleExited(sid) // D77：同上，SSH 分支同规则
        // 跨窗口共享（0.10.1）：同 tmuxName 的 SSH 持久会话还活着时不重建远程
        // 连接，本连接重绑定到现有会话（单 PTY 多客户端扇出）
        const parsedCommand = sanitizeCommand(msg.command)
        if (parsedCommand.error !== undefined) {
          send(ws, { t: 'error', sid, m: parsedCommand.error })
          return
        }
        const command = parsedCommand.command ?? null
        const persistName = command === null && msg.persist === true && this.options.persistence === 'tmux'
          ? sanitizePersistName(msg.persistName, sid)
          : null
        if (persistName !== null) {
          const existing = (this.sessions.findByTmuxName(persistName) ?? (await this.waitPendingTmux(persistName))) ?? null
          if (existing !== null && existing.kind === 'ssh' && !existing.closed && existing.exited === null) {
            if (!conn.open) return // 等待在途创建期间连接断了：不往死连接上绑
            this.rebindClient(existing, sid, ws, local, conn.id)
            return
          }
        }
        if (!this.sessions.canSpawn()) {
          send(ws, { t: 'error', sid, m: `会话数已达上限（${this.sessions.limitValue}）——每个窗口的每个标签各占一个名额：关闭不用的窗口/标签，或在设置卡片调大「并发会话上限」` })
          return
        }
        // name 引用连接簿条目作基底，内联字段可逐项覆盖（与 SFTP 路由共用 mergeSshSpec）
        const merged = mergeSshSpec((name) => this.options.findSshHost(name), msg.name, msg)
        if (merged.error !== undefined || merged.spec === undefined) {
          send(ws, { t: 'error', sid, m: merged.error ?? 'SSH 连接参数缺失' })
          return
        }
        const spec: SshSpec = merged.spec
        const target = sshTarget(spec)
        send(ws, { t: 'data', sid, d: `\x1b[2mConnecting ${target} …\x1b[0m\r\n` })
        // 持久化（0.10.0）：远程 `exec tmux new-session -A` 托管；远程无 tmux 时
        // spawnSsh 降级普通 shell channel 并经 startupNotice 回灰字提示
        const wantsPersist = persistName !== null
        const persistOpt = wantsPersist ? { name: persistName } : undefined
        // 在途注册：同 persistName 的并发恢复等待本次创建完成后重绑定（防竞态翻倍）
        const create = (async (): Promise<TtySession> => {
          let handle: TermHandle
          try {
            handle = await spawnSsh(spec, {
              term: this.options.term,
              cols: clampInt(msg.cols, 80, 2, 500),
              rows: clampInt(msg.rows, 24, 2, 200),
              logger: { info: (m) => this.ctx.logger.info(m), warn: (m) => this.ctx.logger.warn(m) },
              hostKeyStore: this.hostKeyStore,
              ...(command !== null ? { command } : {}),
              ...(persistOpt !== undefined ? { persist: persistOpt } : {}),
            })
          } catch (error) {
            send(ws, { t: 'error', sid, m: error instanceof Error ? error.message : String(error) })
            throw error
          }
          const tmuxName = persistOpt !== undefined && handle.startupNotice === undefined ? persistOpt.name : null
          const next: TtySession = {
            id: sid,
            handle,
            clients: new Map([[conn.id + ':' + sid, { ws, sid }]]),
            closed: false,
            exited: null,
            paused: false,
            owner: 'user',
            cwd: '',
            kind: 'ssh',
            target,
            commandSession: command !== null,
            startedAt: Date.now(),
            lastOutputAt: Date.now(),
            lastInputAt: Date.now(),
            outputSeq: 0,
            readSeq: -1,
            readMarkAt: 0,
        assistHintedSeq: -1,
            recentInputs: [],
            buffer: '',
            decoder: new StringDecoder('utf8'),
            screen: this.createScreen(clampInt(msg.cols, 80, 2, 500), clampInt(msg.rows, 24, 2, 200)),
            screenHeartbeat: newScreenHeartbeat(),
            screenDownReason: null,
            orphanedAt: null,
            shellState: createShellState(),
            pendingOutput: '',
            flushTimer: null,
            tmuxName,
            statsSubs: new Set(),
            lastStats: null,
            stats: null,
            statsFailed: false,
            statsRetryAt: 0,
            statsFailures: 0,
          }
          local.set(sid, next)
          this.sessions.add(next)
          // spawn 在途连接断开（0.19.0）：转孤儿，理由与本地分支相同；SSH 连接
          // （含远程 tmux 持久会话）保持存活等重连 attach，到点由回收器收尾
          if (!conn.open || ws.readyState !== WebSocket.OPEN) {
            next.clients.clear()
            next.orphanedAt = Date.now()
          }
          send(ws, { t: 'ready', sid, pid: null, kind: 'ssh', target, ...(tmuxName !== null ? { persist: true } : {}) })
          if (tmuxName !== null) this.trackPersist(tmuxName, true) // 留存：远程 tmux 本机清单看不到
          if (handle.startupNotice !== undefined) {
            const notice = `\x1b[2m[dsh-tty] ${handle.startupNotice}\x1b[0m\r\n`
            appendOutput(next, notice)
            send(ws, { t: 'data', sid, d: notice })
          }
          this.attachOutput(next)
          this.watchDone(next, local)
          return next
        })()
        if (persistName !== null) {
          const registered = create.catch(() => null)
          this.pendingTmux.set(persistName, registered)
          void registered.finally(() => {
            if (this.pendingTmux.get(persistName) === registered) this.pendingTmux.delete(persistName)
          })
        }
        try {
          await create
        } catch {
          return // 错误帧已在创建闭包内发送
        }
      } else if (msg.t === 'input') {
        const data = typeof msg.d === 'string' ? msg.d : ''
        // 长度上限（对照 sanitizeCommand 的 2000）：粘贴大文本是正常用例，
        // >128KB 的「按键输入」只能是畸形/滥用——拒绝而不是让它进 PTY
        if (data.length > 128 * 1024) {
          send(ws, { t: 'error', m: 'input 帧过大（>128K 字符），已拒绝' })
          return
        }
        const resolved = this.resolveSid(ws, msg, local)
        if (resolved === undefined || 'unknown' in resolved) return
        const session = local.get(resolved.sid)
        // D77：保留态是**只读**的——面板那边不该再发输入，真发了也不能写进死 PTY
        if (session !== undefined && !session.closed && session.exited === null) {
          session.lastInputAt = Date.now()
          await session.handle.write(data)
        }
      } else if (msg.t === 'resize') {
        // D79：`msg.cols/rows` 缺失或非数值（客户端把 NaN 序列化成 `null` 就是这种）时
        // clampInt 回落 80×24，**不是**夹到下限 2——客户端的门槛在 client-src/fit-size.js，
        // 这里是防御纵深：旧版本客户端 / 第三方客户端发来的垃圾值不该把 PTY 压成 2×2。
        const resolved = this.resolveSid(ws, msg, local)
        if (resolved === undefined || 'unknown' in resolved) return
        const session = local.get(resolved.sid)
        if (session !== undefined && session.exited === null) {
          const cols = clampInt(msg.cols, 80, 2, 500)
          const rows = clampInt(msg.rows, 24, 2, 200)
          session.handle.resize(cols, rows)
          try {
            session.screen?.resize(cols, rows)
          } catch {
            /* 非法尺寸或已释放 */
          }
        }
      } else if (msg.t === 'refresh') {
        // 强制 tmux 重画（0.10.1）：客户端 reset 清掉残 scrollback 后请宿主
        // refresh-client 重画现场——不碰尺寸，规避隐藏标签下 proposeDimensions
        // 返回垃圾尺寸把 pane 压扁的隐患；非 tmux 会话为无害 no-op
        const resolved = this.resolveSid(ws, msg, local)
        if (resolved === undefined || 'unknown' in resolved) return
        const session = local.get(resolved.sid)
        if (session !== undefined && !session.closed && session.exited === null && session.tmuxName !== null) {
          void session.handle.tmuxRefresh?.()
        }
      } else if (msg.t === 'kill') {
        const resolved = this.resolveSid(ws, msg, local)
        if (resolved === undefined) return
        if ('unknown' in resolved) {
          // 本连接没有该 sid：若是孤儿会话（前连接已断、无人绑定）也允许 kill，
          // 避免「关闭面板杀不掉孤儿」泄漏到保活期结束。仍被任何连接绑定的会话
          // 绝不在此路径杀——任意 loopback 帧（含失效旧 sid）凭 sid 就能 SIGKILL
          // 别的窗口正在跑的构建，那是提权级事故（0.19.0 加前提）。
          const orphan = this.sessions.get(String(msg.sid ?? ''))
          if (orphan !== undefined && !orphan.closed) {
            if (orphan.clients.size > 0) {
              send(ws, { t: 'error', sid: String(msg.sid ?? ''), m: '该会话正连接在其它窗口：请到那个窗口关闭标签，或先在本窗口 attach' })
              return
            }
            this.flushPendingOutput(orphan)
            this.killSessionNow(orphan)
          }
          return
        }
        const session = local.get(resolved.sid)
        if (session === undefined) return
        local.delete(resolved.sid)
        this.killSessionNow(session)
      } else if (msg.t === 'sessions') {
        // tmux 字段（0.10.1）：本机 socket 现存持久会话 + SSH 持久会话名（远程
        // tmux 托管、本机清单看不到，从 settings 留存读取）——客户端用它确认
        // localStorage 里的持久标签规格是否仍可恢复（新窗口/新浏览器）
        const localTmux = await listTmuxSessions()
        // 本机清单探不明白（超时）时**整个字段缺席**（D81）：只给 SSH 侧的名字会被
        // 读成「本机没有持久会话」——正是「失败伪装成确定答案」要避免的
        send(ws, {
          t: 'sessions',
          list: this.sessions.listForAttach(),
          ...(localTmux !== undefined ? { tmux: [...new Set([...localTmux, ...this.options.persistSessions])] } : {}),
        })
      } else if (msg.t === 'attach') {
        const raw = msg.sid
        if (typeof raw !== 'string' || raw === '' || !SID_RE.test(raw)) {
          send(ws, { t: 'error', m: 'attach 需要合法 sid' })
          return
        }
        const session = this.sessions.get(raw)
        if (session === undefined || session.closed) {
          send(ws, { t: 'error', sid: raw, m: `会话不存在或已结束: ${raw}` })
          return
        }
        if (session.exited !== null) {
          // D77：保留态没有活着的 PTY 可接回（缓冲里的输出由 tty_capture 读），
          // 如实说明而不是让客户端拿到一个永远不出输出的「假在线」标签
          send(ws, { t: 'error', sid: raw, m: `会话已退出（${describeExit(session.exited)}），只读保留中：不能再接回终端；要接着操作请重新打开标签或 tty_open 新会话` })
          return
        }
        // 跨连接共享（0.10.1）：tmux 持久会话允许多窗口同时绑定（单 PTY 扇出）；
        // 非 tmux 会话仍独占（两个视图交错输入无意义）
        if (session.clients.size > 0 && session.tmuxName === null) {
          send(ws, { t: 'error', sid: raw, m: '会话已连接到其它窗口' })
          return
        }
        // 重新绑定到本连接（键 = connId:sid，连接侧 sid 供帧寻址）：解孤儿态，
        // 恢复被背压暂停的输出流
        session.clients.set(conn.id + ':' + raw, { ws, sid: raw })
        session.orphanedAt = null
        local.set(raw, session)
        if (session.paused) {
          session.paused = false
          try {
            session.handle.output.resume()
          } catch {
            /* 已退出 */
          }
        }
        send(ws, { t: 'ready', sid: raw, pid: session.handle.pid, kind: session.kind, target: session.target !== '' ? session.target : undefined, reattached: true, ...(session.tmuxName !== null ? { persist: true } : {}) })
        // 断线期间的输出经 256KB 环形缓冲回放（缓冲为空则跳过）。
        // tmux 背书会话例外：现场由 tmux 负责重画——回放会把缓冲里的可见屏
        // 先写进全新 xterm（制造屏外幽灵滚动历史 → 莫名滚动条），随后 tmux
        // 整屏重画再画一遍（内容重影）；故跳过回放，强制 tmux 重画一次
        if (session.tmuxName !== null) {
          void session.handle.tmuxRefresh?.()
        } else if (session.buffer !== '') {
          send(ws, { t: 'data', sid: raw, d: session.buffer })
        }
      } else if (msg.t === 'statsOn' || msg.t === 'statsOff') {
        this.handleStatsFrame(ws, msg, local, conn.id)
      }
    } catch (error) {
      send(ws, { t: 'error', m: error instanceof Error ? error.message : String(error) })
    }
  }

  /**
   * 服务器状态条订阅（0.17.0）：按「标签可见性」驱动——只有可见标签才发
   * statsOn。未知 sid（客户端竞态）静默忽略，不回错误帧。订阅键与客户端
   * 绑定键同构（connId:sid），跨连接共享同一 sid 时互不踩。
   */
  private handleStatsFrame(ws: WebSocket, msg: WsMessage, local: Map<string, TtySession>, connId: string): void {
    const resolved = this.resolveSid(ws, msg, local)
    if (resolved === undefined || 'unknown' in resolved) return
    const session = local.get(resolved.sid)
    if (session === undefined || session.closed || session.exited !== null) return
    this.setStatsSub(session, connId + ':' + resolved.sid, msg.t === 'statsOn')
  }

  /** 会话退出事实 → exit 帧（恰好一次；本地 PTY 与 SSH 共用）。 */
  private watchDone(session: TtySession, local: Map<string, TtySession>): void {
    this.sessionLocals.set(session, local)
    session.handle.done.then((outcome) => {
      this.finishSession(session, outcome)
    }).catch(() => { /* spawn 级失败已在分支内处理 */ })
  }

  /**
   * 会话终局的**唯一出口**：给所有绑定连接发 exit 帧（恰好一次）+ 转只读保留（D77）。
   *
   * `outcome` 正常来自 PTY 句柄的 done；显式 kill 的兜底（KILL_EXIT_FALLBACK_MS）
   * 也走这里，带 code=null / signal=SIGKILL。exit 广播到所有绑定连接（跨窗口共享），
   * 各客户端按自己的 sid 收址。
   *
   * **D77 起「进程退出」不再等于「退役」**：会话留在 `sessions` 表里转只读保留态，
   * 读侧工具（tty_list / tty_capture / tty_screen / tty_expect）照常可用，写侧拒写，
   * 直到显式关闭（tty_close / 面板关标签）或保留期到点（reapExited）。退役只剩
   * `SessionManager.retire` 那一处（出表 + 释放屏）。
   */
  private finishSession(session: TtySession, outcome: TermExit): void {
    if (session.exitSent === true) return
    session.exitSent = true
    session.statsSubs.clear()
    this.stopStats(session)
    if (session.kind === 'ssh' && session.tmuxName !== null) this.trackPersist(session.tmuxName, false)
    // 心跳停掉，但**屏不 dispose**（D77）：保留期内 tty_screen 还要读它。
    clearScreenWatchdog(session.screenHeartbeat)
    this.flushPendingOutput(session, true) // exit 前冲掉合并窗口里的尾巴，保序（D76：必须 force）
    for (const client of session.clients.values()) {
      send(client.ws, { t: 'exit', sid: client.sid, code: outcome.exitCode, signal: outcome.signal })
    }
    session.clients.clear()
    // ── 只读保留 ────────────────────────────────────────────────────────
    // 刻意**不**置 `closed`：那个位表示「真退役（出表 + 释放屏）」，读侧工具的
    // `session.closed` 守卫要放保留态过去。终局之后的字节因 clients 已清空而不再
    // 成帧（`onData` 照常入环形缓冲与屏：读到的是更完整的尾巴，不是更少的）。
    session.exited = { code: outcome.exitCode, signal: outcome.signal, at: Date.now() }
    for (const victim of this.sessions.capExited(MAX_EXITED_SESSIONS)) {
      // 被条数上限淘汰的：连同它在连接侧 local 表里的绑定一起摘掉（否则那条连接
      // 还拿得到 sid、却指着一个已退役的会话）
      this.sessionLocals.get(victim)?.delete(victim.id)
      // D77 补：淘汰必须留痕——否则用户侧只有「刚才那份结果怎么没了」这一种观测，
      // 排查时既不知道发生过淘汰、也不知道被挤掉的是哪个 sid。
      this.ctx.logger.warn(`[dsh-tty] 只读保留已达上限（${String(MAX_EXITED_SESSIONS)} 条，MAX_EXITED_SESSIONS）：最旧的会话 ${victim.id} 被淘汰，它的输出不再可读；想留住结果请在淘汰前 tty_capture / tty_screen 读走`)
    }
    // 面板即时看到保留态（第二个窗口据此不建幽灵标签；agent 标签由 exit 帧标记）
    this.broadcastSessions()
  }

  /**
   * 「上一条命令失败了」的徽标帧（0.24.0）。
   *
   * 只能在**输出下行路径**里判：shell 集成的 `D` 标记可能落在任意一块数据里，没有
   * 「命令结束」的独立事件可挂。判据全在 assist.ts 的 `shouldExplainExit`（0 不弹、
   * 130 / 141 豁免）。
   *
   * `assistHintedSeq` 按 `lastCommand.seq`（单调序号）去重：同一条命令只弹一次——否则用户
   * 关掉徽标之后，只要终端再吐一个字节（比如敲了下一个字符的回显）它就会重新冒出来。
   *
   * 没有连接时直接返回：徽标是**实时提示**，不是待办队列；等重连时补发会让一个刚打开
   * 的标签莫名其妙地顶着一个旧徽标。
   */
  private maybeEmitAssistHint(session: TtySession): void {
    if (!this.options.assistEnabled) return
    const state = session.shellState
    const last = state.lastCommand
    if (last === null || last.seq === session.assistHintedSeq) return
    session.assistHintedSeq = last.seq
    if (session.exited !== null || session.clients.size === 0) return
    if (!shouldExplainExit(last.exitCode)) return
    for (const client of session.clients.values()) {
      send(client.ws, { t: 'hint', sid: client.sid, kind: 'failure', exitCode: last.exitCode, at: last.endedAt })
    }
  }

  /** 输出下行 + 基于 ws.bufferedAmount 的背压（暂停/恢复 PassThrough）。 */
  private attachOutput(session: TtySession): void {
    const output = session.handle.output
    const flush = (): void => {
      session.flushTimer = null
      const pending = session.pendingOutput
      if (session.closed || session.clients.size === 0 || pending === '') return
      session.pendingOutput = ''
      let maxBuffered = 0
      for (const client of session.clients.values()) {
        try {
          client.ws.send(JSON.stringify({ t: 'data', sid: client.sid, d: pending }), () => {
            if (session.paused && client.ws.bufferedAmount < BACKPRESSURE_LOW && output.readableFlowing === false) {
              output.resume()
            }
          })
          maxBuffered = Math.max(maxBuffered, client.ws.bufferedAmount)
        } catch {
          /* 客户端已断开 */
        }
      }
      if (!session.paused && maxBuffered > BACKPRESSURE_HIGH) {
        session.paused = true
        output.pause()
      }
    }
    const onData = (chunk: Buffer) => {
      if (session.closed) return
      // StringDecoder 兜跨 chunk 多字节序列，再喂 shell 集成解析与虚拟屏
      const text = session.decoder.write(chunk)
      session.lastOutputAt = Date.now()
      appendOutput(session, text)
      feedShellIntegration(session, text)
      this.maybeEmitAssistHint(session)
      const screen = session.screen
      if (screen !== null) {
        // 心跳包裹（D57）：同步抛出 / 解析停摆的屏会被退役，而不是让 tty_screen 一直返回冻结画面
        writeToScreen(screen, session.screenHeartbeat, text, (reason) => {
          this.dropScreen(session, reason)
        })
      }
      if (session.clients.size === 0) return // 孤儿会话：仅积累缓冲，等待重连 attach 回放
      // data 帧合并：窗口内攒批，超阈值立即冲刷；exit/kill 前会强制 flush 保序
      session.pendingOutput += text
      if (session.pendingOutput.length >= FLUSH_SIZE_CHARS) {
        if (session.flushTimer !== null) {
          clearTimeout(session.flushTimer)
          session.flushTimer = null
        }
        flush()
      } else if (session.flushTimer === null) {
        const timer = setTimeout(flush, FLUSH_INTERVAL_MS)
        timer.unref?.()
        session.flushTimer = timer
      }
    }
    output.on('data', onData)
  }

  /** 立即冲刷待发的合并输出（exit/kill 前调用，保证 exit 帧永远在最后一帧 data 之后）。
   *
   *  D76：`force` 是**终局路径专用**的开关。`finishSession` 必须先置 `closed`（否则终局
   *  之后到达的字节会继续往合并窗口里塞），可它同时又要交出**已经攒在 `pendingOutput`
   *  里的**那批输出——两者共用同一个 `closed` 判据时，尾巴会被下面这行自己的守卫整批
   *  吞掉：进程「打印完就退出」时那正是崩溃堆栈的最后一行 / 命令的结论行。传 `force`
   *  即「我知道它已 closed，这一批仍然要发」。
   */
  private flushPendingOutput(session: TtySession, force = false): void {
    if (session.flushTimer !== null) {
      clearTimeout(session.flushTimer)
      session.flushTimer = null
    }
    const pending = session.pendingOutput
    session.pendingOutput = ''
    if ((session.closed && !force) || session.clients.size === 0 || pending === '') return
    for (const client of session.clients.values()) {
      send(client.ws, { t: 'data', sid: client.sid, d: pending })
    }
  }

  close(): void {
    for (const client of this.wss.clients) {
      try {
        client.close()
      } catch {
        /* 已关闭 */
      }
    }
  }
}

/* ------------------------------------------------------------------ *
 * 插件本体
 * ------------------------------------------------------------------ */

/**
 * env 插件托管变量名（~/.dsh/env.yml 托管区块内的 key，路径解析与 env 插件
 * 一致：DSH_ENV_FILE / DSH_HOME 优先）。只提取键名、绝不读值——这些是用户
 * 明确交给 dsh-env-manager 托管的变量，才是 env:VAR 引用的推荐来源；键行由
 * env 插件以 yaml 数组渲染（`- key: NAME`），逐行宽容提取即可，不引 YAML 依赖。
 */
function readManagedEnvKeys(): string[] {
  // 托管区块标记（与 env 插件 MARK_START/MARK_END 逐字符一致）
  const MARK_START = '# --- dsh-env-manager managed (auto-generated; do not edit) ---'
  const MARK_END = '# --- end dsh-env-manager managed ---'
  const dshHome = resolveDshHome()
  const file = process.env.DSH_ENV_FILE?.trim() || join(dshHome, 'env.yml')
  try {
    const lines = readFileSync(file, 'utf8').split('\n')
    // 标记必须整行精确匹配（trimEnd 仅容忍 \r 与尾部空格）：值经 yaml literal block
    // 缩进渲染，子串匹配会把值内的标记文本误判为区块边界，导致键名提取落空。
    const start = lines.findIndex((line) => line.trimEnd() === MARK_START)
    if (start === -1) return []
    const end = lines.findIndex((line, index) => index > start && line.trimEnd() === MARK_END)
    if (end === -1) return []
    const keys: string[] = []
    for (const line of lines.slice(start + 1, end)) {
      const match = line.match(/^\s*-\s*key:\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1\s*$/)
      if (match !== null) keys.push(match[2])
    }
    return [...new Set(keys)].sort().slice(0, 200)
  } catch {
    return []
  }
}

/**
 * 凭据存储里**已知的引用名**（~/.dsh/.credentials.yaml 的 `refs:` 块键），只读给
 * SSH 对话框的引用选择器当候选。
 *
 * 为什么必须读文件：官方把「引用半边」设计成**不可枚举**——
 * `CredentialProvider.listRecords` 的注释原话是 "Unlike the reference half, which has no
 * enumeration because configuration surfaces learn which references exist from settings
 * schemas"，而浏览器侧 `ctx.remote.credentials`（dsh-api-settings-controller）只开
 * `describe` / `set` / `unset`，连 `listRecords` 都没开。所以要让用户在下拉里看见
 * "这本存储里已经有什么名字"，宿主侧读文件是唯一出路；**只要键名、不取值**（值只在本函数
 * 的局部 `lines` 里路过，不进任何返回值，也不写日志）。
 *
 * 解析刻意最小（与上面 readManagedEnvKeys 同款，不为它引 YAML 依赖）：只认 `refs:` 顶层
 * 区块内「恰好两个空格 + POSIX 标识符 + 冒号」的行。本地 provider 写入时用 `yaml` 严格
 * 校验过（version: 1 / 值必须非空字符串 / 键必须是标识符），所以这个格式是稳的；真被手改
 * 坏了也只是候选少几个 —— 引用最终仍由连接时的凭据层校验存在性。
 *
 * 路径解析与本地 provider 的默认一致（$DSH_HOME 优先，空串视为未设，再退 ~/.dsh）。边界：
 * 若有人给 provider 配了自定义 `path` / `dshHome`，这里看不到那些引用（字段仍可手输名字）。
 */
/**
 * `/api/dsh-tty/credential-refs` 的路由逻辑（导出仅供单测
 * test/credential-refs.test.ts）：loopback 闸门 + 方法闸门 + 只回引用名的载荷。
 * 值在任何分支都不进响应——SSH 对话框的选择器只需要「我存过哪些名字」。
 */
export async function handleCredentialRefsRoute(req: ReqLike, res: ResLike): Promise<void> {
  if (!(await gateRoute(req, res))) {
    return
  }
  if (req.method !== 'GET') {
    writeJson(res, 405, { error: 'method not allowed: ' + String(req.method) })
    return
  }
  writeJson(res, 200, { ok: true, names: readCredentialRefNames() })
}

/** 导出仅供单测（test/credential-refs.test.ts）：只验键名解析，不取值。 */
export function readCredentialRefNames(): string[] {
  const dshHome = resolveDshHome()
  const file = join(dshHome, '.credentials.yaml')
  try {
    const names: string[] = []
    let inRefs = false
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      // 顶层键（0 缩进）切换区块；`refs:` 之后的条目才是引用名
      if (/^[A-Za-z_][A-Za-z0-9_]*:/.test(line)) {
        inRefs = line.startsWith('refs:')
        continue
      }
      if (!inRefs) continue
      const match = line.match(/^ {2}([A-Za-z_][A-Za-z0-9_]*):/)
      if (match !== null) names.push(match[1])
    }
    return [...new Set(names)].sort().slice(0, 500)
  } catch {
    // 没有存储文件（还没存过任何东西）/ 没有读权限：候选为空，不报错
    return []
  }
}

/**
 * 设置卡片「Shell 路径」候选（可选可输入的数据源）：POSIX 走 /etc/shells + $SHELL +
 * 常见安装路径；**Windows 走 %COMSPEC% + Windows PowerShell + PowerShell 7**（原先这套
 * 候选在 Windows 上恒为空——/bin/zsh 那批路径一个都不存在）。去重后过滤「存在且可执行」，
 * 默认 shell 排最前。只回路径，不做任何执行。
 */
function listCandidateShells(): string[] {
  const candidates: string[] = []
  const push = (value: string | undefined): void => {
    const path = value?.trim() ?? ''
    if (path !== '' && !candidates.includes(path)) candidates.push(path)
  }
  const fallback = defaultShellPath()
  if (process.platform === 'win32') {
    const systemRoot = process.env.SystemRoot?.trim() || 'C:\\Windows'
    const programFiles = process.env.ProgramFiles?.trim() || 'C:\\Program Files'
    const localAppData = process.env.LOCALAPPDATA?.trim() || ''
    // 全给**绝对路径**：候选的过滤口径是「存在且可执行」，裸命令名（pwsh.exe）在这里判不了，
    // 而这三处覆盖了 Windows 上实际存在的 shell（%COMSPEC% 必在，Windows PowerShell 必在，
    // PowerShell 7 装了才有）。
    push(process.env.COMSPEC)
    push(join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'))
    push(join(programFiles, 'PowerShell', '7', 'pwsh.exe'))
    if (localAppData !== '') push(join(localAppData, 'Microsoft', 'WindowsApps', 'pwsh.exe'))
  } else {
    try {
      for (const line of readFileSync('/etc/shells', 'utf8').split('\n')) {
        const path = line.trim()
        if (path !== '' && !path.startsWith('#')) push(path)
      }
    } catch {
      /* 无 /etc/shells 时跳过 */
    }
    push(process.env.SHELL)
    for (const path of [
      '/bin/zsh', '/usr/bin/zsh', '/usr/local/bin/zsh', '/opt/homebrew/bin/zsh',
      '/bin/bash', '/usr/bin/bash', '/usr/local/bin/bash', '/opt/homebrew/bin/bash',
      '/bin/fish', '/usr/bin/fish', '/usr/local/bin/fish', '/opt/homebrew/bin/fish',
      '/bin/sh', '/bin/dash', '/bin/ksh', '/bin/tcsh', '/bin/csh',
    ]) push(path)
  }
  const usable = candidates.filter((path) => {
    try {
      accessSync(path, fsConstants.X_OK)
      return true
    } catch {
      return false
    }
  })
  usable.sort((a, b) => (a === fallback ? -1 : b === fallback ? 1 : a.localeCompare(b)))
  return usable
}

/**
 * 「连接簿条目作基底 + 内联字段逐项覆盖」的共享解析（WS ssh 帧与 SFTP 路由共用）。
 * name 指向连接簿缺失条目、或解析结果缺 host/username 时返回 error。
 */
function mergeSshSpec(
  findSshHost: (name: string) => SshHostEntry | undefined,
  name: unknown,
  inline: Record<string, unknown>,
): { spec?: SshSpec; error?: string } {
  const profile = typeof name === 'string' && name !== '' ? findSshHost(name) : undefined
  if (typeof name === 'string' && name !== '' && profile === undefined) return { error: `连接簿中不存在: ${name}` }
  const spec: SshSpec = {
    host: typeof inline.host === 'string' && inline.host.trim() !== '' ? inline.host.trim() : profile?.host ?? '',
    port: Number(inline.port) || profile?.port || 22,
    username: typeof inline.username === 'string' && inline.username.trim() !== '' ? inline.username.trim() : profile?.username ?? '',
    auth: inline.auth === 'key' || inline.auth === 'password' || inline.auth === 'agent' ? inline.auth : profile?.auth ?? 'agent',
    keyPath: typeof inline.keyPath === 'string' && inline.keyPath !== '' ? inline.keyPath : profile?.keyPath,
    passphrase: typeof inline.passphrase === 'string' && inline.passphrase !== '' ? inline.passphrase : profile?.passphrase,
    password: typeof inline.password === 'string' && inline.password !== '' ? inline.password : profile?.password,
    agentForward: typeof inline.agentForward === 'boolean' ? inline.agentForward : profile?.agentForward ?? false,
  }
  /*
   * 跳板机：内联给了就以它为准（清洗不出可用对象则退回连接簿那一份），否则用连接簿的。
   * `jump` 只在**目标那一跳**之外多一跳，不支持嵌套（单跳），所以这里不做递归解析。
   */
  const inlineJump = inline.jump === undefined ? undefined : sanitizeJumpSpec(inline.jump)
  const jump = inlineJump ?? profile?.jump
  if (jump !== undefined) spec.jump = jump
  /*
   * 代理命令：与跳板机同款「内联优先、否则用连接簿那一份」。两者同时存在**不在这里二选一**：
   * 优先关系（ProxyJump 优先）在拨号处 `attachSshTransport` 一处决定，并记 warn——否则
   * 「配了代理命令却走了跳板机」会被这里静默掉。
   */
  const inlineProxyCommand = inline.proxyCommand === undefined ? undefined : sanitizeProxyCommand(inline.proxyCommand)
  const proxyCommand = inlineProxyCommand ?? profile?.proxyCommand
  if (proxyCommand !== undefined) spec.proxyCommand = proxyCommand
  if (spec.host === '' || spec.username === '') return { error: 'SSH 会话需要 host 与 username（或用 name 引用连接簿）' }
  return { spec }
}

/*
 * 回环围栏与同源证明：**实现已收敛到 `@hyzyn/dsh-kit`**（2026-09-25，项目级 ROADMAP 第 1
 * 项）。本包此前那份只认 `127.0.0.1` 一个字面量的同步围栏已删除，改走 kit 的加固档
 * （docker D31/D80/D110），并给变更端点补上同源证明（docker D32/D139）——成因与桌面版
 * 例外（桌面壳转发会删掉 Origin / Sec-Fetch-Site，但必带宿主 Cookie）的唯一归宿在
 * `packages/kit/src/http.ts`，这里只留指针。
 */

/**
 * 数据路由的统一闸门（**导出仅供单测**）：回环围栏（加固档）+ 变更端点的同源证明。
 * 十二处路由此前各抄一遍 403 样板，`mutation` 这条判据一加就会各写各的——收敛成一处后
 * 「拒绝分支」只有一份，负例也只测这一份。
 *
 * 哪些是变更端点（`mutation: true`）——**判据是「这次请求会不会改状态」**：
 *   - `POST /probe`：真的拨号，且连接簿条目测试会当场 TOFU 记录主机指纹；
 *   - `POST /sftp/{mkdir,rename,remove,upload}`、`POST /local-fs/{mkdir,rename,remove,transfer}`：
 *     写远端 / 写本机 / 起传输任务；
 *   - `POST /config`**刻意不在其列**（与 docker 同口径）：它是插件被禁用后唯一的恢复入口
 *     ——卡片靠它渲染、也是重新启用的唯一 UI 入口；跨站 POST 已由上面那条围栏的
 *     `sec-fetch-site: cross-site` 与 Origin 比对拦住。
 * 只读端点（GET 全家 + `sftp /list` `/download`、`local-fs /list`）维持 loopback-only：
 * 它们读的是用户自己主动要的东西，读路由加证明只会把旧 Safari / 裸 curl 一起挡在门外。
 *
 * **WS upgrade 不走这里**（那是 socket 握手，不是 req/res 路由）：见 `handleUpgrade`
 * 用的 `isLoopbackRequestStrict`——它自带「Origin 有则必须同源」这条判据，等价于给
 * 升级请求也上了证明，但**刻意不放开 Cookie 例外**：长连的生命周期比一次 POST 长得多。
 */
export async function gateRoute(req: ReqLike, res: ResLike, options?: { mutation?: boolean }): Promise<boolean> {
  if (!(await isLoopbackRequestStrict(req))) {
    writeJson(res, 403, { error: 'forbidden: loopback-only' })
    return false
  }
  if (options?.mutation === true && !hasSameOriginProof(req)) {
    writeJson(res, 403, { error: '缺少同源证明（需要 Origin 或 Sec-Fetch-Site: same-origin）：变更端点拒绝无来源请求' })
    return false
  }
  return true
}

/** 变更动作的子路由（见 gateRoute 的判据）：前缀路由先取 sub、再连 mutation 一起过闸。 */
const MUTATION_SUBROUTES: Record<string, ReadonlySet<string>> = {
  '/api/dsh-tty/sftp': new Set(['/mkdir', '/rename', '/remove', '/upload']),
  '/api/dsh-tty/local-fs': new Set(['/mkdir', '/rename', '/remove', '/transfer']),
  /*
   * 就地提权：三条子路由**逐条**列（docker D144 的教训）——判据是「精确子路径 + POST」，
   * 只写一条的话另外两条就是裸的（跨站页面能撤销授权、能反复对着确认挑战试错）。
   */
  '/api/dsh-tty/elevate': new Set(['', '/status', '/revoke']),
}

/**
 * 这个前缀路由的子路径是否**会改状态**（导出仅供单测）。
 *
 * 为什么单独抽出来：`/list` 与 `/download` 也是 POST（凭证走 body、不进 URL），但它们只是
 * 读——如果把「POST 就要求证明」一刀切下去，读路由会连带把旧 Safari / 裸 curl 挡在门外，
 * 而它们本来就没有可被跨站利用的副作用。判据是**动作**不是**方法**，所以名单必须显式。
 * 没见过的子路径一律 false（几步之后就是 404，不给它额外的信息量）。
 */
export function isMutationSubroute(prefix: string, sub: string): boolean {
  return MUTATION_SUBROUTES[prefix]?.has(sub) === true
}

interface ResLike {
  writeHead(status: number, headers?: Record<string, string>): void
  /** 二进制响应（SFTP 下载）也走 end；Node 的 ServerResponse 原生接受 Uint8Array。 */
  end(body?: string | Uint8Array): void
}

function writeJson(res: ResLike, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'referrer-policy': 'no-referrer' })
  res.end(JSON.stringify(body))
}

/** 下载响应的 content-disposition：ASCII 兜底 + RFC 5987 UTF-8 扩展（非 ASCII 文件名）。 */
function contentDispositionValue(name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`
}

/** 远程路径取末段（下载文件名展示用）；空串/根路径退化为 'download'。 */
function remoteBasename(path: string): string {
  const trimmed = path.trim().replace(/\/+$/, '')
  const index = trimmed.lastIndexOf('/')
  const base = index >= 0 ? trimmed.slice(index + 1) : trimmed
  return base === '' ? 'download' : base
}

/** 人类可读文件大小（sftp_list render 用）。 */
/** 人类可读时长（tty_stats 的「在线时长」用）。 */
function humanDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (d > 0) return `${String(d)} 天 ${String(h)} 小时`
  if (h > 0) return `${String(h)} 小时 ${String(m)} 分`
  return `${String(m)} 分`
}

function humanFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let index = 0
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024
    index += 1
  }
  return `${value >= 100 || index === 0 ? Math.round(value) : Math.round(value * 10) / 10} ${units[index]}`
}

async function readJsonBody(req: ReqLike & AsyncIterable<Uint8Array>): Promise<Record<string, unknown> | undefined> {
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    for await (const chunk of req) {
      size += chunk.length
      if (size > 512 * 1024) return undefined
      chunks.push(chunk)
    }
  } catch {
    return undefined
  }
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : undefined
  } catch {
    return undefined
  }
}

/** 本机目录条目（双栏 SFTP 本机侧；字段与 SftpEntryInfo 对齐）。 */
interface LocalFsEntry {
  name: string
  isDir: boolean
  isFile: boolean
  isSymlink: boolean
  size: number
  /** 毫秒时间戳；stat 失败（断链等）时为 0。 */
  mtime: number
}

/**
 * 本机目录列表（/api/dsh-tty/local-fs/list）：path 空 = 用户 home，返回实际
 * 绝对路径。stat 失败的条目（悬空符号链接等）按 size/mtime = 0 占位仍列出。
 */
async function listLocalDir(rawPath: string): Promise<{ path: string; entries: LocalFsEntry[] }> {
  const root = rawPath !== '' ? expandHome(rawPath) : homedir()
  const resolved = resolve(root)
  const dirents = await fsReaddir(resolved, { withFileTypes: true })
  const entries: LocalFsEntry[] = []
  for (const dirent of dirents) {
    let isDir = dirent.isDirectory()
    let isFile = dirent.isFile()
    let size = 0
    let mtime = 0
    try {
      const stats = await fsStat(join(resolved, dirent.name))
      isDir = stats.isDirectory()
      isFile = stats.isFile()
      size = Number(stats.size ?? 0)
      mtime = Number(stats.mtimeMs ?? 0)
    } catch {
      /* stat 失败：保留 dirent 类型判断，占位展示 */
    }
    entries.push({ name: dirent.name, isDir, isFile, isSymlink: dirent.isSymbolicLink(), size, mtime })
  }
  // 与远程栏同一套排序（0.19.0，见 SftpManager.list）：目录优先 + localeCompare
  // ——此前本机栏完全不排，同一面板左右两栏规则不一致，定位文件靠肉眼扫
  entries.sort((a, b) => {
    const kindDiff = (a.isDir ? 0 : 1) - (b.isDir ? 0 : 1)
    if (kindDiff !== 0) return kindDiff
    return a.name.localeCompare(b.name)
  })
  return { path: resolved, entries }
}

/** 设置卡片展示的当前有效配置快照。 */
interface ConfigSnapshot {
  enabled: boolean
  announceToAgent: boolean
  maxSessions: number
  shell: string
  term: string
  colorTerm: string
  cwd: string
  reconnectGraceSec: number
  sshHosts: SshHostEntry[]
  hostKeys: HostKeyRecord[]
  tunnels: TunnelSpec[]
  shellIntegration: boolean
  /** SFTP 文件浏览界面风格（客户端渲染用）。 */
  sftpStyle: 'dialog' | 'dual'
  /** 会话持久化模式（客户端渲染「+」菜单与 SSH 对话框用）。 */
  persistence: 'off' | 'tmux'
  /** 页面断开且保活期结束时是否结束 tmux 持久会话。 */
  endOnPageClose: boolean
  /** 服务器状态条开关（客户端据此隐藏/显示状态条）。 */
  statsEnabled: boolean
  /**
   * AI 辅助「失败即解释」开关（0.24.0，**默认关**）。客户端据此决定要不要摆失败徽标；
   * 关着时宿主侧也拒绝 `/api/dsh-tty/assist`（两道闸，不靠客户端自觉）。
   */
  assistEnabled: boolean
  /** AI 辅助的模型路由（客户端回显；都空 = 跟随宿主默认模型）。 */
  assistProvider: string
  assistModel: string
  /** SFTP 传输限制（客户端渲染 + 浏览器侧执行）。 */
  sftpLimits: Required<SftpLimits>
  /**
   * 代理命令（ProxyCommand）闸门：**默认关**。客户端据此在 SSH 对话框里如实说明这条字段
   * 现在能不能生效（关着时配了也不执行，连不上时错误文案点名这个开关而不是伪装成网络问题）。
   */
  allowProxyCommand: boolean
  /**
   * 这条能力是否**获宿主授权**。两条通道：环境变量 `DSH_TTY_ALLOW_PROXY_COMMAND=1`（进程启动时
   * 采样），或卡片刻意发起的一次就地确认（写进 `<DSH home>/dsh-kit/capability-grants.json`）。
   */
  allowProxyCommandGranted: boolean
  /**
   * 由**哪条通道**授权：`'env'` / `'file'` / `null`（未授权）。界面据此决定给不给「撤销宿主授权」
   * ——启动环境那条只能去改启动环境，给个点了不生效的按钮比不给更糟。
   */
  allowProxyCommandGrantSource: 'env' | 'file' | null
  /** 授权时刻（Unix 秒；只有 `file` 通道有值，别的档是 `null`）。授权是持久的，界面要能说出它什么时候来的。 */
  allowProxyCommandGrantedAt: number | null
  /** agent 工具（tty_list / tty_open / tty_close / tty_stats / tty_capture / tty_screen / tty_expect / tty_send / tunnel_list / sftp_list / sftp_read / sftp_write / sftp_mkdir / sftp_rename / sftp_remove / sftp_tree）是否已注册到 harness。 */
  toolsRegistered: boolean
  /** 宿主平台：客户端按平台写「Shell 路径 / shell 集成」的说明（Windows 那套见 defaultShellPath）。 */
  platform: NodeJS.Platform
}

const plugin = definePlugin<Config>({
  name: 'tty',
  // 声明 inject：tools 服务只有声明式 inject 才能解析（动态 ctx.inject/ctx.get
  // 均拿不到，实测 mcp-client 同款模式），声明后 ctx.get('tools') 才能取到。
  inject: ['tools'],
  apply(ctx: Context, rawConfig?: Config) {
    /*
     * 授权来源必须在**第一次 capabilityGranted 之前**绑定（见 kit 的 capability.ts）。两条通道：
     *   ① 启动环境快照（最严档，只认继承来的 `process` 层）；
     *   ② 就地提权（免重启）：卡片上点开关 → 宿主文件系统上落地一个随机名确认文件 → 授权写进
     *      grant-store（HTTP 写不到）。落点全部来自 kit 的 `capabilityPaths`（路径只在那里拼一次）。
     * 存储每次 apply 新建一个实例 —— 这就是「宿主重启后重新读盘」的语义。
     */
    const paths = capabilityPaths(resolveDshHome())
    // **共享实例**（kit D11）：tty 与 docker 同装时各 new 一个会各自缓存一份文件快照，
    // 后绑定的那个看不到另一个后来写进去的授权（实测：tty 授权成功后自己的快照仍是 false）
    const grantStore = sharedGrantStore(paths.dir)
    bindCapabilitySources(ctx, grantStore)
    /*
     * 启动期审计：盘上已有的带外授权是**持久**的（重启后直接生效、不再有任何一次确认），所以那次
     * 「静默继承」必须在日志里留下痕迹（kit D09）。刻意放在 `enabled` 判定**之前**：授权是宿主级的，
     * 与插件这次是否启用无关。
     */
    auditLoadedGrants(
      grantStore,
      [CAP_PROXY_COMMAND.env],
      { info: (msg) => ctx.logger.info(msg), warn: (msg) => ctx.logger.warn(msg) },
      '[dsh-tty]',
    )
    // volatile 字段解析后是 `{ get() }` 引用，先还原成纯数据（见 @hyzyn/dsh-kit 的 plainConfig）。
    const config = plainConfig((rawConfig ?? {}) as Config)
    if (config?.enabled === false) return
    const live = new LiveConfig({
      // 默认 shell 按平台取（Windows 没有 $SHELL，回落 /bin/zsh 会让本地终端一条都开不起来；
      // 见 defaultShellPath）。用户显式填了「Shell 路径」就照用。
      shell: config?.shell?.trim() || defaultShellPath(),
      term: config?.term?.trim() || 'xterm-256color',
      colorTerm: config?.colorTerm?.trim() || 'truecolor',
      cwd: config?.cwd?.trim() || process.cwd(),
      reconnectGraceSec: typeof config?.reconnectGraceSec === 'number' && Number.isInteger(config.reconnectGraceSec) && config.reconnectGraceSec >= 0 ? config.reconnectGraceSec : DEFAULT_RECONNECT_GRACE_SEC,
      sshHosts: Array.isArray(config?.sshHosts) ? config.sshHosts : [],
      hostKeys: Array.isArray(config?.hostKeys) ? config.hostKeys : [],
      // shell 集成（OSC 133/7）靠 POSIX rc 注入 + `-c` 包装层：Windows 上的 cmd / PowerShell
      // 两者都不成立（实测 cmd 忽略 -c 空跑、PowerShell 报 export 不存在），所以恒关。
      // 配置项照旧留着（快照里会显示 false），界面上也说明原因。
      shellIntegration: process.platform !== 'win32' && config?.shellIntegration !== false,
      tunnels: Array.isArray(config?.tunnels) ? config.tunnels : [],
      persistence: config?.persistence === 'tmux' ? 'tmux' : 'off',
      endOnPageClose: config?.endOnPageClose === true,
      statsEnabled: config?.statsEnabled !== false,
      sftpLimits: sanitizeSftpLimits(config?.sftpLimits),
      allowProxyCommand: config?.allowProxyCommand === true,
      persistSessions: sanitizePersistSessions(config?.persistSessions) ?? [],
      /*
       * tty D93 = D91 的**第三个实例**（同一根因：新字段要记得回来补一行）。这处比 applyPatch 那边更隐蔽：
       * applyPatch 是**热更新**路径，这里是**启动**路径——配置文件里写着 assistEnabled: true
       * 却不生效，只有「settings 里存过东西」的那条路能把它救回来。症状仍是本仓最忌讳的
       * 「配了没反应」（卡片/配置说开着，宿主里 live 还是 false）。
       */
      assistEnabled: config?.assistEnabled === true,
      assistProvider: typeof config?.assistProvider === 'string' ? config.assistProvider : '',
      assistModel: typeof config?.assistModel === 'string' ? config.assistModel : '',
    })
    /*
     * 闸门在**挂载时先初始化一次**（tty D70）。
     *
     * 它的唯一写入方是 `applyPatch`，而 `applyPatch` 在启动期**只在「settings 里存过东西」时才跑**
     * （见那里 `if (Object.keys(startup).length > 0)`）。于是「配置里写着 `allowProxyCommand: true`
     * + 已授权（环境变量或授权文件）+ 重启宿主」这条最平常的路径会停在模块级默认值
     * `{granted:false, enabled:false}` 上：fail-closed（不是安全问题），但症状正是本仓最忌讳的
     * 「配了没反应」——卡片显示已授权，代理命令却仍被拒。这条在接入就地提权后才致命：授权是
     * **持久**的，重启后更要保证「界面上说已授权」与「闸门真的放行」一致。
     */
    setProxyCommandPolicy({ granted: capabilityGranted(CAP_PROXY_COMMAND), enabled: live.allowProxyCommand })
    const sessions = new SessionManager(config?.maxSessions ?? DEFAULT_MAX_SESSIONS, () => live.endOnPageClose)
    /** TOFU 指纹记录持久化：写入 settings 命名空间（合并语义），失败不影响连接。 */
    const persistHostKeys = (records: HostKeyRecord[]): void => {
      const scope = settingsScope
      if (scope === undefined) return
      void Promise.resolve(scope.update({ hostKeys: records })).catch((error: unknown) => {
        console.warn('[dsh-tty] 主机密钥记录持久化失败: ' + (error instanceof Error ? error.message : String(error)))
      })
    }
    const hostKeyStore = new HostKeyStore(live, persistHostKeys)
    /** SSH 持久会话名留存（远程 tmux 本机 socket 看不到；新窗口恢复确认的数据源）。 */
    const persistPersistSessions = (): void => {
      const scope = settingsScope
      if (scope === undefined) return
      void Promise.resolve(scope.update({ persistSessions: live.persistSessions.map((name) => ({ tmuxName: name })) })).catch((error: unknown) => {
        console.warn('[dsh-tty] 持久会话名留存失败: ' + (error instanceof Error ? error.message : String(error)))
      })
    }
    /** 记录/移除一个 SSH 持久会话名并落盘（幂等）。 */
    const trackPersistSession = (tmuxName: string, present: boolean): void => {
      const next = present
        ? (live.persistSessions.includes(tmuxName) ? live.persistSessions : [...live.persistSessions, tmuxName])
        : live.persistSessions.filter((name) => name !== tmuxName)
      if (next.join('|') === live.persistSessions.join('|')) return
      live.persistSessions = next
      persistPersistSessions()
    }
    const tunnelManager = new TunnelManager(
      { info: (m) => ctx.logger.info(m), warn: (m) => ctx.logger.warn(m) },
      hostKeyStore,
      (bookName) => live.findSshHost(bookName),
    )
    // SFTP 文件传输：懒连接池 + TOFU 同源（见 src/sftp.ts）；spec 由各请求携带
    // （连接簿名或内联字段），连接簿凭证热改后天然生效
    const sftpManager = new SftpManager(
      { info: (m) => ctx.logger.info(m), warn: (m) => ctx.logger.warn(m) },
      hostKeyStore,
    )
    const server = new TtyServer(ctx, sessions, live, hostKeyStore, trackPersistSession)
    const stateRef = { enabled: true, announceToAgent: config?.announceToAgent !== false, toolsRegistered: false, sftpStyle: config?.sftpStyle === 'dual' ? 'dual' : 'dialog' as 'dialog' | 'dual' }
    let settingsScope: SettingsEntryScope | undefined
    // 工具/公告的重注册钩子：真正的实现由各自的注入 effect 挂载时回填。
    // applyPatch 定义在注入之前，只能先拿 noop——启动顺序无论是 settings 先行
    // （registerAll 读 stateRef 自行短路）还是 tools/announcement 先行（applyPatch
    // 再触发一次重注册，幂等），两种顺序最终状态一致。
    let refreshToolsHook: () => void = () => {}
    let refreshAnnouncementHook: () => void = () => {}

    const snapshot = (): ConfigSnapshot => ({
      enabled: stateRef.enabled,
      announceToAgent: stateRef.announceToAgent,
      maxSessions: sessions.limitValue,
      shell: live.shell,
      term: live.term,
      colorTerm: live.colorTerm,
      cwd: live.cwd,
      reconnectGraceSec: Math.round(live.reconnectGraceMs / 1000),
      sshHosts: live.sshHosts,
      hostKeys: live.hostKeys,
      tunnels: live.tunnels,
      shellIntegration: live.shellIntegration,
      sftpStyle: stateRef.sftpStyle,
      persistence: live.persistence,
      endOnPageClose: live.endOnPageClose,
      statsEnabled: live.statsEnabled,
      assistEnabled: live.assistEnabled,
      assistProvider: live.assistProvider,
      assistModel: live.assistModel,
      sftpLimits: live.sftpLimits,
      allowProxyCommand: live.allowProxyCommand,
      allowProxyCommandGranted: capabilityGranted(CAP_PROXY_COMMAND),
      /*
       * 授权来源：'env' = 启动环境变量（界面不给「撤销」按钮，它只能靠改启动环境撤销）、
       * 'file' = 就地确认写下的带外授权（界面可撤销）、null = 没授权。
       */
      allowProxyCommandGrantSource: capabilityGrantVia(CAP_PROXY_COMMAND) ?? null,
      /*
       * 授权时刻（Unix 秒；只有 file 通道有值）。授权是**持久**的：重启后它直接生效、不再确认，
       * 界面至少要能说出它是什么时候来的（kit D09）。
       */
      allowProxyCommandGrantedAt: capabilityGrantAt(CAP_PROXY_COMMAND) ?? null,
      toolsRegistered: stateRef.toolsRegistered,
      /**
       * 宿主平台（`process.platform`）：客户端据此把「Shell 路径 / shell 集成」的说明与候选
       * 按平台写（Windows 上不提 zsh/bash 那套，也不摆一个恒关闭的集成开关）。
       */
      platform: process.platform,
    })

    /** 规范化并应用一份配置补丁（volatile 更新事件与 HTTP POST 共用；幂等）。 */
    const applyPatch = (section: Record<string, unknown>): void => {
      live.apply({
        /*
         * **先把整份补丁铺开**，再逐个覆盖需要清洗/归一化的字段。
         *
         * D91：这里原先是一张**逐字段的显式清单**，于是新加的 volatile 字段必须记得回来补一行
         * ——`assistEnabled` 就是这么漏的：profile 里存下来了、`live` 却没变，`snapshot()` 回给
         * 卡片的还是旧值，表现就是「点了保存，勾又弹回去」。铺开之后**新字段默认就会热生效**；
         * `live.apply` 对每个字段都有类型守卫，多出来的键自然被忽略（类型上收窄成它的参数类型）。
         * 只有**需要清洗**的字段才留在这张清单里。
         */
        ...(section as unknown as Parameters<LiveConfig['apply']>[0]),
        sshHosts: sanitizeSshHosts(section.sshHosts),
        hostKeys: sanitizeHostKeys(section.hostKeys),
        tunnels: sanitizeTunnels(section.tunnels),
        persistSessions: sanitizePersistSessions(section.persistSessions),
        // sftpLimits 必须留在清单里：apply 用展开运算合并它，传进非对象会把字符索引并进去
        sftpLimits: typeof section.sftpLimits === 'object' && section.sftpLimits !== null ? section.sftpLimits as Record<string, unknown> : undefined,
      })
      /*
       * ProxyCommand 闸门跟着 settings 走（**每次热应用都写一次**）：这一档是「设置字段驱动的
       * 本机任意命令执行」，关掉之后必须**立刻**对四条建连路径全部生效（终端 / SFTP / 隧道 /
       * 探针共用 ssh.ts 的模块级策略，见 setProxyCommandPolicy）。启动路径也走这里
       * （settings 就绪时 applyPatch 会被调用一次），所以不存在「忘了初始化 → 意外为开」。
       */
      setProxyCommandPolicy({ granted: capabilityGranted(CAP_PROXY_COMMAND), enabled: live.allowProxyCommand })
      if (typeof section.enabled === 'boolean') stateRef.enabled = section.enabled
      if (typeof section.announceToAgent === 'boolean') stateRef.announceToAgent = section.announceToAgent
      if (section.sftpStyle === 'dialog' || section.sftpStyle === 'dual') stateRef.sftpStyle = section.sftpStyle
      // 隧道按最新规格对齐（幂等；sshHosts 变更也会触发，让重连取到新凭证）。
      // 禁用态清空目标列表（拆掉活跃转发），重新启用后的下一次对齐自动恢复
      tunnelManager.reconcile(stateRef.enabled ? live.tunnels : [])
      if (typeof section.maxSessions === 'number' && Number.isInteger(section.maxSessions) && section.maxSessions >= 1 && section.maxSessions <= 16) {
        sessions.setLimit(section.maxSessions)
      }
      // 禁用/启用热生效（enabled 不再只是记账）：工具与公告重注册（幂等）、
      // WS 闸门与隧道随开关对齐。PTY 进程不杀——会话转孤儿保活，重新启用后
      // 客户端重连即 attach 回来
      refreshToolsHook()
      refreshAnnouncementHook()
      server.setWsGate(stateRef.enabled)
      // 状态条开关热生效：关的时候停掉全部采集（本地定时器 + 远端 exec channel）
      server.setStatsEnabled(live.statsEnabled)
      console.log(`[dsh-tty] config applied (shell=${live.shell}, term=${live.term}, cwd=${live.cwd}, maxSessions=${sessions.limitValue}, sshHosts=${live.sshHosts.length}, allowProxyCommand=${String(live.allowProxyCommand)}, enabled=${String(stateRef.enabled)})`)
    }

    /** 校验 HTTP POST 的配置体；返回规范化补丁或错误信息。 */
    const normalizePatch = (input: Record<string, unknown>): { patch?: Record<string, unknown>; error?: string } => {
      const patch: Record<string, unknown> = {}
      const known = new Set(['enabled', 'announceToAgent', 'maxSessions', 'shell', 'term', 'colorTerm', 'cwd', 'reconnectGraceSec', 'sshHosts', 'hostKeys', 'tunnels', 'shellIntegration', 'sftpStyle', 'persistence', 'endOnPageClose', 'statsEnabled', 'sftpLimits', 'allowProxyCommand', 'assistEnabled', 'assistProvider', 'assistModel'])
      for (const key of Object.keys(input)) {
        if (!known.has(key)) return { error: '未知配置项: ' + key }
      }
      if (input.enabled !== undefined) {
        if (typeof input.enabled !== 'boolean') return { error: 'enabled 必须是布尔值' }
        patch.enabled = input.enabled
      }
      if (input.announceToAgent !== undefined) {
        if (typeof input.announceToAgent !== 'boolean') return { error: 'announceToAgent 必须是布尔值' }
        patch.announceToAgent = input.announceToAgent
      }
      if (input.maxSessions !== undefined) {
        const value = Number(input.maxSessions)
        if (!Number.isInteger(value) || value < 1 || value > 16) return { error: 'maxSessions 必须是 1~16 的整数' }
        patch.maxSessions = value
      }
      if (input.reconnectGraceSec !== undefined) {
        const value = Number(input.reconnectGraceSec)
        if (!Number.isInteger(value) || value < 0 || value > 3600) return { error: 'reconnectGraceSec 必须是 0~3600 的整数' }
        patch.reconnectGraceSec = value
      }
      if (input.shellIntegration !== undefined) {
        if (typeof input.shellIntegration !== 'boolean') return { error: 'shellIntegration 必须是布尔值' }
        patch.shellIntegration = input.shellIntegration
      }
      if (input.sftpStyle !== undefined) {
        if (input.sftpStyle !== 'dialog' && input.sftpStyle !== 'dual') return { error: 'sftpStyle 必须是 dialog 或 dual' }
        patch.sftpStyle = input.sftpStyle
      }
      if (input.persistence !== undefined) {
        if (input.persistence !== 'off' && input.persistence !== 'tmux') return { error: 'persistence 必须是 off 或 tmux' }
        patch.persistence = input.persistence
      }
      if (input.endOnPageClose !== undefined) {
        if (typeof input.endOnPageClose !== 'boolean') return { error: 'endOnPageClose 必须是布尔值' }
        patch.endOnPageClose = input.endOnPageClose
      }
      if (input.statsEnabled !== undefined) {
        if (typeof input.statsEnabled !== 'boolean') return { error: 'statsEnabled 必须是布尔值' }
        patch.statsEnabled = input.statsEnabled
      }
      if (input.assistEnabled !== undefined) {
        if (typeof input.assistEnabled !== 'boolean') return { error: 'assistEnabled 必须是布尔值' }
        patch.assistEnabled = input.assistEnabled
      }
      /*
       * provider / model 刻意**允许空串**（与下方 shell/term/colorTerm 的「空串 = 不修改」
       * 不同）：空串是「跟随宿主默认模型」这个真实意图。也刻意**不在这里**校验成对——
       * 卡片是逐字段保存的，先填 provider 再填 model 必然经过一次「只填了一个」的中间态，
       * 在那里驳回会让用户根本填不完；成对规则留到真正解析路由时判（resolveAssistRoute）。
       */
      for (const key of ['assistProvider', 'assistModel'] as const) {
        if (input[key] === undefined) continue
        if (typeof input[key] !== 'string') return { error: key + ' 必须是字符串' }
        patch[key] = (input[key] as string).trim()
      }
      if (input.allowProxyCommand !== undefined) {
        if (typeof input.allowProxyCommand !== 'boolean') return { error: 'allowProxyCommand 必须是布尔值' }
        /*
         * **只能降不能升**：提权只认宿主侧的环境变量（进程启动时采样一次），HTTP 侧给 true
         * 一律驳回并说清怎么做。这不是「输入不合法」，而是「没获授权」——所以文案必须同时
         * 给出变量名与「要重启宿主」，否则用户会对着一个点不动的开关反复点。
         */
        if (input.allowProxyCommand && !capabilityGranted(CAP_PROXY_COMMAND)) {
          return { error: capabilityDeniedMessage(CAP_PROXY_COMMAND, { inPlace: true }) }
        }
        patch.allowProxyCommand = input.allowProxyCommand
      }
      for (const key of ['shell', 'term', 'colorTerm'] as const) {
        if (input[key] === undefined) continue
        if (typeof input[key] !== 'string') return { error: key + ' 必须是字符串' }
        if ((input[key] as string).trim() !== '') patch[key] = (input[key] as string).trim()
      }
      if (input.cwd !== undefined) {
        if (typeof input.cwd !== 'string') return { error: 'cwd 必须是字符串' }
        const cwd = input.cwd.trim()
        if (cwd !== '') {
          if (!existsSync(cwd)) return { error: 'cwd 不存在: ' + cwd }
          patch.cwd = cwd
        }
      }
      if (input.sshHosts !== undefined) {
        const validated = validateSshHosts(input.sshHosts)
        if (validated.error !== undefined) return { error: validated.error }
        patch.sshHosts = validated.hosts
      }
      if (input.hostKeys !== undefined) {
        const validated = validateHostKeys(input.hostKeys)
        if (validated.error !== undefined) return { error: validated.error }
        patch.hostKeys = validated.keys
      }
      if (input.tunnels !== undefined) {
        // bookName 交叉校验：优先用同次提交的 sshHosts（整体替换语义），否则用现有连接簿
        const bookSource = Array.isArray(patch.sshHosts) ? patch.sshHosts : live.sshHosts
        const bookNames = new Set(bookSource.map((host) => host.name))
        const validated = validateTunnels(input.tunnels, bookNames)
        if (validated.error !== undefined) return { error: validated.error }
        patch.tunnels = validated.tunnels
      }
      if (input.sftpLimits !== undefined) {
        if (typeof input.sftpLimits !== 'object' || input.sftpLimits === null || Array.isArray(input.sftpLimits)) return { error: 'sftpLimits 必须是对象' }
        const raw = input.sftpLimits as Record<string, unknown>
        const next: Partial<Record<keyof SftpLimits, number>> = {}
        for (const key of ['maxDownloadMb', 'maxUploadMb', 'maxUploadFiles'] as const) {
          if (raw[key] === undefined) continue
          const value = Number(raw[key])
          if (!Number.isInteger(value) || value < 0 || value > (key === 'maxUploadFiles' ? 100000 : 1024 * 1024)) {
            return { error: key + ' 必须是 0~' + (key === 'maxUploadFiles' ? '100000' : '1048576') + ' 的整数（0 = 不限）' }
          }
          next[key] = value
        }
        patch.sftpLimits = next
      }
      return { patch }
    }

    /*
     * credentials（**可选**依赖）：连接簿里的 `env:NAME` 是**引用**，值归官方凭据 provider ——
     * 它自己叠 `file`（`$DSH_HOME/.credentials.yaml`）/ `env` / `project-env` / `user-env` 各层，
     * 并保证「每次操作重新解析」（改完下一个操作即生效，不必重启宿主）。
     *
     * 为什么必须走它：凭据存储里的值**永远不会 materialize 进环境**（provider README 原话），
     * 所以只读 `process.env` 等于"存进凭据存储的密码连接时读不到" —— 「保存时存入凭据存储」
     * 那条链此前就是断在这里（客户端那半切好了、宿主这半没切）。
     *
     * 服务缺失（老宿主 / 未装该 bundle）时不注册，`resolveSecret` 自己退回 `process.env`，行为与
     * 从前一致 —— 所以这是**可选**依赖，不抬高 engines 下限。
     */
    ctx.inject(['credentials'], (credCtx: Context) => {
      setCredentialResolver((credCtx as unknown as { credentials?: CredentialResolver }).credentials ?? null)
      return () => { setCredentialResolver(null) }
    })

    /*
     * 就地提权（见 kit 的 elevation.ts）：卡片上点开关 → 宿主在确认目录里等一个随机名文件出现
     * → 授权写进 grant-store。
     *
     * `onGrantChange` 是这一段里**最容易漏、也最要紧**的一下：`setProxyCommandPolicy` 是终端 /
     * SFTP / 隧道 / 探针**四条建连路径共用**的模块级闸门，只写存储不重算就会留下两种半个状态——
     *   - 授权侧：授权到了，代理命令仍然被拒（用户以为没生效，再去点开关）；
     *   - 撤销侧：记录没了，本机仍在跑连接簿里那条命令（这一侧是安全问题，不是体验问题）。
     * `applyPatch({})` 用当前 live 兜底重算一次即可（它本来就每次都写一次策略，见那里的注释）。
     */
    const elevation = createElevationManager({
      confirmDir: paths.confirmDir,
      store: grantStore,
      logger: { info: (msg) => ctx.logger.info(msg), warn: (msg) => ctx.logger.warn(msg) },
      logPrefix: '[dsh-tty]',
      onGrantChange: () => {
        applyPatch({})
      },
    })
    ctx.effect(() => {
      return () => {
        elevation.dispose()
      }
    }, 'dsh-tty: elevation cleanup')

    // webServer：WS upgrade 路由 + 配置读写路由（/api/dsh-tty/config）
    ctx.inject(['webServer'], (webCtx: Context) => {
      webCtx.effect(() => {
        const webServer = (webCtx as unknown as {
          webServer: {
            registerUpgrade(route: unknown): () => void
            register(route: unknown): () => void
          }
        }).webServer
        const disposers: Array<() => void> = []
        // 数据路由的禁用守卫：enabled=false 时一律 403。/config 不走它——设置
        // 卡片靠它渲染，也是重新启用插件的唯一 UI 入口（不能一并关掉）。
        // never 参数做签名擦除：原样适配 ReqLike / IncomingMessage 等各种 handler。
        const guardDisabled =
          (handler: (req: never, res: never) => unknown) =>
          (req: never, res: never): unknown => {
            if (!stateRef.enabled) {
              writeJson(res as ResLike, 403, { error: '插件已禁用（插件配置 → 终端面板 → 启用插件）' })
              return
            }
            return handler(req, res)
          }
        const registerGated = (route: { kind: string; path: string; handler: (req: never, res: never) => unknown }): void => {
          disposers.push(webServer.register({ ...route, handler: guardDisabled(route.handler) }))
        }
        disposers.push(webServer.registerUpgrade({
          path: WS_PATH,
          handler: (req: ReqLike, socket: SocketLike, head: Buffer) => server.handleUpgrade(req, socket, head),
        }))
        disposers.push(webServer.register({
          kind: 'exact',
          path: '/api/dsh-tty/config',
          handler: async (req: ReqLike & AsyncIterable<Uint8Array>, res: ResLike) => {
            if (!(await gateRoute(req, res))) {
              return
            }
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
            const normalized = normalizePatch(body)
            if (normalized.error !== undefined) {
              writeJson(res, 400, { error: normalized.error })
              return
            }
            const patch = normalized.patch ?? {}
            const scope = settingsScope
            if (scope !== undefined) {
              try {
                // 官方持久化通道：settings.update(entryId) 写进本插件 entry 的 profile
                // patch（volatile 字段），成功后 loader 发 volatile 更新 → applyPatch 热应用
                await scope.update(patch)
              } catch (error) {
                writeJson(res, 500, { error: '保存配置失败: ' + (error instanceof Error ? error.message : String(error)) })
                return
              }
            }
            // 无 settings 服务（或 stub）时直接应用；有服务时也再应用一次（幂等）
            applyPatch(patch)
            writeJson(res, 200, { ok: true, config: snapshot() })
          },
        }))
        /*
         * AI 辅助「失败即解释」（0.24.0）。
         *
         * 与 /config 同档：**不进** MUTATION_SUBROUTES——它不改宿主状态；真正的闸是设置里
         * 那个**默认关闭**的开关（assistEnabled），回环围栏照常过。
         *
         * 刻意**不做流式**：本插件没有任何 SSE 基建，为一段几百 token 的回答新开一条流
         * 不划算；一次 POST 拿整段 + 客户端「取消」就够。模型的思考过程对用户也没有价值。
         */

        /*
         * 同一会话的**在途**询问（0.24.0，tty D94）。客户端已经拦了重复点击，但两个标签页、或客户端
         * 竞态仍可能同时打进来，而每一次都是**真花一次模型调用**。这里按 sid 记在途，
         * 重复的直接 409 挡回去；finally 里一定清，否则一次异常就把会话锁死。
         */
        const assistInFlight = new Set<string>()
        disposers.push(webServer.register({
          kind: 'exact',
          path: '/api/dsh-tty/assist',
          handler: async (req: ReqLike & AsyncIterable<Uint8Array>, res: ResLike) => {
            if (!(await gateRoute(req, res))) {
              return
            }
            if (req.method !== 'POST') {
              writeJson(res, 405, { error: 'method not allowed: ' + String(req.method) })
              return
            }
            /*
             * 开关是**宿主侧**的闸，不靠客户端自觉：关掉时客户端连徽标都收不到，但配置
             * 随时可被改，而「关掉必须立刻生效」是这类外发开关的底线。
             */
            if (!live.assistEnabled) {
              writeJson(res, 403, { error: 'AI 辅助未开启（插件配置 → 终端面板 → 「失败即解释」）' })
              return
            }
            const body = await readJsonBody(req)
            if (body === undefined) {
              writeJson(res, 400, { error: 'invalid JSON body' })
              return
            }
            const sid = typeof body.sid === 'string' ? body.sid : ''
            const session = sessions.get(sid)
            if (sid === '' || session === undefined || session.closed) {
              writeJson(res, 404, { error: '会话不存在或已退出: ' + sid })
              return
            }
            const resolved = resolveAssistRoute(ctx, live.assistProvider, live.assistModel)
            if (resolved.route === undefined) {
              writeJson(res, 409, { error: resolved.error ?? '没有可用的模型路由' })
              return
            }
            const llm = getService(ctx, 'llm') as LlmLike | undefined
            if (llm === undefined || llm === null || typeof llm.stream !== 'function') {
              writeJson(res, 409, { error: '宿主 llm 服务不可用（当前宿主没有提供模型调用）' })
              return
            }
            /*
             * 进到这行才说明这次真的要花一次模型调用了，所以在**这里**记账（而不是上面更早处）：
             * 重复请求挡在门外、且不占用一次调用。
             */
            if (assistInFlight.has(sid)) {
              writeJson(res, 409, { error: '这条命令的解释正在生成中，稍等一下再试' })
              return
            }
            assistInFlight.add(sid)
            const last = session.shellState.lastCommand
            const prompt = buildFailurePrompt({
              shell: session.kind === 'ssh' ? 'ssh ' + session.target : live.shell,
              cwd: session.cwd,
              exitCode: last === null ? null : last.exitCode,
              output: last === null ? '' : last.output,
              screen: session.screen === null ? '' : screenTextOf(session.screen),
              lang: body.lang === 'en' ? 'en' : 'zh',
            })
            const started = Date.now()
            try {
              const raw = await askModelOnce(llm, resolved.route, prompt)
              writeJson(res, 200, {
                ok: true,
                /*
                 * 界面正文用**去标记后的纯文本**（围栏与 ** 都去掉）：命令另有 command 字段
                 * 专门展示，正文里再来一遍是重复；而把 Markdown 原样铺在界面上就是满屏星号。
                 * 标记的解析在这里一次做完，客户端只负责原样显示。
                 */
                answer: plainAnswerText(raw),
                // 「填入」按钮用：只在模型给了围栏代码块时非空（见 extractCommandFromAnswer）
                command: extractCommandFromAnswer(raw),
                route: resolved.route.provider + '/' + resolved.route.model,
                chars: prompt.user.length,
                ms: Date.now() - started,
              })
            } catch (error) {
              writeJson(res, 502, { error: error instanceof Error ? error.message : String(error) })
            } finally {
              // 无论成功、报错还是超时都要放行，否则这个会话从此再也问不动
              assistInFlight.delete(sid)
            }
          },
        }))
        /*
         * 模型候选（0.24.0）：设置卡片里 provider / model 两栏的候选列表。
         *
         * 与 `/shells` 同档：loopback 围栏、纯只读、不改宿主状态，也不进 MUTATION_SUBROUTES。
         * **不看 assistEnabled**：卡片要在功能关着时也能把路由配好（同 /config 的理由）。
         * 也不带会话概念——它回答的是「宿主这台机器上有什么」，与终端会话无关。
         */
        registerGated({
          kind: 'exact',
          path: '/api/dsh-tty/model-catalog',
          handler: async (req: ReqLike, res: ResLike) => {
            if (!(await gateRoute(req, res))) {
              return
            }
            if (req.method !== 'GET') {
              writeJson(res, 405, { error: 'method not allowed: ' + String(req.method) })
              return
            }
            const provider = (new URL(req.url ?? '/', 'http://loopback').searchParams.get('provider') ?? '').trim()
            const llm = getService(ctx, 'llm')
            const available = llm !== undefined && llm !== null && typeof (llm as LlmLike).listModels === 'function'
            const providers = listProvidersOf(llm)
            writeJson(res, 200, {
              ok: true,
              // available=false 只用来把提示说准（「宿主没这个目录」vs「目录是空的」），不是错误
              available,
              providers,
              /*
               * 不带 provider：一次往返就把**每个** provider 的模型都取回来。控件的候选表是
               * 「渠道 + 模型」一张表，逐个 provider 再发一轮请求会把它变成 N 次往返。
               */
              groups: provider === '' ? await listGroupsOf(llm, providers) : [],
              // 带 provider：只问这一个（候选表要重取单个渠道时用）
              models: provider === '' ? [] : await listModelsOf(llm, provider),
              provider,
            })
          },
        })
        /*
         * 就地提权（`/elevate`、`/elevate/status`、`/elevate/revoke`）。
         *
         * 三条**全 POST**、**逐条**进 MUTATION_SUBROUTES（判据是「精确子路径 + POST」，只写一条
         * 另外两条就是裸的 → docker D144），且分发必须在证明检查**之后**——`sub` 一旦拿去分支，
         * 后面再补证明就晚了。
         *
         * 刻意**不走** registerGated：授权是宿主级的，插件当前禁用时也该能在卡片里提权/撤销
         * （卡片本身是禁用后唯一的恢复入口，与 /config 同一条理由）。
         */
        disposers.push(webServer.register({
          kind: 'prefix',
          path: '/api/dsh-tty/elevate',
          handler: async (req: ReqLike & AsyncIterable<Uint8Array>, res: ResLike) => {
            const sub = new URL(req.url ?? '/', 'http://loopback').pathname.slice('/api/dsh-tty/elevate'.length)
            if (!(await gateRoute(req, res, { mutation: isMutationSubroute('/api/dsh-tty/elevate', sub) }))) {
              return
            }
            if (req.method !== 'POST') {
              writeJson(res, 405, { error: 'method not allowed: ' + String(req.method) })
              return
            }
            if (sub !== '' && sub !== '/status' && sub !== '/revoke') {
              writeJson(res, 404, { error: 'not found' })
              return
            }
            const body = await readJsonBody(req)
            if (body === undefined) {
              writeJson(res, 400, { error: 'invalid JSON body' })
              return
            }
            // 白名单：别让请求方决定查哪个键（那张表是宿主侧的策略来源）
            if (body.capability !== undefined && body.capability !== CAP_PROXY_COMMAND.env) {
              writeJson(res, 400, { error: '未知能力: ' + String(body.capability) })
              return
            }
            if (sub === '/status') {
              writeJson(res, 200, elevation.status(CAP_PROXY_COMMAND.env))
              return
            }
            if (sub === '/revoke') {
              // 降权零门槛：撤销不要求任何确认（紧急刹车不等重启）。撤销带来的策略重算由
              // elevation 的 onGrantChange 负责——不重算就会留下「记录没了、本机还在跑命令」
              writeJson(res, 200, { revoked: elevation.revoke(CAP_PROXY_COMMAND.env) })
              return
            }
            const result = elevation.begin(CAP_PROXY_COMMAND.env)
            if (result.status === 'rate-limited') {
              writeJson(res, 429, { error: '请求过于频繁，请稍后再试', retryAfterMs: result.retryAfterMs })
              return
            }
            if (result.status === 'error') {
              writeJson(res, 500, { error: result.error })
              return
            }
            // 只回状态与一次性命令；nonce 就在命令里，**不进日志**（见 elevation.ts 的不变量）
            writeJson(res, 200, result)
          },
        }))
        // ~/.ssh/config 导入候选（连接簿）：loopback 围栏，只回解析结果不落盘。
        // 除了候选，还**如实回报丢弃了什么**（依赖跳板机 / 通配 / 无 User / 超上限）：
        // 静默少列是本仓反复出现的一类缺陷，而「导进来的条目注定连不上」更难排——见
        // 项目级 ROADMAP 第 2 项。
        registerGated({
          kind: 'exact',
          path: '/api/dsh-tty/ssh-config',
          handler: async (req: ReqLike, res: ResLike) => {
            if (!(await gateRoute(req, res))) {
              return
            }
            if (req.method !== 'GET') {
              writeJson(res, 405, { error: 'method not allowed: ' + String(req.method) })
              return
            }
            try {
              const text = readFileSync(expandHome('~/.ssh/config'), 'utf8')
              writeJson(res, 200, { ok: true, ...parseSshConfigDetailed(text) })
            } catch (error) {
              writeJson(res, 200, { ok: false, error: '无法读取 ~/.ssh/config: ' + (error instanceof Error ? error.message : String(error)) })
            }
          },
        })
        // env:VAR 下拉数据源（SSH 对话框）：只回 env 插件托管变量名，绝不含值
        registerGated({
          kind: 'exact',
          path: '/api/dsh-tty/env-vars',
          handler: async (req: ReqLike, res: ResLike) => {
            if (!(await gateRoute(req, res))) {
              return
            }
            if (req.method !== 'GET') {
              writeJson(res, 405, { error: 'method not allowed: ' + String(req.method) })
              return
            }
            writeJson(res, 200, { ok: true, names: readManagedEnvKeys() })
          },
        })
        // 凭据存储里已知的引用名（SSH 对话框选择器候选）：只回**名字**，绝不回值。
        // 为什么不像其它设置界面那样只列"自己 schema 里的引用"：官方那条路对这本存储
        // 来说列不全（引用半边不可枚举，见 readCredentialRefNames），而这个选择器的用途
        // 恰恰就是"我存过什么、能不能复用"。
        registerGated({
          kind: 'exact',
          path: '/api/dsh-tty/credential-refs',
          handler: handleCredentialRefsRoute,
        })
        // known_hosts 指纹导入候选（TOFU 预填充）：hashed 条目用连接簿主机名还原
        registerGated({
          kind: 'exact',
          path: '/api/dsh-tty/known-hosts',
          handler: async (req: ReqLike, res: ResLike) => {
            if (!(await gateRoute(req, res))) {
              return
            }
            if (req.method !== 'GET') {
              writeJson(res, 405, { error: 'method not allowed: ' + String(req.method) })
              return
            }
            try {
              const text = readFileSync(expandHome('~/.ssh/known_hosts'), 'utf8')
              const candidates = live.sshHosts.flatMap((entry) => [entry.host, `[${entry.host}]:${entry.port}`])
              // truncated（0.19.0）：超 500 条截断时明确告知，用户不再蒙在鼓里
              const parsedKnownHosts = parseKnownHostsDetailed(text, candidates)
              writeJson(res, 200, { ok: true, entries: parsedKnownHosts.entries, truncated: parsedKnownHosts.truncated })
            } catch (error) {
              writeJson(res, 200, { ok: false, error: '无法读取 ~/.ssh/known_hosts: ' + (error instanceof Error ? error.message : String(error)) })
            }
          },
        })
        // SSH 连接测试（0.11.0，src/probe.ts）：连接簿行「测试」与 SSH 对话框
        // 「试连」共用。body 携带完整内联 SSH 规格（不引用连接簿——卡片测试
        // 由客户端先行展开条目），免去服务端按 name 解析；只诊断不建会话。
        // 连接簿条目测试传 store（新指纹当场 TOFU record）；对话框试连不带
        // store（只比对不落盘，避免给未保存草稿建立钉扎）。
        registerGated({
          kind: 'exact',
          path: '/api/dsh-tty/probe',
          handler: async (req: ReqLike & AsyncIterable<Uint8Array>, res: ResLike) => {
            // 变更端点：这次请求真的拨号，且连接簿条目测试会当场记录主机指纹（TOFU）
            if (!(await gateRoute(req, res, { mutation: true }))) {
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
            const host = typeof body.host === 'string' ? body.host.trim() : ''
            const username = typeof body.username === 'string' ? body.username.trim() : ''
            if (host === '' || username === '') {
              writeJson(res, 200, { ok: false, error: '主机与用户名必填' })
              return
            }
            let port = 22
            if (body.port !== undefined && body.port !== '') {
              const value = Number(body.port)
              if (!Number.isInteger(value) || value < 1 || value > 65535) {
                writeJson(res, 200, { ok: false, error: '端口必须是 1~65535 的整数' })
                return
              }
              port = value
            }
            const auth = body.auth === 'key' || body.auth === 'password' ? body.auth : 'agent'
            const spec: SshSpec = { host, port, username, auth }
            // 对话框「试连」可能带跳板机（连接簿条目由客户端先行展开；跳板机同理）
            const probeJump = validateJumpSpec(body.jump)
            if (body.jump !== undefined && probeJump.error !== undefined) {
              writeJson(res, 200, { ok: false, error: probeJump.error })
              return
            }
            if (probeJump.jump !== undefined) spec.jump = probeJump.jump
            // 代理命令同理（对话框试连会带上当前填写值）：形状非法就明确报错，别静默当没填
            const probeProxy = validateProxyCommand(body.proxyCommand ?? '')
            if (probeProxy.error !== undefined) {
              writeJson(res, 200, { ok: false, error: probeProxy.error })
              return
            }
            if (probeProxy.proxyCommand !== undefined) spec.proxyCommand = probeProxy.proxyCommand
            if (auth === 'key') {
              const keyPath = typeof body.keyPath === 'string' ? body.keyPath.trim() : ''
              if (keyPath === '') {
                writeJson(res, 200, { ok: false, error: 'auth=key 需要私钥路径' })
                return
              }
              spec.keyPath = keyPath
              const passphrase = typeof body.passphrase === 'string' ? body.passphrase : ''
              if (passphrase !== '') spec.passphrase = passphrase
            }
            if (auth === 'password') {
              const password = typeof body.password === 'string' ? body.password : ''
              if (password === '') {
                writeJson(res, 200, { ok: false, error: 'auth=password 需要密码' })
                return
              }
              spec.password = password
            }
            if (body.agentForward === true) spec.agentForward = true
            // bookRecord=true：来自连接簿条目的完整 TOFU（store 记录新指纹）；
            // 缺省（对话框试连）只比对不落盘
            const result = await probeSsh(spec, body.bookRecord === true ? hostKeyStore : undefined)
            writeJson(res, 200, { ok: result.auth.ok, result })
          },
        })
        // 已安装 shell 候选（设置卡片「Shell 路径」可选可输入）：loopback 围栏，只回路径不执行
        registerGated({
          kind: 'exact',
          path: '/api/dsh-tty/shells',
          handler: async (req: ReqLike, res: ResLike) => {
            if (!(await gateRoute(req, res))) {
              return
            }
            if (req.method !== 'GET') {
              writeJson(res, 405, { error: 'method not allowed: ' + String(req.method) })
              return
            }
            writeJson(res, 200, { ok: true, shells: listCandidateShells(), current: process.env.SHELL ?? '' })
          },
        })
        // 端口转发隧道实时状态（设置卡片轮询徽标 + tunnel_list 工具数据源）
        registerGated({
          kind: 'exact',
          path: '/api/dsh-tty/tunnels',
          handler: async (req: ReqLike, res: ResLike) => {
            if (!(await gateRoute(req, res))) {
              return
            }
            if (req.method !== 'GET') {
              writeJson(res, 405, { error: 'method not allowed: ' + String(req.method) })
              return
            }
            writeJson(res, 200, { ok: true, tunnels: tunnelManager.list() })
          },
        })
        // SFTP 文件传输（0.7.0，src/sftp.ts）：loopback 围栏；spec 解析与 WS ssh
        // 帧同款（mergeSshSpec：连接簿条目作基底 + 内联字段覆盖）。list/mkdir/
        // rename/remove/download 走 JSON 体（凭证不进 URL/查询串）；download 响应
        // 为文件字节流（stat 成功时带 content-length）；upload 以 x-dsh-sftp-meta
        // 头携带 base64url(JSON)（spec + path + append），请求体即原始文件字节，
        // pipeline 直灌 SFTP 写流——上传下载都不整文件进内存。
        registerGated({
          kind: 'prefix',
          path: '/api/dsh-tty/sftp',
          handler: async (req: IncomingMessage, res: ServerResponse) => {
            const sub = new URL(req.url ?? '/', 'http://loopback').pathname.slice('/api/dsh-tty/sftp'.length)
            // 改状态的三个动作 + 上传要同源证明；/list 与 /download 只读（判据见 gateRoute）
            if (!(await gateRoute(req, res, { mutation: isMutationSubroute('/api/dsh-tty/sftp', sub) }))) {
              return
            }
            const jsonAction = (['/list', '/mkdir', '/rename', '/remove', '/download'] as const).find((action) => action === sub)
            if (jsonAction !== undefined) {
              if (req.method !== 'POST') {
                writeJson(res, 405, { error: 'method not allowed: ' + String(req.method) })
                return
              }
              const body = await readJsonBody(req)
              if (body === undefined) {
                writeJson(res, 400, { error: 'invalid JSON body' })
                return
              }
              const parsed = mergeSshSpec((name) => live.findSshHost(name), body.name, body)
              if (parsed.spec === undefined) {
                writeJson(res, 400, { error: parsed.error ?? '无效的 SSH 连接规格' })
                return
              }
              const spec = parsed.spec
              const strField = (key: string): string => (typeof body[key] === 'string' ? (body[key] as string).trim() : '')
              try {
                if (jsonAction === '/list') {
                  const result = await sftpManager.list(spec, strField('path'))
                  writeJson(res, 200, { ok: true, path: result.path, entries: result.entries })
                  return
                }
                if (jsonAction === '/mkdir') {
                  if (strField('path') === '') throw new Error('path 必填')
                  await sftpManager.mkdir(spec, strField('path'), body.parents === true)
                  writeJson(res, 200, { ok: true })
                  return
                }
                if (jsonAction === '/rename') {
                  if (strField('from') === '' || strField('to') === '') throw new Error('from/to 必填')
                  await sftpManager.rename(spec, strField('from'), strField('to'))
                  writeJson(res, 200, { ok: true })
                  return
                }
                if (jsonAction === '/remove') {
                  if (strField('path') === '') throw new Error('path 必填')
                  await sftpManager.remove(spec, strField('path'), body.recursive === true)
                  writeJson(res, 200, { ok: true })
                  return
                }
                // download：路径必填（无 home 兜底），流式回包
                const target = strField('path')
                if (target === '') throw new Error('path 必填')
                const { stream, size } = await sftpManager.openDownload(spec, target)
                res.writeHead(200, {
                  'content-type': 'application/octet-stream',
                  'content-disposition': contentDispositionValue(remoteBasename(target)),
                  ...(size !== null ? { 'content-length': String(size) } : {}),
                })
                // 客户端中断或写流失败都要回收 SFTP 读流，避免连接池通道悬挂
                res.on('close', () => {
                  if (res.writableEnded !== true) stream.destroy()
                })
                stream.on('error', (error: Error) => {
                  ctx.logger.warn('[dsh-tty] sftp 下载流错误: ' + error.message)
                  res.destroy()
                })
                stream.pipe(res)
                return
              } catch (error) {
                const message = error instanceof Error ? error.message : String(error)
                // 下载路径不存在 → 404（0.19.0：openDownload 现在会明确抛错而不是 200+断流）
                writeJson(res, message.includes('远程路径不存在') ? 404 : 500, { error: message })
                return
              }
            }
            if (sub === '/upload') {
              if (req.method !== 'POST') {
                writeJson(res, 405, { error: 'method not allowed: ' + String(req.method) })
                return
              }
              const metaRaw = req.headers['x-dsh-sftp-meta']
              let meta: Record<string, unknown> | undefined
              if (typeof metaRaw === 'string' && metaRaw !== '') {
                try {
                  const parsedMeta: unknown = JSON.parse(Buffer.from(metaRaw, 'base64url').toString('utf8'))
                  if (typeof parsedMeta === 'object' && parsedMeta !== null && !Array.isArray(parsedMeta)) meta = parsedMeta as Record<string, unknown>
                } catch {
                  /* 落到下面的 400 */
                }
              }
              if (meta === undefined) {
                writeJson(res, 400, { error: '缺少或非法的 x-dsh-sftp-meta 头' })
                return
              }
              const target = typeof meta.path === 'string' ? meta.path.trim() : ''
              if (target === '') {
                writeJson(res, 400, { error: 'meta.path 必填' })
                return
              }
              const parsed = mergeSshSpec((name) => live.findSshHost(name), meta.name, meta)
              if (parsed.spec === undefined) {
                writeJson(res, 400, { error: parsed.error ?? '无效的 SSH 连接规格' })
                return
              }
              // 取消上传（0.12.0）：客户端中断 → 打断 pipeline 并清理远端半截产物。
              // 判据用「close 时请求未完整收到」——req 'aborted' 事件已废弃。
              // 0.19.0 起覆盖写走临时分片 + rename（见 openUpload）：取消清理删的
              // 是分片（writePath），目标原文件不受影响；追加写内容已进目标尾部，
              // 没有可回滚的半截，不删整个文件。
              const controller = new AbortController()
              let abortedByClient = false
              let writePath = target
              req.on('close', () => {
                if (req.complete !== true && res.writableEnded !== true && !abortedByClient) {
                  abortedByClient = true
                  controller.abort()
                }
              })
              try {
                const upload = await sftpManager.openUpload(parsed.spec, target, meta.append === true)
                writePath = upload.writePath
                let bytes = 0
                req.on('data', (chunk: Buffer) => {
                  bytes += chunk.length
                })
                await pipeline(req, upload.stream, { signal: controller.signal })
                await upload.done
                writeJson(res, 200, { ok: true, bytes })
              } catch (error) {
                if (abortedByClient) {
                  if (meta.append !== true) void sftpManager.deleteRemoteQuiet(parsed.spec, writePath)
                  return
                }
                const message = error instanceof Error ? error.message : String(error)
                if (res.headersSent) res.destroy()
                else writeJson(res, 500, { error: message })
              }
              return
            }
            writeJson(res, 404, { error: 'not found: ' + sub })
          },
        })
        // 本机文件浏览（0.9.0，双栏 SFTP 的本机一侧）：loopback 围栏。信任模型
        // 与终端/SFTP 一致——浏览器仅同源可访问，且本机能做的 SSH 会话也能做；
        // list/mkdir/rename/remove 操作本机路径；transfer 在服务端把本机路径与
        // 远程路径流式对拷（凭证不落浏览器，字节不经过浏览器）。
        registerGated({
          kind: 'prefix',
          path: '/api/dsh-tty/local-fs',
          handler: async (req: IncomingMessage, res: ServerResponse) => {
            const sub = new URL(req.url ?? '/', 'http://loopback').pathname.slice('/api/dsh-tty/local-fs'.length)
            // 改状态的四个动作（含起一个传输任务）要同源证明；/list 只读（判据见 gateRoute）
            if (!(await gateRoute(req, res, { mutation: isMutationSubroute('/api/dsh-tty/local-fs', sub) }))) {
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
            const strField = (key: string): string => (typeof body[key] === 'string' ? (body[key] as string).trim() : '')
            try {
              if (sub === '/list') {
                const result = await listLocalDir(strField('path'))
                writeJson(res, 200, { ok: true, path: result.path, entries: result.entries })
                return
              }
              if (sub === '/mkdir') {
                const target = strField('path')
                if (target === '') throw new Error('path 必填')
                await fsMkdir(target, { recursive: body.parents === true })
                writeJson(res, 200, { ok: true })
                return
              }
              if (sub === '/rename') {
                const from = strField('from')
                const to = strField('to')
                if (from === '' || to === '') throw new Error('from/to 必填')
                await fsRename(from, to)
                writeJson(res, 200, { ok: true })
                return
              }
              if (sub === '/remove') {
                const target = strField('path')
                if (target === '') throw new Error('path 必填')
                await fsRm(target, { recursive: body.recursive === true })
                writeJson(res, 200, { ok: true })
                return
              }
              if (sub === '/transfer') {
                // up = 本机→远程（上传），down = 远程→本机（下载）；目录递归
                // 0.12.0：任务化（start 返回 jobId，浏览器可轮询进度 / 取消），
                // 代替原先「一个 HTTP 请求同步跑完、无法打断」的直传。
                const action = strField('action')
                const jobId = strField('job')
                if (action === 'status') {
                  if (jobId === '') throw new Error('job 必填')
                  const job = sftpManager.getTransfer(jobId)
                  if (job === undefined) {
                    writeJson(res, 404, { error: '传输任务不存在或已回收' })
                    return
                  }
                  writeJson(res, 200, { ok: true, job })
                  return
                }
                if (action === 'cancel') {
                  if (jobId === '') throw new Error('job 必填')
                  const job = sftpManager.cancelTransfer(jobId)
                  if (job === undefined) {
                    writeJson(res, 404, { error: '传输任务不存在或已回收' })
                    return
                  }
                  writeJson(res, 200, { ok: true, job })
                  return
                }
                if (action !== '' && action !== 'start') throw new Error('action 必须是 start/status/cancel')
                const direction = strField('direction')
                const localPath = strField('localPath')
                const remotePath = strField('remotePath')
                if (localPath === '' || remotePath === '') throw new Error('localPath/remotePath 必填')
                if (direction !== 'up' && direction !== 'down') throw new Error('direction 必须是 up 或 down')
                const parsed = mergeSshSpec((name) => live.findSshHost(name), body.name, body)
                if (parsed.spec === undefined) {
                  writeJson(res, 400, { error: parsed.error ?? '无效的 SSH 连接规格' })
                  return
                }
                const job = sftpManager.startTransfer(parsed.spec, direction, localPath, remotePath)
                writeJson(res, 200, { ok: true, job })
                return
              }
              writeJson(res, 404, { error: 'not found: ' + sub })
            } catch (error) {
              writeJson(res, 500, { error: error instanceof Error ? error.message : String(error) })
            }
          },
        })
        return () => {
          server.close()
          for (const dispose of disposers) {
            try {
              dispose()
            } catch {
              /* 路由已释放 */
            }
          }
        }
      }, 'dsh-tty: web routes')
    })

    // settings：DSH ≥0.1.7 起存储就是本插件 entry 的 Config（导出为 `Config`，可写字段
    // 标了 volatile）。启动合并一次持久化值，之后由 loader 的 volatile 更新事件热应用。
    ctx.inject(['settings'], (settingsCtx: Context) => {
      settingsCtx.effect(() => {
        const scope = settingsEntryScope(settingsCtx, 'tty')
        // 服务形态不符（老宿主 / 最小宿主）时不装 scope：卡片仍可看快照，只是不持久化。
        if (scope === undefined) return () => {}
        // 卡片是自定义页（plugins.row.config），别再让 DSH 为本 entry 自动生成一份。
        const offAutoPage = suppressAutoSettingsPage(settingsCtx, ctx)
        settingsScope = scope
        // 启动合并：字符串字段非空才覆盖；maxSessions/布尔用「非默认值才覆盖」启发式
        //（schema 默认值会混入 resolved，无法区分「显式保存的 4」与「从未保存」）。
        const stored = scope.get()
        const startup: Record<string, unknown> = {}
        if (typeof stored.shell === 'string' && stored.shell.trim() !== '') startup.shell = stored.shell
        if (typeof stored.term === 'string' && stored.term.trim() !== '') startup.term = stored.term
        if (typeof stored.colorTerm === 'string' && stored.colorTerm.trim() !== '') startup.colorTerm = stored.colorTerm
        if (typeof stored.cwd === 'string' && stored.cwd.trim() !== '') startup.cwd = stored.cwd
        if (stored.maxSessions !== 4 && typeof stored.maxSessions === 'number') startup.maxSessions = stored.maxSessions
        if (stored.enabled === false) startup.enabled = false
        if (stored.announceToAgent === false) startup.announceToAgent = false
        if (stored.reconnectGraceSec !== 120 && typeof stored.reconnectGraceSec === 'number' && Number.isInteger(stored.reconnectGraceSec) && stored.reconnectGraceSec >= 0 && stored.reconnectGraceSec <= 3600) {
          startup.reconnectGraceSec = stored.reconnectGraceSec
        }
        if (stored.shellIntegration === false) startup.shellIntegration = false
        if (stored.sftpStyle === 'dual') startup.sftpStyle = 'dual'
        if (stored.persistence === 'tmux') startup.persistence = 'tmux'
        if (stored.endOnPageClose === true) startup.endOnPageClose = true
        const storedPersistSessions = sanitizePersistSessions(stored.persistSessions)
        if (storedPersistSessions !== undefined && storedPersistSessions.length > 0) startup.persistSessions = storedPersistSessions
        const storedHosts = sanitizeSshHosts(stored.sshHosts)
        if (storedHosts !== undefined && storedHosts.length > 0) startup.sshHosts = storedHosts
        const storedKeys = sanitizeHostKeys(stored.hostKeys)
        if (storedKeys !== undefined && storedKeys.length > 0) startup.hostKeys = storedKeys
        const storedTunnels = sanitizeTunnels(stored.tunnels)
        if (storedTunnels !== undefined && storedTunnels.length > 0) startup.tunnels = storedTunnels
        if (Object.keys(startup).length > 0) applyPatch(startup)
        const off = scope.onChanged(() => applyPatch(scope.get()))
        return () => {
          off()
          offAutoPage()
          settingsScope = undefined
        }
      }, 'dsh-tty: settings')
    })

    // agent 工具集（P1）：tty_list / tty_open / tty_close / tty_stats / tty_capture / tty_send …
    // 信任模型：与 bash 工具同权（agent 本就能执行任意命令），不额外加确认层；
    // agent 对终端的操作会实时出现在浏览器面板里（同一 PTY），天然可被用户观察。
    // inject: ['tools'] 声明后（见上方），ctx.get('tools') 才能解析到服务。
    const toolsHost = (ctx as unknown as { get(name: string): { register(definition: unknown): () => void } | undefined }).get('tools')
    if (toolsHost !== undefined) {
      ctx.effect(() => {
        const tools = toolsHost
        const tailLines = (session: TtySession, lines: number): string => {
          const parts = session.buffer.split('\n')
          return parts.slice(-(lines + 1)).join('\n').replace(/^\n+/, '')
        }
        let activeDisposers: Array<() => void> = []
        /** 幂等重注册：撤下现有工具后按 enabled 决定是否重挂（禁用热生效的入口；由 applyPatch 经 refreshToolsHook 触发）。 */
        const registerAll = (): void => {
          for (const dispose of activeDisposers) {
            try {
              dispose()
            } catch {
              /* 工具已注销 */
            }
          }
          activeDisposers = []
          if (!stateRef.enabled) {
            stateRef.toolsRegistered = false
            console.log('[dsh-tty] agent tools skipped (disabled)')
            return
          }
          activeDisposers.push(tools.register(defineTool({
            name: 'tty_list',
            // 只读工具：与同轮其它工具并发执行（宿主默认把未声明的工具当独占，见项目级 ROADMAP 第 4 项）
            isConcurrencySafe: () => true,
            description: '列出当前终端面板会话（sid / kind(local|ssh) / target / pid / cwd / 创建与最后活动时间），**含进程已退出但仍只读保留着的会话**（带 exited:true + 退出码/信号；按时间释放时另带 retainMs）。**running** 说明这个会话有没有命令在跑（true = 在跑，现在别往里发命令，那些字节会被正在跑的程序当输入吃掉；false = 命令已结束；**省略 = 无法判断**——该会话没有 shell 集成标记，例如非持久 SSH / fish·csh / Windows 本地 / 集成被关，**不是**「没在跑」）；同源的 lastExitCode / lastExitAt 是「上一条已完成命令」的退出码与结束时刻。用户开了终端面板后，用 tty_capture 读取某个 sid 的输出、用 tty_send 向该会话发送按键。已退出的会话只能读（写会报错），要接着操作请 tty_open 新开一条。',
            parameters: {},
            output: {
              schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  sessions: {
                    type: 'array',
                    required: true,
                    items: {
                      type: 'object',
                      additionalProperties: false,
                      properties: {
                        sid: { type: 'string', required: true },
                        kind: { type: 'string', required: true },
                        target: { type: 'string', required: true },
                        pid: { type: 'number' },
                        cwd: { type: 'string', required: true },
                        startedAt: { type: 'number', required: true },
                        lastOutputAt: { type: 'number', required: true },
                        persist: { type: 'boolean' },
                        owner: { type: 'string', required: true },
                        exited: { type: 'boolean' },
                        exitCode: { type: 'number' },
                        signal: { type: 'string' },
                        retainMs: { type: 'number', description: '只读保留的剩余毫秒；省略 = 不按时间释放' },
                        running: { type: 'boolean', description: '有命令正在执行；**省略 = 无法判断**（该会话没有 shell 集成标记），不等于「没在跑」' },
                        lastExitCode: { type: 'number', description: '上一条已完成命令的退出码' },
                        lastExitAt: { type: 'number', description: '上一条已完成命令的结束时刻（epoch ms）' },
                      },
                    },
                  },
                },
              },
              render: (_args: unknown, value: unknown) => {
                const sessions = (value as { sessions?: SessionSnapshot[] })?.sessions ?? []
                const text = sessions.length === 0
                  ? '当前没有终端面板会话（可用 tty_open 自己开一个，或引导用户打开终端面板）'
                  : '终端面板会话：' + sessions.map((s) => {
                      const where = s.kind === 'ssh' ? `ssh ${s.target}` : `pid=${String(s.pid ?? '?')} cwd=${s.cwd}`
                      const persist = s.persist === true ? ' [tmux 持久]' : ''
                      const owner = s.owner === 'agent' ? ' [agent 开的]' : ''
                      // D88：三态必须在**渲染文本**里就分得开——agent 只看得到这段文本，
                      // 而「无法判断」与「空闲」在旧写法里都渲染成「没有标记」，正好把新加的
                      // 第三态糊掉了（用户验收现场：自己那条会话与既有的两条长得一模一样）。
                      // 正在跑的会话尤其要显眼：往里发命令会被那个程序当输入吃掉。
                      const runMark = s.exited === true
                        ? ''
                        : s.running === true
                          ? ' [运行中——现在别往里发命令]'
                          : s.running === false
                            ? ' [空闲]'
                            : ' [命令状态未知——该会话没有 shell 集成标记，发命令前先自己确认]'
                      // 已退出会话的退出码由 gone 那条统管，这里只标活会话的「上一条」
                      const lastExit = s.exited === true || s.lastExitCode === undefined ? '' : ` [上一条命令 exitCode=${String(s.lastExitCode)}]`
                      // D77：只读保留态必须显眼——否则 AI 会对着一个已经死掉的会话发命令
                      const detail = s.signal !== undefined && s.signal !== '' ? `signal=${s.signal}` : s.exitCode === undefined ? '退出码未知' : `exitCode=${String(s.exitCode)}`
                      const left = s.retainMs === undefined ? '（显式关闭前一直都在）' : ` ${String(Math.ceil(s.retainMs / 60000))} 分钟`
                      const gone = s.exited === true ? ` [已退出 ${detail}·只读保留${left}——只能读，写会报错]` : ''
                      return `\n- sid=${s.sid} [${s.kind}]${owner}${persist}${runMark}${lastExit}${gone} ${where} (启动于 ${new Date(s.startedAt).toLocaleString()})`
                    }).join('')
                return [{ type: 'text', text }]
              },
            },
            async execute(): Promise<{ sessions: ReturnType<SessionManager['list']> }> {
              // D72：agent 第一次「看见」这些会话时把水位线落在当下——否则第一次
              // tty_expect 会把用户早先的历史输出当成「还没读过的输出」回扫过来
              sessions.forEach((session) => { ensureReadMark(session) })
              return { sessions: sessions.list() }
            },
          })))
          activeDisposers.push(tools.register(defineTool({
            name: 'tty_open',
            description: '开一个新的终端会话（本地 shell，或 `command` 直接跑一条命令，如 dev server）。会话出现在用户的终端面板里、用户可见可接管，长驻进程与 watch 类任务应该用它（不要在 bash 工具里挂起等待）。开了之后用 tty_expect 等就绪信号、tty_capture{last:true} 拿结果；用完用 tty_close 关闭。`command` 按 **宿主 shell 的语法整段执行**（D78：旧版本里 `exec` 包装只跑第一条）——POSIX shell 上 `cd dir && cmd`、`a; b`、`for …; do …; done` 都可以，**Windows 的 cmd / PowerShell 则按它们自己的语法**（当前执行命令的 shell 与语法见 systemPrompt 里的终端一行）；**它跑完退出后会话不会立刻消失**：会转成只读保留（留到显式关闭，最多留 16 条），退出前最后的输出与退出码都还能用 tty_capture / tty_screen 读——所以「跑一条会结束的命令、回头再取结果」不需要套一层 `sh`。cwd 缺省为插件配置的工作目录。',
            parameters: {
              cwd: { type: 'string', description: '工作目录（必须是已存在的绝对路径）；缺省用插件配置的 cwd' },
              command: { type: 'string', description: '直接执行的命令（非交互）：按**整段 shell 代码**执行，`cd x && cmd`、`a; b`、管道、多行脚本都可以（D78）；给出时不做 tmux 持久化。省略或全空白 = 交互式 shell' },
              persistName: { type: 'string', description: 'tmux 持久会话名（开启「会话持久化」时有效；同名复用既有会话）。适合宿主重启后仍需存活的长任务' },
              cols: { type: 'number', description: '列数（2~500，默认 80）' },
              rows: { type: 'number', description: '行数（2~200，默认 24）' },
            },
            output: {
              schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  sid: { type: 'string', required: true },
                  persist: { type: 'boolean', required: true },
                },
              },
              render: (_args: unknown, value: unknown) => {
                const v = value as { sid?: string; persist?: boolean }
                return [{ type: 'text', text: `已开终端会话 sid=${v.sid ?? '?'}${v.persist === true ? '（tmux 持久）' : ''}。它在用户的终端面板里可见；下一步可用 tty_send 执行命令、tty_expect 等就绪信号。\n${commandShellHint(live.shell)}` }]
              },
            },
            async execute(args: unknown): Promise<{ sid: string; persist: boolean }> {
              const input = args as { cwd?: unknown; command?: unknown; persistName?: unknown; cols?: unknown; rows?: unknown }
              return await server.openAgentSession({
                ...(typeof input.cwd === 'string' ? { cwd: input.cwd } : {}),
                ...(typeof input.command === 'string' ? { command: input.command } : {}),
                ...(typeof input.persistName === 'string' ? { persistName: input.persistName } : {}),
                cols: input.cols,
                rows: input.rows,
              })
            },
          })))
          activeDisposers.push(tools.register(defineTool({
            name: 'tty_close',
            description: '关闭一个由 tty_open 开的终端会话（结束其中的进程）。**只能关 agent 自己开的会话**：用户在面板里开的标签会被拒绝，请让用户自己在面板里关，不要越权结束用户正在用的终端。对**进程已退出但仍只读保留着**的会话同样可用——那就是它的释放入口（把屏与缓冲还回去）。只读保留默认留到显式关闭（宿主重启也会清空），不按时间释放；同时最多留 16 条，超出按最旧淘汰。',
            parameters: {
              sid: { type: 'string', required: true, description: '会话 id（tty_open 或 tty_list 提供）' },
            },
            output: {
              schema: {
                type: 'object',
                additionalProperties: false,
                properties: { ok: { type: 'boolean', required: true } },
              },
              render: (_args: unknown, value: unknown) => {
                const v = value as { ok?: boolean }
                return [{ type: 'text', text: v.ok === true ? '会话已关闭' : '会话未能关闭' }]
              },
            },
            async execute(args: unknown): Promise<{ ok: boolean }> {
              const input = args as { sid?: unknown }
              if (typeof input.sid !== 'string' || input.sid === '') throw new Error('sid 必须是非空字符串')
              return await server.closeAgentSession(input.sid)
            },
          })))
          activeDisposers.push(tools.register(defineTool({
            name: 'tty_run',
            description: '**一次性命令**：开一个终端会话跑 `command`，等它结束，直接返回尾部输出 + 退出码（会话出现在用户面板里、可见可接管）——把「tty_open → 等 → tty_capture{last} → tty_close」四步压成一次调用。命令**跑完就结束**：默认把这个会话关掉（结果已在本调用返回），`keep:true` 则留在「只读保留」态供回看。到 `timeoutSec` 还没结束会返回 `running:true`（会话照旧在跑，**杀不杀由你决定**），接着用 tty_expect / tty_capture 看，或 tty_close 关掉。何时用它而不是 bash 工具：需要用户**看得见**这条命令、或要跑在终端会话里（同一套 PTY / 会话名额 / 后续可接管）时用它；纯非交互、不需要用户看见的命令用 bash 工具更直接。`command` 按宿主 shell 的语法整段执行（POSIX 上 `cd x && cmd`、多行脚本都可以；Windows 的 cmd / PowerShell 按它们自己的语法）。',
            parameters: {
              command: { type: 'string', required: true, description: '要执行的命令（整段 shell 代码，支持 `cd x && cmd`、管道、多行脚本）' },
              cwd: { type: 'string', description: '工作目录（必须是已存在的绝对路径）；缺省用插件配置的 cwd' },
              timeoutSec: { type: 'number', description: '等待命令结束的上限秒数（1~600，默认 120）；到点没结束返回 running:true，会话不会被杀' },
              keep: { type: 'boolean', description: 'true = 跑完留在只读保留态（可回看/接管）；默认 false = 跑完即关（结果已在本调用返回）' },
              lines: { type: 'number', description: '返回的输出尾部行数（1~500，默认 60）' },
              cols: { type: 'number', description: '列数（2~500，默认 80）' },
              rows: { type: 'number', description: '行数（2~200，默认 24）' },
            },
            output: {
              schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  sid: { type: 'string', required: true },
                  running: { type: 'boolean', required: true },
                  tail: { type: 'string', required: true },
                  closed: { type: 'boolean', required: true },
                  exitCode: { type: 'number' },
                  signal: { type: 'string' },
                },
              },
              render: (_args: unknown, value: unknown) => {
                const v = value as { sid?: string; running?: boolean; tail?: string; closed?: boolean; exitCode?: number; signal?: string }
                const sid = v.sid ?? '?'
                if (v.running === true) {
                  return [{ type: 'text', text: `终端会话 ${sid} 里这条命令到点还没结束（它就是面板里的普通标签，用户看得见、可接管）：用 tty_expect 等它的就绪标记、tty_capture 读尾部，或 tty_close 关掉。\n\n${v.tail ?? ''}` }]
                }
                const how = v.signal !== undefined && v.signal !== '' ? `signal=${v.signal}` : `exitCode=${String(v.exitCode ?? '?')}`
                const note = v.closed === true
                  ? '会话已关闭（结果都在下面这段里）。'
                  : `会话留在只读保留态（sid=${sid}），要回看这段输出可以再 tty_capture（用 lines 读尾部——命令型会话没有「上一条命令」，last:true 会报错）。`
                return [{ type: 'text', text: `终端会话 ${sid} 的命令已结束（${how}）。${note}\n\n${v.tail ?? ''}` }]
              },
            },
            async execute(args: unknown): Promise<{ sid: string; running: boolean; tail: string; closed: boolean; exitCode?: number; signal?: string }> {
              const input = args as { command?: unknown; cwd?: unknown; timeoutSec?: unknown; keep?: unknown; lines?: unknown; cols?: unknown; rows?: unknown }
              if (typeof input.command !== 'string' || input.command.trim() === '') throw new Error('command 必须是非空字符串')
              const timeoutSec = clampInt(input.timeoutSec, 120, 1, 600)
              const lines = clampInt(input.lines, 60, 1, 500)
              const opened = await server.openAgentSession({
                command: input.command,
                ...(typeof input.cwd === 'string' && input.cwd.trim() !== '' ? { cwd: input.cwd } : {}),
                cols: input.cols,
                rows: input.rows,
              })
              const session = sessions.get(opened.sid)
              if (session === undefined || session.closed) throw new Error(`会话创建后立刻退役了: ${opened.sid}`)
              // 命令型会话的进程**就是**那条命令（D78 的 exec 链）：进程退出 = 命令结束，
              // 与 shell 集成无关（这类会话不注入钩子，等 133;D 是等不到的）
              const finished = await waitForSessionExit(session, timeoutSec * 1000)
              const tail = cleanAnsiTail(tailLines(session, lines))
              if (!finished) return { sid: opened.sid, running: true, closed: false, tail }
              const exited = session.exited
              const result = {
                sid: opened.sid,
                running: false,
                tail,
                closed: false,
                ...(exited === null || exited.code === null ? {} : { exitCode: exited.code }),
                ...(exited === null || exited.signal === null || exited.signal === '' ? {} : { signal: exited.signal }),
              }
              // keep 默认 false：这条通道的语义就是「一条命令一次调用」，留着会占满
              // 只读保留的名额（16 条）；要回看现场就显式 keep:true
              if (input.keep === true) return result
              await server.closeAgentSession(opened.sid)
              return { ...result, closed: true }
            },
          })))
          activeDisposers.push(tools.register(defineTool({
            name: 'tty_stats',
            // 只读工具：与同轮其它工具并发执行（宿主默认把未声明的工具当独占，见项目级 ROADMAP 第 4 项）
            isConcurrencySafe: () => true,
            description: '读取某个终端会话所在机器的实时指标（CPU / 内存 / 磁盘 / TCP 连接数 / 网速 / 温度 / 在线时长）——本地会话取宿主机，SSH 会话取那台远程主机（另开一条非 PTY 通道，不影响终端）。部署、压测、排查「机器是不是满了」之前先看它。仅 Linux 远端字段齐全，Windows 远端部分字段可采，macOS/BSD 远端取不到。',
            parameters: {
              sid: { type: 'string', required: true, description: '会话 id（tty_list 提供）' },
            },
            output: {
              schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  sid: { type: 'string', required: true },
                  available: { type: 'boolean', required: true },
                  reason: { type: 'string' },
                  target: { type: 'string' },
                  cpuPct: { type: 'number' },
                  cores: { type: 'number' },
                  memPct: { type: 'number' },
                  memUsed: { type: 'number' },
                  memTotal: { type: 'number' },
                  diskPct: { type: 'number' },
                  diskUsed: { type: 'number' },
                  diskTotal: { type: 'number' },
                  tcpConns: { type: 'number' },
                  rxRate: { type: 'number' },
                  txRate: { type: 'number' },
                  tempC: { type: 'number' },
                  uptimeSec: { type: 'number' },
                },
              },
              render: (_args: unknown, value: unknown) => {
                const v = value as { sid?: string; available?: boolean; reason?: string; target?: string; cpuPct?: number; cores?: number; memPct?: number; memUsed?: number; memTotal?: number; diskPct?: number; diskUsed?: number; diskTotal?: number; tcpConns?: number; rxRate?: number; txRate?: number; tempC?: number; uptimeSec?: number }
                if (v.available !== true) return [{ type: 'text', text: `会话 ${v.sid ?? '?'} 取不到指标：${v.reason ?? '未知原因'}` }]
                const parts = [
                  v.cpuPct !== undefined ? `CPU ${v.cpuPct.toFixed(0)}%${v.cores !== undefined ? `（${String(v.cores)} 核）` : ''}` : null,
                  v.memPct !== undefined ? `内存 ${v.memPct.toFixed(0)}%${v.memUsed !== undefined && v.memTotal !== undefined ? `（${humanFileSize(v.memUsed)} / ${humanFileSize(v.memTotal)}）` : ''}` : null,
                  v.diskPct !== undefined ? `磁盘 ${v.diskPct.toFixed(0)}%${v.diskUsed !== undefined && v.diskTotal !== undefined ? `（${humanFileSize(v.diskUsed)} / ${humanFileSize(v.diskTotal)}）` : ''}` : null,
                  v.tcpConns !== undefined ? `TCP 连接 ${String(v.tcpConns)}` : null,
                  v.rxRate !== undefined ? `网速 ↓${humanFileSize(v.rxRate)}/s ↑${humanFileSize(v.txRate ?? 0)}/s` : null,
                  v.tempC !== undefined ? `温度 ${v.tempC.toFixed(0)}°C` : null,
                  v.uptimeSec !== undefined ? `在线 ${humanDuration(v.uptimeSec)}` : null,
                ].filter((x): x is string => x !== null)
                const head = `会话 ${v.sid ?? '?'}${v.target !== undefined && v.target !== '' ? `（${v.target}）` : ''} 指标：`
                return [{ type: 'text', text: head + (parts.length > 0 ? parts.join(' · ') : '（无可用字段）') }]
              },
            },
            async execute(args: unknown): Promise<{ sid: string; available: boolean; reason?: string; target?: string; cpuPct?: number; cores?: number; memPct?: number; memUsed?: number; memTotal?: number; diskPct?: number; diskUsed?: number; diskTotal?: number; tcpConns?: number; rxRate?: number; txRate?: number; tempC?: number; uptimeSec?: number }> {
              const input = args as { sid?: unknown }
              if (typeof input.sid !== 'string' || input.sid === '') throw new Error('sid 必须是非空字符串')
              const session = sessions.get(input.sid)
              if (session === undefined || session.closed) throw new Error(`会话不存在或已退出: ${input.sid}`)
              if (session.exited !== null) {
                // D77：进程没了就没有「这台会话所在机器」的此刻指标可言（本地会话会取到
                // 宿主自己、远端连接早断了）——如实回 available:false，不给过期数据
                return { sid: input.sid, available: false, reason: `会话的进程已退出（${describeExit(session.exited)}），只读保留中：取不到它的资源指标` }
              }
              const result = await server.sampleStats(session)
              if (result.available !== true || result.frame === undefined) {
                return { sid: input.sid, available: false, reason: result.reason ?? '未知原因' }
              }
              return { sid: input.sid, available: true, ...(session.target !== '' ? { target: session.target } : {}), ...result.frame }
            },
          })))
          activeDisposers.push(tools.register(defineTool({
            name: 'tty_capture',
            // 只读工具：与同轮其它工具并发执行（宿主默认把未声明的工具当独占，见项目级 ROADMAP 第 4 项）
            isConcurrencySafe: () => true,
            description: '读取某个终端面板会话（tty_list 提供 sid）的近期输出。默认读取尾部 N 行（60，最多 500，已剥离 ANSI 转义序列并收敛同行覆盖）；last:true 时只返回「上一条已完成命令」的输出与退出码（依赖 shell 集成标记，更适合拿单条命令的结果）——若命令在途（刚发送/未收到完成标记）返回 inProgress:true 且不携带旧结果，请稍后重试或改用 tty_expect。**进程已退出的会话也能读**（结果带 exited:true + 退出码/信号）：输出在只读保留期里一直都在（保留到显式关闭或宿主重启，`tty_open command=...` 跑完一条命令后就这么用）；这类会话不能再写，要接着操作请 tty_open 新开一条。**命令型会话（`tty_open command=` / `tty_run`）没有「上一条命令」**（它们不注入 shell 集成钩子），对它们用 last:true 会明确报错——改用默认的 lines 读尾部。',
            parameters: {
              sid: { type: 'string', required: true, description: '会话 id（来自 tty_list）' },
              lines: { type: 'number', description: '读取尾部行数（1~500，默认 60）；last:true 时忽略' },
              last: { type: 'boolean', description: 'true 只返回上一条命令的输出+退出码（默认 false 读尾部）' },
              raw: { type: 'boolean', description: 'true 返回含 ANSI 转义序列的原始输出（默认 false 清洗为纯文本）' },
            },
            output: {
              schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  sid: { type: 'string', required: true },
                  tail: { type: 'string', required: true },
                  source: { type: 'string' },
                  exitCode: { type: 'number' },
                  inProgress: { type: 'boolean' },
                  exited: { type: 'boolean' },
                  signal: { type: 'string' },
                },
              },
              render: (_args: unknown, value: unknown) => {
                const v = value as { sid?: string; tail?: string; source?: string; exitCode?: number; inProgress?: boolean; exited?: boolean; signal?: string }
                if (v.inProgress === true) {
                  return [{ type: 'text', text: `终端会话 ${v.sid ?? '?'} 有命令正在执行（尚未收到完成标记），当前取不到「上一条已完成命令」的结果：稍后重试，或改用 tty_expect 等待特定输出。` }]
                }
                const head = v.source === 'last'
                  ? `终端会话 ${v.sid ?? '?'} 上一条命令的输出（exitCode=${String(v.exitCode ?? '?')}）：\n\n`
                  : `终端会话 ${v.sid ?? '?'} 尾部输出：\n\n`
                // D77：读的是已退出会话时显式说明——免得 AI 把它当成「还在跑的终端」继续发命令
                const note = v.exited === true
                  ? `（⚠️ 该会话的进程已退出${v.signal !== undefined && v.signal !== '' ? `（signal=${v.signal}）` : ''}，这是只读保留的输出；此会话不能再写入，要接着操作请 tty_open 新开一条）\n\n`
                  : ''
                return [{ type: 'text', text: note + head + (v.tail ?? '') }]
              },
            },
            async execute(args: unknown): Promise<{ sid: string; tail: string; source?: string; exitCode?: number; inProgress?: boolean; exited?: boolean; signal?: string }> {
              const input = args as { sid?: unknown; lines?: unknown; last?: unknown; raw?: unknown }
              if (typeof input.sid !== 'string' || input.sid === '') throw new Error('sid 必须是非空字符串')
              const session = sessions.get(input.sid)
              if (session === undefined || session.closed) throw new Error(`会话不存在或已退出: ${input.sid}`)
              const useRaw = input.raw === true
              // D77：只读保留态的标记（读得到，但要如实告诉 agent 这是已退出会话的输出）
              const exitMark = session.exited === null
                ? {}
                : { exited: true as const, ...(session.exited.signal === null || session.exited.signal === '' ? {} : { signal: session.exited.signal }) }
              // D72：读侧工具返回前推进水位线——这里读到的内容算「已读」，后续
              // tty_expect 不再把它们当未读回扫（想回看更早的内容再用本工具）。
              // tty_screen 刻意**不**推进：它是「当前可见屏幕」这一种表示，不是
              // 文本流，推进它会把 AI 从未在文本里看过的输出标记成已读。
              advanceReadMark(session)
              if (input.last === true) {
                const state = session.shellState
                const last = state.lastCommand
                // 在途判定（0.19.0）：①命令的 D 标记未到（inCommand）；②D 到了但
                // 之后又有 PTY 输入（新命令刚发、B 标记还在路上）。lastCommand
                // 此时是上一条的旧结果——形状正常却答非所问，必须显式标出来，
                // 否则 agent 拿旧结果当本次结果用（静默错数据）。
                if (state.inCommand || (last !== null && last.endedAt < session.lastInputAt)) {
                  return { sid: input.sid, source: 'last', inProgress: true, tail: '' }
                }
                // D87：命令型会话（`tty_open command=` / `tty_run`）**不注入 shell 集成钩子**，
                // 它们根本没有「上一条命令」这个概念——旧文案把用户指向「shell 不受支持 /
                // 集成被配置关闭」，方向完全反了（用户会去翻设置卡片找一个不存在的开关）。
                // 这类会话的**整条输出就是那条命令的输出**，要的是尾部读取。
                if (session.commandSession) {
                  throw new Error(`会话 ${input.sid} 是命令型会话（tty_open 的 command= / tty_run）：**整条输出就是那条命令的输出**，没有「上一条命令」这个概念（这类会话不注入 shell 集成钩子）。用不带 last 的尾部读取（lines，默认 60 行）或 tty_screen 拿结果`)
                }
                if (last === null) {
                  throw new Error('暂无「上一条命令」记录（shell 集成未生效——shell 不受支持或被配置关闭——或尚未执行过命令）；可改用 lines 读尾部')
                }
                // 保尾截断：last.output 本身已是环形保尾（COMMAND_CAP），这里再
                // 收一刀也保尾——最近输出才是 agent 要的。
                // exitCode 用「键不存在」表达缺失（`?? undefined` 会留下一个
                // undefined 键，不是无损 JSON 值，宿主输出校验会判工具错，见 B33）。
                return { sid: input.sid, source: 'last', ...exitMark, ...(last.exitCode === null ? {} : { exitCode: last.exitCode }), tail: (useRaw ? last.output : cleanAnsiTail(last.output)).slice(-128 * 1024) }
              }
              const lines = Math.max(1, Math.min(500, typeof input.lines === 'number' && Number.isInteger(input.lines) && input.lines >= 1 ? input.lines : 60))
              const rawTail = tailLines(session, lines)
              return {
                sid: input.sid,
                source: 'tail',
                ...exitMark,
                ...(session.exited === null || session.exited.code === null ? {} : { exitCode: session.exited.code }),
                tail: useRaw ? rawTail : cleanAnsiTail(rawTail),
              }
            },
          })))
          activeDisposers.push(tools.register(defineTool({
            name: 'tty_screen',
            // 只读工具：与同轮其它工具并发执行（宿主默认把未声明的工具当独占，见项目级 ROADMAP 第 4 项）
            isConcurrencySafe: () => true,
            description: '读取某个终端面板会话（tty_list 提供 sid）当前可见屏幕的渲染结果（纯文本，等价于用户此刻看到的画面）。适合查看全屏交互程序（vim / htop / 菜单选择）的当前界面状态；要历史滚动输出用 tty_capture。**进程已退出的会话也能读**（结果带 exited:true）：屏在只读保留期内不释放，读到的就是它退出那一刻的画面。',
            parameters: {
              sid: { type: 'string', required: true, description: '会话 id（来自 tty_list）' },
            },
            output: {
              schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  sid: { type: 'string', required: true },
                  cols: { type: 'number', required: true },
                  rows: { type: 'number', required: true },
                  text: { type: 'string', required: true },
                  exited: { type: 'boolean' },
                  signal: { type: 'string' },
                },
              },
              render: (_args: unknown, value: unknown) => {
                const v = value as { sid?: string; cols?: number; rows?: number; text?: string; exited?: boolean; signal?: string }
                const note = v.exited === true
                  ? `（⚠️ 该会话的进程已退出${v.signal !== undefined && v.signal !== '' ? `（signal=${v.signal}）` : ''}：这是退出那一刻的屏幕，只读保留中）`
                  : ''
                return [{ type: 'text', text: `终端会话 ${v.sid ?? '?'} 当前屏幕（${String(v.cols ?? '?')}×${String(v.rows ?? '?')}）${note}：\n\n${v.text ?? ''}` }]
              },
            },
            async execute(args: unknown): Promise<{ sid: string; cols: number; rows: number; text: string; exited?: boolean; signal?: string }> {
              const input = args as { sid?: unknown }
              if (typeof input.sid !== 'string' || input.sid === '') throw new Error('sid 必须是非空字符串')
              const session = sessions.get(input.sid)
              if (session === undefined || session.closed) throw new Error(`会话不存在或已退出: ${input.sid}`)
              const screen = session.screen
              if (screen === null) {
                // D57：屏可能被退役（解析停摆 / 写队列满）——如实报原因，别让 agent 以为只是没开
                const why = session.screenDownReason === null ? '' : `（${session.screenDownReason}）`
                throw new Error(`虚拟屏不可用: ${input.sid}${why}`)
              }
              // 保尾截断：屏幕末尾（提示符行）才是有效区，丢头部不丢尾部
              return {
                sid: input.sid,
                cols: screen.cols,
                rows: screen.rows,
                // D77：只读保留态如实标注（屏不再更新，「当前屏幕」= 退出那一刻）
                ...(session.exited === null ? {} : { exited: true as const, ...(session.exited.signal === null || session.exited.signal === '' ? {} : { signal: session.exited.signal }) }),
                text: screenTextOf(screen).slice(-32 * 1024),
              }
            },
          })))
          activeDisposers.push(tools.register(defineTool({
            name: 'tty_expect',
            // 只读工具：与同轮其它工具并发执行（宿主默认把未声明的工具当独占，见项目级 ROADMAP 第 4 项）
            isConcurrencySafe: () => true,
            description: '在某个终端面板会话（tty_list 提供 sid）等待一个正则出现（如 dev server 的 ready/URL、构建完成标记、交互提示）。**先回溯**还没被读过的输出（含「上一条命令」的完整输出），再等后续输出——所以命令瞬间跑完也不会白等；匹配到立即返回 matched:true（matchedFrom 说明匹配来自哪里：live=本次等待期间新产生 / last=上一条命令的输出 / buffered=此前已到达的缓冲输出）与周边输出。**刚发进去的命令回显不算命中**（命令还没执行时回显先到，命中它等于谎报）；若等满超时且 pattern 只命中过回显，结果带 echoOnly:true——那说明命中的只是回显、不是输出（命令可能没被执行），先复核它到底跑没跑。超时不抛错，返回 matched:false + 尾部输出；期间该命令若已结束（shell 集成标记）也会提前返回并带退出码。适合先 tty_send 启动长任务、再 tty_expect 等就绪信号的流程。注意：只对「还没读过的输出」负责——要回看更早的内容用 tty_capture。',
            parameters: {
              sid: { type: 'string', required: true, description: '会话 id（来自 tty_list）' },
              pattern: { type: 'string', required: true, description: '等待匹配的正则表达式（JavaScript RegExp 语法）' },
              timeoutSec: { type: 'number', description: '等待秒数（1~600，默认 30）' },
            },
            output: {
              schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  matched: { type: 'boolean', required: true },
                  timedOut: { type: 'boolean', required: true },
                  text: { type: 'string', required: true },
                  exitCode: { type: 'number' },
                  matchedFrom: { type: 'string' },
                  echoOnly: { type: 'boolean' },
                  exited: { type: 'boolean' },
                },
              },
              render: (_args: unknown, value: unknown) => {
                const v = value as { matched?: boolean; timedOut?: boolean; text?: string; exitCode?: number; matchedFrom?: string; echoOnly?: boolean; exited?: boolean }
                if (v.matched === true) {
                  const from = v.matchedFrom === 'last'
                    ? '（回溯自「上一条命令」的输出）'
                    : v.matchedFrom === 'buffered' ? '（回溯自此前已到达、还没读过的缓冲输出）' : ''
                  return [{ type: 'text', text: `已匹配到等待的模式${from}：\n\n${v.text ?? ''}` }]
                }
                if (v.echoOnly === true) {
                  // D75：只命中过回显 —— 这不是「命令跑了但没输出」，而是「等的东西一次都没出现在输出里」
                  return [{ type: 'text', text: `等待超时：pattern **只匹配到刚发进去的命令回显**，没有匹配到任何真正的输出——命令可能没有被执行（回显先到、输出没来），也可能执行了但输出里没有这个 pattern。先复核它到底跑没跑（tty_capture 读尾部、或在面板里看那一行是否还停在输入行），再决定重发命令还是换 pattern。尾部输出：\n\n${v.text ?? ''}` }]
                }
                if (v.exited === true) {
                  // D77：会话的进程已经退出（只读保留）——不会再有任何新输出，别让它以为还能等
                  return [{ type: 'text', text: `会话的进程已退出（只读保留中），不会再有新输出：这一轮按现存输出结算，没有匹配到 pattern。要看它最后的输出用 tty_capture（默认读尾部）/ tty_screen（退出那一刻的屏）；要接着跑命令请 tty_open 新开一条会话。尾部输出：\n\n${v.text ?? ''}` }]
                }
                if (v.timedOut === true && (v.text ?? '').trim() === '') {
                  // D72：这段空白此前被当成「命令没执行」——命令若是瞬间完成的，它早就跑完了
                  return [{ type: 'text', text: '等待超时，且注册之后没有任何新输出。命令若是瞬间完成的，它早已在开始等待之前跑完：用 tty_capture{last:true} 复核那条命令的输出与退出码，别把这段空白当成「没执行」。' }]
                }
                const why = v.timedOut === true ? '等待超时' : `命令已结束（exitCode=${String(v.exitCode ?? '?')}）但未出现匹配`
                return [{ type: 'text', text: `${why}。尾部输出：\n\n${v.text ?? ''}` }]
              },
            },
            async execute(args: unknown): Promise<ExpectResult> {
              const input = args as { sid?: unknown; pattern?: unknown; timeoutSec?: unknown }
              if (typeof input.sid !== 'string' || input.sid === '') throw new Error('sid 必须是非空字符串')
              if (typeof input.pattern !== 'string' || input.pattern === '') throw new Error('pattern 必须是非空字符串')
              const session = sessions.get(input.sid)
              if (session === undefined || session.closed) throw new Error(`会话不存在或已退出: ${input.sid}`)
              let re: RegExp
              try {
                re = new RegExp(input.pattern)
              } catch (error) {
                throw new Error('pattern 不是合法的正则表达式: ' + (error instanceof Error ? error.message : String(error)))
              }
              const timeoutSec = Math.max(1, Math.min(600, typeof input.timeoutSec === 'number' && Number.isInteger(input.timeoutSec) && input.timeoutSec >= 1 ? input.timeoutSec : 30))
              const timeoutMs = timeoutSec * 1000
              // 并发上限：每次 expect 挂一个常驻 data 监听器（直到 settle），
              // 无上限时批量调用会堆出 MaxListenersExceededWarning + 白耗 CPU
              const inflight = expectCounts.get(session) ?? 0
              if (inflight >= MAX_EXPECT_PER_SESSION) {
                throw new Error(`该会话已有 ${String(inflight)} 个在途 tty_expect（上限 ${String(MAX_EXPECT_PER_SESSION)}）：等其中一个返回再发起新的`)
              }
              expectCounts.set(session, inflight + 1)
              return await new Promise<ExpectResult>((resolve) => {
                const startedAt = Date.now()
                const state = session.shellState
                const startedInCommand = state.inCommand
                // 尾部窗口：匹配只看最近 16KB，acc 全量囤积对刷屏会话可涨到数百 MB
                let acc = ''
                let settled = false
                /** D75：pattern 只命中过回显（被剔除了）——超时文案据此如实说明「命令可能没跑」。 */
                let sawEchoOnly = false
                let timer: NodeJS.Timeout | null = null
                const decoder = new StringDecoder('utf8')
                const output = session.handle.output
                /**
                 * 结算时的水位线（D72）：
                 *  - 匹配成功 / 会话结束 → 推进到当下（这段输出已经交回给 AI 了）；
                 *  - **超时不动**：那次只把注册之后的增量交回去，注册前就在缓冲里的
                 *    未读输出没被读过，而且下一次换个 pattern 还要靠它回溯——吞掉
                 *    它等于「等一次没等到，这段输出就作废了」。
                 */
                const finish = (result: ExpectResult, consumeBacklog = true): void => {
                  if (settled) return
                  settled = true
                  if (timer !== null) clearTimeout(timer)
                  output.off('data', onData)
                  expectCounts.set(session, Math.max(0, (expectCounts.get(session) ?? 1) - 1))
                  if (consumeBacklog) advanceReadMark(session)
                  resolve(result)
                }
                // 箭头函数（不是 function 声明）：后者会被提升，TS 不保留外层 `const session`
                // 的收窄，闭包里就得再判一次 undefined。
                const onData = (chunk: Buffer): void => {
                  acc = (acc + decoder.write(chunk)).slice(-64 * 1024)
                  const hay = acc.length > 16 * 1024 ? acc.slice(-16 * 1024) : acc
                  if (testPattern(re, hay)) {
                    // D75：命中的若**只是刚送进去那行命令的回显**，不算命中——继续等真输出
                    if (echoOnlyMatch(re, hay, session)) sawEchoOnly = true
                    else {
                      finish({ matched: true, timedOut: false, matchedFrom: 'live', text: cleanAnsiTail(hay.slice(-6 * 1024)) })
                      return
                    }
                  }
                  // 命令早停：注册时命令在飞（B..D 之间），如今 D 已到仍未匹配
                  if (startedInCommand && !state.inCommand && state.lastCommand !== null && state.lastCommand.endedAt >= startedAt) {
                    finish({ matched: false, timedOut: false, ...(state.lastCommand.exitCode === null ? {} : { exitCode: state.lastCommand.exitCode }), ...(sawEchoOnly ? { echoOnly: true } : {}), text: cleanAnsiTail(acc.slice(-6 * 1024)) })
                  }
                }
                // ── 注册**之前**就已到达的输出（D72）─────────────────────────
                // 这段此前完全不匹配：acc 从空开始，所以「命令瞬间完成」时标记
                // 早就躺在缓冲区里、acc 里永远没有它 → 白等满超时、还只返回空白。
                ensureReadMark(session)
                // ① 上一条命令的完整输出（B..D 窗口：无回显、无提示符、自带退出码）。
                //    两个闸门保证它「还没被读过」：不晚于最后一次输入（否则是上一条
                //    命令的旧结果），且晚于水位线时刻（否则 AI 已经用 capture 看过了）。
                const last = state.lastCommand
                if (!state.inCommand && last !== null && last.endedAt > session.readMarkAt && last.endedAt >= session.lastInputAt && testPattern(re, last.output)) {
                  finish({ matched: true, timedOut: false, matchedFrom: 'last', ...(last.exitCode === null ? {} : { exitCode: last.exitCode }), text: cleanAnsiTail(last.output.slice(-6 * 1024)) })
                  return
                }
                // ② 泛化：水位线之后的未读缓冲（长驻输出落在多条命令之间、无 shell 集成……）
                const backlog = unreadRegion(session)
                if (backlog !== '' && testPattern(re, backlog)) {
                  // D75：同上——纯回显不算命中（Windows 上 LF 没提交时，这里命中的就只有回显）
                  if (echoOnlyMatch(re, backlog, session)) sawEchoOnly = true
                  else {
                    finish({ matched: true, timedOut: false, matchedFrom: 'buffered', text: cleanAnsiTail(backlog.slice(-6 * 1024)) })
                    return
                  }
                }
                timer = setTimeout(() => {
                  finish({ matched: false, timedOut: true, ...(sawEchoOnly ? { echoOnly: true } : {}), text: cleanAnsiTail(acc.slice(-6 * 1024)) }, false)
                }, timeoutMs)
                timer.unref?.()
                output.on('data', onData)
                void session.handle.done.then(() => {
                  // 会话结束（命令跑完 / 进程退出）：不能再等——D77 的只读保留态也走这里
                  // （done 早已兑现，所以退出后调用 expect 不再白等满超时）
                  finish({ matched: false, timedOut: false, ...(session.exited === null ? {} : { exited: true }), text: cleanAnsiTail(acc.slice(-6 * 1024)) })
                })
              })
            },
          })))
          activeDisposers.push(tools.register(defineTool({
            name: 'tty_send',
            description: '向某个终端面板会话（tty_list 提供 sid）的 PTY 发送文本与/或按键（data 含换行则以回车提交；Windows 本地会话上插件会把 `\\n` 归一成 CRLF，照常写 `\\n` 即可）。**控制键与方向键用具名 `keys`，不要自己在 data 里拼转义序列**：`"\\x1b[B"` / `"^[[B"` 这类写法会被当成普通字符打印进终端（而 sent 计数一样，看不出错）。data 与 keys 至少给一个；两个都给时先发 data、再按序发 keys（如 data=":wq" + keys=["Enter"]）。适合给用户终端里运行的程序发交互输入（如 dev server 的 q 键、menu 选择、vim/less 的翻页、回答提示）。操作会实时显示在用户的终端面板里。**对已退出（只读保留）的会话会报错**——那种会话只能读，要接着操作请 tty_open 新开一条。',
            parameters: {
              sid: { type: 'string', required: true, description: '会话 id（来自 tty_list）' },
              data: { type: 'string', description: '要发送的文本（含换行则直接发送命令）；与 keys 至少给一个' },
              keys: { type: 'array', items: { type: 'string' }, description: `具名按键数组，按序发送：${KEY_VOCABULARY}。例：["C-c"]、["Down","Down","Enter"]、["Esc", ":", "w", "q", "Enter"]` },
            },
            output: {
              schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  ok: { type: 'boolean', required: true },
                  sent: { type: 'number', required: true },
                },
              },
              render: (renderArgs: unknown, value: unknown) => {
                const v = value as { sent?: number }
                const a = renderArgs as { keys?: unknown }
                const shown = Array.isArray(a.keys) ? a.keys.filter((key): key is string => typeof key === 'string' && key !== '') : []
                const note = shown.length === 0 ? '' : `（含按键 ${shown.join(' ')}）`
                return [{ type: 'text', text: `已向终端会话发送 ${v.sent ?? 0} 个字符${note}` }]
              },
            },
            async execute(args: unknown): Promise<{ ok: boolean; sent: number }> {
              const input = args as { sid?: unknown; data?: unknown; keys?: unknown }
              if (typeof input.sid !== 'string' || input.sid === '') throw new Error('sid 必须是非空字符串')
              if (input.keys !== undefined && !Array.isArray(input.keys)) throw new Error('keys 必须是字符串数组')
              const keys: string[] = Array.isArray(input.keys) ? input.keys.map((key) => {
                if (typeof key !== 'string') throw new Error('keys 里只能放字符串（按键名或单个字符）')
                return key
              }) : []
              const hasData = typeof input.data === 'string' && input.data !== ''
              if (!hasData && keys.length === 0) {
                throw new Error(`data 与 keys 至少要有一个：data 是要发送的文本，keys 是具名按键数组（${KEY_VOCABULARY}）`)
              }
              // 按键名先解析（未知名字在这里就报错，别等写进 PTY 才发现）
              const keyBytes = resolveKeys(keys)
              const session = sessions.get(input.sid)
              if (session === undefined || session.closed) throw new Error(`会话不存在或已退出: ${input.sid}`)
              if (session.exited !== null) {
                // D77：只读保留态明确拒写——进程已经没了，写进去只会在死 PTY 上静默消失
                throw new Error(`会话 ${input.sid} 的进程已退出（${describeExit(session.exited)}），只读保留中，写不进去：要接着操作请 tty_open 新开一条会话（它最后的输出仍可用 tty_capture / tty_screen 读）`)
              }
              // 0.23.0：data 在前、keys 在后按序拼（两个都给时语义固定，见工具描述）。
              // 具名按键走同一份归一化：Windows 本地会话的 Enter 同样要 CRLF（D74）。
              const raw = (hasData ? input.data as string : '') + keyBytes
              // D74：Windows 本地 PTY 的 Enter 是 CR，裸 LF 不提交命令行——按平台归一化。
              // SSH 会话不动：远端是什么系统插件不知道。
              const data = session.kind === 'local' ? normalizePtyInput(raw) : raw
              session.lastInputAt = Date.now()
              // D72：只初始化水位线，**不推进**——刚发出去的这条命令的输出 AI 还没看见；
              // 但这一刻之前的积压不该被第一次 expect 当成「未读」回扫。
              ensureReadMark(session)
              // D75：记下这行命令的回显候选，供 tty_expect 剔除「命中回显」的假阳性
              noteSubmittedInput(session, data)
              await session.handle.write(data)
              return { ok: true, sent: data.length }
            },
          })))
          activeDisposers.push(tools.register(defineTool({
            name: 'tunnel_list',
            // 只读工具：与同轮其它工具并发执行（宿主默认把未声明的工具当独占，见项目级 ROADMAP 第 4 项）
            isConcurrencySafe: () => true,
            description: '列出端口转发隧道及其实时状态（活跃/连接中/错误/停止、规则、当前与累计连接数、最近错误）。用户说「隧道连不上 / 转发挂了 / 端口转发不通」时先用它诊断；隧道在 插件配置 → 终端面板 卡片维护。',
            parameters: {},
            output: {
              schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  tunnels: {
                    type: 'array',
                    required: true,
                    items: {
                      type: 'object',
                      additionalProperties: false,
                      properties: {
                        name: { type: 'string', required: true },
                        direction: { type: 'string', required: true },
                        rule: { type: 'string', required: true },
                        bookName: { type: 'string', required: true },
                        state: { type: 'string', required: true },
                        error: { type: 'string' },
                        fatal: { type: 'boolean', required: true },
                        connections: { type: 'number', required: true },
                        totalConnections: { type: 'number', required: true },
                      },
                    },
                  },
                },
              },
              render: (_args: unknown, value: unknown) => {
                const v = value as { tunnels?: Array<{ name: string; direction: string; rule: string; state: string; error: string | null; fatal?: boolean; lastForwardError?: string | null; connections: number }> }
                const tunnels = v.tunnels ?? []
                if (tunnels.length === 0) return [{ type: 'text', text: '当前没有配置端口转发隧道（插件配置 → 终端面板 卡片可添加）' }]
                const text = '端口转发隧道：' + tunnels.map((t) => {
                  // fatal 单独措辞（D58）：这类故障不会自愈，不说清就会一直等「正在连」
                  const tail = t.error !== null && t.error !== undefined
                    ? (t.fatal === true ? `（错误: ${t.error} —— 不会自动重试，需修配置）` : `（错误: ${t.error}）`)
                    : t.lastForwardError !== null && t.lastForwardError !== undefined ? `（最近转发失败: ${t.lastForwardError}）` : `（连接 ${String(t.connections)}）`
                  return `\n- ${t.name} [${t.direction}] ${t.rule} — ${t.state}${tail}`
                }).join('')
                return [{ type: 'text', text }]
              },
            },
            async execute(): Promise<{ tunnels: Array<{ name: string; bookName: string; direction: string; rule: string; state: string; error?: string; fatal: boolean; connections: number; totalConnections: number }> }> {
              // 显式挑字段（0.19.0）：list() 还带 enabled / lastForwardError，
              // 整包展开会突破 schema 的 additionalProperties:false——PTC 生成的
              // TS 类型会漏字段。
              // error 必须是「**键不存在**」而不是「键存在但值为 undefined」：后者
              // 保留了一个 undefined，不是无损 JSON 值，宿主校验会判
              // 「must be a lossless JSON object」直接把工具调用变成 Error（B33 抓到）。
              return {
                tunnels: tunnelManager.list().map((t) => ({
                  name: t.name,
                  bookName: t.bookName,
                  direction: t.direction,
                  rule: t.rule,
                  state: t.state,
                  ...(t.error === null || t.error === undefined ? {} : { error: t.error }),
                  fatal: t.fatal,
                  connections: t.connections,
                  totalConnections: t.totalConnections,
                })),
              }
            },
          })))
          // —— SFTP 文件传输工具（0.7.0）——
          // 只收连接簿条目名（book），不接受内联凭证：agent 上下文不进明文密钥；
          // 连接与终端/隧道共用同一 HostKeyStore（TOFU 同源）。
          const sftpBookSpec = (book: unknown): SshSpec => {
            if (typeof book !== 'string' || book.trim() === '') throw new Error('book 必须是 SSH 连接簿条目名')
            const entry = live.findSshHost(book.trim())
            if (entry === undefined) throw new Error(`连接簿中不存在: ${book.trim()}`)
            return entry
          }
          activeDisposers.push(tools.register(defineTool({
            name: 'sftp_list',
            // 只读工具：与同轮其它工具并发执行（宿主默认把未声明的工具当独占，见项目级 ROADMAP 第 4 项）
            isConcurrencySafe: () => true,
            description: '列出 SSH 远程目录内容（名称/类型/大小/修改时间，目录在前；isSymlink 区分符号链接与真目录）。book 为 SSH 连接簿条目名；path 缺省为远程登录 home。默认最多列 500 项（超限 truncated:true，可按子目录分批）。',
            parameters: {
              book: { type: 'string', required: true, description: 'SSH 连接簿条目名（插件配置 → 终端面板 维护）' },
              path: { type: 'string', description: '远程目录路径（缺省 = 登录 home）' },
              maxEntries: { type: 'number', description: '最大条目数（1~2000，默认 500）' },
            },
            output: {
              schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  path: { type: 'string', required: true },
                  truncated: { type: 'boolean', required: true },
                  entries: {
                    type: 'array',
                    required: true,
                    items: {
                      type: 'object',
                      additionalProperties: false,
                      properties: {
                        name: { type: 'string', required: true },
                        isDir: { type: 'boolean', required: true },
                        isSymlink: { type: 'boolean', required: true },
                        size: { type: 'number', required: true },
                        mtime: { type: 'number', required: true },
                      },
                    },
                  },
                },
              },
              render: (_args: unknown, value: unknown) => {
                const v = value as { path?: string; entries?: Array<{ name: string; isDir: boolean; isSymlink: boolean; size: number }>; truncated?: boolean }
                const entries = v.entries ?? []
                if (entries.length === 0) return [{ type: 'text', text: `远程目录 ${v.path ?? '?'} 为空` }]
                const text = `远程目录 ${v.path ?? '?'}（${String(entries.length)} 项${v.truncated === true ? '，已截断——按子目录分批或加大 maxEntries' : ''}）：` + entries.map((e) => `\n- ${e.name}${e.isDir ? '/' : e.isSymlink ? '@' : ''} — ${e.isDir ? '目录' : e.isSymlink ? '符号链接' : humanFileSize(e.size)}`).join('')
                return [{ type: 'text', text }]
              },
            },
            async execute(args: unknown): Promise<{ path: string; truncated: boolean; entries: Array<{ name: string; isDir: boolean; isSymlink: boolean; size: number; mtime: number }> }> {
              const input = args as { book?: unknown; path?: unknown; maxEntries?: unknown }
              const spec = sftpBookSpec(input.book)
              const maxEntries = Math.max(1, Math.min(2000, typeof input.maxEntries === 'number' && Number.isInteger(input.maxEntries) && input.maxEntries >= 1 ? input.maxEntries : 500))
              const result = await sftpManager.list(spec, typeof input.path === 'string' ? input.path : '')
              const truncated = result.entries.length > maxEntries
              const entries = result.entries.slice(0, maxEntries).map((e) => ({ name: e.name, isDir: e.isDir, isSymlink: e.isSymlink, size: e.size, mtime: e.mtime }))
              return { path: result.path, truncated, entries }
            },
          })))
          activeDisposers.push(tools.register(defineTool({
            name: 'sftp_read',
            // 只读工具：与同轮其它工具并发执行（宿主默认把未声明的工具当独占，见项目级 ROADMAP 第 4 项）
            isConcurrencySafe: () => true,
            description: '读取 SSH 远程文本文件（book 连接簿条目 + path）。默认最多 256KB（可调至 1MB，非法值直接报错）；offset 可从指定字节起读（配合 maxBytes 分页拿到大文件尾部）；二进制判定用 NUL + 非法 UTF-8 占比双重检测，拒绝时说明原因。',
            parameters: {
              book: { type: 'string', required: true, description: 'SSH 连接簿条目名' },
              path: { type: 'string', required: true, description: '远程文件路径' },
              maxBytes: { type: 'number', description: '最大读取字节数（1~1048576，默认 262144；非法值报错不再静默回落）' },
              offset: { type: 'number', description: '起始字节偏移（0~2^53-1，默认 0；>0 时跳过前缀，适合读日志尾部）' },
            },
            output: {
              schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  path: { type: 'string', required: true },
                  content: { type: 'string', required: true },
                  truncated: { type: 'boolean', required: true },
                },
              },
              render: (_args: unknown, value: unknown) => {
                const v = value as { path?: string; content?: string; truncated?: boolean }
                const head = `远程文件 ${v.path ?? '?'}${v.truncated === true ? '（已截断——加大 maxBytes 或用 offset 分页）' : ''}：`
                return [{ type: 'text', text: head + '\n' + String(v.content ?? '') }]
              },
            },
            async execute(args: unknown): Promise<{ path: string; content: string; truncated: boolean }> {
              const input = args as { book?: unknown; path?: unknown; maxBytes?: unknown; offset?: unknown }
              const spec = sftpBookSpec(input.book)
              if (typeof input.path !== 'string' || input.path.trim() === '') throw new Error('path 必须是非空字符串')
              if (input.maxBytes !== undefined && (typeof input.maxBytes !== 'number' || !Number.isInteger(input.maxBytes) || input.maxBytes < 1 || input.maxBytes > 1024 * 1024)) {
                throw new Error('maxBytes 必须是 1~1048576 的整数')
              }
              const maxBytes = input.maxBytes === undefined ? 256 * 1024 : input.maxBytes
              if (input.offset !== undefined && (typeof input.offset !== 'number' || !Number.isInteger(input.offset) || input.offset < 0)) {
                throw new Error('offset 必须是非负整数')
              }
              const offset = input.offset === undefined ? 0 : input.offset
              const { stream } = await sftpManager.openDownload(spec, input.path, offset > 0 ? { offset } : undefined)
              const chunks: Buffer[] = []
              let total = 0
              try {
                for await (const chunk of stream) {
                  const piece = chunk as Buffer
                  chunks.push(piece)
                  total += piece.length
                  if (total > maxBytes) break // 只多读一段用于判定截断，其余丢弃
                }
              } finally {
                stream.destroy()
              }
              const buf = Buffer.concat(chunks)
              const truncated = buf.length > maxBytes
              const sliced = truncated ? buf.subarray(0, maxBytes) : buf
              if (looksLikeBinary(sliced)) throw new Error('疑似二进制文件（含 NUL 或非法 UTF-8 占比过高），sftp_read 只支持文本内容')
              return { path: input.path.trim(), content: decodeUtf8ForAgent(sliced), truncated }
            },
          })))
          activeDisposers.push(tools.register(defineTool({
            name: 'sftp_write',
            description: '写 SSH 远程文本文件（book 连接簿条目 + path + content）。默认覆盖写入，append:true 追加到文件尾；单次最多 1MB。适合远程写配置、落结果文件。',
            parameters: {
              book: { type: 'string', required: true, description: 'SSH 连接簿条目名' },
              path: { type: 'string', required: true, description: '远程文件路径' },
              content: { type: 'string', required: true, description: '要写入的文本内容（≤1MB）' },
              append: { type: 'boolean', description: 'true 追加到文件尾（默认覆盖）' },
            },
            output: {
              schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  ok: { type: 'boolean', required: true },
                  path: { type: 'string', required: true },
                  bytes: { type: 'number', required: true },
                  append: { type: 'boolean', required: true },
                },
              },
              render: (_args: unknown, value: unknown) => {
                const v = value as { path?: string; bytes?: number; append?: boolean }
                return [{ type: 'text', text: `已${v.append === true ? '追加' : '写入'}远程文件 ${v.path ?? '?'}（${String(v.bytes ?? 0)} 字节）` }]
              },
            },
            async execute(args: unknown): Promise<{ ok: boolean; path: string; bytes: number; append: boolean }> {
              const input = args as { book?: unknown; path?: unknown; content?: unknown; append?: unknown }
              const spec = sftpBookSpec(input.book)
              if (typeof input.path !== 'string' || input.path.trim() === '') throw new Error('path 必须是非空字符串')
              if (typeof input.content !== 'string') throw new Error('content 必须是字符串')
              const bytes = Buffer.byteLength(input.content, 'utf8')
              if (bytes > 1024 * 1024) throw new Error(`content 超过上限：${String(bytes)} 字节 > 1MB（大文件请用终端 scp 或面板上传）`)
              const append = input.append === true
              const { stream, done } = await sftpManager.openUpload(spec, input.path, append)
              stream.write(input.content, 'utf8')
              stream.end()
              await done
              return { ok: true, path: input.path.trim(), bytes, append }
            },
          })))
          // —— SFTP 管理闭环（0.8.0）——
          // mkdir（可逐级补齐）/ rename（可跨目录，等效移动）/ remove（目录
          // 递归）/ tree（限深限数的递归列举），与 sftp_list/read/write 一起
          // 让 agent 不开面板也能完整管理远程文件；同样只收连接簿条目名。
          activeDisposers.push(tools.register(defineTool({
            name: 'sftp_mkdir',
            description: '在 SSH 远程创建目录（book 连接簿条目 + path）。parents:true 时逐级补齐缺失的父目录（等效 mkdir -p，默认 false，父目录缺失直接报错）。',
            parameters: {
              book: { type: 'string', required: true, description: 'SSH 连接簿条目名（插件配置 → 终端面板 维护）' },
              path: { type: 'string', required: true, description: '要创建的远程目录路径' },
              parents: { type: 'boolean', description: 'true 逐级补齐缺失父目录（默认 false）' },
            },
            output: {
              schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  ok: { type: 'boolean', required: true },
                  path: { type: 'string', required: true },
                },
              },
              render: (_args: unknown, value: unknown) => {
                const v = value as { path?: string }
                return [{ type: 'text', text: `已创建远程目录 ${v.path ?? '?'}` }]
              },
            },
            async execute(args: unknown): Promise<{ ok: boolean; path: string }> {
              const input = args as { book?: unknown; path?: unknown; parents?: unknown }
              const spec = sftpBookSpec(input.book)
              if (typeof input.path !== 'string' || input.path.trim() === '') throw new Error('path 必须是非空字符串')
              await sftpManager.mkdir(spec, input.path, input.parents === true)
              return { ok: true, path: input.path.trim() }
            },
          })))
          activeDisposers.push(tools.register(defineTool({
            name: 'sftp_rename',
            description: '在 SSH 远程重命名 / 移动文件或目录（book 连接簿条目 + from + to）。to 与 from 不同目录即为移动（目标目录需已存在）；不会覆盖已存在的目标（服务端 rename 语义）。',
            parameters: {
              book: { type: 'string', required: true, description: 'SSH 连接簿条目名' },
              from: { type: 'string', required: true, description: '原远程路径' },
              to: { type: 'string', required: true, description: '新远程路径（跨目录即移动）' },
            },
            output: {
              schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  ok: { type: 'boolean', required: true },
                  from: { type: 'string', required: true },
                  to: { type: 'string', required: true },
                },
              },
              render: (_args: unknown, value: unknown) => {
                const v = value as { from?: string; to?: string }
                return [{ type: 'text', text: `已将远程 ${v.from ?? '?'} 重命名/移动为 ${v.to ?? '?'}` }]
              },
            },
            async execute(args: unknown): Promise<{ ok: boolean; from: string; to: string }> {
              const input = args as { book?: unknown; from?: unknown; to?: unknown }
              const spec = sftpBookSpec(input.book)
              if (typeof input.from !== 'string' || input.from.trim() === '') throw new Error('from 必须是非空字符串')
              if (typeof input.to !== 'string' || input.to.trim() === '') throw new Error('to 必须是非空字符串')
              await sftpManager.rename(spec, input.from, input.to)
              return { ok: true, from: input.from.trim(), to: input.to.trim() }
            },
          })))
          activeDisposers.push(tools.register(defineTool({
            name: 'sftp_remove',
            description: '删除 SSH 远程文件或目录（book 连接簿条目 + path）。文件直接删除；目录默认走 rmdir（非空明确报错），recursive:true 整目录递归删除（不可恢复，谨慎使用）。根目录 / home / 含 . .. 相对段的路径会被直接拒绝（防整树误删），请先解析出具体的绝对路径。',
            parameters: {
              book: { type: 'string', required: true, description: 'SSH 连接簿条目名' },
              path: { type: 'string', required: true, description: '要删除的远程路径' },
              recursive: { type: 'boolean', description: '目录 true 时递归删除全部内容（默认 false）' },
            },
            output: {
              schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  ok: { type: 'boolean', required: true },
                  path: { type: 'string', required: true },
                  recursive: { type: 'boolean', required: true },
                },
              },
              render: (_args: unknown, value: unknown) => {
                const v = value as { path?: string; recursive?: boolean }
                return [{ type: 'text', text: `已删除远程 ${v.path ?? '?'}${v.recursive === true ? '（含全部内容）' : ''}` }]
              },
            },
            async execute(args: unknown): Promise<{ ok: boolean; path: string; recursive: boolean }> {
              const input = args as { book?: unknown; path?: unknown; recursive?: unknown }
              const spec = sftpBookSpec(input.book)
              if (typeof input.path !== 'string' || input.path.trim() === '') throw new Error('path 必须是非空字符串')
              const recursive = input.recursive === true
              // 护栏在 SftpManager.remove 里（agent 工具与面板 HTTP 路由共用同一道）
              await sftpManager.remove(spec, input.path, recursive)
              return { ok: true, path: input.path.trim(), recursive }
            },
          })))
          activeDisposers.push(tools.register(defineTool({
            name: 'sftp_tree',
            // 只读工具：与同轮其它工具并发执行（宿主默认把未声明的工具当独占，见项目级 ROADMAP 第 4 项）
            isConcurrencySafe: () => true,
            description: '递归列举 SSH 远程目录结构（book 连接簿条目 + path）：深度优先、目录优先，maxDepth（1~8，默认 3）限层、maxEntries（1~2000，默认 500）限条数，超限 truncated:true；符号链接不跟随；读取失败的子目录列入 errors。适合先看远程项目结构再定位文件。',
            parameters: {
              book: { type: 'string', required: true, description: 'SSH 连接簿条目名' },
              path: { type: 'string', description: '远程目录路径（缺省 = 登录 home）' },
              maxDepth: { type: 'number', description: '最大下钻层数（1~8，默认 3）' },
              maxEntries: { type: 'number', description: '最大条目数（1~2000，默认 500）' },
            },
            output: {
              schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  path: { type: 'string', required: true },
                  entries: {
                    type: 'array',
                    required: true,
                    items: {
                      type: 'object',
                      additionalProperties: false,
                      properties: {
                        path: { type: 'string', required: true },
                        name: { type: 'string', required: true },
                        depth: { type: 'number', required: true },
                        isDir: { type: 'boolean', required: true },
                        size: { type: 'number', required: true },
                        mtime: { type: 'number', required: true },
                      },
                    },
                  },
                  truncated: { type: 'boolean', required: true },
                  errors: {
                    type: 'array',
                    required: true,
                    items: {
                      type: 'object',
                      additionalProperties: false,
                      properties: {
                        path: { type: 'string', required: true },
                        message: { type: 'string', required: true },
                      },
                    },
                  },
                },
              },
              render: (_args: unknown, value: unknown) => {
                const v = value as { path?: string; entries?: Array<{ path: string; name: string; depth: number; isDir: boolean; size: number }>; truncated?: boolean; errors?: Array<{ path: string; message: string }> }
                const entries = v.entries ?? []
                if (entries.length === 0) return [{ type: 'text', text: `远程目录 ${v.path ?? '?'} 为空` }]
                const head = `远程目录 ${v.path ?? '?'} 结构（${String(entries.length)} 项${v.truncated === true ? '，已截断' : ''}）：`
                const lines = entries.map((e) => {
                  const indent = '  '.repeat(Math.max(0, e.depth - 1))
                  const tail = e.isDir ? '/' : ' — ' + humanFileSize(e.size)
                  return `${indent}- ${e.name}${tail}`
                })
                for (const item of v.errors ?? []) lines.push(`! ${item.path}（${item.message}）`)
                return [{ type: 'text', text: head + '\n' + lines.join('\n') }]
              },
            },
            async execute(args: unknown): Promise<{ path: string; entries: Array<{ path: string; name: string; depth: number; isDir: boolean; size: number; mtime: number }>; truncated: boolean; errors: Array<{ path: string; message: string }> }> {
              const input = args as { book?: unknown; path?: unknown; maxDepth?: unknown; maxEntries?: unknown }
              const spec = sftpBookSpec(input.book)
              const result = await sftpManager.tree(spec, typeof input.path === 'string' ? input.path : '', {
                maxDepth: typeof input.maxDepth === 'number' && Number.isInteger(input.maxDepth) ? input.maxDepth : undefined,
                maxEntries: typeof input.maxEntries === 'number' && Number.isInteger(input.maxEntries) ? input.maxEntries : undefined,
              })
              return result
            },
          })))
          stateRef.toolsRegistered = true
          console.log('[dsh-tty] agent tools registered (tty_list, tty_open, tty_close, tty_run, tty_stats, tty_capture, tty_screen, tty_expect, tty_send, tunnel_list, sftp_list, sftp_read, sftp_write, sftp_mkdir, sftp_rename, sftp_remove, sftp_tree)')
        }
        refreshToolsHook = registerAll
        registerAll()
        return () => {
          stateRef.toolsRegistered = false
          refreshToolsHook = () => {}
          for (const dispose of activeDisposers) {
            try {
              dispose()
            } catch {
              /* 工具已注销 */
            }
          }
        }
      }, 'dsh-tty: agent tools')
    } else {
      console.log('[dsh-tty] tools service unavailable; agent tools skipped')
    }

    // 向 agent 公告终端面板能力（静态 section）+ 每轮注入活跃会话快照（动态 context）
    ctx.inject(['systemPrompt'], (promptCtx: Context) => {
      promptCtx.effect(() => {
        const systemPrompt = (promptCtx as unknown as { systemPrompt: { section(options: { name: string; order?: number; text: string }): () => void; context(options: { name: string; order?: number; text: string | ((context: unknown) => string) }): () => void } }).systemPrompt
        let contextDisposable: (() => void) | undefined
        let sectionDisposable: (() => void) | undefined

        /** 幂等重建：按 enabled && announceToAgent 撤下/恢复公告与动态快照（禁用热生效入口）。 */
        const rebuild = (): void => {
          if (sectionDisposable !== undefined) {
            try {
              sectionDisposable()
            } catch {
              /* 已注销 */
            }
            sectionDisposable = undefined
          }
          if (contextDisposable !== undefined) {
            try {
              contextDisposable()
            } catch {
              /* 已注销 */
            }
            contextDisposable = undefined
          }
          if (!stateRef.enabled || !stateRef.announceToAgent) return
          contextDisposable = systemPrompt.context({
            name: 'plugin:dsh-tty:terminals',
            order: 150,
            text: () => {
              const list = sessions.list()
              // D78 补：本地命令的语法随宿主 shell 变（POSIX / cmd / PowerShell），
              // 而「Shell 路径」是热改的配置——所以这行每轮现算，不冻在工具描述里。
              const shellLine = commandShellHint(live.shell)
              if (list.length === 0) return `当前没有终端面板会话（可用 tty_open 自己开一个，或引导用户打开「终端」面板）。\n${shellLine}`
              // D77：只读保留态（进程已退出）**不能冒充活会话**——模型会以为那个长驻
              // 任务还在跑、或者对它发命令。这里把两者分开：活会话逐条列，保留态压成
              // 一行汇总（每轮 prompt 的增量是常数，不随条数线性膨胀）。
              const alive = list.filter((s) => s.exited !== true)
              const gone = list.filter((s) => s.exited === true)
              const head = alive.length === 0
                ? '当前没有活着的终端面板会话。'
                : '当前活跃的终端面板会话（可用 tty_capture / tty_screen / tty_expect / tty_send 操作，用 tty_open / tty_close 开关，sid 如下）：\n' + alive.map((s) => {
                    const where = s.kind === 'ssh' ? `ssh ${s.target}` : `pid=${String(s.pid ?? '?')} cwd=${s.cwd}`
                    const owner = s.owner === 'agent' ? ' [agent 开的]' : ''
                    // D88：这里只给**非空闲**的两种态打标（「没有标记」= 空闲且可信）——
                    // 每轮的增量只在异常态出现，三态又不会糊成两种。省略态必须看得见：
                    // 一个「不知道在不在跑」的会话最不该被当成空闲。
                    // 措辞与 tty_list 的渲染**逐字一致**（两处都给「现在」：它才是那句里
                    // 真正要 agent 照做的部分；每轮多 2 个字符换掉一处措辞漂移，值）
                    const busy = s.running === true
                      ? ' [运行中——现在别往里发命令]'
                      : s.running === false
                        ? ''
                        : ' [命令状态未知]'
                    return `- sid=${s.sid} [${s.kind}]${owner}${s.persist === true ? ' [tmux 持久]' : ''}${busy} ${where} (最后活动 ${new Date(s.lastOutputAt).toLocaleTimeString()})`
                  }).join('\n')
              const tail = gone.length === 0
                ? ''
                : `\n另有 ${String(gone.length)} 条已退出但输出仍可读的会话（只读：tty_send 会报错，要用 tty_capture / tty_screen 读）：` + gone.map((s) => {
                    const how = s.signal !== undefined ? `signal=${s.signal}` : s.exitCode === undefined ? '退出码未知' : `exitCode=${String(s.exitCode)}`
                    return `sid=${s.sid} (${how})`
                  }).join('、')
              return head + tail + '\n' + shellLine
            },
          })
          sectionDisposable = systemPrompt.section({ name: 'plugin:dsh-tty', order: 150, text: TTY_GUIDANCE })
        }

        refreshAnnouncementHook = rebuild
        rebuild()
        return () => {
          refreshAnnouncementHook = () => {}
          if (sectionDisposable !== undefined) {
            try {
              sectionDisposable()
            } catch {
              /* 已注销 */
            }
          }
          if (contextDisposable !== undefined) {
            try {
              contextDisposable()
            } catch {
              /* 已注销 */
            }
          }
        }
      }, 'dsh-tty: announcement')
    })

    // 孤儿会话回收器：超过保活期的异常断开会话定期清理（grace=0 时为 no-op，
    // 断开时立即结束）；插件卸载时随 effect 一起停掉
    const reaperTimer = setInterval(() => {
      void sessions.reapOrphans(live.reconnectGraceMs)
      sessions.reapExited(EXITED_RETAIN_MS) // D77：保留期策略为有限值时到点退役（∞ 时不动作，条数由 capExited 兜）
    }, REAPER_INTERVAL_MS)
    reaperTimer.unref?.()
    ctx.effect(() => () => clearInterval(reaperTimer), 'dsh-tty: orphan reaper')

    // 虚拟屏异常兜底（D57）：xterm-headless 的解析跑在 WriteBuffer 的 setTimeout
    // 回调里，写入路径的同步 try/catch 结构性拦不住；没有兜底时任何一处虚拟屏异常
    // 都会直接打死宿主进程（Web GUI 掉线、会话表清空、agent 全丢）。插件卸载时摘掉。
    ctx.effect(() => installXtermScreenCrashGuard(), 'dsh-tty: xterm crash guard')

    // 插件卸载时回收全部会话、隧道与 SFTP 连接
    ctx.effect(() => {
      return () => {
        void sessions.disposeAll()
        tunnelManager.disposeAll()
        sftpManager.disposeAll()
      }
    }, 'dsh-tty: session cleanup')

    console.log(`[dsh-tty] mounted (shell=${live.shell}, term=${live.term}, cwd=${live.cwd}, maxSessions=${sessions.limitValue})`)
  },
})

export const { name, inject, apply } = plugin
