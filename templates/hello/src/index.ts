/**
 * @hyzyn/dsh-hello — dsh-plugin-kit 的最小 host 插件模板。
 * 覆盖：dsh.bundle.patch manifest、cordis.patch.yml 行、{ name, inject, apply }
 * 导出形状、kit 共享工具用法与 tsc 构建配置。新插件以本目录为蓝本
 * （pnpm create-plugin）。
 */
import type { Context } from '@deepseek-ai/cordis'
import { definePlugin, dshHome, getService } from '@hyzyn/dsh-kit'

export interface Config {
  /** 挂载时打印一行日志（默认开）。 */
  announce?: boolean
}

const plugin = definePlugin<Config>({
  name: 'hello',
  inject: [],
  apply(ctx: Context, config?: Config) {
    if (config?.announce === false) return
    // 取宿主服务用 kit 的 getService：先 ctx.get(name)，未注册再回退属性访问；
    // 真实插件可以换成 tools / webServer / sessionQuery 等（也可声明式 inject）。
    const tools = getService(ctx, 'tools')
    // 配置目录统一由 dshHome() 推导（DSH_HOME 优先，否则 ~/.dsh），不要自己拼路径。
    const home = dshHome()
    console.log(`[dsh-plugin-kit/hello] mounted（home=${home}，tools ${tools === undefined ? '未就绪' : '已就绪'}）`)
  },
})

export const { name, inject, apply } = plugin
