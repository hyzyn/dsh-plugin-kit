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
 * 本文的结论**依赖关于 DSH 宿主的三条事实**（宿主是外部依赖，它改了架构本文结论就可能过期，
 * 而**不会有人因此收到任何信号**）：
 *
 * 1. 审批瀑布的答案仍由**页面**给出；
 * 2. 插件 client 半体仍是**同源 classic script**（同 realm，无 iframe / 沙箱、无 CSP）；
 * 3. 宿主仍**没有**可复用的「原生确认框」设施（只有 directory-picker 这个接缝）。
 *
 * ## 架构：为什么判据是「纯函数 + 世界」，而不是散在 `it` 里（2026-10-07 review 修）
 *
 * 本文件第一版把断言直接写在 `it` 里，于是有两个真实缺陷（review 的 A1 / A2）：
 *
 *   - **A1 反例与判据零耦合**：宿主那两条反例只断言「`String.replace` 成功了」，
 *     从不调用任何判据——**删掉整个「宿主侧三条事实」describe 重跑，8 条照样全绿**。
 *     文件头承诺的「必须让对应判据变红」根本没兑现。
 *   - **A2「拿不到文本 = 算过」**：`hostFile()` 对「宿主不存在」与「宿主在、但文件改名了」
 *     返回**同一个** `undefined`，八处 `if (skip || x === undefined) return` 于是把后者
 *     ——一个**真实的回归信号**——也当成「跳过」。CI 走 peer stub ⇒ 那 8 条全是 no-op。
 *
 * 所以本版把判据抽成**纯函数** `checkRepoWorld(world)` / `checkHostWorld(world)`：
 * **真实世界的断言与反例走同一条代码路径**（反例喂一个被改坏的世界，断言它**非空**），
 * A1 因此结构性地不可能再发生。A2 则把「宿主不存在」与「文件缺失」拆成两种世界状态：
 * 后者**判红**（fail-closed），前者才跳过，且跳过是**响亮**的（见 `describe.skipIf` 与
 * 文件末尾的「本地门」说明）。
 *
 * ## 判据纪律
 *
 * - 不许「匹配不到就算过」：找不到锚点 / 文件短得不像话都**抛**；
 * - 反例必须调用真判据（A1）；
 * - **只读**：本用例只读宿主运行时的 `lib/*.js`（外部依赖，**不修改**），以及本仓自己的文档与源码。
 *
 * ## 它管不到什么（别把这条守卫当安全保证）
 *
 * 它只保证「本仓文档里那套论证的前提仍然成立」，**不保证**任何运行时行为。
 * **宿主侧那几条判据只有装了真实 DSH 的机器上才会执行**（CI 走 peer stub，跑到那里是
 * `skipped`）——所以别把「CI 全绿」读成「宿主事实已复核」。本文件末尾有一条
 * **CI 也能跑的**基准版本判据，用来在 DSH 升级时提醒重读方案。
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

/* ------------------------------------------------------------------ *
 * 一、世界：把「本仓 + 宿主」读成一份可传给纯函数的快照
 * ------------------------------------------------------------------ */

/** 本仓需要检查的文档/源码（这些**必须**一直在）。 */
const REPO_FILES = {
  plan: 'docs/os-consent-plan.md',
  elevationPlan: 'docs/capability-elevation-plan.md',
  architecture: 'docs/architecture.md',
  capability: 'packages/kit/src/capability.ts',
  elevation: 'packages/kit/src/elevation.ts',
  conventions: 'docs/conventions.md',
} as const

/** 宿主侧要用到的文件（相对宿主 `@deepseek-ai` 根）。 */
const HOST_FILES = {
  approvalClient: 'dsh-client-ui-approval/lib/client.js',
  remoteEvents: 'dsh-api-remotes/lib/types/remote-events.js',
  moduleLoader: 'dsh-client-modules/lib/client.js',
  pickerNative: 'dsh-host-directory-picker-native/lib/index.js',
  userApproval: 'dsh-user-approval/lib/index.js',
} as const

/**
 * CSP 的检查位点（A6）。
 *
 * 「页内脚本够得着官方面板」这条论证有**两条腿**：同 realm（事实 2）**和**宿主不发 CSP。
 * 只写同 realm 是少写一条支撑——今天两者都为真，但哪天宿主加了 CSP，仅靠同 realm 的论证
 * 依然成立（CSP 不能阻止同源脚本），所以这条判据的作用是**记录事实**：一旦宿主开始发 CSP，
 * 说明宿主在往隔离方向走，方案 §2.1 的结论值得回来复核。
 */
