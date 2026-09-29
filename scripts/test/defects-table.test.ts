/**
 * 缺陷台账**语义层**守卫的用例 —— `scripts/defects-table.mjs`。
 *
 * ## 为什么有这份用例
 *
 * `DEFECTS.md` 的索引表是权威，但它的上界被**手抄**在四个地方（L0 查表、包内文件头自称、
 * 「接在 Dxx 之后」、**包内文件头复述别的包的范围**）。实测（2026-09-26 现算）：
 * `tty` 的文件头写着 `D01–D63`（实际 67）、把 `docker` 写成 `D01–D138`（实际 140）；
 * `docker` 的文件头把 `tty` 写成 `D01–D66`（实际 67）；`kit` 让新缺陷「接在 `D05` 之后」
 * （实际应接 `D07` 之后）；`docs/conventions.md` 的表里 `docker`/`tty` 各少 2 / 6。
 * 而**没有任何东西会红**：`check-doc-links.mjs` 只查链接与锚点（数字不是链接），
 * `codegraph` 自带的 `defects-ledger.test.ts` 只核它自己那一份。
 *
 * ## 这份用例守两件事
 *
 * 1. **真实仓库必须通过**（A/B/C 三类句式 + 台账自洽 + kit 那行的两段范围
 *    + **`✓` 列（L2 侧）**：标了「代码/测试里引用了该编号」的，包内就得真有这个编号）；
 * 2. **守卫必须会红**——本仓刚发生过一道「命中 0 个文件、恒绿、拦不住任何东西」的闸门
 *    （lib 产物闸门那条写错的 pathspec：命中 0 个文件），所以任何新守卫都要自证会红。
 *    反例**全部用 fixture 造**（在真实文本上做一次字符串替换，并断言替换真的生效），
 *    **不修改任何受版本控制的文件**；而且反例里用的**就是历史上真实漂过的那些值**
 *    （`docker D138` / `tty D61` / tty 自称 `D63` / docker 把 tty 写成 `D66` / kit 接 `D05`），
 *    所以这组用例同时是「守卫能不能拦住那次真实漂移」的证明。
 *
 * 反向禁止（与 `docs/conventions.md` 硬规矩一致）：守卫报红时只改文档侧；
 * 绝不为让它变绿去增删 / 重排 / 改号任何台账行。
 */
import { describe, expect, it } from 'vitest'
import {
  LEDGER_SPECS,
  checkDefectsTable,
  checkRepo,
  computeFacts,
  readDefectsInputs,
} from '../defects-table.mjs'

/** 真实仓库的 5 份文本（只读；反例都在它的副本上改）。 */
const real = readDefectsInputs()
const facts = new Map(computeFacts().map((fact) => [fact.name, fact]))

/** 在真实文本上做一次替换造 fixture；**替换没生效就抛**（否则反例会变成空测试）。 */
function mutate(text: string, from: string, to: string): string {
  if (!text.includes(from)) throw new Error(`fixture 替换没匹配上：${from.slice(0, 60)}`)
  const mutated = text.replace(from, to)
  expect(mutated, 'fixture 必须真的改动文本').not.toBe(text)
  return mutated
}

/** 在某个包的台账 fixture 上跑守卫。 */
function checkWithLedger(name: string, text: string, sources = real.sources) {
  return checkDefectsTable({ ledgers: { ...real.ledgers, [name]: text }, conventions: real.conventions, sources })
}

/** 在 conventions fixture 上跑守卫。 */
function checkWithConventions(text: string) {
  return checkDefectsTable({ ledgers: real.ledgers, conventions: text, sources: real.sources })
}

const kinds = (diffs: { kind: string }[]) => diffs.map((diff) => diff.kind)

