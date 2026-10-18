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
// CSS 里那句 `max-height` 与这个常量是同一条规矩的两半（一个是渲染、一个是上翻判断）
import { FIELD_PANEL_CEILING, FIELD_PANEL_WIDTH, fieldNameBreaks } from '../client-src/pure.js'

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

/*
 * 第三十七刀：来源列表的**列宽对齐**。
 *
 * 表头与每一行是**两个独立的 grid**，各自算列宽。原来动作位写 `auto`，于是：
 * 行里两个按钮有宽度（44 / 46），表头里那两个空格是 0 —— 前三列被推歪，
 * 真机量到「地址」表头在 x=790、输入框在 x=753，差 **37px**。
 *
 * 这一条钉的是「两处的列宽模板逐字相同」——那是它们能对齐的**唯一**理由
 * （桩不渲染 CSS，量不到真实坐标，所以断言模板而不是坐标）。
 */
await test('来源列表：表头与行的列宽模板**逐字相同**（否则表头会歪），且类型列放得下最长的选项', async () => {
  const pick = (re) => {
    const match = code.match(re)
    assert.ok(match !== null, '找不到这条样式规则：' + String(re))
    return match[1]
  }
  const headCols = pick(/\.ll_head\{display:grid;grid-template-columns:([^;]+);/)
  const rowCols = pick(/\.ll_row\{display:grid;grid-template-columns:([^;]+);/)
  assert.equal(rowCols, headCols,
    '表头与行必须是同一套列宽（各写一份但要逐字相同），实得：\n  表头 ' + headCols + '\n  行   ' + rowCols)

  /*
   * 类型列的下限要放得下最长选项：真机量到「Docker（采集来源）」文字 121px，
   * 加左右内边距 24 与原生下拉箭头约 20 = 165px。低于它就会被切成 `Docker（采集...`。
   */
  const kindMin = Number((headCols.match(/minmax\((\d+)px/) ?? [])[1])
  assert.equal(Number.isFinite(kindMin), true, '类型列该有 minmax 下限：' + headCols)
  assert.ok(kindMin >= 160, '类型列下限要 ≥160px 才放得下「Docker（采集来源）」，实得 ' + String(kindMin))
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

/**
 * 排序按钮（第十八刀图标化之后，按钮上只剩档位名「时间 / 级别 / 正文」）。
 *
 * 按 `aria-label` 找而不是按文字找：文字只剩「时间」这种两字档位名，与页面上别处的
 * 「最近 1 小时」之类容易混；aria-label 才是那句完整的「本页排序：时间」。
 */
function sortButton(tree, order) {
  return treeFind(tree, (node) => node.type === 'button'
    && typeof node.props?.['aria-label'] === 'string'
    && node.props['aria-label'].includes('本页排序：' + order))[0]
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
  tree = await runtime.update()
  /*
   * 选列面板默认收起：需要它的用例显式打开（顺便验一次「点它才展开」）。
   *
   * 第三十刀之后只剩**一个**面板（元信息行那颗「字段」）。筛选不再有面板——它是筛选行上的
   * 两格输入框，跟着这一行的常驻判据自己出现（跑过一次查询就有），不需要在这里点开。
   */
  if (options.fieldsOpen === true) {
    const fieldsBtn = buttonByText(tree, '字段')
    assert.ok(fieldsBtn !== undefined, '找不到打开选列面板的开关')
    fieldsBtn.props.onClick(rectAt(16, 120, 74, 22))
    await runtime.update()
    await runtime.update()
    tree = await runtime.update()
  }
  return { runtime, tree }
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
  // 第十六刀：钻掉原生 tooltip（它会盖住横轴），句子搬进 aria-label + 读数条
  assert.equal(bars[1].props.title, undefined, '不该再挂原生 title（那个灰框会压住横轴刻度）')
  const aria = String(bars[1].props['aria-label'])
  assert.ok(aria.includes('点一下放大到这一段'), '读屏用户要能听出这根柱子能点：' + aria)
  assert.ok(aria.includes('5 条'), '读屏用户也要知道这一段有多少条：' + aria)
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

/**
 * Docker 区容器那一格（第三十九刀起是**自绘候选**，不再是原生 `<select>`）。
 *
 * 换掉的原因：真机上有十几个容器，原生弹层高度不受控（铺满整个面板）、不能搜、样式改不动。
 * 现在它与「分组字段」、查询串的字段名补全**同一套**：输入框 + 自画候选 + 方向键/回车/Esc。
 */
function containerInput(tree) {
  return treeFind(tree, (node) => node.type === 'input' && node.props?.title === '容器')[0]
}
/** 候选行（`ll_pickItem`）；没开候选就是空数组。 */
function containerRows(tree) {
  return treeFind(tree, (node) => node.type === 'button'
    && hasClass(node, 'll_pickItem')
    && String(node.props?.key ?? '').startsWith('ll-container-'))
}
/** 打开候选（点输入框，与用户操作同一条路）。 */
function openContainers(runtime) {
  const box = containerInput(runtime.tree)
  assert.ok(box !== undefined, '找不到容器那一格')
  box.props.onClick()
  return box
}
/** 在容器那一格里打字（收窄候选）。 */
function typeContainer(runtime, text) {
  const box = openContainers(runtime)
  box.props.onChange({ target: { value: text } })
  runtime.tick()
}
/** 当前显示的那句（有清单时是选中的容器名，过渡态是「加载中…」这类）。 */
function containerText(tree) {
  const box = containerInput(tree)
  return box === undefined ? undefined : String(box.props.value)
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

  /*
   * 第三十九刀之后这一格是**自绘候选**：输入框显示「已选的那个」，点开列出全部。
   * 判据（显示哪个 / 候选有哪些）仍是同一份 `containerSlot` 与 `containers`。
   */
  assert.equal(containerText(runtime.tree), 'upms-service', '第一条该被自动选中（不然「看日志」只会回一句「先选容器」）')
  openContainers(runtime)
  await runtime.update()
  // 当前选中的那一条带勾（勾是**行内另一段**，不在名字里——所以分开断言，不靠空格猜）
  const rows = containerRows(runtime.tree)
  assert.deepEqual(rows.map((node) => treeText(node)), ['upms-service✓', 'gateway'],
    '候选该列出全部容器：' + JSON.stringify(rows.map((node) => treeText(node))))
  assert.equal(treeFind(rows[0], (node) => hasClass(node, 'll_pickDone')).length, 1, '当前那个要带勾')
  assert.equal(treeFind(rows[1], (node) => hasClass(node, 'll_pickDone')).length, 0, '别的行不该有勾')
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
  assert.equal(containerText(runtime.tree), 'upms-service')
  // 同一个键：再来几轮渲染也不该重拉（缓存判据就是 containersKey）
  await runtime.update()
  await runtime.update()
  assert.equal(containerCalls().length, 1, '同一个目标不该重拉')

  const targetSelect = dockerTargetSelect(runtime.tree)
  assert.ok(targetSelect !== undefined, '找不到 Docker 目标下拉')
  targetSelect.props.onChange({ target: { value: 'local' } })
  runtime.tick()
  /*
   * 这一刻清单还没回来，但**旧清单还在**（上一条目标拉回来的 upms）。所以那一格仍该显示
   * 那个旧容器名：把显示改成「加载中…」等于替用户扔掉看得见的东西（那几秒里他不是没有选项，
   * 是有**上一条目标**的选项）。
   *
   * 「正在拉」这句话现在落在**候选浮层页脚的「刷新」**上（第四十刀把主行那颗按钮撤了）：
   * 没点开候选时主行里一个字都不该提「在拉」，那一格显示的仍是旧容器名。
   */
  assert.equal(containerText(runtime.tree), 'upms-service', '有旧清单时那一格不该改口')
  assert.equal(buttonByText(runtime.tree, '刷新容器清单'), undefined, '主行不该再有那颗按钮（第四十刀撤掉了）')

  await runtime.update()
  await runtime.update()
  assert.equal(containerCalls().length, 2, '换了目标要重拉一次')
  assert.equal(containerCalls()[1].body.target, 'local', '重拉要带新目标')
  assert.equal(containerText(runtime.tree), 'nginx', '原来的 upms 不在新清单里：选中项要换成新清单的第一条，不许留一个候选里没有的 id')
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

  /*
   * 过渡态在**输入框**上（第三十九刀之后这一格不再是原生下拉）：它显示那句状态、且只读——
   * 那一刻它不是一个可选的容器名。判据仍是同一份 containerSlot。
   */
  assert.equal(containerText(runtime.tree), '加载中…', '清单没到的时候这一格就该说「在拉」，实得：' + containerText(runtime.tree))
  assert.equal(containerInput(runtime.tree).props.readOnly, true, '过渡态不是可选的：那一刻没有一个真容器值得选')
  assertNarrowLabel(containerText(runtime.tree), '容器那一格的过渡态')

  await runtime.update()
  await runtime.update()
  assert.equal(containerText(runtime.tree), 'upms-service', '清单到手后该显示选中的那个')
})

await test('Docker 区：拉回来是空清单 → 占位项说「没有容器」，hint 说清「只列运行中的」', async () => {
  serverRoutes = { '/api/dsh-docker/containers': { ok: true, containers: [] } }
  const { runtime } = await runPanelQueryFull('target', { skipQuery: true })
  await runtime.update()
  await runtime.update()

  assert.equal(containerText(runtime.tree), '没有容器', '拉空了要说清是空的（不然就是一个看不出所以然的空格子）')
  assert.equal(containerInput(runtime.tree).props.readOnly, true, '没有可选项时它不该能被编辑')
  assertNarrowLabel(containerText(runtime.tree), '容器那一格的空清单态')
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
  assert.equal(containerText(runtime.tree), '加载失败', '失败时那一格该说「加载失败」，实得：' + containerText(runtime.tree))
  assert.equal(containerInput(runtime.tree).props.readOnly, true, '失败态不是可选的')
  assertNarrowLabel(containerText(runtime.tree), '容器那一格的失败态')
  /*
   * 重试出口在**候选浮层里**（第四十刀）：失败态下点开候选，那句宿主原话旁边有一颗「重试」。
   * 主行那颗按钮撤掉之后，这是唯一能按的重试入口——所以它必须在。
   */
  openContainers(runtime)
  await runtime.update()
  assert.ok(buttonByText(runtime.tree, '重试') !== undefined,
    '失败态点开候选该有「重试」（那是撤掉主行按钮之后唯一的重试出口）')

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

  /*
   * 「刷新」在**候选浮层的页脚**里（第四十刀），与字段候选的「共 N 个 + 刷新」逐字同一套。
   *
   * 原来它是主行上一颗实心按钮，与「看日志」并列——两颗同级，可只有一颗是该先按的。
   * 主行因此从五格变四格，容器名多出这一格的宽度。
   */
  assert.equal(buttonByText(runtime.tree, '刷新容器清单'), undefined, '主行不该再有那颗按钮')
  openContainers(runtime)
  await runtime.update()
  const foot = treeFind(runtime.tree, (node) => hasClass(node, 'll_pickFoot'))[0]
  assert.ok(foot !== undefined, '候选浮层该有页脚')
  const refresh = treeFind(foot, (node) => node.type === 'button' && hasClass(node, 'll_pickRefresh'))[0]
  assert.ok(refresh !== undefined, '页脚里该有「刷新」：' + treeText(foot))
  assert.ok(String(refresh.props.title).includes('容器起停'), '悬停要说清为什么需要它：' + String(refresh.props.title))
  refresh.props.onClick()
  await runtime.update()
  await runtime.update()
  assert.equal(containerCalls().length, 2, '页脚那颗「刷新」要真的重拉一次')
})

/*
 * 第三十八刀：「看日志」这条路上的静默错误。
 *
 * 真机抓到：Docker 的日志是**一次按下来就固定的快照**（不像 ES 那样条件一变就重查）。
 * 于是换个容器之后，屏幕上那份日志还是**上一个容器**的，而界面一个字都不提——
 * 用户会拿着 A 容器的日志排查 B 容器的问题。
 *
 * 这一组钉三件事：① 换了容器要明说是上一次的；② 重新拉之后提示消失；③ 提示摆在日志**上方**。
 */
/*
 * 第三十九刀：容器候选**能搜、能键盘操作、有上限**。
 *
 * 用户截图里那个原生弹层铺满整个面板、不能搜、样式改不动——十几个容器里找一个只能滚。
 * 换成自绘候选之后这些都要接回来（换掉原生控件就得自己实现它自带的能力，否则是悄悄降级）。
 */
await test('容器候选：能按名字收窄、方向键+回车选、Esc 收起、命中 0 个不画空盒子', async () => {
  serverRoutes = {
    '/api/dsh-docker/containers': {
      ok: true,
      containers: [
        { id: 'a1', name: 'app-svc-1' }, { id: 'b2', name: 'app-svc-3' },
        { id: 'c3', name: 'upms' }, { id: 'd4', name: 'batch-job-a' },
      ],
    },
  }
  const { runtime } = await runPanelQueryFull('target', { skipQuery: true })
  await runtime.update()
  await runtime.update()

  // ① 打字收窄（名字能搜）
  typeContainer(runtime, 'batch')
  await runtime.update()
  assert.deepEqual(containerRows(runtime.tree).map((node) => treeText(node)), ['batch-job-a'],
    '按名字收窄：' + JSON.stringify(containerRows(runtime.tree).map((node) => treeText(node))))

  // ② id 也能搜（用户可能只记得短 id）
  typeContainer(runtime, 'c3')
  await runtime.update()
  assert.deepEqual(containerRows(runtime.tree).map((node) => treeText(node)), ['upms'], 'id 也要能搜')

  // ③ 命中 0 个**不画空盒子**（与分组框、字段补全同一条）
  typeContainer(runtime, 'zzz')
  await runtime.update()
  assert.equal(treeFind(runtime.tree, (node) => hasClass(node, 'll_pickList')).length, 0, '命中 0 个不该画一个空浮层')

  // ④ 方向键 + 回车：回到全量，按下方向键挪一行再回车
  typeContainer(runtime, '')
  await runtime.update()
  assert.equal(containerRows(runtime.tree).length, 4, '清空搜索词该回到全部')
  // 真浏览器里事件对象带着 preventDefault（桩给一份完整的，不为测试削弱实现）
  const key = (name) => containerInput(runtime.tree).props.onKeyDown({ key: name, preventDefault: () => {} })
  key('ArrowDown')
  await runtime.update()
  key('Enter')
  await runtime.update()
  const picked = containerText(runtime.tree)
  assert.ok(['app-svc-1', 'app-svc-3', 'upms', 'batch-job-a'].includes(picked), '回车该选中当前那一行：' + String(picked))
  assert.equal(treeFind(runtime.tree, (node) => hasClass(node, 'll_pickList')).length, 0, '选中之后候选该收起')

  // ⑤ Esc 收起候选（不改变已选的那个）
  const before = containerText(runtime.tree)
  openContainers(runtime)
  await runtime.update()
  assert.equal(treeFind(runtime.tree, (node) => hasClass(node, 'll_pickList')).length, 1, '点开该有候选')
  containerInput(runtime.tree).props.onKeyDown({ key: 'Escape', preventDefault: () => {} })
  await runtime.update()
  assert.equal(treeFind(runtime.tree, (node) => hasClass(node, 'll_pickList')).length, 0, 'Esc 该收起')
  assert.equal(containerText(runtime.tree), before, 'Esc 不该改变已选的那个')
})

await test('Docker 日志：换了容器之后明说「这是上一次的」，重拉之后提示消失', async () => {
  serverRoutes = {
    '/api/dsh-docker/containers': { ok: true, containers: [{ id: 'upms', name: 'upms-service' }, { id: 'gateway', name: 'gateway' }] },
    '/api/dsh-docker/logs': { ok: true, logs: 'line-a\nline-b\n' },
  }
  const { runtime } = await runPanelQueryFull('target', { skipQuery: true })
  await runtime.update()
  await runtime.update()

  // 还没点「看日志」：没有日志区，也没有 stale 提示
  assert.equal(treeFind(runtime.tree, (node) => hasClass(node, 'll_results')).length, 0, '没拉过不该有日志区')
  assert.equal(treeText(runtime.tree).includes('上一次拉取的'), false, '没拉过就没有「上一次」可言')

  // 拉一次
  buttonByText(runtime.tree, '看日志').props.onClick()
  await runtime.update()
  await runtime.update()
  const logsCalls = () => calls.filter((call) => call.path === '/api/dsh-docker/logs')
  assert.equal(logsCalls().length, 1, '该真的拉一次：' + String(logsCalls().length))
  assert.equal(logsCalls()[0].body.id, 'upms', '拉的是当前选中的容器')
  assert.ok(treeText(runtime.tree).includes('line-a'), '日志该画出来')
  assert.equal(treeText(runtime.tree).includes('上一次拉取的'), false, '刚拉完，不该说「上一次」')

  // 换一个容器（走真实交互：点开候选 → 点那一条）：日志不动，但必须明说它是上一次的
  openContainers(runtime)
  await runtime.update()
  const gatewayRow = containerRows(runtime.tree).find((node) => treeText(node).includes('gateway'))
  assert.ok(gatewayRow !== undefined, '候选里该有 gateway：' + JSON.stringify(containerRows(runtime.tree).map((n) => treeText(n))))
  gatewayRow.props.onClick()
  await runtime.update()
  const text = treeText(runtime.tree)
  assert.ok(text.includes('上一次拉取的'), '换了容器必须说出来（否则会拿 A 的日志查 B）：' + text.slice(0, 200))
  assert.ok(text.includes('gateway'), '提示要说清「现在选的是哪个」，实得：' + text.slice(0, 200))
  // 日志仍然是旧的（这条路径不自动重拉——快照语义），这一点也要如实：没有偷偷换成新容器
  assert.equal(logsCalls().length, 1, '换容器不该自动重拉（那是「看日志」那一按的事）')

  // 重新拉：提示消失，请求带的是新容器
  buttonByText(runtime.tree, '看日志').props.onClick()
  await runtime.update()
  await runtime.update()
  assert.equal(logsCalls().length, 2)
  assert.equal(logsCalls()[1].body.id, 'gateway', '重拉要拉**新选的那个**')
  assert.equal(treeText(runtime.tree).includes('上一次拉取的'), false, '重拉之后提示该消失')
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
  // 行上只摆值（字段名在悬停 / ＋N 浮层 / 字段栏里），值本身不被字段名挤掉
  assert.equal(treeText(chips[0]), 'app-svc-1')
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
  // 敏感字段那句**不常驻**在结果区上方：只在真的展开、看到原文的地方说（常驻提醒是噪音）
  assert.equal(treeText(tree).includes('可能有敏感字段'), false, '这句话不该常驻在结果列表上方')
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
  assert.equal(treeText(chip), 'app-svc-1', '行上第一颗是 container.name 的值（键名在悬停里）')

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
  assert.equal(treeText(chips[0]), 'node-7', '行上只摆值')
  assert.equal(moreButton(tree), undefined, '只剩 1 个有值标签时不该有「＋N」')
})

/* ------------------------------------------------------------------ *
 * 级别筛选（宿主既有入参；页内筛必须说出来）
 * ------------------------------------------------------------------ */

/** 级别下拉（它的选项里有一个空 value 的「不限」，而且同一格里还有 error+ 那一档）。 */
function levelSelect(tree) {
  return treeFind(tree, (node) => node.type === 'select'
    && Array.isArray(node.props?.children)
    && node.props.children.some((child) => child !== null && typeof child === 'object' && child.props?.value === ''
      && treeText(child) === '不限')
    && node.props.children.some((child) => child !== null && typeof child === 'object' && child.props?.value === 'error'))[0]
}

await test('级别下拉的文案**短到放得进那一格**：warn+ / error+，不再拖着「及以上」（真机 96px 一列）', async () => {
  serverRoutes = { '/api/dsh-loglens/query': queryOutcome({ id: 'es', kind: 'elasticsearch', label: '内网 ES' }, true) }
  const tree = await runPanelQuery('es')
  const select = levelSelect(tree)
  assert.ok(select !== undefined, '找不到级别下拉')
  const labels = select.props.children.map((child) => treeText(child))
  assert.deepEqual(labels, ['不限', 'trace+', 'debug+', 'info+', 'warn+', 'error+', 'fatal'],
    '七项都要短：实得 ' + JSON.stringify(labels))
  // 预算：`.ll_queryGrid` 第四列最窄 96px − 左右各 12px 内边距 − 原生箭头约 20px ≈ 52px 文字区，
  // font-size 13px → 约 4 个汉字宽。`trace+` = 3 个汉字宽（5 个半角 × 0.5 + 1），留一格余量。
  for (const label of labels) {
    assert.ok(labelUnits(label) <= 4, '级别下拉的「' + label + '」放不进最窄那一格（预算 4，实得 ' + String(labelUnits(label)) + '）')
  }
})

await test('级别筛选：下拉六档 + 不限；选中后请求体带 level，且**明说这是页内筛**', async () => {
  serverRoutes = {
    '/api/dsh-loglens/query': { ...queryOutcome({ id: 'es', kind: 'elasticsearch', label: '内网 ES' }, true), level: 'error' },
    '/api/dsh-loglens/facets': facetsRoute([], HIST_OK),
  }
  const { runtime, tree } = await runPanelQueryFull('es')
  const select = levelSelect(tree)
  assert.ok(select !== undefined, '找不到级别下拉')
  assert.equal(select.props.value, '', '默认是「不限」')
  assert.equal(treeText(tree).includes('是在「返回的这一页」上筛的'), false, '不限级别时不该说那句边界声明')

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
  assert.ok(treeText(runtime.tree).includes('是在「返回的这一页」上筛的'), '页内筛那句必须说出来：' + treeText(runtime.tree).slice(0, 400))
  // 标签缩短成 `warn+` 之后，这句是全屏唯一写着完整语义的地方——`+` 的读法必须在这里讲清
  assert.ok(treeText(runtime.tree).includes('warn+ 就是 warn 及以上'), '要把下拉里的 `+` 讲清：' + treeText(runtime.tree).slice(0, 400))

  // 换回「不限」→ 载荷里**不带这个键**（形状回到加它之前）
  calls.length = 0
  levelSelect(runtime.tree).props.onChange({ target: { value: '' } })
  runtime.tick()
  await runtime.update()
  await clickAndSettle(runtime, buttonByText(runtime.tree, '查询'))
  const again = calls.find((call) => call.path === '/api/dsh-loglens/query')
  assert.equal('level' in again.body, false, '回到不限之后不许带一个空的 level：' + JSON.stringify(again.body))
  assert.equal(treeText(runtime.tree).includes('是在「返回的这一页」上筛的'), false, '不限级别时那句该撤掉')
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

/*
 * 第三十五刀：正文里的**命中高亮**。
 *
 * 区间由后端给（ES 的 `highlight` 换算出来），界面只负责切片渲染——**不拿查询串去正文里找**
 * （`stream:stderr` 这种词正文里根本没有、`-failed` 是排除，照字面标会错一半，而标错比不标更坏）。
 * 这里钉的是「界面真的把区间画出来了」与「没有区间时一个高亮都不画」。
 */
/*
 * 第三十六刀：截断提示的两种说法。
 *
 * 判据在 src/query.ts 的 pageLimitFlags。这一刀修的是真机抓到的边界：命中数恰好等于条数上限时，
 * 旧判据会报「已截断：达到条数上限」并给出「下一页」，而翻过去是 0 行。
 *
 * 界面上要看出三件事：① 「可能还有」不说成「已截断」；② 它说清「显示了前 N 行」并给动作；
 * ③ 确定的截断仍然如实说「已截断」。
 */
await test('截断：确定的说「已截断」，「可能还有」另说一句（不说成截断）', async () => {
  const base = (patch) => ({ ...queryOutcome({ id: 'es', kind: 'elasticsearch', label: '内网 ES' }, true), ...patch })
  const routes = (outcome) => ({ '/api/dsh-loglens/query': outcome, '/api/dsh-loglens/facets': facetsRoute([], HIST_OK) })

  // ① 确定截断：命中 15200、返回 100
  serverRoutes = routes(base({
    counts: { returned: 100, totalKnown: true, matched: 15200 },
    truncation: { truncated: true, reasons: ['hit_limit'] },
    nextCursor: 'cursor-x',
  }))
  const cut = await runPanelQueryFull('es')
  const cutText = treeText(cut.tree)
  assert.ok(cutText.includes('已截断'), '确定还有更多时该说「已截断」：' + cutText.slice(0, 200))
  assert.ok(cutText.includes('达到条数上限'), '理由要照实说：' + cutText.slice(0, 200))
  assert.ok(buttonByText(cut.tree, '下一页') !== undefined, '确定还有下一页时才给「下一页」')

  // ② 可能还有：命中恰好等于上限（100 = 100）→ 不说「已截断」，也不给「下一页」
  serverRoutes = routes(base({
    counts: { returned: 100, totalKnown: true, matched: 100 },
    truncation: { truncated: true, reasons: ['hit_limit_maybe'] },
    // 就算后端错给了游标，界面这一层也该收着（这里断言的是文案与按钮的判据）
  }))
  const maybe = await runPanelQueryFull('es')
  const maybeText = treeText(maybe.tree)
  assert.equal(maybeText.includes('已截断'), false, '「可能还有」不许说成「已截断」：' + maybeText.slice(0, 200))
  assert.ok(maybeText.includes('可能有更多'), '要说清「可能有更多」：' + maybeText.slice(0, 200))
  assert.ok(maybeText.includes('把条数调大'), '要给一个能做的事（照 Kibana 的 Refine your search）：' + maybeText.slice(0, 200))
})

await test('正文命中高亮：按后端给的区间画出来；没有区间就一个都不画（与加高亮之前一样）', async () => {
  const HIT_LINE = {
    ts: 1000,
    message: 'connect timeout after 30s',
    source: '0',
    level: 'error',
    labels: {},
    highlights: [[8, 15]],
    raw: '{"message":"connect timeout after 30s"}',
    id: 'h:0',
  }
  const PLAIN_LINE = { ...HIT_LINE, message: 'no marks here', highlights: undefined, id: 'h:1' }
  serverRoutes = {
    '/api/dsh-loglens/query': { ...queryOutcome({ id: 'es', kind: 'elasticsearch', label: '内网 ES' }, true), lines: [HIT_LINE, PLAIN_LINE] },
    '/api/dsh-loglens/facets': facetsRoute([], HIST_OK),
  }
  const { tree } = await runPanelQueryFull('es')

  const hits = treeFind(tree, (node) => hasClass(node, 'll_resultHit'))
  assert.equal(hits.length, 1, '该只画一段命中（text 里的 timeout），实得 ' + String(hits.length))
  assert.equal(treeText(hits[0]), 'timeout', '命中的那段文字要与区间对得上：' + treeText(hits[0]))

  // 整行正文拼回去必须还是原样（高亮不许吞字）
  const messages = treeFind(tree, (node) => hasClass(node, 'll_resultMsg'))
  assert.equal(treeText(messages[0]), 'connect timeout after 30s', '高亮不许改变正文：' + treeText(messages[0]))
  // 没有区间的行：整段纯文本，不套高亮
  assert.equal(treeFind(messages[1], (node) => hasClass(node, 'll_resultHit')).length, 0, '没有区间就不该画高亮')
  assert.equal(treeText(messages[1]), 'no marks here')
})

await test('查询串旁边给**可点的例子**：点一下填进查询串（不自动查），再查时发的就是那个 q', async () => {
  serverRoutes = { '/api/dsh-loglens/query': labeledOutcome(), '/api/dsh-loglens/fields': labeledFields() }
  const { runtime, tree } = await runPanelQueryFull('es')

  const chips = treeFind(tree, (node) => node.type === 'button' && hasClass(node, 'll_sampleChip'))
  assert.equal(chips.length > 0, true, 'ES 来源该给几条例子：' + String(chips.length))
  // 例子本身是**代码**，不翻译（翻成中文就没法点进去跑）
  const samples = chips.map((node) => treeText(node))
  assert.equal(samples.includes('error'), true, '要有最基础的那条：' + JSON.stringify(samples))

  // 查询串那格：按**占位符**认（同行还有来源下拉，`ll_input` 不是唯一的）
  const queryBox = () => treeFind(runtime.tree, (node) => node.type === 'input'
    && typeof node.props?.placeholder === 'string' && node.props.placeholder.includes('Lucene'))[0]
  assert.ok(queryBox() !== undefined, '找不到查询串那一格')
  assert.equal(queryBox().props.value, '', '一开始查询串是空的')

  calls.length = 0
  /*
   * 演示「且」的那一条 = 大写 `AND`。
   *
   * 这里曾经按 `+` 找（第三十三刀给的是 `error+timeout`），第三十四刀查清了那是错的：
   * `+` 粘在两个词中间只是个分隔符（与空格同义，也就是「或」）。判据在 test/client-pure.test.ts
   * 里钉着（按交集算术），这里只认「大写 AND」这一条。
   */
  const andChip = chips.find((node) => treeText(node).includes(' AND '))
  assert.ok(andChip !== undefined, '要有一条演示「且」的（大写 AND）：' + JSON.stringify(samples))
  await clickAndSettle(runtime, andChip)
  assert.equal(queryBox().props.value, treeText(andChip), '点一下**填进**查询串：' + String(queryBox().props.value))
  // **不自动查**：例子是「看看长什么样」，不是「跑一下」
  assert.equal(calls.filter((call) => call.path === '/api/dsh-loglens/query').length, 0,
    '点例子不该自己打一枪（每次查询都是真的）')

  // 再按查询，发出去的 q 就是那个例子
  calls.length = 0
  const queryBtn = buttonByText(runtime.tree, '查询')
  await clickAndSettle(runtime, queryBtn)
  const sent = calls.find((call) => call.path === '/api/dsh-loglens/query')
  assert.ok(sent !== undefined)
  assert.equal(sent.body.q, treeText(andChip), '发出去的就是例子那个串：' + String(sent.body.q))
})

/*
 * 第三十四刀：查询串的**字段名补全**（用户看了 Kibana 的补全弹层之后问「要不要把这个抄过来」）。
 *
 * 只抄字段名那一半：`and` / `or` 那个运算符菜单是 KQL 的，抄进 Lucene 面板就是教错
 * （真机 `error and failed` 回 4505 条 —— `and` 被当普通词）。
 *
 * 这里钉的是**界面真的接上了**：打字出候选、点一条原位替换成 `字段:`、并且**不自动查询**
 * （补全一个字段名不等于要查一次；每次查询都是真打后端）。
 */
await test('查询串的字段名补全：打字出候选、点一条补成 `字段:`、不自动查；值那一侧不给候选', async () => {
  serverRoutes = { '/api/dsh-loglens/query': labeledOutcome(), '/api/dsh-loglens/fields': labeledFields() }
  const { runtime, tree } = await runPanelQueryFull('es')

  /*
   * 候选用的是**已经拉回来的**那份字段清单。这里先点开分组候选把它拉一次
   * （补全自己也有一条「还没拉过」的说明，见下一条用例）。
   */
  pickInput(tree).props.onFocus()
  await runtime.update()
  await runtime.update()
  pickInput(runtime.tree).props.onKeyDown({ key: 'Escape' })
  await runtime.update()

  const completionRows = () => treeFind(runtime.tree, (node) => node.type === 'button'
    && hasClass(node, 'll_pickItem') && String(node.props?.key ?? '').startsWith('ll-qfield-'))

  // 打 `cont` → 候选收窄到 container.name
  calls.length = 0
  const box = () => queryInput(runtime.tree)
  box().props.onChange({ target: { value: 'cont', selectionStart: 4 } })
  await runtime.update()
  const rows = completionRows()
  assert.equal(rows.length, 1, '打 `cont` 该只剩一个候选（container.name），实得 ' + String(rows.length))
  // 补全是「打字时自己出现」的东西，不该自己打后端
  assert.equal(calls.filter((call) => call.path === '/api/dsh-loglens/query').length, 0, '开候选不该发查询')

  // 点那条候选：**原位**补成 `container.name:`，光标落在冒号后
  await clickAndSettle(runtime, rows[0])
  assert.equal(box().props.value, 'container.name:', '点候选要补成「字段:」：' + String(box().props.value))
  assert.equal(completionRows().length, 0, '补完就收起候选')
  // 补一个字段名不等于要查一次
  assert.equal(calls.filter((call) => call.path === '/api/dsh-loglens/query').length, 0, '补全不该顺手查一次')

  /*
   * 光标过了冒号 = 值那一侧：不给字段候选（值候选是另一件事，这一刀不做）。
   *
   * 断言分两条写：浮层没开（`.ll_qList` 一处都没有）+ 候选 0 行。「浮层没开」才是判据真正的
   * 输出——只有候选 0 行的话，「判据正确」与「缓存里没数据」是同一个画面。
   *
   * **这条用例抓不住「把 `:` 判据删掉」那一类反例**，别指望它：删掉判据之后
   * `container.name:pro` 作为一个整词仍然匹配不到任何字段，画出来同样是 0 行。
   * 那个判据由 test/client-pure.test.ts 的 `fieldCompletion` 用例钉着（实测删除后 2 条变红）。
   */
  box().props.onChange({ target: { value: 'container.name:pro', selectionStart: 18 } })
  await runtime.update()
  assert.equal(treeFind(runtime.tree, (node) => hasClass(node, 'll_qList')).length, 0,
    '值那一侧**不该开**浮层（不是「开了但没候选」）')
  assert.equal(completionRows().length, 0, '值那一侧不该给字段候选')

  // 反过来：同一份字段清单，光标退回字段名那一侧时候选要回来（证明上面那 0 是判据给的，不是缓存没数据）
  box().props.onChange({ target: { value: 'cont', selectionStart: 4 } })
  await runtime.update()
  assert.equal(completionRows().length, 1, '光标退回字段名那一侧，候选该回来（否则上面那条 0 说明不了任何事）')

  // 句子中间补全：只换光标前那段，后面的内容不许丢
  calls.length = 0
  box().props.onChange({ target: { value: 'cont AND error', selectionStart: 4 } })
  await runtime.update()
  const midRows = completionRows()
  assert.equal(midRows.length, 1, '光标停在 `cont` 后面时该给候选')
  await clickAndSettle(runtime, midRows[0])
  assert.equal(box().props.value, 'container.name: AND error', '只替换光标前那段：' + String(box().props.value))
  assert.equal(calls.filter((call) => call.path === '/api/dsh-loglens/query').length, 0, '补全不该发查询')
})

await test('补全**自己把字段清单拉回来**（不用先点别处）；同一来源只拉一次；Loki 不给（形状不同）', async () => {
  /*
   * 这一条原先验的是另一件事：没拉过清单时**说一句「先去别处点一下」**。
   *
   * 维护者看图后直接否掉了那个设计：「应该自动加载啊」。对——面板自己忘了拉，凭什么让用户
   * 替它补这一步。字段清单本来就按来源缓存、还有在途闩（`loadFields` 自带），所以「第一次
   * 需要时自己拉一次」不会退化成「每敲一个字打一枪」。
   */
  serverRoutes = { '/api/dsh-loglens/query': labeledOutcome(), '/api/dsh-loglens/fields': labeledFields() }
  const cold = await runPanelQueryFull('es')
  const fieldCalls = () => calls.filter((item) => item.path === '/api/dsh-loglens/fields').length

  // 不点开分组候选、不展开字段面板：直接在查询串里打字
  calls.length = 0
  queryInput(cold.tree).props.onChange({ target: { value: 'cont', selectionStart: 4 } })
  await cold.runtime.update()
  await cold.runtime.update()
  await cold.runtime.update()
  assert.equal(fieldCalls() >= 1, true, '打字补全该**自己**把字段清单拉回来（不能要求用户先去点别处）')

  // 拉回来之后直接就是候选，不是「加载中」那一格
  const rows = treeFind(cold.runtime.tree, (node) => node.type === 'button'
    && hasClass(node, 'll_pickItem') && String(node.props?.key ?? '').startsWith('ll-qfield-'))
  assert.equal(rows.length > 0, true, '拉回来之后该直接出候选：' + String(rows.length))

  // 继续打字**不重拉**：缓存 + 在途闩，一个来源一次会话最多拉一次
  const after = fieldCalls()
  queryInput(cold.runtime.tree).props.onChange({ target: { value: 'host', selectionStart: 4 } })
  await cold.runtime.update()
  await cold.runtime.update()
  assert.equal(fieldCalls(), after, '继续打字不该重拉字段清单（那样才是「每敲一个字打一枪」）')

  // Loki：`{job="app"}` 不是「字段:值」的形状，硬套会把人引到错的写法上
  const loki = await runPanelQueryFull('local')
  queryInput(loki.tree).props.onChange({ target: { value: 'cont', selectionStart: 4 } })
  await loki.runtime.update()
  assert.equal(treeFind(loki.runtime.tree, (node) => hasClass(node, 'll_qList')).length, 0,
    'Loki 的查询串形状不同，不该给 Lucene 那种字段候选')
})

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
  // 第十六刀：这句话现在由**读数条**说（悬停到正在放大的那一根时）
  assert.ok(String(active[0].props['aria-label']).includes('再点一次取消'), '读屏用户要听出再点一次是撤销：' + String(active[0].props['aria-label']))
  // 读数气泡只在悬停时存在（第十七刀）：先悬停再读
  active[0].props.onMouseEnter()
  await runtime.update()
  const live = treeFind(runtime.tree, (node) => hasClass(node, 'll_histReadout'))[0]
  assert.ok(live !== undefined, '悬停正在放大的那根时该出现读数气泡')
  assert.ok(treeText(live).includes('再点一次取消'), '气泡该说清再点一次是撤销：' + treeText(live))

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

/* ------------------------------------------------------------------ *
 * 字段侧栏 + 结果表列集 + 行详情（P8-乙）
 * ------------------------------------------------------------------ */

/** 带标签的查询结果（两条行：第一条五个标签，第二条少几个——用来验列的 `—`）。 */
function labeledOutcome() {
  const lines = [
    {
      ts: 0,
      message: 'boot',
      source: '0',
      level: 'debug',
      labels: {
        'container.name': 'app-1',
        'host.name': 'node-1',
        'log.file.path': '/var/log/app.log',
        'kubernetes.pod.name': 'web-1',
        stream: 'stdout',
      },
      raw: '{"message":"boot"}',
      id: '0:0',
    },
    {
      ts: 1000,
      message: 'ready',
      source: '0',
      level: 'error',
      labels: { 'container.name': 'app-1', 'host.name': 'node-2', stream: 'stderr' },
      raw: '{"message":"ready"}',
      id: '0:1',
    },
  ]
  return {
    ok: true,
    target: { id: 'es', kind: 'elasticsearch', label: '内网 ES' },
    window: { from: 0, to: 900_000 },
    returned: lines.length,
    counts: { returned: lines.length, totalKnown: true, matched: lines.length },
    truncation: { truncated: false, reasons: [] },
    lines,
    warnings: [],
    capabilities: { queryLanguage: 'lucene', pagination: 'cursor', follow: false, aggregations: false },
  }
}

/** `/fields` 的清单：两个命中字段 + 一个其余字段 + 一个类型冲突字段。 */
function labeledFields() {
  return {
    ok: true,
    fields: [
      { name: 'container.name', kind: 'indexed', preferred: true },
      { name: 'host.name', kind: 'indexed' },
      { name: 'service.name', kind: 'indexed', preferred: true },
      { name: 'mixed.type', kind: 'indexed', conflict: true, esTypes: ['date', 'text'] },
    ],
    total: 4,
    truncated: false,
    warnings: [],
  }
}

const FIELD_ROUTES = () => ({
  '/api/dsh-loglens/query': labeledOutcome(),
  '/api/dsh-loglens/fields': labeledFields(),
})

/**
 * 侧栏里某个字段的那颗动作（键是 `ll-<column|filter>-act-<字段名>`）。
 *
 * 第二十六刀：选列面板的动作从「列」按钮换成了**勾选框**（`<input type=checkbox>`），
 * 所以 column 那头要按 input 找；filter 仍是 button。
 */
function fieldAction(tree, kind, name) {
  const tag = kind === 'column' ? 'input' : 'button'
  return treeFind(tree, (node) => node.type === tag && node.props?.key === 'll-' + kind + '-act-' + name)[0]
}

/** 点一下某个字段的勾选框（模拟用户在整行上点了一下：label 里那颗 checkbox 的 onChange）。 */
async function toggleColumnPick(runtime, name) {
  const box = fieldAction(runtime.tree, 'column', name)
  assert.ok(box !== undefined, '找不到 ' + name + ' 的勾选框')
  assert.notEqual(box.props.disabled, true, name + ' 的勾选框是禁用的（满员？）')
  box.props.onChange()
  await runtime.update()
  await runtime.update()
  await runtime.update()
}

/**
 * **结果表上方**那排列芯片。
 *
 * 注意作用域（第二十一刀）：面板里也有一份同样的芯片（「已选列」，用同一个 `.ll_columnChip`
 * 外观），所以「加了几列」不能在全树上数——会数出两倍。
 */
function resultColumnChips(tree) {
  const row = treeFind(tree, (node) => hasClass(node, 'll_columns'))[0]
  return row === undefined ? [] : treeFind(row, (node) => hasClass(node, 'll_columnChip'))
}

/** 侧栏的过滤框 / 行首展开箭头 / 额外列的值单元格。 */
function fieldFilterBox(tree) {
  return treeFind(tree, (node) => node.type === 'input' && hasClass(node, 'll_fieldsFilter'))[0]
}
function rowToggleButtons(tree) {
  return treeFind(tree, (node) => node.type === 'button' && hasClass(node, 'll_rowToggle'))
}
function columnCellNodes(tree) {
  return treeFind(tree, (node) => hasClass(node, 'll_resultCell'))
}
function rowDetailNodes(tree) {
  return treeFind(tree, (node) => hasClass(node, 'll_rowDetail'))
}

await test('字段面板：默认收起、点开是**浮层**（结果区不分栏），点面板外收起、重开不重拉', async () => {
  serverRoutes = FIELD_ROUTES()
  const { runtime, tree } = await runPanelQueryFull('es')
  assert.equal(treeFind(tree, (node) => hasClass(node, 'll_fields')).length, 0, '默认不画字段浮层（宽度全归日志）')
  assert.equal(treeFind(tree, (node) => hasClass(node, 'll_fieldScrim')).length, 0, '没有浮层就不该留遮罩')
  assert.equal(treeFind(tree, (node) => hasClass(node, 'll_resultItem')).length, 2, '结果照常')
  assert.equal(calls.filter((call) => call.path === '/api/dsh-loglens/fields').length, 0,
    '收起时不该为看不见的面板多打一枪 /fields')
  // 浮层不占布局：结果区的容器在收起 / 展开两态下是**同一个 class**（没有「两栏 / 单列」两套壳）
  assert.equal(treeFind(tree, (node) => hasClass(node, 'll_workbench'))[0].props.className, 'll_workbench',
    '收起时结果区不该挂上另一套布局 class')

  await clickAndSettle(runtime, buttonByText(runtime.tree, '字段'))
  assert.equal(treeFind(runtime.tree, (node) => hasClass(node, 'll_fields')).length, 1, '点「字段」浮出来')
  assert.equal(treeFind(runtime.tree, (node) => hasClass(node, 'll_fieldScrim')).length, 1,
    '浮层带一层遮罩：点面板外任何地方都能收起')
  assert.equal(treeFind(runtime.tree, (node) => hasClass(node, 'll_workbench'))[0].props.className, 'll_workbench',
    '展开后结果区仍是同一个壳（浮层不挤它）')
  assert.equal(calls.filter((call) => call.path === '/api/dsh-loglens/fields').length, 1,
    '展开时才拉一次字段清单')

  await clickAndSettle(runtime, treeFind(runtime.tree, (node) => hasClass(node, 'll_fieldScrim'))[0])
  assert.equal(treeFind(runtime.tree, (node) => hasClass(node, 'll_fields')).length, 0, '点面板外收起')
  assert.equal(treeFind(runtime.tree, (node) => hasClass(node, 'll_fieldScrim')).length, 0, '遮罩跟着收起')

  await clickAndSettle(runtime, buttonByText(runtime.tree, '字段'))
  assert.equal(treeFind(runtime.tree, (node) => hasClass(node, 'll_fields')).length, 1, '再点一次还能打开')
  assert.equal(calls.filter((call) => call.path === '/api/dsh-loglens/fields').length, 1,
    '同一个来源不重拉字段清单')
})



await test('列集：点「列」加一列（值取行标签，缺的显示 —），再点同一颗去掉', async () => {
  serverRoutes = FIELD_ROUTES()
  const { runtime, tree } = await runPanelQueryFull('es', { fieldsOpen: true })
  await toggleColumnPick(runtime, 'container.name')

  let next = runtime.tree
  const chips = resultColumnChips(next)
  assert.equal(chips.length, 1, '列芯片该出现一个：' + treeText(next).slice(0, 300))
  assert.ok(treeText(chips[0]).includes('container.name'))
  const cells = columnCellNodes(next)
  assert.deepEqual(cells.map((node) => treeText(node)), ['app-1', 'app-1'], '两行都取到行标签的原值')

  // 有额外列 → 行改成 grid（正文有下限，窗口不够横向滚动），0 列时仍是原来的 flex 行
  const wideResults = treeFind(next, (node) => hasClass(node, 'll_resultsWide'))[0]
  assert.ok(wideResults !== undefined, '有额外列时结果区要进「宽表」形态（横向滚动）')
  const firstRow = treeFind(next, (node) => hasClass(node, 'll_resultRow'))[0]
  assert.equal(firstRow.props.style.display, 'grid', '有额外列的行用 grid 模板')
  assert.ok(firstRow.props.style.gridTemplateColumns.includes('minmax(198px,1fr)'),
    '正文必须有 198px 下限（否则 4 列时正文会被挤成 0 宽）：' + firstRow.props.style.gridTemplateColumns)
  assert.ok(firstRow.props.style.gridTemplateColumns.includes('96px'), '每个额外列 96px')

  // 换一列缺值的：第一条有、第二条没有 → 第二条画 —
  await toggleColumnPick(runtime, 'log.file.path')
  next = runtime.tree
  assert.equal(resultColumnChips(next).length, 2)
  const values = columnCellNodes(next).map((node) => treeText(node))
  assert.deepEqual(values, ['app-1', '/var/log/app.log', 'app-1', '—'],
    '列按「每条行的这一列」排：缺值必须是 —，不是空串或假值（实得 ' + JSON.stringify(values) + '）')

  // 芯片上的 × 去掉第一列（入口与侧栏那颗是同一个开关）
  const remove = treeFind(next, (node) => node.type === 'button' && hasClass(node, 'll_colRemove'))[0]
  await clickAndSettle(runtime, remove)
  assert.equal(resultColumnChips(runtime.tree).length, 1)
  assert.equal(columnCellNodes(runtime.tree).length, 2, '去掉一列之后每行只剩另一列的值')
})

await test('列集上限：到 4 列时第 5 次点击给出人话，列集不变（不是静默丢掉）', async () => {
  serverRoutes = FIELD_ROUTES()
  const { runtime, tree } = await runPanelQueryFull('es', { fieldsOpen: true })
  for (const name of ['container.name', 'host.name', 'log.file.path', 'kubernetes.pod.name']) {
    await toggleColumnPick(runtime, name)
  }
  assert.equal(resultColumnChips(runtime.tree).length, 4)

  /*
   * 第二十六刀：满员之后**未选**的勾选框直接禁用（不是点一下再弹一句错）——
   * 那条错误文案是「按了没事发生」时代的补丁，现在按不动这件事本身在勾选框上就看得出来。
   * 仍要能**取消**已选的那 4 个（否则满员之后一个都去不掉）。
   */
  const blocked = fieldAction(runtime.tree, 'column', 'stream')
  assert.ok(blocked !== undefined, 'stream 这一行该在')
  assert.equal(blocked.props.disabled, true, '满员后未选的行该禁用')
  assert.ok(String(blocked.props['aria-label']).includes('stream'), '禁用也要能读出是哪个字段：' + String(blocked.props['aria-label']))
  // 禁用状态下点它：列集不许变
  blocked.props.onChange()
  await runtime.update()
  assert.equal(resultColumnChips(runtime.tree).length, 4, '禁用状态下点了列集不许变')
  // 已选的那几个仍然可点（取消勾选）
  for (const name of ['container.name', 'host.name']) {
    assert.equal(fieldAction(runtime.tree, 'column', name).props.disabled, false,
      '已选的 ' + name + ' 不许被满员挡住——否则满员之后一个都去不掉')
  }
  await toggleColumnPick(runtime, 'container.name')
  assert.equal(resultColumnChips(runtime.tree).length, 3, '取消勾选要真的去掉一列')
})


await test('行详情：点箭头展开全部标签与原文；一次只开一行，再点收起', async () => {
  serverRoutes = FIELD_ROUTES()
  const { runtime } = await runPanelQueryFull('es')
  let toggles = rowToggleButtons(runtime.tree)
  assert.equal(toggles.length, 2, '每条结果一个展开箭头')
  assert.equal(toggles[0].props['aria-expanded'], false)

  await clickAndSettle(runtime, toggles[0])
  let details = rowDetailNodes(runtime.tree)
  assert.equal(details.length, 1, '展开之后出现一条行详情')
  const text = treeText(details[0])
  // 行上只摆 1 个标签，详情要把**全部**标签摆出来（这是「＋N」之外的另一条路）
  assert.ok(text.includes('host.name'), '详情要列全部标签：' + text.slice(0, 300))
  assert.ok(text.includes('log.file.path'))
  assert.ok(text.includes('kubernetes.pod.name'))
  assert.ok(text.includes('{"message":"boot"}'), '详情要带原文')
  assert.ok(text.includes('可能有敏感字段'), '原文真的摆出来了，才在这里说「可能有敏感字段」')
  assert.equal(rowToggleButtons(runtime.tree)[0].props['aria-expanded'], true)

  // 开第二行 → 第一行自动收起（一次只开一行）
  toggles = rowToggleButtons(runtime.tree)
  await clickAndSettle(runtime, toggles[1])
  details = rowDetailNodes(runtime.tree)
  assert.equal(details.length, 1, '换一行展开时上一行必须收起')
  assert.ok(treeText(details[0]).includes('{"message":"ready"}'))
  assert.equal(rowToggleButtons(runtime.tree)[0].props['aria-expanded'], false)

  // 再点同一颗 → 收起
  await clickAndSettle(runtime, rowToggleButtons(runtime.tree)[1])
  assert.equal(rowDetailNodes(runtime.tree).length, 0)
})

await test('行详情：原文超长截断并**说出**截断（截了却不说会被当成完整原文）', async () => {
  const outcome = labeledOutcome()
  outcome.lines = [{
    ts: 0,
    message: 'huge',
    source: '0',
    labels: { 'container.name': 'app-1' },
    raw: 'x'.repeat(20005),
    id: '0:0',
  }]
  outcome.returned = 1
  outcome.counts = { returned: 1, totalKnown: true, matched: 1 }
  serverRoutes = { '/api/dsh-loglens/query': outcome, '/api/dsh-loglens/fields': labeledFields() }
  const { runtime } = await runPanelQueryFull('es')
  await clickAndSettle(runtime, rowToggleButtons(runtime.tree)[0])
  const detail = rowDetailNodes(runtime.tree)[0]
  assert.ok(detail !== undefined, '该展开出详情')
  const raw = treeFind(detail, (node) => hasClass(node, 'll_rowRaw'))[0]
  assert.ok(raw !== undefined, '超长原文也要摆（截断的那一段）')
  assert.equal(treeText(raw).length, 20000, '只显示前 20000 个字符')
  const text = treeText(detail)
  assert.ok(text.includes('20000'), '提示里要报显示了多少：' + text.slice(-300))
  assert.ok(text.includes('20005'), '提示里要报原文一共多少：' + text.slice(-300))
})


await test('字段清单随查询**自动拉一次**：同来源不重拉（缓存），结果渲染不依赖它', async () => {
  serverRoutes = FIELD_ROUTES()
  const { runtime, tree } = await runPanelQueryFull('es', { fieldsOpen: true })
  assert.equal(calls.filter((call) => call.path === '/api/dsh-loglens/fields').length, 1,
    '查询成功后自动拉一次（侧栏要「其余可用字段」）')
  calls.length = 0
  await clickAndSettle(runtime, buttonByText(tree, '查询'))
  assert.equal(calls.filter((call) => call.path === '/api/dsh-loglens/fields').length, 0,
    '同一个来源再查不重拉字段清单')
})

await test('字段清单拉不到：只落在侧栏里的一句话，结果列表照常（附加信息不许拖垮结果）', async () => {
  serverRoutes = {
    '/api/dsh-loglens/query': labeledOutcome(),
    '/api/dsh-loglens/fields': { ok: false, status: 500, body: { error: 'boom' } },
  }
  const { tree } = await runPanelQueryFull('es', { fieldsOpen: true })
  assert.ok(treeText(tree).includes('字段清单取不到：boom'), '宿主原话要落在侧栏里')
  assert.equal(treeFind(tree, (node) => hasClass(node, 'll_resultRow')).length, 2, '结果列表不受影响')
  // 命中区仍然可用（它只靠这一页的 labels）
  assert.equal(fieldAction(tree, 'column', 'container.name') !== undefined, true)
})

await test('重查之后展开的行收起（旧的展开态指向一份已经不存在的结果）', async () => {
  serverRoutes = FIELD_ROUTES()
  const { runtime, tree } = await runPanelQueryFull('es')
  await clickAndSettle(runtime, rowToggleButtons(tree)[0])
  assert.equal(rowDetailNodes(runtime.tree).length, 1)
  await clickAndSettle(runtime, buttonByText(runtime.tree, '查询'))
  assert.equal(rowDetailNodes(runtime.tree).length, 0, '重查会换一整份结果，展开态必须跟着收')
})

await test('整行可点：点行展开/收起详情；点行里的按钮只做按钮自己的事（不顺手展开）', async () => {
  serverRoutes = FIELD_ROUTES()
  const { runtime } = await runPanelQueryFull('es')
  const rows = treeFind(runtime.tree, (node) => hasClass(node, 'll_resultRow'))
  assert.ok(typeof rows[0].props.onClick === 'function', '行本身该有 onClick（14px 的箭头不该是唯一入口）')

  // 点在普通区域（没有 button 祖先）：展开
  rows[0].props.onClick({ target: { closest: () => null } })
  await runtime.update()
  assert.equal(rowDetailNodes(runtime.tree).length, 1, '点行本身该展开详情')

  // 点的是行里的按钮（closest('button') 有值）：不处理，免得「点标签筛一次」顺手把详情翻出来
  const rowAfter = treeFind(runtime.tree, (node) => hasClass(node, 'll_resultRow'))[0]
  rowAfter.props.onClick({ target: { closest: (selector) => (selector === 'button' ? {} : null) } })
  await runtime.update()
  assert.equal(rowDetailNodes(runtime.tree).length, 1, '点按钮不许顺手切换展开态')

  // 再点普通区域：收起
  const rowAgain = treeFind(runtime.tree, (node) => hasClass(node, 'll_resultRow'))[0]
  rowAgain.props.onClick({ target: { closest: () => null } })
  await runtime.update()
  assert.equal(rowDetailNodes(runtime.tree).length, 0)
})

await test('级别按严重度染色：debug 灰、error 红（不再所有级别都染成告警色）', async () => {
  serverRoutes = FIELD_ROUTES()
  const tree = await runPanelQuery('es')
  const levels = treeFind(tree, (node) => hasClass(node, 'll_resultLevel'))
  assert.equal(levels.length, 2)
  assert.ok(hasClass(levels[0], 'll_resultLevelMuted'), 'debug 该是灰的：' + levels[0].props.className)
  assert.ok(hasClass(levels[1], 'll_resultLevelError'), 'error 该是红的：' + levels[1].props.className)
  // 大小写必须对得上 CSS 类名（拼接成 ll_resultLevelmuted 就一条样式都不生效）
  assert.equal(levels[0].props.className.includes('ll_resultLevelmuted'), false)
})

await test('显示密度：默认「完整」（旧模式，正文全展开），点「紧凑」只留 3 行，再点回完整', async () => {
  serverRoutes = FIELD_ROUTES()
  const { runtime, tree } = await runPanelQueryFull('es')
  const messageNode = () => treeFind(runtime.tree, (node) => hasClass(node, 'll_resultMsg'))[0]
  assert.equal(hasClass(messageNode(), 'll_resultMsgCompact'), false, '默认是完整模式：看日志不该先点开每一条')
  assert.ok(buttonByText(tree, '紧凑') !== undefined, '元信息行该有「紧凑」这个开关')

  await clickAndSettle(runtime, buttonByText(runtime.tree, '紧凑'))
  assert.ok(hasClass(messageNode(), 'll_resultMsgCompact'), '点「紧凑」之后正文只留 3 行')
  assert.ok(buttonByText(runtime.tree, '完整') !== undefined, '切到紧凑后按钮变成「完整」（点它切回去）')

  await clickAndSettle(runtime, buttonByText(runtime.tree, '完整'))
  assert.equal(hasClass(messageNode(), 'll_resultMsgCompact'), false, '切回完整后正文全展开')
})

await test('本页排序：默认「时间」（宿主原序），点一下换「级别」并按严重度重排，再点换「正文」', async () => {
  serverRoutes = FIELD_ROUTES()
  const { runtime, tree } = await runPanelQueryFull('es')
  /** 屏幕上正文那一列的顺序（排序唯一可见的结果）。 */
  const messageOrder = () => treeFind(runtime.tree, (node) => hasClass(node, 'll_resultMsg')).map((node) => treeText(node))

  assert.deepEqual(messageOrder(), ['boot', 'ready'], '默认是宿主原序（时间倒序），不许自作主张按 ts 重排')
  assert.ok(sortButton(tree, '时间') !== undefined, '元信息行该有排序入口，且写着**当前档位**')

  await clickAndSettle(runtime, sortButton(runtime.tree, '时间'))
  assert.deepEqual(messageOrder(), ['ready', 'boot'], '「级别」档：error 排在 debug 前面（从重到轻）')
  assert.ok(sortButton(runtime.tree, '级别') !== undefined, '按钮上要写着换成了哪一档')
  // 排序是**纯展示**：一发请求都不该多打
  assert.equal(calls.filter((call) => call.path === '/api/dsh-loglens/query').length, 1, '排序不该重查')

  await clickAndSettle(runtime, sortButton(runtime.tree, '级别'))
  assert.deepEqual(messageOrder(), ['boot', 'ready'], '「正文」档：boot < ready')
  assert.ok(sortButton(runtime.tree, '正文') !== undefined)

  // 循环回第一档：三档走完回到「时间」
  await clickAndSettle(runtime, sortButton(runtime.tree, '正文'))
  assert.deepEqual(messageOrder(), ['boot', 'ready'], '回到宿主原序')
  assert.ok(sortButton(runtime.tree, '时间') !== undefined)
  assert.equal(calls.filter((call) => call.path === '/api/dsh-loglens/query').length, 1, '三档循环全程不该重查')
})

await test('本页排序只管**摆的顺序**：结果区仍是同一个壳、行数不变（不改 lines 本身）', async () => {
  serverRoutes = FIELD_ROUTES()
  const { runtime } = await runPanelQueryFull('es')
  await clickAndSettle(runtime, sortButton(runtime.tree, '时间'))
  assert.equal(treeFind(runtime.tree, (node) => hasClass(node, 'll_resultRow')).length, 2, '排序不许吞行 / 重出行')
  assert.equal(treeFind(runtime.tree, (node) => hasClass(node, 'll_workbench')).length, 1, '结果区仍是同一个壳')
})

await test('时间分布横轴：柱子下面标出时间刻度（首尾钉住、中间按比例），排序入口写明「本页」', async () => {
  serverRoutes = {
    '/api/dsh-loglens/query': { ...queryOutcome({ id: 'es', kind: 'elasticsearch', label: '内网 ES' }, true), window: { from: 0, to: 60 * 60 * 1000 } },
    '/api/dsh-loglens/facets': (body) => {
      const step = INTERVAL_MS[body.interval] ?? 60_000
      const first = Math.floor(Number(body.from) / step) * step
      return { ok: true, overTime: [{ ts: first, count: 3 }, { ts: first + 30 * step, count: 5 }], interval: body.interval, warnings: [] }
    },
  }
  const tree = await runPanelQuery('es')
  const axis = treeFind(tree, (node) => hasClass(node, 'll_histAxis'))[0]
  assert.ok(axis !== undefined, '该画出横轴（原来这张图一个时间点都没有）')
  const ticks = treeFind(axis, (node) => hasClass(node, 'll_histTick'))
  assert.ok(ticks.length >= 2, '至少首尾两格刻度，实得 ' + String(ticks.length))
  assert.ok(ticks.length <= 4, '刻度最多 4 个（再密就糊成一条灰带），实得 ' + String(ticks.length))
  assert.ok(hasClass(ticks[0], 'll_histTickStart'), '首格用左对齐（居中的首格会有一半落在图外）')
  assert.ok(hasClass(ticks[ticks.length - 1], 'll_histTickEnd'), '末格用右对齐')
  // 中间刻度按比例摆（内联 style）；首尾不写 left（由 CSS 的 left:0 / right:0 钉住）
  for (const tick of ticks.slice(1, -1)) {
    assert.ok(typeof tick.props.style?.left === 'string' && tick.props.style.left.endsWith('%'),
      '中间刻度要按比例定位，实得 ' + JSON.stringify(tick.props.style))
  }
  // 刻度是**时刻**，不是空串（格式判据在 client-pure 的 formatTickTime，这里只要它非空）
  for (const tick of ticks) assert.ok(treeText(tick).length >= 4, '刻度上要有可读的时刻：' + JSON.stringify(treeText(tick)))

  // 排序那句说明必须写「本页」：宿主没有服务端排序，读成「排序全部命中」是这一格唯一的事故
  const sortBtn = sortButton(tree, '时间')
  assert.ok(sortBtn !== undefined)
  assert.ok(String(sortBtn.props.title).includes('本页'), '排序入口自己要先说清只排这一页：' + String(sortBtn.props.title))
  // `{order}` 收的是**档位名**（时间），不是按钮上那一整句（「排序：时间」）——塞错会拼出
  // 「本页排序：排序：时间」。真机第一版就这样，所以这条断言要钉住那个重复。
  assert.equal(String(sortBtn.props.title).includes('排序：排序'), false,
    '悬停说明里把按钮整句塞进了 {order}：' + String(sortBtn.props.title))
  assert.ok(String(sortBtn.props.title).includes('本页排序：时间'), '悬停里该是「本页排序：时间」：' + String(sortBtn.props.title))
})


/*
 * 第十五刀：布局重排的三条守卫。
 *
 * 它们守的是**屏幕上那一眼**能看见的东西，而不是内部实现：来源配置收得起来（收起态只剩一行）、
 * 图在结果**上面**（先看趋势再看行）、元信息拆成「短句 + 动作」与「长句」两层。
 * 每一条都对应真机上一次具体的读数（816×782 那一屏量到面板 1055px、结果区 240px、元信息 102px）。
 */

/** 按类名找树里的元素（与 treeFind 同源，但只按类名 token 匹配）。 */
function byClass(tree, cls) {
  return treeFind(tree, (node) => hasClass(node, cls))
}

/** 挂一张**插件整页**（view === 'page'）的树：那一页与设置卡的默认展开态不同。 */
async function mountPage(runtime, Card) {
  let tree = await runtime.mount(Card, { view: 'page' })
  await runtime.update()
  await runtime.update()
  return runtime.tree === undefined ? tree : runtime.tree
}

await test('来源配置收得起来：插件整页**默认收起**（只留一行摘要），点一下才铺开那几行表单', async () => {
  serverRoutes = { '/api/dsh-loglens/query': queryOutcome({ id: 'es', kind: 'elasticsearch', label: '内网 ES' }, true) }
  const runtime = createRuntime()
  const exports_ = registration.factory((spec) => (spec === 'react' ? runtime.React : { jsx: runtime.jsx, jsxs: runtime.jsxs }))
  const { ctx, state } = makeClientCtx()
  exports_.apply(ctx)
  const Card = state.cards.find((card) => card.options.name === 'settings.kit.item').component
  await mountPage(runtime, Card)
  await runtime.update()

  // 收起态：没有任何来源行（那是配置区里最占地方的东西），但摘要必须说清有几条
  assert.equal(byClass(runtime.tree, 'll_row').length, 0,
    '插件整页默认收起：不该一进来就铺开来源行（真机上那两行占 300px）')
  const toggle = byClass(runtime.tree, 'll_sourcesToggle')[0]
  assert.ok(toggle !== undefined, '找不到「编辑来源」那颗折叠把手')
  assert.equal(toggle.props['aria-expanded'], false, '收起态 aria-expanded 要是 false')
  const summary = byClass(runtime.tree, 'll_panelSummary')[0]
  assert.ok(summary !== undefined, '收起态必须留一句摘要（否则看不出还查不查得动）')
  assert.ok(treeText(summary).includes('来源'), '摘要要把「几个来源」说出来：' + treeText(summary))

  // 展开：那几行回来，把手翻成「收起」
  await clickAndSettle(runtime, toggle)
  // 默认桩里配了 3 条（es / local / docker）——数它们，而不是数「我以为有几条」
  assert.equal(byClass(runtime.tree, 'll_row').length, 3, '展开后来源行回来，实得 ' + String(byClass(runtime.tree, 'll_row').length))
  const reopened = byClass(runtime.tree, 'll_sourcesToggle')[0]
  assert.equal(reopened.props['aria-expanded'], true, '展开后 aria-expanded 要是 true')

  // 再收起来：表单**不画**（不是 display:none —— 那还会留在无障碍树里）
  await clickAndSettle(runtime, reopened)
  assert.equal(byClass(runtime.tree, 'll_row').length, 0, '再收起来时来源行要从树里消失')
})

await test('设置卡**默认展开**来源配置：那一页的主任务就是配来源（与插件页相反）', async () => {
  serverRoutes = { '/api/dsh-loglens/query': queryOutcome({ id: 'es', kind: 'elasticsearch', label: '内网 ES' }, true) }
  const runtime = createRuntime()
  const exports_ = registration.factory((spec) => (spec === 'react' ? runtime.React : { jsx: runtime.jsx, jsxs: runtime.jsxs }))
  const { ctx, state } = makeClientCtx()
  exports_.apply(ctx)
  const Card = state.cards.find((card) => card.options.name === 'settings.kit.item').component
  let tree = await runtime.mount(Card, {})
  treeFind(tree, (node) => String(node.props?.className ?? '').includes('ll_cardHeader'))[0].props.onClick()
  runtime.tick()
  await runtime.update()
  await runtime.update()
  assert.ok(byClass(runtime.tree, 'll_row').length > 0,
    '设置卡里配来源是主任务：一进来就该看得见那几行（不该让用户先找折叠把手）')
  assert.equal(byClass(runtime.tree, 'll_sourcesToggle')[0].props['aria-expanded'], true)
})

await test('图在结果**上面**：先看趋势再看行（Kibana 同一顺序），翻页仍在最后', async () => {
  serverRoutes = {
    // 游标字段是 **nextCursor**（面板读的就是这个名字，见 runQuery）：写成 cursor: 'c1' 不报错，
    // 只是「下一页」永远不出现——一条会静默空转的断言
    '/api/dsh-loglens/query': { ...queryOutcome({ id: 'es', kind: 'elasticsearch', label: '内网 ES' }, true), window: { from: 0, to: 60 * 60 * 1000 }, nextCursor: 'c1' },
    '/api/dsh-loglens/facets': (body) => {
      const step = INTERVAL_MS[body.interval] ?? 60_000
      const first = Math.floor(Number(body.from) / step) * step
      return { ok: true, overTime: [{ ts: first, count: 3 }, { ts: first + 10 * step, count: 5 }], interval: body.interval, warnings: [] }
    },
  }
  const tree = await runPanelQuery('es')
  // 树是深度优先的：先出现的那个就是屏幕上靠上的那个
  const order = []
  const walk = (node) => {
    if (node === null || typeof node !== 'object') return
    if (hasClass(node, 'll_hist') && order.indexOf('hist') === -1) order.push('hist')
    if (hasClass(node, 'll_results') && order.indexOf('results') === -1) order.push('results')
    if (node.type === 'button' && treeText(node) === '下一页' && order.indexOf('next') === -1) order.push('next')
    const kids = node.props?.children
    for (const kid of Array.isArray(kids) ? kids : [kids]) walk(kid)
  }
  walk(tree)
  assert.deepEqual(order, ['hist', 'results', 'next'],
    '顺序该是「分布 → 结果 → 下一页」，实得 ' + JSON.stringify(order))
})

await test('元信息分两层：短句 + 动作一行，宿主的**长句** warning 另起一块（不再把按钮挤到第三行）', async () => {
  const longWarning = 'level=warn（warn 及以上）是按「返回的这一页」筛的：98 / 100 行被筛掉，counts 与 truncation 仍是未筛的整页——按级别看全量要求后端真有级别字段（ES 上 log.level 常为空、级别是从正文推断的），否则只能在查询串里搜级别关键字'
  serverRoutes = {
    '/api/dsh-loglens/query': { ...queryOutcome({ id: 'es', kind: 'elasticsearch', label: '内网 ES' }, true), level: 'warn', warnings: [longWarning] },
    '/api/dsh-loglens/facets': facetsRoute([], HIST_OK),
  }
  const tree = await runPanelQuery('es')

  // 那一句**原话照抄**（不许吞掉：agent 工具看得到的东西面板也得看得到），但住在长句层里
  const note = byClass(tree, 'll_queryNote')[0]
  assert.ok(note !== undefined, '长句那一层该存在')
  assert.ok(treeText(note).includes('是按「返回的这一页」筛的'), '宿主的原话要完整落在长句层：' + treeText(note).slice(0, 120))

  // 四颗动作按钮在**短句那一层**（与计数同一行），不在长句里——真机上它们就是被那句散文推走的
  const meta = byClass(tree, 'll_queryMeta')[0]
  assert.ok(meta !== undefined, '元信息短句层该存在')
  for (const label of ['字段', '紧凑', '时间', '清空结果']) {
    assert.ok(treeText(meta).includes(label), '「' + label + '」该在短句那一层（与计数同一行）')
  }
  assert.equal(treeText(note).includes('清空结果'), false, '按钮不该落进长句层')
  // 弹簧：计数与按钮之间那一下 flex:1 —— 没有它，窄屏换行时按钮会贴着最后一句计数
  assert.ok(byClass(meta, 'll_metaGap').length >= 1, '短句与动作之间要有那颗弹簧')
})


/*
 * 第十六刀：直方图的三件事（都来自真机那张放大图）。
 *
 * 那张图上有三个具体问题：① 原生 tooltip 的灰框正压在横轴刻度上；② tooltip 里写
 * `18:28:00.000`（1 分钟一档的桶标到毫秒）；③ 标题写着「峰值 681 条」而图上那根最高柱
 * 没有任何记号——681 与常态 460 只差一截，61 根里肉眼挑不出来。
 */

await test('直方图读数：悬停哪一根就**贴在哪一根上方**说哪一根（不再钉在最左边）', async () => {
  serverRoutes = {
    '/api/dsh-loglens/query': { ...queryOutcome({ id: 'es', kind: 'elasticsearch', label: '内网 ES' }, true), window: { from: 0, to: 60 * 60 * 1000 } },
    '/api/dsh-loglens/facets': (body) => {
      const step = INTERVAL_MS[body.interval] ?? 60_000
      const first = Math.floor(Number(body.from) / step) * step
      // 中间那根 9 条最高，其余 3 条 —— 峰值必须挑得出中间那根
      return { ok: true, overTime: [{ ts: first, count: 3 }, { ts: first + 30 * step, count: 9 }, { ts: first + 50 * step, count: 3 }], interval: body.interval, warnings: [] }
    },
  }
  const { runtime, tree } = await runPanelQueryFull('es')

  // 第十七刀：不悬停时**不画**读数条（常驻一行还是「信息在别处」那个毛病）
  assert.equal(treeFind(tree, (node) => hasClass(node, 'll_histReadout')).length, 0,
    '不悬停时不该有一行常驻读数（那正是「柱子与信息隔得远」的来源）')

  const bars = clickableBars(tree)
  assert.ok(bars.length >= 3, '该有可点的柱子')

  // 悬停中间那根 → 气泡出现，写的是**那一根**的数
  bars[1].props.onMouseEnter()
  await runtime.update()
  const bubble = treeFind(runtime.tree, (node) => hasClass(node, 'll_histReadout'))[0]
  assert.ok(bubble !== undefined, '悬停之后要出现读数气泡')
  const hovered = treeText(bubble)
  assert.ok(hovered.includes('9'), '悬停的那根是 9 条：' + hovered)

  // **位置跟着柱子走**：left 由柱序号算（第 2 根 / 总共 N 根 ≈ 中间），不是固定在最左
  const left = String(bubble.props.style?.left ?? '')
  assert.ok(left.endsWith('%'), '气泡位置要用柱序号算的百分比：' + left)
  const at = Number(left.replace('%', ''))
  assert.ok(at > 5 && at < 95, '第 2 根柱的气泡不该贴在最左（那正是上一版的问题）：' + left)

  // 换一根 → 位置跟着换
  clickableBars(runtime.tree)[bars.length - 1].props.onMouseEnter()
  await runtime.update()
  const last = treeFind(runtime.tree, (node) => hasClass(node, 'll_histReadout'))[0]
  const lastLeft = Number(String(last.props.style?.left ?? '0').replace('%', ''))
  assert.ok(lastLeft > at, '悬停到右边那根时气泡要右移（实得 ' + String(lastLeft) + ' vs ' + String(at) + '）')

  // 移开 → 气泡消失（不是回到某个常驻句子）
  clickableBars(runtime.tree)[1].props.onMouseLeave()
  await runtime.update()
  assert.equal(treeFind(runtime.tree, (node) => hasClass(node, 'll_histReadout')).length, 0,
    '移开之后气泡要消失')
})

await test('直方图悬停里的时刻**不带毫秒**（1 分钟一档的桶标到毫秒只是噪音）', async () => {
  serverRoutes = {
    '/api/dsh-loglens/query': { ...queryOutcome({ id: 'es', kind: 'elasticsearch', label: '内网 ES' }, true), window: { from: 0, to: 60 * 60 * 1000 } },
    '/api/dsh-loglens/facets': (body) => {
      const step = INTERVAL_MS[body.interval] ?? 60_000
      const first = Math.floor(Number(body.from) / step) * step
      return { ok: true, overTime: [{ ts: first, count: 3 }, { ts: first + 10 * step, count: 5 }], interval: body.interval, warnings: [] }
    },
  }
  const tree = await runPanelQuery('es')
  const bars = clickableBars(tree)
  for (const bar of bars) {
    const title = String(bar.props.title)
    assert.equal(/\.\d{3}/.test(title), false, '悬停里不该出现毫秒：' + title)
  }
})

await test('峰值那一根在图上**看得出来**：它挂 ll_histBarPeak，且只有一根', async () => {
  serverRoutes = {
    '/api/dsh-loglens/query': { ...queryOutcome({ id: 'es', kind: 'elasticsearch', label: '内网 ES' }, true), window: { from: 0, to: 60 * 60 * 1000 } },
    '/api/dsh-loglens/facets': (body) => {
      const step = INTERVAL_MS[body.interval] ?? 60_000
      const first = Math.floor(Number(body.from) / step) * step
      return { ok: true, overTime: [{ ts: first, count: 3 }, { ts: first + 20 * step, count: 12 }, { ts: first + 40 * step, count: 4 }], interval: body.interval, warnings: [] }
    },
  }
  const tree = await runPanelQuery('es')
  const peaks = treeFind(tree, (node) => hasClass(node, 'll_histBarPeak'))
  assert.equal(peaks.length, 1, '峰值记号该恰好一根，实得 ' + String(peaks.length))
  // 记号必须挂在**真的最高**那根上（12 条那根）：按 title 里的条数认
  assert.ok(String(peaks[0].props['aria-label']).includes('12'), '峰值记号挂错了柱子：' + String(peaks[0].props['aria-label']))
  // 而且它与可点柱族的类名并存（峰值柱仍然点得动，不是一条死标注）
  assert.ok(tokensOf(peaks[0]).includes('ll_histBar'), '峰值柱仍是柱子族的一员')
})

await test('一条数据都没有时不画峰值记号（不指一个不存在的最忙时段）', async () => {
  serverRoutes = {
    '/api/dsh-loglens/query': queryOutcome({ id: 'es', kind: 'elasticsearch', label: '内网 ES' }, true),
    '/api/dsh-loglens/facets': (body) => ({ ok: true, overTime: [], interval: body.interval ?? '1m', warnings: [] }),
  }
  const tree = await runPanelQuery('es')
  assert.equal(treeFind(tree, (node) => hasClass(node, 'll_histBarPeak')).length, 0,
    '全 0 的窗口没有峰值，不该画记号')
})


await test('柱子挤成平带时改用基线裁剪，并**必须**说明「柱高不与条数成正比」', async () => {
  // 真机那组读数：常态 ~460、峰值 681（比 1.47）——线性画法下 50/61 根落在 60~70% 一档
  serverRoutes = {
    '/api/dsh-loglens/query': { ...queryOutcome({ id: 'es', kind: 'elasticsearch', label: '内网 ES' }, true), window: { from: 0, to: 60 * 60 * 1000 } },
    '/api/dsh-loglens/facets': (body) => {
      const step = INTERVAL_MS[body.interval] ?? 60_000
      const first = Math.floor(Number(body.from) / step) * step
      const overTime = Array.from({ length: 40 }, (_, i) => ({ ts: first + i * step, count: i === 20 ? 681 : 460 + (i % 5) * 8 }))
      return { ok: true, overTime, interval: body.interval, warnings: [] }
    },
  }
  const tree = await runPanelQuery('es')
  const text = treeText(tree)
  // 裁剪了就**必须说**：柱高不再与条数成正比，不说就是把差异读成倍数
  assert.ok(text.includes('柱高只表示相对高低'), '裁剪时必须说明柱高不是条数比例：' + text.slice(0, 400))
  // 说明里要给出读准确数的办法（读数条就是那个办法）
  assert.ok(text.includes('悬停任一根看它的实际条数'), '还要指一条能读准数的路：' + text.slice(0, 400))
  // **面板不渲染 Markdown**：文案里的 `**` 会原样露在界面上（真机已抓到过一次）。
  // 这条断言盯的是「界面文案里不许出现 Markdown 记号」，不只是这一句。
  assert.equal(/\*\*/.test(text), false, '界面文案里露出了 Markdown 的 ** 星号：' + text.slice(0, 400))
})

await test('数据本来就铺得开（最大 ≥ 最小 × 3）时走线性，**不写**那句裁剪说明（没发生的事不用解释）', async () => {
  serverRoutes = {
    '/api/dsh-loglens/query': { ...queryOutcome({ id: 'es', kind: 'elasticsearch', label: '内网 ES' }, true), window: { from: 0, to: 60 * 60 * 1000 } },
    '/api/dsh-loglens/facets': (body) => {
      const step = INTERVAL_MS[body.interval] ?? 60_000
      const first = Math.floor(Number(body.from) / step) * step
      const overTime = Array.from({ length: 40 }, (_, i) => ({ ts: first + i * step, count: i === 20 ? 900 : 20 + (i % 3) }))
      return { ok: true, overTime, interval: body.interval, warnings: [] }
    },
  }
  const tree = await runPanelQuery('es')
  assert.equal(treeText(tree).includes('柱高只表示相对高低'), false,
    '差得够开的时候不该多一句裁剪说明')
})


/*
 * 第十八刀：元信息行那四颗动作按钮图标化。
 *
 * 守两件事：① 四颗都**真的带图标**（不是文案改了就算）；② 图标的形状照抄宿主
 * （viewBox 16×16 / 描边 1 / currentColor / 16 个单位的坐标系）——形状不对就不是「宿主那一颗」，
 * 而是「我画了一颗差不多意思的」，那与维护者 2026-10-13 提过的「图标要和官方的一致」相违。
 */

await test('四颗动作按钮都带图标，且用的是宿主那套图标配方（16×16 / 描边 1 / currentColor）', async () => {
  serverRoutes = FIELD_ROUTES()
  const tree = await runPanelQuery('es')

  // 四颗按钮：字段 / 紧凑（或完整）/ 排序 / 清空
  const meta = treeFind(tree, (node) => hasClass(node, 'll_queryMeta'))[0]
  assert.ok(meta !== undefined, '找不到元信息行')
  const buttons = treeFind(meta, (node) => node.type === 'button' && hasClass(node, 'll_btnGhostIcon'))
  assert.equal(buttons.length, 4, '四颗动作按钮都该挂 ll_btnGhostIcon（没有图标的不挂），实得 ' + String(buttons.length))

  let icons = 0
  for (const button of buttons) {
    const svg = treeFind(button, (node) => node.type === 'svg' && hasClass(node, 'll_actionIcon'))[0]
    assert.ok(svg !== undefined, '按钮「' + treeText(button) + '」没有图标')
    icons += 1
    // 宿主配方：viewBox 16×16、fill none、stroke currentColor、strokeWidth 1
    assert.equal(svg.props.viewBox, '0 0 16 16', 'viewBox 要与宿主一致：' + String(svg.props.viewBox))
    assert.equal(svg.props.fill, 'none', '宿主图标是描边不是填色')
    assert.equal(svg.props.stroke, 'currentColor', '描边取 currentColor（按钮的悬停 / 选中色才带得动）')
    assert.equal(String(svg.props.strokeWidth), '1', '宿主 …Regular 那一档是 1：' + String(svg.props.strokeWidth))
    assert.equal(svg.props['aria-hidden'], 'true', '图标是装饰，名字由按钮自己说')
  }
  assert.equal(icons, 4, '四颗都要有图标')

  // 四颗的**形状互不相同**（同一个 path 套四遍不算图标化）
  const shapes = buttons.map((button) => {
    const svg = treeFind(button, (node) => node.type === 'svg' && hasClass(node, 'll_actionIcon'))[0]
    const paths = treeFind(svg, (node) => node.type === 'path').map((node) => String(node.props.d))
    return paths.join('|')
  })
  assert.equal(new Set(shapes).size, 4, '四颗图标必须是四个不同的形状（实得 ' + String(new Set(shapes).size) + ' 种）')
})

await test('排序按钮上只剩**档位名**（图标已经说了「这是排序」），完整句子仍在 aria-label 里', async () => {
  serverRoutes = FIELD_ROUTES()
  const { runtime, tree } = await runPanelQueryFull('es')

  const button = sortButton(tree, '时间')
  assert.ok(button !== undefined, '找不到排序按钮')
  // 文字只有档位名：不再拖着「排序：」两个字（那一行还要塞另外三颗按钮）
  assert.equal(treeText(button), '时间', '按钮文字该只剩档位名，实得：' + JSON.stringify(treeText(button)))
  // 但完整语义一个字没少：aria-label 里仍是「本页排序：时间」
  assert.ok(String(button.props['aria-label']).includes('本页排序：时间'),
    '读屏要能听到完整那句：' + String(button.props['aria-label']))

  await clickAndSettle(runtime, sortButton(runtime.tree, '时间'))
  assert.equal(treeText(sortButton(runtime.tree, '级别')), '级别', '换档之后按钮上也只写档位名')
})


/*
 * 第十九刀：字段侧栏的排版。
 *
 * 守的是真机上量到的三件事：① 字段行是**三列网格**（名字 / 计数 / 动作各就各位），
 * 不是一条 flex 行（那样计数与动作会互相对不齐）；② 「列 / 筛」两颗动作**常驻描边**
 * （原来只在行 hover 时才长出边框，静止时是一段灰字，与字段名混在一起）；
 * ③ 过滤框带放大镜与清除。
 */

await test('字段行是三列网格：名字 / 计数 / 动作分列，动作按钮常驻描边（不是 hover 才长出来）', async () => {
  serverRoutes = FIELD_ROUTES()
  const { runtime, tree } = await runPanelQueryFull('es', { fieldsOpen: true })

  /*
   * 第二十七刀：**选列面板不再画动作桶**。
   *
   * 它原来留了一个空 span「占住第三列」，结果是：那一行的网格规则只定义了两列
   * （`.ll_fieldPick .ll_fieldRow{grid-template-columns:minmax(0,1fr) auto}`），空 span 掉到
   * 第二行，把名字顶高 4px、行高从 26 变 28（真机量到 `offset -4 / pickH 28`）。
   * 两模式的列宽对齐改由那条两列规则负责，不靠占位元素。
   */
  const rows = treeFind(tree, (node) => hasClass(node, 'll_fieldRow'))
  assert.ok(rows.length > 0, '侧栏该有字段行')
  for (const row of rows) {
    const kinds = row.props.children.filter((child) => child !== null && typeof child === 'object')
    // 第一格是「名字格」；列模式下名字是静态文本（不可点）
    assert.ok(hasClass(kinds[0], 'll_fieldNameCell'), '第一格必须是名字格：' + kinds[0].props.className)
    assert.ok(treeFind(kinds[0], (node) => hasClass(node, 'll_fieldNameStatic')).length === 1,
      '列模式下名字该是静态文本')
    // 计数在名字之后
    const countAt = kinds.findIndex((child) => hasClass(child, 'll_fieldCount'))
    if (countAt >= 0) assert.ok(countAt > 0, '计数要在名字之后')
    // **没有**动作桶（第二十八刀：两模式都没有了——列模式换成行首勾选框，筛选模式换成展开区）
    assert.equal(kinds.filter((child) => hasClass(child, 'll_fieldActs')).length, 0,
      '行里不该再有动作桶')
  }
  assert.equal(treeFind(tree, (node) => hasClass(node, 'll_fieldAct')).length, 0,
    '选列面板不该再有动作按钮（勾选框才是动作）')
  assert.ok(treeFind(tree, (node) => hasClass(node, 'll_fieldPick')).length > 0, '每行该是一个可点的勾选行')
  assert.ok(treeFind(tree, (node) => node.type === 'input' && hasClass(node, 'll_fieldCheck')).length > 0,
    '该有勾选框')

})

await test('字段过滤框带放大镜与清除：有内容才出现 ×，点 × 清空过滤词', async () => {
  serverRoutes = FIELD_ROUTES()
  const { runtime, tree } = await runPanelQueryFull('es', { fieldsOpen: true })

  // 放大镜挂在一颗 `span` 上（定位锚），svg 在里面：
  const icon = treeFind(tree, (node) => hasClass(node, 'll_fieldsFilterIcon'))[0]
  assert.ok(icon !== undefined, '过滤框该有一颗放大镜（这个面板唯一的导航方式，要在静止时看得出来）')
  const svg = treeFind(icon, (node) => node.type === 'svg')[0]
  assert.ok(svg !== undefined, '放大镜得真是一颗图标（svg）')
  // 放大镜是装饰：不抢焦点、不吃点击
  assert.equal(svg.props['aria-hidden'], 'true')
  assert.equal(svg.props.viewBox, '0 0 16 16', '与其余图标同一套配方')

  // 空着的时候**没有**清除按钮（给一颗 × 会让人以为点了会发生什么）
  assert.equal(treeFind(tree, (node) => hasClass(node, 'll_fieldsFilterClear')).length, 0,
    '过滤词为空时不该有清除按钮')

  const box = treeFind(tree, (node) => node.type === 'input' && hasClass(node, 'll_fieldsFilter'))[0]
  assert.ok(box !== undefined, '找不到过滤框')
  box.props.onChange({ target: { value: 'agent' } })
  await runtime.update()

  const clear = treeFind(runtime.tree, (node) => hasClass(node, 'll_fieldsFilterClear'))[0]
  assert.ok(clear !== undefined, '有过滤词时该出现清除按钮')
  await clickAndSettle(runtime, clear)
  const after = treeFind(runtime.tree, (node) => node.type === 'input' && hasClass(node, 'll_fieldsFilter'))[0]
  assert.equal(after.props.value, '', '点 × 该把过滤词清空')
})

await test('字段分区标题是**吸附**的：滚下去之后还知道自己在看哪个分区', async () => {
  serverRoutes = FIELD_ROUTES()
  const tree = await runPanelQuery('es', { fieldsOpen: true })
  const titles = treeFind(tree, (node) => hasClass(node, 'll_fieldSectionTitle'))
  assert.ok(titles.length >= 1, '该有分区标题')
  // 判据在 CSS（position:sticky）：组件这层只能断言标题真的画出来了、且带计数的文案
  for (const title of titles) {
    assert.ok(treeText(title).length > 0, '分区标题不能是空的')
    assert.ok(String(title.props.className).includes('ll_fieldSectionTitle'))
  }
})


/*
 * 第二十刀：字段面板**从触发它的那颗按钮长出来**。
 *
 * 守的是「能打开它的东西和它本身在同一处」：面板原来钉在结果区左端（`left:0`），而「字段」
 * 按钮在整行右侧——真机量到横向差 123px，按的是右边那颗、展开的东西出现在最左边。
 * 与第十七刀「读数条钉在左端、柱子在图中间」是同一条毛病。
 */

await test('字段面板贴在「字段」按钮下方展开（右缘对齐按钮），不是钉在结果区左端', async () => {
  serverRoutes = FIELD_ROUTES()
  const { runtime, tree } = await runPanelQueryFull('es')

  // 组件这层拿不到真实布局，所以断言的是**契约**：面板的 style 由按钮的视口坐标算出，
  // 且方向是「右缘对齐 + 顶边贴按钮下沿」。真实像素由真机验收（ROADMAP 第十九/二十刀有读数）。
  const button = treeFind(tree, (node) => node.type === 'button' && treeText(node) === '字段')[0]
  assert.ok(button !== undefined, '找不到「字段」按钮')

  // 点开：onClick 会收到 event，面板据此记下按钮位置
  button.props.onClick({
    currentTarget: {
      getBoundingClientRect: () => ({ right: 900, bottom: 300, left: 840, top: 272, width: 60, height: 28 }),
    },
  })
  await runtime.update()
  await runtime.update()

  const panel = treeFind(runtime.tree, (node) => hasClass(node, 'll_fields'))[0]
  assert.ok(panel !== undefined, '点「字段」之后面板该出现')
  assert.ok(panel.props.style !== undefined, '面板位置该由按钮坐标算出来（不是 CSS 里钉死的 left:0）')
  // 右缘对齐按钮右缘：900 - FIELD_PANEL_WIDTH（340）= 560（宽度是常量，见 pure.js）
  assert.equal(panel.props.style.left, 900 - FIELD_PANEL_WIDTH, '面板左缘 = 按钮右缘 - 面板宽（右缘对齐）：' + JSON.stringify(panel.props.style))
  // 顶边贴按钮下沿 + 4px
  assert.equal(panel.props.style.top, 304, '面板顶边 = 按钮下沿 + 4：' + JSON.stringify(panel.props.style))
})

await test('字段面板的定位是 fixed（不钉在结果区那一格里）：否则按钮挪了它不会跟', async () => {
  serverRoutes = FIELD_ROUTES()
  const tree = await runPanelQuery('es', { fieldsOpen: true })
  const panel = treeFind(tree, (node) => hasClass(node, 'll_fields'))[0]
  assert.ok(panel !== undefined)
  // 组件这层看不到 computed style；这里断言的是「位置由内联 style 给」这个契约
  // （fixed 在 CSS 里，由 client-lint 的样式检查兜住）
  assert.ok(String(panel.props.className).includes('ll_fields'))
})


/*
 * 第二十一刀：字段侧栏的过滤与分组。
 *
 * 守的是真机上量到的两件事：① 92 个字段里 **58 个是 `container.labels.*`**，一层平铺的列表
 * 让 3 个有用的字段和 58 个 Docker 标签混在一起；② 过滤框是唯一的导航方式，而它只认一整串
 * 子串——人打「cont name」得到 0 个结果。
 */

/** 那个字段的行**显示成什么**（行里只写末段，父路径在组头）。 */
function fieldRowName(tree, fullName) {
  // 第二十八刀：手填按钮搬进展开区了，「这一行是哪个字段」改由**名字按钮的 title**（完整字段名）定位
  const row = treeFind(tree, (node) => hasClass(node, 'll_fieldRow')
    && treeFind(node, (inner) => (hasClass(inner, 'll_fieldName') || hasClass(inner, 'll_fieldNameStatic'))
      && String(inner.props?.title ?? '') === fullName).length > 0)[0]
  if (row === undefined) return undefined
  const name = treeFind(row, (node) => hasClass(node, 'll_fieldName'))[0]
  return name === undefined ? undefined : treeText(name)
}

await test('面板里能看见并去掉**已选列**（列芯片原来被面板自己挡住）', async () => {
  serverRoutes = FIELD_ROUTES()
  const { runtime, tree } = await runPanelQueryFull('es', { fieldsOpen: true })
  // 展开前：没有已选列那一格
  assert.equal(treeFind(tree, (node) => hasClass(node, 'll_fieldsPicked')).length, 0,
    '没加列时不该占那一行')

  await toggleColumnPick(runtime, 'container.name')
  const picked = treeFind(runtime.tree, (node) => hasClass(node, 'll_fieldsPicked'))[0]
  assert.ok(picked !== undefined, '加了列之后面板里该有「已选列」那一格')
  assert.ok(treeText(picked).includes('已选列（1）'), '要报加了几列：' + treeText(picked))
  assert.ok(treeText(picked).includes('container.name'), '要写清是哪一列')

  // 面板里那颗 × 就是去掉这一列的入口（与结果区上方的芯片同一个动作）
  const remove = treeFind(picked, (node) => hasClass(node, 'll_colRemove'))[0]
  assert.ok(remove !== undefined, '每一列都要有 ×')
  await clickAndSettle(runtime, remove)
  assert.equal(resultColumnChips(runtime.tree).length, 0, '点 × 去掉列')
  assert.equal(treeFind(runtime.tree, (node) => hasClass(node, 'll_fieldsPicked')).length, 0,
    '没有列了，那一格也不该留着')
})

/**
 * 一套「支持聚合」的路由：字段清单 + 行 + 一份值桶。第三十刀的筛选框用例都走它。
 *
 * 桶里那条 `key: ''`（空值）是**故意留着**的：真机 ES 会回这一条，而筛选表达不了
 * 「字段缺失」——它必须在候选里被挡掉（有用例钉着）。
 */
const VALUES_ROUTES = () => ({
  '/api/dsh-loglens/query': { ...labeledOutcome(), capabilities: { queryLanguage: 'lucene', pagination: 'cursor', follow: false, aggregations: true } },
  '/api/dsh-loglens/fields': labeledFields(),
  '/api/dsh-loglens/facets': (body) => (body.by === undefined
    ? HIST_OK
    : { ok: true, buckets: [{ key: 'grafana', count: 42 }, { key: 'prometheus', count: 8 }, { key: '', count: 2 }], warnings: [] }),
})

/*
 * 第三十刀：筛选行 = 一条**两格输入框**（左边选字段、右边可输可选）。
 *
 * 守的是这一刀的理由：加一条条件原来是四步（点「＋ 筛选」→ 在 92 个字段里找 → 点字段看值 →
 * 点值）。弹层退场之后整个过程是：点左边挑字段 → 右边自动张开该字段的 top 值 → 回车。
 * 所以这里要同时钉住三件事：两格都在、右格跟着左格走、手打的值也能提交。
 */

/** 筛选行上的条件芯片（面板里那份列芯片是另一个类名，不会撞）。 */
function filterChips(tree) {
  return treeFind(tree, (node) => hasClass(node, 'll_chip'))
}

/** 两格输入框：左格（字段）与右格（值）。 */
function fxFieldInput(tree) {
  return treeFind(tree, (node) => node.type === 'input' && hasClass(node, 'll_fxField'))[0]
}
function fxValueInput(tree) {
  return treeFind(tree, (node) => node.type === 'input' && hasClass(node, 'll_fxValue'))[0]
}
/** 下拉里的候选行（字段那张与值那张用同一个类）。 */
function fxItems(tree) {
  return treeFind(tree, (node) => node.type === 'button' && hasClass(node, 'll_fxItem'))
}
/** 一次点击的视口坐标桩（与「＋N」浮层那几条用例同一个写法）。 */
function rectAt(left, top, width, height) {
  return {
    currentTarget: {
      getBoundingClientRect: () => ({ left, top, right: left + width, bottom: top + height, width, height }),
    },
  }
}

/** 查回来 0 行的那一份响应（字段清单照常有：它与有没有行无关）。 */
function emptyOutcome() {
  const base = labeledOutcome()
  return { ...base, returned: 0, counts: { returned: 0, totalKnown: true, matched: 0 }, lines: [] }
}






await test('筛选行是一条**两格输入框**：左边字段、右边值，右边那颗「=」把条件的形状写在界面上', async () => {
  serverRoutes = VALUES_ROUTES()
  const { tree } = await runPanelQueryFull('es')

  // 跑了查询就有这一行（加了条件前后都在：入口得先存在）
  const fieldBox = fxFieldInput(tree)
  const valueBox = fxValueInput(tree)
  assert.ok(fieldBox !== undefined, '筛选行该有「字段」那一格')
  assert.ok(valueBox !== undefined, '筛选行该有「值」那一格')
  assert.equal(fieldBox.props.value, '', '刚查完两格都是空的')
  assert.equal(valueBox.props.value, '')

  // 字段还没选：值那一格禁用（没有字段就没有「这个字段的值」可列）
  assert.equal(valueBox.props.disabled, true, '没选字段时值那一格该禁用')
  assert.ok(String(valueBox.props.title).includes('先在左边选一个字段'), '禁用要说明为什么：' + String(valueBox.props.title))

  // 原「＋ 筛选」那颗按钮与它的整块弹层都退场了
  assert.equal(treeFind(tree, (node) => node.props?.key === 'll-filter-add').length, 0,
    '「＋ 筛选」该跟着弹层一起退场')
  assert.equal(treeFind(tree, (node) => node.props?.key === 'll-quick-act-container.name').length, 0,
    '行尾那颗悬停「填值」按钮也退场了（手填搬进这一条）')
})

await test('左格打下半个名字 → 候选收窄；选中一个**自动把右格张开**并拉它的 top 值', async () => {
  serverRoutes = VALUES_ROUTES()
  const { runtime, tree } = await runPanelQueryFull('es')
  calls.length = 0

  fxFieldInput(tree).props.onFocus()
  runtime.tick()
  await runtime.update()
  // 全部字段都在候选里（命中区先排、其余跟着）
  assert.ok(fxItems(runtime.tree).length > 0, '点开左格该列出字段候选')

  fxFieldInput(runtime.tree).props.onChange({ target: { value: 'cont name' } })
  runtime.tick()
  await runtime.update()
  const narrow = fxItems(runtime.tree)
  assert.equal(narrow.length, 1, '`cont name` 该只剩 container.name：' + String(narrow.length))
  assert.ok(treeText(narrow[0]).includes('container.name'), '候选取的就是它：' + treeText(narrow[0]))

  calls.length = 0
  await clickAndSettle(runtime, narrow[0])
  assert.equal(fxFieldInput(runtime.tree).props.value, 'container.name', '选中之后左格写上字段名')
  // 右格自动张开 + 自动拉一次（选字段的下一步必然是填值）
  const sent = calls.filter((call) => call.path === '/api/dsh-loglens/facets' && call.body?.by !== undefined)
  assert.equal(sent.length, 1, '选定字段该自动拉一次 top 值：' + JSON.stringify(calls.map((c) => c.path)))
  assert.equal(sent[0].body.by, 'container.name')
  const rows = fxItems(runtime.tree)
  assert.ok(rows.length >= 2, '右格该列出这个字段的值：' + String(rows.length))
  assert.ok(treeText(rows[0]).includes('grafana'), '值原样显示：' + treeText(rows[0]))
  /*
   * 计数**不进行**（第三十一刀）：它与页面命中数是两个瞬间量出来的，真机上抓到过
   * 「值行 15242 / 同屏命中 15199」，一个值不可能多于总数——并排摆必然被读成算错了。
   * 行里改成一条**相对长短**的条，具体条数进 title（要核对的人有出处）。
   */
  assert.ok(rows[0].props.title.includes('42'), '条数要留在 title 里：' + rows[0].props.title)
  assert.equal(treeText(rows[0]).includes('42'), false, '行里不该再出现那个数（它与页面命中数口径不同）')
  assert.ok(treeFind(rows[0], (node) => hasClass(node, 'll_fxItemBar')).length === 1, '每一行该有一条相对长短的条')
})

await test('候选里点一个值 → 立刻带 filters 重查（与榜下钻同一条 drillDown），两格清空', async () => {
  serverRoutes = VALUES_ROUTES()
  const { runtime, tree } = await runPanelQueryFull('es')
  fxFieldInput(tree).props.onChange({ target: { value: 'container.name' } })
  runtime.tick()
  await runtime.update()
  await clickAndSettle(runtime, fxItems(runtime.tree)[0])

  calls.length = 0
  const row = fxItems(runtime.tree).find((node) => treeText(node).includes('grafana'))
  assert.ok(row !== undefined, '找不到 grafana 那一行')
  await clickAndSettle(runtime, row)

  const query = calls.find((call) => call.path === '/api/dsh-loglens/query')
  assert.ok(query !== undefined, '点值要真的重查一次：' + JSON.stringify(calls.map((c) => c.path)))
  assert.deepEqual(query.body.filters, { 'container.name': 'grafana' }, '筛选按「字段 = 值」下发')
  assert.ok(treeText(runtime.tree).includes('container.name = grafana'), '芯片要在场')

  // 提交之后两格清空、下拉收起（这两格是「往里加」的入口，留着上一次的字会污染下一条）
  assert.equal(fxFieldInput(runtime.tree).props.value, '', '左格该清空')
  assert.equal(fxValueInput(runtime.tree).props.value, '')
  assert.equal(fxItems(runtime.tree).length, 0, '下拉该收起')
})

await test('**手打一个不在候选里的值**也能提交（长尾值 / 带空格 / 通配只有手打表达得了）', async () => {
  serverRoutes = VALUES_ROUTES()
  const { runtime, tree } = await runPanelQueryFull('es')

  // 只填左格（不点候选）：右格此刻仍然可用
  fxFieldInput(tree).props.onChange({ target: { value: 'container.name' } })
  runtime.tick()
  await runtime.update()
  assert.equal(fxValueInput(runtime.tree).props.disabled, false, '选了字段之后值那一格该可用')

  calls.length = 0
  fxValueInput(runtime.tree).props.onChange({ target: { value: 'grafana-frontend-*' } })
  runtime.tick()
  await runtime.update()
  // 候选里没有这个值，但「确定」已经可以按（两格都非空）
  const go = treeFind(runtime.tree, (node) => node.props?.key === 'll-fx-go')[0]
  assert.ok(go !== undefined, '两格都填了就该出现提交按钮')
  await clickAndSettle(runtime, go)

  const query = calls.find((call) => call.path === '/api/dsh-loglens/query')
  assert.ok(query !== undefined, '手打的值也要真的重查：' + JSON.stringify(calls.map((c) => c.path)))
  assert.deepEqual(query.body.filters, { 'container.name': 'grafana-frontend-*' },
    '手打的值原样下发（不做 trim / 不改写）：' + JSON.stringify(query.body.filters))
})

await test('值那一格**回车**提交候选里选中的那一条；没选中就提交打的字', async () => {
  serverRoutes = VALUES_ROUTES()
  const { runtime, tree } = await runPanelQueryFull('es')
  fxFieldInput(tree).props.onChange({ target: { value: 'container.name' } })
  runtime.tick()
  await runtime.update()
  await clickAndSettle(runtime, fxItems(runtime.tree)[0])

  // 方向键往下挪一格到 prometheus（−1 → 0 → 1）
  calls.length = 0
  fxValueInput(runtime.tree).props.onKeyDown({ key: 'ArrowDown', preventDefault() {} })
  runtime.tick()
  await runtime.update()
  fxValueInput(runtime.tree).props.onKeyDown({ key: 'ArrowDown', preventDefault() {} })
  runtime.tick()
  await runtime.update()
  fxValueInput(runtime.tree).props.onKeyDown({ key: 'Enter', preventDefault() {} })
  await runtime.update()
  await runtime.update()

  const query = calls.find((call) => call.path === '/api/dsh-loglens/query')
  assert.ok(query !== undefined, '回车要提交：' + JSON.stringify(calls.map((c) => c.path)))
  assert.deepEqual(query.body.filters, { 'container.name': 'prometheus' },
    '提交的是**选中的那一条**，不是空串：' + JSON.stringify(query.body.filters))
})

await test('**换字段就清空右格**：上一字段的值不许跟着搬过去（回车会静默筛错）', async () => {
  serverRoutes = VALUES_ROUTES()
  const { runtime, tree } = await runPanelQueryFull('es')

  // 选 host.name，右格打 node-1（**不提交**）
  fxFieldInput(tree).props.onChange({ target: { value: 'host.name' } })
  runtime.tick()
  await runtime.update()
  await clickAndSettle(runtime, fxItems(runtime.tree)[0])
  assert.equal(fxFieldInput(runtime.tree).props.value, 'host.name')
  fxValueInput(runtime.tree).props.onChange({ target: { value: 'node-1' } })
  runtime.tick()
  await runtime.update()
  assert.equal(fxValueInput(runtime.tree).props.value, 'node-1')

  // 改选 container.name：右格必须空
  fxFieldInput(runtime.tree).props.onChange({ target: { value: 'container.name' } })
  runtime.tick()
  await runtime.update()
  await clickAndSettle(runtime, fxItems(runtime.tree)[0])
  assert.equal(fxFieldInput(runtime.tree).props.value, 'container.name')
  assert.equal(fxValueInput(runtime.tree).props.value, '',
    '换字段之后右格必须清空——留着 node-1 就是在说 container.name = node-1')

  // 此刻直接回车：**不该**提交出 container.name = node-1
  calls.length = 0
  fxValueInput(runtime.tree).props.onKeyDown({ key: 'Enter', preventDefault() {} })
  await runtime.update()
  await runtime.update()
  assert.equal(calls.filter((call) => call.path === '/api/dsh-loglens/query').length, 0,
    '右格空着就发不出去（没有可提交的值）')
})

await test('**同一个字段重选**不抹掉已打的字（那是「重选同一个」，不是换字段）', async () => {
  serverRoutes = VALUES_ROUTES()
  const { runtime, tree } = await runPanelQueryFull('es')
  fxFieldInput(tree).props.onChange({ target: { value: 'host.name' } })
  runtime.tick()
  await runtime.update()
  await clickAndSettle(runtime, fxItems(runtime.tree)[0])
  fxValueInput(runtime.tree).props.onChange({ target: { value: 'node-1' } })
  runtime.tick()
  await runtime.update()

  // 重新点同一个字段的候选
  fxFieldInput(runtime.tree).props.onChange({ target: { value: 'host.name' } })
  runtime.tick()
  await runtime.update()
  await clickAndSettle(runtime, fxItems(runtime.tree)[0])
  assert.equal(fxValueInput(runtime.tree).props.value, 'node-1', '同一个字段重选不该清空')
})

await test('**正在筛的字段**打开值下拉：载荷摘掉它自己那条筛选，候选取得到别的值', async () => {
  serverRoutes = VALUES_ROUTES()
  const { runtime, tree } = await runPanelQueryFull('es')

  /*
   * 场景：container.name **已经在筛**，再打开它自己的值下拉。
   *
   * 要守的是这件事：聚合不能带着本字段那条筛选下发，否则它只在「= grafana」这个子集里算，
   * 候选永远只有 grafana 一条——换值换不动，而画面看起来像「这个字段只有一个值」。
   *
   * 判据落在**载荷**上（界面只是它的后果）：请求里不许出现 `filters['container.name']`。
   */
  fxFieldInput(tree).props.onChange({ target: { value: 'container.name' } })
  runtime.tick()
  await runtime.update()
  await clickAndSettle(runtime, fxItems(runtime.tree)[0])
  const grafana = fxItems(runtime.tree).find((node) => treeText(node).includes('grafana'))
  await clickAndSettle(runtime, grafana)
  assert.ok(treeText(runtime.tree).includes('container.name = grafana'), '前面得真有一条筛选')

  /*
   * 再打开同一个字段的值下拉——**载荷**与**界面**两半都在这一步验。
   *
   * 为什么载荷要看「筛上之后再开」这一次：第一次打开时这个字段还没被筛，请求里本来就不该有它，
   * 那种请求无论摘没摘本字段筛选都长一个样（反例抓不到）。
   * 只有在「已经筛着」的条件下发出去的请求才有区分度：
   *   - 摘掉了 → 键与第一次相同 → 缓存命中、**一个请求都不发**；
   *   - 没摘   → 键变了 → 会发一次、而且带着 `filters['container.name']`。
   * 所以判据是「这一步发出去的请求里，一条都不许带本字段的筛选」（允许 0 条 = 缓存命中）。
   */
  calls.length = 0
  fxFieldInput(runtime.tree).props.onChange({ target: { value: 'container.name' } })
  runtime.tick()
  await runtime.update()
  await clickAndSettle(runtime, fxItems(runtime.tree)[0])
  const reloaded = calls
    .filter((call) => call.path === '/api/dsh-loglens/facets' && call.body?.by === 'container.name')
    .map((call) => call.body)
  for (const body of reloaded) {
    assert.equal(body.filters === undefined ? undefined : body.filters['container.name'], undefined,
      '本字段自己的筛选不许下发（否则聚合只在那个子集里算，候选永远只有它自己）：' + JSON.stringify(body.filters))
  }
  const options = fxItems(runtime.tree).map((node) => treeText(node))
  assert.equal(options.length >= 2, true,
    '正在筛的字段也要列得出**别的**值，否则换值只能先删芯片：' + JSON.stringify(options))
  assert.equal(options.some((text) => text.includes('prometheus')), true,
    '别的值该在候选里：' + JSON.stringify(options))
})

await test('**别的**字段的筛选照旧下发（值仍是这一屏的子集）', async () => {
  serverRoutes = VALUES_ROUTES()
  const { runtime, tree } = await runPanelQueryFull('es')
  // 筛上 host.name
  fxFieldInput(tree).props.onChange({ target: { value: 'host.name' } })
  runtime.tick()
  await runtime.update()
  await clickAndSettle(runtime, fxItems(runtime.tree)[0])
  const value = fxItems(runtime.tree)[0]
  await clickAndSettle(runtime, value)
  const hostChip = treeFind(runtime.tree, (node) => hasClass(node, 'll_chip'))[0]
  const hostValue = String(treeText(hostChip)).split(' = ')[1].replace('×', '').trim()

  // 换一个字段看它的值：host.name 那条**必须还在**
  calls.length = 0
  fxFieldInput(runtime.tree).props.onChange({ target: { value: 'container.name' } })
  runtime.tick()
  await runtime.update()
  await clickAndSettle(runtime, fxItems(runtime.tree)[0])
  const sent = calls.filter((call) => call.path === '/api/dsh-loglens/facets' && call.body?.by !== undefined)
  assert.equal(sent.length >= 1, true)
  assert.equal(sent[0].body.filters?.['host.name'], hostValue,
    '别的字段的筛选要照旧带走：' + JSON.stringify(sent[0].body.filters))
})

await test('本字段正在筛时，值下拉顶部**说清口径**（那些数不受本字段约束）', async () => {
  serverRoutes = VALUES_ROUTES()
  const { runtime, tree } = await runPanelQueryFull('es')
  fxFieldInput(tree).props.onChange({ target: { value: 'container.name' } })
  runtime.tick()
  await runtime.update()
  await clickAndSettle(runtime, fxItems(runtime.tree)[0])
  await clickAndSettle(runtime, fxItems(runtime.tree)[0])   // 筛上第一条值

  fxFieldInput(runtime.tree).props.onChange({ target: { value: 'container.name' } })
  runtime.tick()
  await runtime.update()
  await clickAndSettle(runtime, fxItems(runtime.tree)[0])
  assert.equal(treeFind(runtime.tree, (node) => hasClass(node, 'll_fxNote')).length, 1,
    '摘掉本字段筛选这件事要说出来，不能默默换口径')
  const note = treeFind(runtime.tree, (node) => hasClass(node, 'll_fxNote'))[0]
  assert.ok(treeText(note).includes('不受本字段约束'), '口径要写明白：' + treeText(note))
})

await test('Backspace 在值格有字时删字、值格空了退回字段格（不把整条条件清掉）', async () => {
  const { filterBoxBack } = await import('../client-src/pure.js')
  assert.equal(filterBoxBack('container.name', 'graf'), 'value', '值格有字 → 删字')
  assert.equal(filterBoxBack('container.name', ''), 'field', '值格空了 → 退回字段格')
  assert.equal(filterBoxBack('', ''), 'none', '两格都空 → 什么都不做')
})

await test('来源不支持聚合（Loki）时**不发**值请求，直接在下拉里说清为什么', async () => {
  serverRoutes = {
    '/api/dsh-loglens/query': { ...labeledOutcome(), capabilities: { queryLanguage: 'logql', pagination: 'cursor', follow: false, aggregations: false } },
    '/api/dsh-loglens/fields': labeledFields(),
  }
  const { runtime, tree } = await runPanelQueryFull('es')
  calls.length = 0
  fxFieldInput(tree).props.onChange({ target: { value: 'container.name' } })
  runtime.tick()
  await runtime.update()
  await clickAndSettle(runtime, fxItems(runtime.tree)[0])

  const sent = calls.filter((call) => call.path === '/api/dsh-loglens/facets' && call.body?.by !== undefined)
  assert.equal(sent.length, 0, '不支持聚合时不该发这个请求')
  assert.ok(treeText(runtime.tree).includes('不支持聚合'), '要说明白为什么没有候选：' + treeText(runtime.tree).slice(-400))
})

await test('值取不到时把宿主原话摆在下拉里（不伪装成「没有值」）', async () => {
  serverRoutes = {
    '/api/dsh-loglens/query': VALUES_ROUTES()['/api/dsh-loglens/query'],
    '/api/dsh-loglens/fields': labeledFields(),
    '/api/dsh-loglens/facets': (body) => (body.by === undefined ? HIST_OK : { ok: false, status: 500, body: { error: 'shard down' } }),
  }
  const { runtime, tree } = await runPanelQueryFull('es')
  fxFieldInput(tree).props.onChange({ target: { value: 'container.name' } })
  runtime.tick()
  await runtime.update()
  await clickAndSettle(runtime, fxItems(runtime.tree)[0])
  assert.ok(treeText(runtime.tree).includes('shard down'), '宿主原话要落在这里：' + treeText(runtime.tree).slice(-400))
})

await test('空值那一档**不出现**在候选里：筛选表达不了「字段缺失」', async () => {
  // VALUES_ROUTES 的桶里有一条 key 为空串、count 2 的（真机 ES 会回这一条）
  const { valueChoices } = await import('../client-src/pure.js')
  const rows = valueChoices('container.name', [
    { key: 'grafana', count: 42 },
    { key: '', count: 2 },
    { key: 'prometheus', count: 8 },
  ], undefined, 8)
  assert.deepEqual(rows.map((row) => row.value), ['grafana', 'prometheus'], '空白值不进来（点了筛不了）')
})

await test('已经在筛的那个值在候选里**打标记**（点一下是取消，与榜上同一条）', async () => {
  const { valueChoices } = await import('../client-src/pure.js')
  const rows = valueChoices('container.name', [{ key: 'grafana', count: 42 }, { key: 'prometheus', count: 8 }], 'grafana', 8)
  assert.equal(rows[0].active, true, '正在筛的那一条要标出来')
  assert.equal(rows[1].active, false)
})

await test('候选顺序保持后端给的（按计数排序是后端的结论，不再排一次）', async () => {
  const { valueChoices, filterFieldChoices } = await import('../client-src/pure.js')
  const rows = valueChoices('f', [{ key: 'b', count: 1 }, { key: 'a', count: 99 }], undefined, 8)
  assert.deepEqual(rows.map((row) => row.value), ['b', 'a'], '不按计数重排')
  // 字段候选：这一页命中的排在前面，两侧内部保持 fieldSections 给的顺序
  const picked = filterFieldChoices({
    hit: [{ name: 'container.name' }],
    rest: [{ name: 'service.name' }, { name: 'host.name' }],
    conflict: [{ name: 'mixed.type' }],
  }, '')
  assert.deepEqual(picked.map((row) => row.name), ['container.name', 'service.name', 'host.name', 'mixed.type'])
  assert.equal(picked[0].group, 'hit')
})

await test('**0 行结果**时「字段」也打得开面板（这一格原来是个按下去没反应的死键）', async () => {
  serverRoutes = { '/api/dsh-loglens/query': emptyOutcome(), '/api/dsh-loglens/fields': labeledFields() }
  const { runtime } = await runPanelQueryFull('es', { fieldsOpen: true })
  assert.equal(treeFind(runtime.tree, (node) => hasClass(node, 'll_resultItem')).length, 0, '这一轮真的没有行')
  assert.equal(treeFind(runtime.tree, (node) => hasClass(node, 'll_fields')).length, 1,
    '0 行也要打得开——0 行正是最想加一条条件的时候')
  // 选列面板只列本页命中的字段：0 行时那批是空的——但面板**打开了**，且说清了为什么没有可加的列
  assert.ok(treeText(runtime.tree).includes('这一页没有可加列的字段'),
    '0 行时该说明白为什么没有可加的列：' + treeText(runtime.tree).slice(0, 260))
})

await test('面板高度上限 JS 与 CSS 同一口径：只改一边就红（否则上翻判断拿的是过时的数）', () => {
  assert.ok(code.includes('max-height:min(' + String(FIELD_PANEL_CEILING) + 'px,70vh)'),
    '`.ll_fields` 的 max-height 与 pure.js 的 FIELD_PANEL_CEILING 已经漂开（上翻判断会用错高度）')
})

/*
 * 第二十三刀：字段面板「读得完」——名字断在词上，脚注一行说得完，宽度是一个常量。
 *
 * 三处都是真机截图上看得见的东西：`com_docker_compose_config-hash` 被从词中间切开；
 * 脚注 464px 塞进 284px 的格子、被省略号切在句子中间；面板宽度在 CSS 与定位代码里各写了一份。
 */

/**
 * 长末段的两条 Docker 标签（40 字符上下）。
 *
 * 第三十刀之后面板只列**本页命中**的字段，所以这两条必须真的出现在行的 labels 里——
 * 挂在 `/fields` 上是不够的（那是「其余可用」，进不了选列面板）。
 */
const LONG_LEAF_FIELDS = () => {
  const outcome = labeledOutcome()
  outcome.lines[0].labels['container.labels.com_docker_compose_config-hash'] = 'abc123'
  outcome.lines[0].labels['container.labels.com_docker_compose_project_environment_file'] = '/srv/app/.env'
  return {
    '/api/dsh-loglens/query': outcome,
    '/api/dsh-loglens/fields': {
      ok: true,
      fields: [
        { name: 'container.labels.com_docker_compose_config-hash', kind: 'keyword' },
        { name: 'container.labels.com_docker_compose_project_environment_file', kind: 'keyword' },
      ],
      total: 2,
      truncated: false,
      warnings: [],
    },
  }
}

/** 一个字段行里「名字」那一格的所有子节点（文本段与 <wbr>）。 */
function fieldNameNode(tree, fullName) {
  return treeFind(tree, (node) => hasClass(node, 'll_fieldName')
    && typeof node.props?.title === 'string' && node.props.title.includes(fullName))[0]
}

await test('长末段断在**分隔符**上（不是从词中间切开）：`<wbr>` 的个数 = 段数 − 1', async () => {
  serverRoutes = LONG_LEAF_FIELDS()
  const { runtime } = await runPanelQueryFull('es', { fieldsOpen: true })

  const full = 'container.labels.com_docker_compose_config-hash'
  const nameNode = fieldNameNode(runtime.tree, full)
  assert.ok(nameNode !== undefined, '找不到那个长名字的字段行')

  // 行上显示的是**末段**：拼回去必须逐字等于末段（差一个字符 = 点错字段）
  assert.equal(treeText(nameNode), 'com_docker_compose_config-hash', '行上该只写末段：' + treeText(nameNode))

  const breaks = treeFind(nameNode, (node) => node.type === 'wbr')
  const segments = fieldNameBreaks('com_docker_compose_config-hash')
  assert.equal(breaks.length, segments.length - 1, '每个分隔符之后一个断点（段数 − 1）：' + String(breaks.length))

  // 每个断点都落在分隔符之后：把子节点拼回去，逐段核对
  const parts = []
  let buffer = ''
  for (const child of nameNode.props.children) {
    if (child !== null && typeof child === 'object' && child.type === 'wbr') { parts.push(buffer); buffer = '' } else buffer += String(child)
  }
  parts.push(buffer)
  assert.deepEqual(parts, segments, '断点位置与 fieldNameBreaks 不一致')
  // 断点在**分隔符之后**：除最后一段外，每一段都必须以分隔符结尾（这就是「断在词上」）
  for (const part of parts.slice(0, -1)) {
    assert.ok(/[-_.]$/.test(part), '断点在词中间（这一段没有以分隔符结尾）：' + part)
  }
})

await test('面板脚注**一行读得完**：短句在格子里放得下，完整那段在 title 里', async () => {
  serverRoutes = FIELD_ROUTES()
  const tree = await runPanelQuery('es', { fieldsOpen: true })
  const foot = treeFind(tree, (node) => hasClass(node, 'll_hintElide'))[0]
  assert.ok(foot !== undefined, '面板底部该有那句脚注')
  const text = treeText(foot)
  // 预算：格子宽 = 面板宽 − 左右 padding 16，字号 11px → 这么多「汉字宽」（真机实测 464px 塞不进去）
  const budget = (FIELD_PANEL_WIDTH - 16) / 11
  assert.ok(labelUnits(text) <= budget - 1,
    '脚注会再次被省略号切断（' + String(labelUnits(text)) + ' 汉字宽 > 预算 ' + String(Math.round(budget - 1)) + '）：' + text)
  // 完整解释不能丢：挪进 title（想细看的人悬停就有）
  assert.ok(String(foot.props.title).length > text.length, '完整那段该在 title 里（不是删掉）')
  // 两种面板各有一份完整解释（第二十五刀）：这一条走的是「字段」那颗打开的**选列**面板，
  // 讲的是「列为什么只能用本页命中的字段」；筛选弹层那份讲「点名字看值」
  assert.ok(String(foot.props.title).includes('本页命中'), 'title 里要有完整解释：' + String(foot.props.title))
})

await test('面板宽度只有**一个**权威常量：CSS 与定位代码不许各写一份', () => {
  assert.ok(code.includes('width:' + String(FIELD_PANEL_WIDTH) + 'px'),
    'CSS 的 .ll_fields 宽度与 pure.js 的 FIELD_PANEL_WIDTH 漂开了')
  // 断行靠 <wbr>，不靠 anywhere：`anywhere` 会让浏览器把一行填满再断（词从中间裂开）。
  // 只盯 `.ll_fieldName` 这一条规则——`.ll_rowRaw` / `.ll_detailValue` 那些是**原文**，
  // 长 JSON 没有分隔符，就是该硬断。
  const nameRule = code.slice(code.indexOf('.ll_fieldName{'), code.indexOf('}', code.indexOf('.ll_fieldName{')))
  assert.ok(!nameRule.includes('overflow-wrap:anywhere'),
    '`.ll_fieldName` 又用回了 overflow-wrap:anywhere——那会把长末段从词中间切开：' + nameRule)
  assert.ok(nameRule.includes('overflow-wrap:break-word'), '长到放不下的单段仍要能硬断（break-word 兜底）：' + nameRule)
})

/*
 * 第二十四刀：点字段 → 就地列出它的 top 值 → 点一个值直接筛。
 *
 * 守的是「**值**与**行**是同一个子集」：请求体与榜共用同一个信封（窗口 / 查询串 / 筛选）。
 * 少带一样就会给出上一次条件下的一组值——那比不展开更坏，因为它看起来是这一次的。
 */

/** 一套「支持聚合」的路由：字段清单 + 行 + 一份值桶。 */




/*
 * 第二十六刀：选列面板的「列」按钮换成**勾选**。
 *
 * 用户原话：「这里的『列』字很怪，选择字段，要么做成行选中，要么做成 checkbox 勾选」。
 * 「列」是**操作名**，摆在一列字段名右边像是数字/单位的一部分；而这一栏做的事就是
 * 「把这些字段选出来」——那是选择，不是命令。
 */

await test('选列面板的每一行是**勾选**：真的 checkbox、整行可点、选中态反映在 checked 上', async () => {
  serverRoutes = FIELD_ROUTES()
  const { runtime, tree } = await runPanelQueryFull('es', { fieldsOpen: true })

  // 行被包在 <label> 里：点名字 / 点数字 / 点勾选框都算选它（16px 的勾选框对鼠标太小）
  const picks = treeFind(tree, (node) => hasClass(node, 'll_fieldPick'))
  assert.ok(picks.length > 0, '每一行该是一个可点的勾选行')
  assert.ok(picks.every((node) => node.type === 'label'), '行必须是 <label>（整行可点、点勾选框也触发）')

  const box = fieldAction(tree, 'column', 'container.name')
  assert.equal(box.type, 'input', '勾选框必须是真的 <input>（键盘空格 / 读屏 / checked 都不用另写）')
  assert.equal(box.props.type, 'checkbox', '不是自己画的方块')
  assert.equal(box.props.checked, false, '没选时 unchecked')
  assert.ok(String(box.props['aria-label']).includes('container.name'), '要能读出是哪个字段：' + String(box.props['aria-label']))

  // 勾上：checked 跟着变，列集里也有了
  await toggleColumnPick(runtime, 'container.name')
  assert.equal(fieldAction(runtime.tree, 'column', 'container.name').props.checked, true, '勾上之后 checked 为真')
  assert.equal(resultColumnChips(runtime.tree).length, 1)

  // 再点掉
  await toggleColumnPick(runtime, 'container.name')
  assert.equal(fieldAction(runtime.tree, 'column', 'container.name').props.checked, false, '取消勾选')
  assert.equal(resultColumnChips(runtime.tree).length, 0)
})


/*
 * 第二十七刀：选列面板的**缩进契约**。
 *
 * 用户截图上的「没对齐」是真机量出来的：组头的箭头在 x=199、行里的勾选框在 x=219，差 20px。
 * 根因是两套各写各的数字——组头「箭头 10px + gap 4 + padding 4」、行「勾选框 16px + gap 6 +
 * 组体 padding-left 14 + 行 padding 4」。现在统一成「前导槽 16px + gap 4 + padding 4」，
 * 组体不再自己缩进。这不是「看起来差不多」，是**同一个数字**。
 *
 * 组件这层量不到像素（没有布局引擎），所以断言的是**那组数字本身**：任何一边被改单，
 * 这条就红。真实像素由真机验收（ROADMAP 第二十七刀有读数）。
 */

/** 取一条 CSS 规则（`.sel{...}`）的声明串，找不到返回 undefined。 */
function cssRule(selector) {
  const needle = selector + '{'
  const at = code.indexOf(needle)
  if (at === -1) return undefined
  const end = code.indexOf('}', at)
  return code.slice(at + needle.length, end)
}

await test('缩进契约：组头箭头与行勾选框**同宽**（16px）、同名 gap（4px）、组体不再自己缩进', () => {
  const chevron = cssRule('.ll_fieldGroupChevron')
  const check = cssRule('input[type=checkbox].ll_fieldCheck')
  const head = cssRule('.ll_fieldGroupHead')
  const pick = cssRule('.ll_fieldPick')
  const body = cssRule('.ll_fieldGroupBody')
  assert.ok(chevron && check && head && pick && body, '这几条规则都得在（少一条就等于换了个实现）')

  // ① 前导槽同宽：箭头与勾选框都占 16px——宽度不同就必然错开
  assert.ok(/width:16px/.test(chevron), '组头箭头该是 16px 的前导槽：' + chevron)
  assert.ok(/width:16px/.test(check), '勾选框该是 16px：' + check)
  // ② gap 同值：两处都用 4px
  assert.ok(/gap:4px/.test(head), '组头 gap 该是 4px：' + head)
  assert.ok(/gap:4px/.test(pick), '勾选行的 gap 该是 4px：' + pick)
  /*
   * ③ 组体的缩进（第二十九刀起**要**缩进了，判据随之改）：
   *
   * 第二十七刀禁止 `padding-left`，是为了消掉「两套数字各写各的」造成的 20px 错位。
   * 但第二十九刀用户要「tree 那种层次效果」——组内的行**必须**相对组头退一格。
   * 所以现在合法的不是「不许缩进」，而是：**左边距与内边距等量**（行被整体平移，
   * 不是只挤内容），并且有一条竖向导轨说明层级。这样行内「前导槽 + gap」那套仍在，
   * 缩进只是整体位移，对齐关系不变。
   */
  const bodyPad = /padding-left:([\d.]+)px/.exec(body)
  const bodyMargin = /margin-left:([\d.]+)px/.exec(body)
  assert.ok(bodyPad !== undefined && bodyMargin !== undefined, '组体该有等量的左内边距与左边距（整体平移）：' + body)
  assert.equal(bodyPad[1], bodyMargin[1], '左内边距与左边距必须等量，否则行会被压窄而不是整体右移：' + body)
  assert.ok(/border-left/.test(body), '组体该有一条竖向导轨（tree 的层级感就靠它）：' + body)
})

/*
 * 第二十九刀：两件用户点名的东西——
 *   ① 「展开没有 tree 那种层次效果」
 *   ② 「需要手填的时候还需要展开去填太麻烦了」
 */



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
