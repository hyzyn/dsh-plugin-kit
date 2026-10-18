/**
 * @hyzyn/dsh-kit — 通用「托管区块」读写。
 *
 * env.yml / cordis.patch.yml / prompts.yml 都采用同一模式：在一份用户可编辑的
 * 文件里用一对注释标记圈出插件自动生成的内容（托管区块），写回时只动区块、
 * 区块外逐字节保留。env / mcp / prompt 三个插件各有一份私有变体；本模块提供
 * 参数化标记的通用纯函数，供后续迁移与新插件使用（存量插件本次不迁移）。
 *
 * 与 mcp 的 spliceManagedBlock（packages/mcp/src/index.ts:224-238）的兼容点：
 *   - 无区块时追加到文件末尾、并在前面留一个空行；
 *   - 收尾标记缺失（悬空起始标记）时只重写起始标记行本身，不吞掉标记之后的
 *     内容——旧行为会连带删掉后续所有内容；
 *   - 区块整体替换时保留区块外内容逐字节不变。
 * 有意差异（更稳）：
 *   - 标记行按「trimEnd 后整行相等」匹配，而非子串匹配。子串匹配会把 body 里
 *     恰好包含标记文本的行误判为边界，整行匹配才能同时兼容 \r 与行尾空格；
 *   - 空文件（或纯空白文件）第一次写入时不会留下一个多余的前导空行；
 *   - 替换已有区块不追加尾部空行（mcp 把整块当字符串拼接，重复写入会在块尾
 *     每次多留一个空行；本实现按行替换，同样输入的重复写入逐字节稳定）；
 *   - body 为空串 = 删除区块（含标记），对应 mcp 里「空 rows」语义的显式化
 *     （mcp 用 `- insert: []` 占位，那是 patch 文件的特殊要求，不是通用需求）。
 */
import { chmodSync, renameSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

/** 定位 / 替换托管区块所需的标记（均按整行匹配，仅容忍行尾空白）。 */
export interface ManagedBlockMarkers {
  /** 起始标记行，如 `# --- dsh-env-manager managed (auto-generated; do not edit) ---`。 */
  beginMarker: string
  /** 结束标记行，如 `# --- end dsh-env-manager managed ---`。 */
  endMarker: string
}

/** spliceManagedBlock 的入参：标记 + 新区块正文（不含标记行）。 */
export interface SpliceManagedBlockOptions extends ManagedBlockMarkers {
  /** 新区块正文（不含标记行）；空串表示删除整个区块。 */
  body: string
}

/** 在行数组里找起始标记行下标；找不到返回 -1。 */
function findBegin(lines: string[], beginMarker: string): number {
  return lines.findIndex((line) => line.trimEnd() === beginMarker)
}

/** 在起始标记之后找结束标记行下标；找不到返回 -1。 */
function findEnd(lines: string[], start: number, endMarker: string): number {
  return lines.findIndex((line, index) => index > start && line.trimEnd() === endMarker)
}

/**
 * 找出「根位置」上的空 flow 序列（`[]`）：文件里**第一条**非空、非注释行。
 *
 * 为什么要认出这个位置：DSH 给每个 profile 生成的 `cordis.patch.yml` 模板
 * （`PROFILE_PATCH_TEMPLATE`）与 `~/.dsh/cordis.patch.yml` 的惯例内容都是
 * 「几行注释 + `[]`」。`[]` 是**完整**的 YAML 文档（flow 序列根），它之后不能再接
 * 块序列——直接往后追加托管区块会让整份文件非法（`expected '<document start>',
 * but found '<block sequence start>'`）。宿主用同一套 js-yaml 解析，于是启动直接
 * 抛 `failed to parse patches`（热路径则被 HMR 的 catch 吞成一条 warn，卡片上
 * 什么都看不到）。
 *
 * 判据是「**首条**非注释行就是 `[]`」而已，不要求后面什么都没有——旧版本正是往
 * `[]` 后面追加出坏文件的，那种文件的 `[]` 同样落在首位，扫掉它才是唯一能解析的形状。
 * 同理，`[]` 之后若还有别的顶层行，那份文件本来就非法，摘掉这个根也不会更糟。
 *
 * 返回 -1 表示根位置上不是空序列（正常 patches 文件、纯注释文件、空文件）。
 */
function findEmptyFlowSequenceRoot(lines: string[]): number {
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index].replace(/\r$/, '').trim()
    if (line === '' || line.startsWith('#')) continue
    return /^\[\s*\]$/.test(line) ? index : -1
  }
  return -1
}

