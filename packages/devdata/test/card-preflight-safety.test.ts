/**
 * `scripts/verify-devdata-card.mjs` 里**静态预检**（`POST /api/dsh-devdata/preflight`）与**截图留痕**
 * 这两块的存在性守卫（**脚本在仓根、守卫在包内**，与 `verify-script-safety` / `host-mount-script-safety`
 * 同一分工：脚本位置在根是为了进 `pnpm verify:list`，守卫留在包内是因为它只关乎本包）。
 *
 * ## 为什么这两块需要单独的守卫
 *
 * 2026-10-05 那次卡片改版把「快速开始」重做了一遍：预检从**纯模型**（`/project-context`）换成
 * **静态预检**（`/preflight`，把上下文 + 已保存目标 + 宿主事实合成一次判定），并且要求把每一轮的
 * 截图**留在仓内** `.artifacts/`（不再写 `os.tmpdir()`）。
 *
 * 两件事的共同点是：**它们的正确性只有真机跑一遍才知道**，而这个脚本进不了 CI
 * （要真宿主 + 真 Chrome，见 [docs/agent-real-test.md](../../../docs/agent-real-test.md)）。
 * 于是「路由换成 `/project-context` 却忘了改脚本」「截图又写回临时目录」这类漂移在 CI 里**没有任何
 * 信号**——这个文件补的就是这个信号。
 *
 * ## 它守**在不在**，不守**对不对**
 *
 * 判据全是形状（正则），所以它**不能**证明预检的判定是对的——那只有真跑脚本、或
 * `packages/devdata/test/config-preflight.test.ts`（判据真源）才算数。价值是防漂移：
 * 这几段一旦被删或被改弱，没有别的东西会红。**每条判据各配一条反例**（在真实源码上做一次字符串
 * 替换，断言检查函数报出对应违规）——静态守卫不许做成恒绿（本仓发生过「命中 0 个文件、恒绿、
 * 拦不住任何东西」的闸门）。
 *
 * **先去注释再判**：解释里会写反面示例（本文件自己也提了 `/api/dsh-devdata/preflight` 与
 * `chrome.screenshot`），直接对源码做正则会**被注释喂饱**、反例照旧绿——这是本仓记过的一类。
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const SOURCE = readFileSync(new URL('../../../scripts/verify-devdata-card.mjs', import.meta.url), 'utf8')

/** 去注释（块注释 + 行注释）：判据只看代码，不看解释。 */
export function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

