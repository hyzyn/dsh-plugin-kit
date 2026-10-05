import { normalize } from 'node:path'

import { describe, expect, it } from 'vitest'

import { normalizeProjectContext } from '../src/index.js'

const VALID = { root: '/work/my-project', project: 'my-project' }

function problemFields(input: unknown): string[] {
  const result = normalizeProjectContext(input)
  expect(result.ok).toBe(false)
  expect(result.context).toBeNull()
  expect(result.problems.every((problem) => problem.message.length > 0)).toBe(true)
  return result.problems.map((problem) => problem.field)
}

describe('normalizeProjectContext', () => {
  it('最小上下文缺省 readonly，三面全部关闭，不猜目录或项目名', () => {
    expect(normalizeProjectContext(VALID)).toEqual({
      ok: true,
      context: {
        root: normalize(VALID.root),
        project: VALID.project,
        mode: 'readonly',
        enabled: { environment: false, data: false, front: false },
        readOnly: true,
      },
      problems: [],
    })
    expect(problemFields({})).toEqual(['root', 'project'])
  })

  it('仅词法归一化路径和两端空白，无需目录真实存在', () => {
    const result = normalizeProjectContext({ root: ' /nonexistent/project/../app ', project: ' App_1.0-test ' })
    expect(result.ok).toBe(true)
    expect(result.context?.root).toBe(normalize('/nonexistent/app'))
    expect(result.context?.project).toBe('App_1.0-test')
  })

  it.each(['readonly', 'release'])('%s 模式显式启用三面仍然只读', (mode) => {
    const result = normalizeProjectContext({
      ...VALID,
      mode,
      enabled: { environment: true, data: true, front: true },
    })
    expect(result.ok).toBe(true)
    expect(result.context?.mode).toBe(mode)
    expect(result.context?.enabled).toEqual({ environment: true, data: true, front: true })
    expect(result.context?.readOnly).toBe(true)
    expect(Object.keys(result.context ?? {}).sort()).toEqual(['enabled', 'mode', 'project', 'readOnly', 'root'])
  })

  it('部分启用不会打开省略的面，显式 false 被保留', () => {
    const result = normalizeProjectContext({ ...VALID, enabled: { data: true, front: false } })
    expect(result.ok).toBe(true)
    expect(result.context?.enabled).toEqual({ environment: false, data: true, front: false })
    expect(normalizeProjectContext({ ...VALID, enabled: {} })).toEqual(normalizeProjectContext(VALID))
  })

  it.each([undefined, null, [], 'project', 1, false])('拒绝非对象输入 %j', (input) => {
    expect(problemFields(input)).toEqual(['input'])
  })

  it.each([undefined, null, '', ' ', 'relative/app', './app', '../app', '~/app', '/work/\0app', 42])(
    '拒绝缺失、相对或非法项目根 %j',
    (root) => expect(problemFields({ ...VALID, root })).toEqual(['root']),
  )

  it.each([undefined, null, '', ' ', '.', '..', '.hidden', '../app', 'app/name', 'app\\name', 'two words', 'app\0', 42])(
    '拒绝不安全或非法项目名 %j',
    (project) => expect(problemFields({ ...VALID, project })).toEqual(['project']),
  )

  it.each(['write', 'Release', '', null, true, 1])('未知模式 %j 给出问题且不产出上下文', (mode) => {
    expect(problemFields({ ...VALID, mode })).toEqual(['mode'])
  })

  it.each([null, [], true, 'all'])('enabled 必须是开关对象 %j', (enabled) => {
    expect(problemFields({ ...VALID, enabled })).toEqual(['enabled'])
  })

  it.each(['true', 'false', 1, 0, null, {}])('开关不做真值转换 %j', (enabled) => {
    expect(problemFields({ ...VALID, enabled: { environment: enabled, data: enabled, front: enabled } })).toEqual([
      'enabled.environment', 'enabled.data', 'enabled.front',
    ])
  })

  it('同时报告未知顶层字段、未知启用面和已知字段类型错误', () => {
    expect(problemFields({
      ...VALID,
      mode: 'write',
      typo: true,
      enabled: { release: true, data: 'true' },
    })).toEqual(['typo', 'mode', 'enabled.release', 'enabled.data'])
  })

  it.each(['writeCapability', 'allowWrite', 'readOnly'])('release 不接受授权字段 %s', (field) => {
    expect(problemFields({ ...VALID, mode: 'release', [field]: true })).toEqual([field])
    expect(problemFields({ ...VALID, mode: 'release', enabled: { [field]: true } })).toEqual([`enabled.${field}`])
  })

  it('不修改输入，不共享开关对象，重复调用结果一致', () => {
    const enabled = Object.freeze({ data: true })
    const input = Object.freeze({ ...VALID, enabled })
    const first = normalizeProjectContext(input)
    const second = normalizeProjectContext(input)
    expect(first).toEqual(second)
    expect(input).toEqual({ ...VALID, enabled: { data: true } })
    expect(first.context?.enabled).not.toBe(enabled)
    expect(first.context?.enabled).not.toBe(second.context?.enabled)
    expect(Object.isFrozen(first.context?.enabled)).toBe(true)
  })
})
