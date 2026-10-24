/**
 * @hyzyn/dsh-docker — 四条列表工具（`docker_ps` / `docker_images` / `docker_networks` /
 * `docker_volumes`）的分页回归。
 *
 * 分页解决的是「结果长到模型读不下去」，**不**解决单条 docker 命令 512KB（`maxOutputKb`）
 * 的物理上限——那个上限超了照旧抛错，本文件不碰它。所以这里钉的是四件事：
 *
 *   1. **切页在插件侧、全量之后**：后端 `images()` / `networks()` / `volumes()` /
 *      `listContainers()` 的返回契约不变（面板还要完整列表），只是工具返回值切了一页；
 *   2. **`total` / `truncated` 两个信号**：`total` 是切之前的总数，`truncated` 是
 *      `total > offset + limit`。缺了它们，「一页」与「全部」在返回值上无法区分；
 *   3. **`output.schema` 必须声明这两个字段**（坑 1）：宿主对工具返回值做
 *      `additionalProperties: false` 校验（`dsh-tools/lib/index.js` 的
 *      `createSuccessResult`），返回值里有、schema 里没有 → `ToolOutputError` 把整个
 *      结果挡掉。最后那条「反例」用例就是把同一次校验跑在**删掉 `total` 的 schema 副本**
 *      上，钉住「漏声明 = 红」这条因果；
 *   4. **docker_ps 的两种返回形态**：单目标 `containers` 按行切；`target='*'` 的 `groups`
 *      **按组内条目切**（组数不变，每组带自己的 total / truncated）——否则一台主机的 150
 *      个容器会把别的组挤没。
 *
 * 夹具沿用 `tool-concurrency.test.ts` 的最小假宿主（假 cordis ctx + 假 `node:child_process`），
 * 加上这里需要的「docker CLI 输出」：150 条 ps / images / networks / volumes 的
 * `{{json .}}` 行。断言面是**工具出口**（execute 的返回值 + render 的文本），不是内部 helper
 * ——分页真正出问题的地方是「忘了把 total 传进 render」这类接线，纯函数单测抓不到。
 */
import { EventEmitter } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/*
 * 授权隔离（与 config-route / tool-concurrency 同款）：apply() 按 dshHome() 打开带外授权
 * 存储，不隔离的话开发机上的真实授权会影响工具注册。
 */
const originalDshHome = process.env.DSH_HOME
const isolatedDshHome = mkdtempSync(join(tmpdir(), 'dsh-docker-paging-'))
process.env.DSH_HOME = isolatedDshHome
afterAll(() => {
  if (originalDshHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = originalDshHome
  rmSync(isolatedDshHome, { recursive: true, force: true })
})

/** 假 docker CLI 的输出：按子命令分派（`ps` / `images` / `network` / `volume`）。 */
const total = 150
const psLines = Array.from({ length: total }, (_, i) => JSON.stringify({
  ID: String(i).padStart(64, '0'),
  Names: `c-${String(i)}`,
  Image: `img/${String(i)}:latest`,
  State: 'running',
  Status: 'Up 1 hour',
  Ports: '',
  Networks: 'bridge',
  Labels: '',
}))
const imageLines = Array.from({ length: total }, (_, i) => JSON.stringify({
  ID: `sha256:${String(i).padStart(12, '0')}${'f'.repeat(52)}`,
  Repository: `repo/${String(i)}`,
  Tag: 'latest',
  Size: '12.3MB',
  CreatedSince: '2 days ago',
}))
const networkLines = Array.from({ length: total }, (_, i) => JSON.stringify({
  ID: String(i).padStart(16, '0'),
  Name: `net-${String(i)}`,
  Driver: 'bridge',
  Scope: 'local',
  Internal: 'false',
}))
const volumeLines = Array.from({ length: total }, (_, i) => JSON.stringify({
  Name: `vol-${String(i)}`,
  Driver: 'local',
  Scope: 'local',
  Mountpoint: `/var/lib/docker/volumes/vol-${String(i)}/_data`,
}))

/** 插件自己的挂载日志（`[dsh-docker] mounted …`）与本文件无关：静音，免得淹没失败信息。 */
let consoleSpy: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
})
afterEach(() => {
  consoleSpy.mockRestore()
})

