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
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  StatsLineBuffer,
  buildRemoteStatsCommand,
  buildWindowsStatsCommand,
  countNetstatEstablished,
  countTcpEstablished,
  cleanProcName,
  cpuCoresPctBetween,
  cpuPctBetween,
  createLocalSampler,
  hasStatsData,
  parseCpuTime,
  parseDfKb,
  parseLoadavg,
  parseMeminfo,
  parseSwapMeminfo,
  parseSwapUsage,
  parseNetDev,
  parseNetstatIb,
  parseProcCpuRows,
  parseProcStat,
  parseProcStatCores,
  parseProcUptime,
  parsePsOutput,
  parseStatsLine,
  procCpuUsage,
  parseThermalTemp,
  parseVmStat,
  pickProcLeaders,
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
  'SwapTotal:       4194300 kB',
  'SwapFree:        3145725 kB',
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
  it('交换分区：/proc/meminfo 与 macOS sysctl 两种写法都解析成 bytes', () => {
    const fromProc = parseSwapMeminfo(PROC_MEMINFO)
    expect(fromProc?.total).toBe(4194300 * 1024)
    expect(fromProc?.used).toBe((4194300 - 3145725) * 1024)
    // 没有 swap 的机器：SwapTotal 为 0 —— 那是「没有这个能力」，不是「已用 0」
    expect(parseSwapMeminfo('MemTotal: 1000 kB\nSwapTotal: 0 kB\nSwapFree: 0 kB\n')).toBeNull()
    // macOS：sysctl -n vm.swapusage
    const mac = parseSwapUsage('total = 4096.00M  used = 1228.50M  free = 2867.50M  (encrypted)')
    expect(mac?.total).toBe(Math.round(4096 * 1024 ** 2))
    expect(mac?.used).toBe(Math.round(1228.5 * 1024 ** 2))
    expect(parseSwapUsage('')).toBeNull()
  })

  it('未知键丢弃、保留一位小数、整数取整', () => {
    expect(sanitizeStatsFrame({ cpuPct: 12.34, cores: 8.6, evil: 1, note: 'x' })).toEqual({ cpuPct: 12.3, cores: 9 })
  })

  it('非对象一律 null', () => {
    for (const bad of [null, undefined, 'x', 42, [], [{ cpuPct: 1 }]]) {
      expect(sanitizeStatsFrame(bad)).toBeNull()
    }
  })

  it('负载保留两位小数（loadavg 惯例），负数 / 超上限丢弃', () => {
    expect(sanitizeStatsFrame({ load1: 0.154 })).toEqual({ load1: 0.15 })
    expect(sanitizeStatsFrame({ load1: 12.34 })).toEqual({ load1: 12.34 })
    expect(sanitizeStatsFrame({ load1: -0.01 })).toEqual({})
    expect(sanitizeStatsFrame({ load1: 200_000 })).toEqual({})
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
    // 明细字段单独存在也算「有数据」：只剩每核/进程的帧照样值得发（卡片要画）
    expect(hasStatsData({ cpuCores: [1, 2] })).toBe(true)
    expect(hasStatsData({ procs: [{ pid: 1, cmd: 'node', cpuPct: 1, memPct: 1 }] })).toBe(true)
  })

  it('cpuCores：越界/非数丢弃，超长截断，空数组不上送', () => {
    expect(sanitizeStatsFrame({ cpuCores: [12.34, 200, Number.NaN, 'x', -1, 99.95] })).toEqual({ cpuCores: [12.3, 100] })
    expect(sanitizeStatsFrame({ cpuCores: [] })).toEqual({})
    expect(sanitizeStatsFrame({ cpuCores: 'x' })).toEqual({})
    const many = Array.from({ length: 300 }, () => 1)
    expect(sanitizeStatsFrame({ cpuCores: many })?.cpuCores?.length).toBe(128)
  })

  it('procs：缺字段/带控制字符/越界都按规则降级', () => {
    const frame = sanitizeStatsFrame({
      procs: [
        { pid: 12.7, cmd: 'node\n\tworker', cpuPct: 12.34, memPct: 1.26 },
        { pid: '#1', cmd: '', cpuPct: 5, memPct: 5 }, // 空命令名 → 丢
        { pid: 3, cmd: 'bad', cpuPct: 'x', memPct: 5 }, // cpu 非数 → 丢
        { pid: 4, cmd: 'clamp', cpuPct: -5, memPct: 250 },
      ],
    })
    expect(frame?.procs).toEqual([
      { pid: 13, cmd: 'node worker', cpuPct: 12.3, memPct: 1.3 },
      { pid: 4, cmd: 'clamp', cpuPct: 0, memPct: 100 },
    ])
    expect(sanitizeStatsFrame({ procs: [] })).toEqual({})
    expect(sanitizeStatsFrame({ procs: 'x' })).toEqual({})
    // 上限是「CPU 前 5 ∪ 内存前 5」= 10 条：切到 5 的话，内存榜的头部会在上送这一步被切掉
    const many = Array.from({ length: 14 }, (_item, index) => ({ pid: index + 1, cmd: 'p' + String(index), cpuPct: 1, memPct: 1 }))
    expect(sanitizeStatsFrame({ procs: many })?.procs?.length).toBe(10)
  })

  /**
   * 超长时**保留尾部**（2026-10-31）：macOS 的 comm 是完整路径，客户端取的是 basename。
   * 从头部截断会把 basename 切成 `Ecosystem.fra…` 这种既不是路径也不是文件名的片段
   * （用户报的就是这个：卡片上一排 `Framew…` / `Ma…`，认不出是哪个进程）。
   */
  it('cleanProcName：控制字符折叠成空格；超长时保留尾部（basename 不被切断）', () => {
    expect(cleanProcName('  node\u0000\u0007 /a/b  ')).toBe('node /a/b')
    expect(cleanProcName('x'.repeat(60)).length).toBe(48)
    expect(cleanProcName('x'.repeat(60)).startsWith('…')).toBe(true)
    const longPath = '/System/Library/PrivateFrameworks/Ecosystem.framework/Versions/A/Resources/Ecosystem'
    const cleaned = cleanProcName(longPath)
    expect(cleaned.endsWith('Ecosystem')).toBe(true)
    expect(cleaned.startsWith('…')).toBe(true)
    // 客户端取 basename 之后必须仍然是可执行文件名，而不是路径片段
    expect(cleaned.slice(cleaned.lastIndexOf('/') + 1)).toBe('Ecosystem')
  })
})

