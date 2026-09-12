/* eslint-disable */
/**
 * @hyzyn/dsh-search — 预览夹具的假宿主。
 *
 * 提供 client.js 需要的最小面：模块加载器、ctx.sessions（列表快照 + open/create）、
 * ctx.effect，以及 /api/dsh-search/{catalog,query} 两个 fetch 桩。
 * 数据全是演示用的假数据，不含任何本机路径或真实会话。
 */
(function () {
  const params = new URLSearchParams(location.search)
  const scenario = params.get('scenario') || 'empty'
  window.__previewState = { name: scenario }

  const now = Date.now()
  const minutes = (n) => now - n * 60 * 1000
  const hours = (n) => now - n * 60 * 60 * 1000
  const days = (n) => now - n * 24 * 60 * 60 * 1000

  /* --------------------------- 假会话列表 --------------------------- */

  const SESSIONS = [
    { id: 'sess-1', displayTitle: '把全局搜索改造成命令面板', updatedAt: minutes(2) },
    { id: 'sess-2', displayTitle: '修复 tty 面板在窄侧边栏下的布局', updatedAt: minutes(46) },
    { id: 'sess-3', displayTitle: 'Codegraph 索引卡住的原因', updatedAt: hours(5) },
    { id: 'sess-4', displayTitle: 'cdqas-5.0 上线前的回归清单', updatedAt: days(1) },
    { id: 'sess-5', displayTitle: 'docker 面板只读模式', updatedAt: days(3) },
    { id: 'sess-6', displayTitle: '把 RSS 摘要注入 systemPrompt', updatedAt: days(9) },
    // 新建但没说过话的空会话：不该出现在「最近会话」里
    { id: 'sess-blank', displayTitle: '新会话', blank: true, updatedAt: minutes(1) },
  ]

  /* --------------------------- 假 slots 注册表（settings.section） --------------------------- */

  // 形状与真实注册一致：entry.options.{id, order, label(thunk)}；
  // 后半段是第三方插件注册的大类——宿主静态目录里没有它们。
  const SECTION_SLOTS = [
    { options: { id: 'general', order: 10, label: () => '通用设置' } },
    { options: { id: 'models', order: 15, label: () => '模型' } },
    { options: { id: 'plugins', order: 20, label: () => '插件' } },
    { options: { id: 'agent-presets', order: 30, label: () => 'Agent 预设' } },
    { options: { id: 'sidebar-cards', order: 40, label: () => '侧边卡片' } },
    { options: { id: 'web-plugins', order: 45, label: () => 'Web 插件' } },
    { options: { id: 'skin-center', order: 50, label: () => '皮肤' } },
    { options: { id: 'pet', order: 60, label: () => '宠物' } },
    { options: { id: 'creative-lab', order: 70, label: () => '创意工坊' } },
    { options: { id: 'usage-stats', order: 80, label: () => '使用统计' } },
    { options: { id: 'archive-manager', order: 90, label: () => '会话归档管理' } },
  ]

  /* --------------------------- 假设置目录 --------------------------- */

  const CATALOG = [
    { id: 's-general', kind: 'section', name: '通用设置', titles: ['通用设置', 'General'], keywords: ['general', '通用', '设置', '常规'], description: '界面与工具的通用选项' },
    { id: 's-models', kind: 'section', name: '模型', titles: ['模型', 'Models'], keywords: ['model', '模型', '提供商'], description: '模型提供商与模型列表管理' },
    { id: 's-plugins', kind: 'section', name: '插件', titles: ['插件', 'Plugins'], keywords: ['plugin', '插件', '扩展'], description: '插件配置与插件清单' },
    { id: 's-agent-presets', kind: 'section', name: 'Agent 预设', titles: ['Agent 预设', 'Agent presets'], keywords: ['agent', '预设'], description: '预设方案与角色模板' },
    { id: 's-market', kind: 'section', name: '插件市场', titles: ['插件市场', 'Plugin Market'], keywords: ['market', '市场'], description: '发现与安装社区插件' },
    { id: 'terminal', kind: 'card', name: '终端', titles: ['终端', 'Shell'], keywords: ['terminal', '终端'], description: 'Shell 行为与命令超时设置' },
    { id: 'mcp-config', kind: 'card', name: 'MCP 服务器配置', titles: ['MCP 服务器配置'], keywords: ['mcp', '工具'], description: 'stdio 本地进程或 streamable-http 远程服务' },
    { id: 'prompt-manager', kind: 'card', name: 'Prompt 管理', titles: ['Prompt 管理'], keywords: ['prompt', '提示词'], description: 'systemPrompt 可视化编辑、版本管理与 A/B 测试' },
    { id: 'env-manager', kind: 'card', name: '环境变量 / 密钥管理', titles: ['环境变量 / 密钥管理'], keywords: ['env', '密钥', 'secret'], description: '配置进程环境变量与敏感信息' },
    { id: 'profile-manager', kind: 'card', name: 'Profile 管理', titles: ['Profile 管理'], keywords: ['profile', '多环境'], description: 'DSH profile 的创建、复制、重命名与删除' },
    { id: 'rss-digest', kind: 'card', name: 'RSS / 新闻聚合', titles: ['RSS / 新闻聚合'], keywords: ['rss', '新闻'], description: '多源订阅与每日「今日值得读」自动摘要' },
    { id: 'codegraph', kind: 'card', name: 'Codegraph 集成', titles: ['Codegraph 集成'], keywords: ['codegraph', '调用链'], description: '代码图谱索引、符号搜索与调用链分析' },
  ]

  /* --------------------------- 假全文检索结果 --------------------------- */

  const QUERY = '设置'
  const QUERY_RESULT = {
    ok: true,
    query: QUERY,
    sessions: [
      { id: 'sess-a', snippet: '…把设置卡片里的字段对齐一下，顺便把日志刷新改成图标自转，别再用文字按钮了…', time: minutes(26) },
      { id: 'sess-b', snippet: '…这个设置项在 profile 里应该写在 cordis.patch.yml 的托管区块，不要手改…', time: hours(3) },
    ],
    prompts: [
      { id: 'p-review', name: '代码审查助手', description: '让模型逐行审查变更', snippet: '…输出里不要带「设置」相关的黑话，逐行给出可执行的修复建议…', active: true },
    ],
    tools: [
      { name: 'mcp__codegraph__codegraph_explore', description: 'Explore symbols and call paths in the indexed repository' },
    ],
    panels: [],
  }

  const json = (body, status) => Promise.resolve(new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  }))

  const realFetch = window.fetch.bind(window)
  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || ''
    if (url.indexOf('/api/dsh-search/catalog') === 0) {
      // legacy：模拟宿主本体还是旧版本（没有这条路由）
      if (scenario === 'legacy') return json({ error: 'unauthorized' }, 401)
      return json({ ok: true, panels: CATALOG })
    }
    if (url.indexOf('/api/dsh-search/query') === 0) {
      if (scenario === 'loading') return new Promise(function () {})
      const parsed = new URL(url, location.origin)
      const q = parsed.searchParams.get('q') || ''
      if (q === QUERY) return json(QUERY_RESULT)
      return json({ ok: true, query: q, sessions: [], prompts: [], tools: [], panels: [] })
    }
    return realFetch(input, init)
  }

  /* --------------------------- 假宿主 ctx --------------------------- */

  const listeners = new Set()
  const byId = {}
  for (const row of SESSIONS) {
    byId[row.id] = Object.assign({ origin: undefined, blank: false, running: false }, row)
  }
  const snapshot = {
    ids: SESSIONS.map((row) => row.id),
    byId: byId,
    current: 'sess-1',
    phase: 'ready',
    subagentsByParent: {},
    jobsBySession: {},
    currentAddress: undefined,
  }
  const sessionStore = {
    getSnapshot: () => snapshot,
    subscribe: (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
  }

  const opened = { id: null }
  const calls = { newSession: 0, created: 0 }
  const ctx = {
    effect: (fn) => {
      const dispose = fn()
      return () => { if (typeof dispose === 'function') dispose() }
    },
    sessions: {
      list: sessionStore,
      open: (id) => { opened.id = id },
      create: () => { calls.created += 1; return Promise.resolve('sess-new') },
    },
    // dsh-client-ui-workspace 注册的客户端服务：真正的「新会话」流程走这里
    uiWorkspace: {
      startSession: () => { calls.newSession += 1; return Promise.resolve() },
    },
    // 客户端 slots 服务（SlotRegistry）：设置一级大类从 settings.section 列表槽实时枚举
    slots: {
      entries: (name) => (name === 'settings.section' ? SECTION_SLOTS : []),
    },
  }
  window.__previewOpened = opened
  window.__previewCalls = calls

  /* --------------------------- 模块加载器 --------------------------- */

  let factory = null
  window.__ModuleLoader__ = {
    load: (module) => { factory = module.factory },
  }

  function boot() {
    const exports = factory(() => { throw new Error('preview: require is not available') })
    exports.apply(ctx)
    // 点侧边栏入口打开面板
    const entry = document.querySelector('[data-dsh-global-search-entry]')
    if (!entry) throw new Error('preview: sidebar entry not mounted')
    entry.click()

    const ready = (async () => {
      if (scenario === 'query' || scenario === 'loading') {
        const input = document.querySelector('.gs_input')
        if (!input) throw new Error('preview: palette input not mounted')
        input.value = QUERY
        input.dispatchEvent(new Event('input', { bubbles: true }))
        // 等到列表里出现全文命中（或 loading 态）再交图
        const deadline = Date.now() + 4000
        while (Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, 80))
          const text = (document.querySelector('.gs_list') || {}).textContent || ''
          if (scenario === 'loading' ? text.indexOf('搜索会话全文') >= 0 : text.indexOf('历史会话') >= 0) break
        }
      } else {
        await new Promise((r) => setTimeout(r, 250))
      }
      await new Promise((r) => setTimeout(r, 250))
      return true
    })()
    window.__previewReady = ready
    return ready
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot)
  } else {
    boot()
  }
  /* --------------------------- 交互自检（截图之后跑） --------------------------- */

  /**
   * 键盘契约自检：默认选中 / ↑↓ 移动 / ↵ 打开 / ⌥+数字 打开第 N 条最近会话 / esc 关闭。
   * 返回 [名称, 是否通过] 列表，供 preview.mjs 汇总。
   */
  window.__previewInteract = async function () {
    const results = []
    const check = (name, ok) => results.push([name, Boolean(ok)])
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
    const activeIndex = () => {
      const rows = Array.from(document.querySelectorAll('.gs_list .gs_row[data-index]'))
      return rows.findIndex((row) => row.hasAttribute('data-active'))
    }
    const key = (target, init) => target.dispatchEvent(new KeyboardEvent('keydown', Object.assign({ bubbles: true, cancelable: true }, init)))
    // 模拟真实打开方式：点侧边栏入口（入口中间其实覆盖着那个 input，所以既 focus 又 click）
    const openPalette = async () => {
      const entry = document.querySelector('[data-dsh-global-search-entry]')
      const entryInput = entry.querySelector('input')
      if (entryInput !== null) entryInput.focus()
      entry.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await sleep(60)
      return document.querySelector('.gs_input')
    }

    let input = document.querySelector('.gs_input')
    const firstText = () => {
      const row = document.querySelector('.gs_list .gs_row[data-index]')
      return row === null ? '' : row.textContent
    }

    check('打开即选中首项', activeIndex() === 0)
    if (scenario === 'empty') {
      check('首项是最近会话', firstText().indexOf('把全局搜索改造成命令面板') >= 0)
      const listText = document.querySelector('.gs_list').textContent
      check('设置分组列出第三方大类（皮肤 / 宠物）', listText.indexOf('皮肤') >= 0 && listText.indexOf('宠物') >= 0)
      check('设置分组列出全部大类（会话归档管理）', listText.indexOf('会话归档管理') >= 0)
      check('设置分组含官方大类（通用设置）', listText.indexOf('通用设置') >= 0)
    } else if (scenario === 'query') {
      check('首项是全文命中', firstText().indexOf('把设置卡片') >= 0)
    } else if (scenario === 'legacy') {
      // 老宿主：目录路由 404，但大类来自客户端 slots 注册表，设置分组不该受影响
      const text = document.querySelector('.gs_list').textContent
      check('老宿主：设置分组仍在', text.indexOf('设置') >= 0 && text.indexOf('通用设置') >= 0)
      check('老宿主：第三方大类仍在', text.indexOf('皮肤') >= 0)
    }

    // ↑↓ 移动高亮
    if (scenario !== 'loading') {
      key(input, { key: 'ArrowDown' })
      check('↓ 移到第二项', activeIndex() === 1)
      key(input, { key: 'ArrowDown' })
      check('↓ 继续下移', activeIndex() === 2)
      key(input, { key: 'ArrowUp' })
      check('↑ 回上一项', activeIndex() === 1)
      key(input, { key: 'ArrowUp' })
      check('↑ 回到首项', activeIndex() === 0)
    }

    // ↵ 打开首项：空查询下是最近会话 sess-1，有查询时是首条全文命中 sess-a
    if (scenario !== 'loading') {
      key(input, { key: 'Enter' })
      await sleep(80)
      check('↵ 打开首项', window.__previewOpened.id === (scenario === 'query' ? 'sess-a' : 'sess-1'))
      check('打开后关闭面板', document.querySelector('.gs_palette') === null)
      input = await openPalette()
    }

    // ⌥+数字 打开第 N 条最近会话（只在空查询下有「最近」分组）
    if (scenario === 'empty') {
      key(document, { key: '2', code: 'Digit2', altKey: true })
      await sleep(80)
      check('⌥2 打开第二条最近会话', window.__previewOpened.id === 'sess-2')
      input = await openPalette()
    }

    // 点「新会话」必须打到 GUI 的 uiWorkspace.startSession（回归：只 create 不 open = 点了没反应）
    if (scenario === 'empty') {
      const newSessionRow = Array.from(document.querySelectorAll('.gs_list .gs_row[data-index]'))
        .find((row) => row.textContent.indexOf('新会话') >= 0)
      check('快捷操作里有「新会话」', newSessionRow !== undefined)
      if (newSessionRow !== undefined) {
        newSessionRow.click()
        await sleep(120)
        check('点「新会话」调用 uiWorkspace.startSession', window.__previewCalls.newSession === 1)
        check('点「新会话」后关闭面板', document.querySelector('.gs_palette') === null)
        input = await openPalette()
      }
    }

    // esc 关闭
    check('面板处于打开状态', document.querySelector('.gs_palette') !== null)
    key(document, { key: 'Escape' })
    await sleep(60)
    check('esc 关闭面板', document.querySelector('.gs_palette') === null)

    return results
  }
})()
