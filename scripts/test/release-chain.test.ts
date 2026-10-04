/**
 * **一次发布的证据链：同一个项目名，三份清单**（L0 守卫）。
 *
 * ## 它守的是什么
 *
 * 一次发布之后要回答三个问题：**容器起来了**（`devenv`）→ **数据对**（`devdata`）→
 * **页面对**（`devfront`）。三个面**各自有一份随项目仓库走的文本清单**，而它们靠**同一个项目名**
 * 对齐（口径与「为什么没有聚合器」见
 * [conventions.md § 一次发布的证据链](../docs/conventions.md#一次发布的证据链同一个项目名三份清单)）：
 *
 * | 面 | 清单 | 今天谁在读 |
 * |---|---|---|
 * | 容器 | `ready/<项目>.ready.yaml` | `devenv` 的 `env_status` / `env_wait`（agent 工具） |
 * | 数据 | `verify/<项目>.yaml` | `devdata` 的 `devdata_verify`（agent 工具，2026-10-04 接上） |
 * | 页面 | `web/<项目>.yaml` | `devfront` 的 `site_verify`（agent 工具） |
 *
 * 这条链**刻意没有聚合器**：「这次发布该验哪些项目」是发现逻辑，而「不做批量发现」是三包共同的
 * 边界（devfront `D8` 把「一次调用跨多个项目」明确留着）。于是**能漂的只剩下**「三份清单的路径 /
 * 项目名对不上」——本文件钉的就是这个：一个项目目录、三份清单、三个面各认自己那份，**互不读取、
 * 互不干扰**；`project` 与文件名不一致在三个面上**一律是配置错误**（防复制粘贴改漏——那会让断言
 * 跑到别的项目上去，而报告看起来是绿的）。
 *
 * ## 一个曾经的发现：三面原本**不对称**（2026-10-04 当天闭合）
 *
 * 本轮立这份守卫时实测：`devenv` / `devfront` 各有一个 agent 工具在读自己的清单，而 `devdata` 的
 * `verify/<项目>.yaml` **在 `packages/devdata/src/verify.ts` 之外没有任何消费者**——也就是说，这条链
 * **只能由人 / 脚本**把中间那一环接上，**agent 走不通**。当时它被钉成一条**反向 tripwire**
 * （「还没有消费者」），约定「有人把入口接上时它会红，那时翻成正向断言」。
 *
 * 同一天就红了，也照约定翻了：现在的判据是**必须存在**工具面消费者（`plugin.ts` 走 `loadManifest`
 * 按清单跑 `devdata_verify`），并且**保留反例**——把那个消费者从源码里删掉，同一条判据报空。
 * 「守卫不许恒绿」在这里的具体形态就是那第二条用例：它证明第一条不是在断言一件永远为真的事。
 *
 * ## 只读
 *
 * 本文件只读文件系统 + 三个包的纯加载器，不起宿主、不连任何目标、不写任何东西——所以它能进 CI。
 * 真机上三个面各自的证据在各自包里（`env_status` 的真机档、`devdata` 的 Redis 真机档 /
 * `verify-devdata-host-mount.mjs`、`devfront` 的真 Chrome 档）。
 */
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'

import { loadManifest, manifestRelativePath, type ManifestLoad } from '../../packages/devdata/src/index.js'
import { loadReadyProfile, readyManifestRelPath, type ProfileLoad } from '../../packages/devenv/src/index.js'
import {
  loadReleaseManifest,
  loadWebManifest,
  releaseManifestRelativePath,
  resolveProjectRoot,
  webManifestRelativePath,
  type ReleaseManifest,
  type WebManifestLoad,
} from '../../packages/devfront/src/index.js'

const PROJECT = 'cdqas'
const dirs: string[] = []

