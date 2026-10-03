/** 缺省日志尾部行数。 */
export const DEFAULT_LOG_TAIL = 200;
/** 缺省探针超时。 */
export const DEFAULT_PROBE_TIMEOUT_MS = 3000;
/** `docker inspect` 输出的字节上限（一行五个字段，够得离谱了）。 */
export const INSPECT_MAX_BYTES = 64 * 1024;
/** `docker logs` 输出的字节上限（尾部若干行；`keepTail` 保证丢的是头部）。 */
export const LOGS_MAX_BYTES = 512 * 1024;
/**
 * `docker inspect` 的字段模板（一行五个字段）。
 *
 * **字段路径要照真机的 JSON 结构写**（2026-10-02 真机抓到的一次）：`RestartCount` 是**顶层**字段，
 * 不在 `.State` 下面——`{{.State.RestartCount}}` 会让 docker 直接报
 * `template parsing error: map has no entry for key "RestartCount"`，于是**每条 inspect 都失败**，
 * 而假 docker 夹具照自己的想象回一行，单测全绿。守这一点的用例见 `test/inspect-template.test.ts`
 * （拿真机 `docker inspect` 的裁剪样本逐条解析模板里的字段路径）。
 *
 * 分隔符用 `|`：五个字段的值域都是**封闭或受限**的——状态与健康各自来自固定枚举、
 * `StartedAt` 是 RFC3339、退出码与重启次数是整数——没有一个可能含 `|`。用 Go 模板而不是取整个
 * JSON，是为了让这一层不必依赖 docker 的 JSON 结构与字段增删（那是容器面板那一整套的活）。
 */
export const INSPECT_TEMPLATE = '{{.State.Status}}|{{.State.StartedAt}}|{{.State.ExitCode}}|{{.RestartCount}}|{{if .State.Health}}{{.State.Health.Status}}{{end}}';
/** `docker inspect` 一条命令的 argv。 */
export function inspectArgv(name) {
    return ['docker', 'inspect', '--format', INSPECT_TEMPLATE, name];
}
/** `docker logs` 一条命令的 argv（`--timestamps` 是**必须的**：判定层要拿行内时刻比 `StartedAt`）。 */
export function logsArgv(name, tail) {
    return ['docker', 'logs', '--timestamps', '--tail', String(tail), name];
}
const CONTAINER_STATUSES = ['running', 'exited', 'created', 'paused', 'restarting', 'dead', 'removing'];
const HEALTH_STATUSES = ['starting', 'healthy', 'unhealthy'];
/**
 * 解析 `docker inspect --format` 的那一行。
 *
 * **状态必须是已知枚举里的一个**：拿到 `Runing` 这种（拼错 / docker 改了词）时返回 `ok: false`，
 * 而不是当成 `undefined` 往下走——判定层把「状态不是 running」当**明确否证**，于是一个上游的
 * 拼写问题会变成「别等了，容器崩了」。这正是那种「看起来像 bug、其实在另一层」的故障。
 */
export function parseInspectOutput(text) {
    const line = text.split('\n').find((item) => item.trim() !== '');
    if (line === undefined)
        return { ok: false, reason: 'docker inspect 没有任何输出' };
    const parts = line.trim().split('|');
    if (parts.length < 5)
        return { ok: false, reason: `docker inspect 的字段数不对（拿到 ${String(parts.length)} 个）：${line.trim()}` };
    const [rawStatus = '', rawStarted = '', rawExit = '', rawRestarts = '', rawHealth = ''] = parts;
    if (!CONTAINER_STATUSES.includes(rawStatus)) {
        return { ok: false, reason: `无法识别的容器状态 ${JSON.stringify(rawStatus)}` };
    }
    const fields = { status: rawStatus };
    const startedAt = rawStarted.trim();
    // 未启动过（`created`）时 docker 给零值 `0001-01-01T00:00:00Z`：它不是「一个时刻」，
    // 当成缺失——否则判定层会拿它去做时间比较，得出一个毫无意义的先后关系。
    if (startedAt !== '' && !startedAt.startsWith('0001-01-01'))
        fields.startedAt = startedAt;
    const exitCode = Number.parseInt(rawExit.trim(), 10);
    if (Number.isInteger(exitCode))
        fields.exitCode = exitCode;
    const restarts = Number.parseInt(rawRestarts.trim(), 10);
    if (Number.isInteger(restarts))
        fields.restartCount = restarts;
    const health = rawHealth.trim();
    if (health !== '') {
        if (!HEALTH_STATUSES.includes(health)) {
            return { ok: false, reason: `无法识别的健康状态 ${JSON.stringify(health)}` };
        }
        fields.health = health;
    }
    return { ok: true, fields };
}
/** 把 `docker logs` 的输出切成行（去掉末尾空行；行内保留 `--timestamps` 的前缀）。 */
export function parseLogOutput(text) {
    const lines = text.split('\n');
    while (lines.length > 0 && (lines[lines.length - 1] ?? '').trim() === '')
        lines.pop();
    return lines;
}
/**
 * docker 说「没有这个对象」吗。
 *
 * 只认 docker 自己的两条文案（`No such object` 是 1.13+ 的 `docker inspect` 文案，
 * `No such container` 出现在部分子命令里）。**别的非零一律不当「不存在」**——那是本文件头注里
 * 特意分出来的「通道不通」。
 */
