/**
 * 插件工具的**会话权限档位闸**（tier gate）。
 *
 * ## 这一层要解决的问题
 *
 * DSH 会话有权限档位菜单（仅可查看 / 工作区内修改 / 完全权限 / Auto review），它只约束宿主
 * 自带的 bash / fs 工具；本仓插件的 agent 工具（`tty_*` / `sftp_*` / `tunnel_*` / `docker_*`）
 * 完全不受档位约束——`tty_run` / `tty_send` 是**无沙箱**的任意命令执行面，模型用它跑 bash 被
 * 沙箱拒绝的同一条命令会直接生效。本模块把档位接进插件工具：**每次调用**解析会话的有效档位
 * （`sandbox/mode` × `approval/policy` 两个会话旋钮），按「分类表 × 档位」矩阵决定 放行 / 询问 /
 * 拒绝。方案与运行时证据见 `docs/permission-tier-plan.md`（仓内路径，随包发布后不保证可点）。
 *
 * ## 两层的分工（与 capability.ts 的关系）
 *
 * `allowMutations` / `allowExec` / `allowProxyCommand`（capability.ts）管**注册不注册**：宿主级、
 * 启动期判定、带外授权、持久生效。本模块管**已注册的这一次调用放不放行**：逐调用、会话级、
 * 随档位即时变。双层并存，先注册后闸——谁也不取代谁。
 *
 * ## 约定
 *
 * 1. **只读旋钮，不读档位名**：preset 键名（`readOnly` 之类）是部署配置不是契约；唯一读名字的
 *    地方是 auto 检测（`permissionPresets.current(session) === 'auto'`），服务缺了就按矩阵走。
 * 2. **完全权限档零询问**（`decideTierCall` 的硬分支）：该档的审批策略是 `never`，此时返回
 *    `ask` 会被宿主确定性拒绝——不是保守，是把工具问死的事故。
 * 3. **服务未组合 = 不闸**（与今天的现状一致），但 `attachTierGate` 会打一行启动审计；
 *    调用期解析**抛错**同样按现状放行并打告警——档位闸宁可退化成现状，不砖掉工具面。
 *    这两条边界都写进了各包 README 的安全假设。
 * 4. **监听器永不 claim `allow`**：要么 `next()` 透传，要么返回 `deny` / `ask`。插件只是
 *    拦截人，不是放行人——auto review 等同瀑布的其它监听者不会被插件短路。
 * 5. **deny / ask 的文案**：模型要能分清「档位拒绝」（本模块）与「审批拒绝」（宿主
 *    `serviceAsk`）与「静态能力未授权」（capability.ts 的 400 文案）。ask 不由插件记审计——
 *    `approval/asked` + `approval/decided` 成对落会话日志是宿主的职责。
 * 6. **分类表归插件**：kit 不知道工具名；`classify` 由插件传入，返回 `undefined`（名单外）=
 *    放行 + 每工具名一条告警。名单对账由各包守卫测试从注册处现算（漏分类 → 测试红）。
 */
import type { Context } from '@deepseek-ai/cordis';
/** 工具的风险类：`read` 纯读；`write` 有界变更；`exec` 无界命令面（本机或远程 shell、监听端口）。 */
export type TierClass = 'read' | 'write' | 'exec';
/** 会话沙箱档（`@deepseek-ai/dsh-sandbox` 的 `SandboxMode`，结构化重声明——kit 不依赖宿主包）。 */
export type TierMode = 'read-only' | 'workspace-write' | 'danger-full-access';
/** 会话审批策略（`@deepseek-ai/dsh-user-approval` 的 `ApprovalPolicy`）。 */
export type TierPolicy = 'ask' | 'never';
/** 档位闸依赖的两个宿主服务各自是否已组合。 */
export interface TierServices {
    sandboxPolicy: boolean;
    approval: boolean;
}
/** 一次调用解析出的会话档位。 */
export interface TierContext {
    mode: TierMode;
    policy: TierPolicy;
    /** Auto review（实验）档：宿主的模型预审已在逐调用审查，插件让位（等同 allow）。 */
    auto: boolean;
    services: TierServices;
}
/** 档位闸对一次调用的决定。 */
export type TierDecision = {
    action: 'allow';
} | {
    action: 'deny';
    reason: string;
} | {
    action: 'ask';
    reason: string;
};
/**
 * 档位闸捕获的宿主服务（结构化形状——kit 不依赖宿主包）。
 *
 * 为什么是**捕获的引用**而不是每次 `ctx.get`：cordis 的服务读取有 inject 守卫——插件作用域
 * 对未声明 inject 的**已注册服务**调 `ctx.get(name)` 直接抛
 * `cannot get property "<name>" without inject`（2026-10-07 真机实测）。宿主侧的合法可选读取
 * 通道是 `ctx.inject(['<名>'], cb)`（'tools' / 'credentials' 的既有先例）：服务存在时回调收到
 * 一个以服务名为属性的上下文，缺失时回调不触发。`attachTierGate` 用三条 inject 把服务实例
 * 捕获进 `TierServicesSnapshot`，逐次调用只用捕获的引用——不再碰 `ctx.get`。
 */
