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
import { readdirSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { manifestFileName as kitManifestFileName, manifestRelPath, projectsInFiles, readProjectManifest } from '@hyzyn/dsh-kit/manifest';
/** 发布清单住的目录。 */
export const RELEASE_DIR = 'release';
/** 只认 `.yaml`（与三份清单同一口径：一份清单两个文件名会有两种答案）。 */
const RELEASE_SUFFIX = '.yaml';
/** 本模块只认的版本。 */
export const RELEASE_VERSION = 1;
/** 发布名 / 项目名的形状（与三份清单同一套：报告里好点名）。 */
const ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;
/** 发布清单的文件名：`<发布名>.yaml`。 */
export function releaseManifestFileName(release) {
    return kitManifestFileName(release, RELEASE_SUFFIX);
}
/** 发布清单的相对路径：`release/<发布名>.yaml`。 */
export function releaseManifestRelativePath(release) {
    return manifestRelPath(RELEASE_DIR, release, RELEASE_SUFFIX);
}
/**
 * `root`（相对发布清单所在目录）解析成绝对路径。
 *
 * 相对路径的基准是**那份文件自己**，不是进程的工作目录：发布清单跟着发布走，`root: ../cdqas`
 * 在谁的机器上都指向「我旁边那个项目」。
 */
export function resolveProjectRoot(root, releaseFile) {
    return isAbsolute(root) ? root : resolve(dirname(releaseFile), root);
}
/**
 * 列出这个目录下**已有的**发布清单（按 `release/*.yaml` 的文件名）。
 *
 * 用途只有一处：`no-manifest` 的文案里附上「这里现在有哪些发布清单」——发布名写错时，
 * 一句「没有」不给对照，agent 只能去猜目录（与 `listWebProjects` 同一判据）。
 */
export function listReleaseManifests(dir) {
    try {
        return [...projectsInFiles(readdirSync(join(dir, RELEASE_DIR)), { suffix: RELEASE_SUFFIX }).keys()].sort();
    }
    catch {
        return [];
    }
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
/**
 * 校验一份已解析的发布清单。
 *
 * **一次报全部错误**（清单是给人改的），而且**不认识的字段一律拒**——静默忽略一个写错键名的
 * `projects` 会让工具去跑一套空的集合，而报告看起来是绿的。
 */
export function validateReleaseManifest(release, data) {
    const errors = [];
    const fail = (path, message) => {
        errors.push({ path, message });
    };
    if (!isRecord(data)) {
        return { ok: false, errors: [{ path: '', message: '发布清单顶层必须是一个映射（mapping）' }] };
    }
    for (const key of Object.keys(data)) {
        if (!['version', 'release', 'projects'].includes(key))
            fail(key, '未知字段——不认识的一律拒，不静默忽略');
    }
    if (data.version !== RELEASE_VERSION)
        fail('version', `本模块只认 version: ${String(RELEASE_VERSION)}，拿到 ${JSON.stringify(data.version)}`);
    if (data.release !== release) {
        fail('release', `清单里的 release（${JSON.stringify(data.release)}）与文件名推出的发布名（${JSON.stringify(release)}）不一致`);
    }
    const raw = data.projects;
    if (!Array.isArray(raw)) {
        fail('projects', '`projects` 必须是数组');
        return { ok: false, errors };
    }
    if (raw.length === 0) {
        fail('projects', '`projects` 是空的：要么删掉这份发布清单，要么把项目列上（空清单不该报绿）');
    }
    const seen = new Set();
    raw.forEach((item, index) => {
        const at = `projects[${String(index)}]`;
        if (!isRecord(item)) {
            fail(at, '每一行必须是一个映射：`{ project, root, target }`');
            return;
        }
        for (const key of Object.keys(item)) {
            if (!['project', 'root', 'target'].includes(key))
                fail(`${at}.${key}`, '未知字段——不认识的一律拒');
        }
        const project = item.project;
        if (typeof project !== 'string' || !ID_PATTERN.test(project)) {
            fail(`${at}.project`, `项目名必须匹配 ${String(ID_PATTERN)}（它同时是清单文件名），拿到 ${JSON.stringify(project)}`);
        }
        else if (seen.has(project)) {
            fail(`${at}.project`, `项目 ${JSON.stringify(project)} 重复——同一个项目跑两遍，报告点名会指错`);
        }
        else {
            seen.add(project);
        }
        if (typeof item.root !== 'string' || item.root.trim() === '') {
            fail(`${at}.root`, '必须是非空的项目根路径（相对本文件所在目录；清单在它下面）');
        }
        if (typeof item.target !== 'string' || item.target.trim() === '') {
            fail(`${at}.target`, '必须是本面用到的站点 id（WebTarget.id）');
        }
    });
    return errors.length > 0 ? { ok: false, errors } : { ok: true, manifest: data };
}
/**
 * 从工作目录里读一份发布清单（**只读**）。
 *
 * 读盘那一段复用三份清单同一份骨架（`@hyzyn/dsh-kit/manifest`）：候选路径 / `JSON_SCHEMA` /
 * 五种「读不到」在一处，本模块只把它翻成本包的结果与文案。
 */
export function loadReleaseManifest(release, options = {}) {
    const roots = options.roots ?? ['.'];
    const candidates = roots.map((root) => join(isAbsolute(root) ? root : resolve(root), RELEASE_DIR, releaseManifestFileName(release)));
    const read = readProjectManifest(candidates);
    if (read.kind === 'missing')
        return { kind: 'no-manifest', release };
    if (read.kind === 'multiple') {
        return {
            kind: 'unreadable',
            release,
            message: `在多个根目录下都找到了 ${releaseManifestRelativePath(release)}：${read.files.join('、')}——两份发布清单是歧义，请只留一份`,
        };
    }
    if (read.kind === 'unreadable')
        return { kind: 'unreadable', release, message: `读不到 ${read.file}：${read.message}` };
    if (read.kind === 'malformed')
        return { kind: 'unreadable', release, message: `${read.file} 的 YAML 语法错：${read.message}` };
    if (read.kind === 'empty') {
        return { kind: 'config-error', release, errors: [{ path: '', message: `${read.file} 是空的：要么写上项目，要么删掉它` }] };
    }
    const validated = validateReleaseManifest(release, read.data);
    return validated.ok ? { kind: 'ok', manifest: validated.manifest, file: read.file } : { kind: 'config-error', release, errors: validated.errors };
}
/**
 * 整批判定：**`fail` > `warn` > `unknown` > `pass`**。
 *
 * 与断言层（`summarizeWebResults` / `verify-eval.ts`）**同一个次序**，但这一层数的是**项目**：
 * 一个项目里有一条 `fail` 就是 `fail`，而**没跑成的项目算 `unknown`**——它绝不会被算成 `pass`
 * （那正是「用没验过冒充验过」）。
 */
export function releaseOverall(verdicts) {
    if (verdicts.includes('fail'))
        return 'fail';
    if (verdicts.includes('warn'))
        return 'warn';
    if (verdicts.includes('unknown'))
        return 'unknown';
    return 'pass';
}
//# sourceMappingURL=release.js.map