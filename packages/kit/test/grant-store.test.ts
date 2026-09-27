/**
 * @hyzyn/dsh-kit — 带外授权存储（grant-store）。
 *
 * 这一层是**安全边界**（它决定「这台机器上的 root 级能力」给不给），所以测的是四条容易被后来人放松
 * 的性质，而不是「能不能写 JSON」：
 *   1. **权限确定**：文件 0600、目录 0700，且不被调用方 umask 削掉（真机教训见 managed-block）；
 *   2. **原子落盘**：不留临时文件；读者不会看到半截内容；
 *   3. **坏文件 = 没有授权**（不是抛错、更不是「当作已授权」），且逐条丢弃而不是整份作废；
 *   4. **持久与跨实例可见**：授权是「宿主对这次运行的许可」，磁盘是唯一真相；`revoke` 空操作不写盘。
 */
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CONFIRM_DIR_NAME, GRANT_FILE_NAME, GrantStore, KIT_DIR_NAME, capabilityPaths, sharedGrantStore } from '../src/index.js'

const ENV = 'DSH_TEST_ALLOW_THING'
const OTHER = 'DSH_TEST_ALLOW_OTHER'
const IS_WINDOWS = process.platform === 'win32'

const dirs: string[] = []

/** 造一个隔离的 home 目录（每个用例一个，退出时删）。 */
function makeHome(): string {
  const dir = mkdtempSync(join(tmpdir(), 'kit-grant-'))
  dirs.push(dir)
  return join(dir, 'home')
}

afterEach(() => {
  vi.restoreAllMocks()
  // 落点覆写是**进程环境**：用例之间必须擦干净，否则一个用例设的值会把后面所有
  // 「默认落在 <DSH home>/dsh-kit」的断言带偏（D69 那类脆测试的同一课）
  delete process.env.DSH_KIT_HOME
  while (dirs.length > 0) rmSync(dirs.pop() as string, { recursive: true, force: true })
})

describe('GrantStore：读写与权限', () => {
  it('构造不碰磁盘；未授权时 has=false、source=undefined', () => {
    const home = makeHome()
    const store = new GrantStore(home)
    expect(store.has(ENV)).toBe(false)
    expect(store.source(ENV)).toBeUndefined()
    // 构造 + 查询都不该建出目录来（「没授权过」不该在用户主目录里留痕）
    expect(existsSync(home)).toBe(false)
  })

  it('grant 之后 has=true、source 记下时刻与通道，文件 0600、目录 0700', () => {
    const home = makeHome()
    const store = new GrantStore(home)
    const before = Math.floor(Date.now() / 1000)
    store.grant(ENV)
    expect(store.has(ENV)).toBe(true)
    const grant = store.source(ENV)
    expect(grant?.via).toBe('file')
    expect(grant?.grantedAt).toBeGreaterThanOrEqual(before)
    if (!IS_WINDOWS) {
      // 权限是被 umask 削还是显式补回来，是这条测试真正要盯的（managed-block 的真机教训）
      expect(statSync(store.path()).mode & 0o777).toBe(0o600)
      expect(statSync(home).mode & 0o777).toBe(0o700)
    }
  })

  it('落盘形状是 {version, grants}（将来改结构要靠它迁移）', () => {
    const home = makeHome()
    new GrantStore(home).grant(ENV)
    const parsed = JSON.parse(readFileSync(join(home, GRANT_FILE_NAME), 'utf8')) as Record<string, unknown>
    expect(parsed['version']).toBe(1)
    expect(parsed['grants']).toEqual({ [ENV]: { grantedAt: expect.any(Number), via: 'file' } })
  })

  it('授权是持久的：另一个实例（模拟重启后的宿主）读同一目录也认', () => {
    const home = makeHome()
    new GrantStore(home).grant(ENV)
    expect(new GrantStore(home).has(ENV)).toBe(true)
  })

  it('原子写不留临时文件', () => {
    const home = makeHome()
    const store = new GrantStore(home)
    store.grant(ENV)
    store.grant(OTHER)
    expect(readdirSync(home).filter((name) => name.endsWith('.tmp'))).toEqual([])
  })

  it('revoke 真删；对没有记录的能力 revoke 是空操作（不新建文件）', () => {
    const home = makeHome()
    const store = new GrantStore(home)
    store.grant(ENV)
    store.revoke(ENV)
    expect(store.has(ENV)).toBe(false)
    expect(JSON.parse(readFileSync(store.path(), 'utf8')).grants).toEqual({})

    const fresh = makeHome()
    const empty = new GrantStore(fresh)
    empty.revoke(ENV)
    expect(existsSync(fresh)).toBe(false)
  })

  it('revoke 之后新实例也不再认（撤销要落盘，不能只活在内存里）', () => {
    const home = makeHome()
    const store = new GrantStore(home)
    store.grant(ENV)
    store.revoke(ENV)
    expect(new GrantStore(home).has(ENV)).toBe(false)
  })
})

