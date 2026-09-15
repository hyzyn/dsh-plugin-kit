/**
 * @hyzyn/dsh-tty — 服务器状态条的解析器与采集脚本回归测试。
 *
 * 覆盖两类东西：
 *   1. /proc、df、netstat 文本 → 帧字段（纯函数，样本文本直接断言）；
 *   2. 远端采集脚本的"可执行性"能测到哪一步：shSingleQuote 往返（引号无损）、
 *      sh -n 语法检查、awk 主体语法自检（把死循环换成 if(0) 后跑一遍）。
 *      真正的 /proc 取值只能在 Linux 真机上验证——本机（macOS）没有 /proc，
 *      脚本会在第一行守卫处退出，这是刻意的降级路径。
 *
 * 平台边界：第 2 类校验需要 POSIX 的 sh / awk，而且脚本里全是 `$z/temp` 这种 POSIX
 * 路径语义。Windows runner 上 `/bin/sh` 解析成 `C:\bin\sh`（ENOENT），Git Bash 自带的
 * awk 又会把 `-v base=C:\Users\…` 当普通字符串，probe 恒返回 -1——被测对象是**远端
 * Linux 上的脚本**，本地没有可用的 POSIX 解释器就无从校验，因此这些用例显式跳过，
 * 而不是假装通过。
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  StatsLineBuffer,
  buildRemoteStatsCommand,
  buildWindowsStatsCommand,
  countNetstatEstablished,
  countTcpEstablished,
  cpuPctBetween,
  createLocalSampler,
  hasStatsData,
  parseDfKb,
  parseLoadavg,
  parseMeminfo,
  parseNetDev,
  parseNetstatIb,
  parseProcStat,
  parseProcUptime,
  parseStatsLine,
  parseThermalTemp,
  parseVmStat,
  remoteStatsAwk,
  remoteStatsScript,
  remoteWindowsStatsScript,
  sanitizeStatsFrame,
} from '../src/stats.js'

/** 探测某个 POSIX 工具能否真的跑起来（Windows 上 sh/awk 的路径语义不成立，见文件头）。 */
function canRun(bin: string, args: string[]): boolean {
  try {
    execFileSync(bin, args, { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

/** 远端采集脚本的本地校验前提：POSIX 平台 + 真的能跑 sh / awk。 */
const CAN_PROBE_REMOTE_SCRIPT = process.platform !== 'win32'
  && canRun('/bin/sh', ['-c', 'exit 0'])
  && canRun('awk', ['BEGIN{exit 0}'])


const PROC_STAT = [
  'cpu  10132153 290696 3084719 46828483 16683 0 25195 0 0 0',
  'cpu0 1393280 32966 375359 5953950 2153 0 2258 0 0 0',
  'cpu1 1333400 32966 375359 5953950 2153 0 2258 0 0 0',
  'cpu2 1333400 32966 375359 5953950 2153 0 2258 0 0 0',
  'cpu3 1333400 32966 375359 5953950 2153 0 2258 0 0 0',
  'intr 123456 0 0',
  'ctxt 999',
].join('\n')

const PROC_MEMINFO = [
  'MemTotal:       16269628 kB',
  'MemFree:         1032400 kB',
  'MemAvailable:    9045120 kB',
  'Buffers:          123456 kB',
  'Cached:          5000000 kB',
].join('\n')

const PROC_NET_DEV = [
  'Inter-|   Receive                                                |  Transmit',
  ' face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo colls carrier compressed',
  '    lo: 1000 10 0 0 0 0 0 0 1000 10 0 0 0 0 0 0',
  '  eth0: 5000 40 0 0 0 0 0 0 7000 50 0 0 0 0 0 0',
  'docker0: 100 1 0 0 0 0 0 0 200 2 0 0 0 0 0 0',
].join('\n')

const PROC_NET_TCP = [
  '  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode',
  '   0: 0100007F:1F90 00000000:0000 0A 00000000:00000000 00:00000000 00000000  1000        0 12345 1 0000000000000000 100 0 0 10 0',
  '   1: 0100007F:1F90 0100007F:8A2C 01 00000000:00000000 00:00000000 00000000  1000        0 12346 1 0000000000000000 20 4 30 10 -1',
  '   2: 0100007F:1F91 0100007F:8A2D 01 00000000:00000000 00:00000000 00000000  1000        0 12347 1 0000000000000000 20 4 30 10 -1',
].join('\n')

/** 真机 macOS 15 的 netstat -ib 片段：lo0 无 Address，en0 有 MAC（字段数不同）。 */
const NETSTAT_IB = [
  'Name       Mtu   Network       Address            Ipkts Ierrs     Ibytes    Opkts Oerrs     Obytes  Coll',
  'lo0        16384 <Link#1>                      151086822     0 65298402594 151086822     0 65298402594     0',
  'lo0        16384 127           localhost       151086822     - 65298402594 151086822     - 65298402594     -',
  'en0        1500  <Link#7>    a4:83:e7:11:22:33 137315126     0 113764011474 109793909     0 71187395262     0',
  'gif0*      1280  <Link#2>                             0     0          0        0     0          0     0',
].join('\n')

describe('parseProcStat / cpuPctBetween', () => {
  it('聚合行与 cpuN 行：核心数、累计 total、idle(含 iowait)', () => {
    const counters = parseProcStat(PROC_STAT)
    expect(counters).not.toBeNull()
    expect(counters?.cores).toBe(4)
    expect(counters?.total).toBe(10132153 + 290696 + 3084719 + 46828483 + 16683 + 25195)
    expect(counters?.idle).toBe(46828483 + 16683)
  })

  it('没有 cpu 行 → null（远端没有 /proc 时的降级）', () => {
    expect(parseProcStat('intr 1 2 3\nctxt 4\n')).toBeNull()
    expect(parseProcStat('')).toBeNull()
  })

  it('差值换算：一半时间在跑 = 50%', () => {
    const prev = { total: 1000, idle: 800, cores: 2 }
    const next = { total: 1100, idle: 850, cores: 2 }
    expect(cpuPctBetween(prev, next)).toBe(50)
  })

  it('窗口无效（无变化 / 计数器回绕）→ undefined', () => {
    const base = { total: 1000, idle: 800, cores: 2 }
    expect(cpuPctBetween(base, { total: 1000, idle: 800, cores: 2 })).toBeUndefined()
    expect(cpuPctBetween(base, { total: 900, idle: 700, cores: 2 })).toBeUndefined()
  })
})

describe('parseMeminfo', () => {
  it('优先 MemAvailable，字节换算与百分比', () => {
    const mem = parseMeminfo(PROC_MEMINFO)
    expect(mem?.total).toBe(16269628 * 1024)
    expect(mem?.used).toBe((16269628 - 9045120) * 1024)
    expect(mem?.pct).toBeCloseTo(44.4, 2)
  })

  it('没有 MemAvailable 时用 Free+Buffers+Cached 近似', () => {
    const mem = parseMeminfo('MemTotal: 1000 kB\nMemFree: 200 kB\nBuffers: 100 kB\nCached: 100 kB\n')
    expect(mem?.used).toBe(600 * 1024)
    expect(mem?.pct).toBe(60)
  })

  it('没有 MemTotal → null', () => {
    expect(parseMeminfo('MemFree: 1 kB\n')).toBeNull()
  })
})

describe('parseNetDev', () => {
  it('排除 lo，累加各接口收发字节', () => {
    expect(parseNetDev(PROC_NET_DEV)).toEqual({ rx: 5100, tx: 7200 })
  })

  it('空文本/只有表头 → 0（速率随后按差值算）', () => {
    expect(parseNetDev('')).toEqual({ rx: 0, tx: 0 })
    expect(parseNetDev('Inter-|   Receive\n face |bytes')).toEqual({ rx: 0, tx: 0 })
  })
})

describe('parseLoadavg / parseProcUptime / countTcpEstablished', () => {
  it('loadavg 三个窗口；缺字段回填 load1', () => {
    expect(parseLoadavg('1.20 0.80 0.50 2/345 12345')).toEqual({ load1: 1.2, load5: 0.8, load15: 0.5 })
    expect(parseLoadavg('0.42')).toEqual({ load1: 0.42, load5: 0.42, load15: 0.42 })
    expect(parseLoadavg('')).toBeNull()
  })

  it('uptime 取整；非法/负数 → null', () => {
    expect(parseProcUptime('123456.78 987654.32')).toBe(123456)
    expect(parseProcUptime('')).toBeNull()
  })

  it('established 只数状态码 01，表头跳过', () => {
    expect(countTcpEstablished(PROC_NET_TCP)).toBe(2)
    expect(countTcpEstablished('')).toBe(0)
  })
})

describe('parseDfKb', () => {
  it('Linux df -kP：取数据行，千字节 → 字节', () => {
    const text = 'Filesystem     1024-blocks      Used Available Capacity Mounted on\n/dev/sda1       41020640  25678912  13256960      67% /\n'
    const disk = parseDfKb(text)
    expect(disk?.total).toBe(41020640 * 1024)
    expect(disk?.used).toBe(25678912 * 1024)
    expect(disk?.pct).toBeCloseTo(62.6, 1)
  })

  it('macOS df -kP（挂载点带空格也是最后一列）', () => {
    const text = 'Filesystem     1024-blocks      Used Available Capacity  Mounted on\n/dev/disk3s1s1   971350180  14160820 220076868     7%    /\n'
    expect(parseDfKb(text)?.used).toBe(14160820 * 1024)
  })

  it('不可解析（空/表头/容量为 0）→ null', () => {
    expect(parseDfKb('')).toBeNull()
    expect(parseDfKb('Filesystem 1024-blocks Used Available Capacity Mounted on\n')).toBeNull()
    expect(parseDfKb('/dev/x 0 0 0 0% /\n')).toBeNull()
  })
})

describe('parseNetstatIb / countNetstatEstablished（macOS 分支）', () => {
  it('排除 lo0，只取 <Link#> 行，Address 有无都不影响', () => {
    expect(parseNetstatIb(NETSTAT_IB)).toEqual({ rx: 113764011474, tx: 71187395262 })
  })

  it('established 计数', () => {
    const text = [
      'Active Internet connections (including servers)',
      'Proto Recv-Q Send-Q  Local Address          Foreign Address        (state)',
      'tcp4       0      0  192.168.0.1.52344      1.2.3.4.443            ESTABLISHED',
      'tcp4       0      0  127.0.0.1.5432         127.0.0.1.52000        ESTABLISHED',
      'tcp6       0      0  *.22                   *.*                    LISTEN',
    ].join('\n')
    expect(countNetstatEstablished(text)).toBe(2)
  })
})

describe('parseThermalTemp', () => {
  it('毫摄氏度与摄氏度都收，0/越界/非法丢弃', () => {
    expect(parseThermalTemp('45000')).toBe(45)
    expect(parseThermalTemp('45000\n')).toBe(45)
    expect(parseThermalTemp('45')).toBe(45)
    expect(parseThermalTemp('0')).toBeUndefined()
    expect(parseThermalTemp('abc')).toBeUndefined()
    expect(parseThermalTemp('999999')).toBeUndefined()
  })
})

describe('parseVmStat（macOS 内存口径）', () => {
  /** 真机 macOS 15 的 vm_stat 片段（含 compressor 行）。 */
  const VM_STAT = [
    'Mach Virtual Memory Statistics: (page size of 16384 bytes)',
    'Pages free:                               10405.',
    'Pages active:                            621420.',
    'Pages inactive:                          615118.',
    'Pages speculative:                         5414.',
    'Pages throttled:                              0.',
    'Pages wired down:                        242926.',
    'Pages purgeable:                          19045.',
    '"Translation faults":               23137369451.',
    'File-backed pages:                       447914.',
    'Anonymous pages:                         793658.',
    'Pages stored in compressor:             1114133.',
    'Pages occupied by compressor:            279353.',
  ].join('\n')

  it('页大小 + 各页数（active/wired/compressed）', () => {
    const vm = parseVmStat(VM_STAT)
    expect(vm?.pageSize).toBe(16384)
    expect(vm?.active).toBe(621420)
    expect(vm?.wired).toBe(242926)
    expect(vm?.compressed).toBe(279353)
    expect(vm?.free).toBe(10405)
  })

  it('已用 ≈ active + wired + compressed（而非 os.freemem 的 99%）', () => {
    const vm = parseVmStat(VM_STAT)
    expect(vm).not.toBeNull()
    const usedGb = ((vm!.active + vm!.wired + vm!.compressed) * vm!.pageSize) / 1024 ** 3
    expect(usedGb).toBeGreaterThan(15)
    expect(usedGb).toBeLessThan(20)
  })

  it('缺表头 / 无活动页 → null', () => {
    expect(parseVmStat('Pages active: 1.')).toBeNull()
    expect(parseVmStat('Mach Virtual Memory Statistics: (page size of 16384 bytes)')).toBeNull()
  })
})

describe('sanitizeStatsFrame（帧清洗）', () => {
  it('未知键丢弃、保留一位小数、整数取整', () => {
    expect(sanitizeStatsFrame({ cpuPct: 12.34, cores: 8.6, evil: 1, note: 'x' })).toEqual({ cpuPct: 12.3, cores: 9 })
  })

  it('非对象一律 null', () => {
    for (const bad of [null, undefined, 'x', 42, [], [{ cpuPct: 1 }]]) {
      expect(sanitizeStatsFrame(bad)).toBeNull()
    }
  })

  it('越界与非法类型丢弃（NaN/Infinity/负数/超上限）', () => {
    expect(sanitizeStatsFrame({ cpuPct: 150 })).toEqual({})
    expect(sanitizeStatsFrame({ cpuPct: -1 })).toEqual({})
    expect(sanitizeStatsFrame({ cpuPct: Number.NaN })).toEqual({})
    expect(sanitizeStatsFrame({ cpuPct: Number.POSITIVE_INFINITY })).toEqual({})
    expect(sanitizeStatsFrame({ tcpConns: -1 })).toEqual({})
    expect(sanitizeStatsFrame({ memTotal: 2 ** 51 })).toEqual({})
    expect(sanitizeStatsFrame({ tempC: -300 })).toEqual({})
    expect(sanitizeStatsFrame({ cpuPct: '6' })).toEqual({})
    expect(sanitizeStatsFrame({ cpuPct: 0 })).toEqual({ cpuPct: 0 })
  })

  it('hasStatsData：空帧不算数据（不触发发帧）', () => {
    expect(hasStatsData({})).toBe(false)
    expect(hasStatsData({ cpuPct: 0 })).toBe(true)
  })
})

describe('StatsLineBuffer / parseStatsLine', () => {
  it('跨 chunk 拼行，残包留到下一次', () => {
    const buffer = new StatsLineBuffer()
    expect(buffer.push('{"cpuPct":1}\n{"cpuPct":2}\n{"cpu')).toEqual(['{"cpuPct":1}', '{"cpuPct":2}'])
    expect(buffer.push('Pct":3}\n')).toEqual(['{"cpuPct":3}'])
  })

  it('超限（一直不吐换行）丢弃而不是无限增长', () => {
    const buffer = new StatsLineBuffer()
    expect(buffer.push('x'.repeat(70 * 1024))).toEqual([])
    expect(buffer.push('{"ok":1}\n')).toEqual(['{"ok":1}'])
  })

  it('一行 → 帧；垃圾/空对象/非对象跳过', () => {
    expect(parseStatsLine('{"cpuPct": 12.34, "cores": 8}')).toEqual({ cpuPct: 12.3, cores: 8 })
    expect(parseStatsLine('not json')).toBeNull()
    expect(parseStatsLine('{}')).toBeNull()
    expect(parseStatsLine('[1,2]')).toBeNull()
    expect(parseStatsLine('')).toBeNull()
  })
})

describe('远端采集脚本 / 命令拼接', () => {
  it.skipIf(!CAN_PROBE_REMOTE_SCRIPT)('脚本是 POSIX sh 可解析的（sh -n）', () => {
    const script = remoteStatsScript()
    expect(script).toContain('[ -r /proc/stat ] || exit 0')
    expect(script).toContain('exec awk -v tempf="$tempf" ')
    // 刻意不出现参数展开语法：否则单引号整体包裹的前提就不成立
    expect(script).not.toContain('$' + '{')
    execFileSync('/bin/sh', ['-n', '-c', script])
  })

  it.skipIf(!CAN_PROBE_REMOTE_SCRIPT)('awk 主体语法自检：死循环换成 if(0) 后能跑完', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-tty-stats-'))
    try {
      const file = join(dir, 'probe.awk')
      writeFileSync(file, remoteStatsAwk().replace('while (1) {', 'if (0) {'), 'utf8')
      execFileSync('awk', ['-f', file, '/dev/null'])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it.skipIf(!CAN_PROBE_REMOTE_SCRIPT)('buildRemoteStatsCommand：sh -c 包裹 + 引号往返无损', () => {
    const command = buildRemoteStatsCommand()
    expect(command.startsWith('sh -c ')).toBe(true)
    // 让真实 sh 解析这段单引号（与 exec channel 上远端 shell 做的事完全一致），
    // 回显出来必须与未转义原文逐字节相同
    const quoted = command.slice('sh -c '.length)
    const printed = execFileSync('/bin/sh', ['-c', 'printf %s ' + quoted], { encoding: 'utf8' })
    expect(printed).toBe(remoteStatsScript())
  })
})

/* ------------------------------------------------------------------ *
 * 远端 TCP 计数：把 awk 函数抠出来，喂真实形状的 /proc 样本
 * ------------------------------------------------------------------ */

/**
 * 从远端 awk 主体里抠出一个函数定义（本文件里函数体以行首的 } 结束）。
 * 为什么要抠而不是整脚本跑：整脚本读的是绝对路径 /proc/*，本机（macOS）没有 /proc，
 * 只有把 tcpest 的 base 参数指向夹具目录，才能在任意平台上跑到真实逻辑。
 */
function awkFunction(source: string, name: string): string {
  const match = new RegExp('function ' + name + '\\([\\s\\S]*?\\n\\}').exec(source)
  if (match === null) throw new Error('未找到 awk 函数 ' + name)
  return match[0]
}

/** 把 awkFunction 抠出的片段组成一个可执行探针（调 fn(base) 并打印结果）。 */
function runAwkProbe(fn: string, base: string): string {
  const source = remoteStatsAwk()
  const probe = [awkFunction(source, 'slurp'), awkFunction(source, fn), 'BEGIN { print ' + fn + '(base) }'].join('\n')
  const dir = mkdtempSync(join(tmpdir(), 'dsh-tty-awk-'))
  try {
    const file = join(dir, 'probe.awk')
    writeFileSync(file, probe, 'utf8')
    return execFileSync('awk', ['-v', 'base=' + base, '-f', file, '/dev/null'], { encoding: 'utf8' }).trim()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe('远端 TCP 计数（tcpest + /proc 夹具）', () => {
  it.skipIf(!CAN_PROBE_REMOTE_SCRIPT)('established 只数状态码 01，且行首空白不能把状态列挤走', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-tty-tcp-'))
    try {
      mkdirSync(join(dir, 'net'), { recursive: true })
      // 形状照抄真实 /proc/net/tcp：sl 列右对齐（行首有空格），状态码在第 4 列。
      // 这条用例正是为了守住踩过的坑——之前用显式正则切分没去行首空白，状态码滑到第 5 列，
      // 计数恒为 0（远端 TCP 一直显示 0，其余指标都正常）。
      const header = '  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode'
      const row = (sl: string, local: string, rem: string, st: string, inode: string): string =>
        sl + ': ' + local + ' ' + rem + ' ' + st + ' 00000000:00000000 00:00000000 00000000     0        0 ' + inode + ' 1 0000000000000000 100 0 0 10 0'
      writeFileSync(join(dir, 'net/tcp'), [
        header,
        row('   0', '0100007F:1F90', '00000000:0000', '0A', '11'),   // LISTEN
        row('   1', '0100007F:9C4C', '0100007F:1F90', '01', '12'),   // ESTABLISHED
        row('   2', '0A000005:9C4D', 'C0A80001:01BB', '01', '13'),   // ESTABLISHED
        row('   3', '0100007F:9C4E', '0100007F:1F90', '06', '14'),   // TIME_WAIT
      ].join('\n') + '\n', 'utf8')
      writeFileSync(join(dir, 'net/tcp6'), [
        header,
        row('   0', '00000000000000000000000001000000:1F90', '00000000000000000000000000000000:0000', '0A', '21'),
        row('   1', '00000000000000000000000001000000:9C4F', '00000000000000000000000001000000:1F90', '01', '22'),
      ].join('\n') + '\n', 'utf8')
      expect(runAwkProbe('tcpest', dir)).toBe('3')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it.skipIf(!CAN_PROBE_REMOTE_SCRIPT)('两份 /proc 文件都读不到 → -1（调用方省略字段，而不是报 0）', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-tty-tcp-empty-'))
    try {
      expect(runAwkProbe('tcpest', dir)).toBe('-1')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('Windows 远端分支（PowerShell）', () => {
  it('-EncodedCommand 递送：base64(UTF-16LE) 往返与脚本逐字节一致', () => {
    const command = buildWindowsStatsCommand()
    expect(command.startsWith('powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand ')).toBe(true)
    const encoded = command.slice(command.lastIndexOf(' ') + 1)
    expect(Buffer.from(encoded, 'base64').toString('utf16le')).toBe(remoteWindowsStatsScript())
  })

  it('命令总长留在 cmd.exe 的 8191 上限内（sshd 还会套一层 cmd /c …）', () => {
    expect(buildWindowsStatsCommand().length).toBeLessThan(7000)
  })

  it('只用随系统自带的能力，且不含反引号与参数展开', () => {
    const script = remoteWindowsStatsScript()
    for (const token of [
      'Get-CimInstance Win32_OperatingSystem',
      'Win32_Processor',
      'Win32_LogicalDisk',
      'Get-NetAdapterStatistics',
      'netstat -an',
      'Select-String',
      'Stopwatch',
      '[Console]::Out.Flush()',
    ]) {
      expect(script).toContain(token)
    }
    // 反引号是 PowerShell 的转义符、美元花括号是参数展开——命令行里都容易出事，刻意不用
    expect(script.includes(String.fromCharCode(96))).toBe(false)
    expect(script).not.toContain('$' + '{')
    // ConvertTo-Json 会把大整数写成科学计数法、小数受区域影响，坚决不用
    expect(script).not.toContain('ConvertTo-Json')
  })

  it('Windows 帧（纯整数 + 大字节值）走同一套清洗', () => {
    const line = '{"cores":8,"memTotal":17179869184,"memUsed":9663676416,"memPct":56,"uptimeSec":1837592,"cpuPct":23,"diskTotal":511000000000,"diskUsed":302000000000,"diskPct":59,"tcpConns":142,"rxRate":655360,"txRate":131072}'
    expect(parseStatsLine(line)).toEqual({
      cores: 8, memTotal: 17179869184, memUsed: 9663676416, memPct: 56, uptimeSec: 1837592,
      cpuPct: 23, diskTotal: 511000000000, diskUsed: 302000000000, diskPct: 59, tcpConns: 142,
      rxRate: 655360, txRate: 131072,
    })
  })
})

describe('createLocalSampler（本机 best-effort）', () => {
  it('内存/核心数/uptime 必有，速率在第二次采样后出现', async () => {
    const sampler = createLocalSampler()
    const first = await sampler.sample()
    expect(hasStatsData(first)).toBe(true)
    expect(first.cores).toBeGreaterThan(0)
    expect(first.memTotal).toBeGreaterThan(0)
    expect(first.memUsed).toBeGreaterThan(0)
    expect(first.uptimeSec).toBeGreaterThan(0)
    expect(first.memPct === undefined || (first.memPct >= 0 && first.memPct <= 100)).toBe(true)
    expect(first.memUsed).toBeLessThanOrEqual(first.memTotal)

    // 越过 900ms 结果 memo，拿到新的差值窗口（速率类字段只在两次采样之间成立）
    await new Promise((resolve) => setTimeout(resolve, 1100))
    const second = await sampler.sample()
    expect(second.memTotal).toBe(first.memTotal)
    for (const key of ['diskTotal', 'diskUsed', 'rxRate', 'txRate', 'tcpConns', 'tempC'] as const) {
      const value = second[key]
      if (value !== undefined) expect(Number.isFinite(value)).toBe(true)
      if (value !== undefined) expect(value).toBeGreaterThanOrEqual(0)
    }
  }, 15000)
})
