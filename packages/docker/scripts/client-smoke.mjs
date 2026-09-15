#!/usr/bin/env node
/**
 * @hyzyn/dsh-docker — 浏览器半体装载回归（无浏览器，最小 DOM / React / fetch 桩）。
 *
 * 目的：client.js 是随包发布的构建产物，语法或顶层引用一旦出错，只有用户
 * 打开页面时才会暴露。这里在 Node 里用最小桩执行它，验证：
 *   - window.__ModuleLoader__.load 的 id 与 factory 形状正确
 *   - factory 只 require 平台 seed 提供的模块（react / react/jsx-runtime /
 *     react-dom/client），不会引入未提供的依赖
 *   - apply 注册了 settings.plugin.item 卡片且 key 为 settings 命名空间 `docker`
 *   - 侧边栏入口挂载在「找不到宿主侧边栏」时安静降级，不抛异常
 *   - 卸载函数可重复调用（宿主热重载路径）
 *   - ttyConnbar 集成：SSH 会话按连接簿名 / host:port 命中目标才插入「容器」
 *     按钮；未命中、非 SSH、tty 未安装三种情况都不报错
 *
 * 用法：pnpm --filter @hyzyn/dsh-docker build && node scripts/client-smoke.mjs
 */
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const code = readFileSync(join(root, 'client.js'), 'utf8')

/**
 * 还原 esbuild 的 ASCII 转义，便于断言中文文案：
 * 码位 ≥ 0x100 是 \uXXXX（中文），< 0x100 是 \xHH（间隔号 · 这类）。
 * 只处理 \uXXXX 会漏掉后者，断言里会莫名差一个字符。
 */
function decodeBundle(text) {
  return text
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\x([0-9a-fA-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
}

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
 * 最小 DOM / React / fetch 桩
 * ------------------------------------------------------------------ */

function makeElement(tag) {
  const element = {
    tagName: String(tag).toUpperCase(),
    className: '',
    dataset: {},
    style: {},
    children: [],
    parentElement: null,
    isConnected: false,
    id: '',
    textContent: '',
    innerHTML: '',
    setAttribute() {},
    addEventListener() {},
    removeEventListener() {},
    appendChild(child) {
      child.parentElement = element
      element.children.push(child)
      return child
    },
    remove() {},
    closest() { return null },
    querySelector() { return null },
    querySelectorAll() { return [] },
    contains() { return false },
    matches() { return false },
  }
  return element
}

const documentStub = {
  head: makeElement('head'),
  body: makeElement('body'),
  createElement: (tag) => makeElement(tag),
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener() {},
  removeEventListener() {},
}

const ReactStub = {
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
  useEffect: () => {},
  useRef: (initial) => ({ current: initial }),
  useCallback: (fn) => fn,
  /*
   * 上下文（S3 的「面板是否可见」用）：桩不做真实渲染，所以 useContext 只能拿到
   * createContext 的**默认值**。对本文件够用——既有用例全走「默认可见」的模态路径，
   * 而门控真正的行为（visible=false → 断流）发生在 effect 里，本就不在这个桩的射程内，
   * 那条路径由手工验收覆盖。
   */
  createContext: (initial) => ({ __context: true, initial }),
  useContext: (context) => (context === null || context === undefined ? undefined : context.initial),
}
const jsx = (type, props, key) => ({ type, props: { ...(props ?? {}), key } })
const jsxs = (type, props, key) => ({ type, props: { ...(props ?? {}), key } })
/** 记录每次 createRoot().render() 的调用，供断言面板入参。 */
const renders = []
const createRoot = () => ({ render(element) { renders.push(element) }, unmount() {} })

const SEED = {
  react: ReactStub,
  'react/jsx-runtime': { jsx, jsxs },
  'react-dom/client': { createRoot },
}

/** 假 /config 与 /targets：让连接栏匹配逻辑拿到真实形状的数据。 */
const FAKE_CONFIG = {
  enabled: true,
  announceToAgent: true,
  dockerBin: 'docker',
  allowMutations: false,
  allowExec: false,
  execTimeoutSec: 30,
  pollIntervalSec: 5,
  logTailDefault: 200,
  maxOutputKb: 512,
  targets: [
    { name: '本机', kind: 'local', book: '', host: '', port: 22, username: '', auth: 'agent', keyPath: '', agentForward: false, passwordSet: false, passphraseSet: false },
    { name: 'prod', kind: 'ssh', book: 'prod-a', host: '', port: 22, username: '', auth: 'agent', keyPath: '', agentForward: false, passwordSet: false, passphraseSet: false },
    { name: 'inline', kind: 'ssh', book: '', host: '10.0.0.9', port: 2200, username: 'ops', auth: 'agent', keyPath: '', agentForward: false, passwordSet: false, passphraseSet: false },
  ],
  hostKeys: [],
  ttyBooks: ['prod-a'],
  ttyAvailable: true,
  toolsRegistered: [],
}
const FAKE_TARGETS = [
  { name: '本机', kind: 'local', label: '本机' },
  { name: 'prod', kind: 'ssh', label: 'root@10.0.0.5:2222' },
  { name: 'inline', kind: 'ssh', label: 'ops@10.0.0.9:2200' },
]

const fetchStub = (url) => {
  const path = String(url)
  const payload = path.endsWith('/config')
    ? { ok: true, config: FAKE_CONFIG }
    : path.endsWith('/targets')
      ? { ok: true, targets: FAKE_TARGETS }
      : { ok: false, error: 'unexpected ' + path }
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(payload) })
}

let registration = null
const windowStub = {
  __ModuleLoader__: {
    load: (entry) => {
      registration = entry
    },
  },
}

/* ------------------------------------------------------------------ *
 * 执行 bundle
 * ------------------------------------------------------------------ */

await test('client.js 可执行并注册 @hyzyn/dsh-docker', () => {
  const run = new Function('window', 'document', 'MutationObserver', 'fetch', code)
  run(windowStub, documentStub, class { observe() {} disconnect() {} }, fetchStub)
  assert.ok(registration !== null, '未调用 __ModuleLoader__.load')
  assert.equal(registration.id, '@hyzyn/dsh-docker')
  assert.equal(typeof registration.factory, 'function')
})

await test('factory 只 require 平台 seed 提供的模块', () => {
  const required = []
  const requireStub = (spec) => {
    required.push(spec)
    const module = SEED[spec]
    if (module === undefined) throw new Error(`client-modules: require("${spec}") missed the module table`)
    return module
  }
  const exports_ = registration.factory(requireStub)
  assert.deepEqual(required.sort(), ['react', 'react-dom/client', 'react/jsx-runtime'])
  assert.deepEqual(exports_.inject, ['slots'])
  assert.equal(typeof exports_.apply, 'function')
})

