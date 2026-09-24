/**
 * @hyzyn/dsh-tty — SftpManager 单元测试（DEFECTS D38 第 2 刀）。
 *
 * ssh2 的 `Client` 被 vi.mock 成假件，`conn.sftp()` 回一张**假 SFTPWrapper**
 * （readdir/stat/unlink/rename 全部可编程、可观察）。e2e 摸不到的分支与边界：
 *   - remove 护栏的各形态（D25：根 / home / 相对段）与护栏前置（不触碰远端）；
 *   - openUpload 的 `writableEnded` 完整性判据（D01）与 posix-rename 回退链；
 *   - 分片孤儿 24h 回收阈值（并发中的新分片不误删）；
 *   - openDownload 的 404 / 目录 / offset 分支（D26 / D30 的宿主半边）；
 *   - tree 的 maxEntries / maxDepth 截断。
 * 不追求覆盖率：只钉「修复过的行为 + 边界」。
 */
import { Readable, Writable } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { SftpManager, assertRemovableRemotePath } from '../src/sftp.js'
import type { SshSpec } from '../src/ssh.js'

const h = vi.hoisted(() => ({ factory: null as null | (() => unknown) }))
vi.mock('ssh2', () => ({
  Client: class {
    constructor() {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      return h.factory!()
    }
  },
}))

const SPEC: SshSpec = { host: '203.0.113.9', port: 22, username: 'u', auth: 'password', password: 'pw' }

/** ssh2 Stats 的鸭子类型（代码只调 isDirectory/isFile/isSymbolicLink + size/mtime）。 */
interface FakeAttrs {
  kind: 'dir' | 'file' | 'symlink'
  size: number
  /** 秒（SFTP attrs 语义）。 */
  mtime: number
}
function attrsOf(a: FakeAttrs): Record<string, unknown> {
  return {
    isDirectory: () => a.kind === 'dir',
    isFile: () => a.kind === 'file',
    isSymbolicLink: () => a.kind === 'symlink',
    size: a.size,
    mtime: a.mtime,
  }
}

type ExtRenameMode = 'ok' | 'throw' | 'error' | 'none'

/** 假 SFTPWrapper：按 path 分发表。 */
class FakeSftp extends EventEmitter {
  nodes = new Map<string, FakeAttrs>()
  listings = new Map<string, Array<{ filename: string; attrs: FakeAttrs }>>()
  unlinked: string[] = []
  rmdirCalls: string[] = []
  renames: Array<[string, string]> = []
  extRenames: Array<[string, string]> = []
  readStreams: Array<{ path: string; opts: Record<string, unknown> | undefined }> = []
  writeStreams: Array<{ path: string; opts: Record<string, unknown> | undefined; stream: Writable }> = []
  extRenameMode: ExtRenameMode = 'ok'

  stat(path: string, cb: (error: Error | undefined, stats?: Record<string, unknown>) => void): void {
    const node = this.nodes.get(path)
    if (node === undefined) {
      cb(new Error('No such file'))
      return
    }
    cb(undefined, attrsOf(node))
  }
  lstat(path: string, cb: (error: Error | undefined, stats?: Record<string, unknown>) => void): void {
    this.stat(path, cb)
  }
  readdir(path: string, cb: (error: Error | undefined, list?: Array<{ filename: string; attrs: Record<string, unknown> }>) => void): void {
    const listing = this.listings.get(path)
    if (listing === undefined) {
      cb(new Error('No such directory'))
      return
    }
    cb(undefined, listing.map((entry) => ({ filename: entry.filename, attrs: attrsOf(entry.attrs) })))
  }
  unlink(path: string, cb: (error: Error | undefined) => void): void {
    this.unlinked.push(path)
    cb(undefined)
  }
  rmdir(path: string, cb: (error: Error | undefined) => void): void {
    this.rmdirCalls.push(path)
    cb(undefined)
  }
  rename(from: string, to: string, cb: (error: Error | undefined) => void): void {
    this.renames.push([from, to])
    cb(undefined)
  }
  ext_openssh_rename(from: string, to: string, cb: (error: Error | undefined) => void): void {
    this.extRenames.push([from, to])
    if (this.extRenameMode === 'throw') throw new Error('Server does not support this extended request')
    cb(this.extRenameMode === 'error' ? new Error('failure') : undefined)
  }
  createReadStream(path: string, opts?: Record<string, unknown>): Readable {
    this.readStreams.push({ path, opts })
    return new Readable({ read() {} })
  }
  createWriteStream(path: string, opts?: Record<string, unknown>): Writable {
    // 用单侧 Writable（不是 PassThrough）：ssh2 写流 end() 后 server ack 再发
    // 'close'——Writable 的 autoDestroy 恰好给出「end → finish → close」同款序列；
    // PassThrough 的读侧不关，end 后永远不发 close（会让 done 悬挂）
    const stream = new Writable({
      write(_chunk, _enc, cb) {
        cb()
      },
      final(cb) {
        cb()
      },
    })
    this.writeStreams.push({ path, opts, stream })
    return stream
  }
}

