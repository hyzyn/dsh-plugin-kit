/**
 * 中文 Windows 真机验证：控制台代码页（CP936）下的 CLI 报错解码。
 *
 * 为什么必须是**真机**、且必须是**中文区域**的机器：CI 的 windows-latest 是 en-US，
 * 控制台代码页是 CP1252，走不到 cp936 这条分支——报告里那个 `���` 正是从这条缝里漏出去的。
 * 本脚本把「探测代码页 → 让 cmd.exe 自己吐一段中文报错 → 按插件的方式解码」串成一条链，
 * 并对照 UTF-8 硬解的旧行为，输出 PASS / FAIL。
 *
 * 用法（在 Windows 仓库根目录，先 `pnpm -r build`）：
 *
 *   node scripts/windows/verify-codegraph-cp936.mjs
 *   node scripts/windows/verify-codegraph-cp936.mjs --repo C:\path\to\dsh-plugin-kit
 *
 * 退出码：0 = 全部 PASS（允许 WARN），1 = 有 FAIL。
 */
import { execFileSync, spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const args = process.argv.slice(2)
const repoFlag = args.indexOf('--repo')
const repo = resolve(repoFlag === -1 ? process.cwd() : args[repoFlag + 1])
// 报告路径：真机验证常常是「宿主在另一台机器上读输出」，而宿主终端很可能用另一套编码
// （实测 Parallels 的 prlctl exec 会把 CP936 的中文按 UTF-8 解回宿主）。写一份 UTF-8 的
// JSON 报告到双方都能读的位置，结论就不依赖终端编码了。
const reportFlag = args.indexOf('--report')
const reportPath = reportFlag === -1 ? undefined : args[reportFlag + 1]

const results = []
const record = (name, ok, detail) => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '\n      ' + detail : ''}`)
}
const warn = (name, detail) => {
  results.push({ name, ok: true, detail, warned: true })
  console.log(`WARN  ${name}\n      ${detail}`)
}

console.log(`# 中文 Windows 真机验证（codegraph CLI 解码）`)
console.log(`# node ${process.version} / ${process.platform} / repo ${repo}\n`)

if (process.platform !== 'win32') {
  console.log('FAIL  本脚本只在 Windows 上有意义（非 Windows 没有控制台代码页问题）')
  process.exit(1)
}

/* ---- 1. 宿主的控制台代码页 ---- */
let codePage = '(未知)'
let chcpRaw = ''
try {
  chcpRaw = execFileSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'chcp'], { encoding: 'latin1' })
  const matched = /(\d{3,5})/.exec(chcpRaw)
  if (matched) codePage = matched[1]
} catch (error) {
  chcpRaw = String(error?.message ?? error)
}
console.log(`# chcp → ${codePage}（原始输出：${chcpRaw.trim()}）`)
if (codePage === '65001') {
  warn('控制台代码页', '当前是 65001（UTF-8）：这条分支在本机走的是 UTF-8 主路径，CP936 分支需要中文区域的控制台（chcp 936）')
} else if (codePage === '936') {
  record('控制台代码页是 CP936（报告的环境）', true, `chcp = ${codePage}`)
} else {
  warn('控制台代码页', `本机是 ${codePage}，不是报告里的 936；下面的解码断言仍会跑，但覆盖的是本机代码页`)
}

/* ---- 2. kit 的代码页探测 ---- */
// 直接 import decode.js 而不是包入口：入口会经 js-expr.js 拉进 `js-yaml` 这个裸模块说明符，
// 于是必须整仓库 node_modules 才能跑。decode.js 只依赖 node 内置模块，单文件即可验证，
// 真机上也就不必先把整个 monorepo 搬过去。
const decodeUrl = pathToFileURL(join(repo, 'packages', 'kit', 'lib', 'decode.js')).href
const { consoleEncoding, createOutputDecoder } = await import(decodeUrl)

const detected = consoleEncoding()
record(
  'consoleEncoding() 把控制台代码页映射成可用编码',
  typeof detected === 'string' && detected !== '',
  `consoleEncoding() = ${detected}${codePage === '936' ? '（期望 gbk）' : ''}`,
)
if (codePage === '936') {
  record('CP936 被识别为 gbk（Node 自带 full-icu）', detected === 'gbk', `得到 ${detected}，期望 gbk`)
}

/* ---- 3. cmd.exe 自己吐的中文报错（报告 D2 的原始现场） ---- */
const sandbox = mkdtempSync(join(tmpdir(), 'cg-cp936-'))
const shim = join(sandbox, 'definitely-not-a-real-command.cmd')
writeFileSync(shim, '@echo off\r\nthis-command-does-not-exist-9f3a\r\n')

/** 经 cmd.exe 跑一个命令，按 Buffer 收 stderr（模拟插件的收流方式）。 */
function runCollectingStderr(command, cliArgs) {
  return new Promise((resolve) => {
    // 命令名单独加引号：临时目录路径可能带空格，而 /s 会剥掉最外层那对引号。
    const cmdline = `"${command}"${cliArgs.length > 0 ? ' ' + cliArgs.join(' ') : ''}`
    const child = spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `"${cmdline}"`], {
      windowsVerbatimArguments: true,
      windowsHide: true,
    })
    const stderrChunks = []
    child.stderr?.on('data', (chunk) => stderrChunks.push(chunk))
    child.on('error', (error) => resolve({ stderr: Buffer.alloc(0), code: null, error }))
    child.on('close', (code) => resolve({ stderr: Buffer.concat(stderrChunks), code }))
  })
}

