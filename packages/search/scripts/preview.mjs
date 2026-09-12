#!/usr/bin/env node
/**
 * @hyzyn/dsh-search — 视觉预览 / 截图回归工具。
 *
 * 把 packages/search/client.js 装进一个纯静态夹具页（scripts/preview/harness.html，
 * 内含伪造的 DSH 宿主：模块加载器 / fetch / sessions 服务），用 headless Chrome
 * 逐个场景渲染并截图到 .preview/shots/，用于改样式时的视觉走查。
 *
 * 用法：
 *   node scripts/preview.mjs                 # 全场景截图（暗色）
 *   node scripts/preview.mjs empty           # 指定场景
 *   node scripts/preview.mjs --list          # 列出场景
 *   node scripts/preview.mjs --theme=light   # 浅色主题
 *   node scripts/preview.mjs --out=shots-light
 *
 * 需要本机有 Chrome/Chromium（默认找 playwright 缓存的 Chrome for Testing，
 * 也可用 CHROME_PATH 指定）。
 */
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'

const require = createRequire(import.meta.url)
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const previewDir = join(root, '.preview')

const argv = process.argv.slice(2)
const flags = new Set(argv.filter((a) => a.startsWith('--')))
const positional = argv.filter((a) => !a.startsWith('--'))
const theme = (argv.find((a) => a.startsWith('--theme=')) || '--theme=dark').split('=')[1]
const outName = (argv.find((a) => a.startsWith('--out=')) || '--out=shots').split('=')[1]
const shotsDir = join(previewDir, outName)

/* ------------------------------- 场景清单 ------------------------------- */

const SCENARIOS = [
  ['empty', '打开即出内容（最近会话 + 快捷操作 + 设置）'],
  ['query', '输入关键词后的混合结果'],
  ['loading', '全文检索进行中'],
  ['legacy', '老宿主（目录路由缺失）下的兜底'],
]

if (flags.has('--list')) {
  for (const [name, label] of SCENARIOS) console.log(name.padEnd(10), label)
  process.exit(0)
}

const wanted = positional.length > 0 ? positional : SCENARIOS.map(([n]) => n)
for (const name of wanted) {
  if (!SCENARIOS.some(([n]) => n === name)) {
    console.error('未知场景：' + name + '（--list 查看可用场景）')
    process.exit(1)
  }
}

function log(msg) {
  process.stdout.write('[preview] ' + msg + '\n')
}

/* ------------------------------ 夹具准备 ------------------------------ */

