/**
 * **发布清单**（`release/<发布名>.yaml`）的加载与校验（`src/release.ts`）。
 *
 * 这一层的失败方式与三份清单同族：**清单读错不会崩，它会报绿**——比如把 `projects` 写成
 * `Projects`（未知字段静默忽略 → 一个项目都不跑），或者文件名与 `release` 字段不一致
 * （报告看起来没问题，跑的是别的发布）。所以用例的重点是「该拒的有没有被拒」。
 *
 * 纯逻辑 + 真文件：读盘那一跳复用三份清单同一份骨架（`@hyzyn/dsh-kit/manifest`），
 * 所以这里连 YAML 语法错 / 空文件 / 两个根都对上这些分支一起验。
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  listReleaseManifests,
  loadReleaseManifest,
  releaseManifestRelativePath,
  releaseOverall,
  resolveProjectRoot,
  validateReleaseManifest,
} from '../src/index.js'

const RELEASE = '2026-10-04-hg'
const dirs: string[] = []

/** 造一个工作目录（`files` 的键是相对路径）。 */
function workdir(files: Record<string, string> = {}): string {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-release-'))
  dirs.push(dir)
  for (const [rel, text] of Object.entries(files)) {
    const file = join(dir, rel)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, text)
  }
  return dir
}

/** 一份合法发布清单的文本。 */
function yaml(overrides: { release?: string; projects?: string } = {}): string {
  return [
    'version: 1',
    `release: ${overrides.release ?? RELEASE}`,
    'projects:',
    overrides.projects ??
      ['  - project: cdqas', '    root: ../cdqas', '    target: cdqas-test', '  - project: ems', '    root: ../ems', '    target: ems-test'].join(
        '\n',
      ),
    '',
  ].join('\n')
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('发布清单：校验', () => {
  it('合法清单通过，`projects` 逐行是小写的 {project, root, target}', () => {
    const result = validateReleaseManifest(RELEASE, {
      version: 1,
      release: RELEASE,
      projects: [
        { project: 'cdqas', root: '../cdqas', target: 'cdqas-test' },
        { project: 'ems', root: '../ems', target: 'ems-test' },
      ],
    })
    expect(result.ok, result.ok ? '' : JSON.stringify(result.errors)).toBe(true)
    if (result.ok) expect(result.manifest.projects.map((p) => p.project)).toEqual(['cdqas', 'ems'])
  })

  it('文件名的发布名 ≠ 清单里的 `release` → 配置错误（防复制粘贴改漏，跑的是别的发布）', () => {
    const result = validateReleaseManifest(RELEASE, { version: 1, release: 'ems', projects: [{ project: 'cdqas', root: '..', target: 't' }] })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(JSON.stringify(result.errors)).toContain('不一致')
  })

  it('**未知字段一律拒**：把 `projects` 写成 `Projects` 不许静默当成空集合', () => {
    // 这正是「静默忽略一个写错的键名 → 工具去跑一套空集合、报告还是绿的」那条路
    const result = validateReleaseManifest(RELEASE, { version: 1, release: RELEASE, Projects: [] })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      const text = JSON.stringify(result.errors)
      expect(text).toContain('未知字段')
      expect(text).toContain('projects')
    }
  })

  it('`projects` 空 / 不是数组 / 行不是映射 → 都拒（空清单不该报绿）', () => {
    for (const bad of [{ projects: [] }, { projects: 'cdqas' }, { projects: ['cdqas'] }]) {
      const result = validateReleaseManifest(RELEASE, { version: 1, release: RELEASE, ...bad })
      expect(result.ok, JSON.stringify(bad)).toBe(false)
    }
  })

  it('同一个项目列两遍 → 拒（同一个项目跑两遍，报告点名会指错）', () => {
    const result = validateReleaseManifest(RELEASE, {
      version: 1,
      release: RELEASE,
      projects: [
        { project: 'cdqas', root: '../cdqas', target: 't' },
        { project: 'cdqas', root: '../cdqas2', target: 't' },
      ],
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(JSON.stringify(result.errors)).toContain('重复')
  })

  it('project / root / target 有一个空 → 拒，且**指名到字段**', () => {
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ project: '', root: '..', target: 't' }, 'projects[0].project'],
      [{ project: 'cdqas', root: '  ', target: 't' }, 'projects[0].root'],
      [{ project: 'cdqas', root: '..', target: '' }, 'projects[0].target'],
    ]
    for (const [row, path] of cases) {
      const result = validateReleaseManifest(RELEASE, { version: 1, release: RELEASE, projects: [row] })
      expect(result.ok, JSON.stringify(row)).toBe(false)
      if (!result.ok) expect(result.errors.map((error) => error.path)).toContain(path)
    }
  })
})

