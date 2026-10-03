/**
 * 内核不变量测试（P2 的验收）。
 *
 * 这一套用例不是在测「函数会不会崩」，而是在钉死几条**承诺**——它们全部来自
 * `docs/devdata-plan.md` §3.1 的不变量与 §3.6 的 agent 失败模式。每条用例的注释里写了
 * 「如果这条失败了意味着什么」，因为一个失败的断言若说不清后果，它迟早会被当成噪声改掉。
 *
 * 覆盖：
 *   - 环境四态（§3.8）与「unknown 一律不可写」（§3.1 不变量 2）；
 *   - 操作级而非连接级判定（§3.1 不变量 1）；
 *   - 未登记一律拒 + `never` 不提供入口（§3.6）；
 *   - 危险读独立成档（`keys` / `monitor` 是读但不可逆）；
 *   - 作用域缺省拒绝（§3.7-2）；
 *   - 凭证保护强度（§3.7-1，修正 plan §1 的旧说法）。
 */

import { HOST_SERVICES, LAUNCH_ENV_LAYERS, bindCapabilitySources } from '@hyzyn/dsh-kit'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  CAP_ENV,
  CREDENTIAL_SOURCES,
  ENGINES,
  REJECTION_CODES,
  adjudicate,
  credentialIsProtective,
  credentialSource,
  decideScope,
  envFacts,
  isNeverOperation,
  isRejectionCode,
  managedActions,
  matrixFor,
  neverActions,
  normalizeEnv,
  parseCredentialRef,
  snapshotTarget,
  type CapabilitySpec,
  type DevDataTarget,
} from '../src/index.js'

/** 被授权的能力规格（测试里用假的变量名，不碰真实环境）。 */
const SPEC: CapabilitySpec = { env: 'TEST_DEVDATA_WRITE', label: '测试写能力' }
const DANGEROUS: CapabilitySpec = { env: 'TEST_DEVDATA_DANGEROUS', label: '测试危险读' }

const CWD = '/work/project-a'

/**
 * 可控的「启动环境」判定源（**测试夹具的关键**）。
 *
 * 两个坑都在这里：
 * 1. kit 只认 `ctx.get('launchEnvironment')` 的 `getFrom(env, ['process'])` 这一条路
 *    （`capability.ts` 的 `resolveEnvSource`）——给别的形状它会静默回落到
 *    **冻结的 `process.env` 拷贝**，于是测试里后设的变量永远看不见；
 * 2. 那条拷贝是**绑定那一刻**取的，所以「先 bind 再设变量」的写法必然是红的。
 *
 * 这个夹具模仿宿主真实给的快照形状，并只放行 `process` 层（与 kit 的口径一致：
 * `.env` / `env.yml` 那两层运行期可写，不能拿来当授权）。
 */
const envMap = new Map<string, string>()

const launchEnv = {
  getFrom(env: string, layers: readonly string[]): { value?: string } | undefined {
    if (!layers.includes(LAUNCH_ENV_LAYERS.process)) return undefined
    const value = envMap.get(env)
    return value === undefined ? undefined : { value }
  },
}

function bind(): void {
  bindCapabilitySources({ get: (name: string) => (name === HOST_SERVICES.launchEnvironment ? launchEnv : undefined) })
}

/** 授权一条能力（写入测试环境源并重新绑定，清掉 kit 的采样缓存）。 */
function grant(env: string): void {
  envMap.set(env, '1')
  bind()
}

/** 撤销全部测试授权。 */
function revokeAll(): void {
  envMap.clear()
  bind()
}

/**
 * 造一个目标。
 *
 * **默认引擎是 `redis`，不是 SQL**：SQL 档的矩阵里**没有任何写操作**（本套件 SQL 永久只读，
 * plan §10），所以拿 SQL 目标测写路径只会拿到 `UNCLASSIFIED_OPERATION`。要测写，就得用真有
 * 写操作的引擎——这也是这套用例自己踩过一次的坑，留在这里当提醒。
 */
function target(overrides: Partial<DevDataTarget> = {}): DevDataTarget {
  return {
    id: 'local-redis',
    label: '本机 Redis',
    engine: 'redis',
    env: 'test-isolated',
    scopeDirs: [CWD],
    writeCapability: SPEC,
    dangerousReadCapability: DANGEROUS,
    ...overrides,
  }
}

beforeEach(() => {
  revokeAll()
})

afterEach(() => {
  revokeAll()
})

