/**
 * @hyzyn/dsh-tty — 终端 WebSocket 地址推导规则的单元测试。
 *
 * 为什么有这份测试（2026-09-24）：这条规则原先只用 `location` 拼，在桌面版
 * （DeepSeek Harness Desktop）下算错成 `ws://app/api/dsh-tty/ws`，终端面板
 * 「能打开但永远连不上」——而且因为面板里其余 HTTP 都是相对路径、经桌面壳的
 * `protocol.handle` 转发，其余功能全好，所以这个缺陷不会在浏览器侧的冒烟里暴露。
 * 下面第一组就是钉住那条回归；第三组钉住「浏览器直连行为与旧实现逐字等价」，
 * 免得修桌面时把 web profile 弄坏。
 *
 * 推导与成因的完整说明见 `client-src/ws-url.js` 的文件头。
 */
import { describe, expect, it } from 'vitest'
import { deriveWsUrl, WS_PATH } from '../client-src/ws-url.js'

describe('deriveWsUrl', () => {
  it('桌面版：以 __DSH_TRANSPORT__.streamBaseUrl 为准，不再拼出 ws://app', () => {
    // 回归现场：页面 origin 是 Electron 自定义协议，宿主真实 origin 由 preload 注入
    expect(deriveWsUrl('dsh-app://app/', 'http://127.0.0.1:19387')).toBe(`ws://127.0.0.1:19387${WS_PATH}`)
    expect(deriveWsUrl('dsh-app://app/', 'http://127.0.0.1:19387')).not.toContain('//app')
  })

  it('桌面版：streamBaseUrl 缺省 / 空串时退回页面自身（退化路径不抛错）', () => {
    expect(deriveWsUrl('http://127.0.0.1:3082/', undefined)).toBe(`ws://127.0.0.1:3082${WS_PATH}`)
    expect(deriveWsUrl('http://127.0.0.1:3082/', '')).toBe(`ws://127.0.0.1:3082${WS_PATH}`)
    expect(deriveWsUrl('http://127.0.0.1:3082/', null)).toBe(`ws://127.0.0.1:3082${WS_PATH}`)
  })

  it('浏览器直连：与旧实现（location.host）逐字等价，端口/路径都不影响', () => {
    expect(deriveWsUrl('http://127.0.0.1:3082/')).toBe(`ws://127.0.0.1:3082${WS_PATH}`)
    // 带路径 / 查询 / hash 的页面地址：只取 host
    expect(deriveWsUrl('http://127.0.0.1:3082/some/path?q=1#x')).toBe(`ws://127.0.0.1:3082${WS_PATH}`)
    // 默认端口省略形态
    expect(deriveWsUrl('http://localhost/')).toBe(`ws://localhost${WS_PATH}`)
  })

  it('https / wss：按页面或宿主 base 的协议选 wss', () => {
    expect(deriveWsUrl('https://example.test/')).toBe(`wss://example.test${WS_PATH}`)
    // 反向代理：页面是 https，宿主 streamBaseUrl 也是 https
    expect(deriveWsUrl('https://example.test/', 'https://example.test')).toBe(`wss://example.test${WS_PATH}`)
  })

  it('streamBaseUrl 是相对值时不炸，按页面地址解析', () => {
    expect(deriveWsUrl('http://127.0.0.1:3082/', '/')).toBe(`ws://127.0.0.1:3082${WS_PATH}`)
  })
})