/** 造一个最小 client ctx：slots 恒有，ttyConnbar 可选。 */
function makeClientCtx(options = {}) {
  const state = { cards: [], injected: [], connbarFactory: null, renders: 0, unmounted: 0, execCalls: [], mountCalls: [], paneCalls: [], openTabs: [] }
  const ctx = {
    slots: {
      inject: (slot, callback) => {
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
      if (names.includes('ttyConnbar') && options.ttyConnbar === true) {
        callback({
          ttyConnbar: {
            addAction(factory) {
              state.connbarFactory = factory
              return () => { state.connbarFactory = null }
            },
            requestRender() {
              state.renders += 1
            },
          },
        })
      }
      if (names.includes('ttyPanel') && options.ttyPanel === true) {
        // tty ≥ 0.16 的右侧挂载位；传 ttyPanelOpen: false 可模拟「面板没开」
        const service = {
          version: 1,
          isOpen: () => options.ttyPanelOpen !== false,
          mountPane(call) {
            state.paneCalls.push(call)
            return { element: { tagName: 'DIV', appendChild() {}, remove() {} }, dispose() {} }
          },
        }
        callback({ ttyPanel: service })
      }
      if (names.includes('ttyTerminal') && options.ttyTerminal === true) {
        // 默认按最新契约（version 2 = 有 mount）；传 ttyTerminalVersion: 1 可模拟老版本
        const version = options.ttyTerminalVersion ?? 2
        const service = {
          version,
          open(call) {
            state.execCalls.push(call)
          },
        }
        if (version >= 2) {
          service.mount = (host, call) => {
            state.mountCalls.push({ host, call })
            return () => {}
          }
        }
        callback({ ttyTerminal: service })
      }
      if (names.includes('sessions') && options.sessions !== false) {
        // 会话桥：日志右键「问 Agent」经它拿**会话作用域**里的 conversation。
        // 传 sessions: false 可模拟宿主未提供该服务（apply 不能崩，菜单运行期置灰）。
        const conversation = {
          send: () => Promise.resolve(),
          input: { for: () => ({ setDraft() {}, notify() {} }) },
        }
        callback({
          sessions: {
            list: { getSnapshot: () => ({ current: 'session-smoke' }) },
            scope: () => ({ get: (name) => (name === 'conversation' ? conversation : undefined) }),
          },
        })
      }
      // 默认**不提供**右侧栏服务，于是缺省路径仍是模态——这与「老版本 DSH」同形，
      // 既有用例因此不必改。传 sidebarRightTabs: true 才模拟「有标签宿主」的新宿主。
      if (names.includes('sidebarRightTabs') && options.sidebarRightTabs === true) {
        callback({
          slots: ctx.slots,
          sidebarRightTabs: { register: () => () => {} },
          sidebarRight: { openTab: (kind, openOptions) => { state.openTabs.push({ kind, options: openOptions ?? {} }) } },
        })
      }
      return () => {}
    },
  }
  return { ctx, state }
}

await test('apply 注册 settings.plugin.item 卡片（key=docker）并挂载侧边栏入口', () => {
  const requireStub = (spec) => SEED[spec]
  const exports_ = registration.factory(requireStub)
  const { ctx, state } = makeClientCtx()
  const dispose = exports_.apply(ctx)
  assert.equal(state.cards.length, 1)
  assert.equal(state.cards[0].options.name, 'settings.plugin.item')
  assert.equal(state.cards[0].options.key, 'docker', 'settings 卡片 key 必须等于命名空间')
  assert.equal(typeof state.cards[0].component, 'function')
  // 宿主侧边栏找不到时安静降级（不抛异常），卸载可重复调用
  assert.equal(typeof dispose, 'function')
  dispose()
  dispose()
})

await test('tty 未安装时：可选注入不触发、apply 仍成功', () => {
  const requireStub = (spec) => SEED[spec]
  const exports_ = registration.factory(requireStub)
  const { ctx, state } = makeClientCtx({ ttyConnbar: false, ttyTerminal: false })
  const dispose = exports_.apply(ctx)
  // 这里只断言「那几个可选注入被尝试过」；*全集*清单在下面单独一条用例里锁，
  // 于是以后新增一个可选注入只需改那一处，不再连带打断这条例外路径用例。
  for (const name of ['ttyConnbar', 'ttyPanel', 'ttyTerminal']) {
    assert.ok(state.injected.includes(name), '缺少可选注入 ' + name)
  }
  assert.equal(state.connbarFactory, null)
  assert.equal(state.execCalls.length, 0)
  dispose()
})

await test('日志 → 会话桥：宿主未提供 sessions 时 apply 仍成功（菜单运行期置灰）', () => {
  const requireStub = (spec) => SEED[spec]
  const exports_ = registration.factory(requireStub)
  const { ctx, state } = makeClientCtx({ sessions: false })
  const dispose = exports_.apply(ctx)
  // 可选注入：服务缺失不能让 apply 抛错，面板其余功能（设置卡片）照常注册
  assert.ok(state.cards.length > 0, 'sessions 缺失时设置卡片仍应注册')
  assert.equal(state.connbarFactory, null)
  dispose()
})

await test('ttyConnbar：SSH 标签一律显示「容器」，目标在点击时解析', async () => {
  const requireStub = (spec) => SEED[spec]
  const exports_ = registration.factory(requireStub)
  const { ctx, state } = makeClientCtx({ ttyConnbar: true })
  const dispose = exports_.apply(ctx)
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(typeof state.connbarFactory, 'function', 'apply 未注册连接栏工厂')

  const buttons = []
  const addAction = (icon, label, title, onClick) => buttons.push({ icon, label, title, onClick })
  // 1) 连接簿条目名命中 → 按钮标题带目标名
  state.connbarFactory({ spec: { t: 'ssh', name: 'prod-a', host: '10.0.0.5', port: 2222 }, bookName: 'prod-a', addAction })
  assert.equal(buttons.length, 1)
  assert.equal(buttons[0].label, '容器')
  assert.match(buttons[0].title, /目标：prod/)

  // 2) 内联会话按 host:port 命中（label 解析路径）
  state.connbarFactory({ spec: { t: 'ssh', host: '10.0.0.9', port: 2200 }, bookName: '', addAction })
  assert.equal(buttons.length, 2)
  assert.match(buttons[1].title, /目标：inline/)

  // 3) 未配置的主机 → 仍然显示按钮（注册即显示），标题提示去配置
  state.connbarFactory({ spec: { t: 'ssh', host: '192.168.1.2', port: 22 }, bookName: '', addAction })
  assert.equal(buttons.length, 3)
  assert.match(buttons[2].title, /尚未配置/)

  // 4) 本地标签（非 SSH）→ 不插入按钮
  state.connbarFactory({ spec: { t: 'local' }, bookName: '', addAction })
  assert.equal(buttons.length, 3)

  // 5) 点击未命中目标的按钮：异步解析后打开面板（body 上出现挂载容器）
  const before = documentStub.body.children.length
  buttons[2].onClick()
  await new Promise((resolve) => setTimeout(resolve, 30))
  assert.ok(documentStub.body.children.length > before, '点击后未挂载面板容器')
  const hinted = renders[renders.length - 1]
  assert.equal(hinted.props.initialTarget, '', '未命中时不应默认选中任何目标')
  assert.equal(typeof hinted.props.sessionHint, 'object', '未命中时应带会话提示')

  dispose()
})

await test('插件禁用（config.enabled=false）：连接栏不再提供「容器」按钮', async () => {
  // 重新执行 bundle：模块级缓存 / 显隐状态归零；fetch 返回禁用态 config，
  // /targets 按宿主禁用行为返回 403 形状的失败载荷
  let reg = null
  const disabledFetch = (url) => {
    const payload = String(url).endsWith('/config')
      ? { ok: true, config: { ...FAKE_CONFIG, enabled: false } }
      : { ok: false, error: 'forbidden: disabled' }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(payload) })
  }
  const run = new Function('window', 'document', 'MutationObserver', 'fetch', code)
  run({ __ModuleLoader__: { load: (entry) => { reg = entry } } }, documentStub, class { observe() {} disconnect() {} }, disabledFetch)
  const exports_ = reg.factory((spec) => SEED[spec])
  const { ctx, state } = makeClientCtx({ ttyConnbar: true })
  const dispose = exports_.apply(ctx)
  await new Promise((resolve) => setTimeout(resolve, 10))
  const buttons = []
  state.connbarFactory({ spec: { t: 'ssh', name: 'prod-a', host: '10.0.0.5', port: 2222 }, bookName: 'prod-a', addAction: (icon, label, title, onClick) => buttons.push({ label, onClick }) })
  assert.equal(buttons.length, 0, '禁用后连接栏不应插入「容器」按钮')
  // 卸载后再触发迟到的一次缓存刷新：不允许把入口状态挂回已卸载的实例
  dispose()
  await new Promise((resolve) => setTimeout(resolve, 10))
})

await test('缓存尚未就绪时点击：现场重拉并锁定当前会话对应的目标', async () => {
  // 重新执行 bundle，得到干净的模块级缓存（不 await → 挂载时的刷新还没落地）
  let reg = null
  const run = new Function('window', 'document', 'MutationObserver', 'fetch', code)
  run({ __ModuleLoader__: { load: (entry) => { reg = entry } } }, documentStub, class { observe() {} disconnect() {} }, fetchStub)
  const exports_ = reg.factory((spec) => SEED[spec])
  const { ctx, state } = makeClientCtx({ ttyConnbar: true })
  exports_.apply(ctx)

  const buttons = []
  state.connbarFactory({ spec: { t: 'ssh', name: 'prod-a', host: '10.0.0.5', port: 2222 }, bookName: 'prod-a', addAction: (icon, label, title, onClick) => buttons.push({ title, onClick }) })
  // 此刻缓存为空 → 标题是中性的，不应断言「未配置」
  assert.match(buttons[0].title, /打开当前会话主机/)

  const before = renders.length
  buttons[0].onClick()
  await new Promise((resolve) => setTimeout(resolve, 40))
  assert.ok(renders.length > before, '点击后未打开面板')
  const panel = renders[renders.length - 1]
  assert.equal(panel.props.initialTarget, 'prod', '应锁定当前会话对应的目标')
  assert.equal(panel.props.sessionHint, undefined, '命中目标时不应再带未配置提示')
})

await test('承载分发（S2）：框架侧入口开右侧栏标签（带目标），不再弹模态', () => {
  const exports_ = registration.factory((spec) => SEED[spec])
  const { ctx, state } = makeClientCtx({ sidebarRightTabs: true })
  exports_.apply(ctx)

  const before = renders.length
  // 走测试缝直接驱动分发：DOM 桩的 querySelector 返回 null，点不到页边栏那个入口
  exports_.__carrier.open({ target: 'prod' })
  assert.equal(state.openTabs.length, 1, '有右侧栏服务时应开标签')
  assert.equal(state.openTabs[0].kind, 'docker', 'kind 必须与注册的 kind 一致')
  assert.equal(state.openTabs[0].options.params.target, 'prod', '目标应随 navigation params 带进标签')
  assert.equal(renders.length, before, '开标签时不应再渲染模态')
})

await test('承载分发（S2）：终端连接栏入口走 dock、不开标签（弹窗会挡住标签）', async () => {
  let reg = null
  const run = new Function('window', 'document', 'MutationObserver', 'fetch', code)
  run({ __ModuleLoader__: { load: (entry) => { reg = entry } } }, documentStub, class { observe() {} disconnect() {} }, fetchStub)
  const exports_ = reg.factory((spec) => SEED[spec])
  // 连接栏按钮长在 tty 面板上 → 点击时弹窗一定开着，且它盖满视口
  const { ctx, state } = makeClientCtx({ ttyConnbar: true, ttyPanel: true, sidebarRightTabs: true })
  exports_.apply(ctx)

  const buttons = []
  state.connbarFactory({ spec: { t: 'ssh', name: 'prod-a', host: '10.0.0.5', port: 2222 }, bookName: 'prod-a', addAction: (icon, label, title, onClick) => buttons.push({ title, onClick }) })
  buttons[0].onClick()
  await new Promise((resolve) => setTimeout(resolve, 40))
  assert.equal(state.openTabs.length, 0, '连接栏入口不该开标签 —— 它会被 tty 弹窗整个挡住')
  assert.ok(state.paneCalls.length > 0, '应停靠到 tty 面板右侧的 dock')
})

await test('连接栏：本插件自己开的 exec 标签不再提供「容器」入口', async () => {
  // 纯函数部分：只认 spawnSpec.command（API 开的命令标签），用户手敲的不算
  const carrier = carrierApi()
  assert.equal(carrier.isOwnExec(carrier.buildExec('ems-service-test')), true, '自家生成的命令必须认得出来')
  assert.equal(carrier.isOwnExec("docker exec -it 'x' sh"), true)
  assert.equal(carrier.isOwnExec(undefined), false, '普通 SSH 标签没有 command → 照旧带按钮')
  assert.equal(carrier.isOwnExec(''), false)
  assert.equal(carrier.isOwnExec('docker ps'), false)

  // 端到端：连接栏工厂拿到的 spec 带 command 时不再插按钮
  let reg = null
  const run = new Function('window', 'document', 'MutationObserver', 'fetch', code)
  run({ __ModuleLoader__: { load: (entry) => { reg = entry } } }, documentStub, class { observe() {} disconnect() {} }, fetchStub)
  const exports_ = reg.factory((spec) => SEED[spec])
  const { ctx, state } = makeClientCtx({ ttyConnbar: true })
  exports_.apply(ctx)
  const buttons = []
  const push = (icon, label, title, onClick) => buttons.push({ label, onClick })
  const base = { t: 'ssh', name: 'prod-a', host: '10.0.0.5', port: 2222 }
  state.connbarFactory({ spec: base, bookName: 'prod-a', addAction: push })
  assert.equal(buttons.length, 1, '普通 SSH 标签应带「容器」按钮')
  buttons.length = 0
  state.connbarFactory({ spec: { ...base, command: "docker exec -it 'ems-service-test' sh" }, bookName: 'prod-a', addAction: push })
  assert.equal(buttons.length, 0, 'exec 标签不该再给「容器」入口')
})

await test('承载分发（S2）：localStorage 置 modal 时退回模态（灰度回滚开关）', () => {
  let reg = null
  const run = new Function('window', 'document', 'MutationObserver', 'fetch', code)
  // 偏好读的是 window.localStorage；harness 的 window 桩默认没有它（越界读取会被 try/catch 吃掉）
  run({
    __ModuleLoader__: { load: (entry) => { reg = entry } },
    localStorage: { getItem: () => 'modal' },
  }, documentStub, class { observe() {} disconnect() {} }, fetchStub)
  const exports_ = reg.factory((spec) => SEED[spec])
  const { ctx, state } = makeClientCtx({ sidebarRightTabs: true })
  exports_.apply(ctx)

  const before = renders.length
  exports_.__carrier.open({ target: 'prod' })
  assert.equal(state.openTabs.length, 0, '置 modal 后不应开标签')
  assert.ok(renders.length > before, '置 modal 后应走模态（渲染面板）')
})

