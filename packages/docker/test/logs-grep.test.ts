/**
 * @hyzyn/dsh-docker — docker_logs_grep（日志服务端检索）与 --until 时间窗的回归测试。
 *
 * 覆盖三层：
 *   1. argv 构造：默认 `--tail all`（与快照的 1~5000 夹紧分道）、timestamps 默认开、
 *      since / --until 透传、容器 ID 白名单——全部经 logsArgv 唯一构造点断言；
 *   2. 匹配内核：字面子串（含 ignoreCase）、JS 正则（无效源文报错）、pattern 长度闸；
 *   3. 返回契约：命中 + 上下文窗口**合并去重**、limit 截断与 matched 如实计数分离、
 *      扫描侧 truncated 与返回侧 limited 两个信号位、stdout/stderr 分段编号、
 *      docker 报错走 assertOk。
 *
 * 桩是一等公民的假 Runner（logsGrep 走 runner.run，不碰 shell）——断言面就是
 * 「argv 逐字 + 结构化结果」，不需要真 docker。
 */
import { describe, expect, it } from 'vitest'
import { DockerApi } from '../src/docker.js'
import type { Runner } from '../src/docker.js'
import type { ExecResult } from '../src/ssh-exec.js'

interface Recorded { argv: readonly string[]; options?: { timeoutMs?: number; maxBytes?: number; keepTail?: boolean; lineAlign?: boolean } }

function fakeRunner(stdout = '', stderr = '', overrides: Partial<ExecResult> = {}): { api: DockerApi; calls: Recorded[] } {
  const calls: Recorded[] = []
  const runner: Runner = {
    label: '本机（test）',
    async run(argv, options) {
      calls.push({ argv, options })
      const result: ExecResult = { code: 0, stdout, stderr, timedOut: false, truncated: false, durationMs: 1 }
      return { ...result, ...overrides }
    },
    async stream() {
      throw new Error('logsGrep 不应走 stream')
    },
  }
  return { api: new DockerApi(runner, 'docker', { timeoutMs: 30_000, maxBytes: 512 * 1024 }), calls }
}

describe('logsGrep — argv 构造（logsArgv 唯一构造点）', () => {
  it('缺省 = --tail all + --timestamps（检索默认扫全历史；深处的命中没时间等于没用）', async () => {
    const { api, calls } = fakeRunner('x\n')
    await api.logsGrep('app', { pattern: 'x' })
    expect(calls[0]?.argv).toEqual(['docker', 'logs', '--tail', 'all', '--timestamps', 'app'])
  })

  it('tail 给了数字夹到 1~5000；timestamps:false 关掉；since/until 原样透传', async () => {
    const { api, calls } = fakeRunner('x\n')
    await api.logsGrep('app', { pattern: 'x', tail: 99999, timestamps: false, since: '2h', until: '2026-09-09T10:00:00' })
    expect(calls[0]?.argv).toEqual(['docker', 'logs', '--tail', '5000', '--since', '2h', '--until', '2026-09-09T10:00:00', 'app'])
  })

  it('扫描预算独立于返回预算：maxBytes ≥ 8MB 且 keepTail（溢出丢最旧），超 512KB 配置不再拦扫描', async () => {
    const { api, calls } = fakeRunner('x\n')
    await api.logsGrep('app', { pattern: 'x' })
    expect(calls[0]?.options?.maxBytes).toBe(8 * 1024 * 1024)
    expect(calls[0]?.options?.keepTail).toBe(true)
    expect(calls[0]?.options?.timeoutMs).toBeGreaterThanOrEqual(60_000)
  })

  /*
   * 接线钉子：扫描窗口要**对齐到行边界**，否则字节闸的切口会让第一行变成半行
   *（真机实测：10.7MB 日志返回的首行是 `"g line 174798"`，没有时间戳）。
   * 行为本身在 exec 层（`ByteSink.decode`），而本文件的假 Runner **绕过**了那一层 ——
   * 所以行为用例在 `ssh-connect.test.ts`（含「不传 lineAlign 仍逐字节保留尾部」的反例），
   * 这里只钉住「grep 路径确实开了这个开关」，别让它哪天掉。
   */
  it('扫描侧要求按行边界对齐（lineAlign），别把切口处的半行当一行返回', async () => {
    const { api, calls } = fakeRunner('x\n')
    await api.logsGrep('app', { pattern: 'x' })
    expect(calls[0]?.options?.lineAlign).toBe(true)
  })

  it('容器 ID 过白名单：注入尝试不进 argv', async () => {
    const { api, calls } = fakeRunner('x\n')
    await expect(api.logsGrep('app; rm -rf /', { pattern: 'x' })).rejects.toThrow()
    expect(calls.length).toBe(0)
  })
})

describe('logsGrep — 参数校验', () => {
  it('pattern 必填 / 非字符串 / 超 512 字符都拒绝', async () => {
    const { api } = fakeRunner('x\n')
    await expect(api.logsGrep('app', { pattern: '' })).rejects.toThrow('pattern 必填')
    await expect(api.logsGrep('app', { pattern: undefined as unknown as string })).rejects.toThrow('pattern 必填')
    await expect(api.logsGrep('app', { pattern: 'a'.repeat(513) })).rejects.toThrow('pattern 过长')
  })

  it('无效正则报错点名原因；regexp=false 时 `[` 只是普通字面（不误伤）', async () => {
    const { api } = fakeRunner('a[b c\n')
    await expect(api.logsGrep('app', { pattern: '(a+', regexp: true })).rejects.toThrow('无效的正则表达式')
    const res = await api.logsGrep('app', { pattern: '[b' })
    expect(res.matched).toBe(1)
  })
})

