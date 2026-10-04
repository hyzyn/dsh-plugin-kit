/**
 * @hyzyn/dsh-kit — 凭据引用解析（`env:NAME`）。
 *
 * 测的不是「能不能读到环境变量」，而是几条被真实故障换来的语义：
 *   1. **provider 优先、`process.env` 兜底**——凭据存储里的值不会 materialize 进环境，只读
 *      `process.env` 等于「存进去的连接时读不到」；
 *   2. **每条失败说清是哪一种**：「引用不存在」与「引用在、值却是空串」是两件事，报成前者会把
 *      用户引去新建同名引用——那只会再失败一次；
 *   3. **provider 抛错不吞**：它与环境变量都没值时，错误里两个来源都要出现，否则「凭据服务坏了」
 *      会伪装成「你没配」；
 *   4. **按 owner 绑定**（2026-10-04 修）：一个插件卸载**不许**把别人的凭据通道一起关掉。
 *      从前那是个进程级单例槽，`tty` / `docker` 谁先卸载谁就替对方（与 `devfront`）解绑，
 *      症状是「刚才还能连，现在报凭据未设置」；
 *   5. **来源层要带得出来**（`source`）：它是标「保护强度」的唯一输入，丢了它就只能笼统地说
 *      「已配置」——而那正是 plan §3.7-1 明令不许说的话。
 */
import { afterEach, describe, expect, it } from 'vitest'

import {
  currentCredentialResolver,
  resolveCredentialVia,
  resolveSecret,
  resolveSecretVia,
  setCredentialResolver,
  type CredentialResolver,
} from '../src/index.js'

const ENV_NAME = 'DSH_KIT_CREDENTIAL_TEST'
const ENV_REF = `env:${ENV_NAME}`

afterEach(() => {
  delete process.env[ENV_NAME]
  setCredentialResolver(null, 'a')
  setCredentialResolver(null, 'b')
  setCredentialResolver(null, 'default')
})

/** 假 provider：给一张「引用名 → 值（或抛错）」的表。 */
function providerOf(table: Record<string, string | Error>): CredentialResolver {
  return {
    resolve: async (ref) => {
      const hit = table[ref]
      if (hit === undefined) return undefined
      if (hit instanceof Error) throw hit
      return { value: hit, source: 'file' }
    },
  }
}

describe('解析顺序：provider 优先，process.env 兜底', () => {
  it('provider 命中 → 用它的值，并带出来源层', async () => {
    process.env[ENV_NAME] = '从环境变量来'
    const resolved = await resolveCredentialVia(providerOf({ [ENV_NAME]: '从凭据存储来' }), ENV_REF)
    expect(resolved).toEqual({ value: '从凭据存储来', source: 'file', via: 'provider' })
  })

  it('provider 没有 → 退回 process.env，来源层标成 env', async () => {
    process.env[ENV_NAME] = '从环境变量来'
    expect(await resolveCredentialVia(providerOf({}), ENV_REF)).toEqual({ value: '从环境变量来', source: 'env', via: 'env' })
  })

  it('服务不在（老宿主）→ 只认环境变量，行为与从前一致', async () => {
    process.env[ENV_NAME] = '只有环境变量'
    expect(await resolveSecretVia(null, ENV_REF)).toBe('只有环境变量')
  })

  it('不是引用（没有 env: 前缀）→ 原样当值，并如实标成 literal', async () => {
    expect(await resolveCredentialVia(providerOf({}), '明文口令')).toEqual({ value: '明文口令', via: 'literal' })
  })

  it('undefined 进去 undefined 出来（可选凭据那条路）', async () => {
    expect(await resolveSecretVia(null, undefined)).toBeUndefined()
  })
})

describe('三种「拿不到」各说各的话', () => {
  it('引用不存在 → 「凭据未设置」，并带上「服务不可用」这个前提', async () => {
    await expect(resolveSecretVia(null, ENV_REF)).rejects.toThrow('凭据未设置')
    await expect(resolveSecretVia(null, ENV_REF)).rejects.toThrow('凭据服务不可用')
  })

  it('引用在、值是空串 → 「值是空串」（不是「未设置」：新建同名引用解决不了）', async () => {
    await expect(resolveSecretVia(providerOf({ [ENV_NAME]: '' }), ENV_REF)).rejects.toThrow('值是空串')
  })

  it('provider 抛错 + 环境变量也没有 → 两个来源都出现在错误里', async () => {
    await expect(resolveSecretVia(providerOf({ [ENV_NAME]: new Error('存储读不了') }), ENV_REF)).rejects.toThrow(
      /凭据服务报错：存储读不了/,
    )
  })

  it('provider 抛错但环境变量有值 → 照常放行（服务坏了不该让整个连接不可用）', async () => {
    process.env[ENV_NAME] = '兜底值'
    expect(await resolveSecretVia(providerOf({ [ENV_NAME]: new Error('存储读不了') }), ENV_REF)).toBe('兜底值')
  })
})

describe('绑定按 owner：谁卸载都不许关掉别人的通道', () => {
  it('`resolveSecret` 用最近绑定的那一个', async () => {
    setCredentialResolver(providerOf({ [ENV_NAME]: '来自 a' }), 'a')
    setCredentialResolver(providerOf({ [ENV_NAME]: '来自 b' }), 'b')
    expect(await resolveSecret(ENV_REF)).toBe('来自 b')
  })

  it('b 解绑 → 自动回到 a（不是「谁都没绑」）', async () => {
    setCredentialResolver(providerOf({ [ENV_NAME]: '来自 a' }), 'a')
    setCredentialResolver(providerOf({ [ENV_NAME]: '来自 b' }), 'b')
    setCredentialResolver(null, 'b')
    expect(await resolveSecret(ENV_REF)).toBe('来自 a')
  })

  it('★ 这一条就是那个 bug：b 卸载之后 a 仍然解析得动', async () => {
    setCredentialResolver(providerOf({ [ENV_NAME]: '来自 a' }), 'a')
    setCredentialResolver(providerOf({ [ENV_NAME]: '来自 b' }), 'b')
    // 环境变量里刻意没有：这样「退回 process.env」不会掩盖问题。
    delete process.env[ENV_NAME]
    // 单例槽时代：这一行把 a 也一起关掉，于是下面这一句抛「凭据未设置」——
    // 症状是「刚才还能连，现在报凭据未设置」，而用户根本没动过这个插件的配置。
    setCredentialResolver(null, 'b')
    expect(await resolveSecret(ENV_REF)).toBe('来自 a')
  })

  it('全解绑之后是 null（退回 process.env 那条路，不是留着脏值）', () => {
    setCredentialResolver(providerOf({}), 'a')
    setCredentialResolver(null, 'a')
    expect(currentCredentialResolver()).toBeNull()
  })
})
