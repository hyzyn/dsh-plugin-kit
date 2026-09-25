/**
 * Windows 上启动「只有 `.cmd` / `.ps1` / 无扩展名 shim」的外部命令。
 *
 * 背景（两个包各自踩过同一个坑，所以搬到这里只留一份实现）：
 *
 * npm / pnpm / 独立安装器在 Windows 上给出的 CLI 往往**没有真正的 `.exe`**
 * （codegraph 就是如此：`…\codegraph\current\bin\codegraph.cmd`）。而 `spawn` /
 * `execFile` 默认 `shell: false`，走的是 CreateProcess 式的可执行文件查找：
 *   - 裸命令名 `codegraph` 解析不到 `.cmd`，报 `spawn codegraph ENOENT`；
 *   - 写绝对路径 `…\codegraph.cmd`，Node 又因 CVE-2024-27980 加固**拒绝**在无
 *     shell 时执行 `.bat` / `.cmd`，报 `spawn … EINVAL`。
 *
 * 解法是把命令行交给 `%COMSPEC% /d /s /c`，由 cmd.exe 按 PATHEXT 解析出 shim。
 * 这正是 cross-spawn（MCP 官方 SDK 的 stdio transport 用的就是它，DSH 核心的
 * `@deepseek-ai/dsh-mcp-client` 因此不受影响）在 Windows 上的做法。本模块不引
 * 依赖，只搬运那条转义规则。
 *
 * ⚠️ 因为 cmd.exe 会**重新解析整条命令行**，argv 必须自己转义——否则参数里的
 * `&` / `|` / `%` 会被当成命令分隔符，变成命令注入。凡是外部可控的字符串
 * （符号名、路径、配置里的 args）都要走 `spawnPortable`，别自己拼命令行。
 */

import { spawn } from 'node:child_process'
import type { ChildProcess, StdioOptions } from 'node:child_process'
import { promisify } from 'node:util'

/** Windows 上判定「无需 shell」的可执行后缀：这两个交给 CreateProcess 就行。 */
export const WINDOWS_EXECUTABLE_REGEXP = /\.(?:exe|com)$/i

