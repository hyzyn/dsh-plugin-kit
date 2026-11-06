/**
 * @hyzyn/dsh-docker — 命令构造与错误兜底的回归测试。
 *
 * 覆盖三处对 agent 命令通道的增强：
 *
 * 1. **错误 → 下一步**（`dockerErrorHint` + `assertOk`）：docker 原文照旧保留，
 *    下一行才是可执行建议；认不出的失败**不加**建议（猜错比不猜更糟）；
 * 2. **`docker ps --filter name=`**（`listContainers` 的服务端过滤）：过滤词进 argv、
 *    非法词在 spawn 之前就被拒；
 * 3. **`docker exec` 的 argv 模式**（`execArgv`）：一个 token 一个参数、不做任何展开，
 *    同时钉住旧的 `sh -c` 路径没有被改掉（两条通道并存）。
 */
import { describe, expect, it } from 'vitest'
import { DockerApi, EXEC_ARGV_MAX_CHARS, EXEC_ARGV_MAX_ITEMS, assertExecArgv, assertPsName, dockerErrorHint } from '../src/docker.js'
import type { Runner } from '../src/docker.js'
import type { ExecResult } from '../src/ssh-exec.js'

function fakeApi(reply: Partial<ExecResult> = {}): { api: DockerApi; calls: string[][] } {
  const calls: string[][] = []
  const runner: Runner = {
    label: '本机（test）',
    async run(argv) {
      calls.push([...argv])
      return {
        code: reply.code ?? 0,
        stdout: reply.stdout ?? '',
        stderr: reply.stderr ?? '',
        timedOut: reply.timedOut ?? false,
        truncated: reply.truncated ?? false,
        durationMs: 1,
      }
    },
    async stream() {
      throw new Error('本文件不应走 stream')
    },
  }
  return { api: new DockerApi(runner, 'docker', { timeoutMs: 5_000, maxBytes: 64 * 1024 }), calls }
}

/* ------------------------------------------------------------------ *
 * 1. 错误 → 下一步
 * ------------------------------------------------------------------ */

describe('dockerErrorHint — 只认 docker 真的会打出来的片段', () => {
  it.each([
    ['Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?', 'Docker Desktop'],
    ['Got permission denied while trying to connect to the Docker daemon socket', 'docker 组'],
    ['docker: command not found', 'dockerBin'],
    ['Error response from daemon: No such container: web', 'docker_ps'],
    ['Error response from daemon: No such image: nginx:9', 'docker_image_pull'],
    ['context deadline exceeded', 'timeoutSec'],
    ['Bind for 0.0.0.0:80 failed: port is already allocated', 'docker_ps'],
    ['Conflict. The container name "/web" is already in use', 'docker_ps'],
    ['(SSH) Channel open failure: open failed: no more sessions', 'MaxSessions'],
  ])('%s → 含「%s」', (stderr, needle) => {
    const hint = dockerErrorHint(stderr)
    expect(hint).not.toBeNull()
    expect(hint).toContain(needle)
  })

  it('认不出的失败返回 null（不臆测建议）', () => {
    expect(dockerErrorHint('something odd happened')).toBeNull()
    expect(dockerErrorHint('')).toBeNull()
  })

  it('SSH 认证失败不是 docker 权限问题：`Permission denied (publickey)` 不落到 docker 组那条建议', () => {
    expect(dockerErrorHint('Permission denied (publickey).')).toBeNull()
  })

  it('assertOk 把原文放第一行、建议放第二行；认不出时只有原文', async () => {
    const daemon = fakeApi({ code: 1, stderr: 'Cannot connect to the Docker daemon at unix:///var/run/docker.sock.' })
    await expect(daemon.api.listContainers(false)).rejects.toThrow(/列出容器失败（本机（test））：Cannot connect to the Docker daemon[\s\S]*下一步：daemon 不可达/)

    const odd = fakeApi({ code: 1, stderr: 'weird failure' })
    const error = await odd.api.listContainers(false).then(() => undefined, (reason: unknown) => reason as Error)
    expect(error?.message).toContain('weird failure')
    expect(error?.message).not.toContain('下一步')
  })
})

/* ------------------------------------------------------------------ *
 * 2. ps 的 name 过滤
 * ------------------------------------------------------------------ */

