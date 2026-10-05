/**
 * 配置面：把宿主交下来的一份普通对象**解析成纯数据**（`docs/devdata-plan.md` §5 的数据模型）。
 *
 * ## 为什么解析不交给 schemastery 就完了
 *
 * `Config`（schemastery schema）负责「形状对不对」；本模块负责**「语义上算不算数」**，而后者
 * 恰好是本套件的安全前提：
 *
 * - **认不出的引擎** → 整个目标丢掉（不是「当成某个默认引擎」）——未登记的一律拒；
 * - **认不出的环境标签** → 回落 `unknown`（= 不可写），并**报一条 problem**：静默回落会让用户
 *   以为自己标的是 `test-shared`（可写）；
 * - **空的 `scopeDirs` 保持为空**（= 处处拒绝），**不替用户填默认目录**——那等于替他授权；
 * - **能力规格的 `env` 为空串** → 当作**没接入闸门**（而不是「接了但永远授不了权」）；
 * - 越界的上限**夹回**而不是「按无上限处理」（`sync` 与 `ceilings` 同一个方向：坏了要更严）。
 *
 * 这些判断全部是纯函数：不读文件、不连网络、不看 `process.env`。`problems` 原样交给宿主半体去打
 * 日志与公告——**配置问题不该只在启动日志里一闪而过**，agent 撞墙时 `doctor` 也要能看到。
 */

import { expandHome } from '@hyzyn/dsh-kit'

import type { DevDataTarget } from './adjudicate.js'
import { DEV_ENVS, normalizeEnv, type DevEnv } from './env.js'
import { MAX_DB_INDEX, defaultDb, normalizeDbs } from './keyspace.js'
import { ENGINES, type Engine } from './operations.js'
import type { PlanThresholds } from './plan-guard.js'

/** SCAN 族 `COUNT` 的策略上限（候选只能请求更小）。 */
export const MAX_SCAN_COUNT = 1000
/** 不给时的策略默认值。 */
export const DEFAULT_SCAN_COUNT = 200
/** 单次连接 + 命令的默认超时（毫秒）。 */
export const DEFAULT_TIMEOUT_MS = 5000
/** 超时可配范围。 */
export const MIN_TIMEOUT_MS = 100
export const MAX_TIMEOUT_MS = 60_000

/** 通路 A 直连用的连接信息（**内核不认识连接**，所以它挂在这一层，见 `redis-executor.ts`）。 */
export interface LiveConnection {
  host: string
  port: number
  /** `SELECT` 到哪个库。 */
  db?: number
}

/** 一个解析后的目标。 */
export interface LiveTarget extends DevDataTarget {
  /*
   * 这两个在 `DevDataTarget` 里是可选的（内核允许「没标注」），解析之后**一定有值**
   * （环境回落 unknown、作用域至少是空数组）。在类型上收紧，省掉宿主半体里一片 `?? []`。
   */
  env: DevEnv
  scopeDirs: string[]
  /** 有连接信息才有（缺了执行器会给出「没有配连接」的可执行错误）。 */
  connection?: LiveConnection
  /**
   * 这个目标**允许浏览**的库号（面板上那棵树上能点着切的那些）。
   *
   * 缺省（没写）时允许集只有 `connection.db`（没写就是 0）——也就是「这台机器上只有声明的那一个库
   * 能看」，与加这个字段之前的行为**逐字一致**。写了 `dbs` 之后，允许集是它 ∪ `db`——**仍然全部来自
   * 配置**：面板只是在这个集合里挑，浏览器永远不会自己拼一条 `SELECT`（见 `keyspace.ts`
   * 的 `canBrowseDb`，INFO keyspace 当场报的库也算允许——那也是宿主侧的事实）。
   */
  dbs?: number[]
  /** `SCAN` 族 `COUNT` 的策略上限。 */
  maxScanCount: number
}

/** 解析后的整份配置。 */export interface LiveConfig {
  enabled: boolean
  announceToAgent: boolean
  /** 审计落点（**空 = 只有宿主日志，没有持久记录**；写类操作因此被拒，见 `plugin.ts`）。 */
  auditFile: string
  plan: PlanThresholds
  timeoutMs: number
  targets: LiveTarget[]
  /** 被丢掉 / 被纠正的配置项，原样保留给宿主打日志与 `doctor`。**空数组 = 没有问题**。 */
  problems: string[]
}

