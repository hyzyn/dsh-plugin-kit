/**
 * 环境变量里「像凭证」的键名判据。
 *
 * 只用来**提示**（值照样原样写进命令）：误报的代价是一条警告，漏报的代价是用户把带
 * 凭证的命令贴进 issue。所以宁可宽一点。
 */
const SECRET_KEY_RE = /(?:PASS|PWD|SECRET|TOKEN|KEY|CRED|AUTH|PRIVATE)/i;
/** 匿名卷的名字就是 64 位十六进制（docker 自动生成，没有稳定语义）。 */
const ANONYMOUS_VOLUME_RE = /^[0-9a-f]{64}$/i;
/** 这些网络模式下不写 `--network`（docker 的默认值 / 无意义值）。 */
const DEFAULT_NETWORK_MODES = new Set(['', 'default', 'bridge', 'none']);
/** 这些日志驱动是「没设置」时的默认值，不用还原。 */
const DEFAULT_LOG_DRIVERS = new Set(['', 'json-file', 'journald']);
function asRecord(value) {
    return typeof value === 'object' && value !== null ? value : {};
}
function asString(value) {
    return typeof value === 'string' ? value : '';
}
function asStringArray(value) {
    return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];
}
function asNumber(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
/**
 * 一个参数按 POSIX 规则转义：安全字符原样、其余用单引号包住（`'` → `'\''`），空值给 `''`。
 *
 * 刻意**不**无脑全加单引号：`--name 'shop-web-1'` 读起来噪音很大，而这一行是给人看、
 * 给人复制的。判据取「不需要转义的字符集」——凡不在其中就进引号，行为仍然安全。
 */
export function shellArg(value) {
    if (value === '')
        return "''";
    if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(value))
        return value;
    return `'${value.replace(/'/g, "'\\''")}'`;
}
/**
 * 把若干参数拼成多行命令：第一段（`docker run -d`）单独一行，其余每参数一行、行尾 `\`。
 *
 * 为什么一行一个参数：环境变量、端口、卷里经常夹着很长的串，挤在一行既读不出结构，
 * 复制到终端后也不好判断哪段属于哪个参数。
 */