const spawnMock = vi.hoisted(() => vi.fn())

vi.mock('node:child_process', () => ({ spawn: spawnMock }))

import { validateJsonSchemaValue } from '@deepseek-ai/dsh-tools'
import { apply } from '../src/index.js'
import { DockerApi } from '../src/docker.js'
import type { Runner } from '../src/docker.js'
import type { ExecResult } from '../src/ssh-exec.js'

function installSpawnStub(): void {
  // 注意：`runLocal` 已经把 argv[0]（dockerBin）摘掉，spawn 的第二个参数是**剩下的子命令**
  spawnMock.mockImplementation((_bin: string, args: readonly string[]) => {
    const child = new EventEmitter() as EventEmitter & {
      stdout: EventEmitter
      stderr: EventEmitter
      stdin: { end(): void }
      kill(): void
      unref(): void
    }
    child.stdout = new EventEmitter()
    child.stderr = new EventEmitter()
    child.stdin = { end() {} }
    child.kill = () => {}
    child.unref = () => {}
    const lines =
      args[0] === 'ps' ? psLines
        : args[0] === 'images' ? imageLines
          : args[0] === 'network' ? networkLines
            : args[0] === 'volume' ? volumeLines
              : []
    setImmediate(() => {
      child.stdout.emit('data', Buffer.from(lines.length === 0 ? '' : lines.join('\n') + '\n'))
      child.emit('close', 0)
    })
    return child
  })
}

/* ------------------------------------------------------------------ *
 * 最小假 cordis ctx（只挂 tools / settings / webServer / systemPrompt 几个面）
 * ------------------------------------------------------------------ */

interface FakeToolDef {
  name: string
  parameters?: { required?: string[]; properties?: Record<string, unknown> }
  output: {
    schema: Record<string, unknown>
    render: (args: unknown, value: unknown) => Array<{ type: string; text: string }>
  }
  execute: (args: unknown) => Promise<unknown>
}

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
        describe: () => [{ ns: 'docker', value: { dockerBin: 'docker', targets: [{ name: '本机', kind: 'local' }] } }],
        update: async () => { emitVolatile() },
        configure: () => () => {},
      }
    }
    if (names.includes('webServer')) child.webServer = { register: () => () => {} }
    if (names.includes('systemPrompt')) child.systemPrompt = { section: () => () => {} }
    return child
  }
  const root = makeChild([])
  root.inject = (names: string[], cb: (ctx: unknown) => void) => {
    cb(makeChild(names))
    return () => {}
  }
  ;(apply as unknown as (ctx: unknown, config: unknown) => void)(root, {
    dockerBin: 'docker',
    allowMutations: false,
    allowExec: false,
    targets: [{ name: '本机', kind: 'local' }],
  })
  // 同一条 apply 路径在假 ctx 下会把工具注册两次（真实宿主由 disposer 撤旧），按名字归并
  return new Map(registered.map((tool) => [tool.name, tool]))
}

interface Called {
  value: Record<string, unknown>
  text: string
}

/**
 * 跑一次工具并走**宿主的两道出口**：先用 `tool.output.schema` 校验返回值
 * （= 宿主 `createSuccessResult` 的做法），再 render。
 *
 * 两道都必须过——只调 execute 会漏掉「返回值有、schema 没声明」这个坑（见文件头的坑 1）。
 */
async function call(tool: FakeToolDef, args: Record<string, unknown>): Promise<Called> {
  const value = await tool.execute(args) as Record<string, unknown>
  const violations = validateJsonSchemaValue(tool.output.schema, value, 'value')
  expect(violations, `${tool.name} 的返回值过不了自己的 output.schema`).toEqual([])
  const rendered = tool.output.render(args, value)
  return { value, text: rendered.map((part) => part.text).join('') }
}

/* 每条用例都重新挂一次：spawn 桩与注册表互不影响（挂载本身是纯内存操作） */
function tools(): Map<string, FakeToolDef> {
  installSpawnStub()
  return mountPlugin()
}

function tool(toolsByName: Map<string, FakeToolDef>, name: string): FakeToolDef {
  const found = toolsByName.get(name)
  expect(found, `${name} 未注册`).toBeDefined()
  return found as FakeToolDef
}

