/**
 * @hyzyn/dsh-env — 启动注入的**时序**守卫（2026-10-09 真机回归）。
 *
 * 现场：同一份 mcp 服务器配置，web profile 里卡片「运行中」，desktop profile 里
 * `chat2db` 报 `ValidationError: … headers?: { [key: string]: string } … but got {…,"headers":{}}`
 * （冷启动日志末尾「1 entry did not activate」），`jenkins` 条目挂载了却工具数 0。
 *
 * 根因不是配置内容、也不是网络与凭据本身：
 *
 *   - mcp 的认证头是 `!!js` 表达式，**在加载器组装该条目配置的那一刻**求值：
 *       Authorization: !!js '''Basic '' + Buffer.from(process.env.JENKINS_USER + '':'' + process.env.JENKINS_AUTH).toString(''base64'')'
 *       X-Chat2DB-MCP-Token: !!js process.env.CHAT2DB_AUTH
 *   - 而 env.yml 里这三个键都是 `secret: true` **且没有内联 `value`**（明文在
 *     `~/.dsh/.credentials.yaml` 的 refs），旧的同步那一步会跳过它们，全靠
 *     `ctx.inject(['credentials'])` 里那条**异步**注入补——它要等 seam 注入 + 读文件。
 *   - 两个 profile 的组合树条目间距不同（web 隔 600+ 条、desktop 只隔 13 条），
 *     于是 desktop 输掉竞态：求值成 `undefined` 之后两种 header 各有一种下场——
 *     裸表达式让 `headers` 变成 `{}` 被 core 的 config 校验拒绝（整条不激活），
 *     字符串拼接照常产出合法字符串 → 服务端 401（卡片「未连接」、工具 0 个）。
 *
 * 本文件钉住的**唯一不变式**是那句「apply() 返回时，ref 托管的密钥必须已经在
 * process.env 里」——所以头两条用例里的断言**刻意不 await、不冲微任务**：它们要证明
 * 值不是异步那条路补上的。任何把注入挪回异步（或让 apply() 去等 seam）的改动都会
 * 让它们变红。反向验证只在用时做：把 `apply()` 里那次 `applyStoreRefsToProcessEnv`
 * 调用去掉，下面这组用例立刻红。
 *
 * 其余用例是边界与反例：内联 value 按原语义生效、`secret: true` + 内联空串仍按 ref
 * 托管、凭据文件缺失/损坏时既不抛也不删已有 env、继承的启动环境值不被覆盖、
 * 两个开关关掉时不注入。
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { apply, readManagedEntries, readStoreRefs } from '../src/index.js'

const MARK_START = '# --- dsh-env-manager managed (auto-generated; do not edit) ---'
const MARK_END = '# --- end dsh-env-manager managed ---'

/** 用例会碰的进程环境键：逐个存原值，收尾一律还原。 */
const TOUCHED_KEYS = ['JENKINS_USER', 'JENKINS_AUTH', 'CHAT2DB_AUTH', 'PLAIN_ONE', 'INLINE_SECRET', 'INHERITED']

let dir: string
let envFile: string
let credsFile: string
let savedKeys: Record<string, string | undefined> = {}
const originalEnvFile = process.env.DSH_ENV_FILE
const originalCredsFile = process.env.DSH_ENV_CREDENTIALS_FILE
const originalDshHome = process.env.DSH_HOME

/** 写 env.yml 托管区块（原文，不经 writeManagedEntries，便于写出「内联空串」这类形态）。 */
function writeBlock(lines: string[]): void {
  writeFileSync(envFile, [MARK_START, ...lines, MARK_END, ''].join('\n'))
}

/** 写凭据文档（version 1 + refs + records，与上游 dsh-credentials-local 同形状）。 */
function writeCreds(refs: Record<string, string>, records?: string): void {
  const rows = Object.entries(refs).map(([key, value]) => `  ${key}: ${JSON.stringify(value)}`)
  const tail = records === undefined ? [] : records.split('\n')
  writeFileSync(credsFile, ['version: 1', 'refs:', ...rows, 'records:', ...tail, ''].join('\n'))
}

/**
 * 只喂 credentials 一条 inject 的最小 ctx（webServer / systemPrompt 的回调不触发）。
 * `seam === null` 表示宿主没有凭据服务——异步那条路一步都不会跑，于是同步断言
 * 只可能由**同步预注入**满足。
 */
function fakeCtx(seam: unknown | null): unknown {
  return {
    inject(names: string[], callback: (ctx: unknown) => unknown) {
      if (seam !== null && names.includes('credentials')) callback({ credentials: seam })
    },
    effect: () => {},
  }
}

