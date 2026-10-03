/**
 * `project-sites.ts` —— **站点声明随项目走**的读盘与合并判据。
 *
 * 这些用例钉的是三件事：
 *   1. 读清单的四态**互不混淆**：`ok` / 本目录没有声明（`missing`，不是错误）/ 空文件
 *      （`empty`，与「没有声明」是两件事）/ 读不了·解析不了·内容不成立（都要**指出原因**）；
 *   2. 行的校验用的是**卡片保存那一套**（`normalizeTargets`）——这里只证「它确实被用上了」
 *      （缺 url 的报错指到 `targets[0].url`），不重复它的用例；
 *   3. 合并是**并集**，而同一个 id 出现在两处**报错**（不静默取一个：两份声明可能给出不同的
 *      url / 范围 / 允许源，静默取一个的后果是「工具按哪份在动手」说不清）。
 *
 * 宿主侧的开关（`projectSitesFile` 为空 = 不读项目清单）在 `plugin.ts` 的 `sitesForCall`，
 * 它需要假宿主才能测——本包没有假宿主（见 ROADMAP 记-21 起记的那条），所以这里只钉纯判据。
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'

import { PROJECT_SITES_REL, loadProjectSites, mergeSites } from '../src/index.js'

const root = mkdtempSync(join(tmpdir(), 'dsh-devfront-sites-'))
afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

/** 造一个项目目录并写一份站点声明（清单在 `web/` 子目录里，与 `web/<项目>.yaml` 同一层）。 */
function withManifest(text: string): string {
  const dir = mkdtempSync(join(root, 'project-'))
  mkdirSync(join(dir, 'web'), { recursive: true })
  writeFileSync(join(dir, PROJECT_SITES_REL), text)
  return dir
}

describe('读项目站点声明', () => {
  it('本目录没有这份文件 → `missing`（**不是**错误，也不是「用默认站点」）', () => {
    const dir = mkdtempSync(join(root, 'empty-'))
    expect(loadProjectSites(dir)).toEqual({ kind: 'missing' })
  })

  it('正常一份 → `ok`，且行已过校验（去空白、空字段不占位）', () => {
    const dir = withManifest(
      [
        'version: 1',
        'sites:',
        '  - id: app',
        '    label: "  应用  "',
        '    url: https://app.test/',
        '    scopeDirs: [/Users/me/work/app, ""]',
        '    allowedOrigins: [https://sso.test]',
        '    viewport: 390x844',
        '',
      ].join('\n'),
    )
    expect(loadProjectSites(dir)).toEqual({
      kind: 'ok',
      sites: [
        {
          id: 'app',
          label: '应用',
          url: 'https://app.test/',
          scopeDirs: ['/Users/me/work/app'],
          allowedOrigins: ['https://sso.test'],
          viewport: '390x844',
        },
      ],
    })
  })

  it('YAML 语法错 → `problem` 且说明是语法问题（不是「没有声明」）', () => {
    const dir = withManifest('version: 1\nsites: [\n')
    const read = loadProjectSites(dir)
    expect(read.kind).toBe('problem')
    if (read.kind === 'problem') expect(read.message).toContain('YAML')
  })

  it('空文件 → `problem`：空文件与「没有声明」是两件事', () => {
    const dir = withManifest('')
    const read = loadProjectSites(dir)
    expect(read.kind).toBe('problem')
    if (read.kind === 'problem') expect(read.message).toContain('空的')
  })

  it('version 不对 → 报出实际值；不是 mapping → 报出形状', () => {
    const v = loadProjectSites(withManifest('version: 2\nsites: []\n'))
    expect(v.kind).toBe('problem')
    if (v.kind === 'problem') expect(v.message).toContain('2')

    const shape = loadProjectSites(withManifest('- a\n- b\n'))
    expect(shape.kind).toBe('problem')
    if (shape.kind === 'problem') expect(shape.message).toContain('mapping')
  })

  it('行的校验走卡片保存那一套：缺 url 时**指到 `targets[0].url`**', () => {
    const dir = withManifest('version: 1\nsites:\n  - id: app\n')
    const read = loadProjectSites(dir)
    expect(read.kind).toBe('problem')
    if (read.kind === 'problem') expect(read.message).toContain('targets[0].url')
  })

  it('`file` 参数可换路径（缺省是 `web/sites.yaml`）', () => {
    const dir = mkdtempSync(join(root, 'alt-'))
    writeFileSync(join(dir, 'sites.yaml'), 'version: 1\nsites:\n  - id: a\n    url: https://a.test/\n')
    expect(loadProjectSites(dir, 'sites.yaml').kind).toBe('ok')
    expect(loadProjectSites(dir).kind).toBe('missing')
  })
})

describe('profile 与项目的站点合并', () => {
  const profile = [{ id: 'p1', url: 'https://p1.test/' }]
  const projectSites = [{ id: 'j1', url: 'https://j1.test/' }]

  it('并集：profile 在前、项目在后（顺序是给人看的，别打乱）', () => {
    expect(mergeSites(profile, projectSites)).toEqual({ sites: [...profile, ...projectSites] })
  })

  it('两边都空 = 空并集（调用方自己决定「没有站点」怎么办）', () => {
    expect(mergeSites([], [])).toEqual({ sites: [] })
  })

  it('**同一个 id 出现在两处 → 报错**，并说清该改哪一处（不静默取一个）', () => {
    const result = mergeSites(profile, [{ id: 'p1', url: 'https://other.test/' }])
    expect('problem' in result).toBe(true)
    if ('problem' in result) {
      expect(result.problem).toContain('p1')
      expect(result.problem).toContain('web/sites.yaml')
      expect(result.problem).toContain('只留一份')
    }
  })

  it('项目内部自己重名由行校验拦掉（这里看到的 id 已经是唯一的）', () => {
    const dup = mergeSites([], [{ id: 'a' }, { id: 'a' }])
    expect(dup).toEqual({ sites: [{ id: 'a' }, { id: 'a' }] })
  })
})
