/**
 * 聚合扫描的守卫（方案 §7 的 N1）。
 *
 * ## 为什么这条判据需要守卫
 *
 * `scripts/aggregate.mjs` 决定**哪些包会被公开**——它写的 `packages/all/cordis.patch.yml`
 * 与仓根 `cordis.patch.yml` 就是发布物。本仓的私有开发工具（`devdata` / `devfront`）**也是真插件**：
 * 它们要 `dsh.bundle.patch` 才能挂进 profile。
 *
 * 两者叠加的泄漏是**没症状**的：本地一切正常、`check-publishable` 也不报（它按 `private` 跳过），
 * 直到有人在 npm 上装到一份内部开发工具。所以「私有包不进聚合」必须是一条**被钉住的判据**，
 * 而不是「记得别给它加 patch」。
 */

import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, describe, expect, it } from 'vitest'

import { extractRows, isAggregatable, selectPlugins } from '../aggregate.mjs'

const dirs: string[] = []

/** 造一个假的 packages 目录。 */
function packagesDir(packages: Record<string, unknown>): string {
  const dir = mkdtempSync(join(tmpdir(), 'aggregate-fixture-'))
  dirs.push(dir)
  for (const [name, manifest] of Object.entries(packages)) {
    mkdirSync(join(dir, name), { recursive: true })
    writeFileSync(join(dir, name, 'package.json'), JSON.stringify(manifest, null, 2))
    const patch = (manifest as { dsh?: { bundle?: { patch?: string } } }).dsh?.bundle?.patch
    if (typeof patch === 'string') {
      writeFileSync(
        join(dir, name, patch),
        `- insert:\n    - id: ${name}\n      name: '@hyzyn/dsh-${name}'\n`,
      )
    }
  }
  return dir
}

/** 一个公开插件的清单。 */
function publicPlugin(name: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: `@hyzyn/dsh-${name}`,
    version: '1.0.0',
    dsh: { bundle: { patch: './cordis.patch.yml' } },
    ...extra,
  }
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('isAggregatable：纯判据', () => {
  it('公开 + 有补丁层 → 可聚合', () => {
    expect(isAggregatable(publicPlugin('tty'))).toBe(true)
  })

  it('**私有包不可聚合**（哪怕它带着补丁层）', () => {
    // 失败意味着：私有开发工具会被卷进 @hyzyn/dsh-all，跟着公开发布出去。
    expect(isAggregatable(publicPlugin('devfront', { private: true }))).toBe(false)
  })

  it('聚合包自己不可聚合（否则自己套自己）', () => {
    expect(isAggregatable(publicPlugin('all', { name: '@hyzyn/dsh-all' }))).toBe(false)
  })

  it('没有补丁层 / 补丁层是空串 → 不可聚合', () => {
    expect(isAggregatable({ name: '@hyzyn/dsh-x', version: '1.0.0' })).toBe(false)
    expect(isAggregatable({ name: '@hyzyn/dsh-x', dsh: { bundle: { patch: '' } } })).toBe(false)
    expect(isAggregatable({ name: '@hyzyn/dsh-x', dsh: { bundle: {} } })).toBe(false)
  })

  it('**`private: false` 与「没写 private」一样算公开**（只有 `=== true` 才算私有）', () => {
    expect(isAggregatable(publicPlugin('a', { private: false }))).toBe(true)
    expect(isAggregatable(publicPlugin('b'))).toBe(true)
  })

  it('非对象 / null 不抛（目录里可能有非包残留）', () => {
    expect(isAggregatable(null)).toBe(false)
    expect(isAggregatable(undefined)).toBe(false)
    expect(isAggregatable('x')).toBe(false)
    expect(isAggregatable({})).toBe(false)
  })
})

