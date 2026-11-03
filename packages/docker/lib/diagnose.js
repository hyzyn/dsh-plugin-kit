/** verdict / findings 排序权重（数字越小越严重）。 */
const SEVERITY_ORDER = { critical: 0, warning: 1, info: 2, ok: 3 };
/** suggestions 上限（契约 §1.2：0~5 条）。 */
const MAX_SUGGESTIONS = 5;
/** 证据片段上限（契约：每条 ≤ 200 字，超出截断并带 `…`）。 */
const EVIDENCE_CLIP = 200;
/** 内存逼近上限的判据阈值（%）。 */
const MEM_PRESSURE_PERCENT = 90;
/** CPU 逼近占满的判据阈值（%）。 */
const CPU_PRESSURE_PERCENT = 90;
/** 「反复重启」的判定门槛（次数）。与 `attention()` 的 D11 阈值同口径：合法重部署也会重启一两次。 */
const CRASH_LOOP_RESTARTS = 3;
/**
 * 疑似报错行的判据。刻意**不做**「日志级别解析」：日志格式千差万别（logfmt /
 * JSON / 纯文本 / 带方括号的级别），这里只找最通用的几个词。误报的代价是一条
 * info 级 finding（detail 里原样给出第一条命中行，用户自己判），漏报的代价是
 * 一条线索都没有——所以宁宽勿窄，但「stderr」这种包含 err 的词不算（靠 \b）。
 */
const ERROR_LINE_RE = /\b(?:error|err|fatal|panic|exception|traceback|failed|failure)\b/i;
/* ------------------------------------------------------------------ *
 * 文案与数值的格式化（都给用户看，不出现 docker 字段名）
 * ------------------------------------------------------------------ */
/** 把证据片段压成单行并截断到 200 字（超出带 `…`）。 */
function clip(text, max = EVIDENCE_CLIP) {
    if (text === null)
        return '';
    const flat = text.replace(/\s+/g, ' ').trim();
    const chars = [...flat];
    if (chars.length <= max)
        return flat;
    return chars.slice(0, max - 1).join('') + '…';
}
const BYTE_UNITS = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
/** `536870912` → `512MiB`（二进制单位，与 docker 的显示口径一致）。 */
function formatBytes(bytes) {
    let value = Math.max(bytes, 0);
    let unit = 0;
    while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
        value /= 1024;
        unit += 1;
    }
    const rounded = unit === 0 ? Math.round(value) : Math.round(value * 10) / 10;
    return `${String(rounded)}${BYTE_UNITS[unit]}`;
}
/** `96.5` → `96.5%`（保留一位小数，去掉多余的 `.0`）。 */
function formatPercent(percent) {
    return `${String(Math.round(percent * 10) / 10)}%`;
}
/** CPU 上限（纳核）→ `0.5 核` / `2 核`。 */
function formatCpuLimit(nanoCpus) {
    const cores = Math.round(nanoCpus / 1e8) / 10;
    return `${String(cores)} 核`;
}
const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
/**
 * 相对时长的人类可读文案（`docker ps` 的 STATUS 列用）。
 *
 * 照着 docker 的 `units.HumanDuration` 分档复刻：**秒 → 分 → 时 → 天 → 周 → 月 → 年**，
 * 其中 1 分钟 / 1 小时给 "About a minute" / "About an hour"（docker 就是这么念的），
 * 「1 秒」单独成一档。刻意保留英文形态：用户从 `docker ps` 看到的是同一句话，
 * 两处长得一样才不用在脑子里换算。
 */
