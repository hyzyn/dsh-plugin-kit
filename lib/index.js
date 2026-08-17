/**
 * dsh-plugin-kit — 全家桶根 bundle 的插件体（与 packages/all 同构）：
 * 无宿主逻辑，仅作为 bundle patch 载体与依赖伞。安装根包 = 挂载仓库内
 * 全部插件（见根 cordis.patch.yml，由 `pnpm aggregate` 自动生成）。
 */
export const name = 'dsh-plugin-kit'
export const inject = []
export function apply() {}
