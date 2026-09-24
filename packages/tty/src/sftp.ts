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
 * 文件操作走 SFTPWrapper：目录列表（realpath 解析 home）/ stat / mkdir
 * （parents:true 逐级补齐，0.8.0）/ rename / remove（目录递归 = readdir
 * 深度优先 unlink + rmdir）/ tree（递归列举，0.8.0）/ 上传下载直接给流
 * （HTTP 路由 pipe，不整文件进内存）。不计入 maxSessions 名额
 * （同端口转发）；SFTP 的权限边界与 SSH 终端登录一致（同一账号）。
 */
import { Client } from 'ssh2'
import type { ReadStream, SFTPWrapper, WriteStream } from 'ssh2'
import { randomUUID } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir as fsMkdir, readdir as fsReaddir, rm as fsRm, stat as fsStat } from 'node:fs/promises'
import { basename, dirname, join as pathJoin } from 'node:path'
import { PassThrough } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { applyHostKeyPolicy, buildConnectConfig, sshTarget } from './ssh.js'
import type { HostKeyStore, SshSpec } from './ssh.js'

/** 连接空闲回收阈值：窗口内无任何操作即断开（下次操作自动重连）。 */
const SFTP_IDLE_MS = 120_000
/** 扫描周期。 */
const SFTP_SWEEP_MS = 30_000

/** 分片孤儿回收阈值：比这更老的 `.dsh-part-*` 视为崩溃残留，下次上传同目录时顺手清理。 */
const STALE_PART_MS = 24 * 60 * 60 * 1000

/**
 * remove 的路径护栏（0.19.0，纵深防御）：递归删除按账号权限生效、无二次确认、
 * 无干跑——根目录 / home / 纯相对跳跃段一次调用就是整树删除。挂在 SftpManager
 * 层而非只在 agent 工具层，loopback 上的构造请求（面板路由透传原始 path）同样
 * 被拦；「必然是误操作」的形态才拒，具体某个子目录仍由调用方负责。
 */
export function assertRemovableRemotePath(raw: string): string {
  const path = raw.trim()
  if (path === '') throw new Error('path 必须是非空字符串')
  if (path === '/' || path.replace(/\/+$/, '') === '') throw new Error('拒绝删除：path 指向根目录（整树删除不可恢复）')
  if (path === '~' || path.startsWith('~/') || path.replace(/\/+$/, '') === '/home') {
    throw new Error('拒绝删除：path 指向 home 目录（~）——如确需删除其中内容，请指定具体子路径')
  }
  const segments = path.replace(/\/+$/, '').split('/').filter((seg) => seg !== '')
  if (segments.some((seg) => seg === '.' || seg === '..')) {
    throw new Error('拒绝删除：path 含 . / .. 相对段（按服务端语义会解析到意外位置）——请先解析出绝对路径')
  }
  return path
}

/** OpenSSH 等 server 的 readdir 会带回 '.'/'..'：目录列表与递归删除都要跳过。 */
const DOT_ENTRIES = new Set(['.', '..'])

/**
 * SFTP 失败文案：`<动作> <对象>: <原因>`。
 *
 * 为什么必须带对象（D59）：agent 常把 sftp_list 当「这个路径存不存在」的探测用，
 * 批量调用时只看到「读取目录失败: No such file」根本判断不出是哪一条失败——只能靠
 * 事件序号回推。path / from→to 就在各调用点作用域里，没有理由不带。
 *
 * ssh2 把 SFTP 状态码挂在 `err.code` 上（SFTP.js `err.code = errorCode`）：
 * NO_SUCH_FILE / PERMISSION_DENIED 单独点明，省得调用方从英文 errno 里猜语义。
 */
function sftpFail(action: string, target: string, error: unknown, note = ''): Error {
  const code = typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined
  const reason = error instanceof Error ? error.message : String(error)
  const detail = code === 2 ? '不存在（NO_SUCH_FILE）' : code === 3 ? '权限不足（PERMISSION_DENIED）' : reason
  return new Error(`${action} ${target}: ${detail}${note}`)
}

/** 远程路径拼接（POSIX 语义；本机路径拼接用 node:path）。 */
function joinRemotePath(base: string, name: string): string {
  return (base.endsWith('/') ? base : base + '/') + name
}

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

