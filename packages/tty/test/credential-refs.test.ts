/**
 * @hyzyn/dsh-tty — 凭据引用名读取单测（DEFECTS D38 第 4 刀 / D45 的 credential-refs 面）。
 *
 * `readCredentialRefNames` 是 `/api/dsh-tty/credential-refs` 路由与 SSH 对话框
 * 引用选择器的数据源：读 `$DSH_HOME/.credentials.yaml` 的 `refs:` 块键名。
 * 只验「键名解析 + 只回键名不回值」——值在任何返回值里都不允许出现。
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readCredentialRefNames } from '../src/index.js'

let home = ''
const savedDshHome = process.env.DSH_HOME

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'dsh-tty-creds-'))
  process.env.DSH_HOME = home
})

afterEach(() => {
  if (savedDshHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = savedDshHome
  rmSync(home, { recursive: true, force: true })
})

const SECRET_A = 'sup3r-secret-value-A'
const SECRET_B = 'sup3r-secret-value-B'

function writeStore(content: string): void {
  writeFileSync(join(home, '.credentials.yaml'), content, 'utf8')
}

describe('readCredentialRefNames（credential-refs 数据源）', () => {
  it('解析 refs: 块键名，去重排序；值绝不外泄', () => {
    writeStore([
      'version: 1',
      'refs:',
      `  DSH_TTY_BETA: ${SECRET_B}`,
      `  DSH_TTY_ALPHA: ${SECRET_A}`,
      `  DSH_TTY_ALPHA: ${SECRET_A} # 重复键：本地 provider 不会写，容忍`,
      'other_section:',
      '  NOT_A_REF: x',
    ].join('\n'))
    const names = readCredentialRefNames()
    expect(names).toEqual(['DSH_TTY_ALPHA', 'DSH_TTY_BETA'])
    // 只验引用名不验值：两个秘密值都不允许出现在返回结构里
    expect(JSON.stringify(names)).not.toContain(SECRET_A)
    expect(JSON.stringify(names)).not.toContain(SECRET_B)
  })

  it('refs: 之外的顶层区块与缩进不符的行不采集', () => {
    writeStore([
      'version: 1',
      'refs:',
      '  DSH_TTY_GOOD: v',
      '    DSH_TTY_DEEP: v', // 三空格：不是引用条目
      'DSH_TTY_TOPLEVEL: v', // 顶层键：不是引用
      '  lowercase_bad-name: v', // 非 POSIX 标识符（含 -）：不采集
    ].join('\n'))
    expect(readCredentialRefNames()).toEqual(['DSH_TTY_GOOD'])
  })

  it('存储文件不存在 → 空数组（不报错）', () => {
    expect(readCredentialRefNames()).toEqual([])
  })
})
