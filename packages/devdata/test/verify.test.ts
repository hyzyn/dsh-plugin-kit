/**
 * 验活清单的**加载与校验**测试（`docs/devdata-plan.md` §3.9）。
 *
 * 这一层的失败方式与别处不同：清单**读错**时程序不会崩，它会**报绿**。所以用例的重点是
 * 「该拒的配置有没有被拒」，尤其是三条——
 *   - 缺省即无（没有清单 ≠ 有默认断言）；
 *   - 空清单不报绿；
 *   - 写语句 / 未登记算子 / 非法正则在**加载时**就被抓（否则会伪装成一条「数据不对」）。
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  classifyAssertionStatement,
  loadManifest,
  manifestRelativePath,
  projectsWithManifest,
  validateManifest,
  type VerifyConfigError,
} from '../src/index.js'

const PROJECT = 'cdqas'

/** 造一份最小合法清单。 */
function manifest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: 1,
    project: PROJECT,
    assertions: [
      {
        id: 'order-count',
        appliesTo: 'backend',
        target: 't-mysql',
        statement: 'SELECT COUNT(*) FROM orders',
        expect: { gte: 1 },
        severity: 'fail',
      },
    ],
    ...overrides,
  }
}

/** 校验并断言通过。 */
function ok(data: unknown): ReturnType<typeof validateManifest> {
  const result = validateManifest(PROJECT, data)
  expect(result.ok, `期望清单通过，实际错误：${JSON.stringify(result.ok ? [] : result.errors)}`).toBe(true)
  return result
}

/** 校验并取错误清单。 */
function errorsOf(data: unknown): VerifyConfigError[] {
  const result = validateManifest(PROJECT, data)
  expect(result.ok, '期望清单被拒但通过了').toBe(false)
  return result.ok ? [] : result.errors
}

/** 全部错误的路径（断言「点到了哪个字段」）。 */
function pathsOf(data: unknown): string[] {
  return errorsOf(data).map((error) => error.path)
}

describe('清单：结构校验', () => {
  it('最小合法清单通过', () => {
    const result = ok(manifest())
    expect(result.ok === true && result.manifest.project).toBe(PROJECT)
    expect(result.ok === true && result.manifest.assertions).toHaveLength(1)
  })

  it('顶层不是映射 → 拒', () => {
    expect(pathsOf(['not', 'a', 'map'])).toEqual([''])
    expect(pathsOf('just a string')).toEqual([''])
  })

  it('version 不是 1 → 拒（不猜未来格式）', () => {
    expect(pathsOf(manifest({ version: 2 }))).toContain('version')
  })

  it('`project` 与文件名不一致 → 拒（复制清单改漏会把断言跑到别的项目上）', () => {
    // 失败意味着：把 ems 的清单复制成 cdqas.yaml 却忘了改 project，断言会打在 ems 的库上，
    // 而报告里写着 cdqas 核对通过。
    expect(pathsOf(manifest({ project: 'ems' }))).toContain('project')
  })

  it('`assertions` 不是数组 → 拒', () => {
    expect(pathsOf(manifest({ assertions: {} }))).toContain('assertions')
  })

  it('**空清单不报绿**：`assertions: []` → 拒', () => {
    // 失败意味着：「声明了这个项目要验活」与「一条都没写」被当成同一件事，核对面是空的却报绿。
    const errors = errorsOf(manifest({ assertions: [] }))
    expect(errors.some((error) => error.path === 'assertions' && error.message.includes('空'))).toBe(true)
  })
})

