/**
 * @hyzyn/dsh-kit — dsh-plugin-kit 插件开发工具包。
 * 仅提供与 DSH SDK 正交的类型助手，不包含任何运行时行为。
 */
import type { Context } from '@deepseek-ai/cordis';
/** 插件配置的宽类型：任意对象。 */
export type PluginConfig = object;
/** 一个 DSH 插件对象：与 cordis.patch.yml 中 insert 行的 id 一一对应。 */
export interface DshPlugin<C extends PluginConfig = PluginConfig> {
    /** 稳定插件 id：等于 cordis.patch.yml 中 insert 行的 id。 */
    name: string;
    /** apply 挂载前必须就绪的宿主服务名（对应 ctx.<name> 注入）。 */
    inject?: string[];
    /** 挂载插件。config 为经 schema 解析后的配置。 */
    apply(ctx: Context, config?: C): void;
}
/**
 * 类型化身份函数：让插件对象获得 DshPlugin<C> 的精确类型与统一形状。
 * 不改变任何运行时行为。
 */
export declare function definePlugin<C extends PluginConfig = PluginConfig>(plugin: DshPlugin<C>): DshPlugin<C>;
