/**
 * 配置面：把宿主交下来的一份普通对象**解析成纯数据**（`docs/devdata-plan.md` §13）。
 *
 * ## 为什么解析不交给 schemastery 就完了
 *
 * `Config`（schemastery schema）负责「形状对不对」；本模块负责**「语义上算不算数」**——
 * 与 `devdata` 的 `plugin-config.ts` 同一套分工，理由也一样：形状对了但语义不成立时，
 * 症状是运行期一句看不懂的话，而这里能给出**指到字段**的问题清单。
 *
 * - **认不出的 `kind`** → 整个目标丢掉（不是「当成 ssh」）；
 * - **`ssh` 却没给 `book`** → 丢掉并报问题（它连不上，留着只会在下游报一个指不到配置的错）；
 * - **空的 `scopeDirs` 保持为空**（= 处处拒绝），**不替用户填默认目录**——那等于替他授权；
 * - **越界的数值夹回**而不是「按无上限处理」（时间上限坏了要更严，不是更松）；
 * - **`hostKeys` 只收得下的形状**（清洗在 `kit` 的 `sanitizeHostKeys`，与连接簿读取同源）。
 *
 * 全部是纯函数：不读文件、不连网络、不看 `process.env`。
 */

import { expandHome, sanitizeHostKeys } from '@hyzyn/dsh-kit'
import type { CapabilitySpec } from '@hyzyn/dsh-kit'
import type { HostKeyRecord } from '@hyzyn/dsh-kit/ssh-exec'

/** 目标的两种来源。 */
export type TargetKind = 'local' | 'ssh'

/** 单次 docker 命令的默认超时（毫秒）。 */
export const DEFAULT_EXEC_TIMEOUT_MS = 10_000
/** 超时可配范围（探针与等待之外，这是「跑一条 docker 命令」的上限）。 */
export const MIN_EXEC_TIMEOUT_MS = 500
export const MAX_EXEC_TIMEOUT_MS = 120_000

/** 缺省等待总超时（毫秒）——与 §13.2 的冷启动 150 秒对齐，留一点余量。 */
export const DEFAULT_WAIT_TIMEOUT_MS = 180_000
/** 等待超时可配范围。 */
export const MIN_WAIT_TIMEOUT_MS = 1_000
export const MAX_WAIT_TIMEOUT_MS = 900_000

/** 缺省轮询间隔（毫秒）。 */
export const DEFAULT_POLL_INTERVAL_MS = 3_000
/** 轮询间隔可配范围（下限刻意不低：每轮是一串 SSH 往返）。 */
export const MIN_POLL_INTERVAL_MS = 500
export const MAX_POLL_INTERVAL_MS = 60_000

/** 日志尾部行数上限（判定只需要「启动完成行」，不该把整个日志拉回来）。 */
export const MAX_LOG_TAIL = 5_000

/** `docker stop --time` 的缺省与范围（给容器收尾的时间，不是「多久后强杀」）。 */
export const DEFAULT_STOP_TIMEOUT_SEC = 10
export const MIN_STOP_TIMEOUT_SEC = 1
export const MAX_STOP_TIMEOUT_SEC = 120

/** 一个解析后的目标。 */
export interface LiveTarget {
  id: string
  label: string
  kind: TargetKind
  /** `ssh` 目标引用的 tty 连接簿条目名；`local` 时为空串。 */
  book: string
  /**
   * 作用域：这个目标只能**从这些目录**访问，缺省拒绝（与数据面同一条判据，实现在 kit 的 `scope.ts`）。
   *
   * 空数组不是「不限制」，是**处处拒绝**——它同时解决「并行 agent 的隔离」与「误连共享联调环境」
   * 两件事，理由与代价见 `packages/kit/src/scope.ts` 的文件头注。
   */
  scopeDirs: string[]
  /**
   * **写入口的能力闸门**（`env_up` / `env_down`）。没配 = 这台目标上不存在写入口（工具都不注册）。
   *
   * 配了也不等于能用：真正的授权是**宿主启动时的环境变量**（`kit` 的 `capabilityGranted`）。
   * 两道分开是刻意的——配置能热改，而「谁能改共享环境」这件事不该靠改一个 yaml 就成立。
   */
  writeCapability?: CapabilitySpec
}

