/**
 * `docker inspect` 的**结构样本**工具：模板字段路径 ↔ 真机 JSON 结构。
 *
 * ## 为什么单独一个模块（而不是留在守卫用例里）
 *
 * 这里的东西有三个消费者：`inspect-template.test.ts`（拿**入库的结构样本**守字段路径）、
 * `real-health-local.test.ts`（拿**当下这台 daemon 的真输出**守同一件事），以及
 * [README](../README.md) 里那段「样本从哪来」的复现命令（`shapeOf`）。放在被测用例文件里的话，
 * 另一个用例文件一 import 就会把它的 `describe` 也注册一遍——那是两份用例，不是共享。
 *
 * ## 一条判据：样本里**只有键与类型，没有值**
 *
 * `shapeOf` 把真输出里的每个标量换成它的类型标记、数组换成一个代表性元素的结构。于是入库存的是
 * **结构契约**（模板该往哪条路径走），而不是某个容器的现场——现场会过期，结构不会。
 */
import { readFileSync } from 'node:fs'

/** 一份结构样本（`docker-inspect.state.json` / `docker-inspect.health.json` 的形状）。 */
export type InspectShape = Record<string, unknown>

/** 读一份入库的结构样本。 */
export function readShape(name: 'state' | 'health'): InspectShape {
  return JSON.parse(readFileSync(new URL(`./fixtures/docker-inspect.${name}.json`, import.meta.url), 'utf8')) as InspectShape
}

/**
 * 把一份真 `docker inspect` 输出压成**结构**（标量 → 类型名，数组 → 一个代表性元素的结构）。
 *
 * README 里那段复现命令用的就是它。
 */
export function shapeOf(value: unknown): unknown {
  if (Array.isArray(value)) return value.length === 0 ? [] : [shapeOf(value[0])]
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return Object.fromEntries(Object.keys(record).sort().map((key) => [key, shapeOf(record[key])]))
  }
  return typeof value
}

/**
 * 抠出模板里的字段路径，并标出它是否被 `{{if …}}` 保护着。
 *
 * `{{if .X}}…{{end}}` 里的路径**允许在样本里不存在**（那正是 if 的用途：没有健康检查的容器），
 * 而没被保护的路径**必须在样本里存在**——`RestartCount` 那个缺陷就属于后者。
 */
export function templatePaths(template: string): Array<{ path: string; guarded: boolean }> {
  const guardedSpans: Array<[number, number]> = []
  for (const matched of template.matchAll(/\{\{if\s+([^}]*)\}\}([\s\S]*?)\{\{end\}\}/g)) {
    const start = (matched.index ?? 0) + matched[0].indexOf('}}') + 2
    guardedSpans.push([start, start + (matched[2] as string).length])
  }
  const out: Array<{ path: string; guarded: boolean }> = []
  for (const matched of template.matchAll(/\{\{\.([A-Za-z0-9_.]+)\}\}/g)) {
    const at = matched.index ?? 0
    out.push({ path: matched[1] as string, guarded: guardedSpans.some(([from, to]) => at >= from && at < to) })
  }
  return out
}

/** 在样本里走一条字段路径；走到就返回它的类型标记，走不到返回 `undefined`。 */
export function walkSample(sample: unknown, path: string): unknown {
  let current: unknown = sample
  for (const segment of path.split('.')) {
    if (current === null || typeof current !== 'object' || Array.isArray(current)) return undefined
    const record = current as Record<string, unknown>
    if (!(segment in record)) return undefined
    current = record[segment]
  }
  return current
}

/** 模板的字段路径问题（空 = 通过）。 */
export function templateProblems(template: string, sample: unknown): string[] {
  const problems: string[] = []
  const paths = templatePaths(template)
  if (paths.length !== 5) problems.push(`模板应当有 5 条字段路径（解析层按 5 段拆分），实际 ${String(paths.length)} 条`)
  for (const { path, guarded } of paths) {
    const hit = walkSample(sample, path)
    if (hit === undefined && !guarded) {
      problems.push(`字段路径 .${path} 在真机样本里不存在（docker 的模板会直接报 map has no entry，每条 inspect 都会失败）`)
    }
  }
  // `Health` 这一条必须**受保护**：没有健康检查的容器上它是 nil，裸写会让这些容器全都取不到观测。
  const health = paths.find((item) => item.path === 'State.Health.Status')
  if (health !== undefined && !health.guarded) {
    problems.push('State.Health.Status 没有被 {{if .State.Health}} 保护：没配健康检查的容器会整个取不到观测')
  }
  return problems
}
