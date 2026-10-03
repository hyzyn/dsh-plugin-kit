/**
 * `devdata` 的**宿主半体**：把内核接成 agent 能用的工具（`docs/devdata-plan.md` §6 / §9 的 P3–P4）。
 *
 * ## 四层分工
 *
 * | 层 | 文件 | 职责 |
 * |---|---|---|
 * | 判据 | `adjudicate.ts` / `operations.ts` / `plan-guard.ts` / `scope.ts` / `credential.ts` | 允不允许（**纯函数，不连任何东西**） |
 * | 入口 | `entries.ts` | 「这个引擎在这台机器上有没有执行器」→ 该注册哪些入口 |
 * | 引擎 | `redis-executor.ts`（通路 A，已真机验证） | 怎么真的去跑 |
 * | **宿主** | **本文件** | 读配置、注册工具、写审计、把拒绝转成 agent 能据以行动的话 |
 *
 * 前三层都能在没有宿主、没有真机的情况下被完整测试；本层很薄，只做搬运与接线。
 *
 * ## 五条刻意的纪律
 *
 * 1. **没启用 / 没配目标 / 这个引擎没有执行器 → 那个工具不注册**。未注册的工具 agent 根本看不到，
 *    于是它不会去试、也不会撞墙（§3.6.1 的实现要求）。**今天只有 Redis 有执行器**，所以 SQL /
 *    RocketMQ 的目标只给 `list_targets` / `capabilities` / `doctor`（理由见 `entries.ts`）。
 * 2. **作用域 fail-closed**：`scopeDirs` 为空 = 处处拒绝。宿主**不替用户填默认目录**——那等于替他授权。
 * 3. **写类操作要求持久审计**（`auditFile` 未配 → `AUDIT_NOT_DURABLE`）。§5 把审计写成这一档的
 *    前提，那就不能只在文档里成立。只读操作不受影响。
 * 4. **不可逆操作先拒、要逐次二次确认**（判据在内核 `preflight`，本层只把 `confirmed` 传下去）。
 * 5. **能力授权只认宿主侧通道**（`bindCapabilitySources` 在 `apply` 期绑定一次）——配置卡片
 *    （2026-10-03 建）**不提供就地提权**：两档能力在写入路径上只读（`CAPABILITY_FIELDS` 那条 400），
 *    文案也不提它（见 `adjudicate.ts` 的同名注释）。「HTTP 只能关、不能开」这条不变量因此在卡片
 *    这一层也成立。
 *
 * ## 拒绝怎么报给 agent
 *
 * 一律**抛错**，格式 `[CODE] 正文` + 另起一行恢复路径（与 `devfront` 同一口径）。不返回
 * `{ok:false}` 信封：DSH 的工具错误本身就是给模型看的一句话，抛错是最短路径，而且不会出现
 * 「调用方忘了看 ok 字段」这种沉默失败。
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import z from '@deepseek-ai/schemastery'
import {
  bindCapabilitySources,
  capabilityGrantVia,
  capabilityHowTo,
  definePlugin,
  hasSameOriginProof,
  isLoopbackRequestStrict,
  plainConfig,
  settingsEntryScope,
} from '@hyzyn/dsh-kit'
import type { CapabilitySpec, SettingsEntryScope } from '@hyzyn/dsh-kit'
import { readJsonBody, writeJson, type ReqLike, type ResLike } from '@hyzyn/dsh-kit'

import { credentialStatus, snapshotTarget, type DevDataTarget } from './adjudicate.js'
import { createJsonlAuditSink, createLoggerAuditSink, type AuditLoggerLike } from './audit.js'
import { entryTools, unionEntryTools } from './entries.js'
import { DEV_ENVS, envFacts, normalizeEnv } from './env.js'
import { ENGINES, neverActions, matrixFor, type Engine } from './operations.js'
import {
  DEFAULT_SCAN_COUNT,
  DEFAULT_TIMEOUT_MS,
  MAX_SCAN_COUNT,
  MAX_TIMEOUT_MS,
  MIN_TIMEOUT_MS,
  normalizeConfig,
  pickTarget,
  targetIds,
  type LiveConfig,
  type LiveTarget,
} from './plugin-config.js'
import { readOnlySummary, verdictReadOnly } from './readonly-probe.js'
import { createRedisExecutor } from './redis-executor.js'
import { REJECTION_CODES } from './rejection.js'
import { decideScope } from './scope.js'
import {
  RAW_COMMAND_TOOL_NAME,
  invokeRedisCommand,
  toolNameFor,
  type AuditSink,
  type PreExecuteBlock,
  type ToolExecutor,
  type ToolOutcome,
} from './tool.js'

/** 能力规格的配置形状（与 `kit` 的 `CapabilitySpec` 一字不差，避免两套写法）。 */
const CAPABILITY_SCHEMA = z.object({
  env: z.string().default(''),
  label: z.string().default(''),
})

/**
 * 一个目标里**「没写」必须保持没写**的字段——schemastery 的两处反直觉行为换来的。
 *
 * ## ① 能力规格：`z.object({env: default(''), …})` 会凭空造出一个空规格
 *
 * 用户**什么都没写**时它照样造出 `{env:'', label:''}`（`.required(false)` 也一样，实测）。
 * 而空 `env` 在语义上是「给了能力规格但没给变量名」——一条**配置问题**。于是「没写」被报成了
 * 「写错了」（**D06**）：2026-10-02 真机上 `devdata_capabilities` 对每个目标多报两条这种假问题
 * （维护者自己验出来的）。`.default(undefined)` 让缺省**保持缺席**：未写 → 键不存在（静默按「不接入
 * 闸门」）；真写了 `{}` → 仍是 `{env:'', label:''}`（照报）。
 *
 * ## ② `db`：`z.natural().default(0)` 会让执行器每次先发一条 `SELECT 0`（**D07**）
 *
 * 「没写」变成「写了 0」，于是每个调用前都多一帧（Redis 连接默认就在 0 号库）。2026-10-02 把
 * 假宿主改成走真 schema 之后，用例当场把这个多出来的帧照了出来——真机上它一直在发，只是没人看帧序。
 *
 * `as never` 是 schemastery 类型签名的将就：它的 `default(value: T | Partial<S>)` 不收
 * `undefined`。**另一种写法是 `z.any()`**（也能让缺省缺席），但那会连形状校验一起丢掉。
 */
const OPTIONAL_CAPABILITY = CAPABILITY_SCHEMA.default(undefined as never)

/** 同上的 ② ：`SELECT` 只在用户真的指定了库号时才发。 */
const OPTIONAL_DB = z.natural().default(undefined as never)

/** 一个目标的配置形状（语义校正见 `plugin-config.ts`——schema 只管形状）。 */
const TARGET_SCHEMA = z.object({
  id: z.string().required(),
  label: z.string().default(''),
  engine: z.string().required(),
  env: z.string().default(''),
  scopeDirs: z.array(z.string()).default([]),
  host: z.string().default(''),
  // 0 = 没写（`z.natural()` 缺省会被填成 undefined，那就与「写了 0」分不开；0 不是合法端口，安全）。
  port: z.natural().default(0),
  db: OPTIONAL_DB,
  credentialRef: z.string().default(''),
  maxScanCount: z.natural().default(DEFAULT_SCAN_COUNT),
  writeCapability: OPTIONAL_CAPABILITY,
  dangerousReadCapability: OPTIONAL_CAPABILITY,
})

/**
 * 插件配置的**类型**。
 *
 * 与下面的 `const Config`（schemastery schema）同名并存：一个是类型空间的形状，一个是值空间的
 * 校验器，DSH 两个都要（本仓既有写法，见 docker / tty / devfront）。
 */
export interface Config {
  enabled?: boolean
  announceToAgent?: boolean
  auditFile?: string
  timeoutMs?: number
  plan?: { maxRows?: number; maxCost?: number }
  targets?: Array<{
    id?: string
    label?: string
    engine?: string
    env?: string
    scopeDirs?: string[]
    host?: string
    port?: number
    db?: number
    credentialRef?: string
    maxScanCount?: number
    writeCapability?: { env?: string; label?: string }
    dangerousReadCapability?: { env?: string; label?: string }
  }>
}

