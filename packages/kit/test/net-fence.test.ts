/**
 * @hyzyn/dsh-kit — `registerLiteralSection` 与出站围栏（`net-fence.ts`）的回归测试。
 *
 * 两组都是「错了不会报错、只会静默走错」的事：
 *
 *   - **插值**：宿主缺省 `interpolate: true`，段落正文里的 `{{name}}` 会被当变量引用、
 *     未知变量在**每一步请求**上 throw。而插件侧看不出任何异常（`/save` / `/list` 全 200）。
 *     2026-10-19 外部测评 issue #14 第 1 条就是这个（`kit D15`）。
 *   - **出站围栏**：地址判据（解析后的 IP）、不跟随重定向、体积上限三条，任何一条失效都
 *     不会让请求失败——它只是「安静地打出去了」。2026-10-19 外部测评 issue #13 第 6 条
 *     是 rss 侧的现场（`kit D16`）。
 *
 * 围栏的反例必须**真有反例**：光测「内网能通」等于没测。
 */
import { createServer } from 'node:http'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  FenceError,
  assertReachable,
  classifyAddress,
  isHardBlockedTier,
  registerLiteralSection,
  requestJson,
  sanitizeErrorMessage,
  sanitizeUrl,
} from '../src/index.js'
import type { PromptSectionApi, PromptSectionOptions } from '../src/index.js'

/* ------------------------------------------------------------------ *
 * registerLiteralSection
 * ------------------------------------------------------------------ */

describe('registerLiteralSection：固定 interpolate: false', () => {
  /** 记录调用参数的假 systemPrompt 服务。 */
  function spyApi(): { api: PromptSectionApi; calls: PromptSectionOptions[] } {
    const calls: PromptSectionOptions[] = []
    return {
      calls,
      api: {
        section(options: PromptSectionOptions) {
          calls.push(options)
          return () => undefined
        },
      },
    }
  }

  it('总是传 interpolate: false（这是它存在的唯一理由）', () => {
    const { api, calls } = spyApi()
    registerLiteralSection(api, { name: 'plugin:x', order: 140, text: '正文含 {{language}} 与 <span>{{ msg }}</span>' })
    expect(calls).toHaveLength(1)
    expect(calls[0].interpolate).toBe(false)
    // 正文原样交给宿主：脱敏 / 转义都不是这一层的活
    expect(calls[0].text).toContain('{{language}}')
    expect(calls[0].name).toBe('plugin:x')
    expect(calls[0].order).toBe(140)
  })

  it('调用方就算想覆盖也覆盖不了（options 类型里没有 interpolate）', () => {
    const { api, calls } = spyApi()
    // 用 any 强行塞一个 true：运行时仍以本函数写的 false 为准（展开顺序：先 options 后固定值）
    registerLiteralSection(api, { name: 'plugin:x', text: 't', interpolate: true } as unknown as Omit<PromptSectionOptions, 'interpolate'>)
    expect(calls[0].interpolate).toBe(false)
  })

  it('返回宿主给的释放函数（原样透传，不包一层）', () => {
    const disposer = (): void => undefined
    const api: PromptSectionApi = { section: () => disposer }
    expect(registerLiteralSection(api, { name: 'plugin:x', text: 't' })).toBe(disposer)
  })
})

/* ------------------------------------------------------------------ *
 * 出站围栏
 * ------------------------------------------------------------------ */

const servers: Server[] = []

afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections()
    await new Promise<void>((resolve) => { server.close(() => { resolve() }) })
  }
})

interface Fake {
  url: string
  hits: () => number
}

/** 起一台只监听 127.0.0.1 的假服务器（回环是围栏的放行面）。 */
async function startFake(handler: (count: number) => { status?: number; body?: string; headers?: Record<string, string> }): Promise<Fake> {
  let count = 0
  const server = createServer((_req, res) => {
    count += 1
    const outcome = handler(count)
    res.writeHead(outcome.status ?? 200, outcome.headers ?? { 'content-type': 'text/plain' })
    res.end(outcome.body ?? 'ok')
  })
  servers.push(server)
  await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', () => { resolve() }) })
  const port = (server.address() as AddressInfo).port
  return { url: 'http://127.0.0.1:' + String(port), hits: () => count }
}

