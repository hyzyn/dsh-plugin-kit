/**
 * `scripts/step-summary.mjs` 的用例 —— Job Summary 写入器与两个渲染函数。
 *
 * 这组用例守三件事（前两件都是「不这么做就会有人踩」的形态）：
 *
 * 1. **本地跑不受影响**：没设 `$GITHUB_STEP_SUMMARY` 时必须**什么都不做**——
 *    否则 `pnpm flake:check` 在开发机上会凭空建文件，或更糟：报一个与闸门无关的错。
 * 2. **写失败不许改变退出码**：摘要只是给人看的，写不进去（权限 / 磁盘满 / 路径被占）
 *    不该让一条本来绿的闸门变红。所以 `writeStepSummary` 吞掉异常并返回 `false`。
 * 3. **渲染出来的数字要真**：两条车道的摘要里放的是**判据本身**（份数 / 是否回退 /
 *    三条指标的数值），渲染错了比没有摘要更坏——它会被当成结论。
 *
 * 全部走注入（`env` / `appendFile`），不碰真文件系统、不依赖 CI 环境。
 */
import { describe, expect, it } from 'vitest'

import { renderCoverageSummary, renderFlakeSummary, writeStepSummary } from '../step-summary.mjs'

/** 造一个假的 appendFile，记录被写到哪里、写了什么。 */
function fakeAppend() {
  const calls = []
  return { calls, appendFile: (path, text) => calls.push({ path, text }) }
}

describe('writeStepSummary：没设变量时静默，写失败也不抛', () => {
  it('**未设 `$GITHUB_STEP_SUMMARY` → 什么都不做**（本地跑的常态）', () => {
    const { calls, appendFile } = fakeAppend()
    expect(writeStepSummary('# 标题', { env: {}, appendFile })).toBe(false)
    expect(calls, '不该往任何地方写').toHaveLength(0)
  })

  it('空串与未定义同档（不是错误，是不该写）', () => {
    const { calls, appendFile } = fakeAppend()
    expect(writeStepSummary('# 标题', { env: { GITHUB_STEP_SUMMARY: '' }, appendFile })).toBe(false)
    expect(calls).toHaveLength(0)
  })

  it('设了就写到那个路径，且**自动补结尾换行**', () => {
    const { calls, appendFile } = fakeAppend()
    const ok = writeStepSummary('## 结论', { env: { GITHUB_STEP_SUMMARY: '/tmp/s.md' }, appendFile })
    expect(ok).toBe(true)
    expect(calls).toEqual([{ path: '/tmp/s.md', text: '## 结论\n' }])
  })

  it('已有结尾换行时不重复补（同一个 job 多次追加不该出现空行堆积）', () => {
    const { calls, appendFile } = fakeAppend()
    writeStepSummary('## 结论\n', { env: { GITHUB_STEP_SUMMARY: '/tmp/s.md' }, appendFile })
    expect(calls[0].text).toBe('## 结论\n')
  })

  it('**写失败返回 false 且不抛**（权限 / 路径被占不该让闸门变红）', () => {
    const boom = () => {
      throw new Error('EACCES: permission denied')
    }
    expect(() => writeStepSummary('# x', { env: { GITHUB_STEP_SUMMARY: '/nope' }, appendFile: boom })).not.toThrow()
    expect(writeStepSummary('# x', { env: { GITHUB_STEP_SUMMARY: '/nope' }, appendFile: boom })).toBe(false)
  })
})

describe('renderFlakeSummary：一眼要看的只有「几份绿/红 + 耗时」', () => {
  it('全绿 → 一行结论，不含失败指引', () => {
    const md = renderFlakeSummary({ runs: 3, ok: true, failed: [], elapsedSec: 65.9 })
    expect(md).toContain('✅')
    expect(md).toContain('并发 3 份全绿')
    expect(md).toContain('65.9s')
    expect(md, '全绿时不该出现「不要靠重跑到绿」那段').not.toContain('repro-flake')
  })

  it('有红 → 点名第几份，并给出复现命令（失败时那才是重点）', () => {
    const md = renderFlakeSummary({ runs: 3, ok: false, failed: [1, 3], elapsedSec: 42 })
    expect(md).toContain('❌')
    expect(md).toContain('2 份红')
    expect(md).toContain('第 1、3 份')
    expect(md, '要给出可粘贴的复现入口').toContain('pnpm repro-flake')
  })
})

