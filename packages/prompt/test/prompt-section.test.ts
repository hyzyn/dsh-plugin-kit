/**
 * @hyzyn/dsh-prompt — 每轮注入上限（PROMPT_BODY_MAX_CHARS）与保存响应 warning 的回归测试。
 *
 * 覆盖：
 * 1. 低于上限的正文原样注入，无任何截断标记；
 * 2. 超限正文截到 8000 并追加语义化说明——截断标记**恰好一次**（是语义说明，不是 kit 的
 *    通用标记）；总长恰为上限，所以调用点传给 kit 的 `maxChars`（同值）永远不会触发；
 * 3. 正文为空不注册段落（现有行为）；
 * 4. 反例：调用点 `maxChars` 与自截阈值不一致时 kit 会二次截断、语义说明被顶掉——这正是
 *    registerActivePromptSection 必须传 `maxChars: PROMPT_BODY_MAX_CHARS` 的原因；第 2 条的
 *    「恰好一次」断言在调用点漂移时会当场变红。
 * 5. 保存路径：/save 对含超限版本的响应带 `warning` 字段（照 fileError 的可省字段习惯），
 *    且保存内容本身不被截断（那是 MAX_CONTENT_LENGTH 的事）。
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import type { PromptSectionApi, PromptSectionOptions } from '@hyzyn/dsh-kit'
import { registerLiteralSection } from '@hyzyn/dsh-kit'
import {
  PROMPT_BODY_MAX_CHARS,
  buildSystemPromptText,
  makeRoutes,
  promptBodyWarning,
  registerActivePromptSection,
} from '../src/index.js'

/** 语义化截断说明的稳定子串（完整文案在 buildSystemPromptText 里由常量拼出）。 */
const SEMANTIC_MARKER = `正文超过 ${PROMPT_BODY_MAX_CHARS} 字符上限`
/** kit 通用标记的稳定子串：`…（本段超过 N 字符上限，已截断）`。 */
const KIT_MARKER = '本段超过 '
const countOf = (text: string, needle: string): number => text.split(needle).length - 1

function storeWithBody(content: string) {
  return {
    activePromptId: 'p-1',
    prompts: [
      {
        id: 'p-1',
        name: '示例',
        versions: [{ id: 'v-1', content, createdAt: '2024-01-01T00:00:00.000Z' }],
        activeVersionId: 'v-1',
        ab: { enabled: false, aVersionId: 'v-1', bVersionId: 'v-1', aWeight: 50 },
        updatedAt: '2024-01-01T00:00:00.000Z',
      },
    ],
  }
}

/** 可辨认的正文（`0123456789…`），便于断言注入保留的是头部。 */
function digitBody(length: number): string {
  return Array.from({ length }, (_, index) => String(index % 10)).join('')
}

function makeApi(): { api: PromptSectionApi; sections: PromptSectionOptions[] } {
  const sections: PromptSectionOptions[] = []
  const api: PromptSectionApi = {
    section: (options) => {
      sections.push(options)
      return () => {}
    },
  }
  return { api, sections }
}

const textOf = (section: PromptSectionOptions): string => (typeof section.text === 'string' ? section.text : section.text())

