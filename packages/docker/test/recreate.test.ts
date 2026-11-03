/**
 * @hyzyn/dsh-docker — 「现场还原」（等价 `docker run`）的回归测试。
 *
 * 断言面是**命令文本本身**：这条能力的全部价值就是「复制粘贴后能跑起来」，所以
 * 这里逐段钉参数顺序、逐条钉转义、逐条钉「故意没还原的东西必须点名」。
 *
 * 两种输入：① 真机容器（`dsh-remote-server`，compose 管理、有 named volume /
 * 自定义网络 / 凭证 env）的字段子集——它同时覆盖了「多数东西都还原得出来」和
 * 「ENTRYPOINT / 健康检查 / compose 只能近似」两条降级取向；② 手写的最小容器配置，
 * 用来单独钉端口 / 挂载 / 资源 / 设备这些分支。
 *
 * 纯模块零 IO：本文件不跑任何 docker 命令，`buildRunCommand` 只吃对象。
 */
import { describe, expect, it } from 'vitest'
import { buildRunCommand, joinCommand, shellArg } from '../src/recreate.js'
import { DockerApi } from '../src/docker.js'
import type { Runner } from '../src/docker.js'
import type { ExecResult } from '../src/ssh-exec.js'

/* ------------------------------------------------------------------ *
 * 夹具：真机 dsh-remote-server 的 inspect 字段子集（docker 28.3.2）
 * ------------------------------------------------------------------ */

const REAL_ID = '77751562a04ea510cb3a7e27e2bc2405d1b597505d40935e37759372217f0ec1'

function realRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    Id: REAL_ID,
    Name: '/dsh-remote-server',
    Config: {
      Image: 'ghcr.io/liguobao/ds-harness-remote/server:latest',
      Entrypoint: ['docker-entrypoint.sh'],
      Cmd: ['node', 'dist/main.js'],
      Env: [
        'DSH_SERVER_ACCOUNT=operator@host-a.internal',
        'DSH_SERVER_PASSWORD=not-a-real-password',
        'PATH=/usr/local/bin:/usr/bin',
        'NODE_ENV=production',
      ],
      User: 'node',
      WorkingDir: '/app',
      Hostname: '77751562a04e',
      ExposedPorts: { '8080/tcp': {} },
      Labels: { 'com.docker.compose.project': 'dsh-remote-server', 'com.docker.compose.service': 'server' },
      Healthcheck: { Test: ['CMD-SHELL', 'node -e "fetch(...)"'] },
    },
    HostConfig: {
      PortBindings: { '8080/tcp': [{ HostIp: '0.0.0.0', HostPort: '8080' }] },
      Binds: ['dsh-remote-server_server-data:/data:rw'],
      Tmpfs: null,
      NetworkMode: 'dsh-remote-server_default',
      Memory: 0,
      NanoCpus: 0,
      CapAdd: null,
      CapDrop: null,
      Devices: null,
      Privileged: false,
      Links: null,
      ExtraHosts: [],
      LogConfig: { Type: 'json-file', Config: {} },
      PidMode: '',
      IpcMode: 'private',
      UtsMode: null,
      Sysctls: null,
      SecurityOpt: null,
      RestartPolicy: { Name: 'unless-stopped', MaximumRetryCount: 0 },
    },
    Mounts: [
      { Type: 'volume', Name: 'dsh-remote-server_server-data', Source: '/var/lib/docker/volumes/dsh-remote-server_server-data/_data', Destination: '/data', Mode: 'rw', RW: true },
    ],
    ...overrides,
  }
}

/* ------------------------------------------------------------------ *
 * 1. 真机容器：参数顺序、命令、凭证提示
 * ------------------------------------------------------------------ */

