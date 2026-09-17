/**
 * systemPrompt 注入验证：9 个插件是否都把自己那段话注进去了，以及 `prompt` 的
 * **核心行为** —— 激活某个 prompt / 开 A/B 之后，注入给模型的内容是否真的跟着变。
 *
 * 为什么必须进程内验：systemPrompt 的 section 是宿主内部对象，HTTP 面看不到；
 * `verify-windows-e2e.mjs` 只验过 codegraph 一个（D1 的门禁），其余 8 个从没验过。
 * 这里用假 cordis ctx 把 9 个插件依次挂起来，捕获 `systemPrompt.section()` 注册的
 * 段落，并驱动 prompt 插件的 HTTP 路由（save / activate / abtest）观察注入内容的变化。
 *
 * 用法（Windows guest）：
 *   node scripts/windows/verify-sections.mjs --repo C:\cg-repo\dsh-plugin-kit ^
 *        --dsh-home C:\cg-verify\dshhome --report C:\cg-verify\sections.json
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const argv = process.argv.slice(2)
const flag = (name) => {
  const index = argv.indexOf(name)
  return index === -1 ? undefined : argv[index + 1]
}
const repo = flag('--repo') ?? process.cwd()
const dshHome = flag('--dsh-home')
const reportPath = flag('--report')

if (dshHome !== undefined) process.env.DSH_HOME = dshHome

const results = []
const record = (name, ok, detail) => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '\n      ' + detail : ''}`)
}
const skip = (name, detail) => {
  results.push({ name, ok: true, detail, skipped: true })
  console.log(`SKIP  ${name}${detail ? '\n      ' + detail : ''}`)
}

console.log('# systemPrompt 注入验证（9 个插件）')
console.log(`# node ${process.version} / DSH_HOME ${String(dshHome)}\n`)

/** 挂一个插件，捕获它注册的 systemPrompt 段落与 HTTP 路由。 */
function mount(name, config) {
  const sections = new Map()
  const contexts = new Map()
  const routes = new Map()
  const settingsStores = new Map()
  const makeChild = (names) => {
    const child = {
      logger: { info: () => {}, warn: () => {}, error: () => {} },
      effect: (callback) => {
        callback()
        return () => {}
      },
      inject: (childNames, cb) => {
        cb(makeChild(childNames))
        return () => {}
      },
      events: { on: () => () => {} },
      on: () => () => {},
      get: (service) => (service === 'tools' ? { register: () => () => {} } : undefined),
    }
    if (names.includes('webServer')) {
      child.webServer = {
        register: (route) => {
          routes.set(route.path, route)
          return () => {}
        },
        registerUpgrade: () => () => {},
      }
    }
    if (names.includes('settings')) {
      child.settings = {
        register: (ns, _schema, options) => {
          const store = { ...((options?.base ?? {})) }
          settingsStores.set(ns, store)
          return { get: () => store, update: async () => {} }
        },
        get: (ns) => settingsStores.get(ns) ?? {},
        scope: () => ({ get: () => ({}), update: async () => {} }),
        update: async () => {},
      }
    }
    if (names.includes('systemPrompt')) {
      child.systemPrompt = {
        section: (options) => {
          sections.set(options.name, options)
          return () => sections.delete(options.name)
        },
        // tty 除了 section 还会注册一个 context 段落（同名 API，另一条通道）
        context: (options) => {
          contexts.set(options.name, options)
          return () => contexts.delete(options.name)
        },
      }
    }
    if (names.includes('credentials')) child.credentials = { resolve: async () => undefined, list: async () => [] }
    return child
  }
  const root = makeChild([])
  root.inject = (names, cb) => {
    cb(makeChild(names))
    return () => {}
  }
  return { name, root, sections, contexts, routes, config }
}

