/**
 * 真机：**写入口**（`env_up` / `env_down`）的端到端 —— 门控在环境变量上，默认跳过。
 *
 * ```sh
 * DEVENV_REAL=1 \
 * DEVENV_REAL_WRITE_CONTAINER=<你指名的容器> \
 * DEVENV_REAL_SSH_PASSWORD=… \
 * npx vitest run packages/devenv/test/real-write.test.ts
 * ```
 *
 * ## 为什么它要**两个**门控，而且第二个是容器名
 *
 * 只读那些用例（`real-machine.test.ts`）跑错方向最多是读到一个错的状态；这一条会**真的启停一台共享机器
 * 上的容器**——而 248 上有同事在联调。所以这里把「人明确指名了一个可以动的容器」做成**门控本身**：
 * 没有 `DEVENV_REAL_WRITE_CONTAINER` 就整份跳过，运行时也**只碰这一个名字**。
 *
 * ## 它不创建、不删除
 *
 * 用例只 `start` / `stop`（与工具面允许的动作完全一致）；创建与删除刻意不在工具面里，用例也不做
 * ——「谁建的谁拆」是人的事（跑之前自己起一个一次性的，跑完自己删）。
 *
 * ## 它**还原现场**
 *
 * 开头先读一次状态，收尾把它恢复成原样：如果那个容器本来是停着的，用例结束时它必须还是停着的。
 * 不还原的话，跑一次测试就会改变机器的状态——那正是真机脚本最容易留下的「看不见的副作用」。
 *
 * ## 与只读那条的关系
 *
 * 观测层那四条走的是 `observeServices`；这一条走**插件本体**（配置 → 作用域 → 清单 → 能力 → 确认 →
 * 执行 → 报告），也就是「按下去会发生什么」的完整形状：两次拒绝（未授权 / 没带确认）**一条命令都
 * 不发**，允许的那两次用**另一条通道**（不经过插件的裸执行层）回读结果。
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { RemoteExec } from '@hyzyn/dsh-kit/ssh-exec'
import type { SshSpec } from '@hyzyn/dsh-kit/ssh-exec'

import { makeHost } from './fake-host.js'

const HOST = process.env.DEVENV_REAL_SSH_HOST ?? '192.168.80.248'
const USER = process.env.DEVENV_REAL_SSH_USER ?? 'root'
const PASSWORD = process.env.DEVENV_REAL_SSH_PASSWORD
const KEY_PATH = process.env.DEVENV_REAL_SSH_KEY_PATH
/** **人指名的**容器——它就是这条用例唯一的门控。 */
const CONTAINER = process.env.DEVENV_REAL_WRITE_CONTAINER
const CAN_PROBE = process.env.DEVENV_REAL === '1' && CONTAINER !== undefined && CONTAINER !== ''

const spec: SshSpec = {
  host: HOST,
  port: Number(process.env.DEVENV_REAL_SSH_PORT ?? '22'),
  username: USER,
  auth: KEY_PATH === undefined ? 'password' : 'key',
  ...(KEY_PATH === undefined ? { password: PASSWORD ?? '' } : { keyPath: KEY_PATH }),
}

