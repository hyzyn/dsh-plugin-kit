/**
 * @hyzyn/dsh-tty — 「面板打开时开什么」的判据（0.40.0，issue #29）。
 *
 * 反向验证（本用例的存在理由）——改坏下面任一处，对应那组会红：
 *   - `planStartup` 不看 `pending`：socket 抖动重连会在用户没做任何操作时把菜单弹出来；
 *   - `parseStartupIntent` 把 `book:` 前缀当普通条目名：`book:local` 会解析成「一个叫
 *     `book:local` 的连接」，而不是那个叫 `local` 的条目（前缀存在的全部理由）；
 *   - 关键字区分大小写：手改 profile 写成 `Local` 会变成一个要连的条目名；
 *   - `findBookEntry` 做大小写折叠：两个只差大小写的条目会变得不可达；
 *   - 条目找不到时静默回落：用户看不见「我配的那个条目没了」（调用方要按 `missing` 弹 toast）。
 */
import { describe, expect, it } from 'vitest'

import { findBookEntry, normalizeStartupValue, parseStartupIntent, planStartup, startupCardOptions } from '../client-src/startup-intent.js'

describe('parseStartupIntent：配置值 → 意图', () => {
  it('缺省 / 非字符串 / 空串一律 local（老配置升级后行为不变）', () => {
    for (const value of [undefined, null, '', '   ', 42, {}, [], true]) {
      expect(parseStartupIntent(value), String(value)).toEqual({ mode: 'local' })
    }
    expect(parseStartupIntent('local')).toEqual({ mode: 'local' })
    // 关键字不区分大小写：写成 Local 不该变成一个要连的条目名
    expect(parseStartupIntent(' Local ')).toEqual({ mode: 'local' })
  })

  it('ask（含大小写与空白）', () => {
    expect(parseStartupIntent('ask')).toEqual({ mode: 'ask' })
    expect(parseStartupIntent('  ASK ')).toEqual({ mode: 'ask' })
  })

  it('book: 前缀后的名字按原样、区分大小写', () => {
    expect(parseStartupIntent('book:KB_APP')).toEqual({ mode: 'book', name: 'KB_APP' })
    // 前缀本身大小写不敏感，名字大小写照原样
    expect(parseStartupIntent('BOOK:KB_APP')).toEqual({ mode: 'book', name: 'KB_APP' })
    expect(parseStartupIntent('book:  测试机 A  ')).toEqual({ mode: 'book', name: '测试机 A' })
    // 前缀的**全部理由**：条目名可以叫 local / ask，裸名在这两个词上有歧义，前缀永远可达
    expect(parseStartupIntent('book:local')).toEqual({ mode: 'book', name: 'local' })
    expect(parseStartupIntent('book:ask')).toEqual({ mode: 'book', name: 'ask' })
  })

  it('book: 后面什么都没有 = 没有意图（回落 local，不是「一个叫空串的条目」）', () => {
    expect(parseStartupIntent('book:')).toEqual({ mode: 'local' })
    expect(parseStartupIntent('book:   ')).toEqual({ mode: 'local' })
  })

  it('裸条目名（手写配置的短形态）', () => {
    expect(parseStartupIntent('kb-target')).toEqual({ mode: 'book', name: 'kb-target' })
    expect(parseStartupIntent('  kb-target  ')).toEqual({ mode: 'book', name: 'kb-target' })
  })
})

describe('findBookEntry：只认名字完全相等', () => {
  const hosts = [
    { name: 'KB_APP', host: '10.0.0.1' },
    null,
    { name: '', host: 'x' },
    { host: 'no-name' },
    { name: 'kb-target', host: '10.0.0.2' },
  ]

  it('命中时原样返回条目对象（调用方拿它建会话）', () => {
    expect(findBookEntry(hosts, 'KB_APP')).toBe(hosts[0])
    expect(findBookEntry(hosts, 'kb-target')).toBe(hosts[4])
  })

  it('区分大小写，且跳过非法条目', () => {
    expect(findBookEntry(hosts, 'kb_app')).toBeNull()
    expect(findBookEntry(hosts, '')).toBeNull()
    expect(findBookEntry(hosts, 'no-name')).toBeNull() // 没名字的条目不算命中
    expect(findBookEntry(null, 'KB_APP')).toBeNull()
    expect(findBookEntry('KB_APP', 'KB_APP')).toBeNull()
  })
})

