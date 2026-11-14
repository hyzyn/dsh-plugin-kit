// 可信发布（npm OIDC trusted publishing）配置的**纯逻辑**：被 `scripts/setup-trusted-publishing.mjs`
// 与 `scripts/test/trusted-publishing.test.ts` 共用。
//
// 为什么值得单独抽出来测：这里的判据全是「读 registry 的一个字符串再决定要不要动」——
// 判错的两个方向都很贵：
//   · 把「没有配置」误判成「读不到」→ 14 个包全部跳过，报告却是正常；
//   · 把「已有别的配置」误判成「没配置」→ 去发一次创建请求，registry 同一包只允许一条
//     配置，直接报错；更糟的是有人照着报错去 revoke，把本来配好的删了。
// 而这两个分支在真实环境里都**没法本地复现**（要拿真账号去动真 registry），所以只能靠用例钉住。

/** `npm trust` 命令要求的最小 npm 版本（低于它命令根本不存在）。 */
export const MIN_NPM = [11, 15, 0]

/** 本仓发布 workflow 的文件名：必须是 `.github/workflows/` 下真实存在的那一个。 */
export const WORKFLOW_FILE = 'release.yml'

/** GitHub 仓库（owner/repo）。与各包 package.json 的 repository.url 一致。 */
export const REPO = 'hyzyn/dsh-plugin-kit'

/** 比较点分版本：`isAtLeast('11.19.1', [11,15,0])` → true。忽略 `-rc.1` 这类预发布后缀。 */
export function isAtLeast(version, minimum) {
  const parse = (value) => {
    const [core] = String(value ?? '').trim().split('-')
    const parts = core.split('.').map((n) => Number.parseInt(n, 10))
    if (parts.some((n) => Number.isNaN(n))) return null
    return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0]
  }
  const got = parse(version)
  if (!got) return false
  for (let i = 0; i < minimum.length; i++) {
    if (got[i] > minimum[i]) return true
    if (got[i] < minimum[i]) return false
  }
  return true
}

/**
 * 解析 `npm trust list <pkg> --json` 的 stdout。
 *
 * 返回三态，**不能合并**：
 *   · `[]`          —— 明确没有配置；
 *   · `null`        —— 读不到 / 解析不了（既不能认定「没配」，也不能认定「配得对」）；
 *   · `[config...]` —— 已有配置。
 *
 * ⚠️ 「没有配置」在 `--json` 下**一个字都不打印**：`displayResponseBody` 的空分支走
 * `dialogue`，而 `dialogue` 在 json 模式下被抑制（npm@11 `lib/trust-cmd.js`）。
 * 所以**空 stdout = 没有配置**。把空串当「读不到」是本脚本最贵的一种错法：14 个包会
 * 全部跳过，而报告看上去一切正常——正是「漏配不报错」那个坑的镜像。
 */
export function parseTrustList(raw) {
  if (typeof raw !== 'string') return null
  const text = raw.trim()
  if (text === '') return []
  try {
    const parsed = JSON.parse(text)
    if (Array.isArray(parsed)) return parsed
    // registry 目前只支持一条配置，可能不包数组。
    // 空对象 `{}` 按「没有配置」处理：服务端用它在「查到了但没配置」时占位。
    if (parsed && typeof parsed === 'object') {
      return Object.keys(parsed).length > 0 ? [parsed] : []
    }
    return null
  } catch {
    return null
  }
}

/**
 * 一条现有配置是否已经就是这个 workflow（owner/repo 与文件名都要对齐）。
 *
 * 字段名来自 npm 的 `TrustGitHub.bodyToOptions`：`file` / `repository`（/ `environment`）。
 * 这里**同时兼容**几种历史写法，是因为 registry 侧字段名改过、而漏判的代价是「重复创建报错」。
 */
export function matchesWorkflow(config, { repo = REPO, file = WORKFLOW_FILE } = {}) {
  if (!config || typeof config !== 'object') return false
  const configRepo = config.repository ?? config.repo ?? config.claims?.repository
  const configFile = config.file ?? config.workflow ?? config.workflowFile ?? config.claims?.workflow_ref?.file
  if (!configRepo || !configFile) return false
  // workflow_ref 是 `owner/repo/.github/workflows/x.yml@refs/tags/v1` 形态：截掉 `@ref` 再比文件名
  const bareFile = String(configFile).split('@')[0]
  // 仓库统一成 `owner/repo`（claims.repository 可能带 `.git` 后缀或大小写差异）
  const normalizeRepo = (value) =>
    String(value)
      .toLowerCase()
      .replace(/^git\+/, '')
      .replace(/^https?:\/\/github\.com\//, '')
      .replace(/\.git$/, '')
      .replace(/^ssh:\/\/git@github\.com\//, '')
  return (
    normalizeRepo(configRepo) === normalizeRepo(repo) &&
    bareFile.toLowerCase().endsWith(String(file).toLowerCase())
  )
}

/** 该配置是否授予了「直接 npm publish」。`permissions` 缺省视为允许（老配置的语义）。 */
export function allowsPublish(config) {
  if (!config || typeof config !== 'object') return false
  const permissions = config.permissions
  if (!Array.isArray(permissions) || permissions.length === 0) return true
  return permissions.includes('createPackage')
}

/**
 * 汇总一个包的处置结论。纯函数，返回 `{ action, reason }`：
 *   `'skip'`（已经配好）/ `'create'`（没有配置）/ `'blocked'`（读不到或已有别的配置）/ `'fail'`。
 * 
 * `blocked` 与 `fail` 分开：前者是「脚本不该替你决定」，后者是「试了但没成」。
 */
export function decideAction(existing) {
  if (existing === null) return { action: 'blocked', reason: '读不到现有配置' }
  if (existing.length === 0) return { action: 'create', reason: '没有配置' }
  const mine = existing.filter((config) => matchesWorkflow(config))
  if (mine.length === 0) return { action: 'blocked', reason: '已存在别的可信发布配置' }
  if (!mine.some((config) => allowsPublish(config))) return { action: 'blocked', reason: '缺 publish 权限' }
  return { action: 'skip', reason: '已配置为本 workflow' }
}
