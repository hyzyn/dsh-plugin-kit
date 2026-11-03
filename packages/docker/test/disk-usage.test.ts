/**
 * @hyzyn/dsh-docker — 磁盘占用（`docker system df`）的回归测试。
 *
 * 夹具直接取自真机（docker 28.3.2）的输出形状，三处**容易写错**的地方各有正例 + 反例：
 *   1. 计数字段是**字符串**（`"TotalCount":"14"`），直接 `Number` 之外还要防 `NaN`；
 *   2. 明细是**一个 JSON 对象**（不是 NDJSON），键是 `Images` / `Volumes` / `BuildCache`；
 *   3. 「谁在用」来自 docker 自己的 `Images[].Containers` / `Volumes[].Links`——
 *      **不是**按 ps 反推的（真机上 14 个镜像里只有 1 个在用，反推会错得离谱）。
 *
 * 排序与截断是两条独立判据：先排序（占用大的在前）、再截断并如实置 `truncated`；
 * 若先截断，名额会被一堆 0B 的空卷占满——那正是「磁盘页什么都看不出来」的成因。
 */
import { describe, expect, it } from 'vitest'
import {
  DISK_DETAIL_LIMIT,
  DISK_DETAIL_SCAN_BYTES,
  DockerApi,
  parseDiskDetail,
  parseDiskSummary,
} from '../src/docker.js'
import type { Runner } from '../src/docker.js'
import type { ExecResult } from '../src/ssh-exec.js'

/* ------------------------------------------------------------------ *
 * 夹具（真机输出形状）
 * ------------------------------------------------------------------ */

/** `docker system df --format '{{json .}}'`：每行一个对象，四类。 */
const SUMMARY_TEXT = [
  '{"Active":"10","Reclaimable":"1.134GB (56%)","Size":"2.011GB","TotalCount":"14","Type":"Images"}',
  '{"Active":"19","Reclaimable":"0B (0%)","Size":"162B","TotalCount":"19","Type":"Containers"}',
  '{"Active":"1","Reclaimable":"0B (0%)","Size":"197B","TotalCount":"259","Type":"Local Volumes"}',
  '{"Active":"0","Reclaimable":"0B","Size":"0B","TotalCount":"0","Type":"Build Cache"}',
].join('\n')

/** `docker system df -v --format '{{json .}}'`：**一个** JSON 对象。 */
const DETAIL_TEXT = JSON.stringify({
  Images: [
    {
      Containers: '1',
      ID: 'sha256:41685f46ed01af5cb7aa1d1843915957553fa2aee07ee1b44337735ac73182b9',
      Repository: 'ghcr.io/liguobao/ds-harness-remote/server',
      Tag: 'latest',
      Size: '264MB',
      SharedSize: '0B',
      UniqueSize: '264.1MB',
      VirtualSize: '264.1MB',
    },
    {
      Containers: '0',
      ID: 'sha256:small',
      Repository: 'alpine',
      Tag: '3.19',
      Size: '7MB',
      SharedSize: '7MB',
      UniqueSize: '0B',
      VirtualSize: '7MB',
    },
    {
      Containers: '2',
      ID: 'sha256:big',
      Repository: 'postgres',
      Tag: '16',
      Size: '400MB',
      SharedSize: '100MB',
      UniqueSize: '300MB',
      VirtualSize: '400MB',
    },
  ],
  Containers: [],
  Volumes: [
    { Name: 'empty-a', Driver: 'local', Size: '0B', Links: '0' },
    { Name: 'dsh-remote-server_server-data', Driver: 'local', Size: '197B', Links: '1' },
    { Name: 'pgdata', Driver: 'local', Size: '1.2GB', Links: '2' },
  ],
  BuildCache: [
    { ID: 'abc123', Type: 'regular', Size: '120MB', InUse: 'true' },
    { ID: 'def456', Type: 'regular', Size: '0B', InUse: false },
  ],
})

/* ------------------------------------------------------------------ *
 * 1. 汇总
 * ------------------------------------------------------------------ */

