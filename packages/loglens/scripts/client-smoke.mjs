#!/usr/bin/env node
/**
 * @hyzyn/dsh-loglens — 浏览器半体的装载与首屏渲染回归（无浏览器：最小 DOM / React / fetch 桩）。
 *
 * 为什么要有它：client.js 是随包发布的**构建产物**，语法或渲染路径出错只有用户打开设置时
 * 才会暴露——本包已经栽过两次（卡片压根没挂上、某半格被冲成「没检测到」），而纯模块用例
 * 覆盖不到「组件函数到底产出了什么」。这里用一个**会真重渲染**的最小 hook 运行时把卡片渲染出来，
 * 断言的是**渲染树**与**交出去的请求体**，不是源码字符串：
 *   1. 产物形状：__ModuleLoader__.load 的 id / factory；factory 只 require 平台 seed 提供的那两个模块；
 *   2. 注册面：settings.kit.item / settings.plugin.item / plugins.bundle.config / plugins.row.config；
 *   3. 来源行：四格齐（类型 / 名称 / 地址或 Docker 目标 / 两个动作），ES 行在地址格里多一个
 *      「索引表达式」输入；除了插件开关之外**没有多余的勾选框**（「允许公网地址」按常规做法拆掉了）；
 *   4. 填了索引表达式再保存 → POST 请求体里确实带 index（清空也要能发出去，否则宿主会「保持原值」）。
 *
 * 用法：pnpm --filter @hyzyn/dsh-loglens build && node scripts/client-smoke.mjs
 */
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const code = readFileSync(join(root, 'client.js'), 'utf8')

const results = []
async function test(name, fn) {
  try {
    await fn()
    results.push({ name, ok: true })
  } catch (error) {
    results.push({ name, ok: false, message: error instanceof Error ? error.message : String(error) })
  }
}

/* ------------------------------------------------------------------ *
 * 最小 DOM
 * ------------------------------------------------------------------ */

function makeElement(tag) {
  return {
    tagName: String(tag).toUpperCase(),
    className: '',
    style: {},
    children: [],
    id: '',
    textContent: '',
    setAttribute() {},
    addEventListener() {},
    appendChild(child) { this.children.push(child); return child },
    remove() {},
  }
}

const documentStub = {
  head: makeElement('head'),
  body: makeElement('body'),
  createElement: (tag) => makeElement(tag),
  getElementById: () => null,
}

/* ------------------------------------------------------------------ *
 * 最小 React：**会重渲染**的 hook 运行时
 *
 * 桩若把 useState 冻在初值（docker 的冒烟就这么干），卡片会永远停在 loading——
 * 「来源行长什么样」这类判据就一条都测不到。所以这里做一个够用的运行时：
 * 按调用序保存 state / effect 槽位，setState 标脏 → flush 时重渲染 → 跑依赖变了的 effect，
 * 循环到稳定（effect 里的 await 由 settle 的宏任务让位来推进）。
 * ------------------------------------------------------------------ */

function sameDeps(left, right) {
  if (left === undefined || right === undefined) return false
  return left.length === right.length && left.every((item, at) => Object.is(item, right[at]))
}

function createRuntime() {
  let stateSlots = []
  let refSlots = []
  let callbackSlots = []
  let effectSlots = []
  let hookIndex = 0
  let dirty = true
  let rootComponent = null
  let rootProps = null
  let tree = null

  const React = {
    useState(initial) {
      const index = hookIndex
      hookIndex += 1
      if (stateSlots.length <= index) stateSlots[index] = typeof initial === 'function' ? initial() : initial
      const set = (next) => {
        const value = typeof next === 'function' ? next(stateSlots[index]) : next
        if (Object.is(value, stateSlots[index])) return
        stateSlots[index] = value
        dirty = true
      }
      return [stateSlots[index], set]
    },
    useEffect(fn, deps) {
      const index = hookIndex
      hookIndex += 1
      const previous = effectSlots[index]
      const changed = previous === undefined || deps === undefined || !sameDeps(previous.deps, deps)
      effectSlots[index] = { fn, deps: deps === undefined ? undefined : deps.slice(), changed }
    },
    /*
     * useCallback 必须**按依赖记忆**：真实 React 里 load/applyConfig 这类 useCallback 的身份
     * 稳定，于是「[open, pageView, load] 依赖的 effect」只在开卡片时跑一次。桩若每轮返回新函数，
     * effect 会每轮重跑 → 重新拉 /config → 把界面上**还没保存的编辑**冲掉——那是桩的语义错，
     * 会让人误以为产品有 bug（本脚本第一版就这么误报过一次）。
     */
    useCallback(fn, deps) {
      const index = hookIndex
      hookIndex += 1
      const previous = callbackSlots[index]
      if (previous !== undefined && sameDeps(previous.deps, deps)) return previous.fn
      callbackSlots[index] = { fn, deps: deps === undefined ? undefined : deps.slice() }
      return fn
    },
    useRef(initial) {
      const index = hookIndex
      hookIndex += 1
      if (refSlots.length <= index) refSlots[index] = { current: initial }
      return refSlots[index]
    },
  }
  const jsx = (type, props, key) => ({ type, props: { ...(props ?? {}), key } })
  const jsxs = jsx

  /** 渲染一轮 + 跑该跑的 effect。返回「这一轮有没有产生新的渲染」。 */
  function flush() {
    let rendered = false
    for (let round = 0; round < 10; round += 1) {
      if (dirty) {
        dirty = false
        hookIndex = 0
        tree = rootComponent(rootProps)
        rendered = true
      }
      let ran = false
      for (const slot of effectSlots) {
        if (slot === undefined || slot.changed !== true) continue
        slot.changed = false
        ran = true
        slot.fn()
      }
      if (!ran && !dirty) break
    }
    return rendered
  }

  /** 让位给微任务 / 宏任务，再把异步 effect 的落地结果渲染出来。 */
  async function settle(rounds = 12) {
    for (let index = 0; index < rounds; index += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0))
      if (!flush()) {
        // 再等一拍：effect 里的 await 可能需要多轮
        await new Promise((resolve) => setTimeout(resolve, 0))
        if (!flush()) return
      }
    }
  }

  return {
    React,
    jsx,
    jsxs,
    /** 挂一个根组件并渲染到稳定。 */
    async mount(component, props = {}) {
      rootComponent = component
      rootProps = props
      dirty = true
      flush()
      await settle()
      return tree
    },
    get tree() { return tree },
    async update() { await settle(); return tree },
    /** 立刻跑一轮（用户交互后调用）。 */
    tick() { flush() },
  }
}