await test('注入清单快照：本插件注入过的服务全集（加可选注入时只改这一处）', () => {
  const exports_ = registration.factory((spec) => SEED[spec])
  const { ctx, state } = makeClientCtx({ ttyConnbar: false, ttyTerminal: false })
  const dispose = exports_.apply(ctx)
  assert.deepEqual(state.injected.sort(), ['sessions', 'sidebarRight', 'sidebarRightTabs', 'ttyConnbar', 'ttyPanel', 'ttyTerminal'])
  dispose()
})

await test('右侧栏标签承载（S1）：类型 / body / 外壳样式装配进 bundle', () => {
  assert.ok(code.includes('sidebar.right.pane.tab'), '缺少右侧栏标签 body 槽名')
  assert.ok(code.includes('sidebarRightTabs'), '缺少右侧栏类型注册')
  assert.ok(code.includes('dk_panelTab'), '缺少标签承载的面板外壳样式')
  // 契约要求 body 注册在**实现 id** 下（不是 kind）：写错的表现是「标签能开、body 空白」
  assert.ok(code.includes('"@hyzyn/dsh-docker"') || code.includes("'@hyzyn/dsh-docker'"), '缺少标签实现 id')
  // 卡片「终端」按钮要按右侧栏是否铺满分流，fullscreen 得透传进面板（属性名不会被 minify）
  assert.ok(code.includes('tabFullscreen'), '缺少 sidebar.fullscreen 的透传')
  // esbuild 默认 charset=ascii：中文在 bundle 里是 \uXXXX，先解码再断言
  const decoded = code.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
  assert.ok(decoded.includes('本机与 SSH 主机的容器、镜像、Compose、网络与卷'), '缺少指南页描述文案')
})

await test('ttyTerminal：可选注入成功，且 bundle 内含 exec 命令与复制兜底', () => {
  const exports_ = registration.factory((spec) => SEED[spec])
  const { ctx, state } = makeClientCtx({ ttyConnbar: false, ttyTerminal: true })
  const dispose = exports_.apply(ctx)
  assert.ok(state.injected.includes('ttyTerminal'), '缺少 ttyTerminal 可选注入')
  // 命令构造与兜底路径：静态断言（点击路径在真实应用里由端到端脚本覆盖）
  // esbuild 默认 charset=ascii：中文在 bundle 里是 \uXXXX，先解码再断言
  const decoded = code.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
  assert.ok(decoded.includes('docker exec -it'), '缺少 exec 命令构造')
  assert.ok(decoded.includes('未安装 dsh-tty 终端面板'), '缺少 tty 未安装时的复制兜底提示')
  assert.ok(decoded.includes('终端面板版本过旧'), '缺少 tty 版本过旧时的提示')
  dispose()
})

await test('ttyTerminal：按契约版本选择 mount（就地嵌入）/ open（开标签），旧版本不报错', () => {
  const decoded = code.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
  // 静态断言锁住契约：能力判断走 version，且两条路径与抽屉 DOM 都在 bundle 里。
  // 点击路径（点卡片 → 抽屉里出现真终端）由 tty 的预览夹具端到端覆盖：
  //   packages/tty/scripts/preview.mjs 的 docker-exec / embed / embed-panel 场景
  assert.ok(code.includes('version'), '缺少 ttyTerminal 契约版本判断')
  assert.ok(code.includes('.mount(') || code.includes('mount('), '缺少 mount 调用路径')
  assert.ok(code.includes('dk_drawerBody'), '缺少终端抽屉挂载点')
  assert.ok(decoded.includes('由终端面板承载'), '缺少抽屉说明文案')
  // 老版本（只有 open）注入不应抛异常：apply 全程不碰 mount
  const old = makeClientCtx({ ttyTerminal: true, ttyTerminalVersion: 1 })
  const exports_ = registration.factory((spec) => SEED[spec])
  const dispose = exports_.apply(old.ctx)
  assert.equal(typeof dispose, 'function')
  dispose()
})

await test('ttyPanel：面板开着时挂进右侧侧栏（docked），没开则回退弹窗', async () => {
  const requireStub = (spec) => SEED[spec]
  // 1) 面板开着（isOpen → true）：走 ttyPanel.mountPane，ContainerPanel 拿到 docked
  const exports_ = registration.factory(requireStub)
  const { ctx, state } = makeClientCtx({ ttyConnbar: true, ttyPanel: true })
  const dispose = exports_.apply(ctx)
  await new Promise((resolve) => setTimeout(resolve, 0))
  const buttons = []
  state.connbarFactory({ spec: { t: 'ssh', name: 'prod-a', host: '10.0.0.5', port: 2222 }, bookName: 'prod-a', addAction: (icon, label, title, onClick) => buttons.push({ onClick }) })
  buttons[0].onClick()
  await new Promise((resolve) => setTimeout(resolve, 30))
  assert.equal(state.paneCalls.length, 1, '面板开着时应挂进 ttyPanel')
  assert.equal(state.paneCalls[0].title, 'Docker 容器')
  const docked = renders[renders.length - 1]
  assert.equal(docked.props.docked, true, 'dock 模式必须显式传给 ContainerPanel')
  // 2) 面板没开（isOpen → false）：仍然挂 body 级模态
  const modal = makeClientCtx({ ttyConnbar: true, ttyPanel: true, ttyPanelOpen: false })
  const exports2 = registration.factory(requireStub)
  const dispose2 = exports2.apply(modal.ctx)
  await new Promise((resolve) => setTimeout(resolve, 0))
  const buttons2 = []
  modal.state.connbarFactory({ spec: { t: 'ssh', name: 'prod-a', host: '10.0.0.5', port: 2222 }, bookName: 'prod-a', addAction: (icon, label, title, onClick) => buttons2.push({ onClick }) })
  const before = documentStub.body.children.length
  buttons2[0].onClick()
  await new Promise((resolve) => setTimeout(resolve, 30))
  assert.equal(modal.state.paneCalls.length, 0, '面板没开时不该挂 pane')
  assert.ok(documentStub.body.children.length > before, '没开面板时应回退到 body 级模态')
  const modalPanel = renders[renders.length - 1]
  assert.notEqual(modalPanel.props.docked, true)
  dispose()
  dispose2()
})

await test('按条件一键选择：preset 判定 / 计数截断 / 上限语义', () => {
  const exports_ = registration.factory((spec) => SEED[spec])
  const pick = exports_.__pick
  assert.ok(typeof pick.apply === 'function' && typeof pick.presetCounts === 'function', '缺少 __pick 条件选择测试缝')
  const visible = [
    { id: 'a', name: 'web', image: 'nginx:1.27', state: 'running', health: 'unhealthy', composeProject: 'shop', exitCode: null },
    { id: 'b', name: 'api', image: 'app:1', state: 'running', health: null, composeProject: 'shop', exitCode: null },
    { id: 'c', name: 'cron', image: 'app:1', state: 'exited', health: null, composeProject: 'ops', exitCode: 137 },
    { id: 'd', name: 'clean', image: 'app:2', state: 'exited', health: null, composeProject: 'ops', exitCode: 0 },
  ]

  // 不健康 → 只挑 a
  assert.deepEqual(pick.apply(visible, [], 'unhealthy', null, 8).ids, ['a'])
  // 需关注（摘要口径：unhealthy + 非零退出）→ a、c
  assert.deepEqual(pick.apply(visible, [], 'abnormal', null, 8).ids, ['a', 'c'])
  // 已停止 → c、d
  assert.deepEqual(pick.apply(visible, [], 'stopped', null, 8).ids, ['c', 'd'])
  // 已勾选的不重复选
  assert.deepEqual(pick.apply(visible, ['a'], 'unhealthy', null, 8).ids, ['a'])
  // 上限截断：全部可见但只剩 2 个名额 → 加 2 个、略过 2 个
  const capped = pick.apply(visible, ['a', 'b'], 'all', null, 4)
  assert.equal(capped.added, 2)
  assert.equal(capped.skipped, 0)
  const tight = pick.apply(visible, ['a'], 'all', null, 3)
  assert.equal(tight.added, 2)
  assert.equal(tight.skipped, 1)
  assert.equal(tight.ids.length, 3)

  // 同镜像 / 同项目：以第一个勾选的容器为基准
  assert.deepEqual(pick.apply(visible, [], 'sameImage', visible[1], 8).ids, ['b', 'c'])
  assert.deepEqual(pick.apply(visible, [], 'sameProject', visible[0], 8).ids, ['a', 'b'])
  // 基准为非 compose 容器 → 同项目不选任何东西
  assert.deepEqual(pick.apply(visible, [], 'sameProject', { id: 'x', composeProject: null }, 8).ids, [])

  // 计数按剩余名额截断；over 如实报出被略过的数量
  // 4 个可见、上限 2 → chip 显示 2、另有 2 个超出上限
  const counts = pick.presetCounts(visible, [], null, 2)
  const all = counts.find((item) => item.key === 'all')
  assert.equal(all.count, 2)
  assert.equal(all.over, 2)
  // 已勾 1 个、上限 3 → 只剩 2 个名额
  const tightCounts = pick.presetCounts(visible, ['a'], null, 3).find((item) => item.key === 'all')
  assert.equal(tightCounts.count, 2)
  assert.equal(tightCounts.over, 1)
  // 基准类预设在没有勾选时不出现
  assert.equal(pick.presetCounts(visible, [], null, 8).some((item) => item.key === 'sameImage'), false)
})

await test('聚合日志：暂停期间的缓冲合并（环形上限、不丢行）', () => {
  const exports_ = registration.factory((spec) => SEED[spec])
  const agg = exports_.__aggLogs
  assert.ok(agg !== undefined && typeof agg.mergeBuffered === 'function', '缺少 __aggLogs 测试缝')
  const entries = [{ service: 'a', text: '1' }, { service: 'a', text: '2' }]
  // 无缓冲：原样返回（同一引用，避免无谓重渲染）
  assert.equal(agg.mergeBuffered(entries, [], 5000), entries)
  // 有缓冲：按到达顺序追加在后
  const merged = agg.mergeBuffered(entries, [{ service: 'b', text: '3' }], 5000)
  assert.deepEqual(merged.map((row) => row.text), ['1', '2', '3'])
  // 超过上限：丢最旧、保最新（与 FOLLOW 的环形语义一致）
  const many = Array.from({ length: 5 }, (_, index) => ({ service: 'a', text: String(index) }))
  // 旧 1 行 + 新 5 行 = 6 行，上限 3 → 保留最新 3 行（[2,3,4]）
  const capped = agg.mergeBuffered([{ service: 'a', text: 'old' }], many, 3)
  assert.equal(capped.length, 3)
  assert.deepEqual(capped.map((row) => row.text), ['2', '3', '4'])
})