export function humanDuration(ms) {
    if (!Number.isFinite(ms) || ms < 0)
        return '';
    const seconds = Math.floor(ms / SECOND_MS);
    if (seconds < 1)
        return 'Less than a second';
    if (seconds === 1)
        return '1 second';
    if (seconds < 60)
        return `${String(seconds)} seconds`;
    const minutes = Math.floor(ms / MINUTE_MS);
    if (minutes === 1)
        return 'About a minute';
    if (minutes < 60)
        return `${String(minutes)} minutes`;
    const hours = Math.round(ms / HOUR_MS);
    if (hours === 1)
        return 'About an hour';
    if (hours < 48)
        return `${String(hours)} hours`;
    if (hours < 24 * 7 * 2)
        return `${String(Math.floor(hours / 24))} days`;
    if (hours < 24 * 30 * 2)
        return `${String(Math.floor(hours / 24 / 7))} weeks`;
    if (hours < 24 * 365 * 2)
        return `${String(Math.floor(hours / 24 / 30))} months`;
    return `${String(Math.floor(hours / 24 / 365))} years`;
}
/** 解析 ISO 时间；docker 的零值时间（公元 1 年）与非法值一律当「不知道」。 */
function isoMs(iso) {
    if (iso === null || iso === '')
        return null;
    const ms = Date.parse(iso);
    return Number.isFinite(ms) ? ms : null;
}
/**
 * ps 风格的 STATUS 文案（`evidence.status` 用）。
 *
 * **为什么不直接用 `ContainerDetail.status`**：它实测就是 inspect 的 `State.Status`
 * （`running` / `exited`），而 `docker ps` 的 STATUS 是另一列（`Up 4 hours (healthy)` /
 * `Exited (137) 2 minutes ago`）——契约 §1.2 的 evidence 例子要的是后者。为了这一行
 * 再跑一条 `docker ps` 不划算（诊断已经有 inspect 的权威字段），所以按 docker ps 的
 * 口径现算：判据用 inspect，展示文案顺手推出来（一条事实一个来源）。
 *
 * `nowMs` 缺席时不给相对时长（不编「多久以前」），退化成 `Up` / `Exited (137)`。
 */
export function containerStatusText(detail, nowMs) {
    const now = typeof nowMs === 'number' && Number.isFinite(nowMs) ? nowMs : null;
    const healthSuffix = detail.health === null || detail.health === 'none'
        ? ''
        : detail.health === 'starting'
            ? ' (health: starting)'
            : ` (${detail.health})`;
    const since = (from) => {
        if (now === null)
            return '';
        const at = isoMs(from);
        if (at === null)
            return '';
        const text = humanDuration(now - at);
        return text === '' ? '' : ` ${text}`;
    };
    const code = detail.exitCode === null ? '' : ` (${String(detail.exitCode)})`;
    switch (detail.state) {
        case 'running':
            return `Up${since(detail.startedAt)}${healthSuffix}`;
        case 'paused':
            return `Up${since(detail.startedAt)} (Paused)`;
        case 'exited': {
            const ago = since(detail.finishedAt);
            return `Exited${code}${ago === '' ? '' : `${ago} ago`}`;
        }
        case 'restarting': {
            const ago = since(detail.finishedAt);
            return `Restarting${code}${ago === '' ? '' : `${ago} ago`}`;
        }
        case 'created':
            return 'Created';
        case 'dead':
            return 'Dead';
        case 'removing':
            return 'Removing';
        default:
            return detail.state;
    }
}
/** 退出码的常见含义（判据 2 的 detail 用）。只收「用户能据此行动」的那几个。 */
const EXIT_MEANING = {
    1: '应用自己报错退出（最常见的一类失败，具体原因看日志）',
    126: '命令无法执行（多半是启动脚本没有执行权限）',
    127: '命令不存在（镜像里找不到要启动的可执行文件，命令名或路径写错了）',
    137: '进程被强制杀死（收到 SIGKILL：被内存限制打死，或被 docker stop 强杀）',
    139: '进程段错误退出（收到 SIGSEGV，应用自身崩溃）',
    143: '进程收到终止信号后退出（SIGTERM，多为 docker stop 主动停）',
};
/** 未在字典里的退出码：只说「非零」，不猜。 */
function exitMeaning(code) {
    return EXIT_MEANING[code] ?? '非零退出（没有对应到常见退出码，看退出前的日志定位）';
}
/** `created` / `paused` / `dead` 的中文状态（判据 7 的标题与 summary 用）。 */
const STATE_LABEL = {
    created: '已创建但没启动',
    paused: '已暂停',
    dead: '已死亡（运行时异常，容器无法再启动）',
};
/** 容器是不是「在运行」（判据 11/12 的「容器在运行」口径）。 */
function isRunning(state) {
    return state === 'running';
}
/**
 * 事件 → 给人看的一句话（契约：`kind` 原样，`text` 中文）。
 * 未知动作原样返回——猜出来的中文比英文动作名更容易误导。
 */
