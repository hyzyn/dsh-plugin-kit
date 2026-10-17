/**
 * `.githooks/pre-commit` 的用例 —— 产物只加「**源码也在这一笔提交里**」的那些包。
 *
 * ## 为什么有这份用例
 *
 * 这个钩子管的是「提交里的产物必须与提交里的源码同步」，而它自己出过两次静默故障，
 * 两次都**没有任何东西会红**：
 *
 * 1. 早期版本用 `git add packages/<pkg>/lib` 暂存产物——pathspec 的 `*` 不递归，`git add` 直接
 *    `fatal: pathspec … did not match any files`，而脚本把 fatal 漏到 stderr、照打成功提示，
 *    于是它**从未真正暂存过任何产物**（教训写在钩子头部）；
 * 2. 2026-10-17：无条件 `git add` 全部产物。在**脏树上做部分提交**时（只暂存一部分文件，
 *    别的包的源码还没提交），产物是按**未暂存**的源码构建的，被一并加进来 → 这一笔提交里
 *    出现「产物变了、对应源码没变」的错配。实测那次的形状：一份只暂存 9 个文件的提交，
 *    钩子把 5 个包按未提交源码重建的 `lib/` 加了进来。
 *
 * 判据是**行为式**的：真起一个临时 git 仓库、把真钩子挂上、真跑 `git commit`，看它到底
 * 往这一笔里装了什么。所以夹具里把钩子依赖的两样东西换成替身：
 *
 * - `pnpm`（钩子只调 `pnpm -r build`）→ 临时 `bin/pnpm`，退出码可控（用 `BUILD_FAILS=1` 造构建失败）；
 * - 两个闸门脚本（i18n / 公网 IP）→ 占位文件，本用例不验它们（各有自己的用例）。
 *
 * **Windows 上跳过**：钩子是 `#!/bin/sh`，Windows 由 Git 自带的 MSYS sh 执行，而本文要往
 * `PATH` 上放一个**无扩展名**的 `pnpm` 替身——能不能被 exec 取决于具体环境。判据本身与平台
 * 无关（是 git 的行为），不值得为它引入平台 flake。
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

/** 真实钩子（本用例跑的就是它，不是它的副本或改写）。 */
const HOOK = fileURLToPath(new URL('../../.githooks/pre-commit', import.meta.url))