describe('缺陷台账：现算（唯一真值来源）', () => {
  it('四包都能读到索引表，且编号连续、无空号、唯一号数 == 最大号', () => {
    expect(LEDGER_SPECS.map((spec) => spec.name)).toEqual(['docker', 'tty', 'codegraph', 'kit'])
    for (const spec of LEDGER_SPECS) {
      const fact = facts.get(spec.name)
      expect(fact, `${spec.name} 没算出来`).toBeDefined()
      expect(fact.rows, `${spec.name} 索引表一行都没读到（表格标题/小节范围写错了？）`).toBeGreaterThan(0)
      expect(fact.gaps, `${spec.name} 有空号`).toEqual([])
      expect(fact.unique, `${spec.name} 唯一号数应等于最大号（编号从 01 起连续）`).toBe(fact.max)
      expect(fact.statuses.length, `${spec.name} 没有加粗的现状行`).toBeGreaterThan(0)
      for (const status of fact.statuses) {
        // 已修 + 已关闭 == 唯一号数（codegraph 是唯一有「已关闭」列的包，显式参与等式）
        expect(status.fixed + status.closed, `${spec.name} 现状行数字与表内不一致`).toBe(fact.unique)
        expect(status.open, `${spec.name} 待修应为 0`).toBe(0)
      }
      expect(fact.anchors.length, `${spec.name} 文件头缺「接在 … 之后」`).toBeGreaterThan(0)
      for (const anchor of fact.anchors) expect(anchor).toBe(fact.max)
    }
  })

  it('codegraph 的「已关闭」是真的当一列处理（不是当 0 蒙过去）', () => {
    const fact = facts.get('codegraph')
    expect(fact.statuses.some((status) => status.closed > 0), 'codegraph 的现状行应带「已关闭 N」').toBe(true)
    // 60 + 3 == 63：这一条只有把「已关闭」算进等式才可能成立
    expect(fact.statuses[0].fixed + fact.statuses[0].closed).toBe(fact.unique)
  })

  it('kit 是转入台账：转入行 01–05、自研行从 06 起（两段分开核）', () => {
    const fact = facts.get('kit')
    expect(Math.max(...fact.mirrorNumbers)).toBe(5)
    expect(Math.min(...fact.ownNumbers)).toBe(6)
    expect(fact.max).toBe(Math.max(...fact.ownNumbers))
  })

  it('真实仓库：A / B / C 三类复述与现算值全部一致（守卫必须绿）', () => {
    const diffs = checkRepo()
    expect(diffs.map((diff) => diff.message).join('\n')).toBe('')
    expect(diffs).toEqual([])
  })

  it('声明式清单如实写明「哪个包没有哪种句式」（不靠匹配失败兜）', () => {
    const kit = LEDGER_SPECS.find((spec) => spec.name === 'kit')
    expect(kit?.selfSequence, 'kit 是转入台账，没有「内部序列」那句，必须显式声明为 false').toBe(false)
    expect(kit?.statusLine.untilSentence, 'kit 的现状行没有「编号至」').toBe(false)
    expect(kit?.mirror, 'kit 的 A 类那行是两段范围').toBe(true)
    expect(LEDGER_SPECS.find((spec) => spec.name === 'codegraph')?.statusLine.closedColumn).toBe(true)
    // `✓` 列（L2 侧）：只有 tty 有，其余三包必须**显式**声明为没有
    expect(LEDGER_SPECS.find((spec) => spec.name === 'tty')?.codeRefs).toBe(true)
    for (const name of ['docker', 'codegraph', 'kit']) {
      expect(LEDGER_SPECS.find((spec) => spec.name === name)?.codeRefs, `${name} 没有 ✓ 列`).toBe(false)
    }
    // C 类：docker 文件头复述 tty、tty 文件头复述 docker（codegraph 写的是不带范围的 `Dxx`）
    expect(LEDGER_SPECS.find((spec) => spec.name === 'docker')?.crossRefs).toEqual(['tty'])
    expect(LEDGER_SPECS.find((spec) => spec.name === 'tty')?.crossRefs).toEqual(['docker'])
    expect(LEDGER_SPECS.find((spec) => spec.name === 'codegraph')?.crossRefs).toEqual([])
  })
})

