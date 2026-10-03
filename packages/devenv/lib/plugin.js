/**
 * `@hyzyn/dsh-devenv` 的宿主半体：把观测层与判定层接成 agent 能用的**只读**工具面
 * （`docs/devdata-plan.md` §13.2 / §16.1 第 4 步）。
 *
 * ## 今天只注册两个工具
 *
 * `env_status`（看一眼现在什么样）与 `env_wait`（等到就绪，或等到「明确没戏」）。**写类操作
 * （`env_up` / `env_down`）刻意没有**：`env_down` 会打到正在联调的同事，它要先有闸门 + 逐次二次确认，
 * 那是 §16.1 的第 5 步。工具面里没有的东西，agent 不会去试——这比「有个工具但一用就被拒」强。
 *
 * ## 三条与数据面同源的纪律（同一套判据，不因拆包而漂）
 *
 * 1. **没配目标就不注册工具**：未注册的 agent 根本看不到，不会去试、也不会撞墙
 *    （`devdata` 的 `entries.ts` 是同一条）；
 * 2. **只读也要在作用域内**：`scopeDirs` 为空 = 处处拒绝（`kit` 的 `decideScope`）；
 * 3. **拒绝要带恢复路径**：一句「不行」不产生新信息，agent 的失败模式是原地重试。
 *
 * ## 「通道不通」与「还没就绪」在报告里必须分开
 *
 * 这是本插件最容易骗人的地方，也是观测层专门为此设计的地方（见 `observe.ts` 头注）：
 * SSH 不通 / docker daemon 没起时，`env_wait` 会**立刻**返回一句通道错误，而不是安静地等满超时
 * ——后者的症状是「等了 3 分钟说超时」，而人从这句话里读不出任何线索。
 */
import { defineTool } from '@deepseek-ai/dsh-tools';
import { bindCapabilitySources, capabilityGranted, capabilityHowTo, decideScope, definePlugin, hasSameOriginProof, isLoopbackRequestStrict, plainConfig, readSettingsEntry, readTtyHostKeys, settingsEntryScope, } from '@hyzyn/dsh-kit';
import { readJsonBody, writeJson } from '@hyzyn/dsh-kit';
import { createJsonlAuditSink, createLoggerAuditSink } from '@hyzyn/dsh-kit/audit';
import { RemoteExec, runLocal } from '@hyzyn/dsh-kit/ssh-exec';
import z from '@deepseek-ai/schemastery';
import { resolveChannel } from './channel.js';
import { evaluateProfile } from './env-ready-eval.js';
import { observeServices } from './observe.js';
import { actionLabel, planMutation, runMutation } from './mutate.js';
import { hasWritableTarget, MAX_POLL_INTERVAL_MS, MAX_WAIT_TIMEOUT_MS, MIN_POLL_INTERVAL_MS, MIN_WAIT_TIMEOUT_MS, normalizeConfig, pickTarget, targetIds, } from './plugin-config.js';
import { denialMessage, outOfScope, rejectionCodeOf, REJECTION_CODES } from './rejection.js';
import { httpProbe } from './probe.js';
import { describeProfileProblem, listReadyProjects, loadReadyProfile, readyManifestRelPath } from './ready-loader.js';
import { formatMs, renderEvaluation as renderReadyReport, renderMutation } from './render.js';
/**
 * 一份能力规格的形状（`{ env, label }`）。
 *
 * `env` / `label` **刻意不给 schema 默认值**：默认值会把「没写这一项」造出一个半成品对象
 * （`{env:'',label:''}`），于是「配了但没接入闸门」与「根本没配」在解析后就分不开了——
 * `devdata` 在真机上被这条咬过一次（报了一条假「配置问题」）。
 */
const CAPABILITY_SCHEMA = z.object({ env: z.string(), label: z.string() });
/** 同上的 ② ：能力字段缺省时**保持缺省**（不是造一个空对象）。 */
const OPTIONAL_CAPABILITY = CAPABILITY_SCHEMA.default(undefined);
/** 一个目标的配置形状（语义校正见 `plugin-config.ts`——schema 只管形状）。 */
const TARGET_SCHEMA = z.object({
    id: z.string().required(),
    label: z.string().default(''),
    // `local` / `ssh` 的合法性在 `plugin-config.ts` 判（认不出的**丢掉并报问题**，不是回落某一个）。
    kind: z.string().default(''),
    book: z.string().default(''),
    scopeDirs: z.array(z.string()).default([]),
    writeCapability: OPTIONAL_CAPABILITY,
});
/** 一份指纹记录（形状与 tty 0.19.0 对齐；清洗交给 `kit` 的 `sanitizeHostKeys`）。 */
const HOST_KEY_SCHEMA = z.object({
    host: z.string().required(),
    port: z.natural().default(22),
    fingerprints: z.array(z.string()).default([]),
});
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
export const Config = z.object({
    enabled: z.boolean().default(true).volatile(),
    announceToAgent: z.boolean().default(true).volatile(),
    execTimeoutMs: z.natural().volatile(),
    logTail: z.natural().volatile(),
    probeTimeoutMs: z.natural().volatile(),
    waitTimeoutMs: z.natural().volatile(),
    pollIntervalMs: z.natural().volatile(),
    stopTimeoutSec: z.natural().volatile(),
    auditFile: z.string().default('').volatile(),
    targets: z.array(TARGET_SCHEMA).default([]).volatile(),
    hostKeys: z.array(HOST_KEY_SCHEMA).default([]).volatile(),
});
/**
 * 工具面公告（插进 `systemPrompt` 的那一段）。
 *
 * 说的是「这个插件能做什么、入口叫什么」，**不是目标清单**（那份嵌在工具描述里，会随配置重注册）。
 * 写清入口名是给 agent 省事：它不必先猜哪个工具是环境面的。
 */
