/**
 * @hyzyn/dsh-docker — 「当前 SSH 会话 ↔ 已配置 docker 目标」匹配的回归测试。
 *
 * 实测踩过的 bug：从**连接簿**打开的 SSH 标签，tty 给的 spec 只有条目名
 * （`{t:'ssh', name: bookName, command}`）、**没有 host**；面板因此判成「该主机尚未
 * 配置为 Docker 目标」，即使同一台主机早就配过目标（只是那条目标引用的是另一条
 * 连接簿条目：`lab-a` vs `192.0.2.10`）。修复=用宿主回显的 `tab.target`
 * 兜底解析出 host:port。
 */
import { describe, expect, it } from 'vitest'
import { bookSessionHost, parseUserHostPort, pickTargetByHost, sessionHostPort } from '../client-src/session-target.js'

/** 用户实际的目标配置：目标1 引用连接簿 lab-a（→ root@192.0.2.10）。 */
const TARGETS = [
  { name: '目标1', kind: 'ssh', label: 'root@192.0.2.10', ok: true },
  { name: '目标2', kind: 'ssh', label: 'root@192.0.2.161', ok: true },
]

describe('parseUserHostPort', () => {
  it('解析 user@host（端口缺省 22）', () => {
    expect(parseUserHostPort('root@192.0.2.10')).toEqual({ host: '192.0.2.10', port: 22 })
  })

  it('解析 user@host:port', () => {
    expect(parseUserHostPort('root@example.com:2222')).toEqual({ host: 'example.com', port: 2222 })
  })

  it('不是 user@host 形态的一律 undefined（如宿主写的「解析失败」）', () => {
    for (const bad of ['解析失败', '', 'no-at-sign', undefined, null, 42]) {
      expect(parseUserHostPort(bad), `输入 ${JSON.stringify(bad)}`).toBeUndefined()
    }
  })
})

describe('sessionHostPort', () => {
  it('spec 自带 host 时用它（内联规格）', () => {
    expect(sessionHostPort({ t: 'ssh', host: '10.0.0.1', port: 2222 }, '')).toEqual({ host: '10.0.0.1', port: 2222 })
    expect(sessionHostPort({ t: 'ssh', host: '10.0.0.1' }, '')).toEqual({ host: '10.0.0.1', port: 22 })
  })

  it('【本 bug】spec 只有连接簿条目名时，用宿主回显的实际连接兜底', () => {
    const spec = { t: 'ssh', name: '192.0.2.10', command: '' }
    expect(sessionHostPort(spec, 'hsadmin@192.0.2.10')).toEqual({ host: '192.0.2.10', port: 22 })
  })

  it('两边都拿不到 host 时返回 undefined（不猜）', () => {
    expect(sessionHostPort({ t: 'ssh', name: 'x' }, '')).toBeUndefined()
    expect(sessionHostPort({ t: 'ssh', name: 'x' })).toBeUndefined()
  })
})

describe('pickTargetByHost', () => {
  it('【本 bug 的完整判定】会话经 192.0.2.10 条目、目标是 lab-a 条目 → 仍命中目标1', () => {
    const spec = { t: 'ssh', name: '192.0.2.10' }
    const session = sessionHostPort(spec, 'hsadmin@192.0.2.10')
    expect(pickTargetByHost(TARGETS, session)).toBe('目标1')
  })

  it('用户名不参与比较：同一个主机的另一条连接簿条目（root）也能命中', () => {
    expect(pickTargetByHost(TARGETS, { host: '192.0.2.10', port: 22 })).toBe('目标1')
  })

  it('端口不同不算命中', () => {
    expect(pickTargetByHost(TARGETS, { host: '192.0.2.10', port: 2222 })).toBeUndefined()
  })

  it('主机不同不算命中', () => {
    expect(pickTargetByHost(TARGETS, { host: '10.1.1.1', port: 22 })).toBeUndefined()
  })

  it('本机目标不参与 SSH 匹配；label 异常的行跳过', () => {
    const rows = [
      { name: '本机', kind: 'local', label: '本机' },
      { name: '坏目标', kind: 'ssh', label: '解析失败', ok: false },
      ...TARGETS,
    ]
    expect(pickTargetByHost(rows, { host: '192.0.2.10', port: 22 })).toBe('目标1')
    expect(pickTargetByHost(rows, { host: '127.0.0.1', port: 22 })).toBeUndefined()
  })

  it('会话未知（undefined）或行集合不是数组时不匹配', () => {
    expect(pickTargetByHost(TARGETS, undefined)).toBeUndefined()
    expect(pickTargetByHost(undefined, { host: '192.0.2.10', port: 22 })).toBeUndefined()
  })
})

