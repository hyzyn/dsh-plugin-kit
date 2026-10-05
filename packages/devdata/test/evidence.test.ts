/**
 * **证据链总览**的读取测试（P13 第一版，`evidence.ts`）。
 *
 * 这一层的失败方式很具体：**读错时它不会崩，它会报绿或报错诊断**。所以用例盯的是三件——
 *
 *   1. **「没有那份清单」与「路径写错了」是两种结果**（`missing` vs `BAD_ROOT`）：把后者说成前者，
 *      人会去建一份本来就在别处的清单；
 *   2. **项目名是唯一对齐键**：清单里串了、或干脆没写 `project`，都算**没对齐**（防复制粘贴改漏，
 *      那种错误会让断言跑到别的项目上去，而报告看起来是绿的）；
 *   3. **路径不许拼到项目根之外**：本模块多了一个**浏览器**调用方——`manifestRelPath` 只做字符串
 *      拼接，所以 `../` 一类的项目名必须在读文件之前就被拒（有一条专门的反例）。
 *
 * `count` 的语义也钉住了：**读不到不是 0 条**（0 条是「清单里一条都没有」这个结论）。
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { EVIDENCE_FACES, readEvidence, type EvidenceFaceReport } from '../src/index.js'

const PROJECT = 'cdqas'
const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function projectRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'dsh-devdata-evidence-'))
  dirs.push(root)
  return root
}

/** 写一份清单到项目根下的相对路径（父目录自动建）。 */
function write(root: string, rel: string, text: string): void {
  const at = join(root, rel)
  mkdirSync(join(at, '..'), { recursive: true })
  writeFileSync(at, text)
}

const READY = ['version: 1', `project: ${PROJECT}`, 'services:', '  - name: ems-service', '    ready: { kind: healthcheck }', ''].join('\n')
const VERIFY = [
  'version: 1',
  `project: ${PROJECT}`,
  'assertions:',
  '  - id: redis-alive',
  '    appliesTo: backend',
  '    target: redis-248',
  '    statement: PING',
  '    expect: { eq: PONG }',
  '    severity: fail',
  '',
].join('\n')
const WEB = ['version: 1', `project: ${PROJECT}`, 'assertions:', '  - id: home-ok', '    target: t-local', '    checks: []', ''].join('\n')

function face(report: ReturnType<typeof readEvidence>, name: string): EvidenceFaceReport {
  if (!report.ok) throw new Error(`期望读到报告，却被拒：${report.code} ${report.error}`)
  const found = report.faces.find((item) => item.face === name)
  if (found === undefined) throw new Error(`报告里没有 ${name} 这一面`)
  return found
}

