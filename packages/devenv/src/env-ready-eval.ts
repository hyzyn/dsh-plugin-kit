/**
 * 就绪判据的**求值**（`docs/devdata-plan.md` §13.2）。
 *
 * > **归属（2026-10-02）**：本文件从 `packages/devdata/src/env-ready-eval.ts` **原样迁来**
 * > （plan §16.1 的第 2 步，与建包同一步）。判据见 `env-ready.ts` 的归属说明；内容未改。
 *
 * ## 判定的顺序就是这份判据本身
 *
 * 对每个服务，按固定顺序收集证据；每一步都可能把结论钉死在 `refuted`：
 *
 * 1. **容器在跑**吗？不在（`exited` / `dead` / `restarting`）→ `refuted`。
 *    `restarting` 也算 `refuted`：它正在重启，等下去只会看到又一次重启。
 * 2. **健康检查**是 `unhealthy` 吗？是 → `refuted`。
 * 3. **`StartedAt`** 能解析吗？不能 → `unready`（缺证，不是「已否证」）。
 * 4. **启动完成行**出现了吗？没出现 → `unready`。
 * 5. 出现了，但它**早于本次 `StartedAt`** 吗？是 → `unready`。
 *    **这是最关键的一步**：容器重启后日志缓冲区里还留着上一个进程的启动完成行，
 *    只看「有没有这一行」会在重启那一瞬间判成就绪——而那正是最不该放行的一刻。
 * 6. 全过 → `ready`。
 *
 * ## 为什么 `refuted` 必须与 `unready` 分开
 *
 * 冷启动可配到 150 秒。容器已经崩了却让调用方等满超时，它拿到的结论是「超时」——
 * 而 agent 对「超时」的反应通常是**再等一次**。分开之后，`refuted` 能立刻停止等待并说清原因。
 */

import { formatDuration, type ReadyCheck, type ReadyProfile, type ServiceRequirement } from './env-ready.js'

/** 容器的运行状态（`docker inspect` 的 `State.Status` 取值里我们关心的那几个）。 */
export type ContainerStatus = 'running' | 'exited' | 'created' | 'paused' | 'restarting' | 'dead' | 'removing'

/** 健康检查状态（与 `docker inspect` 的 `State.Health.Status` 对齐）。 */
export type HealthStatus = 'starting' | 'healthy' | 'unhealthy'

/**
 * 一个服务的**观测**：从 docker 通道取到的原始事实。
 *
 * 刻意只放事实，不放任何结论——「就绪了没有」是 `evaluateService` 的事，两者分开才能单测。
 */
export interface ServiceObservation {
  name: string
  /** 没观测到这个容器（不存在 / 不在清单里 / 通道没取到）。 */
  found: boolean
  status?: ContainerStatus
  /** `docker inspect` 的 `State.StartedAt`（RFC3339，带时区）。 */
  startedAt?: string
  /** 容器的退出码（`exited` 时有意义；**143 = SIGTERM**，`jenkins-release` 技能里的常见噪声）。 */
  exitCode?: number
  /** 重启次数（**> 0 说明这个容器不稳定**，即便现在 running 也要在报告里体现）。 */
  restartCount?: number
  health?: HealthStatus
  /** 近期日志（按时间正序；实现方负责只取尾部若干行）。 */
  logLines?: readonly string[]
  /**
   * 取这些日志的时刻（RFC3339，带时区）。
   *
   * 用途是**新鲜度**：日志是某个时刻的快照，报告里要说清「这是哪一刻看到的」，
   * 否则一份过期快照会让人以为现在还这样。
   */
  observedAt?: string
  /**
   * HTTP 探针的结果（清单里声明 `httpProbe` 时必需）。
   *
   * **由执行层探完带回来**，判定层不发请求——这样判定层保持纯函数，而「探什么」仍由清单唯一决定。
   */
  probe?: {
    ok: boolean
    /** HTTP 状态码（没连上时为 `undefined`）。 */
    status?: number
    /** 失败原因（给报告用）。 */
    detail?: string
  }
}

/** 一个服务的判定。 */
export type ServiceVerdict = 'ready' | 'unready' | 'refuted'

