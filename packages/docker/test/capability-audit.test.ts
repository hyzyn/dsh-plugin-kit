/**
 * @hyzyn/dsh-docker — 能力使用审计（capability-use audit）回归测试。
 *
 * 授权链的审计在 kit elevation（begin / grant / expire / revoke / load 五行）；本文件钉的是
 * **授权之后能力被用来干了什么**：每一次**过了能力闸**的变更 / exec（面板路由 + agent 工具两条
 * 入口）都要恰好落一行 `[dsh-docker] capability-use: …`，字段与操作一一对应。判据（与实现同源，
 * 见 src/audit.ts 文件头）：
 *   - 「使用 = 过了闸」：403 / 400 不记（能力没有被用、docker 侧没有任何后果）；
 *   - docker 报错也算一次使用：ok=false + detail=截断后的错误文案，且错误按原路径返回（不吞）；
 *   - exec 的命令 / 错误文案截断 200 字符（带 `…` 信号）、控制字符转义——helper 统一做，
 *     不靠调用点自觉；
 *   - pull 进度流拆 start / end 两行（宿主中途挂掉时至少 start 行还在）。
 *
 * 夹具与 `config-route.test.ts` / `tool-concurrency.test.ts` 同思路：最小假宿主 + 假
 * child_process（本机目标的 docker CLI 从不真的执行）；DSH_HOME 指到临时目录做授权隔离。
 */
import { EventEmitter } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/*
 * 授权隔离：与 config-route.test.ts 同一条理由——apply() 按 dshHome() 打开带外授权存储，
 * 不隔离的话开发机上的真实授权会漏进用例。
 */
const originalDshHome = process.env.DSH_HOME
const isolatedDshHome = mkdtempSync(join(tmpdir(), 'dsh-docker-audit-'))
process.env.DSH_HOME = isolatedDshHome

const spawnMock = vi.hoisted(() => vi.fn())
vi.mock('node:child_process', () => ({ spawn: spawnMock }))

import { apply } from '../src/index.js'
import { AUDIT_DETAIL_MAX_CHARS, auditCapabilityUse, audited, sanitizeAuditValue } from '../src/audit.js'
import type { CapabilityUseLine } from '../src/audit.js'

/*
 * 审计行的出口是宿主 stdout（console.log，docker D162）——测试用 console 捕获当接缝，
 * 捕到的就是「真宿主 stdout 上会出现的字节」；插件自己的 console.log（mounted 等）也进
 * 同一个数组，由 USE_PREFIX 过滤。
 */
const consoleLogs: string[] = []
let consoleSpy: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  consoleLogs.length = 0
  consoleSpy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    consoleLogs.push(args.map((arg) => String(arg)).join(' '))
  })
})
afterEach(() => {
  consoleSpy.mockRestore()
})

/* ------------------------------------------------------------------ *
 * 能力授权（文件级）：两个开关的宿主侧授权都打开。403 的用例走「配置值关着」
 * 的路径（live.allowMutations = 配置 && 授权），不需要动环境变量。
 * ------------------------------------------------------------------ */
