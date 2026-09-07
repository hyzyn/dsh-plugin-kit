/**
 * @hyzyn/dsh-tty — SSH 连接测试（probe）模块。
 *
 * 「连接测试」按钮的数据源：不占会话名额、不开 shell channel，只做一次
 * 链路诊断，把分段结果带回设置卡片 / SSH 连接对话框：
 *
 *   阶段     做法                                                    判定
 *   tcp      net.connect 预检（DNS + TCP 建连，6s 超时）               → 主机可达 / DNS / 拒绝 / 超时
 *   hostkey  ssh2 握手；hostVerifier 内做 TOFU 比对                    → 已匹配 / 新指纹 / 不匹配拒绝
 *   auth     ssh2 ready / error（认证被拒、协商超时等）                → 认证通过或分类失败
 *
 * host key 两种策略（与隧道/SFTP 的 hostKeyStore 用法对齐）：
 *   - 提供 store（设置卡片「测试」按钮）：完整 TOFU——新指纹当场持久化
 *     record（测试即「首次连接」语义），不匹配拒绝并给出与 spawnSsh 完全
 *     一致的指引文案（含已记录指纹与本次指纹，供对照）；
 *   - 不提供 store（SSH 连接对话框试连，尚未保存/未必入库）：只比对不
 *     记录（避免给未保存的草稿建立钉扎），不匹配照样拒绝。
 *
 * 认证失败返回服务端标准错误消息原文（如 `All configured authentication
 * methods failed`）不额外臆测——真实原因（密码错 / 用户不存在 / 方法未开）
 * 由服务端决定，用户可据原文排查。
 */
import { Client } from 'ssh2'
import type { ConnectConfig } from 'ssh2'
import { connect as netConnect } from 'node:net'
import { buildConnectConfig, sshTarget } from './ssh.js'
import type { HostKeyStore, SshSpec } from './ssh.js'

/** TCP 预检超时（毫秒）：DNS 解析 + 建连。 */
export const PROBE_TCP_TIMEOUT_MS = 6_000
/** ssh2 握手/认证阶段超时（毫秒）；覆盖 buildConnectConfig 的 readyTimeout。 */
export const PROBE_AUTH_TIMEOUT_MS = 8_000

/** 分类结果载荷（HTTP 回传；字段全部可 JSON）。 */
export interface ProbeResult {
  /** tcp 阶段：DNS 解析 + TCP 建连。 */
  tcp: { ok: boolean; error?: string; ms?: number }
  /** hostkey 阶段：TOFU 比对（未到握手时为 unknown）。 */
  hostkey: {
    state: 'unknown' | 'matched' | 'recorded' | 'mismatch'
    /** 服务端 host key 的 sha256 指纹（hostHash:'sha256' 下 hostVerifier 收到的原样值）。 */
    fingerprint: string
    /** 已记录指纹（mismatch 时展示对照）。 */
    known?: string
    /** mismatch 时的完整指引文案（与 spawnSsh 一致）。 */
    error?: string
  }
  /** auth 阶段：认证是否通过（ready）。 */
  auth: { ok: boolean; error?: string; ms?: number }
  /** 总耗时。 */
  totalMs: number
}

/** 把底层错误分类为人类可读诊断；原文保留在返回串里便于对照排查。 */
function classifyError(message: string): string {
  if (message === 'Host key verification failed') {
    return '主机密钥校验失败（TOFU 不匹配，见 hostkey 指引）'
  }
  if (message.includes('All configured authentication methods failed')) {
    return '认证被拒绝：所有认证方式均失败（用户名/密码/密钥是否正确，或服务端是否允许该认证方式）'
  }
  if (message.includes('Timed out')) {
    return '超时：主机无响应或认证协商超时（检查地址 / 端口 / 防火墙 / 网络）'
  }
  const lower = message.toLowerCase()
  if (lower.includes('econnrefused')) return '连接被拒绝（ECONNREFUSED）：端口未监听或服务未启动'
  if (lower.includes('enetunreach')) return '网络不可达（ENETUNREACH）：路由不通或主机离线'
  if (lower.includes('ehostunreach')) return '主机不可达（EHOSTUNREACH）'
  if (lower.includes('eai_again') || lower.includes('eai_noname') || lower.includes('enotfound')) return 'DNS 解析失败：主机名无法解析'
  if (lower.includes('getaddrinfo')) return 'DNS 解析失败：主机名无法解析'
  if (lower.includes('unable to exchange encryption keys') || lower.includes('encryption') || lower.includes('kex')) {
    return '密钥交换失败：服务端可能不是 SSH 服务，或加密算法不兼容'
  }
  if (lower.includes('keepalive')) return '连接保活超时（keepalive）'
  if (lower.includes('protocol')) return '协议错误：' + message
  return message
}

