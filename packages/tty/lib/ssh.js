/**
 * @hyzyn/dsh-tty — SSH 会话封装（方案 C：ssh2 原生集成）。
 *
 * 不经过本地 ssh 进程 / node-pty，直接用 ssh2 建立连接并开 shell channel，
 * 包装成与本地 PTY 完全一致的 TermHandle 形状，TtyServer 无差别调度：
 * input/resize/kill 上行，data/exit 下行，背压、环形缓冲、agent 工具全复用。
 *
 * 认证优先级由 spec.auth 决定：
 *   agent    —— ssh-agent（SSH_AUTH_SOCK），最推荐，凭证不落盘
 *   key      —— keyPath 私钥文件（~ 可省略 home），passphrase 可选
 *   password —— 密码认证，同时挂 keyboard-interactive（很多服务端只开这个）
 * password / passphrase 支持 `env:VAR` 前缀从进程环境变量取值（配合
 * dsh-env-manager 插件托管密钥，避免明文写入 settings 文件）。
 *
 * 主机密钥策略：known_hosts TOFU（trust-on-first-use）钉扎——hostVerifier 里
 * 首次连接记录 sha256 指纹（经 HostKeyStore 持久化），之后每次连接校验：
 * 指纹一致放行；指纹变更拒绝连接（防中间人冒充），用户确认安全后可在
 * 设置卡片删除该主机记录重连。未提供 hostKeyStore 时退化为 accept-and-log
 * （旧行为，测试路径用）。
 */
import { Client } from 'ssh2';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { Duplex, PassThrough } from 'node:stream';
import { StringDecoder } from 'node:string_decoder';
import { TMUX_SOCKET } from './tmux.js';
import { shSingleQuote } from './shell-integration.js';
import { StatsLineBuffer } from './stats.js';
let credentialsProvider = null;
/** 由 index.ts 在可选注入里挂上（服务缺失即为 null，退回 process.env）。 */
export function setCredentialResolver(resolver) {
    credentialsProvider = resolver;
}
/**
 * 解析密钥引用（`env:NAME`）——**纯核心**，provider 由调用方给，便于离线断言。
 *
 * 顺序：官方凭据 provider **优先**（它自己叠 `file`（`$DSH_HOME/.credentials.yaml`）/ `env` /
 * `project-env` / `user-env` 各层，而且"每次操作重新解析"——改完下一个操作即生效，不必重启
 * 宿主）；服务不在、或它没有这个引用时，再退回 `process.env`。
 *
 * 为什么必须走 provider：凭据存储里的值**永远不会被 materialize 进环境**（provider README 原话：
 * "a store the harness owns and never materializes into the environment"），所以只读
 * `process.env` 等于"存进凭据存储的值连接时根本读不到" ✗ —— 这正是「存入凭据存储」这条链此前
 * 断掉的地方（客户端那半切好了、宿主这半没切）。
 *
 * provider 抛错**不吞**：记下来，若环境变量也没有就把两个来源一起写进错误里。否则"凭据服务
 * 坏了"会伪装成"你没配"，而那是最难查的一类。
 */
export async function resolveSecretVia(provider, value) {
    if (value === undefined)
        return undefined;
    if (!value.startsWith('env:'))
        return value;
    const name = value.slice(4);
    let providerError = null;
    /** provider 明确找到了该引用（哪怕值是空串）——与「引用不存在」分开报 */
    let providerFound = false;
    if (provider !== null && provider !== undefined && typeof provider.resolve === 'function') {
        try {
            const resolved = await provider.resolve(name);
            if (resolved !== null && resolved !== undefined) {
                providerFound = true;
                if (typeof resolved.value === 'string' && resolved.value !== '') {
                    return resolved.value;
                }
            }
        }
        catch (error) {
            providerError = error instanceof Error ? error.message : String(error);
        }
    }
    const fromEnv = process.env[name];
    if (fromEnv !== undefined && fromEnv !== '')
        return fromEnv;
    // 「存在但值为空」单独报：报成「未设置」会把用户引去新建同名引用——那只会再失败一次
    if (providerFound || fromEnv === '') {
        const detail = providerError === null ? '' : `（凭据服务报错：${providerError}）`;
        throw new Error(`凭据 ${name} 的值是空串${detail}——请在凭据存储或环境变量里补上实际值，新建同名引用解决不了`);
    }
    const detail = providerError === null ? '' : `（凭据服务报错：${providerError}）`;
    const missing = provider === null ? '凭据服务不可用，' : '';
    throw new Error(`凭据未设置：${name}${detail} —— ${missing}环境变量里也没有`);
}
/** 生产路径：用当前注入的 provider（`index.ts` 注入；没注入就是 null）。 */
export async function resolveSecret(value) {
    return resolveSecretVia(credentialsProvider, value);
}
function expandHome(path) {
    if (path === '~')
        return homedir();
    if (path.startsWith('~/'))
        return join(homedir(), path.slice(2));
    return path;
}
/** 供 ~/.ssh/config 导入路由使用（~ 与 ~/ 前缀展开 home）。 */
export { expandHome };
/** 展示用目标串：user@host（非默认端口时带 :port）。 */
export function sshTarget(spec) {
    const port = spec.port ?? 22;
    return `${spec.username}@${spec.host}${port === 22 ? '' : ':' + String(port)}`;
}
/**
 * 把 ssh2 的底层错误消息分类为人类可读诊断（0.19.0 自 probe.ts 上移至此统一
 * 导出——终端 / 隧道 / 探测三条路径共用同一套文案，不再透传原始英文）。
 * 分类串本身已含关键字段；无法识别时原样返回。
 */
export function classifyError(message) {
    if (message === 'Host key verification failed') {
        return '主机密钥校验失败（TOFU 不匹配，见 hostkey 指引）';
    }
    if (message.includes('All configured authentication methods failed')) {
        return '认证被拒绝：所有认证方式均失败（用户名/密码/密钥是否正确，或服务端是否允许该认证方式）';
    }
    if (message.includes('Timed out')) {
        // 跳板机提示（项目级 ROADMAP 第 2 项）：企业内网主机几乎都要过 bastion，而本版本
        // 不支持——「20s 后一句通用超时」正是原文点名的症状。导入侧已改为跳过并明说，
        // 这里补上手工填地址那条路。
        return '超时：主机无响应或认证协商超时（检查地址 / 端口 / 防火墙 / 网络。'
            + '若该主机只能经跳板机访问（~/.ssh/config 里的 ProxyJump / ProxyCommand），本版本尚不支持，'
            + '见项目级 ROADMAP 第 2 项）';
    }
    const lower = message.toLowerCase();
    if (lower.includes('econnrefused'))
        return '连接被拒绝（ECONNREFUSED）：端口未监听或服务未启动';
    if (lower.includes('enetunreach'))
        return '网络不可达（ENETUNREACH）：路由不通或主机离线';
    if (lower.includes('ehostunreach'))
        return '主机不可达（EHOSTUNREACH）';
    if (lower.includes('eai_again') || lower.includes('eai_noname') || lower.includes('enotfound'))
        return 'DNS 解析失败：主机名无法解析';
    if (lower.includes('getaddrinfo'))
        return 'DNS 解析失败：主机名无法解析';
    if (lower.includes('unable to exchange encryption keys') || lower.includes('encryption') || lower.includes('kex')) {
        return '密钥交换失败：服务端可能不是 SSH 服务，或加密算法不兼容';
    }
    if (lower.includes('keepalive'))
        return '连接保活超时（keepalive）';
    if (lower.includes('protocol'))
        return '协议错误：' + message;
    return message;
}
/* ------------------------------------------------------------------ *
 * 连接与 channel 包装
 * ------------------------------------------------------------------ */
