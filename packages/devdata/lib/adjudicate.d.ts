/**
 * 操作级裁决器：本包能力的**单一入口**。
 *
 * ## 职责边界
 *
 * 它只做判定，**不执行任何东西**：不发连接、不跑语句、不碰 docker、不读文件。
 * 这样它能在没有真机、没有凭证的情况下被完整测试——而「判定对了没有」正是这个套件最容易
 * 悄悄错掉的地方（外层闸门看着很严、实际从旁边那条连接绕过去）。
 *
 * ## 四道判据与它们的顺序（顺序本身就是契约）
 *
 * 1. **环境**：未标注 / 生产档 → 写类直接拒（`env.ts`）。放最前面是因为它是「本套件不用于生产」
 *    的唯一技术手段，任何后续判据都不能绕过它；
 * 2. **作用域**：当前目录不在 `scopeDirs` 内 → 拒（`scope.ts`）；
 * 3. **矩阵**：未登记 → 拒；`never` 档 → 拒（**应该是「不存在入口」，能走到这里说明注册面漏了**）；
 * 4. **能力**：写类操作必须有能力规格（没接闸门 = 不放行），且需获宿主授权。
 *
 * 第 4 条的「没接闸门 = 不放行」是刻意的：如果「忘了给写操作配能力」的默认结果是放行，
 * 那么每新增一条写路径都是一次静默的安全降级。方向必须反过来。
 *
 * 判据出处见 `docs/devdata-plan.md` §3.1–§3.6。
 */
import type { CapabilitySpec } from '@hyzyn/dsh-kit';
import { type CredentialSourceSpec } from './credential.js';
import { type DevEnv } from './env.js';
import { type Engine, type OperationClass } from './operations.js';
import { type RejectionCode } from './rejection.js';
/** 一个数据 / 服务的访问目标。 */
export interface DevDataTarget {
    /** 稳定 id（工具参数与配置都用它）。 */
    id: string;
    /** 显示名。 */
    label: string;
    engine: Engine;
    /** 环境档位。**缺省 `unknown`**——没标注就是不知道，不是 `test`。 */
    env?: DevEnv;
    /** 允许访问的目录；**空 / 缺失 = 处处拒绝**。 */
    scopeDirs?: readonly string[];
    /**
     * 写类操作所需的宿主侧能力。
     *
     * **不给 = 写类一律不放行**（矩阵里声明的 `capabilityEnv` 也要在这里出现才算接入）。
     * 中间件操作面（发送 / 建删 topic）也用这一条——它同样是写类，只是闸门单列一个能力名。
     */
    writeCapability?: CapabilitySpec;
    /** 危险读（`keys` / `monitor`）所需的能力。不给 = 不放行。 */
    dangerousReadCapability?: CapabilitySpec;
    /** 凭证引用（如 `env:NAME` / `keychain:REF`）。**永不存明文**。 */
    credentialRef?: string;
}
/** 一次操作请求。 */
export interface OperationRequest {
    target: DevDataTarget;
    action: string;
    /** 当前工作目录（作用域判据用；内核不读 `process.cwd()`，便于测试）。 */
    cwd: string;
    /** 调用方是否已经完成二次确认（不可逆操作要求）。 */
    confirmed?: boolean;
    /**
     * 调用方给出的**更严档位**（可选）。
     *
     * 存在的理由：矩阵的键是**动作名**，而参数级命令的档位由解析层按**参数**定——
     * `INFO ALL` 与 `INFO memory` 都映射到动作 `info`，但前者一次吐出全部节（含客户端与命令统计），
     * 是危险读。矩阵里 `info` 是普通读，于是「按参数分档」在裁决层被悄悄抹平，
     * **危险读能力闸门根本没走**（§3.6 的失败模式之一：从旁边那条路绕过去）。
     *
     * 语义是**只能更严，不能更松**：取值走 `stricterClass(matrixKind, operationClass)`，
     * 传一个更宽的档位不会换来放行。
     */
    operationClass?: OperationClass;
}
/** 判定结果。 */
export type Decision = {
    allowed: true;
    target: DevDataTarget;
    action: string;
    requiresConfirm: boolean;
} | {
    allowed: false;
    target: DevDataTarget;
    action: string;
    code: RejectionCode;
    message: string;
    hint?: string;
};
/**
 * 每一条码对应的「怎么改」——这是给 agent 的恢复路径，写不出恢复路径就不该有这条拒绝。
 *
 * `kind` 是**实际生效**的档位：否则「按参数升级成危险读」的命令（`INFO ALL`）撞到闸门时，
 * 给出的授权指引会指向另一个能力（甚至给不出指引），agent 只会原样重试。
 *
 * **导出**是给 `tool.ts` 用的：`CONFIRMATION_REQUIRED` 这条拒绝由工具层发出（裁决的答案是
 * 「允许，但要确认」，而「没给确认」是调用姿势的问题，不是判据的问题）。两处各写一份恢复路径
 * 必然漂——所以同一个码永远走同一个函数。
 */
export declare function rejectionHint(code: RejectionCode, target: DevDataTarget, action: string, kind: OperationClass, 
/**
 * 被判定作用域的那个目录（可选）。
 *
 * 为什么要传：`cwd` 缺省是**宿主进程的工作目录**，不是 agent 会话所在的项目目录。本机宿主从
 * `~` 启动，于是「不传 cwd」在作用域收敛到某个项目目录时**必然**被拒——而原先的恢复路径只说
 * 「在允许目录内重试」，**没说你刚才被判的是哪个目录**，agent 只能猜（2026-10-02 真机实测：
 * 那边第一次 `PING` 就撞了它）。
 */
cwd?: string): string | undefined;
/**
 * 裁决一次操作。
 *
 * 纯函数：只读 `target` 与 `cwd`，副作用只有读能力存储（`capabilityGranted` 会读一次授权文件，
 * 那是 kit 的既有语义——撤销要立刻生效，不能缓存）。
 */
export declare function adjudicate(request: OperationRequest): Decision;
/**
 * 这条能力**由哪条通道**授权（`undefined` = 未授权）。
 *
 * 给界面与 `capabilities` 工具用：必须能区分「启动环境授权」与「就地确认授权」——后者的提示语
 * 完全不同（写错会让用户点一个永远点不动的按钮）。口径与 `kit` 的 `capabilityGrantVia` 一致。
 */
export declare function grantChannel(spec: CapabilitySpec | undefined): 'env' | 'file' | undefined;
/** 目标凭证的保护强度（给界面与 `capabilities` 工具用，不把「方便」说成「防护」）。 */
export declare function credentialStatus(ref: string | undefined): CredentialSourceSpec | undefined;
/** 这个目标的凭证是否构成防护（`false` = 快照里必须如实标注，不能写「已配置」就算完）。 */
export declare function credentialIsProtective(ref: string | undefined): boolean;
/** 目标当前可用档位的快照（**不含任何凭证明文**；只回是否设置与保护强度）。 */
export interface TargetSnapshot {
    id: string;
    label: string;
    engine: Engine;
    env: DevEnv;
    envLabel: string;
    allowsWrite: boolean;
    requiresConfirm: boolean;
    credentialSet: boolean;
    credentialProtective: boolean;
    credentialNote?: string;
    scopeDirs: readonly string[];
    scopeConfigured: boolean;
}
/** 造一个目标快照。给 `list_targets` / `capabilities` 工具与设置卡片共用。 */
export declare function snapshotTarget(target: DevDataTarget): TargetSnapshot;
