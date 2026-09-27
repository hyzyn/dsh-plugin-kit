/**
 * @hyzyn/dsh-kit — 就地提权（elevation）。
 *
 * 这一层是「免重启的第二条授权通道」，所以测的重点是**它是怎么被消费掉的**：nonce 只从 `begin`
 * 出去一次、文件存在即授权且立刻删除、过期会作废、`begin` 幂等与限流、以及**授权/撤销都要回调宿主
 * 重算**（少这一下就是「授权成功但工具没注册」那个半个状态）。
 *
 * 探测是定时器驱动的，所以这里用**很短的探测间隔 + 轮询等待**来测，而不是假定时器：真实路径
 * （`setInterval` → `existsSync` → `store.grant` → 回调）才是要保住的东西。
 */
import { existsSync, mkdtempSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { KIT_DIR_NAME, GrantStore, auditLoadedGrants, createElevationManager } from '../src/index.js'
import type { ElevationBegin, ElevationManager, ElevationOptions } from '../src/index.js'

const ENV = 'DSH_TEST_ALLOW_THING'
const OTHER = 'DSH_TEST_ALLOW_OTHER'
const IS_WINDOWS = process.platform === 'win32'

interface Harness {
  home: string
  confirmDir: string
  store: GrantStore
  /** 审计行（info 与 warn 都进这里）。 */
  events: string[]
  /** `onGrantChange` 收到的 (env, granted)。 */
  changes: Array<[string, boolean]>
  manager: ElevationManager
  /** `begin` 并把结果断言成 pending（测试里最常用的一步）。 */
  begin: () => Extract<ElevationBegin, { status: 'pending' }>
}

const cleanups: Array<() => void> = []

function mount(overrides: Partial<ElevationOptions> = {}): Harness {
  const root = mkdtempSync(join(tmpdir(), 'kit-elev-'))
  const home = join(root, 'home')
  const confirmDir = join(root, 'confirm')
  const store = new GrantStore(home)
  const events: string[] = []
  const changes: Array<[string, boolean]> = []
  const manager = createElevationManager({
    confirmDir,
    store,
    logger: { info: (message) => events.push(message), warn: (message) => events.push(`WARN ${message}`) },
    onGrantChange: (env, granted) => changes.push([env, granted]),
    probeIntervalMs: 5,
    ...overrides,
  })
  cleanups.push(() => {
    manager.dispose()
    rmSync(root, { recursive: true, force: true })
  })
  return {
    home,
    confirmDir,
    store,
    events,
    changes,
    manager,
    begin: () => {
      const result = manager.begin(ENV)
      if (result.status !== 'pending') throw new Error(`期望 pending，实际 ${JSON.stringify(result)}`)
      return result
    },
  }
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/** 等到条件成立；探测是定时器驱动的，只能轮询等（默认 1s 上限）。 */
async function until(check: () => boolean, timeoutMs = 1_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (check()) return
    await sleep(5)
  }
  throw new Error('等待超时')
}

/** 从命令里取出确认文件路径（命令是 `touch '<path>'` / PowerShell 形态）。 */
function pathOf(command: string): string {
  const quoted = command.match(/'([^']+)'/g)
  if (quoted === null || quoted.length === 0) throw new Error(`命令里没有路径：${command}`)
  return quoted[quoted.length - 1].slice(1, -1)
}

afterEach(() => {
  while (cleanups.length > 0) (cleanups.pop() as () => void)()
})

