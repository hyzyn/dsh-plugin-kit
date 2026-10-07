/**
 * `allowExec` 的**作用域**守卫：它只管 docker 自己的「一次性」exec 通道，
 * 卡片「终端」按钮的 `docker exec -it` 交互式 shell 由 tty 承载、**不受它门控**。
 *
 * ## 为什么要钉这一条
 *
 * 2026-10-07 用户看着设置卡片上「未生效：未获宿主授权」的两个开关 + 面板里一个能进容器的
 * 终端，问「这算是漏洞吗」。答案是「不是漏洞，是刻意的取舍」——但**当时的对外文案读起来像漏洞**：
 *
 *   - agent 公告（`DOCKER_GUIDANCE`）说「删除容器、删镜像、拉取镜像、docker exec，都需要用户
 *     在设置里显式打开『允许变更操作』『允许 exec』后才有对应**工具和按钮**」，而终端按钮一直在、
 *     且真能进容器执行命令；
 *   - docker README 的安全模型只列了 `/exec` 与 `docker_exec` 被挡，没有一句说明**另一条同效
 *     通道不受它管**，读者会推成「exec 整体被挡住」。
 *
 * 这个偏差不会让任何构建或测试变红（它只是文案），但它是本次唯一真实的问题：**声称的安全性质
 * 比实际成立的多一条**。所以在这里钉住——文档侧的说法一旦退回旧措辞，本用例就红。
 *
 * ## 判据分三层（都不许「匹配不到就算过」）
 *
 * 1. **事实层**（正控制）：卡片「终端」按钮的路径里**真的**没有 `allowExec` 判断——从
 *    `client-src/index.js` 的 `openExec` 抽出来现算，证明「不受门控」这句说的是实话；同时
 *    那两处**该有**闸的地方（`/exec` 路由与 `docker_exec` 工具）**必须**还在判 `allowExec`。
 * 2. **文案层**：五处对外文案各有一条锚点句，锚点句里必须出现「一次性 / one-shot」限定，
 *    且必须点明终端按钮不受它管；公告里还**不许**退回「…docker exec，都需要…」的笼统说法。
 * 3. **反例层**：把文案退回旧措辞 / 抹掉限定词 / 删掉「不受门控」那句 → 必须红。反例在
 *    **真实文本**上做一次替换并断言替换生效，不修改任何受版本控制的文件。
 *
 * ## 判据为什么是「锚点句 + 限定词」而不是「全文含某词」
 *
 * 全文含某词的写法没有判别性：docker README 的配置表里本来就写着「允许**一次性** exec」，于是
 * 「抹掉安全模型那句里的限定词」照样能过（本文件第一版就是这么写的，反例当场证明了它恒绿——
 * 见下面的反例用例）。所以每一处都先定位**锚点句**，再只查那句。
 *
 * 反向禁止（与 `docs/conventions.md` 一致）：守卫报红时改文案就对了，**不要**为了让它变绿去
 * 放松判据——这条性质（「闸门管哪条通道」要能被读者分清）正是这个文件存在的理由。
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (rel: string): string => readFileSync(join(REPO, rel), 'utf8')

/** docker 宿主半体的 agent 公告 + 两条 exec 通道的实现都在这里。 */
const DOCKER_SRC = 'packages/docker/src/index.ts'
/** 卡片「终端」按钮（`openExec`）在这里——它是**不受门控**的那条路径。 */
const DOCKER_CLIENT = 'packages/docker/client-src/index.js'
const DOCKER_README_ZH = 'packages/docker/README.md'
const DOCKER_README_EN = 'packages/docker/README.en.md'
const KIT_CAPABILITY = 'packages/kit/src/capability.ts'
const ARCHITECTURE = 'docs/architecture.md'

/**
 * 五处对外文案。每处给一个**锚点**（它必须存在）与**锚点句**必须命中的性质。
 *
 * `window` 是锚点之后取多长的文本当「锚点句」——取够了就行，不追求句号切分（中英混排与
 * 行内代码里的句号会把朴素的切句弄坏，那种脆弱判据比没有更坏）。
 */
interface ClaimSite {
  name: string
  path: string
  anchor: string
  window: number
  /** 锚点句里必须命中的正则（全部命中才算这处说清了）。 */
  must: RegExp[]
}

const WINDOW_DEFAULT = 400

