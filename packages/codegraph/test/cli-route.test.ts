/**
 * @hyzyn/dsh-codegraph — 宿主路由的集成测试（无网络、无真实 codegraph CLI）。
 *
 * 用临时 stub 脚本冒充 `codegraph`：它把收到的 argv 原样打成 JSON 行，于是可以
 * 断言路由真的把 `--force` 放在 `--` 之前、sync/index 走的是索引档超时、查询类
 * 走查询档超时。超时用例用「睡 10 秒的 stub + 300ms 超时」触发，断言报错点名了
 * 对应的配置项——这条链路（execFile timeout → killed/SIGTERM → 文案）以前完全没
 * 有覆盖，而它正是「大仓库重建索引」唯一会撞上的失败路径。
 *
 * 隔离：apply() 的兜底 effect 会读写 `$DSH_HOME/cordis.patch.yml`，因此整个文件把
 * DSH_HOME 指到临时目录，并且默认项目路径指向一个没有 `.codegraph/` 的目录——
 * 决策矩阵在这种输入下 changed=false，不会写任何文件。
 *
 * 平台：stub 在 POSIX 上是带 shebang 的可执行脚本；Windows 上没有可执行位、
 * 也不能直接 exec 脚本，所以复刻 npm / pnpm 的 `.cmd` shim 形状（node + %*），
 * 顺带覆盖 runCodegraph 的 cmd.exe 分支——此前整个文件在 Windows 上跳过，
 * 而 Windows 恰好是这条链路唯一出过 ENOENT 的平台。
 */
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// 只取 rmStubDir：本文件**自己**有 writeStubCli（带按名缓存与 writeStubCliAt），
// 从 helper 再导一个同名函数会把它覆盖掉（实测：52 条用例全红）。
import { rmStubDir } from './stub-cli.js'
import { apply, staleReasonsFromStatus } from '../src/index.js'

const POSIX = process.platform !== 'win32'
const sandbox = mkdtempSync(join(tmpdir(), 'dsh-cg-route-'))
const dshHome = join(sandbox, 'dsh-home')
const project = join(sandbox, 'project')
const originalDshHome = process.env.DSH_HOME

// init 路由的夹具只剩一个普通文件（用来撞「路径不是目录」）：init 的目标目录一律
// 由用例自己现造——stub init 会真的写 `.codegraph/`，共享目录会让用例之间互相污染
// （详见「init：只走 init -- <path>」那条的注释）。sandbox 随 afterAll 一起回收。
const someFile = join(sandbox, 'a-file.txt')

/**
 * 造一个**已索引**项目目录（`.codegraph/` 里有索引库）。
 *
 * P1-a 之后 usage 段还受「生效路径是否真是有效索引」这道门禁，所以凡是要断言
 * 「两段都注入」的用例，生效路径都必须落在这样的目录上；反过来，未索引目录
 * 只该拿到公告段——那正是新增的门禁用例要钉的行为。
 */
function indexedProject(name: string): string {
  const dir = mkdtempSync(join(sandbox, name))
  mkdirSync(join(dir, '.codegraph'), { recursive: true })
  writeFileSync(join(dir, '.codegraph', 'codegraph.db'), '')
  return dir
}

beforeAll(() => {
  mkdirSync(dshHome, { recursive: true })
  mkdirSync(project, { recursive: true })
  writeFileSync(someFile, 'not a directory\n')
  process.env.DSH_HOME = dshHome
})

