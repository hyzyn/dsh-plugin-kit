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
 *   3. 来源行：普通来源有第 4 格「允许公网地址」勾选框、docker 行留空占位（采集来源没有出站）；
 *   4. 勾选框 → 保存 → POST 请求体里确实带 allowPublic（这是「开关真的能开能关」的判据，
 *      宿主侧 allowPublic 缺省是「保持原值」，所以关掉时必须显式发 false）。
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

await test('设置卡片渲染：公网那一格是勾选框、docker 行留空占位、头行列名齐', async () => {
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

  const checkboxes = treeFind(tree, (node) => node.type === 'input' && node.props?.type === 'checkbox')
  // 2 个「允许公网地址」+ 1 个插件开关
  const publicBoxes = checkboxes.filter((node) => node.props.title !== undefined && String(node.props.title).includes('围栏'))
  assert.equal(publicBoxes.length, 2, '两条查询类来源各有 1 个公网勾选框（docker 行不该有），实得 ' + String(publicBoxes.length))
  assert.equal(publicBoxes.every((node) => node.props.checked === false), true, '宿主没开 allowPublic 时勾选框应是未勾上')
  assert.ok(treeText(tree).includes('允许公网地址'), '界面文案里应有「允许公网地址」（围栏报错点名的那一格）')
  assert.ok(treeText(tree).includes('公网'), '头行应有「公网」列名')
  return tree
})

await test('勾上「允许公网地址」再保存：POST 请求体里带 allowPublic=true（关掉时带 false）', async () => {
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

  const firstRow = treeFind(tree, (node) => String(node.props?.className ?? '').includes('ll_row'))[0]
  const box = treeFind(firstRow, (node) => node.type === 'input' && node.props?.type === 'checkbox')
    .find((node) => node.props.title !== undefined)
  assert.ok(box !== undefined, '第一条来源没有公网勾选框')
  box.props.onChange({ target: { checked: true } })
  runtime.tick()
  tree = await runtime.update()

  const saveButton = treeFind(tree, (node) => node.type === 'button' && String(node.props?.className ?? '') === 'll_btn')[0]
  assert.ok(saveButton !== undefined, '找不到保存按钮')
  saveButton.props.onClick()
  await runtime.update()
  await runtime.update()

  const post = calls.find((call) => call.method === 'POST' && call.body !== undefined && call.body.action === 'targets.update')
  assert.ok(post !== undefined, '没有发出 targets.update：' + JSON.stringify(calls))
  assert.equal(post.body.id, 'es', '改的应该是被勾的那条来源')
  assert.equal(post.body.patch.allowPublic, true, '勾上后请求体必须带 allowPublic=true（否则宿主的「缺省 = 保持原值」会把它吃掉）')

  // 关掉：同样要显式发 false（「缺省 = 保持原值」意味着不发就关不掉）
  const again = treeFind(runtime.tree, (node) => String(node.props?.className ?? '').includes('ll_row'))[0]
  const uncheck = treeFind(again, (node) => node.type === 'input' && node.props?.type === 'checkbox' && node.props.title !== undefined)[0]
  assert.equal(uncheck.props.checked, true, '保存后勾选框应停在勾上的状态')
  uncheck.props.onChange({ target: { checked: false } })
  runtime.tick()
  await runtime.update()
  const saveAgain = treeFind(runtime.tree, (node) => node.type === 'button' && String(node.props?.className ?? '') === 'll_btn')[0]
  saveAgain.props.onClick()
  await runtime.update()
  await runtime.update()
  const closes = calls.filter((call) => call.method === 'POST' && call.body !== undefined && call.body.action === 'targets.update')
  assert.equal(closes.length, 2, '应有两次 targets.update')
  assert.equal(closes[1].body.patch.allowPublic, false, '取消勾选后必须显式发 allowPublic=false')
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
