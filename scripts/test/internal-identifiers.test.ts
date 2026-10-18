/**
 * `scripts/check-internal-identifiers.mjs` 的单元测试 —— 真实内部标识的静态闸门。
 *
 * 为什么有这份测试：这道闸守的是「内网服务名 / 项目代号 / 账号 / 主机号不得入库」，
 * 而**闸门自己也会失效**——失效时恰恰是全绿，谁也不出声。三种失效形态：
 *   ① 切段写错（只按 `-` 切）→ 混用分隔符的名字永远匹配不到；
 *   ② 边界写松（子串匹配）→ 短名会在「粘连变体」上乱报，闸门被当成噪声绕过；
 *   ③ 词表被清空或被改成明文 → 前者等于关闸，后者等于换个地方泄露。
 *
 * 所以下面每一组都配**反例**，最后一组直接拿**真实语料**跑一遍（既证明上线即绿，也拦住
 * 以后有人把真名重新写回夹具）。
 *
 * ⚠️ 本文件**不得**出现任何真实禁词：需要「已知禁词」的地方一律在运行期造词并哈希
 * （`hashTerm('probe-…')`）。这条纪律写在闸门的文件头里，这里也一样适用。
 */
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { candidateSpans, findInternalIdentifiers, hashTerm } from '../check-internal-identifiers.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

/** 运行期造一个禁词（明文只活在这个调用里，不落文件）。 */
const PROBE = 'probe-internal-9f3a'
const PROBE_TABLE = new Set([hashTerm(PROBE)])

