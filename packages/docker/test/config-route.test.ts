/**
 * @hyzyn/dsh-docker — `dockerBin` 的 Windows 路径 + `POST /config` 写入顺序回归测试。
 *
 * 真机（Windows 11 ARM64，中文区）上暴露的两个问题：
 *
 *   1. `assertBin` 的字符类 `/^[A-Za-z0-9_./-]+$/` 少了 `:` 与 `\`——而 Windows 上
 *      **任何绝对路径**都带盘符冒号（`C:\Program Files\Docker\Docker\resources\bin\
 *      docker.exe`）。于是用户在设置卡片里根本填不进自己的 docker，填了就 400。
 *   2. 该校验只发生在 `applySection`，而它跑在 `scope.update` **之后**：非法值先被写进
 *      settings.yaml，再抛异常穿到宿主 HTTP 层 → 用户收到**无正文的 400**（真机实测
 *      `Transfer-Encoding: chunked` + 0 字节），而磁盘上已经留下那个非法值；下次启动
 *      `normalizeConfig` 再抛，整段 docker 配置（含目标列表、logTailDefault）静默退回默认。
 *
 * 因此这里既断言「Windows 绝对路径被接受、shell 元字符仍被拒」，也断言
 * 「非法值 400 且**没有**落进 settings scope」——后者才是那条链路的真正回归点。
 */
import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'

const spawnMock = vi.hoisted(() => vi.fn())
vi.mock('node:child_process', () => ({ spawn: spawnMock }))

import { assertBin } from '../src/docker.js'
import { apply } from '../src/index.js'

/* ------------------------------------------------------------------ *
 * 最小假宿主（与 test/streams.test.ts 同思路，这里只需要 webServer + settings）
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
  writeHead(status: number, headers?: Record<string, string>): void
  end(body?: string): void
}

function makeRes(): FakeRes {
  const res: FakeRes = {
    status: 0,
    headers: {},
    endBody: undefined,
    writeHead(status, headers) {
      res.status = status
      res.headers = headers ?? {}
    },
    end(body) {
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
    headers: { host: '127.0.0.1:3092', 'content-type': 'application/json' },
    socket: { remoteAddress: '127.0.0.1' },
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) yield chunk
    },
  }
}

interface Harness {
  route: FakeRoute
  settingsStored: Record<string, unknown>
  updates: Array<Record<string, unknown>>
}

function mountPlugin(options: { tty?: Record<string, unknown> } = {}): Harness {
  const state = {
    routes: [] as FakeRoute[],
    listeners: new Map<string, Array<(...args: unknown[]) => void>>(),
    settingsStored: {} as Record<string, unknown>,
    updates: [] as Array<Record<string, unknown>>,
  }
  const scopeFor = (base: Record<string, unknown>) => ({
    get: () => ({ ...base, ...state.settingsStored }),
    update: async (patch: Record<string, unknown>) => {
      // 真实 settings 层是「先落盘再广播」，所以这里也先记下来：测试要断言的就是
      // 「非法 patch 根本不该走到这一步」。
      state.updates.push(patch)
      Object.assign(state.settingsStored, patch)
      for (const listener of state.listeners.get('settings/updated') ?? []) {
        listener('docker', { ...base, ...state.settingsStored }, undefined, 'update')
      }
    },
  })
  const makeChild = (names: string[]): Record<string, unknown> => {
    const child: Record<string, unknown> = {
      logger: { info: () => {}, warn: () => {} },
      effect: (callback: () => unknown) => {
        callback()
        return () => {}
      },
      inject: (childNames: string[], cb: (ctx: unknown) => void) => {
        cb(makeChild(childNames))
        return () => {}
      },
      events: {
        on: (name: string, listener: (...args: unknown[]) => void) => {
          const list = state.listeners.get(name) ?? []
          list.push(listener)
          state.listeners.set(name, list)
          return () => {}
        },
      },
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
        register: (_ns: string, _schema: unknown, options_: { base?: Record<string, unknown> } | undefined) => scopeFor(options_?.base ?? {}),
        // readTtyBooks 只读 tty 命名空间；用例没给就是「tty 未安装」
        get: (ns: string) => (ns === 'tty' ? options.tty : undefined),
      }
    }
    return child
  }
  const root = makeChild([])
  root.inject = (names: string[], cb: (ctx: unknown) => void) => {
    cb(makeChild(names))
    return () => {}
  }
  ;(apply as unknown as (ctx: unknown, config: unknown) => void)(root, { dockerBin: 'docker', targets: [] })
  const route = state.routes.find((item) => item.path === '/api/dsh-docker')
  if (route === undefined) throw new Error('未注册 /api/dsh-docker 路由')
  return { route, settingsStored: state.settingsStored, updates: state.updates }
}

async function postConfig(harness: Harness, body: unknown): Promise<{ status: number; json: { error?: string; config?: { dockerBin?: string } } | undefined }> {
  const res = makeRes()
  await harness.route.handler(makeReq('/api/dsh-docker/config', 'POST', body), res)
  return { status: res.status, json: res.endBody === undefined ? undefined : JSON.parse(res.endBody) }
}

/* ------------------------------------------------------------------ *
 * 1. assertBin：Windows 路径放行、shell 元字符仍拒绝
 * ------------------------------------------------------------------ */

