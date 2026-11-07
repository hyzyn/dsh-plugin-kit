/**
 * 「交给 Agent」两个 pack 收尾句的**单一真相源**守卫（源码形状断言）。
 *
 * ## 要防的那次回归
 *
 * 2026-11-03 的排障闭环新增 `docker_diagnose`（一次采 inspect + logs + events + stats 并给判据），
 * 诊断 pack 的收尾句换上了它，日志片段 pack 还停在 `docker_logs` / `docker_inspect`——同一句
 * 「缺什么自己拉」在两个 pack 里各推荐一套工具，2026-11-06 用户拿投递出去的那段原文来问
 * 「这段需要优化吗」。这类漂移**运行时看不出来**：两处都只是把字符串推进数组，页面上一切正常，
 * 只有读源码才判得准。所以照 `result-limit-single-source.test.ts` 的办法做源码形状断言。
 *
 * ## 判据（`findFollowUpViolations`，纯函数，空数组 = 通过）
 *
 *   1. 收尾句在客户端半体里**只出现一次**——两个 builder 各写一句就是两份真相源；
 *   2. `askFollowUpLine` 点名四个只读工具，且 `docker_diagnose` 排在 `docker_logs_grep` **之前**
 *      ——「先拿判据、再按需翻日志」是这段措辞的全部价值；顺序反了就退回「一排并列的名字」；
 *   3. 两个 builder 都**调用** `askFollowUpLine`，不许自己拼；
 *   4. 旧的 `docker_logs` / `docker_inspect` 组合不许再回来。
 *
 * ## 为什么把判据写成纯函数 + 反例
 *
 * 本仓规矩：没有反例的守卫会在下一次改动里漂掉。判据接收源码字符串、返回违规清单，于是可以
 * 对**变异源码**跑同一份判据（日志 pack 改回旧措辞 / 工具名对调 / 少点名一个 / 抄成两份），
 * 反例都在内存字符串上做，**不修改任何受版本控制的文件**。
 *
 * ## 边界（刻意不做的）
 *
 * 只认「4 空格缩进的顶层函数 + 以 `\n    }` 收尾」这一形状：定位不到就**判红**，不静默通过
 * ——「匹配不到就算过」的闸门比没有更坏。
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const CLIENT_SOURCE = readFileSync(new URL('../client-src/index.js', import.meta.url), 'utf8')

/** 收尾句的开头：整份源码里只允许有一份（在 `askFollowUpLine` 里）。 */
const MARK = '需要更多上下文请自行拉取，不要臆测未给出的内容：'
/** 收尾句必须点名的四个只读工具（`docker_diagnose` 是 2026-11-03 新增的那条）。 */
const TOOLS = ['`docker_diagnose`', '`docker_logs_grep`', '`docker_inspect`', '`docker_top`'] as const
/** 旧的工具组合：留着它等于让日志 pack 回到「两条工具裸列」的旧措辞。 */
const STALE_PAIR = '`docker_logs` / `docker_inspect`'
/** 两个 pack 的 builder：它们必须都走 `askFollowUpLine`。 */
const BUILDERS = ['buildAskPrompt', 'buildDiagnosisPrompt'] as const

interface Slice {
  readonly start: number
  readonly text: string
}

/** 取一个顶层（4 空格缩进的）函数声明的源码片段；认不出形状返回 null，调用方据此判红。 */
function functionBodyOf(source: string, name: string): Slice | null {
  const start = source.indexOf('function ' + name + '(')
  if (start === -1) return null
  const close = source.indexOf('\n    }', start)
  if (close === -1) return null
  const end = close + '\n    }'.length
  return { start, text: source.slice(start, end) }
}

/** 把某段切片换成新文本，返回整份源码（反例用；不改磁盘上的文件）。 */
function replaceSlice(source: string, slice: Slice, text: string): string {
  return source.slice(0, slice.start) + text + source.slice(slice.start + slice.text.length)
}

