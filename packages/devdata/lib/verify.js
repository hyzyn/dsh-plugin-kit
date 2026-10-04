/**
 * 验活断言库：**清单结构 + 加载校验**（`docs/devdata-plan.md` §3.9）。
 *
 * ## 这一层解决什么
 *
 * §0 的存在理由之一是「核对发布后的业务数据」。那一环不能靠人每次现编 SQL——那样它不可积累、
 * 不可复审、也不能被 agent 自动执行。落法是把它**断言化**：断言写在**项目仓库**里
 * （`verify/<project>.yaml`），随项目一起评审、一起演进；DSH 侧**只读**。
 *
 * ## 两条判据没收进来会怎样（本模块存在的理由）
 *
 * 1. **缺省即无**：项目没有 `verify/<project>.yaml` → 这个项目**没有断言**，不是「用默认断言」。
 *    回落默认断言等于用别的项目的话去核对这个项目的数据，且**看起来是绿的**——最坏的一种错。
 * 2. **判据必须在加载时抓**：清单是配置，配置错误（操作符写错、正则不合法、断言重复 id、
 *    语句是写操作）**不该等到跑的时候才表现为一条 fail**。它既不是「数据不对」也不是「业务异常」，
 *    而是「这份清单写错了」——混在一起会让 agent 去查数据，方向就错了。
 *
 * ## 与 SQL 层的关系：注入而不是硬依赖
 *
 * 注入而不是硬依赖：语句判据由调用方传进来，默认实现是 `sql.ts` 的 `classifySql` 套一层。
 * 这样本模块可以独立测「清单校验」这件事，而 SQL 粒度的判据仍然只有一处真源。
 *
 * 依据：`docs/devdata-plan.md` §3.9（四条设计约束）、§2 的部署机制分类、`jenkins-release` 技能的 §4 噪声口径。
 */
import { isAbsolute, join, resolve } from 'node:path';
import { manifestFileName as kitManifestFileName, manifestRelPath, projectsInFiles, readProjectManifest } from '@hyzyn/dsh-kit/manifest';
import { classifySql, sqlRejectionHint } from './sql.js';
import { parseRedisCommand } from './redis-command.js';
/** 全部部署机制。 */
export const APPLIES_TO = ['backend', 'front', 'build-only'];
/** 全部严重度。 */
export const SEVERITIES = ['fail', 'warn'];
/** 期望算子。全部可**同时**给出，语义是 AND。 */
export const EXPECT_OPERATORS = ['eq', 'regex', 'gte', 'lte', 'rowCount'];
/** 走 SQL 判据的那几个引擎（各自方言不同，但「只读语句」这一层共用 `sql.ts` 那一份）。 */
const SQL_ENGINES = ['sqlserver', 'mysql', 'postgres', 'dm'];
/** 只查形状：非空。**不套 SQL 的形状规则**（理由见 `StatementClassifier`）。 */
function shapeOnly(statement) {
    return statement.trim() === '' ? '语句是空的' : undefined;
}
/**
 * Redis 语句的只读判据：**复用解析层的归类**（`parseRedisCommand` 的 `command.kind`）。
 *
 * 不另写一份「哪些 Redis 命令是读」的名单：那正是两个真相源漂开的方向（清单这一份更松）。
 * 解析层已经会拒未登记 / `never` 档 / 危险读，这里只补一句「清单只收读类」。
 */
function classifyRedisStatement(statement) {
    /*
     * 第二个参数是 `maxScanCount`（目标的配置）。加载时**不知道**它属于哪个目标的哪个值，
     * 所以给一个宽松上限：这一层判的是**只读**，扫描上限是执行层的事（目标自己那份配置说了算）。
     * 反过来在这里硬造一个默认值，就会让「清单能加载」与「这条断言真能跑」变成两套判据。
     */
    const parsed = parseRedisCommand(statement, Number.MAX_SAFE_INTEGER);
    if (!parsed.ok)
        return parsed.hint;
    if (parsed.command.kind === 'read')
        return undefined;
    return `清单里的 Redis 语句只允许读类命令（这条被解析层归为 ${parsed.command.kind}）——写类 / 危险读有专门工具入口，要过能力闸门与逐次确认`;
}
/**
 * 默认语句判据：**按引擎复用既有的那份判据**。
 *
 * 关键在「复用」而不是「再写一份」：断言库**不新增任何写能力**（§3.9 约束 1），
 * 它只是只读档的消费者。写一份自己的语句检查就是造第二个真相源——
 * 而两个真相源漂开的方向会是「断言库这一份更松」。
 */
