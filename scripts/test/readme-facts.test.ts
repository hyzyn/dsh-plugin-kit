/**
 * `scripts/check-readme-facts.mjs` 的单元测试 —— README 与源码常量的一致性闸门。
 *
 * 为什么有这份测试：这道闸门守的正是「**文档与实现必然漂**」那类问题，而它自己也会漂——
 * 闸门失效是**只会失败、平时不出声**的（全仓接入时全绿），所以每个判据都要配反例：
 *   ① 判据改松（配对正则漏掉一种写法）→ 文档继续漂而没人发现；
 *   ② 判据改紧（把散文里的数字当成事实）→ 对着正确文档报错，最后一定被削弱。
 *
 * 最后一组拿**真实仓库**跑一遍：既证明「上线即绿」，也拦住以后有人把某个包的 README 改歪。
 * 真实语料那组只断言「差异条数不多于已知基线」，不写死为 0——修一处旧偏移不该让测试红。
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterAll, describe, expect, it } from 'vitest'

import {
  checkRepo,
  checkReadmeFacts,
  collectConstants,
  evaluateConstant,
  extractReadmePairs,
  parseNumber,
  selfTest,
} from '../check-readme-facts.mjs'

/** 临时 fixture 仓库：只在里面放最小可用的包结构。 */
const sandboxes = []
function makeRepo(files) {
  const root = mkdtempSync(join(tmpdir(), 'dsh-readme-facts-'))
  sandboxes.push(root)
  for (const [path, content] of Object.entries(files)) {
    const abs = join(root, path)
    mkdirSync(join(abs, '..'), { recursive: true })
    writeFileSync(abs, content, 'utf8')
  }
  return root
}
afterAll(() => {
  for (const root of sandboxes) rmSync(root, { recursive: true, force: true })
})

const CONSTS = new Map([
  ['RESULT_COLUMN_MAX', { value: 4, file: 'pkg/src/a.ts', line: 1 }],
  ['RAW_PREVIEW_MAX', { value: 20000, file: 'pkg/src/a.ts', line: 2 }],
])

describe('数字与表达式的读取', () => {
  it('parseNumber 认千分位与下划线，不认别的', () => {
    expect(parseNumber('20,000')).toBe(20000)
    expect(parseNumber('1_000')).toBe(1000)
    expect(parseNumber('4')).toBe(4)
    expect(parseNumber('abc')).toBeUndefined()
    expect(parseNumber('')).toBeUndefined()
  })

  it('evaluateConstant 只算纯数字表达，算不出就返回 undefined（不猜）', () => {
    expect(evaluateConstant('8 * 1024 * 1024')).toBe(8388608)
    expect(evaluateConstant('24 * 60 * 60 * 1000')).toBe(86400000)
    expect(evaluateConstant('20_000')).toBe(20000)
    expect(evaluateConstant('0.5')).toBe(0.5)
    // 非法 / 非数值形态：一律 undefined，不参与比对
    expect(evaluateConstant('Number.POSITIVE_INFINITY')).toBeUndefined()
    expect(evaluateConstant("'2m'")).toBeUndefined()
    expect(evaluateConstant('[]')).toBeUndefined()
    expect(evaluateConstant('')).toBeUndefined()
  })
})

describe('从源码收集常量', () => {
  it('只收 export const 且能静态算的，非导出与不可算的都跳过', () => {
    const map = collectConstants({
      list: () => ['a.ts'],
      read: () =>
        [
          'export const OK = 16',
          'export const MUL = 8 * 1024 * 1024',
          'const NOT_EXPORTED = 5',
          'export const NOT_NUMERIC = Number.POSITIVE_INFINITY',
          'export const TEXT = "abc"',
          'export const mixedCase = 3',
        ].join('\n'),
    })
    expect([...map.keys()]).toEqual(['OK', 'MUL'])
    expect(map.get('OK').value).toBe(16)
    expect(map.get('MUL').value).toBe(8388608)
  })
})

