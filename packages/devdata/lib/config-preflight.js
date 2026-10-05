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
import { targetIds } from './plugin-config.js';
import { normalizeProjectContext } from './project-context.js';
import { decideScope, normalizeDir } from './scope.js';
import { REJECTION_CODES } from './rejection.js';
/** 预检请求只认这三个字段——其余一律拒（浏览器不许自带作用域 / 权限 / 连接快照）。 */
const PREFLIGHT_FIELDS = new Set(['root', 'project', 'target']);
function record(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
        ? value
        : undefined;
}
function failure(context, target, problems) {
    return { ok: false, context, target, problems };
}
/** 上下文模型的问题原样搬过来：它的 `field` / `message` 就是对外的契约。 */
function asProblem(problem) {
    return { field: problem.field, message: problem.message };
}
/** 目标声明的允许目录（非空字符串，已归一化）——拒绝文案与恢复路径都用它。 */
function allowedDirs(target) {
    return target.scopeDirs
        .filter((dir) => typeof dir === 'string' && dir.trim() !== '')
        .map((dir) => normalizeDir(dir));
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
export function preflightProjectContext(input, host) {
    const raw = record(input);
    if (raw === undefined) {
        return failure(null, null, [{ field: 'input', message: '预检请求必须是一个对象' }]);
    }
    const problems = [];
    for (const key of Object.keys(raw)) {
        if (!PREFLIGHT_FIELDS.has(key)) {
            problems.push({
                field: key,
                message: `不支持的预检字段：${key}（只接受 root / project / target；作用域、引擎、连接与能力一律由宿主从已保存的目标里取）`,
            });
        }
    }
    /*
     * 固定的只读上下文：只把 root / project 交给模型，**不接受** mode / enabled / 任何授权字段
     * （它们在上面的未知字段扫描里已经被拒）。
     */
    const context = normalizeProjectContext({ root: raw.root, project: raw.project });
    if (!context.ok) {
        return failure(null, null, [...problems, ...context.problems.map(asProblem)]);
    }
    const targetId = typeof raw.target === 'string' ? raw.target.trim() : '';
    if (targetId === '') {
        problems.push({
            field: 'target',
            message: 'target 必须是已保存目标的 id（非空字符串）：预检不接受连接快照或内联目标',
            code: 'BAD_TARGET',
            hint: `已保存的目标：${targetIds(host.live.targets)}`,
        });
        return failure(context.context, null, problems);
    }
    const target = host.live.targets.find((row) => row.id === targetId);
    if (target === undefined) {
        problems.push({
            field: 'target',
            message: `这份配置里没有目标 ${JSON.stringify(targetId)}`,
            code: 'UNKNOWN_TARGET',
            hint: `已保存的目标：${targetIds(host.live.targets)}。预检只认已保存的目标——它不会替浏览器新建一个`,
        });
        return failure(context.context, null, problems);
    }
    const ref = { id: target.id, engine: target.engine };
    // ④ 插件停用 = 一个 agent 工具都不注册，预检也不自动启用它。
    if (!host.live.enabled) {
        problems.push({
            field: 'enabled',
            message: '插件当前已停用，配置检查无法通过',
            code: 'PLUGIN_DISABLED',
            hint: '在高级设置中启用插件并保存，再重新检查配置',
        });
    }
    // ⑤ 作用域：空 = 处处拒绝（fail closed，刻意不替用户填默认目录）。
    const dirs = allowedDirs(target);
    const scope = decideScope(target.scopeDirs, context.context.root);
    if (!scope.allowed) {
        problems.push({
            field: 'scope',
            message: dirs.length === 0
                ? `目标 ${target.id} 没有声明任何允许目录：空作用域 = 处处拒绝（fail closed），所以项目根 ${context.context.root} 一定不在作用域内`
                : `项目根 ${context.context.root} 不在目标 ${target.id} 的允许作用域内`,
            code: REJECTION_CODES.OUT_OF_SCOPE,
            hint: dirs.length === 0
                ? `在高级设置中为目标 ${target.id} 明确配置允许目录（scopeDirs），保存后重新检查；空作用域会拒绝所有访问`
                : `将项目根改为允许目录内的项目（${dirs.join(' / ')}）；如确需扩大范围，请在高级设置中确认并保存目标的允许目录`,
            root: context.context.root,
            scopeDirs: dirs,
        });
    }
    // ⑥ 执行器：这个引擎在这台机器上有没有通路（`servedEngines()` 是唯一真源）。
    if (!host.servedEngines.includes(target.engine)) {
        const served = host.servedEngines.length === 0 ? '（一个都没有）' : host.servedEngines.join(' / ');
        problems.push({
            field: 'engine',
            message: `目标 ${target.id} 的引擎是 ${target.engine}，而本宿主今天只接了 ${served}：这个引擎没有执行通路`,
            code: 'ENGINE_NOT_SERVED',
            hint: `选择已支持读取的目标（当前支持：${served}），再重新检查配置`,
        });
    }
    // ⑦ 连接完整性：预检不证明能连上，但缺一半就没法开工（也不替用户补默认端口）。
    if (target.connection === undefined) {
        problems.push({
            field: 'connection',
            message: `目标 ${target.id} 没有完整的连接信息（host + port）：预检不证明能连上，但配置缺一半就没法开工`,
            code: 'CONNECTION_INCOMPLETE',
            hint: '在高级设置中补全目标的主机与端口（1~65535），确认并保存后重新检查配置',
        });
    }
    if (problems.length > 0)
        return failure(context.context, ref, problems);
    return { ok: true, context: context.context, target: ref, problems: [] };
}
//# sourceMappingURL=config-preflight.js.map