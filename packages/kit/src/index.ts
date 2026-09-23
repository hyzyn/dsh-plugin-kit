/**
 * @hyzyn/dsh-kit — dsh-plugin-kit 插件开发工具包。
 *
 * 两部分内容：
 *   - 与 DSH SDK 正交的类型助手（definePlugin / DshPlugin / PluginConfig）；
 *   - 宿主半体的共享工具库：服务读取与 DSH 目录（services）、HTTP 路由围栏与
 *     响应（http）、!!js 表达式方言（js-expr）、通用托管区块读写（managed-block）、
 *     子进程输出编码容错解码（decode）、Windows `.cmd` shim 启动与转义
 *     （windows-shim）、DSH ≥0.1.7 的 settings 存储适配（settings）。
 * 全部为增量导出：0.2.0 的 definePlugin 等原样保留。
 */
import type { Context } from '@deepseek-ai/cordis'

/** 插件配置的宽类型：任意对象。 */
export type PluginConfig = object

/** 一个 DSH 插件对象：与 cordis.patch.yml 中 insert 行的 id 一一对应。 */
export interface DshPlugin<C extends PluginConfig = PluginConfig> {
  /** 稳定插件 id：等于 cordis.patch.yml 中 insert 行的 id。 */
  name: string
  /** apply 挂载前必须就绪的宿主服务名（对应 ctx.<name> 注入）。 */
  inject?: string[]
  /** 挂载插件。config 为经 schema 解析后的配置。 */
  apply(ctx: Context, config?: C): void
}

/**
 * 类型化身份函数：让插件对象获得 DshPlugin<C> 的精确类型与统一形状。
 * 不改变任何运行时行为。
 */
export function definePlugin<C extends PluginConfig = PluginConfig>(
  plugin: DshPlugin<C>,
): DshPlugin<C> {
  return plugin
}

export * from './services.js'
export * from './settings.js'
export * from './http.js'
export * from './js-expr.js'
export * from './managed-block.js'
export * from './decode.js'
export * from './windows-shim.js'
