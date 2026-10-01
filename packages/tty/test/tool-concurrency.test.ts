/**
 * @hyzyn/dsh-tty — 工具并发性声明的回归测试（项目级 ROADMAP 第 4 项）。
 *
 * 背景：宿主对**未声明** `isConcurrencySafe` 的工具一律按「独占」处理
 * （`dsh-tools/lib/index.js:3059` → `{ kind: 'exclusive' }`）。tty 的 17 个工具里
 * 9 个是纯读取（列会话 / 截图 / 抓输出 / 列 SFTP 目录 / 列隧道），本可以并发。
 *
 * 反向同样要钉：**变更**工具（开/关终端、发按键、写远端文件）多声明一次就是真事故。
 * 判定走工具自带的参数校验（`defineTool` 里参数不合法直接返回 false），所以这里按工具的
 * JSON Schema 造一份合法最小实参，避免把「我们调错了」误读成「没声明」。
 */
// DSH_HOME 隔离（D69）：读不到开发机上的真实授权文件
import './isolated-home.js'
import { describe, expect, it } from 'vitest'
import { apply } from '../src/index.js'

/** 只读工具：列 / 抓 / 截屏 / 探针，不改任何状态。 */
const READ_ONLY = ['tty_list', 'tty_stats', 'tty_capture', 'tty_screen', 'tty_expect', 'tunnel_list', 'sftp_list', 'sftp_read', 'sftp_tree']

/** 变更工具：开会话、关会话、发按键、跑一条命令、写远端 / 建目录 / 改名 / 删除。 */
const MUTATING = ['tty_open', 'tty_close', 'tty_run', 'tty_send', 'sftp_write', 'sftp_mkdir', 'sftp_rename', 'sftp_remove']

interface FakeToolDef {
  name: string
  parameters?: { required?: string[]; properties?: Record<string, { type?: string | string[] }> }
  isConcurrencySafe?: (args: unknown) => boolean
}

/** 按工具自己的 JSON Schema 造合法最小实参（理由见文件头）。 */
function minArgs(tool: FakeToolDef): Record<string, unknown> {
  const args: Record<string, unknown> = {}
  for (const key of tool.parameters?.required ?? []) {
    const type = tool.parameters?.properties?.[key]?.type
    const single = Array.isArray(type) ? type[0] : type
    args[key] = single === 'number' ? 1 : single === 'boolean' ? true : single === 'array' ? [] : 'sid-1'
  }
  return args
}

/**
 * 最小假 cordis ctx：只装 tools（捕获注册）+ 几个 inject 面。
 * tty 的 apply 会真的构造 SessionManager / TtyServer，但都不碰网络——没 webServer
 * 就不注册路由，没 subprocess 就不开终端。
 */
function mountPlugin(): Map<string, FakeToolDef> {
  const registered: FakeToolDef[] = []
  const listeners = new Map<string, Array<(...args: unknown[]) => void>>()
  const makeChild = (names: string[]): Record<string, unknown> => {
    const on = (name: string, listener: (...args: unknown[]) => void): (() => void) => {
      const list = listeners.get(name) ?? []
      list.push(listener)
      listeners.set(name, list)
      return () => {}
    }
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
      on,
      events: { on },
      get: (name: string) => {
        if (name === 'tools') {
          return {
            register: (definition: FakeToolDef) => {
              registered.push(definition)
              return () => {}
            },
          }
        }
        return undefined
      },
    }
    if (names.includes('webServer')) {
      child.webServer = { register: () => () => {}, registerUpgrade: () => () => {} }
    }
    if (names.includes('settings')) {
      child.settings = {
        describe: () => [],
        update: async () => {},
        configure: () => () => {},
      }
    }
    if (names.includes('systemPrompt')) {
      child.systemPrompt = { section: () => () => {}, context: () => () => {} }
    }
    if (names.includes('credentials')) child.credentials = { resolve: async () => ({ value: undefined }) }
    return child
  }
  const root = makeChild([])
  root.inject = (names: string[], cb: (ctx: unknown) => void) => {
    cb(makeChild(names))
    return () => {}
  }
  ;(apply as unknown as (ctx: unknown, config: unknown) => void)(root, {})
  // 假 ctx 下工具可能被注册两次（真实宿主由 disposer 撤旧）；按名字归并
  return new Map(registered.map((tool) => [tool.name, tool]))
}

describe('tty_* / sftp_* / tunnel_list 的 isConcurrencySafe 声明', () => {
  it('只读工具全部声明为并发安全（否则静默退回独占）', () => {
    const byName = mountPlugin()
    for (const name of READ_ONLY) {
      const tool = byName.get(name)
      expect(tool, `${name} 未注册`).toBeDefined()
      expect(typeof tool?.isConcurrencySafe, `${name} 未声明 isConcurrencySafe`).toBe('function')
      expect(tool?.isConcurrencySafe?.(minArgs(tool)), `${name} 未返回 true`).toBe(true)
    }
  })

  it('变更工具保持独占（开/关会话、发按键、写远端文件都改状态）', () => {
    const byName = mountPlugin()
    for (const name of MUTATING) {
      expect(byName.get(name), `${name} 未注册`).toBeDefined()
      expect(byName.get(name)?.isConcurrencySafe, `${name} 不该声明并发安全`).toBeUndefined()
    }
  })

  it('清单本身自洽：只读 + 变更 = 注册到的全部工具（新增工具时必须来这张表里归类）', () => {
    expect([...mountPlugin().keys()].sort()).toEqual([...READ_ONLY, ...MUTATING].sort())
  })
})
