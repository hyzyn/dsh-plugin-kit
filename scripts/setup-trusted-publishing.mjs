// 一次性运维脚本：给全部可发布包注册 npm 可信发布（OIDC trusted publishing）。
// 用法：node scripts/setup-trusted-publishing.mjs [--dry-run] [--only=<dir|pkg>,...]
//
// 为什么要有这个脚本：npm 只支持**按包**配置可信发布（没有 org 级开关），本仓 14 个可发布包
// 意味着 14 次一模一样的调用。手工抄一遍的代价不是打字，而是**漏一个包不会报错**——那个包
// 会静默退回 NPM_TOKEN 那条路照常发布（npm 的 OIDC 交换失败只打 verbose 日志，`oidc()` 在
// 任何失败分支都 `return undefined`，见 npm@11 的 lib/utils/oidc.js），于是「配好了」与
// 「漏了一个」在 CI 输出里长得一模一样。所以这里必须**逐个核验**，而不是发完就算。
//
// 包清单读 `scripts/publish-targets.mjs`（与两条发布路径共用同一份真相源，不在这里重抄）。
// 判定逻辑在 `scripts/trusted-publishing.mjs`（纯函数，用例钉住三种出口）。
//
// 前置条件（缺一条就直接中止，不猜）：
//   1. `npm@>= 11.15.0`：`npm trust` 命令的下限；
//   2. 已 `npm login`（账号级 2FA 打开；**不支持** 2FA-bypass 的 granular token，
//      所以必须是交互登录，不能拿 CI 那个 token 来配）；
//   3. 包必须已存在于 registry（14 个都满足）。
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { targets } from './publish-targets.mjs'
import {
  MIN_NPM,
  REPO,
  WORKFLOW_FILE,
  decideAction,
  isAtLeast,
  allowsPublish,
  matchesWorkflow,
  parseTrustList,
} from './trusted-publishing.mjs'

const argv = process.argv.slice(2)
const dryRun = argv.includes('--dry-run')
const onlyArg = argv.find((arg) => arg.startsWith('--only='))
const only = onlyArg ? onlyArg.slice('--only='.length).split(',').map((s) => s.trim()).filter(Boolean) : null

const selected = targets.filter(([dir, name]) => !only || only.includes(dir) || only.includes(name))

function fail(message) {
  console.error(`✘ ${message}`)
  process.exit(1)
}

/**
 * 跑一次 npm。
 *
 * `captureStderr` 用于**需要按报错内容分类**的调用（trust list）：403 的原因只写在 stderr 的
 * `npm-notice` 里，inherit 就抓不到了。
 *
 * ⚠️ stdin 必须是 `inherit`：`npm trust` 在「非 bypass-2FA 的 token」上会弹 OTP 提示
 * （`lib/utils/auth.js` 的 `otplease` 先看 `process.stdin.isTTY`，不是 TTY 就直接把 EOTP 抛出来）。
 * 这里给 `ignore` 会让交互式 2FA 这条路彻底走不通，而它正是 403 的修法之一。
 */
function npm(args, { captureStderr = false } = {}) {
  return execFileSync('npm', args, {
    encoding: 'utf8',
    stdio: ['inherit', 'pipe', captureStderr ? 'pipe' : 'inherit'],
  })
}

function npmVersion() {
  try {
    return npm(['--version']).trim()
  } catch {
    fail('读不到 npm 版本：确认 npm 在 PATH 上')
  }
}

/** 当前登录身份；未登录/令牌失效时 npm 以非零退出。 */
function whoami() {
  try {
    return npm(['whoami']).trim()
  } catch {
    return null
  }
}

/**
 * 取当前生效的 registry 凭据。
 *
 * ⚠️ **不能用 `npm config get //registry.npmjs.org/:_authToken`**：实测 npm 11.19.1 对它
 * 返回空串（token 类键在 config 输出里被脱敏了）。所以直接读 userconfig 文件。
 * 读不到就返回 null，让分类退回 CLI 错误文本（不猜）。
 */
