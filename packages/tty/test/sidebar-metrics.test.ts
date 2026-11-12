/**
 * @hyzyn/dsh-tty — 侧栏入口「与宿主行对齐」的几何推导。
 *
 * 实测踩过的问题（`0.2.2-rc.2`）：宿主侧栏行 `.panelRow` 的几何从 `min-height: 36px` /
 * `padding: 7px …` 收紧成 `32px` / `5px`，而本插件把那两个值写死在 CSS 里，于是升级后
 * 开了 `sidebarHostAlign` 的用户入口比同栏其它条目**高 4px**。
 *
 * 修法是「挂载时量宿主行、写 CSS 变量」（见 `client-src/sidebar-metrics.js` 的文件头）。
 * 这里钉住三件事：
 *
 * 1. **两档的真实几何都推得对**——rc.1 给 36/7、rc.2 给 32/5，不是「等于某个常数」；
 * 2. **解析边界**：`0` 是合法值（宿主可以真的用 0 padding），`auto` / `calc(…)` / 空串
 *    一律当「没量到」而**不写**——半截脏值会把行压扁或撑高，比不写更糟；
 * 3. **变量名与 CSS 一致**：JS 写的名字必须真的出现在 `tty.css` 里，否则改名后
 *    JS 静默写了个没人读的变量，症状是「修了但没生效」，最难查的那种。
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { hostRowCssVars, hostRowMetrics } from '../client-src/sidebar-metrics.js'

/** 造一份 computed style（只需要几何那几项）。 */
function styleOf(fields: Record<string, string>): Record<string, string> {
  return {
    minHeight: '0px',
    paddingTop: '0px',
    paddingRight: '0px',
    paddingBottom: '0px',
    paddingLeft: '0px',
    ...fields,
  }
}

describe('hostRowMetrics：从宿主行的 computed style 推出入口几何', () => {
  it('0.2.2-rc.1 的行：min-height 36 / padding 7px 8px', () => {
    const metrics = hostRowMetrics(styleOf({
      minHeight: '36px',
      paddingTop: '7px',
      paddingRight: '8px',
      paddingBottom: '7px',
      paddingLeft: '8px',
    }))
    expect(metrics).toEqual({ minHeight: 36, padTop: 7, padRight: 8, padBottom: 7, padLeft: 8 })
  })

  it('0.2.2-rc.2 的行：min-height 32 / padding 5px …（这一档就是靠它不再偏 4px）', () => {
    const metrics = hostRowMetrics(styleOf({
      minHeight: '32px',
      paddingTop: '5px',
      paddingRight: '6px',
      paddingBottom: '5px',
      paddingLeft: '6px',
    }))
    expect(metrics?.minHeight).toBe(32)
    expect(metrics?.padTop).toBe(5)
    expect(metrics?.padBottom).toBe(5)
  })

  it('0 是合法值，不能当「没量到」丢掉', () => {
    const metrics = hostRowMetrics(styleOf({ minHeight: '0px', paddingTop: '0px', paddingBottom: '0px' }))
    expect(metrics?.minHeight).toBe(0)
    expect(metrics?.padTop).toBe(0)
  })

  it('小数像素照收（宿主用 calc 时算出来可能是 5.5px）', () => {
    expect(hostRowMetrics(styleOf({ minHeight: '32.5px' }))?.minHeight).toBe(32.5)
  })

  it.each([
    ['auto', 'auto 不是长度'],
    ['normal', 'normal 不是长度'],
    ['calc(5px + 1px)', 'calc 未求值'],
    ['', '空串'],
    ['5', '没有单位'],
    ['-3px', '负值按「没量到」处理'],
  ])('%s 一律当没量到（%s）', (value) => {
    expect(hostRowMetrics(styleOf({ minHeight: value }))?.minHeight).toBeUndefined()
  })

  it('全都没量到 → undefined（调用方据此完全不写变量，纯靠 CSS 兜底）', () => {
    // 注意不能拿 styleOf({}) 当「没量到」：它的默认值是 '0px'，而 0 是**合法**值，
    // 会被正常收下（上面那条用例正是钉这个区别）。这里要的是解析不出来的形状。
    const unmeasurable = {
      minHeight: 'auto',
      paddingTop: '',
      paddingRight: 'calc(1px + 1px)',
      paddingBottom: 'normal',
      paddingLeft: '5',
    }
    expect(hostRowMetrics(unmeasurable)).toBeUndefined()
    expect(hostRowMetrics(undefined)).toBeUndefined()
  })
})

describe('hostRowCssVars：只写量到的项', () => {
  it('量到的字段逐个变成对应变量，单位 px', () => {
    const vars = hostRowCssVars({ minHeight: 32, padTop: 5, padBottom: 5, padLeft: undefined, padRight: undefined })
    expect(vars).toEqual([
      ['--tt-host-min-height', '32px'],
      ['--tt-host-pad-top', '5px'],
      ['--tt-host-pad-bottom', '5px'],
    ])
  })

  it('没量到的项不出现——CSS 的 var(--x, 兜底) 才会走兜底分支', () => {
    const vars = hostRowCssVars({ minHeight: undefined, padTop: 7, padRight: undefined, padBottom: undefined, padLeft: undefined })
    expect(vars.map(([name]) => name)).toEqual(['--tt-host-pad-top'])
  })

  it('metrics 为 undefined → 空数组', () => {
    expect(hostRowCssVars(undefined)).toEqual([])
  })

  it('名字与 CSS 对得上：每个写出去的变量都在 tty.css 里被引用', () => {
    const css = readFileSync(new URL('../client-src/tty.css', import.meta.url), 'utf8')
    const vars = hostRowCssVars({ minHeight: 1, padTop: 1, padRight: 1, padBottom: 1, padLeft: 1 })
    expect(vars).toHaveLength(5)
    for (const [name] of vars) {
      // 改名后 JS 会静默写一个没人读的变量，症状是「修了但没生效」——所以钉住
      expect(css.includes(`var(${name}`), `${name} 没有被 tty.css 引用`).toBe(true)
    }
  })
})
