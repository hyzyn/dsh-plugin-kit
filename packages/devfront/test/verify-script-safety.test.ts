/**
 * `scripts/verify-devfront-card.mjs` 的**安全守卫**（**脚本在仓根、守卫在包内**，与 `devenv` 的
 * `verify-all-script-safety` / `devdata` 的同类守卫同一分工）。
 *
 * ## 为什么这类脚本需要守卫
 *
 * 它是「起真宿主 + 开真浏览器」的那一档：**跑起来慢、进不了 CI**，于是「改坏了没人发现」的窗口很长。
 * 而它坏掉的方式恰好是最糟的两种：
 *
 *   1. **污染真实 `~/.dsh`**（`live-harness.mjs` 的红线①）：插件行、配置层都写进用户真实配置；
 *   2. **自证变成空话**（红线②）：`verifyRealPatchUnchanged` 声明了却不**断言**——那条守卫在别的
 *      脚本里真的漂过（indexforce 那份声明后从未使用）。
 *
 * ## 判据（每条都配反例）
 *
 * | # | 判据 |
 * |---|---|
 * | ① | 造临时资源要带**可识别前缀**（`dsh-devfront-card-`） |
 * | ② | 用 `createLiveHarness`（独立 `DSH_HOME` 的唯一入口） |
 * | ③ | **每一次** spawn 都走 `hostEnv()`（计数：`hostEnv(` ≥ `spawn(` + `spawnSync(`） |
 * | ④ | `verifyRealPatchUnchanged(harness.patch)` 的 `unchanged` 被**断言**（出现在 `record(` 里） |
 * | ⑤ | 收尾有 `harness.cleanup()`（且在有 `finally` 的文件里） |
 * | ⑥ | 不碰凭据存储、不把真实 home 当写落点 |
 *
 * **先去注释再判**：第一版直接对源码做正则，于是文件头注释里那句「必须走 `harness.hostEnv()`」把
 * 计数喂饱了、反例②照旧绿（本仓记过这一类：静态判据不该能被注释满足）。
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const SOURCE = readFileSync(new URL('../../../scripts/verify-devfront-card.mjs', import.meta.url), 'utf8')

/** 去注释（块注释 + 行注释）：判据只看代码，不看解释。 */
export function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

/** 违例清单（**纯函数**，喂 fixture 就能造反例）。 */
export function verifyScriptViolations(raw: string): string[] {
  const source = stripComments(raw)
  const problems: string[] = []

  // ① 临时资源前缀
  if (!/createLiveHarness\(\{\s*prefix:\s*'dsh-devfront-card-'/.test(source)) {
    problems.push("没给一次性临时目录加可识别前缀（`createLiveHarness({ prefix: 'dsh-devfront-card-' })`）")
  }
  // ② 隔离引导的唯一入口
  if (!/import\s*\{[^}]*createLiveHarness[^}]*\}\s*from\s*'\.\/lib\/live-harness\.mjs'/.test(source)) {
    problems.push('没有从 `scripts/lib/live-harness.mjs` 取隔离引导：自己拼 DSH_HOME 就会漏掉自证')
  }
  // ③ 每一次 spawn 都要走 hostEnv()
  const spawns = (source.match(/\b(spawn|spawnSync)\(/g) ?? []).length
  const hosts = (source.match(/hostEnv\(/g) ?? []).length
  if (hosts < spawns) {
    problems.push(`有 ${String(spawns)} 次 spawn 却只有 ${String(hosts)} 处 hostEnv()：漏掉的那次会继承真实 DSH_HOME`)
  }
  // ④ 自证必须被断言，而不是只声明
  if (!/verifyRealPatchUnchanged\(harness\.patch\)/.test(source)) {
    problems.push('没有比对真实 `~/.dsh/cordis.patch.yml`（红线②：隔离要自证）')
  }
  if (!/record\([^)]*unchanged === true/s.test(source)) {
    problems.push('比对结果没被**断言**（只声明快照不算自证——indexforce 那份就是这么漂的）')
  }
  // ⑤ 收尾清理
  if (!/harness\.cleanup\(\)/.test(source)) problems.push('没有 `harness.cleanup()`：临时 home 会留下')
  if (!/\}\s*finally\s*\{/.test(source)) problems.push('没有 `finally`：失败路径上的宿主 / 浏览器 / 临时目录不会被收')
  // ⑥ 凭据与真实 home
  if (/credentials\.yaml/.test(source)) problems.push('读了凭据存储：验证脚本不许伸手进去')
  if (/realDshHome\s*\)\s*;?\s*\/\/\s*write/.test(source)) problems.push('把真实 home 当写落点')

  return problems
}

describe('devfront 卡片真机脚本：隔离与自证', () => {
  it('真实源码满足六条判据', () => {
    expect(verifyScriptViolations(SOURCE)).toEqual([])
  })

  it('反例①：去掉前缀 → 报出来（临时目录没法识别是谁的）', () => {
    const bad = SOURCE.replace("prefix: 'dsh-devfront-card-'", "prefix: 'tmp-'")
    expect(verifyScriptViolations(bad).join('\n')).toContain('可识别前缀')
  })

  it('反例②：某一次 spawn 漏了 hostEnv（继承真实 DSH_HOME）→ 报出来', () => {
    const bad = SOURCE.replace('env: harness.hostEnv({ DSH_KIT_HOME:', 'env: process.env, /* 故意漏 */ DSH_KIT_HOME:')
    expect(verifyScriptViolations(bad).join('\n')).toContain('hostEnv()')
  })

  it('反例③：自证只声明不断言 → 报出来', () => {
    const bad = SOURCE.replace(/record\('⑬[^)]*unchanged === true[^)]*\)/s, "void verifyRealPatchUnchanged(harness.patch)")
    expect(verifyScriptViolations(bad).join('\n')).toContain('没被**断言**')
  })

  it('反例④：把 cleanup 删掉 → 报出来', () => {
    const bad = SOURCE.replace('harness.cleanup()', 'void 0')
    expect(verifyScriptViolations(bad).join('\n')).toContain('cleanup')
  })
})
