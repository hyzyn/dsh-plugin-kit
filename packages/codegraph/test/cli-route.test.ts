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
 * 平台：stub 靠 shebang 执行，Windows 上跳过（CI 是 ubuntu，本地开发是 macOS/Linux）。
 */
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apply } from '../src/index.js'

const POSIX = process.platform !== 'win32'
const sandbox = mkdtempSync(join(tmpdir(), 'dsh-cg-route-'))
const dshHome = join(sandbox, 'dsh-home')
const project = join(sandbox, 'project')
const originalDshHome = process.env.DSH_HOME

beforeAll(() => {
  mkdirSync(dshHome, { recursive: true })
  mkdirSync(project, { recursive: true })
  process.env.DSH_HOME = dshHome
})

afterAll(() => {
  if (originalDshHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = originalDshHome
  rmSync(sandbox, { recursive: true, force: true })
})

/** 写一个可执行的 stub CLI：把 argv 回显成 JSON 行，或挂住等到被杀。 */
function stubCli(name: string, body: string): string {
  const file = join(sandbox, `${name}.mjs`)
  writeFileSync(file, `#!/usr/bin/env node\n${body}\n`)
  chmodSync(file, 0o755)
  return file
}

const echoCli = () => stubCli('echo-cli', 'console.log(JSON.stringify(process.argv.slice(2)))')
const sleepCli = () => stubCli('sleep-cli', 'setTimeout(() => {}, 10_000)')

interface CapturedRoute {
  kind: string
  path: string
  handler: (req: unknown, res: unknown) => unknown
}

interface FakeReqInit {
  method?: string
  url?: string
  body?: unknown
  remoteAddress?: string
  host?: string
}

function fakeReq(init: FakeReqInit = {}): unknown {
  const payload = init.body === undefined ? undefined : Buffer.from(JSON.stringify(init.body))
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

function fakeRes(): { readonly status: number | undefined; readonly body: Record<string, unknown> | undefined; res: unknown } {
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

describe.skipIf(!POSIX)('宿主路由（stub CLI）', () => {
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
