/**
 * @hyzyn/dsh-tty — AI 辅助的**模型调用与路由解析**单测（0.24.0）。
 *
 * 这两件事都不在纯函数层（一个要 async 迭代宿主 llm 服务、一个要读 ctx 上的服务），
 * 但它们各带一个**已经被踩过的坑**，所以必须钉住：
 *
 *   1. `finish` 块的形状：`kind` / `failure` 在 `reason` **里面**。rss 曾经把它们声明在
 *      顶层，于是**每一次成功**都被判成「终止原因 unknown」，AI 摘要 100% 失败，而单测
 *      因为假件照着同一个错形状造数据而全绿。这里**反向**钉：顶层写 `kind:'stop'` 的
 *      错误形状必须被判失败。
 *   2. `messages[].content` 必须是 **ContentBlock[]**：传字符串会在下游
 *      `content.some(...)` 上炸成 `content.some is not a function`（rss 踩过，表现是每条都失败）。
 *
 * 路由解析多钉一条**本插件特有**的语义：provider / model **成对**——只填一个时既不生效、
 * 也**不许**静默回落到宿主默认模型（用户以为自己配了，实际走的是另一个模型）。
 */
import './isolated-home.js'
import { describe, expect, it } from 'vitest'
import { askModelOnce, resolveAssistRoute } from '../src/index.js'

/* ----------------------------- 假件 ----------------------------- */

interface StreamOptions {
  provider: string
  model: string
  system?: string
  messages: Array<{ role: string; content: unknown }>
  maxTokens?: number
  temperature?: number
  signal?: AbortSignal
}

interface FakeLlm {
  seen: StreamOptions[]
  stream(options: StreamOptions): AsyncIterable<unknown>
}

function makeLlm(chunks: unknown[]): FakeLlm {
  const seen: StreamOptions[] = []
  return {
    seen,
    stream(options: StreamOptions): AsyncIterable<unknown> {
      seen.push(options)
      return {
        async *[Symbol.asyncIterator]() {
          for (const chunk of chunks) yield chunk
        },
      }
    },
  }
}

/** 永不吐出任何块、只在 signal abort 时 reject 的假流（用来测超时）。 */
function makeHangingLlm(): FakeLlm {
  const seen: StreamOptions[] = []
  return {
    seen,
    stream(options: StreamOptions): AsyncIterable<unknown> {
      seen.push(options)
      return {
        async *[Symbol.asyncIterator](): AsyncGenerator<unknown> {
          await new Promise((_resolve, reject) => {
            options.signal?.addEventListener('abort', () => { reject(new Error('aborted')) })
          })
        },
      }
    },
  }
}

const PROMPT = { system: 'sys', user: 'usr' }
const ROUTE = { provider: 'p', model: 'm' }
const deltas = (...parts: string[]): unknown[] => parts.map((text) => ({ type: 'text-delta', text }))

/* ----------------------------- 模型调用 ----------------------------- */

