/**
 * @hyzyn/dsh-loglens — 宿主半体。
 *
 * 落地范围：`/api/dsh-loglens/{config,query,fields,facets}` 四条子路由（一个 prefix 路由内部分发）
 * ——设置卡片增删改「日志来源」（Loki / Elasticsearch / OpenSearch / Docker）、查日志、列字段、
 * 按字段分组 / 按时间分桶。查询能力的实现与判据全在 src/execute.ts，**与 agent 工具共用同一份**
 * （见本包的 docs/design.md）；本文件只管路由、围栏与「能力自述」的接线。
 *
 * 档位（维护者 2026-10-11 拍板）：进**加固档** isLoopbackRequestStrict；/config 按
 * **动作**豁免——enabled 不要同源证明（插件禁用后设置卡片是唯一的恢复入口），targets
 * 的增 / 删 / 改要 hasSameOriginProof。理由：跨站页面能从配置侧加一个指向内网的
 * target，再用本插件的读面打它，围栏就被绕穿了。这处不对称同步记在 docs/architecture.md
 * 的「一条请求经过什么」那节。
 */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import {
  attachTierGate,
  definePlugin,
  hasSameOriginProof,
  isLoopbackRequestStrict,
  originProofHint,
  plainConfig,
  readJsonBody,
  settingsEntryScope,
  writeJson,
} from '@hyzyn/dsh-kit'
import type { ReqLike, ResLike, SettingsEntryScope } from '@hyzyn/dsh-kit'
import { MAX_TARGETS, addTarget, normalizeConfig, removeTarget, updateTarget } from './config.js'
import type { LoglensConfig, SourceKind } from './config.js'
import { backendFor } from './backends/registry.js'
import type { LogBackend } from './backends/types.js'
import { runFacets, runFields, runSearch } from './execute.js'
import { dockerPluginLoaded } from './plugins.js'
import { LOGLENS_TIER_CLASS, LOGLENS_TIER_PREFIXES, registerLoglensTools } from './tools.js'

/** 本插件的路由前缀（一个 prefix 路由内部按子路径分发，与 docker / tty 同款）。 */
export const ROUTE_PREFIX = '/api/dsh-loglens'

/** 配置面能做的动作白名单：不认识的动作一律 400，绝不「照单全收」后静默丢掉。 */
export const CONFIG_ACTIONS: readonly string[] = ['enabled', 'targets.add', 'targets.update', 'targets.remove']

/** 配置形状（apply 的入参；volatile 字段经 schema 解析后是取值的冻结引用）。 */
export interface Config {
  enabled?: boolean
  announce?: boolean
  targets?: unknown[]
}

/**
 * 运行时 Config schema——DSH ≥0.1.7 起它同时就是本插件的 settings 存储。
 *
 * 全部字段标 volatile：它们是卡片可改项，而 settings.update(entryId, patch) 只接受
 * volatile 路径；loader 对 volatile-only 变更原地更新配置引用并发 loader 的配置变更
 * 事件，**不重挂插件**，插件订阅后自己重读（见 kit 的 settings 适配层）。
 */
export const Config: z = z.object({
  enabled: z.boolean().default(true).volatile(),
  announce: z.boolean().default(true).volatile(),
  targets: z.array(z.object({
    id: z.string().default(''),
    kind: z.string().default('loki'),
    label: z.string().default(''),
    url: z.string().default(''),
  })).default([]).volatile(),
})

/** 一条路由：本插件只注册一个 prefix 路由，内部按子路径分发。 */
interface Route {
  kind: 'prefix'
  path: string
  handler: (req: ReqLike & AsyncIterable<Uint8Array>, res: ResLike) => void | Promise<void>
}

/**
 * 构造 /config 的读写路由。
 *
 * read 取当前生效配置、write 落盘（并更新内存里的那一份）。两者都由 apply 注入，
 * 于是路由本身没有状态，用例可以直接喂假实现——回环围栏 / 动作白名单 / 同源证明
 * 三条判据都能在不起宿主的前提下验（见 test/loglens.test.ts）。
 */
