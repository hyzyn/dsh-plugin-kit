/**
 * @hyzyn/dsh-kit — 类型助手与共享工具库的回归测试。
 *
 * 这些断言以当前实现为准（不是理想语义）：definePlugin 是恒等函数、
 * getService 的回退细节、托管区块的边界行为、!!js 的往返形状，都是
 * 消费者已经依赖的契约，改动必须显式。
 */
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import {
  definePlugin,
  dshHome,
  getService,
  isJsExpr,
  evalJsExpr,
  dtoValue,
  fromDtoValue,
  JsExprType,
  jsYamlSchema,
  spliceManagedBlock,
  readManagedBlock,
  writeFileAtomic,
} from '../src/index.js'
import type { Context, DshPlugin } from '../src/index.js'

describe('definePlugin', () => {
  it('恒等返回同一个对象（不改变运行时行为）', () => {
    const plugin = { name: 'demo', inject: ['tools'], apply: (): void => undefined }
    expect(definePlugin(plugin)).toBe(plugin)
  })

  it('保留 name / inject / apply 形状，未声明的 inject 保持 undefined', () => {
    const plugin: DshPlugin = definePlugin({
      name: 'my-plugin',
      apply: (): void => undefined,
    })
    expect(plugin.name).toBe('my-plugin')
    expect(plugin.inject).toBeUndefined()
    expect(typeof plugin.apply).toBe('function')
  })
})

describe('getService', () => {
  it('优先 ctx.get(name)', () => {
    const service = { ok: true }
    const ctx = { get: (name: string) => (name === 'tools' ? service : undefined) } as unknown as Context
    expect(getService(ctx, 'tools')).toBe(service)
  })

  it('ctx.get 返回 undefined 时回退属性访问', () => {
    const service = { viaAttr: true }
    const ctx = Object.assign(Object.create({ get: (): undefined => undefined }), { tools: service }) as unknown as Context
    expect(getService(ctx, 'tools')).toBe(service)
  })

  it('ctx.get 返回 falsy 真值时不再回退（undefined 才回退）', () => {
    const ctx = Object.assign({ get: () => false }, { tools: { wrong: true } }) as unknown as Context
    expect(getService(ctx, 'tools')).toBe(false)
  })

  it('没有 get 方法时直接属性访问；缺失返回 undefined', () => {
    const service = { plain: true }
    expect(getService({ tools: service } as unknown as Context, 'tools')).toBe(service)
    expect(getService({} as unknown as Context, 'missing')).toBeUndefined()
  })
})

