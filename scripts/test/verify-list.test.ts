/**
 * `pnpm verify:list`（[scripts/verify-list.mjs](../verify-list.mjs)）的守卫。
 *
 * 它守的是这轮改造真正容易再坏掉的那一环：**清单与入口不许脱钩**——
 *   - `scripts/verify-*.mjs` 有一个算一个，都必须进清单（**现算目录**，不写死条数：
 *     2026-10-25 加 `verify-tier-restrict.mjs` 时，写死的「12 个」当场把它判红，
 *     与 `docs/conventions.md` § 不写死计数 同一条）；
 *   - 包内脚本必须在对应 `package.json` 里有同名条目（否则打印出来的「可粘贴命令」
 *     是假的，`registered: false` + 退出码 1）；
 *   - 通用脚本（不属于任何包）**不该**假装有包内条目。
 *
 * 反例用**合成条目**造（不修改任何受版本控制的文件），断言同一条渲染逻辑会把它标成未登记。
 */
import { describe, expect, it } from 'vitest'
import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { collectVerifyList, formatVerifyList, VERIFY_SCRIPTS } from '../verify-list.mjs'

const items = collectVerifyList()
/**
 * `scripts/` 下**现算**的真机脚本清单（判据是目录，不是数组里那个数）。
 *
 * 排除 `verify-list.mjs` 自己：它名字里带 `verify-`，但它**是这份清单的工具**，不是被列的脚本
 * ——列进去就成了「清单列自己」，第一版这么写当场把守卫判红（判据要测对对象）。
 */
const onDisk = readdirSync(fileURLToPath(new URL('..', import.meta.url)))
  .filter((name) => /^verify-.*\.mjs$/u.test(name) && name !== 'verify-list.mjs')
  .sort()

describe('verify:list：清单现算（真实仓库）', () => {
  it('scripts/ 下每个 verify-*.mjs 都在清单里，且清单里的都真的存在', () => {
    const listed = new Set(VERIFY_SCRIPTS.map((item) => item.file))
    const missing = onDisk.filter((name) => !listed.has(name))
    expect(missing, `这些真机脚本没登记进 VERIFY_SCRIPTS：${missing.join('、')}`).toEqual([])
    expect(items.filter((item) => !item.exists)).toEqual([])
  })

  it('包内脚本的入口都在对应 package.json 里登记了，命令是 pnpm --filter 形态', () => {
    const packaged = items.filter((item) => item.pkg !== '（通用）')
    expect(packaged.length).toBeGreaterThan(0)
    for (const item of packaged) {
      expect(item.registered, `${item.pkg} 缺少入口 ${String(item.entry)}`).toBe(true)
      expect(item.command).toMatch(/^pnpm --filter @hyzyn\/dsh-[\w-]+ run [\w:-]+$/)
    }
  })

  it('通用脚本不属于任何包，命令是 node 形态（不假装有包内入口）', () => {
    const generic = items.filter((item) => item.pkg === '（通用）')
    // 三个：verify-client-ui.mjs（打外部宿主，`--url/--token`）、
    // verify-issue-13-14.mjs（**自起**宿主，命令自带 `--from`）与
    // mcp-tool-budget.mjs（成本报告，打外部宿主，默认 127.0.0.1:3082 可 `--url` 覆盖）。
    // 断言的是**集合**而不是条数：多一个通用脚本必须被看见，而不是被一个数字放过。
    expect(generic.map((item) => item.file).sort()).toEqual([
      'mcp-tool-budget.mjs',
      'verify-client-ui.mjs',
      'verify-issue-13-14.mjs',
    ])
    for (const item of generic) {
      expect(item.entry).toBeUndefined()
      expect(item.command).toMatch(/^node scripts\//)
    }
  })

  it('渲染结果里每个脚本都有「需要什么」与一条命令（清单是给人粘的）', () => {
    const text = formatVerifyList(items)
    for (const item of items) {
      expect(text).toContain(item.file)
      expect(text, `${item.file} 缺「需要什么」`).toContain(item.needs)
    }
    expect(text).toContain('只列不跑')
    expect(text, '清单必须声明它不做聚合执行').toContain('待批准')
  })
})

describe('反例：入口脱钩 → 必须报出来', () => {
  it('清单里多一个「包内但没登记入口」的脚本 → 渲染出 ✘ 且命令带「未登记」', () => {
    const broken = [
      ...items,
      { file: 'verify-nonexistent-smoke.mjs', pkg: 'mcp', entry: 'nope-smoke', needs: '（反例）', exists: false, inCi: false, command: 'node scripts/verify-nonexistent-smoke.mjs   # ⚠️ 未登记：mcp 的 package.json 里没有 nope-smoke', registered: false },
    ]
    const text = formatVerifyList(broken)
    expect(text).toContain('✘ 清单里有 1 个脚本不存在')
    expect(text).toContain('✘ 1 个入口未登记到包 package.json')
  })

  it('清单常量本身不许出现重复文件名', () => {
    const files = VERIFY_SCRIPTS.map((item) => item.file)
    expect(new Set(files).size).toBe(files.length)
  })
})
