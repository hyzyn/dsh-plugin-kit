/**
 * 客户端半体对齐**官方样式规范**的规则（纯逻辑，供 scripts/client-lint.mjs 的检查七 ~ 十六调用）。
 *
 * 规范出处：deepseek-ai/deepseek-harness 的 docs/web-styling.zh.md（组件规则）与
 * docs/ui-radius.zh.md（选择圆角 / 复用 token）。这两份被宿主 ui-primitives / ui-theme 的
 * README 反复引用为 "the authoritative styling rules"——官方**没有 lint 命令**（见 ROADMAP.md
 * 9.7），但规范文档存在，所以这里把它做成静态判据。
 *
 * 与既有检查的分工：
 *   检查四管 [--dsw-* 名字在宿主主题里存不存在]；检查五管 [本包私有属性有没有定义位]；
 *   检查六管 [胶囊配没配 corner-shape]；**本模块管「值对不对」**——发丝线粗细、elevation
 *   组合、圆角档位。三者此前全是零信号：tsc 不查 CSS 值、preview 用假主题、冒烟只断言文案与
 *   控件值。
 *
 * 检查七：中性边框一律 0.5px 发丝线。规范原文「使用中性 --dsw-alias-border-* token 的平面边框
 *   与分割线一律 0.5px……dashed 记号与状态色 border 保持 1px；spinner 圆环经 spec 的显式豁免
 *   保留原宽度」。2026-10-06 实测本仓 10 个客户端半体共 139 处中性 1px solid，宿主侧仅 16 处
 *   （且多为 dashed / 错误态 / 滚动条）——这是本仓与官方观感差异最大的一条。
 *
 * 检查八：高层级表面不许「中性 border + 投影」配对。规范原文「高层级表面……设 border: 0 并使用
 *   box-shadow: var(--dsw-elevation-panel) / -prominent / -soft……不得将 --dsw-alias-border-*
 *   border 与 lv/elevation 投影配对——ui-theme 的 elevation spec 会拒绝」。判据只盯组合
 *   （中性 border 与投影同时出现），不强制「所有浮层都必须 elevation」——后者要判断「这是不是
 *   高层级表面」，正则做不准，交给审阅。
 *
 * 检查九：圆角只许官方六档。规范原文「普通控件和卡片使用具名 token，不新增 10px、14px、18px、
 *   24px 等局部数值」。尺度见 RADIUS_SCALE。胶囊（999px）与正圆（50%）是有意保留的形状，
 *   归检查六，不在此列。
 *
 * 检查十：悬空声明（没有选择器的 `prop: value;`）。浏览器**静默丢弃**它，所以它比一条写错的
 *   声明更坏——连 DevTools 的样式面板都不显示。
 *
 * 检查十一：危险按钮的配色配方。规范没有单列此条，但宿主 `dsh-client-ui-plugin-manager` 的
 *   「卸载」按钮（`Button variant="outline"` 叠 `.danger`）是**唯一**的危险动作样板，本仓
 *   必须与它一致；否则同一个设置页上，插件的「删除」与宿主的「卸载」会呈现出两种观感。
 *   判据覆盖 5 条：红字 / 30% 红描边 / 透明底 / hover 8% 红底 / 能被中性 gray hover 盖住时
 *   的形状与顺序。
 *
 * 检查十二：按钮族对齐宿主 ui-primitives 的 `Button`（Button.module.css 是唯一的按钮原语）。
 *   判据取四条**互相独立**的偏差，每条都对应一个肉眼可见的差异，也每条都能在官方文件里指到出处：
 *     ① 填充 token（info-fill 是强调蓝，不是按钮填充）；
 *     ② 字体大小必须与行高配对（docs/web-styling.zh.md）；
 *     ③ 键盘焦点不许自造私有环（宿主全局 :focus-visible + `--dsw-focus-ring-*`）；
 *     ④ 禁用态 opacity 是 .4（Button.module.css）。
 *   另加一条「同族变体几何一致」——docs/ui-radius.zh.md 明写「填充、描边、ghost、加载中和禁用变体
 *   保持相同尺寸与圆角」，而本仓真实写过 6px 14px 与 5px 12px 两套。
 *
 * 检查十三：文字角色。font-size 必须配 line-height（官方成对值见 TYPOGRAPHY_RULE_HINT），
 *   字重只用 400 / 500 / 600。判据表与出处写在 scanTypographyRoles 上方。
 *
 * 检查十五：输入框（文本框与下拉）按宿主的输入档写：显式 height + token 圆角。
 *   判据表与出处写在 scanInputRecipes 上方。
 *
 * 检查十四：原生控件的「选中态」颜色走宿主的中性 brand，不走强调蓝。宿主 Checkbox 是
 *   `16×16` + `accent-color: var(--dsw-alias-brand-primary)`，Switch 的开启态同样走 brand-primary；
 *   强调蓝（state-business-primary）是宿主给状态与徽标用的。判据表与出处写在 scanAccentColors 上方。
 *
 * 本文件不写 shebang（要被 vitest import，见 scripts/check-kit-pins.mjs 的同款注释）。
 */

import { declValue, maskComments, parseCssRules } from './client-design-tokens.mjs'

/**
 * 官方圆角尺度：值 → token。取自 base.css 的共享数值与 ui-radius 规范表。
 * R4 小细节 / R8 紧凑控件 / R12 标准控件与单行 cell / R16 大控件与分组 / R20 独立内容卡片 /
 * R28 主容器。
 */
export const RADIUS_SCALE = {
  '4px': '--dsw-radius-xs',
  '8px': '--dsw-radius-sm',
  '12px': '--dsw-radius-md',
  '16px': '--dsw-radius-lg',
  '20px': '--dsw-radius-xl',
  '28px': '--dsw-radius-panel',
}

/** 中性边框 token：宿主中性描边，以及本仓私有令牌层对它们的中转。 */
const NEUTRAL_BORDER_TOKEN = /--(?:dsw-alias-border-l[1-4]|dsw-alias-settings-card-stroke|dk-border(?:-strong)?|tt-border(?:-strong)?)/

/** 状态 / 强调色边框：规范允许保持 1px（语义色边框不是中性边框）。 */
const STATUS_BORDER_TOKEN = /--(?:dsw-alias-state-|dk-(?:accent|danger|success|warn)|tt-(?:accent|danger|success|warn))/

/** 尺度外的圆角字面量（规范点名禁止 10/14/18/24px，同族一并拦）。 */
const OFF_SCALE_RADIUS = /border-radius:\s*(?:2px|3px|5px|6px|9px|10px|14px|18px|24px)/

/**
 * 私有圆角令牌的**定义位**也要拦：`--dk-r-sm: 6px` 这种写法让整包控件一起偏紧一格，
 * 而它躲过了只扫 `border-radius:` 声明的首版判据（2026-10-06 实测：docker/tty 的
 * 6/8/10/12 平行尺度就是从这里来的）。
 */
const OFF_SCALE_RADIUS_VAR = /(--(?:[a-z0-9]+-)*r-(?:[a-z0-9]+))\s*:\s*(2px|3px|5px|6px|9px|10px|14px|18px|24px)\b/

/** 投影来源：elevation（新）/ lv 档（旧）/ 本仓私有 shadow 令牌。 */
const SHADOW_SOURCE = /--dsw-elevation-|--dsw-shadow-lv|--(?:dk|tt)-shadow/

/** 命中检查七时要贴的正确写法。 */
export const HAIRLINE_RULE_HINT = '中性边框必须是 0.5px 发丝线（官方 web-styling 组件规则：'
  + '使用中性 --dsw-alias-border-* token 的平面边框与分割线一律 0.5px）。'
  + 'dashed 记号、状态色 border 与 spinner 圆环按规范豁免。'

/** 命中检查八时要贴的正确写法。 */
export const ELEVATION_RULE_HINT = '高层级表面（菜单 / 浮层 / 对话框 / 面板 / 悬浮按钮）应当 '
  + 'border: 0 + box-shadow: var(--dsw-elevation-panel|-prominent|-soft)；'
  + '中性 border 不许与投影同时出现（官方 elevation spec 会拒绝），也不要再用 --dsw-shadow-lv*。'

/** 命中检查九时要贴的正确写法。 */
export const RADIUS_SCALE_RULE_HINT = '圆角只能取官方尺度档位：'
  + '--dsw-radius-xs(R4) / -sm(R8) / -md(R12) / -lg(R16) / -xl(R20) / -panel(R28)；'
  + '不要写 10px / 14px / 18px / 24px 这类局部数值（官方 ui-radius 规范点名禁止）。'
  + '胶囊 999px 与圆点 50% 是有意形状，须配 corner-shape: round（检查六）。'

