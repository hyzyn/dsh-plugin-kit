/**
 * `PANEL_DIRECTORY` 的 `registryName` 对账守卫（ROADMAP P0-乙 第 5 项：「无守卫 → 补一条」）。
 *
 * ## 为什么要有它
 *
 * `packages/search/src/index.ts` 的 `PANEL_DIRECTORY` 里每条插件卡片都带一个 `registryName`，
 * `listPanels()` 拿它去和宿主注册表对，**不在册就静默跳过那张卡片**。所以写错一个字的后果是
 * 「全局搜索里这张卡片凭空消失」——插件装得好好的，界面不报错、控制台也不报错。
 * 2026-10-11 有过同类现场：docker 那条卡片当时**根本没有 `registryName`**，于是搜 Docker 搜不到
 * （见 `panel-catalog.test.ts` 的补漏注释）。
 *
 * 现有用例走的是「一路喂进注册表名单」，它证明的是**门禁有效**；但它不知道 `registryName` 该等于什么。
 * 那件事的真相在**每个包自己**的 `cordis.patch.yml` 里：那一行「`- id: <loader id>` + `name:
 * '@hyzyn/dsh-<pkg>'`」中 `name` 等于本包 `package.json#name` 的那条，就是这个包自己的插件 id。
 * （聚合包 `all` 的补丁里也有一堆别人的行，靠「`name` 必须等于本包名」把它们排除掉。）
 *
 * ## 判据（不许「匹配不到就算过」）
 *
 * 1. 目录里每个 `registryName` 都要能在某个包自己的补丁行里找到（挡拼写错、挡插件改名后目录没跟）；
 * 2. 同一个 id 只能被一个包声明（挡复制粘贴）；
 * 3. `names.length > 0`：抽取正则哪天失效，这条要红，而不是静默变成空测；
 * 4. 纯函数用 fixture 自证会红（不存在的名字 / 重复声明）。
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/** 仓库根（本文件在 `packages/search/test/` 下）。 */
const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url))
const SEARCH_INDEX = join(REPO_ROOT, 'packages', 'search', 'src', 'index.ts')

/** 从 `PANEL_DIRECTORY` 源码里抽出全部 `registryName: '…'`。 */
function readRegistryNames(source) {
  return [...source.matchAll(/registryName:\s*'([^']+)'/g)].map((match) => match[1])
}

/**
 * 现算「一个 loader id 被哪些包**自己**声明」。
 *
 * 只认「`- id: <x>` 紧跟 `name: '<本包 package.json 的 name>'`」那种配对：聚合包 `all` 的补丁里
 * 有十几个别人的行，不这么筛会把每个 id 都算成「被两个包声明」。
 */
function readDeclaredIds(packagesDir = join(REPO_ROOT, 'packages')) {
  const byId = new Map()
  for (const dir of readdirSync(packagesDir)) {
    const pkgDir = join(packagesDir, dir)
    let manifest
    let patch
    try { manifest = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8')) } catch { continue }
    try { patch = readFileSync(join(pkgDir, 'cordis.patch.yml'), 'utf8') } catch { continue }
    for (const match of patch.matchAll(/-\s*id:\s*(\S+)[ \t]*\n\s*name:\s*'([^']+)'/g)) {
      if (match[2] !== manifest.name) continue
      byId.set(match[1], [...(byId.get(match[1]) ?? []), dir])
    }
  }
  return byId
}

/** 纯判定：目录里的名字 vs「id → 自己声明它的包」。 */
function findRegistryNameViolations(names, byId) {
  const violations = []
  for (const id of names) {
    const owners = byId.get(id)
    if (owners === undefined) violations.push(`registryName '${id}' 没有任何包自己声明它（拼写错？插件改名后目录没跟？）`)
    else if (owners.length > 1) violations.push(`registryName '${id}' 被多个包声明：${owners.join(' / ')}`)
  }
  return violations
}

describe('真实仓库 · 面板目录的 registryName 与插件 id 必须一一对上', () => {
  const names = readRegistryNames(readFileSync(SEARCH_INDEX, 'utf8'))
  const byId = readDeclaredIds()

  it('抽取到了目录里的 registryName（防正则失效后静默变空测）', () => {
    expect(names.length).toBeGreaterThan(0)
  })

  it('每个 registryName 都能在某个包自己的补丁行里找到，且只被一个包声明', () => {
    expect(findRegistryNameViolations(names, byId)).toEqual([])
  })

  it('loglens 在目录里，并且指向 packages/loglens（2026-10-11 建包时补的条目）', () => {
    expect(names).toContain('loglens')
    expect(byId.get('loglens')).toEqual(['loglens'])
  })
})

describe('纯函数自证：该红的时候红', () => {
  it('目录里有个不存在的 registryName → 报', () => {
    expect(findRegistryNameViolations(['no-such-plugin'], new Map([['x', ['x']]]))).toHaveLength(1)
  })

  it('同一个 id 被两个包声明 → 报', () => {
    expect(findRegistryNameViolations(['dup'], new Map([['dup', ['a', 'b']]]))).toHaveLength(1)
  })

  it('空目录 → 不报（「抽取失效」由上面那条 length > 0 拦）', () => {
    expect(findRegistryNameViolations([], new Map())).toEqual([])
  })
})