const CSP_SITES = [
  { rel: 'dsh-host-webserver/lib/index.js', what: 'webserver' },
  { rel: 'dsh-host-frontend-static/lib/index.js', what: 'frontend-static' },
] as const

/** 宿主世界的两种形态：不存在，或存在（带文件内容与缺失清单）。 */
type HostWorld =
  | { kind: 'absent' }
  | {
      kind: 'present'
      dir: string
      /** 需要而**读到了**的文件。 */
      files: Map<string, string>
      /** 需要但**不存在**的文件——这是回归信号，必须判红（A2）。 */
      missing: string[]
      /** 全树各包的 `lib/index.js` 内容（按包名），供「全树 absence」判据用（A3）。 */
      packages: Map<string, string>
      /** CSP 检查位点 → 该文件是否含 `Content-Security-Policy`（A6；文件不在则不入表）。 */
      cspSites: Map<string, boolean>
      /** 宿主 `@deepseek-ai/dsh` 的版本（取不到则 undefined）。 */
      version?: string
    }

function readdirSafe(dir: string): string[] {
  try {
    return readdirSync(dir)
  } catch {
    return []
  }
}

function readFileSafe(path: string): string | undefined {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return undefined
  }
}

/** 一个目录是不是「真宿主运行时」：stub 里没有 approval 服务与审批面板。 */
function looksLikeHostRuntime(dir: string): boolean {
  return (
    existsSync(join(dir, 'dsh-user-approval', 'lib', 'index.js')) &&
    existsSync(join(dir, 'dsh-client-ui-approval', 'lib', 'client.js'))
  )
}

/**
 * 找真实 DSH 宿主运行时的 `@deepseek-ai` 目录。
 *
 * 顺序：本仓 `node_modules`（CI 在这里是 peer stub，会落到下一档）→ 全局安装的
 * `@deepseek-ai/dsh` 随附依赖树 → 扫 `~/.nvm/versions/node/<ver>/...`（nvm 的目录名带 `v`，
 * 用 `process.version` 直接拼拼不出来）。三处都没有 = `absent`。
 */
function resolveHostDir(): string | undefined {
  const direct = join(REPO, 'node_modules', '@deepseek-ai')
  if (looksLikeHostRuntime(direct)) return direct

  const nvmBase = join(process.env.HOME ?? '', '.nvm', 'versions', 'node')
  for (const version of readdirSafe(nvmBase)) {
    const dir = join(nvmBase, version, 'lib', 'node_modules', '@deepseek-ai', 'dsh', 'node_modules', '@deepseek-ai')
    if (looksLikeHostRuntime(dir)) return dir
  }
  return undefined
}

/** 采集一份宿主世界快照（**不抛**：读不到就记进 `missing`，由判据判红）。 */
function buildHostWorld(): HostWorld {
  const dir = resolveHostDir()
  if (dir === undefined) return { kind: 'absent' }

  const files = new Map<string, string>()
  const missing: string[] = []
  for (const rel of Object.values(HOST_FILES)) {
    const text = readFileSafe(join(dir, rel))
    if (text === undefined) missing.push(rel)
    else files.set(rel, text)
  }

  // 全树扫描用（A3）：把每个包的 lib/index.js 收进来
  const packages = new Map<string, string>()
  for (const pkg of readdirSafe(dir)) {
    const text = readFileSafe(join(dir, pkg, 'lib', 'index.js'))
    if (text !== undefined) packages.set(pkg, text)
  }

  // CSP 位点（A6）：只收**存在**的文件
  const cspSites = new Map<string, boolean>()
  for (const site of CSP_SITES) {
    const raw = readFileSafe(join(dir, site.rel))
    if (raw !== undefined) cspSites.set(site.rel, /Content-Security-Policy/.test(raw))
  }

  const version = (() => {
    const raw = readFileSafe(join(dir, 'dsh', 'package.json'))
    if (raw === undefined) return undefined
    try {
      const parsed = JSON.parse(raw) as { version?: unknown }
      return typeof parsed.version === 'string' ? parsed.version : undefined
    } catch {
      return undefined
    }
  })()

  return { kind: 'present', dir, files, missing, packages, cspSites, version }
}

