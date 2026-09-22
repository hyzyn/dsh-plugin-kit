/**
 * 卡片预览渲染器：把 client.js 的**真实标记与 CSS** 渲染成独立 HTML（可选再截图）。
 *
 * 为什么不用真实 GUI 截图：卡片要展开、面板要滚到位置，脚本化成本高；而 client.js 的
 * CSS 与 React 元素树是可以离线渲染的——用一个最小 fake React 跑一遍组件（真实 hook
 * 顺序、真实样式），把元素树序列化成 HTML，颜色用 @deepseek-ai/dsh-client-ui-theme 的
 * 亮色 token 补齐，得到的就是卡片本身，而不是手写的近似 mock。
 *
 * 用法：
 *   node packages/codegraph/scripts/preview-card.mjs            # 写 .preview/codegraph-card.html
 *   node packages/codegraph/scripts/preview-card.mjs --png      # 再调本机 Chrome 渲染成 PNG
 *   node packages/codegraph/scripts/preview-card.mjs --per-agent # 预览 P0 per-agent 生效态的卡片
 *   node packages/codegraph/scripts/preview-card.mjs --fallback  # 预览 P0「要 per-agent 但退回 managed」的卡片
 *   node packages/codegraph/scripts/preview-card.mjs --busy      # 预览忙碌态（/status 挂住 → 标题行指示器）
 *   node packages/codegraph/scripts/preview-card.mjs --png --tall # 截更高的图（860×1500），看折叠线以下的按钮分组
 *
 * 注意：无头 Chrome 在 DSH 文件沙箱里起不来（它要初始化自己的 sandbox），--png 需要在
 * 普通终端里跑；也可以直接打开 HTML 手动截图。产物目录 .preview/ 已在 .gitignore 里。
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const pkgRoot = resolve(here, '..')
const clientPath = join(pkgRoot, 'client.js')
const outDir = join(pkgRoot, '.preview')

/**
 * 预览模式。**必须在 htmlPath 之前声明**（TDZ）：第一版把这两个 const 放在
 * htmlPath 之后，`--fallback` 直接 `ReferenceError: Cannot access 'perAgent' before
 * initialization` —— 与 `client-lint.mjs` 存在的理由（TS2448「块级变量先用后声明」）
 * 是同一类错误，只是这个脚本不在客户端半体的检查范围内，所以没被闸门拦住。
 */
const perAgent = process.argv.includes('--per-agent')
const fallback = process.argv.includes('--fallback')
/**
 * --busy：把 `/status` 的响应**永远挂住**，于是组件的 `loading` 保持为 true，
 * 好把标题行上的忙碌指示器（转圈 + 文案 + 取消）截出来看。
 * 这是唯一能在无头环境里离线看到忙碌态的办法（真机上它一闪而过）。
 */
const busy = process.argv.includes('--busy')
/**
 * --tall：截图用更高的视口（860×1500）。
 *
 * 默认 860×600 只够看到卡片上半部分——而「索引维护 / 搜索与查询 / Agent 集成」这些
 * 分组都在折叠线以下，改它们时截出来看不到（实测：验证「撤销索引」并入生命周期行时，
 * 默认视口正好把那一行切掉）。只影响截图，不影响 HTML。
 */
const tall = process.argv.includes('--tall')
const htmlPath = join(outDir, perAgent ? 'codegraph-card-per-agent.html' : fallback ? 'codegraph-card-fallback.html' : busy ? 'codegraph-card-busy.html' : 'codegraph-card.html')
const pngPath = join(outDir, perAgent ? 'codegraph-card-per-agent.png' : fallback ? 'codegraph-card-fallback.png' : busy ? 'codegraph-card-busy.png' : 'codegraph-card.png')