describe('环境四态', () => {
  it('归一化：不认识的值一律回落 unknown，不静默升格为 test', () => {
    // 失败意味着：拼错的环境标签会被当成「可写环境」。方向恰好是危险的那一侧。
    expect(normalizeEnv('dev')).toBe('dev')
    expect(normalizeEnv(' TEST-SHARED ')).toBe('test-shared')
    expect(normalizeEnv('test')).toBe('unknown')
    expect(normalizeEnv('prod')).toBe('unknown')
    expect(normalizeEnv(undefined)).toBe('unknown')
    expect(normalizeEnv(123)).toBe('unknown')
  })

  it('只有 dev / test-isolated / test-shared 允许写；production 与 unknown 不允许', () => {
    expect(envFacts('dev').allowsWrite).toBe(true)
    expect(envFacts('test-isolated').allowsWrite).toBe(true)
    expect(envFacts('test-shared').allowsWrite).toBe(true)
    expect(envFacts('production').allowsWrite).toBe(false)
    expect(envFacts('unknown').allowsWrite).toBe(false)
  })

  it('共享测试环境要求二次确认，可丢弃副本不要求', () => {
    expect(envFacts('test-shared').requiresConfirm).toBe(true)
    expect(envFacts('test-isolated').requiresConfirm).toBe(false)
  })
})

describe('不变量 2：未标注 / 生产环境，写类一律拒（且报的是环境这一条）', () => {
  it('unknown：读放行、写被拒，拒绝码是 ENV_NOT_WRITABLE', () => {
    // 失败意味着：本套件「不用于生产」这句话退化成了一句纪律，而不是技术事实。
    const t = target({ env: undefined })
    expect(adjudicate({ target: t, action: 'get', cwd: CWD }).allowed).toBe(true)

    const decision = adjudicate({ target: t, action: 'set', cwd: CWD })
    expect(decision.allowed).toBe(false)
    expect(decision.allowed === false && decision.code).toBe(REJECTION_CODES.ENV_NOT_WRITABLE)
  })

  it('production：即使能力已授权、环境变量已设，写仍然被拒', () => {
    grant(SPEC.env)
    const decision = adjudicate({ target: target({ env: 'production' }), action: 'set', cwd: CWD })
    expect(decision.allowed).toBe(false)
    expect(decision.allowed === false && decision.code).toBe(REJECTION_CODES.ENV_NOT_WRITABLE)
  })

  it('环境判据优先于能力判据：unknown + 未配能力 → 报环境，不报未接入闸门', () => {
    // 失败意味着：不变量 2 只在「目标恰好配了能力规格」时才成立。这是最初版本的缺陷
    // （能力判定写在环境判定之前），用例把它钉住。
    const t = target({ env: 'unknown', writeCapability: undefined })
    const decision = adjudicate({ target: t, action: 'set', cwd: CWD })
    expect(decision.allowed === false && decision.code).toBe(REJECTION_CODES.ENV_NOT_WRITABLE)
  })
})

describe('不变量 1：判定在操作上，不在连接上', () => {
  it('同一目标、同一凭证：读放行而写不放行', () => {
    // 失败意味着：外层闸门看着很严，实际从旁边那条连接绕过去了。
    const t = target({ env: 'test-shared' })
    expect(adjudicate({ target: t, action: 'get', cwd: CWD }).allowed).toBe(true)
    expect(adjudicate({ target: t, action: 'set', cwd: CWD }).allowed).toBe(false)
  })

  it('写类未接入能力闸门 = 不放行（不是「默认放行」）', () => {
    // 失败意味着：每新增一条写路径都是一次静默的安全降级。
    const decision = adjudicate({ target: target({ writeCapability: undefined }), action: 'set', cwd: CWD })
    expect(decision.allowed).toBe(false)
    expect(decision.allowed === false && decision.code).toBe(REJECTION_CODES.CAPABILITY_NOT_DECLARED)
  })

  it('能力已声明但未授权 → CAPABILITY_NOT_GRANTED，且带恢复路径', () => {
    const decision = adjudicate({ target: target(), action: 'set', cwd: CWD })
    expect(decision.allowed).toBe(false)
    expect(decision.allowed === false && decision.code).toBe(REJECTION_CODES.CAPABILITY_NOT_GRANTED)
    // agent 的失败模式是循环重试：拒绝必须给出「怎么改」，否则它只能原样再试。
    expect(decision.allowed === false && typeof decision.hint).toBe('string')
    expect(decision.allowed === false && decision.hint).toContain('TEST_DEVDATA_WRITE')
  })

  it('授权后写放行；共享环境要求 confirmed', () => {
    grant(SPEC.env)
    const shared = adjudicate({ target: target({ env: 'test-shared' }), action: 'set', cwd: CWD })
    expect(shared.allowed).toBe(true)
    expect(shared.allowed === true && shared.requiresConfirm).toBe(true)

    const isolated = adjudicate({ target: target({ env: 'test-isolated' }), action: 'set', cwd: CWD })
    expect(isolated.allowed === true && isolated.requiresConfirm).toBe(false)
  })

  it('SQL 档没有任何写操作入口（永久只读）', () => {
    // 这是设计（plan §10），不是遗漏：要改数据走各自运维流程。
    grant(SPEC.env)
    for (const engine of ['sqlserver', 'mysql', 'postgres'] as const) {
      const decision = adjudicate({ target: target({ engine }), action: 'set', cwd: CWD })
      expect(decision.allowed).toBe(false)
      expect(decision.allowed === false && decision.code).toBe(REJECTION_CODES.UNCLASSIFIED_OPERATION)
    }
  })
})

