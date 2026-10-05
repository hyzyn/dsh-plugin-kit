/**
 * 快速开始的**静态预检**（`POST /api/dsh-devdata/preflight` 的判据层）。
 *
 * ## 它是什么
 *
 * 把「浏览器给的项目上下文」与「宿主配置里那个**已保存**的目标」合成一次**只读静态判定**：
 * 上下文词法合法吗（`root` / `project`）、目标存在吗、插件启着吗、作用域放行吗、这个引擎今天
 * 有执行器吗、连接信息完整吗。**全部只读内存里的配置**——不读盘（不查目录是否存在）、不联网、
 * 不保存、不改环境变量、不申请能力，也**不进审计**（这条路上没有任何东西被改过）。
 *
 * ## 为什么输入只有三个字段
 *
 * `{ root, project, target }`：`target` 是**已保存目标的 id**，不是一份连接快照。
 * 作用域、引擎、`host`/`port`、能力声明**一律由宿主从 `live.targets` 里现取**——浏览器给的
 * 这些字段（`scopeDirs` / `engine` / `host` / `port` / `enabled` / `mode` / `writeCapability` /
 * `readOnly` …）全部是**未知字段**，一律拒。多认一个字段就是多一条「页内脚本自己宣布自己
 * 有权限 / 有作用域」的路。
 *
 * ## 为什么 `mode` / `enabled` 固定
 *
 * 预检**不给**浏览器决定启用面与模式：传给 `normalizeProjectContext` 的只有 `{ root, project }`
 * （`mode` 缺省 `readonly`、三面全关），所以成功结果里的 `enabled` 恒为三个 `false`、
 * `readOnly` 恒为 `true`。预检不是授权，也不是「我要跑三面」的声明。
 *
 * ## 与 `/project-context` 的分工
 *
 * 那条路由只做**纯模型归一化**（连配置都不看，因此停用 / 无 settings 时照常可用）；这一条在它
 * 之上加宿主侧的事实。两条都保持「只读 + 静态」这条性质，但这一条**会因配置不可运行而失败**
 * ——那是它的用途：在动手之前说清「现在还差什么」。
 */
import type { Engine } from './operations.js';
import type { LiveConfig } from './plugin-config.js';
import { type ProjectContext } from './project-context.js';
/** 成功结果里那个目标的**引用**：只有 id 与引擎，没有任何连接 / 权限事实。 */
export interface PreflightTargetRef {
    readonly id: string;
    readonly engine: Engine;
}
/**
 * 一条预检问题。
 *
 * `code` 是给调用方（与用例）判类用的稳定字符串；上下文类的字段问题**不带码**——它由
 * `normalizeProjectContext` 原样给出（`field` / `message` 就是那份模型的契约）。
 * `root` / `scopeDirs` 只在作用域拒绝那一条上出现：拒绝文案里必须写清「判的是哪个目录、
 * 允许的是哪些目录」，否则恢复路径等于让人猜（`devdata D09` 的同族）。
 */
export interface PreflightProblem {
    readonly field: string;
    readonly message: string;
    readonly code?: string;
    readonly hint?: string;
    /** 作用域拒绝时：被判定（已归一化）的项目根。 */
    readonly root?: string;
    /** 作用域拒绝时：目标声明的允许目录（已归一化）。 */
    readonly scopeDirs?: readonly string[];
}
export type PreflightResult = {
    readonly ok: true;
    readonly context: ProjectContext;
    readonly target: PreflightTargetRef;
    readonly problems: readonly [];
} | {
    readonly ok: false;
    readonly context: ProjectContext | null;
    readonly target: PreflightTargetRef | null;
    readonly problems: readonly PreflightProblem[];
};
/** 宿主侧的事实（由 `plugin.ts` 现取；这一层不认识 `live` 之外的任何东西）。 */
export interface PreflightHostFacts {
    readonly live: LiveConfig;
    /** 本宿主真的有执行器的引擎（`servedEngines()`）。 */
    readonly servedEngines: readonly Engine[];
}
/**
 * 跑一次静态预检。
 *
 * 纯函数：只读 `input` 与 `host`（都是调用方给的值），不读盘、不联网、不保存、不改环境、
 * 不申请能力、不写审计。顺序是契约：
 *
 *   ① 输入形状与未知字段 → ② 上下文（`root` / `project`）→ ③ 目标存在（`target` 是已保存 id）
 *   → ④ 插件启用 → ⑤ 作用域（空 = 处处拒绝）→ ⑥ 执行器 → ⑦ 连接完整性。
 *
 * ②失败就没有上下文可谈（`context: null`，`target: null`，直接返回）；③失败时上下文照给
 * （它是合法的事实）而 `target: null`（连 id 都认不出，给不出引擎）；④–⑦是**互相独立**的事实，
 * 一次全报出来——让用户一次看到「还差哪几样」，而不是修一样再撞一次。
 */
export declare function preflightProjectContext(input: unknown, host: PreflightHostFacts): PreflightResult;
