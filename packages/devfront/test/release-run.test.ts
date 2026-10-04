/**
 * 发布跑批执行器（`src/release-run.ts`）：**一次调用跨多个项目**的循环与「没跑成」的账。
 *
 * ## 它守的是什么
 *
 * 循环本身不会错，错的是**边界**：一个项目不成立（没配站点 / 没有清单 / 清单不成立 / 那份清单里
 * 没有这个站点的断言）时，是**砸掉整批**、还是记一笔账继续跑？取消之后没轮到的项目，账怎么补？
 * 这两种情形下最坏的结局都是同一个：**报告看起来是绿的/红的，而实际什么都没验**。
 *
 * 依赖全是注入的（`sitesFor` / `loadManifest` / `runProject`），所以这里不连浏览器、不起宿主，
 * 也能把七种结局逐条钉住。
 *
 * ## 反例
 *
 * 「没跑成算 unknown」这条配了反例：把那些结局当成 `pass` 的坏实现会让整批变绿——两种答案不同，
 * 说明断言不是恒绿的。
 */

import { describe, expect, it } from 'vitest'

import {
  releaseOverall,
  runReleaseVerify,
  runWebVerify,
  type ReleaseManifest,
  type WebAssertion,
  type WebDriver,
  type WebManifestLoad,
  type WebTarget,
} from '../src/index.js'

const SITE: WebTarget = { id: 'site-1', label: '站点一', url: 'https://x.test/', scopeDirs: ['/w'] }
const FILE = '/w/releases/release/2026-10-04-hg.yaml'

/** 一条能通过的断言（`observe` 的假驱动会给出「订单列表」这段文本）。 */
function assertion(project: string, target = SITE.id): WebAssertion {
  return {
    id: `${project}-list`,
    project,
    url: 'https://x.test/order',
    target,
    expect: { toContain: '订单列表' },
    severity: 'fail',
  }
}

/** 一份能过的项目清单。 */
function manifest(project: string, target = SITE.id): WebManifestLoad {
  return { kind: 'ok', manifest: { version: 1, project, assertions: [assertion(project, target)] } }
}

/** 假驱动：只回答这一份夹具需要的两件事。 */
function fakeDriver(): WebDriver {
  return {
    open: async ({ url }) => ({ url, title: '订单列表' }),
    screenshot: async () => ({ path: '/tmp/x.png', width: 100, height: 100 }),
    click: async () => {},
    fill: async () => {},
    text: async () => '订单列表',
    currentUrl: async () => 'https://x.test/order',
    console: async () => [],
    observe: async ({ selectors }) => ({
      url: 'https://x.test/order',
      text: '订单列表',
      elements: Object.fromEntries(selectors.map((selector) => [selector, { count: 1, text: '订单列表' }])),
      console: [],
    }),
  }
}

/** 一次真实的项目跑批（复用 `runWebVerify` 与假驱动）。 */
const runProject = (request: {
  target: WebTarget
  root: string
  project: string
  assertions: readonly WebAssertion[]
  signal?: AbortSignal
}) =>
  runWebVerify({
    ...request,
    cwd: request.root,
    driver: fakeDriver(),
  })

function release(projects: Array<{ project: string; root: string; target: string }>): ReleaseManifest {
  return { version: 1, release: '2026-10-04-hg', projects }
}

const THREE = release([
  { project: 'cdqas', root: '../cdqas', target: SITE.id },
  { project: 'ems', root: '../ems', target: SITE.id },
])

describe('发布跑批：顺序与真跑', () => {
  it('按发布清单顺序跑；每个项目的判定与整批的判定都对得上', async () => {
    const run = await runReleaseVerify({
      manifest: THREE,
      file: FILE,
      sitesFor: () => ({ sites: [SITE] }),
      loadManifest: (project) => manifest(project),
      runProject,
    })

    expect(run.projects.map((project) => project.project)).toEqual(['cdqas', 'ems'])
    expect(run.verdicts).toEqual(['pass', 'pass'])
    expect(run.problems).toEqual([])
    expect(run.cancelled).toBe(false)
    expect(releaseOverall(run.verdicts)).toBe('pass')
  })

  it('项目根按发布清单所在目录解析（`../cdqas` → 传给站点/清单那一跳的是绝对路径）', async () => {
    const roots: string[] = []
    await runReleaseVerify({
      manifest: release([{ project: 'cdqas', root: '../cdqas', target: SITE.id }]),
      file: FILE,
      sitesFor: (root) => {
        roots.push(root)
        return { sites: [SITE] }
      },
      loadManifest: (project) => manifest(project),
      runProject,
    })
    expect(roots).toEqual(['/w/releases/cdqas'])
  })
})