/**
 * 第二层兜底：连接**还没建立 / 建立失败**时，spec 没有 host、`tab.target` 也没有值
 * （宿主只在连接成功后才回显），此时只能靠 `/config.ttyBookHosts` 里该连接簿条目
 * 自己填的地址。实测踩过的坑：SSH 握手超时那一刻，面板判成「该主机没配目标」，
 * 于是沿用了上一次的目标，把**另一台主机**的容器摆在屏幕上。
 */
describe('bookSessionHost（连接簿条目 → host:port）', () => {
  /** 用户实际的连接簿：同一台机器 4 条，目标1 引用的是 lab-a。 */
  const BOOKS = [
    { name: 'lab-a', host: '192.0.2.10', port: 22 },
    { name: '192.0.2.10', host: '192.0.2.10', port: 22 },
    { name: 'lab-b', host: '192.0.2.161', port: 22 },
    { name: 'HS_248_ADMIN', host: '192.0.2.10', port: 2222 },
  ]

  it('按条目名取出 host:port', () => {
    expect(bookSessionHost('192.0.2.10', BOOKS)).toEqual({ host: '192.0.2.10', port: 22 })
    expect(bookSessionHost('HS_248_ADMIN', BOOKS)).toEqual({ host: '192.0.2.10', port: 2222 })
  })

  it('端口缺失 / 非法一律按 22', () => {
    expect(bookSessionHost('x', [{ name: 'x', host: '10.0.0.1' }])).toEqual({ host: '10.0.0.1', port: 22 })
    expect(bookSessionHost('x', [{ name: 'x', host: '10.0.0.1', port: 0 }])).toEqual({ host: '10.0.0.1', port: 22 })
    expect(bookSessionHost('x', [{ name: 'x', host: '10.0.0.1', port: 'nope' }])).toEqual({ host: '10.0.0.1', port: 22 })
  })

  it('条目不存在 / host 为空 / 名字为空时不猜', () => {
    expect(bookSessionHost('没这条', BOOKS)).toBeUndefined()
    expect(bookSessionHost('', BOOKS)).toBeUndefined()
    expect(bookSessionHost(undefined, BOOKS)).toBeUndefined()
    expect(bookSessionHost('x', [{ name: 'x', host: '  ' }])).toBeUndefined()
    expect(bookSessionHost('x', undefined)).toBeUndefined()
  })

  it('【本 bug 的完整判定】连不上时：会话走「192.0.2.10」条目、目标1 引用「lab-a」→ 仍命中目标1', () => {
    const spec = { t: 'ssh', name: '192.0.2.10', command: '' }
    // 连接失败：宿主没回显 tab.target
    expect(sessionHostPort(spec, '')).toBeUndefined()
    const session = bookSessionHost(spec.name, BOOKS)
    expect(pickTargetByHost(TARGETS, session)).toBe('目标1')
  })

  it('老宿主没有 ttyBookHosts 字段时退化为「匹配不上」（不抛、不猜）', () => {
    expect(bookSessionHost('lab-a', undefined)).toBeUndefined()
    expect(bookSessionHost('lab-a', [])).toBeUndefined()
  })
})
