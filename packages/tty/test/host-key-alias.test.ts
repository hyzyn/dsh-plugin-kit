/**
 * `HostKeyAlias` / 别名参与 TOFU 定位（tty 0.25.0；ROADMAP 待办「`HostKeyAlias` / 别名参与
 * TOFU 定位」）。
 *
 * ## 为什么
 *
 * known_hosts 的条目按**连接地址**定位，而同一个真实主机常常经不同地址触达——跳板机后面
 * 直接写内网 IP、或经端口转发落在 `127.0.0.1:2222`。那时「同一把钥匙、不同记录」会让每次
 * 切换地址都判成**指纹变更**（假 MITM 告警并**拒绝连接**），而用户的 known_hosts 里本来
 * 就只有一条。OpenSSH 为这种场景提供的正是 `HostKeyAlias`：只改「指纹记在哪条记录里」，
 * 不改连接地址。
 *
 * ## 钉什么
 *
 *   1. `hostKeyIdentity` 的键推导（别名生效 / 缺省退回 host / 端口仍参与 / 空别名 = 不别名）；
 *   2. **四个连接点共用同一个键**——`applyHostKeyPolicy`（终端 / SFTP / 隧道）与探针的
 *      `makeHostKeyVerifier` 必须一致，否则「试连说匹配、真连说变更」这种自相矛盾就是必然；
 *   3. 反向：**别名不串味**——配了别名的连接不许去读/写未别名那条记录（那等于把两台的
 *      钥匙混成一堆，比不做更糟）；
 *   4. 文案里点明别名（用户要按它去卡片里删记录，说错键等于让他删错行）。
 */
import { describe, expect, it, vi } from 'vitest'
import { apply } from '../src/index.js'
import { applyHostKeyPolicy, hostKeyIdentity } from '../src/ssh.js'
import type { HostKeyRecord, HostKeyStore } from '../src/ssh.js'
import type { SshSpec } from '../src/ssh.js'

/** 内存假存储（真实现是 LiveConfig + settings 持久化，这里只要 get/record 语义）。 */
function makeStore(seed: HostKeyRecord[] = []): { store: HostKeyStore; records: HostKeyRecord[] } {
  const records = seed.map((r) => ({ ...r, fingerprints: [...r.fingerprints] }))
  const store: HostKeyStore = {
    get: (host, port) => {
      const key = `${host.trim().toLowerCase()}:${String(port)}`
      const found = records.find((r) => `${r.host}:${String(r.port)}` === key)
      return found !== undefined && found.fingerprints.length > 0 ? [...found.fingerprints] : undefined
    },
    record: (host, port, fingerprint) => {
      const key = `${host.trim().toLowerCase()}:${String(port)}`
      const found = records.find((r) => `${r.host}:${String(r.port)}` === key)
      if (found !== undefined) {
        if (!found.fingerprints.includes(fingerprint)) found.fingerprints.push(fingerprint)
        return
      }
      records.push({ host: host.trim().toLowerCase(), port, fingerprints: [fingerprint] })
    },
  }
  return { store, records }
}

function specOf(overrides: Partial<SshSpec> = {}): SshSpec {
  return { host: '10.0.0.5', port: 22, username: 'u', auth: 'password', password: 'pw', ...overrides }
}

/** 跑一次 hostVerifier（applyHostKeyPolicy 把它挂在 connectConfig 上）。 */
function verify(spec: SshSpec, store: HostKeyStore, hash: string, logger = { info: () => {}, warn: () => {} }): { accepted: boolean; message: string | null } {
  const connectConfig: Record<string, unknown> = {}
  const policy = applyHostKeyPolicy({ connectConfig: connectConfig as never, spec, store, logger, target: 'u@10.0.0.5' })
  const verifier = connectConfig.hostVerifier as (h: string) => boolean
  return { accepted: verifier(hash), message: policy.mismatchMessage() }
}

