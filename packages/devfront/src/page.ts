/**
 * 前端验证的**工具面**（`docs/devdata-plan.md` §15.2）与**边界**（§15.3）。
 *
 * ## 这一层为什么存在，而不是「让 agent 直接开个浏览器」
 *
 * §15.3 的边界是硬要求：**它是「验证」工具，不是「自动化」工具**——不做定时任务、
 * 不做爬虫、不做批量操作。边界不能靠「叫 agent 别那么干」来守（那是一条没有守卫的规矩），
 * 得靠**工具面里根本没有那些动作**。所以这里的动作是一份**白名单**：
 * 未登记的动作一律拒，与数据面（`operations.ts`）同一条口径。
 *
 * ## 三个判据，顺序是契约
 *
 * 1. **动作在不在白名单里**（未登记一律拒）；
 * 2. **当前目录在不在目标的 `scopeDirs` 内**——空 = 处处拒绝（fail closed）。
 *    这条与数据面共用 `scope.ts`：前端验证同样会打到**共享的测试环境**上；
 * 3. **目标站点对不对**：`site_open` 只能打开目标**声明过的站点**。
 *    这条是本层特有的：数据面的目标是一个连接串，而这里的目标是一个**站点**——
 *    给一个 URL 就能打开，是最容易被顺手扩成爬虫的入口。所以站点必须在 `WebTarget` 里声明，
 *    且只允许同源 + 声明路径前缀之内。
 *
 * ## 与 §15.2 工具面的对应
 *
 * | 计划里的工具 | 本层的动作 | 驱动方法 |
 * |---|---|---|
 * | `site_open` | `open` | `driver.open` |
 * | `site_shot` | `shot` | `driver.screenshot` |
 * | `site_click` / `site_fill` | `click` / `fill` | `driver.click` / `driver.fill` |
 * | `site_console` | `console` | `driver.console` |
 * | `site_text` | `text` | `driver.text` |
 *
 * 依据：`docs/devdata-plan.md` §15.2 / §15.3 / §5（审计面）、`jenkins-release` 技能 §3.2。
 */

import { decideScope } from '@hyzyn/dsh-kit'

import { classifyConsoleMessages, summarizeConsole, type ConsoleMessage, type ConsoleSummary } from './console.js'
import type { CredentialOutcome } from './credential.js'
import type { PageObservation } from './web-verify.js'
/** 动作名。**这份清单就是白名单**——不在其中的一律拒。 */
export const WEB_ACTIONS = ['open', 'shot', 'click', 'fill', 'text', 'console'] as const

/** 动作名类型。 */
export type WebAction = (typeof WEB_ACTIONS)[number]

/**
 * 一个可验证的站点。
 *
 * `url` 是**必须声明**的：前端验证的入口是「打开一个 URL」，而给一个 URL 就能打开，
 * 是最容易被顺手扩成爬虫的地方。声明之后，`open` 只能落在它的同源 + 路径前缀之内。
 */
