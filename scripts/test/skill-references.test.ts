/**
 * `.dsh/skills/dsh-plugin-kit/` 的守卫：**skill 里点到名的真机脚本必须真的存在**。
 *
 * 为什么需要它：本 skill 刻意**不抄 `docs/` 的正文**（`SKILL.md` 自己的规矩：复制即造
 * 第二真相源），但它会点名脚本与文件——而这类「入口清单」最容易在脚本改名 / 删除后
 * 悄悄变成悬空引用。2026-10-22 复测时实测到：`references/real-test.md` 的 B4 表写「九个
 * 真机验证脚本」，实际已有 11 个，还漏了三个新脚本；同一份文件里「被测插件会往
 * `$DSH_HOME/cordis.patch.yml` 写托管行」也已被 `CG70` 变成错的（案 graph 改写成
 * `profiles/<name>/cordis.patch.yml`）。
 *
 * 所以这里**只守可机械判定的一件事**：skill 行文里出现的 `verify-*.mjs` 名字，
 * 逐个必须在仓库里真实存在。数字一律不守——7 写 9 这种错没法可靠判定「它指的是什么」，
 * 逼着人维护数字只会制造更多漂移；B4 已改成「以 `pnpm verify:list` 的现算结果为准」。
 *
 * 反例用**合成文本**造（不修改任何受版本控制的文件），断言同一条判据会把它标成悬空。
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = join(import.meta.dirname, '..', '..')
const skillDir = join(repoRoot, '.dsh', 'skills', 'dsh-plugin-kit')

/**
 * `.dsh/` 是**本机私有**的（`.gitignore` 第 13 行，注释写明「只在本机生效，不入库」）。
 * 所以这份 skill 在别人克隆 / CI 里根本不存在——那种环境必须**跳过**而不是红：
 * 本守卫的职责是保护本机这份工作法不漂，不是给外人立一个他们无法满足的门槛。
 */
const skillPresent = existsSync(skillDir)
const references = ['SKILL.md', 'references/package-change.md', 'references/real-test.md',
  'references/release.md', 'references/dsh-upgrade.md', 'references/fix-verification.md']

/** 从一段文本里抽出所有 `verify-xxx.mjs` 名字（去重）。 */
const referencedScripts = (text) => [...new Set(text.match(/verify-[a-z0-9-]+\.mjs/g) ?? [])].sort()

/** 仓库里真实存在的真机脚本名（`scripts/` 下平铺的那些）。 */
const realScripts = () => readdirSync(join(repoRoot, 'scripts'))
  .filter((name) => /^verify-[a-z0-9-]+\.mjs$/.test(name))
  .sort()

/** 判据本体：返回「被点名但不存在」的那些名字。 */
const danglingRefs = (text) => {
  const exists = new Set(realScripts())
  return referencedScripts(text).filter((name) => !exists.has(name))
}

describe('skill 引用守卫：点名的真机脚本必须存在', () => {
  it('仓库里能扫到真机脚本（判据本身不自欺）', () => {
    expect(realScripts().length).toBeGreaterThan(0)
  })

  it.skipIf(!skillPresent)('五个 skill 文件里点名的脚本全部存在（悬空引用 = 0）', () => {
    const dangling = []
    for (const file of references) {
      const path = join(skillDir, file)
      expect(existsSync(path), `skill 文件缺失：${file}`).toBe(true)
      for (const name of danglingRefs(readFileSync(path, 'utf8'))) dangling.push(`${file} → ${name}`)
    }
    expect(dangling, `这些脚本名在 skill 里被点名但仓库里不存在：\n${dangling.join('\n')}`).toEqual([])
  })

  it('反例：点名一个不存在的脚本 → 必须报出来', () => {
    const fabricated = '见 `verify-nonexistent-thing.mjs` 与 `verify-codegraph-indexforce.mjs`'
    expect(danglingRefs(fabricated)).toEqual(['verify-nonexistent-thing.mjs'])
  })

  it('反例：只写真实脚本名 → 不报（判据不能把对的判红）', () => {
    const ok = '`verify-codegraph-indexforce.mjs` / `-host-contract.mjs`'
    // 缩写写法（`-host-contract.mjs`）不匹配 /verify-/ 前缀，天然不参与判定
    expect(danglingRefs(ok)).toEqual([])
  })
})
