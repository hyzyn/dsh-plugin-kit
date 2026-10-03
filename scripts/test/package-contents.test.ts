/**
 * `scripts/check-package-contents.mjs` 的用例 —— 发包内容守卫。
 *
 * ## 这份用例守两件事
 *
 * 1. **真实仓库必须绿**（真的打 13 个包，断言声明的入口都在 tarball 里）；
 * 2. **守卫必须会红**——下面把 2026-10-03 实测出的那个洞（`files` 里删掉 `client.js`，
 *    十三道闸门 + 1698 条用例全绿而 tarball 里真的没有它）做成反例钉住。
 *
 * 反例走**纯判定函数**（`checkPackageContents`）用 fixture 造，不修改任何受版本控制的文件、
 * 也不真的打包；真实仓库那一组才走子进程（`readPackageContentsInputs`）。
 *
 * 判据 3（命中不是 0）单独钉一条：本仓真实发生过「命中 0 个文件、恒绿、拦不住任何东西」的
 * 闸门（见 [docs/conventions.md](../docs/conventions.md) 的守卫纪律），所以「检查数不是 0」
 * 是这道闸自己的必要条件。
 */
import { describe, expect, it } from 'vitest'

import {
  checkPackageContents,
  collectExportPaths,
  readPackageContentsInputs,
  requiredEntries,
} from '../check-package-contents.mjs'

/** 造一个目标：`packed`（tarball 里有什么）、`filesExist`（files 里的字面路径在不在磁盘上）。 */
const target = (dir, manifest, packed, filesExist = {}) => ({
  dir,
  name: manifest.name,
  manifest,
  packed,
  filesExist: Object.fromEntries((manifest.files ?? []).map((f) => [f, filesExist[f] ?? true])),
})

/** 一个「什么都有」的插件 manifest（下面按需删字段造反例）。 */
const fullManifest = {
  name: '@hyzyn/dsh-tty',
  main: 'lib/index.js',
  types: 'lib/index.d.ts',
  exports: { '.': { types: './lib/index.d.ts', default: './lib/index.js' }, './client': './client.js', './package.json': './package.json' },
  dsh: { bundle: { patch: './cordis.patch.yml' }, client: { platform: 'web' } },
  files: ['lib', 'client.js', 'cordis.patch.yml', 'README.md', 'scripts'],
}

/** 一个 manifest 打出来的「正常」tarball 条目（与 files 一致，外加 package.json）。 */
const fullPacked = [
  'package.json',
  'lib/index.js',
  'lib/index.d.ts',
  'client.js',
  'cordis.patch.yml',
  'README.md',
]

describe('requiredEntries：从 manifest 现算，不写死清单', () => {
  it('把 main / types / exports / dsh.bundle.patch / dsh.client 全收进来', () => {
    const paths = requiredEntries(fullManifest).map((item) => item.path).sort()
    // package.json 也在列：`exports["./package.json"]` 同样是一条声明（npm 总会带它，
    // 但「声明了就要在」这条判据不该对它有例外——不然就得在闸门里写一张特例表）
    expect(paths).toEqual(['client.js', 'cordis.patch.yml', 'lib/index.d.ts', 'lib/index.js', 'package.json'])
  })

  it('声明了 dsh.client 就必须有 client.js——即使 exports 里没写它', () => {
    const manifest = { name: '@x/y', dsh: { client: { platform: 'web' } }, files: ['client.js'] }
    expect(requiredEntries(manifest)).toEqual([
      { path: 'client.js', why: ['dsh.client（宿主按 /client.js 加载浏览器半体）'] },
    ])
  })

  it('没声明 dsh.client 且 exports 不提 client 时，不该凭空要求 client.js', () => {
    // 反向：kit / all / 根 bundle 都没有浏览器半体，要求它们带 client.js 就是误报
    const manifest = { name: '@hyzyn/dsh-kit', main: 'lib/index.js', files: ['lib'] }
    expect(requiredEntries(manifest).map((item) => item.path)).toEqual(['lib/index.js'])
  })

  it('同一个路径被多条声明要求时合并理由（报错里要能一次看全）', () => {
    const withClient = requiredEntries(fullManifest).find((item) => item.path === 'client.js')
    expect(withClient.why).toHaveLength(2)
    expect(withClient.why.join(' ')).toContain('exports["./client"]')
    expect(withClient.why.join(' ')).toContain('dsh.client')
  })

  it('归一掉 `./` 前缀与尾部斜杠（两种写法指的是同一个路径）', () => {
    const manifest = { name: '@x/y', main: './lib/index.js', files: ['lib/'] }
    expect(requiredEntries(manifest).map((item) => item.path)).toEqual(['lib/index.js'])
  })
})