/**
 * 构造连接配置（认证三态 + keepalive + hostHash）；spawnSsh / probeSsh / SFTP / 隧道共用。
 *
 * **async**：`env:NAME` 引用要经官方凭据 provider 解析（每操作重解析，不可缓存），见
 * resolveSecretVia —— 这是"存入凭据存储"的值能被连接真正用到的唯一通路。
 */
export async function buildConnectConfig(spec) {
    const auth = spec.auth ?? 'agent';
    const base = {
        host: spec.host,
        port: spec.port ?? 22,
        username: spec.username,
        readyTimeout: 20000,
        keepaliveInterval: 10000,
        keepaliveCountMax: 3,
        // hostVerifier 依赖 hostHash 计算指纹；放行与否由 spawnSsh 里的
        // TOFU 策略（HostKeyStore）决定，见文件头策略说明
        hostHash: 'sha256',
    };
    if (auth === 'agent') {
        // 预检（0.19.0）：缺 SSH_AUTH_SOCK 时 ssh2 只会报「All configured
        // authentication methods failed」，用户根本想不到是 agent 没跑
        if (process.env.SSH_AUTH_SOCK === undefined || process.env.SSH_AUTH_SOCK === '') {
            throw new Error('auth=agent 需要 SSH_AUTH_SOCK（本机未运行 ssh-agent 或变量未设置）；在终端面板宿主环境起 agent，或改用 key / password 认证');
        }
        base.agent = process.env.SSH_AUTH_SOCK;
    }
    else if (auth === 'key') {
        if (typeof spec.keyPath !== 'string' || spec.keyPath.trim() === '') {
            throw new Error('auth=key 需要 keyPath（私钥路径）');
        }
        base.privateKey = readFileSync(expandHome(spec.keyPath.trim()));
        const passphrase = await resolveSecret(spec.passphrase);
        if (passphrase !== undefined)
            base.passphrase = passphrase;
    }
    else {
        const password = await resolveSecret(spec.password);
        if (password === undefined)
            throw new Error('auth=password 需要 password（或 env:VAR 引用）');
        base.password = password;
        // 大量服务端（如部分路由器/堡垒机）只开 keyboard-interactive
        base.tryKeyboard = true;
    }
    // agent forwarding 需要 agent 通道：key/password 认证时也把 SSH_AUTH_SOCK
    // 挂上（只用于转发，不参与认证）。@types/ssh2 的 ConnectConfig.agentForward
    // 在缺 agent 时会直接 throw，故这里仅在 SOCK 存在时设置
    if (spec.agentForward === true && process.env.SSH_AUTH_SOCK !== undefined && process.env.SSH_AUTH_SOCK !== '') {
        base.agent = base.agent ?? process.env.SSH_AUTH_SOCK;
    }
    return base;
}
/** TOFU 主机指纹策略（hostVerifier 接线）；返回的 mismatchMessage() 供连接错误路径取人类可读拒绝原因。 */
export function applyHostKeyPolicy(options) {
    const { connectConfig, spec, store, logger, target } = options;
    const port = spec.port ?? 22;
    let hostKeyMismatch = null;
    connectConfig.hostVerifier = (hash) => {
        const known = store?.get(spec.host, port);
        if (known === undefined || known.length === 0) {
            store?.record(spec.host, port, hash);
            logger?.info(`[dsh-tty] ssh ${target} 首次连接，已记录 host key 指纹 sha256:${hash}（TOFU）`);
            return true;
        }
        if (known.includes(hash)) {
            logger?.info(`[dsh-tty] ssh ${target} host key 指纹匹配（sha256:${hash}，该主机共记录 ${String(known.length)} 把钥匙）`);
            return true;
        }
        const shown = known.slice(0, 3).map((f) => `sha256:${f}`).join(' / ');
        const more = known.length > 3 ? ` 等 ${String(known.length)} 把` : '';
        hostKeyMismatch =
            `SSH 主机密钥指纹变更：${target} 已记录 ${shown}${more}，本次为 sha256:${hash}。` +
                '可能是主机重装或换钥匙，也可能是中间人（MITM）冒充；确认安全后，到 插件配置 → 终端面板 → SSH 主机密钥记录 删除该主机再重连。';
        logger?.warn(`[dsh-tty] ${hostKeyMismatch}`);
        return false;
    };
    return { mismatchMessage: () => hostKeyMismatch };
}
/** 跳板机展示串（`user@host:port`）；没有跳板机时返回空串。**凭据不进这里**。 */
export function jumpTargetLabel(spec) {
    const jump = spec.jump;
    if (jump === undefined || jump.host.trim() === '')
        return '';
    const port = jump.port ?? 22;
    return `${jump.username ?? spec.username}@${jump.host.trim()}${port === 22 ? '' : ':' + String(port)}`;
}
/**
 * 目标那一跳的展示串 + 跳板机 / 代理命令后缀（**给用户看的错误文案**用）。
 *
 * 为什么错误文案必须带这一句：ssh2 在两跳上共用 `readyTimeout`，报的都是
 * `Timed out while waiting for handshake`——不点名的话「跳板机不可达」会伪装成
 * 「目标超时」，用户会去查对端主机而问题在跳板机上。代理命令同理：它一旦启动失败，
 * 报出来的是「握手前连接中断」。
 *
 * **不回显命令原文**（可能含 `-i /path/key` 这类凭据）：只写「经代理命令」。
 */
