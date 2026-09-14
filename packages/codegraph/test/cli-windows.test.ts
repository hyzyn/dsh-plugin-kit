/**
 * @hyzyn/dsh-codegraph — Windows 下经 cmd.exe 调用 CLI shim 的回归测试。
 *
 * 背景：npm / pnpm 全局安装的 CLI 在 Windows 上只有 `.cmd` shim，`execFile`
 * 默认 `shell: false` 时既不匹配 `.cmd`、Node 又拒绝执行它，于是每次都失败成
 * `spawn codegraph ENOENT`——卡片整块不可用，而原有的路由测试在 Windows 上
 * 整体跳过，CI 又是 ubuntu，所以这条路径此前完全没有覆盖。
 *
 * 这里只测**转义规则**（纯字符串函数，任何平台都能跑），不 spawn 任何进程：
 * 命令行最终由 cmd.exe 重新解析，转义错了要么丢参数、要么让 `?name=` 里的
 * `&` / `|` 变成命令分隔符。真机行为由 scripts/verify-sync.mjs 之外的手工
 * 验证覆盖，见 PR 说明。
 */
import { describe, expect, it } from 'vitest'
import { escapeArgument, escapeCommand, windowsCommandLine } from '../src/index.js'

describe('escapeCommand', () => {
  it('裸命令名原样保留', () => {
    expect(escapeCommand('codegraph')).toBe('codegraph')
  })

  it('带空格的路径用 ^ 保护（否则 cmd 会在空格处切开命令名）', () => {
    expect(escapeCommand('C:\\Program Files\\nodejs\\codegraph.cmd')).toBe('C:\\Program^ Files\\nodejs\\codegraph.cmd')
  })

  it('命令名里的 & | < > % 一并转义', () => {
    expect(escapeCommand('a&b')).toBe('a^&b')
    expect(escapeCommand('a|b')).toBe('a^|b')
    expect(escapeCommand('a<b>c')).toBe('a^<b^>c')
    expect(escapeCommand('100%')).toBe('100^%')
  })
})

describe('escapeArgument', () => {
  it('总是包成一对引号，元字符逐个 ^ 转义（引号本身也被转义）', () => {
    expect(escapeArgument('sync')).toBe('^"sync^"')
    expect(escapeArgument('--')).toBe('^"--^"')
  })

  it('普通 Windows 路径原样保留在引号里', () => {
    expect(escapeArgument('D:\\dev\\newbi')).toBe('^"D:\\dev\\newbi^"')
  })

  it('含空格的路径整体被引号保护', () => {
    expect(escapeArgument('D:\\my projects\\new bi')).toBe('^"D:\\my^ projects\\new^ bi^"')
  })

  it('shell 元字符被转义，注入不会成立', () => {
    // 若漏掉 & 的转义，cmd 会把 `a&calc` 拆成两条命令
    expect(escapeArgument('a&b')).toBe('^"a^&b^"')
    expect(escapeArgument('a|b')).toBe('^"a^|b^"')
    expect(escapeArgument('a<b>c')).toBe('^"a^<b^>c^"')
    expect(escapeArgument('a!b')).toBe('^"a^!b^"')
  })

  it('%VAR% 不会在 cmd 里被展开', () => {
    expect(escapeArgument('100%done%PATH%')).toBe('^"100^%done^%PATH^%^"')
  })

  it('紧邻双引号的反斜杠双写，结尾反斜杠也双写', () => {
    // Windows argv 规则：2n 个反斜杠 + " 表示 n 个反斜杠并切换引号状态，
    // 所以原样保留反斜杠必须先双写，否则引号会被吃掉。注意参数内部的双引号
    // 同样要被 ^ 转义（它由 cmd 还原成字面引号，再交给子进程解析 argv）。
    expect(escapeArgument('a\\"b')).toBe('^"a\\\\\\^"b^"')
    expect(escapeArgument('C:\\dir\\')).toBe('^"C:\\dir\\\\^"')
  })

  it('空参数保留成一对引号（不吞参数位）', () => {
    expect(escapeArgument('')).toBe('^"^"')
  })

  it('非 ASCII 原样保留', () => {
    expect(escapeArgument('函数 名称')).toBe('^"函数^ 名称^"')
  })
})

describe('windowsCommandLine', () => {
  it('拼出 sync 的完整命令行', () => {
    expect(windowsCommandLine('codegraph', syncArgsForTest())).toBe('codegraph ^"sync^" ^"--^" ^"D:\\dev\\newbi^"')
  })

  it('带 --force 的 index 命令行里 --force 仍在 -- 之前', () => {
    expect(windowsCommandLine('codegraph', ['index', '--force', '--', 'D:\\dev\\newbi'])).toBe(
      'codegraph ^"index^" ^"--force^" ^"--^" ^"D:\\dev\\newbi^"',
    )
  })

  it('命令名与参数各自的转义互不干扰', () => {
    expect(windowsCommandLine('C:\\Program Files\\cg\\codegraph.cmd', ['query', 'a&b'])).toBe(
      'C:\\Program^ Files\\cg\\codegraph.cmd ^"query^" ^"a^&b^"',
    )
  })
})

/** 与 syncArgs 保持一致，这里内联一份避免测试依赖被测函数的同一处实现。 */
function syncArgsForTest(): string[] {
  return ['sync', '--', 'D:\\dev\\newbi']
}