beforeAll(() => {
  process.env.DSH_DOCKER_ALLOW_MUTATIONS = '1'
  process.env.DSH_DOCKER_ALLOW_EXEC = '1'
})
afterAll(() => {
  delete process.env.DSH_DOCKER_ALLOW_MUTATIONS
  delete process.env.DSH_DOCKER_ALLOW_EXEC
  if (originalDshHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = originalDshHome
  rmSync(isolatedDshHome, { recursive: true, force: true })
})

/* ------------------------------------------------------------------ *
 * 假 child_process（runLocal / runLocalStream 用到的全部接口）
 * ------------------------------------------------------------------ */

interface FakeChild extends EventEmitter {
  stdout: EventEmitter
  stderr: EventEmitter
  stdin: { end: ReturnType<typeof vi.fn> }
  kill: ReturnType<typeof vi.fn>
  unref: ReturnType<typeof vi.fn>
}

/** 每条用例自己声明下一条假进程的行为；beforeEach 回落「成功 + 无输出」。 */
let nextChild: { code: number; stdout: string; stderr: string } = { code: 0, stdout: '', stderr: '' }

function makeChild(behavior: { code: number; stdout: string; stderr: string }): FakeChild {
  const child = new EventEmitter() as FakeChild
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.stdin = { end: vi.fn() }
  child.kill = vi.fn()
  child.unref = vi.fn()
  setImmediate(() => {
    if (behavior.stdout !== '') child.stdout.emit('data', Buffer.from(behavior.stdout))
    if (behavior.stderr !== '') child.stderr.emit('data', Buffer.from(behavior.stderr))
    child.emit('close', behavior.code)
  })
  return child
}

beforeEach(() => {
  nextChild = { code: 0, stdout: '', stderr: '' }
  spawnMock.mockReset()
  spawnMock.mockImplementation(() => makeChild(nextChild))
})

/* ------------------------------------------------------------------ *
 * 最小假宿主（与 config-route.test.ts 同款，另加 tools / systemPrompt / 日志捕获）
 * ------------------------------------------------------------------ */

interface FakeRoute {
  kind: string
  path: string
  handler: (req: unknown, res: unknown) => Promise<void>
}

interface FakeRes {
  status: number
  headers: Record<string, string>
  endBody: string | undefined
  frames: string[]
  flushed: boolean
  ended: boolean
  writeHead(status: number, headers?: Record<string, string>): void
  write(chunk: string): void
  flushHeaders(): void
  on(event: string, listener: (...args: unknown[]) => void): void
  end(body?: string): void
}

function makeRes(): FakeRes {
  const res: FakeRes = {
    status: 0,
    headers: {},
    endBody: undefined,
    frames: [],
    flushed: false,
    ended: false,
    writeHead(status, headers) {
      res.status = status
      res.headers = headers ?? {}
    },
    write(chunk) {
      res.frames.push(chunk)
    },
    flushHeaders() {
      res.flushed = true
    },
    on() {
      /* close / drain：测试里流自然结束，用不到 */
    },
    end(body) {
      res.ended = true
      if (body !== undefined) res.endBody = body
    },
  }
  return res
}

function makeReq(url: string, method: string, body?: unknown): unknown {
  const payload = body === undefined ? '' : JSON.stringify(body)
  const chunks = payload === '' ? [] : [Buffer.from(payload)]
  return {
    method,
    url,
    // origin 与 host 同源：MUTATION_SUBROUTES / SSE 的同源证明判据要看到它
    headers: { host: '127.0.0.1:3092', origin: 'http://127.0.0.1:3092', 'content-type': 'application/json' },
    socket: { remoteAddress: '127.0.0.1' },
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) yield chunk
    },
  }
}

interface Harness {
  route: FakeRoute
  tools: Map<string, { name: string; execute: (args: unknown) => Promise<unknown> }>
  logs: string[]
}

