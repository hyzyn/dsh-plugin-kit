/**
 * 带外授权（grant）的持久存储：`<DSH home>/dsh-kit/capability-grants.json`。
 *
 * ## 它为什么存在
 *
 * 危险能力开关有两条授权通道（见 `capability.ts`）：
 *   1. **启动环境变量**——最严，但要求用户改启动环境并重启宿主；
 *   2. **就地提权**——页内点开关 + 一次带外确认（`elevation.ts`），免重启。
 *
 * 第 2 条的确认结果必须落在**宿主自己写、HTTP 写不到**的地方：配置存储
 * （`cordis.patch.yml` / settings）是 HTTP 可写的，把授权放进去等于没有闸门。所以单独一个文件，
 * 并且**只有宿主进程写**——HTTP 侧没有任何写入口。
 *
 * ## 几条不变量（改动时不要放松）
 *
 *   - **0600 / 目录 0700**：授权等于「这台机器上的 root 级能力」（docker socket），别的用户不该看见。
 *   - **原子写**（复用 kit 的 `writeFileAtomic`）：读者要么看到旧全文、要么看到新全文。
 *   - **首查读盘 + 进程内缓存**：本进程写过的值即时可见；**别的进程**改文件不热生效（重启后生效）——
 *     授权是「宿主对这次运行的许可」，不是需要实时跟随的配置。
 *   - 读盘坏了（非法 JSON / 结构不对）当**空表**处理并 warn，绝不抛错：安全方向永远是「没有授权」。
 *
 * ## 已知限制（2026-09-26 复核，刻意不修，别当缺陷报）
 *
 *   1. **运行期改 / 删文件不生效**（要重启才读到）。删文件当撤销是**很容易误以为生效**的一侧——
 *      界面上的“撤销宿主授权”按钮才是正路。要做成热生效，就在 `has()` / `source()` 里比对
 *      mtime+size 再决定是否重读；当前选择是「授权是宿主对这次运行的许可，不是实时跟随的配置」。
 *   2. 授权记录的 key 是**裸环境变量名**，不含插件身份：两个插件用同名 env 就共享同一条授权。
 *      今天的名字都带 `DSH_DOCKER_` 这类前缀，现实碰撞概率低；要做成结构上的隔离，key 应改成
 *      `插件id:env`（落盘格式带 `version`，有迁移口子）。
 */
