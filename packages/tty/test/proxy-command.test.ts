/**
 * @hyzyn/dsh-tty — 代理命令（ProxyCommand）的**信任闸门**与连接簿链路回归。
 *
 * 这一档与跳板机不同：跳板机只是「多连一跳 TCP」，代理命令是**设置字段驱动的本机任意命令
 * 执行**。所以它的回归要同时钉住三件事：
 *
 *   1. **默认关**，且关着时携带它的连接**明确失败**——绝不静默退回直连（`packages/dsh-tty`
 *      的调用方是四条建连路径，漏一处就是「关了我还能用」）；
 *   2. **关着时不起进程**（这里用一条「会写文件」的命令来证明：文件没出现 = 真的没执行）；
 *   3. 开了之后**真能跑起来、也真能被收掉**（子进程不许残留）。
 *
 * 另外照抄 `jump-spec.test.ts` 的做法真跑一遍插件：`POST /api/dsh-tty/config` → `GET`，
 * 证明 `proxyCommand` 穿过了四道扁平白名单（漏一道同样是「配了等于没配」）。
 */
import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { apply } from '../src/index.js'
import { __resetCapabilityGrantsForTest, capabilityGranted } from '@hyzyn/dsh-kit'
import {
  dialProxyCommand,
  expandProxyCommand,
  prepareSshConnect,
  proxyCommandAllowedNow,
  proxyCommandGrantedNow,
  proxyFailureSuffix,
  PROXY_COMMAND_DISABLED,
  PROXY_COMMAND_MAX,
  PROXY_COMMAND_NOT_GRANTED,
  sanitizeProxyCommand,
  setProxyCommandPolicy,
  validateProxyCommand,
} from '../src/ssh.js'

/** 宿主侧授权的环境变量名（与 src/index.ts 的 CAP_PROXY_COMMAND 同一份口径）。 */
const GRANT_ENV = 'DSH_TTY_ALLOW_PROXY_COMMAND'

/** 每个用例结束后复位：闸门（授权 + 启用）与环境变量都不留给下一个用例。 */
afterEach(() => {
  setProxyCommandPolicy({ granted: false, enabled: false })
  delete process.env[GRANT_ENV]
  __resetCapabilityGrantsForTest()
})

/** 模拟「宿主启动时就带了授权环境变量」：设环境变量 + 清采样缓存 + 打开策略。 */
function grantHostSide(enabled = true): void {
  process.env[GRANT_ENV] = '1'
  __resetCapabilityGrantsForTest()
  expect(capabilityGranted(GRANT_ENV)).toBe(true)
  setProxyCommandPolicy({ granted: true, enabled })
}

/** 一条「真跑起来就会在 cwd 留下文件」的命令：用来证明闸门关着时**没有起进程**。 */
const GATE_PROBE_FILE = 'proxy-gate-probe.tmp'
const gateProbeCommand = `"${process.execPath}" -e "require('node:fs').writeFileSync('${GATE_PROBE_FILE}','1')"`
/** 常驻命令（60s 后才自己退出）：用来验「起来了」与「收得掉」。 */
const idleCommand = `"${process.execPath}" -e "setTimeout(() => {}, 60000)"`

/** 等一个条件成立（子进程退出是异步的；轮询比 sleep 稳）。 */
async function waitFor(check: () => boolean, timeoutMs = 3000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (check()) return true
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  return check()
}

