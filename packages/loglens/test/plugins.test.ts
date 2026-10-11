/**
 * @hyzyn/dsh-loglens — 「某个插件装没装」判据的用例。
 *
 * 判据是 cordis 的 plugin registry（先例：search 的 getLoadedRegistryNames），**不是** tools 服务
 * ——后者没有列举 API（实测 dsh-tools 0.1.2-rc.1 的 ctx.tools 只有 register/restrict/guard）。
 * 枚举失败一律当「没装」：宁可少给一个入口，也不能给一个按下去 404 的按钮。
 */
import { describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { dockerPluginLoaded, loadedPluginNames } from '../src/plugins.js'

function fakeCtx(registry: unknown): Context {
  return { registry } as unknown as Context
}

describe('loadedPluginNames / dockerPluginLoaded', () => {
  it('按 runtime.name 收集已加载的插件', () => {
    const ctx = fakeCtx({ values: () => [{ name: 'docker' }, { name: 'tty' }, { name: '' }, {}] })
    expect([...loadedPluginNames(ctx)].sort()).toEqual(['docker', 'tty'])
    expect(dockerPluginLoaded(ctx)).toBe(true)
  })

  it('没有 registry / 枚举抛错都当「没装」（不把插件带下去）', () => {
    expect(loadedPluginNames(fakeCtx(undefined)).size).toBe(0)
    expect(loadedPluginNames(fakeCtx({})).size).toBe(0)
    expect(loadedPluginNames(fakeCtx({ values: () => { throw new Error('boom') } })).size).toBe(0)
    expect(dockerPluginLoaded(fakeCtx({ values: () => { throw new Error('boom') } }))).toBe(false)
  })

  it('名字不对就是没装（宁缺勿假）', () => {
    expect(dockerPluginLoaded(fakeCtx({ values: () => [{ name: 'tty' }] }))).toBe(false)
  })
})
