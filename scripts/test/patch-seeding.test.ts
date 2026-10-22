/**
 * `appendManagedBlock` 的回归：往已有补丁里追加托管块时，**必须先摘掉根位置的 `[]`**。
 *
 * 来历（2026-10-22 真机实测）：`verify-codegraph-host-contract.mjs` 的预置代码原本是
 * `existing + block`。对 `test` / `desktop` 这类**早已有真实条目**的 profile 一直没事；
 * 换成 `--profile <全新 profile>` 时，模板末尾正是 `[]`，追加后整份文件非法，宿主在
 * `loadProfileDirectory → loadOverlayPatches → parsePatchList` 直接抛、exit=1——
 * 于是「干净 profile 验收」这一档静默跑不起来，而脚本只会报「宿主没就绪」。
 *
 * 判据与 codegraph CG67 / CG72 同源：**追加前先摘空根**，与用哪个包无关。
 * 反例用旧写法（裸追加）造，确保这条判据不是恒绿。
 */
import { createRequire } from 'node:module'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { appendManagedBlock } from '../lib/live-harness.mjs'

/** js-yaml 不是根依赖；从声明它的 workspace 包锚点解析，与宿主用的是同一个库。 */
const require = createRequire(join(import.meta.dirname, '..', '..', 'packages', 'kit', 'package.json'))
const yaml = require('js-yaml')

const BLOCK = [
  '# --- dsh-mcp-config managed (auto-generated; do not edit) ---',
  '- insert:',
  '    - id: mcp-codegraph-managed',
  "      name: '@deepseek-ai/dsh-mcp-client'",
  '      config:',
  '        serverName: codegraph',
  '# --- end dsh-mcp-config managed ---',
  '',
].join('\n')

/** 宿主 `parsePatchList` 的同一判据：顶层必须是数组（纯注释不抛，但也不是数组）。 */
const isTopLevelArray = (text) => {
  try {
    return Array.isArray(yaml.load(text))
  } catch {
    // 宿主那侧也是抛（`parsePatchList`），这里归一成 false：判据是「能不能被当成合法数组读回」
    return false
  }
}

const template = '# Your patch layer\n# a top-level YAML array\n[]\n'
const populated = '# header\n- id: webserver\n  config:\n    port: 3082\n'
const commentsOnly = '# a\n# b\n'

describe('appendManagedBlock：追加托管块前先摘空根', () => {
  it('DSH 全新 profile 模板（注释 + `[]`）+ 块 → 合法顶层数组，且不再有裸 `[]`', () => {
    const out = appendManagedBlock(template, BLOCK)
    expect(isTopLevelArray(out)).toBe(true)
    expect(out.split('\n').some((line) => line.trim() === '[]')).toBe(false)
    expect(out).toContain('# Your patch layer')
    expect(out).toContain('mcp-codegraph-managed')
  })

  it('已有条目的新 profile（`test` / `desktop` 那种形状）→ 原有行一条不少', () => {
    const out = appendManagedBlock(populated, BLOCK)
    expect(isTopLevelArray(out)).toBe(true)
    for (const line of populated.trimEnd().split('\n')) expect(out).toContain(line)
    expect(out).toContain('mcp-codegraph-managed')
  })

  it('空文件 / 纯注释文件 / 结尾没有换行的 `[]` → 都合法', () => {
    for (const input of ['', commentsOnly, '# c\n[]', '# c\n[ ]']) {
      const out = appendManagedBlock(input, BLOCK)
      expect(isTopLevelArray(out), `输入 ${JSON.stringify(input)} 写回 ${JSON.stringify(out)}`).toBe(true)
      expect(out.split('\n').some((line) => /^\[\s*\]$/.test(line.trim()))).toBe(false)
    }
  })

  it('反例：旧写法（`existing + block`）在同一份模板上写出非法文件', () => {
    // 这条不是「实现细节」的反例，而是缺陷现场：先证明判据能红，再相信上面几条绿。
    const naive = template + BLOCK
    expect(isTopLevelArray(naive)).toBe(false)
    expect(() => yaml.load(naive)).toThrow(/document separator/i)
  })
})