export interface SftpTreeEntry {
  /** 从 tree 根出发的绝对路径。 */
  path: string
  name: string
  /** 相对根的层级（根的直接子项为 1）。 */
  depth: number
  isDir: boolean
  size: number
  mtime: number
}

export interface SftpTreeResult {
  path: string
  entries: SftpTreeEntry[]
  /** 因 maxDepth / maxEntries 截断（还有未列举的内容）。 */
  truncated: boolean
  /** 读取失败的子目录（权限等），最多保留 10 条。 */
  errors: Array<{ path: string; message: string }>
}

export interface SftpLogger {
  info(msg: string): void
  warn(msg: string): void
}

export interface SftpDownload {
  stream: ReadStream
  /** 文件字节数（stat 失败时为 null，响应不带 content-length）。 */
  size: number | null
}export interface SftpUpload {
  stream: WriteStream
  /** 写入完成（流 close，覆盖写含 rename 落盘）resolve，写入失败 reject——路由 await 它再回包。 */
  done: Promise<void>
  /**
   * 实际写入的路径：覆盖写 = 同目录临时分片（`.dsh-part-<uuid>`，成功后 rename
   * 覆盖目标）；追加写 = 目标本身。取消 / 中断后的半截清理一律按它来——
   * 不能删目标（覆盖写的目标还是原文件，删了就是毁数据）。
   */
  writePath: string
}

/**
 * 传输任务（0.12.0）：双栏 ⇨/⇦ 的服务端直传任务化——start 立刻返回 id，
 * 客户端轮询 /cancel 端点中止。无它时一个目录递归直传在 HTTP 请求里同步跑
 * 完，浏览器无法打断（只能关窗口，服务端还在写远端）。
 */
export interface SftpTransferJob {
  id: string
  direction: 'up' | 'down'
  /** 起始路径对（进度行展示用）。 */
  localPath: string
  remotePath: string
  /** 已完成字节 / 总字节（总字节在开传前递归统计，统计中可为 0）。 */
  bytes: number
  total: number
  /** 当前正在搬运的文件相对名（展示用）。 */
  current: string
  state: 'running' | 'done' | 'error' | 'canceled'
  error?: string
}

/** 取消感知的传输选项（直传任务内部用；HTTP 上传/下载路由不传 signal）。 */
export interface SftpTransferOptions {
  signal?: AbortSignal
  /** 每搬运一个文件前回调（进度行显示当前文件名）。 */
  onFile?: (name: string) => void
  /** 字节累加（进度条分子）。 */
  onBytes?: (delta: number) => void
}

function throwIfCanceled(options?: SftpTransferOptions): void {
  if (options?.signal?.aborted === true) throw new TransferCanceledError()
}

/** 取消信号：不是「失败」，单独一类以便任务终态区分 canceled / error。 */
class TransferCanceledError extends Error {
  constructor() {
    super('传输已取消')
    this.name = 'TransferCanceledError'
  }
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
  private readonly jobs = new Map<string, { job: SftpTransferJob; cancel: () => void }>()

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
    // 在途直传任务一并中止（防止卸载后还在写远端/本机）
    for (const entry of [...this.jobs.values()]) entry.cancel()
    this.jobs.clear()
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

  /**
   * 创建目录。parents:true 时等效 mkdir -p（自底向上）：先直接建目标，
   * 失败且目标确不存在时向最近的祖先逐级补齐——不从文件系统根逐级 stat
   * （往返少，也不要求对中间层级有探测权限）；「已存在且是目录」视为
   * 成功，同名非目录明确报错；补齐后重试仍失败再兜底 stat 防并发竞态。
   */
  async mkdir(spec: SshSpec, path: string, parents = false): Promise<void> {
    const sftp = await this.acquire(spec)
    const target = path.trim().replace(/\/+$/, '')
    if (target === '') throw new Error('创建目录失败: 路径不能为空')
    if (!parents) {
      await this.mkdirOne(sftp, target)
      return
    }
    const isAbsolute = target.startsWith('/')
    const segments = target.split('/').filter((seg) => seg !== '' && seg !== '.')
    if (segments.length === 0) return // 根目录本身总是存在的
    const join = (depth: number): string => {
      const prefix = segments.slice(0, depth).join('/')
      return isAbsolute ? '/' + prefix : prefix
    }
    const ensure = async (depth: number): Promise<void> => {
      const current = join(depth)
      try {
        await this.mkdirOne(sftp, current)
        return
      } catch (firstError) {
        const existing = await this.statQuiet(sftp, current)
        if (existing !== null) {
          if (existing.isDirectory()) return
          throw new Error(`创建目录失败: ${current} 已存在且不是目录`)
        }
        if (depth > 1) {
          await ensure(depth - 1)
          try {
            await this.mkdirOne(sftp, current)
            return
          } catch {
            /* 落到兜底 stat（并发创建等竞态） */
          }
          const raced = await this.statQuiet(sftp, current)
          if (raced !== null && raced.isDirectory()) return
        }
        throw firstError
      }
    }
    await ensure(segments.length)
  }