export const DEVENV_GUIDANCE = [
    '# 环境编排（dsh-devenv）',
    '',
    '本机装了 `@hyzyn/dsh-devenv`：它判的是**容器 / 端口 / 探针的状态**（环境就绪），',
    '数据服务的内容（SQL / Redis / MQ）在 `dsh-devdata`，浏览器渲染在 `dsh-devfront`。',
    '',
    '- `env_status <target> [project]`：看一眼现在什么样（容器在跑吗、健康吗、探针通吗）——**不等待**。',
    '- `env_wait <target> [project]`：等到就绪，或等到「明确没戏」。',
    '',
    '三条要知道的规矩：',
    '1. **就绪清单随项目走**：`<项目根>/ready/<项目名>.ready.yaml`。**没有这份清单 = 这个项目没有就绪要求**',
    '   （不是「用默认要求」）；清单写错了会指到字段。',
    '2. **`refuted` 与 `unready` 不是一回事**：前者是「已有证据明确否证」（容器退了、健康检查 unhealthy、',
    '   探针 5xx），**别等了**——等下去不会有结果；后者才是继续等。',
    '3. **报告里的证据是快照**：每条都带「取观测的时刻」。通道不通时报告会明说通道，不会假装容器没起。',
    '',
    '写类操作（起停容器）**今天没有入口**：`env_down` 会打到正在联调的同事，它要先有闸门与逐次二次确认。',
].join('\n');
/**
 * 文本输出（与 `devdata` 的 `textOutput()` **逐字同形**）。
 *
 * 形状不是随手写的：`defineTool` 的 `output.schema` 走的是**值 schema DSL**，它不接受 JSON Schema
 * 的 `required: [...]`（实测报 `unsupported JSON schema: schema.required is not supported`）。
 * 必填是写在字段上的 `required: true`。
 */
function textOutput() {
    return {
        schema: {
            type: 'object',
            additionalProperties: false,
            properties: { text: { type: 'string', required: true } },
        },
        render: (_args, value) => [{ type: 'text', text: value.text }],
    };
}
/** 判定图标（与 `devdata` 的 doctor 同一套：`✓` / `!` / `✗`）。 */
const VERDICT_ICON = { ready: '✓', unready: '!', refuted: '✗' };
/* ------------------------------------------------------------------ *
 * 配置卡片（客户端半体）的数据面：纯函数住在这里
 *
 * 为什么抽成导出的纯函数：宿主半体那一层的路由要真宿主才能跑到，而这几条判据
 * （哪些字段可改、目标怎么校验、快照长什么样）**不该只靠真机验收**。`devfront`
 * 走过同一段路，形状照它抄（两边行为一致本身也是判据）。
 * ------------------------------------------------------------------ */
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
export const CARD_FIELDS = ['enabled', 'announceToAgent', 'auditFile', 'probeTimeoutMs', 'waitTimeoutMs', 'pollIntervalMs'];
/**
 * 卡片上的数值字段 → 允许区间。
 *
 * **与 `plugin-config.ts` 的 `clampInt` 同界**（等待 / 轮询那两对直接引用它的常量；探针那两个界
 * 目前只写在 `normalizeConfig` 里，所以这里另记一份，并由 `normalizeCardPatch` 末尾的**复核**
 * 与用例的双向断言（提交上界下界后 `normalizeConfig` 原样收下）钉住「两套规则不许分叉」）。
 */
const CARD_NUMBERS = {
    /** 与 `normalizeConfig` 的 `clampInt(raw.probeTimeoutMs, 100, 60_000, 3000)` 同界。 */
    probeTimeoutMs: { min: 100, max: 60_000 },
    waitTimeoutMs: { min: MIN_WAIT_TIMEOUT_MS, max: MAX_WAIT_TIMEOUT_MS },
    pollIntervalMs: { min: MIN_POLL_INTERVAL_MS, max: MAX_POLL_INTERVAL_MS },
};
/**
 * `writeCapability` 被提交上来时的**专用**拒绝文案（码 `CAPABILITY_READONLY`）。
 *
 * 这不是「不支持这个字段」那种普通的 400：这一条是根 ROADMAP §5.1 那个不变量在卡片层的落点。
 * 机制（**别写错**，2026-10-03 更正过一次）：授权判据 = 宿主**启动继承层**里 `spec.env` 那个变量的值
 * ∈ `{1,true,yes,on}`（`kit` 的 `TRUTHY`；`project-env` / `user-env` 两层刻意排除）。所以
 * 「改成 `HOME`」**不会**提权（值不在白名单里）；真实的攻击形态是**把它指向另一个已经在启动环境里、
 * 值恰好为真的变量**（如 `CI=true`）——那样一条 POST 就能免重启把危险档打开，正是这条 400 要挡的。
 */
const CAPABILITY_READONLY = 'writeCapability 在这一层**只读**：它声明的环境变量名就是「谁有权启停共享环境里的容器」的判据'
    + '（宿主启动环境里该变量值 ∈ 1/true/yes/on 才算授权），而这张卡片能写配置——'
    + '把它指向另一个恰好为真的变量（例如 CI=true）就等于免重启提权（HTTP 不能凭空打开能力）。'
    + '要改它请改 ~/.dsh/profiles/<profile>/cordis.patch.yml；授权本身只认宿主启动环境'
    + '（在启动 dsh 的那个环境里 export DSH_DEVENV_WRITE=1 后重启宿主）。';
