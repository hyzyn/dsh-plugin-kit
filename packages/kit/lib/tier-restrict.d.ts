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
 * 安全边界**——裁剪名单漏了谁、工具在会话建立之后才注册，都只影响「模型看不看得见」，不构成越权
 * （调用照样被 `attachTierGate` 按档位拦住）。这也是本模块敢在 `agent/created` 只裁一次的原因。
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
 * 2. **完全权限 / auto review 档不裁剪**：这两档在 `decideTierCall` 里是 allow 硬分支，
 *    工具本来就能用；把它们藏起来等于替用户改档。判据集中在 {@link shouldRestrictForTier}。
 * 3. **只在 `agent/created` 与 `tools/change` 上重算，不跟会话中途的档位切换**：切换后执行期闸
 *    立刻按新档判，但工具面要等下一次 `agent/created` / 工具集变化才重算。
 * 4. **不碰非本插件的工具**：前缀 + 分类表双重过滤（`prefixes` 防同名跨插件误伤）。
 *
 * 第 3 条的取舍：为什么不顺手订 `session/event` 里的 `sandbox/mode`？档位是会话级旋钮，
 * 升档（只读 → 完全权限）时把工具**放回来**是有意义的，但它要求订阅会话事件、按 session
 * 找回 agent，属于下一轮（先让「建会话时裁对」这一条真机成立）。**安全不受影响**：
 * 未放回来的工具本来就出现在工具表里之前不能调用，执行期闸逐调用读实时档位。
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
 */
export declare function attachTierRestrict(ctx: Context, options: TierRestrictOptions): () => void;
export {};
