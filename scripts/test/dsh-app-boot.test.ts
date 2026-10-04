/**
 * `scripts/dsh-app-boot.mjs` 的用例 —— 「去哪找 DSH 官方判定器」。
 *
 * 这组用例守四件事：
 *
 * 1. **三级优先级的顺序**（显式参数 > 环境变量 > 从 dsh 真身推导 > `npm root -g` 兜底）。
 *    顺序是行为的一部分：从 `dsh` 真身推导要**优先于** `npm root -g`，因为 nvm / volta
 *    下 PATH 里的 `npm` 与 `dsh` 可能来自**不同** node 版本，而我们要的是「这个 dsh 自己」
 *    带的那份判定器。
 * 2. **显式来源失败必须直接失败，不许静默回落**——2026-10-04 实测过的 bug：
 *    `DSH_APP_BOOT_DIR=/tmp/also-missing` 被静默忽略、回落到自动定位并**成功**，
 *    于是「我钉住的那一份判定器」根本没被用上，而结论看起来是绿的。
 * 3. **`isUsableAppBoot` 要查 `lib/index.js`**，不能只查目录存在——那正是 `--app-boot`
 *    真正 import 的入口，只判目录会让解包中断的残缺安装通过、然后在 import 时才炸。
 * 4. **从 bin 推导的路径形态**（含 Windows 的 `where` 多行输出）。
 *
 * 全部走注入（`exists` / `readdir` / `realpath` / `whichDsh` / `npmRootG`），
 * 不碰真实全局安装——所以任何平台都能跑，且是毫秒级。
 */
import * as path from 'node:path'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  APP_BOOT_ENV_VAR,
  appBootCandidatesFromDshBin,
  appBootFromDshBin,
  describeAppBootSearch,
  dshPackageRootsUnder,
  findAppBoot,
  isUsableAppBoot,
} from '../dsh-app-boot.mjs'

/** 造一个假的「哪些路径存在」集合。 */
function fakeFs(existing) {
  const set = new Set(existing)
  return { exists: (p) => set.has(p) }
}

/**
 * 夹具路径一律用 `path.resolve` / `path.join` 拼，**不写死分隔符、也不留「盘符相对」形态**。
 *
 * ## 两次 Windows 腿实测（2026-10-04）
 *
 * **第一次**（12 条红）：夹具用模板字符串拼 `/usr/local/...`，而 `join` 在 Windows 上产
 * 反斜杠——「存在的路径」与「查的路径」对不上（`expected false to be true`，
 * 另几条直接比出 `\usr\local\...`）。
 *
 * **第二次**（2 条红）：改成 `join` 之后**仍然红**，因为 Windows 上**以单个 `\` 开头的
 * 路径是「盘符相对」**：`join('/usr/local/lib', …)` 产 `\usr\local\lib\…`（无盘符），
 * 而产品代码对显式参数调 `resolve()`，`resolve('\usr\local\…')` 会**补上当前盘符**
 * 变成 `D:\usr\local\…`——两者不等，于是 `exists` 查不到、`dir` 返回 `null`
 * （实测报 `expected null to be '\usr\local\lib\node_modules\@deepseek…'`）。
 *
 * 所以夹具的**根**必须用 `resolve()` 建立（与产品代码同一个调用），子路径再用 `join`：
 * `resolve` 对已解析的绝对路径幂等，于是「夹具」与「代码里 resolve 之后」按构造成立。
 *
 * 这与 `scripts/test/chrome-path.test.ts` 在 2026-10-03 踩的是**同一个坑的两种形态**
 * （那边记着「期望值也用 `path.join` 拼，这样在哪个平台跑都对（不写死分隔符）」）。
 * 产品代码 `dsh-app-boot.mjs` 本身**没有**这个问题——它全程用 `join` / `resolve`，
 * 错的只是夹具。
 */
const GLOBAL = resolve('/usr/local/lib/node_modules')
const DSH_PKG = join(GLOBAL, '@deepseek-ai', 'dsh')
const APP_BOOT = join(DSH_PKG, 'node_modules', '@deepseek-ai', 'dsh-app-boot')
const APP_BOOT_FILES = [join(APP_BOOT, 'package.json'), join(APP_BOOT, 'lib', 'index.js')]

