/**
 * @hyzyn/dsh-codegraph — DSH Web GUI 的 Codegraph 集成插件（宿主半体）。
 *
 * 机制：本插件在宿主进程里调用 `codegraph` CLI，把索引状态、符号搜索、
 * 调用链、影响面等能力暴露成 /api/dsh-codegraph/* 路由；浏览器半体
 * （./client）把这些路由渲染成设置 → 插件 里的「Codegraph」卡片。
 *
 * 与 MCP 的关系：MCP 让模型直接调用 codegraph_explore / codegraph_node；
 * 本插件补上 Web GUI、人工操作（sync/index）和 systemPrompt 自动提示。
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import z from '@deepseek-ai/schemastery';
import { definePlugin } from '@hyzyn/dsh-kit';
const execFileAsync = promisify(execFile);
/* ------------------------------------------------------------------ *
 * settings 命名空间（让「设置 → 插件 → 插件配置」派发本插件卡片）
 * ------------------------------------------------------------------ */
const CODEGRAPH_SETTINGS_SCHEMA = z.object({
    enabled: z.boolean(),
    announceToAgent: z.boolean(),
    usageGuidance: z.boolean(),
    command: z.string(),
    defaultPath: z.string(),
});
/* ------------------------------------------------------------------ *
 * 常量与类型
 * ------------------------------------------------------------------ */
const MAX_JSON_BODY_BYTES = 512 * 1024;
const MAX_BUFFER = 20 * 1024 * 1024;
/* ------------------------------------------------------------------ *
 * 工具函数
 * ------------------------------------------------------------------ */
function isLoopbackRequest(request) {
    const address = request.socket.remoteAddress;
    if (address !== '127.0.0.1' && address !== '::1' && address !== '::ffff:127.0.0.1')
        return false;
    const host = request.headers.host;
    if (typeof host !== 'string')
        return false;
    let hostUrl;
    try {
        hostUrl = new URL('http://' + host);
    }
    catch {
        return false;
    }
    if (hostUrl.hostname !== '127.0.0.1' && hostUrl.hostname !== 'localhost' && hostUrl.hostname !== '[::1]')
        return false;
    if (request.headers['sec-fetch-site'] === 'cross-site')
        return false;
    const origin = request.headers.origin;
    if (origin === undefined)
        return true;
    try {
        return new URL(origin).host === hostUrl.host;
    }
    catch {
        return false;
    }
}
function writeJson(res, status, body) {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'referrer-policy': 'no-referrer' });
    res.end(JSON.stringify(body));
}
async function readJsonBody(req) {
    const chunks = [];
    let size = 0;
    try {
        for await (const chunk of req) {
            size += chunk.length;
            if (size > MAX_JSON_BODY_BYTES)
                return undefined;
            chunks.push(chunk);
        }
    }
    catch {
        return undefined;
    }
    try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? parsed : undefined;
    }
    catch {
        return undefined;
    }
}
function queryString(url) {
    try {
        return new URL(url ?? '/', 'http://localhost').searchParams;
    }
    catch {
        return new URLSearchParams();
    }
}
/** 运行 codegraph CLI，返回 stdout；失败时抛错。 */
async function runCodegraph(command, args, cwd) {
    const { stdout } = await execFileAsync(command, args, {
        cwd,
        maxBuffer: MAX_BUFFER,
        timeout: 60_000,
    });
    return stdout;
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
function makeRoutes(ctx, command, defaultPath) {
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
    const resolvePath = (params) => {
        const fromQuery = params.get('path')?.trim();
        return fromQuery || defaultPath || process.cwd();
    };
    const run = async (args, cwd) => {
        const output = await runCodegraph(command, args, cwd);
        return { ok: true, output, data: tryParseJson(output) };
    };
    const runJson = async (args, cwd) => {
        const output = await runCodegraph(command, args, cwd);
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
                    writeJson(res, 500, { ok: false, error: (error instanceof Error ? error.message : String(error)), path: cwd });
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
                    writeJson(res, 500, { ok: false, error: (error instanceof Error ? error.message : String(error)), path: cwd });
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
                    writeJson(res, 500, { ok: false, error: (error instanceof Error ? error.message : String(error)), path: cwd, symbol });
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
                    writeJson(res, 500, { ok: false, error: (error instanceof Error ? error.message : String(error)), path: cwd, symbol });
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
                    writeJson(res, 500, { ok: false, error: (error instanceof Error ? error.message : String(error)), path: cwd, symbol });
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
                    writeJson(res, 500, { ok: false, error: (error instanceof Error ? error.message : String(error)), path: cwd, name });
                }
            },
        },
        {
            kind: 'exact',
            path: '/api/dsh-codegraph/sync',
            handler: async (req, res) => {
                if (!guard(req, res, 'POST'))
                    return;
                const body = await readJsonBody(req);
                const cwd = (typeof body?.path === 'string' && body.path.trim()) || defaultPath || process.cwd();
                try {
                    const { output } = await run(['sync', '--', cwd], cwd);
                    writeJson(res, 200, { ok: true, path: cwd, output });
                }
                catch (error) {
                    writeJson(res, 500, { ok: false, error: (error instanceof Error ? error.message : String(error)), path: cwd });
                }
            },
        },
        {
            kind: 'exact',
            path: '/api/dsh-codegraph/index',
            handler: async (req, res) => {
                if (!guard(req, res, 'POST'))
                    return;
                const body = await readJsonBody(req);
                const cwd = (typeof body?.path === 'string' && body.path.trim()) || defaultPath || process.cwd();
                try {
                    const { output } = await run(['index', '--', cwd], cwd);
                    writeJson(res, 200, { ok: true, path: cwd, output });
                }
                catch (error) {
                    writeJson(res, 500, { ok: false, error: (error instanceof Error ? error.message : String(error)), path: cwd });
                }
            },
        },
    ];
}
/* ------------------------------------------------------------------ *
 * 插件本体
 * ------------------------------------------------------------------ */
