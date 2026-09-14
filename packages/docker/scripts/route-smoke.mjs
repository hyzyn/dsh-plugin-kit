#!/usr/bin/env node
/**
 * @hyzyn/dsh-docker — 宿主端集成回归（假 ctx + 假 docker CLI，无需真 daemon）。
 *
 * 覆盖：
 *   - 插件挂载：settings 命名空间注册、agent 工具注册、HTTP 路由注册、能力公告
 *   - 路由端到端：/config（含凭证脱敏与未知键拒绝）、/targets、/probe、/containers、
 *     /inspect、/logs、/logs/stream（SSE 事件序列与参数校验）、/stats、/images、
 *     /action、/exec
 *   - 信任模型：默认只读 → /action 与 /exec 403，且对应 agent 工具不注册；
 *     打开开关后（含 settings/updated 热更新路径）立刻解锁
 *   - 禁用热生效：enabled=false → 工具清空、公告撤下、数据路由 403，/config 保持
 *     可读写（卡片渲染与重新启用的唯一入口）；含 settings 已禁用时的挂载路径
 *   - 安全：非 loopback 请求 403；容器名/ID 注入尝试被白名单拒绝
 *
 * 用法：pnpm --filter @hyzyn/dsh-docker build && node scripts/route-smoke.mjs
 */