describe('反例 1：L0 查表的数字写错 → 必须报出来', () => {
  it('把 docker 那行的上界从 D158 改回 D138 → conventions.row 差异', () => {
    const fixture = mutate(real.conventions, '| `docker` | `D` | `D01`–`D158` |', '| `docker` | `D` | `D01`–`D138` |')
    const diffs = checkWithConventions(fixture)
    expect(kinds(diffs)).toContain('conventions.row')
    const diff = diffs.find((item) => item.kind === 'conventions.row')
    expect(diff?.expected).toBe('158')
    expect(diff?.actual).toBe('138')
    expect(diff?.message).toContain('D138')
  })

  it('把 tty 那行的上界从 D84 改回 D61 → conventions.row 差异（历史值）', () => {
    const fixture = mutate(real.conventions, '| `tty` | `D` | `D01`–`D84` |', '| `tty` | `D` | `D01`–`D61` |')
    const diff = checkWithConventions(fixture).find((item) => item.kind === 'conventions.row')
    expect(diff?.expected).toBe('84')
    expect(diff?.actual).toBe('61')
  })

  it('把 kit 那行的两段范围合成一段 → conventions.kit.shape 差异', () => {
    const fixture = mutate(
      real.conventions,
      '`D06`–`D13` 是**本包自研**',
      '`D12` 起是**本包自研**',
    )
    const diffs = checkWithConventions(fixture)
    expect(kinds(diffs)).toContain('conventions.kit.shape')
  })

  it('把 kit 行的自研段停在旧号（D06–D05）→ conventions.kit.own 差异', () => {
    const fixture = mutate(real.conventions, '`D06`–`D13` 是**本包自研**', '`D05`–`D05` 是**本包自研**')
    const diffs = checkWithConventions(fixture)
    expect(kinds(diffs)).toContain('conventions.kit.own')
  })

  it('命名表举例用**上界号**（docker D158）→ conventions.example 差异', () => {
    const fixture = mutate(real.conventions, '| 缺陷编号 | 见上 | `docker D03` |', '| 缺陷编号 | 见上 | `docker D158` |')
    const diffs = checkWithConventions(fixture)
    expect(kinds(diffs)).toContain('conventions.example')
    expect(diffs.find((item) => item.kind === 'conventions.example')?.message).toContain('上界号')
  })

  it('命名表举例指向不存在的号（docker D999）→ conventions.example 差异', () => {
    const fixture = mutate(real.conventions, '| 缺陷编号 | 见上 | `docker D03` |', '| 缺陷编号 | 见上 | `docker D999` |')
    expect(kinds(checkWithConventions(fixture))).toContain('conventions.example')
  })

  it('删掉「这张表由谁核对」那句 → conventions.gatePointer 差异（文档与守卫必须成对）', () => {
    // 指针在文件里出现两处（表后说明 + 硬规矩 5），fixture 必须把两处都去掉才算「没写谁在核」
    const fixture = real.conventions.replaceAll('scripts/test/defects-table.test.ts', 'scripts/test/<没这回事>.ts')
    expect(fixture).not.toBe(real.conventions)
    expect(fixture).not.toContain('scripts/test/defects-table.test.ts')
    expect(kinds(checkWithConventions(fixture))).toContain('conventions.gatePointer')
  })
})

describe('反例 2：「接在 Dxx 之后」写成旧号 → 必须报出来', () => {
  it('tty 文件头从 D84 改回 D63（照它做会造一批重号）→ ledger.nextAnchor 差异', () => {
    const fixture = mutate(real.ledgers.tty, '新缺陷接在 `D84` 之后', '新缺陷接在 `D63` 之后')
    const diffs = checkWithLedger('tty', fixture)
    expect(kinds(diffs)).toContain('ledger.nextAnchor')
    const diff = diffs.find((item) => item.kind === 'ledger.nextAnchor')
    expect(diff?.expected).toBe('84')
    expect(diff?.actual).toBe('63')
    expect(diff?.message).toContain('造重号')
  })

  it('kit 的三处「接在 D12 之后」只要有一处写旧号就报 → ledger.nextAnchor', () => {
    const fixture = mutate(real.ledgers.kit, '直接接在 `D13` 之后编号', '直接接在 `D05` 之后编号')
    expect(kinds(checkWithLedger('kit', fixture))).toContain('ledger.nextAnchor')
  })

  it('把「接在 … 之后」整句删掉 → **报缺失**，不是静默跳过', () => {
    const fixture = mutate(real.ledgers.tty, '新缺陷接在 `D84` 之后，', '')
    expect(kinds(checkWithLedger('tty', fixture))).toContain('ledger.nextAnchor.absent')
  })
})

