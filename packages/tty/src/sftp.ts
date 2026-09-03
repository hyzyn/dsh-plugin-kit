/**
 * @hyzyn/dsh-tty — SFTP 文件传输（0.7.0）。
 *
 * 懒连接池：按「解析后的 SshSpec 签名」缓存 ssh2 Client + SFTPWrapper，首次操作
 * 才建连，空闲 SFTP_IDLE_MS 由 unref 定时器回收；连接 error/close 即丢弃条目，
 * 下次操作自动重连（不做后台重连循环——SFTP 没有常驻监听需求，与隧道不同；
 * 解析 spec 由调用方每次传入，连接簿凭证热改后天然生效）。
 *
 * 连接建立复用 buildConnectConfig + applyHostKeyPolicy——TOFU 与终端会话、
 * 隧道共用同一 HostKeyStore，指纹变更同样拒绝且文案一致；password 认证挂
 * keyboard-interactive 自动应答（同 spawnSsh，很多服务端只开这个）。
 *
 * 文件操作走 SFTPWrapper：目录列表（realpath 解析 home）/ stat / mkdir /
 * rename / remove（目录递归 = readdir 深度优先 unlink + rmdir）/ 上传下载
 * 直接给流（HTTP 路由 pipe，不整文件进内存）。不计入 maxSessions 名额
 * （同端口转发）；SFTP 的权限边界与 SSH 终端登录一致（同一账号）。
 */
import { Client } from 'ssh2'
import type { ReadStream, SFTPWrapper, WriteStream } from 'ssh2'
import { applyHostKeyPolicy, buildConnectConfig, sshTarget } from './ssh.js'
import type { HostKeyStore, SshSpec } from './ssh.js'

/** 连接空闲回收阈值：窗口内无任何操作即断开（下次操作自动重连）。 */
const SFTP_IDLE_MS = 120_000
/** 扫描周期。 */
const SFTP_SWEEP_MS = 30_000

/** OpenSSH 等 server 的 readdir 会带回 '.'/'..'：目录列表与递归删除都要跳过。 */
const DOT_ENTRIES = new Set(['.', '..'])

export interface SftpEntryInfo {
  name: string
  isDir: boolean
  isFile: boolean
  isSymlink: boolean
  size: number
  /** 毫秒时间戳（SFTP attrs 为秒，这里统一乘 1000）。 */
  mtime: number
}

export interface SftpListResult {
  /** 实际列出的目录（入参为空时经 realpath 解析为登录 home）。 */
  path: string
  entries: SftpEntryInfo[]
}

export interface SftpLogger {
  info(msg: string): void
  warn(msg: string): void
}

export interface SftpDownload {
  stream: ReadStream
  /** 文件字节数（stat 失败时为 null，响应不带 content-length）。 */
  size: number | null
}

export interface SftpUpload {
  stream: WriteStream
  /** 写入完成（流 close）resolve，写入失败 reject——路由 await 它再回包。 */
  done: Promise<void>
}

interface RuntimeConn {
  spec: SshSpec
  signature: string
  conn: Client
  sftp: SFTPWrapper
  lastUsed: number
}

function signatureOf(spec: SshSpec): string {
  return JSON.stringify(spec)
}

export class SftpManager {
  private readonly conns = new Map<string, RuntimeConn>()
  private sweeper: NodeJS.Timeout | null = null

  constructor(
    private readonly logger: SftpLogger,
    private readonly store: HostKeyStore,
  ) {}

  /** 插件卸载：关定时器与全部连接（幂等）。 */
  disposeAll(): void {
    if (this.sweeper !== null) {
      clearInterval(this.sweeper)
      this.sweeper = null
    }
    for (const rt of this.conns.values()) this.close(rt)
    this.conns.clear()
  }

  /* -------------------------------------------------------------- */
  /* 文件操作                                                        */
  /* -------------------------------------------------------------- */

