import type { SettingsLookup } from '@hyzyn/dsh-kit';
import type { SshSpec } from '@hyzyn/dsh-kit/ssh-exec';
import type { LiveTarget } from './plugin-config.js';
import type { DockerRunner, ObservedCommand } from './observe.js';
/** `kit` 执行层的最小形状（`RemoteExec` 符合；写成结构类型是为了能在用例里喂假的）。 */
export interface RemoteExecLike {
    run(spec: SshSpec, argv: readonly string[], options?: {
        timeoutMs?: number;
        maxBytes?: number;
        keepTail?: boolean;
    }): Promise<{
        code: number | null;
        stdout: string;
        stderr: string;
        timedOut?: boolean;
        truncated?: boolean;
    }>;
}
/** 本机执行的最小形状（`kit` 的 `runLocal` 符合）。 */
export interface LocalExecLike {
    (argv: readonly string[], options?: {
        timeoutMs?: number;
        maxBytes?: number;
        keepTail?: boolean;
    }): Promise<{
        code: number | null;
        stdout: string;
        stderr: string;
        timedOut?: boolean;
        truncated?: boolean;
    }>;
}
/** 解析目标失败时给出的可读原因（指到该改哪里）。 */
export interface ChannelProblem {
    message: string;
    hint: string;
}
/** 解析结果：拿到一根可以跑 docker 的线，或者一句说得清的话。 */
export type ChannelResolution = {
    kind: 'ready';
    runner: DockerRunner;
    probeHost: string;
} | {
    kind: 'problem';
    problem: ChannelProblem;
};
/** 观测层的选项（`observe.ts` 的 `DockerRunOptions`）：由调用方按「inspect 还是 logs」给。 */
/**
 * 把一个 `kit` 执行层的返回值翻成观测层认的形状。
 *
 * `timedOut` / `truncated` **原样带下去**——观测层据此升级成通道级失败（理由见文件头注）。
 */
export declare function toObserved(result: {
    code: number | null;
    stdout: string;
    stderr: string;
    timedOut?: boolean;
    truncated?: boolean;
}): ObservedCommand;
/**
 * 给一个目标接一根线。
 *
 * @param target - 解析后的目标。
 * @param deps - 执行层与本机的两个实现，外加读连接簿用的 settings 句柄。
 */
export declare function resolveChannel(target: LiveTarget, deps: {
    remote: RemoteExecLike;
    local: LocalExecLike;
    settings: SettingsLookup | undefined;
    execTimeoutMs: number;
}): ChannelResolution;
