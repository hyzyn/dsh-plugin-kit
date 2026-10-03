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
/** 全部环境档位（判据表与用例都从这里取，避免各处各写一份字面量）。 */
export const DEV_ENVS = ['dev', 'test-shared', 'test-isolated', 'production', 'unknown'];
/** 可写档位：只有这三个允许出现写类操作（且仍需通过能力裁决）。 */
export const WRITABLE_ENVS = ['dev', 'test-isolated'];
/**
 * 归一化环境标签：不认识的值（拼错 / 大小写 / 空格 / 非字符串）一律回落 `unknown`。
 *
 * **不许「匹配不到就算 test」**：那是把「没标注」静默升格为「可写」，方向恰好是危险的那一侧。
 * 与本仓 `capability.ts` 的 `TRUTHY` 白名单同一道理（只有列出的值算授权）。
 */
export function normalizeEnv(value) {
    if (typeof value !== 'string')
        return 'unknown';
    const trimmed = value.trim().toLowerCase();
    return DEV_ENVS.includes(trimmed) ? trimmed : 'unknown';
}
const ENV_FACTS = {
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
};
/** 取环境档位的属性面。 */
export function envFacts(env) {
    return { env, ...ENV_FACTS[env] };
}
//# sourceMappingURL=env.js.map