describe('buildSystemPromptText / registerActivePromptSection（每轮注入上限）', () => {
  it('正文 300 字符：原样注入，无任何截断标记', () => {
    const body = 'x'.repeat(300)
    const { api, sections } = makeApi()
    expect(registerActivePromptSection(api, storeWithBody(body))).toBeTypeOf('function')
    expect(sections).toHaveLength(1)
    expect(sections[0]!.name).toBe('plugin:dsh-prompt-manager')
    expect(sections[0]!.order).toBe(140)
    expect(sections[0]!.interpolate).toBe(false)
    expect(textOf(sections[0]!)).toBe(body)
    expect(countOf(textOf(sections[0]!), SEMANTIC_MARKER)).toBe(0)
    expect(countOf(textOf(sections[0]!), KIT_MARKER)).toBe(0)
    expect(buildSystemPromptText(storeWithBody(body))).toBe(body)
  })

  it('正文为空：不注册段落（返回 null，宿主 API 未被触碰）', () => {
    const { api, sections } = makeApi()
    expect(registerActivePromptSection(api, storeWithBody(''))).toBeNull()
    expect(sections).toHaveLength(0)
    expect(buildSystemPromptText(storeWithBody(''))).toBe('')
  })

  it('正文 12000 字符：总长恰为 8000、头部保留，截断标记恰好一次且是语义说明（本文件首个超限用例，warn-once 在这里验收）', () => {
    const body = digitBody(12_000)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const { api, sections } = makeApi()
      expect(registerActivePromptSection(api, storeWithBody(body))).toBeTypeOf('function')
      const text = textOf(sections[0]!)
      // 说明计入预算内 → 总长恰为上限，kit（maxChars 同值）不可能再截第二次。
      expect(text).toHaveLength(PROMPT_BODY_MAX_CHARS)
      // 头部保留：说明自身长度 < 200，所以前 7800 字符必须与原文逐字一致。
      expect(text.startsWith(body.slice(0, PROMPT_BODY_MAX_CHARS - 200))).toBe(true)
      // 尾部是那句语义说明，指路「设置 → 插件配置 → Prompt 管理」在场。
      expect(text.endsWith('完整内容请在「设置 → 插件配置 → Prompt 管理」里查看。')).toBe(true)
      // 截断标记恰好一次，而且是语义说明、不是 kit 的通用标记。
      expect(countOf(text, SEMANTIC_MARKER) + countOf(text, KIT_MARKER)).toBe(1)
      expect(countOf(text, SEMANTIC_MARKER)).toBe(1)
      expect(countOf(text, KIT_MARKER)).toBe(0)
      // 超限告警同名只发一次（模块级去重；本文件后续超限用例不再重复验收这条）。
      expect(warn).toHaveBeenCalledTimes(1)
      expect(buildSystemPromptText(storeWithBody(body))).toHaveLength(PROMPT_BODY_MAX_CHARS)
      expect(warn).toHaveBeenCalledTimes(1)
    } finally {
      warn.mockRestore()
    }
  })

  it('反例：调用点 maxChars 传成 6000（≠ 自截阈值）时 kit 二次截断，语义说明被通用标记顶掉', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const body = digitBody(12_000)
      const truncated = buildSystemPromptText(storeWithBody(body))
      expect(truncated).toHaveLength(PROMPT_BODY_MAX_CHARS)
      const { api, sections } = makeApi()
      registerLiteralSection(api, { name: 'plugin:dsh-prompt-manager', order: 140, text: truncated, maxChars: 6_000 })
      const text = textOf(sections[0]!)
      // kit 的通用标记出现、语义说明被截掉——调用点若漂移成这种形状，
      // 上一条用例的「语义说明恰好一次」会当场变红。
      expect(text).toContain('本段超过 6000 字符上限，已截断')
      expect(countOf(text, KIT_MARKER)).toBe(1)
      expect(countOf(text, SEMANTIC_MARKER)).toBe(0)
    } finally {
      warn.mockRestore()
    }
  })
})

