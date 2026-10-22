/**
 * CG70 的回归：托管行写**本 profile 自己的 patch 层**，并清掉 home 层里的旧块。
 *
 * ## 为什么必须这么改
 *
 * 一直写 `$DSH_HOME/cordis.patch.yml`，而那是**机器级**层：DSH 对每个 profile 都加载它、
 * 且**压过** profile 自己的层（`profile-boot`：home 层 "applies to every profile, so it
 * outranks the per-profile layer"）。于是同机开两个宿主（web + desktop 是最常见组合）时，
 * 两个插件实例抢同一份文件、互相把对方的行改掉，而且**完全静默**——表现成「我设了
 * managed，托管行却是 `insert: []`」。
 *
 * ## 迁移为什么是前置条件（不是可选项）
 *
 * 实测：同 id 的 entry 出现在两层时，`--dump-config` 两条都在、实际只挂一条，而
 * **后加载者胜** = home 层（它排在 profile 层之后）。所以只把写入点改到 profile 层、
 * 不清旧块，结果是**旧值静默盖住新值**，比不改更糟。这条用例批次里最重要的一条
 * 就是「旧块真的被清掉了」。
 *
 * 隔离：`apply()` 会写真文件，整个文件把 DSH_HOME 指到临时目录（CG68 的教训）。
 */
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { isMap } from 'node:util/types'

import { apply } from '../src/index.js'
import { rmStubDir, writeStubCli } from './stub-cli.js'

const sandbox = mkdtempSync(join(tmpdir(), 'dsh-cg-cg70-'))
const dshHome = join(sandbox, 'dsh-home')
const homePatch = join(dshHome, 'cordis.patch.yml')
const originalDshHome = process.env.DSH_HOME

beforeAll(() => {
  mkdirSync(join(dshHome, 'profiles'), { recursive: true })
  process.env.DSH_HOME = dshHome
})

