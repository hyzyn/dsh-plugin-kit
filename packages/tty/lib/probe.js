/**
 * @hyzyn/dsh-tty — SSH 连接测试（probe）模块。
 *
 * 「连接测试」按钮的数据源：不占会话名额、不开 shell channel，只做一次
 * 链路诊断，把分段结果带回设置卡片 / SSH 连接对话框：
 *
 *   阶段     做法                                                    判定
 *   tcp      net.connect 预检（DNS + TCP 建连，6s 超时）               → 主机可达 / DNS / 拒绝 / 超时
 *   hostkey  ssh2 握手；hostVerifier 内做 TOFU 比对                    → 已匹配 / 新指纹 / 不匹配拒绝
 *   auth     ssh2 ready / error（认证被拒、协商超时等）                → 认证通过或分类失败
 *
 * host key 两种策略（与隧道/SFTP 的 hostKeyStore 用法对齐）：
 *   - 提供 store（设置卡片「测试」按钮）：完整 TOFU——新指纹当场持久化
 *     record（测试即「首次连接」语义），不匹配拒绝并给出与 spawnSsh 完全
 *     一致的指引文案（含已记录指纹与本次指纹，供对照）；
 *   - 不提供 store（SSH 连接对话框试连，尚未保存/未必入库）：只比对不
 *     记录（避免给未保存的草稿建立钉扎），不匹配照样拒绝。
 *
 * 认证失败返回服务端标准错误消息原文（如 `All configured authentication
 * methods failed`）不额外臆测——真实原因（密码错 / 用户不存在 / 方法未开）
 * 由服务端决定，用户可据原文排查。
 */
import { Client } from 'ssh2';
import { connect as netConnect } from 'node:net';
import { attachSshTransport, classifyError, jumpTargetLabel, PROXY_COMMAND_DISABLED, PROXY_COMMAND_NOT_GRANTED, proxyCommandAllowedNow, proxyCommandGrantedNow, proxyFailureSuffix, sanitizeProxyCommand, sshTarget } from './ssh.js';
import { hostKeyIdentity } from './ssh.js';
/** TCP 预检超时（毫秒）：DNS 解析 + 建连。 */
export const PROBE_TCP_TIMEOUT_MS = 6_000;
/** ssh2 握手/认证阶段超时（毫秒）；覆盖 buildConnectConfig 的 readyTimeout。 */
export const PROBE_AUTH_TIMEOUT_MS = 8_000;
/**
 * 代理命令这条路上，拼错误文案**之前**等「子进程证据（exit / stderr）」的有界窗口（毫秒，tty D95）。
 *
 * 为什么是「有界」而不是「一直等」：代理命令没死透时等它是无意义的（那属于握手超时的活），
 * 而用户点「试连」要的是一个答案。200ms 覆盖实测的 1~2ms 竞态，又不改变探针的数量级。
 */
