/**
 * @hyzyn/dsh-tty — 连接簿条目「没配跳板机」这条路的回归（0.33.0 每一条连接簿都连不上）。
 *
 * **事故形状**：settings schema 里 `jump` 是**嵌套 object**，而 schemastery 给 object
 * schema 的 `meta.default` 恒为 `{}`。于是「没配跳板机」的条目在宿主解析配置后长出
 *
 *   jump: { port: 22, username: '', keyPath: '', passphrase: '', password: '' }   // 没有 host
 *
 * 这份「半个对象」被 `mergeSshSpec` 原样当成「配了跳板机」放进 SshSpec，`jumpTargetLabel`
 * 第一句 `jump.host.trim()` 就抛 `Cannot read properties of undefined (reading 'trim')` ——
 * 用户看到的是「连接出错 + 一句与跳板机毫无关系的 TypeError」，而**所有**连接簿条目都连不上。
 *
 * **判据按出口铺格子**（不是只验「原来那个症状没了」，见
 * `references/fix-verification.md`）：这条修法在四个出口各加了一道，本文件逐条钉住：
 *   1. **配置解析**：没配 → 真的没有 `jump` 字段；配了 → 一字不差（物化那一格是根因）；
 *   2. **数据边界**：连接簿里残留的半个对象 → `mergeSshSpec` 当「没配」；有效 jump 仍保留；
 *   3. **展示 / 拨号**：`usableJump` / `jumpTargetLabel` 给「没配」，`dialJump` 给点名的错——
 *      三条都不再抛 TypeError；
 *   4. **端到端**：`spawnSsh` 拿到半个对象时**直连目标**并 warn，而不是崩在拼展示串上。
 */
// DSH_HOME 隔离（D69）：读不到开发机上的真实授权文件
import './isolated-home.js'
import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { plainConfig } from '@hyzyn/dsh-kit'
import { Config, mergeSshSpec } from '../src/index.js'
import { dialJump, jumpTargetLabel, spawnSsh, usableJump } from '../src/ssh.js'
import type { SshHostEntry, SshJumpSpec, SshSpec } from '../src/ssh.js'

/** 测试注入点：被 mock 的 ssh2.Client 构造时回调这里产出假连接。 */
const h = vi.hoisted(() => ({ factory: null as null | (() => unknown), built: 0 }))
vi.mock('ssh2', () => ({
  Client: class {
    constructor() {
      h.built += 1
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      return h.factory!()
    }
  },
}))

/** 假 channel：spawnSsh 只用到 on / stderr / pause / resume / end / close。 */
function makeChannel(): EventEmitter & { stderr: EventEmitter } {
  const ch = new EventEmitter() as EventEmitter & { stderr: EventEmitter }
  ch.stderr = new EventEmitter()
  Object.assign(ch, { pause: () => {}, resume: () => {}, end: () => {}, close: () => {}, write: () => {}, setWindow: () => {} })
  return ch
}

class FakeClient extends EventEmitter {
  connectConfig: unknown = null
  ended = false
  connect(config: unknown): void {
    this.connectConfig = config
  }
  end(): void {
    this.ended = true
  }
  shell(_options: unknown, cb: (error: Error | null, channel?: unknown) => void): void {
    cb(null, makeChannel())
  }
  trigger(event: string, ...args: unknown[]): void {
    this.emit(event, ...args)
  }
}

/** 一条**过得了 settings schema** 的连接簿条目；`jump` 缺省 = 直连（事故现场）。 */
const ENTRY = {
  name: 'cdc-test-kb',
  host: 'example.internal',
  port: 22,
  username: 'root',
  auth: 'password' as const,
  keyPath: '',
  passphrase: '',
  password: 'env:DSH_TEST_PASSWORD',
  agentForward: false,
  hostKeyAlias: '',
  persist: true,
}

/**
 * 事故里真正流进连接路径的「半个对象」——逐字取自 0.33.0 的配置解析结果
 * （`plainConfig(Config({...}))` 的实测输出，见下面第一条用例）。
 */
const HALF_JUMP = { port: 22, username: '', keyPath: '', passphrase: '', password: '' } as unknown as SshJumpSpec

const SPEC: SshSpec = { host: ENTRY.host, port: 22, username: 'root', auth: 'password', password: 'pw' }

let client: FakeClient

beforeEach(() => {
  client = new FakeClient()
  h.factory = () => client
  h.built = 0
})

/* ------------------------------------------------------------------ *
 * 出口 1：配置解析（根因格）
 * ------------------------------------------------------------------ */

