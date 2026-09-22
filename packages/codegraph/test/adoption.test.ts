import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  bucketToolCall,
  describeAdoption,
  emptyCounts,
  foldToolCall,
  summarizeAdoption,
  type AdoptionTable,
} from '../src/index.js'
import { apply } from '../src/index.js'

/*
 * 采纳率仪表（ROADMAP P1）的两半：
 *
 *   1. **归类与汇总**是纯函数（bucketToolCall / foldToolCall / summarizeAdoption /
 *      describeAdoption），在这里直接测——这段判定最容易写错的地方是「哪些工具该
 *      算进分母」，而写错的后果不是报错，是一个看起来很正常但会把人引向错误结论的
 *      数字（比如把 bash 算进去，采纳率被系统性压低）。
 *   2. **事件订阅**走宿主的 `session/event`（与 dsh-agent-instructions / dsh-acp
 *      同一个订阅面）。这一半用一个假 ctx 真派发事件来测，钉住「事件类型不对不计数」
 *      「项目键按索引根归并」「同一次事件流不被重复计数」这些接线细节。
 */

describe('P1 采纳率：工具归类', () => {
  it('codegraph 工具：MCP 命名空间命中', () => {
    expect(bucketToolCall('mcp__codegraph__codegraph_explore')).toBe('codegraph')
    // serverName 带后缀也算（未来多实例命名成 codegraph-2 之类的形状）
    expect(bucketToolCall('mcp__codegraph_2__codegraph_explore')).toBe('codegraph')
    expect(bucketToolCall('MCP__CODEGRAPH__codegraph_explore')).toBe('codegraph')
  })

  it('文件探索类：各种命名习惯都收进分母', () => {
    for (const name of [
      'grep',
      'grep_search',
      'search',
      'glob',
      'glob_search',
      'find_by_name',
      'find_files',
      'read_file',
      'readFile',
      'read',
      'view_file',
      'list_directory',
      'list_dir',
      'file_search',
    ]) {
      expect(bucketToolCall(name), name).toBe('file')
    }
  })

  it('其它工具不计入分母（bash / 编辑 / 任务管理等）', () => {
    // 这条是**关键**：把 bash 算进分母会让采纳率被系统性压低——模型用 bash 干的事
    // 大部分与代码探索无关（跑测试、装依赖、git），那种错误结论最难发现。
    for (const name of ['bash', 'execute_command', 'edit', 'write', 'todo_write', 'todoread', 'task', 'ask_user_question']) {
      expect(bucketToolCall(name), name).toBe('other')
    }
  })

  it('媒体 / 网络 / 文档类不算探索（拿真实历史量过之后补的）', () => {
    // 第一版只看「read / search」词根，于是 read_image（真实历史 248 次）、
    // read_pdf、web_search（19 次）全被算进分母——读一张截图、搜一次网页，与
    // 「本可以交给 codegraph 的代码探索」毫无关系。全机历史里这一个错误把分母
    // 灌了 11%，把采纳率从 2.2% 压到 2.0%。
    for (const name of [
      'read_image', 'read_pdf', 'read_audio', 'web_search', 'web_fetch', 'fetch_url',
      'screenshot', 'view_image', 'download_file',
    ]) {
      expect(bucketToolCall(name), name).toBe('other')
    }
  })

  it('真正的文件探索仍然收进分母', () => {
    for (const name of ['read', 'view', 'open_file', 'read_source', 'find', 'search_code', 'code_search']) {
      expect(bucketToolCall(name), name).toBe('file')
    }
  })

  it('空 / 非字符串 / 怪名字一律归 other，不抛错', () => {
    for (const bad of ['', '   ', undefined, null, 42, {}, []]) {
      expect(bucketToolCall(bad)).toBe('other')
    }
  })

  it('两边都沾的名字优先算 codegraph（对既有实现更保守）', () => {
    // 极端形状：万一有人把工具命名成 `codegraph_search` 且走 MCP 命名空间，
    // 宁可算成 codegraph —— 少算分母，不冤枉既有实现。
    expect(bucketToolCall('mcp__codegraph__codegraph_search')).toBe('codegraph')
  })
})

