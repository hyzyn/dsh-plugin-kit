/**
 * 容器 / 探针的**观测层**（`docs/devdata-plan.md` §13.2 / §16.1 第 3 步）。
 *
 * ## 这一层的职责边界
 *
 * 只做一件事：**把「目标机上现在是什么样」取回来**，填成 `ServiceObservation`。它**不判定**
 * Ready 与否——判定是 `env-ready-eval.ts` 的纯函数（那边的头注解释了为什么必须分开：
 * 这一层最容易悄悄错掉的是**判错时机**，而时机要靠观测层如实、及时地取值）。
 *
 * 所以这里把两件外部依赖都做成**注入**的：
 *
 *   - `run(argv)`：在目标机上执行 docker（本机目标就是子进程，SSH 目标就是 `kit` 的执行层）；
 *   - `probe(...)`：HTTP 探针。
 *
 * 于是本文件**可以完全脱离真机测试**（喂一个假 `run`，按 argv 返回预设输出），而真机上唯一
 * 需要单独验的是「这两根注入线接对了没有」——那是插件层的活（第 4 步）。
 *
 * ## 为什么只发两条命令
 *
 * `docker inspect --format` 一次就把状态 / `StartedAt` / 退出码 / 重启次数 / 健康全拿到，
 * 而且**不需要 JSON 解析**（模板里只留这五个字段，字段值域还都是可控的——见分隔符的注释）。
 * 日志只在清单声明了 `logPattern` 时才取：观测的代价是每个服务两条命令的**串行** SSH 往返，
 * 不该为「起个 redis 就完事」那种服务多跑一条。
 *
 * ## 「容器没起」与「通道不通」必须分开
 *
 * 这是本层最容易骗人的地方：SSH 不通 / docker daemon 没起时，`docker inspect` 也返回非零退出码。
 * 若把它当成「容器不存在」，判定层会给出 `unready`（「还没观测到这个容器」）——于是 `env_wait`
 * 会**等满超时**，而真正的原因（连不上）一个字都没进报告，人再去查一圈。
 * 所以：只有 docker 明确说「没有这个对象」才是 `found: false`，其余非零一律进 `failure`。
 */
import type { ContainerStatus, HealthStatus, ServiceObservation } from './env-ready-eval.js'
import type { ReadyCheck, ServiceRequirement } from './env-ready.js'

/**
 * 一条命令的结果（只留本层用到的字段，与 `kit` 的 `ExecResult` 结构兼容）。
 *
 * `timedOut` / `truncated` **必须一起带过来**：拿半截输出当正常输出解析，可能刚好得到
 * 一个合法但**错的**状态（例如把上一次启动留下的行当成本次的）。
 */
export interface ObservedCommand {
  code: number | null
  stdout: string
  stderr: string
  /** 执行层因为超时被强制中断。 */
  timedOut?: boolean
  /** 输出超过上限被截断。 */
  truncated?: boolean
}

/** 跑一条 docker 命令时的选项（缺省由那一根线自己定，见 `channel.ts`）。 */
export interface DockerRunOptions {
  timeoutMs?: number
  maxBytes?: number
  /** 超出上限时保留**尾部**（`docker logs` 要的是尾部）。 */
  keepTail?: boolean
}

/**
 * 一根能跑 docker 的线：本机子进程，或 SSH 执行层。
 *
 * 只有这一个方法，是因为观测层要的就只有这一个——把「怎么连」挡在这个接口后面，这一层才能
 * 完全脱离真机测试。
 */
export interface DockerRunner {
  run(argv: readonly string[], options?: DockerRunOptions): Promise<ObservedCommand>
}

/** 观测用的两根外部通道。 */
export interface ObservationIo extends DockerRunner {
  /** HTTP 探针（从**运行本工具的机器**发出；`host` 由调用方给）。 */
  probe(input: { host: string; port: number; path: string; timeoutMs: number }): Promise<{ ok: boolean; status?: number; detail?: string }>
}

/** 观测的输入。 */
export interface ObserveInput {
  io: ObservationIo
  /** 探针要打的主机：本机目标传 `127.0.0.1`，SSH 目标传那台主机的地址。 */
  host: string
  services: readonly ServiceRequirement[]
  /** 日志尾部行数（缺省 200）。只有声明 `logPattern` 的服务会取日志。 */
  logTail?: number
  /** 每个服务探针的超时（缺省 3000ms）。 */
  probeTimeoutMs?: number
  /** 取观测的时刻（RFC3339 带时区）。注入是为了让用例能钉住报告里的「这是哪一刻看到的」。 */
  now?: () => string
}

/** 观测结果。 */
export interface ObservationResult {
  observations: ServiceObservation[]
  /**
   * **通道级失败**：docker 没装 / daemon 连不上 / SSH 不通。
   *
   * 有它时 `observations` 可能不完整，**不许**当作「这些容器没起」——两者的处置完全不同：
   * 前者要去修通道，后者才该等。调用方必须把它原样说给用户（见文件头注）。
   */
  failure?: string
}