/** 判据本体：返回违规清单（空数组 = 通过）。纯函数，反例直接拿它对变异源码跑。 */
export function findFollowUpViolations(source: string): string[] {
  const violations: string[] = []

  const copies = source.split(MARK).length - 1
  if (copies !== 1) {
    violations.push('「缺什么自己拉」收尾句出现了 ' + String(copies) + ' 份（应只在 askFollowUpLine 里一份）')
  }

  const helper = functionBodyOf(source, 'askFollowUpLine')
  if (helper === null) {
    violations.push('定位不到 askFollowUpLine（守卫认不出形状就会恒绿）')
  } else {
    for (const tool of TOOLS) {
      if (!helper.text.includes(tool)) violations.push('askFollowUpLine 没点名 ' + tool)
    }
    if (helper.text.includes(STALE_PAIR)) {
      violations.push('askFollowUpLine 还写着旧的 ' + STALE_PAIR + ' 组合')
    }
    const diagnoseAt = helper.text.indexOf('`docker_diagnose`')
    const grepAt = helper.text.indexOf('`docker_logs_grep`')
    if (diagnoseAt === -1 || grepAt === -1 || diagnoseAt > grepAt) {
      violations.push('askFollowUpLine 里 `docker_diagnose` 不在 `docker_logs_grep` 之前'
        + '（顺序就是「先拿判据、再翻日志」，对调等于退回一排并列的名字）')
    }
  }

  for (const name of BUILDERS) {
    const body = functionBodyOf(source, name)
    if (body === null) violations.push('定位不到 ' + name)
    else if (!body.text.includes('askFollowUpLine(')) {
      violations.push(name + ' 没走 askFollowUpLine（自己拼了一句 → 两个 pack 各一份真相源）')
    }
  }

  return violations
}

describe('「交给 Agent」收尾句：单一真相源 + 先诊断后翻日志（源码形状）', () => {
  it('两个 pack 共用 askFollowUpLine，且点名新的只读工具', () => {
    expect(findFollowUpViolations(CLIENT_SOURCE)).toEqual([])
  })

  it('反例：日志 pack 改回自己拼旧措辞（docker_logs / docker_inspect）→ 判红', () => {
    const body = functionBodyOf(CLIENT_SOURCE, 'buildAskPrompt')
    expect(body).not.toBeNull()
    const oldLine = "out.push('" + MARK + STALE_PAIR + "' + JSON.stringify(context.target))"
    const mutatedBody = (body as Slice).text.replace(/out\.push\(askFollowUpLine\([\s\S]*?\)\)/u, () => oldLine)
    // 变异必须真的发生，否则下面那条断言是恒真的（fixture 漂了也看不出来）
    expect(mutatedBody).not.toBe((body as Slice).text)
    const violations = findFollowUpViolations(replaceSlice(CLIENT_SOURCE, body as Slice, mutatedBody))
    expect(violations.length).toBeGreaterThan(0)
    expect(violations.join('\n')).toContain('buildAskPrompt 没走 askFollowUpLine')
  })

  it('反例：两个工具名对调（docker_logs_grep 排到前面）→ 判红并点明顺序', () => {
    const helper = functionBodyOf(CLIENT_SOURCE, 'askFollowUpLine')
    expect(helper).not.toBeNull()
    const swapped = (helper as Slice).text
      .replaceAll('`docker_diagnose`', '`TMP_SWAP`')
      .replaceAll('`docker_logs_grep`', '`docker_diagnose`')
      .replaceAll('`TMP_SWAP`', '`docker_logs_grep`')
    const violations = findFollowUpViolations(replaceSlice(CLIENT_SOURCE, helper as Slice, swapped))
    expect(violations.join('\n')).toContain('不在 `docker_logs_grep` 之前')
  })

  it('反例：去掉对 docker_diagnose 的点名 → 判红（新 API 不再出现在收尾句里）', () => {
    const helper = functionBodyOf(CLIENT_SOURCE, 'askFollowUpLine')
    expect(helper).not.toBeNull()
    const stripped = (helper as Slice).text.replaceAll('`docker_diagnose`', '`docker_ps`')
    expect(stripped).not.toBe((helper as Slice).text)
    const violations = findFollowUpViolations(replaceSlice(CLIENT_SOURCE, helper as Slice, stripped))
    expect(violations.join('\n')).toContain('没点名 `docker_diagnose`')
  })

  it('反例：把收尾句抄成两份 → 判红（两份真相源）', () => {
    const duplicated = CLIENT_SOURCE + "\n    out.push('" + MARK + "`docker_logs`')\n"
    const violations = findFollowUpViolations(duplicated)
    expect(violations.join('\n')).toContain('出现了 2 份')
  })

  it('反例：源码里定位不到 askFollowUpLine（改名 / 删了）→ 判红，不静默通过', () => {
    expect(findFollowUpViolations('export const unrelated = 1\n')).not.toEqual([])
  })
})
