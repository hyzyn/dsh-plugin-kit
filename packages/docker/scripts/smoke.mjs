#!/usr/bin/env node
/**
 * @hyzyn/dsh-docker — 无 daemon 回归测试（解析器 + 命令构造 + 配置清洗）。
 *
 * 为什么不用真 docker：CI 与开发机不一定有可用 daemon，而本插件最容易出错的
 * 地方恰恰是「CLI 输出解析」与「argv 构造」——两者都能用固定样本离线验证。
 * 需要真 daemon 的端到端验证见 README 的「手工验收」一节。
 *
 * 用法：pnpm --filter @hyzyn/dsh-docker build && node scripts/smoke.mjs
 * （读取 ../lib 的构建产物，确保测的是真正发布出去的代码）
 */
import { strict as assert } from 'node:assert'

const docker = await import('../lib/docker.js')
const host = await import('../lib/index.js')
const exec = await import('../lib/ssh-exec.js')

const results = []
function test(name, fn) {
  try {
    fn()
    results.push({ name, ok: true })
  } catch (error) {
    results.push({ name, ok: false, message: error instanceof Error ? error.message : String(error) })
  }
}

/* ------------------------------------------------------------------ *
 * 1. ps 解析
 * ------------------------------------------------------------------ */

const PS_SAMPLE = [
  JSON.stringify({
    Command: '"/docker-entrypoint.sh nginx -g \'daemon off;\'"',
    CreatedAt: '2026-09-01 10:00:00 +0800 CST',
    ID: '9f2c1d4e5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d',
    Image: 'nginx:1.27',
    Labels: 'com.docker.compose.project=shop,com.docker.compose.service=web,maintainer=ops',
    LocalVolumes: '1',
    Mounts: '',
    Names: 'shop-web-1',
    Networks: 'shop_default',
    Ports: '0.0.0.0:8080->80/tcp, [::]:8080->80/tcp',
    RunningFor: '8 days ago',
    Size: '0B',
    State: 'running',
    Status: 'Up 8 days (healthy)',
  }),
  JSON.stringify({
    ID: 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
    Image: 'redis:7-alpine',
    Labels: '',
    Names: 'cache',
    Ports: '6379/tcp',
    State: 'exited',
    Status: 'Exited (137) 2 hours ago',
  }),
]

test('parsePsJson：字段映射 / compose 标签 / 端口', () => {
  const rows = docker.parsePsJson(PS_SAMPLE.join('\n'))
  assert.equal(rows.length, 2)
  const [web, cache] = rows
  assert.equal(web.name, 'shop-web-1')
  assert.equal(web.shortId, '9f2c1d4e5a6b')
  assert.equal(web.state, 'running')
  assert.equal(web.health, 'healthy')
  assert.equal(web.composeProject, 'shop')
  assert.equal(web.composeService, 'web')
  assert.deepEqual(web.ports, [
    { hostIp: '0.0.0.0', hostPort: 8080, containerPort: 80, protocol: 'tcp' },
    { hostIp: '[::]', hostPort: 8080, containerPort: 80, protocol: 'tcp' },
  ])
  assert.equal(cache.state, 'exited')
  assert.equal(cache.composeProject, null)
  assert.deepEqual(cache.ports, [{ containerPort: 6379, protocol: 'tcp' }])
})

test('parsePsJson：State 缺失时从 Status 推导（老版本 docker）', () => {
  const rows = docker.parsePsJson(JSON.stringify({ ID: 'x', Names: 'a', Image: 'i', Status: 'Up 3 minutes (unhealthy)' }))
  assert.equal(rows[0].state, 'running')
  assert.equal(rows[0].health, 'unhealthy')
})

test('parsePsJson：容忍噪声行 / 空输出 / JSON 数组', () => {
  assert.deepEqual(docker.parsePsJson(''), [])
  assert.deepEqual(docker.parsePsJson('WARNING: something\nnot json'), [])
  const arr = docker.parsePsJson(JSON.stringify([{ ID: 'a', Names: 'n', Image: 'i', Status: 'Up 1s' }]))
  assert.equal(arr.length, 1)
})