export const classifyAssertionStatement = (statement, engine) => {
    if (engine === 'redis')
        return classifyRedisStatement(statement);
    // 引擎不知道，或这个引擎还没有语句判据（`rocketmq` 的语句判据还没做，见待办 10/11）→ 只查形状
    if (engine === 'unknown' || (engine !== undefined && !SQL_ENGINES.includes(engine)))
        return shapeOnly(statement);
    const verdict = classifySql(statement);
    if (verdict.ok)
        return undefined;
    return sqlRejectionHint(verdict);
};
/** 断言 id 的形状：小写字母数字加 `-` / `.` / `_`，且以字母数字开头（报告里好点名）。 */
const ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;
/**
 * 校验一份已解析的清单。
 *
 * **一次报全部错误**而不是遇到第一个就停：清单是给人改的，一条一条试错很贵。
 *
 * @param project - 项目名（由文件名推出；清单里的 `project` 必须与它一致）
 * @param data - YAML 解析出来的原始值
 * @param classify - 语句判据（默认 `classifyAssertionStatement`）
 * @param engineOf - 由 `target` 查引擎；**给了它**，「查不到」才会变成 `'unknown'`（见 `StatementClassifier`）
 */
export function validateManifest(project, data, classify = classifyAssertionStatement, engineOf) {
    const errors = [];
    const fail = (path, message) => {
        errors.push({ path, message });
    };
    if (!isRecord(data)) {
        return { ok: false, errors: [{ path: '', message: '清单顶层必须是一个映射（mapping）' }] };
    }
    if (data.version !== 1) {
        fail('version', `本模块只认 version: 1，拿到 ${JSON.stringify(data.version)}`);
    }
    if (data.project !== project) {
        fail('project', `清单里的 project（${JSON.stringify(data.project)}）与文件名推出的项目（${JSON.stringify(project)}）不一致——` +
            '复制清单改漏会让断言跑到别的项目上');
    }
    const raw = data.assertions;
    if (!Array.isArray(raw)) {
        fail('assertions', '`assertions` 必须是数组');
        return { ok: false, errors };
    }
    if (raw.length === 0) {
        // 空清单与「没有清单」是两件事：前者是「声明了这个项目要验活，但一条都没写」——
        // 报绿会让「核对过了」变成一句空话。
        fail('assertions', '`assertions` 是空的：要么删掉这份清单，要么把断言写上（空清单不该报绿）');
    }
    const seen = new Map();
    raw.forEach((item, index) => {
        const at = `assertions[${String(index)}]`;
        if (!isRecord(item)) {
            fail(at, '每一条断言必须是一个映射');
            return;
        }
        const id = item.id;
        if (typeof id !== 'string' || !ID_PATTERN.test(id)) {
            fail(`${at}.id`, `id 必须匹配 ${String(ID_PATTERN)}（小写字母数字，可含 . - _），拿到 ${JSON.stringify(id)}`);
        }
        else if (seen.has(id)) {
            fail(`${at}.id`, `id ${JSON.stringify(id)} 重复（第 ${String((seen.get(id) ?? 0) + 1)} 次出现）——报告里点名会指错`);
        }
        else {
            seen.set(id, index);
        }
        if (typeof item.appliesTo !== 'string' || !APPLIES_TO.includes(item.appliesTo)) {
            fail(`${at}.appliesTo`, `必须是 ${APPLIES_TO.join(' / ')} 之一，拿到 ${JSON.stringify(item.appliesTo)}`);
        }
        if (typeof item.target !== 'string' || item.target.trim() === '') {
            fail(`${at}.target`, '必须是非空的 DevDataTarget.id');
        }
        if (typeof item.statement !== 'string' || item.statement.trim() === '') {
            fail(`${at}.statement`, '必须是非空的只读语句');
        }
        else {
            const targetId = typeof item.target === 'string' ? item.target : '';
            const engine = engineOf === undefined ? undefined : (engineOf(targetId) ?? 'unknown');
            const rejected = classify(item.statement, engine);
            if (rejected !== undefined) {
                fail(`${at}.statement`, `语句没通过只读判据：${rejected}`);
            }
        }
        if (typeof item.severity !== 'string' || !SEVERITIES.includes(item.severity)) {
            fail(`${at}.severity`, `必须是 ${SEVERITIES.join(' / ')} 之一，拿到 ${JSON.stringify(item.severity)}`);
        }
        if (item.timeoutMs !== undefined) {
            if (typeof item.timeoutMs !== 'number' || !Number.isInteger(item.timeoutMs) || item.timeoutMs <= 0) {
                fail(`${at}.timeoutMs`, `必须是正整数毫秒，拿到 ${JSON.stringify(item.timeoutMs)}`);
            }
        }
        validateExpect(item.expect, `${at}.expect`, fail);
    });
    return errors.length > 0 ? { ok: false, errors } : { ok: true, manifest: data };
}
/**
 * 校验 `expect`。
 *
 * 两条刻意的严格：
 *   - **空 `expect` 拒**：一条没有任何判据的断言只会报绿——它看起来配好了，实际什么都没验；
 *   - **正则在这里就编译**：语法错的正则拖到运行时，会表现为一条 fail（「数据不对」），
 *     而真实原因是「清单写错了」。
 */