describe('buildRunCommand — 真机容器（compose 管理 / named volume / 凭证 env）', () => {
  it('按契约顺序生成多行命令（-d → --name → --restart → -p → -v → --network → -e → --user → --workdir → 镜像 → cmd）', () => {
    const result = buildRunCommand(realRow())
    const lines = result.command.split('\n')
    expect(lines[0]).toBe('docker run -d \\')
    expect(result.command).toContain('  --name dsh-remote-server \\')
    expect(result.command).toContain('  --restart unless-stopped \\')
    expect(result.command).toContain('  -p 0.0.0.0:8080:8080/tcp \\')
    expect(result.command).toContain('  -v dsh-remote-server_server-data:/data \\')
    expect(result.command).toContain('  --network dsh-remote-server_default \\')
    expect(result.command).toContain('  -e DSH_SERVER_PASSWORD=not-a-real-password \\')
    expect(result.command).toContain('  --user node \\')
    expect(result.command).toContain('  --workdir /app \\')
    // 每个 cmd 参数各占一行；最后一段没有行尾反斜杠
    expect(lines[lines.length - 1]).toBe('  dist/main.js')
    expect(lines[lines.length - 2]).toBe('  node \\')
    expect(lines[lines.length - 3]).toBe('  ghcr.io/liguobao/ds-harness-remote/server:latest \\')
    // 每一行（除最后一行）都以反斜杠续行
    for (const line of lines.slice(0, -1)) expect(line.endsWith(' \\')).toBe(true)
  })

  it('命中敏感键名的 env 进 secretKeys，**值不改写**（改写了就不是等价命令）', () => {
    const result = buildRunCommand(realRow())
    expect(result.secretKeys).toEqual(['DSH_SERVER_PASSWORD'])
    expect(result.command).toContain('DSH_SERVER_PASSWORD=not-a-real-password')
  })

  it('warnings 说清 compose 只是近似 + 命令里含凭证', () => {
    const result = buildRunCommand(realRow())
    expect(result.warnings.some((line) => line.includes('Compose 项目 dsh-remote-server') && line.includes('近似'))).toBe(true)
    expect(result.warnings.some((line) => line.includes('凭证'))).toBe(true)
    // 网络是 compose 建的：重建前要先存在
    expect(result.warnings.some((line) => line.includes('dsh-remote-server_default') && line.includes('存在'))).toBe(true)
  })

  it('ENTRYPOINT / 健康检查进 omitted，且命令里**没有** --entrypoint（无法确认是否被覆盖，就不猜）', () => {
    const result = buildRunCommand(realRow())
    expect(result.command).not.toContain('--entrypoint')
    expect(result.omitted.some((line) => line.includes('ENTRYPOINT'))).toBe(true)
    expect(result.omitted.some((line) => line.includes('健康检查'))).toBe(true)
  })

  it('id / name 规范化：name 去前导斜杠，id 用 inspect 的完整值', () => {
    const result = buildRunCommand(realRow())
    expect(result.name).toBe('dsh-remote-server')
    expect(result.id).toBe(REAL_ID)
  })
})

/* ------------------------------------------------------------------ *
 * 2. 端口 / 挂载 / 网络
 * ------------------------------------------------------------------ */

describe('buildRunCommand — 端口', () => {
  const withPorts = (portBindings: Record<string, unknown>, exposedPorts: Record<string, unknown> = {}): Record<string, unknown> =>
    realRow({
      Config: { Image: 'app:1', Cmd: ['run'], Env: [], Labels: {}, ExposedPorts: exposedPorts },
      HostConfig: { PortBindings: portBindings, NetworkMode: 'bridge', RestartPolicy: { Name: 'no' } },
      Mounts: [],
    })

  it('绑定到宿主端口 → -p hostIp:hostPort:containerPort/proto', () => {
    const result = buildRunCommand(withPorts({ '80/tcp': [{ HostIp: '127.0.0.1', HostPort: '8080' }] }, { '80/tcp': {} }))
    expect(result.command).toContain('-p 127.0.0.1:8080:80/tcp')
  })

  it('没有 hostIp → -p hostPort:containerPort/proto（不补 0.0.0.0）', () => {
    const result = buildRunCommand(withPorts({ '80/tcp': [{ HostIp: '', HostPort: '8080' }] }, { '80/tcp': {} }))
    expect(result.command).toContain('-p 8080:80/tcp')
  })

  it('只 expose 没绑定 → --expose；udp 带协议；端口区间原样透传', () => {
    const result = buildRunCommand(withPorts({}, { '9000/tcp': {}, '53/udp': {} }))
    expect(result.command).toContain('--expose 9000')
    expect(result.command).toContain('--expose 53/udp')

    const ranged = buildRunCommand(withPorts({ '8000-8005/tcp': [{ HostIp: '', HostPort: '8000-8005' }] }, { '8000-8005/tcp': {} }))
    expect(ranged.command).toContain('-p 8000-8005:8000-8005/tcp')
  })

  it('绑定缺宿主端口 → 不猜，进 omitted', () => {
    const result = buildRunCommand(withPorts({ '80/tcp': [{ HostIp: '0.0.0.0' }] }, { '80/tcp': {} }))
    expect(result.command).not.toContain('-p ')
    expect(result.omitted.some((line) => line.includes('端口 80/tcp'))).toBe(true)
  })
})

