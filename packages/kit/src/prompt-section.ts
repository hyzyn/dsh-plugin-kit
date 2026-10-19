/**
 * @hyzyn/dsh-kit — 宿主 `systemPrompt.section()` 的**形状契约**（一个类型，没有运行时）。
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
 * @see packages/kit/DEFECTS.md 的 `kit D15`
 */

/** 一个段落贡献：与宿主 `PromptSection` 的注册入参同形（只取插件会用的字段）。 */
export interface PromptSectionOptions {
  /** 段落名，全局唯一；重复注册会抛错。 */
  readonly name: string
  /** 段落顺序（升序拼接；同序按名字的 code unit 序）。 */
  readonly order?: number
  /** 段落正文；函数形态在每次组装时求值。 */
  readonly text: string | (() => string)
  /**
   * 是否对正文做 `{{variable}}` 插值。宿主缺省 `true`（严格：未知变量直接抛）。
   *
   * **本仓的段落一律写 `false`**：它们的正文都含外部内容，插值只会把外部文本里的
   * `{{...}}` 当成变量引用，进而在每一步请求上抛错、把整个会话拖死。
   */
  readonly interpolate?: boolean
}

/** 宿主 `systemPrompt` 服务在插件侧用到的那一个方法。 */
export interface PromptSectionApi {
  section(options: PromptSectionOptions): () => void
}

/**
 * 注册一个**不插值**的段落。
 *
 * 只是把 `{ ...options, interpolate: false }` 写全——收在这里是为了让「本仓段落一律不插值」
 * 这条规矩有**唯一落点**：`scripts/check-prompt-sections.mjs` 认的就是这个调用（或显式
 * `interpolate: false` 的 `section()` 调用），不认别的写法。
 *
 * @param api - 宿主的 systemPrompt 服务（插件 inject 到 `systemPrompt` 后拿到）
 * @param options - 段落内容（**不要**自己传 `interpolate`，它由本函数固定）
 * @returns 释放函数（撤销该段落）
 */
export function registerLiteralSection(
  api: PromptSectionApi,
  options: Omit<PromptSectionOptions, 'interpolate'>,
): () => void {
  return api.section({ ...options, interpolate: false })
}