/* ------------------------------------------------------------------ *
 * 渲染树工具
 * ------------------------------------------------------------------ */

function treeFind(node, predicate, out = []) {
  if (node === null || node === undefined || typeof node !== 'object') return out
  if (Array.isArray(node)) {
    for (const child of node) treeFind(child, predicate, out)
    return out
  }
  if (typeof node.type === 'string' || typeof node.type === 'function') {
    if (predicate(node)) out.push(node)
  }
  treeFind(node.props === undefined ? undefined : node.props.children, predicate, out)
  return out
}

function treeText(node, out = []) {
  if (node === null || node === undefined) return out.join('')
  if (typeof node === 'string' || typeof node === 'number') { out.push(String(node)); return out.join('') }
  if (Array.isArray(node)) { for (const child of node) treeText(child, out); return out.join('') }
  if (typeof node === 'object') treeText(node.props === undefined ? undefined : node.props.children, out)
  return out.join('')
}

/* ------------------------------------------------------------------ *
 * 桩：fetch / window
 * ------------------------------------------------------------------ */

const CONFIG = {
  ok: true,
  config: {
    enabled: true,
    targets: [
      { id: 'es', kind: 'elasticsearch', label: '内网 ES', url: 'http://192.0.2.10:19200/app-logs-*' },
      { id: 'local', kind: 'loki', label: '本地 Loki', url: 'http://127.0.0.1:3100' },
      { id: 'target', kind: 'docker', label: '161', url: '', dockerTarget: '目标2' },
    ],
  },
  plugins: { docker: true },
}

const calls = []
/** 服务端那一份配置：POST 之后要**真的**变，否则卡片保存后的刷新会把编辑冲回去（桩在撒谎）。 */
let serverConfig = CONFIG.config

/**
 * 用例可以把自己那几条路由挂上来（key = path）。值就是**响应体**；要演「后端报错」那一侧就写成
 * `{ ok: false, status: 400, body: { error } }`（有 `body` 键即视为「整份响应」）。
 * 没挂的 path 仍然走 `/config` 那份默认响应——既有用例因此不受影响。
 */
let serverRoutes = {}

/**
 * 最小动作实现（只够让人相信「保存 → 刷新」这一圈）：宿主侧的真判据在 src/config.ts，
 * 有自己的用例，这里不复制它，只把请求体落到状态上。
 */
function applyAction(body) {
  if (body.action === 'enabled') serverConfig = { ...serverConfig, enabled: body.enabled === true }
  if (body.action === 'targets.add') serverConfig = { ...serverConfig, targets: [...serverConfig.targets, { id: 'new', ...body.target }] }
  if (body.action === 'targets.update') {
    serverConfig = {
      ...serverConfig,
      targets: serverConfig.targets.map((target) => (target.id === body.id ? { id: target.id, ...body.patch } : target)),
    }
  }
  if (body.action === 'targets.remove') serverConfig = { ...serverConfig, targets: serverConfig.targets.filter((target) => target.id !== body.id) }
}

const fetchStub = (url, options) => {
  const path = String(url)
  const body = options !== undefined && typeof options.body === 'string' ? JSON.parse(options.body) : undefined
  calls.push({ path, method: options === undefined ? 'GET' : (options.method ?? 'GET'), body })
  if (serverRoutes[path] !== undefined) {
    const spec = typeof serverRoutes[path] === 'function' ? serverRoutes[path](body) : serverRoutes[path]
    const envelope = spec !== null && typeof spec === 'object' && 'body' in spec ? spec : { body: spec }
    return Promise.resolve({
      ok: envelope.ok !== false,
      status: envelope.status === undefined ? 200 : envelope.status,
      json: () => Promise.resolve(envelope.body),
    })
  }
  if (path === '/api/dsh-docker/targets') return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, targets: [] }) })
  if (path === '/api/dsh-loglens/config' && body !== undefined) applyAction(body)
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, config: serverConfig, plugins: { docker: true } }) })
}