const ENGINE_SET = new Set<string>(ENGINES)
const ENV_SET = new Set<string>(DEV_ENVS)

/**
 * 这个目标**声明允许浏览**的库号集合（升序、去重）。
 *
 * 它是面板与路由那两处「能不能去这个库」的唯一判据来源：`db`（缺省 0）**永远**在里面——
 * 所以「没写 `dbs`」与「写了 `dbs: [0]`」在行为上完全一样，加这个字段不会让已配好的目标换行为。
 */
export function declaredDbs(target: LiveTarget): number[] {
  const all = [defaultDb(target.connection?.db), ...(target.dbs ?? [])]
  return [...new Set(all)].sort((left, right) => left - right)
}

/**
 * 一个原始目标条目（宽松读，字段类型不保证）。
 *
 * 注意入参是**经 schema 解析后**的配置（`kit` 的 `DshPlugin.apply` 文档写明了这一点）。
 * 所以「字段不存在」与「字段是空对象」是两件不同的事——前者是没写，后者是写了个空的。
 * 2026-10-02 的假问题就出在 schema 把前者伪造成了后者（见 `plugin.ts` 的 `OPTIONAL_CAPABILITY`）。
 */
type RawTarget = Record<string, unknown>

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  return value.filter((entry): entry is string => typeof entry === 'string')
}

/**
 * 解析一个能力规格。
 *
 * **`env` 为空串 = 没接入闸门**（返回 `undefined`），并且记一条 problem：一份「接了但永远授不了
 * 权」的闸门比没接更坏——`visibleTools` 会因此把入口露出去，而 `capabilityGranted('')` 永远为假。
 */
function parseCapability(
  value: unknown,
  where: string,
  problems: string[],
): { env: string; label: string } | undefined {
  const raw = asRecord(value)
  if (raw === undefined) {
    /*
     * 这条分支**在真宿主上到不了**：`:writeCapability` 是 schema 里的 object 字段，给了非对象
     * 会在 prepare 期被拒（实测报错带精确路径 `$.targets[0].dangerousReadCapability expected
     * object but got true`，插件整体不挂载 = fail closed）。留着它是给**不经 schema 的调用方**
     * （直接调 `normalizeConfig` 的脚本 / 用例）一个确定的行为——不能因为「到不了」就让它随机。
     */
    if (value !== undefined && value !== null) problems.push(`${where}：能力规格不是一个对象，按「未接入闸门」处理`)
    return undefined
  }
  const env = (asString(raw.env) ?? '').trim()
  if (env === '') {
    problems.push(
      `${where}：给了能力规格却没有 env（环境变量名），按「未接入闸门」处理。` +
        `两条出路选一条：**补上 env**（接入一个待授权的闸门），或**把这个字段整段删掉**（不接入）` +
        `——前者将来 export 那个变量才能授权，后者永远不授权。`,
    )
    return undefined
  }
  const label = (asString(raw.label) ?? '').trim()
  return { env, label: label === '' ? env : label }
}

