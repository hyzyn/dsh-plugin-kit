/**
 * @hyzyn/dsh-kit — 能力开关的宿主侧授权（capability）。
 *
 * 这一层是**安全约定**，所以测的不是「函数能不能读环境变量」（那太显然），而是几条容易被后来人
 * 改坏的语义：
 *   1. **只有白名单值算授权**（`1/true/yes/on`）——`0` / `false` / 空 / 任意字符串都不算，
 *      否则「设了个变量」就会变成提权；
 *   2. **判定源是宿主的启动环境快照，且只认 `process` 层**——`.env`（`project-env` / `user-env`）
 *      有 HTTP 写入路径（环境变量卡片），拿它当授权等于把提权路径搬到那张卡片上；
 *   3. **绑定之后运行期改写 `process.env` 不生效**（快照语义，不是现读）；
 *   4. **带外授权存储不缓存**：撤销要立刻生效（缓存 = 「撤销了还能用」）；
 *   5. 未授权时的**文案要把通道说清**（哪条环境变量、要不要重启、什么时候设才算），否则用户会在
 *      卡片上反复点一个点不动的开关；但**不点名插件私有的文件名**（kit D10）。
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  GrantStore,
  bindCapabilitySources,
  capabilityDeniedMessage,
  capabilityGrantAt,
  capabilityGrantVia,
  capabilityGranted,
  capabilityHowTo,
} from '../src/index.js'

const SPEC = { env: 'DSH_TEST_ALLOW_THING', label: '测试能力' }
const OTHER = 'DSH_TEST_ALLOW_OTHER'

/** 宿主启动环境快照的三层（与 `@deepseek-ai/dsh-launch-environment` 一致）。 */
interface Layers {
  process?: Record<string, string>
  'project-env'?: Record<string, string>
  'user-env'?: Record<string, string>
}

/**
 * 假启动快照：**只对调用方请求的层**返回值——真实的 `getFrom` 就是这个行为（按 `SOURCES` 过滤），
 * 所以这个假对象能测出「实现到底问了哪一层」。
 */
function launchEnv(layers: Layers, asked: string[][] = []): { getFrom(name: string, sources: string[]): { value: string } | undefined } {
  return {
    getFrom(name, sources) {
      asked.push([...sources])
      for (const source of sources) {
        const value = layers[source as keyof Layers]?.[name]
        if (value !== undefined) return { value }
      }
      return undefined
    },
  }
}

/** 只实现 `ctx.get('launchEnvironment')` 的宿主上下文。 */
function ctxWith(snapshot: unknown): { get(name: string): unknown } {
  return { get: (name: string) => (name === 'launchEnvironment' ? snapshot : undefined) }
}

const dirs: string[] = []

function makeStore(): GrantStore {
  const dir = mkdtempSync(join(tmpdir(), 'kit-cap-'))
  dirs.push(dir)
  return new GrantStore(dir)
}

beforeEach(() => {
  delete process.env[SPEC.env]
  delete process.env[OTHER]
})

afterEach(() => {
  delete process.env[SPEC.env]
  delete process.env[OTHER]
  while (dirs.length > 0) rmSync(dirs.pop() as string, { recursive: true, force: true })
  // 还原成「没有快照」的绑定，免得把绑定状态漏给同文件后面的用例
  bindCapabilitySources(undefined)
})

describe('capabilityGranted：只有白名单值算授权', () => {
  it('1 / true / yes / on（大小写与空白不敏感）算授权', () => {
    for (const value of ['1', 'true', 'TRUE', ' yes ', 'On']) {
      bindCapabilitySources(ctxWith(launchEnv({ process: { [SPEC.env]: value } })))
      expect(capabilityGranted(SPEC), value).toBe(true)
    }
  })

  it('0 / false / 空串 / 任意其它字符串 / 未设置 都算**没授权**', () => {
    for (const value of ['0', 'false', '', '  ', 'no', 'off', 'enabled', '2']) {
      bindCapabilitySources(ctxWith(launchEnv({ process: { [SPEC.env]: value } })))
      expect(capabilityGranted(SPEC), value).toBe(false)
    }
    bindCapabilitySources(ctxWith(launchEnv({ process: {} })))
    expect(capabilityGranted(SPEC)).toBe(false)
  })

  it('接受裸环境变量名（与 CapabilitySpec 等价）', () => {
    bindCapabilitySources(ctxWith(launchEnv({ process: { [SPEC.env]: '1' } })))
    expect(capabilityGranted(SPEC.env)).toBe(true)
  })
})