/** 假 ssh2 Client：ready/sftp 由测试注入，connect/end 可观察。 */
class FakeClient extends EventEmitter {
  ended = false
  sftpImpl: ((cb: (error: Error | undefined, channel?: FakeSftp) => void) => void) | null = null
  connect(_config: unknown): void {}
  end(): void {
    this.ended = true
  }
  sftp(cb: (error: Error | undefined, channel?: FakeSftp) => void): void {
    this.sftpImpl?.(cb)
  }
  trigger(event: string, ...args: unknown[]): void {
    this.emit(event, ...args)
  }
}

interface Harness {
  manager: SftpManager
  client: FakeClient
  fake: FakeSftp
  log: string[]
}

async function makeHarness(): Promise<Harness> {
  const fake = new FakeSftp()
  let client: FakeClient | null = null
  h.factory = () => {
    client = new FakeClient()
    client.sftpImpl = (cb) => cb(undefined, fake)
    return client
  }
  const log: string[] = []
  const manager = new SftpManager(
    { info: (m) => log.push(m), warn: (m) => log.push(m) },
    { get: () => undefined, record: () => {} },
  )
  // 触发一次建连：acquire 在 buildConnectConfig 的微任务之后才注册 'ready' 处理器，
  // 所以轮询触发直到探活 promise settle（过早触发的事件会落空导致悬挂）
  fake.listings.set('/', [])
  const probe = manager.list(SPEC, '/')
  let settled = false
  probe.then(() => { settled = true }, () => { settled = true })
  await until(() => {
    client?.trigger('ready')
    return settled
  })
  await probe // 若 reject，这里抛出真实原因
  return { manager, client: client as FakeClient, fake, log }
}

async function until(cond: () => boolean, ms = 2000): Promise<void> {
  const start = Date.now()
  while (!cond()) {
    if (Date.now() - start > ms) throw new Error('测试等待超时')
    await new Promise((r) => setTimeout(r, 10))
  }
}

describe('remove 护栏（D25）', () => {
  it.each([
    ['/', '根目录'],
    ['//', '根目录'],
    ['/home', 'home'],
    ['~', 'home'],
    ['~/data', 'home'],
    ['/a/../b', '相对段'],
    ['/a/./b', '相对段'],
    ['..', '相对段'],
    ['.', '相对段'],
  ])('拒绝 %s（%s）', (path) => {
    expect(() => assertRemovableRemotePath(path)).toThrow(/拒绝删除/)
  })

  it('护栏在触碰远端之前生效（表单不产生任何 lstat）', async () => {
    const { manager, fake } = await makeHarness()
    let lstatCalls = 0
    fake.lstat = (path, cb) => {
      lstatCalls += 1
      cb(new Error('should not reach'))
    }
    await expect(manager.remove(SPEC, '/', true)).rejects.toThrow('拒绝删除')
    await expect(manager.remove(SPEC, '~/x', true)).rejects.toThrow('拒绝删除')
    expect(lstatCalls).toBe(0)
  })

  it('合法路径的递归删除走通：unlink 文件 + rmdir 目录', async () => {
    const { manager, fake } = await makeHarness()
    fake.nodes.set('/root', { kind: 'dir', size: 0, mtime: 0 })
    fake.nodes.set('/root/a.txt', { kind: 'file', size: 3, mtime: 0 })
    fake.listings.set('/root', [{ filename: 'a.txt', attrs: { kind: 'file', size: 3, mtime: 0 } }])
    await manager.remove(SPEC, '/root', true)
    expect(fake.unlinked).toEqual(['/root/a.txt'])
    expect(fake.rmdirCalls).toEqual(['/root'])
  })

  it('目录不带 recursive → rmdir（非空报错由服务端语义回传）', async () => {
    const { manager, fake } = await makeHarness()
    fake.nodes.set('/root', { kind: 'dir', size: 0, mtime: 0 })
    await manager.remove(SPEC, '/root', false)
    expect(fake.rmdirCalls).toEqual(['/root'])
    expect(fake.unlinked).toEqual([])
  })
})

