/**
 * **工具级**的站点解析：`sitesForCall(input.cwd)` —— profile 的站点 + 项目清单的站点。
 *
 * 这一层此前没有覆盖（本包一直没有假宿主夹具，ROADMAP 记-21 起记着这条）：纯函数（`loadProjectSites`
 * / `mergeSites`）有单测、真机脚本走的是 HTTP 数据面，而「工具调用时按 `cwd` 去读项目清单」这段**接线**
 * 没人测。这里用假宿主把它补上。
 *
 * ## 为什么这些用例**不会**去开浏览器
 *
 * `run()` 的顺序是：解析清单 → `pickTarget` → 才 `ensureDriver()`。所以拿一个**不存在的 target**
 * 调用工具，错误在 `pickTarget` 就抛了，浏览器根本不会被启动——而那条错误消息里的**可用站点名单**
 * 恰好就是本层要验的东西（合并后的清单长什么样）。
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'

import { PROJECT_SITES_REL } from '../src/index.js'

import { makeHost } from './fake-host.js'

const root = mkdtempSync(join(tmpdir(), 'dsh-devfront-tools-'))
afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

/** 造一个项目目录；给了 `sites` 就写一份 `web/sites.yaml`。 */
function project(sites?: Record<string, unknown>[]): string {
  const dir = mkdtempSync(join(root, 'project-'))
  if (sites !== undefined) writeProjectSites(dir, sites)
  return dir
}

/** 往一个**已存在**的目录里写站点声明（要用 `dir` 自己当 `scopeDirs` 时得先有目录）。 */
function writeProjectSites(dir: string, sites: Record<string, unknown>[]): void {
  mkdirSync(join(dir, 'web'), { recursive: true })
  writeFileSync(join(dir, PROJECT_SITES_REL), JSON.stringify({ version: 1, sites }))
}

const PROFILE_SITE = { id: 'p1', url: 'https://p1.test/', scopeDirs: [process.cwd()] }

