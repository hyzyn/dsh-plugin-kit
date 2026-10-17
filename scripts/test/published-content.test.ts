/**
 * `scripts/lib/published-content.mjs` 的用例 —— 「已发布内容 == 本仓内容」预检。
 *
 * ## 为什么这道闸必须有用例
 *
 * 它防的是 2026-10-17 的真实事故（外部 issue #12）：`@hyzyn/dsh-kit` 的 `lib/` 改了、版本号
 * 仍停在 0.5.2，发布流按「registry 上已有 0.5.2」直接跳过，于是 4 个消费者带着新 import 发了
 * 出去，用户装到就 `does not provide an export named …`、整条 entry 不激活。当时十几道闸门
 * 全绿——所以这道新闸**必须自证会红**，否则它只是又一道「命中 0 个文件、恒绿」的形状。
 *
 * 用例全部喂 fixture（临时目录），不联网、不碰受版本控制的文件；`preflightTargets` 的
 * registry 读取与内容校验都是注入的，所以「已发布 / 未发布 / 漂移」三种出口都能离线钉住。
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { compareRuntimeTrees, describeDrift, preflightTargets } from '../lib/published-content.mjs'

/** 在临时根下写一个文件（自动建父目录）。 */
function writeFile(root, rel, content) {
  const target = join(root, rel)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, content)
}

/** 造一棵「本仓包目录」与一棵「registry 解包后的 package/ 目录」。 */
function fixture(localFiles, publishedFiles) {
  const root = mkdtempSync(join(tmpdir(), 'dsh-published-content-test-'))
  const local = join(root, 'local')
  const published = join(root, 'published')
  mkdirSync(local, { recursive: true })
  mkdirSync(join(published, 'package'), { recursive: true })
  for (const [rel, content] of Object.entries(localFiles)) writeFile(local, rel, content)
  for (const [rel, content] of Object.entries(publishedFiles)) writeFile(published, join('package', rel), content)
  return { root, local, published }
}

/** 一个最小但「两边一致」的包：4 个运行时文件 + 1 个不参与比对的 README。 */
const SAME: Record<string, string> = {
  'lib/index.js': 'export const a = 1\n',
  'lib/index.d.ts': 'export declare const a: number\n',
  'client.js': 'console.log("client")\n',
  'cordis.patch.yml': '- insert:\n    - id: demo\n',
  'README.md': '# demo\n',
}

