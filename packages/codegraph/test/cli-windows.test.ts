/**
 * @hyzyn/dsh-codegraph — Windows 下经 cmd.exe 调用 CLI shim 的回归测试。
 *
 * 转义规则与 `%COMSPEC% /d /s /c` 的启动方式已经搬到 `@hyzyn/dsh-kit` 的
 * windows-shim（`@hyzyn/dsh-mcp` 的「连接测试」踩的是同一个坑），通用断言随之搬到
 * `packages/kit/test/windows-shim.test.ts`。这里只留本包自己的契约：
 *
 *   - `settleCliRun` 的「超时优先于 close」——Windows 上 `taskkill` 杀掉子进程时
 *     close 先到，认不出超时就会让卡片报错不点名 `cliTimeoutMs` / `indexTimeoutMs`；
 *   - 本包仍然从 `src/index.js` 导出搬家后的四个函数，既有消费者不会因为搬家而断。
 */
import { describe, expect, it } from 'vitest'
import { escapeArgument, escapeCommand, settleCliRun, taskkillArgs, windowsCommandLine } from '../src/index.js'

/** 与 syncArgs 保持一致，这里内联一份避免测试依赖被测函数的同一处实现。 */
function syncArgsForTest(): string[] {
  return ['sync', '--', 'D:\\dev\\newbi']
}

describe('搬家后的四个函数仍然从本包导出（back-compat）', () => {
  it('escapeCommand / escapeArgument / windowsCommandLine 行为不变', () => {
    expect(escapeCommand('codegraph')).toBe('codegraph')
    expect(escapeArgument('sync')).toBe('^"sync^"')
    expect(windowsCommandLine('codegraph', syncArgsForTest())).toBe('codegraph ^"sync^" ^"--^" ^"D:\\dev\\newbi^"')
  })

  it('taskkillArgs 形状不变（/T 连孙进程一起收）', () => {
    expect(taskkillArgs(4321)).toEqual(['/pid', '4321', '/T', '/F'])
  })
})

describe('settleCliRun（超时与 close 的竞态）', () => {
  const base = { command: 'codegraph', args: ['index', '--', 'C:\\proj'], timeoutMs: 600000, code: null, stdout: '', stderr: '' }

  it('超时优先于 close：被杀的子进程先触发 close，也必须报超时形状', () => {
    // close 先到（code=1）但 timedOut 已置位：必须是 killed/signal，否则
    // cliErrorMessage 认不出超时，卡片不会点名 cliTimeoutMs / indexTimeoutMs
    const outcome = settleCliRun({ ...base, timedOut: true, code: 1, stderr: '' })
    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect((outcome.error as { killed?: boolean }).killed).toBe(true)
    expect((outcome.error as { signal?: string }).signal).toBe('SIGTERM')
    expect(outcome.error.message).toContain('timeout')
  })

  it('正常退出：返回 stdout', () => {
    expect(settleCliRun({ ...base, timedOut: false, code: 0, stdout: 'ok' })).toEqual({ ok: true, stdout: 'ok' })
  })

  it('非零退出：错误信息带上 stderr（与 execFile 一致）', () => {
    const outcome = settleCliRun({ ...base, timedOut: false, code: 1, stderr: 'boom' })
    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.error.message).toContain('boom')
    expect((outcome.error as { killed?: boolean }).killed).toBeUndefined()
  })
})
