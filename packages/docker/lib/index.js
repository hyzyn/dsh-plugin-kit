import z from '@deepseek-ai/schemastery';
import { definePlugin } from '@hyzyn/dsh-kit';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { DockerApi, assertBin, createRunner, parseInspectJson, parsePsJson, parseStatsJson, } from './docker.js';
import { RemoteExec, sshTarget } from './ssh-exec.js';
const TARGET_SCHEMA = z.object({
    name: z.string().required(),
    kind: z.union([z.const('local'), z.const('ssh')]).default('local'),
    /** kind=ssh：引用 tty 连接簿条目名（可留空，改用下方内联字段）。 */
    book: z.string().default(''),
    host: z.string().default(''),
    port: z.natural().max(65535).default(22),
    username: z.string().default(''),
    auth: z.union([z.const('agent'), z.const('key'), z.const('password')]).default('agent'),
    keyPath: z.string().default(''),
    /** 建议写 `env:VAR` 引用（env 插件托管），避免明文落盘。 */
    password: z.string().default(''),
    passphrase: z.string().default(''),
    agentForward: z.boolean().default(false),
});
const HOST_KEY_SCHEMA = z.object({
    host: z.string().required(),
    port: z.natural().max(65535).default(22),
    fingerprint: z.string().required(),
});
const DOCKER_SETTINGS_SCHEMA = z.object({
    enabled: z.boolean().default(true),
    announceToAgent: z.boolean().default(true),
    dockerBin: z.string().default('docker'),
    allowMutations: z.boolean().default(false),
    allowExec: z.boolean().default(false),
    execTimeoutSec: z.natural().max(120).default(30),
    pollIntervalSec: z.natural().max(60).default(5),
    logTailDefault: z.natural().max(5000).default(200),
    maxOutputKb: z.natural().max(8192).default(512),
    targets: z.array(TARGET_SCHEMA).default([]),
    hostKeys: z.array(HOST_KEY_SCHEMA).default([]),
});
/** 可经 HTTP POST 写入的配置键（白名单）。 */
const KNOWN_CONFIG_KEYS = new Set([
    'enabled',
    'announceToAgent',
    'dockerBin',
    'allowMutations',
    'allowExec',
    'execTimeoutSec',
    'pollIntervalSec',
    'logTailDefault',
    'maxOutputKb',
    'targets',
    'hostKeys',
    /** 显式清空全部目标的确认位（见 POST /config 的空数组防丢保护）。 */
    'clearTargets',
]);
/* ------------------------------------------------------------------ *
 * 常量
 * ------------------------------------------------------------------ */
const ROUTE_PREFIX = '/api/dsh-docker';
const BODY_LIMIT = 1024 * 1024;
const DOCKER_GUIDANCE = '本机已安装 dsh-docker 插件（Docker 容器面板）：Web GUI 侧边栏「容器」入口可查看各目标（本机 / SSH 主机）上的容器列表、状态、端口、日志与资源占用，以及镜像列表；目标在 设置 → 插件 → Docker 容器面板 里维护（SSH 目标可直接引用 tty 终端面板的连接簿条目）。**默认只读**：启动/停止/重启/删除与 docker exec 需要用户在设置里显式打开「允许变更操作」「允许 exec」后才有对应工具与按钮。agent 侧配套只读工具 docker_targets（列目标）、docker_ps（列容器）、docker_inspect（容器详情）、docker_logs（日志）、docker_stats（CPU/内存/IO）、docker_images（镜像）；排障推荐顺序 docker_ps → docker_logs → docker_inspect → docker_stats。docker_action / docker_exec 仅在用户打开对应开关后可用，执行前须确认目标容器，破坏性操作（remove）要向用户复述后果。docker socket 等价于目标主机的 root 权限，不要在用户未明确要求时执行变更操作。';
/** HTTP 路由的 loopback 信任围栏（与 tty / dsh-mcp 同思路）。 */
function isLoopbackHttp(req) {
    const address = req.socket.remoteAddress;
    if (address !== '127.0.0.1' && address !== '::1' && address !== '::ffff:127.0.0.1')
        return false;
    const host = req.headers.host;
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
    if (req.headers['sec-fetch-site'] === 'cross-site')
        return false;
    const origin = req.headers.origin;
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
/** 读取并解析 JSON 请求体；超限/非对象/非法 JSON 返回 undefined。 */
async function readJsonBody(req) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
        size += chunk.byteLength;
        if (size > BODY_LIMIT)
            return undefined;
        chunks.push(Buffer.from(chunk));
    }
    if (size === 0)
        return {};
    try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
            return undefined;
        return parsed;
    }
    catch {
        return undefined;
    }
}
/** 清洗一份 targets 输入（settings 存储 / 热更新路径共用）。 */
export function sanitizeTargets(input) {
    if (!Array.isArray(input))
        return undefined;
    const out = [];
    const seen = new Set();
    for (const raw of input) {
        if (typeof raw !== 'object' || raw === null)
            continue;
        const item = raw;
        const name = typeof item.name === 'string' ? item.name.trim() : '';
        if (name === '' || name.length > 64 || seen.has(name))
            continue;
        const kind = item.kind === 'ssh' ? 'ssh' : 'local';
        const port = typeof item.port === 'number' && Number.isInteger(item.port) && item.port >= 1 && item.port <= 65535 ? item.port : 22;
        const auth = item.auth === 'key' || item.auth === 'password' ? item.auth : 'agent';
        seen.add(name);
        out.push({
            name,
            kind,
            book: typeof item.book === 'string' ? item.book.trim() : '',
            host: typeof item.host === 'string' ? item.host.trim() : '',
            port,
            username: typeof item.username === 'string' ? item.username.trim() : '',
            auth,
            keyPath: typeof item.keyPath === 'string' ? item.keyPath.trim() : '',
            password: typeof item.password === 'string' ? item.password : '',
            passphrase: typeof item.passphrase === 'string' ? item.passphrase : '',
            agentForward: item.agentForward === true,
        });
    }
    return out;
}
/** 清洗一份 hostKeys 输入。 */
export function sanitizeHostKeys(input) {
    if (!Array.isArray(input))
        return undefined;
    const out = [];
    for (const raw of input) {
        if (typeof raw !== 'object' || raw === null)
            continue;
        const item = raw;
        const host = typeof item.host === 'string' ? item.host.trim() : '';
        const fingerprint = typeof item.fingerprint === 'string' ? item.fingerprint.trim() : '';
        if (host === '' || fingerprint === '')
            continue;
        const port = typeof item.port === 'number' && Number.isInteger(item.port) && item.port >= 1 && item.port <= 65535 ? item.port : 22;
        out.push({ host, port, fingerprint });
    }
    return out;
}
/**
 * 合并凭证：配置卡片从不回显密码 / 口令（只回 passwordSet），因此浏览器提交的
 * targets 里往往**没有** password/passphrase 字段。按目标名把已有值补回来，
 * 避免「改个名字就把密码清了」。（显式传空字符串仍然按清空处理。）
 */
