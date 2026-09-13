/**
 * @hyzyn/dsh-docker — 远程 / 本地一次性命令执行层。
 *
 * 与 dsh-tty 的关系：**数据级复用，代码级不耦合**。连接簿条目与主机指纹
 * 分别来自 / 存放在各自插件（tty 经 ctx.settings.get('tty') 只读取得连接簿；
 * 本插件自持一份 hostKeys 记录），因此 dsh-docker 可以单独安装，tty 无需
 * 任何改动，也不会因为 tty 升级而连带失效。指纹策略与 tty/src/ssh.ts 一致
 * （TOFU：首次记录、之后必须匹配，不匹配拒绝连接）。
 *
 * 与 tty 的差别：这里只开**非 PTY 的 exec channel**（RFC 4254 §6.5），
 * 每条命令一条 channel，收完 stdout/stderr 就关闭，不做交互式 shell。
 * 一次性命令走 run()/runLocal()（超时 + 输出上限）；`docker logs --follow`
 * 这类长流走 stream()/runLocalStream()（无总超时、无上限，靠 AbortSignal 停止）。
 */
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import { Client } from 'ssh2';
/* ------------------------------------------------------------------ *
 * 通用工具
 * ------------------------------------------------------------------ */
/** `env:VAR` 前缀从 process.env 取值；否则原样返回。 */
export function resolveSecret(value) {
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
export function expandHome(path) {
    if (path === '~')
        return homedir();
    if (path.startsWith('~/'))
        return join(homedir(), path.slice(2));
    return path;
}
/** 展示用目标串：user@host（非默认端口时带 :port）。 */
export function sshTarget(spec) {
    const port = spec.port ?? 22;
    return `${spec.username}@${spec.host}${port === 22 ? '' : ':' + String(port)}`;
}
/**
 * 把 argv 拼成远程 shell 可执行的单行命令（POSIX 单引号转义）。
 * exec channel 的 command 由远端 shell 解析，因此**必须**转义——本插件所有
 * 命令都以 argv 数组构造，禁止把用户输入拼进字符串。
 */
export function shJoin(argv) {
    return argv.map((arg) => "'" + arg.replaceAll("'", "'\\''") + "'").join(' ');
}
/** 连接池键：同一主机同一账号复用一条 SSH 连接。 */
function poolKey(spec) {
    return `${spec.username}@${spec.host}:${String(spec.port ?? 22)}`;
}
const IDLE_MS = 120_000;
const SWEEP_MS = 30_000;
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_BYTES = 512 * 1024;
/**
 * 空闲回收判定：busy>0 的连接上挂着长流（docker logs --follow 可以几小时不结束），
 * 期间 lastUsed 不会刷新——若只看 idle 就会把正在推送的流掐断，必须先看 busy。
 * 抽成纯函数便于回归（sweeper 本体依赖定时器，难以直接驱动）。
 */
export function shouldRecycleConn(conn, now, idleMs = IDLE_MS) {
    if (conn.busy > 0)
        return false;
    return now - conn.lastUsed >= idleMs;
}
/** 远程一次性命令执行器：懒连接池 + TOFU 指纹 + 输出上限。 */
export class RemoteExec {
    logger;
    store;
    conns = new Map();
    sweeper = null;
    constructor(logger, store) {
        this.logger = logger;
        this.store = store;
    }
    /** 插件卸载：关定时器与全部连接（幂等）。 */
    disposeAll() {
        if (this.sweeper !== null) {
            clearInterval(this.sweeper);
            this.sweeper = null;
        }
        for (const rt of this.conns.values()) {
            try {
                rt.client.end();
            }
            catch {
                /* 连接已断开 */
            }
        }
        this.conns.clear();
    }
    /** 在远程执行一条命令（argv 形式，内部做 shell 转义）。 */
    async run(spec, argv, options) {
        const command = shJoin(argv);
        const client = await this.acquire(spec);
        const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
        const maxBytes = options?.maxBytes ?? DEFAULT_MAX_BYTES;
        const started = Date.now();
        const channel = await new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error(`SSH exec 打开 channel 超时（${String(timeoutMs)}ms）：${sshTarget(spec)}`));
            }, timeoutMs);
            client.exec(command, (error, ch) => {
                clearTimeout(timer);
                if (error !== undefined && error !== null) {
                    reject(new Error(`SSH exec 失败：${error.message}`));
                    return;
                }
                resolve(ch);
            });
        });
        return await new Promise((resolve, reject) => {
            let stdout = '';
            let stderr = '';
            let stdoutBytes = 0;
            let stderrBytes = 0;
            let truncated = false;
            let timedOut = false;
            let settled = false;
            const cap = (text, current, chunk) => {
                const room = maxBytes - current;
                if (room <= 0) {
                    truncated = true;
                    return { text, bytes: current };
                }
                if (chunk.length > room) {
                    truncated = true;
                    return { text: text + chunk.subarray(0, room).toString('utf8'), bytes: maxBytes };
                }
                return { text: text + chunk.toString('utf8'), bytes: current + chunk.length };
            };
            const timer = setTimeout(() => {
                timedOut = true;
                try {
                    channel.signal('KILL');
                }
                catch {
                    /* 远端可能已结束 */
                }
                channel.close();
            }, timeoutMs);
            const finish = (code) => {
                if (settled)
                    return;
                settled = true;
                clearTimeout(timer);
                const rt = this.conns.get(poolKey(spec));
                if (rt !== undefined)
                    rt.lastUsed = Date.now();
                resolve({ code, stdout, stderr, timedOut, truncated, durationMs: Date.now() - started });
            };
            channel.on('data', (chunk) => {
                const next = cap(stdout, stdoutBytes, chunk);
                stdout = next.text;
                stdoutBytes = next.bytes;
            });
            channel.stderr.on('data', (chunk) => {
                const next = cap(stderr, stderrBytes, chunk);
                stderr = next.text;
                stderrBytes = next.bytes;
            });
            channel.on('close', (code) => {
                finish(typeof code === 'number' ? code : null);
            });
            channel.on('error', (error) => {
                if (settled)
                    return;
                settled = true;
                clearTimeout(timer);
                reject(new Error(`SSH exec channel 异常：${error.message}`));
            });
            if (options?.input !== undefined)
                channel.end(options.input);
        });
    }
    /**
     * 在远程开一条**长流**（docker logs --follow）：stdout/stderr 逐块回调，
     * channel 关闭时 resolve 退出码。
     *
     * 与 run() 的差别：无总超时、无输出上限；外部 AbortSignal 触发停止时
     * channel.signal('KILL') + channel.close()，**不 client.end()**——连接池里的
     * 连接要留给后续请求复用。流存续期间连接计 busy，sweeper 不得按空闲回收。
     */
    async stream(spec, argv, handlers, signal) {
        const command = shJoin(argv);
        const client = await this.acquire(spec);
        const rt = this.conns.get(poolKey(spec));
        if (rt !== undefined)
            rt.busy += 1;
        let released = false;
        // try/finally 保证 busy 增减严格配对：异常路径也不能把连接永久标成 busy
        const release = () => {
            if (released)
                return;
            released = true;
            if (rt !== undefined) {
                rt.busy = Math.max(0, rt.busy - 1);
                rt.lastUsed = Date.now();
            }
        };
        try {
            if (signal?.aborted === true)
                return { code: null };
            const channel = await new Promise((resolve, reject) => {
                const timer = setTimeout(() => {
                    reject(new Error(`SSH exec 打开 channel 超时（${String(DEFAULT_TIMEOUT_MS)}ms）：${sshTarget(spec)}`));
                }, DEFAULT_TIMEOUT_MS);
                client.exec(command, (error, ch) => {
                    clearTimeout(timer);
                    if (error !== undefined && error !== null) {
                        reject(new Error(`SSH exec 失败：${error.message}`));
                        return;
                    }
                    resolve(ch);
                });
            });
            return await new Promise((resolve, reject) => {
                const stdoutDecoder = new StringDecoder('utf8');
                const stderrDecoder = new StringDecoder('utf8');
                let settled = false;
                const onAbort = () => {
                    if (settled)
                        return;
                    try {
                        channel.signal('KILL');
                    }
                    catch {
                        /* 远端可能已结束 */
                    }
                    channel.close();
                };
                const finish = (code) => {
                    if (settled)
                        return;
                    settled = true;
                    signal?.removeEventListener('abort', onAbort);
                    const stdoutTail = stdoutDecoder.end();
                    if (stdoutTail !== '')
                        handlers.onStdout(stdoutTail);
                    const stderrTail = stderrDecoder.end();
                    if (stderrTail !== '')
                        handlers.onStderr(stderrTail);
                    resolve({ code });
                };
                if (signal !== undefined) {
                    if (signal.aborted)
                        onAbort();
                    else
                        signal.addEventListener('abort', onAbort, { once: true });
                }
                channel.on('data', (chunk) => {
                    const text = stdoutDecoder.write(chunk);
                    if (text !== '')
                        handlers.onStdout(text);
                });
                channel.stderr.on('data', (chunk) => {
                    const text = stderrDecoder.write(chunk);
                    if (text !== '')
                        handlers.onStderr(text);
                });
                channel.on('close', (code) => {
                    finish(typeof code === 'number' ? code : null);
                });
                channel.on('error', (error) => {
                    if (settled)
                        return;
                    settled = true;
                    signal?.removeEventListener('abort', onAbort);
                    reject(new Error(`SSH exec channel 异常：${error.message}`));
                });
            });
        }
        finally {
            release();
        }
    }
    /* -------------------------------------------------------------- */
    /* 连接池                                                          */
    /* -------------------------------------------------------------- */
    ensureSweeper() {
        if (this.sweeper !== null)
            return;
        this.sweeper = setInterval(() => {
            const now = Date.now();
            for (const [key, rt] of this.conns) {
                // busy>0 = 上面有长流在推：空闲回收必须让路（lastUsed 不会被流刷新）
                if (!shouldRecycleConn(rt, now))
                    continue;
                this.conns.delete(key);
                try {
                    rt.client.end();
                }
                catch {
                    /* 连接已断开 */
                }
            }
            if (this.conns.size === 0 && this.sweeper !== null) {
                clearInterval(this.sweeper);
                this.sweeper = null;
            }
        }, SWEEP_MS);
        this.sweeper.unref?.();
    }
    acquire(spec) {
        this.ensureSweeper();
        const key = poolKey(spec);
        const existing = this.conns.get(key);
        if (existing !== undefined) {
            existing.lastUsed = Date.now();
            return existing.ready;
        }
        const connectConfig = buildConnectConfig(spec);
        const target = sshTarget(spec);
        const policy = applyHostKeyPolicy({ connectConfig, spec, store: this.store, logger: this.logger, target });
        const client = new Client();
        const ready = new Promise((resolve, reject) => {
            let settled = false;
            const timer = setTimeout(() => {
                if (settled)
                    return;
                settled = true;
                this.dropConn(key);
                try {
                    client.end();
                }
                catch {
                    /* 连接未建立 */
                }
                reject(new Error(`SSH 连接超时（${target}）`));
            }, 20_000);
            client.once('ready', () => {
                if (settled)
                    return;
                settled = true;
                clearTimeout(timer);
                resolve(client);
            });
            client.once('error', (error) => {
                this.dropConn(key);
                if (settled)
                    return;
                settled = true;
                clearTimeout(timer);
                const mismatch = policy.mismatchMessage();
                reject(new Error(mismatch ?? `SSH 连接失败（${target}）：${error.message}`));
            });
            client.once('close', () => {
                this.dropConn(key);
            });
            client.connect(connectConfig);
        });
        // ready 被拒时不要留下未处理 rejection（调用方 await 时会拿到）
        ready.catch(() => {
            /* 由调用方处理 */
        });
        this.conns.set(key, { client, lastUsed: Date.now(), ready, busy: 0 });
        return ready;
    }
    dropConn(key) {
        this.conns.delete(key);
    }
}
/** 构造连接配置（认证三态 + keepalive + hostHash）；与 tty 的 ssh.ts 同策略。 */
export function buildConnectConfig(spec) {
    const auth = spec.auth ?? 'agent';
    const base = {
        host: spec.host,
        port: spec.port ?? 22,
        username: spec.username,
        readyTimeout: 20_000,
        keepaliveInterval: 10_000,
        keepaliveCountMax: 3,
        // hostVerifier 依赖 hostHash 计算指纹；放行与否由 TOFU 策略决定
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
        // 部分服务端（路由器 / 堡垒机）只开 keyboard-interactive
        base.tryKeyboard = true;
    }
    if (spec.agentForward === true && process.env.SSH_AUTH_SOCK !== undefined && process.env.SSH_AUTH_SOCK !== '') {
        base.agent = base.agent ?? process.env.SSH_AUTH_SOCK;
    }
    return base;
}
/** TOFU 主机指纹策略（hostVerifier 接线）；mismatchMessage() 供错误路径取人类可读拒绝原因。 */
export function applyHostKeyPolicy(options) {
    const { connectConfig, spec, store, logger, target } = options;
    const port = spec.port ?? 22;
    let hostKeyMismatch = null;
    connectConfig.hostVerifier = (hash) => {
        const known = store?.get(spec.host, port);
        if (known === undefined) {
            store?.record(spec.host, port, hash);
            logger?.info(`[dsh-docker] ssh ${target} 首次连接，已记录 host key 指纹 sha256:${hash}（TOFU）`);
            return true;
        }
        if (known === hash)
            return true;
        hostKeyMismatch =
            `SSH 主机密钥指纹变更：${target} 已记录 sha256:${known}，本次为 sha256:${hash}。` +
                '可能是主机重装或换钥匙，也可能是中间人（MITM）冒充；确认安全后，到 设置 → 插件 → Docker 容器面板 → SSH 主机密钥记录 删除该主机再重连。';
        logger?.warn(`[dsh-docker] ${hostKeyMismatch}`);
        return false;
    };
    return { mismatchMessage: () => hostKeyMismatch };
}
/* ------------------------------------------------------------------ *
 * 本机执行
 * ------------------------------------------------------------------ */