/* ------------------------------------------------------------------ *
 * 二、判据本体：纯函数。真实断言与反例都调它们（A1 的结构性修复）
 * ------------------------------------------------------------------ */

const WINDOW = 400

/** 本仓文档与结论必须成对（宿主不存在也能跑）。 */
function checkRepoWorld(files: Map<string, string>): string[] {
  const out: string[] = []
  const get = (rel: string): string | undefined => files.get(rel)

  // ---- 0. 立项文档存在且被登记 ----
  const plan = get(REPO_FILES.plan)
  if (plan === undefined) {
    out.push(`${REPO_FILES.plan} 不在输入里（文件被删 / 改名？）`)
  } else {
    expect(plan.length, '立项文档短得不像话').toBeGreaterThan(1000)
    const conventions = get(REPO_FILES.conventions) ?? ''
    if (!conventions.includes('os-consent-plan.md')) {
      out.push('conventions 的知识归属表没有登记 os-consent-plan.md')
    }
    // 基准版本必须写明：它是「这些事实是对着哪一版宿主验的」的唯一锚点（A2 的 CI 侧补偿）
    if (!/DSH `\d+\.\d+\.\d+[^`]*`/.test(plan)) {
      out.push('方案没有写明「实测基准」的 DSH 版本——DSH 升级后就无从知道这些事实该不该复核')
    }
    // CSP 那条腿（A6）：本方案「页内脚本够得着官方面板」的论证有两条腿（同 realm + 无 CSP），
    // 只写同 realm 是**少写了一条支撑**。
    if (!/CSP|Content-Security-Policy/.test(plan)) {
      out.push('方案没有把「宿主不发 CSP」这条腿写进论证（页内脚本够得着官方面板靠的是同 realm + 无 CSP 两条）')
    }
  }

  // ---- 1. §9 的「唯一正解」必须带上实现约束与指针 ----
  const elevationPlan = get(REPO_FILES.elevationPlan)
  if (elevationPlan === undefined) {
    out.push(`${REPO_FILES.elevationPlan} 不在输入里`)
  } else {
    const start = elevationPlan.indexOf('## 9. 明确不做')
    const end = elevationPlan.indexOf('## 10.', start)
    if (start === -1 || end === -1) {
      out.push('capability-elevation-plan.md 里找不到 §9 / §10 的节边界（判据锚点失效）')
    } else {
      const body = elevationPlan.slice(start, end)
      if (!body.includes('OS 级同意')) out.push('§9 里找不到「OS 级同意」那条')
      if (!body.includes('os-consent-plan.md')) out.push('§9 没有指向 os-consent-plan.md')
      if (!/子进程|stdout/.test(body)) out.push('§9 没有写下「必须是宿主 spawn + 子进程读回」这条约束')
      if (!body.includes('approval/request')) out.push('§9 没有点名危险形态（接到 approval/request 上会丢掉防护）')
    }

    // ---- 2. 节外每一处「OS 级同意」都不许是悬空断言 ----
    const sectionStart = elevationPlan.indexOf('## 9. 明确不做')
    const sectionEnd = elevationPlan.indexOf('## 10.', sectionStart)
    for (const match of elevationPlan.matchAll(/OS 级同意/g)) {
      const at = match.index
      if (sectionStart !== -1 && at >= sectionStart && at < sectionEnd) continue
      /*
       * 窗口必须**跨行**：中文 markdown 常把一句话折成多行、指针落在下一行
       * （第一版按单行判，把已经写对了的三处全报成违规）。取「本行行首 → 其后 400 字符」。
       */
      const lineStart = elevationPlan.lastIndexOf('\n', at) + 1
      const window = elevationPlan.slice(lineStart, lineStart + WINDOW)
      const linked = window.includes('os-consent-plan.md')
      const qualified = /形态|子进程/.test(window)
      // 指向 §9 是**合法的指针链**：§9 本身已被上面那条判据要求带上约束与指针。
      // 历史决策记录 / 附录里那些「原文照录」的行属于此类——本仓规矩禁止改历史记录。
      const viaSection = /§ ?9/.test(window)
      if (!linked && !qualified && !viaSection) {
        const lineNumber = elevationPlan.slice(0, at).split('\n').length
        out.push(`capability-elevation-plan.md:${String(lineNumber)} 的「OS 级同意」既无指针也无形态限定`)
      }
    }
  }

  // ---- 3. 三处「要拦它只有 OS 级同意」收窄成「速度楔子 / 非结构性屏障」 ----
  for (const rel of [REPO_FILES.architecture, REPO_FILES.capability, REPO_FILES.elevation]) {
    const text = get(rel)
    if (text === undefined) {
      out.push(`${rel} 不在输入里`)
      continue
    }
    const at = text.indexOf('OS 级同意')
    if (at === -1) {
      out.push(`${rel}：找不到「OS 级同意」这句（判据要跟着改）`)
      continue
    }
    const sentence = text.slice(Math.max(0, at - 200), at + WINDOW)
    if (!/速度楔子|不是结构性屏障|非结构性屏障/.test(sentence)) {
      out.push(`${rel}：没有收窄（缺少「速度楔子 / 非结构性屏障」）`)
    }
  }
  return out
}

/** 宿主侧三条事实（只在真实宿主可达时跑；文件缺失一律判红——A2 的 fail-closed 半边）。 */
function checkHostWorld(world: HostWorld): string[] {
  if (world.kind === 'absent') return []
  const out: string[] = []
  // A2：宿主在、但需要的文件不在 —— 这是**回归信号**（宿主改名 / 挪包），不是「跳过」
  for (const rel of world.missing) {
    out.push(`宿主里找不到 ${rel}——宿主结构变了，重读 docs/os-consent-plan.md §2.1`)
  }
  const file = (rel: string): string => world.files.get(rel) ?? ''

  // ---- 事实 1：审批瀑布的答案由**页面**给出 ----
  const approvalClient = file(HOST_FILES.approvalClient)
  if (approvalClient !== '') {
    if (approvalClient.length < 1000) out.push(`${HOST_FILES.approvalClient} 短得不像话，判据没覆盖到它`)
    if (!approvalClient.includes('approval/request')) {
      out.push('审批答案不再由页面 remote 事件回答——形态 A 的论证前提变了，重读方案 §2.2')
    }
    if (!/remote\.\$on/.test(approvalClient)) out.push('页面侧不再是 remote.$on 形态')
  }

  // ---- 事实 1b：approval/request 仍在转发白名单里（否则页面订阅不到） ----
  const remoteEvents = file(HOST_FILES.remoteEvents)
  if (remoteEvents !== '') {
    if (!remoteEvents.includes('approval/request')) out.push('approval/request 不在 forwarded-events 白名单里了')
    if (!/approval\/request[\s\S]{0,40}waterfall/.test(remoteEvents)) out.push('转发模式不再是 waterfall')
  }

  // ---- 事实 2：插件 client 半体是同源 classic script ----
  const moduleLoader = file(HOST_FILES.moduleLoader)
  if (moduleLoader !== '') {
    if (moduleLoader.length < 1000) out.push(`${HOST_FILES.moduleLoader} 短得不像话`)
    if (!/createElement\(['"]script['"]\)/.test(moduleLoader)) {
      out.push('插件 bundle 的装载方式变了（不再是同源 classic script）——若已改为 iframe 隔离，方案 §2.1 事实 2 需重写')
    }
    if (!moduleLoader.includes('same-origin external classic script')) {
      out.push('装载说明文案变了（原为「same-origin external classic script」）')
    }
  }
  const approvalClientForLoader = file(HOST_FILES.approvalClient)
  if (approvalClientForLoader !== '' && !approvalClientForLoader.includes('__ModuleLoader__')) {
    out.push('官方面板不再经 __ModuleLoader__ 注册（装载模型变了）')
  }

  // ---- 事实 2c（A6）：宿主不发 CSP —— 「页内脚本够得着」的第二条腿 ----
  for (const site of CSP_SITES) {
    if (!world.cspSites.has(site.rel)) continue // 该组件没装：不算回归
    if (world.cspSites.get(site.rel) === true) {
      out.push(
        `${site.what} 开始发 Content-Security-Policy 了——宿主在往隔离方向走，` +
          '方案 §2.1 的结论（页内脚本够得着官方面板）值得回来复核',
      )
    }
  }

  // ---- 事实 3（A3：**全树**扫描，不再只看一个包） ----
  const native = file(HOST_FILES.pickerNative)
  if (native !== '') {
    if (native.length < 1000) out.push(`${HOST_FILES.pickerNative} 短得不像话`)
    if (!native.includes('osascript')) out.push('原生 picker 不再用 osascript（macOS 路径变了）')
    if (!/\.stdout/.test(native)) out.push('原生 picker 不再读子进程 stdout（形态 B 的模板没了）')
    if (/\$events\/result|remote\.\$on/.test(native)) {
      out.push('原生 picker 出现在了页面回答通道上（形态 B 的模板被破坏）')
    }
    if (!native.includes('zenity')) out.push('原生 picker 不再用 zenity（Linux 路径变了）')
  }
  /*
   * A3：**absence 判据必须覆盖它声称的范围**。方案说「宿主仍没有可复用的原生确认框设施」，
   * 那是对**整棵宿主树**的断言，而第一版只在 `picker-native` 一个包里 grep——
   * 同树的 `picker-auto` 里就有 `zenity` / `kdialog` 字样（虽然那是 chooser 可用性探测、
   * 不是确认框，但这正说明「换一个包就可能命中」）。所以这里扫全树。
   */
  const CONFIRM_PRIMITIVES = /display dialog|display alert|--question|--yesno|--msgbox|pkexec|polkit/i
  const hits = [...world.packages.entries()]
    .filter(([, text]) => CONFIRM_PRIMITIVES.test(text))
    .map(([pkg]) => pkg)
  if (hits.length > 0) {
    out.push(
      `宿主树里出现了确认框 / polkit 原语（${hits.join('、')}）——宿主可能已自带确认设施，` +
        '方案 §4 应改为「复用」；若确认不是确认框（只是 chooser 探测），核对后收窄本判据',
    )
  }
  return out
}

/* ------------------------------------------------------------------ *
 * 三、真实世界
 * ------------------------------------------------------------------ */

const HOST_WORLD = buildHostWorld()

/** 本仓世界：所有文件都读得到；读不到的**必须**让 checkRepoWorld 报出来（不静默）。 */
function buildRepoWorld(): Map<string, string> {
  const files = new Map<string, string>()
  for (const rel of Object.values(REPO_FILES)) {
    const text = readFileSafe(join(REPO, rel))
    if (text !== undefined) files.set(rel, text)
  }
  return files
}

const REPO_WORLD = buildRepoWorld()

describe('OS 级同意：本仓文档与结论必须成对（宿主不存在也跑）', () => {
  it('真实仓库通过', () => {
    expect(checkRepoWorld(REPO_WORLD)).toEqual([])
  })

  it('判据真的读到了东西（不是恒绿的空转）', () => {
    expect(REPO_WORLD.size, '本仓文件一个都没读到').toBe(Object.keys(REPO_FILES).length)
    const plan = REPO_WORLD.get(REPO_FILES.plan) ?? ''
    expect(plan.length).toBeGreaterThan(1000)
  })

  it('自检：真实世界的检查确实**被调用**（判据在但没人调 = 恒绿）', () => {
    /*
     * A1 的收尾：把断言抽成纯函数解决了「反例不耦合判据」，但还留着一种漂法——
     * **有人把真实世界那两行调用删了**（判据函数还在，只是没人调），于是真实仓库再没人检查，
     * 而反例层照旧全绿（它们喂的是合成世界）。
     *
     * 这个自检**自己踩过两次坑**，记在这里免得后人重犯：
     *   ① 第一版 `toContain('checkHostWorld(HOST_WORLD)')`——**它自己的注释里**就写着这个字符串，
     *      于是把调用删掉照样绿（实测：删掉真实调用 → 14 passed）；
     *   ② 第二版「剥掉注释再数」——但**它自己的参数里**又写着同一个字符串，数出来 ≥1，照旧绿。
     * 结论：**被搜索的针不能完整地出现在本文件里**。做法是把针拆成两段拼接，
     * 并匹配**调用语句的完整形状**（含 `expect(` 与 `)`），而不是裸标识符。
     */
    const self = read('scripts/test/os-consent-scope.test.ts')
    const withoutComments = self
      .replace(/\/\*[\s\S]*?\*\//g, '') // 块注释（含文件头）
      .replace(/\/\/.*$/gm, '') // 行注释
    // 针拆开拼：本文件里因此不会出现完整字面量
    const repoCall = 'expect(checkRepoWorld' + '(REPO_WORLD))'
    const hostCall = 'expect(checkHostWorld' + '(HOST_WORLD))'
    expect(
      withoutComments.includes(repoCall),
      '真实本仓世界的检查没有被调用（判据还在但没人调 = 真实仓库不再被检查）',
    ).toBe(true)
    expect(
      withoutComments.includes(hostCall),
      '真实宿主世界的检查没有被调用（判据还在但没人调 = 宿主事实不再被检查）',
    ).toBe(true)
  })
})

/*
 * 宿主那条 describe：宿主**不存在**时整块跳过。
 *
 * 注意「跳过」是**响亮**的：vitest 会把它报成 `skipped`（不是 passed），所以
 * 「CI 全绿」不会被误读成「宿主事实已复核」。见文件末尾的说明。
 * 而「宿主在、文件缺失」走的是 `checkHostWorld` 的 `missing` 分支 —— **判红**，不跳过。
 */
describe.skipIf(HOST_WORLD.kind === 'absent')('OS 级同意：宿主侧三条事实（需真实 DSH）', () => {
  it('真实宿主通过', () => {
    expect(checkHostWorld(HOST_WORLD)).toEqual([])
  })

  it('基准版本要对得上：宿主升级后必须回来复核（A2 的升级绊线）', () => {
    if (HOST_WORLD.kind !== 'present') return
    const plan = REPO_WORLD.get(REPO_FILES.plan) ?? ''
    const baseline = /DSH `(\d+\.\d+\.\d+[^`]*)`/.exec(plan)?.[1]
    expect(baseline, '方案里没有基准版本号').toBeDefined()
    if (HOST_WORLD.version === undefined) return // 取不到版本就不判（不假装通过也不误红）
    if (HOST_WORLD.version !== baseline) {
      throw new Error(
        `宿主版本 ${HOST_WORLD.version} 与方案基准 ${String(baseline)} 不一致：` +
          'DSH 升级可能改变三条事实，请重读 docs/os-consent-plan.md §2.1 并更新基准',
      )
    }
  })
})