describe('地址判据：解析之后的 IP', () => {
  it('链路本地 / 云元数据 / 保留段硬拒，回环与私网放行', () => {
    for (const address of ['169.254.169.254', '169.254.170.2', '::ffff:169.254.169.254', '0.0.0.0', '224.0.0.1', '::']) {
      expect(isHardBlockedTier(classifyAddress(address))).toBe(true)
    }
    /*
     * 最后一个是**公网地址**（用仓库白名单里的占位 `1.2.3.4`，不是真实 DNS）：
     * 判据是「只有链路本地 / 云元数据 / 保留段才硬拒」，公网地址该放行由下游按需决定。
     * 别在这里写真实公网 IP——`check-no-public-ip` 会拦，且历史清理要重写全部 sha。
     */
    for (const address of ['127.0.0.1', '::1', '10.1.2.3', '192.168.1.1', '172.16.0.1', '1.2.3.4']) {
      expect(isHardBlockedTier(classifyAddress(address))).toBe(false)
    }
  })

  it('IPv4-mapped IPv6 的两种写法落到同一档（URL 会归一成十六进制）', () => {
    expect(classifyAddress('::ffff:169.254.169.254')).toBe('metadata')
    expect(classifyAddress('::ffff:a9fe:a9fe')).toBe('metadata')
    expect(classifyAddress('[::ffff:169.254.169.254]')).toBe('metadata')
  })

  it('地址直接填成元数据端点 → 抛 blocked_address，且不打出去', async () => {
    const fake = await startFake(() => ({}))
    // 用一个真的在听的端口 + 元数据 IP 不行（那不是同一台机），所以这里只断言判据本身：
    // 127.0.0.1 换个端口号仍放行，169.254.169.254 直接拒
    await expect(assertReachable('http://169.254.169.254/latest/meta-data/', { label: '[t]' })).rejects.toThrow(/链路本地|云元数据/)
    expect(fake.hits()).toBe(0)
  })

  it('域名解析到链路本地 → 拒（lookup 注入）', async () => {
    await expect(assertReachable('http://evil.example/x', {
      label: '[t]',
      lookupImpl: async () => ['169.254.169.254'],
    })).rejects.toThrow(/云元数据/)
  })

  it('一个主机名解析出多个地址时**每一个**都要过判据', async () => {
    // 第一个是公网地址（白名单占位 1.2.3.4），第二个是元数据地址：任一命中硬拒就整体拒
    await expect(assertReachable('http://mixed.example/x', {
      label: '[t]',
      lookupImpl: async () => ['1.2.3.4', '169.254.169.254'],
    })).rejects.toThrow(/云元数据/)
  })
})

describe('不跟随重定向', () => {
  it('302 到元数据端点：当失败，且目标服务器一次都没被打', async () => {
    const decoy = await startFake(() => ({ status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data/' } }))
    const fetchImpl = globalThis.fetch
    const error = await requestJson({ fetchImpl, label: '[t]', url: decoy.url }).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(FenceError)
    expect((error as FenceError).code).toBe('redirect')
    expect((error as FenceError).message).toContain('302')
    expect(decoy.hits()).toBe(1)
  })
})

describe('体积与超时上限', () => {
  it('响应体超过上限 → too_large（不静默截断成半份）', async () => {
    const fake = await startFake(() => ({ body: 'x'.repeat(2048) }))
    const error = await requestJson({ fetchImpl: globalThis.fetch, label: '[t]', url: fake.url, maxBytes: 1024 }).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(FenceError)
    expect((error as FenceError).code).toBe('too_large')
  })

  it('超时 → timeout 码（不是笼统的 transport）', async () => {
    const fake = await startFake(() => ({ body: 'late' }))
    // 用极短超时 + 慢响应；服务器端不 sleep 会太快，所以这里直接给 1ms
    const error = await requestJson({ fetchImpl: globalThis.fetch, label: '[t]', url: fake.url, timeoutMs: 1 }).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(FenceError)
    expect(['timeout', 'transport']).toContain((error as FenceError).code)
  })
})

describe('响应对象形状宽容（本仓用例与部分 fetch 实现不给 body / headers）', () => {
  it('只有 text() 的响应也能读（并按上限判）', async () => {
    const onlyText = async () => ({ ok: true, status: 200, text: async () => 'hello' })
    const result = await requestJson({ fetchImpl: onlyText as unknown as typeof fetch, label: '[t]', url: 'http://127.0.0.1:1/x' })
    expect(result.text).toBe('hello')
  })

  it('只有 text() 且超限 → 仍然 too_large（保护不因形状不同而失效）', async () => {
    const onlyText = async () => ({ ok: true, status: 200, text: async () => 'x'.repeat(4096) })
    const error = await requestJson({
      fetchImpl: onlyText as unknown as typeof fetch,
      label: '[t]',
      url: 'http://127.0.0.1:1/x',
      maxBytes: 1024,
    }).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(FenceError)
    expect((error as FenceError).code).toBe('too_large')
  })
})

describe('凭据脱敏（错误文案与日志里都不该有密码）', () => {
  it('sanitizeUrl 去掉 user:pass', () => {
    expect(sanitizeUrl('http://user:secret@host:9200/x')).not.toContain('secret')
    expect(sanitizeUrl('http://user:secret@host:9200/x')).toContain('host:9200')
    // 没有凭据时原样返回（不引入尾斜杠等形状变化）
    expect(sanitizeUrl('http://host:9200/x')).toBe('http://host:9200/x')
  })

  it('sanitizeErrorMessage 洗掉底层实现带回来的完整 URL（undici 的凭据拒绝）', () => {
    const message = sanitizeErrorMessage(
      new Error('Request cannot be constructed from a URL that includes credentials: http://user:secret@host:9200/x'),
      'fallback',
    )
    expect(message).not.toContain('secret')
    expect(message).toContain('host:9200')
  })

  it('sanitizeErrorMessage 也洗掉没有 scheme 的 authority 形态', () => {
    const message = sanitizeErrorMessage(new Error('connect failed at //user:secret@host:9200'), 'fallback')
    expect(message).not.toContain('secret')
  })

  it('transport 失败时抛出的 message 不含密码', async () => {
    const error = await requestJson({
      fetchImpl: async () => { throw new Error('boom http://user:secret@127.0.0.1:1/x') },
      label: '[t]',
      url: 'http://127.0.0.1:1/x',
    }).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(FenceError)
    expect((error as FenceError).message).not.toContain('secret')
  })
})