/** 面板那三条路由要用到的状态：读配置、落盘、执行一次查询 / 列字段（都由 apply 注入）。 */
export interface RouteState {
  read: () => LoglensConfig
  write: (next: LoglensConfig) => Promise<string | undefined>
  /** 执行一次查询（面板那条路）：与 agent 工具共用 src/execute.ts，不另写一份判据。 */
  runQuery: (input: Record<string, unknown>) => Promise<Record<string, unknown>>
  /** 列字段（面板的「有哪些字段」）。 */
  runFields: (input: Record<string, unknown>) => Promise<Record<string, unknown>>
  /**
   * 聚合（按字段分组 / 按时间分桶）。工具面是 `loglens_facets`；面板用它画「时间分布」直方图
   * （2026-10-12 接上，见 client-src 的 `loadHistogram`）——**同一份执行层**，不另写判据。
   */
  runFacets: (input: Record<string, unknown>) => Promise<Record<string, unknown>>
  /**
   * Docker 容器面板装没装（panel 用它决定给不给「容器日志」那半格）。
   * 判据是 cordis 的 plugin registry，见 src/plugins.ts——**不是** tools 服务（它没有列举 API）。
   */
  dockerLoaded: () => boolean
  /**
   * kind → 适配器。**必须与执行层用的是同一个函数**（插件里传的就是 `executeDeps.backendFor`）：
   * 能力自述要描述**真正跑的那个后端**，否则面板会照着一个跟实际不一样的名单去画分布。
   */
  backendFor: (kind: SourceKind) => LogBackend | undefined
}

/**
 * 查询响应里带上这条来源的**能力**：面板据此决定画不画「时间分布」（直方图）。
 *
 * **为什么不放 `/config`**：能力是**运行期事实**（来自适配器的 `capabilities()`），不是设置项；
 * 而且它跟着**这一次查询**回来，正好是画分布所需要的时机（分布本来也只对这一次的窗口有意义）。
 *
 * **为什么不让面板按 `kind` 自己判**：那等于把「谁能聚合」抄成第二份判据——Loki 接上 LogQL
 * 指标查询的那天，抄的那份会**静默过期**，而这一位正是「不给一个永远报错的入口」所依赖的东西。
 * 所以只由宿主算、随响应下发。
 */
function capabilitiesOf(state: RouteState, outcome: Record<string, unknown>): Record<string, unknown> | undefined {
  const target = outcome.target
  const kind = target !== null && typeof target === 'object' ? (target as { kind?: unknown }).kind : undefined
  if (typeof kind !== 'string') return undefined
  const backend = state.backendFor(kind as SourceKind)
  if (backend === undefined) return undefined
  const caps = backend.capabilities()
  return {
    queryLanguage: caps.queryLanguage,
    pagination: caps.pagination,
    follow: caps.follow,
    aggregations: caps.aggregations,
  }
}

/**
 * 构造面板用的四条路由：`/config`（读写）、`/query`（查）、`/fields`（列字段）、`/facets`（分组 / 分桶）。
 *
 * 围栏（设计 §4）：整条路由走**加固档** `isLoopbackRequestStrict`；`/config` 按**动作**豁免——
 * 只有 `enabled` 免同源证明（禁用后设置卡片是唯一的恢复入口）。**`/query` 与 `/fields` 要同源证明**：
 * 它们虽然只读，却会**替请求方打到已配置的内网目标**并把结果带回来——跨站页面能借它读内网
 * （设计 §4.3 那句「再从配置侧加一个指向内网的 target，用读面打它」的「读面」正是这里）。
 * 插件禁用时四条路由里**只留 `/config`**（设置卡片靠它渲染，也是唯一的恢复入口）。
 */