/** 一个服务的判定结果。 */
export interface ServiceResult {
  name: string
  verdict: ServiceVerdict
  /** 一句话结论。 */
  message: string
  /** 判据满足到了哪一步（报告里的进度）。 */
  met: string[]
  /** 还缺什么证据（`unready` 时非空）。 */
  missing: string[]
  /** 明确的否证（`refuted` 时非空）。 */
  refuted?: string
  /** 判据类型（没给 `ready` 时为 `container`）。 */
  dimension: ReadyCheck['kind'] | 'container'
  /** 已等 / 已耗时（调用方给，这里只做呈现）。 */
  elapsedMs?: number
  /** 已知噪声说明（从清单里带过来）。 */
  note?: string
}

/** 一份清单的整体判定。 */
export interface ReadyEvaluation {
  services: ServiceResult[]
  /**
   * 整体是否就绪：**每个服务都 `ready`**。
   *
   * 注意 `refuted` 与 `unready` 都让整体不就绪，但它们的**处置不同**——
   * 调用方应当用 `anyRefuted` 决定「还要不要等」。
   */
  ready: boolean
  /** 至少一个服务被明确否证：**别等了**。 */
  anyRefuted: boolean
  /** 人类可读的一句话（给 agent 看）。 */
  summary: string
}

/**
 * 把 RFC3339 时间串解析成毫秒。
 *
 * **必须是带时区的完整时刻**：`2026-10-01T12:00:00` 这种没有时区的时间串是**歧义**的，
 * 而就绪判据恰恰在做时间先后比较——按本地时区猜会让判定随机器而变。所以拒掉它。
 *
 * 小数秒**截到毫秒**再交给 `Date.parse`：docker 给的是纳秒（9 位），而 `Date.parse` 对超过
 * 3 位小数的处理**各引擎不一致**（有的按毫秒解析、有的丢弃），实测会把 `.123456789` 读成
 * 123 毫秒的偏差。这类偏差在「日志行早于还是晚于 StartedAt」的比较里正好是致命的。
 */
export function parseInstant(value: string | undefined): number | undefined {
  if (typeof value !== 'string' || value.trim() === '') return undefined
  const text = value.trim()
  // 末尾必须是 Z 或 ±HH:MM / ±HHMM。
  const zone = /(Z|[+-]\d{2}:?\d{2})$/.exec(text)
  if (zone === null) return undefined

  const withoutZone = text.slice(0, text.length - (zone[1] as string).length)
  // 保留小数点：只把小数位截到 3 位。写成 `'$1'` 会把点也吃掉（实测拼出 `…:05123Z` → NaN）。
  const normalized = withoutZone.replace(/\.(\d{3})\d+$/, '.$1')
  const ms = Date.parse(`${normalized}${zone[1] as string}`)
  return Number.isFinite(ms) ? ms : undefined
}

/** 判定一个服务。 */
export function evaluateService(requirement: ServiceRequirement, observation: ServiceObservation | undefined): ServiceResult {
  const dimension: ServiceResult['dimension'] = requirement.ready?.kind ?? 'container'
  const base: Pick<ServiceResult, 'name' | 'dimension' | 'note'> = {
    name: requirement.name,
    dimension,
    ...(requirement.note === undefined ? {} : { note: requirement.note }),
  }

  if (observation === undefined || !observation.found) {
    return { ...base, verdict: 'unready', message: '还没观测到这个容器', met: [], missing: ['容器存在'] }
  }

  const met: string[] = []
  const missing: string[] = []

  // ① 容器层：不在跑就明确否证（`restarting` 也算——等下去只会看到又一次重启）。
  if (observation.status !== 'running') {
    const exit = observation.exitCode === undefined ? '' : `（exit=${String(observation.exitCode)}${observation.exitCode === 143 ? ' = SIGTERM' : ''}）`
    return {
      ...base,
      verdict: 'refuted',
      message: `容器状态是 ${observation.status ?? '未知'}${exit}，不是在跑`,
      met,
      missing: [],
      refuted: `容器不在运行（${observation.status ?? '未知'}）`,
    }
  }
  met.push('容器在跑')

  const restarts = observation.restartCount ?? 0
  if (restarts > 0) {
    // 不否证（它现在确实在跑），但必须留在证据里：重启过的容器「就绪」的可信度低于没重启过的。
    met.push(`注意：已重启 ${String(restarts)} 次`)
  }

  // ② 健康检查：`unhealthy` 是明确否证。
  if (observation.health === 'unhealthy') {
    return {
      ...base,
      verdict: 'refuted',
      message: '容器的健康检查是 unhealthy',
      met,
      missing: [],
      refuted: '健康检查 unhealthy',
    }
  }

  // ③ 清单没给就绪判据 → 容器层过了就算就绪。
  if (requirement.ready === undefined) {
    return { ...base, verdict: 'ready', message: '容器在跑（清单未要求更多）', met, missing: [] }
  }

  // ④ `StartedAt`：就绪判据的时间基准。取不到就只是缺证，不是否证。
  const startedAt = parseInstant(observation.startedAt)
  if (startedAt === undefined) {
    missing.push(`容器的 StartedAt（拿到 ${JSON.stringify(observation.startedAt)}，需要带时区的 RFC3339 时刻）`)
    return { ...base, verdict: 'unready', message: `证据不足：${missing.join('；')}`, met, missing }
  }
  met.push('StartedAt 可解析')

  const outcome = evaluateReadyCheck(requirement.ready, observation, startedAt, met, missing)
  if (outcome !== undefined) return { ...base, verdict: outcome.kind, message: outcome.message, met, missing }

  return { ...base, verdict: 'ready', message: '容器在跑，且启动完成证据晚于本次启动', met, missing: [] }
}

