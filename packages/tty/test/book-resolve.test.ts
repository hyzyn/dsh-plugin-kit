/**
 * @hyzyn/dsh-tty — 连接簿名字的**可发现性**（D104）。
 *
 * 用户现场（2026-11-04）：同一台机器在部署里有三套名字——终端面板下拉显示
 * `user@host`、docker 目标名、而 `sftp_*` / 隧道真正认的是连接簿条目名。旧实现只认
 * 条目名，报错又只说「连接簿中不存在: X」，于是 agent 只能猜（连错两次很常见），
 * 第三条路是去读 `cordis.patch.yml`——**那个文件里有明文密码**。能力配了却不可发现，
 * 等于没配。
 *
 * 本文件钉三件事：
 *
 *   1. **解析判据**：条目名精确优先；`host` / `host:port` / `user@host` 别名**唯一**才解析，
 *      有歧义时报候选而不是猜一台（猜错就是登到另一台机器上执行命令）；
 *   2. **错误文案本身可用**：没命中时列出可用条目（name — user@host:port），把「猜」变成「照抄」；
 *   3. **凭据一个都不出来**：错误文案与 `tty_books` 的投影里不许出现 password / passphrase / keyPath。
 *
 * 出口矩阵（见 `.dsh/skills/dsh-plugin-kit/references/fix-verification.md`）：命中 / 歧义 /
 * 没命中 / 连接簿为空 / 别名与精确名同时存在（精确优先）——五个出口各有断言。
 */
// DSH_HOME 隔离（D69）：读不到开发机上的真实授权文件
import './isolated-home.js'
import { describe, expect, it } from 'vitest'
import { mountPlugin, sshHostEntry } from './mount-plugin.js'
import { bookLine, mergeSshSpec, readDockerBookAliases, resolveBook, setBookAliasSource } from '../src/index.js'
import type { SshHostEntry } from '../src/ssh.js'

/**
 * 三条过得了 `sanitizeSshHosts` 的条目。取中性主机名（仓库有 `check-internal-identifiers` /
 * `check-no-public-ip` 守卫，真实主机名与内网 IP 一律不进夹具）。
 *
 * `KB_TWIN_*` 是刻意的同 host 双条目：用来钉「歧义时不许猜」。
 */
const HOSTS = [
  { name: 'KB_JUMP_01', host: 'host-a.example', port: 22, username: 'root', auth: 'password', password: 'env:DEMO_A_PASSWORD' },
  { name: 'KB_APP', host: 'host-b.example', port: 2222, username: 'deploy', auth: 'key', keyPath: '/home/demo/.ssh/id_demo' },
  { name: 'KB_TWIN_ROOT', host: 'host-twin.example', port: 22, username: 'root', auth: 'agent' },
  { name: 'KB_TWIN_OPS', host: 'host-twin.example', port: 22, username: 'ops', auth: 'agent' },
] as unknown as SshHostEntry[]

const resolveHost = (name: unknown): ReturnType<typeof resolveBook> => resolveBook(HOSTS, name)

describe('resolveBook：条目名 → host → user@host（唯一才解析）', () => {
  it('条目名精确命中（与旧行为逐字一致）', () => {
    expect(resolveHost('KB_JUMP_01').entry?.host).toBe('host-a.example')
  })

  it('host 别名：唯一时解析（docker 目标名常与 host 同名）', () => {
    expect(resolveHost('host-a.example').entry?.name).toBe('KB_JUMP_01')
  })

  it('host:port 与 user@host 也认（面板下拉显示的就是 user@host）', () => {
    expect(resolveHost('host-b.example:2222').entry?.name).toBe('KB_APP')
    expect(resolveHost('deploy@host-b.example').entry?.name).toBe('KB_APP')
    expect(resolveHost('root@host-a.example:22').entry?.name).toBe('KB_JUMP_01')
  })

  it('同 host 两条 → 报歧义并列出候选，**不返回 entry**', () => {
    const resolved = resolveHost('host-twin.example')
    expect(resolved.entry).toBeUndefined()
    expect(resolved.error).toContain('多条条目匹配')
    expect(resolved.error).toContain('KB_TWIN_ROOT')
    expect(resolved.error).toContain('KB_TWIN_OPS')
    // 加了用户名就唯一了（歧义是可解的，不是死路）
    expect(resolveHost('ops@host-twin.example').entry?.name).toBe('KB_TWIN_OPS')
  })

  it('没命中：错误里列**可用条目**（猜 → 照抄），且不含任何凭据', () => {
    const resolved = resolveHost('no-such-book')
    expect(resolved.entry).toBeUndefined()
    for (const entry of HOSTS as unknown as Array<{ name: string; username: string; host: string; port: number }>) {
      expect(resolved.error).toContain(entry.name)
      expect(resolved.error).toContain(`${entry.username}@${entry.host}:${String(entry.port)}`)
    }
    expect(resolved.error).toContain('host 或 user@host')
    expect(resolved.error, '错误文案不许把凭据带出来').not.toContain('env:DEMO_A_PASSWORD')
    expect(resolved.error).not.toContain('/home/demo/.ssh/id_demo')
  })

  it('连接簿为空：文案指向**用户能做的动作**，不是继续猜', () => {
    const resolved = resolveBook([], 'anything')
    expect(resolved.entry).toBeUndefined()
    expect(resolved.error).toContain('一条连接簿条目都没有')
    expect(resolved.error).toContain('终端面板')
  })

  it('空 book 与 finder 时代的文案保持一句（不改调用方的判据）', () => {
    expect(resolveHost('   ').error).toBe('book 必须是 SSH 连接簿条目名')
  })
})