/**
 * 一个规则是不是 spinner 圆环（画圆 + 给顶边上色 = 转圈）。
 * 规范对 spinner 有显式豁免，故不要求它是发丝线。
 *
 * @param decls - 规则声明块原文。
 * @returns 是 spinner 时 true。
 */
function isSpinnerRing(decls) {
  const radius = declValue(decls, 'border-radius')
  if (radius === undefined) return false
  if (!/(?:^|[\s/])(?:50%|999px)(?:$|[\s/])/.test(radius)) return false
  return declValue(decls, 'border-top-color') !== undefined
}

/**
 * 检查七：报出「中性边框不是 0.5px」的声明。
 *
 * 豁免三类（均有规范依据）：dashed/dotted 记号线、状态色边框、spinner 圆环。
 *
 * @param files - { file, source }[]，同一个包的客户端半体（file 是给人看的相对路径）。
 * @returns { file, line, selector, prop, width, color }[]。
 */
export function scanNonHairlineBorders(files) {
  const findings = []
  for (const { file, source } of files) {
    for (const rule of parseCssRules(source)) {
      for (const prop of ['border', 'border-top', 'border-bottom', 'border-left', 'border-right']) {
        const value = declValue(rule.decls, prop)
        if (value === undefined) continue
        const match = /^([\d.]+)px\s+(solid|dashed|dotted)\s+(.+)$/.exec(value.trim())
        if (match === null) continue
        const width = match[1]
        const style = match[2]
        const color = match[3]
        if (style !== 'solid') continue
        if (!NEUTRAL_BORDER_TOKEN.test(color)) continue
        if (STATUS_BORDER_TOKEN.test(color)) continue
        if (width === '0.5' || width === '.5') continue
        if (isSpinnerRing(rule.decls)) continue
        findings.push({
          file,
          line: rule.line,
          selector: rule.selector,
          prop,
          width: width + 'px',
          color: color.trim(),
        })
      }
    }
  }
  return findings
}

/** 命中检查七时的一行人类可读定位串。 */
export function describeNonHairlineBorder(finding) {
  return '中性边框不是 0.5px 发丝线（' + finding.selector + ' 的 ' + finding.prop + ': '
    + finding.width + ' ' + finding.color.slice(0, 40) + '）'
}

/**
 * 检查八：报出「中性 border 与投影配对」的规则。
 *
 * @param files - { file, source }[]。
 * @returns { file, line, selector, border, shadow }[]。
 */
export function scanBorderWithElevation(files) {
  const findings = []
  for (const { file, source } of files) {
    for (const rule of parseCssRules(source)) {
      const border = declValue(rule.decls, 'border')
      const shadow = declValue(rule.decls, 'box-shadow')
      if (border === undefined || shadow === undefined) continue
      if (!NEUTRAL_BORDER_TOKEN.test(border)) continue
      if (!SHADOW_SOURCE.test(shadow)) continue
      findings.push({
        file,
        line: rule.line,
        selector: rule.selector,
        border: border.trim(),
        shadow: shadow.trim(),
      })
    }
  }
  return findings
}

/** 命中检查八时的一行人类可读定位串。 */
export function describeBorderWithElevation(finding) {
  return '高层级表面同时写了中性 border 与投影（' + finding.selector + '：border='
    + finding.border.slice(0, 30) + ' 与 ' + finding.shadow.slice(0, 40) + '）'
}

/**
 * 检查九：报出尺度外的 border-radius 字面量。
 *
 * 按**行**扫描而不是按规则：border-radius 可能写在注释里（那不算），而 maskComments 保持字节
 * 原位，所以行号仍对得上原文。
 *
 * @param files - { file, source }[]。
 * @returns { file, line, value, suggestion }[]。
 */
export function scanOffScaleRadii(files) {
  const findings = []
  for (const { file, source } of files) {
    maskComments(source).split('\n').forEach((line, index) => {
      const decl = /border-radius:\s*([0-9.]+px)/.exec(line)
      if (decl !== null && OFF_SCALE_RADIUS.test(line)) {
        findings.push({ file, line: index + 1, value: decl[1], suggestion: RADIUS_SCALE[decl[1]], kind: 'declaration' })
        return
      }
      const def = OFF_SCALE_RADIUS_VAR.exec(line)
      if (def !== null) {
        findings.push({ file, line: index + 1, value: def[2], suggestion: RADIUS_SCALE[def[2]], kind: 'token', token: def[1] })
      }
    })
  }
  return findings
}

/** 命中检查九时的一行人类可读定位串。 */
export function describeOffScaleRadius(finding) {
  const where = finding.kind === 'token' ? '令牌 ' + finding.token + ' 定义为 ' : ''
  return '圆角用了官方尺度外的字面量（' + where + finding.value
    + '，应取 --dsw-radius-{xs,sm,md,lg,xl,panel} 之一）'
}

/**
 * 闸门自证：统计「中性边框」「具名 token 圆角」「危险按钮」的命中数。
 * 本仓明令——只会在 0 命中时绿的检查等于没有检查，通过行要打出这三个数。
 *
 * @param files - { file, source }[]。
 * @returns { borders, tokenRadii, dangerButtons }。
 */