describe('collectExportPaths：递归取值，且不把非路径当路径', () => {
  it('条件对象里嵌套的路径全部收齐', () => {
    expect(collectExportPaths({ types: './a.d.ts', import: { default: './a.mjs' } })).toEqual(['./a.d.ts', './a.mjs'])
  })

  it('非 `./` 开头的值不算文件路径（不误报）', () => {
    expect(collectExportPaths({ node: 'node:fs', ok: './real.js' })).toEqual(['./real.js'])
  })
})

describe('检查：声明的入口必须真的在 tarball 里', () => {
  it('正常包绿，且检查数不是 0', () => {
    const { violations, checkedEntries } = checkPackageContents({
      targets: [target('packages/tty', fullManifest, fullPacked)],
    })
    expect(violations).toEqual([])
    expect(checkedEntries).toBeGreaterThan(0)
  })

  it('**核心反例**：files 里删掉 client.js → 红，且报错点名是哪些声明要求的', () => {
    // 这就是 2026-10-03 实测出的洞：删掉之后 13 道闸门 + 1698 条用例全绿
    const manifest = { ...fullManifest, files: fullManifest.files.filter((f) => f !== 'client.js') }
    const { violations } = checkPackageContents({
      targets: [target('packages/tty', manifest, fullPacked.filter((p) => p !== 'client.js'))],
    })
    expect(violations).toHaveLength(1)
    expect(violations[0]).toContain('client.js')
    expect(violations[0]).toContain('exports["./client"]')
    expect(violations[0]).toContain('dsh.client')
  })

  it('缺 main 同样红（不只是 client.js 这一条被覆盖）', () => {
    const { violations } = checkPackageContents({
      targets: [target('packages/kit', { name: '@hyzyn/dsh-kit', main: 'lib/index.js', files: [] }, ['package.json'])],
    })
    expect(violations).toHaveLength(1)
    expect(violations[0]).toContain('lib/index.js')
    expect(violations[0]).toContain('main')
  })

  it('缺 dsh.bundle.patch 同样红（cordis 补丁缺失 → 插件挂不上）', () => {
    const manifest = { ...fullManifest, files: fullManifest.files.filter((f) => f !== 'cordis.patch.yml') }
    const { violations } = checkPackageContents({
      targets: [target('packages/tty', manifest, fullPacked.filter((p) => p !== 'cordis.patch.yml'))],
    })
    expect(violations).toHaveLength(1)
    expect(violations[0]).toContain('dsh.bundle.patch')
  })

  it('files 里的死路径（磁盘上不存在）单独报一条——pnpm 会静默忽略它', () => {
    const manifest = { ...fullManifest, files: [...fullManifest.files, 'CHANGELOG.md'] }
    const { violations } = checkPackageContents({
      targets: [target('packages/tty', manifest, fullPacked, { 'CHANGELOG.md': false })],
    })
    expect(violations).toHaveLength(1)
    expect(violations[0]).toContain('CHANGELOG.md')
    expect(violations[0]).toContain('不存在')
  })

  it('目录型 files 条目（lib / scripts）不要求展开成文件——只要不报死路径就行', () => {
    const { violations } = checkPackageContents({ targets: [target('packages/tty', fullManifest, fullPacked)] })
    expect(violations).toEqual([])
  })
})

describe('真实仓库 · 真的打一次包', () => {
  /**
   * 这一组走子进程（`pnpm pack --dry-run --json`），是本闸真正的防线：fixture 只能证明
   * 判定逻辑对，不能证明「仓库当前的 files 字段真的把入口带出去了」。
   * 同时它顺带钉住 pnpm 的输出形态（根包给对象、子包给数组），解析写错就会在这里炸。
   */
  const inputs = readPackageContentsInputs()

  it('13 个发布目标都真的打出了包（不是「读空 = 恒绿」）', () => {
    expect(inputs.targets.length).toBeGreaterThanOrEqual(13)
    for (const item of inputs.targets) {
      expect(item.packed.length, `${item.dir} 打出来是空的`).toBeGreaterThan(0)
    }
  })

  it('每个包都至少解析出 1 个声明入口（判据 3：命中不是 0）', () => {
    for (const item of inputs.targets) {
      expect(requiredEntries(item.manifest).length, `${item.dir} 没解析出任何入口`).toBeGreaterThan(0)
    }
  })

  it('声明的入口全部在 tarball 里，且没有死路径', () => {
    expect(checkPackageContents(inputs).violations).toEqual([])
  })
})
