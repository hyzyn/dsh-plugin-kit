/**
 * @hyzyn/dsh-rss — 「全源抓取失败」与「落盘原子性」的回归测试。
 *
 * 两条一起守的原因：
 *   - 全源失败仍落一份**空 digest**：文件一旦存在，`ensureTodayDigest` 与调度器当天
 *     都不再重生成——一次弱网 / 断网撞上生成时刻就把「抓取失败」钉成「今天没有新闻」
 *     一整天（本包无台账号，现场与修法见本轮 commit）；
 *   - 半截 JSON 落盘：`readRssStore` 解析失败是**静默**回落内置默认，用户的源 /
 *     目录 / 设置无声消失，并被下一次保存固化。
 *
 * IO 全部隔离到临时目录（`DSH_RSS_CONFIG_FILE` + `config.digestDir`），网络用 stub 的
 * fetch；不碰真实 `~/.dsh`。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildSystemPromptText, generateDigest, readRssStore, writeRssStore } from '../src/index.js'

const FEED_XML = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<rss version="2.0"><channel><title>测试频道</title>',
  '<item><title>新闻</title><link>https://s.example/new</link><guid>new</guid>',
  '<description>摘要</description><pubDate>Tue, 02 Jan 2024 00:00:00 GMT</pubDate></item>',
  '</channel></rss>',
].join('')

let root: string
let originalConfigFile: string | undefined

beforeEach(() => {
  originalConfigFile = process.env.DSH_RSS_CONFIG_FILE
  root = mkdtempSync(join(tmpdir(), 'dsh-rss-digest-'))
  process.env.DSH_RSS_CONFIG_FILE = join(root, 'rss.json')
})

afterEach(() => {
  vi.unstubAllGlobals()
  if (originalConfigFile === undefined) delete process.env.DSH_RSS_CONFIG_FILE
  else process.env.DSH_RSS_CONFIG_FILE = originalConfigFile
  rmSync(root, { recursive: true, force: true })
})

describe('全源失败不落盘', () => {
  it('全部源抓取失败 → 不留空 digest / latest.json，并如实回报每个源的错误', async () => {
    const digestDir = join(root, 'digest')
    writeRssStore({
      sources: [
        { name: '源A', url: 'https://a.example/feed' },
        { name: '源B', url: 'https://b.example/feed' },
      ],
      categories: [],
      catalogs: [],
    })
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down') }))

    const result = await generateDigest({ digestDir }, {})

    expect(result.items).toEqual([])
    expect(result.errors).toHaveLength(2)
    // 关键：不落盘。落了就会把「抓取失败」钉成「今天没有新闻」，且当天不再重生成
    expect(existsSync(result.file)).toBe(false)
    expect(existsSync(join(digestDir, 'latest.json'))).toBe(false)
  })

  it('有源成功（哪怕只有一条）→ 照旧落盘，且 latest.json 完整可解析', async () => {
    const digestDir = join(root, 'digest')
    writeRssStore({
      sources: [{ name: '源A', url: 'https://a.example/feed' }],
      categories: [],
      catalogs: [],
    })
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, statusText: 'OK', text: async () => FEED_XML })))

    const result = await generateDigest({ digestDir }, {})

    expect(result.items).toHaveLength(1)
    expect(result.errors).toEqual([])
    expect(existsSync(result.file)).toBe(true)
    const latest = JSON.parse(readFileSync(join(digestDir, 'latest.json'), 'utf8')) as { items: unknown[] }
    expect(latest.items).toHaveLength(1)
  })
})

describe('store 写入原子性', () => {
  it('writeRssStore 写出的内容完整、不留 .tmp 残渣', () => {
    writeRssStore({
      sources: [{ name: '源A', url: 'https://a.example/feed' }],
      categories: [],
      catalogs: [],
    })
    const file = process.env.DSH_RSS_CONFIG_FILE ?? ''
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as { sources: Array<{ name: string }> }
    expect(parsed.sources[0]?.name).toBe('源A')
    // tmp + rename：目录里不该留下半成品
    expect(readdirSync(root).filter((name) => name.includes('.tmp'))).toEqual([])
  })

  it('（对照）半截 JSON 会被静默回落内置默认——所以写入必须原子', () => {
    // 这条钉住「为什么」而不是「怎么写的」：非原子写一旦留下半截文件，用户的源
    // 就无声消失（没有报错、没有告警），下一次保存还会把默认值固化下去
    writeFileSync(process.env.DSH_RSS_CONFIG_FILE ?? '', '{"sources":[{"name":"源A"')
    const store = readRssStore()
    expect(store.sources.some((source) => source.name === '源A')).toBe(false)
  })
})

describe('systemPrompt 文案：失败 ≠ 没有新条目', () => {
  it('全源失败说「本次未能生成」，绝不说「暂无新条目」', () => {
    const text = buildSystemPromptText({
      date: '2026-09-28',
      file: '/tmp/never-written.md',
      items: [],
      errors: [{ source: '源A', error: 'network down' }],
      generatedAt: '2026-09-28T00:00:00.000Z',
    })
    expect(text).toContain('未能生成')
    expect(text).toContain('全部抓取失败')
    expect(text).not.toContain('暂无新条目')
  })

  it('确实没有新条目（无错误）仍说「已生成，但暂无新条目」', () => {
    const text = buildSystemPromptText({
      date: '2026-09-28',
      file: '/tmp/empty.md',
      items: [],
      errors: [],
      generatedAt: '2026-09-28T00:00:00.000Z',
    })
    expect(text).toContain('暂无新条目')
    expect(text).not.toContain('未能生成')
  })
})