describe('buildRunCommand — 挂载', () => {
  const withMounts = (mounts: unknown[], hostConfig: Record<string, unknown> = {}): Record<string, unknown> =>
    realRow({
      Config: { Image: 'app:1', Cmd: ['run'], Env: [], Labels: {} },
      HostConfig: { NetworkMode: 'bridge', RestartPolicy: { Name: 'no' }, ...hostConfig },
      Mounts: mounts,
    })

  it('bind → -v src:dest；只读加 :ro', () => {
    const result = buildRunCommand(withMounts([
      { Type: 'bind', Source: '/srv/app', Destination: '/app', RW: true },
      { Type: 'bind', Source: '/srv/conf', Destination: '/conf', RW: false },
    ]))
    expect(result.command).toContain('-v /srv/app:/app')
    expect(result.command).toContain('-v /srv/conf:/conf:ro')
  })

  it('named volume 用名字（不是宿主机路径）；tmpfs → --tmpfs', () => {
    const result = buildRunCommand(withMounts([
      { Type: 'volume', Name: 'pgdata', Destination: '/var/lib/postgresql/data', RW: true },
      { Type: 'tmpfs', Destination: '/tmp/cache', RW: true },
    ]))
    expect(result.command).toContain('-v pgdata:/var/lib/postgresql/data')
    expect(result.command).not.toContain('/var/lib/docker/volumes')
    expect(result.command).toContain('--tmpfs /tmp/cache')
  })

  it('匿名卷（64 位十六进制名）不还原，进 omitted 并给出名字', () => {
    const anonymous = 'a'.repeat(64)
    const result = buildRunCommand(withMounts([{ Type: 'volume', Name: anonymous, Destination: '/data', RW: true }]))
    expect(result.command).not.toContain(anonymous)
    expect(result.omitted.some((line) => line.includes('/data') && line.includes('匿名卷'))).toBe(true)
  })

  it('特殊挂载类型（npipe / cluster）进 omitted，不静默丢', () => {
    const result = buildRunCommand(withMounts([{ Type: 'npipe', Source: '\\\\.\\pipe\\x', Destination: '/var/run/x' }]))
    expect(result.omitted.some((line) => line.includes('npipe') && line.includes('/var/run/x'))).toBe(true)
  })
})

describe('buildRunCommand — 网络 / 资源 / 能力', () => {
  it('默认网络（default / bridge / none / 空）不写 --network；自定义写', () => {
    for (const mode of ['default', 'bridge', 'none', '']) {
      const result = buildRunCommand(realRow({ HostConfig: { NetworkMode: mode, RestartPolicy: { Name: 'no' } }, Mounts: [] }))
      expect(result.command, mode).not.toContain('--network')
    }
    const custom = buildRunCommand(realRow({ HostConfig: { NetworkMode: 'shop-net', RestartPolicy: { Name: 'no' } }, Mounts: [] }))
    expect(custom.command).toContain('--network shop-net')
  })

  it('内存 / CPU（纳核 → 核）只在实际设了上限时写', () => {
    const limited = buildRunCommand(realRow({ HostConfig: { NetworkMode: 'bridge', RestartPolicy: { Name: 'no' }, Memory: 536_870_912, NanoCpus: 1_500_000_000 }, Mounts: [] }))
    expect(limited.command).toContain('--memory 536870912')
    expect(limited.command).toContain('--cpus 1.5')

    const unlimited = buildRunCommand(realRow({ HostConfig: { NetworkMode: 'bridge', RestartPolicy: { Name: 'no' }, Memory: 0, NanoCpus: 0 }, Mounts: [] }))
    expect(unlimited.command).not.toContain('--memory')
    expect(unlimited.command).not.toContain('--cpus')
  })

  it('cap-add / cap-drop / device（含权限）', () => {
    const result = buildRunCommand(realRow({
      HostConfig: {
        NetworkMode: 'bridge',
        RestartPolicy: { Name: 'no' },
        CapAdd: ['NET_ADMIN'],
        CapDrop: ['MKNOD'],
        Devices: [{ PathOnHost: '/dev/fuse', PathInContainer: '/dev/fuse', CgroupPermissions: 'rwm' }],
      },
      Mounts: [],
    }))
    expect(result.command).toContain('--cap-add NET_ADMIN')
    expect(result.command).toContain('--cap-drop MKNOD')
    expect(result.command).toContain('--device /dev/fuse:/dev/fuse:rwm')
  })

  it('重启策略：no 不写；on-failure 带上重试次数', () => {
    const noRestart = buildRunCommand(realRow({ HostConfig: { NetworkMode: 'bridge', RestartPolicy: { Name: 'no' } }, Mounts: [] }))
    expect(noRestart.command).not.toContain('--restart')

    const retry = buildRunCommand(realRow({ HostConfig: { NetworkMode: 'bridge', RestartPolicy: { Name: 'on-failure', MaximumRetryCount: 3 } }, Mounts: [] }))
    expect(retry.command).toContain('--restart on-failure:3')
  })
})