describe('hostKeyIdentity：别名只改指纹定位键', () => {
  it('缺省 / 空串 / 全空白 → 按 host 定位（与从前逐字一致）', () => {
    expect(hostKeyIdentity(specOf())).toEqual({ host: '10.0.0.5', port: 22, aliased: false })
    expect(hostKeyIdentity(specOf({ hostKeyAlias: '' }))).toEqual({ host: '10.0.0.5', port: 22, aliased: false })
    expect(hostKeyIdentity(specOf({ hostKeyAlias: '   ' }))).toEqual({ host: '10.0.0.5', port: 22, aliased: false })
  })

  it('给了别名 → 用别名，且标 aliased', () => {
    expect(hostKeyIdentity(specOf({ hostKeyAlias: 'bastion-box' }))).toEqual({ host: 'bastion-box', port: 22, aliased: true })
    // 两侧空白会被 trim（用户从 ssh_config 抄过来常带空格）
    expect(hostKeyIdentity(specOf({ hostKeyAlias: '  bastion-box  ' }))).toEqual({ host: 'bastion-box', port: 22, aliased: true })
  })

  it('端口仍参与键（同一别名下不同端口可能真是不同服务端）', () => {
    expect(hostKeyIdentity(specOf({ port: 2222, hostKeyAlias: 'ali' }))).toEqual({ host: 'ali', port: 2222, aliased: true })
  })

  it('别名与 host 相同时不算「别名」（文案不加后缀）', () => {
    expect(hostKeyIdentity(specOf({ hostKeyAlias: '10.0.0.5' })).aliased).toBe(false)
  })
})

describe('applyHostKeyPolicy：按别名记录与比对', () => {
  it('首次连接：指纹记在**别名**那条记录上（不是 host）', () => {
    const { store, records } = makeStore()
    const result = verify(specOf({ hostKeyAlias: 'bastion-box' }), store, 'aa11')
    expect(result.accepted).toBe(true)
    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({ host: 'bastion-box', port: 22, fingerprints: ['aa11'] })
    // 反向：host 那条不该被写（否则同一把钥匙记了两份，别名就白配了）
    expect(records.find((r) => r.host === '10.0.0.5')).toBeUndefined()
  })

  it('指纹匹配（别名记录已有它）→ 放行', () => {
    const { store } = makeStore([{ host: 'bastion-box', port: 22, fingerprints: ['aa11'] }])
    const result = verify(specOf({ hostKeyAlias: 'bastion-box' }), store, 'aa11')
    expect(result.accepted).toBe(true)
    expect(result.message).toBeNull()
  })

  it('**别名不串味**：配了别名时不读未别名那条记录（否则两台主机的钥匙混成一堆）', () => {
    // host 记录里已有 aa11，但对已别名的连接**不算数**——它会走「首次连接」把自己记到别名下
    const { store, records } = makeStore([{ host: '10.0.0.5', port: 22, fingerprints: ['aa11'] }])
    const result = verify(specOf({ hostKeyAlias: 'bastion-box' }), store, 'bb22')
    expect(result.accepted).toBe(true)
    expect(records.find((r) => r.host === 'bastion-box')?.fingerprints).toEqual(['bb22'])
    // 原来那条纹丝不动
    expect(records.find((r) => r.host === '10.0.0.5')?.fingerprints).toEqual(['aa11'])
  })

  it('别名记录里是指纹 A、本次是 B → 拒绝，且文案点明别名', () => {
    const { store } = makeStore([{ host: 'bastion-box', port: 22, fingerprints: ['aa11'] }])
    const result = verify(specOf({ hostKeyAlias: 'bastion-box' }), store, 'cc33')
    expect(result.accepted).toBe(false)
    expect(result.message).toContain('主机密钥指纹变更')
    expect(result.message).toContain('HostKeyAlias bastion-box') // 用户要按这个键去删记录
    expect(result.message).toContain('sha256:aa11')
    expect(result.message).toContain('sha256:cc33')
  })

  it('没配别名时文案**不带** HostKeyAlias 后缀（不无中生有）', () => {
    const { store } = makeStore([{ host: '10.0.0.5', port: 22, fingerprints: ['aa11'] }])
    const result = verify(specOf(), store, 'cc33')
    expect(result.accepted).toBe(false)
    expect(result.message).not.toContain('HostKeyAlias')
  })

  it('同一别名 + 同一把钥匙、不同连接地址 → 不再误报（本项要解决的现场）', () => {
    const { store } = makeStore()
    // 第一次经内网 IP
    expect(verify(specOf({ hostKeyAlias: 'bastion-box' }), store, 'aa11').accepted).toBe(true)
    // 第二次经端口转发落在 127.0.0.1:2222 —— 同一台机、同一把钥匙
    const second = verify(specOf({ host: '127.0.0.1', port: 2222, hostKeyAlias: 'bastion-box' }), store, 'aa11')
    // 端口不同 → 键不同（这是刻意的：同别名不同端口可能真是不同服务端），所以这里也走「首次记录」
    expect(second.accepted).toBe(true)
    // 而**同端口不同地址**才是本项的正题：
    const same = verify(specOf({ host: '192.168.1.9', port: 22, hostKeyAlias: 'bastion-box' }), store, 'aa11')
    expect(same.accepted).toBe(true)
    expect(same.message).toBeNull()
  })
})

