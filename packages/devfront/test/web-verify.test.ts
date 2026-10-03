/**
 * 前端验活断言测试（`docs/devdata-plan.md` §15.3）。
 *
 * 重点与数据面断言库同源，但有一处是这一层特有的：**console 判据不能按「一条 error 都不许有」来写**。
 * 真实站点的 console 里常驻噪声，那样写会让这一档永远红——而「永远红」等于「没人看」。
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  WEB_EXPECT_OPERATORS,
  evaluateWebAssertion,
  loadWebManifest,
  selectorsNeeded,
  summarizeWebResults,
  validateWebManifest,
  webManifestRelativePath,
  webManifestsIn,
  type ConsoleMessage,
  type PageObservation,
  type WebAssertion,
} from '../src/index.js'

const PROJECT = 'cdqas'
const URL_ = 'https://cdqas.example.com/order/list'

/** 造一条断言。 */
function assertion(overrides: Partial<WebAssertion> = {}): WebAssertion {
  return {
    id: 'a1',
    project: PROJECT,
    url: URL_,
    target: 'w-cdqas',
    expect: { toContain: '订单编号' },
    severity: 'fail',
    ...overrides,
  }
}

/** 造一次观察。 */
function observation(overrides: Partial<PageObservation> = {}): PageObservation {
  return { url: URL_, text: '订单编号 CDQ-2026-001', ...overrides }
}

describe('预期算子：与数据面断言库**刻意不同**', () => {
  it('用的是页面判据，不是结果集判据', () => {
    expect([...WEB_EXPECT_OPERATORS].sort()).toEqual(['consoleClean', 'elementExists', 'elementText', 'toContain'])
    // `gte` / `rowCount` 搬到 DOM 上没有意义；这条断言防止有人「顺手统一」两套算子。
    for (const op of ['gte', 'lte', 'rowCount', 'eq', 'regex']) {
      expect(WEB_EXPECT_OPERATORS as readonly string[], op).not.toContain(op)
    }
  })
})

describe('toContain', () => {
  it('包含 → pass；不包含 → fail，且 got 只给摘要（整页文本可能几万字符）', () => {
    expect(evaluateWebAssertion({ assertion: assertion(), observation: observation() }).status).toBe('pass')

    const failed = evaluateWebAssertion({ assertion: assertion(), observation: observation({ text: '别的内容' }) })
    expect(failed.status).toBe('fail')
    expect(String(failed.diff[0]?.got)).toContain('4 字符')
  })

  it('没取到页面文本 → unknown（不是 fail：那是「没观测到」）', () => {
    const result = evaluateWebAssertion({ assertion: assertion(), observation: observation({ text: undefined }) })
    expect(result.status).toBe('unknown')
    expect(result.message).toContain('没取到页面文本')
  })
})