/**
 * 把「只有注释 + `[]`」的那个空根从文本里摘掉（摘掉后注释与其它内容逐字节保留）。
 *
 * 返回 `undefined` 表示**不该动**：文本里没有空根，或有空根但还夹着别的结构。
 * 调用方按「是否有返回值」决定要不要走替换路径——不要用返回空串来判断，
 * 因为「摘掉空根后只剩注释」是合法且必须替换的情形。
 *
 * 已经写出坏文件（`[]` + 托管区块）也能靠它自愈：先摘空根，再就地替换区块，
 * 于是下一次写入就把非法根修掉了，不需要用户手工删行。
 */
export function stripEmptyFlowSequenceRoot(text: string): string | undefined {
  const lines = text.split('\n')
  const root = findEmptyFlowSequenceRoot(lines)
  if (root === -1) return undefined
  return [...lines.slice(0, root), ...lines.slice(root + 1)].join('\n')
}

/**
 * 行数组版的 {@link stripEmptyFlowSequenceRoot}：返回摘掉空根后的新数组。
 *
 * 供「本来就在行数组上作业」的调用方（如 codegraph 的 syncManagedMcpRow）使用，
 * 单独给一个函数是因为那里的 `changed` 标志与行数组是同一份数据，直接改文本再切行
 * 会丢掉行尾 / 空行信息。
 */
export function stripEmptyFlowSequenceRootLines(lines: string[]): { lines: string[]; changed: boolean } {
  const root = findEmptyFlowSequenceRoot(lines)
  if (root === -1) return { lines, changed: false }
  return { lines: [...lines.slice(0, root), ...lines.slice(root + 1)], changed: true }
}

/**
 * 渲染含标记行的区块（行数组，不含尾部空串——就地替换时不引入额外空行，
 * 追加写入时由调用方在末尾补一个换行）。
 */
function renderBlockLines(markers: ManagedBlockMarkers, body: string): string[] {
  // 正文末尾的换行是调用方的排版选择，统一剥掉，避免标记行前多出空行。
  const normalized = body.replace(/\n+$/, '')
  return [markers.beginMarker, ...normalized.split('\n'), markers.endMarker]
}

/**
 * 纯函数：把托管区块（含首尾标记行）拼进文本，返回新文本。
 *
 * - 已有完整区块：整体替换为「标记 + body + 标记」，区块外内容不动；
 * - 无起始标记：追加到文件末尾（非空文件前留一个空行）；
 * - 起始标记存在但缺结束标记（文件损坏 / 手改）：只替换起始标记行，保留其后
 *   所有内容，避免误删用户数据；
 * - body 为空串：删除整个区块（含标记），同样只动标记之间的范围。
 */
export function spliceManagedBlock(text: string, options: SpliceManagedBlockOptions): string {
  const { beginMarker, endMarker, body } = options
  const lines = text.split('\n')
  const start = findBegin(lines, beginMarker)
  const end = start === -1 ? -1 : findEnd(lines, start, endMarker)

  // 没有起始标记：body 为空时无事可做，否则追加新区块。
  if (start === -1) {
    if (body === '') return text
    const head = text.replace(/\s*$/, '')
    const block = renderBlockLines(options, body).join('\n') + '\n'
    // 空 flow 序列根（`[]`）：它是**完整**的 YAML 文档，后面再接块序列会让整份文件
    // 非法。所以不是追加，而是把那个根换成托管区块——注释等其它内容原样保留。
    const stripped = stripEmptyFlowSequenceRoot(head)
    if (stripped !== undefined) {
      const kept = stripped.replace(/\s*$/, '')
      return kept === '' ? block : kept + '\n\n' + block
    }
    return head === '' ? block : head + '\n\n' + block
  }

  // 删除：去掉 [start, end]；悬空标记只去掉起始标记行。
  if (body === '') {
    return end === -1
      ? [...lines.slice(0, start), ...lines.slice(start + 1)].join('\n')
      : [...lines.slice(0, start), ...lines.slice(end + 1)].join('\n')
  }

  const blockLines = renderBlockLines(options, body)
  // 悬空起始标记：只重写标记行本身，其后内容原样保留（与 mcp 行为一致）。
  const spliced =
    end === -1
      ? [...lines.slice(0, start), ...blockLines, ...lines.slice(start + 1)]
      : [...lines.slice(0, start), ...blockLines, ...lines.slice(end + 1)]
  // 自愈：旧版本会在 `[]` 后面追加区块，写出「`[]` + 区块」这种**非法**文件。标记一旦
  // 存在，后续写入就走这条「替换已有区块」分支、把坏根原样留着——于是它永久不修。
  // 这里顺手把区块**外**那个裸 `[]` 摘掉：区块存在时，任何一个独立的 `[]` 都只能是
  // 残留的根（合法的 patch 列表里它没有位置），摘掉才是唯一能解析的形状。
  return stripStrayEmptyRootsOutsideBlock(spliced, options)
}