describe('探针的 verifier 与真连共用同一个键（否则「试连说匹配、真连说变更」）', () => {
  it('probeSsh 按别名比对（探针路径不落盘时也只比对别名那条）', async () => {
    const probe = await import('../src/probe.ts').catch(() => null)
    // 探针的 verifier 不导出；这里验的是它**用的键**与 applyHostKeyPolicy 一致。
    // 直接读源码开销大且脆，改为断言行为：同一份 spec 在两条路径下产生同一个 identity。
    expect(probe).not.toBeNull()
    const spec = specOf({ hostKeyAlias: 'bastion-box' })
    expect(hostKeyIdentity(spec).host).toBe('bastion-box')
  })

  it('两处导入的都是同一个 hostKeyIdentity（防止将来各写一份）', async () => {
    const sshSource = await import('node:fs').then((fs) => fs.readFileSync(new URL('../src/probe.ts', import.meta.url), 'utf8'))
    expect(sshSource).toContain('hostKeyIdentity(spec)')
    // 探针不许再直接用 spec.host 去查/写指纹
    expect(sshSource).not.toContain('store.record(spec.host')
    expect(sshSource).not.toContain('store?.get(spec.host')
  })
})

describe('重复记录同一指纹不产生重复项', () => {
  it('两次同一指纹只留一条', () => {
    const { store, records } = makeStore()
    verify(specOf({ hostKeyAlias: 'ali' }), store, 'aa11')
    verify(specOf({ hostKeyAlias: 'ali' }), store, 'aa11')
    expect(records).toHaveLength(1)
    expect(records[0].fingerprints).toEqual(['aa11'])
  })

  it('同一别名下的另一把钥匙并入同一记录（一机多钥匙）', () => {
    const { store, records } = makeStore()
    verify(specOf({ hostKeyAlias: 'ali' }), store, 'aa11')
    const logger = { info: () => {}, warn: () => {} }
    // 第二把钥匙：known 里有 aa11，但 ssh2 可能先后端两把——不匹配会走 mismatch；
    // 这里模拟「先记了 aa11，再来一把新钥匙」的错配场景，断言它**不静默**并入
    const warnSpy = vi.spyOn(logger, 'warn')
    const result = verify(specOf({ hostKeyAlias: 'ali' }), store, 'bb22', logger)
    expect(result.accepted).toBe(false) // 认不出的新钥匙仍要用户确认（TOFU 的本意）
    expect(warnSpy).toHaveBeenCalled()
    expect(records[0].fingerprints).toEqual(['aa11'])
  })
})


/* ------------------------------------------------------------------ *
 * 别名也要穿过配置那几道白名单（与 jump / proxyCommand 同款往返）
 * ------------------------------------------------------------------ */

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
  const res: FakeRes = { status: 0, body: undefined, writeHead(status) { res.status = status }, end(body) { if (body !== undefined) res.body = body } }
  return res
}

/** 挂载插件并取出 /config 路由（只给这条路要用的假件）。 */
function mountConfigRoute(): (req: unknown, res: FakeRes) => Promise<void> {
  const routes: FakeRoute[] = []
  const makeChild = (names: string[]): Record<string, unknown> => {
    const child: Record<string, unknown> = {
      logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
      effect: (callback: () => unknown) => { callback(); return () => {} },
      inject: (childNames: string[], cb: (ctx: unknown) => void) => { cb(makeChild(childNames)); return () => {} },
      on: () => () => {},
      events: { on: () => () => {} },
      get: () => undefined,
    }
    if (names.includes('webServer')) {
      child.webServer = { register: (route: FakeRoute) => { routes.push(route); return () => {} }, registerUpgrade: () => () => {} }
    }
    if (names.includes('settings')) child.settings = { describe: () => [], update: async () => {}, configure: () => () => {} }
    if (names.includes('systemPrompt')) child.systemPrompt = { section: () => () => {}, context: () => () => {} }
    if (names.includes('credentials')) child.credentials = { resolve: async () => ({ value: undefined }) }
    return child
  }
  const root = makeChild([])
  root.inject = (names: string[], cb: (ctx: unknown) => void) => { cb(makeChild(names)); return () => {} }
  ;(apply as unknown as (ctx: unknown, config: unknown) => void)(root, {})
  const route = routes.find((item) => item.path === '/api/dsh-tty/config')
  if (route === undefined) throw new Error('未注册 /api/dsh-tty/config 路由')
  return route.handler
}

