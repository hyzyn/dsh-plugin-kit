import z from '@deepseek-ai/schemastery';
import type { Context } from '@deepseek-ai/cordis';
import { type LiveConfig, type LiveTarget } from './plugin-config.js';
/** 插件配置的**类型**（与下面的 `const Config` 同名并存：类型空间与值空间都要）。 */
export interface Config {
    enabled?: boolean;
    announceToAgent?: boolean;
    execTimeoutMs?: number;
    logTail?: number;
    probeTimeoutMs?: number;
    waitTimeoutMs?: number;
    pollIntervalMs?: number;
    stopTimeoutSec?: number;
    /**
     * 持久审计出口（JSON 行）；省略 / 空串 = 只进宿主日志（**写类会被 `AUDIT_NOT_DURABLE` 挡住**）。
     *
     * 与 `devdata` 同一口径（实现同在 `@hyzyn/dsh-kit/audit`）：一条 JSON 行 / 调用，含被拒绝的尝试；
     * 写不进去时本次调用不返回结果（fail-closed）。
     */
    auditFile?: string;
    targets?: Array<{
        id?: string;
        label?: string;
        kind?: string;
        book?: string;
        scopeDirs?: string[];
        writeCapability?: {
            env?: string;
            label?: string;
        };
    }>;
    hostKeys?: Array<{
        host?: string;
        port?: number;
        fingerprints?: string[];
    }>;
}
/**
 * 插件配置的 schema。
 *
 * **字段全部 `.volatile()`**：那声明的语义是「可以热写，**插件自己订阅 `loader/volatile-update`
 * 重读**」。本插件在 `apply` 里订阅并重算——不订阅的话，配置页上改目标会「写盘成功、静默不生效」，
 * 而那份声明就是假的（`devfront` 记过这条教训）。
 *
 * **数值字段刻意不给 schema 默认值**：`z.natural().default(0)` 会让「没写」与「写了 0」在
 * `plainConfig` 之后变成同一个值，而夹取与缺省只该有一处（`plugin-config.ts` 的 `clampInt`）。
 */
export declare const Config: z;
/**
 * 工具面公告（插进 `systemPrompt` 的那一段）。
 *
 * 说的是「这个插件能做什么、入口叫什么」，**不是目标清单**（那份嵌在工具描述里，会随配置重注册）。
 * 写清入口名是给 agent 省事：它不必先猜哪个工具是环境面的。
 */
export declare const DEVENV_GUIDANCE: string;
/**
 * 配置卡片（客户端半体）能改的**标量**字段。
 *
 * 刻意**不**在这一列里的：
 *   - `targets`：它有自己的那条路（`normalizeTargets` + 逐次确认 `confirmTargetEdit`），因为它是
 *     「哪些目标、从哪些目录能碰」的**声明**，与就绪清单同一类东西；
 *   - `writeCapability`（在目标里）：**只读**。它声明的环境变量名就是授权判据本身（宿主**启动继承层**
 *     里那个变量的值 ∈ `{1,true,yes,on}`，见 `kit` 的 `TRUTHY`），而本卡片能写配置——把它指向**另一个
 *     已经在启动环境里、值恰好为真**的变量（例如 `CI=true`），页面脚本一次 POST 就等于**免重启提权**，
 *     违反根 ROADMAP §5.1 的不变量「HTTP 不能凭空打开能力」。
 *     ⚠️ **别用「改成 `HOME`」当例子**（2026-10-03 更正）：`HOME` 的值不在那个白名单里，`env` 名
 *     指向它**不会**授权——写错例子会让人以为这条判据是「防手滑」而不是「防提权」；
 *   - `hostKeys`：TOFU 自己维护的记录，改它等于放弃指纹校验（卡片只把 host / 端口 / 指纹条数摆出来）；
 *   - `execTimeoutMs` / `logTail` / `stopTimeoutSec`：运维旋钮，仍走 profile 补丁层
 *     （卡片只暴露上面那六个——多一个可写字段就多一片要评审的面）。
 */