/**
 * 查就绪维度。
 *
 * 返回 `undefined` = 通过（继续往下判）；否则返回结论。
 */
function evaluateReadyCheck(
  ready: ReadyCheck,
  observation: ServiceObservation,
  startedAt: number,
  met: string[],
  missing: string[],
): { kind: 'unready' | 'refuted'; message: string } | undefined {
  switch (ready.kind) {
    case 'healthcheck': {
      if (observation.health === 'healthy') {
        met.push('健康检查 healthy')
        return undefined
      }
      // `starting` 与「没有健康检查」都只是还没到；`unhealthy` 已在上面被否证。
      const detail = observation.health === undefined ? '容器没有配健康检查' : `健康检查是 ${observation.health}`
      missing.push(`健康检查 healthy（现在：${detail}）`)
      return { kind: 'unready', message: `等健康检查转 healthy（现在：${detail}）` }
    }

    case 'httpProbe': {
      // 判定层**不发**请求——执行层探完把结果带回来（`observation.probe`）。
      // 这样这一层保持纯函数，而「探什么」仍然由清单唯一决定。
      const probe = observation.probe
      if (probe === undefined) {
        missing.push(`HTTP 探针 ${ready.path} :${String(ready.port)} 的结果（判定层不发请求，需要执行层探一次）`)
        return { kind: 'unready', message: `还没有 ${ready.path} :${String(ready.port)} 的探测结果` }
      }
      if (probe.ok) {
        met.push(`HTTP ${String(probe.status ?? 0)} ${ready.path}`)
        return undefined
      }
      // 连接被拒 = 端口还没起来（`unready`，继续等）；**5xx = 服务自己坏了**（`refuted`，别等）。
      // 这两者的处置完全不同，混成一档会让「服务启动就报错」一直等到超时。
      if (probe.status !== undefined && probe.status >= 500) {
        return { kind: 'refuted', message: `探针返回 ${String(probe.status)}：服务起来了但自己报错` }
      }
      missing.push(`探针成功（${probe.detail ?? '未通过'}）`)
      return { kind: 'unready', message: `探针还没通过：${probe.detail ?? '未通过'}` }
    }

    case 'logPattern': {
      const lines = observation.logLines ?? []
      if (lines.length === 0) {
        missing.push('近期日志（没取到任何行）')
        return { kind: 'unready', message: '还没拿到日志，无法判断启动完成行' }
      }
      const pattern = new RegExp(ready.pattern)
      const hit = lines.find((line) => pattern.test(line))
      if (hit === undefined) {
        missing.push(`匹配 /${ready.pattern}/ 的启动完成行`)
        return { kind: 'unready', message: `日志里还没出现匹配 /${ready.pattern}/ 的启动完成行` }
      }
      met.push(`命中启动完成行：${truncate(hit)}`)

      const at = lineInstant(hit)
      if (at === undefined) {
        // 日志行没有带可解析的时刻 → **无法证明它来自本次启动**，只能算缺证。
        missing.push('启动完成行的时间戳（用于确认它晚于本次 StartedAt）——只看到这一行不足以判就绪')
        return {
          kind: 'unready',
          message: '看到启动完成行，但拿不到它的时间戳：无法确认它来自本次启动（重启后缓冲区里会有上一次的）',
        }
      }
      if (at < startedAt) {
        // 这就是「容器刚重启、日志还留着上一次启动完成行」的那一刻。
        missing.push(`本次启动之后的启动完成行（看到的那行在 ${formatDuration(startedAt - at)} **之前**）`)
        return {
          kind: 'unready',
          message: `看到启动完成行，但它早于本次 StartedAt ${formatDuration(startedAt - at)}：那是上一次启动留下的`,
        }
      }
      met.push('启动完成行晚于本次 StartedAt')
      return undefined
    }
  }
}

