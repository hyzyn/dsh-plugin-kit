/**
 * `pnpm verify:list`（[scripts/verify-list.mjs](../verify-list.mjs)）的守卫。
 *
 * 它守的是这轮改造真正容易再坏掉的那一环：**清单与入口不许脱钩**——
 *   - 清单里列的 9 个脚本必须真的存在（改名/删除会立刻红）；
 *   - 8 个包内脚本必须在对应 `package.json` 里有同名条目（否则打印出来的「可粘贴命令」
 *     是假的，`registered: false` + 退出码 1）；
 *   - 通用脚本（不属于任何包）**不该**假装有包内条目。
 *
 * 反例用**合成条目**造（不修改任何受版本控制的文件），断言同一条渲染逻辑会把它标成未登记。
 */
import { describe, expect, it } from 'vitest'
import { collectVerifyList, formatVerifyList, VERIFY_SCRIPTS } from '../verify-list.mjs'

const items = collectVerifyList()

describe('verify:list：清单现算（真实仓库）', () => {
  it('九个脚本一个不少，且都真的存在', () => {
    expect(items).toHaveLength(9)
    expect(items.filter((item) => !item.exists)).toEqual([])
    expect(items.map((item) => item.file).sort()).toEqual([...items.map((item) => item.file)].sort())
  })

  it('包内脚本的入口都在对应 package.json 里登记了，命令是 pnpm --filter 形态', () => {
    const packaged = items.filter((item) => item.pkg !== '（通用）')
    expect(packaged).toHaveLength(8)
    for (const item of packaged) {
      expect(item.registered, `${item.pkg} 缺少入口 ${String(item.entry)}`).toBe(true)
      expect(item.command).toMatch(/^pnpm --filter @hyzyn\/dsh-[\w-]+ run [\w:-]+$/)
    }
  })

  it('通用脚本不属于任何包，命令是 node 形态（不假装有包内入口）', () => {
    const generic = items.filter((item) => item.pkg === '（通用）')
    expect(generic).toHaveLength(1)
    expect(generic[0]?.entry).toBeUndefined()
    expect(generic[0]?.command).toMatch(/^node scripts\//)
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