function validateExpect(value, path, fail) {
    if (!isRecord(value)) {
        fail(path, '`expect` 必须是映射（至少给一个判据）');
        return;
    }
    const keys = Object.keys(value);
    const unknownKeys = keys.filter((key) => key !== 'column' && !EXPECT_OPERATORS.includes(key));
    for (const key of unknownKeys) {
        fail(`${path}.${key}`, `未知的期望算子；本模块认 ${EXPECT_OPERATORS.join(' / ')}（外加 column）——不认识的一律拒，不静默忽略`);
    }
    const operators = EXPECT_OPERATORS.filter((op) => value[op] !== undefined);
    if (operators.length === 0) {
        fail(path, `至少给一个判据（${EXPECT_OPERATORS.join(' / ')}）——空 expect 的断言只会报绿`);
    }
    if (value.column !== undefined && (typeof value.column !== 'string' || value.column.trim() === '')) {
        fail(`${path}.column`, '给 `column` 时它必须是非空字符串');
    }
    if (value.regex !== undefined) {
        if (typeof value.regex !== 'string') {
            fail(`${path}.regex`, `必须是字符串，拿到 ${JSON.stringify(value.regex)}`);
        }
        else {
            try {
                // 只编译不执行：还没有任何数据进来，这里要抓的是「正则本身不合法」。
                new RegExp(value.regex);
            }
            catch (error) {
                fail(`${path}.regex`, `正则不合法：${error instanceof Error ? error.message : String(error)}`);
            }
        }
    }
    for (const op of ['gte', 'lte', 'rowCount']) {
        const bound = value[op];
        if (bound === undefined)
            continue;
        if (typeof bound !== 'number' || !Number.isFinite(bound)) {
            fail(`${path}.${op}`, `必须是有限数字，拿到 ${JSON.stringify(bound)}`);
        }
    }
    if (value.rowCount !== undefined && typeof value.rowCount === 'number' && Number.isFinite(value.rowCount)) {
        if (!Number.isInteger(value.rowCount) || value.rowCount < 0) {
            fail(`${path}.rowCount`, `行数必须是非负整数，拿到 ${JSON.stringify(value.rowCount)}`);
        }
    }
    if (typeof value.gte === 'number' &&
        typeof value.lte === 'number' &&
        Number.isFinite(value.gte) &&
        Number.isFinite(value.lte) &&
        value.gte > value.lte) {
        fail(`${path}`, `gte (${String(value.gte)}) 大于 lte (${String(value.lte)})：这条断言永远不可能通过`);
    }
    if (typeof value.rowCount === 'number' && typeof value.lte === 'number' && value.rowCount > value.lte) {
        // `rowCount` 与 `lte` 都作用在行数上，写反了就是自相矛盾。指出来，别让它静默恒假。
        fail(`${path}`, `rowCount (${String(value.rowCount)}) 大于 lte (${String(value.lte)})：两者都作用在行数上，不可能同时成立`);
    }
}
/** 判断一个值是不是普通对象（YAML 映射解析出来的形态）。 */
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
/**
 * 清单的文件名（**唯一一处**）：`verify/<project>.yaml`。
 *
 * 只认 `.yaml` 不认 `.yml`：一份清单两个可能的文件名会让「有没有清单」这件事有两种答案，
 * 而「缺省即无」是这一层的安全判据——歧义在这里的代价是静默地无断言。
 */
