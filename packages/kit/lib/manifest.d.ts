/**
 * 项目内**只读文本清单**的骨架（`verify/<项目>.yaml` · `web/<项目>.yaml` · `ready/<项目>.ready.yaml`）。
 *
 * ## 为什么在 `kit` 里（三包同构，第三个消费者已到）
 *
 * `devdata` 的验活断言清单、`devfront` 的前端清单、`devenv` 的就绪清单：三处都是「**项目内文本 +
 * DSH 侧只读 + 缺省即无**」，而加载骨架此前是**三份几乎逐字相同**的实现（`readFileSync` +
 * `JSON_SCHEMA` + 同一批「读不到」的区分）。2026-10-03 上收（判据与本仓 `scope` / `ssh-exec` /
 * `chrome-cdp` / `audit` 的上收同源：第三个消费者出现）。
 *
 * ## 这一层只做「读」，不做「判」
 *
 * 它不知道什么叫断言、什么叫服务、什么叫容器：**领域校验**（`version`、字段形状、跨字段约束）
 * 留在各包。这里只把「读一份清单会遇到的事」逐个分开——调用方拿到的不是一句「加载失败」，
 * 而是能映射到各自处置动作的档位：
 *
 * | 结果 | 含义 | 下一步 |
 * |---|---|---|
 * | `missing` | 文件不存在 | 「这个项目**没有**清单」——**不是**「用默认清单」（缺省即无，fail-closed） |
 * | `unreadable` | 文件在，读不了（权限 / 是目录 / 盘掉了） | 去看权限与挂载 |
 * | `malformed` | 读到了，YAML 语法错 | 去改清单（解析器那句话通常带行列） |
 * | `empty` | 读到了，但是空文件 | **「空文件」与「没有清单」是两件事**：文件在说明有人打算写 |
 * | `multiple` | 多个候选路径都读到了 | 歧义——调用方报出来，**不按顺序静默取胜** |
 * | `parsed` | 读到了，`data` 原样交回 | 各包自己校验 |
 *
 * ## 为什么是 `JSON_SCHEMA` 而不是默认 schema
 *
 * 清单是**配置数据**，不是「能求值的表达式」。默认 schema 会把 `!!js` 一类标签放进来——那等于把
 * 「断言」变成「脚本」，评审面完全不同。这条理由原来写在三个包的文件头里，现在只写一次。
 *
 * ## 为什么是子路径（`@hyzyn/dsh-kit/manifest`）
 *
 * 它 `import 'node:fs'`（还与 `js-yaml` 同进）：客户端半体会打包主入口，不能让这些进那一侧。
 */
/** 清单里的一个「指到字段」的问题（三包的领域错误都是这个形状）。 */
export interface ManifestError {
    /** 字段路径（`services[0].ready` 这种）；空串表示「不是某个字段的问题」。 */
    path: string;
    message: string;
}
/** 读一份清单的结果（**永不抛**：调用方要把每一种说给人听）。 */
export type ManifestRead = {
    kind: 'missing';
} | {
    kind: 'multiple';
    files: string[];
} | {
    kind: 'unreadable';
    file: string;
    message: string;
} | {
    kind: 'malformed';
    file: string;
    message: string;
} | {
    kind: 'empty';
    file: string;
} | {
    kind: 'parsed';
    file: string;
    data: unknown;
};
/**
 * 按顺序读候选路径里的清单（**只读**，不写、不改、不生成模板）。
 *
 * 多个候选是给「仓库根 + 子项目」这类布局用的；但**全都读到就报 `multiple`**——本仓三处的口径
 * 一致：两份清单同时存在是歧义，不该靠顺序静默决定哪一份生效。
 */
export declare function readProjectManifest(paths: readonly string[]): ManifestRead;
/** 清单文件名：`<项目><suffix>`（如 `ems.yaml` / `ems.ready.yaml`）。 */
export declare function manifestFileName(project: string, suffix: string): string;
/** 清单在项目里的相对路径：`<dir>/<项目><suffix>`（**唯一一处**，别的代码不许再拼一遍）。 */
export declare function manifestRelPath(dir: string, project: string, suffix: string): string;
/**
 * 从一批**已经列好的文件名**里挑出清单（不读目录——保持纯函数、可测）。
 *
 * @param options.suffix - 清单后缀（`.yaml` / `.ready.yaml`）。
 * @param options.prefix - 要求的目录前缀（如 `verify/`）；**不给则取 basename**——那是
 *   「调用方已经把目录列过一遍」的用法（`devenv` 的 `readdirSync(ready/)`）。
 * @returns 项目名 → 文件名的对应；不符合形态的一律忽略（含带子目录的 stem）。
 */
export declare function projectsInFiles(files: readonly string[], options: {
    suffix: string;
    prefix?: string;
}): Map<string, string>;