const CODEGRAPH_GUIDANCE = '本机已安装 dsh-codegraph 插件（Codegraph 集成）：Web GUI 的 设置 → 插件 里有「Codegraph」卡片，可查看索引状态、搜索符号、查看 callers/callees/impact，并手动 sync/index。模型侧也可使用已配置的 codegraph MCP 工具（如 mcp__codegraph__codegraph_explore）直接查询代码。用户提到「Codegraph / 代码图谱 / 调用链 / 影响面 / 索引」时，可引导其打开 Codegraph 卡片或使用 MCP 工具。';
const CODEGRAPH_USAGE_GUIDANCE = `<!-- CODEGRAPH_START -->
## CodeGraph

In repositories indexed by CodeGraph (a \`.codegraph/\` directory exists at the repo root), reach for it BEFORE grep/find or reading files when you need to understand or locate code:

- **MCP tool** (when available): \`codegraph_explore\` or \`mcp__codegraph__codegraph_explore\` answers most code questions in one call — the relevant symbols' verbatim source plus the call paths between them, including dynamic-dispatch hops grep can't follow. Name a file or symbol in the query to read its current line-numbered source. If it's listed but deferred, load it by name via tool search.
- **Shell** (always works): \`codegraph explore "<symbol names or question>"\` prints the same output.

If there is no \`.codegraph/\` directory, skip CodeGraph entirely — indexing is the user's decision.
<!-- CODEGRAPH_END -->`;
const plugin = definePlugin({
    name: 'codegraph',
    inject: [],
    apply(ctx, config) {
        if (config?.enabled === false)
            return;
        const command = config?.command?.trim() || 'codegraph';
        const defaultPath = config?.defaultPath?.trim() || process.cwd();
        const announce = config?.announceToAgent !== false;
        const routes = makeRoutes(ctx, command, defaultPath);
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
        // 注册 settings 命名空间：卡片 key 与命名空间同名，插件配置标签页才会派发它
        ctx.inject(['settings'], (settingsCtx) => {
            const settings = settingsCtx.settings;
            settings.register('codegraph', CODEGRAPH_SETTINGS_SCHEMA);
        });
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
        console.log('[dsh-codegraph] mounted, command: ' + command + ', default path: ' + defaultPath);
    },
});
export const { name, inject, apply } = plugin;
//# sourceMappingURL=index.js.map