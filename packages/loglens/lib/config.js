/**
 * @hyzyn/dsh-loglens — 来源清单的纯逻辑层。
 *
 * 本模块不 import cordis / 网络 / 文件系统：路由层（src/index.ts）与用例直接调它，
 * 「什么样的来源算合法」「id 怎么生成」「坏行丢掉还是整份丢掉」三类判据只有一处归宿。
 * 契约与安全口径见 docs/design.md 的 §3（归一化行模型）与 §4（安全与凭据）。
 *
 * 唯一的例外是 `sanitizeUrl`：它来自 `@hyzyn/dsh-kit` 的 `net-fence`（纯函数，不碰网络），
 * 而**脱敏必须在「出去的那一侧」只有一份实现**——本文件的 `publicTarget` / `publicConfig`
 * 与错误文案共用它（2026-10-19 外部测评 issue #13 第 9 条）。
 */
import { sanitizeUrl } from '@hyzyn/dsh-kit';
export const SOURCE_KINDS = ['loki', 'elasticsearch', 'opensearch', 'docker'];
/** 来源条数上限：够用，且挡住「一次注入几千条」的配置面。 */
export const MAX_TARGETS = 32;
/** id 形态：小写字母数字与连字符，首字符不能是连字符。 */
const ID_SHAPE = /^[a-z0-9][a-z0-9-]*$/u;
/** id 总长上限；留 4 个字符给 -2 / -3 这类去重后缀。 */
const ID_MAX = 48;
const ID_BASE_MAX = ID_MAX - 4;
/** 索引表达式的形态：不许空白 / 斜杠 / ? / #（它是路径段，不是 URL）。 */
const INDEX_SHAPE = /^[^\s/?#]+$/u;
/** IPv4 字面量判据；别名 / 十进制形态要靠 P4 的 net.ts 在解析之后判。 */
const IPV4 = /^([0-9]{1,3})[.]([0-9]{1,3})[.]([0-9]{1,3})[.]([0-9]{1,3})$/u;
export function emptyConfig() {
    return { enabled: true, targets: [] };
}
export function isSourceKind(value) {
    return typeof value === 'string' && SOURCE_KINDS.includes(value);
}
/** docker 是采集来源而不是查询后端：它的地址可以留空（设计 §5 选项 0）。 */
export function urlRequired(kind) {
    return kind !== 'docker';
}
/**
 * 链路本地 / 云元数据地址：设计 §1 明列的非目标，添加动作直接拒。
 *
 * 这里是**添加期的字面量快筛**；真正的出站围栏在 src/net.ts（2026-10-11 落地）：那边判的是
 * **解析之后的 IP**，还管重定向、体积与超时。两层都要有——本层让「填进来就明显不对的」当场报错，
 * net.ts 那层才挡得住域名解析出来的东西。
 */
export function isLinkLocalHost(hostname) {
    let host = hostname.trim().toLowerCase();
    if (host.startsWith('['))
        host = host.slice(1);
    if (host.endsWith(']'))
        host = host.slice(0, -1);
    if (host === 'metadata.google.internal' || host === 'metadata')
        return true;
    const v4 = IPV4.exec(host);
    if (v4 !== null)
        return v4[1] === '169' && v4[2] === '254';
    return host.startsWith('fe80:');
}
/**
 * 地址校验：只收 http / https 的绝对地址，并把链路本地 / 云元数据拒在门外。
 *
 * **连接面 = 你配置的来源**：回环、私网、公网一律放行（托管日志服务是正常用法）；唯一被
 * 无条件拒绝的是链路本地 / 云元数据那一档。这条语义在设计 §4.1 里写明，别在后端适配器里再收紧一遍。
 */
export function normalizeUrl(raw) {
    if (typeof raw !== 'string')
        return { ok: false, error: '地址必须是字符串' };
    const trimmed = raw.trim();
    if (trimmed === '')
        return { ok: false, error: '地址不能为空' };
    let parsed;
    try {
        parsed = new URL(trimmed);
    }
    catch {
        return { ok: false, error: '地址不是合法 URL（要带 http:// 或 https://）：' + trimmed };
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return { ok: false, error: '地址只支持 http / https：' + trimmed };
    }
    if (isLinkLocalHost(parsed.hostname)) {
        return { ok: false, error: '链路本地 / 云元数据地址不允许：' + parsed.hostname };
    }
    return { ok: true, url: trimmed };
}
/** 由名称 / 地址推一个 id 基底；都不成词时回落 target（中文名会整段被过滤掉）。 */
export function slugId(...sources) {
    for (const source of sources) {
        const slug = source
            .toLowerCase()
            .replace(/[^a-z0-9]+/gu, '-')
            .replace(/^-+/u, '')
            .replace(/-+$/u, '')
            .slice(0, ID_BASE_MAX);
        if (slug !== '')
            return slug;
    }
    return 'target';
}
/** 在已有 id 集合里取一个不冲突的 id（-2 / -3 …）。 */
export function uniqueId(base, taken) {
    if (!taken.includes(base))
        return base;
    for (let index = 2; index <= taken.length + 2; index += 1) {
        const candidate = base + '-' + String(index);
        if (!taken.includes(candidate))
            return candidate;
    }
    return base + '-' + String(taken.length + 2);
}
/**
 * 校验并归一化一条来源。taken 用于 id 去重（新增与改判都走同一条路，避免两处判据）。
 * input.id 只在**新建**时起作用；改判时 id 由调用方钉住（id 不可改，见 updateTarget）。
 */
/** 由地址推一个 id 基底：取 host + path，别把协议与斜杠也变成连字符（那会得到 http-127-0-0-1-3100 这种）。 */
export function slugSourceForUrl(url) {
    if (url === '')
        return '';
    try {
        const parsed = new URL(url);
        return parsed.host + (parsed.pathname === '/' ? '' : parsed.pathname);
    }
    catch {
        return url;
    }
}
export function validateTargetInput(input, taken = []) {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) {
        return { ok: false, error: '来源必须是对象' };
    }
    const raw = input;
    if (!isSourceKind(raw.kind)) {
        return { ok: false, error: '类型必须是 ' + SOURCE_KINDS.join(' / ') + '：' + JSON.stringify(raw.kind) };
    }
    const kind = raw.kind;
    let url = '';
    const rawUrl = typeof raw.url === 'string' ? raw.url.trim() : '';
    if (rawUrl !== '' || urlRequired(kind)) {
        const checked = normalizeUrl(rawUrl);
        if (!checked.ok)
            return checked;
        url = checked.url;
    }
    const label = typeof raw.label === 'string' ? raw.label.trim() : '';
    const rawDockerTarget = typeof raw.dockerTarget === 'string' ? raw.dockerTarget.trim() : '';
    if (rawDockerTarget !== '' && kind !== 'docker') {
        return { ok: false, error: 'dockerTarget 只对 docker 来源有意义（当前类型是 ' + kind + '）' };
    }
    const rawIndex = typeof raw.index === 'string' ? raw.index.trim() : '';
    if (rawIndex !== '' && kind !== 'elasticsearch' && kind !== 'opensearch') {
        return { ok: false, error: 'index 只对 elasticsearch / opensearch 来源有意义（当前类型是 ' + kind + '）' };
    }
    if (rawIndex !== '' && INDEX_SHAPE.test(rawIndex) === false) {
        return {
            ok: false,
            error: 'index 不能含空白 / 斜杠 / ? / #（索引表达式用逗号分隔、可用 * 与 - 前缀排除）：' + rawIndex,
        };
    }
    const requested = typeof raw.id === 'string' ? raw.id.trim().toLowerCase() : '';
    const base = requested === ''
        ? slugId(label, slugSourceForUrl(url))
        : (requested.replace(/[^a-z0-9]+/gu, '-').replace(/^-+/u, '').replace(/-+$/u, '').slice(0, ID_BASE_MAX) || 'target');
    const id = uniqueId(base, taken);
    if (!ID_SHAPE.test(id))
        return { ok: false, error: 'id 形态不合法：' + id };
    const target = { id, kind, label: label === '' ? id : label, url };
    if (rawDockerTarget !== '')
        target.dockerTarget = rawDockerTarget;
    if (rawIndex !== '')
        target.index = rawIndex;
    return { ok: true, target };
}
/**
 * 宽松读盘：坏行计入 dropped 后丢掉，**不整份作废**——一条脏数据不该让整张卡片空白
 * （与 docker 的 normalizeConfig 同一口径：能救回来的部分照常可用，丢掉的必须有信号）。
 */
