/**
 * @hyzyn/dsh-tty — SSH 端口转发隧道管理（0.5.0）。
 *
 * 隧道是宿主自持的一等对象：不依赖终端标签，settings 即真相源，reconcile()
 * 按配置增/删/改启停；SSH 断开自动指数退避重连（1s→15s 封顶）；连接簿条目
 * 在每次（重）连接时实时解析——改密码后隧道重连自动用新凭证。
 *
 * 两个方向：
 *   - local（-L，forwardOut）：本地 127.0.0.1:localPort 监听常驻（SSH 掉线
 *     不释放端口，未就绪的入站连接直接 destroy）；每条入站连接
 *     forwardOut 到服务端侧 remoteHost:remotePort，Channel 双工 pipe。
 *   - remote（-R，forwardIn）：SSH ready 后 forwardIn 让服务端监听
 *     remoteHost:remotePort（缺省 127.0.0.1），'tcp connection' 到来时拨号
 *     本地 localTargetHost:localTargetPort 双向 pipe；断线后远程监听失效，
 *     **每次重连 ready 都要重新 forwardIn**；停止时随连接断开自动解绑。
 *
 * TOFU：与终端会话共用同一 HostKeyStore——指纹变更同样拒绝，错误文案一致。
 * 端口转发不计入 maxSessions（不占终端会话名额）。
 */
import net from 'node:net';
import { Client } from 'ssh2';
import { classifyError, prepareSshConnect, proxyFailureSuffix } from './ssh.js';
/**
 * 本地监听失败的文案（D58 补充）：`EADDRINUSE` 在多 profile 场景下**几乎总是**
 * 「另一个 profile 的宿主进程还占着这个端口」——端口转发是**机器级**资源，而配置是按
 * profile 各存一份（复制 profile 会把隧道一起拷走，见 Profile 管理）。原样回一句
 * `listen EADDRINUSE` 只会让人去翻 `lsof`，这里把原因与两条出路直接写出来。
 */