  /**
   * 递归列举（agent sftp_tree 用）：深度优先、目录优先（与 list 同排序），
   * maxDepth（1~8，默认 3）限层、maxEntries（1~2000，默认 500）限条数，
   * 超限置 truncated；符号链接不跟随（防环），仅作条目呈现；读取失败的
   * 子目录记入 errors（权限等）并继续。
   */
  async tree(spec: SshSpec, path: string, options: { maxDepth?: number; maxEntries?: number } = {}): Promise<SftpTreeResult> {
    const maxDepth = Math.max(1, Math.min(8, Number.isInteger(options.maxDepth) ? (options.maxDepth as number) : 3))
    const maxEntries = Math.max(1, Math.min(2000, Number.isInteger(options.maxEntries) ? (options.maxEntries as number) : 500))
    const sftp = await this.acquire(spec)
    const trimmed = path.trim()
    const root = trimmed === '' ? await this.realpath(sftp, '.') : trimmed === '/' ? '/' : trimmed.replace(/\/+$/, '')
    const entries: SftpTreeEntry[] = []
    const errors: Array<{ path: string; message: string }> = []
    let truncated = false
    const walk = async (dir: string, depth: number, isRoot = false): Promise<void> => {
      let list: import('ssh2').FileEntryWithStats[]
      try {
        list = (await this.readdir(sftp, dir)).filter((item) => !DOT_ENTRIES.has(item.filename))
      } catch (error) {
        // 请求的根目录读不到（不存在/权限）→ 明确报错；子目录失败记入 errors 继续
        if (isRoot) throw sftpFail('读取目录失败', dir, error)
        errors.push({ path: dir, message: error instanceof Error ? error.message : String(error) })
        return
      }
      list.sort((a, b) => {
        const kindDiff = (a.attrs.isDirectory() ? 0 : 1) - (b.attrs.isDirectory() ? 0 : 1)
        if (kindDiff !== 0) return kindDiff
        return a.filename.localeCompare(b.filename)
      })
      for (const item of list) {
        if (entries.length >= maxEntries) {
          truncated = true
          return
        }
        const isDir = item.attrs.isDirectory()
        const isSymlink = item.attrs.isSymbolicLink()
        entries.push({
          path: dir.endsWith('/') ? dir + item.filename : dir + '/' + item.filename,
          name: item.filename,
          depth,
          isDir,
          size: Number(item.attrs.size ?? 0),
          mtime: Number(item.attrs.mtime ?? 0) * 1000,
        })
        if (isDir && !isSymlink) {
          if (depth + 1 > maxDepth) {
            truncated = true
            continue
          }
          await walk(dir.endsWith('/') ? dir + item.filename : dir + '/' + item.filename, depth + 1)
        }
      }
    }
    await walk(root, 1, true)
    return { path: root, entries, truncated, errors: errors.slice(0, 10) }
  }

  async rename(spec: SshSpec, from: string, to: string): Promise<void> {
    const sftp = await this.acquire(spec)
    await new Promise<void>((resolve, reject) => {
      sftp.rename(from.trim(), to.trim(), (error) => (error != null ? reject(sftpFail('重命名失败', `${from.trim()} → ${to.trim()}`, error)) : resolve()))
    })
  }

  /**
   * 删除文件 / 目录。目录不带 recursive 时走 rmdir（非空会明确报错）；
   * 带 recursive 时 readdir 深度优先逐个 unlink/rmdir。符号链接一律按
   * 文件 unlink（不跟随）。入口过 assertRemovableRemotePath 护栏（根目录 /
   * home / 相对跳跃段直接拒绝——agent 工具与面板 HTTP 路由共用本方法）。
   */
  async remove(spec: SshSpec, path: string, recursive: boolean): Promise<void> {
    const sftp = await this.acquire(spec)
    await this.removeEntry(sftp, assertRemovableRemotePath(path), recursive)
  }

