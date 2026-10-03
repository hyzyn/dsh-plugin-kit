/**
 * 审计出口（`docs/devdata-plan.md` §5 末：一条 JSON 行 / 调用，**含被拒绝的尝试与超时**）。
 *
 * ## 为什么写不进去就不返回结果
 *
 * 审计记的是「agent **试过什么**」——那是共享联调环境里唯一能事后回答「谁在什么时候动了什么」的
 * 东西。而它最容易失败的时机恰好是最需要它的时候：盘满、目录权限变了、路径写错。若这时「操作照做、
 * 记录没有」，审计就从一条**保证**退化成一句口号。
 *
 * 所以本模块的 JSONL 出口**让异常直接冒出去**（内核 `invokeTool` 里 `audit.record()` 是同步调用，
 * 抛出去就会中断本次调用，宿主半体再把它变成 agent 看到的一句错）。这与 `capability.ts` 的
 * 「HTTP 不能凭空提权」是同一种取向：**宁可拒绝，也不要一个不成立的保证**。
 *
 * ## 两个出口的区别必须说清
 *
 * - `createJsonlAuditSink`：**持久**。写失败 = 抛。
 * - `createLoggerAuditSink`：只进宿主日志，**不持久**（日志会被轮转、也未必落盘）。
 *   它存在的意义是「没有配 `auditFile` 时至少别什么都不记」，而 `capabilities` / `doctor`
 *   必须把「只有日志、没有持久记录」如实标出来——写类操作在那种配置下会被拒（见 `plugin.ts`）。
 */

import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

import type { AuditEntry, AuditSink } from './tool.js'

/** 宿主 logger 的最小形状（只要两条）。 */
export interface AuditLoggerLike {
  info(message: string): void
  warn(message: string): void
}

/**
 * 一条审计行（**字段顺序固定**）。
 *
 * 固定顺序不是为了好看：审计文件是给人 `grep` 与给脚本解析的，键序稳定能让「同一类事件」在文本上
 * 也对齐（`JSON.stringify` 会按插入顺序输出）。
 */
export function auditLine(entry: AuditEntry): string {
  return JSON.stringify({
    at: entry.at,
    atIso: new Date(entry.at).toISOString(),
    targetId: entry.targetId,
    engine: entry.engine,
    action: entry.action,
    allowed: entry.allowed,
    ...(entry.code === undefined ? {} : { code: entry.code }),
    ...(entry.operationId === undefined ? {} : { operationId: entry.operationId }),
  })
}

/** 一句人话（日志出口用）。 */
export function auditText(entry: AuditEntry): string {
  const code = entry.code === undefined ? '' : ` (${entry.code})`
  const op = entry.operationId === undefined ? '' : ` op=${entry.operationId}`
  return `[dsh-devdata] ${entry.allowed ? '允许' : '拒绝'} ${entry.action} @${entry.targetId}${code}${op}`
}

/**
 * JSON 行审计出口（持久）。
 *
 * 首次写入时**逐级建父目录**：一个不存在的目录是配置疏漏，不是安全事件，没必要让它把每次调用都
 * 变成失败。而真正的失败（无权限 / 盘满 / 路径是个目录）照旧抛出去——那才是该停下来的情况。
 */
export function createJsonlAuditSink(file: string, options: { ensureDir?: boolean } = {}): AuditSink {
  const ensureDir = options.ensureDir ?? true
  let dirReady = false
  return {
    record(entry: AuditEntry): void {
      const line = `${auditLine(entry)}\n`
      try {
        if (ensureDir && !dirReady) {
          mkdirSync(dirname(file), { recursive: true })
          dirReady = true
        }
        appendFileSync(file, line, 'utf8')
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        throw new Error(
          `审计写入失败（${file}）：${reason}。按 fail-closed 语义，本次调用**不返回结果**` +
            `——审计记的是「试过什么」，写不进去就不能装作它被记下了。`,
          { cause: error },
        )
      }
    },
  }
}

/** 只进宿主日志的出口（**不持久**）。 */
export function createLoggerAuditSink(logger: AuditLoggerLike): AuditSink {
  return {
    record(entry: AuditEntry): void {
      if (entry.allowed) logger.info(auditText(entry))
      else logger.warn(auditText(entry))
    },
  }
}
