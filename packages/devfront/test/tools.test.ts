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
  if (sites !== undefined) {
    mkdirSync(join(dir, 'web'), { recursive: true })
    writeFileSync(join(dir, PROJECT_SITES_REL), JSON.stringify({ version: 1, sites }))
  }
  return dir
}

const PROFILE_SITE = { id: 'p1', url: 'https://p1.test/', scopeDirs: [process.cwd()] }

describe('工具级：站点清单按 cwd 解析', () => {
  it('六个工具都注册了（启用 + 有站点），且没有站点时一个都不注册', () => {
    const on = makeHost()
    on.mount({ enabled: true, targets: [PROFILE_SITE] })
    expect(on.names()).toEqual(['site_click', 'site_console', 'site_fill', 'site_open', 'site_shot', 'site_text'])

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
    expect(host.names().length).toBe(6)
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
