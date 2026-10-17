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

/** className 里有没有这一类（节点上的 className 可能是 'a b c'）。 */
function hasClass(node, name) {
  return typeof node.props?.className === 'string' && node.props.className.split(' ').includes(name)
}

/** 字段候选浮层里的行（每一行是一个 `<button class="ll_pickItem">`）。 */
function pickRows(tree) {
  return treeFind(tree, (node) => node.type === 'button' && hasClass(node, 'll_pickItem'))
}

/** 分组字段那个输入框（它的占位符是语法示例，所以按占位符找得到）。 */
function pickInput(tree) {
  return treeFind(tree, (node) => node.type === 'input' && node.props?.placeholder === 'container.name')[0]
}

/*
 * 占位文案的**宽度预算**（2026-10-14 真机：来源下拉里的「（先选一个来源）」被原生箭头切掉一半，
 * 画出来是「（先选一个来源」）。
 *
 * 预算从样式算出来，不是拍脑袋：`.ll_queryGrid` 第一列 `minmax(110px,130px)`（最窄 110px），
 * `.ll_input` 左右各 12px 内边距 → 86px，原生 `<select>` 的箭头再占约 20px → **文字区最窄约 66px**。
 * `.ll_input` 的 font-size 是 13px，全角字正好一字 13px，所以预算是 **5 个汉字**（65px ≤ 66px）。
 *
 * 为什么值得一条守卫：文案是**最容易在下次改动里长胖**的东西——它只要读起来通顺就行，没人会去量，
 * 而长胖的代价只有真机上那一眼能看见。这条守卫让「放不下」在提交前就红。
 */
const NARROW_LABEL_UNITS = 5

/** 一个字占几个「汉字宽」：全角 / CJK / 中文标点（含 ……）算 1，拉丁字母与空格算 0.5。 */
function labelUnits(text) {
  let units = 0
  for (const ch of String(text)) units += /[\u2000-\u2BFF\u3000-\u9FFF\uFF00-\uFFEF]/u.test(ch) ? 1 : 0.5
  return units
}