describe('parseProcStatCores / cpuCoresPctBetween（每核明细）', () => {
  const sample = [
    'cpu  1 2 3 4 5 6 7 8 9 10',
    'cpu0 10 0 10 80 0 0 0 0 0 0',
    'cpu1 30 0 30 40 0 0 0 0 0 0',
    'intr 1',
  ].join('\n')

  it('只取 cpuN 行，按出现顺序', () => {
    const cores = parseProcStatCores(sample)
    expect(cores.length).toBe(2)
    expect(cores[0]).toEqual({ total: 100, idle: 80 })
    expect(cores[1]).toEqual({ total: 100, idle: 40 })
  })

  it('差值：100% 忙 / 50% / 核数不一致返回 undefined', () => {
    expect(cpuCoresPctBetween([{ total: 0, idle: 0 }], [{ total: 100, idle: 0 }])).toEqual([100])
    expect(cpuCoresPctBetween([{ total: 0, idle: 0 }], [{ total: 100, idle: 50 }])).toEqual([50])
    expect(cpuCoresPctBetween([{ total: 0, idle: 0 }], [{ total: 100, idle: 50 }, { total: 1, idle: 1 }])).toBeUndefined()
    expect(cpuCoresPctBetween([], [{ total: 1, idle: 0 }])).toBeUndefined()
  })
})