function mountPlugin(config: Record<string, unknown> = {}): Harness {
  const state = {
    routes: [] as FakeRoute[],
    tools: [] as Array<{ name: string; execute: (args: unknown) => Promise<unknown> }>,
    logs: [] as string[],
  }
  const listeners = new Map<string, Array<() => void>>()
  const makeChild = (names: string[]): Record<string, unknown> => {
    const on = (name: string, listener: () => void): (() => void) => {
      const list = listeners.get(name) ?? []
      list.push(listener)
      listeners.set(name, list)
      return () => {}
    }
    const child: Record<string, unknown> = {
      // 审计行就落在这里：捕获进数组供断言
      logger: {
        info: (msg: string) => {
          state.logs.push(msg)
        },
        warn: (msg: string) => {
          state.logs.push(msg)
        },
      },
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
        register: (definition: { name: string; execute: (args: unknown) => Promise<unknown> }) => {
          state.tools.push(definition)
          return () => {}
        },
      }
    }
    if (names.includes('webServer')) {
      child.webServer = {
        register: (route: FakeRoute) => {
          state.routes.push(route)
          return () => {}
        },
      }
    }
    if (names.includes('settings')) {
      child.settings = {
        describe: () => [{ ns: 'docker', value: { dockerBin: 'docker', targets: [{ name: '本机', kind: 'local' }], ...config } }],
        update: async () => {
          for (const listener of listeners.get('loader/volatile-update') ?? []) listener()
        },
        configure: () => () => {},
      }
    }
    if (names.includes('systemPrompt')) {
      child.systemPrompt = { section: () => () => {} }
    }
    return child
  }
  const root = makeChild([])
  root.inject = (names: string[], cb: (ctx: unknown) => void) => {
    cb(makeChild(names))
    return () => {}
  }
  ;(apply as unknown as (ctx: unknown, config: unknown) => void)(root, {
    dockerBin: 'docker',
    targets: [{ name: '本机', kind: 'local' }],
    allowMutations: true,
    allowExec: true,
    ...config,
  })
  const route = state.routes.find((item) => item.path === '/api/dsh-docker')
  if (route === undefined) throw new Error('未注册 /api/dsh-docker 路由')
  return { route, tools: new Map(state.tools.map((tool) => [tool.name, tool])), logs: consoleLogs }
}

async function call(harness: Harness, method: string, sub: string, body?: unknown): Promise<FakeRes> {
  const res = makeRes()
  await harness.route.handler(makeReq('/api/dsh-docker' + sub, method, body), res)
  return res
}

/* ------------------------------------------------------------------ *
 * 审计行的解析（测试侧）：前段字段无空格、detail 恒在行尾且可含空格——
 * 「没有 = 的片段」接回上一个键的值。
 * ------------------------------------------------------------------ */

const USE_PREFIX = '[dsh-docker] capability-use: '

function rawUseLines(logs: string[]): string[] {
  return logs.filter((line) => line.startsWith(USE_PREFIX))
}

function parseUseLine(line: string): Record<string, string> {
  const fields: Record<string, string> = {}
  const body = line.slice(USE_PREFIX.length)
  /*
   * detail 恒在行尾且值可含空格、可含 `cmd=…` 这类像 key=value 的文本（exec 的命令、错误文案）：
   * 按格式契约从**最后一个** ` detail=` 处整段吃下（audit.ts 的字段序把 detail 固定在最后）。
   */
  const detailAt = body.lastIndexOf(' detail=')
  const head = detailAt === -1 ? body : body.slice(0, detailAt)
  for (const pair of head.split(' ')) {
    const eq = pair.indexOf('=')
    if (eq > 0) fields[pair.slice(0, eq)] = pair.slice(eq + 1)
  }
  if (detailAt !== -1) fields.detail = body.slice(detailAt + ' detail='.length)
  return fields
}

function useLines(logs: string[]): Record<string, string>[] {
  return rawUseLines(logs).map(parseUseLine)
}

function expectFields(line: Record<string, string>, expected: Record<string, string>): void {
  for (const [key, value] of Object.entries(expected)) {
    expect(line[key], `${key} 字段（行：${JSON.stringify(line)}）`).toBe(value)
  }
}

/* ------------------------------------------------------------------ *
 * 1. helper 单测：截断 / 转义 / 字段省略 / audited 的成功失败两路
 * ------------------------------------------------------------------ */