/**
 * 插件配置的 schema。
 *
 * 字段全部 `.volatile()`：那声明的语义是「可以热写，**插件自己订阅 `loader/volatile-update`
 * 重读**」。本插件在 `apply` 里订阅并重算（见 `applySection`）——不订阅的话，配置页上改目标会
 * 「写盘成功、静默不生效」，而那份声明就是假的（`devfront` 记过这条教训）。
 *
 * **两个字段刻意不给 schema 默认值**（`timeoutMs` / `plan` 的子项）：`z.natural().default(0)`
 * 会让「没写」与「写了 0」在 `plainConfig` 之后变成同一个值，而 `plan.maxRows: 0` 的语义是
 * **一行都不许**——一个不该由「没写」触发的闸门。不给默认值，缺省就是缺省。
 */
export const Config: z = z.object({
  enabled: z.boolean().default(true).volatile(),
  announceToAgent: z.boolean().default(true).volatile(),
  auditFile: z.string().default('').volatile(),
  timeoutMs: z.natural().volatile(),
  plan: z.object({ maxRows: z.natural(), maxCost: z.natural() }).volatile(),
  targets: z.array(TARGET_SCHEMA).default([]).volatile(),
})

/** `tools` 服务的最小形状（本包与宿主的耦合只有这一个方法）。 */
interface ToolsLike {
  register(definition: unknown): () => void
}

/** `systemPrompt` 服务的最小形状（只用到「插一段」）。 */
interface SystemPromptLike {
  section(entry: { name: string; order?: number; text: string }): () => void
}

/**
 * 本宿主**真的有执行器**的引擎。
 *
 * 今天只有一个——这是整套东西唯一的能力边界，写成一个函数是为了让「加了执行器要改哪儿」一眼可见
 * （改这里 + `entries.ts` 的判据就会自动把新引擎的入口放出去）。
 */
export function servedEngines(): readonly Engine[] {
  return ['redis']
}

/**
 * 工具面公告（插进 `systemPrompt` 的那一段）。
 *
 * 说的是「这个插件能做什么、入口叫什么、闸门怎么开」，**不是目标清单**（那份嵌在工具描述里，
 * 会随配置重注册）。写清入口名是给 agent 省事：它不必先猜哪个工具是数据面的。
 */
export const DEVDATA_GUIDANCE = [
  '# 开发数据面（dsh-devdata）',
  '',
  '本机装了 `@hyzyn/dsh-devdata`：一组**经判据层**访问开发/测试环境数据服务的工具。',
  '',
  '- `list_targets`：当前工作目录能用哪些目标（作用域按目录收敛；空作用域 = 处处拒绝）。',
  '- `capabilities <target>`：这个目标当前哪些档位可用、哪些被闸门挡住、**怎么授权**。',
  '- `doctor <target>`：逐层报告只读 / 闸门到底在哪几层真的在位（**验不到的一律报 warn**）。',
  '- `redis_command <target> <command>`：Redis 的命令原文入口（今天唯一有执行器的引擎）。',
  '',
  '四条要知道的规矩：',
  '1. **写类与危险读默认关**：要宿主授权（在启动 dsh 的环境里 `export DSH_DEVDATA_WRITE=1` 后重启）',
  '   且目标环境可写；写类还要求配了持久审计（`auditFile`）。',
  '2. **不可逆操作要逐次二次确认**：先调用一次会被拒（`CONFIRMATION_REQUIRED`），把你打算改什么',
  '   说清楚之后再带 `confirmed: true` 重试。',
  '3. **被拒时看恢复路径**：每条拒绝都带 `[CODE]` 与下一行「恢复路径」，那是你下一步该做的事',
  '   （原样重试不会有新结果）。',
  '4. **只读也要在作用域内**：`scopeDirs` 为空的目标处处拒绝。',
].join('\n')

/** 一次工具调用的结果形状（canonical value；agent 读的就是 `text`）。 */
interface ToolText {
  text: string
}

/** 文本工具的输出形状（`defineTool` 要的 canonical schema + 渲染）。 */
interface TextToolOutput {
  schema: {
    type: 'object'
    additionalProperties: false
    properties: { text: { type: 'string'; required: true } }
  }
  render: (args: unknown, value: unknown) => Array<{ type: 'text'; text: string }>
}

/** 文本工具的输出 schema + 渲染（四个工具共用）。 */
function textOutput(): TextToolOutput {
  return {
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: { text: { type: 'string', required: true } },
    },
    render: (_args, value) => [{ type: 'text', text: (value as ToolText).text }],
  }
}

/**
 * 把一次拒绝拼成给 agent 看的一句话（与 `devfront` 的 `denialMessage` 同一格式）。
 *
 * 格式是契约：`[CODE] 正文`，恢复路径另起一行。**码必须带出去**——正文是给人读的中文，
 * 而码是这件事唯一的稳定标识符（agent 拿一段散文只能靠正则猜）。
 */
export function denialMessage(outcome: { code: string; message: string; hint?: string }): string {
  const head = `[${outcome.code}] ${outcome.message}`
  return outcome.hint === undefined ? head : `${head}\n恢复路径：${outcome.hint}`
}

/** 把引擎结果渲染成给 agent 的文本（对象走 JSON，agent 一轮就能定位）。 */
export function renderResult(result: unknown): string {
  if (typeof result === 'string') return result
  if (result === null || result === undefined) return '（空）'
  return JSON.stringify(result, null, 2)
}

/** 能力规格的展示（含授权状态与「怎么授权」）。 */
export function capabilityLines(spec: CapabilitySpec | undefined, what: string): string[] {
  if (spec === undefined) return [`- ${what}：**未接入闸门**（因此该档入口不出现）`]
  const via = capabilityGrantVia(spec)
  if (via === undefined) {
    return [`- ${what}：已接入（${spec.env} / ${spec.label}），**当前未获授权**`, `  怎么授权：${capabilityHowTo(spec)}`]
  }
  return [`- ${what}：已接入（${spec.env} / ${spec.label}），**已授权**（通道：${via === 'env' ? '启动环境' : '带外确认'}）`]
}

/** `doctor` 的一层结论。 */
export interface DoctorLayer {
  layer: string
  state: 'ok' | 'warn' | 'fail' | 'na'
  detail: string
}

const DOCTOR_ICON: Record<DoctorLayer['state'], string> = { ok: '✓', warn: '!', fail: '✗', na: '—' }

/**
 * 逐层自证（`docs/devdata-plan.md` §3.7-3）。
 *
 * **验不到的一律 `warn`，不报 `ok`**——代价是报告看起来不够绿，收益是它不撒谎。纯函数：
 * 不连目标、不读文件，只据配置与判据层已知的事实作答（引擎级事实——如「账号真的只读吗」——
 * 要执行器去取，今天取不到，所以那一层必然不是 `ok`）。
 */
