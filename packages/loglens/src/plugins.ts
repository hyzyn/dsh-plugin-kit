/**
 * @hyzyn/dsh-loglens — 「某个插件装没装」的宿主侧判据。
 *
 * 判据是 **cordis 的 plugin registry**（`ctx.registry.values()` 的 runtime.name），不是 tools 服务：
 * 后者**没有**公开的列举 API（实测 @deepseek-ai/dsh-tools@0.1.2-rc.1 的 `ctx.tools` 只有
 * register / restrict / guard）——所以「docker 插件在不在」只能这么问。先例是 search 的
 * src/index.ts 里那个  `getLoadedRegistryNames`（它按同一份 registry
 * 过滤设置面板清单），本模块与它同一口径：**枚举失败一律当「没装」**，绝不让它把插件带下去。
 *
 * 为什么这条判据重要：Docker 目标在面板里走的是**它的** `/api/dsh-docker/logs`（设计 §5 选项 0 的
 * 面板半格）。装了才该给入口；没装就该说清「装上它这条路才有」，而不是留一个按下去 404 的按钮。
 */
import type { Context } from '@deepseek-ai/cordis'

/** 当前 profile 里已加载的插件名集合（枚举失败返回空集：宁可说「没装」，也不谎报「装了」）。 */
export function loadedPluginNames(ctx: Context): Set<string> {
  const names = new Set<string>()
  try {
    const registry = (ctx as unknown as { registry?: { values?(): Iterable<{ name?: string }> } }).registry
    if (registry?.values !== undefined) {
      for (const runtime of registry.values()) {
        if (typeof runtime.name === 'string' && runtime.name !== '') names.add(runtime.name)
      }
    }
  } catch {
    /* registry 枚举失败不阻塞 */
  }
  return names
}

/** Docker 容器面板（本仓的 `@hyzyn/dsh-docker`）在不在。 */
export function dockerPluginLoaded(ctx: Context): boolean {
  return loadedPluginNames(ctx).has('docker')
}