const FALLBACK_SKIN_CSS = [
  ':root {',
  '  --dsw-alias-bg-base: #ffffff;',
  '  --dsw-alias-bg-layer-1: #f6f7f9;',
  '  --dsw-alias-bg-layer-2: #eef0f4;',
  '  --dsw-alias-bg-layer-3: #e5e8ee;',
  '  --dsw-alias-bg-mask-1: #00000059;',
  '  --dsw-alias-bg-overlay: #fffffff0;',
  '  --dsw-alias-border-l1: #00000014;',
  '  --dsw-alias-border-l2: #00000024;',
  '  --dsw-alias-border-l3: #00000038;',
  '  --dsw-alias-border-l4: #0000004d;',
  '  --dsw-alias-interactive-bg-hover: #0000000f;',
  '  --dsw-alias-interactive-bg-active: #0000001f;',
  '  --dsw-alias-interactive-bg-hover-danger: #c000000f;',
  '  --dsw-alias-label-primary: #0f1115;',
  '  --dsw-alias-label-secondary: #4b5158;',
  '  --dsw-alias-label-tertiary: #767c85;',
  '  --dsw-alias-label-dimmed: #9aa0a8;',
  '  --dsw-alias-label-primary-inverted: #ffffff;',
  '  --dsw-alias-brand-primary: #4d6bfe;',
  '  --dsw-alias-state-business-primary: #4d6bfe;',
  '  --dsw-alias-state-error-primary: #d1242f;',
  '  --dsw-alias-state-success-primary: #1a7f37;',
  '  --dsw-alias-state-warn-primary: #bf8700;',
  '  --dsw-alias-state-warn-tertiary: #fdf1d6;',
  '  --dsw-specific-input-major: #ffffff;',
  '  --dsw-specific-menu: #ffffff;',
  '  --dsw-specific-tip: #f6f7f9;',
  '  --dsw-specific-sidebar-fill: #f2f3f5;',
  '  --dsw-specific-sidebar-nav-item-hover: #0000000f;',
  '  --dsw-specific-sidebar-nav-item-active: #0000001a;',
  '  --dsw-alias-scrollbar-bg-l1: #d0d3d8;',
  '  --dsw-alias-scrollbar-bg-l2: #d0d3d8;',
  '  --dsw-alias-scrollbar-hover-l1: #b0b4ba;',
  '  --dsw-shadow-lv3: 0 12px 32px -8px #0000002e;',
  '}',
  'body[data-ds-dark-theme] {',
  '  --dsw-alias-bg-base: #1b1b1f;',
  '  --dsw-alias-bg-layer-1: #202024;',
  '  --dsw-alias-bg-layer-2: #26262b;',
  '  --dsw-alias-bg-layer-3: #2d2d33;',
  '  --dsw-alias-bg-mask-1: #0000008c;',
  '  --dsw-alias-bg-overlay: #202024eb;',
  '  --dsw-alias-border-l1: #ffffff14;',
  '  --dsw-alias-border-l2: #ffffff26;',
  '  --dsw-alias-border-l3: #ffffff3d;',
  '  --dsw-alias-border-l4: #ffffff52;',
  '  --dsw-alias-interactive-bg-hover: #ffffff14;',
  '  --dsw-alias-interactive-bg-active: #ffffff24;',
  '  --dsw-alias-interactive-bg-hover-danger: #ff6b6b1f;',
  '  --dsw-alias-label-primary: #ececf1;',
  '  --dsw-alias-label-secondary: #b4b4bd;',
  '  --dsw-alias-label-tertiary: #8e8e99;',
  '  --dsw-alias-label-dimmed: #6b6b75;',
  '  --dsw-alias-label-primary-inverted: #101014;',
  '  --dsw-alias-brand-primary: #7c9cff;',
  '  --dsw-alias-state-business-primary: #7c9cff;',
  '  --dsw-alias-state-error-primary: #ff6b6b;',
  '  --dsw-alias-state-success-primary: #4cc38a;',
  '  --dsw-alias-state-warn-primary: #e0a94a;',
  '  --dsw-alias-state-warn-tertiary: #4a3a12;',
  '  --dsw-specific-input-major: #17171a;',
  '  --dsw-specific-menu: #24242af0;',
  '  --dsw-specific-tip: #24242a;',
  '  --dsw-specific-sidebar-fill: #17171a;',
  '  --dsw-specific-sidebar-nav-item-hover: #ffffff12;',
  '  --dsw-specific-sidebar-nav-item-active: #ffffff1f;',
  '  --dsw-alias-scrollbar-bg-l1: #3a3a42;',
  '  --dsw-alias-scrollbar-bg-l2: #3a3a42;',
  '  --dsw-alias-scrollbar-hover-l1: #4d4d57;',
  '  --dsw-shadow-lv3: 0 12px 32px -8px #000000a6;',
  '}',
].join('\n')

/** 皮肤变量：优先用本机 skin-center 的真实 token 表，找不到则用内置兜底。 */
function skinCss() {
  const candidates = []
  const skinsRoot = join(homedir(), '.dsh/profiles/web/node_modules/@linxin666/dsh-client-ui-skin-center/skins')
  if (existsSync(skinsRoot)) {
    for (const name of readdirSync(skinsRoot)) {
      const file = join(skinsRoot, name, 'skin.css')
      if (existsSync(file)) candidates.push(file)
    }
  }
  if (candidates.length > 0) return readFileSync(candidates[0], 'utf8')
  log('未找到本机 skin token 表，使用内置兜底变量')
  return FALLBACK_SKIN_CSS
}

