/**
 * @hyzyn/dsh-docker — 诊断历史的落盘（薄 IO：只做「读一行行 / 追加 / 超限重写」）。
 *
 * ## 落点与权限
 *
 * `<DSH home>/dsh-docker/diagnosis-history.jsonl`，目录 0700、文件 0600。路径**只在
 * `diagnosisHistoryPaths()` 里拼一次**（调用点不许再自己 `join`）——本仓在 kit 的
 * `capabilityPaths` 上踩过一次「两处各拼一遍、改目录名漂一半」的坑（kit D08），
 * 这里照那条经验办。
 *
 * `DSH_DOCKER_HISTORY_DIR` 可覆写**目录**（测试 / 排障专用，不是给用户调的旋钮）：
 * 真机验收与 `route-smoke` 都必须用它把写盘指到临时目录，**绝不能写进用户的 `~/.dsh`**。
 * 覆写成空串 / 纯空白视为没设（那多半是「变量存在但没填」的误配置，静默落到默认目录
 * 比报错好——它只影响历史记在哪，不放开任何东西）。
 *
 * ## 写盘策略
 *
 * 追加是常态（一次 `appendFile`）；**只有在真的超限时才重写整个文件**（每容器 50 条、
 * 整文件 2000 条），重写走「同目录临时文件 + rename」——POSIX 的 rename 是原子的，读者
 * 要么看到旧全文、要么看到新全文，不会读到写了一半的文件（与 kit 的 `managed-block` 同一手法）。
 *
 * ## 容错：坏行跳过，不整体失败
 *
 * 半行（进程被杀的现场）、解析失败、`v` 不认识的行**一律跳过**，其余照常读。这是本包对
 * 「截断」的一贯态度：留痕、降级，不把一次坏写放大成「历史全没了」。
 * 跳过是**静默**的（本模块没有 logger）：历史是辅助信息，值不值得报警由调用方决定。
 */