async function mountAll(entries) {
  const mounted = []
  for (const [name, config] of entries) {
    const url = pathToFileURL(join(repo, 'packages', name, 'lib', 'index.js')).href
    const module_ = await import(url)
    const harness = mount(name, config)
    try {
      module_.apply(harness.root, config)
      mounted.push(harness)
    } catch (error) {
      record(`${name}：挂载成功`, false, String(error?.message ?? error))
    }
  }
  return mounted
}

const plugins = ['codegraph', 'docker', 'env', 'mcp', 'profile', 'prompt', 'rss', 'search', 'tty']
const mounted = await mountAll([
  ['codegraph', { announceToAgent: true, usageGuidance: true, mcpIntegration: false }],
  ['docker', { enabled: true, announceToAgent: true, allowMutations: false, allowExec: false, targets: [] }],
  ['env', { announceToAgent: true }],
  ['mcp', { enabled: true, announceToAgent: true }],
  ['profile', { announceToAgent: true }],
  ['prompt', { announceToAgent: true, applyToSystemPrompt: true }],
  ['rss', { enabled: true, announceToAgent: true }],
  ['search', { enabled: true, announceToAgent: true }],
  ['tty', { enabled: true, announceToAgent: true, shell: process.env.ComSpec ?? 'cmd.exe', term: 'xterm-256color', colorTerm: 'truecolor', cwd: repo, shellIntegration: false }],
])

record(
  'S0 九个插件都挂起来了',
  mounted.length === 9,
  `挂载成功 ${mounted.length}/9：${JSON.stringify(mounted.map((item) => item.name))}`,
)

// 有些段落是**异步门禁**后才注入的：codegraph 要等 `codegraph --version` 探测回来、
// docker/tty 要等 settings 解析。挂完立刻断言会误报「没注册段落」，所以先等结算。
await new Promise((resolve) => setTimeout(resolve, 6000))

/* ---------- S1 逐插件：是否注册了 systemPrompt 段落 ---------- */

for (const harness of mounted) {
  const rows = [...harness.sections.values()].map((section) => ({ name: section.name, order: section.order, length: String(section.text ?? '').length }))
  const total = rows.reduce((sum, row) => sum + row.length, 0)
  record(
    `S1 ${harness.name}：注册了 systemPrompt 段落且文本非空`,
    rows.length >= 1 && total > 50,
    rows.length === 0 ? '没有注册任何段落' : `${rows.length} 段 / 共 ${total} 字符：${JSON.stringify(rows)}`,
  )
}

/* ---------- S2 prompt：注入内容真的跟着激活态变 ---------- */

