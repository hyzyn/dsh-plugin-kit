/**
 * [`scripts/create-plugin-manifest.mjs`](../create-plugin-manifest.mjs) 的用例 —— 脚手架生成期的 kit 钉子。
 *
 * ## 这份用例守什么
 *
 * 「生成的包带着一个旧 kit 钉子出厂」是**静默**的：`templates/` 不在
 * [check-kit-pins.mjs](../check-kit-pins.mjs) 的扫描面，模板也不在 `pnpm-workspace.yaml` /
 * `pnpm-lock.yaml` 里，所以漂移不会有任何东西变红 —— 直到新包进了 `packages/`，
 * 才由 kit 钉子守卫发现（而那时已经晚了：发版中途红，或更糟，一路发到 npm）。
 *
 * 现算逻辑把这条路堵死，用例钉住三件事：
 *
 * 1. **钉子确实被换掉**：喂 `kitVersion = 9.9.9` → 生成结果里就是 `9.9.9`；
 * 2. **换的只有钉子**：其余键与值逐字不动，序列化形态也是本仓既有形态（2 空格缩进 + 单个结尾换行）；
 * 3. **该红的时候红**：模板丢掉那条声明、kit 版本不是精确版本、文本不是合法 JSON —— 三种都抛，
 *    而不是静默产出一个没有钉子的包（「匹配不到就算过」正是本仓反复记过的闸门失效形态）。
 *
 * 反例全部用 fixture 造，不修改任何受版本控制的文件。
 *
 * ## 刻意不做的：断言「模板钉子 == kit 当前版本」
 *
 * 按 [docs/conventions.md § 文档分档](../docs/conventions.md#文档分档) 的纪律 3，那条断言会把
 * **每次 bump kit** 都变成一次「模板必须同轮改掉」的人工同步点，漏了就在发版中途红 ——
 * 而模板字面值已经不是真相源（生成期现算，见该模块的文件头）。所以这里只断言它是
 * **合法的精确版本**：防有人把它写成 `^0.5.2` 这种会让另一个消费者解析到第二份 kit 的形态。
 */
import { describe, expect, it } from 'vitest'

import { DEPENDENCY_FIELDS, EXACT_VERSION, KIT_NAME } from '../check-kit-pins.mjs'
import { applyKitPin, readKitVersion, readTemplateManifest } from '../create-plugin-manifest.mjs'

/** 模板 manifest 原文（`applyKitPin` 的真实输入形态）。 */
const template = readTemplateManifest()

/** 某个 manifest 是在哪个字段里声明 kit 的（真实模板里一定有，见第一组）。 */
function kitField(manifest) {
  return DEPENDENCY_FIELDS.find((field) => manifest[field]?.[KIT_NAME] !== undefined)
}

describe('真实仓库 · 模板与 kit 的形态', () => {
  it('模板确实声明了 kit —— 现算逻辑的锚点', () => {
    const field = kitField(JSON.parse(template))
    expect(field).toBeDefined()
  })

  it('模板里的钉子（若有人顺手改）必须是合法的精确版本', () => {
    const manifest = JSON.parse(template)
    const spec = manifest[kitField(manifest)][KIT_NAME]
    expect(EXACT_VERSION.test(spec)).toBe(true)
  })

  it('kit 自己的版本也是精确版本（否则生成期就该拒绝，而不是把范围钉进新包）', () => {
    expect(EXACT_VERSION.test(readKitVersion())).toBe(true)
  })
})

describe('现算：喂什么版本就钉什么版本', () => {
  it('kitVersion = 9.9.9 → 生成结果里的钉子就是 9.9.9', () => {
    const manifest = JSON.parse(applyKitPin(template, '9.9.9'))
    expect(manifest[kitField(manifest)][KIT_NAME]).toBe('9.9.9')
  })

  it('换的只有钉子：其余键与值逐字不动（只剥掉那一处，整份对象应逐字相等）', () => {
    const before = JSON.parse(template)
    const after = JSON.parse(applyKitPin(template, '9.9.9'))
    const field = kitField(before)
    const restored = { ...after, [field]: { ...after[field], [KIT_NAME]: before[field][KIT_NAME] } }
    expect(restored).toEqual(before)
  })

  it('序列化形态是本仓既有形态：2 空格缩进 + 单个结尾换行、无行尾空白', () => {
    const text = applyKitPin(template, '9.9.9')
    expect(text).toMatch(/[^\n]\n$/)
    expect(text).toContain('\n  "dependencies": {')
    expect(text.split('\n').every((line) => line === line.trimEnd())).toBe(true)
  })

  it('幂等：同一版本喂第二次，逐字节相同', () => {
    const once = applyKitPin(template, '9.9.9')
    expect(applyKitPin(once, '9.9.9')).toBe(once)
  })

  it('另一个字段也认：kit 声明在 peerDependencies 时就换那一处，不凭空造 dependencies', () => {
    const text = JSON.stringify({ name: '@hyzyn/dsh-x', peerDependencies: { [KIT_NAME]: '0.0.1' } }, undefined, 2)
    const manifest = JSON.parse(applyKitPin(text, '9.9.9'))
    expect(manifest.peerDependencies[KIT_NAME]).toBe('9.9.9')
    expect(manifest.dependencies).toBeUndefined()
  })
})

describe('该红的时候红（不许「匹配不到就算过」）', () => {
  it('模板丢了 kit 声明 → 抛，而不是静默产出没有钉子的包', () => {
    const text = JSON.stringify({ name: '@hyzyn/dsh-x', dependencies: { 'js-yaml': '^4.1.0' } }, undefined, 2)
    expect(() => applyKitPin(text, '0.5.2')).toThrow(KIT_NAME)
  })

  it.each([['^0.5.2'], ['~0.5.2'], ['>=0.5.0 <0.6'], ['workspace:*'], ['link:../kit'], ['next'], ['0.5']])(
    'kit 版本 %s 不是精确版本 → 抛',
    (version) => {
      expect(() => applyKitPin(template, version)).toThrow('不是精确版本')
    },
  )

  it('文本不是合法 JSON → 抛（不许当成「没这条声明」）', () => {
    expect(() => applyKitPin('{ not json', '0.5.2')).toThrow('不是合法 JSON')
  })
})
