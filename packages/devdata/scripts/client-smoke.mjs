#!/usr/bin/env node
/**
 * 配置卡片的客户端冒烟：手写 `client.js` 用假宿主 + hook 状态真跑请求与重渲染，**不连真实目标**。
 *
 * 它守的是「仅靠静态 lint 看不到」的那一层：客户端拼的请求体长什么样、三态结果怎么落、
 * 上下文一变旧结论怎么作废、只有合法观测值才算通过。用例里的断言**逐条对着真机脚本
 * （`scripts/verify-devdata-card.mjs`）的契约写**——两边讲同一件事，只是这里不用真 Chrome。
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const code = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
const calls = []
const state = []
let cursor = 0
let mounted = false
let card
/*
 * 预检（`POST /api/dsh-devdata/preflight`）的假回复。默认给一份「字段非法」的结构化失败，
 * 与真机脚本的第一步一致（它证明失败有恢复路径、且不冒充通过）。
 */
let preflightResponse = { ok: false, context: null, target: null, problems: [{ field: 'root', message: 'invalid root', code: 'BAD_ROOT', hint: '填写绝对路径' }] }
let evidenceResponse
let queryResponse = { ok: true, text: '9' }
let config = {
  enabled: true, announceToAgent: false, auditFile: '/audit/devdata.jsonl', timeoutMs: 3210,
  plan: { maxRows: 12, maxCost: 34 }, engines: ['redis', 'mysql'], envs: ['test-isolated'],
  targets: [
    { id: 'saved-redis', label: 'Saved Redis', engine: 'redis', env: 'test-isolated', scopeDirs: ['/declared/scope'], host: '127.0.0.1', port: 6379, db: 0, dbs: [0, 2], maxScanCount: 80, credentialRef: 'env:FAKE_REDIS_PASS', writeCapability: { env: 'DSH_DEVDATA_WRITE', granted: false, howTo: 'restart with authorization' } },
    { id: 'saved-sql', engine: 'mysql', scopeDirs: ['/sql/scope'] },
  ],
}
let rejectRequest = false
let rejectConfig = false
let deferRequest
let deferConfig
const refs = []
const memos = []
const React = {
  useState(initial) {
    const index = cursor++
    if (!(index in state)) state[index] = initial
    return [state[index], (value) => { state[index] = typeof value === 'function' ? value(state[index]) : value }]
  },
  useCallback(fn) { return fn },
  useRef(initial) {
    const index = cursor++
    if (!(index in refs)) refs[index] = { current: initial }
    return refs[index]
  },
  useMemo(fn, deps) {
    const index = cursor++
    if (!(index in memos) || deps.some((value, i) => !Object.is(value, memos[index].deps[i]))) memos[index] = { deps, value: fn() }
    return memos[index].value
  },
  useEffect(fn) { if (!mounted) fn() },
}
const jsx = (type, props, key) => ({ type, props: props ?? {}, key })
const context = vm.createContext({
  window: { __ModuleLoader__: { load({ factory }) {
    const plugin = factory((name) => name === 'react' ? React : { jsx, jsxs: jsx })
    plugin.apply({
      inject() {}, effect() {},
      slots: {
        inject(_name, fn) { fn() },
        register(options, component) { if (options.name === 'plugins.bundle.config') card = component },
      },
    })
  } } },
  fetch: async (url, options) => {
    calls.push({ url, options })
    if (url.endsWith('/config')) {
      if (rejectConfig) throw new Error('save offline')
      if (deferConfig) await new Promise((resolve) => { deferConfig = resolve })
      if (options?.method === 'POST') {
        const payload = JSON.parse(options.body)
        const previousTargets = config.targets
        config = { ...config, ...payload, plan: { ...config.plan, ...(payload['plan.maxRows'] === undefined ? {} : { maxRows: payload['plan.maxRows'] }), ...(payload['plan.maxCost'] === undefined ? {} : { maxCost: payload['plan.maxCost'] }) } }
        if (payload.targets) config.targets = payload.targets.map((row) => ({ ...row, ...(previousTargets.find((target) => target.id === row.id)?.writeCapability === undefined ? {} : { writeCapability: previousTargets.find((target) => target.id === row.id).writeCapability }) }))
      }
      return { json: async () => ({ ok: true, persisted: true, config }) }
    }
    if (rejectRequest) throw new Error('offline')
    const response = url.endsWith('/preflight') ? preflightResponse : url.endsWith('/evidence') ? evidenceResponse : queryResponse
    if (deferRequest) await new Promise((resolve) => { deferRequest = resolve })
    return { json: async () => response }
  },
})
vm.runInContext(code, context)
/**
 * 渲染一棵树，并把 JSX 上的 `ref` **接上**（真 React 会做的事）。
 *
 * 为什么要接：`<details ref={advancedPanelRef}>` 与目标编辑器上的 `targetEditorRef` 是
 * 「配置数据目标」那枚入口**唯一的**接线点——不接 ref，那条路在冒烟里就只是「画了个按钮」，
 * 点下去什么也不会发生（而静态 lint 看不见这件事）。
 *
 * 每个 ref 对象只对应**一个** DOM 桩（同 React：重渲染不会换掉 ref.current 指向的那个元素），
 * 否则重渲染会把上一次点出来的 `open` 抹掉，那条断言就成了假红。
 */
