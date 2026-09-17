/**
 * @hyzyn/dsh-search — 设置面板目录（`PANEL_DIRECTORY`）的回归测试。
 *
 * 真机（Windows 11 ARM64）上测出来的缺陷：目录里六个插件卡片都带 `registryName`
 * 门禁，**唯独漏了 docker** —— 于是全局搜索里搜「Docker」找不到那张卡片，而插件
 * 明明装着（settings 命名空间 `docker` 已在册）。
 *
 * 这里同时钉住两侧：装了 docker 要在目录里；没装就不该出现（门禁仍然有效）。
 */
import { describe, expect, it } from 'vitest'

import { apply } from '../src/index.js'

interface FakeRoute {
  kind: string
  path: string
  handler: (req: unknown, res: unknown) => Promise<void>
}

/** 最小假宿主：只需要 webServer.register 与 registry.values()。 */
function mount(loadedRegistryNames: string[]): Map<string, FakeRoute> {
  const routes = new Map<string, FakeRoute>()
  const makeChild = (names: string[]): Record<string, unknown> => {
    const child: Record<string, unknown> = {
      effect: (callback: () => unknown) => {
        callback()
        return () => {}
      },
      inject: (childNames: string[], cb: (ctx: unknown) => void) => {
        cb(makeChild(childNames))
        return () => {}
      },
      events: { on: () => () => {} },
      on: () => () => {},
    }
    if (names.includes('webServer')) {
      child.webServer = {
        register: (route: FakeRoute) => {
          routes.set(route.path, route)
          return () => {}
        },
      }
    }
    if (names.includes('systemPrompt')) child.systemPrompt = { section: () => () => {} }
    return child
  }
  const root = makeChild([])
  root.inject = (names: string[], cb: (ctx: unknown) => void) => {
    cb(makeChild(names))
    return () => {}
  }
  // 已加载的 settings 注册名（`registryName` 门禁就是按它判的）
  root.registry = { values: () => loadedRegistryNames.map((name) => ({ name })) }
  ;(apply as unknown as (ctx: unknown, config: unknown) => void)(root, { enabled: true, announceToAgent: false })
  return routes
}

async function catalog(routes: Map<string, FakeRoute>): Promise<Array<{ id: string; name: string }>> {
  const route = routes.get('/api/dsh-search/catalog')
  if (route === undefined) throw new Error('未注册 /api/dsh-search/catalog')
  let text
  await route.handler(
    {
      method: 'GET',
      url: '/api/dsh-search/catalog',
      headers: { host: '127.0.0.1:3092' },
      socket: { remoteAddress: '127.0.0.1' },
      async *[Symbol.asyncIterator]() {},
    },
    {
      writeHead: () => {},
      end: (value: string) => {
        text = value
      },
    },
  )
  return JSON.parse(String(text)).panels
}

const ALL_PLUGIN_REGISTRATIONS = [
  'codegraph',
  'docker',
  'env-manager',
  'mcp-config',
  'profile-manager',
  'prompt-manager',
  'rss-digest',
]

describe('search 的面板目录：registryName 门禁', () => {
  it('装了 docker 时，Docker 容器面板出现在目录里（原来漏了）', async () => {
    const panels = await catalog(mount(ALL_PLUGIN_REGISTRATIONS))
    const docker = panels.find((panel) => panel.id === 'docker')
    expect(docker, 'Docker 卡片应在目录里').toBeDefined()
    expect(docker?.name).toBe('Docker 容器面板')
  })

  it('六个插件卡片全都在（docker 不再缺席）', async () => {
    const panels = await catalog(mount(ALL_PLUGIN_REGISTRATIONS))
    const ids = panels.map((panel) => panel.id)
    for (const id of ['codegraph', 'docker', 'env-manager', 'mcp-config', 'profile-manager', 'prompt-manager', 'rss-digest']) {
      expect(ids, `${id} 应在目录里`).toContain(id)
    }
  })

  it('没装 docker 时目录里不该出现它（门禁仍然有效）', async () => {
    const panels = await catalog(mount(ALL_PLUGIN_REGISTRATIONS.filter((name) => name !== 'docker')))
    expect(panels.map((panel) => panel.id)).not.toContain('docker')
  })

  it('无 registryName 的一级大类/核心卡片始终在（不受注册表影响）', async () => {
    const panels = await catalog(mount([]))
    const ids = panels.map((panel) => panel.id)
    expect(ids).toContain('s-general')
    expect(ids).toContain('terminal')
  })
})
