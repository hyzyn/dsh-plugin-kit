/**
 * **一次发布的证据链总览**（P13 第一版，2026-10-04 开工）。
 *
 * ## 它回答什么、不回答什么
 *
 * 一次发布之后要回答三件事：**容器起来了**（`devenv`）→ **数据对**（本包）→ **页面对**（`devfront`）。
 * 三面靠**同一个项目名**对齐，各有一份随项目仓库走的清单（口径见
 * [conventions.md § 一次发布的证据链](../../../docs/conventions.md#一次发布的证据链同一个项目名三份清单)）：
 *
 * | 面 | 清单 | 归属 | 看结论的工具 |
 * |---|---|---|---|
 * | 容器 | `ready/<项目>.ready.yaml` | `devenv` | `env_wait` |
 * | 数据 | `verify/<项目>.yaml` | 本包 | `devdata_verify` |
 * | 页面 | `web/<项目>.yaml` | `devfront` | `site_verify` |
 *
 * 本模块**只做通用读取**：文件在不在、能不能解析、清单里写的项目名与文件名一致吗、条目数几条。
 * **它不做领域校验，也不冒充结论**——「服务真的就绪了吗」「断言真的过了吗」只有各面自己的工具
 * 回答得了（它们的判据是声明式的，跑一次要连目标）。所以这里叫**总览**，不叫结果。
 *
 * 三个路径**不许在这里另拼一份**：`components` 里那三个后缀是各面的口径，由
 * `scripts/test/release-chain.test.ts` 把它们与 `devenv` 的 `readyManifestRelPath`、本包的
 * `verifyManifestRelPath`、`devfront` 的 `webManifestRelativePath` **逐一对齐**（漂了会红）。
 *
 * ## 为什么这个函数是纯的
 *
 * 它只读文件系统、不连任何目标、不写任何东西——所以单测不需要夹具服务器，真机脚本也不需要
 * 一个能连通的库。这条性质是「面板不是特权路径」的一半：**这条路上没有能改东西的代码**。
 */
import { statSync } from 'node:fs'
import { isAbsolute } from 'node:path'

import { manifestRelPath, readProjectManifest } from '@hyzyn/dsh-kit/manifest'

/** 三面各自的清单形态。`countField` 是各面清单里那个「条目数组」的字段名（只用来数条数）。 */
export interface EvidenceFaceSpec {
  readonly face: EvidenceFace
  readonly dir: string
  readonly suffix: string
  readonly countField: string
  /** 归属包——文案里点名，出问题时知道该找谁。 */
  readonly owner: string
  /** 看**结论**要用的工具名（总览只给结论的入口，不给结论）。 */
  readonly tool: string
}

export type EvidenceFace = 'ready' | 'verify' | 'web'

/**
 * 三面清单的形态。**这三个后缀就是「清单住在哪」的口径**——本文件不导出去给别的包用，
 * 只被本模块与 `scripts/test/release-chain.test.ts` 的对齐守卫读（后者拿它与另外两包自己的
 * 路径函数逐个比对）。
 */
export const EVIDENCE_FACES: readonly EvidenceFaceSpec[] = [
  { face: 'ready', dir: 'ready', suffix: '.ready.yaml', countField: 'services', owner: '@hyzyn/dsh-devenv', tool: 'env_wait' },
  { face: 'verify', dir: 'verify', suffix: '.yaml', countField: 'assertions', owner: '@hyzyn/dsh-devdata', tool: 'devdata_verify' },
  { face: 'web', dir: 'web', suffix: '.yaml', countField: 'assertions', owner: '@hyzyn/dsh-devfront', tool: 'site_verify' },
] as const

/** 读取结果：与 `@hyzyn/dsh-kit/manifest` 的 `ManifestRead` 同名同义（那是唯一真源）。 */
export type EvidenceState = 'missing' | 'unreadable' | 'malformed' | 'empty' | 'multiple' | 'parsed'

export interface EvidenceFaceReport {
  readonly face: EvidenceFace
  /** 相对项目根的清单路径（唯一拼法在 `manifestRelPath`）。 */
  readonly path: string
  readonly state: EvidenceState
  /** `unreadable` / `malformed` 时是读取器或 YAML 解析器的原话；其余为 `null`。 */
  readonly message: string | null
  /** `multiple` 时是那几个候选路径（歧义要报出来，不按顺序静默取胜）。 */
  readonly files: readonly string[] | null
  /** 清单里写的 `project`（没读到或不是字符串时为 `null`）。 */
  readonly projectInFile: string | null
  /** 与文件名里的项目名一致吗；`null` = 没读到，谈不上一致。 */
  readonly projectMatches: boolean | null
  /** `countField` 那个数组的长度；不是数组时为 `null`（**不回落成 0**——0 条是结论，读不到不是）。 */
  readonly count: number | null
  readonly countField: string
  readonly owner: string
  readonly tool: string
}