describe('反例 3：跨包互称的范围写错（C 类，最容易飘）→ 必须报出来', () => {
  it('docker 文件头把 tty 写成 D01–D66 → ledger.crossRef 差异', () => {
    const fixture = mutate(
      real.ledgers.docker,
      '与 `packages/tty/DEFECTS.md` 的\n> `D01–D84` **不共享**',
      '与 `packages/tty/DEFECTS.md` 的\n> `D01–D66` **不共享**',
    )
    const diffs = checkWithLedger('docker', fixture)
    expect(kinds(diffs)).toContain('ledger.crossRef')
    const diff = diffs.find((item) => item.kind === 'ledger.crossRef')
    expect(diff?.expected).toBe('84')
    expect(diff?.message).toContain('tty')
  })

  it('tty 文件头把 docker 写成 D01–D138 → ledger.crossRef 差异', () => {
    const fixture = mutate(
      real.ledgers.tty,
      '与 `packages/docker/DEFECTS.md` 的\n> `D01–D158` **不共享**',
      '与 `packages/docker/DEFECTS.md` 的\n> `D01–D138` **不共享**',
    )
    const diffs = checkWithLedger('tty', fixture)
    expect(kinds(diffs)).toContain('ledger.crossRef')
    expect(diffs.find((item) => item.kind === 'ledger.crossRef')?.expected).toBe('158')
  })

  it('把跨包那句整句删掉 → **报缺失**（C 类不许静默消失）', () => {
    const fixture = mutate(
      real.ledgers.docker,
      '与 `packages/tty/DEFECTS.md` 的\n> `D01–D84` **不共享**；',
      '',
    )
    expect(kinds(checkWithLedger('docker', fixture))).toContain('ledger.crossRef.absent')
  })
})