describe('dshHome', () => {
  const original = process.env.DSH_HOME
  afterEach(() => {
    if (original === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = original
  })

  it('DSH_HOME 优先并 trim', () => {
    process.env.DSH_HOME = '  /tmp/custom-dsh-home  '
    // 实现返回的是 `resolve(expandHomePath(...))` 归一化后的路径，期望值必须走同一个
    // 归一化：Windows 上 `/tmp/custom-dsh-home` 会被解析成 `D:\tmp\custom-dsh-home`
    // （盘符来自当前工作目录），写死字面量会让这条用例只在 POSIX 上绿
    expect(dshHome()).toBe(resolve('/tmp/custom-dsh-home'))
  })

  it('DSH_HOME 缺失或纯空白时回退 ~/.dsh', () => {
    delete process.env.DSH_HOME
    expect(dshHome()).toBe(join(homedir(), '.dsh'))
    process.env.DSH_HOME = '   '
    expect(dshHome()).toBe(join(homedir(), '.dsh'))
  })

  it('归一化：DSH_HOME 里的 ~ 展开为家目录（codegraph DEFECTS CG13）', () => {
    // loader 侧读同一个变量时走 resolve(expandHomePath(...))；不展开的话插件写的
    // 与 loader watch 的就是两个不同文件，热加载永远不会触发。
    process.env.DSH_HOME = '~/x'
    expect(dshHome()).toBe(join(homedir(), 'x'))
    process.env.DSH_HOME = '~'
    expect(dshHome()).toBe(homedir())
  })

  it('归一化：相对路径 resolve 成绝对路径', () => {
    process.env.DSH_HOME = 'relative/dsh-home'
    expect(dshHome()).toBe(resolve('relative/dsh-home'))
  })
})

describe('managed-block', () => {
  const markers = { beginMarker: '# --- test managed ---', endMarker: '# --- end test managed ---' }

  it('无区块时追加到文件末尾（非空文件前留一个空行）', () => {
    expect(spliceManagedBlock('foo\n', { ...markers, body: 'k: v' })).toBe(
      'foo\n\n# --- test managed ---\nk: v\n# --- end test managed ---\n',
    )
  })

  it('空文件首次写入不留多余前导空行', () => {
    expect(spliceManagedBlock('', { ...markers, body: 'k: v' })).toBe(
      '# --- test managed ---\nk: v\n# --- end test managed ---\n',
    )
  })

  it('整体替换已有区块，区块外内容逐字节保留', () => {
    const text = 'before\n# --- test managed ---\nold: 1\n# --- end test managed ---\nafter\n'
    const next = spliceManagedBlock(text, { ...markers, body: 'new: 2' })
    expect(next).toBe('before\n# --- test managed ---\nnew: 2\n# --- end test managed ---\nafter\n')
    expect(next).toContain('before\n')
    expect(next).toContain('\nafter\n')
    expect(next).not.toContain('old: 1')
  })

  it('幂等：同一 body 重复写入不再变化', () => {
    const once = spliceManagedBlock('foo\n', { ...markers, body: 'k: v' })
    expect(spliceManagedBlock(once, { ...markers, body: 'k: v' })).toBe(once)
  })

  it('body 为空串时删除整个区块（含标记），不动区块外内容', () => {
    const text = 'before\n# --- test managed ---\nold: 1\n# --- end test managed ---\nafter\n'
    expect(spliceManagedBlock(text, { ...markers, body: '' })).toBe('before\nafter\n')
    expect(spliceManagedBlock('plain\n', { ...markers, body: '' })).toBe('plain\n')
  })

  it('缺结束标记（悬空起始标记）只重写标记行，其后内容原样保留', () => {
    const text = 'head\n# --- test managed ---\nstale: 1\n'
    const next = spliceManagedBlock(text, { ...markers, body: 'fresh: 1' })
    expect(next).toContain('head\n# --- test managed ---\nfresh: 1\n# --- end test managed ---\n')
    expect(next).toContain('stale: 1\n')
  })

  it('正文里的标记子串不算边界（整行匹配）', () => {
    const text = 'x # --- test managed --- y\n# --- test managed ---\nbody\n# --- end test managed ---\n'
    expect(readManagedBlock(text, markers)?.body).toBe('body')
  })

  it('readManagedBlock 返回标记间正文；缺标记或缺结束标记返回 undefined', () => {
    expect(readManagedBlock('# --- test managed ---\na: 1\nb: 2\n# --- end test managed ---\n', markers)).toEqual({
      body: 'a: 1\nb: 2',
    })
    expect(readManagedBlock('no block here\n', markers)).toBeUndefined()
    expect(readManagedBlock('# --- test managed ---\na: 1\n', markers)).toBeUndefined()
  })

  it('writeFileAtomic 原子写入指定内容与 0600 权限，目标存在时覆盖且无临时文件残留', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-kit-atomic-'))
    try {
      const file = join(dir, 'store.yml')
      writeFileSync(file, 'old')
      writeFileAtomic(file, 'new-content\n')
      expect(readFileSync(file, 'utf8')).toBe('new-content\n')
      // POSIX 权限位只在 POSIX 上存在：Windows 的 writeFileSync mode 是 no-op，
      // statSync().mode 恒为 0o666。断言放进平台分支，其余检查照常跑。
      if (process.platform !== 'win32') expect(statSync(file).mode & 0o777).toBe(0o600)
      writeFileAtomic(file, 'again', 0o640)
      expect(readFileSync(file, 'utf8')).toBe('again')
      if (process.platform !== 'win32') expect(statSync(file).mode & 0o777).toBe(0o640)
      // 临时文件已 rename 掉，目录里只剩目标文件
      expect(readdirSync(dir)).toEqual(['store.yml'])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('js-expr', () => {
  it('isJsExpr 只认带 __jsExpr 字符串的对象', () => {
    expect(isJsExpr({ __jsExpr: 'process.env.X' })).toBe(true)
    expect(isJsExpr({ __jsExpr: 1 })).toBe(false)
    expect(isJsExpr(null)).toBe(false)
    expect(isJsExpr('js:process.env.X')).toBe(false)
  })

  it('evalJsExpr 在宿主作用域内求值 !!js 表达式', () => {
    expect(evalJsExpr('1 + 1')).toBe(2)
    process.env.DSH_KIT_TEST_VALUE = 'kit-eval'
    try {
      expect(evalJsExpr('process.env.DSH_KIT_TEST_VALUE')).toBe('kit-eval')
    } finally {
      delete process.env.DSH_KIT_TEST_VALUE
    }
  })

  it('dtoValue / fromDtoValue 往返（js: 前缀 ↔ JsExpr，其余转字符串）', () => {
    expect(dtoValue({ __jsExpr: 'process.env.X' })).toBe('js:process.env.X')
    expect(dtoValue('plain')).toBe('plain')
    expect(dtoValue(42)).toBe('42')
    expect(fromDtoValue('js:process.env.X')).toEqual({ __jsExpr: 'process.env.X' })
    expect(fromDtoValue('plain')).toBe('plain')
    expect(fromDtoValue(42)).toBe('42')
  })

  it('JsExprType 与 jsYamlSchema 能无损 load/dump !!js 标量', async () => {
    const yaml = (await import('js-yaml')).default
    expect(JsExprType).toBeInstanceOf(yaml.Type)
    const loaded = yaml.load('A: !!js process.env.X\nB: plain\n', { schema: jsYamlSchema })
    expect(loaded).toEqual({ A: { __jsExpr: 'process.env.X' }, B: 'plain' })
    expect(yaml.dump(loaded, { schema: jsYamlSchema })).toContain('!!js process.env.X')
  })
})
