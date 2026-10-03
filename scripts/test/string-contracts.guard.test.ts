/**
 * 字符串契约守卫的用例：**既验判据**（假样本能命中），**也验现状**（真仓已清零）。
 *
 * 这是本仓对守卫的通行要求——只会在「命中 0」时绿的闸门比没有还坏
 * （`docs/conventions.md` § 真机脚本与 CI 接线 记过这类教训）。所以：
 *   - 假样本必须能命中（判据没写死成永真）；
 *   - 真仓的 `src/` 必须 0 命中（现状干净）；
 *   - 常量必须与真实用到的名字对得上（登记漏了会让守卫放过真名）。
 */

import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

import { afterAll, describe, expect, it } from 'vitest'

import { HOST_SERVICES, HOST_SERVICE_NAMES, LAUNCH_ENV_LAYERS } from '../../packages/kit/src/index.js'
import { findBareLaunchLayers, findBareServiceNames } from '../lib/string-contracts.js'

const tmp = mkdtempSync(join(tmpdir(), 'dsh-string-contracts-'))
afterAll(() => {
  rmSync(tmp, { recursive: true, force: true })
})

/** 造一个假的源码目录并返回其中的文件路径。 */
function fixture(name: string, content: string): string {
  const dir = join(tmp, name)
  mkdirSync(dir, { recursive: true })
  const file = join(dir, 'sample.ts')
  writeFileSync(file, content)
  return file
}

describe('判据本身有效（假样本能命中）', () => {
  it('把已登记的服务名当字面量 → 命中', () => {
    const file = fixture('svc', "const s = getService(ctx, 'settings')\n")
    const hits = findBareServiceNames([file])
    expect(hits).toHaveLength(1)
    expect(hits[0]?.line).toBe(1)
  })

  it('用常量 → 不命中', () => {
    const file = fixture('svc-ok', 'const s = getService(ctx, HOST_SERVICES.settings)\n')
    expect(findBareServiceNames([file])).toHaveLength(0)
  })

  it('传**未登记**的名字 → 不命中（守卫只拦「本该用常量的那批」）', () => {
    const file = fixture('svc-unknown', "const s = getService(ctx, 'my-custom-service')\n")
    expect(findBareServiceNames([file])).toHaveLength(0)
  })

  it('多个服务名各命中一次（不是只报第一条）', () => {
    const file = fixture(
      'svc-many',
      ["getService(ctx, 'settings')", "getService(ctx, 'llm')", "getService(ctx, 'tools')"].join('\n'),
    )
    expect(findBareServiceNames([file])).toHaveLength(3)
  })

  it('启动环境层名当字面量 → 命中；用常量 → 不命中', () => {
    const bare = fixture('layer', "snapshot.getFrom(env, ['process'])\n")
    expect(findBareLaunchLayers([bare])).toHaveLength(1)
    const ok = fixture('layer-ok', 'snapshot.getFrom(env, [LAUNCH_ENV_LAYERS.process])\n')
    expect(findBareLaunchLayers([ok])).toHaveLength(0)
  })
})

describe('现状：真仓的 src/ 已清零', () => {
  it('没有任何地方把宿主服务名当字面量传给 getService', async () => {
    const { readdirSync, statSync } = await import('node:fs')
    const { dirname, join: j } = await import('node:path')
    const { fileURLToPath } = await import('node:url')
    const root = j(dirname(fileURLToPath(import.meta.url)), '..', '..')
    const packagesDir = j(root, 'packages')
    const files: string[] = []
    for (const pkg of readdirSync(packagesDir)) {
      const srcDir = j(packagesDir, pkg, 'src')
      let entries: string[]
      try {
        entries = readdirSync(srcDir, { recursive: true }) as string[]
      } catch {
        continue
      }
      for (const entry of entries) {
        const full = j(srcDir, entry)
        if (!entry.endsWith('.ts')) continue
        try {
          if (statSync(full).isFile()) files.push(full)
        } catch {
          /* 跳过 */
        }
      }
    }
    expect(files.length).toBeGreaterThan(20) // 扫到了东西（否则这条断言在空集上恒绿）
    expect(findBareServiceNames(files)).toEqual([])
    expect(findBareLaunchLayers(files)).toEqual([])
  })
})

