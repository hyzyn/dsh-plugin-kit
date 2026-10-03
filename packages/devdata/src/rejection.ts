/**
 * 拒绝码的**单一真相源**。
 *
 * 每条拒绝都必须带一个码、一句人话、以及（能给的）**恢复提示**。理由：agent 的失败模式是
 * **循环重试**——一句「未授权」不产生新信息，它只能原样再试一次。所以拒绝文案要把「怎么改」写出来
 * （照 nyetdb 那句 `rewrite the task as a read query` 的写法）。
 *
 * 本文件的 `REJECTION_CODES` 是唯一真源：用例断言「矩阵里用到的码都在这里」，
 * 新增码忘了登记就是测试红（防止文案与码各漂各的）。
 */

/** 裁决结果的状态。 */
export type DecisionStatus = 'allowed' | 'denied' | 'never'

/** 拒绝码。 */
export const REJECTION_CODES = {
  /** 目标环境未标注 / 标为不可写档，写类操作被拒。 */
  ENV_NOT_WRITABLE: 'ENV_NOT_WRITABLE',
  /** 写类操作没有携带宿主侧能力规格（未接入闸门 = 不放行）。 */
  CAPABILITY_NOT_DECLARED: 'CAPABILITY_NOT_DECLARED',
  /** 能力未获宿主授权（启动环境或带外确认都没有）。 */
  CAPABILITY_NOT_GRANTED: 'CAPABILITY_NOT_GRANTED',
  /** 操作不在任何目标的 `scopeDirs` 内。 */
  OUT_OF_SCOPE: 'OUT_OF_SCOPE',
  /** 操作未登记在矩阵里（**不认识的一律拒**）。 */
  UNCLASSIFIED_OPERATION: 'UNCLASSIFIED_OPERATION',
  /** 操作被明确排除在设计之外（`never` 档）。 */
  OPERATION_FORBIDDEN: 'OPERATION_FORBIDDEN',
  /** 目标凭证来自 agent 读得到的来源，不构成防护。 */
  CREDENTIAL_UNPROTECTED: 'CREDENTIAL_UNPROTECTED',
  /** 可逆性为「不可逆」的操作，需要逐次二次确认。 */
  CONFIRMATION_REQUIRED: 'CONFIRMATION_REQUIRED',
  /**
   * 裁决**放行了**，但执行器报错（连接被拒、语句语法错、目标侧 CLI 失败…）。
   *
   * 与上面那些码的区别：上面是**裁决层**拒绝（根本没执行），这个是**执行层**失败。
   * 两者都要进这里，因为 agent 是按码决定下一步的——「被闸门拦了」和「跑起来失败了」
   * 需要完全不同的后续动作（改查询 vs 改权限/换目标）。
   */
  EXECUTION_FAILED: 'EXECUTION_FAILED',
  /**
   * 写类操作**没有持久审计出口**，被拒。
   *
   * 这一条属于**宿主半体**（`plugin.ts`）而不是裁决器：裁决器只认「操作 × 目标 × 环境 × 能力」，
   * 它不知道宿主把审计写到哪儿。而 §5 把「写操作必开审计」写成了这一档的前提——只在文档里成立的
   * 前提等于没有，所以由宿主在调用前判它，并给出一条能照做的恢复路径。
   * **只读操作不受影响。**
   */
  AUDIT_NOT_DURABLE: 'AUDIT_NOT_DURABLE',
} as const

/** 拒绝码的取值类型。 */
export type RejectionCode = (typeof REJECTION_CODES)[keyof typeof REJECTION_CODES]

/**
 * 一条拒绝的完整信息：码 + 人话。
 *
 * `hint` 是给 agent 的**恢复路径**。写不出恢复路径的拒绝，等于让 agent 原地重试——
 * 要么想出恢复路径，要么承认这个操作不该存在（那就该进 `never`）。
 */
export interface Rejection {
  code: RejectionCode
  message: string
  hint?: string
}

/** 按码取默认人话。矩阵与用例都从这里取，避免同一句话写两遍后漂掉。 */
const MESSAGES: Record<RejectionCode, string> = {
  ENV_NOT_WRITABLE: '该目标未标注为可写环境，写类操作被拒（读类照常）',
  CAPABILITY_NOT_DECLARED: '该写类操作没有接入宿主侧能力闸门，因此不放行',
  CAPABILITY_NOT_GRANTED: '该能力未获宿主授权',
  OUT_OF_SCOPE: '当前工作目录不在该目标允许的作用域内',
  UNCLASSIFIED_OPERATION: '该操作未登记在操作矩阵里，一律拒绝',
  OPERATION_FORBIDDEN: '该操作被明确排除在设计之外，不提供入口',
  CREDENTIAL_UNPROTECTED: '该目标的凭证来自 agent 读得到的来源，不构成防护',
  CONFIRMATION_REQUIRED: '该操作不可逆，需要逐次二次确认',
  EXECUTION_FAILED: '裁决已放行，但执行失败',
  AUDIT_NOT_DURABLE: '写类操作需要一个持久的审计出口，而当前没有配置（只读操作不受影响）',
}

/** 造一条拒绝。`hint` 由调用方给具体的恢复路径。 */
export function rejection(code: RejectionCode, hint?: string): Rejection {
  const base: Rejection = { code, message: MESSAGES[code] }
  return hint === undefined ? base : { ...base, hint }
}

/** 这条码有没有登记（用例与矩阵用它做「不许写死字面量」的检查）。 */
export function isRejectionCode(value: unknown): value is RejectionCode {
  return typeof value === 'string' && (Object.values(REJECTION_CODES) as readonly string[]).includes(value)
}
