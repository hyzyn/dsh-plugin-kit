/**
 * @hyzyn/dsh-kit — 能力开关的宿主侧授权（capability）。
 *
 * 这一层是**安全约定**，所以测的不是「函数能不能读环境变量」（那太显然），而是三条容易被
 * 后来人改坏的语义：
 *   1. **只有白名单值算授权**（`1/true/yes/on`）——`0` / `false` / 空 / 任意字符串都不算，
 *      否则「设了个变量」就会变成提权；
 *   2. **进程内只采样一次**——运行期改写 `process.env` 不生效。这条是整层的支点：环境变量
 *      卡片（有 HTTP 写入路径）会在运行期改 `process.env`，现读就等于把提权路径搬到那张卡片上；
 *   3. 未授权时的**文案必须两步都说清**（设哪个变量 + 要重启），不然用户会在卡片上点一个
 *      永远点不动的开关。
 */
import { afterEach, describe, expect, it } from 'vitest'
import { __resetCapabilityGrantsForTest, capabilityDeniedMessage, capabilityGranted, capabilityHowTo } from '../src/capability.js'

const SPEC = { env: 'DSH_TEST_ALLOW_THING', label: '测试能力' }

afterEach(() => {
  delete process.env[SPEC.env]
  __resetCapabilityGrantsForTest()
})

describe('capabilityGranted：只有白名单值算授权', () => {
  it('1 / true / yes / on（大小写与空白不敏感）算授权', () => {
    for (const value of ['1', 'true', 'TRUE', ' yes ', 'On']) {
      process.env[SPEC.env] = value
      __resetCapabilityGrantsForTest()
      expect(capabilityGranted(SPEC), value).toBe(true)
    }
  })

  it('0 / false / 空串 / 任意其它字符串 / 未设置 都算**没授权**', () => {
    for (const value of ['0', 'false', '', '  ', 'no', 'off', 'enabled', '2']) {
      process.env[SPEC.env] = value
      __resetCapabilityGrantsForTest()
      expect(capabilityGranted(SPEC), value).toBe(false)
    }
    delete process.env[SPEC.env]
    __resetCapabilityGrantsForTest()
    expect(capabilityGranted(SPEC)).toBe(false)
  })

  it('接受裸环境变量名（与 CapabilitySpec 等价）', () => {
    process.env[SPEC.env] = '1'
    __resetCapabilityGrantsForTest()
    expect(capabilityGranted(SPEC.env)).toBe(true)
  })
})

describe('capabilityGranted：进程内只采样一次（这条是整层的支点）', () => {
  it('先查过之后，运行期再设环境变量**不生效**（防「先跑一次没授权、随后被别的插件写进 env」）', () => {
    __resetCapabilityGrantsForTest()
    expect(capabilityGranted(SPEC)).toBe(false)
    process.env[SPEC.env] = '1' // 相当于环境变量卡片在运行期改了 process.env
    expect(capabilityGranted(SPEC)).toBe(false)
  })

  it('先查过「已授权」之后，运行期删掉环境变量**仍然算授权**（快照语义，不是现读）', () => {
    process.env[SPEC.env] = '1'
    __resetCapabilityGrantsForTest()
    expect(capabilityGranted(SPEC)).toBe(true)
    delete process.env[SPEC.env]
    expect(capabilityGranted(SPEC)).toBe(true)
  })

  it('多个能力各自独立采样', () => {
    process.env[SPEC.env] = '1'
    __resetCapabilityGrantsForTest()
    expect(capabilityGranted(SPEC)).toBe(true)
    expect(capabilityGranted('DSH_TEST_ALLOW_OTHER')).toBe(false)
  })
})

describe('文案：两步都要说清', () => {
  it('capabilityHowTo 同时给出变量名与「重启宿主」', () => {
    const text = capabilityHowTo(SPEC)
    expect(text).toContain(SPEC.env)
    expect(text).toContain('重启宿主')
  })

  it('capabilityDeniedMessage 说明为什么 HTTP 不能提权，并带上怎么做', () => {
    const text = capabilityDeniedMessage(SPEC)
    expect(text).toContain('测试能力')
    expect(text).toContain(SPEC.env)
    expect(text).toContain('重启宿主')
    expect(text).toContain('HTTP')
  })
})
