/**
 * 作用域判据的**接线守卫**：前端验证必须用 `kit` 那一份实现（单一真相源）。
 *
 * ## 为什么需要它
 *
 * 前端验证与数据面都要回答同一个问题：「当前目录在目标声明的允许目录内吗」。
 * 答案只有一份（`@hyzyn/dsh-devdata` 的 `scope.ts`）。但如果有人图省事在 `devfront`
 * 里**抄一份**，两边会慢慢漂开：
 *
 *   - 一份的归一化规则改了（尾斜杠、`~` 展开）；
 *   - 一份加了新的拒绝理由。
 *
 * 漂开的方向是危险的：**比较松的那一份决定实际防护强度**，而从外面看不出来
 * （两边都「有作用域检查」）。
 *
 * ## 为什么不能写成「两个导入相等」
 *
 * 那种写法是同义反复——同一路径导入的两个名字当然相等，永远不可能失败。
 * 所以这里测**行为对齐**：把同一样本喂给两条路径，比对判定结果。
 * 若有人给 `page.ts` 换成内部实现，只要那个实现的语义与数据面不完全一致，这里就会红。
 *
 * ## 什么时候可以删
 *
 * **2026-10-01 已上收到 `kit`**：那次上收是被运行时约束逼出来的——`devfront` 挂进 profile 后
 * 由宿主用纯 Node 加载，跨包 import 另一个私有包的 `src/*.ts` 走不通，
 * 而把 devdata 做成运行时依赖又会因 `workspace:*` 在 profile 里解析不了而装不上。
 *
 * 本守卫保留：它现在钉的是「`page.ts` 用的是 `kit` 那一份，而不是又有人在包内抄了一份」。
 */

import { decideScope } from '@hyzyn/dsh-kit'
import { describe, expect, it } from 'vitest'

import { adjudicateWebAction, type WebTarget } from '../src/index.js'

const SITE = 'https://cdqas.example.com/'
const HOME = process.env.HOME ?? '/root'

/** 覆盖各边界的样本：`scopeDirs` × `cwd`。 */
const CASES: { scopeDirs: readonly string[] | undefined; cwd: string }[] = [
  { scopeDirs: ['/work/cdqas'], cwd: '/work/cdqas' },
  { scopeDirs: ['/work/cdqas'], cwd: '/work/cdqas/sub' },
  { scopeDirs: ['/work/cdqas'], cwd: '/work/cdqas2' },
  { scopeDirs: ['/work/cdqas/'], cwd: '/work/cdqas' },
  { scopeDirs: ['./'], cwd: process.cwd() },
  { scopeDirs: ['~'], cwd: HOME },
  { scopeDirs: ['/a', '/b'], cwd: '/b/c' },
  { scopeDirs: ['/a', '/b'], cwd: '/c' },
  { scopeDirs: [], cwd: '/work/cdqas' },
  { scopeDirs: undefined, cwd: '/work/cdqas' },
  { scopeDirs: ['   '], cwd: '/work/cdqas' },
]

/** 在这个 `cwd` 上，前端工具面判不判放行（除作用域外的条件都给足）。 */
function frontAllows(scopeDirs: readonly string[] | undefined, cwd: string): boolean {
  const target: WebTarget = { id: 'w', label: 'w', url: SITE, ...(scopeDirs === undefined ? {} : { scopeDirs }) }
  return adjudicateWebAction({ target, action: 'open', cwd, url: SITE }).allowed
}

describe('作用域判据：前端用的是数据面那一份（接线守卫）', () => {
  it('逐例与 `@hyzyn/dsh-devdata` 的 `decideScope` 对齐', () => {
    // 失败意味着：`page.ts` 不再用数据面的作用域门——它多半被换成了本包内部的副本，
    // 而副本与原版的语义会从这里开始漂。
    for (const sample of CASES) {
      const expected = decideScope(sample.scopeDirs, sample.cwd).allowed
      expect(frontAllows(sample.scopeDirs, sample.cwd), JSON.stringify(sample)).toBe(expected)
    }
  })

  it('样本本身有区分度（否则上面那条是空跑）', () => {
    // 一条「所有样本都同答」的一致性测试等于没测。这里钉住样本里确实两种结果都有。
    const answers = new Set(CASES.map((sample) => decideScope(sample.scopeDirs, sample.cwd).allowed))
    expect(answers.size).toBe(2)
  })

  it('关键语义与数据面口径相同（缺省拒绝 / 子目录在内 / 兄弟目录不在）', () => {
    expect(frontAllows(undefined, '/anywhere')).toBe(false)
    expect(frontAllows([], '/anywhere')).toBe(false)
    expect(frontAllows(['/work/cdqas'], '/work/cdqas/sub')).toBe(true)
    expect(frontAllows(['/work/cdqas'], '/work/cdqas2')).toBe(false)
  })
})
