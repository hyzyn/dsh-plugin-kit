/**
 * `devfront` 的**宿主半体**：把判定层与 CDP 驱动接成 agent 能用的工具（`docs/devdata-plan.md` §15.2）。
 *
 * ## 三层分工（本文件是第三层）
 *
 * | 层 | 文件 | 职责 |
 * |---|---|---|
 * | 判定 | `page.ts` / `console.ts` / `web-verify.ts` | 允不允许、算不算噪声、断言过没过（**纯函数，不连浏览器**） |
 * | 驱动 | `cdp-driver.ts` | 怎么在浏览器里做 |
 * | **宿主** | **本文件** | 注册工具、读配置、写审计、把拒绝转成 agent 能据以行动的话 |
 *
 * 前两层都能在没有宿主、没有浏览器的情况下被测；本层很薄，只做搬运与接线。
 *
 * ## 两条刻意的注册纪律（与 docker 的「默认只读」同口径）
 *
 * 1. **没启用 / 没配站点 → 一个工具都不注册**。未注册的工具 agent 根本看不到，于是它不会去试、
 *    也不会撞墙（§3.6.1 的实现要求：可见的工具才会被尝试）。
 * 2. **作用域是 fail-closed**：`WebTarget.scopeDirs` 为空 = 处处拒绝。这不是保守过头——
 *    前端验活会打到**共享的测试环境**上，而「一份空列表」与「没配过」在语义上无法区分，
 *    两者都不构成授权。所以这里**不替用户填默认目录**：那等于替他授权。
 *
 * ## 拒绝怎么报给 agent
 *
 * 判定层的拒绝（越界 / 异源 / 缺参数）带着 `hint`（恢复路径），这里把它拼进错误消息**抛出去**。
 * 不返回 `{ok:false}` 那种信封：DSH 的工具错误本身就是给模型看的一句话，抛错是最短的路径，
 * 而且不会出现「调用方忘了看 ok 字段」这种沉默失败。
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import z from '@deepseek-ai/schemastery'
import { definePlugin, hasSameOriginProof, isLoopbackRequestStrict, plainConfig, settingsEntryScope } from '@hyzyn/dsh-kit'
import type { SettingsEntryScope } from '@hyzyn/dsh-kit'
import { readJsonBody, writeJson, type ReqLike, type ResLike } from '@hyzyn/dsh-kit'

import { loadProjectSites, mergeSites } from './project-sites.js'
import { createJsonlAuditSink, createLoggerAuditSink, type AuditLoggerLike } from '@hyzyn/dsh-kit/audit'

import { CdpWebDriver, type CdpWebDriverOptions } from './cdp-driver.js'
import { invokeWebAction, type WebAction, type WebAuditEntry, type WebAuditSink, type WebTarget } from './page.js'

/** 一个站点的配置形状。 */
const TARGET_SCHEMA = z.object({
  id: z.string().required(),
  label: z.string().default(''),
  url: z.string().required(),
  scopeDirs: z.array(z.string()).default([]),
  allowedOrigins: z.array(z.string()).default([]),
  /** 视口 `"宽x高"`（如 `390x844`）；空串 = 浏览器默认。按站点配，理由见 `page.ts` 的 `WebTarget.viewport`。 */
  viewport: z.string().default(''),
  credentialRef: z.string().default(''),
})

/**
 * 插件配置的**类型**。
 *
 * 与下面的 `const Config`（schemastery schema）同名并存：一个是类型空间的形状，
 * 一个是值空间的校验器，DSH 两个都要（本仓既有写法，见 docker / tty）。
 */
export interface Config {
  enabled?: boolean
  announceToAgent?: boolean
  targets?: Array<{
    id?: string
    label?: string
    url?: string
    scopeDirs?: string[]
    allowedOrigins?: string[]
    /** 视口 `"390x844"`；不写 = 浏览器默认。 */
    viewport?: string
    credentialRef?: string
  }>
  /** 每次导航后等多久（毫秒），给首屏渲染留时间。 */
  settleMs?: number
  /** 关掉 Chrome 沙箱。**只在受限环境开**（见 kit 的 `ChromeLaunchOptions.noSandbox`）。 */
  noSandbox?: boolean
  chromePath?: string
  shotDir?: string
  /** 持久审计出口（JSON 行）；省略 / 空串 = 只进宿主日志（不持久）。 */
  auditFile?: string
  /** 站点声明随项目走的宿主开关（空 = 关闭，见 zod schema 上那段注释）。 */
  projectSitesFile?: string
}

/** 插件配置的 schema。 */
export const Config: z = z.object({
  enabled: z.boolean().default(true).volatile(),
  announceToAgent: z.boolean().default(true).volatile(),
  targets: z.array(TARGET_SCHEMA).default([]).volatile(),
  settleMs: z.natural().max(30_000).default(800).volatile(),
  noSandbox: z.boolean().default(false).volatile(),
  chromePath: z.string().default('').volatile(),
  shotDir: z.string().default('').volatile(),
  /**
   * 持久审计出口（JSON 行）。**不填 = 只有宿主日志**（不持久：日志会被轮转、也未必落盘）。
   *
   * 与 `devdata` / `devenv` 同一份实现（`@hyzyn/dsh-kit/audit`）：一条 JSON 行 / 调用，
   * **含被拒绝的尝试**；写不进去时本次调用不返回结果（fail-closed）。
   * `.default('')` 而不是省略：本仓踩过「schema 把没写伪造成写了空值」的坑（`devenv D06`），
   * 这里显式声明「空串 = 没配」。
   */
  auditFile: z.string().default('').volatile(),
  /*
   * **站点声明随项目走**的宿主开关（2026-10-03）。
   *
   * 空串 = 关闭（缺省）。给了相对路径（推荐 `web/sites.yaml`）才去读**每次调用 `cwd` 那个目录**里的
   * 站点声明，与 profile 里的 `targets` 取并集。
   *
   * **为什么这条开关必须存在**（与 `devdata` / `devenv` 的项目清单不对称）：那两包的项目清单声明的是
   * 「用哪种方式访问那个目标」，目标本身已在 profile 里声明过——清单**加不出**一个可达目标；而本站点
   * 清单**能凭空多出一个「工具可以在它上面动手」的站点**。默认关闭 = 只有维护者能在宿主侧授权它。
   */
  projectSitesFile: z.string().default('').volatile(),
})

/**
 * `tools` 服务的最小形状。
 *
 * 刻意自己声明而不是依赖宿主的类型：本包与宿主的耦合只有这一个方法，
 * 自己声明能让「本包用到宿主什么」一眼可见（与 docker / tty 的写法一致）。
 */
interface ToolsLike {
  register(definition: unknown): () => void
}

/** `systemPrompt` 服务的最小形状（只用到「插一段」）。 */
interface SystemPromptLike {
  section(entry: { name: string; order?: number; text: string }): () => void
}

/** 解析后的站点。 */
interface LiveTarget extends WebTarget {
  scopeDirs: string[]
}

