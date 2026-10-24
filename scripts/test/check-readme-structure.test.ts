/**
 * `scripts/check-readme-structure.mjs` 的用例 —— 中英 README 章节结构守卫。
 *
 * ## 这份用例守两件事
 *
 * 1. **真实仓库必须绿**（`checkRepo()`：每对双语 README 的标题层级序列一致），
 *    并断言「真的扫到了对」——把 `packages/` 读空的实现也会恒绿；
 * 2. **守卫必须会红**——本仓发生过「命中 0 个文件、恒绿、拦不住任何东西」的闸门，
 *    所以每种漂法都要有反例：中文多一节、英文多一节、层级不同、标题掉了。
 *
 * 反例**全部用 fixture 造**（直接喂 `compareHeadings` / `checkPairs`），不修改任何
 * 受版本控制的文件；真实仓库那组只断言「结构一致」，不写死对数与标题数
 * （conventions § 文档分档 纪律 3：文档里不写会漂的数字）。
 *
 * 另一半是**解析面本身**的反例：代码围栏里的 `#`、4 空格缩进、HTML 注释里的 `#`
 * 都不能被当成标题——判据改松会让漂移静默漏过，改紧会对正确文档报错。
 *
 * 已知边界（刻意，不是漏）：同层级标题**换序**看不出来——判据只比层级序列、
 * 不比文字（没有翻译映射，硬比只会误报）。下面有一条用例把这个边界钉住。
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

import {
  README_EN_FILE,
  README_FILE,
  bilingualPackages,
  checkPairs,
  checkRepo,
  compareHeadings,
  extractHeadings,
  linesOutsideFences,
  readReadmePairs,
} from '../check-readme-structure.mjs'

/** 造一对双语文本：中文 / 英文的标题层级序列相同。 */
const zhOk = ['# 演示包', '', '## 是什么', '', '### 子节', '', '## 安装', ''].join('\n')
const enOk = ['# Demo', '', '## What it is', '', '### Subsection', '', '## Install', ''].join('\n')

/** 用两段原文跑一次比较（pkg 名固定，报错信息里要能看见它）。 */
function compare(zh: string, en: string) {
  return compareHeadings({
    pkg: 'demo',
    zhPath: `packages/demo/${README_FILE}`,
    enPath: `packages/demo/${README_EN_FILE}`,
    zhHeadings: extractHeadings(zh),
    enHeadings: extractHeadings(en),
  })
}

describe('真实仓库：中英结构一致', () => {
  it('每对双语 README 的标题层级序列一致', () => {
    expect(checkRepo()).toEqual([])
  })

  it('确实扫到了双语对与标题（否则闸门恒绿）', () => {
    expect(bilingualPackages().length, '双语包 0 个 = 判据空转').toBeGreaterThan(0)
    for (const pair of readReadmePairs()) {
      expect(pair.zhHeadings.length, `${pair.pkg} 的中文版没抽到标题`).toBeGreaterThan(0)
      expect(pair.enHeadings.length, `${pair.pkg} 的英文版没抽到标题`).toBeGreaterThan(0)
    }
  })
})

describe('结构判据：只比层级序列，不比文字', () => {
  it('文字不同、层级序列相同 → 通过', () => {
    expect(compare(zhOk, enOk)).toEqual([])
  })

  it('中文多一节 → 报差异，并指出首个差异在第几个标题', () => {
    const diffs = compare(`${zhOk}\n## 多出来的一节\n`, enOk)
    expect(diffs).toHaveLength(1)
    expect(diffs[0].kind).toBe('readme.structure.mismatch')
    expect(diffs[0].message).toContain('demo')
    expect(diffs[0].message).toContain('首个差异')
    // 两边都要带上具体数字与层级分布，否则报错信息没法定位
    expect(diffs[0].message).toContain('个标题')
    expect(diffs[0].message).toContain('##×')
  })

  it('英文多一节 → 同样报（不是只查一个方向）', () => {
    const diffs = compare(zhOk, `${enOk}\n## Extra\n`)
    expect(diffs).toHaveLength(1)
    expect(diffs[0].message).toContain('zh 是')
    expect(diffs[0].message).toContain('en 是')
  })

  it('同一位置层级不同（## 对 ###）→ 报', () => {
    const diffs = compare('# A\n\n## B\n', '# A\n\n### B\n')
    expect(diffs).toHaveLength(1)
    expect(diffs[0].message).toContain('zh 是 ##')
    expect(diffs[0].message).toContain('en 是 ###')
  })

  it('已知边界：同层级标题换序看不出来（不比文字）', () => {
    // 层级序列仍是 [1,2,2]：纯层级比较看不出同层级的文案换序。
    // 这条用例把边界钉住，免得有人误以为它能拦换序。
    expect(compare('# A\n\n## B\n\n## C\n', '# A\n\n## C\n\n## B\n')).toEqual([])
  })
})

