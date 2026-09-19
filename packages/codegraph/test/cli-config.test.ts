/**
 * @hyzyn/dsh-codegraph — CLI 旋钮与参数拼装的回归测试。
 *
 * 纯函数、不 spawn 子进程：覆盖配置规范化（默认值 / 显式值 / 非法值回落）与
 * `--force` 必须在 `--` 之前的参数顺序——这两处错了都只会在真实调用时才发现
 * （超时跑满 10 分钟、或 index 在长路径上被当成选项）。
 */
import { describe, expect, it } from 'vitest'
import { indexArgs, resolveCliConfig, syncArgs } from '../src/index.js'

describe('resolveCliConfig', () => {
  it('默认：codegraph / 60s 查询档 / 600s 索引档 / 不加 --force', () => {
    expect(resolveCliConfig(undefined)).toEqual({
      command: 'codegraph',
      cliTimeoutMs: 60_000,
      indexTimeoutMs: 600_000,
      indexForce: false,
    })
  })

  it('空配置对象与 undefined 等价', () => {
    expect(resolveCliConfig({})).toEqual(resolveCliConfig(undefined))
  })

  it('显式值原样生效', () => {
    expect(
      resolveCliConfig({ command: '/opt/codegraph/bin/codegraph', cliTimeoutMs: 5_000, indexTimeoutMs: 1_800_000, indexForce: true }),
    ).toEqual({
      command: '/opt/codegraph/bin/codegraph',
      cliTimeoutMs: 5_000,
      indexTimeoutMs: 1_800_000,
      indexForce: true,
    })
  })

  it('command 去空白；纯空白回落 codegraph', () => {
    expect(resolveCliConfig({ command: '  codegraph-cli  ' }).command).toBe('codegraph-cli')
    expect(resolveCliConfig({ command: '   ' }).command).toBe('codegraph')
  })

  it('超时只认非负有限数；0 = 不限时（CG23），负数/NaN/Infinity 回落默认值', () => {
    const fallback = { cliTimeoutMs: 60_000, indexTimeoutMs: 600_000 }
    for (const bad of [-1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(resolveCliConfig({ cliTimeoutMs: bad, indexTimeoutMs: bad })).toMatchObject(fallback)
    }
    expect(resolveCliConfig({ cliTimeoutMs: 1, indexTimeoutMs: 1 })).toMatchObject({ cliTimeoutMs: 1, indexTimeoutMs: 1 })
    // 0 曾被静默回落成默认值（用户写 0 想表达「不限」，得到 60s 且无提示）
    expect(resolveCliConfig({ cliTimeoutMs: 0, indexTimeoutMs: 0 })).toMatchObject({ cliTimeoutMs: 0, indexTimeoutMs: 0 })
  })

  it('indexForce 只认严格的 true', () => {
    for (const bad of [undefined, false, 'true', 1, 'yes']) {
      expect(resolveCliConfig({ indexForce: bad as never }).indexForce).toBe(false)
    }
    expect(resolveCliConfig({ indexForce: true }).indexForce).toBe(true)
  })
})

describe('CLI 参数拼装', () => {
  it('sync：路径走 -- 之后的位置参数', () => {
    expect(syncArgs('/tmp/proj')).toEqual(['sync', '--', '/tmp/proj'])
  })

  it('index：默认不带 --force', () => {
    expect(indexArgs('/tmp/proj', false)).toEqual(['index', '--', '/tmp/proj'])
  })

  it('index：--force 必须排在 -- 之前（否则会被当成位置参数）', () => {
    const args = indexArgs('/tmp/proj', true)
    expect(args).toEqual(['index', '--force', '--', '/tmp/proj'])
    expect(args.indexOf('--force')).toBeLessThan(args.indexOf('--'))
  })

  it('以 - 开头的路径仍然安全（-- 之后的都按路径处理）', () => {
    expect(indexArgs('-weird-dir', true)).toEqual(['index', '--force', '--', '-weird-dir'])
  })
})