function prepare() {
  mkdirSync(shotsDir, { recursive: true })
  for (const file of ['harness.html', 'mock-host.js']) {
    writeFileSync(join(previewDir, file), readFileSync(join(root, 'scripts/preview', file)))
  }
  writeFileSync(join(previewDir, 'skin.css'), skinCss())
  writeFileSync(join(previewDir, 'client.js'), readFileSync(join(root, 'client.js')))
}

/* ------------------------------ Chrome/CDP ------------------------------ */

function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH
  const roots = [join(homedir(), 'Library/Caches/ms-playwright'), join(homedir(), '.cache/ms-playwright')]
  const candidates = []
  for (const base of roots) {
    if (!existsSync(base)) continue
    for (const dir of readdirSync(base)) {
      if (!dir.startsWith('chromium')) continue
      candidates.push(join(base, dir, 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'))
      candidates.push(join(base, dir, 'chrome-mac/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'))
      candidates.push(join(base, dir, 'chrome-linux/chrome'))
    }
  }
  candidates.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
  candidates.push('/Applications/Chromium.app/Contents/MacOS/Chromium')
  for (const c of candidates) if (existsSync(c)) return c
  throw new Error('找不到 Chrome/Chromium，请设置 CHROME_PATH')
}

const WebSocketImpl = (() => {
  try {
    return require('ws')
  } catch {
    return null
  }
})()

class Cdp {
  constructor(socket, kind) {
    this.socket = socket
    this.kind = kind
    this.id = 0
    this.pending = new Map()
    this.listeners = new Set()
    const handle = (raw) => {
      let msg
      try {
        msg = JSON.parse(typeof raw === 'string' ? raw : String(raw))
      } catch {
        return
      }
      if (msg.id !== undefined && this.pending.has(msg.id)) {
        const entry = this.pending.get(msg.id)
        this.pending.delete(msg.id)
        if (msg.error) entry.reject(new Error((msg.error && msg.error.message) || JSON.stringify(msg.error)))
        else entry.resolve(msg.result)
        return
      }
      for (const fn of this.listeners) fn(msg)
    }
    if (kind === 'ws') socket.on('message', handle)
    else socket.addEventListener('message', (event) => handle(event.data))
  }

  static async connect(url) {
    if (WebSocketImpl !== null) {
      const socket = new WebSocketImpl(url, { perMessageDeflate: false })
      await new Promise((res, rej) => {
        socket.once('open', res)
        socket.once('error', rej)
      })
      return new Cdp(socket, 'ws')
    }
    const socket = new WebSocket(url)
    await new Promise((res, rej) => {
      socket.addEventListener('open', res, { once: true })
      socket.addEventListener('error', () => rej(new Error('CDP 连接失败')), { once: true })
    })
    return new Cdp(socket, 'node')
  }

  send(method, params) {
    const id = ++this.id
    this.socket.send(JSON.stringify({ id, method, params: params || {} }))
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id)
          reject(new Error('CDP 超时：' + method))
        }
      }, 30000)
    })
  }

  on(fn) {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
}

async function launchChrome() {
  const chrome = findChrome()
  const userDataDir = join(previewDir, 'chrome-profile')
  rmSync(userDataDir, { recursive: true, force: true })
  const child = spawn(chrome, [
    '--headless=new',
    '--remote-debugging-port=0',
    '--user-data-dir=' + userDataDir,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-background-networking',
    '--disable-sync',
    '--disable-features=Translate,OptimizationGuideModelDownloading,MediaRouter',
    // 受限环境（容器 / 沙箱）里 Chrome 的 GPU 与子进程沙箱起不来，进程会直接崩掉、
    // CDP 连接随之 1006 断开：截图环境一律关掉这些
    '--no-sandbox',
    '--disable-gpu',
    '--disable-breakpad',
    '--disable-crash-reporter',
    '--disable-dev-shm-usage',
    '--force-color-profile=srgb',
    '--font-render-hinting=none',
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] })

  const wsUrl = await new Promise((resolvePromise, reject) => {
    let buffer = ''
    const timer = setTimeout(() => reject(new Error('等待 Chrome DevTools 端口超时')), 25000)
    child.stderr.on('data', (chunk) => {
      buffer += String(chunk)
      const match = buffer.match(/DevTools listening on (ws:\/\/\S+)/)
      if (match) {
        clearTimeout(timer)
        resolvePromise(match[1])
      }
    })
    child.on('exit', (code) => {
      clearTimeout(timer)
      reject(new Error('Chrome 退出，code=' + code))
    })
  })

  const port = new URL(wsUrl).port
  const targets = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json()
  const page = targets.find((t) => t.type === 'page')
  if (!page) throw new Error('Chrome 没有可用的页面 target')
  const cdp = await Cdp.connect(page.webSocketDebuggerUrl)
  await cdp.send('Page.enable')
  await cdp.send('Runtime.enable')
  return { child, cdp, userDataDir }
}