describe('sanitizeProxyCommand / validateProxyCommand（白名单的两个纯函数点）', () => {
  it('清洗：非字符串 / 空 / 纯空白 → undefined（「没配」），首尾空白去掉', () => {
    expect(sanitizeProxyCommand(undefined)).toBeUndefined()
    expect(sanitizeProxyCommand(42)).toBeUndefined()
    expect(sanitizeProxyCommand('')).toBeUndefined()
    expect(sanitizeProxyCommand('   ')).toBeUndefined()
    expect(sanitizeProxyCommand('  ssh -W %h:%p bastion  ')).toBe('ssh -W %h:%p bastion')
  })

  it('清洗：多行 / NUL / 超长一律当没配（失败方向是**关**，不是截断执行）', () => {
    expect(sanitizeProxyCommand('ssh -W %h:%p\nrm -rf /')).toBeUndefined()
    expect(sanitizeProxyCommand('ssh -W %h:%p\r\nbastion')).toBeUndefined()
    expect(sanitizeProxyCommand('ssh\0-W')).toBeUndefined()
    expect(sanitizeProxyCommand('x'.repeat(PROXY_COMMAND_MAX + 1))).toBeUndefined()
    expect(sanitizeProxyCommand('x'.repeat(PROXY_COMMAND_MAX))).toHaveLength(PROXY_COMMAND_MAX)
  })

  it('严格校验：拒绝分支逐条点名；空串 = 没配（返回空对象而不是错误）', () => {
    expect(validateProxyCommand(42).error).toContain('proxyCommand 必须是字符串')
    expect(validateProxyCommand('a\nb').error).toContain('单行')
    expect(validateProxyCommand('x'.repeat(PROXY_COMMAND_MAX + 1)).error).toContain('过长')
    expect(validateProxyCommand('   ')).toEqual({})
    expect(validateProxyCommand(' nc bastion 22 ')).toEqual({ proxyCommand: 'nc bastion 22' })
  })
})

describe('expandProxyCommand（OpenSSH 同义占位符）', () => {
  const spec = { host: 'target.corp', port: 2222, username: 'deploy' }

  it('%h %p %r %n %% 全部展开', () => {
    expect(expandProxyCommand('ssh -W %h:%p bastion', spec)).toBe('ssh -W target.corp:2222 bastion')
    expect(expandProxyCommand('ssh -l %r -W %n:%p b', spec)).toBe('ssh -l deploy -W target.corp:2222 b')
    expect(expandProxyCommand('echo 100%% | nc %h %p', spec)).toBe('echo 100% | nc target.corp 2222')
  })

  it('端口缺省按 22 展开', () => {
    expect(expandProxyCommand('nc %h %p', { host: 'h', username: 'u' })).toBe('nc h 22')
  })

  it('没实现的 %X 原样保留（用户可能在命令里写 printf %s，替我们没实现的东西失败才是意外）', () => {
    expect(expandProxyCommand("printf '%s' %h", spec)).toBe("printf '%s' target.corp")
  })

  it('代入值含 shell 特殊字符 → **拒绝执行**（白名单，不做跨平台转义）', () => {
    expect(() => expandProxyCommand('nc %h 22', { host: 'h; rm -rf /', username: 'u' })).toThrow(/无法代入/)
    expect(() => expandProxyCommand('nc %h 22', { host: '$(id)', username: 'u' })).toThrow(/无法代入/)
    // 用户名那一跳同样要过白名单（占位符出现才校验：没写 %r 的命令不受用户名影响）
    expect(() => expandProxyCommand('nc %h 22 -l %r', { host: 'h', username: 'u`whoami`' })).toThrow(/无法代入/)
    // 合法字符集照常放行：IPv6 方括号、点、下划线、连字符
    expect(expandProxyCommand('nc %h %p', { host: '[::1]', port: 22, username: 'u' })).toBe('nc [::1] 22')
  })
})