afterAll(() => {
  if (originalDshHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = originalDshHome
  try {
    rmStubDir(sandbox)
  } catch (error) {
    // Windows：execFile 的超时只能杀掉直接子进程（cmd.exe），shim 里那个被挂住的
    // node 孙进程会多活几秒，并且在超时期间把本目录当 cwd——Windows 不允许删除
    // 正在被进程用作 cwd 的目录。临时目录留给系统回收，别让清理失败掩盖测试结果。
    if (POSIX) throw error
  }
})

/**
 * 写一个可执行的 stub CLI：把 argv 回显成 JSON 行，或挂住等到被杀。
 *
 * 同名的 stub 只写一次（按名字缓存路径）：每个用例 mount 时都会异步起一次
 * `<command> --version` 探测，而 Windows 上正在被 cmd.exe 打开的文件无法重写——
 * 反复重写同一个 `.cmd` 会偶发 `EBUSY: resource busy or locked`（三平台矩阵上实测到）。
 * 同名 stub 的内容本来就是固定的，缓存路径即可，顺带少写盘。
 */
const stubPaths = new Map<string, string>()

function stubCli(name: string, body: string): string {
  const cached = stubPaths.get(name)
  if (cached !== undefined) return cached
  const built = writeStubCli(name, body)
  stubPaths.set(name, built)
  return built
}

function writeStubCli(name: string, body: string): string {
  if (!POSIX) {
    // Windows：.cmd shim 的形状与 npm / pnpm 全局 bin 一致（node + %*），
    // 正是 runCodegraph 需要经 cmd.exe 才能跑起来的那种命令。
    writeFileSync(join(sandbox, `${name}.js`), `${body}\n`)
    const shim = join(sandbox, `${name}.cmd`)
    writeFileSync(shim, `@echo off\r\nnode "%~dp0${name}.js" %*\r\n`)
    return shim
  }
  const file = join(sandbox, `${name}.mjs`)
  writeFileSync(file, `#!/usr/bin/env node\n${body}\n`)
  chmodSync(file, 0o755)
  return file
}

/**
 * 把 stub CLI 写到**指定的**路径（不按名字推导，也不进按名缓存）。
 *
 * 用于「CLI 在插件挂载之后才出现」的用例：那个路径必须先不存在、之后才被创建，
 * 所以不能走 `stubCli` 的按名缓存。平台差异与 `writeStubCli` 保持一致。
 */
function writeStubCliAt(file: string, body: string): void {
  if (!POSIX) {
    // Windows：`.cmd` shim 与 npm / pnpm 全局 bin 同形（node + %*）
    const base = file.replace(/\.cmd$/i, '')
    writeFileSync(`${base}.js`, `${body}\n`)
    writeFileSync(file, `@echo off\r\nnode "%~dp0${base.split(/[\\/]/).pop()}.js" %*\r\n`)
    return
  }
  writeFileSync(file, `#!/usr/bin/env node\n${body}\n`)
  chmodSync(file, 0o755)
}

const echoCli = () => stubCli('echo-cli', 'console.log(JSON.stringify(process.argv.slice(2)))')
/**
 * 冒充 `codegraph init`：真的把 `<target>/.codegraph/codegraph.db` 建出来。
 *
 * 需要它是因为「init 之后 MCP 托管行该出现」这条断言依赖 indexState 真的翻转，而 indexState
 * 判定的是 `.codegraph/` 里有没有索引库——光回显 argv 的 stub 翻不过去。
 *
 * 两种模块形态各来一份：POSIX 上 stub 是 `.mjs`（ESM，没有 `require`），Windows 上是不带
 * `type: module` 的 `.js`（CJS，没有顶层 `import`）。这是 `writeStubCli` 的平台差异决定的。
 */
const INIT_STUB_BODY = [
  'const args = process.argv.slice(2)',
  "if (args[0] === 'init') {",
  '  const target = args[args.length - 1]',
  "  fs.mkdirSync(path.join(target, '.codegraph'), { recursive: true })",
  "  fs.writeFileSync(path.join(target, '.codegraph', 'codegraph.db'), '')",
  '}',
  'console.log(JSON.stringify(args))',
]
const initCli = () =>
  stubCli('init-cli', POSIX
    ? ["import fs from 'node:fs'", "import path from 'node:path'", ...INIT_STUB_BODY].join('\n')
    : ["const fs = require('node:fs')", "const path = require('node:path')", ...INIT_STUB_BODY].join('\n'))
const sleepCli = () => stubCli('sleep-cli', 'setTimeout(() => {}, 3_000)')

interface CapturedRoute {
  kind: string
  path: string
  handler: (req: unknown, res: unknown) => unknown
}

interface FakeReqInit {
  method?: string
  url?: string
  body?: unknown
  /** 原样发送的请求体（用于畸形 / 非 JSON 对象的 body，CG01）。 */
  rawBody?: string
  remoteAddress?: string
  host?: string
}

function fakeReq(init: FakeReqInit = {}): unknown {
  const payload = init.rawBody !== undefined
    ? Buffer.from(init.rawBody)
    : init.body === undefined ? undefined : Buffer.from(JSON.stringify(init.body))
  return {
    method: init.method ?? 'GET',
    url: init.url ?? '/',
    headers: { host: init.host ?? '127.0.0.1:3082' },
    socket: { remoteAddress: init.remoteAddress ?? '127.0.0.1' },
    async *[Symbol.asyncIterator]() {
      if (payload !== undefined) yield payload
    },
  }
}

function fakeRes(onEvent?: (event: string, listener: () => void) => void): { readonly status: number | undefined; readonly body: Record<string, unknown> | undefined; res: unknown } {
  const state: { status?: number; body?: Record<string, unknown> } = {}
  return {
    get status() {
      return state.status
    },
    get body() {
      return state.body
    },
    res: {
      writeHead(status: number) {
        state.status = status
      },
      end(body?: string) {
        state.body = body === undefined ? undefined : (JSON.parse(body) as Record<string, unknown>)
        // 真实 ServerResponse 在 end() 后置位；CG30 的断连判定读的就是它
        ;(state as { writableEnded?: boolean }).writableEnded = true
      },
      on(event: string, listener: () => void) {
        onEvent?.(event, listener)
      },
      get writableEnded() {
        return (state as { writableEnded?: boolean }).writableEnded === true
      },
    },
  }
}

/** 只提供 webServer 的假宿主上下文；settings / systemPrompt 刻意不给。 */
function mountRoutes(command: string, extra: Record<string, unknown> = {}): Map<string, CapturedRoute> {
  const routes = new Map<string, CapturedRoute>()
  const ctx = {
    inject(names: string[], callback: (sub: unknown) => void) {
      if (!names.includes('webServer')) return
      callback({
        effect: (fn: () => unknown) => fn(),
        webServer: {
          register(route: CapturedRoute) {
            routes.set(route.path, route)
            return () => {}
          },
        },
      })
    },
    effect(fn: () => unknown) {
      fn()
    },
  }
  type ApplyArgs = Parameters<typeof apply>
  apply(ctx as unknown as ApplyArgs[0], {
    command,
    defaultPath: project,
    announceToAgent: false,
    usageGuidance: false,
    ...extra,
  } as ApplyArgs[1])
  return routes
}

async function call(
  routes: Map<string, CapturedRoute>,
  path: string,
  init: FakeReqInit = {},
): Promise<{ readonly status: number | undefined; readonly body: Record<string, unknown> | undefined }> {
  const route = routes.get(path)
  expect(route, `未注册路由 ${path}`).toBeDefined()
  const capture = fakeRes()
  await route?.handler(fakeReq(init), capture.res)
  return capture
}

describe('宿主路由（stub CLI）', () => {
  it('index：indexForce 打开时 --force 排在 -- 之前并透传到 CLI', async () => {
    const routes = mountRoutes(echoCli(), { indexForce: true })
    const capture = await call(routes, '/api/dsh-codegraph/index', { method: 'POST', body: { path: project } })
    expect(capture.status).toBe(200)
    expect(String(capture.body?.output)).toContain(JSON.stringify(['index', '--force', '--', project]))
  })

  it('index：indexForce 关闭时不带 --force', async () => {
    const routes = mountRoutes(echoCli())
    const capture = await call(routes, '/api/dsh-codegraph/index', { method: 'POST', body: { path: project } })
    expect(String(capture.body?.output)).toContain(JSON.stringify(['index', '--', project]))
  })

  it('sync：走 `sync -- <path>`', async () => {
    const routes = mountRoutes(echoCli())
    const capture = await call(routes, '/api/dsh-codegraph/sync', { method: 'POST', body: { path: project } })
    expect(String(capture.body?.output)).toContain(JSON.stringify(['sync', '--', project]))
  })

  it('init：只走 `init -- <path>`，既不带 -y 也不带 -f', async () => {
    // `-y` 是 CLI **1.6.0 才有的**旗标，1.5.0 上会 `error: unknown option '-y'` ——
    // 无条件带上它，等于把 init 按钮在旧版 CLI 上做废（本机 Mac 装的正是 1.5.0）。
    // 不带也不会挂起：运行器没有 TTY，两版实测都会自己取默认值跑完。
    // `-f` 不能加：它绕开 CLI 对「家目录 / 文件系统根」的误伤保护，那是用户自己的事。
    //
    // 目标目录**每次现造**，不用共享的 emptyDir：stub init 会真的写下
    // `.codegraph/codegraph.db`（那条副作用正是「init 之后托管行该出现」用例要的），
    // 于是 emptyDir 在第一次 init 之后就不再是空目录——任何复用它跑第二遍的路径
    // （重跑本文件、或另一个进程在这个临时树里跑过同样的用例）都会拿到 409，
    // 表现为「偶发失败」。自造目录让这条用例不再依赖执行顺序与残留状态。
    const fresh = mkdtempSync(join(sandbox, 'init-fresh-'))
    const routes = mountRoutes(echoCli())
    const capture = await call(routes, '/api/dsh-codegraph/init', { method: 'POST', body: { path: fresh } })
    expect(capture.status).toBe(200)
    expect(String(capture.body?.output)).toContain(JSON.stringify(['init', '--', fresh]))
    // 断言要**解析 argv 再逐项比对**，不能在整串输出上做子串否定：
    // `mkdtempSync` 的后缀是随机的，`argv.not.toContain('-y')` 会被路径里偶然出现的
    // `-y`（实测撞到 `…/dsh-cg-route-yoKvfJ/…`）判红——一个「十次里红一次」的假失败，
    // 每次红在不同机器/不同运行上，看起来像产品 bug。同理 `-f` 会被 `-force` 之类命中。
    const argv = JSON.parse(String(capture.body?.output)) as string[]
    expect(argv[0]).toBe('init')
    expect(argv.at(-1)).toBe(fresh)
    // `--` 是位置参数终止符，不是选项；要排除的是 `-y` / `-f` / `--force` 这类真选项
    expect(argv.filter((a) => a.startsWith('-') && a !== '--')).toEqual([])
    expect(argv).toEqual(['init', '--', fresh])
  })

  it('init：已初始化过的目录不重复 init（409），提示改用重建索引', async () => {
    // 同样自造：409 的判定读的是目标目录的索引态，用共享夹具会与上一条互相污染
    const already = mkdtempSync(join(sandbox, 'init-already-'))
    mkdirSync(join(already, '.codegraph'), { recursive: true })
    writeFileSync(join(already, '.codegraph', 'codegraph.db'), '')
    const routes = mountRoutes(echoCli())
    const capture = await call(routes, '/api/dsh-codegraph/init', { method: 'POST', body: { path: already } })
    expect(capture.status).toBe(409)
    expect(String(capture.body?.error)).toContain('重建索引')
  })

  it('init：路径不存在/不是目录时 400，不把字符串直接丢给 CLI', async () => {
    // 这是本插件唯一往用户项目里写东西的入口，不能凭一个字符串就开工
    const routes = mountRoutes(echoCli())
    const missing = await call(routes, '/api/dsh-codegraph/init', { method: 'POST', body: { path: join(sandbox, 'no-such-dir') } })
    expect(missing.status).toBe(400)
    expect(String(missing.body?.error)).toContain('路径不存在')

    const notDir = await call(routes, '/api/dsh-codegraph/init', { method: 'POST', body: { path: someFile } })
    expect(notDir.status).toBe(400)
    expect(String(notDir.body?.error)).toContain('路径不是目录')
  })

  it('init：只认 POST + 回环来源', async () => {
    const routes = mountRoutes(echoCli())
    expect((await call(routes, '/api/dsh-codegraph/init')).status).toBe(405)
    expect((await call(routes, '/api/dsh-codegraph/init', { method: 'POST', remoteAddress: '10.0.0.9' })).status).toBe(403)
  })

  it('init 成功后重算 MCP 托管行：新项目从「未托管」变成「已托管」', async () => {
    // 这是最容易漏掉的那一半：托管行决策读的是 indexState，未索引的目录**不写行**。
    // 如果 init 路由不主动重算，用户初始化完仍然看不到 codegraph MCP 行，得再去动一次
    // 设置才生效——缺口只补了一半。这里用一个「真的会建 .codegraph/codegraph.db」的
    // stub 冒充 CLI，把这条链路整个跑一遍。
    const target = join(sandbox, 'fresh-project')
    mkdirSync(target, { recursive: true })
    const patchFile = join(dshHome, 'cordis.patch.yml')
    try {
      rmSync(patchFile, { force: true })
    } catch {
      /* 不存在就算了 */
    }

    const mount = mountFull(initCli(), { defaultPath: target })
    // 挂载时目录还没索引 → 托管行不该出现
    expect(existsSync(patchFile) ? readFileSync(patchFile, 'utf8') : '').not.toContain('serverName: codegraph')

    const capture = await call(mount.routes, '/api/dsh-codegraph/init', { method: 'POST', body: { path: target } })
    expect(capture.status).toBe(200)
    expect(capture.body?.indexed).toBe(true)

    // 重算之后托管行应当落盘（stub 已把 .codegraph/codegraph.db 建出来）
    const written = readFileSync(patchFile, 'utf8')
    expect(written).toContain('serverName: codegraph')
    expect(written).toContain('serve')
  })

  it('查询类超时：报错点名 cliTimeoutMs', async () => {
    const routes = mountRoutes(sleepCli(), { cliTimeoutMs: 300 })
    const capture = await call(routes, '/api/dsh-codegraph/status', {
      url: `/api/dsh-codegraph/status?path=${encodeURIComponent(project)}`,
    })
    expect(capture.status).toBe(500)
    expect(String(capture.body?.error)).toContain('cliTimeoutMs')
  })

  it('索引类超时：报错点名 indexTimeoutMs（查询档不影响它）', async () => {
    const routes = mountRoutes(sleepCli(), { cliTimeoutMs: 300, indexTimeoutMs: 300 })
    const capture = await call(routes, '/api/dsh-codegraph/index', { method: 'POST', body: { path: project } })
    expect(capture.status).toBe(500)
    expect(String(capture.body?.error)).toContain('indexTimeoutMs')
  })

  it('非回环来源 / 非本机 Host 一律 403', async () => {
    const routes = mountRoutes(echoCli())
    const byAddress = await call(routes, '/api/dsh-codegraph/status', { remoteAddress: '10.0.0.7' })
    expect(byAddress.status).toBe(403)
    const byHost = await call(routes, '/api/dsh-codegraph/status', { host: 'evil.example.com' })
    expect(byHost.status).toBe(403)
  })

  it('方法不符 405', async () => {
    const routes = mountRoutes(echoCli())
    const wrongMethod = await call(routes, '/api/dsh-codegraph/status', { method: 'POST', body: {} })
    expect(wrongMethod.status).toBe(405)
  })
})

/* ------------------------------------------------------------------ *
 * 提示词注入门禁的测试脚手架
 *
 * 假上下文照抄真实 cordis 的形状：`on` 挂在 ctx 自身。DSH ≥0.1.7 的 settings 是
 * `SettingsForms`（describe / update / configure），插件经 kit 的 settingsEntryScope
 * 订阅 `loader/volatile-update`（loader 检出 volatile-only 变更后发的事件）；这里把
 * 这个服务与事件一起假掉，`dispatch` 模拟「外部改了本 entry 的 profile 配置」。
 * ------------------------------------------------------------------ */

interface FakeSection {
  name: string
  order?: number
  text: string
}

interface FullMount {
  routes: Map<string, CapturedRoute>
  sections: Map<string, FakeSection>
  settingsStore: Record<string, unknown>
  updates: Record<string, unknown>[]
  /** 子 fiber 里被吞掉的异常（真实 cordis 也会吞，但要能断言「没有异常」）。 */
  errors: unknown[]
  /** 模拟「外部改了本 entry 的 profile 配置」：写进 store 再发 volatile 事件。 */
  dispatch: (ns: string, next: Record<string, unknown>) => void
}

function mountFull(command: string, extra: Record<string, unknown> = {}): FullMount {
  const routes = new Map<string, CapturedRoute>()
  const sections = new Map<string, FakeSection>()
  const settingsStore: Record<string, unknown> = {}
  const updates: Record<string, unknown>[] = []
  const listeners: Array<() => void> = []
  const errors: unknown[] = []

  const on = (name: string, listener: (...args: unknown[]) => void): (() => void) => {
    if (name !== 'loader/volatile-update') return () => {}
    const entry = listener as () => void
    listeners.push(entry)
    return () => {
      const index = listeners.indexOf(entry)
      if (index !== -1) listeners.splice(index, 1)
    }
  }
  /** loader 检出 volatile-only 变更后发的事件；测试里同步发，省掉真实 loader 的异步。 */
  const emitVolatile = (): void => {
    for (const listener of [...listeners]) listener()
  }
  const settings = {
    describe: () => [{ ns: 'codegraph', value: { ...settingsStore } }],
    update: async (ns: string, patch: Record<string, unknown>) => {
      if (ns !== 'codegraph') throw new Error('未知的 entry: ' + ns)
      updates.push(patch)
      Object.assign(settingsStore, patch)
      emitVolatile()
    },
    configure: () => () => {},
  }
  const systemPrompt = {
    section(section: FakeSection) {
      sections.set(section.name, section)
      return () => sections.delete(section.name)
    },
  }

  const base = { events: { on }, on, effect: (fn: () => unknown) => fn() }
  const ctx = {
    ...base,
    inject(names: string[], callback: (sub: unknown) => void) {
      const sub: Record<string, unknown> = { ...base }
      if (names.includes('webServer')) {
        sub.webServer = {
          register(route: CapturedRoute) {
            routes.set(route.path, route)
            return () => {}
          },
        }
      }
      if (names.includes('settings')) sub.settings = settings
      if (names.includes('systemPrompt')) sub.systemPrompt = systemPrompt
      try {
        callback(sub)
      } catch (error) {
        // 真实 cordis：插件体抛错只让该子 fiber 失败（并写日志），父插件继续。
        errors.push(error)
      }
    },
  }

  type ApplyArgs = Parameters<typeof apply>
  apply(ctx as unknown as ApplyArgs[0], { command, defaultPath: project, ...extra } as ApplyArgs[1])
  return {
    routes,
    sections,
    settingsStore,
    updates,
    errors,
    dispatch: (_ns, next) => {
      Object.assign(settingsStore, next)
      emitVolatile()
    },
  }
}

/** 等异步 CLI 探测落地（探测是 execFile，几十毫秒量级）。 */
async function waitFor(predicate: () => boolean | Promise<boolean>, timeoutMs = 8_000): Promise<void> {
  const start = Date.now()
  while (!(await predicate())) {
    if (Date.now() - start > timeoutMs) throw new Error('等待条件超时')
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
}

const missingCli = () => join(sandbox, 'no-such-codegraph-cli')

describe('systemPrompt 注入门禁（CLI 探测 + settings 开关 + 索引门禁）', () => {
  /** 生效路径落在已索引项目上：两段都该注入。 */
  const indexedDefault = () => indexedProject('gate-indexed-')

  it('CLI 可用且生效路径已索引：注入公告与使用指引两段，且没有子 fiber 异常', async () => {
    const mount = mountFull(echoCli(), { defaultPath: indexedDefault() })
    await waitFor(() => mount.sections.size === 2)
    expect(mount.errors).toEqual([])
    expect([...mount.sections.keys()].sort()).toEqual(['plugin:dsh-codegraph', 'plugin:dsh-codegraph:usage'])
    expect(mount.sections.get('plugin:dsh-codegraph')?.order).toBe(150)
    expect(mount.sections.get('plugin:dsh-codegraph:usage')?.order).toBe(151)
  })

  it('使用指引的触发条件与宿主同口径，shell 兜底用配置里的命令名', async () => {
    const command = echoCli()
    const mount = mountFull(command, { defaultPath: indexedDefault() })
    await waitFor(() => mount.sections.size === 2)
    const usage = mount.sections.get('plugin:dsh-codegraph:usage')?.text ?? ''
    // 触发条件必须落下「有索引库」这层（上游原话只写 directory exists at the repo
    // root，与 indexState 的判定不一致，会把家目录里 CLI 自己的安装目录算成项目索引）。
    expect(usage).toContain('index database')
    expect(usage).not.toContain('directory exists at the repo root')
    // 家目录陷阱要在文案里点破：~/.codegraph 是 CLI 自己的安装目录
    expect(usage).toContain('install dir does not count')
    // 两个 surface 与两条路径的参数名都要在：MCP projectPath / CLI --path
    expect(usage).toContain(`${command} explore`)
    expect(usage).toContain('projectPath')
    expect(usage).toContain('--path')
    expect(usage).toContain('codegraph init')
    expect(usage).not.toContain('(always works)')
  })

  it('P1-a 索引门禁：未索引目录只注入公告段，usage 段不注入', async () => {
    // 判据是「生效路径真是有效索引」：project（harness 的 defaultPath）刻意没有
    // `.codegraph/`。以前只判 CLI 探测 + 开关，于是在没有索引的仓库里也照注入约
    // 300 token 的用法指引——而那段话讲的正是「这个仓库有索引时该怎么做」。
    const mount = mountFull(echoCli())
    await waitFor(() => mount.sections.size === 1)
    expect([...mount.sections.keys()]).toEqual(['plugin:dsh-codegraph'])
    // 公告段讲的是「有这张卡片」，与索引无关，不该跟着一起消失
    expect(mount.sections.get('plugin:dsh-codegraph')?.order).toBe(150)
  })

  it('P1-a 索引门禁：init 之后门禁立刻打开（同一实例，无需重启宿主）', async () => {
    const target = mkdtempSync(join(sandbox, 'gate-init-'))
    const mount = mountFull(initCli(), { defaultPath: target })
    await waitFor(() => mount.sections.size === 1)
    expect([...mount.sections.keys()]).toEqual(['plugin:dsh-codegraph'])

    const created = await call(mount.routes, '/api/dsh-codegraph/init', { method: 'POST', body: { path: target } })
    expect(created.status).toBe(200)

    // init 路由里那次 rt.sync() 会带上 refreshGuidance，门禁应当立刻打开
    await waitFor(() => mount.sections.size === 2)
    expect([...mount.sections.keys()].sort()).toEqual(['plugin:dsh-codegraph', 'plugin:dsh-codegraph:usage'])
  })

  it('P1-a 索引门禁：跟随会话切进/切出已索引项目时 usage 段跟着增删', async () => {
    // 判据是**生效路径**（effectiveProjectPath）：这里默认项目刻意未索引，
    // 于是「跟随到一个已索引的会话目录」= 生效路径变已索引 → usage 出现；
    // 会话切回未索引目录 → 生效路径回落 → usage 撤回。
    const plainDefault = mkdtempSync(join(sandbox, 'gate-follow-plain-'))
    const indexed = indexedProject('gate-follow-indexed-')
    const mount = mountFull(echoCli(), { defaultPath: plainDefault })
    await waitFor(() => mount.sections.size === 1)
    expect([...mount.sections.keys()]).toEqual(['plugin:dsh-codegraph'])

    const followed = await call(mount.routes, '/api/dsh-codegraph/follow', { method: 'POST', body: { path: indexed } })
    expect(followed.body?.effectivePath).toBe(indexed)
    await waitFor(() => mount.sections.size === 2)
    expect([...mount.sections.keys()].sort()).toEqual(['plugin:dsh-codegraph', 'plugin:dsh-codegraph:usage'])

    // 切回未索引目录：生效路径回落到未索引的默认项目 → usage 段撤回
    const back = await call(mount.routes, '/api/dsh-codegraph/follow', { method: 'POST', body: { path: plainDefault } })
    expect(back.body?.effectivePath).toBe(plainDefault)
    await waitFor(() => mount.sections.size === 1)
    expect([...mount.sections.keys()]).toEqual(['plugin:dsh-codegraph'])
  })

  it('CLI 不可用：两段都不注入，GET /default-path 报 cliAvailable=false', async () => {
    const mount = mountFull(missingCli())
    // 探测未落地时 JSON 里没有 cliAvailable（区分「还没探测完」与「确认不可用」）
    const first = await call(mount.routes, '/api/dsh-codegraph/default-path')
    expect(first.body?.cliAvailable).toBeUndefined()
    let cliAvailable: unknown
    await waitFor(async () => {
      cliAvailable = (await call(mount.routes, '/api/dsh-codegraph/default-path')).body?.cliAvailable
      return cliAvailable === false
    })
    expect(cliAvailable).toBe(false)
    // 探测失败时卡片要报出被探测的命令名，便于让用户把 command 加成绝对路径
    const withCommand = await call(mount.routes, '/api/dsh-codegraph/default-path')
    expect(withCommand.body?.command).toBe(missingCli())
    expect(mount.sections.size).toBe(0)
  })

  it('探测失败带出实测原因：命令不存在时是「找不到命令」的实测原文，不是泛泛一句「探测不到」', async () => {
    // 报告 #3（外部真机缺陷报告的序号，**不是本包台账的编号**）：probeCli 原先把 error 直接丢掉，于是卡片只能猜原因，
    // 用户与作者都分不清「没装 / 装错 / 超时」。
    //
    // 「命令不存在」的实测原文是**平台相关**的（真机实测，见脚本
    // scripts/windows/verify-windows-e2e.mjs 的 D3 段）：
    //   - POSIX：execFile 直接给 `spawn … ENOENT`；
    //   - Windows：命令经 cmd.exe（见 runViaWindowsShim），找不到命令是 **cmd.exe
    //     自己的报错**——中文区「不是内部或外部命令」，英文区「is not recognized as
    //     an internal or external command」，两者都不含 ENOENT。
    // 所以不能硬编码 ENOENT；两边共同的可断言点是「原因里带出了被探测的命令名」。
    const mount = mountFull(missingCli())
    await waitFor(async () => (await call(mount.routes, '/api/dsh-codegraph/default-path')).body?.cliAvailable === false)
    const capture = await call(mount.routes, '/api/dsh-codegraph/default-path')
    const detail = String(capture.body?.cliProbeError ?? '')
    expect(detail).not.toBe('')
    expect(detail).toContain('no-such-codegraph-cli')
    if (POSIX) expect(detail).toContain('ENOENT')
    else expect(detail).toMatch(/不是内部或外部命令|is not recognized as an internal or external command/)
    // 实测时刻要带出去：卡片据此显示「上次探测」，也让「重新探测」有可见反馈
    expect(typeof capture.body?.cliProbeAt).toBe('number')
  })

  it('非零退出的失败原因与 ENOENT 可区分（不是同一句文案）', async () => {
    const failing = stubCli('exit-cli', 'console.error("boom: not a codegraph CLI"); process.exit(3)')
    const mount = mountFull(failing)
    await waitFor(async () => (await call(mount.routes, '/api/dsh-codegraph/default-path')).body?.cliAvailable === false)
    const capture = await call(mount.routes, '/api/dsh-codegraph/default-path')
    const detail = String(capture.body?.cliProbeError ?? '')
    expect(detail).toContain('boom: not a codegraph CLI')
    expect(detail).not.toContain('ENOENT')
  })

  it('重新探测：CLI 在挂载之后才出现时，无需重启宿主即可恢复（报告 #1 的复现步骤）', async () => {
    // 报告 #1 的确定性复现：挂载时 command 指向一个还不存在的绝对路径，
    // 之后把 CLI 补上——原实现里 cliAvailable 是挂载时锁存的布尔，任何刷新都读同一个
    // 缓存，用户会陷在「按提示刷新 → 永远不恢复」里。POST /reprobe 是那个出口。
    const late = join(sandbox, POSIX ? 'late-cli.mjs' : 'late-cli.cmd')
    const indexed = indexedProject('gate-late-')
    const mount = mountFull(late, { defaultPath: indexed })
    await waitFor(async () => (await call(mount.routes, '/api/dsh-codegraph/default-path')).body?.cliAvailable === false)
    expect(mount.sections.size).toBe(0)

    // 只把 CLI 文件补上：不动补丁、不重启宿主
    writeStubCliAt(late, 'console.log("9.9.9")')

    const reprobed = await call(mount.routes, '/api/dsh-codegraph/reprobe', { method: 'POST' })
    expect(reprobed.status).toBe(200)
    expect(reprobed.body?.cliAvailable).toBe(true)
    expect(reprobed.body?.cliProbeError).toBeUndefined()

    // 探测结果要真的推到 systemPrompt 门禁上，而不是只回给卡片。
    // 生效路径是已索引目录，所以两段都该出现。
    const after = await call(mount.routes, '/api/dsh-codegraph/default-path')
    expect(after.body?.cliAvailable).toBe(true)
    await waitFor(() => mount.sections.size === 2)
    expect([...mount.sections.keys()].sort()).toEqual(['plugin:dsh-codegraph', 'plugin:dsh-codegraph:usage'])
  })

  it('重新探测：仍然不可用时如实回报，且 GET 不允许触发（有副作用）', async () => {
    const mount = mountFull(missingCli())
    await waitFor(async () => (await call(mount.routes, '/api/dsh-codegraph/default-path')).body?.cliAvailable === false)
    const again = await call(mount.routes, '/api/dsh-codegraph/reprobe', { method: 'POST' })
    expect(again.body?.cliAvailable).toBe(false)
    // 同样不能硬编码 ENOENT：Windows 上走 cmd.exe，「找不到命令」是 cmd 自己的原文
    expect(String(again.body?.cliProbeError ?? '')).toContain('no-such-codegraph-cli')
    // 重探会真的起一个子进程，所以只认 POST
    const viaGet = await call(mount.routes, '/api/dsh-codegraph/reprobe')
    expect(viaGet.status).toBe(405)
    // 非回环来源一律拒绝
    const remote = await call(mount.routes, '/api/dsh-codegraph/reprobe', { method: 'POST', remoteAddress: '10.0.0.9' })
    expect(remote.status).toBe(403)
  })

  it('安装级开关关闭：对应段落不注入', async () => {
    const indexed = indexedDefault()
    const onlyUsage = mountFull(echoCli(), { defaultPath: indexed, announceToAgent: false })
    await waitFor(() => onlyUsage.sections.size === 1)
    expect([...onlyUsage.sections.keys()]).toEqual(['plugin:dsh-codegraph:usage'])

    const onlyAnnounce = mountFull(echoCli(), { defaultPath: indexed, usageGuidance: false })
    await waitFor(() => onlyAnnounce.sections.size === 1)
    expect([...onlyAnnounce.sections.keys()]).toEqual(['plugin:dsh-codegraph'])

    const none = mountFull(echoCli(), { defaultPath: indexed, announceToAgent: false, usageGuidance: false })
    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(none.sections.size).toBe(0)
  })

  it('settings/updated 订阅真的生效：外部写入收紧开关即撤销段落', async () => {
    const mount = mountFull(echoCli(), { defaultPath: indexedDefault() })
    await waitFor(() => mount.sections.size === 2)
    mount.dispatch('codegraph', { usageGuidance: false })
    await waitFor(() => mount.sections.size === 1)
    expect([...mount.sections.keys()]).toEqual(['plugin:dsh-codegraph'])
  })

  it('卡片改开关：POST /settings 持久化并即时生效', async () => {
    const mount = mountFull(echoCli(), { defaultPath: indexedDefault() })
    await waitFor(() => mount.sections.size === 2)
    const capture = await call(mount.routes, '/api/dsh-codegraph/settings', {
      method: 'POST',
      body: { announceToAgent: false, usageGuidance: true },
    })
    expect(capture.status).toBe(200)
    expect(capture.body?.announceToAgent).toBe(false)
    expect(mount.updates).toEqual([{ announceToAgent: false, usageGuidance: true }])
    await waitFor(() => mount.sections.size === 1)
    expect([...mount.sections.keys()]).toEqual(['plugin:dsh-codegraph:usage'])
  })

  it('POST /settings 只收布尔字段', async () => {
    const mount = mountFull(echoCli())
    const bad = await call(mount.routes, '/api/dsh-codegraph/settings', { method: 'POST', body: { announceToAgent: 'yes' } })
    expect(bad.status).toBe(400)
    const empty = await call(mount.routes, '/api/dsh-codegraph/settings', { method: 'POST', body: { defaultPath: '/tmp' } })
    expect(empty.status).toBe(400)
    expect(empty.body?.error).toContain('缺少可写字段')
  })
})

describe('跟随活动会话（POST /follow）', () => {
  /** harness 里的默认项目路径（插件配置 defaultPath）。 */
  const project_original = project

  it('会话切到已索引项目：托管行 cwd 对齐它，默认项目保持不变', async () => {
    const project = indexedProject('follow-a')
    const mount = mountFull(echoCli())
    const capture = await call(mount.routes, '/api/dsh-codegraph/follow', { method: 'POST', body: { path: project } })
    expect(capture.status).toBe(200)
    expect(capture.body?.sessionPath).toBe(project)
    expect(capture.body?.effectivePath).toBe(project)
    expect(capture.body?.followSession).toBe(true)
    expect(capture.body?.indexed).toBe(true)
    // defaultPath 仍是插件配置里那个（未被跟随改写）
    expect(capture.body?.defaultPath).toBe(project_original)
  })

  it('会话目录没有索引：回落到默认项目并给出 note', async () => {
    const plain = mkdtempSync(join(sandbox, 'follow-plain-'))
    const mount = mountFull(echoCli())
    const capture = await call(mount.routes, '/api/dsh-codegraph/follow', { method: 'POST', body: { path: plain } })
    expect(capture.status).toBe(200)
    expect(capture.body?.effectivePath).toBe(project_original)
    expect(capture.body?.sessionPath).toBe(plain)
    expect(capture.body?.sessionPathState).toBe('missing')
    expect(String(capture.body?.note)).toContain('回落到默认项目')
  })

  it('默认路径已索引、会话目录未索引：仍然要给回落提示（判定看上报路径，不是生效路径）', async () => {
    const indexed = indexedProject('follow-default-indexed')
    const plain = mkdtempSync(join(sandbox, 'follow-session-plain-'))
    const mount = mountFull(echoCli(), { defaultPath: indexed })
    const capture = await call(mount.routes, '/api/dsh-codegraph/follow', { method: 'POST', body: { path: plain } })
    // 生效路径回落到已索引的默认项目 → indexed=true，但这次上报确实被回落了，必须说清楚
    expect(capture.body?.effectivePath).toBe(indexed)
    expect(capture.body?.indexed).toBe(true)
    expect(capture.body?.sessionPathState).toBe('missing')
    expect(String(capture.body?.note)).toContain('回落到默认项目')
  })

  it('跟随关闭时：/follow 只记录，不改生效路径', async () => {
    const project = indexedProject('follow-off')
    const mount = mountFull(echoCli(), { followSession: false })
    const capture = await call(mount.routes, '/api/dsh-codegraph/follow', { method: 'POST', body: { path: project } })
    expect(capture.body?.followSession).toBe(false)
    expect(capture.body?.effectivePath).toBe(project_original)
    expect(String(capture.body?.note)).toContain('跟随已关闭')
  })

  it('空 path（无活动会话）：清掉上报值并回落', async () => {
    const project = indexedProject('follow-clear')
    const mount = mountFull(echoCli())
    await call(mount.routes, '/api/dsh-codegraph/follow', { method: 'POST', body: { path: project } })
    const cleared = await call(mount.routes, '/api/dsh-codegraph/follow', { method: 'POST', body: { path: '' } })
    expect(cleared.body?.sessionPath).toBeNull()
    expect(cleared.body?.effectivePath).toBe(project_original)
  })

  it('「设为默认项目」会关掉跟随（显式指定不被会话顶掉）', async () => {
    const project = indexedProject('follow-pin')
    const mount = mountFull(echoCli())
    await call(mount.routes, '/api/dsh-codegraph/follow', { method: 'POST', body: { path: project } })
    const pinned = await call(mount.routes, '/api/dsh-codegraph/default-path', { method: 'POST', body: { path: project } })
    expect(pinned.status).toBe(200)
    expect(pinned.body?.followSession).toBe(false)
    expect(mount.updates.at(-1)).toMatchObject({ defaultPath: project, followSession: false })
  })

  it('settings 里可以开关 followSession', async () => {
    const mount = mountFull(echoCli())
    const capture = await call(mount.routes, '/api/dsh-codegraph/settings', { method: 'POST', body: { followSession: false } })
    expect(capture.status).toBe(200)
    expect(capture.body?.followSession).toBe(false)
    expect(mount.settingsStore).toMatchObject({ followSession: false })
  })

  it('CG62：/default-path 只改 defaultPath 与跟随，不重置其它 settings 键', async () => {
    // 旧实现把 `{ defaultPath, followSession:false }` 这个**部分对象**喂给 sync()，
    // 而 resolveStored 的语义是「传进来的对象里没有的键 → 回落插件配置默认值」——
    // 于是 mcpScope / mcpIntegration / announceToAgent / usageGuidance 四个键会在内存里
    // 被静默重置（文件没丢 → 重启又「好了」，表现为时好时坏）。
    // 实测复现：勾上 per-agent 后点一次项目胶囊，mcpScope 当场退回 managed 并把全局托管行写回。
    const indexed = indexedProject('cg62-')
    const mount = mountFull(echoCli())
    const set = await call(mount.routes, '/api/dsh-codegraph/settings', {
      method: 'POST',
      body: { mcpScope: 'per-agent', mcpIntegration: false, announceToAgent: false, usageGuidance: false },
    })
    expect(set.status).toBe(200)
    expect(set.body?.mcpScope).toBe('per-agent')

    // 点一次「设为默认项目」/ 项目胶囊
    const pinned = await call(mount.routes, '/api/dsh-codegraph/default-path', { method: 'POST', body: { path: indexed } })
    expect(pinned.status).toBe(200)
    expect(pinned.body?.defaultPath).toBe(indexed)
    expect(pinned.body?.followSession).toBe(false)

    // 四个键都必须还在（旧实现全被打回插件配置默认值：managed / true / true / true）
    const after = await call(mount.routes, '/api/dsh-codegraph/default-path', { method: 'GET' })
    expect(after.body?.mcpScope, 'mcpScope 不该被 /default-path 重置').toBe('per-agent')
    expect(after.body?.manageEnabled, 'mcpIntegration 不该被重置').toBe(false)
    expect(after.body?.announceToAgent, 'announceToAgent 不该被重置').toBe(false)
    expect(after.body?.usageGuidance, 'usageGuidance 不该被重置').toBe(false)
    // 生效路径仍然按本次绑定走
    expect(after.body?.defaultPath).toBe(indexed)
  })
})

/* ------------------------------------------------------------------ *
 * 0.4.2 修复回归（CG01 / CG02 / CG05 / CG07 / CG09 / CG10 / CG25 / CG27）
 * ------------------------------------------------------------------ */

describe('CG01：POST body 畸形/非对象一律 400，不再静默改用默认项目', () => {
  it('sync / index / init / follow / default-path / settings 都拒收', async () => {
    const routes = mountRoutes(echoCli())
    for (const route of ['sync', 'index', 'init', 'follow', 'default-path', 'settings']) {
      const malformed = await call(routes, `/api/dsh-codegraph/${route}`, { method: 'POST', rawBody: '{oops' })
      expect(malformed.status, route).toBe(400)
      expect(String(malformed.body?.error)).toContain('invalid JSON body')
      const array = await call(routes, `/api/dsh-codegraph/${route}`, { method: 'POST', rawBody: '[1,2]' })
      expect(array.status, route).toBe(400)
    }
  })

  it('空对象仍是合法的「用户没指定路径」——走默认项目', async () => {
    const routes = mountRoutes(echoCli())
    const capture = await call(routes, '/api/dsh-codegraph/sync', { method: 'POST', body: {} })
    expect(capture.status).toBe(200)
    expect(String(capture.body?.output)).toContain(JSON.stringify(['sync', '--', project]))
  })
})

describe('CG02：路由层的祖先口径', () => {
  /** 造一个已索引的「仓库」与其子目录。 */
  function repoWithSub(): { root: string; sub: string } {
    const root = mkdtempSync(join(sandbox, 'cg02-root-'))
    mkdirSync(join(root, '.codegraph'), { recursive: true })
    writeFileSync(join(root, '.codegraph', 'codegraph.db'), '')
    const sub = join(root, 'packages', 'app')
    mkdirSync(sub, { recursive: true })
    return { root, sub }
  }

  it('「设为默认项目」绑定的是索引所在的仓库根', async () => {
    const { root, sub } = repoWithSub()
    const mount = mountFull(echoCli(), { defaultPath: project })
    const capture = await call(mount.routes, '/api/dsh-codegraph/default-path', { method: 'POST', body: { path: sub } })
    expect(capture.status).toBe(200)
    expect(capture.body?.defaultPath).toBe(root)
    expect(mount.updates.at(-1)).toMatchObject({ defaultPath: root, followSession: false })
  })

  it('跟随命中子目录时托管行 cwd 对齐仓库根，且不再误报回落', async () => {
    const { root, sub } = repoWithSub()
    const mount = mountFull(echoCli())
    const capture = await call(mount.routes, '/api/dsh-codegraph/follow', { method: 'POST', body: { path: sub } })
    expect(capture.status).toBe(200)
    expect(capture.body?.effectivePath).toBe(root)
    expect(capture.body?.sessionPathState).toBe('indexed')
    expect(capture.body?.note).toBeUndefined()
  })

  it('子目录里点「初始化索引」→ 409（祖先已有索引，不再诱导嵌套 init）', async () => {
    const { sub } = repoWithSub()
    const routes = mountRoutes(echoCli())
    const capture = await call(routes, '/api/dsh-codegraph/init', { method: 'POST', body: { path: sub } })
    expect(capture.status).toBe(409)
    expect(String(capture.body?.error)).toContain('祖先')
  })
})

describe('CG05：超时/取消的兜底', () => {
  it('请求断连（res close 且未写完）会中止正在跑的索引命令（CG30）', async () => {
    const routes = mountRoutes(sleepCli(), { indexTimeoutMs: 10_000 })
    let fireClose: (() => void) | undefined
    const capture = fakeRes((event, listener) => {
      if (event === 'close') fireClose = listener
    })
    const pending = routes.get('/api/dsh-codegraph/index')!.handler(
      fakeReq({ method: 'POST', body: { path: project } }),
      capture.res,
    )
    await new Promise((resolve) => setTimeout(resolve, 80))
    expect(fireClose, '路由应在 res 上注册 close 监听').toBeTypeOf('function')
    fireClose?.()
    await pending
    expect(capture.status).toBe(500)
    expect(String(capture.body?.error)).toContain('已取消')
  })

  it('POST /cancel 能取消登记中的索引命令；空表时 cancelled=0', async () => {
    const routes = mountRoutes(sleepCli(), { indexTimeoutMs: 10_000 })
    const capture = fakeRes()
    const pending = routes.get('/api/dsh-codegraph/index')!.handler(fakeReq({ method: 'POST', body: { path: project } }), capture.res)
    await new Promise((resolve) => setTimeout(resolve, 80))
    const cancel = await call(routes, '/api/dsh-codegraph/cancel', { method: 'POST', body: { path: project } })
    expect(cancel.status).toBe(200)
    expect(cancel.body?.cancelled).toBe(1)
    await pending
    expect(capture.status).toBe(500)
    expect(String(capture.body?.error)).toContain('已取消')
    const again = await call(routes, '/api/dsh-codegraph/cancel', { method: 'POST', body: { path: project } })
    expect(again.body?.cancelled).toBe(0)
  })

  it('CG52：uninit 在子目录发起时，按「卡片发的那个路径」也能取消（且只算一次）', async () => {
    // uninit 的 CLI cwd 用**索引根**（CG02），但卡片「取消」发的是它输入框里的路径——
    // 只登记根的话，用户在 monorepo 子目录上点取消会拿到 cancelled=0，界面却照样说
    // 「已发送取消请求」。所以两个键都登记；`cancelled` 再按 controller 去重。
    const root = indexedProject('cg52-root-')
    const sub = join(root, 'packages', 'sub')
    mkdirSync(sub, { recursive: true })
    const routes = mountRoutes(sleepCli(), { indexTimeoutMs: 10_000 })

    const capture = fakeRes()
    const pending = routes.get('/api/dsh-codegraph/uninit')!.handler(fakeReq({ method: 'POST', body: { path: sub } }), capture.res)
    await new Promise((resolve) => setTimeout(resolve, 80))
    const bySubdir = await call(routes, '/api/dsh-codegraph/cancel', { method: 'POST', body: { path: sub } })
    expect(bySubdir.status).toBe(200)
    expect(bySubdir.body?.cancelled).toBe(1)
    await pending
    expect(String(capture.body?.error)).toContain('已取消')

    // 不带 path（= 全部）：同一次运行登记在两个键下，只能算 1 次
    const capture2 = fakeRes()
    const pending2 = routes.get('/api/dsh-codegraph/uninit')!.handler(fakeReq({ method: 'POST', body: { path: sub } }), capture2.res)
    await new Promise((resolve) => setTimeout(resolve, 80))
    const all = await call(routes, '/api/dsh-codegraph/cancel', { method: 'POST', body: {} })
    expect(all.body?.cancelled).toBe(1)
    await pending2
  })

  it('CG53：/cancel 的畸形 body 回 400，且**没有**顺手取消任何运行', async () => {
    // 以前 /cancel 用裸 readBody，把「body 没读出来」当成「没指定 path」→ 一个被截断的
    // `{path:"x"}` 会**升级**成「取消全部」，把别的项目正在跑的索引一起杀掉。
    const routes = mountRoutes(sleepCli(), { indexTimeoutMs: 10_000 })
    const capture = fakeRes()
    const pending = routes.get('/api/dsh-codegraph/index')!.handler(fakeReq({ method: 'POST', body: { path: project } }), capture.res)
    await new Promise((resolve) => setTimeout(resolve, 80))
    const bad = await call(routes, '/api/dsh-codegraph/cancel', { method: 'POST', rawBody: '{"path":' })
    expect(bad.status).toBe(400)
    expect(String(bad.body?.error)).toContain('invalid JSON body')
    // 运行还在（证明 400 那一步没有把全部杀掉）：合法 body 才取消
    const ok = await call(routes, '/api/dsh-codegraph/cancel', { method: 'POST', body: { path: project } })
    expect(ok.body?.cancelled).toBe(1)
    await pending
    expect(String(capture.body?.error)).toContain('已取消')
  })

  it('CG53：`{}`（合法 JSON、未指定 path）仍然 = 取消全部', async () => {
    const routes = mountRoutes(sleepCli(), { indexTimeoutMs: 10_000 })
    const capture = fakeRes()
    const pending = routes.get('/api/dsh-codegraph/index')!.handler(fakeReq({ method: 'POST', body: { path: project } }), capture.res)
    await new Promise((resolve) => setTimeout(resolve, 80))
    const all = await call(routes, '/api/dsh-codegraph/cancel', { method: 'POST', body: {} })
    expect(all.status).toBe(200)
    expect(all.body?.cancelled).toBe(1)
    await pending
  })

  it('CG54：探测尚未落地时 /diagnose 会补一次探测，报告给出确定结论', async () => {
    // `--version` 故意慢：让「挂载期探测仍在途」这个窗口稳定可复现。
    // 补探测之前，报告里会是 `CLI 探测：尚未探测`——正是注释说「给一个空字段等于让
    // 提问者再猜一轮」要避免的那种状态（README 也一直写着「它可能补跑一次探测」）。
    const slowProbe = stubCli('cg54-slow-cli', 'setTimeout(() => { console.log("1.6.0") }, 700)')
    const routes = mountRoutes(slowProbe, { announceToAgent: false, usageGuidance: false })
    const capture = await call(routes, '/api/dsh-codegraph/diagnose', {
      method: 'GET',
      url: '/api/dsh-codegraph/diagnose?path=' + encodeURIComponent(project),
    })
    expect(capture.status).toBe(200)
    const report = String(capture.body?.report)
    expect(report, '补探测之后不该再是「尚未探测」').not.toContain('尚未探测')
    expect(report).toContain('CLI 探测：可用')
  })
})

describe('CG07：/follow 不再零校验落盘', () => {
  it('路径不存在 → 400，sessionPath 不被污染', async () => {
    const mount = mountFull(echoCli())
    const missing = await call(mount.routes, '/api/dsh-codegraph/follow', { method: 'POST', body: { path: join(sandbox, 'no-such-dir-cg07') } })
    expect(missing.status).toBe(400)
    expect(String(missing.body?.error)).toContain('路径不存在')
    // 合法但未索引的目录仍然接受（回落语义在 effectiveProjectPath 里）
    const plain = mkdtempSync(join(sandbox, 'cg07-plain-'))
    const ok = await call(mount.routes, '/api/dsh-codegraph/follow', { method: 'POST', body: { path: plain } })
    expect(ok.status).toBe(200)
  })
})

describe('CG09/CG10：查询族路由的 argv 与参数校验', () => {
  it('位置参数前带 -- 终止符；node 刻意不带 --json（CG27 钉住）', async () => {
    const routes = mountRoutes(echoCli())
    const pathParam = `path=${encodeURIComponent(project)}`
    const query = await call(routes, '/api/dsh-codegraph/query', { url: `/api/dsh-codegraph/query?q=-abc&${pathParam}` })
    expect(query.status).toBe(200)
    expect(String(query.body?.raw)).toContain(JSON.stringify(['query', '--json', '--path', project, '--limit', '10', '--', '-abc']))
    const callers = await call(routes, '/api/dsh-codegraph/callers', { url: `/api/dsh-codegraph/callers?symbol=-h&${pathParam}` })
    expect(String(callers.body?.raw)).toContain(JSON.stringify(['callers', '--json', '--path', project, '--', '-h']))
    const callees = await call(routes, '/api/dsh-codegraph/callees', { url: `/api/dsh-codegraph/callees?symbol=-h&${pathParam}` })
    expect(String(callees.body?.raw)).toContain(JSON.stringify(['callees', '--json', '--path', project, '--', '-h']))
    const impact = await call(routes, '/api/dsh-codegraph/impact', { url: `/api/dsh-codegraph/impact?symbol=x&depth=3&${pathParam}` })
    expect(String(impact.body?.raw)).toContain(JSON.stringify(['impact', '--json', '--path', project, '--depth', '3', '--', 'x']))
    const node = await call(routes, '/api/dsh-codegraph/node', { url: `/api/dsh-codegraph/node?name=y&${pathParam}` })
    expect(String(node.body?.raw)).toContain(JSON.stringify(['node', '--path', project, '--', 'y']))
    expect(String(node.body?.raw)).not.toContain('--json')
  })

  it('limit/depth 非法值 400；limit 上限钳到 10000', async () => {
    const routes = mountRoutes(echoCli())
    const pathParam = `path=${encodeURIComponent(project)}`
    for (const bad of ['-1', '0', 'abc']) {
      expect((await call(routes, '/api/dsh-codegraph/query', { url: `/api/dsh-codegraph/query?q=x&limit=${bad}&${pathParam}` })).status).toBe(400)
      expect((await call(routes, '/api/dsh-codegraph/impact', { url: `/api/dsh-codegraph/impact?symbol=x&depth=${bad}&${pathParam}` })).status).toBe(400)
    }
    // depth 不做上限钳制（CLI 自己夹到 10，实测）；limit 钳住，避免 99999999999 的静默空结果
    const huge = await call(routes, '/api/dsh-codegraph/query', { url: `/api/dsh-codegraph/query?q=x&limit=99999999999&${pathParam}` })
    expect(huge.status).toBe(200)
    expect(String(huge.body?.raw)).toContain('"--limit","10000"')
  })

  it('路径不存在 → 400（CLI 对不存在的路径会静默回空结果）', async () => {
    const routes = mountRoutes(echoCli())
    const missing = `path=${encodeURIComponent(join(sandbox, 'no-such-dir-cg10'))}`
    for (const route of ['status', 'query?q=x', 'callers?symbol=x', 'callees?symbol=x', 'impact?symbol=x', 'node?name=x']) {
      const sep = route.includes('?') ? '&' : '?'
      const capture = await call(routes, `/api/dsh-codegraph/${route.split('?')[0]}`, { url: `/api/dsh-codegraph/${route}${sep}${missing}` })
      expect(capture.status, route).toBe(400)
      expect(String(capture.body?.error)).toContain('路径不存在')
    }
  })
})

describe('CG25：并存实例（同名不同 id）的设置互不串台', () => {
  it('第二份实例写 settings，第一份实例的路由读到的是自己的值', async () => {
    const first = mountFull(echoCli())
    const second = mountFull(echoCli())
    await call(second.routes, '/api/dsh-codegraph/settings', { method: 'POST', body: { usageGuidance: false } })
    const firstState = await call(first.routes, '/api/dsh-codegraph/default-path')
    expect(firstState.body?.usageGuidance).toBe(true)
    const secondState = await call(second.routes, '/api/dsh-codegraph/default-path')
    expect(secondState.body?.usageGuidance).toBe(false)
  })
})

describe('CG27：query/callers/callees/impact/node 的三态覆盖', () => {
  it('缺参 400 / 正常 200', async () => {
    const routes = mountRoutes(echoCli())
    expect((await call(routes, '/api/dsh-codegraph/query')).status).toBe(400)
    expect((await call(routes, '/api/dsh-codegraph/callers')).status).toBe(400)
    expect((await call(routes, '/api/dsh-codegraph/callees')).status).toBe(400)
    expect((await call(routes, '/api/dsh-codegraph/impact')).status).toBe(400)
    expect((await call(routes, '/api/dsh-codegraph/node')).status).toBe(400)
    const pathParam = `path=${encodeURIComponent(project)}`
    for (const route of ['query?q=ok', 'callers?symbol=ok', 'callees?symbol=ok', 'impact?symbol=ok', 'node?name=ok']) {
      const capture = await call(routes, `/api/dsh-codegraph/${route.split('?')[0]}`, { url: `/api/dsh-codegraph/${route}&${pathParam}` })
      expect(capture.status, route).toBe(200)
    }
  })

  it('CLI 非零退出 → 500 且 stderr 原文可见', async () => {
    const failing = stubCli('exit-cli-cg27', 'console.error("boom-cg27"); process.exit(3)')
    const routes = mountRoutes(failing)
    const capture = await call(routes, '/api/dsh-codegraph/query', { url: `/api/dsh-codegraph/query?q=x&path=${encodeURIComponent(project)}` })
    expect(capture.status).toBe(500)
    expect(String(capture.body?.error)).toContain('boom-cg27')
  })

  it('node 的 file 参数以 - 开头 → 400（commander 会把它当值吃掉）', async () => {
    const routes = mountRoutes(echoCli())
    const capture = await call(routes, '/api/dsh-codegraph/node', { url: `/api/dsh-codegraph/node?name=x&file=-weird&path=${encodeURIComponent(project)}` })
    expect(capture.status).toBe(400)
    expect(String(capture.body?.error)).toContain('file 不能以 - 开头')
  })
})

/* ------------------------------------------------------------------ *
 * P1-b：诊断包（GET /diagnose）
 *
 * 这个路由的价值全在「原文」上——CLI 探测失败的实测原因、补丁区块的形状、
 * daemon 登记的 pid 与版本、最近一次 CLI 失败。所以测的重点是「该有的段落都在、
 * 该带的原因都带出来了」，外加两条纪律：**只认 GET + 回环**，以及**补丁值必须脱敏**
 * （它会被贴进 issue，而同一份文件里还有别的 MCP 服务器的 token）。
 * ------------------------------------------------------------------ */

describe('P1-b：诊断包（GET /diagnose）', () => {
  it('汇总各段落：版本/平台、探测原文、索引状态、托管行、daemon、最近失败', async () => {
    const indexed = indexedProject('diagnose-indexed-')
    const mount = mountFull(echoCli(), { defaultPath: indexed })
    await waitFor(async () => (await call(mount.routes, '/api/dsh-codegraph/default-path')).body?.cliAvailable === true)

    const capture = await call(mount.routes, '/api/dsh-codegraph/diagnose', {
      url: `/api/dsh-codegraph/diagnose?path=${encodeURIComponent(indexed)}`,
    })
    expect(capture.status).toBe(200)
    const report = String(capture.body?.report ?? '')
    expect(report).not.toBe('')
    // 首行要能回答「你装的是哪个版本 / 什么平台」
    expect(report).toContain('@hyzyn/dsh-codegraph')
    expect(report).toContain(process.platform)
    // CLI 与索引
    expect(report).toContain('CLI 探测：可用')
    expect(report).toContain(echoCli())
    expect(report).toContain(`索引状态：indexed`)
    // 托管行段落与补丁区块
    expect(report).toContain('托管行')
    expect(report).toContain('cordis.patch.yml')
    // daemon 段落：本机 sandbox 里没有 ~/.codegraph，要如实说「不存在」而不是省略
    expect(report).toContain('daemon')
    // 没有失败记录时也要给出这句，而不是空着（空着会被读成「没这一项」）
    expect(report).toContain('没有失败记录')
    // 路径是原文，不做「友好化」裁剪
    expect(report).toContain(indexed)
  })

  it('探测不可用时带出实测原文（含被探测的命令名）', async () => {
    const mount = mountFull(missingCli())
    await waitFor(async () => (await call(mount.routes, '/api/dsh-codegraph/default-path')).body?.cliAvailable === false)
    const capture = await call(mount.routes, '/api/dsh-codegraph/diagnose')
    const report = String(capture.body?.report ?? '')
    expect(report).toContain('CLI 探测：不可用')
    expect(report).toContain('实测原因：')
    expect(report).toContain('no-such-codegraph-cli')
  })

  it('最近一次 CLI 失败被记进诊断包（含 kind 与路径）', async () => {
    const failing = stubCli('exit-cli-diagnose', 'console.error("diag-boom"); process.exit(4)')
    const mount = mountFull(failing)
    const failed = await call(mount.routes, '/api/dsh-codegraph/query', {
      url: `/api/dsh-codegraph/query?q=x&path=${encodeURIComponent(project)}`,
    })
    expect(failed.status).toBe(500)

    const capture = await call(mount.routes, '/api/dsh-codegraph/diagnose')
    const report = String(capture.body?.report ?? '')
    expect(report).toContain('最近一次 CLI 失败')
    expect(report).toContain('diag-boom')
    expect(report).toContain('[cli]')
    expect(report).toContain(project)
  })

  it('补丁区块按【键名】脱敏：要看的键留值，凭据键的值连子树一起抹掉', async () => {
    // 写一份带别家服务器凭据的补丁。诊断包会被贴进 issue，同一份文件里的 token
    // 绝不能跟着出去；但 serverName / cwd / command 这些**正是排查要看的东西**，
    // 一并不许糊掉（第一版按「值一律替换」写，真机跑一遍才发现没法排障）。
    const secret = 'sk-live-DO-NOT-LEAK-abcdef'
    const envSecret = 'top-secret-env-value'
    writeFileSync(join(dshHome, 'cordis.patch.yml'), [
      '# --- dsh-mcp-config managed (auto-generated; do not edit) ---',
      '- insert:',
      '    - id: other-mcp',
      "      name: '@deepseek-ai/dsh-mcp-client'",
      '      config:',
      '        serverName: other',
      '        transport: stdio',
      '        command: /usr/local/bin/other',
      '        cwd: /Users/someone/project',
      '        url: https://example.test/mcp?token=' + secret,
      '        headers:',
      `          authorization: Bearer ${secret}`,
      '          x-trace: plain-value',
      '        env:',
      `          OTHER_API_KEY: ${envSecret}`,
      '        args:',
      '          - serve',
      '          - --mcp',
      '# --- end dsh-mcp-config managed ---',
      '',
    ].join('\n'))
    try {
      const mount = mountFull(echoCli())
      await waitFor(async () => (await call(mount.routes, '/api/dsh-codegraph/default-path')).body?.cliAvailable === true)
      const capture = await call(mount.routes, '/api/dsh-codegraph/diagnose')
      const report = String(capture.body?.report ?? '')

      // 形状与可排查的键：看得到
      expect(report).toContain('dsh-mcp 卡片区块')
      expect(report).toContain('serverName: other')
      expect(report).toContain('command: /usr/local/bin/other')
      expect(report).toContain('cwd: /Users/someone/project')
      expect(report).toContain('- serve')
      // 凭据：一个字节都不能漏——含 url 的查询串、headers 值、env 值
      expect(report).not.toContain(secret)
      expect(report).not.toContain(envSecret)
      expect(report).not.toContain('plain-value')
      expect(report).toContain('<redacted>')
      // 键名本身不是凭据，且「配了哪些 header / 哪些环境变量」正是排查要看的，
      // 所以名字留下、值抹掉（与 `env` dump 的惯例一致）
      expect(report).toContain('headers:')
      expect(report).toContain('authorization:')
      expect(report).toContain('env:')
      expect(report).toContain('OTHER_API_KEY:')
    } finally {
      rmSync(join(dshHome, 'cordis.patch.yml'), { force: true })
    }
  })

  it('daemon 段落：登记、陈旧 pid 判定、日志只取尾部', async () => {
    // 真机实测的形状（本机 ~/.codegraph）：`daemon.pid` 记的 pid 早已 ESRCH，而
    // `daemons/<hash>.json` 里还留着按项目的第二个实例——「一次被强杀的 index
    // 留下的坏锁」就长这样，所以这两条都要能看见。
    //
    // 日志用 5 万行：确认读的是**尾部**（只取最后 N 行），而不是把整份读进来。
    const fakeHome = mkdtempSync(join(sandbox, 'fake-home-'))
    const codegraphHome = join(fakeHome, '.codegraph')
    mkdirSync(join(codegraphHome, 'daemons'), { recursive: true })
    const deadPid = 2147483646 // 不可能存在的 pid
    writeFileSync(join(codegraphHome, 'daemon.pid'), JSON.stringify({ pid: deadPid, version: '1.5.0', socketPath: join(codegraphHome, 'daemon.sock') }))
    writeFileSync(join(codegraphHome, 'daemons', 'aaa.json'), JSON.stringify({ root: '/repo-x', pid: process.pid, version: '1.6.0' }))
    writeFileSync(join(codegraphHome, 'daemons', 'bbb.json'), JSON.stringify({ root: '/repo-y', pid: deadPid, version: '1.6.0' }))
    const logLines = Array.from({ length: 50000 }, (_, i) => `log line ${i}`)
    writeFileSync(join(codegraphHome, 'daemon.log'), logLines.join('\n'))

    const originalHome = process.env.HOME
    const originalUserProfile = process.env.USERPROFILE
    process.env.HOME = fakeHome
    // Windows：`os.homedir()` 读 **USERPROFILE**，根本不看 HOME。只设 HOME 的话这条
    // 用例在 windows-latest 上会去读**真实**的 ~/.codegraph，于是「daemon.pid: 存在」
    // 之类的断言全错（v0.1.41 的 CI 实测：本文件唯一一条 Windows 失败）。
    process.env.USERPROFILE = fakeHome
    try {
      const mount = mountFull(echoCli())
      await waitFor(async () => (await call(mount.routes, '/api/dsh-codegraph/default-path')).body?.cliAvailable === true)
      const capture = await call(mount.routes, '/api/dsh-codegraph/diagnose')
      const report = String(capture.body?.report ?? '')
      expect(report).toContain('daemon.pid: 存在')
      expect(report).toContain(`pid ${deadPid} 现在已不存在`)
      expect(report).toContain('daemons/: 2 个登记项')
      expect(report).toContain('root=/repo-x')
      expect(report).toContain('root=/repo-y')
      // 尾部 40 行：最后一行在、第一行不在
      expect(report).toContain('log line 49999')
      expect(report).not.toContain('log line 0\n')
      expect(report).not.toContain('log line 10000')
    } finally {
      if (originalHome === undefined) delete process.env.HOME
      else process.env.HOME = originalHome
      if (originalUserProfile === undefined) delete process.env.USERPROFILE
      else process.env.USERPROFILE = originalUserProfile
    }
  })

  it('只认 GET + 回环来源', async () => {
    const routes = mountRoutes(echoCli())
    expect((await call(routes, '/api/dsh-codegraph/diagnose', { method: 'POST' })).status).toBe(405)
    const remote = await call(routes, '/api/dsh-codegraph/diagnose', { remoteAddress: '10.0.0.9' })
    expect(remote.status).toBe(403)
  })
})

/* ------------------------------------------------------------------ *
 * P1「索引生命周期」：解锁 + 过期信号（含自动重建的判定核心）
 * ------------------------------------------------------------------ */

describe('P1 索引生命周期：unlock 与过期信号', () => {
  it('unlock：走 `unlock -- <path>`，且目标必须真是目录', async () => {
    const routes = mountRoutes(echoCli())
    const ok = await call(routes, '/api/dsh-codegraph/unlock', { method: 'POST', body: { path: project } })
    expect(ok.status).toBe(200)
    expect(String(ok.body?.output)).toContain(JSON.stringify(['unlock', '--', project]))

    const missing = await call(routes, '/api/dsh-codegraph/unlock', { method: 'POST', body: { path: join(sandbox, 'no-such-unlock') } })
    expect(missing.status).toBe(400)
    expect(String(missing.body?.error)).toContain('路径不存在')
  })

  it('unlock：只认 POST + 回环，CLI 失败如实回报', async () => {
    const routes = mountRoutes(echoCli())
    expect((await call(routes, '/api/dsh-codegraph/unlock')).status).toBe(405)
    expect((await call(routes, '/api/dsh-codegraph/unlock', { method: 'POST', remoteAddress: '10.0.0.9' })).status).toBe(403)

    const failing = stubCli('unlock-fail-cli', 'console.error("lock is held by pid 123"); process.exit(2)')
    const bad = mountRoutes(failing)
    const capture = await call(bad, '/api/dsh-codegraph/unlock', { method: 'POST', body: { path: project } })
    expect(capture.status).toBe(500)
    expect(String(capture.body?.error)).toContain('lock is held by pid 123')
  })

  it('unlock：也接受不存在的锁（CLI 幂等，exit 0）', async () => {
    // 实测 codegraph 1.6.0：没锁时输出 "No stale lock files found" 且 exit 0
    const idle = stubCli('unlock-idle-cli', 'console.log("No stale lock files found — nothing to do")')
    const routes = mountRoutes(idle)
    const capture = await call(routes, '/api/dsh-codegraph/unlock', { method: 'POST', body: { path: project } })
    expect(capture.status).toBe(200)
    expect(String(capture.body?.output)).toContain('No stale lock files')
  })
})

describe('P1 索引生命周期：staleReasonsFromStatus（自动重建的判定核心）', () => {
  it('四种过期信号都能读出来（顶层与 index.* 嵌套两种位置）', () => {
    // 真实 status --json 的形状（本机 codegraph 1.6.0 实测）
    expect(staleReasonsFromStatus({
      initialized: true,
      version: '1.6.0',
      reindexRecommended: true,
      worktreeMismatch: true,
      index: {
        builtWithVersion: '1.1.1',
        builtWithExtractionVersion: 24,
        currentExtractionVersion: 25,
        reindexRecommended: true,
      },
    })).toEqual([
      'CLI 建议重建索引（reindexRecommended）',
      '索引由 CLI 1.1.1 构建，当前 CLI 是 1.6.0',
      '索引的提取器版本 24 已落后于当前的 25',
      '索引与当前 worktree 不匹配',
    ])
    // 嵌套在 index.* 下（CLI 版本间字段位置有差异）同样要读到
    expect(staleReasonsFromStatus({
      version: '1.6.0',
      index: { reindexRecommended: true, builtWithVersion: '1.1.1' },
    })).toHaveLength(2)
  })

  it('新鲜的索引：零信号（重建完的真实形状）', () => {
    // 这也是自动重建「做完就不再触发」的判据——写完重建后 status 长这样
    expect(staleReasonsFromStatus({
      initialized: true,
      version: '1.6.0',
      lastIndexed: '2026-09-22T05:28:00.708Z',
      index: {
        builtWithVersion: '1.6.0',
        builtWithExtractionVersion: 25,
        currentExtractionVersion: 25,
        reindexRecommended: false,
        state: 'complete',
      },
    })).toEqual([])
  })

  it('畸形 / 缺字段输入不抛错', () => {
    for (const bad of [null, undefined, 'nope', 42, {}, { index: 'not-an-object' }, { version: '1.6.0' }]) {
      expect(() => staleReasonsFromStatus(bad)).not.toThrow()
    }
    expect(staleReasonsFromStatus({})).toEqual([])
    // 版本相同不算过期（避免把「同版本」误报成需要重建）
    expect(staleReasonsFromStatus({ version: '1.6.0', index: { builtWithVersion: '1.6.0' } })).toEqual([])
    // 提取器版本相等也不算
    expect(staleReasonsFromStatus({ index: { builtWithExtractionVersion: 25, currentExtractionVersion: 25 } })).toEqual([])
  })
})
