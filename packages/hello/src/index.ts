/**
 * @dsh-kit/hello — dsh-plugin-kit 的最小 host 插件模板。
 * 覆盖：dsh.bundle.patch manifest、cordis.patch.yml 行、{ name, inject, apply }
 * 导出形状与 tsc 构建配置。新插件以本目录为蓝本（pnpm create-plugin）。
 */
import type { Context } from '@deepseek-ai/cordis'
import { definePlugin } from '@dsh-kit/kit'

export interface Config {
  /** 挂载时打印一行日志（默认开）。 */
  announce?: boolean
}

const plugin = definePlugin<Config>({
  name: 'hello',
  inject: [],
  apply(ctx: Context, config?: Config) {
    if (config?.announce === false) return
    // 模板只演示挂载点；真实插件在这里从 ctx 取服务，例如：
    //   const tools = ctx.get('tools')
    // 或声明式注入（inject 数组 + ctx.<name>）：
    //   inject: ['tools', 'webServer'] → ctx.tools / ctx.webServer
    console.log('[dsh-plugin-kit/hello] mounted')
  },
})

export const { name, inject, apply } = plugin