/** 预览用的假数据：跟随开启、会话目录与绑定路径不同，好让「跟随会话」这一行有内容。 */
const RESPONSES = {
  '/api/dsh-codegraph/default-path': {
    ok: true,
    defaultPath: '/Users/zz/code/pinned-app',
    effectivePath: '/Users/zz/code/my-app',
    sessionPath: '/Users/zz/code/my-app',
    followSession: true,
    manageEnabled: true,
    announceToAgent: true,
    usageGuidance: true,
    cliAvailable: true,
    command: 'codegraph',
    indexed: true,
    indexState: 'indexed',
    mcp: { mode: 'own', cwd: '/Users/zz/code/my-app', note: '' },
    // P0：默认 managed（保持原行为）。--per-agent 时改成「per-agent 生效」的形态，
    // 好把那条状态文案与勾选态也看一遍（卡片上新增的 UI 必须有办法离线看）。
    mcpScope: perAgent || fallback ? 'per-agent' : 'managed',
    effectiveMcpScope: perAgent ? 'per-agent' : 'managed',
    mcpScopeReason: fallback
      ? '要 per-agent 但宿主没有 agent 事件面（拿不到 agent/created），已退回 managed'
      : perAgent
        ? 'per-agent（每个 agent 一个 scoped MCP 进程）'
        : 'managed（默认：托管行 + 按会话热切换）',
    agentMounts: perAgent ? 2 : 0,
  },
  '/api/dsh-codegraph/status': {
    ok: true,
    path: '/Users/zz/code/my-app',
    status: {
      initialized: true,
      version: '1.5.0',
      projectPath: '/Users/zz/code/my-app',
      lastIndexed: '2026-09-15T02:21:26.167Z',
      fileCount: 173,
      nodeCount: 4553,
      edgeCount: 21414,
      dbSizeBytes: 32694272,
      pendingChanges: { added: 2, modified: 5, removed: 0 },
      languages: ['javascript', 'typescript', 'yaml'],
    },
  },
}
const SESSION = { byId: { s1: { cwd: '/Users/zz/code/my-app' } }, current: 's1' }

/** 亮色主题 token（值取自 @deepseek-ai/dsh-client-ui-theme）。 */
const TOKENS = `:root{
  --dsw-font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;
  --dsw-alias-bg-layer-2:#fff; --dsw-alias-bg-layer-3:#fff;
  --dsw-alias-border-l1:#0000000a; --dsw-alias-border-l2:#0000001a;
  --dsw-alias-label-primary:#0f1115; --dsw-alias-label-secondary:#61666b; --dsw-alias-label-tertiary:#81858c;
  --dsw-alias-label-dimmed:#e1e5ee; --dsw-alias-label-primary-foreground:#fff;
  --dsw-alias-brand-primary:#0f1115; --dsw-alias-button-info-fill:#4176e6; --dsw-alias-button-info-hover:#5686fe;
  --dsw-specific-input-major:#fff; --dsw-alias-interactive-bg-hover:#2631480f;
  --dsw-alias-state-success-primary:#22c55e; --dsw-alias-state-error-primary:#ec1313;
  --dsw-alias-state-warning-primary:#f59e0b; --dsw-alias-state-business-primary:#4176e6;
}
body{margin:0;padding:26px 30px 30px;background:#f5f6f7;font-family:var(--dsw-font-family);-webkit-font-smoothing:antialiased}
.panel{max-width:820px;margin:0 auto}
.panelTitle{color:#0f1115;font-size:18px;font-weight:700;margin:0 0 14px}
ul{margin:0;padding:0}
`

/** 最小 fake React：够跑卡片用到的几个 hook，hook 顺序与真实一致。 */
function makeReact() {
  let hookIndex = 0
  const states = []
  let effects = []
  return {
    React: {
      useState(init) {
        const i = hookIndex++
        if (!(i in states)) states[i] = typeof init === 'function' ? init() : init
        return [states[i], (v) => { states[i] = typeof v === 'function' ? v(states[i]) : v }]
      },
      useMemo(fn) { hookIndex++; return fn() },
      useCallback(fn) { hookIndex++; return fn },
      useEffect(fn) { hookIndex++; effects.push(fn) },
      useSyncExternalStore(_subscribe, get) { hookIndex++; return get() },
    },
    /** 开始一次渲染：重置 hook 游标与本次收集到的 effect。 */
    start() { hookIndex = 0; effects = [] },
    /** 取出并清空本次渲染收集到的 effect。 */
    takeEffects() { const taken = effects; effects = []; return taken },
  }
}

const VOID_TAGS = new Set(['input', 'br', 'img'])
const escapeHtml = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function toHtml(node) {
  if (node === null || node === undefined || node === false || node === true) return ''
  if (typeof node === 'string' || typeof node === 'number') return escapeHtml(node)
  if (Array.isArray(node)) return node.map(toHtml).join('')
  if (typeof node !== 'object') return ''
  const { type, props = {} } = node
  if (typeof type !== 'string') return toHtml(props.children)
  const attrs = Object.entries(props)
    .filter(([key, value]) => key !== 'children' && value !== undefined && value !== null && typeof value !== 'function' && typeof value !== 'object')
    .map(([key, value]) => (key === 'className' ? ` class="${escapeHtml(value)}"` : ` ${key}="${escapeHtml(value)}"`))
    .join('')
  const inner = toHtml(props.children)
  return VOID_TAGS.has(type) ? `<${type}${attrs}>` : `<${type}${attrs}>${inner}</${type}>`
}

