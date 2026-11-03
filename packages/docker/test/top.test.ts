/**
 * @hyzyn/dsh-docker — `docker_top` 的回归测试。
 *
 * 断言面有三层：
 *   1. **argv 逐字**（含 `-eo` 的八列清单）：top 是本仓唯一一条把 ps 列名写进 argv 的
 *      命令，列名漂了解析就整片错位，所以钉的是完整数组而不是「包含 top」；
 *   2. **表头驱动的解析**：列顺序变、`%CPU`/`%MEM` 这种 ps 的默认表头、CMD 含空格、
 *      空输出、行数不足丢行、行数超上限截断——每条都是真机里会遇到的形状；
 *   3. **错误路径**：容器不存在 / 未运行时 docker 自己报错 → 走 `assertOk` 抛错
 *      （**不是**返回空列表：空列表会被读成「容器里没有进程」）。
 *
 * 夹具是本机 docker 28.3.2 对真实容器 `docker top <id> -eo
 * pid,ppid,user,stat,etime,pcpu,pmem,cmd` 的实测输出（表头就是 `PID … %CPU %MEM CMD`）。
 */
import { describe, expect, it } from 'vitest'
import { DockerApi, TOP_MAX_ROWS, TOP_PS_FORMAT, parseTopOutput } from '../src/docker.js'
import type { Runner } from '../src/docker.js'
import type { ExecResult } from '../src/ssh-exec.js'

/* ------------------------------------------------------------------ *
 * 夹具
 * ------------------------------------------------------------------ */

/** 真机实测输出（docker 28.3.2 / dsh-remote-server）。 */
const REAL_TOP = `PID                 PPID                USER                STAT                ELAPSED             %CPU                %MEM                CMD
3149                3125                1000                Ss                  03:24:48            0.0                 0.0                 /sbin/docker-init -- docker-entrypoint.sh node dist/main.js
3177                3149                1000                Sl                  03:24:48            0.4                 1.2                 node dist/main.js
`

interface Recorded {
  argv: string[]
}

interface Reply {
  code?: number
  stdout?: string
  stderr?: string
  truncated?: boolean
}

/**
 * 假 Runner：`top` 与「取容器名」的 `inspect --format` 分派，其余 argv 直接报错。
 * 逐字记录 argv——argv 是本文件的主断言面。
 */
function fakeApi(plan: { top?: Reply; name?: Reply } = {}): { api: DockerApi; calls: Recorded[] } {
  const calls: Recorded[] = []
  const result = (reply: Reply, fallback: string): ExecResult => ({
    code: reply.code ?? 0,
    stdout: reply.stdout ?? fallback,
    stderr: reply.stderr ?? '',
    timedOut: false,
    truncated: reply.truncated ?? false,
    durationMs: 1,
  })
  const runner: Runner = {
    label: '本机（test）',
    async run(argv) {
      calls.push({ argv: [...argv] })
      if (argv[1] === 'top') return result(plan.top ?? {}, REAL_TOP)
      if (argv[1] === 'inspect' && argv[2] === '--format') return result(plan.name ?? {}, '/shop-web-1\n')
      throw new Error(`意外的 argv：${argv.join(' ')}`)
    },
    async stream() {
      throw new Error('top 不应走 stream')
    },
  }
  return { api: new DockerApi(runner, 'docker', { timeoutMs: 1_000, maxBytes: 512 * 1024 }), calls }
}

/* ------------------------------------------------------------------ *
 * 1. argv 与容器名
 * ------------------------------------------------------------------ */