export function makeRoutes(state: RouteState): Route[] {
  return [
    {
      kind: 'prefix',
      path: ROUTE_PREFIX,
      handler: async (req, res) => {
        // 加固档围栏：字面量回环同步判定（保住「第一拍就写响应」的时序），别名主机名才等 DNS。
        const loopback = isLoopbackRequestStrict(req)
        const allowed = loopback instanceof Promise ? await loopback : loopback
        if (!allowed) {
          writeJson(res, 403, { error: '仅允许本机回环访问' })
          return
        }
        const sub = new URL(req.url ?? '/', 'http://loopback').pathname.slice(ROUTE_PREFIX.length)
        if (sub !== '/config' && sub !== '/query' && sub !== '/fields' && sub !== '/facets') {
          writeJson(res, 404, { error: '未知路由：' + sub })
          return
        }
        const config = state.read()
        if (req.method === 'GET') {
          if (sub !== '/config') {
            writeJson(res, 405, { error: '只支持 POST，收到 ' + String(req.method) })
            return
          }
          writeJson(res, 200, { ok: true, config, plugins: { docker: state.dockerLoaded() } })
          return
        }
        if (req.method !== 'POST') {
          writeJson(res, 405, { error: '只支持 GET / POST，收到 ' + String(req.method) })
          return
        }
        if (!config.enabled && sub !== '/config') {
          writeJson(res, 403, { error: '插件已禁用（设置 → 插件配置 → 日志查询 → 启用插件）' })
          return
        }
        if (sub === '/query' || sub === '/fields' || sub === '/facets') {
          // 只读但会替请求方打到内网目标：要同源证明（见函数头）
          if (!hasSameOriginProof(req)) {
            writeJson(res, 403, { error: '缺少同源证明（' + originProofHint(req) + '）' })
            return
          }
          const payload = await readJsonBody(req)
          if (payload === undefined) {
            writeJson(res, 400, { error: '请求体不是合法的 JSON 对象' })
            return
          }
          try {
            const outcome = sub === '/query'
              ? await state.runQuery(payload)
              : sub === '/fields' ? await state.runFields(payload) : await state.runFacets(payload)
            // 只有 /query 带能力自述：面板拿它决定画不画「时间分布」（见 capabilitiesOf 的注释）。
            const caps = sub === '/query' ? capabilitiesOf(state, outcome) : undefined
            writeJson(res, 200, { ok: true, ...outcome, ...(caps === undefined ? {} : { capabilities: caps }) })
          } catch (error) {
            // 校验失败与后端报错都回 400 + 原话（面板要把「下一步怎么做」显示出来）
            writeJson(res, 400, { error: error instanceof Error ? error.message : String(error) })
          }
          return
        }
        const body = await readJsonBody(req)
        if (body === undefined) {
          // 空 body / 非法 JSON / 顶层不是对象：一律 400（与 kit 的 readJsonBody 口径一致）
          writeJson(res, 400, { error: '请求体不是合法的 JSON 对象' })
          return
        }
        const action = typeof body.action === 'string' ? body.action : ''
        if (!CONFIG_ACTIONS.includes(action)) {
          writeJson(res, 400, { error: '未知动作：' + JSON.stringify(action) + '（支持 ' + CONFIG_ACTIONS.join(' / ') + '）' })
          return
        }
        // 按动作豁免：enabled 是「禁用后唯一的恢复入口」，其余动作要有同源证明。
        if (action !== 'enabled' && !hasSameOriginProof(req)) {
          writeJson(res, 403, { error: '缺少同源证明（' + originProofHint(req) + '）' })
          return
        }
        const current = state.read()
        let next: LoglensConfig
        if (action === 'enabled') {
          if (typeof body.enabled !== 'boolean') {
            writeJson(res, 400, { error: 'enabled 必须是布尔值' })
            return
          }
          next = { ...current, enabled: body.enabled }
        } else if (action === 'targets.add') {
          const outcome = addTarget(current, body.target)
          if (!outcome.ok) {
            writeJson(res, 400, { error: outcome.error })
            return
          }
          next = outcome.config
        } else if (action === 'targets.update') {
          const outcome = updateTarget(current, body.id, body.patch)
          if (!outcome.ok) {
            writeJson(res, 400, { error: outcome.error })
            return
          }
          next = outcome.config
        } else {
          const outcome = removeTarget(current, body.id)
          if (!outcome.ok) {
            writeJson(res, 400, { error: outcome.error })
            return
          }
          next = outcome.config
        }
        const warning = await state.write(next)
        writeJson(res, 200, { ok: true, config: next, plugins: { docker: state.dockerLoaded() }, ...(warning === undefined ? {} : { warning }) })
      },
    },
  ]
}