describe('elementExists / elementText', () => {
  it('命中 → pass；命中 0 个 → fail', () => {
    const exists = assertion({ expect: { elementExists: '#order-table' } })
    expect(evaluateWebAssertion({ assertion: exists, observation: observation({ elements: { '#order-table': { count: 1 } } }) }).status).toBe('pass')
    const missing = evaluateWebAssertion({ assertion: exists, observation: observation({ elements: { '#order-table': { count: 0 } } }) })
    expect(missing.status).toBe('fail')
    expect(String(missing.diff[0]?.got)).toContain('0 个')
  })

  it('**观察结果缺失 → unknown**（不是 fail：那是观察层没取，不是页面没有）', () => {
    // 失败意味着：「没去取」被报成「页面上没有」，agent 会去查站点。
    const result = evaluateWebAssertion({ assertion: assertion({ expect: { elementExists: '#x' } }), observation: observation() })
    expect(result.status).toBe('unknown')
    expect(result.message).toContain('观察结果缺失')
  })

  it('elementText 的 toContain / equals 都能判', () => {
    const obs = observation({ elements: { '#total': { count: 1, text: '合计 1,234.00' } } })
    expect(evaluateWebAssertion({ assertion: assertion({ expect: { elementText: { selector: '#total', toContain: '1,234' } } }), observation: obs }).status).toBe('pass')
    expect(evaluateWebAssertion({ assertion: assertion({ expect: { elementText: { selector: '#total', equals: '合计 1,234.00' } } }), observation: obs }).status).toBe('pass')
    expect(evaluateWebAssertion({ assertion: assertion({ expect: { elementText: { selector: '#total', equals: '不对' } } }), observation: obs }).status).toBe('fail')
  })

  it('元素存在但没取到文本 → unknown', () => {
    const result = evaluateWebAssertion({
      assertion: assertion({ expect: { elementText: { selector: '#t', toContain: 'x' } } }),
      observation: observation({ elements: { '#t': { count: 1 } } }),
    })
    expect(result.status).toBe('unknown')
  })

  it('元素不存在 → fail（这条是明确的否证，不是缺证）', () => {
    const result = evaluateWebAssertion({
      assertion: assertion({ expect: { elementText: { selector: '#t', toContain: 'x' } } }),
      observation: observation({ elements: { '#t': { count: 0 } } }),
    })
    expect(result.status).toBe('fail')
    expect(String(result.diff[0]?.got)).toContain('元素不存在')
  })
})

describe('consoleClean：**是「没有本站错误」，不是「一条 error 都不许有」**', () => {
  /** 本站错误。 */
  const ownError: ConsoleMessage = { level: 'error', text: 'boom', sourceUrl: 'https://cdqas.example.com/a.js', pageUrl: URL_ }
  /** 常驻噪声。 */
  const noise: ConsoleMessage = { level: 'error', text: 'Failed to load favicon.ico', status: 404 }
  /** 异源错误。 */
  const foreign: ConsoleMessage = { level: 'error', text: 'third party', sourceUrl: 'https://cdn.x.com/a.js', pageUrl: URL_ }

  const clean = assertion({ expect: { consoleClean: true } })

  it('只有噪声 → pass（否则这一档永远红，等于没人看）', () => {
    const result = evaluateWebAssertion({ assertion: clean, observation: observation({ console: [noise] }) })
    expect(result.status).toBe('pass')
    // 噪声数量要留在报告里：它是判断「这条判据是不是定得太松」的唯一依据。
    expect(String(result.diff[0]?.note)).toContain('噪声')
  })

  it('有本站错误 → fail，并把消息正文带上', () => {
    const result = evaluateWebAssertion({ assertion: clean, observation: observation({ console: [ownError] }) })
    expect(result.status).toBe('fail')
    expect(String(result.diff[0]?.note)).toContain('boom')
  })

  it('异源错误不算本站错误（但会在告警里计数）', () => {
    const result = evaluateWebAssertion({ assertion: clean, observation: observation({ console: [foreign] }) })
    expect(result.status).toBe('pass')
    expect(String(result.diff[0]?.note)).toContain('告警')
  })

  it('没取到 console → unknown', () => {
    const result = evaluateWebAssertion({ assertion: clean, observation: observation({ console: undefined }) })
    expect(result.status).toBe('unknown')
  })
})

describe('多算子合取与汇总', () => {
  it('一个 fail 就整条 fail', () => {
    const result = evaluateWebAssertion({
      assertion: assertion({ expect: { toContain: '订单', elementExists: '#nope' } }),
      observation: observation({ elements: { '#nope': { count: 0 } } }),
    })
    expect(result.status).toBe('fail')
    expect(result.diff.map((line) => line.verdict)).toEqual(['pass', 'fail'])
  })

  it('有 unknown 而没有 fail → 整条 unknown', () => {
    const result = evaluateWebAssertion({
      assertion: assertion({ expect: { toContain: '订单', elementExists: '#missing' } }),
      observation: observation(),
    })
    expect(result.status).toBe('unknown')
  })

  it('汇总口径与数据面断言库一致（fail > warn > unknown > pass）', () => {
    const results = [
      { id: '1', url: URL_, status: 'pass' as const, severity: 'fail' as const, message: '', diff: [] },
      { id: '2', url: URL_, status: 'fail' as const, severity: 'warn' as const, message: '', diff: [] },
      { id: '3', url: URL_, status: 'unknown' as const, severity: 'fail' as const, message: '', diff: [] },
    ]
    expect(summarizeWebResults(results)).toMatchObject({ total: 3, passed: 1, warned: 1, unknown: 1, overall: 'warn' })
  })

  it('有 unknown 就不报 pass', () => {
    expect(
      summarizeWebResults([{ id: '1', url: URL_, status: 'unknown', severity: 'fail', message: '', diff: [] }]).overall,
    ).toBe('unknown')
  })
})