describe('闸门：默认未授权 + 未启用，两种状态各自点名下一步', () => {
  it('默认状态：既没授权也没启用', () => {
    expect(proxyCommandGrantedNow()).toBe(false)
    expect(proxyCommandAllowedNow()).toBe(false)
  })

  it('未获宿主授权时抛的是「未授权」文案（说清设哪个变量 + 要重启），**没有起任何进程**', async () => {
    const probe = join(process.cwd(), GATE_PROBE_FILE)
    rmSync(probe, { force: true })
    await expect(dialProxyCommand({ spec: { host: 'h', username: 'u', proxyCommand: gateProbeCommand } }))
      .rejects.toThrow(PROXY_COMMAND_NOT_GRANTED)
    // 真的没执行：那条命令一旦跑起来就会在 cwd 留下这个文件
    expect(existsSync(probe)).toBe(false)
    // 文案必须同时给出变量名与「重启宿主」——只说一半会让用户对着点不动的开关反复点
    await dialProxyCommand({ spec: { host: 'h', username: 'u', proxyCommand: gateProbeCommand } })
      .catch((error: Error) => {
        expect(error.message).toContain(GRANT_ENV)
        expect(error.message).toContain('重启宿主')
      })
    // 命令**不存在**时也一样先撞闸门（证明判闸在 spawn 之前，不是 spawn 失败后补的文案）
    await expect(dialProxyCommand({ spec: { host: 'h', username: 'u', proxyCommand: 'definitely-not-a-real-command-xyz' } }))
      .rejects.toThrow('未获宿主授权')
  })

  it('已授权但开关关着 → 抛「未启用」（下一步只是把开关打开），同样不起进程', async () => {
    grantHostSide(false)
    const probe = join(process.cwd(), GATE_PROBE_FILE)
    rmSync(probe, { force: true })
    await expect(dialProxyCommand({ spec: { host: 'h', username: 'u', proxyCommand: gateProbeCommand } }))
      .rejects.toThrow(PROXY_COMMAND_DISABLED)
    expect(existsSync(probe)).toBe(false)
  })

  it('两条文案必须**不同**（下一步动作不同：一个去设环境变量，一个去开开关）', () => {
    expect(PROXY_COMMAND_NOT_GRANTED).not.toBe(PROXY_COMMAND_DISABLED)
    expect(PROXY_COMMAND_NOT_GRANTED).toContain('未获宿主授权')
    expect(PROXY_COMMAND_DISABLED).toContain('未启用')
  })

  it('四条建连路径共用的 prepareSshConnect 同样拒绝（不是只在终端那一处判）', async () => {
    await expect(prepareSshConnect({ spec: { host: 'h', username: 'u', proxyCommand: gateProbeCommand } }))
      .rejects.toThrow(PROXY_COMMAND_NOT_GRANTED)
    expect(existsSync(join(process.cwd(), GATE_PROBE_FILE))).toBe(false)
  })
})

describe('闸门：打开之后真跑、真收', () => {
  it('dialProxyCommand 返回可用传输；dispose() 之后子进程被杀（不留常驻孤儿）', async () => {
    grantHostSide()
    const dialed = await dialProxyCommand({ spec: { host: 'h', username: 'u', proxyCommand: idleCommand } })
    expect(dialed.sock.destroyed).toBe(false)
    expect(dialed.failure()).toBeNull()
    expect(proxyFailureSuffix(dialed)).toBe('')
    dialed.dispose()
    // 幂等：再收一次不该抛
    dialed.dispose()
    const exited = await waitFor(() => dialed.child.exitCode !== null || dialed.child.signalCode !== null)
    expect(exited).toBe(true)
  })

  it('子进程提前退出 → failure() 带退出码与 stderr 摘要（错误文案要说人话）', async () => {
    grantHostSide()
    const command = `"${process.execPath}" -e "process.stderr.write('boom');process.exit(3)"`
    const dialed = await dialProxyCommand({ spec: { host: 'h', username: 'u', proxyCommand: command } })
    /*
     * 子进程一退出就会 destroy 掉 sock，逼 ssh2 立刻报错（而不是干等 readyTimeout）。
     * 这里等的是**最终形态**：stderr 摘要出现在文案里为止——`exit` 与「传输关闭」相差
     * 1~2ms，ssh2 一看流断了就报错，谁先到不确定（负载高时反过来）。等死一个时序就是脆测试。
     */
    const explained = await waitFor(() => (dialed.failure()?.message ?? '').includes('boom'))
    expect(explained).toBe(true)
    expect(dialed.failure()?.message).toMatch(/代理命令已退出|代理命令传输已关闭/)
    expect(proxyFailureSuffix(dialed)).toContain('boom')
    expect(dialed.sock.destroyed).toBe(true)
    dialed.dispose()
  })

  it('竞态兜底：失败事实还没到、但 stderr 已有内容时，错误文案仍带上它（真机验收发现的差 1~2ms）', async () => {
    grantHostSide()
    /*
     * 这条命令**活着**（不退出）并往 stderr 写一句：`failure()` 必须仍然是 null（严格语义不能
     * 松），但 `proxyFailureSuffix()`（只在错误路径被调用）要能从 stderrHint 里把那句交出去。
     * 真宿主上就是这个形状：ssh2 一看到流断就报错，而 exit / 传输关闭比它晚一点。
     */
    const command = `"${process.execPath}" -e "process.stderr.write('ECONNREFUSED 127.0.0.1:9');setTimeout(() => {}, 60000)"`
    const dialed = await dialProxyCommand({ spec: { host: 'h', username: 'u', proxyCommand: command } })
    const seen = await waitFor(() => (dialed.stderrHint() ?? '').includes('ECONNREFUSED'))
    expect(seen).toBe(true)
    // 严格语义不变：传输还活着、子进程没退出 → 没有「失败事实」
    expect(dialed.failure()).toBeNull()
    expect(proxyFailureSuffix(dialed)).toContain('ECONNREFUSED 127.0.0.1:9')
    dialed.dispose()
    // 主动收尾之后不再提示（那是正常结束，不是线索）
    expect(dialed.stderrHint()).toBe('')
  })

  it('开关关掉之后立刻生效：同一个 spec 从「能起」变「拒绝」', async () => {
    grantHostSide()
    const dialed = await dialProxyCommand({ spec: { host: 'h', username: 'u', proxyCommand: idleCommand } })
    dialed.dispose()
    // 只关开关（授权仍在）：拒绝的理由应是「未启用」，而不是「未授权」
    setProxyCommandPolicy({ granted: true, enabled: false })
    await expect(dialProxyCommand({ spec: { host: 'h', username: 'u', proxyCommand: idleCommand } }))
      .rejects.toThrow(PROXY_COMMAND_DISABLED)
    expect(proxyCommandGrantedNow()).toBe(true)
  })

  it('prepareSshConnect 带代理命令时把 stdio 接到 connectConfig.sock（跳板机位为空）', async () => {
    grantHostSide()
    const prepared = await prepareSshConnect({ spec: { host: 'h', username: 'u', proxyCommand: idleCommand } })
    expect(prepared.bastion).toBeNull()
    expect(prepared.proxy).not.toBeNull()
    expect(prepared.connectConfig.sock).toBe(prepared.proxy?.sock)
    // 错误文案带「经代理命令」后缀：ssh2 在两跳上共用 readyTimeout，不点名会被读成目标超时
    expect(prepared.target).toContain('经代理命令')
    prepared.proxy?.dispose()
  })
})

