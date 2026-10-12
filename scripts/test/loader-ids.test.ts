/**
 * @hyzyn/dsh-plugin-kit — **各包的 loader entry id 不得跨包重复**（静态闸）。
 *
 * ## 为什么要有这道闸
 *
 * `insert` 的 `id` 是 **profile 级全局命名空间**。两个各自独立的 bundle 各 insert 同一个 id 时，
 * 宿主的表现是**静默遮蔽**——2026-10-12 隔离 profile 实测（四格结论与复现配方在
 * [docs/troubleshooting.md](../../docs/troubleshooting.md) 的「报 duplicate loader entry id？」那一块）：
 *
 * - 输的那个插件 `apply()` **从未被调用**（卡片不见、路由 404、工具不存在），
 * - 而宿主**照常启动、照常服务**，**一条日志都没有**——机制所在的
 *   `cordis-plugin-loader` 里 `Object.fromEntries` 按 id 建 map（同 id 后写覆盖先写），
 *   源码里 `duplicate` 零命中，**这条日志路径根本不存在**。
 *
 * 所以「本仓自己的两个包抢同一个通用词 id」这件事**运行期不会有任何提示**，只能在静态层拦。
 * 先例就在本仓：`loglens` 当初**不能**取 `logs`，因为生态里 `dsh-logbook` 已经占了那个 id
 * （见 [loglens docs/design.md §8](../../packages/loglens/docs/design.md)）。
 *
 * ## 判据（这条规则的确切形状）
 *
 * **同一个 id 只能绑一个 `name`**，反过来说：
 *
 * - **同 id 同 name = 合法**：`packages/all` 与仓库根 bundle 本来就会把每个插件行**再 insert 一遍**，
 *   内容逐字相同——同 id 撞的是同一个插件，后写覆盖先写的结果一模一样，无害。
 *   （这也是为什么判据不是「全仓 id 两两不同」——那会把聚合包本身判成违规。）
 * - **同 id 不同 name = 有害**：两个不同的插件抢同一个 id，输的那个静默消失。
 *
 * **这道闸的边界**（别当成它能干更多）：它只看**本仓**。生态里别的插件占了某个 id（`logs` 那一类）
 * 它看不见，也看不见用户 profile 里手工 insert 的行——那些只能靠 `--dump-config` 的组合层自查
 * （排查顺序见上面那份文档）。
 *
 * ## 为什么不用 `scripts/aggregate.mjs` 里那个提取函数
 *
 * 那个是**生成用**的（跟着它自己的输出格式走），而且它带 shebang——本仓已登记过
 * 「被测试 import 的 `.mjs` 带 shebang + CRLF → 整份套件加载失败」。这里用根 `devDependencies`
 * 里的 `yaml` 真解析（不是正则），对新加字段、引号风格、注释位置都不敏感。
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'
import { describe, expect, it } from 'vitest'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

export interface InsertRow {
  id: string
  name: string
  file: string
}

/** 从一个 `cordis.patch.yml` 的**文本**里取出全部 insert 行的 `(id, name)`（纯函数，喂 fixture 用）。 */
export function insertRowsOf(text: string, file: string): InsertRow[] {
  let doc: unknown
  try {
    doc = parse(text)
  } catch {
    return []
  }
  const rows: InsertRow[] = []
  for (const entry of Array.isArray(doc) ? doc : []) {
    if (entry === null || typeof entry !== 'object') continue
    const list = (entry as { insert?: unknown }).insert
    for (const item of Array.isArray(list) ? list : []) {
      if (item === null || typeof item !== 'object') continue
      const id = (item as { id?: unknown }).id
      const name = (item as { name?: unknown }).name
      if (typeof id === 'string' && id !== '') {
        rows.push({ id, name: typeof name === 'string' ? name : '', file })
      }
    }
  }
  return rows
}

/**
 * 同一个 id 绑到**不同** name 的地方（空数组 = 干净）。理由见文件头：同 id 同 name 合法。
 */
export function idNameConflicts(rows: InsertRow[]): Array<{ id: string, names: string[] }> {
  const byId = new Map<string, Set<string>>()
  for (const row of rows) {
    const names = byId.get(row.id) ?? new Set<string>()
    names.add(row.name)
    byId.set(row.id, names)
  }
  return [...byId.entries()]
    .filter(([, names]) => names.size > 1)
    .map(([id, names]) => ({ id, names: [...names].sort() }))
}

/** 盘上真实存在的 patch 文件：仓库根 bundle + 每个包自己的（`aggregate` 的产物也在这两类里）。 */
function patchFiles(): string[] {
  const files = [join(ROOT, 'cordis.patch.yml')]
  for (const name of readdirSync(join(ROOT, 'packages'))) {
    const file = join(ROOT, 'packages', name, 'cordis.patch.yml')
    if (existsSync(file)) files.push(file)
  }
  return files
}

function realRows(): { files: string[], rows: InsertRow[] } {
  const files = patchFiles()
  const rows = files.flatMap((file) => insertRowsOf(readFileSync(file, 'utf8'), file))
  return { files, rows }
}