describe('清单：断言字段', () => {
  it('id 形状不合法 → 拒', () => {
    for (const id of ['Order-Count', 'has space', '', '_leading', '.leading', '中文', 'a/b']) {
      const result = validateManifest(PROJECT, manifest({ assertions: [{ ...first(), id }] }))
      expect(result.ok, `id ${JSON.stringify(id)} 本该被拒`).toBe(false)
    }
  })

  it('id 的首字符必须是字母或数字（`9_ok` / `ends-` 都合法）', () => {
    // 判据只约束**首字符**；尾随的 `-` / `_` 不拒（拒它只是给作者添麻烦，不换来任何判定力）。
    for (const id of ['9_ok', 'ends-', 'a']) {
      expect(validateManifest(PROJECT, manifest({ assertions: [{ ...first(), id }] })).ok, id).toBe(true)
    }
  })

  it('id 重复 → 拒（报告里点名会指错）', () => {
    const first0 = first()
    const errors = errorsOf(manifest({ assertions: [first0, { ...first0 }] }))
    expect(errors.some((error) => error.message.includes('重复'))).toBe(true)
  })

  it('appliesTo 必须是三档之一', () => {
    for (const appliesTo of ['backend', 'front', 'build-only']) {
      expect(validateManifest(PROJECT, manifest({ assertions: [{ ...first(), appliesTo }] })).ok).toBe(true)
    }
    expect(pathsOf(manifest({ assertions: [{ ...first(), appliesTo: 'server' }] }))).toContain('assertions[0].appliesTo')
  })

  it('target / statement 必须非空', () => {
    expect(pathsOf(manifest({ assertions: [{ ...first(), target: '  ' }] }))).toContain('assertions[0].target')
    expect(pathsOf(manifest({ assertions: [{ ...first(), statement: '' }] }))).toContain('assertions[0].statement')
  })

  it('severity 必须是 fail / warn', () => {
    expect(validateManifest(PROJECT, manifest({ assertions: [{ ...first(), severity: 'warn' }] })).ok).toBe(true)
    expect(pathsOf(manifest({ assertions: [{ ...first(), severity: 'error' }] }))).toContain('assertions[0].severity')
  })

  it('timeoutMs 给了就必须是正整数', () => {
    expect(validateManifest(PROJECT, manifest({ assertions: [{ ...first(), timeoutMs: 5000 }] })).ok).toBe(true)
    for (const timeoutMs of [0, -1, 1.5, '5000']) {
      expect(pathsOf(manifest({ assertions: [{ ...first(), timeoutMs }] })), JSON.stringify(timeoutMs)).toContain(
        'assertions[0].timeoutMs',
      )
    }
  })

  it('**一次报全部错误**（清单是给人改的，一条一条试错很贵）', () => {
    const errors = errorsOf(
      manifest({
        version: 2,
        project: 'ems',
        assertions: [{ ...first(), appliesTo: 'server', severity: 'error' }],
      }),
    )
    expect(errors.length).toBeGreaterThanOrEqual(4)
    expect(errors.map((error) => error.path)).toEqual(
      expect.arrayContaining(['version', 'project', 'assertions[0].appliesTo', 'assertions[0].severity']),
    )
  })
})

describe('清单：语句必须是只读（§3.9 约束 1）', () => {
  it('写语句在**加载时**就被拒（不新增任何写能力）', () => {
    // 失败意味着：验活断言库成了一条写路径，而它本该只是只读档的消费者。
    for (const statement of [
      'DELETE FROM orders',
      'UPDATE orders SET a = 1',
      'INSERT INTO orders VALUES (1)',
      'DROP TABLE orders',
      'TRUNCATE TABLE orders',
    ]) {
      const errors = errorsOf(manifest({ assertions: [{ ...first(), statement }] }))
      expect(errors.some((error) => error.path === 'assertions[0].statement'), statement).toBe(true)
    }
  })

  it('多语句 / 未闭合字符串同样拒', () => {
    for (const statement of ['SELECT 1; DELETE FROM t', "SELECT 'unterminated"]) {
      expect(pathsOf(manifest({ assertions: [{ ...first(), statement }] }))).toContain('assertions[0].statement')
    }
  })

  it('只读语句通过（SELECT / WITH / SHOW）', () => {
    for (const statement of ['SELECT 1', 'WITH x AS (SELECT 1) SELECT * FROM x', 'SHOW TABLES']) {
      expect(validateManifest(PROJECT, manifest({ assertions: [{ ...first(), statement }] })).ok, statement).toBe(true)
    }
  })

  it('判据是**注入**的：换个判据能独立测清单校验', () => {
    // 不注入就无法区分「清单结构对」与「语句对」这两件事。
    const always = (): string | undefined => undefined
    const result = validateManifest(PROJECT, manifest({ assertions: [{ ...first(), statement: 'DELETE FROM t' }] }), always)
    expect(result.ok).toBe(true)
    expect(classifyAssertionStatement('DELETE FROM t')).toBeTypeOf('string')
  })
})

