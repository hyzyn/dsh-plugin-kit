/**
 * `scripts/check-prompt-sections.mjs` 的用例 —— systemPrompt 段落闸。
 *
 * ## 这份用例守三件事
 *
 * 1. **真实仓库必须绿**：没有裸调 `section()`，且 kit 的 `registerLiteralSection` 真的
 *    固定 `interpolate: false`；
 * 2. **守卫必须会红**（本仓的规矩：没有反例的守卫会在下一次改动里漂掉）——反例用 fixture
 *    造，不修改任何受版本控制的文件；
 * 3. **命中不是 0**：至少有一个包在用 `registerLiteralSection`。少了这条，一个「扫描面为空
 *    的实现」也会恒绿，而那正是本仓真实发生过的闸门形态（见 docs/conventions.md 的守卫纪律）。
 *
 * 反例取的是 2026-10-19 外部测评 issue #14 第 1 条的真实形状：
 * `systemPromptApi.section({ name: 'plugin:dsh-prompt-manager', order: 140, text })`
 * ——没有 `interpolate: false`，于是正文里的 `{{language}}` 让每一步请求都抛错。
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import {
  checkAdoption,
  checkLiteralSectionImplementation,
  findRawSectionCalls,
  findSectionOffenders,
} from '../check-prompt-sections.mjs'

const roots = []

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

/** 造一棵最小仓库树：`packages/<pkg>/src/<file>`。 */
function fixture(files) {
  const root = mkdtempSync(join(tmpdir(), 'dsh-prompt-sections-'))
  roots.push(root)
  for (const [rel, content] of Object.entries(files)) {
    const full = join(root, rel)
    mkdirSync(join(full, '..'), { recursive: true })
    writeFileSync(full, content)
  }
  return root
}

describe('真实仓库 · 当前必须绿', () => {
  it('没有裸调 systemPrompt.section()', () => {
    expect(findSectionOffenders()).toEqual([])
  })

  it('kit 的 registerLiteralSection 固定 interpolate: false', () => {
    expect(checkLiteralSectionImplementation()).toEqual([])
  })

  it('确实有包在用 registerLiteralSection（防「扫描面为空 = 恒绿」）', () => {
    expect(checkAdoption()).toEqual([])
  })
})

describe('反例：裸调 section() 必须被抓到', () => {
  it('issue #14 第 1 条的原始形状（没传 interpolate）', () => {
    const root = fixture({
      'packages/prompt/src/index.ts': [
        'let systemPromptApi = null',
        'const disposer = systemPromptApi.section({ name: \'plugin:dsh-prompt-manager\', order: 140, text })',
      ].join('\n'),
    })
    const offenders = findSectionOffenders(root)
    expect(offenders).toHaveLength(1)
    expect(offenders[0]).toContain('packages/prompt/src/index.ts:2')
    expect(offenders[0]).toContain('.section(')
  })

  it('换行写法的裸调也要抓到（`.section(` 后面换行）', () => {
    const root = fixture({
      'packages/rss/src/index.ts': [
        'const disposer = systemPromptApi',
        '  .section({ name: \'plugin:dsh-rss-digest\', order: 160, text })',
      ].join('\n'),
    })
    expect(findSectionOffenders(root)).toHaveLength(1)
  })

  it('注释里提到 .section( 不算违规（本仓大量注释在解释这件事）', () => {
    const root = fixture({
      'packages/x/src/index.ts': [
        '// 不要裸调 .section( —— 用 registerLiteralSection',
        ' * 说明：以前这里是 systemPromptApi.section({...})',
        'const d = registerLiteralSection(api, { name: \'x\', text })',
      ].join('\n'),
    })
    expect(findSectionOffenders(root)).toEqual([])
  })

  it('嵌套子目录也要扫到（src/ 下可能有子模块）', () => {
    const root = fixture({
      'packages/x/src/nested/deep.ts': 'api.section({ name: \'x\', text })',
    })
    const offenders = findSectionOffenders(root)
    expect(offenders).toHaveLength(1)
    expect(offenders[0]).toContain('packages/x/src/nested/deep.ts')
  })
})

describe('反例：kit 的实现被改坏时必须红', () => {
  it('registerLiteralSection 不再传 interpolate: false', () => {
    const root = fixture({
      'packages/kit/src/prompt-section.ts': [
        'export function registerLiteralSection(api, options) {',
        '  return api.section({ ...options })',
        '}',
      ].join('\n'),
    })
    const violations = checkLiteralSectionImplementation(root)
    expect(violations.join('\n')).toContain('interpolate: false')
  })

  it('kit 的 prompt-section.ts 整个不见了（恒绿风险）', () => {
    const root = fixture({ 'packages/kit/src/index.ts': '' })
    const violations = checkLiteralSectionImplementation(root)
    expect(violations.join('\n')).toContain('找不到')
  })
})

describe('反例：命中为 0 时必须红', () => {
  it('一个包都没用 registerLiteralSection', () => {
    const root = fixture({
      'packages/x/src/index.ts': 'const a = 1',
    })
    expect(checkAdoption(root).join('\n')).toContain('没有任何包使用 registerLiteralSection')
  })
})

describe('findRawSectionCalls：直接对目录用', () => {
  it('返回带包名的相对位置（报错文案要靠它定位）', () => {
    const root = fixture({
      'packages/demo/src/a.ts': 'x.section({})',
    })
    const offenders = findRawSectionCalls(join(root, 'packages', 'demo', 'src'), 'demo')
    expect(offenders[0]).toMatch(/^packages\/demo\/src\/a\.ts:1:/)
  })

  it('目录不存在时返回空数组（不是抛错）', () => {
    expect(findRawSectionCalls('/definitely/not/here', 'x')).toEqual([])
  })
})