/** 缺省日志尾部行数。 */
export const DEFAULT_LOG_TAIL = 200

/** 缺省探针超时。 */
export const DEFAULT_PROBE_TIMEOUT_MS = 3000

/** `docker inspect` 输出的字节上限（一行五个字段，够得离谱了）。 */
export const INSPECT_MAX_BYTES = 64 * 1024

/** `docker logs` 输出的字节上限（尾部若干行；`keepTail` 保证丢的是头部）。 */
export const LOGS_MAX_BYTES = 512 * 1024

/**
 * `docker inspect` 的字段模板（一行五个字段）。
 *
 * **字段路径要照真机的 JSON 结构写**（2026-10-02 真机抓到的一次）：`RestartCount` 是**顶层**字段，
 * 不在 `.State` 下面——`{{.State.RestartCount}}` 会让 docker 直接报
 * `template parsing error: map has no entry for key "RestartCount"`，于是**每条 inspect 都失败**，
 * 而假 docker 夹具照自己的想象回一行，单测全绿。守这一点的用例见 `test/inspect-template.test.ts`
 * （拿真机 `docker inspect` 的裁剪样本逐条解析模板里的字段路径）。
 *
 * 分隔符用 `|`：五个字段的值域都是**封闭或受限**的——状态与健康各自来自固定枚举、
 * `StartedAt` 是 RFC3339、退出码与重启次数是整数——没有一个可能含 `|`。用 Go 模板而不是取整个
 * JSON，是为了让这一层不必依赖 docker 的 JSON 结构与字段增删（那是容器面板那一整套的活）。
 */
export const INSPECT_TEMPLATE = '{{.State.Status}}|{{.State.StartedAt}}|{{.State.ExitCode}}|{{.RestartCount}}|{{if .State.Health}}{{.State.Health.Status}}{{end}}'

/** `docker inspect` 一条命令的 argv。 */
export function inspectArgv(name: string): string[] {
  return ['docker', 'inspect', '--format', INSPECT_TEMPLATE, name]
}

/** `docker logs` 一条命令的 argv（`--timestamps` 是**必须的**：判定层要拿行内时刻比 `StartedAt`）。 */
export function logsArgv(name: string, tail: number): string[] {
  return ['docker', 'logs', '--timestamps', '--tail', String(tail), name]
}

/** 解析后的一行 inspect。 */
export interface InspectFields {
  status: ContainerStatus
  startedAt?: string
  exitCode?: number
  restartCount?: number
  health?: HealthStatus
}

/** 解析结果：认不出来时给 `reason`，**不猜**（猜错的方向是「判成就绪」或「误判为否证」）。 */
export type InspectParse = { ok: true; fields: InspectFields } | { ok: false; reason: string }

const CONTAINER_STATUSES: readonly ContainerStatus[] = ['running', 'exited', 'created', 'paused', 'restarting', 'dead', 'removing']
const HEALTH_STATUSES: readonly HealthStatus[] = ['starting', 'healthy', 'unhealthy']

/**
 * 解析 `docker inspect --format` 的那一行。
 *
 * **状态必须是已知枚举里的一个**：拿到 `Runing` 这种（拼错 / docker 改了词）时返回 `ok: false`，
 * 而不是当成 `undefined` 往下走——判定层把「状态不是 running」当**明确否证**，于是一个上游的
 * 拼写问题会变成「别等了，容器崩了」。这正是那种「看起来像 bug、其实在另一层」的故障。
 */
export function parseInspectOutput(text: string): InspectParse {
  const line = text.split('\n').find((item) => item.trim() !== '')
  if (line === undefined) return { ok: false, reason: 'docker inspect 没有任何输出' }
  const parts = line.trim().split('|')
  if (parts.length < 5) return { ok: false, reason: `docker inspect 的字段数不对（拿到 ${String(parts.length)} 个）：${line.trim()}` }

  const [rawStatus = '', rawStarted = '', rawExit = '', rawRestarts = '', rawHealth = ''] = parts
  if (!(CONTAINER_STATUSES as readonly string[]).includes(rawStatus)) {
    return { ok: false, reason: `无法识别的容器状态 ${JSON.stringify(rawStatus)}` }
  }

  const fields: InspectFields = { status: rawStatus as ContainerStatus }
  const startedAt = rawStarted.trim()
  // 未启动过（`created`）时 docker 给零值 `0001-01-01T00:00:00Z`：它不是「一个时刻」，
  // 当成缺失——否则判定层会拿它去做时间比较，得出一个毫无意义的先后关系。
  if (startedAt !== '' && !startedAt.startsWith('0001-01-01')) fields.startedAt = startedAt

  const exitCode = Number.parseInt(rawExit.trim(), 10)
  if (Number.isInteger(exitCode)) fields.exitCode = exitCode

  const restarts = Number.parseInt(rawRestarts.trim(), 10)
  if (Number.isInteger(restarts)) fields.restartCount = restarts

  const health = rawHealth.trim()
  if (health !== '') {
    if (!(HEALTH_STATUSES as readonly string[]).includes(health)) {
      return { ok: false, reason: `无法识别的健康状态 ${JSON.stringify(health)}` }
    }
    fields.health = health as HealthStatus
  }
  return { ok: true, fields }
}

