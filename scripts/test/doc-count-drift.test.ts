/**
 * **「现在有多少」这类计数不许写进活文档** 的守卫（L0）。
 *
 * ## 它守的是什么
 *
 * 本仓已经有一条明文规矩（根 `ROADMAP.md` § 待办 的读法）：
 * **「不数条数、也不写死条数（写了就会漂）」**。而 2026-10-03 的一次文档走查里，同一条规矩在别处
 * 被犯了三次，且**都是同一个形态**——把「跑一遍就能现算 / 清单本身就能数出来」的值，抄进了活文档：
 *
 * | 漂在哪 | 当时写的 | 实际 |
 * |---|---|---|
 * | `packages/devfront/ROADMAP.md` 待办 6b | 「run verify **现在 12/12**」 | 脚本已扩到 15 条（实测 `15 PASS / 0 FAIL`） |
 * | `packages/{tty,docker}/ROADMAP.md` 的 `## 待办（N 项）` | tty 8 → 7、docker 8 → 3 | 上提 + 部分做掉都会改这个数字 |
 * | `packages/{tty,docker}/DEFECTS.md` 的待办指针 | 「（8 项，一项未删）」 | 指的是**拆分时**的条数，读起来却像在说现在 |
 *
 * 这三处的共同点是**错了也不会红**：没有人会去数第二遍。所以规矩要落到守卫上。
 *
 * ## 判据（只有三条，都窄到不会误伤）
 *
 * | # | 判据 | 为什么这条是判据 |
 * |---|---|---|
 * | ① | 包内 `DEFECTS.md` 的待办指针**不许写死条数**（`（N 项`） | 那句说的是「拆出去时有多少条」，而读者会当成「现在有多少条」——改成「条数以那份文档的现算为准」 |
 * | ② | 活文档里**不许出现「现在 + N/M」**（`现在**12/12**` 这种现算式计数） | 「现在」+ 可现算的分数 = 保证会过期的那种句子；历史计数**带日期**写是允许的（「2026-10-03 首验时 12 条」是记录，不是状态） |
 * | ③ | `ROADMAP.md` 的 `## 待办（N 项…）` 标题**不许写条数** | 上提 / 打勾 / 拆分都会改它，而没人会回头改标题——tty 与 docker 各漂过一次，实证 |
 *
 * **刻意不做的**：不做「文档里所有 `N/N` 都必须带日期」。现算过一遍，全仓有 80 余处这类计数
 * （`127/8` 网段、`82/95 行`、`401/403`、真机记录里的 `42/42`……），绝大多数是**合法的引用或带日期的
 * 记录**；一刀切只会逼着后来者写 `// eslint-disable` 式的例外，比不做更坏。三条窄判据各自都有实证。
 *
 * ## 反例（就是上面三处漂的**原始形态**）
 *
 * ① 走查时那段指针原文、② devfront 待办里那句「现在 12/12」、③ `## 待办（7 项）`。
 */