let registration = null
const windowStub = { __ModuleLoader__: { load: (entry) => { registration = entry } } }

/* ------------------------------------------------------------------ *
 * 装载
 * ------------------------------------------------------------------ */

await test('client.js 可执行并注册 @hyzyn/dsh-loglens；factory 只 require 平台 seed 的两个模块', () => {
  const run = new Function('window', 'document', 'fetch', code)
  run(windowStub, documentStub, fetchStub)
  assert.ok(registration !== null, '未调用 __ModuleLoader__.load')
  assert.equal(registration.id, '@hyzyn/dsh-loglens')
  assert.equal(typeof registration.factory, 'function')

  const required = []
  const seed = { react: createRuntime().React, 'react/jsx-runtime': { jsx: (t, p, k) => ({ type: t, props: p, key: k }), jsxs: (t, p, k) => ({ type: t, props: p, key: k }) } }
  const exports_ = registration.factory((spec) => {
    required.push(spec)
    if (seed[spec] === undefined) throw new Error('client-modules: require("' + spec + '") missed the module table')
    return seed[spec]
  })
  assert.deepEqual(required.sort(), ['react', 'react/jsx-runtime'])
  assert.deepEqual(exports_.inject, ['slots'])
  assert.equal(typeof exports_.apply, 'function')
})

/** 造一个最小 client ctx：slots 恒有，locale 可选（不给就走中文兜底）。 */
function makeClientCtx(options = {}) {
  const state = { cards: [], injected: [] }
  const ctx = {
    slots: {
      inject: (slot, callback) => {
        if (options.slots !== undefined && !options.slots.includes(slot)) return () => {}
        callback()
        return () => {}
      },
      register: (options_, component) => {
        state.cards.push({ options: options_, component })
        return () => {}
      },
    },
    inject: (names, callback) => {
      state.injected.push(...names)
      if (names.includes('locale') && options.locale === true) {
        callback({ locale: { register: () => () => {}, bind: () => (key) => key } })
      }
      return () => {}
    },
    // 宿主 ctx.effect：立刻执行一次（与真实语义一致：注册即生效），返回释放函数
    effect: (fn) => {
      const dispose = fn()
      return typeof dispose === 'function' ? dispose : () => {}
    },
  }
  return { ctx, state }
}

await test('apply 注册四个槽（含聚合包那一份 row）且都暴露组件', () => {
  const exports_ = registration.factory((spec) => (spec === 'react' ? createRuntime().React : { jsx: (t, p, k) => ({ type: t, props: p, key: k }), jsxs: (t, p, k) => ({ type: t, props: p, key: k }) }))
  const { ctx, state } = makeClientCtx()
  const dispose = exports_.apply(ctx)
  const names = state.cards.map((card) => card.options.name).sort()
  assert.deepEqual(names, ['plugins.bundle.config', 'plugins.row.config', 'settings.kit.item', 'settings.plugin.item'])
  assert.equal(state.cards.find((card) => card.options.name === 'settings.plugin.item').options.key, 'loglens')
  assert.equal(state.cards.find((card) => card.options.name === 'settings.kit.item').options.id, 'loglens')
  for (const card of state.cards) assert.equal(typeof card.component, 'function', card.options.name + ' 未暴露组件')
  assert.ok(dispose === undefined || typeof dispose === 'function', 'apply 要么不返回，要么返回释放函数')
  if (typeof dispose === 'function') dispose()
})

await test('设置卡片渲染：来源行四格齐、ES 行多一个索引表达式、没有多余的勾选框', async () => {
  const runtime = createRuntime()
  const exports_ = registration.factory((spec) => (spec === 'react' ? runtime.React : { jsx: runtime.jsx, jsxs: runtime.jsxs }))
  const { ctx, state } = makeClientCtx()
  exports_.apply(ctx)
  calls.length = 0

  const Card = state.cards.find((card) => card.options.name === 'settings.kit.item').component
  let tree = await runtime.mount(Card, {})
  assert.ok(tree !== null, '卡片没渲染出任何东西')
  // 折叠态：先点开卡头（展开后才渲染正文）
  const header = treeFind(tree, (node) => String(node.props?.className ?? '').includes('ll_cardHeader'))[0]
  assert.ok(header !== undefined, '找不到卡头按钮')
  header.props.onClick()
  runtime.tick()
  tree = await runtime.update()

  const rows = treeFind(tree, (node) => String(node.props?.className ?? '').includes('ll_row'))
  assert.equal(rows.length, 3, '三条来源该有 3 行，实得 ' + String(rows.length))

  // 只有插件启用那一个勾选框（「允许公网地址」按常规做法已经拆掉了：连接面 = 你配的来源）
  const checkboxes = treeFind(tree, (node) => node.type === 'input' && node.props?.type === 'checkbox')
  assert.equal(checkboxes.length, 1, '只剩插件开关那一个勾选框，实得 ' + String(checkboxes.length))
  assert.equal(treeText(tree).includes('允许公网地址'), false, '不该再有「允许公网地址」这一格')

  // ES 行多一个「索引表达式」输入框（真机反馈第 3 条：别让人猜「路径即索引」这条暗号）
  const indexInputs = treeFind(tree, (node) => node.type === 'input' && typeof node.props?.placeholder === 'string' && node.props.placeholder.includes('索引表达式'))
  assert.equal(indexInputs.length, 1, '只有 ES / OpenSearch 行该有索引表达式输入框，实得 ' + String(indexInputs.length))
  return tree
})