const elements = new Map()
const dom = (ref) => {
  if (!elements.has(ref)) {
    elements.set(ref, {
      open: false,
      scrolled: undefined,
      scrollIntoView(options) { this.scrolled = options },
    })
  }
  return elements.get(ref)
}
const render = () => {
  cursor = 0
  const tree = card()
  mounted = true
  for (const node of nodes(tree)) {
    const ref = node.props?.ref
    if (ref !== null && typeof ref === 'object') ref.current = dom(ref)
  }
  return tree
}
const flush = async () => { await new Promise((resolve) => setImmediate(resolve)) }
const nodes = (node) => {
  if (Array.isArray(node)) return node.flatMap(nodes)
  if (node === null || typeof node !== 'object') return []
  return [node, ...nodes(node.props?.children)]
}
const hasClass = (node, name) => String(node.props?.className ?? '').split(' ').includes(name)
const section = (name) => nodes(render()).find((node) => hasClass(node, name))
const panel = () => section('dd_preflightPanel')
const field = (name) => nodes(render()).find((node) => node.props.name === name)
const text = (node) => typeof node === 'string' ? node : Array.isArray(node) ? node.map(text).join(' ') : node?.props ? text(node.props.children) : ''
const action = (name, inSection = panel()) => nodes(inSection).find((node) => node.type === 'button' && text(node).includes(name))
/*
 * 主动作按钮按**位置**取（`dd_actions` 里第一个）：它的文案在忙碌时会变成「正在检查…」，
 * 按文案找会在最需要断言 `disabled` 的那一刻失手（那正是这条用例要覆盖的状态）。
 */
const button = () => nodes(panel()).filter((node) => node.type === 'button')[0]
const change = (name, value) => {
  const input = field(name)
  assert.ok(input, 'missing field ' + name)
  assert.notEqual(input.props.disabled, true, name + ' must be editable')
  input.props.onChange({ target: { value, checked: value } })
}
const result = (name) => nodes(section('dd_resultsPanel')).find((node) => node.props['data-check'] === name)
const resultState = (name) => result(name)?.props['data-state'] ?? 'not-verified'
const resultCategory = (name) => result(name)?.props['data-category']
const body = (call) => JSON.parse(call.options.body)
const configPosts = () => calls.filter(({ url, options }) => url.endsWith('/config') && options?.method === 'POST')
const evidenceButton = () => nodes(section('dd_eviPanel')).find((node) => node.type === 'button')
const queryButton = () => action('跑一次', section('dd_queryPanel'))
const readTargetButton = () => action('读取目标', panel())
/*
 * 「保存高级设置」按钮在忙碌时文案变成「保存中…」——按**位置**取（高级设置 `dd_actions` 里
 * 那颗主按钮），否则恰好要在断言 `disabled` 的那一刻找不到它。
 */
const saveButton = () => nodes(section('dd_configAdvanced')).find((node) => hasClass(node, 'dd_btnPrimary'))
const targetRows = () => nodes(section('dd_configAdvanced')).filter((node) => hasClass(node, 'dd_target'))
const targetFields = (index) => nodes(targetRows()[index]).filter((node) => hasClass(node, 'dd_input'))
const editTarget = (index, key, value) => {
  const keys = ['id', 'label', 'engine', 'env', 'scopeDirs', 'maxScanCount', 'host', 'port', 'db', 'dbs', 'credentialRef']
  const input = targetFields(index)[keys.indexOf(key)]
  assert.ok(input, 'missing target field ' + key)
  input.props.onChange({ target: { value } })
}
const confirm = () => nodes(section('dd_configAdvanced')).find((node) => hasClass(node, 'dd_confirm'))
const confirmInput = () => nodes(confirm()).find((node) => node.type === 'input')

/** 一份形状合法的预检成功回复（`{ ok, context, target, problems }`）。 */
const preflightOk = () => ({
  ok: true,
  context: { root: '/work/demo', project: 'demo-app', mode: 'readonly', enabled: { environment: false, data: false, front: false }, readOnly: true },
  target: { id: 'saved-redis', engine: 'redis' },
  problems: [],
})

