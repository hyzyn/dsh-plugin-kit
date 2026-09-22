import z from '@deepseek-ai/schemastery';
import { createOutputDecoder, definePlugin, dshHome, isLoopbackRequest, jsYamlSchema, killProcessTree, readJsonBody, spawnPortable, writeFileAtomic, writeJson, } from '@hyzyn/dsh-kit';
import { closeSync, existsSync, openSync, readdirSync, readFileSync, readSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import yaml from 'js-yaml';
/* ------------------------------------------------------------------ *
 * settings 命名空间（让「插件配置 → 插件配置」派发本插件卡片）
 *
 * 这里只列「卡片派发所需 + 允许用户在 settings 里覆盖」的字段：字段一律不带
 * schema 默认值——settings 的 resolved 值里「undefined」才表示「用户没设过」，
 * 有默认值就会把 settings 默认值误当成用户覆盖，反过来压掉 plugin config。
 * 真正从 settings 读取的只有 defaultPath / mcpIntegration（见 resolveStored）。
 * 安装级旋钮（command / 超时 / indexForce）只走 plugin config，不进本 schema。
 *
 * schema 里**没有** enabled / command（CG24）：它们曾经被声明、却从未被
 * resolveStored 读取——同名两处、只有一处生效，是纯误导。真要开关整个插件，
 * 用插件配置里的 enabled。
 * ------------------------------------------------------------------ */
const CODEGRAPH_SETTINGS_SCHEMA = z.object({
    announceToAgent: z.boolean(),
    usageGuidance: z.boolean(),
    followSession: z.boolean(),
    defaultPath: z.string(),
    mcpIntegration: z.boolean(),
});
/* ------------------------------------------------------------------ *
 * 常量与类型
 * ------------------------------------------------------------------ */
/** 请求体上限：卡片只发一个小 JSON，512KB 足够；kit 的默认值是 1MB，这里显式收紧。 */
const MAX_JSON_BODY_BYTES = 512 * 1024;
const MAX_BUFFER = 20 * 1024 * 1024;
/** 查询类命令的默认超时。 */
const DEFAULT_CLI_TIMEOUT_MS = 60_000;
/** 索引类命令的默认超时：全量重建在大仓库上远超查询档。 */
const DEFAULT_INDEX_TIMEOUT_MS = 600_000;
/** CLI 可用性探测的超时（毫秒）：只决定要不要注入提示词，慢/挂住一律当不可用。 */
const CLI_PROBE_TIMEOUT_MS = 5_000;
/**
 * 诊断包（ROADMAP P1-b）读 daemon 日志的上限：只取尾部若干字节再按行截断。
 * 不整份读——daemon 是常驻进程，日志会一直长，而诊断包里只需要「最近发生了什么」。
 */
const DIAGNOSTIC_LOG_TAIL_BYTES = 8 * 1024;
const DIAGNOSTIC_LOG_TAIL_LINES = 40;
/** 本包版本：诊断包第一行要能回答「你装的是哪个版本」（mcp 包同款读法）。 */
const PLUGIN_VERSION = (() => {
    try {
        const pkg = createRequire(import.meta.url)('../package.json');
        return typeof pkg.version === 'string' ? pkg.version : 'unknown';
    }
    catch {
        return 'unknown';
    }
})();
/**
 * 文件探索类工具名（**保守**列表，只收「这件事本可以交给 codegraph_explore」的那几个）。
 *
 * 为什么不能把 bash 也算进来：模型用 bash 干的事大部分与代码探索无关（跑测试、
 * 装依赖、git 操作），把它计进分母会把采纳率系统性压低，得出「codegraph 没人用」
 * 的错误结论——而这种错误最难发现，因为数字看起来很正常。
 *
 * 命名按「后缀/子串匹配」处理（`read_file` / `file_read` / `readFile` 都算），
 * 因为各 harness 与自定义工具的命名并不统一。
 */
const FILE_TOOL_PATTERNS = [
    /(^|_)grep($|_)/i,
    /(^|_)glob($|_)/i,
    /find[_ ]?(file|files|by)/i,
    /^find$/i,
    /(^|_)(read|view|open)([_ ]?(file|files|source|code))?$/i,
    /(^|_)list[_ ]?(dir|directory|files)/i,
    /(^|_)search($|_)/i,
];
/**
 * 明确**不算**探索的：媒体 / 网络 / 文档读取，以及任何 web 类工具。
 *
 * 这条是拿真实历史会话量过之后补的：第一版只看「read / search」这些词根，于是
 * `read_image`（248 次）、`read_pdf`、`web_search`（19 次）全被算进了分母——
 * 读一张截图、搜一次网页，跟「本可以交给 codegraph 的代码探索」毫无关系。
 * 全机历史里这一个错误就把分母灌了 11%，把采纳率从 2.2% 压到 2.0%。
 * 判定顺序上它**先于** FILE_TOOL_PATTERNS：宁可漏收（少算分母），不要错收。
 */
const NON_EXPLORATORY_PATTERNS = [
    /web[_ ]?(search|fetch|browse|request)/i,
    /(^|_)(image|img|photo|screenshot)/i,
    /(^|_)(pdf|audio|video|media)/i,
    /^fetch/i,
];
/** codegraph 工具的判定：MCP 命名空间 `mcp__<server>__<tool>`，server 为 codegraph。 */
const CODEGRAPH_TOOL = /^mcp__codegraph(_|__)/i;
/**
 * 纯函数：把一次工具调用归类。
 *
 * 判定顺序（每一步都有理由）：
 *   1. codegraph 优先——万一某个自定义工具名两头都沾，宁可记成 codegraph
 *      （少算分母＝对既有实现更保守）；
 *   2. 媒体 / web 类直接判 other，不参与分母；
 *   3. 其余按文件探索模式匹配。
 */
export function bucketToolCall(name) {
    if (typeof name !== 'string' || name.trim() === '')
        return 'other';
    const trimmed = name.trim();
    if (CODEGRAPH_TOOL.test(trimmed))
        return 'codegraph';
    if (NON_EXPLORATORY_PATTERNS.some((pattern) => pattern.test(trimmed)))
        return 'other';
    if (FILE_TOOL_PATTERNS.some((pattern) => pattern.test(trimmed)))
        return 'file';
    return 'other';
}
export const emptyCounts = () => ({ codegraph: 0, file: 0, discovery: 0, other: 0 });
/**
 * 发现类工具名：真正的「找东西」调用，窄口径采纳率的分母。
 * 与 `FILE_TOOL_PATTERNS` 的区别是这里**排除**了 `read` / `view` / `open`。
 */
const DISCOVERY_TOOL = /^(grep|grep_search|glob|glob_search|search|search_code|code_search|find|find_files|find_by_name|list_dir|list_directory|list_files)$/i;
/**
 * 纯函数：把一次工具调用折进表里，返回新的计数（不修改入参）。
 *
 * 为什么按键为「项目根」而不是会话 id：采纳率要回答的是「**这个仓库**里模型用不用
 * codegraph」，而同一个仓库可以有很多会话（换会话、开子 agent、重启宿主）。按会话
 * 分会把数据打散成一堆都不到 10 次的小样本，没有统计意义。项目根的解析口径与
 * 托管行 cwd、注入门禁完全一致（`resolveIndexedRoot` 命中祖先索引），所以
 * 「仪表说这个项目已索引」与「提示词确实注入了」永远同步。
 */
export function foldToolCall(table, name, projectKey) {
    const bucket = bucketToolCall(name);
    const current = table.get(projectKey) ?? emptyCounts();
    const isDiscovery = typeof name === 'string' && DISCOVERY_TOOL.test(name.trim());
    const next = {
        ...current,
        [bucket]: current[bucket] + 1,
        ...(bucket === 'file' && isDiscovery ? { discovery: current.discovery + 1 } : {}),
    };
    const out = new Map(table);
    out.set(projectKey, next);
    return out;
}
export function summarizeAdoption(project, counts, indexed) {
    const exploratory = counts.codegraph + counts.file;
    const discoveryTotal = counts.codegraph + counts.discovery;
    return {
        project,
        indexed,
        codegraph: counts.codegraph,
        file: counts.file,
        discovery: counts.discovery,
        other: counts.other,
        exploratory,
        discoveryTotal,
        rate: exploratory === 0 ? undefined : counts.codegraph / exploratory,
        discoveryRate: discoveryTotal === 0 ? undefined : counts.codegraph / discoveryTotal,
    };
}
/** 把采纳率拍成一句人话（卡片与诊断包共用，避免两处文案漂移）。 */
export function describeAdoption(summary) {
    if (summary.discoveryTotal === 0 && summary.file === 0) {
        return '本次宿主运行期间该项目还没有探索类工具调用（既没用 codegraph，也没用 grep/read 这类）';
    }
    const indexedNote = summary.indexed === false ? '（该项目未索引，这个数字不代表提示词效果）' : '';
    // 窄口径是主口径：`read` 占宽口径分母的绝大多数，用宽口径会得出「codegraph 没用」
    // 的错误结论（实测 2.2% vs 28.8%，见 ADOPTION-AUDIT.md）。
    if (summary.discoveryTotal === 0) {
        return `采纳率：还没有发现类调用（codegraph ${summary.codegraph} 次 / 读取 ${summary.file} 次）${indexedNote}`;
    }
    const percent = Math.round((summary.discoveryRate ?? 0) * 100);
    // 宽口径只在与窄口径**不同**时才值得占字符：读取数为 0 时两个口径等价，
    // 再写一遍是纯噪音（诊断包与卡片都是按行读的）。
    const broadNote = summary.file === 0 ? '' : `（宽口径含读取共 ${summary.file} 次，${Math.round((summary.rate ?? 0) * 100)}%）`;
    const otherNote = summary.other === 0 ? '' : `（另 ${summary.other} 次其它工具）`;
    return `采纳率：codegraph ${summary.codegraph} 次 / 发现类 ${summary.discovery} 次 → ${percent}%${broadNote}${otherNote}${indexedNote}`;
}
/* ------------------------------------------------------------------ *
 * MCP 服务器行托管（~/.dsh/cordis.patch.yml）
 *
 * 行形状与 @hyzyn/dsh-mcp 写出的托管区块一致（loader 侧都是
 * @deepseek-ai/dsh-mcp-client 插件实例）。优先复用 dsh-mcp 托管区块里
 * 用户自己加的 codegraph 行（只补 cwd），没有才写本插件自己的区块，
 * 避免 serverName 重名导致第二个实例加载失败。写在区块外的手工行只
 * 检测不碰。目标路径没有 .codegraph/ 时绝不改写现有 cwd（不把好配置
 * 改坏），也不凭空建行。
 *
 * 为什么不用 @hyzyn/dsh-kit 的 spliceManagedBlock：那个通用实现按「整行精确
 * 匹配」定位标记、以文本进出，而这里需要的是
 *   1) 容错匹配（历史版本 / 手改过的标记行仍要认出来，避免追加出第二个区块）；
 *   2) 保留原标记行文本（重写时 markerStart/markerEnd 原样回填）；
 *   3) 在同一次决策里同时读改「本插件区块」与「dsh-mcp 卡片区块」两个区块并做
 *      serverName 冲突判定。
 * 换成通用版会在这三点上回归，因此这里保留自己的纯函数决策矩阵（有 10 条用例
 * 覆盖）；区块的落盘仍走 kit 的 writeFileAtomic。
 * ------------------------------------------------------------------ */
const MCP_CLIENT_PACKAGE = '@deepseek-ai/dsh-mcp-client';
const MCP_ROW_ID = 'mcp-codegraph-managed';
const MCP_SERVER_NAME = 'codegraph';
const OWN_BLOCK_START = '# --- dsh-codegraph mcp managed (auto-generated; do not edit) ---';
const OWN_BLOCK_END = '# --- end dsh-codegraph mcp managed ---';
/** @hyzyn/dsh-mcp 托管区块的识别子串（与其源码的 findIndex 逻辑一致）。 */
const DSH_MCP_BLOCK_KEY = 'dsh-mcp-config managed';
const DSH_MCP_BLOCK_END_KEY = 'end dsh-mcp-config managed';
const homePatchPath = () => join(dshHome(), 'cordis.patch.yml');
/** codegraph 的索引目录名（与其 CLI 约定一致）。 */
const INDEX_DIR = '.codegraph';
/**
 * 索引库文件后缀：SQLite 主库 `codegraph.db`。它的附属文件是 `codegraph.db-wal`
 * 与 `codegraph.db-shm`——**不以 `.db` 结尾**，天然不会命中（旧注释写「三者都以此
 * 结尾」是错的，实测 `ls .codegraph` 可证，CG20）。按后缀而不是写死主库名匹配：
 * 索引库文件名可能随 CLI 版本变化。
 */
const INDEX_DB_SUFFIX = '.db';
/**
 * 判定项目索引，并把命中根一起带出来（CG02）。
 *
 * 两件事都不能只看「本目录有没有 `.codegraph/`」：
 *
 * 1. **向上解析**：CLI 自己从 `--path` 向上找 `.codegraph/`（`codegraph status --json
 *    -- packages/codegraph` 实测返回 `projectPath=<仓库根>`、`initialized:true`）。旧的
 *    只看本目录实现让 monorepo 子目录里的会话永远判定「未索引」：followSession 永久回落、
 *    「设为默认项目」回 400 还诱导用户在子目录里再 init 一份嵌套索引、卡片同一屏先说
 *    「已索引」又说「不是有效索引」。现在与 CLI 同口径：从 path 向上走到**git 根为止**
 *    （没有 .git 就走到文件系统根），命中第一个带索引库的 `.codegraph/` 即 indexed，
 *    根就是那个目录。monorepo 里托管行的 cwd 因此钉在**仓库根**上——CLI 从那里向上
 *    找得到，从子目录向上也找得到，两边等价，但根才是「项目」。
 * 2. **不能把家目录算成项目**：codegraph CLI 的安装目录就是 `~/.codegraph`（`current ->
 *    versions/<v>`、`bundles/`、`codegraph.lock`，没有任何 .db）。按目录存在判会把
 *    MCP 的 cwd 钉在家目录上并报告一切正常，而 `codegraph status --json -- ~` 实际
 *    返回 `initialized:false`。所以一路向上遇到第一个 `.codegraph/`（不管有没有库）
 *    就停——它是 CLI 的停止点：有库 → indexed；没库 → not-a-project。
 *
 * 读目录失败（权限等）按「此处没有」处理继续向上——宁可不动现有 cwd，也不把好配置改坏。
 */
export function locateIndex(path) {
    let current = path;
    for (;;) {
        let entries;
        try {
            entries = readdirSync(join(current, INDEX_DIR));
        }
        catch {
            entries = undefined;
        }
        if (entries !== undefined) {
            // 第一个 .codegraph/ 是 CLI 的停止点：有索引库 → 命中；没有 → 不是项目（家目录形状）
            if (entries.some((name) => name.endsWith(INDEX_DB_SUFFIX)))
                return { state: 'indexed', projectPath: current };
            return { state: 'not-a-project' };
        }
        // git 根是项目边界：根之上的索引属于另一个仓库，不该被本目录认领
        if (existsSync(join(current, '.git')))
            return { state: 'missing' };
        const parent = dirname(current);
        if (parent === current)
            return { state: 'missing' };
        current = parent;
    }
}
/** 只取状态的便捷形式（既有导出，保持签名不变）。 */
export function indexState(path) {
    return locateIndex(path).state;
}
/**
 * 命中已索引时返回项目根（可能向上跳了几级），否则 undefined。
 * 「设为默认项目」与托管行 cwd 都用根：绑定子目录会把索引钉在半山腰（CG02）。
 */
export function resolveIndexedRoot(path) {
    const found = locateIndex(path);
    return found.state === 'indexed' ? found.projectPath : undefined;
}
/** 未索引时拼进状态 note 的原因描述（点名家目录这个最常见的坑）。 */
function indexProblem(state) {
    return state === 'not-a-project'
        ? '的 .codegraph/ 里没有索引库，不是 codegraph 项目（家目录最常见：~/.codegraph 是 CLI 自身的安装目录）'
        : '及其祖先（到 git 根为止）都没有 .codegraph/ 索引';
}
function probePath(path) {
    try {
        const stat = statSync(path);
        return { path, exists: true, isDirectory: stat.isDirectory() };
    }
    catch (error) {
        const code = error.code;
        // ENOENT 是「确实没有」，与权限等错误分开——这是排查时最常要区分的一对
        return code === 'ENOENT' ? { path, exists: false } : { path, exists: false, readError: error instanceof Error ? error.message : String(error) };
    }
}
/** 目录条目名（读不到给 undefined，由调用方带出原因）。 */
function listEntries(path) {
    try {
        return readdirSync(path);
    }
    catch {
        return undefined;
    }
}
/**
 * 读文件尾部：先 stat 再定位到尾部偏移读，避免把几 MB 的 daemon 日志整个读进内存。
 * 返回原始文本（由调用方按行截断），读不到时返回 undefined。
 */
function readTail(path, maxBytes) {
    let fd;
    try {
        const size = statSync(path).size;
        const start = Math.max(0, size - maxBytes);
        const length = size - start;
        if (length <= 0)
            return '';
        const buffer = Buffer.alloc(length);
        fd = openSync(path, 'r');
        readSync(fd, buffer, 0, length, start);
        return buffer.toString('utf8');
    }
    catch {
        return undefined;
    }
    finally {
        if (fd !== undefined) {
            try {
                closeSync(fd);
            }
            catch {
                /* 关不上不阻塞诊断 */
            }
        }
    }
}
/**
 * 诊断包里摘出的补丁原文：**只摘 codegraph 相关的两个区块**，且按**键名**脱敏。
 *
 * 为什么不整份贴出来：`~/.dsh/cordis.patch.yml` 是**所有** MCP 服务器共用的文件，
 * 别家的行里可能有 `headers`（带 token）/ `env` 这类值。诊断包是要贴进 issue 或
 * 发给别人的，整份导出等于顺手把别人的凭据也发出去。
 *
 * 为什么不是「值一律替换」（第一版就是这么写的，真机跑一遍才发现）：那样会把
 * `serverName` / `cwd` / `command` / `id` 也糊成 `<redacted>`——而这几个恰恰是
 * 排查要看的东西（serverName 撞名、cwd 钉错目录、command 不在 PATH 全在这里）。
 * 改成**按白名单放行、其余一律脱敏**：白名单里的键名本身不可能承载凭据。
 *
 * 为什么保留原始行而不是 dump YAML：排查要看「有没有两个 serverName 行、标记行
 * 是否被手改过、缩进对不对」，重新 dump 会把这些痕迹洗掉。
 */
function renderPatchExcerpt() {
    const file = homePatchPath();
    const probe = probePath(file);
    if (!probe.exists)
        return ['(文件不存在)'];
    let text;
    try {
        text = readFileSync(file, 'utf8');
    }
    catch (error) {
        return ['(读不到: ' + (error instanceof Error ? error.message : String(error)) + ')'];
    }
    const lines = text.split('\n');
    const ranges = [
        { label: '本插件区块', range: findBlock(lines, 'dsh-codegraph mcp managed', 'end dsh-codegraph mcp managed') },
        { label: 'dsh-mcp 卡片区块', range: findBlock(lines, DSH_MCP_BLOCK_KEY, DSH_MCP_BLOCK_END_KEY) },
    ];
    const out = [];
    for (const { label, range } of ranges) {
        if (range === null) {
            out.push(`[${label}] 不存在`);
            continue;
        }
        out.push(`[${label}] 第 ${range.start + 1}–${range.end} 行（敏感键的值已脱敏）`);
        out.push(...redactPatchLines(lines.slice(range.start, range.end)));
    }
    return out;
}
/**
 * 放行的键名：这些值是我们排查时真正要看的，且键名本身不可能承载凭据。
 * 不在表里的键（含未来新增的）一律脱敏——**fail-closed**：宁可少看见一个值，
 * 也不能把别家服务器的 token 带进 issue。
 */
const PATCH_SAFE_KEYS = new Set([
    'id',
    'name',
    'servername',
    'transport',
    'command',
    'args',
    'cwd',
    'disabled',
    'enabled',
]);
/**
 * 键名命中这里 → 它的**整棵子树**都要脱敏（`env:` 下的每个变量、`headers:` 下的
 * 每个 header 都算）。`key` 单独列出来是因为 `apiKey` / `keyFile` 这类写法；
 * `url` 也列进去（URL 里常带 token 查询串）。
 */
const PATCH_SENSITIVE_KEY = /auth|header|token|secret|password|passwd|credential|cookie|key|env|url/i;
/** 一行的键名（`key:` / `- key:` 两种形状）；取不到时 undefined。 */
function patchLineKey(line) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#'))
        return undefined;
    const body = trimmed.startsWith('- ') ? trimmed.slice(2) : trimmed;
    const index = body.indexOf(':');
    if (index <= 0)
        return undefined;
    const key = body.slice(0, index).trim();
    return key === '' ? undefined : key;
}
/**
 * 按行脱敏，维护一个「缩进 → 是否敏感」的栈。三条规则：
 *
 *  1. **容器行**（`key:` 后面没有值）本身不判断白名单——`config:` 这种结构性键
 *     必然不在白名单里，若也按「未知即敏感」处理，整个子树会被糊掉（第一版就
 *     踩了这个：真机跑出来 `serverName` 也成了 `<redacted>`）。容器只在
 *     **键名命中敏感词**时污染整棵子树（`headers:` / `env:` / `tokens:`）。
 *  2. **叶子行**（`key: value`）走白名单：白名单键留值（`serverName` / `cwd` /
 *     `command`…），其余一律 `<redacted>`——**fail-closed**，将来新增的凭据字段
 *     默认是安全的。
 *  3. **裸序列项**（`- xxx`，没有键）在敏感子树里整条替换，否则原样（`args` 的
 *     `- serve` 要看得见）。
 */