describe('assertBin：Windows 可执行文件路径', () => {
  it('接受 Windows 绝对路径（盘符 `:` + 分隔符 `\\` + Program Files 的空格）', () => {
    for (const value of [
      'C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe',
      'C:/Program Files/Docker/Docker/resources/bin/docker.exe',
      'D:\\tools\\podman\\podman.exe',
      '\\\\server\\share\\docker.exe',
      'C:\\Users\\me\\bin\\docker.cmd',
    ]) {
      expect(assertBin(value), value).toBe(value)
    }
  })

  it('仍然接受 POSIX 路径与裸命令名', () => {
    for (const value of ['docker', 'docker.exe', 'podman', '/usr/local/bin/docker', './docker', 'nested/docker.cmd']) {
      expect(assertBin(value), value).toBe(value)
    }
  })

  it('空值回落 docker', () => {
    expect(assertBin(undefined)).toBe('docker')
    expect(assertBin('')).toBe('docker')
    expect(assertBin('   ')).toBe('docker')
  })

  it('拒绝 shell 元字符与看起来像 flag 的值', () => {
    const bad = [
      'docker; rm -rf /',
      'docker & calc',
      'docker | tee x',
      'docker `whoami`',
      'docker $(whoami)',
      'docker > out',
      'docker%PATH%',
      'docker!x',
      '"docker"',
      "'docker'",
      '-f',
      '--force',
      'C:\\bad;rm -rf\\.exe',
      'docker\nrm',
    ]
    for (const value of bad) expect(() => assertBin(value), value).toThrow(/dockerBin 含非法字符/)
  })
})

/* ------------------------------------------------------------------ *
 * 2. POST /config：先校验后落盘
 * ------------------------------------------------------------------ */

describe('POST /api/dsh-docker/config：Windows 绝对路径落盘', () => {
  it('接受 Windows 绝对路径并把原值写进 settings', async () => {
    const harness = mountPlugin()
    const bin = 'C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe'
    const { status, json } = await postConfig(harness, { dockerBin: bin })
    expect(status).toBe(200)
    expect(json?.config?.dockerBin).toBe(bin)
    expect(harness.settingsStored.dockerBin).toBe(bin)
    expect(harness.updates).toHaveLength(1)
  })
})