describe('selectPlugins：真实扫描行为', () => {
  it('只选出「公开 + 有补丁层」的包', () => {
    const dir = packagesDir({
      'public-a': publicPlugin('a'),
      'private-b': publicPlugin('b', { private: true }),
      'no-patch': { name: '@hyzyn/dsh-nopatch', version: '1.0.0' },
      all: publicPlugin('all', { name: '@hyzyn/dsh-all' }),
    })
    const { plugins, skippedPrivate } = selectPlugins(dir)
    expect(plugins.map((p) => p.name)).toEqual(['@hyzyn/dsh-a'])
    expect(skippedPrivate).toEqual(['@hyzyn/dsh-b'])
  })

  it('**私有包没有任何补丁层时也不用报**（它本来就不进聚合）', () => {
    const dir = packagesDir({ 'private-no-patch': { name: '@hyzyn/dsh-x', private: true, version: '1.0.0' } })
    const { plugins, skippedPrivate } = selectPlugins(dir)
    expect(plugins).toEqual([])
    expect(skippedPrivate).toEqual([])
  })

  it('没有 package.json 的目录被跳过（packages/ 下有历史残留）', () => {
    const dir = packagesDir({ 'public-a': publicPlugin('a') })
    mkdirSync(join(dir, 'dist'), { recursive: true })
    expect(selectPlugins(dir).plugins.map((p) => p.name)).toEqual(['@hyzyn/dsh-a'])
  })

  it('带补丁层但文件里没有可提取的行 → 跳过，并经 warn 报出来', () => {
    const dir = packagesDir({ 'empty-patch': publicPlugin('e') })
    writeFileSync(join(dir, 'empty-patch', 'cordis.patch.yml'), '# 什么都没有\n')
    const warnings: string[] = []
    const { plugins } = selectPlugins(dir, { warn: (message) => warnings.push(message) })
    expect(plugins).toEqual([])
    expect(warnings.join('\n')).toContain('没有可提取的行')
  })

  it('行的 id 与包名从插件自己的 cordis.patch.yml 提取', () => {
    // fixture 里目录名与包名后缀保持一致（真实仓库就是这样），否则提出来的是 patch 里的名字、
    // 断言却按清单里的名字写，两边对不上还说不出哪边错。
    const dir = packagesDir({ 'public-a': publicPlugin('public-a') })
    const { plugins } = selectPlugins(dir)
    expect(plugins[0]?.rows).toEqual([{ id: 'public-a', name: '@hyzyn/dsh-public-a' }])
    expect(plugins[0]?.version).toBe('1.0.0')
  })
})

describe('extractRows', () => {
  it('认出 id + name，且容忍引号两侧的空格', () => {
    expect(extractRows("- insert:\n    - id: tty\n      name: '@hyzyn/dsh-tty'\n")).toEqual([
      { id: 'tty', name: '@hyzyn/dsh-tty' },
    ])
  })

  it('多行 / 多个 insert 都提出来', () => {
    const rows = extractRows("- insert:\n    - id: a\n      name: '@x/a'\n- insert:\n    - id: b\n      name: '@x/b'\n")
    expect(rows).toEqual([
      { id: 'a', name: '@x/a' },
      { id: 'b', name: '@x/b' },
    ])
  })

  it('没有 name 的 id 不算一行（残缺配置宁可少一行也不要挂个空名字）', () => {
    expect(extractRows('- insert:\n    - id: a\n')).toEqual([])
  })
})

describe('真实仓库：当前状态必须成立', () => {
  // 本文件在 scripts/test/ 下，仓库根要往上两级。
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))

  it('聚合产物里**没有**私有包', () => {
    // 这是最直接的那条断言：发布物里不该出现内部开发工具。
    for (const file of ['packages/all/cordis.patch.yml', 'cordis.patch.yml']) {
      const text = readFileSync(join(repoRoot, file), 'utf8')
      expect(text, `${file} 里出现了 devdata`).not.toContain('dsh-devdata')
      expect(text, `${file} 里出现了 devfront`).not.toContain('dsh-devfront')
    }
  })

  it('真实 packages 目录：私有包一个都不进聚合，带了补丁层的被点名', () => {
    const pkgDir = join(repoRoot, 'packages')
    const { plugins, skippedPrivate } = selectPlugins(pkgDir)

    // ① 安全性质（真正要守的一条）：内部开发工具一个都不在聚合里。
    expect(plugins.map((p) => p.name).filter((n) => n.startsWith('@hyzyn/dsh-dev'))).toEqual([])

    // ② 「带了补丁层的私有包必须被点名」——静默消失会让排查时看不见它。
    //    这条按**真实清单现算**，而不是写死名字：将来某个包改成公开、或新增私有包，判据都成立。
    const privateWithPatch = readdirSync(pkgDir).flatMap((name) => {
      try {
        const manifest = JSON.parse(readFileSync(join(pkgDir, name, 'package.json'), 'utf8'))
        return manifest.private === true && typeof manifest.dsh?.bundle?.patch === 'string' ? [manifest.name] : []
      } catch {
        return []
      }
    })
    expect(skippedPrivate.slice().sort()).toEqual(privateWithPatch.slice().sort())

    // ③ 反空跑：至少得有一个这样的包，否则 ② 等于没断言（这正是 devfront 成为插件之后的形态）。
    expect(privateWithPatch.length).toBeGreaterThan(0)
  })

  it('公开插件的数量与产出行数一致（防「读空 = 恒绿」）', () => {
    const { plugins } = selectPlugins(join(repoRoot, 'packages'))
    expect(plugins.length).toBeGreaterThan(5)
    for (const plugin of plugins) expect(plugin.rows.length).toBeGreaterThan(0)
  })
})