/** 解析一个目标；返回 `undefined` = 整条丢掉（并把理由写进 problems）。 */
function parseTarget(value: unknown, index: number, seenIds: Set<string>, problems: string[]): LiveTarget | undefined {
  const where = `targets[${String(index)}]`
  const raw: RawTarget | undefined = asRecord(value)
  if (raw === undefined) {
    problems.push(`${where}：不是一个对象，已忽略`)
    return undefined
  }

  const id = (asString(raw.id) ?? '').trim()
  if (id === '') {
    problems.push(`${where}：缺少 id，已忽略（工具参数与作用域判据都用它）`)
    return undefined
  }
  if (seenIds.has(id)) {
    problems.push(`${where}：id ${JSON.stringify(id)} 与前面某个目标重复，已忽略（id 必须唯一，否则 target 参数会指向不可预期的那个）`)
    return undefined
  }

  const engineRaw = (asString(raw.engine) ?? '').trim().toLowerCase()
  if (!ENGINE_SET.has(engineRaw)) {
    problems.push(
      `${where}（${id}）：engine ${JSON.stringify(raw.engine ?? '')} 不是受支持的引擎（${ENGINES.join(' / ')}），**整个目标已忽略**——认不出的引擎一律不当成某个默认值`,
    )
    return undefined
  }
  const engine = engineRaw as Engine

  const envRaw = asString(raw.env)
  const env: DevEnv = normalizeEnv(envRaw)
  if (envRaw !== undefined && envRaw.trim() !== '' && !ENV_SET.has(envRaw.trim().toLowerCase())) {
    problems.push(
      `${where}（${id}）：环境标签 ${JSON.stringify(envRaw)} 认不出，已按 unknown 处理（**不可写**）。可用的值：${DEV_ENVS.join(' / ')}`,
    )
  }

  const scopeDirs = (asStringArray(raw.scopeDirs) ?? []).map((dir) => expandHome(dir.trim())).filter((dir) => dir !== '')

  const writeCapability = parseCapability(raw.writeCapability, `${where}（${id}）.writeCapability`, problems)
  const dangerousReadCapability = parseCapability(
    raw.dangerousReadCapability,
    `${where}（${id}）.dangerousReadCapability`,
    problems,
  )

  const credentialRef = (asString(raw.credentialRef) ?? '').trim()

  // 连接：两个字段都齐才认（少一个不是「用默认端口」，是配置没写完）。
  const host = (asString(raw.host) ?? '').trim()
  const portRaw = raw.port
  const port = typeof portRaw === 'number' && Number.isInteger(portRaw) ? portRaw : Number.NaN
  let connection: LiveConnection | undefined
  if (host !== '' && Number.isInteger(port) && port >= 1 && port <= 65535) {
    const dbRaw = raw.db
    const db = typeof dbRaw === 'number' && Number.isInteger(dbRaw) && dbRaw >= 0 ? dbRaw : undefined
    connection = db === undefined ? { host, port } : { host, port, db }
  } else if (host !== '' || Number.isFinite(port) || raw.port !== undefined) {
    problems.push(
      `${where}（${id}）：连接信息不完整（host=${JSON.stringify(host)}，port=${JSON.stringify(portRaw ?? '')}），已按「没有连接」处理——工具调用会明确报这一点，不会拿默认端口去试`,
    )
  }

  /*
   * 允许浏览的库（`dbs`）：**只有有连接时才有意义**，坏值逐条报出来（不静默丢）。空 `dbs` 与
   * 「没写」等价（两边都是「只允许声明的那一个库」），所以这里只把非空的那份放进目标。
   */
  const parsedDbs = normalizeDbs(raw.dbs)
  let dbs: number[] | undefined
  if (connection === undefined) {
    if (parsedDbs.dbs.length > 0 || raw.dbs !== undefined) {
      problems.push(`${where}（${id}）：dbs 只在有连接（host/port）时有意义，已忽略——库号是发 SELECT 用的`)
    }
  } else {
    if (raw.dbs !== undefined && !Array.isArray(raw.dbs)) {
      problems.push(`${where}（${id}）：dbs 必须是库号数组（如 \`[0, 1]\`），已按「没声明」处理（那只允许 connection.db 那个库）`)
    } else if (parsedDbs.bad.length > 0) {
      problems.push(
        `${where}（${id}）：dbs 里有不是库号的值 ${JSON.stringify(parsedDbs.bad)}，已丢掉它们（库号是 0..${String(MAX_DB_INDEX)} 的整数）`,
      )
    }
    if (parsedDbs.dbs.length > 0) dbs = parsedDbs.dbs
  }

  const scanRaw = raw.maxScanCount
  let maxScanCount = DEFAULT_SCAN_COUNT
  if (scanRaw !== undefined) {
    if (typeof scanRaw === 'number' && Number.isInteger(scanRaw) && scanRaw >= 1 && scanRaw <= MAX_SCAN_COUNT) {
      maxScanCount = scanRaw
    } else {
      problems.push(
        `${where}（${id}）：maxScanCount ${JSON.stringify(scanRaw)} 不合法，已夹回默认值 ${String(DEFAULT_SCAN_COUNT)}（范围 1..${String(MAX_SCAN_COUNT)}）。**坏了要更严，不是更松**`,
      )
    }
  }

  const label = (asString(raw.label) ?? '').trim()
  const target: LiveTarget = {
    id,
    label: label === '' ? id : label,
    engine,
    env,
    scopeDirs,
    maxScanCount,
    ...(connection === undefined ? {} : { connection }),
    ...(dbs === undefined ? {} : { dbs }),
    ...(credentialRef === '' ? {} : { credentialRef }),
    ...(writeCapability === undefined ? {} : { writeCapability }),
    ...(dangerousReadCapability === undefined ? {} : { dangerousReadCapability }),
  }
  seenIds.add(id)
  return target
}

