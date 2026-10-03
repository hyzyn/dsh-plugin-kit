/**
 * 审计出口：**一条 JSON 行 / 调用**，含被拒绝的尝试与超时。
 *
 * ## 为什么在 `kit` 里（三个消费者）
 *
 * 这一份是 `devdata` 先落下的（`docs/devdata-plan.md` §5 把它写成写类操作的**前提**）。
 * 2026-10-03 `devfront`（前端验活）与 `devenv`（环境编排）也要同一件事——按本仓的规矩
 * 「第三个消费者出现就上收」，它从 `devdata` 搬进 `kit`，三个包共用同一份实现：
 * 同一条 JSON 行的形状、同一个 fail-closed 语义、同一句失败文案。
 *
 * **不放进主入口**：它 `import 'node:fs'`，而客户端半体（`client-src/*.js` → `client.js`）
 * 会打包 `@hyzyn/dsh-kit` 的主入口。所以走子路径导出 `@hyzyn/dsh-kit/audit`（与 `./ssh-exec` 同款）。
 *
 * ## 两个出口的区别必须说清
 *
 * - `createJsonlAuditSink`：**持久**。写失败 = **抛**。
 * - `createLoggerAuditSink`：只进宿主日志，**不持久**（日志会被轮转、也未必落盘）。它存在的意义是
 *   「没有配 `auditFile` 时至少别什么都不记」——而各包必须把「只有日志、没有持久记录」如实标出来
 *   （`devdata` / `devenv` 的写类动作在那种配置下会被拒，见各自 README 的口径）。
 *
 * ## 为什么写不进去就不返回结果
 *
 * 审计记的是「agent **试过什么**」——那是共享环境里唯一能事后回答「谁在什么时候动了什么」的东西。
 * 而它最容易失败的时机恰好是最需要它的时候：盘满、目录权限变了、路径写错。若这时「操作照做、记录
 * 没有」，审计就从一条**保证**退化成一句口号。所以 JSONL 出口让异常直接冒出去，由调用方（宿主半体）
 * 把它变成 agent 看到的一句错。**宁可拒绝，也不要一个不成立的保证。**
 */
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
/**
 * 一条审计行（**字段顺序固定**）。
 *
 * 固定顺序不是为了好看：审计文件是给人 `grep` 与给脚本解析的，键序稳定能让「同一类事件」在文本上
 * 也对齐（`JSON.stringify` 按插入序输出）。`at` 与 `atIso` 固定在最前，其余**原样**跟在后面。
 */
export function auditLine(entry) {
    const { at, ...rest } = entry;
    return JSON.stringify({ at, atIso: new Date(at).toISOString(), ...rest });
}
/**
 * JSON 行审计出口（持久）。
 *
 * 首次写入时**逐级建父目录**：一个不存在的目录是配置疏漏，不是安全事件，没必要让它把每次调用都
 * 变成失败。而真正的失败（无权限 / 盘满 / 路径是个目录）照旧抛出去——那才是该停下来的情况。
 */
export function createJsonlAuditSink(file, options = {}) {
    const ensureDir = options.ensureDir ?? true;
    let dirReady = false;
    return {
        record(entry) {
            const line = `${auditLine(entry)}\n`;
            try {
                if (ensureDir && !dirReady) {
                    mkdirSync(dirname(file), { recursive: true });
                    dirReady = true;
                }
                appendFileSync(file, line, 'utf8');
            }
            catch (error) {
                const reason = error instanceof Error ? error.message : String(error);
                throw new Error(`审计写入失败（${file}）：${reason}。按 fail-closed 语义，本次调用**不返回结果**` +
                    `——审计记的是「试过什么」，写不进去就不能装作它被记下了。`, { cause: error });
            }
        },
    };
}
/**
 * 只进宿主日志的出口（**不持久**）。
 *
 * 路由是**同一套口径**：允许 → `info`，拒绝 → `warn`（被拒的尝试必须看得见，那是「agent 试过什么」
 * 的证据里最要紧的一半）。文案默认由本函数按公共字段拼；各包要用自己的话术（例如带上引擎、站点）
 * 就传 `render`。
 *
 * @param options.tag - 日志前缀（如 `dsh-devdata`）。
 * @param options.render - 自定义文案；缺省 `[tag] 允许|拒绝 <action> @<targetId> …`。
 */
export function createLoggerAuditSink(logger, options) {
    const tag = options.tag;
    const render = options.render ??
        ((entry) => {
            const subject = entry.subject === undefined ? '' : ` ${entry.subject}`;
            const code = entry.code === undefined ? '' : ` (${entry.code})`;
            const op = entry.operationId === undefined ? '' : ` op=${entry.operationId}`;
            return `[${tag}] ${entry.allowed ? '允许' : '拒绝'} ${entry.action} @${entry.targetId}${subject}${code}${op}`;
        });
    return {
        record(entry) {
            const line = render(entry);
            if (entry.allowed)
                logger.info(line);
            else
                logger.warn(line);
        },
    };
}
//# sourceMappingURL=audit.js.map