import { strict as assert } from 'node:assert'
import { mkdtempSync, writeFileSync, chmodSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const host = await import('../lib/index.js')

/* ------------------------------------------------------------------ *
 * 假 docker CLI（本机目标的 dockerBin 指向它）
 * ------------------------------------------------------------------ */

const dir = mkdtempSync(join(tmpdir(), 'dsh-docker-smoke-'))
const fakeBin = join(dir, 'fake-docker')

/** 需关注用例：已退出且非零退出码（inspect 会补上 OOMKilled）。 */
const PS_BAD_LINE = JSON.stringify({
  ID: 'bad0c0ffee1234',
  Image: 'app/broken:latest',
  Labels: '',
  Names: 'broken-worker',
  Ports: '',
  State: 'exited',
  Status: 'Exited (137) 4 minutes ago',
})
const PS_LINE = JSON.stringify({
  ID: '9f2c1d4e5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d',
  Image: 'nginx:1.27',
  Labels: 'com.docker.compose.project=shop,com.docker.compose.service=web',
  Names: 'shop-web-1',
  Ports: '0.0.0.0:8080->80/tcp',
  State: 'running',
  Status: 'Up 8 days (healthy)',
})
const INSPECT_JSON = JSON.stringify([{
  Id: '9f2c1d4e5a6b',
  Name: '/shop-web-1',
  Image: 'sha256:deadbeef',
  RestartCount: 1,
  State: { Status: 'running', ExitCode: 0, Pid: 123, Health: { Status: 'healthy', Log: [] } },
  Config: { Image: 'nginx:1.27', Cmd: ['nginx'], Labels: {} },
  HostConfig: { RestartPolicy: { Name: 'unless-stopped' } },
  Mounts: [],
  NetworkSettings: { Ports: { '80/tcp': [{ HostIp: '0.0.0.0', HostPort: '8080' }] }, Networks: {} },
}])
/** OOM 被杀容器的 inspect（ExitCode 137 + OOMKilled true）。 */
const INSPECT_BAD_JSON = JSON.stringify([{
  Id: 'bad0c0ffee1234',
  Name: '/broken-worker',
  Image: 'sha256:cafe',
  RestartCount: 7,
  State: { Status: 'exited', ExitCode: 137, OOMKilled: true, StartedAt: '2026-09-09T10:00:00Z', FinishedAt: '2026-09-09T10:05:00Z' },
  Config: { Image: 'app/broken:latest', Cmd: ['node'], Labels: {} },
  HostConfig: {},
  Mounts: [],
  NetworkSettings: { Ports: {}, Networks: {} },
}])
const STATS_LINE = JSON.stringify({ ID: '9f2c1d4e5a6b', Name: 'shop-web-1', CPUPerc: '0.50%', MemUsage: '128MiB / 7.66GiB', MemPerc: '1.60%', NetIO: '1kB / 2kB', BlockIO: '0B / 0B', PIDs: '5' })
const IMAGES_LINE = JSON.stringify({ ID: 'sha256:aaaa1111bbbb2222', Repository: 'nginx', Tag: '1.27', Size: '142MB', CreatedSince: '2 weeks ago' })
const IMAGE_INSPECT_JSON = JSON.stringify([{
  Id: 'sha256:aaaa1111bbbb2222cccc3333',
  RepoTags: ['nginx:1.27'],
  RepoDigests: ['nginx@sha256:deadbeef'],
  Size: 142000000,
  Created: '2026-08-20T09:00:00.000000000Z',
  Architecture: 'amd64',
  Os: 'linux',
  Config: { Cmd: ['nginx'], Entrypoint: [], Labels: { maintainer: 'ops' } },
  RootFS: { Type: 'layers', Layers: ['sha256:l1', 'sha256:l2'] },
}])
const IMAGE_HISTORY_LINE = JSON.stringify({ ID: 'sha256:l2', CreatedSince: '2 weeks ago', CreatedBy: '/bin/sh -c #(nop) CMD ["nginx"]', Size: '0B' })
const EVENT_START_LINE = JSON.stringify({ Action: 'start', Type: 'container', Actor: { ID: 'aaaaaaaaaaaaaaaa', Attributes: { name: 'shop-web-1', image: 'nginx:1.27', 'com.docker.compose.project': 'shop' } }, time: 1700000000 })
// 白名单外的噪音：服务端必须丢掉它，客户端才不会为每次 docker exec 刷一次列表
const EVENT_NOISE_LINE = JSON.stringify({ Action: 'exec_start', Type: 'container', Actor: { ID: 'cccc', Attributes: { name: 'shop-web-1' } }, time: 1700000001 })
const EVENT_DIE_LINE = JSON.stringify({ Action: 'die', Type: 'container', Actor: { ID: 'bbbb', Attributes: { name: 'shop-web-1', image: 'nginx:1.27', exitCode: '137' } }, time: 1700000005 })
const NETWORK_LS_LINE = JSON.stringify({ ID: '8d5028a7e8b1', Name: 'shop_default', Driver: 'bridge', Scope: 'local', IPv4: 'false', IPv6: 'false', Internal: 'false', Labels: '' })
const NETWORK_INSPECT_JSON = JSON.stringify([{
  Id: '8d5028a7e8b1',
  Name: 'shop_default',
  Driver: 'bridge',
  Scope: 'local',
  Created: '2026-09-01T02:00:00Z',
  Internal: false,
  Attachable: false,
  Ingress: false,
  EnableIPv6: false,
  IPAM: { Config: [{ Subnet: '172.20.0.0/16', Gateway: '172.20.0.1' }] },
  Options: {},
  Labels: { 'com.docker.compose.project': 'shop' },
  Containers: { '9f2c1d4e5a6b': { Name: 'shop-web-1', IPv4Address: '172.20.0.3/16', IPv6Address: '', MacAddress: '02:42:ac:14:00:03' } },
}])
const VOLUME_LS_LINE = JSON.stringify({ Name: 'pgdata', Driver: 'local', Scope: 'local', Mountpoint: '/var/lib/docker/volumes/pgdata/_data' })
const VOLUME_INSPECT_JSON = JSON.stringify([{ Name: 'pgdata', Driver: 'local', Scope: 'local', Mountpoint: '/var/lib/docker/volumes/pgdata/_data', CreatedAt: '2026-09-01T02:00:00Z', Options: {}, Labels: { keep: 'true' } }])

writeFileSync(fakeBin, `#!/bin/sh
cmd="$1"
case "$cmd" in
  version) echo "27.3.1" ;;
  ps) printf '%s\\n' '${PS_LINE}'; printf '%s\\n' '${PS_BAD_LINE}' ;;
  inspect) case "$*" in *bad0c0ffee*) printf '%s' '${INSPECT_BAD_JSON}' ;; *) printf '%s' '${INSPECT_JSON}' ;; esac ;;
  logs) echo "stdout line 1"; echo "stderr line 1" >&2 ;;
  stats) printf '%s\\n' '${STATS_LINE}' ;;
  images) printf '%s\\n' '${IMAGES_LINE}' ;;
  image)
    case "$2" in
      inspect) printf '%s' '${IMAGE_INSPECT_JSON}' ;;
      rm) echo "Untagged: nginx:1.27"; echo "deleted: sha256:aaaa" ;;
      prune) echo "Total reclaimed space: 1.2GB" ;;
      *) echo "fake-docker: unsupported image $2" >&2; exit 1 ;;
    esac
    ;;
  history) printf '%s\\n' '${IMAGE_HISTORY_LINE}' ;;
  pull) echo "Pulling from library/nginx"; echo "Status: Downloaded newer image for nginx:1.27" ;;
  events) printf '%s\\n' '${EVENT_START_LINE}'; printf '%s\\n' '${EVENT_NOISE_LINE}'; printf '%s\\n' '${EVENT_DIE_LINE}' ;;
  network)
    case "$2" in
      ls) printf '%s\\n' '${NETWORK_LS_LINE}' ;;
      inspect) printf '%s' '${NETWORK_INSPECT_JSON}' ;;
      rm) echo "shop_default" ;;
      prune) echo "Deleted Networks:"; echo "shop_default" ;;
      *) echo "fake-docker: unsupported network $2" >&2; exit 1 ;;
    esac
    ;;
  volume)
    case "$2" in
      ls) printf '%s\\n' '${VOLUME_LS_LINE}' ;;
      inspect) printf '%s' '${VOLUME_INSPECT_JSON}' ;;
      rm) echo "pgdata" ;;
      prune) echo "Deleted Volumes:"; echo "pgdata" ;;
      *) echo "fake-docker: unsupported volume $2" >&2; exit 1 ;;
    esac
    ;;
  start|stop|restart|rm) echo "shop-web-1" ;;
  exec) echo "hi" ;;
  *) echo "fake-docker: unsupported $cmd" >&2; exit 1 ;;
esac
`)
chmodSync(fakeBin, 0o755)

/* ------------------------------------------------------------------ *
 * 假 cordis ctx
 * ------------------------------------------------------------------ */

function makeCtx(config, options = {}) {
  const state = {
    tools: [],
    routes: [],
    prompts: [],
    listeners: new Map(),
    settingsStored: {},
    ttyConfig: options.ttyConfig,
    disposers: [],
  }

  const scopeFor = (base) => ({
    get: () => ({ ...base, ...state.settingsStored }),
    update: async (patch) => {
      Object.assign(state.settingsStored, patch)
      // 真实实现会 emit settings/updated；这里同步触发，验证热更新路径
      const listeners = state.listeners.get('settings/updated') ?? []
      for (const listener of listeners) listener('docker', { ...base, ...state.settingsStored }, undefined, 'update')
    },
  })

  const makeChild = (names) => {
    const child = {
      logger: { info: () => {}, warn: () => {} },
      effect: (callback, _name) => {
        const dispose = callback()
        state.disposers.push(typeof dispose === 'function' ? dispose : () => {})
        return () => {}
      },
      inject: (childNames, cb) => {
        const grand = makeChild(childNames)
        cb(grand)
        return () => {}
      },
      events: {
        on: (name, listener) => {
          const list = state.listeners.get(name) ?? []
          list.push(listener)
          state.listeners.set(name, list)
          return () => {}
        },
      },
    }
    if (names.includes('tools')) {
      child.tools = {
        register: (definition) => {
          state.tools.push(definition)
          return () => {
            const index = state.tools.indexOf(definition)
            if (index >= 0) state.tools.splice(index, 1)
          }
        },
      }
    }
    if (names.includes('webServer')) {
      child.webServer = {
        register: (route) => {
          state.routes.push(route)
          return () => {}
        },
      }
    }
    if (names.includes('settings')) {
      child.settings = {
        register: (ns, schema, options_) => scopeFor(options_?.base ?? {}),
        get: (ns) => (ns === 'tty' ? state.ttyConfig : undefined),
      }
    }
    if (names.includes('systemPrompt')) {
      child.systemPrompt = {
        section: (options_) => {
          state.prompts.push(options_)
          // 与 tools.register 对称：dispose 从列表摘除，禁用撤公告的路径才可断言
          return () => {
            const index = state.prompts.indexOf(options_)
            if (index >= 0) state.prompts.splice(index, 1)
          }
        },
      }
    }
    return child
  }

  const root = makeChild([])
  root.inject = (names, cb) => {
    cb(makeChild(names))
    return () => {}
  }
  return { ctx: root, state }
}

/* ------------------------------------------------------------------ *
 * 假 HTTP 请求 / 响应
 * ------------------------------------------------------------------ */

function makeReq(method, path, body, remoteAddress = '127.0.0.1') {
  const payload = body === undefined ? '' : JSON.stringify(body)
  const chunks = payload === '' ? [] : [Buffer.from(payload)]
  return {
    method,
    url: path,
    headers: { host: '127.0.0.1:3080', 'content-type': 'application/json' },
    socket: { remoteAddress },
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) yield chunk
    },
  }
}

