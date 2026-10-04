/**
 * `devfront` 的**登录编排声明**：`WebTarget.login` 的形态、校验与执行计划
 * （plan §15.3 的「登录凭据与站点会话」那一条；ROADMAP 待办 B3 的编排那一半）。
 *
 * ## 它解决的那个洞
 *
 * 凭据那一半（`site_fill` 的 `credentialRef`，记-29）解决了「口令不许进参数与日志」，
 * 但**登录这件事仍然要人手串**：`site_open` → `site_fill`（账号）→ `site_fill`（口令）→
 * `site_click` → 再验。驱动在进程里保持着同一个浏览器，所以登录态在后续调用里是活的——
 * 缺的只是「把这一串写下来、下次照单走一遍」。
 *
 * ## 边界：它是**声明**，不是浏览器自动化
 *
 * plan §15.3 写着本套件「不做定时任务、不做爬虫、不做批量操作」，登录编排天然朝着
 * 「通用浏览器自动化」滑，所以形态要钉死：
 *
 * | 会变成通用自动化（**不做**） | 这一件 |
 * |---|---|
 * | agent 每次**现编**操作序列 | 步骤**写死在目标声明里**（profile 补丁层 / 项目里的 `web/sites.yaml`），随配置评审、可 diff |
 * | 任意 JS / 条件 / 循环 | **固定词汇**：`goto` / `fill` / `click` / `waitFor` + 一条 `success`；步数与总预算都有上限 |
 * | 想去哪就去哪 | 每一步过**与 `site_open` / `site_click` / `site_fill` 同一道**判据（同源 + 声明路径前缀 + 目录作用域 + 动手前核当前页面源），每一步各记一行审计 |
 * | 悄悄跑 | 同前：拒绝也进审计 |
 *
 * 所以工具面（`site_login`）**只接受 `target` 与 `cwd`**：步骤只能来自声明。
 *
 * ## 三条判出来的形态（每条都在 `test/login.test.ts` 里有反例）
 *
 * 1. **第一步必须是 `goto`**：否则这次登录依赖「调用前浏览器恰好停在哪一页」——那份声明就不可复现，
 *    而「照单可复现」正是它相对「人手串一遍」的唯一价值；
 * 2. **成功判据只有 `selector` 一种**（刻意**不做** `url`）：`url` 前缀匹配在「登录后跳回站点根」
 *    这类声明里会**恒真**（登录页自己就在那个前缀下），于是「登录没成」会被报成成功——
 *    恒真的判据比没有判据更坏。要表达「到了某个页面」，点名一个**只有登录后才会出现**的元素；
 * 3. **总预算是硬上限、不可声明**：一旦能声明，一份写长的声明就把整个上限换走了。预算写在
 *    `LOGIN_BUDGET_MS`，每一步的等待都受**剩余预算**夹取（执行器里那段 `Math.min` 就是它）。
 *
 * ## 与「两份真相」的关系
 *
 * 形态与校验**只有这一份**：`normalizeTargets`（卡片保存 / 项目清单那条**严格**路径）与
 * `site_login` 开工前（profile 那条路径，配置错误在这里才浮出来）都调 `parseLogin`。
 * 默认值（`waitFor.timeoutMs`）也在解析这一步填好——执行器不猜。
 */

import { urlAllowed, type WebTarget } from './page.js'

/** 步骤动作白名单：**这份清单就是全部词汇**——不做任意脚本、不做条件、不做循环。 */
export const LOGIN_ACTIONS = ['goto', 'fill', 'click', 'waitFor'] as const

/** 步骤动作名。 */
export type LoginAction = (typeof LOGIN_ACTIONS)[number]

/** 步数上限。超出的声明**不成立**（不静默截断：截断会让「写下的第 11 步」悄悄不存在）。 */
export const MAX_LOGIN_STEPS = 10

/** `waitFor` 单步等待的缺省与上限（毫秒）。 */
export const LOGIN_WAIT_DEFAULT_MS = 5_000
export const LOGIN_WAIT_MAX_MS = 15_000

