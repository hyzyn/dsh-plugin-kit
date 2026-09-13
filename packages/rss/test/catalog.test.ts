/**
 * @hyzyn/dsh-rss — 订阅源目录（内置快照 + OPML 解析 + 搜索）的回归测试。
 *
 * 只测纯逻辑：parseOpml / searchCatalogEntries / getCatalogCategories /
 * ROUTES 快照完整性。带网络的 getMergedCatalogEntries / catalogStatus 不测
 * （依赖 fetch 与 TTL 缓存副作用）。
 */
import { describe, expect, it } from 'vitest'
import { BUILTIN_CATALOG_NAME, getBuiltinCatalogEntries, getCatalogCategories, parseOpml, searchCatalogEntries } from '../src/catalog.js'
import type { CatalogEntry } from '../src/catalog.js'
import { ROUTES } from '../src/routes-data.js'

const SAMPLE_OPML = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head><title>demo</title></head>
  <body>
    <outline text="AI &amp; ML">
      <outline type="rss" text="Feed A" xmlUrl="https://a.example/feed" htmlUrl="https://a.example"/>
      <outline type="rss" text="Feed &lt;B&gt;" xmlUrl='https://b.example/feed'/>
      <outline text="无地址的条目"/>
    </outline>
    <outline title="按 title 取分类">
      <outline text="Feed C" xmlUrl="https://c.example/feed"/>
    </outline>
    <outline type="rss" text="一级 Feed" xmlUrl="https://top.example/feed"/>
  </body>
</opml>`

const entries: CatalogEntry[] = [
  { name: 'Alpha', category: 'AI', url: 'https://a.example', catalog: 'one' },
  { name: 'Beta', category: 'News', url: 'https://b.example/alpha', catalog: 'two' },
  { name: 'Gamma', category: 'AI', url: 'https://c.example', catalog: 'two' },
]

describe('parseOpml', () => {
  it('一级 outline 为分类，含 xmlUrl 的 outline 为订阅源；实体解码', () => {
    expect(parseOpml(SAMPLE_OPML)).toEqual([
      { name: 'Feed A', category: 'AI & ML', url: 'https://a.example/feed' },
      { name: 'Feed <B>', category: 'AI & ML', url: 'https://b.example/feed' },
      { name: 'Feed C', category: '按 title 取分类', url: 'https://c.example/feed' },
    ])
  })

  it('分类名优先 text，缺 text 用 title，都缺为「未分类」', () => {
    const xml = '<outline><outline text="F" xmlUrl="https://f.example"/></outline>'
    expect(parseOpml(xml)[0].category).toBe('未分类')
  })

  it('无 xmlUrl / 无名字的 outline 跳过；单引号双引号都收', () => {
    const xml = [
      '<outline text="C">',
      '  <outline text="NoUrl"/>',
      '  <outline xmlUrl="https://n.example"/>',
      "  <outline text='单引号' xmlUrl='https://q.example'/>",
      '</outline>',
    ].join('\n')
    expect(parseOpml(xml)).toEqual([{ name: '单引号', category: 'C', url: 'https://q.example' }])
  })

  it('带 type 属性的一级 outline 不算分类（只收无 type/xmlUrl 的分类块）', () => {
    expect(parseOpml('<outline type="rss" text="一级 Feed" xmlUrl="https://top.example/feed"/>')).toEqual([])
  })

  it('非 OPML 文本 / 空串返回空数组', () => {
    expect(parseOpml('not xml at all')).toEqual([])
    expect(parseOpml('')).toEqual([])
  })
})

describe('getCatalogCategories', () => {
  it('按出现顺序去重', () => {
    expect(getCatalogCategories(entries)).toEqual(['AI', 'News'])
    expect(getCatalogCategories([])).toEqual([])
  })
})

describe('searchCatalogEntries', () => {
  it('名称命中排在分类 / URL 命中之前，保持各自原顺序', () => {
    // 'alpha'：Alpha（名称命中）优先于 Beta（URL 命中）
    expect(searchCatalogEntries(entries, 'alpha', 10).map((entry) => entry.name)).toEqual(['Alpha', 'Beta'])
  })

  it('查询 trim + 小写；空查询返回全部（受 limit 截断）', () => {
    expect(searchCatalogEntries(entries, '  GAMMA ', 10).map((entry) => entry.name)).toEqual(['Gamma'])
    expect(searchCatalogEntries(entries, '   ', 2).map((entry) => entry.name)).toEqual(['Alpha', 'Beta'])
  })

  it('category / catalog 非空时先过滤（精确匹配，空串不过滤）', () => {
    expect(searchCatalogEntries(entries, '', 10, 'AI').map((entry) => entry.name)).toEqual(['Alpha', 'Gamma'])
    expect(searchCatalogEntries(entries, '', 10, undefined, 'two').map((entry) => entry.name)).toEqual(['Beta', 'Gamma'])
    expect(searchCatalogEntries(entries, 'a', 10, '', '').map((entry) => entry.name)).toEqual(['Alpha', 'Beta', 'Gamma'])
  })

  it('limit 截断在合并结果上生效', () => {
    expect(searchCatalogEntries(entries, '', 1).map((entry) => entry.name)).toEqual(['Alpha'])
  })
})

describe('内置快照', () => {
  it('ROUTES 共 98 条，字段完整且 URL 唯一', () => {
    expect(ROUTES).toHaveLength(98)
    for (const record of ROUTES) {
      expect(record.name.trim(), record.url).not.toBe('')
      expect(record.category.trim(), record.name).not.toBe('')
      expect(record.url, record.name).toMatch(/^https:\/\//)
    }
    expect(new Set(ROUTES.map((record) => record.url)).size).toBe(ROUTES.length)
  })

  it('ROUTES 覆盖 12 个分类（与 routes-data 头部注释一致）', () => {
    expect(new Set(ROUTES.map((record) => record.category)).size).toBe(12)
  })

  it('getBuiltinCatalogEntries 给每条打上内置来源名，且不修改原快照', () => {
    const builtin = getBuiltinCatalogEntries()
    expect(builtin).toHaveLength(ROUTES.length)
    expect(builtin.every((entry) => entry.catalog === BUILTIN_CATALOG_NAME)).toBe(true)
    expect(ROUTES.every((record) => !('catalog' in record))).toBe(true)
  })
})