/* ------------------------------------------------------------------ *
 * 3. 用户 / 工作目录 / 主机名
 * ------------------------------------------------------------------ */

describe('buildRunCommand — user / workdir / hostname', () => {
  it('hostname 等于容器 ID 前 12 位 = docker 的默认值，不写进命令', () => {
    const result = buildRunCommand(realRow())
    expect(result.command).not.toContain('--hostname')
  })

  it('真的自定义了 hostname 才写', () => {
    const custom = buildRunCommand(realRow({
      Config: { Image: 'app:1', Cmd: ['run'], Env: [], Labels: {}, Hostname: 'web-01' },
      Mounts: [],
      HostConfig: { NetworkMode: 'bridge', RestartPolicy: { Name: 'no' } },
    }))
    expect(custom.command).toContain('--hostname web-01')
  })

  it('user / workdir 为空时不写', () => {
    const result = buildRunCommand(realRow({
      Config: { Image: 'app:1', Cmd: ['run'], Env: [], Labels: {}, User: '', WorkingDir: '' },
      Mounts: [],
      HostConfig: { NetworkMode: 'bridge', RestartPolicy: { Name: 'no' } },
    }))
    expect(result.command).not.toContain('--user')
    expect(result.command).not.toContain('--workdir')
  })
})

/* ------------------------------------------------------------------ *
 * 4. 转义（命令必须能直接复制进 shell）
 * ------------------------------------------------------------------ */

describe('shell 转义', () => {
  it('安全字符原样，其余单引号包住；单引号按 POSIX 规则转义；空值给空串', () => {
    expect(shellArg('nginx:1.27')).toBe('nginx:1.27')
    expect(shellArg('node')).toBe('node')
    expect(shellArg('a b')).toBe("'a b'")
    expect(shellArg("it's")).toBe("'it'\\''s'")
    expect(shellArg('')).toBe("''")
    expect(shellArg('$HOME')).toBe("'$HOME'")
  })

  it('带空格 / 引号的 env 值与 cmd 参数都被正确转义', () => {
    const result = buildRunCommand(realRow({
      Config: {
        Image: 'app:1',
        Cmd: ['sh', '-c', 'echo "hello world"'],
        Env: ['MOTD=hello world'],
        Labels: {},
      },
      Mounts: [],
      HostConfig: { NetworkMode: 'bridge', RestartPolicy: { Name: 'no' } },
    }))
    expect(result.command).toContain("-e 'MOTD=hello world'")
    // 每个参数一段：`-c` 与它的值各占一行
    expect(result.command).toContain('  -c \\')
    expect(result.command).toContain(`  'echo "hello world"'`)
  })

  it('joinCommand：每段一行，除最后一段外都以反斜杠续行', () => {
    expect(joinCommand(['docker run -d', '--name x', 'nginx'])).toBe('docker run -d \\\n  --name x \\\n  nginx')
    expect(joinCommand([])).toBe('')
  })
})

/* ------------------------------------------------------------------ *
 * 5. 「故意没还原」必须点名（不许静默丢）
 * ------------------------------------------------------------------ */