/** 每个用例自建的临时仓库；`afterEach` 一律删干净（不碰真实仓库）。 */
const created: string[] = []
afterEach(() => {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/**
 * 跑一条 git 命令，返回 `{ ok, out }`（非零不抛，交给用例断言）。
 *
 * 用 `spawnSync` 而不是 `execFileSync`：钩子的输出走 **stderr**，而 `execFileSync` 只在失败时
 * 才把 stderr 交出来——「提交成功」那几条用例要断言的正是成功路径上的那句报告。
 */
function git(dir: string, args: string[], env = {}) {
  const result = spawnSync('git', args, {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  })
  return { ok: result.status === 0, out: `${result.stdout ?? ''}${result.stderr ?? ''}` }
}

/**
 * 造一个临时仓库：真钩子挂在 `.githooks/`，`pnpm` 与两个闸门脚本都用替身。
 *
 * 种子提交在 `core.hooksPath` **设置之前**做——否则钩子会在这个夹具自己的提交上跑一遍。
 */
function makeRepo({ buildFails = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-hook-'))
  created.push(dir)

  mkdirSync(join(dir, '.githooks'), { recursive: true })
  mkdirSync(join(dir, 'bin'), { recursive: true })
  mkdirSync(join(dir, 'scripts'), { recursive: true })
  mkdirSync(join(dir, 'packages/demo/src'), { recursive: true })
  mkdirSync(join(dir, 'packages/demo/lib'), { recursive: true })

  writeFileSync(join(dir, '.githooks/pre-commit'), readFileSync(HOOK, 'utf8'))
  chmodSync(join(dir, '.githooks/pre-commit'), 0o755)
  writeFileSync(join(dir, 'bin/pnpm'), `#!/bin/sh\n${buildFails ? 'exit 1\n' : 'exit 0\n'}`)
  chmodSync(join(dir, 'bin/pnpm'), 0o755)
  writeFileSync(join(dir, 'scripts/check-i18n.mjs'), 'process.exit(0)\n')
  writeFileSync(join(dir, 'scripts/check-no-public-ip.mjs'), 'process.exit(0)\n')
  writeFileSync(join(dir, 'packages/demo/src/index.ts'), 'v1\n')
  writeFileSync(join(dir, 'packages/demo/lib/index.js'), 'v1\n')

  git(dir, ['init', '-q', '.'])
  git(dir, ['config', 'user.email', 'test@example.com'])
  git(dir, ['config', 'user.name', 'test'])
  git(dir, ['add', '-A'])
  git(dir, ['commit', '-qm', 'seed'])

  git(dir, ['config', 'core.hooksPath', '.githooks'])
  return dir
}

/** 钩子会走 `PATH` 找 `pnpm`：把夹具的替身目录放最前。 */
function hookEnv(dir: string) {
  return { PATH: `${join(dir, 'bin')}${delimiter}${process.env.PATH ?? ''}` }
}

/** 这一笔提交实际装了哪些文件。 */
function committedFiles(dir: string) {
  return execFileSync('git', ['show', '--name-only', '--format=', 'HEAD'], { cwd: dir, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
}

/** 写文件（值带换行，方便逐次改内容）。 */
function put(dir: string, path: string, text: string) {
  writeFileSync(join(dir, path), `${text}\n`)
}

describe.skipIf(process.platform === 'win32')('pre-commit：产物只跟着「这一笔的源码」走', () => {
  it('脏树上做部分提交（暂存一个文档，别的包 src 与 lib 都脏）→ 产物**不许**被卷进来', () => {
    const dir = makeRepo()
    // 模拟「另一个会话改了 demo 的 src、重建了 lib，但那笔还没提交」
    put(dir, 'packages/demo/src/index.ts', 'v2')
    put(dir, 'packages/demo/lib/index.js', 'v2-built')
    put(dir, 'docs-note.md', 'b')
    git(dir, ['add', 'docs-note.md'])

    const result = git(dir, ['commit', '-qm', 'partial'], hookEnv(dir))
    expect(result.ok, `提交应当成功（产物与它无关）：${result.out}`).toBe(true)
    expect(committedFiles(dir), '这一笔只该含被暂存的那一份，产物必须留在工作区').toEqual(['docs-note.md'])
    // 反过来也要成立：产物没被顺手丢掉（它还在工作区、且未暂存）
    const status = execFileSync('git', ['status', '--porcelain', '--', 'packages/demo/lib'], { cwd: dir, encoding: 'utf8' })
    expect(status.trim(), 'demo 的产物应原样留在工作区未暂存').toBe('M packages/demo/lib/index.js')
  })

  it('正常提交（src 已暂存、产物未暂存）→ 钩子把重建的产物一起装进来', () => {
    const dir = makeRepo()
    put(dir, 'packages/demo/src/index.ts', 'v2')
    put(dir, 'packages/demo/lib/index.js', 'v2-built')
    git(dir, ['add', 'packages/demo/src/index.ts'])

    const result = git(dir, ['commit', '-qm', 'normal'], hookEnv(dir))
    expect(result.ok, `提交应当成功：${result.out}`).toBe(true)
    expect(result.out, '应当报告它加了几个产物文件').toContain('构建产物已刷新并入本次提交')
    expect(committedFiles(dir).sort()).toEqual(['packages/demo/lib/index.js', 'packages/demo/src/index.ts'])
  })

  it('不一致（src 已暂存，但同一文件还有未暂存改动）→ **中止**，且 HEAD 不推进', () => {
    const dir = makeRepo()
    put(dir, 'packages/demo/src/index.ts', 'v2')
    git(dir, ['add', 'packages/demo/src/index.ts'])
    // 暂存之后又改了同一个文件：这一笔里的源码 ≠ 工作区的源码 ⇒ 产物无法与提交里的源码同步
    put(dir, 'packages/demo/src/index.ts', 'v2-more')
    const before = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' }).trim()

    const result = git(dir, ['commit', '-qm', 'inconsistent'], hookEnv(dir))
    expect(result.ok, '必须中止（加了产物就是错配，不加又不同步）').toBe(false)
    expect(result.out).toContain('无法与这一笔提交的源码同步')
    // 报错必须给出出路：看到红的人要知道下一步做什么
    expect(result.out).toContain('git add packages/demo')
    expect(result.out).toContain('git stash push')
    expect(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' }).trim(), 'HEAD 不许推进').toBe(before)
  })

  it('构建失败 → 中止（不许提交一份没重建过的产物）', () => {
    const dir = makeRepo({ buildFails: true })
    put(dir, 'packages/demo/src/index.ts', 'v2')
    git(dir, ['add', 'packages/demo/src/index.ts'])
    const before = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' }).trim()

    const result = git(dir, ['commit', '-qm', 'build fails'], hookEnv(dir))
    expect(result.ok).toBe(false)
    expect(result.out).toContain('构建失败，提交中止')
    expect(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' }).trim()).toBe(before)
  })
})
