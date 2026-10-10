/**
 * @hyzyn/dsh-tty — 会话生命周期留痕（0.30.0）。
 *
 * 起因：2026-10-10 那次「面板标签自己消失」的排查里，宿主侧**一条生命周期日志都没有**——
 * 「插件被重挂」与「孤儿被保活期回收」这两种解释只能靠时间吻合去猜（那份报告的根因就猜错了，
 * 见 ROADMAP 的 0.30.0 那节）。本文件钉住那几条留痕，重点是两条**容易在重构里悄悄失效**的性质：
 *
 *   1. **挂载序号是进程级的**：模块态计数器会在 HMR 重挂时从 1 重来，那个号就再也答不了
 *      「同一个 pid 里这是第几次挂载」——而那正是它唯一要回答的问题；
 *   2. **卸载清点打在 `disposeAll()` 之前**：要清点的是「还剩几条会话」，不是「清完了」。
 *
 * 假件照 `exited-retain.test.ts`（最小假 ctx + 可编程假 PTY），只改两处：`logger.info` 的内容
 * 收进数组（留痕本来就靠它），`effect` 把 disposer **留着**（测试要手动触发一次卸载）。
 */
// DSH_HOME 隔离（D69）：读不到开发机上的真实授权文件
import './isolated-home.js'
import { tmpdir } from 'node:os'
import { PassThrough } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import { apply, reapedOrphansMessage } from '../src/index.js'

interface FakePty {
  kind: 'local'
  pid: number
  output: PassThrough
  done: Promise<{ exitCode: number | null; signal: string | null }>
  write: (data: string) => Promise<void>
  resize: () => void
  terminal: { resize: () => void; kill: () => void }
  terminate: () => Promise<boolean>
  forceKill: () => void
  settle: (outcome: { exitCode: number | null; signal: string | null }) => void
}

interface FakeTool {
  name: string
  execute?: (args: unknown) => Promise<unknown>
}

interface Mounted {
  /** 宿主 `ctx.logger.info` 收到的一切（留痕的断言面）。 */
  infos: string[]
  /** 这一次挂载注册的 disposer（照 cordis 的 `ctx.effect` 语义：`effect(cb)` 收 cb 的返回值）。 */
  disposers: Array<() => void>
  tools: Map<string, FakeTool>
  ptys: FakePty[]
  /** 触发一次「插件卸载」（真宿主在重挂/停用时做的就是这件事）。 */
  dispose: () => void
}

