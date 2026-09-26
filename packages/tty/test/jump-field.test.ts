/**
 * @hyzyn/dsh-tty — 跳板机输入框的解析/回填（`client-src/jump-field.js`）。
 *
 * 为什么值得单测：这些边界全是**抄 ~/.ssh/config 时真会遇到**的形状，而写错的表现是
 * 「配置存进去了、跳板机却没用上」或「回填出来一堆歧义文本」，界面上都看不出来。
 */
import { describe, expect, it } from 'vitest'
import { formatJumpShorthand, parseJumpShorthand } from '../client-src/jump-field.js'

describe('parseJumpShorthand', () => {
  it('只有主机 → 端口默认 22', () => {
    expect(parseJumpShorthand('bastion.corp')).toEqual({ host: 'bastion.corp', port: 22 })
    expect(parseJumpShorthand('  10.0.0.5  ')).toEqual({ host: '10.0.0.5', port: 22 })
  })

  it('user@host / host:port / 两者都给', () => {
    expect(parseJumpShorthand('jump@bastion')).toEqual({ host: 'bastion', port: 22, username: 'jump' })
    expect(parseJumpShorthand('bastion:2222')).toEqual({ host: 'bastion', port: 2222 })
    expect(parseJumpShorthand('jump@bastion:2222')).toEqual({ host: 'bastion', port: 2222, username: 'jump' })
  })

  it('IPv6 用方括号（不括起来的话 `::1:22` 有歧义）', () => {
    expect(parseJumpShorthand('[::1]')).toEqual({ host: '::1', port: 22 })
    expect(parseJumpShorthand('[::1]:2223')).toEqual({ host: '::1', port: 2223 })
    expect(parseJumpShorthand('jump@[fe80::1]:22')).toEqual({ host: 'fe80::1', port: 22, username: 'jump' })
  })

  it('空 / 只有 user@ / 非法端口 → 没配或回落 22（不报错）', () => {
    expect(parseJumpShorthand('')).toBeUndefined()
    expect(parseJumpShorthand('   ')).toBeUndefined()
    expect(parseJumpShorthand(undefined)).toBeUndefined()
    expect(parseJumpShorthand(null)).toBeUndefined()
    expect(parseJumpShorthand('user@')).toBeUndefined()
    expect(parseJumpShorthand('bastion:70000')).toEqual({ host: 'bastion', port: 22 })
    expect(parseJumpShorthand('bastion:abc')).toEqual({ host: 'bastion:abc', port: 22 })
  })
})

describe('formatJumpShorthand', () => {
  it('22 端口不写出来；其余照写', () => {
    expect(formatJumpShorthand({ host: 'bastion', port: 22 })).toBe('bastion')
    expect(formatJumpShorthand({ host: 'bastion', port: 2222 })).toBe('bastion:2222')
    expect(formatJumpShorthand({ host: 'bastion', port: 2222, username: 'jump' })).toBe('jump@bastion:2222')
  })

  it('IPv6 补方括号；缺端口/非法端口当 22', () => {
    expect(formatJumpShorthand({ host: '::1', port: 22 })).toBe('[::1]')
    expect(formatJumpShorthand({ host: '::1', port: 2223 })).toBe('[::1]:2223')
    expect(formatJumpShorthand({ host: 'bastion', port: 0 })).toBe('bastion')
    expect(formatJumpShorthand({ host: 'bastion' })).toBe('bastion')
  })

  it('没配 / 畸形输入 → 空串（回填成空输入框，不是 "undefined"）', () => {
    expect(formatJumpShorthand(undefined)).toBe('')
    expect(formatJumpShorthand(null)).toBe('')
    expect(formatJumpShorthand({})).toBe('')
    expect(formatJumpShorthand({ host: '   ' })).toBe('')
    expect(formatJumpShorthand('nope')).toBe('')
  })

  it('往返一致（解析 → 回填 → 再解析 得到同一份规格）', () => {
    for (const text of ['bastion', 'jump@bastion:2222', '[::1]:2223', 'jump@10.0.0.5']) {
      expect(parseJumpShorthand(formatJumpShorthand(parseJumpShorthand(text)))).toEqual(parseJumpShorthand(text))
    }
  })
})
