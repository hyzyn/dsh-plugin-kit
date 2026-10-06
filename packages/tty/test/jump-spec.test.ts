/**
 * @hyzyn/dsh-tty — 跳板机（ProxyJump 单跳）在**连接簿**这条链路上的回归。
 *
 * 为什么这门测试最要紧：`jump` 要穿过**四道扁平白名单**（settings schema →
 * `sanitizeSshHosts` 宽松清洗 → `validateSshHosts` 严格校验 → 面板/路由的字段融合）。
 * 漏一道的表现是**静默直连**——用户配了跳板机、界面照常保存、什么错都不报，
 * 只是在那些主机上永远连不上（连不上还只报通用超时）。本仓把这类问题叫「配了等于没配」，
 * 是这一项立项时点名的头号坑。
 *
 * 所以这里既测两个纯函数（清洗 / 严格校验），也**真跑一遍插件**：
 * `POST /api/dsh-tty/config` 存进去、`GET` 读回来，断言 `jump` 一字不差。
 */
// DSH_HOME 隔离（D69）：读不到开发机上的真实授权文件
import './isolated-home.js'
import { describe, expect, it } from 'vitest'
import { apply } from '../src/index.js'
import { sanitizeJumpSpec, validateJumpSpec } from '../src/ssh.js'

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

/** 挂载插件并取出 `/api/dsh-tty/config` 路由（其余服务给够用的假件）。 */
function mountConfigRoute(): (req: unknown, res: FakeRes) => Promise<void> {
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
    if (names.includes('settings')) {
      child.settings = { describe: () => [], update: async () => {}, configure: () => () => {} }
    }
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
  const route = routes.find((item) => item.path === '/api/dsh-tty/config')
  if (route === undefined) throw new Error('未注册 /api/dsh-tty/config 路由')
  return route.handler
}

function makeReq(method: string, body?: unknown): unknown {
  const payload = body === undefined ? '' : JSON.stringify(body)
  return {
    method,
    url: '/api/dsh-tty/config',
    headers: { host: '127.0.0.1:3080', 'sec-fetch-site': 'same-origin', 'content-type': 'application/json' },
    socket: { remoteAddress: '127.0.0.1' },
    async *[Symbol.asyncIterator]() {
      if (payload !== '') yield Buffer.from(payload)
    },
  }
}

describe('sanitizeJumpSpec / validateJumpSpec（两个纯函数白名单点）', () => {
  it('清洗：只留有效字段；没配（host 空）→ undefined，不留半个对象', () => {
    expect(sanitizeJumpSpec(undefined)).toBeUndefined()
    expect(sanitizeJumpSpec({})).toBeUndefined()
    expect(sanitizeJumpSpec({ host: '   ' })).toBeUndefined()
    expect(sanitizeJumpSpec({ host: ' bastion ', port: '2222', username: ' jump ', auth: 'password', password: 'pw' }))
      .toEqual({ host: 'bastion', port: 2222, username: 'jump', auth: 'password', password: 'pw' })
  })

  it('清洗：非法端口回落 22；缺省字段**不写进结果**（那些要继承目标那一跳）', () => {
    expect(sanitizeJumpSpec({ host: 'b', port: 70000 })).toEqual({ host: 'b', port: 22 })
    expect(sanitizeJumpSpec({ host: 'b' })).toEqual({ host: 'b', port: 22 })
  })

  it('严格校验：拒绝分支逐条点名', () => {
    expect(validateJumpSpec(null).error).toContain('必须是对象')
    expect(validateJumpSpec({}).error).toContain('jump.host')
    expect(validateJumpSpec({ host: 'b', port: 0 }).error).toContain('1~65535')
    expect(validateJumpSpec({ host: 'b', username: 1 }).error).toContain('jump.username')
    expect(validateJumpSpec({ host: 'b', auth: 'magic' }).error).toContain('agent / key / password')
    expect(validateJumpSpec({ host: 'b', keyPath: 1 }).error).toContain('jump.keyPath')
    expect(validateJumpSpec({ host: 'b', auth: 'key' }).error).toContain('需要 jump.keyPath')
  })

  it('严格校验：合法输入回清洗后的对象', () => {
    expect(validateJumpSpec({ host: 'b', auth: 'agent' })).toEqual({ jump: { host: 'b', port: 22, auth: 'agent' } })
  })
})

describe('连接簿配置往返（settings schema + 两条清洗路径）', () => {
  it('POST 带 jump 的条目 → GET 读回仍是同一条（四道白名单都没漏）', async () => {
    const handler = mountConfigRoute()
    const entry = {
      name: 'prod-via-bastion',
      host: '10.1.0.9',
      port: 22,
      username: 'deploy',
      auth: 'key',
      keyPath: '~/.ssh/id_ed25519',
      passphrase: '',
      password: '',
      agentForward: false,
      // hostKeyAlias 一并带上（0.25.0）：它同样要穿过那几道白名单，
      // 只测 jump 会让「新字段在某一层被静默丢掉」这类回归漏过去
      hostKeyAlias: 'prod-alias',
      persist: false,
      jump: { host: 'bastion.corp', port: 2222, username: 'jumper' },
    }
    const post = makeRes()
    await handler(makeReq('POST', { sshHosts: [entry] }), post)
    expect(post.status, String(post.body)).toBe(200)

    const get = makeRes()
    await handler(makeReq('GET'), get)
    expect(get.status).toBe(200)
    const config = (JSON.parse(String(get.body)) as { config?: { sshHosts?: unknown[] } }).config ?? {}
    expect(config.sshHosts).toEqual([entry])
  })

  it('非法 jump 会被**明确拒绝**（400），而不是静默丢掉跳板机', async () => {
    const handler = mountConfigRoute()
    const post = makeRes()
    await handler(makeReq('POST', {
      sshHosts: [{ name: 'x', host: 'h', port: 22, username: 'u', auth: 'agent', jump: { host: '', } }],
    }), post)
    expect(post.status).toBe(400)
    expect(String(post.body)).toContain('jump.host')
  })
})
