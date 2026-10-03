/**
 * **工具输出契约**守卫（2026-10-02 建立）。
 *
 * ## 为什么必须有这个文件
 *
 * `site_click` / `site_fill` 的判定层返回曾经写成 `{ clicked }` / `{ filled }`，而工具**声明**的
 * 输出是 `{ selector }` + `additionalProperties: false`。后果是最坏的一种失败：
 * **浏览器动作真的生效了，但工具调用报 `invalid output`** —— agent 会以为没点成，于是去重试一个
 * 有副作用的动作（真实环境上这可能就是重复提交）。
 *
 * 上一版冒烟只跑了 `open` / `text` / `console` / `shot`，**没跑 `click` / `fill`**，所以没抓到。
 * 教训不是「补两条用例」，而是：**声明的契约与实际产出的键之间没有守卫**，
 * 而这两样东西分别住在两个文件里、靠人脑维持一致。
 *
 * ## 这个文件做什么
 *
 * 按同一张表把两件事对起来：
 *   1. 每个工具**声明的** `output.schema`；
 *   2. 走真实合成路径（判定层 `invokeWebAction` + 宿主层 `textOutput` / `consoleOutput`）
 *      **实际产出**的对象。
 * 并顺带检查渲染层读的字段真的存在——当时渲染层读 `value.selector`，会跟着一起空掉，
 * 于是即便契约对上了，agent 看到的也仍是一句「已点击 」。
 *
 * 不连浏览器：`WebDriver` 本来就是**注入**的（判定层如此设计），这里用假驱动。
 */

import { describe, expect, it } from 'vitest'

import type { WebAction, WebDriver, WebTarget } from '../src/index.js'
import { invokeWebAction } from '../src/page.js'
import { apply, consoleOutput, denialMessage, SITE_TEXT_MAX, textOutput } from '../src/plugin.js'

const CWD = '/work/cdqas'
const SITE = 'https://cdqas.example.com/'

const TARGET: WebTarget = { id: 'w-cdqas', label: '海关前端', url: SITE, scopeDirs: [CWD] }

/* --------------------------------- 假宿主 --------------------------------- */

/** DSH 工具输出 schema 的那个方言子集（本包用到的部分）。 */
interface JsonSchema {
  type?: string
  required?: boolean
  properties?: Record<string, JsonSchema>
  items?: JsonSchema
  additionalProperties?: boolean
}

interface ToolDef {
  name: string
  output: {
    schema: JsonSchema
    render: (args: unknown, value: unknown) => Array<{ type: string; text: string }>
  }
}

/**
 * 挂一次插件，把注册进来的工具定义收下来。
 *
 * 不连浏览器：驱动是**懒创建**的（`ensureDriver`），注册路径碰不到它。
 */
function mountTools(): Map<string, ToolDef> {
  const tools = new Map<string, ToolDef>()
  const noop = (): void => {}
  const ctx = {
    logger: { info: noop, warn: noop },
    inject: (deps: string[], cb: (child: unknown) => void): void => {
      if (deps.includes('tools')) {
        cb({
          tools: {
            register: (def: ToolDef) => {
              tools.set(def.name, def)
              return noop
            },
          },
        })
      }
      if (deps.includes('systemPrompt')) cb({ systemPrompt: { section: () => noop } })
    },
    effect: noop,
  }
  ;(apply as unknown as (ctx: unknown, config: unknown) => void)(ctx, {
    targets: [{ id: TARGET.id, label: TARGET.label, url: SITE, scopeDirs: [CWD] }],
    noSandbox: true,
  })
  return tools
}

/**
 * 按工具输出 schema 校验一个值，返回人读的偏差（空数组 = 通过）。
 *
 * 刻意自己写而不是拿宿主的校验器：这条守卫要在**没有宿主**的单测里跑，而它要守的正是
 * 「宿主会拒掉的那件事」，所以判据必须留在这里而不是宿主的实现里。
 */