describe('P1 采纳率：折叠与汇总', () => {
  it('foldToolCall 不修改入参，返回新表', () => {
    const before: AdoptionTable = new Map()
    const after = foldToolCall(before, 'mcp__codegraph__codegraph_explore', '/repo-a')
    expect(before.size).toBe(0)
    expect(after.get('/repo-a')).toEqual({ codegraph: 1, file: 0, discovery: 0, other: 0 })
  })

  it('按项目分流累加', () => {
    let table: AdoptionTable = new Map()
    table = foldToolCall(table, 'mcp__codegraph__codegraph_explore', '/repo-a')
    table = foldToolCall(table, 'grep', '/repo-a')
    table = foldToolCall(table, 'grep', '/repo-a')
    table = foldToolCall(table, 'read_file', '/repo-b')
    table = foldToolCall(table, 'bash', '/repo-b')
    // grep 同时进 file（宽口径）与 discovery（窄口径）；read 只进 file
    expect(table.get('/repo-a')).toEqual({ codegraph: 1, file: 2, discovery: 2, other: 0 })
    expect(table.get('/repo-b')).toEqual({ codegraph: 0, file: 1, discovery: 0, other: 1 })
  })

  it('汇总：分母为 0 时 rate 是 undefined，不是 0', () => {
    // 「一次都没探索过」与「探索了但全用 grep」必须能区分——显示成 0% 会把前者
    // 误报成后者，进而得出「提示词没用」的错误结论。
    const none = summarizeAdoption('/repo', emptyCounts(), true)
    expect(none.exploratory).toBe(0)
    expect(none.rate).toBeUndefined()
    expect(describeAdoption(none)).toContain('还没有探索类工具调用')

    const allGrep = summarizeAdoption('/repo', { codegraph: 0, file: 4, discovery: 4, other: 7 }, true)
    expect(allGrep.exploratory).toBe(4)
    expect(allGrep.discoveryRate).toBe(0)
    expect(describeAdoption(allGrep)).toContain('→ 0%')

    const half = summarizeAdoption('/repo', { codegraph: 1, file: 1, discovery: 1, other: 0 }, true)
    expect(half.discoveryRate).toBe(0.5)
    expect(describeAdoption(half)).toContain('→ 50%')

    const all = summarizeAdoption('/repo', { codegraph: 3, file: 0, discovery: 0, other: 2 }, true)
    expect(all.discoveryRate).toBe(1)
    expect(describeAdoption(all)).toContain('→ 100%')
    expect(describeAdoption(all)).toContain('另 2 次其它工具')
  })

  it('indexed 标志原样带出（未索引项目的数字要能被识别为「不该用它」）', () => {
    expect(summarizeAdoption('/plain', { codegraph: 0, file: 1, discovery: 1, other: 0 }, false).indexed).toBe(false)
  })

  it('两个口径并存：窄口径（发现类）是主口径，宽口径如实带出', () => {
    // 真实历史实测：read 占宽口径分母的绝大多数（1956 次 vs grep 100 次），
    // 所以宽口径 2.2% 而窄口径 28.8%——只报宽口径会误导人。
    const s = summarizeAdoption('/repo', { codegraph: 1, file: 20, discovery: 3, other: 0 }, true)
    expect(s.discoveryTotal).toBe(4)     // codegraph 1 + discovery 3
    expect(s.exploratory).toBe(21)       // codegraph 1 + file 20
    expect(s.discoveryRate).toBeCloseTo(0.25)
    expect(s.rate).toBeCloseTo(1 / 21)
    const text = describeAdoption(s)
    expect(text).toContain('发现类 3 次 → 25%')
    expect(text).toContain('宽口径含读取')
  })

  it('只有读取、没有发现类调用：如实说明而不是给 0%', () => {
    const s = summarizeAdoption('/repo', { codegraph: 0, file: 4, discovery: 0, other: 1 }, true)
    expect(s.discoveryTotal).toBe(0)
    expect(s.discoveryRate).toBeUndefined()
    expect(describeAdoption(s)).toContain('还没有发现类调用')
  })
})

