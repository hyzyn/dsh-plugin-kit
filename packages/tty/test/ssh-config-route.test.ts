/**
 * @hyzyn/dsh-tty — `GET /api/dsh-tty/ssh-config` 的回归测试（项目级 ROADMAP 第 2 项）。
 *
 * 契约：导入候选只含**可直接连的**块；依赖跳板机（ProxyJump / ProxyCommand）的块
 * 整块跳过并**把名字报回去**——不静默少列，也不产出一条注定「20s 后通用超时」的连接簿
 * 条目（那是原文点名的症状）。其余每种丢弃（通配 / 无 User / 超上限）同样要有计数。
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { apply } from '../src/index.js'

interface FakeRoute {
  kind: string
  path: string
  handler: (req: unknown, res: unknown) => Promise<void>
}

interface FakeRes {
  status: number
  body: string | undefined
  writeHead(status: number): void
  end(body?: string): void
}

function makeRes(): FakeRes {
  const res: FakeRes = {
    status: 0,
    body: undefined,
    writeHead(status) {
      res.status = status
    },
    end(body) {
      if (body !== undefined) res.body = body
    },
  }
  return res
}

/** 挂载插件并把 `/api/dsh-tty/ssh-config` 路由取出来（其余服务给够用的假件）。 */
function mountPlugin(): (req: unknown, res: FakeRes) => Promise<void> {
  const routes: FakeRoute[] = []
  const makeChild = (names: string[]): Record<string, unknown> => {
    const child: Record<string, unknown> = {
      logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
      effect: (callback: () => unknown) => {
        callback()
        return () => {}
      },
      inject: (childNames: string[], cb: (ctx: unknown) => void) => {
        cb(makeChild(childNames))
        return () => {}
      },
      on: () => () => {},
      events: { on: () => () => {} },
      get: () => undefined,
    }
    if (names.includes('webServer')) {
      child.webServer = {
        register: (route: FakeRoute) => {
          routes.push(route)
          return () => {}
        },
        registerUpgrade: () => () => {},
      }
    }
    if (names.includes('settings')) child.settings = { describe: () => [], update: async () => {}, configure: () => () => {} }
    if (names.includes('systemPrompt')) child.systemPrompt = { section: () => () => {}, context: () => () => {} }
    if (names.includes('credentials')) child.credentials = { resolve: async () => ({ value: undefined }) }
    return child
  }
  const root = makeChild([])
  root.inject = (names: string[], cb: (ctx: unknown) => void) => {
    cb(makeChild(names))
    return () => {}
  }
  ;(apply as unknown as (ctx: unknown, config: unknown) => void)(root, {})
  const route = routes.find((item) => item.path === '/api/dsh-tty/ssh-config')
  if (route === undefined) throw new Error('未注册 /api/dsh-tty/ssh-config 路由')
  return route.handler
}

let home: string
let previousHome: string | undefined
let previousUserProfile: string | undefined

/*
 * **两个变量都要设**（Windows 真机抓到的）：产品侧用 `os.homedir()`，它在 POSIX 上看 `HOME`、
 * 在 Windows 上看 `USERPROFILE`。只改 `HOME` 的写法在 macOS / ubuntu 上绿，在 Windows 上
 * 路由读的是 SYSTEM/用户的真实 profile（那儿没有 `.ssh/config`）→ 断言全崩。
 */
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'dsh-tty-sshcfg-'))
  previousHome = process.env.HOME
  process.env.HOME = home
  previousUserProfile = process.env.USERPROFILE
  process.env.USERPROFILE = home
})

afterEach(() => {
  if (previousHome === undefined) delete process.env.HOME
  else process.env.HOME = previousHome
  if (previousUserProfile === undefined) delete process.env.USERPROFILE
  else process.env.USERPROFILE = previousUserProfile
  rmSync(home, { recursive: true, force: true })
})

function writeSshConfig(text: string): void {
  mkdirSync(join(home, '.ssh'), { recursive: true })
  writeFileSync(join(home, '.ssh', 'config'), text)
}

function makeReq(): unknown {
  return {
    method: 'GET',
    url: '/api/dsh-tty/ssh-config',
    headers: { host: '127.0.0.1:3080', 'sec-fetch-site': 'same-origin' },
    socket: { remoteAddress: '127.0.0.1' },
  }
}

describe('GET /api/dsh-tty/ssh-config（导入候选 + 丢弃信号）', () => {
  it('直接可连的块进候选；依赖跳板机的块跳过并在 proxy 里点名', async () => {
    writeSshConfig([
      'Host prod',
      '  HostName 10.0.0.1',
      '  User deploy',
      'Host internal',
      '  HostName 10.1.0.9',
      '  User deploy',
      '  ProxyJump bastion',
    ].join('\n'))
    const res = makeRes()
    await mountPlugin()(makeReq(), res)
    const body = JSON.parse(String(res.body)) as Record<string, unknown>
    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect((body.entries as Array<{ name: string }>).map((entry) => entry.name)).toEqual(['prod', 'internal'])
    // ProxyJump 现在解析成结构化 jump 一起导入（单跳）
    expect((body.entries as Array<{ jump?: unknown }>)[1].jump).toEqual({ host: 'bastion', port: 22 })
    expect(body.jumpImported).toBe(1)
    expect(body.proxy).toEqual([])
    expect(body.proxyCount).toBe(0)
    expect(body.skippedOther).toBe(0)
    expect(body.droppedOverflow).toBe(0)
  })

  it('没有可导入的条目时也照常 200（空候选 + 计数如实）', async () => {
    writeSshConfig('Host *.corp\n  User u\nHost via\n  User u\n  ProxyCommand ssh -W %h:%p b\n')
    const res = makeRes()
    await mountPlugin()(makeReq(), res)
    const body = JSON.parse(String(res.body)) as Record<string, unknown>
    expect(body.entries).toEqual([])
    expect(body.proxyCommand).toEqual(['via'])
    expect(body.proxyCommandCount).toBe(1)
    expect(body.skippedOther).toBe(1)
  })

  it('读不到 ~/.ssh/config → ok:false 带原文（不是 500，也不是空成功）', async () => {
    const res = makeRes()
    await mountPlugin()(makeReq(), res)
    const body = JSON.parse(String(res.body)) as Record<string, unknown>
    expect(body.ok).toBe(false)
    expect(String(body.error)).toContain('~/.ssh/config')
  })

  it('非 GET 与无同源证明的请求照旧被挡（围栏改动不能把这条路放开）', async () => {
    writeSshConfig('Host a\n  User u\n')
    const handler = mountPlugin()
    const wrongMethod = makeRes()
    await handler({ ...(makeReq() as object), method: 'POST' }, wrongMethod)
    expect(wrongMethod.status).toBe(405)

    const noProof = makeRes()
    // 只读路由不要求同源证明，但跨站仍在围栏这一层拒
    await handler({ ...(makeReq() as object), headers: { host: '127.0.0.1:3080', 'sec-fetch-site': 'cross-site' } }, noProof)
    expect(noProof.status).toBe(403)
  })
})
