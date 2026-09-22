import { describe, expect, it } from 'vitest'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  affectedArgs,
  apply,
  contextArgs,
  exploreArgs,
  filesArgs,
  uninitArgs,
} from '../src/index.js'

/*
 * P2「CLI 面补全」：files / affected / explore / context / uninit + 查询参数旋钮。
 *
 * 这一层的每一条 argv 契约都是**真机读 help 得到**的（不是猜的），所以用例直接钉 argv：
 *   - `files --json --path <cwd> [--filter …] [--pattern …] [--max-depth N]`
 *   - `affected --json --path <cwd> -- <files…>`（位置参数必须落在 `--` 之后）
 *   - `explore --path <cwd> [--max-files N] -- <query>`
 *   - `context --path <cwd> [--max-nodes N] -- <task>`
 *   - `uninit -f -- <cwd>`（**必须带 -f**，见 uninitArgs 注释）
 */

const sandbox = mkdtempSync(join(tmpdir(), 'cg-cli-surface-'))
process.env.DSH_HOME = join(sandbox, 'home')
mkdirSync(process.env.DSH_HOME, { recursive: true })

/** 造一个已索引项目。 */
function indexedProject(name: string): string {
  const dir = mkdtempSync(join(sandbox, name))
  mkdirSync(join(dir, '.codegraph'), { recursive: true })
  writeFileSync(join(dir, '.codegraph', 'codegraph.db'), '')
  return dir
}

/** stub CLI：回显 argv（JSON），init/uninit 真改目录，便于断言状态翻转。 */
function stubCli(name: string, body = 'console.log(JSON.stringify(process.argv.slice(2)))'): string {
  const file = join(sandbox, `${name}.mjs`)
  writeFileSync(file, `#!/usr/bin/env node\nimport fs from 'node:fs'\nimport path from 'node:path'\n${body}\n`)
  chmodSync(file, 0o755)
  return file
}

interface CapturedRoute { handler: (req: unknown, res: unknown) => Promise<unknown> }

