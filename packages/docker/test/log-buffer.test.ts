/**
 * @hyzyn/dsh-docker — 日志环形缓冲(log-buffer.js)的回归测试。
 *
 * 背景(D63 根治):「日志多 → 网页崩溃」的内存根因在这里收口——
 *   - 行数 + 字节双限淘汰(旧实现只限行数,大行场景能吃掉数百 MB);
 *   - 残行超限强制分片(旧实现的 pending 无界,无换行输出能拖爆内存);
 *   - 行 id 单调递增(渲染层 React key 的稳定性依赖它)。
 *
 * 纯函数用例,不起进程;模块同时被 client-src/index.js(打包进 client.js)消费,
 * 两边共用同一份实现,这里就是它的行为契约。
 */
import { describe, expect, it } from 'vitest'
import { createLogBuffer, DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES, DEFAULT_MAX_PENDING, splitLogLines } from '../client-src/log-buffer.js'

const text = (n) => 'x'.repeat(n)
const ids = (buffer) => buffer.snapshot().map((entry) => entry.id)

describe('splitLogLines 快照切分(与 pushChunk 同一套语义)', () => {
  it('结尾的 \\n 是终止符,不多切一条空行(--tail N 的计数必须是 N)', () => {
    // D136 现场:`--tail 201` 回 201 行、每行以 \n 结尾 → 旧的 text.split('\n') 切出 202 段
    const text = Array.from({ length: 201 }, (_, i) => 'line ' + String(i)).join('\n') + '\n'
    expect(splitLogLines(text)).toHaveLength(201)
  })

  it('没有结尾换行的最后一行照样算一行', () => {
    expect(splitLogLines('a\nb')).toEqual(['a', 'b'])
    expect(splitLogLines('a\nb\n')).toEqual(['a', 'b'])
  })

  it('真的以空行结尾时,那个空行要留住(只剥一个终止符)', () => {
    expect(splitLogLines('a\n\n')).toEqual(['a', ''])
    expect(splitLogLines('\n')).toEqual([''])
  })

  it('空文本没有行(不是「一行空行」)', () => {
    expect(splitLogLines('')).toEqual([])
  })

  it('与 pushChunk 的结论逐字一致(同一份日志,两个视图不许给不同行数)', () => {
    const text = 'first\nsecond\nthird\n'
    const buffer = createLogBuffer()
    buffer.pushChunk(text)
    // pushChunk 把结尾 \n 之后的尾巴留在 pending → 落地 3 行;快照路径也必须给 3 行
    expect(buffer.pendingLength()).toBe(0)
    expect(buffer.snapshot().map((entry) => entry.text)).toEqual(splitLogLines(text))
  })
})

describe('createLogBuffer pushChunk 行切分与残行', () => {
  it('跨 chunk 残行重组:与一次性到达等价', () => {
    const buffer = createLogBuffer()
    expect(buffer.pushChunk('hello, wor')).toEqual({ appended: 0 })
    expect(buffer.pushChunk('ld\nsecond\nthird')).toEqual({ appended: 2 })
    expect(buffer.snapshot().map((entry) => entry.text)).toEqual(['hello, world', 'second'])
    expect(buffer.pendingLength()).toBe('third'.length)
  })

  it('空串与纯残行不产生行,不触发渲染信号', () => {
    const buffer = createLogBuffer()
    expect(buffer.pushChunk('')).toEqual({ appended: 0 })
    expect(buffer.pushChunk('no-newline-yet')).toEqual({ appended: 0 })
    expect(buffer.count()).toBe(0)
  })

  it('chunk 内多行一次落地', () => {
    const buffer = createLogBuffer()
    expect(buffer.pushChunk('a\nb\nc\n')).toEqual({ appended: 3 })
    expect(buffer.count()).toBe(3)
    expect(buffer.pendingLength()).toBe(0)
  })
})

describe('createLogBuffer 行数上限淘汰', () => {
  it('超限丢最旧,dropped 读后清零', () => {
    const buffer = createLogBuffer({ maxLines: 3 })
    buffer.pushChunk('1\n2\n3\n')
    expect(buffer.pushChunk('4\n').appended).toBe(1)
    expect(buffer.snapshot().map((entry) => entry.text)).toEqual(['2', '3', '4'])
    expect(buffer.takeDropped()).toBe(true)
    expect(buffer.takeDropped()).toBe(false)
  })

  it('至少保留一行:连续涌入也不丢光(maxLines=1 时恒留最新一行)', () => {
    const buffer = createLogBuffer({ maxLines: 1 })
    buffer.pushChunk('only\n')
    buffer.pushChunk('still-only\n')
    expect(buffer.count()).toBe(1)
    expect(buffer.snapshot()[0]?.text).toBe('still-only')
  })
})

describe('createLogBuffer 字节上限淘汰', () => {
  it('大行场景按字节丢最旧(内存护栏)', () => {
    const buffer = createLogBuffer({ maxLines: 100, maxBytes: 250 })
    buffer.pushChunk(text(100) + '\n' + text(100) + '\n' + text(100) + '\n')
    // 300 > 250:最旧的一行被丢,保底不低于字节线的最后一行
    expect(buffer.count()).toBe(2)
    expect(buffer.snapshot().reduce((sum, entry) => sum + entry.bytes, 0)).toBeLessThanOrEqual(250)
    expect(buffer.takeDropped()).toBe(true)
  })

  it('行数与字节双限同时生效', () => {
    const buffer = createLogBuffer({ maxLines: 2, maxBytes: 10_000 })
    buffer.pushChunk('a\nb\nc\nd\n')
    expect(buffer.count()).toBe(2)
    const buffer2 = createLogBuffer({ maxLines: 100, maxBytes: 5 })
    buffer2.pushChunk('aaaaa\nbbbbbb\n')
    expect(buffer2.count()).toBe(1)
    expect(buffer2.snapshot()[0]?.text).toBe('bbbbbb')
  })
})

