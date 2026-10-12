/**
 * @hyzyn/dsh-plugin-kit — **`docs/permission-tier-plan.md` §2.1 的工具分类表必须与代码一致**。
 *
 * ## 为什么要有这道闸
 *
 * §2.1 那张表是「谁负责声明哪个工具的档位」的**唯一归宿**（L0），可它此前**只有文档和源码提到、
 * 没有任何守卫在看**：`grep -rl permission-tier-plan scripts/` 命中 0。
 * 后果实测过两次：
 *
 * - loglens 加 `loglens_facets` 时漏了这张表（2026-10-11 发现并补齐）；
 * - **docker 的 `docker_logs_grep` 注册了 `read`、表里却没有它**（2026-10-12 现算发现）。
 *
 * 两次都是「闸是绿的、文档是错的」——正是本仓那条判据的反面教材：**没有守卫的规矩会在下一次改动里漂掉**。
 *
 * ## 判据（双向，不是单向）
 *
 * 每个包导出自己的 `*_TIER_CLASS`（`tool → 档`），那是**注册处现算的事实**；本闸把它与表里的
 * 每一行**双向**比：
 *
 * | 差异 | 含义 |
 * |---|---|
 * | **只在代码里** | 加了工具忘了写表 → 表不再是归宿（docker 那次就是这一侧） |
 * | **只在文档里** | 删了工具忘了改表 → 表在描述一个不存在的工具 |
 * | **档不一致** | 两侧都写着，但一个 `read` 一个 `write` → 最危险的一种（表说放行、闸说拦） |
 *
 * ## 为什么解析源码文本而不是 import
 *
 * `import` 这三个包会把宿主侧的一整套依赖（ssh2 / ws / cordis）拉进本仓最底层的 `scripts/test/`
 * 用例里，为了读三个常量不值这个代价。分类表是**纯字面量对象**（`名字: '档',`），文本解析对它足够，
 * 而且和本仓既有做法一致（`panel-registry-names` / `client-lint` 都是按文本现算）。
 * 代价是解析器可能**空转**（正则写错 → 0 条 → 双向都是空集 → 恒绿），所以下面配了**条数下限**
 * 与「点名工具必须在」两条防恒绿断言。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const PLAN = join(ROOT, 'docs', 'permission-tier-plan.md')

/** 三个声明的包：表里的名字 → 它在源码里导出的那个分类表常量。 */
const PACKAGES = [
  { name: 'tty', marker: 'TTY_TIER_CLASS', dir: 'packages/tty' },
  { name: 'docker', marker: 'DOCKER_TIER_CLASS', dir: 'packages/docker' },
  { name: 'loglens', marker: 'LOGLENS_TIER_CLASS', dir: 'packages/loglens' },
]

/** 每包至少该有多少个工具（防恒绿：解析空转时这条会红，而不是让双向对账在空集上恒绿）。 */
const MIN_TOOLS_PER_PACKAGE = 5

export interface TierEntry {
  tool: string
  cls: string
}

/** 从源码文本里取 `export const <marker> … = { … }` 的 `名字: '档'` 逐条（取不到回 `null`）。 */
export function parseTierMap(text: string, marker: string): TierEntry[] | null {
  const block = new RegExp('export const ' + marker + '[^=]*= \\{([\\s\\S]*?)\\n\\}').exec(text)
  if (block === null) return null
  const entries: TierEntry[] = []
  for (const hit of block[1].matchAll(/^\s*([A-Za-z0-9_]+)\s*:\s*'([a-z]+)'\s*,?\s*$/gm)) {
    entries.push({ tool: hit[1], cls: hit[2] })
  }
  return entries
}

/**
 * 从 §2.1 的表格里取某个包那一节的 `工具 → 档`。
 *
 * 只读**第二格**（工具格）：第三格「判据」里也常出现反引号包着的工具名（比如 tty 那行的
 * `tty_send` / `tunnel_start`），读到它们会凭空多出一堆「只在文档里」的差异。
 */
export function parseTierTable(text: string, pkg: string): TierEntry[] {
  const lines = text.split(/\r?\n/)
  const start = lines.findIndex((line) => line.startsWith('**' + pkg + '**'))
  if (start === -1) return []
  const entries: TierEntry[] = []
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index]
    // 下一节（另一个包的 `**名字**`）或任何标题：停
    if (line.startsWith('**') || line.startsWith('#')) break
    if (!line.startsWith('|')) continue
    const cells = line.split('|')
    if (cells.length < 4) continue
    const cls = /`([a-z]+)`/.exec(cells[1])?.[1]
    if (cls === undefined) continue
    for (const hit of cells[2].matchAll(/`([A-Za-z0-9_]+)`/g)) entries.push({ tool: hit[1], cls })
  }
  return entries
}