describe('parsePsOutput（Top 进程）', () => {
  it('四个字段对齐，命令名里的空格整体保留', () => {
    const text = [
      '  123  42.5  1.2 node',
      '   88   3.0  0.4 /Applications/Visual Studio Code.app/Contents/MacOS/Electron',
      '',
    ].join('\n')
    const rows = parsePsOutput(text)
    expect(rows[0]).toEqual({ pid: 123, cmd: 'node', cpuPct: 42.5, memPct: 1.2 })
    // 路径里的空格整体保留（不是只取最后一列）；超长时 cleanProcName **保留尾部**，
    // 所以 basename（Electron）必须还在——这才是卡片上显示的那个名字
    expect(rows[1].pid).toBe(88)
    expect(rows[1].cpuPct).toBe(3)
    expect(rows[1].memPct).toBe(0.4)
    expect(rows[1].cmd.startsWith('…')).toBe(true)
    // 尾部的可执行文件名必须完整（卡片上显示的就是它）
    expect(rows[1].cmd.endsWith('Electron')).toBe(true)
    expect(rows[1].cmd.length).toBe(48)
  })

  it('表头/空行/非数字 pid 都跳过；limit 生效', () => {
    const text = ['  PID  %CPU  %MEM COMMAND', '  abc  1 1 x', '  1  1  1 a', '  2  2  2 b', '  3  3  3 c'].join('\n')
    expect(parsePsOutput(text, 2).map((p) => p.pid)).toEqual([1, 2])
  })

  it('括号里的命令名（内核线程）照常解析', () => {
    expect(parsePsOutput('  1  0.0  0.1 [kworker/0:1]')).toEqual([{ pid: 1, cmd: '[kworker/0:1]', cpuPct: 0, memPct: 0.1 }])
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

/**
 * 本地进程的「瞬时 CPU」（2026-10-31，用户问「为什么和活动监视器对不上」）。
 *
 * 根因不在渲染而在**口径**：macOS `ps %cpu` 是「最长一分钟的衰减平均」（man ps 原文），
 * 活动监视器是瞬时采样。所以本地路径改成：`ps` 只取**累计 CPU 时间**，两次采样做差
 * 除以墙钟 → 与活动监视器同一口径（差值窗口 = 5s 的 TTL）。
 */
describe('进程候选集（CPU 前 5 ∪ 内存前 5）', () => {
  /**
   * 用户报的「本机的内存排名取得不对」就是这个函数的起因：帧里只有 CPU 前 5，
   * 客户端切「按内存降序」时只能在那 5 条里重排，一个 1.2 GB、CPU 却只有个位数的
   * 进程（微信）根本不在候选集里，内存榜第一名于是成了某个 Chrome 辅助进程。
   */
  const rows = [
    { pid: 1, cmd: 'chrome-helper', cpuPct: 92, memPct: 2.2 },
    { pid: 2, cmd: 'dockerd', cpuPct: 88, memPct: 0.7 },
    { pid: 3, cmd: 'verge-mihomo', cpuPct: 84, memPct: 0.2 },
    { pid: 4, cmd: 'ecosystemd', cpuPct: 80, memPct: 0.1 },
    { pid: 5, cmd: 'mactop', cpuPct: 76, memPct: 0.1 },
    { pid: 6, cmd: 'WeChat', cpuPct: 1.2, memPct: 40 },
    { pid: 7, cmd: 'WindowServer', cpuPct: 0.4, memPct: 25 },
  ]

  it('内存榜的头部必须在候选集里（哪怕它的 CPU 排在第 6 名之外）', () => {
    const picked = pickProcLeaders(rows, 5)
    const pids = picked.map((proc) => proc.pid)
    expect(pids).toContain(6)
    expect(pids).toContain(7)
    // CPU 榜的头部同样都在
    expect(pids).toEqual(expect.arrayContaining([1, 2, 3, 4, 5]))
    // 去重后最多 10 条
    expect(picked.length).toBeLessThanOrEqual(10)
    expect(new Set(pids).size).toBe(pids.length)
  })

  it('两个榜单重叠时不重复（同一个 pid 只出现一次）', () => {
    const picked = pickProcLeaders([
      { pid: 1, cmd: 'a', cpuPct: 90, memPct: 30 },
      { pid: 2, cmd: 'b', cpuPct: 10, memPct: 1 },
    ], 1)
    expect(picked.map((proc) => proc.pid)).toEqual([1])
  })

  it('空输入 / top=0 都退化成空数组，不抛', () => {
    expect(pickProcLeaders([])).toEqual([])
    expect(pickProcLeaders(rows, 0)).toEqual([])
  })
})

describe('本地进程的瞬时 CPU（两次累计时间的差值）', () => {
  it('parseCpuTime：ps 的 time 列各种格式都能读成秒', () => {
    expect(parseCpuTime('00:03:21')).toBe(201)
    expect(parseCpuTime('03:21')).toBe(201)
    expect(parseCpuTime('03:21.45')).toBeCloseTo(201.45, 5)
    expect(parseCpuTime('1-02:03:04')).toBe(93784)
    expect(parseCpuTime(' 0:00.00 ')).toBe(0)
    expect(parseCpuTime('')).toBeNull()
    expect(parseCpuTime('abc')).toBeNull()
    expect(parseCpuTime('-5:00')).toBeNull()
  })

  it('parseProcCpuRows：pid / pcpu / time / pmem / comm（路径里有空格也切得对）', () => {
    const text = [
      '  431  12.4 00:03:21  4.2 /opt/homebrew/bin/node',
      ' 1022   3.4 01:02:03  7.8 /Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '  76   0.9 1-02:03:04  6.4 /usr/lib/postgres',
      'not a ps line',
      '  99   1.0 abc       1.0 /usr/bin/whatever',
    ].join('\n')
    const rows = parseProcCpuRows(text)
    expect(rows.map((row) => row.pid)).toEqual([431, 1022, 76])
    // 路径里的空格没有被切碎；超过 48 字符时保留尾部，可执行文件名完整
    expect(rows[1].cmd.startsWith('…')).toBe(true)
    expect(rows[1].cmd.endsWith('Google Chrome')).toBe(true)
    expect(rows[2].cpuTime).toBe(93784)
    // 解析不了 time 的行直接丢（宁可少一行，也不把垃圾当占用率）
    expect(rows.some((row) => row.pid === 99)).toBe(false)
  })

  it('procCpuUsage：首见用 ps 的衰减平均，第二次开始用差值（与活动监视器同口径）', () => {
    const rows = [
      { pid: 1, cpuPct: 12.4, cpuTime: 100, memPct: 1, cmd: 'a' },
      { pid: 2, cpuPct: 40, cpuTime: 50, memPct: 1, cmd: 'b' },
    ]
    const first = procCpuUsage(rows, {}, 1_000_000)
    expect(first.pct).toEqual([12.4, 40]) // 没有上一次：退回 ps 的值
    // 5 秒后：pid 1 多用了 2.5 秒 CPU → 50%；pid 2 只多 0.05 秒 → 1%
    const next = procCpuUsage(
      [
        { pid: 1, cpuPct: 12.4, cpuTime: 102.5, memPct: 1, cmd: 'a' },
        { pid: 2, cpuPct: 40, cpuTime: 50.05, memPct: 1, cmd: 'b' },
      ],
      first.state,
      1_005_000,
    )
    expect(next.pct).toEqual([50, 1])
    // 状态里只剩还活着的 pid（退出的进程不能把 map 越拖越长）
    expect(Object.keys(next.state)).toEqual(['1', '2'])
  })

  it('procs：ps 不认 time= 时退回 pcpu 老格式（进程列表不能因此整段消失）', async () => {
    // 模拟「精简版 ps」：带 time= 的那条命令整体报错（空输出），老格式照常返回
    const calls: string[] = []
    const fakeExec = async (command: string, args: string[]) => {
      calls.push(command + ' ' + args.join(' '))
      if (args.join(' ').includes('time=')) return ''
      return '  321  12.5  3.1 /usr/bin/node\n  77   4.0  1.5 /usr/bin/dockerd'
    }
    const sampler = createLocalSampler({
      platform: 'darwin',
      exec: fakeExec,
      // darwin 的第一判据是「有没有 /proc」：这里假装没有，才会真的走 ps 分支
      readFile: () => undefined,
    })
    const frame = await sampler.sample()
    expect(calls.some((call) => call.includes('time='))).toBe(true)
    expect(calls.some((call) => call.includes('pcpu='))).toBe(true)
    expect(frame.procs?.map((row) => [row.pid, row.cpuPct])).toEqual([[321, 12.5], [77, 4]])
  })

  it('procCpuUsage：计数器回退 / 间隔太短 / 新进程都退回 ps 值（不出负数、不出噪声）', () => {
    const prev = { '1': { cpuTime: 100, at: 1_000_000 } }
    // pid 复用 → 累计时间变小：不能算成负占用
    expect(procCpuUsage([{ pid: 1, cpuPct: 7, cpuTime: 10, memPct: 0, cmd: 'a' }], prev, 1_005_000).pct).toEqual([7])
    // 间隔 200ms：除出来的噪声极大，退回 ps
    expect(procCpuUsage([{ pid: 1, cpuPct: 7, cpuTime: 200, memPct: 0, cmd: 'a' }], prev, 1_000_200).pct).toEqual([7])
    // 没见过的新进程：同样退回 ps
    expect(procCpuUsage([{ pid: 2, cpuPct: 9, cpuTime: 5, memPct: 0, cmd: 'b' }], prev, 1_005_000).pct).toEqual([9])
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

  /*
   * 慢字段的拍数门（2026-10-31）：`df` 与 `ps` 都是子进程，压到每 5 拍一次；中间的帧
   * **沿用上次读数**而不是把字段丢掉（丢掉 = 状态条上「磁盘」一秒有、下一秒「无」，
   * 与 D50 里「整条消失又出现」同一个毛病）。
   *
   * 验法是把这个常驻循环真的跑起来：`/proc` 换成夹具目录、死循环改成 `tick < 6`、
   * `sleep 1` 抹掉，于是 6 拍里只有第 1、6 拍会真的跑 `df`，中间 4 拍的磁盘字段必须
   * 等于第 1 拍。谁把 `jput("diskTotal")` 挪回 `if` 里面，这条就红。
   */
  it.skipIf(!CAN_PROBE_REMOTE_SCRIPT)('远端循环：磁盘字段在非刷新拍沿用上次读数（5 拍一刷）', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-tty-proc-'))
    try {
      mkdirSync(join(dir, 'net'), { recursive: true })
      writeFileSync(join(dir, 'stat'), PROC_STAT + '\n', 'utf8')
      writeFileSync(join(dir, 'meminfo'), PROC_MEMINFO + '\n', 'utf8')
      writeFileSync(join(dir, 'net', 'dev'), PROC_NET_DEV + '\n', 'utf8')
      writeFileSync(join(dir, 'uptime'), '1000.00 4000.00\n', 'utf8')
      writeFileSync(join(dir, 'loadavg'), '0.15 0.20 0.25 2/345 6789\n', 'utf8')
      const probe = remoteStatsAwk()
        .replaceAll('/proc', dir)
        .replace('while (1) {', 'while (tick < 6) {')
        .replace('system("sleep 1")', '')
      const file = join(dir, 'loop.awk')
      writeFileSync(file, probe, 'utf8')
      const out = execFileSync('awk', ['-f', file, '/dev/null'], { encoding: 'utf8' })
      const frames = out.trim().split('\n').filter((line) => line !== '').map((line) => JSON.parse(line))
      expect(frames.length).toBe(6)
      const first = frames[0]
      expect(typeof first.diskTotal).toBe('number')
      // 1 分钟负载：远端 awk 从 /proc/loadavg 取第一个数，保留两位小数
      expect(first.load1).toBe(0.15)
      // 交换分区：与内存同一个 /proc/meminfo；SwapTotal 为 0 时整段不出现（客户端据此隐藏那格）
      expect(first.swapTotal).toBe(4194300 * 1024)
      expect(first.swapUsed).toBe((4194300 - 3145725) * 1024)
      /*
       * 只断言**沿用拍**（第 2~5 拍）：第 6 拍（tick 6）本来就该重跑 `df`（`tick % 5 == 1`）。
       * 原来这里遍历全部 6 帧、要求磁盘字段与第 1 拍逐字段相等——本机盘一秒内不变时恒过，
       * 一到 CI 上就赌运气：0.36.1 的 Release 流水就是这么红的（64606900224 → 64607076352，
       * 两次 `df` 之间盘上真写了 172 KB）。判据要落在「非刷新拍必须沿用」，而不是
       * 「整条循环磁盘永不变」。
       */
      for (const frame of frames.slice(1, 5)) {
        expect(frame.diskTotal).toBe(first.diskTotal)
        expect(frame.diskUsed).toBe(first.diskUsed)
        expect(frame.diskPct).toBe(first.diskPct)
      }
      // 第 6 拍是刷新拍：只要求字段还在（值可能已经变了，那是真实读数）
      expect(typeof frames[5].diskTotal).toBe('number')
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

describe('远端 Top 进程（pslist 的候选集）', () => {
  /**
   * 用户报的「本机的内存排名取得不对」在远端路径是同一个根因：`ps --sort=-pcpu` 只给出
   * CPU 顺序，旧实现顺着它取前 5 条就收工，于是「按内存降序」只能在这 5 条里重排——
   * 一个 40% 内存、CPU 只有 1.2% 的进程永远进不来。这里用假 `ps` 直接跑 awk 里的 pslist。
   */
  it.skipIf(!CAN_PROBE_REMOTE_SCRIPT)('CPU 前 5 与内存前 5 的并集都会发给客户端', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-tty-ps-'))
    try {
      const fake = join(dir, 'ps')
      // 只回 -eo 那一路：真实远端会先试它，成功就不会退到 ps aux。
      // 106/107 是「内存高、CPU 低」的两条——它们排在 CPU 第 6、7 名之外。
      writeFileSync(fake, [
        '#!/bin/sh',
        'printf "%s\\n" \\',
        '  "  101 92.0 0.3 node" \\',
        '  "  102 88.0 0.2 dockerd" \\',
        '  "  103 84.0 0.1 vim" \\',
        '  "  104 80.0 0.1 top" \\',
        '  "  105 76.0 0.1 ps" \\',
        '  "  106  1.2 40.0 WeChat" \\',
        '  "  107  0.4 25.0 WindowServer"',
        '',
      ].join('\n'), 'utf8')
      chmodSync(fake, 0o755)
      const source = remoteStatsAwk()
      const probe = [
        awkFunction(source, 'jesc'),
        awkFunction(source, 'psread'),
        awkFunction(source, 'pslist'),
        'BEGIN { print pslist() }',
      ].join('\n')
      const file = join(dir, 'probe.awk')
      writeFileSync(file, probe, 'utf8')
      const out = execFileSync('awk', ['-f', file, '/dev/null'], {
        encoding: 'utf8',
        env: { ...process.env, PATH: dir + ':' + String(process.env.PATH ?? '') },
      }).trim()
      const pids = [...out.matchAll(/"pid":(\d+)/g)].map((match) => Number(match[1]))
      expect(pids).toContain(106)
      expect(pids).toContain(107)
      expect(pids).toEqual(expect.arrayContaining([101, 102, 103, 104, 105]))
      expect(pids.length).toBeLessThanOrEqual(10)
      expect(new Set(pids).size).toBe(pids.length)
      expect(out).toContain('"cmd":"WeChat"')
      // 数值照抄 ps 的两列，别在并集逻辑里被改写
      expect(out).toContain('"cpuPct":1.2,"memPct":40.0')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

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
  /*
   * 1 分钟负载（2026-11-01）：Linux 走 `/proc/loadavg`；Windows 上 `os.loadavg()` 恒返回
   * `[0,0,0]`——那不是「负载 0」，所以显式不给这个字段（状态条显示「无」而不是 0.00）。
   */
  it('1 分钟负载：Linux 读 /proc/loadavg，Windows 显式省略', async () => {
    const linux = createLocalSampler({
      platform: 'linux',
      exec: async () => '',
      readFile: (path) => (path === '/proc/loadavg' ? '0.42 0.30 0.10 1/100 1234\n' : undefined),
    })
    expect((await linux.sample()).load1).toBe(0.42)
    const win = createLocalSampler({ platform: 'win32', exec: async () => '', readFile: () => undefined })
    expect((await win.sample()).load1).toBeUndefined()
  })

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

  /*
   * D50 回归（用户报「整条状态条瞬间消失又出现」）：宿主侧某个采集子进程一慢，帧间隔就
   * 从 1s 拉长——实测那台 macOS 上 `netstat -ib` 要 30s（缺 `-n` 会做地址反查，DNS 不响应
   * 就一直等），被 3s 超时砍掉后每次采样都卡满 3s、每秒的 tick 被 busy 守卫跳过，帧变成
   * **每 4 秒**一帧；前端「3s 没新帧就整条收起」的窗口正好卡在中间 → 状态条每 4 秒消失出现。
   * 下面两条钉住宿主侧的两处修法：macOS 的网速命令必须带 `-n`；慢命令只能让自己那一格
   * 变旧，不能拖散出帧节奏。
   */
  const DARWIN_FIXTURES: Record<string, string> = {
    'netstat -ibn': 'Name  Mtu   Network       Address            Ipkts Ierrs     Ibytes    Opkts Oerrs     Obytes  Coll\nlo0   16384 <Link#1>                 100     0        500       100     0        500     0\nen0   1500  <Link#5>  aa:bb:cc:dd:ee:ff  200 0     900000     150     0     300000 0\n',
    'netstat -an -p tcp': 'tcp4       0      0  127.0.0.1.5432     127.0.0.1.51000  ESTABLISHED\ntcp4       0      0  10.0.0.5.22        10.0.0.9.60001   ESTABLISHED\n',
    'df -kP /': 'Filesystem 1024-blocks      Used Available Capacity Mounted on\n/dev/disk3s1s1   971350180 13312000 900000000      2%   /\n',
    'vm_stat': 'Mach Virtual Memory Statistics: (page size of 16384 bytes)\nPages active:                                2048.\nPages wired down:                            1024.\nPages occupied by compressor:                 512.\n',
  }

  it('【D50】macOS 网速走 netstat -ibn（不带 -n 会反查地址、DNS 不响应时挂 30s）', async () => {
    const calls: string[] = []
    const exec = (command: string, args: string[]): Promise<string> => {
      const key = command + ' ' + args.join(' ')
      calls.push(key)
      return Promise.resolve(DARWIN_FIXTURES[key] ?? '')
    }
    // readFile 返回 undefined = 这台机器上「没有 /proc」（darwin 的真实形状）。
    // 不注入它，用例在 Linux 上会先命中 /proc 分支、根本不 exec —— ubuntu CI 首次就红在这。
    const sampler = createLocalSampler({ platform: 'darwin', exec, readFile: () => undefined })
    const frame = await sampler.sample()
    expect(calls).toContain('netstat -ibn')
    expect(calls).not.toContain('netstat -ib') // 不带 -n 的那次调用绝不能再出现
    expect(frame.diskTotal).toBeGreaterThan(0) // 首帧仍然完整
    expect(frame.tcpConns).toBe(2)
    expect(frame.memUsed).toBeGreaterThan(0)
  })

  it('Linux 形状（/proc 在）不碰 netstat：可注入的 readFile 只影响「有没有 /proc」，不改平台判定', async () => {
    const calls: string[] = []
    const proc: Record<string, string> = {
      '/proc/stat': 'cpu  100 0 100 800 0 0 0 0 0 0\ncpu0 100 0 100 800 0 0 0 0 0 0\n',
      '/proc/meminfo': 'MemTotal: 1000000 kB\nMemAvailable: 400000 kB\n',
      '/proc/net/dev': 'Inter-|   Receive                                                |  Transmit\n face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo colls carrier compressed\n  en0: 1000 10 0 0 0 0 0 0 2000 20 0 0 0 0 0 0\n',
      '/proc/net/tcp': '  sl  local_address rem_address   st\n   0: 0100007F:1F90 00000000:0000 0A\n   1: 0100007F:1F90 0100007F:C350 01\n',
      '/proc/uptime': '12345.67 999.0\n',
    }
    const sampler = createLocalSampler({
      platform: 'linux',
      readFile: (path) => proc[path],
      exec: (command, args) => {
        calls.push(command + ' ' + args.join(' '))
        return Promise.resolve(DARWIN_FIXTURES[command + ' ' + args.join(' ')] ?? '')
      },
    })
    const frame = await sampler.sample()
    expect(calls.some((call) => call.startsWith('netstat'))).toBe(false)
    expect(frame.uptimeSec).toBe(12345)
    expect(frame.tcpConns).toBe(1)
  })

  it('【D50】某个子进程很慢时不再拖住出帧：后台刷新，帧照样秒回（用上一帧的值）', async () => {
    let slow = false
    const exec = (command: string, args: string[]): Promise<string> => {
      const key = command + ' ' + args.join(' ')
      const text = DARWIN_FIXTURES[key] ?? ''
      // 网速命令变慢：拿真实机器那种「要等几秒」来演
      if (key === 'netstat -ibn' && slow) return new Promise((resolve) => setTimeout(() => resolve(text), 600))
      return Promise.resolve(text)
    }
    const sampler = createLocalSampler({ platform: 'darwin', exec, readFile: () => undefined })
    await sampler.sample() // 冷启动：这一次允许等（首帧要完整）

    slow = true
    await new Promise((resolve) => setTimeout(resolve, 1100)) // 越过 900ms 结果 memo
    const started = Date.now()
    const frame = await sampler.sample()
    expect(Date.now() - started).toBeLessThan(150) // 慢命令不再被 await
    expect(hasStatsData(frame)).toBe(true) // 而且这一帧照常有数据（CPU/内存/磁盘/在线）
  })
})