/**
 * 一次登录的**总预算**（毫秒）。**刻意不可声明**：它是这套东西的上界，一份写长的声明能把它换走
 * 的那天，上限就没了。每一步的等待用「剩余预算」夹取，步与步之间再核一次（见 `login-run.ts`）。
 *
 * 为什么定 120 秒：登录流程是**几步的交互**，不是批量跑批。导航本身还有驱动的 30 秒导航超时兜底，
 * 所以真正的墙钟上限是「预算 + 一次导航」——工具声明的协作式预算 `timeoutMs` 按它取 180 秒。
 */
export const LOGIN_BUDGET_MS = 120_000

/** `goto` 一步。 */
export interface LoginGotoStep {
  action: 'goto'
  /** 已经解析成**绝对 URL**（相对路径按站点根解析）；它一定过 `urlAllowed`。 */
  url: string
}

/** `fill` 一步。`value` 与 `credentialRef` **恰好一个**（解析保证）。 */
export interface LoginFillStep {
  action: 'fill'
  selector: string
  /** 明文值（非敏感：账号、租户码）。口令一类必须走 `credentialRef`。 */
  value?: string
  /** 凭据引用（`env:NAME`）——必须正是目标 `credentialRef` 声明的那一个。 */
  credentialRef?: string
}

/** `click` 一步。 */
export interface LoginClickStep {
  action: 'click'
  selector: string
}

/** `waitFor` 一步（等一个元素出现；`timeoutMs` 已在解析时填好缺省）。 */
export interface LoginWaitStep {
  action: 'waitFor'
  selector: string
  timeoutMs: number
}

/** 一步。 */
export type LoginStep = LoginGotoStep | LoginFillStep | LoginClickStep | LoginWaitStep

/**
 * 解析出来的**执行计划**（没有可选项：默认值与解析好的 URL 都在这儿）。
 *
 * 它**不含任何凭据值**——凭据引用要到执行那一步才由宿主解析（`page.ts` 的口径），
 * 所以计划可以安全地进出日志与报告。
 */
export interface LoginPlan {
  steps: LoginStep[]
  /** 成功判据：一个**只有登录后才会出现**的元素。 */
  success: { selector: string }
  /** 总预算（毫秒）。 */
  budgetMs: number
}

/** 一条校验错误（`path` 相对 `login`，调用方按自己的口径加前缀）。 */
export interface LoginError {
  path: string
  message: string
}

/**
 * `WebTarget.login` 的**声明原文**（未判定）。
 *
 * 类型刻意留成「可能是什么都还没验过」：真实判定是 `parseLogin`，而这份原文要能原样经过
 * 配置层（`normalizeConfig`）走到判定那一步——**不许在中间被静默丢掉**（见 `normalizeTargets`）。
 * 未知字段留着不收（判定会拒），因为「先扔掉再判定」等于把写错的字段伪装成没写。
 */
export interface LoginDeclaration {
  steps?: unknown
  success?: unknown
  [key: string]: unknown
}

/** 解析结果。 */
export type LoginParse = { ok: true; plan: LoginPlan } | { ok: false; errors: LoginError[] }

/** 是不是一个「映射」（YAML 的 `{}`）。数组与 null 都不算。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 非空字符串（顺带 trim）。 */
function nonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

/**
 * 判定 + 归一一份登录声明。
 *
 * **永不抛**：四种结局都是返回值（与 `loadProjectSites` 同口径），因为调用方要的是一句带路径的
 * 拒绝，而不是一段栈。
 *
 * @param raw - 声明原文（`WebTarget.login`）。
 * @param target - 它所属的站点：`goto` 的站点范围判据与 `credentialRef` 的「只认声明过的那一个」
 *   都要拿目标比（两条判据都来自 `page.ts`，这里不另立一份）。
 */
