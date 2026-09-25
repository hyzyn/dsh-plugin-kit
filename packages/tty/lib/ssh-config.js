/** 单文件最多产出多少条连接簿候选（防异常巨型文件）。 */
export const MAX_IMPORT_ENTRIES = 100;
/** `proxy` 名单最多回报多少个块名（超出的只计数）：导入提示不该被一份巨型配置撑爆。 */
export const MAX_PROXY_NAMES = 50;
/**
 * 这个块是不是显式要求直连（`ProxyJump none` / `ProxyCommand none`）。
 * OpenSSH 用 `none` 抵消上层（`Host *`）的跳板机设置——这类块照常可导入。
 */
function proxyOptOut(value) {
    return typeof value === 'string' && value.trim().toLowerCase() === 'none';
}
export function parseSshConfigDetailed(text) {
    const entries = [];
    const proxy = [];
    let proxyCount = 0;
    let skippedOther = 0;
    let droppedOverflow = 0;
    /** 当前 Host 块：模式列表 + 选项表（键已小写）。 */
    let block = null;
    const flush = () => {
        if (block === null)
            return;
        const concrete = block.patterns.length > 0 && block.patterns.every((p) => p !== '' && !/[*?!]/.test(p));
        if (!concrete) {
            skippedOther += 1;
            block = null;
            return;
        }
        const name = block.patterns[0];
        const needsProxy = (block.options.has('proxyjump') && !proxyOptOut(block.options.get('proxyjump'))) ||
            (block.options.has('proxycommand') && !proxyOptOut(block.options.get('proxycommand')));
        if (needsProxy) {
            proxyCount += 1;
            if (proxy.length < MAX_PROXY_NAMES)
                proxy.push(name);
            block = null;
            return;
        }
        const user = block.options.get('user');
        if (typeof user !== 'string' || user.trim() === '') {
            skippedOther += 1;
            block = null;
            return;
        }
        if (entries.length >= MAX_IMPORT_ENTRIES) {
            droppedOverflow += 1;
            block = null;
            return;
        }
        const host = block.options.get('hostname') ?? name;
        const portRaw = Number(block.options.get('port'));
        const port = Number.isInteger(portRaw) && portRaw >= 1 && portRaw <= 65535 ? portRaw : 22;
        const identityFile = block.options.get('identityfile');
        entries.push({
            name,
            host,
            port,
            username: user.trim(),
            auth: identityFile !== undefined && identityFile.trim() !== '' ? 'key' : 'agent',
            keyPath: identityFile !== undefined ? identityFile.trim() : '',
            passphrase: '',
            password: '',
            agentForward: false,
        });
        block = null;
    };
    // eslint-disable-next-line no-restricted-syntax -- 下面是既有的逐行状态机（保持原样）
    for (const rawLine of text.split(/\r?\n/)) {
        let line = rawLine.trim();
        if (line === '' || line.startsWith('#'))
            continue;
        // 行内注释（非引号内的第一个 ' #'）：宽容处理为直接截断
        const hash = line.indexOf(' #');
        if (hash !== -1)
            line = line.slice(0, hash).trim();
        if (line === '')
            continue;
        let key;
        let rest;
        const eq = line.indexOf('=');
        if (eq > 0 && !/\s/.test(line.slice(0, eq))) {
            key = line.slice(0, eq).trim();
            rest = line.slice(eq + 1).trim();
        }
        else {
            const match = line.match(/^(\S+)\s+(.*)$/);
            if (match === null)
                continue;
            key = match[1];
            rest = match[2].replace(/^=\s*/, ''); // 宽容「key = value」的空格等号写法
        }
        const keyLower = key.toLowerCase();
        if (keyLower === 'host') {
            flush();
            // 「Host = name」的孤立等号当作分隔符宽容丢弃
            block = { patterns: rest.split(/\s+/).filter((p) => p !== '' && p !== '='), options: new Map() };
            continue;
        }
        if (block === null)
            continue;
        if (keyLower === 'include')
            continue; // 不展开，避免读入用户无法预期的文件
        if (block.options.has(keyLower))
            continue; // 首个生效（OpenSSH 语义）
        block.options.set(keyLower, rest.replace(/^"+|"+$/g, ''));
    }
    flush();
    return { entries, proxy, proxyCount, skippedOther, droppedOverflow };
}
/** 只要导入候选（老调用点与既有用例的形状）；需要「跳过了什么」时用 detailed 版。 */
export function parseSshConfig(text) {
    return parseSshConfigDetailed(text).entries;
}
//# sourceMappingURL=ssh-config.js.map