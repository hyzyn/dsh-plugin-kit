/**
 * 环境编排的**就绪判据**（`docs/devdata-plan.md` §13.2）。
 *
 * > **归属（2026-10-02）**：本文件从 `packages/devdata/src/env-ready.ts` **原样迁来**
 * > （plan §16.1 的第 2 步，与建包同一步）。迁的原因是判据只有一条：**清单与求值跟着「它判的
 * > 对象」走**——就绪判的是容器/探针的**状态**，不是数据的内容，所以它归 `devenv`。
 * > 内容未改，只改了这一段归属说明与两处指路的注释。
 *
 * ## 这一层解决什么
 *
 * `env_wait` 最难的不是等待，是**知道在等什么**。没有声明式判据，它只能猜——而猜错的方向是
 * 「以为起来了，其实还在热启动」，接下去跑测试得到一串**假阴性**，人再去查一圈，最后发现问题
 * 不在代码上。本仓自己踩过这个坑的反面（`jenkins-release` 技能 §3.1 记录了那条判据）。
 *
 * ## 一条硬判据：**两个证据缺一不可**
 *
 * 「容器在跑」与「服务就绪」是两件事：
 *
 * 1. **`StartedAt` 必须落在可判的位置**——容器可能刚起、可能反复重启；
 * 2. **启动完成行必须出现，且必须晚于本次 `StartedAt`**。
 *
 * 第 2 条里「晚于本次」是关键：容器重启后日志缓冲区里**还留着上一个进程的启动完成行**，
 * 只看「有没有这一行」会在重启的那一瞬间判成就绪——而那正是最不该放行的一刻。
 *
 * ## 三种状态，不是为了好看
 *
 * | 判定 | 含义 | 该做什么 |
 * |---|---|---|
 * | `ready` | 全部证据到齐且都成立 | 继续 |
 * | `unready` | 证据不足 / 还没到 | **继续等**（这是等待的常态） |
 * | `refuted` | 已有证据**明确否证**（容器退出了、健康检查是 unhealthy） | **别等了**——等下去不会有结果 |
 *
 * 把 `refuted` 混进 `unready` 的代价是：容器崩了还要等满超时（冷启动可配 150 秒），
 * 而 agent 拿到的是「超时」——它多半会**再等一次**。
 *
 * ## 与 §3.9 断言库的关系
 *
 * 两者同构（项目内文本清单 + DSH 侧只读 + 缺省即无），但**归属不同包**：就绪清单是环境面，
 * 断言库是数据面（plan §16）。所以这里不共用 `verify/` 的目录约定——加载器由调用方给路径。
 *
 * 依据：`docs/devdata-plan.md` §13.2、`jenkins-release` 技能 §3.1 / §4。
 */
/** 全部就绪维度。 */
export const READY_DIMENSIONS = ['logPattern', 'httpProbe', 'healthcheck'];
/** 服务名的形状：compose 服务名允许字母数字与 `-` `_` `.`，但含 `/` 就不是服务名了。 */
const NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
/**
 * 校验一份已解析的就绪清单。
 *
 * 一次报全部错误（清单是给人改的）。**就绪判据必须在加载时定死**：留到运行时才发现「这一项
 * 既没给 logPattern 也没给 healthcheck」，就只能在等待中途报错——而调用方已经在计时了。
 */
