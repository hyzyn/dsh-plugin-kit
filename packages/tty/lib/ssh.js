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
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { TMUX_SOCKET } from './tmux.js';
import { shSingleQuote } from './shell-integration.js';
/** `env:VAR` 前缀从 process.env 取值；否则原样返回。 */
function resolveSecret(value) {
    if (value === undefined)
        return undefined;
    if (!value.startsWith('env:'))
        return value;
    const name = value.slice(4);
    const resolved = process.env[name];
    if (resolved === undefined || resolved === '')
        throw new Error(`环境变量未设置: ${name}`);
    return resolved;
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
/* ------------------------------------------------------------------ *
 * 连接与 channel 包装
 * ------------------------------------------------------------------ */
/** 构造连接配置（认证三态 + keepalive + hostHash）；隧道管理器与 spawnSsh 共用。 */
export function buildConnectConfig(spec) {
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
        base.agent = process.env.SSH_AUTH_SOCK;
    }
    else if (auth === 'key') {
        if (typeof spec.keyPath !== 'string' || spec.keyPath.trim() === '') {
            throw new Error('auth=key 需要 keyPath（私钥路径）');
        }
        base.privateKey = readFileSync(expandHome(spec.keyPath.trim()));
        const passphrase = resolveSecret(spec.passphrase);
        if (passphrase !== undefined)
            base.passphrase = passphrase;
    }
    else {
        const password = resolveSecret(spec.password);
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
        if (known === undefined) {
            store?.record(spec.host, port, hash);
            logger?.info(`[dsh-tty] ssh ${target} 首次连接，已记录 host key 指纹 sha256:${hash}（TOFU）`);
            return true;
        }
        if (known === hash) {
            logger?.info(`[dsh-tty] ssh ${target} host key 指纹匹配（sha256:${hash}）`);
            return true;
        }
        hostKeyMismatch =
            `SSH 主机密钥指纹变更：${target} 已记录 sha256:${known}，本次为 sha256:${hash}。` +
                '可能是主机重装或换钥匙，也可能是中间人（MITM）冒充；确认安全后，到 设置 → 插件 → 终端面板 → SSH 主机密钥记录 删除该主机再重连。';
        logger?.warn(`[dsh-tty] ${hostKeyMismatch}`);
        return false;
    };
    return { mismatchMessage: () => hostKeyMismatch };
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
        settleDone({ exitCode, signal: exitSignal });
    };
    // 认证配置可能抛错（keyPath 读不到 / env 变量缺失）——先构造再连
    const connectConfig = buildConnectConfig(spec);
    const policy = applyHostKeyPolicy({ connectConfig, spec, store: options.hostKeyStore, logger, target });
    /** 持久会话：远程 tmux 探测/降级提示（spawn 后由调用方注入终端）。 */
    let startupNotice;
    let tmuxUsed = false;
    const channel = await new Promise((resolve, reject) => {
        let settled = false;
        const openShell = () => {
            // agentForward 走 per-channel 请求（@types/ssh2 的 ShellOptions 未声明，
            // 运行时支持；仅在本机 agent 存在时生效，见 buildConnectConfig）
            conn.shell({ term: options.term, cols: options.cols, rows: options.rows, agentForward: spec.agentForward === true }, (error, ch) => {
                settled = true;
                if (error !== undefined && error !== null) {
                    conn.end();
                    reject(new Error(`shell channel 打开失败: ${error.message}`));
                    return;
                }
                resolve(ch);
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
            conn.exec(cmd, { pty: { term: options.term, cols: options.cols, rows: options.rows } }, (error, ch) => {
                if (error !== undefined && error !== null) {
                    // tmux 启动失败（存在但异常）：连接已建立，降级普通 shell 优于直接报错
                    logger?.warn(`[dsh-tty] ssh ${target} tmux 启动失败，降级普通 shell: ${error.message}`);
                    startupNotice = 'tmux 启动失败，已降级为普通会话';
                    openShell();
                    return;
                }
                settled = true;
                tmuxUsed = true;
                resolve(ch);
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
            if (options.persist !== undefined)
                openWithPersist();
            else
                openShell();
        });
        conn.on('error', (error) => {
            if (!settled) {
                settled = true;
                const mismatch = policy.mismatchMessage();
                if (mismatch !== null)
                    reject(new Error(mismatch));
                else
                    reject(new Error(`SSH 连接失败（${target}）: ${error.message}`));
            }
            else {
                logger?.warn(`[dsh-tty] ssh ${target} 连接错误: ${error.message}`);
                finish();
            }
        });
        conn.on('close', () => {
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
            reject(error instanceof Error ? error : new Error(String(error)));
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
        ...(tmuxTeardown !== undefined ? { tmuxTeardown } : {}),
        ...(tmuxRefresh !== undefined ? { tmuxRefresh } : {}),
        ...(startupNotice !== undefined ? { startupNotice } : {}),
    };
}
//# sourceMappingURL=ssh.js.map