describe('工具级：站点清单按 cwd 解析', () => {
  it('八个工具都注册了（启用 + 有站点），且没有站点时一个都不注册', () => {
    const on = makeHost()
    on.mount({ enabled: true, targets: [PROFILE_SITE] })
    expect(on.names()).toEqual([
      'site_click',
      'site_console',
      'site_fill',
      'site_open',
      'site_shot',
      'site_text',
      'site_verify',
      // 发布跑批（2026-10-04）：一次调用跨多个项目，集合由人写在 `release/<发布名>.yaml` 里
      'site_verify_release',
    ])

    const off = makeHost()
    off.mount({ enabled: true, targets: [] })
    expect(off.names()).toEqual([])
  })

  it('配置卡片的数据面路由注册了（`/api/dsh-devfront/config`）', () => {
    const host = makeHost()
    host.mount({ enabled: true, targets: [PROFILE_SITE] })
    expect([...host.routes.keys()]).toEqual(['/api/dsh-devfront/config'])
  })

  it('开关**缺省关闭**：项目清单就在 cwd 下，工具也看不见它（只列 profile 的站点）', async () => {
    const host = makeHost()
    host.mount({ enabled: true, targets: [PROFILE_SITE] })
    const dir = project([{ id: 'j1', url: 'https://j1.test/' }])
    const message = await host.callError('site_open', { target: 'nope', cwd: dir })
    expect(message).toContain('p1')
    expect(message).not.toContain('j1')
  })

  it('开关打开 → **并集**：profile 与项目两边的 id 都在可用名单里', async () => {
    const host = makeHost()
    host.mount({ enabled: true, projectSitesFile: PROJECT_SITES_REL, targets: [PROFILE_SITE] })
    const dir = project([{ id: 'j1', url: 'https://j1.test/' }])
    const message = await host.callError('site_open', { target: 'nope', cwd: dir })
    expect(message).toContain('p1')
    expect(message).toContain('j1')
  })

  it('开关打开、但**这个目录**没有清单 → 安静地只用 profile（不是错误）', async () => {
    const host = makeHost()
    host.mount({ enabled: true, projectSitesFile: PROJECT_SITES_REL, targets: [PROFILE_SITE] })
    const message = await host.callError('site_open', { target: 'nope', cwd: project() })
    expect(message).toContain('p1')
    expect(host.loggerLines().some((line) => line.includes('项目站点声明'))).toBe(false)
  })

  it('同一个 id 两处都有 → 报错（不静默取一个），并说清只留一份', async () => {
    const host = makeHost()
    host.mount({ enabled: true, projectSitesFile: PROJECT_SITES_REL, targets: [PROFILE_SITE] })
    const dir = project([{ id: 'p1', url: 'https://elsewhere.test/' }])
    const message = await host.callError('site_open', { target: 'p1', cwd: dir })
    expect(message).toContain('p1')
    expect(message).toContain('只留一份')
  })

  it('清单不成立（缺 url）→ 报错**指到字段**（而不是「没有这个站点」）', async () => {
    const host = makeHost()
    host.mount({ enabled: true, projectSitesFile: PROJECT_SITES_REL, targets: [PROFILE_SITE] })
    const dir = project([{ id: 'j1' }])
    const message = await host.callError('site_open', { target: 'p1', cwd: dir })
    expect(message).toContain('targets[0].url')
  })

  it('`cwd` 缺省时用宿主进程的工作目录（空作用域那条 fail-closed 判据不因此被绕过）', async () => {
    const host = makeHost()
    host.mount({ enabled: true, projectSitesFile: PROJECT_SITES_REL, targets: [PROFILE_SITE] })
    // 不传 cwd：解析落在 process.cwd()（本仓根），那里没有 web/sites.yaml → 只用 profile
    const message = await host.callError('site_open', { target: 'nope' })
    expect(message).toContain('p1')
  })

  it('缺 target 参数**在宿主那层**就被 schema 挡住（`pickTarget` 里的空 id 分支只是兜底）', async () => {
    const host = makeHost()
    host.mount({ enabled: true, projectSitesFile: PROJECT_SITES_REL, targets: [PROFILE_SITE] })
    const dir = project([{ id: 'j1', url: 'https://j1.test/' }])
    const message = await host.callError('site_open', { cwd: dir })
    // 这条由 `defineTool` 的参数校验给出，**早于** execute：所以「有哪些站点」只能从
    // 「target 不存在」那条消息里读到（上面那几条断言用的就是它）。
    expect(message).toContain('missing required property')
    expect(message).toContain('target')
  })

  it('卸载后工具与路由都不留（宿主重挂不会撞名）', () => {
    const host = makeHost()
    host.mount({ enabled: true, targets: [PROFILE_SITE] })
    expect(host.names().length).toBe(8)
    host.unmount()
    expect(host.names()).toEqual([])
    expect([...host.routes.keys()]).toEqual([])
  })

  it('配置广播（volatile-update）后清单跟着变：新 id 立刻可用', async () => {
    const host = makeHost()
    host.mount({ enabled: true, targets: [PROFILE_SITE] })
    await host.update({ targets: [PROFILE_SITE, { id: 'p2', url: 'https://p2.test/' }] })
    const message = await host.callError('site_open', { target: 'nope' })
    expect(message).toContain('p2')
  })
})

/** 造一个项目目录并写一份验活清单（`web/<项目>.yaml`）。 */
function projectWithManifest(project: string, manifest: Record<string, unknown>): string {
  const dir = mkdtempSync(join(root, 'verify-'))
  mkdirSync(join(dir, 'web'), { recursive: true })
  writeFileSync(join(dir, 'web', `${project}.yaml`), JSON.stringify(manifest))
  return dir
}

/** 一条合法断言（URL 落在 `PROFILE_SITE` 的站点范围内）。 */
const assertion = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'a1',
  url: 'https://p1.test/order',
  target: 'p1',
  expect: { toContain: '订单' },
  severity: 'fail',
  ...overrides,
})

/**
 * `site_verify` 的**整体性**问题：清单读不到 / 不成立 / 没有这个目标的断言。
 *
 * 这些判据全部发生在 `ensureDriver()` **之前**——所以这一组用例既不碰浏览器，也不需要 Chrome。
 * 而它们恰恰是最容易写坏的一段：报一句「加载失败」而不说路径与对照，agent 只能猜目录。
 */