render()
await flush()
const zones = ['dd_preflightPanel', 'dd_resultsPanel', 'dd_configAdvanced', 'dd_eviPanel', 'dd_queryPanel']
assert.deepEqual(nodes(render()).filter((node) => zones.some((name) => hasClass(node, name))).map((node) => zones.find((name) => hasClass(node, name))), zones)
// 三块「按需展开」的区都必须是默认折叠的 details（证据 / 高级查询 / 高级设置）。
for (const name of ['dd_configAdvanced', 'dd_queryPanel', 'dd_eviPanel']) {
  assert.equal(section(name)?.type, 'details', name + ' must be a details element')
  assert.notEqual(section(name).props.open, true, name + ' must be collapsed by default')
  assert.equal(nodes(section(name))[1].type, 'summary', name + ' must expose a native disclosure summary')
}
// 顶层只有 root / project / 已保存目标三样输入：mode 与三个面开关**一个都不许有**。
for (const name of ['root', 'project']) assert.equal(nodes(render()).filter((node) => node.type === 'input' && node.props.name === name).length, 1)
assert.equal(nodes(render()).filter((node) => node.props.name === 'mode').length, 0, 'mode select must be gone')
assert.equal(nodes(render()).filter((node) => typeof node.props.name === 'string' && node.props.name.startsWith('enabled.')).length, 0, 'face checkboxes must be gone')
assert.equal(nodes(section('dd_eviPanel')).filter((node) => node.type === 'input').length, 0, 'evidence reuses context instead of adding a second root/project form')
// 结果行只有三条，且初始全是未验证。
assert.deepEqual(nodes(section('dd_resultsPanel')).filter((node) => hasClass(node, 'dd_resultRow')).map((node) => node.props['data-check']), [], 'untriggered checks must not occupy result rows')
assert.match(text(section('dd_resultsPanel')), /尚未运行/)
for (const name of ['preflight', 'readonly', 'evidence']) assert.equal(resultState(name), 'not-verified')
for (const name of ['preflight', 'readonly', 'evidence']) assert.equal(resultCategory(name), undefined, 'a not-verified row must not carry a category')
// 顶层动作按钮只有两个（检查配置 / 读取目标）；不再有「查看数据」那种重复入口。
const topButtons = nodes(panel()).filter((node) => node.type === 'button').map(text)
assert.ok(topButtons.includes('检查配置') && topButtons.includes('读取目标'), 'top actions must be Check configuration + Read target')
assert.equal(topButtons.filter((label) => label.includes('查看数据')).length, 0, 'the duplicate read entry must be gone')
// 「读取目标」**全卡片只有一处**：两处讲同一件事会让人以为是两条不同的检查。
assert.equal(nodes(render()).filter((node) => node.type === 'button' && text(node).trim() === '读取目标').length, 1, 'exactly one Read target button may exist')
// 命令原文那条路仍然有它自己的入口（`跑一次`），且只在折叠的高级查询里。
assert.equal(nodes(section('dd_queryPanel')).filter((node) => node.type === 'button' && text(node).trim() === '跑一次').length, 1)
assert.ok(!nodes(panel()).some((node) => hasClass(node, 'dd_msg')), 'preflight messages must not shadow the existing save message selector')
assert.deepEqual(nodes(field('target')).filter((node) => node.type === 'option').map((node) => node.props.value), ['saved-redis', 'saved-sql'])

// 静态作用域拒绝：必须完整显示四项事实，而非只渲染 message。
preflightResponse = { ok: false, context: null, target: { id: 'saved-redis', engine: 'redis' }, problems: [
  { field: 'scope', code: 'OUT_OF_SCOPE', message: 'scope denied', root: '/work/demo', scopeDirs: ['/declared/scope'], hint: 'select an allowed project' },
] }
button().props.onClick()
await flush()
assert.equal(resultState('preflight'), 'fail')
for (const token of ['OUT_OF_SCOPE', '/work/demo', '/declared/scope', '恢复路径', 'select an allowed project']) assert.ok(text(result('preflight')).includes(token), 'scope refusal must show ' + token)
preflightResponse = { ok: false, context: null, target: null, problems: [{ field: 'root', message: 'invalid root', code: 'BAD_ROOT', hint: '填写绝对路径' }] }

// —— 预检失败：结构化问题带码 / 恢复路径，结果行记 fail 并分类 ——
button().props.onClick()
await flush()
assert.equal(calls.at(-1).url, '/api/dsh-devdata/preflight')
assert.equal(calls.at(-1).options.method, 'POST')
assert.deepEqual(body(calls.at(-1)), { root: '', project: '', target: 'saved-redis' }, 'preflight sends exactly { root, project, target }')
assert.match(text(section('dd_resultsPanel')), /root: invalid root/)
assert.equal(resultState('preflight'), 'fail')
assert.equal(resultCategory('preflight'), 'configuration', 'a BAD_ROOT problem maps to the configuration category')
assert.match(text(result('preflight')), /下一步|修正/)
// 改输入即作废（结果行回到未验证，且分类也一并消失）。
change('root', ' /work/demo/../demo ')
assert.doesNotMatch(text(section('dd_resultsPanel')), /invalid root/)
assert.equal(resultState('preflight'), 'not-verified')
assert.equal(resultCategory('preflight'), undefined)

