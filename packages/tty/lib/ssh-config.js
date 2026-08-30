export function parseSshConfig(text) {
    const entries = [];
    /** 当前 Host 块：模式列表 + 选项表（键已小写）。 */
    let block = null;
    const flush = () => {
        if (block === null)
            return;
        const concrete = block.patterns.length > 0 && block.patterns.every((p) => p !== '' && !/[*?!]/.test(p));
        if (concrete) {
            const name = block.patterns[0];
            const host = block.options.get('hostname') ?? name;
            const user = block.options.get('user');
            const portRaw = Number(block.options.get('port'));
            const port = Number.isInteger(portRaw) && portRaw >= 1 && portRaw <= 65535 ? portRaw : 22;
            const identityFile = block.options.get('identityfile');
            if (typeof user === 'string' && user.trim() !== '' && entries.length < 100) {
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
            }
        }
        block = null;
    };
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
    return entries;
}
//# sourceMappingURL=ssh-config.js.map