describe('真实仓库：各包 loader id 自洽', () => {
  it('同一个 id 只绑一个 name（聚合包重复 insert 同一行是合法的，两个插件抢一个 id 不是）', () => {
    const { files, rows } = realRows()
    const conflicts = idNameConflicts(rows)
    expect(
      conflicts,
      '这些 id 被两个不同的插件抢了（运行期会静默遮蔽掉其中一个，且不会有任何日志）：\n'
      + conflicts.map((item) => '  ' + item.id + ' ← ' + item.names.join(' / ')).join('\n'),
    ).toEqual([])
    // 顺带把盘面钉一下，免得守卫在「一个文件都没读到」时恒绿
    expect(files.length).toBeGreaterThanOrEqual(13)
    expect(rows.length).toBeGreaterThanOrEqual(files.length)
  })

  it('**防恒绿**：真的读到了内容（点名几个真实 id，解析器空转时这条会红）', () => {
    const { rows } = realRows()
    const ids = new Set(rows.map((row) => row.id))
    for (const id of ['loglens', 'docker', 'tty', 'dsh-plugin-kit']) {
      expect(ids.has(id), '没解析到 id「' + id + '」——解析器可能什么都没读到（那样上面那条会恒绿）').toBe(true)
    }
    // 每个包的自有 id 都带一个包名（name 非空），否则「同 id 同 name 合法」这条会被空 name 钻空子
    expect(rows.filter((row) => row.name === '')).toEqual([])
  })

  it('`packages/all` 与仓库根 bundle 重复的是**同一行**（不是两个插件抢同一个 id）', () => {
    const { rows } = realRows()
    const duplicated = [...new Set(rows.map((row) => row.id))].filter((id) => rows.filter((row) => row.id === id).length > 1)
    expect(duplicated.length, '聚合层应当重复 insert 各插件行').toBeGreaterThan(0)
    for (const id of duplicated) {
      const names = new Set(rows.filter((row) => row.id === id).map((row) => row.name))
      expect(names.size, 'id「' + id + '」的重复行必须指向同一个包').toBe(1)
    }
  })
})

describe('这道闸会红（反例，全部用 fixture，不动任何受版本控制的文件）', () => {
  /** 一份最小的真实形状 patch 文本。 */
  const patch = (id: string, name: string): string => [
    '# 一个 bundle patch',
    '- insert:',
    '    - id: ' + id,
    "      name: '" + name + "'",
    '',
  ].join('\n')

  it('**反例：两个不同插件抢同一个 id** → 报出来', () => {
    const rows = [
      ...insertRowsOf(patch('logs', '@hyzyn/dsh-a'), 'a/cordis.patch.yml'),
      ...insertRowsOf(patch('logs', '@hyzyn/dsh-b'), 'b/cordis.patch.yml'),
    ]
    expect(idNameConflicts(rows)).toEqual([{ id: 'logs', names: ['@hyzyn/dsh-a', '@hyzyn/dsh-b'] }])
  })

  it('对照组：同 id 同 name（聚合包重复 insert）→ **不报**', () => {
    const rows = [
      ...insertRowsOf(patch('docker', '@hyzyn/dsh-docker'), 'docker/cordis.patch.yml'),
      ...insertRowsOf(patch('docker', '@hyzyn/dsh-docker'), 'all/cordis.patch.yml'),
    ]
    expect(idNameConflicts(rows)).toEqual([])
  })

  it('对照组：不同 id → 不报', () => {
    const rows = [
      ...insertRowsOf(patch('docker', '@hyzyn/dsh-docker'), 'docker/cordis.patch.yml'),
      ...insertRowsOf(patch('tty', '@hyzyn/dsh-tty'), 'tty/cordis.patch.yml'),
    ]
    expect(idNameConflicts(rows)).toEqual([])
  })

  it('**反例：就在真实文本上改一个 id**（证明这道闸拦得住「通用词 id 回潮」那个形状）', () => {
    // 把 env 包的自有 id 改成 loglens（真实存在的一个 id）——name 不动，于是「同 id 两个 name」
    const envFile = join(ROOT, 'packages', 'env', 'cordis.patch.yml')
    const text = readFileSync(envFile, 'utf8')
    const mutated = text.replace('id: env-manager', 'id: loglens')
    expect(mutated, '替换没生效：夹具已经漂了，这条反例是假的').not.toBe(text)

    const { rows } = realRows()
    const withoutEnv = rows.filter((row) => row.file !== envFile)
    const conflicts = idNameConflicts([...withoutEnv, ...insertRowsOf(mutated, envFile)])
    expect(conflicts.map((item) => item.id)).toEqual(['loglens'])
    expect(conflicts[0].names).toContain('@hyzyn/dsh-env')
  })

  it('对照组：真实文本原样喂进去 → 不报（证明上面那条反例的差异来自那一处替换）', () => {
    const envFile = join(ROOT, 'packages', 'env', 'cordis.patch.yml')
    const { rows } = realRows()
    expect(idNameConflicts(rows)).toEqual([])
    expect(rows.some((row) => row.file === envFile && row.id === 'env-manager')).toBe(true)
  })

  it('解析器本身：拿不到合法 YAML / 不是数组 / 没有 insert 键时回空数组，不抛', () => {
    expect(insertRowsOf('', 'x')).toEqual([])
    expect(insertRowsOf(': : :', 'x')).toEqual([])
    expect(insertRowsOf('foo: bar', 'x')).toEqual([])
    expect(insertRowsOf('- notAnInsert: 1', 'x')).toEqual([])
    expect(insertRowsOf('- insert: []', 'x')).toEqual([])
    // id 缺失 / 不是字符串的行被跳过（不产生「空 id」那种会互相撞的记录）
    expect(insertRowsOf('- insert:\n    - name: "@a/b"', 'x')).toEqual([])
    expect(insertRowsOf('- insert:\n    - id: 42\n      name: "@a/b"', 'x')).toEqual([])
  })
})