await test('填了索引表达式再保存：POST 请求体里带 index（值给 ES 行，别的类型不带）', async () => {
  const runtime = createRuntime()
  const exports_ = registration.factory((spec) => (spec === 'react' ? runtime.React : { jsx: runtime.jsx, jsxs: runtime.jsxs }))
  const { ctx, state } = makeClientCtx()
  exports_.apply(ctx)
  calls.length = 0

  const Card = state.cards.find((card) => card.options.name === 'settings.kit.item').component
  let tree = await runtime.mount(Card, {})
  treeFind(tree, (node) => String(node.props?.className ?? '').includes('ll_cardHeader'))[0].props.onClick()
  runtime.tick()
  tree = await runtime.update()

  const box = treeFind(tree, (node) => node.type === 'input' && typeof node.props?.placeholder === 'string' && node.props.placeholder.includes('索引表达式'))[0]
  box.props.onChange({ target: { value: 'app-logs-*' } })
  runtime.tick()
  tree = await runtime.update()

  const save = treeFind(tree, (node) => node.type === 'button' && String(node.props?.className ?? '') === 'll_btn')[0]
  save.props.onClick()
  await runtime.update()
  await runtime.update()

  const post = calls.find((call) => call.method === 'POST' && call.body !== undefined && call.body.action === 'targets.update')
  assert.ok(post !== undefined, '没有发出 targets.update：' + JSON.stringify(calls))
  assert.equal(post.body.patch.index, 'app-logs-*', '索引表达式必须进请求体')
})

/* ------------------------------------------------------------------ *
 * 时间分布（直方图）：能力由宿主随 /query 下发，面板据此决定画不画
 * ------------------------------------------------------------------ */

/** 一份 /query 的成功响应（形状与宿主 runSearch 的 SearchOutcome 一致，外加 capabilities）。 */
function queryOutcome(target, aggregations) {
  return {
    ok: true,
    target,
    window: { from: 0, to: 900_000 },
    returned: 1,
    counts: { returned: 1, totalKnown: true, matched: 8 },
    truncation: { truncated: false, reasons: [] },
    lines: [{ ts: 0, message: 'boot', source: '0', labels: {}, raw: 'boot', id: '0:0' }],
    warnings: [],
    capabilities: { queryLanguage: 'lucene', pagination: 'cursor', follow: false, aggregations },
  }
}

/** 按文案找按钮（按钮文字就是 t('btn.*') 的中文兜底）。 */
function buttonByText(tree, text) {
  return treeFind(tree, (node) => node.type === 'button' && treeText(node) === text)[0]
}

/**
 * 打开卡片 → 选来源 →（可选：填分组字段）→（默认）点「查询」；返回 `{ runtime, tree }`。
 * 需要自己接着点的用例把 `skipQuery` 打开（例如先点「有哪些字段」再点「分组」）。
 */
async function runPanelQueryFull(targetId, options = {}) {
  const runtime = createRuntime()
  const exports_ = registration.factory((spec) => (spec === 'react' ? runtime.React : { jsx: runtime.jsx, jsxs: runtime.jsxs }))
  const { ctx, state } = makeClientCtx()
  exports_.apply(ctx)
  calls.length = 0
  const Card = state.cards.find((card) => card.options.name === 'settings.kit.item').component
  let tree = await runtime.mount(Card, {})
  treeFind(tree, (node) => String(node.props?.className ?? '').includes('ll_cardHeader'))[0].props.onClick()
  runtime.tick()
  tree = await runtime.update()
  // 「来源」下拉：它的选项值就是来源 id（行的类型下拉用的是 loki / elasticsearch…，不会撞上）
  const targetSelect = treeFind(tree, (node) => node.type === 'select'
    && Array.isArray(node.props?.children)
    && node.props.children.some((child) => child !== null && typeof child === 'object' && child.props?.value === targetId))[0]
  assert.ok(targetSelect !== undefined, '找不到「来源」下拉')
  targetSelect.props.onChange({ target: { value: targetId } })
  runtime.tick()
  tree = await runtime.update()
  // 分组字段：占位符是语法示例（不翻），所以按它找得到那个输入框
  if (typeof options.groupBy === 'string') {
    const fieldBox = treeFind(tree, (node) => node.type === 'input' && node.props?.placeholder === 'container.name')[0]
    assert.ok(fieldBox !== undefined, '找不到「分组字段」输入框')
    fieldBox.props.onChange({ target: { value: options.groupBy } })
    runtime.tick()
    tree = await runtime.update()
  }
  if (options.skipQuery === true) return { runtime, tree }
  const queryBtn = buttonByText(tree, '查询')
  assert.ok(queryBtn !== undefined, '找不到「查询」按钮')
  queryBtn.props.onClick()
  await runtime.update()
  await runtime.update()
  return { runtime, tree: await runtime.update() }
}

/** 只要最终渲染树的用例（分布那几条用这个）。 */
async function runPanelQuery(targetId, options = {}) {
  const { tree } = await runPanelQueryFull(targetId, options)
  return tree
}