function targetWithJump(spec) {
    const label = jumpTargetLabel(spec);
    if (label !== '')
        return `${sshTarget(spec)}（经跳板机 ${label}）`;
    if (sanitizeProxyCommand(spec.proxyCommand) !== undefined)
        return `${sshTarget(spec)}（经代理命令）`;
    return sshTarget(spec);
}
/** 跳板机那一跳的连接规格：显式给的优先，其余**继承目标**。 */
function jumpSpecOf(spec) {
    const jump = spec.jump;
    const username = typeof jump.username === 'string' && jump.username.trim() !== '' ? jump.username.trim() : spec.username;
    return {
        host: jump.host.trim(),
        port: jump.port ?? 22,
        username,
        auth: jump.auth ?? spec.auth ?? 'agent',
        keyPath: jump.keyPath ?? spec.keyPath,
        passphrase: jump.passphrase ?? spec.passphrase,
        password: jump.password ?? spec.password,
    };
}
/** 跳板机通道打开兜底（与 channel 打开兜底同思路：对端不回 `forwardOut` 回调时不能让 await 挂着）。 */
const JUMP_CHANNEL_TIMEOUT_MS = 15_000;
/**
 * 拨跳板机并借一条 `forwardOut` 通道（ProxyJump 单跳）。
 *
 * 三件事刻意做在这里：
 *   1. **失败一律点名跳板机**（见 `targetWithJump` 的理由）；
 *   2. **指纹策略单独一份**：TOFU 的键是 `(host, port)`，跳板机与目标撞 host:port
 *      （NAT 后的 `127.0.0.1:22` 很常见）时不能共用句柄，否则会出现假「指纹变更」；
 *   3. **失败路径自己关连接**：抛出去之前 `end()` 掉，否则每次重试都会漏一条
 *      keepalive 一直养着的连接。
 */
export async function dialJump(options) {
    const jumpSpec = jumpSpecOf(options.spec);
    const label = jumpTargetLabel(options.spec);
    const destination = sshTarget(options.spec);
    const bastion = new Client();
    const closeQuietly = () => {
        try {
            bastion.end();
        }
        catch {
            /* 已断开 */
        }
    };
    let connectConfig;
    try {
        connectConfig = await buildConnectConfig(jumpSpec);
    }
    catch (error) {
        // 预检类错误（缺 SSH_AUTH_SOCK / keyPath 读不到 / 引用解析不到）也要点名跳板机
        throw new Error(`跳板机连接失败（${label}）：${error instanceof Error ? error.message : String(error)}`);
    }
    if (options.readyTimeoutMs !== undefined)
        connectConfig.readyTimeout = options.readyTimeoutMs;
    const policy = applyHostKeyPolicy({ connectConfig, spec: jumpSpec, store: options.store, logger: options.logger, target: `跳板机 ${label}` });
    await new Promise((resolve, reject) => {
        let settled = false;
        const fail = (error) => {
            if (settled)
                return;
            settled = true;
            closeQuietly();
            reject(error);
        };
        bastion.once('ready', () => {
            if (settled)
                return;
            settled = true;
            resolve();
        });
        bastion.on('error', (error) => {
            fail(new Error(policy.mismatchMessage() ?? `跳板机连接失败（${label}）：${classifyError(error.message)}`));
        });
        bastion.once('close', () => {
            fail(new Error(`跳板机连接已关闭（${label}）：目标连接尚未建立`));
        });
        if (connectConfig.tryKeyboard === true) {
            const password = connectConfig.password ?? '';
            bastion.on('keyboard-interactive', (_name, _instructions, _lang, _prompts, finishKb) => {
                finishKb([password]);
            });
        }
        try {
            bastion.connect(connectConfig);
        }
        catch (error) {
            fail(new Error(`跳板机连接失败（${label}）：${error instanceof Error ? error.message : String(error)}`));
        }
    });
    const sock = await new Promise((resolve, reject) => {
        let settled = false;
        const timer = setTimeout(() => {
            if (settled)
                return;
            settled = true;
            closeQuietly();
            reject(new Error(`跳板机通道打开超时（${label} → ${destination}，${String(JUMP_CHANNEL_TIMEOUT_MS / 1000)}s 无响应）：跳板机可能不允许转发或不响应`));
        }, JUMP_CHANNEL_TIMEOUT_MS);
        timer.unref?.();
        bastion.forwardOut('127.0.0.1', 0, options.spec.host, options.spec.port ?? 22, (error, channel) => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            if (error !== undefined && error !== null) {
                closeQuietly();
                reject(new Error(`跳板机通道打开失败（${label} → ${destination}）：${error.message}`));
                return;
            }
            resolve(channel);
        });
    });
    options.logger?.info(`[dsh-tty] ssh ${destination} 经跳板机 ${label} 已建立转发通道（ProxyJump）`);
    return { bastion, sock };
}
/* ------------------------------------------------------------------ *
 * ProxyCommand：单独一档信任级（默认关闭 + 显式开关 + 导入永不自动带入）
 * ------------------------------------------------------------------ */
/** 代理命令长度上限：与自定义命令标签同量级（它是一条命令行，不是脚本文件）。 */
export const PROXY_COMMAND_MAX = 2000;
/** 保留的子进程 stderr 上限（错误文案里只截一小段，避免把用户的日志整片吞进来）。 */
const PROXY_STDERR_KEEP = 2048;
/** 错误文案里展示的 stderr 片段上限。 */
const PROXY_STDERR_SHOWN = 300;
/** 代理命令 SIGTERM 之后的 SIGKILL 兜底（毫秒）。 */
const PROXY_KILL_GRACE_MS = 2000;
/**
 * `%h` / `%r` 等展开值允许的字符集。
 *
 * 为什么不是「先转义再代入」：代理命令最终交给 `sh -c`（Windows 是 `cmd /c`），
 * 而两边的转义规则不同（单引号在 cmd 里无效）。改为**白名单**：主机名 / 用户名本就
 * 只该由这些字符组成，含别的字符就直接拒绝执行——比「按平台各写一套转义」既短又稳。
 */
const PROXY_VALUE_SAFE = /^[A-Za-z0-9._@:\[\]-]+$/;
/** 关着闸门时携带代理命令的连接报什么错（导出供单测与客户端文案对照）。 */
export const PROXY_COMMAND_DISABLED = '代理命令（ProxyCommand）未启用：请到 插件配置 → 终端面板 打开「允许 ProxyCommand」后重试。'
    + '未启用时携带代理命令的连接不会退回直连——直连多半也连不上，还会把配置问题伪装成网络问题。';
/**
 * 宿主**没有授权**这条能力时报什么错（与「授权了但开关关着」分开报）。
 *
 * 为什么要分开：两者的「下一步动作」完全不同——前者要去宿主侧设环境变量 + 重启（界面上那个
 * 开关是点不动的），后者只是把开关打开。合成一句话会让用户对着一个点不动的开关反复点。
 */
export const PROXY_COMMAND_NOT_GRANTED = '代理命令（ProxyCommand）未获宿主授权：'
    + '在宿主侧设置环境变量 DSH_TTY_ALLOW_PROXY_COMMAND=1（可用 设置 → 环境变量 卡片写入 ~/.dsh/env.yml）'
    + '并重启宿主；HTTP 侧只能关闭它、不能打开（本机任意进程都能发回环请求，配置路由若能提权，这道闸门等于没有）。';
