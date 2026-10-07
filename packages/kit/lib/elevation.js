/**
 * 就地提权：**一条带外通道 + 一个随机名文件**。
 *
 * ## 它解决什么
 *
 * 危险能力开关原本只能「设启动环境变量 + 重启宿主」，界面点不动（见 `capability.ts`）。这里给出
 * 免重启的第二个入口：页内点开关 → 宿主在确认目录里**等一个随机名文件**出现 → 出现了就授权。
 *
 * ## 为什么这样算「带外」
 *
 * 点开关本身只是一次 HTTP 请求，跨站页面与页内脚本都发得出来。所以授权不能由那一次请求产生：
 * `begin` 只发布一个 **nonce**（16 字节随机数），真正的凭据是「有人在宿主文件系统上把那个文件
 * 落下来」——跨站页面拿不到响应里的 nonce，页内脚本读得到 nonce 但写不了宿主文件。两者都过不去。
 *
 * ## 拦不住谁（写清楚，别让调用方以为它是万能）
 *
 * 能在本机执行命令的**同用户进程**照样能过（它读得到自己那次 `begin` 的响应，也写得了文件）。
 * 这种进程本来就能直接跑 `docker`，不在威胁模型内。要拦住它只有 OS 级同意（原生对话框 / polkit），
 * **而那句话只对「没那么顺手」成立、不是结构性屏障**：它能自己 spawn 一个同名对话框、合成点击，
 * 也能直接写这个 grant 文件。逐条实测见 [docs/os-consent-plan.md](../../../docs/os-consent-plan.md) §0.3。
 * 无论将来是否接入原生对话框，**本文件的不变量 1（凭据 = 宿主文件系统上落地一个随机名文件）
 * 都不许改**——「答案是宿主从子进程读回的」那条通路不得被换成页面回答，理由见该方案 §2。
 *
 * ## 不变量
 *
 *   - nonce 只出现在 `begin` 的返回值里，**绝不进日志**（日志会落盘，见插件 README 的说明）。
 *   - 一次性：文件被读走就 `rm`；过期也 `rm`。
 *   - 只认**当前 pending 的那一个路径**：不扫目录、不删别的文件。
 *   - 每个能力同时最多 1 个 pending；`begin` 幂等（pending 期间重复调用返回同一条命令，不耗限流额度）；
 *     每能力每小时最多新建 N 个（缺省 3）。
 *   - 授权/撤销都要回调宿主重算（`onGrantChange`）——只写存储不重算，会留下「记录变了、开关没变」的
 *     半个状态（grant 侧的症状是「配置早开着，授权到了工具却不注册」）。
 *   - 授权是**持久**的（重启后直接生效、不再确认），所以**载入也要审计**：见 `auditLoadedGrants`。
 *     不写那一行，重启后静默继承的授权在日志里查不到（kit D09）。
 */
