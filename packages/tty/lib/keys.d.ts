/**
 * @hyzyn/dsh-tty — `tty_send` 的具名按键表（0.23.0）。
 *
 * 为什么要有这张表：`tty_send` 的 `data` 是**原样写进 PTY 的字节**，所以驱动
 * TUI（vim / htop / 菜单 / 分页器）时 agent 得自己写转义序列——下箭头是
 * `"\u001b[B"`，而模型常写成 `"\\x1b[B"` 或 `"^[[B"`：后两种都会被当成 6 / 4 个
 * 普通字符**打印到终端里**，且 `sent` 计数一样、报错也没有（静默错输入）。
 *
 * 具名按键把这一步变成白名单查表：名字认得就发对应字节，不认得就**明确报错**
 * 并列出词表——绝不把未知名字当字面量发出去（那正是要修掉的故障形态）。
 * 单个字符（含 `:` `q` 这类）仍按字面发送，方便 vim 的 `:wq` 这种序列。
 */
/** 报错文案里的词表（与 NAMED_KEYS 同一份来源，避免两处漂移）。 */
export declare const KEY_VOCABULARY = "Enter / Tab / Shift+Tab / Esc / Backspace / Delete / Insert / Up / Down / Left / Right / Home / End / PageUp / PageDown / Space / F1~F12 / C-a~C-z\uFF0C\u6216\u5355\u4E2A\u5B57\u7B26\uFF08\u6309\u5B57\u9762\u53D1\u9001\uFF09";
/**
 * 单个按键规格 → 字节序列；不认得的名字抛错（**不**回落成字面量）。
 *
 * 认得的形态三种：具名键、`C-<字母>`（控制字符 = 码位 & 0x1f，`c-` / `ctrl-` /
 * `control-` 前缀等价）、以及**单个字符**（原样）。
 */
export declare function resolveKeySpec(spec: string): string;
/** 按键规格数组 → 按序拼接的字节序列（实现即 tty_send 的 keys 参数）。 */
export declare function resolveKeys(keys: readonly string[]): string;
