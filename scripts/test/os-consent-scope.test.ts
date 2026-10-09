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
 * 顺序：① 本仓 `node_modules`（CI 在这里是 peer stub，落到下一档）；
 * ② 扫 `~/.nvm/versions/node/<ver>/lib/node_modules/...`。
 *
 * 为什么第 ② 档是**扫描**而不是用 `process.version` 直接拼（2026-10-07 review B5 指出
 * 本注释原来给的理由是错的）：`process.version` **带** `v`（本机是 `v22.23.2`），nvm 的目录名
 * 也是 `v22.23.2`——所以「拼不出来」不成立，实测在本机拼得上。真实的理由是**另一个**：
 * **跑测试的 node 未必是装 DSH 的那个版本**（nvm 下多版本共存是常态，本机就有 `v16`–`v22` 七个）。
 * DSH 装在 `v22.23.2`、而 `pnpm test` 跑在 `v20.19.1` 时，按 `process.version` 拼就 miss 了，
 * 得扫目录才找得到。所以扫描不是兜底、是**正确**做法。
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

  /*
   * 全树扫描用（A3 / N3）：把每个包 **lib/ 下所有文件** 收进来。
   *
   * N3（2026-10-07 review）：原先只读 `lib/index.js` 一个文件，于是宿主若把确认框原语放进
   * `lib/client.js`（浏览器半体）/ `lib/worker.cjs`（如 picker-native 的 win32 worker）/
   * 子目录，这道 absence 判据**仍看不见**——而方案那句是**树级**断言。
   * 修法：按包**递归收 lib/**（含 .js / .cjs / .mjs / .d.ts），而不是按扩展名过滤掉别的形态。
   * 仍不收整个包目录：`src/`（源码）与 `node_modules/`（依赖）不属于「宿主自带设施」这一问。
   */
  const packages = new Map<string, string>()
  for (const pkg of readdirSafe(dir)) {
    const libDir = join(dir, pkg, 'lib')
    if (!existsSync(libDir)) continue
    const chunks: string[] = []
    const collect = (current: string): void => {
      for (const entry of readdirSafe(current)) {
        const child = join(current, entry)
        const text = readFileSafe(child)
        if (text !== undefined) chunks.push(text)
      }
    }
    collect(libDir) // lib/ 根
    for (const sub of readdirSafe(libDir)) {
      const subDir = join(libDir, sub)
      if (existsSync(subDir) && readFileSafe(subDir) === undefined) collect(subDir) // 一层子目录
    }
    if (chunks.length > 0) packages.set(pkg, chunks.join('\n'))
  }

  // CSP 位点（A6）：只收**存在**的文件
  const cspSites = new Map<string, boolean>()
  for (const site of CSP_SITES) {
    const raw = readFileSafe(join(dir, site.rel))
    if (raw !== undefined) cspSites.set(site.rel, /Content-Security-Policy/.test(raw))
  }

  /**
   * 宿主版本（`@deepseek-ai/dsh` 自己的 package.json）。
   *
   * **N1（2026-10-07 review）**：这里原先是 `join(dir, 'dsh', 'package.json')`——**路径是错的**，
   * 于是 `version` 恒为 `undefined`，下游「基准版本要对得上」那条判据一命中
   * `if (HOST_WORLD.version === undefined) return` 就直接放行，**升级绊线成了死代码**；
   * 而 `dir` 已经是 `…/@deepseek-ai/dsh/node_modules/@deepseek-ai`，真实版本在它**上两级**。
   * 更糟的是只有「真宿主在仓 node_modules」那条分支才可能读到（CI 的 stub 走不到），
   * 所以本机与 CI **双双空转**——这正是 A2 的同一形状搬到了新位置。
   *
   * 修法：**向上逐级找**名为 `@deepseek-ai/dsh` 的 package.json，而不是拼一个写死的相对层数
   * （层数随安装形态变：全局装 / 仓内 link / pnpm store 各不相同）。
   */
  const version = (() => {
    let cursor = dir
    for (let depth = 0; depth < 6; depth += 1) {
      const raw = readFileSafe(join(cursor, 'package.json'))
      if (raw !== undefined) {
        try {
          const parsed = JSON.parse(raw) as { name?: unknown; version?: unknown }
          if (parsed.name === '@deepseek-ai/dsh' && typeof parsed.version === 'string') return parsed.version
        } catch {
          /* 不是 JSON 就继续往上找 */
        }
      }
      const parent = join(cursor, '..')
      if (parent === cursor) break
      cursor = parent
    }
    return undefined
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
    /*
     * B1（2026-10-07 review）：方案曾写「今天回答它的**唯一**实现是客户端」——而 ACP 也在这条
     * 瀑布上（同一文档 §2.2 自己就点了 ACP），**自相矛盾**。结论没错（Web 会话里生效的是页面
     * 那个 answerer），错在「唯一」。这里钉住措辞：不许再出现「唯一实现是客户端」这种说法。
     */
    if (/唯一实现是客户端|唯一.{0,6}answerer/.test(plan)) {
      out.push('方案又把这条瀑布写成了「唯一 answerer」——ACP 也在上面（B1），结论没错但「唯一」是错的')
    }
    if (!/ACP/.test(plan)) {
      out.push('方案不再提 ACP——那 §2.2「会与 ACP 争抢」那段论证就悬空了')
    }
    /*
     * C2（2026-10-07 review）：方案原带 15+ 处**宿主行号**引用（`dsh-xxx/lib/…:123`）。
     * 宿主的行号会随它自己的每个补丁漂，而**没有任何守卫能发现**（本文件只钉形态、不钉行号）——
     * 这与 conventions 硬规矩 4（「索引表不写行号」）是同一条道理，对外部依赖成立得更彻底。
     * 引宿主的写法定为「包名 + 符号名」，所以这里禁掉 `包/lib/…:数字` 这种形态。
     */
    const hostLineRefs = [...plan.matchAll(/dsh-[a-z0-9-]+\/lib\/[^\s`:)]*:\d+/g)].map((m) => m[0])
    if (hostLineRefs.length > 0) {
      out.push(
        `方案里又有宿主行号引用（${hostLineRefs.slice(0, 3).join('、')}…）——` +
          '按 §0 的「引用宿主的写法」只写包名 + 符号名（C2）',
      )
    }
    // C1：§4 必须写「复用宿主那份 resolver」，不许只说「与它同档」
    if (/判据与宿主 picker 同档/.test(plan)) {
      out.push('§4 又写成了「判据与宿主 picker 同档」——同档 ≠ 复用，会造出第二处真相源（C1）')
    }
    if (!/resolveDirectoryPickerBackend/.test(plan)) {
      out.push('§4 没有点名要复用 resolveDirectoryPickerBackend（C1：那份判据宿主已有，不许另写）')
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
       * （第一版按单行判，把已经写对的那几处全报成了违规）。取「本行行首 → 其后 400 字符」。
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

  // ---- 3. 每一处「要拦它只有 OS 级同意」都必须收窄成「速度楔子 / 非结构性屏障」 ----
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

  // ---- 事实 1c（B1）：这条瀑布**不止一个** answerer；ACP 也在上面 ----
  // 方案措辞已从「唯一实现」改成「两个 answerer，Web 会话里生效的是页面那个」。
  // 钉住 ACP 那条仍在：它一旦消失，方案里「形状不对 + 会与 ACP 争抢」这段论证就少了一半。
  const acp = world.packages.get('dsh-acp')
  if (acp === undefined) {
    out.push('宿主里没有 dsh-acp 包——方案 §2.2 提到「ACP 也在这条瀑布上」，请核对后再删那段论证')
  } else if (!/ctx\.on\(\s*["']approval\/request["']/.test(acp)) {
    out.push('dsh-acp 不再监听 approval/request——它要么被移除、要么换了接法，重读方案 §2.1 事实 1')
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
        '方案 §4 的「新写一个框」应改为「复用」；若确认不是确认框（只是 chooser 探测），核对后收窄本判据',
    )
  }

  // ---- 事实 3b（C1）：宿主**已有**「宿主坐在屏幕前吗」的判据，方案 §4 必须复用它 ----
  // review C1：方案原写「判据与宿主 picker 同档」——同档 ≠ 复用，会引导 PR4 另写一份，
  // 于是仓里出现第二处「宿主坐在屏幕前吗」的真相源。这里钉住那份 resolver 仍在且仍可复用。
  const auto = world.packages.get('dsh-host-directory-picker-auto')
  if (auto === undefined) {
    out.push('宿主里没有 dsh-host-directory-picker-auto——方案 §4 说「复用它的 resolver」，请核对后再改那段')
  } else {
    if (!/function resolveDirectoryPickerBackend/.test(auto)) {
      out.push('picker-auto 里找不到 resolveDirectoryPickerBackend——方案 §4 的复用前提变了，重读 §4 第 2 条')
    }
    if (!/export \{[^}]*resolveDirectoryPickerBackend/.test(auto)) {
      out.push('resolveDirectoryPickerBackend 不再被 export——§4 的「可直接 import」不成立，得改方案或改用结构读')
    }
    /*
     * 「宿主坐在屏幕前」的判据必须仍在（缺任一条就是判定口径变了）。
     *
     * 2026-10-09 宿主升到 `0.2.1-alpha.2` 时这套口径**真的变过一次**（升级绊线按设计报红）：
     * ① 环回判定从写死 `'127.0.0.1'` 换成 `dsh-host-webserver` 的 `isLoopbackHost()`——
     *    与同轮「监听地址只收环回或具体网卡」一致，具体网卡地址同样算「框够不着」；
     * ② 新增 `allowsRemoteAuthorities`（Connection 信任策略放行了远端 authority 就回落 browse）。
     * 判据因此从三条变四条，这里跟着换成新口径；**再变还会红**，那时回读 §4 第 2 条。
     */
    for (const [signal, pattern] of [
      ['bindHost 判据（环回）', /!isLoopbackHost\(facts\.bindHost\)/],
      ['远端授权判据', /facts\.allowsRemoteAuthorities/],
      ['SSH 判据', /facts\.ssh/],
      ['Linux 显示会话判据', /DISPLAY\) \|\| present\(facts\.env\.WAYLAND_DISPLAY\)/],
    ] as const) {
      if (!pattern.test(auto)) out.push(`picker-auto 的 ${signal} 不见了——§4 复用的那份 resolver 变了口径`)
    }
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

/**
 * 升级绊线的**纯判据**（N1）：宿主版本 vs 方案基准，返回违规描述（undefined = 通过）。
 *
 * 抽成纯函数的理由与 `checkRepoWorld` 同一条（A1 的结构性修复）：**真实断言与反例必须走
 * 同一条代码路径**，否则反例只能断言「当前状态恰好如此」，证不了绊线有牙。
 *
 * 三条语义（每一条都有对应反例）：
 *   - `version === undefined` → **报错**。原实现是 `return`（静默放行），而宿主在、却读不到
 *     它的版本 = 宿主布局变了，那是回归信号。这正是 N1 那个死代码的形状。
 *   - 与基准不一致 → 报错（DSH 升级可能改变方案依赖的三条事实）。
 *   - 一致 → undefined。
 */
export function baselineVersionViolation(version: string | undefined, plan: string): string | undefined {
  const baseline = /DSH `(\d+\.\d+\.\d+[^`]*)`/.exec(plan)?.[1]
  if (baseline === undefined) return '方案里没有基准版本号——绊线无从比较'
  if (version === undefined) {
    return '宿主在、但取不到 @deepseek-ai/dsh 的版本——宿主布局变了（判据读法要跟着改），不许静默放行'
  }
  if (version !== baseline) {
    return (
      `宿主版本 ${version} 与方案基准 ${baseline} 不一致：` +
      'DSH 升级可能改变三条事实，请重读 docs/os-consent-plan.md §2.1 并更新基准'
    )
  }
  return undefined
}

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
     * 这个自检**自己踩过三个坑**，记在这里免得后人重犯：
     *   ① 第一版 `toContain('checkHostWorld(HOST_WORLD)')`——**它自己的注释里**就写着这个字符串，
     *      于是把调用删掉照样绿（实测：删掉真实调用 → 14 passed）；
     *   ② 第二版「剥掉注释再数」——但**它自己的参数里**又写着同一个字符串，数出来 ≥1，照旧绿；
     *   ③ 第三版把针改成「整条语句」`expect(checkHostWorld(HOST_WORLD))`——那会**误红**：
     *      把调用重构成 `const v = …; expect(v)` 是等价且更好读的写法（N4）。
     * 结论：① **被搜索的针不能完整地出现在本文件里**（拆成两段拼接）；
     *      ② 判据盯的是「**那个调用还在**」，不是「那句写法没换」——所以匹配调用表达式本体。
     */
    const self = read('scripts/test/os-consent-scope.test.ts')
    const withoutComments = self
      .replace(/\/\*[\s\S]*?\*\//g, '') // 块注释（含文件头）
      .replace(/\/\/.*$/gm, '') // 行注释
    // 针拆开拼（本文件里因此不会出现完整字面量）；匹配**调用表达式本体**，不受语句形态影响
    const repoCall = 'checkRepoWorld' + '(REPO_WORLD)'
    const hostCall = 'checkHostWorld' + '(HOST_WORLD)'
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
    const plan = REPO_WORLD.get(REPO_FILES.plan) ?? ''
    // 走抽出来的纯判据（N1）；三条语义的反例见「宿主侧反例」那一块
    const violation = baselineVersionViolation(HOST_WORLD.version, plan)
    expect(violation, '升级绊线报错').toBeUndefined()
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

  it('收窄被退回「只有 OS 级同意」→ 本仓判据红', () => {
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

  it('方案又把瀑布写成「唯一 answerer」→ 本仓判据红（B1）', () => {
    const world = repoWorldWith(
      REPO_FILES.plan,
      '它有两个 answerer（**这条瀑布不是一个，别写成「唯一」**）：宿主侧的 ACP',
      '而**今天回答它的唯一实现是客户端**：宿主侧的 ACP',
    )
    expect(checkRepoWorld(world).join('\n')).toMatch(/唯一 answerer/)
  })

  it('方案抹掉 ACP → 本仓判据红（B1：§2.2 的争抢论证会悬空）', () => {
    const plan = REPO_FILES.plan
    const world = new Map(REPO_WORLD)
    world.set(plan, (world.get(plan) ?? '').replace(/ACP/g, '某某'))
    expect(checkRepoWorld(world).length).toBeGreaterThan(0)
  })

/*
 * 宿主侧反例：
 *
 * **N2（2026-10-07 review）**：这些用例原先留在「反例层」里，各自靠
 * `if (HOST_WORLD.kind !== 'present') return` 提前返回——宿主不在时它们**报 ✓**（静默通过），
 * 于是 CI 的计数里混着空转。这与 A2 的纪律（「跳过要响亮」）冲突：宿主缺失应当整块 `skipped`。
 * 所以单独成块 + `skipIf`，与「宿主侧三条事实」那条同款。
 */
describe.skipIf(HOST_WORLD.kind === 'absent')('OS 级同意：宿主侧反例（需真实 DSH）', () => {
  it('宿主把审批改由宿主 answerer 回答（不再是页面 remote）→ 宿主判据红', () => {
    const world = hostWorldWith(HOST_FILES.approvalClient, 'ctx.remote.$on("approval/request"', 'ctx.notTheRemoteAnymore("approval/request"')
    expect(checkHostWorld(world).length, '反例必须让真判据报错（A1：不能只断言 replace 成功）').toBeGreaterThan(0)
  })

  it('宿主换成 iframe 隔离插件半体 → 宿主判据红', () => {
    const world = hostWorldWith(HOST_FILES.moduleLoader, 'same-origin external classic script', 'sandboxed iframe bundle')
    const violations = checkHostWorld(world)
    expect(violations.length).toBeGreaterThan(0)
    expect(violations.join('\n')).toMatch(/iframe|装载说明/)
  })

  it('宿主里出现确认框原语（全树扫描）→ 宿主判据红', () => {
    // 往**任意一个**包里塞一个确认框原语，验证全树扫描真的在扫（A3）
    const somePkg = [...HOST_WORLD.packages.keys()][0]
    if (somePkg === undefined) return
    const packages = new Map(HOST_WORLD.packages)
    packages.set(somePkg, (packages.get(somePkg) ?? '') + '\ndisplay dialog "confirm?"\n')
    const violations = checkHostWorld({ ...HOST_WORLD, packages })
    expect(violations.join('\n'), '全树 absence 判据没有覆盖到别的包（A3）').toMatch(/确认框|polkit/)
  })

  it('宿主在但需要的文件缺失 → 判红，而不是跳过（A2 的 fail-closed 半边）', () => {
    const violations = checkHostWorld({ ...HOST_WORLD, missing: ['dsh-client-ui-approval/lib/client.js'] })
    expect(violations.join('\n'), '文件缺失被当成「跳过」了——A2 会因此漏掉真实的宿主结构变化').toMatch(/找不到/)
  })

  it('宿主不再导出那份 resolver → 判据红（C1：§4 的复用前提没了）', () => {
    const current = HOST_WORLD.packages.get('dsh-host-directory-picker-auto')
    if (current === undefined) return
    /*
     * 替换**全部**出现处（不是第一处）：N3 之后 `packages` 收的是 lib/ 下**所有**文件，
     * 于是同一个符号在 `index.js`（`function …`）与 `types/index.d.ts`（`declare function …`）
     * 里各出现一次——只换第一处，另一处仍匹配，判据照旧放行，反例就成了空转
     * （这正是 A1 那条纪律说的「假反例」）。`mutate` 用 `.replace` 只换一处，所以这里显式 replaceAll。
     */
    const mutated = current.replaceAll('resolveDirectoryPickerBackend', 'renamedBackendResolver')
    expect(mutated, '反例没生效：符号名没被替换掉').not.toBe(current)
    const packages = new Map(HOST_WORLD.packages)
    packages.set('dsh-host-directory-picker-auto', mutated)
    const violations = checkHostWorld({ ...HOST_WORLD, packages })
    expect(violations.join('\n'), '§4 说「复用它的 resolver」，那名/签名一改就该提醒').toMatch(/resolveDirectoryPickerBackend/)
  })

  /*
   * N1（2026-10-07 review）：升级绊线（「基准版本要对得上」）此前**是死代码**——读版本的
   * 路径写错（`join(dir, 'dsh', 'package.json')`，而 dir 已经是 `…/@deepseek-ai/dsh/node_modules/@deepseek-ai`），
   * 于是 `version` 恒 undefined、判据当场 `return`，**报 ✓ 而什么都没比较**；且只有真宿主那条
   * 分支才可能读到，CI 的 stub 走不到 ⇒ 本机与 CI 双双空转。
   *
   * 这两条反例喂的是**抽出来的纯函数** `baselineVersionViolation`（与真实断言同一条代码路径），
   * 所以它们证的是「绊线有牙」，而不是「当前状态恰好如此」——后者是 A1 明令禁止的那种假反例。
   */
  it('宿主版本取不到（布局变了）→ 绊线判红，不再静默放行（N1）', () => {
    const plan = REPO_WORLD.get(REPO_FILES.plan) ?? ''
    const violation = baselineVersionViolation(undefined, plan)
    expect(violation, 'version 缺失必须报错（原先是静默 return）').toBeDefined()
    expect(violation).toMatch(/取不到/)
  })

  it('宿主版本与方案基准不一致 → 绊线判红（N1：绊线有牙）', () => {
    const plan = REPO_WORLD.get(REPO_FILES.plan) ?? ''
    const violation = baselineVersionViolation('0.0.1-whatever', plan)
    expect(violation, '版本对不上必须报错').toBeDefined()
    expect(violation).toMatch(/不一致/)
  })

  it('宿主版本与基准一致 → 不报（绊线不能恒红）', () => {
    const plan = REPO_WORLD.get(REPO_FILES.plan) ?? ''
    const baseline = /DSH `(\d+\.\d+\.\d+[^`]*)`/.exec(plan)?.[1]
    expect(baseline, '方案里没有基准版本号').toBeDefined()
    expect(baselineVersionViolation(baseline, plan), '版本一致时不该报错').toBeUndefined()
    // 并确认真实宿主确实读到了版本、且与基准一致（否则上面那条就是空转）
    expect(HOST_WORLD.version, '真实宿主的版本读不到——N1 的读法（向上逐级找）失效了').toBeDefined()
    expect(HOST_WORLD.version).toBe(baseline)
  })

  it('宿主换了「坐在屏幕前」的口径（去掉 SSH 判据）→ 判据红（C1）', () => {
    const current = HOST_WORLD.packages.get('dsh-host-directory-picker-auto')
    if (current === undefined) return
    const packages = new Map(HOST_WORLD.packages)
    // 模拟宿主不再排除 SSH 启动（那会让框开在无人值守的机器上）
    packages.set('dsh-host-directory-picker-auto', mutate(current, 'if (facts.ssh) return "browse";', '// ssh 判据被移除'))
    const violations = checkHostWorld({ ...HOST_WORLD, packages })
    expect(violations.join('\n'), 'SSH 判据不见了必须报——那正是 §4 要不变量 6 防的场景').toMatch(/SSH 判据/)
  })

  it('宿主换了「坐在屏幕前」的口径（去掉远端授权判据）→ 判据红（C1，2026-10-09 新增的那条）', () => {
    const current = HOST_WORLD.packages.get('dsh-host-directory-picker-auto')
    if (current === undefined) return
    const packages = new Map(HOST_WORLD.packages)
    // 模拟宿主不再排除「信任策略放行了远端 authority」的部署（那种部署会招来远程浏览器，而 OS 框它够不着）
    packages.set('dsh-host-directory-picker-auto', mutate(current, 'facts.allowsRemoteAuthorities', 'false'))
    const violations = checkHostWorld({ ...HOST_WORLD, packages })
    expect(violations.join('\n'), '远端授权判据不见了必须报——它是 0.2.1-alpha.2 新加的一条「框够不着」').toMatch(/远端授权判据/)
  })
})
})