/** 一个字符串数组字段（去空、保序）。 */
function readStringList(value) {
    if (!Array.isArray(value))
        return undefined;
    return value.filter((item) => typeof item === 'string' && item.trim() !== '').map((item) => item.trim());
}
/** 目标编辑这一层的字段（多一个都会被拒：卡片与宿主版本不一致时静默丢弃才是坏事）。 */
const TARGET_FIELDS = ['id', 'label', 'kind', 'book', 'scopeDirs'];
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
export function normalizeTargets(input) {
    if (!Array.isArray(input))
        return { error: 'targets 必须是数组' };
    const out = [];
    const seen = new Set();
    for (const [index, row] of input.entries()) {
        const where = `targets[${String(index)}]`;
        if (typeof row !== 'object' || row === null || Array.isArray(row))
            return { error: `${where} 必须是对象` };
        const entry = row;
        if (entry.writeCapability !== undefined) {
            return { error: `${where}.writeCapability：${CAPABILITY_READONLY}`, code: 'CAPABILITY_READONLY' };
        }
        for (const key of Object.keys(entry)) {
            if (TARGET_FIELDS.includes(key))
                continue;
            return { error: `${where}.${key} 不是目标这一层的字段（可改的是：${TARGET_FIELDS.join(' / ')}）` };
        }
        const id = typeof entry.id === 'string' ? entry.id.trim() : '';
        if (id === '')
            return { error: `${where}.id 必须是非空字符串（工具就是按它选目标的）` };
        if (seen.has(id))
            return { error: `${where}.id 与前面的目标重名：${id}——重名的那一个会被丢掉，那是静默失败` };
        seen.add(id);
        const kind = typeof entry.kind === 'string' ? entry.kind.trim() : '';
        if (kind !== 'local' && kind !== 'ssh') {
            return { error: `${where}.kind 只认 local 或 ssh，拿到 ${JSON.stringify(entry.kind)}——认不出的目标不登记（不是「当成 ssh」）` };
        }
        const book = typeof entry.book === 'string' ? entry.book.trim() : '';
        if (kind === 'ssh' && book === '') {
            return { error: `${where}.book：ssh 目标必须给 tty 连接簿的条目名（本插件不自建连接簿界面：一处配置、两处生效）` };
        }
        if (entry.book !== undefined && typeof entry.book !== 'string')
            return { error: `${where}.book 必须是字符串` };
        const label = typeof entry.label === 'string' ? entry.label.trim() : '';
        if (entry.label !== undefined && typeof entry.label !== 'string')
            return { error: `${where}.label 必须是字符串` };
        const scopeDirs = readStringList(entry.scopeDirs);
        if (entry.scopeDirs !== undefined && scopeDirs === undefined) {
            return { error: `${where}.scopeDirs 必须是字符串数组（空数组合法——那意味着处处拒绝，不是「不限制」）` };
        }
        out.push({
            id,
            kind,
            ...(label === '' ? {} : { label }),
            ...(book === '' ? {} : { book }),
            scopeDirs: scopeDirs ?? [],
        });
    }
    // 复核：解析层必须把这些行**一行不少、id 顺序不变**地收下（两套规则分叉时在这里红）
    const parsed = normalizeConfig({ targets: out }).targets;
    if (parsed.length !== out.length || parsed.map((target) => target.id).join('|') !== out.map((row) => String(row.id)).join('|')) {
        return { error: `内部判据分叉：校验通过 ${String(out.length)} 个目标，解析层只收下 ${String(parsed.length)} 个（报 bug，别重试）` };
    }
    return { targets: out };
}
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
export function normalizeCardPatch(input, options = {}) {
    const patch = {};
    for (const [key, value] of Object.entries(input)) {
        if (key === 'confirmTargetEdit')
            continue; // 它只是这次调用的确认位，不进配置
        if (key === 'writeCapability')
            return { error: CAPABILITY_READONLY, code: 'CAPABILITY_READONLY' };
        if (key === 'hostKeys' || key === 'writeGates') {
            return {
                error: `${key} 只读：它是 GET 快照里的展示项。${key === 'hostKeys' ? '指纹记录由 TOFU 自己维护（改它等于放弃指纹校验）' : '写闸门的判据在宿主启动环境里，HTTP 不能凭空打开它'}`,
                code: 'READONLY_FIELD',
            };
        }
        if (key === 'targets') {
            if (input.confirmTargetEdit !== true) {
                return {
                    error: '改目标声明要逐次确认：这是「agent 能用哪些目标、在哪些目录里动手」的变更，'
                        + '带 `confirmTargetEdit: true` 重试（卡片上那个复选框就是它）。它写进 profile 补丁层并进审计。',
                    code: 'CONFIRMATION_REQUIRED',
                };
            }
            const normalized = normalizeTargets(value);
            if ('error' in normalized)
                return normalized;
            patch.targets = carryWriteCapability(normalized.targets, options.currentTargets ?? []);
            continue;
        }
        if (!CARD_FIELDS.includes(key))
            return { error: `不认识的字段：${key}` };
        if (key === 'enabled' || key === 'announceToAgent') {
            if (typeof value !== 'boolean')
                return { error: `${key} 必须是布尔值` };
            patch[key] = value;
            continue;
        }
        const range = CARD_NUMBERS[key];
        if (range !== undefined) {
            if (typeof value !== 'number' || !Number.isInteger(value) || value < range.min || value > range.max) {
                return { error: `${key} 必须是 ${String(range.min)}~${String(range.max)} 的整数（毫秒）` };
            }
            // 复核：解析层必须原样收下（夹回去了说明两套界分叉了——错的方向是「保存成功、值却不是你写的」）
            const parsed = normalizeConfig({ [key]: value });
            if (parsed[key] !== value) {
                return { error: `内部判据分叉：${key}=${String(value)} 被解析层改成了 ${String(parsed[key])}（报 bug，别重试）` };
            }
            patch[key] = value;
            continue;
        }
        if (typeof value !== 'string')
            return { error: `${key} 必须是字符串` };
        patch[key] = value.trim();
    }
    if (Object.keys(patch).length === 0)
        return { error: '没有要改的字段（patch 是空的）' };
    return { patch };
}
/**
 * 改目标时**保住**同 id 目标已经声明的 `writeCapability`。
 *
 * 为什么必须这么做：`writeCapability` 在卡片上只读（上面那条 400），所以客户端提交的目标行里
 * **没有**它——若照原样写回 settings，用户只是改了一个 `scopeDirs` 的错别字，写闸门就会被静默抹掉，
 * `env_up` / `env_down` 跟着从工具面消失（症状是「agent 的写工具不见了」，而没有任何提示）。
 * 这与 `devfront` 真机上那条「保存一个标量把站点整批抹掉」是同一类缺陷。
 *
 * 安全方向没变：这里带过去的只有**配置里本来就写着**的那一份，HTTP 仍然不能新增、不能改名字
 * （那条 400 管的是**请求体**，不是宿主自己写回配置的值）。改 `id` 等于换一个目标，闸门不跟过去
 * ——那正是「重新声明一次」该有的样子，且整个变更进审计。
 */
