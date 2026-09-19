/**
 * @hyzyn/dsh-docker — SSH 连接构造与 TOFU 指纹策略的回归测试（D73）。
 *
 * 为什么补：`applyHostKeyPolicy` / `buildConnectConfig` / `expandHome` 这几个导出
 * 在 test/ 与 scripts/ 里零引用，而 README 把 TOFU 写成安全保证（「变更即拒绝
 * 连接（防中间人）」）。它们都是纯函数 / 纯构造，用假 store / 假凭据 provider 即可
 * 离线断言；连接时序（RemoteExec 本体）仍走 streams.test.ts 的 spawn + 路由层桩。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { generateKeyPairSync } from 'node:crypto'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { RemoteExec, applyHostKeyPolicy, buildConnectConfig, expandHome, runLocal, setCredentialResolver, shJoin, shouldRecycleConn, sshTarget } from '../src/ssh-exec.js'
import type { ExecLogger, HostKeyRecord, HostKeyStore } from '../src/ssh-exec.js'
import { DockerApi, assertSince, parseExitCode, parseInspectPorts, parseLabels, deriveHealth, deriveState } from '../src/docker.js'
import type { Runner } from '../src/docker.js'
import { formatEventTime } from '../src/index.js'

/* ------------------------------------------------------------------ *
 * 假 HostKeyStore：记录 get / record 调用，便于断言大小写与落库形状
 * ------------------------------------------------------------------ */

function fakeStore(initial: HostKeyRecord[] = []): HostKeyStore & { records: HostKeyRecord[]; gotKeys: string[] } {
  const records = initial.map((item) => ({ ...item, fingerprints: [...item.fingerprints] }))
  const gotKeys: string[] = []
  return {
    records,
    gotKeys,
    get(host, port) {
      gotKeys.push(`${host}:${String(port)}`)
      return records.find((item) => item.host === host && item.port === port)?.fingerprints
    },
    record(host, port, fingerprint) {
      const existing = records.find((item) => item.host === host && item.port === port)
      if (existing !== undefined) {
        if (!existing.fingerprints.includes(fingerprint)) existing.fingerprints.push(fingerprint)
        return
      }
      records.push({ host, port, fingerprints: [fingerprint] })
    },
  }
}

const SPEC = { host: 'Nas.example', username: 'root' } as const

describe('applyHostKeyPolicy（TOFU 三分支 + host 口径）', () => {
  it('首次连接：放行并记录指纹', () => {
    const store = fakeStore()
    const config: Parameters<typeof applyHostKeyPolicy>[0]['connectConfig'] = {}
    const policy = applyHostKeyPolicy({ connectConfig: config, spec: SPEC, store, logger: { info: () => {}, warn: () => {} }, target: 'root@Nas.example' })
    expect(config.hostVerifier?.('sha256:abc')).toBe(true)
    expect(policy.mismatchMessage()).toBeNull()
    expect(store.records).toEqual([{ host: 'nas.example', port: 22, fingerprints: ['sha256:abc'] }])
  })

  it('命中集合内任意一条指纹即放行（rsa + ed25519 各记一条）', () => {
    const store = fakeStore([{ host: 'nas.example', port: 22, fingerprints: ['sha256:rsa', 'sha256:ed'] }])
    const config: Parameters<typeof applyHostKeyPolicy>[0]['connectConfig'] = {}
    const policy = applyHostKeyPolicy({ connectConfig: config, spec: SPEC, store, target: 'root@Nas.example' })
    expect(config.hostVerifier?.('sha256:ed')).toBe(true)
    expect(policy.mismatchMessage()).toBeNull()
    expect(store.records[0]?.fingerprints).toEqual(['sha256:rsa', 'sha256:ed'])
  })

  it('指纹变更：拒绝连接，mismatchMessage 给出可操作的删除指引', () => {
    const store = fakeStore([{ host: 'nas.example', port: 22, fingerprints: ['sha256:old'] }])
    const warns: string[] = []
    const config: Parameters<typeof applyHostKeyPolicy>[0]['connectConfig'] = {}
    const policy = applyHostKeyPolicy({ connectConfig: config, spec: SPEC, store, logger: { info: () => {}, warn: (msg) => warns.push(msg) }, target: 'root@Nas.example' })
    expect(config.hostVerifier?.('sha256:new')).toBe(false)
    expect(policy.mismatchMessage()).toContain('sha256:old')
    expect(policy.mismatchMessage()).toContain('sha256:new')
    expect(policy.mismatchMessage()).toContain('删除该主机再重连')
    expect(warns).toHaveLength(1)
  })

  it('host 键统一小写比较（tty 落盘口径一致，D03）', () => {
    const store = fakeStore([{ host: 'nas.example', port: 22, fingerprints: ['sha256:ok'] }])
    const config: Parameters<typeof applyHostKeyPolicy>[0]['connectConfig'] = {}
    applyHostKeyPolicy({ connectConfig: config, spec: SPEC, store, target: 'root@Nas.example' })
    void config.hostVerifier?.('sha256:ok')
    expect(store.gotKeys[0]).toBe('nas.example:22')
  })
})

