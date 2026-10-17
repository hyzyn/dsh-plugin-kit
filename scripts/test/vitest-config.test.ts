/**
 * `vitest.config.ts` 里「CI 的 Windows 腿降并发」那条判据（`workerCap`）的用例。
 *
 * **为什么单独有用例**：那一支在**非 Windows** 上永远不生效——本机（macOS）与 ubuntu 腿都只能验到
 * 「不生效」那一半。不把它抽成纯函数、喂平台与 CI 两个参数，这条规则就等于没人验（本仓的规矩：
 * 没有守卫的规矩会在下一次改动里漂掉）。背景见 `packages/codegraph/ROADMAP.md`
 * §「cli-route.test.ts 在 Windows 上的负载敏感」。
 */
import { describe, expect, it } from 'vitest'

import { workerCap } from '../../vitest.config'

describe('workerCap：只有 CI 的 Windows 腿降并发', () => {
  it('CI + win32 → 给出 maxWorkers（削掉那层进程创建压力）', () => {
    expect(workerCap({ ci: 'true', platform: 'win32' })).toEqual({ maxWorkers: 2 })
  })

  it('其余环境一行配置都不多：本机开发、ubuntu / macos 两条腿', () => {
    expect(workerCap({ ci: undefined, platform: 'win32' }), '本机 Windows 开发不降速').toEqual({})
    expect(workerCap({ ci: 'true', platform: 'linux' })).toEqual({})
    expect(workerCap({ ci: 'true', platform: 'darwin' })).toEqual({})
    // 空串按「没设」处理：有的 CI 会把它设成空值，`'false'` 之类仍算「在 CI 里」
    expect(workerCap({ ci: '', platform: 'win32' })).toEqual({})
  })
})