import { chmodSync, mkdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { writeFileAtomic } from './managed-block.js'

/** 授权的来源通道：目前只有「带外落地授权文件」这一条（就地提权）。 */
export type CapabilityGrantVia = 'file'

/** 一条已生效的授权记录。 */
export interface CapabilityGrant {
  /** 授权时刻（Unix 秒）。 */
  grantedAt: number
  /** 授权经由哪条通道。 */
  via: CapabilityGrantVia
}

/**
 * `capabilityGranted` 需要的**最小**授权存储形状。
 *
 * 为什么用接口而不是直接依赖 `GrantStore`：能力判定是跨包约定（docker / tty 都调），而存储实例
 * 由插件自己造（它知道 `dshHome()`，测试里则指向临时目录）；接口让两边各自演化，测试也能塞一个
 * 只实现 `has` 的假对象。
 */
export interface CapabilityGrantSource {
  has(env: string): boolean
  source?(env: string): CapabilityGrant | undefined
}

/**
 * kit 在 DSH 主目录下**自己的**数据目录名。
 *
 * 为什么带归属：DSH 主目录是**所有**所有者共用的平铺目录（官方的 `sessions/` `logs/` `storages/`，
 * 本仓插件的 `tty/` `rss-digest/` `rss.json`）。把 `capability-grants.json` / `grant-confirm/` 这类
 * **描述机制**的名字直接铺在那一层，等于替「集中式能力同意存储」这个位置预设了占用者——DSH 核心
 * 将来加同名目录是完全合理的，那时就是鸠占鹊巢。按拥有者包名收进一级子目录，惯例与 `tty/` 一致。
 * （kit D08。）
 */
export const KIT_DIR_NAME = 'dsh-kit'

/** 授权文件名（放在 kit 自己的目录下）。 */
export const GRANT_FILE_NAME = 'capability-grants.json'

/** 就地提权等待确认文件的子目录名（`elevation.ts` 用；路径由 `capabilityPaths` 统一拼）。 */
export const CONFIRM_DIR_NAME = 'grant-confirm'

/**
 * 覆写 kit 数据目录的环境变量（**测试 / 诊断用**，不是给用户调的旋钮）。kit D12。
 *
 * 为什么需要它：真宿主验收（`scripts/live-host-smoke.mjs`）里有一个「宿主没授权」的实例，
 * 而它**必须**跑在用户真实的 DSH 主目录下（profile 里的 `node_modules` 是指向本仓的**相对**
 * 符号链接，换 `DSH_HOME` 会让插件整批失联）。可带外授权是**持久**的：用户只要在卡片上
 * 授权过一次，那个「无授权实例」就会继承下来——2026-09-27 实测，A 段 9 条断言全红，
 * 而红的理由与产品行为无关（它其实已授权）。那正是本仓最忌讳的一类闸门：**恒红且理由错**，
 * 跑几次之后没人再看它，于是真正的回归也一起被无视。
 *
 * 有了这个覆写，验收把两个实例的授权目录各自指到一个空目录，前提重新成立。
 * **它不是新的权限口子**：能设置宿主环境变量的人，本来就能用启动环境变量那条通道
 * 直接授权（那条通道比这个更强）；这里只是把「授权落在哪个目录」也变成可注入的。
 */
export const KIT_HOME_ENV = 'DSH_KIT_HOME'

/**
 * kit 在 DSH 主目录下的落盘布局。
 *
 * 存在的理由：落点原来是**两处各拼一遍**（存储自己拼文件名、插件自己 `join(dshHome(), 'grant-confirm')`），
 * 改了目录名就会漂一半——那正是本仓最忌讳的「配了没反应」的路径版。
 */
export interface CapabilityPaths {
  /** kit 的数据目录（`<DSH home>/dsh-kit`）。 */
  dir: string
  /** 授权文件（`<dir>/capability-grants.json`）。 */
  grantsFile: string
  /** 就地提权的确认目录（`<dir>/grant-confirm`）。 */
  confirmDir: string
}

/** 拼出 kit 的落盘布局。**路径只在这里拼一次**，消费方不要再自己 `join(dshHome(), …)`。 */
export function capabilityPaths(dshHomeDir: string): CapabilityPaths {
  const override = process.env[KIT_HOME_ENV]?.trim()
  // 覆写为空串 / 全是空白视为没设：那多半是「变量存在但没填」的误配置，
  // 静默落到 DSH 主目录比报错好——它只会让授权回到默认落点，不会放开任何东西
  const dir = override !== undefined && override !== '' ? resolve(override) : join(dshHomeDir, KIT_DIR_NAME)
  return { dir, grantsFile: join(dir, GRANT_FILE_NAME), confirmDir: join(dir, CONFIRM_DIR_NAME) }
}

/** 文件格式版本（将来改结构时用它决定怎么迁移）。 */
const SCHEMA_VERSION = 1
const DIR_MODE = 0o700
const FILE_MODE = 0o600

/**
 * 授权存储。**构造不碰磁盘**（文件不存在时第一次 `has()` 才是空表），首次查询时读一次盘。
 *
 * @param dir - 放授权文件的目录。正常走 `capabilityPaths(dshHome()).dir`；测试传临时目录。
 *   本类**只拥有这个目录**（缺就建、建了才 chmod），不去动 DSH 主目录本身的权限。
 */
export class GrantStore implements CapabilityGrantSource {
  private loaded = false
  private readonly records = new Map<string, CapabilityGrant>()

  constructor(private readonly dir: string) {}

  /** 授权文件路径（审计文案与测试断言都用它，避免各处各拼一遍）。 */
  path(): string {
    return join(this.dir, GRANT_FILE_NAME)
  }

  has(env: string): boolean {
    this.load()
    return this.records.has(env)
  }

  source(env: string): CapabilityGrant | undefined {
    this.load()
    return this.records.get(env)
  }

  /** 记一条授权并落盘（本进程内即时可见）。 */
  grant(env: string, via: CapabilityGrantVia = 'file'): void {
    this.load()
    this.records.set(env, { grantedAt: Math.floor(Date.now() / 1000), via })
    this.flush()
  }

  /** 撤销授权并落盘；**没记录就不写盘**（空操作不该新建文件 / 刷 mtime）。 */
  revoke(env: string): void {
    this.load()
    if (!this.records.delete(env)) return
    this.flush()
  }

  /** 读盘一次并缓存。文件不存在 = 空表。 */
  private load(): void {
    if (this.loaded) return
    this.loaded = true
    let text: string
    try {
      text = readFileSync(this.path(), 'utf8')
    } catch {
      // 从没授权过（ENOENT）与权限不足都当空表：安全方向是「没有授权」
      return
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      console.warn(`[dsh-kit] 授权文件不是合法 JSON，按空表处理（下次授权会覆盖它）：${this.path()}`)
      return
    }
    for (const [env, grant] of readGrants(parsed)) this.records.set(env, grant)
  }

  private flush(): void {
    const created = mkdirSync(this.dir, { recursive: true, mode: DIR_MODE })
    /*
     * `mkdirSync` 的 mode 会被 umask 进一步收紧（`mode & ~umask`），于是同一个调用在 umask 0
     * 的机器上得到 0755、在 umask 077 的机器上才是 0700——权限本该是确定的（它管的就是授权文件
     * 的可见范围），不该随调用方的 umask 漂。只在**这次真的建了目录**时补 chmod，避免去动调用方
     * 已有的目录权限（那不是本类的职责）。
     * 真机教训同 `managed-block.ts` 的 `writeFileAtomic`（2026-09-26 Ubuntu root/umask 077）。
     */
    if (created !== undefined && process.platform !== 'win32') chmodSync(this.dir, DIR_MODE)
    const payload = {
      version: SCHEMA_VERSION,
      grants: Object.fromEntries(
        [...this.records.entries()].map(([env, grant]) => [env, { grantedAt: grant.grantedAt, via: grant.via }]),
      ),
    }
    writeFileAtomic(this.path(), JSON.stringify(payload, null, 2) + '\n', FILE_MODE)
  }
}

/**
 * 按目录共享的授权存储：**同一个目录在一进程内只造一个实例**（kit D11）。
 *
 * ## 为什么必须有（这不是优化，是正确性）
 *
 * 能力判定（`capability.ts`）是**模块级单例**：`bindCapabilitySources` 后绑定的那次覆盖前一次。
 * 一个宿主里可以同时装多个用到能力开关的插件（本仓就是 docker + tty），于是「谁最后 apply、
 * 谁的存储生效」。而 `GrantStore` 是**首查读盘 + 进程内缓存**的——各插件各 `new` 一个，就等于
 * 每个插件拿一份**快照副本**：
 *
 *   - 实测症状（2026-09-27，真宿主，docker + tty 都装）：用户在 **tty 卡片**上完成就地授权，
 *     授权文件里明明有了这条记录，**tty 自己的快照却报 `granted: false`**——因为此刻绑定的是
 *     docker 那个实例，它在启动时就缓存了「还没有这条授权」的表。界面于是显示「未获宿主授权」，
 *     连「撤销宿主授权」按钮都不渲染；策略重算同样问的是错的来源（授权等于没生效）。
 *   - 也不能用「多个来源取并集」糊过去：那样**一个过期的副本会否决撤销**（A 实例撤销了、
 *     B 实例还缓存着 → 并集说「还授权着」），方向恰好是危险的那一侧。
 *
 * 所以正确的形态是「同一目录 = 同一实例」：读的是同一份缓存、写的是同一份缓存，后绑定的插件
 * 与前一个看到的完全一致。插件应当用它而不是 `new GrantStore(...)`；`GrantStore` 仍导出给
 * 单测注入自己的临时目录。
 */
const sharedStores = new Map<string, GrantStore>()

/**
 * **仅供测试**：清掉共享实例的进程内 memo（连带它们缓存的授权表）。
 *
 * 为什么必须有：`sharedGrantStore` 的记忆是**进程级**的（这正是它要修的 bug），而测试恰恰需要
 * 「每个用例一份干净状态」——只删授权文件是不够的，内存里那份缓存还在。真实宿主不该调用它：
 * 那里一个进程只该有、也只有一个实例。
 */
export function __resetSharedGrantStoresForTest(): void {
  sharedStores.clear()
}

/** 取这个目录的共享授权存储（同一目录多次调用返回**同一个**实例；见上面的 D11）。 */
export function sharedGrantStore(dir: string): GrantStore {
  const key = resolve(dir)
  const existing = sharedStores.get(key)
  if (existing !== undefined) return existing
  const created = new GrantStore(key)
  sharedStores.set(key, created)
  return created
}

/**
 * 校验读到的 JSON：只接受 `{version, grants:{<env>:{grantedAt,via}}}`。
 *
 * 逐条丢掉不认识的东西（而不是整份作废）：手工编辑过的文件里多一个字段不该让**其它**能力一起掉线。
 * `via` 只认已知通道——将来新增通道时忘了在这里放行，症状是「授权被静默忽略」，比放行一个错值安全。
 */
function readGrants(parsed: unknown): Array<[string, CapabilityGrant]> {
  if (typeof parsed !== 'object' || parsed === null) return []
  const grants = (parsed as { grants?: unknown }).grants
  if (typeof grants !== 'object' || grants === null) return []
  const out: Array<[string, CapabilityGrant]> = []
  for (const [env, value] of Object.entries(grants as Record<string, unknown>)) {
    if (typeof value !== 'object' || value === null) continue
    const grantedAt = (value as { grantedAt?: unknown }).grantedAt
    const via = (value as { via?: unknown }).via
    if (typeof grantedAt !== 'number' || !Number.isFinite(grantedAt)) continue
    if (via !== 'file') continue
    out.push([env, { grantedAt, via }])
  }
  return out
}
