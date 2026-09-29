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
import { SSH_TIMEOUT_HINT, describeExecError, isTransportError, streamBudgetError } from '../src/ssh-exec.js'

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

  /**
   * D150：这条文案出现时，`openChannel` **已经**丢连接重建并重试过一次了
   * （见 test/ssh-channel-gate.test.ts）。文案必须把这层说出来——否则用户会以为
   * 「插件什么都没做就报错」，而真实含义是「换了一条连接还是被拒」。
   */
  it('通道打开失败要说明插件已自动重建连接重试过一次', () => {
    const text = describeExecError('(SSH) Channel open failure: open failed')
    expect(text).toContain('重建连接')
    expect(text).toContain('重试')
    expect(text).toContain('实时跟随')
    expect(text).toContain('聚合容器数')
  })

  it('其它错误原样返回，不硬改文案', () => {
    expect(describeExecError('connection lost')).toBe('connection lost')
    expect(describeExecError('')).toBe('')
  })

  /**
   * 项目级 ROADMAP 第 2 项的短期一半：docker 不读 ~/.ssh/config，所以「配了跳板机的目标
   * 连不上」在它这侧只能是通用超时——把最容易被误读的那个成因写进文案。
   */
  it('握手超时补上跳板机提示（通用超时最容易被误读的成因）', () => {
    const text = describeExecError('Timed out while waiting for handshake')
    expect(text).toContain('Timed out')
    expect(text).toContain('跳板机')
    // 支持跳板机之后，提示从「本版本尚不支持」改成「去哪儿配」
    expect(text).toContain('连接簿')
    expect(describeExecError('connect ETIMEDOUT 203.0.113.1:22')).toContain('跳板机')
  })

  it('跳板机提示常量本身可复用（宿主侧超时分支引用的就是它）', () => {
    expect(SSH_TIMEOUT_HINT).toContain('ProxyJump')
    // ProxyCommand 仍不支持：文案必须把这条边界说出来，别让用户以为一并支持了
    expect(SSH_TIMEOUT_HINT).toContain('ProxyCommand')
  })
})

describe('传输层错误的识别（决定要不要丢连接重试一次）', () => {
  it('连接级错误：该重连', () => {
    for (const message of [
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

  it('通道开满（MaxSessions）不是传输层错误 —— 连接是健康的，重连只会泄漏连接并藏掉可操作文案（D07）', () => {
    expect(isTransportError('(SSH) Channel open failure: open failed')).toBe(false)
  })

  it('配额被拒时用户拿到的文案必须可操作（不是裸的 ssh2 报错）', () => {
    const text = describeExecError('(SSH) Channel open failure: open failed')
    expect(text).toContain('MaxSessions')
    expect(text).toContain('实时跟随')
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