export function doctorLayers(target: LiveTarget, cwd: string, options: { auditDurable: boolean }): DoctorLayer[] {
  const env = normalizeEnv(target.env)
  const facts = envFacts(env)
  const scope = decideScope(target.scopeDirs, cwd)
  const layers: DoctorLayer[] = []

  // ① 命令白名单 / 矩阵（代码层）：永远在位，且是 Redis 档**唯一**的一层。
  layers.push({
    layer: '命令白名单（矩阵 + never）',
    state: 'ok',
    detail: `受管动作 ${String(Object.keys(matrixFor(target.engine).operations).length)} 个，明确排除 ${String(neverActions(target.engine).length)} 个（**不提供入口**）`,
  })

  // ② 环境档位：它决定写类原不原意放行。
  layers.push({
    layer: '环境档位',
    state: 'ok',
    detail: `${env}（${facts.label}）：${facts.allowsWrite ? '原则上允许写' : '写类一律拒'}${facts.requiresConfirm ? '，且写前要逐次二次确认' : ''}`,
  })

  // ③ 作用域：空 = 处处拒绝（fail-closed）。
  layers.push({
    layer: '目录作用域',
    state: target.scopeDirs.length === 0 ? 'fail' : scope.allowed ? 'ok' : 'warn',
    detail:
      target.scopeDirs.length === 0
        ? 'scopeDirs 为空 = 处处拒绝（fail closed；这是刻意的，不替用户填默认目录）'
        : scope.allowed
          ? `当前目录在作用域内（${target.scopeDirs.join(' / ')}）`
          : `当前目录 ${cwd} **不在**作用域内（${target.scopeDirs.join(' / ')}）`,
  })

  // ④ 能力闸门：写 / 危险读各一条。未授权时**给恢复路径**（§3.6.1 的实现要求 1）。
  for (const [what, spec] of [
    ['写类能力', target.writeCapability],
    ['危险读能力', target.dangerousReadCapability],
  ] as const) {
    layers.push({
      layer: what,
      state: spec === undefined ? 'na' : capabilityGrantVia(spec) === undefined ? 'warn' : 'ok',
      detail: capabilityLines(spec, what).join('\n'),
    })
  }

  // ⑤ 账号级只读：SQL 档唯一的**硬**护栏。没有执行器就取不到事实 → 缺证即拒。
  const verdict = verdictReadOnly({ engine: target.engine })
  const accountLayerApplies = target.engine === 'mysql' || target.engine === 'postgres' || target.engine === 'sqlserver' || target.engine === 'dm'
  layers.push({
    layer: '账号级只读自证',
    state: verdict.enabled ? 'ok' : accountLayerApplies ? 'warn' : 'na',
    detail: readOnlySummary(verdict),
  })

  // ⑥ 审计：写类的前提（§5）。
  layers.push({
    layer: '审计出口',
    state: options.auditDurable ? 'ok' : 'warn',
    detail: options.auditDurable
      ? '已配持久审计（一条 JSON 行 / 调用，含被拒绝的尝试）；写不进去时本次调用不返回结果'
      : '**只有宿主日志，没有持久记录**：只读操作不受影响，写类会被拒（配 auditFile 后可用）',
  })

  // ⑦ 执行器：这个引擎在这台机器上到底通不通。
  const served = servedEngines().includes(target.engine)
  layers.push({
    layer: '引擎执行器',
    state: served ? 'ok' : 'warn',
    detail: served
      ? `${target.engine}：已接通路 A 执行器`
      : `${target.engine}：**尚未实现执行器**（所以本目标只给 list_targets / capabilities / doctor；见 plan §2.4）`,
  })

  if (target.connection === undefined) {
    layers.push({
      layer: '连接信息',
      state: served ? 'warn' : 'na',
      detail: '没有配置 host/port（或配置不完整）：调用时会被明确告知，不会拿默认端口去试',
    })
  }

  return layers
}

/* ==========================================================================
 * 配置卡片（客户端半体）的数据面 —— 纯函数
 *
 * 卡片是照 `devfront` 那份做的（它是**唯一**的模板：同一版宿主里没有任何东西按 Config schema
 * 生成表单，所以每张卡片都自带一条 `GET/POST /api/dsh-devdata/config`）。这里只放**判据**，
 * 路由在 `apply()` 里，两者分开是因为「宿主半体那一层在本包没有假宿主夹具」——
 * 抽成纯函数才测得到（`test/plugin.test.ts`）。
 * ======================================================================== */

/**
 * 配置卡片能改的**标量**字段。
 *
 * `targets`（目标列表）不在这一列里——它有自己那条路（`normalizeTargets` + 逐次确认），
 * 因为它是「这个目标、这个引擎、这个环境、这个范围」的**声明**。
 *
 * 计划护栏刻意用**扁平键**（`plan.maxRows` / `plan.maxCost`）而不是嵌套对象：settings 的
 * `update(entryId, patch)` 是**深合并**，`{plan:{maxRows}}` 与 `{'plan.maxRows':…}` 都能落到
 * 同一个位置，但前者会让「这次到底改了 plan 里的哪一个」在 patch 里看不出来，而审计要能说清
 * 这件事（`config.scalars` 那一行）。
 */
export const CARD_FIELDS = ['enabled', 'announceToAgent', 'auditFile', 'timeoutMs', 'plan.maxRows', 'plan.maxCost'] as const

/**
 * **只读**的两档能力字段（出现在 POST body 里 → 400）。
 *
 * 为什么它们不能可写：这两档的授权判据是「宿主**启动继承层**里 `spec.env` 那个变量的值 ∈
 * `{1,true,yes,on}`」（`kit` 的 `TRUTHY`），而变量名来自配置。把它指向**另一个已经在启动环境里、
 * 值恰好为真**的变量（例如宿主自带的 `CI=true`），页内脚本一条 `POST /config` 就等于
 * **免重启提权**——那恰好违反根 `ROADMAP.md` §5.1 的不变量「**HTTP 只能关、不能开**」。
 * ⚠️ **别用「改成 `HOME`」当例子**（2026-10-03 更正）：`HOME` 的值不在那个白名单里，`env` 名指向它
 * **不会**授权——写错例子会让人以为这条判据是「防手滑」而不是「防提权」。
 * 所以：GET 快照照实给出**当前授权状态**，写入路径一律拒。
 */
export const CAPABILITY_FIELDS = ['writeCapability', 'dangerousReadCapability'] as const

/** 能力字段出现在写入路径上时的拒绝文案（带恢复路径：改哪儿才是对的地方）。 */
export function capabilityEditRefusal(field: string): string {
  return (
    `能力档字段 ${field} 在卡片上**只读**，不能经 HTTP 改。` +
    '理由：这两档的授权判据是「宿主启动继承层里那个变量的值 ∈ 1/true/yes/on」，而变量名来自配置——' +
    '把它指向另一个恰好为真的变量（例如 CI=true），页内脚本一条请求就等于**免重启提权**，' +
    '违反根 ROADMAP §5.1 的不变量「HTTP 只能关、不能开」。' +
    `\n恢复路径：在 profile 补丁层（~/.dsh/profiles/<profile>/cordis.patch.yml）里改这个目标的 ${field}，` +
    '然后按新的变量名重启宿主（授权只认启动时继承的环境与带外确认）。'
  )
}

/** 一个字符串数组字段（去空、保序）。 */
function readStringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  return value.filter((item): item is string => typeof item === 'string' && item.trim() !== '').map((item) => item.trim())
}

/** 一个普通对象（`normalizeTargets` 的产物一定是；这里只是让调用点的类型收窄）。 */
function isPlainRow(row: unknown): row is Record<string, unknown> {
  return typeof row === 'object' && row !== null && !Array.isArray(row)
}

/**
 * 递归找能力字段（**含 `targets[i]` 里那些**：换了位置不等于换了语义），返回它的**路径**。
 *
 * 返回路径而不是键名：报错要能指到具体那一行（`targets[2].writeCapability`），否则一份多目标的
 * 配置里用户不知道该改哪一个（与 `targets[i].字段` 的其余报错同一口径）。
 */
function findCapabilityField(value: unknown, at = '', depth = 0): string | undefined {
  if (depth > 6 || typeof value !== 'object' || value === null) return undefined
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      const found = findCapabilityField(item, `${at}[${String(index)}]`, depth + 1)
      if (found !== undefined) return found
    }
    return undefined
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const path = at === '' ? key : `${at}.${key}`
    if ((CAPABILITY_FIELDS as readonly string[]).includes(key)) return path
    const found = findCapabilityField(child, path, depth + 1)
    if (found !== undefined) return found
  }
  return undefined
}

/**
 * 目标列表的**严格**校验（卡片保存路径专用）。
 *
 * 为什么不直接拿 `normalizeConfig` 的结果：它对坏行是**静默跳过 / 静默夹回**（那是给「配置里
 * 本来就写坏了一行」的容错），而保存路径上静默跳过 = 用户以为存了 3 个、实际只有 2 个。
 * 这里逐行逐字段报错、**指到 `targets[i].字段`**，并在最后用 `normalizeConfig` 复核两件事：
 * 校验过的行**一行不少**被收下、且**一条 problem 都不产生**（两套规则一旦分叉就在这里红，
 * 而不是等到下次启动时用户在日志里看到一条「配置问题」）。
 */
