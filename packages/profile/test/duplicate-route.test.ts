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
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const spawnPortableMock = vi.hoisted(() => vi.fn())
// 只覆盖 spawnPortable，其余（dshHome 等）用 kit 真身——codegraph CG35 后 profile 还从 kit
// 拿 dshHome，整模块 mock 成 undefined 会让路由当场抛错。
vi.mock('@hyzyn/dsh-kit', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  spawnPortable: spawnPortableMock,
}))

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

/*
 * 2026-10-19 外部测评 issue #13 第 1 条：**失败回滚不许删用户的目录**。
 *
 * 现场：把「复制 profile」的目标名填成一个已存在的 profile（前端没有重名预检），
 * 或者源不存在。两条都是 `copyProfile` 在创建任何东西**之前**就抛的校验错误，
 * 而旧实现无条件 `rmSync(profileDir(name), …)`——被删的是**本来就存在**的那个
 * profile（package.json、bundle 列表、自己的 cordis.patch.yml、端口配置、node_modules
 * 全没），同时还绕过了 `deleteProfile` 对 `web` 的保护。接口回 400，看起来像
 * 「被拒绝了」，用户不会意识到目录已经没了。
 *
 * 这一组用例的判据只有一条：**目标目录必须原样保留**（逐字节，不是「还在」）。
 */
describe('POST /api/dsh-profile/duplicate：失败时只回滚本次创建的目录', () => {
  /** 造一个「用户自己的」profile 目录，带一份可辨认的内容。 */
  function seedExistingProfile(name: string, marker: string): void {
    const dir = join(home, 'profiles', name)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: `dsh-profile-${name}`, marker }) + '\n')
    // 用户自己的补丁与端口配置：这两份在事故里也一起没了
    writeFileSync(join(dir, 'cordis.patch.yml'), `# ${marker}\n[]\n`)
    writeFileSync(join(dir, 'port.txt'), '3099\n')
  }

  function snapshot(dir: string): Record<string, string> {
    const out: Record<string, string> = {}
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) continue
      out[entry.name] = readFileSync(join(dir, entry.name), 'utf8')
    }
    return out
  }

  it('目标名已存在：400，且目标 profile 的内容逐字节不变', async () => {
    const routes = mountPlugin()
    spawnPortableMock.mockReturnValue(fakeChild(0))
    await post(routes, '/api/dsh-profile/create', { name: 'src' })
    seedExistingProfile('dst', 'mine')
    const before = snapshot(join(home, 'profiles', 'dst'))

    const { status, json } = await post(routes, '/api/dsh-profile/duplicate', { name: 'dst', from: 'src' })

    expect(status).toBe(400)
    expect(String(json?.error)).toContain('目标 profile 已存在')
    // 关键断言：目录还在、内容一个字节都没变（旧实现这里整个目录被删）
    expect(existsSync(join(home, 'profiles', 'dst', 'package.json'))).toBe(true)
    expect(snapshot(join(home, 'profiles', 'dst'))).toEqual(before)
    // 也不该白跑一次装依赖
    expect(spawnPortableMock).not.toHaveBeenCalled()
  })

  it('源不存在：400，且一个**同名但未初始化**的目标目录不被删', async () => {
    const routes = mountPlugin()
    // 目标目录存在但**没有 package.json**（未初始化 / 用户手建的半成品）：
    // 旧实现的 rm -rf 会把它连同里面的东西一起删掉
    const dir = join(home, 'profiles', 'dst')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'keep.txt'), 'user data\n')

    const { status, json } = await post(routes, '/api/dsh-profile/duplicate', { name: 'dst', from: 'nope' })

    expect(status).toBe(400)
    expect(String(json?.error)).toContain('源 profile 不存在')
    expect(existsSync(join(dir, 'keep.txt'))).toBe(true)
  })

  it('受保护的 web 也不会因为一次失败的复制被删（旧实现绕过了 deleteProfile 的保护）', async () => {
    const routes = mountPlugin()
    spawnPortableMock.mockReturnValue(fakeChild(0))
    await post(routes, '/api/dsh-profile/create', { name: 'src' })
    seedExistingProfile('web', 'protected')
    const before = snapshot(join(home, 'profiles', 'web'))

    const { status } = await post(routes, '/api/dsh-profile/duplicate', { name: 'web', from: 'src' })

    expect(status).toBe(400)
    expect(snapshot(join(home, 'profiles', 'web'))).toEqual(before)
  })

  it('真正的半成品（mkdir 之后才失败）仍然回滚：不留空目录', async () => {
    const routes = mountPlugin()
    spawnPortableMock.mockReturnValue(fakeChild(1, 'ERR_PNPM_NO_MATCHING_VERSION'))
    await post(routes, '/api/dsh-profile/create', { name: 'src' })

    const { status } = await post(routes, '/api/dsh-profile/duplicate', { name: 'dst', from: 'src' })

    // 这一条与上面三条**必须同时成立**：回滚的范围要「刚好覆盖本次创建的东西」
    expect(status).toBe(400)
    expect(existsSync(join(home, 'profiles', 'dst'))).toBe(false)
  })
})
