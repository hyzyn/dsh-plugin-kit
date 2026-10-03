/**
 * 环境模型：本套件「不用于生产」的**唯一技术手段**。
 *
 * ## 为什么必须是技术手段而不是纪律
 *
 * 目标环境里**没有硬边界**（2026-10-01 实测）：
 *   - `248`（内网地址；本文与文档一律写占位 `192.0.2.248`）既是测试主机，又是生产 job 构建日志的证据来源；
 *   - `161` 是**公网 IP**（真实地址不入库，见 `scripts/check-no-public-ip.mjs`），同时跑着 34 个容器；
 *   - Jenkins 侧的 job 描述里**不含环境属性**（`jenkins-release` 技能靠 `description` 匹配项目名）。
 *
 * 所以「我只在开发测试环境用这个工具」这句话，在技术上拦不住「把生产目标填进去」——
 * 除非环境标签本身参与裁决。本模块把标签变成判据：**未标注 = `unknown` = 一律不可写**。
 *
 * ## 四态而不是二态
 *
 * 二态（test / unknown）会假设「一次只有一个 agent 在动这个库」。但并行 agent 是常态，
 * 而 **git worktree 只隔离代码、不隔离数据**：多个 agent 对同一个共享库跑迁移 / 重灌种子数据
 * 会互相破坏。所以 `test` 必须再分两层——共享的联调环境与可丢弃的副本，两者的写权限不同。
 *
 * 判据出处见 `docs/devdata-plan.md` §3.1 / §3.8。
 */

/**
 * 目标环境档位。
 *
 * - `dev`：开发者本机的可丢弃实例，读写都放行；
 * - `test-shared`：团队共享的联调环境（`248` / `161` 的现状），读全放行、**写受限**；
 * - `test-isolated`：按 worktree / 任务起的可丢弃副本，读写放行、可自由重置；
 * - `production`：**显式标出来**才用得上；任何写类操作都不放行，读类照常；
 * - `unknown`：缺省值。**不是 `test`**——没标注就是不知道，一律不可写。
 */
export type DevEnv = 'dev' | 'test-shared' | 'test-isolated' | 'production' | 'unknown'

/** 全部环境档位（判据表与用例都从这里取，避免各处各写一份字面量）。 */
export const DEV_ENVS: readonly DevEnv[] = ['dev', 'test-shared', 'test-isolated', 'production', 'unknown']

/** 可写档位：只有这三个允许出现写类操作（且仍需通过能力裁决）。 */
export const WRITABLE_ENVS: readonly DevEnv[] = ['dev', 'test-isolated']

/**
 * 归一化环境标签：不认识的值（拼错 / 大小写 / 空格 / 非字符串）一律回落 `unknown`。
 *
 * **不许「匹配不到就算 test」**：那是把「没标注」静默升格为「可写」，方向恰好是危险的那一侧。
 * 与本仓 `capability.ts` 的 `TRUTHY` 白名单同一道理（只有列出的值算授权）。
 */
export function normalizeEnv(value: unknown): DevEnv {
  if (typeof value !== 'string') return 'unknown'
  const trimmed = value.trim().toLowerCase()
  return (DEV_ENVS as readonly string[]).includes(trimmed) ? (trimmed as DevEnv) : 'unknown'
}

/** 环境档位的属性面（给裁决与界面共用，避免各处再写一遍 `=== 'dev' || …`）。 */
export interface EnvFacts {
  /** 归一化后的档位。 */
  env: DevEnv
  /** 读类操作是否放行（**只有 `production` 与 `unknown` 也放行**——读不改变状态）。 */
  allowsRead: boolean
  /**
   * 该档位是否**原则上**允许写类操作。
   *
   * 注意这是「原则」不是「授权」：`true` 也还要过能力闸门（写类操作必须显式携带能力规格，
   * 见 `operations.ts` 的 `requiredCapability`）。`test-shared` 属于「原则允许但默认关」——
   * 因为共享环境里一个不可逆动作打到的可能是同事的联调。
   */
  allowsWrite: boolean
  /** 写操作前是否必须逐次二次确认（共享环境要，可丢弃副本不要）。 */
  requiresConfirm: boolean
  /** 给用户与 agent 看的一句话。 */
  label: string
}

const ENV_FACTS: Record<DevEnv, Omit<EnvFacts, 'env'>> = {
  dev: {
    allowsRead: true,
    allowsWrite: true,
    requiresConfirm: false,
    label: '开发机（可丢弃）',
  },
  'test-isolated': {
    allowsRead: true,
    allowsWrite: true,
    requiresConfirm: false,
    label: '测试环境 · 可丢弃副本',
  },
  'test-shared': {
    allowsRead: true,
    allowsWrite: true,
    requiresConfirm: true,
    label: '测试环境 · 共享联调',
  },
  production: {
    allowsRead: true,
    allowsWrite: false,
    requiresConfirm: true,
    label: '生产环境（本套件不写）',
  },
  unknown: {
    allowsRead: true,
    allowsWrite: false,
    requiresConfirm: true,
    label: '未标注环境（按不可写处理）',
  },
}

/** 取环境档位的属性面。 */
export function envFacts(env: DevEnv): EnvFacts {
  return { env, ...ENV_FACTS[env] }
}