describe('elevation：begin 与确认文件', () => {
  it('首次 begin → pending、命令指向确认目录里一个 32 位十六进制文件名，且文件还没被创建', () => {
    const h = mount()
    const pending = h.begin()
    expect(pending.reused).toBe(false)
    expect(pending.expiresAt).toBeGreaterThan(Date.now())
    const path = pathOf(pending.command)
    expect(dirname(path)).toBe(h.confirmDir)
    expect(basename(path)).toMatch(/^[0-9a-f]{32}$/)
    expect(existsSync(path)).toBe(false)
    expect(h.events.some((line) => line.includes('elevation: begin'))).toBe(true)
    if (!IS_WINDOWS) {
      expect(readdirSync(h.confirmDir)).toEqual([])
    }
  })

  it('在宿主上落地那个文件 → 立刻授权、文件被删除、回调宿主重算', async () => {
    const h = mount()
    const path = pathOf(h.begin().command)
    writeFileSync(path, '')
    await until(() => h.store.has(ENV))
    expect(existsSync(path)).toBe(false)
    expect(h.changes).toEqual([[ENV, true]])
    expect(h.events.some((line) => line.includes('elevation: grant'))).toBe(true)
    expect(h.manager.status(ENV)).toEqual({ status: 'granted', via: 'file' })
  })

  it('已授权时 begin 直接短路：不建确认目录、不起挑战', () => {
    const h = mount()
    h.store.grant(ENV)
    expect(h.manager.begin(ENV)).toEqual({ status: 'granted', via: 'file' })
    expect(existsSync(h.confirmDir)).toBe(false)
  })

  it('begin 幂等：pending 期间重复调用返回**同一条**命令，并标 reused', () => {
    const h = mount()
    const first = h.begin()
    const second = h.begin()
    expect(second.command).toBe(first.command)
    expect(second.expiresAt).toBe(first.expiresAt)
    expect(second.reused).toBe(true)
  })

  it('审计行不含 nonce / 路径（日志会落盘，凭据不许进日志）', () => {
    const h = mount()
    const path = pathOf(h.begin().command)
    expect(h.events.length).toBeGreaterThan(0)
    for (const line of h.events) {
      expect(line).not.toContain(basename(path))
      expect(line).not.toContain(path)
    }
  })

  it('只认自己那一个路径：目录里别的文件不会触发授权，也不会被删', async () => {
    const h = mount()
    h.begin()
    const other = join(h.confirmDir, 'someone-elses-file')
    writeFileSync(other, '')
    await sleep(30) // 好几个探测周期
    expect(h.store.has(ENV)).toBe(false)
    expect(existsSync(other)).toBe(true)
  })

  it('确认目录建不出来（路径上是个文件）→ begin 回 error，不是抛错', () => {
    const root = mkdtempSync(join(tmpdir(), 'kit-elev-bad-'))
    const blocker = join(root, 'blocker')
    writeFileSync(blocker, '')
    const store = new GrantStore(join(root, 'home'))
    const manager = createElevationManager({
      confirmDir: join(blocker, 'confirm'),
      store,
      logger: { info: () => undefined, warn: () => undefined },
      onGrantChange: () => undefined,
    })
    cleanups.push(() => {
      manager.dispose()
      rmSync(root, { recursive: true, force: true })
    })
    const result = manager.begin(ENV)
    expect(result.status).toBe('error')
  })

  it('win32 用 PowerShell 形态的命令（平台注入）', () => {
    const h = mount({ platform: 'win32' })
    const command = h.begin().command
    expect(command).toContain('powershell -NoProfile -Command')
    expect(command).toContain('New-Item -ItemType File -Force')
  })
})

