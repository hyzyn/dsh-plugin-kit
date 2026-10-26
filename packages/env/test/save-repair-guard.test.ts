/**
 * @hyzyn/dsh-env — 保存路由的「边界不可判定就拒写」守卫（2026-10-19 外部测评 issue #13 第 5 条）。
 *
 * 现场：用户手改 `~/.dsh/env.yml` 时误删结束标记 `# --- end dsh-env-manager managed ---`，
 * 卡片里 list 回了 `fileError`（但客户端当时根本没渲染它），点保存仍然 200，而写侧走
 * `lines.slice(0, start) + block`——起始标记之后的全部内容被静默删除。
 *
 * 现在的判据分两层：
 *   1. 写侧（writeManagedEntries）走 kit 的 spliceManagedBlock，悬空标记只重写标记行，
 *      其后内容逐字节保留——即使有人绕过路由直接调用也不会丢数据；
 *   2. 保存路由见到 `needsRepair` 直接 400、**一个字节都不写**，并让用户先补结束标记；
 *      卡片从 list 的 `needsRepair` 得知这一点（禁用保存 + 显示修复指引）。
 *
 * 这里测的是第 2 层（第 1 层在 managed-env.test.ts 的写侧用例里）。
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { apply, readManagedEntries, writeManagedEntries } from '../src/index.js'

const MARK_START = '# --- dsh-env-manager managed (auto-generated; do not edit) ---'
const MARK_END = '# --- end dsh-env-manager managed ---'

let dir: string
let file: string
const originalEnvFile = process.env.DSH_ENV_FILE

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

/** 挂插件、只想拿到 webServer 注册的路由（credentials/systemPrompt 的回调不触发）。 */
function mountRoutes(): Map<string, FakeRoute> {
  const routes = new Map<string, FakeRoute>()
  const childFor = (names: string[]): Record<string, unknown> => {
    const child: Record<string, unknown> = {
      provide: () => () => {},
      effect: (callback: () => unknown) => {
        callback()
        return () => {}
      },
      inject: (childNames: string[], callback: (ctx: unknown) => void) => {
        if (childNames.includes('webServer')) callback(childFor(childNames))
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
    return child
  }
  ;(apply as unknown as (ctx: unknown, config: unknown) => void)(childFor([]), {
    announceToAgent: false,
    // 不碰 process.env，也不碰凭据存储：本用例只看文件与响应。
    applyToProcessEnv: false,
    secretsInCredentials: false,
  })
  return routes
}

async function call(
  routes: Map<string, FakeRoute>,
  path: string,
  method: string,
  body?: unknown,
): Promise<{ status: number; json: Record<string, unknown> | undefined }> {
  const route = routes.get(path)
  if (route === undefined) throw new Error(`未注册路由 ${path}`)
  const res: FakeRes = {
    status: 0,
    endBody: undefined,
    writeHead(status) {
      res.status = status
    },
    end(bodyValue) {
      if (bodyValue !== undefined) res.endBody = bodyValue
    },
  }
  await route.handler(makeReq(path, method, body), res)
  return { status: res.status, json: res.endBody === undefined ? undefined : JSON.parse(res.endBody) }
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'dsh-env-repair-'))
  file = join(dir, 'env.yml')
  process.env.DSH_ENV_FILE = file
})

afterEach(() => {
  if (originalEnvFile === undefined) delete process.env.DSH_ENV_FILE
  else process.env.DSH_ENV_FILE = originalEnvFile
  rmSync(dir, { recursive: true, force: true })
})

describe('/api/dsh-env/save：托管区块边界不可判定时拒写', () => {
  it('缺结束标记：400、文件逐字节未动、提示先补标记', async () => {
    const routes = mountRoutes()
    const before = [
      '# 区块外用户内容',
      MARK_START,
      '- key: KEEP',
      "  value: '1'",
      '  secret: false',
      '# 这一行与下一行在旧实现里会被保存删掉',
      'OTHER: keep',
      '',
    ].join('\n')
    writeFileSync(file, before)

    const { status, json } = await call(routes, '/api/dsh-env/save', 'POST', {
      entries: [{ key: 'NEW', value: '2', secret: false }],
    })
    expect(status).toBe(400)
    expect(String(json?.error)).toContain('缺少结束标记')
    expect(json?.needsRepair).toBe(true)
    // 关键断言：拒绝就是真拒绝，磁盘上一个字节都没动。
    expect(readFileSync(file, 'utf8')).toBe(before)
    expect(readManagedEntries().needsRepair).toBe(true)
  })

  it('list 把 needsRepair 回给卡片：界面据此禁用保存并显示修复指引', async () => {
    const routes = mountRoutes()
    writeFileSync(file, `${MARK_START}\n- key: A\n  value: '1'\n  secret: false\n`)

    const { status, json } = await call(routes, '/api/dsh-env/list', 'GET')
    expect(status).toBe(200)
    expect(json?.needsRepair).toBe(true)
    expect(String(json?.fileError)).toContain('缺少结束标记')
  })

  it('对照：健康文件正常保存 200，区块被更新（守卫不外溢到正常路径）', async () => {
    const routes = mountRoutes()
    writeManagedEntries([{ key: 'A', value: '1', secret: false }])

    const { status } = await call(routes, '/api/dsh-env/save', 'POST', {
      entries: [{ key: 'B', value: '2', secret: false }],
    })
    expect(status).toBe(200)
    expect(readManagedEntries().entries).toStrictEqual([{ key: 'B', value: '2', secret: false }])
  })

  it('缺损但标记齐全（YAML 坏）：仍允许保存并自愈（400 守卫只针对边界不可判定）', async () => {
    const routes = mountRoutes()
    writeFileSync(file, `${MARK_START}\n- key: [unclosed\n${MARK_END}\n`)

    const { status } = await call(routes, '/api/dsh-env/save', 'POST', {
      entries: [{ key: 'A', value: '1', secret: false }],
    })
    expect(status).toBe(200)
    expect(readManagedEntries().fileError).toBeUndefined()
    expect(readManagedEntries().entries).toStrictEqual([{ key: 'A', value: '1', secret: false }])
  })
})
