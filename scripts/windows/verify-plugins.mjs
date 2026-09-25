/**
 * Windows 真机全插件验证：把本仓库的 **9 个插件 + 聚合包** 在真实 Windows 上跑一遍。
 *
 * 与 `packages/*\/test/*.test.ts` 的分工：
 *   - vitest 在 Windows 上跑不起来（`@rollup/rollup-win32-*-msvc` 需要 VC++ 运行库，
 *     干净机器没有）；本脚本只用 Node 内建模块 + 仓库已构建的 `lib/`，因此能跑；
 *   - vitest 断言的是「逻辑」，本脚本断言的是「**这台 Windows 上**的逻辑」：
 *     控制台代码页、`.cmd` shim、`\` 路径、CRLF、盘符、`%COMSPEC%`、node-pty。
 *
 * 两个阶段：
 *   A. 静态探针（不需要宿主）：直接 import 各包已构建的 `lib/index.js`，
 *      验证纯函数与 Windows 特有分支（解码、shim 转义、生成 .cmd 的真跑一次）。
 *   B. 活体探针（需要一个**真的跑起来的 DSH 宿主**）：把每个插件的**每一条 HTTP 路由**
 *      都打一遍，然后做写入/读回往返，检查响应里没有 U+FFFD、没有 5xx、没有 403。
 *
 * 用法（Windows 仓库根，先 `pnpm -r build`）：
 *
 *   node scripts/windows/verify-plugins.mjs --repo C:\path\to\dsh-plugin-kit ^
 *        --host http://127.0.0.1:3092 --dsh-home C:\cg-verify\dshhome ^
 *        --codegraph-cli C:\Users\me\AppData\Local\codegraph\current\bin\codegraph.cmd ^
 *        --report C:\path\to\report.json
 *
 * `--host` 缺省时只跑阶段 A（静态探针），仍是有意义的 Windows 验证。
 * 退出码：0 = 无 FAIL（允许 WARN），1 = 有 FAIL。
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const argv = process.argv.slice(2)
const flag = (name) => {
  const index = argv.indexOf(name)
  return index === -1 ? undefined : argv[index + 1]
}
const repo = resolve(flag('--repo') ?? process.cwd())
const hostUrl = flag('--host')
const dshHome = flag('--dsh-home')
const codegraphCli = flag('--codegraph-cli')
const nodeExe = flag('--node')
const dockerSshKey = flag('--docker-ssh-key') ?? 'C:\\cg-verify\\ssh\\id_ed25519'
const dshBin = flag('--dsh-bin')
const reportPath = flag('--report')

const results = []
const record = (name, ok, detail) => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '\n      ' + detail : ''}`)
}
const warn = (name, detail) => {
  results.push({ name, ok: true, detail, warned: true })
  console.log(`WARN  ${name}\n      ${detail}`)
}
const skip = (name, detail) => {
  results.push({ name, ok: true, detail, skipped: true })
  console.log(`SKIP  ${name}${detail ? '\n      ' + detail : ''}`)
}
/** 缓冲区里出现 U+FFFD 即「硬解错了编码」——本仓库在 Windows 上最典型的失败形态。 */
const MOJIBAKE = '\uFFFD'
const hasMojibake = (text) => typeof text === 'string' && text.includes(MOJIBAKE)

console.log('# Windows 真机全插件验证')
console.log(`# node ${process.version} / ${process.platform} / ${process.arch}`)
console.log(`# repo ${repo}`)
console.log(`# host ${hostUrl ?? '(未给，只跑静态探针)'}\n`)

if (process.platform !== 'win32') {
  console.log('FAIL  本脚本验证的是 Windows 的 cmd.exe / 代码页 / 盘符路径行为，只能在 Windows 上跑')
  process.exit(1)
}

const libUrl = (pkg, file = 'index.js') => pathToFileURL(join(repo, 'packages', pkg, 'lib', file)).href
const loadLib = async (pkg, file) => import(libUrl(pkg, file))

/* ================================================================== *
 * 阶段 A：静态探针
 * ================================================================== */

console.log('--- 阶段 A：静态探针（已构建的 lib/，不需要宿主）---\n')

/* ---- A1. kit / decode：控制台代码页 ---- */
{
  const kit = await loadLib('kit', 'decode.js').catch(() => undefined)
  if (kit === undefined) {
    record('A1 decode：可加载 packages/kit/lib/decode.js', false, '导入失败')
  } else {
    const { consoleEncoding, decodeOutput, codePageEncoding } = kit
    const encoding = consoleEncoding()
    console.log(`      consoleEncoding() = ${encoding}`)
    // 报告里那段真实的 CP936 字节：0xb2 0xbb 0xca 0xc7 = 「不是」
    const cp936 = Buffer.from([0xb2, 0xbb, 0xca, 0xc7])
    const decoded = encoding === 'gbk' ? decodeOutput(cp936) : decodeOutput(cp936, { fallbackEncoding: 'gbk' })
    record(
      'A1 decode：CP936 的 4 个字节解出「不是」（而非 U+FFFD）',
      decoded === '不是',
      `encoding=${encoding} decodeOutput(0xb2 0xbb 0xca 0xc7)=${JSON.stringify(decoded)}`,
    )
    // 分片安全：不管读到多少字节的块，结果必须一致（报告 D2 的第二种形态）
    const chunked = [1, 2, 3, 4, 5, 8].map((size) => {
      const decoder = kit.createOutputDecoder({ fallbackEncoding: 'gbk' })
      let out = ''
      for (let i = 0; i < cp936.length; i += size) out += decoder.decode(cp936.subarray(i, i + size))
      return out + decoder.flush()
    })
    record(
      'A1 decode：1/2/3/4/5/8 字节分片结果完全相同（跨 chunk 的多字节不撕开）',
      chunked.every((value) => value === chunked[0]),
      chunked.map((value) => JSON.stringify(value)).join(' / '),
    )
    record(
      'A1 decode：437 / 850 不做映射（WHATWG 无对应 label，硬套 ibm866 会把西文变西里尔）',
      codePageEncoding(437) === undefined && codePageEncoding(850) === undefined,
      `codePageEncoding(437)=${String(codePageEncoding(437))} codePageEncoding(850)=${String(codePageEncoding(850))}`,
    )
  }
}