/** 解析计划护栏阈值（**不填 = 不做这一层检查**，填 0 = 一行都不许，口径见 `plan-guard.ts`）。 */
function parsePlan(value: unknown, problems: string[]): PlanThresholds {
  const raw = asRecord(value)
  if (raw === undefined) return {}
  const plan: PlanThresholds = {}
  for (const key of ['maxRows', 'maxCost'] as const) {
    const entry = raw[key]
    if (entry === undefined) continue
    if (typeof entry === 'number' && Number.isFinite(entry) && entry >= 0) {
      plan[key] = entry
      continue
    }
    problems.push(`plan.${key}：${JSON.stringify(entry)} 不是非负数字，已忽略这一层检查`)
  }
  return plan
}

/** 解析布尔开关（只认真正的 `false` / 缺省）。 */
function parseFlag(value: unknown, fallback: boolean, where: string, problems: string[]): boolean {
  if (value === undefined) return fallback
  if (typeof value === 'boolean') return value
  problems.push(`${where}：${JSON.stringify(value)} 不是布尔值，已按默认值 ${String(fallback)} 处理`)
  return fallback
}

/**
 * 把一份普通对象解析成生效配置。
 *
 * 入参刻意收 `Record<string, unknown>` 而不是 `Config`：**setting 存储交下来的投影未必经过 schema
 * 默认值**（`devfront` 记过同类教训），所以这一层必须自己对每种坏输入有确定行为。
 */
export function normalizeConfig(raw: Record<string, unknown>): LiveConfig {
  const problems: string[] = []

  const targets: LiveTarget[] = []
  const seenIds = new Set<string>()
  const rawTargets = raw.targets
  if (rawTargets === undefined) {
    // 没有目标不是错误：插件照常挂载，只是工具一个都不注册（agent 看不到任何入口）。
  } else if (!Array.isArray(rawTargets)) {
    problems.push(`targets：不是数组，已按「没有目标」处理`)
  } else {
    rawTargets.forEach((entry, index) => {
      const parsed = parseTarget(entry, index, seenIds, problems)
      if (parsed !== undefined) targets.push(parsed)
    })
  }

  const timeoutRaw = raw.timeoutMs
  let timeoutMs = DEFAULT_TIMEOUT_MS
  if (timeoutRaw !== undefined) {
    if (
      typeof timeoutRaw === 'number' &&
      Number.isInteger(timeoutRaw) &&
      timeoutRaw >= MIN_TIMEOUT_MS &&
      timeoutRaw <= MAX_TIMEOUT_MS
    ) {
      timeoutMs = timeoutRaw
    } else {
      problems.push(
        `timeoutMs：${JSON.stringify(timeoutRaw)} 不合法，已夹回 ${String(DEFAULT_TIMEOUT_MS)}（范围 ${String(MIN_TIMEOUT_MS)}..${String(MAX_TIMEOUT_MS)}）`,
      )
    }
  }

  return {
    enabled: parseFlag(raw.enabled, true, 'enabled', problems),
    announceToAgent: parseFlag(raw.announceToAgent, true, 'announceToAgent', problems),
    auditFile: (asString(raw.auditFile) ?? '').trim(),
    plan: parsePlan(raw.plan, problems),
    timeoutMs,
    targets,
    problems,
  }
}

/** 按 id 找目标（找不到时报出可用名单——agent 的失败模式是原地重试，得给它出路）。 */
export function pickTarget(targets: readonly LiveTarget[], id: unknown): LiveTarget | undefined {
  const wanted = typeof id === 'string' ? id.trim() : ''
  if (wanted === '') return undefined
  return targets.find((target) => target.id === wanted)
}

/** 可用目标名单（拒绝文案里用）。 */
export function targetIds(targets: readonly LiveTarget[]): string {
  return targets.length === 0 ? '（一个都没有：插件配置里还没有 targets）' : targets.map((target) => target.id).join(' / ')
}
