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
  const state = { cards: [], injected: [], connbarFactory: null, renders: 0, unmounted: 0, execCalls: [], mountCalls: [], paneCalls: [] }
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
  assert.deepEqual(state.injected.sort(), ['ttyConnbar', 'ttyPanel', 'ttyTerminal'])
  assert.equal(state.connbarFactory, null)
  assert.equal(state.execCalls.length, 0)
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

await test('ttyTerminal：可选注入成功，且 bundle 内含 exec 命令与复制兜底', () => {
  const exports_ = registration.factory((spec) => SEED[spec])
  const { ctx, state } = makeClientCtx({ ttyConnbar: false, ttyTerminal: true })
  const dispose = exports_.apply(ctx)
  assert.deepEqual(state.injected.sort(), ['ttyConnbar', 'ttyPanel', 'ttyTerminal'])
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

await test('样式表内联进了 bundle（dk_ 前缀 + 侧边栏入口属性）', () => {
  assert.ok(code.includes('dk_backdrop'))
  assert.ok(code.includes('data-dsh-docker-entry'))
  // esbuild 默认 charset=ascii，中文被写成 \uXXXX：解码后再断言文案
  const decoded = code.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
  assert.ok(decoded.includes('Docker 容器'))
  assert.ok(decoded.includes('只读模式'))
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