describe('renderCoverageSummary：三条指标的「本轮 vs 基线」表', () => {
  const current = { lines: { pct: 66.49 }, branches: { pct: 76.86 }, functions: { pct: 73.66 } }
  const baseline = { lines: { pct: 66.52 }, branches: { pct: 76.9 }, functions: { pct: 73.82 } }

  it('通过时给三行数值 + 差值（真 CI 上的实测数字）', () => {
    const md = renderCoverageSummary({ current, baseline, ok: true, drops: [] })
    expect(md).toContain('✅')
    expect(md).toContain('66.49%')
    expect(md).toContain('66.52%')
    expect(md).toContain('-0.03')
    expect(md).toContain('-0.16')
  })

  it('**说明 `branches` / `functions` 不判**（否则看表的人会以为它们也是判据）', () => {
    const md = renderCoverageSummary({ current, baseline, ok: true, drops: [] })
    expect(md).toContain('只记录不判')
    expect(md).toContain('判据只有 `lines`')
  })

  it('回退时点名是哪个指标，并给出两条出路', () => {
    const md = renderCoverageSummary({
      current,
      baseline,
      ok: false,
      drops: [{ key: 'lines', before: 66.52, after: 60, delta: -6.52 }],
    })
    expect(md).toContain('❌')
    expect(md).toContain('lines')
    expect(md).toContain('coverage:write')
  })

  it('上升时差值是正的（带 `+` 号，一眼能分辨方向）', () => {
    const md = renderCoverageSummary({
      current: { lines: { pct: 70 }, branches: { pct: 76.86 }, functions: { pct: 73.66 } },
      baseline,
      ok: true,
      drops: [],
    })
    expect(md).toContain('+3.48')
  })
})

describe('可观测性：写入必须留痕（否则没法验收）', () => {
  /*
   * 2026-10-04 加。第一版是**静默**的：写成功与「悄悄没写」在日志里长得一样。
   * 而 `$GITHUB_STEP_SUMMARY` 的内容**在 REST API 里读不到**
   * （`jobs.output.summary` 是 check-run 的另一个字段，实测恒空），
   * 所以「到底写没写」只能靠日志自证——一个不说话的写入器等于没法验收。
   */
  const spy = () => {
    const lines = []
    return { lines, log: (msg) => lines.push(String(msg)) }
  }

  it('写成功 → 打一行（含首行内容，便于在日志里确认写了什么）', () => {
    const { lines, log } = spy()
    const { appendFile } = fakeAppend()
    writeStepSummary('## Flake lane\n\n✅ 全绿', { env: { GITHUB_STEP_SUMMARY: '/tmp/s.md' }, appendFile, log })
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain('[summary]')
    expect(lines[0]).toContain('Flake lane')
  })

  it('写失败 → 也打一行，且**说明不影响闸门结论**（否则会有人以为闸门坏了）', () => {
    const { lines, log } = spy()
    const boom = () => {
      throw new Error('EACCES: permission denied')
    }
    const ok = writeStepSummary('# x', { env: { GITHUB_STEP_SUMMARY: '/nope' }, appendFile: boom, log })
    expect(ok).toBe(false)
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain('失败')
    expect(lines[0]).toContain('不影响闸门结论')
    expect(lines[0]).toContain('EACCES')
  })

  it('**未设变量时完全静默**（本地跑不该刷出无意义的 [summary] 行）', () => {
    const { lines, log } = spy()
    writeStepSummary('# x', { env: {}, appendFile: fakeAppend().appendFile, log })
    expect(lines).toEqual([])
  })
})
