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
/** 具名按键 → 字节序列（键名小写，查表前统一 trim + toLowerCase）。 */
const NAMED_KEYS = {
    enter: '\n',
    return: '\n',
    tab: '\t',
    'shift+tab': '\x1b[Z',
    esc: '\x1b',
    escape: '\x1b',
    backspace: '\x7f',
    delete: '\x1b[3~',
    insert: '\x1b[2~',
    up: '\x1b[A',
    down: '\x1b[B',
    right: '\x1b[C',
    left: '\x1b[D',
    home: '\x1b[H',
    end: '\x1b[F',
    pageup: '\x1b[5~',
    pagedown: '\x1b[6~',
    space: ' ',
    f1: '\x1bOP',
    f2: '\x1bOQ',
    f3: '\x1bOR',
    f4: '\x1bOS',
    f5: '\x1b[15~',
    f6: '\x1b[17~',
    f7: '\x1b[18~',
    f8: '\x1b[19~',
    f9: '\x1b[20~',
    f10: '\x1b[21~',
    f11: '\x1b[23~',
    f12: '\x1b[24~',
};
/** 报错文案里的词表（与 NAMED_KEYS 同一份来源，避免两处漂移）。 */
export const KEY_VOCABULARY = 'Enter / Tab / Shift+Tab / Esc / Backspace / Delete / Insert / Up / Down / Left / Right / Home / End / PageUp / PageDown / Space / F1~F12 / C-a~C-z，或单个字符（按字面发送）';
/**
 * 单个按键规格 → 字节序列；不认得的名字抛错（**不**回落成字面量）。
 *
 * 认得的形态三种：具名键、`C-<字母>`（控制字符 = 码位 & 0x1f，`c-` / `ctrl-` /
 * `control-` 前缀等价）、以及**单个字符**（原样）。
 */
export function resolveKeySpec(spec) {
    const raw = spec.trim();
    if (raw === '')
        throw new Error('keys 里有空字符串（要发空格请用 "Space" 或 " "）');
    const lower = raw.toLowerCase();
    const named = NAMED_KEYS[lower];
    if (named !== undefined)
        return named;
    const ctrl = /^(?:c|ctrl|control)-([a-z])$/.exec(lower);
    if (ctrl !== null)
        return String.fromCharCode(ctrl[1].charCodeAt(0) & 0x1f);
    // 单字符按字面发（vim 的 : w q 这种序列），多字符的未知名一律报错——
    // 「静默当字面量发出去」正是本表要消灭的故障形态。
    if ([...raw].length === 1)
        return raw;
    throw new Error(`未知按键名: ${raw}（可用：${KEY_VOCABULARY}）`);
}
/** 按键规格数组 → 按序拼接的字节序列（实现即 tty_send 的 keys 参数）。 */
export function resolveKeys(keys) {
    let out = '';
    for (const key of keys)
        out += resolveKeySpec(key);
    return out;
}
//# sourceMappingURL=keys.js.map