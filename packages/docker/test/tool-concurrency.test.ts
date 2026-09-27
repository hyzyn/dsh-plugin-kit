/**
 * @hyzyn/dsh-docker — 工具并发性声明的回归测试（项目级 ROADMAP 第 4 项）。
 *
 * 背景：宿主对**未声明** `isConcurrencySafe` 的工具一律按「独占」处理
 * （`dsh-tools/lib/index.js:3059` → `{ kind: 'exclusive' }`），于是 16 个 `docker_*`
 * 工具全被串行化——而其中 11 个是纯只读的列表 / 详情 / 快照，本可以并发。
 *
 * 这门测试的价值在**反向**：只读工具漏声明会静默退回独占（没人会报错，只是慢），
 * 而**变更**工具多声明一次就是真事故（两个 `docker_action` 并发跑）。所以两个方向
 * 都要钉：只读必须声明且恒真，变更必须**没有**声明。
 */
import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { apply } from '../src/index.js'

/*
 * 能力开关的**宿主侧授权**：这个文件测的是「授权之后开关照旧可用」（工具注册 / 路由放行），
 * 所以在这里模拟「宿主启动时就带了授权环境变量」。授权来源由每个用例的 `apply()` 重新绑定
 * （绑定即重采样，见 kit 的 bindCapabilitySources），所以变量在这里先设好即可。
 * `afterAll` 必须清掉：vitest 复用 worker 进程，环境变量会漏给后面的测试文件
 * （那会让「未授权」的用例在别的文件里静默变成已授权）。
 */
beforeAll(() => {
  process.env.DSH_DOCKER_ALLOW_MUTATIONS = '1'
  process.env.DSH_DOCKER_ALLOW_EXEC = '1'
})
afterAll(() => {
  delete process.env.DSH_DOCKER_ALLOW_MUTATIONS
  delete process.env.DSH_DOCKER_ALLOW_EXEC
})

/** 只读工具（列表 / 详情 / 快照）：与同轮其它调用并发执行。 */
const READ_ONLY = [
  'docker_targets',
  'docker_ps',
  'docker_attention',
  'docker_inspect',
  'docker_logs',
  'docker_stats',
  'docker_events',
  'docker_images',
  'docker_image_inspect',
  'docker_networks',
  'docker_volumes',
]

/** 变更工具（生命周期 / 删镜像 / 清理 / 拉取 / exec）：必须保持独占。 */
const MUTATING = ['docker_action', 'docker_image_remove', 'docker_image_prune', 'docker_image_pull', 'docker_exec']

interface FakeToolDef {
  name: string
  parameters?: { required?: string[]; properties?: Record<string, { type?: string | string[] }> }
  isConcurrencySafe?: (args: unknown) => boolean
}

/**
 * 从工具自己的 JSON Schema 造一份「过得了参数校验」的最小实参。
 *
 * 为什么必须这么做：`defineTool` 把 isConcurrencySafe 包了一层——
 * 参数校验不过就直接返回 false（`dsh-tools/lib/types/schema.js:347`）。拿 `{}` 去调
 * `docker_ps`（target 必填）只会拿到 false，看起来像「没声明」，其实是我们调错了。
 */
function minArgs(tool: FakeToolDef): Record<string, unknown> {
  const args: Record<string, unknown> = {}
  for (const key of tool.parameters?.required ?? []) {
    const type = tool.parameters?.properties?.[key]?.type
    const single = Array.isArray(type) ? type[0] : type
    args[key] = single === 'number' ? 1 : single === 'boolean' ? true : single === 'array' ? [] : '本机'
  }
  return args
}

/** 最小假 cordis ctx：只需要 tools / settings / webServer / systemPrompt 几个面。 */
function mountPlugin(): Map<string, FakeToolDef> {
  const registered: FakeToolDef[] = []
  const listeners = new Map<string, Array<() => void>>()
  const emitVolatile = (): void => {
    for (const listener of listeners.get('loader/volatile-update') ?? []) listener()
  }
  const makeChild = (names: string[]): Record<string, unknown> => {
    const on = (name: string, listener: () => void): (() => void) => {
      const list = listeners.get(name) ?? []
      list.push(listener)
      listeners.set(name, list)
      return () => {}
    }
    const child: Record<string, unknown> = {
      logger: { info: () => {}, warn: () => {} },
      effect: (callback: () => unknown) => {
        callback()
        return () => {}
      },
      inject: (childNames: string[], cb: (ctx: unknown) => void) => {
        cb(makeChild(childNames))
        return () => {}
      },
      on,
      events: { on },
    }
    if (names.includes('tools')) {
      child.tools = {
        register: (definition: FakeToolDef) => {
          registered.push(definition)
          return () => {}
        },
      }
    }
    if (names.includes('settings')) {
      child.settings = {
        describe: () => [{ ns: 'docker', value: { dockerBin: 'docker', targets: [{ name: '本机', kind: 'local' }], allowMutations: true, allowExec: true } }],
        update: async () => { emitVolatile() },
        configure: () => () => {},
      }
    }
    // HTTP 路由也在这条 apply 路径上注册，给个够用的假 webServer（本测试只看工具）
    if (names.includes('webServer')) {
      child.webServer = { register: () => () => {} }
    }
    if (names.includes('systemPrompt')) {
      child.systemPrompt = { section: () => () => {} }
    }
    return child
  }
  const root = makeChild([])
  root.inject = (names: string[], cb: (ctx: unknown) => void) => {
    cb(makeChild(names))
    return () => {}
  }
  // 两个开关都打开：16 个工具全部注册（只读的本来就不受开关约束）
  ;(apply as unknown as (ctx: unknown, config: unknown) => void)(root, {
    dockerBin: 'docker',
    allowMutations: true,
    allowExec: true,
    targets: [{ name: '本机', kind: 'local' }],
  })
  // 同一条 apply 路径在这套假 ctx 下会把自己的工具重注册一次（真实宿主里由 disposer 撤旧），
  // 按名字归并：这门测试关心的是「声明了什么」，不是「注册了几次」
  return new Map(registered.map((tool) => [tool.name, tool]))
}

describe('docker_* 工具的 isConcurrencySafe 声明', () => {
  it('只读工具全部声明为并发安全（否则静默退回独占，没人会报错、只是慢）', () => {
    const byName = mountPlugin()
    for (const name of READ_ONLY) {
      const tool = byName.get(name)
      expect(tool, `${name} 未注册`).toBeDefined()
      expect(typeof tool?.isConcurrencySafe, `${name} 未声明 isConcurrencySafe`).toBe('function')
      // 参数合法时恒真：宿主按 `=== true` 判定，非 true 一律当独占
      expect(tool?.isConcurrencySafe?.(minArgs(tool)), `${name} 未返回 true`).toBe(true)
    }
  })

  it('变更工具保持独占（多声明一次就是真事故：两个 docker_action 并发跑）', () => {
    const byName = mountPlugin()
    for (const name of MUTATING) {
      expect(byName.get(name), `${name} 未注册`).toBeDefined()
      expect(byName.get(name)?.isConcurrencySafe, `${name} 不该声明并发安全`).toBeUndefined()
    }
  })

  it('清单本身自洽：只读 + 变更 = 注册到的全部工具（新增工具时必须来这张表里归类）', () => {
    const names = [...mountPlugin().keys()].sort()
    expect(names).toEqual([...READ_ONLY, ...MUTATING].sort())
  })
})