export interface WebTarget {
  /** 稳定 id。 */
  id: string
  label: string
  /** 站点根 URL（如 `https://cdqas.example.com/`）。 */
  url: string
  /**
   * 允许访问的目录；**空 / 缺失 = 处处拒绝**。
   *
   * 与数据面共用 `scope.ts` 的语义：前端验活同样会打到共享的测试环境上。
   */
  scopeDirs?: readonly string[]
  /**
   * **允许动手的额外源**（缺省 / 空 = 只能在声明源上动手）。
   *
   * 为什么需要它：登录 / SSO 会把页面跳到另一个源（IdP），而**填账号密码就是在那个源上动手**。
   * 于是「动作只允许在声明源上做」会把登录流程整条掐掉。代价不能由规则偷偷承担，
   * 得由人显式声明——写下一个源就是一次值得看一眼的决定。
   *
   * 只影响**动作**（`click` / `fill`）；读（`text` / `shot` / `console`）不受它约束，
   * 因为跳转后**读**是登录流程的必要部分（见 `MUTATING_WEB_ACTIONS`）。
   */
  allowedOrigins?: readonly string[]
  /**
   * 视口尺寸（**按站点**，2026-10-02 加）。
   *
   * 为什么按站点而不是全局：同一个仓里既有**移动端 H5**（`hcckc-h5` / `bpaimsm-v4` /
   * `bpaossm-v3.1`）又有桌面后台，而「验活」要看的正是**用户实际会看到的那个尺寸**——
   * 在桌面视口下看移动 H5，看到的不是手机上的样子，移动端专属的布局问题会漏掉。
   * 缺省（不写）= 浏览器默认视口。
   *
   * **只改视口尺寸**：不模拟移动设备（touch / DPR / UA 都不变），见 ROADMAP 记-17。
   */
  viewport?: { width: number; height: number }
  /** 登录凭据引用（`env:NAME` 一类）。**永不存明文**，与数据面同口径。 */
  credentialRef?: string
}

/** 一次动作请求。 */
export interface WebActionRequest {
  target: WebTarget
  action: WebAction
  cwd: string
  /** `open` 的 URL / `click` 的选择器 / `fill` 的选择器与值 / `shot` 的输出路径。 */
  url?: string
  selector?: string
  value?: string
  /**
   * `fill` 的**凭据引用**（`env:NAME`）——与 `value` 二选一。
   *
   * 它是**引用不是值**：判定层只核「这个引用是不是目标声明过的那一个」，解析（问官方凭据服务）
   * 在执行那一步由宿主注入的解析器做。于是值从不经过工具参数、会话记录与审计行。
   */
  credentialRef?: string
  /** `shot` 的输出文件（不给则由驱动决定临时路径）。 */
  path?: string
}

/** 判定结果。 */
export type WebDecision =
  | { allowed: true; action: WebAction; url?: string }
  | { allowed: false; action: WebAction; code: WebRejectionCode; message: string; hint?: string }

/** 拒绝码。 */
export const WEB_REJECTION_CODES = {
  /** 动作不在白名单里（未登记一律拒）。 */
  UNKNOWN_ACTION: 'UNKNOWN_ACTION',
  /** 当前目录不在目标的允许目录内（空 = 处处拒绝）。 */
  OUT_OF_SCOPE: 'OUT_OF_SCOPE',
  /** 目标没声明站点 URL。 */
  SITE_NOT_DECLARED: 'SITE_NOT_DECLARED',
  /** 要打开的 URL 不在目标声明的站点范围内（异源 / 越出路径前缀）。 */
  SITE_NOT_ALLOWED: 'SITE_NOT_ALLOWED',
  /** 参数缺失（如 `click` 没给选择器）。 */
  ARGUMENT_MISSING: 'ARGUMENT_MISSING',
  /**
   * **动手时当前页面不在允许的源上**（或读不到当前页面的源）。
   *
   * `open` 的站点范围判据只管**入口**：页面自己 `location.replace` 到别的源是浏览器行为，
   * 驱动拦不住。所以动作类必须在**执行前**再核一次**实时**页面源——否则「审入口」就退化成
   * 「审入口，除非页面自己把你带出去」，任何一个声明站点上的跳转（登录 / SSO / 第三方重定向 /
   * 被投毒的页面）都能换来对任意源执行点击与填值的能力（2026-10-02 验收实测）。
   */
  PAGE_ORIGIN_NOT_ALLOWED: 'PAGE_ORIGIN_NOT_ALLOWED',
  /** `fill` 同时给了 `value` 与 `credentialRef`——哪个是值说不清，一律拒（不猜）。 */
  CREDENTIAL_AND_VALUE: 'CREDENTIAL_AND_VALUE',
  /**
   * 用了目标**没有声明**的凭据引用（或目标一个都没声明），或引用不是 `env:NAME` 形状。
   *
   * 这条判据就是「agent 能取到的凭据集合 = 维护者写在 profile 里的那一个」的实现：
   * 没有它，`credentialRef` 参数会变成「任意环境变量的读取器」。
   */
  CREDENTIAL_NOT_DECLARED: 'CREDENTIAL_NOT_DECLARED',
  /** 引用是声明过的，但**解析不出来**（凭据没配 / 值为空 / 凭据服务报错）。 */
  CREDENTIAL_UNRESOLVED: 'CREDENTIAL_UNRESOLVED',
  /** 执行失败。 */
  EXECUTION_FAILED: 'EXECUTION_FAILED',
} as const

