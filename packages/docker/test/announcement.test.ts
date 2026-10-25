/**
 * docker agent 公告（`DOCKER_GUIDANCE`）的两条守卫。
 *
 * ## 钉的是什么
 *
 * ① **零目标出路**。一条目标都没有时注册面被 `ZERO_TARGET_TOOLS` 收窄到 `docker_targets` +
 *    `docker_connect_local` 两条（见 `src/index.ts` 的 `refreshTools`），其余工具的 `target`
 *    参数此刻无处可取——而 `docker_targets` 的描述还写着「其他 docker_* 工具的 target 参数
 *    取自这里」。公告若不给出一条出路，模型手里就剩一句「指向此刻并不存在的工具」的说明，
 *    只能原地打转（2026-10-24 压缩公告时就踩过一次）。
 *
 * ② **被删段落的落点还在**。2026-10-25 把公告从 562 压到 244 字符，删掉两段事实：
 *    「`*` 只有 `docker_ps` / `docker_attention` 支持」与「排障顺序」。它们各自的归宿是
 *    那几个工具的 `description`（详见 `src/index.ts` 里 `DOCKER_GUIDANCE` 上方的注释）。
 *    公告从此**不再重复**它们，所以这里反向钉住：描述被精简掉 → 红。否则公告等于凭空丢信息。
 *
 * ## 不再管的两件事（各自移交 / 作废的理由）
 *
 *   - **长度**：移交 `scripts/test/announcement-budget.test.ts` 那份名单（docker 公告并入其中），
 *     本文件不再自带一条长度判据——两条长度闸门会各自漂。
 *   - **顺序（出路排在通配说明之前）**：「target 传 `*`…」那句已从公告移到两条工具的
 *     `description`，公告里没有可比的位置了。判据会退化成恒真（`wildcardAt === -1` 时整条跳过），
 *     留着只会让人以为还有人在管这件事。
 *
 * ## 为什么是静态抽源码
 *
 * 与 `scripts/test/exec-terminal-scope.test.ts` 同一口径：公告与工具描述都是**源码里的字符串
 * 字面量**，判别性靠「抽取 → 断言」拿到；起真宿主渲染一遍 prompt 需要 LLM 配置与几秒，而这里
 * 要答的只是「这段常量里有没有那句话」。代价是绕过写法拦不住（例如改成运行时拼出来的），
 * 那种写法在本仓不会自然出现——它挡的是「压缩文案时顺手删掉」这类疏忽。
 *
 * ## 反例
 *
 * 每条判据都配一个反例（删掉那句出路 / 删掉 `docker_logs` 描述里的 `docker_logs_grep`），
 * 在**同一份判据**上跑并断言它变红。没有反例的守卫会在下一次改动里漂掉——本仓已记在案的
 * 那几次都是这个形状。
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const DOCKER_SRC = 'packages/docker/src/index.ts'

/** 零目标时仍然注册、且公告必须点名的自救入口（与 `ZERO_TARGET_TOOLS` 同一份名单）。 */
const ZERO_TARGET_ESCAPE = 'docker_connect_local'

/** 那句出路在公告里的原文（反例靠它做一次真实替换）。 */
const ESCAPE_SENTENCE = `**一个目标都没有时先 \`${ZERO_TARGET_ESCAPE}\` 加上本机目标**。`

/**
 * 公告删掉的两条事实，如今只能靠工具描述承载。
 *
 * 两边都得在：`docker_ps` / `docker_attention` 的 `description` 各写着 `target` 可传 `*`
 * （跨目标）；`docker_logs` 的 `description` 必须把模型指向 `docker_logs_grep`（深处检索）。
 */
const FACT_SITES = [
  { tool: 'docker_ps', needle: '`*`' },
  { tool: 'docker_attention', needle: '`*`' },
  { tool: 'docker_logs', needle: 'docker_logs_grep' },
] as const

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
 * 取某个工具 `defineTool({…})` 里 `description:` 的字符串字面量（抽不到返回 undefined）。
 *
 * 只认 `add('<tool>', defineTool({` 这个锚点，再取其后第一个 `description:`——三条目标的
 * `description` 都排在 `parameters` 之前，所以不会误抓到参数里的同名字段。
 */
function toolDescription(src: string, tool: string): string | undefined {
  const marker = `add('${tool}', defineTool({`
  const at = src.indexOf(marker)
  if (at === -1) return undefined
  const key = src.indexOf('description:', at + marker.length)
  if (key === -1) return undefined
  const open = src.indexOf("'", key)
  if (open === -1) return undefined
  let out = ''
  for (let i = open + 1; i < src.length; i += 1) {
    const ch = src[i] ?? ''
    if (ch === '\\') {
      out += src[i + 1] ?? ''
      i += 1
      continue
    }
    if (ch === "'") return out
    out += ch
  }
  return undefined
}

/**
 * 判据①：返回违反项（空数组 = 通过）。
 *
 * 抽成纯函数是为了让反例能落在**同一个判据**上——否则「反例红了」证明的是另一段代码红了。
 */
function zeroTargetViolationsOf(guidance: string): string[] {
  const out: string[] = []
  const escapeAt = guidance.indexOf(ZERO_TARGET_ESCAPE)
  if (escapeAt === -1) {
    out.push(`公告没点名零目标出路 ${ZERO_TARGET_ESCAPE}：零目标时只剩两条工具，模型没有可走的路`)
  }
  return out
}

/** 判据②：被删事实的落点是否仍写在对应工具的描述里（空数组 = 通过）。 */
function missingFactSites(descriptions: Record<string, string | undefined>): string[] {
  const out: string[] = []
  for (const site of FACT_SITES) {
    const text = descriptions[site.tool]
    if (text === undefined) {
      out.push(`抽不到 ${site.tool} 的 description（工具改名 / 换写法了？先修抽取，再谈判据）`)
      continue
    }
    if (!text.includes(site.needle)) {
      out.push(
        `${site.tool} 的 description 里没有 ${site.needle}：公告已经不重复这条事实了，描述再丢就等于凭空丢信息`,
      )
    }
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

  it('点名零目标出路 docker_connect_local', () => {
    const violations = zeroTargetViolationsOf(guidance)
    expect(violations, violations.join('\n')).toEqual([])
  })

  it('反例：删掉那句出路 → 判据必须红', () => {
    const withoutEscape = guidance.replace(ESCAPE_SENTENCE, '')
    expect(withoutEscape, '反例必须真的改动文本（句子漂了就先修这条用例）').not.toBe(guidance)
    expect(zeroTargetViolationsOf(withoutEscape).join()).toContain(ZERO_TARGET_ESCAPE)
  })
})

describe('docker agent 公告：被删段落的事实仍在工具描述里', () => {
  const src = read(DOCKER_SRC)
  const descriptions: Record<string, string | undefined> = {}
  for (const site of FACT_SITES) descriptions[site.tool] = toolDescription(src, site.tool)

  it('docker_ps / docker_attention 描述含 `*`（跨目标），docker_logs 描述含 docker_logs_grep', () => {
    const missing = missingFactSites(descriptions)
    expect(missing, missing.join('\n')).toEqual([])
  })

  it('反例：删掉 docker_logs 描述里的 docker_logs_grep → 判据必须红', () => {
    const logs = descriptions.docker_logs ?? ''
    const stripped = logs.replace('docker_logs_grep', '')
    expect(stripped, '反例必须真的改动文本（描述漂了就先修这条用例）').not.toBe(logs)
    expect(missingFactSites({ ...descriptions, docker_logs: stripped }).join()).toContain('docker_logs_grep')
  })
})