describe('isUsableAppBoot：必须同时有 package.json 与 lib/index.js', () => {
  it('两样都有 → 可用', () => {
    expect(isUsableAppBoot(APP_BOOT, fakeFs(APP_BOOT_FILES))).toBe(true)
  })

  it('**只有目录（缺 lib/index.js）→ 不可用**（那正是 --app-boot 要 import 的入口）', () => {
    expect(isUsableAppBoot(APP_BOOT, fakeFs([join(APP_BOOT, 'package.json')]))).toBe(false)
  })

  it('只有 lib/index.js 没有 package.json → 不可用', () => {
    expect(isUsableAppBoot(APP_BOOT, fakeFs([join(APP_BOOT, 'lib', 'index.js')]))).toBe(false)
  })

  it('空串 / 非字符串 → 不可用', () => {
    expect(isUsableAppBoot('', fakeFs([]))).toBe(false)
    expect(isUsableAppBoot(undefined, fakeFs([]))).toBe(false)
  })
})

describe('appBootFromDshBin：从 dsh 真身推出判定器目录', () => {
  it('标准布局：`<root>/@deepseek-ai/dsh/lib/bin.js` → 包内 node_modules', () => {
    const bin = join(DSH_PKG, 'lib', 'bin.js')
    expect(appBootFromDshBin(bin, { realpath: (p) => p })).toBe(APP_BOOT)
  })

  it('**先解符号链接**（`which dsh` 给的是链接，不是真身）', () => {
    const link = join('/usr/local/bin', 'dsh')
    const real = join(DSH_PKG, 'lib', 'bin.js')
    expect(appBootFromDshBin(link, { realpath: () => real })).toBe(APP_BOOT)
  })

  it('realpath 抛错（路径不存在）→ null，不抛', () => {
    const boom = () => {
      throw new Error('ENOENT')
    }
    expect(appBootFromDshBin('/nope/dsh', { realpath: boom })).toBeNull()
  })

  it('形态不认识（空串 / 根路径）→ null', () => {
    expect(appBootFromDshBin('', { realpath: (p) => p })).toBeNull()
    expect(appBootFromDshBin('/dsh', { realpath: () => '/' })).toBeNull()
  })
})

describe('appBootCandidatesFromDshBin：两种 npm 布局都要给候选', () => {
  const bin = join(DSH_PKG, 'lib', 'bin.js')
  const HOISTED = join(GLOBAL, '@deepseek-ai', 'dsh-app-boot')

  it('先 vendored（本机实测的布局），再 hoisted（npm 提升）', () => {
    expect(appBootCandidatesFromDshBin(bin, { realpath: (p) => p })).toEqual([APP_BOOT, HOISTED])
  })

  it('**hoisted 布局可用时也能命中**（只认 vendored 会在 CI 上定位失败）', () => {
    const r = findAppBoot({
      env: {},
      whichDsh: () => bin,
      realpath: (p) => p,
      // 只有提升布局存在
      exists: (p) => p === join(HOISTED, 'package.json') || p === join(HOISTED, 'lib', 'index.js'),
    })
    expect(r.dir).toBe(HOISTED)
    expect(r.source).toBe('dsh-bin')
  })

  it('npm root -g 那一级也试提升布局（`<root>/@deepseek-ai/dsh-app-boot`）', () => {
    const r = findAppBoot({
      env: {},
      whichDsh: () => null,
      npmRootG: () => GLOBAL,
      readdir: () => ['dsh'],
      exists: (p) => p === join(HOISTED, 'package.json') || p === join(HOISTED, 'lib', 'index.js'),
    })
    expect(r.dir).toBe(HOISTED)
    expect(r.source).toBe('npm-root-g')
  })

  it('形态不认识 → 空数组', () => {
    expect(appBootCandidatesFromDshBin('', { realpath: (p) => p })).toEqual([])
    expect(appBootCandidatesFromDshBin('/dsh', { realpath: () => '/' })).toEqual([])
  })
})

describe('dshPackageRootsUnder：列出全局根下所有 dsh 安装', () => {
  it('挑出 dsh 与 dsh-*，忽略别的 scope 包', () => {
    const readdir = () => ['dsh', 'dsh-tools', 'dsh-app-boot', 'other-pkg', '.bin']
    const roots = dshPackageRootsUnder(GLOBAL, { readdir })
    expect(roots).toEqual([
      join(GLOBAL, '@deepseek-ai', 'dsh'),
      join(GLOBAL, '@deepseek-ai', 'dsh-tools'),
      join(GLOBAL, '@deepseek-ai', 'dsh-app-boot'),
    ])
  })

  it('scope 目录不存在 → 空数组，不抛', () => {
    const boom = () => {
      throw new Error('ENOENT')
    }
    expect(dshPackageRootsUnder(GLOBAL, { readdir: boom })).toEqual([])
  })
})

