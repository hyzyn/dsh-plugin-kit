/**
 * `devdata` 的**宿主半体**：把内核接成 agent 能用的工具（`docs/devdata-plan.md` §6 / §9 的 P3–P4）。
 *
 * ## 四层分工
 *
 * | 层 | 文件 | 职责 |
 * |---|---|---|
 * | 判据 | `adjudicate.ts` / `operations.ts` / `plan-guard.ts` / `scope.ts` / `credential.ts` | 允不允许（**纯函数，不连任何东西**） |
 * | 入口 | `entries.ts` | 「这个引擎在这台机器上有没有执行器」→ 该注册哪些入口 |
 * | 引擎 | `redis-executor.ts`（通路 A，已真机验证） | 怎么真的去跑 |
 * | **宿主** | **本文件** | 读配置、注册工具、写审计、把拒绝转成 agent 能据以行动的话 |
 *
 * 前三层都能在没有宿主、没有真机的情况下被完整测试；本层很薄，只做搬运与接线。
 *
 * ## 五条刻意的纪律
 *
 * 1. **没启用 / 没配目标 / 这个引擎没有执行器 → 那个工具不注册**。未注册的工具 agent 根本看不到，
 *    于是它不会去试、也不会撞墙（§3.6.1 的实现要求）。**今天只有 Redis 有执行器**，所以 SQL /
 *    RocketMQ 的目标只给 `list_targets` / `capabilities` / `doctor`（理由见 `entries.ts`）。
 * 2. **作用域 fail-closed**：`scopeDirs` 为空 = 处处拒绝。宿主**不替用户填默认目录**——那等于替他授权。
 * 3. **写类操作要求持久审计**（`auditFile` 未配 → `AUDIT_NOT_DURABLE`）。§5 把审计写成这一档的
 *    前提，那就不能只在文档里成立。只读操作不受影响。
 * 4. **不可逆操作先拒、要逐次二次确认**（判据在内核 `preflight`，本层只把 `confirmed` 传下去）。
 * 5. **能力授权只认宿主侧通道**（`bindCapabilitySources` 在 `apply` 期绑定一次）——本套件今天
 *    没有客户端半体，所以没有就地提权通道，文案也不提它（见 `adjudicate.ts` 的同名注释）。
 *
 * ## 拒绝怎么报给 agent
 *
 * 一律**抛错**，格式 `[CODE] 正文` + 另起一行恢复路径（与 `devfront` 同一口径）。不返回
 * `{ok:false}` 信封：DSH 的工具错误本身就是给模型看的一句话，抛错是最短路径，而且不会出现
 * 「调用方忘了看 ok 字段」这种沉默失败。
 */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import type { CapabilitySpec } from '@hyzyn/dsh-kit';
import { type Engine } from './operations.js';
import { type LiveTarget } from './plugin-config.js';
/**
 * 插件配置的**类型**。
 *
 * 与下面的 `const Config`（schemastery schema）同名并存：一个是类型空间的形状，一个是值空间的
 * 校验器，DSH 两个都要（本仓既有写法，见 docker / tty / devfront）。
 */
export interface Config {
    enabled?: boolean;
    announceToAgent?: boolean;
    auditFile?: string;
    timeoutMs?: number;
    plan?: {
        maxRows?: number;
        maxCost?: number;
    };
    targets?: Array<{
        id?: string;
        label?: string;
        engine?: string;
        env?: string;
        scopeDirs?: string[];
        host?: string;
        port?: number;
        db?: number;
        credentialRef?: string;
        maxScanCount?: number;
        writeCapability?: {
            env?: string;
            label?: string;
        };
        dangerousReadCapability?: {
            env?: string;
            label?: string;
        };
    }>;
}
/**
 * 插件配置的 schema。
 *
 * 字段全部 `.volatile()`：那声明的语义是「可以热写，**插件自己订阅 `loader/volatile-update`
 * 重读**」。本插件在 `apply` 里订阅并重算（见 `applySection`）——不订阅的话，配置页上改目标会
 * 「写盘成功、静默不生效」，而那份声明就是假的（`devfront` 记过这条教训）。
 *
 * **两个字段刻意不给 schema 默认值**（`timeoutMs` / `plan` 的子项）：`z.natural().default(0)`
 * 会让「没写」与「写了 0」在 `plainConfig` 之后变成同一个值，而 `plan.maxRows: 0` 的语义是
 * **一行都不许**——一个不该由「没写」触发的闸门。不给默认值，缺省就是缺省。
 */
export declare const Config: z;
/**
 * 本宿主**真的有执行器**的引擎。
 *
 * 今天只有一个——这是整套东西唯一的能力边界，写成一个函数是为了让「加了执行器要改哪儿」一眼可见
 * （改这里 + `entries.ts` 的判据就会自动把新引擎的入口放出去）。
 */
export declare function servedEngines(): readonly Engine[];
/**
 * 工具面公告（插进 `systemPrompt` 的那一段）。
 *
 * 说的是「这个插件能做什么、入口叫什么、闸门怎么开」，**不是目标清单**（那份嵌在工具描述里，
 * 会随配置重注册）。写清入口名是给 agent 省事：它不必先猜哪个工具是数据面的。
 */
export declare const DEVDATA_GUIDANCE: string;
/**
 * 把一次拒绝拼成给 agent 看的一句话（与 `devfront` 的 `denialMessage` 同一格式）。
 *
 * 格式是契约：`[CODE] 正文`，恢复路径另起一行。**码必须带出去**——正文是给人读的中文，
 * 而码是这件事唯一的稳定标识符（agent 拿一段散文只能靠正则猜）。
 */
export declare function denialMessage(outcome: {
    code: string;
    message: string;
    hint?: string;
}): string;
/** 把引擎结果渲染成给 agent 的文本（对象走 JSON，agent 一轮就能定位）。 */
export declare function renderResult(result: unknown): string;
/** 能力规格的展示（含授权状态与「怎么授权」）。 */
export declare function capabilityLines(spec: CapabilitySpec | undefined, what: string): string[];
/** `doctor` 的一层结论。 */
export interface DoctorLayer {
    layer: string;
    state: 'ok' | 'warn' | 'fail' | 'na';
    detail: string;
}
/**
 * 逐层自证（`docs/devdata-plan.md` §3.7-3）。
 *
 * **验不到的一律 `warn`，不报 `ok`**——代价是报告看起来不够绿，收益是它不撒谎。纯函数：
 * 不连目标、不读文件，只据配置与判据层已知的事实作答（引擎级事实——如「账号真的只读吗」——
 * 要执行器去取，今天取不到，所以那一层必然不是 `ok`）。
 */
export declare function doctorLayers(target: LiveTarget, cwd: string, options: {
    auditDurable: boolean;
}): DoctorLayer[];
export declare const name: string, inject: string[] | undefined, apply: (ctx: Context, config?: Config | undefined) => void;
