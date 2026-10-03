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

import { capabilityGranted, capabilityHowTo, capabilityGrantVia } from '@hyzyn/dsh-kit'
import type { CapabilitySpec } from '@hyzyn/dsh-kit'

import { credentialSource, isProtective, parseCredentialRef, type CredentialSourceSpec } from './credential.js'
import { envFacts, normalizeEnv, type DevEnv } from './env.js'
import { isNeverOperation, lookupOperation, stricterClass, type Engine, type OperationClass } from './operations.js'
import { REJECTION_CODES, rejection, type Rejection, type RejectionCode } from './rejection.js'
import { decideScope } from './scope.js'

/** 一个数据 / 服务的访问目标。 */
export interface DevDataTarget {
  /** 稳定 id（工具参数与配置都用它）。 */
  id: string
  /** 显示名。 */
  label: string
  engine: Engine
  /** 环境档位。**缺省 `unknown`**——没标注就是不知道，不是 `test`。 */
  env?: DevEnv
  /** 允许访问的目录；**空 / 缺失 = 处处拒绝**。 */
  scopeDirs?: readonly string[]
  /**
   * 写类操作所需的宿主侧能力。
   *
   * **不给 = 写类一律不放行**（矩阵里声明的 `capabilityEnv` 也要在这里出现才算接入）。
   * 中间件操作面（发送 / 建删 topic）也用这一条——它同样是写类，只是闸门单列一个能力名。
   */
  writeCapability?: CapabilitySpec
  /** 危险读（`keys` / `monitor`）所需的能力。不给 = 不放行。 */
  dangerousReadCapability?: CapabilitySpec
  /** 凭证引用（如 `env:NAME` / `keychain:REF`）。**永不存明文**。 */
  credentialRef?: string
}

/** 一次操作请求。 */
export interface OperationRequest {
  target: DevDataTarget
  action: string
  /** 当前工作目录（作用域判据用；内核不读 `process.cwd()`，便于测试）。 */
  cwd: string
  /** 调用方是否已经完成二次确认（不可逆操作要求）。 */
  confirmed?: boolean
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
  operationClass?: OperationClass
}

/** 判定结果。 */
export type Decision =
  | { allowed: true; target: DevDataTarget; action: string; requiresConfirm: boolean }
  | { allowed: false; target: DevDataTarget; action: string; code: RejectionCode; message: string; hint?: string }

/** 便于调用方与用例直接看的「这四道里是哪一道拦的」。 */
type RejectWith = { code: RejectionCode; hint?: string }

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
export function rejectionHint(
  code: RejectionCode,
  target: DevDataTarget,
  action: string,
  kind: OperationClass,
  /**
   * 被判定作用域的那个目录（可选）。
   *
   * 为什么要传：`cwd` 缺省是**宿主进程的工作目录**，不是 agent 会话所在的项目目录。本机宿主从
   * `~` 启动，于是「不传 cwd」在作用域收敛到某个项目目录时**必然**被拒——而原先的恢复路径只说
   * 「在允许目录内重试」，**没说你刚才被判的是哪个目录**，agent 只能猜（2026-10-02 真机实测：
   * 那边第一次 `PING` 就撞了它，见 **D09**）。
   */
  cwd?: string,
): string | undefined {
  switch (code) {
    case REJECTION_CODES.ENV_NOT_WRITABLE:
      return `在目标 ${target.id} 的配置里把它标注为 dev / test-isolated / test-shared；未标注或标为 production 的目标只允许读类操作`
    case REJECTION_CODES.CAPABILITY_NOT_DECLARED:
      return `目标 ${target.id} 没有为该操作接入能力闸门。这是刻意的：未接入 = 不放行。需要写能力时在目标配置里声明 writeCapability`
    case REJECTION_CODES.CAPABILITY_NOT_GRANTED: {
      const spec = capabilitySpecFor(target, kind)
      return spec === undefined
        ? undefined
        : /*
           * **不提「就地提权」**（`inPlace` 缺省 false，**D05**）：本套件今天没有客户端半体，也就没有那个
           * 开关。文案里提它，用户会去设置卡片上找一个不存在的入口——kit 的 `capabilityHowTo`
           * 专门为这件事留了 `inPlace` 选项（tty 的 `allowProxyCommand` 是同一处境）。
           * 等 P14 的面板落地、并且真的接上 `GrantStore` 之后，这里才该改成 true。
           */
          capabilityHowTo(spec) + '。未获授权前请改用只读类操作'
    }
    case REJECTION_CODES.OUT_OF_SCOPE: {
      const dirs = target.scopeDirs ?? []
      const judged = cwd === undefined ? '当前目录' : `当前目录 ${cwd}`
      const allowed =
        dirs.length === 0
          ? `目标 ${target.id} 的作用域是**空**的（= 处处拒绝，fail closed），要在配置里显式声明目录`
          : `目标 ${target.id} 只允许：${dirs.join(' / ')}`
      return (
        `${judged} 不在它的允许目录内——${allowed}。` +
        `注意 cwd 参数**缺省取宿主进程的工作目录**（不是你会话所在的项目目录）：显式传一个允许目录下的路径即可`
      )
    }
    case REJECTION_CODES.UNCLASSIFIED_OPERATION:
      return `矩阵里没有 ${target.engine} 的 ${action}；请改用已登记的操作（如 schema / search / sample / query）`
    case REJECTION_CODES.OPERATION_FORBIDDEN:
      return '该操作被明确排除在设计之外，没有入口；要改数据请走各自的运维流程'
    case REJECTION_CODES.CREDENTIAL_UNPROTECTED:
      return `把目标 ${target.id} 的凭证换成 agent 读不到的来源（钥匙串 / 凭据存储），或明确接受它已被暴露`
    case REJECTION_CODES.CONFIRMATION_REQUIRED:
      return '该操作不可逆：请先复述它将影响什么、由谁确认，再带 confirmed: true 重试'
    default:
      return undefined
  }
}

