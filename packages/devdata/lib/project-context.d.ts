export type ProjectMode = 'readonly' | 'release';
export type ProjectFace = 'environment' | 'data' | 'front';
export interface ProjectContext {
    /** 调用方显式提供的本机绝对路径；这里只做词法归一化，不证明目录存在。 */
    readonly root: string;
    /** 与三面清单文件名一致的项目名。 */
    readonly project: string;
    readonly mode: ProjectMode;
    readonly enabled: Readonly<Record<ProjectFace, boolean>>;
    /** 两种流程均只读。这不是目标的权限快照，也不授予任何能力。 */
    readonly readOnly: true;
}
export interface ProjectContextProblem {
    /** 点号路径指向出错字段；未知字段也必须可被调用方定位。 */
    readonly field: string;
    readonly message: string;
}
export type ProjectContextResult = {
    readonly ok: true;
    readonly context: ProjectContext;
    readonly problems: readonly [];
} | {
    readonly ok: false;
    readonly context: null;
    readonly problems: readonly ProjectContextProblem[];
};
/**
 * 归一化最小项目上下文。
 *
 * root / project 必须明确给出，mode 缺省 readonly，三面开关缺省全部关闭。
 * 坏输入逐字段报问题并不产出上下文，不把相对路径绑定到宿主 cwd，也不展开 `~`。
 */
export declare function normalizeProjectContext(input: unknown): ProjectContextResult;
