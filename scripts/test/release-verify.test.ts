/**
 * `scripts/release-verify.mjs` 的单元测试 —— 发布后回查的「三出口」判定规则。
 *
 * 为什么有这份测试：这条规则是「publish 成功、回查却说没读到」这个反复出现的问题的**唯一出口**，
 * 而 v0.1.39 / v0.1.41 / v0.1.44 三次发布都因为「读不到」判红、每次都要人工删 tag 重打一遍。
 * 它平时不出声（只在异常分支上跑），所以漂了没人会发现——三种漂法都会让防线白给：
 *
 *   ① **改回无条件判红**：把 `unconfirmed` 当失败 → 假失败复活（就是当初那个 bug：
 *      绿发布配红条，代价是人工重打 tag）；
 *   ② **删掉牙齿**：把 `failed` 也降级成 warning → 回查再也拦不住「publish 悄悄没落地」；
 *   ③ **对字段类型不设防**：下面「modified 是数字」那条断言就是拿真实 bug 换来的——
 *      最初写的是 `Date.parse(modified ?? '')`，而 `Date.parse(12345)` 会把数字当成年份
 *      12345（远超发布起点），于是格式漂移伪装成「文档很新」→ 误判 `failed`。
 *
 * 所以下面三组断言各有分工：第 1 组钉住「**只有拿到新鲜度证据才能判红**」，第 2 组钉住
 * 「拿不到证据时必须放行」，第 3 组钉住「有版本证据就通过」。I/O 不在本层测——那是
 * `release-publish-tag.mjs` 的事。
 */
import { describe, expect, it } from 'vitest'

import { judgeAfterWindow } from '../release-verify.mjs'

const VERSION = '0.1.45'
/** 本次 publish 命令启动的时刻（本地时钟） */
const STARTED = Date.parse('2026-09-25T13:00:00.000Z')
/** 把「整份 packument」简化成判定真正会看的两个字段 */
const packument = (versions: unknown, time: unknown) => ({ versions, time })
const judge = (doc: unknown) => judgeAfterWindow({ version: VERSION, startedMs: STARTED, doc })

describe('judgeAfterWindow · 判红必须有证据（回查的牙齿）', () => {
  it('文档已刷新到发布之后、却仍没有该版本 → failed（这就是「publish 悄悄没落地」）', () => {
    expect(judge(packument({ '0.1.44': {} }, { modified: '2026-09-25T13:02:00.000Z' }))).toEqual({
      verdict: 'failed',
      reason: 'doc-fresh-without-version',
    })
  })

  it('边界：modified 恰好等于发布起点 → failed（比较用 `>=`，不放过「刚好相等」）', () => {
    expect(judge(packument({}, { modified: '2026-09-25T13:00:00.000Z' }))).toEqual({
      verdict: 'failed',
      reason: 'doc-fresh-without-version',
    })
  })

  it('本地时钟偏快（modified 落在起点之前）→ 走安全侧，不判红', () => {
    // 宁可漏报也不假报：真没落地时 publish 命令自己会红，这里假报只会逼人重打 tag
    expect(judge(packument({}, { modified: '2026-09-25T12:59:59.000Z' })).verdict).toBe('unconfirmed')
  })
})

describe('judgeAfterWindow · 拿不到证据时放行（三次假失败的根因）', () => {
  it('文档整个读不到（null / undefined / 非对象）→ unconfirmed，**不是** failed', () => {
    // ① 号漂法最直接的复现：曾经「读不到」被判红，v0.1.39 / v0.1.41 / v0.1.44 各赔一次人工重打
    expect(judge(null)).toEqual({ verdict: 'unconfirmed', reason: 'doc-unreadable' })
    expect(judge(undefined)).toEqual({ verdict: 'unconfirmed', reason: 'doc-unreadable' })
    expect(judge('502 Bad Gateway')).toEqual({ verdict: 'unconfirmed', reason: 'doc-unreadable' })
  })

  it('文档仍是陈旧副本（modified 早于发布起点）→ unconfirmed', () => {
    expect(judge(packument({ '0.1.44': {} }, { modified: '2026-09-25T10:00:00.000Z' }))).toEqual({
      verdict: 'unconfirmed',
      reason: 'doc-stale',
    })
  })

  it('只有旧版本、且没有 modified（拿不到新鲜度证据）→ unconfirmed，**不是** failed', () => {
    // 这条最容易写错成 failed：没有 modified 就无从判断这份文档是不是发布前的副本
    expect(judge(packument({ '0.1.44': {} }, {})).verdict).toBe('unconfirmed')
    expect(judge({ versions: { '0.1.44': {} } }).verdict).toBe('unconfirmed')
    expect(judge({}).verdict).toBe('unconfirmed')
  })

  it('modified 解析不出来（格式变了 / 被改成非法值）→ 安全侧 unconfirmed', () => {
    expect(judge(packument({}, { modified: 'not-a-date' })).verdict).toBe('unconfirmed')
    expect(judge(packument({}, { modified: 12345 })).verdict).toBe('unconfirmed')
  })
})

describe('judgeAfterWindow · 有版本证据就通过（tag 端点滞后的正常态）', () => {
  it('versions 里有该版本 → verified', () => {
    expect(judge(packument({ [VERSION]: {} }, { modified: '2026-09-25T13:02:00.000Z' }))).toEqual({
      verdict: 'verified',
      reason: 'doc-confirms-version',
    })
  })

  it('只有 time[version]、versions 表没跟上 → verified（time 记的就是这个版本何时入库）', () => {
    expect(judge(packument({}, { [VERSION]: '2026-09-25T13:01:00.000Z' }))).toEqual({
      verdict: 'verified',
      reason: 'doc-confirms-version',
    })
  })

  it('版本证据优先于新鲜度：文档看着陈旧也照样通过', () => {
    expect(judge(packument({ [VERSION]: {} }, { modified: '2020-01-01T00:00:00.000Z' })).verdict).toBe('verified')
  })
})
