/**
 * `scripts/tsc-diagnostics.mjs` 的单元测试 —— client-lint「名字解析」那一半的入口与解析。
 *
 * 为什么有这份测试：这道检查的价值全在**它说「干净」的时候**，而它的失败形态恰恰是
 * 「什么都没说」。2026-10-18 `main` 的 CI 就是这个形状——Windows 腿上 `.bin/tsc`
 * 根本起不来，`stdout` 是空的，于是「tsc 没跑」被读成「0 处诊断」，
 * `scripts/test/client-lint-fatal.test.ts` 里那份**必然报 TS2451** 的 fixture 拿到了
 * 「通过」。**闸门只在它唯一需要起作用的那条腿上失效**，而另外两条腿全绿。
 *
 * 所以下面四组断言各管一件事：
 *
 *   第 1 组 解析——正/反斜杠两种路径形态、锚点内外，钉住「诊断提得出来」；
 *   第 2 组 真跑——用本仓真实的 tsc 对一份必然报错的 fixture 跑一遍（这条在 Windows CI 上
 *          就是回归闸门：入口一旦退回 `.bin/tsc`，它会当场红）；
 *   第 3 组 失败口径——注入「起不来 / 被信号终止 / 没装 tsc / **非零退出却 0 条解析**」四种形态，
 *          断言**都不是**「0 处诊断」这种成功形状。这一组是本文件的重点：它不依赖任何平台；
 *   第 4 组 调用点——读 `client-lint.mjs` 的源码，钉住入口选择只存在于本模块一处
 *          （前 3 组碰不到它；缺了这一组，把调用点改回去只有 Windows 腿会红）。
 *
 * 第 3 组的第 4 种形态与第 4 组都是 **2026-10-18 独立复核**之后补的：那次复核用「半装的
 * typescript」端到端证明了「非零退出 + 锚点外输出」当时仍会打印「通过」，并指出调用点是
 * 上面三组覆盖不到的缺口。
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { describeTscFailure, parseTscDiagnostics, runTscCheck, tscEntryPath } from '../tsc-diagnostics.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

/** 同一作用域里重复声明同一个 const——tsc 报 TS2451（浏览器里是 bundle 解析失败）。 */
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

