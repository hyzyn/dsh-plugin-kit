/**
 * client-lint 的**致命码**反例（2026-10-11 补 TS2451 时加的守卫）。
 *
 * 背景：loglens 的客户端半体一次真实的「同一作用域里重名声明」被这道 lint 归进了**噪音**
 * （只打印、不拦），而那个错误在浏览器里的表现是**整张卡片根本不加载**——bundle 解析失败，
 * 不是渲染错了某个分支。这条用例把那个教训钉住：喂一份带重名的 client-src，lint 必须**非零退出**
 * 且把 TS2451 报成致命；同时配一条干净文件的对照，证明这个 harness 不是「永远红」。
 *
 * 为什么是**起子进程**而不是 import：client-lint 是纯 CLI（用 process.cwd() 当扫描根、没有导出、
 * 也没有 --self-test），import 它会当场对**本仓**跑一遍检查。子进程 + 临时目录才是它的真实用法。
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
const lint = join(repoRoot, 'scripts', 'client-lint.mjs')

/** 在临时目录里造一个最小客户端半体并跑 lint。 */
function runLint(source: string): { status: number | null; output: string } {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-client-lint-'))
  try {
    mkdirSync(join(dir, 'client-src'), { recursive: true })
    writeFileSync(join(dir, 'client-src', 'index.js'), source)
    const result = spawnSync(process.execPath, [lint], { cwd: dir, encoding: 'utf8' })
    return { status: result.status, output: (result.stdout ?? '') + (result.stderr ?? '') }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/** 一个干净的客户端半体：只有噪音级诊断（DOM 类型与模块解析），应当通过。 */
const CLEAN = [
  'window.__ModuleLoader__.load({',
  '  id: "demo",',
  '  factory: (require) => {',
  '    const exports = {}',
  '    exports.apply = (ctx) => { ctx.effect(() => {}) }',
  '    return exports',
  '  },',
  '})',
  '',
].join('\n')

/** 同一作用域里重复声明同一个 const——浏览器里是 bundle 解析失败，卡片根本不加载。 */
const REDECLARED = [
  'window.__ModuleLoader__.load({',
  '  id: "demo",',
  '  factory: (require) => {',
  '    const exports = {}',
  '    const rows = [1]',
  '    const rows = [2]',
  '    exports.apply = () => { void rows }',
  '    return exports',
  '  },',
  '})',
  '',
].join('\n')

describe('client-lint 的致命码（TS2451：重名声明）', () => {
  it('干净文件通过（对照：harness 不是永远红）', () => {
    const result = runLint(CLEAN)
    expect(result.status, result.output).toBe(0)
  })

  it('重名声明必须非零退出，且被报成致命', () => {
    const result = runLint(REDECLARED)
    expect(result.status, result.output).not.toBe(0)
    expect(result.output).toContain('TS2451')
    expect(result.output).toContain('重复声明')
  })
})