function makeRes() {
  return {
    status: 0,
    headers: {},
    body: null,
    // SSE 长连接需要的最小面（write / flushHeaders / on('close')）：正常的 JSON
    // 路由仍走 writeHead + end，不受影响
    frames: [],
    flushed: false,
    closeListeners: [],
    ended: false,
    writeHead(status, headers) {
      this.status = status
      this.headers = headers ?? {}
    },
    write(chunk) { this.frames.push(chunk) },
    flushHeaders() { this.flushed = true },
    on(event, listener) { if (event === 'close') this.closeListeners.push(listener) },
    end(text) {
      this.ended = true
      try {
        this.body = text === undefined ? null : JSON.parse(text)
      } catch {
        this.body = text
      }
    },
  }
}

const results = []
async function test(name, fn) {
  try {
    await fn()
    results.push({ name, ok: true })
  } catch (error) {
    results.push({ name, ok: false, message: error instanceof Error ? error.message : String(error) })
  }
}

/* ------------------------------------------------------------------ *
 * 挂载插件
 * ------------------------------------------------------------------ */

const TTY_CONFIG = {
  sshHosts: [{ name: 'prod-a', host: '10.0.0.5', port: 2222, username: 'root', auth: 'agent' }],
  hostKeys: [{ host: '10.0.0.5', port: 2222, fingerprint: 'seeded-fingerprint' }],
}

const MOUNT_TARGETS = [
  { name: '本机', kind: 'local' },
  { name: '远程', kind: 'ssh', book: 'prod-a' },
  // 故意放一个明文密码（env: 引用）：验证 /config 不回显
  { name: '直连', kind: 'ssh', host: '10.0.0.9', username: 'ops', auth: 'password', password: 'env:FAKE_PW' },
]

const { ctx, state } = makeCtx({ dockerBin: fakeBin, targets: MOUNT_TARGETS }, { ttyConfig: TTY_CONFIG })

host.apply({ ...ctx }, { dockerBin: fakeBin, targets: MOUNT_TARGETS })

const route = state.routes.find((item) => item.path === '/api/dsh-docker')
assert.ok(route !== undefined, '未注册 /api/dsh-docker 路由')

async function call(method, sub, body, remoteAddress) {
  const res = makeRes()
  await route.handler(makeReq(method, '/api/dsh-docker' + sub, body, remoteAddress), res)
  return res
}

function toolNames() {
  return state.tools.map((item) => item.name)
}

/* ------------------------------------------------------------------ *
 * 1. 挂载面
 * ------------------------------------------------------------------ */

await test('挂载：注册 11 个只读 agent 工具', () => {
  const names = toolNames().sort()
  assert.deepEqual(names, ['docker_attention', 'docker_events', 'docker_image_inspect', 'docker_images', 'docker_inspect', 'docker_logs', 'docker_networks', 'docker_ps', 'docker_stats', 'docker_targets', 'docker_volumes'])
})

await test('挂载：注册能力公告 section', () => {
  assert.equal(state.prompts.length, 1)
  assert.equal(state.prompts[0].name, 'plugin:dsh-docker')
  assert.match(state.prompts[0].text, /默认只读/)
})

await test('挂载：路由为 prefix /api/dsh-docker', () => {
  assert.equal(route.kind, 'prefix')
  assert.equal(route.path, '/api/dsh-docker')
})

/* ------------------------------------------------------------------ *
 * 2. 配置路由
 * ------------------------------------------------------------------ */

await test('GET /config：凭证脱敏 + 只读默认 + 复用 tty 连接簿名', async () => {
  const res = await call('GET', '/config')
  assert.equal(res.status, 200)
  const config = res.body.config
  assert.equal(config.allowMutations, false)
  assert.equal(config.allowExec, false)
  assert.equal(config.dockerBin, fakeBin)
  assert.deepEqual(config.ttyBooks, ['prod-a'])
  assert.equal(config.ttyAvailable, true)
  assert.equal(JSON.stringify(config).includes('FAKE_PW'), false)
  for (const target of config.targets) {
    assert.equal(Object.hasOwn(target, 'password'), false)
    assert.equal(Object.hasOwn(target, 'passphrase'), false)
  }
  const direct = config.targets.find((item) => item.name === '直连')
  assert.equal(direct.passwordSet, true)
  assert.equal(direct.passphraseSet, false)
  assert.deepEqual(config.toolsRegistered.sort(), ['docker_attention', 'docker_events', 'docker_image_inspect', 'docker_images', 'docker_inspect', 'docker_logs', 'docker_networks', 'docker_ps', 'docker_stats', 'docker_targets', 'docker_volumes'])
})

await test('POST /config：未知键被拒绝', async () => {
  const res = await call('POST', '/config', { nope: 1 })
  assert.equal(res.status, 400)
  assert.match(res.body.error, /未知配置项/)
})

await test('GET /targets：连接簿条目解析出 user@host', async () => {
  const res = await call('GET', '/targets')
  assert.equal(res.status, 200)
  const rows = res.body.targets
  assert.equal(rows.length, 3)
  assert.equal(rows[0].label, '本机')
  assert.equal(rows[1].label, 'root@10.0.0.5:2222')
  assert.equal(rows[2].label, 'ops@10.0.0.9')
})

await test('POST /targets：解析连接簿（与 GET 等价）', async () => {
  const res = await call('POST', '/targets', {})
  assert.equal(res.status, 200)
  assert.equal(res.body.targets.length, 3)
})

