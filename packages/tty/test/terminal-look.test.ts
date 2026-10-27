/**
 * @hyzyn/dsh-tty — 终端外观（字体栈 / 字号 / 光标 / 行高）的判据回归（0.34.0，issue #17）。
 *
 * 这几项此前是 `createTerminal` 里的硬编码值（`cursorStyle: 'bar'` / `fontSize: 13` /
 * `lineHeight: 1.35` / 内置字体栈），做成配置后**静默失效**有两个入口，本文件的用例各钉一个：
 *
 *   ① **字体栈拼错 = 填了没用**：xterm 只认合法的 `font-family`。用户栈必须排在**内置栈之前**，
 *      否则自定义字体永远轮不到；反过来内置栈必须还在，否则用户栈里没装的名字会让终端
 *      掉回浏览器默认字体（比例字体，终端对不齐）。空串是**真实意图**（回到内置栈），不能被
 *      当成「没配」而忽略。
 *   ② **配置轮询把视口顶走**：config 每轮都到一份等价快照，若判据恒真，`applyTerminalLook()`
 *      会每轮重排一遍——用户看到终端每隔几秒闪一下，翻在历史里也会被顶回底部。判据必须是
 *      「值真的变了」。
 *
 * 宿主侧的清洗（补双引号 / 去引号反斜杠尖括号 / 范围校验）在 `src/index.ts`，由
 * `test/config-roundtrip.test.ts` 钉；这里钉客户端能自证的那半边（含**老宿主 / 缺项**的形状：
 * 字段没下来时保留上一份，绝不把 `undefined` 写进 xterm 的 options）。
 */
import { describe, expect, it } from 'vitest'
import {
  TERMINAL_CURSOR_STYLES,
  TERMINAL_FONT_SIZE_MAX,
  TERMINAL_FONT_SIZE_MIN,
  TERMINAL_FONT_STACK,
  TERMINAL_LINE_HEIGHT_MAX,
  TERMINAL_LINE_HEIGHT_MIN,
  TERMINAL_LOOK_DEFAULTS,
  readTerminalLook,
  terminalFontFamilyValue,
  terminalLookChanged,
} from '../client-src/terminal-look.js'

describe('终端外观：默认值等于 0.34.0 之前的硬编码值（零回归）', () => {
  /*
   * 这一条是**升级不改变观感**的钉子：默认值只要有一项漂了，所有不配这几项的用户在
   * 升级那一刻就会看到不同的字/光标/行距，而界面上没有任何东西提示「你其实没改过」。
   */
  it('五项默认值逐项等于旧硬编码值', () => {
    expect(TERMINAL_LOOK_DEFAULTS).toEqual({
      fontFamily: '',
      fontSize: 13,
      cursorStyle: 'bar',
      cursorBlink: true,
      lineHeight: 1.35,
    })
  })

  it('内置字体栈与旧的那条 font-family 逐字相同', () => {
    // 旧值：createTerminal 里硬编码的 fontFamily（0.33 及以前）
    expect(TERMINAL_FONT_STACK).toBe('"JetBrains Mono", "SF Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace')
    expect(terminalFontFamilyValue('')).toBe(TERMINAL_FONT_STACK)
  })

  it('范围常量与宿主 schema 的 min/max 一致', () => {
    expect([TERMINAL_FONT_SIZE_MIN, TERMINAL_FONT_SIZE_MAX]).toEqual([8, 32])
    expect([TERMINAL_LINE_HEIGHT_MIN, TERMINAL_LINE_HEIGHT_MAX]).toEqual([1, 2])
    expect(TERMINAL_CURSOR_STYLES).toEqual(['bar', 'block', 'underline'])
  })
})

describe('字体栈：用户栈排在内置栈之前，内置栈永远兜底', () => {
  it('用户栈在前、内置栈在后', () => {
    expect(terminalFontFamilyValue('"MesloLGL Nerd Font Mono"')).toBe('"MesloLGL Nerd Font Mono", ' + TERMINAL_FONT_STACK)
  })

  it('空串 = 只用内置栈（不是「保持原值」）', () => {
    expect(terminalFontFamilyValue('')).toBe(TERMINAL_FONT_STACK)
    // 只有空白同样回落到内置栈：界面上把输入框清空会得到 ''
    expect(terminalFontFamilyValue('   ')).toBe(TERMINAL_FONT_STACK)
  })

  it('非字符串（老宿主 / 缺项 / 序列化坏值）一律回落内置栈', () => {
    for (const value of [undefined, null, 42, {}, [], true]) {
      expect(terminalFontFamilyValue(value), String(value)).toBe(TERMINAL_FONT_STACK)
    }
  })

  it('多个名字原样带过（宿主已逐个补过引号，这里不再二次加工）', () => {
    const custom = '"3270 Nerd Font", monospace'
    expect(terminalFontFamilyValue(custom)).toBe(custom + ', ' + TERMINAL_FONT_STACK)
  })
})

