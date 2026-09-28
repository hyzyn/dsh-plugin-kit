/**
 * @hyzyn/dsh-global-search — 回退扫描「被超时切走」必须如实标记的回归测试。
 *
 * 现场：宿主 FTS 不可用时逐会话扫描原始事件，整体超时 10s 后返回**已收集的部分结果**
 * 以免长时间无响应（这个设计本身是对的，后台还在补文档缓存）。但调用方原先只看
 * 「结果非空」就写缓存——于是「还没扫完」的部分清单被 30s 固化，用户立刻重试也拿到
 * 同一份不完整结果（空结果早就防了这一手，非空的部分结果漏了）。
 *
 * 所以这里钉住扫描函数的契约：`truncated` 只在**计时器真的触发过**时为 true。
 * 判据不能是「计时器存在」——它在竞态构造时就已创建，那样永远为真、等于没修。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { searchSessionsByScan } from '../src/index.js'

const doc = (text: string, time: number) => ({ text, time, type: 'user' })

afterEach(() => {
  vi.useRealTimers()
})

describe('searchSessionsByScan：截断标记', () => {
  it('被超时切走 → truncated=true，已收集的命中照样返回（部分结果不冒充全量）', async () => {
    vi.useFakeTimers()
    const sessionQuery = {
      listSessions: async () => [{ header: { id: 'fast' } }, { header: { id: 'slow' } }],
      filterEvents: async (id: string) => {
        if (id === 'slow') {
          // 卡住的会话：超时窗口内不会返回
          await new Promise((resolve) => setTimeout(resolve, 60_000))
          return []
        }
        return [doc('命中文本', 2)]
      },
    }
    const pending = searchSessionsByScan(sessionQuery as never, '命中', 10)
    await vi.advanceTimersByTimeAsync(10_000)
    const result = await pending
    expect(result.truncated).toBe(true)
    expect(result.hits.map((hit) => hit.id)).toEqual(['fast'])
  })

  it('正常扫完 → truncated=false（正常结果该被缓存）', async () => {
    const sessionQuery = {
      listSessions: async () => [{ header: { id: 'a' } }],
      filterEvents: async () => [doc('命中文本', 2)],
    }
    const result = await searchSessionsByScan(sessionQuery as never, '命中', 10)
    expect(result.truncated).toBe(false)
    expect(result.hits.map((hit) => hit.id)).toEqual(['a'])
  })

  it('会话清单都拿不到（没扫成）→ 也按 truncated 处理，免得空结果被固化', async () => {
    const sessionQuery = {
      listSessions: async () => { throw new Error('session store unavailable') },
      filterEvents: async () => [],
    }
    const result = await searchSessionsByScan(sessionQuery as never, '命中', 10)
    expect(result.truncated).toBe(true)
    expect(result.hits).toEqual([])
  })
})