/** 违例清单（**纯函数**，喂 fixture 就能造反例）。 */
export function cardPreflightViolations(raw: string): string[] {
  const source = stripComments(raw)
  const problems: string[] = []

  /* ---- ① 静态预检走**真 HTTP**（不是只拼一个请求对象） ---- */
  if (!source.includes("'/api/dsh-devdata/preflight'")) {
    problems.push('没有打到 `POST /api/dsh-devdata/preflight`：静态预检那条路在真机上没有证据')
  }
  // 成功形状：ok / context / target / problems 四件都要被断言（缺一件就等于没验那条契约）
  if (!/preflightOk\.json\?\.ok === true/.test(source)) {
    problems.push('没有断言预检成功路径的 `ok:true`（成功形状没有证据）')
  }
  if (!/preflightOk\.json\?\.target\?\.id/.test(source) || !/preflightOk\.json\?\.target\?\.engine/.test(source)) {
    problems.push('没有断言成功结果里的 `target:{id,engine}`——预检只回目标引用，不回连接快照')
  }
  if (!/problems\.length === 0/.test(source)) {
    problems.push('没有断言成功时 `problems` 为空')
  }
  // 作用域外：码 + 恢复路径 + 判过的 root / scopeDirs 四件
  if (!source.includes('OUT_OF_SCOPE')) {
    problems.push('没有断言作用域外那条 `OUT_OF_SCOPE`（预检的核心判据之一）')
  }
  if (!/outProblem\.root/.test(source) || !/outProblem\.scopeDirs/.test(source)) {
    problems.push('作用域拒绝没有带上判过的 `root` / `scopeDirs`（拒绝文案说不清判的是哪个目录就等于让人猜）')
  }
  if (!/outProblem\.hint/.test(source)) {
    problems.push('作用域拒绝没有断言恢复路径（`hint`）')
  }
  // 「什么都不做」：跑前跑后配置与审计逐字节相同
  if (!/auditBeforePreflight === auditAfterPreflight/.test(source)) {
    problems.push('没有断言预检不写审计（跑前跑后审计逐字节比对）')
  }
  // 「不连目标」：假服务收到的命令计数纹丝不动（真机上的机器判据）
  if (!/redisCommandCount/.test(source) || !/countAfterPreflight === countBeforePreflight/.test(source)) {
    problems.push('没有断言静态预检一条 Redis 命令都不发（假服务计数纹丝不动）——「预检不连目标」会退化成一句承诺')
  }
  // 浏览器不许自报事实
  if (!/forgedFields/.test(source) || !source.includes("'scopeDirs'")) {
    problems.push('没有断言预检拒绝浏览器自报的 `scopeDirs` / `enabled` / `mode`（多认一个字段就是多一条提权路）')
  }

  /* ---- ② 真 DOM 点击：两条主动作按**文案**找，不是靠位置 ---- */
  for (const label of ['检查配置', '读取目标']) {
    if (!source.includes(`'${label}'`)) {
      problems.push(`没有按文案找「${label}」按钮——按钮换位置就会把断言弄假`)
    }
  }
  /*
   * 「读取目标」**每一处**查找后面都必须真的 `.click()`（画了个按钮却只读它的 props 等于没点）。
   * 判据按**出现次数**比：脚本里这条按钮出现在两个场景（正常 + 连不上），只要求「至少有一次点击」
   * 会让第二个场景静默失去覆盖——那是本仓记过的「部分覆盖冒充覆盖」。
   */
  const readFinders = (source.match(/===\s*'读取目标'/g) ?? []).length
  const readClicks = (source.match(/读取目标'[\s\S]{0,400}?\.click\(\)/g) ?? []).length
  if (readFinders === 0 || readClicks < readFinders) {
    problems.push(`「读取目标」的 ${String(readFinders)} 处查找里只有 ${String(readClicks)} 处真的 \`.click()\`（只找不点等于没验这条路）`)
  }

  /* ---- ③ 只认非负安全整数：四种坏回复都要在 ---- */
  for (const bad of [':-1\\r\\n', '$3\\r\\n3.5\\r\\n', '+abc\\r\\n', ':99999999999999999999\\r\\n']) {
    if (!source.includes(bad)) {
      problems.push(`没有把坏回复 ${bad} 喂给「读取目标」——「只认非负安全整数」这条就没有反例`)
    }
  }
  if (!/badRuns\.every\(\(run\) => run\.ok === true && run\.state === 'not-verified'/.test(source)) {
    problems.push('没有精确断言坏回复一律尚未验证')
  }

  /* ---- ④ 换项目 / 换根 / 换目标 → 结果作废 ---- */
  if (!/invalidateReport/.test(source)) {
    problems.push('没有「换字段即作废」那一段（预检不是授权缓存，旧结论必须立刻失效）')
  }
  if (!/probes\[key\][\s\S]{0,120}?state === 'not-verified'/.test(source)) {
    problems.push('「换字段即作废」没有断言结果行回到 `not-verified`')
  }

  /* ---- ⑤ 截图落**仓内** `.artifacts/`，且走真 CDP ---- */
  if (!/path\.join\(repoRoot, '\.artifacts'/.test(source)) {
    problems.push("截图没有落在仓内 `.artifacts/`（落 `os.tmpdir()` 的图会被清理、也不跟改动放在一起）")
  }
  if (!/devdata-card-\$\{String\(process\.pid\)\}-/.test(source)) {
    problems.push('截图目录没有带 pid + 时间戳的唯一后缀（并行两次运行会互相覆盖）')
  }
  if (/os\.tmpdir\(\)[^\n]*\.png/.test(source)) {
    problems.push('还有截图写到 `os.tmpdir()`：截图落点必须统一在仓内 `.artifacts/`')
  }
  const shots = (source.match(/chrome\.screenshot\(/g) ?? []).length
  if (shots < 4) {
    problems.push(`只找到 ${String(shots)} 次 \`chrome.screenshot(\`：真 CDP 截图少于 4 张（桌面初始 / 窄屏初始 / 失败 / 成功）`)
  }
  // 四张图都要存在 + 是 PNG + 非空
  for (const name of ['desktop-initial', 'narrow-initial', 'desktop-fail', 'desktop-success']) {
    if (!source.includes(`shot('${name}')`)) {
      problems.push(`没有截「${name}」那一张（四张图里少了它）`)
    }
  }
  if (!/isPng/.test(source) || !/bytes > 2048/.test(source)) {
    problems.push('没有断言截图真的落盘（存在 + PNG 魔数 + 非空）——写失败时报告里那句「截图在 …」就是假的')
  }

  /* ---- ⑥ 作用域夹具在隔离目录里（前缀由 harness 给，不往别处漏） ---- */
  if (!/path\.join\(harness\.workDir, 'scope-project'\)/.test(source)) {
    problems.push('作用域内的临时项目没有建在 `harness.workDir` 里（夹具会漏到仓库或别处）')
  }
  if (!/path\.join\(harness\.workDir, 'outside-scope'\)/.test(source)) {
    problems.push('作用域外的对照目录没有建在 `harness.workDir` 里')
  }

  return problems
}

describe('devdata 卡片真机脚本：静态预检与截图留痕', () => {
  it('真实源码满足六组判据', () => {
    expect(cardPreflightViolations(SOURCE)).toEqual([])
  })

  it('反例①：预检路由又写回旧的 `/project-context` → 报出来', () => {
    const bad = SOURCE.replaceAll("'/api/dsh-devdata/preflight'", "'/api/dsh-devdata/project-context'")
    expect(cardPreflightViolations(bad).join('\n')).toContain('preflight')
  })

  it('反例②：不点「读取目标」按钮（只找不点）→ 报出来', () => {
    const bad = SOURCE.replaceAll(/读取目标'[\s\S]{0,400}?\.click\(\)/g, "读取目标'）")
    expect(cardPreflightViolations(bad).join('\n')).toContain('click')
  })

  it('反例③：把四种坏回复删掉 → 报出来（「只认非负安全整数」失去反例）', () => {
    const bad = SOURCE.replaceAll("':-1\\r\\n'", "':9\\r\\n'")
    expect(cardPreflightViolations(bad).join('\n')).toContain('坏回复')
  })

  it('反例④：截图写回 `os.tmpdir()` → 报出来', () => {
    const bad = SOURCE.replace("  return path.join(artifactDir, `${name}.png`)", "  return path.join(os.tmpdir(), `${name}.png`)")
    expect(cardPreflightViolations(bad).join('\n')).toContain('os.tmpdir()')
  })

  it('反例⑤：少一张「失败态」截图 → 报出来', () => {
    const bad = SOURCE.replace("shot('desktop-fail')", "shot('desktop-fail-renamed')")
    expect(cardPreflightViolations(bad).join('\n')).toContain('desktop-fail')
  })

  it('反例⑥：删掉「假服务计数纹丝不动」那条 → 报出来（「预检不连目标」失去机器判据）', () => {
    const bad = SOURCE.replace('countAfterPreflight === countBeforePreflight', 'countAfterPreflight >= 0')
    expect(cardPreflightViolations(bad).join('\n')).toContain('Redis 命令')
  })

  it('反例⑦：判据读的是**去注释后**的代码，注释里写对了不算', () => {
    const onlyComments = `
      /* '/api/dsh-devdata/preflight' OUT_OF_SCOPE chrome.screenshot( */
      const x = 1
    `
    const problems = cardPreflightViolations(onlyComments).join('\n')
    expect(problems).toContain('preflight')
    expect(problems).toContain('OUT_OF_SCOPE')
    expect(problems).toContain('chrome.screenshot(')
    expect(stripComments(onlyComments)).not.toContain('preflight')
  })
})
