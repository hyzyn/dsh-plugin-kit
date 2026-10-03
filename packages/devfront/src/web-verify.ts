/**
 * 前端验活断言（`docs/devdata-plan.md` §15.3 的「与 §3.9 同构」）。
 *
 * ## 为什么前端也要断言化，而不是让 agent 每次现编操作序列
 *
 * §15.3 把这条列为边界之一：agent 现编的序列**不可积累、不可复审**——
 * 这次验过了，下次换个人（或换个 agent）又从头编一遍，而且没人能review「它到底验了什么」。
 * 断言写进项目仓库之后，它随项目一起评审、一起演进。
 *
 * ## 与数据面断言库（§3.9）的关系：同构，但**判据不同**
 *
 * 同构的部分：项目内文本清单 + DSH 侧只读 + 缺省即无（fail-closed）+ 三态。
 *
 * 判据不同的部分，也是这个模块独立存在的理由：
 *
 * | | 数据面（§3.9） | 前端（本模块） |
 * |---|---|---|
 * | 观察对象 | 结果集（一列标量） | **页面**（文本 / DOM / console） |
 * | 典型判据 | `eq` / `gte` / `regex` / `rowCount` | 文本包含 / 元素存在 / 元素文本 |
 * | 特有的一档 | — | **console 无错**（发布后最常见的前端故障信号） |
 *
 * 所以预期算子不复用：把 `gte` / `rowCount` 搬到 DOM 上没有意义，而 `toContain` 搬到结果集上
 * 又要先决定「比第几列」，那是数据面已经解决过的问题。
 *
 * ## 一处**刻意不合并**的判断（写出来，免得下次有人顺手合并）
 *
 * 就绪判据（`devenv` 的 `env-ready.ts`，2026-10-02 从 `devdata` 迁出）与前端断言看着都能挂在「一个服务的页面」上，
 * 于是很容易想合并成一份清单。但两者的**时机与判据都不同**：
 *   - 就绪是**等待期**的判据（服务起来了吗），要 `unready` 这一档；
 *   - 断言是**验证期**的判据（起来之后页面对吗），不需要等待语义。
 * 合并会让「等就绪」与「验效果」用同一套码，于是「页面还没渲染完」会被报成「验证失败」——
 * 而那正是 §15.1 说的假阴性来源。
 *
 * 依据：`docs/devdata-plan.md` §15.1 / §15.2 / §15.3。
 */

import { readFileSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'

import yaml from 'js-yaml'

import { classifyConsoleMessages, summarizeConsole, type ConsoleMessage } from './console.js'

/** 预期算子。与数据面断言库**刻意不同**（见文件头那张表）。 */
export const WEB_EXPECT_OPERATORS = ['toContain', 'elementExists', 'elementText', 'consoleClean'] as const

/** 预期算子名。 */
export type WebExpectOperator = (typeof WEB_EXPECT_OPERATORS)[number]

/** 一条前端断言的预期。多个算子同时给出时是**合取**（AND）。 */
export interface WebExpect {
  /** 页面文本包含它（断言页面**真的渲染出了内容**）。 */
  toContain?: string
  /** 存在匹配该 CSS 选择器的元素。 */
  elementExists?: string
  /** 匹配该选择器的元素的文本。 */
  elementText?: { selector: string; toContain?: string; equals?: string }
  /**
   * console 里**没有本站错误**（`console.ts` 的 `error` 档）。
   *
   * 注意是「本站错误」而不是「没有任何 error」：真实站点的 console 里常驻噪声，
   * 按「一条 error 都不许有」判会让这一档永远红——那就是噪声淹掉信号。
   */
  consoleClean?: boolean
}

/** 一条前端断言。 */
export interface WebAssertion {
  id: string
  /** 项目名（由文件名推出，清单里写第二遍必须与它一致）。 */
  project: string
  /** 要验的页面 URL（必须落在目标声明的站点范围内——范围判据在 `page.ts`）。 */
  url: string
  /** 目标 `WebTarget.id`。 */
  target: string
  expect: WebExpect
  severity: 'fail' | 'warn'
  /** 现有噪声说明（照 `jenkins-release` 技能 §4 的口径）。 */
  note?: string
}

/** 一份前端验活清单。 */
export interface WebManifest {
  version: number
  project: string
  assertions: readonly WebAssertion[]
}

/** 加载结果。三种「读不到」分开——与数据面断言库同构。 */
export type WebManifestLoad =
  | { kind: 'no-manifest'; project: string }
  | { kind: 'unreadable'; project: string; message: string }
  | { kind: 'config-error'; project: string; errors: readonly WebConfigError[] }
  | { kind: 'ok'; manifest: WebManifest }

/** 一条配置错误。 */
export interface WebConfigError {
  path: string
  message: string
}

const ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/

/**
 * 校验一份已解析的前端清单。
 *
 * **一次报全部错误**（清单是给人改的）。与数据面断言库同样，判据在**加载时**抓：
 * 一条写错选择器的断言留到运行时，会表现为「元素不存在」——那看起来像**站点的问题**。
 */
export function validateWebManifest(project: string, data: unknown): { ok: true; manifest: WebManifest } | { ok: false; errors: WebConfigError[] } {
  const errors: WebConfigError[] = []
  const fail = (path: string, message: string): void => {
    errors.push({ path, message })
  }

  if (!isRecord(data)) {
    return { ok: false, errors: [{ path: '', message: '清单顶层必须是一个映射（mapping）' }] }
  }
  if (data.version !== 1) fail('version', `本模块只认 version: 1，拿到 ${JSON.stringify(data.version)}`)
  if (data.project !== project) {
    fail('project', `清单里的 project（${JSON.stringify(data.project)}）与文件名推出的项目（${JSON.stringify(project)}）不一致`)
  }

  const raw = data.assertions
  if (!Array.isArray(raw)) {
    fail('assertions', '`assertions` 必须是数组')
    return { ok: false, errors }
  }
  if (raw.length === 0) {
    fail('assertions', '`assertions` 是空的：要么删掉这份清单，要么把断言写上（空清单不该报绿）')
  }

  const seen = new Set<string>()
  raw.forEach((item, index) => {
    const at = `assertions[${String(index)}]`
    if (!isRecord(item)) {
      fail(at, '每一条断言必须是一个映射')
      return
    }

    const id = item.id
    if (typeof id !== 'string' || !ID_PATTERN.test(id)) {
      fail(`${at}.id`, `id 必须匹配 ${String(ID_PATTERN)}，拿到 ${JSON.stringify(id)}`)
    } else if (seen.has(id)) {
      fail(`${at}.id`, `id ${JSON.stringify(id)} 重复（报告里点名会指错）`)
    } else {
      seen.add(id)
    }

    if (typeof item.url !== 'string' || item.url.trim() === '') {
      fail(`${at}.url`, '必须是非空 URL')
    } else if (!isHttpUrl(item.url)) {
      fail(`${at}.url`, `必须是 http/https URL，拿到 ${JSON.stringify(item.url)}`)
    }

    if (typeof item.target !== 'string' || item.target.trim() === '') {
      fail(`${at}.target`, '必须是非空 WebTarget.id')
    }
    if (item.severity !== 'fail' && item.severity !== 'warn') {
      fail(`${at}.severity`, `必须是 fail / warn 之一，拿到 ${JSON.stringify(item.severity)}`)
    }

    validateExpect(item.expect, `${at}.expect`, fail)
  })

  return errors.length > 0 ? { ok: false, errors } : { ok: true, manifest: data as unknown as WebManifest }
}

/** 校验预期。 */
function validateExpect(value: unknown, path: string, fail: (path: string, message: string) => void): void {
  if (!isRecord(value)) {
    fail(path, '`expect` 必须是映射（至少给一个判据）')
    return
  }

  for (const key of Object.keys(value)) {
    if (!(WEB_EXPECT_OPERATORS as readonly string[]).includes(key)) {
      fail(`${path}.${key}`, `未知的期望算子；本模块认 ${WEB_EXPECT_OPERATORS.join(' / ')}——不认识的一律拒，不静默忽略`)
    }
  }

  const given = WEB_EXPECT_OPERATORS.filter((op) => value[op] !== undefined)
  if (given.length === 0) {
    fail(path, `至少给一个判据（${WEB_EXPECT_OPERATORS.join(' / ')}）——空 expect 的断言只会报绿`)
  }

  if (value.toContain !== undefined && (typeof value.toContain !== 'string' || value.toContain === '')) {
    fail(`${path}.toContain`, '必须是非空字符串')
  }

  if (value.elementExists !== undefined && (typeof value.elementExists !== 'string' || value.elementExists.trim() === '')) {
    fail(`${path}.elementExists`, '必须是非空 CSS 选择器')
  }

  if (value.consoleClean !== undefined && value.consoleClean !== true) {
    // 只支持 `true`：写成 `false` 是「要求页面**有** console 错误」，那不是一个验活判据。
    fail(`${path}.consoleClean`, `只支持 true（要求 console 里没有本站错误），拿到 ${JSON.stringify(value.consoleClean)}`)
  }

  if (value.elementText !== undefined) {
    const spec = value.elementText
    if (!isRecord(spec)) {
      fail(`${path}.elementText`, '必须是映射：`{ selector, toContain? / equals? }`')
      return
    }
    for (const key of Object.keys(spec)) {
      if (!['selector', 'toContain', 'equals'].includes(key)) {
        fail(`${path}.elementText.${key}`, '未知字段——不认识的一律拒')
      }
    }
    if (typeof spec.selector !== 'string' || spec.selector.trim() === '') {
      fail(`${path}.elementText.selector`, '必须是非空 CSS 选择器')
    }
    const hasContain = spec.toContain !== undefined
    const hasEquals = spec.equals !== undefined
    if (!hasContain && !hasEquals) {
      fail(`${path}.elementText`, '至少给 `toContain` 或 `equals`')
    }
    for (const [key, bound] of [
      ['toContain', spec.toContain],
      ['equals', spec.equals],
    ] as const) {
      if (bound !== undefined && typeof bound !== 'string') {
        fail(`${path}.elementText.${key}`, `必须是字符串，拿到 ${JSON.stringify(bound)}`)
      }
    }
    if (hasContain && hasEquals && spec.toContain !== spec.equals) {
      // `toContain: 'a'` + `equals: 'b'` 里若不互相包含，这条永远不可能通过。
      const contains = typeof spec.toContain === 'string' && typeof spec.equals === 'string' && spec.equals.includes(spec.toContain)
      if (!contains) {
        fail(`${path}.elementText`, `toContain 与 equals 同时给出且互相矛盾：equals 的结果必须包含 toContain（${JSON.stringify(spec.toContain)} ⊄ ${JSON.stringify(spec.equals)}）`)
      }
    }
  }
}

/** 是不是 http/https URL。 */
function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

/** 判断一个值是不是普通对象。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * 清单的文件名（唯一一处）：`<project>.yaml`。
 *
 * 必须与 `webManifestsIn` 的筛选口径**逐字一致**。两处不一致时 `loadWebManifest` 永远找不到
 * `webManifestsIn` 报出来的那份文件，表现为「明明有清单却报无断言」——
 * 而那正好命中「缺省即无」这条 fail-closed 判据的**假阴性**（看起来像设计使然，实际是 bug）。
 */
export function webManifestFileName(project: string): string {
  return `${project}.yaml`
}

/** 清单在项目里的相对路径：`web/<project>.yaml`。 */
export function webManifestRelativePath(project: string): string {
  return `web/${project}.yaml`
}

/** 从一批已列好的文件名里挑出前端清单（不读目录——保持可测）。 */
export function webManifestsIn(files: readonly string[]): Map<string, string> {
  const out = new Map<string, string>()
  for (const file of files) {
    if (!file.startsWith('web/') || !file.endsWith('.yaml')) continue
    const stem = file.slice('web/'.length, -'.yaml'.length)
    if (stem === '' || stem.includes('/')) continue
    out.set(stem, file)
  }
  return out
}

/** 加载选项。 */
export interface LoadWebManifestOptions {
  /** 找清单的根目录（按顺序找；多个根下都有会报歧义）。 */
  roots?: readonly string[]
}

/**
 * 从项目里读一份前端清单（**只读**）。
 *
 * YAML 用 `JSON_SCHEMA`：清单是配置数据，不是能求值的表达式（与数据面断言库同一口径）。
 */
export function loadWebManifest(project: string, options: LoadWebManifestOptions = {}): WebManifestLoad {
  const roots = options.roots ?? ['.']
  const hits: { file: string; text: string }[] = []

  for (const root of roots) {
    const dir = isAbsolute(root) ? root : resolve(root)
    const file = join(dir, 'web', webManifestFileName(project))
    try {
      hits.push({ file, text: readFileSync(file, 'utf8') })
    } catch (error) {
      if (isNotFound(error)) continue
      return { kind: 'unreadable', project, message: `读不到 ${file}：${error instanceof Error ? error.message : String(error)}` }
    }
  }

  if (hits.length === 0) return { kind: 'no-manifest', project }
  if (hits.length > 1) {
    return {
      kind: 'unreadable',
      project,
      message: `在多个根目录下都找到了 ${webManifestRelativePath(project)}：${hits.map((hit) => hit.file).join('、')}——两份清单是歧义，请只留一份`,
    }
  }

  const hit = hits[0] as { file: string; text: string }
  let data: unknown
  try {
    data = yaml.load(hit.text, { schema: yaml.JSON_SCHEMA })
  } catch (error) {
    return { kind: 'unreadable', project, message: `${hit.file} 的 YAML 语法错：${error instanceof Error ? error.message : String(error)}` }
  }
  if (data === undefined || data === null) {
    return { kind: 'config-error', project, errors: [{ path: '', message: `${hit.file} 是空的：要么写上断言，要么删掉它` }] }
  }

  const validated = validateWebManifest(project, data)
  return validated.ok ? { kind: 'ok', manifest: validated.manifest } : { kind: 'config-error', project, errors: validated.errors }
}

/** 区分「文件不存在」与「文件在但读不了」。 */
function isNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'ENOENT'
}