export function validateProfile(project, data) {
    const errors = [];
    const fail = (path, message) => {
        errors.push({ path, message });
    };
    if (!isRecord(data)) {
        return { ok: false, errors: [{ path: '', message: '清单顶层必须是一个映射（mapping）' }] };
    }
    if (data.version !== 1) {
        fail('version', `本模块只认 version: 1，拿到 ${JSON.stringify(data.version)}`);
    }
    if (data.project !== project) {
        fail('project', `清单里的 project（${JSON.stringify(data.project)}）与文件名推出的项目（${JSON.stringify(project)}）不一致`);
    }
    const raw = data.services;
    if (!Array.isArray(raw)) {
        fail('services', '`services` 必须是数组');
        return { ok: false, errors };
    }
    if (raw.length === 0) {
        fail('services', '`services` 是空的：要么删掉这份清单，要么把服务写上（空清单报绿等于没验）');
    }
    const seen = new Set();
    raw.forEach((item, index) => {
        const at = `services[${String(index)}]`;
        if (!isRecord(item)) {
            fail(at, '每一个服务必须是一个映射');
            return;
        }
        const name = item.name;
        if (typeof name !== 'string' || !NAME_PATTERN.test(name)) {
            fail(`${at}.name`, `name 必须是容器名 / compose 服务名，拿到 ${JSON.stringify(name)}`);
        }
        else if (seen.has(name)) {
            fail(`${at}.name`, `服务 ${JSON.stringify(name)} 重复`);
        }
        else {
            seen.add(name);
        }
        if (item.timeoutMs !== undefined) {
            if (typeof item.timeoutMs !== 'number' || !Number.isInteger(item.timeoutMs) || item.timeoutMs <= 0) {
                fail(`${at}.timeoutMs`, `必须是正整数毫秒，拿到 ${JSON.stringify(item.timeoutMs)}`);
            }
        }
        if (item.ready !== undefined)
            validateReady(item.ready, `${at}.ready`, fail);
    });
    return errors.length > 0 ? { ok: false, errors } : { ok: true, profile: data };
}
/** 校验就绪条件：恰好一种，且参数自洽。 */
function validateReady(value, path, fail) {
    if (!isRecord(value)) {
        fail(path, '`ready` 必须是映射（给出 logPattern / httpProbe / healthcheck 之一）');
        return;
    }
    const kind = value.kind;
    if (typeof kind !== 'string' || !READY_DIMENSIONS.includes(kind)) {
        fail(`${path}.kind`, `必须是 ${READY_DIMENSIONS.join(' / ')} 之一，拿到 ${JSON.stringify(kind)}`);
        return;
    }
    const extra = Object.keys(value).filter((key) => !['kind', 'pattern', 'path', 'port'].includes(key));
    for (const key of extra) {
        fail(`${path}.${key}`, '未知字段——不认识的一律拒，不静默忽略');
    }
    if (kind === 'logPattern') {
        if (typeof value.pattern !== 'string' || value.pattern === '') {
            fail(`${path}.pattern`, '必须是字符串');
        }
        else {
            try {
                new RegExp(value.pattern);
            }
            catch (error) {
                fail(`${path}.pattern`, `正则不合法：${error instanceof Error ? error.message : String(error)}`);
            }
        }
    }
    if (kind === 'httpProbe') {
        if (typeof value.path !== 'string' || !value.path.startsWith('/')) {
            fail(`${path}.path`, `必须是以 / 开头的路径，拿到 ${JSON.stringify(value.path)}`);
        }
        if (typeof value.port !== 'number' || !Number.isInteger(value.port) || value.port < 1 || value.port > 65535) {
            fail(`${path}.port`, `必须是 1–65535 的整数，拿到 ${JSON.stringify(value.port)}`);
        }
    }
    if (kind === 'healthcheck' && (value.pattern !== undefined || value.path !== undefined || value.port !== undefined)) {
        fail(path, 'healthcheck 不接参数');
    }
}
/** 判断一个值是不是普通对象。 */
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
/** 清单的文件名（唯一一处）：`<project>.ready.yaml`。 */
export function profileFileName(project) {
    return `${project}.ready.yaml`;
}
/**
 * 从一批已列好的文件名里挑出就绪清单。
 *
 * 与断言库同构（应对 §3.9 的「共用加载与校验逻辑」），但目录约定由调用方定——
 * 就绪清单是**环境面**，**已随 `devenv` 一起搬走**（2026-10-02，plan §16.1 第 2 步；
 * 当时这里写的「会随 devenv 包一起搬走」就是这一步），不该在这里钉死一个属于数据面的路径。
 */
export function profilesIn(files) {
    const out = new Map();
    for (const file of files) {
        if (!file.endsWith('.ready.yaml'))
            continue;
        const base = file.slice(file.lastIndexOf('/') + 1);
        const stem = base.slice(0, -'.ready.yaml'.length);
        if (stem === '')
            continue;
        out.set(stem, file);
    }
    return out;
}
/** 人类可读的时长（报告里用，别让人去数毫秒）。 */
export function formatDuration(ms) {
    if (!Number.isFinite(ms) || ms < 0)
        return '—';
    if (ms < 1000)
        return `${String(Math.round(ms))}ms`;
    const seconds = ms / 1000;
    if (seconds < 60)
        return `${seconds.toFixed(1)}s`;
    const minutes = Math.floor(seconds / 60);
    return `${String(minutes)}m${String(Math.round(seconds - minutes * 60))}s`;
}
//# sourceMappingURL=env-ready.js.map