await test('时间分布：有聚合能力的来源，按窗口画柱子，**空档补 0**（相邻两根不挨在一起）', async () => {
  serverRoutes = {
    '/api/dsh-loglens/query': queryOutcome({ id: 'es', kind: 'elasticsearch', label: '内网 ES' }, true),
    // 15 分钟窗口 → 30s 一档 = 30 根；只在第 0 与第 2 个桶有数据，中间那根必须是 0
    '/api/dsh-loglens/facets': { ok: true, overTime: [{ ts: 0, count: 3 }, { ts: 60_000, count: 5 }], interval: '30s', warnings: [] },
  }
  const tree = await runPanelQuery('es')

  const facets = calls.find((call) => call.path === '/api/dsh-loglens/facets')
  assert.ok(facets !== undefined, '有聚合能力却没有拉分布：' + JSON.stringify(calls))
  assert.equal(facets.body.interval, '30s', '15 分钟窗口该挑 30s 一档')
  assert.equal(facets.body.from, 0, '窗口必须用宿主**回显**的那一份')
  assert.equal(facets.body.to, 900_000, '窗口必须用宿主**回显**的那一份')
  assert.equal(facets.body.target, 'es')

  // 「空桶」是**两个类**（ll_histBar ll_histBarEmpty）——按空格切成 token 再比，别用整串相等
  const tokens = (node) => (typeof node.props?.className === 'string' ? node.props.className.split(' ') : [])
  const allBars = treeFind(tree, (node) => tokens(node).includes('ll_histBar'))
  const empties = treeFind(tree, (node) => tokens(node).includes('ll_histBarEmpty'))
  assert.equal(allBars.length, 30, '柱子数该等于 窗口 / 间隔，实得 ' + String(allBars.length))
  assert.equal(empties.length, 28, '**空档必须补 0**：缺了这一步，两根柱子会挨在一起，图上看起来一直在刷')
  assert.equal(allBars.length - empties.length, 2, '只有两个桶有数据')

  const text = treeText(tree)
  assert.ok(text.includes('时间分布'), '缺少小节名')
  assert.ok(text.includes('每根柱子 30s'), '没说清一根柱子是多长时间')
  assert.ok(text.includes('峰值 5 条'), '没报峰值')
  assert.ok(text.includes('共 8 条'), '没截断时该报合计')
})

await test('时间分布：Loki（聚合为假）**不画、也不发那个请求**，只在界面上说清为什么', async () => {
  serverRoutes = {
    '/api/dsh-loglens/query': queryOutcome({ id: 'local', kind: 'loki', label: '本地 Loki' }, false),
    // 故意挂一个「万一会调」的分布路由：真调了就会被下面那条断言抓到
    '/api/dsh-loglens/facets': { ok: true, overTime: [{ ts: 0, count: 999 }], warnings: [] },
  }
  const tree = await runPanelQuery('local')

  assert.equal(calls.some((call) => call.path === '/api/dsh-loglens/facets'), false,
    '不支持聚合却还是发了分布请求（白跑一趟，而且可能是个永远失败的入口）')
  assert.equal(treeFind(tree, (node) => String(node.props?.className ?? '').startsWith('ll_histBar')).length, 0, '不该画出柱子')
  assert.ok(treeText(tree).includes('当前来源不支持聚合'), '该把「为什么没有」写在明面上')
})

await test('时间分布：拉不到时只说那一句，**结果列表不受影响**（分布是附加信息）', async () => {
  serverRoutes = {
    '/api/dsh-loglens/query': queryOutcome({ id: 'es', kind: 'elasticsearch', label: '内网 ES' }, true),
    '/api/dsh-loglens/facets': { ok: false, status: 400, body: { error: 'boom' } },
  }
  const tree = await runPanelQuery('es')

  const text = treeText(tree)
  assert.ok(text.includes('时间分布取不到：boom'), '拉不到时该把宿主那句话显示出来，实得：' + text.slice(0, 200))
  assert.ok(text.includes('boot'), '分布失败不该把已经拿到的结果列表也带走')
  assert.equal(treeFind(tree, (node) => String(node.props?.className ?? '').startsWith('ll_histBar')).length, 0, '失败时不该画半张图')
})

await test('时间分布：宿主**没给** capabilities（不知道）时什么都不说，且不去试', async () => {
  // 第一版把「缺字段」与「明确说不支持」走同一支，界面会写「当前来源不支持聚合」——
  // 那是替对方说一句我们没依据的话（同一判据的先例：pure.js 的 dockerFlagOf「不知道 ≠ 没装」）。
  const outcome = queryOutcome({ id: 'es', kind: 'elasticsearch', label: '内网 ES' }, true)
  delete outcome.capabilities
  serverRoutes = { '/api/dsh-loglens/query': outcome }
  const tree = await runPanelQuery('es')

  assert.equal(calls.some((call) => call.path === '/api/dsh-loglens/facets'), false, '不知道就不该去试那一枪')
  const text = treeText(tree)
  assert.equal(text.includes('不支持聚合'), false, '缺字段不是「不支持」——不知道就什么都不说')
  assert.equal(treeFind(tree, (node) => String(node.props?.className ?? '').startsWith('ll_histBar')).length, 0, '不知道也不该画')
})

/* ------------------------------------------------------------------ *
 * 按字段分组（terms 榜）：能力自述 + 字段名决定发不发，画出来的条与警告都要对得上
 * ------------------------------------------------------------------ */