test('parsePorts：多段映射与去重', () => {
  assert.deepEqual(docker.parsePorts('0.0.0.0:80->80/tcp, 0.0.0.0:80->80/tcp, 443/tcp, 53/udp'), [
    { hostIp: '0.0.0.0', hostPort: 80, containerPort: 80, protocol: 'tcp' },
    { containerPort: 443, protocol: 'tcp' },
    { containerPort: 53, protocol: 'udp' },
  ])
})

/* ------------------------------------------------------------------ *
 * 2. stats / images 解析
 * ------------------------------------------------------------------ */

test('parseStatsJson：百分比 / 内存 / IO / PIDs', () => {
  const rows = docker.parseStatsJson(JSON.stringify({
    BlockIO: '0B / 12.3MB',
    CPUPerc: '1.25%',
    Container: '9f2c1d4e5a6b',
    ID: '9f2c1d4e5a6b',
    MemPerc: '12.50%',
    MemUsage: '256MiB / 7.66GiB',
    Name: 'shop-web-1',
    NetIO: '1.2kB / 3.4MB',
    PIDs: '7',
  }))
  assert.equal(rows.length, 1)
  const row = rows[0]
  assert.equal(row.cpuPercent, 1.25)
  assert.equal(row.memPercent, 12.5)
  assert.equal(row.memUsed, 256 * 1024 ** 2)
  assert.equal(row.memLimit, Math.round(7.66 * 1024 ** 3))
  assert.equal(row.netRx, 1200)
  assert.equal(row.netTx, 3.4e6)
  assert.equal(row.blockRead, 0)
  assert.equal(row.blockWrite, 12.3e6)
  assert.equal(row.pids, 7)
})

test('parseDockerSize / parsePercent：异常输入返回 null', () => {
  assert.equal(docker.parseDockerSize('12.3MiB'), Math.round(12.3 * 1024 ** 2))
  assert.equal(docker.parseDockerSize('N/A'), null)
  assert.equal(docker.parseDockerSize(''), null)
  assert.equal(docker.parsePercent('0.00%'), 0)
  assert.equal(docker.parsePercent('—'), null)
})

test('parseImagesJson：reference / dangling / 大小', () => {
  const rows = docker.parseImagesJson([
    JSON.stringify({ ID: 'sha256:1111111111111111', Repository: 'nginx', Tag: '1.27', Size: '142MB', CreatedSince: '2 weeks ago', CreatedAt: '2026-08-20 09:00:00 +0800 CST' }),
    JSON.stringify({ ID: 'sha256:2222222222222222', Repository: '<none>', Tag: '<none>', Size: '1.1GB', CreatedSince: '3 months ago' }),
  ].join('\n'))
  assert.equal(rows[0].reference, 'nginx:1.27')
  assert.equal(rows[0].shortId, '111111111111')
  assert.equal(rows[0].size, 142e6)
  assert.equal(rows[0].dangling, false)
  assert.equal(rows[1].dangling, true)
})

/* ------------------------------------------------------------------ *
 * 3. inspect 解析
 * ------------------------------------------------------------------ */

const INSPECT_SAMPLE = JSON.stringify([{
  Id: '9f2c1d4e5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d',
  Created: '2026-09-01T02:00:00.000000000Z',
  Name: '/shop-web-1',
  Image: 'sha256:deadbeef',
  Platform: 'linux',
  RestartCount: 2,
  State: {
    Status: 'running',
    Running: true,
    Pid: 4242,
    ExitCode: 0,
    StartedAt: '2026-09-01T02:00:01.000000000Z',
    FinishedAt: '0001-01-01T00:00:00Z',
    OOMKilled: false,
    Health: { Status: 'healthy', Log: [{ ExitCode: 0, Output: 'ready\n' }] },
  },
  Config: {
    Image: 'nginx:1.27',
    Cmd: ['nginx', '-g', 'daemon off;'],
    Entrypoint: ['/docker-entrypoint.sh'],
    WorkingDir: '/app',
    User: 'www-data',
    Labels: { 'com.docker.compose.project': 'shop', 'com.docker.compose.service': 'web' },
  },
  HostConfig: { RestartPolicy: { Name: 'unless-stopped' } },
  Mounts: [{ Type: 'bind', Source: '/srv/shop', Destination: '/usr/share/nginx/html', Mode: '', RW: false }],
  NetworkSettings: {
    Ports: { '80/tcp': [{ HostIp: '0.0.0.0', HostPort: '8080' }] },
    Networks: { shop_default: { IPAddress: '172.20.0.3' } },
  },
}])