const CLAIM_SITES: ClaimSite[] = [
  {
    name: 'docker agent 公告（DOCKER_GUIDANCE）',
    path: DOCKER_SRC,
    anchor: 'const DOCKER_GUIDANCE',
    // 公告是一整行超长字符串：窗口要够长才能覆盖到 exec 那半句
    window: 4000,
    must: [/一次性/, /不受它门控|不受.{0,8}门控/],
  },
  {
    name: 'docker README（zh）安全模型',
    path: DOCKER_README_ZH,
    anchor: '**`allowExec` 只管本插件的「一次性」exec 通道**',
    window: WINDOW_DEFAULT,
    must: [/一次性/, /终端/, /不受这两个开关|不经过这两个开关/],
  },
  {
    name: 'docker README（en）安全模型',
    path: DOCKER_README_EN,
    anchor: "**`allowExec` only governs this plugin's *one-shot* exec channel**",
    window: WINDOW_DEFAULT,
    must: [/one-shot/, /Terminal button/, /passes through neither switch|not gated by `allowExec`/],
  },
  {
    name: 'docker README（zh）已知限制：终端按钮不受门控',
    path: DOCKER_README_ZH,
    anchor: '- **`allowExec` 不是「进不了容器」的闸**',
    window: WINDOW_DEFAULT,
    must: [/不检查 `allowExec`/],
  },
  {
    name: 'docker README（en）Known limitations',
    path: DOCKER_README_EN,
    anchor: '- **`allowExec` is not the gate that keeps you out of the container**',
    window: WINDOW_DEFAULT,
    must: [/does not check\s+`allowExec`/],
  },
  {
    name: 'kit 威胁模型边界',
    path: KIT_CAPABILITY,
    anchor: '还有一条**能力面**的边界',
    window: 900,
    must: [/ttyTerminal/, /不检查 `allowExec`|页内脚本/],
  },
  {
    name: 'architecture § 7 能力面边界',
    path: ARCHITECTURE,
    anchor: '**同一条边界还适用于「能力面」**',
    window: 900,
    must: [/不检查 `allowExec`/, /ttyTerminal/],
  },
]