/** 以 fixture 跑一次比对并在结束后清理（避免每个用例都写一遍 try/finally）。 */
function compare(localFiles: Record<string, string>, publishedFiles: Record<string, string>) {
  const { root, local, published } = fixture(localFiles, publishedFiles)
  try {
    return compareRuntimeTrees(local, published)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

describe('compareRuntimeTrees · 一致与漂移', () => {
  it('两棵树一致 → 无差异，且真的比到了文件（防「读空 = 恒绿」）', () => {
    const { compared, differences } = compare(SAME, SAME)
    expect(differences).toEqual([])
    // 运行时文件：lib/index.js、lib/index.d.ts、client.js、cordis.patch.yml（README 不算）
    expect(compared).toBe(4)
  })

  it('lib 里一个字节不同 → content，并点名文件（这就是 0.5.2 那次事故的最小形状）', () => {
    const changed = { ...SAME, 'lib/index.js': 'export const a = 2\n' }
    expect(compare(SAME, changed).differences).toEqual([{ path: 'lib/index.js', kind: 'content' }])
  })

  it('本仓新增了 lib 文件而 registry 上没有 → missing-published', () => {
    const local = { ...SAME, 'lib/extra.js': 'export const b = 1\n' }
    expect(compare(local, SAME).differences).toEqual([{ path: 'lib/extra.js', kind: 'missing-published' }])
  })

  it('registry 上有而本仓删掉了 → missing-local', () => {
    const local: Record<string, string> = { ...SAME }
    delete local['lib/index.d.ts']
    expect(compare(local, SAME).differences).toEqual([{ path: 'lib/index.d.ts', kind: 'missing-local' }])
  })

  it('只比运行时内容：README / scripts / .map 变了不算漂移', () => {
    const local = {
      ...SAME,
      'README.md': '# 改过了\n',
      'scripts/smoke.mjs': 'console.log("smoke")\n',
      'lib/index.js.map': '{"version":3}\n',
    }
    const published = {
      ...SAME,
      'scripts/smoke.mjs': 'console.log("old")\n',
      'lib/index.js.map': '{"version":3,"different":true}\n',
    }
    expect(compare(local, published).differences).toEqual([])
  })

  it('cordis.patch.yml 变了算漂移（它决定插件装进 profile 的行为）', () => {
    const changed = { ...SAME, 'cordis.patch.yml': '- insert:\n    - id: demo\n      config: {}\n' }
    expect(compare(SAME, changed).differences).toEqual([{ path: 'cordis.patch.yml', kind: 'content' }])
  })

  it('两棵树都没有运行时文件 → compared 为 0（调用方必须按失败处理，不许恒绿）', () => {
    const onlyReadme = { 'README.md': '# a\n' }
    expect(compare(onlyReadme, onlyReadme)).toEqual({ compared: 0, differences: [] })
  })
})

describe('preflightTargets · 三种出口', () => {
  const targets = [
    ['packages/kit', '@hyzyn/dsh-kit'],
    ['packages/tty', '@hyzyn/dsh-tty'],
  ]
  const versions = { 'packages/kit': '0.5.2', 'packages/tty': '0.32.2' }

  it('已发布且内容一致 → skipped；未发布 → toPublish', () => {
    const result = preflightTargets({
      targets,
      pkgVersion: (dir) => versions[dir],
      // kit 已发布；tty 读不到 = 还没发过
      fetchManifest: (name) => {
        if (name === '@hyzyn/dsh-kit') return { dist: { tarball: 'https://example.invalid/kit.tgz' } }
        throw new Error('404')
      },
      verify: () => ({ ok: true, compared: 4, differences: [] }),
    })
    expect(result.skipped).toEqual([{ dir: 'packages/kit', name: '@hyzyn/dsh-kit', version: '0.5.2' }])
    expect(result.toPublish).toEqual([{ dir: 'packages/tty', name: '@hyzyn/dsh-tty', version: '0.32.2' }])
    expect(result.drift).toEqual([])
  })

  it('已发布但内容漂移 → 进 drift、绝不进 toPublish（2026-10-17 的现场）', () => {
    const result = preflightTargets({
      targets,
      pkgVersion: (dir) => versions[dir],
      fetchManifest: () => ({ dist: { tarball: 'https://example.invalid/pkg.tgz' } }),
      verify: ({ name }) =>
        name === '@hyzyn/dsh-kit'
          ? { ok: false, compared: 3, differences: [{ path: 'lib/managed-block.js', kind: 'content' }] }
          : { ok: true, compared: 2, differences: [] },
    })
    expect(result.toPublish).toEqual([])
    expect(result.skipped).toEqual([{ dir: 'packages/tty', name: '@hyzyn/dsh-tty', version: '0.32.2' }])
    expect(result.drift).toHaveLength(1)
    expect(result.drift[0].name).toBe('@hyzyn/dsh-kit')
    expect(result.drift[0].differences).toEqual([{ path: 'lib/managed-block.js', kind: 'content' }])
  })

  it('manifest 读不到（404 / 网络抖动）→ 当作未发布，交给 publish 自己报 cannot-publish-over', () => {
    const result = preflightTargets({
      targets,
      pkgVersion: (dir) => versions[dir],
      fetchManifest: () => {
        throw new Error('registry 暂时不可读')
      },
      verify: () => {
        throw new Error('不该被调用')
      },
    })
    expect(result.toPublish).toHaveLength(2)
    expect(result.drift).toEqual([])
  })
})

describe('describeDrift · 报错必须可操作', () => {
  it('点名包、版本、文件，并在 compared=0 时明确说「一个文件都没比到」', () => {
    const text = describeDrift([
      {
        dir: 'packages/kit',
        name: '@hyzyn/dsh-kit',
        version: '0.5.2',
        compared: 3,
        differences: [{ path: 'lib/managed-block.js', kind: 'content' }],
      },
      { dir: 'packages/tty', name: '@hyzyn/dsh-tty', version: '0.32.2', compared: 0, differences: [] },
    ]).join('\n')
    expect(text).toContain('@hyzyn/dsh-kit@0.5.2')
    expect(text).toContain('内容不同：lib/managed-block.js')
    expect(text).toContain('@hyzyn/dsh-tty@0.32.2')
    expect(text).toContain('一个运行时文件都没比到')
  })
})

describe('接线 · 守卫必须真的被两条发布路径调用', () => {
  // 一条不被调用的守卫等于没有：发布流有 CI 与手动两条，两条都必须先预检再 publish。
  const read = (rel: string) => readFileSync(rel, 'utf8')

  it('CI 发布流在 publish 之前做预检，且提供 --preflight 只预检模式', () => {
    const source = read('scripts/release-publish-tag.mjs')
    expect(source).toContain('preflightTargets(')
    expect(source).toContain('verifyPublishedContent')
    expect(source).toContain("process.argv.includes('--preflight')")
  })

  it('手动发布流同样先预检再 publish', () => {
    const source = read('scripts/release-publish-all.mjs')
    expect(source).toContain('preflightTargets(')
    expect(source).toContain('verifyPublishedContent')
  })
})
