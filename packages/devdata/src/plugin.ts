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
 * 5. **能力授权只认宿主侧通道**（`bindCapabilitySources` 在 `apply` 期绑定一次）——本套件今天
 *    没有客户端半体，所以没有就地提权通道，文案也不提它（见 `adjudicate.ts` 的同名注释）。
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
  plainConfig,
  settingsEntryScope,
} from '@hyzyn/dsh-kit'
import type { CapabilitySpec } from '@hyzyn/dsh-kit'

import { credentialStatus, snapshotTarget, type DevDataTarget } from './adjudicate.js'
import { createJsonlAuditSink, createLoggerAuditSink, type AuditLoggerLike } from './audit.js'
import { entryTools, unionEntryTools } from './entries.js'
import { envFacts, normalizeEnv } from './env.js'
import { neverActions, matrixFor, type Engine } from './operations.js'
import {
  DEFAULT_SCAN_COUNT,
  DEFAULT_TIMEOUT_MS,
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

/** 宿主半体。 */
const plugin = definePlugin<Config>({
  name: 'devdata',
  inject: ['tools'],
  apply(ctx: Context, rawConfig?: Config) {
    /** 当前生效的配置（volatile 字段被就地改写后靠重算取回来，见 `applySection`）。 */
    let live: LiveConfig = normalizeConfig(plainConfig((rawConfig ?? {}) as Config) as unknown as Record<string, unknown>)
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
     * **不传 GrantStore**：本套件今天没有客户端半体，也就没有就地提权通道——传一个空存储只会让
     * 文案与事实分家。等 P14 的面板落地并真的接上它，再加。
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
        applySection(scope.get())
        const off = scope.onChanged(() => applySection(scope.get()))
        return () => off()
      }, 'dsh-devdata: settings')
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
