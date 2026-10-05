import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { expect, it } from 'vitest'

/**
 * 手写客户端在假宿主请求 + hook 状态中真跑，守住仅靠静态 lint 看不到的请求与恢复行为。
 *
 * 这条用例**只负责把冒烟跑起来**：判据全在 `scripts/client-smoke.mjs` 里（那里能拿到真实
 * 组件树，vitest 这一层拿不到 React / DOM）。所以它除了退出码，还要钉住冒烟**真的跑到了那几组
 * 反例**——把某一段删掉时，这里的 `toContain` 会红，而不是靠「脚本仍然退出 0」蒙混过去。
 */
it('devdata card preserves shared context, honest results, and safe save behavior', () => {
  const script = fileURLToPath(new URL('../scripts/client-smoke.mjs', import.meta.url))
  const run = spawnSync(process.execPath, [script], { encoding: 'utf8', timeout: 15_000 })
  const output = String(run.stdout ?? '') + String(run.stderr ?? '')
  expect(run.error, output).toBeUndefined()
  expect(run.status, output).toBe(0)
  expect(output).toContain('[devdata client-smoke]')
  expect(output).toContain('confirmation safety passed')
}, 20_000)

/**
 * **反例判据必须真的在跑**（防「把断言删了、闸门照绿」）。
 *
 * 冒烟脚本自己的断言失败会让上面那条红；但**删掉一整段反例**（比如合法 DBSIZE 的那几档非法值）
 * 只会让它跑得更快、照样退出 0。所以这里按源码钉住四组判据的存在——它们各自对应一条
 * 「不许冒充通过 / 不许猜分类」的规矩，删掉任何一组都要在这里红。
 */
const SMOKE = fileURLToPath(new URL('../scripts/client-smoke.mjs', import.meta.url))

it('client-smoke keeps the response-category counterexamples (explicit category / exact code map / no substring inference)', async () => {
  const { readFileSync } = await import('node:fs')
  const source = readFileSync(SMOKE, 'utf8')
  /*
   * ① 分类只来自**显式 `category`** 或**精确码表**：那条「正文里带 scope 但码是执行错」的
   *    反例是判据本身——删了它，子串推断就会悄悄回来而没人知道。
   */
  expect(source).toContain("category must not be inferred from error substrings")
  expect(source).toContain("an explicit server category wins")
  // ② 三档结构化失败逐档钉住：作用域 / 执行 / 审计各一条。
  expect(source).toContain("['OUT_OF_SCOPE', 'configuration']")
  expect(source).toContain("['EXECUTION_FAILED', 'execution']")
  expect(source).toContain("['AUDIT_NOT_DURABLE', 'audit']")
})

it('client-smoke keeps the legal-DBSIZE counterexamples (only a canonical non-negative safe integer passes)', async () => {
  const { readFileSync } = await import('node:fs')
  const source = readFileSync(SMOKE, 'utf8')
  /*
   * 合法观测值那一组反例：负数 / 小数 / 非数字 / 超大数 / 前导零 / 正号 / 指数 / 空白 / 空串。
   * 删掉任何一条，「只有合法观测值才算通过」这句就少一块证据。
   */
  expect(source).toContain("'-1', '3.5', 'abc', '99999999999999999999', '007', '+7', '1e3'")
  expect(source).toContain("an illegal observation is not-verified, not fail")
  expect(source).toContain("a canonical non-negative safe integer must pass")
  // 分类只写在失败行上（通过不带分类）——这一条也要有反例。
  expect(source).toContain("a pass carries no failure category")
  /*
   * 宿主那六档回复的**端到端对照**（与真机脚本 ㊻ 同一张表）：协议错走 `execution`、
   * 「回复到了但形状不合法」走 `response`。把这两档混成一个，恢复路径就会指错地方。
   */
  expect(source).toContain("['fractionProtocol', { ok: false, code: 'EXECUTION_FAILED'")
  expect(source).toContain("['huge', { ok: false, code: 'EXECUTION_FAILED'")
  expect(source).toContain("['negative', { ok: true, text: '-1' }, 'not-verified', 'response']")
})

it('client-smoke keeps the stale-invalidation and exact-preflight-body counterexamples', async () => {
  const { readFileSync } = await import('node:fs')
  const source = readFileSync(SMOKE, 'utf8')
  /*
   * ③ 作废：改上下文立刻清旧结论，且被作废的那一轮**不许**自己回来。
   * ④ 请求体：预检**只发** `{ root, project, target }`——多一个字段就是多一条「页内脚本自己
   *    宣布自己有权限」的路。
   */
  expect(source).toContain("editing the context must invalidate immediately")
  expect(source).toContain("an invalidated result must not come back")
  expect(source).toContain("{ root: '', project: '', target: 'saved-redis' }")
  // 假绿防线：`ok:true` 但缺 context / 缺 target / problems 非空都不许通过。
  expect(source).toContain("malformed preflight success must not pass")
  expect(source).toContain("transport error must not count as preflight pass")
  /*
   * ⑤ 无目标时那枚入口的**接线**也要有反例：它必须真的展开高级设置并滚到目标编辑器——
   *    只画一个按钮不算（那段断言用的是接上 ref 的 DOM 桩）。
   */
  expect(source).toContain("the entry must expand Advanced settings")
  expect(source).toContain("the entry must scroll to the target editor")
})