import { readdirSync, readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

/** 待办指针不许写死条数。 */
const LEDGER_POINTER_COUNT = /（\s*\d+\s*项/
/**
 * 「现在」+ 现算式分数（`**12/12**` / `15/15`）——历史计数带日期写不受影响。
 *
 * ⚠️ 那个 lookbehind 是**必须的**，不是保险：`发现` / `呈现` / `出现` 这些词里都含「现在」这个子串，
 * 第一版没有它，`docs/architecture.md` 那句「才**发现在**此之前它们停在 12/9/×10」就被误报了——
 * 与本仓那条「静态判据不该被无关子串满足」是同一类错（反例⑥钉住了它）。
 */
const LIVE_NOW_COUNT = /(?<![发呈显涌闪兑实出浮体展])现在[^。，、\n]{0,8}\d+\s*\/\s*\d+/
/** `## 待办（7 项）` / `## 待办（3 项，其中 1 项已完成）`。 */
const ROADMAP_HEADING_COUNT = /^##\s*待办（[^）]*\d[^）]*）/m
/**
 * i18n 进度表**不许有计数列**（`键数` / `剩余中文字面量`）。
 *
 * 那份表自称「数字是闸门算的、不写死」，却把值抄了下来——2026-10-03 走查时 11 行里 4 行过期
 * （`tty` 差 46、`docker` 差 24、`devfront` 差 7、`codegraph` 差 1），根 ROADMAP 里还有第二份。
 * 现在两处都只留「状态 + 为什么不该翻」，数字一律跑闸门。这条判据守的是**别再加回来**。
 */
const I18N_TABLE_COUNT_COLUMN = /^\|\s*包\s*\|[^\n]*(键数|剩余中文字面量)/m

/** 一次判据（**纯函数**，喂 fixture 就能造反例）。 */
export function countDriftProblems(files: readonly { path: string; text: string }[]): string[] {
  const problems: string[] = []

  for (const file of files) {
    if (file.path.endsWith('DEFECTS.md')) {
      file.text.split('\n').forEach((line, index) => {
        if (line.includes('已拆分为独立文档') && LEDGER_POINTER_COUNT.test(line)) {
          problems.push(
            `${file.path}:${String(index + 1)} 待办指针里写死了条数——那说的是「拆出去时有多少条」，` +
              '读者会当成「现在有多少条」。改成「条数以那份文档的现算为准」',
          )
        }
      })
    }

    if (file.path.endsWith('ROADMAP.md')) {
      if (ROADMAP_HEADING_COUNT.test(file.text)) {
        problems.push(
          `${file.path}: \`## 待办（N 项…）\` 标题里写死了条数——上提 / 打勾 / 拆分都会改它，` +
            '而没人会回头改标题（tty 与 docker 各漂过一次）',
        )
      }
    }

    if (file.path === 'docs/i18n.md' && I18N_TABLE_COUNT_COLUMN.test(file.text)) {
      problems.push(
        'docs/i18n.md: 进度表里又出现了「键数」/「剩余中文字面量」列——那两个数只有闸门知道，' +
          '抄进表里就会漂（2026-10-03 收掉时 11 行里 4 行已过期）。状态写这里、度量跑闸门',
      )
    }

    file.text.split('\n').forEach((line, index) => {
      if (LIVE_NOW_COUNT.test(line)) {
        problems.push(
          `${file.path}:${String(index + 1)} 出现了「现在 + N/M」这种现算式计数——` +
            '它保证会过期。计数要么带日期写成记录，要么指向「跑一遍看汇总行」',
        )
      }
    })
  }

  return problems
}

const read = (path: string): string => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

/** 活文档：会被当成「现状」读的那些（`docs/` + 包内 README / ROADMAP / DEFECTS + 根 ROADMAP）。 */
const liveDocuments = (): { path: string; text: string }[] => {
  const root = new URL('../../', import.meta.url)
  const exists = (rel: string): boolean => {
    try {
      readFileSync(new URL(rel, root), 'utf8')
      return true
    } catch {
      return false
    }
  }

  const files = ['ROADMAP.md']
  for (const name of readdirSync(new URL('docs/', root))) {
    if (name.endsWith('.md')) files.push(`docs/${name}`)
  }
  for (const pkg of readdirSync(new URL('packages/', root))) {
    for (const name of ['README.md', 'ROADMAP.md', 'DEFECTS.md']) {
      const rel = `packages/${pkg}/${name}`
      if (exists(rel)) files.push(rel)
    }
  }

  return files.map((path) => ({ path, text: read(path) }))
}

describe('文档里的计数不许写死（规矩：不数条数、也不写死条数）', () => {
  it('当前仓库活文档全部干净', () => {
    expect(countDriftProblems(liveDocuments())).toEqual([])
  })

  it('扫到的文件不是空集（恒绿闸门比没有更坏）', () => {
    expect(liveDocuments().length).toBeGreaterThan(20)
  })

  it('反例①：DEFECTS 待办指针写死条数 → 报出来（走查时的原文）', () => {
    const bad = [
      {
        path: 'packages/tty/DEFECTS.md',
        text: '**已拆分为独立文档：[ROADMAP.md](./ROADMAP.md)（8 项，一项未删）。**\n',
      },
    ]
    expect(countDriftProblems(bad).join('\n')).toContain('写死了条数')
  })

  it('反例②：devfront 待办里那句「现在 12/12」→ 报出来（当时的原文）', () => {
    const bad = [{ path: 'packages/devfront/ROADMAP.md', text: '（`… run verify`）现在**12/12**，含详情页卡片渲染。\n' }]
    expect(countDriftProblems(bad).join('\n')).toContain('现算式计数')
  })

  it('反例③：`## 待办（7 项）` → 报出来', () => {
    const bad = [{ path: 'packages/tty/ROADMAP.md', text: '## 待办（7 项）\n\n- 一条\n' }]
    expect(countDriftProblems(bad).join('\n')).toContain('标题里写死了条数')
  })

  it('反例④：把分数换成「条」再带上日期 → 不报（历史记录是允许的）', () => {
    const ok = [
      {
        path: 'packages/devfront/README.md',
        text: '> **这张卡片真机验过**（2026-10-03 首验，当天现算 15 条 / 0 条失败）。\n',
      },
    ]
    expect(countDriftProblems(ok)).toEqual([])
  })

  it('反例⑤：说「条数以汇总行为准」而不给数字 → 不报', () => {
    const ok = [
      { path: 'packages/devfront/ROADMAP.md', text: '**条数不写在这里**——以脚本末尾那行汇总为准。\n' },
    ]
    expect(countDriftProblems(ok)).toEqual([])
  })

  it('反例⑥：`才发现` 里含「现在」子串 → 不报（第一版判据在这里自己误报过）', () => {
    const ok = [
      {
        path: 'docs/architecture.md',
        text: '> 上面这三个数字是**现算**的（2026-10-02 加 `devenv` 时才发现在此之前它们停在 12/9/×10）：\n',
      },
    ]
    expect(countDriftProblems(ok)).toEqual([])
  })

  it('反例⑦：i18n 进度表加回「键数」列 → 报出来（收掉时的原形态）', () => {
    const bad = [
      {
        path: 'docs/i18n.md',
        text: '| 包 | 客户端半体 | 状态 | 键数 | 剩余中文字面量 | 说明 |\n|---|---|---|---|---|---|\n| `tty` | `client-src/index.js` | ✅ | 364 | 5 | … |\n',
      },
    ]
    expect(countDriftProblems(bad).join('\n')).toContain('进度表里又出现了')
  })

  it('反例⑧：同一份进度表只留「状态 + 说明」→ 不报', () => {
    const ok = [
      {
        path: 'docs/i18n.md',
        text: '| 包 | 客户端半体 | 状态 | 说明 |\n|---|---|---|---|\n| `devfront` | 手写 `client.js` | ✅ | 配置卡片：标量可改、站点可编辑 |\n',
      },
    ]
    expect(countDriftProblems(ok)).toEqual([])
  })
})