describe('DockerApi.top — argv 与容器名', () => {
  it('argv 逐字：docker top <id> -eo pid,ppid,user,stat,etime,pcpu,pmem,cmd', async () => {
    const { api, calls } = fakeApi()
    await api.top('shop-web-1')
    expect(calls[0]?.argv).toEqual(['docker', 'top', 'shop-web-1', '-eo', TOP_PS_FORMAT])
    // 列清单本身也逐字钉住（顺序是解析的前提，不是随意排列）
    expect(TOP_PS_FORMAT).toBe('pid,ppid,user,stat,etime,pcpu,pmem,cmd')
    expect(calls[0]?.argv[3]).toBe('-eo')
  })

  it('容器名单独取一次（docker top 输出里没有名字）：strip 前导斜杠', async () => {
    const { api, calls } = fakeApi()
    const top = await api.top('shop-web-1')
    expect(top.name).toBe('shop-web-1')
    expect(top.id).toBe('shop-web-1')
    expect(calls[1]?.argv).toEqual(['docker', 'inspect', '--format', '{{.Name}}', 'shop-web-1'])
  })

  it('名字取不到只回落成传入的 id（次要信息不影响 top 的成功路径）', async () => {
    const { api } = fakeApi({ name: { code: 1, stdout: '', stderr: 'Error: boom' } })
    const top = await api.top('abc123')
    expect(top.name).toBe('abc123')
    expect(top.rows).toHaveLength(2)
  })

  it('名字命令输出为空也回落（strip 后空串不能当名字）', async () => {
    const { api } = fakeApi({ name: { stdout: '/\n' } })
    expect((await api.top('abc123')).name).toBe('abc123')
  })

  it('容器不存在 / 未运行：docker 自己报错 → assertOk 抛错（不是空列表）', async () => {
    const { api, calls } = fakeApi({ top: { code: 1, stdout: '', stderr: 'Error response from daemon: No such container: gone\n' } })
    await expect(api.top('gone')).rejects.toThrow(/读取容器进程失败/)
    await expect(api.top('gone')).rejects.toThrow(/No such container/)
    // top 失败即返回：不去取名字（那条命令是次要信息，不该在失败路径上多打一次 docker）
    expect(calls.map((call) => call.argv[1])).toEqual(['top', 'top'])
  })

  it('容器 id 过白名单：注入尝试一条命令都不发', async () => {
    const { api, calls } = fakeApi()
    await expect(api.top('app; rm -rf /')).rejects.toThrow(/container 含非法字符/)
    expect(calls).toHaveLength(0)
  })
})

/* ------------------------------------------------------------------ *
 * 2. 表头驱动的解析
 * ------------------------------------------------------------------ */

