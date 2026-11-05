/**
 * @hyzyn/dsh-docker — `docker_targets` 必须显式带出「目标 → tty 连接簿条目」这层关系（D170）。
 *
 * ## 钉的是什么
 *
 * 症状形状（用户报告）：同一台机器有**三套名字**——终端面板下拉显示「目标名 · user@host」、
 * docker 目标名、tty 的 SSH 连接簿条目名，三者互不相同。`DockerTarget.book` 早就存在、
 * `resolveTarget(target, books)` 也一直在用它查表，但**工具输出里从来没有它**：
 * 模型只拿到 `user@host`，要带着这台主机去 `sftp_*` / 终端时只能猜条目名，猜错就是
 * 「连接簿中不存在」。这层关系是**唯一可推的连接线索**，不可发现 = 推不出来。
 *
 * 三条判据，都落在**工具出口**（execute 的返回值 + `output.render` 的文本），不是内部 helper：
 *
 *   1. 引用了连接簿条目的目标：返回值带 `book`，render 里看得见条目名；
 *   2. 内联 `host` / `username` 的目标：**不编名字**——返回值没有 `book` 这个键，render 里不出现
 *      「连接簿」字样；本机目标同理（`book` 只对 SSH 目标有意义）；
 *   3. 解析失败（引用的条目不存在）：`error` 文案仍点名那个条目，且 `book` 字段照旧带出
 *      ——失败时更需要它，那是用户要改的那一条。
 *
 * ## 为什么还要一条「schema 漏声明」的反例
 *
 * 宿主用 `additionalProperties: false` 校验工具返回值（`@deepseek-ai/dsh-tools` 的
 * `createSuccessResult`），`book` 只加在返回值里、忘了加进 `output.schema` → 整条结果被挡掉。
 * 最后一条用例把同一次校验跑在**删掉 `book` 的 schema 副本**上，钉住「漏声明 = 红」这条因果
 * （与 `test/list-paging.test.ts` 的坑 1 同一手法）。
 *
 * ## 为什么不用真实主机名 / 内网 IP
 *
 * 夹具一律用中性取值（`host-a.example` / `KB_JUMP_01`）：仓库有
 * `scripts/check-internal-identifiers.mjs` 与 `scripts/check-no-public-ip.mjs` 两道守卫。
 * 用例**不建任何连接**：`probe` 那条用本机目标 + 假 `node:child_process`，其余走 `probe` 缺省路径。
 */
import { EventEmitter } from 'node:events'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/*
 * 授权隔离（与 config-route / tool-concurrency / list-paging 同款）：`apply()` 按 dshHome()
 * 打开带外授权存储，不隔离会把开发机上真实的提权记录读进来，改变工具注册面。
 */
const originalDshHome = process.env.DSH_HOME
const isolatedDshHome = mkdtempSync(join(tmpdir(), 'dsh-docker-targets-book-'))
process.env.DSH_HOME = isolatedDshHome
afterAll(() => {
  if (originalDshHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = originalDshHome
  rmSync(isolatedDshHome, { recursive: true, force: true })
})

const spawnMock = vi.hoisted(() => vi.fn())

vi.mock('node:child_process', () => ({ spawn: spawnMock }))

import { validateJsonSchemaValue } from '@deepseek-ai/dsh-tools'
import type { JsonSchemaNode } from '@deepseek-ai/dsh-tools'
import { apply } from '../src/index.js'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

/** 插件的挂载日志（`[dsh-docker] config applied …`）与本文件无关：静音，免得淹没失败信息。 */
let consoleSpy: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
})
afterEach(() => {
  consoleSpy.mockRestore()
  spawnMock.mockReset()
})

/** tty 连接簿里的条目（`settings.get('tty').sshHosts` 的形状；docker 只读这一段）。 */
const BOOKS = [
  { name: 'KB_JUMP_01', host: 'host-a.example', port: 2222, username: 'root' },
]

/** 假 docker CLI：`probe()` 打的是 `docker version --format '{{.Server.Version}}'`。 */
function installSpawnStub(version = '27.0.3'): void {
  spawnMock.mockImplementation(() => {
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
    setImmediate(() => {
      child.stdout.emit('data', Buffer.from(version + '\n'))
      child.emit('close', 0)
    })
    return child
  })
}

/* ------------------------------------------------------------------ *
 * 最小假 cordis ctx（tools / settings / webServer / systemPrompt）
 * ------------------------------------------------------------------ */

interface FakeToolDef {
  name: string
  description?: string
  output: {
    schema: JsonSchemaNode
    render: (args: unknown, value: unknown) => Array<{ type: string; text: string }>
  }
  execute: (args: unknown) => Promise<unknown>
}