describe('createLogBuffer 残行强制分片', () => {
  it('无换行输出超 maxPendingBytes 被切成有界分片行', () => {
    const buffer = createLogBuffer({ maxLines: 100, maxBytes: 100_000, maxPendingBytes: 1000 })
    buffer.pushChunk(text(2500))
    // 2500 = 1000 + 1000 + 500(尾段仍是残行)
    expect(buffer.count()).toBe(2)
    expect(buffer.snapshot().every((entry) => entry.bytes <= 1000)).toBe(true)
    expect(buffer.pendingLength()).toBe(500)
    expect(buffer.takeDropped()).toBe(false) // 分片不是淘汰
  })

  it('持续无换行的超长输出内存有界(总字节 ≤ maxBytes + 一行)', () => {
    const maxBytes = 4000
    const buffer = createLogBuffer({ maxLines: 100, maxBytes, maxPendingBytes: 1000 })
    for (let i = 0; i < 100; i++) buffer.pushChunk(text(1000))
    const liveBytes = buffer.snapshot().reduce((sum, entry) => sum + entry.bytes, 0)
    expect(liveBytes).toBeLessThanOrEqual(maxBytes + 1000)
    expect(buffer.pendingLength()).toBeLessThanOrEqual(1000)
    expect(buffer.takeDropped()).toBe(true)
  })

  it('默认上限兜底(DEFAULT_*)', () => {
    expect(DEFAULT_MAX_LINES).toBe(5000)
    expect(DEFAULT_MAX_BYTES).toBe(4 * 1024 * 1024)
    expect(DEFAULT_MAX_PENDING).toBe(1024 * 1024)
    const buffer = createLogBuffer()
    buffer.pushChunk(text(DEFAULT_MAX_PENDING + 1))
    expect(buffer.count()).toBe(1)
    expect(buffer.pendingLength()).toBe(1)
  })
})

describe('createLogBuffer 行 id 单调稳定', () => {
  it('淘汰后 id 不复用,且严格递增', () => {
    const buffer = createLogBuffer({ maxLines: 3 })
    buffer.pushChunk('a\nb\nc\nd\ne\n')
    const all = ids(buffer)
    expect(all.length).toBe(3)
    for (let i = 1; i < all.length; i++) expect(all[i]).toBeGreaterThan(all[i - 1]!)
    const before = all[0]!
    buffer.pushChunk('f\n')
    expect(ids(buffer)[0]).toBeGreaterThan(before)
  })

  it('nextId 独立发号(聚合视图组行用)', () => {
    const buffer = createLogBuffer()
    const first = buffer.nextId()
    expect(buffer.nextId()).toBe(first + 1)
    buffer.pushChunk('x\n')
    expect(buffer.snapshot()[0]?.id).toBe(first + 2)
  })
})

describe('createLogBuffer appendRows / replaceAll(聚合视图路径)', () => {
  const row = (id: number, line: string, extra: Record<string, unknown> = {}) => ({ id, text: line, bytes: line.length, ...extra })

  it('appendRows 入列 + 字节裁剪', () => {
    const buffer = createLogBuffer({ maxLines: 2, maxBytes: 1000 })
    expect(buffer.appendRows([row(1, 'a'), row(2, 'b')])).toEqual({ dropped: false })
    expect(buffer.appendRows([row(3, 'c')])).toEqual({ dropped: true })
    expect(buffer.snapshot().map((entry) => entry.id)).toEqual([2, 3])
  })

  it('replaceAll 整表替换(时间序重排回写),裁剪照常', () => {
    const buffer = createLogBuffer({ maxLines: 2, maxBytes: 1000 })
    buffer.appendRows([row(1, 'a'), row(2, 'b')])
    expect(buffer.replaceAll([row(3, 'c'), row(1, 'a'), row(2, 'b')])).toEqual({ dropped: true })
    expect(buffer.snapshot().map((entry) => entry.id)).toEqual([1, 2])
    expect(buffer.count()).toBe(2)
  })

  it('snapshot 每次返回新数组(供 setState 触发 memo 重算)', () => {
    const buffer = createLogBuffer()
    buffer.pushChunk('a\n')
    expect(buffer.snapshot()).not.toBe(buffer.snapshot())
    expect(buffer.snapshot()).toEqual(buffer.snapshot())
  })

  it('reset 清空一切(含残行与 dropped)', () => {
    const buffer = createLogBuffer({ maxLines: 1 })
    buffer.pushChunk('a\nb\n')
    expect(buffer.takeDropped()).toBe(true)
    buffer.pushChunk('pending-without-newline')
    buffer.reset()
    expect(buffer.count()).toBe(0)
    expect(buffer.pendingLength()).toBe(0)
    expect(buffer.takeDropped()).toBe(false)
  })
})