await test('聚合日志增强：时间戳解析 / 级别过滤 / 按时间合并 / 导出', () => {
  const exports_ = registration.factory((spec) => SEED[spec])
  const agg = exports_.__aggLogs
  assert.ok(agg !== undefined && typeof agg.orderByTs === 'function', '缺少 __aggLogs 增强测试缝')

  // 时间戳：解析出毫秒并从正文里剥掉；无前缀的行保持原样
  const a = agg.splitTs('2026-09-09T16:11:34.150123456Z hello')
  assert.equal(a.text, 'hello')
  assert.equal(a.ts, Date.parse('2026-09-09T16:11:34.150Z'))
  const b = agg.splitTs('no-prefix line')
  assert.equal(b.ts, null)
  assert.equal(b.text, 'no-prefix line')
  // 带时区偏移的写法
  assert.equal(agg.splitTs('2026-09-09T16:11:34+08:00 x').ts, Date.parse('2026-09-09T16:11:34+08:00'))

  // 级别：两种常见前缀都认
  assert.equal(agg.levelName('[INFO] [2026-09-09 16:11:34] [main] x'), 'INFO')
  assert.equal(agg.levelName('16:11:34,150 |ERROR in x'), 'ERROR')
  assert.equal(agg.levelName('plain text'), null)

  // 按时间合并：两个容器的行交错成一条真时间线
  const rows = [
    { service: 'a', text: 'a2', ts: 200 },
    { service: 'b', text: 'b1', ts: 100 },
    { service: 'a', text: 'a3', ts: 300 },
    { service: 'b', text: 'b2', ts: 150 },
  ]
  assert.deepEqual(agg.orderByTs(rows).map((row) => row.text), ['b1', 'b2', 'a2', 'a3'])
  // 尾部回填重排：先到的 A 历史批次、后到的 B 历史批次，能在最近 N 行内被纠正
  const batch1 = [{ service: 'a', text: 'a-late', ts: 900 }, { service: 'a', text: 'a-early', ts: 100 }]
  const afterBatch1 = agg.orderByTs(batch1)
  assert.deepEqual(afterBatch1.map((r) => r.text), ['a-early', 'a-late'])
  const batch2 = [{ service: 'b', text: 'b-mid', ts: 500 }]
  const merged = agg.reorderTail(afterBatch1, batch2, agg.REORDER_TAIL)
  assert.deepEqual(merged.map((r) => r.text), ['a-early', 'b-mid', 'a-late'], '后到的批次应把尾部重新排好')
  // 超出尾部窗口的旧行保持不动（只回填最近 N 行）
  const longTail = Array.from({ length: 5 }, (_, i) => ({ service: 'a', text: 'old' + String(i), ts: i }))
  const kept = agg.reorderTail(longTail, [{ service: 'b', text: 'new', ts: 100 }], 2)
  assert.deepEqual(kept.slice(0, 3).map((r) => r.text), ['old0', 'old1', 'old2'], '窗口外的旧行保持原序')

  // 无时间戳的行沿用前一行的时间（不会被甩到最前/最后）
  const withNull = [
    { service: 'a', text: 'x', ts: 500 },
    { service: 'b', text: 'no-ts', ts: null },
    { service: 'a', text: 'y', ts: 100 },
  ]
  assert.deepEqual(agg.orderByTs(withNull).map((row) => row.text), ['y', 'x', 'no-ts'])

  // 级别过滤：ERROR+ 只留 ERROR/FATAL 与**无级别前缀**的行（未知级别不误杀）
  const mixed = [
    { service: 'a', text: '[INFO] i', ts: 1 },
    { service: 'a', text: '[WARN] w', ts: 2 },
    { service: 'a', text: '[ERROR] e', ts: 3 },
    { service: 'a', text: 'plain continuation', ts: 4 },
  ]
  // 续行继承上一条的级别：ERROR 后面的续行跟着留下，INFO 后面的续行被滤掉
  assert.deepEqual(agg.filterByLevel(mixed, 4).map((row) => row.text), ['[ERROR] e', 'plain continuation'])
  assert.deepEqual(agg.filterByLevel(mixed, 3).map((row) => row.text), ['[WARN] w', '[ERROR] e', 'plain continuation'])
  assert.equal(agg.filterByLevel(mixed, 0).length, 4)
  // Spring Boot 形态：时间戳在前、级别用竖线；其后的堆栈续行应继承 ERROR
  const spring = [
    { service: 'a', text: '16:11:34,150 |INFO in x', ts: 1 },
    { service: 'a', text: '16:11:35,150 |ERROR in y', ts: 2 },
    { service: 'a', text: '  at com.foo.Bar(baz.java:1)', ts: 3 },
    { service: 'a', text: '  at com.foo.Qux(baz.java:2)', ts: 4 },
    { service: 'a', text: '16:11:36,150 |DEBUG in z', ts: 5 },
  ]
  assert.deepEqual(agg.filterByLevel(spring, 4).map((row) => row.text), [
    '16:11:35,150 |ERROR in y',
    '  at com.foo.Bar(baz.java:1)',
    '  at com.foo.Qux(baz.java:2)',
  ])
  // 窗口开头的续行（记录头在窗口外）无从判断 → 保留
  assert.deepEqual(agg.filterByLevel([{ service: 'a', text: 'orphan continuation', ts: 1 }], 4).map((r) => r.text), ['orphan continuation'])

  // 导出：.log 是纯行；.md 带来源表头且正文进围栏
  const items = [{ name: 'web' }, { name: 'api' }]
  const logText = agg.exportText(mixed.slice(0, 2), { format: 'log' })
  assert.equal(logText.split('\n').length, 2)
  assert.ok(logText.startsWith('[a] '), '每行应带服务前缀')
  assert.ok(logText.includes(new Date(1).toISOString()), '.log 行内含 ISO 时间戳')
  const md = agg.exportText(mixed.slice(0, 2), { format: 'md', target: '目标1', targetLabel: 'root@10.0.0.5', items })
  assert.ok(md.startsWith('# 聚合日志'), 'md 应有标题')
  assert.ok(md.includes('容器（2）：web、api'), 'md 应列出源容器')
  assert.ok(md.includes('```text'), 'md 正文应在代码围栏里')
  assert.ok(md.includes('- 行数：2'))
})

await test('记住上次选的目标：优先级与失效回退', () => {
  const exports_ = registration.factory((spec) => SEED[spec])
  const panel = exports_.__panel
  assert.ok(panel !== undefined && typeof panel.chooseInitialTarget === 'function', '缺少 __panel 测试缝')
  const list = [{ name: '本机' }, { name: 'prod' }, { name: 'lab' }]

  // 连接栏指定（current 非空）优先于一切
  assert.equal(panel.chooseInitialTarget(list, 'lab', 'prod', false), 'lab')
  // 记住的目标仍在列表里 → 用它
  assert.equal(panel.chooseInitialTarget(list, '', 'lab', false), 'lab')
  // 记住的目标已被删/改名 → 退回第一个，而不是停在一个不存在的目标上
  assert.equal(panel.chooseInitialTarget(list, '', 'gone', false), '本机')
  // 没有记忆 → 第一个；列表为空 → 空串
  assert.equal(panel.chooseInitialTarget(list, '', '', false), '本机')
  assert.equal(panel.chooseInitialTarget([], '', 'prod', false), '')
  // 连接栏进来但会话主机没匹配到目标（sessionScoped）→ 不自动选
  assert.equal(panel.chooseInitialTarget(list, '', 'prod', true), '')

  // 侧边栏入口传空串（不是 undefined）：必须当「没指定」处理，否则会盖掉记忆值
  assert.equal(''.trim() !== '' ? '' : 'prod', 'prod')
  // 存储不可用（Node 桩里没有 localStorage / 隐私模式）时必须静默降级，不抛异常
  assert.equal(panel.readLastTarget(), '')
  panel.writeLastTarget('prod')
  assert.equal(panel.readLastTarget(), '')
  assert.equal(panel.LAST_TARGET_KEY, 'dsh-docker:last-target')
})

await test('切目标的过渡：过期标注 / 内容锁定 / 淡入 / 失败清空', () => {
  const decoded = decodeBundle(code)
  // 归属不一致时出横幅并锁住正文；数据落地才解锁
  // 可见文案：状态 + 归属两段，不写成一句话；完整解释在 title 里
  assert.ok(decoded.includes('正在切换到'), '缺少切换状态文案')
  assert.ok(decoded.includes('当前显示：'), '缺少数据归属文案')
  assert.ok(decoded.includes('切换完成前不可操作'), '缺少 title 里的完整说明')
  assert.ok(!decoded.includes('暂时点不动'), '不该再出现口语化的「点不动」')
  assert.ok(code.includes('dk_switchOverlay'), '缺少切换过渡浮层钩子')
  assert.ok(code.includes('dk_switchPill'), '缺少切换提示胶囊钩子')
  assert.ok(code.includes('@keyframes dk_indeterminate'), '缺少顶部不定长进度条动画')
  // esbuild 会把对象键统一成双引号，所以断言产出形态而不是源码写法
  assert.ok(code.includes('data-stale":'), '缺少正文过期标记（JS 侧设置 data-stale 属性）')
  const staleRule = /\.dk_body\[data-stale="1"\] \.dk_main \{[^}]*\}/.exec(code)?.[0] ?? ''
  assert.ok(staleRule.includes('pointer-events: none'), '过期内容必须锁住指针（否则会把命令发到错的主机）')
  assert.ok(staleRule.includes('opacity'), '过期内容要与当前数据区分')
  // 过渡浮层必须是绝对定位（不推版：横幅会把内容整块推下去）
  const overlayRule = /\.dk_switchOverlay \{[^}]*\}/.exec(code)?.[0] ?? ''
  assert.ok(overlayRule.includes('position: absolute'), '过渡浮层要绝对定位，避免顶部跳动')
  assert.ok(overlayRule.includes('pointer-events: none'), '浮层自身不能吃掉滚动事件')
  // 浮层要水平居中（与 dsh-rss 的加载胶囊同一位置语言：内容区顶部居中）
  assert.ok(overlayRule.includes('justify-content: center'), '胶囊应在内容区顶部居中')
  const pillRule = /\.dk_switchPill \{[^}]*\}/.exec(code)?.[0] ?? ''
  assert.ok(pillRule.includes('color-mix(in srgb, var(--dk-accent)'), '胶囊底色/描边走强调色（蓝色）')
  assert.ok(pillRule.includes('color: var(--dk-accent)'), '胶囊文字走强调色')
  assert.ok(pillRule.includes('backdrop-filter'), '压在旧内容上仍要可读')
  // 淡入动画 + 尊重 reduced-motion
  assert.ok(code.includes('@keyframes dk_dataIn'), '缺少数据落地淡入动画')
  assert.ok(/\.dk_grid \{[^}]*dk_dataIn/.test(code), '网格应带淡入动画')
  assert.ok(code.includes('prefers-reduced-motion'), '动效要尊重 reduced-motion')
  /*
   * 切换失败时清空上个目标的列表，而不是继续张冠李戴。
   * 这条断言看**源码**而不是 bundle：bundle 里局部变量名已被压缩，grep 不到；
   * 而「四个加载器的 catch 都清空自己那份列表」是需要被防回归的结构。
   */
  const source = readFileSync(new URL('../client-src/index.js', import.meta.url), 'utf8')
  for (const clearer of ['setContainers([])', 'setImages([])', 'setNetworks([])', 'setVolumes([])']) {
    assert.ok(source.includes('if (listTargetRef.current !== target) ' + clearer), '切换失败要清空：' + clearer)
  }
})

