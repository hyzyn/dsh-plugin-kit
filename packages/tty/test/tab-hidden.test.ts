/**
 * @hyzyn/dsh-tty — 「对 agent 不可见」标签的判据（0.30.0）。
 *
 * 反向验证（本用例的存在理由）：
 *   - 把 `withHiddenFromAgent` 改成就地改入参 → 「取消隐藏」会连带改掉共用同一份规格的
 *     别的引用，第 3 组红；
 *   - 取消隐藏时写 `hidden: false` 而不是删字段 → 规格多出一个字段，与「从没隐藏过」的
 *     规格不再等同（`specReuseKey` 按字段取值），第 3 组红；
 *   - 让 `canHideFromAgent` 对 `agentOwned` 放行 → 菜单会给 agent 自己的会话开出
 *     「对 AI 隐藏」，第 2 组红。
 *
 * 注意本模块**不是安全边界**（真正的拒绝在宿主的 `agentView` / `listForAgent`）：
 * 这里钉的是「菜单给不给、规格存成什么」，宿主那半边由 `hidden-from-agent.test.ts` 钉。
 */
import { describe, expect, it } from 'vitest'

import { canHideFromAgent, hiddenMenuKey, isHiddenFromAgentSpec, withHiddenFromAgent } from '../client-src/tab-hidden.js'

describe('isHiddenFromAgentSpec', () => {
  it('只有 hidden === true 才算隐藏', () => {
    expect(isHiddenFromAgentSpec({ hidden: true })).toBe(true)
    expect(isHiddenFromAgentSpec({ hidden: false })).toBe(false)
    expect(isHiddenFromAgentSpec({ hidden: 'true' })).toBe(false) // 字符串不算
    expect(isHiddenFromAgentSpec({ hidden: 1 })).toBe(false)
    expect(isHiddenFromAgentSpec({})).toBe(false)
    expect(isHiddenFromAgentSpec(null)).toBe(false)
    expect(isHiddenFromAgentSpec(undefined)).toBe(false)
  })
})

describe('canHideFromAgent', () => {
  const user = { sid: 's1', agentOwned: false, embedded: false }
  it('用户自己的标签可隐藏', () => {
    expect(canHideFromAgent(user)).toBe(true)
    expect(canHideFromAgent({ sid: 's2' })).toBe(true) // 缺省按用户标签
  })
  it('agent 开的、嵌入别处的都不给这一项', () => {
    expect(canHideFromAgent({ ...user, agentOwned: true })).toBe(false)
    expect(canHideFromAgent({ ...user, embedded: true })).toBe(false)
    expect(canHideFromAgent(null)).toBe(false)
  })
})

describe('withHiddenFromAgent', () => {
  it('隐藏：置 true 并保留其余字段', () => {
    const spec = { t: 'spawn', cwd: '/tmp', persist: true, persistName: 'p1' }
    const next = withHiddenFromAgent(spec, true)
    expect(next).toEqual({ t: 'spawn', cwd: '/tmp', persist: true, persistName: 'p1', hidden: true })
    expect(spec).toEqual({ t: 'spawn', cwd: '/tmp', persist: true, persistName: 'p1' }) // 入参没被改
  })

  it('取消隐藏：**删掉字段**而不是写 false（规格要与从没隐藏过的一致）', () => {
    const next = withHiddenFromAgent({ t: 'spawn', cwd: '/tmp', hidden: true }, false)
    expect(next).toEqual({ t: 'spawn', cwd: '/tmp' })
    expect('hidden' in next).toBe(false)
    // 与「从没隐藏过」的同一份规格逐字段相等（specReuseKey 按字段取值 ⇒ 复用键一致）
    expect(next).toEqual(withHiddenFromAgent({ t: 'spawn', cwd: '/tmp' }, false))
  })

  it('来回切换是幂等的，且不共享引用', () => {
    const spec = { t: 'spawn', cwd: '/tmp' }
    const hidden = withHiddenFromAgent(spec, true)
    const back = withHiddenFromAgent(hidden, false)
    expect(back).toEqual(spec)
    expect(back).not.toBe(spec)
    expect(withHiddenFromAgent(spec, false)).not.toBe(spec)
  })

  it('非法规格按空对象处理，不抛错', () => {
    expect(withHiddenFromAgent(null, true)).toEqual({ hidden: true })
    expect(withHiddenFromAgent(undefined, true)).toEqual({ hidden: true })
    expect(withHiddenFromAgent('nope', false)).toEqual({})
  })
})

describe('hiddenMenuKey', () => {
  it('已隐藏 → 「取消隐藏」，否则「隐藏」', () => {
    expect(hiddenMenuKey(true)).toBe('btn.showToAgent')
    expect(hiddenMenuKey(false)).toBe('btn.hideFromAgent')
    expect(hiddenMenuKey(undefined)).toBe('btn.hideFromAgent')
  })
})