function validate(schema: JsonSchema, value: unknown, path = 'value'): string[] {
  if (schema.type === 'object') {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      return [`${path}: 期望 object，实际 ${Array.isArray(value) ? 'array' : typeof value}`]
    }
    const record = value as Record<string, unknown>
    const problems: string[] = []
    for (const [key, child] of Object.entries(schema.properties ?? {})) {
      if (!Object.hasOwn(record, key)) {
        // `required` 缺失是硬错；可选字段（如 `site_shot` 的 width）缺失是正常的。
        if (child.required === true) problems.push(`${path}.${key}: 声明 required 但实际缺失`)
        continue
      }
      problems.push(...validate(child, record[key], `${path}.${key}`))
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(record)) {
        if (!Object.hasOwn(schema.properties ?? {}, key)) {
          problems.push(`${path}.${key}: 未声明却实际返回了（additionalProperties: false 会拒掉整次调用）`)
        }
      }
    }
    return problems
  }
  if (schema.type === 'array') {
    if (!Array.isArray(value)) return [`${path}: 期望 array，实际 ${typeof value}`]
    if (schema.items === undefined) return []
    return value.flatMap((item, index) => validate(schema.items as JsonSchema, item, `${path}[${index}]`))
  }
  if (schema.type === 'string' && typeof value !== 'string') return [`${path}: 期望 string，实际 ${typeof value}`]
  if (schema.type === 'number' && typeof value !== 'number') return [`${path}: 期望 number，实际 ${typeof value}`]
  if (schema.type === 'boolean' && typeof value !== 'boolean') return [`${path}: 期望 boolean，实际 ${typeof value}`]
  return []
}

/**
 * 假驱动。
 *
 * 返回形状必须与 `WebDriver` 接口的字面声明一致——契约守卫正是靠这一点发现「判定层把键改了名」：
 * 假驱动按接口返回，若 `page.ts` 在中间重新组装，校验就会失败。
 */
function fakeDriver(): WebDriver {
  return {
    open: async ({ url }) => ({ url, title: '订单列表' }),
    screenshot: async () => ({ path: '/tmp/shot-1.png', width: 1440, height: 757 }),
    click: async () => {},
    fill: async () => {},
    text: async () => '订单列表\n订单编号 CDQ-2026-001',
    // 「当前页面」= 声明站点本身：这条守卫要查的是输出契约，不是源判据（后者见 page.test.ts）
    currentUrl: async () => `${SITE}order`,
    console: async () => [
      // 页面自己打的日志（**不是**告警，见 console.ts 的信息类分支）
      { level: 'log', text: '页面已渲染', sourceUrl: `${SITE}app.js`, pageUrl: SITE },
      // 本站资源的错误（这是「页面坏了」的信号）
      { level: 'error', text: '订单行渲染失败', sourceUrl: `${SITE}app.js`, pageUrl: SITE },
    ],
  }
}

/* ------------------------------ 契约对照表 ------------------------------ */

/**
 * 工具 → 动作 → 走哪条合成路径。
 *
 * `compose` 为空表示宿主层是**直通**的（判定层的结果就是工具的输出）；
 * 有 `compose` 表示宿主层重新包过（那两个包的契约就落在对应的纯函数上）。
 */
interface ContractCase {
  tool: string
  action: WebAction
  args: Record<string, unknown>
  compose?: (raw: unknown) => unknown
  /** 渲染结果里**必须**出现的字串：证明渲染层读的字段真的有值。 */
  mustRender: string
}

const CASES: readonly ContractCase[] = [
  { tool: 'site_open', action: 'open', args: {}, mustRender: SITE },
  { tool: 'site_shot', action: 'shot', args: {}, mustRender: '/tmp/shot-1.png' },
  { tool: 'site_click', action: 'click', args: { selector: '#go' }, mustRender: '#go' },
  { tool: 'site_fill', action: 'fill', args: { selector: '#kw', value: 'CDQ' }, mustRender: '#kw' },
  { tool: 'site_text', action: 'text', args: {}, compose: textOutput, mustRender: '订单编号' },
  { tool: 'site_console', action: 'console', args: {}, compose: consoleOutput, mustRender: '订单行渲染失败' },
]