test('parseInspectJson：状态 / 健康 / 退出码 / 挂载 / 网络 / 端口', () => {
  const details = docker.parseInspectJson(INSPECT_SAMPLE)
  assert.equal(details.length, 1)
  const d = details[0]
  assert.equal(d.name, 'shop-web-1')
  assert.equal(d.state, 'running')
  assert.equal(d.health, 'healthy')
  assert.equal(d.healthLogTail, 'ready')
  assert.equal(d.pid, 4242)
  assert.equal(d.restartCount, 2)
  assert.equal(d.restartPolicy, 'unless-stopped')
  assert.equal(d.command, 'nginx -g daemon off;')
  assert.equal(d.entrypoint, '/docker-entrypoint.sh')
  assert.deepEqual(d.ports, [{ hostIp: '0.0.0.0', hostPort: 8080, containerPort: 80, protocol: 'tcp' }])
  assert.deepEqual(d.mounts, [{ type: 'bind', source: '/srv/shop', destination: '/usr/share/nginx/html', mode: '', readWrite: false }])
  assert.deepEqual(d.networks, [{ name: 'shop_default', ip: '172.20.0.3' }])
  assert.equal(d.composeProject, 'shop')
})

test('parseInspectJson：缺字段不抛异常', () => {
  const details = docker.parseInspectJson(JSON.stringify([{ Id: 'abc', Name: '/x' }]))
  assert.equal(details[0].state, 'unknown')
  assert.equal(details[0].health, null)
  assert.deepEqual(details[0].mounts, [])
})

/* ------------------------------------------------------------------ *
 * 4. 参数校验（防命令注入）
 * ------------------------------------------------------------------ */

test('assertRef：拒绝注入尝试，放行合法名', () => {
  assert.equal(docker.assertRef('shop-web-1', 'container'), 'shop-web-1')
  assert.equal(docker.assertRef('a.b_c-1', 'container'), 'a.b_c-1')
  for (const bad of ['web; rm -rf /', 'web$(id)', 'web`id`', '--format', '', '  ', 'web name', 'a/b']) {
    assert.throws(() => docker.assertRef(bad, 'container'), /container/, `应拒绝：${JSON.stringify(bad)}`)
  }
  assert.throws(() => docker.assertRef('a'.repeat(129), 'container'), /过长/)
})

test('assertBin：只允许路径安全字符，缺省 docker', () => {
  assert.equal(docker.assertBin(undefined), 'docker')
  assert.equal(docker.assertBin('/usr/local/bin/docker'), '/usr/local/bin/docker')
  assert.equal(docker.assertBin('podman'), 'podman')
  assert.throws(() => docker.assertBin('docker; rm -rf /'), /非法字符/)
})

test('shJoin：单引号转义（远程命令不得被拆开）', () => {
  assert.equal(exec.shJoin(['docker', 'ps']), "'docker' 'ps'")
  assert.equal(exec.shJoin(['sh', '-c', "echo 'hi'"]), "'sh' '-c' 'echo '\\''hi'\\'''")
  // 关键：引号内容不会被 shell 解释
  assert.equal(exec.shJoin(['echo', '$(whoami)']), "'echo' '$(whoami)'")
})

/* ------------------------------------------------------------------ *
 * 5. 命令构造（用假 Runner 记录 argv）
 * ------------------------------------------------------------------ */

const IMAGE_INSPECT_SAMPLE = JSON.stringify([{
  Id: 'sha256:aaaa1111bbbb2222cccc3333dddd4444eeee5555ffff6666aaaa7777bbbb8888',
  RepoTags: ['nginx:1.27'],
  RepoDigests: ['nginx@sha256:deadbeef'],
  Size: 142000000,
  VirtualSize: 142000000,
  Created: '2026-08-20T09:00:00.123456789Z',
  Architecture: 'amd64',
  Os: 'linux',
  Config: {
    Entrypoint: ['/docker-entrypoint.sh'],
    Cmd: ['nginx', '-g', 'daemon off;'],
    WorkingDir: '/app',
    User: 'www-data',
    ExposedPorts: { '80/tcp': {}, '443/tcp': {} },
    Volumes: { '/data': {} },
    Labels: { maintainer: 'ops' },
  },
  RootFS: { Type: 'layers', Layers: ['sha256:l1', 'sha256:l2', 'sha256:l3'] },
}])
const IMAGE_HISTORY_LINE = JSON.stringify({ ID: 'sha256:l3', CreatedSince: '2 weeks ago', CreatedBy: '/bin/sh -c #(nop) CMD ["nginx"]', Size: '0B' })