describe('一次拿全：需要哪些选择器', () => {
  it('去重后给出全部声明过的选择器（驱动照着一次取回）', () => {
    const needed = selectorsNeeded([
      assertion({ expect: { elementExists: '#a' } }),
      assertion({ expect: { elementText: { selector: '#b', toContain: 'x' } } }),
      assertion({ expect: { elementExists: '#a', toContain: 'y' } }),
    ])
    expect([...needed].sort()).toEqual(['#a', '#b'])
  })
})

describe('清单校验', () => {
  function fixture(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      version: 1,
      project: PROJECT,
      assertions: [{ id: 'order-list', url: URL_, target: 'w-cdqas', expect: { toContain: '订单' }, severity: 'fail' }],
      ...overrides,
    }
  }

  function pathsOf(data: unknown): string[] {
    const result = validateWebManifest(PROJECT, data)
    expect(result.ok, '期望被拒但通过了').toBe(false)
    return result.ok ? [] : result.errors.map((error) => error.path)
  }

  it('合法清单通过', () => {
    expect(validateWebManifest(PROJECT, fixture()).ok).toBe(true)
  })

  it('version / project / 空 assertions 与数据面断言库同判据', () => {
    expect(pathsOf(fixture({ version: 2 }))).toContain('version')
    expect(pathsOf(fixture({ project: 'ems' }))).toContain('project')
    expect(pathsOf(fixture({ assertions: [] }))).toContain('assertions')
  })

  it('url 必须是 http/https（拒 ftp / 相对路径）', () => {
    for (const url of ['ftp://a.com/', '/order', 'not a url', '']) {
      expect(pathsOf(fixture({ assertions: [{ id: 'x', url, target: 't', expect: { toContain: 'a' }, severity: 'fail' }] })), String(url)).toContain(
        'assertions[0].url',
      )
    }
  })

  it('未知算子一律拒（不静默忽略）', () => {
    const errors = validateWebManifest(PROJECT, fixture({ assertions: [{ id: 'x', url: URL_, target: 't', expect: { gte: 1 }, severity: 'fail' }] }))
    expect(errors.ok).toBe(false)
    expect(errors.ok === false && errors.errors.some((error) => error.message.includes('未知的期望算子'))).toBe(true)
  })

  it('空 expect → 拒', () => {
    expect(pathsOf(fixture({ assertions: [{ id: 'x', url: URL_, target: 't', expect: {}, severity: 'fail' }] }))).toContain('assertions[0].expect')
  })

  it('consoleClean 只支持 true（`false` 是「要求页面有错误」，不是验活判据）', () => {
    expect(pathsOf(fixture({ assertions: [{ id: 'x', url: URL_, target: 't', expect: { consoleClean: false }, severity: 'fail' }] }))).toContain(
      'assertions[0].expect.consoleClean',
    )
  })

  it('elementText 必须给 selector，且至少给一个判据', () => {
    const manifest = (elementText: unknown) =>
      fixture({ assertions: [{ id: 'x', url: URL_, target: 't', expect: { elementText }, severity: 'fail' }] })
    // 缺 selector：拒。
    expect(pathsOf(manifest({ toContain: 'a' }))).toContain('assertions[0].expect.elementText.selector')
    // 有 selector 但没有任何判据：拒（只判存在要用 elementExists）。
    expect(pathsOf(manifest({ selector: '#a' }))).toContain('assertions[0].expect.elementText')
    // 齐了：通过——这条**不能**用 `pathsOf`（它断言的是「被拒」）。
    expect(validateWebManifest(PROJECT, manifest({ selector: '#a', toContain: 'x' })).ok).toBe(true)
  })

  it('elementText 的 toContain 与 equals 互相矛盾 → 拒（它永远不可能通过）', () => {
    expect(
      pathsOf(fixture({ assertions: [{ id: 'x', url: URL_, target: 't', expect: { elementText: { selector: '#a', toContain: 'zz', equals: 'abc' } }, severity: 'fail' }] })),
    ).toContain('assertions[0].expect.elementText')
  })

  it('id 重复 → 拒', () => {
    const one = { id: 'x', url: URL_, target: 't', expect: { toContain: 'a' }, severity: 'fail' }
    expect(pathsOf(fixture({ assertions: [one, { ...one }] }))).toContain('assertions[1].id')
  })
})