await test('样式表：折叠态（data-sidebar-collapsed）隐藏入口标签', () => {
  // DSH 外壳（dsh-client-ui-layout）在侧边栏折叠时打这个属性；tty 入口同款规则。
  // 少了它，窄栏里会溢出一条竖排文字（真实踩过的回归）
  assert.ok(code.includes('[data-sidebar-collapsed] [data-dsh-docker-entry]'), '缺少折叠态入口规则')
  assert.ok(code.includes('[data-sidebar-collapsed] .dk_entryLabel'), '缺少折叠态标签隐藏规则')
})

await test('样式表：字段标签锁死 line-height（中英混排的行框不等高会让输入框错开）', () => {
  // 中文走 PingFang SC 回退字体，行框比纯拉丁文本高 ~2px；.dk_fieldGrid 是 align-items:start，
  // 同一行里「docker CLI」和「统计刷新间隔（秒）」的输入框就会差 2px（真实踩过的回归）。
  // 行高必须写死，不能留给字体度量决定 —— 这条只在无浏览器环境里守「规则还在」。
  const rule = /\.dk_label \{[^}]*\}/.exec(code)?.[0] ?? ''
  assert.notEqual(rule, '', '找不到 .dk_label 规则')
  assert.ok(/line-height:\s*[0-9]/.test(rule), '.dk_label 缺少数值 line-height')
})

await test('样式表：聚合日志的过滤行不参与纵向伸缩（否则过滤后整条工具条被撑高）', () => {
  // 同一条 .dk_filterBar 挂在两处：单容器视图在 .dk_tabs（横向行）里，flex:1 1 auto 是
  // 「横向占满剩余宽度」，正确；聚合日志（ComposeLogs）里它是 .dk_logs（纵向 flex）的直接
  // 子项，同一个 flex:1 1 auto 变成**纵向撑高**——过滤到少量行时日志体基准高度变小、剩余
  // 空间出现，工具条与 .dk_logBody 各分一半，整条工具条长成两百多像素的横条（输入框垂直
  // 居中、状态行被顶到下面），也就是「输入文字后界面变形」（真实踩过的回归）。
  // 这里只守「规则还在」，真实布局需浏览器。
  const rule = /\.dk_logs > \.dk_filterBar \{[^}]*\}/.exec(code)?.[0] ?? ''
  assert.notEqual(rule, '', '缺少 .dk_logs > .dk_filterBar 规则')
  assert.ok(/flex:\s*0\s+0\s+auto/.test(rule), '.dk_logs > .dk_filterBar 必须 flex:0 0 auto（否则工具条被纵向撑高）')
})

await test('日志 FOLLOW：bundle 内含 SSE 订阅与「回到底部」交互', () => {
  // 静态断言锁住契约（真实点击路径需要浏览器，由手工清单覆盖）：
  assert.ok(code.includes('/logs/stream'), '缺少 SSE 订阅 URL')
  assert.ok(code.includes('EventSource'), '缺少 EventSource 订阅')
  assert.ok(code.includes('dk_pillFollow'), '缺少 FOLLOW 激活态样式钩子')
  assert.ok(code.includes('dk_backToBottom'), '缺少「回到底部」浮层')
  // esbuild 默认 charset=ascii：中文在 bundle 里是 \uXXXX，先解码再断言
  const decoded = code.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
  assert.ok(decoded.includes('实时跟随'), '缺少 FOLLOW 提示文案')
  assert.ok(decoded.includes('回到底部'), '缺少回到底部文案')
  assert.ok(decoded.includes('容器已退出'), '缺少流结束（容器退出）提示')
})

await test('日志 → 会话桥：右键菜单 / 诊断包 / 投递面装配进 bundle', () => {
  // 静态断言只锁**字符串字面量**：局部函数名会被 esbuild minify 改名，断在函数名
  // 上必假（实测产物里查不到 buildAskPrompt / onLogContextMenu / askTarget）。
  assert.ok(code.includes('data-log-ts'), '聚合日志行缺时间戳 dataset（诊断包时间窗的唯一来源）')
  assert.ok(code.includes('dk_menu'), '缺少右键菜单样式钩子')
  assert.ok(code.includes('dk_askCard'), '缺少预览卡片样式钩子')
  assert.ok(code.includes('dk_askToast'), '缺少失败提示样式钩子')
  // 投递必须经**会话作用域**取 conversation：写成根上的会在运行期抛
  // （conversation.send requires a session scope）
  assert.ok(code.includes('"conversation"') || code.includes("'conversation'"), '缺少 scope-addressed 的 conversation 解析')
  assert.ok(code.includes('setDraft'), '缺少「只填输入框」的 setDraft 调用')
  assert.ok(code.includes('.send('), '缺少「直接发送」的 send 调用')
  assert.ok(code.includes('inject(["sessions"]') || code.includes("inject(['sessions']"), 'sessions 未按可选注入挂载')
  // esbuild 默认 charset=ascii：中文在 bundle 里是 \uXXXX，先解码再断言
  const decoded = code.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
  for (const label of ['问 Agent', '预览后发送', '直接发送到当前会话', '只填入输入框', '内容会进入模型上下文']) {
    assert.ok(decoded.includes(label), '缺少文案：' + label)
  }
  // 拿不到会话时菜单项必须能置灰：降级原因要有可显示文案
  assert.ok(decoded.includes('当前没有打开的会话'), '缺少「无当前会话」的降级原因')
  assert.ok(decoded.includes('宿主未提供 sessions 服务'), '缺少「宿主无 sessions」的降级原因')
})

await test('样式表内联进了 bundle（dk_ 前缀 + 侧边栏入口属性）', () => {
  assert.ok(code.includes('dk_backdrop'))
  assert.ok(code.includes('data-dsh-docker-entry'))
  // dock 模式下的刷新 / 只读徽标容器：必须靠右（margin-left:auto），不能回到工具条最左
  assert.ok(code.includes('dk_toolbarEnd'), '缺少 dock 工具条尾部动作容器')
  const toolbarEndRule = /\.dk_toolbarEnd \{[^}]*\}/.exec(code)?.[0] ?? ''
  assert.ok(toolbarEndRule.includes('margin-left: auto'), '.dk_toolbarEnd 缺少 margin-left:auto（刷新必须靠右）')
  // 工具条末尾两个开关必须成组：分开排时末尾那个会被单独挤到第二行（一行一个复选框）
  assert.ok(code.includes('dk_toolbarToggles'), '缺少「含已停止 / 自动刷新」开关组容器')
  const togglesRule = /\.dk_toolbarToggles \{[^}]*\}/.exec(code)?.[0] ?? ''
  assert.ok(togglesRule.includes('inline-flex'), '.dk_toolbarToggles 必须是不可拆的 inline-flex 组')
  // 搜索框是工具条里唯一可伸缩的项：min-width 太大时它会宁可把末尾开关挤到第二行
  const searchRule = /\.dk_search \{[^}]*\}/.exec(code)?.[0] ?? ''
  const searchMin = Number(/min-width:\s*(\d+)px/.exec(searchRule)?.[1] ?? '999')
  assert.ok(searchMin <= 130, '.dk_search 的 min-width 太大（' + String(searchMin) + 'px）：工具条会多出一行只放开关')
  // esbuild 默认 charset=ascii，中文被写成 \uXXXX：解码后再断言文案
  const decoded = code.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
  assert.ok(decoded.includes('Docker 容器'))
  assert.ok(decoded.includes('只读模式'))
})

await test('镜像管理：bundle 内含详情 / 拉取 SSE / 删除 / prune 入口', () => {
  // 静态断言锁住契约：路由与关键 DOM 钩子必须在 bundle 里（真实点击路径需浏览器）
  for (const path of ['/images/inspect', '/images/remove', '/images/prune', '/images/pull/stream']) {
    assert.ok(code.includes(path), '缺少路由 ' + path)
  }
  assert.ok(code.includes('dk_pullBox'), '缺少拉取进度容器')
  // 拉取入口是图标按钮（文字会把窄栏挤换行）：用 ICON_PULL 独有的路径片段锁住
  assert.ok(code.includes('M5.3 6.5L8 9.2l2.7-2.7'), '缺少拉取镜像图标')
  assert.ok(code.includes('dk_historyTable'), '缺少构建历史表')
  assert.ok(code.includes('dk_layerList'), '缺少层列表')
  const decoded = code.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
  assert.ok(decoded.includes('构建历史'), '缺少构建历史文案')
  assert.ok(decoded.includes('拉取镜像'), '缺少拉取镜像文案')
  assert.ok(decoded.includes('清理 dangling 镜像'), '缺少 dangling 清理文案')
  assert.ok(decoded.includes('删除镜像'), '缺少删除镜像文案')
})

await test('stats 实时跟随：SSE 订阅 + 60 点 sparkline', () => {
  assert.ok(code.includes('/stats/stream'), '缺少统计流订阅 URL')
  assert.ok(code.includes('dk_spark'), '缺少 sparkline 样式钩子')
  assert.ok(code.includes('dk_sparkEmpty'), '缺少 sparkline 占位样式钩子')
  assert.ok(code.includes('dk_statsBar'), '缺少统计工具条样式钩子')
  const decoded = code.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
  assert.ok(decoded.includes('实时跟随资源占用'), '缺少 stats FOLLOW 提示文案')
  assert.ok(decoded.includes('60 点'), '缺少 60 点窗口说明')
  assert.ok(decoded.includes('已切回快照轮询'), '缺少统计流结束后的回落文案')
})

