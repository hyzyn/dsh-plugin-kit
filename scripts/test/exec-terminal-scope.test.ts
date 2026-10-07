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
 * 2. **文案层**：`CLAIM_SITES` 里每一处对外文案各有一条锚点句，锚点句里必须出现「一次性 /
 *    one-shot」限定，
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
/** tty 中英两条「承载性前提」（无静态能力闸）——见 CLAIM_SITES 里的 A5 说明。 */
const TTY_README_ZH = 'packages/tty/README.md'
const TTY_README_EN = 'packages/tty/README.en.md'

/**
 * 对外文案清单。每处给一个**锚点**（它必须存在）与**锚点句**必须命中的性质。
 *
 * **不写死「几处 / 几份文件」**（本仓规矩：不写会漂的数字）——要看数量就现算 `CLAIM_SITES.length`
 * 与它引用的去重路径数，判据见「文案层」那条自检。
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
    /*
     * 「不受…门控」中间的字符数**不许写小**：本判据第一版写的是 `{0,8}`，于是把措辞改得更准
     * （「不受它门控」→「不受 `allowExec` 门控」）反而会红——而文件头写着「报红就改文案、
     * 不许放松判据」，那就把人推向**更差**的措辞。这里放到 24，并用「不跨句」兜住范围
     * （句号 / 分号 / 换行即止，免得窗口里的另一句话把这条凑出来）。
     */
    must: [/一次性/, /不受[^。；;！\n]{0,24}门控/],
  },
  {
    name: 'docker README（zh）安全模型',
    path: DOCKER_README_ZH,
    anchor: '**`allowExec` 只管本插件的「一次性」exec 通道**',
    window: WINDOW_DEFAULT,
    must: [/一次性/, /终端/, /不受这两个开关|不经过这两个开关/],
  },
  /*
   * B2（2026-10-07 review）：配置表那行原写「概览页的 exec 输入框」，而面板里
   * **详情抽屉的页签**叫「概览」、**顶层多目标视图**叫「总览」——写成「概览页」容易被读成
   * 后者（那是只读页，上面根本没有 exec 输入框）。判据钉住「抽屉 + 页签」这个限定。
   */
  {
    name: 'docker README（zh）allowExec 行点明是抽屉页签',
    path: DOCKER_README_ZH,
    anchor: '| `allowExec` | false |',
    window: WINDOW_DEFAULT,
    must: [/容器详情抽屉/, /「概览」页签/],
  },
  {
    name: 'docker README（en）安全模型',
    path: DOCKER_README_EN,
    anchor: "**`allowExec` only governs this plugin's *one-shot* exec channel**",
    window: WINDOW_DEFAULT,
    must: [/one-shot/, /Terminal button/, /passes through neither switch|not gated by `allowExec`/],
  },
  {
    name: 'docker README（en）allowExec row names the detail tab (B2)',
    path: DOCKER_README_EN,
    anchor: '| `allowExec` | false |',
    window: WINDOW_DEFAULT,
    must: [/container detail drawer/, /Overview.*tab/],
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
  /*
   * A5（2026-10-07 review 指出）：上轮改了 tty README 中英两条「承载性前提」——即
   * 「`ttyTerminal` / WS `spawn` 是没有静态能力闸的命令面」——却是**零判据**。
   * 那两句正是本文件整套论证的**承重墙**：docker 的 `allowExec` 之所以「只管一次性通道」，
   * 前提就是「交互式那条另有归属、且它自己没有静态闸」。少了判据，它被删掉不会有人知道。
   */
  {
    name: 'tty README（zh）无静态能力闸',
    path: TTY_README_ZH,
    anchor: '**`ttyTerminal` / WS `spawn` 是「没有静态能力闸」的命令面**',
    window: 1200,
    /*
     * B3（2026-10-07 review）：这两条原先说「权限上界由 tier gate 承担」，但 tier gate 挂在
     * `tools/pre-execute` 上、只按 `tty_`/`sftp_`/`tunnel_` **前缀**过滤 agent 工具调用，
     * **浏览器 WS `spawn` 完全不经过它**——那等于把 tier gate 说成了这个命令面的闸门。
     * 所以必须点明「它管不到这里」，并点名 `TTY_TIER_PREFIXES`（判据锚点）。
     */
    must: [/不受任何 `DSH_\*_ALLOW_\*` 管辖/, /ProxyCommand/, /TTY_TIER_PREFIXES/, /不经过它|never passes through it/],
  },
  {
    name: 'tty README（en）no static capability gate',
    path: TTY_README_EN,
    anchor: '**`ttyTerminal` / WS `spawn` is a command surface with no static capability gate**',
    window: 1600,
    // B3：同 zh 那条——必须点明 tier gate 管不到 WS 通道
    must: [/not governed by any `DSH_\*_ALLOW_\*`/, /ProxyCommand/, /TTY_TIER_PREFIXES/, /never passes through it/],
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

/** 真实仓库的文本（只读；反例都在它的副本上改）。**份数现算**，别写死。 */
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

describe('allowExec 的作用域：文案层（每条锚点句都得把两条通道分清）', () => {
  it('真实仓库全部文案通过', () => {
    expect(claimViolations(realFiles())).toEqual([])
  })

  /*
   * B4（2026-10-07 review）：本文件原先在三处写了三个不同的计数（文件头「五处」、用例名
   * 「七份文本」、docker D163「四处」），而实为 9 个 site、7 个文件——**写死的计数必漂**。
   * 处置有两条：① 把数字从散文里删掉（改说「CLAIM_SITES 里每一处」）；② 在这里现算一条判据，
   * 让「site 数 / 覆盖的文件数」在测试里**可查**，谁改了 `CLAIM_SITES` 都看得到。
   */
  it('覆盖范围现算：site 数与文件数都可查（不写死计数，B4）', () => {
    const paths = new Set(CLAIM_SITES.map((site) => site.path))
    // 这两条是**结构性下界**，不是「等于某个写死的数」：
    // 少于这两条说明有人把 claim site 删空了（而实测此刻是 9 site / 7 文件）
    expect(CLAIM_SITES.length, 'claim site 太少——文案覆盖面被削了').toBeGreaterThanOrEqual(7)
    expect(paths.size, '覆盖的文件太少——文案覆盖面被削了').toBeGreaterThanOrEqual(5)
    // 每个 site 的锚点必须**真的**在它声明的文件里（防「声明了但锚点写错 → 恒红或静默」）
    const files = realFiles()
    for (const site of CLAIM_SITES) {
      const text = files.get(site.path)
      expect(text, `${site.name}：${site.path} 没被读进来`).toBeDefined()
      expect(text?.includes(site.anchor), `${site.name}：锚点不在 ${site.path} 里`).toBe(true)
    }
  })

  /*
   * A4 的**直接**防护：光靠「真实文本通过」是不够的——真实文本只覆盖**当前**那种措辞，
   * 而 A4 说的是「把措辞改得**更准**会被误判成红」。所以这里直接对那条正则做单元测试，
   * 把「更准的写法」与「凑数的写法」两种输入都钉住。
   */
  it('「不受…门控」的正则容得下更准的措辞，但挡住跨句凑数（A4）', () => {
    const site = CLAIM_SITES.find((entry) => entry.name === 'docker agent 公告（DOCKER_GUIDANCE）')
    expect(site, '找不到公告那条 claim site').toBeDefined()
    const gate = site?.must.find((pattern) => pattern.source.includes('门控'))
    expect(gate, '公告那条里找不到「门控」判据').toBeDefined()
    const matches = (text: string): boolean => new RegExp(gate?.source ?? 'x').test(text)
    // 应当命中：不论措辞长短，只要在同句里点明「不受谁的门控」
    expect(matches('不受它门控'), '旧措辞必须仍命中').toBe(true)
    expect(matches('不受 `allowExec` 门控'), '**更准的措辞必须命中**（A4：这条曾经误红）').toBe(true)
    expect(matches('不受 docker 的 allowExec 开关门控'), '更长的同句写法也要命中').toBe(true)
    // 应当不命中：跨句凑数（另起一句里出现「门控」不能算数）
    expect(matches('不受影响。这句话里另有门控二字。'), '跨句凑数必须被挡住').toBe(false)
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
    /*
     * 针从真实文本里**现取**（B2 之后又踩了一次：措辞一改，写死的 fixture 就以
     * 「fixture 替换没匹配上」的形式炸掉——报的是反例自己的错，不是被测物的错）。
     * 这里取「**一次性** docker exec（…）」整段括号内容，退回成裸的 `docker exec`。
     */
    const current = read(DOCKER_SRC)
    const needle = /\*\*一次性\*\* docker exec（[^）]*）/.exec(current)?.[0]
    expect(needle, '公告里找不到「**一次性** docker exec（…）」这段（判据要跟着改）').toBeDefined()
    const src = mutate(current, needle ?? '', 'docker exec')
    files.set(DOCKER_SRC, src)
    const violations = claimViolations(files)
    expect(violations.join('\n'), '退回笼统说法必须被抓住').toMatch(/退回|一次性|不受/)
  })

  it('公告删掉「不受…门控」那半句 → 红', () => {
    const files = realFiles()
    /*
     * 针**从真实文本里现取**，不写死措辞：写死的话，一旦有人把这句话改得更准
     * （本文件已经历过一次：「不受它门控」→「不受 `allowExec` 门控」），
     * 这个反例就会以「fixture 替换没匹配上」的形式炸掉——**报的是反例自己的错，
     * 而不是被测物的错**，读起来完全误导（A4 的第二次踩坑）。
     */
    const current = read(DOCKER_SRC)
    const needle = /不受[^。；;！\n]{0,24}门控/.exec(current)?.[0]
    expect(needle, '公告里找不到「不受…门控」这句（判据要跟着改）').toBeDefined()
    const src = mutate(current, needle ?? '', '')
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