/** 拒绝码类型。 */
export type WebRejectionCode = (typeof WEB_REJECTION_CODES)[keyof typeof WEB_REJECTION_CODES]

/** 判断一个字符串是不是已登记的动作。 */
export function isWebAction(value: string): value is WebAction {
  return (WEB_ACTIONS as readonly string[]).includes(value)
}

/**
 * 一个 URL 是否落在目标声明的站点范围内。
 *
 * 口径：**同源**，且**路径在声明路径前缀之内**。两点都要：
 *   - 只判同源会让 `https://site/admin` 这类越权路径也能打开；
 *   - 只判前缀会在换域名后静默放行到别的站点。
 *
 * 返回 `undefined` = 无法判断（URL 不合法），调用方按拒绝处理。
 */
export function urlAllowed(url: string, siteUrl: string): boolean | undefined {
  let target: URL
  let site: URL
  try {
    target = new URL(url)
    site = new URL(siteUrl)
  } catch {
    return undefined
  }
  if (target.origin !== site.origin) return false
  // 站点的路径前缀按「目录」比：声明的 `/app/` 允许 `/app/x`，不允许 `/appx`。
  const prefix = site.pathname.endsWith('/') ? site.pathname : `${site.pathname}/`
  return target.pathname === site.pathname || target.pathname.startsWith(prefix)
}

/**
 * **会在页面上动手的动作** —— 只有这些需要「当前页面的源」判据。
 *
 * 为什么读类不在其中：跳转后**读**是登录流程的必要部分（登录页要读、要截图给人看），
 * 而且读本身不改变对面任何东西，读到的东西按**不受信的数据**处理。
 * 但「对异源页动手」是另一回事：它把「审查入口」退化成「审查入口，除非页面自己把你带出去」。
 */
export const MUTATING_WEB_ACTIONS = ['click', 'fill'] as const

/** 该动作是否需要在执行前核当前页面的源。 */
export function needsPageOriginCheck(action: WebAction): boolean {
  return (MUTATING_WEB_ACTIONS as readonly string[]).includes(action)
}

/** 把一个 URL 规约成源；不合法则 `undefined`。 */
function originOf(url: string | undefined): string | undefined {
  if (url === undefined || url.trim() === '') return undefined
  try {
    return new URL(url).origin
  } catch {
    return undefined
  }
}

/**
 * 允许**动手**的源集合：声明源 + 显式声明的额外源（`allowedOrigins`）。
 *
 * 解析不出来的条目**不授予任何权限**——一条写错的配置不该变成一次静默放行。
 */
export function allowedActionOrigins(target: WebTarget): Set<string> {
  const origins = new Set<string>()
  for (const candidate of [target.url, ...(target.allowedOrigins ?? [])]) {
    const origin = originOf(candidate)
    if (origin !== undefined) origins.add(origin)
  }
  return origins
}

/** 当前页面的源是否允许动手。`undefined` = 读不到 → 调用方按拒绝处理。 */
export function pageOriginAllowed(
  currentUrl: string | undefined,
  target: WebTarget,
): boolean | undefined {
  const origin = originOf(currentUrl)
  if (origin === undefined) return undefined
  return allowedActionOrigins(target).has(origin)
}