/** 断言一句界面文案放得进最窄那一列（`where` 写清是哪一格的文案）。 */
function assertNarrowLabel(text, where) {
  const units = labelUnits(text)
  assert.ok(units <= NARROW_LABEL_UNITS,
    where + '的文案「' + String(text) + '」放不进最窄那一列：预算 ' + String(NARROW_LABEL_UNITS)
    + ' 个汉字，实得 ' + String(units))
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

await test('刚进卡片（几个来源、还没选）：「来源」下拉显示占位项，不许把第一项画成已选', async () => {
  // 真机（用户第一眼）就是这么发现的：下拉写着「161（Docker）」——面板其余部分却按「没选来源」走
  // （不画容器日志区、分组按钮是灰的、点「查询」回一句「先选一个来源」）。三处症状一个根因：
  // 显示的那一项与实际用的那一项不是同一个判断。
  serverRoutes = { '/api/dsh-loglens/query': queryOutcome({ id: 'es', kind: 'elasticsearch', label: '内网 ES' }, true) }
  const { runtime, tree } = await runPanelQueryFull('es', { skipTarget: true })

  const select = treeFind(tree, (node) => node.type === 'select'
    && Array.isArray(node.props?.children)
    && node.props.children.some((child) => child?.props?.value === 'es'))[0]
  assert.ok(select !== undefined, '找不到「来源」下拉')
  assert.equal(select.props.value, '', '还没选来源时下拉的 value 必须是空：写成第一项的 id 就是替用户挑了一个来源')
  const first = select.props.children[0]
  assert.equal(first.props.value, '', '第一项该是那个空 value 的占位项')
  assert.equal(first.props.disabled, true, '占位项不可选——它就是「还没选」这句话本身')
  assert.equal(treeText(first), '选择来源', '占位项是一句**短标签**（旧文案「（先选一个来源）」9 字放不下，被原生箭头切掉一半）')
  assertNarrowLabel(treeText(first), '「来源」下拉的占位项')

  // 没选来源时：点开字段框既不该拉字段，也不该开一个空浮层——该说的是「先选一个来源」
  calls.length = 0
  pickInput(tree).props.onFocus()
  await runtime.update()
  assert.equal(calls.some((call) => call.path === '/api/dsh-loglens/fields'), false, '没选来源不该去拉字段')
  assert.equal(treeFind(runtime.tree, (node) => hasClass(node, 'll_pickList')).length, 0, '没选来源不该开浮层')
  assert.ok(treeText(runtime.tree).includes('先选一个来源'), '该说清为什么点不开')

  calls.length = 0
  buttonByText(tree, '查询').props.onClick()
  await runtime.update()
  assert.equal(calls.some((call) => call.path === '/api/dsh-loglens/query'), false, '没选来源不许发查询')
  assert.ok(treeText(runtime.tree).includes('先选一个来源'), '该说清为什么点不动，而不是静默按下拉里看到的那一项去查')
})

await test('只有一个来源时：「来源」下拉就显示它（与请求里真正用的那一项逐字相同）', async () => {
  const backup = serverConfig
  serverRoutes = { '/api/dsh-loglens/query': queryOutcome({ id: 'es', kind: 'elasticsearch', label: '内网 ES' }, false) }
  try {
    serverConfig = { enabled: true, targets: [backup.targets[0]] }
    const { runtime, tree } = await runPanelQueryFull('es', { skipTarget: true })

    const select = treeFind(tree, (node) => node.type === 'select'
      && Array.isArray(node.props?.children)
      && node.props.children.some((child) => child?.props?.value === 'es'))[0]
    assert.equal(select.props.value, 'es', '只有一个来源时该回落显示它（queryProblem / queryPayload 也是这么回落的）')

    calls.length = 0
    buttonByText(tree, '查询').props.onClick()
    await runtime.update()
    await runtime.update()
    const query = calls.find((call) => call.path === '/api/dsh-loglens/query')
    assert.ok(query !== undefined, '只有一个来源时不选也能直接查（面板与宿主都是这条判据）')
    assert.equal(query.body.target, 'es', '请求里的来源必须与下拉显示的那一项逐字相同')
  } finally {
    serverConfig = backup
  }
})

await test('选中的来源被删掉之后：下拉回到占位、查询回一句「先选一个来源」——不许打一个已经不存在的 id', async () => {
  const backup = serverConfig
  serverRoutes = { '/api/dsh-loglens/query': queryOutcome({ id: 'es', kind: 'elasticsearch', label: '内网 ES' }, true) }
  try {
    const { runtime, tree } = await runPanelQueryFull('es')
    // 真点那一行的「删除」（POST targets.remove + 重新读配置）
    const esRow = treeFind(tree, (node) => hasClass(node, 'll_row'))[0]
    const del = esRow.props.children.filter((child) => child?.type === 'button')[1]
    assert.ok(del !== undefined, '找不到那一行的「删除」')
    del.props.onClick()
    await runtime.update()
    await runtime.update()
    await runtime.update()

    const after = runtime.tree
    assert.equal(treeFind(after, (node) => node.type === 'option' && node.props?.value === 'es').length, 0,
      'es 那一行删掉之后，下拉里不该还有它')
    const select = treeFind(after, (node) => node.type === 'select'
      && Array.isArray(node.props?.children)
      && node.props.children.some((child) => child?.props?.value === 'local'))[0]
    assert.equal(select.props.value, '', '选中的来源没了 → 下拉该回到占位，而不是继续显示一个不存在的 id')

    calls.length = 0
    buttonByText(after, '查询').props.onClick()
    await runtime.update()
    assert.equal(calls.some((call) => call.path === '/api/dsh-loglens/query'), false, '不许拿一个已经不存在的 id 去查')
    assert.ok(treeText(runtime.tree).includes('先选一个来源'))
  } finally {
    serverConfig = backup
  }
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
 * 需要自己接着点的用例把 `skipQuery` 打开（例如先点开字段框拉候选、再点「分组」）。
 */
/** 「来源」下拉：它的选项值就是来源 id（行的类型下拉用的是 loki / elasticsearch…，不会撞上）。 */
function sourceSelect(tree, targetId) {
  return treeFind(tree, (node) => node.type === 'select'
    && Array.isArray(node.props?.children)
    && node.props.children.some((child) => child !== null && typeof child === 'object' && child.props?.value === targetId))[0]
}

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
  // 「刚进卡片、还没选来源」那个状态本身也要能测（那是第一眼看到的画面）
  if (options.skipTarget === true) return { runtime, tree }
  // 「来源」下拉：它的选项值就是来源 id（行的类型下拉用的是 loki / elasticsearch…，不会撞上）
  const targetSelect = sourceSelect(tree, targetId)
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

/* ------------------------------------------------------------------ *
 * 时间分布：点柱放大（P6 第五格）
 * ------------------------------------------------------------------ */

/** 有数据的柱子（可点的那几根；空桶是静态 div，不在这个名单里）。 */
function clickableBars(tree) {
  return treeFind(tree, (node) => node.type === 'button' && tokensOf(node).includes('ll_histBarClick'))
}

function tokensOf(node) {
  return typeof node.props?.className === 'string' ? node.props.className.split(' ') : []
}

/** 窗口下拉（`value` 是 preset 键的那一个）。 */
function windowSelect(tree) {
  return treeFind(tree, (node) => node.type === 'select'
    && Array.isArray(node.props?.children)
    && node.props.children.some((child) => child !== null && typeof child === 'object' && child.props?.value === '1h'))[0]
}

/** 一档分桶的毫秒数（桩用：把桶摆在**这次请求的窗口里**，与真后端一样）。 */
const INTERVAL_MS = { '10s': 10_000, '30s': 30_000, '1m': 60_000 }

const ZOOM_ROUTES = () => ({
  /*
   * 1 小时窗 → 1m 一档（**故意选比下限粗的档**：30s 档本来就窄于 1 分钟，点下去必被夹，
   * 那样测到的就一直是「被夹」那一支，测不到「窗口就是这一档」这条主判据）。
   *
   * `/query` 用**函数**：窗口按请求回显——真宿主就是这么做的（`runSearch` 回的是归一化之后
   * 真正生效的那一段），而两份聚合的窗口取自**这份回显**（`facetsEnvelope` 的判据）。桩若回一个
   * 固定窗口，聚合那两条断言测的就是桩而不是代码。
   */
  '/api/dsh-loglens/query': (body) => ({
    ...queryOutcome({ id: 'es', kind: 'elasticsearch', label: '内网 ES' }, true),
    window: { from: body.from, to: body.to },
  }),
  /*
   * 分布也按**这次请求的窗口**摆桶（真后端只在查的那段里有数据）：两根有数据、中间留一个空档。
   * 桶起点按 `histogramBars` 的对齐规则算（`floor(from/step)*step` + 整数倍），否则柱子按 ts 取值
   * 会对不上——那样测到的是桩没摆对，而不是代码。
   */
  '/api/dsh-loglens/facets': (body) => {
    const step = INTERVAL_MS[body.interval] ?? 60_000
    const first = Math.floor(Number(body.from) / step) * step
    return { ok: true, overTime: [{ ts: first, count: 3 }, { ts: first + 2 * step, count: 5 }], interval: body.interval, warnings: [] }
  },
})

/** 一根柱子代表的桶起点（渲染的 key 就是 `ll-hist-<ts>`）。 */
function barTs(bar) {
  return Number(String(bar.props.key).replace('ll-hist-', ''))
}

await test('点柱放大：点一根有数据的柱 = 把时间窗夹到**这一档**重查一次（不是整个旧窗口）', async () => {
  serverRoutes = ZOOM_ROUTES()
  const { runtime, tree } = await runPanelQueryFull('es')
  const bars = clickableBars(tree)
  assert.equal(bars.length, 2, '只有有数据的柱子才可点（空桶点进去只会得到「没有命中」），实得 ' + String(bars.length))

  calls.length = 0
  await clickAndSettle(runtime, bars[1])

  const query = calls.find((call) => call.path === '/api/dsh-loglens/query')
  assert.ok(query !== undefined, '点柱必须**真的重查一次**（不拿本地行数糊一个结果）')
  // 点的第二根有数据的柱：窗口就该是**那一档**。少了「窗口随草稿走」那一改，发出去的会是整个旧
  // 窗口（[now-1h, now]）——断言当场红，这正是这条用例存在的理由
  const picked = barTs(bars[1])
  assert.equal(query.body.from, picked, '窗口该夹到这一根柱的起点，实得 ' + String(query.body.from))
  assert.equal(query.body.to, picked + 60_000, '窗口该夹到这一根柱的终点，实得 ' + String(query.body.to))
  assert.notEqual(query.body.to - query.body.from, 60 * 60 * 1000, '不许把整个旧窗口再查一遍')
  // 聚合跟着同一个窗口（行、分布、榜说的必须是同一段）。这一轮没填分组字段，所以只有分布那一次；
  // 判据是「凡发出去的聚合，窗口都必须与这一枪相同」——按条数断言反而会把「榜没拉」当成失败。
  const facets = calls.filter((call) => call.path === '/api/dsh-loglens/facets')
  assert.ok(facets.length >= 1, '分布该重拉一次，实得：' + JSON.stringify(calls.map((call) => call.path)))
  for (const call of facets) {
    assert.equal(call.body.from, picked, '聚合必须画在同一段上，否则同一屏三个数字说的不是一件事')
    assert.equal(call.body.to, picked + 60_000, '聚合必须画在同一段上')
  }

  const after = runtime.tree
  assert.equal(treeFind(after, (node) => hasClass(node, 'll_histBarActive')).length, 1,
    '正在放大的那一档该看得出来（与榜上「正在按它下钻」同一条判据）')
  const select = windowSelect(after)
  assert.equal(select.props.value, 'custom', '窗口下拉该显示「自定义」那一档')
  assert.ok(treeText(select).includes('→'), '下拉文案该是**真实范围**，不是裸键名 custom：' + treeText(select))
  assert.ok(String(bars[1].props.title).includes('点一下放大到这一段'), '悬停该说清这根柱子能点：' + String(bars[1].props.title))
  assert.ok(String(bars[1].props.title).includes('5 条'), '悬停仍要说清这一段有多少条')
})

await test('点柱放大：空桶是**静态**的，点不动（给个点得动、结果却是空窗口的入口更坏）', async () => {
  serverRoutes = ZOOM_ROUTES()
  const { tree } = await runPanelQueryFull('es')
  const all = treeFind(tree, (node) => tokensOf(node).includes('ll_histBar'))
  const empties = treeFind(tree, (node) => tokensOf(node).includes('ll_histBarEmpty'))
  // 柱数按窗口对齐算（1 小时 / 1 分钟 = 60，落在桶边界上时是 61）——按「补了几个 0」断，
  // 不写死 60：写死了会在换一个对齐的 now 时变成假红
  assert.ok(all.length >= 60 && all.length <= 61, '1 小时窗 / 1 分钟一档该是 60（或 61）根，实得 ' + String(all.length))
  assert.equal(all.length - empties.length, 2, '只有两个桶有数据（其余都补 0）')
  for (const bar of empties) {
    assert.notEqual(bar.type, 'button', '空桶不许是可点的按钮')
    assert.equal(typeof bar.props?.onClick, 'undefined', '空桶不许挂 onClick')
  }
})

await test('点柱放大：换预设档 = 把这一段撤掉（下拉、草稿与高亮一起回落，不留第二份真相）', async () => {
  serverRoutes = ZOOM_ROUTES()
  const { runtime, tree } = await runPanelQueryFull('es')
  await clickAndSettle(runtime, clickableBars(tree)[1])
  assert.equal(windowSelect(runtime.tree).props.value, 'custom', '先得真的进到自定义档')
  assert.equal(windowChoicesHasCustom(runtime.tree), true, 'custom 该在下拉里（否则浏览器回落显示第一项，下拉就在说谎）')

  calls.length = 0
  windowSelect(runtime.tree).props.onChange({ target: { value: '15m' } })
  runtime.tick()
  await runtime.update()

  assert.equal(windowSelect(runtime.tree).props.value, '15m')
  assert.equal(treeFind(runtime.tree, (node) => hasClass(node, 'll_histBarActive')).length, 0, '换档后高亮该撤掉')
  assert.equal(windowChoicesHasCustom(runtime.tree), false, 'custom 不该再留在下拉里（它不是能挑的一档）')

  // 再查一次：窗口必须是**预设窗**（now-15m → now），不是上一次那段自定义
  await clickAndSettle(runtime, buttonByText(runtime.tree, '查询'))
  const query = calls.find((call) => call.path === '/api/dsh-loglens/query')
  assert.ok(query !== undefined, '该发出这一次查询')
  assert.equal(query.body.to - query.body.from, 15 * 60 * 1000, '换档后该按 15 分钟查，实得 ' + String(query.body.to - query.body.from))
})

/** 下拉里还有没有 custom 那一项（它只在放大期间才该出现）。 */
function windowChoicesHasCustom(tree) {
  const select = windowSelect(tree)
  return select.props.children.some((option) => option !== null && option !== undefined && option.props?.value === 'custom')
}

await test('点柱放大：被下限夹过时**说出来**（10 秒档夹到 1 分钟，窗不是他点的那么宽）', async () => {
  // 造一个 2 分钟窗：10s 档 = 12 根，点其中一根（10 秒 < 1 分钟）→ 必须被夹到 1 分钟
  serverRoutes = {
    '/api/dsh-loglens/query': {
      ...queryOutcome({ id: 'es', kind: 'elasticsearch', label: '内网 ES' }, true),
      window: { from: 0, to: 120_000 },
    },
    '/api/dsh-loglens/facets': { ok: true, overTime: [{ ts: 10_000, count: 4 }], interval: '10s', warnings: [] },
  }
  const { runtime, tree } = await runPanelQueryFull('es')
  const bars = clickableBars(tree)
  assert.ok(bars.length >= 1, '该画出可点的柱子')
  assert.ok(treeText(tree).includes('每根柱子 10s'), '这一档该是 10s，实得：' + treeText(tree).slice(0, 200))
  assert.equal(treeText(tree).includes('已放大到最短 1 分钟'), false, '还没点就不该说这句')

  calls.length = 0
  await clickAndSettle(runtime, bars[0])
  const text = treeText(runtime.tree)
  assert.ok(text.includes('已放大到最短 1 分钟'),
    '被下限夹过必须**说出来**（静默收窄比报错更难查）：' + text.slice(0, 300))
  const query = calls.find((call) => call.path === '/api/dsh-loglens/query')
  assert.ok(query !== undefined, '该发出这一次查询')
  assert.equal(query.body.to - query.body.from, 60_000, '夹到下限后窗口该是 1 分钟，实得 ' + String(query.body.to - query.body.from))
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

await test('字段候选：**点开就拉**（一个手势，不另设按钮）——不传 limit，候选摆成自画的浮层', async () => {
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
  calls.length = 0
  pickInput(tree).props.onFocus()
  // 先 tick（不让异步链推进）：这一刻浮层里该是「加载中…」，而不是一个空白或干脆没开
  runtime.tick()
  assert.equal(treeFind(runtime.tree, (node) => hasClass(node, 'll_pickList')).length, 1, '点开就该有浮层（不能等请求回来才画）')
  assert.ok(treeText(runtime.tree).includes('加载中'), '在途时该写「加载中…」')
  await runtime.update()
  await runtime.update()
  const after = runtime.tree

  const call = calls.find((item) => item.path === '/api/dsh-loglens/fields')
  assert.ok(call !== undefined, '点开没打 /fields：' + JSON.stringify(calls))
  assert.equal(call.body.target, 'es')
  assert.equal('limit' in call.body, false, 'limit 不传：用宿主自己的默认值，别在浏览器侧抄一份会漂的')
  assert.equal(calls.filter((item) => item.path === '/api/dsh-loglens/fields').length, 1, '一次点开只拉一次')
  assert.equal(buttonByText(after, '有哪些字段'), undefined, '不该再有「有哪些字段」按钮：点开就是那条路')

  // 候选是**自画**的浮层：一行一个按钮，名字逐字在那里
  assert.deepEqual(pickRows(after).map((node) => treeText(node)), ['container.name', 'host.name'])
  // 原生 datalist / option 一个都不许有：那个浮层由浏览器画，字体 / 行高 / 圆角 / 投影 / 滚动条
  // 全改不动，跟宿主自己的下拉放一屏里一眼看出是两个东西（维护者 2026-10-13 看图提的）
  assert.equal(treeFind(after, (node) => node.type === 'datalist').length, 0, '不该再有原生 datalist')
  // 字段名不许以 `<option>` 的形式出现（那时候就还是 datalist 那条路；下拉框自己的 option 不算）
  assert.equal(treeFind(after, (node) => node.type === 'option'
    && (node.props?.value === 'container.name' || node.props?.value === 'host.name')).length, 0,
  '字段名不该再作为 option 出现')
  assert.equal(pickInput(after).props.list, undefined, '输入框不该再挂 list 属性（那会引出浏览器自己那个浮层）')
})

await test('字段候选：一次点击（focus 与 click 两条路）只打一枪 /fields', async () => {
  // 真浏览器里点一下输入框会**先 focus 再 click**，两条路都走到 openPick；而 fieldsSource / fieldsBusy
  // 在这一轮渲染里都还是旧值——真机上就是这么抓到「第一次点开打了 2 次 /fields」的。
  serverRoutes = {
    '/api/dsh-loglens/fields': { ok: true, fields: [{ name: 'container.name' }, { name: 'host.name' }], total: 2, truncated: false, warnings: [] },
  }
  const { runtime, tree } = await runPanelQueryFull('es', { skipQuery: true })
  calls.length = 0
  const box = pickInput(tree)
  box.props.onFocus()
  box.props.onClick()
  await runtime.update()
  await runtime.update()
  const n = calls.filter((item) => item.path === '/api/dsh-loglens/fields').length
  assert.equal(n, 1, '一次点击只该拉一枪，实得 ' + String(n))
  assert.deepEqual(pickRows(runtime.tree).map((node) => treeText(node)), ['container.name', 'host.name'])
})

await test('候选浮层页脚：报**宿主给的**字段总数（不是本地清单的长度），不截断时没有任何截断警告', async () => {
  // 2026-10-14 对齐 Kibana 之后，页脚说「有多长」：不传 limit = 不截断，所以宿主给的 total 就是全部。
  // 这里故意让 total（102）与清单（2 条）不相等——页脚必须照宿主的权威数字说，**不许自己数本地行数**：
  // 否则哪天又截起来，界面会把「你看到的这 2 个」说成「一共就这些」。
  serverRoutes = {
    '/api/dsh-loglens/fields': {
      ok: true,
      fields: [{ name: 'container.name' }, { name: 'host.name' }],
      total: 102,
      truncated: false,
      warnings: [],
    },
  }
  const { runtime, tree } = await runPanelQueryFull('es', { skipQuery: true })
  pickInput(tree).props.onFocus()
  await runtime.update()
  await runtime.update()
  const foot = treeText(runtime.tree)
  assert.ok(foot.includes('共 102 个字段'), '页脚该报宿主的 total（102），实得：' + foot.slice(0, 300))
  assert.ok(foot.includes('刷新'), '页脚该有「刷新」（缓存的出口）')
  assert.equal(foot.includes('只列了前'), false, '没被截断就不许出现截断警告（警告是信号，不是常驻噪声）')
  assert.deepEqual(pickRows(runtime.tree).map((node) => treeText(node)), ['container.name', 'host.name'])
  /*
   * 不截断之后候选可能有上百行，所以浮层拆成两层：候选自己滚（`.ll_pickScroll`），页脚在它**外面**。
   * 页脚要是落进滚动层里，就得先滚到底才看得见「共 N 个字段」——那等于没报（Kibana 把计数放在分区头上，
   * 也是同一个判据：长度信息不该被长度本身埋掉）。这条守卫谁把页脚挪回滚动层就红。
   */
  const scroll = treeFind(runtime.tree, (node) => hasClass(node, 'll_pickScroll'))[0]
  assert.ok(scroll !== undefined, '候选该有一层自己滚的容器（.ll_pickScroll）')
  assert.equal(treeFind(runtime.tree, (node) => hasClass(node, 'll_pickFoot')).length, 1, '页脚该在浮层里（恰好一处）')
  assert.equal(treeFind(scroll, (node) => hasClass(node, 'll_pickFoot')).length, 0, '页脚不许在滚动层里：那样会被埋在几百行底下，滚到底才看得见')
  assert.equal(treeFind(scroll, (node) => hasClass(node, 'll_pickRefresh')).length, 0, '「刷新」同理，也不许在滚动层里')
  assert.equal(treeFind(scroll, (node) => hasClass(node, 'll_pickItem')).length, 2, '候选本身才在滚动层里')
})

await test('候选浮层页脚：宿主真报截断时，照抄那句警告（警告优先于条数，不许两句话说反）', async () => {
  serverRoutes = {
    '/api/dsh-loglens/fields': {
      ok: true,
      fields: [{ name: 'container.name' }, { name: 'host.name' }],
      total: 102,
      truncated: true,
      warnings: ['只列了前 2 个（这个来源共有 102 个字段）：去掉 limit 就是全部'],
    },
  }
  const { runtime, tree } = await runPanelQueryFull('es', { skipQuery: true })
  pickInput(tree).props.onFocus()
  await runtime.update()
  await runtime.update()
  const foot = treeText(runtime.tree)
  assert.ok(foot.includes('只列了前 2 个'), '宿主那句警告要照抄，实得：' + foot.slice(0, 300))
  assert.equal(foot.includes('共 102 个字段'), false, '警告已经说了总数，别再说一遍条数（两句话会被读成互相打架）')
})

await test('候选浮层：类型冲突的字段**在行上**标出来（同名在不同索引里类型不一致），普通候选不标', async () => {
  // 真机实例：`container.labels.org_label-schema_build-date` 在部分索引是 date、部分是 text。
  // 拿它分组只会覆盖一部分索引，而它在候选里的名字跟别人长得一模一样——不标就等于没说。
  serverRoutes = {
    '/api/dsh-loglens/fields': {
      ok: true,
      fields: [
        { name: 'host.name' },
        { name: 'container.labels.org_label-schema_build-date', conflict: true, esTypes: ['date', 'text'] },
      ],
      total: 2,
      truncated: false,
      warnings: [],
    },
  }
  const { runtime, tree } = await runPanelQueryFull('es', { skipQuery: true })
  pickInput(tree).props.onFocus()
  await runtime.update()
  await runtime.update()

  const rows = pickRows(runtime.tree)
  assert.equal(rows.length, 2)
  const tags = treeFind(rows[1], (node) => hasClass(node, 'll_pickConflict'))
  assert.equal(tags.length, 1, '冲突字段该有一个标记，实得 ' + String(tags.length) + ' 个')
  assert.equal(treeText(tags[0]), '类型冲突')
  assert.equal(treeFind(rows[0], (node) => hasClass(node, 'll_pickConflict')).length, 0, '普通字段不许标')
  // 行上只放得下一小截标记，两种类型写在 title 里
  assert.ok(String(rows[1].props.title).includes('类型冲突'), 'title 该说清是冲突：' + String(rows[1].props.title))
  assert.ok(String(rows[1].props.title).includes('date / text'), 'title 该把两种类型都摆出来：' + String(rows[1].props.title))
  assert.equal(rows[0].props.title, 'host.name', '普通行 title 还是名字本身')
})

await test('字段候选：同一个来源再点开**不重拉**（缓存），页脚「刷新」才重拉；换了来源要重拉', async () => {
  const fieldsOf = (names) => ({ ok: true, fields: names.map((name) => ({ name })), total: names.length, truncated: false, warnings: [] })
  serverRoutes = { '/api/dsh-loglens/fields': fieldsOf(['container.name', 'host.name']) }
  const { runtime, tree } = await runPanelQueryFull('es', { skipQuery: true })
  const fieldCalls = () => calls.filter((item) => item.path === '/api/dsh-loglens/fields').length

  calls.length = 0
  pickInput(tree).props.onFocus()
  await runtime.update()
  await runtime.update()
  assert.equal(fieldCalls(), 1, '第一次点开要拉')

  // 关掉再点开：同一个来源 → 不再打后端
  pickInput(runtime.tree).props.onKeyDown({ key: 'Escape' })
  await runtime.update()
  assert.equal(pickRows(runtime.tree).length, 0, 'Esc 收起')
  pickInput(runtime.tree).props.onFocus()
  await runtime.update()
  await runtime.update()
  assert.equal(fieldCalls(), 1, '同一个来源再点开不该重拉（每次点输入框都打一枪后端是白花别人的机器）')
  assert.equal(pickRows(runtime.tree).length, 2, '缓存里的候选照常摆出来')

  // 页脚「刷新」：手动重拉的出口（字段会随新数据长出来）
  const refresh = buttonByText(runtime.tree, '刷新')
  assert.ok(refresh !== undefined, '浮层页脚该有一个「刷新」')
  refresh.props.onClick()
  await runtime.update()
  await runtime.update()
  assert.equal(fieldCalls(), 2, '「刷新」要真的重拉一次')

  // 换来源 → 缓存失效，重新拉（这里把来源换成另一个真来源）
  const select = treeFind(runtime.tree, (node) => node.type === 'select'
    && Array.isArray(node.props?.children)
    && node.props.children.some((child) => child?.props?.value === 'local'))[0]
  select.props.onChange({ target: { value: 'local' } })
  await runtime.update()
  serverRoutes['/api/dsh-loglens/fields'] = fieldsOf(['job', 'instance'])
  pickInput(runtime.tree).props.onFocus()
  await runtime.update()
  await runtime.update()
  assert.equal(fieldCalls(), 3, '换了来源要重新拉（那份缓存说的是上一个来源）')
  assert.deepEqual(pickRows(runtime.tree).map((node) => treeText(node)), ['job', 'instance'])
})

await test('字段候选：拉不到就把宿主那句话**落在浮层里**，不动卡片顶部那条错误行、也不动结果列表', async () => {
  serverRoutes = {
    '/api/dsh-loglens/query': queryOutcome({ id: 'es', kind: 'elasticsearch', label: '内网 ES' }, true),
    '/api/dsh-loglens/fields': { ok: false, status: 400, body: { error: 'boom-fields' } },
  }
  const { runtime, tree } = await runPanelQueryFull('es')
  calls.length = 0
  pickInput(tree).props.onFocus()
  await runtime.update()
  await runtime.update()

  const text = treeText(runtime.tree)
  assert.ok(text.includes('字段清单取不到：boom-fields'), '该把宿主那句话显示出来，实得：' + text.slice(0, 300))
  assert.ok(text.includes('boot'), '字段拉不到不该把已经查到的结果列表也带走')
  assert.equal(treeFind(runtime.tree, (node) => hasClass(node, 'll_pickItem')).length, 0, '失败时不该画出半张候选')
  // 失败**不写缓存**：再点开要重试（这里只断言又打了一枪）
  calls.length = 0
  pickInput(runtime.tree).props.onKeyDown({ key: 'Escape' })
  await runtime.update()
  pickInput(runtime.tree).props.onFocus()
  await runtime.update()
  assert.equal(calls.filter((item) => item.path === '/api/dsh-loglens/fields').length, 1, '失败不留缓存，再点开要重试')
})

await test('字段候选：这个来源一个字段名都不给时，浮层里写一句人话（不是一个空盒子）', async () => {
  serverRoutes = {
    '/api/dsh-loglens/fields': { ok: true, fields: [], total: 0, truncated: false, warnings: [] },
  }
  const { runtime, tree } = await runPanelQueryFull('es', { skipQuery: true })
  pickInput(tree).props.onFocus()
  await runtime.update()
  await runtime.update()

  assert.equal(treeFind(runtime.tree, (node) => hasClass(node, 'll_pickList')).length, 1, '空清单也要开浮层说清楚')
  assert.ok(treeText(runtime.tree).includes('没有返回字段名'), '该说清「这个来源没有字段名」，而不是一个空盒子')
  assert.equal(treeFind(runtime.tree, (node) => hasClass(node, 'll_pickItem')).length, 0)
})

await test('候选浮层：输入框里的字**筛**候选，命中 0 个不画浮层；回车取第一条命中', async () => {
  serverRoutes = {
    '/api/dsh-loglens/fields': {
      ok: true,
      fields: [{ name: 'container.name' }, { name: 'host.name' }, { name: 'log.file.path' }],
      total: 3,
      truncated: false,
      warnings: [],
    },
  }
  const { runtime, tree } = await runPanelQueryFull('es', { skipQuery: true })
  pickInput(tree).props.onFocus()
  await runtime.update()
  await runtime.update()

  // 候选摆出来之后，往输入框里打字就是过滤（原生 <input list> 的行为）
  pickInput(runtime.tree).props.onChange({ target: { value: 'name' } })
  await runtime.update()
  assert.deepEqual(pickRows(runtime.tree).map((node) => treeText(node)), ['container.name', 'host.name'])

  // 一个字都不命中 → 浮层**不画**（空盒子比不画更像坏了）
  pickInput(runtime.tree).props.onChange({ target: { value: 'nope' } })
  await runtime.update()
  assert.equal(treeFind(runtime.tree, (node) => hasClass(node, 'll_pickList')).length, 0, '命中 0 个不该画一个空浮层')

  // 方向键 + 回车：这是原生那套浮层**自带**的能力，换成自画的就得自己接回来
  // （不然是悄悄降级：鼠标能用、键盘只能一路 Tab）。先让候选有两条命中。
  pickInput(runtime.tree).props.onChange({ target: { value: 'name' } })
  await runtime.update()
  assert.deepEqual(pickRows(runtime.tree).map((node) => treeText(node)), ['container.name', 'host.name'])
  // 每行自己报一下是不是「当前那一行」
  const activeRows = () => treeFind(runtime.tree, (node) => node.type === 'button' && hasClass(node, 'll_pickItemActive'))
  assert.deepEqual(activeRows().map((node) => treeText(node)), ['container.name'], '一打开第一行就是当前行')
  pickInput(runtime.tree).props.onKeyDown({ key: 'ArrowDown', preventDefault: () => {} })
  await runtime.update()
  assert.deepEqual(activeRows().map((node) => treeText(node)), ['host.name'], '方向键往下挪一行')
  assert.deepEqual(pickRows(runtime.tree).map((node) => treeText(node)), ['container.name', 'host.name'], '挪的是「当前行」，候选本身不动')
  pickInput(runtime.tree).props.onKeyDown({ key: 'ArrowDown', preventDefault: () => {} })
  await runtime.update()
  assert.deepEqual(activeRows().map((node) => treeText(node)), ['host.name'], '到头就停（不绕回第一条）')
  pickInput(runtime.tree).props.onKeyDown({ key: 'Enter' })
  await runtime.update()
  assert.equal(pickInput(runtime.tree).props.value, 'host.name', '回车取的是**当前那一行**，不是死板的第一条')

  // 再聚焦（此时输入框是 host，只剩一条命中）；Esc 收起
  pickInput(runtime.tree).props.onFocus()
  await runtime.update()
  assert.deepEqual(pickRows(runtime.tree).map((node) => treeText(node)), ['host.name'])
  pickInput(runtime.tree).props.onKeyDown({ key: 'Escape' })
  await runtime.update()
  assert.equal(pickRows(runtime.tree).length, 0, 'Esc 该收起浮层')
})

await test('候选浮层：点一行把字段填进去并收起；焦点离开这一格也收起（还在格子里则不收）', async () => {
  serverRoutes = {
    '/api/dsh-loglens/fields': {
      ok: true,
      fields: [{ name: 'container.name' }, { name: 'host.name' }],
      total: 2,
      truncated: false,
      warnings: [],
    },
  }
  const { runtime, tree } = await runPanelQueryFull('es', { skipQuery: true })
  pickInput(tree).props.onFocus()
  await runtime.update()
  await runtime.update()

  const rows = pickRows(runtime.tree)
  assert.equal(rows.length, 2)
  rows[1].props.onClick()
  await runtime.update()
  assert.equal(pickInput(runtime.tree).props.value, 'host.name', '点一行就把那个字段名填进去')
  assert.equal(pickRows(runtime.tree).length, 0, '选完该收起')

  // 焦点离开这一格 → 收起（relatedTarget 落在格子外面）
  pickInput(runtime.tree).props.onFocus()
  await runtime.update()
  assert.equal(pickRows(runtime.tree).length, 1)
  treeFind(runtime.tree, (node) => hasClass(node, 'll_pick'))[0].props.onBlur({ currentTarget: { contains: () => false }, relatedTarget: null })
  await runtime.update()
  assert.equal(pickRows(runtime.tree).length, 0, '焦点走了就该收起')

  // 焦点还在格子里面（点了浮层里的行会先 blur 一下）→ 不许收
  pickInput(runtime.tree).props.onFocus()
  await runtime.update()
  assert.equal(pickRows(runtime.tree).length, 1)
  const wrapper = treeFind(runtime.tree, (node) => hasClass(node, 'll_pick'))[0]
  wrapper.props.onBlur({ currentTarget: { contains: () => true }, relatedTarget: {} })
  await runtime.update()
  assert.equal(pickRows(runtime.tree).length, 1, '焦点还在这一格里面时不许收')
})

await test('箭头用**官方那颗** chevron：卡头折叠箭头与字段框箭头同一颗（viewBox 16 / stroke-width 1 / 描边不填色）', async () => {
  // 官方名 IconChevronDownOutlineRegular：viewBox 0 0 16 16、14×14、stroke-width 1、fill=none + stroke=currentColor。
  // 原来是一颗**填色** chevron（另一套图标的形状），与宿主自己的箭头不是同一颗（维护者 2026-10-13 提的）。
  const OFFICIAL = 'M4 6L7.29289 9.29289C7.68342 9.68342 8.31658 9.68342 8.70711 9.29289L12 6'
  serverRoutes = {
    '/api/dsh-loglens/fields': { ok: true, fields: [{ name: 'container.name' }], total: 1, truncated: false, warnings: [] },
  }
  const { runtime, tree } = await runPanelQueryFull('es', { skipQuery: true })
  pickInput(tree).props.onFocus()
  await runtime.update()
  await runtime.update()

  const chevrons = treeFind(runtime.tree, (node) => node.type === 'svg'
    && (hasClass(node, 'll_chevron') || hasClass(node, 'll_pickChevron')))
  assert.equal(chevrons.length, 2, '卡头折叠箭头 + 字段框箭头，一共两颗，实得 ' + String(chevrons.length))
  for (const svg of chevrons) {
    assert.equal(svg.props.viewBox, '0 0 16 16', '官方那颗的 viewBox 是 0 0 16 16')
    assert.equal(svg.props.fill, 'none', '描边图标：svg 上的 fill 是 none')
    assert.equal(svg.props.strokeWidth, '1', 'Regular 档的 stroke-width 是 1')
    assert.equal(svg.props.width, '14')
    assert.equal(svg.props.height, '14')
    const path = svg.props.children
    assert.equal(path.props.d, OFFICIAL, '路径必须是官方那一条（换一颗就是又走样了）')
    assert.equal(path.props.stroke, 'currentColor')
    assert.equal(path.props.fill, undefined, '不许再填色：官方这颗是描边图标')
  }
})

/* ------------------------------------------------------------------ *
 * 点桶下钻（结构化筛选）：点榜上一条 → 带 filters 重查一次
 * ------------------------------------------------------------------ */

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
 * Docker 区（容器清单自动拉，2026-10-14）
 * ------------------------------------------------------------------ */

/** Docker 区的容器下拉：按 title 找（`field.container` = 「容器」）。 */
function containerSelect(tree) {
  return treeFind(tree, (node) => node.type === 'select' && node.props?.title === '容器')[0]
}

/** 来源行里那条「Docker 目标名」下拉。 */
function dockerTargetSelect(tree) {
  return treeFind(tree, (node) => node.type === 'select' && node.props?.title === 'Docker 目标名')[0]
}

const containerCalls = () => calls.filter((call) => call.path === '/api/dsh-docker/containers')
const optionsOf = (select) => select.props.children.filter((node) => node !== null && node !== undefined)

await test('Docker 区：选中 Docker 来源就**自动拉容器**（不需要点按钮），第一条自动选中', async () => {
  serverRoutes = {
    '/api/dsh-docker/containers': { ok: true, containers: [{ id: 'upms', name: 'upms-service' }, { id: 'gateway', name: 'gateway' }] },
  }
  const { runtime, tree } = await runPanelQueryFull('target', { skipQuery: true })
  await runtime.update()
  await runtime.update()

  assert.equal(containerCalls().length, 1, '选中 Docker 来源该自动拉一次，实得 ' + String(containerCalls().length))
  assert.equal(containerCalls()[0].body.target, '目标2', '请求要带这一行的 Docker 目标名')
  assert.equal(buttonByText(runtime.tree, '拉取容器'), undefined, '不该再有「拉取容器」按钮：选中就拉')

  const select = containerSelect(runtime.tree)
  assert.ok(select !== undefined, '找不到容器下拉')
  assert.equal(select.props.value, 'upms', '第一条该被自动选中（不然「看日志」只会回一句「先选容器」）')
  // 占位项（第一项）在**有清单**时就是那句「容器」、而且可选：它只在没选中时露出来（见 containerSlotState）
  const slot = optionsOf(select)[0]
  assert.equal(treeText(slot), '容器', '清单已经到手了，占位项该回到默认那句')
  assert.equal(slot.props.disabled, false, '默认态的占位项保持原来那样（能选空）')
  assert.deepEqual(optionsOf(select).slice(1).map((node) => treeText(node)), ['upms-service', 'gateway'])
})

await test('Docker 区：同一目标不重拉；换目标重拉（选中项跟着新清单走），在途时多一条「加载中…」且不谎报选中', async () => {
  // 每条目标回**不同的**容器：换目标之后原来那个 id 不在新清单里，必须换成新的第一条
  // （留着旧 id 就是 D04 那一类不一致：原生下拉回落显示第一项，面板状态里还是旧值）
  serverRoutes = {
    '/api/dsh-docker/containers': (body) => ({
      ok: true,
      containers: body.target === 'local' ? [{ id: 'nginx', name: 'nginx' }] : [{ id: 'upms', name: 'upms-service' }],
    }),
  }
  const { runtime } = await runPanelQueryFull('target', { skipQuery: true })
  await runtime.update()
  await runtime.update()
  assert.equal(containerCalls().length, 1)
  assert.equal(containerSelect(runtime.tree).props.value, 'upms')
  // 同一个键：再来几轮渲染也不该重拉（缓存判据就是 containersKey）
  await runtime.update()
  await runtime.update()
  assert.equal(containerCalls().length, 1, '同一个目标不该重拉')

  const targetSelect = dockerTargetSelect(runtime.tree)
  assert.ok(targetSelect !== undefined, '找不到 Docker 目标下拉')
  targetSelect.props.onChange({ target: { value: 'local' } })
  runtime.tick()
  /*
   * 这一刻清单还没回来，但**旧清单还在**（上一条目标拉回来的 upms）。所以占位项仍该是「容器」：
   * 显示哪一项由 `value` 决定，而下拉的 value 此刻就是 upms——把占位项改成「加载中…」等于
   * 替用户扔掉看得见的东西（那几秒里他不是没有选项，是有**上一条目标**的选项）。
   * 「正在拉」这句话落在「刷新」按钮上（与旁边「看日志」同一个写法）。
   */
  assert.equal(treeText(optionsOf(containerSelect(runtime.tree))[0]), '容器', '有旧清单时占位项不该改口')
  assert.equal(buttonByText(runtime.tree, '刷新'), undefined, '在途时「刷新」自己写着「加载中…」')
  assert.ok(buttonByText(runtime.tree, '加载中…') !== undefined, '在途时该看得见「正在拉」这句（落在「刷新」上）')

  await runtime.update()
  await runtime.update()
  assert.equal(containerCalls().length, 2, '换了目标要重拉一次')
  assert.equal(containerCalls()[1].body.target, 'local', '重拉要带新目标')
  assert.equal(containerSelect(runtime.tree).props.value, 'nginx', '原来的 upms 不在新清单里：选中项要换成新清单的第一条，不许留一个下拉里没有的 id')
  assert.ok(buttonByText(runtime.tree, '刷新') !== undefined, '拉完了按钮要长回「刷新」')
})

await test('Docker 区：清单还没到的那几秒，占位项说的是「加载中…」（不是看起来没事的空下拉）', async () => {
  serverRoutes = { '/api/dsh-docker/containers': { ok: true, containers: [{ id: 'upms', name: 'upms-service' }] } }
  /*
   * 这一条**不用 runPanelQueryFull**：那个助手会把每件事都 settle 到稳定，正好吃掉我们要看的那一帧
   * （选中 Docker 来源、请求还在路上的那一刻）。所以手动挂载，自己控制 tick 与让位的时机。
   */
  const runtime = createRuntime()
  const exports_ = registration.factory((spec) => (spec === 'react' ? runtime.React : { jsx: runtime.jsx, jsxs: runtime.jsxs }))
  const { ctx, state } = makeClientCtx()
  exports_.apply(ctx)
  calls.length = 0
  const Card = state.cards.find((card) => card.options.name === 'settings.kit.item').component
  const tree = await runtime.mount(Card, {})
  treeFind(tree, (node) => String(node.props?.className ?? '').includes('ll_cardHeader'))[0].props.onClick()
  runtime.tick()
  await runtime.update()
  sourceSelect(runtime.tree, 'target').props.onChange({ target: { value: 'target' } })
  runtime.tick()

  const slot = optionsOf(containerSelect(runtime.tree))[0]
  assert.equal(treeText(slot), '加载中…', '清单没到的时候这一格就该说「在拉」，实得：' + treeText(slot))
  assert.equal(slot.props.value, '', '过渡态仍然挂在那个空 value 的占位项上')
  assert.equal(slot.props.disabled, true, '过渡态不是可选项：那一刻没有一个真容器值得选')
  assertNarrowLabel(treeText(slot), '容器下拉的过渡态')

  await runtime.update()
  await runtime.update()
  assert.equal(treeText(optionsOf(containerSelect(runtime.tree))[0]), '容器', '清单到手后该回到默认那句')
})

await test('Docker 区：拉回来是空清单 → 占位项说「没有容器」，hint 说清「只列运行中的」', async () => {
  serverRoutes = { '/api/dsh-docker/containers': { ok: true, containers: [] } }
  const { runtime } = await runPanelQueryFull('target', { skipQuery: true })
  await runtime.update()
  await runtime.update()

  const slot = optionsOf(containerSelect(runtime.tree))[0]
  assert.equal(treeText(slot), '没有容器', '拉空了要说清是空的（不然就是一个看不出所以然的空下拉）')
  assert.equal(slot.props.disabled, true, '没有可选项时占位项也不该能被选中')
  assertNarrowLabel(treeText(slot), '容器下拉的空清单态')
  const text = treeText(runtime.tree)
  assert.ok(text.includes('没有运行中的容器'), '「没有容器」得有一句解释：这里只列运行中的，实得：' + text.slice(0, 300))
  assert.equal(treeFind(runtime.tree, (node) => hasClass(node, 'll_error')).length, 0, '空清单不是错误：不动卡片顶部那条错误行')
})

await test('Docker 区：拉容器失败只落在那一格（不动卡片顶部错误行），失败不写缓存→下次触发仍会重试', async () => {
  serverRoutes = { '/api/dsh-docker/containers': { ok: false, status: 400, body: { error: 'boom-containers' } } }
  const { runtime } = await runPanelQueryFull('target', { skipQuery: true })
  await runtime.update()
  await runtime.update()

  assert.equal(containerCalls().length, 1)
  const text = treeText(runtime.tree)
  assert.ok(text.includes('容器清单取不到：boom-containers'), '该把宿主那句话显示在这一格，实得：' + text.slice(0, 300))
  assert.equal(treeFind(runtime.tree, (node) => hasClass(node, 'll_error')).length, 0, '自动拉失败不该把整张卡片染成「出错了」')

  /*
   * 下拉那一格此刻也**不能装作没事**：失败时清单是空的，占位项若还写着「容器」，画出来就是一个
   * 空下拉——用户看不出「它试过了、没成」。而失败**不写缓存**（见下面那段），于是 `pending` 一直为真；
   * 若判据把「在途」排在「失败」前面，这一格会永远写着「加载中…」——那才是更坏的谎。
   */
  const slot = optionsOf(containerSelect(runtime.tree))[0]
  assert.equal(treeText(slot), '加载失败', '失败时占位项该说「加载失败」，实得：' + treeText(slot))
  assert.equal(slot.props.disabled, true, '失败态不是可选项')
  assertNarrowLabel(treeText(slot), '容器下拉的失败态')
  assert.ok(buttonByText(runtime.tree, '刷新') !== undefined, '失败之后「刷新」要长回来：那是重试的出口')

  /*
   * 失败**不许写缓存**：走开再回来必须重新试（判据是 `containersSource` 在失败分支里不动）。
   * 为什么这么测：在「换 Docker 目标」上验等于没验——换目标本来就换了键，缓存写没写都会重拉。
   * 只有**回到同一个键**（换来源走开、再选回这条 Docker 来源）才能把「记住了失败」和「没记住」分开。
   */
  dockerTargetSelect(runtime.tree) // 存在性：目标下拉在这条来源上
  sourceSelect(runtime.tree, 'es').props.onChange({ target: { value: 'es' } })
  await runtime.update()
  await runtime.update()
  sourceSelect(runtime.tree, 'target').props.onChange({ target: { value: 'target' } })
  await runtime.update()
  await runtime.update()
  assert.equal(containerCalls().length, 2, '回到同一个目标仍要重试一次：失败不留缓存')
})

await test('Docker 区：「刷新」强制重拉一次（容器会变，自动拉之外要留手动出口）', async () => {
  serverRoutes = { '/api/dsh-docker/containers': { ok: true, containers: [{ id: 'upms', name: 'upms-service' }] } }
  const { runtime } = await runPanelQueryFull('target', { skipQuery: true })
  await runtime.update()
  await runtime.update()
  assert.equal(containerCalls().length, 1)

  const refresh = buttonByText(runtime.tree, '刷新')
  assert.ok(refresh !== undefined, 'Docker 区该有一个「刷新」')
  refresh.props.onClick()
  await runtime.update()
  await runtime.update()
  assert.equal(containerCalls().length, 2, '「刷新」要真的重拉一次')
})

/* ------------------------------------------------------------------ *
 * 结果
 * ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ *
 * 行上的标签：看得见「谁写的」+ 点值即筛（P6 第六刀）
 * ------------------------------------------------------------------ */

/** 带标签的一行（真机上就是 filebeat 那份嵌套文档摊平后的样子）。 */
const TAG_LINE = {
  ts: 1_700_000_000_000,
  level: 'error',
  levelInferred: true,
  message: 'boom',
  source: '0',
  labels: {
    'container.name': 'app-svc-1',
    'host.name': 'node-7',
    'log.file.path': '/var/log/app.log',
    'stream': 'stderr',
    'kubernetes.pod.name': 'app-1-abc',
  },
  raw: '{"message":"boom","container":{"name":"app-svc-1"}}',
  id: '0:0',
}

/** 结果行里可点的那个身份标签（类名不带 btn，所以用 ll_resultTagHit 找）。 */
function tagChips(tree) {
  return treeFind(tree, (node) => node.type === 'button' && hasClass(node, 'll_resultTagHit'))
}

/** 行尾的「＋N」（点开全部标签的浮层）。 */
function moreButton(tree) {
  return treeFind(tree, (node) => node.type === 'button' && hasClass(node, 'll_resultTagMore'))[0]
}

/** 全部标签浮层 / 它里面的标签行 / 点它收起的透明底。 */
function labelPanel(tree) {
  return treeFind(tree, (node) => hasClass(node, 'll_labelPanel'))[0]
}
function labelPanelRows(tree) {
  return treeFind(tree, (node) => node.type === 'button' && hasClass(node, 'll_labelRow'))
}
function labelBackdrop(tree) {
  return treeFind(tree, (node) => hasClass(node, 'll_labelBackdrop'))[0]
}

/** 点「＋N」时要用的视口矩形（桩里没有真 DOM，给一份固定坐标）。 */
const MORE_RECT = { top: 80, bottom: 100, left: 380, right: 500, width: 120, height: 20 }

await test('行上的标签：只摆**1 个身份标签**（宿主顺序第一个）+「＋N」，其余收进悬停', async () => {
  serverRoutes = {
    '/api/dsh-loglens/query': { ...queryOutcome({ id: 'es', kind: 'elasticsearch', label: '内网 ES' }, true), lines: [TAG_LINE] },
    '/api/dsh-loglens/facets': facetsRoute([], HIST_OK),
  }
  const { tree } = await runPanelQueryFull('es')
  const chips = tagChips(tree)
  assert.equal(chips.length, 1, '行上只摆 1 个（顺序里的第一个），实得 ' + String(chips.length))
  // 顺序就是宿主给的顺序（container → host → …），不重挑
  assert.equal(treeText(chips[0]), 'container.nameapp-svc-1')
  assert.ok(String(chips[0].props.title).includes('按 container.name = app-svc-1 加一条筛选'),
    '可点的标签必须说清点它会做什么：' + String(chips[0].props.title))
  // 其余 4 个（host / file / stream / pod）收进「＋4」
  const more = moreButton(tree)
  assert.ok(more !== undefined, '还有标签没摆出来时该给「＋N」')
  assert.equal(treeText(more), '＋4', '实得：' + treeText(more))
  // 悬停里仍然有**全部**标签与原文
  const row = treeFind(tree, (node) => hasClass(node, 'll_resultRow'))[0]
  assert.ok(String(row.props.title).includes('kubernetes.pod.name = app-1-abc'), '悬停该有全部标签')
  assert.ok(String(row.props.title).includes('{"message":"boom"'), '悬停该有原文（raw）')
  assert.ok(String(row.props.title).includes('error（从正文推断）'), '推断出来的级别必须标出来（两种可信度）')
  // 敏感字段那句话在场（raw 原样来自后端）
  assert.ok(treeText(tree).includes('可能有敏感字段'), '行详情里可能有敏感字段，这句话该在')
})

await test('「＋N」：点开**全部标签**浮层（不嵌在滚动列表里，否则会被裁），点一条即筛、点背景收起', async () => {
  serverRoutes = {
    '/api/dsh-loglens/query': { ...queryOutcome({ id: 'es', kind: 'elasticsearch', label: '内网 ES' }, true), lines: [TAG_LINE] },
    '/api/dsh-loglens/facets': facetsRoute([], HIST_OK),
  }
  const { runtime, tree } = await runPanelQueryFull('es')
  assert.equal(labelPanel(tree), undefined, '默认不画浮层')
  // 结构判据：浮层**不能在** .ll_results 里面——那个容器 max-height:420px + overflow-y:auto，会把它裁掉
  const results = treeFind(tree, (node) => hasClass(node, 'll_results'))[0]
  assert.equal(treeFind(results, (node) => hasClass(node, 'll_labelLayer')).length, 0,
    '浮层画在结果列表外面（fixed 一层），否则列表一滚/一裁就看不见了')

  // 点「＋4」→ 浮层出现，列出**全部**标签（顺序同宿主，前 1 个与行上那颗重复也照样列出）
  moreButton(runtime.tree).props.onClick({ currentTarget: { getBoundingClientRect: () => MORE_RECT } })
  runtime.tick()
  await runtime.update()
  const panel = labelPanel(runtime.tree)
  assert.ok(panel !== undefined, '点「＋N」该出浮层')
  assert.ok(treeText(panel).includes('全部标签'), '浮层该有标题：' + treeText(panel))
  assert.deepEqual(labelPanelRows(runtime.tree).map((node) => treeText(node)), [
    'container.nameapp-svc-1', 'host.namenode-7', 'log.file.path/var/log/app.log', 'streamstderr', 'kubernetes.pod.nameapp-1-abc',
  ])
  // 位置来自被点的那颗按钮（不是随便丢在屏幕中间）
  assert.equal(String(panel.props.style.left), '180px', 'left 该按按钮右缘 - 320 算（500 - 320）')
  assert.equal(String(panel.props.style.top), '104px', 'top 该在按钮下方 4px（100 + 4）')

  // 点浮层里的 host.name → 收起 + 按它筛（与行上那颗走同一条 drillDown）
  calls.length = 0
  const hostRow = labelPanelRows(runtime.tree).find((node) => treeText(node).startsWith('host.name'))
  await clickAndSettle(runtime, hostRow)
  assert.equal(labelPanel(runtime.tree), undefined, '选完该收起')
  const query = calls.find((call) => call.path === '/api/dsh-loglens/query')
  assert.ok(query !== undefined, '点浮层里的标签必须真的重查一次')
  assert.deepEqual(query.body.filters, { 'host.name': 'node-7' }, '筛选该是「字段 = 值」：' + JSON.stringify(query.body.filters))
  assert.ok(treeText(runtime.tree).includes('host.name = node-7'), '芯片行该出现这条筛选')

  // 再开一次 → 点背景收起（点「＋N」自己也能收起：再点一次 = 关）
  moreButton(runtime.tree).props.onClick({ currentTarget: { getBoundingClientRect: () => MORE_RECT } })
  runtime.tick()
  await runtime.update()
  assert.ok(labelPanel(runtime.tree) !== undefined, '再点「＋N」该能打开')
  labelBackdrop(runtime.tree).props.onClick()
  runtime.tick()
  await runtime.update()
  assert.equal(labelPanel(runtime.tree), undefined, '点背景该收起')
})

await test('行上的标签：点身份标签 = 按「字段 = 值」加一条筛选并**立刻重查**（与点榜下钻同一个 drillDown）', async () => {
  serverRoutes = {
    '/api/dsh-loglens/query': { ...queryOutcome({ id: 'es', kind: 'elasticsearch', label: '内网 ES' }, true), lines: [TAG_LINE] },
    '/api/dsh-loglens/facets': facetsRoute([], HIST_OK),
  }
  const { runtime, tree } = await runPanelQueryFull('es')
  const chip = tagChips(tree)[0]
  assert.equal(treeText(chip), 'container.nameapp-svc-1', '行上第一颗是 container.name')

  calls.length = 0
  await clickAndSettle(runtime, chip)
  const query = calls.find((call) => call.path === '/api/dsh-loglens/query')
  assert.ok(query !== undefined, '点标签必须真的重查一次（不拿这一页在本地过一遍——那一页被 limit 截断过）')
  assert.deepEqual(query.body.filters, { 'container.name': 'app-svc-1' }, '筛选该是「字段 = 值」：' + JSON.stringify(query.body.filters))
  // 聚合跟着同一份筛选（同一屏三个数字说的必须是同一件事）
  const facets = calls.filter((call) => call.path === '/api/dsh-loglens/facets')
  assert.ok(facets.length >= 1, '聚合该重拉')
  for (const call of facets) assert.deepEqual(call.body.filters, { 'container.name': 'app-svc-1' }, '聚合必须带同一份筛选')
  // 芯片行出现，且它和榜上那条高亮说的是同一件事（可断言：筛选进了 activeFilters）
  assert.ok(treeText(runtime.tree).includes('container.name = app-svc-1'), '芯片行该出现这条筛选')
})

await test('行上的标签：空值那类**不摆**（筛选表达不了「字段缺失」），也不占「＋N」', async () => {
  serverRoutes = {
    '/api/dsh-loglens/query': {
      ...queryOutcome({ id: 'es', kind: 'elasticsearch', label: '内网 ES' }, true),
      lines: [{ ...TAG_LINE, labels: { 'container.name': '', 'host.name': 'node-7' } }],
    },
    '/api/dsh-loglens/facets': facetsRoute([], HIST_OK),
  }
  const { tree } = await runPanelQueryFull('es')
  // 空值那一个**不摆**（没有值的标签占位会把有值的挤掉）——所以这一行只有 1 格，且它是可点的
  const chips = tagChips(tree)
  assert.equal(chips.length, 1, '空值不占位：实得 ' + String(chips.length))
  assert.equal(treeText(chips[0]), 'host.namenode-7')
  assert.equal(moreButton(tree), undefined, '只剩 1 个有值标签时不该有「＋N」')
})

/* ------------------------------------------------------------------ *
 * 级别筛选（宿主既有入参；页内筛必须说出来）
 * ------------------------------------------------------------------ */

/** 级别下拉（它的选项里有一个空 value 的「不限级别」）。 */
function levelSelect(tree) {
  return treeFind(tree, (node) => node.type === 'select'
    && Array.isArray(node.props?.children)
    && node.props.children.some((child) => child !== null && typeof child === 'object' && child.props?.value === ''
      && treeText(child).includes('不限级别')))[0]
}

await test('级别筛选：下拉六档 + 不限；选中后请求体带 level，且**明说这是页内筛**', async () => {
  serverRoutes = {
    '/api/dsh-loglens/query': { ...queryOutcome({ id: 'es', kind: 'elasticsearch', label: '内网 ES' }, true), level: 'error' },
    '/api/dsh-loglens/facets': facetsRoute([], HIST_OK),
  }
  const { runtime, tree } = await runPanelQueryFull('es')
  const select = levelSelect(tree)
  assert.ok(select !== undefined, '找不到级别下拉')
  assert.equal(select.props.value, '', '默认是「不限」')
  assert.equal(treeText(tree).includes('级别是在'), false, '不限级别时不该说那句边界声明')

  calls.length = 0
  select.props.onChange({ target: { value: 'error' } })
  runtime.tick()
  await runtime.update()
  // 改下拉**不自动重查**（与改查询串同一条：都在草稿里，由「查询」那一下一起发）
  assert.equal(calls.filter((call) => call.path === '/api/dsh-loglens/query').length, 0, '改级别不该自己打一枪')

  await clickAndSettle(runtime, buttonByText(runtime.tree, '查询'))
  const query = calls.find((call) => call.path === '/api/dsh-loglens/query')
  assert.equal(query.body.level, 'error', '载荷里该带 level：' + JSON.stringify(query.body))
  // 边界声明必须在场：宿主是在**这一页**上筛的，counts / truncation 仍是未筛的整页
  assert.ok(treeText(runtime.tree).includes('级别是在'), '页内筛那句必须说出来：' + treeText(runtime.tree).slice(0, 400))

  // 换回「不限」→ 载荷里**不带这个键**（形状回到加它之前）
  calls.length = 0
  levelSelect(runtime.tree).props.onChange({ target: { value: '' } })
  runtime.tick()
  await runtime.update()
  await clickAndSettle(runtime, buttonByText(runtime.tree, '查询'))
  const again = calls.find((call) => call.path === '/api/dsh-loglens/query')
  assert.equal('level' in again.body, false, '回到不限之后不许带一个空的 level：' + JSON.stringify(again.body))
  assert.equal(treeText(runtime.tree).includes('级别是在'), false, '不限级别时那句该撤掉')
})

/* ------------------------------------------------------------------ *
 * 回车即查 + 放大后取消（面板第七刀）
 * ------------------------------------------------------------------ */

/** 查询串输入框（占位符是一句中文，按它找得到）。 */
function queryInput(tree) {
  return treeFind(tree, (node) => node.type === 'input' && String(node.props?.placeholder ?? '').includes('查询串'))[0]
}

/** 条数输入框（title 是 t('field.limit') 的兜底文案）。 */
function limitInput(tree) {
  return treeFind(tree, (node) => node.type === 'input' && node.props?.title === '条数')[0]
}

await test('回车即查：查询串与条数两个输入框都认回车（只有回车认；与点「查询」同一条路）', async () => {
  serverRoutes = ZOOM_ROUTES()
  const { runtime, tree } = await runPanelQueryFull('es', { skipQuery: true })
  const box = queryInput(tree)
  assert.ok(box !== undefined, '找不到查询串输入框')
  assert.equal(typeof box.props.onKeyDown, 'function', '查询串输入框该接上回车（不然打完字还得摸鼠标）')

  // 先打字（不查）
  box.props.onChange({ target: { value: 'level:error' } })
  runtime.tick()
  await runtime.update()
  calls.length = 0
  // 非回车键**不发请求**（否则每敲一个字就打一枪）
  queryInput(runtime.tree).props.onKeyDown({ key: 'a' })
  await runtime.update()
  assert.equal(calls.filter((call) => call.path === '/api/dsh-loglens/query').length, 0, '不是回车不该发请求')
  // 回车 → 发出这一次查询，查询串就是刚打的那一串
  queryInput(runtime.tree).props.onKeyDown({ key: 'Enter' })
  await runtime.update()
  await runtime.update()
  await runtime.update()
  const query = calls.find((call) => call.path === '/api/dsh-loglens/query')
  assert.ok(query !== undefined, '回车该真的查一次')
  assert.equal(query.body.q, 'level:error', '打进去的查询串要原样发出去：' + JSON.stringify(query.body))

  // 条数那一格也认回车（同一行里的输入框只有一半认回车就说不通）
  calls.length = 0
  const limitBox = limitInput(runtime.tree)
  assert.ok(limitBox !== undefined, '找不到条数输入框')
  assert.equal(typeof limitBox.props.onKeyDown, 'function', '条数输入框也该接上回车')
  limitBox.props.onChange({ target: { value: '25' } })
  runtime.tick()
  await runtime.update()
  limitInput(runtime.tree).props.onKeyDown({ key: 'Enter' })
  await runtime.update()
  await runtime.update()
  await runtime.update()
  const again = calls.find((call) => call.path === '/api/dsh-loglens/query')
  assert.ok(again !== undefined, '条数那格回车也该查')
  assert.equal(again.body.limit, 25, '条数要跟着改：' + JSON.stringify(again.body))
})

await test('放大后取消：再点**正在放大的那根**柱 → 回到放大前那一档（窗口、下拉、高亮一起回落）', async () => {
  serverRoutes = ZOOM_ROUTES()
  const { runtime, tree } = await runPanelQueryFull('es')
  await clickAndSettle(runtime, clickableBars(tree)[1])
  assert.equal(windowSelect(runtime.tree).props.value, 'custom', '先得真的进到自定义档')
  const active = treeFind(runtime.tree, (node) => hasClass(node, 'll_histBarActive'))
  assert.equal(active.length, 1, '放大那一档该高亮着')
  assert.ok(String(active[0].props.title).includes('再点一次取消'), '高亮那根的悬停要说清再点一次是撤销：' + String(active[0].props.title))

  calls.length = 0
  await clickAndSettle(runtime, active[0])
  const query = calls.find((call) => call.path === '/api/dsh-loglens/query')
  assert.ok(query !== undefined, '取消放大也要真的重查一次（窗口变了）')
  // 回到放大之前那一档：这次 runPanelQueryFull 用的是默认 '1h'，所以窗口恰好是一小时
  assert.equal(query.body.to - query.body.from, 60 * 60 * 1000,
    '取消后该回到放大前那一档（1 小时），实得 ' + String(query.body.to - query.body.from))
  // 聚合跟着同一个窗口（同一屏三个数字说的必须是同一段）
  for (const call of calls.filter((item) => item.path === '/api/dsh-loglens/facets')) {
    assert.equal(call.body.to - call.body.from, 60 * 60 * 1000, '聚合也要回到同一段')
  }
  const select = windowSelect(runtime.tree)
  assert.equal(select.props.value, '1h', '下拉回落到放大前那一档')
  assert.equal(windowChoicesHasCustom(runtime.tree), false, 'custom 不该再留在下拉里')
  assert.equal(treeFind(runtime.tree, (node) => hasClass(node, 'll_histBarActive')).length, 0, '高亮该撤掉')
  assert.equal(treeText(runtime.tree).includes('已放大到最短'), false, '被夹那句该跟着撤掉')
})

await test('放大后取消：连点两根柱（第二次从自定义档再放大）之后取消，要回到**最初**那一档（不是回到 custom 那个死胡同）', async () => {
  serverRoutes = ZOOM_ROUTES()
  const { runtime, tree } = await runPanelQueryFull('es')
  // 第一次放大：1 小时窗里的一档（1m 分桶）
  await clickAndSettle(runtime, clickableBars(tree)[0])
  assert.equal(windowSelect(runtime.tree).props.value, 'custom', '第一次放大后该是自定义档')
  /*
   * 放大之后窗口只有 1 分钟 → 分桶细到 10s → 桩按**这次请求的窗口**摆桶，所以画面上有 2 根有数据的柱：
   * 高亮的那根（= 刚放大的那一档）与另一根。点**另一根**就是「自定义档里再放大一次」——
   * 这一步最容易把「从哪一档放大的」记成 custom。
   */
  const inner = clickableBars(runtime.tree)
  assert.ok(inner.length >= 2, '放大后的窗里该有多根有数据的柱，实得 ' + String(inner.length))
  const other = inner.find((node) => !hasClass(node, 'll_histBarActive'))
  assert.ok(other !== undefined, '该有一根不是高亮着的')
  await clickAndSettle(runtime, other)
  assert.equal(windowSelect(runtime.tree).props.value, 'custom', '第二次放大仍在自定义档')

  // 现在取消：必须回到**最初**那一档（1 小时），而不是停在 custom（那会让取消变成点了没反应）
  calls.length = 0
  const active = treeFind(runtime.tree, (node) => hasClass(node, 'll_histBarActive'))
  assert.equal(active.length, 1, '该有一根高亮着')
  await clickAndSettle(runtime, active[0])
  const query = calls.find((call) => call.path === '/api/dsh-loglens/query')
  assert.ok(query !== undefined, '取消要真的重查一次（否则就是点了没反应）')
  assert.equal(query.body.to - query.body.from, 60 * 60 * 1000,
    '连点之后取消仍要回到最初那一档（1 小时），实得 ' + String(query.body.to - query.body.from))
  assert.equal(windowSelect(runtime.tree).props.value, '1h', '下拉回到最初那一档')
})

/* ------------------------------------------------------------------ *
 * 面板第八刀：条件改了就别拿旧结果翻页（ES 的 PIT 游标）+ 查询串方言提示
 * ------------------------------------------------------------------ */

/** 查询成功时带回一个游标（真 ES 回的是 PIT + search_after），并让聚合有东西可画。 */
function staleRoutes() {
  return {
    '/api/dsh-loglens/query': (body) => ({
      ...queryOutcome({ id: 'es', kind: 'elasticsearch', label: '内网 ES' }, true),
      window: { from: body.from, to: body.to },
      nextCursor: 'cursor-1',
    }),
    '/api/dsh-loglens/facets': (body) => ({
      ok: true,
      overTime: [{ ts: Math.floor(Number(body.from) / 60_000) * 60_000, count: 3 }],
      interval: body.interval,
      warnings: [],
    }),
  }
}

await test('查询串占位按**来源方言**说：ES 是 Lucene，Loki 才是 LogQL（别对 ES 说 LogQL）', async () => {
  serverRoutes = {}
  const es = await runPanelQueryFull('es', { skipQuery: true })
  const esBox = queryInput(es.tree)
  assert.ok(esBox !== undefined, '找不到查询串输入框')
  assert.ok(String(esBox.props.placeholder).includes('Lucene'), 'ES 的查询串是 Lucene，实得：' + String(esBox.props.placeholder))
  assert.equal(String(esBox.props.placeholder).includes('LogQL'), false, 'ES 上不该出现 LogQL：' + String(esBox.props.placeholder))

  const loki = await runPanelQueryFull('local', { skipQuery: true })
  const lokiBox = queryInput(loki.tree)
  assert.ok(String(lokiBox.props.placeholder).includes('LogQL'), 'Loki 的查询串是 LogQL，实得：' + String(lokiBox.props.placeholder))
  assert.equal(String(lokiBox.props.placeholder).includes('Lucene'), false, 'Loki 上不该出现 Lucene：' + String(lokiBox.props.placeholder))
})

await test('条件改了：结果被明说成「上一次的」，「下一页」收起、「分组」禁用（游标属于上一次查询）', async () => {
  serverRoutes = staleRoutes()
  const { runtime } = await runPanelQueryFull('es')
  assert.equal(treeText(runtime.tree).includes('查询条件已经改过'), false, '刚查完就说「条件改过」是误报')
  assert.ok(buttonByText(runtime.tree, '下一页') !== undefined, '有游标时该给「下一页」')
  assert.equal(buttonByText(runtime.tree, '分组').props.disabled, false, '刚查完「分组」该能用')

  // 只改时间窗（不查）：界面上必须出现那句提示，且两处入口一起收起来
  windowSelect(runtime.tree).props.onChange({ target: { value: '15m' } })
  runtime.tick()
  await runtime.update()
  const text = treeText(runtime.tree)
  assert.ok(text.includes('查询条件已经改过'), '条件改了就要说出来，实得：' + text.slice(0, 400))
  assert.ok(text.includes('上一次查询'), '得说清下面这份是**上一次**的结果：' + text.slice(0, 400))
  assert.equal(buttonByText(runtime.tree, '下一页'), undefined,
    '条件改了还留「下一页」= 把旧 PIT 游标配新条件翻页（ES 会静默少行）')
  assert.equal(buttonByText(runtime.tree, '分组').props.disabled, true,
    '条件改了「分组」也得停：它会把新查询串配上一次回显的窗口')
  // 没点查询，就**不该**打枪（改下拉只是改草稿）
  assert.equal(calls.filter((call) => call.path === '/api/dsh-loglens/query').length, 1, '改窗不该自己重查')

  // 改回**原条件**（1 小时）就不是过期了：提示要能自己撤掉、入口要回来（否则会一直卡在那句上）
  windowSelect(runtime.tree).props.onChange({ target: { value: '1h' } })
  runtime.tick()
  await runtime.update()
  assert.equal(treeText(runtime.tree).includes('查询条件已经改过'), false, '改回原条件不该继续说过期')
  assert.ok(buttonByText(runtime.tree, '下一页') !== undefined, '改回原条件「下一页」该回来')
  // 再改回 15 分钟，走下面那条「重查 → 翻页」的主线
  windowSelect(runtime.tree).props.onChange({ target: { value: '15m' } })
  runtime.tick()
  await runtime.update()

  // 点查询：提示撤掉、翻页回来，且翻的页带的是**新条件**（窗口 15 分钟）
  calls.length = 0
  await clickAndSettle(runtime, buttonByText(runtime.tree, '查询'))
  assert.equal(treeText(runtime.tree).includes('查询条件已经改过'), false, '重查之后那句该撤掉')
  const next = buttonByText(runtime.tree, '下一页')
  assert.ok(next !== undefined, '重查之后「下一页」该回来')
  assert.equal(buttonByText(runtime.tree, '分组').props.disabled, false, '重查之后「分组」该能用')

  await clickAndSettle(runtime, next)
  const page = calls.filter((call) => call.path === '/api/dsh-loglens/query').pop()
  assert.equal(page.body.cursor, 'cursor-1', '翻页要带游标：' + JSON.stringify(page.body))
  assert.equal(page.body.to - page.body.from, 15 * 60 * 1000,
    '翻的必须是**新条件**那一页（15 分钟），实得 ' + String(page.body.to - page.body.from))
})

await test('只改级别也算改条件（同一份判据，不为每个控件各写一遍）', async () => {
  serverRoutes = staleRoutes()
  const { runtime } = await runPanelQueryFull('es')
  levelSelect(runtime.tree).props.onChange({ target: { value: 'error' } })
  runtime.tick()
  await runtime.update()
  assert.ok(treeText(runtime.tree).includes('查询条件已经改过'), '改级别也是改条件：' + treeText(runtime.tree).slice(0, 400))
  assert.equal(buttonByText(runtime.tree, '下一页'), undefined, '改级别之后「下一页」也得收起')
})

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