  /**
   * 下载：返回只读流（路由负责 pipe 到 HTTP 响应与销毁）。
   * 先 stat 探测（0.19.0）：「路径不存在 / 是目录」在这里变成明确报错——
   * 此前 stat 失败被吞、路由已 writeHead(200)，客户端见 res.ok===true 后以
   * TypeError 断流收场，状态行只剩「Failed to fetch」这类无信息文案。
   */
  async openDownload(spec: SshSpec, path: string, options?: { offset?: number }): Promise<SftpDownload> {
    const sftp = await this.acquire(spec)
    const target = path.trim()
    const stats = await new Promise<import('ssh2').Stats>((resolve, reject) => {
      sftp.stat(target, (error, found) => (error != null ? reject(new Error(`远程路径不存在或不可访问: ${target}（${error.message}）`)) : resolve(found)))
    })
    if (stats.isDirectory()) throw new Error(`${target} 是目录：单文件下载不支持目录，请用面板双栏「← 传输」或先打包`)
    const size = stats.isFile() ? Number(stats.size ?? 0) : null
    const stream = options?.offset !== undefined && options.offset > 0
      ? sftp.createReadStream(target, { start: options.offset })
      : sftp.createReadStream(target)
    return { stream, size }
  }

  /**
   * 上传：返回可写流与完成信号（路由 pipe 请求体，await done 后回包）。
   *
   * 覆盖写原子化（0.19.0）：`flags:'w'` 直接写目标会先截断原文件，途中任何
   * 失败（磁盘满 / 权限变化 / 通道断 / 客户端断连）都留下「原文件被毁 + 半截
   * 新文件」。改为写同目录临时分片 `.dsh-part-<uuid>`，流正常收尾后 posix-rename
   * （不支持该扩展的 server 退 unlink+rename）覆盖目标；失败 / 取消统一清理
   * 分片，原文件全程不受影响。done 只在分片真正落盘（rename 成功）后 resolve。
   */
  async openUpload(spec: SshSpec, path: string, append = false): Promise<SftpUpload> {
    const sftp = await this.acquire(spec)
    const target = path.trim()
    if (append) {
      const stream = sftp.createWriteStream(target, { flags: 'a' })
      const done = this.streamDone(stream, () => {}, target)
      done.catch(() => {})
      return { stream, done, writePath: target }
    }
    const partPath = `${target}.dsh-part-${randomUUID()}`
    // 顺手回收崩溃残留（0.19.0）：进程崩溃 / 断电时 dropPart 来不及执行，远端会
    // 留下 `.dsh-part-*` 孤儿。只清同目标前缀且超过 STALE_PART_MS 的（并发中的
    // 新分片不受影响）；readdir/unlink 失败静默——清理是尽力而为。
    void this.reapStaleParts(sftp, target)
    const stream = sftp.createWriteStream(partPath, { flags: 'w' })
    const done = new Promise<void>((resolve, reject) => {
      let settled = false
      const dropPart = (): void => {
        // 分片清理是尽力而为：失败只留日志（下一次覆盖写不受影响）
        sftp.unlink(partPath, (error) => {
          if (error !== undefined && error !== null) {
            this.logger.warn(`[dsh-tty] sftp 分片清理失败（${partPath}）: ${error.message}`)
          }
        })
      }
      stream.on('error', (error: Error) => {
        settled = true
        dropPart()
        reject(sftpFail('上传写入失败', target, error))
      })
      stream.on('close', () => {
        if (settled) return
        settled = true
        // 「写入完整」判据 = writableEnded（调用方走过 end()）。ssh2 的
        // WriteStream 在 _final 里先 destroy 再 cb，'finish' 事件不会发出；
        // 而它的 'close' 在正常路径上要等 server ack handle close 才发——
        // 未 end 就 destroy（取消 / 管线中止）时 writableEnded 为 false，
        // 据此区分「完整收尾」与「半途而废」，绝不把半截分片 rename 覆盖目标。
        if (stream.writableEnded !== true) {
          dropPart()
          reject(new Error('上传中断（连接断开或流被销毁），目标原文件未受影响'))
          return
        }
        this.renameOverwrite(sftp, partPath, target).then(resolve, (error: Error) => {
          dropPart()
          reject(error)
        })
      })
    })
    // 必挂一个 no-op 分支：客户端中断 / 取消会让流以 destroy 收尾（不是正常
    // close），done 随之 reject——调用方可能已走别的路径返回，此时这个
    // rejection 无人处理会变成 unhandled rejection 并拖垮宿主进程。
    // 挂 handler 不改变语义：await done 仍会拿到同一个 rejection。
    done.catch(() => {})
    return { stream, done, writePath: partPath }
  }

