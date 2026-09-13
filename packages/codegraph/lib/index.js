import z from '@deepseek-ai/schemastery';
import { definePlugin, dshHome, isLoopbackRequest, jsYamlSchema, readJsonBody, writeFileAtomic, writeJson, } from '@hyzyn/dsh-kit';
import { execFile } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
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
const isIndexedProject = (path) => existsSync(join(path, '.codegraph'));
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
/** 区块整体（含标记行）切成行数组；结尾保留一个空串维持换行。 */
function renderBlockLines(range, rows) {
    const markerStart = range?.markerStart ?? OWN_BLOCK_START;
    const markerEnd = range?.markerEnd ?? OWN_BLOCK_END;
    const bodyLines = renderBlockBody(rows).split('\n');
    if (bodyLines[bodyLines.length - 1] === '')
        bodyLines.pop();
    return [markerStart, ...bodyLines, markerEnd, ''];
}
function isCodegraphServerRow(row) {
    return row.name === MCP_CLIENT_PACKAGE && row.config?.serverName === MCP_SERVER_NAME;
}
/**
 * 纯函数：在 home 补丁文本（按 \n 切成的行数组）上执行一次托管行同步。
 * 无变化时返回原数组引用（changed=false）。文件不存在时传入 ['']。
 */
export function syncManagedMcpRow(lines, decision) {
    const indexed = isIndexedProject(decision.targetCwd);
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
    let status;
    const mcpRow = mcpRows.find((row) => isCodegraphServerRow(row));
    if (mcpRow !== undefined) {
        // 复用 MCP 卡片区块里的行：只对齐 cwd，其余字段（含 disabled）保持用户配置。
        if (decision.manageEnabled && indexed && mcpRow.config?.cwd !== decision.targetCwd) {
            mcpRow.config = { ...mcpRow.config, cwd: decision.targetCwd };
            replacements.push({ range: mcpRange, text: renderBlockLines(mcpRange, mcpRows) });
        }
        // 本插件区块若还残留重复行则让位删除（防 serverName 冲突）。
        if (ownRange && ownRows.some((row) => isCodegraphServerRow(row))) {
            replacements.push({ range: ownRange, text: renderBlockLines(ownRange, ownRows.filter((row) => !isCodegraphServerRow(row))) });
        }
        status = {
            mode: 'dsh-mcp',
            id: typeof mcpRow.id === 'string' ? mcpRow.id : undefined,
            cwd: typeof mcpRow.config?.cwd === 'string' ? mcpRow.config.cwd : undefined,
            disabled: mcpRow.disabled === true,
            indexed,
            ...(decision.manageEnabled && indexed ? {} : { note: decision.manageEnabled ? '目标路径缺少 .codegraph/，保持现有配置' : 'MCP 联动已关闭，保持现有配置' }),
        };
    }
    else {
        const ownRowIndex = ownRows.findIndex((row) => isCodegraphServerRow(row));
        if (!decision.manageEnabled) {
            if (ownRowIndex !== -1 && ownRange) {
                replacements.push({ range: ownRange, text: renderBlockLines(ownRange, ownRows.filter((row) => !isCodegraphServerRow(row))) });
                status = { mode: 'none', indexed, note: 'MCP 联动已关闭，已撤销本插件托管行' };
            }
            else {
                status = { mode: 'none', indexed, note: 'MCP 联动已关闭' };
            }
        }
        else if (ownRowIndex !== -1 && ownRange) {
            const row = ownRows[ownRowIndex];
            if (indexed && row.config?.cwd !== decision.targetCwd) {
                row.config = { ...row.config, cwd: decision.targetCwd };
                replacements.push({ range: ownRange, text: renderBlockLines(ownRange, ownRows) });
            }
            status = {
                mode: 'own',
                id: typeof row.id === 'string' ? row.id : undefined,
                cwd: typeof row.config?.cwd === 'string' ? row.config.cwd : undefined,
                disabled: row.disabled === true,
                indexed,
                ...(indexed ? {} : { note: '目标路径缺少 .codegraph/，保持现有配置' }),
            };
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
            replacements.push({ range: { start: lines.length, end: lines.length, markerStart: OWN_BLOCK_START, markerEnd: OWN_BLOCK_END }, text: renderBlockLines(null, [row]) });
            status = { mode: 'own', id: MCP_ROW_ID, cwd: decision.targetCwd, indexed, note: '已自动托管 codegraph MCP 服务器' };
        }
        else {
            status = { mode: 'none', indexed, note: '默认路径缺少 .codegraph/，未托管；把默认项目切到已索引目录即可自动挂载' };
        }
    }
    if (replacements.length === 0)
        return { lines, changed: false, status };
    const next = [...lines];
    for (const { range, text } of [...replacements].sort((a, b) => b.range.start - a.range.start)) {
        next.splice(range.start, range.end - range.start, ...text);
    }
    return { lines: next, changed: true, status };
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
/** 运行 codegraph CLI，返回 stdout；失败时抛错。 */
async function runCodegraph(command, args, cwd, timeoutMs) {
    const { stdout } = await execFileAsync(command, args, {
        cwd,
        maxBuffer: MAX_BUFFER,
        timeout: timeoutMs,
    });
    return stdout;
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
function makeRoutes(cli, defaultPath) {
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
                    const current = runtimeSyncRef?.current ?? { defaultPath: currentDefaultPath(), manage: true };
                    writeJson(res, 200, {
                        ok: true,
                        defaultPath: current.defaultPath,
                        manageEnabled: current.manage,
                        indexed: isIndexedProject(current.defaultPath),
                        mcp: snapshotMcpStatus(),
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
                if (!isIndexedProject(path)) {
                    writeJson(res, 400, { error: '该目录没有 .codegraph/ 索引，请先在其根目录运行 codegraph init' });
                    return;
                }
                // 官方持久化通道：写入 settings 命名空间 → settings/updated → 同步托管行。
                // settings 未就绪时只同步一次（不持久化，重启后回落）。
                const runtime = runtimeSyncRef;
                if (runtime === undefined) {
                    writeJson(res, 500, { error: '插件尚未完成挂载' });
                    return;
                }
                let persisted = false;
                if (runtime.scope !== undefined) {
                    try {
                        await runtime.scope.update({ defaultPath: path });
                        persisted = true;
                    }
                    catch (error) {
                        writeJson(res, 500, { error: '保存默认项目路径失败: ' + (error instanceof Error ? error.message : String(error)) });
                        return;
                    }
                }
                const outcome = runtime.sync({ defaultPath: path });
                writeJson(res, 200, { ok: true, defaultPath: outcome.defaultPath, persisted, mcp: outcome.status });
            },
        },
    ];
}
/** 不落盘的快照：用当前生效配置在内存行副本上做一次同步（丢弃结果）。 */
function snapshotMcpStatus() {
    const current = runtimeSyncRef?.current ?? { defaultPath: process.cwd(), manage: true };
    const patchFile = homePatchPath();
    const text = existsSync(patchFile) ? readFileSync(patchFile, 'utf8') : '';
    return syncManagedMcpRow(text.split('\n'), {
        serverName: MCP_SERVER_NAME,
        command: '',
        targetCwd: current.defaultPath,
        manageEnabled: current.manage,
    }).status;
}
/* ------------------------------------------------------------------ *
 * 插件本体
 * ------------------------------------------------------------------ */
const CODEGRAPH_GUIDANCE = '本机已安装 dsh-codegraph 插件（Codegraph 集成）：Web GUI 的 设置 → 插件 里有「Codegraph」卡片，可查看索引状态、搜索符号、查看 callers/callees/impact，并手动 sync/index；卡片还能把当前项目一键设为默认项目。模型侧也可使用已配置的 codegraph MCP 工具（如 mcp__codegraph__codegraph_explore）直接查询代码，codegraph MCP 服务器的工作目录由本插件托管并跟随默认项目路径热切换。用户提到「Codegraph / 代码图谱 / 调用链 / 影响面 / 索引」时，可引导其打开 Codegraph 卡片或使用 MCP 工具。';
const CODEGRAPH_USAGE_GUIDANCE = `<!-- CODEGRAPH_START -->
## CodeGraph

In repositories indexed by CodeGraph (a \`.codegraph/\` directory exists at the repo root), reach for it BEFORE grep/find or reading files when you need to understand or locate code:

- **MCP tool** (when available): \`mcp__codegraph__codegraph_explore\` answers most code questions in one call — the relevant symbols' verbatim source plus the call paths between them, including dynamic-dispatch hops grep can't follow. Name a file or symbol in the query to read its current line-numbered source. If it's listed but deferred, load it by name via tool search.
- **Shell** (always works): \`codegraph explore "<symbol names or question>"\` prints the same output.
- If a codegraph_* tool replies "No CodeGraph project is loaded for this session", retry once with \`projectPath\` set to the current project's absolute path; if that project has no \`.codegraph/\` either, fall back to normal search tools and let the user decide about running \`codegraph init\` there.

If there is no \`.codegraph/\` directory, skip CodeGraph entirely — indexing is the user's decision.
<!-- CODEGRAPH_END -->`;
const plugin = definePlugin({
    name: 'codegraph',
    inject: [],
    apply(ctx, config) {
        if (config?.enabled === false)
            return;
        const cli = resolveCliConfig(config);
        const command = cli.command;
        const announce = config?.announceToAgent !== false;
        const manageEnabled = config?.mcpIntegration !== false;
        const routes = makeRoutes(cli, config?.defaultPath?.trim() || process.cwd());
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
                    };
                };
                const logOutcome = (changed, status) => {
                    console.log(`[dsh-codegraph] mcp integration: mode=${status.mode}, cwd=${status.cwd ?? '(未托管)'}${changed ? ' (patch updated)' : ''}${status.note ? ' — ' + status.note : ''}`);
                };
                const sync = (stored) => {
                    const resolved = resolveStored(stored);
                    const { changed, status } = syncMcpRowOnDisk({ serverName: MCP_SERVER_NAME, command, targetCwd: resolved.defaultPath, manageEnabled: resolved.manage });
                    runtime.current = resolved;
                    logOutcome(changed, status);
                    return { defaultPath: resolved.defaultPath, status };
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
            const resolved = { defaultPath: config?.defaultPath?.trim() || process.cwd(), manage: manageEnabled };
            const runtime = {
                current: resolved,
                sync: (stored) => {
                    const next = {
                        defaultPath: typeof stored?.defaultPath === 'string' && stored.defaultPath.trim() !== '' ? stored.defaultPath.trim() : resolved.defaultPath,
                        manage: typeof stored?.mcpIntegration === 'boolean' ? stored.mcpIntegration : resolved.manage,
                    };
                    const result = syncMcpRowOnDisk({ serverName: MCP_SERVER_NAME, command, targetCwd: next.defaultPath, manageEnabled: next.manage });
                    runtime.current = next;
                    return { defaultPath: next.defaultPath, status: result.status };
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
        if (announce) {
            ctx.inject(['systemPrompt'], (promptCtx) => {
                promptCtx.effect(() => {
                    const systemPrompt = promptCtx.systemPrompt;
                    return systemPrompt.section({ name: 'plugin:dsh-codegraph', order: 150, text: CODEGRAPH_GUIDANCE });
                }, 'dsh-codegraph: announcement');
            });
        }
        if (config?.usageGuidance !== false) {
            ctx.inject(['systemPrompt'], (promptCtx) => {
                promptCtx.effect(() => {
                    const systemPrompt = promptCtx.systemPrompt;
                    return systemPrompt.section({ name: 'plugin:dsh-codegraph:usage', order: 151, text: CODEGRAPH_USAGE_GUIDANCE });
                }, 'dsh-codegraph: usage guidance');
            });
        }
        console.log('[dsh-codegraph] mounted, command: ' + command);
    },
});
export const { name, inject, apply } = plugin;
//# sourceMappingURL=index.js.map