export function joinCommand(parts) {
    if (parts.length === 0)
        return '';
    return parts
        .map((part, index) => `${index === 0 ? '' : '  '}${part}${index === parts.length - 1 ? '' : ' \\'}`)
        .join('\n');
}
/** 容器名（inspect 的 `.Name` 带前导斜杠）。 */
function containerName(row) {
    return asString(row.Name).replace(/^\//, '');
}
/** 端口绑定：`-p hostIp?:hostPort:containerPort/proto`；只暴露不绑定的用 `--expose`。 */
function portArgs(config, hostConfig, omitted) {
    const args = [];
    const bindings = asRecord(hostConfig.PortBindings);
    const exposed = asRecord(config.ExposedPorts);
    const bound = new Set();
    for (const [containerPort, rawList] of Object.entries(bindings)) {
        const list = Array.isArray(rawList) ? rawList : [];
        const usable = list.map((item) => asRecord(item)).filter((item) => asString(item.HostPort) !== '');
        if (usable.length === 0)
            continue;
        bound.add(containerPort);
        for (const binding of usable) {
            const hostIp = asString(binding.HostIp);
            const hostPort = asString(binding.HostPort);
            args.push(`-p ${hostIp === '' ? '' : `${hostIp}:`}${hostPort}:${containerPort}`);
        }
    }
    for (const port of Object.keys(exposed)) {
        if (bound.has(port))
            continue;
        // `--expose` 只接受端口（`8080`），tcp 可省；udp / sctp 要带协议
        const [number = '', proto = 'tcp'] = port.split('/');
        args.push(`--expose ${proto === 'tcp' ? number : `${number}/${proto}`}`);
    }
    // 端口区间（`8000-8005/tcp`）在 `-p` 里是合法的，原样透传即可；但若某个绑定既没 hostPort
    // 又不是合法的 `-p` 形状，这里点名而不是猜。
    for (const [containerPort, rawList] of Object.entries(bindings)) {
        const list = Array.isArray(rawList) ? rawList : [];
        if (list.length === 0)
            continue;
        if (list.some((item) => asString(asRecord(item).HostPort) === '')) {
            omitted.push(`端口 ${containerPort} 的绑定缺少宿主端口信息，未还原`);
        }
    }
    return args;
}
/** 挂载：bind → `-v src:dest`、named volume → `-v name:dest`、tmpfs → `--tmpfs dest`。 */
function mountArgs(hostConfig, row, omitted, warnings) {
    const args = [];
    const mounts = Array.isArray(row.Mounts) ? row.Mounts.map((item) => asRecord(item)) : [];
    const used = new Set();
    for (const mount of mounts) {
        const type = asString(mount.Type);
        const destination = asString(mount.Destination);
        const readOnly = mount.RW === false;
        const suffix = readOnly ? ':ro' : '';
        if (type === 'bind') {
            const source = asString(mount.Source);
            if (source === '' || destination === '')
                continue;
            args.push(`-v ${shellArg(`${source}:${destination}${suffix}`)}`);
            used.add(`${type}:${destination}`);
            continue;
        }
        if (type === 'volume') {
            const name = asString(mount.Name);
            if (name === '' || destination === '')
                continue;
            if (ANONYMOUS_VOLUME_RE.test(name)) {
                omitted.push(`匿名卷 ${destination} 未还原（名字 ${name} 是 docker 自动生成的，迁移时应改成命名卷）`);
                continue;
            }
            args.push(`-v ${shellArg(`${name}:${destination}${suffix}`)}`);
            used.add(`${type}:${destination}`);
            continue;
        }
        if (type === 'tmpfs') {
            if (destination === '')
                continue;
            args.push(`--tmpfs ${shellArg(destination)}`);
            used.add(`${type}:${destination}`);
            continue;
        }
        if (destination !== '')
            omitted.push(`特殊挂载 ${destination}（类型 ${type === '' ? '未知' : type}）未还原`);
    }
    // HostConfig.Binds 里有、Mounts 里没有的条目：docker 版本差异时会漏，点名而不是静默丢
    const binds = asStringArray(hostConfig.Binds);
    if (binds.length > mounts.filter((mount) => asString(mount.Source) !== '' || asString(mount.Name) !== '').length) {
        warnings.push('部分 -v 绑定来自 HostConfig.Binds 且没有对应的 Mounts 条目，可能没有还原完整');
    }
    return args;
}
/** 资源限制：内存 / CPU（纳核 → 核）。 */
function resourceArgs(hostConfig) {
    const args = [];
    const memory = asNumber(hostConfig.Memory);
    if (memory !== null && memory > 0)
        args.push(`--memory ${String(memory)}`);
    const nanoCpus = asNumber(hostConfig.NanoCpus);
    if (nanoCpus !== null && nanoCpus > 0) {
        const cores = Math.round((nanoCpus / 1e9) * 1000) / 1000;
        args.push(`--cpus ${String(cores)}`);
    }
    return args;
}
/** 能力 / 设备。 */
function capabilityArgs(hostConfig) {
    const args = [];
    for (const cap of asStringArray(hostConfig.CapAdd))
        args.push(`--cap-add ${shellArg(cap)}`);
    for (const cap of asStringArray(hostConfig.CapDrop))
        args.push(`--cap-drop ${shellArg(cap)}`);
    const devices = Array.isArray(hostConfig.Devices) ? hostConfig.Devices.map((item) => asRecord(item)) : [];
    for (const device of devices) {
        const host = asString(device.PathOnHost);
        const inside = asString(device.PathInContainer);
        const permissions = asString(device.CgroupPermissions);
        if (host === '')
            continue;
        // 三个字段全写出来（`host:inside:perm`）：等价性优先于「能省则省」，
        // 少写一段在 docker 里会被解释成别的意思
        const spec = inside === '' ? host : `${host}:${inside}`;
        args.push(`--device ${shellArg(permissions === '' ? spec : `${spec}:${permissions}`)}`);
    }
    return args;
}
/**
 * 「故意没还原」的清单：每一条都要说清**是什么**以及**怎么补**，不写「暂不支持」这种废话。
 *
 * 判据统一是「有具体信息能指出来的」：`--privileged`、`--link`、自定义日志驱动、
 * 非默认的 pid / ipc / uts、sysctl、安全选项、ENTRYPOINT 覆盖、健康检查。
 */
function omittedArgs(config, hostConfig, omitted) {
    if (hostConfig.Privileged === true) {
        omitted.push('--privileged 未还原：风险高，需要你人工确认后自己加');
    }
    if (asStringArray(hostConfig.Links).length > 0) {
        omitted.push(`--link 未还原（${asStringArray(hostConfig.Links).join('、')}）：--link 已废弃，建议改用自定义网络`);
    }
    const logType = asString(asRecord(hostConfig.LogConfig).Type);
    if (!DEFAULT_LOG_DRIVERS.has(logType)) {
        omitted.push(`日志驱动 ${logType} 未还原（默认驱动不会写进命令）`);
    }
    const pidMode = asString(hostConfig.PidMode);
    if (pidMode !== '' && pidMode !== 'private')
        omitted.push(`--pid ${pidMode} 未还原`);
    const ipcMode = asString(hostConfig.IpcMode);
    if (ipcMode !== '' && ipcMode !== 'private' && ipcMode !== 'shareable')
        omitted.push(`--ipc ${ipcMode} 未还原`);
    const utsMode = asString(hostConfig.UtsMode);
    if (utsMode !== '' && utsMode !== 'private')
        omitted.push(`--uts ${utsMode} 未还原`);
    const sysctls = asRecord(hostConfig.Sysctls);
    if (Object.keys(sysctls).length > 0)
        omitted.push(`--sysctl 未还原（${Object.keys(sysctls).join('、')}）`);
    const extraHosts = asStringArray(hostConfig.ExtraHosts);
    if (extraHosts.length > 0)
        omitted.push(`--add-host 未还原（${extraHosts.join('、')}）`);
    const securityOpt = asStringArray(hostConfig.SecurityOpt);
    if (securityOpt.length > 0)
        omitted.push(`--security-opt 未还原（${securityOpt.join('、')}）`);
    const entrypoint = asStringArray(config.Entrypoint);
    if (entrypoint.length > 0) {
        // 容器 inspect 里没有镜像自身的 ENTRYPOINT，无法确认这是「镜像自带」还是「被覆盖」——
        // 猜错的代价是复制出一条跑不起来的命令，所以宁可不写、只点名。
        omitted.push(`ENTRYPOINT 未还原（容器里是 ${entrypoint.join(' ')}，可能来自镜像本身；若你确实用 --entrypoint 覆盖过，请手动补上）`);
    }
    const healthcheck = asRecord(config.Healthcheck);
    if (asStringArray(healthcheck.Test).length > 0) {
        omitted.push('自定义健康检查未还原（重建后容器没有这条探针；镜像自带的探针不受影响）');
    }
}
/**
 * 从 `docker inspect` 的**单条**原始 JSON 行反推等价 `docker run`。
 *
 * 参数顺序与 `docs`/契约一致：`-d` → `--name` → `--restart` → 端口 → 挂载 → 网络 →
 * `-e` → `--user/--workdir/--hostname` → 资源 → 能力/设备 → 镜像与命令。
 * （ENTRYPOINT 一档刻意留空，原因见 `omittedArgs`。）
 */
export function buildRunCommand(rawInspectRow) {
    const row = asRecord(rawInspectRow);
    const config = asRecord(row.Config);
    const hostConfig = asRecord(row.HostConfig);
    const id = asString(row.Id === undefined ? row.ID : row.Id);
    const name = containerName(row);
    if (id === '' && name === '') {
        throw new Error('无法解析容器配置：inspect 里既没有 Id 也没有 Name');
    }
    const parts = ['docker run -d', `--name ${shellArg(name === '' ? id.slice(0, 12) : name)}`];
    const omitted = [];
    const warnings = [];
    const restart = asRecord(hostConfig.RestartPolicy);
    const restartName = asString(restart.Name);
    if (restartName !== '' && restartName !== 'no') {
        const retries = asNumber(restart.MaximumRetryCount);
        parts.push(`--restart ${retries !== null && restartName === 'on-failure' && retries > 0 ? `${restartName}:${String(retries)}` : restartName}`);
    }
    for (const arg of portArgs(config, hostConfig, omitted))
        parts.push(arg);
    for (const arg of mountArgs(hostConfig, row, omitted, warnings))
        parts.push(arg);
    const network = asString(hostConfig.NetworkMode);
    if (!DEFAULT_NETWORK_MODES.has(network)) {
        parts.push(`--network ${shellArg(network)}`);
        // Compose 建的网络在 `docker compose down` 之后会消失：重建前先确认它还在
        if (network.endsWith('_default')) {
            warnings.push(`网络 ${network} 可能是 Compose 创建的：重建前先确认它存在（或先起一次 compose）`);
        }
    }
    const env = asStringArray(config.Env);
    const secretKeys = [];
    for (const entry of env) {
        parts.push(`-e ${shellArg(entry)}`);
        const at = entry.indexOf('=');
        const key = at === -1 ? entry : entry.slice(0, at);
        if (SECRET_KEY_RE.test(key))
            secretKeys.push(key);
    }
    if (secretKeys.length > 0) {
        warnings.push('环境变量原值会出现在命令里，可能包含凭证；贴到公开位置前先确认');
    }
    const user = asString(config.User);
    if (user !== '')
        parts.push(`--user ${shellArg(user)}`);
    const workingDir = asString(config.WorkingDir);
    if (workingDir !== '')
        parts.push(`--workdir ${shellArg(workingDir)}`);
    const hostname = asString(config.Hostname);
    // docker 会把主机名默认设成容器 ID 前 12 位：那种情况是「没设置」，不该写进命令
    if (hostname !== '' && hostname !== id.slice(0, 12))
        parts.push(`--hostname ${shellArg(hostname)}`);
    for (const arg of resourceArgs(hostConfig))
        parts.push(arg);
    for (const arg of capabilityArgs(hostConfig))
        parts.push(arg);
    omittedArgs(config, hostConfig, omitted);
    const image = asString(config.Image);
    if (image === '') {
        throw new Error('无法解析容器配置：inspect 里没有 Config.Image');
    }
    parts.push(shellArg(image));
    for (const arg of asStringArray(config.Cmd))
        parts.push(shellArg(arg));
    const composeProject = asString(asRecord(config.Labels)['com.docker.compose.project']);
    if (composeProject !== '') {
        warnings.push(`该容器由 Compose 项目 ${composeProject} 管理：等价命令只是近似（网络别名 / labels / depends_on 不在其中），长期运维建议改回 compose`);
    }
    return {
        id: id === '' ? name : id,
        name: name === '' ? id.slice(0, 12) : name,
        // 第一行 `docker run -d` 已经带了两个参数，多行拼接时与其余参数同构
        command: joinCommand(parts),
        warnings,
        secretKeys,
        omitted,
    };
}
//# sourceMappingURL=recreate.js.map