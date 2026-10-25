/**
 * 插件公告长度守卫的**用例**——测量与判据在 [scripts/announcement-budget.mjs](../announcement-budget.mjs)，
 * 本文件只负责「对真实仓库跑一遍」与「反例必须判红」。
 *
 * 为什么测量搬走了（2026-10-25）：`pnpm disclosure-report`（[scripts/disclosure-report.mjs](../disclosure-report.mjs)）
 * 要把公告长度摊进报告，而这份测量原先只住在本文件里——留在原地，报告就只能复制一份测量逻辑
 * （同一事实两份全文 = 本仓明确定义的债）。所以测量与判定搬进模块，**判据一字未改**，
 * fixture / 反例 / 断言留在这里：测试的事归测试。
 *
 * ## 一、守什么
 *
 * 8 段公告（`TTY_GUIDANCE` / `ENV_GUIDANCE` / `MCP_GUIDANCE` / `PROMPT_GUIDANCE` /
 * `PROFILE_GUIDANCE` / `CODEGRAPH_GUIDANCE` / `LOGLENS_GUIDANCE` / `DOCKER_GUIDANCE`）每一段都由
 * `registerLiteralSection(...)` 注入 systemPrompt，**每一轮请求都在上下文里**。所以它们的
 * 长度不是「代码风格」，而是**每轮都要付一次的上下文成本**：历史上 tty 那段涨到过 579 字符，
 * 其余四段 421 / 340 / 306 / 268——五段加起来是一段不产生任何新能力的固定开销。
 *
 * 本文件钉两条（判据实现在模块里）：
 *
 * 1. **长度**：每段公告的静态拼接长度 ≤ `ANNOUNCEMENT_BUDGET`（250 字符）；
 * 2. **命中**：8 段必须**真的都被抽到**（数量 + 名字集合都断言）。少了这条，一个「扫描面为空
 *    的实现」会恒绿——本仓把「恒绿闸门」明确列在事故形状里（见 `docs/conventions.md` 的守卫
 *    纪律，以及 `scripts/check-test-collection.mjs` 文件头记的那次实测）。
 *
 * ## 二、为什么这么判（静态抽取，而不是跑一遍宿主）
 *
 * 判据与代价写在模块文件头（`scripts/announcement-budget.mjs` § 二），这里不复述——**判据只有
 * 一处正文**。一句话：右值按「`+` 链」解析、字面量按 JS 语义还原、`+` 链之外一律弃权。
 *
 * ## 三、反例长什么样（没有反例的守卫会在下一次改动里漂掉）
 *
 * 反例一律用 `mkdtempSync(join(tmpdir(), ...))` 造**最小 fixture 仓库树**
 * （`packages/<pkg>/src/index.ts`），**不修改任何受版本控制的文件**，`afterEach` 里
 * `rmSync(..., { recursive: true, force: true })` 清掉：
 *
 *   - 300 字符的 `FOO_GUIDANCE` → 判红（点名、长度、预算、`file:line`）；
 *   - 恰好 250 字符 → 绿（预算是 `≤`，边界要能过）；
 *   - 多行 `+` 链（每段 150、总和 300）→ 红（**拼接后**再量）；
 *   - 无插值模板字面量 300 字符 → 红；
 *   - 函数调用 / 标识符引用 / import 值 / 插值模板 → 弃权（不误报）；
 *   - 扫描面为空（没有 `packages/`）→ 红（不是恒绿）。
 *
 * ⚠️ 反例里的 300 字符必须是**写进源码的字面量**（下面 `longLiteral(300)` 生成 300 个 `x`），
 * 不能写成 `'x'.repeat(300)`：`.repeat(...)` 是**函数调用形态**，按判据它属于「弃权」，
 * 判红的是「长度超预算」而不是「弃权」。任务书里写的 `'x'.repeat(300)` 形态指的是「300 字符的
 * 常量」，参考写法见 `scripts/test/check-prompt-sections.test.ts` 的 `longLiteral`。
 *
 * ## 四、边界（刻意不做的）
 *
 *   - **名单固定 8 个**：仓里还有 `SEARCH_GUIDANCE` 等同类常量，但它们不在
 *     本守卫的名单里；抽取按名字过滤，所以加一个新公告要**先往表里加名字**（这也是一道闸：
 *     新公告不会被悄悄带进来）。
 *   - **只扫 `src`**：`packages/<pkg>/lib` 是入库的预构建产物，同一段常量在那儿还有一份，扫了
 *     会把命中数算成两倍。
 *   - **不做运行时验证**：公告真的被注入、注入后是否截断，属于宿主与 kit 的运行时时序，由
 *     `packages/*​/test/` 的用例与真机脚本负责；这里只回答「源码里这段有多长」。
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, afterEach } from 'vitest'
import {
  ANNOUNCEMENT_BUDGET,
  ANNOUNCEMENT_NAMES,
  ANNOUNCEMENT_PACKAGES,
  checkAnnouncementRoster,
  findAnnouncementBudgetViolations,
  measureAnnouncements,
} from '../announcement-budget.mjs'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

/* ------------------------------------------------------------------ *
 * fixture：最小仓库树（不碰任何受版本控制的文件）
 * ------------------------------------------------------------------ */