describe('P1 采纳率：session/event 接线', () => {
  /**
   * 挂载插件 + 捕获路由 + 捕获 `session/event` 监听器，暴露手工派发能力。
   *
   * 用假 ctx 而不是真 cordis Context：这一层要验的是**接线**（事件类型怎么判、项目键
   * 怎么算、路由怎么读取），不是宿主本身。真契约的形状由本文件最后一条用例单独钉。
   */
  function mountWithEvents(defaultPath = '/tmp') {
    const listeners = new Map<string, Array<(...args: unknown[]) => unknown>>()
    const routes = new Map<string, { handler: (req: unknown, res: unknown) => Promise<unknown> }>()
    const base = {
      effect: (fn: () => unknown) => fn(),
      on(name: string, listener: (...args: unknown[]) => unknown) {
        const list = listeners.get(name) ?? []
        list.push(listener)
        listeners.set(name, list)
        return () => {}
      },
    }
    const ctx = {
      ...base,
      // 只声明本用例真正会走到的服务：`inject` 收到没实现的名单时**不回调**，
      // 这样插件里对应那段 effect 就整体跳过（真实宿主里服务缺失也是这个效果），
      // 而不是拿到一个空对象、在 `settings.register` 上炸掉。
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
    apply(ctx as never, { command: 'codegraph', defaultPath, announceToAgent: false, usageGuidance: false })

    const fakeRes = () => {
      const state: { status?: number; body?: Record<string, unknown> } = {}
      return {
        get status() { return state.status },
        get body() { return state.body },
        res: {
          writeHead(status: number) { state.status = status },
          end(body?: string) { state.body = body === undefined ? undefined : JSON.parse(body) },
          on() {},
          get writableEnded() { return true },
        },
      }
    }
    return {
      /** 派发一次 tool/call（带会话 cwd）。 */
      dispatch(cwd: string, name: unknown) {
        for (const listener of listeners.get('session/event') ?? []) {
          listener({ header: { cwd } }, { type: 'tool/call', name })
        }
      },
      /** 派发任意事件对象（不补 type）。 */
      dispatchEvent(event: unknown) {
        for (const listener of listeners.get('session/event') ?? []) {
          listener({ header: { cwd: '/tmp' } }, event)
        }
      },
      /** 派发一次缺事件的调用（载荷不完整）。 */
      emitRaw(name: string) {
        for (const listener of listeners.get(name) ?? []) listener()
      },
      async call(url: string, init: { method?: string; remoteAddress?: string } = {}) {
        const capture = fakeRes()
        await routes.get('/api/dsh-codegraph/metrics')?.handler(
          {
            method: init.method ?? 'GET',
            url,
            headers: { host: '127.0.0.1:3080' },
            socket: { remoteAddress: init.remoteAddress ?? '127.0.0.1' },
            async *[Symbol.asyncIterator]() {},
          },
          capture.res,
        )
        return capture
      },
      cleanup() {},
    }
  }

  it('只数 tool/call：其它事件类型与畸形事件一律忽略', async () => {
    const harness = mountWithEvents()
    try {
      // 全是「不该计数」的形状：结果事件、缺 name 的调用、null / 字符串 / 缺事件对象
      harness.dispatchEvent({ type: 'tool/result', name: 'grep' })
      harness.dispatchEvent({ type: 'step/end' })
      harness.dispatchEvent({ type: 'tool/call' })
      harness.dispatchEvent({ type: 'tool/call', name: '' })
      harness.dispatchEvent(null)
      harness.dispatchEvent('nonsense')
      harness.emitRaw('session/event')

      const all = await harness.call('/api/dsh-codegraph/metrics')
      expect(all.status).toBe(200)
      expect(all.body?.summaries).toEqual([])
    } finally {
      harness.cleanup()
    }
  })

  it('/metrics 汇总真实事件流，且项目键按索引根归并', async () => {
    // 造一个已索引仓库 + 它的子目录：子目录里的会话应当归到仓库根
    const repo = mkdtempSync(join(tmpdir(), 'cg-adopt-repo-'))
    const sub = join(repo, 'packages', 'api')
    mkdirSync(sub, { recursive: true })
    mkdirSync(join(repo, '.codegraph'), { recursive: true })
    writeFileSync(join(repo, '.codegraph', 'codegraph.db'), '')
    const plain = mkdtempSync(join(tmpdir(), 'cg-adopt-plain-'))

    const harness = mountWithEvents(repo)
    try {
      // 子目录会话的两次 explore + 一次 grep：都该归到 repo 根
      harness.dispatch(sub, 'mcp__codegraph__codegraph_explore')
      harness.dispatch(sub, 'mcp__codegraph__codegraph_explore')
      harness.dispatch(repo, 'grep')
      // 未索引目录：记在它自己名下，indexed=false
      harness.dispatch(plain, 'grep')
      harness.dispatch(plain, 'bash')

      const all = await harness.call('/api/dsh-codegraph/metrics')
      expect(all.status).toBe(200)
      const summaries = all.body?.summaries as Array<Record<string, unknown>>
      expect(Array.isArray(summaries)).toBe(true)
      const repoRow = summaries.find((row) => row.project === repo)
      expect(repoRow, '子目录会话应归并到已索引仓库根').toBeDefined()
      expect(repoRow?.codegraph).toBe(2)
      expect(repoRow?.file).toBe(1)
      expect(repoRow?.indexed).toBe(true)
      expect(repoRow?.rate).toBeCloseTo(2 / 3)
      const plainRow = summaries.find((row) => row.project === plain)
      expect(plainRow?.indexed).toBe(false)
      // bash 不进分母
      expect(plainRow?.other).toBe(1)

      // 排序：探索次数多的在前
      expect(summaries[0]?.project).toBe(repo)

      // 带 path 的查询：按同一个归并口径取该项目
      const one = await harness.call(`/api/dsh-codegraph/metrics?path=${encodeURIComponent(sub)}`)
      expect(one.status).toBe(200)
      expect(one.body?.project).toBe(repo)
      // 本用例的事件是 2 次 explore + 1 次 grep（都是发现类）→ 窄口径 2/3 ≈ 67%
      expect(String(one.body?.text)).toContain('→ 67%')

      // 分组合计：已索引 / 未索引各一行（未索引项目不该混进整体数字）
      const grouped = all.body?.grouped as Record<string, Record<string, unknown>>
      expect(grouped?.indexed?.codegraph).toBe(2)
      expect(grouped?.indexed?.discovery).toBe(1)
      expect(grouped?.unindexed?.codegraph).toBe(0)
      expect(grouped?.unindexed?.discovery).toBe(1)

      // 只认 GET + 回环
      expect((await harness.call('/api/dsh-codegraph/metrics', { method: 'POST' })).status).toBe(405)
      expect((await harness.call('/api/dsh-codegraph/metrics', { remoteAddress: '10.0.0.9' })).status).toBe(403)
    } finally {
      harness.cleanup()
      rmSync(repo, { recursive: true, force: true })
      rmSync(plain, { recursive: true, force: true })
    }
  })

  it('采纳率也进诊断包：先分清「没用」还是「用了不对」', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'cg-adopt-diag-'))
    mkdirSync(join(repo, '.codegraph'), { recursive: true })
    writeFileSync(join(repo, '.codegraph', 'codegraph.db'), '')

    const listeners = new Map<string, Array<(...args: unknown[]) => unknown>>()
    const routes = new Map<string, { handler: (req: unknown, res: unknown) => Promise<unknown> }>()
    const base = { effect: (fn: () => unknown) => fn(), on: () => () => {} }
    const ctx = {
      ...base,
      on(name: string, listener: (...args: unknown[]) => unknown) {
        const list = listeners.get(name) ?? []
        list.push(listener)
        listeners.set(name, list)
        return () => {}
      },
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
    apply(ctx as never, { command: 'codegraph', defaultPath: repo, announceToAgent: false, usageGuidance: false })
    for (const listener of listeners.get('session/event') ?? []) {
      listener({ header: { cwd: repo } }, { type: 'tool/call', name: 'mcp__codegraph__codegraph_explore' })
      listener({ header: { cwd: repo } }, { type: 'tool/call', name: 'grep' })
    }

    let body: Record<string, unknown> | undefined
    const res = {
      writeHead() {},
      end(b?: string) { body = b === undefined ? undefined : JSON.parse(b) },
      on() {},
      get writableEnded() { return true },
    }
    try {
      await routes.get('/api/dsh-codegraph/diagnose')?.handler(
        {
          method: 'GET',
          url: `/api/dsh-codegraph/diagnose?path=${encodeURIComponent(repo)}`,
          headers: { host: '127.0.0.1:3080' },
          socket: { remoteAddress: '127.0.0.1' },
          async *[Symbol.asyncIterator]() {},
        },
        res,
      )
      const report = String(body?.report ?? '')
      expect(report).toContain('--- 采纳率')
      expect(report).toContain('codegraph 1 次 / 发现类 1 次')
      expect(report).toContain('→ 50%')
    } finally {
      rmSync(repo, { recursive: true, force: true })
    }
  })

  it('订阅用真 Context 也不报错（宿主契约的形状检查）', () => {
    // 上面用的是假 ctx；这里用真 cordis Context 跑一遍 attach，
    // 确认 `ctx.on('session/event', …)` 的形状在真实契约下成立。
    const ctx = new Context()
    expect(() => apply(ctx as never, { command: 'codegraph', defaultPath: '/tmp', announceToAgent: false, usageGuidance: false })).not.toThrow()
  })
})
