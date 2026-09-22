import { describe, expect, it } from 'vitest'

import { rmStubDir, writeStubCli } from './stub-cli.js'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apply } from '../src/index.js'

/*
 * 「索引生命周期」的自动重建（默认关）：
 *
 * 这段逻辑的价值全在**约束**上，而每条约束写错都不会报错、只会悄悄做错事：
 *   - 触发语义必须是 `index`（重建），不是 `sync`——实测 codegraph 1.6.0 的 sync
 *     对「提取器版本落后」返回 Already up to date 且不清除信号，写成 sync 就是
 *     一个每次都跑、每次都不改变任何东西的空转循环；
 *   - 每项目每次宿主运行最多一次——不设闸的话同一项目开十个会话就是十次全量重建；
 *   - 只在 `autoReindex: true` 时发生（默认关，因为重建是分钟级操作）；
 *   - 只有已索引项目才检查（未索引的该走 init，不是重建）。
 *
 * 用一个「记下自己被怎么调用」的 stub CLI 来断言，而不是看它有没有真的重建索引。
 */

/** stub：把收到的 argv 追加到日志文件，并按命令回一个可控的 status JSON。 */
function stubCli(dir: string, statusJson: string): { command: string; logFile: string } {
  const logFile = join(dir, 'calls.log')
  writeFileSync(logFile, '')
  const script = writeStubCli(dir, 'cg-stub', `
const args = process.argv.slice(2)
// 探测（--version）不进调用日志：它由 CLI 门禁在挂载时自动跑，与本用例无关
if (args[0] === '--version') { process.stdout.write('1.6.0'); process.exit(0) }
fs.appendFileSync(${JSON.stringify(logFile)}, args.join(' ') + '\\n')
if (args[0] === 'status') {
  process.stdout.write(${JSON.stringify(statusJson)})
} else {
  process.stdout.write('done')
}
`)
  return { command: script, logFile }
}

const STALE = JSON.stringify({
  initialized: true,
  version: '1.6.0',
  index: { builtWithVersion: '1.1.1', builtWithExtractionVersion: 24, currentExtractionVersion: 25, reindexRecommended: true },
})
const FRESH = JSON.stringify({
  initialized: true,
  version: '1.6.0',
  index: { builtWithVersion: '1.6.0', builtWithExtractionVersion: 25, currentExtractionVersion: 25, reindexRecommended: false },
})

/** 挂载插件并捕获 session/event 监听器；返回「派发一条 user/message」的能力。 */
function mount(command: string, dir: string, extra: Record<string, unknown> = {}) {
  const listeners: Array<(...args: unknown[]) => unknown> = []
  const base = {
    effect: (fn: () => unknown) => fn(),
    on(name: string, listener: (...args: unknown[]) => unknown) {
      if (name === 'session/event') listeners.push(listener)
      return () => {}
    },
  }
  const ctx = { ...base, inject: () => {} }
  apply(ctx as never, { command, defaultPath: dir, announceToAgent: false, usageGuidance: false, ...extra })
  return {
    /** 派发「会话开始干活」事件（自动重建的触发点）。 */
    userMessage(cwd: string) {
      for (const l of listeners) l({ header: { cwd } }, { type: 'user/message' })
    },
  }
}