describe('新快照 → 新一份外观：非法 / 缺项逐字段保留上一份', () => {
  it('快照齐全时五项都取新值', () => {
    const next = readTerminalLook({
      terminalFontFamily: '"Meslo"',
      terminalFontSize: 15,
      terminalCursorStyle: 'block',
      terminalCursorBlink: false,
      terminalLineHeight: 1,
    })
    expect(next).toEqual({ fontFamily: '"Meslo"', fontSize: 15, cursorStyle: 'block', cursorBlink: false, lineHeight: 1 })
  })

  it('缺项（老宿主 / 字段还没回来）保留上一份，不抹回默认', () => {
    const previous = { fontFamily: '"Meslo"', fontSize: 15, cursorStyle: 'block', cursorBlink: false, lineHeight: 1.2 }
    // 只带了一项的补丁形状：其余四项必须原样保留
    expect(readTerminalLook({ terminalFontSize: 18 }, previous)).toEqual({ ...previous, fontSize: 18 })
    expect(readTerminalLook({}, previous)).toEqual(previous)
  })

  it('越界 / 类型不符的字段被丢弃（保留上一份），不是夹回边界', () => {
    const previous = { fontFamily: '', fontSize: 13, cursorStyle: 'bar', cursorBlink: true, lineHeight: 1.35 }
    const next = readTerminalLook({
      terminalFontSize: 64, // 越上界
      terminalCursorStyle: 'blink', // 未知值
      terminalCursorBlink: 'yes', // 非布尔
      terminalLineHeight: 0.5, // 越下界
      terminalFontFamily: 42, // 非字符串
    }, previous)
    expect(next).toEqual(previous)
  })

  it('边框值附近：8 / 32 整数与 1 / 2 行高可用，7.5 / 32.5 / 0.999 不可用', () => {
    expect(readTerminalLook({ terminalFontSize: 8 }).fontSize).toBe(8)
    expect(readTerminalLook({ terminalFontSize: 32 }).fontSize).toBe(32)
    expect(readTerminalLook({ terminalFontSize: 7.5 }).fontSize).toBe(13)
    expect(readTerminalLook({ terminalFontSize: 33 }).fontSize).toBe(13)
    expect(readTerminalLook({ terminalLineHeight: 1 }).lineHeight).toBe(1)
    expect(readTerminalLook({ terminalLineHeight: 2 }).lineHeight).toBe(2)
    expect(readTerminalLook({ terminalLineHeight: 0.999 }).lineHeight).toBe(1.35)
    expect(readTerminalLook({ terminalLineHeight: Number.NaN }).lineHeight).toBe(1.35)
  })

  it('不修改入参（缓存对象是被就地替换的，读写同一份会串）', () => {
    const config = { terminalFontSize: 20 }
    const previous = { fontFamily: '', fontSize: 13, cursorStyle: 'bar', cursorBlink: true, lineHeight: 1.35 }
    readTerminalLook(config, previous)
    expect(config).toEqual({ terminalFontSize: 20 })
    expect(previous).toEqual({ fontFamily: '', fontSize: 13, cursorStyle: 'bar', cursorBlink: true, lineHeight: 1.35 })
  })
})

describe('要不要重排：值没变就不动', () => {
  const base = { fontFamily: '"Meslo"', fontSize: 15, cursorStyle: 'block', cursorBlink: false, lineHeight: 1.2 }

  it('同一份外观 → 不重排（配置每轮轮询都会到一份等价快照）', () => {
    expect(terminalLookChanged(base, { ...base })).toBe(false)
    // 走一遍真实链路：同一份快照读两次，第二次必须是「没变」
    const first = readTerminalLook({ terminalFontSize: 15, terminalCursorStyle: 'block' }, base)
    const second = readTerminalLook({ terminalFontSize: 15, terminalCursorStyle: 'block' }, first)
    expect(terminalLookChanged(first, second)).toBe(false)
  })

  it('任一字段变 → 重排', () => {
    expect(terminalLookChanged(base, { ...base, fontFamily: '"Sarasa"' })).toBe(true)
    expect(terminalLookChanged(base, { ...base, fontSize: 16 })).toBe(true)
    expect(terminalLookChanged(base, { ...base, cursorStyle: 'bar' })).toBe(true)
    expect(terminalLookChanged(base, { ...base, cursorBlink: true })).toBe(true)
    expect(terminalLookChanged(base, { ...base, lineHeight: 1.35 })).toBe(true)
  })

  it('首次到达（还没有上一份）算变化，让已开的终端立刻套上配置', () => {
    expect(terminalLookChanged(undefined, base)).toBe(true)
    expect(terminalLookChanged(TERMINAL_LOOK_DEFAULTS, { ...TERMINAL_LOOK_DEFAULTS })).toBe(false)
  })
})
