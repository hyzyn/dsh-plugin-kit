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
let credentialsProvider = null;
/** 由 index.ts 在可选注入里挂上（服务缺失即为 null，退回 process.env）。 */
export function setCredentialResolver(resolver) {
    credentialsProvider = resolver;
}
/**
 * 解析密钥引用（`env:NAME`）——**纯核心**，provider 由调用方给，便于离线断言。
 *
 * 顺序：官方凭据 provider 优先（它自己会叠 `file` / `env` / `project-env` / `user-env` 各层，
 * 而且"每次操作重新解析"——改完下一个操作即生效，不必重启宿主）；服务不在、或它没有这个引用
 * 时，再退回 `process.env`。
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
    if (provider !== null && provider !== undefined && typeof provider.resolve === 'function') {
        try {
            const resolved = await provider.resolve(name);
            if (resolved !== null && resolved !== undefined && typeof resolved.value === 'string' && resolved.value !== '') {
                return resolved.value;
            }
        }
        catch (error) {
            providerError = error instanceof Error ? error.message : String(error);
        }
    }
    const fromEnv = process.env[name];
    if (fromEnv !== undefined && fromEnv !== '')
        return fromEnv;
    const detail = providerError === null ? '' : `（凭据服务报错：${providerError}）`;
    const missing = provider === null ? '凭据服务不可用，' : '';
    throw new Error(`凭据未设置：${name}${detail} —— ${missing}环境变量里也没有`);
}
/** 生产路径：用当前注入的 provider。 */
export async function resolveSecret(value) {
    return resolveSecretVia(credentialsProvider, value);
}
export function expandHome(path) {
    if (path === '~')
        return homedir();
    if (path.startsWith('~/'))
        return join(homedir(), path.slice(2));
    // `~user/...` 一律明确报错（D30）：原样返回会变成 readFileSync 的 ENOENT，路径还带着
    // ~，用户容易误判成「文件真的不存在」。Windows 变量（%USERPROFILE%）不在展开范围。
    if (path.startsWith('~')) {
        throw new Error(`keyPath 仅支持 ~ 与 ~/ 展开（不支持 ${path.split(/[\\/]/)[0]}）；请写绝对路径或 ~/ 相对路径`);
    }
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
/**
 * 连接池键：同一主机同一账号复用一条 SSH 连接。
 *
 * host 要 trim + 小写（D111）：否则 `NAS.example` 与 `nas.example` 各建一条连接，而
 * `MAX_STREAMS_PER_TARGET` 与 `shouldRecycleConn` 都是**按连接**计的 → 同一台主机的
 * 长流额度被悄悄翻倍（恰好掩盖 D07 想暴露的 MaxSessions 问题）。口径与 TOFU 的
 * hostVerifier（D03）保持一致：那里也用 `trim().toLowerCase()` 分组指纹。
 */
function poolKey(spec) {
    return `${spec.username}@${spec.host.trim().toLowerCase()}:${String(spec.port ?? 22)}`;
}
/**
 * 有界输出收集器（短命令路径的 stdout / stderr 各持一个）。
 *
 * 为什么按字节收集、最后统一解码：逐 chunk `toString('utf8')` 会在 TCP 分片
 * 正好落在多字节字符中间时产出 U+FFFD（D08）；长流路径早已用 StringDecoder，
 * 这里把同样的解码方式带给一次性命令。
 *
 * 截断方向（D14）：`keepTail=false` 保留**头部**（JSONL 列表的前缀行可解析）；
 * `keepTail=true` 保留**尾部**——logs 的最新行、pull 的 digest、prune 的总计
 * 都在输出末尾，该丢的是头部。
 */
class ByteSink {
    maxBytes;
    keepTail;
    chunks = [];
    bytes = 0;
    truncated = false;
    constructor(maxBytes, keepTail) {
        this.maxBytes = maxBytes;
        this.keepTail = keepTail;
    }
    push(chunk) {
        this.chunks.push(chunk);
        this.bytes += chunk.length;
        if (this.bytes <= this.maxBytes)
            return;
        this.truncated = true;
        if (this.keepTail) {
            let excess = this.bytes - this.maxBytes;
            while (excess > 0 && this.chunks.length > 0) {
                const head = this.chunks[0];
                if (head.length <= excess) {
                    excess -= head.length;
                    this.chunks.shift();
                }
                else {
                    this.chunks[0] = head.subarray(excess);
                    excess = 0;
                }
            }
        }
        else {
            let room = this.maxBytes;
            const kept = [];
            for (const item of this.chunks) {
                if (room <= 0)
                    break;
                kept.push(room >= item.length ? item : item.subarray(0, room));
                room -= item.length;
            }
            this.chunks = kept;
        }
        this.bytes = this.maxBytes;
    }
    /** 统一解码（调用方持有 decoder：跨 chunk 的多字节序列不会碎成 U+FFFD）。 */
    decode(decoder) {
        let text = '';
        for (const chunk of this.chunks)
            text += decoder.write(chunk);
        return text + decoder.end();
    }
}
const IDLE_MS = 120_000;
const SWEEP_MS = 30_000;
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_BYTES = 512 * 1024;
/**
 * SSH 建连超时（默认 20s）。
 *
 * `DSH_DOCKER_CONNECT_TIMEOUT_MS` 可覆盖，**只为测试与排障**：20s 这条路径没法在单测里等，
 * 而「不可达目标（防火墙 DROP）」在真实网络里比 ECONNREFUSED 常见得多，D122 之前它在
 * 脚本与单测里都没有回归。`acquire` 的兜底定时器与 `buildConnectConfig` 的 `readyTimeout`
 * 共用它，避免两处漂移。
 */
function connectTimeoutMs() {
    const raw = Number(process.env.DSH_DOCKER_CONNECT_TIMEOUT_MS);
    return Number.isFinite(raw) && raw > 0 ? raw : 20_000;
}
/**
 * 每个 SSH 目标上同时可持有的**长流**上限。
 *
 * 为什么需要它：一个目标只维持**一条** TCP 连接，所有 exec / stream 共用这条连接上的
 * 通道，而 OpenSSH 的 `MaxSessions` 默认只有 10。长流（`docker logs -f` / `stats` /
 * `events`）会一直占到用户关掉面板为止，聚合日志还能一次占 8 条——加上统计流与事件流
 * 正好 10 条，于是紧接着一次 `docker ps`（刷新列表，短命令）就被远端拒绝。实测报的是
 * `(SSH) Channel open failure: open failed`，而这条原始文案对用户没有任何指向性。
 *
 * 8 = 10 − 2：给「刷新列表 / inspect / exec」这类短命令留两条余量。上限只施加在 SSH
 * 通道上——本地目标走子进程，没有这个约束（见 runLocalStream）。
 */
const MAX_STREAMS_PER_TARGET = 8;
/**
 * 长流配额判定（纯函数，便于回归）：`busy` 是连接上正在推送的长流数。
 * @param target - 目标标签，只用于文案。
 * @param busy - 当前长流数。
 * @param max - 上限，默认 {@link MAX_STREAMS_PER_TARGET}。
 * @returns null 表示可以开；否则返回拒绝原因（调用方直接拿它当错误文案）。
 */
export function streamBudgetError(target, busy, max = MAX_STREAMS_PER_TARGET) {
    if (busy < max)
        return null;
    return `${target} 上已有 ${String(busy)} 条实时流（上限 ${String(max)}）：同一连接上的通道额度`
        + `（OpenSSH MaxSessions 默认 10）被长流占满后，连「刷新列表」这类短命令都会被远端拒绝。`
        + `请关掉部分实时跟随、把聚合容器数减到 6 个以内，或稍后重试。`;
}
/**
 * 把 ssh2 的通道级错误翻成可操作的提示。
 *
 * `(SSH) Channel open failure: open failed` 实测出现过（成因见 {@link MAX_STREAMS_PER_TARGET}
 * 的注释），偏偏出现在「刷新列表」这种日常操作上，而原始文案对用户没有任何指向性。
 * @param message - ssh2 给出的原始错误文案。
 * @returns 补了指向性说明的文案；不认识的原样返回。
 */
export function describeExecError(message) {
    if (!/Channel open failure|open failed/i.test(message))
        return message;
    return `${message}（远端 sshd 拒绝了新通道：同一连接上的通道额度可能已被实时流占满——`
        + `OpenSSH MaxSessions 默认 10；关掉部分实时跟随 / 减少聚合容器数后重试）`;
}
/**
 * 这条 ssh2 错误是不是**传输层 / 连接层**的（而不是命令自己失败）。
 *
 * 为什么要分类：池里的连接可能已经死了（远端 sshd 重启、网络抖动、sshd 踢掉空闲连接），
 * 而 `acquire()` 复用 memoized 的 `ready`、不会每次探活。这种时候唯一正确的动作是丢掉
 * 这条连接、重连一次再试；反过来，「命令返回非零」「镜像不存在」这类业务失败**绝不能**
 * 触发重连——那会把一次普通错误变成两条命令。
 *
 * 「Channel open failure / open failed」刻意**不在**传输层名单里：它是远端**拒绝开新
 * 通道**，典型成因是同一连接的 MaxSessions 被长流占满——连接本身是健康的。把它当传输
 * 错误会泄漏健康连接（摘出池却不关闭，keepalive 一直养着），还会把 `describeExecError`
 * 补的可操作文案藏掉（重连后新连接额度是空的，命令反而成功）。见 D07。
 */
export function isTransportError(message) {
    // 前两条是我们自己的包装文案：回调迟迟不来 = 这条连接已经不响应了
    if (/打开 channel 超时|SSH 连接超时/.test(message))
        return true;
    return /Not connected|connection lost|ECONNRESET|EPIPE|ETIMEDOUT|keepalive|No response from server/i.test(message);
}
/**
 * 空闲回收判定：busy>0 的连接上挂着长流（docker logs --follow 可以几小时不结束），
 * inflight>0 的连接上有一次性命令在跑（docker pull 默认 600s，期间没有任何请求
 * 刷新 lastUsed）——两类都必须让空闲回收让路，否则在途命令会被 sweeper 掐断在半路
 * （D01）。抽成纯函数便于回归（sweeper 本体依赖定时器，难以直接驱动）。
 */
export function shouldRecycleConn(conn, now, idleMs = IDLE_MS) {
    if (conn.busy > 0 || (conn.inflight ?? 0) > 0)
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
            // 先标记再关闭（D94）：建连途中的条目被 end() 后，它的 ready 仍会 resolve——
            // 标记让 acquire() 认出「这条已被卸载摘掉」，改为关闭并 reject，不外泄脱管连接。
            rt.disposed = true;
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
        const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
        const maxBytes = options?.maxBytes ?? DEFAULT_MAX_BYTES;
        const started = Date.now();
        const channel = await this.openChannel(spec, command, timeoutMs, 0);
        // 一次性命令也计入「在途」（D01）：docker pull 默认 600s，期间没有任何请求
        // 刷新 lastUsed， sweeper 若只认 busy 会把跑了一半的命令连人带输出掐断。
        const key = poolKey(spec);
        const rt = this.conns.get(key);
        if (rt !== undefined)
            rt.inflight += 1;
        try {
            return await new Promise((resolve, reject) => {
                const stdoutSink = new ByteSink(maxBytes, options?.keepTail === true);
                const stderrSink = new ByteSink(maxBytes, options?.keepTail === true);
                const stdoutDecoder = new StringDecoder('utf8');
                const stderrDecoder = new StringDecoder('utf8');
                let timedOut = false;
                let settled = false;
                let timer = null;
                const finish = (code) => {
                    if (settled)
                        return;
                    settled = true;
                    if (timer !== null)
                        clearTimeout(timer);
                    const current = this.conns.get(key);
                    if (current !== undefined)
                        current.lastUsed = Date.now();
                    resolve({
                        code,
                        stdout: stdoutSink.decode(stdoutDecoder),
                        stderr: stderrSink.decode(stderrDecoder),
                        timedOut,
                        truncated: stdoutSink.truncated || stderrSink.truncated,
                        durationMs: Date.now() - started,
                    });
                };
                // 定时器放在 finish **之后**（D112）：超时除了打断远端命令，还要**直接 settle**。
                // 原先只 signal('KILL') + close()，若通道静默不响应（既不 emit 'close' 也不 emit
                // 'error'），promise 永不落定 → finally 里的 inflight 减不掉 → 该连接对
                // shouldRecycleConn 永远是「在途」，sweeper 再也回收不了它。
                // settled 守卫保证与随后的 'close' 事件不会重复 resolve（幂等）。
                timer = setTimeout(() => {
                    timedOut = true;
                    try {
                        channel.signal('KILL');
                    }
                    catch {
                        /* 远端可能已结束 */
                    }
                    channel.close();
                    finish(null);
                }, timeoutMs);
                channel.on('data', (chunk) => {
                    stdoutSink.push(chunk);
                });
                channel.stderr.on('data', (chunk) => {
                    stderrSink.push(chunk);
                });
                channel.on('close', (code) => {
                    finish(typeof code === 'number' ? code : null);
                });
                channel.on('error', (error) => {
                    if (settled)
                        return;
                    settled = true;
                    if (timer !== null)
                        clearTimeout(timer);
                    reject(new Error(`SSH exec channel 异常：${error.message}`));
                });
                if (options?.input !== undefined)
                    channel.end(options.input);
            });
        }
        finally {
            if (rt !== undefined)
                rt.inflight = Math.max(0, rt.inflight - 1);
        }
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
        // 先确保连接已建立：下面的 rt.busy 与配额判定都依赖连接已存在于池里
        await this.acquire(spec);
        const key = poolKey(spec);
        let holder = this.conns.get(key);
        if (holder === undefined) {
            // acquire 之后条目必在（acquire 先占坑，见 acquire 内注释）；真发生说明池状态
            // 被并发破坏——**fail-closed**（D26）：静默跳过配额判定会让长流绕开
            // MAX_STREAMS_PER_TARGET，直冲 OpenSSH MaxSessions=10
            throw new Error(`SSH 连接状态异常（${sshTarget(spec)}）：请重试；若持续出现请反馈`);
        }
        {
            // 配额判定放在自增**之前**：拒绝时没有自增，finally 里的 release 也就不会去减别人的计数
            const denied = streamBudgetError(sshTarget(spec), holder.busy);
            if (denied !== null)
                throw new Error(denied);
            holder.busy += 1;
        }
        /**
         * 把计数从「开门之前那条条目」搬到「现在池里那条」（D88）。
         *
         * 为什么必须搬：openChannel 遇到传输错误会 dropConn + end() **另建一条**连接
         * （见 openChannel 的重试分支），于是开门前 `busy += 1` 记的那条已被摘掉——新连接
         * 的 busy 是 0 → ① 长流配额少算，MAX_STREAMS_PER_TARGET 的 fail-closed 保护在这条
         * 路径失效；② 用户正在看的 `docker logs -f` 在 120s 后被 sweeper 当空闲连接掐断
         * （sweeper 只看活条目的 busy/inflight），正是 D01 要消灭的症状。
         * 配额判定与自增仍留在 openChannel **之前**：否则被拒的流已经白开了一条通道。
         */
        const moveBusyToLive = () => {
            const live = this.conns.get(key);
            if (live !== undefined && live !== holder) {
                // holder 在下面的 undefined 守卫后必定有值；因为它在闭包里被重新赋值，
                // TS 的窄化不会跨赋值保留，这里用 `!` 明确（不是新契约）
                holder.busy = Math.max(0, holder.busy - 1);
                live.busy += 1;
                holder = live;
            }
        };
        let released = false;
        // try/finally 保证 busy 增减严格配对：异常路径也不能把连接永久标成 busy
        //（一律作用于 holder：重连后计数已经搬过家，release 必须减现在这条）
        const release = () => {
            if (released)
                return;
            released = true;
            holder.busy = Math.max(0, holder.busy - 1);
            holder.lastUsed = Date.now();
        };
        try {
            if (signal?.aborted === true)
                return { code: null };
            const channel = await this.openChannel(spec, command, DEFAULT_TIMEOUT_MS, 0);
            // 开门成功才可能发生「重连换条目」；开门抛错时条目仍是我占的那条，无需搬
            moveBusyToLive();
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
                    reject(new Error(`SSH exec channel 异常：${describeExecError(error.message)}`));
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
    /**
     * 开一条 exec channel；**传输层**错误时丢掉连接、重连一次（见 `isTransportError`）。
     *
     * 只重试一次：重连之后还报同样的错，多半不是连接的问题（目标本身不可达），
     * 再试只是把失败拖长、还会多压一条命令过去。
     */
    async openChannel(spec, command, timeoutMs, attempt) {
        // acquire 放在 try **外面**（D27）：建连失败（目标不可达等）不该落在「传输错误
        // 重试」的范围内——否则每次命令都要干等两轮 20s 的 readyTimeout。
        const client = await this.acquire(spec);
        try {
            return await new Promise((resolve, reject) => {
                const timer = setTimeout(() => {
                    reject(new Error(`SSH exec 打开 channel 超时（${String(timeoutMs)}ms）：${sshTarget(spec)}`));
                }, timeoutMs);
                client.exec(command, (error, ch) => {
                    clearTimeout(timer);
                    if (error !== undefined && error !== null) {
                        reject(new Error(`SSH exec 失败：${describeExecError(error.message)}`));
                        return;
                    }
                    resolve(ch);
                });
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (attempt === 0 && isTransportError(message)) {
                // 丢掉这条连接并**关闭它**（D07）：只摘出池不 end() 的话，keepalive 会一直
                // 养着一条死连接；dropConn 带身份校验，不会误摘同键上的新连接（D06）。
                this.dropConn(poolKey(spec), client);
                try {
                    client.end();
                }
                catch {
                    /* 连接已断开 */
                }
                return await this.openChannel(spec, command, timeoutMs, 1);
            }
            throw error;
        }
    }
    async acquire(spec) {
        this.ensureSweeper();
        const key = poolKey(spec);
        const existing = this.conns.get(key);
        if (existing !== undefined) {
            existing.lastUsed = Date.now();
            return existing.ready;
        }
        const target = sshTarget(spec);
        const client = new Client();
        let resolveReady;
        let rejectReady;
        const ready = new Promise((resolve, reject) => {
            resolveReady = resolve;
            rejectReady = reject;
        });
        // **先占坑再异步解析配置**（D02）：buildConnectConfig 会 await 凭据解析、让出事件
        // 循环——若此时池里还没有条目，并发第二个请求会各自建连，先建好的那条立即脱管
        //（回收不到、disposeAll 关不掉、配额记在别人头上），日后的 close/error 还会误摘
        // 同键的新连接（D06）。占位后并发请求拿到的就是同一条 ready。
        const entry = { client, lastUsed: Date.now(), ready, busy: 0, inflight: 0, disposed: false };
        this.conns.set(key, entry);
        // ready 被拒时不要留下未处理 rejection（调用方 await 时会拿到）
        ready.catch(() => {
            /* 由调用方处理 */
        });
        let settled = false;
        let timer = null;
        /**
         * 这条占位条目还是不是「我的」（D94）。
         *
         * 为什么要单独判：`disposeAll()`（插件卸载）与 sweeper 都能在**建连途中**把占位条目
         * 摘掉并 `end()`。只判 settled 的话，随后到来的 `ready` / `error` 仍会走完正常流程——
         * 前者 resolve 出一条不在池里的活连接（回收不到、disposeAll 再关不掉、keepalive 一直
         * 养着，`run()` 的 inflight 保护也一并失效），后者丢掉真实错误原因只报「连接超时」。
         * 归属口径 = 池里这个键仍指向这条条目，且它没有被 disposeAll 标记（先标记后 clear，
         * 所以标记能覆盖「已摘出但还没被 clear」的窗口）。
         */
        const ownsEntry = () => this.conns.get(key) === entry && !entry.disposed;
        /** 兜底关闭：ssh2 Client 的 `end()` 对「尚未建连」的实例未必有用，`destroy()` 再补一刀。 */
        const forceClose = () => {
            try {
                client.end();
            }
            catch {
                /* 连接未建立 / 已断开 */
            }
            try {
                client.destroy();
            }
            catch {
                /* 同上 */
            }
        };
        const settleError = (error) => {
            if (settled)
                return;
            settled = true;
            if (timer !== null)
                clearTimeout(timer);
            // 归属校验同样落在错误路径：条目已被摘掉（多为 disposeAll）时，真正该报的是
            // 「这条连接已被释放」，而不是此后某次 close 触发的「握手完成前关闭」或超时（D94）
            const finalError = ownsEntry() ? error : new Error(`SSH 连接已在建立期间被释放（${target}）：请重试`);
            this.dropConn(key, client);
            forceClose();
            rejectReady(finalError);
        };
        try {
            const connectConfig = await buildConnectConfig(spec);
            const policy = applyHostKeyPolicy({ connectConfig, spec, store: this.store, logger: this.logger, target });
            /** 指纹变更优先于任何通用文案（含 D94 的「已释放」）：安全提示不能被噪音盖掉。 */
            const describe = (error, fallback) => new Error(policy.mismatchMessage() ?? `${fallback}：${error.message}`);
            timer = setTimeout(() => {
                settleError(new Error(`SSH 连接超时（${target}）`));
            }, connectTimeoutMs());
            client.once('ready', () => {
                if (settled)
                    return;
                settled = true;
                if (timer !== null)
                    clearTimeout(timer);
                if (!ownsEntry()) {
                    // 建连途中被 disposeAll / sweeper 摘掉：这条 client 不属于任何人，
                    // 交出去就是脱管连接——关掉再拒绝（D94）
                    this.dropConn(key, client);
                    forceClose();
                    rejectReady(new Error(`SSH 连接已被释放（${target}）：请重试`));
                    return;
                }
                entry.lastUsed = Date.now();
                resolveReady(client);
            });
            client.once('error', (error) => {
                settleError(describe(error, `SSH 连接失败（${target}）`));
            });
            client.once('close', () => {
                this.dropConn(key, client);
                if (!settled)
                    settleError(new Error(`SSH 连接失败（${target}）：连接在握手完成前关闭`));
            });
            try {
                client.connect(connectConfig);
            }
            catch (error) {
                // connect() 的同步异常（如加密私钥缺 passphrase）必须先出池再拒绝（D05）：
                // 否则这条「永远假」的池条目会把同一句旧错误缓存到永远——改对配置也不恢复
                settleError(error instanceof Error ? error : new Error(String(error)));
            }
        }
        catch (error) {
            settleError(error instanceof Error ? error : new Error(String(error)));
        }
        return ready;
    }
    /** 从池里摘掉一条连接。带 client 时做身份校验：只摘自己这条（D06）。 */
    dropConn(key, client) {
        if (client !== undefined && this.conns.get(key)?.client !== client)
            return;
        this.conns.delete(key);
    }
}
/** 构造连接配置（认证三态 + keepalive + hostHash）；与 tty 的 ssh.ts 同策略。 */
export async function buildConnectConfig(spec) {
    const auth = spec.auth ?? 'agent';
    const base = {
        host: spec.host,
        port: spec.port ?? 22,
        username: spec.username,
        readyTimeout: connectTimeoutMs(),
        keepaliveInterval: 10_000,
        keepaliveCountMax: 3,
        // hostVerifier 依赖 hostHash 计算指纹；放行与否由 TOFU 策略决定
        hostHash: 'sha256',
    };
    if (auth === 'agent') {
        // 缺 SSH_AUTH_SOCK 时没有预检的话，ssh2 会报「All configured authentication
        // methods failed」，把「agent 没跑」这个最可能的原因藏起来（D29；tty 同款已修）
        if (process.env.SSH_AUTH_SOCK === undefined || process.env.SSH_AUTH_SOCK === '') {
            throw new Error(`auth=agent 但 SSH_AUTH_SOCK 未设置（ssh-agent 没在跑？）：ssh-agent 是最可能的原因。可改用 auth=key / auth=password，或先启动 ssh-agent`);
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
            throw new Error('auth=password 需要 password（或 env:NAME 凭据引用）');
        base.password = password;
        // 部分服务端（路由器 / 堡垒机）只开 keyboard-interactive
        base.tryKeyboard = true;
    }
    if (spec.agentForward === true && process.env.SSH_AUTH_SOCK !== undefined && process.env.SSH_AUTH_SOCK !== '') {
        base.agent = base.agent ?? process.env.SSH_AUTH_SOCK;
    }
    // agentForward 配置要真正生效（D28）：ssh2 只认 cfg.agentForward === true 才会发
    // auth-agent-req@openssh.com，只设 base.agent（认证用途）远端永远拿不到本地 agent。
    //
    // 但必须复用上面的「有没有 agent」判定（D81）：ssh2 在 connect() 里硬校验
    // `agentForward === true && agent === undefined` → **同步 throw**
    //「You must set a valid agent path to allow agent forwarding」。
    // auth=key / auth=password 时 base.agent 只在有 SSH_AUTH_SOCK 时才会被设上，
    // 于是「宿主无 sock（launchd/systemd/GUI 启动、Windows）+ 勾了转发」会把配置从
    // 「等于没配」变成「整个目标不可用」——同目标每一次操作全失败，文案还是裸英文。
    // README 承诺的是「SSH_AUTH_SOCK 存在时生效」，所以这里**静默降级**：agent 不可用
    // 就当作没勾转发，连接照常建立（D29 已为 auth=agent 单独给出可读的预检错误）。
    if (spec.agentForward === true && base.agent !== undefined)
        base.agentForward = true;
    return base;
}
/** TOFU 主机指纹策略（hostVerifier 接线）；mismatchMessage() 供错误路径取人类可读拒绝原因。 */
export function applyHostKeyPolicy(options) {
    const { connectConfig, spec, store, logger, target } = options;
    const port = spec.port ?? 22;
    let hostKeyMismatch = null;
    connectConfig.hostVerifier = (hash) => {
        // host 键统一 trim + 小写（D03）：tty 落盘时把 host 小写化，比较口径必须一致
        const host = spec.host.trim().toLowerCase();
        const known = store?.get(host, port);
        if (known === undefined || known.length === 0) {
            store?.record(host, port, hash);
            logger?.info(`[dsh-docker] ssh ${target} 首次连接，已记录 host key 指纹 sha256:${hash}（TOFU）`);
            return true;
        }
        // 命中集合内**任意**一条指纹即放行：同一主机的 rsa / ed25519 各记一条（D03）
        if (known.includes(hash))
            return true;
        hostKeyMismatch =
            `SSH 主机密钥指纹变更：${target} 已记录 sha256:${known.join(' / ')}，本次为 sha256:${hash}。` +
                '可能是主机重装或换钥匙，也可能是中间人（MITM）冒充；确认安全后，到 插件配置 → Docker 容器面板 → SSH 主机密钥记录 删除该主机再重连。';
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
        const stdoutSink = new ByteSink(maxBytes, options?.keepTail === true);
        const stderrSink = new ByteSink(maxBytes, options?.keepTail === true);
        const stdoutDecoder = new StringDecoder('utf8');
        const stderrDecoder = new StringDecoder('utf8');
        let timedOut = false;
        let settled = false;
        const child = spawn(bin, args, { stdio: ['pipe', 'pipe', 'pipe'], env: process.env });
        const timer = setTimeout(() => {
            timedOut = true;
            child.kill('SIGKILL');
        }, timeoutMs);
        child.stdout.on('data', (chunk) => {
            stdoutSink.push(chunk);
        });
        child.stderr.on('data', (chunk) => {
            stderrSink.push(chunk);
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
            resolve({
                code,
                stdout: stdoutSink.decode(stdoutDecoder),
                stderr: stderrSink.decode(stderrDecoder),
                timedOut,
                truncated: stdoutSink.truncated || stderrSink.truncated,
                durationMs: Date.now() - started,
            });
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