describe('发布清单：读盘（与三份清单同一份骨架）', () => {
  it('读到了 → ok，并带出**文件路径**（`root` 相对它解析）', () => {
    const dir = workdir({ [`release/${RELEASE}.yaml`]: yaml() })
    const loaded = loadReleaseManifest(RELEASE, { roots: [dir] })
    expect(loaded.kind).toBe('ok')
    if (loaded.kind === 'ok') {
      expect(loaded.file).toBe(join(dir, 'release', `${RELEASE}.yaml`))
      expect(loaded.manifest.projects[0]?.target).toBe('cdqas-test')
    }
  })

  it('没有这份文件 = `no-manifest`（**缺省即无**，不回落默认项目）', () => {
    const loaded = loadReleaseManifest(RELEASE, { roots: [workdir()] })
    expect(loaded.kind).toBe('no-manifest')
  })

  it('YAML 语法错 / 空文件 → 两种不同的结果（一个读不进来、一个写错了）', () => {
    const broken = loadReleaseManifest(RELEASE, { roots: [workdir({ [`release/${RELEASE}.yaml`]: 'version: [1\n' })] })
    expect(broken.kind).toBe('unreadable')
    const empty = loadReleaseManifest(RELEASE, { roots: [workdir({ [`release/${RELEASE}.yaml`]: '' })] })
    expect(empty.kind).toBe('config-error')
    if (empty.kind === 'config-error') expect(JSON.stringify(empty.errors)).toContain('是空的')
  })

  it('两个根下都有 → 歧义（`unreadable`），不静默取一个', () => {
    const a = workdir({ [`release/${RELEASE}.yaml`]: yaml() })
    const b = workdir({ [`release/${RELEASE}.yaml`]: yaml() })
    const loaded = loadReleaseManifest(RELEASE, { roots: [a, b] })
    expect(loaded.kind).toBe('unreadable')
    if (loaded.kind === 'unreadable') expect(loaded.message).toContain('歧义')
  })

  it('路径口径只有一处：`release/<发布名>.yaml`', () => {
    expect(releaseManifestRelativePath(RELEASE)).toBe(`release/${RELEASE}.yaml`)
  })

  it('`listReleaseManifests` 只认 `release/*.yaml`（给「这里现在有哪些」那句对照用）', () => {
    const dir = workdir({
      [`release/${RELEASE}.yaml`]: yaml(),
      'release/another.yaml': yaml({ release: 'another' }),
      'release/notes.txt': '不是清单',
      'web/x.yaml': '不是发布清单',
    })
    expect(listReleaseManifests(dir)).toEqual(['2026-10-04-hg', 'another'].sort())
    expect(listReleaseManifests(join(dir, 'nowhere'))).toEqual([])
  })
})

describe('发布清单：项目根的解析与整批判定', () => {
  it('`root` 相对**发布清单所在的目录**解析（跟着发布走，不是跟着进程的工作目录）', () => {
    const file = '/w/releases/release/r1.yaml'
    expect(resolveProjectRoot('../cdqas', file)).toBe('/w/releases/cdqas')
    expect(resolveProjectRoot('.', file)).toBe('/w/releases/release')
    // 绝对路径原样
    expect(resolveProjectRoot('/srv/cdqas', file)).toBe('/srv/cdqas')
  })

  it('整批判定：`fail` > `warn` > `unknown` > `pass`；**没跑成的项目算 unknown**', () => {
    expect(releaseOverall(['pass', 'pass'])).toBe('pass')
    expect(releaseOverall(['pass', 'unknown'])).toBe('unknown')
    expect(releaseOverall(['unknown', 'warn'])).toBe('warn')
    expect(releaseOverall(['warn', 'fail'])).toBe('fail')
    // 反例：把「没跑成」当成 pass 的那种实现会在这里给出 'pass'——所以上一条不是恒绿的
    expect(releaseOverall(['unknown'])).not.toBe('pass')
  })
})
