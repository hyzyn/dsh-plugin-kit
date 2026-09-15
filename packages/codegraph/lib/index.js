import z from '@deepseek-ai/schemastery';
import { definePlugin, dshHome, isLoopbackRequest, jsYamlSchema, readJsonBody, writeFileAtomic, writeJson, } from '@hyzyn/dsh-kit';
import { execFile, spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';
import { promisify } from 'node:util';
const execFileAsync = promisify(execFile);
/* ------------------------------------------------------------------ *
 * settings 命名空间（让「设置 → 插件 → 插件配置」派发本插件卡片）
 *
 * 这里只列「卡片派发所需 + 允许用户在 settings 里覆盖」的字段：字段一律不带
 * schema 默认值——settings 的 resolved 值里「undefined」才表示「用户没设过」，
 * 有默认值就会把 settings 默认值误当成用户覆盖，反过来压掉 plugin config。
 * 真正从 settings 读取的只有 defaultPath / mcpIntegration（见 resolveStored）。
 * 安装级旋钮（command / 超时 / indexForce）只走 plugin config，不进本 schema。
 * ------------------------------------------------------------------ */
const CODEGRAPH_SETTINGS_SCHEMA = z.object({
    enabled: z.boolean(),
    announceToAgent: z.boolean(),
    usageGuidance: z.boolean(),
    followSession: z.boolean(),
    command: z.string(),
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
/** 索引库文件后缀：SQLite 主库 `codegraph.db` 与 `-wal` / `-shm` 都以此结尾。 */
const INDEX_DB_SUFFIX = '.db';
/**
 * 判定项目索引。**不能只看 `.codegraph/` 目录是否存在**：codegraph CLI 的安装目录
 * 就是 `~/.codegraph`，于是家目录永远「已索引」——插件会把 MCP 的 cwd 钉在家目录上
 * 并报告一切正常，而 `codegraph status --json -- ~` 实际返回 `initialized:false`，
 * MCP 工具照旧拿 "No CodeGraph project is loaded"（模块头描述的失败模式）。
 *
 * 判据取「目录里存在 .db 文件」而不是写死 `codegraph.db`：索引库文件名可能跨 CLI
 * 版本变化，而安装目录里一个库文件都没有。读目录失败（权限等）按未索引处理——
 * 宁可不动现有 cwd，也不把好配置改坏。
 */
export function indexState(path) {
    try {
        if (readdirSync(join(path, INDEX_DIR)).some((name) => name.endsWith(INDEX_DB_SUFFIX)))
            return 'indexed';
        return 'not-a-project';
    }
    catch {
        return 'missing';
    }
}
/** 未索引时拼进状态 note 的原因描述（点名家目录这个最常见的坑）。 */
function indexProblem(state) {
    return state === 'not-a-project'
        ? '的 .codegraph/ 里没有索引库，不是 codegraph 项目（家目录最常见：~/.codegraph 是 CLI 自身的安装目录）'
        : '没有 .codegraph/ 索引';
}
/**
 * js-yaml 方言：!!js 类型与 schema 都取自 kit（`jsYamlSchema` 即
 * `JSON_SCHEMA.extend(JsExprType)`）。js-yaml 全仓锁在同一版本，kit 与本包解析到
 * 同一个实例，schema 与 Type 不会跨副本；dsh-app-boot / dsh-mcp / loader 侧方言
 * 一致，含 `!!js` 表达式的行 load → dump 无损往返。
 */
const YAML_SCHEMA = jsYamlSchema;
function findBlock(lines, startKey, endKey) {
    const start = lines.findIndex((line) => line.includes(startKey));
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
        return [];
    try {
        const parsed = yaml.load(block, { schema: YAML_SCHEMA });
        if (!Array.isArray(parsed))
            return [];
        const rows = [];
        for (const entry of parsed) {
            if (typeof entry !== 'object' || entry === null)
                continue;
            const inserted = entry.insert;
            if (!Array.isArray(inserted))
                continue;
            for (const row of inserted) {
                if (typeof row === 'object' && row !== null && !Array.isArray(row))
                    rows.push(row);
            }
        }
        return rows;
    }
    catch {
        return [];
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
function isCodegraphServerRow(row) {
    return row.name === MCP_CLIENT_PACKAGE && row.config?.serverName === MCP_SERVER_NAME;
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
    const ownRows = ownRange ? parseBlockRows(lines, ownRange) : [];
    const mcpRows = mcpRange ? parseBlockRows(lines, mcpRange) : [];
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
                        status: {
                            mode: 'external',
                            id: typeof handWritten.id === 'string' ? handWritten.id : undefined,
                            cwd: typeof handWritten.config?.cwd === 'string' ? handWritten.config.cwd : undefined,
                            disabled: handWritten.disabled === true,
                            indexed,
                            indexState: state,
                            note: '检测到区块外手工配置的 codegraph MCP 行，跳过托管（避免 serverName 冲突）',
                        },
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
    if (mcpRow !== undefined) {
        // 复用 MCP 卡片区块里的行：只对齐 cwd，其余字段（含 disabled）保持用户配置。
        if (decision.manageEnabled && indexed && mcpRow.config?.cwd !== decision.targetCwd) {
            if (dryRun) {
                pendingNote = 'cwd 与默认项目不一致，下次同步会对齐';
            }
            else {
                mcpRow.config = { ...mcpRow.config, cwd: decision.targetCwd };
                replacements.push({ range: mcpRange, text: renderBlockLines(mcpRange, mcpRows, carriageReturn, mcpRange.end >= lines.length) });
            }
        }
        // 本插件区块若还残留重复行则让位删除（防 serverName 冲突）。
        if (ownRange && ownRows.some((row) => isCodegraphServerRow(row))) {
            replacements.push({ range: ownRange, text: renderBlockLines(ownRange, ownRows.filter((row) => !isCodegraphServerRow(row)), carriageReturn, ownRange.end >= lines.length) });
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
                replacements.push({ range: ownRange, text: renderBlockLines(ownRange, ownRows.filter((row) => !isCodegraphServerRow(row)), carriageReturn, ownRange.end >= lines.length) });
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
                    replacements.push({ range: ownRange, text: renderBlockLines(ownRange, ownRows, carriageReturn, ownRange.end >= lines.length) });
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
            replacements.push({ range: { start: lines.length, end: lines.length, markerStart: OWN_BLOCK_START, markerEnd: OWN_BLOCK_END }, text: renderBlockLines(null, [row], carriageReturn, true) });
            status = { mode: 'own', id: MCP_ROW_ID, cwd: decision.targetCwd, indexed, indexState: state, note: '已自动托管 codegraph MCP 服务器' };
        }
        else {
            status = { mode: 'none', indexed, indexState: state, note: `默认路径${indexProblem(state)}，未托管；把默认项目切到已索引目录即可自动挂载` };
        }
    }
    // dryRun 是只读快照：即使某条分支漏了判断，也绝不返回改动过的行
    if (dryRun || replacements.length === 0)
        return { lines, changed: false, status };
    const next = [...lines];
    for (const { range, text } of [...replacements].sort((a, b) => b.range.start - a.range.start)) {
        next.splice(range.start, range.end - range.start, ...text);
    }
    return { lines: next, changed: true, status };
}
/**
 * 托管行实际使用的 cwd：跟随开启且会话目录是有效索引时用它，否则用绑定路径。
 *
 * 「有效索引」这个判定（而不是「目录存在」）是关键：家目录里有 codegraph CLI 自己的
 * `~/.codegraph` 安装目录，按目录存在判会把托管行 cwd 钉在一个没有索引的目录上。
 */
function effectiveProjectPath(runtime) {
    const current = runtime?.current;
    if (current === undefined)
        return process.cwd();
    const sessionPath = runtime?.sessionPath;
    if (current.follow && typeof sessionPath === 'string' && sessionPath !== '' && indexState(sessionPath) === 'indexed')
        return sessionPath;
    return current.defaultPath;
}
let runtimeSyncRef;
/** 读 home 补丁 → 纯函数同步 → 有变化才原子写回（同目录 tmp + rename，走 kit）。 */
function syncMcpRowOnDisk(decision) {
    const patchFile = homePatchPath();
    const existed = existsSync(patchFile);
    const text = existed ? readFileSync(patchFile, 'utf8') : '';
    const outcome = syncManagedMcpRow(text.split('\n'), decision);
    if (outcome.changed) {
        // 沿用原文件权限（新文件 0600）。writeFileAtomic 内部的 writeFileSync 只会在
        // 创建临时文件时用这个 mode，umask 只会进一步收紧、不会放宽，所以写回后的
        // 权限不会比写之前更松。
        const mode = existed ? (statSync(patchFile).mode & 0o777) : 0o600;
        writeFileAtomic(patchFile, outcome.lines.join('\n'), mode);
    }
    return { changed: outcome.changed, status: outcome.status };
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
/** 只接受有限正数，其余（0 / 负数 / NaN / Infinity / 非数字）回落到默认值。 */
function positiveOr(value, fallback) {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}
/**
 * 纯函数：把插件配置规范化成 CLI 调用参数。
 * `command` 去空白后为空则回落 `codegraph`；超时只认正有限数；`indexForce` 只认
 * 严格的 `true`（避免 `"false"` 之类的字符串被当成真）。
 */
export function resolveCliConfig(config) {
    return {
        command: config?.command?.trim() || 'codegraph',
        cliTimeoutMs: positiveOr(config?.cliTimeoutMs, DEFAULT_CLI_TIMEOUT_MS),
        indexTimeoutMs: positiveOr(config?.indexTimeoutMs, DEFAULT_INDEX_TIMEOUT_MS),
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
/* ------------------------------------------------------------------ *
 * Windows 上的 CLI 调用
 *
 * npm / pnpm 全局安装的 CLI 在 Windows 上只有 `.cmd` / `.ps1` / 无扩展名的
 * shim，没有真正的 `.exe`（codegraph 就是如此）。而 `execFile` 默认
 * `shell: false`，走的是 CreateProcess 式的可执行文件查找：既不匹配 `.cmd`，
 * Node 又因 CVE-2024-27980 加固拒绝在无 shell 时执行 `.cmd`——于是 Windows 上
 * 每一次调用都固定失败成 `spawn codegraph ENOENT`，卡片整块不可用。
 *
 * 解法是把命令行交给 `%COMSPEC% /d /s /c`，由 cmd.exe 按 PATHEXT 解析出 shim。
 * 这正是 cross-spawn（MCP 官方 SDK 的 stdio transport 用的就是它）在 Windows
 * 的做法；这里不引依赖，只搬运那条转义规则。因为 cmd.exe 会重新解析整条命令行，
 * 所以 argv 必须自己转义——否则符号名里的 `&` / `|` / `%` 会被当成命令分隔符，
 * 变成命令注入（`?name=` 是外部可控输入）。
 * ------------------------------------------------------------------ */
/** Windows 上判定「无需 shell」的可执行后缀。 */
const WINDOWS_EXECUTABLE_REGEXP = /\.(?:exe|com)$/i;
/** cmd.exe 元字符：交给 shell 前逐个 `^` 转义。 */
const CMD_META_CHARS_REGEXP = /([()\][%!^"`<>&|;, *?])/g;
/** 命令名按 cmd.exe 规则转义（空格也是元字符，所以带空格的路径由 `^ ` 保护）。 */
export function escapeCommand(command) {
    return command.replace(CMD_META_CHARS_REGEXP, '^$1');
}
/**
 * 单个参数按 cmd.exe 规则转义成 `"..."`。算法同 cross-spawn，依据
 * <https://qntm.org/cmd>：先按 Windows argv 规则双写「紧邻双引号的反斜杠」
 * 与「结尾反斜杠」，再整体加引号，最后把包括这对引号在内的元字符逐个 `^`。
 * 两层的次序不能换：`^` 由 cmd.exe 吃掉，引号留给子进程的 argv 解析。
 */
export function escapeArgument(value) {
    let arg = value;
    arg = arg.replace(/(?=(\\+?)?)\1"/g, '$1$1\\"');
    arg = arg.replace(/(?=(\\+?)?)\1$/, '$1$1');
    arg = `"${arg}"`;
    return arg.replace(CMD_META_CHARS_REGEXP, '^$1');
}
/** 把一个 argv 拼成 `cmd.exe /d /s /c` 能直接执行的一整条命令行。 */
export function windowsCommandLine(command, args) {
    return [escapeCommand(command), ...args.map(escapeArgument)].join(' ');
}
/**
 * Windows 上连子孙进程一起收：`taskkill /T` 杀掉以该 pid 为根的整棵树。
 *
 * 为什么不能只 `child.kill()`：shim 分支的直接子进程是 cmd.exe，真正的 CLI 是它的
 * 孙进程；`execFile` 的 `timeout` 与 `child.kill()` 都只作用于直接子进程，大仓库的
 * `index` 会继续跑完（十几分钟起），卡片却已经报超时。POSIX 分支不需要这个：直接
 * 子进程就是 CLI，杀掉即可（它自己的 daemon 是设计上要长活的，不在此列）。
 */
export function taskkillArgs(pid) {
    return ['/pid', String(pid), '/T', '/F'];
}
async function killProcessTree(pid) {
    if (process.platform !== 'win32' || pid === undefined)
        return;
    try {
        await execFileAsync('taskkill', taskkillArgs(pid), { windowsHide: true });
    }
    catch {
        /* 进程已经退出、或 taskkill 不可用：忽略，超时错误照常抛出 */
    }
}
/** 一次 CLI 调用的超时错误：形状与 execFile 一致，让 `cliErrorMessage` 认出来。 */
function timeoutError(command, timeoutMs) {
    const error = new Error(`Command failed: ${command} (timeout after ${timeoutMs}ms)`);
    error.killed = true;
    error.signal = 'SIGTERM';
    return error;
}
/**
 * 收尾判定（纯函数，便于在非 Windows 上覆盖「超时与 close 竞态」）。
 *
 * 为什么必须显式带 `timedOut`：超时时我们是先 `taskkill` 再抛错，而被杀的子进程会先
 * 触发 `close`——不认这个标志的话，close 分支会抢先以「Command failed: …」结案，
 * `cliErrorMessage` 就认不出超时，卡片报的错也不会点名 `cliTimeoutMs` /
 * `indexTimeoutMs`（Windows CI 上实测到的就是这个）。
 */
export function settleCliRun(input) {
    if (input.timedOut)
        return { ok: false, error: timeoutError(input.command, input.timeoutMs) };
    if (input.code === 0)
        return { ok: true, stdout: input.stdout };
    return { ok: false, error: new Error(`Command failed: ${input.command} ${input.args.join(' ')}\n${input.stderr}`) };
}
/**
 * Windows shim 分支的执行器：`spawn` + 自管超时，好在超时时拿到 pid 去 `taskkill /T`。
 * 命令行与转义规则和直连分支完全一致；stdout 上限同样按 MAX_BUFFER 卡。
 */
function runViaWindowsShim(command, args, cwd, timeoutMs) {
    return new Promise((resolve, reject) => {
        const child = spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `"${windowsCommandLine(command, args)}"`], {
            cwd,
            // 命令行已经自己转义好了，让 Node 原样交给 CreateProcess，别再包一层引号。
            windowsVerbatimArguments: true,
            windowsHide: true,
        });
        let stdout = '';
        let stderr = '';
        let settled = false;
        let timedOut = false;
        const finish = (outcome) => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            if (outcome.ok)
                resolve(outcome.stdout);
            else
                reject(outcome.error);
        };
        const settle = (code) => settleCliRun({ command, args, timeoutMs, timedOut, code, stdout, stderr });
        const timer = setTimeout(() => {
            // 先置标志、再连进程树一起收：被杀的子进程会先触发 close，标志不到位就会被
            // close 分支抢先结案，超时形状丢失
            timedOut = true;
            void killProcessTree(child.pid).finally(() => finish(settle(null)));
        }, timeoutMs);
        child.stdout?.on('data', (chunk) => {
            if (settled)
                return;
            if (stdout.length + chunk.length > MAX_BUFFER) {
                void killProcessTree(child.pid).finally(() => finish({ ok: false, error: new Error(`stdout maxBuffer exceeded (${MAX_BUFFER} bytes)`) }));
                return;
            }
            stdout += chunk.toString();
        });
        child.stderr?.on('data', (chunk) => {
            if (settled)
                return;
            if (stderr.length < MAX_BUFFER)
                stderr += chunk.toString();
        });
        child.on('error', (error) => finish({ ok: false, error }));
        child.on('close', (code) => finish(settle(code)));
    });
}
/**
 * 运行 codegraph CLI，返回 stdout；失败时抛错。
 *
 * Windows 上命令不是 `.exe` 时改走 cmd.exe（见上方说明），且用 `spawn` 自管超时
 * 以便 `taskkill /T` 连孙进程一起收；其余平台与 `.exe` 命令仍走 `execFile` 直连
 * （那边直接子进程就是 CLI，`timeout` 够用）。两条分支的失败都转成同一形状的错误，
 * 所以 `cliErrorMessage` 的超时判定（killed / signal）对两者一致。
 */
async function runCodegraph(command, args, cwd, timeoutMs) {
    const viaWindowsShim = process.platform === 'win32' && !WINDOWS_EXECUTABLE_REGEXP.test(command);
    if (viaWindowsShim)
        return runViaWindowsShim(command, args, cwd, timeoutMs);
    const { stdout } = await execFileAsync(command, args, { cwd, maxBuffer: MAX_BUFFER, timeout: timeoutMs });
    return stdout;
}
/**
 * 探测 CLI 是否真的可执行（`<command> --version`）。
 *
 * 只用于 systemPrompt 门禁：`command` 指向的 CLI 不存在时，不该向模型宣告
 * 「本机已安装 Codegraph 插件 / 可以用 codegraph 工具」——那是让模型去撞必然
 * 失败的调用。任何失败（ENOENT / 非零退出 / 超时）都按不可用处理，且不影响
 * 卡片的其它功能（路由会把真实报错显示出来）。
 */
async function probeCli(command) {
    try {
        await runCodegraph(command, ['--version'], process.cwd(), CLI_PROBE_TIMEOUT_MS);
        return true;
    }
    catch {
        return false;
    }
}
/**
 * 把 execFile 的错误翻成卡片上看得懂的文案：超时（killed/SIGTERM）单独指路到
 * 对应的配置项，其余保留原 message（execFile 会把 stderr 拼进去）。
 */
function cliErrorMessage(error, timeoutMs, timeoutHint) {
    const failure = error;
    if (failure?.killed === true || (typeof failure?.signal === 'string' && failure.signal !== '')) {
        return `codegraph 命令超时（>${timeoutMs}ms）：可用插件配置 ${timeoutHint} 调大`;
    }
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
/* ------------------------------------------------------------------ *
 * 路由
 * ------------------------------------------------------------------ */
function makeRoutes(cli, defaultPath, 
/**
 * CLI 探测结果：true / false / undefined（未落地）。闭包读，因为探测是异步的、
 * 可能晚于路由注册；undefined 序列化时会被 JSON 丢掉，卡片据此区分「还没探测完」
 * 与「确认不可用」。
 */
isCliAvailable) {
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
     * 读 runtimeSyncRef 而不是闭包里那份 config 值——「设为默认项目」之后，不带
     * ?path= 的调用才会跟着切换（旧实现会一直停在宿主启动时的那份配置）。
     */
    const currentDefaultPath = () => {
        const current = runtimeSyncRef?.current.defaultPath.trim();
        return current !== undefined && current !== '' ? current : defaultPath || process.cwd();
    };
    const resolvePath = (params) => params.get('path')?.trim() || currentDefaultPath();
    /** 查询类命令的失败响应：超时文案指向 cliTimeoutMs。 */
    const failCli = (res, cwd, error) => writeJson(res, 500, { ok: false, error: cliErrorMessage(error, cli.cliTimeoutMs, 'cliTimeoutMs'), path: cwd });
    /** 索引类命令的失败响应：超时文案指向 indexTimeoutMs。 */
    const failIndex = (res, cwd, error) => writeJson(res, 500, { ok: false, error: cliErrorMessage(error, cli.indexTimeoutMs, 'indexTimeoutMs'), path: cwd });
    const run = async (args, cwd, timeoutMs = cli.cliTimeoutMs) => {
        const output = await runCodegraph(cli.command, args, cwd, timeoutMs);
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
    return [
        {
            kind: 'exact',
            path: '/api/dsh-codegraph/status',
            handler: async (req, res) => {
                if (!guard(req, res, 'GET'))
                    return;
                const params = queryString(req.url);
                const cwd = resolvePath(params);
                try {
                    const { output, data } = await runJson(['status', '--json', '--', cwd], cwd);
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
                const limit = params.get('limit')?.trim() || '10';
                try {
                    const { output, data } = await runJson(['query', '--json', '--path', cwd, '--limit', limit, q], cwd);
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
                try {
                    const { output, data } = await runJson(['callers', '--json', '--path', cwd, symbol], cwd);
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
                try {
                    const { output, data } = await runJson(['callees', '--json', '--path', cwd, symbol], cwd);
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
                const depth = params.get('depth')?.trim() || '2';
                try {
                    const { output, data } = await runJson(['impact', '--json', '--path', cwd, '--depth', depth, symbol], cwd);
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
                const file = params.get('file')?.trim();
                const args = ['node', '--path', cwd];
                if (file)
                    args.push('--file', file);
                args.push(name);
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
                const body = await readBody(req);
                const cwd = (typeof body?.path === 'string' && body.path.trim()) || currentDefaultPath();
                try {
                    const { output } = await run(syncArgs(cwd), cwd, cli.indexTimeoutMs);
                    writeJson(res, 200, { ok: true, path: cwd, output });
                }
                catch (error) {
                    failIndex(res, cwd, error);
                }
            },
        },
        {
            kind: 'exact',
            path: '/api/dsh-codegraph/index',
            handler: async (req, res) => {
                if (!guard(req, res, 'POST'))
                    return;
                const body = await readBody(req);
                const cwd = (typeof body?.path === 'string' && body.path.trim()) || currentDefaultPath();
                try {
                    const { output } = await run(indexArgs(cwd, cli.indexForce), cwd, cli.indexTimeoutMs);
                    writeJson(res, 200, { ok: true, path: cwd, output });
                }
                catch (error) {
                    failIndex(res, cwd, error);
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
                if (req.method === 'GET') {
                    const current = runtimeSyncRef?.current ?? {
                        defaultPath: currentDefaultPath(),
                        manage: true,
                        announce: true,
                        usage: true,
                        follow: true,
                    };
                    // 卡片关心的是「托管行实际用哪个目录」：indexState 一律针对生效路径，
                    // defaultPath 只是跟随关闭/会话目录无索引时的回落值。
                    const effectivePath = effectiveProjectPath(runtimeSyncRef);
                    const state = indexState(effectivePath);
                    writeJson(res, 200, {
                        ok: true,
                        defaultPath: current.defaultPath,
                        effectivePath,
                        sessionPath: runtimeSyncRef?.sessionPath,
                        followSession: current.follow,
                        manageEnabled: current.manage,
                        announceToAgent: current.announce,
                        usageGuidance: current.usage,
                        /** CLI 探测结果：false 时两段 systemPrompt 都不会注入；undefined = 还没探测完。 */
                        cliAvailable: isCliAvailable(),
                        /** 实际调用的 CLI 命令（插件配置 command，默认 codegraph）：探测失败时卡片要报出来。 */
                        command: cli.command,
                        indexed: state === 'indexed',
                        indexState: state,
                        mcp: snapshotMcpStatus(cli.command),
                    });
                    return;
                }
                if (req.method !== 'POST') {
                    writeJson(res, 405, { error: 'method not allowed: ' + String(req.method) });
                    return;
                }
                const body = await readBody(req);
                const path = typeof body?.path === 'string' ? body.path.trim() : '';
                if (path === '') {
                    writeJson(res, 400, { error: '缺少 path 参数' });
                    return;
                }
                try {
                    if (!existsSync(path)) {
                        writeJson(res, 400, { error: '路径不存在: ' + path });
                        return;
                    }
                    if (!statSync(path).isDirectory()) {
                        writeJson(res, 400, { error: '路径不是目录: ' + path });
                        return;
                    }
                }
                catch (error) {
                    writeJson(res, 400, { error: '路径不可访问: ' + (error instanceof Error ? error.message : String(error)) });
                    return;
                }
                const state = indexState(path);
                if (state !== 'indexed') {
                    writeJson(res, 400, {
                        error: state === 'not-a-project'
                            ? '该目录的 .codegraph/ 里没有索引库，不是 codegraph 项目（家目录最常见：~/.codegraph 是 CLI 自身的安装目录）；请先在项目根目录运行 codegraph init'
                            : '该目录没有 .codegraph/ 索引，请先在其根目录运行 codegraph init',
                    });
                    return;
                }
                // 官方持久化通道：写入 settings 命名空间 → settings/updated → 同步托管行。
                // settings 未就绪时只同步一次（不持久化，重启后回落）。
                const runtime = runtimeSyncRef;
                if (runtime === undefined) {
                    writeJson(res, 500, { error: '插件尚未完成挂载' });
                    return;
                }
                // 「设为默认项目」是一次显式指定：同时关掉跟随，否则下一个会话切换就会把它顶掉
                let persisted = false;
                if (runtime.scope !== undefined) {
                    try {
                        await runtime.scope.update({ defaultPath: path, followSession: false });
                        persisted = true;
                    }
                    catch (error) {
                        writeJson(res, 500, { error: '保存默认项目路径失败: ' + (error instanceof Error ? error.message : String(error)) });
                        return;
                    }
                }
                const outcome = runtime.sync({ defaultPath: path, followSession: false });
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
                const body = await readBody(req);
                if (body === undefined) {
                    writeJson(res, 400, { error: 'invalid JSON body' });
                    return;
                }
                const path = typeof body.path === 'string' ? body.path.trim() : '';
                const runtime = runtimeSyncRef;
                if (runtime === undefined) {
                    writeJson(res, 500, { error: '插件尚未完成挂载' });
                    return;
                }
                // 空 path = 当前没有活动会话（或它没有工作目录）：清掉上报值，回落到绑定路径。
                // 非空值不在这里做目录/索引校验——判定统一在 effectiveProjectPath 里按「是否
                // 有效索引」现算，这样索引被删/quinit 之后也会自动回落，不留陈旧状态。
                runtime.sessionPath = path === '' ? undefined : path;
                const outcome = runtime.sync(runtime.scope?.get());
                // 注意：`indexed` 报的是**生效路径**（托管行实际用的目录），而「回落」的判定必须
                // 看**上报的会话目录**——生效路径在回落之后必然是默认路径，用它的索引态会得出
                // 「已索引所以不用提示」，默认路径恰好已索引时就把回落这件事吞了。
                const state = indexState(outcome.effectivePath);
                const sessionState = path === '' ? undefined : indexState(path);
                writeJson(res, 200, {
                    ok: true,
                    sessionPath: runtime.sessionPath ?? null,
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
                const body = await readBody(req);
                // 只认这三个布尔键：defaultPath 走 /default-path（它有目录与索引校验），
                // 其余安装级旋钮（command / 超时 / indexForce）故意不给写入口。
                const patch = {};
                for (const key of ['announceToAgent', 'usageGuidance', 'mcpIntegration', 'followSession']) {
                    const value = body?.[key];
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
                const runtime = runtimeSyncRef;
                if (runtime === undefined || runtime.scope === undefined) {
                    writeJson(res, 500, { error: '插件尚未完成挂载' });
                    return;
                }
                try {
                    await runtime.scope.update(patch);
                }
                catch (error) {
                    writeJson(res, 500, { error: '保存失败: ' + (error instanceof Error ? error.message : String(error)) });
                    return;
                }
                // settings/updated 已经触发过一次 sync；这里再显式同步一次只是兜底
                // （同值幂等：MCP 行无变化不写盘，section 增删也按需跳过）。
                const outcome = runtime.sync(runtime.scope.get());
                writeJson(res, 200, {
                    ok: true,
                    announceToAgent: outcome.current.announce,
                    usageGuidance: outcome.current.usage,
                    manageEnabled: outcome.current.manage,
                    followSession: outcome.current.follow,
                    effectivePath: outcome.effectivePath,
                    cliAvailable: isCliAvailable(),
                    command: cli.command,
                    mcp: outcome.status,
                });
            },
        },
    ];
}
/** 不落盘的快照：读盘上真实内容，回答「现在是什么状态」（不推测下次写入的结果）。 */
function snapshotMcpStatus(command) {
    const current = runtimeSyncRef?.current ?? { defaultPath: process.cwd(), manage: true, announce: true, usage: true, follow: true };
    const patchFile = homePatchPath();
    const text = existsSync(patchFile) ? readFileSync(patchFile, 'utf8') : '';
    return syncManagedMcpRow(text.split('\n'), {
        serverName: MCP_SERVER_NAME,
        command,
        targetCwd: effectiveProjectPath(runtimeSyncRef),
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
const CODEGRAPH_GUIDANCE = '本机已安装 dsh-codegraph 插件（Codegraph 集成）：Web GUI 的 设置 → 插件 里有「Codegraph」卡片，可看索引状态、搜索符号、sync / 重建索引，并把当前项目一键设为默认项目。用户提到「Codegraph / 代码图谱 / 调用链 / 影响面 / 索引」时，可引导其打开该卡片。';
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
        if (config?.enabled === false)
            return;
        const cli = resolveCliConfig(config);
        const command = cli.command;
        // 安装级默认值；settings 里存过同名键时以 settings 为准（见 resolveStored）。
        const announceDefault = config?.announceToAgent !== false;
        const usageDefault = config?.usageGuidance !== false;
        const manageEnabled = config?.mcpIntegration !== false;
        const followDefault = config?.followSession !== false;
        let promptApi;
        let announceDisposer;
        let usageDisposer;
        let cliAvailable;
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
        /** 按「CLI 可用 + settings 开关」刷新两段 section（幂等，可反复调用）。 */
        const refreshGuidance = () => {
            if (promptApi === undefined)
                return;
            const resolved = runtimeSyncRef?.current;
            const announce = resolved?.announce ?? announceDefault;
            const usage = resolved?.usage ?? usageDefault;
            // 探测未落地（undefined）或已判定不可用时都不注入：宁可晚一轮，也不向模型
            // 宣告一个跑不起来的能力。
            const ready = cliAvailable === true;
            announceDisposer = setSection(announceDisposer, ready && announce, (api) => api.section({ name: 'plugin:dsh-codegraph', order: 150, text: CODEGRAPH_GUIDANCE }));
            usageDisposer = setSection(usageDisposer, ready && usage, (api) => api.section({ name: 'plugin:dsh-codegraph:usage', order: 151, text: codegraphUsageGuidance(command) }));
        };
        void probeCli(command).then((available) => {
            cliAvailable = available;
            if (!available) {
                console.warn(`[dsh-codegraph] \`${command} --version\` 不可用：跳过 systemPrompt 的能力公告与使用指引（卡片与 MCP 托管不受影响）`);
            }
            refreshGuidance();
        });
        const routes = makeRoutes(cli, config?.defaultPath?.trim() || process.cwd(), () => cliAvailable);
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
                runtimeSyncRef = runtime;
                sync(scope.get());
                const events = settingsCtx;
                const off = events.events.on('settings/updated', (ns, next) => {
                    if (ns !== 'codegraph' || typeof next !== 'object' || next === null)
                        return;
                    sync(next);
                });
                return () => {
                    off();
                    if (runtimeSyncRef !== undefined && runtimeSyncRef.scope === scope)
                        runtimeSyncRef = undefined;
                };
            }, 'dsh-codegraph: settings');
        });
        // settings 服务不可达时的兜底：仍按插件配置同步一次（无变化不写盘），
        // 保证「装了插件就得管住 cwd」的语义不依赖卡片。
        ctx.effect(() => {
            if (runtimeSyncRef !== undefined)
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
            runtimeSyncRef = runtime;
            const { changed, status } = syncMcpRowOnDisk({ serverName: MCP_SERVER_NAME, command, targetCwd: resolved.defaultPath, manageEnabled: resolved.manage });
            console.log(`[dsh-codegraph] mcp integration (config fallback): mode=${status.mode}, cwd=${status.cwd ?? '(未托管)'}${changed ? ' (patch updated)' : ''}${status.note ? ' — ' + status.note : ''}`);
            return () => {
                if (runtimeSyncRef === runtime)
                    runtimeSyncRef = undefined;
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