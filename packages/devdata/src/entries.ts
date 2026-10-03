/**
 * 入口面：**agent 真正能调到的工具名**（= 可见性 ∩ 本宿主真的能执行的引擎）。
 *
 * ## 为什么在 `visibleTools` 之外还要这一层
 *
 * `visibleTools` 回答的是「**这个目标上允许做什么**」——它只看矩阵与目标状态，因此可以完全没有
 * 宿主、没有驱动、没有真机地被测。而「agent 的工具面」多一个条件：**这个引擎有没有执行器**。
 *
 * 两者分开不是洁癖，是因为它们的答案在这台机器上现在就不一样：Redis 有通路 A 执行器（已真机验证），
 * MySQL / SQL Server / 达梦 / RocketMQ 都还没有。若照 `visibleTools` 注册，agent 会看到 `query` /
 * `schema` / `lag` 这些**跑起来必失败**的入口——那正是本仓最忌讳的「配了没反应」：它比「没有这个
 * 工具」坏，因为 agent 会先试、读一句执行错误、再改，而正确的下一步根本不在那里。
 *
 * 所以：**「没有执行器」的引擎只给引擎无关的自证项**（`list_targets` / `doctor` / `capabilities`
 * 全是本地判定，不经过执行器），并且 `capabilities` 要把「为什么只有这几个」说出来。
 *
 * ## 注册面是并集，不是交集
 *
 * 工具是**按名字注册一次**的（DSH 的工具注册没有「按目标分别可见」这回事），所以只要某个目标上有
 * 这个入口，工具就注册出来；调用别的目标时由判据层给一句「这个目标上不可见」的拒绝（带恢复路径）。
 * 与 docker / tty 的 `target` 参数同一模式。
 *
 * 判据出处：`docs/devdata-plan.md` §3.6.1（工具面清单）/ §2.4（驱动可选）。
 */

import type { DevDataTarget } from './adjudicate.js'
import type { Engine } from './operations.js'
import { AGNOSTIC_TOOL_NAMES, visibleTools, type ToolGroup, type VisibleTool } from './tool.js'

/** 入口面的额外条件（`visibleTools` 之外的）。 */
export interface EntryOptions {
  /**
   * 本宿主**真的有执行器**的引擎。
   *
   * 由宿主半体填（`plugin.ts` 按实际注册的执行器算），**不是**从包依赖推的——「装了驱动」与
   * 「接了执行器」是两件事（§2.4 起驱动一律可选，装了驱动不等于有通路）。
   */
  engines: readonly Engine[]
}

/** 一个目标上的入口面。 */
export function entryTools(target: DevDataTarget, options: EntryOptions): VisibleTool[] {
  const visible = visibleTools(target)
  if (options.engines.includes(target.engine)) return visible
  /*
   * 没有执行器：只留引擎无关项。这里**不过滤成空**——`list_targets` / `capabilities` 是有用的：
   * 它们正是 agent 用来搞清楚「这台机器上我到底能做什么」的两个工具，把目标本身从名单里抹掉，
   * agent 连「这个目标存在但引擎未接通」这个事实都看不到。
   */
  return visible.filter((tool) => AGNOSTIC_TOOL_NAMES.includes(tool.name))
}

/** 入口面的名字（用例与 `capabilities` 用）。 */
export function entryToolNames(target: DevDataTarget, options: EntryOptions): string[] {
  return entryTools(target, options).map((tool) => tool.name)
}

/** 一个**要注册**的工具（跨目标的并集）。 */
export interface RegisteredTool {
  /** 工具名（带域前缀；注册给宿主的那个）。 */
  name: string
  /** 矩阵动作名（引擎词汇；结构化引擎下工具名 = 前缀 + 它）。 */
  action: string
  group: ToolGroup
  params: readonly string[]
  /** 哪些目标上可见（注册描述里会嵌这份名单，agent 据此选 target）。 */
  targets: readonly string[]
  /** 第一次见到的那个可见理由（`VisibleTool.why`）。 */
  why: string
}

/**
 * 算出**要注册的工具集**（跨目标的并集，顺序稳定）。
 *
 * 顺序取第一次出现的顺序：目标是按配置顺序遍历的，而 `visibleTools` 内部按注册表顺序产出——
 * 所以同一份配置每次算出来的顺序一致（注册是幂等的，顺序变了会让 `refreshTools` 白拆装一轮）。
 */
export function unionEntryTools(targets: readonly DevDataTarget[], options: EntryOptions): RegisteredTool[] {
  const byName = new Map<string, { tool: RegisteredTool; targets: string[] }>()
  for (const target of targets) {
    for (const tool of entryTools(target, options)) {
      const found = byName.get(tool.name)
      if (found === undefined) {
        byName.set(tool.name, {
          tool: { name: tool.name, action: tool.action, group: tool.group, params: tool.params, targets: [], why: tool.why },
          targets: [target.id],
        })
        continue
      }
      found.targets.push(target.id)
    }
  }
  return [...byName.values()].map(({ tool, targets: ids }) => ({ ...tool, targets: ids }))
}