describe('elevation：时效、限流与撤销', () => {
  it('过期 → 作废并删掉残留文件，status 回到 none（store 里没有授权）', async () => {
    const h = mount({ ttlMs: 40 })
    const path = pathOf(h.begin().command)
    expect(h.manager.status(ENV).status).toBe('pending')
    await until(() => h.events.some((line) => line.includes('elevation: expire')))
    expect(h.store.has(ENV)).toBe(false)
    expect(h.manager.status(ENV)).toEqual({ status: 'none' })
    expect(existsSync(path)).toBe(false)
    // 过期后还能重新开始（不是永久锁死）
    expect(h.manager.begin(ENV).status).toBe('pending')
  })

  it('过期挑战的残留文件在下次 begin 时被清掉（不会用旧 nonce 复活）', async () => {
    const h = mount({ ttlMs: 30 })
    const stale = pathOf(h.begin().command)
    // 挑战刚过期就把文件补上：它属于**上一个** nonce，不该授权
    await until(() => h.manager.status(ENV).status === 'none')
    writeFileSync(stale, '')
    const pending = h.manager.begin(ENV)
    expect(pending.status).toBe('pending')
    if (pending.status === 'pending') expect(pathOf(pending.command)).not.toBe(stale)
    await sleep(30)
    expect(h.store.has(ENV)).toBe(false)
  })

  it('幂等复用不算额度；每能力每小时最多 3 次新建', () => {
    const h = mount()
    h.begin()
    h.begin() // 复用
    for (let round = 0; round < 2; round += 1) {
      h.manager.revoke(ENV) // 清掉 pending，好再新建一次
      expect(h.manager.begin(ENV).status).toBe('pending')
    }
    // 已经新建 3 次：第 4 次被限流
    h.manager.revoke(ENV)
    const limited = h.manager.begin(ENV)
    expect(limited.status).toBe('rate-limited')
    if (limited.status === 'rate-limited') {
      expect(limited.retryAfterMs).toBeGreaterThan(0)
      expect(limited.retryAfterMs).toBeLessThanOrEqual(3_600_000)
    }
  })

  it('撤销已生效的授权：清记录、回调宿主、写审计行', async () => {
    const h = mount()
    writeFileSync(pathOf(h.begin().command), '')
    await until(() => h.store.has(ENV))
    expect(h.manager.revoke(ENV)).toBe(true)
    expect(h.store.has(ENV)).toBe(false)
    expect(h.changes).toEqual([
      [ENV, true],
      [ENV, false],
    ])
    expect(h.events.some((line) => line.includes('elevation: revoke'))).toBe(true)
    expect(h.manager.status(ENV)).toEqual({ status: 'none' })
  })

  it('撤销一个本来就没授权的能力：返回 false，且不触发重算回调', () => {
    const h = mount()
    expect(h.manager.revoke(ENV)).toBe(false)
    expect(h.changes).toEqual([])
  })

  it('pending 期间撤销：挑战作废、确认文件被删（免得贴在磁盘上等着被消费）', () => {
    const h = mount()
    const path = pathOf(h.begin().command)
    writeFileSync(path, '')
    expect(h.manager.revoke(ENV)).toBe(false)
    expect(h.manager.status(ENV)).toEqual({ status: 'none' })
    expect(existsSync(path)).toBe(false)
  })

  it('dispose 之后不再探测（插件卸载不该留一个活的定时器）', async () => {
    const h = mount()
    const path = pathOf(h.begin().command)
    h.manager.dispose()
    writeFileSync(path, '')
    await sleep(30)
    expect(h.store.has(ENV)).toBe(false)
  })
})

/**
 * 载入审计（kit D09）。
 *
 * 这几条测的不是「日志好不好看」，而是**一次持久提权有没有痕迹**：带外授权重启后直接生效、
 * 不再有任何确认，所以「载入」这一下如果不写日志，一次提权就等于没发生过。
 */
describe('auditLoadedGrants：持久授权的「载入」也要留痕', () => {
  const UNGRANTED = 'DSH_TEST_ALLOW_UNGRANTED'

  /** 收集审计行的小 logger。 */
  function collector(): { lines: string[]; logger: { info(m: string): void; warn(m: string): void } } {
    const lines: string[] = []
    return { lines, logger: { info: (m) => lines.push(m), warn: (m) => lines.push(`WARN ${m}`) } }
  }

  it('逐条打出已载入的 file 授权（含 via 与**人类可读**的时刻），未授权的一句不打', () => {
    const root = mkdtempSync(join(tmpdir(), 'kit-elev-audit-'))
    try {
      const store = new GrantStore(join(root, KIT_DIR_NAME))
      store.grant(ENV)
      store.grant(OTHER)
      const { lines, logger } = collector()

      auditLoadedGrants(store, [ENV, OTHER, UNGRANTED], logger, '[dsh-test]')

      expect(lines).toHaveLength(2)
      expect(lines[0]).toContain(`[dsh-test] elevation: load capability=${ENV} via=file grantedAt=`)
      // 时刻是 ISO（审计要能直接读），不是裸 Unix 秒
      const grantedAt = store.source(ENV)?.grantedAt ?? 0
      expect(lines[0]).toContain(new Date(grantedAt * 1000).toISOString())
      expect(lines.join('\n')).not.toContain(UNGRANTED)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('只有 has() 的最小存储：说出「有授权」，但**不编**一个时刻', () => {
    const { lines, logger } = collector()
    auditLoadedGrants({ has: (env) => env === ENV }, [ENV, UNGRANTED], logger, '[dsh-test]')
    expect(lines).toEqual([`[dsh-test] elevation: load capability=${ENV} via=file grantedAt=unknown`])
  })

  it('什么都没授权时一行都不写（不制造「看起来有事」的噪音）', () => {
    const root = mkdtempSync(join(tmpdir(), 'kit-elev-audit-'))
    try {
      const { lines, logger } = collector()
      auditLoadedGrants(new GrantStore(join(root, KIT_DIR_NAME)), [ENV, OTHER], logger)
      expect(lines).toEqual([])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
