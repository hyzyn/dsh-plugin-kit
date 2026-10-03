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
 * ## 两份样本，各守一档（这是本文件的分工，不是重复）
 *
 * | 样本 | 来自 | 守什么 |
 * |---|---|---|
 * | `fixtures/docker-inspect.state.json` | **没有**健康检查的容器 | 五条路径里前四条；以及「`Health` 不在样本里」这个事实——它正是 `{{if}}` 保护存在的理由 |
 * | `fixtures/docker-inspect.health.json` | **配了**健康检查的容器 | 第五条 `State.Health.Status` **真的存在**（ROADMAP 待办 A 的第 1 条，2026-10-03 闭合，落点见记-10） |
 *
 * ## 样本从哪来（可复现）
 *
 * 取样本的命令、以及 `shapeOf`（真输出 → 只有键与类型的结构）都在
 * [README.md](../README.md) 的「结构样本怎么来」一节。样本里**一个值都没有**。
 *
 * ## 「验不到」这一档去哪了
 *
 * 2026-10-02 时这台机器上 24 个容器**没有一个**配健康检查，所以当时只能验 `Health` 那条路径
 * 「写成受 `{{if}}` 保护」——**不能说「Health 已验证」**。2026-10-03 补上了带健康检查的样本
 * （本机真 daemon 上的一次性容器，见 `real-health-local.test.ts`），于是盲区闭合、那条「验不到」
 * 的用例改成了对两份样本各自事实的断言。**这件事仍要能被看出来**：下面有一条用例断言
 * 「无健康检查的样本里没有 `Health`」——哪天有人误删了一份样本，它会红。
 */
import { describe, expect, it } from 'vitest'

import { INSPECT_TEMPLATE } from '../src/observe.js'
import { readShape, templatePaths, templateProblems, walkSample } from './inspect-shape.js'

/** 没有健康检查的容器（原样本，2026-10-02 取自真机）。 */
const SAMPLE = readShape('state')
/** 配了健康检查的容器（2026-10-03 取自本机真 daemon 的一次性容器）。 */
const HEALTH_SAMPLE = readShape('health')

/** 在模板上做一次替换造反例；替换没生效就抛（否则反例会变成空测试）。 */
function mutate(template: string, from: string, to: string): string {
  if (!template.includes(from)) throw new Error(`fixture 替换没匹配上：${from}`)
  return template.replace(from, to)
}

describe('INSPECT_TEMPLATE 的字段路径必须在真机结构里存在', () => {
  it('真实模板 vs 真机样本（无健康检查的那一份）', () => {
    expect(templateProblems(INSPECT_TEMPLATE, SAMPLE)).toEqual([])
  })

  it('真实模板 vs 真机样本（**带健康检查**的那一份）——`Health` 那条路径真的在', () => {
    expect(templateProblems(INSPECT_TEMPLATE, HEALTH_SAMPLE)).toEqual([])
    // 盲区闭合的判据：这条路径不是「猜它对」，而是真样本里真的有、且类型对。
    expect(walkSample(HEALTH_SAMPLE, 'State.Health.Status')).toBe('string')
    expect(walkSample(HEALTH_SAMPLE, 'RestartCount')).toBe('number')
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

  it('两份样本的分工还在：**没有**健康检查的那一份里确实没有 `Health`（这正是 `{{if}}` 的理由）', () => {
    // 这一条刻意断言「那份样本里没有 Health」这个**事实**：哪份样本被误删/被换成同一份，它会红。
    expect(walkSample(SAMPLE, 'State.Health')).toBeUndefined()
    expect(walkSample(SAMPLE, 'State.Health.Status')).toBeUndefined()
    // 而带健康检查的那一份有——两份同时在场，才说明「有 / 没有」两档都被真样本覆盖过。
    expect(walkSample(HEALTH_SAMPLE, 'State.Health')).not.toBeUndefined()
  })
})