describe('契约守卫：工具声明的 output.schema 与实际产出的键必须一致', () => {
  const tools = mountTools()

  it('六个工具都注册上了（少一个，这张表就悄悄少守一条）', () => {
    expect([...tools.keys()].sort()).toEqual(CASES.map((item) => item.tool).sort())
  })

  for (const item of CASES) {
    it(`${item.tool}：产出通过自己的 output.schema，且渲染读得到字段`, async () => {
      const def = tools.get(item.tool)
      if (def === undefined) throw new Error(`${item.tool} 没注册上`)

      const outcome = await invokeWebAction({
        request: { target: TARGET, action: item.action, cwd: CWD, ...item.args },
        driver: fakeDriver(),
      })
      if (!outcome.ok) throw new Error(`${item.tool} 被拒了：${outcome.code} ${outcome.message}`)

      const value = item.compose === undefined ? outcome.result : item.compose(outcome.result)
      expect(validate(def.output.schema, value)).toEqual([])

      // 渲染层读错键时不会抛错，只会渲染出一段「看着成功、其实空掉」的话——
      // 所以这里必须检查字串，不能只看有没有抛。
      const rendered = def.output
        .render(item.args, value)
        .map((part) => part.text)
        .join('\n')
      expect(rendered).toContain(item.mustRender)
      expect(rendered).not.toContain('undefined')
    })
  }
})

/* ------------------------------------------------------------------ *
 * 2026-10-02 端到端发现的四条，各钉一颗钉子
 * ------------------------------------------------------------------ */

describe('端到端发现的缺陷：逐条钉住', () => {
  it('click / fill 回显的键是 `selector`（曾写 clicked / filled → 动作生效但报 invalid output）', async () => {
    for (const action of ['click', 'fill'] as const) {
      const outcome = await invokeWebAction({
        request: { target: TARGET, action, cwd: CWD, selector: '#x', value: 'v' },
        driver: fakeDriver(),
      })
      expect(outcome.ok, action).toBe(true)
      if (outcome.ok) expect(Object.keys(outcome.result as object), action).toEqual(['selector'])
    }
  })

  it('拒绝消息带 `[CODE]` 前缀（曾只抛中文散文，agent 无从判断，只能正则猜）', () => {
    const line = denialMessage({
      code: 'OUT_OF_SCOPE',
      message: '当前目录不在目标 w-cdqas 的允许目录内',
      hint: '在目标配置里声明 scopeDirs',
    })
    expect(line.startsWith('[OUT_OF_SCOPE] ')).toBe(true)
    expect(line).toContain('\n恢复路径：在目标配置里声明 scopeDirs')
    // 没有恢复路径时不该凭空多出一行空提示
    expect(denialMessage({ code: 'X_CODE', message: '正文' })).toBe('[X_CODE] 正文')
  })

  it('text 超长时给出 truncated 与**全文**长度（本地夹具太小，端到端没验到这条）', () => {
    const long = 'x'.repeat(SITE_TEXT_MAX + 100)
    const out = textOutput(long)
    expect(out.truncated).toBe(true)
    expect(out.text).toHaveLength(SITE_TEXT_MAX)
    // `length` 必须是全文长度：截断后报截断后的长度等于把「丢了多少」也一起丢了
    expect(out.length).toBe(SITE_TEXT_MAX + 100)
    expect(textOutput('短文本').truncated).toBe(false)
    expect(textOutput(undefined)).toEqual({ text: '', truncated: false, length: 0 })
  })

  it('console 把告警**正文**给出去（曾只给计数：摘要说「告警 1」，正文里找不到那一条）', () => {
    const out = consoleOutput({
      summary: {
        errors: [{ message: { text: '本站错误' } }],
        warnings: [{ message: { text: '本站告警', sourceUrl: SITE } }],
        noise: [{ noiseRule: 'favicon-404' }, { noiseRule: 'page-log' }],
        total: 4,
      },
    })
    expect(out.errorCount).toBe(1)
    expect(out.warningCount).toBe(1)
    expect(out.noiseCount).toBe(2)
    expect(out.warnings).toEqual([`本站告警（${SITE}）`])
    expect(out.errors).toEqual(['本站错误'])
    // 噪声**按规则**拆开：只给「噪声 2」的话，规则误伤真错误也没人看得见
    expect(out.noiseRules).toEqual(['favicon-404 ×1', 'page-log ×1'])
  })

  it('text 的 truncated / length 在渲染文本里**始终可见**（曾只在截断时出现 = 声明了却拿不到）', () => {
    const def = mountTools().get('site_text')
    if (def === undefined) throw new Error('site_text 没注册上')
    const render = (value: unknown): string =>
      def.output
        .render({}, value)
        .map((part) => part.text)
        .join('\n')

    const whole = render({ text: '订单列表', truncated: false, length: 4 })
    expect(whole).toContain('全文 4 字符')
    expect(whole).toContain('未截断')

    const cut = render({ text: 'xxx', truncated: true, length: 4468 })
    expect(cut).toContain('已截断')
    expect(cut).toContain('4468')
    expect(cut).toContain('本次返回前 3 字符')
  })

  it('噪声构成在渲染文本里出现（0 条噪声时不显示这行，免得变成噪声）', () => {
    const def = mountTools().get('site_console')
    if (def === undefined) throw new Error('site_console 没注册上')
    const render = (value: unknown): string =>
      def.output
        .render({}, value)
        .map((part) => part.text)
        .join('\n')
    const base = { errorCount: 0, warningCount: 0, total: 2, errors: [], warnings: [] }

    expect(render({ ...base, noiseCount: 2, noiseRules: ['favicon-404 ×1', 'page-log ×1'] })).toContain(
      '噪声构成：favicon-404 ×1、page-log ×1',
    )
    expect(render({ ...base, noiseCount: 0, noiseRules: [] })).not.toContain('噪声构成')
  })

  it('页面自己的 log/info/debug 落在噪声档，**不计入告警**（否则干净页面凭空报「告警 N」）', async () => {
    const outcome = await invokeWebAction({
      request: { target: TARGET, action: 'console', cwd: CWD },
      driver: fakeDriver(),
    })
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    const out = consoleOutput(outcome.result)
    expect(out.errorCount).toBe(1)
    expect(out.warningCount).toBe(0)
    // `log` 那条进了噪声档（留在报告里备查，但不构成信号），且规则名可核对
    expect(out.noiseCount).toBe(1)
    expect(out.noiseRules).toEqual(['page-log ×1'])
    expect(out.total).toBe(2)
  })
})

