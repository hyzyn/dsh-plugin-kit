/**
 * 项目内只读清单骨架（`src/manifest.ts`）的用例。
 *
 * 为什么值得单独测：这一份是**三个包共用**的读取层（`devdata` 的 `verify/`、`devfront` 的 `web/`、
 * `devenv` 的 `ready/`），三包各自的用例只会走自己那条路径；而「五种读不到」的分档、以及
 * 「多个候选都读到 = 歧义」这条口径，必须在这一层被钉住——不然它们会各自漂。
 *
 * 夹具：临时目录自己建自己删（`afterAll`）。
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'

import { manifestFileName, manifestRelPath, projectsInFiles, readProjectManifest } from '../src/manifest.js'

const dir = mkdtempSync(join(tmpdir(), 'dsh-kit-manifest-'))

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

/** 造一份清单文件，返回它的绝对路径。 */
function write(name: string, text: string): string {
  const file = join(dir, name)
  mkdirSync(join(file, '..'), { recursive: true })
  writeFileSync(file, text)
  return file
}

describe('readProjectManifest：五种「读不到」各自成形', () => {
  it('不存在 → `missing`（不是错误：本仓口径是「缺省即无」）', () => {
    expect(readProjectManifest([join(dir, 'nope.yaml')])).toEqual({ kind: 'missing' })
  })

  it('路径中间那一段是文件 → 也算 `missing`（ENOTDIR 不是「读不了」）', () => {
    const file = write('a-file', 'x')
    expect(readProjectManifest([join(file, 'sub.yaml')]).kind).toBe('missing')
  })

  it('文件在但读不了 → `unreadable`（带文件与原始原因）', () => {
    const asDir = join(dir, 'as-dir.yaml')
    mkdirSync(asDir)
    const read = readProjectManifest([asDir])
    expect(read.kind).toBe('unreadable')
    if (read.kind === 'unreadable') {
      expect(read.file).toBe(asDir)
      expect(read.message.length).toBeGreaterThan(0)
    }
  })

  it('YAML 语法错 → `malformed`（解析器那句话原样带出来）', () => {
    const file = write('broken.yaml', 'a: [1, 2\n')
    const read = readProjectManifest([file])
    expect(read.kind).toBe('malformed')
    if (read.kind === 'malformed') expect(read.file).toBe(file)
  })

  it('空文件 → `empty`（**「空文件」与「没有清单」是两件事**）', () => {
    expect(readProjectManifest([write('empty.yaml', '')])).toEqual({ kind: 'empty', file: join(dir, 'empty.yaml') })
  })

  it('正常 → `parsed`，`data` 原样交回（这一层不判领域语义）', () => {
    const file = write('ok.yaml', 'version: 1\nproject: ems\nservices: []\n')
    const read = readProjectManifest([file])
    expect(read.kind).toBe('parsed')
    if (read.kind === 'parsed') expect(read.data).toEqual({ version: 1, project: 'ems', services: [] })
  })

  it('多个候选都读到 → `multiple`（歧义不按顺序静默取胜）', () => {
    const first = write('m/one.yaml', 'a: 1\n')
    const second = write('m/two.yaml', 'a: 2\n')
    const read = readProjectManifest([first, second])
    expect(read.kind).toBe('multiple')
    if (read.kind === 'multiple') expect(read.files).toEqual([first, second])
  })

  it('按顺序取**第一个存在**的；后面那个不存在不算事', () => {
    const first = write('order/one.yaml', 'a: 1\n')
    const read = readProjectManifest([first, join(dir, 'order/absent.yaml')])
    expect(read.kind).toBe('parsed')
  })

  it('`JSON_SCHEMA`：`!!js` 一类标签**不被求值**（清单是配置数据，不是脚本）', () => {
    const file = write('js.yaml', 'v: !!js process.exit(1)\n')
    const read = readProjectManifest([file])
    // 未知标签在 JSON_SCHEMA 下直接报错 —— 正是我们要的：它进不了「清单」这一侧
    expect(read.kind === 'malformed' || read.kind === 'parsed').toBe(true)
    if (read.kind === 'parsed') expect(String(JSON.stringify(read.data))).not.toContain('exit')
  })
})

describe('文件名与「这里有哪些清单」', () => {
  it('`manifestFileName` / `manifestRelPath`：后缀与相对路径只有一处拼', () => {
    expect(manifestFileName('ems', '.ready.yaml')).toBe('ems.ready.yaml')
    expect(manifestRelPath('verify', 'ems', '.yaml')).toBe('verify/ems.yaml')
  })

  it('`projectsInFiles`：带前缀时要求前缀，且 stem 里不许再有目录', () => {
    const found = projectsInFiles(['verify/ems.yaml', 'verify/sub/x.yaml', 'web/ems.yaml', 'verify/ems.yml', 'verify/.yaml'], {
      prefix: 'verify/',
      suffix: '.yaml',
    })
    expect([...found.keys()]).toEqual(['ems'])
  })

  it('`projectsInFiles`：不给前缀时取 basename（`devenv` 那种「目录已经列过」的用法）', () => {
    const found = projectsInFiles(['ems.ready.yaml', 'cdc.ready.yaml', 'other.yaml', '.ready.yaml'], { suffix: '.ready.yaml' })
    expect([...found.keys()]).toEqual(['ems', 'cdc'])
  })
})
