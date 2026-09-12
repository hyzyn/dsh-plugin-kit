#!/usr/bin/env node
/**
 * @hyzyn/dsh-docker — 宿主端集成回归（假 ctx + 假 docker CLI，无需真 daemon）。
 *
 * 覆盖：
 *   - 插件挂载：settings 命名空间注册、agent 工具注册、HTTP 路由注册、能力公告
 *   - 路由端到端：/config（含凭证脱敏与未知键拒绝）、/targets、/probe、/containers、
 *     /inspect、/logs、/stats、/images、/action、/exec
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
const STATS_LINE = JSON.stringify({ ID: '9f2c1d4e5a6b', Name: 'shop-web-1', CPUPerc: '0.50%', MemUsage: '128MiB / 7.66GiB', MemPerc: '1.60%', NetIO: '1kB / 2kB', BlockIO: '0B / 0B', PIDs: '5' })
const IMAGES_LINE = JSON.stringify({ ID: 'sha256:aaaa1111bbbb2222', Repository: 'nginx', Tag: '1.27', Size: '142MB', CreatedSince: '2 weeks ago' })

writeFileSync(fakeBin, `#!/bin/sh
cmd="$1"
case "$cmd" in
  version) echo "27.3.1" ;;
  ps) printf '%s\\n' '${PS_LINE}' ;;
  inspect) printf '%s' '${INSPECT_JSON}' ;;
  logs) echo "stdout line 1"; echo "stderr line 1" >&2 ;;
  stats) printf '%s\\n' '${STATS_LINE}' ;;
  images) printf '%s\\n' '${IMAGES_LINE}' ;;
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
    body: null,
    writeHead(status) { this.status = status },
    end(text) {
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

await test('挂载：注册 6 个只读 agent 工具', () => {
  const names = toolNames().sort()
  assert.deepEqual(names, ['docker_images', 'docker_inspect', 'docker_logs', 'docker_ps', 'docker_stats', 'docker_targets'])
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
  assert.deepEqual(config.toolsRegistered.sort(), ['docker_images', 'docker_inspect', 'docker_logs', 'docker_ps', 'docker_stats', 'docker_targets'])
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
  assert.equal(rows.length, 1)
  assert.equal(rows[0].name, 'shop-web-1')
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

/* ------------------------------------------------------------------ *
 * 4. 信任模型：默认只读
 * ------------------------------------------------------------------ */

await test('POST /action：未开启变更时 403', async () => {
  const res = await call('POST', '/action', { target: '本机', action: 'stop', id: 'shop-web-1' })
  assert.equal(res.status, 403)
  assert.match(res.body.error, /变更操作未启用/)
})

await test('POST /exec：未开启 exec 时 403', async () => {
  const res = await call('POST', '/exec', { target: '本机', id: 'shop-web-1', command: 'ls' })
  assert.equal(res.status, 403)
  assert.match(res.body.error, /exec 未启用/)
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
  for (const readonly of ['docker_targets', 'docker_ps', 'docker_inspect', 'docker_logs', 'docker_stats', 'docker_images']) {
    assert.equal(names.includes(readonly), true, `缺少只读工具 ${readonly}`)
  }
  // allowMutations / allowExec 在此前的用例里已打开：重启用后对应工具一并回来
  assert.equal(names.includes('docker_action'), true)
  assert.equal(names.includes('docker_exec'), true)
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
