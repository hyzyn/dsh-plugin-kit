/**
 * docker agent 公告（`DOCKER_GUIDANCE`）的**零目标出路**守卫。
 *
 * ## 钉的是什么
 *
 * 一条目标都没有时注册面被 `ZERO_TARGET_TOOLS` 收窄到 `docker_targets` +
 * `docker_connect_local` 两条（见 `src/index.ts` 的 `refreshTools`），其余工具的 `target`
 * 参数此刻无处可取——而 `docker_targets` 的描述还写着「其他 docker_* 工具的 target 参数
 * 取自这里」。公告若不给出一条出路，模型手里就剩一句「指向此刻并不存在的工具」的说明，
 * 只能原地打转。
 *
 * 2026-10-24 把公告从 1768 字符压到 518 时，这句解释被一起删掉了（只保留能力面与排障链），
 * 空态于是重新变成死胡同。本文件钉回三件事：
 *
 *   ① 公告必须点名 `docker_connect_local`（零目标时的**唯一**自救入口之一）；
 *   ② 那句话必须排在「target 传 `*`…」**之前**——先解决空态，再讲通配（通配对空态无用）；
 *   ③ 公告总长 ≤ `GUIDANCE_BUDGET`（600）。⚠️ 它**不在**
 *      `scripts/test/announcement-budget.test.ts` 的 7 个常量名单里（那份名单显式排除了
 *      docker / search 等公告），所以长度这条判据只在这里。
 *
 * ## 为什么是静态抽源码
 *
 * 与 `scripts/test/exec-terminal-scope.test.ts` 同一口径：公告是**字符串常量**，
 * 判别性靠「抽取 → 断言」拿到；起真宿主渲染一遍 prompt 需要 LLM 配置与几秒，而这里要答的
 * 只是「这段常量里有没有那句话」。代价是绕过写法拦不住（例如把常量改成运行时拼出来的），
 * 那种写法在本仓不会自然出现——它挡的是「压缩文案时顺手删掉」这类疏忽。
 *
 * ## 反例
 *
 * 每条判据都配一个反例（删掉那句话 / 把它挪到通配之后 / 把总长顶破预算），在**同一份判据**
 * 上跑并断言它变红。没有反例的守卫会在下一次改动里漂掉——本仓已记在案的那几次都是这个形状。
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const DOCKER_SRC = 'packages/docker/src/index.ts'

/** 公告总长预算（字符）。**固定值**——「涨了就把预算调大」等于没有这条守卫。 */
const GUIDANCE_BUDGET = 600

/** 零目标时仍然注册、且公告必须点名的自救入口（与 `ZERO_TARGET_TOOLS` 同一份名单）。 */
const ZERO_TARGET_ESCAPE = 'docker_connect_local'

/** 通配说明的开头：空态出路必须排在它前面。 */
const WILDCARD_CLAUSE = 'target 传'

/** 那句出路在公告里的原文（反例靠它做一次真实替换）。 */
const ESCAPE_SENTENCE = `**一个目标都没有时先 \`${ZERO_TARGET_ESCAPE}\` 加上本机目标**。`

function read(rel: string): string {
  return readFileSync(join(REPO, rel), 'utf8')
}

/** 取 `DOCKER_GUIDANCE` 这个字符串字面量的内容（找不到返回 undefined，由调用方报错）。 */
function guidanceText(src: string): string | undefined {
  const marker = src.indexOf('const DOCKER_GUIDANCE')
  if (marker === -1) return undefined
  const open = src.indexOf("'", marker)
  if (open === -1) return undefined
  const close = src.indexOf("'\n", open + 1)
  if (close === -1) return undefined
  return src.slice(open + 1, close)
}

/**
 * 判据：返回违反项（空数组 = 通过）。
 *
 * 抽成纯函数是为了让反例能落在**同一个判据**上——否则「反例红了」证明的是另一段代码红了。
 */
function violationsOf(guidance: string): string[] {
  const out: string[] = []
  if (guidance.length > GUIDANCE_BUDGET) {
    out.push(`公告 ${guidance.length} 字符，超过预算 ${GUIDANCE_BUDGET}`)
  }
  const escapeAt = guidance.indexOf(ZERO_TARGET_ESCAPE)
  if (escapeAt === -1) {
    out.push(`公告没点名零目标出路 ${ZERO_TARGET_ESCAPE}：零目标时只剩两条工具，模型没有可走的路`)
  }
  const wildcardAt = guidance.indexOf(WILDCARD_CLAUSE)
  if (escapeAt !== -1 && wildcardAt !== -1 && escapeAt > wildcardAt) {
    out.push('零目标出路排在通配说明之后：先解决空态，再讲通配')
  }
  return out
}

describe('docker agent 公告：零目标时的出路', () => {
  const guidance = guidanceText(read(DOCKER_SRC)) ?? ''

  it('能从源码里抽到公告（抽不到就是空测试，必须红）', () => {
    expect(guidance, 'DOCKER_GUIDANCE 没抽到（常量改名 / 换了写法？先修抽取，再谈判据）').not.toBe('')
    // 抽到的必须是一段真公告，而不是误匹配到别处的引号
    expect(guidance.length).toBeGreaterThan(200)
  })

  it('点名 docker_connect_local、排在通配之前，且总长 ≤ 600', () => {
    const violations = violationsOf(guidance)
    expect(violations, violations.join('\n')).toEqual([])
  })

  it('反例：删掉那句出路 → 判据必须红', () => {
    const withoutEscape = guidance.replace(ESCAPE_SENTENCE, '')
    expect(withoutEscape, '反例必须真的改动文本（句子漂了就先修这条用例）').not.toBe(guidance)
    expect(violationsOf(withoutEscape).join()).toContain(ZERO_TARGET_ESCAPE)
  })

  it('反例：把出路挪到通配之后 → 判据必须红（顺序也是判据）', () => {
    // 挪到「排障：」之前——那时它已经在「target 传 `*`」后面了
    const moved = guidance.replace(ESCAPE_SENTENCE, '').replace('排障：', ESCAPE_SENTENCE + '排障：')
    expect(moved, '反例必须真的改动文本').not.toBe(guidance)
    expect(moved.indexOf(ZERO_TARGET_ESCAPE), '反例里出路确实被挪到了通配之后').toBeGreaterThan(
      moved.indexOf(WILDCARD_CLAUSE),
    )
    expect(violationsOf(moved).join()).toContain('之后')
  })

  it('反例：总长顶破预算 → 判据必须红', () => {
    const tooLong = 'x'.repeat(GUIDANCE_BUDGET) + ZERO_TARGET_ESCAPE
    expect(tooLong.length).toBeGreaterThan(GUIDANCE_BUDGET)
    expect(violationsOf(tooLong).join()).toContain('预算')
  })
})
