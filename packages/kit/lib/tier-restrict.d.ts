/**
 * 会话档位 → **agent 作用域的全局工具裁剪**（宿主 `tools.restrict`，2026-10 试点）。
 *
 * ## 与 `attachTierGate` 的分工（两层，不是备胎）
 *
 * `attachTierGate` 管**这一次调用放不放行**：每次工具调用都按档位判 放行 / 询问 / 拒绝。
 * 本模块管**工具面本身**：受限档的会话根本看不到 write / exec 类工具——模型不会去试一个不存在的
 * 工具，也就不会把一整轮花在「被拒 → 换 bash → 再被拒」上，省的是**来回**而不是安全。
 *
 * 两条判据必须各自成立：裁剪只是把**按当前档位不可能成功**的工具摘掉；**执行期闸仍然是唯一的
 * 安全边界**——裁剪名单漏了谁、工具在会话建立之后才注册、档位切换的事件没收到，都只影响「模型
 * 看不看得见」，不构成越权（调用照样被 `attachTierGate` 按档位拦住）。这也是本模块敢把重算做成
 * 「尽力而为」的原因：它错了只会多一轮往返，不会多一次越权。
 *
 * ## 为什么只能从 `agent.ctx` 调 `restrict`
 *
 * 宿主 `ToolRuntime.restrict()` 的第一句是 `scopeOf(this.ctx)`，取不到 scope 直接抛；而
 * `ctx.get('tools')` 拿到的是**按插件 ctx 绑定**的服务实例（插件 ctx 没有 scope）。必须用
 * `agent.ctx.tools`——宿主服务被 traceable 包过，方法调用时 `this` 会重绑成**调用方那个
 * context**（codegraph `src/scope.ts` 的文件头把这条链路逐行记过），于是限制正好落在该 agent
 * 的分层里（`dsh-scope` 的 `ScopedLayers.effect` 按 `scopeOf(ctx)` 分桶）。
 *
 * ## 名单必须与 `schemas()` 求交
 *
 * `restrict()` 对**任何一个**不在当前全局工具集里的名字整体抛错（`unknown global tool ...`），
 * 而各插件的注册集都是**条件式**的（tty 没配连接簿就没有 `sftp_*`、没配隧道就没有 `tunnel_*`；
 * docker 的能力开关关闭时那 5 个写 / 执行工具根本没注册）。直接传分类表全量 = 在「只配了基础
 * 工具」的会话上把整次裁剪炸掉。所以 deny 一律由 `schemas()` 投影出的**真实名字**现算：
 * 注册了才裁，没注册不点名。
 *
 * ## 边界（刻意不做的事）
 *
 * 1. **服务缺失 = 不裁剪**：与 `attachTierGate` 同一口径（沙箱服务没组合时「档位」无从谈起，
 *    这时 `resolveSessionTier` 会返回最严的 read-only，照做会把所有工具都裁掉——那是把
 *    「没有档位概念」误判成「只读档」）。
 * 2. **完全权限 / auto review 档不按档位裁剪**：这两档在 `decideTierCall` 里是 allow 硬分支，
 *    工具本来就能用；把它们藏起来等于替用户改档。判据集中在 {@link shouldRestrictForTier}。
 * 3. **跟会话中途的档位切换**（2026-10-25 起）：订阅 `session/event` 里的三个旋钮事件
 *    （`sandbox/mode` / `approval/policy` / `permission/preset`），按会话 id 找回 agent 重算一次。
 * 4. **不碰非本插件的工具**：前缀 + 分类表双重过滤（`prefixes` 防同名跨插件误伤）。
 *
 * 第 3 条的来历与判据：档位是会话级旋钮，**两个方向都得跟**——升档（只读 → 完全权限）要把工具
 * **放回来**，否则用户刚授权、模型却还面对旧工具面（看着像「授权没生效」）；降档要把工具**摘掉**，
 * 否则模型反复去试按当前档位已不可能成功的工具，而省掉这一轮往返正是本层存在的理由。
 * 实现上有三处刻意的选择：
 *
 *   - **只按 `event.type` 过滤，不读载荷**。档位由 {@link resolveSessionTier} 从服务现读，那份
 *     fold 才是唯一真相；读 `event.data.mode` 等于给同一个事实造第二份来源，而且
 *     `session/event` 的信封是 `{ type, seq, time, data }`——codegraph `CG66` 正是顶层读
 *     `event.name` 让采集器静默归零了几个月。这里只碰顶层 `type`，载荷一个字不看。
 *   - **合并到 microtask**。一次 UI 切档最多写三条旋钮事件（preset 自己一条 + 它展开的两个旋钮），
 *     逐条重算等于一次切档下发三轮限制；而工具表是在**请求构建时**才投影给模型的，microtask
 *     一定跑在下一次模型调用之前，所以合并不改变「何时生效」。
 *   - **只重算这个会话**。档位是会话级旋钮，别的会话的工具面不该被这一次切换碰一下。
 *
 * **安全仍然不受影响**：裁剪只是把按当前档位不可能成功的工具摘掉；即使某次事件没到、错过了重算，
 * 调用照样被 `attachTierGate` 逐调用按实时档位拦住。
 */