/* ------------------------------------------------------------------ *
 * 渲染层：拿到**空值**时不许画成「看着坏了」
 * ------------------------------------------------------------------ */

/**
 * 2026-10-02 第一次把工具指向**真站点**（`mtc.example.com/hcckc-h5`）时读到的：
 *
 * ```
 * 已打开 https://mtc.example.com/hcckc-h5/（标题：）
 * ```
 *
 * 数据是对的——那个 SPA 的 `document.title` **恒为空串**（真机按 500ms 采样 40 次确认）——
 * 但渲染只对 `undefined` 省括号，于是 agent 看到一对空括号，读起来像坏值。
 * 夹具的页面都有标题，所以这一类「空值渲染」在夹具上永远碰不到。
 */
describe('空值渲染：SPA 置空标题时不该画一对空括号', () => {
  const openText = (value: unknown): string => {
    const def = mountTools().get('site_open')
    expect(def, 'site_open 没注册上').toBeDefined()
    return (def as ToolDef).output.render({}, value)[0]?.text ?? ''
  }

  it('title 为空串 / 纯空白 → 当作「没有标题」，整段括号省掉', () => {
    expect(openText({ url: SITE, title: '' })).toBe(`已打开 ${SITE}`)
    expect(openText({ url: SITE, title: '   ' })).toBe(`已打开 ${SITE}`)
    // 负向也钉住：不许出现那对空括号
    expect(openText({ url: SITE, title: '' })).not.toContain('标题')
  })

  it('有标题时照常给出来（别为了空格子把好数据一起省掉）', () => {
    expect(openText({ url: SITE, title: '海关前端' })).toBe(`已打开 ${SITE}（标题：海关前端）`)
    // 首尾空白不带到输出里（标题里有换行会把一行输出撑成多行）
    expect(openText({ url: SITE, title: ' 海关前端\n' })).toContain('（标题：海关前端）')
  })
})