/* ------------------------------- 截图流程 ------------------------------- */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function shoot(cdp, name) {
  const problems = []
  const off = cdp.on((msg) => {
    if (msg.method === 'Runtime.exceptionThrown') {
      problems.push('异常：' + (msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text))
    } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      problems.push('console.error：' + msg.params.args.map((a) => a.description || a.value).join(' '))
    }
  })
  try {
    const url = 'file://' + join(previewDir, 'harness.html') + '?scenario=' + encodeURIComponent(name) + '&theme=' + theme
    await cdp.send('Page.navigate', { url })
    let ready = false
    for (let i = 0; i < 120; i += 1) {
      const probe = await cdp.send('Runtime.evaluate', {
        expression: 'window.__previewState ? window.__previewState.name : null',
        returnByValue: true,
      }).catch(() => null)
      if (probe?.result?.value === name) {
        ready = true
        break
      }
      await sleep(50)
    }
    if (!ready) problems.push('场景未挂载（导航超时）')
    const outcome = await cdp.send('Runtime.evaluate', {
      expression: 'window.__previewReady ? window.__previewReady.then(function () { return { ok: true } }).catch(function (e) { return { ok: false, error: String((e && e.message) || e) } }) : { ok: false, error: "no __previewReady" }',
      awaitPromise: true,
      returnByValue: true,
    })
    const value = outcome?.result?.value
    if (value && value.ok === false) problems.push('场景失败：' + value.error)
    await sleep(400)
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    const file = join(shotsDir, name + '.png')
    writeFileSync(file, Buffer.from(shot.data, 'base64'))
    // 截图之后再跑交互自检（它会改动面板状态，放在截图后不影响画面）
    const checks = await cdp.send('Runtime.evaluate', {
      expression: 'window.__previewInteract ? window.__previewInteract() : Promise.resolve([])',
      awaitPromise: true,
      returnByValue: true,
    }).catch(() => null)
    const checkList = checks?.result?.value || []
    for (const entry of checkList) {
      if (!entry[1]) problems.push('交互自检失败：' + entry[0])
    }
    return { file, problems, checks: checkList.length }
  } finally {
    off()
  }
}

/* --------------------------------- main --------------------------------- */

async function main() {
  prepare()
  log('启动 headless Chrome（' + theme + ' 主题）')
  const { child, cdp, userDataDir } = await launchChrome()
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1240, height: 900, deviceScaleFactor: 2, mobile: false })
  let failed = 0
  try {
    for (const name of wanted) {
      const label = SCENARIOS.find(([n]) => n === name)[1]
      const { file, problems, checks } = await shoot(cdp, name)
      const suffix = checks > 0 ? '（' + String(checks) + ' 项交互自检通过）' : ''
      log((problems.length > 0 ? '✗' : '✓') + ' ' + name.padEnd(10) + label + suffix + '  →  ' + file.replace(process.cwd() + '/', ''))
      for (const p of problems) log('   ⚠ ' + p)
      if (problems.length > 0) failed += 1
    }
  } finally {
    child.kill('SIGTERM')
    try {
      rmSync(userDataDir, { recursive: true, force: true })
    } catch {
      /* 下次运行会覆盖 */
    }
  }
  log('完成：' + (wanted.length - failed) + '/' + wanted.length + ' 场景正常，截图在 ' + shotsDir.replace(process.cwd() + '/', ''))
  if (failed > 0) process.exitCode = 1
}

main().catch((error) => {
  console.error('[preview] ' + (error && error.stack ? error.stack : error))
  process.exit(1)
})