describe('capabilityGranted：判定源是启动快照的 process 层', () => {
  it('只问 process 层：project-env / user-env 里的值**不算授权**', () => {
    const asked: string[][] = []
    bindCapabilitySources(
      ctxWith(
        launchEnv(
          {
            'project-env': { [SPEC.env]: '1' }, // <cwd>/.env（有 HTTP 写入路径）
            'user-env': { [SPEC.env]: '1' }, // $DSH_HOME/.env（环境变量卡片写的就是它）
          },
          asked,
        ),
      ),
    )
    expect(capabilityGranted(SPEC)).toBe(false)
    expect(asked[0]).toEqual(['process'])
  })

  it('绑定之后运行期改写 process.env **不生效**（快照语义）', () => {
    bindCapabilitySources(ctxWith(launchEnv({ process: {} })))
    expect(capabilityGranted(SPEC)).toBe(false)
    process.env[SPEC.env] = '1' // 相当于环境变量卡片在运行期改了 process.env
    expect(capabilityGranted(SPEC)).toBe(false)
  })

  it('重新绑定 = 重采样（模拟宿主重启后带着新环境起来）', () => {
    bindCapabilitySources(ctxWith(launchEnv({ process: {} })))
    expect(capabilityGranted(SPEC)).toBe(false)
    bindCapabilitySources(ctxWith(launchEnv({ process: { [SPEC.env]: '1' } })))
    expect(capabilityGranted(SPEC)).toBe(true)
  })

  it('绑定过「已授权」之后，删掉环境变量仍然算授权（是真的快照，不是现读）', () => {
    const value = '1'
    bindCapabilitySources(ctxWith(launchEnv({ process: { [OTHER]: value } })))
    expect(capabilityGranted(OTHER)).toBe(true)
    bindCapabilitySources(ctxWith(launchEnv({ process: { [OTHER]: value } })))
    delete process.env[OTHER]
    expect(capabilityGranted(OTHER)).toBe(true)
  })

  it('拿不到启动快照时退回「绑定那一刻的 process.env 拷贝」：之后运行期改写同样不生效', () => {
    delete process.env[SPEC.env]
    bindCapabilitySources(undefined)
    process.env[SPEC.env] = '1'
    expect(capabilityGranted(SPEC)).toBe(false)

    process.env[OTHER] = '1'
    bindCapabilitySources(undefined)
    delete process.env[OTHER]
    expect(capabilityGranted(OTHER)).toBe(true)
  })

  it('多个能力各自独立采样', () => {
    bindCapabilitySources(ctxWith(launchEnv({ process: { [SPEC.env]: '1' } })))
    expect(capabilityGranted(SPEC)).toBe(true)
    expect(capabilityGranted(OTHER)).toBe(false)
  })
})

describe('capabilityGranted：带外授权存储（就地提权那条通道）', () => {
  it('存储命中即授权，来源是 file；撤销后**立刻**失效（不缓存）', () => {
    const store = makeStore()
    bindCapabilitySources(ctxWith(launchEnv({ process: {} })), store)
    expect(capabilityGranted(SPEC)).toBe(false)
    store.grant(SPEC.env)
    expect(capabilityGranted(SPEC)).toBe(true)
    expect(capabilityGrantVia(SPEC)).toBe('file')
    store.revoke(SPEC.env)
    expect(capabilityGranted(SPEC)).toBe(false)
    expect(capabilityGrantVia(SPEC)).toBeUndefined()
  })

  it('启动环境优先于存储：两条都命中时报 env（界面据此决定不给「撤销」按钮）', () => {
    const store = makeStore()
    store.grant(SPEC.env)
    bindCapabilitySources(ctxWith(launchEnv({ process: { [SPEC.env]: '1' } })), store)
    expect(capabilityGranted(SPEC)).toBe(true)
    // 报 file 会让界面给出「撤销」按钮，而撤销后能力照旧是开的（环境变量还授权着）——比不给更糟
    expect(capabilityGrantVia(SPEC)).toBe('env')
  })

  it('只绑环境（不传存储）= 只有启动环境通道（还没接入就地提权的插件走这条）', () => {
    bindCapabilitySources(ctxWith(launchEnv({ process: {} })))
    expect(capabilityGrantVia(SPEC)).toBeUndefined()
  })
})