describe('不变量 1 的参数级形式：档位只能更严（`operationClass`）', () => {
  it('矩阵是普通读、调用方报危险读 → 按危险读判（否则闸门被抹平）', () => {
    // 失败意味着：`INFO ALL` 这类按参数分档的命令走普通读直接放行，一次吐出全部节。
    const decision = adjudicate({ target: target(), action: 'info', cwd: CWD, operationClass: 'read-dangerous' })
    expect(decision.allowed).toBe(false)
    expect(decision.allowed === false && decision.code).toBe(REJECTION_CODES.CAPABILITY_NOT_GRANTED)
  })

  it('升级后的拒绝**指引指向危险读能力**（不是另一个能力，也不是没有指引）', () => {
    // 失败意味着：agent 撞到闸门后拿到的授权指引指向别处，它只能原样重试。
    const decision = adjudicate({ target: target(), action: 'info', cwd: CWD, operationClass: 'read-dangerous' })
    expect(decision.allowed === false && (decision.hint ?? '')).toContain('TEST_DEVDATA_DANGEROUS')
  })

  it('授权危险读后，升级过的普通读放行', () => {
    grant(DANGEROUS.env)
    expect(adjudicate({ target: target(), action: 'info', cwd: CWD, operationClass: 'read-dangerous' }).allowed).toBe(true)
  })

  it('**报一个更宽的档位换不来放行**', () => {
    // 失败意味着：调用方能靠「少报一档」把闸门关掉。
    const decision = adjudicate({ target: target(), action: 'keys', cwd: CWD, operationClass: 'read' })
    expect(decision.allowed).toBe(false)
    expect(decision.allowed === false && decision.code).toBe(REJECTION_CODES.CAPABILITY_NOT_GRANTED)
  })

  it('不传 `operationClass` 时行为完全不变（矩阵说了算）', () => {
    expect(adjudicate({ target: target(), action: 'info', cwd: CWD }).allowed).toBe(true)
    expect(adjudicate({ target: target(), action: 'keys', cwd: CWD }).allowed).toBe(false)
  })

  it('升级到写档也要过环境判据（不变量 2 不被绕过）', () => {
    const decision = adjudicate({ target: target({ env: 'unknown' }), action: 'info', cwd: CWD, operationClass: 'write-scoped' })
    expect(decision.allowed === false && decision.code).toBe(REJECTION_CODES.ENV_NOT_WRITABLE)
  })
})

