import { describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apply } from '../src/index.js'

/*
 * P2「已索引项目列表 + 一键切换」。
 *
 * 这一层的价值在**列表里有什么、没有什么**，而两者写错都不会报错：
 *   - 少登记 → 用户找不到自己上周那个仓库（功能白做）；
 *   - 多登记 → 列出一堆无关目录，或者更糟：把未索引目录当成可切换目标；
 *   - 不归并 → monorepo 子目录和仓库根各占一行，切哪个才对？
 *
 * 数据源只用「界内」的（活跃会话 + 插件观察到的 cwd），所以用例也按这个边界设计。
 */

/**
 * 挂载并捕获路由；`sessions` 服务可选（用来验 seed）。
 *
 * `command` 默认指向一个回显 argv 的 stub：真 `codegraph status --json` 在临时目录上
 * 会失败（无索引 → 非零退出），而 `/status` 路由**只有成功时**才登记项目——用真 CLI
 * 会让「查过状态进列表」这条用例假红。
 */
function mount(opts: { defaultPath: string; sessions?: unknown[] } = { defaultPath: '/tmp' }) {
  const stubDir = mkdtempSync(join(tmpdir(), 'cg-proj-stub-'))
  const stub = join(stubDir, 'cg-stub.mjs')
  writeFileSync(stub, `#!/usr/bin/env node
import fs from 'node:fs'
const args = process.argv.slice(2)
if (args[0] === '--version') { process.stdout.write('1.6.0'); process.exit(0) }
process.stdout.write(JSON.stringify({ initialized: true, index: { reindexRecommended: false } }))
`)
  require('node:fs').chmodSync(stub, 0o755)
  const routes = new Map<string, { handler: (req: unknown, res: unknown) => Promise<unknown> }>()
  const base = { effect: (fn: () => unknown) => fn(), on: () => () => {} }
  const ctx = {
    ...base,
    inject(names: string[], callback: (sub: unknown) => void) {
      // sessions 只在提供时才注入，否则那段 effect 整体跳过（真实宿主缺服务也是这个效果）
      const delivered = names.filter((n) => n === 'webServer' || (n === 'sessions' && opts.sessions !== undefined))
      if (delivered.length === 0) return
      const sub: Record<string, unknown> = { ...base }
      if (delivered.includes('webServer')) {
        sub.webServer = {
          register(route: { path: string; handler: (req: unknown, res: unknown) => Promise<unknown> }) {
            routes.set(route.path, route)
            return () => {}
          },
        }
      }
      if (delivered.includes('sessions')) sub.sessions = { list: () => opts.sessions ?? [] }
      callback(sub)
    },
  }
  apply(ctx as never, { command: stub, defaultPath: opts.defaultPath, announceToAgent: false, usageGuidance: false })
  const call = async (path: string, init: { method?: string; url?: string; body?: unknown } = {}) => {
    const state: { status?: number; body?: Record<string, unknown> } = {}
    const res = {
      writeHead(status: number) { state.status = status },
      end(body?: string) { state.body = body === undefined ? undefined : JSON.parse(body) },
      on() {},
      get writableEnded() { return true },
    }
    const payload = init.body === undefined ? undefined : Buffer.from(JSON.stringify(init.body))
    await routes.get(path)?.handler({
      method: init.method ?? 'GET',
      url: init.url ?? path,
      headers: { host: '127.0.0.1:3080' },
      socket: { remoteAddress: '127.0.0.1' },
      async *[Symbol.asyncIterator]() { if (payload !== undefined) yield payload },
    }, res)
    return state
  }
  /** 非回环来源（验证 loopback 门禁）。 */
  const callRemote = async (path: string) => {
    const state: { status?: number; body?: Record<string, unknown> } = {}
    const res = {
      writeHead(status: number) { state.status = status },
      end(body?: string) { state.body = body === undefined ? undefined : JSON.parse(body) },
      on() {},
      get writableEnded() { return true },
    }
    await routes.get(path)?.handler({
      method: 'GET', url: path, headers: { host: '127.0.0.1:3080' },
      socket: { remoteAddress: '10.0.0.9' }, async *[Symbol.asyncIterator]() {},
    }, res)
    return state
  }
  return { call, callRemote }
}

/** 造一个已索引项目（可选带子目录，用来验归并）。 */
function indexedProject(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  mkdirSync(join(dir, '.codegraph'), { recursive: true })
  writeFileSync(join(dir, '.codegraph', 'codegraph.db'), '')
  return dir
}

