/**
 * 发布清单（`release/<发布名>.yaml`）：**由人给出的**「这次发布该验哪些项目」。
 *
 * ## 为什么需要它，以及为什么它不能是「自动发现」
 *
 * 三面（`devenv` / `devdata` / `devfront`）靠**同一个项目名**对齐，而「这次发布该验哪些项目」是
 * **发现逻辑**——三包共同划掉的边界（判据是**集合由谁给出**：工具自己发现 = 爬虫 / 批量开页面，
 * 不做）。唯一的补法是**让人写下来**：一份列项目名 + 项目根 + 本项目在这个面上用哪个目标的文件。
 * 口径与三条约束见
 * [docs/conventions.md § 发布清单](../../../docs/conventions.md#发布清单由人给出的这次该验哪些项目)。
 *
 * ## 它不是什么（三条，写出来免得被当成许可）
 *
 * - **不是第四份清单**：它只**列项目**，不重复三份清单的任何内容；每个面仍然只读**那个项目里**
 *   自己那一份（`ready/<项目>.ready.yaml` / `verify/<项目>.yaml` / `web/<项目>.yaml`）；
 * - **不是聚合器**：它不给「三面一起跑」的口径——本包读它只跑 `web` 那一面；
 * - **不是发现**：`projects` 是逐条写死的，本模块**不 glob、不扫目录**（列目录只用在
 *   「这里现在有哪些发布清单」那句对照文案上，与 `listWebProjects` 同一用途）。
 *
 * ## 为什么 `root` 是必需的
 *
 * 项目清单住在**项目目录**里，而一次发布跨多个项目：没有 `root`，工具只能拿当前工作目录去猜
 * 每个项目在哪——那正是发现逻辑。`root` **相对发布清单自己所在的目录**解析（本文件跟着发布走，
 * 换一台机器只要连项目群一起搬就不必改绝对路径）。
 */
/** 发布清单住的目录。 */
export declare const RELEASE_DIR = "release";
/** 本模块只认的版本。 */
export declare const RELEASE_VERSION = 1;
/** 发布清单里的一行：这个项目在哪、本面按哪个目标验。 */
export interface ReleaseProject {
    /** 项目名（**与三份清单同一个名字**，也是唯一对齐键）。 */
    project: string;
    /** 项目根：清单在它下面（`web/<项目>.yaml`）。相对本文件所在目录；绝对路径也收。 */
    root: string;
    /** 本面（`devfront`）在这个项目上用哪个站点（`WebTarget.id`）。 */
    target: string;
}
/** 一份发布清单。 */
export interface ReleaseManifest {
    version: number;
    release: string;
    projects: readonly ReleaseProject[];
}
/** 一条配置错误（与三份清单同一形态：路径 + 人话）。 */
export interface ReleaseConfigError {
    path: string;
    message: string;
}
/** 加载结果（三种「读不到」刻意分开——它们的处置完全不同）。 */
export type ReleaseManifestLoad = {
    kind: 'no-manifest';
    release: string;
} | {
    kind: 'unreadable';
    release: string;
    message: string;
} | {
    kind: 'config-error';
    release: string;
    errors: readonly ReleaseConfigError[];
} | {
    kind: 'ok';
    manifest: ReleaseManifest;
    file: string;
};
/** 发布清单的文件名：`<发布名>.yaml`。 */
export declare function releaseManifestFileName(release: string): string;
/** 发布清单的相对路径：`release/<发布名>.yaml`。 */
export declare function releaseManifestRelativePath(release: string): string;
/**
 * `root`（相对发布清单所在目录）解析成绝对路径。
 *
 * 相对路径的基准是**那份文件自己**，不是进程的工作目录：发布清单跟着发布走，`root: ../cdqas`
 * 在谁的机器上都指向「我旁边那个项目」。
 */
export declare function resolveProjectRoot(root: string, releaseFile: string): string;
/**
 * 列出这个目录下**已有的**发布清单（按 `release/*.yaml` 的文件名）。
 *
 * 用途只有一处：`no-manifest` 的文案里附上「这里现在有哪些发布清单」——发布名写错时，
 * 一句「没有」不给对照，agent 只能去猜目录（与 `listWebProjects` 同一判据）。
 */
export declare function listReleaseManifests(dir: string): string[];
/**
 * 校验一份已解析的发布清单。
 *
 * **一次报全部错误**（清单是给人改的），而且**不认识的字段一律拒**——静默忽略一个写错键名的
 * `projects` 会让工具去跑一套空的集合，而报告看起来是绿的。
 */
export declare function validateReleaseManifest(release: string, data: unknown): {
    ok: true;
    manifest: ReleaseManifest;
} | {
    ok: false;
    errors: ReleaseConfigError[];
};
/** 加载选项。 */
export interface LoadReleaseManifestOptions {
    /** 找发布清单的根目录（按顺序找；多个根下都有会报歧义）。 */
    roots?: readonly string[];
}
/**
 * 从工作目录里读一份发布清单（**只读**）。
 *
 * 读盘那一段复用三份清单同一份骨架（`@hyzyn/dsh-kit/manifest`）：候选路径 / `JSON_SCHEMA` /
 * 五种「读不到」在一处，本模块只把它翻成本包的结果与文案。
 */
export declare function loadReleaseManifest(release: string, options?: LoadReleaseManifestOptions): ReleaseManifestLoad;
/** 项目级判定（跑批的三种结局 + 「没跑成」）。 */
export type ReleaseVerdict = 'pass' | 'fail' | 'warn' | 'unknown';
/**
 * 整批判定：**`fail` > `warn` > `unknown` > `pass`**。
 *
 * 与断言层（`summarizeWebResults` / `verify-eval.ts`）**同一个次序**，但这一层数的是**项目**：
 * 一个项目里有一条 `fail` 就是 `fail`，而**没跑成的项目算 `unknown`**——它绝不会被算成 `pass`
 * （那正是「用没验过冒充验过」）。
 */
export declare function releaseOverall(verdicts: readonly ReleaseVerdict[]): ReleaseVerdict;
