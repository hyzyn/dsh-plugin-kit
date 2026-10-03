/**
 * 观测层测试（`docs/devdata-plan.md` §16.1 第 3 步）。
 *
 * 这一层最容易骗人的地方是**把「通道不通」报成「容器没起」**——两者的处置完全相反：前者要去修
 * 通道，后者才该继续等。所以用例里那条最长的就是从这儿来的：同样的非零退出码，按 stderr 分到
 * `found: false` 还是 `failure`。
 *
 * 另一类是**认不出来就别往下走**：状态拼错（`Runing`）时不能当成 `undefined` 递给判定层——
 * 判定层把「状态不是 running」当明确否证，于是上游一个拼写问题会变成「别等了，容器崩了」。
 */
import { describe, expect, it } from 'vitest'

import {
  INSPECT_TEMPLATE,
  channelFailureMessage,
  inspectArgv,
  isMissingContainer,
  logsArgv,
  needsLogs,
  observeServices,
  parseInspectOutput,
  parseLogOutput,
  type ObservationIo,
  type ObservedCommand,
} from '../src/observe.js'
import type { ServiceRequirement } from '../src/env-ready.js'

const T0 = '2026-10-01T12:00:00.000000000Z'
const NOW = '2026-10-01T12:00:30.000000000Z'

/** 一条假命令的结果。 */
function ok(stdout: string): ObservedCommand {
  return { code: 0, stdout, stderr: '' }
}

/** 一条假失败。 */
function fail(code: number, stderr: string): ObservedCommand {
  return { code, stdout: '', stderr }
}

/**
 * 假 IO：按 argv 的**命令形态**给答案，并记下调用顺序。
 *
 * 用「docker inspect」/「docker logs」而不是整条 argv 做键，是为了让用例读起来是行为而不是字符串
 * ——字段模板改了不该让这些用例红（那是 `INSPECT_TEMPLATE` 自己的用例该管的）。
 */
function fakeIo(plan: {
  inspect?: (name: string) => ObservedCommand
  logs?: (name: string) => ObservedCommand
  probe?: (input: { host: string; port: number; path: string }) => { ok: boolean; status?: number; detail?: string }
}): ObservationIo & { calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    run: async (argv) => {
      if (argv[1] === 'inspect') {
        const name = argv[argv.length - 1] as string
        calls.push(`inspect:${name}`)
        return plan.inspect?.(name) ?? fail(1, `Error: No such object: ${name}`)
      }
      const name = argv[argv.length - 1] as string
      calls.push(`logs:${name}`)
      return plan.logs?.(name) ?? ok('')
    },
    probe: async (input) => {
      calls.push(`probe:${input.host}:${String(input.port)}${input.path}`)
      return plan.probe?.(input) ?? { ok: true, status: 200 }
    },
  }
}

/** 一条要求。 */
function req(name: string, ready?: ServiceRequirement['ready']): ServiceRequirement {
  return ready === undefined ? { name } : { name, ready }
}

describe('parseInspectOutput：认不出来就报，不猜', () => {
  it('五个字段都解出来（含健康检查）', () => {
    const parsed = parseInspectOutput(`${'running'}|${T0}|0|3|healthy\n`)
    expect(parsed).toEqual({ ok: true, fields: { status: 'running', startedAt: T0, exitCode: 0, restartCount: 3, health: 'healthy' } })
  })

  it('没有健康检查时最后一段是空的（字段数仍是 5）', () => {
    const parsed = parseInspectOutput(`exited|${T0}|143|1|\n`)
    expect(parsed).toEqual({ ok: true, fields: { status: 'exited', startedAt: T0, exitCode: 143, restartCount: 1 } })
  })

  it('未启动过的零值时刻不算时刻（`0001-01-01…` 拿去做时间比较毫无意义）', () => {
    const parsed = parseInspectOutput('created|0001-01-01T00:00:00Z|0|0|\n')
    expect(parsed).toEqual({ ok: true, fields: { status: 'created', exitCode: 0, restartCount: 0 } })
  })

  it('状态拼错 → ok: false（当成 undefined 会被判定层读成「明确否证」）', () => {
    expect(parseInspectOutput('Runing|x|0|0|\n')).toEqual({ ok: false, reason: expect.stringContaining('Runing') })
  })

  it('健康状态拼错 → ok: false', () => {
    expect(parseInspectOutput('running|x|0|0|Healthy\n')).toEqual({ ok: false, reason: expect.stringContaining('Healthy') })
  })

  it('空输出 / 字段数不足 → ok: false', () => {
    expect(parseInspectOutput('')).toEqual({ ok: false, reason: expect.stringContaining('没有任何输出') })
    expect(parseInspectOutput('running|x\n')).toEqual({ ok: false, reason: expect.stringContaining('字段数') })
  })

  it('非整数的退出码 / 重启次数当没给（不产生 NaN）', () => {
    const parsed = parseInspectOutput('running|x|abc|def|\n')
    expect(parsed).toEqual({ ok: true, fields: { status: 'running', startedAt: 'x' } })
  })
})

