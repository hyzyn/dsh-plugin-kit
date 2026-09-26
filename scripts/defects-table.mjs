#!/usr/bin/env node
/**
 * 缺陷台账的**语义层**守卫：让「手抄的编号范围」不敢漂。
 *
 * ## 为什么需要它
 *
 * 权威数据是四份 `packages/<pkg>/DEFECTS.md` 的索引表（`docker` / `tty` / `codegraph` / `kit`），
 * 但它们的范围被**复述**在四个地方，全部是手抄的：
 *
 * | # | 复述点 | 句式 |
 * |---|---|---|
 * | A | `docs/conventions.md` § 编号规范 的查表 | `` | `docker` | `D` | `D01`–`D140` | `` |
 * | B1 | 包内文件头自称本包范围 | ``` `D01`–`Dnn` 是 `packages/<pkg>` 内部序列 ``` |
 * | B2 | 包内文件头「下一条接在哪」 | ``` 新缺陷接在 `Dnn` 之后 ``` |
 * | C | **包内文件头复述*别的包*的范围** | ``` 与 `packages/<other>/DEFECTS.md` 的 `D01`–`Dnn` 不共享 ``` |
 *
 * **C 类最容易飘**：改 `tty` 的人不会想到要去改 `docker` 的文件，改 `docker` 的人也不会回头看
 * `tty`——两边都以为「那是别人的台账」。实测（2026-09-26，全部现算）：
 * `packages/docker/DEFECTS.md` 把 tty 写成 `D01–D66`（实际 67）、
 * `packages/tty/DEFECTS.md` 把 docker 写成 `D01–D138`（实际 140），同时 tty 自己写着
 * `D01–D63`（实际 67）——**照它做会一口气造出 D64–D67 四个重号**，而下一句正好就是
 * 「不得重号、不得回收空号」。
 *
 * 为什么以前没人发现：编号规范要求「阈值 / 口径 / 基线数字只增不改，发现过期只加 ⚠️ 标注」，
 * 于是这些数字一旦漂就**不会再有任何东西变红**——`check-doc-links.mjs` 只查链接与锚点（数字不是
 * 链接），`packages/codegraph/test/defects-ledger.test.ts` 只核 codegraph 自己那一份。
 * 本模块补的就是这层语义。
 *
 * ## 判据（每条都会在缺失时**报错**，不静默跳过）
 *
 * 1. **台账自洽**：唯一号数 == 最大号（编号从 01 起连续 ⇒ 空号集为空）、
 *    `已修 (+ 已关闭) == 唯一号数`、`待修 == 0`、现状行的 `编号至` == 最大号；
 * 2. **A 类**：`docs/conventions.md` 表里每包「当前范围」的上界 == 该包最大号（kit 是两段，见下）；
 * 3. **B1/B2 类**：文件头自称的范围上界 == 最大号；**每一处**「接在 `X` 之后」的 X == 最大号
 *    （kit 有三处，都得对）；
 * 4. **C 类**：文件头复述的**对方**范围上界 == 对方的最大号；
 * 5. **命名表举例**：`docs/conventions.md` § 命名 里那个例子必须是**存在且不是上界**的号
 *    （举上界就是举那个一定会过期的号——这正是它当初写 `docker D138` 的由来）。
 *
 * 句式在某个包里**确实不存在**时（`kit` 是转入台账，文件头没有「内部序列」那句；它的现状行也
 * 没有「编号至」），由 [`LEDGER_SPECS`](#LEDGER_SPECS) 里的**显式字段**声明（`selfSequence: false`
 * 等），**不是靠正则匹配失败兜过去**——静默跳过等于没有守卫。
 *
 * ## 反向禁止（比这个守卫更硬的规矩）
 *
 * 守卫报红时**只改文档侧**。绝不允许为了让守卫变绿去增删、重排任何台账行或编号——
 * 「编号不回收、不重号、不丢失」比「数字对得上」硬得多。真实台账若确实错了：停下来报告，
 * 不要自行修（各包 `DEFECTS.md` 里的历史数字与 ⚠️ 标注段是**证据**，不是待清理的噪音）。
 *
 * ## 只读
 *
 * 本模块不写文件、不调 git、不联网。输入是五份**文本**（四份台账 + conventions），
 * 所以单测可以喂 fixture 造反例，而不必修改任何受版本控制的文件。
 *
 * 用法（人工核对 / 报告用；CI 侧由 `scripts/test/defects-table.test.ts` 调 `checkRepo()`）：
 *   node scripts/defects-table.mjs            # 现算四包事实 + 打印全部差异（有差异则退出 1）
 *   node scripts/defects-table.mjs --quiet    # 只打印差异
 */
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** `docs/conventions.md`：查表处（A 类）与命名表举例（第 5 条判据）都在这里。 */
export const CONVENTIONS_PATH = 'docs/conventions.md'