describe('parseDiskSummary', () => {
  it('四行 NDJSON → 四行汇总；计数是字符串但解析成 number；type 原样保留英文', () => {
    const rows = parseDiskSummary(SUMMARY_TEXT)
    expect(rows.map((row) => row.type)).toEqual(['Images', 'Containers', 'Local Volumes', 'Build Cache'])
    expect(rows[0]).toEqual({ type: 'Images', totalCount: 14, active: 10, size: '2.011GB', reclaimable: '1.134GB (56%)' })
    expect(rows[2]?.totalCount).toBe(259)
    expect(rows[3]?.active).toBe(0)
    for (const row of rows) {
      expect(typeof row.totalCount).toBe('number')
      expect(typeof row.active).toBe('number')
    }
  })

  it('空输出 / 非 JSON 行 → 空数组（不抛：汇总为空由调用方判断）', () => {
    expect(parseDiskSummary('')).toEqual([])
    expect(parseDiskSummary('docker: something went wrong')).toEqual([])
  })

  it('缺计数字段给 0 而不是 NaN（`0` 与「没这个字段」都渲染成 0 个）', () => {
    const rows = parseDiskSummary('{"Type":"Images","Size":"0B","Reclaimable":"0B"}')
    expect(rows[0]).toMatchObject({ totalCount: 0, active: 0 })
  })
})

/* ------------------------------------------------------------------ *
 * 2. 明细
 * ------------------------------------------------------------------ */

describe('parseDiskDetail', () => {
  it('镜像按独占大小降序、卷按大小降序（磁盘页先看最大的）', () => {
    const detail = parseDiskDetail(DETAIL_TEXT)
    expect(detail).not.toBeNull()
    expect(detail?.images.map((row) => row.repository)).toEqual(['postgres', 'ghcr.io/liguobao/ds-harness-remote/server', 'alpine'])
    expect(detail?.volumes.map((row) => row.name)).toEqual(['pgdata', 'dsh-remote-server_server-data', 'empty-a'])
  })

  it('「谁在用」直接取 docker 给的 Containers / Links（不按 ps 反推）', () => {
    const detail = parseDiskDetail(DETAIL_TEXT)
    const server = detail?.images.find((row) => row.repository.includes('ds-harness-remote'))
    expect(server?.containers).toBe(1)
    expect(detail?.images.find((row) => row.repository === 'alpine')?.containers).toBe(0)
    expect(detail?.volumes.find((row) => row.name === 'pgdata')?.links).toBe(2)
  })

  it('构建缓存：InUse 兼容字符串 "true" 与布尔值', () => {
    const detail = parseDiskDetail(DETAIL_TEXT)
    expect(detail?.buildCache).toEqual([
      { id: 'abc123', type: 'regular', size: '120MB', inUse: true },
      { id: 'def456', type: 'regular', size: '0B', inUse: false },
    ])
  })

  it('没有 UniqueSize 的老 docker 退回 VirtualSize', () => {
    const text = JSON.stringify({ Images: [{ ID: 'sha256:x', Repository: 'x', Tag: '1', Size: '9MB', VirtualSize: '9MB' }], Volumes: [], BuildCache: [] })
    expect(parseDiskDetail(text)?.images[0]).toMatchObject({ uniqueSize: '9MB', containers: 0 })
  })

  it('明细上限：默认 100 行；超了 truncated 置位、totals 报真实条数（截断前）', () => {
    expect(DISK_DETAIL_LIMIT).toBe(100)
    const many = Array.from({ length: 5 }, (_, index) => ({ ID: `sha256:${String(index)}`, Repository: 'r', Tag: String(index), Size: `${String(index + 1)}MB`, UniqueSize: `${String(index + 1)}MB` }))
    const detail = parseDiskDetail(JSON.stringify({ Images: many, Volumes: [], BuildCache: [] }), 2)
    expect(detail?.images).toHaveLength(2)
    expect(detail?.totals.images).toBe(5)
    expect(detail?.truncated.images).toBe(true)
    expect(detail?.truncated.volumes).toBe(false)
    // 截断在排序之后：留下的是最大的两个
    expect(detail?.images.map((row) => row.tag)).toEqual(['4', '3'])
  })

  it('不是 `system df -v` 的形状 / 坏 JSON → null（调用方据此降级，别把汇总也带走）', () => {
    expect(parseDiskDetail('')).toBeNull()
    expect(parseDiskDetail('docker: unknown flag: -v')).toBeNull()
    expect(parseDiskDetail('{"Foo":"bar"}')).toBeNull()
    expect(parseDiskDetail('{"Images": [')).toBeNull()
  })
})

/* ------------------------------------------------------------------ *
 * 3. 采集层：DockerApi.systemDf()
 * ------------------------------------------------------------------ */

