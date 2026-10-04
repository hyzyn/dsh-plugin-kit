/**
 * **三张配置卡片的「改配置那条路」要有真机 DOM 证据** 的存在性守卫（L0）。
 *
 * ## 它守的是什么
 *
 * [docs/conventions.md § 客户端卡片](../docs/conventions.md#客户端卡片改配置那条路要有真机-dom-证据)
 * 定了口径：能保存配置的卡片，必须有一条真机 DOM 证据——**加行 → 填值 → 勾确认 → 点保存 →
 * HTTP 复核**。三条证据分别在 `verify-{devfront,devdata,devenv}-card.mjs` 里，而这三个脚本
 * **进不了 CI**（要真宿主 + 真 Chrome，见 § 真机脚本与 CI 接线）。
 *
 * 于是「这条路还有没有被验」在 CI 里**没有任何信号**：把那一整段删掉、把原生 setter 换成
 * `input.value = x`、或把 HTTP 复核顺手删掉，**全仓闸门照绿**。这个守卫补的就是这个信号。
 *
 * ## 它守**在不在**，不守**对不对**
 *
 * 判据全是形状（正则），所以它**不能**证明 payload 是对的——那只有真跑那三个脚本才知道。
 * 价值是防漂移：这类区块一旦被删或被改弱，没有别的东西会红。所以这里刻意写得窄而实——
 * 每条判据都对应那三段代码里**真实存在的**形态，且**每条各配一条反例**（在真实源码上做一次
 * 字符串替换，断言检查函数报出对应违规）。静态守卫不许做成恒绿：本仓发生过「命中 0 个文件、
 * 恒绿、拦不住任何东西」的闸门。
 *
 * ## 为什么是 L0（而不是三个包各写一份）
 *
 * 三个脚本分属三个包，而口径是**一条**跨包约定（同一条规矩三处各写一遍必然漂）——
 * 与 `live-scripts-safety.test.ts` 分工的理由相同。
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

/** 去注释（块注释 + 行注释）：判据只看代码，不看解释——解释里会写反面示例。 */
export function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

/** 一张卡片的**形状声明**：没有的显式写出来，而不是让正则碰运气。 */
export interface CardSpec {
  /** 展示用：卡片属于哪个包。 */
  pkg: string
  /** 仓根相对路径。 */
  file: string
  /** 「加一行」那个入口按钮的文案匹配（客户端 i18n 键 `btn.addTarget` / `btn.addSite` 的中文值）。 */
  addLabel: string
  /** 各控件要派的事件：四个文本框的站点点只有 `input`，带下拉的卡片还要 `change`。 */
  valueEvents: readonly string[]
  /** DOM 改完之后必须再发一次的那个配置端点（HTTP 复核）。 */
  api: string
}

export const CARDS: readonly CardSpec[] = [
  {
    pkg: 'devfront',
    file: 'scripts/verify-devfront-card.mjs',
    addLabel: "=== '+ 添加站点'",
    valueEvents: ['input'],
    api: '/api/dsh-devfront/config',
  },
  {
    pkg: 'devdata',
    file: 'scripts/verify-devdata-card.mjs',
    addLabel: "=== '+ 添加目标'",
    valueEvents: ['input', 'change'],
    api: '/api/dsh-devdata/config',
  },
  {
    pkg: 'devenv',
    file: 'scripts/verify-devenv-card.mjs',
    addLabel: "=== '+ 添加目标'",
    valueEvents: ['input', 'change'],
    api: '/api/dsh-devenv/config',
  },
]

