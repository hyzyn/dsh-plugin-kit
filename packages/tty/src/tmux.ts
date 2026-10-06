/**
 * @hyzyn/dsh-tty — tmux 会话持久化（0.10.0）。
 *
 * 目标：给「需要活得比宿主久」的工作（dev server、build、训练任务）一个显式
 * 逃生门。默认安全模型不变 —— 会话仍随宿主生死（内核级 PTY 清理）；持久标签
 * 只是把会话状态委托给 tmux server（专用 socket，与用户自己的 tmux 完全隔离）托管：
 * 浏览器断线、保活窗口超时、甚至宿主重启后，重开标签用同一持久名 `new-session -A`
 * 即可接回原现场（正在跑的程序、pane 状态原样恢复）。socket 名按 profile 区分
 * （`tmuxSocketName()`，tty D60），未设 profile 时是历史名 `dsh-tty`。
 *
 * 职责：
 *   1. probeTmux()       —— 探测 tmux 可用性与版本（≥3.3 才支持 DCS
 *                           allow-passthrough，agent 命令粒度工具依赖它），
 *                           30s TTL 缓存；不可用时 spawn 走普通会话 + 灰字提示；
 *   2. ensureTmuxAssets  —— 在稳定目录（pluginRuntimeDir()）生成 tmux.conf 与
 *                           内层启动器 inner.sh（write-if-changed 原子覆盖）；
 *                           tmux server 只在首次启动读 conf，路径必须稳定；
 *   3. buildTmuxSpawnPlan—— 组装 `-c` 包装层：TERM/COLORTERM 注入 + exec tmux
 *                           客户端（`-A` attach-or-create；cwd 由 node-pty 的
 *                           spawn cwd 继承，tmux 新 session 以此为 pane cwd）；
 *   4. killTmuxSession   —— kill 帧的 tmux 侧收尾：kill-session 让 pane 随之
 *                           结束（会话真正关闭，而不是 detach 留活口）。
 *
 * 残留会话边界：宿主被硬杀/浏览器丢失标签规格时，tmux server 上的会话会留存
 * （这正是恢复能力的前提），直到机器重启或手动 `tmux -L dsh-tty kill-server`；
 * 专用 socket 让这些残留对用户的 tmux 世界完全不可见（README 已知限制）。
 */
import { execFile } from 'node:child_process'
import type { ShellSpawnPlan } from './shell-integration.js'
import { buildTmuxInnerLauncher, pluginRuntimeDir, shSingleQuote, tmuxSocketName } from './shell-integration.js'
import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

/**
 * 专用 tmux socket 名（`tmux -L <名>`）——**按 profile 区分**，见
 * `shell-integration.ts` 的 `tmuxSocketName()`（住那边是为了让 shell 桩也能用同一份，
 * 避免两处各算一遍必然漂）。这里只做转出，方便 tmux 的调用点就近引用。
 */
export { tmuxSocketName }

/** 探测结果：available = tmux 存在；passthrough = 版本 ≥3.3（DCS 信封可转发）。 */
export interface TmuxProbe {
  available: boolean
  passthrough: boolean
  /**
   * `true` = **没探明白**（探测超时 / 被信号收掉），而不是「tmux 不在」（D80）。
   * 调用方据此把提示写成「机器忙，重开标签再试」而不是「未安装」；这种结论**不进缓存**。
   */
  inconclusive?: boolean
}

let probeCache: { at: number; value: TmuxProbe } | null = null
const PROBE_TTL_MS = 30_000
/**
 * 单次探测的超时序列（毫秒）：首次 3s，只有「没探明白」才补探一次 6s（D80）。
 *
 * 为什么不是把 3s 直接放大：`tmux -V` 空闲是毫秒级，超时只可能是机器忙（宿主启动
 * 争抢期能把子进程拉起拖到数秒）。补探一次能救回绝大多数；固定放大只会让「真没装」
 * 的场景也白等。挂载路径上这一步是同步等的（要先决定 spawn 计划），所以次数必须封顶。
 */
const PROBE_TIMEOUTS_MS = [3_000, 6_000]

/**
 * `execFile` 被我们的 timeout 收掉（killed / signal；Node 文档里还有 ETIMEDOUT）
 * ——与「命令不存在」（ENOENT）、「命令退出非零」区分开：前者是没探明白，后者是
 * 确定的不可用（D80）。只认标记，不猜文案。
 */
function isProbeTimeout(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const record = error as { killed?: unknown; signal?: unknown; code?: unknown }
  return record.killed === true || record.signal === 'SIGTERM' || record.code === 'ETIMEDOUT'
}

/**
 * 探测 tmux 可用性与版本（30s TTL；超时→补探一次）。
 *
 * 超时**不判死**（D80）：原先任何 error 都返回 `{available:false}` 且结果进 30s 缓存，
 * 于是启动争抢期一次慢探测就让这一窗口里开的每个持久标签静默降级成普通会话，提示还
 * 写成「未检测到 tmux」——把「机器忙」误报成「没装」。现在超时补探一次、结论不进缓存、
 * `inconclusive` 带出去让调用方如实提示。
 */