function makeStreamHandlers() {
  return { onStdout: () => {}, onStderr: () => {} }
}

/** 只实现 stream 的假 Runner（stats / pull 流式路径用）。 */
function fakeStreamApi() {
  const calls = []
  const runner = {
    label: 'fake',
    async run() { throw new Error('run 不应在流式路径被调用') },
    async stream(argv, _handlers, signal) {
      calls.push({ argv: [...argv], ...(signal === undefined ? {} : { signal }) })
      return { code: 0 }
    },
  }
  return { api: new docker.DockerApi(runner, 'docker', { timeoutMs: 1000, maxBytes: 1024 }), calls }
}

function fakeApi() {
  const calls = []
  const runner = {
    label: 'fake',
    async run(argv, options) {
      calls.push({ argv: [...argv], options })
      const joined = argv.join(' ')
      if (joined.includes('image inspect')) return { code: 0, stdout: IMAGE_INSPECT_SAMPLE, stderr: '', timedOut: false, truncated: false, durationMs: 1 }
      if (joined.includes('history')) return { code: 0, stdout: IMAGE_HISTORY_LINE, stderr: '', timedOut: false, truncated: false, durationMs: 1 }
      if (joined.includes('image rm')) return { code: 0, stdout: 'Untagged: nginx:1.27\n', stderr: '', timedOut: false, truncated: false, durationMs: 1 }
      if (joined.includes('image prune')) return { code: 0, stdout: 'Total reclaimed space: 1.2GB\n', stderr: '', timedOut: false, truncated: false, durationMs: 1 }
      if (joined.includes('pull ')) return { code: 0, stdout: 'Pull complete\n', stderr: '', timedOut: false, truncated: false, durationMs: 1 }
      if (joined.includes('ps ')) return { code: 0, stdout: PS_SAMPLE.join('\n'), stderr: '', timedOut: false, truncated: false, durationMs: 1 }
      if (joined.includes('inspect')) return { code: 0, stdout: INSPECT_SAMPLE, stderr: '', timedOut: false, truncated: false, durationMs: 1 }
      if (joined.includes('stats')) return { code: 0, stdout: JSON.stringify({ ID: 'a', Name: 'n', CPUPerc: '0.00%', MemUsage: '1MiB / 2GiB', MemPerc: '0.05%', NetIO: '0B / 0B', BlockIO: '0B / 0B', PIDs: '1' }), stderr: '', timedOut: false, truncated: false, durationMs: 1 }
      if (joined.includes('images')) return { code: 0, stdout: JSON.stringify({ ID: 'sha256:1111', Repository: 'nginx', Tag: 'latest', Size: '1MB' }), stderr: '', timedOut: false, truncated: false, durationMs: 1 }
      if (joined.includes('version')) return { code: 0, stdout: '27.3.1\n', stderr: '', timedOut: false, truncated: false, durationMs: 1 }
      return { code: 0, stdout: 'ok\n', stderr: '', timedOut: false, truncated: false, durationMs: 1 }
    },
  }
  return { api: new docker.DockerApi(runner, 'docker', { timeoutMs: 1000, maxBytes: 1024 }), calls }
}

test('DockerApi：listContainers 构造 argv 并解析', async () => {
  const { api, calls } = fakeApi()
  const rows = await api.listContainers(true)
  assert.deepEqual(calls[0].argv, ['docker', 'ps', '-a', '--no-trunc', '--format', '{{json .}}'])
  assert.equal(rows.length, 2)
  const rows2 = await (async () => {
    const second = fakeApi()
    const list = await second.api.listContainers(false)
    assert.deepEqual(second.calls[0].argv, ['docker', 'ps', '--no-trunc', '--format', '{{json .}}'])
    return list
  })()
  assert.equal(rows2.length, 2)
})

