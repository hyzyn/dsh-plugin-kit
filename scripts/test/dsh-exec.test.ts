/**
 * `scripts/dsh-exec.mjs` 的单元测试 —— 「怎么把 dsh 跑起来」。
 *
 * 这份测试的存在理由就是**真机挖出来的那条缺陷**：Windows 上 `where dsh` 的第一条是 npm 全局
 * shim 里的无扩展名 POSIX shell 脚本，`spawn` 它直接 `ENOENT`（`live-host-smoke --bootstrap`
 * 在 Windows 上第一次跑就死在这儿）。那条分支在 macOS / ubuntu 上天然跑不到——CI 里也没有
 * 「Windows + npm 全局 dsh」的组合。所以 platform 与搜索函数都做成可注入的，让**任何平台**都能
 * 把那两条分支跑一遍：把 shim 布局在临时目录里造出来，断言解析结果。
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { findDsh, resolveDshEntryFromShim } from '../dsh-exec.mjs'

const roots = []
function tempRoot() {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-exec-'))
  roots.push(dir)
  return dir
}
afterAll(() => {
  for (const dir of roots) rmSync(dir, { recursive: true, force: true })
})

/**
 * 造一个 npm 全局安装前缀的样子（与 Windows 真机一致）：
 *   <prefix>/dsh            ← 无扩展名的 POSIX shell shim（Windows 上 spawn 会 ENOENT）
 *   <prefix>/dsh.cmd        ← cmd shim，内容指向 node_modules 里的 lib/bin.js
 *   <prefix>/node_modules/@deepseek-ai/dsh/lib/bin.js
 */