import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
const DEFAULT_TTL_MS = 300_000;
const DEFAULT_PROBE_MS = 1_000;
const DEFAULT_MAX_BEGINS_PER_HOUR = 3;
const HOUR_MS = 3_600_000;
const DIR_MODE = 0o700;
/** 建一个就地提权管理器（每个插件进程一个）。 */
export function createElevationManager(options) {
    const { confirmDir, store, logger, onGrantChange } = options;
    const logPrefix = options.logPrefix ?? '[dsh-kit]';
    const platform = options.platform ?? process.platform;
    const now = options.now ?? Date.now;
    const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    const probeIntervalMs = options.probeIntervalMs ?? DEFAULT_PROBE_MS;
    const maxBeginsPerHour = options.maxBeginsPerHour ?? DEFAULT_MAX_BEGINS_PER_HOUR;
    /** 每个能力最多一个 pending 挑战。 */
    const challenges = new Map();
    /** 每个能力新建挑战的时刻（限流用；进程级，不持久化）。 */
    const begins = new Map();
    /*
     * 审计行的出口走 console 而不是 ctx.logger（kit D14）：真机验收（2026-10-07，DSH
     * 0.2.1-alpha.1，同一发现见 docker D162 与根 ROADMAP 待办 11）实测插件经 `ctx.logger.info`
     * 打的行**既不出现在宿主 stdout、也找不到落盘文件**——而「持久授权今天一开机就静默开着」
     * 恰恰是这些行存在要回答的问题，走一个不可见的通道等于没写。tier-gate 的日志出口默认就是
     * console（kit 内先例）；docker 的 capability-use 同日已改（docker D162），修好后两类行同通道。
     */
    const audit = (action, env) => {
        // 刻意不含 nonce / 路径：nonce 是凭据，任何日志面都不得出现（不变量 1）
        console.log(`${logPrefix} elevation: ${action} capability=${env} via=file`);
    };
    const stopChallenge = (challenge) => {
        clearInterval(challenge.timer);
        if (challenges.get(challenge.env) === challenge)
            challenges.delete(challenge.env);
    };
    /** 消费/作废时删掉确认文件（best-effort：删不掉也不该让流程失败）。 */
    const removeFile = (path) => {
        try {
            rmSync(path, { force: true });
        }
        catch (error) {
            logger.warn(`${logPrefix} elevation: 清理确认文件失败（${path}）：${describe(error)}`);
        }
    };
    /** 探测一次当前 pending 的路径；成功即授权。 */
    const probe = (env) => {
        const challenge = challenges.get(env);
        if (challenge === undefined)
            return;
        if (now() >= challenge.expiresAt) {
            removeFile(challenge.path);
            stopChallenge(challenge);
            audit('expire', env);
            return;
        }
        if (!existsSync(challenge.path))
            return;
        // 先消费再授权：即使删文件失败也不该反复触发（挑战马上就被清掉）
        removeFile(challenge.path);
        store.grant(env);
        stopChallenge(challenge);
        audit('grant', env);
        onGrantChange(env, true);
    };
    const ensureDir = () => {
        try {
            const created = mkdirSync(confirmDir, { recursive: true, mode: DIR_MODE });
            // 与 grant-store 同一条理由：mkdir 的 mode 被 umask 削，权限该是确定的
            if (created !== undefined && process.platform !== 'win32')
                chmodSync(confirmDir, DIR_MODE);
            return undefined;
        }
        catch (error) {
            return describe(error);
        }
    };
    /** 限流：返回还需等待多久（0 = 放行）。 */
    const rateLimitWait = (env) => {
        const recent = (begins.get(env) ?? []).filter((at) => now() - at < HOUR_MS);
        begins.set(env, recent);
        if (recent.length < maxBeginsPerHour)
            return 0;
        const oldest = recent[0] ?? now();
        return Math.max(0, oldest + HOUR_MS - now());
    };
    return {
        begin(env) {
            const grantedVia = store.has(env) ? store.source?.(env)?.via ?? 'file' : undefined;
            if (grantedVia !== undefined)
                return { status: 'granted', via: grantedVia };
            const existing = challenges.get(env);
            if (existing !== undefined && now() < existing.expiresAt) {
                return { status: 'pending', command: commandFor(platform, existing.path), expiresAt: existing.expiresAt, reused: true };
            }
            if (existing !== undefined) {
                // 过期的挑战先收尾（清定时器 + 删残留文件），再考虑新建
                removeFile(existing.path);
                stopChallenge(existing);
            }
            const wait = rateLimitWait(env);
            if (wait > 0)
                return { status: 'rate-limited', retryAfterMs: wait };
            const failure = ensureDir();
            if (failure !== undefined)
                return { status: 'error', error: `无法创建确认目录 ${confirmDir}：${failure}` };
            const path = join(confirmDir, randomBytes(16).toString('hex'));
            const expiresAt = now() + ttlMs;
            const timer = setInterval(() => probe(env), probeIntervalMs);
            // unref：定时器不该把宿主进程（或测试进程）钉住不退出
            timer.unref?.();
            challenges.set(env, { env, path, expiresAt, timer });
            begins.set(env, [...(begins.get(env) ?? []), now()]);
            audit('begin', env);
            return { status: 'pending', command: commandFor(platform, path), expiresAt, reused: false };
        },
        status(env) {
            if (store.has(env))
                return { status: 'granted', via: store.source?.(env)?.via ?? 'file' };
            const challenge = challenges.get(env);
            // 过期的挑战当 none（清理由定时器负责）：status 是读路径，不在这里改状态
            if (challenge !== undefined && now() < challenge.expiresAt) {
                return { status: 'pending', expiresAt: challenge.expiresAt };
            }
            return { status: 'none' };
        },
        revoke(env) {
            const challenge = challenges.get(env);
            if (challenge !== undefined) {
                removeFile(challenge.path);
                stopChallenge(challenge);
            }
            const had = store.has(env);
            store.revoke(env);
            if (!had)
                return false;
            audit('revoke', env);
            onGrantChange(env, false);
            return true;
        },
        dispose() {
            for (const challenge of challenges.values())
                clearInterval(challenge.timer);
            challenges.clear();
        },
    };
}
/**
 * 启动期审计：把**已经在盘上**的带外授权打出来（每个能力开关绑定之后立刻调一次）。
 *
 * 为什么必须有：带外授权是**持久**的——重启后直接生效、**不再有任何一次确认**。于是「三周前授权
 * 的能力，今天一开机就静默开着」在日志里与界面上都看不见（宿主原来的四条审计只覆盖
 * begin / grant / expire / revoke，**load 不在内**）。这一行就是为了让那次「静默继承」留下痕迹。
 *
 * 出口走 console 而不是插件的 `ctx.logger`（kit D14，理由见 `createElevationManager` 内
 * `audit()` 处的注释）。
 *
 * 只报 `store` 里的记录（`file` 通道）：环境变量通道的授权由启动环境本身表达，界面另有说明。
 * 与其它审计行同样**不含 nonce 与路径**（stdout 会进终端回滚）。
 *
 * @param store - 授权存储（或任何实现 `source?()` 的最小对象）。
 * @param capabilities - 本插件关心的能力环境变量名（没授权的不会输出）。
 * @param logPrefix - 审计行前缀（如 `[dsh-docker]`）。
 */