test('DockerApi：logs 参数映射（tail / timestamps / since）', async () => {
  const { api, calls } = fakeApi()
  await api.logs('web', { tail: 5000, timestamps: true, since: '10m' })
  assert.deepEqual(calls[0].argv, ['docker', 'logs', '--tail', '5000', '--timestamps', '--since', '10m', 'web'])
  // tail 越界被夹紧到 5000
  const second = fakeApi()
  await second.api.logs('web', { tail: 999999 })
  assert.deepEqual(second.calls[0].argv, ['docker', 'logs', '--tail', '5000', 'web'])
})

test('DockerApi：action 用 rm（不带 -f），exec 经 sh -c', async () => {
  const { api, calls } = fakeApi()
  await api.action({ action: 'remove', id: 'web' })
  assert.deepEqual(calls[0].argv, ['docker', 'rm', 'web'])
  await api.action({ action: 'restart', id: 'web' })
  assert.deepEqual(calls[1].argv, ['docker', 'restart', 'web'])
  await api.exec('web', 'ls -la /app', 5000)
  assert.deepEqual(calls[2].argv, ['docker', 'exec', 'web', 'sh', '-c', 'ls -la /app'])
  assert.equal(calls[2].options.timeoutMs, 5000)
})

test('DockerApi：probe 成功/失败两种路径', async () => {
  const ok = fakeApi()
  const probeOk = await ok.api.probe()
  assert.equal(probeOk.ok, true)
  assert.equal(probeOk.serverVersion, '27.3.1')

  const failing = new docker.DockerApi({
    label: 'fake',
    async run() {
      return { code: 1, stdout: '', stderr: 'Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?', timedOut: false, truncated: false, durationMs: 1 }
    },
  }, 'docker', { timeoutMs: 1000, maxBytes: 1024 })
  const probeFail = await failing.probe()
  assert.equal(probeFail.ok, false)
  assert.match(probeFail.error, /Cannot connect to the Docker daemon/)
})

test('DockerApi：listContainers 失败时抛出可读错误', async () => {
  const failing = new docker.DockerApi({
    label: 'prod',
    async run() {
      return { code: 1, stdout: '', stderr: 'permission denied while trying to connect to the Docker daemon socket', timedOut: false, truncated: false, durationMs: 1 }
    },
  }, 'docker', { timeoutMs: 1000, maxBytes: 1024 })
  await assert.rejects(() => failing.listContainers(false), /permission denied/)
})

/* ------------------------------------------------------------------ *
 * 6. 配置清洗与目标解析
 * ------------------------------------------------------------------ */

test('normalizeConfig：默认只读，数值夹紧', () => {
  const config = host.normalizeConfig({})
  assert.equal(config.allowMutations, false)
  assert.equal(config.allowExec, false)
  assert.equal(config.dockerBin, 'docker')
  assert.equal(config.execTimeoutSec, 30)
  assert.equal(config.pollIntervalSec, 5)
  assert.equal(config.logTailDefault, 200)
  assert.equal(config.maxOutputKb, 512)
  assert.deepEqual(config.targets, [])

  const clamped = host.normalizeConfig({ execTimeoutSec: 9999, pollIntervalSec: 0, logTailDefault: -3, maxOutputKb: 1e9 })
  assert.equal(clamped.execTimeoutSec, 120)
  assert.equal(clamped.pollIntervalSec, 1)
  assert.equal(clamped.logTailDefault, 1)
  assert.equal(clamped.maxOutputKb, 8192)
})

test('sanitizeTargets：丢弃无名/重名条目，保留合法目标', () => {
  const targets = host.sanitizeTargets([
    { name: '本机', kind: 'local' },
    { name: '本机', kind: 'local' },
    { kind: 'ssh', host: 'h', username: 'u' },
    { name: 'prod', kind: 'ssh', book: 'prod-a', port: 2222, auth: 'key', keyPath: '~/.ssh/id_ed25519' },
    { name: 'bad', kind: 'ssh', port: 99999, auth: 'nope' },
    null,
  ])
  assert.equal(targets.length, 3)
  assert.deepEqual(targets.map((t) => t.name), ['本机', 'prod', 'bad'])
  assert.equal(targets[1].book, 'prod-a')
  assert.equal(targets[1].port, 2222)
  assert.equal(targets[1].auth, 'key')
  assert.equal(targets[2].port, 22)
  assert.equal(targets[2].auth, 'agent')
})