await test('Compose 项目视图：按项目分组 + 客户端聚合日志混流', () => {
  assert.ok(code.includes('dk_project'), '缺少项目卡片样式钩子')
  assert.ok(code.includes('dk_logSvc'), '缺少聚合日志来源前缀钩子')
  assert.ok(code.includes('dk_projectRows'), '缺少项目容器行样式钩子')
  assert.ok(code.includes('dk_composeTable'), '缺少项目服务表')
  const decoded = code.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
  assert.ok(decoded.includes('聚合日志'), '缺少聚合日志页签')
  assert.ok(decoded.includes('个项目'), '缺少项目计数文案')
  assert.ok(decoded.includes('自动滚动'), '缺少聚合日志自动滚动开关')
})

/* ------------------------------------------------------------------ *
 * 容器列表多选 → 临时聚合日志
 * ------------------------------------------------------------------ */

/** 取当前 bundle 里的选择态纯逻辑（factory 返回值上的 __pick 测试缝）。 */
function pickApi() {
  const exports_ = registration.factory((spec) => SEED[spec])
  assert.ok(exports_.__pick !== undefined, '缺少 __pick 测试缝')
  return exports_.__pick
}

function carrierApi() {
  const exports_ = registration.factory((spec) => SEED[spec])
  assert.ok(exports_.__carrier !== undefined, '缺少 __carrier 测试缝')
  return exports_.__carrier
}

await test('聚合选择：入口 / 勾选框 / 操作条装配进 bundle', () => {
  // 交互契约用静态断言锁住（真实点击路径需要浏览器，由手工清单覆盖）：
  // 同一个按钮在两种标签间切换、操作条计数与提示、聚合视图标题、Esc 退出。
  const decoded = decodeBundle(code)
  assert.ok(decoded.includes('聚合选择'), '缺少「聚合选择」入口')
  assert.ok(decoded.includes('退出选择'), '缺少选择态下的退出标签（同一个按钮切换）')
  assert.ok(decoded.includes('已选 '), '缺少「已选 N 个容器」计数')
  assert.ok(decoded.includes('聚合日志 · '), '缺少聚合视图标题')
  assert.ok(decoded.includes('至少选择 2 个容器'), '缺少 N<2 的提示')
  assert.ok(decoded.includes('连接数较多，浏览器并发长连接有限制'), '缺少软上限提示')
  // 硬上限文案由「数字 + 后缀」拼出来（数字不写死），且 SSH 与本地后缀不同，
  // 所以这里分开锁静态部分；具体数字由下面 pickDecide 的用例断言。
  assert.ok(decoded.includes('最多 '), '缺少硬上限的「最多」前缀')
  assert.ok(decoded.includes('个容器'), '缺少硬上限的「个容器」文案')
  assert.ok(decoded.includes('，浏览器并发长连接有限制'), '缺少本地目标的硬上限后缀')
  assert.ok(decoded.includes('（SSH 目标上一条连接要同时装实时流与刷新等短命令）'), '缺少 SSH 目标的硬上限后缀')
  assert.ok(decoded.includes('Escape'), '缺少 Esc 退出选择态')
  assert.ok(code.includes('dk_pick'), '缺少勾选框样式钩子')
  assert.ok(code.includes('dk_pickBar'), '缺少聚合操作条样式钩子')
  assert.ok(code.includes('dk_pillPick'), '缺少「聚合选择」激活态样式钩子')
})

await test('聚合选择：N<2 置灰、2~6 可聚合、7~8 软提示、>8 置灰（SSH 目标上限收到 6）', () => {
  const pick = pickApi()
  assert.equal(pick.MAX, 8)
  assert.equal(pick.SOFT_MAX, 6)
  assert.deepEqual(pick.decide(0), { canRun: false, hint: '' })
  assert.deepEqual(pick.decide(1), { canRun: false, hint: '至少选择 2 个容器' })
  assert.deepEqual(pick.decide(2), { canRun: true, hint: '' })
  assert.deepEqual(pick.decide(6), { canRun: true, hint: '' })
  assert.deepEqual(pick.decide(7), { canRun: true, hint: '连接数较多，浏览器并发长连接有限制' })
  assert.deepEqual(pick.decide(8), { canRun: true, hint: '连接数较多，浏览器并发长连接有限制' })
  const over = pick.decide(9)
  assert.equal(over.canRun, false, '超过硬上限必须置灰')
  assert.match(over.hint, /最多 8 个容器/)

  // SSH 目标更紧：一条 TCP 连接的通道额度（MaxSessions 默认 10）要同时装下聚合流、
  // 统计流、事件流与「刷新列表」这类短命令，所以聚合上限收到 6（= 软提示线，于是 SSH
  // 上不再有「可点但已偏多」的区间）。本地目标走子进程，没有这个约束。
  assert.equal(pick.SSH_MAX, 6)
  assert.deepEqual(pick.decide(6, true), { canRun: true, hint: '' })
  const sshOver = pick.decide(7, true)
  assert.equal(sshOver.canRun, false, 'SSH 目标上 7 个容器必须置灰')
  assert.match(sshOver.hint, /最多 6 个容器/)
  assert.match(sshOver.hint, /SSH 目标/, '提示必须说明 SSH 上为什么更紧')
  assert.equal(pick.decide(7, false).canRun, true, '本地目标不受 SSH 上限影响')
})

await test('聚合选择：勾选增删保序 + 列表刷新按 id 对账', () => {
  const pick = pickApi()
  let ids = []
  ids = pick.toggle(ids, 'a')
  ids = pick.toggle(ids, 'b')
  assert.deepEqual(ids, ['a', 'b'], '新勾选追加在末尾（= 流的打开顺序）')
  ids = pick.toggle(ids, 'a')
  assert.deepEqual(ids, ['b'], '再点一次 = 取消，剩余顺序不变')
  assert.deepEqual(pick.toggle(ids, 'c'), ['b', 'c'])
  // 列表刷新：c 已消失 → 自动剔除；没变化时必须返回原引用（自动刷新 5s 一次，
  // 否则每次都会白触发一轮渲染）
  const containers = [{ id: 'b' }, { id: 'd' }]
  assert.deepEqual(pick.reconcile(['b', 'c'], containers), ['b'])
  const untouched = ['b']
  assert.equal(pick.reconcile(untouched, containers), untouched)
})

await test('聚合选择：聚合视图的 items = 所选容器集合（按勾选顺序）', () => {
  const pick = pickApi()
  const containers = [
    { id: 'a', name: 'web' },
    { id: 'b', name: 'api' },
    { id: 'c', name: 'db' },
  ]
  assert.deepEqual(pick.items(containers, ['c', 'a']).map((item) => item.name), ['db', 'web'])
  // 对账兜底：勾选里混进已消失的 id 时跳过（不抛错、不在结果里留空位）
  assert.deepEqual(pick.items(containers, ['a', 'gone']).map((item) => item.name), ['web'])
  assert.deepEqual(pick.items(containers, []), [])
})

/* ------------------------------------------------------------------ *
 * 容器列表「活动」条（docker events）
 * ------------------------------------------------------------------ */

/** 取当前 bundle 里事件活动条的纯逻辑（factory 返回值上的 __events 测试缝）。 */
function eventsApi() {
  const exports_ = registration.factory((spec) => SEED[spec])
  assert.ok(exports_.__events !== undefined, '缺少 __events 测试缝')
  return exports_.__events
}

await test('活动条：bundle 内含 /events/stream + 活动条装配', () => {
  assert.ok(code.includes('/events/stream'), '缺少事件流订阅 URL')
  assert.ok(code.includes('dk_activity'), '缺少活动条样式钩子')
  assert.ok(code.includes('dk_activityChevron'), '缺少折叠箭头样式钩子')
  assert.ok(code.includes('data-action'), '缺少动作着色键')
  const decoded = decodeBundle(code)
  assert.ok(decoded.includes('活动'), '缺少「活动」标题')
  assert.ok(decoded.includes('实时接收中（docker events）'), '缺少事件流连接态文案')
  assert.ok(decoded.includes('暂无事件'), '缺少空态文案')
  assert.ok(decoded.includes('事件流已结束'), '缺少事件流结束提示')
  assert.ok(decoded.includes('正在自动重连'), '缺少重连文案')
})

await test('活动条：环形缓冲（新的在前、超限丢最旧）与动作标签', () => {
  const api = eventsApi()
  assert.equal(api.LIMIT, 50)
  assert.equal(api.RECENT, 8)
  let list = []
  list = api.append(list, { action: 'start', name: 'a' }, api.LIMIT)
  list = api.append(list, { action: 'die', name: 'b', exitCode: 137 }, api.LIMIT)
  assert.deepEqual(list.map((event) => event.name), ['b', 'a'], '新事件排在最前')
  // 超限丢最旧：塞 LIMIT + 5 条，留下的应是最新 LIMIT 条
  let many = []
  for (let index = 0; index < api.LIMIT + 5; index += 1) many = api.append(many, { action: 'start', name: 'c' + String(index) }, api.LIMIT)
  assert.equal(many.length, api.LIMIT)
  assert.equal(many[0].name, 'c' + String(api.LIMIT + 4))
  assert.equal(many[many.length - 1].name, 'c5')
  // die 带上退出码更好认；其它动作原样
  assert.equal(api.actionText({ action: 'die', exitCode: 137 }), 'die(137)')
  assert.equal(api.actionText({ action: 'die' }), 'die')
  assert.equal(api.actionText({ action: 'start' }), 'start')
  assert.equal(api.actionText({ action: 'health_status: healthy' }), 'health_status: healthy')
  assert.equal(api.actionText({ action: '' }), '?')
})

await test('活动条：时间格式化（本地时区）与防抖（连续事件只刷一次列表）', async () => {
  const api = eventsApi()
  assert.equal(api.DEBOUNCE_MS, 500)
  const at = new Date(1700000000 * 1000)
  const pad = (value) => String(value).padStart(2, '0')
  const expected = pad(at.getHours()) + ':' + pad(at.getMinutes()) + ':' + pad(at.getSeconds())
  assert.equal(api.timeText(1700000000), expected)
  assert.equal(api.timeText(null), '--:--:--')

  // 防抖：一帧事件一次列表重取会把刚省掉的轮询成本原样搬回来，所以必须合并
  let runs = 0
  const debounced = api.debounce(20, () => { runs += 1 })
  debounced.schedule()
  debounced.schedule()
  debounced.schedule()
  await new Promise((resolve) => setTimeout(resolve, 60))
  assert.equal(runs, 1, '连续 3 次事件只应触发 1 次刷新')
  debounced.schedule()
  debounced.cancel()
  await new Promise((resolve) => setTimeout(resolve, 60))
  assert.equal(runs, 1, 'cancel 后不应再触发（切 target / 关面板的清理路径）')
})