const fixtureRoots: string[] = []

afterEach(() => {
  for (const root of fixtureRoots.splice(0)) rmSync(root, { recursive: true, force: true })
})

/** 造一棵最小 fixture 仓库树：键是仓库相对路径，值是文件内容。 */
function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'dsh-announcement-budget-'))
  fixtureRoots.push(root)
  for (const [rel, content] of Object.entries(files)) {
    const full = join(root, rel)
    mkdirSync(dirname(full), { recursive: true })
    writeFileSync(full, content)
  }
  return root
}

/**
 * N 个字符的单引号字面量**源码**（反例用；内容无所谓，长度才是判据）。
 *
 * 注意它是「写成 N 个 x 的字面量」，不是 `'x'.repeat(N)`——后者是函数调用形态，按判据会弃权。
 */
function longLiteral(chars: number): string {
  return `'${'x'.repeat(chars)}'`
}

/* ------------------------------------------------------------------ *
 * 真实仓库
 * ------------------------------------------------------------------ */

describe('真实仓库 · 8 段插件公告', () => {
  it('预算钉在 250 字符（放宽预算 = 拆掉这道闸）', () => {
    expect(ANNOUNCEMENT_BUDGET).toBe(250)
  })

  it('8 段公告全部被抽到（数量 + 名字集合都断言，防「扫描面为空 = 恒绿」）', () => {
    const measured = measureAnnouncements(REPO_ROOT)
    expect(measured).toHaveLength(ANNOUNCEMENT_NAMES.length)
    expect(measured.map((measurement) => measurement.name).sort()).toEqual([...ANNOUNCEMENT_NAMES].sort())
    // 抽到但量不出长度 = 判据弃权 = 对那段公告恒绿，同样要红
    expect(checkAnnouncementRoster(REPO_ROOT)).toEqual([])
  })

  it('每段公告都在它自己的包里（别处的同名文本不算数）', () => {
    const located = measureAnnouncements(REPO_ROOT).map((measurement) => `${measurement.name}@${measurement.pkg}`)
    const expected = ANNOUNCEMENT_NAMES.map((name) => `${name}@${ANNOUNCEMENT_PACKAGES[name]}`)
    expect(located.sort()).toEqual(expected.sort())
  })

  it('每段公告的静态长度都不超过预算', () => {
    // 失败时会逐条打印「名字（file:line）：N 字符，超过预算 250」——8 段全量可读
    expect(findAnnouncementBudgetViolations(REPO_ROOT)).toEqual([])
  })
})

/* ------------------------------------------------------------------ *
 * 反例：超预算必须判红
 * ------------------------------------------------------------------ */

describe('反例：公告涨回超预算必须判红（fixture 树）', () => {
  it('300 字符的公告常量 → 判红，并点名长度、预算与位置', () => {
    const root = fixture({
      'packages/x/src/index.ts': `export const FOO_GUIDANCE = ${longLiteral(300)}\n`,
    })
    const violations = findAnnouncementBudgetViolations(root, ['FOO_GUIDANCE'])
    expect(violations).toHaveLength(1)
    expect(violations[0]).toContain('FOO_GUIDANCE')
    expect(violations[0]).toContain('300')
    expect(violations[0]).toContain(String(ANNOUNCEMENT_BUDGET))
    expect(violations[0]).toContain('packages/x/src/index.ts:1')
  })

  it('恰好 250 字符 → 绿（预算是 ≤，边界要能过）', () => {
    const root = fixture({
      'packages/x/src/index.ts': `const FOO_GUIDANCE = ${longLiteral(250)}\n`,
    })
    expect(findAnnouncementBudgetViolations(root, ['FOO_GUIDANCE'])).toEqual([])
    expect(measureAnnouncements(root, ['FOO_GUIDANCE'])[0].length).toBe(250)
  })

  it('多行 + 链要拼起来量：每段 150、总和 300 → 红（TTY 那段的真实形状）', () => {
    const root = fixture({
      'packages/x/src/index.ts': [
        'const FOO_GUIDANCE =',
        `  ${longLiteral(150)}`,
        `  + ${longLiteral(150)}`,
        '',
      ].join('\n'),
    })
    const violations = findAnnouncementBudgetViolations(root, ['FOO_GUIDANCE'])
    expect(violations).toHaveLength(1)
    expect(violations[0]).toContain('300')
  })

  it('无插值的模板字面量同样量：300 字符 → 红', () => {
    const root = fixture({
      'packages/x/src/index.ts': 'const FOO_GUIDANCE = `' + 'x'.repeat(300) + '`\n',
    })
    expect(findAnnouncementBudgetViolations(root, ['FOO_GUIDANCE'])).toHaveLength(1)
  })

  it('src/ 子目录里也要扫到（递归）', () => {
    const root = fixture({
      'packages/x/src/nested/deep.ts': `const FOO_GUIDANCE = ${longLiteral(300)}\n`,
    })
    expect(findAnnouncementBudgetViolations(root, ['FOO_GUIDANCE'])).toHaveLength(1)
  })
})