/**
 * 四包台账的**形状声明**。
 *
 * 字段是「这份台账必须有哪些句式」的显式清单——**没有的写 `false`**，而不是让正则去碰运气：
 *
 * - `selfSequence`：文件头有「``` `P01`–`Pnn` 是 `packages/<name>` 内部序列 ```」。
 *   `kit` 是 `false`：它是**转入台账**（`D01`–`D05` 的权威在原包），文件头讲的是转入关系。
 * - `nextAnchor`：文件头有「新缺陷接在 ``` `Pnn` ``` 之后」。四包都有。
 * - `crossRefs`：文件头复述了**哪些别的包**的范围（C 类）。`codegraph` 写的是
 *   「与 docker / tty 的 `Dxx` 不共享」（不带范围），所以是空数组。
 * - `statusLine`：现状行的三个数字与「编号至」。`closedColumn` = 有没有「/ 已关闭 N /」那一段；
 *   `untilSentence` = 有没有「编号至 `Pnn`」。
 * - `mirror`：`kit` 专属——A 类那一行要写成**两段**（`D01`–`D05` 转入镜像 + 自研段），
 *   守卫按现算的「转入行 / 自研行」分别核两段的上界。
 */
export const LEDGER_SPECS = [
  {
    name: 'docker',
    prefix: 'D',
    path: 'packages/docker/DEFECTS.md',
    tableHeading: /^## 1\. 编号索引表/,
    selfSequence: true,
    nextAnchor: true,
    crossRefs: ['tty'],
    statusLine: { closedColumn: false, untilSentence: true },
    mirror: false,
  },
  {
    name: 'tty',
    prefix: 'D',
    path: 'packages/tty/DEFECTS.md',
    tableHeading: /^## 1\. 编号索引表/,
    selfSequence: true,
    nextAnchor: true,
    crossRefs: ['docker'],
    statusLine: { closedColumn: false, untilSentence: true },
    mirror: false,
  },
  {
    name: 'codegraph',
    prefix: 'CG',
    path: 'packages/codegraph/DEFECTS.md',
    tableHeading: /^## 1\. 编号索引表/,
    selfSequence: true,
    nextAnchor: true,
    crossRefs: [],
    statusLine: { closedColumn: true, untilSentence: true },
    mirror: false,
  },
  {
    name: 'kit',
    prefix: 'D',
    path: 'packages/kit/DEFECTS.md',
    tableHeading: /^## 转入清单/,
    // 转入台账：文件头讲的是「D01–D05 权威在原包」，没有「内部序列」那句
    selfSequence: false,
    nextAnchor: true,
    crossRefs: [],
    statusLine: { closedColumn: false, untilSentence: false },
    mirror: true,
  },
]

/** 编号数字串的公共形状（`D01` / `CG140`）。 */
const NUM = String.raw`([A-Za-z]{1,4})(\d{1,4})`
/** 一个代码跨度内的范围：``` `D01`–`D140` ```（台账文件头与 B1/B2 用这种写法）。 */
const RANGE_ONE_SPAN = new RegExp(String.raw`\x60${NUM}[–—-]${NUM}\x60`, 'g')
/** 两个代码跨度夹一个连接号：``` `D01`–`D140` ```（markdown 表格里用这种，A 类与 kit 镜像段）。 */
const RANGE_TWO_SPANS = new RegExp(String.raw`\x60${NUM}\x60[–—-]\x60${NUM}\x60`, 'g')
/** 「新缺陷接在 `Dnn` 之后」。 */
const NEXT_ANCHOR = new RegExp(String.raw`接在\s*\x60[A-Za-z]{0,4}(\d{1,4})\x60\s*之后`, 'g')
/** 「``` `D01`–`Dnn` ``` 是 `packages/<pkg>` 内部序列」（B1）。 */
const SELF_SEQUENCE = new RegExp(String.raw`\x60${NUM}[–—-]${NUM}\x60\s*是\s*\x60packages/([\w-]+)\x60\s*内部序列`, 'g')

