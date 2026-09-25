/**
 * `scripts/client-host-url.mjs` 的单元测试 —— 客户端半体「宿主地址来源」规则。
 *
 * 为什么有这份测试：这条规则是**只会失败、平时不出声**的防线（规则上线时全仓库 0 命中），
 * 所以它自己漂了没人会发现——两种漂法都会让防线白给：
 *
 *   ① **漏报**：规则改松 / AST 遍历写错 → 下一个 D61 照样溜进桌面版（而 vitest、tsc 检查、
 *      CDP 冒烟、各包 preview harness 四层都抓不到它，见规则模块的文件头）；
 *   ② **误报**：规则改紧 → 对着合法代码报错，最后一定会被人削弱或加豁免，防线同样白给。
 *
 * 所以下面两组断言各有分工：第 1–5 组钉住"该报的必须报"，第 6 组钉住**刻意不查的范围**
 * （那是范围决定，不是遗漏，理由见规则模块"刻意不查什么"一节），第 7 组对**真实语料**做一次
 * 全量断言——它同时证明"规则上线即绿"，也拦住以后有人把 `location` 拼地址写回去。
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { listClientSourceFiles, scanHostUrlUses } from '../client-host-url.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

/** 扫一段源码，只回 kind 与人读描述，断言写起来短一些。 */
const scan = (text, fileName = 'client.js') => scanHostUrlUses(fileName, text)
const kinds = (text) => scan(text).map((item) => item.kind)

describe('scanHostUrlUses · location 推地址（D61 的根因）', () => {
  it('抓 location.protocol / location.host —— 就是 D61 那两行', () => {
    const source = [
      'function wsUrl() {',
      "  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'",
      "  return proto + '//' + location.host + WS_PATH",
      '}',
    ].join('\n')
    const found = scan(source)
    expect(found.map((item) => item.detail)).toEqual(['location.protocol', 'location.host'])
    // 位置要准到行（CLI 靠它打印 file:line:col）
    expect(found.map((item) => item.line)).toEqual([2, 3])
    expect(found[0].file).toBe('client.js')
  })

  it('五个 origin 类属性都抓；location.port 也算（同样只用于拼绝对地址）', () => {
    expect(kinds('const a = location.protocol')).toEqual(['location-origin'])
    expect(kinds('const a = location.host')).toEqual(['location-origin'])
    expect(kinds('const a = location.hostname')).toEqual(['location-origin'])
    expect(kinds('const a = location.origin')).toEqual(['location-origin'])
    expect(kinds('const a = location.port')).toEqual(['location-origin'])
  })

  it('location 链的各种持有者都抓：window / document / globalThis / self / 下标形式', () => {
    expect(kinds('const a = window.location.host')).toEqual(['location-origin'])
    expect(kinds('const a = document.location.origin')).toEqual(['location-origin'])
    expect(kinds('const a = globalThis.location.protocol')).toEqual(['location-origin'])
    expect(kinds('const a = self.location.hostname')).toEqual(['location-origin'])
    expect(kinds("const a = location['host']")).toEqual(['location-origin'])
    expect(kinds("const a = window.location['protocol']")).toEqual(['location-origin'])
  })
})

describe('scanHostUrlUses · 硬编码 WS 地址', () => {
  it('ws:// 与 wss:// 字面量都抓', () => {
    expect(kinds("const u = 'ws://127.0.0.1:3080/api/dsh-tty/ws'")).toEqual(['hardcoded-ws'])
    expect(kinds("const u = 'wss://example.test/api'")).toEqual(['hardcoded-ws'])
  })

  it('模板串的头部同样抓：`ws://${host}` 也是硬编码', () => {
    expect(kinds('const u = `ws://${host}/api`')).toEqual(['hardcoded-ws'])
    expect(kinds('const u = `wss://${host}/api`')).toEqual(['hardcoded-ws'])
  })

  it("裸 scheme 前缀 'wss:' 不算（没有 //)，避免误伤协议三元判断", () => {
    expect(kinds("const proto = location.host ? 'wss:' : 'ws:'")).toEqual(['location-origin'])
  })
})

describe('scanHostUrlUses · 不误报（误报会让规则被人削弱）', () => {
  it('注释与文档字符串天然免判——用 AST 而不是正则的全部意义', () => {
    const source = [
      '/* 桌面版页面 origin 是 dsh-app://app，从 location.host 推会拼出',
      ' * ws://app/api/dsh-tty/ws 这种连不上的地址（见 D61） */',
      "const doc = '旧实现用的是 location.host + ws://app，别照抄'",
      '// const proto = location.protocol',
    ].join('\n')
    expect(scan(source)).toEqual([])
  })

  it('location 的深链用法不查：search / hash / pathname / reload / assign', () => {
    expect(scan('const q = location.search')).toEqual([])
    expect(scan('const h = location.hash')).toEqual([])
    expect(scan('const p = location.pathname')).toEqual([])
    expect(scan('location.reload()')).toEqual([])
    expect(scan("location.assign('/next')")).toEqual([])
  })

  it('相对地址 + 基址解析是正确写法，不查', () => {
    expect(scan('const u = new URL(path, document.baseURI)')).toEqual([])
    expect(scan('const r = await fetch(\'/api/dsh-tty/config\')')).toEqual([])
    expect(scan('new WebSocket(deriveWsUrl(document.baseURI, globalThis.__DSH_TRANSPORT__?.streamBaseUrl))')).toEqual([])
  })
})

describe('scanHostUrlUses · 刻意不查 http(s) 字面量（范围决定，不是遗漏）', () => {
  /*
   * 这三条都是**真实存量**，全部合法：要对它们报错，规则上线第一天就得加豁免，
   * 加了豁免的规则等于没有。理由见规则模块「刻意不查什么」。
   */
  it('mcp 的输入提示 placeholder 是文案，不是要请求的地址', () => {
    expect(scan('<input placeholder="http://localhost:3000/mcp">')).toEqual([])
  })

  it('SVG xmlns 与 RSS 源地址是数据', () => {
    expect(scan("const svg = { xmlns: 'http://www.w3.org/2000/svg' }")).toEqual([])
    expect(scan("const feed = { url: 'https://sspai.com/feed', site: 'https://sspai.com/' }")).toEqual([])
  })

  it('第三方 API 的绝对地址是业务需要（不查 http(s)，只查 ws(s) 与 location）', () => {
    expect(scan("await fetch('https://api.example.test/v1/items')")).toEqual([])
  })
})

describe('真实语料：全部客户端半体 0 命中', () => {
  /*
   * 口径与 client-lint 完全一致（同一个 listClientSourceFiles）：有 client-src/ 查源码全量，
   * 否则查裸 client.js。这条同时是「规则上线即绿」的证据，和「以后有人写回去」的拦截网。
   */
  const packages = ['codegraph', 'docker', 'env', 'kit-settings', 'mcp', 'profile', 'prompt', 'rss', 'search', 'tty']

  it('每个包都能被找到客户端半体（名单漂了要在这里发现）', () => {
    const missing = packages.filter((name) => listClientSourceFiles(join(repoRoot, 'packages', name)).length === 0)
    expect(missing).toEqual([])
  })

  for (const name of packages) {
    it(`${name} 无违规`, () => {
      const files = listClientSourceFiles(join(repoRoot, 'packages', name))
      const found = files.flatMap((file) => scanHostUrlUses(file, readFileSync(file, 'utf8')))
      expect(found.map((item) => `${item.file}:${String(item.line)} ${item.detail}`)).toEqual([])
    })
  }
})