/* --------------------------------- 求值 --------------------------------- */

/** 断言求值的状态。 */
export type WebStatus = 'pass' | 'fail' | 'unknown'

/** got / expected 并排的一行。 */
export interface WebDiffLine {
  op: string
  expected: unknown
  got: unknown
  verdict: WebStatus
  note?: string
}

/** 一条断言的求值结果。 */
export interface WebAssertionResult {
  id: string
  url: string
  status: WebStatus
  severity: 'fail' | 'warn'
  message: string
  diff: WebDiffLine[]
}

/**
 * 一次页面的**观察**（由驱动取好）。
 *
 * 只放事实：文本、元素、console 消息。「对不对」是 `evaluateWebAssertion` 的事。
 */
export interface PageObservation {
  url: string
  /** 页面文本（去标签后的可见文本）。 */
  text?: string
  /** 选择器 → 命中数量 与 首个命中的文本。 */
  elements?: Readonly<Record<string, { count: number; text?: string }>>
  /** console 原始消息（分类由 `console.ts` 做）。 */
  console?: readonly ConsoleMessage[]
}

/** 求一条断言。 */
export function evaluateWebAssertion(input: { assertion: WebAssertion; observation: PageObservation }): WebAssertionResult {
  const { assertion, observation } = input
  const expect = assertion.expect
  const diff: WebDiffLine[] = []
  const unknown: string[] = []

  const base = (status: WebStatus, message: string): WebAssertionResult => ({
    id: assertion.id,
    url: assertion.url,
    status,
    severity: assertion.severity,
    message,
    diff,
  })

  if (expect.toContain !== undefined) {
    if (observation.text === undefined) {
      diff.push({ op: 'toContain', expected: expect.toContain, got: undefined, verdict: 'unknown', note: '没取到页面文本' })
      unknown.push('没取到页面文本')
    } else if (observation.text.includes(expect.toContain)) {
      diff.push({ op: 'toContain', expected: expect.toContain, got: '已包含', verdict: 'pass' })
    } else {
      // got 只给摘要：整页文本可能几万字符，塞进报告反而看不清。
      diff.push({
        op: 'toContain',
        expected: expect.toContain,
        got: `未包含（页面文本 ${String(observation.text.length)} 字符）`,
        verdict: 'fail',
      })
    }
  }

  if (expect.elementExists !== undefined) {
    const found = observation.elements?.[expect.elementExists]
    if (found === undefined) {
      diff.push({
        op: 'elementExists',
        expected: expect.elementExists,
        got: undefined,
        verdict: 'unknown',
        note: '这次观察没带这个选择器的结果（观察层应当把所有声明的选择器都取一遍）',
      })
      unknown.push(`${expect.elementExists} 的观察结果缺失`)
    } else if (found.count > 0) {
      diff.push({ op: 'elementExists', expected: expect.elementExists, got: `命中 ${String(found.count)} 个`, verdict: 'pass' })
    } else {
      diff.push({ op: 'elementExists', expected: expect.elementExists, got: '命中 0 个', verdict: 'fail' })
    }
  }

  if (expect.elementText !== undefined) {
    const spec = expect.elementText
    const found = observation.elements?.[spec.selector]
    if (found === undefined) {
      diff.push({
        op: 'elementText',
        expected: spec,
        got: undefined,
        verdict: 'unknown',
        note: `${spec.selector} 的观察结果缺失`,
      })
      unknown.push(`${spec.selector} 的观察结果缺失`)
    } else if (found.count === 0) {
      diff.push({ op: 'elementText', expected: spec, got: '元素不存在', verdict: 'fail' })
    } else if (found.text === undefined) {
      diff.push({ op: 'elementText', expected: spec, got: undefined, verdict: 'unknown', note: '观察层没带元素文本' })
      unknown.push(`${spec.selector} 没取到文本`)
    } else {
      const lines: string[] = []
      let ok = true
      if (spec.toContain !== undefined && !found.text.includes(spec.toContain)) {
        ok = false
        lines.push(`期望包含 ${JSON.stringify(spec.toContain)}`)
      }
      if (spec.equals !== undefined && found.text !== spec.equals) {
        ok = false
        lines.push(`期望等于 ${JSON.stringify(spec.equals)}`)
      }
      diff.push({ op: 'elementText', expected: spec, got: found.text, verdict: ok ? 'pass' : 'fail', ...(ok ? {} : { note: lines.join('；') }) })
    }
  }

  if (expect.consoleClean === true) {
    if (observation.console === undefined) {
      diff.push({ op: 'consoleClean', expected: true, got: undefined, verdict: 'unknown', note: '没取到 console 消息' })
      unknown.push('没取到 console 消息')
    } else {
      const summary = summarizeConsole(classifyConsoleMessages(observation.console))
      if (summary.errors.length > 0) {
        diff.push({
          op: 'consoleClean',
          expected: true,
          got: `${String(summary.errors.length)} 条本站错误`,
          verdict: 'fail',
          note: summary.errors.map((finding) => finding.message.text).join(' | '),
        })
      } else {
        // 噪声与告警都留着（报告里要能看出「一共多少条、其中多少是噪声」）——
        // 那是判断「这条判据是不是定得太松」的唯一依据。
        diff.push({
          op: 'consoleClean',
          expected: true,
          got: '没有本站错误',
          verdict: 'pass',
          note: `另有 ${String(summary.warnings.length)} 条告警、${String(summary.noise.length)} 条噪声（已按噪声规则排除）`,
        })
      }
    }
  }

  const failed = diff.filter((line) => line.verdict === 'fail')
  if (failed.length > 0) {
    return base('fail', failed.map((line) => `${line.op}：期望 ${JSON.stringify(line.expected)}，实际 ${JSON.stringify(line.got)}`).join('；'))
  }
  if (diff.some((line) => line.verdict === 'unknown')) {
    return base('unknown', `验不了：${unknown.join('；')}`)
  }
  return base('pass', `全部判据通过（${String(diff.length)} 项）`)
}

