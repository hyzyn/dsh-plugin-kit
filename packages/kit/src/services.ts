/**
 * @hyzyn/dsh-kit — 宿主服务读取与 DSH 目录推导。
 *
 * 这两个函数在仓库各插件的 src/index.ts 里原本各有 8 处上下逐字重复的实现
 * （getService 9 处、dshHome 8 处），收敛到 kit 后新插件不必再抄一遍，也避免
 * 副本各自漂移——尤其 dshHome 推导的是同一份配置目录，路径必须一致。
 */
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'

/**
 * 读取宿主服务：先走 ctx.get(name)（cordis 4 的服务读取入口，未注册返回
 * undefined），拿不到再回退属性访问 ctx[name]（部分宿主版本 / 插件直接往
 * ctx 上挂属性）。语义照抄 packages/search/src/index.ts:801-808 的同名实现，
 * 包括「get 返回 undefined 才回退」这一细节：服务真值可能是 undefined 以外
 * 的 falsy 值（false / 0 / ''），不能按 falsy 短路，否则会误判成未注册。
 */
export function getService(ctx: Context, name: string): unknown {
  const withGet = ctx as unknown as { get?: (service: string) => unknown }
  if (typeof withGet.get === 'function') {
    const value = withGet.get(name)
    if (value !== undefined) return value
  }
  return (ctx as unknown as Record<string, unknown>)[name]
}

/**
 * DSH 主目录：DSH_HOME 环境变量优先（trim 后为空视为未设置），否则 ~/.dsh。
 *
 * 用 homedir() 而非 process.env.HOME：Windows 上 HOME 常常未设置，homedir()
 * 走系统 API 更可靠；与全仓现有 8 处实现保持同一语义。
 */
export function dshHome(): string {
  return process.env.DSH_HOME?.trim() || join(homedir(), '.dsh')
}
