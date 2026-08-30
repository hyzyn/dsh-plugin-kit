/**
 * @hyzyn/dsh-tty — ~/.ssh/known_hosts 解析器（TOFU hostKeys 预填充）。
 *
 * 目标：把用户 known_hosts 里已有的主机指纹批量搬进 hostKeys，首次连接前
 * 就有钉扎基线。指纹算法与 ssh2 的 hostVerifier 完全一致——
 * `sha256(raw key blob).digest('hex')`（ssh2 client.js:283 对 host key 数据
 * createHash(cfg.hostHash).digest('hex')）——因此导入值可直接参与比对。
 *
 * 支持与裁剪：
 *   - 非 hashed 条目：`host[,alias...] keytype base64`；pattern 含 * ? ! 跳过；
 *     `[host]:port` 形式解析非默认端口，裸 host 记 22；每个 alias 单独成条；
 *   - hashed 条目（`|1|salt|hmac`，OpenSSH HMAC-SHA1）：无候选主机名时无法
 *     反解，仅在调用方提供 candidates（连接簿里的主机名及其 [host]:port
 *     变体）时按候选匹配还原；
 *   - `@cert-authority` / `@revoked` 行与注释跳过；无法识别的 keytype 跳过；
 *   - 同 host:port 多条（如 rsa + ed25519 两种类型）只保留第一条——hostKeys
 *     按 host:port 单指纹存储（见 README 已知限制）。
 */
import { createHash, createHmac } from 'node:crypto'
import type { HostKeyRecord } from './ssh.js'

const KEY_TYPE_RE = /^(ssh-(rsa|dss)|ecdsa-sha2-[a-z0-9-]+|ssh-ed25519|sk-(rsa|ecdsa-sha2-[a-z0-9-]+)@openssh\.com)$/
/** hashed 条目：|1|<base64 salt>|<base64 hmac> */
const HASHED_RE = /^\|1\|([A-Za-z0-9+/=]+)\|([A-Za-z0-9+/=]+)$/
/** 非默认端口形式：[host]:port */
const BRACKET_PORT_RE = /^\[([^\]]+)\]:(\d+)$/

/** pattern token → {host, port}；通配/否定 pattern 返回 null。 */
function parseHostToken(token: string): { host: string; port: number } | null {
  if (token === '' || /[*?!]/.test(token)) return null
  const bracket = token.match(BRACKET_PORT_RE)
  if (bracket !== null) {
    const port = Number(bracket[2])
    if (!Number.isInteger(port) || port < 1 || port > 65535) return null
    return { host: bracket[1].toLowerCase(), port }
  }
  return { host: token.toLowerCase(), port: 22 }
}

function fingerprintOf(base64Key: string): string | null {
  try {
    const raw = Buffer.from(base64Key, 'base64')
    if (raw.length === 0) return null
    return createHash('sha256').update(raw).digest('hex')
  } catch {
    return null
  }
}

/** hashed token 与候选主机名匹配（含小写尝试）；命中返回 {host, port}。 */
function matchHashedToken(token: string, candidates: string[]): { host: string; port: number } | null {
  const hashed = token.match(HASHED_RE)
  if (hashed === null) return null
  let salt: Buffer
  let expected: Buffer
  try {
    salt = Buffer.from(hashed[1], 'base64')
    expected = Buffer.from(hashed[2], 'base64')
  } catch {
    return null
  }
  if (salt.length === 0 || expected.length === 0) return null
  const tries = new Set<string>()
  for (const candidate of candidates) {
    const trimmed = candidate.trim()
    if (trimmed === '') continue
    tries.add(trimmed)
    tries.add(trimmed.toLowerCase())
  }
  for (const name of tries) {
    const actual = createHmac('sha1', salt).update(name).digest()
    if (actual.equals(expected)) {
      const parsed = parseHostToken(name)
      return parsed !== null ? parsed : { host: name.toLowerCase(), port: 22 }
    }
  }
  return null
}

/**
 * 解析 known_hosts 文本。candidates 用于还原 hashed 条目（传连接簿里的
 * 主机名即可；无 hashed 条目时可省略）。返回按 host:port 去重后的记录。
 */
export function parseKnownHosts(text: string, candidates: string[] = []): HostKeyRecord[] {
  const out: HostKeyRecord[] = []
  const seen = new Set<string>()
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (line === '' || line.startsWith('#')) continue
    const tokens = line.split(/\s+/)
    if (tokens.length < 3) continue
    if (tokens[0].startsWith('@')) continue // @cert-authority / @revoked 不入库
    const [, keyType, base64Key] = tokens
    if (!KEY_TYPE_RE.test(keyType)) continue
    const fingerprint = fingerprintOf(base64Key)
    if (fingerprint === null) continue

    let resolved: Array<{ host: string; port: number }> = []
    if (tokens[0].startsWith('|1|')) {
      const hashed = matchHashedToken(tokens[0], candidates)
      if (hashed !== null) resolved = [hashed]
    } else {
      for (const token of tokens[0].split(',')) {
        const parsed = parseHostToken(token)
        if (parsed !== null) resolved.push(parsed)
      }
    }
    for (const { host, port } of resolved) {
      const key = `${host}:${port}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ host, port, fingerprint })
      if (out.length >= 500) return out
    }
  }
  return out
}