afterAll(() => {
  if (originalDshHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = originalDshHome
  rmStubDir(sandbox)
})

const echoCli = writeStubCli(sandbox, 'cg70-echo', 'console.log(JSON.stringify(process.argv.slice(2)))')

const OWN_START = '# --- dsh-codegraph mcp managed (auto-generated; do not edit) ---'
const OWN_END = '# --- end dsh-codegraph mcp managed ---'

/** 造一个已索引目录（`.codegraph/` 里有索引库）。 */
function indexedDir(name: string): string {
  const dir = mkdtempSync(join(sandbox, name))
  mkdirSync(join(dir, '.codegraph'), { recursive: true })
  writeFileSync(join(dir, '.codegraph', 'codegraph.db'), '')
  return dir
}

/** 本插件的托管块（内容随意，用例只看「在不在」与「cwd 是哪个」）。 */
function ownBlock(cwd: string): string {
  return [
    OWN_START,
    '- insert:',
    '    - id: mcp-codegraph-managed',
    "      name: '@deepseek-ai/dsh-mcp-client'",
    '      config:',
    '        serverName: codegraph',
    '        transport: stdio',
    '        command: codegraph',
    '        args:',
    '          - serve',
    "          - '--mcp'",
    `        cwd: ${cwd}`,
    OWN_END,
  ].join('\n')
}

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

interface Harness {
  /** 已注册的 HTTP 路由（用例直接打，与卡片同一入口）。 */
  routes: Map<string, { handler: (req: unknown, res: unknown) => Promise<void> }>
  /** 本 profile 的 patch 文件（插件应当写这里）。 */
  profilePatch: string
  /** 让 agents 服务从一开始就可用（per-agent 的前提）。 */
  enableAgents(): void
  /** 让迟到服务到货（CG69 的 inject 回调）。 */
  deliverAgents(): void
}

/**
 * 挂真插件。`profilePatchFile` 决定 `profileContext.patchPath`：
 * 给 `undefined` 时**不提供** profileContext（复现「最小宿主 / 老版本」的回落路径）。
 */
function mount(config: Record<string, unknown>, profilePatchFile: string | undefined, options: { agents?: boolean } = {}): Harness {
  const pendingInject: Array<(sub: unknown) => void> = []
  const routes = new Map<string, { handler: (req: unknown, res: unknown) => Promise<void> }>()
  const agents = { list: (): unknown[] => [] }
  let agentsLive = options.agents === true

  const webSub = {
    effect: (fn: () => unknown) => fn(),
    webServer: {
      register(route: { path: string }) { routes.set(route.path, route); return () => {} },
    },
  }
  /** 假的 settings 存储：resolveStored 从 describe() 读，update 合并进「用户层」。 */
  const stored: Record<string, unknown> = {}
  const settingsChanges = new Set<() => void>()
  const settingsService = {
    describe: () => [{ ns: 'codegraph', value: { ...stored } }],
    async update(_ns: string, patch: object) {
      Object.assign(stored, patch as Record<string, unknown>)
      for (const listener of settingsChanges) listener()
    },
    configure: () => () => {},
  }
  const read = (name: string): unknown => {
    if (name === 'settings') return settingsService
    if (name === 'agents') return agentsLive ? agents : undefined
    if (name === 'profileContext' && profilePatchFile !== undefined) {
      return { name: 'test-profile', dir: join(dshHome, 'profiles', 'test'), patchPath: profilePatchFile, home: dshHome }
    }
    return undefined
  }
  const on = (name: string, listener: (payload: unknown) => void): (() => void) => {
    if (name === 'loader/volatile-update') return () => {}
    return () => { void listener }
  }
  const ctx = {
    inject(names: string[], callback: (sub: unknown) => void) {
      if (names.includes('webServer')) { callback(webSub); return }
      if (names.includes('settings')) { callback({ ...webSub, get: read, on }); return }
      if (names.includes('agents')) { pendingInject.push(callback); if (agentsLive) callback({ get: read, on, effect: (fn: () => unknown) => fn() }) }
    },
    on,
    get: read,
    effect(fn: () => unknown) { fn() },
  }
  apply(ctx as never, config as never)
  return {
    routes,
    profilePatch: profilePatchFile ?? homePatch,
    enableAgents() { agentsLive = true },
    deliverAgents() {
      agentsLive = true
      for (const callback of pendingInject) callback({ get: read, on, effect: (fn: () => unknown) => fn() })
    },
  }
}


/** 直接打 POST 路由（与卡片同一入口）。 */
async function postJson(
  route: { handler: (req: unknown, res: unknown) => Promise<void> },
  payload: unknown,
  url: string,
): Promise<Record<string, unknown>> {
  const body = JSON.stringify(payload)
  const req = {
    method: 'POST',
    url,
    headers: { host: '127.0.0.1:3082', 'content-type': 'application/json', 'content-length': String(body.length) },
    socket: { remoteAddress: '127.0.0.1' },
    async *[Symbol.asyncIterator]() { yield Buffer.from(body) },
  }
  let parsed: Record<string, unknown> | undefined
  const res = {
    writeHead() {},
    end(text?: string) { parsed = text === undefined ? undefined : (JSON.parse(text) as Record<string, unknown>) },
    on() {},
    get writableEnded() { return true },
  }
  await route.handler(req, res)
  return parsed ?? {}
}

describe('CG70：托管行写本 profile 的层，并清掉 home 层的旧块', () => {
  it('写进 profileContext.patchPath，而不是 home 层', async () => {
    const dir = indexedDir('cg70-write-')
    rmSync(homePatch, { force: true })
    const profileDir = join(dshHome, 'profiles', 'test')
    mkdirSync(profileDir, { recursive: true })
    const profilePatch = join(profileDir, 'cordis.patch.yml')
    rmSync(profilePatch, { force: true })

    mount({ command: echoCli, defaultPath: dir, mcpScope: 'managed', announceToAgent: false, usageGuidance: false }, profilePatch)
    await wait(250)

    expect(existsSync(profilePatch), 'profile 层应当被写入').toBe(true)
    expect(readFileSync(profilePatch, 'utf8'), 'profile 层里应有本插件的托管块').toContain(OWN_START)
    expect(existsSync(homePatch) && readFileSync(homePatch, 'utf8').includes(OWN_START), 'home 层不该再出现托管块').toBe(false)
  })

  it('home 层里已有的旧块会被清掉（迁移），别人的内容一个字节不碰', async () => {
    const dir = indexedDir('cg70-migrate-')
    // home 层：旧块 + 别人的块 + 注释
    const others = [
      '# 用户自己的注释',
      '# --- dsh-mcp-config managed (auto-generated; do not edit) ---',
      '- insert:',
      '    - id: mcp-other',
      "      name: '@deepseek-ai/dsh-mcp-client'",
      '      config:',
      '        serverName: other',
      '# --- end dsh-mcp-config managed ---',
    ].join('\n')
    writeFileSync(homePatch, ownBlock('/tmp/OLD-HOME-LAYER') + '\n\n' + others + '\n')

    const profileDir = join(dshHome, 'profiles', 'test')
    mkdirSync(profileDir, { recursive: true })
    const profilePatch = join(profileDir, 'cordis.patch.yml')
    rmSync(profilePatch, { force: true })

    mount({ command: echoCli, defaultPath: dir, mcpScope: 'managed', announceToAgent: false, usageGuidance: false }, profilePatch)
    await wait(250)

    const home = readFileSync(homePatch, 'utf8')
    expect(home, '旧块（含标记）应被整段清掉').not.toContain(OWN_START)
    expect(home, '旧块的 cwd 也不该残留').not.toContain('/tmp/OLD-HOME-LAYER')
    expect(home, "别人的块必须原样保留").toContain('mcp-other')
    expect(home, '用户注释必须原样保留').toContain('# 用户自己的注释')
    expect(readFileSync(profilePatch, 'utf8'), '新值写在 profile 层').toContain(OWN_START)
  })

  it('迁移幂等：再跑一次不产生任何改动（mtime 不变）', async () => {
    const dir = indexedDir('cg70-idem-')
    writeFileSync(homePatch, ownBlock('/tmp/OLD-2') + '\n')
    const profileDir = join(dshHome, 'profiles', 'test')
    mkdirSync(profileDir, { recursive: true })
    const profilePatch = join(profileDir, 'cordis.patch.yml')
    rmSync(profilePatch, { force: true })

    mount({ command: echoCli, defaultPath: dir, mcpScope: 'managed', announceToAgent: false, usageGuidance: false }, profilePatch)
    await wait(250)
    expect(readFileSync(homePatch, 'utf8')).not.toContain(OWN_START)

    // 第二次：home 层已经干净，迁移必须判「没变化」且不写盘
    const settled = readFileSync(homePatch, 'utf8')
    const { statSync } = await import('node:fs')
    const mtime = statSync(homePatch).mtimeMs
    mount({ command: echoCli, defaultPath: dir, mcpScope: 'managed', announceToAgent: false, usageGuidance: false }, profilePatch)
    await wait(250)
    expect(readFileSync(homePatch, 'utf8'), '内容不变').toBe(settled)
    expect(statSync(homePatch).mtimeMs, 'mtime 不变 = 真的没落盘').toBe(mtime)
  })

  it('拿不到 profileContext 时回落 home 层（最小宿主 / 老版本不能丢托管能力）', async () => {
    const dir = indexedDir('cg70-fallback-')
    rmSync(homePatch, { force: true })
    mount({ command: echoCli, defaultPath: dir, mcpScope: 'managed', announceToAgent: false, usageGuidance: false }, undefined)
    await wait(250)
    expect(readFileSync(homePatch, 'utf8'), '没有 profileContext 时写 home 层（与改之前一致）').toContain(OWN_START)
  })

  it('per-agent → managed 往返后 profile 层逐行回到挂起前（CG71：不留空占位）', async () => {
    /*
     * CG71：挂起分支留下 `- insert: []` 占位，而恢复分支原先只「插入」不清占位，
     * 于是每个来回都在区块里留一条空 insert + 一个空行。功能不受影响（空 insert 是
     * 合法空操作、真行照挂），但它让文件回不到原样，而且是**用户点一下卡片就产生**的脏写。
     *
     * 这条用例走完整往返：managed（真行）→ per-agent（挂起）→ managed（恢复），
     * 断言恢复后与挂起前**逐行一致**且二次同步零改动。
     */
    const dir = indexedDir('cg70-roundtrip-')
    const profileDir = join(dshHome, 'profiles', 'test')
    mkdirSync(profileDir, { recursive: true })
    const profilePatch = join(profileDir, 'cordis.patch.yml')
    rmSync(profilePatch, { force: true })

    const mounted = mount({ command: echoCli, defaultPath: dir, mcpScope: 'managed', announceToAgent: false, usageGuidance: false }, profilePatch, { agents: true })
    await wait(250)
    const before = readFileSync(profilePatch, 'utf8')
    expect(before, '前提：一开始就有真行').toContain('mcp-codegraph-managed')

    // 切 per-agent（挂起）→ 再切回 managed（恢复）
    const settingsRoute = mounted.routes.get('/api/dsh-codegraph/settings')
    expect(settingsRoute, '未注册 /settings 路由').toBeDefined()
    await postJson(settingsRoute!, { mcpScope: 'per-agent' }, '/api/dsh-codegraph/settings')
    await wait(300)
    const suspended = readFileSync(profilePatch, 'utf8')
    expect(suspended, '挂起后应只剩空占位').toContain('- insert: []')

    await postJson(settingsRoute!, { mcpScope: 'managed' }, '/api/dsh-codegraph/settings')
    await wait(300)
    const after = readFileSync(profilePatch, 'utf8')

    expect(after, 'CG71：恢复后不该残留空占位').not.toContain('- insert: []')
    expect(after, '恢复后应与挂起前逐行一致').toBe(before)
  })

  it('per-agent：profile 层的托管行也被挂起（互斥语义不因换层而丢失）', async () => {
    const dir = indexedDir('cg70-peragent-')
    writeFileSync(homePatch, ownBlock('/tmp/OLD-PA') + '\n')
    const profileDir = join(dshHome, 'profiles', 'test')
    mkdirSync(profileDir, { recursive: true })
    const profilePatch = join(profileDir, 'cordis.patch.yml')
    rmSync(profilePatch, { force: true })

    // per-agent 的**前提**是宿主有 agent 事件面（scope.ts 的既定语义：拿不到就退回
    // managed）。这条用例验的是「换层之后互斥还在」，所以必须把前提备齐——否则测到
    // 的是「没事件面就退 managed」那条既有判据，与本缺陷无关。
    mount({ command: echoCli, defaultPath: dir, mcpScope: 'per-agent', announceToAgent: false, usageGuidance: false }, profilePatch, { agents: true })
    await wait(250)

    /*
     * 判据是「per-agent 生效时，**两层都不存在启用中的托管行**」，而不是「profile 层
     * 里写着 `- insert: []`」：本 profile 的层原先没有托管块时，挂起等于「不需要写」，
     * 文件可以根本不被创建（这是正确行为，别为了凑断言去凭空造文件）。
     */
    const profileText = existsSync(profilePatch) ? readFileSync(profilePatch, 'utf8') : ''
    expect(profileText, 'per-agent 下不该有启用的托管行').not.toContain('mcp-codegraph-managed')
    expect(readFileSync(homePatch, 'utf8'), 'home 层的旧块仍被清掉').not.toContain(OWN_START)
  })
})