export const PROXY_EVIDENCE_GRACE_MS = 200;
/** 把底层错误分类为人类可读诊断；原文保留在返回串里便于对照排查。 */
/** 与 spawnSsh 的 applyHostKeyPolicy 一致的 TOFU 指引文案（多指纹集合版）。 */
function mismatchMessage(target, host, port, known, current, aliased = false) {
    const shown = known.slice(0, 3).map((f) => `sha256:${f}`).join(' / ');
    const more = known.length > 3 ? ` 等 ${String(known.length)} 把` : '';
    // 带别名时点明「按哪个键定位」：用户要去卡片里删记录，说错键等于让他删错行
    const where = aliased ? `${target}（HostKeyAlias ${host}）` : target;
    return (`SSH 主机密钥指纹变更：${where} 已记录 ${shown}${more}，本次为 sha256:${current}。` +
        '可能是主机重装或换钥匙，也可能是中间人（MITM）冒充；确认安全后，到 插件配置 → 终端面板 → SSH 主机密钥记录 删除该主机再重连。');
}
/** 收集 hostVerifier 收到的指纹（ssh2 可能对多 host key 调用多次，取最后一次）。 */
function makeHostKeyVerifier(options) {
    const { spec, store, onResult } = options;
    // 记录/比对的键走与 spawnSsh 同一个 hostKeyIdentity（HostKeyAlias 语义）：
    // 两处不一致就会出现「试连说匹配、真连说变更」这种自相矛盾
    const { host: keyHost, port, aliased } = hostKeyIdentity(spec);
    const target = sshTarget(spec);
    let seen = '';
    return (hash) => {
        seen = hash;
        const known = store?.get(keyHost, port);
        if (known === undefined || known.length === 0) {
            if (store !== undefined) {
                // 完整 TOFU：新指纹当场持久化（与 spawnSsh 的 hostVerifier 同语义）
                store.record(keyHost, port, hash);
                onResult({ state: 'recorded', fingerprint: hash });
            }
            else {
                // 试连（对话框）：只比对不落盘
                onResult({ state: 'matched', fingerprint: hash });
            }
            return true;
        }
        if (known.includes(hash)) {
            onResult({ state: 'matched', fingerprint: hash, known });
            return true;
        }
        onResult({ state: 'mismatch', fingerprint: hash, known, error: mismatchMessage(target, keyHost, port, known, hash, aliased) });
        return false;
    };
}
/** 仅校验一份连接簿 / 对话框条目的形状（新增 / 编辑前先过一遍；不做网络请求）。 */
export function validateSshFields(input) {
    const host = typeof input.host === 'string' ? input.host.trim() : '';
    const username = typeof input.username === 'string' ? input.username.trim() : '';
    if (host === '')
        return { error: '主机必填' };
    if (username === '')
        return { error: '用户名必填' };
    let port = 22;
    if (input.port !== undefined && input.port !== '') {
        const value = Number(input.port);
        if (!Number.isInteger(value) || value < 1 || value > 65535)
            return { error: '端口必须是 1~65535 的整数' };
        port = value;
    }
    const auth = input.auth === 'key' || input.auth === 'password' ? input.auth : 'agent';
    const spec = { host, port, username, auth };
    if (auth === 'key') {
        const keyPath = typeof input.keyPath === 'string' ? input.keyPath.trim() : '';
        if (keyPath === '')
            return { error: 'auth=key 需要私钥路径' };
        spec.keyPath = keyPath;
        const passphrase = typeof input.passphrase === 'string' ? input.passphrase : '';
        if (passphrase !== '')
            spec.passphrase = passphrase;
    }
    if (auth === 'password') {
        const password = typeof input.password === 'string' ? input.password : '';
        if (password === '')
            return { error: 'auth=password 需要密码' };
        spec.password = password;
    }
    if (input.agentForward === true)
        spec.agentForward = true;
    return { spec };
}
/**
 * 单次连接诊断。无论成败都会关闭连接、在超时内返回，绝不悬挂。
 * 分类见文件头；tcp 预检通过后才进入 ssh2 握手。
 */