describe('openUpload 原子落盘（D01）', () => {
  it('正常收尾：writableEnded 判据通过 → posix-rename 落盘到目标', async () => {
    const { manager, fake } = await makeHarness()
    const upload = await manager.openUpload(SPEC, '/d/f.txt')
    upload.stream.write('hello')
    upload.stream.end()
    await upload.done
    expect(fake.extRenames).toHaveLength(1)
    const [from, to] = fake.extRenames[0]
    expect(to).toBe('/d/f.txt')
    expect(from.startsWith('/d/f.txt.dsh-part-')).toBe(true)
  })

  it('posix-rename 不支持（同步 throw）→ 回退 unlink+rename（0.19.0 修复点）', async () => {
    const { manager, fake } = await makeHarness()
    fake.extRenameMode = 'throw'
    const upload = await manager.openUpload(SPEC, '/d/g.txt')
    upload.stream.write('x')
    upload.stream.end()
    await upload.done
    expect(fake.renames).toHaveLength(1)
    const [from, to] = fake.renames[0]
    expect(to).toBe('/d/g.txt')
    expect(from.startsWith('/d/g.txt.dsh-part-')).toBe(true)
    // 回退先清掉同名目标
    expect(fake.unlinked).toContain('/d/g.txt')
  })

  it('未 end 就 destroy（取消/中止）→ 拒绝且分片被清理，目标不受影响（0.19.0 修复点）', async () => {
    const { manager, fake } = await makeHarness()
    const upload = await manager.openUpload(SPEC, '/d/h.txt')
    upload.stream.write('half')
    upload.stream.destroy() // 无 error 的 destroy：close 仍会发，writableEnded === false
    await expect(upload.done).rejects.toThrow('上传中断')
    const part = fake.writeStreams.find((entry) => entry.path.startsWith('/d/h.txt.dsh-part-'))
    expect(part).toBeDefined()
    expect(fake.unlinked).toContain(part?.path)
  })

  it('写入错误 → 拒绝且分片被清理', async () => {
    const { manager, fake } = await makeHarness()
    const upload = await manager.openUpload(SPEC, '/d/i.txt')
    upload.stream.destroy(new Error('disk full'))
    await expect(upload.done).rejects.toThrow('disk full')
    const part = fake.writeStreams.find((entry) => entry.path.startsWith('/d/i.txt.dsh-part-'))
    expect(fake.unlinked).toContain(part?.path)
  })
})

describe('分片孤儿 24h 回收（崩溃残留收尾）', () => {
  it('同目录超 24h 的 .dsh-part-* 被清，新分片不动', async () => {
    const { manager, fake } = await makeHarness()
    const nowSec = Date.now() / 1000
    fake.listings.set('/d', [
      { filename: 'f.txt.dsh-part-stale', attrs: { kind: 'file', size: 1, mtime: nowSec - 25 * 3600 } },
      { filename: 'f.txt.dsh-part-fresh', attrs: { kind: 'file', size: 1, mtime: nowSec - 60 } },
      { filename: 'unrelated.txt', attrs: { kind: 'file', size: 1, mtime: nowSec - 99 * 3600 } },
    ])
    const upload = await manager.openUpload(SPEC, '/d/f.txt')
    upload.stream.end()
    await upload.done
    await until(() => fake.unlinked.includes('/d/f.txt.dsh-part-stale'))
    expect(fake.unlinked).not.toContain('/d/f.txt.dsh-part-fresh')
    expect(fake.unlinked).not.toContain('/d/unrelated.txt')
  })
})

describe('openDownload 探测分支（D26 / D30 宿主半边）', () => {
  it('stat 失败 → 明确报「远程路径不存在」（不再 200+断流）', async () => {
    const { manager } = await makeHarness()
    await expect(manager.openDownload(SPEC, '/missing.bin')).rejects.toThrow('远程路径不存在')
  })

  it('目标是目录 → 明确报错（不再按文件读出断流）', async () => {
    const { manager, fake } = await makeHarness()
    fake.nodes.set('/dir', { kind: 'dir', size: 0, mtime: 0 })
    await expect(manager.openDownload(SPEC, '/dir')).rejects.toThrow('是目录')
  })

  it('文件 → size 与流；offset 经 createReadStream 的 start 透传（D30）', async () => {
    const { manager, fake } = await makeHarness()
    fake.nodes.set('/f.log', { kind: 'file', size: 4096, mtime: 0 })
    const plain = await manager.openDownload(SPEC, '/f.log')
    expect(plain.size).toBe(4096)
    expect(fake.readStreams.at(-1)).toMatchObject({ path: '/f.log', opts: undefined })
    await manager.openDownload(SPEC, '/f.log', { offset: 100 })
    expect(fake.readStreams.at(-1)).toMatchObject({ path: '/f.log', opts: { start: 100 } })
  })
})