import type { Context } from '@deepseek-ai/cordis';
import type { TierClass, TierContext } from './tier-gate.js';
/** `schemas()` 投影里本模块只用到的字段（`name` 是唯一的键）。 */
interface ToolSchemaLike {
    name?: unknown;
}
/**
 * `tools` 服务在本模块用到的两个方法（结构化声明——本包不依赖宿主包的类型）。
 *
 * `schemas` 是公开方法（`dsh-tools/lib/types/index.d.ts`），**不传 scope = 全局视图**：
 * 拿它取真实名字，再自己按前缀 / 分类表过滤，就是「前缀裁剪」的正确姿势（`restrict` 本身
 * 只认精确名字，没有通配）。
 */
export interface ToolsServiceLike {
    schemas(scope?: unknown): ReadonlyArray<ToolSchemaLike>;
    restrict?(filter: {
        allow?: readonly string[];
        deny?: readonly string[];
    }): () => void;
}
/** agent 事件里用到的最小形状（与 codegraph `AgentLike` 同款：字段全可选，结构化不依赖 dsh-agent）。 */
export interface AgentLike {
    id?: unknown;
    session?: unknown;
    ctx?: unknown;
}
/** `attachTierRestrict` 的选项。 */
export interface TierRestrictOptions {
    /** 插件 id，用于日志前缀 `[dsh-<pkg>]`。 */
    pkg: string;
    /** 本插件 agent 工具的名字前缀（如 `['tty_', 'sftp_', 'tunnel_']` / `['docker_']`）；前缀外的工具一个都不裁。 */
    prefixes: readonly string[];
    /** 工具 → 风险类（与 `attachTierGate` 同一张表）。返回 `undefined` = 名单外，不裁。 */
    classify(tool: string): TierClass | undefined;
    /** 日志出口（缺省 `console.log`，带 `[dsh-<pkg>]` 前缀）。 */
    log?(message: string): void;
}
/**
 * 需要裁掉的名字：**注册集 ∩ 分类表里非 read 的那些**（纯函数，顺序跟随 `registered`）。
 *
 * 输入必须是 `schemas()` 拿到的**真实注册名**——分类表里那些「本会话没注册」的名字
 * （条件注册的 `sftp_*` / `tunnel_*`）一旦被点名，`restrict()` 会整体抛错，所以这里以
 * 「注册集」为外层循环、分类表只用来问类别。
 */
export declare function tierRestrictedNames(registered: readonly string[], classify: (tool: string) => TierClass | undefined, prefixes?: readonly string[]): string[];
/**
 * 这一档要不要裁剪。三条 `false` 与 `decideTierCall` 的 allow 硬分支**一一对应**
 * （服务未组合 / auto review / 完全权限）：那三支下工具本来就能用，藏起来是另一种行为。
 *
 */
export declare function shouldRestrictForTier(tier: TierContext): boolean;
/**
 * 在插件作用域上接管 `agent/created`：按会话档位给每个 agent 的 scope 下一层工具限制，
 * 返回撤销函数（撤掉所有已下发的限制 + 退订）。**全程不抛**——`agent/created` 是 serial
 * 派发，在这里抛会让会话创建失败，而工具裁剪只是省一轮往返，没有资格让会话起不来。
 *
 * 生命周期：与工具注册同一个 `ctx.effect`（插件禁用 / 卸载时一起撤）。**不要放进
 * `registerAll`**：热应用配置会重注册工具，而重注册不该把已有 agent 的裁剪一并撤掉
 * （`agent/created` 不会为老 agent 再发一次，撤了就再也裁不回来）。
 *
 * 挂载时还会用 `ctx.inject(['agents'])` 把**在活的** agent 补进台账（`agents.list()`），
 * 并立刻应用一次。原因：插件热重载 / 升级时，旧实例的 disposer 已经把所有限制撤掉了，而
 * `agent/created` 不会为已存在的会话再发一次——不补这一步，升级后那些会话会一直看到全部
 * 工具（A 的裁剪也一起失效），直到会话重开。服务缺失（老宿主）时退化成只依赖 `agent/created`。
 */
export declare function attachTierRestrict(ctx: Context, options: TierRestrictOptions): () => void;
export {};
