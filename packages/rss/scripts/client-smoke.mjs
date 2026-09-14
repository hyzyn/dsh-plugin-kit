#!/usr/bin/env node
/**
 * 浏览器半体（client.js）的静态冒烟。
 *
 * 为什么是静态断言而不是加载 bundle：client.js 是**手写的字符串模板**（无构建步骤），
 * 渲染依赖真实 DOM 与事件代理，起一个 DOM 桩去跑它得复刻整套面板，收益远不如直接盯住
 * 「哪些钩子必须存在」。这里守的是四件事：
 *   1. 过渡层是绝对定位（不推版）且不吃指针事件；
 *   2. 只在慢加载时出现（消抖门没被拆掉）；
 *   3. 文案形态是「状态 · 归属」，且完整解释在 title 里；
 *   4. 原有保护（骨架屏消抖 / stale-while-revalidate / 焦点与滚动还原）没被改坏。
 */
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const code = readFileSync(join(here, '..', 'client.js'), 'utf8')

const results = []
function test(name, fn) {
  try {
    fn()
    results.push({ name, ok: true })
  } catch (error) {
    results.push({ name, ok: false, message: error instanceof Error ? error.message : String(error) })
  }
}

const rule = (selector) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(escaped + '\\{[^}]*\\}').exec(code)?.[0] ?? ''
}

test('过渡层：观感对齐 dsh-docker（蓝色），进度条贴分类行下沿、胶囊骑线上居中', () => {
  const bar = rule('.rss_busyBar')
  assert.ok(bar.includes('position:absolute'), '进度条必须绝对定位（插进文档流会把标题推下去）')
  assert.ok(bar.includes('pointer-events:none'), '进度条不该吃指针事件')
  /*
   * 弹窗胶囊的位置（两次返工后的结论）：
   *   - 标题行右侧 ✗（贴标题与 ✕，像挂在标题栏上）；
   *   - 列表区顶部居中 ✗（压住第一条内容，这个弹窗第一项可能是失败横幅，文字叠字）；
   *   - 工具条行内 ✓：不重叠、搜索框 flex:1 挤出宽度而不是换行 → 不推版。
   */
  /*
   * 位置：分类行右端（绝对定位在 .rss_modalFilter 上）。
   * 为什么不能照搬 docker 的「内容区顶部居中」：docker 背后是「活动」条、中间本来就空；
   * 这里列表第一项经常是失败横幅（整行文字），居中浮层会横跨那行字。
   */
  const modalPill = rule('.rss_modalFilter .rss_busyPill')
  // position:absolute 必须显式写：漏了它 left/bottom/transform 全部失效，胶囊会变成
  // 流式元素把列表顶下去（踩过一次，实测 +38px）
  assert.ok(modalPill.includes('position:absolute'), '弹窗胶囊必须 position:absolute')
  assert.ok(modalPill.includes('left:50%') && modalPill.includes('translateX(-50%)'), '胶囊水平居中')
  // 进度条落在分类行下沿（列表区顶部那条线），不再是弹窗顶边
  const modalBar = rule('.rss_modalFilter .rss_busyBar')
  assert.ok(modalBar.includes('bottom:0'), '进度条贴分类行下沿')
  assert.ok(!code.includes("modal.insertAdjacentHTML('afterbegin', busyBarHtml())"), '进度条不该再挂在弹窗顶边')
  assert.ok(rule('.rss_modalFilter').includes('position:relative'), '.rss_modalFilter 要作定位基准')
  assert.ok(!code.includes('rss_busyAnchor'), '不该再有用 sticky 锚点的实现残留')
  // 观感：蓝色强调（与 docker 的 .dk_switchPill 同一配方）
  const pillRule = rule('.rss_busyPill')
  assert.ok(pillRule.includes('border:1px solid color-mix(in srgb,var(--dsw-alias-state-business-primary) 42%,transparent)'), '描边用强调色')
  assert.ok(pillRule.includes('background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 12%,var(--dsw-alias-bg-base))'), '底色是强调色掺入容器表面')
  assert.ok(pillRule.includes('color:var(--dsw-alias-state-business-primary)'), '文字走强调色')
  assert.ok(code.includes('.rss_busyPill svg{flex:none;animation:rss_spin .9s linear infinite;color:var(--dsw-alias-state-business-primary)}'), '旋转图标用强调色')
  const pill = rule('.rss_busyPill')
  assert.ok(pill.includes('flex:none'), '胶囊要 flex:none，否则会被搜索框挤变形')
  assert.ok(pill.includes('pointer-events:none'), '胶囊不该吃指针事件')
  assert.ok(!pill.includes('backdrop-filter'), '不要靠 backdrop-filter 撑观感')
  assert.ok(rule('.rss_modal').includes('position:relative'), '.rss_modal 要作定位基准（进度条）')
  assert.ok(rule('.rss_settingSection').includes('position:relative'), '.rss_settingSection 要作定位基准')
})

test('过渡层：胶囊不再自己按容器取底色（统一强调色，不会串成黑块）', () => {
  assert.ok(!code.includes('color-mix(in srgb,var(--dsw-alias-bg-layer-3)'), '不要用「层」token 算背景（会串成深色块）')
  assert.ok(code.includes('.rss_settingSection .rss_busyPill{position:absolute;top:10px;right:12px}'), '设置卡胶囊同观感、位置在区块标题行右侧')
})