test('sanitizeHostKeys：丢弃不完整记录', () => {
  const keys = host.sanitizeHostKeys([
    { host: 'a.example.com', port: 22, fingerprint: 'abc' },
    { host: '', fingerprint: 'abc' },
    { host: 'b', fingerprint: '' },
    { host: 'c', fingerprint: 'def' },
  ])
  assert.deepEqual(keys, [
    { host: 'a.example.com', port: 22, fingerprint: 'abc' },
    { host: 'c', port: 22, fingerprint: 'def' },
  ])
})

test('resolveTarget：本机 / 连接簿命中 / 连接簿缺失 / 内联', () => {
  const books = new Map([['prod-a', { host: '10.0.0.5', port: 2222, username: 'root', auth: 'agent' }]])

  const local = host.resolveTarget({ name: '本机', kind: 'local' }, books)
  assert.deepEqual(local.resolved, { name: '本机', kind: 'local' })

  const viaBook = host.resolveTarget({ name: 'prod', kind: 'ssh', book: 'prod-a' }, books)
  assert.deepEqual(viaBook.resolved, { name: 'prod', kind: 'ssh', spec: { host: '10.0.0.5', port: 2222, username: 'root', auth: 'agent' } })

  const missing = host.resolveTarget({ name: 'prod', kind: 'ssh', book: 'nope' }, books)
  assert.equal(missing.resolved, undefined)
  assert.match(missing.error, /连接簿条目不存在：nope/)

  const inline = host.resolveTarget({ name: 'inline', kind: 'ssh', host: 'h', username: 'u' }, books)
  assert.deepEqual(inline.resolved, { name: 'inline', kind: 'ssh', spec: { host: 'h', port: 22, username: 'u', auth: 'agent', keyPath: '', password: '', passphrase: '', agentForward: false } })

  const incomplete = host.resolveTarget({ name: 'x', kind: 'ssh', host: 'h' }, books)
  assert.match(incomplete.error, /缺少 SSH 信息/)
})

test('mergeTargetSecrets：卡片提交不含密码时保留已存凭证', () => {
  const prev = [
    { name: 'prod', kind: 'ssh', book: '', host: 'h', port: 22, username: 'u', auth: 'password', keyPath: '', password: 'env:SSH_PW', passphrase: 'env:SSH_PP', agentForward: false },
  ]
  // 浏览器不回显密码：提交里没有 password/passphrase 字段
  const incoming = [{ name: 'prod', kind: 'ssh', host: 'h2', username: 'u' }]
  const merged = host.mergeTargetSecrets(prev, incoming)
  assert.equal(merged[0].password, 'env:SSH_PW')
  assert.equal(merged[0].passphrase, 'env:SSH_PP')
  assert.equal(merged[0].host, 'h2')
  // 显式空字符串 = 清空（不是「保留」）
  const cleared = host.mergeTargetSecrets(prev, [{ name: 'prod', password: '' }])
  assert.equal(cleared[0].password, '')
  // 新目标没有历史值可继承
  const fresh = host.mergeTargetSecrets(prev, [{ name: 'new', host: 'x' }])
  assert.equal(fresh[0].password, undefined)
  assert.equal(host.mergeTargetSecrets(prev, 'not-an-array'), 'not-an-array')
})

/* ------------------------------------------------------------------ *
 * 6.5 镜像详情 / 拉取进度 / 统计流
 * ------------------------------------------------------------------ */

test('parseImageInspectJson：元数据 / 层 / 端口 / 标签', () => {
  const rows = docker.parseImageInspectJson(IMAGE_INSPECT_SAMPLE)
  assert.equal(rows.length, 1)
  const d = rows[0]
  assert.equal(d.shortId, 'aaaa1111bbbb')
  assert.deepEqual(d.repoTags, ['nginx:1.27'])
  assert.deepEqual(d.repoDigests, ['nginx@sha256:deadbeef'])
  assert.equal(d.size, 142000000)
  assert.equal(d.layerCount, 3)
  assert.deepEqual(d.layers, ['sha256:l1', 'sha256:l2', 'sha256:l3'])
  assert.equal(d.entrypoint, '/docker-entrypoint.sh')
  assert.equal(d.command, 'nginx -g daemon off;')
  assert.equal(d.workingDir, '/app')
  assert.equal(d.user, 'www-data')
  assert.deepEqual(d.exposedPorts, ['443/tcp', '80/tcp'])
  assert.deepEqual(d.volumes, ['/data'])
  assert.equal(d.labels.maintainer, 'ops')
  // env 刻意不回传（inspect 的 Env 常含密钥）
  assert.equal(Object.hasOwn(d, 'env'), false)
})