change('project', ' demo-app ')
preflightResponse = preflightOk()
deferRequest = true
button().props.onClick()
assert.equal(button().props.disabled, true)
for (const name of ['root', 'project', 'target']) assert.equal(field(name).props.disabled, true)
await flush()
deferRequest()
deferRequest = null
await flush()
assert.equal(button().props.disabled, false)
assert.equal(resultState('preflight'), 'pass')
assert.match(text(result('preflight')), /配置检查通过，尚未连接目标/)
assert.match(text(section('dd_eviPanel')), /\/work\/demo/)
assert.match(text(section('dd_eviPanel')), /demo-app/)
assert.equal(resultState('readonly'), 'not-verified', 'preflight does not establish the target read')
assert.equal(resultState('evidence'), 'not-verified', 'preflight does not establish evidence')
assert.equal(configPosts().length, 0)

/*
 * 假绿防线：`ok:true` 但缺 `context` / 缺 `target` / `readOnly` 不为真 / `problems` 非空，
 * **一条都不许**记成通过。`target` 那一档是新增的——旧形状没有它，正是「预检连目标都认不出
 * 却报通过」的那类假绿。
 */
const validPreflight = preflightResponse
const malformed = [
  { ok: true, context: preflightOk().context, problems: [] },
  { ok: true, context: preflightOk().context, target: null, problems: [] },
  { ok: true, context: preflightOk().context, target: {}, problems: [] },
  { ok: true, context: preflightOk().context, target: { id: 'other', engine: 'redis' }, problems: [] },
  { ok: true, context: { ...preflightOk().context, readOnly: false }, target: { id: 'saved-redis', engine: 'redis' }, problems: [] },
  { ok: true, context: preflightOk().context, target: { id: 'saved-redis', engine: 'redis' }, problems: [{ field: 'scope', message: 'nope' }] },
  { ok: false, error: 'weird shape' },
]
for (const response of malformed) {
  preflightResponse = response
  button().props.onClick()
  await flush()
  assert.notEqual(resultState('preflight'), 'pass', 'malformed preflight success must not pass: ' + JSON.stringify(response))
  assert.notEqual(resultCategory('preflight'), undefined, 'a failed preflight must carry a category')
}
// 传输错自成一档，且同样是「没验成」（不是通过）。
preflightResponse = validPreflight
rejectRequest = true
button().props.onClick()
await flush()
assert.notEqual(resultState('preflight'), 'pass', 'transport error must not count as preflight pass')
assert.equal(resultCategory('preflight'), 'transport')
assert.match(text(panel()) + text(section('dd_resultsPanel')), /offline/)
assert.equal(button().props.disabled, false)
rejectRequest = false
// 恢复：一次合法回复能重新变绿（不是一次性坏掉）。
button().props.onClick()
await flush()
assert.equal(resultState('preflight'), 'pass')
assert.equal(resultCategory('preflight'), undefined)

// —— 证据链：沿用同一份上下文，不另开输入 ——
const evidenceReport = (states = ['parsed', 'parsed', 'parsed']) => ({ ok: true, report: { root: '/work/demo', project: 'demo-app', faces: ['ready', 'verify', 'web'].map((face, index) => ({ face, path: face + '/demo-app.yaml', tool: 'devdata_verify', state: states[index], count: 1, projectInFile: 'demo-app', projectMatches: true })) } })
evidenceResponse = evidenceReport()
evidenceButton().props.onClick()
await flush()
assert.equal(calls.at(-1).url, '/api/dsh-devdata/evidence')
assert.deepEqual(body(calls.at(-1)), { root: '/work/demo', project: 'demo-app' }, 'evidence must reuse normalized context')
assert.equal(resultState('evidence'), 'pass')
const fullEvidence = evidenceReport()
for (const faces of [[], fullEvidence.report.faces.slice(0, 1), fullEvidence.report.faces.map((face) => ({ ...face, state: 'future' }))]) {
  evidenceResponse = { ok: true, report: { ...fullEvidence.report, faces } }
  evidenceButton().props.onClick()
  await flush()
  assert.notEqual(resultState('evidence'), 'pass', 'empty, incomplete, or unfamiliar evidence reports must not pass')
}
evidenceResponse = evidenceReport(['parsed', 'unknown', 'parsed'])
evidenceButton().props.onClick()
await flush()
assert.notEqual(resultState('evidence'), 'pass', 'unknown evidence must never count as pass')
const unknownFace = nodes(section('dd_eviPanel')).find((node) => node.props['data-face'] === 'verify')
assert.match(text(unknownFace), /未验证/)
assert.doesNotMatch(text(unknownFace), /读到了/)
evidenceResponse = evidenceReport(['parsed', 'missing', 'parsed'])
evidenceButton().props.onClick()
await flush()
assert.notEqual(resultState('evidence'), 'pass')
assert.equal(resultCategory('evidence'), 'configuration', 'a manifest problem is a configuration category')
assert.match(text(result('evidence')), /下一步|修正|查看/)
evidenceResponse = { ok: false, error: 'BAD_ROOT: project root unreadable' }
evidenceButton().props.onClick()
await flush()
assert.match(text(section('dd_eviPanel')), /BAD_ROOT/)
assert.equal(evidenceButton().props.disabled, false)