function registryToken() {
  let userconfig
  try {
    userconfig = npm(['config', 'get', 'userconfig'], { captureStderr: true }).trim()
  } catch {
    return null
  }
  if (!userconfig) return null
  try {
    const text = readFileSync(userconfig, 'utf8')
    const match = text.match(/^\/\/registry\.npmjs\.org\/:_authToken=(.+)$/m)
    return match ? match[1].trim().replace(/^["']|["']$/g, '') : null
  } catch {
    return null
  }
}

/**
 * 直接问一次 registry 的 trust 端点，拿**响应体**做分类。
 *
 * 为什么要自己发这一枪：npm CLI 的 stderr 只有 `403 Forbidden - GET ...` 和一句泛化解释，
 * 不含响应体；而「Please enable 2fa for your account」这句恰恰只出现在 body 里，
 * 它和「权限不足」是**两种完全不同的修法**，靠 CLI 的错误文本分不出来。
 */
async function probeTrustBody(packageName) {
  const token = registryToken()
  if (!token) return null
  const url = `https://registry.npmjs.org/-/package/${encodeURIComponent(packageName)}/trust`
  try {
    const response = await fetch(url, { headers: { authorization: `Bearer ${token}` } })
    const body = await response.text()
    return { status: response.status, body }
  } catch {
    return null
  }
}

/** 把 probe 结果映射成分类；拿不到 body 时退回 null（交给 CLI 错误文本兜底）。 */
function classifyTrustProbe(probe) {
  if (!probe) return null
  if (probe.status === 200) return 'ok'
  if (/Please enable 2fa for your account/i.test(probe.body)) return 'forbidden-2fa'
  if (probe.status === 403) return 'forbidden'
  if (probe.status === 404) return 'missing'
  return null
}

/**
 * 读一个包现有的可信发布配置；三态语义见 `parseTrustList`。
 *
 * 失败时保留 stderr 供分类兜底——但**主判据来自 probeTrustBody**：npm CLI 的 stderr 里
 * 没有响应体，`Please enable 2fa for your account` 这句只存在于 body 中，而它和
 * 「权限不足」是两种完全不同的修法。
 */
function listTrust(packageName) {
  try {
    return { configs: parseTrustList(npm(['trust', 'list', packageName, '--json'], { captureStderr: true })), error: null }
  } catch (error) {
    const text = `${String(error?.stderr ?? '')}\n${String(error?.stdout ?? '')}`
    if (/Please enable 2fa for your account/i.test(text)) {
      return { configs: null, error: 'forbidden-2fa' }
    }
    if (/\bE403\b|\b403\b/.test(text)) {
      return { configs: null, error: 'forbidden' }
    }
    return { configs: null, error: 'unknown' }
  }
}

const version = npmVersion()
if (!isAtLeast(version, MIN_NPM)) {
  fail(`npm ${version} 不支持 \`npm trust\`（需要 >= ${MIN_NPM.join('.')}）；先 npm install -g npm@^${MIN_NPM[0]}`)
}
console.log(`npm ${version} ✔（npm trust 可用）`)

const user = whoami()
if (!user) {
  fail('未登录 npm（或令牌已失效）。先 `npm login` 再来——npm trust 不接受 2FA-bypass 的 granular token')
}
console.log(`登录身份：${user} ✔`)

if (selected.length === 0) fail(`--only 没命中任何发布目标：${(only ?? []).join(', ')}`)
console.log(`目标 workflow：${REPO} → .github/workflows/${WORKFLOW_FILE}`)
console.log(`待处理 ${String(selected.length)} 个包${dryRun ? '（--dry-run：只报告，不写入）' : ''}\n`)

/**
 * 403 `Please enable 2fa for your account` 的**真实原因**（实测 2026-11-14，npm 11.19.1）：
 *
 * 不是 token 类型问题——我们验证过：换成 `bypass_2fa=False` 的正规 GAT（`npm token create
 * --scopes @hyzyn --packages-and-scopes-permission read-write` 铸的）之后，**报错一字不差**。
 * 同一个 token 打 `/-/package/<pkg>/collaborators` 返回 `{"hyzyn":"write"}` —— 权限是够的。
 *
 * 真正的线索在 `npm token create` 的日志里：OTP 是**发到邮箱**的
 * （`Please check your email for a one-time password (OTP)`），而 npm 只在账号
 * **没有配置真正的第二因子**（authenticator App / security key）时才发邮箱 OTP。
 * 也就是说 `npm profile get` 里那个 `two-factor auth: auth-and-writes` 只是模式标记，
 * 底下没有可用的验证器——registry 于是不认为这个账号「启用了 2FA」，trust 端点直接拒绝。
 *
 * 判据上还有一个坑：**不能**用 `npm-notice: ...bypass 2FA are being restricted...` 那行来分类，
 * 它在 200 成功响应里也出现（账号级全局横幅）。只认响应体那句 `Please enable 2fa`。
 */
function explainForbidden(reason) {
  if (reason === 'forbidden-2fa') {
    return [
      'registry 认为这个账号**没有真正启用 2FA**，而 trust（可信发布）配置强制要求它。',
      '',
      '证据链（实测 2026-11-14）：',
      '  · 换成正规 GAT（bypass_2fa=False）后报错一字不变 → 与 token 类型无关；',
      '  · 同一 token 读 collaborators 返回 write → 权限够，不是授权问题；',
      '  · 铸 token 时 OTP 是**发到邮箱**的 → 账号没配 authenticator / security key，',
      '    只有一个空的 auth-and-writes 标记。',
      '',
      '修法：去 npmjs.com 真正配好一个第二因子（authenticator App 或 security key），',
      '   https://www.npmjs.com/settings/hyzyn/profile → Two-Factor Authentication',
      '   配好后再跑本脚本，trust 会弹一次验证器 OTP，批准后 14 个包可连续跑完。',
      '',
      '不想配 2FA 的话，只能去网页逐个配置（网页用的是已登录会话，不走这条 API）：',
      '   npmjs.com → Packages → <包名> → Settings → Trusted publishing',
      '   GitHub Actions / User=hyzyn / Repository=dsh-plugin-kit / Workflow=release.yml',
      '   勾 Allow npm publish（要 OIDC 管 dist-tag 再勾 Allow npm dist-tag）。',
    ].join('\n')
  }
  if (reason === 'forbidden') {
    return [
      'registry 返回 403：当前凭据没有修改这个包可信发布配置的权限。',
      '常见原因：token 是只读 / 只覆盖了部分包 / 不是这个 scope 的维护者。',
    ].join('\n')
  }
  return '读不到该包的信任配置（网络或 registry 故障）。'
}

// 先探一个包：既然是同一套凭据，403 会在每个包上重复出现——探到就中止，别刷屏。
// dry-run 也探：凭据不通时，dry-run 报出来的「将配置 14 个包」是假的乐观。
//
// 分类优先用**响应体**（probeTrustBody）：npm CLI 的 stderr 里没有 body，
// 而「Please enable 2fa」和「权限不足」是两种完全不同的修法，靠 CLI 文本分不出来。
{
  const cliProbe = listTrust(selected[0][1])
  if (cliProbe.configs === null) {
    const bodyKind = classifyTrustProbe(await probeTrustBody(selected[0][1]))
    const kind = bodyKind ?? cliProbe.error
    if (kind === 'forbidden-2fa' || kind === 'forbidden') {
      console.error(`✘ 无法读取 @hyzyn 的可信发布配置（以 ${selected[0][1]} 试探）：\n`)
      console.error(explainForbidden(kind))
      console.error('\n（未修改任何包）')
      process.exit(1)
    }
  }
}

/** 本轮每个包的最终状态：create / skip / blocked / fail。 */
const outcome = new Map()
/** 详细的 403 说明只打一次（同一套凭据，重复输出只会把真正的问题淹掉）。 */
let explained403 = false

for (const [, name] of selected) {
  const probed = listTrust(name)
  const decision = decideAction(probed.configs)

  if (decision.action === 'skip') {
    console.log(`↷ ${name}：${decision.reason}，跳过`)
    outcome.set(name, 'skip')
    continue
  }

  if (decision.action === 'blocked') {
    // 读不到 → 既不能证明没配、也不能证明配得对，更不该盲目重配（同一包只允许一条配置，
    // 猜错就得先 revoke，可能把好配置删了）；已有别的配置 → 换代是人的决定，不是脚本的。
    //
    // ⚠️ 这里**不再**建议 `npm trust revoke`：revoke 同样要 trust 权限，403 时照着做只会再撞一次。
    const hint = probed.configs === null ? '（读不到，原因见下）' : `（如要更换：npm trust revoke --id <id> ${name}）`
    console.log(`! ${name}：${decision.reason}，跳过${hint}`)
    if (probed.configs === null) {
      console.log(`   ${explainForbidden(probed.error).split('\n')[0]}`)
      if (!explained403) {
        console.error('\n' + explainForbidden(probed.error) + '\n')
        explained403 = true
      }
    }
    outcome.set(name, 'blocked')
    continue
  }

  if (dryRun) {
    console.log(`+ ${name}：将配置`)
    outcome.set(name, 'create')
    continue
  }

  try {
    npm(['trust', 'github', name, '--file', WORKFLOW_FILE, '--repo', REPO, '--allow-publish', '--yes'])
    console.log(`✔ ${name}：已配置`)
    outcome.set(name, 'create')
  } catch {
    console.error(`✘ ${name}：配置失败`)
    outcome.set(name, 'fail')
  }
  // 官方建议：bulk 配置时避免限流
  execFileSync('sleep', ['2'])
}

const created = [...outcome].filter(([, v]) => v === 'create').map(([k]) => k)
const skippedOk = [...outcome].filter(([, v]) => v === 'skip').map(([k]) => k)
const blocked = [...outcome].filter(([, v]) => v === 'blocked').map(([k]) => k)
const failed = [...outcome].filter(([, v]) => v === 'fail').map(([k]) => k)

console.log('\n===== 汇总 =====')
if (created.length > 0) console.log(`✔ 本次配置 ${String(created.length)} 个：${created.join(', ')}`)
if (skippedOk.length > 0) console.log(`↷ 已就绪 ${String(skippedOk.length)} 个：${skippedOk.join(', ')}`)
if (blocked.length > 0) console.log(`! 未处理 ${String(blocked.length)} 个：${blocked.join(', ')}`)
if (failed.length > 0) console.error(`✘ 失败 ${String(failed.length)} 个：${failed.join(', ')}`)

if (dryRun) {
  console.log('\n（--dry-run 未写入任何配置）')
  process.exit(0)
}

// 「配了没配」不能只看命令退出码：同一条 registry 记录再读一遍才算证据。
console.log('\n===== 回读核验（信任配置只在 registry 上才算数）=====')
const notOk = []
for (const [, name] of selected) {
  const state = outcome.get(name)
  if (state === 'fail') {
    notOk.push(`${name}（配置失败）`)
    continue
  }
  if (state === 'blocked') {
    notOk.push(`${name}（未处理，见上）`)
    continue
  }
  const after = listTrust(name)
  if (after.configs === null) {
    notOk.push(`${name}（回读失败：${after.error}）`)
    continue
  }
  const decision = decideAction(after.configs)
  if (decision.action !== 'skip') {
    notOk.push(`${name}（回读：${decision.reason}）`)
    continue
  }
  if (!after.configs.some((config) => matchesWorkflow(config) && allowsPublish(config))) {
    notOk.push(`${name}（回读未见 publish 权限）`)
  }
}

if (notOk.length > 0) {
  console.error(`✘ ${String(notOk.length)} 个包的可信发布未就绪：`)
  for (const line of notOk) console.error(`   · ${line}`)
  console.error('\n   注意：漏配**不会**让发布失败——npm 的 OIDC 交换失败只打 verbose 日志并')
  console.error('   退回 NPM_TOKEN（npm@11 lib/utils/oidc.js 的 oidc() 在任何失败分支都 return undefined）。')
  console.error('   也就是说这类漏配只能在「发布日志里本该有 provenance 却没有」时被发现。')
  process.exit(1)
}

console.log(`✔ ${String(selected.length)} 个包的可信发布都已指向 ${REPO} / ${WORKFLOW_FILE}`)
console.log('\n下一步（可选，去掉 NPM_TOKEN 的前置条件）：在网页给每个包勾 「Allow npm dist-tag」，')
console.log('并把 runner 的 npm 升到 >= 12.2.0（npm dist-tag 才支持 OIDC）。详见 RELEASING.md。')
