/**
 * 仓库级真机脚本的安全守卫：`scripts/live-host-smoke.mjs`。
 *
 * ## 为什么用「读源码断言」而不是跑它
 *
 * 跑它要有真 DSH、要起宿主、会写 `~/.dsh/profiles`——进不了 CI。而它必须守住的那几条
 * 性质是**静态可见**的（只建/只删自己的一次性 profile、拒绝覆盖、两个实例各一份拷贝、
 * 刻意不隔离 DSH_HOME）。真正的执行验证由脚本自身跑起来时完成；这里守的是「别在后续
 * 重构里把它改坏」。
 *
 * 与 `packages/codegraph/test/verify-scripts-safety.test.ts` 同一个思路：真机脚本的最大
 * 风险不是「验不出来」，而是**污染用户的真实环境**（CG45 实测过：一个脚本把托管行写进了
 * 用户真实的 `~/.dsh/cordis.patch.yml`，指向随后被删掉的临时目录）。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../../scripts/live-host-smoke.mjs', import.meta.url), 'utf8')
const bootstrapSource = readFileSync(new URL('../../scripts/live-profile.mjs', import.meta.url), 'utf8')
const ci = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8')
const release = readFileSync(new URL('../../.github/workflows/release.yml', import.meta.url), 'utf8')

describe('live-host-smoke：绝不动用户既有 profile', () => {
  it('一次性 profile 名带 live-smoke- 前缀 + pid（不可能撞上用户的名字）', () => {
    expect(source).toMatch(/const profileName = `live-smoke-\$\{String\(process\.pid\)\}`/)
    expect(source).toMatch(/const name = `\$\{profileName\}-\$\{suffix\}`/)
  })

  it('拒绝覆盖已存在的 profile（宁可失败也不吞掉别人的目录）', () => {
    expect(source).toMatch(/if \(fs\.existsSync\(to\)\) throw new Error/)
  })

  it('删除只作用于自己创建的那几份（列表来自 makeProfile，不是按前缀扫目录）', () => {
    expect(source).toContain('const profileDirs = []')
    expect(source).toMatch(/profileDirs\.push\(dir\)/)
    // 只允许删记录下来的 dir；不存在「按目录扫一遍再删」这种写法
    expect(source).toMatch(/for \(const dir of profileDirs\) \{/)
    expect(source, '不许直接对 profilesDir 动手').not.toMatch(/rmSync\(\s*profilesDir/)
    expect(source, '不许按前缀扫目录再删（那会把别人的 live-smoke-* 一起删掉）').not.toMatch(/readdirSync\(profilesDir\)\.filter\([^)]*live-smoke/)
  })

  it('两个实例各一份 profile 拷贝（共用会让 A 的降权写盘污染 B 的断言）', () => {
    expect(source).toMatch(/await makeProfile\('a'\)/)
    expect(source).toMatch(/await makeProfile\('b'\)/)
    expect(source, 'A 那次调用不该复用 B 的 profile 名').toMatch(/const nameA = await makeProfile\('a'\)/)
    expect(source).toMatch(/const nameB = await makeProfile\('b'\)/)
  })

  it('只播种本机目标（验收不该去连别人的机器）', () => {
    expect(source).toContain('kind: local')
    expect(source).toContain('const LIVE_TARGET = ')
  })
})

describe('live-host-smoke：刻意不隔离 DSH_HOME（相对符号链接）', () => {
  it('不设置 DSH_HOME，只读它来定位 profiles 目录', () => {
    // 为什么不断言「隔离」：profile 里的 node_modules 是指向本仓的**相对**符号链接，
    // 把 profile 挪到别的 DSH_HOME 下会整批断掉、插件被跳过（实测：插件全 skipped，
    // 连路由都不存在）。所以它走「在真 DSH_HOME 里建一次性 profile」这条路——
    // 这条断言是给想「顺手加上隔离」的人看的：先读脚本头与本测试的说明。
    expect(source).toMatch(/const dshHome = process\.env\.DSH_HOME \?\?/)
    expect(source, '不许把 DSH_HOME 指向别处（会断掉 profile 里的相对符号链接）').not.toMatch(/DSH_HOME\s*[:=]/)
    expect(bootstrapSource, 'bootstrap 也不许自己改 DSH_HOME：它必须落在调用方看到的那个 profiles 目录里').not.toMatch(/DSH_HOME\s*[:=]/)
  })
})

describe('live-host-smoke：--bootstrap 也只碰自己造的那一份', () => {
  it('只有显式 --bootstrap（且没点名 --from）才现场造，默认行为不变', () => {
    expect(source).toMatch(/if \(source === null && bootstrap && value\('--from'\) === undefined\)/)
    // 造失败是**失败**，不是跳过：造不出来还退 0 就成了「假装验过」
    expect(source).toMatch(/--bootstrap 失败[\s\S]{0,240}process\.exit\(1\)/)
  })

  it('造出来的模板 profile 也进「待删列表」（删除只认列表，不按前缀扫目录）', () => {
    expect(source).toMatch(/profileDirs\.push\(made\.dir\)/)
    expect(bootstrapSource, '模块自己不删目录：删除由调用方按记录做').not.toMatch(/rmSync\(/)
  })

  it('拒绝覆盖已存在的目录（宁可失败也不吞掉别人的 profile）', () => {
    expect(bootstrapSource).toMatch(/if \(fs\.existsSync\(dir\)\) \{/)
    expect(bootstrapSource).toContain('拒绝覆盖')
  })

  it('link 的目标只能由 repoRoot + packages/<pkg> 拼出来（不接受外部路径）', () => {
    expect(bootstrapSource).toMatch(/link:\$\{path\.join\(repoRoot, 'packages', pkg\)\}/)
    // 全文件只有这一处拼 link:（没有第二处可以塞进用户给的路径）
    const linkTemplates = [...bootstrapSource.matchAll(/`link:\$\{[^}]*\}`/g)].map((m) => m[0])
    expect(linkTemplates).toHaveLength(1)
  })

  it('自证插件真进了阵容（cohort 不匹配时 DSH 会整批 disabled → 假绿的源头）', () => {
    expect(bootstrapSource).toMatch(/--dump-config/)
    expect(bootstrapSource).toMatch(/@hyzyn\/dsh-\$\{pkg\}/)
    expect(bootstrapSource).toContain('缺本仓插件')
  })

  it('模板用的是 dsh **自带**的名字，不是某个用户的 profile', () => {
    expect(bootstrapSource).toMatch(/BOOTSTRAP_TEMPLATE = 'web'/)
    expect(bootstrapSource).toMatch(/--from-default-profile/)
  })
})

describe('live-host-smoke：本地门槛，不进 CI', () => {
  it('CI 与发布流水里都没有它（CI 里没有 DSH；装了 DSH 是又慢又漂的重依赖）', () => {
    expect(ci).not.toContain('live-host-smoke')
    expect(release).not.toContain('live-host-smoke')
    expect(ci).not.toContain('live-profile')
    expect(release).not.toContain('live-profile')
  })

  it('没装 DSH / 找不到 link profile 时打印 SKIP（退出 0），--strict 才失败', () => {
    expect(source).toMatch(/process\.exit\(strict \? 1 : 0\)/)
    expect(source).toContain('SKIP')
  })

  it('显式 --from 却不合格 → 直接失败（用户点名了它，静默跳过等于假装验过）', () => {
    expect(source).toMatch(/if \(asked !== undefined\) \{/)
    expect(source).toMatch(/FAIL：--from \$\{asked\} 不是「link 到本仓」的 profile/)
  })
})