/* ------------------------------------------------------------------ *
 * 3. Docker 操作路由（假 CLI）
 * ------------------------------------------------------------------ */

await test('POST /probe：返回服务端版本', async () => {
  const res = await call('POST', '/probe', { target: '本机' })
  assert.equal(res.status, 200)
  assert.equal(res.body.probe.ok, true)
  assert.equal(res.body.probe.serverVersion, '27.3.1')
})

await test('POST /containers：解析容器列表', async () => {
  const res = await call('POST', '/containers', { target: '本机', all: true })
  assert.equal(res.status, 200)
  const rows = res.body.containers
  assert.equal(rows.length, 2) // 正常容器 + OOM 容器
  const web = rows.find((row) => row.name === 'shop-web-1')
  assert.ok(web !== undefined)
  assert.equal(rows[0].state, 'running')
  assert.equal(rows[0].health, 'healthy')
  assert.equal(rows[0].composeProject, 'shop')
})

await test('POST /inspect：解析详情', async () => {
  const res = await call('POST', '/inspect', { target: '本机', id: 'shop-web-1' })
  assert.equal(res.status, 200)
  assert.equal(res.body.details[0].name, 'shop-web-1')
  assert.equal(res.body.details[0].health, 'healthy')
})

await test('POST /logs：合并 stdout 与 stderr', async () => {
  const res = await call('POST', '/logs', { target: '本机', id: 'shop-web-1', tail: 50 })
  assert.equal(res.status, 200)
  assert.match(res.body.logs.text, /stdout line 1/)
  assert.match(res.body.logs.text, /stderr line 1/)
})

await test('GET /logs/stream：SSE 事件序列（line stdout/stderr → end）', async () => {
  const res = await call('GET', '/logs/stream?target=本机&id=shop-web-1&tail=50')
  assert.equal(res.status, 200)
  assert.equal(res.headers['content-type'], 'text/event-stream; charset=utf-8')
  assert.equal(res.headers['cache-control'], 'no-cache')
  assert.equal(res.flushed, true)
  const text = res.frames.join('')
  assert.match(text, /event: line\ndata: \{"d":"stdout line 1\\n"\}\n\n/)
  assert.match(text, /event: line\ndata: \{"e":"stderr line 1\\n"\}\n\n/)
  assert.match(text, /event: end\ndata: \{"reason":"container-exit","code":0\}\n\n/)
  assert.equal(res.ended, true)
})

await test('GET /logs/stream：缺 id 400 / 非法 id 400 / 非 GET 405 / 非 loopback 403', async () => {
  const missing = await call('GET', '/logs/stream?target=本机')
  assert.equal(missing.status, 400)
  assert.match(missing.body.error, /id 必填/)

  const badId = await call('GET', '/logs/stream?target=本机&id=' + encodeURIComponent('shop-web-1; rm -rf /'))
  assert.equal(badId.status, 400)
  assert.match(badId.body.error, /container 含非法字符/)

  const wrongMethod = await call('POST', '/logs/stream?target=本机&id=shop-web-1')
  assert.equal(wrongMethod.status, 405)

  const remote = await call('GET', '/logs/stream?target=本机&id=shop-web-1', undefined, '10.0.0.9')
  assert.equal(remote.status, 403)
  assert.match(remote.body.error, /loopback-only/)
})

await test('POST /stats：解析 CPU / 内存 / PIDs', async () => {
  const res = await call('POST', '/stats', { target: '本机', ids: ['shop-web-1'] })
  assert.equal(res.status, 200)
  assert.equal(res.body.stats[0].cpuPercent, 0.5)
  assert.equal(res.body.stats[0].pids, 5)
})

await test('POST /images：解析镜像', async () => {
  const res = await call('POST', '/images', { target: '本机' })
  assert.equal(res.status, 200)
  assert.equal(res.body.images[0].reference, 'nginx:1.27')
})

await test('POST /images/inspect：镜像详情 + 构建历史', async () => {
  const res = await call('POST', '/images/inspect', { target: '本机', ref: 'nginx:1.27' })
  assert.equal(res.status, 200)
  assert.equal(res.body.image.ref, 'nginx:1.27')
  assert.equal(res.body.image.detail.layerCount, 2)
  assert.equal(res.body.image.history.length, 1)
  assert.match(res.body.image.history[0].createdBy, /CMD/)
})

await test('POST /images/inspect：缺 ref 400 / 非法 ref 500（不触达 docker）', async () => {
  const missing = await call('POST', '/images/inspect', { target: '本机' })
  assert.equal(missing.status, 400)
  assert.match(missing.body.error, /ref 必填/)
  const bad = await call('POST', '/images/inspect', { target: '本机', ref: 'nginx; rm -rf /' })
  assert.equal(bad.status, 500)
  assert.match(bad.body.error, /image 含非法字符/)
})