test('过渡层：不定长进度条动画 + 尊重 reduced-motion', () => {
  assert.ok(code.includes('@keyframes rss_busy'), '缺少不定长进度条动画')
  /*
   * 进度条必须用**强调色**：实测这个皮肤里 --dsw-alias-brand-primary 是 #0f1115
   * （品牌墨色、近黑），拿它画流光就是一条黑波纹——被用户抓到过一次。
   */
  assert.ok(code.includes('linear-gradient(90deg,transparent,var(--dsw-alias-state-business-primary'), '进度条流光要走强调色')
  assert.ok(!code.includes('linear-gradient(90deg,transparent,var(--dsw-alias-brand-primary)'), '不要用 brand-primary（近黑）')
  assert.ok(code.includes('background-size:35% 100%'), '进度条应是流光切片而不是整条填满')
  /*
   * 文件里有多条 reduced-motion 规则，且正则取不到整体（内层还有 {}）。
   * 直接用子串判断：过渡层的进度条/胶囊动画、落地动画都要在里面被关掉。
   */
  const reduceStart = code.indexOf('@media (prefers-reduced-motion:reduce){.rss_busyBar')
  assert.ok(reduceStart >= 0, '过渡层动效要有一条 reduced-motion 规则')
  const reduceBlock = code.slice(reduceStart, code.indexOf("',", reduceStart))
  assert.ok(reduceBlock.includes('.rss_busyPill svg'), '过渡层旋转图标也要关掉')
  assert.ok(reduceBlock.includes('[data-landed] > *{animation:none}'), '落地动效也要关掉')
})

test('过渡层：只在慢加载（消抖后）出现', () => {
  // 设置卡：state.refreshing && state.refreshSlow 才挂
  assert.ok(code.includes('state.refreshing && state.refreshSlow && digest'), '设置卡的过渡层要受消抖门控')
  assert.ok(code.includes('state.refreshSlow = true'), '缺少慢刷新的置位')
  assert.ok(code.includes("}, LOADING_DEBOUNCE_MS)"), '慢刷新定时器应复用 180ms 消抖常量')
  // 弹窗：渲染路径挂在慢加载标志上（进度条），胶囊在 renderModalFilter 里同步给
  assert.ok(code.includes('state.modalLoading && state.modalSlow) parts.push(busyBarHtml() + busyPillHtml(digest)'), '过渡层要挂在慢加载标志上')
  /*
   * 但慢加载那条路径**不重渲染**（保住焦点与滚动），所以还要有一次「只插节点」的注入，
   * 否则浮层永远不出现——这是实测踩到的坑，必须防回归。
   */
  assert.ok(code.includes("filter.insertAdjacentHTML('beforeend', busyBarHtml() + busyPillHtml(state.digest))"), '慢加载路径要把进度条与胶囊插进 filter')
  assert.ok(code.includes("querySelectorAll('.rss_busyBar, .rss_busyPill')"), 'endLoading 要收掉过渡层节点1')
})

test('过渡层：文案是「状态 · 归属」，完整解释在 title', () => {
  assert.ok(code.includes('正在刷新订阅源'), '缺少刷新状态文案')
  assert.ok(code.includes('当前数据生成于'), '缺少数据归属文案')
  assert.ok(code.includes('刷新完成后整体替换'), '缺少 title 里的完整说明')
  // 两段之间用分隔点，不写成一句流水账
  assert.ok(code.includes('正在刷新订阅源 · 当前数据生成于'), '状态与归属之间应有分隔点')
  // 归属用时钟（14:25）而不是带日期的全量时间戳；title 里也不能把日期拼两遍
  assert.ok(code.includes('function clockText'), '缺少时钟格式化')
  assert.ok(!code.includes("(digest.date ? digest.date + ' ' : '')"), 'title 里日期会重复拼接')
})

test('数据落地：8px 上滑淡入，且只挂在落地那一次渲染上', () => {
  assert.ok(code.includes('@keyframes rss_landIn'), '缺少落地动画')
  assert.ok(code.includes('translateY(8px)'), '落地动画应是上滑 8px')
  assert.ok(code.includes("(keepScroll ? ' data-landed' : '')"), '只有落地渲染才加 data-landed')
  assert.ok(code.includes('data-landed>'), '缺少 data-landed 的动画选择器')
})

test('原有保护没被改坏：骨架屏消抖 / 旧数据保留 / 焦点与滚动还原', () => {
  assert.ok(code.includes('const LOADING_DEBOUNCE_MS = 180'), '消抖常量被改动')
  assert.ok(code.includes('renderSkeleton(!state.modalSlow)'), '骨架屏消抖丢失')
  assert.ok(code.includes('stale-while-revalidate'), 'stale-while-revalidate 注释/语义丢失')
  assert.ok(code.includes('searchFocused') && code.includes('caretPos'), '刷新后搜索框焦点/光标还原丢失')
  assert.ok(code.includes('prevScroll'), '刷新后滚动位置还原丢失')
  assert.ok(code.includes('data-updating'), '弹窗「更新中」压暗标记丢失')
})

await Promise.resolve()

let failed = 0
for (const result of results) {
  if (result.ok) {
    console.log('  ✓ ' + result.name)
  } else {
    failed += 1
    console.log('  ✗ ' + result.name + '\n      ' + result.message)
  }
}
console.log('\n[dsh-rss] client-smoke: ' + String(results.length - failed) + '/' + String(results.length) + ' 通过')
if (failed > 0) process.exit(1)