describe('清单：文件名与加载（只读）', () => {
  const dirs: string[] = []

  function projectDir(files: Record<string, string>): string {
    const dir = mkdtempSync(join(tmpdir(), 'devfront-web-'))
    dirs.push(dir)
    for (const [relative, content] of Object.entries(files)) {
      const target = join(dir, relative)
      mkdirSync(join(target, '..'), { recursive: true })
      writeFileSync(target, content)
    }
    return dir
  }

  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
  })

  const YAML = `version: 1
project: cdqas
assertions:
  - id: order-list
    url: https://cdqas.example.com/order/list
    target: w-cdqas
    expect:
      toContain: 订单编号
      consoleClean: true
    severity: fail
`

  it('路径唯一一处：web/<project>.yaml', () => {
    expect(webManifestRelativePath('cdqas')).toBe('web/cdqas.yaml')
  })

  it('从文件名里挑清单（只认 web/*.yaml）', () => {
    const found = webManifestsIn(['web/cdqas.yaml', 'web/ems.yaml', 'verify/cdqas.yaml', 'web/nested/x.yaml', 'web/a.yml'])
    expect([...found.keys()].sort()).toEqual(['cdqas', 'ems'])
  })

  it('读到合法清单 → ok', () => {
    const dir = projectDir({ 'web/cdqas.yaml': YAML })
    const loaded = loadWebManifest(PROJECT, { roots: [dir] })
    expect(loaded.kind).toBe('ok')
    expect(loaded.kind === 'ok' && loaded.manifest.assertions[0]?.expect.toContain).toBe('订单编号')
  })

  it('**没有清单 = 无断言**（不回落默认断言）', () => {
    const dir = projectDir({ 'web/ems.yaml': YAML.replace('project: cdqas', 'project: ems') })
    expect(loadWebManifest(PROJECT, { roots: [dir] }).kind).toBe('no-manifest')
  })

  it('YAML 语法错 → unreadable；内容错 → config-error（分开的两种处置）', () => {
    const bad = projectDir({ 'web/cdqas.yaml': 'version: 1\n  bad: [\n' })
    expect(loadWebManifest(PROJECT, { roots: [bad] }).kind).toBe('unreadable')
    const wrong = projectDir({ 'web/cdqas.yaml': YAML.replace('toContain: 订单编号', 'toContain:') })
    expect(loadWebManifest(PROJECT, { roots: [wrong] }).kind).not.toBe('ok')
  })

  it('空文件是配置错（不是「无断言」）', () => {
    const dir = projectDir({ 'web/cdqas.yaml': '' })
    expect(loadWebManifest(PROJECT, { roots: [dir] }).kind).toBe('config-error')
  })

  it('多个根下都有 → 歧义，报 unreadable', () => {
    const a = projectDir({ 'web/cdqas.yaml': YAML })
    const b = projectDir({ 'web/cdqas.yaml': YAML })
    expect(loadWebManifest(PROJECT, { roots: [a, b] }).kind).toBe('unreadable')
  })
})
