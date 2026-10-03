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
 * 5. **能力授权只认宿主侧通道**（`bindCapabilitySources` 在 `apply` 期绑定一次）——配置卡片
 *    （2026-10-03 建）**不提供就地提权**：两档能力在写入路径上只读（`CAPABILITY_FIELDS` 那条 400），
 *    文案也不提它（见 `adjudicate.ts` 的同名注释）。「HTTP 只能关、不能开」这条不变量因此在卡片
 *    这一层也成立。
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
import { type LiveConfig, type LiveTarget } from './plugin-config.js';
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
/**
 * 配置卡片能改的**标量**字段。
 *
 * `targets`（目标列表）不在这一列里——它有自己那条路（`normalizeTargets` + 逐次确认），
 * 因为它是「这个目标、这个引擎、这个环境、这个范围」的**声明**。
 *
 * 计划护栏刻意用**扁平键**（`plan.maxRows` / `plan.maxCost`）而不是嵌套对象：settings 的
 * `update(entryId, patch)` 是**深合并**，`{plan:{maxRows}}` 与 `{'plan.maxRows':…}` 都能落到
 * 同一个位置，但前者会让「这次到底改了 plan 里的哪一个」在 patch 里看不出来，而审计要能说清
 * 这件事（`config.scalars` 那一行）。
 */
export declare const CARD_FIELDS: readonly ["enabled", "announceToAgent", "auditFile", "timeoutMs", "plan.maxRows", "plan.maxCost"];
/**
 * **只读**的两档能力字段（出现在 POST body 里 → 400）。
 *
 * 为什么它们不能可写：这两档的授权判据是「宿主**启动继承层**里 `spec.env` 那个变量的值 ∈
 * `{1,true,yes,on}`」（`kit` 的 `TRUTHY`），而变量名来自配置。把它指向**另一个已经在启动环境里、
 * 值恰好为真**的变量（例如宿主自带的 `CI=true`），页内脚本一条 `POST /config` 就等于
 * **免重启提权**——那恰好违反根 `ROADMAP.md` §5.1 的不变量「**HTTP 只能关、不能开**」。
 * ⚠️ **别用「改成 `HOME`」当例子**（2026-10-03 更正）：`HOME` 的值不在那个白名单里，`env` 名指向它
 * **不会**授权——写错例子会让人以为这条判据是「防手滑」而不是「防提权」。
 * 所以：GET 快照照实给出**当前授权状态**，写入路径一律拒。
 */
export declare const CAPABILITY_FIELDS: readonly ["writeCapability", "dangerousReadCapability"];
/** 能力字段出现在写入路径上时的拒绝文案（带恢复路径：改哪儿才是对的地方）。 */
export declare function capabilityEditRefusal(field: string): string;
/**
 * 目标列表的**严格**校验（卡片保存路径专用）。
 *
 * 为什么不直接拿 `normalizeConfig` 的结果：它对坏行是**静默跳过 / 静默夹回**（那是给「配置里
 * 本来就写坏了一行」的容错），而保存路径上静默跳过 = 用户以为存了 3 个、实际只有 2 个。
 * 这里逐行逐字段报错、**指到 `targets[i].字段`**，并在最后用 `normalizeConfig` 复核两件事：
 * 校验过的行**一行不少**被收下、且**一条 problem 都不产生**（两套规则一旦分叉就在这里红，
 * 而不是等到下次启动时用户在日志里看到一条「配置问题」）。
 */
export declare function normalizeTargets(input: unknown): {
    targets: Record<string, unknown>[];
} | {
    error: string;
    code?: string;
};
/**
 * 改目标时**保住原有的能力声明**。
 *
 * 卡片改目标是**替换整份 `targets`**（与 `devfront` 的站点编辑器同形），而能力字段在写入路径上
 * **不许出现**（见 `CAPABILITY_FIELDS`）——两者叠起来就是「编辑一次目标，能力声明全被抹掉」。
 * 那是静默的安全降级：闸门看起来还在（卡片照样显示两档），实际已经变成「未接入」。
 * 所以按 id 把**上一份生效配置里**的声明原样带回来，只认 id 相同的行：
 *
 *   - 新增的行没有声明（= 未接入闸门，**这是诚实的缺省**：一个刚加进来的目标不该凭空获得授权）；
 *   - 改名的行算新增（它已经不是同一个目标了）——卡片上写了这条。
 */
export declare function preserveCapabilities(rows: readonly Record<string, unknown>[], previous: readonly LiveTarget[]): Record<string, unknown>[];
/** 只对**普通对象**递归的合并（数组 / 标量一律替换）——与 settings 的 `mergeLayers` 同口径。 */
export declare function mergeSection(current: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown>;
/**
 * 把卡片提交上来的 patch 收敛成「能写进 settings entry 的那几个字段」。
 *
 * **纯函数**，所以这条判据有单测（宿主半体那一层没有假宿主夹具，抽出来才能断言）。四条规矩：
 *   - **能力字段一律拒**（含藏在 `targets[i]` 里的）——见 `CAPABILITY_FIELDS`；
 *   - 不认识的字段 → 报错（**不静默丢弃**：卡片与宿主版本不一致时，静默丢弃会让用户以为保存成功）；
 *   - `targets` → 必须带 `confirmTargetEdit: true`（逐次确认），且逐行严格校验；
 *   - 类型/范围**先判、再写**：非法值**不许**先落地再抛（docker 踩过：非法值写进 settings 之后
 *     整段配置在下次启动时静默退回默认）。
 */
export declare function normalizeCardPatch(input: Record<string, unknown>): {
    patch: Record<string, unknown>;
    code?: string;
} | {
    error: string;
    code?: string;
};
/**
 * 一条能力档的**只读**快照（给卡片的能力面板用；`undefined` = 这份配置里没接入闸门）。
 *
 * 三件必须都在：**声明的变量名**（`env`）、**当前是否已授权**（`granted` / `via`）、
 * **怎么授权**（`howTo`）。只给前两件，用户就只能在猜里过日子；只给后一件，他不知道自己现在
 * 在哪一档。`howTo` 刻意**不传 `{inPlace:true}`**：本包没有就地提权通道（`bindCapabilitySources`
 * 不接 `GrantStore`），文案提到一个不存在的按钮就是「配了没反应」。
 */
export declare function capabilitySnapshot(spec: CapabilitySpec): Record<string, unknown>;
/**
 * 卡片的 GET 快照（**纯函数**：把 `live` 投影成客户端要的形状）。
 *
 * 目标**全量只读展示**（含 `scopeDirs` / 连接 / `maxScanCount` / 凭据引用），另有两条只读元信息：
 *
 *   - 每个目标的两档能力（`capabilitySnapshot`）——**只读**，写入路径一律拒（见 `CAPABILITY_FIELDS`）；
 *   - `engines` / `envs`：枚举的**唯一真相在宿主侧**（`operations.ts` / `env.ts`），卡片拿它渲染
 *     下拉框，而不是自己抄一份字面量（抄一份必然漂）。
 *
 * `credentialRef` 是**引用**不是口令（值在凭据服务/文件/环境里），所以可以照原样给卡片。
 */
export declare function configSnapshotFrom(live: LiveConfig): Record<string, unknown>;
export declare const name: string, inject: string[] | undefined, apply: (ctx: Context, config?: Config | undefined) => void;