export async function probeTmux(): Promise<TmuxProbe> {
  if (probeCache !== null && Date.now() - probeCache.at < PROBE_TTL_MS) return probeCache.value
  let value = await runTmuxProbe(PROBE_TIMEOUTS_MS[0])
  for (let attempt = 1; value.inconclusive === true && attempt < PROBE_TIMEOUTS_MS.length; attempt += 1) {
    value = await runTmuxProbe(PROBE_TIMEOUTS_MS[attempt])
  }
  // 只有确定结论才进缓存：把瞬态超时缓存 30s 会把「一次机器忙」放大成一批标签降级，
  // 而标签恢复与 agent tty_open 恰恰扎堆在启动期（当年就是这条缓存放大了症状）
  if (value.inconclusive !== true) probeCache = { at: Date.now(), value }
  return value
}

/**
 * 单次 tmux 调用的结果：`error` 原样带出——「超时」与「没有 server / 没装」的区别
 * 全靠它（见 `isProbeTimeout`），所以这里不吞错、也不翻译。
 */
interface TmuxExecResult {
  error?: unknown
  stdout: string
}

type TmuxExec = (args: string[], timeoutMs: number) => Promise<TmuxExecResult>

const execTmux: TmuxExec = (args, timeoutMs) =>
  new Promise<TmuxExecResult>((resolve) => {
    execFile('tmux', args, { timeout: timeoutMs }, (error, stdout) => {
      resolve({
        ...(error !== null && error !== undefined ? { error } : {}),
        stdout: String(stdout),
      })
    })
  })

let tmuxExec: TmuxExec = execTmux

/**
 * 供测试注入 tmux 调用（真机上不必调用）；传 `undefined` 恢复真实调用并清探测缓存。
 *
 * 需要这个缝是因为真实 `tmux` 在 CI 上未必存在，"超时才补探、超时不进缓存"这几条
 * 又必须能确定性地造出来（否则这三条只会在有 tmux 的机器上被覆盖）。
 */
export function setTmuxExecForTest(exec?: TmuxExec): void {
  tmuxExec = exec ?? execTmux
  probeCache = null
}

/** 单次探测（超时序列里的一档）。 */
function runTmuxProbe(timeoutMs: number): Promise<TmuxProbe> {
  return tmuxExec(['-V'], timeoutMs).then(({ error, stdout }) => {
    if (error !== undefined) {
      // 超时 = 没探明白；ENOENT / 非零退出 = 确定的「不可用」
      return isProbeTimeout(error)
        ? { available: false, passthrough: false, inconclusive: true }
        : { available: false, passthrough: false }
    }
    const match = /tmux\s+(\d+)\.(\d+)/.exec(stdout)
    if (match === null) return { available: false, passthrough: false }
    const major = Number(match[1])
    const minor = Number(match[2])
    return { available: true, passthrough: major > 3 || (major === 3 && minor >= 3) }
  })
}

/** spawn 帧里的持久名清洗：合法字符集加 `dsh-` 前缀；不合法退回 sid 派生名。 */
export function sanitizePersistName(raw: unknown, sid: string): string {
  const name = typeof raw === 'string' ? raw.trim() : ''
  if (/^[A-Za-z0-9_-]{1,48}$/.test(name)) return `dsh-${name}`
  return `dsh-${sid.replace(/[^A-Za-z0-9_-]/g, '')}`
}