describe('清单：expect 校验', () => {
  it('未知算子 → 拒（不静默忽略，否则写错的算子看起来配好了）', () => {
    const errors = errorsOf(manifest({ assertions: [{ ...first(), expect: { equals: 1 } }] }))
    expect(errors.some((error) => error.message.includes('未知的期望算子'))).toBe(true)
  })

  it('**空 expect → 拒**：没有判据的断言只会报绿', () => {
    expect(pathsOf(manifest({ assertions: [{ ...first(), expect: {} }] }))).toContain('assertions[0].expect')
  })

  it('非法正则在加载时就抓（否则会伪装成一条「数据不对」）', () => {
    const errors = errorsOf(manifest({ assertions: [{ ...first(), expect: { regex: '([' } }] }))
    expect(errors.some((error) => error.path === 'assertions[0].expect.regex' && error.message.includes('正则不合法'))).toBe(true)
  })

  it('gte / lte / rowCount 必须是有限数字', () => {
    for (const op of ['gte', 'lte', 'rowCount'] as const) {
      for (const bad of ['1', Number.NaN, Number.POSITIVE_INFINITY, null]) {
        const errors = errorsOf(manifest({ assertions: [{ ...first(), expect: { [op]: bad } }] }))
        expect(errors.some((error) => error.path === `assertions[0].expect.${op}`), `${op}=${String(bad)}`).toBe(true)
      }
    }
  })

  it('rowCount 必须是非负整数', () => {
    for (const bad of [-1, 1.5]) {
      expect(pathsOf(manifest({ assertions: [{ ...first(), expect: { rowCount: bad } }] }))).toContain(
        'assertions[0].expect.rowCount',
      )
    }
  })

  it('自相矛盾的上下界 → 拒（它永远不可能通过）', () => {
    const errors = errorsOf(manifest({ assertions: [{ ...first(), expect: { gte: 10, lte: 5 } }] }))
    expect(errors.some((error) => error.message.includes('永远不可能通过'))).toBe(true)
  })

  it('rowCount 与 lte 打架 → 拒（两者都作用在行数上）', () => {
    const errors = errorsOf(manifest({ assertions: [{ ...first(), expect: { rowCount: 10, lte: 5 } }] }))
    expect(errors.some((error) => error.message.includes('不可能同时成立'))).toBe(true)
  })

  it('多个算子可以同时给出（语义是 AND，不是取第一命中）', () => {
    expect(validateManifest(PROJECT, manifest({ assertions: [{ ...first(), expect: { gte: 1, lte: 10, rowCount: 1 } }] })).ok).toBe(
      true,
    )
  })

  it('column 给了就必须是非空字符串', () => {
    expect(validateManifest(PROJECT, manifest({ assertions: [{ ...first(), expect: { eq: 1, column: 'total' } }] })).ok).toBe(true)
    expect(pathsOf(manifest({ assertions: [{ ...first(), expect: { eq: 1, column: '' } }] }))).toContain(
      'assertions[0].expect.column',
    )
  })
})

describe('清单：路径与文件名', () => {
  it('相对路径唯一一处：verify/<project>.yaml', () => {
    expect(manifestRelativePath('cdqas')).toBe('verify/cdqas.yaml')
  })

  it('只认 `verify/<project>.yaml`（不认 .yml——歧义会变成静默地无断言）', () => {
    const found = projectsWithManifest(['verify/a.yaml', 'verify/b.yml', 'other/c.yaml', 'verify/nested/d.yaml', 'verify/.yaml'])
    expect([...found.keys()]).toEqual(['a'])
  })

  it('扫出来的映射是 project → 文件', () => {
    expect(projectsWithManifest(['verify/cdqas.yaml', 'verify/ems.yaml']).get('ems')).toBe('verify/ems.yaml')
  })
})

