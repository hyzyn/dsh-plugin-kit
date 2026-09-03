/**
 * @hyzyn/dsh-tty — 测试专用内存 SSH 服务端（ssh2.Server）+ SFTP subsystem。
 *
 * password 认证（test/secret）；SFTP 请求映射到 rootDir 下的真实文件系统
 * （REALPATH/OPEN/READ/WRITE/CLOSE/OPENDIR/READDIR/STAT/LSTAT/MKDIR/RMDIR/
 * REMOVE/RENAME，全部路径约束在 rootDir 内防越界；fs 错误按 ENOENT → NO_SUCH_FILE
 * 映射）。供 ssh-smoke（S9 直测 lib/sftp.js）与 integration（B23 走插件 HTTP
 * 路由）复用；不实现 shell/exec（SFTP 测试不需要）。
 */
import ssh2 from 'ssh2'
import { generateKeyPairSync, randomBytes } from 'node:crypto'
import fsp from 'node:fs/promises'
import path from 'node:path'

export const TEST_USER = 'test'
export const TEST_PASSWORD = 'secret'

/* SFTPv3 状态码（协议常量，与 ssh2 内部实现一致） */
const STATUS = { OK: 0, EOF: 1, NO_SUCH_FILE: 2, PERMISSION_DENIED: 3, FAILURE: 4, OP_UNSUPPORTED: 8 }

function attrsOf(stats) {
  return {
    mode: stats.mode,
    uid: Number(stats.uid ?? 0),
    gid: Number(stats.gid ?? 0),
    size: Number(stats.size ?? 0),
    atime: Math.floor(Number(stats.atimeMs ?? 0) / 1000),
    mtime: Math.floor(Number(stats.mtimeMs ?? 0) / 1000),
  }
}

/** 解析客户端路径并约束在 rootDir 内（防越界写测试机文件）。 */
function resolveWithin(rootDir, raw) {
  const input = String(raw ?? '').trim() || '.'
  const abs = path.isAbsolute(input) ? input : path.resolve(rootDir, input)
  const resolved = path.resolve(abs)
  if (resolved !== rootDir && !resolved.startsWith(rootDir + path.sep)) {
    const error = new Error('path escapes root: ' + input)
    error.code = 'EPERM'
    throw error
  }
  return resolved
}

/* SFTP OPEN 的 pflags 位标志（SSH_FXF_*，ssh2 服务端直接给 uint32） */
const FXF = { READ: 0x01, WRITE: 0x02, APPEND: 0x04, CREAT: 0x08, TRUNC: 0x10, EXCL: 0x20 }

/** SFTP OPEN pflags（uint32）→ fs open flags（测试只用到 r/w/a 组合）。 */
function openFlagsOf(pflags) {
  const flags = Number(pflags ?? 0)
  const read = (flags & FXF.READ) !== 0
  const write = (flags & FXF.WRITE) !== 0
  if (read && !write) return 'r'
  if ((flags & FXF.APPEND) !== 0) return 'a'
  if (write && (flags & FXF.CREAT) !== 0 && (flags & FXF.TRUNC) !== 0) return 'w'
  if (write && (flags & FXF.CREAT) !== 0) return 'a'
  if (write) return 'r+'
  return 'r'
}