/** 解析后的整份配置。 */
export interface LiveConfig {
  enabled: boolean
  announceToAgent: boolean
  targets: LiveTarget[]
  /** 单条 docker 命令的超时。 */
  execTimeoutMs: number
  /** 日志尾部行数。 */
  logTail: number
  /** HTTP 探针超时。 */
  probeTimeoutMs: number
  /** `env_wait` 的缺省总超时。 */
  waitTimeoutMs: number
  /** 轮询间隔。 */
  pollIntervalMs: number
  /** `docker stop --time` 的秒数（给容器体面收尾的时间；SIGKILL 不是默认）。 */
  stopTimeoutSec: number
  /** TOFU 指纹记录（消费者自持一份，种子来自 tty 的连接簿）。 */
  hostKeys: HostKeyRecord[]
  /** 配置问题（指到字段，原样交给宿主半体打日志与公告）。 */
  problems: string[]
}

/** 取一个字符串字段。 */
function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/** 取一个字符串数组（`~` 展开、去空、保序去重）。 */
function asDirList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  for (const item of value) {
    if (typeof item !== 'string') continue
    const dir = expandHome(item.trim())
    if (dir === '' || out.includes(dir)) continue
    out.push(dir)
  }
  return out
}

/**
 * 解析一份能力规格（`{ env, label }`）。
 *
 * **`env` 为空即当作「没接入闸门」**（返回 `undefined`）——与 `devdata` 同一条纪律：一个
 * 「接了但永远授不了权」的闸门比没有闸门更糟，它会让用户以为写入口是开着的。
 * `label` 缺省用 `env` 的名字（文案里要有个能认的东西）。
 */
function asCapability(value: unknown): CapabilitySpec | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const raw = value as Record<string, unknown>
  const env = asString(raw.env)
  if (env === '') return undefined
  const label = asString(raw.label)
  return { env, label: label === '' ? env : label }
}

/** 把一个数值夹进范围；不是有限数就用缺省。 */
function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(Math.max(Math.trunc(value), min), max)
}

/**
 * 解析整份配置。
 *
 * @param raw - 经 schema 解析后的纯数据（settings 层交回来的就是它）。
 */
