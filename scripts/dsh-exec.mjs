/**
 * 「怎么把 dsh 跑起来」——一个可测的小模块，只干这一件事。
 *
 * ## 为什么不是一个路径了事
 *
 * 两个平台都踩过：
 *
 * - **Windows（真机实测）**：`where dsh` 的第一条是 npm 全局 shim 里的**无扩展名 POSIX
 *   shell 脚本**（`…\dsh-nodes\v22.23.3\dsh`），`spawn` 它直接 `ENOENT`——`live-host-smoke`
 *   第一次在 Windows 上跑就死在这一步。第二条 `dsh.cmd` 才是能跑的，可 `.cmd` **只能经
 *   shell 启动**（Node 不带 `shell` 时拒跑批处理），而 `shell: true` 会把我们传的
 *   `link:C:\含 空格的路径\packages\tty` 交给 cmd 再解析一遍——路径里一个空格就散架。
 * - 所以这里解析出**真正的 JS 入口**（`…/@deepseek-ai/dsh/lib/bin.js`），用**当前这个 node**
 *   跑它：两个平台同一条路径，不经过任何 shell，参数也就不会二次解析。
 *
 * ## 为什么单独成文件
 *
 * Windows 分支在 macOS / ubuntu 上**天然跑不到**（CI 里也没有 Windows + npm 全局 dsh 的组合），
 * 所以把 platform 与「去哪找 dsh」都做成可注入的，让 `scripts/test/dsh-exec.test.ts` 在任何
 * 平台上都能把那条分支跑一遍——真机挖出来的缺陷，至少要有一条能在 CI 上红的用例守着。
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

/**
 * 从 npm 的 `.cmd`（或 posix）shim 里解析出**真正的 JS 入口**。
 *
 * 两条路：先按 npm 全局布局猜（shim 与 `node_modules/` 同级），再退到读 shim 内容里那段
 * `"%dp0%\node_modules\@deepseek-ai\dsh\lib\bin.js"`（`%dp0%` 就是 shim 所在目录）。
 * `%dp0%` 也可能以 `%~dp0` 出现。
 *
 * @param shim - shim 文件路径。
 * @returns 存在的 `lib/bin.js` 绝对路径；解析不出来时 `null`。
 */
export function resolveDshEntryFromShim(shim) {
  const direct = path.join(path.dirname(shim), 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
  if (fs.existsSync(direct)) return direct
  try {
    const match = /["']?([^"'\r\n]*lib[\\/]bin\.js)["']?/.exec(fs.readFileSync(shim, 'utf8'))
    if (match === null) return null
    // `%dp0%`（batch 的两个 `%` 都是语法的一部分，不是分隔符）/ `%~dp0`，后面可能跟一个分隔符
    const raw = match[1].replace(/%~?dp0%?[\\/]?/gi, '').trim()
    /*
     * shim 里写的是 Windows 路径（反斜杠）。先归一分隔符再 resolve：否则在 POSIX 上
     * （单测就是跑在 POSIX 上的）整串会被当成**一个文件名**，解析结果永远不存在，
     * 而这条退路就再也没被任何用例走过。
     */
    const resolved = path.resolve(path.dirname(shim), raw.replaceAll('\\', '/'))
    return fs.existsSync(resolved) ? resolved : null
  } catch {
    return null
  }
}

/** `where` / `which` 的输出按行拆开，去掉空行与 Windows 的 CR。 */
function defaultLocate(command) {
  try {
    return execFileSync(command, ['dsh'], { encoding: 'utf8' })
      .split('\n').map((line) => line.trim()).filter((line) => line !== '')
  } catch {
    return []
  }
}

/**
 * 找到 dsh 的**启动方式**。
 *
 * @param options.explicit - `--dsh <path>` 指定的路径（给了就不再搜索；不存在则返回 `null`）。
 * @param options.platform - 注入平台（默认 `process.platform`；测试用它跑 Windows 分支）。
 * @param options.nodePath - 用来跑 JS 入口的 node（默认 `process.execPath`）。
 * @param options.locate - 返回候选 shim 路径的函数（默认 `where` / `which dsh`）。
 * @returns `{ binary, argv0, label }` 或 `null`（没装 / 找不到）。
 */
export function findDsh(options = {}) {
  const {
    explicit,
    platform = process.platform,
    nodePath = process.execPath,
    locate = () => defaultLocate(platform === 'win32' ? 'where' : 'which'),
  } = options

  /** 把候选 shim 变成「怎么跑它」：Windows 上必须解析出 JS 入口。 */
  const descriptor = (found) => {
    if (platform !== 'win32') return { binary: found, argv0: [], label: found }
    const entry = resolveDshEntryFromShim(found)
    if (entry !== null) return { binary: nodePath, argv0: [entry], label: found }
    // 真 `.exe`（非 npm shim 的安装方式）可以直接跑；无扩展名的 shim 则不行
    return /\.exe$/i.test(found) ? { binary: found, argv0: [], label: found } : null
  }

  if (explicit !== undefined) {
    if (!fs.existsSync(explicit)) return null
    return descriptor(explicit)
  }
  const found = locate().filter((candidate) => candidate !== '' && fs.existsSync(candidate))
  // Windows 上优先 `.cmd` / `.exe`：无扩展名那条是 POSIX shell 脚本，拿来 spawn 只会 ENOENT
  const ordered = platform === 'win32'
    ? [...found.filter((line) => /\.(cmd|exe|bat)$/i.test(line)), ...found]
    : found
  for (const candidate of ordered) {
    const made = descriptor(candidate)
    if (made !== null) return made
  }
  return null
}