export interface TierDiff {
  /** 代码里有、表里没有（加了工具忘了写表）。 */
  onlyInCode: TierEntry[]
  /** 表里有、代码里没有（删了工具忘了改表）。 */
  onlyInDoc: TierEntry[]
  /** 两侧都有但档不同（表说放行、闸说拦）。 */
  mismatched: Array<{ tool: string, code: string, doc: string }>
}

export function diffTier(code: TierEntry[], doc: TierEntry[]): TierDiff {
  const docMap = new Map(doc.map((entry) => [entry.tool, entry.cls]))
  const codeMap = new Map(code.map((entry) => [entry.tool, entry.cls]))
  const onlyInCode = code.filter((entry) => !docMap.has(entry.tool))
  const onlyInDoc = doc.filter((entry) => !codeMap.has(entry.tool))
  const mismatched: TierDiff['mismatched'] = []
  for (const entry of code) {
    const inDoc = docMap.get(entry.tool)
    if (inDoc !== undefined && inDoc !== entry.cls) mismatched.push({ tool: entry.tool, code: entry.cls, doc: inDoc })
  }
  return { onlyInCode, onlyInDoc, mismatched }
}

/** 在包的 `src/` 里找含该常量的那一个 `.ts`（0 个 = 常量没了；>1 个 = 名字撞了，都要报出来）。 */
function mapFileOf(pkg: { marker: string, dir: string }): string {
  const found: string[] = []
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name)
      if (statSync(full).isDirectory()) { walk(full); continue }
      if (!name.endsWith('.ts')) continue
      if (readFileSync(full, 'utf8').includes('export const ' + pkg.marker)) found.push(full)
    }
  }
  walk(join(ROOT, pkg.dir, 'src'))
  if (found.length !== 1) {
    throw new Error(pkg.marker + ' 在 ' + pkg.dir + '/src 里命中 ' + String(found.length) + ' 个文件，期望恰好 1 个：' + found.join(' / '))
  }
  return found[0]
}

function codeEntries(pkg: { marker: string, dir: string }): TierEntry[] {
  const parsed = parseTierMap(readFileSync(mapFileOf(pkg), 'utf8'), pkg.marker)
  if (parsed === null) throw new Error('解析不出 ' + pkg.marker + '（正则与源码形态漂了？）')
  return parsed
}

function planText(): string {
  return readFileSync(PLAN, 'utf8')
}

describe('§2.1 工具分类表 ↔ 各包的 *_TIER_CLASS 双向一致', () => {
  it('每包两个方向都一致（差异分三类点名，不是一句「不一致」）', () => {
    const text = planText()
    for (const pkg of PACKAGES) {
      const code = codeEntries(pkg)
      const doc = parseTierTable(text, pkg.name)
      const diff = diffTier(code, doc)
      expect(
        diff,
        '包 ' + pkg.name + ' 的分类表与 §2.1 对不上：\n'
        + diff.onlyInCode.map((entry) => '  只在代码里（加了忘写表）：' + entry.tool + ' = ' + entry.cls).join('\n')
        + diff.onlyInDoc.map((entry) => '  只在文档里（删了忘改表）：' + entry.tool + ' = ' + entry.cls).join('\n')
        + diff.mismatched.map((entry) => '  档不一致：' + entry.tool + ' 代码=' + entry.code + ' 文档=' + entry.doc).join('\n'),
      ).toEqual({ onlyInCode: [], onlyInDoc: [], mismatched: [] })
    }
  })

  it('**防恒绿**：真解析到了东西（解析空转时这条先红，上面那条才不会是空集上的恒绿）', () => {
    const text = planText()
    for (const pkg of PACKAGES) {
      const code = codeEntries(pkg)
      expect(code.length, pkg.name + ' 的分类表只解析出 ' + String(code.length) + ' 条').toBeGreaterThanOrEqual(MIN_TOOLS_PER_PACKAGE)
      const doc = parseTierTable(text, pkg.name)
      expect(doc.length, pkg.name + ' 那一节的表格只解析出 ' + String(doc.length) + ' 条').toBeGreaterThanOrEqual(MIN_TOOLS_PER_PACKAGE)
    }
  })

  it('**防恒绿**：点名几个工具必须在表里（提示词形 / 名字空间漂了会被抓到）', () => {
    const text = planText()
    const all = new Map(PACKAGES.flatMap((pkg) => parseTierTable(text, pkg.name)).map((entry) => [entry.tool, entry.cls]))
    expect(all.get('docker_logs_grep'), 'docker_logs_grep 曾经漏在这张表里（2026-10-12 补齐）').toBe('read')
    expect(all.get('loglens_facets'), 'loglens_facets 曾经漏在这张表里（2026-10-11 补齐）').toBe('read')
    expect(all.get('tty_close')).toBe('read')
    expect(all.get('docker_exec')).toBe('exec')
    expect(all.get('tunnel_start')).toBe('exec')
  })
})