/** 解析后的配置（导出是为了让 `configSnapshotFrom` 能出现在 `.d.ts` 里）。 */
export interface LiveConfig {
  enabled: boolean
  announceToAgent: boolean
  targets: LiveTarget[]
  settleMs: number
  noSandbox: boolean
  chromePath: string
  shotDir: string
  /** 持久审计出口；空串 = 只进宿主日志（不持久）。 */
  auditFile: string
  projectSitesFile: string
}

/**
 * 把原始配置解析成纯数据。
 *
 * 空 `scopeDirs` **保留为空**而不是补一个默认值：作用域的判据是「空 = 处处拒绝」，
 * 在这里替用户填上一个默认目录等于**替他授权**——那正是这套东西要防的事。
 */
/**
 * 解析站点视口 `"390x844"`（`x` / `X` / `×` 都收）。
 *
 * 为什么**不做默认值、也不「修一修就对」**：这是**验活的窗口尺寸**——猜出来的尺寸会让一次
 * 验活在一个没人选过的窗口里通过或失败，那比完全不设视口更坏。所以只接受
 * 「两到四位数 + 分隔符 + 两到四位数」，其余一律当作**没写**（= 浏览器默认）。
 * 个位数那一档（`5x5`）也拒：那不是窗口尺寸，是打错。
 */
export function parseViewport(value: unknown): { width: number; height: number } | undefined {
  if (typeof value !== 'string') return undefined
  const matched = /^\s*(\d{2,4})\s*[xX×]\s*(\d{2,4})\s*$/.exec(value)
  if (matched === null) return undefined
  const width = Number(matched[1])
  const height = Number(matched[2])
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) return undefined
  return { width, height }
}

export function normalizeConfig(section: Record<string, unknown>): LiveConfig {
  const raw = section as Config
  const targets: LiveTarget[] = []
  for (const entry of raw.targets ?? []) {
    if (typeof entry.id !== 'string' || entry.id.trim() === '') continue
    if (typeof entry.url !== 'string' || entry.url.trim() === '') continue
    const scopeDirs = Array.isArray(entry.scopeDirs)
      ? entry.scopeDirs.filter((dir) => typeof dir === 'string' && dir.trim() !== '')
      : []
    // 与 `scopeDirs` 同样**保留为空**：空 = 只能在声明源上动手。替用户补默认值 = 替他授权。
    const allowedOrigins = Array.isArray(entry.allowedOrigins)
      ? entry.allowedOrigins.filter((origin) => typeof origin === 'string' && origin.trim() !== '')
      : []
    // 视口同样**不替用户补默认值**：不写 = 浏览器默认，写坏了（`abc` / `390` / `0x0`）也**当没写**，
    // 而不是猜一个尺寸——猜出来的尺寸会让「验活」在一个没人选过的窗口里通过或失败。
    const viewport = parseViewport(entry.viewport)
    targets.push({
      id: entry.id,
      label: typeof entry.label === 'string' && entry.label !== '' ? entry.label : entry.id,
      url: entry.url,
      scopeDirs,
      allowedOrigins,
      ...(viewport === undefined ? {} : { viewport }),
      ...(typeof entry.credentialRef === 'string' && entry.credentialRef !== ''
        ? { credentialRef: entry.credentialRef }
        : {}),
    })
  }
  return {
    enabled: raw.enabled !== false,
    announceToAgent: raw.announceToAgent !== false,
    targets,
    settleMs: typeof raw.settleMs === 'number' ? raw.settleMs : 800,
    noSandbox: raw.noSandbox === true,
    chromePath: typeof raw.chromePath === 'string' ? raw.chromePath : '',
    shotDir: typeof raw.shotDir === 'string' ? raw.shotDir : '',
    auditFile: typeof raw.auditFile === 'string' ? raw.auditFile.trim() : '',
    projectSitesFile: typeof raw.projectSitesFile === 'string' ? raw.projectSitesFile.trim() : '',
  }
}

/**
 * 日志出口的一句话（**含被拒的尝试**——那才是「agent 试过什么」的证据）。
 *
 * 话术留在本包：它带站点的 `subject`（URL 或选择器），而 `/audit` 里那句通用文案不知道这些。
 * 路由（允许 → `info`、拒绝 → `warn`）由 `kit` 统一。
 */
export function webAuditText(entry: WebAuditEntry): string {
  const subject = entry.subject === undefined ? '' : ` ${entry.subject}`
  const code = entry.code === undefined ? '' : ` (${entry.code})`
  return `[dsh-devfront] ${entry.allowed ? '允许' : '拒绝'} ${entry.action}${subject} @${entry.targetId}${code}`
}

/**
 * 建审计出口：配了 `auditFile` 走**持久**出口，否则只进宿主日志。
 *
 * 2026-10-03 起改用 `@hyzyn/dsh-kit/audit`（与 `devdata` / `devenv` 同一份实现）：
 * 一条 JSON 行 / 调用、**含被拒绝的尝试**、写不进去 = 抛（fail-closed）。日志话术留在本包
 * （`webAuditText`），因为它带站点与 subject，是给人看的。
 *
 * 抽成导出函数是为了**可测**：宿主半体那一层在本包没有假宿主夹具，而这条判据（「配了就落盘、
 * 没配就进日志」）不该只靠真机验收。
 */
export function webAuditSink(options: { auditFile: string; logger: AuditLoggerLike }): WebAuditSink {
  if (options.auditFile === '') {
    return createLoggerAuditSink<WebAuditEntry>(options.logger, { tag: 'dsh-devfront', render: webAuditText })
  }
  return createJsonlAuditSink<WebAuditEntry>(options.auditFile)
}

