/**
 * 审计出口（`docs/devdata-plan.md` §5 末：一条 JSON 行 / 调用，**含被拒绝的尝试与超时**）。
 *
 * ## 实现已上收到 `@hyzyn/dsh-kit/audit`（2026-10-03）
 *
 * `devfront` 与 `devenv` 随后也要同一件事，按本仓「第三个消费者出现就上收」的规矩把它搬进了 `kit`。
 * 这一份只剩**本包的话术**（`auditText`）与类型绑定——`appendFileSync` 的写法、fail-closed 的那句
 * 文案、JSON 行的键序规则，全仓只有一处（那种东西两处各写一份必然漂）。
 *
 * 语义没变，仍然两条：
 *
 * - `createJsonlAuditSink`：**持久**。写失败 = 抛（详见 `kit` 那份的文件头：为什么宁可拒绝也不要
 *   一个不成立的保证）。
 * - `createLoggerAuditSink`：只进宿主日志，**不持久**（日志会被轮转、也未必落盘）。它存在的意义是
 *   「没有配 `auditFile` 时至少别什么都不记」，而 `capabilities` / `doctor` 必须把「只有日志、
 *   没有持久记录」如实标出来——写类操作在那种配置下会被拒（见 `plugin.ts`）。
 */

import {
  auditLine as kitAuditLine,
  createJsonlAuditSink as kitJsonlAuditSink,
  createLoggerAuditSink as kitLoggerAuditSink,
  type AuditLoggerLike,
} from '@hyzyn/dsh-kit/audit'

import type { AuditEntry, AuditSink } from './tool.js'

export type { AuditLoggerLike }

/** 一条审计行（**字段顺序固定**）——实现与键序规则见 `@hyzyn/dsh-kit/audit`。 */
export function auditLine(entry: AuditEntry): string {
  return kitAuditLine(entry)
}

/** 一句人话（日志出口用）。 */
export function auditText(entry: AuditEntry): string {
  const code = entry.code === undefined ? '' : ` (${entry.code})`
  const op = entry.operationId === undefined ? '' : ` op=${entry.operationId}`
  return `[dsh-devdata] ${entry.allowed ? '允许' : '拒绝'} ${entry.action} @${entry.targetId}${code}${op}`
}

/** JSON 行审计出口（持久）。 */
export function createJsonlAuditSink(file: string, options: { ensureDir?: boolean } = {}): AuditSink {
  return kitJsonlAuditSink<AuditEntry>(file, options)
}

/** 只进宿主日志的出口（**不持久**）。 */
export function createLoggerAuditSink(logger: AuditLoggerLike): AuditSink {
  return kitLoggerAuditSink<AuditEntry>(logger, { tag: 'dsh-devdata', render: auditText })
}
