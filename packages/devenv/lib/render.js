import { actionLabel } from './mutate.js';
import { readyManifestRelPath } from './ready-loader.js';
/** 判定图标（与 `devdata` 的 doctor 同一套：三个记号各占一档）。 */
export const VERDICT_ICON = { ready: '✓', unready: '!', refuted: '✗' };
/** 毫秒 → 人能读的时长（报告里用，别让人去数）。 */
export function formatMs(ms) {
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
/**
 * 渲染一份判定。
 *
 * 输出格式刻意是**逐服务一块**（而不是一张宽表）：agent 读的是文本，块状文本里「哪个服务缺什么」
 * 一眼能看到，而宽表在窄屏/换行后会把缺的证据与别的服务对错行。
 */
export function renderEvaluation(input) {
    const parts = [
        `目标 ${input.targetId}（${input.targetLabel}）· 项目 ${input.project} · 清单 ${readyManifestRelPath(input.project)}`,
    ];
    const observedAt = input.observations.find((item) => item.observedAt !== undefined)?.observedAt;
    if (observedAt !== undefined)
        parts.push(`观测时刻：${observedAt}（这是**快照**：报告说的是那一刻的样子）`);
    if (input.stoppedBecause !== undefined)
        parts.push(`停止等待的原因：${input.stoppedBecause}`);
    parts.push('');
    for (const service of input.evaluation.services) {
        const icon = VERDICT_ICON[service.verdict] ?? '?';
        const elapsed = service.elapsedMs === undefined ? '' : `（耗时 ${formatMs(service.elapsedMs)}）`;
        parts.push(`${icon} ${service.name}（${service.dimension}）${elapsed} ${service.message}`);
        for (const met of service.met)
            parts.push(`    · ${met}`);
        for (const missing of service.missing)
            parts.push(`    · 还缺：${missing}`);
        if (service.refuted !== undefined)
            parts.push(`    · 否证：${service.refuted}`);
        if (service.note !== undefined)
            parts.push(`    · 已知噪声：${service.note}`);
    }
    parts.push('', input.evaluation.summary);
    /*
     * 清单里有、这一轮观测里没有的服务要点名。
     *
     * 不点的后果很具体：判定层对「没观测到」给的是 `unready`（「还没观测到这个容器」），而一整份
     * 报告里如果全是别的服务在报缺证，读者会把「我没观测到」当成「它没问题」。
     */
    const observedNames = new Set(input.observations.map((item) => item.name));
    const missingObservations = input.evaluation.services
        .filter((service) => !observedNames.has(service.name))
        .map((service) => service.name);
    if (missingObservations.length > 0) {
        parts.push(`（这一轮没有取到观测的服务：${missingObservations.join(' / ')}）`);
    }
    return parts.join('\n');
}
/**
 * 渲染一次写动作的结果。
 *
 * **四档都要出现**（动了的 / 本来就那样的 / 目标上没有的 / 失败的），哪怕是空档：这份报告是
 * 「我刚才到底碰了什么」的唯一凭据，少一档就会让人以为漏做（或更糟：以为动过）。
 */
export function renderMutation(input) {
    const parts = [
        `目标 ${input.targetId}（${input.targetLabel}）· 项目 ${input.project} · 动作：${actionLabel(input.plan.action)}清单里声明的容器`,
    ];
    if (input.observedAt !== undefined)
        parts.push(`观测时刻：${input.observedAt}（决定动谁时看到的状态，是**快照**）`);
    parts.push('');
    const ok = input.outcomes.filter((outcome) => outcome.code === 0);
    const failed = input.outcomes.filter((outcome) => outcome.code !== 0);
    parts.push(ok.length === 0
        ? `已${actionLabel(input.plan.action)}：0 个`
        : `已${actionLabel(input.plan.action)}：${ok.map((outcome) => outcome.name).join(' / ')}`);
    parts.push(input.plan.unchanged.length === 0
        ? '本来就那样、未动：0 个'
        : `本来就那样、未动：${input.plan.unchanged.join(' / ')}`);
    if (input.plan.missing.length > 0) {
        parts.push(`**目标上观测不到、未动**：${input.plan.missing.join(' / ')}` +
            (input.plan.action === 'up' ? '（本工具只 start 已存在的容器，**不创建**）' : '（不存在就没有可停的）'));
    }
    for (const outcome of failed) {
        parts.push(`失败：${outcome.name}（退出码 ${String(outcome.code ?? 'null')}：${outcome.error ?? ''}）`);
    }
    if (input.plan.services.length === 0 && input.plan.missing.length === 0) {
        parts.push('', '无需变更：清单里声明的容器都已在目标状态。');
    }
    return parts.join('\n');
}
//# sourceMappingURL=render.js.map