describe('docker_images — 默认一页 100 条，翻页靠 offset', () => {
  it('① 不传 limit：返回 100 条、total=150、truncated=true，render 给出 offset=100', async () => {
    const images = tool(tools(), 'docker_images')
    const { value, text } = await call(images, {})
    expect((value.images as unknown[]).length).toBe(100)
    expect(value.total).toBe(150)
    expect(value.truncated).toBe(true)
    // 提示必须是**可执行**的下一步（agent 改不了 maxOutputKb，所以那种话术不算数）
    expect(text).toContain('offset=100')
    expect(text).toContain('共 150 条，本页显示 100 条')
  })

  it('② 传 limit=200：全出 150 条、truncated=false，render 不再提 offset', async () => {
    const images = tool(tools(), 'docker_images')
    const { value, text } = await call(images, { limit: 200 })
    expect((value.images as unknown[]).length).toBe(150)
    expect(value.total).toBe(150)
    expect(value.truncated).toBe(false)
    expect(text).not.toContain('offset=')
    expect(text).toContain('的镜像（150 个）')
  })

  it('③ offset=100&limit=100：返回后 50 条（第 101 条起）、truncated=false', async () => {
    const images = tool(tools(), 'docker_images')
    const { value, text } = await call(images, { offset: 100, limit: 100 })
    const rows = value.images as Array<{ reference: string }>
    expect(rows.length).toBe(50)
    expect(rows[0]?.reference).toBe('repo/100:latest')
    expect(rows[49]?.reference).toBe('repo/149:latest')
    expect(value.total).toBe(150)
    expect(value.truncated).toBe(false)
    // 头部要说清「一共多少 / 本页多少」，否则 50 条会被当成全部
    expect(text).toContain('共 150 个，本页 50 个')
  })

  it('offset 越过末页：不冒充「没有镜像」，明确说是翻过头了', async () => {
    const images = tool(tools(), 'docker_images')
    const { value, text } = await call(images, { offset: 500 })
    expect((value.images as unknown[]).length).toBe(0)
    expect(value.total).toBe(150)
    expect(text).toContain('已越过末页')
    expect(text).not.toContain('没有镜像')
  })

  it('limit 越界夹紧（1~500），非法值不炸：limit=0 → 1 条，limit=1e9 → 500 条', async () => {
    const images = tool(tools(), 'docker_images')
    expect(((await call(images, { limit: 0 })).value.images as unknown[]).length).toBe(1)
    expect(((await call(images, { limit: 1_000_000 })).value.images as unknown[]).length).toBe(150)
  })
})

describe('docker_ps — rows 与 groups 两种形态都分页', () => {
  it('rows 形态：按行切，并回报 total / truncated', async () => {
    const ps = tool(tools(), 'docker_ps')
    const { value, text } = await call(ps, {})
    const rows = value.containers as Array<{ name: string }>
    expect(rows.length).toBe(100)
    expect(rows[0]?.name).toBe('c-0')
    expect(value.total).toBe(150)
    expect(value.truncated).toBe(true)
    expect(text).toContain('offset=100')
  })

  it('groups 形态（target=*）：组数不变、按组内条目切，每组带自己的 total / truncated', async () => {
    const ps = tool(tools(), 'docker_ps')
    const { value, text } = await call(ps, { target: '*' })
    const groups = value.groups as Array<{ target: string; containers?: unknown[]; total?: number; truncated?: boolean }>
    expect(groups.length).toBe(1)
    expect(groups[0]?.containers?.length).toBe(100)
    expect(groups[0]?.total).toBe(150)
    expect(groups[0]?.truncated).toBe(true)
    // 标题的「共 N 个容器」要用 total 而不是本页条数
    expect(text).toContain('所有目标共 150 个容器')
    expect(text).toContain('offset=100')
  })

  it('groups 形态 offset 越过末页：不冒充「0 个容器」（组内假阴性）', async () => {
    const ps = tool(tools(), 'docker_ps')
    const { value, text } = await call(ps, { target: '*', offset: 500 })
    const groups = value.groups as Array<{ containers?: unknown[]; total?: number }>
    expect(groups[0]?.containers?.length).toBe(0)
    expect(groups[0]?.total).toBe(150)
    expect(text).toContain('已越过末页')
    expect(text).not.toContain('— 0 个容器')
  })

  it('groups 形态也能翻到第二页（offset=100 → 后 50 条）', async () => {
    const ps = tool(tools(), 'docker_ps')
    const { value } = await call(ps, { target: '*', offset: 100, limit: 100 })
    const groups = value.groups as Array<{ containers?: Array<{ name: string }>; truncated?: boolean }>
    expect(groups[0]?.containers?.length).toBe(50)
    expect(groups[0]?.containers?.[0]?.name).toBe('c-100')
    expect(groups[0]?.truncated).toBe(false)
  })
})

