import { sanitizeJumpSpec, sanitizeProxyCommand } from './ssh-exec.js';
/** 读某个 entry 的原始值；句柄缺失 / 该 entry 读失败都算「没有」。 */
function readEntry(settings, ns) {
    if (settings === undefined)
        return undefined;
    let raw;
    try {
        raw = settings.get(ns);
    }
    catch {
        // 拿不到 settings 句柄时**不能**当成「没配」以外的任何东西：这四个读取点的调用方
        // 都在「决定要不要连、连哪里」，读失败时给出空表 = 不连（失败方向安全）。
        return undefined;
    }
    if (typeof raw !== 'object' || raw === null)
        return undefined;
    return raw;
}
/**
 * 清洗一份 hostKeys 输入（settings 存储 / 热更新 / 种子复制共用）。
 *
 * 同时接受两种形状：
 *   - tty 0.19.0+ 的 `{host, port, fingerprints: [...]}`（多指纹集合）；
 *   - 某个消费者旧版自己落盘的 `{host, port, fingerprint}`（迁移输入）。
 * host 统一 trim + 小写（与 tty 的落盘口径一致，否则种子命中与否取决于大小写），
 * 同一 host:port 的多条记录合并成一组指纹。
 *
 * 非数组输入返回 `undefined`（「没这一项」），空数组返回 `[]`（「有一项，但里面没内容」）——
 * 调用方对这两者的处置不同（前者用默认值，后者算用户显式清空）。
 */
export function sanitizeHostKeys(input) {
    if (!Array.isArray(input))
        return undefined;
    const byKey = new Map();
    for (const raw of input) {
        if (typeof raw !== 'object' || raw === null)
            continue;
        const item = raw;
        const host = typeof item.host === 'string' ? item.host.trim().toLowerCase() : '';
        const port = typeof item.port === 'number' && Number.isInteger(item.port) && item.port >= 1 && item.port <= 65535 ? item.port : 22;
        const list = Array.isArray(item.fingerprints) ? item.fingerprints : [];
        const single = typeof item.fingerprint === 'string' && item.fingerprint.trim() !== '' ? [item.fingerprint.trim()] : [];
        const fingerprints = [...new Set([
                ...list.filter((fp) => typeof fp === 'string' && fp.trim() !== '').map((fp) => fp.trim()),
                ...single,
            ])];
        if (host === '' || fingerprints.length === 0)
            continue;
        const key = `${host}:${String(port)}`;
        const existing = byKey.get(key);
        if (existing !== undefined) {
            existing.fingerprints = [...new Set([...existing.fingerprints, ...fingerprints])];
            continue;
        }
        byKey.set(key, { host, port, fingerprints });
    }
    return [...byKey.values()];
}
/**
 * 读 tty 连接簿 → 连接规格。**导出即公开 API**：连接簿 → 规格这一跳是「一处配置、两处生效」
 * 的落地处（漏带 jump / proxyCommand 就是「tty 能连、面板连不上」那种半吊子状态）。
 *
 * 缺任何一项必需字段（name / host / username）的条目**跳过**：它们连不上，留在表里只会让
 * 调用方在下游报一个指不到配置的错误。
 */
export function readTtyBooks(settings) {
    const out = new Map();
    const entry = readEntry(settings, 'tty');
    if (entry === undefined)
        return out;
    const hosts = entry.sshHosts;
    if (!Array.isArray(hosts))
        return out;
    for (const item of hosts) {
        if (typeof item !== 'object' || item === null)
            continue;
        const raw = item;
        const name = typeof raw.name === 'string' ? raw.name.trim() : '';
        const host = typeof raw.host === 'string' ? raw.host.trim() : '';
        const username = typeof raw.username === 'string' ? raw.username.trim() : '';
        if (name === '' || host === '' || username === '')
            continue;
        const spec = {
            host,
            port: typeof raw.port === 'number' && Number.isInteger(raw.port) ? raw.port : 22,
            username,
            auth: raw.auth === 'key' || raw.auth === 'password' ? raw.auth : 'agent',
            keyPath: typeof raw.keyPath === 'string' ? raw.keyPath : '',
            password: typeof raw.password === 'string' ? raw.password : '',
            passphrase: typeof raw.passphrase === 'string' ? raw.passphrase : '',
            agentForward: raw.agentForward === true,
        };
        /*
         * 跳板机跟着连接簿一起走（消费方**不自建跳板机界面**：目标是「一处配置、两处生效」）。
         * 漏了这一段就是「终端能连、面板连不上」——本项立项时点名的半吊子状态。
         */
        const jump = sanitizeJumpSpec(raw.jump);
        if (jump !== undefined)
            spec.jump = jump;
        /*
         * 代理命令同理跟着连接簿走（消费方**不自建界面**）。闸门不在这里判：它归 tty settings 的
         * `allowProxyCommand`，由 `readTtyProxyCommandAllowed()` 现读、在**每次拨号**时求值
         * （见 `RemoteExec` 的 options.proxyCommandAllowed）——这样用户一关开关就立刻生效。
         */
        const proxyCommand = sanitizeProxyCommand(raw.proxyCommand);
        if (proxyCommand !== undefined)
            spec.proxyCommand = proxyCommand;
        out.set(name, spec);
    }
    return out;
}
/**
 * 读 tty settings 里的 ProxyCommand 闸门（`allowProxyCommand`，默认关）。
 *
 * 为什么用 **tty 的**开关而不是每个消费者自己再加一个：连接簿只有一处（tty），代理命令也只有
 * 一处能填；两个开关会让「连接簿配了、这个面板不认」变成说不清的状态。代价是多依赖一个
 * 只读 settings 字段——settings 句柄缺失（启动早期）时恒 false，即**关**（失败方向安全）。
 */
export function readTtyProxyCommandAllowed(settings) {
    const entry = readEntry(settings, 'tty');
    if (entry === undefined)
        return false;
    return entry.allowProxyCommand === true;
}
/**
 * 从 tty 的 hostKeys 读取已钉扎指纹，作为消费者自己那份 TOFU 记录的**种子**。
 *
 * 为什么要读它：tty 里已经确认过一次的主机，不该在新面板上被当成「首次连接」——
 * 那样用户就在不知情的情况下把指纹信任了两遍，而第二遍是静默的（TOFU 首次即放行）。
 */
export function readTtyHostKeys(settings) {
    const entry = readEntry(settings, 'tty');
    if (entry === undefined)
        return [];
    return sanitizeHostKeys(entry.hostKeys) ?? [];
}
//# sourceMappingURL=tty-books.js.map