/** 给 agent 的能力公告（只在 `announceToAgent` 打开时注入）。 */
export const DEVFONT_GUIDANCE = [
  '本机已安装 dsh-devfront 插件（前端效果验证）：面向「发布之后页面到底对不对」，',
  '不做定时任务、不做爬虫、不做批量操作。工具面六个动作：',
  '',
  '- `site_open`：打开目标声明过的站点（同源且落在声明路径前缀内；异源一律拒）；',
  '- `site_shot`：截图（返回真 PNG 路径，可直接看）；',
  '- `site_click` / `site_fill`：交互（**只按 CSS 选择器**，不做按坐标点击——那没有可复审的选择依据）；',
  '  这两个**动手**的动作在执行前会核**当前页面**的源：页面自己跳到别的源之后，读（`site_text` /',
  '  `site_shot`）仍放行——登录流程要靠它——但动手会被拒（`PAGE_ORIGIN_NOT_ALLOWED`）。',
  '  要在那个源上真正动手，必须把它写进该目标的 `allowedOrigins`（缺省为空 = 只能在声明源上动手）：',
  '  页面自己跳过去**不构成授权**。',
  '- `site_text`：取页面**可见文本**（`document.body.innerText`；断言里的「应包含某段文字」应当拿它比，',
  '  不要拿 HTML）。**它取不到**：图片里的字（真实站点常把标题/水印**烤进整屏背景图**，含伪元素上的',
  '  `background-image`）、canvas、SVG 文本、closed shadow DOM、iframe 内内容——',
  '  所以「应包含某段文字」**失败时先 `site_shot` 看一眼**，别直接当成断言不过；',
  '- `site_console`：收 console 消息并**三档分类**（本站错误 / 告警 / 已知噪声）。',
  '',
  '读 `site_console` 时注意：判成 error 的是**来自本站资源**的错误，那才是「页面坏了」的信号；',
  '异源与来源不明的都只在 warning 里——真实站点的 console 里常驻噪声，噪声淹掉信号等于没信号。',
  '页面自己的 `console.log` / `info` / `debug` 归在**噪声档**（留在报告里备查，但不计入告警）：',
  '把它们算成告警会让一个干净页面凭空报出「告警 N」。',
  '噪声还会**按规则**给出构成（`favicon-404 ×1` 这种）——被排除的东西必须可核对，',
  '否则规则一旦误伤真错误，它会静静地把它吞掉。注意噪声计数会因浏览器缓存而不稳定，',
  '别拿它当断言；能断的是「本站错误 0」。',
  '**哪些规则实际可能出现要说清**（2026-10-02 真机审计）：`favicon-404` / `page-log` /',
  '`resizeobserver-loop` 会出现；而 `extension-inject` / `third-party-blocked` **只在浏览器装了扩展时',
  '才有意义**——本工具起的是**全新 profile、不带任何扩展**，所以它们**实际不会命中**',
  '（留着是为将来支持复用带扩展的浏览器）。**别把「没看到它们」当成漏判。**',
  '未捕获的异常也会进这份列表（它不走 console API，但驱动单独订阅了）。',
].join('\n')

/** 列出正文时的上限：超出只给计数——一次刷屏会把信号重新埋掉，而这正是本工具要防的事。 */
const CONSOLE_LIST_MAX = 10

/** `site_text` 的截断上限。 */
export const SITE_TEXT_MAX = 4000

/**
 * 把驱动拿到的正文包成 `site_text` 的输出契约。
 *
 * 单独抽出来是为了让这份契约**有单测**：它是工具声明的一部分，而声明与实际不符时 DSH 会在
 * 运行时把整次调用判成 `invalid output`——那种失败在浏览器那侧看起来是「什么都没发生」。
 */
export function textOutput(raw: unknown): { text: string; truncated: boolean; length: number } {
  const text = typeof raw === 'string' ? raw : ''
  // 超长文本要截断**并说明**（静默截断会让人以为页面就这么多内容）。
  return text.length <= SITE_TEXT_MAX
    ? { text, truncated: false, length: text.length }
    : { text: text.slice(0, SITE_TEXT_MAX), truncated: true, length: text.length }
}

/** 把一条 console 结论渲染成一行。错误与告警都要能落到正文里。 */
function consoleLine(finding: { message?: { text?: string; sourceUrl?: string } }): string {
  const text = finding.message?.text ?? ''
  const source = finding.message?.sourceUrl
  return source === undefined ? text : `${text}（${source}）`
}

/**
 * `site_text` 的输出契约。
 *
 * **`truncated` / `length` 必须在渲染文本里始终可见**：它们声明在 `output.schema` 里，
 * 而 agent 只看得到 `render()` 的输出——只在截断时才写出来，等于声明了两个永远拿不到的字段，
 * 并且把「没截断」变成一个**靠缺席来表达的信号**（agent 得先知道这个约定才读得对）。
 * 这与 `click`/`fill` 那次是同一类缺陷的镜像版（2026-10-02 验收第二轮提出）。
 */
function textRenderText(value: unknown): string {
  const v = value as { text?: string; truncated?: boolean; length?: number }
  const text = v.text ?? ''
  const length = v.length ?? 0
  const footer =
    v.truncated === true
      ? `—— 已截断：本次返回前 ${String(text.length)} 字符，全文 ${String(length)} 字符`
      : `—— 全文 ${String(length)} 字符（未截断）`
  return `${text}\n${footer}`
}

/** `site_console` 输出契约的具体类型。 */
export interface ConsoleOutput {
  errorCount: number
  warningCount: number
  noiseCount: number
  total: number
  errors: string[]
  warnings: string[]
  /** 噪声**按规则**拆开（如 `favicon-404 ×1`）——被排除的东西必须可核对。 */
  noiseRules: string[]
}

/**
 * 把驱动/分类层的结果包成 `site_console` 的输出契约。
 *
 * 与 `textOutput` 同理抽出来：**这份契约是工具声明的一部分，必须有单测**（见
 * `test/tool-contract.test.ts`）。告警的**正文**必须给出去——只给计数等于「记下来了但不让人看」。
 */
export function consoleOutput(raw: unknown): ConsoleOutput {
  const summary =
    (
      (raw ?? {}) as {
        summary?: {
          errors?: Array<{ message?: { text?: string; sourceUrl?: string } }>
          warnings?: Array<{ message?: { text?: string; sourceUrl?: string } }>
          noise?: Array<{ noiseRule?: string }>
          total?: number
        }
      }
    ).summary ?? {}
  const errors = (summary.errors ?? []).map(consoleLine)
  const warnings = (summary.warnings ?? []).map(consoleLine)
  const byRule = new Map<string, number>()
  for (const finding of summary.noise ?? []) {
    const rule = finding.noiseRule ?? '(未命名规则)'
    byRule.set(rule, (byRule.get(rule) ?? 0) + 1)
  }
  return {
    errorCount: errors.length,
    warningCount: warnings.length,
    noiseCount: summary.noise?.length ?? 0,
    total: summary.total ?? 0,
    errors: errors.slice(0, CONSOLE_LIST_MAX),
    warnings: warnings.slice(0, CONSOLE_LIST_MAX),
    noiseRules: [...byRule].map(([rule, count]) => `${rule} ×${String(count)}`),
  }
}

/**
 * 把一次拒绝拼成给 agent 看的一句话。
 *
 * **拒绝码要带出去**：判定层算出来的 `OUT_OF_SCOPE` / `SITE_NOT_ALLOWED` 是这件事唯一的稳定
 * 标识符，而消息正文是给人读的中文（会随文案调整）。从前只抛 `message`，于是码只活在单测和
 * 审计日志里——agent 拿到一段散文，只能靠正则去猜（2026-10-02 端到端发现：两次拒绝里都找不到
 * 任何机器可判的错误码）。
 *
 * 格式是契约：`[CODE] 正文`，恢复路径另起一行。抽成纯函数是为了让这份格式有单测。
 */
export function denialMessage(outcome: { code: string; message: string; hint?: string }): string {
  const head = `[${outcome.code}] ${outcome.message}`
  return outcome.hint === undefined ? head : `${head}\n恢复路径：${outcome.hint}`
}

