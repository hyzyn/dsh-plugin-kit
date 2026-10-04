/**
 * [`scripts/lib/dsh-runtime-store.mjs`](../lib/dsh-runtime-store.mjs) 的单元测试 ——
 * 「宿主 runtime 的 `@deepseek-ai` 存储目录在哪」这件事实的唯一一份实现。
 *
 * 为什么有这份测试：这段候选列表以前住在 `scripts/link-dsh-runtime.mjs` 里，
 * 现在多了一个消费方（`scripts/sync-dsh-theme-tokens.mjs` 要读宿主主题）。**抽出来的时候
 * 最容易悄悄丢掉的正是两条真机教训**：
 *
 *   - Windows 上 `HOME` 不存在（那边是 `USERPROFILE`）：旧版读 `process.env.HOME` 会在
 *     **构造候选数组的那一刻**就抛 `ERR_INVALID_ARG_TYPE`，连 npm prefix 候选都没机会被检查；
 *   - npm 全局前缀有两个布局（POSIX 在 `<prefix>/lib/node_modules`、Windows 在 `<prefix>/node_modules`），
 *     `npm` 不在 PATH 时还必须有 home 兜底、且**不许抛**。
 *
 * 两条都在下面用注入参数跑出来（本机是 macOS，天然跑不到 Windows 那条分支）。
 */
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  dshStoreCandidates,
  dshVersionFromStore,
  findDshRuntimeStore,
  themeClientPath,
} from '../lib/dsh-runtime-store.mjs'

describe('dshStoreCandidates · 两个布局 + home 兜底，顺序即优先级', () => {
  it('npm 前缀给了 → 两种布局都在候选里，POSIX 那条排在最前', () => {
    const candidates = dshStoreCandidates({ home: '/home/u', npmPrefix: '/usr/local' })
    expect(candidates).toEqual([
      join('/usr/local', 'lib', 'node_modules', '@deepseek-ai', 'dsh', 'node_modules', '@deepseek-ai'),
      join('/usr/local', 'node_modules', '@deepseek-ai', 'dsh', 'node_modules', '@deepseek-ai'),
      join('/home/u', '.npm-global', 'lib', 'node_modules', '@deepseek-ai', 'dsh', 'node_modules', '@deepseek-ai'),
      join('/home/u', '.dsh', 'profiles', 'node_modules', '@deepseek-ai'),
    ])
  })

  it('npm 不在 PATH（null）→ 只剩 home 兜底，不抛', () => {
    const candidates = dshStoreCandidates({ home: '/home/u', npmPrefix: null })
    expect(candidates).toHaveLength(2)
    expect(candidates.every((candidate) => candidate.startsWith('/home/u'))).toBe(true)
  })

  it('HOME 未定义时也不许抛（Windows 上没有 HOME —— 那条真机教训）', () => {
    const saved = process.env.HOME
    delete process.env.HOME
    try {
      // 默认 home 走 os.homedir()：两个平台都对，所以这里既不该抛、也不该出现空串候选
      expect(() => dshStoreCandidates({ npmPrefix: null })).not.toThrow()
      expect(dshStoreCandidates({ npmPrefix: null }).every((candidate) => candidate !== '')).toBe(true)
    } finally {
      if (saved !== undefined) process.env.HOME = saved
    }
  })
})

describe('findDshRuntimeStore · 找到就返回，找不到返回 null（调用方决定是否致命）', () => {
  it('--runtime 给的路径直接就位；不存在则 null', () => {
    expect(findDshRuntimeStore({ explicit: '/some/store', exists: () => true })).toBe('/some/store')
    expect(findDshRuntimeStore({ explicit: '/some/store', exists: () => false })).toBeNull()
  })

  it('按候选顺序取第一个存在的', () => {
    const candidates = dshStoreCandidates({ home: '/home/u', npmPrefix: null })
    const found = findDshRuntimeStore({
      home: '/home/u',
      npmPrefix: null,
      exists: (candidate) => candidate === candidates[1],
    })
    expect(found).toBe(candidates[1])
  })

  it('一个都不存在 → null（不抛：同步脚本要能把它当成「这一档没跑」）', () => {
    expect(findDshRuntimeStore({ home: '/home/u', npmPrefix: null, exists: () => false })).toBeNull()
  })
})

describe('主题文件位置与宿主版本', () => {
  it('主题客户端半体的相对位置', () => {
    expect(themeClientPath('/store')).toBe(join('/store', 'dsh-client-ui-theme', 'lib', 'client.js'))
  })

  it('取不到宿主版本时返回 null（profiles 候选下没有那一层，是正常情况）', () => {
    expect(dshVersionFromStore('/definitely/not/here')).toBeNull()
  })
})