export function scanStyleSpecTotals(files) {
  let borders = 0
  let tokenRadii = 0
  const dangerClasses = new Set()
  for (const { source } of files) {
    for (const rule of parseCssRules(source)) {
      for (const cls of classTokensOf(rule.selector)) {
        if (DANGER_BUTTON_CLASS.test(cls)) dangerClasses.add(cls)
      }
      for (const prop of ['border', 'border-top', 'border-bottom', 'border-left', 'border-right']) {
        const value = declValue(rule.decls, prop)
        if (value === undefined) continue
        const match = /^[\d.]+px\s+solid\s+(.+)$/.exec(value.trim())
        if (match === null) continue
        if (!NEUTRAL_BORDER_TOKEN.test(match[1])) continue
        borders += 1
      }
      const radius = declValue(rule.decls, 'border-radius')
      if (radius !== undefined && /^var\(--dsw-radius-/.test(radius.trim())) tokenRadii += 1
    }
  }
  return { borders, tokenRadii, dangerButtons: dangerClasses.size }
}

/**
 * 检查十：**悬空声明**（没有选择器的 `prop: value;`）。
 *
 * 浏览器会**静默丢弃**它——不报错、不进 DevTools 的样式面板，效果只是「那条声明不存在」。
 * 2026-10-06 实测：一次批量替换把 `.dk_btnPrimary:hover {` 整行吃掉，留下裸的
 * `background: var(--dsw-alias-button-primary-hover);`，于是主按钮的 hover 悄悄退回
 * `.dk_btn:hover` 的灰色——面板上看起来「就是没做 hover」，查不到任何线索。
 *
 * 只扫**真 `.css` 文件**：内联在 JS 字符串里的 CSS 与 JS 的花括号混在一起，深度跟踪会误判。
 */
export const DANGLING_DECL_RULE_HINT = 'CSS 里出现了没有选择器的悬空声明——浏览器会**静默丢弃**它，'
  + '效果等于那条声明不存在（既不报错也不出现在 DevTools 的样式面板里）。'
  + '通常是批量替换吃掉了上一条规则的 `{` 或整行选择器。'

/**
 * 检查十：报出深度 0 上的声明行。
 *
 * @param files - `{ file, source }[]`。
 * @returns `{ file, line, text }[]`。
 */
export function scanDanglingDeclarations(files) {
  const findings = []
  for (const { file, source } of files) {
    if (!file.endsWith('.css')) continue // 见上方注释：内联 CSS 不适用深度跟踪
    let depth = 0
    maskComments(source).split('\n').forEach((line, index) => {
      const text = line.trim()
      if (depth === 0 && /^[a-z-]+\s*:\s*[^;{]+;$/i.test(text)) {
        findings.push({ file, line: index + 1, text })
      }
      for (const ch of line) {
        if (ch === '{') depth += 1
        else if (ch === '}') depth -= 1
      }
    })
  }
  return findings
}

/** 命中检查十时的一行人类可读定位串。 */
export function describeDanglingDeclaration(finding) {
  return '悬空声明（没有选择器）：' + finding.text.slice(0, 60)
}

/* ------------------------------------------------------------------ *
 * 检查十一：危险按钮必须用官方的 danger 配方
 * ------------------------------------------------------------------ */

/**
 * 危险按钮的**类名口径**：`btnDanger` 要占一个完整的连字符/下划线分段（`.env_btnDanger` 符合，
 * `.dk_iconBtnDanger` 与 `.mX_linkBtn[data-danger]` 不符合）。
 *
 * 这不是抠字眼：官方只给**描边危险按钮**定义了配方，图标按钮（只上色、不要框）与链接式危险
 * 动作（红字即正确）本来就不该长成描边按钮。把口径收窄，这两类才不会被误报。
 */
const DANGER_BUTTON_CLASS = /(?:^|[-_])btnDanger$/

/** 宿主里「错误色」的权威 token。包内把 `state-error-primary` 起个别名的（如 docker 的 --dk-danger）也算。 */
const HOST_DANGER_TOKEN = '--dsw-alias-state-error-primary'

/** 命中检查十一时要贴的正确写法。 */
export const DANGER_BUTTON_RULE_HINT = '危险按钮（删除 / 撤销 / 卸载这类不可逆动作）要与宿主官方一致：'
  + '透明底 + 红字 var(--dsw-alias-state-error-primary) + '
  + 'border-color: color-mix(in srgb, var(--dsw-alias-state-error-primary) 30%, transparent) + '
  + '悬停时 background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 8%, transparent)。'
  + '宿主 dsh-client-ui-plugin-manager 的 Button variant="outline" 叠 .danger 就是这么写的——它把 --dsw-alias-interactive-bg-hover '
  + '重绑成 8% 红，于是 hover 从灰色变成红色。要做实心红按钮请另起类名（如 btnDangerSolid）：'
  + '同名混用会让插件的「删除」看起来只是普通次要按钮，而宿主的「卸载」是红框。'

/** 取选择器里出现的全部类名（`.a .b:hover` → ['a','b']）。 */
function classTokensOf(selector) {
  return [...String(selector).matchAll(/\.([A-Za-z0-9_-]+)/g)].map((match) => match[1])
}

/** 去掉伪类 / 伪元素，留下基础选择器（`.a:hover` → `.a`）。 */
function selectorStem(selector) {
  const cut = String(selector).indexOf(':')
  return cut === -1 ? String(selector) : String(selector).slice(0, cut)
}

/** 正则转义。 */
function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 收集「算作危险色」的 token 名：宿主权威 token + 本包内**定义为它**的别名。
 *
 * docker 写的是 `var(--dk-danger)`，而 `--dk-danger: var(--dsw-alias-state-error-primary, #d1242f)`——
 * 不做这层展开，判据就会把 docker 这个已经改对的样板判成违规。
 *
 * @param files - `{ file, source }[]`。
 * @returns 能匹配任一危险色 token 的正则。
 */
function dangerTokenPattern(files) {
  const names = new Set([HOST_DANGER_TOKEN])
  for (const { source } of files) {
    for (const match of maskComments(source).matchAll(/(--[A-Za-z0-9-]+)\s*:\s*([^;{}]*state-error-primary[^;{}]*)/g)) {
      names.add(match[1])
    }
  }
  return new RegExp('(?:' + [...names].map(escapeRegExp).join('|') + ')(?![\\w-])')
}

/**
 * 检查十一：报出没按官方配方写的危险按钮。
 *
 * 五条判据（每条都对应一个**看得见**的差异）：
 *   color    —— 红字（不是 `X_btnDanger` 只写个颜色就完事）
 *   border   —— 30% 红描边（宿主 `.danger` 覆盖的正是 border-color；0% 就退化成中性灰框）
 *   fill     —— 透明底（实心/不透明底会让按钮从所在行里「浮」出来，这是用户截图里的主因）
 *   hairline —— 若写了 border 简写，宽度必须是 0.5px（中性发丝线，见检查七）
 *   hover    —— hover 必须把底色换成 8% 红（否则它吃的是中性灰 hover，观感与宿主不同）
 *
 * 另加一条**级联**判据：包内若有配对的 `*Ghost` 类（`.env_btnGhost`），它的
 * `:hover:not(:disabled)` 权重与危险按钮的 hover **相同**，于是源码顺序决定胜负——危险按钮的
 * hover 规则必须写在它的后面，且带上同样的 `:not(:disabled)`。少了这层，红色会被灰色盖掉。
 *
 * @param files - `{ file, source }[]`。
 * @returns `{ file, line, cls, code, detail }[]`。
 */
export function scanDangerButtonRecipes(files) {
  const findings = []
  const dangerToken = dangerTokenPattern(files)

  for (const { file, source } of files) {
    const rules = parseCssRules(source)
    const groups = new Map()
    for (const rule of rules) {
      for (const cls of classTokensOf(rule.selector)) {
        if (!DANGER_BUTTON_CLASS.test(cls)) continue
        const group = groups.get(cls) ?? { cls, base: undefined, hover: undefined }
        const hasColor = declValue(rule.decls, 'color') !== undefined
        if (rule.selector.includes(':hover')) {
          const hasBackground = declValue(rule.decls, 'background') !== undefined
            || declValue(rule.decls, 'background-color') !== undefined
          if (hasBackground && group.hover === undefined) group.hover = rule
        } else if (hasColor && group.base === undefined && !rule.selector.includes(':')
          && selectorStem(rule.selector).includes('.' + cls)) {
          /*
           * 基础规则必须**不带任何伪类**：`.a_btnDanger:disabled{color:red}` 只描述禁用态，
           * 拿它当基础规则等于「靠禁用态蒙混过关」——静息按钮其实一点红色都没有。
           */
          group.base = rule
        }
        groups.set(cls, group)
      }
    }

    for (const group of groups.values()) {
      const anchor = group.base ?? group.hover
      if (anchor === undefined) continue
      const add = (code, detail) => findings.push({ file, line: anchor.line, cls: group.cls, code, detail })

      if (group.base === undefined) {
        add('missing-base', '没有基础规则——危险按钮的类名没有定义位，等于普通按钮')
        continue
      }

      const decls = group.base.decls
      const color = declValue(decls, 'color')
      if (color === undefined || !dangerToken.test(color)) {
        add('color', '没写危险色（应为 var(--dsw-alias-state-error-primary)）')
      }

      const shorthand = declValue(decls, 'border')
      const width = shorthand === undefined ? undefined : /^([\d.]+)px\s+(?:solid|dashed|dotted)\b/.exec(shorthand.trim())
      if (width !== null && width !== undefined && width[1] !== '0.5' && width[1] !== '.5') {
        add('hairline', 'border 简写的宽度是 ' + width[1] + 'px，发丝线应为 .5px')
      }

      const border = declValue(decls, 'border-color') ?? declValue(decls, 'border')
      if (border === undefined || !dangerToken.test(border)) {
        add('border', '描边不是危险色（宿主 .danger 覆盖的就是 border-color）')
      } else if (!/\b30%/.test(border)) {
        add('border', '描边浓度不是官方的 30%（' + border.trim().slice(0, 50) + '）')
      }

      const fill = declValue(decls, 'background') ?? declValue(decls, 'background-color')
      if (fill !== undefined && !/^(?:none|transparent|0 0|unset|initial)$/.test(fill.trim())) {
        add('fill', '底色不是透明（' + fill.trim().slice(0, 50) + '）——不透明底会让按钮从所在行里浮出来')
      }

      const background = group.hover === undefined
        ? undefined
        : declValue(group.hover.decls, 'background') ?? declValue(group.hover.decls, 'background-color')
      if (background === undefined || !dangerToken.test(background)) {
        add('hover', '没有「悬停变红」的规则——它会吃到中性灰 hover，与宿主观感不同')
      } else if (!/\b8%/.test(background)) {
        add('hover', '悬停底色不是官方的 8%（' + background.trim().slice(0, 50) + '）')
      }

      const ghost = group.cls.replace(/btnDanger$/, 'btnGhost')
      if (ghost !== group.cls) {
        const ghostHover = rules.find((rule) => rule.selector.includes(':hover')
          && classTokensOf(rule.selector).includes(ghost)
          && (declValue(rule.decls, 'background') !== undefined || declValue(rule.decls, 'background-color') !== undefined))
        if (ghostHover !== undefined && group.hover !== undefined) {
          const ghostIsGuarded = ghostHover.selector.includes(':not(:disabled)')
          if (ghostIsGuarded && !group.hover.selector.includes(':not(:disabled)')) {
            add('cascade', '.' + ghost + ':hover 带 :not(:disabled)（权重 (0,3,0)）而本条没有——'
              + '危险按钮的 hover 会被灰色盖掉')
          }
          if (group.hover.line < ghostHover.line) {
            add('order', '本规则写在 .' + ghost + ':hover 之前（第 ' + String(ghostHover.line)
              + ' 行）——同权重下后者取胜，红色会被灰色盖掉')
          }
        }
      }
    }
  }

  return findings
}

/** 命中检查十一时的一行人类可读定位串。 */
export function describeDangerButton(finding) {
  return '危险按钮 .' + finding.cls + ' 不符合官方 danger 配方：' + finding.detail
}

/* ------------------------------------------------------------------ *
 * 检查十二：按钮族要对齐宿主官方的 Button
 * ------------------------------------------------------------------ */

/**
 * 按钮类的识别口径：类名里带 `btn` / `Btn` 就算按钮族。
 *
 * 收得宽一点是有意的——这套判据管的是「按钮该长什么样」，而本仓所有按钮类名都带这个标记；
 * 反过来，漏掉一个按钮类就等于让它的观感悄悄漂回自定义尺寸。
 */
const BUTTON_CLASS = /btn/i

/** 按钮族的「变体」白名单：只有这几档算同一族的并列变体（尺寸必须逐项一致）。 */
const BUTTON_VARIANT = new Set(['', 'ghost', 'primary', 'danger', 'solid'])

/** 判定按钮焦点环时认的私有 ring 令牌（`--dk-ring` / `--tt-ring` 这类）。 */
const PRIVATE_RING = /--(?:[a-z0-9]+-)+ring\b/

/** 命中检查十二时要贴的正确写法。 */
export const BUTTON_RECIPE_RULE_HINT = '按钮族必须对齐宿主 ui-primitives 的 Button（Button.module.css）：'
  + '① 填充变体用 --dsw-alias-button-primary-fill / -hover；--dsw-alias-button-info-fill 是**强调蓝**'
  + '（宿主拿它当徽标与圆形发送键的颜色），不是按钮填充。'
  + '② 同一族的填充 / 描边 / ghost 变体**尺寸逐项一致**，并按官方 size 变体取尺：'
  + 'sm = height:28px / padding:0 10px / font-size:12px / line-height:18px / var(--dsw-radius-sm)，'
  + 'md = height:36px / padding:0 14px / font-size:14px / line-height:22px / var(--dsw-radius-md)。'
  + '③ 官方规范明写「字体大小必须与行高配对」，按钮也不豁免。'
  + '④ 禁用态是 opacity:.4 + cursor:not-allowed（不是 .45 / .5）。'
  + '⑤ 键盘焦点不要自造：宿主 51 处组件用的是 '
  + 'outline: var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary))，'
  + '不要写 outline:none 配一个私有 box-shadow 环——那会把宿主全局的 :focus-visible 一起顶掉。'

/**
 * 拆出按钮类的「族」与「变体」：`env_btnGhost` → { family: 'env_', variant: 'ghost' }。
 *
 * 变体不在白名单里的（`.rss_btnIcon`、`.cg_btnBusy`）返回 undefined —— 图标按钮与按钮内的
 * 忙碌容器各有自己的尺寸，不该被「同族尺寸一致」这条卷进来。
 *
 * @param cls - 类名（不含点）。
 * @returns `{ family, variant }` 或 undefined。
 */
function buttonFamilyOf(cls) {
  const match = /^(.*?)(?:btn|Btn)([A-Za-z0-9]*)$/.exec(cls)
  if (match === null) return undefined
  const variant = match[2].toLowerCase()
  if (!BUTTON_VARIANT.has(variant)) return undefined
  return { family: match[1], variant }
}

/** 一条按钮规则里、同族之间必须一致的那几个几何声明。 */
const BUTTON_GEOMETRY = ['height', 'padding', 'font-size', 'line-height', 'border-radius']

/**
 * 检查十二：报出没对齐宿主 Button 的按钮规则。
 *
 * @param files - `{ file, source }[]`。
 * @returns `{ file, line, selector, code, detail }[]`。
 */
export function scanButtonRecipes(files) {
  const findings = []
  for (const { file, source } of files) {
    /** family → { props: Map<prop, {value, line, selector}> } */
    const families = new Map()
    for (const rule of parseCssRules(source)) {
      const buttons = classTokensOf(rule.selector).filter((cls) => BUTTON_CLASS.test(cls))
      if (buttons.length === 0) continue
      const isFocus = rule.selector.includes(':focus-visible')
      const add = (code, detail) => findings.push({ file, line: rule.line, selector: rule.selector, code, detail })

      const background = declValue(rule.decls, 'background') ?? declValue(rule.decls, 'background-color')
      if (background !== undefined && /--dsw-alias-button-info-(?:fill|hover)/.test(background)) {
        add('fill-token', '按钮底色用了强调蓝 ' + background.trim().slice(0, 44)
          + '——官方的填充变体是 --dsw-alias-button-primary-fill / -hover')
      }

      const fontSize = declValue(rule.decls, 'font-size')
      if (fontSize !== undefined && declValue(rule.decls, 'line-height') === undefined) {
        add('line-height', '写了 font-size:' + fontSize.trim() + ' 却没有配 line-height'
          + '（官方规范：字体大小必须与行高配对）')
      }

      if (isFocus) {
        const outline = declValue(rule.decls, 'outline')
        const shadow = declValue(rule.decls, 'box-shadow')
        if (outline !== undefined && /^none\b/.test(outline.trim())) {
          add('focus', '焦点态写 outline:none，把宿主的全局 :focus-visible 顶掉了')
        }
        if (shadow !== undefined && PRIVATE_RING.test(shadow)) {
          add('focus', '焦点环用了私有 box-shadow（' + shadow.trim().slice(0, 40)
            + '）——宿主组件用的是 outline + --dsw-focus-ring-*')
        }
      }

      if (rule.selector.includes(':disabled')) {
        const opacity = declValue(rule.decls, 'opacity')
        if (opacity !== undefined && !/^(?:\.?4|1|0\.4)$/.test(opacity.trim())) {
          add('disabled', '禁用态 opacity:' + opacity.trim() + '，官方 .button:disabled 是 .4'
            + '（忙碌态要保持可见时写 1）')
        }
      }

      /*
       * 同族几何一致：只比「无伪类、且选择器里就这一个类」的变体规则。
       * 伪类（:hover）与上下文覆盖（`.tt_toolGroup .tt_toolBtn` 把工具栏按钮压到 H24）都是
       * **同一变体在别处的局部尺寸**，不是并列变体——把它们算进来会误报。
       */
      if (rule.selector.includes(':')) continue
      if (classTokensOf(rule.selector).length !== 1) continue
      for (const cls of buttons) {
        const family = buttonFamilyOf(cls)
        if (family === undefined) continue
        const bucket = families.get(family.family) ?? new Map()
        for (const prop of BUTTON_GEOMETRY) {
          const value = declValue(rule.decls, prop)
          if (value === undefined) continue
          const seen = bucket.get(prop)
          if (seen === undefined) bucket.set(prop, { value: value.trim(), line: rule.line, selector: rule.selector })
          else if (seen.value !== value.trim()) {
            add('variant-geometry', '同族变体的 ' + prop + ' 不一致：' + seen.selector + ' 是 '
              + seen.value + '，本条是 ' + value.trim()
              + '（官方：填充 / 描边 / ghost / 禁用变体保持相同尺寸与圆角）')
          }
        }
        families.set(family.family, bucket)
      }
    }
  }
  return findings
}

/** 命中检查十二时的一行人类可读定位串。 */
export function describeButtonRecipe(finding) {
  return '按钮规则不符合官方 Button 配方（' + finding.selector + '）：' + finding.detail
}

/* ------------------------------------------------------------------ *
 * 检查十三：文字要对齐宿主的排版角色
 * ------------------------------------------------------------------ */

/**
 * 官方排版角色表（逐条抄自宿主自己的设置类组件，不是猜的）：
 *
 * | 角色 | 官方写法 | 出处 |
 * |---|---|---|
 * | 页面 / 卡片大标题 | 20px / 500 / 28px | plugin-manager `pageTitle`·`detailTitle` |
 * | 区块 / 卡片 / 行标题 | 14px / 500 / 20–22px | `cardTitle`·`sectionTitle`·`rowName` |
 * | 行 id 与等宽值 | 13.5px / 500 / 20px | `rowId` |
 * | 次级标题 | 13px / 500 / 20px | `guideTitle`·`registryTitle` |
 * | 正文 / 描述 | 13px / 400 / 18–20px | `cardDesc`·`subjectDesc` |
 * | 提示 hint | 12px / 400 / 18px | `guideHint`·`registryHint`·`advancedHint` |
 * | 字段标签 | 12px / 500 / 18px | settings-models `fieldLabel` |
 * | 徽标 | 10–11px / 500–600 / 16–18px | `statusTag`·user-questions badge |
 *
 * 两条判据：
 *   ① `font-size` 必须与 `line-height` 成对（docs/web-styling.zh.md 组件规则：
 *      「字体大小必须与行高配对；已有角色匹配时使用主题排版变量」）。2026-10-06 实测本仓
 *      323 条声明 font-size 的规则里有 **212 条没有行高**——单行时看不出来，一旦换行就
 *      挤在一起，与宿主那种「13/20、12/18」的稳定节奏完全不同。
 *   ② 不许 `font-weight: 700` / `bold`：宿主自家组件（pageTitle / cardTitle / rowName /
 *      fieldLabel …）用的字重只有 400 / 500 / 600，700 只在它打包进来的 Chrome DevTools
 *     前端 CSS 里出现。本仓 19 处 700 让卡片的标题比整页的标题都重。
 */
export const TYPOGRAPHY_RULE_HINT = '文字要与宿主的排版角色一致：① font-size 必须配 line-height'
  + '（官方成对值：10→14 / 11→16 / 12→18 / 12.5→18 / 13→20 / 13.5→20 / 14→20 / 15→22 / 16→24 / 18→26 / 20→28）；'
  + '② 字重只有 400（正文/提示）/ 500（标题·行名·字段标签）/ 600（强调：弹窗标题、选中态、告警标题），'
  + '**不要用 700 或 bold**——宿主自家组件的标题都是 500，700 会盖过整页的层级。'
  + '出处：宿主 dsh-client-ui-plugin-manager / settings-models 的组件 CSS，以及 docs/web-styling.zh.md。'

/**
 * 检查十三：报出没配行高的 font-size，以及 700 / bold 字重。
 *
 * @param files - `{ file, source }[]`。
 * @returns `{ file, line, selector, code, detail }[]`。
 */
export function scanTypographyRoles(files) {
  const findings = []
  for (const { file, source } of files) {
    for (const rule of parseCssRules(source)) {
      const fontSize = declValue(rule.decls, 'font-size')
      if (fontSize !== undefined && declValue(rule.decls, 'line-height') === undefined) {
        findings.push({
          file,
          line: rule.line,
          selector: rule.selector,
          code: 'line-height',
          detail: 'font-size:' + fontSize.trim() + ' 没有配 line-height',
        })
      }
      const weight = declValue(rule.decls, 'font-weight')
      if (weight !== undefined && /^(?:700|bold|bolder)$/.test(weight.trim())) {
        findings.push({
          file,
          line: rule.line,
          selector: rule.selector,
          code: 'weight',
          detail: 'font-weight:' + weight.trim() + '（宿主 UI 文本只用 400 / 500 / 600，标题是 500）',
        })
      }
    }
  }
  return findings
}

/** 命中检查十三时的一行人类可读定位串。 */
export function describeTypographyRole(finding) {
  return '排版角色不符合官方：' + finding.selector + ' 的 ' + finding.detail
}

/**
 * 闸门自证：数一遍被检查十三扫到的 font-size 声明（0 命中 = 这条检查没在扫东西）。
 *
 * @param files - `{ file, source }[]`。
 * @returns 声明了 font-size 的规则数。
 */
export function scanFontSizeSites(files) {
  let total = 0
  for (const { source } of files) {
    for (const rule of parseCssRules(source)) {
      if (declValue(rule.decls, 'font-size') !== undefined) total += 1
    }
  }
  return total
}


/**
 * 闸门自证：数一遍被检查十二扫到的按钮类（0 命中 = 这条检查没在扫东西）。
 *
 * @param files - `{ file, source }[]`。
 * @returns 去重后的按钮类名数组。
 */
export function scanButtonClasses(files) {
  const classes = new Set()
  for (const { source } of files) {
    for (const rule of parseCssRules(source)) {
      for (const cls of classTokensOf(rule.selector)) {
        if (BUTTON_CLASS.test(cls)) classes.add(cls)
      }
    }
  }
  return [...classes].sort()
}

/* ------------------------------------------------------------------ *
 * 检查十四：复选框的「选中态」颜色走宿主的中性 brand，不走强调蓝
 * ------------------------------------------------------------------ */

/**
 * 宿主官方配方（逐条抄自 `dsh-client-ui-primitives/lib/`）：
 *
 * | 控件 | 官方写法 | 出处 |
 * |---|---|---|
 * | Checkbox | `width:16px; height:16px; accent-color: var(--dsw-alias-brand-primary)` | `Checkbox.module.css` |
 * | Switch 开启态 | `background: var(--dsw-alias-brand-primary)` | `Switch.module.css` |
 *
 * 在这个主题里 `--dsw-alias-brand-primary` = neutral-bluish-1000（浅色 `#0f1115` 近黑、深色近白），
 * 而 `--dsw-alias-state-business-primary` = deepseek-500 `#4176e6`（强调蓝）——宿主把强调蓝留给
 * **状态与徽标**（Tag 的 info 档、StateDot、进度条、焦点环），控件的「选中 / 开启」是单色 brand。
 *
 * 2026-10-06 实测截图（DPR 2）：本仓渠道列表的复选框画成 `#4176e6` 的蓝勾、14×14，而同一行的
 * 名称文字是 `#0f1115`。共 5 条规则踩这个坑（docker 的 `--dk-accent` 与 tty 的 `--tt-accent` 都被
 * 定义成 business-primary），尺寸还各写各的（14 / 15 / UA 默认 13）。这与「按钮填充误用 info-fill」
 * 是同一个根因：把强调色当成了主色。两条判据：
 *   ① 任何 `accent-color` 都必须是 `var(--dsw-alias-brand-primary)`；
 *   ② 复选框规则声明了 width/height 时必须是 16px（宿主 Checkbox 的尺寸）。
 */
export const ACCENT_COLOR_RULE_HINT = '复选框 / 开关这类原生控件的「选中态」要走宿主的中性 brand：'
  + '`accent-color: var(--dsw-alias-brand-primary)`，尺寸 16×16。'
  + '`--dsw-alias-state-business-primary`（强调蓝 #4176e6）是宿主给状态与徽标用的，不是控件的选中态'
  + '——宿主的 Checkbox 与 Switch 开启态都走 brand-primary。'
  + '出处：dsh-client-ui-primitives/lib/Checkbox.module.css 与 Switch.module.css。'

/** 宿主 Checkbox 的选中色与尺寸（Checkbox.module.css）。 */
const HOST_ACCENT_COLOR = 'var(--dsw-alias-brand-primary)'
const HOST_CHECKBOX_SIZE = '16px'

/**
 * 复选框候选：选择器里出现 `checkbox`（`input[type=checkbox]` 与 `.tt_cardCheckbox` 都算）。
 *
 * 刻意不用 `input` 当关键字：文本框（`.rss_input`）的尺寸该按输入档判，混进来就会要求 16px。
 */
const CHECKBOX_SELECTOR = /checkbox/iu

/**
 * 检查十四：报出 accent-color 不是 brand-primary 的声明，以及尺寸不是 16px 的复选框。
 *
 * @param files - `{ file, source }[]`。
 * @returns `{ file, line, selector, code, detail }[]`。
 */
/**
 * 复选框的**标记点**：源码里出现 type:'checkbox' / type="checkbox" 的位置。
 *
 * 为什么要扫标记而不是只扫 CSS：检查十四 ② 只能看见「已经写了 accent-color 的规则」，
 * 于是**完全没被样式碰过**的复选框（浏览器 UA 的蓝勾）整类漏网——2026-10-06 实测 12 处
 * （rss 2 / prompt 1 / mcp 3 / env 1 / codegraph 4 / tty 1），用户截图里那个 #0275ff 的勾
 * 就是其中之一。判据因此必须从**标记侧**出发：有标记，就必须有一条带 accent-color 的规则管到它。
 *
 * 两个排除：
 *   · `.css` 文件不是标记（选择器里也会出现 type=checkbox）；
 *   · JS 里那些 CSS 规则行（以引号 + `.` 开头，例如 `'.a input[type=checkbox]{…}'`）也不是标记。
 */
const CHECKBOX_MARKUP = /type\s*[:=]\s*["']checkbox/

/** 一行是不是「CSS 规则行」（本仓的客户端 CSS 都是每行一条 `.sel{…}` 字符串）。 */
const CSS_RULE_LINE = /^["'\u0060]?\.[A-Za-z_]/

/**
 * 收集一行里的 class / className 取值。
 *
 * @param line - 源码的一行。
 * @returns 类名数组。
 */
function classesOnLine(line) {
  const found = []
  for (const match of String(line).matchAll(/class(?:Name)?\s*[:=]\s*["']([^"'\\]*)["']/g)) {
    for (const cls of match[1].split(/\s+/)) if (cls !== '') found.push(cls)
  }
  return found
}

/**
 * 扫出全部复选框标记点及其**候选容器类**。
 *
 * 候选类取三个窗口的并集：本行、后 2 行、前 6 行。窗口开这么大是因为标记的形状有三种：
 *   ① HTML 字符串：`'<label class="pM_checkRow"><input type="checkbox" …'`（本行）；
 *   ② JSX：`jsx('input', { type: 'checkbox', className: 'tt_cardCheckbox' })`（本行）；
 *   ③ 命令式 DOM：`const c = document.createElement('input')` / `c.type = 'checkbox'` /
 *      `c.className = 'tt_cardCheckbox'`（**后一行**——只往前看会把它误判成未覆盖）。
 *
 * @param files - `{ file, source }[]`。
 * @returns `{ file, line, classes }[]`。
 */
export function scanCheckboxMarkup(files) {
  const sites = []
  for (const { file, source } of files) {
    if (file.endsWith('.css')) continue
    const lines = String(source).split('\n')
    lines.forEach((text, index) => {
      if (!CHECKBOX_MARKUP.test(text)) return
      if (CSS_RULE_LINE.test(text.trim())) return
      const classes = new Set(classesOnLine(text))
      for (let j = index - 1; j >= Math.max(0, index - 6); j--) {
        for (const cls of classesOnLine(lines[j])) classes.add(cls)
      }
      for (let j = index + 1; j <= Math.min(lines.length - 1, index + 2); j++) {
        for (const cls of classesOnLine(lines[j])) classes.add(cls)
      }
      sites.push({ file, line: index + 1, classes: [...classes] })
    })
  }
  return sites
}

export function scanAccentColors(files) {
  const findings = []
  /*
   * 覆盖子句（③）：有复选框标记，就必须有一条声明了 accent-color 的规则管到它（详见
   * scanCheckboxMarkup 上方的注释——「完全没被样式碰过」的那一类只能从标记侧发现）。
   * 豁免：本包若写了**不带类的兜底规则**（裸 input[type=checkbox]{…}），就认为全包已覆盖。
   */
  const coveredClasses = new Set()
  let hasCatchAll = false
  let hasCheckboxRule = false
  for (const { source } of files) {
    for (const rule of parseCssRules(source)) {
      /*
       * 复选框规则的识别口径是**选择器里出现 checkbox**：既有 input[type=checkbox] 那种，
       * 也有 tty 那种把类挂在 input 自己身上的 .tt_cardCheckbox{…accent-color…}。
       * 只看前者时，tty 那 11 个已经写对的站点会被整片误报。
       */
      const isCheckboxRule = /checkbox/i.test(rule.selector)
      if (isCheckboxRule && /input\s*\[?\s*type\s*=\s*["']?checkbox/i.test(rule.selector)
        && classTokensOf(rule.selector).length === 0) hasCatchAll = true
      if (declValue(rule.decls, 'accent-color') === undefined) continue
      if (!isCheckboxRule) continue
      hasCheckboxRule = true
      for (const cls of classTokensOf(rule.selector)) coveredClasses.add(cls)
    }
  }
  if (!hasCatchAll) {
    for (const site of scanCheckboxMarkup(files)) {
      /*
       * 两种判定：
       *   · 本包**一条复选框规则都没有**（hasCheckboxRule 为假）→ 每个标记点都报；
       *   · 有规则时，只在**取到了候选类且都没被覆盖**时报。取不到候选类的站点（标记与它所在容器的
       *     class 不在同一段源码里，例如 docker 的 capabilityCheck 由外层函数套 .dk_capRow）
       *     判为「看不出来」而不是「违规」——假阳性会把闸门逼成噪声，最后一定被人削弱。
       */
      if (hasCheckboxRule && site.classes.length === 0) continue
      if (site.classes.some((cls) => coveredClasses.has(cls))) continue
      findings.push({
        file: site.file,
        line: site.line,
        selector: site.classes.length === 0 ? '(无容器类)' : '.' + site.classes.slice(0, 2).join(' / .'),
        code: 'uncovered',
        detail: '这个复选框没有任何带 accent-color 的规则管到它——浏览器会用 UA 的蓝勾（#0275ff）',
      })
    }
  }
  for (const { file, source } of files) {
    for (const rule of parseCssRules(source)) {
      const accent = declValue(rule.decls, 'accent-color')
      if (accent !== undefined && accent !== HOST_ACCENT_COLOR) {
        findings.push({
          file,
          line: rule.line,
          selector: rule.selector,
          code: 'accent',
          detail: 'accent-color:' + accent + '（宿主 Checkbox 用 ' + HOST_ACCENT_COLOR + '）',
        })
      }
      if (!CHECKBOX_SELECTOR.test(rule.selector)) continue
      for (const prop of ['width', 'height']) {
        const value = declValue(rule.decls, prop)
        if (value !== undefined && value !== HOST_CHECKBOX_SIZE) {
          findings.push({
            file,
            line: rule.line,
            selector: rule.selector,
            code: 'size',
            detail: prop + ':' + value + '（宿主 Checkbox 是 ' + HOST_CHECKBOX_SIZE + '）',
          })
        }
      }
    }
  }
  return findings
}

/** 命中检查十四时的一行人类可读定位串。 */
export function describeAccentColor(finding) {
  return '控件选中态不符合官方配方：' + finding.selector + ' 的 ' + finding.detail
}

/* ------------------------------------------------------------------ *
 * 检查十五：输入框（文本框与下拉）按宿主的输入档写
 * ------------------------------------------------------------------ */

/**
 * 宿主两种输入配方的**共同点**（`dsh-client-ui-primitives`）：
 *
 * | 配方 | 出处 | 高 / 圆角 / 描边 |
 * |---|---|---|
 * | 设置表单字段 | `settings-form/fields.module.css` 的 `.input` | **H34** / `--dsw-radius-md` / `--dsw-alias-border-l4` / `bg-layer-3` / 13px |
 * | 筛选框 | `Input.module.css` 的 `.wrap` | **H32** / `--dsw-radius-md` / `--dsw-alias-border-l4` / `bg-layer-1` / 14px |
 *
 * 两条共同点就是本检查的两条判据（都属于「不报错、只有并排看才发现的观感漂移」）：
 *
 *   ① **必须写显式高度**。靠 padding 撑高度的输入框在不同字体下高度会漂；更要命的是
 *      `<select>`：Chrome 给 select 算内容高时不看继承的 line-height，同一个类套在
 *      `<select>` 上会比同排的 `<input>` **矮 2px**（2026-10-06 实测 rss：29 vs 31），
 *      同一行两个控件的上下沿对不齐。宿主两种配方都写了高度。
 *   ② **圆角必须是 token**。本仓 5 个包共用了同一段抄来的输入样式（`padding:6px 10px;
 *      border-radius:8px`）：H31 的输入配 R8 落在「紧凑控件」那一档，与 H34 的宿主输入并排
 *      看着更方；字面量还不带意图——写成 `var(--dsw-radius-md)`（H32–40）或
 *      `var(--dsw-radius-sm)`（H20–28）才看得出选的是哪一档。
 *
 * 判据只落在「带可见中性描边」的输入类上：搜索框那种 `border:none;background:0 0` 的行内输入
 * 不在此列（它没有框，高度由所在行决定）。
 */
export const INPUT_RECIPE_RULE_HINT = '输入框 / 下拉按宿主的输入档写：① 必须写显式 height'
  + '（宿主 settings-form 的 .input 是 H34，Input 原语是 H32；多行 textarea 用 height:auto + min-height）；'
  + '② border-radius 必须用 token（H32–40 → var(--dsw-radius-md)，H20–28 → var(--dsw-radius-sm)），'
  + '不要写 8px 这类字面量。为什么：<select> 复用输入类时 Chrome 不按继承的 line-height 算高度，'
  + '没有显式高度就会比同排的 <input> 矮 2px。'
  + '出处：dsh-client-ui-primitives 的 settings-form/fields.module.css 与 Input.module.css。'

/** 输入类的命名约定：类名以 input / select 结尾（rss_input · mX_input · pf_select · tt_cardInput…）。 */
const INPUT_CLASS = /(?:^|[-_])[A-Za-z0-9]*(?:input|select)$/i

/**
 * 带可见中性描边的控件（搜索框那种 `border:none` 的行内输入不在判据内）。
 *
 * @param rule - `parseCssRules` 的一条规则。
 * @returns 是否带 solid 描边。
 */
function isBorderedControl(rule) {
  const border = declValue(rule.decls, 'border')
  return border !== undefined && /\bsolid\b/.test(border) && !/\bnone\b/.test(border)
}

/**
 * 检查十五：报出没写显式高度的输入类，以及圆角写成字面量的输入类。
 *
 * @param files - `{ file, source }[]`。
 * @returns `{ file, line, selector, code, detail }[]`。
 */
export function scanInputRecipes(files) {
  const findings = []
  for (const { file, source } of files) {
    for (const rule of parseCssRules(source)) {
      const classes = classTokensOf(rule.selector)
      if (!classes.some((cls) => INPUT_CLASS.test(cls))) continue
      if (!isBorderedControl(rule)) continue
      if (declValue(rule.decls, 'height') === undefined) {
        findings.push({
          file,
          line: rule.line,
          selector: rule.selector,
          code: 'height',
          detail: '没有显式 height（靠 padding 撑高；再套到 <select> 上会比同排输入框矮 2px）',
        })
      }
      const radius = declValue(rule.decls, 'border-radius')
      if (radius !== undefined && !radius.includes('var(')) {
        findings.push({
          file,
          line: rule.line,
          selector: rule.selector,
          code: 'radius',
          detail: 'border-radius:' + radius + ' 是字面量（H32–40 应为 var(--dsw-radius-md)）',
        })
      }
    }
  }
  return findings
}

/** 命中检查十五时的一行人类可读定位串。 */
export function describeInputRecipe(finding) {
  return '输入档不符合官方配方：' + finding.selector + ' 的 ' + finding.detail
}

/**
 * 闸门自证：数一遍被检查十五扫到的「带描边的输入类」规则（0 命中 = 这条检查没在扫东西）。
 *
 * @param files - `{ file, source }[]`。
 * @returns 规则数。
 */
export function scanInputSites(files) {
  let total = 0
  for (const { source } of files) {
    for (const rule of parseCssRules(source)) {
      const classes = classTokensOf(rule.selector)
      if (classes.some((cls) => INPUT_CLASS.test(cls)) && isBorderedControl(rule)) total += 1
    }
  }
  return total
}

/**
 * 闸门自证：数一遍被检查十四扫到的 accent-color 声明（0 命中 = 这条检查没在扫东西）。
 *
 * @param files - `{ file, source }[]`。
 * @returns 声明了 accent-color 的规则数。
 */
export function scanAccentColorSites(files) {
  let total = 0
  for (const { source } of files) {
    for (const rule of parseCssRules(source)) {
      if (declValue(rule.decls, 'accent-color') !== undefined) total += 1
    }
  }
  return total
}

/* ------------------------------------------------------------------ *
 * 检查十六：颜色一律来自宿主主题（不许自带颜色字面量）
 * ------------------------------------------------------------------ */

/**
 * 宿主主题是**唯一的颜色权威**（theme 包 README 的原话：*the token sheets are the sole color
 * authority — values absent from the design system are deliberately not appended; the nearest
 * semantic token wins*）。本仓两份实测证据（2026-10-06 全仓扫描）说明「自带颜色字面量」不是
 * 整洁度问题，而是**会和主题的值对不上**：
 *
 *   - `--dk-accent: var(--dsw-alias-state-business-primary, #4d6bfe)`：主题那份是
 *     `#4176e6`（deepseek-500），兜底那份是**另一个蓝**。宿主一旦改名 token（检查四正是为
 *     这件事设的），面板不会报错，只会安静地换成一个与主题不同的蓝——而 `var()` 的兜底
 *     只在**取不到值**时才生效，所以这条路径平时永远测不到；
 *   - `getComputedStyle(document.documentElement).getPropertyValue('--dsw-alias-…')`：
 *     宿主把 alias 令牌声明在 body 上（`body{--dsw-alias-…}` / `body[data-ds-dark-theme]{…}`），
 *     而自定义属性只向**下**继承——html 上永远取不到，于是 `cssVar()` 每次都返回自己的兜底值
 *     （tty 的终端强调色因此长期是 `#7c9cff`，而主题给的是 `#4176e6`）。
 *     **读令牌要在有令牌的元素上读。**
 *
 * 三条判据（`code` 就是三条的名字）：
 *
 * | code | 判据 | 豁免 |
 * |---|---|---|
 * | `fallback` | 引用宿主令牌时带了**颜色字面量兜底** | 兜底本身也是 `var(…)`（宿主 focus 配方就这么写） |
 * | `literal` | CSS **规则体**里的颜色字面量 | 自定义属性定义位（域调色板的登记处）、`mask-image` 里的纯黑纯白（alpha 通道）、`color-mix()` 里的纯黑纯白 |
 * | `js-literal` | JS 代码（注释与 CSS 规则体外）里的 `#hex` / `rgb()` / `hsl()` | 同上 |
 *
 * **为什么允许自定义属性定义位**：面板确实需要一片「域调色板」（终端仿真色、日志级别色、
 * 遮罩），它们本来就不属于 UI 主题色板。判据不是「一个都别写」，而是**只许在一个地方登记**
 * ——值落在本包 `--<前缀>-*` 的定义位上，规则体一律 `var()` 读。这样改一处就够，
 * 也不会散进一百条规则里。
 */
export const COLOR_SOURCE_RULE_HINT = '颜色只能来自宿主主题：① 引用 --dsw-* 时不要带颜色字面量兜底'
  + "（var(--dsw-x, #fff) / cssVar('--dsw-x', '#fff')）——宿主一旦改名，面板不会报错，"
  + '只会安静地换成**另一个**颜色；② 规则体里不要出现 #hex / rgb() / hsl() / 具名色，'
  + '颜色字面量只许写在本包 --<前缀>-* 的定义位（域调色板的登记处），规则一律 var() 读；'
  + '③ JS 里读令牌要在**声明令牌的元素**上读（宿主 alias 令牌挂在 body，不是 documentElement）。'
  + '出处：dsh-client-ui-theme README「the token sheets are the sole color authority」。'

/** 颜色字面量：hex / rgb[a] / hsl[a] / CSS 具名色（`white-space` 这类属性名不算）。 */
const COLOR_LITERAL = /#[0-9a-fA-F]{3,8}\b|rgba?\([^()]*\)|hsla?\([^()]*\)|(?<![-\w.])(?:white|black|red|blue|green|gray|grey|silver|maroon|navy|teal|orange|purple|yellow|olive|lime|aqua|fuchsia)(?![-.\w])/g

/**
 * JS 里的颜色字面量**只认无歧义的写法**（`#hex` / `rgb()` / `hsl()`）。刻意不认具名色：
 * JS 对象里的 `white:` 多半是键名（xterm 的 theme 就长这样），认了就把键名报成颜色——
 * 误报一旦出现，整条闸门就会开始被人怀疑。
 */
const JS_COLOR_LITERAL = /#[0-9a-fA-F]{3,8}\b|rgba?\([^()]*\)|hsla?\([^()]*\)/g

/**
 * 整条声明的值就是「没有颜色」的关键字时跳过。
 *
 * **必须配 \`$\`**：首版写成 \`(?:\\s|$)\` 时，\`box-shadow: 0 2px 10px rgba(0,0,0,.10)\`
 * 这种「以 0 开头、后面还有颜色」的值会被整条豁免掉（实测 rss 的胶囊投影就是这样漏的）。
 */
const COLOR_KEYWORD = /^(?:transparent|currentcolor|inherit|initial|unset|revert|none|auto|0)$/i

/** alpha 通道用途：`mask-image` 里的 #000/#fff 表达的是「不透明」，不是颜色。 */
const MASK_PROPERTY = /^(?:-webkit-)?mask(?:-image|-repeat|-position|-size)?$/

/** 纯黑 / 纯白：混色与蒙版的合法素材（宿主自己的 `color-mix(…, white 18%)` 就这么写）。 */
const PURE_COLOR = /^(?:#000|#000000|#000000ff|#fff|#ffffff|#ffffffff|black|white)$/i

/** 工具：偏移量 → 1-based 行号。 */
function lineOfOffset(text, offset) {
  return String(text).slice(0, offset).split('\n').length
}

/**
 * 工具：值里第 offset 个字符所在的 color-mix 的**区间**（不在任何 color-mix 里时 null）。
 *
 * 返回区间而不是布尔，是为了让豁免更窄：只有「**与宿主令牌混色**的纯黑纯白」才算合法素材
 * （`color-mix(in srgb, var(--tt-accent) 70%, #fff 6%)`）。`color-mix(in srgb, #000 42%,
 * transparent)` 这种**通篇没有一个 var()** 的遮罩不在此列——它是一份自造的颜色，而宿主
 * 的遮罩令牌是 `--dsw-alias-bg-mask-1`（浅 24% / 深 50%）。
 *
 * @param value - 声明值原文。
 * @param index - 颜色字面量在值里的偏移。
 * @returns `[from, to]` 或 null。
 */
function colorMixRangeAt(value, index) {
  let depth = 0
  for (let i = index - 1; i >= 0; i -= 1) {
    const ch = value[i]
    if (ch === ')') depth += 1
    else if (ch === '(') {
      if (depth > 0) { depth -= 1; continue }
      if (!/color-mix\s*$/i.test(value.slice(Math.max(0, i - 10), i))) return null
      let nested = 1
      for (let j = i + 1; j < value.length; j += 1) {
        if (value[j] === '(') nested += 1
        else if (value[j] === ')') {
          nested -= 1
          if (nested === 0) return [i, j]
        }
      }
      return [i, value.length]
    }
  }
  return null
}

/**
 * 检查十六：报出「自带颜色字面量」的三类站点。
 *
 * @param files - `{ file, source }[]`。
 * @returns `{ file, line, code, detail }[]`。
 */
export function scanColorLiterals(files) {
  const findings = []
  for (const { file, source } of files) {
    const masked = maskComments(source)
    /* ① 引用宿主令牌时的颜色字面量兜底（也覆盖 cssVar('--dsw-x', '#fff') 这种 JS 读法）。 */
    const fallbackRanges = []
    const FALLBACK = /(--dsw-[a-z0-9-]+)["']?\s*,\s*["']?\s*(#[0-9a-fA-F]{3,8}\b|rgba?\([^()]*\)|hsla?\([^()]*\)|(?:white|black)\b)/g
    for (const match of masked.matchAll(FALLBACK)) {
      fallbackRanges.push([match.index, match.index + match[0].length])
      findings.push({
        file,
        line: lineOfOffset(masked, match.index),
        code: 'fallback',
        detail: match[1] + ' 的颜色兜底是字面量 ' + match[2]
          + '（令牌存在，兜底永远不会生效，只会与主题的值不一致）',
      })
    }
    /* ② CSS 规则体的声明位；同时记下规则体范围，供 ③ 排除「写在 JS 字符串里的 CSS」。 */
    const cssRanges = []
    for (const rule of parseCssRules(source)) {
      cssRanges.push([rule.bodyStart, rule.bodyEnd])
      let consumed = 0
      for (const part of rule.decls.split(';')) {
        const partStart = consumed
        consumed += part.length + 1
        const colon = part.indexOf(':')
        if (colon === -1) continue
        /*
         * 行号要把**属性名之前**的换行也算上：JS 对象字面量（xterm 的 theme 就是这样）整块被
         * 当成一条声明，声明体开头是一个换行，于是第二个键的颜色会被算到规则那一行。
         */
        const partLine = rule.line
          + (rule.decls.slice(0, partStart).match(/\n/g) ?? []).length
          + (part.slice(0, colon).match(/\n/g) ?? []).length
        const prop = part.slice(0, colon).trim()
        if (prop.startsWith('--')) continue // 域调色板的登记处
        if (MASK_PROPERTY.test(prop)) continue
        const value = part.slice(colon + 1)
        if (COLOR_KEYWORD.test(value.trim())) continue
        /*
         * 内联 CSS 住在 JS 字符串里，于是 JS 的**对象字面量**也会被 `parseCssRules` 当成一条
         * 「规则」（例如 xterm 的 `theme: {background:'#0b0e14',…}`：花括号配对成立、前置文本
         * 归一成 `theme:`）。两类都该报，但**改法不同**，所以 code 要分开——否则修的人会按
         * CSS 的改法去改一个 JS 对象。
         */
        const jsish = /\.(?:js|mjs)$/.test(file)
          && (/^(?:const|let|var|return|function)\b/.test(rule.selector)
            || /^[A-Za-z_$][\w$]*\s*:$/.test(rule.selector))
        /*
         * JS 对象字面量**没有分号**，整块会被当成一条声明，于是「第一个键」之后的所有
         * `red:` / `white:` 都会落进「值」里，被当成 CSS 具名色报出来——即使它们后面跟的是
         * `cssVar(...)`。那是**误报**：实测 `{ black: cssVar(…), red: cssVar(…), white: … }`
         * 会报出两条并不存在的颜色。把键位掩成等长空白再扫（只掩非换行字符，行号不变）。
         */
        const scanned = jsish
          ? value.replace(/(^|[,{])(\s*[A-Za-z_$][\w$]*\s*:)/g, (all, lead, key) => lead + key.replace(/[^\n]/g, ' '))
          : value
        for (const match of scanned.matchAll(COLOR_LITERAL)) {
          const at = rule.bodyStart + partStart + colon + 1 + match.index
          if (fallbackRanges.some(([from, to]) => at >= from && at < to)) continue
          const mix = colorMixRangeAt(value, match.index)
          if (PURE_COLOR.test(match[0]) && mix !== null && /var\(/.test(value.slice(mix[0], mix[1]))) continue
          /*
           * 行号要把**值内部**的换行也加上：JS 对象字面量没有分号，整块被当成一条声明，
           * 于是 block 里第 5 个颜色的行号会算到第一条上（实测 xterm 的 theme 对象就是这种形状）。
           */
          const valueLine = partLine + (value.slice(0, match.index).match(/\n/g) ?? []).length
          findings.push({
            file,
            line: valueLine,
            code: jsish ? 'js-literal' : 'literal',
            detail: prop + ':' + value.trim().slice(0, 60) + ' 里的 ' + match[0]
              + (jsish
                ? ' 是 JS 里的颜色字面量（域调色板登记到本包 CSS 的定义位，JS 用 cssVar 在**声明令牌的元素**上读）'
                : ' 是字面量（域调色板请登记到本包 --<前缀>-* 的定义位，规则里 var() 读）'),
          })
        }
      }
    }
    if (/\.css$/.test(file)) continue
    /* ③ JS 代码里的颜色字面量：排除规则体（已由 ② 按 CSS 判据处理）与 ① 已报的兜底。 */
    for (const match of masked.matchAll(JS_COLOR_LITERAL)) {
      const at = match.index
      if (cssRanges.some(([from, to]) => at >= from && at < to)) continue
      if (fallbackRanges.some(([from, to]) => at >= from && at < to)) continue
      findings.push({
        file,
        line: lineOfOffset(masked, at),
        code: 'js-literal',
        detail: match[0] + ' 是 JS 里的颜色字面量（域调色板登记到本包 CSS 的定义位，'
          + 'JS 用 cssVar 在**声明令牌的元素**上读）',
      })
    }
  }
  return findings
}

/** 命中检查十六时的一行人类可读定位串。 */
export function describeColorSource(finding) {
  return '颜色没有走宿主主题：' + finding.detail
}

/**
 * 闸门自证：数一遍被检查十六扫到的「宿主令牌引用」处数（0 命中 = 这条检查没在扫东西）。
 *
 * @param files - `{ file, source }[]`。
 * @returns 引用处数（不含定义位）。
 */
export function scanThemeTokenRefs(files) {
  let total = 0
  for (const { source } of files) {
    const masked = maskComments(source)
    for (const match of masked.matchAll(/--dsw-[a-z0-9-]+/g)) {
      if (/^\s*:/.test(masked.slice(match.index + match[0].length))) continue
      total += 1
    }
  }
  return total
}