export function mergeTargetSecrets(prev, incoming) {
    if (!Array.isArray(incoming))
        return incoming;
    return incoming.map((raw) => {
        if (typeof raw !== 'object' || raw === null)
            return raw;
        const item = raw;
        const name = typeof item.name === 'string' ? item.name.trim() : '';
        const before = prev.find((target) => target.name === name);
        if (before === undefined)
            return item;
        const next = { ...item };
        if (typeof next.password !== 'string')
            next.password = before.password ?? '';
        if (typeof next.passphrase !== 'string')
            next.passphrase = before.passphrase ?? '';
        return next;
    });
}
/** 把一份任意来源的配置归一成 LiveConfig。 */
export function normalizeConfig(section) {
    const targets = sanitizeTargets(section.targets);
    const hostKeys = sanitizeHostKeys(section.hostKeys);
    return {
        enabled: section.enabled !== false,
        announceToAgent: section.announceToAgent !== false,
        dockerBin: assertBin(section.dockerBin),
        allowMutations: section.allowMutations === true,
        allowExec: section.allowExec === true,
        execTimeoutSec: clampInt(section.execTimeoutSec, 1, 120, 30),
        pollIntervalSec: clampInt(section.pollIntervalSec, 1, 60, 5),
        logTailDefault: clampInt(section.logTailDefault, 1, 5000, 200),
        maxOutputKb: clampInt(section.maxOutputKb, 1, 8192, 512),
        targets: targets ?? [],
        hostKeys: hostKeys ?? [],
    };
}
function clampInt(value, min, max, fallback) {
    if (typeof value !== 'number' || !Number.isInteger(value))
        return fallback;
    return Math.min(Math.max(value, min), max);
}
/** 从 tty 的 settings 命名空间读取连接簿（只读；tty 未安装时为空表）。 */
function readTtyBooks(settings) {
    const out = new Map();
    if (settings === undefined)
        return out;
    let raw;
    try {
        raw = settings.get('tty');
    }
    catch {
        return out;
    }
    if (typeof raw !== 'object' || raw === null)
        return out;
    const hosts = raw.sshHosts;
    if (!Array.isArray(hosts))
        return out;
    for (const entry of hosts) {
        if (typeof entry !== 'object' || entry === null)
            continue;
        const item = entry;
        const name = typeof item.name === 'string' ? item.name.trim() : '';
        const host = typeof item.host === 'string' ? item.host.trim() : '';
        const username = typeof item.username === 'string' ? item.username.trim() : '';
        if (name === '' || host === '' || username === '')
            continue;
        out.set(name, {
            host,
            port: typeof item.port === 'number' && Number.isInteger(item.port) ? item.port : 22,
            username,
            auth: item.auth === 'key' || item.auth === 'password' ? item.auth : 'agent',
            keyPath: typeof item.keyPath === 'string' ? item.keyPath : '',
            password: typeof item.password === 'string' ? item.password : '',
            passphrase: typeof item.passphrase === 'string' ? item.passphrase : '',
            agentForward: item.agentForward === true,
        });
    }
    return out;
}
/** 从 tty 的 hostKeys 读取已钉扎指纹（作为本插件 TOFU 的种子）。 */
function readTtyHostKeys(settings) {
    if (settings === undefined)
        return [];
    let raw;
    try {
        raw = settings.get('tty');
    }
    catch {
        return [];
    }
    if (typeof raw !== 'object' || raw === null)
        return [];
    const keys = raw.hostKeys;
    return sanitizeHostKeys(keys) ?? [];
}
/** 把一个配置目标解析成可连接的规格（连接簿查找在此完成）。 */
export function resolveTarget(target, books) {
    if (target.kind === 'local')
        return { resolved: { name: target.name, kind: 'local' } };
    if (target.book !== undefined && target.book !== '') {
        const spec = books.get(target.book);
        if (spec === undefined) {
            return { error: `目标「${target.name}」引用的连接簿条目不存在：${target.book}（请在 tty 终端面板的设置卡片里添加，或改为内联 host/username）` };
        }
        return { resolved: { name: target.name, kind: 'ssh', spec } };
    }
    const host = target.host ?? '';
    const username = target.username ?? '';
    if (host === '' || username === '') {
        return { error: `目标「${target.name}」缺少 SSH 信息：需要 book（连接簿条目名）或 host + username` };
    }
    const spec = {
        host,
        port: target.port ?? 22,
        username,
        auth: target.auth ?? 'agent',
        keyPath: target.keyPath ?? '',
        password: target.password ?? '',
        passphrase: target.passphrase ?? '',
        agentForward: target.agentForward === true,
    };
    return { resolved: { name: target.name, kind: 'ssh', spec } };
}
/* ------------------------------------------------------------------ *
 * 插件
 * ------------------------------------------------------------------ */