/** 目标声明的站点是否可用（能解析、是 http/https）。 */
function siteUsable(siteUrl: string | undefined): siteUrl is string {
  if (siteUrl === undefined || siteUrl.trim() === '') return false
  try {
    const url = new URL(siteUrl)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * 裁决一次动作。**纯函数**：不连浏览器、不读环境变量、不读文件。
 *
 * 顺序见文件头的三条判据。
 */
export function adjudicateWebAction(request: WebActionRequest): WebDecision {
  const { target, action, cwd } = request

  // ① 白名单。
  if (!isWebAction(action)) {
    return {
      allowed: false,
      action,
      code: WEB_REJECTION_CODES.UNKNOWN_ACTION,
      message: `动作 ${action} 未登记在前端验证的白名单里，一律拒绝`,
      hint: `可用动作：${WEB_ACTIONS.join(' / ')}。本套件是**验证**工具，不是浏览器自动化工具（不做定时 / 爬虫 / 批量）`,
    }
  }

  // ② 目录作用域（与数据面同一份实现，语义：空 = 处处拒绝）。
  const scope = decideScope(target.scopeDirs, cwd)
  if (!scope.allowed) {
    return {
      allowed: false,
      action,
      code: WEB_REJECTION_CODES.OUT_OF_SCOPE,
      message: `当前目录不在目标 ${target.id} 的允许目录内（作用域为空表示处处拒绝）`,
      hint: `在目标 ${target.id} 的配置里声明 scopeDirs；前端验活会打到共享的测试环境，所以缺省拒绝`,
    }
  }

  // ③ 站点范围：只对 `open` 有意义（其余动作作用于「已经打开的那个页面」）。
  if (action === 'open') {
    if (!siteUsable(target.url)) {
      return {
        allowed: false,
        action,
        code: WEB_REJECTION_CODES.SITE_NOT_DECLARED,
        message: `目标 ${target.id} 没有声明可访问的站点（或声明的不是 http/https URL）`,
        hint: '在目标配置里声明 url；声明之后 open 只能落在它的同源与路径前缀之内',
      }
    }
    // 不给 URL = 打开**目标声明的站点根**。这是最常见的第一次调用（站点已经声明过、
    // 也已经被这条判据验证过），没理由逼调用方把同一个 URL 再抄一遍。
    if (request.url === undefined || request.url.trim() === '') {
      return { allowed: true, action, url: target.url }
    }
    const allowed = urlAllowed(request.url, target.url)
    if (allowed !== true) {
      return {
        allowed: false,
        action,
        code: WEB_REJECTION_CODES.SITE_NOT_ALLOWED,
        message:
          allowed === undefined
            ? `URL 不合法：${request.url}`
            : `${request.url} 不在目标 ${target.id} 声明的站点范围内（${target.url}）`,
        hint: `open 只允许同源且落在声明路径前缀之内的 URL；要验别的站点请先在配置里声明它`,
      }
    }
    return { allowed: true, action, url: request.url }
  }

  // ③' 其余动作的参数要求。
  if ((action === 'click' || action === 'fill') && (request.selector === undefined || request.selector.trim() === '')) {
    return {
      allowed: false,
      action,
      code: WEB_REJECTION_CODES.ARGUMENT_MISSING,
      message: `${action} 需要一个选择器（selector）`,
      hint: '给一个 CSS 选择器；本套件不做「按坐标点击」——那没有可复审的选择依据',
    }
  }
  if (action === 'fill') {
    const ref = request.credentialRef === undefined ? undefined : request.credentialRef.trim()
    const hasValue = request.value !== undefined
    const hasRef = ref !== undefined && ref !== ''
    if (hasValue && hasRef) {
      return {
        allowed: false,
        action,
        code: WEB_REJECTION_CODES.CREDENTIAL_AND_VALUE,
        message: 'fill 同时给了 value 与 credentialRef——哪个是要填的值说不清，因此不猜',
        hint: '二选一：非敏感值用 value；口令一类用 credentialRef（写目标声明过的那个引用）',
      }
    }
    if (!hasValue && !hasRef) {
      return {
        allowed: false,
        action,
        code: WEB_REJECTION_CODES.ARGUMENT_MISSING,
        message: 'fill 需要一个值：`value`（明文）或 `credentialRef`（凭据引用）',
        hint: '非敏感值给 value；口令一类请让维护者在目标配置里声明 credentialRef，再用 credentialRef 调用',
      }
    }
    if (hasRef) {
      // 引用必须是 `env:NAME`：明文值一旦进了工具参数，就会同时进会话记录、审计行与日志。
      if (!ref.startsWith('env:') || ref.length <= 4) {
        return {
          allowed: false,
          action,
          code: WEB_REJECTION_CODES.CREDENTIAL_NOT_DECLARED,
          message: `credentialRef 必须是一个引用（env:NAME），拿到 ${JSON.stringify(ref)}`,
          hint: '明文别写进参数：把值存进凭据存储或环境变量，然后写 env:名字',
        }
      }
      const declared = target.credentialRef
      if (declared === undefined || declared === '') {
        return {
          allowed: false,
          action,
          code: WEB_REJECTION_CODES.CREDENTIAL_NOT_DECLARED,
          message: `目标 ${target.id} 没有声明凭据引用，因此不接受任何 credentialRef`,
          hint: `为什么这么严：否则这个参数就成了「读任意环境变量」。要用请让维护者在目标 ${target.id} 的配置里写下 credentialRef（一个 env:NAME）`,
        }
      }
      if (declared !== ref) {
        return {
          allowed: false,
          action,
          code: WEB_REJECTION_CODES.CREDENTIAL_NOT_DECLARED,
          message: `目标 ${target.id} 声明的是 ${declared}，不是 ${ref}`,
          hint: `agent 能取到的凭据集合 = 维护者声明过的那一个。要换引用请改目标配置（那是随 profile 评审的决定）`,
        }
      }
    }
  }

  return { allowed: true, action }
}

/* --------------------------------- 驱动 --------------------------------- */

/** 一次执行的结果。 */
export type WebOutcome =
  | { ok: true; action: WebAction; result: unknown }
  | { ok: false; action: WebAction; code: WebRejectionCode; message: string; hint?: string }

/** 截图结果。 */
export interface ShotResult {
  /** 落盘路径。 */
  path: string
  /** 宽高（报告里带上，便于判断是不是截了个空页面）。 */
  width?: number
  height?: number
}

/**
 * 页面驱动接口。
 *
 * 内核只依赖这个接口，**不依赖 Chrome / CDP**：真实实现（`@hyzyn/dsh-kit` 的 `Chrome`，
 * 原先从仓根 `scripts/chrome-cdp.mjs` 导入，那个转发 shim 已于 2026-10-02 删除）与测试里的
 * 假实现都实现它。这也是为什么本模块
 * 能在**没有浏览器**的情况下被完整测试——而「判定对不对」正是这一层最容易悄悄错掉的地方。
 */
export interface WebDriver {
  /** 打开 URL（可用目标的已验证会话）。 */
  open(request: { target: WebTarget; url: string; cwd: string }): Promise<{ url: string; title?: string }>
  /** 截图。 */
  screenshot(request: { target: WebTarget; path?: string }): Promise<ShotResult>
  /** 点击。 */
  click(request: { target: WebTarget; selector: string }): Promise<void>
  /** 填值。 */
  fill(request: { target: WebTarget; selector: string; value: string }): Promise<void>
  /** 取页面文本。 */
  text(request: { target: WebTarget }): Promise<string>
  /** 取 console 消息（**原始事实**，分类由 `console.ts` 做）。 */
  console(request: { target: WebTarget }): Promise<readonly ConsoleMessage[]>
  /**
   * **一次取全**：把「这个页面现在是什么样」在一次往返里取回来（文本 + 若干选择器 + console）。
   *
   * 为什么要有它，而不是让调用方挨个调 `text` / `console` / 逐个选择器问一遍：
   * 一批断言里 N 条可能落在同一个页面上，逐个取会让「一个页面」被读 N 次——**读的次数越多，
   * 拿到的越不是同一个瞬间**（SPA 一秒变三回），于是同一次验活里两条断言的失败原因互相矛盾。
   * 一次取全把「一次验活里一条断言看到的世界」固定成**同一次往返**的结果。
   *
   * `selectors` 由 `selectorsNeeded(assertions)` 给出（**账要算在断言上**，不是驱动自己猜）。
   * 选择器不合法不算执行失败：结果里那个选择器带 `error`，求值层据此判 `unknown`
   * （见 `PageElementObservation.error`）。
   */
  observe(request: { target: WebTarget; selectors: readonly string[] }): Promise<PageObservation>
  /**
   * **实时**问浏览器：当前页面的 URL 是什么。
   *
   * 必须是**实时的**，不能用驱动记的「上次导航的 URL」代替——客户端跳转（`location.replace`、
   * SPA 路由、`<meta refresh>`）只有浏览器自己知道，驱动的记账会漏掉它们，
   * 而那恰好是这道判据要防的东西。拿不到时返回 `undefined`（调用方按拒绝处理）。
   */
  currentUrl(request: { target: WebTarget }): Promise<string | undefined>
}

/* --------------------------------- 审计 --------------------------------- */

/** 一次动作的审计行（**含被拒绝的尝试**）。 */
export interface WebAuditEntry {
  at: number
  targetId: string
  action: string
  allowed: boolean
  code?: string
  /** 打开 / 点击的目标（URL 或选择器）。 */
  subject?: string
  /**
   * 本次用的是哪个**凭据引用**（`env:NAME`）——**只记引用名，永不记值**。
   *
   * 记它的理由与记 URL 一样：「谁在什么时候用了哪一份凭据」是这件事的事实，而引用名本身
   * 不是秘密（它就写在配置里）。值进审计行的那一天，审计文件就成了第二个凭据存储。
   */
  credentialRef?: string
  operationId?: string
}

/** 审计出口。写不进去时不返回结果（fail closed），由调用方实现这条语义。 */
export interface WebAuditSink {
  record(entry: WebAuditEntry): void
}

/* --------------------------------- 话术 --------------------------------- */

/**
 * 把一次拒绝拼成给 agent 看的一句话。
 *
 * **拒绝码要带出去**：判定层算出来的 `OUT_OF_SCOPE` / `SITE_NOT_ALLOWED` 是这件事唯一的稳定
 * 标识符，而消息正文是给人读的中文（会随文案调整）。从前只抛 `message`，于是码只活在单测和
 * 审计日志里——agent 拿到一段散文，只能靠正则去猜（2026-10-02 端到端发现：两次拒绝里都找不到
 * 任何机器可判的错误码）。
 *
 * 格式是契约：`[CODE] 正文`，恢复路径另起一行。抽成纯函数是为了让这份格式有单测。
 *
 * 2026-10-04 从 `plugin.ts` 挪到这里：跑批执行器（`web-run.ts`）也要把「这个页面打不开」写成
 * 同一格式，而执行器**不能** import 宿主半体（那是反向依赖，会成环）。话术属于判定层。
 */
export function denialMessage(outcome: { code: string; message: string; hint?: string }): string {
  const head = `[${outcome.code}] ${outcome.message}`
  return outcome.hint === undefined ? head : `${head}\n恢复路径：${outcome.hint}`
}

/* --------------------------------- 调用 --------------------------------- */

/** 调一个动作：**先裁决，再执行**，每次都进审计。 */
export async function invokeWebAction(input: {
  request: WebActionRequest
  driver: WebDriver
  audit?: WebAuditSink
  operationId?: string
  /**
   * 凭据解析器（**宿主注入**：官方凭据服务 + `env` 兜底，见 `credential.ts`）。
   *
   * 判定层只判「这个引用允不允许用」，解析必须在**执行那一步**做，而且要每次操作重新解析
   * （provider 的契约：改完凭据下一个动作即生效）。**不给解析器就是拒绝**：声明了引用却没人
   * 能解析，比放行一个空值安全得多。
   */
  credentials?: (ref: string) => Promise<CredentialOutcome>
}): Promise<WebOutcome> {
  const { request, driver, audit, operationId, credentials } = input
  const { target, action } = request
  const credentialRef = request.credentialRef === undefined ? undefined : request.credentialRef.trim()

  const denial = (code: WebRejectionCode, message: string, hint?: string): WebOutcome => {
    audit?.record({
      at: Date.now(),
      targetId: target.id,
      action,
      allowed: false,
      code,
      ...(request.url === undefined ? {} : { subject: request.url }),
      // 只有 `fill` 用凭据引用；别的动作即使被塞了也**不记**——记了就是一条无意义的审计行。
      ...(action !== 'fill' || credentialRef === undefined || credentialRef === '' ? {} : { credentialRef }),
      ...(operationId === undefined ? {} : { operationId }),
    })
    return hint === undefined ? { ok: false, action, code, message } : { ok: false, action, code, message, hint }
  }

  const decision = adjudicateWebAction(request)
  if (!decision.allowed) {
    return denial(decision.code, decision.message, decision.hint)
  }

  /*
   * ③' **解析凭据引用**（只对 `fill`，且只在用引用时）。
   *
   * 位置刻意在「判定通过之后、动手之前」：判定层管「允不允许用这个引用」，这里管「能不能拿到值」。
   * 失败也是一条带码的拒绝（`CREDENTIAL_UNRESOLVED`）——凭据没配是常态，不是异常，
   * 而 agent 需要的是「去哪配」而不是一段栈。
   *
   * 这一段**在页源判据之前**：解析不该为了一个可能被拒的动作去读凭据。
   */
  let resolved: CredentialOutcome | undefined
  if (action === 'fill' && credentialRef !== undefined && credentialRef !== '') {
    if (credentials === undefined) {
      return denial(
        WEB_REJECTION_CODES.CREDENTIAL_UNRESOLVED,
        `目标 ${target.id} 声明了凭据引用 ${credentialRef}，但当前宿主没有可用的凭据解析器`,
        '宿主需要装官方凭据服务（@deepseek-ai/dsh-credentials）；也可以先直接把值存进进程环境变量',
      )
    }
    resolved = await credentials(credentialRef)
    if (!resolved.ok) {
      return denial(
        WEB_REJECTION_CODES.CREDENTIAL_UNRESOLVED,
        `凭据引用 ${credentialRef} 解析不了：${resolved.message}`,
        '按这条错误去补凭据（凭据存储 / 环境变量）；值本身不会出现在任何输出与日志里',
      )
    }
  }

  // ④ **动手前核实时页面源**（只对动作类；读类放行，理由见 `MUTATING_WEB_ACTIONS`）。
  //
  // 这一道不能并进 `adjudicateWebAction`：那里是纯函数，看不到浏览器。而 `open` 那道站点范围判据
  // 只管**入口 URL**——页面自己 `location.replace` 到别的源，驱动拦不住。
  // 少了这一道，「审入口」就变成「审入口，除非页面自己把你带出去」。
  if (needsPageOriginCheck(action)) {
    let currentUrl: string | undefined
    try {
      currentUrl = await driver.currentUrl({ target })
    } catch {
      currentUrl = undefined // 问不到 = 不知道在谁的页面上 → 不敢动手
    }
    const verdict = pageOriginAllowed(currentUrl, target)
    if (verdict !== true) {
      const declared = [...allowedActionOrigins(target)].join(' / ')
      return verdict === undefined
        ? denial(
            WEB_REJECTION_CODES.PAGE_ORIGIN_NOT_ALLOWED,
            '读不到当前页面的源，因此不敢在它上面动手',
            '先 site_open 一个已声明的 URL 并确认页面真的加载起来；动作只允许在声明源上执行',
          )
        : denial(
            WEB_REJECTION_CODES.PAGE_ORIGIN_NOT_ALLOWED,
            `当前页面在 ${originOf(currentUrl) ?? ''}，不在允许动手的源里（允许：${declared}）`,
            `登录 / SSO 若确实需要在别的源上点击或填值，把那个源加进目标的 allowedOrigins（缺省为空 = 只能在声明源上动手）。注意：**页面自己跳转到异源不构成授权**`,
          )
    }
  }

  const allow = (result: unknown): WebOutcome => {
    audit?.record({
      at: Date.now(),
      targetId: target.id,
      action,
      allowed: true,
      ...(request.url === undefined ? {} : { subject: request.url }),
      ...(action !== 'fill' || credentialRef === undefined || credentialRef === '' ? {} : { credentialRef }),
      ...(operationId === undefined ? {} : { operationId }),
    })
    return { ok: true, action, result }
  }

  try {
    switch (action) {
      case 'open': {
        // 裁决已确认 URL；下面这个 `??` 只是让类型收窄，实际到不了。
        const url = decision.url ?? request.url ?? target.url
        return allow(await driver.open({ target, url, cwd: request.cwd }))
      }
      case 'shot':
        return allow(await driver.screenshot({ target, ...(request.path === undefined ? {} : { path: request.path }) }))
      case 'click':
        // 选择器非空已由裁决保证。
        await driver.click({ target, selector: request.selector ?? '' })
        // 回显的键必须是 `selector`：这是工具声明的输出契约（`additionalProperties: false`），
        // 且渲染层按 `value.selector` 取字。曾经写成 `clicked`/`filled`，结果是**动作成功但工具报错**
        // （2026-10-02 端到端复现）——最坏的一种失败：agent 以为没点成，会去重试一个有副作用的动作。
        return allow({ selector: request.selector ?? '' })
      case 'fill': {
        await driver.fill({
          target,
          selector: request.selector ?? '',
          // 用引用时只认解析出来的值（`resolved.ok` 已在上面保证）；否则用调用方给的明文。
          value: resolved !== undefined && resolved.ok ? resolved.value : (request.value ?? ''),
        })
        /*
         * 回显里**只加引用名与保护强度，永远不加值**：`site_fill` 的输出是会被写进会话记录的东西，
         * 把值放进去就等于「用一个更长的寿命换一点方便」。强度也必须一起回（plan §3.7-1）：
         * 只说「已配置」等于对外宣称了一个不成立的性质。
         */
        return allow({
          selector: request.selector ?? '',
          ...(resolved !== undefined && resolved.ok
            ? { credentialRef: resolved.ref, protection: resolved.protection.level, protectionNote: resolved.protection.note }
            : {}),
        })
      }
      case 'text':
        return allow(await driver.text({ target }))
      case 'console': {
        const messages = await driver.console({ target })
        const findings = classifyConsoleMessages(messages)
        return allow({ messages: findings, summary: summarizeConsole(findings) })
      }
    }
  } catch (error) {
    // 驱动报错是**执行层**失败，与「被闸门拦下」不同（agent 的后续动作也不同）。
    return denial(
      WEB_REJECTION_CODES.EXECUTION_FAILED,
      error instanceof Error ? error.message : String(error),
      '这是执行失败（不是被闸门拦下）：检查站点是否可达、选择器是否存在',
    )
  }
}

/** `console` 动作的返回形状（给调用方与用例用）。 */
export interface ConsoleActionResult {
  messages: ReturnType<typeof classifyConsoleMessages>
  summary: ConsoleSummary
}