export interface EvidenceReport {
  readonly ok: true
  readonly root: string
  readonly project: string
  readonly faces: readonly EvidenceFaceReport[]
  /**
   * Jenkins 那一格**今天没有实现**——如实说「未接」，不摆一个空壳装作接了。
   * （发布归 Jenkins；本仓没有任何一条从插件连它的通路。）
   */
  readonly jenkins: { readonly state: 'unwired' }
}

export interface EvidenceRefusal {
  readonly ok: false
  readonly code: 'BAD_ROOT' | 'BAD_PROJECT'
  readonly error: string
}

/**
 * 项目名允许的形态：**它同时是清单文件名**，所以不许出现路径分隔符、不许以点开头。
 *
 * 这道判据是**安全**的，不是风格：`manifestRelPath` 只做字符串拼接，`../../` 一类会读写到项目根
 * 之外去（工具面上的调用方是 agent，这里多了一条**浏览器**入口——多一个调用方就多一次校验）。
 */
const PROJECT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

/**
 * 读一个项目的三份清单，给出总览。
 *
 * 不抛异常：**每一种拒绝都是一种结果**（`BAD_ROOT` / `BAD_PROJECT` 与「清单不存在」是两件事，
 * 前者是路径写错了，后者是「这个项目刚好没有那份清单」）。
 */
export function readEvidence(input: { root: unknown; project: unknown }): EvidenceReport | EvidenceRefusal {
  const root = typeof input.root === 'string' ? input.root.trim() : ''
  const project = typeof input.project === 'string' ? input.project.trim() : ''

  if (root === '' || !isAbsolute(root)) {
    return { ok: false, code: 'BAD_ROOT', error: `项目根必须是非空绝对路径，拿到 ${JSON.stringify(root)}` }
  }
  /*
   * 根目录不存在时报「路径不对」而不是「三份清单都没有」：后者会把「你把路径写错了」说成
   * 「这个项目什么都没有」——那是本仓最忌讳的错诊断（人接着会去建清单，而清单本来就在别处）。
   */
  let stats
  try {
    stats = statSync(root)
  } catch (error) {
    return { ok: false, code: 'BAD_ROOT', error: `项目根读不了：${error instanceof Error ? error.message : String(error)}` }
  }
  if (!stats.isDirectory()) {
    return { ok: false, code: 'BAD_ROOT', error: `项目根不是目录：${root}` }
  }
  if (!PROJECT_PATTERN.test(project)) {
    return {
      ok: false,
      code: 'BAD_PROJECT',
      error: `项目名必须匹配 ${String(PROJECT_PATTERN)}（它同时是清单文件名），拿到 ${JSON.stringify(project)}`,
    }
  }

  const faces = EVIDENCE_FACES.map((spec) => readFace(root, project, spec))
  return { ok: true, root, project, faces, jenkins: { state: 'unwired' } }
}

function readFace(root: string, project: string, spec: EvidenceFaceSpec): EvidenceFaceReport {
  const rel = manifestRelPath(spec.dir, project, spec.suffix)
  const read = readProjectManifest([`${root}/${rel}`])
  const base = { face: spec.face, path: rel, countField: spec.countField, owner: spec.owner, tool: spec.tool }

  if (read.kind === 'missing') {
    return { ...base, state: 'missing', message: null, files: null, projectInFile: null, projectMatches: null, count: null }
  }
  if (read.kind === 'unreadable') {
    return { ...base, state: 'unreadable', message: read.message, files: null, projectInFile: null, projectMatches: null, count: null }
  }
  if (read.kind === 'malformed') {
    return { ...base, state: 'malformed', message: read.message, files: null, projectInFile: null, projectMatches: null, count: null }
  }
  if (read.kind === 'empty') {
    return { ...base, state: 'empty', message: null, files: null, projectInFile: null, projectMatches: null, count: null }
  }
  if (read.kind === 'multiple') {
    /*
     * 「多个候选」在所有真实调用里只可能来自「仓库根 + 子项目」那种布局——本模块一次只查**一个**
     * 路径，所以 `multiple` 其实到不了这里。仍然按 `ManifestRead` 的分支如实处理：**类型上是分的，
     * 就不许用 `else` 把它和 `parsed` 混在一起**（那是「不认识的输入也当成功」的开端）。
     */
    return { ...base, state: 'multiple', message: null, files: read.files, projectInFile: null, projectMatches: null, count: null }
  }

  const data = read.data
  const record = typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : undefined
  const inFile = record === undefined ? undefined : record.project
  const list = record === undefined ? undefined : record[spec.countField]
  return {
    ...base,
    state: 'parsed',
    message: null,
    files: null,
    projectInFile: typeof inFile === 'string' ? inFile : null,
    // 清单里没写 `project` 也算**不一致**：文件名是唯一对齐键，漏写就是没对齐。
    projectMatches: typeof inFile === 'string' ? inFile === project : false,
    count: Array.isArray(list) ? list.length : null,
  }
}
