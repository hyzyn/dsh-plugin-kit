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
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import {
  BOOTSTRAP_PACKAGES,
  BOOTSTRAP_PREFIX,
  BOOTSTRAP_TEMPLATE,
  bootstrapPatchYaml,
  bootstrapProfileName,
  copyProfileTree,
} from '../live-profile.mjs'

const roots: string[] = []
function tempRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), 'live-profile-'))
  roots.push(dir)
  return dir
}
afterAll(() => {
  for (const dir of roots) rmSync(dir, { recursive: true, force: true })
})

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

describe('copyProfileTree：链接必须是链接，不能被展开', () => {
  /*
   * Windows 真机挖出来的那条：pnpm 的 `link:` 依赖在那边是 **junction**，而
   * `fs.cpSync(..., { verbatimSymlinks: true, dereference: false })` 照样把它展开成真目录
   * （实测：一个是 junction 的包变成 124MB 的真副本）——副本里没有兄弟包
   * （`@deepseek-ai/cosmokit`），插件 import 失败、路由全 404。这条用例守的是同一段逻辑：
   * 复制之后入口仍是**链接**，且目标不变、文件内容被复制到。
   */
  it('目录树里的链接原样复制成链接（且目标不变），文件照抄', () => {
    const root = tempRoot()
    const source = join(root, 'source')
    const target = join(root, 'elsewhere', 'reals')
    mkdirSync(join(target, 'nested'), { recursive: true })
    mkdirSync(source, { recursive: true })
    writeFileSync(join(target, 'pkg.json'), '{"name":"linked"}\n')
    writeFileSync(join(target, 'nested', 'deep.txt'), 'deep\n')
    writeFileSync(join(source, 'plain.txt'), 'plain\n')
    // 与真实 profile 同形：链接放在 node_modules/<scope>/<name>，指向仓里的包目录
    mkdirSync(join(source, 'node_modules', '@hyzyn'), { recursive: true })
    const linkPath = join(source, 'node_modules', '@hyzyn', 'dsh-docker')
    symlinkSync(target, linkPath, 'dir')

    const dest = join(root, 'copy')
    copyProfileTree(source, dest)

    const copied = join(dest, 'node_modules', '@hyzyn', 'dsh-docker')
    expect(lstatSync(copied).isSymbolicLink(), '复制之后必须仍是链接（展开就是那条 Windows 缺陷）').toBe(true)
    expect(resolve(dirname(copied), readlinkSync(copied))).toBe(resolve(target))
    expect(readFileSync(join(dest, 'plain.txt'), 'utf8')).toBe('plain\n')
  })

  it('普通文件与嵌套目录照抄（含空目录）', () => {
    const root = tempRoot()
    const source = join(root, 's')
    mkdirSync(join(source, 'a', 'b'), { recursive: true })
    mkdirSync(join(source, 'empty'), { recursive: true })
    writeFileSync(join(source, 'a', 'b', 'x.json'), '{}\n')
    const dest = join(root, 'd')
    copyProfileTree(source, dest)
    expect(readFileSync(join(dest, 'a', 'b', 'x.json'), 'utf8')).toBe('{}\n')
    expect(existsSync(join(dest, 'empty'))).toBe(true)
    // 目的目录已存在也不报错（调用方自己做「拒绝覆盖」那一步）
    copyProfileTree(source, dest)
    expect(readFileSync(join(dest, 'a', 'b', 'x.json'), 'utf8')).toBe('{}\n')
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