describe('listContainers — name 是服务端过滤，不是本地筛', () => {
  it('不给 name → argv 里没有 --filter', async () => {
    const { api, calls } = fakeApi({ stdout: '' })
    await api.listContainers(true)
    expect(calls[0]).toEqual(['docker', 'ps', '-a', '--no-trunc', '--format', '{{json .}}'])
  })

  it('给 name → 追加 --filter name=<词>（过滤先于分页，第 2 页才不会漂）', async () => {
    const { api, calls } = fakeApi({ stdout: '' })
    await api.listContainers(false, 'web')
    expect(calls[0]).toEqual(['docker', 'ps', '--filter', 'name=web', '--no-trunc', '--format', '{{json .}}'])
  })

  it('空串 = 不过滤；非法词在 spawn 之前就被拒（带空格的注入面）', async () => {
    const empty = fakeApi({ stdout: '' })
    await empty.api.listContainers(false, '   ')
    expect(empty.calls[0]).not.toContain('--filter')

    const bad = fakeApi({ stdout: '' })
    await expect(bad.api.listContainers(false, 'web;rm -rf /')).rejects.toThrow(/name 含非法字符/)
    expect(bad.calls).toHaveLength(0)
  })

  it('assertPsName 的边界：空 / 非字符串 / 过长 / 非法字符', () => {
    expect(assertPsName(undefined)).toBeUndefined()
    expect(assertPsName('  ')).toBeUndefined()
    expect(assertPsName(' shop-web_1 ')).toBe('shop-web_1')
    expect(() => assertPsName(42)).toThrow(/name 必须是字符串/)
    expect(() => assertPsName('a'.repeat(129))).toThrow(/过长/)
    expect(() => assertPsName('a/b')).toThrow(/非法字符/)
  })
})

/* ------------------------------------------------------------------ *
 * 3. exec 的两条通道
 * ------------------------------------------------------------------ */

describe('execArgv — 精确参数，不经容器内 shell', () => {
  it('argv 逐项原样进入 docker exec（空参数与空格都保住）', async () => {
    const { api, calls } = fakeApi({ stdout: 'ok' })
    const result = await api.execArgv('web', ['printf', '%s|%s', 'a b', ''])
    expect(calls[0]).toEqual(['docker', 'exec', 'web', 'printf', '%s|%s', 'a b', ''])
    expect(result.argv).toEqual(['printf', '%s|%s', 'a b', ''])
    expect(result.stdout).toBe('ok')
  })

  it('不额外插入 sh -c（与 command 模式的区别就是这条）', async () => {
    const { api, calls } = fakeApi()
    await api.execArgv('web', ['env'])
    expect(calls[0]).toEqual(['docker', 'exec', 'web', 'env'])
  })

  it('command 模式仍是 docker exec <id> sh -c <cmd>（旧路径不被替换）', async () => {
    const { api, calls } = fakeApi()
    await api.exec('web', 'df -h')
    expect(calls[0]).toEqual(['docker', 'exec', 'web', 'sh', '-c', 'df -h'])
  })

  it.each([
    [undefined, /必须是字符串数组/],
    [[], /不能为空/],
    [[''], /第一项不能为空/],
    [['  '], /第一项不能为空/],
    [[1], /每一项都必须是字符串/],
    [['a\0b'], /NUL/],
    [Array.from({ length: EXEC_ARGV_MAX_ITEMS + 1 }, () => 'x'), /最多 128 项/],
    [['a'.repeat(EXEC_ARGV_MAX_CHARS + 1)], /总长超过/],
  ])('非法 argv %j → 拒绝且不 spawn', async (argv, message) => {
    const { api, calls } = fakeApi()
    expect(() => assertExecArgv(argv)).toThrow(message)
    await expect(api.execArgv('web', argv)).rejects.toThrow(message)
    expect(calls).toHaveLength(0)
  })

  it('容器引用仍走白名单（argv 模式没有绕过 id 校验）', async () => {
    const { api, calls } = fakeApi()
    await expect(api.execArgv('web;rm', ['env'])).rejects.toThrow(/container/)
    expect(calls).toHaveLength(0)
  })
})
