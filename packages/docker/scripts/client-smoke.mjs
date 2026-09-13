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

await test('样式表内联进了 bundle（dk_ 前缀 + 侧边栏入口属性）', () => {
  assert.ok(code.includes('dk_backdrop'))
  assert.ok(code.includes('data-dsh-docker-entry'))
  // dock 模式下的刷新 / 只读徽标容器：必须靠右（margin-left:auto），不能回到工具条最左
  assert.ok(code.includes('dk_toolbarEnd'), '缺少 dock 工具条尾部动作容器')
  const toolbarEndRule = /\.dk_toolbarEnd \{[^}]*\}/.exec(code)?.[0] ?? ''
  assert.ok(toolbarEndRule.includes('margin-left: auto'), '.dk_toolbarEnd 缺少 margin-left:auto（刷新必须靠右）')
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
  // 硬上限文案里的数字由 PICK_MAX 拼出来（不写死常量），所以这里只锁静态部分，
  // 「最多 8 个容器」由下面 pickDecide 的用例断言
  assert.ok(decoded.includes('最多 ') && decoded.includes('个容器，浏览器并发长连接有限制'), '缺少硬上限提示')
  assert.ok(decoded.includes('Escape'), '缺少 Esc 退出选择态')
  assert.ok(code.includes('dk_pick'), '缺少勾选框样式钩子')
  assert.ok(code.includes('dk_pickBar'), '缺少聚合操作条样式钩子')
  assert.ok(code.includes('dk_pillPick'), '缺少「聚合选择」激活态样式钩子')
})

await test('聚合选择：N<2 置灰、2~6 可聚合、7~8 软提示、>8 置灰并提示上限', () => {
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