// —— 固定只读检查：**只有合法观测值（非负安全整数）才算通过** ——
queryResponse = { ok: true, text: '9' }
assert.equal(readTargetButton().props.disabled, false)
deferRequest = true
readTargetButton().props.onClick()
await flush()
assert.equal(calls.at(-1).url, '/api/dsh-devdata/query')
assert.deepEqual(body(calls.at(-1)), { target: 'saved-redis', command: 'DBSIZE', cwd: '/work/demo' }, 'the fixed read uses the shared project root, never target scopeDirs[0]')
for (const name of ['root', 'project', 'target']) assert.equal(field(name).props.disabled, true)
assert.equal(field('command').props.disabled, true)
deferRequest()
deferRequest = null
await flush()
assert.equal(resultState('readonly'), 'pass')
assert.equal(resultCategory('readonly'), undefined, 'a pass carries no failure category')
assert.equal(result('assertions'), undefined, 'business assertions have no executed result row')
assert.equal(nodes(section('dd_eviPanel')).find((node) => node.props['data-business-state'])?.props['data-business-state'], 'not-verified', 'business assertions remain unverified after a successful target read')

/*
 * **合法观测值的反例**：只有「非负安全整数的规范写法」能通过。下面每一条都必须是
 * `not-verified`（**不是 fail**——它是「没验成」，不是「验出问题」），且带 `response` 分类。
 * 覆盖：负数 / 小数 / 非数字 / 超出安全整数 / 前导零 / 正号 / 指数写法 / 空串。
 */
for (const badText of ['-1', '3.5', 'abc', '99999999999999999999', '007', '+7', '1e3', '  ', '']) {
  queryResponse = { ok: true, text: badText }
  readTargetButton().props.onClick()
  await flush()
  assert.notEqual(resultState('readonly'), 'pass', 'illegal DBSIZE observation must not pass: ' + JSON.stringify(badText))
  assert.equal(resultState('readonly'), 'not-verified', 'an illegal observation is not-verified, not fail: ' + JSON.stringify(badText))
  assert.equal(resultCategory('readonly'), 'response', 'an illegal observation is a response-category miss')
  assert.match(text(section('dd_queryPanel')), /非负安全整数/)
}
// 允许首尾空白与规范显示（`0` 与带空白的合法值都算）。
for (const [raw, display] of [['  9  ', '9'], ['0', '0'], ['42', '42']]) {
  queryResponse = { ok: true, text: raw }
  readTargetButton().props.onClick()
  await flush()
  assert.equal(resultState('readonly'), 'pass', 'a canonical non-negative safe integer must pass: ' + JSON.stringify(raw))
  assert.equal(text(nodes(section('dd_queryPanel')).find((node) => hasClass(node, 'dd_queryOut'))), display, 'the canonical display is the parsed integer')
}
// 缺 `text` / 根本不是对象：响应类未验证。
for (const malformedResponse of [{ ok: true }, { ok: true, text: 9 }, null, 'nope']) {
  queryResponse = malformedResponse
  readTargetButton().props.onClick()
  await flush()
  assert.notEqual(resultState('readonly'), 'pass', 'a malformed query response must not pass')
  assert.equal(resultCategory('readonly'), 'response')
}
/*
 * **宿主那六档回复的端到端对照**（与真机脚本 ㊻ 的表逐条对齐）：
 *
 * | 假 Redis 回复 | 宿主整形后到卡片的东西 | 卡片 |
 * |---|---|---|
 * | `:9` | `{ ok:true, text:'9' }` | pass |
 * | `:-1` | `text:'-1'` | not-verified · response |
 * | `$3 3.5`（bulk） | `text:'3.5'` | not-verified · response |
 * | `:3.5` | 协议错 → `EXECUTION_FAILED` | not-verified · execution |
 * | `+abc` | `text:'abc'` | not-verified · response |
 * | `:99999999999999999999` | 协议错 → `EXECUTION_FAILED` | not-verified · execution |
 *
 * 为什么值得单列：协议错（`EXECUTION_FAILED`）与「回复到了但形状不合法」在界面上的分类**不同**
 * ——前者是执行层，后者是响应层。把这两档混成一个，恢复路径就会指错地方。
 */
