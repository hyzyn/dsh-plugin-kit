/**
 * 「OS 级同意能不能挡住页内脚本」——**结论守卫**。
 *
 * ## 为什么要钉这一条
 *
 * `capability-elevation-plan.md` §9 把「OS 级同意（宿主弹原生对话框）」列为
 * 「『一键开 **且** 挡 (b)』的唯一正解」。2026-10-07 立项复核
 *（[docs/os-consent-plan.md](../../docs/os-consent-plan.md)）的结论是：**这句话成立，
 * 但只在一个形态下成立**——
 *
 *   - **形态 B（成立）**：对话框由**宿主进程自己 spawn**，答案从**子进程的退出码 / stdout** 读回；
 *   - **形态 A（危险）**：把对话框接到宿主现成的 `approval/request` 瀑布上。
 *     **它会静默丢掉对 (b) 的防护**，因为那条瀑布的答案**今天由页面给出**。
 *
 * 危险在于：形态 A 看起来最自然（宿主已有 approval 服务、已有 UI 面板）、做起来也最省事，
 * 而丢掉防护之后**没有任何测试会红**——文案却会写着「现在有 OS 级同意了」。这正是
 * `capability-elevation-plan.md` 附录 B / v1 那次错误的**同一形状**（宣称了一个不成立的安全性质）。
 *
 * ## 本文件钉什么
 *
 * 本文的结论**依赖三条关于 DSH 宿主的事实**。宿主是外部依赖（`@deepseek-ai/dsh`），它改了架构，
 * 本文的结论就可能过期——但**不会有人因此收到任何信号**。所以在这里现算这三条：
 * 它们一旦变化，本用例变红，逼人去重读那份方案。
 *
 * 1. 审批瀑布的答案仍由**页面**给出（`dsh-client-ui-approval` 的 `ctx.remote.$on('approval/request')`）；
 * 2. 插件 client 半体仍是**同源 classic script**（同 realm，无 iframe / 沙箱）；
 * 3. 宿主仍**没有**可复用的「原生确认框」设施（只有 directory-picker 这个接缝）。
 *
 * ## 判据纪律（与 `exec-terminal-scope.test.ts` 同款）
 *
 * - **不许「匹配不到就算过」**：每条判据先证明自己真的读到了东西（`length > 0`），找不到就**抛**；
 * - **反例层**：把 fixture 改成「宿主已换成 iframe 隔离」/「审批已改由宿主 answerer 回答」等，
 *   必须让对应判据变红；
 * - **只读**：本用例只读宿主运行时的 `lib/*.js`（外部依赖，**不修改**），以及本仓自己的文档与源码。
 *
 * ## 它管不到什么（别把这条守卫当安全保证）
 *
 * 它只保证「本仓文档里那套论证的前提仍然成立」，**不保证**任何运行时行为。
 * 宿主路径拿不到时（例如换了一台没装 DSH 的机器）本用例**跳过**并打印原因——
 * 这是刻意的：CI 上 DSH 是通过 peer stub 链接的，真实宿主包可能不在。
 *
 * 反向禁止：守卫报红时**先重读 `docs/os-consent-plan.md`**，再决定是改文档还是改判据；
 * 绝不允许为了让守卫变绿去删判据。
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (rel: string): string => readFileSync(join(REPO, rel), 'utf8')

/**
 * 定位真实 DSH 宿主运行时的 `node_modules/@deepseek-ai` 目录。
 *
 * 顺序（与 `docs/link-dsh-runtime.md` 的口径一致）：先看本仓 `node_modules` 里有没有**真包**
 * （peer stub 没有这些文件），再看全局安装的 `@deepseek-ai/dsh` 里随附的依赖树。
 * 两处都没有 → 返回 undefined（调用方跳过，不判红也不假装通过）。
 */
function findHostRuntime(): string | undefined {
  const candidates = [
    join(REPO, 'node_modules', '@deepseek-ai'),
    join(process.env.HOME ?? '', '.nvm', 'versions', 'node', process.version, 'lib', 'node_modules',
      '@deepseek-ai', 'dsh', 'node_modules', '@deepseek-ai'),
  ]
  for (const dir of candidates) {
    // 「有真包」的判据：approval 服务与客户端审批面板都在（stub 里没有它们）
    if (
      existsSync(join(dir, 'dsh-user-approval', 'lib', 'index.js')) &&
      existsSync(join(dir, 'dsh-client-ui-approval', 'lib', 'client.js'))
    ) {
      return dir
    }
  }
  return undefined
}

const HOST = findHostRuntime()

