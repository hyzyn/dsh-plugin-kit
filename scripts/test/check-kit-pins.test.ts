/**
 * `scripts/check-kit-pins.mjs` 的用例 —— kit 钉子守卫。
 *
 * ## 这份用例守两件事
 *
 * 1. **真实仓库必须绿**（`checkRepo()`：全仓 kit 钉子一致、精确、且等于 `packages/kit` 的版本）；
 * 2. **守卫必须会红**——本仓刚发生过一道「命中 0 个文件、恒绿、拦不住任何东西」的闸门
 *    （见 [docs/conventions.md](../docs/conventions.md) 的守卫纪律），所以任何新守卫都要自证会红。
 *    下面第一组还专门断言「真实仓库里确实有被检查的对象」，否则把 `packages/` 读空的实现
 *    也会恒绿。
 *
 * 反例里**用的就是 2026-09-27 真机报告里的那次分裂**（tty 升到新 kit、其余还钉着旧 kit），
 * 所以这组用例同时是「这道闸能不能拦住那次事故」的证明：报告里 8 个插件的失败与插件代码无关，
 * 但树上两份 kit 是那个现场真实存在的一部分（`.modules.yaml` 的 `hoistedLocations` 各占一行）。
 *
 * 反例**全部用 fixture 造**（直接喂 `findKitPinViolations`），不修改任何受版本控制的文件。
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { EXACT_VERSION, KIT_NAME, checkRepo, collectKitPins, findKitPinViolations } from '../check-kit-pins.mjs'

/** 造一条声明；只需要 file / field / spec 三个字段参与判定。 */
const pin = (file, spec, field = 'dependencies') => ({ pkg: file, file, field, spec })

/** 在临时仓库树里落一份 manifest（只给 collectKitPins 读）。 */
function writeFixture(root, dir, manifest) {
  const target = join(root, dir)
  mkdirSync(target, { recursive: true })
  writeFileSync(join(target, 'package.json'), JSON.stringify(manifest, undefined, 2) + '\n')
}

describe('真实仓库 · 当前必须绿', () => {
  it('全仓 kit 钉子一致、精确、且等于 packages/kit 的版本', () => {
    expect(checkRepo()).toEqual([])
  })

  it('且仓库里确实存在被检查的对象（防「读空 = 恒绿」）', () => {
    const { kitVersion, pins } = collectKitPins()
    expect(kitVersion).toMatch(EXACT_VERSION)
    // 真实仓库里一定有消费者：这条不是计数断言，是「闸门真的读到了东西」
    expect(pins.length).toBeGreaterThan(0)
    for (const entry of pins) {
      expect(entry.spec).toBe(kitVersion)
      expect(entry.file).toMatch(/^packages\/[^/]+\/package\.json$/)
    }
  })
})

describe('分裂：一棵树两份 kit（2026-09-27 报告里的现场）', () => {
  it('两个消费者钉不同版本 → 报出，并逐个点名版本与文件', () => {
    const violations = findKitPinViolations({
      kitVersion: '0.5.0-rc.1',
      pins: [
        pin('packages/tty/package.json', '0.5.0-rc.1'),
        pin('packages/rss/package.json', '0.4.2'),
      ],
    })
    expect(violations.join('\n')).toContain('2 个不同的 kit 钉子')
    expect(violations.join('\n')).toContain('packages/tty/package.json')
    expect(violations.join('\n')).toContain('packages/rss/package.json')
  })

  it('钉子在字段之间也可能分裂（同包 dependencies 与 peerDependencies 不一致）', () => {
    const violations = findKitPinViolations({
      kitVersion: '0.5.0-rc.1',
      pins: [
        pin('packages/tty/package.json', '0.5.0-rc.1'),
        pin('packages/tty/package.json', '0.4.2', 'peerDependencies'),
      ],
    })
    expect(violations.join('\n')).toContain('2 个不同的 kit 钉子')
  })
})

describe('非精确钉子：范围与协议一律不合格', () => {
  it.each([
    ['^0.5.0-rc.1', '范围'],
    ['~0.5.0', '范围'],
    ['>=0.4.2 <0.6', '范围'],
    ['workspace:*', 'workspace 协议'],
    ['link:../kit', '本地链接'],
    ['file:../kit', '本地路径'],
    ['github:hyzyn/dsh-plugin-kit#main&path:packages/kit', 'git 来源'],
    ['next', 'dist-tag'],
  ])('%s 不合格（%s）', (spec) => {
    const violations = findKitPinViolations({ kitVersion: '0.5.0-rc.1', pins: [pin('packages/x/package.json', spec)] })
    expect(violations.join('\n')).toContain('不是精确版本')
  })

  it('同一个非精确值写在所有消费者上也照样红：它会让两个消费者解析到不同版本', () => {
    const violations = findKitPinViolations({
      kitVersion: '0.5.0-rc.1',
      pins: [pin('packages/a/package.json', '^0.5.0-rc.1'), pin('packages/b/package.json', '^0.5.0-rc.1')],
    })
    expect(violations.length).toBe(2)
  })
})

describe('跟齐：bump 了 kit 但消费者没跟上', () => {
  it('全仓一致但没有跟到 kit 自己的版本 → 红', () => {
    const violations = findKitPinViolations({
      kitVersion: '0.5.0-rc.1',
      pins: [pin('packages/a/package.json', '0.4.2'), pin('packages/b/package.json', '0.4.2')],
    })
    expect(violations.join('\n')).toContain('≠ packages/kit 的版本 0.5.0-rc.1')
  })

  it('全仓一致且等于 kit 版本 → 绿', () => {
    expect(
      findKitPinViolations({
        kitVersion: '0.5.0-rc.1',
        pins: [pin('packages/a/package.json', '0.5.0-rc.1'), pin('packages/b/package.json', '0.5.0-rc.1')],
      }),
    ).toEqual([])
  })
})

describe('不误报', () => {
  it('没有消费者（例如 kit 还没被别人依赖）→ 绿', () => {
    expect(findKitPinViolations({ kitVersion: '0.5.0-rc.1', pins: [] })).toEqual([])
  })

  it('读盘层只收「声明了 kit」的字段：不依赖 kit 的包与无 manifest 的残留目录都不算消费者', () => {
    // 用一次性临时目录造一棵小仓库树：collectKitPins 的判据是「packages/*/package.json」，
    // 而 packages/ 下可能有非包残留（本仓的 packages/dist 就是那样）
    const root = mkdtempSync(join(tmpdir(), 'check-kit-pins-'))
    try {
      writeFixture(root, 'packages/kit', { name: KIT_NAME, version: '0.5.0-rc.1' })
      writeFixture(root, 'packages/with-kit', { name: '@hyzyn/dsh-with-kit', dependencies: { [KIT_NAME]: '0.5.0-rc.1' } })
      writeFixture(root, 'packages/without-kit', { name: '@hyzyn/dsh-without-kit', dependencies: { 'js-yaml': '^4.1.0' } })
      writeFixture(root, 'packages/only-peer', { name: '@hyzyn/dsh-only-peer', peerDependencies: { [KIT_NAME]: '0.5.0-rc.1' } })
      mkdirSync(join(root, 'packages/dist'), { recursive: true }) // 非包残留：没有 package.json

      const { kitVersion, pins } = collectKitPins(root)
      expect(kitVersion).toBe('0.5.0-rc.1')
      expect(pins.map((entry) => entry.file).sort()).toEqual(['packages/only-peer/package.json', 'packages/with-kit/package.json'])
      expect(findKitPinViolations({ kitVersion, pins })).toEqual([])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