const hostShaped = [
  ['ok', { ok: true, text: '9' }, 'pass', undefined],
  ['negative', { ok: true, text: '-1' }, 'not-verified', 'response'],
  ['fractionBulk', { ok: true, text: '3.5' }, 'not-verified', 'response'],
  ['fractionProtocol', { ok: false, code: 'EXECUTION_FAILED', error: 'Redis 回复不是合法 RESP：整数回复不是整数：3.5', hint: 'retry' }, 'not-verified', 'execution'],
  ['notInteger', { ok: true, text: 'abc' }, 'not-verified', 'response'],
  ['huge', { ok: false, code: 'EXECUTION_FAILED', error: 'Redis 回复不是合法 RESP：整数回复超出安全整数范围', hint: 'retry' }, 'not-verified', 'execution'],
]
for (const [label, response, state, category] of hostShaped) {
  queryResponse = response
  readTargetButton().props.onClick()
  await flush()
  assert.equal(resultState('readonly'), state, label + ' must be ' + state)
  assert.equal(resultCategory('readonly'), category, label + ' must map to ' + String(category))
}

/*
 * **结构化失败分类**：分类只来自服务端显式的 `category` 或**精确命中**已知拒绝码；三态一律
 * `not-verified`（「没验成」）。这里逐档钉住，并配一条「正文里带 scope 但码是执行错」的反例
 * ——子串推断会把那条归错档。
 */
const structured = [
  ['OUT_OF_SCOPE', 'configuration'],
  ['EXECUTION_FAILED', 'execution'],
  ['AUDIT_NOT_DURABLE', 'audit'],
  ['AUDIT_FAILED', 'audit'],
  ['UNKNOWN_TARGET', 'configuration'],
  ['SOME_FUTURE_CODE', 'response'],
]
for (const [code, category] of structured) {
  queryResponse = { ok: false, code, error: 'denied', hint: 'edit project root' }
  readTargetButton().props.onClick()
  await flush()
  assert.notEqual(resultState('readonly'), 'pass', code + ' must never pass')
  assert.equal(resultState('readonly'), 'not-verified', code + ' is not-verified, not fail')
  assert.equal(resultCategory('readonly'), category, code + ' must map to ' + category)
  assert.match(text(section('dd_queryPanel')), new RegExp(code))
  assert.match(text(section('dd_queryPanel')), /恢复路径.*edit project root/)
}
// 服务端显式给的 category 优先于码表（它是权威）。
queryResponse = { ok: false, code: 'OUT_OF_SCOPE', category: 'transport', error: 'denied' }
readTargetButton().props.onClick()
await flush()
assert.equal(resultCategory('readonly'), 'transport', 'an explicit server category wins')
// 反例：正文里出现 scope，但码是执行错 —— 不许被子串推断成配置类。
queryResponse = { ok: false, code: 'EXECUTION_FAILED', error: 'scope 相关的执行错误', hint: 'retry' }
readTargetButton().props.onClick()
await flush()
assert.equal(resultCategory('readonly'), 'execution', 'category must not be inferred from error substrings')
// 传输错自成一档。
rejectRequest = true
readTargetButton().props.onClick()
await flush()
assert.equal(resultState('readonly'), 'not-verified')
assert.equal(resultCategory('readonly'), 'transport')
assert.match(text(section('dd_queryPanel')), /offline/)
assert.equal(readTargetButton().props.disabled, false)
rejectRequest = false

// —— 命令原文那条路（高级查询）：覆盖作用域，且**不**冒充固定只读检查的结论 ——
queryResponse = { ok: true, text: '9' }
change('scopeOverride', true)
change('cwd', '/explicit/override')
change('command', 'SET scoped-probe 1')
queryResponse = { ok: false, code: 'WRITE_NOT_AUTHORIZED', error: 'write denied', hint: 'restart with authorization' }
queryButton().props.onClick()
await flush()
assert.deepEqual(body(calls.at(-1)), { target: 'saved-redis', command: 'SET scoped-probe 1', cwd: '/explicit/override' })
assert.match(text(section('dd_queryPanel')), /WRITE_NOT_AUTHORIZED/)
assert.match(text(section('dd_queryPanel')), /恢复路径.*restart with authorization/)
assert.equal(resultState('readonly'), 'not-verified', 'an advanced raw command does not establish the fixed read')
queryResponse = { ok: true, text: '9' }
readTargetButton().props.onClick()
await flush()
assert.deepEqual(body(calls.at(-1)), { target: 'saved-redis', command: 'DBSIZE', cwd: '/work/demo' }, 'the fixed read always uses the shared context despite an advanced override')
assert.equal(resultState('readonly'), 'pass')