describe('常量与实际用到的名字对得上', () => {
  it('服务名常量的值就是名字本身（可读，也便于审计）', () => {
    // 值 = 服务名字面量本身；所以常量不是「另一个名字」，而是把既有名字收口到一处。
    expect(HOST_SERVICES.launchEnvironment).toBe('launchEnvironment')
    expect(HOST_SERVICES.settings).toBe('settings')
    expect(HOST_SERVICE_NAMES.length).toBe(Object.keys(HOST_SERVICES).length)
    expect(HOST_SERVICE_NAMES).toContain('launchEnvironment')
  })

  it('启动环境三层都登记了，且 `process` 是可用于授权的那一层', () => {
    expect(LAUNCH_ENV_LAYERS.process).toBe('process')
    expect(LAUNCH_ENV_LAYERS.projectEnv).toBe('project-env')
    expect(LAUNCH_ENV_LAYERS.userEnv).toBe('user-env')
  })
})

/**
 * AGENTS.md 的路由守卫（2026-10-01 起）。
 *
 * ## 为什么需要它
 *
 * 本仓现在有**两份路由**：`README.md § 文档地图` 与仓根 `AGENTS.md`。AGENTS.md 是
 * **agent 会自动加载**的那一份（Codex / OpenCode 原生读，Claude Code 靠 `CLAUDE.md` 导入），
 * 所以它漂了后果更重——而文档改名 / 拆分时，两份路由里必然有一条先漂。
 *
 * 业界同款做法（[instruction-files 参考](https://raw.githubusercontent.com/CodeAlive-AI/ai-driven-development/refs/heads/main/skills/agentic-readiness/references/instruction-files.md)
 * 的 § 9）：**routing 非平凡时加漂移检查**。
 *
 * ## 判据只有两条（都不是行数闸门）
 *
 * 1. **入口文件必须存在**——AGENTS.md 与它指向的四份 L0 文档都得在；
 * 2. **每份都要被路由到**——四份 L0 各自的相对链接都得出现在 AGENTS.md 里。
 *
 * 不判「行数」也不判「内容措辞」：那两条会逼人改文档去凑闸门，而这里要防的是
 * 「有份文档改名了，agent 的入口还在指向旧名字」。
 */
describe('AGENTS.md 与它指向的 L0 文档', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

  /** AGENTS.md 应当路由到的 L0 文档（**入口清单，不是知识**）。 */
  const ROUTED = ['README.md', 'docs/architecture.md', 'docs/conventions.md', 'docs/agent-real-test.md'] as const

  it('入口文件存在', () => {
    const text = readFileSync(join(root, 'AGENTS.md'), 'utf8')
    expect(text.length).toBeGreaterThan(0)
    for (const target of ROUTED) {
      expect(() => readFileSync(join(root, target), 'utf8'), `${target} 不存在但 AGENTS.md 指向它`).not.toThrow()
    }
  })

  it('四份 L0 文档都被 AGENTS.md 路由到（文档改名时这条会红）', () => {
    const text = readFileSync(join(root, 'AGENTS.md'), 'utf8')
    for (const target of ROUTED) {
      expect(text, `AGENTS.md 没有指向 ${target}`).toContain(`(${target}`)
    }
  })

  it('AGENTS.md 仍然只做路由：不复制 conventions 的分节正文', () => {
    // 判据是「有没有把某一节的规矩正文抄过来」——用**节标题**当探针。
    // 只出现在链接文字与指针句里是允许的（那是路由，不是正文）。
    const text = readFileSync(join(root, 'AGENTS.md'), 'utf8')
    const ruleSections = ['文档分档', '编号规范', '客户端半体：两条硬规矩', '真机脚本与 CI 接线']
    for (const section of ruleSections) {
      expect(text, `AGENTS.md 里出现了「${section}」——疑似复制规矩正文`).not.toContain(section)
    }
  })

})