/* ------------------------------------------------------------------ *
 * 反例：量不出来的形态弃权（不误报）
 * ------------------------------------------------------------------ */

describe('反例：+ 链之外的形态弃权，不误报', () => {
  it('函数调用 / 标识符引用 / import 值 / 插值模板 → 弃权；纯字面量照量', () => {
    const root = fixture({
      'packages/x/src/index.ts': [
        `import { IMPORTED } from './guidance.js'`,
        `const CALL_GUIDANCE = build('x'.repeat(300))`,
        `const REPEAT_GUIDANCE = 'x'.repeat(300)`,
        `const IDENT_GUIDANCE = SOME_GUIDANCE`,
        `const TWICE_GUIDANCE = A_GUIDANCE + B_GUIDANCE`,
        'const TEMPLATE_GUIDANCE = `' + '${' + 'value}}' + '`',
        `const SHORT_GUIDANCE = 'ok'`,
        `const IMPORT_GUIDANCE = IMPORTED + 'x'`,
      ].join('\n'),
    })
    const names = [
      'CALL_GUIDANCE',
      'REPEAT_GUIDANCE',
      'IDENT_GUIDANCE',
      'TWICE_GUIDANCE',
      'TEMPLATE_GUIDANCE',
      'SHORT_GUIDANCE',
      'IMPORT_GUIDANCE',
    ]
    // 弃权 = 不进违规列表（它由 kit 的运行时兜底；静态这边不猜长度）
    expect(findAnnouncementBudgetViolations(root, names)).toEqual([])
    const lengths = new Map(measureAnnouncements(root, names).map((measurement) => [measurement.name, measurement.length]))
    // 名单里的每一条都**抽到了**（区别于「没抽到」），只是其中六条量不出来
    expect([...lengths.keys()].sort()).toEqual([...names].sort())
    for (const name of names.filter((candidate) => candidate !== 'SHORT_GUIDANCE')) {
      expect(lengths.get(name)).toBeNull()
    }
    expect(lengths.get('SHORT_GUIDANCE')).toBe(2)
  })
})

/* ------------------------------------------------------------------ *
 * 反例：扫描面为空 / 名单对不上时必须红
 * ------------------------------------------------------------------ */

describe('反例：命中为 0 时必须红（恒绿闸门）', () => {
  it('一个包都没有（连 packages/ 都不存在）→ 判红，不是静默通过', () => {
    const root = fixture({ 'README.md': '# 空仓\n' })
    expect(findAnnouncementBudgetViolations(root, ['FOO_GUIDANCE']).join('\n')).toContain('扫描面为空')
  })

  it('包在、但公告抽不到 → 名单判红（数量/名字集合就是为此存在）', () => {
    const root = fixture({ 'packages/x/src/index.ts': 'const UNRELATED = 1\n' })
    const problems = checkAnnouncementRoster(root, ['FOO_GUIDANCE'])
    expect(problems.join('\n')).toContain('FOO_GUIDANCE')
    expect(problems.join('\n')).toContain('没抽到')
  })

  it('同名声明两处 → 名单判红（一段公告只该有一个声明）', () => {
    const root = fixture({
      'packages/x/src/index.ts': [`const FOO_GUIDANCE = 'a'`, `const FOO_GUIDANCE = 'b'`].join('\n'),
    })
    expect(checkAnnouncementRoster(root, ['FOO_GUIDANCE']).join('\n')).toContain('抽到 2 处')
  })
})
