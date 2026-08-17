#!/usr/bin/env node
/**
 * 生成 src/routes-data.ts —— awesome-rsshub-routes 订阅源快照。
 *
 * 数据源: https://jackyst0.github.io/awesome-rsshub-routes/
 * 上游仓库: JackyST0/awesome-rsshub-routes（feeds.opml，一级 outline 为分类，
 * 含 xmlUrl 的 outline 为订阅源）。
 *
 * 用法: node scripts/sync-routes.mjs   （仓库根: packages/search）
 * 生成文件带自动生成标记，勿手改；运行时会再尝试从同一 OPML 静默刷新。
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const outFile = join(here, '..', 'src', 'routes-data.ts')

const SOURCES = [
  'https://raw.githubusercontent.com/JackyST0/awesome-rsshub-routes/main/feeds.opml',
  'https://jackyst0.github.io/awesome-rsshub-routes/feeds.opml',
]

/** 基础 XML 实体解码（与 src/routes.ts 的运行时实现保持一致）。 */
function decodeEntities(value) {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      const code = Number.parseInt(hex, 16)
      return Number.isNaN(code) ? _ : String.fromCodePoint(code)
    })
    .replace(/&#(\d+);/g, (_, dec) => {
      const code = Number.parseInt(dec, 10)
      return Number.isNaN(code) ? _ : String.fromCodePoint(code)
    })
}

function getAttr(tag, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = new RegExp(`\\b${escaped}\\s*=\\s*["']([^"']*)["']`).exec(tag)
  return match ? match[1] : undefined
}

/** 解析 OPML：返回 [{ name, category, url }]。 */
function parseOpml(xml) {
  const records = []
  const categoryBlocks = xml.match(/<outline\b(?![^>]*\b(?:xmlUrl|type)\s*=)[^>]*>[\s\S]*?<\/outline>/gi) ?? []
  for (const block of categoryBlocks) {
    const openEnd = block.indexOf('>')
    const openTag = block.slice(0, openEnd + 1)
    const category = decodeEntities(getAttr(openTag, 'text') ?? getAttr(openTag, 'title') ?? '未分类')
    const tags = block.match(/<outline\b[^>]*>/gi) ?? []
    for (const tag of tags) {
      const url = getAttr(tag, 'xmlUrl')
      if (!url) continue
      const name = decodeEntities(getAttr(tag, 'text') ?? getAttr(tag, 'title') ?? '')
      if (!name) continue
      records.push({ name, category, url })
    }
  }
  return records
}

async function fetchOpml() {
  let lastError = null
  for (const url of SOURCES) {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 10000)
      const response = await fetch(url, { signal: controller.signal })
      clearTimeout(timer)
      if (!response.ok) {
        lastError = new Error(`HTTP ${response.status}: ${url}`)
        continue
      }
      return await response.text()
    } catch (error) {
      lastError = error
    }
  }
  throw lastError ?? new Error('all sources failed')
}

let xml = ''
try {
  xml = await fetchOpml()
} catch (error) {
  // 离线也能用本地已下载的 OPML 重新生成（可选）
  const local = join(here, '..', 'feeds.opml')
  try {
    xml = readFileSync(local, 'utf8')
    console.warn(`[sync-routes] 网络不可用，使用本地 ${local}`)
  } catch {
    console.error('[sync-routes] 获取 OPML 失败:', error.message)
    process.exit(1)
  }
}

const routes = parseOpml(xml)
if (routes.length === 0) {
  console.error('[sync-routes] 解析结果为空，拒绝覆盖快照')
  process.exit(1)
}

const categories = new Set(routes.map((route) => route.category))
const lines = [
  '// 本文件由 scripts/sync-routes.mjs 自动生成，请勿手改。',
  '// 数据源: https://jackyst0.github.io/awesome-rsshub-routes/',
  '// 上游: JackyST0/awesome-rsshub-routes 的 feeds.opml',
  `// 生成时间: ${new Date().toISOString()}（${routes.length} 条订阅源 / ${categories.size} 个分类）`,
  '',
  'export interface RouteRecord {',
  '  name: string',
  '  category: string',
  '  url: string',
  '}',
  '',
  'export const ROUTES: RouteRecord[] = [',
  ...routes.map((route) => `  { name: ${JSON.stringify(route.name)}, category: ${JSON.stringify(route.category)}, url: ${JSON.stringify(route.url)} },`),
  ']',
  '',
]
writeFileSync(outFile, lines.join('\n'))
console.log(`[sync-routes] 已生成 ${outFile}: ${routes.length} 条 / ${categories.size} 个分类`)