/** 带 by 的聚合响应（榜）与不带的（分布）走同一条 /facets——桩按请求体分流。 */
function facetsRoute(bySpec, overTimeSpec) {
  return (body) => (body.by === undefined ? overTimeSpec : bySpec)
}

const HIST_OK = { ok: true, overTime: [{ ts: 0, count: 3 }], warnings: [] }

await test('按字段分组：填了字段就按**回显窗口**拉 terms 榜，条数 / 条宽 / 空值键 / 警告都对得上', async () => {
  serverRoutes = {
    '/api/dsh-loglens/query': queryOutcome({ id: 'es', kind: 'elasticsearch', label: '内网 ES' }, true),
    '/api/dsh-loglens/facets': facetsRoute({
      ok: true,
      buckets: [{ key: 'app-svc-1', count: 8 }, { key: 'app-svc-2', count: 4 }, { key: '', count: 2 }],
      otherCount: 3,
      warnings: ['还有 3 条落在没列出来的桶里：把 size 调大'],
    }, HIST_OK),
  }
  const tree = await runPanelQuery('es', { groupBy: 'container.name' })

  const byCalls = calls.filter((call) => call.path === '/api/dsh-loglens/facets' && call.body.by !== undefined)
  assert.equal(byCalls.length, 1, '该拉一次榜：' + JSON.stringify(calls))
  assert.equal(byCalls[0].body.by, 'container.name')
  assert.equal(byCalls[0].body.from, 0, '窗口必须用宿主**回显**的那一份')
  assert.equal(byCalls[0].body.to, 900_000, '窗口必须用宿主**回显**的那一份')
  assert.equal('size' in byCalls[0].body, false, 'size 不传：桶数上限是后端的事，面板不写死「前十」')

  const text = treeText(tree)
  assert.ok(text.includes('按字段分组'), '缺少小节名：' + text.slice(0, 200))
  assert.ok(text.includes('container.name'), '榜要看得出「按什么分的」')
  assert.ok(text.includes('app-svc-1'), '缺了排名里的键名')
  assert.ok(text.includes('8 条'), '缺了条数')
  assert.ok(text.includes('（空值）'), '空值键要给一句人话，不然是一条没有名字的横条')
  assert.ok(text.includes('还有 3 条落在没列出来的桶里'), '宿主的警告要照抄——agent 看得到的东西，面板也得看得到')

  const fills = treeFind(tree, (node) => String(node.props?.className ?? '') === 'll_groupFill')
  assert.equal(fills.length, 3, '三个桶就该有三条横条，实得 ' + String(fills.length))
  assert.equal(fills[0].props.style.width, '100%', '最大的桶该铺满')
  assert.equal(fills[1].props.style.width, '50%')
  assert.equal(fills[2].props.style.width, '25%')
  // 「不写合计」：列出来的桶加起来不是命中总数（没列出来的那条在宿主的警告里）
  assert.equal(text.includes('共 14 条'), false, '不许把「列出来的桶之和」写成合计')
})

await test('按字段分组：Loki（聚合为假）填了字段也**不发、不画**，一句话说清为什么', async () => {
  serverRoutes = {
    '/api/dsh-loglens/query': queryOutcome({ id: 'local', kind: 'loki', label: '本地 Loki' }, false),
    '/api/dsh-loglens/facets': facetsRoute({ ok: true, buckets: [{ key: 'x', count: 9 }], warnings: [] }, HIST_OK),
  }
  const tree = await runPanelQuery('local', { groupBy: 'container.name' })

  assert.equal(calls.some((call) => call.path === '/api/dsh-loglens/facets'), false,
    '不支持聚合却还是发了请求（白跑一趟，而且可能是个永远失败的入口）')
  assert.equal(treeFind(tree, (node) => String(node.props?.className ?? '') === 'll_groupFill').length, 0, '不该画出横条')
  const text = treeText(tree)
  assert.ok(text.includes('当前来源不支持聚合'), '该把「为什么没有」写在明面上')
  assert.ok(text.includes('时间分布与分组榜'), '两句聚合共用一句话，别在界面上说两遍')
  assert.equal(buttonByText(tree, '分组').props.disabled, true, '不支持的来源，「分组」该是灰的')
})

await test('按字段分组：拉不到时只说那一句，**结果列表不受影响**（榜也是附加信息）', async () => {
  serverRoutes = {
    '/api/dsh-loglens/query': queryOutcome({ id: 'es', kind: 'elasticsearch', label: '内网 ES' }, true),
    '/api/dsh-loglens/facets': facetsRoute({ ok: false, status: 400, body: { error: 'boom-group' } }, HIST_OK),
  }
  const tree = await runPanelQuery('es', { groupBy: 'container.name' })

  const text = treeText(tree)
  assert.ok(text.includes('分组取不到：boom-group'), '该把宿主那句话显示出来，实得：' + text.slice(0, 300))
  assert.ok(text.includes('boot'), '榜失败不该把已经拿到的结果列表也带走')
  assert.equal(treeFind(tree, (node) => String(node.props?.className ?? '') === 'll_groupFill').length, 0, '失败时不该画半张榜')
})