export function normalizeConfig(input) {
    const raw = typeof input === 'object' && input !== null ? input : {};
    const list = Array.isArray(raw.targets) ? raw.targets : [];
    const targets = [];
    let dropped = 0;
    for (const item of list) {
        if (targets.length >= MAX_TARGETS) {
            dropped += 1;
            continue;
        }
        const checked = validateTargetInput(item, targets.map((target) => target.id));
        if (!checked.ok) {
            dropped += 1;
            continue;
        }
        targets.push(checked.target);
    }
    return { config: { enabled: raw.enabled !== false, targets }, dropped };
}
/**
 * 给**界面与模型**看的来源：地址里的 `user:pass` 一律抹掉（2026-10-19 外部测评 issue #13 第 9 条）。
 *
 * 规格本来就是这样写的（design §4「凭据：官方凭据层 / `env:NAME` 引用，**永不回传浏览器**」；
 * ROADMAP「URL 里不留凭据——错误文案与日志里也不该有密码」），但实现漏了两处出口：
 *   - `GET /config` 原样回整份 config → 密码进了浏览器；
 *   - `loglens_sources` 工具输出 `target.url` → 密码进了模型上下文。
 *
 * 判据：**回显一律脱敏，存储仍保留原值**。存储侧不能改——ES 的 `targetAccess` 要靠 URL 里的
 * `user:pass` 现算 Basic 头，把存储也洗掉就等于把认证弄丢。所以脱敏只发生在「出去的那一侧」。
 *
 * @param target - 一条来源
 * @returns 同一形状的副本，`url` 已去掉 userinfo
 */