/** 造一个项目目录，按需写入三份清单里的任意几份（同一个项目名）。 */
function projectDir(options: { ready?: boolean; verify?: boolean; web?: boolean; projectInFile?: Partial<Record<'ready' | 'verify' | 'web', string>> }): string {
  const root = mkdtempSync(join(tmpdir(), 'dsh-release-chain-'))
  dirs.push(root)
  const own = (which: 'ready' | 'verify' | 'web'): string => options.projectInFile?.[which] ?? PROJECT

  if (options.ready === true) {
    mkdirSync(join(root, 'ready'), { recursive: true })
    writeFileSync(
      join(root, 'ready', `${PROJECT}.ready.yaml`),
      ['version: 1', `project: ${own('ready')}`, 'services:', '  - name: ems-service', '    ready: { kind: healthcheck }', ''].join('\n'),
    )
  }
  if (options.verify === true) {
    mkdirSync(join(root, 'verify'), { recursive: true })
    writeFileSync(
      join(root, 'verify', `${PROJECT}.yaml`),
      [
        'version: 1',
        `project: ${own('verify')}`,
        'assertions:',
        '  - id: redis-alive',
        `    project: ${own('verify')}`,
        '    appliesTo: backend',
        '    target: redis-248',
        // 语句判据是**共用那条 SQL 判据**（`classifyAssertionStatement` → `classifySql`），
        // 所以这一条用 SQL 写；Redis 语句的表达力是 devdata 自己的待办，不在本守卫里假装支持。
        '    statement: SELECT 1',
        '    expect: { eq: 1 }',
        '    severity: fail',
        '',
      ].join('\n'),
    )
  }
  if (options.web === true) {
    mkdirSync(join(root, 'web'), { recursive: true })
    writeFileSync(
      join(root, 'web', `${PROJECT}.yaml`),
      [
        'version: 1',
        `project: ${own('web')}`,
        'assertions:',
        '  - id: title',
        `    project: ${own('web')}`,
        '    url: http://127.0.0.1:9/',
        '    target: local-fixture',
        '    expect: { toContain: 订单列表 }',
        '    severity: fail',
        '',
      ].join('\n'),
    )
  }
  return root
}

/** 三个面的加载结果，一起判。 */
interface ChainLoads {
  devenv: ProfileLoad
  devdata: ManifestLoad
  devfront: WebManifestLoad
}

/** 读一个项目目录里的三份清单（走三个包**自己**的加载器，不另写一份读法）。 */
function loadChain(root: string, project = PROJECT): ChainLoads {
  return {
    devenv: loadReadyProfile(root, project),
    devdata: loadManifest(project, { roots: [root] }),
    devfront: loadWebManifest(project, { roots: [root] }),
  }
}

/**
 * 这条链的判据：**三个面都要读到、而且读到的都是同一个项目名**。
 *
 * 返回空数组 = 对齐；否则每条都是能直接照做的一句话。
 */
export function chainProblems(loads: ChainLoads, project = PROJECT): string[] {
  const problems: string[] = []
  const faces = [
    { name: '容器（devenv）', load: loads.devenv, kind: loads.devenv.kind, path: readyManifestRelPath(project), manifest: loads.devenv.kind === 'ok' ? loads.devenv.profile : undefined },
    { name: '数据（devdata）', load: loads.devdata, kind: loads.devdata.kind, path: manifestRelativePath(project), manifest: loads.devdata.kind === 'ok' ? loads.devdata.manifest : undefined },
    { name: '页面（devfront）', load: loads.devfront, kind: loads.devfront.kind, path: webManifestRelativePath(project), manifest: loads.devfront.kind === 'ok' ? loads.devfront.manifest : undefined },
  ]

  for (const face of faces) {
    if (face.kind !== 'ok') {
      problems.push(`${face.name}：没有读到可用清单（${face.path}，结果 ${face.kind}）——这一面这次没有证据`)
      continue
    }
    if (face.manifest?.project !== project) {
      problems.push(`${face.name}：清单里的 project（${String(face.manifest?.project)}）与这次的项目名（${project}）不一致`)
    }
  }
  return problems
}

/** 去注释（块注释 + 行注释）：判据只看代码，不看解释——解释里会写「将来要接 loadManifest(...)」。 */
export function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