describe('capabilityPaths：落点带归属（kit 自己的目录，kit D08）', () => {
  it('三项全在 <DSH home>/dsh-kit/ 下，不在 DSH 主目录里裸奔', () => {
    const home = makeHome()
    const paths = capabilityPaths(home)
    expect(paths.dir).toBe(join(home, KIT_DIR_NAME))
    expect(paths.grantsFile).toBe(join(home, KIT_DIR_NAME, GRANT_FILE_NAME))
    expect(paths.confirmDir).toBe(join(home, KIT_DIR_NAME, CONFIRM_DIR_NAME))
    /*
     * 反过来断言「都在自己那级下面」：把落点改回平铺在 DSH 主目录时这条会立刻红——
     * 那次改动正是 D08 说的「与官方或别的插件撞名」。
     */
    for (const path of [paths.grantsFile, paths.confirmDir]) {
      expect(path.startsWith(paths.dir + sep), `${path} 应落在 ${paths.dir} 下`).toBe(true)
    }
  })

  it('GrantStore 的落点就是 capabilityPaths().grantsFile（路径只拼一次）', () => {
    const home = makeHome()
    const paths = capabilityPaths(home)
    const store = new GrantStore(paths.dir)
    expect(store.path()).toBe(paths.grantsFile)
    store.grant(ENV)
    expect(existsSync(paths.grantsFile)).toBe(true)
    // 授权文件确实落在 dsh-kit/ 里，而不是 DSH 主目录那一层
    expect(existsSync(join(home, GRANT_FILE_NAME))).toBe(false)
  })
})

describe('capabilityPaths：落点可注入（DSH_KIT_HOME，kit D12）', () => {
  it('设了就整份挪过去，DSH 主目录那一份一个字节都不碰', () => {
    const home = makeHome()
    const override = makeHome()
    expect(capabilityPaths(home).dir).toBe(join(home, KIT_DIR_NAME))
    process.env.DSH_KIT_HOME = override
    const paths = capabilityPaths(home)
    expect(paths.dir).toBe(resolve(override))
    expect(paths.grantsFile).toBe(join(resolve(override), GRANT_FILE_NAME))
    expect(paths.confirmDir).toBe(join(resolve(override), CONFIRM_DIR_NAME))
    // 覆写之后的落点不许再与 DSH 主目录有任何关系（验收要的正是「读不到你那份授权」）
    expect(paths.grantsFile.startsWith(home + sep)).toBe(false)
    // 真写一条：文件落在覆写目录里，DSH 主目录下连目录都不该出现
    new GrantStore(paths.dir).grant(ENV)
    expect(existsSync(paths.grantsFile)).toBe(true)
    expect(existsSync(join(home, KIT_DIR_NAME))).toBe(false)
  })

  it('空串 / 全空白视为没设（变量存在但没填的误配置回落到默认落点）', () => {
    const home = makeHome()
    for (const value of ['', '   ']) {
      process.env.DSH_KIT_HOME = value
      expect(capabilityPaths(home).dir).toBe(join(home, KIT_DIR_NAME))
    }
  })

  it('相对路径按 cwd 归一（同一个目录的不同拼法必须指向同一份授权）', () => {
    const home = makeHome()
    process.env.DSH_KIT_HOME = 'kit-home-relative'
    // 不 resolve 的话 `sharedGrantStore` 的 memo 键会把同一个目录算成两个，撤销会各看各的
    expect(capabilityPaths(home).dir).toBe(resolve('kit-home-relative'))
    expect(capabilityPaths(home).dir).toBe(resolve('./kit-home-relative/'))
  })
})

