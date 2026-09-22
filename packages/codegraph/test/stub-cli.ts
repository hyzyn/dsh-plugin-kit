/**
 * 跨平台可执行的 **stub CLI** 写入器（各测试文件共用）。
 *
 * 为什么必须共享：stub CLI 是**假的可执行文件**，而「可执行」在两个平台上不是一回事——
 *
 *   - POSIX：写一个带 shebang、chmod 0o755 的 `.mjs`，`execFile` 直接跑得起来；
 *   - Windows：**没有可执行位**，`.mjs` / `.js` 也不能直接被 `spawn` 执行。要 npm / pnpm
 *     全局 bin 那种形态：一个 `.cmd` shim（`@echo off` + `node "%~dp0x.js" %*`），
 *     `dsh-kit` 的 `spawnPortable` 认得这种命令。
 *
 * 踩坑记录（v0.1.41 的 CI 实测）：只写 `.mjs` 的版本在 ubuntu / macos 全绿，
 * windows-latest 上 `cli-surface.test.ts` 10 条 + `auto-reindex.test.ts` 4 条失败，
 * 报 `SyntaxError: Unexpected end of JSON input`——子进程压根没产出（spawn 起不来），
 * 路由把空 stdout 当 JSON 解析。这个失败**只在 Windows 出现**，本机永远看不到。
 *
 * `body` 的约束：可以用下面注入的 `fs` / `path` 两个绑定，但**不能**写顶层
 * `import` / `export` —— Windows 那份是 CJS（`.js`，无 `type: module`）。
 */
import { chmodSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** 是不是 POSIX（非 Windows）。stub 的形态由它决定。 */
export const POSIX = process.platform !== 'win32'

/**
 * 在 `dir` 下写一个名为 `name` 的 stub CLI，返回**可直接作为 `command` 传给插件**的路径。
 *
 * @param dir stub 所在目录（通常是该测试文件自己的 mkdtemp 沙箱）
 * @param name 文件名（不带扩展名；Windows 会额外产出一个 `.js`）
 * @param body 脚本正文。可用 `fs` / `path`；不要写顶层 import/export（见文件头注释）
 */
export function writeStubCli(dir: string, name: string, body: string): string {
  const preamble = POSIX
    ? "import fs from 'node:fs'\nimport path from 'node:path'"
    : "const fs = require('node:fs')\nconst path = require('node:path')"
  if (!POSIX) {
    writeFileSync(join(dir, `${name}.js`), `${preamble}\n${body}\n`)
    const shim = join(dir, `${name}.cmd`)
    // 与 npm / pnpm 全局 bin 同形：`node "%~dp0<name>.js" %*`
    writeFileSync(shim, `@echo off\r\nnode "%~dp0${name}.js" %*\r\n`)
    return shim
  }
  const file = join(dir, `${name}.mjs`)
  writeFileSync(file, `#!/usr/bin/env node\n${preamble}\n${body}\n`)
  chmodSync(file, 0o755)
  return file
}
