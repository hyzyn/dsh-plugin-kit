/**
 * 审计出口测试（`docs/devdata-plan.md` §5）。
 *
 * 两条判据最能说明这个模块的存在理由，各有一组用例：
 *   1. **写不进去 = 抛**（不是「尽力而为」）——fail closed 的方向必须是「拒绝」，不是「没记下但照做」；
 *   2. **两个出口不许被当成一回事**——日志出口不持久，`auditLine` 与 `auditText` 的差别要让调用方
 *      能据以如实标注（`capabilities` / `doctor` 的 `audit` 一栏）。
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { auditLine, auditText, createJsonlAuditSink, createLoggerAuditSink, type AuditEntry } from '../src/index.js'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'devdata-audit-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

function entry(overrides: Partial<AuditEntry> = {}): AuditEntry {
  return { at: 1_700_000_000_000, targetId: 'redis-248', engine: 'redis', action: 'get', allowed: true, ...overrides }
}

describe('JSON 行出口（持久）', () => {
  it('一条调用一行，字段顺序固定且带 ISO 时间', () => {
    const file = join(dir, 'audit.jsonl')
    const sink = createJsonlAuditSink(file)
    sink.record(entry())
    sink.record(entry({ action: 'set', allowed: false, code: 'CAPABILITY_NOT_GRANTED', operationId: 'op-1' }))

    const lines = readFileSync(file, 'utf8').trim().split('\n')
    expect(lines).toHaveLength(2)
    expect(lines[0]).toBe(
      '{"at":1700000000000,"atIso":"2023-11-14T22:13:20.000Z","targetId":"redis-248","engine":"redis","action":"get","allowed":true}',
    )
    const second = JSON.parse(lines[1] as string) as Record<string, unknown>
    expect(second.action).toBe('set')
    expect(second.allowed).toBe(false)
    expect(second.code).toBe('CAPABILITY_NOT_GRANTED')
    expect(second.operationId).toBe('op-1')
  })

  it('**被拒绝的尝试**同样落盘（审计记的是「试过什么」，不只是成功）', () => {
    const file = join(dir, 'audit.jsonl')
    createJsonlAuditSink(file).record(entry({ allowed: false, code: 'ENV_NOT_WRITABLE' }))
    expect(readFileSync(file, 'utf8')).toContain('ENV_NOT_WRITABLE')
  })

  it('父目录不存在时逐级建（那是配置疏漏，不是安全事件）', () => {
    const file = join(dir, 'nested/deep/audit.jsonl')
    createJsonlAuditSink(file).record(entry())
    expect(readFileSync(file, 'utf8')).toContain('redis-248')
  })

  it('**写不进去 → 抛**，文案里点名 fail-closed 与文件路径', () => {
    // 把路径指向一个**已存在的目录**：appendFileSync 必然失败（EISDIR）。
    const asDir = join(dir, 'not-a-file')
    mkdirSync(asDir)
    const sink = createJsonlAuditSink(asDir)
    expect(() => {
      sink.record(entry())
    }).toThrow(/fail-closed/)
    expect(() => {
      sink.record(entry())
    }).toThrow(/not-a-file/)
  })

  it('抛出的错误带上原始原因（排障要看得到 EISDIR / EACCES）', () => {
    const asDir = join(dir, 'dir2')
    mkdirSync(asDir)
    try {
      createJsonlAuditSink(asDir, { ensureDir: false }).record(entry())
      expect.unreachable('应当抛')
    } catch (error) {
      expect((error as { cause?: unknown }).cause).toBeDefined()
    }
  })

  it('追加而不是覆盖（第二次挂载不能把上一次的记录冲掉）', () => {
    const file = join(dir, 'audit.jsonl')
    writeFileSync(file, '{"pre":1}\n')
    createJsonlAuditSink(file).record(entry())
    const lines = readFileSync(file, 'utf8').trim().split('\n')
    expect(lines).toHaveLength(2)
    expect(lines[0]).toBe('{"pre":1}')
  })
})

describe('日志出口（不持久，必须能区分）', () => {
  it('允许进 info、拒绝进 warn（拒绝更该被看见）', () => {
    const logger = { info: vi.fn(), warn: vi.fn() }
    const sink = createLoggerAuditSink(logger)
    sink.record(entry())
    sink.record(entry({ allowed: false, code: 'OUT_OF_SCOPE' }))
    expect(logger.info).toHaveBeenCalledTimes(1)
    expect(logger.warn).toHaveBeenCalledTimes(1)
    expect(logger.warn.mock.calls[0]?.[0]).toContain('OUT_OF_SCOPE')
  })

  it('审计行是 JSON、日志行是人话：两者不可互换', () => {
    const json = auditLine(entry({ code: 'X' }))
    const text = auditText(entry({ code: 'X' }))
    expect(() => JSON.parse(json) as unknown).not.toThrow()
    expect(() => JSON.parse(text) as unknown).toThrow()
    // 但两条都要带上码与目标。
    for (const line of [json, text]) {
      expect(line).toContain('X')
      expect(line).toContain('redis-248')
    }
  })
})