function timelineText(event) {
    const action = event.action;
    const base = (action.split(':')[0] ?? '').trim();
    switch (base) {
        case 'start':
            return '启动';
        case 'die':
            return event.exitCode === null ? '退出' : `退出（码 ${String(event.exitCode)}）`;
        case 'stop':
            return '停止';
        case 'kill':
            return '被信号杀死';
        case 'oom':
            return '内存不足被系统杀掉';
        case 'destroy':
            return '被删除';
        case 'rename':
            return '改名';
        case 'update':
            return '配置更新';
        case 'health_status': {
            // `health_status: healthy|unhealthy|starting`
            const suffix = (action.split(':')[1] ?? '').trim();
            return suffix === '' ? '健康状态变化' : `健康检查结果：${suffix}`;
        }
        default:
            return action;
    }
}
/** Unix 秒 → ISO 8601（秒级，去掉 `.000`；无时间给 null）。 */
function eventTimeIso(time) {
    if (time === null)
        return null;
    const iso = new Date(time * 1000).toISOString();
    return iso.replace(/\.\d{3}Z$/, 'Z');
}
/** `ContainerStats` 里数值字段的安全取值（字段可缺 / 可为 null）。 */
function statNumber(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
const RULES = [
    /* 1. OOM */
    {
        code: 'oom-killed',
        severity: 'critical',
        test: (ctx) => ctx.detail.oomKilled,
        title: () => '被 OOM 杀掉',
        detail: (ctx) => {
            const limit = ctx.limitText === '' ? '' : `（${ctx.limitText}）`;
            const code = ctx.detail.exitCode === null ? '' : `，退出码 ${String(ctx.detail.exitCode)}`;
            return `进程被内核强制终止：内存用量打到上限${limit}后被系统杀掉${code}。`;
        },
        summary: () => '内存打到上限，容器被系统强制杀掉',
        suggestions: () => [
            '调高内存上限（docker update --memory 后重启容器）',
            '排查内存泄漏：用 docker top 看进程常驻内存是否持续上涨',
            '限制应用自己的堆 / 缓存大小（容器内存上限要留余量给运行时）',
        ],
    },
    /* 2. 非零退出（OOM 已单独成条，不重复报） */
    {
        code: 'exit-nonzero',
        severity: 'critical',
        test: (ctx) => ctx.detail.exitCode !== null && ctx.detail.exitCode !== 0 && !ctx.detail.oomKilled,
        title: (ctx) => `以非零退出码 ${String(ctx.detail.exitCode)} 结束`,
        detail: (ctx) => {
            const code = ctx.detail.exitCode ?? 0;
            return `容器已退出，退出码 ${String(code)} —— ${exitMeaning(code)}。`;
        },
        summary: (ctx) => `容器以退出码 ${String(ctx.detail.exitCode)} 退出`,
        suggestions: (ctx) => {
            const code = ctx.detail.exitCode;
            if (code === 126)
                return ['检查入口脚本是否有执行权限（容器内 chmod +x）'];
            if (code === 127)
                return ['确认镜像里有要启动的可执行文件：命令名或路径写错了？'];
            if (code === 137)
                return ['先确认是不是 docker stop 主动停的；不是就按内存不足排查（看是否被 OOM 杀掉）'];
            if (code === 143)
                return ['确认是不是 docker stop / 部署流程主动停的'];
            if (code === 139)
                return ['看日志里崩溃前的堆栈：多为应用自身缺陷（空指针 / 段错误）'];
            return ['用 docker_logs 看退出前最后的输出定位失败原因'];
        },
    },
    /* 3. 反复重启 */
    {
        code: 'crash-loop',
        severity: 'critical',
        test: (ctx) => ctx.detail.state === 'restarting' || (ctx.detail.restartCount !== null && ctx.detail.restartCount >= CRASH_LOOP_RESTARTS),
        title: () => '反复重启',
        detail: (ctx) => {
            const count = ctx.detail.restartCount;
            const times = count === null ? '重启次数未知' : `已重启 ${String(count)} 次`;
            if (ctx.detail.state === 'restarting')
                return `容器正在反复重启（${times}，此刻仍在重启中）：启动后很快就退出，重启策略又在把它拉起来。`;
            return `容器在反复重启（${times}）：说明启动后很快就退出，只是还没轮到时看到它停着。`;
        },
        summary: (ctx) => {
            const count = ctx.detail.restartCount;
            return count === null ? '容器正在反复重启' : `反复重启（已重启 ${String(count)} 次）`;
        },
        suggestions: () => [
            '看 docker_logs 里每次启动后立刻打出的报错（多为配置错误 / 依赖服务连不上）',
            '先止血：把重启策略改成 no 停止重启风暴（docker update --restart no）',
        ],
    },
    /* 4. 健康检查不通过 */
    {
        code: 'unhealthy',
        severity: 'critical',
        test: (ctx) => ctx.detail.health === 'unhealthy',
        title: () => '健康检查不通过',
        detail: (ctx) => {
            const output = clip(ctx.detail.healthLogTail);
            return output === '' ? '健康检查持续失败：探针一直没通过，服务对外可能已经不可用。' : `健康检查持续失败；最后一次输出：${output}。`;
        },
        summary: () => '健康检查持续失败，服务可能不可用',
        suggestions: () => [
            '在容器里手动跑一次健康检查命令，确认它本身是否可用',
            '检查健康检查的间隔 / 超时 / 启动等待时间是否设得太紧',
            '看 docker_logs 里健康检查前后的报错，区分「探针不通」与「服务真挂了」',
        ],
    },
    /* 5. 健康检查进行中 */
    {
        code: 'health-starting',
        severity: 'info',
        test: (ctx) => ctx.detail.health === 'starting',
        title: () => '健康检查进行中',
        detail: () => '容器刚启动，健康检查还没得出结果（starting）。这是启动期的正常状态，不是故障。',
        summary: () => '刚启动，健康检查还在进行',
        suggestions: () => ['稍等一会儿再诊断一次，确认它转为 healthy'],
    },
    /* 6. 正常退出 */
    {
        code: 'stopped-ok',
        severity: 'info',
        test: (ctx) => ctx.detail.state === 'exited' && ctx.detail.exitCode === 0,
        title: () => '已正常退出',
        detail: (ctx) => {
            const at = ctx.detail.finishedAt;
            return `容器以退出码 0 结束${at === null ? '' : `（${at}）`}，属于正常退出，多半是手动停的或任务本来就该跑完。`;
        },
        summary: () => '容器已正常退出（退出码 0）',
        suggestions: () => ['要它继续运行就 start 容器；一次性任务可以忽略'],
    },
    /* 7. 没在运行（created / paused / dead） */
    {
        code: 'not-running',
        severity: 'warning',
        test: (ctx) => ctx.detail.state === 'created' || ctx.detail.state === 'paused' || ctx.detail.state === 'dead',
        title: (ctx) => `容器${STATE_LABEL[ctx.detail.state] ?? `处于 ${ctx.detail.state} 状态`}`,
        detail: (ctx) => {
            const label = STATE_LABEL[ctx.detail.state] ?? ctx.detail.state;
            return `容器当前没有在运行：状态 ${ctx.detail.state}（${label}）。`;
        },
        summary: (ctx) => `容器没有在运行（${STATE_LABEL[ctx.detail.state] ?? ctx.detail.state}）`,
        suggestions: (ctx) => {
            if (ctx.detail.state === 'paused')
                return ['容器被暂停了：恢复（unpause）后再看'];
            if (ctx.detail.state === 'dead')
                return ['容器已死亡：只能删除后重建（先确认数据卷还在）'];
            return ['容器创建后还没启动：start 一下确认能不能起来'];
        },
    },
    /* 8. 内存逼近上限（没设上限时不判：百分比的分母是宿主机内存，说「逼近上限」不成立） */
    {
        code: 'mem-pressure',
        severity: 'warning',
        test: (ctx) => {
            const percent = statNumber(ctx.stats?.memPercent);
            return percent !== null && percent >= MEM_PRESSURE_PERCENT && ctx.memoryLimitBytes !== null;
        },
        title: () => '内存接近上限',
        detail: (ctx) => {
            const percent = statNumber(ctx.stats?.memPercent);
            const bytes = statNumber(ctx.stats?.memUsed);
            const parts = [
                percent === null ? '' : `内存已用 ${formatPercent(percent)}`,
                ctx.limitText === '' ? '' : `上限 ${ctx.limitText}`,
                bytes === null ? '' : `当前 ${formatBytes(bytes)}`,
            ].filter((part) => part !== '');
            return `${parts.join('，')}。再涨就会被系统杀掉（变成 OOM）。`;
        },
        summary: (ctx) => {
            const percent = statNumber(ctx.stats?.memPercent);
            return `内存已用 ${percent === null ? '?' : formatPercent(percent)}（上限 ${ctx.limitText === '' ? '?' : ctx.limitText}）`;
        },
        suggestions: () => [
            '调高内存上限，或降低并发 / 缓存大小',
            '排查内存泄漏：用 docker top 看进程常驻内存是否持续上涨',
        ],
    },
    /* 9. CPU 逼近占满 */
    {
        code: 'cpu-pressure',
        severity: 'warning',
        test: (ctx) => {
            const percent = statNumber(ctx.stats?.cpuPercent);
            return percent !== null && percent >= CPU_PRESSURE_PERCENT;
        },
        title: () => 'CPU 接近占满',
        detail: (ctx) => {
            const percent = statNumber(ctx.stats?.cpuPercent);
            const limit = ctx.cpuQuota === null ? '' : `（上限 ${formatCpuLimit(ctx.cpuQuota)}）`;
            return `CPU 占用 ${percent === null ? '?' : formatPercent(percent)}${limit}。持续打满时请求会排队、健康检查也可能跟着超时。`;
        },
        summary: (ctx) => {
            const percent = statNumber(ctx.stats?.cpuPercent);
            return `CPU 已用 ${percent === null ? '?' : formatPercent(percent)}`;
        },
        suggestions: () => [
            '用 docker top 看是哪个进程在吃 CPU：业务高峰还好，死循环要修',
            '持续打满要给容器设 CPU 上限或扩容',
        ],
    },
    /* 10. 日志里有报错 */
    {
        code: 'log-errors',
        severity: 'info',
        test: (ctx) => ctx.errorLines !== null && ctx.errorLines >= 1,
        title: () => '日志里有报错',
        detail: (ctx) => {
            const first = clip(ctx.firstErrorLine);
            const count = ctx.errorLines ?? 0;
            return `最近抓取的日志里有 ${String(count)} 行疑似报错${first === '' ? '' : `；第一条：${first}`}。`;
        },
        summary: (ctx) => `日志里有 ${String(ctx.errorLines ?? 0)} 行疑似报错`,
        suggestions: () => ['用 docker_logs_grep 带 pattern 检索完整报错上下文（本工具只抓尾部若干行）'],
    },
    /* 11. 没有健康检查（只在运行中才有意义：已退出的容器「探不到活」是废话） */
    {
        code: 'no-healthcheck',
        severity: 'info',
        test: (ctx) => ctx.detail.health === null && isRunning(ctx.detail.state),
        title: () => '没有健康检查',
        detail: () => '容器没有配置健康检查：进程活着不等于服务真的可用，出问题时只能靠日志与调用方报错判断。',
        summary: () => '没有健康检查，无法判断服务是否可用',
        suggestions: () => ['给镜像加 HEALTHCHECK，或让调用方做应用层探活'],
    },
    /*
     * 12–14. 三路采集失败（`*-unavailable`）。
     *
     * 为什么必须有判据：没有它，「日志没采到」在 evidence 里只是一个 null，而 verdict
     * 可能还是 running-ok——用户读到的是「一切正常」，排障方向当场被带偏。严重度是
     * info（容器本身没坏，是这次诊断的证据不全），但**结论不再是 ok**。
     */
    {
        code: 'logs-unavailable',
        severity: 'info',
        test: (ctx) => ctx.logText === null,
        title: () => '本次没能取到日志',
        detail: (ctx) => `日志采集失败${ctx.logError === null ? '' : `：${clip(ctx.logError)}`}。下面的结论不含日志证据，别当成「日志是空的」。`,
        summary: () => '本次没能取到日志，结论不含日志证据',
        suggestions: () => ['重试一次；仍然失败就用 docker_logs 单独读日志（它会给出具体原因）'],
    },
    {
        code: 'events-unavailable',
        severity: 'info',
        test: (ctx) => ctx.eventCount === null,
        title: () => '本次没能取到事件',
        detail: (ctx) => `事件采集失败${ctx.eventError === null ? '' : `：${clip(ctx.eventError)}`}，时间线为空不代表这段时间没发生过重启。`,
        summary: () => '本次没能取到事件，时间线可能不完整',
        suggestions: () => ['重试一次；仍然失败就用 docker_events 单独读事件（它会给出具体原因）'],
    },
    {
        code: 'stats-unavailable',
        severity: 'info',
        test: (ctx) => ctx.stats === null,
        title: () => '本次没能取到资源占用',
        detail: (ctx) => `资源统计采集失败${ctx.statsError === null ? '' : `：${clip(ctx.statsError)}`}，所以没有 CPU / 内存数据（容器已退出时取不到属正常）。`,
        summary: () => '本次没能取到资源占用数据',
        suggestions: () => ['容器要在运行中才有统计；在跑还取不到就用 docker_stats 单独取一次'],
    },
];
/**
 * 纯函数入口：把已采好的四路数据判成一份诊断。
 *
 * 顺序稳定：findings 按 severity 降序，同级按上表的编号顺序；verdict 取最高 severity
 * 的那条（同级取最靠前），一条都不命中且容器在运行时给 `running-ok`。
 */
export function diagnose(input) {
    const detail = input.detail;
    const scan = input.logText === null ? { count: null, first: null } : scanErrorLines(input.logText);
    const ctx = {
        detail,
        stats: input.stats,
        logText: input.logText,
        logError: typeof input.logError === 'string' && input.logError.trim() !== '' ? input.logError.trim() : null,
        eventError: typeof input.eventError === 'string' && input.eventError.trim() !== '' ? input.eventError.trim() : null,
        statsError: typeof input.statsError === 'string' && input.statsError.trim() !== '' ? input.statsError.trim() : null,
        errorLines: scan.count,
        firstErrorLine: scan.first,
        eventCount: input.events === null ? null : input.events.length,
        memoryLimitBytes: input.memoryLimitBytes,
        cpuQuota: input.cpuQuota,
        limitText: input.memoryLimitBytes === null ? '' : formatBytes(input.memoryLimitBytes),
    };
    const matched = [];
    RULES.forEach((rule, order) => {
        if (!rule.test(ctx))
            return;
        matched.push({
            rule,
            order,
            finding: { code: rule.code, severity: rule.severity, title: rule.title(ctx), detail: rule.detail(ctx) },
        });
    });
    matched.sort((a, b) => SEVERITY_ORDER[a.finding.severity] - SEVERITY_ORDER[b.finding.severity] || a.order - b.order);
    const findings = matched.map((row) => row.finding);
    const verdict = matched.length > 0
        ? {
            severity: matched[0].finding.severity,
            code: matched[0].finding.code,
            summary: matched[0].rule.summary(ctx),
        }
        : isRunning(detail.state)
            ? { severity: 'ok', code: 'running-ok', summary: '容器在运行，未发现明确问题' }
            : { severity: 'ok', code: 'ok', summary: '未发现明确问题' };
    const suggestions = [];
    for (const row of matched) {
        for (const item of row.rule.suggestions(ctx)) {
            if (suggestions.length >= MAX_SUGGESTIONS)
                break;
            if (item.trim() === '' || suggestions.includes(item))
                continue;
            suggestions.push(item);
        }
        if (suggestions.length >= MAX_SUGGESTIONS)
            break;
    }
    return {
        id: detail.id,
        name: detail.name,
        verdict,
        findings,
        evidence: {
            state: detail.state,
            status: containerStatusText(detail, input.nowMs),
            health: detail.health,
            // 空串归一成 null（可缺字段给 null，客户端据此渲染 `—`）：parseInspectJson 对
            // 「有健康检查但从未输出过」给的是 ''，与「没有这条记录」在这里是同一种「没东西可看」。
            healthLastOutput: detail.healthLogTail === '' ? null : detail.healthLogTail,
            exitCode: detail.exitCode,
            oomKilled: detail.oomKilled,
            restartCount: detail.restartCount,
            startedAt: detail.startedAt,
            finishedAt: detail.finishedAt,
            memoryLimitBytes: input.memoryLimitBytes,
            cpuQuota: input.cpuQuota,
            logLines: input.logLines,
            errorLines: scan.count,
            eventCount: ctx.eventCount,
            cpuPercent: input.stats === null ? null : input.stats.cpuPercent,
            memBytes: input.stats === null ? null : input.stats.memUsed,
            memPercent: input.stats === null ? null : input.stats.memPercent,
        },
        timeline: buildTimeline(input.events),
        logTail: input.logText ?? '',
        suggestions,
    };
}
/** 时间线：按 Unix 秒**升序**，`at` 转 ISO 8601；没有时间的事件排最前（信息仍在，不丢）。 */
function buildTimeline(events) {
    if (events === null)
        return [];
    return events
        .map((event) => ({
        sort: event.time ?? 0,
        entry: { at: eventTimeIso(event.time), kind: event.action, text: timelineText(event) },
    }))
        .sort((a, b) => a.sort - b.sort)
        .map((row) => row.entry);
}
/** 扫疑似报错行：返回行数与第一条命中行（原文，截断交给调用处）。 */
function scanErrorLines(text) {
    if (text === '')
        return { count: 0, first: null };
    let count = 0;
    let first = null;
    for (const line of text.split('\n')) {
        if (line.trim() === '')
            continue;
        if (!ERROR_LINE_RE.test(line))
            continue;
        count += 1;
        if (first === null)
            first = line;
    }
    return { count, first };
}
//# sourceMappingURL=diagnose.js.map