describe('mergeSshSpec：与 resolveBook 同一套判据（不许两处各算一遍）', () => {
  it('book 传 host 别名也能解析出完整规格', () => {
    const merged = mergeSshSpec(HOSTS, 'host-b.example', {})
    expect(merged.error).toBeUndefined()
    expect(merged.spec).toMatchObject({ host: 'host-b.example', port: 2222, username: 'deploy', auth: 'key' })
  })

  it('内联字段仍然覆盖连接簿（别名解析不改变覆盖语义）', () => {
    const merged = mergeSshSpec(HOSTS, 'host-a.example', { username: 'ops', port: 2200 })
    expect(merged.spec).toMatchObject({ host: 'host-a.example', port: 2200, username: 'ops' })
  })

  it('没命中的错误与 resolveBook **逐字相同**（单一真相源）', () => {
    const viaResolve = resolveHost('no-such-book').error
    expect(mergeSshSpec(HOSTS, 'no-such-book', {}).error).toBe(viaResolve)
  })

  it('不给 book 时不需要连接簿（内联规格照旧可用）', () => {
    const merged = mergeSshSpec([], '', { host: 'host-c.example', username: 'demo' })
    expect(merged.spec).toMatchObject({ host: 'host-c.example', username: 'demo' })
  })
})

describe('tty_books：agent 侧唯一的枚举入口（只回拓扑，不回凭据）', () => {
  it('返回 name / host / port / username / auth，且**没有**任何凭据字段', async () => {
    const mounted = mountPlugin({ sshHosts: HOSTS })
    const tool = mounted.tools.get('tty_books')
    expect(tool, 'tty_books 没注册（它是无条件注册的基础工具）').toBeDefined()
    const value = await tool?.execute?.({}) as { count: number; books: Array<Record<string, unknown>> }
    expect(value.count).toBe(4)
    expect(value.books.map((book) => book.name)).toEqual(['KB_JUMP_01', 'KB_APP', 'KB_TWIN_ROOT', 'KB_TWIN_OPS'])
    for (const book of value.books) {
      expect(Object.keys(book).sort()).not.toContain('password')
      expect(Object.keys(book).sort()).not.toContain('passphrase')
      expect(Object.keys(book).sort()).not.toContain('keyPath')
    }
    expect(JSON.stringify(value), '凭据值不许进 agent 上下文').not.toContain('DEMO_A_PASSWORD')
    // B33 同款口径：宿主按 output.schema（additionalProperties:false）校验返回值，
    // 漏声明的键让整次调用变成 Error——所以「返回值 ⊆ 声明」是硬约束，不是风格问题。
    const schema = tool?.output?.schema as { properties?: { books?: { items?: { properties?: Record<string, unknown> } } } } | undefined
    const bookProps = Object.keys(schema?.properties?.books?.items?.properties ?? {})
    expect(bookProps, 'schema 声明丢了').toContain('name')
    for (const book of value.books) {
      for (const key of Object.keys(book)) expect(bookProps, `${key} 没在 tty_books 的 output.schema 里声明`).toContain(key)
    }
    // 面板下拉那套写法能从上面对出号（username + host）：agent 不必猜 book
    expect(value.books[1]).toMatchObject({ username: 'deploy', host: 'host-b.example', port: 2222 })
  })

  it('渲染文本给出「name — user@host:port」，并说明这个 name 被谁引用', () => {
    const mounted = mountPlugin({ sshHosts: [sshHostEntry('KB_DEMO')] })
    const tool = mounted.tools.get('tty_books')
    const value = { count: 1, books: [{ name: 'KB_DEMO', host: '127.0.0.1', port: 22, username: 'demo', auth: 'agent' }] }
    const blocks = tool?.output?.render?.({}, value) ?? []
    const text = blocks.map((block) => block.text ?? '').join('')
    expect(text).toContain('KB_DEMO — demo@127.0.0.1:22')
    expect(text).toContain('docker 目标的连接簿')
  })

  it('连接簿为空：空态也是**答案**（指路去配，而不是让 agent 继续猜）', async () => {
    const mounted = mountPlugin()
    const tool = mounted.tools.get('tty_books')
    const value = await tool?.execute?.({}) as { count: number; books: unknown[]; dockerTargets: unknown[] }
    expect(value).toMatchObject({ count: 0, books: [] })
    expect(value.dockerTargets).toEqual([])
    const blocks = tool?.output?.render?.({}, value) ?? []
    expect(blocks.map((block) => block.text ?? '').join('')).toContain('连接簿是空的')
  })
})