await test('变更操作执行中态：按钮转圈 + 卡片锁组 + 确认框不关', () => {
  // 三处过渡态钩子：按钮 data-busy（图标换转圈）、卡片 data-pending（整组变更按钮压暗锁住）、
  // 确认框 k_confirmBusy（保持打开 + 「执行中…」）。真实点击路径需要浏览器，这里锁契约。
  assert.ok(code.includes('data-busy'), '缺少按钮执行中钩子')
  assert.ok(code.includes('data-pending'), '缺少卡片执行中钩子')
  assert.ok(code.includes('dk_confirmBusy'), '缺少确认框忙碌样式钩子')
  const decoded = decodeBundle(code)
  assert.ok(decoded.includes('执行中…'), '缺少确认框忙碌文案')
  assert.ok(decoded.includes('正在执行 '), '缺少按钮「正在执行 …」提示')
  assert.ok(decoded.includes('…请稍候'), '缺少「请稍候」提示')
  // busy 按钮同时也是 disabled：必须把 disabled 的 opacity .45 顶回 1，否则转圈跟着变淡
  const busyRule = /\.dk_iconBtn\[data-busy="1"\]:disabled \{[^}]*\}/.exec(code)?.[0] ?? ''
  assert.ok(busyRule.includes('opacity: 1'), '.dk_iconBtn[data-busy] 没顶掉 disabled 的透明度')
  const busyConfirmRule = /\.dk_confirm\[data-busy="1"\] \.dk_btnDanger \{[^}]*\}/.exec(code)?.[0] ?? ''
  assert.ok(busyConfirmRule.includes('opacity: 1'), '忙碌确认键没顶掉 disabled 的透明度')
})

/* ------------------------------------------------------------------ *
 * 网络 / 卷（列表 + 详情）
 * ------------------------------------------------------------------ */

await test('网络 / 卷：五段切换 + 两个列表 + 详情装配进 bundle', () => {
  // 静态断言锁契约（真实点击路径需要浏览器，由手工清单覆盖）
  const decoded = decodeBundle(code)
  // 分段从三段长到五段
  for (const label of ['容器', '镜像', 'Compose', '网络', '卷']) {
    assert.ok(decoded.includes(label), '缺少分段标签 ' + label)
  }
  // 8 个新端点都在客户端有调用点
  for (const path of ['/networks', '/networks/inspect', '/networks/remove', '/networks/prune', '/volumes', '/volumes/inspect', '/volumes/remove', '/volumes/prune']) {
    assert.ok(code.includes(path), '缺少端点调用 ' + path)
  }
  // 样式钩子：可点击行 + 路径列省略
  assert.ok(code.includes('dk_rowClickable'), '缺少可点击行样式钩子')
  assert.ok(code.includes('dk_pathCell'), '缺少挂载点列样式钩子')
  // 图标（ICON_NETWORK / ICON_VOLUME 独有的路径片段）
  assert.ok(code.includes('M5.1 12.2h5.8'), '缺少网络图标')
  assert.ok(code.includes('M3.4 4.2v7.6'), '缺少卷图标')
  // 列表列名与详情页文案
  assert.ok(decoded.includes('接入的容器'), '缺少「接入的容器」页签')
  assert.ok(decoded.includes('子网'), '缺少子网一行')
  assert.ok(decoded.includes('挂载点'), '缺少挂载点一行')
  assert.ok(decoded.includes('搜索网络'), '缺少网络搜索框')
  assert.ok(decoded.includes('搜索卷'), '缺少卷搜索框')
  // 分段容器允许横向滚动（五段在 520px 窄栏里可能放不下）
  const segRule = /\.dk_seg \{[^}]*\}/.exec(code)?.[0] ?? ''
  assert.ok(segRule.includes('overflow-x: auto'), '.dk_seg 没允许横向滚动')
})

await test('网络 / 卷：删除与 prune 的 gated 文案 + 卷清理的数据警告', () => {
  const decoded = decodeBundle(code)
  // 每个 prune / 删除都有「需要打开允许变更操作」的两态文案（图标化后 title 是唯一入口）
  assert.ok(decoded.includes('清理未使用的网络'), '缺少网络 prune 文案')
  assert.ok(decoded.includes('清理未使用的卷'), '缺少卷 prune 文案')
  assert.ok(decoded.includes('清理网络需要打开「允许变更操作」'), '缺少网络 prune 门控文案')
  assert.ok(decoded.includes('清理卷需要打开「允许变更操作」'), '缺少卷 prune 门控文案')
  assert.ok(decoded.includes('删除网络'), '缺少删除网络文案')
  assert.ok(decoded.includes('删除卷'), '缺少删除卷文案')
  // 卷 prune 是唯一会删数据的：确认文案必须写明
  assert.ok(decoded.includes('卷里的数据会一起删除'), '缺少卷 prune 的数据丢失警告')
  // 网络删除失败时的可执行提示
  assert.ok(decoded.includes('还有容器接着'), '缺少网络被占用时的提示')
})

/* ------------------------------------------------------------------ *
 * 多目标总览（不选目标，一屏看全部主机）
 * ------------------------------------------------------------------ */

/** 取当前 bundle 里的总览纯逻辑 / 正文渲染（factory 返回值上的 __overview 测试缝）。 */
function overviewApi() {
  const exports_ = registration.factory((spec) => SEED[spec])
  assert.ok(exports_.__overview !== undefined, '缺少 __overview 测试缝')
  return exports_.__overview
}

/** 造一格总览数据（默认一个 SSH 目标，且已经答完）。 */
function ovGroup(name, containers, extra) {
  return { name, kind: 'ssh', label: 'root@10.0.0.5:22', containers, error: '', loaded: true, ...(extra ?? {}) }
}

/**
 * 遍历 bundle 返回的 jsx 树：它只是 { type, props } 的普通对象（见上面的 jsx/jsxs 桩），
 * 所以离线冒烟真能「渲染」总览正文并断言，而不是只 grep bundle 里的字符串。
 */
function treeFind(node, predicate, out) {
  const found = out ?? []
  if (node === null || node === undefined || node === false) return found
  if (Array.isArray(node)) {
    for (const child of node) treeFind(child, predicate, found)
    return found
  }
  if (typeof node !== 'object') return found
  if (predicate(node)) found.push(node)
  treeFind(node.props === undefined ? undefined : node.props.children, predicate, found)
  return found
}

/** 树里所有文本拼起来（断言文案用）。 */
function treeText(node) {
  if (node === null || node === undefined || node === false) return ''
  if (Array.isArray(node)) return node.map(treeText).join('')
  if (typeof node === 'string') return node
  if (typeof node === 'number') return String(node)
  if (typeof node !== 'object') return ''
  return treeText(node.props === undefined ? undefined : node.props.children)
}

await test('总览：入口与文案装配进 bundle（只读页，不做跨目标操作）', () => {
  const decoded = decodeBundle(code)
  assert.ok(decoded.includes('总览'), '缺少「总览」入口')
  assert.ok(decoded.includes('（总览 · 全部目标）'), '缺少总览态的目标选择器说明项')
  assert.ok(decoded.includes('个目标不可达'), '缺少不可达横幅标题')
  assert.ok(decoded.includes('一切正常'), '缺少空态文案')
  assert.ok(decoded.includes('所有目标上都没有需要关注的容器'), '缺少空态说明')
  assert.ok(decoded.includes('需关注容器'), '缺少异常表标题')
  assert.ok(code.includes('dk_ovCards'), '缺少计数卡行样式钩子')
  assert.ok(code.includes('dk_ovCard'), '缺少计数卡钩子')
  assert.ok(code.includes('dk_ovCount'), '缺少计数钩子')
  assert.ok(code.includes('dk_pillOverview'), '缺少总览 pill 样式钩子')
  assert.ok(code.includes('dk_ovTable'), '缺少异常表样式钩子')
  assert.ok(code.includes('dk_rowClickable'), '缺少异常表的可点击行钩子')
  const cardsRule = /\.dk_ovCards \{[^}]*\}/.exec(code)?.[0] ?? ''
  assert.ok(cardsRule.includes('grid'), '.dk_ovCards 应该是网格（一屏多个目标）')
  const errRule = /\.dk_ovCard\[data-state="error"\] \{[^}]*\}/.exec(code)?.[0] ?? ''
  assert.ok(errRule.includes('--dk-danger'), '不可达的计数卡缺少危险色提示')
  assert.ok(code.includes('dk_ovCardLoading'), '缺少计数卡读取态钩子')
  const loadingRule = /\.dk_ovCard\[data-state="loading"\] \{[^}]*\}/.exec(code)?.[0] ?? ''
  assert.ok(loadingRule.includes('opacity'), '读取中的计数卡应压暗，与已有结果区分')
  /*
   * 总览里不再渲染「操作失败」那条单目标失败横幅：它讲的是当前这一个目标，而总览自己按
   * 目标归因（红卡 + 上方不可达横幅）——两条一起出现，同一个 SSH 超时会被看成两个故障。
   * 这条正则贴着压缩后的形状（和其它静态断言一样），minifier 一变就会显式失败。
   */
  assert.match(decoded, /[\w$]+===""\|\|[\w$]+==="overview"\?null:[\s\S]{0,60}操作失败/, '总览里不该再渲染单目标失败横幅')
})

await test('总览：计数口径与列表页「运行中」一致，异常表只收 unhealthy / restarting', () => {
  const api = overviewApi()
  assert.deepEqual(api.counts([
    { state: 'running', health: null },
    { state: 'paused', health: null },
    { state: 'restarting', health: null },
    { state: 'exited', health: null },
    { state: 'created', health: null },
    { state: 'running', health: 'unhealthy' },
  ]), { running: 4, stopped: 2, unhealthy: 1 })
  assert.deepEqual(api.abnormal([
    { name: 'a', state: 'running', health: 'unhealthy' },
    { name: 'b', state: 'restarting', health: null },
    { name: 'c', state: 'exited', health: null },
    { name: 'd', state: 'running', health: 'starting' },
  ]).map((item) => item.name), ['a', 'b'], 'exited 不算异常：没有 exitCode，无法区分崩溃退出与人工停掉')
})