export interface TierServicesSnapshot {
    sandbox?: {
        resolve?(request?: {
            session?: unknown;
        }): {
            mode?: unknown;
        } | undefined;
    };
    approval?: {
        overrideOf?(session: unknown): unknown;
        config?: {
            policy?: unknown;
        };
    };
    /** 纯可选：只在 auto review 档检测用，缺了 = auto 恒 false，矩阵照走。 */
    presets?: {
        current?(session: unknown): unknown;
    };
}
/**
 * 读一次会话的有效档位。**每次调用都要重新读**：档位是会话级旋钮（会话事件折叠），用户切档后
 * 下一个调用就要按新档走，没有任何缓存的位置。快照里的服务引用由 `attachTierGate` 在宿主
 * 组合期捕获一次，引用本身不换——会话状态在服务内部，拿引用读到的就是实时值。
 *
 * @param snapshot - 捕获的宿主服务；缺谁 `services` 里就报谁（`sandbox` 缺 = 整闸不生效）。
 * @param session - 调用方 agent 的会话（`exec.agent.session`）。`undefined`（agentless）取**严侧**：
 *   无会话即无审批通道（宿主 `serviceAsk` 对 agentless 一律拒绝），policy 视作 `never`。
 */
export declare function resolveSessionTier(snapshot: TierServicesSnapshot, session: unknown): TierContext;
/**
 * 决策矩阵本体（方案 §2.2，纯函数）。唯一判定处——行为上的任何改动都只应该发生在这里。
 */
export declare function decideTierCall(tier: TierContext, cls: TierClass, tool: string): TierDecision;
/** ask 的 reason（给人看的一句话；工具调用的参数已由宿主挂在弹窗上，这里不重复）。 */
export declare function tierAskReason(input: {
    tool: string;
    mode: TierMode;
}): string;
/** deny 的 reason（档位拒绝那一支；审批拒绝的措辞归宿主）。 */
export declare function tierDenialReason(input: {
    tool: string;
    mode: TierMode;
    policy: TierPolicy;
    /** `exec` 类补一条 bash 指路（它走沙箱与升级通道，是被沙箱约束的合法替身）。 */
    cls?: TierClass;
}): string;
/** 启动审计行：服务组合是宿主装配期事实，attach 与每次捕获到新服务时各打一行。 */
export declare function tierGateStartupLine(services: TierServices): string;
/** `attachTierGate` 的选项。 */
export interface TierGateOptions {
    /** 插件 id，用于日志前缀 `[dsh-<pkg>]`。 */
    pkg: string;
    /** 本插件 agent 工具的名单前缀（如 `['tty_', 'sftp_', 'tunnel_']`）；名单外一个都不碰。 */
    prefixes: readonly string[];
    /**
     * 工具 → 风险类。返回 `undefined` 表示名单外：放行 + 每工具名一条告警（对账由守卫测试兜底，
     * 运行期不许因为漏分类就拦死工具）。
     */
    classify(tool: string, args: unknown): TierClass | undefined;
    /** 日志出口（缺省 `console.log`，带 `[dsh-<pkg>]` 前缀）。 */
    log?(message: string): void;
}
/**
 * 在插件作用域上挂 `tools/pre-execute` 监听并返回注销函数。**与工具注册同生命周期**：
 * 插件禁用热生效时随工具一起撤下（tty 进 `activeDisposers`、docker 进 `toolDisposers`）。
 *
 * 服务读取走 **`ctx.inject(['<名>'], cb)`**（可选服务的宿主合法通道，'tools' / 'credentials'
 * 先例）：服务存在时回调把实例捕获进快照、缺失时回调不触发——闸随捕获进度自动从「不闸」
 * 切到「生效」，每次状态变化打一行审计。为什么不用 `ctx.get`：cordis 对插件作用域读未声明
 * inject 的已注册服务直接抛（`without inject`，2026-10-07 真机实测），详见
 * `TierServicesSnapshot` 的注释。
 *
 * `ctx.on` 对插件作用域可达的先例是 codegraph 的 `session/event` 收集器；若宿主某代不可达，
 * 打一行审计后返回空注销函数——退化成现状，不抛错。attach 本身**全程不抛**，插件 apply
 * 不能被闸门带下去。
 */
export declare function attachTierGate(ctx: Context, options: TierGateOptions): () => void;