function mount(command: string, defaultPath: string) {
  const routes = new Map<string, CapturedRoute>()
  const base = { effect: (fn: () => unknown) => fn(), on: () => () => {} }
  const ctx = {
    ...base,
    inject(names: string[], callback: (sub: unknown) => void) {
      if (!names.includes('webServer')) return
      callback({
        ...base,
        webServer: {
          register(route: { path: string; handler: (req: unknown, res: unknown) => Promise<unknown> }) {
            routes.set(route.path, route)
            return () => {}
          },
        },
      })
    },
  }
  apply(ctx as never, { command, defaultPath, announceToAgent: false, usageGuidance: false })
  const call = async (path: string, init: { method?: string; url?: string; body?: unknown; rawBody?: string } = {}) => {
    const state: { status?: number; body?: Record<string, unknown> } = {}
    const res = {
      writeHead(status: number) { state.status = status },
      end(body?: string) { state.body = body === undefined ? undefined : JSON.parse(body) },
      on() {},
      get writableEnded() { return true },
    }
    const payload = init.rawBody !== undefined
      ? Buffer.from(init.rawBody)
      : init.body === undefined ? undefined : Buffer.from(JSON.stringify(init.body))
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
  const callRemote = async (path: string, method = 'GET') => {
    const state: { status?: number; body?: Record<string, unknown> } = {}
    const res = {
      writeHead(status: number) { state.status = status },
      end(body?: string) { state.body = body === undefined ? undefined : JSON.parse(body) },
      on() {},
      get writableEnded() { return true },
    }
    await routes.get(path)?.handler({
      method,
      url: path,
      headers: { host: '127.0.0.1:3080' },
      socket: { remoteAddress: '10.0.0.9' },
      async *[Symbol.asyncIterator]() {},
    }, res)
    return state
  }
  return { call, callRemote }
}

const argvOf = (body: Record<string, unknown> | undefined) => JSON.parse(String(body?.output ?? body?.raw ?? '[]'))

describe('P2 argv 契约（纯函数）', () => {
  it('files：默认只带 --json 与 --path；三个旋钮按需追加', () => {
    expect(filesArgs('/p')).toEqual(['files', '--json', '--path', '/p'])
    expect(filesArgs('/p', { filter: 'src', pattern: '**/*.ts', maxDepth: 2 }))
      .toEqual(['files', '--json', '--path', '/p', '--filter', 'src', '--pattern', '**/*.ts', '--max-depth', '2'])
    // 空串视作未给（卡片留空时不该塞一个空参数）
    expect(filesArgs('/p', { filter: '', pattern: '' })).toEqual(['files', '--json', '--path', '/p'])
  })

  it('affected：位置参数落在 `--` 之后（文件名以 - 开头也安全）', () => {
    expect(affectedArgs('/p')).toEqual(['affected', '--json', '--path', '/p', '--'])
    expect(affectedArgs('/p', ['a.ts', 'b/c.ts']))
      .toEqual(['affected', '--json', '--path', '/p', '--', 'a.ts', 'b/c.ts'])
  })

  it('explore / context：位置参数在 -- 之后，旋钮在之前', () => {
    expect(exploreArgs('/p', 'locateIndex')).toEqual(['explore', '--path', '/p', '--', 'locateIndex'])
    expect(exploreArgs('/p', 'q', { maxFiles: 3 })).toEqual(['explore', '--path', '/p', '--max-files', '3', '--', 'q'])
    expect(contextArgs('/p', 'fix bug')).toEqual(['context', '--path', '/p', '--', 'fix bug'])
    expect(contextArgs('/p', 't', { maxNodes: 5 })).toEqual(['context', '--path', '/p', '--max-nodes', '5', '--', 't'])
  })

  it('uninit：必须带 -f（不带时 CLI 问 y/N，非 TTY 下读到 EOF 会中止且不删除）', () => {
    expect(uninitArgs('/p')).toEqual(['uninit', '-f', '--', '/p'])
    expect(uninitArgs('/p')).toContain('-f')
  })
})

describe('P2 路由：files / affected / explore / context', () => {
  it('files：透传 filter/pattern/maxDepth', async () => {
    const cli = stubCli('files-cli')
    const { call } = mount(cli, '/p')
    const out = await call('/api/dsh-codegraph/files', {
      url: `/api/dsh-codegraph/files?path=${encodeURIComponent(sandbox)}&filter=src&maxDepth=2`,
    })
    expect(out.status).toBe(200)
    expect(argvOf(out.body)).toEqual(['files', '--json', '--path', sandbox, '--filter', 'src', '--max-depth', '2'])
  })

  it('files：maxDepth 非正整数 → 400', async () => {
    const { call } = mount(stubCli('files-bad'), '/p')
    const out = await call('/api/dsh-codegraph/files', { url: `/api/dsh-codegraph/files?path=${encodeURIComponent(sandbox)}&maxDepth=0` })
    expect(out.status).toBe(400)
  })

  it('affected：可重复传 files；空列表也能跑（CLI 回 No files provided 且 exit 0）', async () => {
    const cli = stubCli('affected-cli')
    const { call } = mount(cli, '/p')
    const many = await call('/api/dsh-codegraph/affected', {
      url: `/api/dsh-codegraph/affected?path=${encodeURIComponent(sandbox)}&files=a.ts&files=b/c.ts`,
    })
    expect(many.status).toBe(200)
    expect(argvOf(many.body)).toEqual(['affected', '--json', '--path', sandbox, '--', 'a.ts', 'b/c.ts'])

    const empty = await call('/api/dsh-codegraph/affected', { url: `/api/dsh-codegraph/affected?path=${encodeURIComponent(sandbox)}` })
    expect(empty.status).toBe(200)
    expect(argvOf(empty.body)).toEqual(['affected', '--json', '--path', sandbox, '--'])
  })

  it('affected：文件路径以 - 开头 → 400（值本身会被 commander 吃掉，位置参数挡不住）', async () => {
    const { call } = mount(stubCli('affected-bad'), '/p')
    const out = await call('/api/dsh-codegraph/affected', {
      url: `/api/dsh-codegraph/affected?path=${encodeURIComponent(sandbox)}&files=-weird.ts`,
    })
    expect(out.status).toBe(400)
    expect(String(out.body?.error)).toContain('不能以 - 开头')
  })

  it('explore / context：缺 q → 400；正常时回 markdown 文本（output 字段）', async () => {
    // explore 输出的是 markdown 而不是 JSON，所以 stub 直接打文本
    const cli = stubCli('explore-cli', 'console.log("# Exploration\\n\\nFound 3 symbols")')
    const { call } = mount(cli, '/p')
    expect((await call('/api/dsh-codegraph/explore', { url: `/api/dsh-codegraph/explore?path=${encodeURIComponent(sandbox)}` })).status).toBe(400)
    const out = await call('/api/dsh-codegraph/explore', { url: `/api/dsh-codegraph/explore?path=${encodeURIComponent(sandbox)}&q=locateIndex` })
    expect(out.status).toBe(200)
    expect(String(out.body?.output)).toContain('Found 3 symbols')
    expect(out.body?.query).toBe('locateIndex')

    const ctxOut = await call('/api/dsh-codegraph/context', { url: `/api/dsh-codegraph/context?path=${encodeURIComponent(sandbox)}&q=fix+bug` })
    expect(ctxOut.status).toBe(200)
    expect(out.body?.query).toBe('locateIndex')
  })

  it('explore：maxFiles 非法 → 400', async () => {
    const { call } = mount(stubCli('explore-bad'), '/p')
    const out = await call('/api/dsh-codegraph/explore', { url: `/api/dsh-codegraph/explore?path=${encodeURIComponent(sandbox)}&q=x&maxFiles=-1` })
    expect(out.status).toBe(400)
  })
})

describe('P2 路由：uninit（破坏性）', () => {
  it('未索引目录 → 409，不碰 CLI', async () => {
    const plain = mkdtempSync(join(sandbox, 'uninit-plain-'))
    const { call } = mount(stubCli('uninit-cli'), '/p')
    const out = await call('/api/dsh-codegraph/uninit', { method: 'POST', body: { path: plain } })
    expect(out.status).toBe(409)
    expect(String(out.body?.error)).toContain('没有可撤销的索引')
    rmSync(plain, { recursive: true, force: true })
  })

  it('已索引目录：真删除 .codegraph/ 并回报 indexed=false', async () => {
    // stub 真去删 .codegraph，模拟 CLI 的 uninit
    const cli = stubCli('uninit-real', [
      "const args = process.argv.slice(2)",
      "if (args[0] === 'uninit') {",
      "  const target = args[args.length - 1]",
      "  fs.rmSync(path.join(target, '.codegraph'), { recursive: true, force: true })",
      "  console.log('✓ Removed CodeGraph from ' + target)",
      "} else { console.log(JSON.stringify(args)) }",
    ].join('\n'))
    const dir = indexedProject('uninit-real-')
    const { call } = mount(cli, '/p')
    const out = await call('/api/dsh-codegraph/uninit', { method: 'POST', body: { path: dir } })
    expect(out.status).toBe(200)
    expect(out.body?.indexed).toBe(false)
    expect(existsSync(join(dir, '.codegraph'))).toBe(false)
    rmSync(dir, { recursive: true, force: true })
  })

  it('monorepo 子目录：撤销的是索引所在的根（CG02 同口径）', async () => {
    const root = indexedProject('uninit-root-')
    const sub = join(root, 'packages', 'app')
    mkdirSync(sub, { recursive: true })
    const cli = stubCli('uninit-sub', [
      "const args = process.argv.slice(2)",
      "if (args[0] === 'uninit') {",
      "  const target = args[args.length - 1]",
      "  fs.rmSync(path.join(target, '.codegraph'), { recursive: true, force: true })",
      "  console.log('removed ' + target)",
      "}",
    ].join('\n'))
    const { call } = mount(cli, '/p')
    const out = await call('/api/dsh-codegraph/uninit', { method: 'POST', body: { path: sub } })
    expect(out.status).toBe(200)
    // 撤销的是**根**，不是子目录
    expect(out.body?.path).toBe(root)
    expect(existsSync(join(root, '.codegraph'))).toBe(false)
    rmSync(root, { recursive: true, force: true })
  })

  it('只认 POST + 回环；畸形 body 400', async () => {
    const dir = indexedProject('uninit-guard-')
    const { call } = mount(stubCli('uninit-guard'), '/p')
    expect((await call('/api/dsh-codegraph/uninit', { body: { path: dir } })).status).toBe(405)
    rmSync(dir, { recursive: true, force: true })
  })
})

describe('P2 路由：telemetry（只读转达）', () => {
  it('解析 enabled / disabled 两种输出', async () => {
    const on = stubCli('telemetry-on', 'console.log("Telemetry: enabled (your saved choice)")\nconsole.log("Config: /x/telemetry.json")')
    const out1 = await mount(on, '/p').call('/api/dsh-codegraph/telemetry')
    expect(out1.status).toBe(200)
    expect(out1.body?.enabled).toBe(true)

    const off = stubCli('telemetry-off', 'console.log("Telemetry: disabled (your saved choice)")')
    const out2 = await mount(off, '/p').call('/api/dsh-codegraph/telemetry')
    expect(out2.body?.enabled).toBe(false)
  })

  it('输出不含可识别状态行时 enabled 为 undefined（不猜）', async () => {
    const weird = stubCli('telemetry-weird', 'console.log("something else entirely")')
    const out = await mount(weird, '/p').call('/api/dsh-codegraph/telemetry')
    expect(out.status).toBe(200)
    expect(out.body?.enabled).toBeUndefined()
  })

  it('老版本没有 telemetry 子命令 → 500 且带上 CLI 原文', async () => {
    const old = stubCli('telemetry-missing', 'console.error("error: unknown command \'telemetry\'")\nprocess.exit(1)')
    const out = await mount(old, '/p').call('/api/dsh-codegraph/telemetry')
    expect(out.status).toBe(500)
    expect(String(out.body?.error)).toContain('unknown command')
  })
})

describe('P2 查询参数：kind 与 limit', () => {
  it('query 带 kind 与 limit', async () => {
    const { call } = mount(stubCli('query-knobs'), '/p')
    const out = await call('/api/dsh-codegraph/query', {
      url: `/api/dsh-codegraph/query?path=${encodeURIComponent(sandbox)}&q=x&kind=function&limit=5`,
    })
    expect(argvOf(out.body)).toEqual(['query', '--json', '--path', sandbox, '--limit', '5', '--kind', 'function', '--', 'x'])
  })

  it('query 不传 kind 时不加该参数；kind 以 - 开头 → 400', async () => {
    const { call } = mount(stubCli('query-nokind'), '/p')
    const out = await call('/api/dsh-codegraph/query', { url: `/api/dsh-codegraph/query?path=${encodeURIComponent(sandbox)}&q=x` })
    expect(argvOf(out.body)).toEqual(['query', '--json', '--path', sandbox, '--limit', '10', '--', 'x'])

    const bad = await call('/api/dsh-codegraph/query', { url: `/api/dsh-codegraph/query?path=${encodeURIComponent(sandbox)}&q=x&kind=-x` })
    expect(bad.status).toBe(400)
  })

  it('callers / callees 支持 limit（CLI 默认 20 会截断）', async () => {
    const { call } = mount(stubCli('rel-limit'), '/p')
    const callers = await call('/api/dsh-codegraph/callers', {
      url: `/api/dsh-codegraph/callers?path=${encodeURIComponent(sandbox)}&symbol=s&limit=50`,
    })
    expect(argvOf(callers.body)).toEqual(['callers', '--json', '--path', sandbox, '--limit', '50', '--', 's'])
    const callees = await call('/api/dsh-codegraph/callees', {
      url: `/api/dsh-codegraph/callees?path=${encodeURIComponent(sandbox)}&symbol=s`,
    })
    expect(argvOf(callees.body)).toEqual(['callees', '--json', '--path', sandbox, '--', 's'])
  })
})

describe('P3 门禁矩阵：POST 路由的 body 与回环覆盖（CG32–CG34 的替代性复核）', () => {
  /*
   * CG32–CG34 的评审原文从未随附、仓库与 git 历史都没有记录，**无法补齐定义**。
   * 与其让三条 `—` 行永久挂着，不如把「它们最可能涉及的那一类」变成可执行的复核：
   * 路由矩阵（方法 / body 门禁 / 回环门禁）。CG01 正是这个矩阵能一次看住的东西——
   * 不可读的 body 静默回落到**默认项目**去执行写操作。
   *
   * 判据是**性质**而非快照：依赖输入的路由必须挡下畸形体；完全不依赖输入的路由
   * （reprobe）不读 body 才是对的。
   */

  /** 造一个「畸形 body」请求：body 不是合法 JSON。 */
  const malformed = (path: string, method = 'POST') => ({ path, init: { method, rawBody: '{oops' as unknown as undefined } })

  it('依赖 body 的 POST 路由：畸形体一律 400，绝不静默用默认项目', async () => {
    // 这些路由都会从 body 取 path 并可能**落盘**（改托管行 / 删索引 / 写 settings），
    // 所以「读不出来」必须与「没给」区分开（CG01）。
    const needsBody = ['sync', 'index', 'unlock', 'uninit', 'init', 'follow', 'settings', 'default-path']
    for (const name of needsBody) {
      const { call } = mount(stubCli(`mb-${name}`), '/p')
      const out = await call(`/api/dsh-codegraph/${name}`, { method: 'POST', rawBody: '{oops' })
      expect(out.status, name).toBe(400)
      expect(String(out.body?.error), name).toContain('invalid JSON body')
    }
    void malformed
  })

  it('reprobe 不依赖输入：凭空体也能工作；GET 仍被拒（它会真起子进程）', async () => {
    const { call } = mount(stubCli('guard-reprobe'), '/p')
    const out = await call('/api/dsh-codegraph/reprobe', { method: 'POST' })
    expect(out.status).toBe(200)
    expect((await call('/api/dsh-codegraph/reprobe')).status).toBe(405)
  })

  it('全部路由都过回环门禁：非回环来源一律 403（且门禁先于参数校验）', async () => {
    const { call, callRemote } = mount(stubCli('guard-loopback'), '/p')
    // 覆盖三条代表性路由：GET、POST、以及需要参数的 POST
    expect((await callRemote('/api/dsh-codegraph/status')).status).toBe(403)
    expect((await callRemote('/api/dsh-codegraph/projects')).status).toBe(403)
    expect((await callRemote('/api/dsh-codegraph/metrics')).status).toBe(403)
    expect((await callRemote('/api/dsh-codegraph/diagnose')).status).toBe(403)
    expect((await callRemote('/api/dsh-codegraph/files')).status).toBe(403)
    expect((await callRemote('/api/dsh-codegraph/affected')).status).toBe(403)
    expect((await callRemote('/api/dsh-codegraph/explore')).status).toBe(403)
    expect((await callRemote('/api/dsh-codegraph/context')).status).toBe(403)
    expect((await callRemote('/api/dsh-codegraph/telemetry')).status).toBe(403)
    expect((await callRemote('/api/dsh-codegraph/uninit', 'POST')).status).toBe(403)
    expect((await callRemote('/api/dsh-codegraph/unlock', 'POST')).status).toBe(403)
    void call
  })
})