await test('按字段分组：**没填字段就不发**；点「分组」给一句「先填字段」，不是静默无操作', async () => {
  serverRoutes = {
    '/api/dsh-loglens/query': queryOutcome({ id: 'es', kind: 'elasticsearch', label: '内网 ES' }, true),
    '/api/dsh-loglens/facets': facetsRoute({ ok: true, buckets: [{ key: 'x', count: 9 }], warnings: [] }, HIST_OK),
  }
  const { runtime, tree } = await runPanelQueryFull('es')
  assert.equal(calls.some((call) => call.path === '/api/dsh-loglens/facets' && call.body.by !== undefined), false,
    '没填分组字段，查询时不该顺手拉一个没有字段的榜')

  const groupBtn = buttonByText(tree, '分组')
  assert.ok(groupBtn !== undefined, '找不到「分组」按钮')
  assert.equal(groupBtn.props.disabled, false, '能力支持、只是没填字段——按钮该能点，点了给提示')
  groupBtn.props.onClick()
  await runtime.update()
  await runtime.update()

  assert.equal(calls.some((call) => call.path === '/api/dsh-loglens/facets' && call.body.by !== undefined), false,
    '字段为空不许发请求（一个没有字段的聚合请求只会拿到后端的报错）')
  assert.ok(treeText(runtime.tree).includes('先填要分组的字段'), '该给一句「先填字段」')
})

await test('「有哪些字段」：拉一次 /fields 把候选填进 datalist（不传 limit，用宿主的默认值）', async () => {
  serverRoutes = {
    '/api/dsh-loglens/fields': {
      ok: true,
      fields: [{ name: 'container.name', kind: 'keyword', preferred: true }, { name: 'host.name', kind: 'keyword' }],
      total: 2,
      truncated: false,
      warnings: [],
    },
  }
  const { runtime, tree } = await runPanelQueryFull('es', { skipQuery: true })
  const fieldsBtn = buttonByText(tree, '有哪些字段')
  assert.ok(fieldsBtn !== undefined, '找不到「有哪些字段」按钮')
  fieldsBtn.props.onClick()
  await runtime.update()
  await runtime.update()
  const after = runtime.tree

  const call = calls.find((item) => item.path === '/api/dsh-loglens/fields')
  assert.ok(call !== undefined, '没打 /fields：' + JSON.stringify(calls))
  assert.equal(call.body.target, 'es')
  assert.equal('limit' in call.body, false, 'limit 不传：用宿主自己的默认值，别在浏览器侧抄一份会漂的')

  const options = treeFind(after, (node) => node.type === 'option').filter((node) => node.props?.value === 'container.name' || node.props?.value === 'host.name')
  assert.equal(options.length, 2, '两个字段名都该成为候选')
  // 输入框的 list 必须指向**本卡自己的**那个 datalist（写死 id 时，后一张卡会指向先一张的）
  const fieldBox = treeFind(after, (node) => node.type === 'input' && node.props?.placeholder === 'container.name')[0]
  assert.equal(typeof fieldBox.props.list, 'string')
  assert.ok(fieldBox.props.list !== '', 'list 指向一个空 id')
  assert.ok(treeFind(after, (node) => node.type === 'datalist' && node.props?.id === fieldBox.props.list)[0] !== undefined,
    '输入框的 list 必须指向一个真的存在的 datalist（id 为 ' + String(fieldBox.props.list) + '）')
  assert.ok(treeText(after).includes('字段清单 2 个'), '该回一句「拉到了什么」，否则点了像没反应')
})

/* ------------------------------------------------------------------ *
 * 点桶下钻（结构化筛选）：点榜上一条 → 带 filters 重查一次
 * ------------------------------------------------------------------ */

/** className 里有没有这一类（节点上的 className 可能是 'a b c'）。 */
function hasClass(node, name) {
  return typeof node.props?.className === 'string' && node.props.className.split(' ').includes(name)
}

/** 一份带空值桶的榜：既用来测下钻，也用来测「空值那一条不给点」。 */
const DRILL_BUCKETS = {
  ok: true,
  buckets: [{ key: 'app-svc-1', count: 8 }, { key: 'app-svc-2', count: 4 }, { key: '', count: 2 }],
  warnings: [],
}

function drillRoutes() {
  return {
    '/api/dsh-loglens/query': queryOutcome({ id: 'es', kind: 'elasticsearch', label: '内网 ES' }, true),
    '/api/dsh-loglens/facets': facetsRoute(DRILL_BUCKETS, HIST_OK),
  }
}

/** 榜上「app-svc-1」那一条（可点的按钮）。 */
function drillRow(tree) {
  return treeFind(tree, (node) => node.type === 'button' && hasClass(node, 'll_groupRowBtn') && treeText(node).includes('app-svc-1'))[0]
}

/** 点一下 + 让异步链跑完（重查 → 两份聚合）。 */
async function clickAndSettle(runtime, node) {
  node.props.onClick()
  await runtime.update()
  await runtime.update()
  await runtime.update()
}