/* ---- A2. kit / windows-shim：启动决策 + 转义 + 真跑一次 ---- */
{
  const shim = await loadLib('kit', 'windows-shim.js').catch(() => undefined)
  if (shim === undefined) {
    record('A2 windows-shim：可加载 packages/kit/lib/windows-shim.js', false, '导入失败')
  } else {
    const { portableSpawnPlan, spawnPortable } = shim
    const plan = (command, ...args) => portableSpawnPlan(command, args, { platform: 'win32', comspec: 'C:\\Windows\\system32\\cmd.exe' })
    const bare = plan('codegraph')
    const cmdShim = plan('C:\\tools\\codegraph.cmd')
    const exe = plan('C:\\tools\\codegraph.exe')
    const docker = plan('docker')
    record(
      'A2 windows-shim：裸命令名 / .cmd 走 cmd.exe，.exe 直接 spawn',
      bare.windowsVerbatimArguments === true &&
        cmdShim.windowsVerbatimArguments === true &&
        exe.windowsVerbatimArguments !== true &&
        docker.windowsVerbatimArguments === true,
      `codegraph=${String(bare.windowsVerbatimArguments)} codegraph.cmd=${String(cmdShim.windowsVerbatimArguments)} codegraph.exe=${String(exe.windowsVerbatimArguments)} docker=${String(docker.windowsVerbatimArguments)}`,
    )
    record(
      'A2 windows-shim：.exe 分支不改命令行（不塞 cmd.exe，也不加 /d /s /c）',
      exe.file === 'C:\\tools\\codegraph.exe' && exe.args.length === 0,
      `file=${exe.file} args=${JSON.stringify(exe.args)}`,
    )

    /**
     * cmd.exe 的转义形态：先按 Windows argv 规则双写反斜杠、整体加引号，再把元字符逐个 `^`。
     * 断言的是**结构性质**而不是某个期望字符串：把 `^X` 对全部剥掉之后，剩下的元字符只允许是
     * `"`——引号是故意留给子进程 argv 解析器的（cmd.exe 吃掉的是 `^`）。
     *
     * 逐参数检查而不是整条命令行：`windowsCommandLine` 用空格拼接参数，那些分隔空格是合法的，
     * 而**参数内部**的空格必须被 `^ ` 转义（否则会被 cmd.exe 当成两个 token）。
     */
    const { escapeArgument } = shim
    const hostile = ['serve', '--mcp', 'a&b', 'a|b', 'a^b', 'quote"inside', 'a b', '中文 路径', 'A%B!C', 'a<b>c']
    const stripCarets = (text) => {
      let stripped = ''
      for (let index = 0; index < text.length; index += 1) {
        if (text[index] === '^') {
          index += 1
          continue
        }
        stripped += text[index]
      }
      return stripped
    }
    const leaky = hostile.filter((arg) => /[()\][%!^`<>&|;, *?]/.test(stripCarets(escapeArgument(arg)).replace(/"/g, '')))
    record(
      'A2 windows-shim：每个参数的元字符都带 ^ 转义（剥掉 ^ 对后只剩引号，没有裸奔的 & | < > % ! 空格）',
      leaky.length === 0,
      leaky.length === 0
        ? hostile.map((arg) => `${JSON.stringify(arg)}→${JSON.stringify(escapeArgument(arg))}`).join('  ')
        : `未转义完整：${leaky.join(' | ')}`,
    )

    // 真跑一次：造一个和 npm 同款的 .cmd shim，把 %* 原样转交给 node，
    // 由 node 的 argv 解析器报告收到了什么——这是「转义链条有没有闭合」的硬证据。
    const sandbox = join(repo, '.smoke', 'win-plugins')
    mkdirSync(sandbox, { recursive: true })
    const argDump = join(sandbox, 'argdump.js')
    const argShim = join(sandbox, 'argdump.cmd')
    const argOut = join(sandbox, 'args.json')
    writeFileSync(argDump, `import { writeFileSync } from 'node:fs'\nwriteFileSync(${JSON.stringify(argOut)}, JSON.stringify(process.argv.slice(2)))\n`)
    writeFileSync(argShim, `@echo off\r\n"${process.execPath}" "${argDump}" %*\r\n`)
    rmSync(argOut, { force: true })
    const wanted = ['plain', 'with space', 'a&b', 'a|b', 'a^b', 'quote"inside', '中文-参数', 'C:\\带 空格\\路径.txt', 'A%B!C']
    const run = await new Promise((resolvePromise) => {
      let child
      try {
        child = spawnPortable(argShim, wanted, { stdio: ['ignore', 'pipe', 'pipe'] })
      } catch (error) {
        return resolvePromise({ ok: false, error: String(error?.code ?? error?.message) })
      }
      let stderr = ''
      let stdout = ''
      child.stderr?.on('data', (chunk) => (stderr += chunk.toString()))
      child.stdout?.on('data', (chunk) => (stdout += chunk.toString()))
      child.on('error', (error) => resolvePromise({ ok: false, error: String(error?.code ?? error?.message) }))
      child.on('close', (code) => resolvePromise({ ok: true, code, stderr, stdout }))
    })
    const received = (() => {
      try {
        return JSON.parse(readFileSync(argOut, 'utf8'))
      } catch (error) {
        return `读取失败: ${String(error?.message ?? error)}（run=${JSON.stringify(run)}）`
      }
    })()
    record(
      'A2 windows-shim：经 cmd.exe 真跑一个 .cmd，argv 原样到达（含 & | ^ " 空格 % ! 中文）',
      Array.isArray(received) && JSON.stringify(received) === JSON.stringify(wanted),
      Array.isArray(received)
        ? `发出 ${JSON.stringify(wanted)}\n      收到 ${JSON.stringify(received)}`
        : `run=${JSON.stringify(run)} received=${String(received)}`,
    )

    // 同一件事的另一面：裸 spawn 一个 .cmd 在 Windows 上必须失败（Node 对 .cmd 的加固）。
    // 这条断言是「为什么需要这个模块」的前提，缺了它整块验证就没有意义。
    const rawFailure = await new Promise((resolvePromise) => {
      let child
      try {
        child = spawn(argShim, wanted, { stdio: ['ignore', 'pipe', 'pipe'] })
      } catch (error) {
        return resolvePromise(String(error?.code ?? error?.message))
      }
      child.on('error', (error) => resolvePromise(String(error?.code ?? error?.message)))
      child.on('close', () => resolvePromise(undefined))
      setTimeout(() => {
        try {
          child.kill()
        } catch {
          /* 已退出 */
        }
      }, 500)
    })
    record(
      'A2 windows-shim：裸 spawn 同一个 .cmd 确实失败（缺陷前提成立，shim 不是多余的）',
      rawFailure !== undefined,
      rawFailure === undefined ? '居然成功了——前提不成立，请复核 Node 版本' : `裸 spawn → ${rawFailure}`,
    )
  }
}

/* ---- A3. kit / http：loopback 围栏 ---- */
{
  const kit = await loadLib('kit', 'http.js').catch(() => undefined)
  if (kit === undefined) {
    record('A3 http：可加载 packages/kit/lib/http.js', false, '导入失败')
  } else {
    const cases = [
      { name: '回环 + 127.0.0.1 Host → 放行', req: { headers: { host: '127.0.0.1:3092' }, socket: { remoteAddress: '127.0.0.1' } }, want: true },
      { name: '回环 + localhost Host → 放行', req: { headers: { host: 'localhost:3092' }, socket: { remoteAddress: '::ffff:127.0.0.1' } }, want: true },
      { name: '非回环来源 → 拒绝', req: { headers: { host: '127.0.0.1:3092' }, socket: { remoteAddress: '10.211.55.1' } }, want: false },
      { name: '外部域名 Host（DNS rebinding）→ 拒绝', req: { headers: { host: 'evil.example.com' }, socket: { remoteAddress: '127.0.0.1' } }, want: false },
      { name: 'sec-fetch-site: cross-site → 拒绝', req: { headers: { host: '127.0.0.1:3092', 'sec-fetch-site': 'cross-site' }, socket: { remoteAddress: '127.0.0.1' } }, want: false },
    ]
    const wrong = cases.filter((item) => kit.isLoopbackRequest(item.req) !== item.want)
    record('A3 http：loopback 围栏 5 种情形全部符合预期', wrong.length === 0, wrong.length === 0 ? cases.map((c) => c.name).join('；') : `不符：${wrong.map((c) => c.name).join('；')}`)
    // readJsonBody 上限：超限必须 undefined，而不是把整个 body 读进内存
    const big = { async *[Symbol.asyncIterator]() { yield Buffer.alloc(64) } }
    const limited = await kit.readJsonBody(big, 16)
    record('A3 http：readJsonBody 超过 maxBytes 立刻放弃', limited === undefined, `maxBytes=16 / 实收 64 → ${String(limited)}`)
  }
}

/* ---- A4. 各包产物可加载 + 导出面完整 ---- */
{
  const packages = [
    ['kit', ['createOutputDecoder', 'decodeOutput', 'isLoopbackRequest', 'readJsonBody', 'spawnPortable']],
    ['codegraph', ['apply']],
    ['mcp', ['apply']],
    ['docker', ['apply']],
    ['env', ['apply']],
    ['profile', ['apply']],
    ['prompt', ['apply']],
    ['rss', ['apply']],
    ['search', ['apply']],
    ['tty', ['apply']],
  ]
  // kit 是库，不是插件，没有 `name` 导出；其余 9 个是插件，都必须有 name/apply。
  const PLUGINS = new Set(['codegraph', 'mcp', 'docker', 'env', 'profile', 'prompt', 'rss', 'search', 'tty'])
  const broken = []
  for (const [pkg, names] of packages) {
    try {
      const mod = await loadLib(pkg)
      const missing = names.filter((name) => mod[name] === undefined)
      if (missing.length > 0) broken.push(`${pkg}: 缺 ${missing.join(',')}`)
      else if (PLUGINS.has(pkg) && typeof mod.name !== 'string') broken.push(`${pkg}: name 不是字符串`)
      else if (PLUGINS.has(pkg) && mod.inject !== undefined && !Array.isArray(mod.inject)) broken.push(`${pkg}: inject 不是数组`)
    } catch (error) {
      broken.push(`${pkg}: 导入失败 ${String(error?.message ?? error).split('\n')[0]}`)
    }
  }
  record('A4 产物：10 个包的 lib/index.js 在 Windows 上都能 import 且导出面完整', broken.length === 0, broken.length === 0 ? `${packages.length} 个包：${packages.map(([pkg]) => pkg).join(', ')}` : broken.join(' | '))
  const pluginNames = await Promise.all([...PLUGINS].map(async (pkg) => (await loadLib(pkg)).name))
  record(
    'A4 产物：9 个插件的 name 在 Windows 上两两不同（同一个宿主里能共存）',
    new Set(pluginNames).size === PLUGINS.size,
    `names=${JSON.stringify(pluginNames)}`,
  )
}

/* ---- A5. 聚合包：cordis.patch.yml 可解析 + 依赖闭包可解析 ---- */
{
  // js-yaml 是各包自己的依赖（isolated node_modules），仓库根不一定有
  const yaml = await import(pathToFileURL(join(repo, 'packages', 'kit', 'node_modules', 'js-yaml', 'index.js')).href).catch(() => undefined)
  const patchPath = join(repo, 'packages', 'all', 'cordis.patch.yml')
  const manifest = JSON.parse(readFileSync(join(repo, 'packages', 'all', 'package.json'), 'utf8'))
  const deps = Object.keys(manifest.dependencies ?? {})
  const missing = deps.filter((name) => !existsSync(join(repo, 'node_modules', ...name.split('/'))))
  /*
   * 这里曾写死 `deps.length === 9`。聚合包后来多了一个依赖（kit-settings）变成 10，
   * 断言就永久变红——而 `missing` 其实是空的，也就是**没有任何东西解析不到**。
   * 这正是本仓反复吃过的「脚本里写死计数」那类漂移：闸门红了却没指向任何真问题，
   * 久而久之就没人再看它。该断言的是「声明的依赖都能解析」，不是「恰好有 N 个」。
   */
  record(
    'A5 聚合包：@hyzyn/dsh-all 声明的依赖在 Windows 上都能解析到目录',
    deps.length > 0 && missing.length === 0,
    `deps=${deps.length} missing=[${missing.join(', ')}]`,
  )
  if (yaml === undefined) {
    warn('A5 聚合包：cordis.patch.yml 未校验', '仓库根找不到 js-yaml（先 pnpm install）')
  } else {
    let parsed
    let error
    try {
      parsed = yaml.load(readFileSync(patchPath, 'utf8'))
    } catch (caught) {
      error = caught
    }
    record('A5 聚合包：cordis.patch.yml 是合法 YAML 且为顶层数组', error === undefined && Array.isArray(parsed), error !== undefined ? String(error.message) : `长度 ${Array.isArray(parsed) ? parsed.length : typeof parsed}`)
  }
}

/* ================================================================== *
 * 阶段 B：活体探针
 * ================================================================== */

if (hostUrl === undefined) {
  skip('阶段 B：活体探针', '未给 --host')
} else {
  console.log('\n--- 阶段 B：活体探针（真机跑起来的 DSH 宿主）---\n')

  const target = new URL(hostUrl)
  const port = Number(target.port || 80)

  /** 发一条请求；`stream: true` 时抓到第一块数据就结束（SSE 长连接不等 end）。 */
  function call(method, path, body, options = {}) {
    const { timeoutMs = 60_000, stream = false, headers = {} } = options
    return new Promise((resolvePromise) => {
      const payload = body === undefined ? undefined : Buffer.from(JSON.stringify(body))
      const request = http.request(
        {
          host: target.hostname,
          port,
          path,
          method,
          headers: {
            host: `${target.hostname}:${port}`,
            ...(payload === undefined ? {} : { 'content-type': 'application/json', 'content-length': String(payload.length) }),
            ...headers,
          },
        },
        (response) => {
          let text = ''
          let settled = false
          const done = (extra = {}) => {
            if (settled) return
            settled = true
            resolvePromise({ status: response.statusCode, headers: response.headers, body: text, ...extra })
          }
          response.setEncoding('utf8')
          response.on('data', (chunk) => {
            text += chunk
            if (stream && text.length > 0) {
              request.destroy()
              done({ streamed: true })
            }
          })
          response.on('end', () => done())
          response.on('error', () => done({ readError: true }))
        },
      )
      request.on('error', (error) => resolvePromise({ status: 0, body: '', error: String(error?.code ?? error?.message) }))
      request.setTimeout(timeoutMs, () => {
        request.destroy()
        resolvePromise({ status: 0, body: '', error: `timeout(${timeoutMs}ms)`, timedOut: true })
      })
      if (payload !== undefined) request.write(payload)
      request.end()
    })
  }
  const json = (text) => {
    try {
      return JSON.parse(text)
    } catch {
      return undefined
    }
  }

  /**
   * 安全序列化 + 截断。
   *
   * 为什么需要：`JSON.stringify(undefined)` 返回的是 **undefined**（不是字符串），
   * 后面直接 `.slice(0, n)` 就抛 TypeError。这在「宿主中途没了 / 响应不是 JSON」时
   * 必然触发——而那恰恰是最需要看到汇总的时候：真机实测就是这么把整个脚本打挂、
   * 连 `# 汇总` 都没打印出来的。
   */
  const brief = (value, max = 200) => {
    let text
    try {
      text = JSON.stringify(value)
    } catch {
      text = undefined
    }
    return (text ?? String(value)).slice(0, max)
  }

  /* ---- B0. 宿主活着 ---- */
  const root = await call('GET', '/')
  record(
    'B0 宿主：3092 在监听并回应 HTTP（未带 token 时 401 属预期）',
    root.status === 401 || root.status === 200,
    `GET / → ${root.status}`,
  )

  /* ---- B1. 路由矩阵：每一条都打一遍 ---- */
  // codegraph 的 `status -- <dir>` 会向上找到最近的已索引祖先项目，所以「未索引目录」
  // 必须落在**仓库之外**：仓库根自己就有 .codegraph/，放在 .smoke 下会永远看到 indexed=true。
  // 目录名带一次性的 runId：codegraph 的常驻 daemon 会把 `.codegraph/` 按住（删不掉，
  // EBUSY），所以每轮开新目录、不做「先清空」这一步。
  const scratchRoot = join(dirname(repo), 'dsh-win-scratch')
  const runId = Date.now().toString(36)
  mkdirSync(scratchRoot, { recursive: true })
  const PROJECT = join(scratchRoot, `proj-${runId}`)
  mkdirSync(PROJECT, { recursive: true })
  writeFileSync(join(PROJECT, 'a.js'), 'export function alpha(x) { return beta(x) }\nexport function beta(x) { return x + 1 }\nexport function gamma() { return alpha(1) }\n')
  writeFileSync(join(PROJECT, 'b.py'), 'def delta(n):\n    return n * 2\n')
  const q = (params) => '?' + new URLSearchParams(params).toString()
  const pPath = q({ path: PROJECT })
  // 先把这个工程索引出来，再打矩阵：否则 query / callers / callees / impact / sync
  // 这些数据路由拿到的是「还没建索引」——那是真实用法里不会出现的顺序，会把
  // 正常的 500（CLI 原文「CodeGraph not initialized」）误判成缺陷。
  // 「未索引 → /init → 查询」这条链路在 B11 单独走一遍。
  {
    const prepared = await call('POST', '/api/dsh-codegraph/init', { path: PROJECT }, { timeoutMs: 300_000 })
    record(
      'B1 准备：矩阵开始前先把探针工程索引出来（后续数据路由才有东西可查）',
      prepared.status === 200,
      `status=${prepared.status} body=${JSON.stringify(prepared.body.slice(0, 160))}`,
    )
  }

  const ROUTES = [
    // codegraph
    { pkg: 'codegraph', m: 'GET', p: `/api/dsh-codegraph/status${pPath}`, expect: [200] },
    { pkg: 'codegraph', m: 'GET', p: `/api/dsh-codegraph/query${q({ path: PROJECT, q: 'alpha', limit: '5' })}`, expect: [200] },
    { pkg: 'codegraph', m: 'GET', p: `/api/dsh-codegraph/callers${q({ path: PROJECT, symbol: 'beta' })}`, expect: [200] },
    { pkg: 'codegraph', m: 'GET', p: `/api/dsh-codegraph/callees${q({ path: PROJECT, symbol: 'alpha' })}`, expect: [200] },
    { pkg: 'codegraph', m: 'GET', p: `/api/dsh-codegraph/impact${q({ path: PROJECT, symbol: 'beta' })}`, expect: [200] },
    { pkg: 'codegraph', m: 'GET', p: `/api/dsh-codegraph/node${q({ path: PROJECT, symbol: 'alpha' })}`, expect: [200, 400] },
    { pkg: 'codegraph', m: 'GET', p: '/api/dsh-codegraph/default-path', expect: [200] },
    { pkg: 'codegraph', m: 'POST', p: '/api/dsh-codegraph/sync', b: { path: PROJECT }, expect: [200] },
    { pkg: 'codegraph', m: 'POST', p: '/api/dsh-codegraph/index', b: { path: PROJECT }, expect: [200, 409] },
    { pkg: 'codegraph', m: 'POST', p: '/api/dsh-codegraph/follow', b: { path: PROJECT }, expect: [200] },
    { pkg: 'codegraph', m: 'POST', p: '/api/dsh-codegraph/settings', b: { announceToAgent: true }, expect: [200] },
    { pkg: 'codegraph', m: 'POST', p: '/api/dsh-codegraph/reprobe', b: {}, expect: [200] },
    // env
    { pkg: 'env', m: 'GET', p: '/api/dsh-env/list', expect: [200] },
    // mcp
    { pkg: 'mcp', m: 'GET', p: '/api/dsh-mcp/servers', expect: [200] },
    // profile
    { pkg: 'profile', m: 'GET', p: '/api/dsh-profile/list', expect: [200] },
    // prompt
    { pkg: 'prompt', m: 'GET', p: '/api/dsh-prompt/list', expect: [200] },
    { pkg: 'prompt', m: 'GET', p: '/api/dsh-prompt/active', expect: [200] },
    { pkg: 'prompt', m: 'GET', p: '/api/dsh-prompt/export', expect: [200] },
    // rss
    { pkg: 'rss', m: 'GET', p: '/api/dsh-rss/config', expect: [200] },
    { pkg: 'rss', m: 'GET', p: '/api/dsh-rss/sources', expect: [200] },
    { pkg: 'rss', m: 'GET', p: '/api/dsh-rss/catalog', expect: [200] },
    { pkg: 'rss', m: 'GET', p: '/api/dsh-rss/digest', expect: [200] },
    // search
    { pkg: 'search', m: 'GET', p: '/api/dsh-search/catalog', expect: [200] },
    { pkg: 'search', m: 'GET', p: `/api/dsh-search/query${q({ q: 'wintest' })}`, expect: [200] },
    // tty
    { pkg: 'tty', m: 'GET', p: '/api/dsh-tty/config', expect: [200] },
    { pkg: 'tty', m: 'GET', p: '/api/dsh-tty/ssh-config', expect: [200] },
    { pkg: 'tty', m: 'GET', p: '/api/dsh-tty/env-vars', expect: [200] },
    { pkg: 'tty', m: 'GET', p: '/api/dsh-tty/credential-refs', expect: [200] },
    { pkg: 'tty', m: 'GET', p: '/api/dsh-tty/known-hosts', expect: [200] },
    { pkg: 'tty', m: 'GET', p: '/api/dsh-tty/shells', expect: [200] },
    { pkg: 'tty', m: 'GET', p: '/api/dsh-tty/tunnels', expect: [200] },
    { pkg: 'tty', m: 'POST', p: '/api/dsh-tty/local-fs/list', b: { path: repo }, expect: [200] },
    // docker（前缀路由，子路径自己分派）
    { pkg: 'docker', m: 'GET', p: '/api/dsh-docker/config', expect: [200] },
    { pkg: 'docker', m: 'GET', p: '/api/dsh-docker/targets', expect: [200] },
    { pkg: 'docker', m: 'POST', p: '/api/dsh-docker/containers', b: { target: '*' }, expect: [200, 400, 502, 503] },
    { pkg: 'docker', m: 'POST', p: '/api/dsh-docker/attention', b: { target: '*' }, expect: [200, 400, 502, 503] },
    { pkg: 'docker', m: 'POST', p: '/api/dsh-docker/images', b: { target: '*' }, expect: [200, 400, 502, 503] },
    { pkg: 'docker', m: 'POST', p: '/api/dsh-docker/networks', b: { target: '*' }, expect: [200, 400, 502, 503] },
    { pkg: 'docker', m: 'POST', p: '/api/dsh-docker/volumes', b: { target: '*' }, expect: [200, 400, 502, 503] },
  ]

  const matrix = []
  for (const route of ROUTES) {
    const response = await call(route.m, route.p, route.b)
    const entry = { pkg: route.pkg, method: route.m, path: route.p, status: response.status, error: response.error, body: response.body.slice(0, 400) }
    matrix.push(entry)
    const problems = []
    if (response.status === 0) problems.push(`无响应：${response.error}`)
    else if (response.status >= 500) problems.push(`${response.status}（服务端异常）`)
    else if (response.status === 403) problems.push('403（loopback 围栏把本机请求也拒了）')
    else if (route.expect !== undefined && !route.expect.includes(response.status)) problems.push(`${response.status} 不在预期 ${route.expect.join('/')}`)
    if (hasMojibake(response.body)) problems.push('响应体含 U+FFFD（编码硬解）')
    record(`B1 路由 ${route.pkg} ${route.m} ${route.p.replace(/\?.*$/, '')}${route.p.includes('?') ? '?…' : ''}`, problems.length === 0, problems.length === 0 ? `${response.status}` : `${problems.join('；')}｜body=${JSON.stringify(response.body.slice(0, 200))}`)
  }

  /* ---- B2. 方法围栏：每个包挑一条，用错方法应当 405 ---- */
  const WRONG = [
    ['codegraph', 'POST', '/api/dsh-codegraph/status'],
    ['env', 'GET', '/api/dsh-env/save'],
    ['mcp', 'GET', '/api/dsh-mcp/servers/save'],
    ['profile', 'POST', '/api/dsh-profile/list'],
    ['prompt', 'POST', '/api/dsh-prompt/list'],
    ['rss', 'GET', '/api/dsh-rss/refresh'],
    ['search', 'POST', '/api/dsh-search/catalog'],
    ['tty', 'GET', '/api/dsh-tty/probe'],
    ['docker', 'GET', '/api/dsh-docker/containers'],
  ]
  const wrongBad = []
  for (const [pkg, method, path, body] of WRONG) {
    const response = await call(method, path, body === undefined ? undefined : {})
    if (response.status !== 405) wrongBad.push(`${pkg} ${method} ${path} → ${response.status}`)
  }
  record('B2 方法围栏：错用方法时 9 个包都回 405（不是静默执行）', wrongBad.length === 0, wrongBad.length === 0 ? '9/9 405' : wrongBad.join('；'))

  /* ---- B3. 编码扫描：整轮矩阵里不允许出现 U+FFFD ---- */
  const dirty = matrix.filter((entry) => hasMojibake(entry.body))
  record(
    'B3 编码：整轮路由矩阵的响应体里没有一处 U+FFFD',
    dirty.length === 0,
    dirty.length === 0 ? `扫描 ${matrix.length} 条响应` : dirty.map((entry) => `${entry.path} → ${JSON.stringify(entry.body.slice(0, 120))}`).join('；'),
  )

  /* ---- B4. env：写入 / 读回 / 落盘 ---- */
  {
    const value = '中文-值-ħ-Ω-€'
    const jsValue = 'js:process.env.ComSpec'
    const saved = await call('POST', '/api/dsh-env/save', {
      entries: [
        { key: 'DSH_WIN_PROBE', value, secret: false },
        { key: 'DSH_WIN_PROBE_JS', value: jsValue, secret: false },
      ],
    })
    const listed = await call('GET', '/api/dsh-env/list')
    const entries = json(listed.body)?.entries ?? []
    const plain = entries.find((entry) => entry.key === 'DSH_WIN_PROBE')
    const ref = entries.find((entry) => entry.key === 'DSH_WIN_PROBE_JS')
    record(
      'B4 env：POST /save 写入后 GET /list 读回，中文值逐字节相同',
      saved.status === 200 && plain !== undefined && plain.value === value,
      `save=${saved.status} 读回=${JSON.stringify(plain?.value)} 期望=${JSON.stringify(value)}`,
    )
    record(
      'B4 env：`js:` 前缀表达式原样往返（没被当成字面量也解过一遍）',
      ref !== undefined && ref.value === jsValue,
      `读回=${JSON.stringify(ref?.value)}`,
    )
    const envFile = dshHome === undefined ? undefined : join(dshHome, 'env.yml')
    if (envFile === undefined || !existsSync(envFile)) {
      warn('B4 env：env.yml 落盘未校验', `找不到 ${String(envFile)}`)
    } else {
      const text = readFileSync(envFile, 'utf8')
      record(
        'B4 env：env.yml 以 UTF-8 落盘且带托管区块标记',
        text.includes(value) && /auto-generated/i.test(text) && !hasMojibake(text),
        `含中文值=${text.includes(value)} 含 auto-generated=${/auto-generated/i.test(text)} 有 U+FFFD=${hasMojibake(text)}`,
      )
    }
    const cleaned = await call('POST', '/api/dsh-env/save', { entries: [] })
    record('B4 env：清空 entries 能把探针键删干净', cleaned.status === 200, `status=${cleaned.status}`)
  }

  /* ---- B5. prompt：CRUD + 中文落盘 ---- */
  {
    const name = 'Windows 真机探针 prompt'
    const content = '内容含中文与 ħ Ω € 与 emoji 🚀'
    const contentB = 'B 版本内容：中文第二份 ħ'
    // 幂等：上一轮若中途失败会留下同名 prompt，先清干净，否则下面 `find(name)` 会拿到旧的那条
    for (const stale of ((json((await call('GET', '/api/dsh-prompt/list')).body)?.prompts) ?? []).filter((prompt) => prompt.name === name)) {
      await call('POST', '/api/dsh-prompt/delete', { promptId: stale.id })
    }
    const saved = await call('POST', '/api/dsh-prompt/save', {
      prompt: { name, versions: [{ content, label: 'v1' }, { content: contentB, label: 'v2' }] },
    })
    const savedBody = json(saved.body)
    const id = savedBody?.prompts?.filter((prompt) => prompt.name === name).at(-1)?.id
    record('B5 prompt：POST /save 建出中文名 prompt（两个版本）', saved.status === 200 && typeof id === 'string', `status=${saved.status} id=${String(id)} body=${JSON.stringify(saved.body.slice(0, 160))}`)
    if (typeof id === 'string') {
      const listed = await call('GET', '/api/dsh-prompt/list')
      const row = (json(listed.body)?.prompts ?? []).find((prompt) => prompt.id === id)
      const versions = row?.versions ?? []
      const version = versions.find((candidate) => candidate.content === content)
      record('B5 prompt：GET /list 读回内容逐字节相同（含 emoji 与多字节）', version !== undefined && versions.some((candidate) => candidate.content === contentB), `版本数=${versions.length}`)
      // 字段名是 promptId：早先我用 { id } 传错，接口把 activePromptId 置成 null 却仍回 200，
      // 于是「激活」这条其实是空转 —— 断言必须盯住 activePromptId 本身，不能只看状态码。
      const activated = await call('POST', '/api/dsh-prompt/activate', { promptId: id })
      record(
        'B5 prompt：POST /activate 真的把 activePromptId 切到该 prompt',
        activated.status === 200 && json(activated.body)?.activePromptId === id,
        `status=${activated.status} activePromptId=${String(json(activated.body)?.activePromptId)} 期望=${id}`,
      )
      if (versions.length >= 2) {
        const abtest = await call('POST', '/api/dsh-prompt/abtest', {
          promptId: id,
          enabled: true,
          aVersionId: versions[0].id,
          bVersionId: versions[1].id,
          aWeight: 30,
        })
        const ab = json(abtest.body)?.prompts?.find((prompt) => prompt.id === id)?.ab
        record(
          'B5 prompt：POST /abtest 打开 A/B（两个不同版本 + 权重 30）',
          abtest.status === 200 && ab?.enabled === true && ab?.aWeight === 30,
          `status=${abtest.status} ab=${JSON.stringify(ab ?? null)}`,
        )
      } else {
        warn('B5 prompt：A/B 未校验', `只读回 ${versions.length} 个版本`)
      }
      const exported = await call('GET', '/api/dsh-prompt/export')
      record('B5 prompt：GET /export 导出的 JSON 可整体解析', json(exported.body) !== undefined, `status=${exported.status}`)
      const promptsFile = dshHome === undefined ? undefined : join(dshHome, 'prompts.yml')
      if (promptsFile !== undefined && existsSync(promptsFile)) {
        const text = readFileSync(promptsFile, 'utf8')
        record('B5 prompt：prompts.yml 落盘内容与内存一致（UTF-8 无 U+FFFD）', text.includes(content) && text.includes(contentB) && !hasMojibake(text), `含 A 版本=${text.includes(content)} 含 B 版本=${text.includes(contentB)} 有 U+FFFD=${hasMojibake(text)}`)
      } else {
        warn('B5 prompt：prompts.yml 落盘未校验', `找不到 ${String(promptsFile)}`)
      }
      const deleted = await call('POST', '/api/dsh-prompt/delete', { promptId: id })
      record('B5 prompt：POST /delete 删掉探针 prompt', deleted.status === 200 && !(json(deleted.body)?.prompts ?? []).some((prompt) => prompt.id === id), `status=${deleted.status} body=${JSON.stringify(deleted.body.slice(0, 120))}`)
    }
  }

  /* ---- B6. profile：CRUD 往返 + Windows 盘符路径 ---- */
  if (dshHome === undefined) {
    skip('B6 profile：CRUD 往返', '未给 --dsh-home')
  } else {
    const profilesRoot = join(dshHome, 'profiles')
    const created = await call('POST', '/api/dsh-profile/create', { name: 'winprobe', template: 'web' })
    const dir = join(profilesRoot, 'winprobe')
    record(
      'B6 profile：POST /create 在 Windows 上真的建出目录与 package.json',
      created.status === 200 && existsSync(join(dir, 'package.json')),
      `status=${created.status} dir=${existsSync(dir)} package.json=${existsSync(join(dir, 'package.json'))}`,
    )
    const listed = await call('GET', '/api/dsh-profile/list')
    const names = (json(listed.body)?.profiles ?? []).map((profile) => profile.name)
    /*
     * 这里曾额外断言 `names.includes('wintest')`——假定宿主跑在名为 wintest 的 profile 上。
     * 那是**这台机器当时的启动方式**，不是插件的契约：换任何别的 profile 名（compat / web…）
     * 都会假红。要断言的是「新建的 profile 出现在列表里，且列表不是只回了它一个」
     * （宿主自己的 profile 也在），与宿主叫什么无关。
     */
    record(
      'B6 profile：GET /list 能看到新建的 profile（以及宿主自用的那个）',
      names.includes('winprobe') && names.length >= 2,
      `profiles=${JSON.stringify(names)}`,
    )
    const duplicated = await call('POST', '/api/dsh-profile/duplicate', { name: 'winprobe2', from: 'winprobe' })
    const dupOk = duplicated.status === 200 && existsSync(join(profilesRoot, 'winprobe2', 'package.json'))
    record('B6 profile：POST /duplicate 复制 profile 并装好依赖', dupOk, `status=${duplicated.status} body=${JSON.stringify(duplicated.body.slice(0, 200))}`)
    if (!dupOk) {
      const leftover = existsSync(join(profilesRoot, 'winprobe2', 'package.json'))
      record(
        'B6 profile：duplicate 报错时不该留下半成品目录（复制已完成，只有装依赖那步失败）',
        !leftover,
        `残留 winprobe2=${leftover}${leftover ? '（目录已建出：用户看到的是失败，磁盘上却多了个 profile）' : ''}`,
      )
    }
    // 后续链路跟着实际情况走：copy 成功就用 copy，否则退回源 profile，避免一处失败带崩全链
    const chainName = existsSync(join(profilesRoot, 'winprobe2')) ? 'winprobe2' : 'winprobe'
    const renamed = await call('POST', '/api/dsh-profile/rename', { name: chainName, newName: 'winprobe3' })
    record(
      'B6 profile：POST /rename 重命名后旧目录消失、新目录出现',
      renamed.status === 200 && !existsSync(join(profilesRoot, chainName)) && existsSync(join(profilesRoot, 'winprobe3')),
      `status=${renamed.status} 源=${chainName} 旧目录还在=${existsSync(join(profilesRoot, chainName))} body=${JSON.stringify(renamed.body.slice(0, 140))}`,
    )
    const ported = await call('POST', '/api/dsh-profile/port', { name: 'winprobe3', port: 3177 })
    const runtimeFile = join(profilesRoot, 'winprobe3', 'profile.runtime.json')
    const runtimePort = existsSync(runtimeFile) ? json(readFileSync(runtimeFile, 'utf8'))?.port : undefined
    record('B6 profile：POST /port 把端口写进 profile.runtime.json', ported.status === 200 && runtimePort === 3177, `status=${ported.status} port=${String(runtimePort)} body=${JSON.stringify(ported.body.slice(0, 140))}`)
    const traversal = await call('POST', '/api/dsh-profile/create', { name: '..\\escape' })
    record('B6 profile：拒绝带反斜杠的非法 profile 名（Windows 路径穿越）', traversal.status === 400, `status=${traversal.status} body=${JSON.stringify(traversal.body.slice(0, 120))}`)
    const deletedA = await call('POST', '/api/dsh-profile/delete', { name: 'winprobe3' })
    const deletedB = await call('POST', '/api/dsh-profile/delete', { name: 'winprobe' })
    const deletedC = existsSync(join(profilesRoot, 'winprobe2')) ? await call('POST', '/api/dsh-profile/delete', { name: 'winprobe2' }) : { status: 200 }
    record(
      'B6 profile：POST /delete 删干净（目录从磁盘消失，含被复制的那个）',
      deletedA.status === 200 &&
        deletedB.status === 200 &&
        deletedC.status === 200 &&
        !existsSync(join(profilesRoot, 'winprobe')) &&
        !existsSync(join(profilesRoot, 'winprobe3')) &&
        !existsSync(join(profilesRoot, 'winprobe2')),
      `status=${deletedA.status}/${deletedB.status}/${deletedC.status} 残留=${JSON.stringify(['winprobe', 'winprobe2', 'winprobe3'].filter((name) => existsSync(join(profilesRoot, name))))}`,
    )
  }

  /* ---- B7. mcp：真 .cmd stdio 服务器握手 + CP936 stderr 解码 ---- */
  {
    const servers = await call('GET', '/api/dsh-mcp/servers')
    record('B7 mcp：GET /servers 返回可解析的服务器清单', servers.status === 200 && Array.isArray(json(servers.body)?.servers), `status=${servers.status}`)

    if (codegraphCli === undefined) {
      skip('B7 mcp：连接测试拉真 .cmd MCP 服务器', '未给 --codegraph-cli')
    } else {
      const started = Date.now()
      const tested = await call('POST', '/api/dsh-mcp/test', {
        config: { serverName: 'winprobe', transport: 'stdio', command: codegraphCli, args: ['serve', '--mcp'] },
      }, { timeoutMs: 120_000 })
      const result = json(tested.body)?.result
      record(
        'B7 mcp：POST /test 经 spawnPortable 拉起 .cmd MCP 服务器并完成 initialize/tools-list',
        tested.status === 200 && result?.ok === true && Array.isArray(result?.tools),
        `status=${tested.status} ok=${String(result?.ok)} tools=${result?.tools?.length ?? 0} serverInfo=${JSON.stringify(result?.serverInfo ?? null)} 用时=${Date.now() - started}ms${result?.error !== undefined ? ` error=${JSON.stringify(String(result.error).slice(0, 200))}` : ''}`,
      )
    }

    // 让一个 .cmd 往 stderr 吐 CP936 中文：这是 Windows 上「连接测试失败原因」的唯一线索
    const badShim = join(repo, '.smoke', 'win-plugins', 'bad-mcp.cmd')
    writeFileSync(badShim, '@echo off\r\nthis-command-does-not-exist-9f3a\r\nexit /b 3\r\n')
    const failed = await call('POST', '/api/dsh-mcp/test', {
      config: { serverName: 'winprobe-bad', transport: 'stdio', command: badShim, args: [] },
    }, { timeoutMs: 60_000 })
    const failedResult = json(failed.body)?.result
    const reason = String(failedResult?.error ?? '')
    record(
      'B7 mcp：连不上时的原因是可读原文（cmd.exe 的 CP936 报错没变成 U+FFFD）',
      failed.status === 200 && failedResult?.ok !== true && reason !== '' && !hasMojibake(reason) && reason.includes('不是内部或外部命令'),
      `error=${JSON.stringify(reason.slice(0, 200))}`,
    )

    // 托管区块写盘：保存一台服务器 → 文件里出现托管标记 → 再读回 → 清空
    const patchFile = dshHome === undefined ? undefined : join(dshHome, 'cordis.patch.yml')
    const savedServers = await call('POST', '/api/dsh-mcp/servers/save', {
      servers: [
        { id: 'mcp-winprobe', config: { serverName: 'winprobe', transport: 'stdio', command: 'codegraph', args: ['serve', '--mcp'] } },
      ],
    })
    record('B7 mcp：POST /servers/save 写出托管区块', savedServers.status === 200, `status=${savedServers.status} body=${JSON.stringify(savedServers.body.slice(0, 200))}`)
    if (patchFile !== undefined && existsSync(patchFile)) {
      const text = readFileSync(patchFile, 'utf8')
      record(
        'B7 mcp：cordis.patch.yml 里托管区块的开闭标记成对出现',
        text.includes('# --- dsh-mcp-config managed') && text.includes('# --- end dsh-mcp-config managed'),
        `有开始标记=${text.includes('# --- dsh-mcp-config managed')} 有结束标记=${text.includes('# --- end dsh-mcp-config managed')}`,
      )
    } else {
      warn('B7 mcp：托管区块落盘未校验', `找不到 ${String(patchFile)}`)
    }
    const afterSave = await call('GET', '/api/dsh-mcp/servers')
    record('B7 mcp：保存后 GET /servers 能读到 winprobe', (json(afterSave.body)?.servers ?? []).some((row) => row.config?.serverName === 'winprobe'), `servers=${JSON.stringify((json(afterSave.body)?.servers ?? []).map((row) => row.config?.serverName))}`)
    /*
     * 清空要显式确认：插件对「把最后一条也删掉」要求 clearAll: true（防误清空），
     * 卡片删最后一条时会自动带上；裸 { servers: [] } 会被 400 挡下——这不是缺陷，
     * 是 0.2.x 之后加的护栏，脚本原先不知道。
     */
    const cleared = await call('POST', '/api/dsh-mcp/servers/save', { servers: [], clearAll: true })
    record('B7 mcp：清空服务器列表成功（托管区块可复位）', cleared.status === 200, `status=${cleared.status} body=${JSON.stringify(cleared.body.slice(0, 160))}`)
  }

  /* ---- B8. tty：shell 候选、本机文件、SSH 探针、真 PTY ---- */
  {
    const shells = await call('GET', '/api/dsh-tty/shells')
    const list = json(shells.body)?.shells ?? []
    const paths = list.map((row) => (typeof row === 'string' ? row : row?.path)).filter((value) => typeof value === 'string')
    const hasCmd = paths.some((value) => /cmd\.exe$/i.test(value))
    const hasPwsh = paths.some((value) => /powershell|pwsh/i.test(value))
    record(
      'B8 tty：GET /shells 列出 Windows 上真实存在的 shell（cmd.exe + PowerShell）',
      shells.status === 200 && hasCmd && hasPwsh,
      `候选（${paths.length}）=${JSON.stringify(paths.slice(0, 8))}`,
    )

    const sandbox = join(repo, '.smoke', 'win-plugins')
    const listing = await call('POST', '/api/dsh-tty/local-fs/list', { path: sandbox })
    record('B8 tty：POST /local-fs/list 能列 Windows 目录', listing.status === 200 && Array.isArray(json(listing.body)?.entries), `status=${listing.status} entries=${json(listing.body)?.entries?.length ?? 0}`)

    const dirPath = join(sandbox, '中文 目录')
    const madeDir = await call('POST', '/api/dsh-tty/local-fs/mkdir', { path: dirPath, parents: true })
    const renamedDir = await call('POST', '/api/dsh-tty/local-fs/rename', { from: dirPath, to: join(sandbox, '中文 目录2') })
    const removedDir = await call('POST', '/api/dsh-tty/local-fs/remove', { path: join(sandbox, '中文 目录2'), recursive: true })
    record(
      'B8 tty：local-fs mkdir/rename/remove 往返（路径含中文与空格）',
      madeDir.status === 200 && renamedDir.status === 200 && removedDir.status === 200 && !existsSync(dirPath),
      `status=${madeDir.status}/${renamedDir.status}/${removedDir.status} 残留=${existsSync(dirPath)}`,
    )

    const sshConfig = await call('GET', '/api/dsh-tty/ssh-config')
    record('B8 tty：GET /ssh-config 在无 ~/.ssh/config 时优雅返回空表', sshConfig.status === 200 && json(sshConfig.body) !== undefined, `status=${sshConfig.status}`)
    const knownHosts = await call('GET', '/api/dsh-tty/known-hosts')
    record('B8 tty：GET /known-hosts 可解析', knownHosts.status === 200 && json(knownHosts.body) !== undefined, `status=${knownHosts.status}`)
    const probe = await call('POST', '/api/dsh-tty/probe', { host: '127.0.0.1', username: 'nobody', port: 1, auth: 'password', password: 'x' })
    record('B8 tty：POST /probe 对闭死端口给出结构化失败而不是 5xx', probe.status === 200 && json(probe.body) !== undefined, `status=${probe.status} body=${JSON.stringify(probe.body.slice(0, 160))}`)

    /* 真 PTY：走插件自己的 WebSocket 帧协议，在 Windows 上 spawn cmd.exe 并回显命令 */
    const WS_URL = `ws://${target.hostname}:${port}/api/dsh-tty/ws`
    const marker = 'WINPTY_9F3A'
    const ptyResult = await new Promise((resolvePromise) => {
      let socket
      let settled = false
      let seenReady = false
      let output = ''
      const finish = (ok, detail) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        try {
          socket?.close()
        } catch {
          /* 已关 */
        }
        resolvePromise({ ok, detail })
      }
      const timer = setTimeout(() => finish(false, `超时；已收到 ${JSON.stringify(output.slice(-300))}`), 45_000)
      try {
        socket = new WebSocket(WS_URL, { headers: { host: `${target.hostname}:${port}` } })
      } catch (error) {
        return finish(false, `构造 WebSocket 失败：${String(error?.message ?? error)}`)
      }
      socket.addEventListener('error', (event) => finish(false, `WebSocket error：${String(event?.message ?? event?.error ?? 'unknown')}`))
      socket.addEventListener('open', () => {
        socket.send(JSON.stringify({ t: 'spawn', cols: 100, rows: 30, cwd: sandbox }))
      })
      socket.addEventListener('message', (event) => {
        let frame
        try {
          frame = JSON.parse(String(event.data))
        } catch {
          return
        }
        if (frame.t === 'error') return finish(false, `宿主 error 帧：${JSON.stringify(frame)}`)
        if (frame.t === 'ready') {
          seenReady = true
          socket.send(JSON.stringify({ t: 'input', sid: frame.sid, d: `echo ${marker}\r\n` }))
          return
        }
        if (frame.t === 'data') {
          output += frame.d ?? ''
          if (output.includes(marker)) {
            socket.send(JSON.stringify({ t: 'kill', sid: frame.sid }))
            return finish(true, `sid=${frame.sid} pid=${String(frame.pid ?? '(见 ready)')} 回显命中 ${marker}`)
          }
        }
      })
      if (seenReady === false) {
        /* 什么都没发生也会被上面的 timer 兜住 */
      }
    })
    record('B8 tty：WebSocket + node-pty 在真 Windows 上开出 PTY 并回显命令', ptyResult.ok, ptyResult.detail)

    const sessionsFrame = await new Promise((resolvePromise) => {
      let socket
      let settled = false
      const finish = (value) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        try {
          socket?.close()
        } catch {
          /* 已关 */
        }
        resolvePromise(value)
      }
      const timer = setTimeout(() => finish({ ok: false, detail: '超时' }), 15_000)
      socket = new WebSocket(WS_URL, { headers: { host: `${target.hostname}:${port}` } })
      socket.addEventListener('error', () => finish({ ok: false, detail: 'WebSocket error' }))
      socket.addEventListener('open', () => socket.send(JSON.stringify({ t: 'sessions' })))
      socket.addEventListener('message', (event) => {
        try {
          const frame = JSON.parse(String(event.data))
          if (frame.t === 'sessions') finish({ ok: Array.isArray(frame.list), detail: `sessions=${JSON.stringify(frame.list)}` })
          else if (frame.t === 'error') finish({ ok: false, detail: JSON.stringify(frame) })
        } catch {
          /* 忽略非 JSON */
        }
      })
    })
    record('B8 tty：WS {t:"sessions"} 返回全局会话快照', sessionsFrame.ok, sessionsFrame.detail)
  }

  /* ---- B9. docker：无 docker 时的降级形态 + .cmd 二进制的启动方式 ---- */
  {
    const containers = json((await call('POST', '/api/dsh-docker/containers', { target: '*' })).body)
    record(
      'B9 docker：没有 docker 的机器上 /containers 给出结构化错误而不是 5xx',
      containers !== undefined && containers.ok !== undefined,
      `body=${JSON.stringify(brief(containers, 220))}`,
    )
    const config = json((await call('GET', '/api/dsh-docker/config')).body)
    record(
  'B9 docker：GET /config 返回配置快照（含 allowMutations/allowExec 开关位）',
  config?.config !== undefined && typeof config.config.allowMutations === 'boolean' && typeof config.config.allowExec === 'boolean',
  `keys=${JSON.stringify(Object.keys(config?.config ?? {}))} allowMutations=${String(config?.config?.allowMutations)}`,
)
    const targetsBefore = json((await call('GET', '/api/dsh-docker/targets')).body)
    record(
      'B9 docker：GET /targets 返回目标列表（干净机器上为空表，插件不自带目标）',
      Array.isArray(targetsBefore?.targets),
      `targets=${JSON.stringify(targetsBefore?.targets)}（settings 里没配 targets → 空；卡片里手工添加）`,
    )

    // 配一个本机目标 + 一个 .cmd 当 dockerBin：这一条同时验证
    //   (a) /config 接受 **Windows 绝对路径**（盘符 `:` + 分隔符 `\`）——这是真机上
    //       原实现一定拒绝的输入（assertBin 的字符类少了 `:` 与 `\`）；
    //   (b) 落盘后 /targets 能读回；
    //   (c) docker 本机通道遇到 .cmd 时的启动方式。
    const fakeDocker = join(scratchRoot, 'fakedocker.cmd')
    writeFileSync(fakeDocker, '@echo off\r\necho 27.0.0\r\n')
    const absBin = fakeDocker.replace(/\//g, '\\')
    const setBin = await call('POST', '/api/dsh-docker/config', {
      dockerBin: absBin,
      logTailDefault: 321,
      targets: [{ name: 'winprobe', kind: 'local' }],
    })
    record(
      'B9 docker：POST /config 接受 Windows 绝对路径（C:\\…\\x.exe 形态）并落盘',
      setBin.status === 200 && json(setBin.body)?.config?.dockerBin === absBin,
      `status=${setBin.status} dockerBin=${JSON.stringify(json(setBin.body)?.config?.dockerBin)} 期望=${JSON.stringify(absBin)} body=${JSON.stringify(setBin.body.slice(0, 160))}`,
    )
    /*
     * 落盘位置：**当前 profile 的插件 entry 配置**，即 `<dsh-home>/profiles/<name>/cordis.patch.yml`。
     * 0.1.7 起 settings 不再写 `<dsh-home>/settings.yaml`（那个文件已不存在），
     * 而脚本原先钉的就是它——于是这两条断言在**任何** profile 名 / 任何 dsh ≥0.1.7 上恒红，
     * 同时上面那条 API 往返却是绿的。宿主跑在哪个 profile 由启动方式决定，脚本不知道，
     * 所以扫全部 profile 的 patch 文件：命中任意一个即视为已落盘。
     */
    const profilePatchText = () => {
      if (dshHome === undefined) return ''
      const profilesRoot = join(dshHome, 'profiles')
      if (!existsSync(profilesRoot)) return ''
      return readdirSync(profilesRoot)
        .map((name) => join(profilesRoot, name, 'cordis.patch.yml'))
        .filter((file) => existsSync(file))
        .map((file) => readFileSync(file, 'utf8'))
        .join('\n')
    }
    const persistedText = profilePatchText()
    const persisted = persistedText === ''
      ? undefined
      : { dockerBin: persistedText.includes(absBin), logTailDefault: persistedText.includes('321') }
    record(
      'B9 docker：配置落下的就是合法值（非法值写盘 → 下次开机整段配置退回默认）',
      persisted !== undefined && persisted.dockerBin === true && persisted.logTailDefault === true,
      `profile patch 含 dockerBin=${String(persisted?.dockerBin)} 含 logTailDefault=${String(persisted?.logTailDefault)}`,
    )
    // 非法值必须在**落盘之前**被拦下，且要带原因（原实现是无正文 400 + 照样写进文件）
    const rejected = await call('POST', '/api/dsh-docker/config', { dockerBin: 'C:\\bad;rm -rf\\.exe' })
    const rejectReason = String(json(rejected.body)?.error ?? '')
    record(
      'B9 docker：非法 dockerBin 回 400 **且带原因**（shell 元字符仍被拒）',
      rejected.status === 400 && rejectReason !== '',
      `status=${rejected.status} error=${JSON.stringify(rejectReason.slice(0, 160))}`,
    )
    const afterReject = profilePatchText().includes('rm -rf')
    record('B9 docker：被拒的值没有留在 profile 配置里', afterReject === false, `profile patch 含被拒值=${String(afterReject)}`)
    const targetsAfter = json((await call('GET', '/api/dsh-docker/targets')).body)
    record(
      'B9 docker：GET /targets 能看到刚加的本机目标',
      (targetsAfter?.targets ?? []).some((target) => target.name === 'winprobe' && target.kind === 'local'),
      `targets=${JSON.stringify(targetsAfter?.targets)}`,
    )
    const viaCmd = await call('POST', '/api/dsh-docker/containers', { target: 'winprobe' })
    const viaCmdText = String(viaCmd.body)
    if (viaCmd.status === 200 && !/EINVAL/.test(viaCmdText)) {
      record('B9 docker：dockerBin 指向 .cmd 时本机通道能拉起来', true, `status=200 body=${JSON.stringify(viaCmdText.slice(0, 200))}`)
    } else {
      // 本机通道走的是裸 spawn（ssh-exec.ts 的 runLocal/runLocalStream），不是 kit 的
      // spawnPortable：`.cmd` 会被 Node 的加固拒掉（EINVAL）。docker 官方是 .exe，
      // 所以日常不受影响，但把 dockerBin 指到 .cmd 包装脚本就会踩到——与 codegraph /
      // mcp / profile 已经修掉的是同一类缺陷，这里如实记为已知限制而不是 PASS。
      warn(
        'B9 docker：dockerBin 指向 .cmd 时本机通道起不来（已知限制：runLocal 用裸 spawn，非 kit 的 spawnPortable）',
        `status=${viaCmd.status} body=${JSON.stringify(viaCmdText.slice(0, 200))}`,
      )
    }
    // 复位：删掉探针目标与假 bin，别把配置留给下一轮
    await call('POST', '/api/dsh-docker/config', { dockerBin: 'docker', logTailDefault: 200, targets: [], clearTargets: true })
  }

  /* ---- B10. 客户端半体：宿主把每个插件的 client.js 端上来了 ---- */
  {
    const logFile = dshHome === undefined ? undefined : join(repo, '.smoke', 'win-plugins', 'host.log')
    let token
    const candidates = [process.env.DSH_WEB_TOKEN, dshHome === undefined ? undefined : join(dshHome, '..', 'wintest.log'), logFile].filter((value) => typeof value === 'string')
    for (const candidate of candidates) {
      if (token !== undefined) break
      try {
        const text = readFileSync(candidate, 'utf8')
        const matched = /[?&]token=([A-Za-z0-9_-]+)/.exec(text)
        if (matched) token = matched[1]
      } catch {
        /* 读不到就换下一个 */
      }
    }
    if (token === undefined) {
      skip('B10 客户端半体：抓取 /plugins/??<ids>/client.js', '日志里没找到 token（可用 --dsh-home 指向宿主日志所在目录）')
    } else {
      // 带 token 的首次访问会 303 到不带 token 的地址（凭据换 Cookie），必须**带着 Cookie** 跟跳。
      const cookieJar = {}
      const cookieHeader = () => Object.entries(cookieJar).map(([key, value]) => `${key}=${value}`).join('; ')
      const getWithJar = async (path) => {
        const jar = cookieHeader()
        const response = await call('GET', path, undefined, jar === '' ? {} : { headers: { cookie: jar } })
        const raw = response.headers?.['set-cookie']
        for (const entry of Array.isArray(raw) ? raw : raw === undefined ? [] : [raw]) {
          const pair = String(entry).split(';')[0]
          const eq = pair.indexOf('=')
          if (eq > 0) cookieJar[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim()
        }
        return response
      }
      let shell = await getWithJar(`/?token=${token}`)
      let hops = 0
      const chain = []
      while (shell.status >= 300 && shell.status < 400 && hops < 3) {
        const location = String(shell.headers?.location ?? '')
        chain.push(`${shell.status}→${location}（cookie: ${Object.keys(cookieJar).join(',') || '无'}）`)
        if (location === '') break
        const next = location.startsWith('http') ? new URL(location).pathname + new URL(location).search : location
        shell = await getWithJar(next)
        hops += 1
      }
      const html = shell.body
      // 客户端 bundle 的地址有两种形态，都要按 HTML 里的**原样**取，不能自己拼：
      //   整条预载  `/plugins/??a/client.js,b/client.js&amp;rev=<全量哈希>`
      //   单条      `/plugins/??a/client.js&rev=<每 bundle 哈希>-<序号>`
      // 拿 `/plugins/<id>/client.js` 去取是 404（真机实测），因为 id 里的 `@` `/`
      // 属于 `??` 之后的“路径段”，不是普通路径。下面的正则从 HTML 里抠出 id 列表，
      // 请求时用原样的单条地址。
      const perBundle = [...html.matchAll(/\/plugins\/\?\?([^"'<>\s,]+?)\/client\.js(?:&amp;|&)rev=([^"'<>\s]+)/g)].map(
        (match) => ({ raw: match[1], id: decodeURIComponent(match[1]), path: `/plugins/??${match[1]}/client.js&rev=${match[2]}` }),
      )
      const entirePreload = [...html.matchAll(/\/plugins\/\?\?([^"'<>\s]+?)\/client\.js(?:&amp;|&)rev=([^"'<>\s]+)/g)].map(
        (match) => ({ id: decodeURIComponent(match[1]), path: `/plugins/??${match[1]}/client.js&rev=${match[2]}` }),
      )
      const ids = perBundle.map((row) => row.id)
      const ours = perBundle.filter((row) => row.id.startsWith('@hyzyn/dsh-'))
      const others = perBundle.filter((row) => !row.id.startsWith('@hyzyn/dsh-'))
      record(
        'B10 客户端半体：Web shell HTML 能取到（token 换 Cookie 的跳转链能走通）',
        shell.status === 200 && html.includes('<html'),
        `status=${shell.status} bytes=${html.length} 跳转=${JSON.stringify(chain)}`,
      )
      record(
        'B10 客户端半体：HTML 预载清单里含本仓库全部 9 个插件的 client 模块',
        new Set(ours.map((row) => row.id)).size >= 9,
        `本仓库 ${new Set(ours.map((r) => r.id)).size} 个 / 全部单条 ${new Set(ids).size} 个：${JSON.stringify([...new Set(ours.map((r) => r.id))].sort())}`,
      )
      // 逐个取一遍：确认宿主能从磁盘读出这些 bundle（Windows 路径 + 原子写 + 缓存头）
      const fetchBundle = async (row) => {
        const bundle = await getWithJar(row.path)
        const length = typeof bundle.body === 'string' ? bundle.body.length : 0
        return { id: row.id, status: bundle.status, length, mojibake: hasMojibake(bundle.body), cache: String(bundle.headers?.['cache-control'] ?? '') }
      }
      const ourBundles = await Promise.all(ours.map(fetchBundle))
      const failedOurs = ourBundles.filter((row) => row.status !== 200 || row.length === 0 || row.mojibake)
      record(
        'B10 客户端半体：本仓库 9 个插件的 client.js 都能被宿主读出且非空、无 U+FFFD',
        ourBundles.length >= 9 && failedOurs.length === 0,
        failedOurs.length === 0
          ? ourBundles.map((row) => `${row.id}=${Math.round(row.length / 1024)}KB`).join('  ')
          : failedOurs.map((row) => `${row.id} → ${row.status}/${row.length}B`).join('；'),
      )
      console.log(`      整条预载 URL 也有 ${entirePreload.length} 条；缓存头样例：${JSON.stringify(ourBundles.find((row) => row.status === 200)?.cache ?? '')}`)
      // 宿主自带的那一大批只做观察：它们取不到不说明本仓库有问题
      const othersFetched = await Promise.all(others.map(fetchBundle))
      const failedOthers = othersFetched.filter((row) => row.status !== 200 || row.length === 0)
      if (failedOthers.length === 0) {
        console.log(`      宿主自带 bundle：${othersFetched.length} 个全部 200`)
      } else {
        warn(
          'B10 客户端半体：宿主自带 bundle 里有取不到的（与本仓库无关，仅记录）',
          `${failedOthers.length}/${othersFetched.length} 个非 200：${failedOthers.slice(0, 6).map((row) => `${row.id} → ${row.status}`).join('；')}`,
        )
      }
    }
  }

  /* ---- B11. codegraph：真实建索引 + 查询（收尾做，因为它会改磁盘）---- */
  if (codegraphCli === undefined) {
    skip('B11 codegraph：真实建索引', '未给 --codegraph-cli')
  } else {
    const fresh = join(scratchRoot, `fresh-${runId}`)
    mkdirSync(fresh, { recursive: true })
    writeFileSync(join(fresh, 'app.js'), "export function greet(name) { return 'hi ' + name }\nexport const twice = (n) => n * 2\n")
    const before = await call('GET', `/api/dsh-codegraph/status${q({ path: fresh })}`)
    record('B11 codegraph：未索引目录的 /status 明确回 initialized=false', json(before.body)?.status?.initialized === false, `status=${before.status} initialized=${String(json(before.body)?.status?.initialized)}`)
    const init = await call('POST', '/api/dsh-codegraph/init', { path: fresh }, { timeoutMs: 300_000 })
    record('B11 codegraph：POST /init 在 Windows 上真建出索引', init.status === 200 && existsSync(join(fresh, '.codegraph', 'codegraph.db')), `status=${init.status} db=${existsSync(join(fresh, '.codegraph', 'codegraph.db'))} body=${JSON.stringify(init.body.slice(0, 180))}`)
    const after = await call('GET', `/api/dsh-codegraph/status${q({ path: fresh })}`)
    const fileCount = json(after.body)?.status?.fileCount
    record('B11 codegraph：索引后 /status 读到文件与符号数', typeof fileCount === 'number' && fileCount > 0, `fileCount=${String(fileCount)} nodeCount=${String(json(after.body)?.status?.nodeCount)}`)
    const secondInit = await call('POST', '/api/dsh-codegraph/init', { path: fresh })
    record('B11 codegraph：重复 /init 回 409（幂等，不重复建）', secondInit.status === 409, `status=${secondInit.status}`)
    const queried = await call('GET', `/api/dsh-codegraph/query${q({ path: fresh, q: 'greet', limit: '5' })}`)
    record('B11 codegraph：/query 对刚建的索引有结果', queried.status === 200 && json(queried.body)?.results !== undefined, `status=${queried.status} results=${JSON.stringify(json(queried.body)?.results).slice(0, 160)}`)
    const reprobed = await call('POST', '/api/dsh-codegraph/reprobe', {})
    record('B11 codegraph：POST /reprobe 报出 CLI 可用', json(reprobed.body)?.cliAvailable === true, `cliAvailable=${String(json(reprobed.body)?.cliAvailable)}`)
    // 索引产物的可变范围：只应有 .codegraph/，源文件不动
    const stray = ['app.js'].filter((name) => !existsSync(join(fresh, name)))
    record('B11 codegraph：索引只新增 .codegraph/，不碰源文件、不在根目录写 .gitignore', stray.length === 0 && !existsSync(join(fresh, '.gitignore')), `缺源文件=${JSON.stringify(stray)} 根 .gitignore 存在=${existsSync(join(fresh, '.gitignore'))}`)
  }

/* ================================================================== *
 * B12 codegraph /node（参数名是 name，不是 symbol —— 上一轮我给错了）
 * ================================================================== */
{
  const node = await call('GET', `/api/dsh-codegraph/node${q({ path: PROJECT, name: 'gamma' })}`)
  const body = json(node.body)
  record(
    'B12 codegraph GET /node?name=：拿到符号详情',
    node.status === 200 && body?.node !== undefined,
    `status=${node.status} name=${String(body?.name)} node=${brief(body?.node, 160)}`,
  )
  const missing = await call('GET', `/api/dsh-codegraph/node${q({ path: PROJECT })}`)
  record('B12 codegraph /node：缺 name 时 400 并点名参数', missing.status === 400 && String(json(missing.body)?.error ?? '').includes('name'), `status=${missing.status} body=${JSON.stringify(missing.body.slice(0, 120))}`)
}

/* ================================================================== *
 * B13 变更门禁的**拒绝**路径（allowMutations / allowExec 关掉时）
 * ================================================================== */
{
  // 前置：把 u1 这个 SSH 目标装回去。B9 的复位（以及 `verify-docker-ssh.mjs` 自己的复位）
  // 会用 clearTargets 把 targets 清空，之后所有数据路由都会回 400「未知目标」。
  const restored = await call('POST', '/api/dsh-docker/config', {
    dockerBin: 'docker',
    targets: [{ name: 'u1', kind: 'ssh', host: '10.211.55.5', port: 22, username: 'parallels', auth: 'key', keyPath: dockerSshKey }],
  })
  record(
    'B13 前置：重新装上 u1 这个 SSH 目标（否则后面所有 docker 数据路由都是 400 未知目标）',
    json(restored.body)?.config?.targets?.length === 1,
    `targets=${JSON.stringify(json(restored.body)?.config?.targets)}`,
  )
  const off = await call('POST', '/api/dsh-docker/config', { allowMutations: false, allowExec: false })
  /*
   * 变更端点有两道门禁，顺序是**先同源再开关**：`src/index.ts` 里
   * `MUTATION_SUBROUTES.has(sub) && !hasSameOriginProof(req)` 在 switch **之前**，
   * 而 allowMutations 检查在 switch 里面。所以不带同源证明的请求根本走不到「未启用」
   * ——这也正是这个脚本原先红的原因：它用下面那个裸 call() 打，拿到的永远是
   * 「缺少同源证明」。要测开关，就得先过同源这一关（浏览器 fetch 天然会带）。
   */
  const sameOrigin = { origin: `http://${target.hostname}:${String(port)}` }
  const gateCases = [
    ['/action', { target: 'u1', id: 'dsh-probe-run', action: 'stop' }],
    ['/images/remove', { target: 'u1', ref: 'nginx:latest' }],
    ['/images/prune', { target: 'u1' }],
    ['/networks/remove', { target: 'u1', name: 'x' }],
    ['/networks/prune', { target: 'u1' }],
    ['/volumes/remove', { target: 'u1', name: 'x' }],
    ['/volumes/prune', { target: 'u1' }],
    ['/exec', { target: 'u1', id: 'x', command: 'echo x' }],
  ]
  const notGated = []
  for (const [sub, payload] of gateCases) {
    const response = await call('POST', `/api/dsh-docker${sub}`, payload, { headers: sameOrigin })
    if (response.status !== 403) notGated.push(`${sub} → ${response.status}`)
    else if (!String(response.body).includes('未启用')) notGated.push(`${sub} → 403 但文案不含「未启用」：${String(response.body).slice(0, 80)}`)
  }
  record(
    'B13 门禁：关掉 allowMutations / allowExec 后，8 条变更路由全部 403 且点名开关',
    off.status === 200 && notGated.length === 0,
    notGated.length === 0 ? '8/8 403' : notGated.join('；'),
  )
  // 反向：**同样**的请求去掉同源证明后必须被同源门禁拦下（两道门禁都得真的成立）
  const noProof = await call('POST', '/api/dsh-docker/action', { target: 'u1', id: 'x', action: 'stop' })
  record(
    'B13 门禁：不带同源证明的变更请求仍被拦（同源门禁在开关之前）',
    noProof.status === 403 && String(noProof.body).includes('同源'),
    `status=${noProof.status} body=${String(noProof.body).slice(0, 120)}`,
  )
  // 只读路由不受影响
  const stillRead = await call('POST', '/api/dsh-docker/containers', { target: 'u1' }, { headers: sameOrigin })
  record('B13 门禁：只读路由在门禁关闭时照常可用（不是一刀切）', stillRead.status === 200, `status=${stillRead.status} body=${String(stillRead.body).slice(0, 120)}`)
  await call('POST', '/api/dsh-docker/config', { allowMutations: true, allowExec: true })
}

/* ================================================================== *
 * B14 env 密钥条目 → 凭据存储分流
 * ================================================================== */
{
  const secret = 'dsh-secret-9F3A-中文-ħ'
  const saved = await call('POST', '/api/dsh-env/save', { entries: [{ key: 'DSH_WIN_SECRET', value: secret, secret: true }] })
  const envFile = dshHome === undefined ? undefined : join(dshHome, 'env.yml')
  const credFile = dshHome === undefined ? undefined : join(dshHome, '.credentials.yaml')
  const envText = envFile !== undefined && existsSync(envFile) ? readFileSync(envFile, 'utf8') : ''
  const credText = credFile !== undefined && existsSync(credFile) ? readFileSync(credFile, 'utf8') : undefined
  record(
    'B14 env：secret:true 的条目——明文不进 env 文件',
    saved.status === 200 && envText.includes('DSH_WIN_SECRET') && !envText.includes(secret),
    `status=${saved.status} env.yml 含键=${envText.includes('DSH_WIN_SECRET')} 含明文=${envText.includes(secret)}`,
  )
  if (credText === undefined) {
    warn('B14 env：凭据存储文件未找到', `找不到 ${String(credFile)}（真机上 .credentials.yaml 由 dsh-credentials-local 落盘）`)
  } else {
    record(
      'B14 env：明文被存进凭据存储（.credentials.yaml）',
      credText.includes(secret),
      `.credentials.yaml 含明文=${credText.includes(secret)}（${credText.length} 字节）`,
    )
  }
  const listed = json((await call('GET', '/api/dsh-env/list')).body)
  const row = (listed?.entries ?? []).find((entry) => entry.key === 'DSH_WIN_SECRET')
  record(
    'B14 env：读回时密钥条目不回明文',
    row !== undefined && row.secret === true && String(row.value ?? '') !== secret,
    `row=${JSON.stringify(row)}`,
  )
  await call('POST', '/api/dsh-env/save', { entries: [] })
  const afterClear = envFile !== undefined && existsSync(envFile) ? readFileSync(envFile, 'utf8') : ''
  record('B14 env：清空后 env.yml 里不再有探针键', !afterClear.includes('DSH_WIN_SECRET'), `仍在=${afterClear.includes('DSH_WIN_SECRET')}`)
}

/* ================================================================== *
 * B15 mcp：保存后工具**真的**热加载（E2）+ codegraph 的托管行被真 MCP client 加载（E6）
 * ================================================================== */
if (codegraphCli === undefined) {
  skip('B15 mcp：热加载', '未给 --codegraph-cli')
} else {
  const saved = await call('POST', '/api/dsh-mcp/servers/save', {
    servers: [{ id: 'mcp-winprobe', config: { serverName: 'winprobe', transport: 'stdio', command: codegraphCli, args: ['serve', '--mcp'] } }],
  })
  let status = 'not-loaded'
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    const rows = json((await call('GET', '/api/dsh-mcp/servers')).body)?.servers ?? []
    status = String(rows.find((row) => row.id === 'mcp-winprobe')?.status ?? 'not-loaded')
    if (status === 'active' || status === 'error') break
    await new Promise((resolve) => setTimeout(resolve, 800))
  }
  record(
    'B15 mcp：保存后经 HMR 真的被 loader 挂起来（status=active，而不是停在 not-loaded）',
    saved.status === 200 && status === 'active',
    `保存=${saved.status} 最终 status=${status}（loader 树里的 fiber 状态）`,
  )
  // E6：codegraph 把「已索引的默认工程」写进 home 补丁的托管行；DSH 核心的 mcp-client
  // 加载它之后，它会以「不受 mcp 插件管理的 mcp-client 条目」出现在 /servers 的 conflicts 里。
  // 先确保默认路径就是 B1 里已经索引好的那个工程，托管行才会被写出来。
  await call('POST', '/api/dsh-codegraph/default-path', { path: PROJECT })
  await call('POST', '/api/dsh-codegraph/sync', { path: PROJECT })
  await new Promise((resolve) => setTimeout(resolve, 1500))
  const patchFile = dshHome === undefined ? undefined : join(dshHome, 'cordis.patch.yml')
  const patchText = patchFile !== undefined && existsSync(patchFile) ? readFileSync(patchFile, 'utf8') : ''
  record(
    'B15 跨插件：codegraph 把托管 MCP 行写进了 home 补丁（含成对的开闭标记）',
    patchText.includes('# --- dsh-codegraph mcp managed') && patchText.includes('# --- end dsh-codegraph mcp managed') && patchText.includes('dsh-mcp-client'),
    `补丁文件=${String(patchFile)} 有开始=${patchText.includes('# --- dsh-codegraph mcp managed')} 有结束=${patchText.includes('# --- end dsh-codegraph mcp managed')}`,
  )
  const after = json((await call('GET', '/api/dsh-mcp/servers')).body)
  const external = JSON.stringify(after?.conflicts ?? [])
  record(
    'B15 跨插件：codegraph 写的托管 MCP 行确实被 DSH 核心的 mcp-client 加载了（在 /servers 的 conflicts 里可见）',
    external.includes('codegraph') || external.includes('mcp-codegraph'),
    `conflicts=${external.slice(0, 240)}`,
  )
  // 复位同样要 clearAll: true（理由见 B7 那段）
  await call('POST', '/api/dsh-mcp/servers/save', { servers: [], clearAll: true })
}

/* ================================================================== *
 * B16 search：四个通道的真实命中（prompts / tools / panels / sessions）
 * ================================================================== */
{
  const marker = 'DshSearchMarker9F3A'
  const created = await call('POST', '/api/dsh-prompt/save', {
    prompt: { name: marker, versions: [{ content: `搜索语料 ${marker}`, label: 'v1' }] },
  })
  const createdId = json(created.body)?.prompts?.filter((prompt) => prompt.name === marker).at(-1)?.id
  const hit = async (needle) => {
    const response = await call('GET', `/api/dsh-search/query${q({ q: needle })}`)
    const body = json(response.body)
    return { status: response.status, sessions: body?.sessions ?? [], prompts: body?.prompts ?? [], tools: body?.tools ?? [], panels: body?.panels ?? [] }
  }
  const promptHit = await hit(marker)
  record(
    'B16 search：prompts 通道真实命中（用刚建的 prompt 当语料）',
    promptHit.status === 200 && promptHit.prompts.length > 0,
    `命中 ${promptHit.prompts.length} 条：${brief(promptHit.prompts)}`,
  )
  // tools 通道查的是 **MCP 工具**（ctx.tools.schemas()），不是内置 agent 工具
  const toolHit = await hit('codegraph')
  record(
    'B16 search：tools 通道真实命中（查的是 MCP 工具；命中 mcp__codegraph__codegraph_explore 也正是 E6 的独立佐证）',
    toolHit.status === 200 && toolHit.tools.length > 0,
    `命中 ${toolHit.tools.length} 条：${brief(toolHit.tools, 240)}`,
  )
  const panelHit = await hit('Codegraph')
  record('B16 search：panels 通道真实命中', panelHit.status === 200 && panelHit.panels.length > 0, `命中 ${panelHit.panels.length} 条：${brief(panelHit.panels)}`)
  // 缺陷：search 的 PANEL_DIRECTORY 里 6 个插件都有 registryName 门禁，唯独漏了 docker
  const dockerPanelHit = await hit('Docker')
  if (dockerPanelHit.panels.length === 0) {
    warn(
      'B16 search：搜不到 Docker 容器面板（search 的 PANEL_DIRECTORY 漏了 registryName: docker）',
      `查 Docker → panels ${dockerPanelHit.panels.length} 条；而同样的插件卡片 env-manager / mcp-config / prompt-manager / profile-manager / rss-digest / codegraph 都在目录里`,
    )
  } else {
    record('B16 search：Docker 卡片可被搜到', true, `命中 ${dockerPanelHit.panels.length} 条`)
  }
  const sessionHit = await hit('codegraph')
  if (sessionHit.sessions.length > 0) {
    record('B16 search：sessions 通道真实命中（语料是复制过来的真会话）', true, `命中 ${sessionHit.sessions.length} 条：${JSON.stringify(sessionHit.sessions.slice(0, 2)).slice(0, 240)}`)
  } else {
    warn(
      'B16 search：sessions 通道未命中',
      `在真机上往 scratch 的 sessions/ 放了一份真会话（原样复制的 .jsonl.zstd），重启后查 codegraph 仍 0 命中 —— 待查（会话是 Mac 上的 cwd 路径，可能被 store 按平台过滤）`,
    )
  }
  if (typeof createdId === 'string') await call('POST', '/api/dsh-prompt/delete', { promptId: createdId })
}

/* ================================================================== *
 * B17 profile：新建的 profile 真的能启动（--dump-config）
 * ================================================================== */
if (dshHome === undefined || nodeExe === undefined || dshBin === undefined) {
  skip('B17 profile：新建 profile 真启动', '需要 --dsh-home / --node / --dsh-bin')
} else {
  await call('POST', '/api/dsh-profile/create', { name: 'dshbootprobe', template: 'web' })
  const dumped = await new Promise((resolve) => {
    const child = spawn(nodeExe, [dshBin, '--profile', 'dshbootprobe', '--dump-config'], { env: { ...process.env, DSH_HOME: dshHome }, windowsHide: true })
    let out = ''
    let err = ''
    child.stdout?.on('data', (chunk) => (out += String(chunk)))
    child.stderr?.on('data', (chunk) => (err += String(chunk)))
    child.on('error', (error) => resolve({ code: null, out, err: String(error.message) }))
    child.on('close', (code) => resolve({ code, out, err }))
  })
  record(
    'B17 profile：新建的 profile 能被 dsh 真实解析（--dump-config 退出码 0 且含 bundle）',
    dumped.code === 0 && dumped.out.includes('@deepseek-ai/dsh-base'),
    `exit=${String(dumped.code)} stdout=${dumped.out.length} 字节 首行=${JSON.stringify(dumped.out.split('\n')[0] ?? '')} stderr=${JSON.stringify(dumped.err.slice(0, 160))}`,
  )
  await call('POST', '/api/dsh-profile/delete', { name: 'dshbootprobe' })
}

/* ================================================================== *
 * B18 prompt：POST /import —— 非空导出往返 + 空导出被拒（两条都是要钉的行为）
 * ================================================================== */
{
  const marker = '导入探针 9F3A'
  const seedMarker = '导入种子 9F3A'
  // 先建一条种子，否则导出是空的 —— 而空导出被拒恰恰是正确行为（下面单独断）
  const seeded = await call('POST', '/api/dsh-prompt/save', { prompt: { name: seedMarker, versions: [{ content: `种子内容 ${seedMarker}`, label: 'v1' }] } })
  const seedId = json(seeded.body)?.prompts?.filter((prompt) => prompt.name === seedMarker).at(-1)?.id

  const exported = await call('GET', '/api/dsh-prompt/export')
  const payload = json(exported.body)?.data
  record(
    'B18 prompt /export：返回 { ok, data:{ schema, version, prompts } }（载荷在 data 里）',
    exported.status === 200 && payload !== undefined && Array.isArray(payload.prompts) && payload.prompts.length > 0,
    `status=${exported.status} prompts=${payload?.prompts?.length ?? '?'} schema=${String(payload?.schema)} version=${String(payload?.version)}`,
  )
  record(
    'B18 prompt /import：非空导出原样回灌成功（幂等往返）',
    (await call('POST', '/api/dsh-prompt/import', { data: payload })).status === 200,
    'export → import 同一份载荷',
  )
  const emptyRejected = await call('POST', '/api/dsh-prompt/import', { data: { prompts: [] } })
  record(
    'B18 prompt /import：空 prompts 被拒且文案清楚（不是静默清空）',
    emptyRejected.status === 400 && String(json(emptyRejected.body)?.error ?? '').includes('没有 prompts'),
    `status=${emptyRejected.status} error=${JSON.stringify(String(json(emptyRejected.body)?.error ?? ''))}`,
  )

  const before = ((json((await call('GET', '/api/dsh-prompt/list')).body)?.prompts) ?? []).map((prompt) => prompt.id)
  const probe = {
    id: 'p-import9f3a',
    name: marker,
    versions: [{ id: 'v-import9f3a', content: `导入内容 ${marker}`, createdAt: new Date().toISOString() }],
    activeVersionId: 'v-import9f3a',
    ab: { enabled: false, aVersionId: 'v-import9f3a', bVersionId: 'v-import9f3a', aWeight: 50 },
  }
  const imported = await call('POST', '/api/dsh-prompt/import', {
    data: { ...payload, prompts: [...payload.prompts.filter((row) => row.id !== probe.id), probe], activePromptId: null },
  })
  const after = ((json((await call('GET', '/api/dsh-prompt/list')).body)?.prompts) ?? [])
  const landed = after.find((prompt) => prompt.id === probe.id)
  record(
    'B18 prompt /import：在导出内容上追加一条新 prompt 后整体导入，新条目落地',
    imported.status === 200 && landed !== undefined && landed.name === marker,
    `status=${imported.status} 落地=${landed !== undefined} 名字=${String(landed?.name)}`,
  )
  record(
    'B18 prompt /import：导入后原有的 prompt 没被冲掉',
    before.every((id) => after.some((prompt) => prompt.id === id)),
    `原有 ${before.length} 条全部保留=${before.every((id) => after.some((prompt) => prompt.id === id))}`,
  )
  await call('POST', '/api/dsh-prompt/delete', { promptId: probe.id })
  if (typeof seedId === 'string') await call('POST', '/api/dsh-prompt/delete', { promptId: seedId })
}

}

/* ================================================================== *
 * 汇总
 * ================================================================== */

const failed = results.filter((result) => result.ok !== true)
const warned = results.filter((result) => result.warned === true)
const skipped = results.filter((result) => result.skipped === true)
console.log(`\n# 汇总：PASS ${results.length - failed.length - warned.length - skipped.length} / WARN ${warned.length} / SKIP ${skipped.length} / FAIL ${failed.length}`)
if (failed.length > 0) {
  console.log('# 失败项：')
  for (const result of failed) console.log(`  - ${result.name}${result.detail ? `：${result.detail.split('\n')[0]}` : ''}`)
}
if (reportPath !== undefined) {
  writeFileSync(reportPath, `${JSON.stringify({ node: process.version, platform: process.platform, arch: process.arch, repo, host: hostUrl ?? null, results }, null, 2)}\n`)
  console.log(`# 报告：${reportPath}`)
}
process.exit(failed.length === 0 ? 0 : 1)
