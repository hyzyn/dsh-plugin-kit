/**
 * @hyzyn/dsh-search — 侧边栏入口的「切语言后重绘」回归测试。
 *
 * ## 这条用例守的是什么（2026-10-24 的缺陷，PR #15）
 *
 * `createSidebarEntry()` 把 `placeholder` 与 `aria-label` 用 `innerHTML` **烤死一次**。
 * 插槽 outlet 会随 locale revision 重渲染，但这个入口是**插槽之外**手工建的、页面级常驻，
 * 没有重渲染的时机——中文界面切成英文后，整页文案都跟着变，只有侧边栏那个输入框
 * 还写着「全局搜索…」，`aria-label` 也还是中文。
 *
 * 修法：入口登记进 `Set`，`locale.subscribe(repaint)` 每次 revision 变化重绘一遍，
 * 退订函数随 bind 一起释放。老宿主没有 `locale` 服务时走中文兜底、不订阅。
 *
 * ## 为什么这里能真跑，而不是只断言源码文本
 *
 * 仓库的 vitest 底座是 `environment: 'node'`、没有 jsdom（见 `vitest.config.ts` 文件头），
 * 所以整包挂载式的 DOM 用例在这儿跑不了。但 `refreshEntryLabels` 是**只依赖 `t` 与两个
 * DOM 方法**的自包含函数：把它的源码块取出来交给 `new Function` 造一个实例、喂一个假
 * entry，就能在 node 里断言「同一个 entry 被重绘成另一种语言」——这正是缺陷的字面行为。
 * 入口的接线（订阅、退订、登记）仍用静态判据钉住，因为那部分跑不起来。
 */
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = readFileSync(join(packageRoot, 'client.js'), 'utf8')

/** 取出一个具名函数的源码块（从声明起到下一个同缩进的 `}` 为止）。 */
function functionBody(name: string): string {
  const start = source.indexOf('function ' + name)
  if (start === -1) throw new Error('client.js 里找不到函数：' + name)
  const end = source.indexOf('\n    }', start)
  return source.slice(start, end === -1 ? source.length : end + '\n    }'.length)
}

/** 假 entry：只提供 `refreshEntryLabels` 真正用到的两个 DOM 方法。 */
function fakeEntry() {
  const attrs: Record<string, string> = {}
  const inputAttrs: Record<string, string> = {}
  const input = {
    attrs: inputAttrs,
    setAttribute(name: string, value: string) {
      inputAttrs[name] = value
    },
  }
  return {
    attrs,
    input,
    setAttribute(name: string, value: string) {
      attrs[name] = value
    },
    querySelector(selector: string) {
      return selector === '.gs_sidebarSearchInput' ? input : null
    },
  }
}

/** 把 client.js 里的 `refreshEntryLabels` 原地造出来，翻译函数由用例注入。 */
function buildRefresh(t: (key: string) => string): (entry: unknown) => void {
  const factory = new Function('t', functionBody('refreshEntryLabels') + '\nreturn refreshEntryLabels') as (
    translate: (key: string) => string,
  ) => (entry: unknown) => void
  return factory(t)
}

const zh = (key: string): string => ({ 'card.name': '全局搜索', 'placeholder.sidebar': '全局搜索…' })[key] ?? key
const en = (key: string): string => ({ 'card.name': 'Global search', 'placeholder.sidebar': 'Search…' })[key] ?? key

describe('侧边栏入口：切换语言后必须重绘（PR #15 的缺陷）', () => {
  it('同一个 entry 先渲染中文，再按英文重绘 —— 两处文案都要跟着变', () => {
    const entry = fakeEntry()

    buildRefresh(zh)(entry)
    expect(entry.attrs['aria-label']).toBe('全局搜索')
    expect(entry.input.attrs['placeholder']).toBe('全局搜索…')

    // 这就是切语言：同一个节点、不重建，只重新套一遍当前语言的文案
    buildRefresh(en)(entry)
    expect(entry.attrs['aria-label']).toBe('Global search')
    expect(entry.input.attrs['placeholder']).toBe('Search…')
  })

  it('入口还未建（入口为 null / undefined）时不抛 —— 订阅回调可能先于入口到达', () => {
    const refresh = buildRefresh(zh)
    expect(() => { refresh(null) }).not.toThrow()
    expect(() => { refresh(undefined) }).not.toThrow()
  })

  it('没有输入框时只重绘 aria-label，不抛', () => {
    const attrs: Record<string, string> = {}
    const entry = {
      setAttribute(name: string, value: string) {
        attrs[name] = value
      },
      querySelector() {
        return null
      },
    }
    expect(() => { buildRefresh(en)(entry) }).not.toThrow()
    expect(attrs['aria-label']).toBe('Global search')
  })
})

describe('侧边栏入口：接线（订阅 / 退订 / 登记入口）', () => {
  it('绑定 locale 后订阅 revision 变化，且对老宿主有 typeof 守卫', () => {
    const body = functionBody('installI18n')
    expect(body).toContain("typeof i18nCtx.locale.subscribe === 'function'")
    expect(body).toContain('i18nCtx.locale.subscribe(refreshAllEntryLabels)')
  })

  it('bind 之后的第一次重绘覆盖「入口先于 i18n 建好」的顺序', () => {
    const body = functionBody('installI18n')
    const bindAt = body.indexOf('i18nCtx.locale.bind(')
    const repaintAt = body.indexOf('refreshAllEntryLabels()')
    expect(bindAt).toBeGreaterThan(-1)
    expect(repaintAt).toBeGreaterThan(bindAt)
  })

  it('订阅的退订函数随 bind 一起释放（不放会跟着插件活到页面卸载）', () => {
    const body = functionBody('installI18n')
    const disposeAt = body.indexOf('disposeSub()')
    expect(disposeAt).toBeGreaterThan(-1)
    // 退订要在字典退订之前，且两者都在返回的 disposer 里
    expect(disposeAt).toBeLessThan(body.indexOf('disposeEn()'))
  })

  it('新建入口时登记进集合，并立刻按当前语言重绘（覆盖「入口后建」的顺序）', () => {
    const body = functionBody('createSidebarEntry')
    const addAt = body.indexOf('sidebarEntries.add(entry)')
    const paintAt = body.indexOf('refreshEntryLabels(entry)')
    expect(addAt).toBeGreaterThan(-1)
    expect(paintAt).toBeGreaterThan(addAt)
  })
})

describe('预览夹具：见了 locale 服务就必须能切语言', () => {
  const mockHost = readFileSync(join(packageRoot, 'scripts/preview/mock-host.js'), 'utf8')

  it('假 locale 要有 subscribe —— 少它则插槽外靠订阅重绘的界面在英文预览里仍是中文', () => {
    expect(mockHost).toContain('subscribe: (fn) =>')
  })

  it('提供运行时切语言入口，并会广播一次 revision', () => {
    expect(mockHost).toContain('window.__previewSetLocale')
    expect(mockHost).toContain('notifyLocale()')
  })
})
