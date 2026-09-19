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
import { apply } from '../src/index.js'

const POSIX = process.platform !== 'win32'
const sandbox = mkdtempSync(join(tmpdir(), 'dsh-cg-route-'))
const dshHome = join(sandbox, 'dsh-home')
const project = join(sandbox, 'project')
const originalDshHome = process.env.DSH_HOME

// init 路由的夹具：一个干净目录（未初始化）、一个已索引目录、一个普通文件（用来撞
// 「路径不是目录」）。都在 sandbox 下，随 afterAll 一起回收。
const emptyDir = join(sandbox, 'empty-project')
const indexedDir = join(sandbox, 'already-indexed')
const someFile = join(sandbox, 'a-file.txt')

beforeAll(() => {
  mkdirSync(dshHome, { recursive: true })
  mkdirSync(project, { recursive: true })
  mkdirSync(emptyDir, { recursive: true })
  mkdirSync(indexedDir, { recursive: true })
  writeFileSync(someFile, 'not a directory\n')
  process.env.DSH_HOME = dshHome
})

afterAll(() => {
  if (originalDshHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = originalDshHome
  try {
    rmSync(sandbox, { recursive: true, force: true })
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
    const routes = mountRoutes(echoCli())
    const capture = await call(routes, '/api/dsh-codegraph/init', { method: 'POST', body: { path: emptyDir } })
    expect(capture.status).toBe(200)
    expect(String(capture.body?.output)).toContain(JSON.stringify(['init', '--', emptyDir]))
    const argv = String(capture.body?.output)
    expect(argv).not.toContain('-y')
    expect(argv).not.toContain('--force')
  })

  it('init：已初始化过的目录不重复 init（409），提示改用重建索引', async () => {
    mkdirSync(join(indexedDir, '.codegraph'), { recursive: true })
    writeFileSync(join(indexedDir, '.codegraph', 'codegraph.db'), '')
    const routes = mountRoutes(echoCli())
    const capture = await call(routes, '/api/dsh-codegraph/init', { method: 'POST', body: { path: indexedDir } })
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
 * 假上下文照抄真实 cordis 4.0.2 的形状：`ctx.events` 就是 Events 服务本身
 * （own keys 只有 ctx / _hooks），`on` 挂在它自己身上。插件里那段
 * `const events = settingsCtx` + `events.events.on('settings/updated', …)` 读的
 * 正是这个服务（变量名就叫 events，容易看岔），所以订阅在这里能被真实覆盖。
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
  /** 手工派发 settings/updated（模拟宿主 / 其它界面写 settings）。 */
  dispatch: (ns: string, next: Record<string, unknown>) => void
}

function mountFull(command: string, extra: Record<string, unknown> = {}): FullMount {
  const routes = new Map<string, CapturedRoute>()
  const sections = new Map<string, FakeSection>()
  const settingsStore: Record<string, unknown> = {}
  const updates: Record<string, unknown>[] = []
  const listeners: Array<(ns: unknown, next: unknown) => void> = []
  const errors: unknown[] = []

  const on = (name: string, listener: (...args: unknown[]) => void): (() => void) => {
    if (name !== 'settings/updated') return () => {}
    listeners.push(listener)
    return () => {
      const index = listeners.indexOf(listener)
      if (index !== -1) listeners.splice(index, 1)
    }
  }
  const settings = {
    register(_ns: string, _schema: unknown) {
      return {
        get: () => ({ ...settingsStore }),
        update: async (patch: Record<string, unknown>) => {
          updates.push(patch)
          Object.assign(settingsStore, patch)
          for (const listener of [...listeners]) listener('codegraph', { ...settingsStore })
          return settingsStore
        },
      }
    },
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
    dispatch: (ns, next) => {
      for (const listener of [...listeners]) listener(ns, { ...settingsStore, ...next })
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

describe('systemPrompt 注入门禁（CLI 探测 + settings 开关）', () => {
  it('CLI 可用：注入公告与使用指引两段，且没有子 fiber 异常', async () => {
    const mount = mountFull(echoCli())
    await waitFor(() => mount.sections.size === 2)
    expect(mount.errors).toEqual([])
    expect([...mount.sections.keys()].sort()).toEqual(['plugin:dsh-codegraph', 'plugin:dsh-codegraph:usage'])
    expect(mount.sections.get('plugin:dsh-codegraph')?.order).toBe(150)
    expect(mount.sections.get('plugin:dsh-codegraph:usage')?.order).toBe(151)
  })

  it('使用指引的触发条件与宿主同口径，shell 兜底用配置里的命令名', async () => {
    const command = echoCli()
    const mount = mountFull(command)
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
    // 缺陷报告 D3：probeCli 原先把 error 直接丢掉，于是卡片只能猜原因，
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

  it('重新探测：CLI 在挂载之后才出现时，无需重启宿主即可恢复（报告 D1 的复现步骤）', async () => {
    // 缺陷报告 D1 的确定性复现：挂载时 command 指向一个还不存在的绝对路径，
    // 之后把 CLI 补上——原实现里 cliAvailable 是挂载时锁存的布尔，任何刷新都读同一个
    // 缓存，用户会陷在「按提示刷新 → 永远不恢复」里。POST /reprobe 是那个出口。
    const late = join(sandbox, POSIX ? 'late-cli.mjs' : 'late-cli.cmd')
    const mount = mountFull(late)
    await waitFor(async () => (await call(mount.routes, '/api/dsh-codegraph/default-path')).body?.cliAvailable === false)
    expect(mount.sections.size).toBe(0)

    // 只把 CLI 文件补上：不动补丁、不重启宿主
    writeStubCliAt(late, 'console.log("9.9.9")')

    const reprobed = await call(mount.routes, '/api/dsh-codegraph/reprobe', { method: 'POST' })
    expect(reprobed.status).toBe(200)
    expect(reprobed.body?.cliAvailable).toBe(true)
    expect(reprobed.body?.cliProbeError).toBeUndefined()

    // 探测结果要真的推到 systemPrompt 门禁上，而不是只回给卡片
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
    const onlyUsage = mountFull(echoCli(), { announceToAgent: false })
    await waitFor(() => onlyUsage.sections.size === 1)
    expect([...onlyUsage.sections.keys()]).toEqual(['plugin:dsh-codegraph:usage'])

    const onlyAnnounce = mountFull(echoCli(), { usageGuidance: false })
    await waitFor(() => onlyAnnounce.sections.size === 1)
    expect([...onlyAnnounce.sections.keys()]).toEqual(['plugin:dsh-codegraph'])

    const none = mountFull(echoCli(), { announceToAgent: false, usageGuidance: false })
    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(none.sections.size).toBe(0)
  })

  it('settings/updated 订阅真的生效：外部写入收紧开关即撤销段落', async () => {
    const mount = mountFull(echoCli())
    await waitFor(() => mount.sections.size === 2)
    mount.dispatch('codegraph', { usageGuidance: false })
    await waitFor(() => mount.sections.size === 1)
    expect([...mount.sections.keys()]).toEqual(['plugin:dsh-codegraph'])
  })

  it('卡片改开关：POST /settings 持久化并即时生效', async () => {
    const mount = mountFull(echoCli())
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

  /** 造一个已索引项目目录。 */
  function indexedProject(name: string): string {
    const dir = mkdtempSync(join(sandbox, name))
    mkdirSync(join(dir, '.codegraph'), { recursive: true })
    writeFileSync(join(dir, '.codegraph', 'codegraph.db'), '')
    return dir
  }

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