describe('hashTerm：口径固定', () => {
  it('同一个词前后空白 / 大小写不影响哈希（大小写不敏感就是这样来的）', () => {
    expect(hashTerm('  App-Svc-Probe  ')).toBe(hashTerm('app-svc-probe'))
  })

  it('不同词就是不同哈希（不做任何折叠）', () => {
    expect(hashTerm('probe-a')).not.toBe(hashTerm('probe-b'))
  })

  it('输出是完整的 sha256 十六进制（64 位，闸门的词表就是按这个长度写的）', () => {
    expect(hashTerm('probe-a')).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('candidateSpans：切段与边界', () => {
  /** 只取片段文本（偏移另有用例专测）。 */
  const texts = (token) => candidateSpans(token).map((span) => span.text)

  it('单个词就用自己', () => {
    expect(texts('probe')).toEqual(['probe'])
  })

  it('连字符名字的每个连续片段都要生成（`a-b-c` → a / a-b / a-b-c / b / b-c / c）', () => {
    expect(texts('a-b-c').sort()).toEqual(['a', 'a-b', 'a-b-c', 'b', 'b-c', 'c'].sort())
  })

  it('**混用分隔符**也要能还原出原文形态（这条是 ① 的守卫）', () => {
    // `probe-9.1` 只按 `-` 切会得到 `probe-9.1`（对）与 `9.1`；
    // 按 [-._] 全切再**从原文取子串**才保证 `probe-9.1` 这个形态一定在候选里
    expect(texts('probe-9.1')).toContain('probe-9.1')
  })

  it('点是分隔符：`10.1.2` 要能生成 `10.1` / `10.1.2` 这类前缀形态', () => {
    const spans = texts('10.1.2')
    expect(spans).toContain('10.1')
    expect(spans).toContain('10.1.2')
  })

  it('每个片段都带回它在 token 里的偏移（行号要按真实命中位置算）', () => {
    const spans = candidateSpans('probe-9.1')
    const whole = spans.find((span) => span.text === 'probe-9.1')
    expect(whole.index).toBe(0)
    const tail = spans.find((span) => span.text === '9.1')
    expect(tail.index).toBe(6)
  })

  it('超长**单段** token 不产出任何片段（它不可能等于任何一个短禁词）', () => {
    expect(candidateSpans('x'.repeat(200))).toEqual([])
  })

  it('**长 token 里藏着的短片段照样要检查**（按片段算预算，不是整条 token 跳过——这是曾经的盲区）', () => {
    expect(texts(`${'x'.repeat(200)}-${PROBE}`)).toContain(PROBE)
  })

  it('空串不炸', () => {
    expect(candidateSpans('')).toEqual([])
  })
})

describe('findInternalIdentifiers：命中与不命中', () => {
  it('整词命中', () => {
    expect(findInternalIdentifiers(`常驻 ${PROBE} 服务`, PROBE_TABLE).map((h) => h.token)).toEqual([PROBE])
  })

  it('大小写不敏感', () => {
    expect(findInternalIdentifiers(PROBE.toUpperCase(), PROBE_TABLE)).toHaveLength(1)
  })

  it('被连字符 / 点粘在长名字里也要认出来（真机上的 `xxx-test` 形态）', () => {
    expect(findInternalIdentifiers(`prefix-${PROBE}-suffix`, PROBE_TABLE)).toHaveLength(1)
    expect(findInternalIdentifiers(`${PROBE}.example`, PROBE_TABLE)).toHaveLength(1)
  })

  it('藏在**超长** token 里也不许漏（按片段算预算：压缩产物里那种上万字符的串）', () => {
    expect(findInternalIdentifiers(`${'x'.repeat(300)}-${PROBE}`, PROBE_TABLE)).toHaveLength(1)
  })

  it('反例：粘成**另一个标识符**就不算（边界语义是「宁漏不误报」）', () => {
    expect(findInternalIdentifiers(`${PROBE}2`, PROBE_TABLE)).toEqual([])
  })

  it('反例：只命中某个片段不算（`probe-internal` 不是整词）', () => {
    expect(findInternalIdentifiers('probe-internal', PROBE_TABLE)).toEqual([])
  })

  it('反例：中性夹具与占位地址一个字都不许报', () => {
    const neutral = 'app-svc-1 batch-job-a prometheus grafana nginx 10.0.0.5 192.0.2.10 example.test host-a.internal'
    expect(findInternalIdentifiers(neutral, PROBE_TABLE)).toEqual([])
  })

  it('同一个词出现多次只报一次（按哈希去重）', () => {
    expect(findInternalIdentifiers(`${PROBE} 和 ${PROBE}`, PROBE_TABLE)).toHaveLength(1)
  })

  it('空串 / 空表不炸', () => {
    expect(findInternalIdentifiers('', PROBE_TABLE)).toEqual([])
    expect(findInternalIdentifiers(`有 ${PROBE} 但表是空的`, new Set())).toEqual([])
  })
})

describe('真实语料：上线即绿，且真名不许回流', () => {
  /** 直接跑闸门本体（全仓已跟踪文件）——它自己就是最好的逆向用例。 */
  const runGate = () => {
    try {
      execFileSync(process.execPath, [join(repoRoot, 'scripts/check-internal-identifiers.mjs')], {
        cwd: repoRoot,
        encoding: 'utf8',
        stdio: 'pipe',
      })
      return { ok: true, out: '' }
    } catch (error) {
      return { ok: false, out: String(error.stdout ?? '') + String(error.stderr ?? '') }
    }
  }

  it('全仓当前是干净的（这道用例会在有人把真名写回夹具时立刻红）', () => {
    const result = runGate()
    expect(result.ok, `闸门报出的违规：\n${result.out}`).toBe(true)
  })

  it('自检也过（`--self-test`，CI 与 pre-commit 都跑它）', () => {
    const out = execFileSync(process.execPath, [join(repoRoot, 'scripts/check-internal-identifiers.mjs'), '--self-test'], {
      cwd: repoRoot,
      encoding: 'utf8',
    })
    expect(out).toContain('自检通过')
  })

  it('**闸门文件自身不含明文**：词表里只有 64 位十六进制串', () => {
    const source = readFileSync(join(repoRoot, 'scripts/check-internal-identifiers.mjs'), 'utf8')
    // 取出词表区块（从 `const BANNED_HASHES` 到 `])`），里面每个元素都必须是哈希
    const block = source.slice(source.indexOf('const BANNED_HASHES'), source.indexOf('const SELF_EXEMPT'))
    const literals = [...block.matchAll(/'([^']*)'/g)].map((m) => m[1])
    const hashes = literals.filter((text) => /^[0-9a-f]{64}$/.test(text))
    expect(hashes.length).toBeGreaterThanOrEqual(10)
    // 剩下的字符串字面量只允许出现在注释掉的说明里——本块里不该有别的
    expect(literals.length).toBe(hashes.length)
  })
})