describe('buildConnectConfig（认证三态 + 连接参数）', () => {
  afterEach(() => {
    setCredentialResolver(null)
    vi.unstubAllEnvs()
  })

  it('默认参数：readyTimeout 20s、hostHash sha256、keepalive 打开', async () => {
    vi.stubEnv('SSH_AUTH_SOCK', '/tmp/agent.sock')
    const config = await buildConnectConfig({ host: 'h', username: 'u' })
    expect(config.readyTimeout).toBe(20_000)
    expect(config.hostHash).toBe('sha256')
    expect(config.keepaliveInterval).toBe(10_000)
    expect(config.keepaliveCountMax).toBe(3)
    expect(config.agent).toBe('/tmp/agent.sock')
  })

  it('auth=agent 且缺 SSH_AUTH_SOCK：直接给可操作的预检错误（D29）', async () => {
    vi.stubEnv('SSH_AUTH_SOCK', '')
    await expect(buildConnectConfig({ host: 'h', username: 'u' })).rejects.toThrow(/SSH_AUTH_SOCK/)
    await expect(buildConnectConfig({ host: 'h', username: 'u' })).rejects.toThrow(/auth=key \/ auth=password/)
  })

  it('auth=password：agentForward=true 但宿主无 agent 时静默降级（D81 —— ssh2 会硬抛「agent path」）', async () => {
    vi.stubEnv('SSH_AUTH_SOCK', '')
    const config = await buildConnectConfig({ host: 'h', username: 'u', auth: 'password', password: 'plain', agentForward: true })
    expect(config.agent).toBeUndefined()
    // 关键：不能设 agentForward。ssh2 在 connect() 里对「agentForward && !agent」直接同步 throw，
    // 那会让勾了这个选项的目标 100% 连不上（配置从「等于没配」翻成「整个目标不可用」）。
    expect(config.agentForward).toBeUndefined()
  })

  it('auth=key：真实私钥文件 + agentForward 且有 agent 时才设 agentForward（D28/D81）', async () => {
    vi.stubEnv('SSH_AUTH_SOCK', '/tmp/agent.sock')
    await expect(buildConnectConfig({ host: 'h', username: 'u', auth: 'key' })).rejects.toThrow(/keyPath/)
    const dir = mkdtempSync(join(tmpdir(), 'dsh-docker-key-'))
    const keyPath = join(dir, 'id_ed25519')
    const { privateKey } = generateKeyPairSync('ed25519')
    writeFileSync(keyPath, privateKey.export({ type: 'pkcs8', format: 'pem' }) as string, { mode: 0o600 })
    const config = await buildConnectConfig({ host: 'h', username: 'u', auth: 'key', keyPath, agentForward: true })
    expect(Buffer.isBuffer(config.privateKey)).toBe(true)
    expect(config.agentForward).toBe(true)
  })

  it('auth=password + env: 引用经官方凭据 provider 解析（setCredentialResolver 接线）', async () => {
    setCredentialResolver({ resolve: async (ref) => ({ value: 'resolved-' + ref }) })
    const config = await buildConnectConfig({ host: 'h', username: 'u', auth: 'password', password: 'env:SSH_PW' })
    expect(config.password).toBe('resolved-SSH_PW')
  })

  it('auth=password：凭据缺失时报错并写明引用名', async () => {
    await expect(buildConnectConfig({ host: 'h', username: 'u', auth: 'password', password: 'env:NOPE' })).rejects.toThrow(/NOPE/)
  })

  it('expandHome：~ 与 ~/ 展开，~user 明确报错（D30）', () => {
    expect(expandHome('~')).toBe(homedir())
    expect(expandHome('~/.ssh/id_ed25519')).toContain('.ssh')
    expect(() => expandHome('~root/.ssh/id_rsa')).toThrow(/仅支持 ~ 与 ~/)
    expect(expandHome('/abs/path/key')).toBe('/abs/path/key')
  })

  it('sshTarget：非 22 端口带 :port；shJoin 单引号转义', () => {
    expect(sshTarget({ host: 'h', username: 'u' })).toBe('u@h')
    expect(sshTarget({ host: 'h', port: 2222, username: 'u' })).toBe('u@h:2222')
    expect(shJoin(['docker', "it's"])).toBe("'docker' 'it'\\''s'")
  })
})