function carryWriteCapability(rows, current) {
    return rows.map((row) => {
        const capability = current.find((target) => target.id === row.id)?.writeCapability;
        return capability === undefined ? row : { ...row, writeCapability: { env: capability.env, label: capability.label } };
    });
}
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
export function configSnapshotFrom(live) {
    return {
        enabled: live.enabled,
        announceToAgent: live.announceToAgent,
        execTimeoutMs: live.execTimeoutMs,
        logTail: live.logTail,
        probeTimeoutMs: live.probeTimeoutMs,
        waitTimeoutMs: live.waitTimeoutMs,
        pollIntervalMs: live.pollIntervalMs,
        stopTimeoutSec: live.stopTimeoutSec,
        auditFile: live.auditFile,
        targets: live.targets.map((target) => ({
            id: target.id,
            label: target.label,
            kind: target.kind,
            book: target.book,
            scopeDirs: [...target.scopeDirs],
        })),
        writeGates: live.targets.map((target) => {
            const capability = target.writeCapability;
            return capability === undefined
                ? { targetId: target.id, label: target.label, declared: false }
                : {
                    targetId: target.id,
                    label: target.label,
                    declared: true,
                    env: capability.env,
                    granted: capabilityGranted(capability),
                    howTo: capabilityHowTo(capability),
                };
        }),
        hostKeys: live.hostKeys.map((record) => ({ host: record.host, port: record.port, fingerprints: record.fingerprints.length })),
    };
}
const plugin = definePlugin({
    name: 'devenv',
    inject: ['tools'],
    apply(ctx, rawConfig) {
        /** apply 时的原始配置：卡片保存时如果拿不到 settings 的已解析值，用它兜底。 */
        const initialSection = plainConfig((rawConfig ?? {}));
        /** 当前生效的配置（volatile 字段被就地改写后靠重算取回来）。 */
        let live = normalizeConfig(initialSection);
        let toolDisposers = [];
        let announcementDispose;
        let toolsApi;
        let announcementApi;
        /** 只读别的插件 entry 的口（`kit` 的 `readSettingsEntry`：连接簿在 tty 那边）。 */
        let settingsApi;
        /** 本插件 settings entry 的读写口（没有新版 settings 服务时是 `undefined`：卡片仍可用但不落盘）。 */
        let settingsScope;
        let appliedSignature = JSON.stringify(live);
        let reportedProblems = '';
        /** 运行期记下的新指纹（TOFU 首次连接即记录；同时往本插件自己的 settings entry 落盘）。 */
        let runtimeHostKeys = [];
        /**
         * 最近一次生效的**原始** section：卡片保存时套用 patch 的兜底源。
         *
         * **初值必须是 apply 时那份配置**，不能是 `{}`：`devfront` 真机验收（2026-10-03）抓到过——
         * 启动时 `scope.get()` 还是空对象（settings entry 尚未就绪），于是兜底源一直是空的；卡片保存
         * 一个标量时用 `{...{}, probeTimeoutMs}` 重建，**把目标整批抹掉**（响应里 `targets: []`）。
         */
        let rawSectionRef = initialSection;
        bindCapabilitySources(ctx);
        /**
         * 审计出口（2026-10-03 加）：配了 `auditFile` 走**持久**出口，否则只进宿主日志。
         *
         * 口径与 `devdata` 完全一致（实现是同一份 `@hyzyn/dsh-kit/audit`）：一条 JSON 行 / 调用，
         * **含被拒绝的尝试**；写不进去 = 抛（fail-closed）。而**写类动作要求持久审计**（见下面
         * `mutateText` 里的第五道门）：`env_down` 会停共享机器上别人正在联调的容器，
         * 「谁在什么时候停了什么」必须事后说得清。
         */
        const auditSink = () => live.auditFile === ''
            ? createLoggerAuditSink(ctx.logger, { tag: 'dsh-devenv' })
            : createJsonlAuditSink(live.auditFile);
        const auditDurable = () => live.auditFile !== '';
        /**
         * 包一次工具调用：成功记「允许」，抛出记「拒绝 + 码」。
         *
         * **码从拒绝文案里读回来**（`rejectionCodeOf`），不在这里另判一遍——判据只该有一处。
         * 读不到码的错误（例如 `docker` 自己抛的）如实留空，不猜。
         */
        const audited = async (action, args, run) => {
            const targetId = typeof args.target === 'string' ? args.target : '(未指定)';
            try {
                const value = await run();
                auditSink().record({ at: Date.now(), targetId, action, allowed: true });
                return value;
            }
            catch (error) {
                const code = rejectionCodeOf(error);
                auditSink().record({
                    at: Date.now(),
                    targetId,
                    action,
                    allowed: false,
                    ...(code === undefined ? {} : { code }),
                });
                throw error;
            }
        };
        /*
         * 执行层：与容器面板**同一份实现**（`@hyzyn/dsh-kit/ssh-exec`），只是日志前缀与处置文案不同。
         * 这里传 `tag` 是必需的——不传的话这些行会顶着 `dsh-kit` 的缺省名，用户认不出是谁在连。
         */
        const remote = new RemoteExec({ info: (message) => ctx.logger.info(message), warn: (message) => ctx.logger.warn(message) }, hostKeyStore(), { tag: 'dsh-devenv', mismatchHint: '确认安全后，到 插件配置 → 环境编排 清掉该主机的指纹记录再重连。' });
        /**
         * TOFU 指纹存储：**种子来自 tty 的连接簿**（那边确认过的主机不该被当成「首次连接」），
         * 新指纹写进**本插件自己的** settings entry。
         *
         * 为什么不写进 tty 的 entry：那是另一个插件的配置，写它等于绕过它的所有权（本仓的硬规矩是
         * 插件之间只读对方的配置）。代价是同一台主机在两处各有一份记录——两份都在 TOFU 语义下成立，
         * 因为**任一处发现变更都会拒绝连接**。
         */
        function hostKeyStore() {
            const find = (host, port) => {
                for (const record of [...readTtyHostKeys(settingsApi), ...live.hostKeys, ...runtimeHostKeys]) {
                    if (record.host === host && record.port === port && record.fingerprints.length > 0)
                        return record.fingerprints;
                }
                return undefined;
            };
            /** 本插件这份记录的**合并视图**（配置里的 + 运行期新记的），落盘用。 */
            const merge = () => {
                const merged = live.hostKeys.map((record) => ({ ...record, fingerprints: [...record.fingerprints] }));
                for (const record of runtimeHostKeys) {
                    const hit = merged.find((item) => item.host === record.host && item.port === record.port);
                    if (hit === undefined)
                        merged.push({ ...record, fingerprints: [...record.fingerprints] });
                    else
                        hit.fingerprints = [...new Set([...hit.fingerprints, ...record.fingerprints])];
                }
                return merged;
            };
            return {
                get: (host, port) => find(host, port),
                record: (host, port, fingerprint) => {
                    const existing = runtimeHostKeys.find((record) => record.host === host && record.port === port);
                    if (existing === undefined)
                        runtimeHostKeys.push({ host, port, fingerprints: [fingerprint] });
                    else if (!existing.fingerprints.includes(fingerprint))
                        existing.fingerprints.push(fingerprint);
                    /*
                     * 落盘是**尽力而为**：`record` 由 ssh2 的 hostVerifier 同步调用，不能等 IO；而写不进去
                     * 只影响「下次启动是否还认得这台主机」，不影响本次连接（本次已经放行了）。所以这里不抛，
                     * 只把失败说进日志——但绝**不**假装写成功了。
                     */
                    const scope = settingsScope;
                    if (scope === undefined)
                        return;
                    void scope.update({ hostKeys: merge() }).catch((error) => {
                        ctx.logger.warn(`[dsh-devenv] 指纹落盘失败（本次连接已放行，不影响本次）：${error instanceof Error ? error.message : String(error)}`);
                    });
                },
            };
        }
        /** 当前目录（工具参数优先，其次宿主进程的工作目录）。 */
        const cwdOf = (input) => typeof input.cwd === 'string' && input.cwd.trim() !== '' ? input.cwd : process.cwd();
        /** 项目名（清单名）。缺省用当前目录的 basename——与「清单随项目走」的约定一致。 */
        const projectOf = (input, cwd) => {
            const given = typeof input.project === 'string' ? input.project.trim() : '';
            if (given !== '')
                return given;
            const base = cwd.split(/[\\/]/).filter((part) => part !== '').pop() ?? '';
            return base;
        };
        /** 按 id 取目标；找不到时报出可用名单（agent 的失败模式是原地重试，得给它出路）。 */
        const requireTarget = (id) => {
            if (typeof id !== 'string' || id.trim() === '') {
                throw new Error(`缺少 target 参数。可用目标：${targetIds(live.targets)}`);
            }
            const found = pickTarget(live.targets, id.trim());
            if (found === undefined)
                throw new Error(`没有名为 ${JSON.stringify(id.trim())} 的目标。可用：${targetIds(live.targets)}`);
            return found;
        };
        /** 作用域门（与数据面同一条：空作用域 = 处处拒绝）。 */
        const requireScope = (target, cwd) => {
            const scope = decideScope(target.scopeDirs, cwd);
            if (scope.allowed)
                return;
            throw new Error(denialMessage(outOfScope(target.id, target.scopeDirs, cwd)));
        };
        /**
         * 写入口的两道闸门（**读工具不经过这里**）。
         *
         * 顺序是刻意的：**先能力、后确认**。反过来的话，用户在没授权时会先被要求「说清要改什么」、
         * 说清之后才被告知「你根本没授权」——两次调用都没有进展，而正确的那一次本该是「去启动环境里
         * 加一个变量再重启宿主」。这是 `devdata` 记录过的**错诊断**那一类。
         */
        const requireWriteGate = (target, action) => {
            const capability = target.writeCapability;
            if (capability === undefined) {
                throw new Error(denialMessage({
                    code: REJECTION_CODES.WRITE_NOT_CONFIGURED,
                    message: `目标 ${target.id} 没有配写能力闸门，所以它上面不存在写入口`,
                    hint: `在插件配置里给目标 ${target.id} 加 writeCapability.env（一个环境变量名），重启宿主后写工具才会出现`,
                }));
            }
            if (!capabilityGranted(capability)) {
                throw new Error(denialMessage({
                    code: REJECTION_CODES.CAPABILITY_NOT_GRANTED,
                    message: `「${capability.label}」未获宿主授权，所以不能在目标 ${target.id} 上${actionLabel(action)}容器`,
                    hint: capabilityHowTo(capability),
                }));
            }
            return capability;
        };
        /** 写动作的正文：闸门 → 作用域 → 清单 → 观测 → 计划 → 二次确认 → 执行。 */
        const mutateText = async (action, input) => {
            const target = requireTarget(input.target);
            const cwd = cwdOf(input);
            /*
             * 门槛的顺序：**作用域 → 清单 → 能力 → 确认**。
             *
             * 作用域排在最前有两个理由：① 它是最强的隔离判据（「这个 agent 能不能碰这台目标」先于
             * 「这台目标允不允许写」）；② 与 `devdata` 的 `adjudicate()` 同序——两个插件的门该有同样的
             * 手感，否则 agent 学到的「撞墙之后先干什么」会因为插件不同而不同。
             */
            requireScope(target, cwd);
            const project = projectOf(input, cwd);
            const capability = requireWriteGate(target, action);
            const profile = requireProfile(cwd, project);
            const channel = requireIo(target);
            // 先观测：幂等靠它（只动需要动的），而「要动谁」的清单也要在确认之前给出来。
            const observations = await observeOnce(target, profile, channel);
            const plan = planMutation({ action, services: profile.services, observations });
            if (plan.services.length === 0) {
                // **没有东西要动就不要求确认**：让 agent 为一次空操作去写一遍确认，只会训练它无视这道闸门。
                return {
                    text: renderMutation({
                        targetId: target.id,
                        targetLabel: target.label,
                        project,
                        plan,
                        outcomes: [],
                        ...(observations[0]?.observedAt === undefined ? {} : { observedAt: observations[0].observedAt }),
                    }),
                };
            }
            if (input.confirmed !== true) {
                throw new Error(denialMessage({
                    code: REJECTION_CODES.CONFIRMATION_REQUIRED,
                    message: `这次会${actionLabel(action)}目标 ${target.id} 上这 ${String(plan.services.length)} 个容器：${plan.services.join(' / ')}（清单 ${readyManifestRelPath(project)} 里声明的）`,
                    hint: `后果说清之后再带 confirmed: true 重试。这是一台共享机器：${action === 'down' ? '停掉的容器可能是同事正在联调的那一份' : '启动容器会占用目标机的资源'}；本工具**只**在清单里声明的服务上动手，不会碰别的容器`,
                }));
            }
            /*
             * 第五道门：**写类动作要求持久审计**（口径与 `devdata` 一致，码也同一个）。
             *
             * 放在**确认之后**：一个「没授权 / 没确认」的调用该报的仍然是它自己那一档——反过来的话，
             * 用户会先去配审计，再撞一次「没授权」，那是本仓最忌讳的**错诊断**。
             * 放在**真正动手之前**：审计是这一档的前提，写不进去就不能装作记下了。
             */
            if (!auditDurable()) {
                throw new Error(denialMessage({
                    code: REJECTION_CODES.AUDIT_NOT_DURABLE,
                    message: `这次会${actionLabel(action)}目标 ${target.id} 上的容器，而本插件没有配持久审计出口`,
                    hint: '在插件配置里设置 auditFile（如 ~/.dsh/devenv-audit.jsonl）。审计是这一档的前提：共享机器上的一次启停，事后必须说得清「谁在什么时候动了什么」',
                }));
            }
            const outcomes = await runMutation(plan, { run: channel.io.run }, {
                timeoutSec: live.stopTimeoutSec,
                timeoutMs: live.execTimeoutMs,
            });
            for (const outcome of outcomes) {
                const how = outcome.code === 0 ? 'ok' : `失败（${String(outcome.code ?? 'null')}）`;
                ctx.logger.info(`[dsh-devenv] ${actionLabel(action)} ${outcome.name} → ${how}（目标 ${target.id}，凭「${capability.label}」）`);
            }
            return {
                text: renderMutation({
                    targetId: target.id,
                    targetLabel: target.label,
                    project,
                    plan,
                    outcomes,
                    ...(observations[0]?.observedAt === undefined ? {} : { observedAt: observations[0].observedAt }),
                }),
            };
        };
        /** 加载清单，并把三种「读不到」各自说清（它们下一步的动作完全不同）。 */
        const requireProfile = (cwd, project) => {
            const loaded = loadReadyProfile(cwd, project);
            if (loaded.kind === 'ok')
                return loaded.profile;
            throw new Error(describeProfileProblem(loaded, { cwd, project, known: listReadyProjects(cwd) }));
        };
        /** 接一根线（本机子进程或 SSH 执行层），接不上就抛一句指到该改哪里的话。 */
        const requireIo = (target) => {
            const resolved = resolveChannel(target, {
                remote,
                local: runLocal,
                settings: settingsApi,
                execTimeoutMs: live.execTimeoutMs,
            });
            if (resolved.kind === 'problem') {
                throw new Error(`${resolved.problem.message}\n恢复路径：${resolved.problem.hint}`);
            }
            return {
                // 探针地址由通道解析给出：本机目标 `127.0.0.1`，SSH 目标是**那台主机的地址**
                // （探针从运行本工具的机器发出，见 `probe.ts` 的头注）。
                probeHost: resolved.probeHost,
                io: {
                    run: resolved.runner.run,
                    probe: (input) => httpProbe(input),
                },
            };
        };
        /** 取一轮观测（通道不通时**原样抛出**，不降级成「容器没起」）。 */
        const observeOnce = async (target, profile, channel) => {
            const result = await observeServices({
                io: channel.io,
                host: channel.probeHost,
                services: profile.services,
                logTail: live.logTail,
                probeTimeoutMs: live.probeTimeoutMs,
            });
            if (result.failure !== undefined) {
                throw new Error(`取观测失败，**不是**「容器没起」：${result.failure}` +
                    `\n恢复路径：先确认目标 ${target.id} 的通道（SSH 通不通、目标机上 docker 能不能跑），再重试；` +
                    `已取到的观测是：${result.observations.map((item) => item.name).join(' / ') || '（一个都没有）'}`);
            }
            return result.observations;
        };
        /** 判定一份清单（把观测与计时交给纯判据层）。 */
        const evaluateOnce = (profile, observations, elapsedMs) => {
            const elapsed = {};
            for (const service of profile.services)
                elapsed[service.name] = elapsedMs;
            return evaluateProfile({ profile, observations, elapsedMs: elapsed });
        };
        /** 渲染一次判定（判定层给结论，`render.ts` 只负责让它**可读、可深挖**）。 */
        const renderEvaluation = (input) => renderReadyReport({
            targetId: input.target.id,
            targetLabel: input.target.label,
            project: input.project,
            evaluation: input.evaluation,
            observations: input.observations,
            ...(input.stoppedBecause === undefined ? {} : { stoppedBecause: input.stoppedBecause }),
        });
        /** 一次「看一眼」：清单 → 通道 → 观测 → 判定。 */
        const statusText = async (input) => {
            const target = requireTarget(input.target);
            const cwd = cwdOf(input);
            requireScope(target, cwd);
            const project = projectOf(input, cwd);
            const profile = requireProfile(cwd, project);
            const channel = requireIo(target);
            const observations = await observeOnce(target, profile, channel);
            const evaluation = evaluateOnce(profile, observations, 0);
            return { text: renderEvaluation({ target, project, evaluation, observations }) };
        };
        /** 等到就绪、被明确否证、或超时。 */
        const waitText = async (input) => {
            const target = requireTarget(input.target);
            const cwd = cwdOf(input);
            requireScope(target, cwd);
            const project = projectOf(input, cwd);
            const profile = requireProfile(cwd, project);
            const channel = requireIo(target);
            const requested = typeof input.timeoutMs === 'number' && Number.isFinite(input.timeoutMs) ? Math.trunc(input.timeoutMs) : live.waitTimeoutMs;
            const timeoutMs = Math.min(Math.max(requested, 1_000), 900_000);
            const startedAt = Date.now();
            const deadline = startedAt + timeoutMs;
            let evaluation;
            let observations = [];
            let stoppedBecause;
            for (;;) {
                observations = await observeOnce(target, profile, channel);
                evaluation = evaluateOnce(profile, observations, Date.now() - startedAt);
                if (evaluation.ready) {
                    stoppedBecause = '全部就绪';
                    break;
                }
                if (evaluation.anyRefuted) {
                    // **别等了**：等下去只会看到又一次同样的否证，而「超时」那句话里没有任何线索。
                    stoppedBecause = '有服务被明确否证（它不会自己好起来；先去看那个服务的日志）';
                    break;
                }
                const remaining = deadline - Date.now();
                if (remaining <= 0) {
                    stoppedBecause = `等满 ${formatMs(timeoutMs)} 仍未就绪`;
                    break;
                }
                await sleep(Math.min(live.pollIntervalMs, remaining));
            }
            return {
                text: renderEvaluation({
                    target,
                    project,
                    evaluation,
                    observations,
                    stoppedBecause,
                }),
            };
        };
        /**
         * 注册工具（**可重入**）。
         *
         * 注册面只有两个，而且**必须至少有一个目标**：没配目标时一个都不注册——未注册的 agent 根本
         * 看不到，不会去试一个注定失败的工具（`devdata` 的 `entries.ts` 是同一条纪律）。
         * 逐条 `add` 是为了让单个工具注册失败不把整批带下去（docker D107 记过这个坑）。
         */
        function refreshTools() {
            if (toolsApi === undefined)
                return;
            for (const dispose of toolDisposers) {
                try {
                    dispose();
                }
                catch {
                    /* 已注销 */
                }
            }
            toolDisposers = [];
            if (!live.enabled)
                return;
            if (live.targets.length === 0)
                return;
            const summary = live.targets.map((target) => `${target.id}（${target.kind}）`).join('、');
            const failures = [];
            const add = (name, definition) => {
                try {
                    toolDisposers.push(toolsApi.register(definition));
                }
                catch (error) {
                    failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
                }
            };
            const cwdParam = { type: 'string', description: '当前工作目录（作用域判据用它；也是就绪清单所在的项目根。缺省取宿主进程工作目录）' };
            const targetParam = { type: 'string', description: `目标名。今天有：${summary}` };
            const projectParam = { type: 'string', description: '项目名（= ready/<项目名>.ready.yaml 的文件名部分）。缺省用当前目录的目录名' };
            add('env_status', defineTool({
                name: 'env_status',
                isConcurrencySafe: () => true,
                description: `看一眼环境现在什么样（容器在跑吗 / 健康吗 / 探针通吗），**不等待**。判据来自项目里的 ready/<项目名>.ready.yaml。目标：${summary}`,
                parameters: { target: targetParam, project: projectParam, cwd: cwdParam },
                output: textOutput(),
                execute: (args) => {
                    const input = (args ?? {});
                    return audited('env_status', input, () => statusText(input));
                },
            }));
            /*
             * 写入口**只在有目标配了写能力闸门时**注册（`hasWritableTarget`）。
             *
             * 这是「未注册的 agent 不会去试」那条纪律的延续：默认配置下这两个工具**不存在**，
             * 所以 agent 不会拿着一个注定被拒的名字反复试。配了闸门才注册，而调用的每一次仍然要过
             * 能力授权与逐次确认——注册是「这台机器上存在这个入口」，不是「这个入口现在能用」。
             */
            if (hasWritableTarget(live.targets)) {
                const confirmParam = { type: 'boolean', description: '二次确认。第一次调用会被拒（CONFIRMATION_REQUIRED）并告诉你要动哪些容器，说清后果后带 confirmed: true 重试' };
                add('env_up', defineTool({
                    name: 'env_up',
                    isConcurrencySafe: () => true,
                    description: `启动项目就绪清单（ready/<项目名>.ready.yaml）里声明、但**没在跑**的容器。**只 start 已存在的容器，不创建**；不会碰清单之外的任何容器。目标：${summary}`,
                    parameters: { target: targetParam, project: projectParam, cwd: cwdParam, confirmed: confirmParam },
                    output: textOutput(),
                    execute: (args) => {
                        const input = (args ?? {});
                        return audited('env_up', input, () => mutateText('up', input));
                    },
                }));
                add('env_down', defineTool({
                    name: 'env_down',
                    isConcurrencySafe: () => true,
                    description: `停掉项目就绪清单里声明、且**正在跑**的容器。这是一台共享机器：停掉的可能是同事正在联调的那一份，所以每次都要 confirmed: true。只碰清单里声明的容器。目标：${summary}`,
                    parameters: { target: targetParam, project: projectParam, cwd: cwdParam, confirmed: confirmParam },
                    output: textOutput(),
                    execute: (args) => {
                        const input = (args ?? {});
                        return audited('env_down', input, () => mutateText('down', input));
                    },
                }));
            }
            add('env_wait', defineTool({
                name: 'env_wait',
                isConcurrencySafe: () => true,
                description: `等到环境就绪，或等到**明确没戏**（容器退了 / 健康检查 unhealthy / 探针 5xx —— 这一档会立刻返回，别重试等待）。判据来自项目里的 ready/<项目名>.ready.yaml。目标：${summary}`,
                parameters: {
                    target: targetParam,
                    project: projectParam,
                    cwd: cwdParam,
                    timeoutMs: { type: 'number', description: `最多等多少毫秒（缺省 ${String(live.waitTimeoutMs)}，上限 900000）` },
                },
                output: textOutput(),
                execute: (args) => {
                    const input = (args ?? {});
                    return audited('env_wait', input, () => waitText(input));
                },
            }));
            for (const failure of failures)
                console.warn(`[dsh-devenv] 工具注册失败：${failure}`);
            /*
             * 这一行走 `console.log` 而不是 `ctx.logger.info`——2026-10-02 在 `devdata` 上实测过：
             * 走 logger 会进另一个 sink，真宿主的启动日志里找不到「插件到底注册了什么」。
             * **启动日志是运维与验收脚本的观测面**。
             */
            /*
             * 注册行把**这次真的注册了哪些**报出来（真机验收脚本解析的就是这一行）。
             * 写入口按「有没有目标配了写闸门」出现——所以同一份代码在不同配置下注册的行数不同，
             * 而报告必须如实反映，不能写死一句四个名字。
             */
            const names = [
                'env_status',
                'env_wait',
                ...(hasWritableTarget(live.targets) ? ['env_up', 'env_down'] : []),
            ];
            console.log(`[dsh-devenv] agent tools registered (${names.join(', ')})`);
        }
        /** 拆掉工具登记。 */
        function disposeTools() {
            for (const dispose of toolDisposers) {
                try {
                    dispose();
                }
                catch {
                    /* 已注销 */
                }
            }
            toolDisposers = [];
        }
        /** 按当前 `live` 重新插公告段（可重入）。 */
        function refreshAnnouncement() {
            if (announcementDispose !== undefined) {
                try {
                    announcementDispose();
                }
                catch {
                    /* 已注销 */
                }
                announcementDispose = undefined;
            }
            if (!live.announceToAgent || announcementApi === undefined)
                return;
            announcementDispose = announcementApi.section({ name: 'plugin:dsh-devenv', order: 156, text: DEVENV_GUIDANCE });
        }
        /**
         * 配置问题只报一次（`applySection` 会被反复调用）。
         *
         * **走 `console.warn` 而不是 `ctx.logger.warn`**——与 `devdata` 同一个理由：logger 进的是另一个
         * sink，真宿主启动日志里看不到，于是用户永远不会在启动时知道自己的配置有问题，
         * 而验收脚本里那条「启动日志里没有『配置问题』」也会变成**空断言**。
         */
        function reportProblems() {
            const signature = live.problems.join('\n');
            if (signature === reportedProblems)
                return;
            reportedProblems = signature;
            for (const problem of live.problems)
                console.warn(`[dsh-devenv] 配置问题：${problem}`);
        }
        /** 用一份新配置重算并让它真的生效。 */
        function applySection(raw) {
            if (Object.keys(raw).length === 0)
                return;
            // 兜底源要在**值没变**的那条早退之前更新：它记的是「最近一份原始 section」，与签名无关。
            rawSectionRef = raw;
            const next = normalizeConfig(raw);
            const signature = JSON.stringify(next);
            if (signature === appliedSignature)
                return;
            appliedSignature = signature;
            live = next;
            // 配置里的指纹是权威（用户可能手动清过）：运行期那份与它合流，但不再各自记两笔。
            runtimeHostKeys = runtimeHostKeys.filter((record) => !live.hostKeys.some((item) => item.host === record.host && item.port === record.port && item.fingerprints.length > 0));
            reportProblems();
            refreshTools();
            refreshAnnouncement();
        }
        /* ---------- 初次登记 ---------- */
        reportProblems();
        refreshTools();
        refreshAnnouncement();
        ctx.inject(['tools'], (toolsCtx) => {
            toolsApi = toolsCtx.tools;
            if (toolsApi === undefined) {
                if (live.enabled)
                    console.log('[dsh-devenv] agent tools skipped (tools 服务未就绪)');
                return;
            }
            refreshTools();
        });
        ctx.inject(['systemPrompt'], (promptCtx) => {
            announcementApi = promptCtx.systemPrompt;
            refreshAnnouncement();
        });
        ctx.inject(['settings'], (settingsCtx) => {
            settingsCtx.effect(() => {
                const scope = settingsEntryScope(settingsCtx, 'devenv');
                if (scope === undefined)
                    return () => { };
                settingsScope = scope;
                // 连接簿在 tty 那边，**只读**它的 entry（本插件不自建连接簿界面：一处配置、两处生效）。
                settingsApi = { get: (ns) => readSettingsEntry(settingsCtx, ns) };
                applySection(scope.get());
                const off = scope.onChanged(() => applySection(scope.get()));
                return () => off();
            }, 'dsh-devenv: settings');
        });
        /*
         * ---------- 配置卡片的**数据面**（`/api/dsh-devenv/config`） ----------
         *
         * 为什么必须有这条路由：客户端半体读不到插件配置——宿主那套「按 schema 生成表单」在这一版
         * **没有渲染方**，所以各插件的卡片都自带一条 GET/POST 路由（`tty` / `docker` / `devfront` 同款）。
         *
         * - GET：卡片渲染用的快照（`configSnapshotFrom(live)`：标量 + 目标 + 写闸门只读档 + 指纹只读档）；
         * - POST：走**官方持久化通道** `settings.update(entryId, patch)` 写 volatile 字段 → loader 广播 →
         *   本插件的 `applySection` 热应用（不重启）。没有 settings 服务时退化成「只在本进程套用」，
         *   并**在响应里如实标注 `persisted: false`**——不假装写进去了。
         *
         * `/config` 不受「插件停用」影响（与 tty / docker / devfront 同口径）：卡片是重新启用插件的
         * 唯一 UI 入口。
         */
        ctx.inject(['webServer'], (webCtx) => {
            webCtx.effect(() => {
                const webServer = webCtx.webServer;
                if (webServer === undefined)
                    return () => { };
                return webServer.register({
                    kind: 'exact',
                    path: '/api/dsh-devenv/config',
                    handler: async (req, res) => {
                        /*
                         * 围栏：**只放回环 + 强来源判据**（`isLoopbackRequestStrict`，与 tty / docker / devfront
                         * 的 `gateRoute` 同一套）。`POST /config` **刻意不额外要求 `hasSameOriginProof`**：
                         * 卡片是插件被停用后唯一的恢复入口，而跨站请求已由上面那道围栏的
                         * `sec-fetch-site: cross-site` 与 Origin 比对拦掉。
                         */
                        if (!(await isLoopbackRequestStrict(req))) {
                            writeJson(res, 403, { error: 'forbidden: loopback-only' });
                            return;
                        }
                        // `hasSameOriginProof` 在这里只用于**诊断日志**：真正的判据是上面那道围栏。
                        if (req.method === 'POST' && !hasSameOriginProof(req)) {
                            ctx.logger.warn('[dsh-devenv] /config 的 POST 没带同源证明（回环已放行，按恢复入口口径继续）');
                        }
                        if (req.method === 'GET') {
                            writeJson(res, 200, { ok: true, config: configSnapshotFrom(live), persisted: settingsScope !== undefined });
                            return;
                        }
                        if (req.method !== 'POST') {
                            writeJson(res, 405, { error: `method not allowed: ${String(req.method)}` });
                            return;
                        }
                        const body = await readJsonBody(req);
                        if (body === undefined) {
                            writeJson(res, 400, { error: 'invalid JSON body' });
                            return;
                        }
                        const normalized = normalizeCardPatch(body, { currentTargets: live.targets });
                        if ('error' in normalized) {
                            /*
                             * **被拒的尝试也进审计**（与工具面同一口径）。走本包**已有的**出口（`auditSink`），
                             * 不新造 sink；写不进去就让它抛：审计是这条路径的前提，坏了就该响
                             * （而不是安静地放行一次没记下来的变更）。
                             */
                            auditSink().record({
                                at: Date.now(),
                                targetId: 'card',
                                action: 'config.save',
                                allowed: false,
                                ...(normalized.code === undefined ? {} : { code: normalized.code }),
                            });
                            writeJson(res, 400, {
                                error: normalized.error,
                                ...(normalized.code === undefined ? {} : { code: normalized.code }),
                            });
                            return;
                        }
                        const scope = settingsScope;
                        if (scope !== undefined) {
                            try {
                                await scope.update(normalized.patch);
                            }
                            catch (error) {
                                writeJson(res, 500, { error: `保存配置失败：${error instanceof Error ? error.message : String(error)}` });
                                return;
                            }
                            /*
                             * 优先用 settings 的**已解析值**（含 schema 默认值与组合后的层），拿不到才退回
                             * 「最近一次原始 section + patch」。**不能只退回后者**：见 `rawSectionRef` 的注释
                             * （真机验收抓到过：保存一个标量把目标整批抹掉）。
                             */
                            const resolved = scope.get();
                            if (Object.keys(resolved).length > 0)
                                applySection(resolved);
                            else
                                applySection({ ...rawSectionRef, ...normalized.patch });
                        }
                        else {
                            applySection({ ...rawSectionRef, ...normalized.patch });
                        }
                        /*
                         * 成功的变更也进审计：目标声明（影响「agent 能用哪些目标、在哪些目录里动手」）与标量
                         * 分开记，这样事后 grep 一次就能回答「那次是改了闸门还是改了个超时」。
                         *
                         * 顺序与 `devfront` 逐条一致：审计在**生效之后、响应之前**——写不进去时这次请求
                         * 不返回成功（不假装记下了）；代价是那一刻配置已经生效，回滚不在这一层的职责里
                         * （配置改动没有「半个生效」的危险，而撒谎说记下了会把审计从保证降成口号）。
                         */
                        auditSink().record({
                            at: Date.now(),
                            targetId: 'card',
                            action: 'targets' in normalized.patch ? 'config.targets' : 'config.scalars',
                            allowed: true,
                        });
                        writeJson(res, 200, { ok: true, config: configSnapshotFrom(live), persisted: scope !== undefined });
                    },
                });
            }, 'dsh-devenv: config route');
        });
        ctx.effect(() => {
            return () => {
                disposeTools();
                remote.disposeAll();
                if (announcementDispose !== undefined) {
                    try {
                        announcementDispose();
                    }
                    catch {
                        /* 已注销 */
                    }
                    announcementDispose = undefined;
                }
            };
        }, 'dsh-devenv: cleanup');
        // 挂载行走 stdout：运维就是**在启动日志里找这一行**确认插件挂上了（本仓其余插件的约定）。
        console.log(`[dsh-devenv] mounted (enabled=${String(live.enabled)}, targets=${String(live.targets.length)}, logTail=${String(live.logTail)}, execTimeoutMs=${String(live.execTimeoutMs)}, audit=${live.auditFile === '' ? 'log-only（写类会被 AUDIT_NOT_DURABLE 拒）' : live.auditFile})`);
    },
});
export const { name, inject, apply } = plugin;
/** 睡一会儿（`env_wait` 的轮询）。 */
function sleep(ms) {
    return new Promise((resolve) => {
        const timer = setTimeout(resolve, ms);
        timer.unref?.();
    });
}
//# sourceMappingURL=plugin.js.map