/** 默认 seam：describe/resolve 都答「没有」，只用于让异步那条路正常跑完、不干扰同步断言。 */
function inertSeam(): unknown {
  return {
    describe: async () => ({ configured: false, writable: true }),
    resolve: async () => undefined,
    set: async () => {},
    unset: async () => {},
  }
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'dsh-env-startup-'))
  envFile = join(dir, 'env.yml')
  credsFile = join(dir, '.credentials.yaml')
  process.env.DSH_ENV_FILE = envFile
  process.env.DSH_ENV_CREDENTIALS_FILE = credsFile
  savedKeys = {}
  for (const key of TOUCHED_KEYS) {
    savedKeys[key] = process.env[key]
    delete process.env[key]
  }
})

afterEach(() => {
  if (originalEnvFile === undefined) delete process.env.DSH_ENV_FILE
  else process.env.DSH_ENV_FILE = originalEnvFile
  if (originalCredsFile === undefined) delete process.env.DSH_ENV_CREDENTIALS_FILE
  else process.env.DSH_ENV_CREDENTIALS_FILE = originalCredsFile
  if (originalDshHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = originalDshHome
  for (const [key, value] of Object.entries(savedKeys)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  rmSync(dir, { recursive: true, force: true })
})

describe('readStoreRefs（凭据文档 refs 的同步读取）', () => {
  it('只取 refs：records 与其它顶层键不进结果', () => {
    writeCreds({ JENKINS_AUTH: 's3cr3t', CHAT2DB_AUTH: 'chat2db-token' }, '  "openai/default":\n    type: api-key\n    env: OPENAI_API_KEY')
    expect(readStoreRefs()).toStrictEqual({ JENKINS_AUTH: 's3cr3t', CHAT2DB_AUTH: 'chat2db-token' })
  })

  it('容错：文件不存在 / 解析失败 / 非映射 / 无 refs 段一律返回空对象，不抛', () => {
    expect(readStoreRefs()).toStrictEqual({}) // 文件不存在
    writeFileSync(credsFile, 'version: 1\nrefs: [unclosed\n')
    expect(readStoreRefs()).toStrictEqual({}) // 解析失败
    writeFileSync(credsFile, '- just\n- a list\n')
    expect(readStoreRefs()).toStrictEqual({}) // 顶层不是映射
    writeFileSync(credsFile, 'version: 1\nrecords: {}\n')
    expect(readStoreRefs()).toStrictEqual({}) // 没有 refs 段
    writeFileSync(credsFile, 'version: 1\nrefs:\n  BAD: 123\n  EMPTY: ""\n')
    expect(readStoreRefs()).toStrictEqual({}) // 非字符串 / 空串不是文档里的合法值（上游同样拒绝）
  })
})

describe('启动期同步预注入（ref 托管密钥）', () => {
  it('apply() 返回时值已就位：mcp 的两条 !!js 认证头当场求值出真凭据（不 await、不冲微任务）', () => {
    writeBlock([
      '- key: JENKINS_USER',
      '  secret: true',
      '- key: JENKINS_AUTH',
      '  secret: true',
      '- key: CHAT2DB_AUTH',
      '  secret: true',
    ])
    writeCreds({ JENKINS_USER: 'mcp-ro', JENKINS_AUTH: 's3cr3t', CHAT2DB_AUTH: 'chat2db-token' })

    // 宿主没有凭据服务：异步那条路一步都不跑，值只可能来自同步预注入。
    apply(fakeCtx(null) as never, { announceToAgent: false })

    // 下面两行就是 mcp 条目里 !!js 头的求值语义，**紧接着 apply() 同步执行**——
    // 这正是加载器组装 mcp 配置的时刻。
    //   Authorization: !!js '''Basic '' + Buffer.from(process.env.JENKINS_USER + '':'' + process.env.JENKINS_AUTH).toString(''base64'')'
    const authorization = 'Basic ' + Buffer.from(process.env.JENKINS_USER + ':' + process.env.JENKINS_AUTH).toString('base64')
    expect(authorization).toBe('Basic ' + Buffer.from('mcp-ro:s3cr3t').toString('base64'))
    //   X-Chat2DB-MCP-Token: !!js process.env.CHAT2DB_AUTH
    // 求值成 undefined 会让 headers 变成 {}，core 的 config 校验直接拒绝整条。
    expect(process.env.CHAT2DB_AUTH).toBe('chat2db-token')
  })

  it('凭据 seam 在场时同样同步落地（异步那条路此后只做对账）', () => {
    writeBlock(['- key: CHAT2DB_AUTH', '  secret: true'])
    writeCreds({ CHAT2DB_AUTH: 'chat2db-token' })

    // resolve 恒答 undefined：异步对账即便跑完，也不会把值写成 chat2db-token。
    apply(fakeCtx(inertSeam()) as never, { announceToAgent: false })
    expect(process.env.CHAT2DB_AUTH).toBe('chat2db-token')
  })

  it('只补空位：继承自启动环境的值不被凭据文档覆盖', () => {
    writeBlock(['- key: INHERITED', '  secret: true'])
    writeCreds({ INHERITED: 'from-store' })
    process.env.INHERITED = 'from-launch-env'

    apply(fakeCtx(null) as never, { announceToAgent: false })
    expect(process.env.INHERITED).toBe('from-launch-env')
  })

  it('反例：凭据文件缺失时既不抛，也不删/不改一个已经存在的 env 值', () => {
    writeBlock(['- key: CHAT2DB_AUTH', '  secret: true'])
    process.env.CHAT2DB_AUTH = 'inherited-token'

    expect(() => apply(fakeCtx(null) as never, { announceToAgent: false })).not.toThrow()
    expect(process.env.CHAT2DB_AUTH).toBe('inherited-token')

    // 文件在、但没有这个键：同样什么都不做
    writeCreds({ SOME_OTHER_KEY: 'x' })
    expect(() => apply(fakeCtx(null) as never, { announceToAgent: false })).not.toThrow()
    expect(process.env.CHAT2DB_AUTH).toBe('inherited-token')
  })

  it('反例：损坏的凭据文档不阻塞插件（仍返回空 refs，env.yml 该生效的照常生效）', () => {
    writeBlock(['- key: PLAIN_ONE', '  value: plain-value', '  secret: false', '- key: CHAT2DB_AUTH', '  secret: true'])
    writeFileSync(credsFile, 'version: 1\nrefs: [unclosed\n')

    expect(() => apply(fakeCtx(null) as never, { announceToAgent: false })).not.toThrow()
    expect(process.env.PLAIN_ONE).toBe('plain-value')
    expect(process.env.CHAT2DB_AUTH).toBeUndefined()
  })

  it('secret + 内联空串仍按 ref 托管（与缺 value 字段同义，不得退回「权威空值」）', () => {
    writeBlock(['- key: CHAT2DB_AUTH', "  value: ''", '  secret: true'])
    writeCreds({ CHAT2DB_AUTH: 'chat2db-token' })

    expect(readManagedEntries().entries).toStrictEqual([{ key: 'CHAT2DB_AUTH', value: undefined, secret: true }])
    apply(fakeCtx(null) as never, { announceToAgent: false })
    expect(process.env.CHAT2DB_AUTH).toBe('chat2db-token')
  })

  it('反例：内联 value 条目按原语义生效（有值写入、空串删除），不受预注入影响', () => {
    writeBlock([
      '- key: PLAIN_ONE',
      '  value: plain-value',
      '  secret: false',
      '- key: INHERITED',
      "  value: ''",
      '  secret: false',
    ])
    // refs 里恰好有同名键也不该改变普通条目的语义（只处理 secret 条目）
    writeCreds({ PLAIN_ONE: 'from-store', INHERITED: 'from-store' })
    process.env.INHERITED = 'stale'

    apply(fakeCtx(null) as never, { announceToAgent: false })
    expect(process.env.PLAIN_ONE).toBe('plain-value')
    expect(process.env.INHERITED).toBeUndefined() // 普通条目的空串＝删除该变量
  })

  it('secret 条目带内联明文时，明文胜出（迁移前后的过渡形态）', () => {
    writeBlock(['- key: INLINE_SECRET', '  value: inline-plain', '  secret: true'])
    writeCreds({ INLINE_SECRET: 'from-store' })

    apply(fakeCtx(null) as never, { announceToAgent: false })
    expect(process.env.INLINE_SECRET).toBe('inline-plain')
  })

  it('反例：secretsInCredentials: false 时不从凭据文档注入（那种模式下存储不是真源）', () => {
    writeBlock(['- key: CHAT2DB_AUTH', '  secret: true'])
    writeCreds({ CHAT2DB_AUTH: 'chat2db-token' })

    apply(fakeCtx(null) as never, { announceToAgent: false, secretsInCredentials: false })
    expect(process.env.CHAT2DB_AUTH).toBeUndefined()
  })

  it('反例：applyToProcessEnv: false 时完全不碰 process.env', () => {
    writeBlock(['- key: PLAIN_ONE', '  value: plain-value', '  secret: false', '- key: CHAT2DB_AUTH', '  secret: true'])
    writeCreds({ CHAT2DB_AUTH: 'chat2db-token' })

    apply(fakeCtx(null) as never, { announceToAgent: false, applyToProcessEnv: false })
    expect(process.env.PLAIN_ONE).toBeUndefined()
    expect(process.env.CHAT2DB_AUTH).toBeUndefined()
  })

  it('路径推导：DSH_ENV_CREDENTIALS_FILE 未设时取 $DSH_HOME/.credentials.yaml', () => {
    delete process.env.DSH_ENV_CREDENTIALS_FILE
    process.env.DSH_HOME = dir
    writeBlock(['- key: CHAT2DB_AUTH', '  secret: true'])
    writeFileSync(join(dir, '.credentials.yaml'), 'version: 1\nrefs:\n  CHAT2DB_AUTH: "from-dsh-home"\nrecords:\n')

    apply(fakeCtx(null) as never, { announceToAgent: false })
    expect(process.env.CHAT2DB_AUTH).toBe('from-dsh-home')
  })
})