describe('工具级：site_verify 的清单问题在碰浏览器之前说清', () => {
  it('没有清单 → 报出找的那个路径，并说清 web/ 下现在有什么', async () => {
    const host = makeHost()
    host.mount({ enabled: true, targets: [PROFILE_SITE] })
    const message = await host.callError('site_verify', { target: 'p1', project: 'p1', cwd: project() })
    expect(message).toContain('web/p1.yaml')
    expect(message).toContain('一份清单都没有')
  })

  it('目录里有别的清单 → 报**对照**（项目名与文件名不一致是最常见的写错方式）', async () => {
    const host = makeHost()
    host.mount({ enabled: true, targets: [PROFILE_SITE] })
    const dir = projectWithManifest('ems', { version: 1, project: 'ems', assertions: [assertion({ target: 'p1' })] })
    const message = await host.callError('site_verify', { target: 'p1', cwd: dir })
    expect(message).toContain('现在有这些清单：ems')
  })

  it('`project` 缺省取 cwd 的目录名（清单随项目走）', async () => {
    const host = makeHost()
    host.mount({ enabled: true, targets: [PROFILE_SITE] })
    const dir = project()
    const base = dir.split('/').pop() ?? ''
    const message = await host.callError('site_verify', { target: 'p1', cwd: dir })
    expect(message).toContain(`web/${base}.yaml`)
  })

  it('清单里没有这个目标的断言 → 说清这份清单声明了哪些 target（给 agent 出路）', async () => {
    const host = makeHost()
    host.mount({ enabled: true, targets: [PROFILE_SITE] })
    const dir = projectWithManifest('p1', {
      version: 1,
      project: 'p1',
      assertions: [assertion({ target: 'w-elsewhere' })],
    })
    const message = await host.callError('site_verify', { target: 'p1', project: 'p1', cwd: dir })
    expect(message).toContain('没有给目标 p1 的断言')
    expect(message).toContain('w-elsewhere')
  })

  it('清单内容不成立 → 指到字段（不是「没找到清单」）', async () => {
    const host = makeHost()
    host.mount({ enabled: true, targets: [PROFILE_SITE] })
    const dir = projectWithManifest('p1', { version: 1, project: 'p1', assertions: [assertion({ url: 'ftp://x/' })] })
    const message = await host.callError('site_verify', { target: 'p1', project: 'p1', cwd: dir })
    expect(message).toContain('assertions[0].url')
  })

  it('站点声明两处冲突时，同样在开工前报出来（不是跑到一半才发现）', async () => {
    const host = makeHost()
    host.mount({ enabled: true, projectSitesFile: PROJECT_SITES_REL, targets: [PROFILE_SITE] })
    const dir = projectWithManifest('p1', { version: 1, project: 'p1', assertions: [assertion()] })
    mkdirSync(join(dir, 'web'), { recursive: true })
    writeFileSync(join(dir, PROJECT_SITES_REL), JSON.stringify({ version: 1, sites: [{ id: 'p1', url: 'https://elsewhere.test/' }] }))
    const message = await host.callError('site_verify', { target: 'p1', cwd: dir })
    expect(message).toContain('只留一份')
  })
})


/**
 * `site_fill` 的凭据引用：**拒绝路径**在碰浏览器之前。
 *
 * 这一组刻意只测拒绝：正路（真把值填进去）要真的开页面，在 `tool-smoke.test.ts` 里用真 Chrome 验。
 * 而拒绝这两条恰恰是最要紧的——它们决定了这个参数是「读目标声明过的那一个引用」还是
 * 「读任意环境变量」。
 */