/* ------------------------------------------------------------------ *
 * 连接簿链路（四道扁平白名单）——与 jump-spec.test.ts 同一套假件
 * ------------------------------------------------------------------ */

interface FakeRoute {
  kind: string
  path: string
  handler: (req: unknown, res: unknown) => Promise<void>
}

interface FakeRes {
  status: number
  body: string | undefined
  writeHead(status: number): void
  end(body?: string): void
}

function makeRes(): FakeRes {
  const res: FakeRes = {
    status: 0,
    body: undefined,
    writeHead(status) {
      res.status = status
    },
    end(body) {
      if (body !== undefined) res.body = body
    },
  }
  return res
}

/** 挂载插件并取出 `/api/dsh-tty/config` 路由（其余服务给够用的假件）。 */
function mountConfigRoute(): (req: unknown, res: FakeRes) => Promise<void> {
  const routes: FakeRoute[] = []
  const makeChild = (names: string[]): Record<string, unknown> => {
    const child: Record<string, unknown> = {
      logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
      effect: (callback: () => unknown) => {
        callback()
        return () => {}
      },
      inject: (childNames: string[], cb: (ctx: unknown) => void) => {
        cb(makeChild(childNames))
        return () => {}
      },
      on: () => () => {},
      events: { on: () => () => {} },
      get: () => undefined,
    }
    if (names.includes('webServer')) {
      child.webServer = {
        register: (route: FakeRoute) => {
          routes.push(route)
          return () => {}
        },
        registerUpgrade: () => () => {},
      }
    }
    if (names.includes('settings')) {
      child.settings = { describe: () => [], update: async () => {}, configure: () => () => {} }
    }
    if (names.includes('systemPrompt')) child.systemPrompt = { section: () => () => {}, context: () => () => {} }
    if (names.includes('credentials')) child.credentials = { resolve: async () => ({ value: undefined }) }
    return child
  }
  const root = makeChild([])
  root.inject = (names: string[], cb: (ctx: unknown) => void) => {
    cb(makeChild(names))
    return () => {}
  }
  ;(apply as unknown as (ctx: unknown, config: unknown) => void)(root, {})
  const route = routes.find((item) => item.path === '/api/dsh-tty/config')
  if (route === undefined) throw new Error('未注册 /api/dsh-tty/config 路由')
  return route.handler
}