/**
 * 配置卡片（客户端半体）能改的**标量**字段。
 *
 * `targets`（站点列表）不在这一列里——它有自己那条路（`normalizeTargets` + 逐次确认），
 * 因为它是「这个站点、这个范围、这个源」的**声明**，与就绪清单、验活断言同一类东西。
 * **回答「这个表单凭什么评审」**（2026-10-03 定的口径，四条一起才成立）：
 *
 *   1. **结构化表单**：每行站点按字段填（id / url / 范围 / 允许源 / 视口 / 凭据引用），不是 YAML 自由文本；
 *   2. **服务端同一套判据**：`normalizeTargets` 严格校验（**不静默丢弃**），并要求 `normalizeConfig`
 *      把校验过的行**原样**收下（两套规则一旦分叉就在保存时报错，而不是悄悄少一个站点）；
 *   3. **逐次确认**：保存站点必须带 `confirmSiteEdit: true`——它是会影响「工具能在哪些站点上动手」的
 *      变更，与 `env_down` 同一档；
 *   4. **每次变更进审计**（含被拒的尝试）：`auditFile` 配了就是持久 JSON 行，没配就是宿主日志。
 *
 * 更彻底的那条路（站点声明**随项目走**，像 `verify/` / `ready/` 那样进项目仓库评审）是**下一件**，
 * 记在 ROADMAP 待办 6b。
 */
export const CARD_FIELDS = ['enabled', 'announceToAgent', 'settleMs', 'noSandbox', 'chromePath', 'shotDir', 'auditFile'] as const

/** 一个字符串数组字段（去空、保序）。 */
function readStringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  return value.filter((item): item is string => typeof item === 'string' && item.trim() !== '').map((item) => item.trim())
}

/**
 * 站点列表的**严格**校验（卡片保存路径专用）。
 *
 * 为什么不能直接拿 `normalizeConfig` 的结果：它对缺 id / 缺 url 的行是**静默跳过**
 * （那是给「配置里本来就写坏了一行」的容错），而保存路径上静默跳过 = 用户以为存了 3 个、实际只有 2 个。
 * 这里逐行逐字段报错、**指到 `targets[i].字段`**，并在最后用 `normalizeConfig` 复核「校验过的行
 * 一行不少地被收下」——两套规则分叉时在这里就红。
 */
export function normalizeTargets(input: unknown): { targets: Record<string, unknown>[] } | { error: string } {
  if (!Array.isArray(input)) return { error: 'targets 必须是数组' }
  const out: Record<string, unknown>[] = []
  const seen = new Set<string>()

  for (const [index, row] of input.entries()) {
    const where = `targets[${String(index)}]`
    if (typeof row !== 'object' || row === null || Array.isArray(row)) return { error: `${where} 必须是对象` }
    const entry = row as Record<string, unknown>

    const id = typeof entry.id === 'string' ? entry.id.trim() : ''
    if (id === '') return { error: `${where}.id 必须是非空字符串（工具就是按它选站点的）` }
    if (seen.has(id)) return { error: `${where}.id 与前面的站点重名：${id}——重名的那一个会被丢掉，那是静默失败` }
    seen.add(id)

    const url = typeof entry.url === 'string' ? entry.url.trim() : ''
    if (url === '') return { error: `${where}.url 必须是非空字符串（站点范围判据从它取同源与前缀）` }

    const label = typeof entry.label === 'string' ? entry.label.trim() : ''
    const scopeDirs = readStringList(entry.scopeDirs)
    if (entry.scopeDirs !== undefined && scopeDirs === undefined) return { error: `${where}.scopeDirs 必须是字符串数组` }
    const allowedOrigins = readStringList(entry.allowedOrigins)
    if (entry.allowedOrigins !== undefined && allowedOrigins === undefined) return { error: `${where}.allowedOrigins 必须是字符串数组` }

    const viewportRaw = typeof entry.viewport === 'string' ? entry.viewport.trim() : ''
    if (entry.viewport !== undefined && typeof entry.viewport !== 'string') return { error: `${where}.viewport 必须是字符串（如 390x844）` }
    if (viewportRaw !== '' && parseViewport(viewportRaw) === undefined) {
      return { error: `${where}.viewport 认不出：${viewportRaw}（要么按 宽x高 写，要么留空 = 浏览器默认）` }
    }

    const credentialRef = typeof entry.credentialRef === 'string' ? entry.credentialRef.trim() : ''
    if (entry.credentialRef !== undefined && typeof entry.credentialRef !== 'string') return { error: `${where}.credentialRef 必须是字符串` }

    out.push({
      id,
      ...(label === '' ? {} : { label }),
      url,
      scopeDirs: scopeDirs ?? [],
      allowedOrigins: allowedOrigins ?? [],
      ...(viewportRaw === '' ? {} : { viewport: viewportRaw }),
      ...(credentialRef === '' ? {} : { credentialRef }),
    })
  }

  // 复核：解析层必须把这些行**一行不少**地收下（两套规则分叉时在这里红，而不是悄悄少一个站点）
  const parsed = normalizeConfig({ targets: out }).targets
  if (parsed.length !== out.length) {
    return { error: `内部判据分叉：校验通过 ${String(out.length)} 个站点，解析层只收下 ${String(parsed.length)} 个（报 bug，别重试）` }
  }
  return { targets: out }
}

/**
 * 把卡片提交上来的 patch 收敛成「能写进 settings entry 的那几个字段」。
 *
 * **纯函数**，所以这条判据有单测（宿主半体那一层没有假宿主夹具，抽出来才能断言）。
 * 三条规矩：
 *   - 不认识的字段 → 报错（**不静默丢弃**：卡片与宿主版本不一致时，静默丢弃会让用户以为保存成功）；
 *   - `targets` → 报错并说清它该去哪儿改（见 `CARD_FIELDS` 的注释）；
 *   - 类型/范围先判、再写：非法值**不许**先落地再抛（docker 踩过：非法值写进 settings.yaml 之后
 *     整段配置在下次启动时静默退回默认）。
 */
export function normalizeCardPatch(input: Record<string, unknown>): { patch: Record<string, unknown>; code?: string } | { error: string; code?: string } {
  const patch: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input)) {
    if (key === 'confirmSiteEdit') continue // 它只是这次调用的确认位，不进配置
    if (key === 'targets') {
      if (input.confirmSiteEdit !== true) {
        return {
          error:
            '改站点声明要逐次确认：这是「工具能在哪些站点、哪些范围、哪些源上动手」的变更，'
            + '带 `confirmSiteEdit: true` 重试（卡片上那个复选框就是它）。它写进 profile 补丁层并进审计。',
          code: 'CONFIRMATION_REQUIRED',
        }
      }
      const normalized = normalizeTargets(value)
      if ('error' in normalized) return normalized
      patch.targets = normalized.targets
      continue
    }
    if (!(CARD_FIELDS as readonly string[]).includes(key)) return { error: `不认识的字段：${key}` }

    if (key === 'enabled' || key === 'announceToAgent' || key === 'noSandbox') {
      if (typeof value !== 'boolean') return { error: `${key} 必须是布尔值` }
      patch[key] = value
      continue
    }
    if (key === 'settleMs') {
      // 上界与 schema 一致（`z.natural().max(30_000)`）：卡片和 schema 各判一套就会漂。
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 30_000) {
        return { error: 'settleMs 必须是 0~30000 的整数（毫秒）' }
      }
      patch[key] = value
      continue
    }
    if (typeof value !== 'string') return { error: `${key} 必须是字符串` }
    patch[key] = value.trim()
  }
  if (Object.keys(patch).length === 0) return { error: '没有要改的字段（patch 是空的）' }
  return { patch }
}