describe('parseLogOutput / 命令构造', () => {
  it('去掉尾部空行，保留行内的 `--timestamps` 前缀', () => {
    expect(parseLogOutput(`${T0} a\n${T0} b\n\n`)).toEqual([`${T0} a`, `${T0} b`])
  })

  it('inspect 用模板 + 容器名；logs 必须带 `--timestamps`（判定层要拿行内时刻比 StartedAt）', () => {
    expect(inspectArgv('ems-service')).toEqual(['docker', 'inspect', '--format', INSPECT_TEMPLATE, 'ems-service'])
    expect(logsArgv('ems-service', 200)).toEqual(['docker', 'logs', '--timestamps', '--tail', '200', 'ems-service'])
  })

  it('只有 logPattern 需要日志', () => {
    expect(needsLogs({ kind: 'logPattern', pattern: 'x' })).toBe(true)
    expect(needsLogs({ kind: 'healthcheck' })).toBe(false)
    expect(needsLogs({ kind: 'httpProbe', path: '/', port: 1 })).toBe(false)
    expect(needsLogs(undefined)).toBe(false)
  })
})

describe('isMissingContainer：只认 docker 自己的两条文案', () => {
  it('两种措辞都认', () => {
    expect(isMissingContainer('Error: No such object: ems')).toBe(true)
    expect(isMissingContainer('Error: No such container: ems')).toBe(true)
  })

  it('别的错误（daemon 连不上 / 权限）**不是**「不存在」', () => {
    expect(isMissingContainer('Cannot connect to the Docker daemon at unix:///var/run/docker.sock.')).toBe(false)
    expect(isMissingContainer('permission denied while trying to connect to the Docker daemon socket')).toBe(false)
  })
})