// —— 上下文一变，旧结论立刻作废（`epoch` 保护在途响应） ——
change('project', 'another')
assert.equal(field('scopeOverride').props.checked, false)
assert.equal(field('cwd').props.value, '')
for (const [name, value] of [['target', 'saved-sql'], ['target', 'saved-redis']]) {
  change('scopeOverride', true)
  change('cwd', '/stale/override')
  change(name, value)
  assert.equal(field('scopeOverride').props.checked, false, name + ' must revoke the old scope override')
  assert.equal(field('cwd').props.value, '', name + ' must clear the old scope override')
}
/*
 * `epoch` 保护：在途请求期间上下文是**锁住的**（改不动输入，所以不可能在飞行中作废），
 * 但响应落地那一刻仍要过 epoch 校验——被后续动作作废过的那一轮**不许**把结论写回来。
 * 这里用「作废后再放行旧响应」的可达路径钉住它：先作废（`clearContextResult` 自增 epoch），
 * 再让上一轮的网络回复到达，结果行必须仍是未验证。
 */
preflightResponse = preflightOk()
const queuedRootChange = field('root').props.onChange
deferRequest = true
button().props.onClick()
await flush()
// 在途：输入锁住、按钮禁用（这是上面那条 `disabled` 断言的同一条性质）。
assert.equal(field('root').props.disabled, true)
assert.equal(button().props.disabled, true)
const inFlight = calls.at(-1)
// 模拟请求开始前已排队的上下文输入事件，先作废再释放旧响应。
queuedRootChange({ target: { value: '/new/context' } })
assert.equal(result('preflight'), undefined)
deferRequest()
deferRequest = null
await flush()
assert.equal(result('preflight'), undefined, 'an obsolete response must not overwrite the new context')
assert.equal(inFlight.url, '/api/dsh-devdata/preflight')
// 再建立一个当前上下文的结果，随后修改输入，确认已显示结果立即作废。
button().props.onClick()
await flush()
assert.equal(resultState('preflight'), 'pass')
change('project', 'changed-after-flight')
assert.equal(resultState('preflight'), 'not-verified', 'editing the context must invalidate immediately')
assert.match(text(section('dd_resultsPanel')), /旧结果立即作废/)
await flush()
assert.equal(resultState('preflight'), 'not-verified', 'an invalidated result must not come back')
assert.equal(nodes(section('dd_eviPanel')).filter((node) => hasClass(node, 'dd_eviRow')).length, 0)
assert.equal(nodes(section('dd_queryPanel')).filter((node) => hasClass(node, 'dd_queryOut')).length, 0)
assert.equal(configPosts().length, 0, 'preflight/evidence/query must not save config')
assert.ok(calls.every(({ url, options }) => ['/preflight', '/evidence', '/query'].some((suffix) => url.endsWith(suffix)) || (url.endsWith('/config') && options?.method !== 'POST')))

// —— 高级设置里那条保存的路：payload 与逐次确认保持原样 ——
/*
 * 标量输入框必须带 `name`（= 那个键）：真机 ㊹ 按 `name === 'timeoutMs'` 找到它再改值。
 * 没有这个锚点，「改一个标量 → 保存 → HTTP 复核」那条路在真机上就定位不到控件。
 */