/** 造一个已索引项目（自带 .codegraph/codegraph.db）。 */
function indexedProject(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  mkdirSync(join(dir, '.codegraph'), { recursive: true })
  writeFileSync(join(dir, '.codegraph', 'codegraph.db'), '')
  return dir
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * 轮询等待一个条件成立（默认最多 5s），返回是否最终成立。
 *
 * 为什么不能只 `await wait(500)`：自动重建是「status → 判定 → index」的**异步链**，
 * 而它跑在真实子进程上。单跑一个文件时 500ms 够，全仓并行（47 个文件同时抢 CPU）时
 * 不够——实测就是这么偶发红的：断言 `status 调用数 === 1` 拿到 0。
 * 固定 sleep 的用例在慢机器/高并发下必然抖，条件轮询才是在断言「最终会发生」。
 */
async function waitFor(check: () => boolean, timeoutMs = 5_000): Promise<boolean> {
  const start = Date.now()
  for (;;) {
    if (check()) return true
    if (Date.now() - start > timeoutMs) return false
    await wait(25)
  }
}

/** 读 stub CLI 的调用日志（每行一次调用）。 */
const callsIn = (logFile: string): string[] =>
  readFileSync(logFile, 'utf8').trim().split('\n').filter(Boolean)

describe('P1 索引生命周期：自动重建', () => {
  it('默认关：过期也不重建（一行 CLI 都不调）', async () => {
    const dir = indexedProject('cg-auto-off-')
    const { command, logFile } = stubCli(dir, STALE)
    const mount_ = mount(command, dir)   // 不传 autoReindex
    mount_.userMessage(dir)
    // 反向断言（「什么都没发生」）：没有条件可轮询，只能给足时间再确认
    await wait(600)
    expect(readFileSync(logFile, 'utf8').trim()).toBe('')
    rmStubDir(dir)
  })

  it('开启且索引过期：先 status 再 index（是重建，不是 sync）', async () => {
    const dir = indexedProject('cg-auto-on-')
    const { command, logFile } = stubCli(dir, STALE)
    const mount_ = mount(command, dir, { autoReindex: true })
    mount_.userMessage(dir)
    // 等异步链跑完（status → 判定 → index）；条件轮询，不用固定 sleep
    expect(await waitFor(() => callsIn(logFile).some((c) => c.startsWith('index')))).toBe(true)
    const calls = callsIn(logFile)
    expect(calls[0]).toMatch(/^status --json -- /)
    // 关键断言：重建走 `index`，**不是** `sync`——后者对这类过期无效
    expect(calls[1]).toMatch(/^index -- /)
    expect(calls.join('\n')).not.toContain('sync')
    // 不带 --force：那面旗子绕开 CLI 的误伤保护，不该由后台路径代劳
    expect(calls[1]).not.toContain('--force')
    rmStubDir(dir)
  })

  it('每项目每次运行最多一次：同一项目开三个会话只重建一次', async () => {
    const dir = indexedProject('cg-auto-once-')
    const { command, logFile } = stubCli(dir, STALE)
    const mount_ = mount(command, dir, { autoReindex: true })
    mount_.userMessage(dir)
    mount_.userMessage(dir)
    mount_.userMessage(dir)
    expect(await waitFor(() => callsIn(logFile).some((c) => c.startsWith('index')))).toBe(true)
    await wait(200)   // 再给一点时间，让「多余的调用」有机会出现（否则断言不成立也看不出来）
    const calls = callsIn(logFile)
    expect(calls.filter((c) => c.startsWith('index')).length).toBe(1)
    // status 也只查一次（占位在检查之前）
    expect(calls.filter((c) => c.startsWith('status')).length).toBe(1)
    rmStubDir(dir)
  })

  it('索引新鲜：查了 status 但不重建', async () => {
    const dir = indexedProject('cg-auto-fresh-')
    const { command, logFile } = stubCli(dir, FRESH)
    const mount_ = mount(command, dir, { autoReindex: true })
    mount_.userMessage(dir)
    // 等 status 真的被调过（这就是本条要断言的事）——固定 sleep 在并行下不够
    expect(await waitFor(() => callsIn(logFile).some((c) => c.startsWith('status')))).toBe(true)
    await wait(200)   // 确认不会再冒出 index
    const calls = callsIn(logFile)
    expect(calls.filter((c) => c.startsWith('status')).length).toBe(1)
    expect(calls.filter((c) => c.startsWith('index')).length).toBe(0)
    rmStubDir(dir)
  })

  it('未索引项目：不检查也不重建（那该走 init）', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cg-auto-unindexed-'))
    const { command, logFile } = stubCli(dir, STALE)
    const mount_ = mount(command, dir, { autoReindex: true })
    mount_.userMessage(dir)
    await wait(600)
    expect(readFileSync(logFile, 'utf8').trim()).toBe('')
    rmStubDir(dir)
  })

  it('重建失败只记日志，不影响其它功能（不抛给调用方）', async () => {
    const dir = indexedProject('cg-auto-fail-')
    const logFile = join(dir, 'calls.log')
    writeFileSync(logFile, '')
    const script = writeStubCli(dir, 'cg-fail', `
const args = process.argv.slice(2)
if (args[0] === '--version') { process.stdout.write('1.6.0'); process.exit(0) }
fs.appendFileSync(${JSON.stringify(logFile)}, args.join(' ') + '\\n')
if (args[0] === 'status') { process.stdout.write(${JSON.stringify(STALE)}); process.exit(0) }
process.exit(7)
`)
    const mount_ = mount(script, dir, { autoReindex: true })
    // 不应抛出
    expect(() => mount_.userMessage(dir)).not.toThrow()
    expect(await waitFor(() => callsIn(logFile).some((c) => c.startsWith('index')))).toBe(true)
    await wait(200)
    expect(readFileSync(logFile, 'utf8')).toContain('index')
    rmStubDir(dir)
  })
})