/**
 * 「哪些文件**真的**在消费本包的清单加载器」——纯函数（喂 fixture 就能造反例）。
 *
 * 只看**代码**（注释里写「将来要接 `loadManifest(...)`」不算），并且跳过清单模块自己那两份
 * （`verify.ts` 是定义处，`verify-eval.ts` 是求值层——它们不是「消费者」）。
 */
export function manifestConsumersOf(files: ReadonlyArray<{ name: string; text: string }>): string[] {
  const consumers: string[] = []
  for (const file of files) {
    if (!file.name.endsWith('.ts') || file.name === 'verify.ts' || file.name === 'verify-eval.ts') continue
    if (/\b(loadManifest|projectsWithManifest)\s*\(/.test(stripComments(file.text))) consumers.push(file.name)
  }
  return consumers
}

/** `packages/devdata/src/` 下的全部 `.ts`（真源，不给反例用）。 */
function devdataSrcFiles(): Array<{ name: string; text: string }> {
  const srcDir = new URL('../../packages/devdata/src/', import.meta.url)
  return readdirSync(srcDir)
    .filter((name) => name.endsWith('.ts'))
    .map((name) => ({ name, text: readFileSync(new URL(name, srcDir), 'utf8') }))
}

/* ------------------------------------------------------------------ *
 * 发布清单：**由人给出的**「这次该验哪些项目」（L0 口径，2026-10-04）
 * ------------------------------------------------------------------ */

/**
 * 发布清单这一层的判据：**它列的项目必须真有那三份清单，而且项目名都对得上**。
 *
 * 这是「不做发现」的代价换来的好处：既然集合是人写死的，那么**唯一能漂的就是名字**——
 * 发布清单里写 `cdqas`、项目目录里那份清单的 `project` 却是 `ems`，或者那个项目压根没有清单。
 * 两种都会让「这次发布的数据面 / 页面这一面到底验没验」有两个答案，所以这里逐条报出来。
 */
export function releaseAlignmentProblems(
  release: ReleaseManifest,
  file: string,
  loadChainAt: (root: string, project: string) => ChainLoads,
): string[] {
  const problems: string[] = []
  for (const spec of release.projects) {
    // `root` 相对发布清单所在的目录（与跑批执行器同一处实现，不另解析一遍）
    const root = resolveProjectRoot(spec.root, file)
    for (const problem of chainProblems(loadChainAt(root, spec.project), spec.project)) {
      problems.push(`发布清单里的 ${spec.project}：${problem}`)
    }
  }
  return problems
}

/** 写一份发布清单到 `<dir>/release/<发布名>.yaml`，返回那个目录。 */
function releaseDir(release: string, projects: Array<{ project: string; root: string; target: string }>, overrides: Record<string, unknown> = {}): string {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-release-manifest-'))
  dirs.push(dir)
  mkdirSync(join(dir, 'release'), { recursive: true })
  writeFileSync(join(dir, 'release', `${release}.yaml`), JSON.stringify({ version: 1, release, projects, ...overrides }))
  return dir
}

afterAll(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('一次发布的证据链：同一个项目名，三份清单', () => {
  it('三份清单在同一个项目目录里 → 三个面各读到自己的那一份，且项目名一致', () => {
    const root = projectDir({ ready: true, verify: true, web: true })
    const loads = loadChain(root)
    // 诊断信息常驻：这三个加载结果里带着**逐字段**的配置错误，失败时不打出来就得再查一遍
    expect(chainProblems(loads), JSON.stringify(loads)).toEqual([])
    // 三个面拿到的都是**同一个项目名**——这正是「对齐」的定义
    expect(loads.devenv.kind === 'ok' && loads.devenv.profile.project).toBe(PROJECT)
    expect(loads.devdata.kind === 'ok' && loads.devdata.manifest.project).toBe(PROJECT)
    expect(loads.devfront.kind === 'ok' && loads.devfront.manifest.project).toBe(PROJECT)
  })

  it('只放一份 → 只有那一面读到，另两面各自「没有清单」（默认即无，不是错误）', () => {
    const root = projectDir({ web: true })
    const loads = loadChain(root)
    expect(loads.devfront.kind).toBe('ok')
    // 另两面**不是** config-error：项目里没写就是没断言，这是正常状态
    expect(loads.devenv.kind).toBe('no-profile')
    expect(loads.devdata.kind).toBe('no-manifest')
    // 而整体判据会说清「这一面这次没有证据」
    expect(chainProblems(loads).join('\n')).toContain('数据（devdata）')
  })

  it('三面的清单**互不读取**：目录名不对就不认（不会去猜别的面的清单）', () => {
    const root = projectDir({ ready: true, verify: true, web: true })
    // 把三份清单挪到彼此不认识的目录名上
    mkdirSync(join(root, 'ready2'), { recursive: true })
    writeFileSync(join(root, 'ready2', `${PROJECT}.ready.yaml`), readFileSync(join(root, 'ready', `${PROJECT}.ready.yaml`), 'utf8'))
    rmSync(join(root, 'ready'), { recursive: true, force: true })
    expect(loadChain(root).devenv.kind).toBe('no-profile')
    // 另两面不受影响
    expect(loadChain(root).devdata.kind).toBe('ok')
    expect(loadChain(root).devfront.kind).toBe('ok')
    // 而这个目录里还躺着一份「放错地方的」清单：列目录看得见，三个面都不认它
    expect(readdirSync(root).sort()).toEqual(['ready2', 'verify', 'web'])
  })

  it('三面各自都拦「文件名的项目名 ≠ 清单里的 project」（防复制粘贴改漏）', () => {
    for (const which of ['ready', 'verify', 'web'] as const) {
      const root = projectDir({ [which]: true, projectInFile: { [which]: 'ems' } })
      const loads = loadChain(root)
      const result = which === 'ready' ? loads.devenv : which === 'verify' ? loads.devdata : loads.devfront
      expect(result.kind, `${which} 这一面没有把项目名不一致当配置错误`).toBe('config-error')
      expect(JSON.stringify(result)).toContain('不一致')
      expect(chainProblems(loads).join('\n')).toContain('没有读到可用清单')
    }
  })

  it('三份清单的**路径口径**并列钉住（改一处就会红，conventions 那张表要同步）', () => {
    expect({
      devenv: readyManifestRelPath(PROJECT),
      devdata: manifestRelativePath(PROJECT),
      devfront: webManifestRelativePath(PROJECT),
    }).toEqual({
      devenv: `ready/${PROJECT}.ready.yaml`,
      devdata: `verify/${PROJECT}.yaml`,
      devfront: `web/${PROJECT}.yaml`,
    })
  })

  it('反例：判据本身会红（缺一面 / 项目名串了都要报出来）', () => {
    const ok = loadChain(projectDir({ ready: true, verify: true, web: true }))
    expect(chainProblems(ok), JSON.stringify(ok)).toEqual([])
    const missingWeb = loadChain(projectDir({ ready: true, verify: true }))
    expect(chainProblems(missingWeb).join('\n')).toContain('页面（devfront）')
    const mismatched = loadChain(projectDir({ ready: true, verify: true, web: true, projectInFile: { web: 'ems' } }))
    expect(chainProblems(mismatched).join('\n')).toContain('页面（devfront）')
  })

  /**
   * **正向守卫**：devdata 的清单**确实有**工具面消费者（2026-10-04 接上，见文件头）。
   *
   * 它原来是反向的（「还没有消费者」）——按约定在入口接上之后翻成正向。
   */
  it('devdata 的 `verify/<项目>.yaml` 有工具面消费者（`devdata_verify` 走 `loadManifest`）', () => {
    const consumers = manifestConsumersOf(devdataSrcFiles())
    expect(
      consumers,
      'devdata 的清单**没有**工具面消费者了——「数据对」那一环又只能由人 / 脚本接上（见 conventions.md § 一次发布的证据链）',
    ).toContain('plugin.ts')
  })

  /**
   * **反例**：把那个消费者从源码里删掉 → 同一条判据报空。
   *
   * 「替换真的生效」那一行是必须的：替换没命中（比如函数改名了）时反例会**恒绿**——
   * 而这正是本仓对「静态判据不许被无关状态满足」的要求。
   */
  it('反例：删掉那个消费者（并断言替换生效）→ 判据报空', () => {
    const files = devdataSrcFiles()
    const plugin = files.find((file) => file.name === 'plugin.ts')
    expect(plugin).toBeDefined()
    const broken = (plugin?.text ?? '').replace(/loadManifest\(/, 'notALoadManifestCall(')
    expect(broken).not.toBe(plugin?.text)
    const consumers = manifestConsumersOf(files.map((file) => (file.name === 'plugin.ts' ? { ...file, text: broken } : file)))
    expect(consumers).toEqual([])
  })
})

/* ================================================================== *
 * 发布清单：**由人给出的**「这次该验哪些项目」（2026-10-04）
 * ================================================================== */

describe('发布清单：由人给出的「这次该验哪些项目」', () => {
  const RELEASE = '2026-10-04-hg'
  /** 走三个包**自己**的加载器（与 `loadChain` 同一处）。 */
  const loadAt = (root: string, project: string): ChainLoads => loadChain(root, project)

  it('路径口径钉住：`release/<发布名>.yaml`（改一处就会红）', () => {
    expect(releaseManifestRelativePath(RELEASE)).toBe(`release/${RELEASE}.yaml`)
  })

  it('发布清单列的项目 → 三份清单都在、项目名都一致', () => {
    const project = projectDir({ ready: true, verify: true, web: true })
    const work = releaseDir(RELEASE, [{ project: PROJECT, root: project, target: 'local-fixture' }])
    const loaded = loadReleaseManifest(RELEASE, { roots: [work] })
    expect(loaded.kind, JSON.stringify(loaded)).toBe('ok')
    if (loaded.kind !== 'ok') return
    expect(releaseAlignmentProblems(loaded.manifest, loaded.file, loadAt), JSON.stringify(loaded.manifest)).toEqual([])
  })

  it('反例①：那份项目的某一份清单**项目名串了** → 报出来（防复制粘贴改漏）', () => {
    const project = projectDir({ ready: true, verify: true, web: true, projectInFile: { web: 'ems' } })
    const work = releaseDir(RELEASE, [{ project: PROJECT, root: project, target: 'local-fixture' }])
    const loaded = loadReleaseManifest(RELEASE, { roots: [work] })
    if (loaded.kind !== 'ok') throw new Error('夹具不成立')
    expect(releaseAlignmentProblems(loaded.manifest, loaded.file, loadAt).join('\n')).toContain('页面（devfront）')
  })

  it('反例②：发布清单列了一个**没有清单**的项目 → 报「这一面这次没有证据」', () => {
    const empty = mkdtempSync(join(tmpdir(), 'dsh-release-empty-'))
    dirs.push(empty)
    const work = releaseDir(RELEASE, [{ project: PROJECT, root: empty, target: 'local-fixture' }])
    const loaded = loadReleaseManifest(RELEASE, { roots: [work] })
    if (loaded.kind !== 'ok') throw new Error('夹具不成立')
    const problems = releaseAlignmentProblems(loaded.manifest, loaded.file, loadAt).join('\n')
    expect(problems).toContain(`发布清单里的 ${PROJECT}`)
    expect(problems).toContain('没有读到可用清单')
  })

  it('反例③：发布清单里的项目名与目录里的清单名对不上（列的是 ems，目录里只有 cdqas）', () => {
    const project = projectDir({ ready: true, verify: true, web: true })
    const work = releaseDir(RELEASE, [{ project: 'ems', root: project, target: 'local-fixture' }])
    const loaded = loadReleaseManifest(RELEASE, { roots: [work] })
    if (loaded.kind !== 'ok') throw new Error('夹具不成立')
    expect(releaseAlignmentProblems(loaded.manifest, loaded.file, loadAt).join('\n')).toContain('发布清单里的 ems')
  })
})