/** 与 spawnSsh 的 applyHostKeyPolicy 一致的 TOFU 指引文案。 */
function mismatchMessage(target: string, host: string, port: number, known: string, current: string): string {
  return (
    `SSH 主机密钥指纹变更：${target} 已记录 sha256:${known}，本次为 sha256:${current}。` +
    '可能是主机重装或换钥匙，也可能是中间人（MITM）冒充；确认安全后，到 设置 → 插件 → 终端面板 → SSH 主机密钥记录 删除该主机再重连。'
  )
}

/** 收集 hostVerifier 收到的指纹（ssh2 可能对多 host key 调用多次，取最后一次）。 */
function makeHostKeyVerifier(options: {
  spec: SshSpec
  store?: HostKeyStore
  onResult(result: { state: 'matched' | 'recorded' | 'mismatch'; fingerprint: string; known?: string; error?: string }): void
}): (hash: string) => boolean {
  const { spec, store, onResult } = options
  const port = spec.port ?? 22
  const target = sshTarget(spec)
  let seen = ''
  return (hash: string) => {
    seen = hash
    const known = store?.get(spec.host, port)
    if (known === undefined) {
      if (store !== undefined) {
        // 完整 TOFU：新指纹当场持久化（与 spawnSsh 的 hostVerifier 同语义）
        store.record(spec.host, port, hash)
        onResult({ state: 'recorded', fingerprint: hash })
      } else {
        // 试连（对话框）：只比对不落盘
        onResult({ state: 'matched', fingerprint: hash })
      }
      return true
    }
    if (known === hash) {
      onResult({ state: 'matched', fingerprint: hash, known })
      return true
    }
    onResult({ state: 'mismatch', fingerprint: hash, known, error: mismatchMessage(target, spec.host, port, known, hash) })
    return false
  }
}

/** 仅校验一份连接簿 / 对话框条目的形状（新增 / 编辑前先过一遍；不做网络请求）。 */
export function validateSshFields(input: Record<string, unknown>): { spec?: SshSpec; error?: string } {
  const host = typeof input.host === 'string' ? input.host.trim() : ''
  const username = typeof input.username === 'string' ? input.username.trim() : ''
  if (host === '') return { error: '主机必填' }
  if (username === '') return { error: '用户名必填' }
  let port = 22
  if (input.port !== undefined && input.port !== '') {
    const value = Number(input.port)
    if (!Number.isInteger(value) || value < 1 || value > 65535) return { error: '端口必须是 1~65535 的整数' }
    port = value
  }
  const auth = input.auth === 'key' || input.auth === 'password' ? input.auth : 'agent'
  const spec: SshSpec = { host, port, username, auth }
  if (auth === 'key') {
    const keyPath = typeof input.keyPath === 'string' ? input.keyPath.trim() : ''
    if (keyPath === '') return { error: 'auth=key 需要私钥路径' }
    spec.keyPath = keyPath
    const passphrase = typeof input.passphrase === 'string' ? input.passphrase : ''
    if (passphrase !== '') spec.passphrase = passphrase
  }
  if (auth === 'password') {
    const password = typeof input.password === 'string' ? input.password : ''
    if (password === '') return { error: 'auth=password 需要密码' }
    spec.password = password
  }
  if (input.agentForward === true) spec.agentForward = true
  return { spec }
}

/**
 * 单次连接诊断。无论成败都会关闭连接、在超时内返回，绝不悬挂。
 * 分类见文件头；tcp 预检通过后才进入 ssh2 握手。
 */