function makeReq(method: string, body?: unknown): unknown {
  const payload = body === undefined ? '' : JSON.stringify(body)
  return {
    method,
    url: '/api/dsh-tty/config',
    headers: { host: '127.0.0.1:3080', 'sec-fetch-site': 'same-origin', 'content-type': 'application/json' },
    socket: { remoteAddress: '127.0.0.1' },
    async *[Symbol.asyncIterator]() {
      if (payload !== '') yield Buffer.from(payload)
    },
  }
}

describe('连接簿配置往返（settings schema + 两条清洗路径）', () => {
  it('POST 带 proxyCommand 的条目 → GET 读回仍是同一条（四道白名单都没漏）', async () => {
    const handler = mountConfigRoute()
    const entry = {
      name: 'via-proxy-command',
      host: '10.2.0.9',
      port: 22,
      username: 'deploy',
      auth: 'agent',
      keyPath: '',
      passphrase: '',
      password: '',
      agentForward: false,
      persist: false,
      proxyCommand: 'ssh -W %h:%p bastion.corp',
    }
    const post = makeRes()
    await handler(makeReq('POST', { sshHosts: [entry] }), post)
    expect(post.status, String(post.body)).toBe(200)

    const get = makeRes()
    await handler(makeReq('GET'), get)
    expect(get.status).toBe(200)
    const config = (JSON.parse(String(get.body)) as { config?: { sshHosts?: unknown[] } }).config ?? {}
    expect(config.sshHosts).toEqual([entry])
  })

  it('POST /config 想把 allowProxyCommand 打开 → 400，文案点名环境变量与「重启宿主」', async () => {
    const handler = mountConfigRoute()
    const post = makeRes()
    await handler(makeReq('POST', { allowProxyCommand: true }), post)
    expect(post.status).toBe(400)
    expect(String(post.body)).toContain(GRANT_ENV)
    expect(String(post.body)).toContain('重启宿主')
    // 没写盘：GET 读回仍是 false
    const get = makeRes()
    await handler(makeReq('GET'), get)
    const config = (JSON.parse(String(get.body)) as { config?: { allowProxyCommand?: boolean; allowProxyCommandGranted?: boolean } }).config ?? {}
    expect(config.allowProxyCommand).toBe(false)
    expect(config.allowProxyCommandGranted).toBe(false)
  })

  it('宿主侧授权之后，POST 打开就被接受（授权是唯一的提权通道）', async () => {
    grantHostSide(false)
    const handler = mountConfigRoute()
    const post = makeRes()
    await handler(makeReq('POST', { allowProxyCommand: true }), post)
    expect(post.status, String(post.body)).toBe(200)
    const config = (JSON.parse(String(post.body)) as { config?: { allowProxyCommand?: boolean; allowProxyCommandGranted?: boolean } }).config ?? {}
    expect(config.allowProxyCommand).toBe(true)
    expect(config.allowProxyCommandGranted).toBe(true)
  })

  it('降权永远可用：授权状态下把开关关掉不需要任何额外条件', async () => {
    grantHostSide()
    const handler = mountConfigRoute()
    const post = makeRes()
    await handler(makeReq('POST', { allowProxyCommand: false }), post)
    expect(post.status, String(post.body)).toBe(200)
  })

  it('多行 proxyCommand 会被明确拒绝（400），而不是静默丢掉半条命令', async () => {
    const handler = mountConfigRoute()
    const post = makeRes()
    await handler(makeReq('POST', {
      sshHosts: [{ name: 'x', host: 'h', port: 22, username: 'u', auth: 'agent', proxyCommand: 'ssh -W %h:%p bastion\nrm -rf /' }],
    }), post)
    expect(post.status).toBe(400)
    expect(String(post.body)).toContain('单行')
  })
})