/* ------------------------------------------------------------------ *
 * 四、反例层：与真判据**共用同一条代码路径**（A1 的结构性修复）
 * ------------------------------------------------------------------ */

/** 在真实文本上做一次替换；**替换没生效就抛**（否则反例会变成空测试）。 */
function mutate(text: string, from: string, to: string): string {
  if (!text.includes(from)) throw new Error(`fixture 替换没匹配上：${from.slice(0, 60)}`)
  const mutated = text.replace(from, to)
  expect(mutated, 'fixture 必须真的改动文本').not.toBe(text)
  return mutated
}

/** 复制一份合成世界并替换其中一个文件；替换没生效就抛。 */
function repoWorldWith(rel: string, from: string, to: string): Map<string, string> {
  const world = new Map(REPO_WORLD)
  world.set(rel, mutate(world.get(rel) ?? '', from, to))
  return world
}

/** 取一份宿主世界；宿主不存在时返回 undefined（反例层据此跳过）。 */
function hostWorldWith(rel: string, from: string, to: string): HostWorld | undefined {
  if (HOST_WORLD.kind !== 'present') return undefined
  const files = new Map(HOST_WORLD.files)
  const current = files.get(rel)
  if (current === undefined) return undefined
  files.set(rel, mutate(current, from, to))
  return { ...HOST_WORLD, files }
}