export function auditLoadedGrants(store, capabilities, logPrefix = '[dsh-kit]') {
    for (const env of capabilities) {
        const grant = store.source?.(env);
        if (grant !== undefined) {
            console.log(`${logPrefix} elevation: load capability=${env} via=${grant.via} grantedAt=${isoSeconds(grant.grantedAt)}`);
            continue;
        }
        /*
         * 问不到时刻（存储只有 `has()`，或 `source` 不认识这条能力）但确实有授权：也该说出来。
         * 只写 `grantedAt=unknown` 而**不编一个时刻**——审计的价值全在「这一行是真的」。
         */
        if (store.has(env))
            console.log(`${logPrefix} elevation: load capability=${env} via=file grantedAt=unknown`);
    }
}
/** Unix 秒 → ISO（审计可读性；非法值原样回显，别让审计本身抛错）。 */
function isoSeconds(seconds) {
    const date = new Date(seconds * 1000);
    return Number.isNaN(date.getTime()) ? String(seconds) : date.toISOString();
}
/**
 * 生成「在宿主上落地确认文件」的命令。
 *
 * 路径来自调用方给的确认目录（`capabilityPaths(dshHome()).confirmDir`），正常情况下没有怪字符——但它可能因为
 * `DSH_HOME` 落在带空格/引号的目录里而变怪，所以照样转义：POSIX 单引号内用 `'\''` 收尾再续，
 * PowerShell 单引号内用 `''`。**不引号包裹用户输入**（没有用户输入进来），只有自家路径。
 */
function commandFor(platform, path) {
    if (platform === 'win32') {
        const quoted = `'${path.replaceAll("'", "''")}'`;
        return `powershell -NoProfile -Command "New-Item -ItemType File -Force ${quoted} | Out-Null"`;
    }
    return `touch '${path.replaceAll("'", "'\\''")}'`;
}
function describe(error) {
    return error instanceof Error ? error.message : String(error);
}
//# sourceMappingURL=elevation.js.map