const run = await runCollectingStderr(shim, [])
const legacy = run.stderr.toString() // 旧行为：Buffer#toString() = UTF-8
const unitDecoder = createOutputDecoder()
const fixed = unitDecoder.decode(run.stderr) + unitDecoder.flush()

const hasReplacement = legacy.includes('\uFFFD')
const fixedReadable = /[\u4e00-\u9fff]/.test(fixed) && !fixed.includes('\uFFFD')

if (codePage === '936') {
  record(
    '旧行为（Buffer#toString，UTF-8）确实解成乱码 —— 报告现象的对照组',
    hasReplacement,
    `legacy = ${JSON.stringify(legacy.slice(0, 80))}`,
  )
} else {
  warn(
    '旧行为对照组',
    `本机控制台代码页是 ${codePage}，cmd.exe 的报错是 ASCII，UTF-8 解不出乱码——对照组需要中文区域控制台`,
  )
}
record(
  '新解码器解出可读中文，且没有替换字符',
  fixedReadable,
  `decoded = ${JSON.stringify(fixed.trim().slice(0, 120))}`,
)

/* ---- 4. 分块喂养：块边界切在多字节字符中间 ---- */
const chunks = []
const decoder = createOutputDecoder()
for (let offset = 0; offset < run.stderr.length; offset += 1) chunks.push(decoder.decode(run.stderr.subarray(offset, offset + 1)))
chunks.push(decoder.flush())
record('按 1 字节切块喂入，结果与整段一致（块边界不误判编码）', chunks.join('') === fixed, `chunked = ${JSON.stringify(chunks.join('').trim().slice(0, 80))}`)

/* ---- 5. ENOENT 与「命令存在但非零退出」可区分 ---- */
const failingShim = join(sandbox, 'exits-nonzero.cmd')
writeFileSync(failingShim, '@echo off\r\necho boom-cp936-test 1>&2\r\nexit /b 3\r\n')
const failing = await runCollectingStderr(failingShim, [])
const failingUnit = createOutputDecoder()
const failingText = failingUnit.decode(failing.stderr) + failingUnit.flush()
record(
  '非零退出的 stderr 也按同一规则解码',
  failingText.includes('boom-cp936-test') && failing.code === 3,
  `exit=${failing.code} stderr=${JSON.stringify(failingText.trim())}`,
)

/* ---- 6. stdio MCP 启动方式（裸 spawn 拉 .cmd 会 EINVAL） ---- *
 * 只修「本仓库自己 spawn」的那条路径；真正的工具加载走 DSH 核心的
 * `@deepseek-ai/dsh-mcp-client`（官方 SDK + cross-spawn），Windows 上不受影响。
 *
 * 注意断言方向：这里的期望是**失败**——裸 spawn 拉 `.cmd` 本来就该报错，这是被修掉的
 * 缺陷本身。Node 对 `.cmd` 的加固可能在 spawn 调用处**同步抛出**，所以 try/catch 与
 * error 事件两条路都要算「符合预期」。
 */
const rawSpawnFailure = await new Promise((resolve) => {
  let child
  try {
    child = spawn(failingShim, [], { stdio: ['pipe', 'pipe', 'pipe'] })
  } catch (error) {
    // 同步抛（本机就是这个形态）：`spawn … EINVAL`
    return resolve(String(error?.code ?? error?.message))
  }
  child.on('error', (error) => resolve(String(error?.code ?? error?.message)))
  child.on('exit', () => resolve(undefined))
  setTimeout(() => {
    try {
      child.kill()
    } catch {
      /* 已退出 */
    }
  }, 400)
})
record(
  '对照：裸 spawn 一个 .cmd 必然失败（本仓库 mcp 连接测试原先的做法）',
  rawSpawnFailure !== undefined,
  rawSpawnFailure !== undefined
    ? `裸 spawn → ${rawSpawnFailure}（符合预期：这正是 @hyzyn/dsh-mcp 的「连接测试」在 Windows 上永久报错的原因，现已改走 kit 的 spawnPortable）`
    : '居然成功了：缺陷前提不成立，请复核 Node 版本',
)

/* ---- 汇总 ---- */
const failed = results.filter((entry) => !entry.ok)
console.log(`\n# 汇总：${results.length - failed.length}/${results.length} PASS`)

if (reportPath !== undefined) {
  try {
    writeFileSync(
      reportPath,
      JSON.stringify(
        {
          node: process.version,
          platform: process.platform,
          arch: process.arch,
          codePage,
          chcpRaw: chcpRaw.trim(),
          consoleEncoding: detected,
          legacySample: legacy.slice(0, 200),
          decodedSample: fixed.slice(0, 200),
          results,
          failed: failed.map((entry) => entry.name),
        },
        null,
        2,
      ),
      'utf8',
    )
    console.log(`# 报告已写出（UTF-8）：${reportPath}`)
  } catch (error) {
    console.log(`# 报告写出失败：${String(error?.message ?? error)}`)
  }
}

if (failed.length > 0) {
  console.log(`# FAIL 项：${failed.map((entry) => entry.name).join('；')}`)
  process.exit(1)
}
console.log('# 全部通过（WARN 不计入失败）')