const plugin = definePlugin<Config>({
  name: 'loglens',
  inject: [],
  apply(ctx: Context, rawConfig?: Config) {
    // volatile 字段解析后是取值的冻结引用，先还原成纯数据（见 @hyzyn/dsh-kit 的 plainConfig）。
    const config = plainConfig((rawConfig ?? {}) as Config)
    let live = normalizeConfig(config).config
    const scope: SettingsEntryScope | undefined = settingsEntryScope(ctx, 'loglens')

    /*
     * 卡片写的就是 volatile 字段：loader 原地更新配置引用并发一条配置变更事件，
     * 这里重读一次即可——插件不重挂，所以「内存里的那一份」必须自己跟上。
     */
    if (scope !== undefined) {
      ctx.effect(() => scope.onChanged(() => {
        live = normalizeConfig(scope.get()).config
      }), 'dsh-loglens: settings sync')
    }

    /** 落盘并把内存那一份换掉；没有 settings 服务时如实回报「只在本次进程内有效」。 */
    async function persist(next: LoglensConfig): Promise<string | undefined> {
      live = next
      // 启用 / 停用的热生效：工具与档位闸跟着走（禁用时一个工具都不注册）
      refreshTools()
      if (scope === undefined) return '宿主没有 settings 服务，改动只在本次进程内有效'
      try {
        await scope.update({ enabled: next.enabled, targets: next.targets })
        return undefined
      } catch (error) {
        return '写入 profile 配置失败：' + (error instanceof Error ? error.message : String(error))
      }
    }

    /*
     * agent 工具（P3）：只在插件启用时注册，禁用热生效时随 effect 一起撤下。工具读配置走闭包里的
     * live，所以改来源清单不必重注册；只有 enabled 翻转才需要 rebuild（persist 会调 refreshTools）。
     * 档位闸与工具**同生命周期**（方案见 docs/permission-tier-plan.md 的 loglens 表）。
     */
    let refreshTools: () => void = () => {}
    ctx.inject(['tools'], (toolsCtx: Context) => {
      toolsCtx.effect(() => {
        let dispose: (() => void) | undefined
        const rebuild = (): void => {
          if (dispose !== undefined) {
            try {
              dispose()
            } catch {
              /* 工具已注销 */
            }
            dispose = undefined
          }
          if (!live.enabled) return
          const tools = (toolsCtx as unknown as { tools: { register(definition: unknown): () => void } }).tools
          const disposers: Array<() => void> = []
          const failures: string[] = []
          registerLoglensTools({
            config: () => live,
            backendFor,
            dockerLoaded: () => dockerPluginLoaded(ctx),
            add: (name, definition) => {
              try {
                disposers.push(tools.register(definition))
              } catch (error) {
                failures.push(name + '：' + (error instanceof Error ? error.message : String(error)))
              }
            },
          })
          disposers.push(attachTierGate(ctx, {
            pkg: 'loglens',
            prefixes: LOGLENS_TIER_PREFIXES,
            classify: (tool) => LOGLENS_TIER_CLASS[tool],
          }))
          if (failures.length > 0) {
            console.warn('[dsh-loglens] ' + String(failures.length) + ' 个 agent 工具注册失败：' + failures.join('；'))
          }
          dispose = () => {
            for (const item of disposers) {
              try {
                item()
              } catch {
                /* 释放失败不阻塞 */
              }
            }
          }
        }
        rebuild()
        refreshTools = rebuild
        return () => {
          refreshTools = () => {}
          if (dispose !== undefined) {
            try {
              dispose()
            } catch {
              /* 释放失败不阻塞 */
            }
          }
        }
      }, 'dsh-loglens: tools')
    })

    ctx.inject(['webServer'], (webCtx: Context) => {
      webCtx.effect(() => {
        const server = (webCtx as unknown as { webServer: { register(route: Route): () => void } }).webServer
        const executeDeps = { config: () => live, backendFor }
        const disposers = makeRoutes({
          read: () => live,
          write: persist,
          runQuery: (input) => runSearch(executeDeps, input),
          runFields: (input) => runFields(executeDeps, input),
          runFacets: (input) => runFacets(executeDeps, input),
          dockerLoaded: () => dockerPluginLoaded(ctx),
          backendFor,
        }).map((route) => server.register(route))
        return () => {
          for (const dispose of disposers) {
            try {
              dispose()
            } catch {
              /* 释放失败不阻塞 */
            }
          }
        }
      }, 'dsh-loglens: routes')
    })

    if (config.announce !== false) {
      console.log('[dsh-loglens] mounted（来源 ' + String(live.targets.length) + ' / ' + String(MAX_TARGETS) + '，查询能力尚未实现）')
    }
  },
})

export const { name, inject, apply } = plugin