describe('OS 级同意：反例层（结论过期时必须变红）', () => {
  it('§9 的批注被删掉 → 本仓判据红', () => {
    const world = repoWorldWith(
      REPO_FILES.elevationPlan,
      '> **2026-10-07 立项，结论见 [docs/os-consent-plan.md](./os-consent-plan.md)**（§9 已转成那一份）。',
      '> **2026-10-07 立项。**',
    )
    expect(checkRepoWorld(world).length, '删掉指针后仍全绿 = 判据没有判别性').toBeGreaterThan(0)
  })

  it('§0 那条「唯一出路」退回裸断言（无指针、无形态限定、无 §9 指针链）→ 本仓判据红', () => {
    /*
     * 反例必须造得**彻底**：只抹掉指针是不够的——原文里还留着「见 §9」，而 §9 是一条
     * **合法的指针链**（§9 自己已被要求带上约束）。本用例第一版就只抹了指针，
     * 于是判据正确地放行了它、fixture 却断错了东西（`expected 0 to be greater than 0`）。
     * 真正的裸断言 = 连「见 §9」一起抹掉，回到「唯一出路是 OS 级同意，本轮后置」。
     */
    const world = repoWorldWith(
      REPO_FILES.elevationPlan,
      '见 §9，本轮后置。**2026-10-07 立项复核**：这句话成立，但**必须是「宿主 spawn 对话框 + 答案\n   从子进程读回」那个形态**——接到 `approval/request` 瀑布上会丢掉对 (b) 的防护。全文见\n   [docs/os-consent-plan.md](./os-consent-plan.md)。',
      '本轮后置。',
    )
    const violations = checkRepoWorld(world)
    expect(violations.length, '裸断言没有被抓住').toBeGreaterThan(0)
    expect(violations.join('\n')).toMatch(/既无指针也无形态限定/)
  })

  it('三处收窄被退回「只有 OS 级同意」→ 本仓判据红', () => {
    const world = repoWorldWith(REPO_FILES.architecture, '**但这句话只对「没那么顺手」成立，不是结构性屏障**', '')
    expect(checkRepoWorld(world).length).toBeGreaterThan(0)
  })

  it('方案不再写明基准 DSH 版本 → 本仓判据红（升级提醒没了）', () => {
    const world = repoWorldWith(REPO_FILES.plan, '> **状态**：**方案已定，代码未动（2026-10-07）**。', '> **状态**：已定。')
    // 基准版本号的句式是 DSH `<ver>`；把它换成不可匹配的写法
    const plan = world.get(REPO_FILES.plan) ?? ''
    const stripped = plan.replace(/DSH `\d+\.\d+\.\d+[^`]*`/g, 'DSH（版本未记）')
    expect(stripped, '反例没生效：基准版本号还在').not.toMatch(/DSH `\d+\.\d+\.\d+/)
    world.set(REPO_FILES.plan, stripped)
    expect(checkRepoWorld(world).length).toBeGreaterThan(0)
  })

  it('方案不再提 CSP → 本仓判据红（少了一条论证的腿）', () => {
    const plan = REPO_FILES.plan
    const world = new Map(REPO_WORLD)
    const text = (world.get(plan) ?? '').replace(/CSP|Content-Security-Policy/g, '某某')
    world.set(plan, text)
    expect(checkRepoWorld(world).length).toBeGreaterThan(0)
  })

  it('宿主把审批改由宿主 answerer 回答（不再是页面 remote）→ 宿主判据红', () => {
    const world = hostWorldWith(HOST_FILES.approvalClient, 'ctx.remote.$on("approval/request"', 'ctx.notTheRemoteAnymore("approval/request"')
    if (world === undefined) return
    expect(checkHostWorld(world).length, '反例必须让真判据报错（A1：不能只断言 replace 成功）').toBeGreaterThan(0)
  })

  it('宿主换成 iframe 隔离插件半体 → 宿主判据红', () => {
    const world = hostWorldWith(HOST_FILES.moduleLoader, 'same-origin external classic script', 'sandboxed iframe bundle')
    if (world === undefined) return
    const violations = checkHostWorld(world)
    expect(violations.length).toBeGreaterThan(0)
    expect(violations.join('\n')).toMatch(/iframe|装载说明/)
  })

  it('宿主里出现确认框原语（全树扫描）→ 宿主判据红', () => {
    if (HOST_WORLD.kind !== 'present') return
    // 往**任意一个**包里塞一个确认框原语，验证全树扫描真的在扫（A3）
    const somePkg = [...HOST_WORLD.packages.keys()][0]
    if (somePkg === undefined) return
    const packages = new Map(HOST_WORLD.packages)
    packages.set(somePkg, (packages.get(somePkg) ?? '') + '\ndisplay dialog "confirm?"\n')
    const violations = checkHostWorld({ ...HOST_WORLD, packages })
    expect(violations.join('\n'), '全树 absence 判据没有覆盖到别的包（A3）').toMatch(/确认框|polkit/)
  })

  it('宿主在但需要的文件缺失 → 判红，而不是跳过（A2 的 fail-closed 半边）', () => {
    if (HOST_WORLD.kind !== 'present') return
    const violations = checkHostWorld({ ...HOST_WORLD, missing: ['dsh-client-ui-approval/lib/client.js'] })
    expect(violations.join('\n'), '文件缺失被当成「跳过」了——A2 会因此漏掉真实的宿主结构变化').toMatch(/找不到/)
  })
})