/** 现状行的三个数字（只认**加粗**那句：历史 ⚠️ 标注里引用的旧数字不算数）。 */
const STATUS_LINE = /^\*\*已修 (\d+)(?:\s*\/\s*已关闭 (\d+))?\s*\/\s*待修 (\d+)\*\*/

/** `Pnn` 形式的编号（补零到两位以上，与台账写法一致）。 */
function label(prefix, value) {
  return `${prefix}${String(value).padStart(2, '0')}`
}

/** 取某个 `^## ` 小节的行（`heading` 命中处起、到下一个 `^## ` 止）。 */
function section(text, heading) {
  const lines = text.split('\n')
  const start = lines.findIndex((line) => heading.test(line))
  if (start === -1) return undefined
  let end = lines.length
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^## /.test(lines[i])) {
      end = i
      break
    }
  }
  return lines.slice(start, end).join('\n')
}

/**
 * 现算一份台账的事实（**唯一真值来源**；守卫只拿它去比对手抄的复述）。
 *
 * @param text - `DEFECTS.md` 全文。
 * @param spec - `LEDGER_SPECS` 里的一项。
 * @returns 事实对象；`status` 是**每一处**加粗现状行（`tty` / `codegraph` 各有两处）。
 */
export function parseLedger(text, spec) {
  const indexSection = section(text, spec.tableHeading)
  const rows = []
  if (indexSection !== undefined) {
    for (const line of indexSection.split('\n')) {
      if (!line.startsWith('|')) continue
      const cells = line.split('|').slice(1, -1).map((cell) => cell.trim())
      if (cells.length < 2) continue
      const first = cells[0].replaceAll('**', '').trim()
      // `D01` / `CG15 追记` / `kit D01` 三种写法都收（首列就是编号列）
      const match = new RegExp(String.raw`^(?:${spec.name}\s+)?(${spec.prefix})\s*(\d{1,4})(?:\s|$)`).exec(first)
      if (match === null) continue
      rows.push({ number: Number(match[2]), note: first.slice(match[0].length).trim(), origin: cells[1] ?? '' })
    }
  }
  const numbers = rows.map((row) => row.number)
  const unique = [...new Set(numbers)].sort((a, b) => a - b)
  const max = unique.length === 0 ? 0 : unique[unique.length - 1]
  const gaps = []
  for (let value = 1; value <= max; value += 1) if (!unique.includes(value)) gaps.push(value)

  const statuses = []
  for (const line of text.split('\n')) {
    const match = STATUS_LINE.exec(line)
    if (match === null) continue
    const until = new RegExp(String.raw`编号至\s*\x60${spec.prefix}(\d{1,4})\x60`).exec(line)
    statuses.push({
      fixed: Number(match[1]),
      closed: match[2] === undefined ? 0 : Number(match[2]),
      open: Number(match[3]),
      until: until === null ? undefined : Number(until[1]),
    })
  }

  // kit：转入行（第二列指向别的包） vs 本包自研行（第二列是「—」）
  const mirrorNumbers = rows.filter((row) => row.origin !== '' && !row.origin.startsWith('—')).map((row) => row.number)
  const ownNumbers = rows.filter((row) => !mirrorNumbers.includes(row.number)).map((row) => row.number)

  return {
    name: spec.name,
    prefix: spec.prefix,
    rows: rows.length,
    unique: unique.length,
    max,
    gaps,
    statuses,
    duplicates: numbers.filter((value, index) => numbers.indexOf(value) !== index),
    mirrorNumbers,
    ownNumbers,
    selfSequence: [...text.matchAll(SELF_SEQUENCE)].map((match) => ({
      from: Number(match[2]),
      to: Number(match[4]),
      pkg: match[5],
    })),
    anchors: [...text.matchAll(NEXT_ANCHOR)].map((match) => Number(match[1])),
  }
}

