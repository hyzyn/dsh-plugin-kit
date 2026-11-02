/**
 * @hyzyn/dsh-tty — 状态条悬浮提示（`stats-tip.js`）的回归测试。
 *
 * 钉住三件事，每一件都是「错了但不会崩」的静默错误：
 * 1. **峰值不把缺口当 0**：一次采样失败（`null`）不该把 45% 的峰值抹成 0——那是错的读数；
 * 2. **窗口口径**：只有真的显示了峰值才挂「近 1 分钟」脚注，没有峰值行的卡片写时间窗口
 *    是噪声（磁盘 / 在线 / 核心）；
 * 3. **每一格都有出口**：脏数据（`null` / 数组 / 字符串帧）、缺字段、只有一半的「已用/总量」
 *    都要落到一个明确的显示态，而不是抛或被渲染成 `NaN%`。
 */
import { describe, expect, it } from 'vitest'
import { seriesPeak, statsTipModel } from '../client-src/stats-tip.js'

/** 目录键原样返回：断言的是**用了哪个键**，不是中文（与 stats-bar.test.ts 同口径）。 */
const t = (key: string) => key

const GB = 2 ** 30

describe('seriesPeak', () => {
  it('取窗口内最大值', () => {
    expect(seriesPeak([{ cpuPct: 5 }, { cpuPct: 45 }, { cpuPct: 12 }], 'cpuPct')).toBe(45)
  })

  it('缺口（null / 非有限值 / 缺字段 / 非对象样本）不参与，也不当 0', () => {
    expect(seriesPeak([{ cpuPct: null }, { cpuPct: 45 }, { cpuPct: Number.NaN }], 'cpuPct')).toBe(45)
    expect(seriesPeak([{ cpuPct: 45 }, {}, null, 7], 'cpuPct')).toBe(45)
  })

  it('一个可用样本都没有 → null（不是 0：0 会被当成真实的峰值）', () => {
    expect(seriesPeak([], 'cpuPct')).toBeNull()
    expect(seriesPeak([{ cpuPct: null }], 'cpuPct')).toBeNull()
    expect(seriesPeak(null, 'cpuPct')).toBeNull()
    expect(seriesPeak(undefined, 'cpuPct')).toBeNull()
  })
})