{
  const promptHarness = mounted.find((item) => item.name === 'prompt')
  if (promptHarness === undefined) {
    skip('S2 prompt 注入随激活态变化', 'prompt 插件没挂上')
  } else {
    const call = async (path, method, body) => {
      const route = promptHarness.routes.get(path)
      if (route === undefined) throw new Error(`未注册路由 ${path}`)
      const payload = body === undefined ? undefined : Buffer.from(JSON.stringify(body))
      let status
      let text
      await route.handler(
        {
          method,
          url: path,
          headers: { host: '127.0.0.1:3092', 'content-type': 'application/json' },
          socket: { remoteAddress: '127.0.0.1' },
          async *[Symbol.asyncIterator]() {
            if (payload !== undefined) yield payload
          },
        },
        {
          writeHead: (code) => (status = code),
          end: (value) => (text = value),
        },
      )
      return { status, json: text === undefined ? undefined : JSON.parse(text) }
    }
    const sectionText = () => String([...promptHarness.sections.values()].map((section) => section.text ?? '').join('\n'))
    const baseline = sectionText()
    record('S2 prompt：初始注入的段落不含探针标记', !baseline.includes('SECTION-PROBE-9F3A'), `基线 ${baseline.length} 字符`)

    const markerA = 'SECTION-PROBE-9F3A-A'
    const markerB = 'SECTION-PROBE-9F3A-B'
    const saved = await call('/api/dsh-prompt/save', 'POST', {
      prompt: { name: '注入探针', versions: [{ content: `A 版内容 ${markerA}`, label: 'A' }, { content: `B 版内容 ${markerB}`, label: 'B' }] },
    })
    const id = saved.json?.prompts?.find((prompt) => prompt.name === '注入探针')?.id
    const versions = saved.json?.prompts?.find((prompt) => prompt.name === '注入探针')?.versions ?? []
    record('S2 prompt：建出一条带 A/B 两版的 prompt', typeof id === 'string' && versions.length === 2, `id=${String(id)} 版本=${versions.length}`)

    const waitForText = async (predicate, timeoutMs = 8000) => {
      const deadline = Date.now() + timeoutMs
      let text = sectionText()
      while (Date.now() < deadline) {
        if (predicate(text)) return text
        await call('/api/dsh-prompt/active', 'GET')
        await new Promise((resolve) => setTimeout(resolve, 400))
        text = sectionText()
      }
      return text
    }
    // 字段名是 promptId（不是 id）—— 传错会静默把 activePromptId 置成 null
    const activated = await call('/api/dsh-prompt/activate', 'POST', { promptId: id })
    // 重注入是异步的（注册/注销 section），这里等它结算再断言
    const afterActivate = await waitForText((text) => text.includes('SECTION-PROBE-9F3A'))
    record(
      'S2 prompt：激活后注入内容真的换了（含激活版本的正文）',
      activated.status === 200 && activated.json?.activePromptId === id && afterActivate.includes('SECTION-PROBE-9F3A'),
      `激活后 ${afterActivate.length} 字符，含标记=${afterActivate.includes('SECTION-PROBE-9F3A')}，含 A=${afterActivate.includes(markerA)}，含 B=${afterActivate.includes(markerB)}`,
    )

    // A/B：把权重压到 100% 指向 B，多次重注入应只命中 B
    const ab = await call('/api/dsh-prompt/abtest', 'POST', {
      promptId: id,
      enabled: true,
      aVersionId: versions[0]?.id,
      bVersionId: versions[1]?.id,
      aWeight: 100,
    })
    const seen = new Set()
    for (let index = 0; index < 20; index += 1) {
      // 每次调用 /active 都会触发一次重注入（命中是随机抽的），这正是要观察的点
      await call('/api/dsh-prompt/active', 'GET')
      const text = sectionText()
      if (text.includes(markerA)) seen.add('A')
      if (text.includes(markerB)) seen.add('B')
    }
    record(
      'S2 prompt：A/B 打开且权重 100% 指向 A 时，注入内容只命中 A（不再出现 B）',
      ab.status === 200 && seen.has('A') && !seen.has('B'),
      `20 次重注入命中集合=${JSON.stringify([...seen])}`,
    )

    const cleared = await call('/api/dsh-prompt/delete', 'POST', { promptId: id })
    await waitForText((text) => !text.includes('SECTION-PROBE-9F3A'))
    const afterDelete = sectionText()
    record(
      'S2 prompt：删掉探针后注入内容不再含标记（回到基线）',
      cleared.status === 200 && !afterDelete.includes('SECTION-PROBE-9F3A'),
      `删除后 ${afterDelete.length} 字符，含标记=${afterDelete.includes('SECTION-PROBE-9F3A')}`,
    )
  }
}

const failed = results.filter((item) => item.ok !== true)
console.log(`\n# 汇总：PASS ${results.filter((r) => r.ok === true && r.skipped !== true).length} / SKIP ${results.filter((r) => r.skipped === true).length} / FAIL ${failed.length}`)
if (failed.length > 0) {
  console.log('# 失败项：')
  for (const item of failed) console.log(`  - ${item.name}${item.detail ? `：${item.detail.split('\n')[0]}` : ''}`)
}
if (reportPath !== undefined) {
  mkdirSync(join(reportPath, '..'), { recursive: true })
  writeFileSync(reportPath, `${JSON.stringify({ repo, plugins, results }, null, 2)}\n`)
  console.log(`# 报告：${reportPath}`)
}
process.exit(failed.length === 0 ? 0 : 1)