function makeNpmPrefix() {
  const prefix = tempRoot()
  const entry = join(prefix, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
  mkdirSync(join(prefix, 'node_modules', '@deepseek-ai', 'dsh', 'lib'), { recursive: true })
  writeFileSync(entry, '#!/usr/bin/env node\n')
  const posixShim = join(prefix, 'dsh')
  writeFileSync(posixShim, '#!/bin/sh\nbasedir=$(dirname "$0")\nexec node "$basedir/node_modules/@deepseek-ai/dsh/lib/bin.js" "$@"\n')
  const cmdShim = join(prefix, 'dsh.cmd')
  writeFileSync(cmdShim, [
    '@ECHO off',
    'SETLOCAL',
    'CALL :find_dp0',
    'endLocal & "%_prog%"  "%dp0%\\node_modules\\@deepseek-ai\\dsh\\lib\\bin.js" %*',
    '',
  ].join('\r\n'))
  return { prefix, entry, posixShim, cmdShim }
}

describe('resolveDshEntryFromShim', () => {
  it('按 npm 全局布局直接找到 <shim 同级>/node_modules/@deepseek-ai/dsh/lib/bin.js', () => {
    const { cmdShim, entry } = makeNpmPrefix()
    expect(resolveDshEntryFromShim(cmdShim)).toBe(entry)
  })

  it('布局猜不到时退到读 shim 内容里的 %dp0% 路径', () => {
    // 造一个**不是** npm 全局布局的位置：shim 单摆着，入口在它旁边另一个目录里
    const dir = tempRoot()
    const entryDir = join(dir, 'somewhere-else', 'deepseek-ai', 'dsh', 'lib')
    mkdirSync(entryDir, { recursive: true })
    const entry = join(entryDir, 'bin.js')
    writeFileSync(entry, '#!/usr/bin/env node\n')
    const shim = join(dir, 'dsh.cmd')
    writeFileSync(shim, `"%dp0%\\somewhere-else\\deepseek-ai\\dsh\\lib\\bin.js" %*\r\n`)
    expect(resolveDshEntryFromShim(shim)).toBe(entry)
  })

  it('内容里没有 bin.js / 文件不存在 → null（不瞎猜）', () => {
    const dir = tempRoot()
    const shim = join(dir, 'dsh.cmd')
    writeFileSync(shim, '@ECHO off\r\necho nothing here\r\n')
    expect(resolveDshEntryFromShim(shim)).toBeNull()
    expect(resolveDshEntryFromShim(join(dir, 'not-there.cmd'))).toBeNull()
  })
})

describe('findDsh：Windows 上不能拿无扩展名的 shim 去 spawn', () => {
  it('where dsh 的第一条是无扩展名 shim 时，跳过它、用 node 跑 .cmd 解析出的入口', () => {
    const { posixShim, cmdShim, entry } = makeNpmPrefix()
    const found = findDsh({ platform: 'win32', nodePath: 'C:\\node.exe', locate: () => [posixShim, cmdShim] })
    expect(found).not.toBeNull()
    expect(found.binary).toBe('C:\\node.exe')
    expect(found.argv0).toEqual([entry])
    // 标签要指向「找到的那个 shim」，好让人从日志里认出是哪份 dsh
    expect(found.label).toBe(cmdShim)
  })

  it('只有 `.cmd`（顺序反过来）时同样解析出入口', () => {
    const { cmdShim, entry } = makeNpmPrefix()
    const found = findDsh({ platform: 'win32', nodePath: 'C:\\node.exe', locate: () => [cmdShim] })
    expect(found.argv0).toEqual([entry])
  })

  it('只有不可用的无扩展名 shim → null（报「没装 DSH」也比 ENOENT 崩掉好）', () => {
    // 真机那条 shim 的内容是 `exec node "$basedir/node_modules/…/lib/bin.js"`：`$basedir`
    // 不是路径，解析出来不存在 → 它不可用。这里用一条**连 bin.js 都不提**的 shim 表达同一件事。
    const dir = tempRoot()
    const shim = join(dir, 'dsh')
    writeFileSync(shim, '#!/bin/sh\necho this shim points nowhere\n')
    expect(findDsh({ platform: 'win32', nodePath: 'C:\\node.exe', locate: () => [shim] })).toBeNull()
  })

  it('真机那条 posix shim 的内容解析不出入口 → 落到下一条 .cmd（顺序无关）', () => {
    const { prefix, cmdShim, entry } = makeNpmPrefix()
    // 把 posix shim 换成真机上那条 `$basedir` 写法，并让 locate 只按自然顺序返回它
    const posixShim = join(prefix, 'dsh')
    writeFileSync(posixShim, '#!/bin/sh\nbasedir=$(dirname "$0")\nexec node "$basedir/node_modules/@deepseek-ai/dsh/lib/bin.js" "$@"\n')
    const found = findDsh({ platform: 'win32', nodePath: 'C:\\node.exe', locate: () => [posixShim, cmdShim] })
    expect(found.argv0).toEqual([entry])
  })

  it('真 `.exe`（不是 npm shim 的装法）直接跑', () => {
    const dir = tempRoot()
    const exe = join(dir, 'dsh.exe')
    writeFileSync(exe, '')
    expect(findDsh({ platform: 'win32', locate: () => [exe] })).toEqual({ binary: exe, argv0: [], label: exe })
  })
})

describe('findDsh：其它情况', () => {
  it('POSIX 上就用 `which` 找到的那个 shim（不解析 JS 入口）', () => {
    const dir = tempRoot()
    const shim = join(dir, 'dsh')
    writeFileSync(shim, '#!/bin/sh\n')
    expect(findDsh({ platform: 'linux', locate: () => [shim] })).toEqual({ binary: shim, argv0: [], label: shim })
  })

  it('一个候选都没有 / 候选都不存在 → null', () => {
    expect(findDsh({ platform: 'linux', locate: () => [] })).toBeNull()
    expect(findDsh({ platform: 'linux', locate: () => ['/nonexistent/dsh'] })).toBeNull()
  })

  it('显式 --dsh 优先，且不存在时不回退搜索（用户点名了它）', () => {
    const dir = tempRoot()
    const shim = join(dir, 'dsh')
    writeFileSync(shim, '#!/bin/sh\n')
    expect(findDsh({ explicit: shim, platform: 'linux', locate: () => ['/other/dsh'] }).binary).toBe(shim)
    expect(findDsh({ explicit: join(dir, 'missing'), platform: 'linux', locate: () => [shim] })).toBeNull()
  })
})
