/**
 * @hyzyn/dsh-search — 「设置跳转」入口形态的回归测试（静态判据 + 真机实测记录）。
 *
 * ## 这条用例守的是什么（2026-10-20 真机实测的缺陷）
 *
 * DSH **0.2.1** 把侧边栏底部的设置触发器换掉了：`settings.launcher` 这个单值槽被
 * `ui-settings-account` 的账号菜单占住，于是那个按钮从
 * `button[aria-haspopup="dialog"]`（点一下直接开设置窗）变成
 * `button[aria-haspopup="menu"][aria-label="账号菜单"]`，**设置窗是菜单里的第一项**。
 *
 * 旧实现只认 `aria-haspopup="dialog"`，在新宿主上整页命中 **0 个**，于是：
 *
 *   1. 「打开设置」快捷操作被判成不可用，整行从面板里消失；
 *   2. 点「账号与余额 / 通用设置 / 模型…」与「Prompt 管理 / MCP 服务器配置」卡片时，
 *      `openSettingsSection` / `openSettingsCard` 都返回 false —— 命令面板退化成
 *      「把条目名复制到剪贴板」，用户看到的就是**点了没反应**（截图即此形态）。
 *
 * ## 为什么是静态判据而不是 DOM 行为用例
 *
 * 客户端半体是裸 `client.js`（本包没有 `client-src/` 构建步骤），而仓库的 vitest 底座是
 * `environment: 'node'`、没有 jsdom —— 详见 `vitest.config.ts` 文件头「打包后的 client.js
 * 不在本层测」。所以这里钉**入口判定的三条通路都在**：少任何一条，就会有一代宿主跳不过去。
 * 行为面由真机验收覆盖（`docs/agent-real-test.md` 车道 B）。
 */
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = readFileSync(join(packageRoot, 'client.js'), 'utf8')

/** 取出一个具名函数的源码块（从声明起到下一个同缩进的 `}` 为止）。 */
function functionBody(name: string): string {
  const start = source.indexOf('function ' + name)
  if (start === -1) throw new Error('client.js 里找不到函数：' + name)
  const end = source.indexOf('\n    }', start)
  return source.slice(start, end === -1 ? source.length : end)
}

describe('设置入口：三代宿主形态都必须有通路', () => {
  it('老宿主（≤0.2.0）：仍认 aria-haspopup="dialog" 的直连触发器', () => {
    const body = functionBody('findSettingsDialogTrigger')
    expect(body).toContain('aria-haspopup="dialog"')
  })

  it('新宿主（≥0.2.1）：认账号菜单 aria-haspopup="menu" + 可访问名，并在菜单里点「设置」', () => {
    const finder = functionBody('findAccountMenuTrigger')
    expect(finder).toContain('aria-haspopup="menu"')
    expect(finder).toContain('ACCOUNT_MENU_LABELS')

    const settingsAt = source.indexOf('const SETTINGS_MENU_LABELS')
    const accountAt = source.indexOf('const ACCOUNT_MENU_LABELS')
    expect(settingsAt).toBeGreaterThan(-1)
    expect(accountAt).toBeGreaterThan(settingsAt)
    const settingsLabels = source.slice(settingsAt, accountAt)
    const accountLabels = source.slice(accountAt, source.indexOf('\n', accountAt))
    expect(accountLabels).toContain('账号菜单')
    expect(accountLabels).toContain('Account menu')

    expect(settingsLabels).toContain('设置')
    expect(settingsLabels).toContain('Settings')

    // 菜单是 portal 到 body 的，必须按 role 找项、不能只在设置窗里找
    expect(functionBody('findMenuItem')).toContain('[role="menuitem"]')
  })

  it('设置窗本体按 data-shortcut-modal="settings" 认，而不是「页面上任意 role=dialog」', () => {
    const body = functionBody('settingsDialogEl')
    expect(body).toContain('data-shortcut-modal="settings"')
    // 页面上还有别的 dialog（审批、附件预览…）：宽泛匹配会把它们当成设置窗
    expect(body).not.toContain('querySelector(\'[role="dialog"]\')')
  })

  it('入口判定三档齐全：宿主命令 / dialog 触发器 / 账号菜单', () => {
    const body = functionBody('settingsEntryAvailable')
    expect(body).toContain('settingsDialogEl()')
    expect(body).toContain('findSettingsDialogTrigger()')
    expect(body).toContain('findAccountMenuTrigger()')
    expect(body).toContain('shortcutsService()')
  })

  it('设置窗已开时不得再调 settings.open（那条命令在 modal=settings 时是「关闭最上层模态」）', () => {
    const body = functionBody('invokeSettingsCommand')
    expect(body).toContain('settingsDialogEl() !== null')
    expect(body).toContain("registry.invoke('settings.open'")
  })

  it('三个跳转调用点都走统一入口，不得再各自找触发器', () => {
    for (const caller of ['openSettingsSection', 'openSettingsCard']) {
      expect(functionBody(caller)).toContain('await openSettingsDialog()')
    }
    // 旧的直连查找只允许出现在入口判定与兜底里，不允许再散落在调用点
    const uses = source.match(/findSettingsTrigger\(/g) ?? []
    expect(uses).toHaveLength(0)
  })

  it('「打开设置」快捷操作的可用性按新判定，不按 dialog 触发器', () => {
    expect(source).toContain('available: () => settingsEntryAvailable()')
  })
})

/**
 * 「最近」分组的条数。
 *
 * 真机反馈：空查询只列 4 条**太少**——侧边栏里明明有一屏会话，面板打开却只看到 4 条。
 * 早先那个 4 的理由是「设置大类要留在首屏」，但 `.gs_list` 本来就能滚，这个取舍不划算。
 * 现在放到 `RECENT_SESSION_LIMIT`（8），上界与 `⌥/Alt + 1…9` 的 9 个数字键对齐——
 * 再多也编不出快捷键，只会把「设置」推得更远。
 */
describe('「最近」分组条数', () => {
  const limit = (() => {
    const match = /const RECENT_SESSION_LIMIT = (\d+)/.exec(source)
    if (match === null) throw new Error('client.js 里找不到 RECENT_SESSION_LIMIT')
    return Number(match[1])
  })()

  it('空查询与搜索共用同一个上限，不再出现「空查询 4 / 搜索 5」两套数', () => {
    // 旧写法是内联三元 `.slice(0, searching ? 5 : 4)`，改上限时必然漏改一侧
    expect(source).not.toContain('searching ? 5 : 4')
    expect(source).toContain('.slice(0, RECENT_SESSION_LIMIT)')
  })

  it('上限不低于 8 条（真机反馈的「太少」就是 4 条）', () => {
    expect(limit).toBeGreaterThanOrEqual(8)
  })

  it('上限不超过 9：⌥/Alt + 1…9 只有 9 个数字键，再多的行没有快捷键可编', () => {
    expect(limit).toBeLessThanOrEqual(9)
  })
})