describe('observeServices：把目标机上的现状取回来', () => {
  it('正常容器：字段齐、observedAt 是取的那一刻、日志按清单取', async () => {
    const io = fakeIo({
      inspect: () => ok(`running|${T0}|0|0|healthy\n`),
      logs: () => ok(`${T0} Started EmsApplication in 12.3 seconds\n`),
    })
    const result = await observeServices({
      io,
      host: '127.0.0.1',
      services: [req('ems-service', { kind: 'logPattern', pattern: 'Started .*Application in' })],
      now: () => NOW,
    })
    expect(result.failure).toBeUndefined()
    expect(result.observations).toEqual([{
      name: 'ems-service',
      found: true,
      observedAt: NOW,
      status: 'running',
      startedAt: T0,
      exitCode: 0,
      restartCount: 0,
      health: 'healthy',
      logLines: [`${T0} Started EmsApplication in 12.3 seconds`],
    }])
    expect(io.calls).toEqual(['inspect:ems-service', 'logs:ems-service'])
  })

  it('「没有这个对象」→ found: false（且不取日志）', async () => {
    const io = fakeIo({ inspect: () => fail(1, 'Error: No such object: ems') })
    const result = await observeServices({ io, host: '127.0.0.1', services: [req('ems', { kind: 'logPattern', pattern: 'x' })], now: () => NOW })
    expect(result.failure).toBeUndefined()
    expect(result.observations).toEqual([{ name: 'ems', found: false, observedAt: NOW }])
    expect(io.calls).toEqual(['inspect:ems'])
  })

  it('daemon 连不上 → failure（**不许**降级成「容器没起」，否则会等满超时）', async () => {
    const io = fakeIo({ inspect: () => fail(1, 'Cannot connect to the Docker daemon at unix:///var/run/docker.sock.') })
    const result = await observeServices({ io, host: '127.0.0.1', services: [req('ems')], now: () => NOW })
    expect(result.observations).toEqual([])
    expect(result.failure).toContain('docker inspect')
    expect(result.failure).toContain('Cannot connect to the Docker daemon')
  })

  it('前面几个服务取到了、后面通道断了 → 已取到的观测保留，failure 也报出来', async () => {
    const io = fakeIo({
      inspect: (name) => (name === 'a' ? ok(`running|${T0}|0|0|\n`) : fail(1, 'ssh: connect to host 10.0.0.9 port 22: Connection refused')),
    })
    const result = await observeServices({ io, host: '127.0.0.1', services: [req('a'), req('b')], now: () => NOW })
    expect(result.observations.map((item) => item.name)).toEqual(['a'])
    expect(result.failure).toContain('Connection refused')
  })

  it('读不懂 inspect 输出 → failure（不产生一个假的 found: false）', async () => {
    const io = fakeIo({ inspect: () => ok('Runing|x|0|0|\n') })
    const result = await observeServices({ io, host: '127.0.0.1', services: [req('ems')], now: () => NOW })
    expect(result.observations).toEqual([])
    expect(result.failure).toContain('Runing')
  })

  it('日志取不到**不算**通道失败：容器还在跑，观测照给（判定层会 unready，方向是对的）', async () => {
    const io = fakeIo({
      inspect: () => ok(`running|${T0}|0|0|\n`),
      logs: () => fail(1, 'Error response from daemon: No such container: ems'),
    })
    const result = await observeServices({ io, host: '127.0.0.1', services: [req('ems', { kind: 'logPattern', pattern: 'x' })], now: () => NOW })
    expect(result.failure).toBeUndefined()
    expect(result.observations[0]?.found).toBe(true)
    expect(result.observations[0]?.logLines).toBeUndefined()
  })

  it('声明了 httpProbe 才探，且探针结果原样带回去', async () => {
    const io = fakeIo({
      inspect: () => ok(`running|${T0}|0|0|\n`),
      probe: () => ({ ok: false, status: 503, detail: 'HTTP 503' }),
    })
    const result = await observeServices({
      io,
      host: '10.0.0.9',
      services: [req('gw', { kind: 'httpProbe', path: '/actuator/health', port: 8080 }), req('redis')],
      now: () => NOW,
    })
    expect(io.calls).toEqual(['inspect:gw', 'probe:10.0.0.9:8080/actuator/health', 'inspect:redis'])
    expect(result.observations[0]?.probe).toEqual({ ok: false, status: 503, detail: 'HTTP 503' })
    expect(result.observations[1]?.probe).toBeUndefined()
  })

  it('串行按清单顺序（NAS 上并发只会把通道额度挤满，诊断文案反而变成「额度已满」）', async () => {
    const io = fakeIo({ inspect: () => ok(`running|${T0}|0|0|\n`) })
    await observeServices({ io, host: 'h', services: [req('a'), req('b'), req('c')], now: () => NOW })
    expect(io.calls).toEqual(['inspect:a', 'inspect:b', 'inspect:c'])
  })

  it('给 logs 的行数可以配', async () => {
    const seen: string[][] = []
    const io: ObservationIo = {
      run: async (argv) => { seen.push([...argv]); return ok(`running|${T0}|0|0|\n`) },
      probe: async () => ({ ok: true }),
    }
    await observeServices({ io, host: 'h', services: [req('x', { kind: 'logPattern', pattern: 'p' })], logTail: 50, now: () => NOW })
    expect(seen[1]).toEqual(['docker', 'logs', '--timestamps', '--tail', '50', 'x'])
  })
})

describe('channelFailureMessage：错误文案要能指到该修什么', () => {
  it('带命令、退出码与 stderr 首行', () => {
    const argv = inspectArgv('ems')
    expect(channelFailureMessage(argv, fail(1, 'boom\nsecond line'))).toBe('在目标机上执行 docker inspect 失败（退出码 1）：boom')
  })

  it('stderr 为空时退回 stdout，两者都空就说「没有输出」', () => {
    expect(channelFailureMessage(inspectArgv('x'), { code: null, stdout: 'from stdout', stderr: '' })).toContain('from stdout')
    expect(channelFailureMessage(inspectArgv('x'), { code: null, stdout: '', stderr: '' })).toContain('没有输出')
  })
})
