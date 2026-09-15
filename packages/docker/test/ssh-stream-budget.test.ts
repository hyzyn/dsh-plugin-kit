/**
 * @hyzyn/dsh-docker — SSH 长流配额与通道错误文案的回归测试。
 *
 * 为什么只单测这两个纯函数、不测整条 `RemoteExec.stream()`：
 *   1. 它需要 ssh2 的 Client 与真实通道时序，单测里没有可信的桩（现有
 *      streams.test.ts 走的是 spawn + 路由层，覆盖不到 SSH runner）；
 *   2. 需要守住的恰恰是**判定**与**文案**——上限取多少、拒绝时说什么。这与
 *      `shouldRecycleConn` 抽成纯函数的理由相同（见 src/ssh-exec.ts 的注释）。
 *
 * 背景：一个 SSH 目标只维持一条 TCP 连接，通道额度（OpenSSH `MaxSessions` 默认 10）
 * 被长流占满后，连「刷新列表」这种短命令都会被远端拒绝；实测报的是
 * `(SSH) Channel open failure: open failed`，对用户没有任何指向性。
 */
import { describe, expect, it } from 'vitest'
import { describeExecError, isTransportError, streamBudgetError } from '../src/ssh-exec.js'

describe('SSH 长流配额', () => {
  it('未达上限放行', () => {
    expect(streamBudgetError('目标1', 0)).toBeNull()
    expect(streamBudgetError('目标1', 7)).toBeNull()
  })

  it('默认上限是 8 —— MaxSessions 默认 10，留两条给刷新 / inspect 这类短命令', () => {
    expect(streamBudgetError('目标1', 7)).toBeNull()
    expect(streamBudgetError('目标1', 8)).not.toBeNull()
  })

  it('被拒时文案要能指导操作，而不是丢一句「不行」', () => {
    const message = streamBudgetError('目标1', 8) ?? ''
    expect(message).toContain('目标1')
    expect(message).toContain('上限 8')
    // 用户读到这句话得知道下一步做什么：关跟随 / 减聚合 / 稍后重试
    expect(message).toContain('实时跟随')
    expect(message).toContain('聚合容器数')
    expect(message).toContain('MaxSessions')
  })

  it('上限可显式传入（不同 sshd 的 MaxSessions 不一样）', () => {
    expect(streamBudgetError('目标1', 3, 4)).toBeNull()
    expect(streamBudgetError('目标1', 4, 4)).toContain('上限 4')
  })
})

describe('ssh2 通道错误的可读化', () => {
  it('通道打开失败补上指向性说明', () => {
    const text = describeExecError('(SSH) Channel open failure: open failed')
    expect(text).toContain('Channel open failure')
    expect(text).toContain('MaxSessions')
    expect(text).toContain('实时流')
  })

  it('其它错误原样返回，不硬改文案', () => {
    expect(describeExecError('connection lost')).toBe('connection lost')
    expect(describeExecError('')).toBe('')
  })
})

describe('传输层错误的识别（决定要不要丢连接重试一次）', () => {
  it('通道级 / 连接级错误：该重连', () => {
    for (const message of [
      '(SSH) Channel open failure: open failed',
      'Not connected',
      'connection lost',
      'read ECONNRESET',
      'write EPIPE',
      'No response from server',
      'SSH exec 打开 channel 超时（30000ms）：目标1',
      'SSH 连接超时（目标1）',
    ]) {
      expect(isTransportError(message), message).toBe(true)
    }
  })

  it('业务失败绝不能被当成传输层错误 —— 否则一条命令会被重发一次', () => {
    for (const message of [
      'SSH exec 失败：docker: No such container: a1b2c3',
      'SSH exec 失败：Error response from daemon: conflict',
      'SSH exec 失败：退出码 1',
      '',
    ]) {
      expect(isTransportError(message), message).toBe(false)
    }
  })
})