describe('sanitizeAuditValue：截断与转义（硬规矩在 helper，不靠调用点自觉）', () => {
  it('200 字符以内原样保留；超出截到 200 并补 … 信号（按原始字符数截）', () => {
    const ok200 = 'a'.repeat(AUDIT_DETAIL_MAX_CHARS)
    expect(sanitizeAuditValue(ok200)).toBe(ok200)
    const cut = sanitizeAuditValue('b'.repeat(AUDIT_DETAIL_MAX_CHARS + 57))
    expect(cut).toBe('b'.repeat(AUDIT_DETAIL_MAX_CHARS) + '…')
    expect(cut.length).toBe(AUDIT_DETAIL_MAX_CHARS + 1)
  })

  it('控制字符转义成字面量（换行伪造不出第二行审计）；空格保留', () => {
    expect(sanitizeAuditValue('line1\nline2\r\tx')).toBe('line1\\nline2\\r\\tx')
    expect(sanitizeAuditValue('nul\u0000bel\u0007x')).toBe('nul\\x00bel\\x07x')
    expect(sanitizeAuditValue('a b c')).toBe('a b c')
    expect(sanitizeAuditValue('del\u007f')).toBe('del\\x7f')
    expect(sanitizeAuditValue('back\\slash')).toBe('back\\\\slash')
  })

  it('先按原始字符截断再转义：转义不会绕过 200 上限的语义', () => {
    // 第 150 个字符是换行：截断在 200 处，换行在截断点之前，必须以字面量出现而不是真换行
    const raw = 'x'.repeat(149) + '\n' + 'y'.repeat(80)
    const out = sanitizeAuditValue(raw)
    expect(out).not.toContain('\n')
    expect(out.startsWith('x'.repeat(149) + '\\n')).toBe(true)
    expect(out.endsWith('…')).toBe(true)
  })
})

describe('audited / auditCapabilityUse：成功失败两路都记、失败原样 rethrow', () => {
  const fields = { capability: 'allowMutations', source: 'tool', action: 'container.stop', target: '本机', ref: 'web-1' } as const

  it('成功：ok=true、durationMs 是数字、结果原样透传、detailOf 的补充进 detail', async () => {
    const result = await audited(fields, async () => ({ code: 0 }), (row) => row.code === null ? undefined : `code=${String(row.code)}`)
    expect(result).toEqual({ code: 0 })
    const lines = useLines(consoleLogs)
    expect(lines).toHaveLength(1)
    expectFields(lines[0] ?? {}, { capability: 'allowMutations', source: 'tool', action: 'container.stop', target: '本机', ref: 'web-1', ok: 'true', detail: 'code=0' })
    expect(Number(lines[0]?.durationMs)).not.toBeNaN()
  })

  it('失败：ok=false + detail=错误文案，错误原样 rethrow（不吞）', async () => {
    const failure = new Error('docker 炸了：磁盘满')
    await expect(audited(fields, async () => {
      throw failure
    })).rejects.toBe(failure)
    const lines = useLines(consoleLogs)
    expect(lines).toHaveLength(1)
    expectFields(lines[0] ?? {}, { ok: 'false', detail: 'docker 炸了：磁盘满', capability: 'allowMutations', ref: 'web-1' })
  })

  it('prune 这类无 ref 的操作：行里没有 ref 字段', () => {
    const line: CapabilityUseLine = { capability: 'allowMutations', source: 'http', action: 'image.prune', target: '本机' }
    auditCapabilityUse(line)
    const raw = rawUseLines(consoleLogs)[0] ?? ''
    expect(raw).not.toContain('ref=')
    // 空串与 undefined 同待遇
    auditCapabilityUse({ ...line, ref: '' })
    expect(rawUseLines(consoleLogs)[1]).not.toContain('ref=')
  })

  it('整行格式（黄金行，不含计时字段）：与 README 写死的格式逐字一致', () => {
    auditCapabilityUse({ capability: 'allowMutations', source: 'http', action: 'container.remove', target: '目标2', ref: 'web', ok: true, detail: 'code=0' })
    expect(rawUseLines(consoleLogs)[0]).toBe('[dsh-docker] capability-use: capability=allowMutations source=http action=container.remove target=目标2 ref=web ok=true detail=code=0')
  })
})

/* ------------------------------------------------------------------ *
 * 2. HTTP 路由：八条变更 / exec 路由各恰好一行；只读与 403 零行
 * ------------------------------------------------------------------ */