export function normalizeTargets(input: unknown): { targets: Record<string, unknown>[] } | { error: string; code?: string } {
  if (!Array.isArray(input)) return { error: 'targets 必须是数组' }
  const out: Record<string, unknown>[] = []
  const seen = new Set<string>()

  for (const [index, row] of input.entries()) {
    const where = `targets[${String(index)}]`
    if (typeof row !== 'object' || row === null || Array.isArray(row)) return { error: `${where} 必须是对象` }
    const entry = row as Record<string, unknown>

    const capabilityField = findCapabilityField(entry, where)
    if (capabilityField !== undefined) {
      return { error: capabilityEditRefusal(capabilityField), code: 'CAPABILITY_READONLY' }
    }

    const id = typeof entry.id === 'string' ? entry.id.trim() : ''
    if (id === '') return { error: `${where}.id 必须是非空字符串（工具就是按它选目标的）` }
    if (seen.has(id)) return { error: `${where}.id 与前面的目标重名：${id}——重名的那一个会被丢掉，那是静默失败` }
    seen.add(id)

    const engine = typeof entry.engine === 'string' ? entry.engine.trim().toLowerCase() : ''
    if (!(ENGINES as readonly string[]).includes(engine)) {
      return {
        error:
          `${where}.engine 认不出：${JSON.stringify(entry.engine ?? '')}（可用：${ENGINES.join(' / ')}）` +
          '——认不出的引擎一律不当成某个默认值（那是「配了没反应」的来源）',
      }
    }

    const envRaw = typeof entry.env === 'string' ? entry.env.trim() : ''
    if (entry.env !== undefined && typeof entry.env !== 'string') return { error: `${where}.env 必须是字符串` }
    if (envRaw !== '' && !(DEV_ENVS as readonly string[]).includes(envRaw.toLowerCase())) {
      return {
        error:
          `${where}.env 认不出：${JSON.stringify(envRaw)}（可用：${DEV_ENVS.join(' / ')}；留空 = unknown）。` +
          '**不许「匹配不到就算 test」**：那是把「没标注」静默升格为「可写」',
      }
    }

    const label = typeof entry.label === 'string' ? entry.label.trim() : ''
    if (entry.label !== undefined && typeof entry.label !== 'string') return { error: `${where}.label 必须是字符串` }

    const scopeDirs = readStringList(entry.scopeDirs)
    if (entry.scopeDirs !== undefined && scopeDirs === undefined) return { error: `${where}.scopeDirs 必须是字符串数组` }

    const credentialRef = typeof entry.credentialRef === 'string' ? entry.credentialRef.trim() : ''
    if (entry.credentialRef !== undefined && typeof entry.credentialRef !== 'string') {
      return { error: `${where}.credentialRef 必须是字符串（它是**引用**，如 env:DB_PASS；明文口令不许写进来）` }
    }

    const scanRaw = entry.maxScanCount
    let maxScanCount: number | undefined
    if (scanRaw !== undefined) {
      if (typeof scanRaw !== 'number' || !Number.isInteger(scanRaw) || scanRaw < 1 || scanRaw > MAX_SCAN_COUNT) {
        return { error: `${where}.maxScanCount 必须是 1~${String(MAX_SCAN_COUNT)} 的整数（SCAN 族的策略上限，候选只能请求更小）` }
      }
      maxScanCount = scanRaw
    }

    const host = typeof entry.host === 'string' ? entry.host.trim() : ''
    if (entry.host !== undefined && typeof entry.host !== 'string') return { error: `${where}.host 必须是字符串` }
    const portRaw = entry.port
    if (portRaw !== undefined && (typeof portRaw !== 'number' || !Number.isInteger(portRaw) || portRaw < 1 || portRaw > 65535)) {
      return { error: `${where}.port 必须是 1~65535 的整数` }
    }
    const port = typeof portRaw === 'number' ? portRaw : undefined
    if (host === '' && port !== undefined) {
      return {
        error:
          `${where}.port 给了但 host 是空的——要么两个都给，要么都不给。` +
          '（少一个不是「用默认端口」，是配置没写完；解析层会因此报一条配置问题）',
      }
    }
    if (host !== '' && port === undefined) {
      return { error: `${where}.port 必须与 host 一起给（1~65535）：端口不是可以省的那一半` }
    }
    const dbRaw = entry.db
    if (dbRaw !== undefined && (typeof dbRaw !== 'number' || !Number.isInteger(dbRaw) || dbRaw < 0)) {
      return { error: `${where}.db 必须是非负整数` }
    }
    if (dbRaw !== undefined && host === '') {
      return { error: `${where}.db 给了但没有连接（host/port）——库号只在有连接时有意义` }
    }

    out.push({
      id,
      ...(label === '' ? {} : { label }),
      engine,
      ...(envRaw === '' ? {} : { env: envRaw }),
      scopeDirs: scopeDirs ?? [],
      ...(host === '' ? {} : { host }),
      ...(port === undefined ? {} : { port }),
      ...(typeof dbRaw === 'number' ? { db: dbRaw } : {}),
      ...(maxScanCount === undefined ? {} : { maxScanCount }),
      ...(credentialRef === '' ? {} : { credentialRef }),
    })
  }

  // 复核：解析层必须把这些行**一行不少**地收下，且**一条 problem 都不报**（两套规则分叉时在这里红）
  const parsed = normalizeConfig({ targets: out })
  if (parsed.targets.length !== out.length) {
    return { error: `内部判据分叉：校验通过 ${String(out.length)} 个目标，解析层只收下 ${String(parsed.targets.length)} 个（报 bug，别重试）` }
  }
  if (parsed.problems.length > 0) {
    return {
      error:
        `内部判据分叉：卡片校验通过的目标在解析层报了问题——${parsed.problems.join('；')}` +
        '（报 bug，别重试：保存路径不该写出一份「启动时又报配置问题」的配置）',
    }
  }
  return { targets: out }
}

/**
 * 改目标时**保住原有的能力声明**。
 *
 * 卡片改目标是**替换整份 `targets`**（与 `devfront` 的站点编辑器同形），而能力字段在写入路径上
 * **不许出现**（见 `CAPABILITY_FIELDS`）——两者叠起来就是「编辑一次目标，能力声明全被抹掉」。
 * 那是静默的安全降级：闸门看起来还在（卡片照样显示两档），实际已经变成「未接入」。
 * 所以按 id 把**上一份生效配置里**的声明原样带回来，只认 id 相同的行：
 *
 *   - 新增的行没有声明（= 未接入闸门，**这是诚实的缺省**：一个刚加进来的目标不该凭空获得授权）；
 *   - 改名的行算新增（它已经不是同一个目标了）——卡片上写了这条。
 */
export function preserveCapabilities(
  rows: readonly Record<string, unknown>[],
  previous: readonly LiveTarget[],
): Record<string, unknown>[] {
  return rows.map((row) => {
    const id = typeof row.id === 'string' ? row.id : ''
    const before = previous.find((target) => target.id === id)
    if (before === undefined) return { ...row }
    return {
      ...row,
      ...(before.writeCapability === undefined ? {} : { writeCapability: before.writeCapability }),
      ...(before.dangerousReadCapability === undefined ? {} : { dangerousReadCapability: before.dangerousReadCapability }),
    }
  })
}

/** 只对**普通对象**递归的合并（数组 / 标量一律替换）——与 settings 的 `mergeLayers` 同口径。 */
export function mergeSection(
  current: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...current }
  for (const [key, value] of Object.entries(patch)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue
    const under = out[key]
    const mergeable =
      typeof under === 'object' && under !== null && !Array.isArray(under) &&
      typeof value === 'object' && value !== null && !Array.isArray(value)
    out[key] = mergeable ? mergeSection(under as Record<string, unknown>, value as Record<string, unknown>) : value
  }
  return out
}

/**
 * 把卡片提交上来的 patch 收敛成「能写进 settings entry 的那几个字段」。
 *
 * **纯函数**，所以这条判据有单测（宿主半体那一层没有假宿主夹具，抽出来才能断言）。四条规矩：
 *   - **能力字段一律拒**（含藏在 `targets[i]` 里的）——见 `CAPABILITY_FIELDS`；
 *   - 不认识的字段 → 报错（**不静默丢弃**：卡片与宿主版本不一致时，静默丢弃会让用户以为保存成功）；
 *   - `targets` → 必须带 `confirmTargetEdit: true`（逐次确认），且逐行严格校验；
 *   - 类型/范围**先判、再写**：非法值**不许**先落地再抛（docker 踩过：非法值写进 settings 之后
 *     整段配置在下次启动时静默退回默认）。
 */