export function manifestFileName(project) {
    return kitManifestFileName(project, '.yaml');
}
/** 清单在项目里的相对路径：`verify/<project>.yaml`。 */
export function manifestRelativePath(project) {
    return manifestRelPath('verify', project, '.yaml');
}
/**
 * 扫一遍「哪些项目真的有清单」。
 *
 * 输入是**已经列好的文件名**（不读目录——本模块不做 I/O，保持可测）。
 * 返回项目名 → 文件名的对应；非 `verify/<project>.yaml` 的文件一律忽略。
 *
 * 实现在 `@hyzyn/dsh-kit/manifest`（与 `devfront` / `devenv` 同一份）；这里只是把本包的
 * 目录与后缀绑上。
 */
export function projectsWithManifest(files) {
    return projectsInFiles(files, { prefix: 'verify/', suffix: '.yaml' });
}
/**
 * 从项目里读一份清单（**只读**，不写、不改、不生成模板）。
 *
 * 三种「读不到」刻意分开（见 `ManifestLoad`）：它们的处置完全不同。
 *
 * YAML 用 `JSON_SCHEMA`：清单是**配置数据**，不是「能求值的表达式」。
 * 默认 schema 会把 `!!js` 一类标签放进来——那等于把「断言」变成「脚本」，评审面完全不同。
 */
export function loadManifest(project, options = {}) {
    const roots = options.roots ?? ['.'];
    const classify = options.classify ?? classifyAssertionStatement;
    // 读清单这件事（候选路径 / JSON_SCHEMA / 五种「读不到」）在 `@hyzyn/dsh-kit/manifest`，
    // 与 `devfront` / `devenv` 同一份；这里只把它翻成本包的结果与文案。
    const candidates = roots.map((root) => join(isAbsolute(root) ? root : resolve(root), 'verify', manifestFileName(project)));
    const read = readProjectManifest(candidates);
    if (read.kind === 'missing')
        return { kind: 'no-manifest', project };
    if (read.kind === 'multiple') {
        return {
            kind: 'unreadable',
            project,
            message: `在多个根目录下都找到了 ${manifestRelativePath(project)}：${read.files.join('、')}——两份清单是歧义，请只留一份`,
        };
    }
    if (read.kind === 'unreadable') {
        return { kind: 'unreadable', project, message: `读不到 ${read.file}：${read.message}` };
    }
    if (read.kind === 'malformed') {
        return { kind: 'unreadable', project, message: `${read.file} 的 YAML 语法错：${read.message}` };
    }
    if (read.kind === 'empty') {
        // 空文件不是「无断言」——文件在，说明有人打算写断言。报配置错，让人补上或删掉。
        return { kind: 'config-error', project, errors: [{ path: '', message: `${read.file} 是空的：要么写上断言，要么删掉它（空文件与「没有清单」是两件事）` }] };
    }
    const validated = validateManifest(project, read.data, classify, options.engineOf);
    return validated.ok ? { kind: 'ok', manifest: validated.manifest } : { kind: 'config-error', project, errors: validated.errors };
}
//# sourceMappingURL=verify.js.map