describe('parseTopOutput — 表头驱动', () => {
  it('真机输出：八列映射正确（%CPU → cpu、%MEM → mem），字段全是 string', () => {
    const { rows, truncated } = parseTopOutput(REAL_TOP)
    expect(truncated).toBe(false)
    expect(rows).toEqual([
      {
        pid: '3149',
        ppid: '3125',
        user: '1000',
        stat: 'Ss',
        elapsed: '03:24:48',
        cpu: '0.0',
        mem: '0.0',
        command: '/sbin/docker-init -- docker-entrypoint.sh node dist/main.js',
      },
      {
        pid: '3177',
        ppid: '3149',
        user: '1000',
        stat: 'Sl',
        elapsed: '03:24:48',
        cpu: '0.4',
        mem: '1.2',
        command: 'node dist/main.js',
      },
    ])
    for (const row of rows) {
      for (const value of Object.values(row)) expect(typeof value).toBe('string')
    }
  })

  it('列顺序变了也不错位（表头驱动，不按下标猜）：CMD 在第一列时由剩余 token 合并', () => {
    const text = `CMD PID PPID USER STAT ELAPSED %CPU %MEM
/usr/bin/app --flag=1 42 1 root Ss 00:01 1.0 2.0
`
    const { rows } = parseTopOutput(text)
    expect(rows).toEqual([
      { pid: '42', ppid: '1', user: 'root', stat: 'Ss', elapsed: '00:01', cpu: '1.0', mem: '2.0', command: '/usr/bin/app --flag=1' },
    ])
  })

  it('CMD 含空格（末列由剩余 token 合并），多列空白不误切', () => {
    const text = `PID   PPID   USER   STAT   ELAPSED   %CPU   %MEM   CMD
  7      1    root     Ss    1-02:03:04   0.0    0.1    /bin/sh -c "while true; do sleep 1; done"
`
    const { rows } = parseTopOutput(text)
    expect(rows[0]?.command).toBe('/bin/sh -c "while true; do sleep 1; done"')
    expect(rows[0]?.elapsed).toBe('1-02:03:04')
  })

  it('空输出 / 只有空白 / 只有表头 → 空数组，不是错误', () => {
    expect(parseTopOutput('')).toEqual({ rows: [], truncated: false })
    expect(parseTopOutput('  \n\n')).toEqual({ rows: [], truncated: false })
    expect(parseTopOutput('PID PPID USER STAT ELAPSED %CPU %MEM CMD\n')).toEqual({ rows: [], truncated: false })
  })

  it('行数不足（半行 / 被字节闸切断的行）→ 丢弃该行，其余照常', () => {
    const text = `PID PPID USER STAT ELAPSED %CPU %MEM CMD
100 90 root Ss 00:01 1.0 2.0 /bin/a
101 90 root Ss
102 90 root Ss 00:02 0.0 0.0 /bin/b
`
    const { rows } = parseTopOutput(text)
    expect(rows.map((row) => row.pid)).toEqual(['100', '102'])
  })

  it('表头里认不出的列被忽略（ps 版本多给的列），行的字段照样齐全', () => {
    const text = `PID PPID USER STAT ELAPSED %CPU %MEM NI CMD
1 0 root Ss 00:01 0.0 0.0 5 /sbin/init
`
    const { rows } = parseTopOutput(text)
    expect(rows[0]).toMatchObject({ pid: '1', command: '/sbin/init' })
  })

  it('表头一个都认不出 → 空数组（不做「按下标猜」的兜底）', () => {
    expect(parseTopOutput('FOO BAR BAZ\n1 2 3\n').rows).toEqual([])
  })

  it('行数超过上限 → 截到 TOP_MAX_ROWS 并给 truncated', () => {
    const header = 'PID PPID USER STAT ELAPSED %CPU %MEM CMD'
    const line = (index: number): string => `${String(index)} 1 root Ss 00:01 0.0 0.0 /bin/p${String(index)}`
    const text = [header, ...Array.from({ length: TOP_MAX_ROWS + 20 }, (_, index) => line(index))].join('\n')
    const { rows, truncated } = parseTopOutput(text)
    expect(rows).toHaveLength(TOP_MAX_ROWS)
    expect(truncated).toBe(true)
  })

  it('CRLF 与行尾空白不影响解析', () => {
    const text = 'PID PPID USER STAT ELAPSED %CPU %MEM CMD\r\n1 0 root Ss 00:01 0.0 0.0 /sbin/init \r\n'
    expect(parseTopOutput(text).rows[0]).toMatchObject({ pid: '1', command: '/sbin/init' })
  })
})

/* ------------------------------------------------------------------ *
 * 3. 截断信号位（两条独立的闸都要如实报）
 * ------------------------------------------------------------------ */

describe('DockerApi.top — truncated 的两个来源', () => {
  it('runner 的字节闸触发时 truncated=true（行闸没触发也一样）', async () => {
    const { api } = fakeApi({ top: { truncated: true } })
    expect((await api.top('shop-web-1')).truncated).toBe(true)
  })

  it('行数超上限时 truncated=true（字节闸没触发也一样）', async () => {
    const header = 'PID PPID USER STAT ELAPSED %CPU %MEM CMD'
    const line = (index: number): string => `${String(index)} 1 root Ss 00:01 0.0 0.0 /bin/p${String(index)}`
    const text = [header, ...Array.from({ length: TOP_MAX_ROWS + 1 }, (_, index) => line(index))].join('\n')
    const { api } = fakeApi({ top: { stdout: text } })
    const top = await api.top('shop-web-1')
    expect(top.rows).toHaveLength(TOP_MAX_ROWS)
    expect(top.truncated).toBe(true)
  })

  it('正常输出：truncated=false（别把「有值」当「截断」）', async () => {
    const { api } = fakeApi()
    expect((await api.top('shop-web-1')).truncated).toBe(false)
  })
})