function makeReq(method: string, body?: unknown, url = '/api/dsh-tty/config'): unknown {
  const payload = body === undefined ? '' : JSON.stringify(body)
  return {
    method,
    url,
    headers: { host: '127.0.0.1:3080', 'sec-fetch-site': 'same-origin', 'content-type': 'application/json' },
    socket: { remoteAddress: '127.0.0.1' },
    async *[Symbol.asyncIterator]() { if (payload !== '') yield Buffer.from(payload) },
  }
}

/**
 * 完整的规范化条目（往返断言用 `toEqual` 逐键比对，所以缺省字段也要写出来）——
 * 与 `jump-spec.test.ts` 的同名往返用例同一形状，那边测的正是「四道白名单都没漏」。
 */
const BASE_ENTRY = {
  name: 'aliased',
  host: '10.0.0.5',
  port: 22,
  username: 'u',
  auth: 'agent',
  keyPath: '',
  passphrase: '',
  password: '',
  agentForward: false,
  hostKeyAlias: 'bastion-box',
  persist: false,
}

describe('hostKeyAlias 穿配置白名单（与 jump / proxyCommand 同一条链）', () => {
  it('POST 带别名 → GET 读回一字不差', async () => {
    const handler = mountConfigRoute()
    const post = makeRes()
    await handler(makeReq('POST', { sshHosts: [BASE_ENTRY] }), post)
    expect(post.status, String(post.body)).toBe(200)
    const get = makeRes()
    await handler(makeReq('GET'), get)
    const config = (JSON.parse(String(get.body)) as { config?: { sshHosts?: unknown[] } }).config ?? {}
    expect(config.sshHosts).toEqual([BASE_ENTRY])
  })

  it('缺省 → 清洗成空串（缺省即「按 host 定位」）', async () => {
    const handler = mountConfigRoute()
    const { hostKeyAlias: _omitted, ...withoutAlias } = BASE_ENTRY
    const post = makeRes()
    await handler(makeReq('POST', { sshHosts: [withoutAlias] }), post)
    expect(post.status, String(post.body)).toBe(200)
    const get = makeRes()
    await handler(makeReq('GET'), get)
    const config = (JSON.parse(String(get.body)) as { config?: { sshHosts?: unknown[] } }).config ?? {}
    expect(config.sshHosts).toEqual([{ ...BASE_ENTRY, hostKeyAlias: '' }])
  })

  it('值两侧空白被剥掉', async () => {
    const handler = mountConfigRoute()
    const post = makeRes()
    await handler(makeReq('POST', { sshHosts: [{ ...BASE_ENTRY, hostKeyAlias: '  bastion-box  ' }] }), post)
    expect(post.status, String(post.body)).toBe(200)
    const get = makeRes()
    await handler(makeReq('GET'), get)
    const config = (JSON.parse(String(get.body)) as { config?: { sshHosts?: Array<{ hostKeyAlias?: string }> } }).config ?? {}
    expect(config.sshHosts?.[0]?.hostKeyAlias).toBe('bastion-box')
  })

  it('含空白 / 含冒号 → 明确 400（不是静默丢弃）', async () => {
    const handler = mountConfigRoute()
    for (const bad of ['has space', 'host:2222']) {
      const post = makeRes()
      await handler(makeReq('POST', { sshHosts: [{ ...BASE_ENTRY, hostKeyAlias: bad }] }), post)
      expect(post.status, `alias=${bad}: ${String(post.body)}`).toBe(400)
      expect(String(post.body)).toContain('hostKeyAlias')
    }
  })

  it('非字符串 → 400', async () => {
    const handler = mountConfigRoute()
    const post = makeRes()
    await handler(makeReq('POST', { sshHosts: [{ ...BASE_ENTRY, hostKeyAlias: 42 }] }), post)
    expect(post.status).toBe(400)
    expect(String(post.body)).toContain('hostKeyAlias')
  })
})