/** write-if-changed + rename（与 shell-integration 桩同策略；目录自动创建）。 */
function writeIfChanged(file: string, content: string): void {
  try {
    if (readFileSync(file, 'utf8') === content) return
  } catch {
    /* 不存在：继续写入 */
  }
  mkdirSync(dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  writeFileSync(tmp, content)
  renameSync(tmp, file)
}

/** 同 shell-integration：本地路径要用认识 `\` 的 dirname（见那边的说明）。 */

/** 组装 tmux.conf：状态栏关（防重绘污染 capture）、真色透传、内层启动器。 */
function buildTmuxConf(passthrough: boolean, runtimeDir: string): string {
  const lines = [
    '# generated by dsh-tty（会话持久化）— 手改会在下次生成时被覆盖；',
    '# tmux server 仅首次启动读取本文件，改完需 `tmux -L ' + tmuxSocketName() + ' kill-server` 或重启宿主生效',
    'set -g default-terminal "screen-256color"',
    'set -ga terminal-overrides ",*:RGB"',
    'set -g status off',
    'set -g history-limit 20000',
    `set -g default-command ${shSingleQuote(join(runtimeDir, 'inner.sh'))}`,
  ]
  if (passthrough) lines.push('set -g allow-passthrough on')
  return lines.join('\n') + '\n'
}

/**
 * 生成/刷新 tmux 运行资产（tmux.conf + inner.sh）：每个持久 spawn 前调用，
 * 内容随当前配置（shell / shellIntegration / passthrough）write-if-changed。
 * conf 只在 tmux server 首启时被读，后续 spawn 的重写不生效 —— 但 inner.sh
 * 内容每次开 pane 都会重新执行，配置热改对持久标签的新 pane 仍然生效。
 */
export function ensureTmuxAssets(options: { shell: string; colorTerm: string; shellIntegration: boolean; passthrough: boolean }): void {
  const runtimeDir = pluginRuntimeDir()
  writeIfChanged(join(runtimeDir, 'tmux.conf'), buildTmuxConf(options.passthrough, runtimeDir))
  const inner = join(runtimeDir, 'inner.sh')
  writeIfChanged(inner, buildTmuxInnerLauncher(options.shell, options.colorTerm, options.shellIntegration))
  try {
    chmodSync(inner, 0o755)
  } catch {
    /* chmod 失败由 exec 阶段自然报错 */
  }
}

/**
 * 持久本地会话的 `-c` 包装层：TERM/COLORTERM 注入（与普通会话同机制）后
 * `exec tmux -A` attach-or-create。持久名已过 sanitizePersistName（安全字符集），
 * 单引号包裹防注入；cwd 不进命令行 —— tmux 客户端继承 node-pty spawn 的 cwd，
 * 新 session 的 pane 以此为工作目录。
 */
export function buildTmuxSpawnPlan(options: { shell: string; term: string; colorTerm: string; tmuxName: string }): ShellSpawnPlan {
  const runtimeDir = pluginRuntimeDir()
  const pre = `export TERM=${shSingleQuote(options.term)}; export COLORTERM=${shSingleQuote(options.colorTerm)};`
  const exec = [
    'exec tmux',
    '-L', tmuxSocketName(),
    '-f', shSingleQuote(join(runtimeDir, 'tmux.conf')),
    'new-session -A -s', shSingleQuote(options.tmuxName),
  ].join(' ')
  return { argv: [options.shell, '-c', `${pre} ${exec}`], env: {} }
}

/**
 * kill 帧的 tmux 侧收尾：kill-session（不存在/已死同样 resolve，错误吞掉）。
 *
 * 走 `tmuxExec` 注入缝而不是直连 `execFile`（0.25.0 统一）：否则这条路径在测试里既
 * 看不见（拿不到实参、无法断言 socket 名）也躲不开（会真的去调机器上的 tmux）。
 */
export function killTmuxSession(tmuxName: string): Promise<void> {
  return tmuxExec(['-L', tmuxSocketName(), 'kill-session', '-t', tmuxName], 4000).then(() => undefined)
}

/**
 * 专用 socket 上现存的 tmux 会话名（sessions 帧的 tmux 字段）。
 *
 * 探不明白（超时 / 被信号收掉）返回 `undefined` 而不是 `[]`（D81）：空数组会被读成
 * 「确实没有任何持久会话」这个**确定答案**，而失败只是「不知道」——下游据此淘汰
 * 持久标签规格时，两者含义完全相反。所以只把**确定**的「没有 server / 没装」
 * （非零退出、ENOENT）落成 `[]`。
 */
export function listTmuxSessions(): Promise<string[] | undefined> {
  return tmuxExec(['-L', tmuxSocketName(), 'list-sessions', '-F', '#{session_name}'], 4000).then(({ error, stdout }) => {
    if (error !== undefined) return isProbeTimeout(error) ? undefined : []
    return stdout.trim().split('\n').filter(Boolean)
  })
}

/**
 * attach 重画：tmux 背书会话重连时不回放宿主环形缓冲（tmux 的整屏重画会把
 * 同样内容再画一遍 → 重影 + 幽灵滚动条），改为让 tmux 强制重画客户端一次。
 * 同一会话可能被多个窗口同时接回（每窗口一个 PTY 客户端），list-clients
 * 逐个 refresh——只刷第一个会把另一个窗口留在 reset 后的空白屏上；任何
 * 失败静默吞掉（极端情况下用户敲一次键 tmux 也会重画）。
 */
export function refreshTmuxClient(tmuxName: string): Promise<void> {
  return new Promise((resolve) => {
    execFile('tmux', ['-L', tmuxSocketName(), 'list-clients', '-t', tmuxName, '-F', '#{client_name}'], { timeout: 4000 }, (error, stdout) => {
      if (error !== null && error !== undefined) {
        resolve()
        return
      }
      const clients = String(stdout).trim().split('\n').filter(Boolean)
      if (clients.length === 0) {
        resolve()
        return
      }
      void Promise.all(clients.map((client) => new Promise<void>((done) => {
        execFile('tmux', ['-L', tmuxSocketName(), 'refresh-client', '-t', client], { timeout: 4000 }, () => done())
      }))).then(() => resolve())
    })
  })
}