/** 把 SFTP 请求事件接到 rootDir 文件系统上。 */
function attachSftp(sftpStream, rootDir) {
  const handles = new Map() // handleBuf.toString('hex') → {type:'file', fd} | {type:'dir', entries, sent}
  const newHandle = () => {
    const buf = randomBytes(4)
    return { buf, key: buf.toString('hex') }
  }
  const fail = (reqId, error, fallbackCode = STATUS.FAILURE) => {
    const code = error?.code === 'ENOENT' ? STATUS.NO_SUCH_FILE : error?.code === 'EPERM' ? STATUS.PERMISSION_DENIED : fallbackCode
    sftpStream.status(reqId, code, error instanceof Error ? error.message : String(error ?? 'failure'))
  }
  const statusOk = (reqId) => sftpStream.status(reqId, STATUS.OK)
  const withHandle = (reqId, handleBuf, expectedType, run) => {
    const entry = handles.get(handleBuf.toString('hex'))
    if (entry === undefined || entry.type !== expectedType) {
      sftpStream.status(reqId, STATUS.FAILURE, 'bad handle')
      return
    }
    run(entry)
  }

  sftpStream.on('OPEN', (reqId, filename, pflags) => {
    let target
    try {
      target = resolveWithin(rootDir, filename)
    } catch (error) {
      fail(reqId, error)
      return
    }
    const flags = openFlagsOf(pflags)
    fsp.open(target, flags).then((fd) => {
      const { buf, key } = newHandle()
      handles.set(key, { type: 'file', fd })
      sftpStream.handle(reqId, buf)
    }).catch((error) => fail(reqId, error))
  })
  sftpStream.on('READ', (reqId, handleBuf, offset, len) => {
    withHandle(reqId, handleBuf, 'file', (entry) => {
      const buf = Buffer.alloc(Math.min(Number(len ?? 32768), 32768))
      entry.fd.read(buf, 0, buf.length, Number(offset ?? 0)).then(({ bytesRead }) => {
        if (bytesRead <= 0) sftpStream.status(reqId, STATUS.EOF)
        else sftpStream.data(reqId, buf.subarray(0, bytesRead))
      }).catch((error) => fail(reqId, error))
    })
  })
  sftpStream.on('WRITE', (reqId, handleBuf, offset, data) => {
    withHandle(reqId, handleBuf, 'file', (entry) => {
      entry.fd.write(data, 0, data.length, Number(offset ?? 0)).then(() => statusOk(reqId)).catch((error) => fail(reqId, error))
    })
  })
  sftpStream.on('CLOSE', (reqId, handleBuf) => {
    const key = handleBuf.toString('hex')
    const entry = handles.get(key)
    if (entry === undefined) {
      sftpStream.status(reqId, STATUS.FAILURE, 'bad handle')
      return
    }
    handles.delete(key)
    if (entry.type === 'file') {
      entry.fd.close().then(() => statusOk(reqId)).catch((error) => fail(reqId, error))
    } else {
      statusOk(reqId)
    }
  })
  sftpStream.on('OPENDIR', (reqId, dirPath) => {
    let target
    try {
      target = resolveWithin(rootDir, dirPath)
    } catch (error) {
      fail(reqId, error)
      return
    }
    Promise.all([
      fsp.readdir(target, { withFileTypes: true }),
      fsp.stat(target),
    ]).then(async ([dirents, dirStats]) => {
      const entries = await Promise.all(dirents.map(async (dirent) => {
        let stats = null
        try {
          stats = await fsp.lstat(path.join(target, dirent.name))
        } catch {
          stats = null
        }
        return { dirent, stats }
      }))
      const { buf, key } = newHandle()
      handles.set(key, { type: 'dir', path: target, entries, dirStats, sent: false })
      sftpStream.handle(reqId, buf)
    }).catch((error) => fail(reqId, error))
  })
  sftpStream.on('READDIR', (reqId, handleBuf) => {
    withHandle(reqId, handleBuf, 'dir', (entry) => {
      if (entry.sent) {
        sftpStream.status(reqId, STATUS.EOF)
        return
      }
      entry.sent = true
      sftpStream.name(reqId, entry.entries.map(({ dirent, stats }) => ({
        filename: dirent.name,
        longname: (dirent.isDirectory() ? 'd' : dirent.isSymbolicLink() ? 'l' : '-') + 'rw-r--r--',
        attrs: stats !== null ? attrsOf(stats) : { mode: 0, uid: 0, gid: 0, size: 0, atime: 0, mtime: 0 },
      })))
    })
  })
  sftpStream.on('REALPATH', (reqId, requestPath) => {
    try {
      const resolved = resolveWithin(rootDir, requestPath)
      sftpStream.name(reqId, [{ filename: resolved, longname: resolved }])
    } catch (error) {
      fail(reqId, error, STATUS.NO_SUCH_FILE)
    }
  })
  sftpStream.on('STAT', (reqId, requestPath) => {
    fsp.stat(resolveWithin(rootDir, requestPath)).then((stats) => sftpStream.attrs(reqId, attrsOf(stats))).catch((error) => fail(reqId, error))
  })
  sftpStream.on('LSTAT', (reqId, requestPath) => {
    fsp.lstat(resolveWithin(rootDir, requestPath)).then((stats) => sftpStream.attrs(reqId, attrsOf(stats))).catch((error) => fail(reqId, error))
  })
  sftpStream.on('MKDIR', (reqId, requestPath) => {
    fsp.mkdir(resolveWithin(rootDir, requestPath)).then(() => statusOk(reqId)).catch((error) => fail(reqId, error))
  })
  sftpStream.on('RMDIR', (reqId, requestPath) => {
    fsp.rmdir(resolveWithin(rootDir, requestPath)).then(() => statusOk(reqId)).catch((error) => fail(reqId, error))
  })
  sftpStream.on('REMOVE', (reqId, requestPath) => {
    fsp.unlink(resolveWithin(rootDir, requestPath)).then(() => statusOk(reqId)).catch((error) => fail(reqId, error))
  })
  sftpStream.on('RENAME', (reqId, from, to) => {
    try {
      const src = resolveWithin(rootDir, from)
      const dest = resolveWithin(rootDir, to)
      fsp.rename(src, dest).then(() => statusOk(reqId)).catch((error) => fail(reqId, error))
    } catch (error) {
      fail(reqId, error)
    }
  })
  // 客户端 WriteStream 未传 mode 时不会发；万一发了按成功忽略
  sftpStream.on('SETSTAT', (reqId) => statusOk(reqId))
  sftpStream.on('FSETSTAT', (reqId) => statusOk(reqId))
  sftpStream.on('EXTENDED', (reqId) => sftpStream.status(reqId, STATUS.OP_UNSUPPORTED, 'extended ops unsupported'))
}

