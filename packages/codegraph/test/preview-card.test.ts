/**
 * 卡片预览渲染器（`scripts/preview-card.mjs`）的守卫。
 *
 * 为什么要有这条用例：这个脚本**不在任何闸门里**——`client-lint.mjs` 只查客户端半体
 * （`client.js` / `client-src/index.js`），而这个脚本是构建期工具。于是它自己的低级错误
 * 一路漏到手工运行时才炸：
 *
 *   实测（2026-09-22，加 P0 预览模式时）：把两个 `const` 声明写在 `htmlPath` 之后，
 *   `--fallback` 直接 `ReferenceError: Cannot access 'perAgent' before initialization`
 *   —— 正是 `client-lint.mjs` 头注释里列的第 1 类错误（TS2448「块级变量先用后声明」），
 *   只是发生在一个它不覆盖的文件里。
 *
 * 所以这里不是「读源码断言字符串」（那样只能测出我刚好想到的形状），而是**真的把三个
 * 模式各跑一遍**：脚本 0.4s 就能跑完、产物落在包内 `.preview/`（已在 .gitignore），
 * 完全负担得起。跑得动 = 没有引用错误、没有 TDZ、选项解析可用。
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const script = join(pkgRoot, 'scripts', 'preview-card.mjs')
const previewDir = join(pkgRoot, '.preview')

/** 跑一个预览模式，返回产物 HTML（失败时抛出带 stderr 的错误）。 */
const render = (args, outName) => {
  try {
    execFileSync(process.execPath, [script, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (error) {
    const stderr = error instanceof Error ? error.stderr?.toString() ?? '' : ''
    throw new Error(`preview-card.mjs ${args.join(' ')} 跑失败：\n${stderr}`, { cause: error })
  }
  const out = join(previewDir, outName)
  expect(existsSync(out), `产物不存在：${out}`).toBe(true)
  return readFileSync(out, 'utf8')
}

describe('卡片预览渲染器：三种模式都要能跑出产物', () => {
  it('默认（managed）：能渲染，且**不**出现 per-agent 生效文案', () => {
    const html = render([], 'codegraph-card.html')
    expect(html).toContain('per-agent MCP 隔离')
    expect(html, 'managed 态下不该显示「生效中」').not.toContain('per-agent 生效中')
    expect(html, 'managed 态下不该显示退回警告').not.toContain('已退回 managed')
  })

  it('--per-agent：渲染生效态文案与挂载数', () => {
    const html = render(['--per-agent'], 'codegraph-card-per-agent.html')
    expect(html).toContain('per-agent 生效中')
    expect(html).toContain('已挂载 2 个 agent')
  })

  it('--fallback：渲染「已退回 managed」的原因（这一档最容易写错，必须能离线看）', () => {
    const html = render(['--fallback'], 'codegraph-card-fallback.html')
    expect(html).toContain('per-agent 未生效，已退回 managed')
    // 退回时不能说「生效中」——同时出现两句自相矛盾的文案就是卡片在骗用户
    expect(html, '退回态下不该又说「生效中」').not.toContain('per-agent 生效中')
  })

  it('--busy：两级反馈都要出现（按钮自己 + 标题行全局）', () => {
    /*
     * 用户反馈（截图）：「在这里点，会看不到加载的 loading」——滚到卡片下半部分
     * （搜索与查询 / Agent 集成）时，标题行的全局指示器已经移出视野，点「搜索」
     * 「影响面」就完全没有反馈。所以忙碌呈现必须**两级都有**：
     *   - 被点的那个按钮自己显示（busyOr）：手指底下，无论滚到哪都看得见；
     *   - 标题行的全局指示器：滚到顶时一眼看到在忙什么，并承载「取消」。
     *
     * --busy 让 /status 永不 resolve，于是 busyAction='status'：
     * 「刷新状态」按钮应变成「刷新中…」，标题行应显示「读取索引状态…」。
     */
    const html = render(['--busy'], 'codegraph-card-busy.html')
    expect(html, '按钮级反馈缺失（刷新状态应显示刷新中…）').toContain('刷新中…')
    expect(html, '标题行全局指示器缺失').toContain('读取索引状态…')
    // 只有正在跑的那个动作显示忙碌，其余按钮保持静止文案（否则整排都在转圈=噪音）
    expect(html, '非活动按钮不该显示忙碌文案').toContain('>Sync<')
    expect(html, '非活动按钮不该显示忙碌文案').toContain('>重建索引<')
    expect(html).toContain('cg_btnBusy')
  })

  it('三种模式写不同文件（互不覆盖）', () => {
    render([], 'codegraph-card.html')
    render(['--per-agent'], 'codegraph-card-per-agent.html')
    render(['--fallback'], 'codegraph-card-fallback.html')
    for (const name of ['codegraph-card.html', 'codegraph-card-per-agent.html', 'codegraph-card-fallback.html']) {
      expect(existsSync(join(previewDir, name)), `${name} 不存在`).toBe(true)
    }
  })
})

// 产物是构建期临时物（.preview/ 在 .gitignore 里），用完即清，不给仓库留垃圾。
process.on('exit', () => {
  try {
    rmSync(previewDir, { recursive: true, force: true })
  } catch {
    /* 清不掉也不影响用例结论 */
  }
})