export function publicTarget(target) {
    return { ...target, url: sanitizeUrl(target.url) };
}
/** 整份配置的对外形态（`/config` 与工具输出共用同一口径）。 */
export function publicConfig(config) {
    return { ...config, targets: config.targets.map((target) => publicTarget(target)) };
}
export function findTarget(config, id) {
    if (typeof id !== 'string')
        return undefined;
    const wanted = id.trim();
    return config.targets.find((target) => target.id === wanted);
}
export function addTarget(config, input) {
    if (config.targets.length >= MAX_TARGETS) {
        return { ok: false, error: '来源数量已达上限 ' + String(MAX_TARGETS) };
    }
    const checked = validateTargetInput(input, config.targets.map((target) => target.id));
    if (!checked.ok)
        return checked;
    return { ok: true, config: { ...config, targets: [...config.targets, checked.target] } };
}
/** 改一条来源。**id 不可改**：它是浏览器侧唯一的引用方式，改 id 等于换了一条来源。 */
export function updateTarget(config, id, patch) {
    const current = findTarget(config, id);
    if (current === undefined)
        return { ok: false, error: '来源不存在：' + JSON.stringify(id) };
    if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) {
        return { ok: false, error: 'patch 必须是对象' };
    }
    const rawPatch = patch;
    const merged = {
        id: current.id,
        kind: rawPatch.kind === undefined ? current.kind : rawPatch.kind,
        label: rawPatch.label === undefined ? current.label : rawPatch.label,
        url: rawPatch.url === undefined ? current.url : rawPatch.url,
        dockerTarget: rawPatch.dockerTarget === undefined ? current.dockerTarget : rawPatch.dockerTarget,
        index: rawPatch.index === undefined ? current.index : rawPatch.index,
    };
    const others = config.targets.filter((target) => target.id !== current.id).map((target) => target.id);
    const checked = validateTargetInput(merged, others);
    if (!checked.ok)
        return checked;
    return {
        ok: true,
        config: { ...config, targets: config.targets.map((target) => (target.id === current.id ? checked.target : target)) },
    };
}
export function removeTarget(config, id) {
    const current = findTarget(config, id);
    if (current === undefined)
        return { ok: false, error: '来源不存在：' + JSON.stringify(id) };
    return { ok: true, config: { ...config, targets: config.targets.filter((target) => target.id !== current.id) } };
}
//# sourceMappingURL=config.js.map