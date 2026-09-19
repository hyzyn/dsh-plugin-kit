/**
 * @hyzyn/dsh-kit — Windows `.cmd` shim 启动与转义的回归测试。
 *
 * 背景：codegraph 与 mcp 两个包各自踩过同一个坑——Windows 上 CLI 常是 `.cmd` shim，
 * 裸 `spawn('codegraph')` 报 ENOENT、`spawn('…\\codegraph.cmd')` 报 EINVAL（Node 对
 * `.bat`/`.cmd` 的 CVE-2024-27980 加固），必须经 `%COMSPEC% /d /s /c` 才能跑起来。
 * 实现搬到 kit 后，这些断言就是两份消费者共同的契约。
 *
 * 转义是最敏感的一环：cmd.exe 会**重新解析**整条命令行，漏掉一个 `^` 就意味着
 * 参数里的 `&` / `|` 变成命令分隔符（注入）。断言固定的是 cross-spawn 的规则，
 * 也就是修好它的那条路径。
 */
import { spawn } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import {
  escapeArgument,
  escapeCommand,
  killProcessTree,
  portableSpawnPlan,
  spawnPortable,
  taskkillArgs,
  windowsCommandLine,
} from '../src/index.js'

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
    expect(windowsCommandLine('codegraph', ['sync', '--', 'D:\\dev\\newbi'])).toBe(
      'codegraph ^"sync^" ^"--^" ^"D:\\dev\\newbi^"',
    )
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

  it('MCP 服务器的 argv 同样被保护（mcp 的「连接测试」会原样传配置里的 args）', () => {
    expect(windowsCommandLine('codegraph.cmd', ['serve', '--mcp'])).toBe('codegraph.cmd ^"serve^" ^"--mcp^"')
    // 配置里的 args 是用户可填的，& 必须被转义
    expect(windowsCommandLine('npx.cmd', ['-y', 'pkg&calc'])).toBe('npx.cmd ^"-y^" ^"pkg^&calc^"')
  })
})

describe('taskkillArgs', () => {
  it('/T 连子孙进程一起收：shim 里真正的 CLI 是 cmd.exe 的孙进程', () => {
    expect(taskkillArgs(4321)).toEqual(['/pid', '4321', '/T', '/F'])
  })
})

describe('portableSpawnPlan（要不要套 cmd.exe）', () => {
  it('POSIX：一律直连，不碰 ComSpec', () => {
    expect(portableSpawnPlan('codegraph', ['--version'], { platform: 'linux' })).toEqual({
      file: 'codegraph',
      args: ['--version'],
    })
    expect(portableSpawnPlan('C:\\x\\codegraph.cmd', ['--version'], { platform: 'darwin' })).toEqual({
      file: 'C:\\x\\codegraph.cmd',
      args: ['--version'],
    })
  })

  it('Windows：.exe / .com 直连（CreateProcess 认得）', () => {
    expect(portableSpawnPlan('C:\\Program Files\\node\\node.exe', ['-v'], { platform: 'win32' })).toEqual({
      file: 'C:\\Program Files\\node\\node.exe',
      args: ['-v'],
    })
    expect(portableSpawnPlan('tool.com', [], { platform: 'win32' })).toEqual({ file: 'tool.com', args: [] })
  })

  it('Windows：裸命令名与 .cmd 都改走 %COMSPEC% /d /s /c（这是本模块存在的理由）', () => {
    const bare = portableSpawnPlan('codegraph', ['serve', '--mcp'], { platform: 'win32', comspec: 'C:\\WINDOWS\\system32\\cmd.exe' })
    expect(bare).toEqual({
      file: 'C:\\WINDOWS\\system32\\cmd.exe',
      args: ['/d', '/s', '/c', '"codegraph ^"serve^" ^"--mcp^""'],
      windowsVerbatimArguments: true,
    })

    const cmd = portableSpawnPlan('C:\\Users\\czz\\AppData\\Local\\codegraph\\current\\bin\\codegraph.cmd', ['--version'], {
      platform: 'win32',
      comspec: 'cmd.exe',
    })
    // 整条命令行被一对引号包住，交给 /s 剥掉最外层——与 cross-spawn 同形
    expect(cmd.file).toBe('cmd.exe')
    expect(cmd.args[3]).toBe('"C:\\Users\\czz\\AppData\\Local\\codegraph\\current\\bin\\codegraph.cmd ^"--version^""')
    expect(cmd.windowsVerbatimArguments).toBe(true)
  })

  it('Windows：不带参数的裸命令也不会漏掉最外层引号', () => {
    expect(portableSpawnPlan('codegraph', [], { platform: 'win32', comspec: 'cmd.exe' }).args[3]).toBe('"codegraph"')
  })
})

/**
 * 进程是否还活着（`kill(pid, 0)` 探活，ESRCH = 已退出）。
 */
function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/** 轮询直到两个 pid 都退出（SIGTERM 是异步的，给足宽限）。 */
async function waitForExit(...pids: number[]): Promise<void> {
  const deadline = Date.now() + 5_000
  while (Date.now() < deadline) {
    if (pids.every((pid) => !isAlive(pid))) return
    await new Promise((resolveTick) => setTimeout(resolveTick, 50))
  }
  throw new Error('进程在 5s 内没有退出: ' + pids.filter(isAlive).join(', '))
}

describe('killProcessTree（CG05：POSIX 不再是 no-op）', () => {
  it('detached 组长连同组内孙进程一起收到信号', async () => {
    if (process.platform === 'win32') return
    // 组长自己再 spawn 一个孙进程（孙进程继承组长的进程组）。
    // 以前这个函数在 POSIX 上什么都不做：超时只发了 SIGTERM，忽略它的 CLI（或它的
    // 子孙）会把全量重建跑完。现在对 -pid 整组发信号，两边都必须死。
    const leaderScript = [
      "const { spawn } = require('node:child_process')",
      "const grand = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30000)'], { stdio: 'ignore' })",
      'process.stdout.write(JSON.stringify({ grand: grand.pid }))',
      'setInterval(() => {}, 1000)',
    ].join('\n')
    const leader = spawnPortable(process.execPath, ['-e', leaderScript], { detached: true })
    const stdout: string[] = []
    leader.stdout?.on('data', (chunk: Buffer) => stdout.push(chunk.toString('utf8')))
    // 等组长把孙进程 pid 打出来（spawn 管道建立 + 子进程启动需几十毫秒）
    await new Promise<void>((resolveLine) => {
      const poll = setInterval(() => {
        if (stdout.join('').includes('{')) {
          clearInterval(poll)
          resolveLine()
        }
      }, 20)
    })
    const { grand } = JSON.parse(stdout.join('')) as { grand: number }
    expect(isAlive(leader.pid!)).toBe(true)
    expect(isAlive(grand)).toBe(true)

    await killProcessTree(leader.pid, 'SIGTERM', { group: true })
    await waitForExit(leader.pid!, grand)
  })

  it('不是组长的普通子进程：默认只单杀（group 未开时绝不打 -pid，CG36）', async () => {
    if (process.platform === 'win32') return
    const plain = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30000)'], { stdio: 'ignore' })
    expect(isAlive(plain.pid!)).toBe(true)
    await killProcessTree(plain.pid, 'SIGTERM')
    await waitForExit(plain.pid!)
  })
})