describe('settings schema：jump 缺省时**不许**被物化成「半个对象」', () => {
  it('没配跳板机的条目解析后真的没有 jump 字段（物化 = 每一条连接簿都连不上）', () => {
    const parsed = plainConfig(Config({ sshHosts: [ENTRY] }))
    const entry = (parsed.sshHosts as Array<Record<string, unknown>>)[0] ?? {}
    expect(Object.prototype.hasOwnProperty.call(entry, 'jump')).toBe(false)
    // 事故现场的等价断言：半个对象一旦出现，就是 `jump.host === undefined`
    expect(entry.jump).toBeUndefined()
  })

  it('配了跳板机的条目：jump 原样带回（收紧默认值不能把校验一起丢了）', () => {
    const withJump = { ...ENTRY, jump: { host: 'bastion.internal', port: 2222, username: 'jumper' } }
    const parsed = plainConfig(Config({ sshHosts: [withJump] }))
    // 只断言用户填的那三项：其余字段由 schema 的默认值补齐（auth 刻意没有默认值 = 继承目标）
    expect((parsed.sshHosts as Array<Record<string, unknown>>)[0]?.jump)
      .toMatchObject({ host: 'bastion.internal', port: 2222, username: 'jumper' })
  })

  it('jump 的校验仍在（非法端口不许借 union 外壳溜过去）', () => {
    expect(() => Config({ sshHosts: [{ ...ENTRY, jump: { host: 'b', port: 70000 } }] })).toThrow()
  })
})

/* ------------------------------------------------------------------ *
 * 出口 2：数据边界（mergeSshSpec）
 * ------------------------------------------------------------------ */

describe('mergeSshSpec：连接簿里残留的半个 jump 当「没配」', () => {
  const profile = { ...ENTRY, jump: HALF_JUMP } as unknown as SshHostEntry

  it('半个对象 → spec 里没有 jump（旧实现会原样传下去）', () => {
    const merged = mergeSshSpec(() => profile, ENTRY.name, {})
    expect(merged.error).toBeUndefined()
    expect(merged.spec?.jump).toBeUndefined()
    expect(merged.spec?.host).toBe(ENTRY.host)
  })

  it('有效 jump 仍然一路带下去（清洗不能顺手把功能洗掉）', () => {
    const valid = { ...ENTRY, jump: { host: 'bastion.internal', port: 2222 } } as unknown as SshHostEntry
    expect(mergeSshSpec(() => valid, ENTRY.name, {}).spec?.jump).toEqual({ host: 'bastion.internal', port: 2222 })
  })

  it('内联 jump 优先于连接簿；内联给了但主机为空 → 清洗成没配', () => {
    const valid = { ...ENTRY, jump: { host: 'bastion.internal', port: 2222 } } as unknown as SshHostEntry
    expect(mergeSshSpec(() => valid, ENTRY.name, { jump: { host: 'inline.bastion' } }).spec?.jump)
      .toEqual({ host: 'inline.bastion', port: 22 })
    expect(mergeSshSpec(() => profile, ENTRY.name, { jump: { host: '   ' } }).spec?.jump).toBeUndefined()
  })
})

/* ------------------------------------------------------------------ *
 * 出口 3：展示串 / 拨号（原先抛 TypeError 的那两句）
 * ------------------------------------------------------------------ */

describe('usableJump / jumpTargetLabel / dialJump：半个对象不再打成 TypeError', () => {
  it('usableJump：没有 host 的对象 = 没配（null 也当没配）', () => {
    expect(usableJump({ jump: undefined })).toBeUndefined()
    expect(usableJump({ jump: HALF_JUMP })).toBeUndefined()
    expect(usableJump({ jump: { host: '  ' } as unknown as SshJumpSpec })).toBeUndefined()
    expect(usableJump({ jump: null as unknown as SshJumpSpec })).toBeUndefined()
    expect(usableJump({ jump: { host: 'bastion', port: 2222 } })).toEqual({ host: 'bastion', port: 2222 })
  })

  it('jumpTargetLabel：半个对象 → 空串（旧实现第一句就抛）', () => {
    expect(jumpTargetLabel({ ...SPEC, jump: HALF_JUMP })).toBe('')
    expect(jumpTargetLabel({ ...SPEC, jump: { host: 'bastion', port: 2222 } })).toBe('root@bastion:2222')
  })

  it('dialJump：半个对象报「跳板机配置缺少 host」这一句，且不建连接', async () => {
    await expect(dialJump({ spec: { ...SPEC, jump: HALF_JUMP } })).rejects.toThrow('跳板机配置缺少 host')
    expect(h.built).toBe(0)
  })
})

/* ------------------------------------------------------------------ *
 * 出口 4：端到端（spawnSsh —— 用户看到的那条路径）
 * ------------------------------------------------------------------ */

describe('spawnSsh：连接簿残留半个 jump → 直连目标 + warn', () => {
  it('不再崩在拼接展示串上；日志点名「跳板机配置缺少 host」', async () => {
    const warnings: string[] = []
    const pending = spawnSsh({ ...SPEC, jump: HALF_JUMP }, {
      term: 'xterm-256color',
      cols: 80,
      rows: 24,
      logger: { info: () => {}, warn: (m) => warnings.push(m) },
    })
    // connect 是同步调用：等一个微任务让执行器跑到 conn.connect()
    await new Promise((r) => setTimeout(r, 0))
    client.trigger('ready')
    await pending
    expect(client.connectConfig).toMatchObject({ host: ENTRY.host, username: 'root' })
    expect(warnings.join('\n')).toContain('跳板机配置缺少 host')
  })
})