describe('README 里的「常量名 + 数」抽取', () => {
  it('三种写法都认：中文括号 / 等号 / 空格', () => {
    const pairs = extractReadmePairs(
      [
        '最多 `RESULT_COLUMN_MAX`（4）列。',
        '`RAW_PREVIEW_MAX` = 20000',
        '上限 `NET_MAX_RESPONSE_BYTES` 8388608',
      ].join('\n'),
    )
    const byName = Object.fromEntries(pairs.map((p) => [p.name, p.value]))
    expect(byName.RESULT_COLUMN_MAX).toBe(4)
    expect(byName.RAW_PREVIEW_MAX).toBe(20000)
    expect(byName.NET_MAX_RESPONSE_BYTES).toBe(8388608)
  })

  it('英文括号也认', () => {
    const pairs = extractReadmePairs('at most `RESULT_COLUMN_MAX` (4) columns')
    expect(pairs).toHaveLength(1)
    expect(pairs[0].value).toBe(4)
  })

  it('没有反引号的裸常量名不当成事实（散文里的小写词不该被抓）', () => {
    expect(extractReadmePairs('最多 RESULT_COLUMN_MAX 4 列')).toEqual([])
  })
})

describe('核对判据', () => {
  it('数字一致 → 通过', () => {
    const diffs = checkReadmeFacts({
      readmePath: 'pkg/README.md',
      packageName: 'pkg',
      text: '最多 `RESULT_COLUMN_MAX`（4）列。',
      constants: CONSTS,
    })
    expect(diffs).toEqual([])
  })

  it('旧值 → 报 stale，并带上两边的数', () => {
    const diffs = checkReadmeFacts({
      readmePath: 'pkg/README.md',
      packageName: 'pkg',
      text: '最多 `RESULT_COLUMN_MAX`（3）列。',
      constants: CONSTS,
    })
    expect(diffs).toHaveLength(1)
    expect(diffs[0].kind).toBe('readme.fact.stale')
    expect(diffs[0].message).toContain('3')
    expect(diffs[0].message).toContain('4')
  })

  it('README 引用别的包的常量 → 不判（跨包引用是合法的）', () => {
    const diffs = checkReadmeFacts({
      readmePath: 'pkg/README.md',
      packageName: 'pkg',
      text: '见 `OTHER_PACKAGE_CONST`（99）。',
      constants: CONSTS,
    })
    expect(diffs).toEqual([])
  })

  it('没写常量名 → 不判（散文里的数字刻意不管）', () => {
    const diffs = checkReadmeFacts({
      readmePath: 'pkg/README.md',
      packageName: 'pkg',
      text: '日志区高度是 min(720px, 72vh)，最多 4 列。',
      constants: CONSTS,
    })
    expect(diffs).toEqual([])
  })
})

describe('全仓扫描（fixture）', () => {
  it('中英两份 README 各查一遍，任一漂都会报', () => {
    const root = makeRepo({
      'packages/demo/package.json': '{"name":"demo"}',
      'packages/demo/src/a.ts': 'export const LIMIT = 16\n',
      'packages/demo/README.md': '最多 `LIMIT`（16）条\n',
      'packages/demo/README.en.md': 'at most `LIMIT` (8) entries\n',
    })
    const diffs = checkRepo({ root })
    expect(diffs).toHaveLength(1)
    expect(diffs[0].readmePath).toContain('README.en.md')
  })

  it('包内没有可算常量 → 跳过，不报', () => {
    const root = makeRepo({
      'packages/demo/package.json': '{"name":"demo"}',
      'packages/demo/src/a.ts': 'export const NAME = "abc"\n',
      'packages/demo/README.md': '见 `NAME`（1）\n',
    })
    expect(checkRepo({ root })).toEqual([])
  })

  it('只查 --only 指定的包（staged 模式）', () => {
    const root = makeRepo({
      'packages/a/package.json': '{}',
      'packages/a/src/x.ts': 'export const N_LIMIT = 1\n',
      'packages/a/README.md': '`N_LIMIT`（2）\n',
      'packages/b/package.json': '{}',
      'packages/b/src/y.ts': 'export const M_LIMIT = 1\n',
      'packages/b/README.md': '`M_LIMIT`（2）\n',
    })
    expect(checkRepo({ root })).toHaveLength(2)
    expect(checkRepo({ root, only: new Set(['a']) })).toHaveLength(1)
  })
})

describe('自检（裸 Node 下也能证明会红）', () => {
  it('selfTest 无失败项', () => {
    expect(selfTest()).toEqual([])
  })
})

describe('真实仓库', () => {
  it('当前没有未知的偏移（旧偏移修掉前会红，这是有意的）', () => {
    const diffs = checkRepo()
    // 断言里列出全部差异：红的时候直接看清是哪条，不用再去跑脚本
    expect(diffs.map((d) => d.message)).toEqual([])
  })
})