describe('解析面：哪些 `#` 不是标题', () => {
  it('``` 围栏里的 `# 注释` 不算标题', () => {
    const text = ['# A', '', '```sh', '# 不是标题', '## 也不是', '```', '', '## B', ''].join('\n')
    expect(extractHeadings(text).map((heading) => heading.level)).toEqual([1, 2])
  })

  it('~~~ 围栏同样生效（同字符、不短于开启围栏才闭合）', () => {
    const text = ['# A', '', '~~~md', '## 不是标题', '~~~~', '## B', ''].join('\n')
    expect(extractHeadings(text).map((heading) => heading.level)).toEqual([1, 2])
  })

  it('4 空格缩进的 `#` 是缩进代码块，不是标题', () => {
    expect(extractHeadings('# A\n\n    # 不是标题\n')).toHaveLength(1)
  })

  it('HTML 注释里的标题不算（跨行也不破坏行号）', () => {
    const text = ['# A', '', '<!--', '## 隐藏', '-->', '', '## B', ''].join('\n')
    const headings = extractHeadings(text)
    expect(headings.map((heading) => heading.level)).toEqual([1, 2])
    expect(headings[1].lineNumber).toBe(7)
  })

  it('闭合式 ATX 的尾部井号剥掉（`## 标题 ##`）', () => {
    const [heading] = extractHeadings('## 标题 ##\n')
    expect(heading.level).toBe(2)
    expect(heading.text).toBe('标题')
  })

  it('`#` 后面没有空格不是标题（CommonMark）', () => {
    expect(extractHeadings('#不是标题\n')).toEqual([])
  })

  it('Windows 换行（CRLF）不影响解析', () => {
    expect(extractHeadings('## A\r\n### B\r\n').map((heading) => heading.level)).toEqual([2, 3])
  })
})

describe('命中不是 0：空输入必须报', () => {
  it('一对双语 README 都没有 → 报 no-pairs', () => {
    const diffs = checkPairs([])
    expect(diffs).toHaveLength(1)
    expect(diffs[0].kind).toBe('readme.structure.no-pairs')
  })

  it('有对但一个标题都没抽到 → 报 no-headings', () => {
    const diffs = checkPairs([
      {
        pkg: 'demo',
        zhPath: 'zh',
        enPath: 'en',
        zhHeadings: extractHeadings('只有正文，没有标题\n'),
        enHeadings: extractHeadings('body only\n'),
      },
    ])
    expect(diffs).toHaveLength(1)
    expect(diffs[0].kind).toBe('readme.structure.no-headings')
  })
})

describe('围栏扫描本身', () => {
  it('未闭合的围栏吞掉后面的行（CommonMark：到块尾）', () => {
    const text = ['# A', '```', '## 还不是标题', ''].join('\n')
    // 围栏未闭合 ⇒ 只留下 `# A`；这是刻意的保守口径，宁可不报也不误报
    expect(linesOutsideFences(text).map((line) => line.text)).toEqual(['# A'])
  })
})

/** 临时 fixture 仓库：文件读取路径（`bilingualPackages` 的过滤 + 真实读盘）也要能证伪。 */
const sandboxes = []
function makeRepo(files) {
  const root = mkdtempSync(join(tmpdir(), 'dsh-readme-structure-'))
  sandboxes.push(root)
  for (const [path, content] of Object.entries(files)) {
    const absolute = join(root, path)
    mkdirSync(join(absolute, '..'), { recursive: true })
    writeFileSync(absolute, content, 'utf8')
  }
  return root
}
afterAll(() => {
  for (const root of sandboxes) rmSync(root, { recursive: true, force: true })
})

describe('端到端（fixture 仓库）：读盘路径会红、也会数对', () => {
  it('中文版多一节 → checkRepo 报差异（不是只有纯函数会红）', () => {
    const root = makeRepo({
      'packages/demo/package.json': '{}',
      'packages/demo/README.md': `${zhOk}\n## 多出来的一节\n`,
      'packages/demo/README.en.md': enOk,
    })
    const diffs = checkRepo(root)
    expect(diffs).toHaveLength(1)
    expect(diffs[0].kind).toBe('readme.structure.mismatch')
    expect(diffs[0].message).toContain('demo')
  })

  it('没有 package.json 的目录不算包（`packages/dist` 这类不是包）', () => {
    const root = makeRepo({
      'packages/not-a-package/README.md': zhOk,
      'packages/not-a-package/README.en.md': enOk,
    })
    // 0 对 = 判据空转：checkRepo 必须报 no-pairs，而不是静默通过
    expect(checkRepo(root)).toHaveLength(1)
    expect(checkRepo(root)[0].kind).toBe('readme.structure.no-pairs')
  })
})