/** 最小假 cordis ctx（照 `exited-retain.test.ts` 的写法）。`applyFn` 供「重挂模拟」换一份模块用。 */
function mountPlugin(applyFn: (ctx: unknown, config: unknown) => void = apply as unknown as (ctx: unknown, config: unknown) => void): Mounted {
  const infos: string[] = []
  const disposers: Array<() => void> = []
  const registered: FakeTool[] = []
  const ptys: FakePty[] = []
  const makeChild = (names: string[]): Record<string, unknown> => {
    const child: Record<string, unknown> = {
      logger: {
        info: (message: string) => { infos.push(message) },
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
      effect: (callback: () => unknown) => {
        const result = callback()
        if (typeof result === 'function') disposers.push(result as () => void)
        return () => {}
      },
      inject: (childNames: string[], cb: (ctx: unknown) => void) => {
        cb(makeChild(childNames))
        return () => {}
      },
      on: () => () => {},
      events: { on: () => () => {} },
      get: (name: string) => {
        if (name === 'tools') {
          return {
            register: (definition: FakeTool) => {
              registered.push(definition)
              return () => {}
            },
          }
        }
        if (name === 'subprocess') {
          return {
            spawnTerminal: async () => {
              let settleDone!: (outcome: { exitCode: number | null; signal: string | null }) => void
              const done = new Promise<{ exitCode: number | null; signal: string | null }>((resolve) => {
                settleDone = resolve
              })
              const pty: FakePty = {
                kind: 'local',
                pid: 4242,
                output: new PassThrough(),
                done,
                write: async () => {},
                resize: () => {},
                terminal: { resize: () => {}, kill: () => {} },
                terminate: async () => true,
                forceKill: () => {},
                settle: (outcome) => settleDone(outcome),
              }
              ptys.push(pty)
              return pty
            },
          }
        }
        return undefined
      },
    }
    if (names.includes('webServer')) child.webServer = { register: () => () => {}, registerUpgrade: () => () => {} }
    if (names.includes('settings')) child.settings = { describe: () => [], update: async () => {}, configure: () => () => {} }
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
  ;(applyFn as unknown as (ctx: unknown, config: unknown) => void)(root, {})
  return {
    infos,
    disposers,
    tools: new Map(registered.map((tool) => [tool.name, tool])),
    ptys,
    dispose: () => {
      // 倒序（cordis 释放 effect 的顺序），一次全跑：正是真宿主卸载时发生的事
      for (const disposer of [...disposers].reverse()) disposer()
    },
  }
}

/** 从挂载留痕里取这次挂载的序号（进程级，见 `nextMountSerial`）。 */
function mountSerialOf(infos: string[]): number {
  const line = infos.find((message) => message.includes('[dsh-tty] 插件挂载（本进程第'))
  expect(line, '挂载没留下那一行（0.30.0 可观测性）').toBeDefined()
  const matched = /第 (\d+) 次/.exec(line ?? '')
  expect(matched, '挂载行里没有「第 N 次」：' + String(line)).not.toBeNull()
  return Number(matched?.[1])
}

async function wait(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

describe('会话生命周期留痕（0.30.0）', () => {
  it('挂载序号是**进程级**的：同一进程里第二次挂载是第 N+1 次（模块态会从 1 重来）', () => {
    const first = mountPlugin()
    const second = mountPlugin()
    const firstSerial = mountSerialOf(first.infos)
    const secondSerial = mountSerialOf(second.infos)
    expect(secondSerial, '序号在同一个进程里退回了——模块态计数器答不了「第几次挂载」').toBe(firstSerial + 1)
    // 那一行还要能自己说清「是哪个进程、用哪个 tmux socket」：`dsh --profile X` 起的宿主
    // 里 DSH_PROFILE 可能是空的，于是它和别的宿主共用裸 dsh-tty（实测），只有打出来才看得见
    const line = second.infos.find((message) => message.includes('插件挂载（本进程第')) ?? ''
    expect(line).toContain(`pid=${String(process.pid)}`)
    expect(line).toContain('tmux socket=')
  })

  it('序号跨「模块重新求值」继续累加：HMR 重挂就是那样（模块态清零、进程没换）', async () => {
    const before = mountSerialOf(mountPlugin().infos)
    /*
     * 真模拟一次 HMR 重挂：`vi.resetModules()` + 重新 import 会**重新求值**这个模块
     * （模块态归零、globalThis 不动），然后拿新模块的 `apply` 再挂一次。序号若存在
     * 模块态里，这里就会退回 1 —— 而那正是排查「标签自己消失」时最需要区分的一件事。
     */
    vi.resetModules()
    const reimported = await import('../src/index.js') as { apply: (ctx: unknown, config: unknown) => void }
    expect(reimported.apply, '重新 import 拿不到 apply：这个用例的模拟失效了').toBeTypeOf('function')
    const after = mountSerialOf(mountPlugin(reimported.apply).infos)
    expect(after, '重挂后序号退回了：模块态计数器在重挂时清零').toBe(before + 1)
  })

  it('卸载清点打在 disposeAll 之前：报的是「还剩几条会话」', async () => {
    const mounted = mountPlugin()
    const opened = await mounted.tools.get('tty_open')?.execute({ cwd: tmpdir(), command: 'sleep 1' }) as { sid: string }
    expect(opened.sid, '夹具失效：会话没开起来').toBeTruthy()
    mounted.dispose()
    const serial = mountSerialOf(mounted.infos)
    const line = mounted.infos.find((message) => message.includes('[dsh-tty] 插件卸载')) ?? ''
    expect(line, '卸载没留痕：面板标签「自己消失」时就没有第一手证据了').toContain(`第 ${String(serial)} 次挂载的实例`)
    expect(line).toContain('清点 1 个在线会话')
  })

  it('会话创建与结束各留一行：带 sid / owner / 退出码', async () => {
    const mounted = mountPlugin()
    const opened = await mounted.tools.get('tty_open')?.execute({ cwd: tmpdir(), command: 'echo hi' }) as { sid: string }
    const created = mounted.infos.find((message) => message.includes('[dsh-tty] 会话创建：'))
    expect(created, '会话创建没留痕').toBeDefined()
    expect(created).toContain(`sid=${opened.sid}`)
    expect(created).toContain('owner=agent')
    mounted.ptys[0].settle({ exitCode: 0, signal: null })
    await wait(60)
    const ended = mounted.infos.find((message) => message.includes('[dsh-tty] 会话结束：'))
    expect(ended, '会话结束没留痕：事后分不清「被杀」与「自己退出」').toBeDefined()
    expect(ended).toContain(`sid=${opened.sid}`)
    expect(ended).toContain('code=0')
  })

  it('孤儿回收的文案：报数、sid 与保活秒数同源（数据源是 reapOrphans 的返回值）', () => {
    const message = reapedOrphansMessage(['s1', 's2'], 120)
    expect(message).toContain('回收 2 个孤儿会话 s1, s2')
    expect(message).toContain('（120s）')
  })
})