describe('HTTP 路由：每次过闸的使用各落一行', () => {
  it('/images/remove → image.remove，ref 是镜像引用', async () => {
    const harness = mountPlugin()
    const before = useLines(harness.logs).length
    const res = await call(harness, 'POST', '/images/remove', { target: '本机', ref: 'nginx:1.27' })
    expect(res.status).toBe(200)
    const lines = useLines(harness.logs).slice(before)
    expect(lines).toHaveLength(1)
    expectFields(lines[0] ?? {}, { capability: 'allowMutations', source: 'http', action: 'image.remove', target: '本机', ref: 'nginx:1.27', ok: 'true' })
    expect(Number(lines[0]?.durationMs)).not.toBeNaN()
    // 整行形状（用第一条变更路由钉一次完整格式）
    expect(rawUseLines(harness.logs)[before]).toMatch(/^\[dsh-docker\] capability-use: capability=allowMutations source=http action=image\.remove target=本机 ref=nginx:1\.27 ok=true durationMs=\d+$/)
  })

  it('/images/prune → image.prune，无 ref 字段', async () => {
    const harness = mountPlugin()
    const before = useLines(harness.logs).length
    await call(harness, 'POST', '/images/prune', { target: '本机' })
    const lines = useLines(harness.logs).slice(before)
    expect(lines).toHaveLength(1)
    expectFields(lines[0] ?? {}, { capability: 'allowMutations', source: 'http', action: 'image.prune', target: '本机', ok: 'true' })
    expect(lines[0]).not.toHaveProperty('ref')
  })

  it('/networks/remove 与 /networks/prune → network.remove / network.prune', async () => {
    const harness = mountPlugin()
    const before = useLines(harness.logs).length
    await call(harness, 'POST', '/networks/remove', { target: '本机', name: 'shop_default' })
    await call(harness, 'POST', '/networks/prune', { target: '本机' })
    const lines = useLines(harness.logs).slice(before)
    expect(lines).toHaveLength(2)
    expectFields(lines[0] ?? {}, { source: 'http', action: 'network.remove', ref: 'shop_default' })
    expectFields(lines[1] ?? {}, { source: 'http', action: 'network.prune' })
    expect(lines[1]).not.toHaveProperty('ref')
  })

  it('/volumes/remove 与 /volumes/prune → volume.remove / volume.prune', async () => {
    const harness = mountPlugin()
    const before = useLines(harness.logs).length
    await call(harness, 'POST', '/volumes/remove', { target: '本机', name: 'pgdata' })
    await call(harness, 'POST', '/volumes/prune', { target: '本机' })
    const lines = useLines(harness.logs).slice(before)
    expect(lines).toHaveLength(2)
    expectFields(lines[0] ?? {}, { source: 'http', action: 'volume.remove', ref: 'pgdata' })
    expectFields(lines[1] ?? {}, { source: 'http', action: 'volume.prune' })
  })

  it('/action → container.<action>，ref 是容器 id', async () => {
    const harness = mountPlugin()
    const before = useLines(harness.logs).length
    await call(harness, 'POST', '/action', { target: '本机', action: 'restart', id: 'shop-web-1' })
    const lines = useLines(harness.logs).slice(before)
    expect(lines).toHaveLength(1)
    expectFields(lines[0] ?? {}, { capability: 'allowMutations', source: 'http', action: 'container.restart', target: '本机', ref: 'shop-web-1', ok: 'true' })
  })

  it('/exec → exec，capability=allowExec，退出码与命令进 detail', async () => {
    const harness = mountPlugin()
    const before = useLines(harness.logs).length
    const res = await call(harness, 'POST', '/exec', { target: '本机', id: 'shop-web-1', command: 'echo hi' })
    expect(res.status).toBe(200)
    const lines = useLines(harness.logs).slice(before)
    expect(lines).toHaveLength(1)
    expectFields(lines[0] ?? {}, { capability: 'allowExec', source: 'http', action: 'exec', target: '本机', ref: 'shop-web-1', ok: 'true', detail: 'code=0 cmd=echo hi' })
  })

  it('GET /images/pull/stream：开流 start + 收尾 end 两行（end 带 reason / code / durationMs）', async () => {
    const harness = mountPlugin()
    const before = useLines(harness.logs).length
    const res = await call(harness, 'GET', '/images/pull/stream?target=本机&ref=nginx:1.27')
    expect(res.status).toBe(200)
    expect(res.flushed).toBe(true)
    const lines = useLines(harness.logs).slice(before)
    expect(lines).toHaveLength(2)
    expectFields(lines[0] ?? {}, { capability: 'allowMutations', source: 'http', action: 'image.pull', target: '本机', ref: 'nginx:1.27', event: 'start' })
    // start 行还没有结果：不带 ok / durationMs
    expect(lines[0]).not.toHaveProperty('ok')
    expect(lines[0]).not.toHaveProperty('durationMs')
    expectFields(lines[1] ?? {}, { event: 'end', ok: 'true', reason: 'pull-exit', code: '0' })
    expect(Number(lines[1]?.durationMs)).not.toBeNaN()
  })

  it('400（非法 ref，D37）：没到 docker 就被拒，不算使用', async () => {
    const harness = mountPlugin()
    const before = useLines(harness.logs).length
    const res = await call(harness, 'POST', '/images/remove', { target: '本机', ref: 'nginx; rm -rf /' })
    expect(res.status).toBe(400)
    expect(useLines(harness.logs)).toHaveLength(before)
  })
})