describe.skipIf(!CAN_PROBE)(`真机：写入口（${USER}@${HOST}，容器 ${CONTAINER ?? '未指名'}）`, () => {
  /*
   * 回读用的**另一条通道**：不经过插件，直接问 docker。用同一个 `RemoteExec` 类但另建实例，
   * 意思是「这条断言不依赖被测代码给我什么」。
   */
  const rawExec = new RemoteExec({ info: () => {}, warn: () => {} }, { get: () => undefined, record: () => {} }, { tag: 'dsh-devenv-raw' })
  const rawStatus = async (): Promise<string> => {
    for (let attempt = 1; ; attempt += 1) {
      try {
        const out = await rawExec.run(spec, ['docker', 'inspect', '--format', '{{.State.Status}}', CONTAINER as string], { timeoutMs: 20_000 })
        return out.stdout.trim()
      } catch (error) {
        // 跨 VPN 的连接层抖动：真机用例的注释里记过（`devdata` 那边 15 次里 1 次）
        if (attempt >= 3) throw error
        await new Promise((resolve) => setTimeout(resolve, 800))
      }
    }
  }

  /**
   * 临时项目目录在 **`beforeAll`** 里建，不在模块顶层。
   *
   * 模块顶层建的话，**导入期**出一点问题（哪怕只是一个语法错）就再也没有机会删它——文件一跑挂、
   * `afterAll` 根本没注册，那个目录就留在系统临时区里（2026-10-02 实测留了一个，就是编译失败那次）。
   */
  let dir = ''
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'dsh-devenv-real-write-'))
    mkdirSync(join(dir, 'ready'), { recursive: true })
    writeFileSync(join(dir, 'ready', 'w.ready.yaml'), ['version: 1', 'project: w', 'services:', `  - name: ${CONTAINER ?? ''}`].join('\n') + '\n')
  })
  /** 开场状态（收尾要还原到它）。 */
  let initialStatus = ''

  /** 挂一台宿主：`granted` 决定启动环境里有没有那个授权变量。 */
  function mountHost(granted: boolean): ReturnType<typeof makeHost> {
    const host = makeHost({
      extraEntries: {
        tty: { sshHosts: [{ name: 'TEST', host: HOST, port: spec.port, username: USER, auth: spec.auth, ...(KEY_PATH === undefined ? { password: PASSWORD ?? '' } : { keyPath: KEY_PATH }) }] },
      },
    })
    if (granted) host.grant('DSH_DEVENV_WRITE')
    host.mount({
      targets: [{
        id: 'nas-248',
        label: '248（真机写路径验收）',
        kind: 'ssh',
        book: 'TEST',
        scopeDirs: [dir],
        writeCapability: { env: 'DSH_DEVENV_WRITE', label: '变更操作（启停容器）' },
      }],
      stopTimeoutSec: 10,
      execTimeoutMs: 20_000,
    })
    return host
  }

  const args = { target: 'nas-248', cwd: dir, project: 'w' }

  it('① 开场：容器在目标上存在，记下它的状态', async () => {
    initialStatus = await rawStatus()
    expect(['running', 'exited', 'created'], `读到的状态是 ${initialStatus}`).toContain(initialStatus)
  })

  it('② 未授权 + confirmed → `[CAPABILITY_NOT_GRANTED]`，容器**没被动过**', async () => {
    const host = mountHost(false)
    const error = await host.callError('env_down', { ...args, confirmed: true })
    expect(error).toContain('[CAPABILITY_NOT_GRANTED]')
    expect(error).toContain('DSH_DEVENV_WRITE')
    expect(await rawStatus(), '被拒的调用不该改变容器状态').toBe(initialStatus)
  })

  it('③ 已授权但没带 confirmed → `[CONFIRMATION_REQUIRED]`（文案点名那个容器），仍**没被动过**', async () => {
    const host = mountHost(true)
    const error = await host.callError('env_down', { ...args })
    expect(error).toContain('[CONFIRMATION_REQUIRED]')
    expect(error).toContain(CONTAINER as string)
    expect(await rawStatus(), '被拒的调用不该改变容器状态').toBe(initialStatus)
  })

  it('④ 停：`env_down` + confirmed 真的停掉它，报告四档齐全', async () => {
    const host = mountHost(true)
    if (initialStatus !== 'running') {
      // 本来就是停着的：先启起来，否则这一条测不到「真的停掉」
      await host.call('env_up', { ...args, confirmed: true })
    }
    const text = await host.call('env_down', { ...args, confirmed: true })
    expect(text).toContain(`已停止：${CONTAINER as string}`)
    expect(text).toContain('本来就那样、未动')
    expect(await rawStatus(), 'env_down 之后独立回读').toBe('exited')
    // 插件自己的只读工具也要读到同一件事
    expect(await host.call('env_status', args)).toContain('不是在跑')
  })

  it('⑤ 启：`env_up` + confirmed 真的启起来，`env_status` 回读为就绪', async () => {
    const host = mountHost(true)
    const text = await host.call('env_up', { ...args, confirmed: true })
    expect(text).toContain(`已启动：${CONTAINER as string}`)
    expect(await rawStatus(), 'env_up 之后独立回读').toBe('running')
    expect(await host.call('env_status', args)).toContain('全部 1 个服务就绪')
  })

  it('⑥ 幂等：再启一次 → 无需变更（且**不要求确认**，因为它没有活要干）', async () => {
    const host = mountHost(true)
    const text = await host.call('env_up', args) // 注意：**没带** confirmed
    expect(text).toContain('无需变更')
    expect(text).toContain('本来就那样、未动')
  })

  afterAll(async () => {
    // **还原现场**：把容器恢复成开场时的样子（跑一次测试不该改变机器状态）
    try {
      const want = initialStatus === 'running' ? 'start' : 'stop'
      const host = mountHost(true)
      await host.call(want === 'start' ? 'env_up' : 'env_down', { ...args, confirmed: true })
      const now = await rawStatus()
      if (initialStatus === 'running') expect(now, '收尾没把容器恢复到 running').toBe('running')
      if (initialStatus === 'exited') expect(now, '收尾没把容器恢复到 exited').toBe('exited')
    } finally {
      rawExec.disposeAll()
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