describe('反例 4：台账本身不自洽（唯一号数 / 最大号 / 现状行）→ 必须报出来', () => {
  it('文件头自称的范围写成旧号 → ledger.selfRange 差异', () => {
    const fixture = mutate(real.ledgers.tty, '`D01–D84` 是 `packages/tty` 内部序列', '`D01–D63` 是 `packages/tty` 内部序列')
    expect(kinds(checkWithLedger('tty', fixture))).toContain('ledger.selfRange')
  })

  it('现状行的「已修」比表内少 1 → ledger.status.fixed 差异（tty 有两处现状行，都核）', () => {
    const fixture = mutate(real.ledgers.tty, '**已修 84 / 待修 0**，编号至 `D84`。', '**已修 66 / 待修 0**，编号至 `D76`。')
    expect(kinds(checkWithLedger('tty', fixture))).toContain('ledger.status.fixed')
  })

  it('现状行的「编号至」落后于表内 → ledger.status.until 差异', () => {
    const fixture = mutate(real.ledgers.docker, '**已修 158 / 待修 0**，编号至 `D158`。', '**已修 156 / 待修 0**，编号至 `D139`。')
    expect(kinds(checkWithLedger('docker', fixture))).toContain('ledger.status.until')
  })

  it('codegraph 的「已关闭」被漏掉（63 + 3 ≠ 65）→ ledger.status.fixed 差异', () => {
    const fixture = mutate(real.ledgers.codegraph, '**已修 62 / 已关闭 3 / 待修 0**', '**已修 63 / 已关闭 3 / 待修 0**')
    expect(kinds(checkWithLedger('codegraph', fixture))).toContain('ledger.status.fixed')
  })

  it('索引表被删掉一行（出现空号）→ ledger.gap 差异（空号意味着有行被删）', () => {
    // 只删 **§1 索引表**里的那一行：`D50` 在 §2 字典里还有一行（同一个号的「为什么」）
    const lines = real.ledgers.tty.split('\n')
    const heading = lines.findIndex((line) => /^## 1\. 编号索引表/.test(line))
    const next = lines.findIndex((line, index) => index > heading && /^## /.test(line))
    expect(heading, 'tty 台账应有 §1 索引表').toBeGreaterThan(-1)
    const kept = [
      ...lines.slice(0, heading),
      ...lines.slice(heading, next).filter((line) => !/^\| D50 \|/.test(line)),
      ...lines.slice(next),
    ]
    expect(kept.length, 'fixture 必须真的删掉且只删掉一行').toBe(lines.length - 1)
    const diffs = checkWithLedger('tty', kept.join('\n'))
    expect(kinds(diffs)).toContain('ledger.gap')
    expect(diffs.find((item) => item.kind === 'ledger.gap')?.message).toContain('D50')
  })
})

describe('✓ 列（L2 侧）：台账指向代码注释的指针，必须为真', () => {
  it('真实仓库：35 个 ✓ 都在包内文件里能找到（修 D63/D64/D65 之前是 3 个找不到）', () => {
    const fact = facts.get('tty')
    expect(fact.checked.length, 'tty 表应有 ✓ 标记').toBeGreaterThan(0)
    const haystack = real.sources.tty.map((file) => file.text).join('\n')
    for (const number of fact.checked) {
      expect(new RegExp(`\\bD${String(number).padStart(2, '0')}\\b`).test(haystack), `D${number} 标了 ✓ 但包内找不到`).toBe(true)
    }
    expect(checkRepo()).toEqual([])
  })

  it('把某个 ✓ 的编号从包内文件里拿掉 → ledger.codeRefs 差异', () => {
    // 把 cite 了 D68 的文件文本换成不含 D68 的版本（fixture 只在内存里改，不动真实文件）
    const sources = {
      tty: real.sources.tty.map((file) => ({ path: file.path, text: file.text.replaceAll('D68', 'DXX') })),
    }
    const diffs = checkWithLedger('tty', real.ledgers.tty, sources)
    expect(kinds(diffs)).toContain('ledger.codeRefs')
    const diff = diffs.find((item) => item.kind === 'ledger.codeRefs')
    expect(diff?.message).toContain('D68')
    expect(diff?.message).toContain('维护规则 1')
  })

  it('把 D63 / D64 / D65 的落点注释还原成历史状态 → 三条一起报（这就是它本来该拦住的漂移）', () => {
    const strip = (text: string) => text.replaceAll('（**D63**', '（').replaceAll('（**D64**', '（').replaceAll('（**D65**', '（')
    const sources = { tty: real.sources.tty.map((file) => ({ path: file.path, text: strip(file.text) })) }
    const diffs = checkWithLedger('tty', real.ledgers.tty, sources)
    for (const number of ['D63', 'D64', 'D65']) {
      expect(diffs.some((item) => item.kind === 'ledger.codeRefs' && item.message.includes(number)), `${number} 应被报出来`).toBe(true)
    }
  })

  it('有 ✓ 列却拿不到包内文本 → **报缺失**，不静默跳过', () => {
    const diffs = checkWithLedger('tty', real.ledgers.tty, {})
    expect(kinds(diffs)).toContain('ledger.codeRefs.sources.missing')
  })

  it('✓ 被整列删掉 → ledger.codeRefs.column.absent（声明里有这一列就不能没有）', () => {
    const fixture = real.ledgers.tty.split('\n').map((line) => line.replace(/ \| ✓ \|$/, ' | |')).join('\n')
    expect(fixture).not.toBe(real.ledgers.tty)
    const diffs = checkWithLedger('tty', fixture)
    expect(kinds(diffs)).toContain('ledger.codeRefs.column.absent')
  })

  it('没有这一列的包里冒出 ✓ → ledger.codeRefs.undeclared（加了列要改声明）', () => {
    const fixture = mutate(
      real.ledgers.docker,
      '| D29 | `auth=agent` 缺 `SSH_AUTH_SOCK` 时无预检（tty 已修，docker 未跟上） | src/ssh-exec.ts |',
      '| D29 | `auth=agent` 缺 `SSH_AUTH_SOCK` 时无预检（tty 已修，docker 未跟上） | src/ssh-exec.ts | ✓ |',
    )
    expect(kinds(checkWithLedger('docker', fixture))).toContain('ledger.codeRefs.undeclared')
  })
})

describe('守卫的边界：拿不到文本 / 表被整段删掉时也要报，不许假装通过', () => {
  it('少给一份台账 → ledger.missing', () => {
    const diffs = checkDefectsTable({ ledgers: { docker: real.ledgers.docker }, conventions: real.conventions, sources: real.sources })
    expect(kinds(diffs)).toContain('ledger.missing')
  })

  it('整条加粗现状行被删掉 → ledger.status.absent（不靠匹配失败兜）', () => {
    const fixture = mutate(real.ledgers.docker, '**已修 158 / 待修 0**，编号至 `D158`。', '')
    expect(kinds(checkWithLedger('docker', fixture))).toContain('ledger.status.absent')
  })

  it('conventions 文本缺失 → conventions.missing', () => {
    expect(kinds(checkDefectsTable({ ledgers: real.ledgers }))).toContain('conventions.missing')
  })

  it('编号规范表整段删掉 → conventions.table.absent + 每行 conventions.row.absent', () => {
    const fixture = mutate(real.conventions, '## 编号规范', '## 编号约定（fixture 改名：表头不再命中）')
    const diffs = checkWithConventions(fixture)
    expect(kinds(diffs)).toContain('conventions.table.absent')
    expect(kinds(diffs).filter((kind) => kind === 'conventions.row.absent')).toHaveLength(LEDGER_SPECS.length)
  })
})
