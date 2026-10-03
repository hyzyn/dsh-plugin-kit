/**
 * `docker inspect --format` 的**字段路径守卫**。
 *
 * ## 它是被一次真机缺陷逼出来的（2026-10-02）
 *
 * `INSPECT_TEMPLATE` 原先写的是 `{{.State.RestartCount}}`——而 `RestartCount` 是**顶层**字段。
 * docker 的模板对缺失的键**直接报错**（`template parsing error: map has no entry for key
 * "RestartCount"`），于是**每一条 inspect 都失败**：`env_status` 只会说「取观测失败」，
 * 而真正的原因是一个字段路径写错了。
 *
 * **假 docker 夹具抓不到它**：夹具照自己的想象回一行 `running|…|0|0|`，模板对不对它不关心——
 * 这正是「夹具与真机之间的保真度缺口」。所以这里拿**真机 `docker inspect` 的结构样本**来判：
 * 模板里的每条字段路径，必须在真机样本里真的有。
 *
 * ## 样本从哪来（可复现）
 *
 * ```sh
 * # 在目标机上取一份真实输出，只保留**结构**（标量换成类型标记，真值一个都不进仓库）
 * docker inspect <容器> | node -e '<shapeOf 见 packages/devenv/README.md>'
 * ```
 *
 * 现成的两份样本在 `test/fixtures/`：一份来自没有健康检查的容器（这台机器上 24 个容器**都没有**
 * 配健康检查），另一份是**同一台机器的结构**再取一次（保留备用）。两份都只有键与类型，没有值。
 *
 * ## 验不到的那一条照实说
 *
 * `{{if .State.Health}}{{.State.Health.Status}}{{end}}` 这条路径**在样本里不存在**（样本容器没有
 * 健康检查），所以守卫只能验它「写成受 `{{if}}` 保护」这一条——**不能**说「Health 已验证」。
 * 本仓的规矩是「验不到的一律报 warn，不报 ✓」（`devdata` 的 doctor 就是这条），所以下面有一条
 * 用例专门断言这件事，而不是让它静默通过。
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { INSPECT_TEMPLATE } from '../src/observe.js'

const SAMPLE = JSON.parse(readFileSync(new URL('./fixtures/docker-inspect.state.json', import.meta.url), 'utf8')) as Record<string, unknown>

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

/** 在模板上做一次替换造反例；替换没生效就抛（否则反例会变成空测试）。 */
function mutate(template: string, from: string, to: string): string {
  if (!template.includes(from)) throw new Error(`fixture 替换没匹配上：${from}`)
  return template.replace(from, to)
}

describe('INSPECT_TEMPLATE 的字段路径必须在真机结构里存在', () => {
  it('真实模板 vs 真机样本（无健康检查的那一份）', () => {
    expect(templateProblems(INSPECT_TEMPLATE, SAMPLE)).toEqual([])
  })

  it('五个字段的顺序就是解析层拆的那五段（`|` 分隔）', () => {
    expect(templatePaths(INSPECT_TEMPLATE).map((item) => item.path)).toEqual([
      'State.Status',
      'State.StartedAt',
      'State.ExitCode',
      'RestartCount',
      'State.Health.Status',
    ])
  })

  it('`RestartCount` 在样本里是**顶层**的（这个缺陷真的发生过：写成 .State.RestartCount 每条 inspect 都失败）', () => {
    expect(walkSample(SAMPLE, 'RestartCount')).toBe('number')
    expect(walkSample(SAMPLE, 'State.RestartCount')).toBeUndefined()
    expect(templateProblems(mutate(INSPECT_TEMPLATE, '{{.RestartCount}}', '{{.State.RestartCount}}'), SAMPLE).join('\n'))
      .toContain('.State.RestartCount 在真机样本里不存在')
  })

  it('反例：编一个不存在的字段路径 → 报出来', () => {
    expect(templateProblems(mutate(INSPECT_TEMPLATE, '{{.State.Status}}', '{{.State.Stats}}'), SAMPLE).join('\n'))
      .toContain('.State.Stats 在真机样本里不存在')
  })

  it('反例：把 Health 那段拆掉 `{{if}}` 保护 → 报出来（没配健康检查的容器会整个取不到观测）', () => {
    const bare = mutate(INSPECT_TEMPLATE, '{{if .State.Health}}{{.State.Health.Status}}{{end}}', '{{.State.Health.Status}}')
    expect(templateProblems(bare, SAMPLE).join('\n')).toContain('没有被 {{if .State.Health}} 保护')
  })

  it('反例：字段数不对（少一段）→ 报出来（解析层按 5 段拆）', () => {
    const four = mutate(INSPECT_TEMPLATE, '{{.State.ExitCode}}|', '')
    expect(templateProblems(four, SAMPLE).join('\n')).toContain('应当有 5 条字段路径')
  })

  it('**验不到的那一条照实说**：样本容器没有健康检查，所以 `Health` 的路径只能验「受保护」', () => {
    // 这一条刻意断言「样本里没有 Health」这个**事实**：哪天有人换了一份带健康检查的样本，
    // 它会红——那一刻应该把这条用例改写成「Health 路径已在样本里验证」，而不是删掉它。
    expect(walkSample(SAMPLE, 'State.Health')).toBeUndefined()
    expect(walkSample(SAMPLE, 'State.Health.Status')).toBeUndefined()
  })
})