/**
 * 取这个操作在目标上对应的能力规格。
 *
 * **按 `kind` 取，不按 `capabilityEnv` 反查**：矩阵里的变量名是「这个操作属于哪一类闸门」的
 * 声明，而目标上配的是「这一类闸门用哪个能力」。反查会把两件事搅在一起，而且一旦目标的规格
 * 用了别的变量名就静默取不到（→ 误报「未接入闸门」）。
 *
 * `kind` 取的是**实际生效**的档位（`stricterClass` 的结果），不是矩阵里那一个——否则被解析层
 * 升级成危险读的命令会在这里退回普通读、闸门又不走。
 */
function capabilitySpecFor(target: DevDataTarget, kind: OperationClass): CapabilitySpec | undefined {
  if (kind === 'write-scoped') return target.writeCapability
  if (kind === 'read-dangerous') return target.dangerousReadCapability
  return undefined
}

/**
 * 裁决一次操作。
 *
 * 纯函数：只读 `target` 与 `cwd`，副作用只有读能力存储（`capabilityGranted` 会读一次授权文件，
 * 那是 kit 的既有语义——撤销要立刻生效，不能缓存）。
 */
export function adjudicate(request: OperationRequest): Decision {
  const { target, action, cwd, confirmed } = request
  const env = normalizeEnv(target.env)
  const facts = envFacts(env)

  /**
   * 实际生效的档位。
   *
   * 先算出来是为了让 `deny` 也能用上：`never` / 未登记这两条分支要报「不存在」这个更强的事实，
   * 那一刻还没有矩阵登记项可查，档位就按调用方给的（或 `read`）算——这两条分支都不看档位。
   */
  const kindOf = (matrixKind: OperationClass): OperationClass => stricterClass(matrixKind, request.operationClass)

  const deny = (withCode: RejectWith, kind: OperationClass = 'read'): Decision => {
    const hint = withCode.hint ?? rejectionHint(withCode.code, target, action, kind, cwd)
    const base: Rejection = rejection(withCode.code, hint)
    return { allowed: false, target, action, ...base }
  }

  // ① 先看是不是被明确排除的（`never`）。它要能独立于环境回答——否则「未标注环境」会把
  //    「这个操作根本不存在」这个更强的事实盖掉，界面上给出的指引也会错。
  if (isNeverOperation(target.engine, action)) {
    return deny({ code: REJECTION_CODES.OPERATION_FORBIDDEN })
  }

  const spec = lookupOperation(target.engine, action)
  // ② 未登记的一律拒（不是「默认放行」）。
  if (spec === undefined) {
    return deny({ code: REJECTION_CODES.UNCLASSIFIED_OPERATION })
  }

  // ③ 作用域（读类也要过：本套件存在的场景里混着共享联调环境）。
  const scope = decideScope(target.scopeDirs, cwd)
  if (!scope.allowed) {
    return deny({ code: REJECTION_CODES.OUT_OF_SCOPE })
  }

  // ④ 算出**实际生效**的档位：矩阵档位与调用方给的档位取更严的那一个。
  //
  //    这一步是参数级命令（`INFO ALL`）能真正走闸门的原因，见 `OperationRequest.operationClass`。
  const kind = kindOf(spec.kind)

  // ⑤ 普通读：放行（`read-dangerous` 不算「读类」，见下）。
  if (kind === 'read') {
    return { allowed: true, target, action, requiresConfirm: false }
  }

  // ⑥ 危险读：只读但不可逆（阻塞 / 抓别人的数据），要单独能力。
  if (kind === 'read-dangerous') {
    const cap = capabilitySpecFor(target, kind)
    if (cap === undefined) return deny({ code: REJECTION_CODES.CAPABILITY_NOT_DECLARED }, kind)
    if (!capabilityGranted(cap)) return deny({ code: REJECTION_CODES.CAPABILITY_NOT_GRANTED }, kind)
    return { allowed: true, target, action, requiresConfirm: spec.requiresConfirm && confirmed !== true }
  }

  // ⑦ 写类：**环境判据在最前**。
  //
  //    顺序是刻意的，而且是可验收的不变量（plan §3.1 不变量 2）：**未标注 / 生产档的目标，
  //    写类一律拒绝，且报的必须是环境这一条**。如果把能力判定放在它前面，「目标没配能力规格」
  //    就会盖掉「这个环境根本不许写」——不变量 2 会退化成一句只在特定配置下才成立的承诺。
  if (!facts.allowsWrite) {
    return deny({ code: REJECTION_CODES.ENV_NOT_WRITABLE }, kind)
  }
  const cap = capabilitySpecFor(target, kind)
  if (cap === undefined) {
    return deny({ code: REJECTION_CODES.CAPABILITY_NOT_DECLARED }, kind)
  }
  if (!capabilityGranted(cap)) {
    return deny({ code: REJECTION_CODES.CAPABILITY_NOT_GRANTED }, kind)
  }
  const needsConfirm = spec.requiresConfirm || facts.requiresConfirm
  return { allowed: true, target, action, requiresConfirm: needsConfirm && confirmed !== true }
}