/**
 * ProxyCommand 闸门（**模块级策略，缺省「未授权 + 未启用」**）。
 *
 * 两个维度刻意分开：
 *   - `granted`：**宿主侧**授权（环境变量，进程启动时采样一次，见 kit 的 capability.js）。
 *     未授权时这个开关在 HTTP 侧点不动——那是整个「只能降不能升」约定的落点；
 *   - `enabled`：界面上那个开关（可以随时关，也可以随时开——但只有在授权为真时才可能开）。
 *
 * 为什么是模块级而不是每次调用传参：本包的建连入口有四个（终端 / SFTP / 隧道 / 探针），
 * 而它们**共用** `prepareSshConnect` ——把开关读在拨号那一处，四条路就不会各判一次
 * （漏一条就是「配了等于没配」或「关了还能用」）。写入方只有插件自己的 settings 热应用
 * （`applyPatch`），与 `setCredentialResolver` 同一个模式。
 */
let proxyCommandGranted = false;
let proxyCommandEnabled = false;
/** 设置 ProxyCommand 闸门（插件 settings 就绪与每次热更新时调用）。 */
export function setProxyCommandPolicy(next) {
    proxyCommandGranted = next.granted === true;
    proxyCommandEnabled = next.enabled === true;
}
/** 当前是否真的会用代理命令（探针用它把「配了但没开」与「连不上」分开报）。 */
export function proxyCommandAllowedNow() {
    return proxyCommandGranted && proxyCommandEnabled;
}
/** 宿主侧是否授权了这条能力（探针用它选文案：未授权 vs 未启用）。 */
export function proxyCommandGrantedNow() {
    return proxyCommandGranted;
}
/**
 * 清洗一份代理命令输入（settings schema / 宽松清洗 / 内联融合共用）。
 *
 * 返回 `undefined` = 没配。**只做形状校验**（非空 / 单行 / 长度），命令内容本身不解释——
 * 「能不能执行」由闸门决定，不由这里猜（含 `;` `/` `|` 都是合法的 shell 写法）。
 */
export function sanitizeProxyCommand(input) {
    if (typeof input !== 'string')
        return undefined;
    const trimmed = input.trim();
    if (trimmed === '' || trimmed.length > PROXY_COMMAND_MAX)
        return undefined;
    if (/[\r\n\0]/.test(trimmed))
        return undefined;
    return trimmed;
}
/** 严格校验一份代理命令输入（HTTP POST 路径）；返回错误信息或清洗结果。 */
export function validateProxyCommand(input) {
    if (typeof input !== 'string')
        return { error: 'proxyCommand 必须是字符串' };
    const trimmed = input.trim();
    if (trimmed === '')
        return {};
    if (trimmed.length > PROXY_COMMAND_MAX)
        return { error: `proxyCommand 过长（≤${String(PROXY_COMMAND_MAX)} 字符）` };
    if (/[\r\n\0]/.test(trimmed))
        return { error: 'proxyCommand 必须是单行（不能含换行/NUL）' };
    return { proxyCommand: trimmed };
}
/** 展示用片段（不含凭据；控制字符清掉、单行、截断）。 */
function excerpt(value) {
    const oneLine = value.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
    return oneLine.length > 60 ? `${oneLine.slice(0, 60)}…` : oneLine;
}
/**
 * 展开 `%h` / `%p` / `%r` / `%n` / `%%`（与 OpenSSH 同义）。
 *
 * `%h` 目标主机、`%p` 目标端口、`%r` 目标用户名、`%n` 目标主机（如写法里给的名字——
 * 本包没有别名概念，与 `%h` 同值）、`%%` 字面 `%`。其余 `%X` **原样保留**（不报错）：
 * 用户可能是在命令里写 `printf '%s'`，替我们没实现的占位符而失败才是意外。
 *
 * 代入值必须过白名单，否则**抛错拒绝执行**（见 `PROXY_VALUE_SAFE`）。
 */
export function expandProxyCommand(command, spec) {
    const values = {
        h: spec.host,
        n: spec.host,
        p: String(spec.port ?? 22),
        r: spec.username,
    };
    return command.replace(/%(.)/g, (whole, key) => {
        if (key === '%')
            return '%';
        const value = values[key];
        if (value === undefined)
            return whole;
        if (!PROXY_VALUE_SAFE.test(value)) {
            throw new Error(`代理命令里的 %${key} 无法代入：${excerpt(value)} 含 shell 特殊字符（只允许字母数字与 . _ @ : [ ] -）`);
        }
        return value;
    });
}
/**
 * 杀代理命令（含它拉起的子孙进程）。
 *
 * POSIX 上用 `detached: true` 让子进程自成进程组，`kill(-pid)` 一次收掉整组——代理命令
 * 常见写法是 `ssh -W %h:%p bastion` 这类**又开了一个进程**的命令，只杀 shell 会留下它。
 * 先 SIGTERM，2s 后仍活着再 SIGKILL（兜底定时器 unref，不挡进程退出）。
 */
function killProxyChild(child) {
    const pid = child.pid;
    const kill = (signal) => {
        try {
            if (pid !== undefined && process.platform !== 'win32')
                process.kill(-pid, signal);
            else
                child.kill(signal);
        }
        catch {
            try {
                child.kill(signal);
            }
            catch {
                /* 已退出 */
            }
        }
    };
    kill('SIGTERM');
    const timer = setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null)
            kill('SIGKILL');
    }, PROXY_KILL_GRACE_MS);
    timer.unref?.();
}
/**
 * 启动代理命令并把它接到目标连接上。
 *
 * 这一跳与 `dialJump` 的差别，逐条都有理由：
 *   1. **先过闸门**：关着就直接抛 `PROXY_COMMAND_DISABLED`（不 spawn、不退回直连）；
 *   2. **没有「握手」可等**：传输就是子进程的 stdio，ssh2 会在它上面跑握手——所以这里
 *      spawn 成功即返回，剩下的失败由目标连接的 error/close 路径 + `failure()` 共同呈现；
 *   3. **子进程死了要拖垮传输**：提前退出时 destroy 掉 sock，逼 ssh2 立刻报错（否则
 *      「命令一开始就失败」会伪装成 20s 握手超时）；
 *   4. **stderr 必须排空**：不排空的话命令输出一多就把管道写满、子进程卡死（经典坑），
 *      同时留一小段尾巴进错误文案——它是排查代理命令失败最直接的信息；
 *   5. **命令原文不进日志与错误文案**：它可能含凭据（如 `-i /path/key`），日志只写
 *      「已启动代理命令」与退出码。
 */