interface Fare {
  summary?: Partial<ExecResult>
  detail?: Partial<ExecResult>
}

function fakeApi(fare: Fare = {}): { api: DockerApi; calls: Array<{ argv: string[]; options?: { maxBytes?: number; timeoutMs?: number } }> } {
  const calls: Array<{ argv: string[]; options?: { maxBytes?: number; timeoutMs?: number } }> = []
  const runner: Runner = {
    label: '本机（test）',
    async run(argv, options) {
      calls.push({ argv: [...argv], options })
      const isDetail = argv.includes('-v')
      const given = (isDetail ? fare.detail : fare.summary) ?? {}
      return {
        code: 0,
        stdout: isDetail ? DETAIL_TEXT : SUMMARY_TEXT,
        stderr: '',
        timedOut: false,
        truncated: false,
        durationMs: 1,
        ...given,
      }
    },
    async stream() {
      throw new Error('systemDf 不应走 stream')
    },
  }
  return { api: new DockerApi(runner, 'docker', { timeoutMs: 1_000, maxBytes: 512 * 1024 }), calls }
}

describe('DockerApi.systemDf 采集层', () => {
  it('两条命令、两份预算：汇总一条、明细一条（`-v` 单独跑，不合并）', async () => {
    const { api, calls } = fakeApi()
    await api.systemDf()
    expect(calls.map((call) => call.argv)).toEqual([
      ['docker', 'system', 'df', '--format', '{{json .}}'],
      ['docker', 'system', 'df', '-v', '--format', '{{json .}}'],
    ])
    // 明细预算独立且更宽（真机 259 个卷就 120KB，512KB 在几千个卷的机器上会截断）
    expect(calls[1]?.options?.maxBytes).toBeGreaterThanOrEqual(DISK_DETAIL_SCAN_BYTES)
    expect(calls[1]?.options?.timeoutMs).toBeGreaterThanOrEqual(60_000)
  })

  it('正常路径：summary + 明细 + totals + degraded=false', async () => {
    const { api } = fakeApi()
    const disk = await api.systemDf()
    expect(disk.summary).toHaveLength(4)
    expect(disk.images).toHaveLength(3)
    expect(disk.totals).toEqual({ images: 3, volumes: 3, buildCache: 2 })
    expect(disk.truncated).toEqual({ images: false, volumes: false, buildCache: false })
    expect(disk.degraded).toBe(false)
    expect(disk.degradedReason).toBeNull()
  })

  it('汇总失败 → 整体失败（连汇总都没有，这个视图没意义）', async () => {
    const { api } = fakeApi({ summary: { code: 1, stdout: '', stderr: 'Error response from daemon: boom' } })
    await expect(api.systemDf()).rejects.toThrow(/读取磁盘占用汇总失败/)
  })

  it('明细失败（老 docker 不认 -v --format）→ 只降级：summary 仍在、明细空、原因带原文', async () => {
    const { api } = fakeApi({ detail: { code: 1, stdout: '', stderr: 'unknown flag: -v' } })
    const disk = await api.systemDf()
    expect(disk.summary).toHaveLength(4)
    expect(disk.images).toEqual([])
    expect(disk.volumes).toEqual([])
    expect(disk.buildCache).toEqual([])
    expect(disk.degraded).toBe(true)
    expect(disk.degradedReason).toContain('unknown flag')
    // 「明细取不到」不是「明细被截断」：totals 归零、truncated 不置位
    expect(disk.totals).toEqual({ images: 0, volumes: 0, buildCache: 0 })
    expect(disk.truncated).toEqual({ images: false, volumes: false, buildCache: false })
  })

  it('明细被字节闸截断 → 同样降级（截断的 JSON 解析不了，硬解析会得到半截数据）', async () => {
    const { api } = fakeApi({ detail: { truncated: true } })
    const disk = await api.systemDf()
    expect(disk.degraded).toBe(true)
    expect(disk.degradedReason).toContain('截断')
    expect(disk.images).toEqual([])
  })

  it('明细输出不是预期形状 → 降级并说明「版本可能不支持」', async () => {
    const { api } = fakeApi({ detail: { stdout: '{"Foo":1}' } })
    const disk = await api.systemDf()
    expect(disk.degraded).toBe(true)
    expect(disk.degradedReason).toContain('不支持')
  })
})