  /**
   * 同目录崩溃残留分片回收：`<basename>.dsh-part-*` 且 mtime 超过阈值才删
   * （并发上传的新分片 mtime 很新，不会被误删）；一切失败静默。
   */
  private async reapStaleParts(sftp: SFTPWrapper, target: string): Promise<void> {
    try {
      const dir = dirname(target)
      const prefix = `${basename(target)}.dsh-part-`
      const list = await new Promise<import('ssh2').FileEntryWithStats[]>((resolve) => {
        sftp.readdir(dir, (error, found) => (error !== undefined ? resolve([]) : resolve(found)))
      })
      const now = Date.now()
      for (const entry of list) {
        if (!entry.filename.startsWith(prefix)) continue
        const age = now - Number(entry.attrs.mtime ?? 0) * 1000
        if (age < STALE_PART_MS) continue
        sftp.unlink(joinRemotePath(dir, entry.filename), () => {})
        this.logger.info(`[dsh-tty] sftp 清理崩溃残留分片（${joinRemotePath(dir, entry.filename)}，${String(Math.round(age / 3600_000))}h 前）`)
      }
    } catch {
      /* 清理是尽力而为 */
    }
  }

  /** WriteStream 的 done Promise（close 即 resolve，error reject）；onClose 钩子供覆盖写路径塞落盘逻辑。 */
  private streamDone(stream: WriteStream, onClose: () => void, target: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      stream.on('error', (error: Error) => {
        reject(sftpFail('上传写入失败', target, error))
      })
      stream.on('close', () => {
        onClose()
        resolve()
      })
    })
  }

  /**
   * 覆盖落盘：优先 posix-rename@openssh.com（原子覆盖，OpenSSH 系全支持）；
   * server 不支持该扩展时退 unlink+rename——窗口极小（新内容已在分片里完整
   * 落盘），不会出现「截断后写一半」的旧问题。
   */
  private renameOverwrite(sftp: SFTPWrapper, from: string, to: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const posix = sftp.ext_openssh_rename
      if (typeof posix !== 'function') {
        fallback()
        return
      }
      try {
        // 不支持 posix-rename 的 server：ssh2 会**同步 throw**（而非回调错误）
        posix.call(sftp, from, to, (error?: Error | null) => {
          if (error === undefined || error === null) {
            resolve()
            return
          }
          fallback()
        })
      } catch {
        fallback()
      }
      function fallback(): void {
        sftp.unlink(to, () => {
          sftp.rename(from, to, (renameError) => {
            if (renameError != null) reject(new Error(`落盘失败（rename ${from} → ${to}）: ${renameError.message}`))
            else resolve()
          })
        })
      }
    })
  }

  /* -------------------------------------------------------------- */
  /* 双栏直传（0.9.0，0.12.0 任务化 + 可取消）：本机路径 ↔ 远程路径      */
  /* -------------------------------------------------------------- */

  /**
   * 本机文件 / 目录 → 远程（双栏「→ 传输」）。目录递归建目录后逐个上传；
   * 同名文件直接覆盖（openUpload 走临时分片 + rename，见其注释）。不经过
   * 浏览器，字节不出宿主进程。signal 中止时销毁读写流并清理半截的远程
   * 分片（删除失败只记日志）。
   *
   * 符号链接：根路径按用户显式选择跟随（fsStat）；子项一律跳过（含指到
   * 文件的链接）——`current -> .` 这类环会让递归永不收敛，直到 ENAMETOOLONG
   * 或磁盘灌满；depth 兜底只为防未来的回归，不是主防线。
   */
  async uploadFromLocal(spec: SshSpec, localPath: string, remotePath: string, options?: SftpTransferOptions, depth = 0): Promise<void> {
    const root = localPath.trim()
    if (root === '') throw new Error('本机路径为空（目录尚未定位）——拒绝按宿主进程 cwd 解析')
    if (remotePath.trim() === '') throw new Error('远程路径为空（目录尚未定位）——拒绝按登录目录解析')
    const info = await fsStat(root).catch(() => {
      throw new Error('本机路径不存在: ' + root)
    })
    throwIfCanceled(options)
    if (info.isDirectory()) {
      if (depth >= 100) throw new Error('目录嵌套过深（≥100 层），已停止传输: ' + root)
      await this.mkdir(spec, remotePath, true)
      const children = await fsReaddir(root, { withFileTypes: true })
      for (const child of children) {
        if (child.isSymbolicLink()) continue
        throwIfCanceled(options)
        await this.uploadFromLocal(spec, pathJoin(root, child.name), joinRemotePath(remotePath, child.name), options, depth + 1)
      }
      return
    }
    if (!info.isFile()) throw new Error('不支持传输的文件类型: ' + root)
    const label = basename(root)
    options?.onFile?.(label)
    const { stream, done, writePath } = await this.openUpload(spec, remotePath, false)
    try {
      await this.pipeCounted(createReadStream(root), stream, options)
    } catch (error) {
      // 取消：pipeline 已收尾（写流随之销毁），此时删分片才不会有写入竞态。
      // 不 await done——被 destroy 打断的写流不会走正常 close，等它只会挂住。
      if (options?.signal?.aborted === true) {
        await this.deleteRemoteQuiet(spec, writePath)
        throw new TransferCanceledError()
      }
      throw new Error(`上传失败（${label}）: ${error instanceof Error ? error.message : String(error)}`)
    }
    await done
  }

  /**
   * 远程文件 / 目录 → 本机（双栏「← 传输」）。目录递归建本地目录后逐个下载；
   * 同名文件直接覆盖（'w' 写流）。符号链接不作为目录下钻（readdir attrs 的
   * isDirectory 跟随 isSymbolicLink 才算目录）——防 `current -> .` 环；根路径
   * 是链接时按文件下载（读取跟随目标，指向目录则传输报错）。
   * signal 中止时销毁读写流并删除半截的本机文件（删除失败只记日志）。
   */
  async downloadToLocal(spec: SshSpec, remotePath: string, localPath: string, options?: SftpTransferOptions, depth = 0): Promise<void> {
    const target = remotePath.trim()
    if (target === '') throw new Error('远程路径为空（目录尚未定位）——拒绝按登录目录解析')
    if (localPath.trim() === '') throw new Error('本机路径为空（目录尚未定位）——拒绝按宿主进程 cwd 解析')
    const sftp = await this.acquire(spec)
    const stats = await new Promise<import('ssh2').Stats>((resolve, reject) => {
      sftp.lstat(target, (error, found) => (error != null ? reject(new Error(`远程路径不存在: ${target}（${error.message}）`)) : resolve(found)))
    })
    throwIfCanceled(options)
    if (stats.isDirectory() && !stats.isSymbolicLink()) {
      if (depth >= 100) throw new Error('远程目录嵌套过深（≥100 层），已停止传输: ' + target)
      await fsMkdir(localPath, { recursive: true })
      const list = await this.list(spec, target)
      for (const entry of list.entries) {
        if (DOT_ENTRIES.has(entry.name)) continue
        // 子项里的符号链接一律跳过（含指到文件的）：本侧无法原样重建链接，
        // 跟随又有目录环风险——与上传方向（rsync 默认）语义对齐
        if (entry.isSymlink) continue
        throwIfCanceled(options)
        await this.downloadToLocal(spec, joinRemotePath(target, entry.name), pathJoin(localPath, entry.name), options, depth + 1)
      }
      return
    }
    await fsMkdir(dirname(localPath), { recursive: true })
    const label = basename(target)
    options?.onFile?.(label)
    const { stream } = await this.openDownload(spec, target)
    try {
      await this.pipeCounted(stream, createWriteStream(localPath), options)
    } catch (error) {
      // 取消：pipeline 已收尾（本机写流随之关闭），此时删半截文件才安全
      if (options?.signal?.aborted === true) {
        await fsRm(localPath, { force: true }).catch(() => {
          /* 半截文件清理是尽力而为 */
        })
        throw new TransferCanceledError()
      }
      throw new Error(`下载失败（${label}）: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * 带字节计数与取消感知的 pipe：source→sink 之间插一个 PassThrough 只做
   * 「数了就转发」；取消时 destroy 它——pipeline 随即结束并销毁两端流，
   * 不留悬挂的 SFTP 句柄，也不会误报成「传输失败」。
   * abort 监听器在管道收尾时摘除：signal 是整个任务共用的（每个文件都挂
   * 一个），不摘的话 N 文件 = N 个常驻监听器，取消时 N 个已结束的 meter
   * 齐刷刷被 destroy（Node 会报 MaxListenersExceededWarning）。
   */
  private async pipeCounted(source: NodeJS.ReadableStream, sink: NodeJS.WritableStream, options: SftpTransferOptions | undefined): Promise<void> {
    if (options === undefined || (options.signal === undefined && options.onBytes === undefined)) {
      await pipeline(source, sink)
      return
    }
    const meter = new PassThrough()
    if (options.onBytes !== undefined) {
      const onBytes = options.onBytes
      meter.on('data', (chunk: Buffer) => onBytes(chunk.length))
    }
    let detachAbort: (() => void) | null = null
    if (options.signal !== undefined) {
      const signal = options.signal
      if (signal.aborted) {
        meter.destroy()
      } else {
        const abort = (): void => {
          meter.destroy()
        }
        signal.addEventListener('abort', abort, { once: true })
        detachAbort = () => signal.removeEventListener('abort', abort)
      }
    }
    try {
      await pipeline(source, meter, sink)
    } finally {
      detachAbort?.()
    }
  }

  /** 删远端文件（取消后的半截清理）：失败只记日志，不影响取消本身。 */
  async deleteRemoteQuiet(spec: SshSpec, path: string): Promise<void> {
    try {
      const sftp = await this.acquire(spec)
      await new Promise<void>((resolve) => {
        sftp.unlink(path.trim(), () => resolve())
      })
    } catch (error) {
      this.logger.warn(`[dsh-tty] sftp 半截文件清理失败（${path}）: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * 预扫描总字节数（直传进度分母）：目录递归累加文件大小，只数「源头一侧」
   * ——up 数本机、down 数远程（对侧尚未创建，数不到也不该数）。目的是让
   * 进度条有真实百分比：纯统计（不搬运），单项失败按 0 计、不阻断传输。
   * 与传输本体同一套符号链接规则（子项跳过）+ 取消检查——统计也会走环。
   */
  private async estimateBytes(spec: SshSpec, direction: 'up' | 'down', localPath: string, remotePath: string, options?: SftpTransferOptions, depth = 0): Promise<number> {
    try {
      if (depth >= 100) return 0
      if (direction === 'up') {
        const info = await fsStat(localPath)
        if (!info.isDirectory()) return info.isFile() ? info.size : 0
        let total = 0
        const children = await fsReaddir(localPath, { withFileTypes: true })
        for (const child of children) {
          if (child.isSymbolicLink()) continue
          throwIfCanceled(options)
          total += await this.estimateBytes(spec, direction, pathJoin(localPath, child.name), joinRemotePath(remotePath, child.name), options, depth + 1)
        }
        return total
      }
      const sftp = await this.acquire(spec)
      const stats = await new Promise<import('ssh2').Stats | null>((resolve) => {
        sftp.stat(remotePath, (error, found) => (error != null ? resolve(null) : resolve(found)))
      })
      if (stats === null) return 0
      if (!stats.isDirectory()) return Number(stats.size ?? 0)
      let total = 0
      const list = await this.list(spec, remotePath).catch(() => ({ entries: [] as SftpEntryInfo[] }))
      for (const entry of list.entries) {
        if (DOT_ENTRIES.has(entry.name) || entry.isSymlink) continue
        throwIfCanceled(options)
        total += await this.estimateBytes(spec, direction, pathJoin(localPath, entry.name), joinRemotePath(remotePath, entry.name), options, depth + 1)
      }
      return total
    } catch (error) {
      if (error instanceof TransferCanceledError) throw error
      /* 统计是尽力而为：失败退化为不定进度，不影响传输本身 */
      return 0
    }
  }

  /** 开一个可取消的直传任务（路由 /transfer 的 start 分支）。 */
  startTransfer(spec: SshSpec, direction: 'up' | 'down', localPath: string, remotePath: string): SftpTransferJob {
    const job: SftpTransferJob = {
      id: randomUUID(),
      direction,
      localPath,
      remotePath,
      bytes: 0,
      total: 0,
      current: '',
      state: 'running',
    }
    const controller = new AbortController()
    this.jobs.set(job.id, { job, cancel: () => controller.abort() })
    const options: SftpTransferOptions = {
      signal: controller.signal,
      onFile: (name) => {
        job.current = name
      },
      onBytes: (delta) => {
        job.bytes += delta
      },
    }
    void (async () => {
      try {
        job.total = await this.estimateBytes(spec, direction, localPath, remotePath, options)
        if (direction === 'up') await this.uploadFromLocal(spec, localPath, remotePath, options)
        else await this.downloadToLocal(spec, remotePath, localPath, options)
        job.state = 'done'
      } catch (error) {
        job.state = controller.signal.aborted ? 'canceled' : 'error'
        job.error = error instanceof Error ? error.message : String(error)
      } finally {
        // 终态保留 60s 供客户端最后一次轮询取到结果，之后自动回收
        setTimeout(() => this.jobs.delete(job.id), 60_000).unref?.()
      }
    })()
    return job
  }

  /** 任务快照（路由 /transfer?job=<id> 轮询）。 */
  getTransfer(id: string): SftpTransferJob | undefined {
    return this.jobs.get(id)?.job
  }

  /** 中止任务（路由 /transfer 的 cancel 分支）；已终态的任务返回 undefined。 */
  cancelTransfer(id: string): SftpTransferJob | undefined {
    const entry = this.jobs.get(id)
    if (entry === undefined) return undefined
    if (entry.job.state === 'running') entry.cancel()
    return entry.job
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
      const connectConfig = await buildConnectConfig(spec)
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
      sftp.realpath(path, (error, absPath) => (error !== undefined ? reject(sftpFail('realpath 失败', path, error)) : resolve(absPath)))
    })
  }

  /** stat 的静默版：路径不存在等错误一律回 null（mkdir -p 的逐级探测用）。 */
  private statQuiet(sftp: SFTPWrapper, path: string): Promise<import('ssh2').Stats | null> {
    return new Promise((resolve) => {
      sftp.stat(path, (error, stats) => (error !== undefined || stats === undefined ? resolve(null) : resolve(stats)))
    })
  }

  private mkdirOne(sftp: SFTPWrapper, path: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      sftp.mkdir(path, (error) => (error != null ? reject(sftpFail('创建目录失败', path, error)) : resolve()))
    })
  }

  private readdir(sftp: SFTPWrapper, path: string): Promise<import('ssh2').FileEntryWithStats[]> {
    return new Promise((resolve, reject) => {
      sftp.readdir(path, (error, list) => (error !== undefined ? reject(sftpFail('读取目录失败', path, error)) : resolve(list)))
    })
  }

  private async removeEntry(sftp: SFTPWrapper, path: string, recursive: boolean): Promise<void> {
    const stats = await new Promise<import('ssh2').Stats>((resolve, reject) => {
      sftp.lstat(path, (error, stats) => (error !== undefined ? reject(sftpFail('删除失败', path, error)) : resolve(stats)))
    })
    if (!stats.isDirectory()) {
      await new Promise<void>((resolve, reject) => {
        sftp.unlink(path, (error) => (error != null ? reject(sftpFail('删除失败', path, error)) : resolve()))
      })
      return
    }
    if (!recursive) {
      await new Promise<void>((resolve, reject) => {
        // 不预设原因：非空与权限拒绝在 SFTP 层都是笼统的 Failure，把两种可能
        // 一并列出让用户自行分辨（此前一律归因为「非空」误导权限问题）
        sftp.rmdir(path, (error) => (error != null ? reject(sftpFail('删除目录失败', path, error, '（目录非空时需 recursive:true；若非此原因，多为账号对该目录无写权限）')) : resolve()))
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
      sftp.rmdir(path, (error) => (error != null ? reject(sftpFail('删除目录失败', path, error)) : resolve()))
    })
  }
}