export function normalizeCardPatch(
  input: Record<string, unknown>,
): { patch: Record<string, unknown>; code?: string } | { error: string; code?: string } {
  const capabilityField = findCapabilityField(input)
  if (capabilityField !== undefined) {
    return { error: capabilityEditRefusal(capabilityField), code: 'CAPABILITY_READONLY' }
  }

  const patch: Record<string, unknown> = {}
  const plan: Record<string, number> = {}

  for (const [key, value] of Object.entries(input)) {
    if (key === 'confirmTargetEdit') continue // 它只是这次调用的确认位，不进配置
    if (key === 'targets') {
      if (input.confirmTargetEdit !== true) {
        return {
          error:
            '改目标要逐次确认：这是「工具能在哪个目标、哪个引擎、哪个环境、哪个范围上动手」的变更，'
            + '带 `confirmTargetEdit: true` 重试（卡片上那个复选框就是它）。它写进 profile 补丁层并进审计。',
          code: 'CONFIRMATION_REQUIRED',
        }
      }
      const normalized = normalizeTargets(value)
      if ('error' in normalized) return normalized
      patch.targets = normalized.targets
      continue
    }
    if (key === 'plan.maxRows' || key === 'plan.maxCost') {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        return {
          error:
            `${key} 必须是非负数字。**两个语义不许混**：留空 = 不做这一层检查（卡片会跳过它），` +
            '而 `plan.maxRows: 0` = 一行都不许——后者是有意收紧，不是「没填」',
        }
      }
      plan[key.slice('plan.'.length)] = value
      continue
    }
    if (key === 'plan') {
      return { error: '不认识的字段：plan（计划护栏用扁平键 `plan.maxRows` / `plan.maxCost`，不是嵌套对象）' }
    }
    if (!(CARD_FIELDS as readonly string[]).includes(key)) return { error: `不认识的字段：${key}` }

    if (key === 'enabled' || key === 'announceToAgent') {
      if (typeof value !== 'boolean') return { error: `${key} 必须是布尔值` }
      patch[key] = value
      continue
    }
    if (key === 'timeoutMs') {
      // 范围与 `plugin-config.ts` 的常量同源（卡片与解析层各判一套就会漂）
      if (
        typeof value !== 'number' || !Number.isInteger(value) || value < MIN_TIMEOUT_MS || value > MAX_TIMEOUT_MS
      ) {
        return { error: `timeoutMs 必须是 ${String(MIN_TIMEOUT_MS)}~${String(MAX_TIMEOUT_MS)} 的整数（毫秒）` }
      }
      patch[key] = value
      continue
    }
    if (typeof value !== 'string') return { error: `${key} 必须是字符串` }
    patch[key] = value.trim()
  }

  if (Object.keys(plan).length > 0) patch.plan = plan
  if (Object.keys(patch).length === 0) return { error: '没有要改的字段（patch 是空的）' }
  return { patch }
}

/**
 * 一条能力档的**只读**快照（给卡片的能力面板用；`undefined` = 这份配置里没接入闸门）。
 *
 * 三件必须都在：**声明的变量名**（`env`）、**当前是否已授权**（`granted` / `via`）、
 * **怎么授权**（`howTo`）。只给前两件，用户就只能在猜里过日子；只给后一件，他不知道自己现在
 * 在哪一档。`howTo` 刻意**不传 `{inPlace:true}`**：本包没有就地提权通道（`bindCapabilitySources`
 * 不接 `GrantStore`），文案提到一个不存在的按钮就是「配了没反应」。
 */
export function capabilitySnapshot(spec: CapabilitySpec): Record<string, unknown> {
  const via = capabilityGrantVia(spec)
  return {
    env: spec.env,
    label: spec.label,
    granted: via !== undefined,
    ...(via === undefined ? {} : { via }),
    howTo: capabilityHowTo(spec),
  }
}

/**
 * 卡片的 GET 快照（**纯函数**：把 `live` 投影成客户端要的形状）。
 *
 * 目标**全量只读展示**（含 `scopeDirs` / 连接 / `maxScanCount` / 凭据引用），另有两条只读元信息：
 *
 *   - 每个目标的两档能力（`capabilitySnapshot`）——**只读**，写入路径一律拒（见 `CAPABILITY_FIELDS`）；
 *   - `engines` / `envs`：枚举的**唯一真相在宿主侧**（`operations.ts` / `env.ts`），卡片拿它渲染
 *     下拉框，而不是自己抄一份字面量（抄一份必然漂）。
 *
 * `credentialRef` 是**引用**不是口令（值在凭据服务/文件/环境里），所以可以照原样给卡片。
 */
export function configSnapshotFrom(live: LiveConfig): Record<string, unknown> {
  return {
    enabled: live.enabled,
    announceToAgent: live.announceToAgent,
    auditFile: live.auditFile,
    timeoutMs: live.timeoutMs,
    plan: { ...live.plan },
    engines: [...ENGINES],
    envs: [...DEV_ENVS],
    targets: live.targets.map((target) => ({
      id: target.id,
      label: target.label,
      engine: target.engine,
      env: target.env,
      scopeDirs: [...target.scopeDirs],
      maxScanCount: target.maxScanCount,
      ...(target.connection === undefined
        ? {}
        : {
            host: target.connection.host,
            port: target.connection.port,
            ...(target.connection.db === undefined ? {} : { db: target.connection.db }),
          }),
      ...(target.credentialRef === undefined ? {} : { credentialRef: target.credentialRef }),
      ...(target.writeCapability === undefined ? {} : { writeCapability: capabilitySnapshot(target.writeCapability) }),
      ...(target.dangerousReadCapability === undefined
        ? {}
        : { dangerousReadCapability: capabilitySnapshot(target.dangerousReadCapability) }),
    })),
  }
}