/**
 * 这条能力**由哪条通道**授权（`undefined` = 未授权）。
 *
 * 给界面与 `capabilities` 工具用：必须能区分「启动环境授权」与「就地确认授权」——后者的提示语
 * 完全不同（写错会让用户点一个永远点不动的按钮）。口径与 `kit` 的 `capabilityGrantVia` 一致。
 */
export function grantChannel(spec: CapabilitySpec | undefined): 'env' | 'file' | undefined {
  if (spec === undefined) return undefined
  return capabilityGrantVia(spec)
}

/** 目标凭证的保护强度（给界面与 `capabilities` 工具用，不把「方便」说成「防护」）。 */
export function credentialStatus(ref: string | undefined): CredentialSourceSpec | undefined {
  return parseCredentialRef(ref)
}

/** 这个目标的凭证是否构成防护（`false` = 快照里必须如实标注，不能写「已配置」就算完）。 */
export function credentialIsProtective(ref: string | undefined): boolean {
  const spec = credentialStatus(ref)
  return spec !== undefined && isProtective(spec)
}

/** 目标当前可用档位的快照（**不含任何凭证明文**；只回是否设置与保护强度）。 */
export interface TargetSnapshot {
  id: string
  label: string
  engine: Engine
  env: DevEnv
  envLabel: string
  allowsWrite: boolean
  requiresConfirm: boolean
  credentialSet: boolean
  credentialProtective: boolean
  credentialNote?: string
  scopeDirs: readonly string[]
  scopeConfigured: boolean
}

/** 造一个目标快照。给 `list_targets` / `capabilities` 工具与设置卡片共用。 */
export function snapshotTarget(target: DevDataTarget): TargetSnapshot {
  const env = normalizeEnv(target.env)
  const facts = envFacts(env)
  const cred = credentialStatus(target.credentialRef)
  return {
    id: target.id,
    label: target.label,
    engine: target.engine,
    env,
    envLabel: facts.label,
    allowsWrite: facts.allowsWrite,
    requiresConfirm: facts.requiresConfirm,
    credentialSet: target.credentialRef !== undefined && target.credentialRef.trim() !== '',
    credentialProtective: cred !== undefined && isProtective(cred),
    ...(cred === undefined ? {} : { credentialNote: credentialSource(cred.kind).note }),
    scopeDirs: [...(target.scopeDirs ?? [])],
    scopeConfigured: (target.scopeDirs ?? []).some((entry) => entry.trim() !== ''),
  }
}