  /** 目录列表；path 为空时 realpath('.') 解析登录 home 并回传实际路径。 */
  async list(spec: SshSpec, path: string): Promise<SftpListResult> {
    const sftp = await this.acquire(spec)
    const trimmed = path.trim()
    const resolved = trimmed === '' ? await this.realpath(sftp, '.') : trimmed
    // OpenSSH 等 server 的 readdir 会带回 '.'/'..'，客户端 UI 自绘「上级目录」行，这里过滤防重复
    const raw = (await this.readdir(sftp, resolved)).filter((item) => !DOT_ENTRIES.has(item.filename))
    const entries: SftpEntryInfo[] = raw.map((item) => ({
      name: item.filename,
      isDir: item.attrs.isDirectory(),
      isFile: item.attrs.isFile(),
      isSymlink: item.attrs.isSymbolicLink(),
      size: Number(item.attrs.size ?? 0),
      mtime: Number(item.attrs.mtime ?? 0) * 1000,
    }))
    entries.sort((a, b) => {
      const kindDiff = (a.isDir ? 0 : 1) - (b.isDir ? 0 : 1)
      if (kindDiff !== 0) return kindDiff
      return a.name.localeCompare(b.name)
    })
    return { path: resolved, entries }
  }

  async mkdir(spec: SshSpec, path: string): Promise<void> {
    const sftp = await this.acquire(spec)
    await new Promise<void>((resolve, reject) => {
      sftp.mkdir(path.trim(), (error) => (error != null ? reject(new Error(`创建目录失败: ${error.message}`)) : resolve()))
    })
  }

  async rename(spec: SshSpec, from: string, to: string): Promise<void> {
    const sftp = await this.acquire(spec)
    await new Promise<void>((resolve, reject) => {
      sftp.rename(from.trim(), to.trim(), (error) => (error != null ? reject(new Error(`重命名失败: ${error.message}`)) : resolve()))
    })
  }

  /**
   * 删除文件 / 目录。目录不带 recursive 时走 rmdir（非空会明确报错）；
   * 带 recursive 时 readdir 深度优先逐个 unlink/rmdir。符号链接一律按
   * 文件 unlink（不跟随）。
   */
  async remove(spec: SshSpec, path: string, recursive: boolean): Promise<void> {
    const sftp = await this.acquire(spec)
    await this.removeEntry(sftp, path.trim(), recursive)
  }

  /** 下载：返回只读流（路由负责 pipe 到 HTTP 响应与销毁）。 */
  async openDownload(spec: SshSpec, path: string): Promise<SftpDownload> {
    const sftp = await this.acquire(spec)
    const target = path.trim()
    let size: number | null = null
    try {
      const stats = await new Promise<import('ssh2').Stats>((resolve, reject) => {
        sftp.stat(target, (error, stats) => (error !== undefined ? reject(error) : resolve(stats)))
      })
      if (stats.isFile()) size = Number(stats.size ?? 0)
    } catch {
      /* stat 失败不阻塞下载（content-length 缺省，流式传输照常） */
    }
    const stream = sftp.createReadStream(target)
    return { stream, size }
  }

  /** 上传：返回可写流与完成信号（路由 pipe 请求体，await done 后回包）。 */
  async openUpload(spec: SshSpec, path: string, append = false): Promise<SftpUpload> {
    const sftp = await this.acquire(spec)
    const stream = sftp.createWriteStream(path.trim(), { flags: append ? 'a' : 'w' })
    const done = new Promise<void>((resolve, reject) => {
      stream.on('error', (error: Error) => {
        reject(new Error(`上传写入失败: ${error.message}`))
      })
      stream.on('close', () => resolve())
    })
    return { stream, done }
  }

  /* -------------------------------------------------------------- */
  /* 连接池                                                          */
  /* -------------------------------------------------------------- */