export function parseLogin(raw: unknown, target: WebTarget): LoginParse {
  const errors: LoginError[] = []
  const fail = (path: string, message: string): void => {
    errors.push({ path, message })
  }

  if (!isRecord(raw)) {
    return { ok: false, errors: [{ path: '', message: `必须是一个映射（含 steps 与 success），拿到 ${JSON.stringify(raw)}` }] }
  }
  for (const key of Object.keys(raw)) {
    if (!['steps', 'success'].includes(key)) {
      fail(key, '未知字段——不认识的一律拒（写错的字段名不该被当成没写）')
    }
  }

  /* ------------------------------ steps ------------------------------ */

  const steps: LoginStep[] = []
  const rawSteps = raw.steps
  if (!Array.isArray(rawSteps)) {
    fail('steps', `必须是一个数组（每一步一个映射，action 是 ${LOGIN_ACTIONS.join(' / ')}），拿到 ${JSON.stringify(rawSteps)}`)
  } else if (rawSteps.length === 0) {
    fail('steps', '至少要有一步——空声明连「打开登录页」都没做，验不出任何东西')
  } else if (rawSteps.length > MAX_LOGIN_STEPS) {
    fail('steps', `${String(rawSteps.length)} 步超过了上限 ${String(MAX_LOGIN_STEPS)} 步——登录流程是几步的交互，不是批量操作；要更多步请先问「这一步真需要吗」`)
  } else {
    for (const [index, entry] of rawSteps.entries()) {
      const at = `steps[${String(index)}]`
      if (!isRecord(entry)) {
        fail(at, `必须是映射（如 \`{ action: fill, selector: "#user", value: admin }\`），拿到 ${JSON.stringify(entry)}`)
        continue
      }
      const action = nonEmptyString(entry.action)
      if (action === undefined || !(LOGIN_ACTIONS as readonly string[]).includes(action)) {
        fail(`${at}.action`, `必须是 ${LOGIN_ACTIONS.join(' / ')} 之一，拿到 ${JSON.stringify(entry.action)}`)
        continue
      }
      const allowedKeys: Record<LoginAction, readonly string[]> = {
        goto: ['action', 'url'],
        fill: ['action', 'selector', 'value', 'credentialRef'],
        click: ['action', 'selector'],
        waitFor: ['action', 'selector', 'timeoutMs'],
      }
      for (const key of Object.keys(entry)) {
        if (!allowedKeys[action as LoginAction].includes(key)) {
          fail(`${at}.${key}`, `\`${action}\` 这一步没有这个字段——不认识的一律拒`)
        }
      }

      if (action === 'goto') {
        const url = nonEmptyString(entry.url)
        if (url === undefined) {
          fail(`${at}.url`, '必须是非空 URL（推荐站内绝对路径，如 `/login`）')
          continue
        }
        let resolved: string
        try {
          resolved = new URL(url, target.url).toString()
        } catch {
          fail(`${at}.url`, `${JSON.stringify(url)} 解析不了（站点 URL 是 ${JSON.stringify(target.url)}）`)
          continue
        }
        // 与 `site_open` 同一道判据：同源 + 落在声明路径前缀之内。这里提前判，是为了让
        // 「这份声明会跑到站点范围外面去」在**碰浏览器之前**就报出来，而不是跑到第三步才发现。
        const verdict = urlAllowed(resolved, target.url)
        if (verdict !== true) {
          fail(
            `${at}.url`,
            verdict === undefined
              ? `${resolved} 判不了（站点 URL ${JSON.stringify(target.url)} 不是合法 URL）`
              : `${resolved} 不在目标 ${target.id} 声明的站点范围内（${target.url}）——`
                + '它会在第一步就把浏览器带出这个站点。跨源的登录（SSO / IdP）靠**页面自己跳**：'
                + '第一步 `goto` 站内一个受保护页面，再把那个源写进目标的 allowedOrigins（`fill` / `click` 才允许在它上面动手）',
          )
          continue
        }
        steps.push({ action: 'goto', url: resolved })
        continue
      }

      const selector = nonEmptyString(entry.selector)
      if (selector === undefined) {
        fail(`${at}.selector`, '必须是非空 CSS 选择器（本套件不做按坐标点击——那没有可复审的选择依据）')
        continue
      }

      if (action === 'fill') {
        const ref = nonEmptyString(entry.credentialRef)
        const hasValue = typeof entry.value === 'string'
        if (entry.value !== undefined && !hasValue) {
          fail(`${at}.value`, `必须是字符串，拿到 ${JSON.stringify(entry.value)}`)
          continue
        }
        if (hasValue && ref !== undefined) {
          fail(`${at}.value`, '`value` 与 `credentialRef` 只能给一个——哪个是值说不清，因此不猜')
          continue
        }
        if (!hasValue && ref === undefined) {
          fail(`${at}.selector`, '这一步没有值：`value`（明文，非敏感）或 `credentialRef`（凭据引用）二选一')
          continue
        }
        if (ref !== undefined) {
          if (!ref.startsWith('env:') || ref.length <= 4) {
            fail(
              `${at}.credentialRef`,
              `必须是引用（env:NAME），拿到 ${JSON.stringify(ref)}——明文口令写进声明就同时进了配置文件与评审记录`,
            )
            continue
          }
          const declared = nonEmptyString(target.credentialRef)
          if (declared === undefined) {
            fail(
              `${at}.credentialRef`,
              `目标 ${target.id} 没有声明 credentialRef，因此这份声明里写不了引用——`
                + '先用凭据卡片把口令存起来，再在目标配置里写下 `credentialRef: env:NAME`',
            )
            continue
          }
          if (declared !== ref) {
            fail(
              `${at}.credentialRef`,
              `目标 ${target.id} 声明的是 ${declared}，不是 ${ref}——`
                + '能取到的凭据集合 = 维护者声明过的那一个（「能读任意环境变量」与「能读这一个」是两回事）',
            )
            continue
          }
          steps.push({ action: 'fill', selector, credentialRef: ref })
          continue
        }
        steps.push({ action: 'fill', selector, value: entry.value as string })
        continue
      }

      if (action === 'click') {
        steps.push({ action: 'click', selector })
        continue
      }

      // waitFor
      const rawTimeout = entry.timeoutMs
      let timeoutMs = LOGIN_WAIT_DEFAULT_MS
      if (rawTimeout !== undefined) {
        if (typeof rawTimeout !== 'number' || !Number.isInteger(rawTimeout) || rawTimeout <= 0 || rawTimeout > LOGIN_WAIT_MAX_MS) {
          fail(`${at}.timeoutMs`, `必须是 1~${String(LOGIN_WAIT_MAX_MS)} 的整数（毫秒，缺省 ${String(LOGIN_WAIT_DEFAULT_MS)}）`)
          continue
        }
        timeoutMs = rawTimeout
      }
      steps.push({ action: 'waitFor', selector, timeoutMs })
    }
  }

  if (steps.length > 0 && steps[0]?.action !== 'goto') {
    fail('steps[0].action', '第一步必须是 `goto`——否则这次登录依赖「调用前浏览器恰好停在哪一页」，那份声明就不可复现')
  }

  /* ----------------------------- success ----------------------------- */

  let success: { selector: string } | undefined
  const rawSuccess = raw.success
  if (rawSuccess === undefined) {
    fail('success', '必写：没有成功判据就没法回答「到底登录上了没有」')
  } else if (!isRecord(rawSuccess)) {
    fail('success', `必须是一个映射（如 \`{ selector: "#app" }\`），拿到 ${JSON.stringify(rawSuccess)}`)
  } else {
    for (const key of Object.keys(rawSuccess)) {
      if (key === 'url') {
        fail(
          'success.url',
          '判据刻意不做 URL（前缀匹配在「登录后跳回站点根」这类声明里会**恒真**——登录页自己就在那个前缀下，'
            + '于是「没登录成」会被报成成功）。改成点名一个**只有登录后才会出现**的元素',
        )
        continue
      }
      if (key !== 'selector') fail(`success.${key}`, '未知字段——不认识的一律拒')
    }
    const selector = nonEmptyString(rawSuccess.selector)
    if (selector === undefined) {
      fail('success.selector', '必须是非空 CSS 选择器（一个**只有登录后才会出现**的元素）')
    } else {
      success = { selector }
    }
  }

  if (errors.length > 0 || success === undefined) {
    return { ok: false, errors }
  }

  return { ok: true, plan: { steps, success, budgetMs: LOGIN_BUDGET_MS } }
}

/**
 * 把校验错误拼成给人看的多行正文（`path：message`）——**不含前缀**，前缀由调用方按自己的口径加
 * （卡片保存那条路径要写 `targets[i].login`，工具那条要写站点名）。
 */
export function describeLoginErrors(errors: readonly LoginError[]): string {
  return errors.map((error) => `- ${error.path === '' ? error.message : `${error.path}：${error.message}`}`).join('\n')
}