/**
 * 主检查：把四处手抄的复述与现算值对上。
 *
 * @param input.ledgers - `{ <包名>: <DEFECTS.md 全文> }`（四包齐）。
 * @param input.conventions - `docs/conventions.md` 全文。
 * @returns 差异数组（空 = 通过）；每条是 `{ kind, where, expected, actual, message }`。
 */
export function checkDefectsTable({ ledgers, conventions }) {
  const diffs = []
  const add = (kind, where, expected, actual, message) => {
    diffs.push({ kind, where, expected, actual, message })
  }

  const facts = new Map()
  for (const spec of LEDGER_SPECS) {
    const text = ledgers?.[spec.name]
    if (typeof text !== 'string') {
      add('ledger.missing', spec.path, '台账文本', '缺失', `${spec.path}：没有拿到文本，无法核对`)
      continue
    }
    const fact = parseLedger(text, spec)
    facts.set(spec.name, fact)

    // ---- 判据 1：台账自洽 ----
    if (fact.gaps.length > 0) {
      add('ledger.gap', spec.path, '无空号', fact.gaps.map((n) => label(spec.prefix, n)).join(' '),
        `${spec.path}：索引表有空号（编号不回收 ⇒ 空号意味着有行被删）：${fact.gaps.map((n) => label(spec.prefix, n)).join(' ')}`)
    }
    if (fact.statuses.length === 0) {
      add('ledger.status.absent', spec.path, '**已修 N / 待修 0**', '缺失',
        `${spec.path}：找不到加粗的「现状」行（**已修 N … 待修 0**）——守卫不靠匹配失败兜过去，这里直接报缺`)
    }
    for (const status of fact.statuses) {
      if (status.fixed + status.closed !== fact.unique) {
        add('ledger.status.fixed', spec.path, String(fact.unique), String(status.fixed + status.closed),
          `${spec.path}：现状行「已修 ${status.fixed} + 已关闭 ${status.closed}」= ${status.fixed + status.closed}，表内唯一号数是 ${fact.unique}`)
      }
      if (status.open !== 0) {
        add('ledger.status.open', spec.path, '0', String(status.open),
          `${spec.path}：现状行「待修 ${status.open}」不是 0（索引表里没有待修行 ⇒ 两个口径必有一个错）`)
      }
      if (spec.statusLine.untilSentence) {
        /*
         * 「编号至」只要求**出现过**（并在出现过的地方都对）：`tty` / `codegraph` 还各有一处
         * 加粗的**沿革段**（「**已修 67 / 待修 0**（D01–D48 审计波 + …）」），它复述的是计数、
         * 没有「编号至」——要求它也带上就等于顺手改写历史段落，超出守卫该管的范围。
         * 但计数本身在两处都必须对（上面的 fixed/closed/open 是对**每一处**核的）。
         */
        const withUntil = fact.statuses.filter((status) => status.until !== undefined)
        if (withUntil.length === 0) {
          add('ledger.status.until.absent', spec.path, `编号至 \`${label(spec.prefix, fact.max)}\``, '缺失',
            `${spec.path}：现状行缺「编号至 \`${label(spec.prefix, fact.max)}\`」（声明里要求有这句）`)
        }
        for (const status of withUntil) {
          if (status.until !== fact.max) {
            add('ledger.status.until', spec.path, String(fact.max), String(status.until),
              `${spec.path}：现状行「编号至 ${label(spec.prefix, status.until)}」，表内最大号是 ${label(spec.prefix, fact.max)}`)
          }
        }
      }
    }

    // ---- 判据 3（B1）：文件头自称本包范围 ----
    if (spec.selfSequence) {
      if (fact.selfSequence.length === 0) {
        add('ledger.selfRange.absent', spec.path, `\`${label(spec.prefix, 1)}\`–\`${label(spec.prefix, fact.max)}\` 是 \`packages/${spec.name}\` 内部序列`, '缺失',
          `${spec.path}：文件头缺「\`${label(spec.prefix, 1)}\`–\`${label(spec.prefix, fact.max)}\` 是 \`packages/${spec.name}\` 内部序列」那句（声明里要求有）`)
      }
      for (const range of fact.selfSequence) {
        if (range.pkg !== spec.name || range.from !== 1 || range.to !== fact.max) {
          add('ledger.selfRange', spec.path, `${spec.name} 内部序列 = 01–${String(fact.max).padStart(2, '0')}`, `${range.pkg} ${range.from}–${range.to}`,
            `${spec.path}：文件头自称「${label(spec.prefix, range.from)}–${label(spec.prefix, range.to)} 是 packages/${range.pkg} 内部序列」，现算 ${spec.name} 是 01–${String(fact.max).padStart(2, '0')}`)
        }
      }
    }

    // ---- 判据 3（B2）：「接在 X 之后」每一处都要等于最大号 ----
    if (spec.nextAnchor) {
      if (fact.anchors.length === 0) {
        add('ledger.nextAnchor.absent', spec.path, `接在 \`${label(spec.prefix, fact.max)}\` 之后`, '缺失',
          `${spec.path}：找不到「接在 \`…\` 之后」——没有这句话，读者就不知道该接哪个号（声明里要求有）`)
      }
      for (const anchor of fact.anchors) {
        if (anchor !== fact.max) {
          add('ledger.nextAnchor', spec.path, String(fact.max), String(anchor),
            `${spec.path}：「接在 ${label(spec.prefix, anchor)} 之后」现算应是 ${label(spec.prefix, fact.max)}（按旧号接会造重号）`)
        }
      }
    }
  }

  // ---- 判据 4（C 类）：文件头复述对方的范围 ----
  for (const spec of LEDGER_SPECS) {
    const text = ledgers?.[spec.name]
    if (typeof text !== 'string') continue
    for (const other of spec.crossRefs) {
      const target = facts.get(other)
      if (target === undefined) {
        add('ledger.crossRef.absent', spec.path, `${other} 的台账文本`, '缺失', `${spec.path}：核对 ${other} 范围时对方文本缺失`)
        continue
      }
      // `packages/<other>/DEFECTS.md` 的 `<P01>–<Pnn>`：`[^\x60]*` 不许跨过下一个代码跨度
      const pattern = new RegExp(String.raw`\x60packages/${other}/DEFECTS\.md\x60[^\x60]*\x60${NUM}[–—-]${NUM}\x60`)
      const match = pattern.exec(text)
      if (match === null) {
        add('ledger.crossRef.absent', spec.path, `\`packages/${other}/DEFECTS.md\` 的 \`${target.prefix}01\`–\`${label(target.prefix, target.max)}\``, '缺失',
          `${spec.path}：文件头没有复述 ${other} 的范围（声明里要求有；C 类最容易飘，必须留着可核对）`)
        continue
      }
      const to = Number(match[4])
      if (Number(match[2]) !== 1 || to !== target.max) {
        add('ledger.crossRef', spec.path, String(target.max), String(to),
          `${spec.path}：把 ${other} 写成 ${target.prefix}${match[2]}–${target.prefix}${to}，现算 ${other} 是 01–${String(target.max).padStart(2, '0')}`)
      }
    }
  }

  // ---- 判据 2（A 类）：conventions 的查表 ----
  const conventionsText = typeof conventions === 'string' ? conventions : ''
  if (typeof conventions !== 'string') {
    add('conventions.missing', CONVENTIONS_PATH, '文本', '缺失', `${CONVENTIONS_PATH}：没有拿到文本，无法核对 A 类复述`)
  }
  const table = section(conventionsText, /^## 编号规范/)
  const cells = new Map()
  if (table !== undefined) {
    for (const line of table.split('\n')) {
      if (!line.startsWith('|')) continue
      const parts = line.split('|').slice(1, -1).map((cell) => cell.trim())
      if (parts.length < 3) continue
      const key = parts[0].replaceAll('`', '').trim()
      if (key === '' || key === '包' || /^-+$/.test(key)) continue
      cells.set(key, { prefix: parts[1].replaceAll('`', '').trim(), range: parts[2] })
    }
  } else {
    add('conventions.table.absent', CONVENTIONS_PATH, '§ 编号规范 的表', '缺失',
      `${CONVENTIONS_PATH}：找不到「## 编号规范」小节（A 类复述在它的表里）`)
  }
  for (const spec of LEDGER_SPECS) {
    const fact = facts.get(spec.name)
    // 缺文本的包上面已经报过 `ledger.missing`：这里不再崩、也不重复报（守卫要报差异，不是抛异常）
    if (fact === undefined) continue
    const cell = cells.get(spec.name)
    if (cell === undefined) {
      add('conventions.row.absent', CONVENTIONS_PATH, `| \`${spec.name}\` | … |`, '缺失',
        `${CONVENTIONS_PATH}：编号规范表里没有 ${spec.name} 那一行（查表处少一行，前缀/上界就查不到了）`)
      continue
    }
    const ranges = [...cell.range.matchAll(RANGE_TWO_SPANS)].map((match) => ({
      from: Number(match[2]),
      to: Number(match[4]),
      prefix: match[1],
    }))
    if (spec.mirror) {
      // kit：两段（转入镜像 + 本包自研），分别核上界
      const mirrorMax = fact.mirrorNumbers.length === 0 ? 0 : Math.max(...fact.mirrorNumbers)
      const ownMin = fact.ownNumbers.length === 0 ? 0 : Math.min(...fact.ownNumbers)
      if (ranges.length !== 2) {
        add('conventions.kit.shape', CONVENTIONS_PATH, '两段范围（转入镜像 + 本包自研）', `${String(ranges.length)} 段`,
          `${CONVENTIONS_PATH}：kit 那行要写成两段范围（\`D01\`–\`D${String(mirrorMax).padStart(2, '0')}\` 转入镜像 + \`D${String(ownMin).padStart(2, '0')}\`–\`D${String(fact.max).padStart(2, '0')}\` 本包自研），现在读到 ${String(ranges.length)} 段`)
        continue
      }
      if (ranges[0].from !== 1 || ranges[0].to !== mirrorMax) {
        add('conventions.kit.mirror', CONVENTIONS_PATH, `01–${String(mirrorMax).padStart(2, '0')}`, `${ranges[0].from}–${ranges[0].to}`,
          `${CONVENTIONS_PATH}：kit 行的「转入镜像」段写成 ${ranges[0].prefix}${ranges[0].from}–${ranges[0].prefix}${ranges[0].to}，现算转入行是 01–${String(mirrorMax).padStart(2, '0')}`)
      }
      if (ranges[1].from !== ownMin || ranges[1].to !== fact.max) {
        add('conventions.kit.own', CONVENTIONS_PATH, `${String(ownMin).padStart(2, '0')}–${String(fact.max).padStart(2, '0')}`, `${ranges[1].from}–${ranges[1].to}`,
          `${CONVENTIONS_PATH}：kit 行的「本包自研」段写成 ${ranges[1].prefix}${ranges[1].from}–${ranges[1].prefix}${ranges[1].to}，现算是 ${String(ownMin).padStart(2, '0')}–${String(fact.max).padStart(2, '0')}`)
      }
      continue
    }
    const upper = ranges.length === 0 ? undefined : ranges[ranges.length - 1].to
    if (upper === undefined) {
      add('conventions.row.parse', CONVENTIONS_PATH, `\`${spec.prefix}01\`–\`${label(spec.prefix, fact.max)}\``, cell.range,
        `${CONVENTIONS_PATH}：${spec.name} 那行的范围读不出来（期望 \`${spec.prefix}01\`–\`${label(spec.prefix, fact.max)}\`）`)
    } else if (upper !== fact.max) {
      add('conventions.row', CONVENTIONS_PATH, String(fact.max), String(upper),
        `${CONVENTIONS_PATH}：${spec.name} 那行写 "${spec.prefix}01–${spec.prefix}${upper}"，现算最大号是 ${label(spec.prefix, fact.max)}`)
    }
  }

  // ---- 判据 5：命名表的举例号必须存在、且**不是上界**（举上界＝举一个一定会过期的号） ----
  const naming = section(conventionsText, /^## 命名/)
  const example = naming === undefined ? null : /`([\w-]+)\s+([A-Za-z]{1,4})(\d{1,4})`/.exec(naming)
  if (example === null) {
    add('conventions.example.absent', CONVENTIONS_PATH, '`<包名> <前缀><号>` 举例', '缺失',
      `${CONVENTIONS_PATH}：§ 命名 的「缺陷编号」举例读不出来（期望 \`docker D03\` 这种形式）`)
  } else {
    const [, pkg, prefix, raw] = example
    const fact = facts.get(pkg)
    const value = Number(raw)
    if (fact === undefined) {
      add('conventions.example', CONVENTIONS_PATH, '存在的包', pkg,
        `${CONVENTIONS_PATH}：命名表举例指的是未知包 ${pkg}`)
    } else if (prefix.toUpperCase() !== fact.prefix || value < 1 || value > fact.max) {
      add('conventions.example', CONVENTIONS_PATH, `${fact.prefix}01–${label(fact.prefix, fact.max)} 里存在的号`, `${prefix}${raw}`,
        `${CONVENTIONS_PATH}：命名表举例 ${pkg} ${prefix}${raw} 在该包台账里不存在（现算 ${fact.prefix}01–${label(fact.prefix, fact.max)}）`)
    } else if (value === fact.max) {
      add('conventions.example', CONVENTIONS_PATH, `小于上界的号`, `${prefix}${raw}`,
        `${CONVENTIONS_PATH}：命名表举例用的是**上界号** ${pkg} ${prefix}${raw}——上界每加一条就过期，举例要用一个不变的老号`)
    }
  }

  // ---- 判据 6：conventions 必须写着「谁在核这张表」（文档与守卫成对） ----
  for (const pointer of ['scripts/test/defects-table.test.ts', 'defects-ledger.test.ts']) {
    if (!conventionsText.includes(pointer)) {
      add('conventions.gatePointer', CONVENTIONS_PATH, pointer, '缺失',
        `${CONVENTIONS_PATH}：没提到 ${pointer}——查表的数字由谁核对必须写清，否则下一个人只会「顺手改数」`)
    }
  }

  return diffs
}

/** 读入受检的 5 份文本（**只读**，不改任何东西）。 */
export function readDefectsInputs(repoRoot = REPO_ROOT) {
  const ledgers = {}
  for (const spec of LEDGER_SPECS) ledgers[spec.name] = readFileSync(join(repoRoot, spec.path), 'utf8')
  return { ledgers, conventions: readFileSync(join(repoRoot, CONVENTIONS_PATH), 'utf8') }
}

/** 对真实仓库跑一遍（CI 与人工都用这条）。 */
export function checkRepo(repoRoot = REPO_ROOT) {
  return checkDefectsTable(readDefectsInputs(repoRoot))
}

/** 现算四包事实（报告用）。 */
export function computeFacts(repoRoot = REPO_ROOT) {
  const { ledgers } = readDefectsInputs(repoRoot)
  return LEDGER_SPECS.map((spec) => parseLedger(ledgers[spec.name], spec))
}

/* ------------------------------ CLI ------------------------------ */

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const quiet = process.argv.includes('--quiet')
  if (!quiet) {
    console.log('现算（唯一真值来源 = 各包索引表）：')
    for (const fact of computeFacts()) {
      const closed = fact.statuses[0]?.closed ?? 0
      console.log(
        `  ${fact.name.padEnd(10)} 行=${String(fact.rows).padStart(3)} 唯一=${String(fact.unique).padStart(3)}`
        + ` 最大=${label(fact.prefix, fact.max)} 空号=[${fact.gaps.join(',')}]`
        + ` 已修=${String(fact.statuses[0]?.fixed ?? 0)}${closed === 0 ? '' : ` 已关闭=${String(closed)}`} 待修=${String(fact.statuses[0]?.open ?? 0)}`
        + ` 接在之后=${fact.anchors.map((n) => label(fact.prefix, n)).join(',') || '—'}`,
      )
    }
  }
  const diffs = checkRepo()
  if (diffs.length === 0) {
    console.log('\n缺陷台账复述：全部一致（未发现差异）')
    process.exit(0)
  }
  console.log(`\n缺陷台账复述：${String(diffs.length)} 处差异（**只改文档侧**，不要动台账行）`)
  for (const diff of diffs) console.log(`  ✗ ${diff.message}`)
  process.exit(1)
}