/**
 * 本机一次性命令执行器（argv 数组，不经 shell）。
 * 用于 kind=local 的目标：宿主所在机器的 docker CLI。
 */
export async function runLocal(argv, options) {
    const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const maxBytes = options?.maxBytes ?? DEFAULT_MAX_BYTES;
    const started = Date.now();
    const [bin, ...args] = argv;
    if (bin === undefined)
        throw new Error('runLocal 需要至少一个 argv 元素');
    return await new Promise((resolve, reject) => {
        let stdout = '';
        let stderr = '';
        let stdoutBytes = 0;
        let stderrBytes = 0;
        let truncated = false;
        let timedOut = false;
        let settled = false;
        const child = spawn(bin, args, { stdio: ['pipe', 'pipe', 'pipe'], env: process.env });
        const cap = (text, current, chunk) => {
            const room = maxBytes - current;
            if (room <= 0) {
                truncated = true;
                return { text, bytes: current };
            }
            if (chunk.length > room) {
                truncated = true;
                return { text: text + chunk.subarray(0, room).toString('utf8'), bytes: maxBytes };
            }
            return { text: text + chunk.toString('utf8'), bytes: current + chunk.length };
        };
        const timer = setTimeout(() => {
            timedOut = true;
            child.kill('SIGKILL');
        }, timeoutMs);
        child.stdout.on('data', (chunk) => {
            const next = cap(stdout, stdoutBytes, chunk);
            stdout = next.text;
            stdoutBytes = next.bytes;
        });
        child.stderr.on('data', (chunk) => {
            const next = cap(stderr, stderrBytes, chunk);
            stderr = next.text;
            stderrBytes = next.bytes;
        });
        child.once('error', (error) => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            // ENOENT 是最常见的失败：docker CLI 不在 PATH 里
            reject(new Error(`无法执行 ${bin}：${error.message}`));
        });
        child.once('close', (code) => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            resolve({ code, stdout, stderr, timedOut, truncated, durationMs: Date.now() - started });
        });
        if (options?.input !== undefined)
            child.stdin.end(options.input);
        else
            child.stdin.end();
    });
}
/**
 * 本机**长流**执行器（argv 数组，不经 shell）：stdout/stderr 逐块回调，
 * 用于 `docker logs --follow` 这类不设总超时、不设输出上限的命令。
 *
 * 停止由外部 AbortSignal 触发，走 SIGTERM → 2s 未退出再 SIGKILL 的阶梯；
 * child 'close' 时 resolve 退出码（被信号杀死时为 null）。
 */
