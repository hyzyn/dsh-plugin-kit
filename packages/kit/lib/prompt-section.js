/**
 * @hyzyn/dsh-kit — 宿主 `systemPrompt.section()` 的**形状契约**，外加一小段运行时：
 * `registerLiteralSection()` 这个唯一注册口（固定 `interpolate: false` + 正文长度安全网）。
 *
 * ## 为什么它必须收在 kit
 *
 * 各插件原来各自手写一份内联结构类型：
 *
 * ```ts
 * let systemPromptApi: { section(options: { name: string; order?: number; text: string }): () => void } | null = null
 * ```
 *
 * 这份类型**少了 `interpolate`**，于是「把外部文本原样注入、不做变量插值」这件事在类型层面
 * 根本表达不出来：想传也传不进去（`tsc` 报 `TS2353: 'interpolate' does not exist in type`）。
 * 2026-10-19 的外部测评报告（issue #14）指出 prompt 段落的正文一旦含 `{{language}}`，
 * 宿主 `renderPrompt()` 就会抛 `unknown prompt variable`——而修法只是加一个字段，
 * 卡住的原因正是这份内联类型。十处副本、同一个洞，所以收成一份。
 *
 * ## `interpolate` 的语义（以宿主为准，别在插件侧另立口径）
 *
 * 宿主 `@deepseek-ai/dsh-system-prompt` 的 `renderPrompt()`：
 *
 * ```js
 * section.interpolate === false ? section.text : interpolate(section, assembly.variables, 'section')
 * ```
 *
 * 缺省是 **`true`**：段落文本里的 `{{name}}` 会被当成变量引用，未知变量 / 不合规写法 /
 * 没有值**一律 throw**。而这个 throw 发生在**每一步请求的组装期**——它不会让某个按钮失败，
 * 它让整个会话发不出请求（`dsh headless` 直接 exit 1）。
 *
 * 所以判据是：**只要段落的文本里可能含外部内容（用户编辑的 Prompt 正文、订阅源标题、
 * 命令输出、日志行），就必须显式写 `interpolate: false`。** 本仓所有段落都属于这一类。
 *
 * ## 为什么 `text` 允许函数
 *
 * 宿主支持 `text: string | ((context: AssembleContext) => string)`（每次组装现算）。
 * 本仓目前都用静态字符串，但类型必须与宿主一致——否则将来要改成函数时又得回来改一遍类型。
 *
 * ## 长度安全网（`maxChars` / `DEFAULT_SECTION_MAX_CHARS`）
 *
 * 段落正文拼的是**外部内容**（订阅源标题、命令输出、日志行），长度由对方决定；宿主对
 * section 长度没有任何一层会截，一个失控的段落就能把每一步请求的 systemPrompt 撑爆。
 * 所以注册口做预算：正文超过上限就**截断并告警一次**，绝不 throw——组装期抛错会让
 * 整个会话发不出请求，这正是上面 interpolate 一节吃过的亏，长度问题不拿那个待遇。
 * 4000 是运行时兜底；静态正文另有更低的**审查线**（2000，`scripts/check-prompt-sections.mjs`
 * 的 `SECTION_LITERAL_BUDGET`）：超过审查线在 CI 里红，要求「写这么长就该有人看一眼」。
 *
 * @see packages/kit/DEFECTS.md 的 `kit D15`
 */
/**
 * 段落正文的默认字符预算——**安全网，不是推荐值**。
 *
 * 超限不报错：正文被截到上限并追加截断说明，同时对该段落名 `console.warn` 一次。
 * 真写到这个量级，正确动作是给段落瘦身，或显式传 `maxChars` 调大并在代码里写明理由；
 * 这个默认值只负责「没人看管时，段落也不至于无限长」。
 */
export const DEFAULT_SECTION_MAX_CHARS = 4000;
/** 已经告警过正文超限的段落名：同名只告警一次（rss 每次刷新都重挂同一个名字，不去重会每步刷屏）。 */
const overBudgetWarned = new Set();
/**
 * 预算的执行点：超限就截断 + 追加截断说明 + 对该段落名告警一次。
 *
 * **不 throw**——段落组装期抛错会让整个会话发不出请求（见模块头 interpolate 一节），
 * 截断 + 告警让故障停在「这一段内容不完整」，会话还能继续。
 */
function enforceBudget(name, text, limit) {
    if (text.length <= limit)
        return text;
    if (!overBudgetWarned.has(name)) {
        overBudgetWarned.add(name);
        console.warn(`[registerLiteralSection] 段落 ${name} 正文 ${text.length} 字符，超过 ${limit} 字符上限，已截断；` +
            '请给这段瘦身，或显式传 maxChars 调大预算（那是安全网，不是推荐值）');
    }
    return text.slice(0, limit) + `\n…（本段超过 ${limit} 字符上限，已截断）`;
}
/**
 * 注册一个**不插值**的段落。
 *
 * 两件事收在这里，让它们各自有**唯一落点**：
 *
 * 1. `interpolate: false`——`scripts/check-prompt-sections.mjs` 认的就是这个调用
 *    （或显式 `interpolate: false` 的 `section()` 调用），不认别的写法；
 * 2. 正文长度预算——求值后超过 `maxChars ?? DEFAULT_SECTION_MAX_CHARS` 就截断并告警
 *    一次（同名只告警一次），不 throw。函数形态的 `text` 会包一层：预算判定落在
 *    **每次组装的求值结果**上，而不是函数本身。
 *
 * @param api - 宿主的 systemPrompt 服务（插件 inject 到 `systemPrompt` 后拿到）
 * @param options - 段落内容（**不要**自己传 `interpolate`，它由本函数固定；
 *   `maxChars` 是给本函数的预算指令，不会透传给宿主）
 * @returns 释放函数（撤销该段落）
 */
export function registerLiteralSection(api, options) {
    const limit = options.maxChars ?? DEFAULT_SECTION_MAX_CHARS;
    const raw = options.text;
    let budgeted;
    if (typeof raw === 'function') {
        // 函数形态每次组装现算：包一层，预算判定落在求值结果上（函数本身没有长度）。
        const compute = raw;
        budgeted = () => enforceBudget(options.name, compute(), limit);
    }
    else {
        budgeted = enforceBudget(options.name, raw, limit);
    }
    // 宿主对 order 的判据是 `Number.isFinite(section.order)`——缺省 / undefined 会直接
    // throw TypeError，与类型上的可选不符。所以调用方没给 order 时，这个键也不给。
    return api.section(options.order === undefined
        ? { name: options.name, text: budgeted, interpolate: false }
        : { name: options.name, order: options.order, text: budgeted, interpolate: false });
}
//# sourceMappingURL=prompt-section.js.map