describe('capabilityGrantVia：来源必须可分辨', () => {
  it('env / file / undefined 三态', () => {
    bindCapabilitySources(ctxWith(launchEnv({ process: { [SPEC.env]: '1' } })))
    expect(capabilityGrantVia(SPEC)).toBe('env')
    expect(capabilityGrantVia(SPEC.env)).toBe('env')

    const store = makeStore()
    bindCapabilitySources(ctxWith(launchEnv({ process: {} })), store)
    expect(capabilityGrantVia(SPEC)).toBeUndefined()
    store.grant(SPEC.env)
    expect(capabilityGrantVia(SPEC)).toBe('file')
  })
})

describe('文案：通道与步骤都要说清', () => {
  it('capabilityHowTo 给出变量名与「重启宿主」，并把「什么时候设才算」说成人话', () => {
    const text = capabilityHowTo(SPEC)
    expect(text).toContain(SPEC.env)
    expect(text).toContain('重启宿主')
    expect(text).toContain('启动之后再设')
    /*
     * 界面文案**不点名插件私有的文件名**（kit D10）：`.env` / `~/.dsh/env.yml` 是环境变量插件与
     * 项目目录的概念，没装那个插件的人看到只会困惑（用户原话：「别人不见得会装 env 插件」）。
     * 规则本身（启动之后再设不算）留下，实现细节留给文档与源码注释。
     */
    expect(text).not.toContain('.env')
    expect(text).not.toContain('env.yml')
  })

  it('只有声明了就地提权插件的文案才提「就地确认」（否则用户会去找不存在的入口）', () => {
    expect(capabilityHowTo(SPEC)).not.toContain('就地确认')
    expect(capabilityHowTo(SPEC, { inPlace: true })).toContain('就地确认')
  })

  it('capabilityDeniedMessage 说明为什么 HTTP 不能提权，并带上怎么做', () => {
    const text = capabilityDeniedMessage(SPEC)
    expect(text).toContain('测试能力')
    expect(text).toContain(SPEC.env)
    expect(text).toContain('重启宿主')
    expect(text).toContain('HTTP')
    // 有了就地提权之后，正确的说法是「不能凭空打开」，而不是「只能关不能开」
    expect(text).toContain('不能凭空打开')
    expect(text).not.toContain('只能关闭')
  })
})

/**
 * 授权时刻（kit D09）。
 *
 * 界面要显示「授权于 …」，所以这里钉住两件事：**只有 `file` 通道有值**（环境变量通道没有「授权
 * 时刻」——它就是启动环境的一部分，编一个时间比不显示更糟），以及**两条都命中时报 undefined**
 * （与 `capabilityGrantVia` 报 `env` 同一口径：那时界面显示的是「撤销不了」）。
 */
describe('capabilityGrantAt：只有带外授权有时刻', () => {
  it('带外授权：返回授权文件里记下的 Unix 秒', () => {
    const store = makeStore()
    bindCapabilitySources(ctxWith(launchEnv({ process: {} })), store)
    const before = Math.floor(Date.now() / 1000)
    store.grant(SPEC.env)
    const at = capabilityGrantAt(SPEC)
    expect(at).toBeGreaterThanOrEqual(before)
    expect(at).toBe(store.source(SPEC.env)?.grantedAt)
  })

  it('启动环境变量授权：没有时刻（不编）', () => {
    bindCapabilitySources(ctxWith(launchEnv({ process: { [SPEC.env]: '1' } })))
    expect(capabilityGranted(SPEC)).toBe(true)
    expect(capabilityGrantAt(SPEC)).toBeUndefined()
  })

  it('两条都命中（环境变量胜出）：也没有时刻——那时界面显示的是「去启动环境改」', () => {
    const store = makeStore()
    bindCapabilitySources(ctxWith(launchEnv({ process: { [SPEC.env]: '1' } })), store)
    store.grant(SPEC.env)
    expect(capabilityGrantVia(SPEC)).toBe('env')
    expect(capabilityGrantAt(SPEC)).toBeUndefined()
  })

  it('未授权 / 未绑定存储：undefined', () => {
    bindCapabilitySources(ctxWith(launchEnv({ process: {} })), makeStore())
    expect(capabilityGrantAt(SPEC)).toBeUndefined()
    expect(capabilityGrantAt(OTHER)).toBeUndefined()
  })

  it('接受裸变量名（与 capabilityGranted / capabilityGrantVia 同口径）', () => {
    const store = makeStore()
    bindCapabilitySources(ctxWith(launchEnv({ process: {} })), store)
    store.grant(SPEC.env)
    expect(capabilityGrantAt(SPEC.env)).toBe(capabilityGrantAt(SPEC))
  })
})
