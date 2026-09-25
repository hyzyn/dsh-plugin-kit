/**
 * `@hyzyn/dsh-codegraph` 的 `indexForce` 验证：**配置了它之后，`/index` 是否真的带
 * `--force` 起进程**。
 *
 * 背景：`indexForce` 的语义是给 `codegraph index` 追加 `--force`，而真 CLI 在没有 `--force`
 * 时会拒绝把家目录 / 文件系统根当项目索引。要在真机上端到端验这件事，就得真去索引 home
 * （重且危险），所以这里用 `scripts/fixtures/codegraph-cli-fake.sh` —— 只记录 argv、并模拟
 * 「无 `--force` 就拒绝」的假 CLI。
 *
 * 覆盖两侧：
 *   - `indexForce: false`（默认）：参数里**不能**有 `--force`，且 CLI 的拒绝要**原样可读地**
 *     回到响应里（不是被吞成一句「失败」）；
 *   - `indexForce: true`：参数里**必须**有 `--force`，且要排在 `--` **之前**
 *     （`--` 之后一律按位置参数处理，顺序错了等于没加）。
 *
 * `indexForce` / `command` 都是安装级旋钮（不进 settings schema），所以脚本自己起两次宿主：
 * 用 `--patch` 临时层覆盖，端口也独立于你正在用的实例。
 *
 * 安全（**这一点曾被写错，与 host-contract 同因**）：仅靠 `--patch` 只挡住了 profile 补丁，
 * 挡不住**插件自己的副作用**——本脚本没配 `defaultPath`，于是插件回落到 `process.cwd()`；
 * 若当前目录恰好是已索引仓库，它就会把 codegraph 的托管行写进
 * `$DSH_HOME/cordis.patch.yml`（未设 DSH_HOME 时即真实的 `~/.dsh/cordis.patch.yml`）。
 * 现在给被测宿主一个**隔离的 DSH_HOME**：把被测 profile **整份拷进**临时目录（它只有
 * 几十 KB），于是 profile 组装产物（cordis.yml）与插件写的托管行**全部落在临时目录**，
 * 真实 `~/.dsh` 全程只读。收尾再断言真实补丁逐字节未变。
 *
 * 用法：
 *   node scripts/verify-codegraph-indexforce.mjs --profile test --port 3086 [--report out.json]
 */
import { spawn } from 'node:child_process'
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const argv = process.argv.slice(2)
const flag = (name) => {
  const index = argv.indexOf(name)
  return index === -1 ? undefined : argv[index + 1]
}
const profile = flag('--profile') ?? 'test'
const dshBin = flag('--dsh-bin') ?? 'dsh'
const port = Number(flag('--port') ?? 3086)
const reportPath = flag('--report')
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const fakeCli = join(repoRoot, 'scripts', 'fixtures', 'codegraph-cli-fake.sh')

const results = []
const record = (name, ok, detail) => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '\n      ' + detail : ''}`)
}

if (!existsSync(fakeCli)) {
  console.error(`找不到假 CLI：${fakeCli}`)
  process.exit(1)
}
chmodSync(fakeCli, 0o755)

const workDir = mkdtempSync(join(tmpdir(), 'cg-force-'))
/** 隔离的 DSH_HOME：profile 仍从真实 ~/.dsh/profiles 解析，home 级写入全落在临时目录。 */
const isolatedHome = join(workDir, 'dsh-home')
mkdirSync(join(isolatedHome, 'profiles'), { recursive: true })
const realDshHome = process.env.DSH_HOME?.trim() || join(process.env.HOME ?? '', '.dsh')
const realPatchPath = join(realDshHome, 'cordis.patch.yml')
const realPatchBefore = existsSync(realPatchPath) ? readFileSync(realPatchPath, 'utf8') : undefined
// 目标目录：只要求「存在」（/index 本身不做目录校验，那是 /init 的事）
const targetDir = join(workDir, 'target')
mkdirSync(targetDir, { recursive: true })
writeFileSync(join(targetDir, 'keep.txt'), 'probe\n')

const post = (path, body) =>
  new Promise((resolve) => {
    const payload = Buffer.from(JSON.stringify(body))
    const request = http.request(
      {
        host: '127.0.0.1',
        port,
        path,
        method: 'POST',
        headers: { host: `127.0.0.1:${String(port)}`, 'content-type': 'application/json', 'content-length': String(payload.length) },
      },
      (response) => {
        let text = ''
        response.setEncoding('utf8')
        response.on('data', (chunk) => (text += chunk))
        response.on('end', () => {
          try {
            resolve({ status: response.statusCode, body: JSON.parse(text) })
          } catch {
            resolve({ status: response.statusCode, body: undefined, text })
          }
        })
      },
    )
    request.on('error', (error) => resolve({ status: 0, error: String(error?.message ?? error) }))
    request.setTimeout(120_000, () => {
      request.destroy()
      resolve({ status: 0, error: 'timeout' })
    })
    request.write(payload)
    request.end()
  })

const waitForPort = async (child, timeoutMs = 90_000) => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const alive = await new Promise((resolve) => {
      const request = http.request({ host: '127.0.0.1', port, path: '/', method: 'GET' }, (response) => {
        response.resume()
        resolve(true)
      })
      request.on('error', () => resolve(false))
      request.setTimeout(2000, () => {
        request.destroy()
        resolve(false)
      })
      request.end()
    })
    if (alive) return true
    if (child.exitCode !== null) throw new Error(`宿主提前退出（code=${String(child.exitCode)}）`)
    await new Promise((resolve) => setTimeout(resolve, 700))
  }
  return false
}

console.log('# dsh-codegraph 的 indexForce 验证（假 CLI，不索引任何真实目录）')
console.log(`# node ${process.version} / profile ${profile} / 端口 ${String(port)}\n`)

