/**
 * @hyzyn/dsh-docker — 零目标时的工具注册面 + 配置热改补注册的回归测试（B1）。
 *
 * 两条互相关联的语义，**缺一条就回到「注册了也用不了 / 配好了却要重启」**：
 *
 *   1. `refreshTools` 里的零目标闸：一条目标都没有时只有 `docker_targets` /
 *      `docker_connect_local` 注册——其余工具没有可寻址对象，注册了只会让模型白试一次；
 *   2. `applySection` 的触发条件必须包含**目标列表变化**：挂载时零目标、用户在设置卡片里
 *      配好目标之后，要能**不重启**补注册（否则工具要等到下一次重启才出现）。
 *
 * 假宿主同时具备两个面：`tools.register` 捕获完整工具定义（disposer 会把它从捕获集里摘掉，
 * 于是断言面就是「此刻真实注册了什么」），`settings` 三件套（describe / update / configure）
 * 在 update 时按真宿主语义先落值再发 `loader/volatile-update`——第 ③ 条用例走的正是这条
 * 真实事件路径，不手工调 applySection。
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apply } from '../src/index.js'

/*
 * 隔离 DSH_HOME：`apply()` 会按 dshHome() 拼能力授权存储的路径（kit 的 capabilityPaths）。
 * 指向临时目录，避免读到开发机上真实的就地提权记录（否则「零目标 + 能力开关打开」这条
 * 会在用过提权的机器上换一种语义跑），也不往真实目录里写任何东西。
 */
const originalDshHome = process.env.DSH_HOME
const isolatedDshHome = mkdtempSync(join(tmpdir(), 'dsh-docker-tools-'))
process.env.DSH_HOME = isolatedDshHome

/*
 * 能力开关的宿主侧授权：本文件第 ④ 条要覆盖「开关打开 + 零目标」的组合，所以模拟宿主启动时
 * 带授权环境变量。授权来源在每次 apply() 时重新绑定（kit 的 bindCapabilitySources），因此
 * 这里先设好即可；afterAll 必须清掉——vitest 复用 worker 进程，漏出去会让别的测试文件
 * 的「未授权」用例静默变成已授权。
 */
const originalMutations = process.env.DSH_DOCKER_ALLOW_MUTATIONS
const originalExec = process.env.DSH_DOCKER_ALLOW_EXEC

beforeAll(() => {
  process.env.DSH_DOCKER_ALLOW_MUTATIONS = '1'
  process.env.DSH_DOCKER_ALLOW_EXEC = '1'
})

afterAll(() => {
  for (const [key, value] of [
    ['DSH_DOCKER_ALLOW_MUTATIONS', originalMutations],
    ['DSH_DOCKER_ALLOW_EXEC', originalExec],
  ] as const) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  if (originalDshHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = originalDshHome
  rmSync(isolatedDshHome, { recursive: true, force: true })
})

/**
 * 只读工具（与 test/tool-concurrency.test.ts 的 READ_ONLY 同一份名单）。
 * 零目标时只剩前两条（空态出路），有目标时 13 条都必须回来。
 */
const READ_ONLY = [
  'docker_targets',
  'docker_connect_local',
  'docker_ps',
  'docker_attention',
  'docker_inspect',
  'docker_logs',
  'docker_logs_grep',
  'docker_stats',
  'docker_events',
  'docker_images',
  'docker_image_inspect',
  'docker_networks',
  'docker_volumes',
]

/** 零目标时（也是能力全关时）应当注册的**全部**工具。 */
const ZERO_TARGET_TOOLS = ['docker_targets', 'docker_connect_local']

interface FakeSchemaProperty {
  type?: string
  required?: boolean
  items?: { type?: string }
}

interface FakeToolDef {
  name: string
  output?: {
    schema?: {
      type?: string
      additionalProperties?: boolean
      properties?: Record<string, FakeSchemaProperty>
    }
  }
}

interface FakeSettings {
  describe(): Array<{ ns: string; value?: unknown }>
  update(ns: string, patch: Record<string, unknown>): Promise<void>
  configure(): () => void
}

interface Harness {
  /** 此刻真实注册的工具（按注册顺序；disposer 生效即从表里摘掉）。 */
  registry: FakeToolDef[]
  settings: FakeSettings
}

/**
 * 最小假 cordis ctx：tools（捕获注册 + 可撤销）+ settings（describe/update/configure，
 * update 会 emit `loader/volatile-update`）+ webServer / systemPrompt 两个空壳。
 */
function mountPlugin(config: Record<string, unknown>): Harness {
  const registry: FakeToolDef[] = []
  const listeners = new Map<string, Array<(...args: unknown[]) => void>>()
  /** 用户层 patch（settings.update 落进来的值，describe 原样返回）。 */
  const stored: Record<string, unknown> = {}
  /** loader 检出 volatile-only 变更后发的事件（同步发，省掉真实 loader 的异步）。 */
  const emitVolatile = (): void => {
    for (const listener of listeners.get('loader/volatile-update') ?? []) listener()
  }
  const settingsService: FakeSettings = {
    describe: () => [{ ns: 'docker', value: { ...stored } }],
    update: async (ns, patch) => {
      if (ns !== 'docker') throw new Error('未知的 entry: ' + ns)
      // 真宿主是「先落盘再广播」：测试第 ③ 条依赖这个顺序（广播时 scope.get() 已能读到新值）
      Object.assign(stored, patch)
      emitVolatile()
    },
    configure: () => () => {},
  }
  const makeChild = (names: string[]): Record<string, unknown> => {
    const on = (name: string, listener: (...args: unknown[]) => void): (() => void) => {
      const list = listeners.get(name) ?? []
      list.push(listener)
      listeners.set(name, list)
      return () => {
        const remaining = (listeners.get(name) ?? []).filter((item) => item !== listener)
        listeners.set(name, remaining)
      }
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
          registry.push(definition)
          // 真宿主的 disposer 会注销工具；这里必须真的摘掉，否则「此刻注册了什么」不可断言
          return () => {
            const at = registry.indexOf(definition)
            if (at !== -1) registry.splice(at, 1)
          }
        },
      }
    }
    if (names.includes('settings')) child.settings = settingsService
    if (names.includes('webServer')) child.webServer = { register: () => () => {} }
    if (names.includes('systemPrompt')) child.systemPrompt = { section: () => () => {} }
    return child
  }
  const root = makeChild([])
  root.inject = (names: string[], cb: (ctx: unknown) => void) => {
    cb(makeChild(names))
    return () => {}
  }
  ;(apply as unknown as (ctx: unknown, config: unknown) => void)(root, config)
  return { registry, settings: settingsService }
}