/**
 * 从日志行取时刻。
 *
 * 支持两种常见形态：
 *   - `docker logs --timestamps` 的前缀：`2026-10-01T12:00:05.123456789Z 正文`；
 *   - 行内出现的、带时区的时刻：`… 2026-10-01 12:00:05.123 INFO … +08:00`。
 *
 * 取不到返回 `undefined`——**不猜**。猜错的方向是「把上一次启动的行当成这一次的」。
 */
export function lineInstant(line: string): number | undefined {
  // `docker logs --timestamps` 的前缀形态（纳秒精度）。
  const head = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2}))/.exec(line)
  if (head !== null) return parseInstant(head[1] as string)

  // 行内形态：`2026-10-01 12:00:05.123 INFO …`（空格分隔日期与时间）。
  const spaced = /(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2}(?:\.\d+)?)/.exec(line)
  if (spaced === null) return undefined

  // 时区**可能不在时间后面紧挨着**（实测形态：`… 12:00:05.123 INFO x +08:00`，中间隔着别的内容），
  // 所以单独在整行里找偏移量。注意要限定**独立出现**（前后是空白或行首行尾），
  // 否则 `ISO` 里那个 `Z` 之类会被误当偏移量。找不到就拒掉（见 `parseInstant`），**不当 UTC 猜**。
  const zone = /(?:^|\s)(Z|[+-]\d{2}:?\d{2})(?=\s|$)/.exec(line)
  if (zone === null) return undefined
  return parseInstant(`${spaced[1] as string}T${spaced[2] as string}${zone[1] as string}`)
}

/** 报告里截断长行（日志行可以很长）。 */
function truncate(line: string, max = 120): string {
  return line.length <= max ? line : `${line.slice(0, max)}…`
}

/** 评估一整份清单。 */
export function evaluateProfile(input: {
  profile: ReadyProfile
  observations: readonly ServiceObservation[]
  /** 每个服务已等多久（调用方计时；缺省不显示）。 */
  elapsedMs?: Readonly<Record<string, number>>
}): ReadyEvaluation {
  const byName = new Map(input.observations.map((observation) => [observation.name, observation]))
  const services = input.profile.services.map((requirement) => {
    const result = evaluateService(requirement, byName.get(requirement.name))
    const elapsed = input.elapsedMs?.[requirement.name]
    return elapsed === undefined ? result : { ...result, elapsedMs: elapsed }
  })

  const anyRefuted = services.some((service) => service.verdict === 'refuted')
  const ready = services.every((service) => service.verdict === 'ready')

  return {
    services,
    ready,
    anyRefuted,
    summary: summarize(services, ready, anyRefuted),
  }
}

/** 汇总成一句话——agent 是先看这句话决定下一步的。 */
function summarize(services: readonly ServiceResult[], ready: boolean, anyRefuted: boolean): string {
  if (services.length === 0) return '清单里没有服务'
  if (ready) return `全部 ${String(services.length)} 个服务就绪`

  const refuted = services.filter((service) => service.verdict === 'refuted')
  const unready = services.filter((service) => service.verdict === 'unready')

  if (anyRefuted) {
    const detail = refuted.map((service) => `${service.name}（${service.refuted ?? service.message}）`).join('、')
    return `有服务被明确否证，别再等了：${detail}${unready.length > 0 ? `；另有 ${String(unready.length)} 个还在等` : ''}`
  }

  const detail = unready
    .map((service) => `${service.name}（${service.missing.join('，') || service.message}）`)
    .join('、')
  return `还差 ${String(unready.length)} 个服务：${detail}`
}