function localListenFailureMessage(port, error) {
    const head = `本地监听 127.0.0.1:${String(port)} 失败: ${error.message}`;
    if (error.code === 'EADDRINUSE') {
        return `${head} —— 该端口已被占用。端口转发是机器级资源，最常见的原因是**另一个 DSH profile 的宿主进程**还在运行同一条隧道（每个 profile 的隧道配置各自独立，复制 profile 会一并拷走）。两条出路：在本 profile 关掉这条隧道，或把它换成一个没被占用的 localPort。`;
    }
    if (error.code === 'EACCES') {
        return `${head} —— 1024 以下的端口需要特权；换一个 ≥1024 的 localPort。`;
    }
    return head;
}
const MAX_RETRY_DELAY_MS = 15_000;
function signatureOf(spec) {
    return JSON.stringify(spec);
}
function ruleOf(spec) {
    if (spec.direction === 'local') {
        return `本机:${String(spec.localPort ?? 0)} → ${spec.remoteHost ?? '?'}:${String(spec.remotePort ?? 0)}`;
    }
    return `远程:${spec.remoteHost?.trim() || '127.0.0.1'}:${String(spec.remotePort ?? 0)} → 本机:${String(spec.localTargetPort ?? 0)}`;
}
export class TunnelManager {
    logger;
    store;
    resolveBook;
    tunnels = new Map();
    /**
     * 配置回写回调（settings 就绪后由插件注入一次）。
     *
     * `setEnabled` 走「翻转 spec.enabled → 写回配置」这条路，所以必须能落盘；回调缺失
     * （settings 服务不可用的极早期 / 单测）时只改内存里的 spec 与运行态——行为退化成
     * 「本次进程内生效、重启丢失」，而不是静默什么都不做（返回的 status 一样会反映结果）。
     */
    persist = null;
    constructor(logger, store, 
    /** 按名字解析连接簿条目（实时读取，重连自动用最新凭证） */
    resolveBook) {
        this.logger = logger;
        this.store = store;
        this.resolveBook = resolveBook;
    }
    /** 按配置对齐运行态：新增/删除/规格变更重建，启停切换资源。幂等。 */
    reconcile(specs) {
        const wanted = new Map(specs.map((spec) => [spec.name, spec]));
        for (const [name, rt] of [...this.tunnels.entries()]) {
            const next = wanted.get(name);
            if (next === undefined || signatureOf(next) !== rt.signature) {
                this.stopTunnel(rt);
                this.tunnels.delete(name);
            }
        }
        for (const spec of wanted.values()) {
            if (this.tunnels.has(spec.name))
                continue;
            const rt = {
                spec,
                signature: signatureOf(spec),
                state: spec.enabled ? 'connecting' : 'stopped',
                error: null,
                conn: null,
                bastion: null,
                proxy: null,
                ready: false,
                server: null,
                connections: 0,
                totalConnections: 0,
                lastForwardError: null,
                retryTimer: null,
                retryAttempt: 0,
                dead: false,
                fatal: false,
                live: new Set(),
            };
            this.tunnels.set(spec.name, rt);
            if (spec.enabled)
                this.startTunnel(rt);
        }
    }
    list() {
        return [...this.tunnels.values()].map((rt) => ({
            name: rt.spec.name,
            bookName: rt.spec.bookName,
            direction: rt.spec.direction,
            enabled: rt.spec.enabled,
            state: rt.state,
            error: rt.error,
            fatal: rt.fatal,
            rule: ruleOf(rt.spec),
            connections: rt.connections,
            totalConnections: rt.totalConnections,
            lastForwardError: rt.lastForwardError,
        }));
    }
    /** 一条隧道的当前状态（不存在返回 undefined）。 */
    status(name) {
        return this.list().find((tunnel) => tunnel.name === name);
    }
    /**
     * 启停一条隧道（agent 的 `tunnel_start` / `tunnel_stop`）——**改配置，不只改运行态**。
     *
     * 为什么不是「只改运行时开关」：`src/tunnels.ts` 的一等设计是「settings 即真相源，
     * `reconcile()` 按配置对齐运行态」（见文件头）。再加一层运行态覆盖，就同时存在两个
     * 真相源，而 `reconcile` 会在下一次 settings 热应用（哪怕只是改了个 Shell 路径）时
     * **静默把 agent 刚停掉的隧道重新拉起**——这种「停了又自己回来」正是最难查的一类。
     * 所以这里翻转的就是 `spec.enabled`，与用户在卡片上点那个勾**走同一条路**：
     * 写入 caller 给的持久化回调 → settings 热应用 → reconcile。结果一致、可预期。
     *
     * 返回值是写完配置后的状态快照。**注意 `state` 是异步收敛的**：回来时通常是
     * `connecting`（拨号还没完成），要拿最终结论就稍后 `tunnel_list`。
     */
    setEnabled(name, enabled) {
        const rt = this.tunnels.get(name);
        if (rt === undefined) {
            const known = [...this.tunnels.keys()];
            return {
                ok: false,
                error: `没有名为「${name}」的隧道。${known.length === 0 ? '当前没有任何隧道（在 插件配置 → 终端面板 卡片添加）' : '现有：' + known.join('、')}`,
            };
        }
        /*
         * 幂等边界：已经处于目标状态就什么都不做。
         *
         * `active` / `connecting` 才算「开着」——`error` **不**算：那正是最该重试的情形
         * （本地监听失败这类 fatal 故障不会自愈，但用户可能刚把配置改对，此时 `tunnel_start`
         * 就该真的再拨一次）。反过来 `stopped` 才算「关着」。
         */
        const running = rt.state === 'active' || rt.state === 'connecting';
        if ((enabled && rt.spec.enabled && running) || (!enabled && !rt.spec.enabled && rt.state === 'stopped')) {
            return { ok: true, status: this.status(name) };
        }
        this.applyEnabled(rt, enabled);
        const status = this.status(name);
        /* istanbul ignore next —— 上面刚确认过它在表里；留作类型收窄 */
        if (status === undefined)
            return { ok: false, error: `隧道「${name}」状态读取失败` };
        return { ok: true, status };
    }
    /** 翻转一条隧道的 enabled 并就地收敛运行态（`setEnabled` 的落点）。 */
    applyEnabled(rt, enabled) {
        rt.spec = { ...rt.spec, enabled };
        rt.signature = signatureOf(rt.spec);
        if (enabled) {
            // fatal 恢复的前置条件是配置被改对；没改配置就重开会在同一条错误上再撞一次，
            // 但仍允许重开——用户可能刚在卡片上改好、热应用还没到，这里重开就是让它立刻生效
            if (rt.server !== null || rt.conn !== null)
                this.stopTunnel(rt);
            rt.fatal = false;
            rt.error = null;
            this.startTunnel(rt);
        }
        else {
            this.stopTunnel(rt);
        }
        // 写回配置（settings 热应用 → reconcile 会按新配置收敛，与卡片上点那个勾同一条路）。
        // 放在最后：配置写失败（回调抛错）不该让运行态停在一个与配置相反的状态上。
        this.persist?.([...this.tunnels.values()].map((entry) => entry.spec));
    }
    /** 持久化回调注入（settings 就绪后一次；`setEnabled` 靠它把意图写回配置）。 */
    setPersist(persist) {
        this.persist = persist;
    }
    disposeAll() {
        for (const rt of this.tunnels.values())
            this.stopTunnel(rt);
        this.tunnels.clear();
    }
    /** ------------------------------------------------------------------ */
    startTunnel(rt) {
        rt.dead = false;
        rt.retryAttempt = 0;
        if (rt.spec.direction === 'local') {
            const server = net.createServer((socket) => this.onLocalConnection(rt, socket));
            server.on('error', (error) => {
                this.failTunnel(rt, localListenFailureMessage(rt.spec.localPort ?? 0, error));
            });
            server.listen(rt.spec.localPort ?? 0, '127.0.0.1', () => {
                this.logger.info(`[dsh-tty] 隧道 ${rt.spec.name} 监听 127.0.0.1:${String(rt.spec.localPort ?? 0)}`);
            });
            rt.server = server;
        }
        void this.connectTunnel(rt);
    }
    stopTunnel(rt) {
        rt.dead = true;
        if (rt.retryTimer !== null) {
            clearTimeout(rt.retryTimer);
            rt.retryTimer = null;
        }
        if (rt.server !== null) {
            try {
                rt.server.close();
            }
            catch {
                /* 已关闭 */
            }
            rt.server = null;
        }
        try {
            rt.conn?.end();
        }
        catch {
            /* 已断开 */
        }
        rt.conn = null;
        try {
            rt.bastion?.end();
        }
        catch {
            /* 已断开 */
        }
        rt.bastion = null;
        rt.proxy?.dispose();
        rt.proxy = null;
        rt.ready = false;
        // 在途转发一并销毁（0.19.0）：停用/改规格时的在途 socket 与 channel
        // 不再「不可见、不可控」。end/close/destroy 按对象类型择一可用。
        for (const entry of rt.live) {
            const anyEntry = entry;
            try {
                anyEntry.end?.();
            }
            catch {
                /* 已关闭 */
            }
            try {
                anyEntry.close?.();
            }
            catch {
                /* 已关闭 */
            }
            try {
                anyEntry.destroy?.();
            }
            catch {
                /* 已关闭 */
            }
        }
        rt.live.clear();
        rt.connections = 0;
        rt.lastForwardError = null;
        rt.state = 'stopped';
    }
    /**
     * 建连（**async**：认证配置要走凭据 provider 解析 `env:NAME` 引用）。错误仍在本方法内
     * 收敛成 scheduleRetry / failTunnel，调用方不必关心返回的 Promise。
     */
    async connectTunnel(rt) {
        /*
         * fatal 之后不得再进入（D58，补完 D53）：本地监听失败 / 连接簿缺失是人工介入级，
         * 重试一百次也是同一结果。真正把生产打穿的那条路径是**定时器重入**（见
         * scheduleRetry 的 timer 回调），入口这一道是纵深防御——挡住任何新增调用方把
         * error 态刷回 connecting（那会让面板与 agent 永远以为「还在连」）。
         * fatal 只在 reconcile 按新签名重建运行时归零，所以这里不会挡住「改配置后恢复」。
         */
        if (rt.dead || rt.fatal)
            return;
        const spec = rt.spec;
        const book = this.resolveBook(spec.bookName);
        if (book === undefined) {
            // 配置级 fatal（0.19.0）：条目被删/改名后只有配置本身能修复，走重试只会
            // 永远失败循环（每 ≤15s 建连一次）；failTunnel 后 reconcile 收到更新
            // （bookName 改回/条目恢复）会按新签名重建隧道
            this.failTunnel(rt, `连接簿中不存在条目: ${spec.bookName}（条目被删除或改名）——在 设置 → 插件 → 终端面板 → 端口转发 里更正 bookName 或恢复条目后保存`);
            return;
        }
        const sshSpec = {
            host: book.host,
            port: book.port,
            username: book.username,
            auth: book.auth,
            keyPath: book.keyPath,
            passphrase: book.passphrase,
            password: book.password,
            // 跳板机也要跟着走：隧道与终端走的是两条不同的连接，漏了它就得到「隧道连不上、
            // 终端能连」这种半吊子状态（本项立项时点名的正是这种状态）
            ...(book.jump !== undefined ? { jump: book.jump } : {}),
            // 代理命令同理（一整档信任级；闸门在 ssh.ts 的 dialProxyCommand 里统一判）
            ...(book.proxyCommand !== undefined ? { proxyCommand: book.proxyCommand } : {}),
        };
        const target = `${book.username}@${book.host}:${String(book.port)}`;
        rt.state = 'connecting';
        let conn;
        try {
            // 认证配置可能抛错（keyPath 读不到 / 引用解析不到）——走重试等待配置修复。
            // 与终端/SFTP/探针共用同一条准备路径：跳板机 / 代理命令（若有）在这里拨。
            const prepared = await prepareSshConnect({ spec: sshSpec, store: this.store, logger: this.logger });
            const connectConfig = prepared.connectConfig;
            const policy = prepared.policy;
            conn = new Client();
            rt.conn = conn;
            rt.bastion = prepared.bastion;
            rt.proxy = prepared.proxy;
            rt.ready = false;
            conn.on('ready', () => {
                if (rt.dead || rt.conn !== conn)
                    return;
                rt.ready = true;
                // 人工介入级故障（如本地监听 EACCES）不因 SSH ready 而被掩盖
                if (!rt.fatal) {
                    rt.state = 'active';
                    rt.error = null;
                }
                rt.retryAttempt = 0;
                this.logger.info(`[dsh-tty] 隧道 ${spec.name} → ${target} 已连接`);
                if (spec.direction === 'remote')
                    this.bindRemoteListen(rt, conn);
            });
            conn.on('tcp connection', (details, accept) => {
                if (rt.dead || rt.conn !== conn || !rt.ready || spec.direction !== 'remote') {
                    try {
                        accept().close();
                    }
                    catch {
                        /* 忽略 */
                    }
                    return;
                }
                this.onRemoteConnection(rt, accept);
            });
            conn.on('error', (error) => {
                if (rt.dead || rt.conn !== conn)
                    return;
                // 代理命令死了的话，ssh2 只会报「握手前连接中断」——把退出码 / stderr 补在后面，
                // 否则用户会去查目标主机（那里没有任何问题）
                this.scheduleRetry(rt, policy.mismatchMessage() ?? `SSH 连接失败（${target}）: ${classifyError(error.message)}${proxyFailureSuffix(rt.proxy)}`);
            });
            conn.on('close', () => {
                if (rt.conn !== conn)
                    return;
                rt.conn = null;
                // 跳板机是**另一条**连接：目标这条断了必须一起关，否则重连后旧的会一直养着
                try {
                    rt.bastion?.end();
                }
                catch {
                    /* 已断开 */
                }
                rt.bastion = null;
                // 代理命令是**另一个进程**：同理，目标断了就杀，别让它靠 keepalive 一直挂着
                rt.proxy?.dispose();
                rt.proxy = null;
                rt.ready = false;
                rt.connections = 0;
                if (!rt.dead && rt.spec.enabled && rt.state !== 'error') {
                    this.scheduleRetry(rt, 'SSH 连接断开');
                }
            });
            conn.connect(connectConfig);
        }
        catch (error) {
            this.scheduleRetry(rt, error instanceof Error ? error.message : String(error));
        }
    }
    /** remote 方向：让服务端监听端口（重连后必须重新调用，断线即失效）。 */
    bindRemoteListen(rt, conn) {
        const spec = rt.spec;
        conn.forwardIn(spec.remoteHost?.trim() || '127.0.0.1', spec.remotePort ?? 0, (error, realPort) => {
            if (rt.dead || rt.conn !== conn)
                return;
            if (error !== undefined && error !== null) {
                this.failTunnel(rt, `远程监听失败（${spec.remoteHost?.trim() || '127.0.0.1'}:${String(spec.remotePort ?? 0)}）: ${error.message}`);
                return;
            }
            this.logger.info(`[dsh-tty] 隧道 ${spec.name} 远程监听 ${spec.remoteHost?.trim() || '127.0.0.1'}:${String(realPort)} 就绪`);
        });
    }
    onRemoteConnection(rt, accept) {
        const spec = rt.spec;
        rt.totalConnections += 1;
        rt.connections += 1;
        const stream = accept();
        rt.live.add(stream);
        const local = net.connect({ host: spec.localTargetHost?.trim() || '127.0.0.1', port: spec.localTargetPort ?? 0 }, () => {
            stream.pipe(local);
            local.pipe(stream);
        });
        rt.live.add(local);
        // 计数恰好一次：stream 与 local 任何一侧结束都算这条转发完了
        let counted = true;
        const finish = () => {
            if (!counted)
                return;
            counted = false;
            rt.connections = Math.max(0, rt.connections - 1);
            rt.live.delete(stream);
            rt.live.delete(local);
        };
        const kill = () => {
            finish();
            try {
                stream.end();
            }
            catch {
                /* 已关闭 */
            }
            try {
                local.destroy();
            }
            catch {
                /* 已关闭 */
            }
        };
        stream.on('close', finish);
        local.on('close', finish);
        stream.on('error', kill);
        local.on('error', kill);
    }
    onLocalConnection(rt, socket) {
        const spec = rt.spec;
        const conn = rt.conn;
        // SSH 未就绪：端口保持占用但直接拒绝，应用层立刻收到连接重置
        if (rt.dead || conn === null || !rt.ready) {
            socket.destroy();
            return;
        }
        rt.totalConnections += 1;
        rt.connections += 1;
        rt.live.add(socket);
        let channel = null;
        // 计数恰好一次：forwardOut 失败（原实现漏减、计数虚高）与正常收尾共用
        let counted = true;
        const finish = () => {
            if (!counted)
                return;
            counted = false;
            rt.connections = Math.max(0, rt.connections - 1);
            rt.live.delete(socket);
            if (channel !== null)
                rt.live.delete(channel);
        };
        conn.forwardOut('127.0.0.1', 0, spec.remoteHost?.trim() ?? '', spec.remotePort ?? 0, (error, stream) => {
            if (error !== undefined && error !== null) {
                rt.lastForwardError = `目标 ${spec.remoteHost?.trim() ?? '?'}:${String(spec.remotePort ?? 0)} 拨号失败: ${error.message}`;
                this.logger.warn(`[dsh-tty] 隧道 ${rt.spec.name} forwardOut 失败: ${error.message}`);
                finish();
                socket.destroy();
                return;
            }
            channel = stream;
            rt.live.add(stream);
            stream.on('close', finish);
            socket.on('close', finish);
            const kill = () => {
                finish();
                try {
                    socket.destroy();
                }
                catch {
                    /* 已关闭 */
                }
                try {
                    stream.end();
                }
                catch {
                    /* 已关闭 */
                }
            };
            socket.on('error', kill);
            stream.on('error', kill);
            socket.pipe(stream);
            stream.pipe(socket);
        });
    }
    /** 失败且不再自动重试（需要人工介入：如远程端口被占、本地监听端口非法/无权限）。 */
    failTunnel(rt, message) {
        rt.error = message;
        rt.state = 'error';
        rt.fatal = true;
        this.logger.warn(`[dsh-tty] 隧道 ${rt.spec.name} 错误: ${message}`);
    }
    /** 失败后按指数退避重连（1s→15s 封顶）；重连期间保持 error 态供 UI 展示原因。 */
    scheduleRetry(rt, message) {
        // fatal（本地监听失败 / 连接簿条目缺失）不走重试：这两类故障重试一百次也是
        // 同一个结果，而重试路径会 (a) 把 fatal 清回 false、(b) 经 connectTunnel 把
        // 状态刷成 connecting —— 于是「本地端口压根没监听成功」被粉饰成「正在连接」，
        // 且原来那条错误信息看起来像临时性的（D53）。保持 error 态与原因，等用户修配置
        // （reconcile 收到新规格会重建隧道）。
        if (rt.fatal)
            return;
        rt.error = message;
        rt.state = 'error';
        rt.fatal = false;
        rt.conn = null;
        try {
            rt.bastion?.end();
        }
        catch {
            /* 已断开 */
        }
        rt.bastion = null;
        rt.proxy?.dispose();
        rt.proxy = null;
        rt.ready = false;
        rt.connections = 0;
        if (rt.dead || rt.retryTimer !== null)
            return;
        const delay = Math.min(MAX_RETRY_DELAY_MS, 1000 * 2 ** rt.retryAttempt);
        rt.retryAttempt += 1;
        this.logger.warn(`[dsh-tty] 隧道 ${rt.spec.name} 将在 ${String(delay)}ms 后重连（第 ${String(rt.retryAttempt)} 次）：${message}`);
        const timer = setTimeout(() => {
            rt.retryTimer = null;
            // fatal 必须一起挡（D58）：定时器可能在 fatal **之前**就排好了——凭据解析失败
            // 先发生（非 fatal，排 1s 定时器）、本地监听 EADDRINUSE 后到（fatal）。放它进来
            // 会把 error 覆写成 connecting，而随后的失败又都被本方法的 fatal 短路挡住，
            // 于是状态永久卡在 connecting、还挂着那条致命错误（生产实测的顺序）。
            if (!rt.dead && !rt.fatal && rt.spec.enabled)
                void this.connectTunnel(rt);
        }, delay);
        timer.unref?.();
        rt.retryTimer = timer;
    }
}
//# sourceMappingURL=tunnels.js.map