export function runLocalStream(argv, handlers, signal) {
    const [bin, ...args] = argv;
    if (bin === undefined)
        throw new Error('runLocalStream 需要至少一个 argv 元素');
    return new Promise((resolve, reject) => {
        const stdoutDecoder = new StringDecoder('utf8');
        const stderrDecoder = new StringDecoder('utf8');
        let settled = false;
        let killTimer = null;
        const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'], env: process.env });
        const onAbort = () => {
            if (settled)
                return;
            try {
                child.kill('SIGTERM');
            }
            catch {
                /* 进程可能已退出 */
            }
            if (killTimer === null) {
                killTimer = setTimeout(() => {
                    if (settled)
                        return;
                    try {
                        child.kill('SIGKILL');
                    }
                    catch {
                        /* 同上 */
                    }
                }, 2000);
                killTimer.unref?.();
            }
        };
        if (signal !== undefined) {
            if (signal.aborted)
                onAbort();
            else
                signal.addEventListener('abort', onAbort, { once: true });
        }
        child.stdout.on('data', (chunk) => {
            const text = stdoutDecoder.write(chunk);
            if (text !== '')
                handlers.onStdout(text);
        });
        child.stderr.on('data', (chunk) => {
            const text = stderrDecoder.write(chunk);
            if (text !== '')
                handlers.onStderr(text);
        });
        child.once('error', (error) => {
            if (settled)
                return;
            settled = true;
            if (killTimer !== null)
                clearTimeout(killTimer);
            signal?.removeEventListener('abort', onAbort);
            // ENOENT 是最常见的失败：docker CLI 不在 PATH 里
            reject(new Error(`无法执行 ${bin}：${error.message}`));
        });
        child.once('close', (code) => {
            if (settled)
                return;
            settled = true;
            if (killTimer !== null)
                clearTimeout(killTimer);
            signal?.removeEventListener('abort', onAbort);
            const stdoutTail = stdoutDecoder.end();
            if (stdoutTail !== '')
                handlers.onStdout(stdoutTail);
            const stderrTail = stderrDecoder.end();
            if (stderrTail !== '')
                handlers.onStderr(stderrTail);
            resolve({ code });
        });
    });
}
//# sourceMappingURL=ssh-exec.js.map