describe('omitted —— 故意没还原的东西逐条点名', () => {
  const withHost = (hostConfig: Record<string, unknown>, config: Record<string, unknown> = {}): ReturnType<typeof buildRunCommand> =>
    buildRunCommand(realRow({
      Config: { Image: 'app:1', Cmd: ['run'], Env: [], Labels: {}, ...config },
      HostConfig: { NetworkMode: 'bridge', RestartPolicy: { Name: 'no' }, ...hostConfig },
      Mounts: [],
    }))

  it('--privileged', () => {
    expect(withHost({ Privileged: true }).omitted.some((line) => line.includes('--privileged'))).toBe(true)
  })

  it('--link', () => {
    expect(withHost({ Links: ['db:db'] }).omitted.some((line) => line.includes('--link'))).toBe(true)
  })

  it('非默认日志驱动', () => {
    expect(withHost({ LogConfig: { Type: 'syslog', Config: {} } }).omitted.some((line) => line.includes('syslog'))).toBe(true)
  })

  it('host pid / ipc：非默认模式点名', () => {
    const result = withHost({ PidMode: 'host', IpcMode: 'host', UtsMode: 'host' })
    expect(result.omitted.some((line) => line.includes('--pid host'))).toBe(true)
    expect(result.omitted.some((line) => line.includes('--ipc host'))).toBe(true)
    expect(result.omitted.some((line) => line.includes('--uts host'))).toBe(true)
  })

  it('sysctl / add-host / security-opt', () => {
    const result = withHost({ Sysctls: { 'net.ipv4.ip_forward': '1' }, ExtraHosts: ['db:10.0.0.5'], SecurityOpt: ['no-new-privileges'] })
    expect(result.omitted.some((line) => line.includes('--sysctl'))).toBe(true)
    expect(result.omitted.some((line) => line.includes('--add-host'))).toBe(true)
    expect(result.omitted.some((line) => line.includes('--security-opt'))).toBe(true)
  })

  it('没有 ENTRYPOINT 的容器不会凭空冒出 --entrypoint / omitted 条目', () => {
    const result = withHost({}, { Entrypoint: null })
    expect(result.command).not.toContain('--entrypoint')
    expect(result.omitted.some((line) => line.includes('ENTRYPOINT'))).toBe(false)
  })
})

/* ------------------------------------------------------------------ *
 * 6. 坏输入
 * ------------------------------------------------------------------ */

describe('坏输入', () => {
  it('既没有 Id 也没有 Name → 抛错（不生成一条半截命令）', () => {
    expect(() => buildRunCommand({})).toThrow(/无法解析容器配置/)
  })

  it('没有 Config.Image → 抛错（命令里不能缺镜像）', () => {
    expect(() => buildRunCommand({ Id: 'abc', Name: '/x', Config: {} })).toThrow(/Config\.Image/)
  })
})

/* ------------------------------------------------------------------ *
 * 7. 采集层：DockerApi.recreate()（假 Runner，不碰 shell）
 * ------------------------------------------------------------------ */

describe('DockerApi.recreate 采集层', () => {
  function fakeRunner(inspect: Partial<ExecResult> = {}): { api: DockerApi; calls: string[][] } {
    const calls: string[][] = []
    const runner: Runner = {
      label: '本机（test）',
      async run(argv) {
        calls.push([...argv])
        return { code: 0, stdout: JSON.stringify([realRow()]), stderr: '', timedOut: false, truncated: false, durationMs: 1, ...inspect }
      },
      async stream() {
        throw new Error('recreate 不应走 stream')
      },
    }
    return { api: new DockerApi(runner, 'docker', { timeoutMs: 1_000, maxBytes: 512 * 1024 }), calls }
  }

  it('argv 逐字：docker inspect <id>（拿原始行，不是解析后的 ContainerDetail）', async () => {
    const { api, calls } = fakeRunner()
    const result = await api.recreate('dsh-remote-server')
    expect(calls[0]).toEqual(['docker', 'inspect', 'dsh-remote-server'])
    expect(result.name).toBe('dsh-remote-server')
    expect(result.command.startsWith('docker run -d')).toBe(true)
  })

  it('容器 id 过白名单：注入尝试一条命令都不发', async () => {
    const { api, calls } = fakeRunner()
    await expect(api.recreate('app; rm -rf /')).rejects.toThrow(/container 含非法字符/)
    expect(calls).toHaveLength(0)
  })

  it('inspect 失败（容器不存在）→ 抛错', async () => {
    const { api } = fakeRunner({ code: 1, stdout: '', stderr: 'Error: No such container: gone' })
    await expect(api.recreate('gone')).rejects.toThrow(/读取容器详情失败/)
  })

  it('inspect 成功但一行 JSON 都没有 → 抛错（不生成空命令）', async () => {
    const { api } = fakeRunner({ stdout: '' })
    await expect(api.recreate('app')).rejects.toThrow(/容器不存在或输出无法解析/)
  })
})
