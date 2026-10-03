/**
 * 测试夹具的**卫生**：自己建的临时资源自己删。
 *
 * 编号 **D02**（台账：[`../DEFECTS.md`](../DEFECTS.md)）。
 *
 * ## 它是被一次实测逼出来的
 *
 * `installFakeDocker()` 每装一次就 `mkdtempSync` 一个目录，而它的 `cleanup()` 原先只还原 `PATH`
 * 与环境变量、**从不删目录**。于是跑一轮全量用例就在系统临时区积一批：
 *
 * ```
 * $ ls -d $TMPDIR/dsh-devenv-fake-docker-* | wc -l
 * 570
 * ```
 *
 * 每个目录里一个 `docker` 脚本 + 一个 `calls.log`。这类泄漏不会让任何断言变红——**只有去看文件系统
 * 才发现**；而它恰好长在「测试」这件事上：跑得越多、脏得越快，最后没人敢全量跑。
 *
 * ## 为什么是行为断言而不是读源码
 *
 * 静态判据（「`cleanup` 里有没有 `rmSync`」）能被一句注释骗过去，也能在重构后假绿。这里直接**装一次、
 * 清一次、看目录还在不在**——它验的就是那条性质本身。
 */
import { existsSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { installFakeDocker } from './fake-docker.js'

describe('假 docker 夹具：临时目录自己删干净', () => {
  it('安装时目录存在，`cleanup()` 之后目录没了', () => {
    const fake = installFakeDocker()
    expect(existsSync(fake.dir), '安装时应当建出目录').toBe(true)
    fake.cleanup()
    expect(existsSync(fake.dir), 'cleanup() 之后目录必须没了（否则每跑一轮用例就漏一个）').toBe(false)
  })

  it('清理是幂等的（用例在 finally 里重复调不会炸）', () => {
    const fake = installFakeDocker()
    fake.cleanup()
    expect(() => fake.cleanup()).not.toThrow()
  })

  it('PATH 会被还原（否则同文件里后面的用例会继续用到假 docker）', () => {
    const before = process.env.PATH
    const fake = installFakeDocker()
    expect(process.env.PATH).not.toBe(before)
    fake.cleanup()
    expect(process.env.PATH).toBe(before)
  })
})
