/**
 * @hyzyn/dsh-tty — 输出截断时的「自证 + 下一步」（tty_screen / sftp_tree）。
 *
 * 两处坑同源：截断这件事此前只编码在「有没有某句提示」里，调用方只能靠猜。
 *   - `tty_screen` 的 32KB 保尾截断原本连提示都没有——大尺寸屏幕装满文本时正文被
 *     砍掉头部，agent 却以为那就是整屏，于是照着残缺画面做判断；
 *   - `sftp_tree` 只报「已截断」，没说往哪缩，agent 下一轮往往原样重跑、拿到同一份。
 *
 * 本文件钉住三件事：
 *   1. `screenPayload` 的边界计算（>32KB 保尾、≤32KB 原样）；
 *   2. render 的提示**只在** truncated===true 时出现——≤32KB / 未截断的反例必须为假，
 *      「把提示写死」在这里就会红；
 *   3. `tty_screen` 的 output.schema 声明了 truncated（additionalProperties:false，
 *      漏声明在真机会被宿主校验挡掉——这是本项最容易漏的一步）。
 */
// DSH_HOME 隔离（D69）：读不到开发机上的真实授权文件
import './isolated-home.js'
import { describe, expect, it } from 'vitest'
import { apply, screenPayload } from '../src/index.js'

interface FakeToolDef {
  name: string
  output?: {
    schema?: { properties?: Record<string, { type?: string }>; required?: string[] }
    render?: (args: unknown, value: unknown) => Array<{ type: string; text?: string }>
  }
  execute?: (args: unknown) => Promise<Record<string, unknown>>
}

/** 一条过得了 SFTP 工具条件注册（`live.sshHosts.length > 0`）的连接簿条目。 */
const SSH_HOST = { name: 'demo', host: '127.0.0.1', username: 'demo', port: 22, auth: 'agent' }

/**
 * 最小假 cordis ctx（照 expect-backlog.test.ts 的写法）：只捕获注册的工具定义，
 * 不碰网络、不开真 PTY——本文件断言的 render / schema 都在定义本身上。
 */
function mount(config: Record<string, unknown> = {}): Map<string, FakeToolDef> {
  const registered: FakeToolDef[] = []
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
    if (names.includes('webServer')) child.webServer = { register: () => () => {}, registerUpgrade: () => () => {} }
    if (names.includes('settings')) child.settings = { describe: () => [], update: async () => {}, configure: () => () => {} }
    if (names.includes('systemPrompt')) child.systemPrompt = { section: () => () => {}, context: () => () => {} }
    if (names.includes('credentials')) child.credentials = { resolve: async () => ({ value: undefined }) }
    return child
  }
  const root = makeChild([])
  root.inject = (names: string[], cb: (ctx: unknown) => void) => {
    cb(makeChild(names))
    return () => {}
  }
  ;(apply as unknown as (ctx: unknown, config: unknown) => void)(root, config)
  return new Map(registered.map((tool) => [tool.name, tool]))
}

let mounted: Map<string, FakeToolDef> | undefined

/** 挂一次插件（带着连接簿条目，sftp_tree 才会注册）供本文件所有用例复用。 */
function tools(): Map<string, FakeToolDef> {
  mounted ??= mount({ sshHosts: [SSH_HOST] })
  return mounted
}

function toolOf(name: string): FakeToolDef {
  const definition = tools().get(name)
  if (definition === undefined) throw new Error(`未注册工具: ${name}`)
  return definition
}

/** 把工具声明的渲染投影拼成一段文本（用例只看模型读到的那一份）。 */
function renderText(name: string, value: Record<string, unknown>): string {
  const blocks = toolOf(name).output?.render?.({}, value) ?? []
  return blocks.map((block) => block.text ?? '').join('\n')
}

describe('tty_screen：32KB 保尾截断要自证，并指向 tty_capture', () => {
  it('超过 32KB：truncated=true、正文保尾 32KB，render 提示取完整滚动输出', () => {
    const full = 'A'.repeat(33 * 1024)
    const payload = screenPayload(full)
    expect(payload.truncated).toBe(true)
    expect(payload.text.length).toBe(32 * 1024)
    const text = renderText('tty_screen', { sid: 's1', cols: 500, rows: 200, text: payload.text, truncated: payload.truncated })
    expect(text).toContain('tty_capture')
    expect(text).toContain('32KB')
  })

  it('不超过 32KB：truncated=false，render 不出现该提示（提示写死就会红）', () => {
    const full = 'B'.repeat(32 * 1024)
    const payload = screenPayload(full)
    expect(payload.truncated).toBe(false)
    expect(payload.text).toBe(full)
    const text = renderText('tty_screen', { sid: 's1', cols: 80, rows: 24, text: payload.text, truncated: payload.truncated })
    expect(text).not.toContain('tty_capture')
    expect(text).not.toContain('仅显示屏幕底部')
    expect(text).toContain('B'.repeat(10))
  })

  it('schema 声明了 truncated（additionalProperties:false：漏声明会被宿主校验挡掉）', () => {
    const schema = toolOf('tty_screen').output?.schema ?? {}
    // `defineTool` 会把参数风格的 `required: true` 归一成对象级 required 数组，
    // 所以这里断言的是**归一之后**宿主真正拿来校验的那份 schema。
    expect(schema.properties?.truncated).toBeDefined()
    expect(schema.properties?.truncated?.type).toBe('boolean')
    expect(schema.required).toContain('truncated')
  })
})

/** sftp_tree render 的最小返回体（render 只读 entries / truncated / errors）。 */
function treeValue(truncated: boolean): Record<string, unknown> {
  return {
    path: '/srv/app',
    entries: [
      { path: '/srv/app/src', name: 'src', depth: 1, isDir: true, size: 0, mtime: 0 },
      { path: '/srv/app/index.js', name: 'index.js', depth: 1, isDir: false, size: 120, mtime: 0 },
    ],
    truncated,
    errors: [],
  }
}

describe('sftp_tree：截断时要说清往哪个方向缩', () => {
  it('truncated=true：head 指向缩小 maxDepth / 对子目录再 sftp_tree', () => {
    const text = renderText('sftp_tree', treeValue(true))
    expect(text).toContain('已截断')
    expect(text).toContain('maxDepth')
    expect(text).toContain('sftp_tree')
  })

  it('truncated=false：不出现缩小提示（提示写死就会红）', () => {
    const text = renderText('sftp_tree', treeValue(false))
    expect(text).not.toContain('已截断')
    expect(text).not.toContain('maxDepth')
  })
})