export async function probeSsh(spec, store) {
    const startedAt = Date.now();
    const result = {
        tcp: { ok: false },
        hostkey: { state: 'unknown', fingerprint: '' },
        auth: { ok: false },
        totalMs: 0,
    };
    const finish = () => {
        result.totalMs = Date.now() - startedAt;
        return result;
    };
    const port = spec.port ?? 22;
    const target = sshTarget(spec);
    /*
     * ---- 阶段 0：代理命令闸门 ----
     *
     * 配了 `proxyCommand` 但开关（`allowProxyCommand`）没开时**在这里就返回**：这一档是
     * 「本机任意命令执行」，关着的时候真实连接也会明确失败（见 ssh.ts 的 dialProxyCommand），
     * 所以探针必须报同一件事——否则「试连」会去 TCP 预检目标主机，把用户引到网络排查上。
     */
    const proxyCommand = sanitizeProxyCommand(spec.proxyCommand);
    const proxyActive = proxyCommand !== undefined && proxyCommandAllowedNow();
    if (proxyCommand !== undefined) {
        // 未启用分两种：**宿主没授权**（要去设环境变量 + 重启）与**开关关着**（去把开关打开）。
        // 合成一句话会让用户对着一个点不动的开关反复点。
        const blocked = proxyCommandGrantedNow() ? PROXY_COMMAND_DISABLED : PROXY_COMMAND_NOT_GRANTED;
        result.proxy = { active: proxyActive, ...(proxyActive ? {} : { error: blocked }) };
        if (!proxyActive) {
            result.tcp = { ok: false, error: blocked, ms: 0 };
            result.auth = { ok: false, error: blocked };
            return finish();
        }
        /*
         * 走代理命令时**不做直连 TCP 预检**：连不连得上由那条命令决定，探目标主机与本次路径无关
         * （典型情况就是目标根本不可直连，报「不可达」纯属误导）。链路结论来自阶段 2 的握手。
         */
        result.tcp = { ok: false, skipped: true, ms: 0 };
    }
    /*
     * ---- agent 预检（与 spawnSsh 同款，快速失败） ----
     *
     * **位置在代理命令闸门之后**（tty D67，Windows 真机实测纠正过一次顺序）：原先它在闸门之前，于是
     * 「配了代理命令 + 宿主没授权 + 这台机器又没有 ssh-agent」三件事同时成立时，探针只报
     * 「agent 认证需要 SSH_AUTH_SOCK」——用户去把 agent 修好、再点一次，才看到真正挡路的那道门。
     * 策略挡路（要不要放行本机命令执行）优先于环境挡路（本机有没有 agent），
     * 也与 HTTP 路由「先过门、再干活」一致。macOS 开发机上因为本机有 agent，看不出来。
     */
    if (spec.auth === 'agent' && (process.env.SSH_AUTH_SOCK === undefined || process.env.SSH_AUTH_SOCK === '')) {
        const message = 'agent 认证需要 SSH_AUTH_SOCK（本机未运行 ssh-agent 或变量未设置）';
        result.tcp = { ok: false, error: message, ms: 0 };
        result.auth = { ok: false, error: message };
        return finish();
    }
    /*
     * ---- 阶段 1：TCP 预检（DNS + 建连） ----
     *
     * **有跳板机时预检的是跳板机**：目标那一跳根本不能直连，探它只会得到一句「超时」，
     * 而那正是用户要区分的东西。目标那一跳的结论来自阶段 2（经通道握手），见 result.auth。
     * **走代理命令时整段跳过**（上面已经把 tcp 标成 skipped）。
     */
    const jumpLabel = jumpTargetLabel(spec);
    const tcpHost = spec.jump !== undefined ? spec.jump.host.trim() : spec.host;
    const tcpPort = spec.jump !== undefined ? spec.jump.port ?? 22 : port;
    const tcpPrefix = jumpLabel === '' ? '' : `跳板机 ${jumpLabel} `;
    const tcpResult = !proxyActive && await new Promise((resolve) => {
        const sock = netConnect({ host: tcpHost, port: tcpPort });
        const tcpStart = Date.now();
        const done = (ok, error) => {
            try {
                sock.destroy();
            }
            catch {
                /* 已关闭 */
            }
            resolve({ ok, error, ms: Date.now() - tcpStart });
        };
        sock.setTimeout(PROBE_TCP_TIMEOUT_MS, () => {
            // 没配跳板机时仍要点出这条最容易被误读的成因（企业内网主机几乎都要过 bastion）
            const hint = jumpLabel === ''
                ? '；若该主机只能经跳板机访问，请在这个连接条目里配置跳板机（也可从 ~/.ssh/config 导入，ProxyJump 会被自动带上）'
                : '';
            done(false, `${tcpPrefix}TCP 连接超时：无响应（检查地址 / 防火墙 / 网络${hint}）`);
        });
        sock.once('connect', () => done(true));
        sock.once('error', (error) => {
            done(false, tcpPrefix + classifyError(error.message));
        });
    });
    if (tcpResult !== false) {
        result.tcp = tcpResult;
        if (jumpLabel !== '')
            result.jump = { label: jumpLabel, tcp: { ...tcpResult, ms: tcpResult.ms } };
        if (!tcpResult.ok) {
            result.auth = { ok: false, error: tcpResult.error };
            return finish();
        }
    }
    // ---- 阶段 2+3：ssh2 握手（host key 交换 + 认证） ----
    // 有跳板机时**两跳都用探针的短超时**：否则「跳板机连不上」会把探针拖到 20s
    let connectConfig;
    let transport;
    try {
        const attached = await attachSshTransport({ spec, store, readyTimeoutMs: PROBE_AUTH_TIMEOUT_MS });
        connectConfig = attached.connectConfig;
        transport = attached.transport;
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        result.auth = { ok: false, error: classifyError(message) };
        return finish();
    }
    const password = spec.auth === 'password' ? connectConfig.password ?? '' : '';
    const tryKeyboard = connectConfig.tryKeyboard === true;
    return new Promise((resolve) => {
        let settled = false;
        let seenHostKey = false;
        let hostkeyState = { state: 'unknown', fingerprint: '' };
        const settle = () => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            try {
                conn.end();
            }
            catch {
                /* 已断开 */
            }
            try {
                transport.bastion?.end();
            }
            catch {
                /* 已断开 */
            }
            // 代理命令是子进程：探针收尾必须杀它（每次试连漏一个常驻进程是很容易漏的地方）
            transport.proxy?.dispose();
            resolve(finish());
        };
        // hostVerifier 的 onResult 同步回调：把结论收集到 hostkeyState
        connectConfig.hostVerifier = makeHostKeyVerifier({
            spec,
            store,
            onResult: (next) => {
                seenHostKey = true;
                hostkeyState = { ...next, error: next.error };
            },
        });
        // password 认证挂 keyboard-interactive 自动应答（同 spawnSsh/tunnels/sftp）
        const conn = new Client();
        if (tryKeyboard) {
            conn.on('keyboard-interactive', (_name, _instructions, _lang, _prompts, finishKb) => {
                finishKb([password]);
            });
        }
        const authStart = Date.now();
        /*
         * **每个回调进来先看 settled**——这不是防御性代码，是修一个真缺陷（2026-09-26 真机验收发现）：
         * `settle()` 有幂等守卫，但这些 `result.auth = …` **赋值没有**。而 `resolve(finish())` 交出去的
         * 是**同一个对象**，于是「后到的 close」会把已经定稿的字段覆写掉，调用方看到的是最后那句
         * ——实测症状是 ssh2 连报两条错（`Connection lost before handshake` 带着代理命令的 stderr、
         * 随后 `The operation was aborted` 什么线索都没有），文案被后者盖成一句空话。
         */
        const timer = setTimeout(() => {
            if (settled)
                return;
            if (seenHostKey) {
                result.hostkey = hostkeyState;
                result.auth = { ok: false, error: '认证/协商超时（服务端在 8s 内未完成认证）', ms: Date.now() - authStart };
            }
            else {
                result.auth = { ok: false, error: '握手超时（服务端未在 8s 内完成密钥交换）', ms: Date.now() - authStart };
            }
            settle();
        }, PROBE_AUTH_TIMEOUT_MS + 1000);
        timer.unref?.();
        conn.on('ready', () => {
            if (settled)
                return;
            result.hostkey = hostkeyState;
            result.auth = { ok: true, ms: Date.now() - authStart };
            settle();
        });
        /*
         * 代理命令在场合：**文案先别拼**（tty D95）。
         *
         * D66 修的是「后到的 close 覆写已定稿字段」（每个回调先看 settled），但没有覆盖另一半：
         * **拼得太早**——`conn` 的 error/close 往往比子进程的 stderr 早，那一刻 `failure()` /
         * `stderrHint()` 手里还没有证据，于是最有用的一句（命令自己说了什么）被丢成
         * 「传输已关闭（命令已结束）」。负载下就成了间歇红（CI 实测过一次）。
         *
         * 所以这里等一个**有界**窗口让子进程的 stdio 排空（`awaitEvidence`），再拼文案；
         * 非代理路径（`transport.proxy === null`）**不进这个等待**，行为与延迟一字不变。
         */
        let authEventError = null;
        const settleAuthFailure = (compose) => {
            if (settled)
                return;
            const proxy = transport.proxy;
            if (proxy === null) {
                compose();
                return;
            }
            void proxy.awaitEvidence(PROXY_EVIDENCE_GRACE_MS).then(compose, compose);
        };
        /** 定稿一条 auth 失败：`base` 是「哪一句」，代理命令的证据统一补在后面。 */
        const composeAuthFailure = (base) => {
            if (settled)
                return;
            // 见过主机密钥才把那份状态交出去（与 D66 的行为一字不差）
            if (authEventError !== null)
                result.hostkey = seenHostKey ? hostkeyState : { state: 'unknown', fingerprint: '' };
            result.auth = { ok: false, error: base + proxyFailureSuffix(transport.proxy), ms: Date.now() - authStart };
            settle();
        };
        conn.on('error', (error) => {
            if (settled)
                return;
            const classified = classifyError(error.message);
            if (error.message === 'Host key verification failed' && hostkeyState.state === 'mismatch') {
                result.hostkey = hostkeyState;
                result.auth = { ok: false, error: '主机密钥校验失败（见 hostkey 指引）', ms: Date.now() - authStart };
                settle();
                return;
            }
            /*
             * **保留第一条** ssh2 错误：实测它连报两条（前者带线索的「握手前连接中断」、后者是
             * 「The operation was aborted」这种空话）——先来的更具体，别被后到的盖掉。
             * TCP / 传输已通：这里只可能是协商 / 认证 / 协议层错误；代理命令死了的话，ssh2 只会报
             * 「握手前连接中断」——把那件事补在后面，别把人支到目标主机上。
             */
            authEventError ??= classified;
            settleAuthFailure(() => {
                composeAuthFailure(authEventError ?? classified);
            });
        });
        conn.on('close', () => {
            // 正常路径（ready / error / 超时）已 settle；未 settle 的 close 兜底
            settleAuthFailure(() => {
                composeAuthFailure(authEventError ?? '连接已关闭（服务端主动断开）');
            });
        });
        try {
            conn.connect(connectConfig);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (!settled) {
                result.auth = { ok: false, error: classifyError(message), ms: Date.now() - authStart };
                settle();
            }
        }
    });
}
//# sourceMappingURL=probe.js.map