async function renderCardHtml() {
  const source = readFileSync(clientPath, 'utf8')
  let capturedCss = ''
  let Card = null
  const fake = makeReact()

  globalThis.fetch = async (url) => {
    const key = Object.keys(RESPONSES).find((k) => String(url).startsWith(k))
    // --busy：让 /status 挂住不返回 → 组件停在 loading 态（见 busy 的注释）
    if (busy && key === '/api/dsh-codegraph/status') return new Promise(() => {})
    return { ok: true, status: 200, json: async () => (key === undefined ? {} : RESPONSES[key]) }
  }
  globalThis.document = {
    getElementById: () => null,
    createElement: () => {
      // CG37 之后 ensureStyle/releaseStyle 的引用计数挂在**元素 dataset** 上
      // （跨代共享的节点要配跨代共享的计数），所以这个假元素必须带 dataset——
      // 早前只有 { id, textContent, remove }，脚本会在这里 TypeError 直接崩。
      const el = { id: '', textContent: '', dataset: /** @type {Record<string,string>} */ ({}), remove() {} }
      // ensureStyle() 会把真实 CSS 写进这个 style 元素——顺路把它捞出来
      queueMicrotask(() => { capturedCss = el.textContent })
      return el
    },
    head: { appendChild() {} },
  }
  globalThis.window = { __ModuleLoader__: { load: (mod) => { globalThis.__codegraphModule = mod } } }
  const requireShim = (name) => {
    if (name === 'react') return fake.React
    if (name === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props: props ?? {} }), jsxs: (type, props) => ({ type, props: props ?? {} }) }
    throw new Error('unexpected require: ' + name)
  }

  eval(source)
  const exports = globalThis.__codegraphModule.factory(requireShim)
  exports.apply({
    sessions: { list: { subscribe: () => () => {}, getSnapshot: () => SESSION } },
    slots: { inject: (_ns, cb) => cb(), register: (_config, component) => { Card = component } },
    effect: (fn) => fn(),
  })
  if (Card === null) throw new Error('卡片组件未注册')

  const flatten = (node, acc = []) => {
    if (node === null || node === undefined || typeof node !== 'object') return acc
    if (Array.isArray(node)) { for (const child of node) flatten(child, acc); return acc }
    if (node.type !== undefined) acc.push(node)
    flatten(node.props?.children, acc)
    return acc
  }

  // 第一次渲染：卡片折叠
  fake.start()
  const collapsed = Card()
  // 展开卡片（点表头）后再渲染一次，让 body 出现并收集它的 effect
  flatten(collapsed).find((n) => n.props?.className === 'cg_cardHeader').props.onClick()
  fake.start()
  let tree = Card()
  for (const fn of fake.takeEffects()) {
    const dispose = fn()
    if (typeof dispose === 'function') dispose()
  }
  // 等 effect 里的 fetch 落地，再渲染出有数据的版本
  await new Promise((r) => setTimeout(r, 30))
  fake.start()
  tree = Card()

  return `<!DOCTYPE html><html lang="zh"><head><meta charset="utf-8"><style>${TOKENS}${capturedCss}</style></head>
<body><div class="panel"><h1 class="panelTitle">设置 · 插件</h1><ul>${toHtml(tree)}</ul></div></body></html>`
}

const html = await renderCardHtml()
mkdirSync(outDir, { recursive: true })
writeFileSync(htmlPath, html)
console.log('预览 HTML:', htmlPath)

if (process.argv.includes('--png')) {
  const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  if (!existsSync(chrome)) {
    console.log('未找到 Google Chrome，跳过 PNG；HTML 已生成，可在浏览器里打开截图。')
  } else {
    // 老版 headless + virtual-time-budget 是这里唯一能稳定退出的组合；
    // --no-sandbox 是因为在受限环境里 Chrome 自己的 sandbox 起不来。
    execFileSync(chrome, [
      '--headless', '--disable-gpu', '--no-sandbox', '--disable-breakpad',
      `--user-data-dir=${join(outDir, 'chrome-profile')}`,
      '--virtual-time-budget=3000', `--window-size=860,${tall ? '1500' : '600'}`,
      `--screenshot=${pngPath}`, `file://${htmlPath}`,
    ], { stdio: 'inherit' })
    console.log('截图 PNG:', pngPath)
  }
}