describe('sharedGrantStore：同一目录只造一个实例（kit D11）', () => {
  it('同一目录两次调用拿到**同一个**实例；不同目录各自一个', () => {
    const home = makeHome()
    const dir = capabilityPaths(home).dir
    expect(sharedGrantStore(dir)).toBe(sharedGrantStore(dir))
    // 相对/绝对拼法不同也算同一目录（键做过 resolve，否则同一目录会造出两个实例）
    expect(sharedGrantStore(join(home, '.', KIT_DIR_NAME))).toBe(sharedGrantStore(dir))
    expect(sharedGrantStore(dir + '-other')).not.toBe(sharedGrantStore(dir))
  })

  it('两个插件各绑一次（真宿主里 docker + tty 就是这样）：后绑的能看到先写的授权', () => {
    const home = makeHome()
    const dir = capabilityPaths(home).dir
    /*
     * 复现真实症状（2026-09-27，真宿主，docker + tty 都装）：两个插件在 apply() 里各绑一次
     * 「授权来源」，而 `bindCapabilitySources` 是**后绑定覆盖前一个**的模块级单例。
     *   - 共享实例：两个插件看到同一份缓存 → 授权对双方都可见；
     *   - 各自 `new`：第二个实例在启动时就缓存了「还没有 tty 授权」的表，用户在 tty 卡片上
     *     授权之后，tty 自己的快照仍报 false（界面显示「未获宿主授权」、撤销按钮都不渲染）。
     * 这里直接钉住「共享 = 可见」，并在下一条钉住「各自 new = 互相看不见」——后者是这一条的**理由**。
     */
    const dockerStore = sharedGrantStore(dir)
    dockerStore.grant('DSH_DOCKER_ALLOW_MUTATIONS')
    const ttyStore = sharedGrantStore(dir)
    expect(ttyStore).toBe(dockerStore)
    ttyStore.grant('DSH_TTY_ALLOW_PROXY_COMMAND')
    expect(dockerStore.has('DSH_TTY_ALLOW_PROXY_COMMAND')).toBe(true)
    expect(ttyStore.has('DSH_DOCKER_ALLOW_MUTATIONS')).toBe(true)
  })

  it('（反例）各自 new 的两个实例互相看不见对方**后来**写的授权 → 所以插件不许自己 new', () => {
    const home = makeHome()
    const dir = capabilityPaths(home).dir
    const dockerStore = new GrantStore(dir)
    expect(dockerStore.has('DSH_DOCKER_ALLOW_MUTATIONS')).toBe(false) // 首次查询：此刻读盘并缓存
    const ttyStore = new GrantStore(dir)
    ttyStore.grant('DSH_TTY_ALLOW_PROXY_COMMAND')
    // docker 那个实例已经缓存过空表：tty 后来写的授权它永远看不见（这就是真机上的症状）
    expect(dockerStore.has('DSH_TTY_ALLOW_PROXY_COMMAND')).toBe(false)
  })
})

describe('GrantStore：坏文件容错（安全方向永远是「没有授权」）', () => {
  it('文件不存在 = 空表（不抛错）', () => {
    expect(new GrantStore(makeHome()).has(ENV)).toBe(false)
  })

  it('非法 JSON → 当空表 + warn，不抛错', () => {
    const home = makeHome()
    mkdirSync(home, { recursive: true })
    writeFileSync(join(home, GRANT_FILE_NAME), '{ 这不是 json')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    expect(new GrantStore(home).has(ENV)).toBe(false)
    expect(warn).toHaveBeenCalledOnce()
  })

  it('结构不对（grants 不是对象 / 值不是对象）→ 空表', () => {
    for (const payload of ['{"version":1}', '{"version":1,"grants":[]}', '{"version":1,"grants":null}', '[]', '"str"']) {
      const home = makeHome()
      mkdirSync(home, { recursive: true })
      writeFileSync(join(home, GRANT_FILE_NAME), payload)
      expect(new GrantStore(home).has(ENV), payload).toBe(false)
    }
  })

  it('逐条丢弃坏记录，但**保住**同一份文件里合法的那些', () => {
    const home = makeHome()
    mkdirSync(home, { recursive: true })
    writeFileSync(
      join(home, GRANT_FILE_NAME),
      JSON.stringify({
        version: 1,
        grants: {
          [ENV]: { grantedAt: 1, via: 'file' },
          [OTHER]: { via: 'file' }, // 缺 grantedAt
          'DSH_TEST_ALLOW_BAD_VIA': { grantedAt: 1, via: 'unknown-channel' },
          'DSH_TEST_ALLOW_NOT_OBJECT': 42,
        },
      }),
    )
    const store = new GrantStore(home)
    expect(store.has(ENV)).toBe(true)
    expect(store.has(OTHER)).toBe(false)
    expect(store.has('DSH_TEST_ALLOW_BAD_VIA')).toBe(false)
    expect(store.has('DSH_TEST_ALLOW_NOT_OBJECT')).toBe(false)
  })

  it('其它进程写进来的变更**不热生效**（首查读盘后缓存，直到新实例）', () => {
    const home = makeHome()
    const store = new GrantStore(home)
    expect(store.has(ENV)).toBe(false)
    // 模拟「另一个进程授权了」：磁盘变了，但这个实例已经读过盘
    mkdirSync(home, { recursive: true })
    writeFileSync(store.path(), JSON.stringify({ version: 1, grants: { [ENV]: { grantedAt: 1, via: 'file' } } }))
    expect(store.has(ENV)).toBe(false)
    expect(new GrantStore(home).has(ENV)).toBe(true)
  })
})
