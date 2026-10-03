/**
 * 验活断言库：**清单结构 + 加载校验**（`docs/devdata-plan.md` §3.9）。
 *
 * ## 这一层解决什么
 *
 * §0 的存在理由之一是「核对发布后的业务数据」。那一环不能靠人每次现编 SQL——那样它不可积累、
 * 不可复审、也不能被 agent 自动执行。落法是把它**断言化**：断言写在**项目仓库**里
 * （`verify/<project>.yaml`），随项目一起评审、一起演进；DSH 侧**只读**。
 *
 * ## 两条判据没收进来会怎样（本模块存在的理由）
 *
 * 1. **缺省即无**：项目没有 `verify/<project>.yaml` → 这个项目**没有断言**，不是「用默认断言」。
 *    回落默认断言等于用别的项目的话去核对这个项目的数据，且**看起来是绿的**——最坏的一种错。
 * 2. **判据必须在加载时抓**：清单是配置，配置错误（操作符写错、正则不合法、断言重复 id、
 *    语句是写操作）**不该等到跑的时候才表现为一条 fail**。它既不是「数据不对」也不是「业务异常」，
 *    而是「这份清单写错了」——混在一起会让 agent 去查数据，方向就错了。
 *
 * ## 与 SQL 层的关系：注入而不是硬依赖
 *
 * 注入而不是硬依赖：语句判据由调用方传进来，默认实现是 `sql.ts` 的 `classifySql` 套一层。
 * 这样本模块可以独立测「清单校验」这件事，而 SQL 粒度的判据仍然只有一处真源。
 *
 * 依据：`docs/devdata-plan.md` §3.9（四条设计约束）、§2 的部署机制分类、`jenkins-release` 技能的 §4 噪声口径。
 */
/** 部署机制：决定「该验什么」。与 `jenkins-release` 技能的分类一致。 */
export type AppliesTo = 'backend' | 'front' | 'build-only';
/** 全部部署机制。 */
export declare const APPLIES_TO: readonly AppliesTo[];
/** 断言的严重度：`fail` 让这次核对失败，`warn` 只记下来（用于已知噪声）。 */
export type Severity = 'fail' | 'warn';
/** 全部严重度。 */
export declare const SEVERITIES: readonly Severity[];
/** 期望算子。全部可**同时**给出，语义是 AND。 */
export declare const EXPECT_OPERATORS: readonly ["eq", "regex", "gte", "lte", "rowCount"];
/** 期望算子名。 */
export type ExpectOperator = (typeof EXPECT_OPERATORS)[number];
/**
 * 一条期望。
 *
 * 多个算子同时给出时是**合取**（AND）——不是「按优先级取第一命中」。
 * 理由：断言写成了「`eq` 也写、`gte` 也写」时，作者想要的是两者都成立；
 * 取第一命中会让后写的那个**静默失效**，而它看起来是配好的。
 */
export interface VerifyExpect {
    /** 取出的那个值必须与它**严格相等**（比的是值，不是行数；行数用 `rowCount`）。 */
    eq?: unknown;
    /** 取出的值必须匹配这个正则（字符串）。 */
    regex?: string;
    /** 取出的值 ≥ 它（数字）。 */
    gte?: number;
    /** 取出的值 ≤ 它（数字）。 */
    lte?: number;
    /** 返回行数。**与 `eq` 的区别**：`eq` 比的是取出的那个值，`rowCount` 比的是结果集有几行。 */
    rowCount?: number;
    /**
     * 比哪个列。缺省取**第 1 列**。
     *
     * 为什么要显式声明而不是「自动找唯一列」：自动推断在 `SELECT count(*)` 上恰好能用，
     * 在 `SELECT a, b FROM t` 上会静默取错列，而两种查询在清单里长得一样。
     */
    column?: string;
}
/** 一条验活断言。 */
export interface VerifyAssertion {
    /** 稳定 id（报告里用它点名）。 */
    id: string;
    /**
     * 项目名（`cdqas` / `ems` / `cdc` / `hcckc` / `tcml` / `bpa` / `jasper` …）。
     *
     * 由**文件名**决定，不在清单里写第二遍；清单里的 `project` 字段若与文件名不一致就是配置错误
     * （防复制粘贴改漏，那会让断言跑到**别的项目**上去）。
     */
    project: string;
    appliesTo: AppliesTo;
    /** `DevDataTarget.id`。 */
    target: string;
    /** 只读语句（**加载时过语句判据**，写语句一律拒）。 */
    statement: string;
    expect: VerifyExpect;
    severity: Severity;
    timeoutMs?: number;
    /** 已知噪声说明（照 `jenkins-release` 技能 §4 的口径）。 */
    note?: string;
}
/** 一份清单。 */
export interface VerifyManifest {
    version: number;
    project: string;
    assertions: readonly VerifyAssertion[];
}
/** 清单加载结果。三种「读不到」刻意分开——它们的处置完全不同。 */
export type ManifestLoad = 
/** 项目内没有清单：**无断言**（fail-closed，不回落默认断言）。这是正常状态。 */
{
    kind: 'no-manifest';
    project: string;
}
/** 文件在，但读不进来 / YAML 语法错。 */
 | {
    kind: 'unreadable';
    project: string;
    message: string;
}
/** 读进来了，但清单本身写错了（**配置问题，不是数据问题**）。 */
 | {
    kind: 'config-error';
    project: string;
    errors: readonly VerifyConfigError[];
}
/** 通过。 */
 | {
    kind: 'ok';
    manifest: VerifyManifest;
};
/** 一条配置错误。`path` 指到具体字段，让人与 agent 都不用猜。 */
export interface VerifyConfigError {
    /** JSON 风格路径，如 `assertions[2].expect.regex`。 */
    path: string;
    message: string;
}
/**
 * 语句判据：返回 `undefined` = 放行；返回字符串 = 拒绝原因（给人看的一句话）。
 *
 * 默认实现走 `sql.ts` 的 `classifySql`，所以写语句 / 多语句 / 未闭合 都会在**加载时**被拦下。
 * 注入是为了让清单校验可以独立测，而不是为了允许别的判据（真源仍只有一处）。
 */