describe('logsGrep — 匹配内核', () => {
  it('字面子串：区分大小写，highlight 是命中的子串本体', async () => {
    const { api } = fakeRunner('Error 1\nerror 2\nERROR 3\n')
    const res = await api.logsGrep('app', { pattern: 'Error' })
    expect(res.matched).toBe(1)
    expect(res.lines.filter((l) => l.hit).map((l) => l.highlight)).toEqual(['Error'])
  })

  it('ignoreCase：字面模式等价 grep -i，高亮取原文大小写', async () => {
    const { api } = fakeRunner('Error 1\nerror 2\n')
    const res = await api.logsGrep('app', { pattern: 'errOr', ignoreCase: true })
    expect(res.matched).toBe(2)
    expect(res.lines.filter((l) => l.hit).map((l) => l.highlight)).toEqual(['Error', 'error'])
  })

  it('regexp=true：命中子串来自 match[0]', async () => {
    const { api } = fakeRunner('code=500 boom\ncode=200 ok\n')
    const res = await api.logsGrep('app', { pattern: 'code=5\\d+', regexp: true, context: 0 })
    expect(res.matched).toBe(1)
    expect(res.lines[0]?.highlight).toBe('code=500')
  })
})

describe('logsGrep — 返回契约', () => {
  const many = Array.from({ length: 10 }, (_, i) => `line-${i}${i % 5 === 0 ? ' FAIL' : ''}`).join('\n') + '\n'

  it('上下文窗口 ±context，边界不越界（开头命中没有上方行）', async () => {
    const { api } = fakeRunner(many)
    const res = await api.logsGrep('app', { pattern: 'FAIL', context: 2 })
    // 命中在 0 与 5（line-0 / line-5）；窗口 [0..2] 与 [3..7] 不重叠
    expect(res.matched).toBe(2)
    expect(res.contextLines).toBe(2)
    expect(res.lines.map((l) => l.seq)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect(res.lines.filter((l) => l.hit).map((l) => l.seq)).toEqual([1, 6])
  })

  it('相邻命中的窗口合并去重（共享行只输出一份）', async () => {
    const { api } = fakeRunner('a\nFAIL-1\nFAIL-2\nb\n')
    const res = await api.logsGrep('app', { pattern: 'FAIL', context: 1 })
    expect(res.matched).toBe(2)
    expect(res.returned).toBe(4) // a, FAIL-1, FAIL-2, b —— 中间重叠不重复
    expect(res.lines.map((l) => l.text)).toEqual(['a', 'FAIL-1', 'FAIL-2', 'b'])
  })

  it('limit 只截返回窗口；matched 如实报全量，limited=true 给信号', async () => {
    const { api } = fakeRunner(many)
    const res = await api.logsGrep('app', { pattern: 'FAIL', context: 0, limit: 1 })
    expect(res.matched).toBe(2) // 全量命中照数
    expect(res.limited).toBe(true)
    expect(res.lines.filter((l) => l.hit).length).toBe(1)
    expect(res.returned).toBe(1)
  })

  it('truncated 是扫描侧信号（字节闸溢出），与 limited 各自独立', async () => {
    const { api } = fakeRunner('FAIL\n', '', { truncated: true })
    const res = await api.logsGrep('app', { pattern: 'FAIL' })
    expect(res.truncated).toBe(true)
    expect(res.limited).toBe(false)
  })

  it('stdout 在前 stderr 在后，seq 连续编号，stream 标注通道', async () => {
    const { api } = fakeRunner('o1\no2\n', 'e1\n')
    const res = await api.logsGrep('app', { pattern: 'e1', context: 1 })
    expect(res.scanned).toBe(3)
    const errLine = res.lines.find((l) => l.stream === 'err')
    expect(errLine?.seq).toBe(3)
    expect(res.lines.map((l) => l.seq)).toEqual([2, 3])
  })

  it('docker 报错走 assertOk：非零码抛「检索容器日志失败」', async () => {
    const { api } = fakeRunner('', 'No such container: gone', { code: 1 })
    await expect(api.logsGrep('app', { pattern: 'x' })).rejects.toThrow(/检索容器日志失败.*No such container/)
  })
})

describe('logs() / logsArgv — --until 时间窗', () => {
  it('快照路径透传 --until（与 --since 同侧、id 之前）', async () => {
    const { api, calls } = fakeRunner('x\n')
    await api.logs('app', { tail: 100, since: '10m', until: '5m' })
    expect(calls[0]?.argv).toEqual(['docker', 'logs', '--tail', '100', '--since', '10m', '--until', '5m', 'app'])
  })

  it('不传 until 时 argv 与旧行为逐字一致（不误伤现有路径）', async () => {
    const { api, calls } = fakeRunner('x\n')
    await api.logs('app', { tail: 100 })
    expect(calls[0]?.argv).toEqual(['docker', 'logs', '--tail', '100', 'app'])
  })
})