/** 对一组（路径 → 文本）跑全部文案判据；返回违规描述（空数组 = 全过）。 */
function claimViolations(files: Map<string, string>): string[] {
  const out: string[] = []
  for (const site of CLAIM_SITES) {
    const text = files.get(site.path)
    if (text === undefined) {
      out.push(`${site.name}：文件 ${site.path} 不在输入里`)
      continue
    }
    const at = text.indexOf(site.anchor)
    if (at === -1) {
      out.push(`${site.name}：锚点句不见了（${site.anchor.slice(0, 40)}）`)
      continue
    }
    const sentence = text.slice(at, at + site.window)
    for (const pattern of site.must) {
      if (!pattern.test(sentence)) out.push(`${site.name}：锚点句缺少 ${String(pattern)}`)
    }
  }
  // 公告专属：不许退回笼统说法（「docker exec，都需要…才有对应工具与按钮」）
  const src = files.get(DOCKER_SRC) ?? ''
  const guidance = guidanceText(src)
  if (guidance !== undefined && /docker exec，都需要/.test(guidance)) {
    out.push('docker agent 公告：退回了「docker exec，都需要…」这种把两条通道混在一起的说法')
  }
  return out
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

/** 真实仓库的七份文本（只读；反例都在它的副本上改）。 */
function realFiles(): Map<string, string> {
  const paths = new Set(CLAIM_SITES.map((site) => site.path))
  return new Map([...paths].map((path) => [path, read(path)]))
}

/** 在真实文本上做一次替换；**替换没生效就抛**（否则反例会变成空测试）。 */
function mutate(text: string, from: string, to: string): string {
  if (!text.includes(from)) throw new Error(`fixture 替换没匹配上：${from.slice(0, 60)}`)
  const mutated = text.replace(from, to)
  expect(mutated, 'fixture 必须真的改动文本').not.toBe(text)
  return mutated
}

describe('allowExec 的作用域：事实层（先证明「不受门控」是真话）', () => {
  const client = read(DOCKER_CLIENT)
  const src = read(DOCKER_SRC)

  it('卡片「终端」按钮走的是 tty 承载，不经过任何 allowExec 判断', () => {
    // 从 `const openExec = (item) => {` 抽到下一个顶层 const（函数体的边界）——抽不到就抛
    const start = client.indexOf('const openExec = (item) => {')
    expect(start, '`openExec` 在 client-src/index.js 里找不到（它被改名了？判据要跟着改）').toBeGreaterThan(-1)
    const end = client.indexOf('\n      const clearPending', start)
    expect(end, '`openExec` 之后找不到 `clearPending`（函数边界变了）').toBeGreaterThan(start)
    const body = client.slice(start, end)
    // 防「命中 0 行 = 恒绿」：先证明真的抽到了一段非空函数体
    expect(body.length, '抽到的 openExec 函数体太短，判据没有真的覆盖到它').toBeGreaterThan(500)
    expect(body, 'openExec 里出现了 allowExec——那与「终端按钮不受门控」的文案矛盾').not.toMatch(/allowExec/)
    // 正控制：它确实跑的是交互式 exec -it，而不是一次性 exec
    expect(body).toContain('buildExecCommand')
    expect(client).toContain('docker exec -it')
  })

  it('两条「该被闸」的通道还在判 allowExec（闸没有被人顺手删掉）', () => {
    expect(src.indexOf('if (!live.allowExec) throw new Error(execOffMessage())'), 'docker_exec 工具的 allowExec 判定不见了').toBeGreaterThan(-1)
    expect(src.indexOf('writeJson(res, 403, { error: execOffMessage() })'), '/exec 路由的 403 判定不见了').toBeGreaterThan(-1)
  })
})

describe('allowExec 的作用域：文案层（五处锚点句都得把两条通道分清）', () => {
  it('真实仓库七份文本全部通过', () => {
    expect(claimViolations(realFiles())).toEqual([])
  })

  it('判据不是恒绿：锚点句本身真的被取到并用上了', () => {
    // 抽到的锚点句长度必须远大于空串（否则 must 正则会因为空串而命中 0 次，恒红或恒绿都可能）
    const files = realFiles()
    for (const site of CLAIM_SITES) {
      const text = files.get(site.path) ?? ''
      const at = text.indexOf(site.anchor)
      expect(at, `${site.name} 锚点找不到`).toBeGreaterThan(-1)
      expect(text.slice(at, at + site.window).length, `${site.name} 的锚点句窗口取不到内容`).toBeGreaterThan(40)
    }
  })
})

describe('allowExec 的作用域：反例层（旧措辞必须能让守卫变红）', () => {
  it('公告退回「…docker exec，都需要…才有对应工具与按钮」→ 红', () => {
    const files = realFiles()
    const src = mutate(
      read(DOCKER_SRC),
      '**一次性** docker exec（docker_exec 工具与面板概览页的一次性命令框）',
      'docker exec',
    )
    files.set(DOCKER_SRC, src)
    const violations = claimViolations(files)
    expect(violations.join('\n'), '退回笼统说法必须被抓住').toMatch(/退回|一次性|不受它门控/)
  })

  it('公告删掉「不受它门控」那半句 → 红', () => {
    const files = realFiles()
    const src = mutate(read(DOCKER_SRC), '**不受它门控**（只读模式下也能用）', '')
    files.set(DOCKER_SRC, src)
    expect(claimViolations(files).join('\n')).toMatch(/公告.*锚点句缺少/)
  })

  it('README（zh）安全模型那句被抹掉限定词 → 红（第一版全文判据在这里恒绿，正是本层要防的）', () => {
    const files = realFiles()
    const zh = mutate(
      read(DOCKER_README_ZH),
      '**`allowExec` 只管本插件的「一次性」exec 通道**',
      '**`allowExec` 管全部 exec 通道**',
    )
    files.set(DOCKER_README_ZH, zh)
    const violations = claimViolations(files)
    expect(violations.join('\n'), '锚点句被改写必须报「锚点不见」').toMatch(/锚点句不见了/)
  })

  it('README（en）Known limitations 那条被删 → 红', () => {
    const files = realFiles()
    const en = mutate(
      read(DOCKER_README_EN),
      '- **`allowExec` is not the gate that keeps you out of the container**',
      '- **Something else entirely**',
    )
    files.set(DOCKER_README_EN, en)
    expect(claimViolations(files).join('\n')).toMatch(/Known limitations：锚点句不见了/)
  })

  it('architecture 的「不检查 allowExec」被改成相反的说法 → 红', () => {
    const files = realFiles()
    const doc = mutate(read(ARCHITECTURE), '那条通道**不检查 `allowExec`**', '那条通道**也要检查 `allowExec`**')
    files.set(ARCHITECTURE, doc)
    expect(claimViolations(files).join('\n')).toMatch(/architecture.*缺少/)
  })
})
