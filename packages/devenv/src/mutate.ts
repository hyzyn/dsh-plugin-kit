/**
 * 写入口（`docs/devdata-plan.md` §16.1 第 5 步）：`env_up` / `env_down` 的**纯逻辑**。
 *
 * ## 一条硬判据：**清单就是白名单**
 *
 * 这个模块只接受**清单里声明过的**服务名。不提供「按名字停任意容器」的入口——那等于把
 * 一台共享机器的全部容器交给一次工具调用，而 agent 的失败模式是**自信地重试**：名字写错时它会
 * 换个拼法再试一次，而每一次都可能停掉同事正在联调的东西。
 *
 * 清单是项目里的文本（`ready/<项目>.ready.yaml`），随项目一起评审——那就是白名单该待的地方。
 *
 * ## 第二件：`env_up` **不创建**容器
 *
 * 只有 `docker start`（启动已存在的容器），没有 `run` / `compose up` / `rm` / `rmi`：
 * 「起一份副本」是另一件事（涉及镜像、卷、端口与责任），它是 §13 里 `test-isolated` 的活。
 * 所以清单里写了、目标上却没有的容器**不会**被悄悄创建，而是在报告里单列一档。
 *
 * ## 幂等：先观测再决定动谁
 *
 * `env_up` 只启动**没在跑**的、`env_down` 只停**在跑**的，其余进「无需变更」那一档。
 * 这样 agent 重试是安全的（第二次调用不会重复下令），而报告里也看得见「它本来就那样」——
 * 否则「我明明写了三个服务，报告里只有两个」会被读成漏做。
 */
import type { ServiceObservation } from './env-ready-eval.js'
import type { ServiceRequirement } from './env-ready.js'
import type { DockerRunner } from './observe.js'

/** 两个动作。 */
export type MutationAction = 'up' | 'down'

/** 全部动作（注册面与判定用同一份）。 */
export const MUTATION_ACTIONS: readonly MutationAction[] = ['up', 'down']

/** 动作的中文短语（报告与拒绝文案共用，免得两处各写一份）。 */
export function actionLabel(action: MutationAction): string {
  return action === 'up' ? '启动' : '停止'
}

/** `docker start <name>`。 */
export function startArgv(name: string): string[] {
  return ['docker', 'start', name]
}

/** `docker stop --time <秒> <name>`（给容器一个体面的收尾时间；SIGKILL 是别人的决定，不是默认）。 */
export function stopArgv(name: string, timeoutSec: number): string[] {
  return ['docker', 'stop', '--time', String(timeoutSec), name]
}

/** 一个动作要碰谁（**由清单与观测共同决定**，两边都不看别的东西）。 */
export interface MutationPlan {
  action: MutationAction
  /** 真的要执行的服务名（按清单顺序）。 */
  services: string[]
  /** 已经在目标状态、不需要动的。 */
  unchanged: string[]
  /** 清单里有、但目标上观测不到的（`env_up` 不创建容器）。 */
  missing: string[]
}

/**
 * 由一份观测算出要做什么。
 *
 * **纯函数**：观测由调用方取（`observeServices`），所以这一段能脱离真机逐条断言。
 */
export function planMutation(input: {
  action: MutationAction
  services: readonly ServiceRequirement[]
  observations: readonly ServiceObservation[]
}): MutationPlan {
  const byName = new Map(input.observations.map((observation) => [observation.name, observation]))
  const plan: MutationPlan = { action: input.action, services: [], unchanged: [], missing: [] }
  for (const service of input.services) {
    const observation = byName.get(service.name)
    if (observation === undefined || !observation.found) {
      plan.missing.push(service.name)
      continue
    }
    const running = observation.status === 'running'
    if (input.action === 'up') {
      if (running) plan.unchanged.push(service.name)
      else plan.services.push(service.name)
    } else {
      if (running) plan.services.push(service.name)
      else plan.unchanged.push(service.name)
    }
  }
  return plan
}

/** 一条命令的结果（给报告用）。 */
export interface MutationOutcome {
  name: string
  /** 退出码；通道级失败时为 `null`。 */
  code: number | null
  /** 失败原因（退出码非零时的 stderr 首行，或通道级失败的那句话）。 */
  error?: string
}

/**
 * 逐条执行（**串行**：这是一台共享机器，并发下令只是让失败更难读）。
 *
 * 单条失败**不中断**后面的：停三个容器时第一个失败，另外两个该不该停是调用方的决定——
 * 都试一遍并把每条的结果报出来，比「第一个失败就停手、剩下的没动」更容易看懂（后者看起来像
 * 「只停了两个」，而实际是「停了两个、第三个失败」）。
 */
export async function runMutation(
  plan: MutationPlan,
  runner: DockerRunner,
  options: { timeoutSec: number; timeoutMs?: number },
): Promise<MutationOutcome[]> {
  const outcomes: MutationOutcome[] = []
  for (const name of plan.services) {
    const argv = plan.action === 'up' ? startArgv(name) : stopArgv(name, options.timeoutSec)
    let result
    try {
      result = await runner.run(argv, options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs })
    } catch (error) {
      outcomes.push({ name, code: null, error: error instanceof Error ? error.message : String(error) })
      continue
    }
    if (result.timedOut === true) {
      outcomes.push({ name, code: null, error: '命令超时（目标机没在超时前答复）' })
      continue
    }
    if (result.code === 0) {
      outcomes.push({ name, code: 0 })
      continue
    }
    const detail = (result.stderr.trim() !== '' ? result.stderr : result.stdout).trim().split('\n')[0] ?? ''
    outcomes.push({ name, code: result.code, error: detail === '' ? '没有输出' : detail })
  }
  return outcomes
}