/**
 * 卡片的 GET 快照（**纯函数**：把 `live` 投影成客户端要的形状）。
 *
 * 站点**全量只读展示**（含 `scopeDirs` / `allowedOrigins` / `viewport`）：卡片不改它们，但要把
 * 「这台机器上现在配了哪些站点、各自的范围是什么」摆出来——这正是记-15 那个缺口的一半。
 * `credentialRef` 是**引用**不是口令（值在凭据服务里），所以可以照原样给卡片。
 */
export function configSnapshotFrom(live: LiveConfig): Record<string, unknown> {
  return {
    enabled: live.enabled,
    announceToAgent: live.announceToAgent,
    settleMs: live.settleMs,
    noSandbox: live.noSandbox,
    chromePath: live.chromePath,
    shotDir: live.shotDir,
    auditFile: live.auditFile,
    projectSitesFile: live.projectSitesFile,
    targets: live.targets.map((target) => ({
      id: target.id,
      label: target.label,
      url: target.url,
      scopeDirs: [...target.scopeDirs],
      allowedOrigins: [...(target.allowedOrigins ?? [])],
      ...(target.viewport === undefined ? {} : { viewport: `${String(target.viewport.width)}x${String(target.viewport.height)}` }),
      ...(target.credentialRef === undefined ? {} : { credentialRef: target.credentialRef }),
    })),
  }
}