/* ------------------------------------------------------------------ *
 * 零覆盖导出的守门（D73 清单里的解析器）
 * ------------------------------------------------------------------ */

describe('解析器补测（D73：此前零覆盖的导出）', () => {
  it('parseExitCode / deriveState / deriveHealth / parseLabels', () => {
    expect(parseExitCode('Exited (137) 2 hours ago')).toBe(137)
    expect(parseExitCode('Up 2 hours')).toBeNull()
    expect(deriveState('Up 3 seconds (Restarting)')).toBe('restarting')
    expect(deriveState('Exited (0) 1h ago')).toBe('exited')
    expect(deriveState('Up 2 hours (paused)')).toBe('paused')
    expect(deriveHealth('Up 2 hours (healthy)')).toBe('healthy')
    expect(deriveHealth('Up 2 hours')).toBeNull()
    expect(parseLabels('a=1,b=2,malformed,=empty')).toEqual({ a: '1', b: '2' })
  })

  it('parseInspectPorts：去重键含 hostIp（D38）——同端口双栈保留两条', () => {
    const ports = parseInspectPorts({
      '80/tcp': [{ HostIp: '0.0.0.0', HostPort: '8080' }, { HostIp: '::', HostPort: '8080' }],
      '443/tcp': [{ HostIp: '0.0.0.0', HostPort: '' }],
    })
    expect(ports).toEqual([
      { hostIp: '0.0.0.0', hostPort: 8080, containerPort: 80, protocol: 'tcp' },
      { hostIp: '::', hostPort: 8080, containerPort: 80, protocol: 'tcp' },
      { hostIp: '0.0.0.0', containerPort: 443, protocol: 'tcp' },
    ])
    // 未映射端口
    expect(parseInspectPorts({ '9000/tcp': [] })).toEqual([{ containerPort: 9000, protocol: 'tcp' }])
  })

  it('formatEventTime：非法输入回落占位符', () => {
    expect(formatEventTime(1700000000)).toMatch(/^\d{2}:\d{2}:\d{2}$/)
    expect(formatEventTime(Number.NaN)).toBe('--:--:--')
  })
})

/* ------------------------------------------------------------------ *
 * 第二轮修复的回归（D01/D14/D86/D87/D94/D102/D122）
 * ------------------------------------------------------------------ */

function psLine(id: string, name: string, state: string, status: string): string {
  return JSON.stringify({ ID: id, Names: name, Image: 'img:1', State: state, Status: status, Labels: '', Ports: '', CreatedAt: '2026-09-01 10:00:00 +0800 CST', RunningFor: '2 hours' })
}