describe('三面清单的总览', () => {
  it('★ 三份都在、项目名一致：没有结果时给形状，不给结论', () => {
    const root = projectRoot()
    write(root, `ready/${PROJECT}.ready.yaml`, READY)
    write(root, `verify/${PROJECT}.yaml`, VERIFY)
    write(root, `web/${PROJECT}.yaml`, WEB)

    const report = readEvidence({ root, project: PROJECT })
    expect(report.ok).toBe(true)
    if (!report.ok) return

    expect(report.faces.map((item) => item.face)).toEqual(['ready', 'verify', 'web'])
    expect(report.faces.map((item) => item.path)).toEqual([
      `ready/${PROJECT}.ready.yaml`,
      `verify/${PROJECT}.yaml`,
      `web/${PROJECT}.yaml`,
    ])
    for (const item of report.faces) {
      expect(item.state).toBe('parsed')
      expect(item.projectMatches).toBe(true)
    }
    expect(face(report, 'ready').count).toBe(1)
    expect(face(report, 'verify').count).toBe(1)
    expect(face(report, 'verify').countField).toBe('assertions')
    expect(face(report, 'ready').countField).toBe('services')
    // Jenkins 那一格**如实说没接**：不摆空壳。
    expect(report.jenkins.state).toBe('unwired')
  })

  it('只有一份清单时另外两面报 `missing`——「没有那份清单」不是错误', () => {
    const root = projectRoot()
    write(root, `verify/${PROJECT}.yaml`, VERIFY)

    const report = readEvidence({ root, project: PROJECT })
    expect(face(report, 'ready').state).toBe('missing')
    expect(face(report, 'verify').state).toBe('parsed')
    expect(face(report, 'web').state).toBe('missing')
    // 「没有」时没有项目名可谈，也没有条数可谈——都用 null，不编一个 0 出来。
    expect(face(report, 'ready').projectMatches).toBeNull()
    expect(face(report, 'ready').count).toBeNull()
  })

  it('清单里的 project 串了 → `projectMatches: false`（状态仍是 parsed：文件本身是好的）', () => {
    const root = projectRoot()
    write(root, `verify/${PROJECT}.yaml`, VERIFY.replace(`project: ${PROJECT}`, 'project: hcckc'))

    const found = face(readEvidence({ root, project: PROJECT }), 'verify')
    expect(found.state).toBe('parsed')
    expect(found.projectInFile).toBe('hcckc')
    expect(found.projectMatches).toBe(false)
  })

  it('清单里没写 `project` → 也算**没对齐**（文件名是唯一对齐键，漏写就是没对齐）', () => {
    const root = projectRoot()
    write(root, `verify/${PROJECT}.yaml`, VERIFY.replace(`project: ${PROJECT}\n`, ''))

    const found = face(readEvidence({ root, project: PROJECT }), 'verify')
    expect(found.projectInFile).toBeNull()
    expect(found.projectMatches).toBe(false)
  })

  it('YAML 语法错报 `malformed` 并把解析器那句话带回来；空文件报 `empty`（两件事）', () => {
    const root = projectRoot()
    write(root, `verify/${PROJECT}.yaml`, 'version: 1\n  project: [\n')
    write(root, `web/${PROJECT}.yaml`, '\n')

    const malformed = face(readEvidence({ root, project: PROJECT }), 'verify')
    expect(malformed.state).toBe('malformed')
    expect(malformed.message).not.toBeNull()

    const empty = face(readEvidence({ root, project: PROJECT }), 'web')
    expect(empty.state).toBe('empty')
    expect(empty.projectMatches).toBeNull()
  })

  it('条目字段不是数组 → `count: null`（**不是 0**：读不到与「一条都没有」是两件事）', () => {
    const root = projectRoot()
    write(root, `verify/${PROJECT}.yaml`, `version: 1\nproject: ${PROJECT}\nassertions: 3\n`)

    const found = face(readEvidence({ root, project: PROJECT }), 'verify')
    expect(found.state).toBe('parsed')
    expect(found.count).toBeNull()
  })

  it('路径写错与清单缺失分开报：根不存在 / 根是文件 → `BAD_ROOT`（不是「三份都没有」）', () => {
    const missing = readEvidence({ root: join(projectRoot(), 'nope'), project: PROJECT })
    expect(missing.ok).toBe(false)
    if (!missing.ok) expect(missing.code).toBe('BAD_ROOT')

    const root = projectRoot()
    write(root, 'a-file.txt', 'x')
    const notDir = readEvidence({ root: join(root, 'a-file.txt'), project: PROJECT })
    expect(notDir.ok).toBe(false)
    if (!notDir.ok) expect(notDir.code).toBe('BAD_ROOT')

    const relative = readEvidence({ root: 'relative/path', project: PROJECT })
    expect(relative.ok).toBe(false)
    if (!relative.ok) expect(relative.code).toBe('BAD_ROOT')
  })

  it('★ 反例：项目名带路径分隔符 / `..` / 点开头 → `BAD_PROJECT`，**在读文件之前就被拒**', () => {
    const root = projectRoot()
    /*
     * 把「越界之后的落点」真的放出来：`project = '../outside'` 时拼出来的是
     * `ready/../outside.ready.yaml`，也就是根目录下的 `outside.ready.yaml`。校验若漏了，这一份
     * 会被读到、结果会变成 `parsed`——所以下面那条 `ok === false` **同时证明了「没读到它」**。
     */
    write(root, 'outside.ready.yaml', `version: 1\nproject: ${PROJECT}\nservices: []\n`)

    for (const project of ['../outside', 'a/b', '..', '.', '', 'a b', '-lead']) {
      const report = readEvidence({ root, project })
      expect(report.ok, `项目名 ${JSON.stringify(project)} 应该被拒`).toBe(false)
      if (!report.ok) expect(report.code).toBe('BAD_PROJECT')
    }
  })

  it('三面形态表就是「清单住在哪」的口径（后缀 / 字段 / 归属 / 工具都在这里）', () => {
    expect(EVIDENCE_FACES).toEqual([
      { face: 'ready', dir: 'ready', suffix: '.ready.yaml', countField: 'services', owner: '@hyzyn/dsh-devenv', tool: 'env_wait' },
      { face: 'verify', dir: 'verify', suffix: '.yaml', countField: 'assertions', owner: '@hyzyn/dsh-devdata', tool: 'devdata_verify' },
      { face: 'web', dir: 'web', suffix: '.yaml', countField: 'assertions', owner: '@hyzyn/dsh-devfront', tool: 'site_verify' },
    ])
  })
})
