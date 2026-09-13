/**
 * @hyzyn/dsh-hello — 模板自带的最小测试（create-plugin 复制后会一起带走）。
 *
 * 测试文件放在包 tsconfig include（"src"）之外的 test/ 目录，不会被 tsc 编译进
 * lib/；create-plugin 生成到 packages/<name>/ 后由仓库根 `pnpm test` 收集
 * （vitest 的 include 是 packages/*​/test/**；templates/ 本身不在收集范围内）。
 */
import type { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { apply, inject, name } from '../src/index.js'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('hello 模板', () => {
  it('announce 关闭时 apply 直接返回：不抛错、不打印', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    expect(() => apply({} as Context, { announce: false })).not.toThrow()
    expect(log).not.toHaveBeenCalled()
  })

  it('默认挂载打印一行日志，插件形状完整', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    apply({} as Context)
    expect(log).toHaveBeenCalledTimes(1)
    expect(String(log.mock.calls[0][0])).toContain('[dsh-plugin-kit/hello] mounted')
    expect(name).toBe('hello')
    expect(Array.isArray(inject)).toBe(true)
  })
})
