/**
 * **站点声明随项目走**：把「这个站点、这个范围、这个源」的声明放进**项目仓库**（`web/sites.yaml`），
 * 与就绪清单（`ready/`）、验活断言（`web/<项目>.yaml`）同一形态——**随项目评审、DSH 侧只读**。
 *
 * ## 与另两份清单的**关键不对称**（这条决定了这里为什么要有宿主侧开关）
 *
 * `devdata` / `devenv` 的项目清单**不需要**宿主开关：它们声明的是「用哪种方式访问那个目标」，
 * 而目标本身（host:port / 容器名）已经在 profile 里被维护者声明过了——清单**加不出**一个可达的目标。
 *
 * 本包不一样：站点就是「工具能在哪些站点上动手」，一条项目清单**能凭空多出一个目标**。
 * 所以这里有一条与另两份不同的规矩：**默认关闭**——profile 里写了 `projectSitesFile` 才去读它
 * （`enabled` 由宿主侧配置给，不由项目目录给）。否则任何能写项目目录的人都能把工具指到新站点上。
 *
 * ## 两份来源怎么合
 *
 * profile 里的 `targets` 与项目文件里的站点**并集**；**同一个 id 出现在两处 = 配置问题，报出来**
 * （不静默取一个）——与 `devdata` 的「两份清单是歧义，请只留一份」、`devenv` 的同款判据一致。
 *
 * ## 只做「读 + 合」，不做领域外的判断
 *
 * 读盘走 `@hyzyn/dsh-kit/manifest`（三包共用的清单骨架），行的校验走 `normalizeTargets`
 * （**卡片保存用的同一套判据**——两套规则必然漂）。
 */
import { join } from 'node:path';
import { readProjectManifest } from '@hyzyn/dsh-kit/manifest';
import { normalizeTargets } from './plugin.js';
/** 项目里站点声明的**缺省相对路径**（`projectSitesFile` 的推荐取值）。 */
export const PROJECT_SITES_REL = 'web/sites.yaml';
/** 把清单骨架给的问题清单拼成一句（带 `path` 时点名到字段）。 */
function describeErrors(file, errors) {
    const lines = errors.map((error) => (error.path === '' ? error.message : `${error.path}：${error.message}`));
    return `项目站点声明不成立（${file}）：\n${lines.map((line) => `- ${line}`).join('\n')}`;
}
/**
 * 读一个项目里的站点声明（**永不抛**：四种结果都是返回值）。
 *
 * @param cwd - 项目根（工具调用的 `cwd`）。
 * @param file - 相对 `cwd` 的清单路径（缺省 `web/sites.yaml`）。
 */
export function loadProjectSites(cwd, file = PROJECT_SITES_REL) {
    const full = join(cwd, file);
    const read = readProjectManifest([full]);
    if (read.kind === 'missing')
        return { kind: 'missing' };
    if (read.kind === 'multiple') {
        // 单路径调用下到不了；留着是为了「档位映射穷尽」，文案也现成。
        return { kind: 'problem', message: `找到多份项目站点声明：${read.files.join('、')}——两份清单是歧义，请只留一份` };
    }
    if (read.kind === 'unreadable')
        return { kind: 'problem', message: `读不到项目站点声明（${full}）：${read.message}` };
    if (read.kind === 'malformed')
        return { kind: 'problem', message: `项目站点声明的 YAML 语法错（${full}）：${read.message}` };
    if (read.kind === 'empty')
        return { kind: 'problem', message: `项目站点声明是空的（${full}）：要么写上站点，要么删掉它（空文件与「没有声明」是两件事）` };
    const data = read.data;
    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
        return { kind: 'problem', message: `项目站点声明必须是一个 mapping（${full}）` };
    }
    const version = data.version;
    if (version !== 1) {
        return { kind: 'problem', message: `项目站点声明的 version 必须是 1（${full} 里是 ${JSON.stringify(version)}）` };
    }
    const normalized = normalizeTargets(data.sites);
    if ('error' in normalized) {
        return { kind: 'problem', message: `项目站点声明不成立（${full}）：${normalized.error}` };
    }
    return { kind: 'ok', sites: normalized.targets };
}
/**
 * 把 profile 声明的站点与项目声明的站点合成一份可用清单。
 *
 * **同一个 id 在两处都出现 = 配置问题**（不静默取一个）：两份声明指同一个 id 却可能给出不同的
 * `url` / 范围 / 允许源，静默取一个的后果是「工具按哪份在动手」说不清。
 *
 * @returns 合并后的清单；冲突时 `problem` 说清是哪两个 id。
 */
export function mergeSites(profileSites, projectSites) {
    const seen = new Set();
    for (const site of profileSites)
        seen.add(String(site.id));
    const dup = projectSites.map((site) => String(site.id)).filter((id) => seen.has(id));
    if (dup.length > 0) {
        return {
            problem: `站点 id 在 profile 与项目声明里都出现了：${dup.join(' / ')}——两份声明是歧义，请只留一份`
                + '（profile 里的用设置卡片改，项目里的改 `web/sites.yaml`）',
        };
    }
    return { sites: [...profileSites, ...projectSites] };
}
//# sourceMappingURL=project-sites.js.map