export function isMissingContainer(stderr) {
    return /No such object|No such container/i.test(stderr);
}
/** 通道级失败的可读判断（错误文案原样带出去，人要靠它决定去修什么）。 */
export function channelFailureMessage(argv, result) {
    const detail = (result.stderr.trim() !== '' ? result.stderr : result.stdout).trim().split('\n')[0] ?? '';
    return `在目标机上执行 ${argv.slice(0, 2).join(' ')} 失败（退出码 ${String(result.code ?? 'null')}）：${detail === '' ? '没有输出' : detail}`;
}
/**
 * 取一批服务的观测。
 *
 * **串行**：目标可能是台 NAS，每个服务两条 SSH 往返，并发只是把 Chunk 额度（D150）挤满、
 * 让诊断文案变成「通道额度已满」。等待本来就不是这一层的瓶颈。
 */
export async function observeServices(input) {
    const logTail = input.logTail ?? DEFAULT_LOG_TAIL;
    const probeTimeoutMs = input.probeTimeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS;
    const now = input.now ?? (() => new Date().toISOString());
    const observations = [];
    for (const service of input.services) {
        const observedAt = now();
        const inspect = await input.io.run(inspectArgv(service.name), { maxBytes: INSPECT_MAX_BYTES });
        if (inspect.timedOut === true) {
            return { observations, failure: `取 ${service.name} 的 docker inspect 超时（目标机没在超时前答复）` };
        }
        if (inspect.truncated === true) {
            // 截断的 inspect **不能**解析：字段可能被切掉，解析结果会是一个合法但错的读数。
            return { observations, failure: `取 ${service.name} 的 docker inspect 时输出被截断（上限 ${String(INSPECT_MAX_BYTES)} 字节）` };
        }
        if (inspect.code !== 0) {
            if (!isMissingContainer(inspect.stderr)) {
                return {
                    observations,
                    failure: channelFailureMessage(inspectArgv(service.name), inspect),
                };
            }
            observations.push({ name: service.name, found: false, observedAt });
            continue;
        }
        const parsed = parseInspectOutput(inspect.stdout);
        if (!parsed.ok) {
            // 认不出字段 = 我这一层没法如实报告，**不能**降级成「容器不存在」（那会让等待一直在等）。
            return {
                observations,
                failure: `读不懂 ${service.name} 的 docker inspect 输出：${parsed.reason}`,
            };
        }
        const observation = { name: service.name, found: true, observedAt, ...parsed.fields };
        // 只在清单真的要用日志时才取：观测的每条命令都是一次远端往返。
        if (needsLogs(service.ready)) {
            const logs = await input.io.run(logsArgv(service.name, logTail), { maxBytes: LOGS_MAX_BYTES, keepTail: true });
            if (logs.code === 0 && logs.truncated !== true)
                observation.logLines = parseLogOutput(logs.stdout);
            // 日志取不到（超时 / 截断 / 非零）**不是**通道失败：容器可能在跑但还没有任何输出
            // （`docker logs` 对刚起的容器可能返回空，容器被删的瞬间也可能非零）。判定层拿不到行只会
            // `unready`——继续等的方向是对的。截断那一档同理：行集不完整时**宁可缺证**，也不拿半截
            // 日志去比 `StartedAt`。
        }
        if (service.ready?.kind === 'httpProbe') {
            observation.probe = await input.io.probe({
                host: input.host,
                port: service.ready.port,
                path: service.ready.path,
                timeoutMs: probeTimeoutMs,
            });
        }
        observations.push(observation);
    }
    return { observations };
}
/** 这条就绪判据需要日志吗（只有 `logPattern` 需要）。 */
export function needsLogs(ready) {
    return ready?.kind === 'logPattern';
}
//# sourceMappingURL=observe.js.map