test('parseImageInspectJson：缺字段不抛异常（老版本 docker）', () => {
  const rows = docker.parseImageInspectJson(JSON.stringify([{ Id: 'sha256:x', Config: {} }]))
  assert.equal(rows[0].size, null)
  assert.equal(rows[0].virtualSize, null)
  assert.deepEqual(rows[0].layers, [])
  assert.deepEqual(rows[0].repoTags, [])
  assert.equal(rows[0].state, undefined)
})

test('parseImageHistoryJson：命令 / 大小 / shortId', () => {
  const rows = docker.parseImageHistoryJson([
    JSON.stringify({ ID: 'sha256:l3', CreatedSince: '2 weeks ago', CreatedBy: '/bin/sh -c #(nop) CMD ["nginx"]', Size: '0B', Comment: '' }),
    JSON.stringify({ ID: '<missing>', CreatedSince: '2 weeks ago', CreatedBy: '/bin/sh -c #(nop) ADD file:abc in /', Size: '142MB' }),
  ].join('\n'))
  assert.equal(rows.length, 2)
  assert.equal(rows[0].shortId, 'l3')
  assert.equal(rows[0].size, 0)
  assert.match(rows[0].createdBy, /CMD/)
  assert.equal(rows[1].id, '<missing>')
  assert.equal(rows[1].size, 142e6)
})

test('parseImageHistoryText：纯文本表格兜底（老 docker 无 --format）', () => {
  const text = [
    'IMAGE          CREATED       CREATED BY                                        SIZE      COMMENT',
    'a2abf6c4d29d   2 weeks ago   /bin/sh -c #(nop)  CMD ["nginx" "-g" "daemon off;"]   0B',
    '<missing>      2 weeks ago   /bin/sh -c #(nop) ADD file:abc in /                142MB',
  ].join('\n')
  const rows = docker.parseImageHistoryText(text)
  assert.equal(rows.length, 2)
  assert.equal(rows[0].shortId, 'a2abf6c4d29d')
  assert.equal(rows[0].createdSince, '2 weeks ago')
  assert.equal(rows[0].size, 0)
  assert.match(rows[0].createdBy, /CMD/)
  assert.equal(rows[1].id, '<missing>')
  assert.equal(rows[1].size, 142e6)
})

test('assertImageRef：放行 registry / digest，拒绝 flag 与注入', () => {
  assert.equal(docker.assertImageRef('nginx:1.27', 'image'), 'nginx:1.27')
  assert.equal(docker.assertImageRef('ghcr.io/org/app@sha256:abc', 'image'), 'ghcr.io/org/app@sha256:abc')
  assert.equal(docker.assertImageRef('sha256:aaaa', 'image'), 'sha256:aaaa')
  for (const bad of ['-f', '--force', 'web; rm -rf /', 'a b', '$(id)', '`id`', '', '  ']) {
    assert.throws(() => docker.assertImageRef(bad, 'image'), /image/, '应拒绝：' + JSON.stringify(bad))
  }
  assert.throws(() => docker.assertImageRef('a'.repeat(256), 'image'), /过长/)
})

test('formatBytes：十进制单位（与 docker images 的 SIZE 一致）', () => {
  assert.equal(host.formatBytes(0), '0 B')
  assert.equal(host.formatBytes(999), '999 B')
  assert.equal(host.formatBytes(142000000), '142 MB')
  assert.equal(host.formatBytes(1500000000), '1.5 GB')
  assert.equal(host.formatBytes(Number.NaN), '—')
})

test('DockerApi：imageInspect 用 image inspect + history --format', async () => {
  const { api, calls } = fakeApi()
  const image = await api.imageInspect('nginx:1.27')
  assert.deepEqual(calls[0].argv, ['docker', 'image', 'inspect', 'nginx:1.27'])
  assert.deepEqual(calls[1].argv, ['docker', 'history', '--no-trunc', '--format', '{{json .}}', 'nginx:1.27'])
  assert.equal(image.ref, 'nginx:1.27')
  assert.equal(image.detail.layerCount, 3)
  assert.equal(image.history.length, 1)
  assert.equal(image.historyError, null)
})