/** 违例清单（**纯函数**，喂 fixture 就能造反例）。 */
export function cardDomPathViolations(raw: string, spec: CardSpec): string[] {
  const source = stripComments(raw)
  const problems: string[] = []

  // ① 「加一行」的入口：按**文案**找到那个按钮——点它才会出现那个只在 dirty 时渲染的确认框
  const addAt = source.indexOf(spec.addLabel)
  if (addAt === -1) {
    problems.push(`${spec.pkg}: 没有按文案找「加一行」的按钮（找不到 ${spec.addLabel}）——这条路第一步就没了`)
  }

  // ② React 受控输入：先过**原生 setter** 再派事件；只改 .value 时 React 的 value tracker 不认
  if (!/Object\.getOwnPropertyDescriptor\(\s*window\.HTML(?:Input|Select)Element\.prototype,\s*'value'\s*\)/.test(source)) {
    problems.push(`${spec.pkg}: 没有走原生 value setter（直接改 .value 时提交上去的还是旧值 / 空行）`)
  }
  for (const event of spec.valueEvents) {
    if (!source.includes(`new Event('${event}'`)) {
      problems.push(`${spec.pkg}: 没有派 '${event}' 事件——受控输入的 state 不会变`)
    }
  }

  // ③ 那个只在 dirty 时才渲染的确认框：找到它、点它（不勾确认的保存只会拿到 400）
  if (!/input\[type=["']checkbox["']\][\s\S]{0,300}?\.click\(\)/.test(source)) {
    problems.push(`${spec.pkg}: 没有「找到确认框 → 点它」这一段——不勾确认的保存只会拿到 400`)
  }

  // ④ 保存入口：按文案找按钮再点
  if (!/===\s*'保存'[\s\S]{0,300}?\.click\(\)/.test(source)) {
    problems.push(`${spec.pkg}: 没有「按文案找保存按钮 → 点它」这一段`)
  }

  // ⑤ HTTP 复核必须在**那个 DOM 区块之后**：DOM 那条通过 ≠ payload 对
  //    （2026-10-04 反例实测：扣掉下拉框的 change 事件，DOM 那条照绿，只有这条会红）
  if (addAt === -1 || source.indexOf(spec.api, addAt) === -1) {
    problems.push(`${spec.pkg}: DOM 改完之后没有对 ${spec.api} 的 HTTP 复核——DOM 断言通过 ≠ payload 对`)
  }

  return problems
}

const REPO_ROOT = new URL('../../', import.meta.url)
const read = (file: string): string => readFileSync(new URL(file, REPO_ROOT), 'utf8')

describe('配置卡片的 DOM 路径：三张卡片都得有真机证据（口径见 conventions.md）', () => {
  it('三张卡片都满足五条判据', () => {
    const problems = CARDS.flatMap((spec) => cardDomPathViolations(read(spec.file), spec))
    expect(problems).toEqual([])
  })

  it('扫到的卡片不是空集，且声明的脚本真的存在（恒绿闸门比没有更坏）', () => {
    expect(CARDS.length).toBeGreaterThanOrEqual(3)
    for (const spec of CARDS) expect(read(spec.file).length).toBeGreaterThan(500)
  })
})

/** 反例都打在**真实源码**上：换掉一处形态，断言检查函数报出对应那一条。 */
const devenv = CARDS.find((spec) => spec.pkg === 'devenv')
if (devenv === undefined) throw new Error('CARDS 里没有 devenv 的形状声明')

describe('反例（每条判据各自能被触发）', () => {
  it('反例①：把「加一行」按钮的文案换掉 → 报出来', () => {
    const bad = read(devenv.file).replaceAll("=== '+ 添加目标'", "=== '+ Add'")
    expect(cardDomPathViolations(bad, devenv).join('\n')).toContain('加一行')
  })

  it('反例②：不走原生 setter（改成直接赋 .value）→ 报出来', () => {
    const bad = read(devenv.file).replaceAll('Object.getOwnPropertyDescriptor(', 'Object.getOwnPropDesc(')
    expect(cardDomPathViolations(bad, devenv).join('\n')).toContain('原生 value setter')
  })

  it('反例②b：下拉框不派 change → 报出来（2026-10-04 实测过的那个坏实现）', () => {
    const bad = read(devenv.file).replaceAll("new Event('change'", "new Event('noop'")
    expect(cardDomPathViolations(bad, devenv).join('\n')).toContain("'change' 事件")
  })

  it('反例③：找到确认框却不点它 → 报出来', () => {
    const bad = read(devenv.file).replace('confirm.click()', 'void confirm')
    expect(cardDomPathViolations(bad, devenv).join('\n')).toContain('确认框')
  })

  it('反例④：不点保存 → 报出来', () => {
    const bad = read(devenv.file).replace('save.click()', 'void save')
    expect(cardDomPathViolations(bad, devenv).join('\n')).toContain('保存按钮')
  })

  it('反例⑤：删掉 DOM 之后那次 HTTP 复核 → 报出来（DOM 通过 ≠ payload 对）', () => {
    const bad = read(devenv.file).replace("const get4 = await call('/api/dsh-devenv/config')", 'const get4 = { json: undefined }')
    expect(cardDomPathViolations(bad, devenv).join('\n')).toContain('HTTP 复核')
  })

  it('反例⑥：判据读的是**去注释后**的代码，注释里写对了不算（本仓踩过这一类）', () => {
    const fake = "/* 这里本该有 Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value') */\n"
    const bad = fake + read(devenv.file).replaceAll('Object.getOwnPropertyDescriptor(', 'x(')
    expect(cardDomPathViolations(bad, devenv).join('\n')).toContain('原生 value setter')
  })
})