await test('点桶下钻：点榜上一条就**带 filters 重查一次**（行与两份聚合收窄到同一个子集）', async () => {
  serverRoutes = drillRoutes()
  const { runtime, tree } = await runPanelQueryFull('es', { groupBy: 'container.name' })
  const row = drillRow(tree)
  assert.ok(row !== undefined, '榜上第一条该是个可点的按钮——下钻的入口就是它')

  calls.length = 0
  await clickAndSettle(runtime, row)

  const query = calls.find((call) => call.path === '/api/dsh-loglens/query')
  assert.ok(query !== undefined, '下钻必须**真的重查一次**：拿已经到手的那一页在本地过一遍是假的（那一页被 limit 截断过）')
  assert.deepEqual(query.body.filters, { 'container.name': 'app-svc-1' })
  const facets = calls.filter((call) => call.path === '/api/dsh-loglens/facets')
  assert.equal(facets.length, 2, '分布与榜都该重拉一次，实得：' + JSON.stringify(calls.map((call) => call.path)))
  for (const call of facets) {
    assert.deepEqual(call.body.filters, { 'container.name': 'app-svc-1' },
      '聚合必须画在同一个子集上，否则同一屏三个数字说的不是一件事')
  }

  const after = runtime.tree
  assert.ok(treeText(after).includes('container.name = app-svc-1'),
    '该出一枚芯片写着现在筛的是什么：' + treeText(after).slice(0, 200))
  assert.equal(treeFind(after, (node) => hasClass(node, 'll_groupRowActive')).length, 1,
    '正在按它下钻的那一条该看得出来（不然用户不知道这一屏是筛过的）')
})

await test('再点一次就是取消：筛选清空（**不带 filters 键**，不是带个空对象），芯片与高亮都消失', async () => {
  serverRoutes = drillRoutes()
  const { runtime, tree } = await runPanelQueryFull('es', { groupBy: 'container.name' })
  await clickAndSettle(runtime, drillRow(tree))
  const queries = calls.filter((call) => call.path === '/api/dsh-loglens/query')
  assert.deepEqual(queries[queries.length - 1].body.filters, { 'container.name': 'app-svc-1' })

  // 重新从**这一轮的树**里找那一条：找得到本身也说明下钻之后榜重画了
  const active = drillRow(runtime.tree)
  assert.ok(active !== undefined, '下钻之后那一条还在榜上（这一屏是筛过的榜）')
  calls.length = 0
  await clickAndSettle(runtime, active)

  const query = calls.find((call) => call.path === '/api/dsh-loglens/query')
  assert.ok(query !== undefined, '取消也要重查一次（不能只把芯片抹掉，那一屏的行还是筛过的）')
  assert.equal('filters' in query.body, false, '取消之后不许带一个空对象：请求形状要回到加筛选之前')
  const text = treeText(runtime.tree)
  assert.equal(text.includes('container.name = app-svc-1'), false, '芯片该没了')
  assert.equal(treeFind(runtime.tree, (node) => hasClass(node, 'll_groupRowActive')).length, 0, '取消之后不该还有高亮')
})

await test('芯片上的 × 也能去掉筛选（同样真的重查一次，不是只动界面）', async () => {
  serverRoutes = drillRoutes()
  const { runtime, tree } = await runPanelQueryFull('es', { groupBy: 'container.name' })
  await clickAndSettle(runtime, drillRow(tree))

  const chipBtn = treeFind(runtime.tree, (node) => node.type === 'button' && hasClass(node, 'll_chipBtn'))[0]
  assert.ok(chipBtn !== undefined, '芯片上该有个 × ')
  calls.length = 0
  await clickAndSettle(runtime, chipBtn)

  const query = calls.find((call) => call.path === '/api/dsh-loglens/query')
  assert.ok(query !== undefined, '点 × 之后要重查一次')
  assert.equal('filters' in query.body, false, '去掉唯一一条筛选之后，请求里不该再出现 filters')
  assert.equal(treeFind(runtime.tree, (node) => node.type === 'button' && hasClass(node, 'll_chipBtn')).length, 0, '芯片该没了')
})

await test('空值那一桶**不给点**：筛选表达不了「字段缺失」，给个点得动的入口就会筛出别的东西', async () => {
  serverRoutes = drillRoutes()
  const tree = await runPanelQuery('es', { groupBy: 'container.name' })

  const blank = treeFind(tree, (node) => hasClass(node, 'll_groupRow') && treeText(node).includes('（空值）'))[0]
  assert.ok(blank !== undefined, '空值那一桶该照旧画出来（不是渲染丢了东西）')
  assert.equal(blank.type, 'div', '空值那一桶不该是按钮：点了会下发 {字段: ""}，那是「等于空串」不是「字段缺失」')
  assert.ok(String(blank.props.title ?? '').includes('不能下钻'), '该在明面上说清为什么点不了')

  // 其余两条仍是可点的按钮：空值桶的存在不该把整张榜变成死文字
  assert.equal(treeFind(tree, (node) => node.type === 'button' && hasClass(node, 'll_groupRowBtn')).length, 2,
    '可点的应该只有有名字的那两条')
})

/* ------------------------------------------------------------------ *
 * 结果
 * ------------------------------------------------------------------ */

let failed = 0
for (const result of results) {
  if (result.ok) console.log('  ✓ ' + result.name)
  else {
    failed += 1
    console.error('  ✗ ' + result.name + '\n      ' + result.message)
  }
}
console.log('\n[dsh-loglens] client-smoke: ' + String(results.length - failed) + '/' + String(results.length) + ' 通过')
process.exit(failed > 0 ? 1 : 0)