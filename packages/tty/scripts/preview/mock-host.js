/* eslint-disable */
/**
 * dsh-tty 预览夹具：在纯静态页面里伪造 DSH 宿主环境（module loader / fetch /
 * WebSocket），让 packages/tty/client.js 能在浏览器中独立渲染，用于视觉走查
 * 与截图回归。仅供 scripts/preview.mjs 使用，不随 npm 包发布。
 */
(function () {
  'use strict'

  const React = window.React

  /* ---------- react/jsx-runtime 垫片（React 18 UMD 不含该入口） ---------- */
  const jsx = (type, props, key) => {
    const p = {}
    let children
    if (props !== null && props !== undefined) {
      for (const k in props) {
        if (k === 'children') children = props[k]
        else p[k] = props[k]
      }
    }
    if (key !== undefined) p.key = key
    if (children === undefined) return React.createElement(type, p)
    return Array.isArray(children) ? React.createElement(type, p, ...children) : React.createElement(type, p, children)
  }
  window.__jsxRuntime = { jsx, jsxs: jsx, Fragment: React.Fragment }

  /* ---------- 假配置（结构与宿主 /api/dsh-tty/config 一致） ---------- */
  const CONFIG = {
    enabled: true,
    announceToAgent: true,
    maxSessions: 4,
    shell: '/bin/zsh',
    term: 'xterm-256color',
    colorTerm: 'truecolor',
    cwd: window.__PREVIEW_CWD || '/home/user/project',
    reconnectGraceSec: 120,
    shellIntegration: true,
    sftpStyle: window.__PREVIEW_SFTP_STYLE || 'dialog',
    persistence: window.__PREVIEW_PERSISTENCE || 'off',
    endOnPageClose: false,
    sftpLimits: { maxDownloadMb: 1024, maxUploadMb: 2048, maxUploadFiles: 1000 },
    toolsRegistered: true,
    sshHosts: [
      { name: 'prod-web-01', host: '10.20.30.41', port: 22, username: 'deploy', auth: 'key', keyPath: '~/.ssh/id_ed25519', passphrase: '', password: '', agentForward: true, persist: false },
      { name: 'staging-db', host: 'db.staging.internal', port: 2222, username: 'root', auth: 'password', keyPath: '', passphrase: '', password: 'env:STAGING_DB_PASSWORD', agentForward: false, persist: false },
    ],
    hostKeys: [
      { host: '10.20.30.41', port: 22, fingerprint: 'SHA256:9xQ2mVr7Kp3sTf1cZbLd8uYwAe4nHjR6gPoXkMvQ2Bc' },
      { host: 'db.staging.internal', port: 2222, fingerprint: 'SHA256:3fLp8Rt2Wq9yUvC4dXzN6mBsAe1hKjG7oPwXiMnQ5Bd' },
    ],
    tunnels: [
      { name: 'staging-pg', bookName: 'staging-db', direction: 'local', localPort: 15432, remoteHost: '127.0.0.1', remotePort: 5432, localTargetHost: '127.0.0.1', localTargetPort: 5432, enabled: true },
      { name: 'prod-redis', bookName: 'prod-web-01', direction: 'local', localPort: 16379, remoteHost: 'redis.internal', remotePort: 6379, localTargetHost: '127.0.0.1', localTargetPort: 6379, enabled: true },
    ],
  }
  window.__PREVIEW_CONFIG = CONFIG

  const json = (body) => Promise.resolve({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) })

  // 字段名与宿主 /api/dsh-tty/sftp/list 的 entry 一致（isDir / isSymlink / size / mtime）
  const SFTP_FILES = [
    { name: 'app', isDir: true, size: 4096, mtime: 1757300000000 },
    { name: 'logs', isDir: true, size: 4096, mtime: 1757312000000 },
    { name: 'releases', isDir: true, size: 4096, mtime: 1757290000000 },
    { name: '.env', isDir: false, size: 812, mtime: 1757311000000 },
    { name: 'docker-compose.yml', isDir: false, size: 2481, mtime: 1757309000000 },
    { name: 'nginx.conf', isDir: false, size: 1743, mtime: 1757301000000 },
    { name: 'deploy.sh', isDir: false, size: 5120, mtime: 1757311500000 },
    { name: 'current', isDir: false, isSymlink: true, size: 17, mtime: 1757311800000 },
  ]
  const LOCAL_FILES = [
    { name: 'docs', isDir: true, size: 4096, mtime: 1757300000000 },
    { name: 'packages', isDir: true, size: 4096, mtime: 1757312000000 },
    { name: 'scripts', isDir: true, size: 4096, mtime: 1757290000000 },
    { name: 'README.md', isDir: false, size: 23194, mtime: 1757311000000 },
    { name: 'package.json', isDir: false, size: 1450, mtime: 1757309000000 },
    { name: 'pnpm-lock.yaml', isDir: false, size: 53560, mtime: 1757301000000 },
  ]

  const route = (url, body) => {
    if (url.indexOf('/api/dsh-tty/config') === 0) return { ok: true, config: CONFIG }
    if (url.indexOf('/api/dsh-tty/shells') === 0) return { ok: true, shells: ['/bin/zsh', '/bin/bash', '/bin/sh', '/opt/homebrew/bin/fish'] }
    if (url.indexOf('/api/dsh-tty/env-vars') === 0) return { ok: true, names: ['STAGING_DB_PASSWORD', 'PROD_DEPLOY_KEY', 'GITHUB_TOKEN', 'OPENAI_API_KEY', 'SSH_PASSPHRASE'] }
    if (url.indexOf('/api/dsh-tty/tunnels') === 0) return { ok: true, tunnels: [
      { name: 'staging-pg', state: 'active', connections: 2, totalConnections: 17, error: '', lastForwardError: '' },
      { name: 'prod-redis', state: 'connecting', connections: 0, totalConnections: 3, error: '', lastForwardError: '' },
    ] }
    if (url.indexOf('/api/dsh-tty/sftp/list') === 0) return { ok: true, path: body && body.path ? body.path : '/srv/app', entries: SFTP_FILES }
    if (url.indexOf('/api/dsh-tty/sftp/') === 0) return { ok: true }
    if (url.indexOf('/api/dsh-tty/local-fs/list') === 0) return { ok: true, path: body && body.path ? body.path : (window.__PREVIEW_CWD || '/home/user/project'), entries: LOCAL_FILES }
    if (url.indexOf('/api/dsh-tty/local-fs') === 0) return { ok: true, home: window.__PREVIEW_HOME || '/home/user' }
    // 形状对齐 probeSummary()：{ tcp:{ok,ms}, banner:{ok}, hostkey:{state}, auth:{ok,ms} }
    if (url.indexOf('/api/dsh-tty/probe') === 0) return { ok: true, result: {
      tcp: { ok: true, ms: 8 },
      banner: { ok: true },
      hostkey: { state: 'matched' },
      auth: { ok: true, ms: 296 },
    } }
    if (url.indexOf('/api/dsh-tty/ssh-config') === 0) return { ok: true, hosts: [] }
    if (url.indexOf('/api/dsh-tty/known-hosts') === 0) return { ok: true, keys: [] }
    if (url.indexOf('/api/dsh-docker/') === 0) return dockerRoute(url.slice('/api/dsh-docker'.length), body)
    return { ok: true }
  }

  /* ---------- 假 dsh-docker API：让 docker 面板与 tty 的 ttyTerminal 端到端联调 ---------- */
  const DOCKER_TARGETS = [
    { name: '目标1', kind: 'ssh', label: 'root@192.168.80.248' },
    { name: '目标2', kind: 'local', label: '本机' },
    // 与 tty 连接簿的 prod-web-01 对齐：连接栏「容器」按钮的命中路径（docker-dock 场景）
    { name: 'prod-web-01', kind: 'ssh', label: 'deploy@10.20.30.41' },
  ]
  // 形状照搬宿主 /config：设置卡片会读 ttyBooks / hostKeys / ttyAvailable，
  // 少一个字段就是「渲染期 undefined.length」——离线场景直接崩
  window.__PREVIEW_DOCKER_CONFIG = {
    enabled: true,
    announceToAgent: true,
    dockerBin: 'docker',
    allowMutations: false,
    allowExec: true,
    pollIntervalSec: 5,
    logTailDefault: 200,
    maxOutputKb: 512,
    execTimeoutSec: 30,
    hostKeys: [],
    ttyBooks: ['prod-web-01'],
    ttyAvailable: true,
    toolsRegistered: [],
    targets: [
      { name: '目标1', kind: 'ssh', book: '', host: '192.168.80.248', port: 22, username: 'root', auth: 'agent', agentForward: false },
      { name: '目标2', kind: 'local', book: '', host: '', port: 22, username: '', auth: 'agent', agentForward: false },
      { name: 'prod-web-01', kind: 'ssh', book: 'prod-web-01', host: '', port: 22, username: '', auth: 'agent', agentForward: false },
    ],
  }
  window.__PREVIEW_DOCKER_CONTAINERS = [
    { id: 'a1b2c3d4e5f6a7b8c9d0', shortId: 'a1b2c3d4e5f6', name: 'app-web-1', image: 'app:2026.09.07', state: 'running', health: 'healthy', status: 'Up 3 days', ports: [{ hostPort: 8080, containerPort: 8080, protocol: 'tcp' }], createdAt: null, runningFor: 'Up 3 days', composeProject: 'app', composeService: 'web' },
    { id: 'b2c3d4e5f6a7b8c9d0e1', shortId: 'b2c3d4e5f6a7', name: 'app-worker-1', image: 'app:2026.09.07', state: 'running', health: null, status: 'Up 3 days', ports: [], createdAt: null, runningFor: 'Up 3 days', composeProject: 'app', composeService: 'worker' },
    { id: 'c3d4e5f6a7b8c9d0e1f2', shortId: 'c3d4e5f6a7b8', name: 'postgres', image: 'postgres:16-alpine', state: 'running', health: 'healthy', status: 'Up 5 days', ports: [{ hostPort: 5432, containerPort: 5432, protocol: 'tcp' }], createdAt: null, runningFor: 'Up 5 days', composeProject: null, composeService: null },
    { id: 'd4e5f6a7b8c9d0e1f2a3', shortId: 'd4e5f6a7b8c9', name: 'redis', image: 'redis:7-alpine', state: 'exited', health: null, status: 'Exited (0) 2 hours ago', ports: [], createdAt: null, runningFor: '', composeProject: null, composeService: null },
  ]
  const dockerRoute = (path, body) => {
    if (path === '/config') return { ok: true, config: window.__PREVIEW_DOCKER_CONFIG }
    if (path === '/targets') return { ok: true, targets: DOCKER_TARGETS }
    if (path === '/containers') return { ok: true, containers: window.__PREVIEW_DOCKER_CONTAINERS }
    if (path === '/images') return { ok: true, images: [
      { id: 'sha256:11aa', shortId: '11aa22bb33cc', tags: ['app:2026.09.07'], size: 184320000, createdAt: null, createdSince: '2 days ago' },
      { id: 'sha256:22bb', shortId: '22bb33cc44dd', tags: ['postgres:16-alpine'], size: 42000000, createdAt: null, createdSince: '3 weeks ago' },
    ] }
    // 详情形状按宿主 /inspect 的真实返回补齐：缺字段会让「概览」页在渲染期崩掉
    // （detail.mounts.length 之类），预览也就看不到日志/概览页
    if (path === '/inspect') {
      const base = window.__PREVIEW_DOCKER_CONTAINERS[0]
      return { ok: true, details: [{
        ...base,
        startedAt: '2026-09-06 04:11:22 +0800 CST',
        finishedAt: null,
        exitCode: null,
        restartCount: 0,
        restartPolicy: 'unless-stopped',
        pid: 48213,
        healthLogTail: null,
        mounts: [{ source: '/srv/app', destination: '/app', readWrite: true }],
        networks: [{ name: 'app_default', ip: '172.20.0.7' }],
        entrypoint: 'docker-entrypoint.sh',
        command: 'node server.js',
        workingDir: '/app',
        user: 'node',
      }] }
    }
    // /logs 的真实响应形状是 { id, text, truncated }（见 dsh-docker 宿主 /logs 路由）；
    // 早先这里回的是裸字符串，客户端 logs.text 拿到 undefined 直接崩掉整面板
    if (path === '/logs') return { ok: true, logs: {
      id: body && body.id ? body.id : 'app-web-1',
      truncated: false,
      text: '2026-09-09T12:00:00Z INFO  server listening on :8080\n2026-09-09T12:00:01Z INFO  connected to postgres\n2026-09-09T12:00:02Z WARN  slow query 412ms\n2026-09-09T12:00:03Z INFO  request GET /health 200 3ms\n',
    } }
    if (path === '/stats') return { ok: true, stats: [null] }
    return { ok: true }
  }

  const realFetch = window.fetch ? window.fetch.bind(window) : null
  window.fetch = (url, init) => {
    const target = typeof url === 'string' ? url : String(url && url.url ? url.url : url)
    if (target.indexOf('/api/dsh-tty/') === -1 && target.indexOf('/api/dsh-docker/') === -1) {
      return realFetch ? realFetch(url, init) : json({ ok: true })
    }
    let body = null
    try {
      body = init && typeof init.body === 'string' ? JSON.parse(init.body) : null
    } catch {
      body = null
    }
    return json(route(target, body))
  }

  /* ---------- 假 WebSocket：本地 spawn/ssh 回 ready，并投喂演示输出 ---------- */
  const SESSIONS = []
  class MockSocket extends EventTarget {
    static CONNECTING = 0
    static OPEN = 1
    static CLOSING = 2
    static CLOSED = 3
    constructor(url) {
      super()
      this.url = url
      this.readyState = MockSocket.CONNECTING
      this.onopen = null
      this.onmessage = null
      this.onclose = null
      this.onerror = null
      window.__mockSockets.push(this)
      setTimeout(() => {
        if (this.readyState !== MockSocket.CONNECTING) return
        this.readyState = MockSocket.OPEN
        if (typeof this.onopen === 'function') this.onopen({})
      }, 0)
    }
    addEventListener(type, fn, opts) {
      super.addEventListener(type, fn, opts)
    }
    removeEventListener(type, fn, opts) {
      super.removeEventListener(type, fn, opts)
    }
    _deliver(msg) {
      window.__mockLog.push('out:' + msg.t + (msg.d ? '(' + msg.d.length + ')' : ''))
      const event = new MessageEvent('message', { data: JSON.stringify(msg) })
      if (typeof this.onmessage === 'function') this.onmessage(event)
      this.dispatchEvent(event)
    }
    send(raw) {
      let msg
      try {
        msg = JSON.parse(raw)
      } catch {
        return
      }
      window.__mockLog.push('in:' + msg.t)
      const sid = msg.sid
      if (msg.t === 'spawn' || msg.t === 'ssh') {
        if (!SESSIONS.some((s) => s.sid === sid)) SESSIONS.push({ sid, attachable: true, kind: msg.t === 'ssh' ? 'ssh' : 'local', tmux: msg.persistName })
        const target = msg.t === 'ssh' ? (msg.username || 'deploy') + '@' + (msg.host || '10.20.30.41') + (msg.port && Number(msg.port) !== 22 ? ':' + msg.port : '') : undefined
        setTimeout(() => {
          this._deliver(msg.t === 'ssh'
            ? { t: 'ready', sid, kind: 'ssh', pid: null, target: msg.name ? target : target, persist: msg.persist === true }
            : { t: 'ready', sid, kind: 'local', pid: 48213, persist: msg.persist === true })
          setTimeout(() => this._deliver({ t: 'data', sid, d: msg.t === 'ssh' ? window.__PREVIEW_SSH_BANNER : window.__PREVIEW_BANNER }), 10)
        }, 20)
        return
      }
      if (msg.t === 'attach') {
        setTimeout(() => {
          this._deliver({ t: 'ready', sid, kind: 'local', pid: 48213, reattached: true })
          setTimeout(() => this._deliver({ t: 'data', sid, d: window.__PREVIEW_BANNER }), 10)
        }, 20)
        return
      }
      if (msg.t === 'sessions') {
        const list = window.__PREVIEW_AT_LIMIT
          ? [{ sid: 'other-1', attachable: true }, { sid: 'other-2', attachable: true }, { sid: 'other-3', attachable: true }, { sid: 'other-4', attachable: true }]
          : SESSIONS.slice()
        setTimeout(() => this._deliver({ t: 'sessions', list }), 5)
        return
      }
      if (msg.t === 'input') {
        // 演示用：回车回一个新提示符，普通字符回显
        if (typeof msg.d === 'string') {
          if (msg.d === '\r' || msg.d === '\n') setTimeout(() => this._deliver({ t: 'data', sid, d: '\r\n\x1b[38;2;122;162;247m❯\x1b[0m ' }), 15)
          else if (!msg.d.includes('\u0003')) setTimeout(() => this._deliver({ t: 'data', sid, d: msg.d }), 5)
        }
        return
      }
      if (msg.t === 'kill') {
        const idx = SESSIONS.findIndex((s) => s.sid === sid)
        if (idx >= 0) SESSIONS.splice(idx, 1)
      }
    }
    close() {
      this.readyState = MockSocket.CLOSED
      if (typeof this.onclose === 'function') this.onclose({ code: 1000, wasClean: true })
    }
  }
  window.__mockSockets = []
  window.__mockLog = []
  window.WebSocket = MockSocket

  /* ---------- module loader ---------- */
  window.__modules = new Map()
  window.__ModuleLoader__ = {
    load(def) {
      window.__modules.set(def.id, def)
      // 兼容：夹具最早只跑 tty 一个插件
      if (def.id === '@hyzyn/dsh-tty') window.__ttyModule = def
    },
  }

  window.__PREVIEW_SSH_BANNER =
    '\x1b[38;2;110;118;129mWelcome to Ubuntu 24.04.1 LTS (GNU/Linux 6.8.0-45-generic aarch64)\x1b[0m\r\n' +
    '\x1b[38;2;110;118;129mLast login: Mon Sep  8 12:38:52 2026 from 10.20.0.7\x1b[0m\r\n' +
    '\x1b[38;2;126;206;153mdeploy@prod-web-01\x1b[0m:\x1b[38;2;122;162;247m~/app\x1b[0m$ docker compose ps\r\n' +
    '\x1b[38;2;110;118;129mNAME                IMAGE               STATUS          PORTS\x1b[0m\r\n' +
    'app-web-1           app:2026.09.07      \x1b[38;2;126;206;153mUp 3 days\x1b[0m       0.0.0.0:8080->8080/tcp\r\n' +
    'app-worker-1        app:2026.09.07      \x1b[38;2;126;206;153mUp 3 days\x1b[0m\r\n' +
    '\x1b[38;2;126;206;153mdeploy@prod-web-01\x1b[0m:\x1b[38;2;122;162;247m~/app\x1b[0m$ '

  window.__PREVIEW_BANNER =
    '\x1b[38;2;110;118;129mLast login: Mon Sep  8 12:41:07 on ttys003\x1b[0m\r\n' +
    '\x1b[38;2;122;162;247m~/coding/webproject/deepseek-harness/dsh-plugin-kit\x1b[0m \x1b[38;2;158;206;106mpnpm\x1b[0m -r build\r\n' +
    '\x1b[38;2;97;175;239mpackages/tty build$\x1b[0m tsc -p tsconfig.json && node scripts/build-client.mjs\r\n' +
    '  client-src/index.js  \x1b[38;2;229;192;123m486.2kb\x1b[0m  \x1b[38;2;110;118;129m⟳\x1b[0m 200ms\r\n' +
    '\x1b[38;2;152;195;121m[dsh-tty] client.js built\x1b[0m\r\n' +
    '\x1b[38;2;110;118;129mDone in 1.8s\x1b[0m\r\n' +
    '\x1b[38;2;122;162;247m~/coding/webproject/deepseek-harness/dsh-plugin-kit\x1b[0m \x1b[38;2;122;162;247m❯\x1b[0m '
})()
