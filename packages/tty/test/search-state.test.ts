/**
 * @hyzyn/dsh-tty — 搜索框开合态与放大镜按下态的判据。
 *
 * 事故（D99，2026-10-10，用户截图 + README 截图同时拍到）：
 *
 * 1. **框开不了第二次**：`toggleSearch()` 把「开」写成空字符串，而它的读取判据把空串
 *    也当「关」——点开之后再点还是「关→开」，永远关不掉；
 * 2. **亮着的放大镜在骗人**：`data-on` 在面板初始化时被无条件点亮，Esc / 最小化只藏框
 *    不摘按钮，于是「框关着、放大镜亮着」。
 *
 * 根因是同一条：开合态没有单一真相源，写入与读取各用一套值。本文件把两件事收成纯函数：
 * 开态是 `block`（可读回）、判「开」只认这一个值、放大镜按下就是纯取反。
 */
import { describe, expect, it } from 'vitest'
import {
  SEARCH_CLOSED_DISPLAY,
  SEARCH_OPEN_DISPLAY,
  isSearchOpenDisplay,
  nextSearchOpen,
  searchDisplayFor,
} from '../client-src/search-state.js'

describe('搜索框开合态：写入与读取共用同一套值', () => {
  it('写入什么就能读回什么（往返性质）', () => {
    expect(isSearchOpenDisplay(searchDisplayFor(true))).toBe(true)
    expect(isSearchOpenDisplay(searchDisplayFor(false))).toBe(false)
  })

  it('两态是可读回的确定值，不是空串', () => {
    expect(SEARCH_OPEN_DISPLAY).toBe('block')
    expect(SEARCH_CLOSED_DISPLAY).toBe('none')
    expect(SEARCH_OPEN_DISPLAY).not.toBe('')
    expect(SEARCH_CLOSED_DISPLAY).not.toBe('')
  })

  it('判「开着」只认那一个值：空串 / undefined / 别的 display 值一律算关', () => {
    // 空串正是旧代码的「开」态——**它不再是开**，这条就是那次「点开关不掉」的反例
    expect(isSearchOpenDisplay('')).toBe(false)
    expect(isSearchOpenDisplay(undefined)).toBe(false)
    expect(isSearchOpenDisplay('inline-block')).toBe(false)
    expect(isSearchOpenDisplay('block')).toBe(true)
  })
})

describe('放大镜按钮：点一次开、再点一次关', () => {
  it('关着 → 开', () => {
    expect(nextSearchOpen(SEARCH_CLOSED_DISPLAY)).toBe(true)
  })

  it('开着 → 关（旧代码在这里卡住：把 `block` 之外的读法当关，于是又「开」一次）', () => {
    expect(nextSearchOpen(SEARCH_OPEN_DISPLAY)).toBe(false)
  })

  it('连着点两下回到原状态（面板刚建好时的初始 inline 值就是 none）', () => {
    const first = searchDisplayFor(nextSearchOpen(SEARCH_CLOSED_DISPLAY))
    const second = searchDisplayFor(nextSearchOpen(first))
    expect(first).toBe(SEARCH_OPEN_DISPLAY)
    expect(second).toBe(SEARCH_CLOSED_DISPLAY)
  })

  it('遇到旧代码写坏的空串（历史遗留态）自愈成「开」，不会卡死', () => {
    expect(nextSearchOpen('')).toBe(true)
    expect(searchDisplayFor(nextSearchOpen(''))).toBe(SEARCH_OPEN_DISPLAY)
  })
})