const advancedInputs = nodes(section('dd_configAdvanced')).filter((node) => node.type === 'input')
for (const key of ['enabled', 'announceToAgent', 'timeoutMs', 'planMaxRows', 'planMaxCost', 'auditFile']) {
  assert.ok(advancedInputs.some((node) => node.props.name === key), 'advanced scalar ' + key + ' must carry its name anchor')
}
saveButton().props.onClick()
await flush()
assert.deepEqual(body(configPosts().at(-1)), { enabled: true, announceToAgent: false, auditFile: '/audit/devdata.jsonl', timeoutMs: 3210, 'plan.maxRows': 12, 'plan.maxCost': 34 })
assert.equal(config.targets.length, 2)
const add = () => action('+ 添加目标', section('dd_configAdvanced'))
add().props.onClick()
const values = { id: ' draft-redis ', label: ' Draft ', engine: 'redis', env: 'test-isolated', scopeDirs: '/new/scope, /second/scope', maxScanCount: '60', host: '127.0.0.1', port: '6380', db: '1', dbs: '0, 2', credentialRef: 'env:FAKE_PASS' }
for (const [key, value] of Object.entries(values)) editTarget(2, key, value)
assert.equal(targetFields(2).length, 11)
assert.ok(!nodes(field('target')).some((node) => node.type === 'option' && node.props.value === 'draft-redis'), 'unsaved drafts are not selectable')
const beforeUnconfirmed = configPosts().length
saveButton().props.onClick()
await flush()
assert.equal(configPosts().length, beforeUnconfirmed, 'target edits require per-save confirmation')
assert.match(text(section('dd_configAdvanced')), /确认/)
confirmInput().props.onChange({ target: { checked: true } })
editTarget(2, 'label', ' Updated draft ')
assert.equal(confirmInput().props.checked, false, 'any target field edit invalidates previous confirmation')
confirmInput().props.onChange({ target: { checked: true } })
deferConfig = true
saveButton().props.onClick()
assert.equal(saveButton().props.disabled, true)
assert.ok(targetFields(2).every((node) => node.props.disabled === true), 'save locks fields so adoption cannot overwrite edits')
assert.equal(field('root').props.disabled, true)
await flush()
deferConfig()
deferConfig = null
await flush()
const targetPayload = body(configPosts().at(-1))
assert.equal(targetPayload.confirmTargetEdit, true)
assert.deepEqual(targetPayload.targets[2], { id: 'draft-redis', label: 'Updated draft', engine: 'redis', env: 'test-isolated', scopeDirs: ['/new/scope', '/second/scope'], maxScanCount: 60, host: '127.0.0.1', port: 6380, db: 1, dbs: [0, 2], credentialRef: 'env:FAKE_PASS' })
assert.deepEqual(targetPayload.targets[0].dbs, [0, 2])
assert.equal(targetPayload.targets[0].credentialRef, 'env:FAKE_REDIS_PASS')
assert.equal(targetPayload.targets[0].writeCapability, undefined, 'capability authorization remains read-only')
assert.equal(confirm(), undefined, 'successful save resets confirmation and dirty state')
assert.ok(nodes(field('target')).some((node) => node.type === 'option' && node.props.value === 'draft-redis'))
change('target', 'saved-redis')
editTarget(0, 'id', 'renamed-redis')
confirmInput().props.onChange({ target: { checked: true } })
saveButton().props.onClick()
await flush()
assert.equal(field('target').props.value, 'renamed-redis', 'saved target rename must not leave a removed id selected')
editTarget(0, 'label', 'retry save')
confirmInput().props.onChange({ target: { checked: true } })
rejectConfig = true
saveButton().props.onClick()
await flush()
assert.match(text(section('dd_configAdvanced')), /save offline/)
assert.equal(saveButton().props.disabled, false)
rejectConfig = false
saveButton().props.onClick()
await flush()
assert.equal(confirm(), undefined)

/*
 * **「配置数据目标」那枚入口只在没有已保存目标时出现，且真的展开并定位到目标编辑器。**
 *
 * 它必须在**没有目标**的那份快照下才渲染（有目标时顶层只该有上下文与两个动作），所以这一段
 * 走的是同一条 `adopt` 路径：把服务端快照换成零目标，重新渲染，再点那枚入口。
 * 判据两件：① 入口出现且文案是「配置数据目标」；② 点它之后高级设置被展开、并且真的对目标编辑器
 * 调了 `scrollIntoView`（只改一个 state 而不滚动 = 画了个能点的样子）。
 */
const savedTargets = config.targets
config = { ...config, targets: [] }
// 触发一次重新读取（`load()` 在首次挂载时跑过；这里用一次保存把新快照 adopt 进来）。
saveButton().props.onClick()
await flush()
const targetlessLink = nodes(render()).find((node) => hasClass(node, 'dd_targetsLink'))
assert.ok(targetlessLink, 'a card with no saved target must offer the "配置数据目标" entry')
assert.equal(text(targetlessLink), '配置数据目标')
assert.deepEqual(nodes(panel()).filter((node) => node.type === 'button').map(text), ['检查配置', '读取目标', '配置数据目标'], 'the targetless entry is the only extra top button')
assert.equal(section('dd_configAdvanced').props.open, undefined, 'advanced starts collapsed')
targetlessLink.props.onClick()
const advancedNode = section('dd_configAdvanced')
assert.equal(advancedNode.props.ref.current.open, true, 'the entry must expand Advanced settings')
// 目标编辑器那一层（带 dd_card 的那个 div）才是滚动目标——没有它就只是展开了一块空的折叠区。
const editor = nodes(section('dd_configAdvanced')).find((node) => hasClass(node, 'dd_card') && hasClass(node, 'dd_panel'))
assert.ok(editor?.props?.ref?.current, 'the target editor must carry the scroll ref')
assert.notEqual(editor.props.ref.current.scrolled, undefined, 'the entry must scroll to the target editor')
assert.equal(editor.props.ref.current.scrolled.block, 'start')
assert.equal(editor.props.ref.current.scrolled.behavior, 'smooth')
config = { ...config, targets: savedTargets }
saveButton().props.onClick()
await flush()
assert.equal(nodes(render()).find((node) => hasClass(node, 'dd_targetsLink')), undefined, 'the entry disappears once a saved target exists')

console.log('[devdata client-smoke] five zones, collapsed advanced/evidence/query, context-only top (no mode/face inputs), three result rows, exact { root, project, target } preflight, preflight pass wording, malformed-success rejection, canonical-DBSIZE-only pass with response category, structured failure categories without substring inference, stale invalidation and epoch protection, targetless "配置数据目标" entry wiring, saved targets, original payload and confirmation safety passed')