/** 行尾 CR 不参与比较；`[]` / `[ ]` 都认。 */
function isEmptyRootLine(line: string | undefined): boolean {
  return line !== undefined && /^\[\s*\]$/.test(line.replace(/\r$/, '').trim())
}

/**
 * 摘掉托管区块**之前**的裸 `[]` 行（就地重写时用；区块内的 `- insert: []` 不是它）。
 *
 * 与 {@link stripEmptyFlowSequenceRoot} 的分工：那个识别「整份文件只有注释 + 空根」，
 * 用在首次追加；这个识别「已经有区块，但区块前还留着坏根」，用在重复写入。两处都要，
 * 因为「写坏的文件下一次写入能不能自愈」取决于后者。
 *
 * 只认区块**之前**的那一行：坏文件里根永远在块前（块是往根后追加出来的）。块后也扫
 * 会误伤「同一文件里真有第二个文档」这类手写形状——那种情况下宁可不动，让调用方的
 * 复读校验去报错。
 */
function stripStrayEmptyRootsOutsideBlock(lines: string[], markers: ManagedBlockMarkers): string {
  const start = findBegin(lines, markers.beginMarker)
  if (start === -1) return lines.join('\n')
  const end = findEnd(lines, start, markers.endMarker)
  // 结束标记缺失时不摘：此时区块边界不可知，保守起见不动任何东西。
  if (end === -1) return lines.join('\n')
  return lines.filter((line, index) => index >= start || !isEmptyRootLine(line)).join('\n')
}

/**
 * 读取标记之间的区块正文（不含标记行本身）。
 * 无起始标记或缺少结束标记都返回 undefined——后者说明文件被手改坏 / 写坏了，
 * 调用方应报错而不是拿半截内容当合法结果（env / mcp 的 readManaged* 同此语义）。
 */
export function readManagedBlock(text: string, markers: ManagedBlockMarkers): { body: string } | undefined {
  const lines = text.split('\n')
  const start = findBegin(lines, markers.beginMarker)
  if (start === -1) return undefined
  const end = findEnd(lines, start, markers.endMarker)
  if (end === -1) return undefined
  return { body: lines.slice(start + 1, end).join('\n') }
}

/**
 * 原子写入文件：先写同目录临时文件再 rename 覆盖。
 *
 * 为什么必须 rename：直接 writeFileSync 到目标路径时，「截断 → 写入」期间另一
 * 个读者（DSH 的配置 watch / 另一个插件实例）会看到半截内容甚至空文件；rename
 * 在 POSIX 上是原子的，读者要么看到旧全文、要么看到新全文。临时文件必须与目标
 * 同目录（跨文件系统的 rename 会退化成复制，失去原子性）。
 *
 * mode 默认 0600（配置文件常含密钥）。**写入后再显式 chmod 一次**：
 * `writeFileSync` 的 mode 会被进程 umask 进一步收紧（`mode & ~umask`），于是同一个调用在
 * umask 0 的机器上得到 0640、在 umask 077 的机器上得到 0600——权限本该是**确定的**（它管的
 * 就是配置/密钥文件的可见范围），不该随调用方的 umask 漂。
 * 这不是放宽：chmod 到调用方要的 mode，最宽不会超过它（`writeFileSync` 那一步仍先按 umask
 * 收紧创建，chmod 只补回被 umask 削掉的位）。
 *
 * 2026-09-26 在 Ubuntu 真机（root，umask 077）上被 `packages/kit/test/kit.test.ts` 的 0640
 * 断言抓到：本机 DSH 宿主的 umask 是 0，所以本地一直绿。
 */
export function writeFileAtomic(file: string, data: string, mode = 0o600): void {
  const tmp = join(dirname(file), '.' + basename(file) + '.' + process.pid + '.tmp')
  writeFileSync(tmp, data, { mode })
  // Windows 的 chmod 只认只读位（且 mode 的组/其他人位无意义），跳过免得凭空造出只读文件
  if (process.platform !== 'win32') chmodSync(tmp, mode)
  renameSync(tmp, file)
}