describe('planStartup：面板打开那一拍的五个出口', () => {
  const base = { startup: 'local', sshHosts: [{ name: 'kb-target' }], hasOwnTabs: false, hasEmbedded: false, pending: true }

  it('不是「刚打开」那一拍 → none（重连 / 最小化恢复都不该再触发）', () => {
    expect(planStartup({ ...base, pending: false })).toEqual({ kind: 'none' })
    expect(planStartup({ ...base, pending: undefined })).toEqual({ kind: 'none' })
    expect(planStartup(undefined)).toEqual({ kind: 'none' })
  })

  it('已有自己的标签 → none（恢复流程已经建出来了）', () => {
    expect(planStartup({ ...base, hasOwnTabs: true, startup: 'ask' })).toEqual({ kind: 'none' })
  })

  it('local（默认）→ local：与旧版一字不差', () => {
    expect(planStartup(base)).toEqual({ kind: 'local' })
    expect(planStartup({ ...base, startup: undefined })).toEqual({ kind: 'local' })
  })

  it('ask → ask（不创建任何会话）', () => {
    expect(planStartup({ ...base, startup: 'ask' })).toEqual({ kind: 'ask' })
  })

  it('book 命中 → book（带上原条目对象与条目名）', () => {
    const plan = planStartup({ ...base, startup: 'book:kb-target' })
    expect(plan).toEqual({ kind: 'book', entry: { name: 'kb-target' }, name: 'kb-target' })
    // 裸名同理
    expect(planStartup({ ...base, startup: 'kb-target' })).toEqual({ kind: 'book', entry: { name: 'kb-target' }, name: 'kb-target' })
  })

  it('book 未命中 → missing（调用方据此回落 local + 点名）', () => {
    expect(planStartup({ ...base, startup: 'book:已经从连接簿删掉的条目' })).toEqual({ kind: 'missing', name: '已经从连接簿删掉的条目' })
  })
})

describe('normalizeStartupValue / startupCardOptions：设置卡片的下拉', () => {
  const hosts = [{ name: 'prod-web-01' }, { name: 'staging-db' }, null, { name: '' }, {}]

  it('规范值：裸条目名归一成 book:<条目名>，其余原样', () => {
    expect(normalizeStartupValue(undefined)).toBe('local')
    expect(normalizeStartupValue('ask')).toBe('ask')
    expect(normalizeStartupValue('staging-db')).toBe('book:staging-db')
    expect(normalizeStartupValue('book:staging-db')).toBe('book:staging-db')
  })

  it('两个固定项在前，连接簿条目按顺序跟上（非法条目跳过）', () => {
    const { current, options } = startupCardOptions({ startup: 'local', sshHosts: hosts })
    expect(current).toBe('local')
    expect(options.map((option) => option.value)).toEqual(['local', 'ask', 'book:prod-web-01', 'book:staging-db'])
    expect(options[2]).toEqual({ value: 'book:prod-web-01', kind: 'book', name: 'prod-web-01' })
  })

  it('裸条目名的现值能在候选里选中（不会因为值形态不同被当成「已不存在」）', () => {
    const { current, options } = startupCardOptions({ startup: 'staging-db', sshHosts: hosts })
    expect(current).toBe('book:staging-db')
    expect(options.some((option) => option.value === current)).toBe(true)
    expect(options.some((option) => option.kind === 'stale')).toBe(false)
  })

  it('失效值原样补一条 stale（不静默显示成「本机终端」）', () => {
    const { current, options } = startupCardOptions({ startup: 'book:已经从连接簿删掉的条目', sshHosts: hosts })
    expect(current).toBe('book:已经从连接簿删掉的条目')
    expect(options[options.length - 1]).toEqual({ value: 'book:已经从连接簿删掉的条目', kind: 'stale' })
  })

  it('配置缺省 / 连接簿缺失时只有两项（非数组当成空表）', () => {
    expect(startupCardOptions({}).options.map((option) => option.value)).toEqual(['local', 'ask'])
    expect(startupCardOptions({ sshHosts: 'nope' }).current).toBe('local')
    expect(startupCardOptions(undefined).options.map((option) => option.value)).toEqual(['local', 'ask'])
  })

  it('同名条目只列一次（连接簿保存按同名覆盖，这里只是防御）', () => {
    const { options } = startupCardOptions({ startup: 'local', sshHosts: [{ name: 'a' }, { name: 'a' }] })
    expect(options.filter((option) => option.value === 'book:a')).toHaveLength(1)
  })
})