function redactPatchLines(lines) {
    const out = [];
    /** [缩进宽度, 该子树是否敏感] */
    const stack = [];
    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed === '' || trimmed.startsWith('#')) {
            out.push('  ' + line);
            continue;
        }
        const indent = line.length - line.trimStart().length;
        // 同级或更浅 = 离开之前的子树
        while (stack.length > 0 && stack[stack.length - 1][0] >= indent)
            stack.pop();
        const parentSensitive = stack.length > 0 ? stack[stack.length - 1][1] : false;
        const isItem = trimmed.startsWith('- ');
        const key = patchLineKey(line);
        const colon = line.indexOf(':', isItem ? line.indexOf('- ') + 2 : 0);
        const hasValue = colon !== -1 && line.slice(colon + 1).trim() !== '';
        const nameSensitive = key !== undefined && PATCH_SENSITIVE_KEY.test(key);
        if (!hasValue) {
            if (key !== undefined)
                stack.push([indent, parentSensitive || nameSensitive]);
            out.push('  ' + line);
            continue;
        }
        if (key === undefined) {
            out.push(parentSensitive ? '  - <redacted>' : '  ' + line);
            continue;
        }
        const keep = !parentSensitive && !nameSensitive && PATCH_SAFE_KEYS.has(key.toLowerCase());
        out.push(keep ? '  ' + line : '  ' + line.slice(0, colon + 1) + ' <redacted>');
    }
    return out;
}
/** 进程是否还活着（EPERM 也算活着——存在但无权发信号）。 */
function processAlive(pid) {
    if (!Number.isInteger(pid) || pid <= 0)
        return false;
    try {
        process.kill(pid, 0);
        return true;
    }
    catch (error) {
        return error.code === 'EPERM';
    }
}
/**
 * 收集 daemon 线索：`~/.codegraph/daemon.pid`（全局）+ `~/.codegraph/daemons/*.json`（按项目）。
 *
 * 两个位置都要看：本机实测全局 `daemon.pid` 记着 pid 76609 而该进程已 ESRCH，同时
 * `daemons/bbb978…json` 里还有第二个实例（pid 58981，root = 本仓库）——只看一处会得出
 * 「没有 daemon」的错误结论。
 */
function collectDaemons(home) {
    const pidFile = probePath(join(home, 'daemon.pid'));
    const entries = [];
    const dir = join(home, 'daemons');
    const names = listEntries(dir);
    if (names !== undefined) {
        for (const name of names.sort()) {
            if (!name.endsWith('.json'))
                continue;
            const file = join(dir, name);
            try {
                const parsed = JSON.parse(readFileSync(file, 'utf8'));
                const pid = typeof parsed.pid === 'number' ? parsed.pid : undefined;
                entries.push({
                    file,
                    root: typeof parsed.root === 'string' ? parsed.root : undefined,
                    pid,
                    version: typeof parsed.version === 'string' ? parsed.version : undefined,
                    startedAt: typeof parsed.startedAt === 'number' ? parsed.startedAt : undefined,
                    alive: pid === undefined ? undefined : processAlive(pid),
                });
            }
            catch (error) {
                entries.push({ file, error: error instanceof Error ? error.message : String(error) });
            }
        }
    }
    const tail = readTail(join(home, 'daemon.log'), DIAGNOSTIC_LOG_TAIL_BYTES);
    return {
        pidFile,
        entries,
        logTail: tail === undefined
            ? undefined
            : tail.trimEnd().split('\n').slice(-DIAGNOSTIC_LOG_TAIL_LINES),
    };
}
/**
 * 把 daemon 线索拍成纯文本（人读 + 贴 issue 用）。
 * 刻意不「美化」成一句话：排查者需要的是 pid / root / 存活与否的原文。
 */