describe('工具级：site_fill 的凭据引用只认目标声明过的那一个', () => {
  const WITH_REF = { ...PROFILE_SITE, credentialRef: 'env:P1_APP_PWD' }

  it('目标没声明 → 拒，且 hint 说清「否则就是读任意环境变量」', async () => {
    const host = makeHost()
    host.mount({ enabled: true, targets: [PROFILE_SITE] })
    const message = await host.callError('site_fill', { target: 'p1', selector: '#pwd', credentialRef: 'env:P1_APP_PWD' })
    expect(message).toContain('CREDENTIAL_NOT_DECLARED')
    expect(message).toContain('读任意环境变量')
  })

  it('目标声明的是另一个 → 拒，并把声明的是哪个说出来', async () => {
    const host = makeHost()
    host.mount({ enabled: true, targets: [WITH_REF] })
    const message = await host.callError('site_fill', { target: 'p1', selector: '#pwd', credentialRef: 'env:SOMEONE_ELSE' })
    expect(message).toContain('env:P1_APP_PWD')
  })

  it('value 与 credentialRef 同时给 → 拒（不猜哪个是值）', async () => {
    const host = makeHost()
    host.mount({ enabled: true, targets: [WITH_REF] })
    const message = await host.callError('site_fill', {
      target: 'p1',
      selector: '#pwd',
      value: '明文',
      credentialRef: 'env:P1_APP_PWD',
    })
    expect(message).toContain('CREDENTIAL_AND_VALUE')
  })
})

describe('工具级：site_login 的可见性与开工前的两类拒绝', () => {
  /** 一份最小的合法登录声明（`goto` 落在 `PROFILE_SITE` 的站点范围内）。 */
  const LOGIN = {
    steps: [{ action: 'goto', url: '/login' }, { action: 'fill', selector: '#user', value: 'admin' }],
    success: { selector: '#app' },
  }

  it('★ 没有站点声明 `login`（且没开项目站点声明）→ **不注册** `site_login`：不留必然失败的入口', () => {
    const host = makeHost()
    host.mount({ enabled: true, targets: [PROFILE_SITE] })
    expect(host.names()).not.toContain('site_login')
    expect(host.names().length).toBe(8)
  })

  it('★ 有站点声明 `login` → 多一个 `site_login`（共九个）', () => {
    const host = makeHost()
    host.mount({ enabled: true, targets: [{ ...PROFILE_SITE, login: LOGIN }] })
    expect(host.names()).toContain('site_login')
    expect(host.names().length).toBe(9)
  })

  it('★ 打开了项目站点声明（`projectSitesFile`）→ 也注册：那条路能凭空多出一个带登录声明的站点', () => {
    const host = makeHost()
    host.mount({ enabled: true, projectSitesFile: PROJECT_SITES_REL, targets: [PROFILE_SITE] })
    expect(host.names()).toContain('site_login')
  })

  it('目标没声明登录流程 → 拒，并说清「步骤是写下来的」以及去哪儿写', async () => {
    const host = makeHost()
    host.mount({ enabled: true, targets: [{ ...PROFILE_SITE, login: LOGIN }, { id: 'p2', url: 'https://p2.test/', scopeDirs: [process.cwd()] }] })
    const message = await host.callError('site_login', { target: 'p2' })
    expect(message).toContain('p2 没有声明登录流程')
    expect(message).toContain('工具不接受现编的步骤')
    // 给出路：哪些站点**真的**声明了（agent 的失败模式是原地重试）。
    expect(message).toContain('p1')
  })

  it('★ 声明不成立 → **在碰浏览器之前**指到字段（不是「跑起来才发现」）', async () => {
    const host = makeHost()
    host.mount({
      enabled: true,
      targets: [
        {
          ...PROFILE_SITE,
          login: { steps: [{ action: 'goto', url: 'https://elsewhere.test/login' }], success: { selector: '#app' } },
        },
      ],
    })
    const message = await host.callError('site_login', { target: 'p1' })
    expect(message).toContain('登录声明（login）不成立')
    expect(message).toContain('steps[0].url')
    expect(message).toContain('allowedOrigins')
  })

  it('项目文件里的登录声明：**加载时**就判（严格），报错指到 `sites[i].login`', async () => {
    const host = makeHost()
    host.mount({ enabled: true, projectSitesFile: PROJECT_SITES_REL, targets: [PROFILE_SITE] })
    const dir = project([
      { id: 'j1', url: 'https://j1.test/', login: { steps: [{ action: 'click', selector: '#go' }], success: { selector: '#app' } } },
    ])
    // 第一步不是 goto：这份声明不可复现 → 项目清单不成立（**不是**「跑起来才发现」）。
    const message = await host.callError('site_open', { target: 'p1', cwd: dir })
    expect(message).toContain('项目站点声明不成立')
    expect(message).toContain('targets[0].login')
    expect(message).toContain('第一步必须是 `goto`')
  })

  it('项目文件里的登录声明**并集之后还在**：拿没声明的那个站点调用，报的是 j1 声明了', async () => {
    const host = makeHost()
    host.mount({ enabled: true, projectSitesFile: PROJECT_SITES_REL, targets: [PROFILE_SITE] })
    const dir = project()
    writeProjectSites(dir, [{ id: 'j1', url: 'https://j1.test/', scopeDirs: [dir], login: LOGIN }])

    // 拿 p1（没声明）调用：它在**开浏览器之前**就被拒，而那句「声明了登录流程的站点」恰好证明
    // 项目文件里的 `login` 一路活到了合并后的清单里（没有在配置层被静默丢掉）。
    const message = await host.callError('site_login', { target: 'p1', cwd: dir })
    expect(message).toContain('声明了登录流程的站点：j1')
  })
})

