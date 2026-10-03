/**
 * 验活断言库：**清单结构 + 加载校验**（`docs/devdata-plan.md` §3.9）。
 *
 * ## 这一层解决什么
 *
 * §0 的存在理由之一是「核对发布后的业务数据」。那一环不能靠人每次现编 SQL——那样它不可积累、
 * 不可复审、也不能被 agent 自动执行。落法是把它**断言化**：断言写在**项目仓库**里
 * （`verify/<project>.yaml`），随项目一起评审、一起演进；DSH 侧**只读**。
 *
 * ## 两条判据没收进来会怎样（本模块存在的理由）
 *
 * 1. **缺省即无**：项目没有 `verify/<project>.yaml` → 这个项目**没有断言**，不是「用默认断言」。
 *    回落默认断言等于用别的项目的话去核对这个项目的数据，且**看起来是绿的**——最坏的一种错。
 * 2. **判据必须在加载时抓**：清单是配置，配置错误（操作符写错、正则不合法、断言重复 id、
 *    语句是写操作）**不该等到跑的时候才表现为一条 fail**。它既不是「数据不对」也不是「业务异常」，
 *    而是「这份清单写错了」——混在一起会让 agent 去查数据，方向就错了。
 *
 * ## 与 SQL 层的关系：注入而不是硬依赖
 *
 * 注入而不是硬依赖：语句判据由调用方传进来，默认实现是 `sql.ts` 的 `classifySql` 套一层。
 * 这样本模块可以独立测「清单校验」这件事，而 SQL 粒度的判据仍然只有一处真源。
 *
 * 依据：`docs/devdata-plan.md` §3.9（四条设计约束）、§2 的部署机制分类、`jenkins-release` 技能的 §4 噪声口径。
 */

import { readFileSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'

import yaml from 'js-yaml'

import { classifySql, sqlRejectionHint } from './sql.js'

/** 部署机制：决定「该验什么」。与 `jenkins-release` 技能的分类一致。 */
export type AppliesTo = 'backend' | 'front' | 'build-only'

/** 全部部署机制。 */
export const APPLIES_TO: readonly AppliesTo[] = ['backend', 'front', 'build-only']

/** 断言的严重度：`fail` 让这次核对失败，`warn` 只记下来（用于已知噪声）。 */
export type Severity = 'fail' | 'warn'

/** 全部严重度。 */
export const SEVERITIES: readonly Severity[] = ['fail', 'warn']

/** 期望算子。全部可**同时**给出，语义是 AND。 */
export const EXPECT_OPERATORS = ['eq', 'regex', 'gte', 'lte', 'rowCount'] as const

/** 期望算子名。 */
export type ExpectOperator = (typeof EXPECT_OPERATORS)[number]

/**
 * 一条期望。
 *
 * 多个算子同时给出时是**合取**（AND）——不是「按优先级取第一命中」。
 * 理由：断言写成了「`eq` 也写、`gte` 也写」时，作者想要的是两者都成立；
 * 取第一命中会让后写的那个**静默失效**，而它看起来是配好的。
 */
export interface VerifyExpect {
  /** 取出的那个值必须与它**严格相等**（比的是值，不是行数；行数用 `rowCount`）。 */
  eq?: unknown
  /** 取出的值必须匹配这个正则（字符串）。 */
  regex?: string
  /** 取出的值 ≥ 它（数字）。 */
  gte?: number
  /** 取出的值 ≤ 它（数字）。 */
  lte?: number
  /** 返回行数。**与 `eq` 的区别**：`eq` 比的是取出的那个值，`rowCount` 比的是结果集有几行。 */
  rowCount?: number
  /**
   * 比哪个列。缺省取**第 1 列**。
   *
   * 为什么要显式声明而不是「自动找唯一列」：自动推断在 `SELECT count(*)` 上恰好能用，
   * 在 `SELECT a, b FROM t` 上会静默取错列，而两种查询在清单里长得一样。
   */
  column?: string
}

/** 一条验活断言。 */
export interface VerifyAssertion {
  /** 稳定 id（报告里用它点名）。 */
  id: string
  /**
   * 项目名（`cdqas` / `ems` / `cdc` / `hcckc` / `tcml` / `bpa` / `jasper` …）。
   *
   * 由**文件名**决定，不在清单里写第二遍；清单里的 `project` 字段若与文件名不一致就是配置错误
   * （防复制粘贴改漏，那会让断言跑到**别的项目**上去）。
   */
  project: string
  appliesTo: AppliesTo
  /** `DevDataTarget.id`。 */
  target: string
  /** 只读语句（**加载时过语句判据**，写语句一律拒）。 */
  statement: string
  expect: VerifyExpect
  severity: Severity
  timeoutMs?: number
  /** 已知噪声说明（照 `jenkins-release` 技能 §4 的口径）。 */
  note?: string
}

/** 一份清单。 */
export interface VerifyManifest {
  version: number
  project: string
  assertions: readonly VerifyAssertion[]
}

/** 清单加载结果。三种「读不到」刻意分开——它们的处置完全不同。 */
export type ManifestLoad =
  /** 项目内没有清单：**无断言**（fail-closed，不回落默认断言）。这是正常状态。 */
  | { kind: 'no-manifest'; project: string }
  /** 文件在，但读不进来 / YAML 语法错。 */
  | { kind: 'unreadable'; project: string; message: string }
  /** 读进来了，但清单本身写错了（**配置问题，不是数据问题**）。 */
  | { kind: 'config-error'; project: string; errors: readonly VerifyConfigError[] }
  /** 通过。 */
  | { kind: 'ok'; manifest: VerifyManifest }

/** 一条配置错误。`path` 指到具体字段，让人与 agent 都不用猜。 */
export interface VerifyConfigError {
  /** JSON 风格路径，如 `assertions[2].expect.regex`。 */
  path: string
  message: string
}

/**
 * 语句判据：返回 `undefined` = 放行；返回字符串 = 拒绝原因（给人看的一句话）。
 *
 * 默认实现走 `sql.ts` 的 `classifySql`，所以写语句 / 多语句 / 未闭合 都会在**加载时**被拦下。
 * 注入是为了让清单校验可以独立测，而不是为了允许别的判据（真源仍只有一处）。
 */
export type StatementClassifier = (statement: string) => string | undefined

/**
 * 默认语句判据：**复用 §3.6 的全套 SQL 判据**。
 *
 * 关键在「复用」而不是「再写一份」：断言库**不新增任何写能力**（§3.9 约束 1），
 * 它只是 §3.2 那个只读档的消费者。写一份自己的语句检查就是造第二个真相源——
 * 而两个真相源漂开的方向会是「断言库这一份更松」。
 */
export const classifyAssertionStatement: StatementClassifier = (statement) => {
  const verdict = classifySql(statement)
  if (verdict.ok) return undefined
  return sqlRejectionHint(verdict)
}

/** 断言 id 的形状：小写字母数字加 `-` / `.` / `_`，且以字母数字开头（报告里好点名）。 */
const ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/

/**
 * 校验一份已解析的清单。
 *
 * **一次报全部错误**而不是遇到第一个就停：清单是给人改的，一条一条试错很贵。
 *
 * @param project - 项目名（由文件名推出；清单里的 `project` 必须与它一致）
 * @param data - YAML 解析出来的原始值
 * @param classify - 语句判据（默认 `classifyAssertionStatement`）
 */
export function validateManifest(
  project: string,
  data: unknown,
  classify: StatementClassifier = classifyAssertionStatement,
): { ok: true; manifest: VerifyManifest } | { ok: false; errors: VerifyConfigError[] } {
  const errors: VerifyConfigError[] = []
  const fail = (path: string, message: string): void => {
    errors.push({ path, message })
  }

  if (!isRecord(data)) {
    return { ok: false, errors: [{ path: '', message: '清单顶层必须是一个映射（mapping）' }] }
  }

  if (data.version !== 1) {
    fail('version', `本模块只认 version: 1，拿到 ${JSON.stringify(data.version)}`)
  }
  if (data.project !== project) {
    fail(
      'project',
      `清单里的 project（${JSON.stringify(data.project)}）与文件名推出的项目（${JSON.stringify(project)}）不一致——` +
        '复制清单改漏会让断言跑到别的项目上',
    )
  }

  const raw = data.assertions
  if (!Array.isArray(raw)) {
    fail('assertions', '`assertions` 必须是数组')
    return { ok: false, errors }
  }
  if (raw.length === 0) {
    // 空清单与「没有清单」是两件事：前者是「声明了这个项目要验活，但一条都没写」——
    // 报绿会让「核对过了」变成一句空话。
    fail('assertions', '`assertions` 是空的：要么删掉这份清单，要么把断言写上（空清单不该报绿）')
  }

  const seen = new Map<string, number>()
  raw.forEach((item, index) => {
    const at = `assertions[${String(index)}]`
    if (!isRecord(item)) {
      fail(at, '每一条断言必须是一个映射')
      return
    }

    const id = item.id
    if (typeof id !== 'string' || !ID_PATTERN.test(id)) {
      fail(`${at}.id`, `id 必须匹配 ${String(ID_PATTERN)}（小写字母数字，可含 . - _），拿到 ${JSON.stringify(id)}`)
    } else if (seen.has(id)) {
      fail(`${at}.id`, `id ${JSON.stringify(id)} 重复（第 ${String((seen.get(id) ?? 0) + 1)} 次出现）——报告里点名会指错`)
    } else {
      seen.set(id, index)
    }

    if (typeof item.appliesTo !== 'string' || !(APPLIES_TO as readonly string[]).includes(item.appliesTo)) {
      fail(`${at}.appliesTo`, `必须是 ${APPLIES_TO.join(' / ')} 之一，拿到 ${JSON.stringify(item.appliesTo)}`)
    }
    if (typeof item.target !== 'string' || item.target.trim() === '') {
      fail(`${at}.target`, '必须是非空的 DevDataTarget.id')
    }

    if (typeof item.statement !== 'string' || item.statement.trim() === '') {
      fail(`${at}.statement`, '必须是非空的只读语句')
    } else {
      const rejected = classify(item.statement)
      if (rejected !== undefined) {
        fail(`${at}.statement`, `语句没通过只读判据：${rejected}`)
      }
    }

    if (typeof item.severity !== 'string' || !(SEVERITIES as readonly string[]).includes(item.severity)) {
      fail(`${at}.severity`, `必须是 ${SEVERITIES.join(' / ')} 之一，拿到 ${JSON.stringify(item.severity)}`)
    }

    if (item.timeoutMs !== undefined) {
      if (typeof item.timeoutMs !== 'number' || !Number.isInteger(item.timeoutMs) || item.timeoutMs <= 0) {
        fail(`${at}.timeoutMs`, `必须是正整数毫秒，拿到 ${JSON.stringify(item.timeoutMs)}`)
      }
    }

    validateExpect(item.expect, `${at}.expect`, fail)
  })

  return errors.length > 0 ? { ok: false, errors } : { ok: true, manifest: data as unknown as VerifyManifest }
}

/**
 * 校验 `expect`。
 *
 * 两条刻意的严格：
 *   - **空 `expect` 拒**：一条没有任何判据的断言只会报绿——它看起来配好了，实际什么都没验；
 *   - **正则在这里就编译**：语法错的正则拖到运行时，会表现为一条 fail（「数据不对」），
 *     而真实原因是「清单写错了」。
 */
function validateExpect(value: unknown, path: string, fail: (path: string, message: string) => void): void {
  if (!isRecord(value)) {
    fail(path, '`expect` 必须是映射（至少给一个判据）')
    return
  }

  const keys = Object.keys(value)
  const unknownKeys = keys.filter((key) => key !== 'column' && !(EXPECT_OPERATORS as readonly string[]).includes(key))
  for (const key of unknownKeys) {
    fail(`${path}.${key}`, `未知的期望算子；本模块认 ${EXPECT_OPERATORS.join(' / ')}（外加 column）——不认识的一律拒，不静默忽略`)
  }

  const operators = EXPECT_OPERATORS.filter((op) => value[op] !== undefined)
  if (operators.length === 0) {
    fail(path, `至少给一个判据（${EXPECT_OPERATORS.join(' / ')}）——空 expect 的断言只会报绿`)
  }

  if (value.column !== undefined && (typeof value.column !== 'string' || value.column.trim() === '')) {
    fail(`${path}.column`, '给 `column` 时它必须是非空字符串')
  }

  if (value.regex !== undefined) {
    if (typeof value.regex !== 'string') {
      fail(`${path}.regex`, `必须是字符串，拿到 ${JSON.stringify(value.regex)}`)
    } else {
      try {
        // 只编译不执行：还没有任何数据进来，这里要抓的是「正则本身不合法」。
        new RegExp(value.regex)
      } catch (error) {
        fail(`${path}.regex`, `正则不合法：${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }

  for (const op of ['gte', 'lte', 'rowCount'] as const) {
    const bound = value[op]
    if (bound === undefined) continue
    if (typeof bound !== 'number' || !Number.isFinite(bound)) {
      fail(`${path}.${op}`, `必须是有限数字，拿到 ${JSON.stringify(bound)}`)
    }
  }

  if (value.rowCount !== undefined && typeof value.rowCount === 'number' && Number.isFinite(value.rowCount)) {
    if (!Number.isInteger(value.rowCount) || value.rowCount < 0) {
      fail(`${path}.rowCount`, `行数必须是非负整数，拿到 ${JSON.stringify(value.rowCount)}`)
    }
  }

  if (
    typeof value.gte === 'number' &&
    typeof value.lte === 'number' &&
    Number.isFinite(value.gte) &&
    Number.isFinite(value.lte) &&
    value.gte > value.lte
  ) {
    fail(`${path}`, `gte (${String(value.gte)}) 大于 lte (${String(value.lte)})：这条断言永远不可能通过`)
  }

  if (typeof value.rowCount === 'number' && typeof value.lte === 'number' && value.rowCount > value.lte) {
    // `rowCount` 与 `lte` 都作用在行数上，写反了就是自相矛盾。指出来，别让它静默恒假。
    fail(`${path}`, `rowCount (${String(value.rowCount)}) 大于 lte (${String(value.lte)})：两者都作用在行数上，不可能同时成立`)
  }
}

/** 判断一个值是不是普通对象（YAML 映射解析出来的形态）。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * 清单的文件名（**唯一一处**）：`verify/<project>.yaml`。
 *
 * 只认 `.yaml` 不认 `.yml`：一份清单两个可能的文件名会让「有没有清单」这件事有两种答案，
 * 而「缺省即无」是这一层的安全判据——歧义在这里的代价是静默地无断言。
 */
export function manifestFileName(project: string): string {
  return `${project}.yaml`
}

/** 清单在项目里的相对路径：`verify/<project>.yaml`。 */
export function manifestRelativePath(project: string): string {
  return `verify/${manifestFileName(project)}`
}

/**
 * 扫一遍「哪些项目真的有清单」。
 *
 * 输入是**已经列好的文件名**（不读目录——本模块不做 I/O，保持可测）。
 * 返回项目名 → 文件名的对应；非 `verify/<project>.yaml` 的文件一律忽略。
 */
export function projectsWithManifest(files: readonly string[]): Map<string, string> {
  const out = new Map<string, string>()
  for (const file of files) {
    if (!file.startsWith('verify/') || !file.endsWith('.yaml')) continue
    const stem = file.slice('verify/'.length, -'.yaml'.length)
    if (stem === '' || stem.includes('/')) continue
    out.set(stem, file)
  }
  return out
}

/** 加载选项。 */
export interface LoadManifestOptions {
  /**
   * 找清单的根目录（按顺序找，第一个命中的生效）。
   *
   * 缺省 `['.']`（当前工作目录）。给多级是为了「仓库根 + 子项目」这种布局；
   * 但**第一个命中的就生效**——两份清单同时存在是歧义，不该靠顺序静默决定。
   * 所以找到一份之后再发现另一份会报 `unreadable`（当成配置冲突，不是覆盖）。
   */
  roots?: readonly string[]
  /** 语句判据（默认真源：`classifyAssertionStatement`）。 */
  classify?: StatementClassifier
}

/**
 * 从项目里读一份清单（**只读**，不写、不改、不生成模板）。
 *
 * 三种「读不到」刻意分开（见 `ManifestLoad`）：它们的处置完全不同。
 *
 * YAML 用 `JSON_SCHEMA`：清单是**配置数据**，不是「能求值的表达式」。
 * 默认 schema 会把 `!!js` 一类标签放进来——那等于把「断言」变成「脚本」，评审面完全不同。
 */
export function loadManifest(project: string, options: LoadManifestOptions = {}): ManifestLoad {
  const roots = options.roots ?? ['.']
  const classify = options.classify ?? classifyAssertionStatement
  const hits: { file: string; text: string }[] = []

  for (const root of roots) {
    const dir = isAbsolute(root) ? root : resolve(root)
    const file = join(dir, 'verify', manifestFileName(project))
    let text: string
    try {
      text = readFileSync(file, 'utf8')
    } catch (error) {
      if (isNotFound(error)) continue
      return { kind: 'unreadable', project, message: `读不到 ${file}：${error instanceof Error ? error.message : String(error)}` }
    }
    hits.push({ file, text })
  }

  if (hits.length === 0) return { kind: 'no-manifest', project }
  if (hits.length > 1) {
    return {
      kind: 'unreadable',
      project,
      message: `在多个根目录下都找到了 ${manifestRelativePath(project)}：${hits.map((hit) => hit.file).join('、')}——两份清单是歧义，请只留一份`,
    }
  }

  const hit = hits[0] as { file: string; text: string }
  let data: unknown
  try {
    data = yaml.load(hit.text, { schema: yaml.JSON_SCHEMA })
  } catch (error) {
    return { kind: 'unreadable', project, message: `${hit.file} 的 YAML 语法错：${error instanceof Error ? error.message : String(error)}` }
  }

  if (data === undefined || data === null) {
    // 空文件不是「无断言」——文件在，说明有人打算写断言。报配置错，让人补上或删掉。
    return { kind: 'config-error', project, errors: [{ path: '', message: `${hit.file} 是空的：要么写上断言，要么删掉它（空文件与「没有清单」是两件事）` }] }
  }

  const validated = validateManifest(project, data, classify)
  return validated.ok ? { kind: 'ok', manifest: validated.manifest } : { kind: 'config-error', project, errors: validated.errors }
}

/** 区分「文件不存在」与「文件在但读不了」——前者是正常的 `no-manifest`，后者要报出来。 */
function isNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'ENOENT'
}
