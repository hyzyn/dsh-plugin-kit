/**
 * 三面快速开始的项目上下文。只处理调用方提供的值，不读文件、不取 cwd、不保存配置。
 * `release` 仅标记发布后核验流程；模式与启用面均不参与能力授权或作用域裁决。
 */
import { isAbsolute, normalize } from 'node:path'

export type ProjectMode = 'readonly' | 'release'
export type ProjectFace = 'environment' | 'data' | 'front'

const PROJECT_FACES = ['environment', 'data', 'front'] as const
const PROJECT_MODES = ['readonly', 'release'] as const
const PROJECT_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
const TOP_LEVEL_FIELDS = new Set(['root', 'project', 'mode', 'enabled'])

export interface ProjectContext {
  /** 调用方显式提供的本机绝对路径；这里只做词法归一化，不证明目录存在。 */
  readonly root: string
  /** 与三面清单文件名一致的项目名。 */
  readonly project: string
  readonly mode: ProjectMode
  readonly enabled: Readonly<Record<ProjectFace, boolean>>
  /** 两种流程均只读。这不是目标的权限快照，也不授予任何能力。 */
  readonly readOnly: true
}

export interface ProjectContextProblem {
  /** 点号路径指向出错字段；未知字段也必须可被调用方定位。 */
  readonly field: string
  readonly message: string
}

export type ProjectContextResult =
  | { readonly ok: true; readonly context: ProjectContext; readonly problems: readonly [] }
  | { readonly ok: false; readonly context: null; readonly problems: readonly ProjectContextProblem[] }

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

/**
 * 归一化最小项目上下文。
 *
 * root / project 必须明确给出，mode 缺省 readonly，三面开关缺省全部关闭。
 * 坏输入逐字段报问题并不产出上下文，不把相对路径绑定到宿主 cwd，也不展开 `~`。
 */
export function normalizeProjectContext(input: unknown): ProjectContextResult {
  const raw = record(input)
  if (raw === undefined) {
    return { ok: false, context: null, problems: [{ field: 'input', message: '项目上下文必须是一个对象' }] }
  }

  const problems: ProjectContextProblem[] = []
  for (const key of Object.keys(raw)) {
    if (!TOP_LEVEL_FIELDS.has(key)) {
      problems.push({ field: key, message: `不支持的项目上下文字段：${key}` })
    }
  }

  const root = typeof raw.root === 'string' ? raw.root.trim() : ''
  if (root === '' || root.includes('\0') || !isAbsolute(root)) {
    problems.push({ field: 'root', message: '项目根必须是非空绝对路径，不能包含 NUL；相对路径和 ~ 不会自动展开' })
  }

  const project = typeof raw.project === 'string' ? raw.project.trim() : ''
  // 项目名同时是清单文件名：与证据链总览相同，不允许路径分隔符或以点开头。
  if (!PROJECT_NAME.test(project)) {
    problems.push({ field: 'project', message: '项目名必须以字母或数字开头，且只包含字母、数字、点、下划线和短横线' })
  }

  const mode = raw.mode === undefined ? 'readonly' : raw.mode
  if (!PROJECT_MODES.includes(mode as ProjectMode)) {
    problems.push({ field: 'mode', message: 'mode 只支持 readonly / release；release 也只做只读核验' })
  }

  const enabled: Record<ProjectFace, boolean> = { environment: false, data: false, front: false }
  if (raw.enabled !== undefined) {
    const faces = record(raw.enabled)
    if (faces === undefined) {
      problems.push({ field: 'enabled', message: 'enabled 必须是 environment / data / front 的布尔开关对象' })
    } else {
      for (const key of Object.keys(faces)) {
        if (!(PROJECT_FACES as readonly string[]).includes(key)) {
          problems.push({ field: `enabled.${key}`, message: `不支持的启用面：${key}` })
        }
      }
      for (const face of PROJECT_FACES) {
        const value = faces[face]
        if (value === undefined) continue
        if (typeof value === 'boolean') enabled[face] = value
        else problems.push({ field: `enabled.${face}`, message: '启用面必须是布尔值，不接受字符串或数字' })
      }
    }
  }

  if (problems.length > 0 || !PROJECT_MODES.includes(mode as ProjectMode)) {
    return { ok: false, context: null, problems }
  }

  return {
    ok: true,
    context: {
      root: normalize(root),
      project,
      mode: mode as ProjectMode,
      enabled: Object.freeze(enabled),
      readOnly: true,
    },
    problems: [],
  }
}