export declare const CARD_FIELDS: readonly ["enabled", "announceToAgent", "auditFile", "probeTimeoutMs", "waitTimeoutMs", "pollIntervalMs"];
/**
 * 目标列表的**严格**校验（卡片保存路径专用）。
 *
 * 与 `devfront` 的 `normalizeTargets` 同一条判据：`normalizeConfig` 对配置里本来就写坏的行是
 * **静默丢掉**（那是容错），而保存路径上静默丢掉 = 用户以为存了 3 个、实际只有 2 个。所以这里
 * 逐行逐字段报错、**指到 `targets[i].字段`**，最后再用 `normalizeConfig` 复核「校验过的行一行不少
 * 地被收下」——两套规则分叉时在这里就红。
 *
 * 本包比 `devfront` 多两条：`kind` 只认 `local` / `ssh`（解析层也是这么判的），`ssh` 必须给 `book`
 * （连不上的目标留着只会在下游报一个指不到配置的错）；`scopeDirs` 为空**照收**（那是「处处拒绝」，
 * 是合法状态，只是工具用不了——解析层会报一条配置问题，不在这里拦）。
 */
export declare function normalizeTargets(input: unknown): {
    targets: Record<string, unknown>[];
} | {
    error: string;
    code?: string;
};
/**
 * 把卡片提交上来的 patch 收敛成「能写进 settings entry 的那几个字段」。
 *
 * **纯函数**，所以这条判据有单测。五条规矩：
 *   - 不认识的字段 → 报错（**不静默丢弃**：卡片与宿主版本不一致时，静默丢弃会让用户以为保存成功）；
 *   - `writeCapability` → 专用 400（见 `CAPABILITY_READONLY`）：这是提权面，不是普通字段；
 *   - `hostKeys` / `writeGates` → 只读投影，回写一律拒（它们是 GET 快照里的展示项）；
 *   - 类型/范围**先判、再写**：非法值不许先落地再抛（docker 踩过：非法值写进 settings.yaml 之后，
 *     整段配置在下次启动时静默退回默认）；
 *   - 改目标时，**同 id 目标已声明的 `writeCapability` 原样带过去**（见下面 `carryWriteCapability`）。
 *
 * `targets` 那条路要 `confirmTargetEdit: true`：它会影响「agent 能用哪些目标、在哪些目录里动手」，
 * 与 `env_down` 同一档（那是**逐次确认**，不是「第一次要点一次」）。
 *
 * @param input - 卡片 POST 上来的 body。
 * @param options.currentTargets - 当前生效的目标（只为「保住已声明的写闸门」这一件事）。
 */
export declare function normalizeCardPatch(input: Record<string, unknown>, options?: {
    currentTargets?: readonly LiveTarget[];
}): {
    patch: Record<string, unknown>;
    code?: string;
} | {
    error: string;
    code?: string;
};
/**
 * 卡片的 GET 快照（**纯函数**：把 `live` 投影成客户端要的形状）。
 *
 * 三块刻意分开：
 *   - **可改**：标量（上面那六个）+ 目标列表（`targets` 走逐次确认那条路）；
 *   - **只读**：`writeGates` —— 每个目标一档，给「声明的环境变量名 + 当前是否已授权 + 怎么授权」。
 *     判据本身是宿主启动环境（`capabilityGranted` / `capabilityHowTo`），卡片只**显示**它；
 *   - **只读**：`hostKeys` —— 只给 host / port / **指纹条数**（不给指纹本身，也不给编辑：
 *     这一项由 TOFU 维护，改它等于放弃指纹校验）。
 */
export declare function configSnapshotFrom(live: LiveConfig): Record<string, unknown>;
export declare const name: string, inject: string[] | undefined, apply: (ctx: Context, config?: Config | undefined) => void;
