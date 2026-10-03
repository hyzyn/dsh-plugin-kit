/**
 * 就绪清单加载与「读不到怎么说」的测试（`src/ready-loader.ts`）。
 *
 * 用**真临时目录 + 真文件**，不 mock `node:fs`：这一层的全部价值就是「文件在不在、读不读得了、
 * 内容成不成立」这三件事的区分——把它们换成 mock，等于用我自己写的想象替换掉被测行为。
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import {
  READY_DIR,
  describeProfileProblem,
  listReadyProjects,
  loadReadyProfile,
  readyManifestPath,
  readyManifestRelPath,
} from '../src/ready-loader.js'

const dirs: string[] = []

/** 造一个临时「项目根」。 */
function project(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-devenv-ready-'))
  dirs.push(dir)
  return dir
}

/** 往项目里写一份清单。 */
function writeManifest(dir: string, name: string, text: string): void {
  mkdirSync(join(dir, READY_DIR), { recursive: true })
  writeFileSync(join(dir, READY_DIR, name), text)
}

/** 一份合法清单。 */
const GOOD = [
  'version: 1',
  'project: ems',
  'services:',
  '  - name: ems-service',
  "    ready: { kind: logPattern, pattern: 'Started .*Application in' }",
  '  - name: ems-redis',
].join('\n')

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('路径约定', () => {
  it('清单唯一路径 <项目根>/ready/<项目名>.ready.yaml', () => {
    expect(readyManifestRelPath('ems')).toBe('ready/ems.ready.yaml')
    expect(readyManifestPath('/w/app', 'ems')).toBe(join('/w/app', 'ready', 'ems.ready.yaml'))
  })

  it('列出这个目录下已有的清单名（`no-profile` 文案要用它给一条对照）', () => {
    const dir = project()
    writeManifest(dir, 'ems.ready.yaml', GOOD)
    writeManifest(dir, 'hcckc.ready.yaml', GOOD.replaceAll('ems', 'hcckc'))
    writeManifest(dir, '无关的文件.yaml', 'x: 1')
    expect(listReadyProjects(dir)).toEqual(['ems', 'hcckc'])
  })

  it('目录不存在时列表是空的（不是抛错）', () => {
    expect(listReadyProjects(join(project(), '不存在'))).toEqual([])
  })
})

describe('loadReadyProfile：三种「读不到」必须分开', () => {
  it('合法清单 → ok（`profilesIn` 认得出它）', () => {
    const dir = project()
    writeManifest(dir, 'ems.ready.yaml', GOOD)
    const loaded = loadReadyProfile(dir, 'ems')
    expect(loaded.kind).toBe('ok')
    if (loaded.kind !== 'ok') throw new Error('unreachable')
    expect(loaded.profile.services.map((service) => service.name)).toEqual(['ems-service', 'ems-redis'])
    expect(loaded.profile.services[0]?.ready).toEqual({ kind: 'logPattern', pattern: 'Started .*Application in' })
  })

  it('没这份清单 → no-profile（**不是** config-error：它是「这个项目没有就绪要求」）', () => {
    expect(loadReadyProfile(project(), 'ems')).toEqual({ kind: 'no-profile', project: 'ems' })
  })

  it('文件在但读不了（这里用同名目录造 EISDIR）→ unreadable', () => {
    const dir = project()
    mkdirSync(join(dir, READY_DIR, 'ems.ready.yaml'), { recursive: true })
    const loaded = loadReadyProfile(dir, 'ems')
    expect(loaded.kind).toBe('unreadable')
    if (loaded.kind !== 'unreadable') throw new Error('unreachable')
    expect(loaded.message).not.toBe('')
  })

  it('YAML 语法错 → config-error（路径为空，带上解析器那句话）', () => {
    const dir = project()
    writeManifest(dir, 'ems.ready.yaml', 'version: 1\nservices: [{\n')
    const loaded = loadReadyProfile(dir, 'ems')
    expect(loaded.kind).toBe('config-error')
    if (loaded.kind !== 'config-error') throw new Error('unreachable')
    expect(loaded.errors[0]?.message).toContain('YAML 解析失败')
  })

  it('清单里 project 与文件名不一致 → config-error 指到 `project` 字段', () => {
    const dir = project()
    writeManifest(dir, 'ems.ready.yaml', GOOD.replace('project: ems', 'project: hcckc'))
    const loaded = loadReadyProfile(dir, 'ems')
    expect(loaded.kind).toBe('config-error')
    if (loaded.kind !== 'config-error') throw new Error('unreachable')
    expect(loaded.errors.map((error) => error.path)).toContain('project')
  })

  it('就绪维度写了不认识的值 → config-error 指到字段', () => {
    const dir = project()
    writeManifest(dir, 'ems.ready.yaml', GOOD.replace('kind: logPattern', 'kind: 端口通了'))
    const loaded = loadReadyProfile(dir, 'ems')
    expect(loaded.kind).toBe('config-error')
    if (loaded.kind !== 'config-error') throw new Error('unreachable')
    expect(loaded.errors.map((error) => error.path)).toContain('services[0].ready.kind')
  })
})

describe('describeProfileProblem：agent 要能据这句话行动', () => {
  it('no-profile：说清「没有清单 = 没有就绪要求」，并给出写哪一份', () => {
    const text = describeProfileProblem({ kind: 'no-profile', project: 'ems' }, { cwd: '/w/app', project: 'ems', known: [] })
    expect(text).toContain('ready/ems.ready.yaml')
    expect(text).toContain('/w/app')
    expect(text).toContain('没有清单 = 这个项目没有就绪要求')
    expect(text).toContain('恢复路径')
  })

  it('no-profile 且目录里已有别的清单：附上对照（项目名与文件名不一致是最常见的写错方式）', () => {
    const text = describeProfileProblem({ kind: 'no-profile', project: 'ems' }, { cwd: '/w/app', project: 'ems', known: ['ems-service', 'redis'] })
    expect(text).toContain('ems-service / redis')
    expect(text).toContain('清单里的 project 要与文件名一致')
  })

  it('unreadable：原样带上底层原因', () => {
    const text = describeProfileProblem({ kind: 'unreadable', project: 'ems', message: 'EACCES: permission denied' }, { cwd: '/w/app', project: 'ems', known: [] })
    expect(text).toContain('就绪清单读不了')
    expect(text).toContain('EACCES')
  })

  it('config-error：逐条列字段（改清单的人要一眼看到改哪）', () => {
    const text = describeProfileProblem(
      { kind: 'config-error', project: 'ems', errors: [{ path: 'project', message: '不一致' }, { path: '', message: 'YAML 解析失败：xx' }] },
      { cwd: '/w/app', project: 'ems', known: [] },
    )
    expect(text).toContain('- project：不一致')
    expect(text).toContain('- YAML 解析失败：xx')
  })
})