describe('清单：从项目里读（只读）', () => {
  const dirs: string[] = []

  function projectDir(files: Record<string, string>): string {
    const dir = mkdtempSync(join(tmpdir(), 'devdata-verify-'))
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
  - id: order-count
    appliesTo: backend
    target: t-mysql
    statement: SELECT COUNT(*) FROM orders
    expect:
      gte: 1
    severity: fail
`

  it('读到合法清单 → ok，且形态正确', () => {
    const dir = projectDir({ 'verify/cdqas.yaml': YAML })
    const loaded = loadManifest(PROJECT, { roots: [dir] })
    expect(loaded.kind).toBe('ok')
    expect(loaded.kind === 'ok' && loaded.manifest.assertions[0]?.id).toBe('order-count')
    expect(loaded.kind === 'ok' && loaded.manifest.assertions[0]?.expect.gte).toBe(1)
  })

  it('**没有清单 = 无断言**（不是「用默认断言」）', () => {
    // 失败意味着：别的项目的话被拿来核对这个项目，而且看起来是绿的。
    const dir = projectDir({ 'verify/ems.yaml': YAML.replace('project: cdqas', 'project: ems') })
    expect(loadManifest(PROJECT, { roots: [dir] }).kind).toBe('no-manifest')
  })

  it('空文件是**配置错**，不是「无断言」（文件在，说明有人打算写）', () => {
    const dir = projectDir({ 'verify/cdqas.yaml': '' })
    const loaded = loadManifest(PROJECT, { roots: [dir] })
    expect(loaded.kind).toBe('config-error')
    expect(loaded.kind === 'config-error' && loaded.errors[0]?.message).toContain('空')
  })

  it('YAML 语法错 → unreadable（与配置错分开：一个改语法，一个改内容）', () => {
    const dir = projectDir({ 'verify/cdqas.yaml': 'version: 1\n  bad indent: [\n' })
    expect(loadManifest(PROJECT, { roots: [dir] }).kind).toBe('unreadable')
  })

  it('内容写错 → config-error，且路径点到字段', () => {
    const dir = projectDir({ 'verify/cdqas.yaml': YAML.replace('gte: 1', 'equals: 1') })
    const loaded = loadManifest(PROJECT, { roots: [dir] })
    expect(loaded.kind).toBe('config-error')
    expect(loaded.kind === 'config-error' && loaded.errors.some((error) => error.path.endsWith('.expect.equals'))).toBe(true)
  })

  it('多个根目录下都有同一份清单 → 歧义，报 unreadable（不靠顺序静默决定）', () => {
    const a = projectDir({ 'verify/cdqas.yaml': YAML })
    const b = projectDir({ 'verify/cdqas.yaml': YAML })
    const loaded = loadManifest(PROJECT, { roots: [a, b] })
    expect(loaded.kind).toBe('unreadable')
    expect(loaded.kind === 'unreadable' && loaded.message).toContain('歧义')
  })

  it('前面的根目录没有、后面的有 → 用后面的（顺序是有意义的回退）', () => {
    const a = projectDir({})
    const b = projectDir({ 'verify/cdqas.yaml': YAML })
    expect(loadManifest(PROJECT, { roots: [a, b] }).kind).toBe('ok')
  })

  it('YAML 里的日期/布尔等不按 JSON_SCHEMA 之外的花样解释', () => {
    // 用 JSON_SCHEMA：清单是配置，不是能求值的表达式。`!!js` 一类标签不该被启用。
    const dir = projectDir({
      'verify/cdqas.yaml': YAML.replace('statement: SELECT COUNT(*) FROM orders', 'statement: !!js "return 1"'),
    })
    const loaded = loadManifest(PROJECT, { roots: [dir] })
    // 关键不是它怎么失败，而是**它必须失败**：绝不允许把可执行表达式当断言。
    expect(loaded.kind).not.toBe('ok')
  })
})

/** 取一份断言样板（用例里改单个字段用）。 */
function first(): Record<string, unknown> {
  const assertions = manifest().assertions as Record<string, unknown>[]
  return { ...(assertions[0] as Record<string, unknown>) }
}