interface MountOptions {
  targets: unknown[]
  books?: unknown[]
}

function mountPlugin(options: MountOptions): Map<string, FakeToolDef> {
  const registered: FakeToolDef[] = []
  const listeners = new Map<string, Array<() => void>>()
  const emitVolatile = (): void => {
    for (const listener of listeners.get('loader/volatile-update') ?? []) listener()
  }
  const entries = (): Array<{ ns: string; value: unknown }> => [
    { ns: 'docker', value: { dockerBin: 'docker', targets: options.targets } },
    // tty 未安装 / 未配置时真实宿主也没有这份 entry：这里显式给一份，读连接簿才有东西可读
    ...(options.books === undefined ? [] : [{ ns: 'tty', value: { sshHosts: options.books } }]),
  ]
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
        describe: entries,
        update: async () => {
          emitVolatile()
        },
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
    targets: options.targets,
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
 * （= 宿主 `createSuccessResult` 的做法），再 render。两道都必须过。
 */
async function call(tool: FakeToolDef, args: Record<string, unknown>): Promise<Called> {
  const value = await tool.execute(args) as Record<string, unknown>
  const violations = validateJsonSchemaValue(tool.output.schema, value, 'value')
  expect(violations, `${tool.name} 的返回值过不了自己的 output.schema`).toEqual([])
  const rendered = tool.output.render(args, value)
  return { value, text: rendered.map((part) => part.text).join('') }
}

function targetRow(called: Called, index = 0): Record<string, unknown> {
  return (called.value.targets as Array<Record<string, unknown>>)[index] as Record<string, unknown>
}

function targetsTool(tools: Map<string, FakeToolDef>): FakeToolDef {
  const found = tools.get('docker_targets')
  expect(found, 'docker_targets 未注册').toBeDefined()
  return found as FakeToolDef
}

describe('① 引用了连接簿条目的目标 → 输出带出条目名', () => {
  it('返回值带 book=KB_JUMP_01，render 里紧跟 `user@host` 显示「（连接簿 …）」', async () => {
    const tool = targetsTool(mountPlugin({
      targets: [{ name: 'kb-target', kind: 'ssh', book: 'KB_JUMP_01' }],
      books: BOOKS,
    }))
    const called = await call(tool, {})
    const row = targetRow(called)
    expect(row.book).toBe('KB_JUMP_01')
    expect(row.label).toBe('root@host-a.example:2222')
    // render 的逐字形状：条目名紧跟在 `user@host` 后面（模型的检索锚点就是它）
    expect(called.text).toContain('- kb-target (ssh) root@host-a.example:2222（连接簿 KB_JUMP_01）')
  })

  it('默认端口的条目（:22）也带 book——不是只在非标端口时才出现', async () => {
    const tool = targetsTool(mountPlugin({
      targets: [{ name: 'kb-22', kind: 'ssh', book: 'KB_22' }],
      books: [{ name: 'KB_22', host: 'host-a.example', username: 'ops' }],
    }))
    const called = await call(tool, {})
    expect(targetRow(called).book).toBe('KB_22')
    expect(called.text).toContain('- kb-22 (ssh) ops@host-a.example（连接簿 KB_22）')
  })
})

describe('② 内联 host/username 的目标 → 不凭空编一个名字', () => {
  it('内联字段的 SSH 目标：返回值**没有** book 键，render 不出现「连接簿」', async () => {
    const tool = targetsTool(mountPlugin({
      targets: [{ name: 'inline', kind: 'ssh', host: 'host-b.example', port: 2222, username: 'deploy' }],
      books: BOOKS,
    }))
    const called = await call(tool, {})
    const row = targetRow(called)
    expect('book' in row, '内联字段的目标不该带 book（没有条目名，编一个就是假的）').toBe(false)
    expect(row.label).toBe('deploy@host-b.example:2222')
    expect(called.text).not.toContain('连接簿')
  })

  it('本机目标既没有 book 也不出现「连接簿」', async () => {
    const tool = targetsTool(mountPlugin({ targets: [{ name: '本机', kind: 'local' }], books: BOOKS }))
    const called = await call(tool, {})
    expect('book' in targetRow(called)).toBe(false)
    expect(called.text).toContain('- 本机 (local) 本机')
    expect(called.text).not.toContain('连接簿')
  })
})

describe('③ 解析失败：文案点名那个条目，book 字段照旧带出', () => {
  it('引用的条目不存在 → error 点名 KB_MISSING、row.book 仍是它、render 里两个位置都看得见', async () => {
    const tool = targetsTool(mountPlugin({
      targets: [{ name: 'ghost', kind: 'ssh', book: 'KB_MISSING' }],
      books: BOOKS,
    }))
    const called = await call(tool, {})
    const row = targetRow(called)
    expect(row.ok).toBe(false)
    expect(row.label).toBe('解析失败')
    expect(String(row.error)).toContain('KB_MISSING')
    expect(row.book).toBe('KB_MISSING')
    expect(called.text).toContain('解析失败（连接簿 KB_MISSING）')
    expect(called.text).toContain('KB_MISSING')
  })
})

describe('④ probe 分支：带上版本，且不会给本机目标编一个 book', () => {
  it('probe:true + 本机目标 → serverVersion 回传、无 book、render 仍是 `[可达] docker 27.0.3`', async () => {
    installSpawnStub('27.0.3')
    const tool = targetsTool(mountPlugin({ targets: [{ name: '本机', kind: 'local' }] }))
    const called = await call(tool, { probe: true })
    const row = targetRow(called)
    expect(row.ok).toBe(true)
    expect(row.serverVersion).toBe('27.0.3')
    expect('book' in row).toBe(false)
    // render 的既有顺序是 `label docker <version> [可达]`，别顺手改它（面板/文档都对过这段）
    expect(called.text).toContain('docker 27.0.3 [可达]')
  })
})

describe('⑤ 让模型知道这个字段的用途：schema 声明 + description 点名', () => {
  it('output.schema 里声明了 book（additionalProperties:false，漏了整条结果会被宿主挡掉）', () => {
    const tool = targetsTool(mountPlugin({ targets: [{ name: '本机', kind: 'local' }] }))
    const items = tool.output.schema.properties?.['targets']?.items
    expect(items?.properties?.['book']).toMatchObject({ type: 'string' })
  })

  it('description 说出了「SSH 目标会带出连接簿条目名」——模型才会去用这个字段', () => {
    const tool = targetsTool(mountPlugin({ targets: [{ name: '本机', kind: 'local' }] }))
    expect(tool.description ?? '').toContain('连接簿')
  })

  /*
   * 反例（坑 1 的同一手法）：把 `book` 从 schema 里删掉、返回值不动 —— 就是「加了字段忘了同步
   * schema」的那个形状，宿主会挡掉整条结果。钉住因果，而不是钉住某一次改动。
   */
  it('反例：schema 少了 book，同一个返回值就产生 violation', async () => {
    const tool = targetsTool(mountPlugin({
      targets: [{ name: 'kb-target', kind: 'ssh', book: 'KB_JUMP_01' }],
      books: BOOKS,
    }))
    const value = await tool.execute({}) as Record<string, unknown>
    expect(validateJsonSchemaValue(tool.output.schema, value, 'value')).toEqual([])

    const stripped = structuredClone(tool.output.schema) as JsonSchemaNode
    const items = stripped.properties?.['targets']?.items
    expect(items?.properties, 'schema 里抽不到 targets.items.properties（抽取先坏，判据就不成立）').toBeDefined()
    delete items?.properties?.['book']
    const violations = validateJsonSchemaValue(stripped, value, 'value')
    expect(violations.length).toBeGreaterThan(0)
    expect(violations.join(' ')).toContain('book')
  })

  /*
   * probe 分支（它给 SSH 目标也带 book）不值得为了一条断言去真建连接，所以这里用**源码形状**兜住：
   * `docker_targets` 的 `execute` 里每个 `rows.push({` 都必须带 `...bookField`——少一个，
   * 那条分支就把「目标 → 连接簿」丢了，而分支返回值本身在用例里可能恰好没被走到。
   */
  it('源码形状：docker_targets 里每处 rows.push 都带 bookField（probe 分支不建连接，靠这条兜）', () => {
    const src = readFileSync(join(REPO, 'packages/docker/src/index.ts'), 'utf8')
    const start = src.indexOf("add('docker_targets'")
    const end = src.indexOf("add('docker_connect_local'")
    expect(start, '抽不到 docker_targets 的定义（工具改名 / 换写法了？先修抽取，再谈判据）').toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    const block = src.slice(start, end)
    const pushes = block.match(/rows\.push\(\{/gu) ?? []
    const withBook = block.match(/\.\.\.bookField/gu) ?? []
    expect(pushes.length).toBeGreaterThan(0)
    expect(withBook.length, `rows.push 有 ${String(pushes.length)} 处，带 bookField 的只有 ${String(withBook.length)} 处`).toBe(pushes.length)
  })
})