describe('P2 项目列表', () => {
  it('只认 GET + 回环来源', async () => {
    const { call, callRemote } = mount()
    expect((await call('/api/dsh-codegraph/projects', { method: 'POST' })).status).toBe(405)
    expect((await callRemote('/api/dsh-codegraph/projects')).status).toBe(403)
  })

  it('活跃会话 seed 进列表，并归并到索引根', async () => {
    const repo = indexedProject('cg-proj-repo-')
    const sub = join(repo, 'packages', 'api')
    mkdirSync(sub, { recursive: true })
    const { call } = mount({ defaultPath: '/tmp', sessions: [{ header: { cwd: sub } }] })
    const out = await call('/api/dsh-codegraph/projects')
    expect(out.status).toBe(200)
    const list = out.body?.projects as Array<Record<string, unknown>>
    // 子目录会话归并到仓库根（与托管行 cwd、采纳率同一口径）
    const paths = list.map((p) => p.path)
    expect(paths).toContain(repo)
    expect(paths).not.toContain(sub)
    const row = list.find((p) => p.path === repo)
    expect(row?.indexed).toBe(true)
    expect(row?.via).toContain('活跃会话')
    rmSync(repo, { recursive: true, force: true })
  })

  it('未索引目录也列出，但标记 indexed=false（前端据此禁用切换）', async () => {
    const plain = mkdtempSync(join(tmpdir(), 'cg-proj-plain-'))
    const { call } = mount({ defaultPath: '/tmp', sessions: [{ header: { cwd: plain } }] })
    const out = await call('/api/dsh-codegraph/projects')
    const row = (out.body?.projects as Array<Record<string, unknown>>).find((p) => p.path === plain)
    expect(row).toBeDefined()
    expect(row?.indexed).toBe(false)
    rmSync(plain, { recursive: true, force: true })
  })

  it('当前默认项目始终在列表里（否则「切换」会缺掉正在用的那个）', async () => {
    const repo = indexedProject('cg-proj-current-')
    const { call } = mount({ defaultPath: repo })
    const out = await call('/api/dsh-codegraph/projects')
    expect((out.body?.projects as Array<Record<string, unknown>>).map((p) => p.path)).toContain(repo)
    expect(out.body?.effectivePath).toBe(repo)
    rmSync(repo, { recursive: true, force: true })
  })

  it('跟随上报的会话目录也进列表；空串不上报', async () => {
    const repo = indexedProject('cg-proj-follow-')
    const { call } = mount({ defaultPath: '/tmp' })
    await call('/api/dsh-codegraph/follow', { method: 'POST', body: { path: repo } })
    const out = await call('/api/dsh-codegraph/projects')
    const row = (out.body?.projects as Array<Record<string, unknown>>).find((p) => p.path === repo)
    expect(row).toBeDefined()
    // via 只记**第一次**来源：/follow 是它进列表的原因，之后 /projects 的补登记
    // 不该把它改写成「生效路径」（实测过的真实问题）
    expect(row?.via).toContain('会话')
    rmSync(repo, { recursive: true, force: true })
  })

  it('查过状态的路径进列表（用户正在关注它）', async () => {
    const repo = indexedProject('cg-proj-status-')
    const { call } = mount({ defaultPath: '/tmp' })
    await call('/api/dsh-codegraph/status', { url: `/api/dsh-codegraph/status?path=${encodeURIComponent(repo)}` })
    const out = await call('/api/dsh-codegraph/projects')
    const row = (out.body?.projects as Array<Record<string, unknown>>).find((p) => p.path === repo)
    expect(row).toBeDefined()
    expect(row?.via).toContain('status')
    rmSync(repo, { recursive: true, force: true })
  })

  it('没提供 sessions 服务时也能工作（列表随使用增长）', async () => {
    const { call } = mount({ defaultPath: '/tmp' })   // 不传 sessions
    const out = await call('/api/dsh-codegraph/projects')
    expect(out.status).toBe(200)
    expect(Array.isArray(out.body?.projects)).toBe(true)
  })

  it('最近见过的排在前面', async () => {
    const older = indexedProject('cg-proj-old-')
    const newer = indexedProject('cg-proj-new-')
    const { call } = mount({ defaultPath: '/tmp' })
    // 先看 older，再看 newer → newer 应排在前面
    await call('/api/dsh-codegraph/status', { url: `/api/dsh-codegraph/status?path=${encodeURIComponent(older)}` })
    await new Promise((r) => setTimeout(r, 20))
    await call('/api/dsh-codegraph/status', { url: `/api/dsh-codegraph/status?path=${encodeURIComponent(newer)}` })
    const out = await call('/api/dsh-codegraph/projects')
    const paths = (out.body?.projects as Array<Record<string, unknown>>).map((p) => p.path)
    expect(paths.indexOf(newer)).toBeLessThan(paths.indexOf(older))
    rmSync(older, { recursive: true, force: true })
    rmSync(newer, { recursive: true, force: true })
  })

  it('indexedCount 与列表一致', async () => {
    const repo = indexedProject('cg-proj-count-')
    const plain = mkdtempSync(join(tmpdir(), 'cg-proj-countplain-'))
    const { call } = mount({ defaultPath: '/tmp', sessions: [{ header: { cwd: repo } }, { header: { cwd: plain } }] })
    const out = await call('/api/dsh-codegraph/projects')
    const list = out.body?.projects as Array<Record<string, unknown>>
    expect(out.body?.indexedCount).toBe(list.filter((p) => p.indexed).length)
    rmSync(repo, { recursive: true, force: true })
    rmSync(plain, { recursive: true, force: true })
  })
})
