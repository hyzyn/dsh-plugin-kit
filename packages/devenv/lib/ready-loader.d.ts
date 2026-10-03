import { type ProfileLoad } from './env-ready.js';
/** 清单所在子目录（`<项目根>/ready/`）。 */
export declare const READY_DIR = "ready";
/** 清单在项目里的相对路径（**唯一一处**，别的代码不许再拼一遍）。 */
export declare function readyManifestPath(dir: string, project: string): string;
/** 项目里的就绪清单路径（用于「你这里还有哪些清单」这句提示）。 */
export declare function readyManifestRelPath(project: string): string;
/**
 * 列出这个目录下**已有的**项目名（按文件名）。
 *
 * 用途只有一处：`no-profile` 的文案里附上「这里现在有哪些清单」——清单名与项目名不一致
 * （比如文件名写成 `ems-service.ready.yaml`）是最常见的写错方式，报一句「没有」而不给对照，
 * agent 会去猜目录。
 */
export declare function listReadyProjects(dir: string): string[];
/**
 * 加载一份就绪清单。**永不抛**：三种失败都是返回值（调用方要把它们说给人听）。
 */
export declare function loadReadyProfile(dir: string, project: string): ProfileLoad;
/** `describeProfileProblem` 的输入。 */
export interface ProfileProblemContext {
    /** 项目根（判据用的目录）。 */
    cwd: string;
    project: string;
    /** 这个目录下已有的清单名（`no-profile` 时用来给一条对照）。 */
    known: readonly string[];
}
/**
 * 把一次加载失败说成 agent 能据以行动的话（**纯函数**，所以能逐档断言）。
 *
 * 三种失败必须**各自**说清，因为下一步动作完全不同：
 *   - `no-profile` → 去写一份（或者确认这个项目确实没有就绪要求）；
 *   - `unreadable` → 去看权限 / 挂载（清单在，但读不了）；
 *   - `config-error` → 去改清单（错在哪一字段由 `validateProfile` 指出来）。
 *
 * 合成一句「加载失败」的代价是：用户分不清「我没写」和「我写错了」。`no-profile` 那档还额外附上
 * 「这里现在有哪些清单」——文件名与项目名不一致是最常见的写错方式，只报「没有」会让人去猜目录。
 */
export declare function describeProfileProblem(loaded: Exclude<ProfileLoad, {
    kind: 'ok';
}>, context: ProfileProblemContext): string;
