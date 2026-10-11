/**
 * @hyzyn/dsh-loglens — 骨架期的挂钩用例：只钉住「插件形状完整 + 挂载不抛」。
 *
 * 真正的后端解析 / 夹取 / 截断归并的用例在 P1 起加（见 [../ROADMAP.md](../ROADMAP.md)）。
 * 测试文件放在包 tsconfig include（"src"）之外的 `test/`，不会被 tsc 编译进 lib/；
 * 由仓库根 `pnpm test` 收集（vitest 的 include 收 `packages/<pkg>/test/` 下的用例）。
 * 这里刻意不写成 glob 形态：块注释里出现「星号紧跟斜杠」会提前闭合注释（loglens D01）。
 */
import type { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { apply, inject, name } from '../src/index.js'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('loglens 骨架', () => {
  it('announce 关闭时 apply 直接返回：不抛错、不打印', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    expect(() => apply({} as Context, { announce: false })).not.toThrow()
    expect(log).not.toHaveBeenCalled()
  })

  it('默认挂载打印一行日志，插件形状完整', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    apply({} as Context)
    expect(log).toHaveBeenCalledTimes(1)
    expect(String(log.mock.calls[0][0])).toContain('[dsh-loglens] mounted')
    expect(name).toBe('loglens')
    expect(Array.isArray(inject)).toBe(true)
  })
})