export type StatementClassifier = (statement: string) => string | undefined;
/**
 * 默认语句判据：**复用 §3.6 的全套 SQL 判据**。
 *
 * 关键在「复用」而不是「再写一份」：断言库**不新增任何写能力**（§3.9 约束 1），
 * 它只是 §3.2 那个只读档的消费者。写一份自己的语句检查就是造第二个真相源——
 * 而两个真相源漂开的方向会是「断言库这一份更松」。
 */
export declare const classifyAssertionStatement: StatementClassifier;
/**
 * 校验一份已解析的清单。
 *
 * **一次报全部错误**而不是遇到第一个就停：清单是给人改的，一条一条试错很贵。
 *
 * @param project - 项目名（由文件名推出；清单里的 `project` 必须与它一致）
 * @param data - YAML 解析出来的原始值
 * @param classify - 语句判据（默认 `classifyAssertionStatement`）
 */
export declare function validateManifest(project: string, data: unknown, classify?: StatementClassifier): {
    ok: true;
    manifest: VerifyManifest;
} | {
    ok: false;
    errors: VerifyConfigError[];
};
/**
 * 清单的文件名（**唯一一处**）：`verify/<project>.yaml`。
 *
 * 只认 `.yaml` 不认 `.yml`：一份清单两个可能的文件名会让「有没有清单」这件事有两种答案，
 * 而「缺省即无」是这一层的安全判据——歧义在这里的代价是静默地无断言。
 */
export declare function manifestFileName(project: string): string;
/** 清单在项目里的相对路径：`verify/<project>.yaml`。 */
export declare function manifestRelativePath(project: string): string;
/**
 * 扫一遍「哪些项目真的有清单」。
 *
 * 输入是**已经列好的文件名**（不读目录——本模块不做 I/O，保持可测）。
 * 返回项目名 → 文件名的对应；非 `verify/<project>.yaml` 的文件一律忽略。
 *
 * 实现在 `@hyzyn/dsh-kit/manifest`（与 `devfront` / `devenv` 同一份）；这里只是把本包的
 * 目录与后缀绑上。
 */
export declare function projectsWithManifest(files: readonly string[]): Map<string, string>;
/** 加载选项。 */
export interface LoadManifestOptions {
    /**
     * 找清单的根目录（按顺序找，第一个命中的生效）。
     *
     * 缺省 `['.']`（当前工作目录）。给多级是为了「仓库根 + 子项目」这种布局；
     * 但**第一个命中的就生效**——两份清单同时存在是歧义，不该靠顺序静默决定。
     * 所以找到一份之后再发现另一份会报 `unreadable`（当成配置冲突，不是覆盖）。
     */
    roots?: readonly string[];
    /** 语句判据（默认真源：`classifyAssertionStatement`）。 */
    classify?: StatementClassifier;
}
/**
 * 从项目里读一份清单（**只读**，不写、不改、不生成模板）。
 *
 * 三种「读不到」刻意分开（见 `ManifestLoad`）：它们的处置完全不同。
 *
 * YAML 用 `JSON_SCHEMA`：清单是**配置数据**，不是「能求值的表达式」。
 * 默认 schema 会把 `!!js` 一类标签放进来——那等于把「断言」变成「脚本」，评审面完全不同。
 */
export declare function loadManifest(project: string, options?: LoadManifestOptions): ManifestLoad;