export function normalizeConfig(raw: Record<string, unknown>): LiveConfig {
  const problems: string[] = []
  const enabled = raw.enabled !== false
  const announceToAgent = raw.announceToAgent !== false

  const rawTargets = Array.isArray(raw.targets) ? raw.targets : []
  const targets: LiveTarget[] = []
  const seen = new Set<string>()

  rawTargets.forEach((item, index) => {
    const at = `targets[${String(index)}]`
    if (typeof item !== 'object' || item === null) {
      problems.push(`${at}：每一项都必须是映射`)
      return
    }
    const source = item as Record<string, unknown>
    const id = asString(source.id)
    const label = asString(source.label)
    if (id === '') {
      problems.push(`${at}.id：目标必须有 id（工具就是按它选的）`)
      return
    }
    if (seen.has(id)) {
      problems.push(`${at}.id：${JSON.stringify(id)} 重复——按 id 选择目标，重名意味着选中的是哪一个说不清`)
      return
    }
    const kind = asString(source.kind)
    if (kind !== 'local' && kind !== 'ssh') {
      problems.push(`${at}.kind：必须是 local 或 ssh，拿到 ${JSON.stringify(source.kind)}——认不出的目标不登记（不是「当成 ssh」）`)
      return
    }
    const book = asString(source.book)
    if (kind === 'ssh' && book === '') {
      problems.push(`${at}.book：ssh 目标必须给 tty 连接簿的条目名（本插件不自建连接簿界面：一处配置、两处生效）`)
      return
    }
    const writeCapability = asCapability(source.writeCapability)
    if (source.writeCapability !== undefined && writeCapability === undefined) {
      // 「配了但 env 是空的」= 没接入闸门。**报出来**：静默丢掉会让用户以为自己配好了写入口。
      problems.push(`${at}.writeCapability：env 是空的——那是宿主侧授权用的环境变量名，空值等于「接了但永远授不了权」（写入口不会注册）`)
    }
    const scopeDirs = asDirList(source.scopeDirs)
    if (scopeDirs.length === 0) {
      // 不拦登记（用户可能先写目标再补目录），但必须报——否则症状是「工具一个都用不了」而没人知道为什么。
      problems.push(`${at}.scopeDirs：为空 = **处处拒绝**（作用域按目录收敛，不填就等于不授权）`)
    }
    seen.add(id)
    targets.push({
      id,
      label: label === '' ? id : label,
      kind,
      book,
      scopeDirs,
      ...(writeCapability === undefined ? {} : { writeCapability }),
    })
  })

  /*
   * `hostKeys` 的三种形态要分开，**「没写」不是问题**：
   *   - 没这一项 → 全新安装（种子来自 tty 连接簿），静默；
   *   - 是数组但一条都收不下 → **报问题**（用户写了东西却全被丢掉，静默忽略才是最糟的）；
   *   - 不是数组 → 报问题。
   *
   * 2026-10-02 修：原先只要 `sanitizeHostKeys` 返回 `undefined` 就报「不是数组」——于是**没写**
   * 也会报一条假问题。真宿主上看不到它（schema 的 `.default([])` 会补上空数组），但这是
   * `devdata` 那一轮踩过的同一类错（「schema 把『没写』伪造成『写错了』」）。
   */
  const providedHostKeys = raw.hostKeys
  const cleanHostKeys = sanitizeHostKeys(providedHostKeys)
  if (providedHostKeys !== undefined && cleanHostKeys === undefined) {
    problems.push('hostKeys：不是数组，已忽略（这一项由 TOFU 自己维护，改它等于放弃指纹校验）')
  } else if (Array.isArray(providedHostKeys) && providedHostKeys.length > 0 && (cleanHostKeys ?? []).length === 0) {
    problems.push('hostKeys：写了内容但一条都没收下（每条需要 host + 至少一条指纹）——它们被静默忽略了')
  }

  return {
    enabled,
    announceToAgent,
    targets,
    execTimeoutMs: clampInt(raw.execTimeoutMs, MIN_EXEC_TIMEOUT_MS, MAX_EXEC_TIMEOUT_MS, DEFAULT_EXEC_TIMEOUT_MS),
    logTail: clampInt(raw.logTail, 1, MAX_LOG_TAIL, 200),
    probeTimeoutMs: clampInt(raw.probeTimeoutMs, 100, 60_000, 3000),
    waitTimeoutMs: clampInt(raw.waitTimeoutMs, MIN_WAIT_TIMEOUT_MS, MAX_WAIT_TIMEOUT_MS, DEFAULT_WAIT_TIMEOUT_MS),
    pollIntervalMs: clampInt(raw.pollIntervalMs, MIN_POLL_INTERVAL_MS, MAX_POLL_INTERVAL_MS, DEFAULT_POLL_INTERVAL_MS),
    stopTimeoutSec: clampInt(raw.stopTimeoutSec, MIN_STOP_TIMEOUT_SEC, MAX_STOP_TIMEOUT_SEC, DEFAULT_STOP_TIMEOUT_SEC),
    hostKeys: cleanHostKeys ?? [],
    problems,
  }
}

/**
 * 至少有一个目标配了写能力闸门吗。
 *
 * 注册面用它：**没有任何目标可写时不注册写工具**（未注册的 agent 不会去试一个注定被拒的工具，
 * 这与「只读工具面」那条纪律同源）。
 */
export function hasWritableTarget(targets: readonly LiveTarget[]): boolean {
  return targets.some((target) => target.writeCapability !== undefined)
}

/** 目标名单（错误文案里用：agent 的失败模式是原地重试，得给它一条出路）。 */
export function targetIds(targets: readonly LiveTarget[]): string {
  return targets.length === 0 ? '（一个都没配）' : targets.map((target) => target.id).join(' / ')
}

/** 按 id 取目标。 */
export function pickTarget(targets: readonly LiveTarget[], id: string): LiveTarget | undefined {
  return targets.find((target) => target.id === id)
}