describe('这道闸会红（反例，全部用 fixture）', () => {
  const code: TierEntry[] = [{ tool: 'a_read', cls: 'read' }, { tool: 'a_write', cls: 'write' }]

  it('**反例：加了工具忘写表** → 落在 onlyInCode（docker 那次就是这个形状）', () => {
    const diff = diffTier([...code, { tool: 'a_new', cls: 'read' }], code)
    expect(diff.onlyInCode).toEqual([{ tool: 'a_new', cls: 'read' }])
    expect(diff.onlyInDoc).toEqual([])
    expect(diff.mismatched).toEqual([])
  })

  it('**反例：删了工具忘改表** → 落在 onlyInDoc', () => {
    const diff = diffTier([{ tool: 'a_read', cls: 'read' }], code)
    expect(diff.onlyInDoc).toEqual([{ tool: 'a_write', cls: 'write' }])
  })

  it('**反例：档不一致**（表说 read、闸说 write）→ 落在 mismatched', () => {
    const diff = diffTier([{ tool: 'a_read', cls: 'write' }], code)
    expect(diff.mismatched).toEqual([{ tool: 'a_read', code: 'write', doc: 'read' }])
  })

  it('对照组：完全一致 → 三类都空', () => {
    expect(diffTier(code, code)).toEqual({ onlyInCode: [], onlyInDoc: [], mismatched: [] })
  })

  it('解析器：只读第二格——第三格「判据」里的反引号工具名不许被算进来', () => {
    const fixture = [
      '**demo**（名单以注册处为准）：',
      '',
      '| 类 | 工具 | 判据 |',
      '|---|---|---|',
      '| `read` | `demo_a` `demo_b` | 纯读（`demo_b` 与 `demo_c` 的对比见别处） |',
      '| `exec` | `demo_run` | 无界面（`demo_run` 就是它） |',
      '',
    ].join('\n')
    expect(parseTierTable(fixture, 'demo')).toEqual([
      { tool: 'demo_a', cls: 'read' },
      { tool: 'demo_b', cls: 'read' },
      { tool: 'demo_run', cls: 'exec' },
    ])
  })

  it('解析器：小节不存在 → 空（由「防恒绿」那两条负责把这种情况抓出来）', () => {
    expect(parseTierTable('**other**（x）：\n\n| `read` | `a` | y |\n', 'demo')).toEqual([])
  })

  it('解析器：源码块取不到 / 形态不对 → null（不静默当空表）', () => {
    expect(parseTierMap('const X = 1', 'DEMO_TIER_CLASS')).toBeNull()
    expect(parseTierMap("export const DEMO_TIER_CLASS: Record<string, TierClass> = {\n  demo_a: 'read',\n}", 'DEMO_TIER_CLASS')).toEqual([{ tool: 'demo_a', cls: 'read' }])
  })

  it('**反例（就在真实文本上动一处）**：把 docker_logs_grep 从表里删掉 → 报「只在代码里」', () => {
    const text = planText()
    const mutated = text.replace('`docker_logs_grep` `docker_stats`', '`docker_stats`')
    expect(mutated, '替换没生效：夹具已经漂了，这条反例是假的').not.toBe(text)

    const docker = PACKAGES.find((pkg) => pkg.name === 'docker')
    const diff = diffTier(codeEntries(docker as { marker: string, dir: string }), parseTierTable(mutated, 'docker'))
    expect(diff.onlyInCode.map((entry) => entry.tool)).toEqual(['docker_logs_grep'])
  })
})