async function listenOnce(server) {
  let lastError = null
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      await new Promise((resolve, reject) => {
        server.once('error', reject)
        server.listen(0, '127.0.0.1', () => {
          server.removeListener('error', reject)
          resolve()
        })
      })
      server.on('error', (error) => {
        console.error('[test-sshd] server 错误: ' + error.message)
      })
      return
    } catch (error) {
      lastError = error
      await new Promise((resolve) => setTimeout(resolve, 300))
    }
  }
  throw lastError ?? new Error('test-sshd listen 重试耗尽')
}

/**
 * 起一个带 SFTP 的内存 sshd（127.0.0.1 随机端口）。
 * @param {object} options
 * @param {string} options.rootDir SFTP 可见根目录（须为绝对路径）
 * @returns {Promise<{server: ssh2.Server, port: number, rootDir: string, close: () => Promise<void>}>}
 */
export async function startSftpSshd({ rootDir }) {
  if (!path.isAbsolute(rootDir)) throw new Error('rootDir 必须是绝对路径')
  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
  })
  const server = new ssh2.Server({ hostKeys: [privateKey] }, (client) => {
    client.on('authentication', (ctx) => {
      if (ctx.method === 'password' && ctx.username === TEST_USER && ctx.password === TEST_PASSWORD) {
        ctx.accept()
        return
      }
      ctx.reject()
    })
    client.on('ready', () => {
      client.on('session', (accept) => {
        const session = accept()
        session.on('sftp', (acceptSftp) => {
          attachSftp(acceptSftp(), rootDir)
        })
        // 无 shell/exec 监听：ssh2 服务端对未监听的请求自动拒绝
      })
    })
    client.on('error', () => {
      /* 认证失败/客户端断开等，测试忽略 */
    })
  })
  await listenOnce(server)
  const port = /** @type {import('node:net').AddressInfo} */ (server.address()).port
  return {
    server,
    port,
    rootDir,
    close: async () => {
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, 3000).unref()
        server.close(() => {
          clearTimeout(timer)
          resolve()
        })
      })
      server.closeAllConnections?.()
    },
  }
}
