/**
 * `scripts/live-profile.mjs` 的单元测试 —— 真宿主验收的 bootstrap 那一步。
 *
 * 为什么它值得测：bootstrap 造出来的 profile 是**真宿主**要挂的阵容，它错了不会在别处报警，
 * 只会让 `live-host-smoke` 跑出一堆莫名其妙的 FAIL（或更糟：**跑出一堆 PASS 但验的是空对象**）。
 * 后者是真的发生过——patch 层里不写 `allowMutations: true`，「配置里写着 true 却打不开」那条
 * 断言就没有前提，A1 变成一条恒真断言却照样绿。
 *
 * 真机侧（起宿主、路由门控）由 `node scripts/live-host-smoke.mjs --bootstrap` 自己验；
 * 这里守的是**生成物里必须有的那几行**与「只碰自己目录」的名字约定。
 */
import { describe, expect, it } from 'vitest'
import {
  BOOTSTRAP_PACKAGES,
  BOOTSTRAP_PREFIX,
  BOOTSTRAP_TEMPLATE,
  bootstrapPatchYaml,
  bootstrapProfileName,
} from '../live-profile.mjs'

const TARGET = 'live-smoke-local'

describe('bootstrapLinkProfile：命名', () => {
  it('名字带 live-smoke-src- 前缀 + pid（撞不上用户手建的 profile）', () => {
    expect(bootstrapProfileName(4321)).toBe(`${BOOTSTRAP_PREFIX}-4321`)
    expect(BOOTSTRAP_PREFIX).toBe('live-smoke-src')
    // 不许出现「固定名字」那种写法：两个并发运行会互相覆盖
    expect(bootstrapProfileName(1)).not.toBe(bootstrapProfileName(2))
  })
})

describe('bootstrapLinkProfile：patch 层', () => {
  const yaml = bootstrapPatchYaml({ target: TARGET })

  it('docker 的两个开关**写成 true**——否则 A1「配置里 true 却打不开」是空断言', () => {
    expect(yaml).toMatch(/- id: docker\n {2}config:\n/)
    expect(yaml).toMatch(/^ {4}allowMutations: true$/m)
    expect(yaml).toMatch(/^ {4}allowExec: true$/m)
  })

  it('只播种一个**本机** docker 目标（验收不该去连别人的机器）', () => {
    expect(yaml).toMatch(/^ {4}targets:$/m)
    expect(yaml).toContain(`- name: ${TARGET}`)
    expect(yaml).toMatch(/^ {8}kind: local$/m)
    // 除本机目标外不许出现别的 target 名字（ssh 目标会让授权那一半真去连远端）
    expect([...yaml.matchAll(/^\s*- name: (\S+)$/gm)].map((m) => m[1])).toEqual([TARGET])
  })

  it('tty 的代理命令开关写成 false——B4 要验「授权后能把它打开」', () => {
    expect(yaml).toMatch(/- id: tty\n {2}config:\n/)
    expect(yaml).toMatch(/^ {4}allowProxyCommand: false$/m)
  })

  it('两个 id 都在 profile 自己的 patch 层里（bundle 层只插裸行，配置得由这里给）', () => {
    expect([...yaml.matchAll(/^- id: (\S+)$/gm)].map((m) => m[1])).toEqual(['docker', 'tty'])
  })
})

describe('bootstrapLinkProfile：挂什么、用什么模板', () => {
  it('只挂验收真正要用的两个包（挂全仓会把不相干的安装问题变成验收失败）', () => {
    expect(BOOTSTRAP_PACKAGES).toEqual(['docker', 'tty'])
  })

  it('模板是 dsh **自带**的 web（不是复制用户的某个 profile）', () => {
    expect(BOOTSTRAP_TEMPLATE).toBe('web')
  })
})