describe('只读路由与 /connect-local：零 use 行', () => {
  it('读一路（probe / containers / inspect / logs / stats / images / networks / volumes）不产生审计行', async () => {
    const harness = mountPlugin()
    const before = useLines(harness.logs).length
    for (const [method, sub, body] of [
      ['POST', '/probe', { target: '本机' }],
      ['POST', '/containers', { target: '本机' }],
      ['POST', '/inspect', { target: '本机', id: 'shop-web-1' }],
      ['POST', '/logs', { target: '本机', id: 'shop-web-1' }],
      ['POST', '/stats', { target: '本机', ids: ['shop-web-1'] }],
      ['POST', '/images', { target: '本机' }],
      ['POST', '/images/inspect', { target: '本机', ref: 'nginx:1.27' }],
      ['POST', '/networks', { target: '本机' }],
      ['POST', '/volumes', { target: '本机' }],
    ] as const) {
      const res = await call(harness, method, sub, body)
      expect(res.status, sub).toBe(200)
    }
    expect(useLines(harness.logs)).toHaveLength(before)
  })

  it('POST /connect-local：不经能力闸（写的是插件自己的配置），零 use 行', async () => {
    const harness = mountPlugin()
    const before = useLines(harness.logs).length
    await call(harness, 'POST', '/connect-local', {})
    expect(useLines(harness.logs)).toHaveLength(before)
  })
})

/* ------------------------------------------------------------------ *
 * 3. 失败路径：docker 报错也算一次使用（ok=false + 截断 detail），错误不吞
 * ------------------------------------------------------------------ */