describe('bookLine：错误文案与工具投影共用的一行口径', () => {
  it('只含 name 与拓扑，不含凭据', () => {
    const line = bookLine(HOSTS[0])
    expect(line).toBe('KB_JUMP_01 — root@host-a.example:22')
    expect(line).not.toContain('DEMO_A_PASSWORD')
  })
})

/**
 * D104 补：**docker 目标名也当 book 用**。
 *
 * 用户现场（截图）：docker 卡片上那条目标写着 `kb-target`，而它的「连接簿」下拉里选的是
 * `KB_APP`——同一台机器两张皮。agent 手上只有卡片上的名字，于是 `sftp_read book=kb-target`
 * 必然失败。只靠「报错列条目」能救一次，但救不了「它以为目标名就是条目名」这个前提；所以把
 * docker 命名空间里的「目标名 → 条目名」读出来当**别名**：目标名直接解析到它引用的条目。
 */
describe('D104 补：docker 目标名当 book（别名解析）', () => {
  const ALIASES = [{ target: 'kb-target', book: 'KB_JUMP_01' }]

  it('目标名命中别名 → 解析到它引用的条目（现场这一步就不再报错了）', () => {
    expect(resolveBook(HOSTS, 'kb-target', ALIASES).entry?.name).toBe('KB_JUMP_01')
  })

  it('真条目名优先于同名别名（升级不改任何现有配置的语义）', () => {
    const shadow = [{ target: 'KB_APP', book: 'KB_TWIN_OPS' }]
    expect(resolveBook(HOSTS, 'KB_APP', shadow).entry?.name).toBe('KB_APP')
  })

  it('别名指向的条目已不存在 → 点名两个名字，不静默退回「不存在」', () => {
    const resolved = resolveBook(HOSTS, 'stale-target', [{ target: 'stale-target', book: 'GONE_BOOK' }])
    expect(resolved.entry).toBeUndefined()
    expect(resolved.error).toContain('stale-target')
    expect(resolved.error).toContain('GONE_BOOK')
  })

  it('mergeSshSpec 走同一条别名（终端 / SFTP / 探针共用一个入口）', () => {
    const merged = mergeSshSpec(HOSTS, 'kb-target', {}, ALIASES)
    expect(merged.error).toBeUndefined()
    expect(merged.spec).toMatchObject({ host: 'host-a.example', username: 'root', port: 22 })
  })

  it('readDockerBookAliases：只收 kind=ssh 且有 book 的目标（本机 / 内联目标不进别名）', () => {
    const ctx = {
      settings: {
        describe: () => [{
          ns: 'docker',
          value: {
            targets: [
              { name: 'kb-target', kind: 'ssh', book: 'KB_APP' },
              { name: 'local', kind: 'local', book: '' },
              { name: 'inline-target', kind: 'ssh', book: '', host: 'host-c.example', username: 'demo' },
              { name: 'blank-book', kind: 'ssh', book: '   ' },
            ],
          },
        }],
        update: async () => {},
      },
    }
    expect(readDockerBookAliases(ctx as never)).toEqual([{ target: 'kb-target', book: 'KB_APP' }])
  })

  it('读不到 docker 命名空间 / describe 抛错 / 没有 settings 服务 → 空表（退化，不抛）', () => {
    expect(readDockerBookAliases({ settings: { describe: () => [], update: async () => {} } } as never)).toEqual([])
    expect(readDockerBookAliases({
      settings: { describe: () => { throw new Error('boom') }, update: async () => {} },
    } as never)).toEqual([])
    expect(readDockerBookAliases({} as never)).toEqual([])
  })

  it('tty_books 把别名表一并列出（两套名字的对应关系可发现）', async () => {
    // 先 mount 再装配别名：`apply()` 里的 settings 注入会按真实的 docker 命名空间装一次来源
    //（夹具里是空表），所以测试自己的来源必须**后**设，否则会被它覆盖掉。
    const mounted = mountPlugin({ sshHosts: HOSTS })
    setBookAliasSource(() => ALIASES)
    try {
      const tool = mounted.tools.get('tty_books')
      const value = await tool?.execute?.({}) as { dockerTargets: Array<{ target: string; book: string }> }
      expect(value.dockerTargets).toEqual(ALIASES)
      const text = (tool?.output?.render?.({}, value) ?? []).map((block) => block.text ?? '').join('')
      expect(text).toContain('kb-target → KB_JUMP_01')
    } finally {
      setBookAliasSource(undefined)
    }
  })

  it('别名来源自己抛错 → 当成没有别名（不许把连接路径带下去）', async () => {
    const mounted = mountPlugin({ sshHosts: HOSTS })
    setBookAliasSource(() => {
      throw new Error('boom')
    })
    try {
      const value = await mounted.tools.get('tty_books')?.execute?.({}) as { dockerTargets: unknown[] }
      expect(value.dockerTargets).toEqual([])
    } finally {
      setBookAliasSource(undefined)
    }
  })
})