/** 在临时目录里造一个只含 client-src 的最小包，跑完删干净。 */
function withFixture(source: string, run: (dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-tsc-diag-'))
  try {
    mkdirSync(join(dir, 'client-src'), { recursive: true })
    writeFileSync(join(dir, 'client-src', 'index.js'), source)
    run(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe('parseTscDiagnostics · 路径形态与锚点', () => {
  it('正斜杠路径（POSIX 输出）解析到 file/line/col/code/text', () => {
    const output = [
      "client-src/index.js(5,11): error TS2451: Cannot redeclare block-scoped variable 'rows'.",
      "client-src/index.js(6,11): error TS2451: Cannot redeclare block-scoped variable 'rows'.",
      '',
    ].join('\n')
    const found = parseTscDiagnostics(output, 'client-src/index.js')
    expect(found).toHaveLength(2)
    expect(found[0]).toEqual({
      file: 'client-src/index.js',
      line: 5,
      col: 11,
      code: 'TS2451',
      text: "Cannot redeclare block-scoped variable 'rows'.",
    })
  })

  it('反斜杠路径（Windows 输出）同样解析，且 file 归一成正斜杠', () => {
    const output = "client-src\\index.js(5,11): error TS2451: Cannot redeclare block-scoped variable 'rows'.\n"
    const found = parseTscDiagnostics(output, 'client-src/index.js')
    expect(found).toHaveLength(1)
    // 归一化是为了打印出来的 file:line:col 在编辑器里点得开（两种形态一个写法）
    expect(found[0].file).toBe('client-src/index.js')
    expect(found[0].code).toBe('TS2451')
  })

  it('源码模式收兄弟模块的诊断（docker D74：program 里的 client-src/** 全算）', () => {
    const output = [
      'client-src/session-target.js(3,7): error TS2304: Cannot find name \'sessionId\'.',
      'client-src/nested/deep.js(9,1): error TS2552: Cannot find name \'tail\'. Did you mean \'tall\'?',
      '',
    ].join('\n')
    const found = parseTscDiagnostics(output, 'client-src/index.js')
    expect(found.map((item) => item.file)).toEqual(['client-src/session-target.js', 'client-src/nested/deep.js'])
    expect(found.map((item) => item.code)).toEqual(['TS2304', 'TS2552'])
  })

  it('裸 client.js 模式只认自己那个文件，不把别的包/别的文件卷进来', () => {
    const output = [
      "client.js(2,7): error TS2304: Cannot find name 'digest'.",
      "client-src/index.js(2,7): error TS2304: Cannot find name 'digest'.",
      '',
    ].join('\n')
    const found = parseTscDiagnostics(output, 'client.js')
    expect(found.map((item) => item.file)).toEqual(['client.js'])
  })

  it('顺手丢掉行内的坐标以外的形态（无诊断时恒为空）', () => {
    expect(parseTscDiagnostics('', 'client-src/index.js')).toEqual([])
    expect(parseTscDiagnostics('error TS2451: 没有文件前缀，不是诊断行\n', 'client-src/index.js')).toEqual([])
  })
})

describe('runTscCheck · 真跑（Windows CI 上的回归闸门）', () => {
  it('入口是 typescript 自己的 JS 入口，不是 node_modules/.bin 的包装脚本', () => {
    // `.bin/tsc` 在 Windows 上起不来（CreateProcess 只认 .exe/.com/.cmd/.bat）——
    // 2026-10-18 那次红的根因。这条断言把「换回去」钉死。
    const entry = tscEntryPath(repoRoot)
    expect(entry.replaceAll('\\', '/')).not.toContain('node_modules/.bin/')
    expect(entry.replaceAll('\\', '/')).toContain('typescript/lib/tsc.js')
    expect(spawnSync(process.execPath, [entry, '--version'], { encoding: 'utf8' }).status).toBe(0)
  })

  it('喂一份必然重名的 client-src → 真的报出 TS2451', () => {
    withFixture(REDECLARED, (dir) => {
      const result = runTscCheck({ repoRoot, cwd: dir, target: 'client-src/index.js' })
      expect(result.ok, JSON.stringify(result)).toBe(true)
      if (!result.ok) return
      expect(result.diagnostics.map((item) => item.code)).toContain('TS2451')
    })
  })

  it('喂一份干净的 client-src → 0 诊断，且确实是「跑成了」的 0', () => {
    const clean = [
      'window.__ModuleLoader__.load({',
      '  id: "demo",',
      '  factory: (require) => {',
      '    const exports = {}',
      '    const rows = [1]',
      '    exports.apply = () => { void rows }',
      '    return exports',
      '  },',
      '})',
      '',
    ].join('\n')
    withFixture(clean, (dir) => {
      const result = runTscCheck({ repoRoot, cwd: dir, target: 'client-src/index.js' })
      expect(result.ok, JSON.stringify(result)).toBe(true)
      if (!result.ok) return
      expect(result.diagnostics.filter((item) => item.code === 'TS2451')).toEqual([])
    })
  })
})

describe('runTscCheck · 失败口径（「没跑成」不许长得像「0 处诊断」）', () => {
  it('tsc 起不来（Windows 上的 .bin/tsc 就是这个形状）→ ok:false，不是空诊断', () => {
    const enoent = Object.assign(new Error('spawnSync /repo/node_modules/.bin/tsc ENOENT'), { code: 'ENOENT' })
    const result = runTscCheck({
      repoRoot,
      cwd: repoRoot,
      target: 'client-src/index.js',
      spawn: () => ({ error: enoent, status: null, stdout: '', stderr: '' }),
    })
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('spawn')
    expect(describeTscFailure(result)).toContain('ENOENT')
  })

  it('被信号终止（status 非数字）→ ok:false', () => {
    const result = runTscCheck({
      repoRoot,
      cwd: repoRoot,
      target: 'client-src/index.js',
      spawn: () => ({ error: undefined, status: null, stdout: '', stderr: '' }),
    })
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('status')
    expect(describeTscFailure(result)).toContain('被信号终止')
  })

  it('仓库里没装 typescript（假 repoRoot）→ ok:false', () => {
    // 这是 `runTscCheck` 自己的契约，**不是 CLI 里会发生的事**：真实 CLI 走到这里之前，
    // `client-host-url.mjs` 顶层那句 `import ts from 'typescript'` 就已经 ERR_MODULE_NOT_FOUND
    // 崩了（2026-10-18 独立复核实测）。留着它是因为「库函数不假设依赖存在」本身要被钉住，
    // 而不是因为它描述了一条用户看得见的路径。
    const result = runTscCheck({ repoRoot: join(tmpdir(), 'dsh-not-a-repo'), cwd: tmpdir(), target: 'client-src/index.js' })
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('missing')
    expect(describeTscFailure(result)).toContain('pnpm install')
  })

  it('真跑成功时会带上 output（诊断之外的东西也不丢）', () => {
    withFixture(REDECLARED, (dir) => {
      const result = runTscCheck({ repoRoot, cwd: dir, target: 'client-src/index.js' })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.output).toContain('TS2451')
    })
  })

  /*
   * 下面两条是 2026-10-18 **独立复核挖出来的通道**：非零退出 + 一条锚点内的诊断都没有，
   * 原来会走 `ok: true, diagnostics: []` ⇒ 闸门打印「通过」。它不是回归（旧实现同样绿），
   * 但它让「0 命中 ≠ 没跑」这句话在**整程序性错误**面前不成立——所以补了这一档。
   */
  it('整程序性错误（无 file(line,col) 前缀）→ ok:false「output」，不是空诊断', () => {
    // 半装的 typescript（lib/*.d.ts 全缺）刷的就是这一屏，真实退出码 2。
    const output = [
      "error TS2318: Cannot find global type 'Array'.",
      "error TS2318: Cannot find global type 'Boolean'.",
      '',
    ].join('\n')
    const result = runTscCheck({
      repoRoot,
      cwd: repoRoot,
      target: 'client-src/index.js',
      spawn: () => ({ error: undefined, status: 2, stdout: output, stderr: '' }),
    })
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('output')
    expect(describeTscFailure(result)).toContain('TS2318')
  })

  it('tsc 若改用 pretty 排版（`file:line:col - error TS…`）→ 解析不出来即失败，不许静默绿', () => {
    // `TSC_ARGS` 里显式关掉了 pretty，所以这不该发生；万一被打开（或有人改 -p tsconfig.json
    // 而那份里 pretty: true），这里是最后一道：**看不懂的输出 = 失败**，不是「干净」。
    const output = "client-src/index.js:5:11 - error TS2451: Cannot redeclare block-scoped variable 'rows'.\n"
    const result = runTscCheck({
      repoRoot,
      cwd: repoRoot,
      target: 'client-src/index.js',
      spawn: () => ({ error: undefined, status: 2, stdout: output, stderr: '' }),
    })
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('output')
    // 同一条输出在解析层面确实一无所获——这正是要判失败的理由
    expect(parseTscDiagnostics(output, 'client-src/index.js')).toEqual([])
  })

  it('退出码 0 时不当成失败（没错误本来就该是 0 诊断的成功）', () => {
    const result = runTscCheck({
      repoRoot,
      cwd: repoRoot,
      target: 'client-src/index.js',
      spawn: () => ({ error: undefined, status: 0, stdout: '', stderr: '' }),
    })
    expect(result.ok).toBe(true)
  })
})

/**
 * 调用点护栏：上面那 12 条只 import `tsc-diagnostics.mjs`，**碰不到 `client-lint.mjs`**。
 * 2026-10-18 的独立复核指出这个缺口——若有人把调用点改回自己 `spawnSync('.bin/tsc', …)`，
 * 本文件在 macOS / ubuntu 上会全绿，**只有 Windows 腿会红**（也就是又回到「只有那条腿知道」）。
 * 所以这里读源码把它钉住：入口选择只允许存在于一处。
 */
describe('client-lint 的调用点（源码级钉子）', () => {
  const lintSource = readFileSync(join(repoRoot, 'scripts', 'client-lint.mjs'), 'utf8')

  it('走的是 runTscCheck / describeTscFailure，而不是自己拼入口', () => {
    expect(lintSource).toContain("from './tsc-diagnostics.mjs'")
    expect(lintSource).toContain('runTscCheck({')
    expect(lintSource).toContain('describeTscFailure(')
  })

  it('这个文件里不再出现 spawnSync / node:child_process（起子进程只在一处）', () => {
    expect(lintSource).not.toContain('spawnSync')
    expect(lintSource).not.toContain('node:child_process')
  })

  it('检查没跑成时紧跟非零退出（不是打印一句就往下走）', () => {
    expect(lintSource).toMatch(/if \(!check\.ok\) \{[\s\S]{0,500}?process\.exit\(1\)/)
  })
})