describe('失败路径：docker 报错也是一次使用', () => {
  const LONG_STDERR = 'E: ' + 'docker 端的长报错。'.repeat(40) // 远超 200 字符的单行错误

  it('/action 失败：ok=false + detail 截到 200（带 …），响应仍按原路径返回错误', async () => {
    const harness = mountPlugin()
    nextChild = { code: 1, stdout: '', stderr: LONG_STDERR }
    const before = useLines(harness.logs).length
    const res = await call(harness, 'POST', '/action', { target: '本机', action: 'remove', id: 'shop-web-1' })
    // 不吞：api 抛错被 guardTargetFailures 标记为目标级失败 → 原有 catch 写 200 + ok:false，
    // 客户端从 payload.error 拿到原因（与 SSH 不可达同一口径）
    expect(res.status).toBe(200)
    const body = JSON.parse(res.endBody ?? '{}') as { ok: boolean; error?: string }
    expect(body.ok).toBe(false)
    expect(body.error).toContain('失败')
    const lines = useLines(harness.logs).slice(before)
    expect(lines).toHaveLength(1)
    expectFields(lines[0] ?? {}, { action: 'container.remove', ok: 'false' })
    const detail = lines[0]?.detail ?? ''
    expect(detail.startsWith('remove shop-web-1 失败：E: ')).toBe(true)
    // 200 原始字符 + … 信号：转义/截断都在 helper 里发生
    expect(detail.length).toBe(AUDIT_DETAIL_MAX_CHARS + 1)
    expect(detail.endsWith('…')).toBe(true)
  })

  it('agent 工具失败：同样 ok=false，且异常原样抛给调用方', async () => {
    const harness = mountPlugin()
    nextChild = { code: 1, stdout: '', stderr: 'image is being used by container shop-web-1' }
    const before = useLines(harness.logs).length
    const tool = harness.tools.get('docker_image_remove')
    expect(tool).toBeDefined()
    await expect(tool?.execute({ target: '本机', ref: 'nginx:1.27' })).rejects.toThrow(/删除镜像 nginx:1\.27 失败/)
    const lines = useLines(harness.logs).slice(before)
    expect(lines).toHaveLength(1)
    expectFields(lines[0] ?? {}, { source: 'tool', action: 'image.remove', ref: 'nginx:1.27', ok: 'false' })
    expect(lines[0]?.detail).toContain('image is being used')
  })

  it('exec 命令自己退出 1：不是 docker 报错——ok=true，退出码进 detail（语义分界）', async () => {
    const harness = mountPlugin()
    nextChild = { code: 1, stdout: '', stderr: 'ls: cannot access: No such file' }
    const before = useLines(harness.logs).length
    const res = await call(harness, 'POST', '/exec', { target: '本机', id: 'shop-web-1', command: 'ls /nope' })
    expect(res.status).toBe(200)
    const lines = useLines(harness.logs).slice(before)
    expect(lines).toHaveLength(1)
    expectFields(lines[0] ?? {}, { action: 'exec', ok: 'true', detail: 'code=1 cmd=ls /nope' })
  })
})

/* ------------------------------------------------------------------ *
 * 4. agent 工具：source=tool（走 DockerApi，不经 HTTP 路由，不与路由重复计数）
 * ------------------------------------------------------------------ */