export async function dialProxyCommand(options) {
    const raw = sanitizeProxyCommand(options.spec.proxyCommand);
    if (raw === undefined)
        throw new Error('代理命令为空（proxyCommand 需要一条非空的单行命令）');
    if (!proxyCommandGranted)
        throw new Error(PROXY_COMMAND_NOT_GRANTED);
    if (!proxyCommandEnabled)
        throw new Error(PROXY_COMMAND_DISABLED);
    const destination = sshTarget(options.spec);
    const command = expandProxyCommand(raw, options.spec);
    const child = spawn(command, {
        shell: true,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
        // POSIX：自成进程组，收尾时能一次收掉命令拉起的子孙进程（见 killProxyChild）
        detached: process.platform !== 'win32',
    });
    const stdout = child.stdout;
    const stdin = child.stdin;
    const stderr = child.stderr;
    if (stdout === null || stdin === null || stderr === null) {
        killProxyChild(child);
        throw new Error('代理命令启动失败：stdio 管道未建立');
    }
    const sock = Duplex.from({ readable: stdout, writable: stdin });
    let failure = null;
    let disposed = false;
    /**
     * 传输是否已经关掉（子进程的输出结束）。
     *
     * 为什么要单独记：子进程**先结束输出、后触发 `exit`**，而 ssh2 一看到流断了就立刻报
     * 「Connection lost before handshake」——错误文案那一刻 `exit` 还没到。只认 `exit` 的话，
     * 最需要解释的那种失败（命令一开始就挂）反而拿不到任何解释。于是这里退一步：传输关了
     * 就至少把**已经攒到的 stderr** 交出去（那正是排查命令失败最直接的信息）。
     */
    let transportClosed = false;
    const chunks = [];
    let kept = 0;
    const stderrTail = () => {
        if (chunks.length === 0)
            return '';
        const text = Buffer.concat(chunks).toString('utf8').replace(/[\r\n\0]+/g, ' ').replace(/\s+/g, ' ').trim();
        return text === '' ? '' : `；stderr: ${text.slice(0, PROXY_STDERR_SHOWN)}`;
    };
    stderr.on('data', (chunk) => {
        // 常驻排空（不排空会把管道写满、子进程卡死）；只留最后一小段给错误文案
        if (kept >= PROXY_STDERR_KEEP)
            return;
        kept += chunk.length;
        chunks.push(chunk);
    });
    /** 记下失败事实并拖垮传输（提前退出时让 ssh2 立刻报错，而不是等满 readyTimeout）。 */
    const recordFailure = (error) => {
        // **覆盖**而不是只记第一个：传输关闭往往先触发出一个「语焉不详」的事实，
        // 随后 exit 事件带来的（退出码 + stderr）严格更有信息量
        failure = error;
        try {
            sock.destroy();
        }
        catch {
            /* 已销毁 */
        }
    };
    child.on('error', (error) => {
        recordFailure(new Error(`代理命令出错：${error.message}`));
    });
    child.on('exit', (code, signal) => {
        // 我们自己收尾时杀的（disposed）：不是失败，别把正常关闭记成错误
        if (disposed)
            return;
        const how = signal !== null ? `被信号 ${signal} 终止` : `退出码 ${String(code)}`;
        recordFailure(new Error(`代理命令已退出（${how}）${stderrTail()}`));
    });
    /**
     * 子进程创建失败（EACCES / 资源耗尽等）要在**这里**就抛出去：否则调用方拿到的是一条
     * 「永远连不上」的传输，错误文案会落到目标主机头上。
     */
    await new Promise((resolve, reject) => {
        let settled = false;
        child.once('spawn', () => {
            if (settled)
                return;
            settled = true;
            resolve();
        });
        child.once('error', (error) => {
            if (settled)
                return;
            settled = true;
            reject(new Error(`代理命令启动失败（${excerpt(command)}）：${error.message}`));
        });
    });
    options.logger?.info(`[dsh-tty] ssh ${destination} 已启动代理命令（ProxyCommand）作为传输`);
    const dispose = () => {
        if (disposed)
            return;
        disposed = true;
        try {
            sock.destroy();
        }
        catch {
            /* 已销毁 */
        }
        killProxyChild(child);
    };
    // 传输先关（对端消失 / ssh2 主动 destroy）时也要杀子进程：否则每次重连漏一个常驻进程
    /*
     * **readable 侧 end** 是关键时点：ssh2 就是看到它才判定「握手前连接中断」并发错，
     * 而子进程的 `exit` 还在后面（实测差 1~2ms）。所以在这里就认定「传输已关」，
     * 错误路径才能带上已经攒到的 stderr。
     */
    sock.once('end', () => {
        transportClosed = true;
    });
    sock.once('close', () => {
        transportClosed = true;
        // 不置 disposed：那是「我们主动收尾」的标记，而这里是传输先没了——子进程该杀，
        // 但它随后带来的 exit 事实仍要记下来（失败文案靠它）
        if (!disposed)
            killProxyChild(child);
    });
    /*
     * 必须挂这个监听器：`Duplex.from({readable, writable})` 销毁时会把 **AbortError**
     * 抛给底层流，没人接就是进程级的「未捕获异常」（实测：光调 dispose() 就能触发）。
     * 收尾途中的错误不算失败（disposed 时忽略）；在途的错误记下来，供错误文案点名。
     */
    sock.on('error', (error) => {
        if (disposed)
            return;
        /*
         * **AbortError 直接忽略**：它不是一个诊断，而是我们自己 destroy 这条传输时 Duplex 抛给
         * 底层流的副产品（"The operation was aborted"）。把它记成失败原因，用户看到的就会是这句
         * 毫无信息量的话，而不是「命令退出了、stderr 说了什么」。
         */
        if (error.name === 'AbortError' || error.code === 'ABORT_ERR')
            return;
        recordFailure(new Error(`代理命令传输出错：${error.message}`));
    });
    return {
        child,
        sock,
        failure: () => {
            if (failure !== null)
                return failure;
            // 主动收尾之后不算失败；传输自己关了且还没有 exit 事实时，先把 stderr 尾巴交出去
            if (disposed || !transportClosed)
                return null;
            const tail = stderrTail();
            return new Error(`代理命令传输已关闭${tail === '' ? '（命令已结束）' : tail}`);
        },
        dispose,
    };
}
/**
 * 清洗一份跳板机输入（settings schema / 宽松清洗 / 内联融合共用）。
 *
 * 返回 `undefined` = **没有可用的跳板机**（`host` 为空）——调用方据此把 `jump` 整个丢掉，
 * 而不是留下一个 `host: ''` 的半个对象（那会让 `dialJump` 去连空主机名）。
 * 缺省不填的字段**不写进结果**：它们要在拨号时「继承目标那一跳」（见 `jumpSpecOf`）。
 */