await test('总览：不健康优先于重启中，同级按目标配置顺序；不可达目标独立成清单', () => {
  const api = overviewApi()
  const data = api.data([
    ovGroup('prod', [
      { id: 'p1', name: 'web', state: 'running', health: 'unhealthy', image: 'nginx:1.27', status: 'Up (unhealthy)' },
      { id: 'p2', name: 'api', state: 'restarting', health: null, image: 'app:1', status: 'Restarting' },
      { id: 'p3', name: 'ok', state: 'running', health: null, image: 'redis:7', status: 'Up' },
    ]),
    ovGroup('stg', [
      { id: 's1', name: 'worker', state: 'restarting', health: null, image: 'app:1', status: 'Restarting' },
      { id: 's2', name: 'db', state: 'running', health: 'unhealthy', image: 'pg:16', status: 'Up (unhealthy)' },
    ]),
    ovGroup('lab', [], { error: 'connect ETIMEDOUT 10.0.0.7:22' }),
  ])
  assert.deepEqual(data.rows.map((row) => row.target + '/' + row.item.name), ['prod/web', 'stg/db', 'prod/api', 'stg/worker'], '不健康置顶，同级按目标顺序')
  assert.deepEqual(data.cards.map((card) => [card.name, card.running, card.stopped, card.unhealthy]), [
    ['prod', 3, 0, 1],
    ['stg', 2, 0, 1],
    ['lab', 0, 0, 0],
  ])
  assert.deepEqual(data.unreachable.map((card) => card.name), ['lab'])
  assert.equal(data.loading, false)
})

await test('总览：渐进式落地（一格失败不牵连其余）+ 失败文案压成一行', () => {
  const api = overviewApi()
  let groups = [
    { name: 'prod', kind: 'ssh', label: 'root@10.0.0.5:22', containers: [], error: '', loaded: false },
    { name: 'lab', kind: 'ssh', label: 'root@10.0.0.7:22', containers: [], error: '', loaded: false },
  ]
  groups = api.patch(groups, 'prod', { containers: [{ id: 'a', name: 'web', state: 'running', health: null }], loaded: true })
  const untouched = api.patch(groups, 'nobody', { loaded: true })
  assert.equal(untouched, groups, '目标名不匹配时必须返回原引用（自动刷新每轮都 setState 会白渲染）')
  groups = api.patch(groups, 'lab', { error: ('BOOM ' + 'x'.repeat(400)), loaded: true })
  const data = api.data(groups)
  assert.equal(data.cards[0].error, '', 'prod 的成功结果不能被 lab 的失败污染')
  assert.equal(data.cards[0].running, 1)
  assert.equal(data.cards[1].error.length, api.ERROR_MAX + 1, '失败文案应截断到上限 + 省略号')
  assert.equal(data.unreachable.length, 1)
  assert.equal(data.loading, false)
  assert.equal(api.errorText('first\nsecond'), 'first', 'SSH 报错只留首行')
  assert.equal(api.errorText(''), '未知错误')
})

await test('总览：渲染多目标计数卡 + 异常置顶表 + 单目标失败横幅（遍历 jsx 树）', () => {
  const api = overviewApi()
  const opened = []
  const tree = api.body(api.data([
    ovGroup('本机', [{ id: 'l1', name: 'web', state: 'running', health: null, image: 'nginx:1.27', status: 'Up' }], { kind: 'local', label: '本机' }),
    ovGroup('prod', [
      { id: 'p1', name: 'api', state: 'restarting', health: null, image: 'app:1', status: 'Restarting' },
      { id: 'p2', name: 'db', state: 'running', health: 'unhealthy', image: 'pg:16', status: 'Up (unhealthy)' },
    ]),
    ovGroup('lab', [], { error: 'connect ETIMEDOUT 10.0.0.7:22' }),
  ]), {
    onOpenTarget: (name) => opened.push(['target', name]),
    onOpenContainer: (name, item) => opened.push(['container', name, item.name]),
  })
  const cards = treeFind(tree, (el) => el.props?.className === 'dk_ovCard')
  assert.equal(cards.length, 3, '每个目标一张计数卡')
  const texts = treeText(tree)
  for (const expected of ['本机', '运行中', '已停止', '不健康', '需关注容器（2）', 'api', 'db', '不可达']) {
    assert.ok(texts.includes(expected), '渲染结果缺少 ' + expected)
  }
  // 原因徽标（摘要兜底口径）：restarting → 反复重启、unhealthy → 不健康
  const reasons = treeFind(tree, (el) => el.props?.className === 'dk_reason')
  assert.deepEqual(reasons.map((el) => el.props['data-reason']).sort(), ['restarting', 'unhealthy'], '异常行应带原因徽标')
  // 横幅是组件元素（className 由 Banner 自己给），所以断言它的入参而不是 className
  assert.equal(treeFind(tree, (el) => typeof el.props?.title === 'string' && el.props.title.includes('个目标不可达')).length, 1, '单个目标失败应出一条横幅')
  assert.equal(cards.filter((card) => card.props['data-state'] === 'error').length, 1)
  const rows = treeFind(tree, (el) => el.props?.className === 'dk_rowClickable')
  assert.equal(rows.length, 2)
  assert.equal(treeFind(tree, (el) => el.props?.className === 'dk_actionBar').length, 0, '总览是只读页，不该出现变更入口')
  assert.equal(treeFind(tree, (el) => el.props?.className === 'dk_iconBtn').length, 0, '总览不该出现任何操作按钮')
  rows[0].props.onClick()
  assert.deepEqual(opened, [['container', 'prod', 'db']], '点第一行 = 不健康那条，且带的是它自己的 target')
  cards[1].props.onClick()
  assert.deepEqual(opened[1], ['target', 'prod'], '点计数卡 = 切到该目标的常规列表')
  const badges = treeFind(tree, (el) => el.props !== undefined && Object.prototype.hasOwnProperty.call(el.props, 'health'))
  assert.deepEqual(badges.map((el) => el.props.health), ['unhealthy', null], '状态格复用 Badge，拿到规范化后的 health')
})

await test('总览：/attention 权威结果优先于摘要兜底（OOM 可识别）', () => {
  const api = overviewApi()
  const tree = api.body(api.data([
    ovGroup('prod', [
      // 摘要层看不出问题（running + healthy），只有 inspect 才知道它刚被 OOM 杀过
      { id: 'x1', name: 'worker', state: 'running', health: null, image: 'app:1', status: 'Up 3 seconds' },
    ], {
      attention: [{
        id: 'x1',
        name: 'worker',
        state: 'running',
        health: null,
        status: 'Up 3 seconds',
        image: 'app:1',
        reasons: ['oom'],
        oomKilled: true,
        exitCode: 137,
        restartCount: 9,
      }],
    }),
  ]), { onOpenTarget: () => {}, onOpenContainer: () => {} })
  const texts = treeText(tree)
  assert.ok(texts.includes('被 OOM 杀'), '权威原因应渲染出「被 OOM 杀」')
  assert.ok(texts.includes('需关注容器（1）'), '异常表应包含这条权威结果')
  const reasons = treeFind(tree, (el) => el.props?.className === 'dk_reason')
  assert.deepEqual(reasons.map((el) => el.props['data-reason']), ['oom'])

  // 同一份容器，没有 attention 时摘要兜底认不出 → 一切正常（这是精度差异，不是 bug）
  const fallbackTree = api.body(api.data([
    ovGroup('prod', [{ id: 'x1', name: 'worker', state: 'running', health: null, image: 'app:1', status: 'Up 3 seconds' }]),
  ]), { onOpenTarget: () => {}, onOpenContainer: () => {} })
  assert.ok(treeText(fallbackTree).includes('一切正常'), '没有 attention 且摘要正常时应显示一切正常')
})

await test('总览：空态分三种——一切正常 / 还没答完 / 没有目标', () => {
  const api = overviewApi()
  const actions = { onOpenTarget: () => {}, onOpenContainer: () => {} }
  const clean = api.body(api.data([ovGroup('本机', [{ id: 'a', name: 'web', state: 'running', health: null, image: 'nginx', status: 'Up' }], { kind: 'local' }) ]), actions)
  const cleanText = treeText(clean)
  assert.ok(cleanText.includes('一切正常'), '没有异常时应显示「一切正常」')
  assert.equal(treeFind(clean, (el) => el.props?.className === 'dk_ovTable').length, 0, '无异常时不该有异常表')
  const pendingTree = api.body(api.data([
    ovGroup('本机', [{ id: 'a', name: 'web', state: 'running', health: null, image: 'nginx', status: 'Up' }], { kind: 'local' }),
    { name: 'prod', kind: 'ssh', label: '', containers: [], error: '', loaded: false },
  ]), actions)
  const pending = treeText(pendingTree)
  assert.ok(!pending.includes('一切正常'), '还有目标没答完时不能下「一切正常」的结论')
  assert.ok(pending.includes('读取中'), '未答完时应显示读取中')
  // 还没答完的卡不能显示 0/0/0（会被读成「这台机器没有容器」）：只给读取态
  const pendingCards = treeFind(pendingTree, (el) => el.props?.className === 'dk_ovCard')
  assert.deepEqual(pendingCards.map((card) => card.props['data-state']), ['ok', 'loading'])
  assert.equal(treeFind(pendingTree, (el) => el.props?.className === 'dk_ovCardLoading').length, 1)
  assert.equal(treeFind(pendingTree, (el) => el.props?.className === 'dk_ovCardCounts').length, 1, '只有答完的那张卡出数字')
  assert.ok(treeText(api.body(api.data([]), actions)).includes('还没有配置 Docker 目标'), '没有目标时应引导去设置卡片')
})

/* ------------------------------------------------------------------ *
 * 列表写入闸（旧请求作废）
 * ------------------------------------------------------------------ */

await test('列表写入闸：被新请求取代的那一代作废（切目标 / 换页后迟到的响应不许写状态）', () => {
  const exports_ = registration.factory((spec) => SEED[spec])
  assert.ok(exports_.__listSeq !== undefined, '缺少 __listSeq 测试缝')
  const seq = exports_.__listSeq.make()
  const first = seq.next()
  assert.ok(seq.isCurrent(first), '当前这一代有效')
  const second = seq.next()
  assert.ok(!seq.isCurrent(first), '被新请求取代的那一代必须作废（否则旧目标的数据会盖住新目标）')
  assert.ok(seq.isCurrent(second))
  assert.ok(!seq.isCurrent(0))
  // 闸必须真的接在加载器上，而不是只活在测试缝里：属性名不会被压缩改名，按出现次数兜。
  // 四个列表加载器 + 总览，各在 then / catch / finally(settle) 三处过闸。
  const gateUses = code.split('.isCurrent(').length - 1
  assert.ok(gateUses >= 15, '列表写入闸没接在加载器上（期望 ≥ 15 处，实际 ' + String(gateUses) + '）')
})

/* ------------------------------------------------------------------ *
 * 结果
 * ------------------------------------------------------------------ */

let failed = 0
for (const result of results) {
  if (result.ok) {
    console.log(`  ✓ ${result.name}`)
  } else {
    failed += 1
    console.error(`  ✗ ${result.name}\n      ${result.message}`)
  }
}
console.log(`\n[dsh-docker] client-smoke: ${String(results.length - failed)}/${String(results.length)} 通过`)
if (failed > 0) process.exit(1)