  /** 取（或建立）该 spec 的 SFTP 通道；连接断开的旧条目在此处自动重建。 */
  private async acquire(spec: SshSpec): Promise<SFTPWrapper> {
    this.ensureSweeper()
    const signature = signatureOf(spec)
    const existing = this.conns.get(signature)
    if (existing !== undefined) {
      existing.lastUsed = Date.now()
      return existing.sftp
    }
    const target = sshTarget(spec)
    const conn = new Client()
    let sftp: SFTPWrapper
    try {
      const connectConfig = buildConnectConfig(spec)
      const policy = applyHostKeyPolicy({ connectConfig, spec, store: this.store, logger: this.logger, target })
      // password 认证挂 keyboard-interactive 自动应答（同 spawnSsh；
      // tryKeyboard 只在 password 分支置位，见 buildConnectConfig）
      if ((connectConfig as { tryKeyboard?: boolean }).tryKeyboard === true) {
        const password = (connectConfig as { password?: string }).password ?? ''
        conn.on('keyboard-interactive', (_name, _instructions, _lang, _prompts, finishKb) => {
          finishKb([password])
        })
      }
      await new Promise<void>((resolve, reject) => {
        let settled = false
        conn.on('ready', () => {
          settled = true
          resolve()
        })
        conn.on('error', (error: Error) => {
          if (!settled) {
            settled = true
            const mismatch = policy.mismatchMessage()
            reject(new Error(mismatch ?? `SSH 连接失败（${target}）: ${error.message}`))
          } else {
            this.logger.warn(`[dsh-tty] sftp ${target} 连接错误: ${error.message}`)
          }
        })
        conn.on('close', () => {
          // 连接断开：丢弃池内条目，下次操作自动重连
          const rt = this.conns.get(signature)
          if (rt !== undefined && rt.conn === conn) this.conns.delete(signature)
        })
        try {
          conn.connect(connectConfig)
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error)))
        }
      })
      sftp = await new Promise<SFTPWrapper>((resolve, reject) => {
        conn.sftp((error, channel) => {
          if (error !== undefined && error !== null) reject(new Error(`sftp channel 打开失败: ${error.message}`))
          else resolve(channel)
        })
      })
    } catch (error) {
      try {
        conn.end()
      } catch {
        /* 未建立 */
      }
      throw error
    }
    this.logger.info(`[dsh-tty] sftp ${target} 就绪`)
    const rt: RuntimeConn = { spec, signature, conn, sftp, lastUsed: Date.now() }
    this.conns.set(signature, rt)
    return sftp
  }

  private ensureSweeper(): void {
    if (this.sweeper !== null) return
    this.sweeper = setInterval(() => {
      const now = Date.now()
      for (const [signature, rt] of [...this.conns.entries()]) {
        if (now - rt.lastUsed > SFTP_IDLE_MS) {
          this.logger.info(`[dsh-tty] sftp ${sshTarget(rt.spec)} 空闲回收`)
          this.conns.delete(signature)
          this.close(rt)
        }
      }
    }, SFTP_SWEEP_MS)
    this.sweeper.unref?.()
  }

  private close(rt: RuntimeConn): void {
    try {
      rt.conn.end()
    } catch {
      /* 已断开 */
    }
  }

  /* -------------------------------------------------------------- */
  /* SFTPWrapper 回调的 Promise 化与递归删除                          */
  /* -------------------------------------------------------------- */

  private realpath(sftp: SFTPWrapper, path: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      sftp.realpath(path, (error, absPath) => (error !== undefined ? reject(new Error(`realpath 失败: ${error.message}`)) : resolve(absPath)))
    })
  }

  private readdir(sftp: SFTPWrapper, path: string): Promise<import('ssh2').FileEntryWithStats[]> {
    return new Promise((resolve, reject) => {
      sftp.readdir(path, (error, list) => (error !== undefined ? reject(new Error(`读取目录失败: ${error.message}`)) : resolve(list)))
    })
  }

  private async removeEntry(sftp: SFTPWrapper, path: string, recursive: boolean): Promise<void> {
    const stats = await new Promise<import('ssh2').Stats>((resolve, reject) => {
      sftp.lstat(path, (error, stats) => (error !== undefined ? reject(new Error(`删除失败: ${error.message}`)) : resolve(stats)))
    })
    if (!stats.isDirectory()) {
      await new Promise<void>((resolve, reject) => {
        sftp.unlink(path, (error) => (error != null ? reject(new Error(`删除失败: ${error.message}`)) : resolve()))
      })
      return
    }
    if (!recursive) {
      await new Promise<void>((resolve, reject) => {
        sftp.rmdir(path, (error) => (error != null ? reject(new Error(`删除目录失败（非空目录需 recursive）: ${error.message}`)) : resolve()))
      })
      return
    }
    const children = await this.readdir(sftp, path)
    const base = path.endsWith('/') ? path : path + '/'
    for (const child of children) {
      if (DOT_ENTRIES.has(child.filename)) continue
      await this.removeEntry(sftp, base + child.filename, true)
    }
    await new Promise<void>((resolve, reject) => {
      sftp.rmdir(path, (error) => (error != null ? reject(new Error(`删除目录失败: ${error.message}`)) : resolve()))
    })
  }
}
