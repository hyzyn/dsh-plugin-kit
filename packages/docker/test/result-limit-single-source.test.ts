/**
 * `docker_logs_grep` 返回侧行上限的**单一真相源**守卫（源码形状断言）。
 *
 * ## 为什么需要源码断言：运行时断言在这一层恒真
 *
 * 上限只有一个事实来源：`src/docker.ts` 的 `MAX_RESULT_LINES`。模型看到的描述由
 * `src/index.ts` 拼出来，曾经那里硬编码了「返回行数另有上限（4000）」——改常量、描述不跟着变。
 *
 * `test/tool-registration.test.ts` 的运行时断言只验证「描述里出现了 `String(MAX_RESULT_LINES)`」。
 * 它挡得住「常量改了、描述留在旧值」，却**挡不住又硬编码回去**：当有人把描述写回「（4000）」、
 * 而常量当时也正好是 4000 时，两条字符串完全相等，运行时用例**照样绿**——那正是要防的那次回归。
 *
 * 所以本文件读**源码**，判两件事：
 *
 *   1. `docker_logs_grep` 的 description 是**模板字面量**且含插值 `${String(MAX_RESULT_LINES)}`；
 *   2. 该 description 里**没有**纯数字的括号字面量（如「（4000）」）——那等于第二份真相源。
 *
 * ## 为什么把判据写成纯函数 + 反例
 *
 * 本仓规矩：没有反例的守卫会在下一次改动里漂掉。`findResultLimitViolations` 接收源码字符串、
 * 返回违规清单（空数组 = 通过），于是可以对**变异源码**跑同一份判据：把插值换回字面量 4000
 * 必须报错。反例都在内存字符串上做，**不修改任何受版本控制的文件**（与
 * `scripts/test/announcement-budget.test.ts` 的 fixture 反例同一思路，但那边建临时目录树，
 * 这里判的是单文件形状，直接拿真实源码变异更贴近要防的回归）。
 *
 * ## 边界（刻意不做的）
 *
 * 只认 `name: 'docker_logs_grep'` 之后最近的那个 `description:` 字面量：定位不到就**判红**
 * （返回违规），不静默通过——「匹配不到就算过」的闸门比没有更坏。
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const INDEX_SOURCE = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')

/** 描述里唯一允许的上限写法（`src/docker.ts` 的常量插值）。 */
const REQUIRED_INTERPOLATION = '${String(MAX_RESULT_LINES)}'

/**
 * 从 `name: 'docker_logs_grep'` 之后取出它自己的 `description:` 字面量原文（不含定界符）。
 * 认不出形状时返回 `null`（调用方据此判红，不猜）。
 */
function extractLogsGrepDescription(source: string): string | null {
  const nameAt = source.indexOf("name: 'docker_logs_grep'")
  if (nameAt === -1) return null
  const keyAt = source.indexOf('description:', nameAt)
  if (keyAt === -1) return null
  let at = keyAt + 'description:'.length
  // 跳过空白与 `//` 行注释（描述前写注释不违反单一真相源）
  for (;;) {
    while (at < source.length && /\s/u.test(source[at] ?? '')) at += 1
    if (source.startsWith('//', at)) {
      const lineEnd = source.indexOf('\n', at)
      if (lineEnd === -1) return null
      at = lineEnd + 1
      continue
    }
    break
  }
  const quote = source[at]
  if (quote !== '`' && quote !== "'" && quote !== '"') return null
  let index = at + 1
  let body = ''
  while (index < source.length) {
    const char = source[index] ?? ''
    // 转义字符连同后一个字符原样保留（`\\` 与 `\`` 都不会被误判成定界符）
    if (char === '\\') {
      body += char + (source[index + 1] ?? '')
      index += 2
      continue
    }
    if (char === quote) return body
    body += char
    index += 1
  }
  return null
}

/** 判据本体：返回违规清单（空数组 = 通过）。纯函数，反例直接拿它对变异源码跑。 */
function findResultLimitViolations(source: string): string[] {
  const description = extractLogsGrepDescription(source)
  if (description === null) {
    return ['定位不到 docker_logs_grep 的 description 字面量（守卫认不出形状就会恒绿）']
  }
  const violations: string[] = []
  if (!description.includes(REQUIRED_INTERPOLATION)) {
    violations.push([
      'docker_logs_grep 的 description 缺少插值 ' + REQUIRED_INTERPOLATION,
      '——返回行上限只能来自 src/docker.ts 的 MAX_RESULT_LINES，描述里别再写第二份',
    ].join(''))
  }
  const hardcoded = /（\s*\d+\s*）/u.exec(description)
  if (hardcoded !== null) {
    violations.push(
      'docker_logs_grep 的 description 里出现硬编码的数字上限 ' + hardcoded[0]
      + '——改 MAX_RESULT_LINES 时它不会跟着变（应改成插值 ' + REQUIRED_INTERPOLATION + '）',
    )
  }
  return violations
}

describe('docker_logs_grep 返回行上限：单一真相源（源码形状）', () => {
  it('src/index.ts 的 description 用 MAX_RESULT_LINES 插值，且没有括号数字字面量', () => {
    expect(findResultLimitViolations(INDEX_SOURCE)).toEqual([])
  })

  it('反例：把插值换回字面量 4000 → 判红并点名硬编码（运行时断言此时仍可能绿）', () => {
    const mutated = INDEX_SOURCE.replace(REQUIRED_INTERPOLATION, '4000')
    // 变异必须真的发生，否则下面那条断言是恒真的（fixture 漂了也看不出来）
    expect(mutated).not.toBe(INDEX_SOURCE)
    const violations = findResultLimitViolations(mutated)
    expect(violations.length).toBeGreaterThan(0)
    // 点名要具体：报的是「硬编码的数字上限」，且把那个数字带出来
    expect(violations.join('\n')).toContain('硬编码的数字上限')
    expect(violations.join('\n')).toContain('（4000）')
  })

  it('反例：去掉 String() 改写成 ${MAX_RESULT_LINES}（输出一样但形状不是约定的那条）→ 判红', () => {
    const mutated = INDEX_SOURCE.replace(REQUIRED_INTERPOLATION, '${MAX_RESULT_LINES}')
    expect(mutated).not.toBe(INDEX_SOURCE)
    expect(findResultLimitViolations(mutated)).not.toEqual([])
  })

  it('反例：源码里定位不到该工具（改名 / 删用例）→ 判红，不静默通过', () => {
    expect(findResultLimitViolations('export const unrelated = 1\n')).not.toEqual([])
  })
})