const plugin = definePlugin({
    name: 'docker',
    apply(ctx, config) {
        let live = normalizeConfig((config ?? {}));
        if (!live.enabled)
            return;
        const logger = {
            info: (msg) => ctx.logger.info(msg),
            warn: (msg) => ctx.logger.warn(msg),
        };
        /* ---------- 主机指纹（TOFU，本插件自持；tty 记录作种子） ---------- */
        let settingsScope;
        let settingsApi;
        const ttySeed = () => {
            const map = new Map();
            for (const record of readTtyHostKeys(settingsApi))
                map.set(`${record.host}:${String(record.port)}`, record.fingerprint);
            return map;
        };
        const persistHostKeys = (records) => {
            const scope = settingsScope;
            if (scope === undefined)
                return;
            void Promise.resolve(scope.update({ hostKeys: records })).catch((error) => {
                console.warn('[dsh-docker] 主机密钥记录持久化失败: ' + (error instanceof Error ? error.message : String(error)));
            });
        };
        const hostKeyStore = {
            get(host, port) {
                const own = live.hostKeys.find((record) => record.host === host && record.port === port);
                if (own !== undefined)
                    return own.fingerprint;
                // tty 已确认过的主机不再重复确认：种子命中即视为可信，并复制进本插件的记录
                const seeded = ttySeed().get(`${host}:${String(port)}`);
                if (seeded !== undefined) {
                    live.hostKeys = [...live.hostKeys, { host, port, fingerprint: seeded }];
                    persistHostKeys(live.hostKeys);
                    return seeded;
                }
                return undefined;
            },
            record(host, port, fingerprint) {
                const next = live.hostKeys.filter((record) => !(record.host === host && record.port === port));
                next.push({ host, port, fingerprint });
                live.hostKeys = next;
                persistHostKeys(next);
            },
        };
        const remote = new RemoteExec(logger, hostKeyStore);
        /**
         * 当前生效的 targets：**以 settings 解析值为准**。
         * 为什么不能只读内存里的 live：settings 命名空间注册是异步的，挂载后存在一个
         * 窗口期内 live 仍是 composition 配置（targets 为空）。若此时 GET /config 被
         * 调用，卡片会拿到空目标列表，用户随后保存就把空数组写回 → 目标被清空。
         */
        const targetsNow = () => {
            const scope = settingsScope;
            if (scope !== undefined) {
                try {
                    const resolved = scope.get();
                    if (typeof resolved === 'object' && resolved !== null) {
                        const fromScope = sanitizeTargets(resolved.targets);
                        if (fromScope !== undefined)
                            return fromScope;
                    }
                }
                catch {
                    /* 回落到内存值 */
                }
            }
            return live.targets;
        };
        /* ---------- 目标解析与 DockerApi ---------- */
        /** 目标名 → 解析结果（每次现算，连接簿热改立即生效）。 */
        const resolveByName = (name) => {
            const target = targetsNow().find((item) => item.name === name);
            if (target === undefined) {
                const names = targetsNow().map((item) => item.name).join('、');
                return { error: `未知目标：${name}${names === '' ? '（尚未配置任何目标）' : `（已配置：${names}）`}` };
            }
            return resolveTarget(target, readTtyBooks(settingsApi));
        };
        /** 取某个目标上的 DockerApi（Runner 每次新建，连接由 RemoteExec 池化）。 */
        const apiFor = (name) => {
            const { resolved, error } = resolveByName(name);
            if (resolved === undefined)
                return { error };
            try {
                const runner = createRunner({ target: resolved, remote, logger });
                return { api: new DockerApi(runner, live.dockerBin, { timeoutMs: 30_000, maxBytes: live.maxOutputKb * 1024 }), resolved };
            }
            catch (error_) {
                return { error: error_ instanceof Error ? error_.message : String(error_) };
            }
        };
        /** 单目标省略 target 参数时的默认目标。 */
        const defaultTargetName = () => {
            const list = targetsNow();
            return list.length === 1 ? list[0]?.name : undefined;
        };
        /** 解析工具/路由里的 target 参数。 */
        const pickTarget = (input) => {
            if (typeof input === 'string' && input.trim() !== '')
                return { name: input.trim() };
            const fallback = defaultTargetName();
            if (fallback !== undefined)
                return { name: fallback };
            const list = targetsNow();
            if (list.length === 0)
                return { error: '尚未配置任何 Docker 目标（设置 → 插件 → Docker 容器面板）' };
            return { error: 'target 必填（已配置多个目标：' + list.map((item) => item.name).join('、') + '）' };
        };
        /* ---------- 配置快照（凭证不外泄） ---------- */
        const snapshotTarget = (target) => ({
            name: target.name,
            kind: target.kind,
            book: target.book ?? '',
            host: target.host ?? '',
            port: target.port ?? 22,
            username: target.username ?? '',
            auth: target.auth ?? 'agent',
            keyPath: target.keyPath ?? '',
            agentForward: target.agentForward === true,
            // 密码 / 口令只回「是否已设置」，值永不回传浏览器
            passwordSet: typeof target.password === 'string' && target.password !== '',
            passphraseSet: typeof target.passphrase === 'string' && target.passphrase !== '',
        });
        const snapshot = () => {
            const books = readTtyBooks(settingsApi);
            return {
                enabled: live.enabled,
                announceToAgent: live.announceToAgent,
                dockerBin: live.dockerBin,
                allowMutations: live.allowMutations,
                allowExec: live.allowExec,
                execTimeoutSec: live.execTimeoutSec,
                pollIntervalSec: live.pollIntervalSec,
                logTailDefault: live.logTailDefault,
                maxOutputKb: live.maxOutputKb,
                targets: targetsNow().map(snapshotTarget),
                hostKeys: live.hostKeys,
                // 只读复用 tty 连接簿：卡片用它渲染「从连接簿选择」下拉
                ttyBooks: [...books.keys()],
                ttyAvailable: books.size > 0,
                toolsRegistered: registeredNames,
            };
        };
        /* ---------- 配置热应用 ---------- */
        const applySection = (section) => {
            // hostKeys 只在显式传入时覆盖（避免把 TOFU 运行期新增的记录冲掉）
            const merged = { ...live, ...section };
            if (section.hostKeys === undefined)
                merged.hostKeys = live.hostKeys;
            live = normalizeConfig(merged);
            refreshTools();
            console.log(`[dsh-docker] config applied (bin=${live.dockerBin}, targets=${String(live.targets.length)}, allowMutations=${String(live.allowMutations)}, allowExec=${String(live.allowExec)})`);
        };
        /* ---------- agent 工具 ---------- */
        let toolsApi;
        let toolDisposers = [];
        let registeredNames = [];
        const renderTargets = (rows) => {
            if (rows.length === 0)
                return '尚未配置任何 Docker 目标（设置 → 插件 → Docker 容器面板 → 目标）。';
            return 'Docker 目标：' + rows.map((row) => {
                const state = row.ok === undefined ? '' : row.ok ? ' [可达]' : ` [不可用：${row.error ?? '未知'}]`;
                return `\n- ${row.name} (${row.kind}) ${row.label}${state}`;
            }).join('');
        };
        const renderContainers = (target, rows) => {
            if (rows.length === 0)
                return `目标 ${target}：没有容器。`;
            return `目标 ${target} 的容器（${String(rows.length)} 个）：` + rows.map((row) => {
                const ports = row.ports.length === 0
                    ? ''
                    : ' ports=' + row.ports.map((p) => (p.hostPort === undefined ? `${String(p.containerPort)}/${p.protocol}` : `${String(p.hostPort)}→${String(p.containerPort)}/${p.protocol}`)).join(',');
                const health = row.health === null ? '' : ` health=${row.health}`;
                const compose = row.composeProject === null ? '' : ` compose=${row.composeProject}/${row.composeService ?? '-'}`;
                return `\n- ${row.name} [${row.state}]${health} image=${row.image}${ports}${compose} id=${row.shortId}`;
            }).join('');
        };
        const renderStats = (target, rows) => {
            if (rows.length === 0)
                return `目标 ${target}：没有运行中的容器。`;
            return `目标 ${target} 的资源占用：` + rows.map((row) => `\n- ${row.name} cpu=${row.cpuPercent === null ? '?' : String(row.cpuPercent) + '%'} mem=${row.memUsage} (${row.memPercent === null ? '?' : String(row.memPercent) + '%'}) net=${row.netIO} block=${row.blockIO} pids=${row.pids === null ? '?' : String(row.pids)}`).join('');
        };
        const renderDetail = (detail) => {
            const lines = [
                `容器 ${detail.name}（${detail.shortId}）`,
                `- 状态：${detail.state}${detail.health === null ? '' : ' / ' + detail.health}${detail.status === '' ? '' : '（' + detail.status + '）'}`,
                `- 镜像：${detail.image}`,
                `- 启动：${detail.startedAt ?? '—'}  结束：${detail.finishedAt ?? '—'}`,
                `- 退出码：${detail.exitCode === null ? '—' : String(detail.exitCode)}  重启次数：${detail.restartCount === null ? '—' : String(detail.restartCount)}  重启策略：${detail.restartPolicy ?? '—'}`,
                `- 端口：${detail.ports.length === 0 ? '—' : detail.ports.map((p) => (p.hostPort === undefined ? `${String(p.containerPort)}/${p.protocol}` : `${p.hostIp ?? ''}:${String(p.hostPort)}→${String(p.containerPort)}/${p.protocol}`)).join(', ')}`,
                `- 挂载：${detail.mounts.length === 0 ? '—' : detail.mounts.map((m) => `${m.source}→${m.destination}${m.readWrite ? '' : '(ro)'}`).join(', ')}`,
                `- 网络：${detail.networks.length === 0 ? '—' : detail.networks.map((n) => `${n.name}${n.ip === null ? '' : '(' + n.ip + ')'}`).join(', ')}`,
                `- 命令：${detail.entrypoint}${detail.command === '' ? '' : ' ' + detail.command}`,
            ];
            if (detail.healthLogTail !== null)
                lines.push(`- 最近健康检查：${detail.healthLogTail}`);
            return lines.join('\n');
        };
        const renderImages = (target, rows) => {
            if (rows.length === 0)
                return `目标 ${target}：没有镜像。`;
            return `目标 ${target} 的镜像（${String(rows.length)} 个）：` + rows.map((row) => `\n- ${row.reference} ${row.sizeText}${row.createdSince === '' ? '' : ' (' + row.createdSince + ')'} id=${row.shortId}`).join('');
        };
        /** 重新注册 agent 工具（能力开关变化时调用；幂等）。 */
        const refreshTools = () => {
            for (const dispose of toolDisposers) {
                try {
                    dispose();
                }
                catch {
                    /* 工具已注销 */
                }
            }
            toolDisposers = [];
            registeredNames = [];
            const tools = toolsApi;
            if (tools === undefined)
                return;
            const targetParam = { type: 'string', description: '目标名（docker_targets 列出；只有一个目标时可省略）' };
            const add = (toolName, definition) => {
                toolDisposers.push(tools.register(definition));
                registeredNames.push(toolName);
            };
            add('docker_targets', defineTool({
                name: 'docker_targets',
                description: '列出已配置的 Docker 目标（本机 / SSH 主机），可选探测每个目标的 docker daemon 是否可达。其他 docker_* 工具的 target 参数取自这里。',
                parameters: { probe: { type: 'boolean', description: 'true 时逐个探测 docker 版本与 daemon 可达性（SSH 目标会建连接，较慢）' } },
                output: {
                    schema: {
                        type: 'object',
                        additionalProperties: false,
                        properties: {
                            targets: {
                                type: 'array',
                                required: true,
                                items: {
                                    type: 'object',
                                    additionalProperties: false,
                                    properties: {
                                        name: { type: 'string', required: true },
                                        kind: { type: 'string', required: true },
                                        label: { type: 'string', required: true },
                                        ok: { type: 'boolean' },
                                        error: { type: 'string' },
                                    },
                                },
                            },
                        },
                    },
                    render: (_args, value) => {
                        const rows = value.targets ?? [];
                        return [{ type: 'text', text: renderTargets(rows) }];
                    },
                },
                async execute(args) {
                    const input = (args ?? {});
                    const books = readTtyBooks(settingsApi);
                    const rows = [];
                    for (const target of targetsNow()) {
                        const { resolved, error } = resolveTarget(target, books);
                        if (resolved === undefined) {
                            rows.push({ name: target.name, kind: target.kind, label: '解析失败', ok: false, error: error ?? '未知错误' });
                            continue;
                        }
                        const label = resolved.kind === 'local' ? '本机' : sshTarget(resolved.spec);
                        if (input.probe !== true) {
                            rows.push({ name: target.name, kind: target.kind, label });
                            continue;
                        }
                        const { api } = apiFor(target.name);
                        if (api === undefined) {
                            rows.push({ name: target.name, kind: target.kind, label, ok: false, error: '无法构造执行通道' });
                            continue;
                        }
                        const probe = await api.probe();
                        rows.push({ name: target.name, kind: target.kind, label, ok: probe.ok, ...(probe.ok ? {} : { error: probe.error ?? '未知错误' }) });
                    }
                    return { targets: rows };
                },
            }));
            add('docker_ps', defineTool({
                name: 'docker_ps',
                description: '列出某个目标上的容器（默认只列运行中的；all:true 含已停止）。返回名称/状态/健康/镜像/端口/compose 项目/短 ID。排障第一步。',
                parameters: { target: targetParam, all: { type: 'boolean', description: 'true 时包含已停止容器（默认 false）' } },
                output: {
                    schema: {
                        type: 'object',
                        additionalProperties: false,
                        properties: {
                            target: { type: 'string', required: true },
                            containers: {
                                type: 'array',
                                required: true,
                                items: {
                                    type: 'object',
                                    additionalProperties: false,
                                    properties: {
                                        id: { type: 'string', required: true },
                                        name: { type: 'string', required: true },
                                        image: { type: 'string', required: true },
                                        state: { type: 'string', required: true },
                                        status: { type: 'string', required: true },
                                        health: { type: 'string' },
                                        ports: { type: 'string' },
                                        composeProject: { type: 'string' },
                                        composeService: { type: 'string' },
                                    },
                                },
                            },
                        },
                    },
                    render: (_args, value) => {
                        const v = value;
                        return [{ type: 'text', text: renderContainers(v.target ?? '?', v.containers ?? []) }];
                    },
                },
                async execute(args) {
                    const input = (args ?? {});
                    const picked = pickTarget(input.target);
                    if (picked.name === undefined)
                        throw new Error(picked.error ?? '无效的 target');
                    const { api } = apiFor(picked.name);
                    if (api === undefined)
                        throw new Error(resolveByName(picked.name).error ?? '无法构造执行通道');
                    const containers = await api.listContainers(input.all === true);
                    return {
                        target: picked.name,
                        containers: containers.map((row) => ({
                            id: row.id,
                            name: row.name,
                            image: row.image,
                            state: row.state,
                            status: row.status,
                            ...(row.health === null ? {} : { health: row.health }),
                            ports: row.ports.map((p) => (p.hostPort === undefined ? `${String(p.containerPort)}/${p.protocol}` : `${String(p.hostPort)}→${String(p.containerPort)}/${p.protocol}`)).join(','),
                            ...(row.composeProject === null ? {} : { composeProject: row.composeProject }),
                            ...(row.composeService === null ? {} : { composeService: row.composeService }),
                        })),
                    };
                },
            }));
            add('docker_inspect', defineTool({
                name: 'docker_inspect',
                description: '读取某个容器的权威详情（docker inspect）：状态/健康检查/退出码/重启次数/端口映射/挂载/网络/启动命令。',
                parameters: { target: targetParam, id: { type: 'string', required: true, description: '容器名或 ID（来自 docker_ps）' } },
                output: {
                    schema: {
                        type: 'object',
                        additionalProperties: false,
                        properties: {
                            target: { type: 'string', required: true },
                            detail: { type: 'string', required: true },
                        },
                    },
                    render: (_args, value) => {
                        const v = value;
                        return [{ type: 'text', text: v.detail ?? '' }];
                    },
                },
                async execute(args) {
                    const input = (args ?? {});
                    const picked = pickTarget(input.target);
                    if (picked.name === undefined)
                        throw new Error(picked.error ?? '无效的 target');
                    if (typeof input.id !== 'string')
                        throw new Error('id 必填');
                    const { api } = apiFor(picked.name);
                    if (api === undefined)
                        throw new Error(resolveByName(picked.name).error ?? '无法构造执行通道');
                    const details = await api.inspect([input.id]);
                    const detail = details[0];
                    if (detail === undefined)
                        throw new Error(`容器不存在：${input.id}`);
                    return { target: picked.name, detail: renderDetail(detail) };
                },
            }));
            add('docker_logs', defineTool({
                name: 'docker_logs',
                description: '读取某个容器的日志尾部（docker logs --tail）。默认 200 行、不带时间戳；可加 timestamps / since。日志可能很大，优先用 tail 而不是全量。',
                parameters: {
                    target: targetParam,
                    id: { type: 'string', required: true, description: '容器名或 ID' },
                    tail: { type: 'number', description: '尾部行数（1~5000，默认 200）' },
                    timestamps: { type: 'boolean', description: 'true 时每行带时间戳' },
                    since: { type: 'string', description: '起始时间（docker --since 语法，如 10m、2026-09-09T10:00:00）' },
                },
                output: {
                    schema: {
                        type: 'object',
                        additionalProperties: false,
                        properties: {
                            target: { type: 'string', required: true },
                            id: { type: 'string', required: true },
                            text: { type: 'string', required: true },
                            truncated: { type: 'boolean' },
                        },
                    },
                    render: (_args, value) => {
                        const v = value;
                        const head = `容器 ${v.id ?? '?'}（目标 ${v.target ?? '?'}）日志${v.truncated === true ? '（输出已截断）' : ''}：\n\n`;
                        return [{ type: 'text', text: head + (v.text === undefined || v.text === '' ? '(无日志)' : v.text) }];
                    },
                },
                async execute(args) {
                    const input = (args ?? {});
                    const picked = pickTarget(input.target);
                    if (picked.name === undefined)
                        throw new Error(picked.error ?? '无效的 target');
                    if (typeof input.id !== 'string')
                        throw new Error('id 必填');
                    const { api } = apiFor(picked.name);
                    if (api === undefined)
                        throw new Error(resolveByName(picked.name).error ?? '无法构造执行通道');
                    const result = await api.logs(input.id, {
                        tail: typeof input.tail === 'number' && Number.isInteger(input.tail) ? input.tail : live.logTailDefault,
                        timestamps: input.timestamps === true,
                        ...(typeof input.since === 'string' ? { since: input.since } : {}),
                    });
                    return { target: picked.name, id: result.id, text: result.text, truncated: result.truncated };
                },
            }));
            add('docker_stats', defineTool({
                name: 'docker_stats',
                description: '读取容器实时资源占用（docker stats --no-stream）：CPU%、内存用量/上限、网络与磁盘 IO、PIDs。不传 ids 时返回该目标上全部运行中容器。',
                parameters: {
                    target: targetParam,
                    ids: { type: 'string', description: '容器名/ID，逗号分隔（省略 = 全部运行中）' },
                },
                output: {
                    schema: {
                        type: 'object',
                        additionalProperties: false,
                        properties: {
                            target: { type: 'string', required: true },
                            stats: {
                                type: 'array',
                                required: true,
                                items: {
                                    type: 'object',
                                    additionalProperties: false,
                                    properties: {
                                        id: { type: 'string', required: true },
                                        name: { type: 'string', required: true },
                                        cpuPercent: { type: 'number' },
                                        memUsage: { type: 'string', required: true },
                                        memPercent: { type: 'number' },
                                        netIO: { type: 'string', required: true },
                                        blockIO: { type: 'string', required: true },
                                        pids: { type: 'number' },
                                    },
                                },
                            },
                        },
                    },
                    render: (_args, value) => {
                        const v = value;
                        return [{ type: 'text', text: renderStats(v.target ?? '?', v.stats ?? []) }];
                    },
                },
                async execute(args) {
                    const input = (args ?? {});
                    const picked = pickTarget(input.target);
                    if (picked.name === undefined)
                        throw new Error(picked.error ?? '无效的 target');
                    const ids = typeof input.ids === 'string'
                        ? input.ids.split(',').map((id) => id.trim()).filter((id) => id !== '')
                        : [];
                    const { api } = apiFor(picked.name);
                    if (api === undefined)
                        throw new Error(resolveByName(picked.name).error ?? '无法构造执行通道');
                    const stats = await api.stats(ids);
                    return {
                        target: picked.name,
                        stats: stats.map((row) => ({
                            id: row.id,
                            name: row.name,
                            ...(row.cpuPercent === null ? {} : { cpuPercent: row.cpuPercent }),
                            memUsage: row.memUsage,
                            ...(row.memPercent === null ? {} : { memPercent: row.memPercent }),
                            netIO: row.netIO,
                            blockIO: row.blockIO,
                            ...(row.pids === null ? {} : { pids: row.pids }),
                        })),
                    };
                },
            }));
            add('docker_images', defineTool({
                name: 'docker_images',
                description: '列出某个目标上的镜像（仓库:标签、大小、创建时间、短 ID）。',
                parameters: { target: targetParam },
                output: {
                    schema: {
                        type: 'object',
                        additionalProperties: false,
                        properties: {
                            target: { type: 'string', required: true },
                            images: {
                                type: 'array',
                                required: true,
                                items: {
                                    type: 'object',
                                    additionalProperties: false,
                                    properties: {
                                        reference: { type: 'string', required: true },
                                        sizeText: { type: 'string', required: true },
                                        createdSince: { type: 'string' },
                                        id: { type: 'string', required: true },
                                    },
                                },
                            },
                        },
                    },
                    render: (_args, value) => {
                        const v = value;
                        return [{ type: 'text', text: renderImages(v.target ?? '?', v.images ?? []) }];
                    },
                },
                async execute(args) {
                    const input = (args ?? {});
                    const picked = pickTarget(input.target);
                    if (picked.name === undefined)
                        throw new Error(picked.error ?? '无效的 target');
                    const { api } = apiFor(picked.name);
                    if (api === undefined)
                        throw new Error(resolveByName(picked.name).error ?? '无法构造执行通道');
                    const images = await api.images();
                    return {
                        target: picked.name,
                        images: images.map((row) => ({
                            reference: row.reference,
                            sizeText: row.sizeText,
                            ...(row.createdSince === '' ? {} : { createdSince: row.createdSince }),
                            id: row.shortId,
                        })),
                    };
                },
            }));
            if (live.allowMutations) {
                add('docker_action', defineTool({
                    name: 'docker_action',
                    description: '对容器执行生命周期操作：start / stop / restart / remove。**破坏性**：remove 会删除容器（数据卷不在其中，但容器配置与可写层丢失），执行前必须向用户确认目标容器。仅当用户在设置里打开「允许变更操作」时可用。',
                    parameters: {
                        target: targetParam,
                        action: { type: 'string', required: true, description: 'start | stop | restart | remove' },
                        id: { type: 'string', required: true, description: '容器名或 ID' },
                    },
                    output: {
                        schema: {
                            type: 'object',
                            additionalProperties: false,
                            properties: {
                                target: { type: 'string', required: true },
                                id: { type: 'string', required: true },
                                action: { type: 'string', required: true },
                                message: { type: 'string', required: true },
                            },
                        },
                        render: (_args, value) => {
                            const v = value;
                            return [{ type: 'text', text: `${v.action ?? '?'} ${v.id ?? '?'}（目标 ${v.target ?? '?'}）：${v.message ?? 'ok'}` }];
                        },
                    },
                    async execute(args) {
                        if (!live.allowMutations)
                            throw new Error('变更操作未启用（设置 → 插件 → Docker 容器面板 → 允许变更操作）');
                        const input = (args ?? {});
                        const picked = pickTarget(input.target);
                        if (picked.name === undefined)
                            throw new Error(picked.error ?? '无效的 target');
                        if (typeof input.id !== 'string')
                            throw new Error('id 必填');
                        const action = input.action;
                        if (action !== 'start' && action !== 'stop' && action !== 'restart' && action !== 'remove') {
                            throw new Error('action 必须是 start / stop / restart / remove');
                        }
                        const { api } = apiFor(picked.name);
                        if (api === undefined)
                            throw new Error(resolveByName(picked.name).error ?? '无法构造执行通道');
                        const result = await api.action({ action, id: input.id });
                        return { target: picked.name, id: result.id, action: result.action, message: result.message };
                    },
                }));
            }
            if (live.allowExec) {
                add('docker_exec', defineTool({
                    name: 'docker_exec',
                    description: '在容器内执行一条一次性命令（docker exec，无 TTY）：如 `ls -la /app`、`cat /etc/nginx/nginx.conf`、`env`。仅当用户在设置里打开「允许 exec」时可用；不要在容器里做破坏性操作，交互式排障请让用户到终端面板执行 `docker exec -it <容器> sh`。',
                    parameters: {
                        target: targetParam,
                        id: { type: 'string', required: true, description: '容器名或 ID' },
                        command: { type: 'string', required: true, description: '要执行的命令（经容器内 sh -c 执行）' },
                        timeoutSec: { type: 'number', description: '超时秒数（1~120，默认取插件配置）' },
                    },
                    output: {
                        schema: {
                            type: 'object',
                            additionalProperties: false,
                            properties: {
                                target: { type: 'string', required: true },
                                id: { type: 'string', required: true },
                                code: { type: 'number' },
                                stdout: { type: 'string', required: true },
                                stderr: { type: 'string', required: true },
                                truncated: { type: 'boolean' },
                            },
                        },
                        render: (_args, value) => {
                            const v = value;
                            const parts = [`容器 ${v.id ?? '?'} 退出码 ${v.code === undefined ? '?' : String(v.code)}`];
                            if ((v.stdout ?? '') !== '')
                                parts.push('stdout:\n' + (v.stdout ?? ''));
                            if ((v.stderr ?? '') !== '')
                                parts.push('stderr:\n' + (v.stderr ?? ''));
                            if (v.truncated === true)
                                parts.push('（输出已截断）');
                            return [{ type: 'text', text: parts.join('\n\n') }];
                        },
                    },
                    async execute(args) {
                        if (!live.allowExec)
                            throw new Error('exec 未启用（设置 → 插件 → Docker 容器面板 → 允许 exec）');
                        const input = (args ?? {});
                        const picked = pickTarget(input.target);
                        if (picked.name === undefined)
                            throw new Error(picked.error ?? '无效的 target');
                        if (typeof input.id !== 'string')
                            throw new Error('id 必填');
                        if (typeof input.command !== 'string' || input.command.trim() === '')
                            throw new Error('command 必填');
                        const timeoutSec = typeof input.timeoutSec === 'number' && Number.isInteger(input.timeoutSec) ? input.timeoutSec : live.execTimeoutSec;
                        const { api } = apiFor(picked.name);
                        if (api === undefined)
                            throw new Error(resolveByName(picked.name).error ?? '无法构造执行通道');
                        const result = await api.exec(input.id, input.command, timeoutSec * 1000);
                        return {
                            target: picked.name,
                            id: result.id,
                            ...(result.code === null ? {} : { code: result.code }),
                            stdout: result.stdout,
                            stderr: result.stderr,
                            truncated: result.truncated,
                        };
                    },
                }));
            }
        };
        // tools 服务（可选）：拿到后注册一次，能力开关变化时 refreshTools 重注册
        ctx.inject(['tools'], (toolsCtx) => {
            toolsCtx.effect(() => {
                toolsApi = toolsCtx.tools;
                refreshTools();
                console.log('[dsh-docker] agent tools registered (' + registeredNames.join(', ') + ')');
                return () => {
                    toolsApi = undefined;
                    for (const dispose of toolDisposers) {
                        try {
                            dispose();
                        }
                        catch {
                            /* 工具已注销 */
                        }
                    }
                    toolDisposers = [];
                    registeredNames = [];
                };
            }, 'dsh-docker: agent tools');
        });
        /* ---------- HTTP 路由（loopback 围栏） ---------- */
        ctx.inject(['webServer'], (webCtx) => {
            webCtx.effect(() => {
                const webServer = webCtx.webServer;
                const dispose = webServer.register({
                    kind: 'prefix',
                    path: ROUTE_PREFIX,
                    handler: async (req, res) => {
                        if (!isLoopbackHttp(req)) {
                            writeJson(res, 403, { error: 'forbidden: loopback-only' });
                            return;
                        }
                        const sub = new URL(req.url ?? '/', 'http://loopback').pathname.slice(ROUTE_PREFIX.length);
                        if (sub === '/config') {
                            if (req.method === 'GET') {
                                writeJson(res, 200, { ok: true, config: snapshot() });
                                return;
                            }
                            if (req.method !== 'POST') {
                                writeJson(res, 405, { error: 'method not allowed: ' + String(req.method) });
                                return;
                            }
                            const body = await readJsonBody(req);
                            if (body === undefined) {
                                writeJson(res, 400, { error: 'invalid JSON body' });
                                return;
                            }
                            const patch = {};
                            let warning;
                            for (const key of Object.keys(body)) {
                                if (!KNOWN_CONFIG_KEYS.has(key)) {
                                    writeJson(res, 400, { error: '未知配置项: ' + key });
                                    return;
                                }
                                if (key === 'clearTargets')
                                    continue;
                                patch[key] = body[key];
                            }
                            // 空 targets 只在显式 clearTargets 时才允许清空：卡片若因启动竞态拿到
                            // 空列表，保存不会再把已配置的目标抹掉（防数据丢失）
                            if (Array.isArray(patch.targets) && patch.targets.length === 0 && body.clearTargets !== true) {
                                const existing = targetsNow();
                                if (existing.length > 0) {
                                    delete patch.targets;
                                    warning = `已忽略空的目标列表：当前仍有 ${String(existing.length)} 个目标。请刷新设置卡片后重试（若确实要清空全部目标，请逐个删除后保存）。`;
                                }
                            }
                            // 凭证补全必须在写盘之前：否则提交的 targets 会把密码清空
                            if (patch.targets !== undefined)
                                patch.targets = mergeTargetSecrets(targetsNow(), patch.targets);
                            const scope = settingsScope;
                            if (scope !== undefined) {
                                try {
                                    await scope.update(patch);
                                }
                                catch (error) {
                                    writeJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
                                    return;
                                }
                                // settings/updated 会触发 applySection；无事件时也应用一次（幂等）
                            }
                            applySection(patch);
                            writeJson(res, 200, { ok: true, config: snapshot(), ...(warning === undefined ? {} : { warning }) });
                            return;
                        }
                        if (sub === '/targets') {
                            if (req.method !== 'GET' && req.method !== 'POST') {
                                writeJson(res, 405, { error: 'method not allowed: ' + String(req.method) });
                                return;
                            }
                            const books = readTtyBooks(settingsApi);
                            writeJson(res, 200, {
                                ok: true,
                                targets: targetsNow().map((target) => {
                                    const { resolved, error } = resolveTarget(target, books);
                                    return {
                                        name: target.name,
                                        kind: target.kind,
                                        ...(resolved === undefined ? { error } : { label: resolved.kind === 'local' ? '本机' : sshTarget(resolved.spec) }),
                                    };
                                }),
                            });
                            return;
                        }
                        if (req.method !== 'POST') {
                            writeJson(res, 405, { error: 'method not allowed: ' + String(req.method) });
                            return;
                        }
                        const body = await readJsonBody(req);
                        if (body === undefined) {
                            writeJson(res, 400, { error: 'invalid JSON body' });
                            return;
                        }
                        const picked = pickTarget(body.target);
                        if (picked.name === undefined) {
                            writeJson(res, 400, { error: picked.error ?? '无效的 target' });
                            return;
                        }
                        const built = apiFor(picked.name);
                        if (built.api === undefined) {
                            writeJson(res, 400, { error: built.error ?? '无法构造执行通道' });
                            return;
                        }
                        const api = built.api;
                        try {
                            switch (sub) {
                                case '/probe': {
                                    writeJson(res, 200, { ok: true, probe: await api.probe() });
                                    return;
                                }
                                case '/containers': {
                                    writeJson(res, 200, { ok: true, containers: await api.listContainers(body.all === true) });
                                    return;
                                }
                                case '/inspect': {
                                    if (typeof body.id !== 'string') {
                                        writeJson(res, 400, { error: 'id 必填' });
                                        return;
                                    }
                                    writeJson(res, 200, { ok: true, details: await api.inspect([body.id]) });
                                    return;
                                }
                                case '/stats': {
                                    const ids = Array.isArray(body.ids) ? body.ids.filter((id) => typeof id === 'string') : [];
                                    writeJson(res, 200, { ok: true, stats: await api.stats(ids) });
                                    return;
                                }
                                case '/logs': {
                                    if (typeof body.id !== 'string') {
                                        writeJson(res, 400, { error: 'id 必填' });
                                        return;
                                    }
                                    const tail = typeof body.tail === 'number' && Number.isInteger(body.tail) ? body.tail : live.logTailDefault;
                                    writeJson(res, 200, {
                                        ok: true,
                                        logs: await api.logs(body.id, {
                                            tail,
                                            timestamps: body.timestamps === true,
                                            ...(typeof body.since === 'string' ? { since: body.since } : {}),
                                        }),
                                    });
                                    return;
                                }
                                case '/images': {
                                    writeJson(res, 200, { ok: true, images: await api.images() });
                                    return;
                                }
                                case '/action': {
                                    if (!live.allowMutations) {
                                        writeJson(res, 403, { error: '变更操作未启用（设置 → 插件 → Docker 容器面板 → 允许变更操作）' });
                                        return;
                                    }
                                    if (typeof body.id !== 'string') {
                                        writeJson(res, 400, { error: 'id 必填' });
                                        return;
                                    }
                                    const action = body.action;
                                    if (action !== 'start' && action !== 'stop' && action !== 'restart' && action !== 'remove') {
                                        writeJson(res, 400, { error: 'action 必须是 start / stop / restart / remove' });
                                        return;
                                    }
                                    writeJson(res, 200, { ok: true, result: await api.action({ action, id: body.id }) });
                                    return;
                                }
                                case '/exec': {
                                    if (!live.allowExec) {
                                        writeJson(res, 403, { error: 'exec 未启用（设置 → 插件 → Docker 容器面板 → 允许 exec）' });
                                        return;
                                    }
                                    if (typeof body.id !== 'string' || typeof body.command !== 'string') {
                                        writeJson(res, 400, { error: 'id 与 command 必填' });
                                        return;
                                    }
                                    const timeoutSec = typeof body.timeoutSec === 'number' && Number.isInteger(body.timeoutSec) ? body.timeoutSec : live.execTimeoutSec;
                                    writeJson(res, 200, { ok: true, result: await api.exec(body.id, body.command, timeoutSec * 1000) });
                                    return;
                                }
                                default: {
                                    writeJson(res, 404, { error: 'unknown route: ' + sub });
                                }
                            }
                        }
                        catch (error) {
                            writeJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
                        }
                    },
                });
                return () => dispose();
            }, 'dsh-docker: web routes');
        });
        /* ---------- settings 命名空间 ---------- */
        ctx.inject(['settings'], (settingsCtx) => {
            settingsCtx.effect(() => {
                const settings = settingsCtx.settings;
                const scope = settings.register('docker', DOCKER_SETTINGS_SCHEMA, { base: live });
                settingsApi = settings;
                settingsScope = scope;
                // 注册后立即读一次解析值（schema 默认值 ← composition base ← 用户层）
                const resolved = scope.get();
                if (typeof resolved === 'object' && resolved !== null)
                    live = normalizeConfig(resolved);
                const diag = (resolved ?? {});
                console.log(`[dsh-docker] settings resolved (keys=${Object.keys(diag).join('|')}, targets=${Array.isArray(diag.targets) ? String(diag.targets.length) : 'not-array'}, hostKeys=${Array.isArray(diag.hostKeys) ? String(diag.hostKeys.length) : 'not-array'})`);
                refreshTools();
                const events = settingsCtx;
                const off = events.events.on('settings/updated', (ns, next) => {
                    if (ns !== 'docker' || typeof next !== 'object' || next === null)
                        return;
                    applySection(next);
                });
                return () => {
                    off();
                    settingsScope = undefined;
                    settingsApi = undefined;
                };
            }, 'dsh-docker: settings');
        });
        /* ---------- 能力公告 ---------- */
        if (live.announceToAgent) {
            ctx.inject(['systemPrompt'], (promptCtx) => {
                promptCtx.effect(() => {
                    const systemPrompt = promptCtx.systemPrompt;
                    const dispose = systemPrompt.section({ name: 'plugin:dsh-docker', order: 152, text: DOCKER_GUIDANCE });
                    return () => dispose();
                }, 'dsh-docker: announcement');
            });
        }
        /* ---------- 卸载清理 ---------- */
        ctx.effect(() => {
            return () => {
                remote.disposeAll();
            };
        }, 'dsh-docker: cleanup');
        console.log(`[dsh-docker] mounted (bin=${live.dockerBin}, targets=${String(live.targets.length)}, allowMutations=${String(live.allowMutations)}, allowExec=${String(live.allowExec)})`);
    },
});
export const { name, inject, apply } = plugin;
/* ------------------------------------------------------------------ *
 * 供 scripts/smoke.mjs 直接复用的纯函数（解析器回归）
 * ------------------------------------------------------------------ */
export { parsePsJson, parseStatsJson, parseInspectJson, assertBin, DockerApi };
//# sourceMappingURL=index.js.map