await test('GET /stats/stream：SSE 事件序列（stats → end stats-exit）', async () => {
  const res = await call('GET', '/stats/stream?target=本机&ids=shop-web-1')
  assert.equal(res.status, 200)
  assert.equal(res.headers['content-type'], 'text/event-stream; charset=utf-8')
  assert.equal(res.headers['cache-control'], 'no-cache')
  assert.equal(res.flushed, true)
  const text = res.frames.join('')
  assert.match(text, /event: stats\ndata: \{"id":"9f2c1d4e5a6b"/)
  assert.match(text, /event: end\ndata: \{"reason":"stats-exit","code":0\}\n\n/)
  assert.equal(res.ended, true)
})

await test('GET /stats/stream：非法 ids 400 / 非 GET 405 / 非 loopback 403', async () => {
  const bad = await call('GET', '/stats/stream?target=本机&ids=' + encodeURIComponent('web; rm -rf /'))
  assert.equal(bad.status, 400)
  assert.match(bad.body.error, /container 含非法字符/)
  const wrongMethod = await call('POST', '/stats/stream?target=本机&ids=web')
  assert.equal(wrongMethod.status, 405)
  const remote = await call('GET', '/stats/stream?target=本机&ids=web', undefined, '10.0.0.9')
  assert.equal(remote.status, 403)
  assert.match(remote.body.error, /loopback-only/)
})

await test('GET /events/stream：SSE 事件序列（白名单过滤噪音 → end events-exit）', async () => {
  const res = await call('GET', '/events/stream?target=本机')
  assert.equal(res.status, 200)
  assert.equal(res.headers['content-type'], 'text/event-stream; charset=utf-8')
  assert.equal(res.flushed, true)
  const text = res.frames.join('')
  // 白名单放行 start / die；exec_start 那条噪音必须被服务端丢掉
  assert.match(text, /event: event\ndata: \{"action":"start","name":"shop-web-1","image":"nginx:1\.27","composeProject":"shop","time":1700000000\}/)
  assert.match(text, /event: event\ndata: \{"action":"die","name":"shop-web-1","image":"nginx:1\.27","time":1700000005,"exitCode":137\}/)
  assert.equal(text.includes('exec_start'), false, '白名单外的噪音不该出现在帧里')
  assert.equal((text.match(/event: event/g) ?? []).length, 2)
  assert.match(text, /event: end\ndata: \{"reason":"events-exit","code":0\}\n\n/)
  assert.equal(res.ended, true)
})

await test('GET /events/stream：非 GET 405 / 未知目标 400 / 非 loopback 403（都不建流）', async () => {
  const wrongMethod = await call('POST', '/events/stream?target=本机')
  assert.equal(wrongMethod.status, 405)
  const unknown = await call('GET', '/events/stream?target=nope')
  assert.equal(unknown.status, 400)
  assert.match(unknown.body.error, /未知目标/)
  const remote = await call('GET', '/events/stream?target=本机', undefined, '10.0.0.9')
  assert.equal(remote.status, 403)
  assert.match(remote.body.error, /loopback-only/)
  assert.equal(remote.flushed, false)
})

await test('agent 工具：docker_events 返回过滤后的事件快照', async () => {
  const tool = state.tools.find((item) => item.name === 'docker_events')
  assert.ok(tool !== undefined)
  const value = await tool.execute({ target: '本机', since: '30m' })
  assert.equal(value.target, '本机')
  assert.equal(value.since, '30m')
  // 快照同样过白名单：exec_start 被丢掉，剩 start / die
  assert.deepEqual(value.events.map((row) => row.action), ['start', 'die'])
  assert.equal(value.events[1].exitCode, 137)
  // since 走字符集校验，注入尝试在触达 docker 之前就被拒
  await assert.rejects(() => tool.execute({ target: '本机', since: '10m; rm -rf /' }), /since 只支持/)
})

/* ------------------------------------------------------------------ *
 * 3.5 网络 / 卷（列表 / 详情 / 校验）
 * ------------------------------------------------------------------ */

await test('POST /networks：解析网络列表（internal 字符串布尔归一）', async () => {
  const res = await call('POST', '/networks', { target: '本机' })
  assert.equal(res.status, 200)
  assert.equal(res.body.networks.length, 1)
  assert.equal(res.body.networks[0].name, 'shop_default')
  assert.equal(res.body.networks[0].driver, 'bridge')
  assert.equal(res.body.networks[0].internal, false)
})

await test('POST /networks/inspect：子网 / 接入的容器', async () => {
  const res = await call('POST', '/networks/inspect', { target: '本机', name: 'shop_default' })
  assert.equal(res.status, 200)
  assert.equal(res.body.network.name, 'shop_default')
  assert.deepEqual(res.body.network.detail.subnets, [{ subnet: '172.20.0.0/16', gateway: '172.20.0.1' }])
  assert.equal(res.body.network.detail.containers[0].name, 'shop-web-1')
})

await test('POST /volumes：解析卷列表（含挂载点）', async () => {
  const res = await call('POST', '/volumes', { target: '本机' })
  assert.equal(res.status, 200)
  assert.equal(res.body.volumes[0].name, 'pgdata')
  assert.equal(res.body.volumes[0].mountpoint, '/var/lib/docker/volumes/pgdata/_data')
})

await test('POST /volumes/inspect：标签与选项', async () => {
  const res = await call('POST', '/volumes/inspect', { target: '本机', name: 'pgdata' })
  assert.equal(res.status, 200)
  assert.equal(res.body.volume.detail.mountpoint, '/var/lib/docker/volumes/pgdata/_data')
  assert.equal(res.body.volume.detail.labels.keep, 'true')
})

await test('网络 / 卷：缺 name 400，非法名 500（/ 与 : 都不允许）', async () => {
  // 只读的 inspect 走这里；remove 的门控在 name 校验之前（未开门时先 403，与镜像一致），
  // 它的 name 校验放在第 5 节（开门之后）
  for (const sub of ['/networks/inspect', '/volumes/inspect']) {
    const missing = await call('POST', sub, { target: '本机' })
    assert.equal(missing.status, 400, sub)
    assert.match(missing.body.error, /name 必填/)
  }
  const slash = await call('POST', '/networks/inspect', { target: '本机', name: 'a/b' })
  assert.equal(slash.status, 500)
  assert.match(slash.body.error, /含非法字符/)
  const colon = await call('POST', '/volumes/inspect', { target: '本机', name: 'a:b' })
  assert.equal(colon.status, 500)
  assert.match(colon.body.error, /含非法字符/)
})

/* ------------------------------------------------------------------ *
 * 4. 信任模型：默认只读
 * ------------------------------------------------------------------ */

await test('POST /action：未开启变更时 403', async () => {
  const res = await call('POST', '/action', { target: '本机', action: 'stop', id: 'shop-web-1' })
  assert.equal(res.status, 403)
  assert.match(res.body.error, /变更操作未启用/)
})

await test('网络 / 卷变更：未开启变更操作时 remove / prune 四个端点全 403', async () => {
  for (const sub of ['/networks/remove', '/networks/prune', '/volumes/remove', '/volumes/prune']) {
    const res = await call('POST', sub, { target: '本机', name: 'shop_default' })
    assert.equal(res.status, 403, sub)
    assert.match(res.body.error, /变更操作未启用/)
  }
})

await test('POST /exec：未开启 exec 时 403', async () => {
  const res = await call('POST', '/exec', { target: '本机', id: 'shop-web-1', command: 'ls' })
  assert.equal(res.status, 403)
  assert.match(res.body.error, /exec 未启用/)
})

await test('镜像变更：未开启变更操作时 /images/remove、/images/prune、pull 流全 403', async () => {
  const remove = await call('POST', '/images/remove', { target: '本机', ref: 'nginx:1.27' })
  assert.equal(remove.status, 403)
  assert.match(remove.body.error, /变更操作未启用/)
  const prune = await call('POST', '/images/prune', { target: '本机' })
  assert.equal(prune.status, 403)
  const pull = await call('GET', '/images/pull/stream?target=本机&ref=nginx:1.27')
  assert.equal(pull.status, 403)
  assert.match(pull.body.error, /变更操作未启用/)
  // 403 时不得建流（没有 SSE 响应头）
  assert.equal(pull.flushed, false)
})

await test('POST /containers：未知目标 400 并列出已配置目标', async () => {
  const res = await call('POST', '/containers', { target: '不存在' })
  assert.equal(res.status, 400)
  assert.match(res.body.error, /未知目标：不存在/)
  assert.match(res.body.error, /已配置：本机、远程、直连/)
})

await test('POST /containers：省略 target 且多目标时要求显式指定', async () => {
  const res = await call('POST', '/containers', {})
  assert.equal(res.status, 400)
  assert.match(res.body.error, /target 必填/)
})

await test('POST /inspect：容器名注入尝试被白名单拒绝', async () => {
  const res = await call('POST', '/inspect', { target: '本机', id: 'shop-web-1; rm -rf /' })
  assert.equal(res.status, 500)
  assert.match(res.body.error, /container 含非法字符/)
})

await test('非 loopback 请求 403', async () => {
  const res = await call('GET', '/config', undefined, '10.0.0.9')
  assert.equal(res.status, 403)
  assert.match(res.body.error, /loopback-only/)
})

await test('未知子路由 404', async () => {
  const res = await call('POST', '/nope', { target: '本机' })
  assert.equal(res.status, 404)
})

/* ------------------------------------------------------------------ *
 * 5. 打开能力开关（含 settings/updated 热更新路径）
 * ------------------------------------------------------------------ */

await test('POST /config 打开 allowMutations：工具与路由同时解锁', async () => {
  const res = await call('POST', '/config', { allowMutations: true })
  assert.equal(res.status, 200)
  assert.equal(res.body.config.allowMutations, true)
  assert.equal(toolNames().includes('docker_action'), true)

  const action = await call('POST', '/action', { target: '本机', action: 'start', id: 'shop-web-1' })
  assert.equal(action.status, 200)
  assert.equal(action.body.result.action, 'start')
})

await test('POST /config 打开 allowExec：docker_exec 注册且 /exec 可用', async () => {
  const res = await call('POST', '/config', { allowExec: true })
  assert.equal(res.status, 200)
  assert.equal(toolNames().includes('docker_exec'), true)

  const exec = await call('POST', '/exec', { target: '本机', id: 'shop-web-1', command: 'echo hi' })
  assert.equal(exec.status, 200)
  assert.equal(exec.body.result.code, 0)
})

await test('POST /config 打开 allowMutations：镜像变更路由与工具一起解锁', async () => {
  const names = toolNames()
  assert.equal(names.includes('docker_image_remove'), true)
  assert.equal(names.includes('docker_image_prune'), true)
  assert.equal(names.includes('docker_image_pull'), true)

  const remove = await call('POST', '/images/remove', { target: '本机', ref: 'nginx:1.27' })
  assert.equal(remove.status, 200)
  assert.match(remove.body.result.message, /Untagged/)
  const prune = await call('POST', '/images/prune', { target: '本机' })
  assert.equal(prune.status, 200)
  assert.match(prune.body.result.message, /Total reclaimed space/)
})

await test('开启变更后：网络 / 卷的 remove 与 prune 放行', async () => {
  const netRemove = await call('POST', '/networks/remove', { target: '本机', name: 'shop_default' })
  assert.equal(netRemove.status, 200)
  assert.equal(netRemove.body.result.name, 'shop_default')
  const netPrune = await call('POST', '/networks/prune', { target: '本机' })
  assert.equal(netPrune.status, 200)
  assert.match(netPrune.body.result.message, /shop_default/)
  const volRemove = await call('POST', '/volumes/remove', { target: '本机', name: 'pgdata' })
  assert.equal(volRemove.status, 200)
  assert.equal(volRemove.body.result.name, 'pgdata')
  const volPrune = await call('POST', '/volumes/prune', { target: '本机' })
  assert.equal(volPrune.status, 200)
  assert.match(volPrune.body.result.message, /pgdata/)

  // 开门之后才轮到 name 校验（门控在最前面，与镜像 /action 同序）
  for (const sub of ['/networks/remove', '/volumes/remove']) {
    const missing = await call('POST', sub, { target: '本机' })
    assert.equal(missing.status, 400, sub)
    assert.match(missing.body.error, /name 必填/)
  }
})

await test('agent 工具：docker_networks / docker_volumes 列清单（变更类不注册工具）', async () => {
  const netTool = state.tools.find((item) => item.name === 'docker_networks')
  assert.ok(netTool !== undefined)
  const nets = await netTool.execute({ target: '本机' })
  assert.equal(nets.target, '本机')
  assert.deepEqual(nets.networks[0], { name: 'shop_default', driver: 'bridge', scope: 'local', id: '8d5028a7e8b1' })

  const volTool = state.tools.find((item) => item.name === 'docker_volumes')
  assert.ok(volTool !== undefined)
  const vols = await volTool.execute({ target: '本机' })
  assert.deepEqual(vols.volumes[0], { name: 'pgdata', driver: 'local', scope: 'local', mountpoint: '/var/lib/docker/volumes/pgdata/_data' })

  // 刻意不注册变更类工具：网络 / 卷的 rm / prune 只有 HTTP 端点（agent 侧不扩大变更面）
  for (const absent of ['docker_network_remove', 'docker_network_prune', 'docker_volume_remove', 'docker_volume_prune']) {
    assert.equal(toolNames().includes(absent), false, absent + ' 不该注册')
  }
})

await test('GET /images/pull/stream：SSE 拉取进度（line → end pull-exit）', async () => {
  const res = await call('GET', '/images/pull/stream?target=本机&ref=nginx:1.27')
  assert.equal(res.status, 200)
  assert.equal(res.headers['content-type'], 'text/event-stream; charset=utf-8')
  assert.equal(res.flushed, true)
  const text = res.frames.join('')
  assert.match(text, /event: line\ndata: \{"d":"Pulling from library\/nginx/)
  assert.match(text, /Status: Downloaded newer image for nginx:1.27/)
  assert.match(text, /event: end\ndata: \{"reason":"pull-exit","code":0,"ref":"nginx:1.27"\}\n\n/)
  assert.equal(res.ended, true)
})

await test('GET /images/pull/stream：非法 ref 400（不建流）/ 缺 ref 400 / 非 GET 405', async () => {
  const bad = await call('GET', '/images/pull/stream?target=本机&ref=' + encodeURIComponent('-f'))
  assert.equal(bad.status, 400)
  assert.match(bad.body.error, /image 含非法字符/)
  assert.equal(bad.flushed, false)
  const missing = await call('GET', '/images/pull/stream?target=本机')
  assert.equal(missing.status, 400)
  assert.match(missing.body.error, /ref 必填/)
  const wrongMethod = await call('POST', '/images/pull/stream?target=本机&ref=nginx')
  assert.equal(wrongMethod.status, 405)
})

await test('agent 工具：docker_ps 经假 CLI 返回容器', async () => {
  const tool = state.tools.find((item) => item.name === 'docker_ps')
  assert.ok(tool !== undefined)
  const value = await tool.execute({ target: '本机' })
  assert.equal(value.target, '本机')
  assert.equal(value.containers[0].name, 'shop-web-1')
  assert.equal(value.containers[0].health, 'healthy')
})

await test('agent 工具：docker_logs 返回日志文本', async () => {
  const tool = state.tools.find((item) => item.name === 'docker_logs')
  const value = await tool.execute({ target: '本机', id: 'shop-web-1', tail: 10 })
  assert.match(value.text, /stdout line 1/)
  assert.match(value.text, /stderr line 1/)
})

await test('agent 工具：docker_image_inspect 返回层数与构建历史', async () => {
  const tool = state.tools.find((item) => item.name === 'docker_image_inspect')
  assert.ok(tool !== undefined)
  const value = await tool.execute({ target: '本机', ref: 'nginx:1.27' })
  assert.equal(value.ref, 'nginx:1.27')
  assert.match(value.detail, /层：2 层/)
  assert.match(value.detail, /构建历史（1 步/)
})

await test('agent 工具：docker_targets 探测目标可达性', async () => {
  const tool = state.tools.find((item) => item.name === 'docker_targets')
  const value = await tool.execute({ probe: true })
  const local = value.targets.find((item) => item.name === '本机')
  assert.equal(local.ok, true)
  // 远程目标走真 SSH（10.0.0.5 不可达）→ 应报不可用而不是抛异常
  const remote = value.targets.find((item) => item.name === '远程')
  assert.equal(remote.ok, false)
  assert.ok(typeof remote.error === 'string' && remote.error !== '')
})

/* ------------------------------------------------------------------ *
 * 5.5 跨目标聚合 + 需关注（0.15.0）
 * ------------------------------------------------------------------ */

await test('POST /containers：target=* 返回按目标分组的部分成功结果', async () => {
  const res = await call('POST', '/containers', { target: '*', all: true })
  assert.equal(res.status, 200)
  const groups = res.body.groups
  assert.equal(Array.isArray(groups), true)
  assert.equal(groups.length, 3)
  const local = groups.find((group) => group.target === '本机')
  assert.equal(local.ok, true)
  assert.equal(local.data.length, 2) // 正常容器 + OOM 容器
  // 远程目标走真 SSH（不可达）→ 该组 ok:false，但不影响其他组
  const remote = groups.find((group) => group.target === '远程')
  assert.equal(remote.ok, false)
  assert.ok(typeof remote.error === 'string' && remote.error !== '')
  assert.equal(groups.find((group) => group.target === '直连').ok, false)
})

await test('POST /attention：单目标返回需关注列表（OOM 原因来自 inspect）', async () => {
  const res = await call('POST', '/attention', { target: '本机' })
  assert.equal(res.status, 200)
  const items = res.body.items
  assert.equal(items.length, 1)
  assert.equal(items[0].name, 'broken-worker')
  assert.deepEqual(items[0].reasons, ['oom'])
  assert.equal(items[0].oomKilled, true)
  assert.equal(items[0].exitCode, 137)
  assert.equal(items[0].restartCount, 7)
})

await test('POST /attention：target=* 跨目标聚合，失败目标带 error', async () => {
  const res = await call('POST', '/attention', { target: '*' })
  assert.equal(res.status, 200)
  const groups = res.body.groups
  assert.equal(groups.length, 3)
  const local = groups.find((group) => group.target === '本机')
  assert.equal(local.ok, true)
  assert.equal(local.data.length, 1)
  assert.equal(groups.find((group) => group.target === '远程').ok, false)
})

await test('agent 工具：docker_ps 传 * 返回分组', async () => {
  const tool = state.tools.find((item) => item.name === 'docker_ps')
  const value = await tool.execute({ target: '*', all: true })
  assert.equal(Array.isArray(value.groups), true)
  const local = value.groups.find((group) => group.target === '本机')
  assert.equal(local.ok, true)
  assert.equal(local.containers.length, 2)
  assert.equal(value.groups.find((group) => group.target === '远程').ok, false)
})

await test('agent 工具：docker_attention 单目标与跨目标', async () => {
  const tool = state.tools.find((item) => item.name === 'docker_attention')
  assert.ok(tool !== undefined, 'docker_attention 未注册')
  const single = await tool.execute({ target: '本机' })
  assert.equal(single.items.length, 1)
  assert.deepEqual(single.items[0].reasons, ['oom'])
  const all = await tool.execute({ target: '*' })
  assert.equal(Array.isArray(all.groups), true)
  assert.equal(all.groups.find((group) => group.target === '本机').items.length, 1)
})

/* ------------------------------------------------------------------ *
 * 6. 数据保护：空 targets 不得静默清空（启动竞态曾导致目标被抹掉）
 * ------------------------------------------------------------------ */

await test('POST /config 空 targets（未带 clearTargets）不会清空已有目标', async () => {
  const before = (await call('GET', '/config')).body.config.targets.length
  assert.ok(before > 0, '前置条件：应已有目标')
  const res = await call('POST', '/config', { targets: [] })
  assert.equal(res.status, 200)
  assert.match(res.body.warning, /已忽略空的目标列表/)
  const after = (await call('GET', '/config')).body.config.targets.length
  assert.equal(after, before, '目标不应被空数组清空')
})

await test('POST /config 带 clearTargets: true 才允许清空目标', async () => {
  const res = await call('POST', '/config', { targets: [], clearTargets: true })
  assert.equal(res.status, 200)
  assert.equal(res.body.config.targets.length, 0)
  assert.equal(res.body.warning, undefined)
})

await test('GET /config 以 settings 解析值为准（挂载竞态不再返回空目标）', async () => {
  // 重新写回一条目标后，快照必须立刻反映（而不是等 settings/updated）
  const res = await call('POST', '/config', { targets: [{ name: '本机', kind: 'local' }] })
  assert.equal(res.status, 200)
  assert.equal(res.body.config.targets.length, 1)
  const snapshot = await call('GET', '/config')
  assert.equal(snapshot.body.config.targets[0].name, '本机')
})

/* ------------------------------------------------------------------ *
 * 7. 禁用与恢复：enabled 热生效（设置卡片路径 + 重启路径）
 * ------------------------------------------------------------------ */

await test('禁用：POST /config enabled=false → 工具清空、公告撤下、数据路由 403', async () => {
  const res = await call('POST', '/config', { enabled: false })
  assert.equal(res.status, 200)
  assert.equal(res.body.config.enabled, false)
  assert.deepEqual(toolNames(), [], '禁用后不应残留任何 agent 工具')
  assert.equal(state.prompts.length, 0, '禁用后能力公告应被撤下')
  const blockedGet = await call('GET', '/targets')
  assert.equal(blockedGet.status, 403)
  assert.match(blockedGet.body.error, /插件已禁用/)
  // 日志流也一起关（SSE 分支在禁用检查之后，拿不到 200 长连接）
  const blockedStream = await call('GET', '/logs/stream?target=本机&id=shop-web-1')
  assert.equal(blockedStream.status, 403)
  // 统计 / 事件 / 拉取流一并被禁用检查拦在 200 之前
  assert.equal((await call('GET', '/stats/stream?target=本机&ids=web')).status, 403)
  assert.equal((await call('GET', '/events/stream?target=本机')).status, 403)
  assert.equal((await call('GET', '/images/pull/stream?target=本机&ref=nginx:1.27')).status, 403)
  const blockedPost = await call('POST', '/containers', { target: '本机' })
  assert.equal(blockedPost.status, 403)
  // 禁用状态下 /action 与 /exec 的每调用守卫也必须仍然兜底
  const action = await call('POST', '/action', { target: '本机', action: 'stop', id: 'shop-web-1' })
  assert.equal(action.status, 403)
  assert.match(action.body.error, /插件已禁用/)
})

await test('禁用期间：GET/POST /config 保持可用（卡片渲染与重新启用的唯一入口）', async () => {
  const read = await call('GET', '/config')
  assert.equal(read.status, 200)
  assert.equal(read.body.config.enabled, false)
  const write = await call('POST', '/config', { pollIntervalSec: 6 })
  assert.equal(write.status, 200)
})

await test('重新启用：工具（含能力开关项）、公告、数据路由全部恢复', async () => {
  const res = await call('POST', '/config', { enabled: true })
  assert.equal(res.status, 200)
  assert.equal(res.body.config.enabled, true)
  const names = toolNames()
  for (const readonly of ['docker_targets', 'docker_ps', 'docker_inspect', 'docker_logs', 'docker_stats', 'docker_images', 'docker_image_inspect', 'docker_events', 'docker_networks', 'docker_volumes']) {
    assert.equal(names.includes(readonly), true, `缺少只读工具 ${readonly}`)
  }
  // allowMutations / allowExec 在此前的用例里已打开：重启用后对应工具一并回来
  assert.equal(names.includes('docker_action'), true)
  assert.equal(names.includes('docker_exec'), true)
  assert.equal(names.includes('docker_image_remove'), true)
  assert.equal(names.includes('docker_image_prune'), true)
  assert.equal(names.includes('docker_image_pull'), true)
  assert.equal(state.prompts.length, 1)
  assert.equal(state.prompts[0].name, 'plugin:dsh-docker')
  assert.equal((await call('GET', '/targets')).status, 200)
})

await test('重启路径：settings 命名空间已禁用时挂载 → 挂载即禁用（卡片仍可读）', async () => {
  // 模拟上一次会话在设置卡片里关掉过「启用插件」：settings 命名空间持久化了 enabled:false
  const second = makeCtx({ dockerBin: fakeBin, targets: MOUNT_TARGETS }, { ttyConfig: TTY_CONFIG })
  second.state.settingsStored = { enabled: false }
  host.apply({ ...second.ctx }, { dockerBin: fakeBin, targets: MOUNT_TARGETS })
  const secondRoute = second.state.routes.find((item) => item.path === '/api/dsh-docker')
  assert.ok(secondRoute !== undefined, '挂载时仍应注册路由（禁用是运行态而非不挂载）')
  assert.deepEqual(second.state.tools, [], '挂载即禁用：不应注册任何 agent 工具')
  assert.equal(second.state.prompts.length, 0, '挂载即禁用：不应注册能力公告')
  const req = async (method, sub) => {
    const res = makeRes()
    await secondRoute.handler(makeReq(method, '/api/dsh-docker' + sub, method === 'GET' ? undefined : {}), res)
    return res
  }
  assert.equal((await req('GET', '/targets')).status, 403)
  const config = await req('GET', '/config')
  assert.equal(config.status, 200, '禁用态下 /config 必须保持可读（卡片依赖）')
  assert.equal(config.body.config.enabled, false)
})

/* ------------------------------------------------------------------ *
 * 8. 结果
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
console.log(`\n[dsh-docker] route-smoke: ${String(results.length - failed)}/${String(results.length)} 通过`)
if (failed > 0) process.exit(1)