export function sanitizeJumpSpec(input) {
    if (typeof input !== 'object' || input === null)
        return undefined;
    const raw = input;
    const host = typeof raw.host === 'string' ? raw.host.trim() : '';
    if (host === '')
        return undefined;
    const port = Number(raw.port);
    const jump = { host, port: Number.isInteger(port) && port >= 1 && port <= 65535 ? port : 22 };
    if (typeof raw.username === 'string' && raw.username.trim() !== '')
        jump.username = raw.username.trim();
    if (raw.auth === 'agent' || raw.auth === 'key' || raw.auth === 'password')
        jump.auth = raw.auth;
    if (typeof raw.keyPath === 'string' && raw.keyPath !== '')
        jump.keyPath = raw.keyPath;
    if (typeof raw.passphrase === 'string' && raw.passphrase !== '')
        jump.passphrase = raw.passphrase;
    if (typeof raw.password === 'string' && raw.password !== '')
        jump.password = raw.password;
    return jump;
}
/** 严格校验一份跳板机输入（HTTP POST 路径）；返回错误信息或清洗结果。 */
export function validateJumpSpec(input) {
    if (typeof input !== 'object' || input === null)
        return { error: 'jump 必须是对象' };
    const raw = input;
    if (typeof raw.host !== 'string' || raw.host.trim() === '')
        return { error: 'jump.host 必须是非空字符串' };
    if (raw.port !== undefined && raw.port !== '') {
        const port = Number(raw.port);
        if (!Number.isInteger(port) || port < 1 || port > 65535)
            return { error: 'jump.port 必须是 1~65535 的整数' };
    }
    if (raw.username !== undefined && typeof raw.username !== 'string')
        return { error: 'jump.username 必须是字符串' };
    if (raw.auth !== undefined && raw.auth !== 'agent' && raw.auth !== 'key' && raw.auth !== 'password') {
        return { error: 'jump.auth 必须是 agent / key / password' };
    }
    for (const key of ['keyPath', 'passphrase', 'password']) {
        if (raw[key] !== undefined && typeof raw[key] !== 'string')
            return { error: `jump.${key} 必须是字符串` };
    }
    if (raw.auth === 'key' && (typeof raw.keyPath !== 'string' || raw.keyPath.trim() === '')) {
        return { error: 'jump.auth=key 需要 jump.keyPath' };
    }
    return { jump: sanitizeJumpSpec(raw) };
}
/**
 * 代理命令失败的事实 → 错误文案后缀（空串 = 没失败）。
 *
 * 为什么要它：代理命令死了之后 ssh2 只会报一句「握手前连接中断」，那会把用户支到目标主机上
 * 去查。调用方在错误分支拼上这句，用户才知道是该去看代理命令的 stderr。
 */
export function proxyFailureSuffix(proxy) {
    const failure = proxy?.failure() ?? null;
    return failure === null ? '' : `；${failure.message}`;
}
/**
 * 四个连接点（终端 / SFTP / 隧道 / 探针）**共用**的建连前准备。
 *
 * 为什么要有这个函数：跳板机不是「终端的特性」——SFTP、端口转发、探针各自都在建 SSH 连接
 * （`sftp.ts` / `tunnels.ts` / `probe.ts` 各有一处 `new Client()`）。把「构造 config →
 * 需要时拨跳板机 / 起代理命令 → 接上传输 → 装目标 TOFU 策略」收成一处，四条路才不会各写一份
 * （那正是这一项立项时点名的「三处各写一份必然漂」）。
 *
 * **调用方负责**：自己 `conn.connect(connectConfig)`、自己处理 ready/error/close，
 * 并在收尾（成功或失败）时对 `bastion` 调 `end()`、对 `proxy` 调 `dispose()`。
 */
export async function prepareSshConnect(options) {
    const { spec, store, logger } = options;
    const target = targetWithJump(spec);
    const attached = await attachSshTransport(options);
    try {
        const policy = applyHostKeyPolicy({ connectConfig: attached.connectConfig, spec, store, logger, target });
        return { connectConfig: attached.connectConfig, policy, bastion: attached.transport.bastion, proxy: attached.transport.proxy, target };
    }
    catch (error) {
        // 传输已经起来了、策略却装不上：这里必须自己收尾，否则漏一条连接 / 一个进程
        try {
            attached.transport.bastion?.end();
        }
        catch {
            /* 已断开 */
        }
        attached.transport.proxy?.dispose();
        throw error;
    }
}
/**
 * 只做「构造目标 config（需要时拨跳板机 / 起代理命令并把传输接上）」这一半。
 *
 * 拆出来的唯一理由：**探针自己装 hostVerifier**（`makeHostKeyVerifier` 要收集
 * hostkey 结论，不用 `applyHostKeyPolicy`），但它同样需要跳板机 / 代理命令。返回值里的
 * `transport` 由调用方负责收尾。
 */
export async function attachSshTransport(options) {
    const { spec, store, logger } = options;
    const connectConfig = await buildConnectConfig(spec);
    if (options.readyTimeoutMs !== undefined)
        connectConfig.readyTimeout = options.readyTimeoutMs;
    const hasJump = spec.jump !== undefined;
    const proxyCommand = sanitizeProxyCommand(spec.proxyCommand);
    if (hasJump && proxyCommand !== undefined) {
        // OpenSSH 语义：两者互斥、ProxyJump 优先。**不静默**——用户以为走的是代理命令是最坏情况
        logger?.warn(`[dsh-tty] ssh ${sshTarget(spec)} 同时配了跳板机与代理命令：按 OpenSSH 语义走跳板机（ProxyJump 优先），代理命令被忽略`);
    }
    if (hasJump) {
        const dialed = await dialJump({ spec, store, logger, readyTimeoutMs: options.readyTimeoutMs });
        connectConfig.sock = dialed.sock;
        return { connectConfig, transport: { bastion: dialed.bastion, proxy: null } };
    }
    if (proxyCommand !== undefined) {
        const dialed = await dialProxyCommand({ spec, logger });
        connectConfig.sock = dialed.sock;
        return { connectConfig, transport: { bastion: null, proxy: dialed } };
    }
    return { connectConfig, transport: { bastion: null, proxy: null } };
}
/**
 * 建立 SSH 连接并打开交互 shell channel，返回 TermHandle。
 * 失败（连接超时/认证被拒/host 不可达）时 reject 带人类可读信息。
 */
