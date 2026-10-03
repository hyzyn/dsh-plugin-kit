/**
 * 通道接线的测试（`src/channel.ts`）。
 *
 * 这一层薄，但它薄得**关键**：它是「本包认为怎么连」与「`kit` 实际怎么连」之间唯一的接缝。三件
 * 必须钉住的：
 *
 * 1. **按目标形态选对线**（`local` 走子进程、`ssh` 走执行层 + 连接簿条目）——选错的症状是
 *    「目标明明是本机却去 SSH」这类一眼看不出的错；
 * 2. **给了 `book` 但连接簿里没有它** → 一句指到该改哪里的话（并列出连接簿里现有的条目）；
 * 3. **`timedOut` / `truncated` 原样传下去**（观测层据此升级成通道级失败——半截输出被当成正常
 *    输出，可能刚好解析出一个合法但错的状态）。
 */
import { describe, expect, it } from 'vitest'

import { resolveChannel, toObserved, type RemoteExecLike } from '../src/channel.js'
import type { LiveTarget } from '../src/plugin-config.js'

/** 一个 `local` 目标。 */
function localTarget(): LiveTarget {
  return { id: 'here', label: 'here', kind: 'local', book: '', scopeDirs: ['/w'] }
}

/** 一个 `ssh` 目标。 */
function sshTarget(book = 'nas'): LiveTarget {
  return { id: 'nas-target', label: 'NAS', kind: 'ssh', book, scopeDirs: ['/w'] }
}

/** 连接簿（tty 的 entry）。 */
function settingsWithBook(name: string, host: string): { get(ns: string): unknown } {
  return {
    get: (ns: string) => (ns === 'tty'
      ? { sshHosts: [{ name, host, username: 'czz', port: 22 }] }
      : undefined),
  }
}

describe('resolveChannel：本机目标', () => {
  it('走子进程、探针地址是 127.0.0.1、缺省超时来自配置', async () => {
    const seen: Array<{ argv: readonly string[]; options: unknown }> = []
    const resolved = resolveChannel(localTarget(), {
      remote: { run: async () => { throw new Error('不该走 SSH') } },
      local: async (argv, options) => {
        seen.push({ argv, options })
        return { code: 0, stdout: 'ok', stderr: '' }
      },
      settings: undefined,
      execTimeoutMs: 1234,
    })
    expect(resolved.kind).toBe('ready')
    if (resolved.kind !== 'ready') throw new Error('unreachable')
    expect(resolved.probeHost).toBe('127.0.0.1')
    await resolved.runner.run(['docker', 'ps'])
    expect(seen[0]?.argv).toEqual(['docker', 'ps'])
    expect(seen[0]?.options).toMatchObject({ timeoutMs: 1234 })
  })

  it('调用方给的选项覆盖缺省（logs 要 keepTail）', async () => {
    const seen: unknown[] = []
    const resolved = resolveChannel(localTarget(), {
      remote: { run: async () => { throw new Error('不该走 SSH') } },
      local: async (_argv, options) => {
        seen.push(options)
        return { code: 0, stdout: '', stderr: '' }
      },
      settings: undefined,
      execTimeoutMs: 1000,
    })
    if (resolved.kind !== 'ready') throw new Error('unreachable')
    await resolved.runner.run(['docker', 'logs', 'x'], { maxBytes: 999, keepTail: true })
    expect(seen[0]).toMatchObject({ maxBytes: 999, keepTail: true })
  })
})

describe('resolveChannel：SSH 目标', () => {
  it('按连接簿条目取规格、探针地址是那台主机、把规格交给执行层', async () => {
    const calls: Array<{ spec: unknown; argv: readonly string[] }> = []
    const remote: RemoteExecLike = {
      run: async (spec, argv) => {
        calls.push({ spec, argv })
        return { code: 0, stdout: 'running|x|0|0|', stderr: '' }
      },
    }
    const resolved = resolveChannel(sshTarget(), { remote, local: async () => { throw new Error('不该走本机') }, settings: settingsWithBook('nas', '10.0.0.9'), execTimeoutMs: 5000 })
    expect(resolved.kind).toBe('ready')
    if (resolved.kind !== 'ready') throw new Error('unreachable')
    // 探针从**本机**发出、打那台主机的地址（见 `probe.ts` 的口径）。
    expect(resolved.probeHost).toBe('10.0.0.9')
    await resolved.runner.run(['docker', 'inspect', '--format', 'T', 'ems'])
    expect(calls[0]?.spec).toMatchObject({ host: '10.0.0.9', username: 'czz', port: 22 })
    expect(calls[0]?.argv).toEqual(['docker', 'inspect', '--format', 'T', 'ems'])
  })

  it('连接簿里没有这个条目 → problem，并在有别的条目时把它们列出来', () => {
    const resolved = resolveChannel(sshTarget('typo'), {
      remote: { run: async () => ({ code: 0, stdout: '', stderr: '' }) },
      local: async () => ({ code: 0, stdout: '', stderr: '' }),
      settings: settingsWithBook('nas', '10.0.0.9'),
      execTimeoutMs: 1000,
    })
    expect(resolved.kind).toBe('problem')
    if (resolved.kind !== 'problem') throw new Error('unreachable')
    expect(resolved.problem.message).toContain('typo')
    expect(resolved.problem.hint).toContain('nas')
  })

  it('连接簿整个读不到（tty 没装 / 没配）→ hint 说的是另一件事', () => {
    const resolved = resolveChannel(sshTarget('nas'), {
      remote: { run: async () => ({ code: 0, stdout: '', stderr: '' }) },
      local: async () => ({ code: 0, stdout: '', stderr: '' }),
      settings: undefined,
      execTimeoutMs: 1000,
    })
    expect(resolved.kind).toBe('problem')
    if (resolved.kind !== 'problem') throw new Error('unreachable')
    expect(resolved.problem.hint).toContain('dsh-tty')
  })
})

describe('toObserved：超时与截断必须原样带下去', () => {
  it('正常结果只带三个字段', () => {
    expect(toObserved({ code: 0, stdout: 'a', stderr: 'b' })).toEqual({ code: 0, stdout: 'a', stderr: 'b' })
  })

  it('timedOut / truncated 传下去（观测层会把它们升级成通道级失败）', () => {
    expect(toObserved({ code: null, stdout: '', stderr: '', timedOut: true })).toMatchObject({ timedOut: true })
    expect(toObserved({ code: 0, stdout: 'x', stderr: '', truncated: true })).toMatchObject({ truncated: true })
  })
})