describe('POST /api/dsh-docker/config：非法值不落盘', () => {
  it('非法 dockerBin 回 400 且带原因，settings 一次都没被写', async () => {
    const harness = mountPlugin()
    const { status, json } = await postConfig(harness, { dockerBin: 'C:\\bad;rm -rf\\.exe' })
    expect(status).toBe(400)
    // 曾经的形态是「无正文 400」：用户拿不到任何线索
    expect(typeof json?.error).toBe('string')
    expect(json?.error).toContain('dockerBin 含非法字符')
    expect(harness.updates).toHaveLength(0)
    expect(harness.settingsStored.dockerBin).toBeUndefined()
  })

  it('非法值不会把同一 patch 里的合法项一起带进去（原实现在抛错前已写盘）', async () => {
    const harness = mountPlugin()
    const { status } = await postConfig(harness, {
      dockerBin: 'C:\\bad;rm -rf\\.exe',
      logTailDefault: 321,
      targets: [{ name: '本机', kind: 'local' }],
    })
    expect(status).toBe(400)
    expect(harness.updates).toHaveLength(0)
    expect(harness.settingsStored).toEqual({})
  })

  it('同一 patch 里的合法项在 dockerBin 合法时照常落盘', async () => {
    const harness = mountPlugin()
    const { status, json } = await postConfig(harness, {
      dockerBin: 'C:\\tools\\docker.exe',
      logTailDefault: 321,
      targets: [{ name: '本机', kind: 'local' }],
    })
    expect(status).toBe(200)
    expect(json?.config?.dockerBin).toBe('C:\\tools\\docker.exe')
    expect(harness.settingsStored.logTailDefault).toBe(321)
  })
})

/* ------------------------------------------------------------------ *
 * 3. GET /config：连接簿条目 → host:port（凭据不出宿主）
 * ------------------------------------------------------------------ */

describe('GET /api/dsh-docker/config：ttyBookHosts', () => {
  const tty = {
    sshHosts: [
      {
        name: 'lab-a',
        host: '192.0.2.10',
        port: 2222,
        username: 'root',
        auth: 'password',
        password: 'SUPER-SECRET-PASSWORD',
        keyPath: '/Users/me/.ssh/id_ed25519',
        passphrase: 'SUPER-SECRET-PASSPHRASE',
      },
      // 没填 host / username 的条目 readTtyBooks 会跳过（缺任何一项都连不上）
      { name: '半成品', host: '', username: 'root' },
    ],
  }

  it('带上 name/host/port（客户端靠它在连接失败时也能对上目标）', async () => {
    const harness = mountPlugin({ tty })
    const res = makeRes()
    await harness.route.handler(makeReq('/api/dsh-docker/config', 'GET'), res)
    const config = JSON.parse(res.endBody ?? '{}').config
    expect(config.ttyBooks).toEqual(['lab-a'])
    expect(config.ttyBookHosts).toEqual([{ name: 'lab-a', host: '192.0.2.10', port: 2222 }])
  })

  it('端口缺失按 22；任何凭据字段都不进响应', async () => {
    const harness = mountPlugin({ tty: { sshHosts: [{ name: 'lab-b', host: '192.0.2.161', username: 'root', password: 'PWD', passphrase: 'PP', keyPath: '/k' }] } })
    const res = makeRes()
    await harness.route.handler(makeReq('/api/dsh-docker/config', 'GET'), res)
    const body = res.endBody ?? ''
    expect(JSON.parse(body).config.ttyBookHosts).toEqual([{ name: 'lab-b', host: '192.0.2.161', port: 22 }])
    // 口令 / 私钥路径 / 口令短语都不能因为「顺手多回一个字段」泄漏到浏览器
    for (const secret of ['PWD', 'PP', '/k']) expect(body).not.toContain(secret)
  })

  it('tty 未安装（settings 里没有 tty 命名空间）时是空表，不是 undefined', async () => {
    const harness = mountPlugin()
    const res = makeRes()
    await harness.route.handler(makeReq('/api/dsh-docker/config', 'GET'), res)
    const config = JSON.parse(res.endBody ?? '{}').config
    expect(config.ttyBookHosts).toEqual([])
    expect(config.ttyAvailable).toBe(false)
  })
})