/** cmd.exe 元字符：交给 shell 前逐个 `^` 转义。 */
const CMD_META_CHARS_REGEXP = /([()\][%!^"`<>&|;, *?])/g

/** 命令名按 cmd.exe 规则转义（空格也是元字符，所以带空格的路径由 `^ ` 保护）。 */
export function escapeCommand(command: string): string {
  return command.replace(CMD_META_CHARS_REGEXP, '^$1')
}

/**
 * 单个参数按 cmd.exe 规则转义成 `"..."`。算法同 cross-spawn，依据
 * <https://qntm.org/cmd>：先按 Windows argv 规则双写「紧邻双引号的反斜杠」
 * 与「结尾反斜杠」，再整体加引号，最后把包括这对引号在内的元字符逐个 `^`。
 * 两层的次序不能换：`^` 由 cmd.exe 吃掉，引号留给子进程的 argv 解析。
 */
export function escapeArgument(value: string): string {
  let arg = value
  arg = arg.replace(/(?=(\\+?)?)\1"/g, '$1$1\\"')
  arg = arg.replace(/(?=(\\+?)?)\1$/, '$1$1')
  arg = `"${arg}"`
  return arg.replace(CMD_META_CHARS_REGEXP, '^$1')
}

/** 把一个 argv 拼成 `cmd.exe /d /s /c` 能直接执行的一整条命令行。 */
export function windowsCommandLine(command: string, args: string[]): string {
  return [escapeCommand(command), ...args.map(escapeArgument)].join(' ')
}

/** 一次 spawn 的最终形状：交给哪个文件、argc 是什么、要不要 verbatim。 */
export interface SpawnPlan {
  file: string
  args: string[]
  windowsVerbatimArguments?: boolean
}

/**
 * 纯函数：决定「直接 spawn」还是「经 `%COMSPEC% /d /s /c`」。
 *
 * 抽成纯函数是为了能在任何平台上断言这条分支（Windows 的真机行为在 CI 上跑不到，
 * 而这里的分支选错就等于命令注入或必然 ENOENT）。
 */
export function portableSpawnPlan(
  command: string,
  args: string[],
  options: { platform?: NodeJS.Platform; comspec?: string } = {},
): SpawnPlan {
  const platform = options.platform ?? process.platform
  if (platform !== 'win32' || WINDOWS_EXECUTABLE_REGEXP.test(command)) {
    return { file: command, args }
  }
  const comspec = options.comspec ?? process.env.ComSpec ?? 'cmd.exe'
  // 命令行已经自己转义好了，让 Node 原样交给 CreateProcess，别再包一层引号。
  return { file: comspec, args: ['/d', '/s', '/c', `"${windowsCommandLine(command, args)}"`], windowsVerbatimArguments: true }
}

export interface PortableSpawnOptions {
  cwd?: string
  env?: NodeJS.ProcessEnv
  windowsHide?: boolean
  stdio?: StdioOptions
  /**
   * POSIX 上让子进程成为**进程组长**（detached: true）：killProcessTree 对 -pid
   * 发信号时收的是「它 + 它拉起的所有子孙」。不加的话子进程跟宿主同组，-pid 要么
   * ESRCH、要么误伤宿主所在组——POSIX 的整树收杀完全依赖这一位（codegraph
   * DEFECTS CG05）。Windows 忽略此选项（那边走 taskkill /T，语义等价）。
   */
  detached?: boolean
}

/**
 * 跨平台启动一个外部命令：非 Windows、或命令本身是 `.exe` / `.com` 时直连，
 * 其余 Windows 情形经 cmd.exe shim。参数转义由本模块负责，调用方只管传 argv。
 */
export function spawnPortable(command: string, args: string[], options: PortableSpawnOptions = {}): ChildProcess {
  const plan = portableSpawnPlan(command, args)
  return spawn(plan.file, plan.args, {
    cwd: options.cwd,
    env: options.env,
    windowsHide: options.windowsHide ?? true,
    stdio: options.stdio ?? ['pipe', 'pipe', 'pipe'],
    ...(options.detached === true && process.platform !== 'win32' ? { detached: true } : {}),
    ...(plan.windowsVerbatimArguments === true ? { windowsVerbatimArguments: true } : {}),
  })
}

/**
 * Windows 上连子孙进程一起收：`taskkill /T` 杀掉以该 pid 为根的整棵树。
 *
 * 为什么不能只 `child.kill()`：shim 分支的直接子进程是 cmd.exe，真正的 CLI 是它的
 * **孙**进程；`execFile` 的 `timeout` 与 `child.kill()` 都只作用于直接子进程，大仓库的
 * `codegraph index` 会继续跑完（十几分钟起），卡片却已经报超时。POSIX 分支见
 * killProcessTree：对 -pid（进程组）发信号，前提是子进程经 spawnPortable 的
 * detached 启动。
 */
export function taskkillArgs(pid: number): string[] {
  return ['/pid', String(pid), '/T', '/F']
}

/** killProcessTree 的选项。 */
export interface KillTreeOptions {
  /**
   * 是否对**进程组**（-pid）发信号（codegraph CG36）。只有目标确实是经
   * `spawnPortable({ detached: true })` 启动的组长时才开：对普通子进程打 -pid，
   * 正常情况只是 ESRCH（被吞掉后仍有单杀兜底），但在「子进程已退出且 pid 被复用为
   * 另一个组长」的窄窗口里会误杀无辜。默认关——调用方（如 dsh-mcp 的连接测试）
   * 的子进程不是组长，语义与本函数收敛进 kit 之前一致。
   */
  group?: boolean
}

/**
 * 结束一个可能带子孙进程的进程树（默认 SIGTERM；调用方可升级为 SIGKILL）。
 *
 * - Windows：`taskkill /T /F`。
 * - POSIX：默认只杀直接子进程；`{ group: true }` 时对 `-pid`（以该 pid 为组长的
 *   进程组）发信号——直接子进程必须是经 spawnPortable({ detached: true }) 启动的
 *   组长，组里才有它的子孙。以前本函数在非 Windows 是**什么都不做的 no-op**，
 *   execFile 超时后的 CLI 会无视一次性的 SIGTERM 继续跑完整个全量重建
 *   （codegraph DEFECTS CG05）；引入进程组击杀后又因 codegraph CG36 收窄成显式 opt-in。
 *
 * 返回的 Promise 在信号发出后 resolve，不等待进程真正退出（close 事件负责收尾）。
 */
export async function killProcessTree(
  pid: number | undefined,
  signal: NodeJS.Signals = 'SIGTERM',
  options: KillTreeOptions = {},
): Promise<void> {
  if (pid === undefined) return
  if (process.platform === 'win32') {
    try {
      // 刻意用动态 import + 调用时才取 execFile：kit 的包入口是 barrel，任何消费者
      // （含只做部分 mock 的测试）都会在 import 期求值本模块。把 `node:child_process`
      // 的取值推到真正要 taskkill 的那一刻，才不会让「只是 import 了 kit」也去碰它。
      const { execFile } = await import('node:child_process')
      await promisify(execFile)('taskkill', taskkillArgs(pid), { windowsHide: true })
    } catch {
      /* 进程已经退出、或 taskkill 不可用：忽略，调用方的超时错误照常抛出 */
    }
    return
  }
  if (options.group === true) {
    for (const target of [-pid, pid]) {
      try {
        process.kill(target, signal)
      } catch {
        /* 组不存在（ESRCH）或已退出：回落的那一枪再试 */
      }
    }
    return
  }
  try {
    process.kill(pid, signal)
  } catch {
    /* 已退出 */
  }
}

/**
 * 结束一个可能带子孙进程的子进程：Windows 上先 `taskkill /T` 收树，再兜底 `kill`。
 * 返回的 Promise 在树被收掉（或判定无需收树）后 resolve，不会抛。
 */
export async function terminateChild(child: ChildProcess): Promise<void> {
  await killProcessTree(child.pid)
  try {
    child.kill('SIGKILL')
  } catch {
    /* 已经退出 */
  }
}