/** 按 id 造一份最小可解析的 inspect JSON；pad 用来把体积撑大（模拟真实容器的 2–6KB）。 */
function inspectJson(id: string, name: string, pad: number, exitCode: number, startedAt: string): string {
  return JSON.stringify({
    Id: id,
    Name: '/' + name,
    RestartCount: 7,
    Config: { Image: 'img:1', Labels: pad === 0 ? {} : { pad: 'x'.repeat(pad) } },
    // ExitCode 必须与 ps 摘要一致：detail 优先于摘要，写 0 会让「非零退出」这个 reason 消失
    State: { Status: 'running', ExitCode: exitCode, OOMKilled: false, StartedAt: startedAt, FinishedAt: '0001-01-01T00:00:00Z' },
  })
}

interface FakeContainer { id: string; name: string; state: string; status: string; pad?: number; exitCode?: number; startedAt?: string }

/** 假 Runner：ps 返回固定列表；inspect 把本批 JSON 拼起来，超 maxBytes 就按真实 docker 那样截断。 */
function attentionRunner(containers: FakeContainer[]): { runner: Runner; inspectCalls: string[][] } {
  const inspectCalls: string[][] = []
  const byId = new Map(containers.map((item) => [item.id, item]))
  const runner: Runner = {
    label: 'fake',
    async run(argv, options) {
      const base = { stderr: '', timedOut: false, durationMs: 1 }
      if (argv[1] === 'ps') {
        return { ...base, code: 0, truncated: false, stdout: containers.map((item) => psLine(item.id, item.name, item.state, item.status)).join('\n') + '\n' }
      }
      const ids = argv.slice(2)
      inspectCalls.push(ids)
      const full = ids.map((id) => {
        const meta = byId.get(id)
        return inspectJson(id, meta?.name ?? id, meta?.pad ?? 0, meta?.exitCode ?? 0, meta?.startedAt ?? '2026-09-19T10:00:00Z')
      }).join('\n') + '\n'
      const maxBytes = options?.maxBytes ?? 512 * 1024
      if (Buffer.byteLength(full) > maxBytes) {
        return { ...base, code: 0, truncated: true, stdout: full.slice(0, Math.max(0, maxBytes - 1)) }
      }
      return { ...base, code: 0, truncated: false, stdout: full }
    },
    async stream() {
      return { code: 0 }
    },
  }
  return { runner, inspectCalls }
}

const idOf = (n: number): string => String(n).padStart(12, '0')