describe('发布跑批：一个项目不成立**不砸整批**，且一律记「没验成」', () => {
  it('① 站点声明读不出来 → 记一笔 + `unknown`，其余项目照跑', async () => {
    const run = await runReleaseVerify({
      manifest: THREE,
      file: FILE,
      sitesFor: (root) => (root.endsWith('cdqas') ? { problem: '两份站点声明冲突' } : { sites: [SITE] }),
      loadManifest: (project) => manifest(project),
      runProject,
    })

    expect(run.projects.map((project) => project.project)).toEqual(['ems'])
    expect(run.verdicts).toEqual(['unknown', 'pass'])
    expect(run.problems.join('\n')).toContain('cdqas')
    expect(run.problems.join('\n')).toContain('站点声明')
    expect(releaseOverall(run.verdicts)).toBe('unknown')
  })

  it('② 站点没配在这个项目里 → 记一笔，并给出可用名单', async () => {
    const run = await runReleaseVerify({
      manifest: release([{ project: 'cdqas', root: '../cdqas', target: 'nope' }]),
      file: FILE,
      sitesFor: () => ({ sites: [SITE] }),
      loadManifest: (project) => manifest(project),
      runProject,
    })
    expect(run.projects).toEqual([])
    expect(run.verdicts).toEqual(['unknown'])
    expect(run.problems.join('\n')).toContain('nope')
    expect(run.problems.join('\n')).toContain('site-1')
  })

  it('③ 项目里没有清单 / ④ 清单不成立 / ⑤ 清单里没有这个站点的断言 → 三种都记「没验成」', async () => {
    const cases: Array<{ load: (project: string) => WebManifestLoad; must: string }> = [
      { load: () => ({ kind: 'no-manifest', project: 'cdqas' }), must: '没有 web/cdqas.yaml' },
      {
        load: () => ({ kind: 'config-error', project: 'cdqas', errors: [{ path: 'assertions[0].url', message: '必须是非空 URL' }] }),
        must: 'assertions[0].url',
      },
      { load: (project) => manifest(project, 'other-site'), must: '没有给站点 site-1 的断言' },
    ]
    for (const item of cases) {
      const run = await runReleaseVerify({
        manifest: release([{ project: 'cdqas', root: '../cdqas', target: SITE.id }]),
        file: FILE,
        sitesFor: () => ({ sites: [SITE] }),
        loadManifest: item.load,
        runProject,
      })
      expect(run.projects).toEqual([])
      expect(run.verdicts).toEqual(['unknown'])
      expect(run.problems.join('\n'), item.must).toContain(item.must)
    }
  })

  it('反例：把「没跑成」当成 `pass` 的坏实现会让整批变绿——所以上面那几条不是恒绿的', async () => {
    const run = await runReleaseVerify({
      manifest: release([{ project: 'cdqas', root: '../cdqas', target: SITE.id }]),
      file: FILE,
      sitesFor: () => ({ sites: [] }),
      loadManifest: (project) => manifest(project),
      runProject,
    })
    expect(releaseOverall(run.verdicts)).toBe('unknown')
    // 坏实现（把没验成的项目也算成通过）会得到相反的答案
    expect(releaseOverall(['pass'])).toBe('pass')
  })
})

describe('发布跑批：取消自成一档', () => {
  it('取消之后：跑过的留在 projects，**没轮到的逐条补账**并算 `unknown`', async () => {
    const controller = new AbortController()
    let calls = 0
    const run = await runReleaseVerify({
      manifest: THREE,
      file: FILE,
      sitesFor: () => ({ sites: [SITE] }),
      loadManifest: (project) => manifest(project),
      runProject: async (request) => {
        // 第一个项目**正常跑完之后**取消（模拟「调用方不等了」：第二个项目还没开始）
        const result = await runProject(request)
        calls += 1
        if (calls === 1) controller.abort()
        return result
      },
      signal: controller.signal,
    })

    expect(run.cancelled).toBe(true)
    expect(run.projects.map((project) => project.project)).toEqual(['cdqas'])
    expect(run.verdicts).toEqual(['pass', 'unknown'])
    expect(run.problems.join('\n')).toContain('ems')
    expect(run.problems.join('\n')).toContain('被调用方取消')
    // 取消不是失败：整批判 `unknown` 而不是 `fail`
    expect(releaseOverall(run.verdicts)).toBe('unknown')
  })

  it('取消**不会给已经有结论的项目**重复补账（配置问题那条不会被改写成「取消」）', async () => {
    const controller = new AbortController()
    controller.abort()
    const run = await runReleaseVerify({
      manifest: release([
        { project: 'cdqas', root: '../cdqas', target: SITE.id },
        { project: 'ems', root: '../ems', target: SITE.id },
      ]),
      file: FILE,
      sitesFor: () => ({ sites: [] }),
      loadManifest: (project) => manifest(project),
      runProject,
      signal: controller.signal,
    })
    // 一上来就取消：两个项目都只记一次（取消），不会既记配置问题又记取消
    expect(run.cancelled).toBe(true)
    expect(run.problems.filter((problem) => problem.includes('被调用方取消'))).toHaveLength(2)
    expect(run.verdicts).toEqual(['unknown', 'unknown'])
  })
})
