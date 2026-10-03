/**
 * 就绪清单的**加载**（`docs/devdata-plan.md` §13.2 的「清单随项目走」）。
 *
 * ## 目录约定与文件名
 *
 * `<项目根>/ready/<项目名>.ready.yaml`——与数据面的 `<项目根>/verify/<项目名>.yaml` **同构**
 * （同一套「清单随项目评审、DSH 侧只读」的纪律），文件名多带一个 `.ready.yaml` 后缀是为了让
 * `profilesIn`（`env-ready.ts`）能在一堆 yaml 里认出自己那一份。
 *
 * ## 三种「读不到」必须分开（与断言库同一口径）
 *
 * `no-profile`（没这份清单 = 这个项目**没有就绪要求**）、`unreadable`（文件在但读不了）、
 * `config-error`（读到了但清单本身不成立，**指到字段**）。把它们合成一句「加载失败」的代价是：
 * 用户分不清「我没写」和「我写错了」，而这两件事的下一步动作完全不同。
 */
import { readdirSync } from 'node:fs'
import { join } from 'node:path'

import { manifestFileName as kitManifestFileName, manifestRelPath, readProjectManifest } from '@hyzyn/dsh-kit/manifest'

import { profileFileName, profilesIn, validateProfile, type ProfileLoad } from './env-ready.js'

/** 清单所在子目录（`<项目根>/ready/`）。 */
export const READY_DIR = 'ready'

/** 清单在项目里的相对路径（**唯一一处**，别的代码不许再拼一遍）。 */
export function readyManifestPath(dir: string, project: string): string {
  return join(dir, READY_DIR, profileFileName(project))
}

/** 项目里的就绪清单路径（用于「你这里还有哪些清单」这句提示）。 */
export function readyManifestRelPath(project: string): string {
  return `${READY_DIR}/${profileFileName(project)}`
}

/**
 * 列出这个目录下**已有的**项目名（按文件名）。
 *
 * 用途只有一处：`no-profile` 的文案里附上「这里现在有哪些清单」——清单名与项目名不一致
 * （比如文件名写成 `ems-service.ready.yaml`）是最常见的写错方式，报一句「没有」而不给对照，
 * agent 会去猜目录。
 */
export function listReadyProjects(dir: string): string[] {
  try {
    return [...profilesIn(readdirSync(join(dir, READY_DIR))).keys()].sort()
  } catch {
    return []
  }
}

/**
 * 加载一份就绪清单。**永不抛**：三种失败都是返回值（调用方要把它们说给人听）。
 */
export function loadReadyProfile(dir: string, project: string): ProfileLoad {
  // 读清单这件事（JSON_SCHEMA / 五种「读不到」）在 `@hyzyn/dsh-kit/manifest`，与 `devdata` /
  // `devfront` 同一份实现；这里只把它翻成本包的结果与文案。
  const read = readProjectManifest([readyManifestPath(dir, project)])

  if (read.kind === 'missing') return { kind: 'no-profile', project }
  if (read.kind === 'multiple') {
    // 单路径调用下到不了；留着是为了「档位映射是穷尽的」——将来若支持多根，文案在这里现成。
    return { kind: 'unreadable', project, message: `在多个根目录下都找到了 ${readyManifestRelPath(project)}：${read.files.join('、')}——两份清单是歧义，请只留一份` }
  }
  if (read.kind === 'unreadable') return { kind: 'unreadable', project, message: read.message }
  if (read.kind === 'malformed') {
    // YAML 语法错也算「清单不成立」，但路径指不到字段——把解析器那句话原样带上（它通常带行列）。
    return { kind: 'config-error', project, errors: [{ path: '', message: `YAML 解析失败：${read.message}` }] }
  }

  // `empty`（空文件）与 `parsed` 走同一条：交给 `validateProfile` 去说「它不成立」——
  // 与上收前的行为逐字一致（那时 `yaml.load('')` 也给 undefined）。
  const data = read.kind === 'empty' ? undefined : read.data
  const validated = validateProfile(project, data)
  if (!validated.ok) return { kind: 'config-error', project, errors: validated.errors }
  return { kind: 'ok', profile: validated.profile }
}

/** `describeProfileProblem` 的输入。 */
export interface ProfileProblemContext {
  /** 项目根（判据用的目录）。 */
  cwd: string
  project: string
  /** 这个目录下已有的清单名（`no-profile` 时用来给一条对照）。 */
  known: readonly string[]
}

/**
 * 把一次加载失败说成 agent 能据以行动的话（**纯函数**，所以能逐档断言）。
 *
 * 三种失败必须**各自**说清，因为下一步动作完全不同：
 *   - `no-profile` → 去写一份（或者确认这个项目确实没有就绪要求）；
 *   - `unreadable` → 去看权限 / 挂载（清单在，但读不了）；
 *   - `config-error` → 去改清单（错在哪一字段由 `validateProfile` 指出来）。
 *
 * 合成一句「加载失败」的代价是：用户分不清「我没写」和「我写错了」。`no-profile` 那档还额外附上
 * 「这里现在有哪些清单」——文件名与项目名不一致是最常见的写错方式，只报「没有」会让人去猜目录。
 */
export function describeProfileProblem(loaded: Exclude<ProfileLoad, { kind: 'ok' }>, context: ProfileProblemContext): string {
  const rel = readyManifestRelPath(context.project)
  if (loaded.kind === 'no-profile') {
    return `项目 ${JSON.stringify(context.project)} 没有就绪清单：找不到 ${rel}（相对于 ${context.cwd}）。` +
      `\n**没有清单 = 这个项目没有就绪要求**，不是「用默认要求」。` +
      `\n恢复路径：${context.known.length === 0
        ? `在 ${context.cwd}/${READY_DIR}/ 下写一份 ${profileFileName(context.project)}（格式见 packages/devenv/README.md）`
        : `这个目录下现有的清单是：${context.known.join(' / ')}——清单里的 project 要与文件名一致`}`
  }
  if (loaded.kind === 'unreadable') {
    return `就绪清单读不了（${rel}，项目根 ${context.cwd}）：${loaded.message}`
  }
  const lines = loaded.errors.map((error) => (error.path === '' ? error.message : `${error.path}：${error.message}`))
  return `就绪清单不成立（${rel}，项目根 ${context.cwd}）：\n${lines.map((line) => `- ${line}`).join('\n')}`
}
