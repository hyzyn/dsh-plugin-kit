/**
 * CI ↔ 包内条目一致性守卫的用例 —— `scripts/ci-script-truth.mjs`（L0 待办第 6 项的方案 B）。
 *
 * 守两件事：
 *
 * 1. **真实仓库必须绿**（方案 A 之后，两条 workflow 里的包内脚本入口全部以
 *    `pnpm --filter <包名> run <条目>` 形态出现、且每个都能解析到真实条目）；
 * 2. **守卫必须会红**——五条判据各来一条反例，且**都拿真实文本造 fixture**（先断言替换生效）。
 *    另有「命中不是 0」的正向断言：只会在 0 命中时绿的闸门，本仓真实发生过一次。
 *
 * 反例里用的是**方案 A 消灭掉的那几种形态**：写死路径回归、条目改名忘改 workflow、
 * `--filter` 包名打错、发布闸跑 CI 不认的入口、同一入口两侧命令不一致。
 */
import { describe, expect, it } from 'vitest'
import {
  WORKFLOW_FILES,
  checkCiScriptTruth,
  parseWorkflowRefs,
  readCiScriptInputs,
} from '../ci-script-truth.mjs'

/** 真实仓库的输入（只读；反例都在它的副本上改）。 */
const real = readCiScriptInputs()

const ciText = real.workflows.find((workflow) => workflow.file === 'ci.yml').text
const releaseText = real.workflows.find((workflow) => workflow.file === 'release.yml').text

/** 用真实文本造一份替换后的输入；替换没生效就抛（否则反例会变成空测试）。 */
function mutateWorkflow(file, from, to) {
  const source = file === 'ci.yml' ? ciText : releaseText
  if (!source.includes(from)) throw new Error(`fixture 替换没匹配上（${file}）：${from.slice(0, 60)}`)
  const mutated = source.replace(from, to)
  expect(mutated, 'fixture 必须真的改动文本').not.toBe(source)
  return {
    workflows: real.workflows.map((workflow) => (workflow.file === file ? { file, text: mutated } : workflow)),
    packages: real.packages,
  }
}

const kinds = (diffs) => diffs.map((diff) => diff.kind)

describe('ci-script-truth：现算（唯一真值来源）', () => {
  it('真实仓库：全部判据通过（守卫必须绿）', () => {
    const diffs = checkCiScriptTruth(real)
    expect(diffs.map((diff) => diff.message).join('\n')).toBe('')
    expect(diffs).toEqual([])
  })

  it('命中不是 0：两条 workflow 都真的有包内条目引用，且写死路径已归零', () => {
    // 「写死路径 0 处」正是方案 A 的成果——它必须是被**现算**出来的，不是没人扫
    for (const workflow of real.workflows) {
      const { hardcoded, entries } = parseWorkflowRefs(workflow.text)
      expect(entries.length, `${workflow.file} 应抓到条目引用`).toBeGreaterThan(0)
      expect(hardcoded, `${workflow.file} 不该再有写死路径`).toEqual([])
    }
    const ciRefs = parseWorkflowRefs(ciText).entries
    expect(ciRefs.length, 'ci.yml 的条目引用数（tty 7 + docker 1 + windows 1）').toBeGreaterThanOrEqual(9)
    expect(WORKFLOW_FILES, '查的文件清单').toEqual(['ci.yml', 'release.yml'])
  })

  it('tty 与 docker 的包名来自 package.json（不是写死的字符串）', () => {
    const names = real.packages.map((pkg) => pkg.name)
    expect(names).toContain('@hyzyn/dsh-tty')
    expect(names).toContain('@hyzyn/dsh-docker')
    for (const ref of parseWorkflowRefs(ciText).entries) {
      expect(names, `${ref.pkgName} 应是 workspace 里的包`).toContain(ref.pkgName)
    }
  })
})

describe('反例：方案 A 消灭掉的形态回来一条 → 必须报出来', () => {
  it('写死路径回归 → ci.hardcodedPath', () => {
    const fixture = mutateWorkflow(
      'ci.yml',
      '          pnpm --filter @hyzyn/dsh-tty run ssh-smoke\n',
      '          node packages/tty/scripts/ssh-smoke.mjs\n',
    )
    const diffs = checkCiScriptTruth(fixture)
    expect(kinds(diffs)).toContain('ci.hardcodedPath')
    expect(diffs.find((diff) => diff.kind === 'ci.hardcodedPath')?.message).toContain('悄悄腐烂')
  })

  it('条目改名忘改 workflow → ci.entry.missing', () => {
    const fixture = mutateWorkflow('ci.yml', 'run probe-route-smoke', 'run probe-route-smoke-renamed')
    const diffs = checkCiScriptTruth(fixture)
    expect(kinds(diffs)).toContain('ci.entry.missing')
    expect(diffs.find((diff) => diff.kind === 'ci.entry.missing')?.message).toContain('没有这个条目')
  })

  it('`--filter` 包名打错 → ci.entry.unknown', () => {
    const fixture = mutateWorkflow('ci.yml', 'pnpm --filter @hyzyn/dsh-docker run smoke', 'pnpm --filter @hyzyn/dsh-dockerx run smoke')
    const diffs = checkCiScriptTruth(fixture)
    expect(kinds(diffs)).toContain('ci.entry.unknown')
  })

  it('发布闸跑 CI 不认的入口 → ci.releaseOnly', () => {
    const fixture = mutateWorkflow(
      'release.yml',
      '          pnpm --filter @hyzyn/dsh-docker run smoke\n',
      '          pnpm --filter @hyzyn/dsh-docker run smoke\n          pnpm --filter @hyzyn/dsh-tty run preview\n',
    )
    const diffs = checkCiScriptTruth(fixture)
    expect(kinds(diffs)).toContain('ci.releaseOnly')
    expect(diffs.find((diff) => diff.kind === 'ci.releaseOnly')?.message).toContain('平时无声')
  })

  it('同一入口两侧命令不一致 → ci.crossWorkflow.mismatch', () => {
    const fixture = mutateWorkflow('ci.yml', 'pnpm --filter @hyzyn/dsh-docker run smoke', 'pnpm --filter @hyzyn/dsh-docker run smoke --silent')
    const diffs = checkCiScriptTruth(fixture)
    expect(kinds(diffs)).toContain('ci.crossWorkflow.mismatch')
    expect(diffs.find((diff) => diff.kind === 'ci.crossWorkflow.mismatch')?.message).toContain('逐字一致')
  })

  it('一个引用都抓不到（闸门恒绿）→ ci.empty', () => {
    const diffs = checkCiScriptTruth({
      workflows: real.workflows.map((workflow) => ({ file: workflow.file, text: '# fixture：命令全被清掉\n' })),
      packages: real.packages,
    })
    expect(kinds(diffs)).toContain('ci.empty')
    expect(diffs.find((diff) => diff.kind === 'ci.empty')?.message).toContain('恒绿')
  })

  it('CRLF 检出不该假红（Windows 工作区）', () => {
    const crlf = real.workflows.map((workflow) => ({ file: workflow.file, text: workflow.text.replace(/\n/g, '\r\n') }))
    expect(checkCiScriptTruth({ workflows: crlf, packages: real.packages })).toEqual([])
  })
})
