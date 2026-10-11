/**
 * @hyzyn/dsh-loglens — 宿主半体。
 *
 * 当前落地范围**只有来源清单与开关**：/api/dsh-loglens/config 的读写，供设置卡片
 * 增删改「日志来源」（Loki / Elasticsearch / OpenSearch / Docker）。查询能力（后端
 * 适配器、agent 工具、浏览器视图）**还没有**——那是 P1 起的事，见本包的 docs/design.md
 * 与 ROADMAP.md，卡片上也如实写着这一句。
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
import type { LoglensConfig } from './config.js'
import { LOGLENS_TIER_CLASS, LOGLENS_TIER_PREFIXES, backendFor, registerLoglensTools } from './tools.js'

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
export function makeRoutes(state: {
  read: () => LoglensConfig
  write: (next: LoglensConfig) => Promise<string | undefined>
}): Route[] {
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
        if (sub !== '/config') {
          writeJson(res, 404, { error: '未知路由：' + sub })
          return
        }
        if (req.method === 'GET') {
          writeJson(res, 200, { ok: true, config: state.read() })
          return
        }
        if (req.method !== 'POST') {
          writeJson(res, 405, { error: '只支持 GET / POST，收到 ' + String(req.method) })
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
        writeJson(res, 200, { ok: true, config: next, ...(warning === undefined ? {} : { warning }) })
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
        const disposers = makeRoutes({ read: () => live, write: persist }).map((route) => server.register(route))
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
