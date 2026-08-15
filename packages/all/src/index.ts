/**
 * @hyzyn/dsh-all — 聚合包自身插件体：无宿主逻辑，仅作为 bundle patch 载体
 * 与依赖伞（把仓库内全部插件的行插入 profile 阵容）。
 */
import type { Context } from '@deepseek-ai/cordis'

export const name = 'all'
export const inject = []
export function apply(_ctx: Context): void {}