/** 宿主半体。 */
const plugin = definePlugin<Config>({
  name: 'devdata',
  inject: ['tools'],
  apply(ctx: Context, rawConfig?: Config) {
    /** apply 时的原始配置：卡片保存时如果拿不到 settings 的已解析值，就用它兜底。 */
    const initialSection = plainConfig((rawConfig ?? {}) as Config) as unknown as Record<string, unknown>
    /** 当前生效的配置（volatile 字段被就地改写后靠重算取回来，见 `applySection`）。 */
    let live: LiveConfig = normalizeConfig(initialSection)
    /**
     * 最近一次生效的**原始** section：卡片保存时套用 patch 的兜底源。
     *
     * **初值必须是 apply 时那份配置**，不能是 `{}`：`devfront` 的真机验收抓到过——启动时
     * `scope.get()` 还是空对象（settings entry 尚未就绪），于是兜底源一直是空的；卡片保存
     * 一个标量时用 `{...{}, timeoutMs}` 重建，**把整份 targets 抹掉**（响应里 `targets: []`）。
     */
    let rawSectionRef: Record<string, unknown> = initialSection
    /** settings 读写口（没有新版 settings 服务时是 `undefined`，卡片仍可用但不落盘）。 */
    let settingsScopeRef: SettingsEntryScope | undefined
    /** 本轮登记的工具。配置一变整批换掉——`tools.register` 不覆盖同名工具。 */
    let toolDisposers: Array<() => void> = []
    let announcementDispose: (() => void) | undefined
    let toolsApi: ToolsLike | undefined
    let announcementApi: SystemPromptLike | undefined
    let appliedSignature = JSON.stringify(live)
    /** 记过的配置问题（只报一次：`applySection` 会被反复调用）。 */
    let reportedProblems = ''

    /*
     * 能力判定源**在 apply 期绑定一次**（kit `capability.ts` 的约定 2）：现读 `process.env` 等于把
     * 提权路径搬到「环境变量卡片」（它有 HTTP 写入路径）。
     *
     * **仍然不传 GrantStore**：配置卡片（2026-10-03 建）**刻意没有**就地提权入口——两档能力在
     * 写入路径上只读（`CAPABILITY_FIELDS` 那条 400），传一个空存储只会让文案与事实分家。将来真做
     * 就地提权（带外确认 + `GrantStore`）时再传，那时 `capabilityHowTo` 的 `inPlace` 也跟着开。
     */
    bindCapabilitySources(ctx)

    const logger: AuditLoggerLike = {
      info: (message) => {
        ctx.logger.info(message)
      },
      warn: (message) => {
        ctx.logger.warn(message)
      },
    }

    /** 审计出口：配了文件走持久出口，否则只进日志（写类会被 `AUDIT_NOT_DURABLE` 挡住）。 */
    const auditSink = (): AuditSink => {
      if (live.auditFile === '') return createLoggerAuditSink(logger)
      return createJsonlAuditSink(live.auditFile)
    }
    const auditDurable = (): boolean => live.auditFile !== ''

    /** 按 id 取目标；找不到时报出可用名单（agent 的失败模式是原地重试，得给它出路）。 */
    const requireTarget = (id: unknown): LiveTarget => {
      if (typeof id !== 'string' || id.trim() === '') {
        throw new Error(`缺少 target 参数。可用目标：${targetIds(live.targets)}`)
      }
      const found = pickTarget(live.targets, id)
      if (found === undefined) {
        throw new Error(`没有名为 ${JSON.stringify(id.trim())} 的目标。可用：${targetIds(live.targets)}`)
      }
      return found
    }

    const cwdOf = (input: Record<string, unknown>): string =>
      typeof input.cwd === 'string' && input.cwd.trim() !== '' ? input.cwd : process.cwd()

    /**
     * 写类操作要求**持久**审计（§5）。作为 `beforeExecute` 交给内核，**在判定通过之后**才生效。
     *
     * 为什么不能在这里、在调用之前先判：那样一个「未授权的写」会先报「没有审计」，用户照提示配好
     * 审计之后再撞一次「没有授权」——这是本仓最忌讳的**错诊断**（让 agent 去改一个不对的地方）。
     * 判据本身取动作在矩阵里的档位（`spec.kind`），不是名字前缀：命令原文入口下动作名是解析层算的。
     */
    const auditGate = (input: { target: DevDataTarget; action: string }): PreExecuteBlock | undefined => {
      if (auditDurable()) return undefined
      if (matrixFor(input.target.engine).operations[input.action]?.kind !== 'write-scoped') return undefined
      return {
        code: REJECTION_CODES.AUDIT_NOT_DURABLE,
        message: `目标 ${input.target.id} 上 ${input.action} 是写类操作，而本插件没有配持久审计出口`,
        hint: '在插件配置里设置 auditFile（如 ~/.dsh/devdata-audit.jsonl）。审计是这一档的前提：写操作要事后能说清「谁在什么时候动了什么」',
      }
    }

    /** 把一次 `ToolOutcome` 转成 agent 看到的东西：成功给文本，失败抛带码的错。 */
    const finish = (outcome: ToolOutcome): ToolText => {
      if (!outcome.ok) throw new Error(denialMessage(outcome))
      return { text: renderResult(outcome.result) }
    }

    /**
     * Redis 执行器的**每轮重取**代理。
     *
     * 执行器是构造时取一次连接表的，而连接表会随配置热改（加目标 / 改端口）。在这里每轮从 `live`
     * 现取，省掉一整类「改了配置但连的还是旧地址」。执行器本身无状态，重建成本可忽略。
     */
    const redisExecutor: ToolExecutor = {
      run: (request) => {
        const connections: Record<string, { host: string; port: number; db?: number }> = {}
        for (const target of live.targets) {
          if (target.engine !== 'redis' || target.connection === undefined) continue
          connections[target.id] = target.connection
        }
        return createRedisExecutor({ connections, timeoutMs: live.timeoutMs }).run(request)
      },
    }

    /** 跑一次 Redis 命令原文。 */
    const runRedisCommand = async (input: Record<string, unknown>): Promise<ToolText> => {
      const target = requireTarget(input.target)
      const command = typeof input.command === 'string' ? input.command.trim() : ''
      if (command === '') {
        throw new Error(`缺少 command 参数（要发给 Redis 的命令原文，如 \`GET user:1\`）。目标：${target.id}`)
      }
      if (target.engine !== 'redis') {
        throw new Error(
          `目标 ${target.id} 的引擎是 ${target.engine}，不是 redis——命令原文入口只对 Redis 有效。` +
            `\n恢复路径：用 capabilities ${target.id} 看这个目标当前有哪些入口`,
        )
      }
      const outcome = await invokeRedisCommand({
        target,
        commandText: command,
        cwd: cwdOf(input),
        maxScanCount: target.maxScanCount,
        executor: redisExecutor,
        audit: auditSink(),
        beforeExecute: auditGate,
        ...(input.confirmed === true ? { confirmed: true } : {}),
      })
      return finish(outcome)
    }


    /** `list_targets` 的正文。 */
    const renderTargets = (cwd: string): string => {
      if (live.targets.length === 0) {
        return '一个目标都没有。恢复路径：在插件配置里加 targets（见 packages/devdata/README.md 的例子）'
      }
      const reachable: string[] = []
      const blocked: string[] = []
      for (const target of live.targets) {
        const scope = decideScope(target.scopeDirs, cwd)
        const names = entryTools(target, { engines: servedEngines() }).map((tool) => tool.name)
        const facts = envFacts(normalizeEnv(target.env))
        const endpoint = target.connection === undefined ? '' : ` endpoint=${target.connection.host}:${String(target.connection.port)}`
        const head = `- ${target.id}（${target.label}）engine=${target.engine} env=${normalizeEnv(target.env)}${facts.allowsWrite ? '（可写档）' : '（只读档）'}${endpoint}`
        const line = `${head}\n  入口：${names.join(' / ')}`
        if (scope.allowed) reachable.push(line)
        else {
          blocked.push(
            `${line}\n  **不可用**：当前目录 ${cwd} 不在它的作用域内（${
              target.scopeDirs.length === 0 ? '作用域为空 = 处处拒绝' : target.scopeDirs.join(' / ')
            }）`,
          )
        }
      }
      const parts = [`当前目录 ${cwd} 可用 ${String(reachable.length)} 个目标（共 ${String(live.targets.length)} 个）：`]
      parts.push(reachable.length === 0 ? '（一个都没有）' : reachable.join('\n'))
      if (blocked.length > 0) parts.push('', `因作用域不可用 ${String(blocked.length)} 个：`, blocked.join('\n'))
      return parts.join('\n')
    }

    /** `capabilities` 的正文。 */
    const renderCapabilities = (target: LiveTarget, cwd: string): string => {
      const snapshot = snapshotTarget(target)
      const entries = entryTools(target, { engines: servedEngines() })
      const scope = decideScope(target.scopeDirs, cwd)
      const credential = credentialStatus(snapshot.credentialSet ? target.credentialRef : undefined)
      const parts: string[] = [
        `目标 ${snapshot.id}（${snapshot.label}）`,
        `- 引擎：${snapshot.engine}`,
        `- 环境：${snapshot.env}（${snapshot.envLabel}）${snapshot.allowsWrite ? '，原则上允许写' : '，写类一律拒'}`,
        `- 作用域：${snapshot.scopeConfigured ? snapshot.scopeDirs.join(' / ') : '**为空 = 处处拒绝**'}`,
        `- 当前目录：${cwd}（${scope.allowed ? '在作用域内' : '**不在作用域内**'}）`,
        `- 凭证：${
          snapshot.credentialSet
            ? snapshot.credentialProtective
              ? '已设置，且构成防护'
              : `已设置，但**不构成防护**（${credential === undefined ? '' : credential.note}）`
            : '未设置'
        }`,
        `- 审计：${auditDurable() ? `持久（${live.auditFile}）` : '**只有宿主日志，没有持久记录**（写类因此被拒）'}`,
        '',
        `本目标当前的入口（${String(entries.length)} 个）：`,
        ...entries.map((tool) => `- ${tool.name}（${tool.group}）：${tool.why}`),
        '',
        '能力闸门：',
        ...capabilityLines(target.writeCapability, '写类能力'),
        ...capabilityLines(target.dangerousReadCapability, '危险读能力'),
        '',
        `明确排除、**不存在入口**的操作：${neverActions(target.engine).join(' / ') || '（无）'}`,
      ]
      if (live.problems.length > 0) {
        parts.push('', `配置问题（${String(live.problems.length)} 条）：`, ...live.problems.map((problem) => `- ${problem}`))
      }
      return parts.join('\n')
    }

    /** `doctor` 的正文。 */
    const renderDoctor = (target: LiveTarget, cwd: string): string => {
      const layers = doctorLayers(target, cwd, { auditDurable: auditDurable() })
      return [
        `目标 ${target.id}（${target.label}）· engine=${target.engine}`,
        '',
        ...layers.map((layer) => `${DOCTOR_ICON[layer.state]} ${layer.layer}\n  ${layer.detail}`),
        '',
        '说明：本报告只据配置与判据层作答，不连目标。**凡验不到的一律标 `!`，不标 `✓`**——一个不撒谎的报告比一个好看的报告有用。',
      ].join('\n')
    }

    /** 工具描述里嵌的目标名单（配置一变就过期，所以整批重注册）。 */
    const targetSummary = (): string => {
      if (live.targets.length === 0) return '（尚未配置任何目标）'
      return live.targets.map((target) => `${target.id}（${target.engine} / ${normalizeEnv(target.env)}）`).join('、')
    }

    /**
     * 注册工具（**可重入**）。
     *
     * 注册面按 `entries.ts` 算出的**并集**：某个入口只要在任何一个目标上可见就注册一次，描述里嵌
     * 目标名单；调用别的目标时由判据层给一句带恢复路径的拒绝。逐条 `add` 是为了让单个工具注册失败
     * 不把整批带下去（docker D107 记过这个坑）。
     */
    function refreshTools(): void {
      if (toolsApi === undefined) return
      for (const dispose of toolDisposers) {
        try {
          dispose()
        } catch {
          /* 已注销 */
        }
      }
      toolDisposers = []
      if (!live.enabled) return

      const registrations = unionEntryTools(live.targets, { engines: servedEngines() })
      const names = registrations.map((tool) => tool.name)
      const failures: string[] = []
      const add = (name: string, definition: unknown): void => {
        try {
          toolDisposers.push((toolsApi as ToolsLike).register(definition))
        } catch (error) {
          failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`)
        }
      }
      const cwdParam = {
        type: 'string',
        description: '当前工作目录（作用域判据用它；缺省取宿主进程工作目录。作用域为空的目标处处拒绝）',
      } as const

      if (names.includes(toolNameFor('list_targets'))) {
        add(
          'list_targets',
          defineTool({
            name: toolNameFor('list_targets'),
            isConcurrencySafe: () => true,
            description: `列出**当前工作目录**能用哪些数据目标（作用域按目录收敛；空作用域 = 处处拒绝）。目标：${targetSummary()}。其他 devdata 工具的 target 参数取自这里。`,
            parameters: { cwd: cwdParam },
            output: textOutput(),
            execute: (args: unknown): Promise<ToolText> => {
              const input = (args ?? {}) as Record<string, unknown>
              return Promise.resolve({ text: renderTargets(cwdOf(input)) })
            },
          }),
        )
      }

      if (names.includes(toolNameFor('capabilities'))) {
        add(
          'capabilities',
          defineTool({
            name: toolNameFor('capabilities'),
            isConcurrencySafe: () => true,
            description: `报告一个目标当前的档位：哪些入口可用、哪些被闸门挡住、**怎么授权**。撞到拒绝后先用它看恢复路径。目标：${targetSummary()}`,
            parameters: {
              target: { type: 'string', description: '目标名（list_targets 列出）' },
              cwd: cwdParam,
            },
            output: textOutput(),
            execute: (args: unknown): Promise<ToolText> => {
              const input = (args ?? {}) as Record<string, unknown>
              return Promise.resolve({ text: renderCapabilities(requireTarget(input.target), cwdOf(input)) })
            },
          }),
        )
      }

      if (names.includes(toolNameFor('doctor'))) {
        add(
          'doctor',
          defineTool({
            name: toolNameFor('doctor'),
            isConcurrencySafe: () => true,
            description: `逐层报告一个目标上的只读 / 闸门到底在哪几层真的在位（**验不到的一律报 warn**）。目标：${targetSummary()}`,
            parameters: {
              target: { type: 'string', description: '目标名（list_targets 列出）' },
              cwd: cwdParam,
            },
            output: textOutput(),
            execute: (args: unknown): Promise<ToolText> => {
              const input = (args ?? {}) as Record<string, unknown>
              return Promise.resolve({ text: renderDoctor(requireTarget(input.target), cwdOf(input)) })
            },
          }),
        )
      }

      if (names.includes(RAW_COMMAND_TOOL_NAME)) {
        const redisTargets = registrations.find((tool) => tool.name === RAW_COMMAND_TOOL_NAME)?.targets ?? []
        add(
          'redis_command',
          defineTool({
            name: RAW_COMMAND_TOOL_NAME,
            // 会写数据、`MONITOR` 还会阻塞目标：与同轮其它工具串行（宿主默认把未声明的工具当独占）。
            description:
              `对一个 Redis 目标执行**命令原文**（照原样下发，不重新拼一条）。动作由解析层算出：` +
              `白名单内放行、危险读（KEYS / MONITOR）与写类要授权、不可逆命令（FLUSHALL / EVAL / CONFIG SET 一类）**没有入口**。` +
              `目标：${redisTargets.join(' / ')}。用 capabilities <target> 看当前档位与怎么授权。`,
            parameters: {
              target: { type: 'string', description: `目标名（${redisTargets.join(' / ')}）` },
              command: {
                type: 'string',
                description: 'Redis 命令原文，如 `GET user:1`、`SCAN 0 MATCH order:* COUNT 50`、`INFO memory`、`DBSIZE`',
              },
              confirmed: {
                type: 'boolean',
                description:
                  '不可逆操作的逐次二次确认。第一次调用会被拒（CONFIRMATION_REQUIRED），把影响说清楚后带 true 重试',
              },
              cwd: cwdParam,
            },
            output: textOutput(),
            execute: (args: unknown): Promise<ToolText> => runRedisCommand((args ?? {}) as Record<string, unknown>),
          }),
        )
      }

      if (failures.length > 0) {
        console.warn(`[dsh-devdata] ${String(failures.length)} 个工具注册失败（下次配置变更会重试）：${failures.join('；')}`)
      }
      /*
       * 这一行走 `console.log` 而不是 `ctx.logger.info`——**2026-10-02 真宿主验证时踩到的**（**D04**）：
       * 走 logger 会进另一个 sink，实测「插件明明挂上了、启动日志里却找不到它注册了什么」。
       * 而**真机验收脚本解析的就是这一行**（`live-host-smoke` 对 docker 用的是同一个写法），
       * 运维确认插件有没有生效也看它。本仓其余插件（docker / tty / devfront）都用 stdout。
       */
      console.log(`[dsh-devdata] agent tools registered (${names.join(', ') || 'none'})`)
    }

    /** 拆掉工具登记。 */
    function disposeTools(): void {
      for (const dispose of toolDisposers) {
        try {
          dispose()
        } catch {
          /* 已注销 */
        }
      }
      toolDisposers = []
    }

    /** 按当前 `live` 重新插公告段（可重入）。 */
    function refreshAnnouncement(): void {
      if (announcementDispose !== undefined) {
        try {
          announcementDispose()
        } catch {
          /* 已注销 */
        }
        announcementDispose = undefined
      }
      if (!live.announceToAgent || announcementApi === undefined) return
      announcementDispose = announcementApi.section({ name: 'plugin:dsh-devdata', order: 154, text: DEVDATA_GUIDANCE })
    }

    /**
     * 配置问题只报一次（`applySection` 会被反复调用）。
     *
     * **走 `console.warn` 而不是 `ctx.logger.warn`**——这是 2026-10-02 补的第二个洞（**D08**）：logger 进的是
     * 另一个 sink，真宿主的启动日志里看不到，于是
     *   ① 用户永远不会在启动时知道自己的配置有问题；
     *   ② `verify-host-mount.mjs` 里那条「启动日志里没有『配置问题』」**变成空断言**（报告本来
     *      就不在它查的地方）——它因此没能拦住上一轮那条假问题。
     * 与注册行同一个道理：**启动日志是运维与验收脚本的观测面**。
     */
    function reportProblems(): void {
      const signature = live.problems.join('\n')
      if (signature === reportedProblems) return
      reportedProblems = signature
      for (const problem of live.problems) console.warn(`[dsh-devdata] 配置问题：${problem}`)
    }

    /**
     * 用一份新配置重算并让它真的生效。
     *
     * 空对象 = settings 还没准备好这份 entry（**不是**「用户清空了配置」）；值没变就不动
     * （`loader/volatile-update` 是全仓广播，别的插件改配置也会打到这里）。
     */
    function applySection(raw: Record<string, unknown>): void {
      if (Object.keys(raw).length === 0) return
      rawSectionRef = raw
      const next = normalizeConfig(raw)
      const signature = JSON.stringify(next)
      if (signature === appliedSignature) return
      appliedSignature = signature
      live = next
      reportProblems()
      refreshTools()
      refreshAnnouncement()
    }

    /* ---------- 初次登记 ---------- */
    reportProblems()
    refreshTools()
    refreshAnnouncement()

    ctx.inject(['tools'], (toolsCtx: Context) => {
      toolsApi = (toolsCtx as unknown as { tools?: ToolsLike }).tools
      if (toolsApi === undefined) {
        // 同上面那行：**启动日志是运维的观测面**，不能只写进 logger 的另一个 sink。
        if (live.enabled) console.log('[dsh-devdata] agent tools skipped (tools 服务未就绪)')
        return
      }
      refreshTools()
    })

    ctx.inject(['systemPrompt'], (promptCtx: Context) => {
      announcementApi = (promptCtx as unknown as { systemPrompt?: SystemPromptLike }).systemPrompt
      refreshAnnouncement()
    })

    ctx.inject(['settings'], (settingsCtx: Context) => {
      settingsCtx.effect(() => {
        const scope = settingsEntryScope(settingsCtx, 'devdata')
        if (scope === undefined) return () => {}
        settingsScopeRef = scope
        applySection(scope.get())
        const off = scope.onChanged(() => applySection(scope.get()))
        return () => {
          settingsScopeRef = undefined
          off()
        }
      }, 'dsh-devdata: settings')
    })

    /*
     * ---------- 配置卡片的**数据面**（`/api/dsh-devdata/config`） ----------
     *
     * 为什么必须有这条路由：客户端半体读不到插件配置——宿主那套「按 schema 生成表单」在这一版
     * **没有渲染方**（`devfront` 记-15 真机扫过），所以各插件的卡片都自带一条 GET/POST 路由
     * （tty / docker / devfront 同款）。
     *
     * - GET：卡片渲染用的快照（`configSnapshotFrom(live)`；目标是全量只读展示，含两档能力的
     *   **当前授权状态**）；
     * - POST：走**官方持久化通道** `settings.update(entryId, patch)` 写 volatile 字段 →
     *   loader 广播 → 本插件的 `applySection` 热应用（不重启）。没有 settings 服务时退化成
     *   「只在本进程套用」，并**在响应里如实标注 `persisted: false`**——不假装写进去了。
     *
     * `/config` 不受「插件停用」影响（与 tty / docker / devfront 同口径）：卡片是重新启用插件的
     * 唯一 UI 入口。
     */
    ctx.inject(['webServer'], (webCtx: Context) => {
      webCtx.effect(() => {
        const webServer = (webCtx as unknown as { webServer?: { register(route: unknown): () => void } }).webServer
        if (webServer === undefined) return () => {}
        /** 一次卡片变更的审计（被拒的与成功的都走它；写不进去就让它抛——fail-closed）。 */
        const recordCardAudit = (action: string, allowed: boolean, code?: string): void => {
          auditSink().record({
            at: Date.now(),
            targetId: 'card',
            action,
            allowed,
            ...(code === undefined ? {} : { code }),
          })
        }
        return webServer.register({
          kind: 'exact',
          path: '/api/dsh-devdata/config',
          handler: async (req: ReqLike & AsyncIterable<Uint8Array>, res: ResLike) => {
            /*
             * 围栏：**只放回环 + 强来源判据**（`isLoopbackRequestStrict`，与 tty / docker /
             * devfront 的 `gateRoute` 同一套）。`POST /config` **刻意不额外要求
             * `hasSameOriginProof`**：卡片是插件被停用后唯一的恢复入口，而跨站请求已由上面那道
             * 围栏的 `sec-fetch-site: cross-site` 与 Origin 比对拦掉。
             */
            if (!(await isLoopbackRequestStrict(req))) {
              writeJson(res, 403, { error: 'forbidden: loopback-only' })
              return
            }
            // `hasSameOriginProof` 在这里只用于**诊断日志**：真正的判据是上面那道围栏。
            if (req.method === 'POST' && !hasSameOriginProof(req)) {
              ctx.logger.warn('[dsh-devdata] /config 的 POST 没带同源证明（回环已放行，按恢复入口口径继续）')
            }
            if (req.method === 'GET') {
              writeJson(res, 200, { ok: true, config: configSnapshotFrom(live), persisted: settingsScopeRef !== undefined })
              return
            }
            if (req.method !== 'POST') {
              writeJson(res, 405, { error: `method not allowed: ${String(req.method)}` })
              return
            }
            const body = await readJsonBody(req)
            if (body === undefined) {
              writeJson(res, 400, { error: 'invalid JSON body' })
              return
            }
            const normalized = normalizeCardPatch(body)
            if ('error' in normalized) {
              /*
               * **被拒的尝试也进审计**（与工具面同一口径）。写不进去就让它抛：审计是这条路径的
               * 前提，坏了就该响（而不是安静地放行一次没记下来的变更）。
               */
              recordCardAudit('config.save', false, normalized.code)
              writeJson(res, 400, {
                error: normalized.error,
                ...(normalized.code === undefined ? {} : { code: normalized.code }),
              })
              return
            }
            /*
             * 改目标时把**原有的能力声明**按 id 带回来：写入路径不许出现能力字段（那是免重启
             * 提权口），而「替换整份 targets」会顺手把声明抹掉——见 `preserveCapabilities`。
             */
            const patch =
              Array.isArray(normalized.patch.targets) && normalized.patch.targets.every(isPlainRow)
                ? { ...normalized.patch, targets: preserveCapabilities(normalized.patch.targets, live.targets) }
                : normalized.patch
            const scope = settingsScopeRef
            if (scope !== undefined) {
              try {
                await scope.update(patch)
              } catch (error) {
                recordCardAudit('config.save', false, 'PERSIST_FAILED')
                writeJson(res, 500, { error: `保存配置失败：${error instanceof Error ? error.message : String(error)}` })
                return
              }
              /*
               * 优先用 settings 的**已解析值**（含非 volatile 字段与组合后的层），拿不到才退回
               * 「最近一次原始 section + patch」。**不能只退回后者**：见 `rawSectionRef` 的注释
               * （真机验收抓到过：保存一个标量把目标整批抹掉）。
               */
              const resolved = scope.get()
              if (Object.keys(resolved).length > 0) applySection(resolved)
              else applySection(mergeSection(rawSectionRef, patch))
            } else {
              applySection(mergeSection(rawSectionRef, patch))
            }
            // 成功的变更也进审计：目标声明（影响「能在哪些目标上动手」）与标量分开记。
            recordCardAudit(patch.targets === undefined ? 'config.scalars' : 'config.targets', true)
            writeJson(res, 200, { ok: true, config: configSnapshotFrom(live), persisted: scope !== undefined })
          },
        })
      }, 'dsh-devdata: config route')
    })

    ctx.effect(() => {
      return () => {
        disposeTools()
        if (announcementDispose !== undefined) {
          try {
            announcementDispose()
          } catch {
            /* 已注销 */
          }
          announcementDispose = undefined
        }
      }
    }, 'dsh-devdata: cleanup')

    // 挂载行走 stdout：运维就是**在启动日志里找这一行**确认插件挂上了（本仓其余插件的约定）。
    console.log(
      `[dsh-devdata] mounted (enabled=${String(live.enabled)}, targets=${String(live.targets.length)}, audit=${live.auditFile === '' ? 'log-only' : 'jsonl'}, engines=${servedEngines().join('/')})`,
    )
  },
})

export const { name, inject, apply } = plugin
