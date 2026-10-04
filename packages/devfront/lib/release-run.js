/**
 * **发布跑批执行器**：把一份发布清单里列出的项目逐个跑成结果（`site_verify_release` 的执行体）。
 *
 * ## 它做的事，只有两件
 *
 * 1. **循环**：按发布清单里的顺序，一个项目一个项目地跑——每个项目仍然走 `site_verify` 那条同一套
 *    流程（读它自己的 `web/<项目>.yaml` → 筛出这个站点的断言 → 跑批）；
 * 2. **记「没跑成」的账**：没配站点 / 没有清单 / 清单不成立 / 那份清单里没有这个站点的断言——
 *    记进 `problems` 并判 `unknown`，**其余项目照跑**。
 *
 * ## 为什么这些依赖是**注入**的
 *
 * 与 `web-run.ts` 同一条理由：本模块不做 I/O、不读磁盘、不起浏览器——读站点声明、读项目清单、
 * 跑一个项目这三件事都由宿主层给。于是「一个项目不成立时另外几个还跑不跑」「取消之后账怎么补」
 * 这些判据可以在**没有浏览器**的情况下逐条断言（见 `test/release-run.test.ts`）。
 *
 * ## 三条边界（与 `web-run.ts` 的文件头同源）
 *
 * - **不做发现**：跑哪些项目完全来自发布清单里**逐条列出**的 `projects`——本模块不 glob、不扫目录；
 * - **不是聚合器**：它只跑 `web` 这一面，另外两面各读自己那一份清单（口径见 `docs/conventions.md`）；
 * - **「没验成」不许冒充「验出问题」**：前三种结局一律 `unknown`，而且**取消**自成一档。
 */
import { resolveProjectRoot } from './release.js';
import { webManifestRelativePath } from './web-verify.js';
export async function runReleaseVerify(input) {
    const { manifest, file, sitesFor, loadManifest, runProject, signal } = input;
    const projects = [];
    const verdicts = [];
    const problems = [];
    /** 已经有结论的项目（跑过 / 记进 `problems`）——取消之后只给**还没有结论**的补账。 */
    const handled = new Set();
    let cancelled = false;
    for (const spec of manifest.projects) {
        if (signal?.aborted === true) {
            cancelled = true;
            break;
        }
        // `root` 相对**发布清单自己所在的目录**解析：那份文件跟着发布走（见 `release.ts`）。
        const root = resolveProjectRoot(spec.root, file);
        const resolved = sitesFor(root);
        if ('problem' in resolved) {
            handled.add(spec.project);
            problems.push(`${spec.project}：读这个项目里的站点声明失败——${resolved.problem}`);
            verdicts.push('unknown');
            continue;
        }
        const target = resolved.sites.find((site) => site.id === spec.target);
        if (target === undefined) {
            handled.add(spec.project);
            const known = resolved.sites.map((site) => site.id).join(' / ') || '（一个都没有）';
            problems.push(`${spec.project}：站点 ${spec.target} 不在这个项目能用到的站点里（可用：${known}）——补站点声明，别改清单`);
            verdicts.push('unknown');
            continue;
        }
        const loaded = loadManifest(spec.project, root);
        if (loaded.kind === 'no-manifest') {
            handled.add(spec.project);
            // 路径只从 `webManifestRelativePath` 取（它是「清单住在哪」的唯一出处）
            problems.push(`${spec.project}：项目 ${root} 下没有 ${webManifestRelativePath(spec.project)}——这一面这次没有证据`);
            verdicts.push('unknown');
            continue;
        }
        if (loaded.kind === 'unreadable') {
            handled.add(spec.project);
            problems.push(`${spec.project}：${loaded.message}`);
            verdicts.push('unknown');
            continue;
        }
        if (loaded.kind === 'config-error') {
            handled.add(spec.project);
            const detail = loaded.errors.map((error) => (error.path === '' ? error.message : `${error.path}：${error.message}`)).join('；');
            problems.push(`${spec.project}：清单不成立——${detail}`);
            verdicts.push('unknown');
            continue;
        }
        const wanted = loaded.manifest.assertions.filter((assertion) => assertion.target === target.id);
        if (wanted.length === 0) {
            handled.add(spec.project);
            const declared = [...new Set(loaded.manifest.assertions.map((assertion) => assertion.target))].join(' / ') || '（没有）';
            problems.push(`${spec.project}：清单里没有给站点 ${target.id} 的断言（它声明的是：${declared}）`);
            verdicts.push('unknown');
            continue;
        }
        const run = await runProject({
            target,
            root,
            project: spec.project,
            assertions: wanted,
            ...(signal === undefined ? {} : { signal }),
        });
        handled.add(spec.project);
        projects.push(run);
        verdicts.push(run.summary.overall);
        if (run.cancelled) {
            cancelled = true;
            break;
        }
    }
    /*
     * 取消之后**还没有结论**的项目逐条补账（不是静默丢掉）：它们的判定是 `unknown`，
     * 于是整批绝不会因为「没跑到」而报 pass。
     */
    if (cancelled) {
        for (const spec of manifest.projects) {
            if (handled.has(spec.project))
                continue;
            handled.add(spec.project);
            problems.push(`${spec.project}：被调用方取消，这个项目没有跑（**不是**超时，也不是站点有问题）`);
            verdicts.push('unknown');
        }
    }
    return { release: manifest.release, projects, verdicts, problems, cancelled };
}
//# sourceMappingURL=release-run.js.map