describe('findAppBoot：三级优先级与「点了名就只认它」', () => {
  it('① 显式参数命中 → source=explicit', () => {
    const r = findAppBoot({ explicit: APP_BOOT, ...fakeFs(APP_BOOT_FILES) })
    expect(r.dir).toBe(APP_BOOT)
    expect(r.source).toBe('explicit')
  })

  it('**① 显式参数指错 → dir=null 且不回落到搜索**（点了名却悄悄换一个是运气）', () => {
    // 自动搜索本可命中（whichDsh 与 npmRootG 都指向真实位置），但显式参数给了就必须只认它
    const r = findAppBoot({
      explicit: '/tmp/nope',
      whichDsh: () => join(DSH_PKG, 'lib', 'bin.js'),
      npmRootG: () => GLOBAL,
      realpath: (p) => p,
      ...fakeFs(APP_BOOT_FILES),
    })
    expect(r.dir).toBeNull()
    expect(r.source).toBe('explicit')
  })

  it('② 环境变量命中 → source=env', () => {
    const r = findAppBoot({ env: { [APP_BOOT_ENV_VAR]: APP_BOOT }, ...fakeFs(APP_BOOT_FILES) })
    expect(r.dir).toBe(APP_BOOT)
    expect(r.source).toBe('env')
  })

  it('**② 环境变量指错 → dir=null 且不回落到搜索**（2026-10-04 实测过的静默降级）', () => {
    const r = findAppBoot({
      env: { [APP_BOOT_ENV_VAR]: '/tmp/also-missing' },
      whichDsh: () => join(DSH_PKG, 'lib', 'bin.js'),
      npmRootG: () => GLOBAL,
      realpath: (p) => p,
      ...fakeFs(APP_BOOT_FILES),
    })
    expect(r.dir, '自动搜索本可命中，但 env 点了名就该失败').toBeNull()
    expect(r.source).toBe('env')
  })

  it('③ 从 dsh 真身推导 → source=dsh-bin', () => {
    const r = findAppBoot({
      env: {},
      whichDsh: () => join(DSH_PKG, 'lib', 'bin.js'),
      realpath: (p) => p,
      ...fakeFs(APP_BOOT_FILES),
    })
    expect(r.dir).toBe(APP_BOOT)
    expect(r.source).toBe('dsh-bin')
  })

  it('**③ dsh-bin 优先于 npm root -g**（nvm 下两者可能来自不同 node 版本）', () => {
    const otherGlobal = '/other/node/lib/node_modules'
    const otherAppBoot = join(otherGlobal, '@deepseek-ai', 'dsh', 'node_modules', '@deepseek-ai', 'dsh-app-boot')
    const r = findAppBoot({
      env: {},
      whichDsh: () => join(DSH_PKG, 'lib', 'bin.js'),
      npmRootG: () => otherGlobal,
      realpath: (p) => p,
      ...fakeFs([...APP_BOOT_FILES, join(otherAppBoot, 'package.json'), join(otherAppBoot, 'lib', 'index.js')]),
    })
    expect(r.dir, '两个候选都在时，要选 dsh 真身那一份').toBe(APP_BOOT)
    expect(r.source).toBe('dsh-bin')
  })

  it('④ dsh-bin 不命中时兜底 npm root -g → source=npm-root-g', () => {
    const r = findAppBoot({
      env: {},
      whichDsh: () => null,
      npmRootG: () => GLOBAL,
      readdir: () => ['dsh'],
      ...fakeFs(APP_BOOT_FILES),
    })
    expect(r.dir).toBe(APP_BOOT)
    expect(r.source).toBe('npm-root-g')
  })

  it('全都找不到 → dir=null，且 tried 里留下试过的路径', () => {
    const r = findAppBoot({
      env: {},
      whichDsh: () => join(DSH_PKG, 'lib', 'bin.js'),
      npmRootG: () => GLOBAL,
      realpath: (p) => p,
      readdir: () => ['dsh'],
      exists: () => false,
    })
    expect(r.dir).toBeNull()
    expect(r.tried.length, '要留下痕迹，否则没人知道该建什么').toBeGreaterThan(0)
  })

  it('which 与 npm 都不可用（未装 dsh）→ dir=null，tried 为空', () => {
    const r = findAppBoot({ env: {}, whichDsh: () => null, npmRootG: () => null, exists: () => false })
    expect(r.dir).toBeNull()
    expect(r.tried).toEqual([])
  })

  it('真实环境（本机若装了 dsh，应能定位到一份可用的判定器）', () => {
    const r = findAppBoot()
    if (r.dir === null) {
      // 没装 dsh 的环境（例如只跑单测的容器）不算失败——CI 的 mount-smoke job 会装
      expect(r.tried).toBeDefined()
      return
    }
    expect(isUsableAppBoot(r.dir)).toBe(true)
    expect(['env', 'dsh-bin', 'npm-root-g']).toContain(r.source)
  })
})