describe('§3.6：未登记一律拒、never 不提供入口', () => {
  it('未登记的操作一律拒（不是默认放行）', () => {
    const decision = adjudicate({ target: target(), action: 'truncate', cwd: CWD })
    expect(decision.allowed).toBe(false)
    expect(decision.allowed === false && decision.code).toBe(REJECTION_CODES.UNCLASSIFIED_OPERATION)
  })

  it('never 档拒绝且报 OPERATION_FORBIDDEN（即使环境未标注也报这条更硬的事实）', () => {
    // 引擎要选**真的有这条 never** 的那个：MySQL 的 never 里没有 eval，
    // 拿 SQL 目标试 Redis 专属命令只会拿到 UNCLASSIFIED_OPERATION（那也是拒绝，但码不同）。
    const decision = adjudicate({ target: target({ engine: 'redis', env: 'unknown' }), action: 'eval', cwd: '/nope' })
    expect(decision.allowed === false && decision.code).toBe(REJECTION_CODES.OPERATION_FORBIDDEN)
  })

  it('Redis 的不可逆命令一条都没有入口', () => {
    for (const action of ['flushall', 'flushdb', 'eval', 'script', 'config_set', 'replicaof', 'shutdown']) {
      expect(isNeverOperation('redis', action)).toBe(true)
      expect(adjudicate({ target: target({ engine: 'redis' }), action, cwd: CWD }).allowed).toBe(false)
    }
  })

  it('never 与受管操作不相交（工具面不许注册 never 项）', () => {
    for (const engine of ENGINES) {
      const overlap = managedActions(engine).filter((action) => neverActions(engine).includes(action))
      expect(overlap).toEqual([])
    }
  })

  it('矩阵里每个操作的 kind 与能力声明自洽', () => {
    for (const engine of ENGINES) {
      for (const [action, spec] of Object.entries(matrixFor(engine).operations)) {
        expect(spec.action).toBe(action)
        expect(spec.summary.trim()).not.toBe('')
        // 需要能力的档位必须声明变量名；不需要的档位不许声明（否则是「配了但不判」）。
        if (spec.kind === 'read') expect(spec.capabilityEnv).toBeUndefined()
        else expect(typeof spec.capabilityEnv).toBe('string')
      }
    }
  })
})

describe('危险读独立成档', () => {
  it('KEYS 未配能力 → 未接入闸门；配了但未授权 → 未授权', () => {
    const bare = adjudicate({ target: target({ engine: 'redis', dangerousReadCapability: undefined }), action: 'keys', cwd: CWD })
    expect(bare.allowed === false && bare.code).toBe(REJECTION_CODES.CAPABILITY_NOT_DECLARED)

    const ungranted = adjudicate({ target: target({ engine: 'redis' }), action: 'keys', cwd: CWD })
    expect(ungranted.allowed === false && ungranted.code).toBe(REJECTION_CODES.CAPABILITY_NOT_GRANTED)
  })

  it('授权后 KEYS 放行，但标记为不可逆', () => {
    grant(DANGEROUS.env)
    const decision = adjudicate({ target: target({ engine: 'redis' }), action: 'keys', cwd: CWD })
    expect(decision.allowed).toBe(true)
    expect(matrixFor('redis').operations.keys?.reversible).toBe(false)
  })

  it('SCAN（search）是普通读，不需要危险读能力', () => {
    const decision = adjudicate({
      target: target({ engine: 'redis', dangerousReadCapability: undefined }),
      action: 'search',
      cwd: CWD,
    })
    expect(decision.allowed).toBe(true)
  })
})

describe('§3.7-2：作用域缺省拒绝', () => {
  it('空数组 / 未声明 → 处处拒绝', () => {
    const empty = adjudicate({ target: target({ scopeDirs: [] }), action: 'get', cwd: CWD })
    expect(empty.allowed).toBe(false)
    expect(empty.allowed === false && empty.code).toBe(REJECTION_CODES.OUT_OF_SCOPE)

    const missing = adjudicate({ target: target({ scopeDirs: undefined }), action: 'get', cwd: CWD })
    expect(missing.allowed).toBe(false)
    expect(missing.allowed === false && missing.code).toBe(REJECTION_CODES.OUT_OF_SCOPE)
  })

  it('前缀相同的兄弟目录**不算**在内（/work/project-a2 不在 /work/project-a 内）', () => {
    // 失败意味着：一个项目目录能看到另一个项目的库。
    const decision = decideScope(['/work/project-a'], '/work/project-a2')
    expect(decision.allowed).toBe(false)
  })

  it('子目录算在内', () => {
    expect(decideScope(['/work/project-a'], '/work/project-a/src/deep').allowed).toBe(true)
    expect(decideScope(['/work/project-a/'], '/work/project-a').allowed).toBe(true)
  })

  it('作用域也管读类（共享联调环境不该被别的项目顺手连上）', () => {
    const decision = adjudicate({ target: target(), action: 'get', cwd: '/elsewhere' })
    expect(decision.allowed).toBe(false)
    expect(decision.allowed === false && decision.code).toBe(REJECTION_CODES.OUT_OF_SCOPE)
  })

  /*
   * 这一组来自 2026-10-02 真机实测的**第一次使用纸割**：宿主进程的 cwd 是 `~`，而目标作用域收敛在
   * 某个项目目录下——于是「不传 cwd」必然被拒。当时那条恢复路径只说「在允许目录内重试」，
   * **没说你刚才被判的是哪个目录**，agent 只能猜。拒绝文案必须把「判了什么」说出来。
   */
  it('作用域拒绝的恢复路径**点名被判断的目录**与允许的目录', () => {
    const decision = adjudicate({
      target: target({ scopeDirs: ['/work/project-a', '/work/project-b'] }),
      action: 'get',
      cwd: '/Users/someone',
    })
    expect(decision.allowed).toBe(false)
    if (decision.allowed) return
    expect(decision.hint).toContain('/Users/someone')
    expect(decision.hint).toContain('/work/project-a')
    expect(decision.hint).toContain('/work/project-b')
    // 那条最容易踩的语义必须写出来：cwd 缺省取**宿主进程**的工作目录。
    expect(decision.hint).toContain('宿主进程的工作目录')
  })

  it('空作用域的拒绝说清「处处拒绝 + 去配置里声明」', () => {
    const decision = adjudicate({ target: target({ scopeDirs: [] }), action: 'get', cwd: CWD })
    expect(decision.allowed).toBe(false)
    if (decision.allowed) return
    expect(decision.hint).toContain('处处拒绝')
    expect(decision.hint).toContain('配置里显式声明')
  })
})