describe('第二轮修复的回归', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('shouldRecycleConn：在途一次性命令（inflight）要让空闲回收让路（D01/D123）', () => {
    const now = 10_000_000
    expect(shouldRecycleConn({ lastUsed: now - 10 * 60_000, busy: 0, inflight: 1 }, now)).toBe(false)
    expect(shouldRecycleConn({ lastUsed: now - 10 * 60_000, busy: 0, inflight: 0 }, now)).toBe(true)
    expect(shouldRecycleConn({ lastUsed: now - 10 * 60_000, busy: 2 }, now)).toBe(false)
  })

  it('runLocal 的 keepTail：保留尾部 vs 保留头部，都带截断标记（D14/D123）', async () => {
    const argv = [process.execPath, '-e', 'process.stdout.write("HEAD" + "x".repeat(40) + "TAIL")']
    const head = await runLocal(argv, { maxBytes: 8 })
    const tail = await runLocal(argv, { maxBytes: 8, keepTail: true })
    expect(head.truncated).toBe(true)
    expect(head.stdout).toBe('HEADxxxx')
    expect(tail.truncated).toBe(true)
    expect(tail.stdout).toBe('xxxxTAIL')
  })

  it('assertSince：duration（含小数）/ 0 / Unix 秒 / 含时间的时间戳放行，裸日期拒绝并回显原文（D99）', () => {
    for (const ok of ['30m', '1h30m', '1.5h', '0', '3600', '100µs', '100μs', '2026-09-13T10:00:00', '2026-09-13 10:00']) {
      expect(assertSince(ok)).toBe(ok)
    }
    expect(() => assertSince('2026-09-13')).toThrow(/2026-09-13/)
    expect(() => assertSince('abc')).toThrow(/abc/)
    expect(() => assertSince('  ')).toThrow(/since 必填/)
  })

  it('parseInspectPorts：区间端口不再整段丢弃（D102）', () => {
    expect(parseInspectPorts({ '8000-8005/tcp': [{ HostIp: '0.0.0.0', HostPort: '8000-8005' }] })).toEqual([
      { hostIp: '0.0.0.0', hostPort: 8000, hostPortRange: [8000, 8005], containerPort: 8000, containerPortRange: [8000, 8005], protocol: 'tcp' },
    ])
  })

  it('attention：crash-loop 补捞有独立预算，不会被动因候选吃光（D87）', async () => {
    const unhealthy: FakeContainer[] = Array.from({ length: 300 }, (_, i) => ({ id: idOf(i + 1), name: `u${String(i)}`, state: 'running', status: 'Up 3 days (unhealthy)' }))
    const crash: FakeContainer = { id: idOf(9999), name: 'crash-loop', state: 'running', status: 'Up 5 seconds', startedAt: new Date(Date.now() - 30_000).toISOString() }
    const { runner, inspectCalls } = attentionRunner([...unhealthy, crash])
    const api = new DockerApi(runner, 'docker', { timeoutMs: 1000, maxBytes: 512 * 1024 })
    const result = await api.attention({ limit: 500 })
    // 旧实现里补捞与合法候选共用 300 的预算 → crash-loop 根本不会被 inspect
    expect(inspectCalls.flat()).toContain(crash.id)
    expect(result.items.some((item) => item.name === 'crash-loop' && item.reasons.includes('restarting'))).toBe(true)
    expect(result.degraded).toBe(false)
  })

  it('attention：单批截断只降级那一批，其余批次的权威字段照常（D85/D86）', async () => {
    const big: FakeContainer = { id: idOf(1), name: 'big', state: 'exited', status: 'Exited (143) 1 minute ago', pad: 200_000, exitCode: 143 }
    const rest: FakeContainer[] = Array.from({ length: 20 }, (_, i) => ({ id: idOf(100 + i), name: `small${String(i)}`, state: 'exited', status: 'Exited (143) 1 minute ago', exitCode: 143 }))
    const { runner, inspectCalls } = attentionRunner([big, ...rest])
    const api = new DockerApi(runner, 'docker', { timeoutMs: 1000, maxBytes: 64 * 1024 })
    const result = await api.attention({ limit: 500 })
    expect(inspectCalls.length).toBeGreaterThan(1)                 // 确实分批
    expect(inspectCalls.every((ids) => ids.length <= 40)).toBe(true)
    expect(result.degraded).toBe(true)                             // 失败批次有信号
    // small10 落在第二批（第一批被 big 撑爆），它的详情必须还在 —— 旧实现是整批一起丢
    expect(result.items.find((item) => item.name === 'small10')?.restartCount).toBe(7)
    expect(result.items.find((item) => item.name === 'big')?.restartCount).toBeNull()
  })

  it('RemoteExec：建连失败/超时后不留池条目、不再触发传输层重试（D27/D94/D122）', async () => {
    vi.stubEnv('DSH_DOCKER_CONNECT_TIMEOUT_MS', '300')
    const logger: ExecLogger = { info: () => {}, warn: () => {} }
    const store: HostKeyStore = { get: () => undefined, record: () => {} }
    const remote = new RemoteExec(logger, store)
    const started = Date.now()
    await expect(remote.run({ host: '203.0.113.1', port: 2222, username: 'nobody' }, ['true'])).rejects.toThrow(/SSH/)
    // 300ms 的建连超时被尊重：不可达目标不该等满 20s，也不该走「传输错误重连一次」
    expect(Date.now() - started).toBeLessThan(8_000)
    remote.disposeAll()
  })
})
