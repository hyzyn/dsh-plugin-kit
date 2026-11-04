/**
 * 包 README 的「设置面位置」只留一句 + 指回唯一归宿，不许再各抄一份代际矩阵。
 *
 * 背景（2026-11-04 收敛）：`env` / `prompt` / `profile` / `rss` / `mcp` / `codegraph` / `tty` / `docker`
 * 八份 README 曾各写一段「`0.2.0-rc.1` 起挂 `plugins.bundle.config`、0.1.6 线回退行「>」、`≤0.1.5`
 * 用设置页卡片」，docker 还多一张三代表格。那是**同一事实的八份全文**，而且已经漂了：`rss` 与 `tty`
 * 那两份丢掉了 `≤0.1.5` 一档，读者按它们排查旧宿主会得出「没有这条路」的错误结论。
 *
 * 唯一归宿是 [conventions.md § 客户端设置面](../../docs/conventions.md#客户端设置面内联优先)：
 * 三条代际、四条注册契约、聚合包例外与守卫都在那里。包 README 只该说「位置随版本变、始终是同一份
 * 表单」，然后把读者送过去。
 *
 * 为什么这条要守卫：重复不会自己消失——下一次「顺手把宿主版本差异写进 README」就会把矩阵又抄回来，
 * 而**没有任何用例会红**（README 不是代码）。判据是纯静态的：锚点链接必须在、代际矩阵的特征串必须
 * 不在；反向用例（把一段矩阵塞进夹具）必须报错，否则这条守卫等于空转。
 */
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..', '..')

/** 有设置卡片的包（与 scripts/test/plugin-settings-surface.test.ts 的名单同源，但那条守卫管注册代码）。 */
const PACKAGES = ['codegraph', 'docker', 'env', 'mcp', 'profile', 'prompt', 'rss', 'tty']

/** 唯一归宿的锚点（两种语言共用同一份中文文档）。 */
const ANCHOR = 'conventions.md#客户端设置面内联优先'
const ZH_POINTER = '各代际的落点与四条注册契约的唯一归宿在'
const EN_POINTER = 'the per-generation landing spots and the four registration contracts live in'

/** 代际矩阵的特征串：出现即说明这段被抄回来了（这两串只在被压缩掉的矩阵里出现）。 */
const LEGACY_MARKERS = ['plugins.row.config', '≤0.1.5', '`0.2.0-rc.1` 起挂']

/** 把软换行归一，避免因为折行位置不同而误判。 */
function flatten(text: string): string {
  return text.replace(/\s+/g, ' ')
}

/**
 * 判一份 README 是否满足「一句 + 指回归宿」。
 *
 * @param text 文件全文
 * @param lang `zh` / `en`（决定指针句式）
 * @returns 问题列表；空数组 = 通过
 */
export function checkSettingsFace(text: string, lang: 'zh' | 'en'): string[] {
  const flat = flatten(text)
  const problems: string[] = []
  const pointer = lang === 'zh' ? ZH_POINTER : EN_POINTER
  if (!flat.includes(pointer)) problems.push(`缺少「一句 + 指回归宿」的指针句：${pointer}`)
  if (flat.split(ANCHOR).length - 1 !== 1) problems.push(`锚点链接 ${ANCHOR} 必须恰好出现一次`)
  for (const marker of LEGACY_MARKERS) {
    if (flat.includes(marker)) problems.push(`代际矩阵被抄回来了（命中特征串 ${marker}）——只留一句 + 指回 conventions`)
  }
  if (!flat.includes('same form') && !flat.includes('同一份表单')) {
    problems.push('缺少「始终是同一份表单」这一句（读者要知道三代指向同一份配置）')
  }
  return problems
}

describe('包 README：设置面只留一句 + 指回 conventions（不再复制代际矩阵）', () => {
  for (const pkg of PACKAGES) {
    it(`${pkg}：中文版满足判据`, () => {
      const text = readFileSync(join(root, 'packages', pkg, 'README.md'), 'utf8')
      expect(checkSettingsFace(text, 'zh')).toEqual([])
    })

    it(`${pkg}：英文版满足判据`, () => {
      const text = readFileSync(join(root, 'packages', pkg, 'README.en.md'), 'utf8')
      expect(checkSettingsFace(text, 'en')).toEqual([])
    })
  }

  it('唯一归宿真的存在：conventions 里有这一节与四条契约', () => {
    const conventions = readFileSync(join(root, 'docs', 'conventions.md'), 'utf8')
    expect(conventions).toContain('## 客户端设置面：内联优先')
    expect(conventions).toContain('四条契约')
    // 三条代际都在这份文档里（包 README 只指过来，不再各写一份）
    for (const marker of ['0.2.0-rc.1', '0.1.6', '≤0.1.5']) {
      expect(conventions, `conventions 缺少代际 ${marker}`).toContain(marker)
    }
  })

  it('反向验证：把一段代际矩阵塞回夹具必须被这条判据抓住', () => {
    const legacy = '设置面在宿主里的位置随 DSH 版本变，但**始终是同一份表单**：`0.2.0-rc.1` 起挂\n'
      + '`plugins.bundle.config`；旧宿主（0.1.6 线）回退到 `plugins.row.config`，`≤0.1.5` 用设置页卡片。\n'
    expect(checkSettingsFace(legacy, 'zh').length).toBeGreaterThan(0)
    expect(checkSettingsFace(legacy, 'zh')).toContain(
      '代际矩阵被抄回来了（命中特征串 plugins.row.config）——只留一句 + 指回 conventions',
    )
  })

  it('反向验证：只有一句、没有锚点也不算通过（指不回归宿 = 读者仍得自己猜）', () => {
    const bare = '设置面在宿主里的位置随 DSH 版本变，但**始终是同一份表单**。\n'
    expect(checkSettingsFace(bare, 'zh')).toEqual(expect.arrayContaining([`锚点链接 ${ANCHOR} 必须恰好出现一次`]))
  })
})