/** 造一个工作目录并写一份**发布清单**（`release/<发布名>.yaml`）。 */
function releaseDir(release: string, projects: Record<string, unknown>[], extra: Record<string, unknown> = {}): string {
  const dir = mkdtempSync(join(root, 'release-'))
  mkdirSync(join(dir, 'release'), { recursive: true })
  writeFileSync(join(dir, 'release', `${release}.yaml`), JSON.stringify({ version: 1, release, projects, ...extra }))
  return dir
}

/**
 * `site_verify_release` 的**整体性**问题：发布清单读不到 / 不成立。
 *
 * 与 `site_verify` 那一组同一条纪律：这些判据都在 `ensureDriver()` **之前**，所以不碰浏览器、
 * 也不需要 Chrome 在不在。**而「一个项目不成立」那一条不同**——它是项目级的问题，工具不该抛错
 * （抛了就把另外 6 个项目一起丢掉），所以它由跑批执行器记成「没验成」，在正文里如实报出来。
 */
describe('工具级：site_verify_release 在碰浏览器之前说清', () => {
  it('没有发布清单 → 报出找的那个路径，并说清 release/ 下现在有什么', async () => {
    const host = makeHost()
    host.mount({ enabled: true, targets: [PROFILE_SITE] })
    const message = await host.callError('site_verify_release', { release: 'r1', cwd: project() })
    expect(message).toContain('release/r1.yaml')
    expect(message).toContain('一份都没有')
  })

  it('目录里有别的发布清单 → 报**对照**（发布名与文件名不一致是最常见的写错方式）', async () => {
    const host = makeHost()
    host.mount({ enabled: true, targets: [PROFILE_SITE] })
    const dir = releaseDir('other', [{ project: 'cdqas', root: '../cdqas', target: 'p1' }])
    const message = await host.callError('site_verify_release', { release: 'r1', cwd: dir })
    expect(message).toContain('现在有这些发布清单：other')
  })

  it('发布清单不成立 → **指到字段**（不是「没找到清单」）', async () => {
    const host = makeHost()
    host.mount({ enabled: true, targets: [PROFILE_SITE] })
    const dir = releaseDir('r1', [{ project: 'cdqas', root: '', target: 'p1' }])
    const message = await host.callError('site_verify_release', { release: 'r1', cwd: dir })
    expect(message).toContain('发布清单不成立')
    expect(message).toContain('projects[0].root')
  })

  it('项目里没有清单 → **不砸整批**：记「没验成」并在正文里报出来（不是抛错）', async () => {
    const host = makeHost()
    host.mount({ enabled: true, targets: [PROFILE_SITE] })
    // `../cdqas` 相对发布清单所在目录 → 那个项目目录不存在 → 没有 web/cdqas.yaml
    const dir = releaseDir('r1', [{ project: 'cdqas', root: '../cdqas', target: 'p1' }])
    const text = await host.call('site_verify_release', { release: 'r1', cwd: dir })

    expect(text).toContain('release/r1.yaml')
    expect(text).toContain('没验成 1 个')
    expect(text).toContain('cdqas')
    expect(text).toContain('没有证据')
    // 一个能跑的项目都没有 → 整批是 `unknown`，**不是** pass（用没验过冒充验过）
    expect(text).toContain('overall unknown')
    // 「没验成」与「验出问题」分列：这一整段没有一条 ✗
    expect(text).not.toContain('✘')
  })
})