describe('describeAppBootSearch：找不到时要能说清试过哪些路径', () => {
  it('列出每条路径', () => {
    const text = describeAppBootSearch(['/a', '/b'])
    expect(text).toContain('/a')
    expect(text).toContain('/b')
  })

  it('空列表时给一句人话（而不是空字符串）', () => {
    expect(describeAppBootSearch([])).toContain('没有试过任何路径')
    expect(describeAppBootSearch(undefined)).toContain('没有试过任何路径')
  })
})

describe('Windows 分支**真的执行**（注入 path.win32，而不是在 macOS 上推演）', () => {
  /*
   * 2026-10-04 的教训：这个文件的 Windows 相关夹具在 CI 上来回红了两次，两次都是
   * 「在 macOS 上推演 path.win32 的行为」推错了。而本仓 chrome-path.mjs 早就给出正解
   * ——把平台做成可注入的，于是 Windows 分支能在任何平台上**真的跑**。
   *
   * 下面这些用例用 win32 的 join/dirname/resolve 真算一遍，断言的是**Windows 上的行为**。
   */
  const win = path.win32
  const opts = { pathImpl: win }
  // Windows 上的全局安装根（合法形态：盘符在字符串开头）
  const WIN_GLOBAL = 'C:\\Users\\u\\AppData\\Roaming\\npm\\node_modules'
  const WIN_DSH = win.join(WIN_GLOBAL, '@deepseek-ai', 'dsh')
  const WIN_BIN = win.join(WIN_DSH, 'lib', 'bin.js')
  const WIN_VENDORED = win.join(WIN_DSH, 'node_modules', '@deepseek-ai', 'dsh-app-boot')
  const WIN_HOISTED = win.join(WIN_GLOBAL, '@deepseek-ai', 'dsh-app-boot')

  it('从 bin 推导出两种布局的候选（顺序：vendored 在前）', () => {
    const got = appBootCandidatesFromDshBin(WIN_BIN, { realpath: (p) => p, ...opts })
    expect(got).toEqual([WIN_VENDORED, WIN_HOISTED])
  })

  it('两种布局都能被 isUsableAppBoot 认出（查的是 package.json 与 lib/index.js）', () => {
    const files = [
      win.join(WIN_VENDORED, 'package.json'),
      win.join(WIN_VENDORED, 'lib', 'index.js'),
    ]
    expect(isUsableAppBoot(WIN_VENDORED, { exists: (p) => files.includes(p), ...opts })).toBe(true)
    expect(isUsableAppBoot(WIN_HOISTED, { exists: (p) => files.includes(p), ...opts })).toBe(false)
  })

  it('findAppBoot 在 Windows 形态下命中 vendored（显式参数不经过 resolve 二次改写）', () => {
    const files = [
      win.join(WIN_VENDORED, 'package.json'),
      win.join(WIN_VENDORED, 'lib', 'index.js'),
    ]
    const r = findAppBoot({ explicit: WIN_VENDORED, exists: (p) => files.includes(p), ...opts })
    expect(r.dir).toBe(WIN_VENDORED)
    expect(r.source).toBe('explicit')
  })

  it('findAppBoot 从 Windows 的 which dsh 结果推导（dsh-bin 来源）', () => {
    const files = [
      win.join(WIN_VENDORED, 'package.json'),
      win.join(WIN_VENDORED, 'lib', 'index.js'),
    ]
    const r = findAppBoot({
      env: {},
      whichDsh: () => WIN_BIN,
      realpath: (p) => p,
      exists: (p) => files.includes(p),
      ...opts,
    })
    expect(r.dir).toBe(WIN_VENDORED)
    expect(r.source).toBe('dsh-bin')
  })

  it('findAppBoot 兜底 npm root -g 时也试 Windows 的提升布局', () => {
    const files = [
      win.join(WIN_HOISTED, 'package.json'),
      win.join(WIN_HOISTED, 'lib', 'index.js'),
    ]
    const r = findAppBoot({
      env: {},
      whichDsh: () => null,
      npmRootG: () => WIN_GLOBAL,
      readdir: () => ['dsh'],
      exists: (p) => files.includes(p),
      ...opts,
    })
    expect(r.dir).toBe(WIN_HOISTED)
    expect(r.source).toBe('npm-root-g')
  })

  it('dshPackageRootsUnder 在 Windows 上拼出反斜杠路径', () => {
    const roots = dshPackageRootsUnder(WIN_GLOBAL, { readdir: () => ['dsh', 'other'], ...opts })
    expect(roots).toEqual([win.join(WIN_GLOBAL, '@deepseek-ai', 'dsh')])
  })
})
