/**
 * 审计出口（`src/audit.ts`）的用例。
 *
 * 为什么值得单独测：这一份是**三个包共用**的实现（`devdata` / `devfront` / `devenv`），
 * 而它守的是「共享环境里唯一能事后回答『谁在什么时候动了什么』」的东西——
 * 两个出口的行为差别（持久 vs 只进日志、写失败抛不抛）只要漂一次，三个包就一起漂。
 *
 * 夹具：临时目录自己建自己删（`afterAll`），纪律见 `docs/testing.md`。
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'

import { auditLine, createJsonlAuditSink, createLoggerAuditSink, type AuditEntryLike } from '../src/audit.js'

const dir = mkdtempSync(join(tmpdir(), 'dsh-kit-audit-'))

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

/** 一条最小审计行（**公共字段**；各包的额外字段由各自构造点决定）。 */
function entry(overrides: Partial<AuditEntryLike> = {}): AuditEntryLike {
  return { at: 1_700_000_000_000, targetId: 'redis-248', action: 'get', allowed: true, ...overrides }
}

describe('auditLine：字段顺序固定', () => {
  it('`at` / `atIso` 在最前，其余**按构造时的插入序**原样跟在后面', () => {
    const withExtras = { at: 1_700_000_000_000, targetId: 'redis-248', engine: 'redis', action: 'get', allowed: true }
    expect(auditLine(withExtras)).toBe(
      '{"at":1700000000000,"atIso":"2023-11-14T22:13:20.000Z","targetId":"redis-248","engine":"redis","action":"get","allowed":true}',
    )
  })

  it('被拒时带码、带相关性 id；没有的字段不占位（不是 `null`）', () => {
    const denied = auditLine(entry({ action: 'set', allowed: false, code: 'CAPABILITY_NOT_GRANTED', operationId: 'op-1' }))
    expect(denied).toContain('"code":"CAPABILITY_NOT_GRANTED"')
    expect(denied).toContain('"operationId":"op-1"')
    expect(auditLine(entry())).not.toContain('code')
  })
})

describe('JSON 行出口（持久）', () => {
  it('一次一行、**追加**不覆盖（审计文件是账本）', () => {
    const file = join(dir, 'audit.jsonl')
    const sink = createJsonlAuditSink(file)
    sink.record(entry())
    sink.record(entry({ action: 'set', allowed: false, code: 'ENV_NOT_WRITABLE' }))
    const lines = readFileSync(file, 'utf8').trim().split('\n')
    expect(lines).toHaveLength(2)
    expect(lines[1]).toContain('ENV_NOT_WRITABLE')
  })

  it('父目录不存在时逐级建（那是配置疏漏，不是安全事件）', () => {
    const file = join(dir, 'nested/deep/audit.jsonl')
    createJsonlAuditSink(file).record(entry())
    expect(readFileSync(file, 'utf8')).toContain('redis-248')
  })

  it('**写不进去 → 抛**，文案点名 fail-closed 与文件路径，并带上原始原因', () => {
    const asDir = join(dir, 'not-a-file')
    mkdirSync(asDir)
    const sink = createJsonlAuditSink(asDir)
    expect(() => {
      sink.record(entry())
    }).toThrow(/fail-closed/)
    expect(() => {
      sink.record(entry())
    }).toThrow(/not-a-file/)
    try {
      sink.record(entry())
      expect.unreachable('应当抛')
    } catch (error) {
      expect((error as Error).cause).toBeDefined()
    }
  })

  it('`ensureDir: false` 时不去建目录（调用方要自己保证）', () => {
    const file = join(dir, 'no-dir/audit.jsonl')
    expect(() => {
      createJsonlAuditSink(file, { ensureDir: false }).record(entry())
    }).toThrow(/fail-closed/)
  })
})

describe('日志出口（不持久）', () => {
  it('允许 → `info`，拒绝 → `warn`（被拒的尝试是最要紧的那一半证据）', () => {
    const calls: Array<[string, string]> = []
    const sink = createLoggerAuditSink(
      { info: (message) => calls.push(['info', message]), warn: (message) => calls.push(['warn', message]) },
      { tag: 'dsh-x' },
    )
    sink.record(entry())
    sink.record(entry({ action: 'set', allowed: false, code: 'OUT_OF_SCOPE', operationId: 'op-9' }))
    expect(calls[0]).toEqual(['info', '[dsh-x] 允许 get @redis-248'])
    expect(calls[1]).toEqual(['warn', '[dsh-x] 拒绝 set @redis-248 (OUT_OF_SCOPE) op=op-9'])
  })

  it('`subject`（`devfront` 的 URL / 选择器）出现在 targetId 之后', () => {
    const lines: string[] = []
    const sink = createLoggerAuditSink({ info: (m) => lines.push(m), warn: (m) => lines.push(m) }, { tag: 'dsh-y' })
    sink.record(entry({ action: 'open', subject: 'https://x.test/a' }))
    expect(lines[0]).toBe('[dsh-y] 允许 open @redis-248 https://x.test/a')
  })

  it('各包可以给自家话术（`render`），路由仍由这里统一', () => {
    const lines: string[] = []
    const sink = createLoggerAuditSink(
      { info: (m) => lines.push(`i:${m}`), warn: (m) => lines.push(`w:${m}`) },
      { tag: 'unused', render: (item) => `自定义 ${item.action}` },
    )
    sink.record(entry())
    sink.record(entry({ allowed: false }))
    expect(lines).toEqual(['i:自定义 get', 'w:自定义 get'])
  })
})