export async function spawnSsh(spec, options) {
    const target = sshTarget(spec);
    const logger = options.logger;
    // agent forwarding 预检：缺 SSH_AUTH_SOCK 时 ssh2 只会静默不转发，这里显式报错
    if (spec.agentForward === true && (process.env.SSH_AUTH_SOCK === undefined || process.env.SSH_AUTH_SOCK === '')) {
        throw new Error('agent forwarding 需要 SSH_AUTH_SOCK（本机未运行 ssh-agent 或变量未设置）');
    }
    const conn = new Client();
    /** 跳板机连接（ProxyJump）：它拥有目标借用的通道，收尾时必须由本函数 end 掉。 */
    let bastion = null;
    /** 代理命令（ProxyCommand）：它拥有目标借用的传输，收尾时必须由本函数 dispose 掉。 */
    let proxy = null;
    const output = new PassThrough();
    let exitCode = null;
    let exitSignal = null;
    let settleDone;
    const done = new Promise((resolve) => {
        settleDone = resolve;
    });
    let finished = false;
    const finish = () => {
        if (finished)
            return;
        finished = true;
        try {
            output.end();
        }
        catch {
            /* 已结束 */
        }
        try {
            conn.end();
        }
        catch {
            /* 已断开 */
        }
        // 跳板机**最后**关：顺序反了会在目标还活着时抽掉它借用的通道
        if (bastion !== null) {
            try {
                bastion.end();
            }
            catch {
                /* 已断开 */
            }
        }
        // 代理命令同样最后收：先关目标连接再杀子进程，写进子进程的最后一个字节才有机会被读到
        proxy?.dispose();
        settleDone({ exitCode, signal: exitSignal });
    };
    // 认证配置可能抛错（keyPath 读不到 / 引用解析不到）——先构造再连
    /*
     * 建连前准备（含跳板机 / 代理命令）：拨号失败/超时都在 dialJump / dialProxyCommand 里
     * 点名那一跳并自我清理；成功之后它们的生死由本函数的 finish() 一并负责
     * （目标先关、跳板机与代理命令后关）。
     */
    const prepared = await prepareSshConnect({ spec, store: options.hostKeyStore, logger });
    const connectConfig = prepared.connectConfig;
    const policy = prepared.policy;
    bastion = prepared.bastion;
    proxy = prepared.proxy;
    /** 持久会话：远程 tmux 探测/降级提示（spawn 后由调用方注入终端）。 */
    let startupNotice;
    let tmuxUsed = false;
    const channel = await new Promise((resolve, reject) => {
        let settled = false;
        let watchdog = null;
        const clearWatchdog = () => {
            if (watchdog !== null) {
                clearTimeout(watchdog);
                watchdog = null;
            }
        };
        // channel 打开兜底（0.19.0）：readyTimeout 只覆盖到认证成功；对端不响应
        // channel-open（堡垒机 / sshd 限制并发 channel）时 await 永不 settle——
        // 连接活着、keepalive 正常，用户端「Connecting …」常驻且拿不到 handle
        // 去取消。每个 channel 尝试挂 15s 计时（与 tmux 探测的 10s 同思路），
        // 超时断开连接并明确报错。
        const armWatchdog = (what) => {
            clearWatchdog();
            watchdog = setTimeout(() => {
                if (settled)
                    return;
                settled = true;
                try {
                    conn.end();
                }
                catch {
                    /* 已断开 */
                }
                reject(new Error(`SSH channel 打开超时（${what}15s 无响应）：对端可能限制了并发 channel 数或不响应，连接已断开`));
            }, 15_000);
            watchdog.unref?.();
        };
        const settleOk = (ch) => {
            if (settled)
                return;
            settled = true;
            clearWatchdog();
            resolve(ch);
        };
        const settleErr = (error) => {
            if (settled)
                return;
            settled = true;
            clearWatchdog();
            reject(error);
        };
        const openShell = () => {
            armWatchdog('shell channel ');
            // agentForward 走 per-channel 请求（@types/ssh2 的 ShellOptions 未声明，
            // 运行时支持；仅在本机 agent 存在时生效，见 buildConnectConfig）
            conn.shell({ term: options.term, cols: options.cols, rows: options.rows, agentForward: spec.agentForward === true }, (error, ch) => {
                if (error !== undefined && error !== null) {
                    conn.end();
                    settleErr(new Error(`shell channel 打开失败: ${error.message}`));
                    return;
                }
                settleOk(ch);
            });
        };
        /** 自定义命令（0.14.0）：`conn.exec(command, {pty})`，与 tmux 分支同形。 */
        const openCommand = () => {
            armWatchdog('命令 channel ');
            conn.exec(options.command ?? '', { pty: { term: options.term, cols: options.cols, rows: options.rows } }, (error, ch) => {
                if (error !== undefined && error !== null) {
                    conn.end();
                    settleErr(new Error(`远程命令启动失败: ${error.message}`));
                    return;
                }
                settleOk(ch);
            });
        };
        /** 持久会话：远程 `exec tmux new-session -A`（pty channel，语义与 shell 一致）。 */
        const openTmux = () => {
            // 链式 set-option 幂等重放（attach 已有 server 时也生效）；首 pane 在
            // 选项生效前创建，default-terminal 用 tmux 自身默认（README 已知限制）
            const cmd = [
                `exec tmux -L ${TMUX_SOCKET} -f /dev/null new-session -A -s ${shSingleQuote(options.persist?.name ?? '')}`,
                "';' set-option -g status off",
                "';' set-option -g history-limit 20000",
                "';' set-option -ga terminal-overrides ,*:RGB",
            ].join(' ');
            armWatchdog('tmux channel ');
            conn.exec(cmd, { pty: { term: options.term, cols: options.cols, rows: options.rows } }, (error, ch) => {
                if (error !== undefined && error !== null) {
                    // tmux 启动失败（存在但异常）：连接已建立，降级普通 shell 优于直接报错
                    logger?.warn(`[dsh-tty] ssh ${target} tmux 启动失败，降级普通 shell: ${error.message}`);
                    startupNotice = 'tmux 启动失败，已降级为普通会话';
                    openShell();
                    return;
                }
                tmuxUsed = true;
                settleOk(ch);
            });
        };
        const openWithPersist = () => {
            // 先毫秒级探测远程是否有 tmux（不带 pty 的 exec）。决策依据：exit（大多
            // 数 sshd 立即回）→ close（兜底，个别实现无 exit）→ 10s 超时（实测某些
            // sshd 如 CentOS 9 只回 exit 不回 close，等 close 会永久卡死 spawn）。
            // error 与 close 可能先后到达，proceeded 防止降级路径开两条 channel
            let proceeded = false;
            const fallback = (notice) => {
                if (proceeded)
                    return;
                proceeded = true;
                startupNotice = notice;
                openShell();
            };
            const decide = (code) => {
                if (proceeded)
                    return;
                proceeded = true;
                if (code === 0)
                    openTmux();
                else
                    fallback('远程 tmux 不可用（未安装或探测超时），本次以普通会话连接；安装 tmux 后持久会话可跨断线/宿主重启恢复');
            };
            conn.exec('command -v tmux >/dev/null 2>&1', (error, stream) => {
                if (error !== undefined && error !== null) {
                    fallback('远程 tmux 探测失败，已降级为普通会话');
                    return;
                }
                stream.on('exit', (c) => { decide(typeof c === 'number' ? c : 1); });
                stream.on('close', () => { decide(null); });
                stream.on('error', () => fallback('远程 tmux 探测失败，已降级为普通会话'));
                const timer = setTimeout(() => decide(null), 10_000);
                timer.unref?.();
            });
        };
        conn.on('ready', () => {
            // 命令标签（0.14.0）优先：不做 tmux 持久化（命令短命，attach 没意义）
            if (options.command !== undefined && options.command !== '')
                openCommand();
            else if (options.persist !== undefined)
                openWithPersist();
            else
                openShell();
        });
        conn.on('error', (error) => {
            if (!settled) {
                const mismatch = policy.mismatchMessage();
                if (mismatch !== null)
                    settleErr(new Error(mismatch));
                else
                    settleErr(new Error(`SSH 连接失败（${targetWithJump(spec)}）: ${classifyError(error.message)}${proxyFailureSuffix(proxy)}`));
            }
            else {
                logger?.warn(`[dsh-tty] ssh ${target} 连接错误: ${error.message}`);
                finish();
            }
        });
        conn.on('close', () => {
            // channel 建立前连接就断了：不能让 await 悬挂（0.19.0 兜底）
            settleErr(new Error(`SSH 连接已关闭（${targetWithJump(spec)}，channel 未建立）${proxyFailureSuffix(proxy)}`));
            finish();
        });
        if (connectConfig.tryKeyboard === true) {
            const password = connectConfig.password ?? '';
            conn.on('keyboard-interactive', (_name, _instructions, _lang, _prompts, finishKb) => {
                finishKb([password]);
            });
        }
        try {
            conn.connect(connectConfig);
        }
        catch (error) {
            settleErr(error instanceof Error ? error : new Error(String(error)));
        }
    });
    channel.on('data', (chunk) => {
        output.write(chunk);
    });
    channel.stderr.on('data', (chunk) => {
        output.write(chunk);
    });
    channel.on('exit', (code, signal) => {
        exitCode = typeof code === 'number' ? code : null;
        exitSignal = typeof signal === 'string' ? signal : null;
    });
    channel.on('close', () => {
        finish();
    });
    // 持久会话的重画（0.10.1 跨窗口共享）：远程 list-clients + 逐个
    // refresh-client 一条 exec 管道完成；resolve 时机 = 远程命令跑完
    const tmuxRefresh = tmuxUsed && options.persist !== undefined
        ? () => new Promise((resolve) => {
            const cmd = `tmux -L ${TMUX_SOCKET} list-clients -t ${shSingleQuote(options.persist?.name ?? '')} -F '#{client_name}' | ` +
                `while IFS= read -r c; do tmux -L ${TMUX_SOCKET} refresh-client -t "$c"; done`;
            try {
                conn.exec(cmd, (error, stream) => {
                    if (error !== undefined && error !== null) {
                        resolve();
                        return;
                    }
                    stream.on('close', () => resolve());
                    stream.on('error', () => resolve());
                });
            }
            catch {
                resolve();
            }
        })
        : undefined;
    // 持久会话的关闭收尾：kill-session 须在连接还活着时发出（连接随 channel
    // 关闭而断开）；resolve 时机 = 远程命令跑完（stream close），调用方另有
    // 2.5s 兜底 forceKill 防悬挂
    const tmuxTeardown = tmuxUsed && options.persist !== undefined
        ? () => new Promise((resolve) => {
            try {
                conn.exec(`tmux -L ${TMUX_SOCKET} kill-session -t ${shSingleQuote(options.persist?.name ?? '')}`, (error, stream) => {
                    if (error !== undefined && error !== null) {
                        resolve();
                        return;
                    }
                    stream.on('close', () => resolve());
                    stream.on('error', () => resolve());
                });
            }
            catch {
                resolve();
            }
        })
        : undefined;
    // 背压透传：TtyServer 暂停 PassThrough 时一并暂停上游 channel，
    // 避免高速输出（cat 大文件）在 Node 侧无界堆积
    const nativePause = output.pause.bind(output);
    output.pause = () => {
        try {
            channel.pause();
        }
        catch {
            /* channel 已关闭 */
        }
        return nativePause();
    };
    const nativeResume = output.resume.bind(output);
    output.resume = () => {
        try {
            channel.resume();
        }
        catch {
            /* channel 已关闭 */
        }
        return nativeResume();
    };
    logger?.info(`[dsh-tty] ssh 会话就绪: ${target}${tmuxUsed ? '（tmux 持久）' : ''}`);
    /**
     * 服务器状态条（0.17.0）：同一条连接上的**独立** exec channel（不碰 PTY
     * 那条）。stderr 必须消费掉——未读的 channel 数据会把远端发送窗口堵住，
     * 采集脚本会卡在写 stdout 上；诊断内容不受我们控制，一律不进任何日志。
     */
    const statsExec = (command, onLine, onError) => {
        let stopped = false;
        let open = null;
        const lines = new StatsLineBuffer();
        const decoder = new StringDecoder('utf8');
        try {
            conn.exec(command, (error, ch) => {
                // stop() 可能在 channel 打开前就被调用（订阅瞬断）：开了就立刻关掉
                if (stopped) {
                    try {
                        ch.close();
                    }
                    catch {
                        /* 已关闭 */
                    }
                    return;
                }
                if (error !== null && error !== undefined) {
                    onError();
                    return;
                }
                open = ch;
                ch.on('data', (chunk) => {
                    for (const line of lines.push(decoder.write(chunk)))
                        onLine(line);
                });
                ch.stderr.on('data', () => {
                    /* 丢弃：远端脚本自身的报错不进任何日志（防凭证/路径意外落到日志里） */
                });
                ch.on('close', () => {
                    // 主动 stop() 之外的关闭 = 采集进程自己结束（远端无 /proc、被 kill）
                    if (!stopped)
                        onError();
                });
                ch.on('error', () => {
                    if (!stopped)
                        onError();
                });
            });
        }
        catch {
            onError();
        }
        return {
            stop: () => {
                stopped = true;
                try {
                    open?.close();
                }
                catch {
                    /* 已关闭 */
                }
            },
        };
    };
    return {
        kind: 'ssh',
        pid: null,
        output,
        done,
        write: (data) => {
            channel.write(data);
            return Promise.resolve(true);
        },
        resize: (cols, rows) => {
            try {
                channel.setWindow(rows, cols, 0, 0);
            }
            catch {
                /* channel 已关闭 */
            }
        },
        terminate: () => {
            try {
                channel.close();
            }
            catch {
                /* 已关闭 */
            }
            finish();
            return Promise.resolve(true);
        },
        statsExec,
        ...(tmuxTeardown !== undefined ? { tmuxTeardown } : {}),
        ...(tmuxRefresh !== undefined ? { tmuxRefresh } : {}),
        ...(startupNotice !== undefined ? { startupNotice } : {}),
    };
}
//# sourceMappingURL=ssh.js.map