/**
 * @hyzyn/dsh-loglens — 宿主半体（**骨架**）。
 *
 * P0-乙 只把包与它的形状立起来：现在的 `apply()` 只证明插件能在宿主里挂载。
 * 契约（归一化行模型 / `LogCounts` / `Truncation` / 出站围栏）见 packages/loglens/docs/design.md，
 * 分期见 packages/loglens/ROADMAP.md——**别在这里提前实现后端适配器**，那是 P1/P2/P4 的事。
 */
import type { Context } from '@deepseek-ai/cordis'
import { definePlugin, dshHome, getService } from '@hyzyn/dsh-kit'

export interface Config {
  /** 挂载时打印一行日志（默认开）。 */
  announce?: boolean
}

const plugin = definePlugin<Config>({
  name: 'loglens',
  inject: [],
  apply(ctx: Context, config?: Config) {
    if (config?.announce === false) return
    // 取宿主服务用 kit 的 getService：先 ctx.get(name)，未注册再回退属性访问；
    // 真实插件会换成 webServer / credentials / tools 等（也可声明式 inject）。
    const tools = getService(ctx, 'tools')
    // 配置目录统一由 dshHome() 推导（DSH_HOME 优先，否则 ~/.dsh），不要自己拼路径。
    const home = dshHome()
    console.log(`[dsh-loglens] mounted（home=${home}，tools ${tools === undefined ? '未就绪' : '已就绪'}）`)
  },
})

export const { name, inject, apply } = plugin