describe('promptBodyWarning（保存响应的正文预警）', () => {
  function promptOf(
    versions: Array<{ id: string; content: string }>,
    options: {
      activeVersionId?: string
      ab?: { enabled: boolean; aVersionId: string; bVersionId: string; aWeight: number }
    } = {},
  ) {
    return {
      id: 'p-1',
      name: '示例',
      versions: versions.map((version) => ({ ...version, createdAt: '2024-01-01T00:00:00.000Z' })),
      activeVersionId: options.activeVersionId ?? versions[0]!.id,
      ab: options.ab ?? {
        enabled: false,
        aVersionId: versions[0]!.id,
        bVersionId: versions[versions.length - 1]!.id,
        aWeight: 50,
      },
      updatedAt: '2024-01-01T00:00:00.000Z',
    }
  }

  it('激活版本超限：返回 warning，点出超限版本与每轮上限', () => {
    const warning = promptBodyWarning(promptOf([{ id: 'v-1', content: 'x'.repeat(9_000) }]))
    expect(warning).toContain('v-1')
    expect(warning).toContain('每轮只会注入前 8000 字符')
  })

  it('激活版本没超限：无 warning', () => {
    expect(promptBodyWarning(promptOf([{ id: 'v-1', content: 'x'.repeat(300) }]))).toBeUndefined()
  })

  it('超限版本不在注入链上（激活的是另一份短版本）：不误报', () => {
    const warning = promptBodyWarning(
      promptOf(
        [
          { id: 'v-1', content: 'x'.repeat(9_000) },
          { id: 'v-2', content: '短' },
        ],
        { activeVersionId: 'v-2' },
      ),
    )
    expect(warning).toBeUndefined()
  })

  it('A/B 启用：两侧都是注入候选，任一侧超限就报；两侧都没超限不报', () => {
    const ab = { enabled: true, aVersionId: 'v-1', bVersionId: 'v-2', aWeight: 50 }
    const over = promptBodyWarning(
      promptOf(
        [
          { id: 'v-1', content: 'x'.repeat(9_000) },
          { id: 'v-2', content: '短' },
        ],
        { ab },
      ),
    )
    expect(over).toContain('v-1')
    expect(
      promptBodyWarning(
        promptOf(
          [
            { id: 'v-1', content: '短a' },
            { id: 'v-2', content: '短b' },
          ],
          { ab },
        ),
      ),
    ).toBeUndefined()
  })
})

describe('/api/dsh-prompt/save 的 warning 字段', () => {
  let dir: string
  const original = process.env.DSH_PROMPT_FILE

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'dsh-prompt-section-test-'))
    process.env.DSH_PROMPT_FILE = join(dir, 'prompts.yml')
  })

  afterEach(() => {
    if (original === undefined) delete process.env.DSH_PROMPT_FILE
    else process.env.DSH_PROMPT_FILE = original
    rmSync(dir, { recursive: true, force: true })
  })

  async function callSave(prompt: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
    // makeRoutes 的 ctx 参数当前未被使用，测试里给个空壳即可。
    const routes = makeRoutes({} as Context, () => {})
    const save = routes.find((route) => route.path === '/api/dsh-prompt/save')!
    const payload = Buffer.from(JSON.stringify({ prompt }), 'utf8')
    const req = {
      method: 'POST',
      url: '/api/dsh-prompt/save',
      headers: { host: '127.0.0.1', origin: 'http://127.0.0.1' },
      socket: { remoteAddress: '127.0.0.1' },
      [Symbol.asyncIterator]() {
        let sent = false
        return {
          next: async () => {
            if (sent) return { done: true, value: undefined as never }
            sent = true
            return { done: false, value: payload }
          },
        }
      },
    }
    const state = { status: 0, body: '' }
    await save.handler(req as unknown as Parameters<typeof save.handler>[0], {
      writeHead(status: number) {
        state.status = status
      },
      end(body?: string) {
        state.body = body ?? ''
      },
    })
    return { status: state.status, body: JSON.parse(state.body) as Record<string, unknown> }
  }

  it('版本正文 9000 字符：响应带 warning，保存内容本身不被截断', async () => {
    const { status, body } = await callSave({ name: '长文', versions: [{ content: 'x'.repeat(9_000) }] })
    expect(status).toBe(200)
    expect(body.ok).toBe(true)
    expect(String(body.warning)).toContain('每轮只会注入前 8000 字符')
    const prompts = body.prompts as Array<{ versions: Array<{ content: string }> }>
    expect(prompts[0]!.versions[0]!.content).toHaveLength(9_000)
  })

  it('版本正文 300 字符：响应没有 warning 字段', async () => {
    const { body } = await callSave({ name: '短文', versions: [{ content: 'x'.repeat(300) }] })
    expect('warning' in body).toBe(false)
  })
})
