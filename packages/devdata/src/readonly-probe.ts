/**
 * 只读自证：SQL 档**唯一的硬护栏**，而且它自己不能去试写。
 *
 * ## 为什么不能用「试一次写操作」来自证
 *
 * 那是最直观的做法，也是**不能用**的做法：在共享联调环境里试写，成功就是真的写进去了。
 * 本套件的自证必须靠**读元数据**判断账号权限：
 *
 * | 引擎 | 读什么 |
 * |---|---|
 * | MySQL / MariaDB | `information_schema.USER_PRIVILEGES`、`information_schema.SCHEMA_PRIVILEGES` |
 * | PostgreSQL | `pg_has_role(current_user,'pg_write_all_data','MEMBER')`、`current_setting('transaction_read_only')`、`usesuper` |
 * | SQL Server | `IS_MEMBER('db_datareader'/'db_datawriter')`、`IS_SRVROLEMEMBER('sysadmin')` |
 * | 达梦 | `USER_TAB_PRIVS` / `DBA_ROLE_PRIVS`（照 Oracle 口径） |
 *
 * ## 缺证 = 拒绝启用（fail closed）
 *
 * 判据只有一条：**必须拿到「这个账号写不了」的正面证据**。拿不到就**拒绝启用这一档**——
 * 不是警告后继续。方向与 `credential.ts`（认不出按「不防护」处理）、`env.ts`（不认识回落
 * `unknown`）一致：**假设它防护 / 假设它可写，都是危险的那一侧**。
 *
 * ## 一处诚实的边界
 *
 * 「账号只读」是**账号级**事实；而 `session_read_only`（如 PostgreSQL 的
 * `BEGIN READ ONLY`）是**连接级**事实。两者不等价——一份可写账号上的只读会话，
 * 换个连接就又能写了。所以本模块把账号级证据作为**必要条件**，会话级只作为**附加层**
 * 如实报告，不让它单独构成「已自证」。
 */

import type { Engine } from './operations.js'

/** 自证覆盖到的层。 */
export type ReadOnlyLayer = 'account' | 'session' | 'not-superuser' | 'unknown'

/** 引擎报回来的权限事实（由引擎实现填；**全部来自读元数据**）。 */
export interface ReadOnlyFacts {
  engine: Engine
  /** 账号级：有没有「写不了」的正面证据（`undefined` = 查不到 / 查不动）。 */
  accountReadOnly?: boolean
  /** 会话级：这条连接是不是只读事务（`undefined` = 不适用或查不到）。 */
  sessionReadOnly?: boolean
  /** 账号是不是超级用户（超级用户会绕过权限检查，即便「没有写权限」也不可信）。 */
  superuser?: boolean
  /** 证据原文（给人看；**不含凭证明文**）。 */
  evidence?: readonly string[]
}

/** 自证结论。 */
export type ReadOnlyVerdict =
  | { enabled: true; layers: ReadOnlyLayer[]; evidence: readonly string[] }
  | { enabled: false; reason: ReadOnlyRejection; message: string; hint: string; layers: ReadOnlyLayer[] }

/** 拒绝原因。 */
export type ReadOnlyRejection =
  /** 引擎不支持自证（如 Redis 没有账号级只读概念——那一档靠命令白名单）。 */
  | 'ENGINE_UNSUPPORTED'
  /** 账号其实是可写的。 */
  | 'ACCOUNT_WRITABLE'
  /** 账号是超级用户：权限检查对它不生效，不能当作只读。 */
  | 'SUPERUSER'
  /** 拿不到证据（查不动 / 字段缺失）——**缺证即拒**。 */
  | 'EVIDENCE_MISSING'

/** 有账号级只读概念的引擎。Redis / RocketMQ 不在其中（它们各自靠别的机制）。 */
export const READONLY_PROBE_ENGINES: readonly Engine[] = ['mysql', 'postgres', 'sqlserver', 'dm']

/**
 * 判定能否启用 SQL 只读档。
 *
 * 判据顺序（**先看有没有资格自证，再看证据**）：
 * 1. 引擎不支持 → `ENGINE_UNSUPPORTED`；
 * 2. 超级用户 → `SUPERUSER`（**先于账号证据**：超级用户即便报「没有写权限」也不可信，
 *    因为它绕过权限检查。这条顺序是刻意的）；
 * 3. 明确可写 → `ACCOUNT_WRITABLE`；
 * 4. 拿不到证据 → `EVIDENCE_MISSING`（缺证即拒）。
 */
export function verdictReadOnly(facts: ReadOnlyFacts): ReadOnlyVerdict {
  const layers: ReadOnlyLayer[] = []
  const evidence = facts.evidence === undefined ? [] : [...facts.evidence]

  if (!READONLY_PROBE_ENGINES.includes(facts.engine)) {
    return {
      enabled: false,
      reason: 'ENGINE_UNSUPPORTED',
      message: `${facts.engine} 没有账号级只读概念，无法用本机制自证`,
      hint: '该引擎的「受限」靠命令白名单（见操作矩阵），不要按 SQL 只读档来配',
      layers,
    }
  }

  if (facts.superuser === true) {
    layers.push('not-superuser')
    return {
      enabled: false,
      reason: 'SUPERUSER',
      message: '该账号是超级用户：权限检查对超级用户不生效，因此不能当作只读账号',
      hint: '请换一个非超级用户的只读账号（只授予 SELECT / 读元数据所需的权限）',
      layers,
    }
  }
  if (facts.superuser === false) layers.push('not-superuser')

  if (facts.accountReadOnly === false) {
    layers.push('account')
    return {
      enabled: false,
      reason: 'ACCOUNT_WRITABLE',
      message: '该账号**能写**（元数据显示有写权限），不满足 SQL 只读档的硬护栏',
      hint: '请让运维建一个只读账号（只读权限、非超级用户），或改用不限写的目标环境',
      layers,
    }
  }

  if (facts.accountReadOnly !== true) {
    return {
      enabled: false,
      reason: 'EVIDENCE_MISSING',
      message: '拿不到「该账号写不了」的正面证据（查不动元数据，或字段缺失）',
      hint: '缺证即拒（方向与「认不出的凭证按不防护处理」一致）：请确认该账号能读到权限元数据，或提供明确的只读证据',
      layers,
    }
  }

  layers.push('account')
  // 会话级只作为**附加层**如实报告，不让它单独构成「已自证」。
  if (facts.sessionReadOnly === true) layers.push('session')
  return { enabled: true, layers, evidence }
}

/** 一句话摘要（给 `doctor` 的输出用）。 */
export function readOnlySummary(verdict: ReadOnlyVerdict): string {
  if (verdict.enabled) {
    return `只读自证通过（层：${verdict.layers.join(' / ')}）`
  }
  return `只读自证未通过（${verdict.reason}）：${verdict.message}`
}