describe('askModelOnce：文本收集与终止判定', () => {
  it('拼接 text-delta，finish 为 stop 时返回正文（两端空白去掉）', async () => {
    const llm = makeLlm([...deltas('  **发生了什么**：', '没找到包\n'), { type: 'finish', reason: { kind: 'stop' } }])
    await expect(askModelOnce(llm, ROUTE, PROMPT)).resolves.toBe('**发生了什么**：没找到包')
  })

  it('反向：把 kind 写在**顶层**的错误形状必须判失败（rss 那个「假件自证」陷阱）', async () => {
    const llm = makeLlm([...deltas('看起来成功了'), { type: 'finish', kind: 'stop' }])
    await expect(askModelOnce(llm, ROUTE, PROMPT)).rejects.toThrow('终止原因 unknown')
  })

  it('finish 是 error 时带上 provider 给的原因（比「请求失败」有用得多）', async () => {
    const llm = makeLlm([{ type: 'finish', reason: { kind: 'error', failure: { message: 'rate limited' } } }])
    await expect(askModelOnce(llm, ROUTE, PROMPT)).rejects.toThrow('error: rate limited')
  })

  it('max-tokens 的错误信息要写出上限与「推理 token」，否则会被误读成 provider 坏了', async () => {
    const llm = makeLlm([...deltas('半截'), { type: 'finish', reason: { kind: 'max-tokens' } }])
    await expect(askModelOnce(llm, ROUTE, PROMPT)).rejects.toThrow(/maxTokens=\d+.*推理 token/)
  })

  it('没有终止块 / 正文全空白，都算失败', async () => {
    await expect(askModelOnce(makeLlm(deltas('有正文但没有 finish')), ROUTE, PROMPT)).rejects.toThrow('模型未返回终止标记')
    await expect(askModelOnce(makeLlm([{ type: 'text-delta', text: '   ' }, { type: 'finish', reason: { kind: 'stop' } }]), ROUTE, PROMPT)).rejects.toThrow('模型返回了空答案')
  })

  it('provider 抛的错原样透出（不包装成「请求失败」）', async () => {
    const llm: FakeLlm = {
      seen: [],
      stream(): AsyncIterable<unknown> {
        return { async *[Symbol.asyncIterator]() { throw new Error('connect ECONNREFUSED') } }
      },
    }
    await expect(askModelOnce(llm, ROUTE, PROMPT)).rejects.toThrow('connect ECONNREFUSED')
  })

  it('超时：abort 后报「请求超时」而不是 provider 的 aborted', async () => {
    await expect(askModelOnce(makeHangingLlm(), ROUTE, PROMPT, 30)).rejects.toThrow('请求超时')
  })

  it('参数形状：content 是 ContentBlock[]（传字符串会在下游 .some(...) 上炸）且路由/上限如实透传', async () => {
    const llm = makeLlm([{ type: 'finish', reason: { kind: 'stop' } }])
    await askModelOnce(llm, ROUTE, PROMPT).catch(() => {})
    const seen = llm.seen[0]
    expect(seen.provider).toBe('p')
    expect(seen.model).toBe('m')
    expect(seen.system).toBe('sys')
    expect(Array.isArray(seen.messages[0].content)).toBe(true)
    expect(seen.messages[0].content).toEqual([{ type: 'text', text: 'usr' }])
    expect(typeof seen.maxTokens).toBe('number')
  })
})

/* ----------------------------- 路由解析 ----------------------------- */

interface FakeCtx {
  get(name: string): unknown
}

const ctxWith = (services: Record<string, unknown>): FakeCtx => ({
  get: (name: string) => services[name],
})

describe('resolveAssistRoute：显式 > 宿主默认 > settings 命名空间', () => {
  it('显式成对优先，且不再去问宿主', () => {
    const ctx = ctxWith({ agentDefaultModel: { source: () => ({ provider: 'host', model: 'default' }) } })
    expect(resolveAssistRoute(ctx as never, ' p ', ' m ')).toEqual({ route: { provider: 'p', model: 'm' } })
  })

  it('只填一个：明确报「成对」，**不许**静默回落到宿主默认模型', () => {
    const ctx = ctxWith({ agentDefaultModel: { source: () => ({ provider: 'host', model: 'default' }) } })
    expect(resolveAssistRoute(ctx as never, 'p', '').route).toBeUndefined()
    expect(resolveAssistRoute(ctx as never, 'p', '').error).toContain('成对')
    expect(resolveAssistRoute(ctx as never, '', 'm').error).toContain('成对')
  })

  it('跟着宿主默认模型：agentDefaultModel.source()，并兼容 currentSelection()', () => {
    expect(resolveAssistRoute(ctxWith({ agentDefaultModel: { source: () => ({ provider: 'a', model: 'b' }) } }) as never, '', '')).toEqual({ route: { provider: 'a', model: 'b' } })
    expect(resolveAssistRoute(ctxWith({ agentDefaultModel: { currentSelection: () => ({ provider: 'c', model: 'd' }) } }) as never, '', '')).toEqual({ route: { provider: 'c', model: 'd' } })
  })

  it('再退到 settings 的 agent-default-model 命名空间', () => {
    const ctx = ctxWith({ settings: { get: (ns: string) => (ns === 'agent-default-model' ? { provider: 'e', model: 'f' } : undefined) } })
    expect(resolveAssistRoute(ctx as never, '', '')).toEqual({ route: { provider: 'e', model: 'f' } })
  })

  it('服务抛错 / 一个都没有：不崩，给一句能照做的原因', () => {
    const boom = { get: () => { throw new TypeError('no namespace') } }
    expect(resolveAssistRoute(boom as never, '', '').error).toContain('没有可用的模型路由')
    expect(resolveAssistRoute(ctxWith({}) as never, '', '').error).toContain('没有可用的模型路由')
  })

  it('半截的宿主默认模型（只有 provider）不算数', () => {
    const ctx = ctxWith({ agentDefaultModel: { source: () => ({ provider: 'only-provider' }) } })
    expect(resolveAssistRoute(ctx as never, '', '').route).toBeUndefined()
  })
})