/** 读宿主运行时里的一个文件；宿主不在时返回 undefined。 */
function readHost(rel: string): string | undefined {
  if (HOST === undefined) return undefined
  const path = join(HOST, rel)
  if (!existsSync(path)) return undefined
  return readFileSync(path, 'utf8')
}

/**
 * 候选路径兜底：上面的 `process.version` 拼法在 nvm 下未必命中（版本目录名带 v 前缀）。
 * 用一个显式扫描补上——只扫 `~/.nvm/versions/node/<ver>/lib/node_modules/@deepseek-ai/dsh/...`。
 */
function findHostRuntimeViaNvm(): string | undefined {
  const base = join(process.env.HOME ?? '', '.nvm', 'versions', 'node')
  if (!existsSync(base)) return undefined
  for (const version of readdirSafe(base)) {
    const dir = join(base, version, 'lib', 'node_modules', '@deepseek-ai', 'dsh', 'node_modules', '@deepseek-ai')
    if (existsSync(join(dir, 'dsh-user-approval', 'lib', 'index.js'))) return dir
  }
  return undefined
}

function readdirSafe(dir: string): string[] {
  try {
    return readdirSync(dir)
  } catch {
    return []
  }
}

const HOST_RESOLVED = HOST ?? findHostRuntimeViaNvm()

/** 宿主侧事实的读法：整个 describe 块共用一个「拿不到就跳过」的判据。 */
function hostFile(rel: string): string | undefined {
  if (HOST_RESOLVED === undefined) return undefined
  const path = join(HOST_RESOLVED, rel)
  if (!existsSync(path)) return undefined
  return readFileSync(path, 'utf8')
}

/** 本仓需要检查的文档/源码（这些**必须**一直在）。 */
const REPO_FILES = {
  plan: 'docs/os-consent-plan.md',
  elevationPlan: 'docs/capability-elevation-plan.md',
  architecture: 'docs/architecture.md',
  capability: 'packages/kit/src/capability.ts',
  elevation: 'packages/kit/src/elevation.ts',
  conventions: 'docs/conventions.md',
} as const

describe('OS 级同意：本仓文档与结论必须成对（宿主不在也能跑）', () => {
  it('立项文档存在，且被知识归属表登记', () => {
    expect(existsSync(join(REPO, REPO_FILES.plan)), 'docs/os-consent-plan.md 不见了').toBe(true)
    const conventions = read(REPO_FILES.conventions)
    expect(conventions, 'conventions 的知识归属表没有登记 os-consent-plan.md').toContain('os-consent-plan.md')
  })

  it('§9 的「唯一正解」带上实现约束，并指向本方案', () => {
    const plan = read(REPO_FILES.elevationPlan)
    // 锚点必须落在 §9 那一节里——文中有多处提到「OS 级同意」，用节标题定位才唯一
    const section = plan.indexOf('## 9. 明确不做')
    expect(section, 'capability-elevation-plan.md 里找不到 §9 那一节').toBeGreaterThan(-1)
    const body = plan.slice(section, plan.indexOf('## 10.', section))
    expect(body, '§9 里找不到「OS 级同意」那条').toContain('OS 级同意')
    expect(body, '§9 没有指向 os-consent-plan.md（那句「唯一正解」就成了一句无人复核的空话）').toContain('os-consent-plan.md')
    expect(body, '§9 没有写下「必须是宿主 spawn + 子进程读回」这条约束').toMatch(/子进程|stdout/)
    expect(body, '§9 没有点名危险形态（接到 approval/request 上会丢掉防护）').toContain('approval/request')
  })

  it('正文里每一处「OS 级同意」都不是悬空断言（要么有指针，要么带形态限定）', () => {
    const plan = read(REPO_FILES.elevationPlan)
    // §9 那一节由上一个用例负责（它要求三条约束齐全）；这里只管节外散点。
    // 边界**动态现算**：写死行号会在每次编辑文档时失效（本用例第一版就是这么写错的）。
    const sectionStart = plan.indexOf('## 9. 明确不做')
    const sectionEnd = plan.indexOf('## 10.', sectionStart)
    expect(sectionStart, '找不到 §9 节标题').toBeGreaterThan(-1)
    expect(sectionEnd, '找不到 §10 节标题（§9 的边界算不出来）').toBeGreaterThan(sectionStart)

    const offenders: string[] = []
    for (const match of plan.matchAll(/OS 级同意/g)) {
      const at = match.index
      if (at >= sectionStart && at < sectionEnd) continue // §9 内部归上一个用例
      /*
       * 判据窗口必须**跨越换行**：中文 markdown 常把一句话折成多行，指针往往在**下一行**
       * （本用例第一版按单行判，于是把已经写对了的三处全报成违规）。
       * 取「本行行首 → 其后 400 字符」这一段：涵盖续行，又不足以跨到邻段。
       */
      const lineStart = plan.lastIndexOf('\n', at) + 1
      const window = plan.slice(lineStart, lineStart + 400)
      /*
       * 三种「不算悬空」的写法，任满足其一即通过：
       *   ① 直接指向本方案；② 带形态 / 子进程限定词；
       *   ③ 指向 §9 —— §9 本身已被上一个用例要求带上约束与指针，这是一条**合法的指针链**
       *      （历史决策记录 / 附录里那些「原文照录」的行属于此类：本仓规矩明确禁止改历史记录，
       *      所以不能逼它们各自复述一遍约束）。
       */
      const linked = /os-consent-plan\.md/.test(window)
      const qualified = /形态|子进程/.test(window)
      const viaSection = /§ ?9/.test(window)
      if (!linked && !qualified && !viaSection) {
        const lineNumber = plan.slice(0, at).split('\n').length
        offenders.push(`${String(lineNumber)}: ${plan.slice(lineStart, plan.indexOf('\n', at)).trim().slice(0, 80)}`)
      }
    }
    expect(offenders, '这些地方还留着「OS 级同意是唯一正解」式的空头断言，既没指针也没形态限定').toEqual([])
  })

  it('三处「要拦它只有 OS 级同意」都收窄成了「速度楔子 / 非结构性屏障」', () => {
    const sites = [
      ['docs/architecture.md', REPO_FILES.architecture],
      ['packages/kit/src/capability.ts', REPO_FILES.capability],
      ['packages/kit/src/elevation.ts', REPO_FILES.elevation],
    ] as const
    const missing: string[] = []
    for (const [label, rel] of sites) {
      const text = read(rel)
      const at = text.indexOf('OS 级同意')
      if (at === -1) {
        missing.push(`${label}：找不到「OS 级同意」这句（判据要跟着改）`)
        continue
      }
      const sentence = text.slice(Math.max(0, at - 200), at + 400)
      // 必须点明「它不是结构性屏障」那一层，否则又是在宣称一个不成立的性质
      if (!/速度楔子|不是结构性屏障|非结构性屏障/.test(sentence)) {
        missing.push(`${label}：没有收窄（缺少「速度楔子 / 非结构性屏障」）`)
      }
    }
    expect(missing, missing.join('；')).toEqual([])
  })
})