describe('§3.7-1：凭证保护强度，不把「方便」说成「防护」', () => {
  it('env / file / command 都不算防护；只有 keychain 算', () => {
    expect(credentialIsProtective('env:DB_PASS')).toBe(false)
    expect(credentialIsProtective('file:/tmp/pw')).toBe(false)
    expect(credentialIsProtective('command:op read x')).toBe(false)
    expect(credentialIsProtective('keychain:prod-db')).toBe(true)
    expect(credentialIsProtective(undefined)).toBe(false)
  })

  it('认不出来的引用按 file 处理（假设它不防护，而不是假设它防护）', () => {
    expect(parseCredentialRef('whatever')?.kind).toBe('file')
    expect(parseCredentialRef('env:X')?.kind).toBe('process-env')
    expect(parseCredentialRef('') ).toBeUndefined()
  })

  it('每个来源都有一句说明，且 none 档必须说清它不构成防护', () => {
    for (const spec of CREDENTIAL_SOURCES) {
      expect(spec.note.trim()).not.toBe('')
      if (spec.level === 'none') expect(spec.note).toContain('不是防护')
    }
  })

  it('快照不含明文，只回布尔与保护强度', () => {
    const snap = snapshotTarget(target({ engine: 'redis', env: 'test-shared', credentialRef: 'env:REDIS_PASS' }))
    expect(snap.credentialSet).toBe(true)
    expect(snap.credentialProtective).toBe(false) // env: 不是防护
    expect(snap.credentialNote).toBe(credentialSource('process-env').note)
    expect(JSON.stringify(snap)).not.toContain('REDIS_PASS')
  })

  it('快照如实标注作用域是否配置过', () => {
    expect(snapshotTarget(target({ scopeDirs: [] })).scopeConfigured).toBe(false)
    expect(snapshotTarget(target()).scopeConfigured).toBe(true)
  })
})

describe('拒绝码是单一真相源', () => {
  it('矩阵与用例引用的码全部登记在册', () => {
    for (const value of Object.values(REJECTION_CODES)) {
      expect(isRejectionCode(value)).toBe(true)
    }
    expect(isRejectionCode('NOT_A_CODE')).toBe(false)
  })

  it('每条拒绝都带恢复路径（agent 的失败模式是循环重试）', () => {
    const cases: Array<{ action: string; t: DevDataTarget; cwd: string }> = [
      { action: 'eval', t: target(), cwd: CWD },
      { action: 'truncate', t: target(), cwd: CWD },
      { action: 'get', t: target(), cwd: '/elsewhere' },
      { action: 'set', t: target({ env: 'unknown' }), cwd: CWD },
      { action: 'set', t: target({ writeCapability: undefined }), cwd: CWD },
      { action: 'set', t: target(), cwd: CWD },
      { action: 'keys', t: target({ engine: 'redis', dangerousReadCapability: undefined }), cwd: CWD },
    ]
    for (const { action, t, cwd } of cases) {
      const decision = adjudicate({ target: t, action, cwd })
      expect(decision.allowed).toBe(false)
      expect(decision.allowed === false && typeof decision.hint).toBe('string')
      expect(decision.allowed === false && (decision.hint ?? '').length).toBeGreaterThan(0)
    }
  })

  it('CAP_ENV 的变量名互不相同（避免两条闸门共用一个开关）', () => {
    const values = Object.values(CAP_ENV)
    expect(new Set(values).size).toBe(values.length)
  })
})