describe('docker_networks / docker_volumes — 与 images 同一口径', () => {
  it('networks：默认 100 条 + total=150 + truncated=true', async () => {
    const { value, text } = await call(tool(tools(), 'docker_networks'), {})
    expect((value.networks as unknown[]).length).toBe(100)
    expect(value.total).toBe(150)
    expect(value.truncated).toBe(true)
    expect(text).toContain('offset=100')
  })

  it('volumes：默认 100 条 + total=150 + truncated=true', async () => {
    const { value, text } = await call(tool(tools(), 'docker_volumes'), {})
    expect((value.volumes as unknown[]).length).toBe(100)
    expect(value.total).toBe(150)
    expect(value.truncated).toBe(true)
    expect(text).toContain('offset=100')
  })
})

describe('坑 1 反例：total 从 output.schema 里删掉就必须红', () => {
  it('同一个返回值，schema 少了 total 就产生 violation（宿主会挡掉整个结果）', async () => {
    const images = tool(tools(), 'docker_images')
    const value = await images.execute({}) as Record<string, unknown>
    // 先确认现状是绿的：真实 schema 能收下这个返回值（否则下面那条反例不成立）
    expect(validateJsonSchemaValue(images.output.schema, value, 'value')).toEqual([])

    // 反例：只删声明、不动返回值（= 有人加字段忘了同步 schema 的那个形状）
    const stripped = structuredClone(images.output.schema) as {
      properties: Record<string, unknown>
    }
    delete stripped.properties.total
    const violations = validateJsonSchemaValue(stripped, value, 'value')
    expect(violations.length).toBeGreaterThan(0)
    expect(violations.join(' ')).toContain('total')
  })
})

describe('docker_logs 截断 / docker.ts 的 512KB 提示都给下一步', () => {
  it('docker_logs：截断时不再只说「已截断」，给出 tail / since-until / logs_grep 三条出路', () => {
    const logs = tool(tools(), 'docker_logs')
    const text = logs.output.render(
      { target: '本机', id: 'app' },
      { target: '本机', id: 'app', text: 'boom', truncated: true },
    ).map((part) => part.text).join('')
    expect(text).toContain('输出已截断')
    expect(text).toContain('`tail`')
    expect(text).toContain('`since`/`until`')
    expect(text).toContain('`docker_logs_grep`')
  })

  it('docker.ts 三处劝退话术改成可执行的「limit + offset 分页」（512KB 硬上限仍在）', async () => {
    const runner: Runner = {
      label: '本机（test）',
      async run(): Promise<ExecResult> {
        return { code: 0, stdout: '', stderr: '', timedOut: false, truncated: true, durationMs: 1 }
      },
      async stream() {
        throw new Error('列表方法不应走 stream')
      },
    }
    const api = new DockerApi(runner, 'docker', { timeoutMs: 30_000, maxBytes: 512 * 1024 })
    for (const [what, invoke] of [
      ['镜像', () => api.images()],
      ['网络', () => api.networks()],
      ['卷', () => api.volumes()],
    ] as const) {
      const error = await invoke().then(() => undefined, (error_: unknown) => error_ as Error)
      expect(error, `列出${what}在截断时必须报错（512KB 硬上限不因此放宽）`).toBeDefined()
      const message = error?.message ?? ''
      expect(message).toContain('`limit` + `offset` 分页')
      // 自认无路的那句话必须消失：它说的「没有分页参数」此刻已经不成立
      expect(message).not.toContain('agent 侧没有分页参数')
      expect(message).toContain('maxOutputKb')
    }
  })
})