/** 当前注册工具名（按注册顺序）。 */
function toolNames(harness: Harness): string[] {
  return harness.registry.map((tool) => tool.name)
}

describe('零目标：只注册空态的两条工具', () => {
  it('没有任何目标（能力开关全关）→ 注册表恰好是 docker_targets / docker_connect_local', () => {
    const harness = mountPlugin({ dockerBin: 'docker', allowMutations: false, allowExec: false, targets: [] })
    expect(toolNames(harness)).toEqual(ZERO_TARGET_TOOLS)
  })

  it('零目标 + 两个能力开关打开 → 仍然只有两条，且挂载不抛（其余工具没有可寻址对象）', () => {
    let harness: Harness | undefined
    expect(() => {
      harness = mountPlugin({ dockerBin: 'docker', allowMutations: true, allowExec: true, targets: [] })
    }).not.toThrow()
    expect(toolNames(harness!)).toEqual(ZERO_TARGET_TOOLS)
  })
})

describe('有目标：只读工具全部注册', () => {
  it('一个 {name:本机, kind:local} 目标 → 13 个只读工具都在（能力开关关着时注册面就是这 13 条）', () => {
    const harness = mountPlugin({ dockerBin: 'docker', allowMutations: false, allowExec: false, targets: [{ name: '本机', kind: 'local' }] })
    expect(toolNames(harness)).toEqual(READ_ONLY)
  })

  it('docker_logs_grep 的 output.schema 声明了 truncatedForSize / notes（additionalProperties:false，漏声明会被宿主挡掉）', () => {
    const harness = mountPlugin({ dockerBin: 'docker', allowMutations: false, allowExec: false, targets: [{ name: '本机', kind: 'local' }] })
    const tool = harness.registry.find((item) => item.name === 'docker_logs_grep')
    expect(tool, 'docker_logs_grep 未注册').toBeDefined()
    const schema = tool?.output?.schema
    expect(schema?.additionalProperties).toBe(false)
    // 返回侧行闸的两个字段必须在 properties 里，否则「结果里有未声明字段」会被宿主校验拒掉
    expect(schema?.properties?.truncatedForSize).toMatchObject({ type: 'boolean' })
    expect(schema?.properties?.notes).toMatchObject({ type: 'array', items: { type: 'string' } })
  })
})

describe('配置热改：0 目标 → 1 目标，不重启就补注册', () => {
  it('挂载时零目标，经 settings.update 加上目标后工具表补上 docker_ps 等（钉住 applySection 的目标变化触发）', async () => {
    const harness = mountPlugin({ dockerBin: 'docker', allowMutations: false, allowExec: false, targets: [] })
    expect(toolNames(harness)).toEqual(ZERO_TARGET_TOOLS)
    // 走真实事件路径：settings.update → 广播 loader/volatile-update → applySection(scope.get())
    await harness.settings.update('docker', { targets: [{ name: '本机', kind: 'local' }] })
    expect(toolNames(harness)).toEqual(READ_ONLY)
  })
})