import { appendFileSync, chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

import { HISTORY_MAX_LINES, HISTORY_PER_CONTAINER, shouldAppend } from './history.js'
import type { DiagnosisSample } from './history.js'

/** 覆写历史目录的环境变量（**测试 / 排障专用**）。 */
export const HISTORY_DIR_ENV = 'DSH_DOCKER_HISTORY_DIR'

/** 本插件在 DSH 主目录下的数据目录名（与 `dsh-kit` 同级，按拥有者包名收进一级子目录）。 */
export const HISTORY_DIR_NAME = 'dsh-docker'

/** 历史文件名。 */
export const HISTORY_FILE_NAME = 'diagnosis-history.jsonl'

/** 行格式版本：读到不认识的 `v` 跳过该行（不抛、不清空）。 */
export const HISTORY_SCHEMA_VERSION = 1

const DIR_MODE = 0o700
const FILE_MODE = 0o600

export interface DiagnosisHistoryPaths {
  /** 数据目录（`<DSH home>/dsh-docker`，或 `DSH_DOCKER_HISTORY_DIR` 的值）。 */
  dir: string
  /** 历史文件（`<dir>/diagnosis-history.jsonl`）。 */
  file: string
}

/** 拼出历史落盘布局。**路径只在这里拼一次**。 */
export function diagnosisHistoryPaths(dshHomeDir: string): DiagnosisHistoryPaths {
  const override = process.env[HISTORY_DIR_ENV]?.trim()
  const dir = override !== undefined && override !== '' ? resolve(override) : join(dshHomeDir, HISTORY_DIR_NAME)
  return { dir, file: join(dir, HISTORY_FILE_NAME) }
}

/** 一行历史（JSONL 的一行）。`target` / `container` / `id` 是**索引键**，不是业务数据。 */
export interface DiagnosisHistoryRecord {
  v: number
  target: string
  container: string
  id: string
  sample: DiagnosisSample
}

/** 解析一行；不认识的版本 / 坏 JSON / 形状不对一律 `null`（调用方跳过）。 */
function parseLine(line: string): DiagnosisHistoryRecord | null {
  const text = line.trim()
  if (text === '') return null
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  const row = parsed as Record<string, unknown>
  if (row.v !== HISTORY_SCHEMA_VERSION) return null
  if (typeof row.target !== 'string' || typeof row.container !== 'string' || typeof row.id !== 'string') return null
  const sample = row.sample
  if (typeof sample !== 'object' || sample === null) return null
  const value = sample as Record<string, unknown>
  if (typeof value.at !== 'string' || typeof value.severity !== 'string' || typeof value.code !== 'string') return null
  return {
    v: HISTORY_SCHEMA_VERSION,
    target: row.target,
    container: row.container,
    id: row.id,
    sample: sample as DiagnosisSample,
  }
}

/** 同目录临时文件 + rename（原子）。临时文件名带 pid，两个实例并发写也不会互相踩。 */
function writeFileAtomic(file: string, data: string): void {
  const tmp = join(dirname(file), `.${HISTORY_FILE_NAME}.${String(process.pid)}.tmp`)
  writeFileSync(tmp, data, { mode: FILE_MODE })
  // Windows 的 chmod 只认只读位；且 writeFileSync 的 mode 会被 umask 再削一次，
  // 显式补回（同 kit 的 writeFileAtomic：权限应当确定，不随调用方的 umask 漂）
  if (process.platform !== 'win32') chmodSync(tmp, FILE_MODE)
  renameSync(tmp, file)
}

/** 读完整文件 → 逐行解析（坏行跳过）。文件不存在 = 空数组。 */
function readRows(file: string): DiagnosisHistoryRecord[] {
  if (!existsSync(file)) return []
  const text = readFileSync(file, 'utf8')
  const rows: DiagnosisHistoryRecord[] = []
  for (const line of text.split('\n')) {
    const row = parseLine(line)
    if (row !== null) rows.push(row)
  }
  return rows
}

/**
 * 诊断历史存储。**构造不碰磁盘**（第一次 `append` / `read` 才碰）——与 kit 的 `GrantStore`
 * 一致：插件挂载时不该在用户主目录里先建一个空文件。
 *
 * @param dir - 放历史文件的目录。正常走 `diagnosisHistoryPaths(dshHome()).dir`；测试传临时目录。
 *   本类只拥有这个目录（缺就建、建了才 chmod），不动 DSH 主目录本身。
 */
export class DiagnosisHistoryStore {
  private readonly file: string

  constructor(private readonly dir: string) {
    this.file = join(dir, HISTORY_FILE_NAME)
  }

  /** 历史文件的绝对路径（排障 / 测试断言用）。 */
  get filePath(): string {
    return this.file
  }

  /** 某个容器（按 `target + container` 索引）的历史，**按时间升序**。坏行已跳过。 */
  read(target: string, container: string): DiagnosisSample[] {
    return readRows(this.file)
      .filter((row) => row.target === target && row.container === container)
      .map((row) => row.sample)
      .sort((a, b) => {
        const left = Date.parse(a.at)
        const right = Date.parse(b.at)
        // 坏时间戳排最前（与 diagnose 的 timeline 同口径：`NaN` 不该把整段排序搅乱）
        if (Number.isNaN(left)) return Number.isNaN(right) ? 0 : -1
        if (Number.isNaN(right)) return 1
        return left - right
      })
  }

  /**
   * 追加一条。返回**是否真的写进去了**（去重命中时 `false`）。
   *
   * 去重的「现在」取 `record.sample.at` 解析出来的毫秒——调用方刚刚生成它，与 `Date.now()`
   * 等价，但这里因此不需要再读一次时钟，纯逻辑部分（`shouldAppend`）也能被单测直接钉住。
   */
  append(record: DiagnosisHistoryRecord): boolean {
    const nowMs = Date.parse(record.sample.at)
    const key = `${record.target}\u0000${record.container}`
    const existing = readRows(this.file)
    const sameKey = existing.filter((row) => `${row.target}\u0000${row.container}` === key)
    const last = sameKey.length === 0 ? undefined : sameKey[sameKey.length - 1]!.sample
    if (!shouldAppend(last, record.sample, Number.isNaN(nowMs) ? Date.now() : nowMs)) return false

    const next = [...existing, record]
    const trimmed = trimRows(next, key)

    mkdirSync(this.dir, { recursive: true, mode: DIR_MODE })
    if (process.platform !== 'win32') chmodSync(this.dir, DIR_MODE)

    if (trimmed.length < next.length) {
      // 超限：整文件原子重写（读者不会看到半截文件）
      const data = trimmed.length === 0 ? '' : trimmed.map((row) => JSON.stringify(row)).join('\n') + '\n'
      writeFileAtomic(this.file, data)
      return true
    }
    const created = !existsSync(this.file)
    appendFileSync(this.file, JSON.stringify(record) + '\n', { mode: FILE_MODE })
    if (created && process.platform !== 'win32') chmodSync(this.file, FILE_MODE)
    return true
  }
}

/**
 * 按配额裁剪。
 *
 * 两条上限是**独立的**：每容器 50 条（保留该容器最近的），整文件 2000 条（保留全局最近的）。
 * 文件顺序即追加顺序（时间序），所以「丢最旧」= 从数组头部丢——不重排，
 * 这样没超限的行在文件里保持原来的顺序（重排会让 `git` 式的肉眼对比变难，也会无谓地放大写盘）。
 */
function trimRows(rows: DiagnosisHistoryRecord[], key: string): DiagnosisHistoryRecord[] {
  let kept = rows
  const sameKey = kept.filter((row) => `${row.target}\u0000${row.container}` === key)
  if (sameKey.length > HISTORY_PER_CONTAINER) {
    const drop = new Set(sameKey.slice(0, sameKey.length - HISTORY_PER_CONTAINER))
    kept = kept.filter((row) => !drop.has(row))
  }
  if (kept.length > HISTORY_MAX_LINES) kept = kept.slice(kept.length - HISTORY_MAX_LINES)
  return kept
}