/** 把 `docker logs` 的输出切成行（去掉末尾空行；行内保留 `--timestamps` 的前缀）。 */
export function parseLogOutput(text: string): string[] {
  const lines = text.split('\n')
  while (lines.length > 0 && (lines[lines.length - 1] ?? '').trim() === '') lines.pop()
  return lines
}

/**
 * docker 说「没有这个对象」吗。
 *
 * 只认 docker 自己的两条文案（`No such object` 是 1.13+ 的 `docker inspect` 文案，
 * `No such container` 出现在部分子命令里）。**别的非零一律不当「不存在」**——那是本文件头注里
 * 特意分出来的「通道不通」。
 */
export function isMissingContainer(stderr: string): boolean {
  return /No such object|No such container/i.test(stderr)
}

/** 通道级失败的可读判断（错误文案原样带出去，人要靠它决定去修什么）。 */
export function channelFailureMessage(argv: readonly string[], result: ObservedCommand): string {
  const detail = (result.stderr.trim() !== '' ? result.stderr : result.stdout).trim().split('\n')[0] ?? ''
  return `在目标机上执行 ${argv.slice(0, 2).join(' ')} 失败（退出码 ${String(result.code ?? 'null')}）：${detail === '' ? '没有输出' : detail}`
}

/**
 * 取一批服务的观测。
 *
 * **串行**：目标可能是台 NAS，每个服务两条 SSH 往返，并发只是把 Chunk 额度（D150）挤满、
 * 让诊断文案变成「通道额度已满」。等待本来就不是这一层的瓶颈。
 */
export async function observeServices(input: ObserveInput): Promise<ObservationResult> {
  const logTail = input.logTail ?? DEFAULT_LOG_TAIL
  const probeTimeoutMs = input.probeTimeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS
  const now = input.now ?? (() => new Date().toISOString())
  const observations: ServiceObservation[] = []

  for (const service of input.services) {
    const observedAt = now()

    const inspect = await input.io.run(inspectArgv(service.name), { maxBytes: INSPECT_MAX_BYTES })
    if (inspect.timedOut === true) {
      return { observations, failure: `取 ${service.name} 的 docker inspect 超时（目标机没在超时前答复）` }
    }
    if (inspect.truncated === true) {
      // 截断的 inspect **不能**解析：字段可能被切掉，解析结果会是一个合法但错的读数。
      return { observations, failure: `取 ${service.name} 的 docker inspect 时输出被截断（上限 ${String(INSPECT_MAX_BYTES)} 字节）` }
    }
    if (inspect.code !== 0) {
      if (!isMissingContainer(inspect.stderr)) {
        return {
          observations,
          failure: channelFailureMessage(inspectArgv(service.name), inspect),
        }
      }
      observations.push({ name: service.name, found: false, observedAt })
      continue
    }

    const parsed = parseInspectOutput(inspect.stdout)
    if (!parsed.ok) {
      // 认不出字段 = 我这一层没法如实报告，**不能**降级成「容器不存在」（那会让等待一直在等）。
      return {
        observations,
        failure: `读不懂 ${service.name} 的 docker inspect 输出：${parsed.reason}`,
      }
    }

    const observation: ServiceObservation = { name: service.name, found: true, observedAt, ...parsed.fields }

    // 只在清单真的要用日志时才取：观测的每条命令都是一次远端往返。
    if (needsLogs(service.ready)) {
      const logs = await input.io.run(logsArgv(service.name, logTail), { maxBytes: LOGS_MAX_BYTES, keepTail: true })
      if (logs.code === 0 && logs.truncated !== true) observation.logLines = parseLogOutput(logs.stdout)
      // 日志取不到（超时 / 截断 / 非零）**不是**通道失败：容器可能在跑但还没有任何输出
      // （`docker logs` 对刚起的容器可能返回空，容器被删的瞬间也可能非零）。判定层拿不到行只会
      // `unready`——继续等的方向是对的。截断那一档同理：行集不完整时**宁可缺证**，也不拿半截
      // 日志去比 `StartedAt`。
    }

    if (service.ready?.kind === 'httpProbe') {
      observation.probe = await input.io.probe({
        host: input.host,
        port: service.ready.port,
        path: service.ready.path,
        timeoutMs: probeTimeoutMs,
      })
    }

    observations.push(observation)
  }

  return { observations }
}

/** 这条就绪判据需要日志吗（只有 `logPattern` 需要）。 */
export function needsLogs(ready: ReadyCheck | undefined): boolean {
  return ready?.kind === 'logPattern'
}