/** 一批断言的汇总。 */
export interface WebAssertionSummary {
  total: number
  passed: number
  failed: number
  warned: number
  unknown: number
  overall: 'pass' | 'fail' | 'warn' | 'unknown'
}

/** 汇总一批前端断言结果（口径与数据面断言库一致）。 */
export function summarizeWebResults(results: readonly WebAssertionResult[]): WebAssertionSummary {
  const bucketOf = (result: WebAssertionResult): 'pass' | 'fail' | 'warn' | 'unknown' => {
    if (result.status === 'unknown') return 'unknown'
    if (result.status === 'pass') return 'pass'
    return result.severity === 'warn' ? 'warn' : 'fail'
  }
  const buckets = results.map(bucketOf)
  const overall: WebAssertionSummary['overall'] = buckets.includes('fail')
    ? 'fail'
    : buckets.includes('warn')
      ? 'warn'
      : buckets.includes('unknown')
        ? 'unknown'
        : 'pass'
  return {
    total: results.length,
    passed: buckets.filter((bucket) => bucket === 'pass').length,
    failed: buckets.filter((bucket) => bucket === 'fail').length,
    warned: buckets.filter((bucket) => bucket === 'warn').length,
    unknown: buckets.filter((bucket) => bucket === 'unknown').length,
    overall,
  }
}

/**
 * 一份断言需要页面提供哪些选择器的观察结果。
 *
 * 给驱动用：它照着这份清单一次把该取的都取回来（**一次拿全**，不是 N 轮对话——
 * 与数据面断言库的第 3 条约束同源）。
 */
export function selectorsNeeded(assertions: readonly WebAssertion[]): string[] {
  const out = new Set<string>()
  for (const assertion of assertions) {
    if (assertion.expect.elementExists !== undefined) out.add(assertion.expect.elementExists)
    if (assertion.expect.elementText !== undefined) out.add(assertion.expect.elementText.selector)
  }
  return [...out]
}