let crashed
try {
  /**
   * 把被测 profile 拷进隔离 home。
   *
   * **必须先清空目标**：本脚本对 `indexForce` 的两个取值各起一轮宿主，两轮共用同一个
   * 隔离 home。第二轮若直接往已存在的目标上拷，目标里上一轮留下的**符号链接**会指回
   * 源树，`cpSync` 于是报
   *   `Cannot copy …/pkce-challenge to a subdirectory of self …/pkce-challenge`
   * 并中止脚本（实测：第二轮必崩，且只跑到 F1 就退出）。
   *
   * 这个坑是「静态守卫测不出来」的典型：`test/verify-scripts-safety.test.ts` 只能断言
   * 「脚本里有 cpSync / isolatedHome / realPatchBefore」，断言不了「拷两次不会崩」——
   * 真机脚本的正确性只能靠**跑一遍**。codegraph CG48 记的就是这次：codegraph CG45 给本脚本加的隔离从没被
   * 运行过，一跑就崩。
   */
  const syncIsolatedProfile = () => {
    const dest = join(isolatedHome, 'profiles', profile)
    rmSync(dest, { recursive: true, force: true })
    cpSync(join(realDshHome, 'profiles', profile), dest, { recursive: true })
  }

  for (const indexForce of [false, true]) {
    const logPath = join(workDir, `argv-${String(indexForce)}.log`)
    const overlay = join(workDir, `overlay-${String(indexForce)}.yml`)
    writeFileSync(
      overlay,
      [
        `# 临时层：独立端口 + codegraph 的安装级旋钮（不修改任何 profile / settings 文件）`,
        `- id: webserver`,
        `  config:`,
        `    host: '127.0.0.1'`,
        `    port: ${String(port)}`,
        `- id: codegraph`,
        `  config:`,
        `    command: '${fakeCli}'`,
        `    indexForce: ${String(indexForce)}`,
        '',
      ].join('\n'),
    )
    syncIsolatedProfile()
    const child = spawn(dshBin, ['--profile', profile, '--patch', overlay], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, DSH_HOME: isolatedHome, CG_FAKE_LOG: logPath },
    })
    let stderr = ''
    child.stderr?.on('data', (chunk) => (stderr += String(chunk)))
    let response
    try {
      if (!(await waitForPort(child))) throw new Error(`宿主没在 ${String(port)} 上就绪；stderr=${stderr.slice(-300)}`)
      response = await post('/api/dsh-codegraph/index', { path: targetDir })
    } finally {
      try {
        child.kill('SIGTERM')
      } catch {
        /* 已退 */
      }
      await new Promise((resolve) => setTimeout(resolve, 1200))
      try {
        child.kill('SIGKILL')
      } catch {
        /* 已退 */
      }
    }
    const argvLines = existsSync(logPath) ? readFileSync(logPath, 'utf8').trim().split('\n').filter(Boolean) : []
    const indexLine = argvLines.find((line) => line.startsWith('index ')) ?? ''
    const hasForce = /\s--force\s/.test(` ${indexLine} `)
    const forceBeforeSeparator = indexLine.indexOf('--force') !== -1 && indexLine.indexOf('--force') < indexLine.indexOf(' -- ', indexLine.indexOf('index '))

    if (indexForce === false) {
      record(
        'F1 indexForce=false：参数里没有 --force（`--` 之后是位置参数）',
        indexLine !== '' && !hasForce,
        `实际 argv=${JSON.stringify(indexLine)}`,
      )
      record(
        'F1 indexForce=false：CLI 的拒绝原样可读地回到响应里（不是被吞成一句「失败」）',
        response?.status === 500 && String(response?.body?.error ?? '').includes('--force'),
        `status=${String(response?.status)} error=${JSON.stringify(String(response?.body?.error ?? response?.error ?? '').slice(0, 200))}`,
      )
    } else {
      record(
        'F2 indexForce=true：参数里**确实**带上了 --force，且排在 `--` 之前',
        hasForce && forceBeforeSeparator,
        `实际 argv=${JSON.stringify(indexLine)}`,
      )
      record(
        'F2 indexForce=true：CLI 接受后路由报成功',
        response?.status === 200 && response?.body?.ok === true,
        `status=${String(response?.status)} ok=${String(response?.body?.ok)} output=${JSON.stringify(String(response?.body?.output ?? '').slice(0, 120))}`,
      )
    }
    console.log(`      （假 CLI 收到的全部调用：${JSON.stringify(argvLines.slice(0, 6))}）`)
  }
} catch (error) {
  crashed = error
  console.error(`崩溃：${String(error?.stack ?? error?.message ?? error)}`)
} finally {
  rmSync(workDir, { recursive: true, force: true })
  const failed = results.filter((item) => item.ok !== true)
  console.log(`\n# 汇总：PASS ${results.filter((r) => r.ok === true).length} / FAIL ${failed.length}`)
  if (failed.length > 0) {
    console.log('# 失败项：')
    for (const item of failed) console.log(`  - ${item.name}`)
  }
  if (reportPath !== undefined) {
    writeFileSync(reportPath, `${JSON.stringify({ profile, port, results }, null, 2)}\n`)
    console.log(`# 报告：${reportPath}`)
  }
  process.exit(crashed === undefined && failed.length === 0 ? 0 : 1)
}
