/**
 * `scripts/client-click-scope.mjs` 的单元测试 —— 客户端半体「document 级点击委托必须有作用域」规则。
 *
 * 为什么有这份测试：与 `client-host-url` 同源——这条规则也是**平时不出声**的防线，
 * 它自己漂了没人会发现：
 *
 *   ① **漏报**：规则改松 → 下一个「点 A 卡片弹 B 卡片报错」照样上线
 *      （2026-10-03 实测：点 profile 的「删除」→ `prompt 不存在: `）；
 *   ② **误报**：规则改紧 → 对着合法代码报错，最后一定会被人削弱或加豁免，防线同样白给。
 *
 * 第 1 组钉「该报的必须报」（用例直接抄 bug 当时的形状），第 2 组钉不误报（含注释里的示例
 * 代码、非 click 事件、React 的 onClick），第 3 组对**真实语料**做全量断言——既是「规则
 * 上线即绿」的证据，也拦住以后有人把不带作用域的处理器写回去。
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { listClickScopeTargets, scanClickScopeUses } from '../client-click-scope.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

const scan = (text, fileName = 'client.js') => scanClickScopeUses(fileName, text)

describe('scanClickScopeUses · 该报的必须报', () => {
  it('抓 prompt 当时的处理器形状：绑 document + 只有 closest 取动作、没有作用域判定', () => {
    /* 这一段就是 2026-10-03 出问题的 prompt/client.js 的形状（去掉守卫之前）。 */
    const source = [
      'function bindEvents() {',
      "  document.addEventListener('click', handleClick, true)",
      '}',
      'function handleClick(event) {',
      '  const target = event.target',
      '  if (!(target instanceof Element)) return',
      "  const actionEl = target.closest('[data-action]')",
      '  if (actionEl === null || actionEl.disabled) return',
      "  if (actionEl.dataset.action === 'delete') deletePrompt(actionEl.dataset.id)",
      '}',
    ].join('\n')
    const found = scan(source)
    expect(found.map((item) => item.handler)).toEqual(['handleClick'])
    // 位置要准到行（CLI 靠它打印 file:line:col）：报的是**注册点**那一行
    expect(found[0].line).toBe(2)
    expect(found[0].detail).toContain('.contains(')
    expect(found[0].file).toBe('client.js')
  })

  it('内联箭头函数同样抓', () => {
    const source = [
      "document.addEventListener('click', (event) => {",
      '  const el = event.target.closest("[data-action]")',
      '  if (el) run(el.dataset.action)',
      '}, true)',
    ].join('\n')
    expect(scan(source)).toHaveLength(1)
  })

  it('处理器函数体定位不到时也报（而不是默默放行）', () => {
    const source = "document.addEventListener('click', handleClick, true)"
    const found = scan(source)
    expect(found).toHaveLength(1)
    expect(found[0].detail).toContain('无法定位')
  })

  it('function 声明与 const 箭头两种写法都能解析出函数体', () => {
    const declared = ['function h(e) {', '  if (!root.contains(e.target)) return', '}'].join('\n')
    const assigned = ['const h = (e) => {', '  if (!root.contains(e.target)) return', '}'].join('\n')
    for (const body of [declared, assigned]) {
      const source = "document.addEventListener('click', h, true)\n" + body
      expect(scan(source)).toEqual([])
    }
  })
})

describe('scanClickScopeUses · 不误报（误报会让规则被人削弱）', () => {
  it('profile 的既有写法（panelEl.contains）合规', () => {
    const source = [
      'function handleClick(event) {',
      '  const target = event.target',
      '  if (!target || !panelEl || !panelEl.contains(target)) return',
      "  const action = target.dataset.action",
      '}',
      "document.addEventListener('click', handleClick, true)",
    ].join('\n')
    expect(scan(source)).toEqual([])
  })

  it('浮层挂在 body 上时判两个根（rss 修好之后的写法）也合规', () => {
    const source = [
      'function handleClick(event) {',
      '  const el = event.target.closest("[data-action]")',
      '  if (!el) return',
      '  const inPanel = panelEl !== undefined && panelEl.contains(el)',
      '  const inModal = (modalEl !== undefined && modalEl.contains(el))',
      '  if (!inPanel && !inModal) return',
      '}',
      "document.addEventListener('click', handleClick, true)",
    ].join('\n')
    expect(scan(source)).toEqual([])
  })

  it('没绑 document 的处理器不查：React 的 onClick 天生有作用域', () => {
    const source = [
      'function handleClick(event) {',
      "  if (event.currentTarget.dataset.action === 'delete') remove()",
      '}',
      'jsx("button", { onClick: handleClick, "data-action": "delete" })',
    ].join('\n')
    expect(scan(source)).toEqual([])
  })

  it('注释与字符串里的示例代码不算：注册点只在屏蔽注释后的文本上找', () => {
    const source = [
      '/* 旧实现是这样绑的（不要照抄）：',
      " * document.addEventListener('click', handleClick, true)",
      ' */',
      "const hint = \"document.addEventListener('click', handleClick, true)\"",
    ].join('\n')
    expect(scan(source)).toEqual([])
  })

  it('绑的是 document 但事件不是 click（keydown / input）不查', () => {
    const source = [
      "document.addEventListener('keydown', handleKey, true)",
      "document.addEventListener('input', handleInput, true)",
      'function handleKey(event) { if (event.key === "Escape") close() }',
      'function handleInput(event) { save(event.target.value) }',
    ].join('\n')
    expect(scan(source)).toEqual([])
  })
})

describe('真实语料：全部客户端半体 0 命中', () => {
  /*
   * 口径与 client-lint 完全一致（同一个 listClickScopeTargets）：有 client-src/ 查源码全量，
   * 否则查裸 client.js。这条同时是「规则上线即绿」的证据，和「以后有人写回去」的拦截网。
   */
  const packages = ['codegraph', 'docker', 'env', 'kit-settings', 'mcp', 'profile', 'prompt', 'rss', 'search', 'tty']

  it('每个包都能被找到客户端半体（名单漂了要在这里发现）', () => {
    const missing = packages.filter((name) => listClickScopeTargets(join(repoRoot, 'packages', name)).length === 0)
    expect(missing).toEqual([])
  })

  for (const name of packages) {
    it(`${name} 的 document 级点击委托都有作用域判定`, () => {
      const found = listClickScopeTargets(join(repoRoot, 'packages', name)).flatMap(({ file, source }) =>
        scanClickScopeUses(file, source))
      expect(found.map((item) => `${item.file}:${String(item.line)} ${item.handler}`)).toEqual([])
    })
  }

  it('四张绑了 document 点击的卡片都真的带守卫（漏一张就会跨卡误触）', () => {
    const bound = []
    for (const name of packages) {
      for (const { file, source } of listClickScopeTargets(join(repoRoot, 'packages', name))) {
        if (/document\s*\.\s*addEventListener\s*\(\s*['"]click['"]/.test(source)) bound.push(name)
      }
    }
    // 名单是「谁绑了 document」的事实快照：多一张少一张都要在这里显式改数字，别让它悄悄漂。
    expect(bound.sort()).toEqual(['mcp', 'profile', 'prompt', 'rss'])
  })
})