export async function probeSsh(spec: SshSpec, store?: HostKeyStore): Promise<ProbeResult> {
  const startedAt = Date.now()
  const result: ProbeResult = {
    tcp: { ok: false },
    hostkey: { state: 'unknown', fingerprint: '' },
    auth: { ok: false },
    totalMs: 0,
  }
  const finish = (): ProbeResult => {
    result.totalMs = Date.now() - startedAt
    return result
  }
  const port = spec.port ?? 22
  const target = sshTarget(spec)

  // ---- 阶段 1：agent 预检（与 spawnSsh 同款，快速失败） ----
  if (spec.auth === 'agent' && (process.env.SSH_AUTH_SOCK === undefined || process.env.SSH_AUTH_SOCK === '')) {
    const message = 'agent 认证需要 SSH_AUTH_SOCK（本机未运行 ssh-agent 或变量未设置）'
    result.tcp = { ok: false, error: message, ms: 0 }
    result.auth = { ok: false, error: message }
    return finish()
  }

  // ---- 阶段 1：TCP 预检（DNS + 建连） ----
  const tcpResult = await new Promise<{ ok: boolean; error?: string; ms: number }>((resolve) => {
    const sock = netConnect({ host: spec.host, port })
    const tcpStart = Date.now()
    const done = (ok: boolean, error?: string): void => {
      try {
        sock.destroy()
      } catch {
        /* 已关闭 */
      }
      resolve({ ok, error, ms: Date.now() - tcpStart })
    }
    sock.setTimeout(PROBE_TCP_TIMEOUT_MS, () => {
      done(false, 'TCP 连接超时：主机无响应（检查地址 / 防火墙 / 网络）')
    })
    sock.once('connect', () => done(true))
    sock.once('error', (error: NodeJS.ErrnoException) => {
      done(false, classifyError(error.message))
    })
  })
  result.tcp = tcpResult
  if (!tcpResult.ok) {
    result.auth = { ok: false, error: tcpResult.error }
    return finish()
  }

  // ---- 阶段 2+3：ssh2 握手（host key 交换 + 认证） ----
  let connectConfig: ConnectConfig
  try {
    connectConfig = buildConnectConfig(spec)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    result.auth = { ok: false, error: classifyError(message) }
    return finish()
  }
  // 探针专属更短握手超时（buildConnectConfig 默认 20s 对测试太长）
  connectConfig.readyTimeout = PROBE_AUTH_TIMEOUT_MS

  const password = spec.auth === 'password' ? (connectConfig as { password?: string }).password ?? '' : ''
  const tryKeyboard = (connectConfig as { tryKeyboard?: boolean }).tryKeyboard === true

  return new Promise<ProbeResult>((resolve) => {
    let settled = false
    let seenHostKey = false
    let hostkeyState: ProbeResult['hostkey'] = { state: 'unknown', fingerprint: '' }
    const settle = (): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try {
        conn.end()
      } catch {
        /* 已断开 */
      }
      resolve(finish())
    }
    // hostVerifier 的 onResult 同步回调：把结论收集到 hostkeyState
    connectConfig.hostVerifier = makeHostKeyVerifier({
      spec,
      store,
      onResult: (next) => {
        seenHostKey = true
        hostkeyState = { ...next, error: next.error }
      },
    })
    // password 认证挂 keyboard-interactive 自动应答（同 spawnSsh/tunnels/sftp）
    const conn = new Client()
    if (tryKeyboard) {
      conn.on('keyboard-interactive', (_name, _instructions, _lang, _prompts, finishKb) => {
        finishKb([password])
      })
    }
    const authStart = Date.now()
    const timer = setTimeout(() => {
      if (seenHostKey) {
        result.hostkey = hostkeyState
        result.auth = { ok: false, error: '认证/协商超时（服务端在 8s 内未完成认证）', ms: Date.now() - authStart }
      } else {
        result.auth = { ok: false, error: '握手超时（服务端未在 8s 内完成密钥交换）', ms: Date.now() - authStart }
      }
      settle()
    }, PROBE_AUTH_TIMEOUT_MS + 1000)
    timer.unref?.()

    conn.on('ready', () => {
      result.hostkey = hostkeyState
      result.auth = { ok: true, ms: Date.now() - authStart }
      settle()
    })
    conn.on('error', (error: Error) => {
      const classified = classifyError(error.message)
      if (error.message === 'Host key verification failed' && hostkeyState.state === 'mismatch') {
        result.hostkey = hostkeyState
        result.auth = { ok: false, error: '主机密钥校验失败（见 hostkey 指引）', ms: Date.now() - authStart }
        settle()
        return
      }
      result.hostkey = seenHostKey ? hostkeyState : { state: 'unknown', fingerprint: '' }
      // TCP 已通：这里只可能是协商 / 认证 / 协议层错误
      result.auth = { ok: false, error: classified, ms: Date.now() - authStart }
      settle()
    })
    conn.on('close', () => {
      // 正常路径（ready / error / 超时）已 settle；未 settle 的 close 兜底
      result.auth = { ok: false, error: '连接已关闭（服务端主动断开）', ms: Date.now() - authStart }
      settle()
    })
    try {
      conn.connect(connectConfig)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      result.auth = { ok: false, error: classifyError(message), ms: Date.now() - authStart }
      settle()
    }
  })
}


