/**
 * 「提交钩子跑几道闸」这件事，AGENTS.md / RELEASING.md 的说法必须与 `.githooks/` 实况一致。
 *
 * ## 为什么有这份用例
 *
 * 2026-11-04 的文档审计抓到一处**静默过期**：[AGENTS.md](../AGENTS.md) 写着「另跑**两道**闸门」、
 * [RELEASING.md](../RELEASING.md) 的钩子表只列了「产物重建 + 公网 IP」，而 `pre-commit` 实况是
 * **五道**扫描（i18n → 公网 IP → 内部标识 → readme-facts → readme-structure）。两页都是维护者
 * 最先读的入口，却都没有任何东西会红——改钩子的人未必记得回头改它们。
 *
 * 手改一次不够：**下一次往钩子里加一道闸，这两段又会静默过期**。这正是本仓那条判据
 * 「没有守卫的规矩会在下一次改动里漂掉」的实例，所以把「文档说的道数」变成现算对账。
 *
 * ## 判据（纯静态，读三份文本）
 *
 * 1. 从 `.githooks/pre-commit` 现算 `node scripts/check-*.mjs` 的调用清单与**顺序**；
 * 2. `AGENTS.md` 的「<N>道扫描闸门」里的 N 必须等于实际道数（中文数字，1–10）；
 * 3. `RELEASING.md` 必须①同样写对道数、②逐个点名每道脚本、③点名顺序与钩子一致
 *    （表里那一行是「按 index 依次扫」，顺序本身就是信息）；
 * 4. `commit-msg` 的两道闸也必须在 `RELEASING.md` 里被点名（它只在提交信息那一行出现）。
 *
 * 刻意**不**做的：不校验每道闸的**判据**（各有自己的用例：`i18n.test.ts` / `internal-identifiers.test.ts` /
 * `check-readme-structure.test.ts` …）。这里只管「钩子与文档说的道数/顺序是否同一件事」。
 */
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..', '..')

/** 中文数字（1–10）；钩子道数超出这个范围就说明判据该改写了，直接判红。 */
const CN_DIGITS = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十']

/**
 * 从一个钩子文件里现算它真的执行了哪些闸门脚本（按出现顺序、去重）。
 *
 * 只认 `node scripts/check-*.mjs` 这种**可执行**形态；注释里提到脚本名不算——那正是
 * 「文档写了、钩子没跑」的相反情形，不该被这条判据放行。
 */
export function hookGateScripts(text: string): string[] {
  const found: string[] = []
  for (const match of text.matchAll(/node\s+(scripts\/check-[a-z0-9-]+\.mjs)/gu)) {
    if (!found.includes(match[1])) found.push(match[1])
  }
  return found
}

/** 脚本路径 → 文档里通常引用的短名（`scripts/check-i18n.mjs` → `check-i18n`）。 */
export function shortName(script: string): string {
  return script.replace(/^scripts\//u, '').replace(/\.mjs$/u, '')
}

/**
 * 判「钩子 ↔ 文档」是否还是同一件事。
 *
 * @param input - `preCommit` / `commitMsg` / `agents` / `releasing` 四份文本
 * @returns 问题列表；空数组 = 一致
 */
export function checkHookClaims(input: {
  preCommit: string
  commitMsg: string
  agents: string
  releasing: string
}): string[] {
  const problems: string[] = []
  const gates = hookGateScripts(input.preCommit)
  if (gates.length === 0) {
    problems.push('pre-commit 里一道 `node scripts/check-*.mjs` 都没解析到——判据失效（先修钩子或本判据）')
    return problems
  }
  if (gates.length > 10) {
    problems.push(`pre-commit 跑了 ${String(gates.length)} 道闸，超出本判据支持的中文数字范围（1–10）——改判据时要一并更新`)
    return problems
  }
  const numeral = CN_DIGITS[gates.length]

  // ① AGENTS.md：道数
  if (!input.agents.includes(`${numeral}道扫描闸门`)) {
    problems.push(
      `AGENTS.md 没写「${numeral}道扫描闸门」（pre-commit 实际 ${String(gates.length)} 道：${gates.map(shortName).join(' / ')}）`,
    )
  }

  // ② RELEASING.md：道数
  if (!input.releasing.includes(`${numeral}道`)) {
    problems.push(`RELEASING.md 没写「${numeral}道」（pre-commit 实际 ${String(gates.length)} 道）`)
  }

  // ③ RELEASING.md：逐个点名 + 顺序一致
  let previousIndex = -1
  for (const script of gates) {
    const name = shortName(script)
    const index = input.releasing.indexOf(name)
    if (index < 0) {
      problems.push(`RELEASING.md 的钩子表没点名 ${name}（pre-commit 实际会跑它）`)
      continue
    }
    if (index < previousIndex) {
      problems.push(`RELEASING.md 里 ${name} 的位置早于上一道闸，与 pre-commit 的执行顺序不一致（表里写的是「依次扫」）`)
    }
    previousIndex = Math.max(previousIndex, index)
  }

  // ④ commit-msg 的两道闸也要在 RELEASING.md 里被点名
  const messageGates = hookGateScripts(input.commitMsg)
  if (messageGates.length === 0) problems.push('commit-msg 里一道 check-*.mjs 都没解析到（提交信息闸门没了？）')
  for (const script of messageGates) {
    const name = shortName(script)
    if (!input.releasing.includes(name)) problems.push(`RELEASING.md 没点名 commit-msg 的 ${name}`)
  }

  return problems
}

describe('提交钩子 ↔ AGENTS/RELEASING 的说法一致（道数与顺序现算）', () => {
  const read = (rel: string) => readFileSync(join(root, rel), 'utf8')
  const real = {
    preCommit: read('.githooks/pre-commit'),
    commitMsg: read('.githooks/commit-msg'),
    agents: read('AGENTS.md'),
    releasing: read('RELEASING.md'),
  }

  it('真实仓通过', () => {
    expect(checkHookClaims(real)).toEqual([])
  })

  it('钩子确实解析到了五道扫描闸门（判据不是空转）', () => {
    expect(hookGateScripts(real.preCommit).map(shortName)).toEqual([
      'check-i18n',
      'check-no-public-ip',
      'check-internal-identifiers',
      'check-readme-facts',
      'check-readme-structure',
    ])
  })

  it('反例：钩子加第六道闸、文档还写「五道」→ 必须报', () => {
    const extra = `${real.preCommit}\nif ! node scripts/check-new-gate.mjs; then exit 1; fi\n`
    const problems = checkHookClaims({ ...real, preCommit: extra })
    expect(problems.join('\n')).toMatch(/AGENTS\.md 没写「六道扫描闸门」/)
    expect(problems.join('\n')).toMatch(/没点名 check-new-gate/)
  })

  it('反例：RELEASING 把两道闸的顺序写反 → 必须报', () => {
    const swapped = real.releasing
      .replace('check-i18n', '__A__')
      .replace('check-no-public-ip', 'check-i18n')
      .replace('__A__', 'check-no-public-ip')
    const problems = checkHookClaims({ ...real, releasing: swapped })
    expect(problems.join('\n')).toMatch(/与 pre-commit 的执行顺序不一致/)
  })

  it('反例：commit-msg 多出一道闸、RELEASING 没点名它 → 必须报', () => {
    const extra = `${real.commitMsg}\nif ! node scripts/check-message-only.mjs --message-file "$1"; then exit 1; fi\n`
    const problems = checkHookClaims({ ...real, commitMsg: extra })
    expect(problems.join('\n')).toMatch(/没点名 commit-msg 的 check-message-only/)
  })
})