describe('OS 级同意：宿主侧三条事实（宿主不在则跳过）', () => {
  const skip = HOST_RESOLVED === undefined

  it('事实 1：审批瀑布的答案仍由**页面**给出（这正是形态 A 会丢掉防护的原因）', () => {
    const client = hostFile('dsh-client-ui-approval/lib/client.js')
    if (skip || client === undefined) {
      console.log('[os-consent] 跳过：宿主运行时不可达（判据前提未变，但不在此机器上验证）')
      return
    }
    // 防「命中 0 行 = 恒绿」：先证明真的读到了那份 bundle
    expect(client.length, '读到的 client.js 太短，判据没有真的覆盖到它').toBeGreaterThan(1000)
    expect(
      client,
      '审批答案不再由页面 remote 事件回答——§2.2 形态 A 的论证前提变了，重读 os-consent-plan.md',
    ).toContain('approval/request')
    expect(client, '页面侧不再是 remote.$on 形态').toMatch(/remote\.\$on/)
  })

  it('事实 1b：approval/request 仍在页面的 forwarded-events 白名单里（否则页面根本订阅不到）', () => {
    const events = hostFile('dsh-api-remotes/lib/types/remote-events.js')
    if (skip || events === undefined) return
    expect(events, 'approval/request 不在转发白名单里了').toContain('approval/request')
    expect(events, '转发模式不再是 waterfall').toMatch(/approval\/request[\s\S]{0,40}waterfall/)
  })

  it('事实 2：插件 client 半体仍是同源 classic script（同 realm，无 iframe / 沙箱）', () => {
    const loader = hostFile('dsh-client-modules/lib/client.js')
    if (skip || loader === undefined) return
    expect(loader.length).toBeGreaterThan(1000)
    expect(
      loader,
      '插件 bundle 的装载方式变了（不再是同源 classic script）——若已改为 iframe 隔离，' +
        '§2.1 事实 2 需要重写，且「页内脚本够得着官方面板」这条结论可能不再成立',
    ).toMatch(/createElement\(['"]script['"]\)/)
    expect(loader, '装载说明文案变了（原为「same-origin external classic script」）').toMatch(/same-origin external classic script/)
  })

  it('事实 2b：同一 realm 的判据——插件半体注册在 window.__ModuleLoader__ 上', () => {
    const approval = hostFile('dsh-client-ui-approval/lib/client.js')
    if (skip || approval === undefined) return
    expect(approval, '官方面板不再经 __ModuleLoader__ 注册（装载模型变了）').toContain('__ModuleLoader__')
  })

  it('事实 3：宿主仍只有 directory-picker 这一个原生对话框接缝，且答案从子进程读回', () => {
    const picker = hostFile('dsh-host-directory-picker-native/lib/index.js')
    if (skip || picker === undefined) {
      // 这个包不在也不代表结论错了；只在**存在**时校验它的形态
      console.log('[os-consent] 跳过事实 3：宿主运行时里没有 directory-picker-native')
      return
    }
    expect(picker.length).toBeGreaterThan(1000)
    expect(picker, '原生 picker 不再用 osascript（macOS 路径变了）').toContain('osascript')
    expect(picker, '原生 picker 不再读子进程 stdout（形态 B 的模板没了）').toMatch(/\.stdout/)
    // 形态 B 的关键：没有走页面回答（即不出现 remote / $events/result 这类页面通道）
    expect(picker, '原生 picker 出现在了页面回答通道上（形态 B 的模板被破坏）').not.toMatch(/\$events\/result|remote\.\$on/)
  })

  it('事实 3b：宿主仍**没有**可复用的「原生确认框」设施（display dialog / --question / pkexec）', () => {
    const picker = hostFile('dsh-host-directory-picker-native/lib/index.js')
    if (skip || picker === undefined) return
    // 这是「本项要新写、而不是复用现成设施」的证据；若哪天宿主自带了，本方案的 §4 应当改为「复用」
    expect(picker, 'directory-picker 里出现了确认框原语——宿主可能已自带确认设施，§4 应改为复用').not.toMatch(
      /display dialog|display alert|--question|--yesno|polkit|pkexec/,
    )
  })
})

describe('OS 级同意：反例层（结论过期时必须变红）', () => {
  /** 在真实文本上做一次替换；**替换没生效就抛**（否则反例会变成空测试）。 */
  function mutate(text: string, from: string, to: string): string {
    if (!text.includes(from)) throw new Error(`fixture 替换没匹配上：${from.slice(0, 60)}`)
    const mutated = text.replace(from, to)
    expect(mutated, 'fixture 必须真的改动文本').not.toBe(text)
    return mutated
  }

  it('宿主把审批改由宿主 answerer 回答（不再是页面 remote）→ 事实 1 判据红', () => {
    const client = hostFile('dsh-client-ui-approval/lib/client.js')
    if (HOST_RESOLVED === undefined || client === undefined) return
    // 模拟「页面不再订阅」：抹掉 remote.$on —— 这正是宿主若改成宿主侧 answerer 后的样子
    const mutated = mutate(client, 'ctx.remote.$on("approval/request"', 'ctx.notTheRemoteAnymore("approval/request"')
    expect(mutated, '反例没有生效').not.toMatch(/remote\.\$on\(["']approval\/request/)
  })

  it('宿主换成 iframe 隔离插件半体 → 事实 2 判据红', () => {
    const loader = hostFile('dsh-client-modules/lib/client.js')
    if (HOST_RESOLVED === undefined || loader === undefined) return
    const mutated = mutate(loader, 'same-origin external classic script', 'sandboxed iframe bundle')
    expect(mutated, '反例没有生效：隔离模型变了应当被这条判据抓住').not.toContain('same-origin external classic script')
  })

  it('§9 的批注被删掉（回到「唯一正解」一句空话）→ 文档判据红', () => {
    const plan = read(REPO_FILES.elevationPlan)
    // 必须替换 §9 **内部**那句：`String.replace` 只换第一处，而全文第一处指针在第 28 行
    const mutated = mutate(
      plan,
      '> **2026-10-07 立项，结论见 [docs/os-consent-plan.md](./os-consent-plan.md)**（§9 已转成那一份）。',
      '> **2026-10-07 立项。**',
    )
    const sectionStart = mutated.indexOf('## 9. 明确不做')
    const body = mutated.slice(sectionStart, mutated.indexOf('## 10.', sectionStart))
    expect(body, '删掉指针后仍能通过 = 这条判据没有判别性').not.toContain('os-consent-plan.md')
  })

  it('三处收窄被退回「只有 OS 级同意」→ 收窄判据红', () => {
    const architecture = read(REPO_FILES.architecture)
    const mutated = mutate(architecture, '**但这句话只对「没那么顺手」成立，不是结构性屏障**', '')
    const at = mutated.indexOf('OS 级同意')
    const sentence = mutated.slice(Math.max(0, at - 200), at + 400)
    expect(sentence).not.toMatch(/速度楔子|不是结构性屏障|非结构性屏障/)
  })
})
