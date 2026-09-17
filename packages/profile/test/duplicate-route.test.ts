/**
 * @hyzyn/dsh-profile — 「复制 Profile」必须经 kit 的 `spawnPortable` 起 pnpm。
 *
 * 真机（Windows 11 ARM64，中文区）实测：原先的 `spawnSync('pnpm', ['install'])`
 * 在这台机器上一定失败 —— Windows 上 pnpm 只有 `pnpm.CMD`，裸 spawn 既不查
 * PATHEXT 解析 `.cmd`，写绝对路径又会因 Node 对 `.cmd` 的加固报 EINVAL，所以报的是
 * `spawnSync pnpm ENOENT`。用户看到的是「复制后安装依赖失败」，而复制**已经完成**：
 * 磁盘上多出一个半成品 profile。这与已修的 codegraph / mcp 是同一类缺陷。
 *
 * 两条断言缺一不可：
 *   1. 走的是 `spawnPortable('pnpm', ['install'], { cwd })`（而不是 spawnSync）；
 *   2. 装依赖失败时把复制出来的目录**回滚**，语义是「要么复制成功，要么什么都没发生」。
 */
import { EventEmitter } from 'node:events'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const spawnPortableMock = vi.hoisted(() => vi.fn())
vi.mock('@hyzyn/dsh-kit', () => ({ spawnPortable: spawnPortableMock }))

import { apply } from '../src/index.js'

/* ------------------------------------------------------------------ *
 * 桩
 * ------------------------------------------------------------------ */

interface FakeChild extends EventEmitter {
  stdout: EventEmitter
  stderr: EventEmitter
  pid: number
  kill: () => boolean
}

/** 造一个假子进程；`close` 在下一个 tick 触发，`output` 从 stderr 吐出。 */
function fakeChild(code: number | null, output = ''): FakeChild {
  const child = new EventEmitter() as FakeChild
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.pid = 4242
  child.kill = () => true
  setImmediate(() => {
    if (output !== '') child.stderr.emit('data', Buffer.from(output))
    child.emit('close', code)
  })
  return child
}

interface FakeRoute {
  kind: string
  path: string
  handler: (req: unknown, res: unknown) => Promise<void>
}

interface FakeRes {
  status: number
  endBody: string | undefined
  writeHead(status: number): void
  end(body?: string): void
}

function makeReq(url: string, method: string, body?: unknown): unknown {
  const payload = body === undefined ? '' : JSON.stringify(body)
  const chunks = payload === '' ? [] : [Buffer.from(payload)]
  return {
    method,
    url,
    headers: { host: '127.0.0.1:3092', 'content-type': 'application/json' },
    socket: { remoteAddress: '127.0.0.1' },
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) yield chunk
    },
  }
}

function mountPlugin(): Map<string, FakeRoute> {
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
    }
    if (names.includes('webServer')) {
      child.webServer = {
        register: (route: FakeRoute) => {
          routes.set(route.path, route)
          return () => {}
        },
      }
    }
    if (names.includes('settings')) child.settings = { register: () => {} }
    if (names.includes('systemPrompt')) child.systemPrompt = { section: () => () => {} }
    return child
  }
  const root = makeChild([])
  root.inject = (names: string[], cb: (ctx: unknown) => void) => {
    cb(makeChild(names))
    return () => {}
  }
  ;(apply as unknown as (ctx: unknown, config: unknown) => void)(root, {})
  return routes
}

async function post(routes: Map<string, FakeRoute>, path: string, body: unknown): Promise<{ status: number; json: Record<string, unknown> | undefined }> {
  const route = routes.get(path)
  if (route === undefined) throw new Error(`未注册路由 ${path}`)
  const res: FakeRes = {
    status: 0,
    endBody: undefined,
    writeHead(status) {
      res.status = status
    },
    end(body) {
      if (body !== undefined) res.endBody = body
    },
  }
  await route.handler(makeReq(path, 'POST', body), res)
  return { status: res.status, json: res.endBody === undefined ? undefined : JSON.parse(res.endBody) }
}

/* ------------------------------------------------------------------ *
 * 用例
 * ------------------------------------------------------------------ */

let home: string

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'dsh-profile-dupe-'))
  process.env.DSH_HOME = home
  spawnPortableMock.mockReset()
})

afterEach(() => {
  delete process.env.DSH_HOME
  rmSync(home, { recursive: true, force: true })
})

describe('POST /api/dsh-profile/duplicate：装依赖走 spawnPortable', () => {
  it('用 spawnPortable 起 pnpm（不是裸 spawn/spawnSync），并把 cwd 指向新 profile', async () => {
    const routes = mountPlugin()
    spawnPortableMock.mockReturnValue(fakeChild(0))
    expect((await post(routes, '/api/dsh-profile/create', { name: 'src' })).status).toBe(200)

    const { status, json } = await post(routes, '/api/dsh-profile/duplicate', { name: 'dst', from: 'src' })
    expect(status).toBe(200)
    expect(json?.ok).toBe(true)
    expect(spawnPortableMock).toHaveBeenCalledTimes(1)
    expect(spawnPortableMock).toHaveBeenCalledWith('pnpm', ['install'], { cwd: join(home, 'profiles', 'dst') })
    expect(existsSync(join(home, 'profiles', 'dst', 'package.json'))).toBe(true)
  })

  it('装依赖失败时回滚：400 + 复制出来的目录被删掉（不留半成品）', async () => {
    const routes = mountPlugin()
    spawnPortableMock.mockReturnValue(fakeChild(1, 'ERR_PNPM_NO_MATCHING_VERSION'))
    await post(routes, '/api/dsh-profile/create', { name: 'src' })

    const { status, json } = await post(routes, '/api/dsh-profile/duplicate', { name: 'dst', from: 'src' })
    expect(status).toBe(400)
    expect(String(json?.error)).toContain('复制后安装依赖失败')
    expect(String(json?.error)).toContain('ERR_PNPM_NO_MATCHING_VERSION')
    expect(existsSync(join(home, 'profiles', 'dst'))).toBe(false)
    // 源 profile 不受影响
    expect(existsSync(join(home, 'profiles', 'src', 'package.json'))).toBe(true)
  })

  it('pnpm 根本拉不起来（error 事件）时也是 400 + 回滚', async () => {
    const routes = mountPlugin()
    spawnPortableMock.mockImplementation(() => {
      const child = new EventEmitter() as FakeChild
      child.stdout = new EventEmitter()
      child.stderr = new EventEmitter()
      child.pid = 1
      child.kill = () => true
      setImmediate(() => child.emit('error', new Error('spawn pnpm ENOENT')))
      return child
    })
    await post(routes, '/api/dsh-profile/create', { name: 'src' })

    const { status, json } = await post(routes, '/api/dsh-profile/duplicate', { name: 'dst', from: 'src' })
    expect(status).toBe(400)
    expect(String(json?.error)).toContain('ENOENT')
    expect(existsSync(join(home, 'profiles', 'dst'))).toBe(false)
  })
})