function renderDaemons(home) {
    const info = collectDaemons(home);
    const lines = [`daemon.pid: ${info.pidFile.exists ? '存在' : '不存在'}`];
    if (info.pidFile.readError !== undefined)
        lines.push(`  ⚠ 读不到: ${info.pidFile.readError}`);
    if (info.pidFile.exists) {
        try {
            const parsed = JSON.parse(readFileSync(info.pidFile.path, 'utf8'));
            const pid = typeof parsed.pid === 'number' ? parsed.pid : undefined;
            lines.push(`  pid=${String(parsed.pid)} version=${String(parsed.version)} socketPath=${String(parsed.socketPath)}`);
            if (pid !== undefined)
                lines.push(`  pid ${pid} 现在${processAlive(pid) ? '存活' : '已不存在（ESRCH）——登记是陈旧的，坏锁常与此有关'}`);
        }
        catch (error) {
            lines.push(`  ⚠ 解析失败: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    if (info.entries.length === 0) {
        lines.push('daemons/: 没有登记项（或目录不存在）');
    }
    else {
        lines.push(`daemons/: ${info.entries.length} 个登记项`);
        for (const entry of info.entries) {
            if (entry.error !== undefined) {
                lines.push(`  - ${entry.file}: ⚠ ${entry.error}`);
                continue;
            }
            lines.push(`  - root=${entry.root ?? '(未记)'} pid=${entry.pid ?? '(未记)'} version=${entry.version ?? '(未记)'}`
                + (entry.alive === true ? ' · pid 存活' : entry.alive === false ? ' · pid 已不存在' : ''));
        }
    }
    if (info.logTail !== undefined) {
        lines.push(`daemon.log 尾 ${info.logTail.length} 行：`);
        for (const line of info.logTail)
            lines.push('  ' + line);
    }
    return lines;
}
/**
 * js-yaml 方言：!!js 类型与 schema 都取自 kit（`jsYamlSchema` 即
 * `JSON_SCHEMA.extend(JsExprType)`）。js-yaml 全仓锁在同一版本，kit 与本包解析到
 * 同一个实例，schema 与 Type 不会跨副本；dsh-app-boot / dsh-mcp / loader 侧方言
 * 一致，含 `!!js` 表达式的行 load → dump 无损往返。
 */
const YAML_SCHEMA = jsYamlSchema;
function findBlock(lines, startKey, endKey) {
    // CG19：不能用裸 includes——本插件结束标记行（`# --- end dsh-codegraph mcp managed
    // ---`）同样包含开始关键子 `dsh-codegraph mcp managed`。开始标记先被删、只剩结束
    // 标记时，旧行为把结束标记当块头，解析不出行就走「新建」分支再追加完整区块，
    // 文件里留下一对错配的孤儿标记。开始行必须含 startKey 且**不含** endKey。
    const start = lines.findIndex((line) => line.includes(startKey) && !line.includes(endKey));
    if (start === -1)
        return null;
    const end = lines.findIndex((line, index) => index > start && line.includes(endKey));
    return {
        start,
        end: end === -1 ? start + 1 : end + 1,
        markerStart: lines[start],
        markerEnd: end === -1 ? '' : lines[end],
    };
}
function parseBlockRows(lines, range) {
    const bodyEnd = range.end === range.start + 1 && range.markerEnd === '' ? range.start + 1 : range.end - 1;
    const block = lines.slice(range.start + 1, bodyEnd).join('\n');
    if (block.trim() === '' || block.split('\n').every((line) => line.trim() === '' || line.trim().startsWith('#')))
        return { rows: [] };
    try {
        const parsed = yaml.load(block, { schema: YAML_SCHEMA });
        if (!Array.isArray(parsed))
            return { rows: [], error: '区块体不是 YAML 数组' };
        const rows = [];
        for (const entry of parsed) {
            if (typeof entry !== 'object' || entry === null)
                continue;
            const inserted = entry.insert;
            // CG03：`insert` 不是数组的条目（如 `- id: x` + `config:` 的 override 形状）是
            // loader 的合法输入，不是错误——它们只是不由本插件管理，原样留在文件里。
            if (!Array.isArray(inserted))
                continue;
            for (const row of inserted) {
                if (typeof row === 'object' && row !== null && !Array.isArray(row))
                    rows.push(row);
            }
        }
        return { rows };
    }
    catch (error) {
        return { rows: [], error: 'YAML 解析失败: ' + (error instanceof Error ? error.message : String(error)) };
    }
}
function renderBlockBody(rows) {
    if (rows.length === 0)
        return '- insert: []\n';
    const patches = rows.map((row) => ({ insert: [row] }));
    return yaml.dump(patches, { schema: YAML_SCHEMA, lineWidth: -1, noRefs: true });
}
/**
 * 文件主行尾是不是 CRLF。
 *
 * 调用方按 `\n` 切行，所以 CRLF 文件里每行末尾留着一个 `\r`。重写区块时必须沿用
 * 这个行尾：否则在同一份文件里会写出「标记行 CRLF + 块体 LF」的混合行尾——YAML
 * 照样能解析、二次同步也幂等，但在编辑器与 git 里整块显示成改动（Windows 上手工
 * 编辑过 cordis.patch.yml 就会踩到）。空行不计票，避免结尾换行左右判定。
 */
function usesCarriageReturn(lines) {
    let crlf = 0;
    let lf = 0;
    for (const line of lines) {
        if (line === '')
            continue;
        if (line.endsWith('\r'))
            crlf += 1;
        else
            lf += 1;
    }
    return crlf > lf;
}
/**
 * 区块整体（含标记行）切成行数组。
 *
 * `trailingBlank` 只在区块被追加/正好落在文件末尾时才为 true：join('\n') 之后需要一个
 * 结尾空行保住文件末尾换行。替换已有区块时不能补——区块后面本来就有行，再补一个空行会
 * 让每次首次重写都凭空多出一行（旧实现恒定补，实测重写后文件多一个空行）。
 */
function renderBlockLines(range, rows, carriageReturn, trailingBlank) {
    // 标记行沿用原文（可能带 \r），先剥掉再统一按目标行尾补，避免写出 `\r\r`
    const markerStart = (range?.markerStart ?? OWN_BLOCK_START).replace(/\r$/, '');
    const markerEnd = (range?.markerEnd ?? OWN_BLOCK_END).replace(/\r$/, '');
    const bodyLines = renderBlockBody(rows).split('\n');
    if (bodyLines[bodyLines.length - 1] === '')
        bodyLines.pop();
    // 空串是「文件结尾的换行」占位，不加行尾；markerEnd 为空串时（自愈缺结束标记的
    // 区块）同样不能加成一行孤立的 \r
    const suffix = carriageReturn ? '\r' : '';
    const withEol = (line) => (line === '' ? '' : line + suffix);
    const block = [withEol(markerStart), ...bodyLines.map(withEol), withEol(markerEnd)];
    return trailingBlank ? [...block, ''] : block;
}
/**
 * 是不是「会被 codegraph 占用 serverName 的行」（CG18）。
 *
 * 只按 `config.serverName` 判定：dsh-mcp-client 的实例冲突就是按 serverName 算的
 * （同名两个实例抢同一套 `mcp__codegraph__*` 工具名，第二个加载必失败）。旧的实现
 * 还要求 `name` 精确等于 `@deepseek-ai/dsh-mcp-client`——换了包名的 codegraph 行
 * （改名 fork / 未来换发布渠道）就检不出冲突，插件照写自己的托管行，两个实例在
 * loader 里撞名。
 */
function isCodegraphServerRow(row) {
    return row.config?.serverName === MCP_SERVER_NAME;
}
/**
 * 定点改写区块里 codegraph 行的 `cwd`，返回行编辑列表；定位不到时返回 null（CG03）。
 *
 * 为什么不做整块重写：dsh-mcp 托管区块是**别人的**区块——里面除了 codegraph 行，
 * 还有用户其它的 MCP 服务器行、loader 合法的 override 条目（`- id: x` + `config:`）
 * 和注释。旧的「解析出 rows → yaml.dump 整块重写」只保留 insert 为数组的行，上面
 * 这些全在一次「只是改了下 cwd」的同步里静默蒸发。这里改成文本手术：定位
 * `serverName: codegraph` 所在的行条目，只替换它的 `cwd:` 行（或就地补一行），
 * 区块里其余字节一律不动。
 *
 * 定位规则：从 serverName 行向**上下两个方向**找 `cwd:`，它必须与 serverName
 * **同缩进**（config 映射的兄弟键；更深层的是别的映射的键，比如 env 子映射里恰好
 * 叫 cwd 的变量，不能误伤）；缩进变小即离开本行条目，所以不会跨进相邻的行。
 * 上下都扫是 CG31 的教训：`cwd:` 写在 `serverName:` **之前**（YAML 键序自由）时，
 * 只向下扫会找不到、在 serverName 后面补出第二个 `cwd:`——js-yaml 对重复映射键
 * 直接抛错，整份 cordis.patch.yml 拒载。行尾的 \r 原样保留（编辑不改变所在文件的行尾）。
 *
 * flow style 的单行条目（`config: { serverName: codegraph, … }`）定位不到，返回
 * null，调用方退回整块重写——那个形状下手写内容通常就一行，损失有限。
 */
function locateCwdEdits(lines, range, targetCwd) {
    const bodyEnd = range.end === range.start + 1 && range.markerEnd === '' ? range.start + 1 : range.end - 1;
    const serverNamePattern = /^\s*serverName:\s*(['"]?)codegraph\1\s*(?:#.*)?$/;
    let serverNameIndex = -1;
    for (let index = range.start + 1; index < bodyEnd; index++) {
        if (serverNamePattern.test(lines[index].replace(/\r$/, ''))) {
            serverNameIndex = index;
            break;
        }
    }
    if (serverNameIndex === -1)
        return null;
    const serverLine = lines[serverNameIndex].replace(/\r$/, '');
    const indent = serverLine.length - serverLine.trimStart().length;
    // 在 [from, to) 区间里按 step 方向找与 serverName 同缩进的 cwd: 行；
    // 缩进小于它即离开条目（行边界），空行/注释跳过
    const scanCwd = (from, to, step) => {
        for (let index = from; step === 1 ? index < to : index > to; index += step) {
            const line = lines[index].replace(/\r$/, '');
            if (line.trim() === '' || line.trim().startsWith('#'))
                continue;
            const lineIndent = line.length - line.trimStart().length;
            if (lineIndent < indent)
                return -1;
            if (lineIndent !== indent)
                continue;
            if (/^\s*cwd:\s*/.test(line))
                return index;
        }
        return -1;
    };
    // 单个标量走 yaml.dump：路径里有特殊字符时它会自己加引号，别手拼
    const scalar = yaml.dump(targetCwd, { schema: YAML_SCHEMA, lineWidth: -1, noRefs: true }).replace(/\n$/, '');
    const eol = lines[serverNameIndex].endsWith('\r') ? '\r' : '';
    const cwdIndex = (() => {
        const upIndex = scanCwd(serverNameIndex - 1, range.start, -1);
        return upIndex !== -1 ? upIndex : scanCwd(serverNameIndex + 1, bodyEnd, 1);
    })();
    if (cwdIndex !== -1) {
        const line = lines[cwdIndex].replace(/\r$/, '');
        const prefix = /^(\s*cwd:\s*).*$/.exec(line)?.[1] ?? ' '.repeat(indent) + 'cwd: ';
        return [{ index: cwdIndex, text: prefix + scalar + eol }];
    }
    // 该行还没有 cwd 键：插在 serverName 行后面（同层级），YAML 映射键顺序自由
    return [{ index: serverNameIndex, text: ' '.repeat(indent) + 'cwd: ' + scalar + eol, insertAfter: true }];
}
/**
 * 纯函数：在 home 补丁文本（按 \n 切成的行数组）上执行一次托管行同步。
 * 无变化时返回原数组引用（changed=false）。文件不存在时传入 ['']。
 */
export function syncManagedMcpRow(lines, decision) {
    const state = indexState(decision.targetCwd);
    const indexed = state === 'indexed';
    const carriageReturn = usesCarriageReturn(lines);
    const ownRange = findBlock(lines, 'dsh-codegraph mcp managed', 'end dsh-codegraph mcp managed');
    const mcpRange = findBlock(lines, DSH_MCP_BLOCK_KEY, DSH_MCP_BLOCK_END_KEY);
    const ownParsed = ownRange ? parseBlockRows(lines, ownRange) : { rows: [] };
    const mcpParsed = mcpRange ? parseBlockRows(lines, mcpRange) : { rows: [] };
    const ownRows = ownParsed.rows;
    const mcpRows = mcpParsed.rows;
    // CG06：区块在、但读不动 ≠ 没有区块。硬着头皮走「新建」分支会在文件尾追加第二个
    // 区块，serverName 撞名后 codegraph MCP 整体加载失败（dsh-mcp-client 的第二个
    // 实例 apply() 直接抛 `serverName "codegraph" is already in use`，而 findBlock
    // 只认第一个匹配，永远自愈不了）。这里宁可不动，把原因报给卡片。
    const parseError = ownParsed.error ?? mcpParsed.error;
    if (parseError !== undefined) {
        return {
            lines,
            changed: false,
            status: {
                mode: 'none',
                indexed,
                indexState: state,
                note: 'cordis.patch.yml 里的托管区块解析失败（' + parseError + '）；已跳过自动托管以免写出重复的 serverName 行，请手工修复或删除该区块',
            },
        };
    }
    // 区块外手工行：只检测不碰（再写托管行会与它 serverName 撞名，第二个实例必失败）。
    const outsideLines = lines.filter((_, index) => {
        const inOwn = ownRange !== null && index >= ownRange.start && index < ownRange.end;
        const inMcp = mcpRange !== null && index >= mcpRange.start && index < mcpRange.end;
        return !inOwn && !inMcp;
    });
    try {
        const parsed = yaml.load(outsideLines.join('\n'), { schema: YAML_SCHEMA });
        if (Array.isArray(parsed)) {
            for (const entry of parsed) {
                if (typeof entry !== 'object' || entry === null)
                    continue;
                const inserted = entry.insert;
                if (!Array.isArray(inserted))
                    continue;
                const handWritten = inserted.find((row) => typeof row === 'object' && row !== null && isCodegraphServerRow(row));
                if (handWritten !== undefined) {
                    return {
                        lines,
                        changed: false,
                        status: withCwdHealth({
                            mode: 'external',
                            id: typeof handWritten.id === 'string' ? handWritten.id : undefined,
                            cwd: typeof handWritten.config?.cwd === 'string' ? handWritten.config.cwd : undefined,
                            disabled: handWritten.disabled === true,
                            indexed,
                            indexState: state,
                            note: '检测到区块外手工配置的 codegraph MCP 行，跳过托管（避免 serverName 冲突）',
                        }),
                    };
                }
            }
        }
    }
    catch {
        /* 区块外内容解析失败（如含其它 patch 操作形状）：按无手工行处理 */
    }
    const replacements = [];
    const dryRun = decision.dryRun === true;
    /** dryRun 下本该落盘、但被压住的改动（只写进 note，不写盘）。 */
    let pendingNote;
    let status;
    const mcpRow = mcpRows.find((row) => isCodegraphServerRow(row));
    if (mcpRow !== undefined && mcpRange) {
        // 复用 MCP 卡片区块里的行：只对齐 cwd，其余字段（含 disabled）保持用户配置。
        if (decision.manageEnabled && indexed && mcpRow.config?.cwd !== decision.targetCwd) {
            if (dryRun) {
                pendingNote = 'cwd 与默认项目不一致，下次同步会对齐';
            }
            else {
                // status 里报的是**对齐后**的 cwd；行对象是解析产物，改它不影响文件内容
                mcpRow.config = { ...mcpRow.config, cwd: decision.targetCwd };
                const edits = locateCwdEdits(lines, mcpRange, decision.targetCwd);
                if (edits !== null) {
                    replacements.push({ kind: 'lines', range: mcpRange, edits });
                }
                else {
                    // flow style 等定位不到行的形状：退回整块重写（区块里的注释 / override 会
                    // 丢，但这个形状下内容通常就一行；放任 cwd 过期比丢注释更糟）
                    replacements.push({ kind: 'block', range: mcpRange, text: renderBlockLines(mcpRange, mcpRows, carriageReturn, mcpRange.end >= lines.length) });
                }
            }
        }
        // 本插件区块若还残留重复行则让位删除（防 serverName 冲突）。
        if (ownRange && ownRows.some((row) => isCodegraphServerRow(row))) {
            replacements.push({ kind: 'block', range: ownRange, text: renderBlockLines(ownRange, ownRows.filter((row) => !isCodegraphServerRow(row)), carriageReturn, ownRange.end >= lines.length) });
        }
        status = {
            mode: 'dsh-mcp',
            id: typeof mcpRow.id === 'string' ? mcpRow.id : undefined,
            cwd: typeof mcpRow.config?.cwd === 'string' ? mcpRow.config.cwd : undefined,
            disabled: mcpRow.disabled === true,
            indexed,
            indexState: state,
            ...(pendingNote !== undefined
                ? { note: pendingNote }
                : decision.manageEnabled && indexed
                    ? {}
                    : { note: decision.manageEnabled ? `目标路径${indexProblem(state)}，保持现有配置` : 'MCP 联动已关闭，保持现有配置' }),
        };
    }
    else {
        const ownRowIndex = ownRows.findIndex((row) => isCodegraphServerRow(row));
        if (!decision.manageEnabled) {
            if (ownRowIndex !== -1 && ownRange) {
                replacements.push({ kind: 'block', range: ownRange, text: renderBlockLines(ownRange, ownRows.filter((row) => !isCodegraphServerRow(row)), carriageReturn, ownRange.end >= lines.length) });
                status = { mode: 'none', indexed, indexState: state, note: 'MCP 联动已关闭，已撤销本插件托管行' };
            }
            else {
                status = { mode: 'none', indexed, indexState: state, note: 'MCP 联动已关闭' };
            }
        }
        else if (ownRowIndex !== -1 && ownRange) {
            const row = ownRows[ownRowIndex];
            if (indexed && row.config?.cwd !== decision.targetCwd) {
                if (dryRun) {
                    pendingNote = 'cwd 与默认项目不一致，下次同步会对齐';
                }
                else {
                    row.config = { ...row.config, cwd: decision.targetCwd };
                    // 本插件区块虽然是自动生成的，但 cwd 对齐是最高频的写路径（每次切会话 /
                    // 改设置都会走到）——同样走定点手术，别把用户在区块里留的注释顺手抹掉。
                    const edits = locateCwdEdits(lines, ownRange, decision.targetCwd);
                    if (edits !== null) {
                        replacements.push({ kind: 'lines', range: ownRange, edits });
                    }
                    else {
                        replacements.push({ kind: 'block', range: ownRange, text: renderBlockLines(ownRange, ownRows, carriageReturn, ownRange.end >= lines.length) });
                    }
                }
            }
            status = {
                mode: 'own',
                id: typeof row.id === 'string' ? row.id : undefined,
                cwd: typeof row.config?.cwd === 'string' ? row.config.cwd : undefined,
                disabled: row.disabled === true,
                indexed,
                indexState: state,
                ...(pendingNote !== undefined
                    ? { note: pendingNote }
                    : indexed
                        ? {}
                        : { note: `目标路径${indexProblem(state)}，保持现有配置` }),
            };
        }
        else if (ownRange) {
            // CG06 的另一半：区块在、但里面没有 codegraph 行（被手清过）→ 把行**插进这个
            // 区块**，绝不追加第二个区块——两个区块用同一对标记，findBlock 永远只认第一个，
            // 第二个是永远不生效的死行。插入走行编辑：区块里已有的注释 / override 条目不动。
            const row = {
                id: MCP_ROW_ID,
                name: MCP_CLIENT_PACKAGE,
                config: {
                    serverName: MCP_SERVER_NAME,
                    transport: 'stdio',
                    command: decision.command,
                    args: ['serve', '--mcp'],
                    cwd: decision.targetCwd,
                },
            };
            if (!indexed) {
                status = { mode: 'none', indexed, indexState: state, note: `默认路径${indexProblem(state)}，未托管；把默认项目切到已索引目录即可自动挂载` };
            }
            else if (dryRun) {
                status = { mode: 'none', indexed, indexState: state, note: '本插件区块里还没有托管行（下次同步会写入）' };
            }
            else {
                // 插入点：区块体最后一行之后（结束标记之前）；空体则紧跟开始标记
                const bodyEnd = ownRange.end === ownRange.start + 1 && ownRange.markerEnd === '' ? ownRange.start + 1 : ownRange.end - 1;
                const insertAfter = Math.max(bodyEnd - 1, ownRange.start);
                const suffix = carriageReturn ? '\r' : '';
                const rowLines = renderBlockBody([row]).split('\n').filter((line, index, all) => !(index === all.length - 1 && line === ''));
                replacements.push({
                    kind: 'lines',
                    range: ownRange,
                    edits: rowLines.map((line, offset) => ({ index: insertAfter + offset, text: line + suffix, insertAfter: true })),
                });
                status = { mode: 'own', id: MCP_ROW_ID, cwd: decision.targetCwd, indexed, indexState: state, note: '已自动托管 codegraph MCP 服务器' };
            }
        }
        else if (indexed && dryRun) {
            status = { mode: 'none', indexed, indexState: state, note: '文件中还没有托管行（下次同步会写入）' };
        }
        else if (indexed) {
            const row = {
                id: MCP_ROW_ID,
                name: MCP_CLIENT_PACKAGE,
                config: {
                    serverName: MCP_SERVER_NAME,
                    transport: 'stdio',
                    command: decision.command,
                    args: ['serve', '--mcp'],
                    cwd: decision.targetCwd,
                },
            };
            replacements.push({ kind: 'block', range: { start: lines.length, end: lines.length, markerStart: OWN_BLOCK_START, markerEnd: OWN_BLOCK_END }, text: renderBlockLines(null, [row], carriageReturn, true) });
            status = { mode: 'own', id: MCP_ROW_ID, cwd: decision.targetCwd, indexed, indexState: state, note: '已自动托管 codegraph MCP 服务器' };
        }
        else {
            status = { mode: 'none', indexed, indexState: state, note: `默认路径${indexProblem(state)}，未托管；把默认项目切到已索引目录即可自动挂载` };
        }
    }
    // CG12：托管行现有 cwd 是否还落在盘上（项目被删 / uninit 后坏行长期留着——
    // 没有 fs.watch，至少让卡片每次刷新都看得见）。
    const outcome = applyReplacements(lines, replacements, dryRun, status);
    return { ...outcome, status: withCwdHealth(outcome.status) };
}
/** 给 status 补上 cwdExists（cwd 缺省时不加字段；探测失败按 false 处理）。 */
function withCwdHealth(status) {
    if (typeof status.cwd !== 'string' || status.cwd === '')
        return status;
    try {
        return { ...status, cwdExists: existsSync(status.cwd) };
    }
    catch {
        return { ...status, cwdExists: false };
    }
}
/** 把 replacements 摊到行数组上（dryRun / 无改动时原样返回）。行号从文件尾往前应用。 */
function applyReplacements(lines, replacements, dryRun, status) {
    // dryRun 是只读快照：即使某条分支漏了判断，也绝不返回改动过的行
    if (dryRun || replacements.length === 0)
        return { lines, changed: false, status };
    const next = [...lines];
    for (const replacement of [...replacements].sort((a, b) => b.range.start - a.range.start)) {
        if (replacement.kind === 'block') {
            next.splice(replacement.range.start, replacement.range.end - replacement.range.start, ...replacement.text);
        }
        else {
            for (const edit of replacement.edits) {
                if (edit.insertAfter === true)
                    next.splice(edit.index + 1, 0, edit.text);
                else
                    next[edit.index] = edit.text;
            }
        }
    }
    return { lines: next, changed: true, status };
}
/**
 * 托管行实际使用的 cwd：跟随开启且会话目录是有效索引时用它，否则用绑定路径。
 *
 * 「有效索引」这个判定（而不是「目录存在」）是关键：家目录里有 codegraph CLI 自己的
 * `~/.codegraph` 安装目录，按目录存在判会把托管行 cwd 钉在一个没有索引的目录上。
 *
 * 命中后用的是 **locateIndex 找到的根**（CG02）：会话 cwd 在 monorepo 子目录里时，
 * 索引在仓库根——把 cwd 钉在根上，CLI 从根向上找得到、从子目录向上也找得到，
 * 但「项目」是根；钉在子目录上等于把索引钉在半山腰。
 */
function effectiveProjectPath(runtime) {
    const current = runtime?.current;
    if (current === undefined)
        return process.cwd();
    const sessionPath = runtime?.sessionPath;
    if (current.follow && typeof sessionPath === 'string' && sessionPath !== '') {
        const root = resolveIndexedRoot(sessionPath);
        if (root !== undefined)
            return root;
    }
    // 绑定路径同样向上解析：显式绑定的若是已索引仓库的子目录，托管行也应对齐根
    return resolveIndexedRoot(current.defaultPath) ?? current.defaultPath;
}
/** 读 home 补丁 → 纯函数同步 → 有变化才原子写回（同目录 tmp + rename，走 kit）。 */
function syncMcpRowOnDisk(decision) {
    const patchFile = homePatchPath();
    try {
        for (let attempt = 0;; attempt++) {
            const existed = existsSync(patchFile);
            const before = existed ? statSync(patchFile) : undefined;
            const mode = before ? (before.mode & 0o777) : 0o600;
            const text = before ? readFileSync(patchFile, 'utf8') : '';
            const outcome = syncManagedMcpRow(text.split('\n'), decision);
            if (!outcome.changed)
                return { changed: false, status: outcome.status };
            // CG04：写前复核（盖章 mtime+size → 读 → 算 → 复核）。dsh-mcp 对这个文件做了
            // 同样的保护——它写前复核的是我们，我们却是裸 read→splice→rename，双方交叠时
            // 我们会整块覆盖它刚写的行（表现是 MCP 服务器莫名消失）。被写过就重读重做，
            // ≤3 次后强写（与 dsh-mcp 的语义一致，避免活锁）。
            const after = existsSync(patchFile) ? statSync(patchFile) : undefined;
            const stamp = (stat) => (stat ? stat.mtimeMs + ':' + stat.size : 'absent');
            if (before !== undefined && stamp(after) !== stamp(before) && attempt < 3)
                continue;
            // 沿用原文件权限（新文件 0600）。writeFileAtomic 内部的 writeFileSync 只会在
            // 创建临时文件时用这个 mode，umask 只会进一步收紧、不会放宽，所以写回后的
            // 权限不会比写之前更松。
            writeFileAtomic(patchFile, outcome.lines.join('\n'), mode);
            return { changed: true, status: outcome.status };
        }
    }
    catch (error) {
        // CG13：这个函数跑在挂载路径上（settings effect / 兜底 effect 的第一次 sync），
        // 以前任何一次抛错（比如 ~/.dsh 不存在、权限收紧）都会让整个插件起不来。
        // 显式报错并把原因带进状态（卡片可见），路由 / 探测 / 提示词不受影响。
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[dsh-codegraph] 读写 ${patchFile} 失败：${message}`);
        return {
            changed: false,
            status: { mode: 'none', indexed: false, indexState: 'missing', note: '读写 cordis.patch.yml 失败：' + message },
        };
    }
}
/* ------------------------------------------------------------------ *
 * 工具函数
 * ------------------------------------------------------------------ */
/**
 * 本插件统一的 JSON body 读取：上限 512KB（kit 默认 1MB，这里显式收紧）。
 * loopback 围栏 / writeJson 直接用 kit 的共享实现（全仓 9 份副本的基准）。
 */
const readBody = (req) => readJsonBody(req, MAX_JSON_BODY_BYTES);
function queryString(url) {
    try {
        return new URL(url ?? '/', 'http://localhost').searchParams;
    }
    catch {
        return new URLSearchParams();
    }
}
/**
 * 超时限定的规范化：正数原样；**0 表示不限时**（CG23——旧实现把 0 和垃圾值一起
 * 静默回落到默认，用户写 `cliTimeoutMs: 0` 想表达「不限」，得到的却是 60s 且无提示）；
 * 负数 / NaN / Infinity / 非数字回落默认值。
 */
function timeoutOr(value, fallback) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
}
/**
 * 纯函数：把插件配置规范化成 CLI 调用参数。
 * `command` 去空白后为空则回落 `codegraph`；超时只认非负有限数（0 = 不限时）；
 * `indexForce` 只认严格的 `true`（避免 `"false"` 之类的字符串被当成真）。
 */
export function resolveCliConfig(config) {
    return {
        command: config?.command?.trim() || 'codegraph',
        cliTimeoutMs: timeoutOr(config?.cliTimeoutMs, DEFAULT_CLI_TIMEOUT_MS),
        indexTimeoutMs: timeoutOr(config?.indexTimeoutMs, DEFAULT_INDEX_TIMEOUT_MS),
        indexForce: config?.indexForce === true,
    };
}
/**
 * `codegraph sync` 参数。`--` 之后的路径位在 commander 里按位置参数解析，
 * 因此路径带 `-` 开头也安全。
 */
export function syncArgs(cwd) {
    return ['sync', '--', cwd];
}
/**
 * `codegraph index` 参数。`--force` 必须排在 `--` 之前（`--` 之后一律按位置参数
 * 处理）；顶层 help 把它藏起来了，但 `codegraph index --help` 里在。
 */
export function indexArgs(cwd, force) {
    return force ? ['index', '--force', '--', cwd] : ['index', '--', cwd];
}
/**
 * `codegraph unlock` 参数：清掉挡住索引的陈旧锁文件。
 *
 * CLI 语义（1.6.0 实测）：没有锁时 exit 0 + "No stale lock files found"，有锁时删除
 * `codegraph.lock` 一类产物。**幂等**，所以卡片可以放心地把它当成一个普通按钮。
 */
export function unlockArgs(cwd) {
    return ['unlock', '--', cwd];
}
/**
 * `codegraph files` 参数（P2）。只读：列索引里的文件结构。
 * `--json` 走结构化输出，卡片按行渲染；`--filter` / `--pattern` / `--max-depth`
 * 都是 CLI 自带的旋钮，透传即可（不替用户做取舍）。
 */
export function filesArgs(cwd, options = {}) {
    const args = ['files', '--json', '--path', cwd];
    if (options.filter !== undefined && options.filter !== '')
        args.push('--filter', options.filter);
    if (options.pattern !== undefined && options.pattern !== '')
        args.push('--pattern', options.pattern);
    if (options.maxDepth !== undefined)
        args.push('--max-depth', String(options.maxDepth));
    return args;
}
/**
 * `codegraph affected` 参数（P2）：由改动文件反查受影响的测试。
 *
 * 位置参数用 `--` 终止（CG09 的同款理由：文件名以 `-` 开头会被 commander 当选项）。
 * 实测：不给任何文件时 CLI 回 `No files provided. Use file arguments or --stdin.` 且
 * exit 0——所以「空列表」不能当成错误，卡片要原样显示这句话。
 */
export function affectedArgs(cwd, files = []) {
    const args = ['affected', '--json', '--path', cwd, '--'];
    return [...args, ...files];
}
/**
 * `codegraph context` 参数（P2）：为一个任务话题组装上下文（相关符号 + 关系 + 代码块）。
 * 与 `explore` 的区别是它面向「一个任务」而不是「一个区域」。
 */
export function contextArgs(cwd, task, options = {}) {
    const args = ['context', '--path', cwd];
    if (options.maxNodes !== undefined)
        args.push('--max-nodes', String(options.maxNodes));
    return [...args, '--', task];
}
/**
 * `codegraph explore` 参数（P2）：旗舰子命令，与 MCP 的 `codegraph_explore` 同输出。
 * 卡片补它是因为**模型**那条路走 MCP、而人在卡片上此前够不着同一个能力。
 */
export function exploreArgs(cwd, query, options = {}) {
    const args = ['explore', '--path', cwd];
    if (options.maxFiles !== undefined)
        args.push('--max-files', String(options.maxFiles));
    return [...args, '--', query];
}
/**
 * `codegraph uninit` 参数（P2）：删除 `.codegraph/`，是本插件第二个往用户项目里**写**
 * 的动作（第一个是 init，方向相反）。
 *
 * **必须带 `-f`**：实测不带 `-f` 时 CLI 会问 `Continue? (y/N)`，运行器没有 TTY、读到
 * EOF 就**中止且不删除**（安全但无效）。所以确认这一步由卡片负责（两步确认），
 * CLI 侧一律 `-f`。
 */
export function uninitArgs(cwd) {
    return ['uninit', '-f', '--', cwd];
}
/**
 * 读 `status --json` 输出里的过期信号（宿主侧版本）。
 *
 * 为什么要在宿主侧也实现一遍：卡片那侧（`client-src/pure.js` 的 `staleReasons`）只负责
 * **显示**，而自动重建要在宿主里**决策**。两处必须同口径，否则会出现「卡片说还没过期、
 * 宿主偷偷重建」或者反过来。判定刻意保持极简：只看 CLI 自己给的字段。
 *
 * 实测（1.6.0）：`sync` 对「提取器版本落后」这类过期**返回 "Already up to date" 且
 * 不清除信号**——所以过期只能靠 `index` 重建修，不能靠 sync。这正是本函数存在的理由。
 */
export function staleReasonsFromStatus(status) {
    if (status === null || typeof status !== 'object')
        return [];
    const record = status;
    const meta = (record.index !== null && typeof record.index === 'object' ? record.index : {});
    const reasons = [];
    if (record.reindexRecommended === true || meta.reindexRecommended === true) {
        reasons.push('CLI 建议重建索引（reindexRecommended）');
    }
    const builtWith = meta.builtWithVersion ?? record.builtWithVersion;
    if (typeof builtWith === 'string' && builtWith !== ''
        && typeof record.version === 'string' && builtWith !== record.version) {
        reasons.push(`索引由 CLI ${builtWith} 构建，当前 CLI 是 ${record.version}`);
    }
    const builtExtraction = meta.builtWithExtractionVersion ?? record.builtWithExtractionVersion;
    const currentExtraction = meta.currentExtractionVersion ?? record.currentExtractionVersion;
    if (typeof builtExtraction === 'number' && typeof currentExtraction === 'number'
        && builtExtraction < currentExtraction) {
        reasons.push(`索引的提取器版本 ${builtExtraction} 已落后于当前的 ${currentExtraction}`);
    }
    if (record.worktreeMismatch === true || meta.worktreeMismatch === true) {
        reasons.push('索引与当前 worktree 不匹配');
    }
    return reasons;
}
/**
 * `codegraph init` 参数——在项目里建 `.codegraph/` 并建好首次索引。
 *
 * **刻意不带 `-y`**：那个「Non-interactive: skip every prompt」旗标是 CLI **1.6.0 才有**的，
 * 1.5.0（README 的实测基线，也是不少用户装着的版本）会直接
 * `error: unknown option '-y'` ——无条件带上它，等于把 init 按钮在旧版 CLI 上做废。
 *
 * 而不带它**也不会挂起**：我们的运行器永远是管道、没有 TTY，两个版本实测都自己取默认值跑完：
 *   - 1.5.0（macOS，`codegraph init -- <tmp>`）→ `Done`，建出 `.codegraph/{codegraph.db,.gitignore}`；
 *   - 1.6.0（Windows，`init -- <tmp>`，stdin 开着但不喂任何东西）→ `exited-ok`，同样建好索引。
 * 万一将来某版在无 TTY 下也坚持提问，失败形状是**超时并点名 `indexTimeoutMs`**——看得见，
 * 不会静默卡死。
 *
 * **也不带 `-f`**：CLI 用它兜住「家目录 / 文件系统根」这类误伤，插件不该替用户绕过——
 * 真要强制是用户自己在终端里的事。
 *
 * 与 `index` 的关系（真机实测，别被 help 文案误导）：`index --help` 写着「same result as a
 * fresh init」，但那说的是「全量重建的结果等同于刚 init 完」，**不是**「index 会替你初始化」：
 * 对没有 `.codegraph/` 的目录，`codegraph index` 直接报
 * `CodeGraph not initialized in <path>` + `Run "codegraph init" first`。所以「建立索引」在
 * 未初始化项目上必须走 init，这也是本插件此前唯一还得让用户回终端的一步。
 */
export function initArgs(cwd) {
    return ['init', '--', cwd];
}
/* ------------------------------------------------------------------ *
 * CLI 调用（全平台统一的 spawn 运行器）
 *
 * npm / pnpm / 独立安装器给的 CLI 在 Windows 上往往只有 `.cmd` shim，没有真正的
 * `.exe`（codegraph 就是如此）。`spawn` 默认 `shell: false` 时既不匹配 `.cmd`，
 * Node 又因 CVE-2024-27980 加固拒绝执行它——于是 Windows 上每一次调用都固定失败成
 * `spawn codegraph ENOENT`，卡片整块不可用。转义规则与 `%COMSPEC% /d /s /c` 的
 * 启动方式在 `@hyzyn/dsh-kit` 的 windows-shim（`@hyzyn/dsh-mcp` 的「连接测试」踩的
 * 是同一个坑），本包保留四个同名导出，别让既有消费者断掉。
 *
 * 为什么**两个平台**都走 spawn + 自管超时，而不是 POSIX 继续用 execFile（CG05）：
 *   - execFile 的 timeout 只发一次 SIGTERM，CLI 忽略它就永久挂起；而 POSIX 上
 *     kit 的 killProcessTree 原先是 no-op，等于没有任何兜底——10 分钟的 index
 *     谁也杀不掉；
 *   - 关掉标签页 / 点「取消」时（res close / POST /cancel）必须有人去收进程树，
 *     execFile 没有这个挂点。
 * 统一后：POSIX 用 detached: true 让 CLI 当进程组长（kill(-pid) 整树收杀的前提），
 * 超时与取消都走「SIGTERM → KILL_GRACE_MS → SIGKILL」的升级链；两条平台的失败
 * 形状经 settleCliRun 归一，cliErrorMessage 的判定（timedOut）对两者一致。
 * ------------------------------------------------------------------ */
export { escapeArgument, escapeCommand, taskkillArgs, windowsCommandLine } from '@hyzyn/dsh-kit';
/** SIGTERM 之后给 CLI 的清理宽限（删锁文件 / flush 输出）；仍不退就整组 SIGKILL。 */
const KILL_GRACE_MS = 3_000;
/**
 * 一次 CLI 调用的超时错误。`timedOut` 是给 cliErrorMessage 的**显式**标记
 * （CG22：以前靠 killed/signal 反推，任何带信号的死法——包括被 OOM 杀掉——都会被
 * 报成「超时」，把排障引向 cliTimeoutMs）。killed/signal 保留只是兼容旧断言。
 */
function timeoutError(command, timeoutMs) {
    const error = new Error(`Command failed: ${command} (timeout after ${timeoutMs}ms)`);
    error.killed = true;
    error.signal = 'SIGTERM';
    error.timedOut = true;
    return error;
}
/**
 * 收尾判定（纯函数，便于覆盖「超时与 close 竞态」）。
 *
 * 为什么必须显式带 `timedOut`：超时时我们先置标志再收进程树，而被杀的子进程会先
 * 触发 `close`——不认这个标志的话，close 分支会抢先以「Command failed: …」结案，
 * `cliErrorMessage` 就认不出超时，卡片报的错也不会点名 `cliTimeoutMs` /
 * `indexTimeoutMs`（Windows CI 上实测到的就是这个）。反过来，**非**超时的信号死亡
 * （被用户 / OOM 杀掉）不会进这个分支，卡片也就不会谎报「超时」。
 */
export function settleCliRun(input) {
    if (input.timedOut)
        return { ok: false, error: timeoutError(input.command, input.timeoutMs) };
    if (input.code === 0)
        return { ok: true, stdout: input.stdout };
    return { ok: false, error: new Error(`Command failed: ${input.command} ${input.args.join(' ')}\n${input.stderr}`) };
}
/**
 * spawn + 自管超时/取消的执行器（全平台唯一路径，CG05）。
 *
 * POSIX 上 `detached: true` 让 CLI 成为进程组长：kit 的 killProcessTree 对 -pid 发
 * 信号时才能连它拉起的子孙（daemon 预热等）一起收；Windows 分支经 cmd.exe
 * （portableSpawnPlan 决定），taskkill /T 本就收整树。stdout 上限按 MAX_BUFFER 卡，
 * 超限杀树报错。cmd.exe 的报错按控制台代码页解码（两个流各持一个容错解码器）。
 */
function runViaSpawn(command, args, cwd, timeoutMs, cancel) {
    return new Promise((resolve, reject) => {
        const child = spawnPortable(command, args, { cwd, windowsHide: true, detached: true });
        let stdout = '';
        let stderr = '';
        let settled = false;
        let timedOut = false;
        // cmd.exe 自己的报错（`'codegraph' 不是内部或外部命令…`）按**控制台代码页**写管道，
        // 中文系统是 CP936；直接 `chunk.toString()` 会把它解成乱码。两条流各持一个解码器：
        // CLI 的 stdout 是 UTF-8、cmd.exe 的 stderr 是 OEM，互不影响。
        const stdoutDecoder = createOutputDecoder();
        const stderrDecoder = createOutputDecoder();
        const drainDecoders = () => {
            stdout += stdoutDecoder.flush();
            stderr += stderrDecoder.flush();
        };
        /** SIGTERM 后留一个清理窗口，仍不走就整组 SIGKILL（不加宽限的 SIGKILL 会留下 codegraph.lock）。 */
        const terminate = () => {
            // 本运行器经 spawnPortable({ detached: true }) 启动、子进程是组长——group: true
            // 才能连子孙一起收；非 detached 的消费者（如 dsh-mcp 的连接测试）保持默认单杀（CG36）
            void killProcessTree(child.pid, 'SIGTERM', { group: true }).finally(() => {
                const escalation = setTimeout(() => {
                    void killProcessTree(child.pid, 'SIGKILL', { group: true });
                }, KILL_GRACE_MS);
                // 补刀计时器不为结束中的调用拖住宿主退出
                escalation.unref?.();
            });
        };
        const finish = (outcome) => {
            if (settled)
                return;
            settled = true;
            if (timer !== undefined)
                clearTimeout(timer);
            cancel?.removeEventListener('abort', onAbort);
            if (outcome.ok)
                resolve(outcome.stdout);
            else
                reject(outcome.error);
        };
        const settle = (code) => {
            drainDecoders();
            return settleCliRun({ command, args, timeoutMs, timedOut, code, stdout, stderr });
        };
        const onAbort = () => {
            if (settled)
                return;
            terminate();
            const error = new Error('codegraph 命令已取消');
            error.cancelled = true;
            finish({ ok: false, error });
        };
        cancel?.addEventListener('abort', onAbort, { once: true });
        // timeoutMs 为 0 表示不限时（CG23）：不设计时器
        const timer = timeoutMs > 0
            ? setTimeout(() => {
                // 先置标志、再连进程树一起收：被杀的子进程会先触发 close，标志不到位就会被
                // close 分支抢先结案，超时形状丢失
                timedOut = true;
                terminate();
                finish(settle(null));
            }, timeoutMs)
            : undefined;
        child.stdout?.on('data', (chunk) => {
            if (settled)
                return;
            if (stdout.length + chunk.length > MAX_BUFFER) {
                terminate();
                finish({ ok: false, error: new Error(`stdout maxBuffer exceeded (${MAX_BUFFER} bytes)`) });
                return;
            }
            stdout += stdoutDecoder.decode(chunk);
        });
        child.stderr?.on('data', (chunk) => {
            if (settled)
                return;
            if (stderr.length < MAX_BUFFER)
                stderr += stderrDecoder.decode(chunk);
        });
        child.on('error', (error) => finish({ ok: false, error }));
        child.on('close', (code) => finish(settle(code)));
    });
}
/**
 * 运行 codegraph CLI，返回 stdout；失败时抛错。
 *
 * `cancel` 可选：路由把「请求断连（res close 且未写完）/ POST /cancel」转成 AbortSignal
 * 传进来（CG05/CG30）——关掉标签页不该留下 10 分钟跑不完的 index。
 */
async function runCodegraph(command, args, cwd, timeoutMs, cancel) {
    return runViaSpawn(command, args, cwd, timeoutMs, cancel);
}
/** 探测失败原因保留多长：够放下一整条 cmd.exe 报错，又不至于让路由响应无限大。 */
const CLI_PROBE_ERROR_MAX = 600;
/**
 * 探测 CLI 是否真的可执行（`<command> --version`）。
 *
 * 只用于 systemPrompt 门禁：`command` 指向的 CLI 不存在时，不该向模型宣告
 * 「本机已安装 Codegraph 插件 / 可以用 codegraph 工具」——那是让模型去撞必然
 * 失败的调用。任何失败（ENOENT / 非零退出 / 超时）都按不可用处理，且不影响
 * 卡片的其它功能（路由会把真实报错显示出来）。
 *
 * 但**为什么失败**必须带出去：报告里那次排障之所以要翻注册表、比对进程环境，
 * 就是因为卡片只说「探测不到」，而 `spawn codegraph ENOENT` 这句话被打进黑洞。
 */
async function probeCli(command) {
    const at = Date.now();
    try {
        await runCodegraph(command, ['--version'], process.cwd(), CLI_PROBE_TIMEOUT_MS);
        return { ok: true, at };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { ok: false, error: message.slice(0, CLI_PROBE_ERROR_MAX), at };
    }
}
/**
 * 把 CLI 调用的错误翻成卡片上看得懂的文案。
 *
 * 超时用运行器置的 **timedOut 标记**判定（CG22）：以前按 killed/signal 反推——任何
 * 带信号的死法（CLI 被 OOM 杀掉、被用户杀掉）都会被报成「超时」，把排障引向
 * cliTimeoutMs / indexTimeoutMs。取消（res close / /cancel）单独一句，别让用户
 * 以为是失败。
 */
function cliErrorMessage(error, timeoutMs, timeoutHint) {
    const failure = error;
    if (failure?.cancelled === true)
        return 'codegraph 命令已取消';
    if (failure?.timedOut === true)
        return `codegraph 命令超时（>${timeoutMs}ms）：可用插件配置 ${timeoutHint} 调大`;
    return error instanceof Error ? error.message : String(error);
}
function tryParseJson(text) {
    try {
        return JSON.parse(text);
    }
    catch {
        return undefined;
    }
}
/** 有界登记表：容量固定，避免长期运行无限增长。 */
const REGISTRY_LIMIT = 50;
/**
 * 项目登记表（内存态、每实例一份）。
 *
 * 边界处理：写满之后**淘汰最久未见的**，但**永不淘汰当前默认项目 / 当前会话项目**——
 * 否则用户正在用的那个恰好被挤掉，列表里反而看不到自己。
 */
function createProjectRegistry() {
    const seen = new Map();
    const note = (path, via) => {
        if (typeof path !== 'string')
            return;
        const trimmed = path.trim();
        if (trimmed === '')
            return;
        // 只登记已索引的**根**：会话 cwd 可能是 monorepo 子目录，归到根才与切换语义一致；
        // 未索引目录也记（用户会想知道「这个项目还没索引」），但键用原路径。
        const key = resolveIndexedRoot(trimmed) ?? trimmed;
        // `at` 每次都刷新（「最近见过」要的是最新时间），但 `via` **只记第一次**：
        // 同一条路径会被多个路由反复 note（/projects 自己每次都会补登记默认项目与生效路径），
        // 若每次都覆盖 via，用户看到的来源就会变成「生效路径」这种没有信息量的值——
        // 实测正是如此（/follow 上报的项目显示成「生效路径」）。第一次的来源才是
        // 「它是怎么进列表的」，那也正是排障时要问的。
        const existing = seen.get(key);
        seen.set(key, { at: Date.now(), firstVia: existing?.firstVia ?? via });
        if (seen.size <= REGISTRY_LIMIT)
            return;
        // 淘汰最久未见的；至少保留一个，避免集合被清空
        const oldest = [...seen.entries()].sort((a, b) => a[1].at - b[1].at)[0];
        if (oldest !== undefined)
            seen.delete(oldest[0]);
    };
    const list = () => {
        const now = Date.now();
        return [...seen.entries()]
            .map(([path, info]) => ({
            path,
            indexed: indexState(path) === 'indexed',
            seenAgoMs: Math.max(0, now - info.at),
            via: info.firstVia,
        }))
            .sort((a, b) => a.seenAgoMs - b.seenAgoMs);
    };
    return { note, list };
}
/**
 * 创建采纳率收集器：订阅会话事件、按键归并。
 *
 * 三个刻意的设计取舍：
 *
 *  1. **只在内存里，不落盘**。这是「宿主本次运行」的行为观测，不是审计日志；
 *     落盘会带来隐私问题（工具名 + 项目路径），而它的用途只是回答「现在要不要调
 *     提示词」。宿主重启即归零是可接受的，`since` 会如实告诉卡片起点。
 *  2. **不订阅 `tool/result`**。只数调用次数，不关心成败——采纳率问的是「模型想不
 *     想用」，失败了也是想用（那是另一个问题，由诊断包回答）。
 *  3. **项目键 = 索引根**（`resolveIndexedRoot`），拿不到索引时才退回会话 cwd。
 *     与托管行 cwd、注入门禁同一口径，所以「仪表说这个项目已索引」与「提示词确实
 *     注入了」不会打架。
 *
 * 事件载荷的读取全部做了防御（`event?.type !== 'tool/call'` 直接 return，`name`
 * 交给 `bucketToolCall` 判空）：`session/event` 是宿主公开契约，但事件表的字段在
 * 版本间有过增补，读数时不该假设形状。
 */
function createMetricsCollector() {
    let table = new Map();
    const since = Date.now();
    const projectKeyFor = (session) => {
        const cwd = session?.header?.cwd;
        if (typeof cwd !== 'string' || cwd === '')
            return '(未知项目)';
        // 已索引 → 归到仓库根；未索引也要记（那些项目恰恰是「该 init」的候选）
        return resolveIndexedRoot(cwd) ?? cwd;
    };
    const access = {
        snapshot() {
            const projects = {};
            const summaries = [];
            // 分组合计：只对**有记录**的项目求和，并分别标记 indexed
            const buckets = { indexed: emptyCounts(), unindexed: emptyCounts() };
            for (const [project, counts] of table) {
                projects[project] = counts;
                const indexed = indexState(project) === 'indexed';
                summaries.push(summarizeAdoption(project, counts, indexed));
                const target = indexed ? buckets.indexed : buckets.unindexed;
                target.codegraph += counts.codegraph;
                target.file += counts.file;
                target.discovery += counts.discovery;
                target.other += counts.other;
            }
            // 调用多的排前面：卡片一眼看到最活跃的项目
            summaries.sort((a, b) => b.exploratory - a.exploratory || a.project.localeCompare(b.project));
            return {
                projects,
                summaries,
                grouped: {
                    // project 字段在分组视图里是标签而非真实路径
                    indexed: summarizeAdoption('（已索引项目）', buckets.indexed, true),
                    unindexed: summarizeAdoption('（未索引项目）', buckets.unindexed, false),
                },
                since,
            };
        },
    };
    return {
        access,
        attach(ctx) {
            ctx.on('session/event', (...args) => {
                const session = args[0];
                const event = args[1];
                if (event === null || typeof event !== 'object')
                    return;
                if (event.type !== 'tool/call')
                    return;
                // 没有可读名字的 tool/call 是**畸形事件**，直接丢弃而不是记进 other：
                // 它会凭空抬高分母（「其它工具」那一列）并让「探索次数」看起来更可信，
                // 而真实原因是事件载荷不对——宁可少记，不要记错。
                if (typeof event.name !== 'string' || event.name.trim() === '')
                    return;
                table = foldToolCall(table, event.name, projectKeyFor(session));
            });
        },
    };
}
/* ------------------------------------------------------------------ *
 * 路由
 * ------------------------------------------------------------------ */
/** query 的 limit 上限：CLI 对超大值会静默回空结果，这里钳住（CG10）。 */
const MAX_QUERY_LIMIT = 10_000;
function makeRoutes(cli, defaultPath, 
/**
 * CLI 探测状态访问口（见 CliProbeAccess）：闭包读，因为探测是异步的、可能晚于路由
 * 注册；也可由卡片显式触发重探。
 */
cliProbe, 
/**
 * 本实例的生效设置访问口（CG25）：路由读**本实例**的 runtime，不再读模块级单例——
 * 「同名不同 id」的手写行能让两个实例并存，第二份挂载覆盖掉全局单例后，第一份的
 * 路由闭包就会拿错设置。
 */
runtime, 
/**
 * 采纳率收集器访问口（ROADMAP P1）。与 runtime 同理走闭包：collector 在 apply 里
 * 创建、可能晚于路由注册，且必须**每实例一份**（两个实例并存时不该共享计数）。
 */
metrics, 
/** 已索引项目登记表（P2 项目列表）：路由上报候选，`/projects` 读它。 */
projects) {
    const guard = (req, res, method) => {
        if (!isLoopbackRequest(req)) {
            writeJson(res, 403, { error: 'forbidden: loopback-only' });
            return false;
        }
        if (req.method !== method) {
            writeJson(res, 405, { error: 'method not allowed: ' + String(req.method) });
            return false;
        }
        return true;
    };
    /**
     * 当前生效的默认项目路径：settings 里保存过的值优先，其次插件配置 / 进程 cwd。
     * 经实例访问口读（CG25）——「设为默认项目」之后，不带 ?path= 的调用才会跟着切换
     * （旧实现会一直停在宿主启动时的那份配置）。
     */
    const currentDefaultPath = () => {
        const current = runtime()?.current.defaultPath.trim();
        return current !== undefined && current !== '' ? current : defaultPath || process.cwd();
    };
    const resolvePath = (params) => params.get('path')?.trim() || currentDefaultPath();
    /**
     * 最近一次 CLI 失败的原文（诊断包要用，ROADMAP P1-b）。
     *
     * 为什么记在内存而不是让用户去翻日志：失败发生在哪次点击、原文是什么，是排查的
     * 第一现场；宿主日志未必开着，卡片上的报错刷新一次就没了。这里只留最近一条，
     * 不设上限会长成泄漏；`at` / `kind` / `path` 三项就够定位。
     */
    let lastCliFailure;
    const rememberFailure = (kind, path, error) => {
        const message = cliErrorMessage(error, kind === 'index' ? cli.indexTimeoutMs : cli.cliTimeoutMs, kind === 'index' ? 'indexTimeoutMs' : 'cliTimeoutMs');
        lastCliFailure = { at: Date.now(), kind, path, error: message };
    };
    /** 查询类命令的失败响应：超时文案指向 cliTimeoutMs。 */
    const failCli = (res, cwd, error) => {
        rememberFailure('cli', cwd, error);
        writeJson(res, 500, { ok: false, error: cliErrorMessage(error, cli.cliTimeoutMs, 'cliTimeoutMs'), path: cwd });
    };
    /** 索引类命令的失败响应：超时文案指向 indexTimeoutMs。 */
    const failIndex = (res, cwd, error) => {
        rememberFailure('index', cwd, error);
        writeJson(res, 500, { ok: false, error: cliErrorMessage(error, cli.indexTimeoutMs, 'indexTimeoutMs'), path: cwd });
    };
    /**
     * 目标必须真是个目录——`init` 会往这里写 `.codegraph/`，不能凭字符串就开工。
     * 返回 undefined 表示通过；否则是给用户的 400 文案。与 default-path 的 POST 同一套判定。
     */
    const directoryError = (target) => {
        try {
            if (!existsSync(target))
                return '路径不存在: ' + target;
            if (!statSync(target).isDirectory())
                return '路径不是目录: ' + target;
            return undefined;
        }
        catch (error) {
            return '路径不可访问: ' + (error instanceof Error ? error.message : String(error));
        }
    };
    /**
     * 解析 limit / depth 这类「正整数」查询参数（CG10）。缺省返回 undefined（由调用方
     * 取默认）；给了但不是正整数时返回 400 文案——CLI 对 `-1` 与 `99999999999` 都回
     * exit 0 + []（静默空结果），必须在进 CLI 之前挡下。
     */
    const positiveIntParam = (raw, name) => {
        if (raw === undefined || raw === '')
            return {};
        const parsed = Number(raw);
        if (!Number.isInteger(parsed) || parsed < 1)
            return { error: `${name} 必须是正整数: ${raw}` };
        return { value: parsed };
    };
    /** 运行中的 CLI 调用登记表（cwd → 控制器）：POST /cancel 的靶子（CG05）。 */
    const activeRuns = new Map();
    /** 登记 / 注销一次可取消运行；注销时只摘自己的那一份（同 cwd 并发时后写者胜）。 */
    const trackRun = (cwd, controller) => {
        activeRuns.set(cwd, controller);
        return () => {
            if (activeRuns.get(cwd) === controller)
                activeRuns.delete(cwd);
        };
    };
    /**
     * 请求断连 → abort（CG30）：客户端没在等了，CLI 没理由继续跑完 10 分钟。
     *
     * 为什么挂在 **res 的 close** 上而不是 req 的 aborted——后者在 body 消费完之后
     * **不会触发**（真机 HTTP 实测：POST body 读完后客户端销毁连接，事件只有
     * `res:close` 且 `writableEnded=false`，`req 'aborted'` 从头到尾不来）。close 在
     * 正常完成时也会发，用 writableEnded 区分「没写完就断了」和「写完了才关」。
     */
    const abortOnDisconnect = (res, controller) => {
        const withOn = res;
        if (typeof withOn.on !== 'function')
            return;
        withOn.on('close', () => {
            const writableEnded = res.writableEnded;
            if (writableEnded !== true)
                controller.abort();
        });
    };
    const run = async (args, cwd, timeoutMs = cli.cliTimeoutMs, cancel) => {
        const output = await runCodegraph(cli.command, args, cwd, timeoutMs, cancel);
        return { ok: true, output, data: tryParseJson(output) };
    };
    const runJson = async (args, cwd) => {
        const output = await runCodegraph(cli.command, args, cwd, cli.cliTimeoutMs);
        const data = tryParseJson(output);
        if (data === undefined) {
            return { ok: true, output, data: { raw: output } };
        }
        return { ok: true, output, data };
    };
    /**
     * POST 路由的 body 门禁（CG01）：kit 的 readJsonBody 对畸形 / 超限 / 空 / 非对象
     * body 一律返回 undefined 且**不抛错**——不在这里 400 的话，「请求体没读出来」就
     * 长得像「用户没指定路径」，写操作会在默认项目上执行。
     */
    const readPostBody = async (req, res) => {
        const body = await readBody(req);
        if (body === undefined) {
            writeJson(res, 400, { error: 'invalid JSON body' });
            return undefined;
        }
        return body;
    };
    return [
        {
            kind: 'exact',
            path: '/api/dsh-codegraph/status',
            handler: async (req, res) => {
                if (!guard(req, res, 'GET'))
                    return;
                const params = queryString(req.url);
                const cwd = resolvePath(params);
                // 路径不存在时 CLI 会 exit 0 + initialized:false——「目录没了」长得像「没初始化」，
                // 卡片还会给出一个注定失败的「初始化索引」按钮。先在这里 400（CG10 同类）。
                const invalid = directoryError(cwd);
                if (invalid !== undefined) {
                    writeJson(res, 400, { error: invalid });
                    return;
                }
                try {
                    const { output, data } = await runJson(['status', '--json', '--', cwd], cwd);
                    // 查过状态 = 用户正在关注这个项目 → 进项目列表（P2）
                    projects.note(cwd, 'status 查询');
                    writeJson(res, 200, { ok: true, path: cwd, status: data, raw: output });
                }
                catch (error) {
                    failCli(res, cwd, error);
                }
            },
        },
        {
            kind: 'exact',
            path: '/api/dsh-codegraph/query',
            handler: async (req, res) => {
                if (!guard(req, res, 'GET'))
                    return;
                const params = queryString(req.url);
                const cwd = resolvePath(params);
                const q = params.get('q')?.trim() ?? '';
                if (!q) {
                    writeJson(res, 400, { error: '缺少 q 参数' });
                    return;
                }
                const invalid = directoryError(cwd);
                if (invalid !== undefined) {
                    writeJson(res, 400, { error: invalid });
                    return;
                }
                const limitCheck = positiveIntParam(params.get('limit')?.trim(), 'limit');
                if (limitCheck.error !== undefined) {
                    writeJson(res, 400, { error: limitCheck.error });
                    return;
                }
                const limit = Math.min(limitCheck.value ?? 10, MAX_QUERY_LIMIT);
                // `-k/--kind`（P2 查询参数面板）：CLI 自带按节点类型过滤（function / class 等）。
                // 值不做白名单——CLI 对未知 kind 自己会处理（回空结果），插件不该硬编码类型表
                // （上游加新 kind 时这里不必跟着改）。
                const kind = params.get('kind')?.trim();
                if (kind !== undefined && kind !== '' && kind.startsWith('-')) {
                    writeJson(res, 400, { error: 'kind 不能以 - 开头: ' + kind });
                    return;
                }
                try {
                    // 位置参数前补 `--`（CG09）：`-abc` 会撞上 commander 的 unknown option、
                    // `-h` 更是 exit 0 + help 文本——卡片只能把它显示成「没有结果」
                    const args = ['query', '--json', '--path', cwd, '--limit', String(limit)];
                    if (kind !== undefined && kind !== '')
                        args.push('--kind', kind);
                    args.push('--', q);
                    const { output, data } = await runJson(args, cwd);
                    writeJson(res, 200, { ok: true, path: cwd, results: data, raw: output });
                }
                catch (error) {
                    failCli(res, cwd, error);
                }
            },
        },
        {
            kind: 'exact',
            path: '/api/dsh-codegraph/callers',
            handler: async (req, res) => {
                if (!guard(req, res, 'GET'))
                    return;
                const params = queryString(req.url);
                const cwd = resolvePath(params);
                const symbol = params.get('symbol')?.trim() ?? '';
                if (!symbol) {
                    writeJson(res, 400, { error: '缺少 symbol 参数' });
                    return;
                }
                const invalid = directoryError(cwd);
                if (invalid !== undefined) {
                    writeJson(res, 400, { error: invalid });
                    return;
                }
                // `-l/--limit` 是 P2 补的旋钮（CLI 默认 20：大符号上默认值会把结果截断，
                // 而卡片此前无从知道被截了）
                const limitCheck = positiveIntParam(params.get('limit')?.trim(), 'limit');
                if (limitCheck.error !== undefined) {
                    writeJson(res, 400, { error: limitCheck.error });
                    return;
                }
                try {
                    // `--` 见 query 路由（CG09）
                    const args = ['callers', '--json', '--path', cwd];
                    if (limitCheck.value !== undefined)
                        args.push('--limit', String(Math.min(limitCheck.value, MAX_QUERY_LIMIT)));
                    args.push('--', symbol);
                    const { output, data } = await runJson(args, cwd);
                    writeJson(res, 200, { ok: true, path: cwd, symbol, callers: data, raw: output });
                }
                catch (error) {
                    failCli(res, cwd, error);
                }
            },
        },
        {
            kind: 'exact',
            path: '/api/dsh-codegraph/callees',
            handler: async (req, res) => {
                if (!guard(req, res, 'GET'))
                    return;
                const params = queryString(req.url);
                const cwd = resolvePath(params);
                const symbol = params.get('symbol')?.trim() ?? '';
                if (!symbol) {
                    writeJson(res, 400, { error: '缺少 symbol 参数' });
                    return;
                }
                const invalid = directoryError(cwd);
                if (invalid !== undefined) {
                    writeJson(res, 400, { error: invalid });
                    return;
                }
                // 同 callers：`-l/--limit` 是 P2 补的旋钮
                const limitCheck = positiveIntParam(params.get('limit')?.trim(), 'limit');
                if (limitCheck.error !== undefined) {
                    writeJson(res, 400, { error: limitCheck.error });
                    return;
                }
                try {
                    const args = ['callees', '--json', '--path', cwd];
                    if (limitCheck.value !== undefined)
                        args.push('--limit', String(Math.min(limitCheck.value, MAX_QUERY_LIMIT)));
                    args.push('--', symbol);
                    const { output, data } = await runJson(args, cwd);
                    writeJson(res, 200, { ok: true, path: cwd, symbol, callees: data, raw: output });
                }
                catch (error) {
                    failCli(res, cwd, error);
                }
            },
        },
        {
            kind: 'exact',
            path: '/api/dsh-codegraph/impact',
            handler: async (req, res) => {
                if (!guard(req, res, 'GET'))
                    return;
                const params = queryString(req.url);
                const cwd = resolvePath(params);
                const symbol = params.get('symbol')?.trim() ?? '';
                if (!symbol) {
                    writeJson(res, 400, { error: '缺少 symbol 参数' });
                    return;
                }
                const invalid = directoryError(cwd);
                if (invalid !== undefined) {
                    writeJson(res, 400, { error: invalid });
                    return;
                }
                // depth 只挡垃圾值（CG10），不做上限钳制：CLI 自己把 --depth 夹到 10（实测）
                const depthCheck = positiveIntParam(params.get('depth')?.trim(), 'depth');
                if (depthCheck.error !== undefined) {
                    writeJson(res, 400, { error: depthCheck.error });
                    return;
                }
                const depth = String(depthCheck.value ?? 2);
                try {
                    const { output, data } = await runJson(['impact', '--json', '--path', cwd, '--depth', depth, '--', symbol], cwd);
                    writeJson(res, 200, { ok: true, path: cwd, symbol, impact: data, raw: output });
                }
                catch (error) {
                    failCli(res, cwd, error);
                }
            },
        },
        {
            kind: 'exact',
            path: '/api/dsh-codegraph/node',
            handler: async (req, res) => {
                if (!guard(req, res, 'GET'))
                    return;
                const params = queryString(req.url);
                const cwd = resolvePath(params);
                const name = params.get('name')?.trim() ?? '';
                if (!name) {
                    writeJson(res, 400, { error: '缺少 name 参数' });
                    return;
                }
                const invalid = directoryError(cwd);
                if (invalid !== undefined) {
                    writeJson(res, 400, { error: invalid });
                    return;
                }
                const file = params.get('file')?.trim();
                if (file !== undefined && file.startsWith('-')) {
                    // `--file -foo` 的值会被 commander 吃掉，同样会造成静默空结果（CG10 同类）
                    writeJson(res, 400, { error: 'file 不能以 - 开头: ' + file });
                    return;
                }
                const args = ['node', '--path', cwd];
                if (file)
                    args.push('--file', file);
                // 刻意**不带 --json**：CLI 的 node 子命令没有这个旗标（实测 `unknown option`，
                // 1.5.0 / 1.6.0 都是）——路由解析靠的是输出本身；这条约束由测试钉住（CG27）
                args.push('--', name);
                try {
                    const { output, data } = await run(args, cwd);
                    writeJson(res, 200, { ok: true, path: cwd, name, node: data ?? output, raw: output });
                }
                catch (error) {
                    writeJson(res, 500, { ok: false, error: cliErrorMessage(error, cli.cliTimeoutMs, 'cliTimeoutMs'), path: cwd, name });
                }
            },
        },
        {
            kind: 'exact',
            path: '/api/dsh-codegraph/sync',
            handler: async (req, res) => {
                if (!guard(req, res, 'POST'))
                    return;
                const body = await readPostBody(req, res);
                if (body === undefined)
                    return;
                const cwd = (typeof body.path === 'string' && body.path.trim()) || currentDefaultPath();
                // 可取消（CG05）：客户端断连（关标签页）或 POST /cancel 都会中止 CLI
                const controller = new AbortController();
                const untrack = trackRun(cwd, controller);
                abortOnDisconnect(res, controller);
                try {
                    const { output } = await run(syncArgs(cwd), cwd, cli.indexTimeoutMs, controller.signal);
                    writeJson(res, 200, { ok: true, path: cwd, output });
                }
                catch (error) {
                    failIndex(res, cwd, error);
                }
                finally {
                    untrack();
                }
            },
        },
        {
            kind: 'exact',
            path: '/api/dsh-codegraph/index',
            handler: async (req, res) => {
                if (!guard(req, res, 'POST'))
                    return;
                const body = await readPostBody(req, res);
                if (body === undefined)
                    return;
                const cwd = (typeof body.path === 'string' && body.path.trim()) || currentDefaultPath();
                const controller = new AbortController();
                const untrack = trackRun(cwd, controller);
                abortOnDisconnect(res, controller);
                try {
                    const { output } = await run(indexArgs(cwd, cli.indexForce), cwd, cli.indexTimeoutMs, controller.signal);
                    writeJson(res, 200, { ok: true, path: cwd, output });
                }
                catch (error) {
                    failIndex(res, cwd, error);
                }
                finally {
                    untrack();
                }
            },
        },
        {
            kind: 'exact',
            path: '/api/dsh-codegraph/unlock',
            handler: async (req, res) => {
                // 清陈旧锁（`codegraph unlock`）：一次被强杀的 index 会留下 `codegraph.lock`，
                // 之后**所有**索引操作都被它挡住，而卡片此前没有任何入口——用户只能去终端。
                // CLI 语义是幂等的（没锁时 exit 0 + "No stale lock files found"），所以这个
                // 按钮可以随便点。
                if (!guard(req, res, 'POST'))
                    return;
                const body = await readPostBody(req, res);
                if (body === undefined)
                    return;
                const cwd = (typeof body.path === 'string' && body.path.trim()) || currentDefaultPath();
                const invalid = directoryError(cwd);
                if (invalid !== undefined) {
                    writeJson(res, 400, { error: invalid });
                    return;
                }
                try {
                    const { output } = await run(unlockArgs(cwd), cwd, cli.cliTimeoutMs);
                    writeJson(res, 200, { ok: true, path: cwd, output });
                }
                catch (error) {
                    failCli(res, cwd, error);
                }
            },
        },
        {
            kind: 'exact',
            path: '/api/dsh-codegraph/files',
            handler: async (req, res) => {
                // 索引里的文件结构（P2）。只读；三个过滤旋钮（filter/pattern/max-depth）都是
                // CLI 自带的，透传不替用户取舍。
                if (!guard(req, res, 'GET'))
                    return;
                const params = queryString(req.url);
                const cwd = resolvePath(params);
                const invalid = directoryError(cwd);
                if (invalid !== undefined) {
                    writeJson(res, 400, { error: invalid });
                    return;
                }
                const maxDepthCheck = positiveIntParam(params.get('maxDepth')?.trim(), 'maxDepth');
                if (maxDepthCheck.error !== undefined) {
                    writeJson(res, 400, { error: maxDepthCheck.error });
                    return;
                }
                try {
                    const args = filesArgs(cwd, {
                        filter: params.get('filter')?.trim(),
                        pattern: params.get('pattern')?.trim(),
                        maxDepth: maxDepthCheck.value,
                    });
                    const { output, data } = await runJson(args, cwd);
                    writeJson(res, 200, { ok: true, path: cwd, files: data, raw: output });
                }
                catch (error) {
                    failCli(res, cwd, error);
                }
            },
        },
        {
            kind: 'exact',
            path: '/api/dsh-codegraph/affected',
            handler: async (req, res) => {
                // 由改动文件反查受影响的测试（P2）。实测：空文件列表时 CLI 回
                // `No files provided. Use file arguments or --stdin.` 且 **exit 0**——
                // 所以这里不能把它当错误，原样 200 + 文本带回去，由卡片显示。
                if (!guard(req, res, 'GET'))
                    return;
                const params = queryString(req.url);
                const cwd = resolvePath(params);
                const invalid = directoryError(cwd);
                if (invalid !== undefined) {
                    writeJson(res, 400, { error: invalid });
                    return;
                }
                // `files` 可重复传（?files=a&files=b）；含 `-` 开头的值会被 commander 吃掉，
                // 位置参数前的 `--` 挡不住「值本身」这种形状，所以在这里先拒。
                const files = params.getAll('files').map((f) => f.trim()).filter((f) => f !== '');
                const bad = files.find((f) => f.startsWith('-'));
                if (bad !== undefined) {
                    writeJson(res, 400, { error: '文件路径不能以 - 开头: ' + bad });
                    return;
                }
                try {
                    const { output, data } = await runJson(affectedArgs(cwd, files), cwd);
                    writeJson(res, 200, { ok: true, path: cwd, affected: data, raw: output });
                }
                catch (error) {
                    failCli(res, cwd, error);
                }
            },
        },
        {
            kind: 'exact',
            path: '/api/dsh-codegraph/explore',
            handler: async (req, res) => {
                // 旗舰子命令（P2）：与 MCP 的 codegraph_explore 同输出。模型走 MCP，
                // 人在卡片上此前够不着同一个能力。
                if (!guard(req, res, 'GET'))
                    return;
                const params = queryString(req.url);
                const cwd = resolvePath(params);
                const query = params.get('q')?.trim() ?? '';
                if (query === '') {
                    writeJson(res, 400, { error: '缺少 q 参数' });
                    return;
                }
                const invalid = directoryError(cwd);
                if (invalid !== undefined) {
                    writeJson(res, 400, { error: invalid });
                    return;
                }
                const maxFilesCheck = positiveIntParam(params.get('maxFiles')?.trim(), 'maxFiles');
                if (maxFilesCheck.error !== undefined) {
                    writeJson(res, 400, { error: maxFilesCheck.error });
                    return;
                }
                try {
                    // explore 输出是 markdown（不是 JSON），所以走 run 而不是 runJson
                    const { output } = await run(exploreArgs(cwd, query, { maxFiles: maxFilesCheck.value }), cwd);
                    writeJson(res, 200, { ok: true, path: cwd, query, output });
                }
                catch (error) {
                    failCli(res, cwd, error);
                }
            },
        },
        {
            kind: 'exact',
            path: '/api/dsh-codegraph/context',
            handler: async (req, res) => {
                // 为一个**任务**组装上下文（P2）：与 explore 的区别是面向任务而非区域。
                // CLI 默认 markdown 输出，卡片直接渲染文本。
                if (!guard(req, res, 'GET'))
                    return;
                const params = queryString(req.url);
                const cwd = resolvePath(params);
                const task = params.get('q')?.trim() ?? '';
                if (task === '') {
                    writeJson(res, 400, { error: '缺少 q 参数' });
                    return;
                }
                const invalid = directoryError(cwd);
                if (invalid !== undefined) {
                    writeJson(res, 400, { error: invalid });
                    return;
                }
                const maxNodesCheck = positiveIntParam(params.get('maxNodes')?.trim(), 'maxNodes');
                if (maxNodesCheck.error !== undefined) {
                    writeJson(res, 400, { error: maxNodesCheck.error });
                    return;
                }
                try {
                    const { output } = await run(contextArgs(cwd, task, { maxNodes: maxNodesCheck.value }), cwd);
                    writeJson(res, 200, { ok: true, path: cwd, task, output });
                }
                catch (error) {
                    failCli(res, cwd, error);
                }
            },
        },
        {
            kind: 'exact',
            path: '/api/dsh-codegraph/uninit',
            handler: async (req, res) => {
                // 删除 `.codegraph/`（P2）：与 init 反向，是本插件第二个**往用户项目里写**的动作。
                // 纪律与 init 同级：loopback + POST + 目标必须真是目录 + 目标必须真的有索引
                // （对没有索引的目录做 uninit 是无意义且容易误伤的）。
                //
                // CLI 侧一律 `-f`：实测不带 `-f` 时它会问 `Continue? (y/N)`，运行器没有 TTY、
                // 读到 EOF 就**中止且不删除**——确认这一步由卡片负责（两步确认），不能指望 CLI 问。
                if (!guard(req, res, 'POST'))
                    return;
                const body = await readPostBody(req, res);
                if (body === undefined)
                    return;
                const cwd = (typeof body.path === 'string' && body.path.trim()) || currentDefaultPath();
                const invalid = directoryError(cwd);
                if (invalid !== undefined) {
                    writeJson(res, 400, { error: invalid });
                    return;
                }
                const found = locateIndex(cwd);
                if (found.state !== 'indexed') {
                    writeJson(res, 409, {
                        ok: false,
                        path: cwd,
                        error: `该目录${indexProblem(found.state)}，没有可撤销的索引`,
                    });
                    return;
                }
                // 撤销的是**索引所在的根**（CG02 同口径）：在 monorepo 子目录上点撤销，
                // 删掉的必须是仓库根那份索引，而不是凭空在子目录里找一个。
                const target = found.projectPath ?? cwd;
                const controller = new AbortController();
                const untrack = trackRun(target, controller);
                abortOnDisconnect(res, controller);
                try {
                    const { output } = await run(uninitArgs(target), target, cli.indexTimeoutMs, controller.signal);
                    // 索引没了 → 托管行决策跟着变（同 init 的反向）：不重算的话，卡片会继续
                    // 显示「已托管」，而 MCP 服务器指着一个不存在的索引。
                    const rt = runtime();
                    if (rt !== undefined)
                        rt.sync(rt.scope?.get());
                    writeJson(res, 200, { ok: true, path: target, output, indexed: false });
                }
                catch (error) {
                    failIndex(res, target, error);
                }
                finally {
                    untrack();
                }
            },
        },
        {
            kind: 'exact',
            path: '/api/dsh-codegraph/init',
            handler: async (req, res) => {
                // 这是本插件**唯一往用户项目里写东西**的入口（建 `.codegraph/`），所以：
                // loopback + POST 之外，还要先确认目标真是个目录——不能凭一个字符串就开工。
                if (!guard(req, res, 'POST'))
                    return;
                const body = await readPostBody(req, res);
                if (body === undefined)
                    return;
                const cwd = (typeof body.path === 'string' && body.path.trim()) || currentDefaultPath();
                const invalid = directoryError(cwd);
                if (invalid !== undefined) {
                    writeJson(res, 400, { error: invalid });
                    return;
                }
                // 已经初始化过就不重复 init（幂等靠 CLI 也能过，但让它明确走 index 更省事也更准）。
                // indexState 是祖先口径（CG02）：monorepo 子目录里点 init，命中的是仓库根那份
                // 索引——409 挡掉它，用户就不会在子目录里再建一份嵌套索引。
                if (indexState(cwd) === 'indexed') {
                    writeJson(res, 409, { ok: false, error: '该目录（或其祖先）已有索引；要重建请用「重建索引」', path: cwd });
                    return;
                }
                const controller = new AbortController();
                const untrack = trackRun(cwd, controller);
                abortOnDisconnect(res, controller);
                try {
                    const { output } = await run(initArgs(cwd), cwd, cli.indexTimeoutMs, controller.signal);
                    // init 把 indexState 从「未索引」翻成「已索引」，而 MCP 托管行的决策读的正是它
                    // （未索引时不写行）。不在这里重算的话，用户 init 完仍然看不到托管行，
                    // 得再动一次设置才生效——缺口就只补了一半。
                    const rt = runtime();
                    if (rt !== undefined)
                        rt.sync(rt.scope?.get());
                    writeJson(res, 200, { ok: true, path: cwd, output, indexed: true });
                }
                catch (error) {
                    failIndex(res, cwd, error);
                }
                finally {
                    untrack();
                }
            },
        },
        {
            kind: 'exact',
            path: '/api/dsh-codegraph/default-path',
            handler: async (req, res) => {
                if (!isLoopbackRequest(req)) {
                    writeJson(res, 403, { error: 'forbidden: loopback-only' });
                    return;
                }
                const rt = runtime();
                if (req.method === 'GET') {
                    const current = rt?.current ?? {
                        defaultPath: currentDefaultPath(),
                        manage: true,
                        announce: true,
                        usage: true,
                        follow: true,
                    };
                    // 卡片关心的是「托管行实际用哪个目录」：indexState 一律针对生效路径，
                    // defaultPath 只是跟随关闭/会话目录无索引时的回落值。
                    const effectivePath = effectiveProjectPath(rt);
                    const state = indexState(effectivePath);
                    writeJson(res, 200, {
                        ok: true,
                        defaultPath: current.defaultPath,
                        effectivePath,
                        sessionPath: rt?.sessionPath,
                        followSession: current.follow,
                        manageEnabled: current.manage,
                        announceToAgent: current.announce,
                        usageGuidance: current.usage,
                        /** CLI 探测结果：false 时两段 systemPrompt 都不会注入；undefined = 还没探测完。 */
                        cliAvailable: cliProbe.get().available,
                        /**
                         * 探测失败的**实测原因**（ENOENT / 非零退出 / 超时原文），卡片直接显示。
                         * 早先这里只有布尔，卡片只好把原因写成猜测（「常见原因是宿主没有继承
                         * shell 的 PATH」），排障只能靠翻注册表。
                         */
                        cliProbeError: cliProbe.get().error,
                        /** 上次探测时刻，卡片显示出来，好让「重新探测」有可见反馈。 */
                        cliProbeAt: cliProbe.get().at,
                        /** 实际调用的 CLI 命令（插件配置 command，默认 codegraph）：探测失败时卡片要报出来。 */
                        command: cli.command,
                        indexed: state === 'indexed',
                        indexState: state,
                        mcp: snapshotMcpStatus(cli.command, rt),
                    });
                    return;
                }
                if (req.method !== 'POST') {
                    writeJson(res, 405, { error: 'method not allowed: ' + String(req.method) });
                    return;
                }
                const body = await readPostBody(req, res);
                if (body === undefined)
                    return;
                const path = typeof body.path === 'string' ? body.path.trim() : '';
                if (path === '') {
                    writeJson(res, 400, { error: '缺少 path 参数' });
                    return;
                }
                const invalid = directoryError(path);
                if (invalid !== undefined) {
                    writeJson(res, 400, { error: invalid });
                    return;
                }
                const found = locateIndex(path);
                if (found.state !== 'indexed') {
                    writeJson(res, 400, {
                        error: found.state === 'not-a-project'
                            ? '该目录的 .codegraph/ 里没有索引库，不是 codegraph 项目（家目录最常见：~/.codegraph 是 CLI 自身的安装目录）；请先在项目根目录运行 codegraph init'
                            : '该目录及其祖先都没有 .codegraph/ 索引，请先在项目根目录运行 codegraph init',
                    });
                    return;
                }
                // CG02：绑定的是**索引所在的根**——用户在 monorepo 子目录上点「设为默认项目」，
                // 真正的项目是仓库根；照旧绑定子目录等于把索引钉在半山腰。
                const projectRoot = found.projectPath ?? path;
                // 官方持久化通道：写入 settings 命名空间 → settings/updated → 同步托管行。
                // settings 未就绪时只同步一次（不持久化，重启后回落）。
                if (rt === undefined) {
                    writeJson(res, 500, { error: '插件尚未完成挂载' });
                    return;
                }
                // 「设为默认项目」是一次显式指定：同时关掉跟随，否则下一个会话切换就会把它顶掉
                let persisted = false;
                if (rt.scope !== undefined) {
                    try {
                        await rt.scope.update({ defaultPath: projectRoot, followSession: false });
                        persisted = true;
                    }
                    catch (error) {
                        writeJson(res, 500, { error: '保存默认项目路径失败: ' + (error instanceof Error ? error.message : String(error)) });
                        return;
                    }
                }
                const outcome = rt.sync({ defaultPath: projectRoot, followSession: false });
                writeJson(res, 200, {
                    ok: true,
                    defaultPath: outcome.defaultPath,
                    effectivePath: outcome.effectivePath,
                    followSession: outcome.current.follow,
                    persisted,
                    mcp: outcome.status,
                });
            },
        },
        {
            kind: 'exact',
            path: '/api/dsh-codegraph/follow',
            handler: async (req, res) => {
                if (!guard(req, res, 'POST'))
                    return;
                const body = await readPostBody(req, res);
                if (body === undefined)
                    return;
                const path = typeof body.path === 'string' ? body.path.trim() : '';
                const rt = runtime();
                if (rt === undefined) {
                    writeJson(res, 500, { error: '插件尚未完成挂载' });
                    return;
                }
                // CG07：上报的路径至少要是个真实目录才收——这条路由紧接着就会 sync() 落盘
                // （改 MCP 服务器的 cwd），而 loopback 围栏挡不住「本机任意进程」，一个任意
                // 字符串不该有资格触碰那份文件。目录存在 ≠ 有效索引：有效性仍由
                // effectiveProjectPath 按 locateIndex 现算，所以索引被删后同样自动回落。
                if (path !== '') {
                    const invalid = directoryError(path);
                    if (invalid !== undefined) {
                        writeJson(res, 400, { error: invalid });
                        return;
                    }
                }
                // 空 path = 当前没有活动会话（或它没有工作目录）：清掉上报值，回落到绑定路径。
                rt.sessionPath = path === '' ? undefined : path;
                if (path !== '')
                    projects.note(path, '活动会话');
                const outcome = rt.sync(rt.scope?.get());
                // 注意：`indexed` 报的是**生效路径**（托管行实际用的目录），而「回落」的判定必须
                // 看**上报的会话目录**——生效路径在回落之后必然是默认路径，用它的索引态会得出
                // 「已索引所以不用提示」，默认路径恰好已索引时就把回落这件事吞了。
                const state = indexState(outcome.effectivePath);
                const sessionState = path === '' ? undefined : indexState(path);
                writeJson(res, 200, {
                    ok: true,
                    sessionPath: rt.sessionPath ?? null,
                    effectivePath: outcome.effectivePath,
                    followSession: outcome.current.follow,
                    defaultPath: outcome.defaultPath,
                    indexed: state === 'indexed',
                    indexState: state,
                    sessionPathState: sessionState,
                    mcp: outcome.status,
                    ...(outcome.current.follow && sessionState !== undefined && sessionState !== 'indexed'
                        ? { note: '会话目录没有可用的 .codegraph/ 索引，托管行 cwd 回落到默认项目' }
                        : {}),
                    ...(outcome.current.follow ? {} : { note: '跟随已关闭，托管行 cwd 保持默认项目' }),
                });
            },
        },
        {
            kind: 'exact',
            path: '/api/dsh-codegraph/settings',
            handler: async (req, res) => {
                if (!guard(req, res, 'POST'))
                    return;
                const body = await readPostBody(req, res);
                if (body === undefined)
                    return;
                // 只认这三个布尔键：defaultPath 走 /default-path（它有目录与索引校验），
                // 其余安装级旋钮（command / 超时 / indexForce）故意不给写入口。
                const patch = {};
                for (const key of ['announceToAgent', 'usageGuidance', 'mcpIntegration', 'followSession']) {
                    const value = body[key];
                    if (value === undefined)
                        continue;
                    if (typeof value !== 'boolean') {
                        writeJson(res, 400, { error: key + ' 必须是布尔值' });
                        return;
                    }
                    patch[key] = value;
                }
                if (Object.keys(patch).length === 0) {
                    writeJson(res, 400, { error: '缺少可写字段（announceToAgent / usageGuidance / mcpIntegration / followSession）' });
                    return;
                }
                const rt = runtime();
                if (rt === undefined || rt.scope === undefined) {
                    writeJson(res, 500, { error: '插件尚未完成挂载' });
                    return;
                }
                try {
                    await rt.scope.update(patch);
                }
                catch (error) {
                    writeJson(res, 500, { error: '保存失败: ' + (error instanceof Error ? error.message : String(error)) });
                    return;
                }
                // settings/updated 已经触发过一次 sync；这里再显式同步一次只是兜底
                // （同值幂等：MCP 行无变化不写盘，section 增删也按需跳过）。
                const outcome = rt.sync(rt.scope.get());
                writeJson(res, 200, {
                    ok: true,
                    announceToAgent: outcome.current.announce,
                    usageGuidance: outcome.current.usage,
                    manageEnabled: outcome.current.manage,
                    followSession: outcome.current.follow,
                    effectivePath: outcome.effectivePath,
                    cliAvailable: cliProbe.get().available,
                    cliProbeError: cliProbe.get().error,
                    cliProbeAt: cliProbe.get().at,
                    command: cli.command,
                    mcp: outcome.status,
                });
            },
        },
        {
            kind: 'exact',
            path: '/api/dsh-codegraph/cancel',
            handler: async (req, res) => {
                // 取消正在跑的 CLI 调用（CG05）：卡片在 sync / index / init 进行中提供「取消」
                // 按钮；关标签页的断连由 res close 兜底，这是显式入口。不带 path = 全部取消。
                if (!guard(req, res, 'POST'))
                    return;
                const body = await readBody(req);
                const target = typeof body?.path === 'string' ? body.path.trim() : '';
                let cancelled = 0;
                for (const [cwd, controller] of [...activeRuns]) {
                    if (target !== '' && cwd !== target)
                        continue;
                    controller.abort();
                    cancelled += 1;
                }
                writeJson(res, 200, { ok: true, cancelled });
            },
        },
        {
            kind: 'exact',
            path: '/api/dsh-codegraph/diagnose',
            handler: async (req, res) => {
                // 只读诊断包（ROADMAP P1-b）。刻意只认 GET：它读 daemon 日志、必要时补一次
                // `<command> --version` 探测，语义就是「看当前状态」——与 /reprobe 那种
                // 显式副作用入口分开。
                if (!guard(req, res, 'GET'))
                    return;
                const params = queryString(req.url);
                const rt = runtime();
                const effective = effectiveProjectPath(rt);
                const target = params.get('path')?.trim() || effective;
                // 探测没落地时补一次：诊断包的核心价值就是「CLI 到底能不能跑」，给一个空字段
                // 等于让提问者再猜一轮。已探过就复用（不重复起进程，CG21）。
                const probe = cliProbe.get();
                const found = locateIndex(target);
                const mcp = snapshotMcpStatus(cli.command, rt);
                const indexedDir = join(target, INDEX_DIR);
                const indexedProbe = probePath(indexedDir);
                const indexedEntries = indexedProbe.exists ? listEntries(indexedDir) : undefined;
                // codegraph CLI 自己的安装目录：`~/.codegraph`。刻意用 `os.homedir()` 而**不是**
                // 从 `dshHome()` 推回去——CLI 的安装位置只跟用户家目录有关，与 `DSH_HOME`
                // 无关；用 DSH_HOME 推导的话，设过 `DSH_HOME=/custom` 的机器上这里会指向
                // `/custom/../.codegraph`（不存在），而真正的 `~/.codegraph` 恰是「家目录被
                // 误判成已索引项目」那个经典坑的源头，诊断包里最该看见它。
                const codegraphHome = join(homedir(), '.codegraph');
                const lines = [
                    `@hyzyn/dsh-codegraph ${PLUGIN_VERSION} · node ${process.version} · ${process.platform} ${process.arch}`,
                    `时间：${new Date().toISOString()}`,
                    '',
                    `command：${cli.command}`,
                    `CLI 探测：${probe.available === true ? '可用' : probe.available === false ? '不可用' : '尚未探测'}`
                        + (probe.at !== undefined ? `（${new Date(probe.at).toISOString()}）` : ''),
                    ...(probe.error !== undefined && probe.error !== '' ? [`  实测原因：${probe.error}`] : []),
                    `超时：查询 ${cli.cliTimeoutMs === 0 ? '不限时' : cli.cliTimeoutMs + 'ms'}`
                        + ` / 索引 ${cli.indexTimeoutMs === 0 ? '不限时' : cli.indexTimeoutMs + 'ms'} · indexForce=${String(cli.indexForce)}`,
                    '',
                    `诊断目标路径：${target}`,
                    `  索引状态：${found.state}${found.projectPath !== undefined ? `（项目根 ${found.projectPath}）` : ''}`,
                    `  ${INDEX_DIR}/：${!indexedProbe.exists
                        ? '不存在'
                        : indexedEntries === undefined ? '存在但读不到条目' : indexedEntries.join(', ')}`,
                    `托管行生效路径：${effective}`,
                    `会话上报路径：${rt?.sessionPath ?? '(无)'}`,
                    `默认项目路径：${rt?.current.defaultPath ?? currentDefaultPath()}`,
                    `跟随会话：${rt?.current.follow === true ? '开' : '关'} · MCP 联动：${rt?.current.manage === true ? '开' : '关'}`,
                    '',
                    `--- 托管行（${homePatchPath()}）---`,
                    `mode=${mcp.mode} cwd=${mcp.cwd ?? '(未托管)'} indexed=${String(mcp.indexed)}`
                        + (mcp.cwdExists === false ? ' ⚠ cwd 目录已不存在' : '')
                        + (mcp.note !== undefined ? ` note=${mcp.note}` : ''),
                    '',
                    '--- 托管行原文（只摘 codegraph 相关的两个区块，且已脱敏）---',
                    ...renderPatchExcerpt(),
                    '',
                    `--- codegraph 安装目录 / daemon（${codegraphHome}）---`,
                    `安装目录：${probePath(codegraphHome).exists ? '存在' : '不存在'}`,
                    ...renderDaemons(codegraphHome),
                    '',
                    '--- 最近一次 CLI 失败 ---',
                    lastCliFailure === undefined
                        ? '（本次宿主运行期间没有失败记录）'
                        : `${new Date(lastCliFailure.at).toISOString()} [${lastCliFailure.kind}] ${lastCliFailure.path}\n  ${lastCliFailure.error}`,
                    '',
                    // 采纳率也进诊断包（P1）：报告「codegraph 好像没效果」时，第一个要分清的是
                    // 「模型根本没用它」还是「用了但结果不对」——这一节直接给出答案。
                    '--- 采纳率（本次宿主运行期间，target 路径所属项目）---',
                    (() => {
                        const snapshot = metrics().snapshot();
                        const key = resolveIndexedRoot(target) ?? target;
                        const counts = snapshot.projects[key];
                        if (counts === undefined)
                            return `（${key} 还没有工具调用记录）`;
                        return describeAdoption(summarizeAdoption(key, counts, indexState(key) === 'indexed'));
                    })(),
                    ...(() => {
                        // 其它项目也列一下（有调用才列），免得「主项目 0 次」被读成「完全没记录」
                        const others = metrics().snapshot().summaries.filter((row) => row.exploratory > 0 || row.other > 0);
                        const current = resolveIndexedRoot(target) ?? target;
                        const rest = others.filter((row) => row.project !== current);
                        if (rest.length === 0)
                            return [];
                        return ['其它有记录的项目：', ...rest.map((row) => '  ' + describeAdoption(row))];
                    })(),
                ];
                writeJson(res, 200, {
                    ok: true,
                    path: target,
                    /** 可整段复制（贴 issue / 发给自己存档）的纯文本。 */
                    report: lines.join('\n'),
                });
            },
        },
        {
            kind: 'exact',
            path: '/api/dsh-codegraph/metrics',
            handler: async (req, res) => {
                // 采纳率仪表（ROADMAP P1）。只读：统计由 session/event 订阅在内存里累积，
                // 这条路由只把当下的表拍成 JSON——刻意不做持久化（见 collector 的注释）。
                if (!guard(req, res, 'GET'))
                    return;
                const params = queryString(req.url);
                const collector = metrics();
                const requested = params.get('path')?.trim();
                const snapshot = collector.snapshot();
                // 不带 path = 全部项目（按探索次数排序）；带 path = 先按索引根归并（与注入门禁
                // 同口径），于是「卡片上看的那个项目」与「数字属于哪个项目」不会错位。
                if (requested !== undefined && requested !== '') {
                    const key = resolveIndexedRoot(requested) ?? requested;
                    const counts = snapshot.projects[key] ?? emptyCounts();
                    const summary = summarizeAdoption(key, counts, indexState(key) === 'indexed');
                    writeJson(res, 200, {
                        ok: true,
                        path: requested,
                        project: key,
                        summary,
                        text: describeAdoption(summary),
                        since: snapshot.since,
                    });
                    return;
                }
                writeJson(res, 200, { ok: true, summaries: snapshot.summaries, grouped: snapshot.grouped, since: snapshot.since });
            },
        },
        {
            kind: 'exact',
            path: '/api/dsh-codegraph/telemetry',
            handler: async (req, res) => {
                // 只读地转达 CLI 自己的遥测状态（P2）。`init` / `index` 会触发上游的匿名用量统计，
                // 而卡片此前既不提示也不给开关——用户点了几十次重建索引，未必知道自己开了什么。
                //
                // 为什么只做**只读转达**而不是给一个开关：那是用户的全局偏好（存在
                // `~/.codegraph/telemetry.json`），由 CLI 自己的 `telemetry on|off` 管；插件替用户
                // 翻这个开关等于越权改别人的全局设置。这里只把「当前是什么」如实显示出来，
                // 再告诉用户去哪儿关。
                if (!guard(req, res, 'GET'))
                    return;
                try {
                    const { output } = await run(['telemetry', 'status'], process.cwd(), cli.cliTimeoutMs);
                    // 输出形如「Telemetry: enabled (your saved choice)」「Config: /path/telemetry.json」
                    const enabledMatch = output.match(/Telemetry:\s*(enabled|disabled)/i);
                    writeJson(res, 200, {
                        ok: true,
                        enabled: enabledMatch === null ? undefined : enabledMatch[1].toLowerCase() === 'enabled',
                        output,
                    });
                }
                catch (error) {
                    // 版本较旧没有 telemetry 子命令：如实回报，不猜
                    failCli(res, process.cwd(), error);
                }
            },
        },
        {
            kind: 'exact',
            path: '/api/dsh-codegraph/projects',
            handler: async (req, res) => {
                // 项目列表（P2）：候选来自活跃会话与插件自己观察到的 cwd，每条现算索引态。
                // 只读；列出的都是「用户真的在这里工作过」的目录，不做全盘扫描。
                if (!guard(req, res, 'GET'))
                    return;
                const rt = runtime();
                // 当前生效/默认/会话路径每次都补登记一次：它们必须始终在列表里，
                // 否则「一键切换」的目标列表会缺掉用户此刻正在用的那个。
                const current = rt?.current;
                if (current !== undefined)
                    projects.note(current.defaultPath, '默认项目');
                if (rt?.sessionPath !== undefined)
                    projects.note(rt.sessionPath, '活动会话');
                const effective = effectiveProjectPath(rt);
                projects.note(effective, '生效路径');
                const items = projects.list();
                writeJson(res, 200, {
                    ok: true,
                    projects: items,
                    indexedCount: items.filter((item) => item.indexed).length,
                    effectivePath: effective,
                });
            },
        },
        {
            kind: 'exact',
            path: '/api/dsh-codegraph/reprobe',
            handler: async (req, res) => {
                // guard 已经把住 loopback + POST；重探会真的起一个子进程（<command> --version），
                // 所以这里刻意只认 POST，不让 GET 顺带触发副作用。
                if (!guard(req, res, 'POST'))
                    return;
                const result = await cliProbe.reprobe();
                writeJson(res, 200, {
                    ok: true,
                    cliAvailable: result.ok,
                    cliProbeError: result.error,
                    cliProbeAt: result.at,
                    command: cli.command,
                });
            },
        },
    ];
}
/** 不落盘的快照：读盘上真实内容，回答「现在是什么状态」（不推测下次写入的结果）。 */
function snapshotMcpStatus(command, rt) {
    const current = rt?.current ?? { defaultPath: process.cwd(), manage: true, announce: true, usage: true, follow: true };
    const patchFile = homePatchPath();
    const text = existsSync(patchFile) ? readFileSync(patchFile, 'utf8') : '';
    return syncManagedMcpRow(text.split('\n'), {
        serverName: MCP_SERVER_NAME,
        command,
        targetCwd: effectiveProjectPath(rt),
        manageEnabled: current.manage,
        dryRun: true,
    }).status;
}
/* ------------------------------------------------------------------ *
 * 插件本体
 * ------------------------------------------------------------------ */
/**
 * 公告段（order 150）：只留模型用得上的部分——知道卡片存在、能引导用户。
 * 卡片内部有哪些按钮是 UI 细节，模型不需要背（旧版把 6 个功能都列了一遍，
 * 327 字），MCP 工具则交给使用指引段。同档 order 的 section 由
 * dsh-system-prompt 按名字排序（comparePromptSections），所以不依赖注册顺序。
 */
const CODEGRAPH_GUIDANCE = '本机已安装 dsh-codegraph 插件（Codegraph 集成）：Web GUI 的 插件配置里有「Codegraph」卡片，可看索引状态、搜索符号、sync / 重建索引，并把当前项目一键设为默认项目。用户提到「Codegraph / 代码图谱 / 调用链 / 影响面 / 索引」时，可引导其打开该卡片。';
/**
 * 使用指引段（order 151）：只保留「何时用它 + 失败了怎么办」。
 *
 * 工具自述（返回什么、一次调用搞定、不要重复 Read）已经在 MCP 工具描述里，
 * 这里不再复述；三条独有信息是 shell 兜底、projectPath 自愈、没索引就跳过。
 *
 * 两点与宿主实现对齐：
 *   - 触发条件必须与 indexState 同口径：`.codegraph/` **里要有索引库**。
 *     只看目录存在会把家目录也算成已索引项目（`~/.codegraph` 是 CLI 安装目录），
 *     于是模型被诱导去调一个必然报 "No CodeGraph project is loaded" 的工具。
 *   - shell 兜底里的命令名按 `command` 配置渲染，不写死 `codegraph`（安装级旋钮）。
 */
const codegraphUsageGuidance = (command) => `<!-- CODEGRAPH_START -->
## CodeGraph

In repositories indexed by CodeGraph — a \`.codegraph/\` directory with an index database at the repo root (the CLI's own \`~/.codegraph\` install dir does not count) — reach for it BEFORE grep/find or reading files when you need to understand or locate code:

- **MCP tool**: \`mcp__codegraph__codegraph_explore\`; name a file or symbol in the query to also read its current line-numbered source. If it asks for \`projectPath\` (no default project loaded), pass the project's absolute path — one server answers for any number of projects.
- **Shell** (no MCP needed): \`${command} explore "<symbol names or question>"\` prints the same output, and \`--path <dir>\` targets another project.
- If a project has no \`.codegraph/\`, use your normal search tools there; don't run \`codegraph init\` — indexing is the user's decision.
<!-- CODEGRAPH_END -->`;
const plugin = definePlugin({
    name: 'codegraph',
    inject: [],
    apply(ctx, config) {
        if (config?.enabled === false) {
            // CG14：关闭插件时也要撤销托管行——卡片随路由一起消失后就再也没有撤销入口，
            // 用户只能手改 cordis.patch.yml。manageEnabled:false 的同步只删本插件区块里的行
            // （dsh-mcp 区块里的行是用户自己的，不碰）。失败已在 syncMcpRowOnDisk 内显式报错。
            const { changed, status } = syncMcpRowOnDisk({
                serverName: MCP_SERVER_NAME,
                command: resolveCliConfig(config).command,
                targetCwd: process.cwd(),
                manageEnabled: false,
            });
            if (changed)
                console.log('[dsh-codegraph] disabled: 已撤销托管行 — ' + (status.note ?? ''));
            return;
        }
        const cli = resolveCliConfig(config);
        const command = cli.command;
        // 安装级默认值；settings 里存过同名键时以 settings 为准（见 resolveStored）。
        const announceDefault = config?.announceToAgent !== false;
        const usageDefault = config?.usageGuidance !== false;
        const manageEnabled = config?.mcpIntegration !== false;
        const followDefault = config?.followSession !== false;
        /**
         * 本实例的生效设置（CG25）：不再是模块级单例。路由 / 快照经下面的访问口读取
         * **本实例**的 runtime——「同名不同 id」的手写行能让两个实例并存，共享单例时
         * 第二份挂载会覆盖它，第一份路由闭包读到的就是别人的设置。
         */
        let runtimeRef;
        const getRuntime = () => runtimeRef;
        /**
         * 采纳率收集器（ROADMAP P1）：每实例一份，挂在 ctx 上订阅 session/event。
         *
         * 订阅用 `ctx.on`（不是 `inject`）：`session/event` 是宿主的事件，随 ctx 的
         * effect 生命周期自动解绑，不需要额外 dispose。挂在这里而不是路由里，是因为
         * 事件从会话一开始就流，而路由可能直到用户打开卡片才被访问。
         */
        /**
         * 项目登记表（P2）：创建后立刻用活跃会话 seed 一次，之后由 /follow、/status、
         * /projects 持续补充。seed 用 `sessions.list()`（宿主公开服务，见 registry 注释
         * 里为什么不用 ~/.dsh/sessions 的内部格式）。
         */
        const projectRegistry = createProjectRegistry();
        ctx.inject(['sessions'], (sessionCtx) => {
            try {
                const sessions = sessionCtx.sessions;
                for (const session of sessions?.list?.() ?? []) {
                    const cwd = session?.header?.cwd;
                    if (typeof cwd === 'string')
                        projectRegistry.note(cwd, '活跃会话');
                }
            }
            catch (error) {
                // 服务形状随版本可能变：拿不到就少几个候选，不影响其余功能
                console.warn('[dsh-codegraph] 读取活跃会话以初始化项目列表失败（列表仍会随使用增长）：'
                    + (error instanceof Error ? error.message : String(error)));
            }
        });
        const metricsCollector = createMetricsCollector();
        try {
            metricsCollector.attach(ctx);
        }
        catch (error) {
            // 订阅失败不该让整个插件起不来：仪表是观测功能，缺了它其余部分照常工作。
            console.warn('[dsh-codegraph] 采纳率订阅失败（仪表不可用，其余功能不受影响）：'
                + (error instanceof Error ? error.message : String(error)));
        }
        /**
         * 自动重建（ROADMAP P1「索引生命周期」，默认关）。
         *
         * 触发点是**会话出现时的项目目录**，不是定时器：过期信号只在项目被打开时才值得关心，
         * 定时轮询会在用户没在看的项目上烧 CPU（还要起 CLI 子进程去读 status）。
         *
         * 三个刻意的约束：
         *
         *  1. **语义是「重建」不是「同步」**。实测（codegraph 1.6.0）：`sync` 对「提取器版本
         *     落后」这类过期返回 `Already up to date` 且**不清除信号**——过期只能靠 `index`
         *     修。若照直觉实现成自动 sync，就会变成一个每次都跑、每次都什么也不改变的
         *     空转循环。
         *  2. **每个项目每次宿主运行最多一次**（`autoReindexed` 集合）。重建是分钟级操作，
         *     不做这个闸的话，同一项目开十个会话就是十次全量重建。
         *  3. **失败只记日志，不抛不给提示**。它是一个后台优化，不该在用户没要求的情况下
         *     弹错误；真出问题卡片上本来就有一键重建。
         *
         * 与 `indexForce` 的关系：自动重建**不**追加 `--force`——那面旗子绕开 CLI 对
         * 「家目录 / 文件系统根」的误伤保护，应由用户显式决定，不该由后台路径代劳。
         */
        const autoReindexed = new Set();
        const autoReindexEnabled = config?.autoReindex === true;
        /** 检查一个项目的过期信号，必要时重建（幂等、每次运行每项目一次）。 */
        const maybeAutoReindex = async (projectPath) => {
            if (!autoReindexEnabled)
                return;
            // 只在**已确认** CLI 不可用时跳过。刻意不写成 `!== true`：探测是挂载后异步跑的，
            // 会话的第一条 user/message 完全可能早于它落地（实测 ~200–300ms），用 `!== true`
            // 会在那个窗口里把检查静默吞掉——测试里表现为「有时查有时不查」。
            // 代价是 CLI 真缺失时每项目多起一次注定失败的子进程，可以接受。
            if (cliProbeState.available === false)
                return;
            if (autoReindexed.has(projectPath))
                return;
            // 先占位再检查：宁可漏一次，也不要在两个会话同时打开时起两个重建进程
            autoReindexed.add(projectPath);
            try {
                const raw = await runCodegraph(command, ['status', '--json', '--', projectPath], projectPath, cli.cliTimeoutMs);
                const status = tryParseJson(raw);
                const reasons = staleReasonsFromStatus(status);
                if (reasons.length === 0)
                    return;
                console.log(`[dsh-codegraph] 自动重建：${projectPath} — ${reasons.join('；')}`);
                await runCodegraph(command, indexArgs(projectPath, false), projectPath, cli.indexTimeoutMs);
                console.log(`[dsh-codegraph] 自动重建完成：${projectPath}`);
            }
            catch (error) {
                console.warn(`[dsh-codegraph] 自动重建失败（可在卡片上手动重建）：${projectPath} — `
                    + (error instanceof Error ? error.message : String(error)));
            }
        };
        // 会话出现 → 看它所属项目过不过期。用 session/event 的 user/message 而不是
        // 定时器：只在「真有人在这个项目里干活」时才检查。
        //
        // 这里的 cast 与采纳率收集器同因：`session/event` 是宿主在运行时提供的事件，
        // 而本包的 peer 依赖里没有 dsh-session 的类型（typert 生成的 Events 联合类型
        // 在宿主包里）。形状已按真实消费者核对（dsh-acp / dsh-agent-instructions 都是
        // `ctx.on('session/event', (session, event) => …)`）。
        try {
            const on = ctx.on;
            on.call(ctx, 'session/event', (...args) => {
                const session = args[0];
                const event = args[1];
                // user/message 是「这个会话真的开始干活了」的最早可靠信号
                if (event?.type !== 'user/message')
                    return;
                const cwd = session?.header?.cwd;
                if (typeof cwd !== 'string' || cwd === '')
                    return;
                const project = resolveIndexedRoot(cwd);
                // 只有**已索引**的项目才谈得上「索引过期」；未索引的该走 init，不是重建
                if (project === undefined)
                    return;
                void maybeAutoReindex(project);
            });
        }
        catch (error) {
            console.warn('[dsh-codegraph] 自动重建订阅失败（该功能不可用）：'
                + (error instanceof Error ? error.message : String(error)));
        }
        let promptApi;
        let announceDisposer;
        let usageDisposer;
        /**
         * 探测状态。刻意是**可重跑**的（不是挂载时锁存一个布尔）：CLI 是后来才装好 / 补丁里的
         * `command` 改成绝对路径之后，用户应当能就地恢复，而不必重启宿主。改的是这里，
         * 卡片那句「刷新本卡片重试」才第一次真的成立。
         */
        const cliProbeState = { available: undefined, error: undefined, at: undefined };
        /** 按需登记 / 撤销一个 section；wanted 与实际状态一致时不动作。 */
        const setSection = (disposer, wanted, register) => {
            if (wanted && disposer === undefined && promptApi !== undefined)
                return register(promptApi);
            if (!wanted && disposer !== undefined) {
                try {
                    disposer();
                }
                catch {
                    /* 撤销失败不阻塞：下次 refresh 还会看到旧引用 */
                }
                return undefined;
            }
            return disposer;
        };
        /** 按「CLI 可用 + settings 开关 + 索引门禁」刷新两段 section（幂等，可反复调用）。 */
        const refreshGuidance = () => {
            if (promptApi === undefined)
                return;
            const resolved = runtimeRef?.current;
            const announce = resolved?.announce ?? announceDefault;
            const usage = resolved?.usage ?? usageDefault;
            // 探测未落地（undefined）或已判定不可用时都不注入：宁可晚一轮，也不向模型
            // 宣告一个跑不起来的能力。
            const ready = cliProbeState.available === true;
            // 索引门禁（P1-a）：判据与 effectiveProjectPath 同源，见上面那段注释。
            // 每次 refresh 现算：会话切换 / 设为默认项目 / uninit 都走 refreshGuidance。
            const indexed = indexState(effectiveProjectPath(runtimeRef)) === 'indexed';
            announceDisposer = setSection(announceDisposer, ready && announce, (api) => api.section({ name: 'plugin:dsh-codegraph', order: 150, text: CODEGRAPH_GUIDANCE }));
            usageDisposer = setSection(usageDisposer, ready && usage && indexed, (api) => api.section({ name: 'plugin:dsh-codegraph:usage', order: 151, text: codegraphUsageGuidance(command) }));
        };
        let probeInFlight;
        /** 跑一次探测、更新状态、同步两段 section；返回本次结果。 */
        const runProbe = async () => {
            // CG21：探测幂等，in-flight 时复用同一个 Promise——连点「重新探测」不该连起
            // 一串 `<command> --version` 子进程。
            if (probeInFlight !== undefined)
                return probeInFlight;
            probeInFlight = (async () => {
                const result = await probeCli(command);
                cliProbeState.available = result.ok;
                cliProbeState.error = result.error;
                cliProbeState.at = result.at;
                if (!result.ok) {
                    console.warn(`[dsh-codegraph] \`${command} --version\` 不可用：跳过 systemPrompt 的能力公告与使用指引（卡片与 MCP 托管不受影响）—— ${result.error}`);
                }
                refreshGuidance();
                return result;
            })();
            try {
                return await probeInFlight;
            }
            finally {
                probeInFlight = undefined;
            }
        };
        void runProbe();
        const routes = makeRoutes(cli, config?.defaultPath?.trim() || process.cwd(), {
            get: () => ({ available: cliProbeState.available, error: cliProbeState.error, at: cliProbeState.at }),
            reprobe: () => runProbe(),
        }, getRuntime, () => metricsCollector.access, projectRegistry);
        ctx.inject(['webServer'], (webCtx) => {
            webCtx.effect(() => {
                const server = webCtx.webServer;
                const disposers = routes.map((route) => server.register(route));
                return () => {
                    for (const dispose of disposers) {
                        try {
                            dispose();
                        }
                        catch {
                            /* 释放失败不阻塞 */
                        }
                    }
                };
            }, 'dsh-codegraph: routes');
        });
        // settings 命名空间：卡片 key 与命名空间同名，插件配置标签页才会派发它。
        // 同时是默认项目路径的持久化通道：scope 里保存过的 defaultPath 优先于插件
        // 配置；变更经 settings/updated → 重写 MCP 托管行 → watchUserPatches 热切换。
        ctx.inject(['settings'], (settingsCtx) => {
            settingsCtx.effect(() => {
                const settings = settingsCtx.settings;
                const scope = settings.register('codegraph', CODEGRAPH_SETTINGS_SCHEMA);
                const resolveStored = (stored) => {
                    const storedPath = typeof stored?.defaultPath === 'string' && stored.defaultPath.trim() !== '' ? stored.defaultPath.trim() : undefined;
                    const storedManage = typeof stored?.mcpIntegration === 'boolean' ? stored.mcpIntegration : undefined;
                    return {
                        defaultPath: storedPath ?? (config?.defaultPath?.trim() || process.cwd()),
                        manage: storedManage ?? manageEnabled,
                        announce: (typeof stored?.announceToAgent === 'boolean' ? stored.announceToAgent : undefined) ?? announceDefault,
                        usage: (typeof stored?.usageGuidance === 'boolean' ? stored.usageGuidance : undefined) ?? usageDefault,
                        follow: (typeof stored?.followSession === 'boolean' ? stored.followSession : undefined) ?? followDefault,
                    };
                };
                const logOutcome = (changed, status) => {
                    console.log(`[dsh-codegraph] mcp integration: mode=${status.mode}, cwd=${status.cwd ?? '(未托管)'}${changed ? ' (patch updated)' : ''}${status.note ? ' — ' + status.note : ''}`);
                };
                const sync = (stored) => {
                    const resolved = resolveStored(stored);
                    // 先更新解析值再算生效路径（跟随判定读的就是它们）
                    runtime.current = resolved;
                    const effectivePath = effectiveProjectPath(runtime);
                    const { changed, status } = syncMcpRowOnDisk({ serverName: MCP_SERVER_NAME, command, targetCwd: effectivePath, manageEnabled: resolved.manage });
                    logOutcome(changed, status);
                    // 提示词开关也随这次解析值走：卡片里改完即生效，不用重启宿主。
                    refreshGuidance();
                    return { defaultPath: resolved.defaultPath, effectivePath, status, current: resolved };
                };
                const runtime = { scope, current: resolveStored(scope.get()), sync };
                runtimeRef = runtime;
                sync(scope.get());
                const events = settingsCtx;
                const off = events.events.on('settings/updated', (ns, next) => {
                    if (ns !== 'codegraph' || typeof next !== 'object' || next === null)
                        return;
                    sync(next);
                });
                return () => {
                    off();
                    if (runtimeRef === runtime)
                        runtimeRef = undefined;
                };
            }, 'dsh-codegraph: settings');
        });
        // settings 服务不可达时的兜底：仍按插件配置同步一次（无变化不写盘），
        // 保证「装了插件就得管住 cwd」的语义不依赖卡片。
        ctx.effect(() => {
            if (runtimeRef !== undefined)
                return () => { };
            const resolved = {
                defaultPath: config?.defaultPath?.trim() || process.cwd(),
                manage: manageEnabled,
                announce: announceDefault,
                usage: usageDefault,
                follow: followDefault,
            };
            const runtime = {
                current: resolved,
                sync: (stored) => {
                    const next = {
                        defaultPath: typeof stored?.defaultPath === 'string' && stored.defaultPath.trim() !== '' ? stored.defaultPath.trim() : resolved.defaultPath,
                        manage: typeof stored?.mcpIntegration === 'boolean' ? stored.mcpIntegration : resolved.manage,
                        announce: typeof stored?.announceToAgent === 'boolean' ? stored.announceToAgent : resolved.announce,
                        usage: typeof stored?.usageGuidance === 'boolean' ? stored.usageGuidance : resolved.usage,
                        follow: typeof stored?.followSession === 'boolean' ? stored.followSession : resolved.follow,
                    };
                    runtime.current = next;
                    const effectivePath = effectiveProjectPath(runtime);
                    const result = syncMcpRowOnDisk({ serverName: MCP_SERVER_NAME, command, targetCwd: effectivePath, manageEnabled: next.manage });
                    refreshGuidance();
                    return { defaultPath: next.defaultPath, effectivePath, status: result.status, current: next };
                },
            };
            runtimeRef = runtime;
            const { changed, status } = syncMcpRowOnDisk({ serverName: MCP_SERVER_NAME, command, targetCwd: resolved.defaultPath, manageEnabled: resolved.manage });
            console.log(`[dsh-codegraph] mcp integration (config fallback): mode=${status.mode}, cwd=${status.cwd ?? '(未托管)'}${changed ? ' (patch updated)' : ''}${status.note ? ' — ' + status.note : ''}`);
            return () => {
                if (runtimeRef === runtime)
                    runtimeRef = undefined;
            };
        }, 'dsh-codegraph: mcp fallback');
        ctx.inject(['systemPrompt'], (promptCtx) => {
            promptApi = promptCtx.systemPrompt;
            refreshGuidance();
            return () => {
                promptApi = undefined;
                for (const dispose of [announceDisposer, usageDisposer]) {
                    try {
                        dispose?.();
                    }
                    catch {
                        /* 卸载时释放失败不阻塞 */
                    }
                }
                announceDisposer = undefined;
                usageDisposer = undefined;
            };
        });
        console.log('[dsh-codegraph] mounted, command: ' + command);
    },
});
export const { name, inject, apply } = plugin;
//# sourceMappingURL=index.js.map