test('DockerApi：history --format 失败时退回纯文本表格（老 docker）', async () => {
  const calls = []
  const plain = [
    'IMAGE          CREATED       CREATED BY                       SIZE      COMMENT',
    'abc123456789   2 weeks ago   /bin/sh -c #(nop) CMD ["nginx"]   0B',
  ].join('\n')
  const runner = {
    label: 'fake',
    async run(argv) {
      calls.push([...argv])
      const joined = argv.join(' ')
      if (joined.includes('image inspect')) return { code: 0, stdout: IMAGE_INSPECT_SAMPLE, stderr: '', timedOut: false, truncated: false, durationMs: 1 }
      if (joined.includes('--format')) return { code: 1, stdout: '', stderr: 'unknown flag: --format', timedOut: false, truncated: false, durationMs: 1 }
      return { code: 0, stdout: plain, stderr: '', timedOut: false, truncated: false, durationMs: 1 }
    },
  }
  const api = new docker.DockerApi(runner, 'docker', { timeoutMs: 1000, maxBytes: 1024 })
  const image = await api.imageInspect('nginx:1.27')
  assert.equal(image.history.length, 1)
  assert.match(image.history[0].createdBy, /CMD/)
  assert.equal(image.historyError, null)
  // 第三次调用是不带 --format 的纯文本 history
  assert.deepEqual(calls[2], ['docker', 'history', '--no-trunc', 'nginx:1.27'])
})

test('DockerApi：镜像删除 / prune / pull 的 argv（rm 不带 -f）', async () => {
  const { api, calls } = fakeApi()
  const removed = await api.imageRemove('nginx:1.27')
  assert.deepEqual(calls[0].argv, ['docker', 'image', 'rm', 'nginx:1.27'])
  assert.match(removed.message, /Untagged/)
  const pruned = await api.imagePrune()
  assert.deepEqual(calls[1].argv, ['docker', 'image', 'prune', '-f'])
  assert.match(pruned.message, /Total reclaimed space/)
  const pulled = await api.pull('nginx:1.27', 120000)
  assert.deepEqual(calls[2].argv, ['docker', 'pull', 'nginx:1.27'])
  assert.equal(pulled.code, 0)
  assert.match(pulled.text, /Pull complete/)
})

test('DockerApi：statsStream 不带 --no-stream；pullStream 走 stream 通道', async () => {
  const { api, calls } = fakeStreamApi()
  await api.statsStream(['web'], makeStreamHandlers())
  assert.deepEqual(calls[0].argv, ['docker', 'stats', '--format', '{{json .}}', 'web'])
  await api.pullStream('nginx:1.27', makeStreamHandlers())
  assert.deepEqual(calls[1].argv, ['docker', 'pull', 'nginx:1.27'])
  // 快照仍是 --no-stream（两条路径只差这一个 flag）
  const snap = fakeApi()
  await snap.api.stats(['web'])
  assert.deepEqual(snap.calls[0].argv, ['docker', 'stats', '--no-stream', '--format', '{{json .}}', 'web'])
})

test('DockerApi：imageInspect / imageRemove 拒绝非法引用（不触达执行器）', async () => {
  const { api, calls } = fakeApi()
  await assert.rejects(() => api.imageInspect('-f'), /image 含非法字符/)
  await assert.rejects(() => api.imageRemove('nginx; rm -rf /'), /image 含非法字符/)
  await assert.rejects(() => api.pullStream('', makeStreamHandlers()), /image 不能为空/)
  assert.equal(calls.length, 0)
})

/* ------------------------------------------------------------------ *
 * 7. 结果
 * ------------------------------------------------------------------ */

let failed = 0
for (const result of results) {
  if (result.ok) {
    console.log(`  ✓ ${result.name}`)
  } else {
    failed += 1
    console.error(`  ✗ ${result.name}\n      ${result.message}`)
  }
}
console.log(`\n[dsh-docker] smoke: ${String(results.length - failed)}/${String(results.length)} 通过`)
if (failed > 0) process.exit(1)