describe('tree 截断', () => {
  it('maxEntries 截断 → truncated:true，条数不超过上限', async () => {
    const { manager, fake } = await makeHarness()
    fake.nodes.set('/root', { kind: 'dir', size: 0, mtime: 0 })
    fake.nodes.set('/root/a', { kind: 'dir', size: 0, mtime: 0 })
    fake.listings.set('/root', [
      { filename: 'a', attrs: { kind: 'dir', size: 0, mtime: 0 } },
      { filename: 'b', attrs: { kind: 'file', size: 1, mtime: 0 } },
      { filename: 'c', attrs: { kind: 'file', size: 1, mtime: 0 } },
      { filename: 'd', attrs: { kind: 'file', size: 1, mtime: 0 } },
    ])
    fake.listings.set('/root/a', [
      { filename: 'deep', attrs: { kind: 'file', size: 1, mtime: 0 } },
    ])
    const result = await manager.tree(SPEC, '/root', { maxEntries: 3 })
    expect(result.entries).toHaveLength(3)
    expect(result.truncated).toBe(true)
  })

  it('maxDepth 限层：更深内容不入列且 truncated:true', async () => {
    const { manager, fake } = await makeHarness()
    fake.nodes.set('/root', { kind: 'dir', size: 0, mtime: 0 })
    fake.nodes.set('/root/a', { kind: 'dir', size: 0, mtime: 0 })
    fake.listings.set('/root', [{ filename: 'a', attrs: { kind: 'dir', size: 0, mtime: 0 } }])
    fake.listings.set('/root/a', [{ filename: 'deep', attrs: { kind: 'file', size: 1, mtime: 0 } }])
    const result = await manager.tree(SPEC, '/root', { maxDepth: 1 })
    expect(result.entries).toHaveLength(1) // 只有 /root/a 本身
    expect(result.truncated).toBe(true)
  })
})

describe('错误文案带对象（D59）', () => {
  it('读不到目录：文案带 path；code=2 时点明「不存在」而不是让人猜英文 errno', async () => {
    const { manager, fake } = await makeHarness()
    // ssh2 会把 SFTP 状态码挂在 err.code 上（SFTP.js: err.code = errorCode）
    fake.readdir = (path, cb) => {
      const error = Object.assign(new Error('No such file'), { code: 2 })
      cb(error)
    }
    await expect(manager.list(SPEC, '/etc/kubernetes')).rejects.toThrow(
      '读取目录失败 /etc/kubernetes: 不存在（NO_SUCH_FILE）',
    )
  })

  it('权限拒绝（code=3）也单独措辞', async () => {
    const { manager, fake } = await makeHarness()
    fake.readdir = (path, cb) => {
      const error = Object.assign(new Error('Permission denied'), { code: 3 })
      cb(error)
    }
    await expect(manager.list(SPEC, '/root')).rejects.toThrow('读取目录失败 /root: 权限不足（PERMISSION_DENIED）')
  })

  it('重命名失败：文案带 from → to（批量操作时才知道是哪一对）', async () => {
    const { manager, fake } = await makeHarness()
    fake.rename = (from, to, cb) => {
      cb(new Error('failure'))
    }
    await expect(manager.rename(SPEC, '/a.txt', '/b.txt')).rejects.toThrow('重命名失败 /a.txt → /b.txt: failure')
  })

  it('删除目录失败：文案带 path，且保留原有的 recursive / 权限提示', async () => {
    const { manager, fake } = await makeHarness()
    fake.nodes.set('/d', { kind: 'dir', size: 0, mtime: 0 })
    fake.rmdir = (path, cb) => {
      cb(new Error('Failure'))
    }
    await expect(manager.remove(SPEC, '/d', false)).rejects.toThrow(
      '删除目录失败 /d: Failure（目录非空时需 recursive:true；若非此原因，多为账号对该目录无写权限）',
    )
  })
})