describe('statsTipModel：第一行是对照轴（当前），第二行起是峰值 + 上下文', () => {
  it('CPU：当前 / 峰值 / 核心，脚注写明窗口', () => {
    expect(statsTipModel('cpuPct', { cpuPct: 18, cores: 10 }, [{ cpuPct: 45 }, { cpuPct: 12 }], t)).toMatchObject({
      label: 'statsTip.current',
      value: '18%',
      // 正常档也显式落 `ok`：条上的迷你条 / 趋势线是绿的，卡片第一行不能是中性白
      level: 'ok',
      rows: [
        { label: 'statsTip.peak', value: '45%' },
        { label: 'meta.cores', value: '10' },
      ],
      foot: 'statsDash.lastMin',
      empty: false,
    })
  })

  it('CPU / 内存 / 磁盘的取值档位：正常也落 ok，过线转 warn / danger（DOM 层按 level 写 data-level）', () => {
    expect(statsTipModel('cpuPct', { cpuPct: 85 }, [{ cpuPct: 85 }], t).level).toBe('warn')
    expect(statsTipModel('cpuPct', { cpuPct: 95 }, [], t).level).toBe('danger')
    expect(statsTipModel('mem', { memPct: 20 }, [], t).level).toBe('ok')
    expect(statsTipModel('disk', { diskPct: 92 }, [], t).level).toBe('danger')
    // 没有百分比的格子（在线 / 核心 / TCP / 温度 / 网络）不带档位：条上它们本来就是中性白
    expect(statsTipModel('uptimeSec', { uptimeSec: 60 }, [], t).level).toBe('')
    expect(statsTipModel('tcpConns', { tcpConns: 3 }, [], t).level).toBe('')
    expect(statsTipModel('net', {}, [], t).level).toBe('')
  })

  it('内存：峰值在前、「已用/总量」在后；缺总量时不留一行「无」', () => {
    const model = statsTipModel('mem', { memPct: 65, memUsed: 8 * GB, memTotal: 16 * GB }, [{ memPct: 71 }, { memPct: 60 }], t)
    expect(model.value).toBe('65%')
    expect(model.rows).toEqual([
      { label: 'statsTip.peak', value: '71%' },
      { label: 'statsTip.used', value: '8.0/16.0 GB' },
    ])
    // 只有一半的数据：pair 退化成「无」，那就干脆不加这一行
    const half = statsTipModel('mem', { memPct: 65, memUsed: 8 * GB }, [], t)
    expect(half.rows).toEqual([])
  })

  it('磁盘是单调量：不给峰值行，也就没有「近 1 分钟」脚注', () => {
    const model = statsTipModel('disk', { diskPct: 84, diskUsed: 52.3 * GB, diskTotal: 62.3 * GB }, [{ diskPct: 84 }], t)
    expect(model).toMatchObject({
      label: 'statsTip.occupied',
      value: '84%',
      rows: [{ label: 'statsTip.used', value: '52.3/62.3 GB' }],
      foot: '',
    })
  })

  it('磁盘缺百分比时第一行退成「已用」（不拼 `无 (52.3 GB)` 这种自相矛盾的读数）', () => {
    expect(statsTipModel('disk', { diskUsed: 8 * GB, diskTotal: 16 * GB }, [], t)).toMatchObject({
      label: 'statsTip.used',
      value: '8.0/16.0 GB',
      rows: [],
    })
  })

  it('在线 / 核心：单行，无峰值也无脚注', () => {
    expect(statsTipModel('uptimeSec', { uptimeSec: 3 * 86400 + 5 * 3600 }, [], t)).toMatchObject({
      label: 'meta.uptime',
      value: '3d5h',
      rows: [],
      foot: '',
    })
    expect(statsTipModel('cores', { cores: 10 }, [], t)).toMatchObject({ label: 'meta.cores', value: '10', rows: [], foot: '' })
  })

  it('TCP / 温度：当前 + 峰值（温度保留一位小数，与状态条一致）', () => {
    expect(statsTipModel('tcpConns', { tcpConns: 128 }, [{ tcpConns: 204 }, { tcpConns: 120 }], t).rows).toEqual([
      { label: 'statsTip.peak', value: '204' },
    ])
    const temp = statsTipModel('tempC', { tempC: 46.24 }, [{ tempC: 51.31 }], t)
    expect(temp.value).toBe('46.2°C')
    expect(temp.rows).toEqual([{ label: 'statsTip.peak', value: '51.3°C' }])
  })

  it('网络：两个方向各算各的峰值（下行 1.2M / 上行 8K 不能写成同一个数）', () => {
    const model = statsTipModel(
      'net',
      { rxRate: 877 * 1024, txRate: 815 * 1024 },
      [{ rxRate: 1.2 * 1024 * 1024, txRate: 8 * 1024 }],
      t,
    )
    expect(model.value).toBe('↓877K ↑815K')
    expect(model.rows).toEqual([
      {
        label: 'statsTip.peak',
        value: '↓1.2M ↑8K',
        // 峰值行同样分段：箭头就在当前值正下方，一半有颜色一半没有会像「没对上」
        segments: [
          { text: '↓1.2M', tone: 'rx' },
          { text: ' ', tone: '' },
          { text: '↑8K', tone: 'tx' },
        ],
      },
    ])
    expect(model.foot).toBe('statsDash.lastMin')
    // 分段与整段文本逐字一致（无障碍 / 冒烟读的是 value，绘制读的是 segments）
    expect(model.segments.map((part: { text: string }) => part.text).join('')).toBe(model.value)
    expect(model.segments).toEqual([
      { text: '↓877K', tone: 'rx' },
      { text: ' ', tone: '' },
      { text: '↑815K', tone: 'tx' },
    ])
  })

  it('Ping：当前 + 最差峰值，档位按手感分三档（绿 / 橙 / 红）', () => {
    const model = statsTipModel('ping', { pingMs: 24 }, [{ pingMs: 24 }, { pingMs: 410 }], t)
    expect(model.label).toBe('statsTip.current')
    expect(model.value).toBe('24ms')
    expect(model.level).toBe('ok')
    expect(model.rows).toEqual([{ label: 'statsTip.peak', value: '410ms' }])
    expect(statsTipModel('ping', { pingMs: 200 }, [], t).level).toBe('warn')
    expect(statsTipModel('ping', { pingMs: 500 }, [], t).level).toBe('danger')
    expect(statsTipModel('ping', {}, [], t)).toMatchObject({ value: 'list.none', rows: [], empty: true })
  })

  it('Swap：已用/总量，没有峰值行（单调量），脚注也不写窗口', () => {
    const GB = 2 ** 30
    const model = statsTipModel('swap', { swapUsed: 1.2 * GB, swapTotal: 4 * GB }, [{ swapUsed: 1e9 }], t)
    expect(model.label).toBe('statsTip.used')
    expect(model.value).toBe('1.2/4.0 GB')
    expect(model.rows).toEqual([])
    expect(model.foot).toBe('')
    expect(model.empty).toBe(false)
  })

  it('非网络格不分段（整段一个颜色，等级色由 data-level 给）', () => {
    const cpu = statsTipModel('cpuPct', { cpuPct: 18, cores: 10 }, [], t)
    expect(cpu.segments).toEqual([])
    const mem = statsTipModel('mem', { memPct: 65 }, [], t)
    expect(mem.segments).toEqual([])
  })

  it('全空：显示「无」且 empty=true（DOM 层据此不画一张只有标题的空卡片）', () => {
    expect(statsTipModel('cpuPct', {}, [], t)).toMatchObject({ value: 'list.none', rows: [], empty: true })
    expect(statsTipModel('net', {}, [], t)).toMatchObject({ value: '↓list.none ↑list.none', empty: true })
    // 有上下文行就不算空：当前值缺了，但「已用/总量」还能读
    expect(statsTipModel('mem', { memUsed: 8 * GB, memTotal: 16 * GB }, [], t).empty).toBe(false)
  })

  it('脏数据不抛：帧是 null / 数组 / 字符串时一律按「无」渲染', () => {
    for (const stats of [null, [], 'cpu', 42, undefined]) {
      expect(() => statsTipModel('cpuPct', stats as never, [], t)).not.toThrow()
      expect(statsTipModel('cpuPct', stats as never, [], t).value).toBe('list.none')
    }
  })
})