/** 宿主半体。 */
const plugin = definePlugin<Config>({  name: 'devfront',
  inject: ['tools'],
  apply(ctx: Context, rawConfig?: Config) {
    /**
     * 当前生效的配置。
     *
     * **必须是 `let`**：volatile 字段被 loader 就地改写后，要靠重算把它取回来（见下面的
     * `applySection`）。工具的执行体在调用时读 `live`，所以重算后无需重新注册即可用上新值；
     * 但**描述里嵌了可用站点名单**，那些必须重新注册（`refreshTools`）。
     */
    /** apply 时的原始配置：卡片保存时如果拿不到 settings 的已解析值，就用它兜底。 */
    const initialSection = plainConfig((rawConfig ?? {}) as Config) as unknown as Record<string, unknown>
    let live = normalizeConfig(initialSection)
    /** 本轮登记的工具。配置一变整批换掉——`tools.register` 不覆盖同名工具。 */
    let toolDisposers: Array<() => void> = []
    /** 本轮的能力公告段。 */
    let announcementDispose: (() => void) | undefined
    let toolsApi: ToolsLike | undefined
    let announcementApi: SystemPromptLike | undefined
    /** 已经登记出去的那份配置的指纹：用来挡掉「值没变」的空转（见 `applySection`）。 */
    let appliedSignature = JSON.stringify(live)
    let driver: CdpWebDriver | undefined
    /** settings 读写口（没有新版 settings 服务时是 `undefined`，卡片仍可用但不落盘）。 */
    let settingsScopeRef: SettingsEntryScope | undefined
    /**
     * 最近一次生效的**原始** section：卡片保存时套用 patch 的兜底源。
     *
     * **初值必须是 apply 时那份配置**，不能是 `{}`：真机验收（2026-10-03）抓到过——启动时
     * `scope.get()` 还是空对象（settings entry 尚未就绪），于是兜底源一直是空的；卡片保存
     * 一个标量时用 `{...{}, settleMs}` 重建，**把站点整批抹掉**（响应里 `targets: []`）。
     */
    let rawSectionRef: Record<string, unknown> = initialSection

    /** 审计出口：配了文件走持久出口，否则只进日志（见 `webAuditSink` 的文件头）。 */
    const audit = (): WebAuditSink => webAuditSink({ auditFile: live.auditFile, logger: ctx.logger })

    /** 取（或起）浏览器。同一插件实例共用一个，避免每次工具调用都重启 Chrome。 */
    const ensureDriver = (): CdpWebDriver => {
      if (driver === undefined) {
        const options: CdpWebDriverOptions = { settleMs: live.settleMs, noSandbox: live.noSandbox }
        if (live.chromePath !== '') options.chromePath = live.chromePath
        if (live.shotDir !== '') options.shotDir = live.shotDir
        driver = new CdpWebDriver(options)
      }
      return driver
    }

    /** 按 id 找站点；找不到时报出可用名单（agent 的失败模式是原地重试，得给它出路）。 */
    const pickTarget = (id: unknown, sites: readonly LiveTarget[]): LiveTarget => {
      const wanted = typeof id === 'string' ? id.trim() : ''
      // 兜底分支：真宿主那层 `defineTool` 的参数校验会先挡下缺参与空串（假宿主实测），
      // 这条只在绕过校验时到得了——留着是为了「拿到的 id 一定是非空」这条不变量。
      if (wanted === '') throw new Error(`缺少 target 参数。可用站点：${sites.map((t) => t.id).join(' / ')}`)
      const found = sites.find((t) => t.id === wanted)
      if (found === undefined) {
        throw new Error(`没有名为 ${JSON.stringify(wanted)} 的站点。可用：${sites.map((t) => t.id).join(' / ')}`)
      }
      return found
    }

    /**
     * 一次调用**可用**的站点：profile 声明的 +（宿主开关打开时）**项目里声明的**。
     *
     * 开关（`projectSitesFile`）为空 = 只认 profile（缺省）。打开后按每次调用的 `cwd` 找项目清单，
     * 与 profile 的站点取并集；**同一个 id 出现在两处 = 配置问题**（报出来，不静默取一个）。
     * 问题与「本目录没有清单」是两件事：前者报错（带恢复路径），后者安静地只用 profile。
     */
    const sitesForCall = (cwd: unknown): { sites: LiveTarget[] } | { problem: string } => {
      if (live.projectSitesFile === '') return { sites: live.targets }
      const dir = typeof cwd === 'string' && cwd.trim() !== '' ? cwd.trim() : process.cwd()
      const read = loadProjectSites(dir, live.projectSitesFile)
      if (read.kind === 'missing') return { sites: live.targets }
      if (read.kind === 'problem') return { problem: read.message }
      const declared = normalizeConfig({ targets: read.sites }).targets
      const merged = mergeSites(
        live.targets as unknown as Record<string, unknown>[],
        declared as unknown as Record<string, unknown>[],
      )
      if ('problem' in merged) return { problem: merged.problem }
      return { sites: merged.sites as unknown as LiveTarget[] }
    }

    /**
     * 跑一次动作。
     *
     * 判定层的拒绝带 `hint`（恢复路径），拼进错误消息——一句「不允许」不产生新信息，
     * agent 只能原样再试一次。
     */
    const run = async (action: WebAction, args: unknown): Promise<unknown> => {
      const input = (args ?? {}) as Record<string, unknown>
      const resolved = sitesForCall(input.cwd)
      if ('problem' in resolved) throw new Error(resolved.problem)
      const target = pickTarget(input.target, resolved.sites)
      const outcome = await invokeWebAction({
        request: {
          target,
          action,
          // `cwd` 缺省取宿主进程的工作目录：作用域判据要用它，而空作用域 = 处处拒绝。
          cwd: typeof input.cwd === 'string' && input.cwd.trim() !== '' ? input.cwd : process.cwd(),
          ...(typeof input.url === 'string' ? { url: input.url } : {}),
          ...(typeof input.selector === 'string' ? { selector: input.selector } : {}),
          ...(typeof input.value === 'string' ? { value: input.value } : {}),
          ...(typeof input.path === 'string' && input.path !== '' ? { path: input.path } : {}),
        },
        driver: ensureDriver(),
        audit: audit(),
      })
      if (!outcome.ok) {
        throw new Error(denialMessage(outcome))
      }
      return outcome.result
    }

    const cwdParam = {
      type: 'string',
      description: '当前工作目录（作用域判据用它；缺省取宿主进程工作目录。作用域为空的站点处处拒绝）',
    } as const

    /**
     * 注册六个动作（**可重入**）。
     *
     * 每次调用先拆掉上一轮的登记：`tools.register` 不覆盖同名工具，而配置一变，工具描述里嵌的
     * 「可用站点名单」就过期了——不拆就会留下同名工具两份，agent 看到的还是旧名单。
     */
    function refreshTools(): void {
      if (toolsApi === undefined) return
      const api: ToolsLike = toolsApi
      disposeTools()
      if (!live.enabled) {
        console.log('[dsh-devfront] agent tools skipped (disabled)')
        return
      }
      if (live.targets.length === 0) {
        // 没有站点可验时注册工具只会给 agent 一排必然失败的入口。说清原因，别让它去猜。
        console.log('[dsh-devfront] agent tools skipped (targets 为空：先在插件配置里声明站点)')
        return
      }
      const targetParam = {
        type: 'string',
        required: true,
        description: `站点 id。可用：${live.targets.map((t) => t.id).join(' / ')}`,
      } as const
      const add = (name: string, definition: unknown): void => {
        try {
          toolDisposers.push(api.register(definition))
        } catch (error) {
          // 单个工具注册失败不该把整批带下去（docker D107 同款教训）：其余工具照常可用。
          console.warn(`[dsh-devfront] 工具 ${name} 注册失败：${error instanceof Error ? error.message : String(error)}`)
        }
      }

      add(
        'site_open',
        defineTool({
          name: 'site_open',
          isConcurrencySafe: () => true,
          description: `打开一个站点页面（可用已验证的会话）。只允许目标声明过的站点：**同源且落在声明路径前缀之内**，异源一律拒；不给 url 就打开站点根。可用站点：${live.targets.map((t) => t.id).join(' / ')}`,
          parameters: {
            target: targetParam,
            url: { type: 'string', description: '要打开的 URL（必须落在该站点声明的范围内）；缺省打开站点根' },
            cwd: cwdParam,
          },
          output: {
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: { url: { type: 'string', required: true }, title: { type: 'string' } },
            },
            render: (_args: unknown, value: unknown) => {
              const v = value as { url?: string; title?: string }
              /*
               * 空标题按「没有标题」处理（2026-10-02 真机）：真实 SPA 常把 `<title>` 置空
               * （实测 `mtc.example.com/hcckc-h5` 的 `document.title` 恒为 `''`），而原先只对
               * `undefined` 省括号——于是 agent 读到 `已打开 https://…（标题：）`，
               * 一对空括号看着像坏值，比「没有标题」更糟。
               */
              const title = (v.title ?? '').trim()
              return [{ type: 'text', text: `已打开 ${v.url ?? ''}${title === '' ? '' : `（标题：${title}）`}` }]
            },
          },
          async execute(args: unknown): Promise<{ url: string; title?: string }> {
            return (await run('open', args)) as { url: string; title?: string }
          },
        }),
      )

      add(
        'site_shot',
        defineTool({
          name: 'site_shot',
          isConcurrencySafe: () => true,
          description: '对当前页面截图（返回 PNG 落盘路径，agent 可直接看这张图）。用于「页面到底长什么样」的核对。',
          parameters: {
            target: targetParam,
            path: { type: 'string', description: '输出文件路径（缺省落到临时目录）' },
            cwd: cwdParam,
          },
          output: {
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                path: { type: 'string', required: true },
                width: { type: 'number' },
                height: { type: 'number' },
              },
            },
            render: (_args: unknown, value: unknown) => {
              const v = value as { path?: string; width?: number; height?: number }
              const size = v.width === undefined ? '' : `（${String(v.width)}×${String(v.height ?? 0)}）`
              return [{ type: 'text', text: `已截图：${v.path ?? ''}${size}` }]
            },
          },
          async execute(args: unknown): Promise<{ path: string; width?: number; height?: number }> {
            return (await run('shot', args)) as { path: string; width?: number; height?: number }
          },
        }),
      )

      add(
        'site_click',
        defineTool({
          name: 'site_click',
          isConcurrencySafe: () => false,
          description:
            '点击匹配 CSS 选择器的元素（**只按选择器**，不做按坐标点击——那没有可复审的选择依据）。找不到元素会明确报错，不会静默成功。',
          parameters: {
            target: targetParam,
            selector: { type: 'string', required: true, description: 'CSS 选择器' },
            cwd: cwdParam,
          },
          output: {
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: { selector: { type: 'string', required: true } },
            },
            render: (_args: unknown, value: unknown) => [
              { type: 'text', text: `已点击 ${(value as { selector?: string }).selector ?? ''}` },
            ],
          },
          async execute(args: unknown): Promise<{ selector: string }> {
            return (await run('click', args)) as { selector: string }
          },
        }),
      )

      add(
        'site_fill',
        defineTool({
          name: 'site_fill',
          isConcurrencySafe: () => false,
          description: '给匹配 CSS 选择器的输入框填值（会派发 input 与 change 事件，前端框架能感知）。',
          parameters: {
            target: targetParam,
            selector: { type: 'string', required: true, description: 'CSS 选择器' },
            value: { type: 'string', required: true, description: '要填入的值（空串合法，表示清空）' },
            cwd: cwdParam,
          },
          output: {
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: { selector: { type: 'string', required: true } },
            },
            render: (_args: unknown, value: unknown) => [
              { type: 'text', text: `已填值到 ${(value as { selector?: string }).selector ?? ''}` },
            ],
          },
          async execute(args: unknown): Promise<{ selector: string }> {
            return (await run('fill', args)) as { selector: string }
          },
        }),
      )

      add(
        'site_text',
        defineTool({
          name: 'site_text',
          isConcurrencySafe: () => true,
          description:
            '取当前页面的**可见文本**（`document.body.innerText`，不是 HTML）。断言里的「页面应包含某段文字」应当拿它比。正文末尾**始终**附一行「全文 N 字符（未截断）」或「已截断：本次返回前 N 字符，全文 M 字符」——超长会截断并说明。**它取不到**（缺了不代表页面上没有）：图片里的字（真实站点常把标题/水印**烤进整屏背景图**，含伪元素上的 `background-image`）、canvas、SVG 文本、closed shadow DOM、iframe 内内容——「应包含某段文字」失败时先 `site_shot` 看一眼。',
          parameters: { target: targetParam, cwd: cwdParam },
          output: {
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                text: { type: 'string', required: true },
                truncated: { type: 'boolean', required: true },
                length: { type: 'number', required: true },
              },
            },
            render: (_args: unknown, value: unknown) => [{ type: 'text', text: textRenderText(value) }],
          },
          async execute(args: unknown): Promise<{ text: string; truncated: boolean; length: number }> {
            return textOutput(await run('text', args))
          },
        }),
      )

      add(
        'site_console',
        defineTool({
          name: 'site_console',
          isConcurrencySafe: () => true,
          description:
            '收 console 消息并三档分类：error（**来自本站资源**的错，才是「页面坏了」的信号）/ warning（本站告警、异源或来源不明的错——需要人看一眼）/ noise（favicon 404、扩展注入、第三方埋点被拦、ResizeObserver 告警，以及页面自己的 log/info/debug 日志；**留在报告里但不计入信号**）。未捕获的异常也在内。错误与告警的**正文**都会给出来，噪声则**按规则**给出构成（如 `favicon-404 ×1`）——被排除的东西必须可核对。',
          parameters: { target: targetParam, cwd: cwdParam },
          output: {
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                errorCount: { type: 'number', required: true },
                warningCount: { type: 'number', required: true },
                noiseCount: { type: 'number', required: true },
                total: { type: 'number', required: true },
                errors: { type: 'array', required: true, items: { type: 'string' } },
                warnings: { type: 'array', required: true, items: { type: 'string' } },
                noiseRules: { type: 'array', required: true, items: { type: 'string' } },
              },
            },
            render: (_args: unknown, value: unknown) => {
              const v = value as {
                errors?: string[]
                warnings?: string[]
                noiseRules?: string[]
                errorCount?: number
                warningCount?: number
                noiseCount?: number
                total?: number
              }
              const head =
                `console 共 ${String(v.total ?? 0)} 条：本站错误 ${String(v.errorCount ?? 0)}、` +
                `告警 ${String(v.warningCount ?? 0)}、噪声（已排除）${String(v.noiseCount ?? 0)}`
              const errors = v.errors ?? []
              const warnings = v.warnings ?? []
              const lines = [
                ...errors.map((line) => `  ✘ ${line}`),
                ...warnings.map((line) => `  ! ${line}`),
              ]
              // 截断要**说明**：只给前 10 条而不说，读的人会以为告警就这么多。
              const capped = (v.errorCount ?? 0) + (v.warningCount ?? 0) > lines.length ? '（仅列前 10 条）' : ''
              // 被排除的东西要能**拆开核对**：只报「噪声 2」的话，规则一旦误伤真错误就没人看得见
              // （2026-10-02 验收第二轮提出：2 条噪声的构成无从验证）。
              const noise =
                (v.noiseCount ?? 0) === 0
                  ? ''
                  : `\n噪声构成：${(v.noiseRules ?? []).join('、')}`
              const detail = lines.length === 0 ? '没有本站错误，也没有告警。' : `${capped}\n${lines.join('\n')}`
              return [{ type: 'text', text: `${head}\n${detail}${noise}` }]
            },
          },
          async execute(args: unknown): Promise<ConsoleOutput> {
            return consoleOutput(await run('console', args))
          },
        }),
      )
      console.log(
        `[dsh-devfront] agent tools registered (${(['site_open', 'site_shot', 'site_click', 'site_fill', 'site_text', 'site_console'] as const).join(', ')})`,
      )
    }

    /** 拆掉本插件登记的工具（没有就不动）。 */
    function disposeTools(): void {
      for (const dispose of toolDisposers) {
        try {
          dispose()
        } catch {
          /* 已注销 */
        }
      }
      toolDisposers = []
    }

    /** 拆掉能力公告段（没有就不动）。 */
    function disposeAnnouncement(): void {
      if (announcementDispose === undefined) return
      try {
        announcementDispose()
      } catch {
        /* 已注销 */
      }
      announcementDispose = undefined
    }

    /** 按当前 `live` 重新插公告段（**可重入**，同 `refreshTools`）。 */
    function refreshAnnouncement(): void {
      disposeAnnouncement()
      if (!live.announceToAgent || announcementApi === undefined) return
      announcementDispose = announcementApi.section({ name: 'plugin:dsh-devfront', order: 153, text: DEVFONT_GUIDANCE })
    }

    /**
     * 用一份新配置重算并让它**真的生效**。
     *
     * 存在的理由（2026-10-02 查实）：本插件把 Config 的字段全标了 `.volatile()`，而那个声明的
     * 语义是「可以热写、**插件自己订阅 `loader/volatile-update` 重读**」——loader 检出「只变了
     * volatile 字段」后**不重挂插件**，只把配置引用就地改写。所以插件配置页上改站点，此前会
     * 写盘成功、却静默不生效：那份声明是假的。docker / tty / codegraph 都订阅了，只有这里漏了。
     */
    function applySection(raw: Record<string, unknown>): void {
      /*
       * 空对象 = settings 还没准备好这份 entry（`describeEntry` 找不到时的兜底形状就是 `{}`），
       * **不是**「用户清空了配置」——后者仍会投影出全部 volatile 字段。认它会把已声明的站点
       * 整批抹掉、六个工具一起消失。
       */
      if (Object.keys(raw).length === 0) return
      rawSectionRef = raw
      const next = normalizeConfig(raw)
      /*
       * 值没变就不动。`loader/volatile-update` 是**全仓广播**的（kit 的 onChanged 不按 entry
       * 过滤，见 `settingsEntryScope`），别的插件改配置也会打到我们这里——没有这道闸，每改一次
       * 别人的配置都会把我们六个工具拆掉再装一遍，期间的调用会撞上「工具不存在」。
       */
      const signature = JSON.stringify(next)
      if (signature === appliedSignature) return
      appliedSignature = signature
      live = next
      // 浏览器按新配置重建：settleMs / noSandbox / chromePath / shotDir 只在构造时读一次。
      driver?.dispose()
      driver = undefined
      refreshTools()
      refreshAnnouncement()
    }

    /* ---------- 初次登记 ---------- */
    refreshTools()
    refreshAnnouncement()

    ctx.inject(['tools'], (toolsCtx: Context) => {
      toolsApi = (toolsCtx as unknown as { tools?: ToolsLike }).tools
      if (toolsApi === undefined) {
        // 只在「本来该注册」时出声：关掉 / 没配站点时那句提示已经由 refreshTools 说过了。
        if (live.enabled && live.targets.length > 0) {
          console.log('[dsh-devfront] agent tools skipped (tools 服务未就绪)')
        }
        return
      }
      refreshTools()
    })

    ctx.inject(['systemPrompt'], (promptCtx: Context) => {
      announcementApi = (promptCtx as unknown as { systemPrompt?: SystemPromptLike }).systemPrompt
      refreshAnnouncement()
    })

    /*
     * ---------- settings ----------
     *
     * resolved 值才是权威（schema 默认值 ← 组合 base ← 用户层）。注意 `scope.get()` 是
     * **volatile 字段的投影**（dsh-settings 的 `volatileForm`）：本插件的字段因此必须全部
     * volatile，否则这里会漏掉非 volatile 的那些——今天全部是，而那也正是「配置页存在」的前提。
     */
    ctx.inject(['settings'], (settingsCtx: Context) => {
      settingsCtx.effect(() => {
        const scope = settingsEntryScope(settingsCtx, 'devfront')
        if (scope === undefined) return () => {}
        settingsScopeRef = scope
        applySection(scope.get())
        const off = scope.onChanged(() => applySection(scope.get()))
        return () => {
          settingsScopeRef = undefined
          off()
        }
      }, 'dsh-devfront: settings')
    })

    /*
     * ---------- 配置卡片的**数据面**（`/api/dsh-devfront/config`） ----------
     *
     * 为什么必须有这条路由：客户端半体读不到插件配置——宿主那套「按 schema 生成表单」在这一版
     * **没有渲染方**（记-15 真机扫过），所以各插件的卡片都自带一条 GET/POST 路由（tty / docker 同款）。
     *
     * - GET：卡片渲染用的快照（`configSnapshotFrom(live)`，站点全量只读）；
     * - POST：走**官方持久化通道** `settings.update(entryId, patch)` 写 volatile 字段 →
     *   loader 广播 → 本插件的 `applySection` 热应用（不重启）。没有 settings 服务时退化成
     *   「只在本进程套用」，并**在响应里如实标注 `persisted: false`**——不假装写进去了。
     *
     * `/config` 不受「插件停用」影响（与 tty 同口径）：卡片是重新启用插件的唯一 UI 入口。
     */
    ctx.inject(['webServer'], (webCtx: Context) => {
      webCtx.effect(() => {
        const webServer = (webCtx as unknown as { webServer?: { register(route: unknown): () => void } }).webServer
        if (webServer === undefined) return () => {}
        return webServer.register({
          kind: 'exact',
          path: '/api/dsh-devfront/config',
          handler: async (req: ReqLike & AsyncIterable<Uint8Array>, res: ResLike) => {
            /*
             * 围栏：**只放回环 + 强来源判据**（`isLoopbackRequestStrict`，与 tty / docker 的
             * `gateRoute` 同一套）。`POST /config` **刻意不额外要求 `hasSameOriginProof`**：
             * 卡片是插件被停用后唯一的恢复入口（与 tty 的 `/config`、docker 的 `/config` 同口径），
             * 而跨站请求已由上面那道围栏的 `sec-fetch-site: cross-site` 与 Origin 比对拦掉。
             */
            if (!(await isLoopbackRequestStrict(req))) {
              writeJson(res, 403, { error: 'forbidden: loopback-only' })
              return
            }
            // `hasSameOriginProof` 在这里只用于**诊断日志**：真正的判据是上面那道围栏。
            if (req.method === 'POST' && !hasSameOriginProof(req)) {
              ctx.logger.warn('[dsh-devfront] /config 的 POST 没带同源证明（回环已放行，按恢复入口口径继续）')
            }
            if (req.method === 'GET') {
              writeJson(res, 200, { ok: true, config: configSnapshotFrom(live), persisted: settingsScopeRef !== undefined })
              return
            }
            if (req.method !== 'POST') {
              writeJson(res, 405, { error: `method not allowed: ${String(req.method)}` })
              return
            }
            const body = await readJsonBody(req)
            if (body === undefined) {
              writeJson(res, 400, { error: 'invalid JSON body' })
              return
            }
            const normalized = normalizeCardPatch(body)
            if ('error' in normalized) {
              /*
               * **被拒的尝试也进审计**（与工具面同一口径）。写不进去就让它抛：审计是这条路径的
               * 前提，坏了就该响（而不是安静地放行一次没记下来的变更）。
               */
              webAuditSink({ auditFile: live.auditFile, logger: ctx.logger }).record({
                at: Date.now(),
                targetId: 'card',
                action: 'config.save',
                allowed: false,
                ...(normalized.code === undefined ? {} : { code: normalized.code }),
              })
              writeJson(res, 400, {
                error: normalized.error,
                ...(normalized.code === undefined ? {} : { code: normalized.code }),
              })
              return
            }
            const scope = settingsScopeRef
            if (scope !== undefined) {
              try {
                await scope.update(normalized.patch)
              } catch (error) {
                writeJson(res, 500, { error: `保存配置失败：${error instanceof Error ? error.message : String(error)}` })
                return
              }
              /*
               * 优先用 settings 的**已解析值**（含非 volatile 字段与组合后的层），拿不到才退回
               * 「最近一次原始 section + patch」。**不能只退回后者**：见 `rawSectionRef` 的注释
               * （真机验收抓到过：保存一个标量把站点整批抹掉）。
               */
              const resolved = scope.get()
              if (Object.keys(resolved).length > 0) applySection(resolved)
              else applySection({ ...rawSectionRef, ...normalized.patch })
            } else {
              applySection({ ...rawSectionRef, ...normalized.patch })
            }
            // 成功的变更也进审计：站点声明（影响「能在哪些站点上动手」）与标量分开记。
            webAuditSink({ auditFile: live.auditFile, logger: ctx.logger }).record({
              at: Date.now(),
              targetId: 'card',
              action: 'targets' in normalized.patch ? 'config.sites' : 'config.scalars',
              allowed: true,
            })
            writeJson(res, 200, { ok: true, config: configSnapshotFrom(live), persisted: scope !== undefined })
          },
        })
      }, 'dsh-devfront: config route')
    })

    /* ---------- 卸载清理 ---------- */
    ctx.effect(() => {
      return () => {
        disposeTools()
        disposeAnnouncement()
        // 必须关：不关就是每挂载一次泄漏一个 Chrome 进程。
        driver?.dispose()
        driver = undefined
      }
    }, 'dsh-devfront: cleanup')

    /*
     * 挂载行用 `console.log` 而不是 `ctx.logger.info`（2026-10-01 修正）：
     * 本仓其余 10 个插件都往 stdout 打这一行，而运维就是**在启动日志里找它**确认插件挂上了。
     * 走 `ctx.logger` 会进另一个 sink——实测结果就是「插件明明在跑，但启动日志里什么都看不到」，
     * 于是人去查了一圈为什么没挂上。日志的**去处**也是约定的一部分。
     */
    console.log(
      `[dsh-devfront] mounted (enabled=${String(live.enabled)}, targets=${String(live.targets.length)}, noSandbox=${String(live.noSandbox)}, audit=${live.auditFile === '' ? 'log-only' : live.auditFile})`,
    )
  },
})

export const { name, inject, apply } = plugin