describe('agent 工具：source=tool', () => {
  it('docker_action → container.stop', async () => {
    const harness = mountPlugin()
    const before = useLines(harness.logs).length
    await harness.tools.get('docker_action')?.execute({ target: '本机', action: 'stop', id: 'shop-web-1' })
    const lines = useLines(harness.logs).slice(before)
    expect(lines).toHaveLength(1)
    expectFields(lines[0] ?? {}, { capability: 'allowMutations', source: 'tool', action: 'container.stop', target: '本机', ref: 'shop-web-1', ok: 'true' })
  })

  it('docker_image_remove / docker_image_prune', async () => {
    const harness = mountPlugin()
    const before = useLines(harness.logs).length
    await harness.tools.get('docker_image_remove')?.execute({ target: '本机', ref: 'nginx:1.27' })
    await harness.tools.get('docker_image_prune')?.execute({ target: '本机' })
    const lines = useLines(harness.logs).slice(before)
    expect(lines).toHaveLength(2)
    expectFields(lines[0] ?? {}, { source: 'tool', action: 'image.remove', ref: 'nginx:1.27' })
    expectFields(lines[1] ?? {}, { source: 'tool', action: 'image.prune' })
    expect(lines[1]).not.toHaveProperty('ref')
  })

  it('docker_image_pull → image.pull（退出码进 detail）', async () => {
    const harness = mountPlugin()
    const before = useLines(harness.logs).length
    await harness.tools.get('docker_image_pull')?.execute({ target: '本机', ref: 'alpine:3.19' })
    const lines = useLines(harness.logs).slice(before)
    expect(lines).toHaveLength(1)
    expectFields(lines[0] ?? {}, { source: 'tool', action: 'image.pull', ref: 'alpine:3.19', ok: 'true', detail: 'code=0' })
  })

  it('docker_exec → exec（capability=allowExec，退出码与命令进 detail）', async () => {
    const harness = mountPlugin()
    const before = useLines(harness.logs).length
    await harness.tools.get('docker_exec')?.execute({ target: '本机', id: 'shop-web-1', command: 'env' })
    const lines = useLines(harness.logs).slice(before)
    expect(lines).toHaveLength(1)
    expectFields(lines[0] ?? {}, { capability: 'allowExec', source: 'tool', action: 'exec', ref: 'shop-web-1', ok: 'true', detail: 'code=0 cmd=env' })
  })

  it('exec 的命令进日志（README 明写的代价）：控制字符转义、整段截断 200，都在 helper 发生', async () => {
    const harness = mountPlugin()
    const before = useLines(harness.logs).length
    // 命令里带真换行：日志行必须仍是「一行」，换行以 \n 字面量出现
    await harness.tools.get('docker_exec')?.execute({ target: '本机', id: 'shop-web-1', command: 'echo a\nb\tc' })
    const line = useLines(harness.logs).slice(before)[0] ?? {}
    expect(line.detail).toBe('code=0 cmd=echo a\\nb\\tc')
    expect(rawUseLines(harness.logs)[before]?.split('\n')).toHaveLength(1)

    // 超长命令：detail 整段截到 200 原始字符 + …
    const long = 'c'.repeat(AUDIT_DETAIL_MAX_CHARS + 500)
    await harness.tools.get('docker_exec')?.execute({ target: '本机', id: 'shop-web-1', command: long })
    const longLine = useLines(harness.logs).slice(before)[1] ?? {}
    expect(longLine.detail?.endsWith('…')).toBe(true)
    expect(longLine.detail?.length).toBe(AUDIT_DETAIL_MAX_CHARS + 1)
    expect(longLine.detail?.startsWith('code=0 cmd=')).toBe(true)
  })
})

/* ------------------------------------------------------------------ *
 * 5. 未过闸（403）：不记——「使用 = 过了闸」
 * ------------------------------------------------------------------ */

describe('403：不记 use 行', () => {
  it('配置关着（即使宿主侧有授权）：/action、/exec、pull 流全部 403 且零 use 行，变更工具不注册', async () => {
    // 只挂配置里的 allowMutations / allowExec 不给 → 有效值 = 配置 && 授权 = false
    const harness = mountPlugin({ allowMutations: false, allowExec: false })
    expect(useLines(harness.logs)).toHaveLength(0)

    const action = await call(harness, 'POST', '/action', { target: '本机', action: 'stop', id: 'shop-web-1' })
    expect(action.status).toBe(403)
    const exec = await call(harness, 'POST', '/exec', { target: '本机', id: 'shop-web-1', command: 'ls' })
    expect(exec.status).toBe(403)
    const pull = await call(harness, 'GET', '/images/pull/stream?target=本机&ref=nginx:1.27')
    expect(pull.status).toBe(403)
    // 403 时不建流：没有 SSE 响应头
    expect(pull.flushed).toBe(false)

    expect(useLines(harness.logs)).toHaveLength(0)
    // 工具不注册：agent 侧同一把闸
    expect(harness.tools.has('docker_action')).toBe(false)
    expect(harness.tools.has('docker_exec')).toBe(false)
  })

  afterEach(() => {
    // spawnMock 的调用记录是模块级的：反向断言（零 use 行）最怕脏状态
    spawnMock.mockReset()
  })
})
