/**
 * `scripts/chrome-path.mjs` 的用例。
 *
 * 为什么要有：Windows / Linux 的候选分支在 macOS 开发机上**天然跑不到**，而 CI 跑的是
 * Linux——正是这段代码真正生效的地方。所以 platform 与「文件在不在」都注入，让三条平台
 * 分支在任何机器上都能被走一遍（与 `dsh-exec.test.ts` 同一条理由）。
 */
import { describe, expect, it } from 'vitest'
import {
  CHROME_CANDIDATES,
  CHROME_ENV_VARS,
  PLAYWRIGHT_CACHE_DIRS,
  describeChromeSearch,
  findChrome,
  playwrightChromeCandidates,
} from '../chrome-path.mjs'

/** 造一个「只有这些路径存在」的假文件系统。 */
const only = (...paths) => (candidate) => paths.includes(candidate)

describe('findChrome：优先级', () => {
  it('显式 --chrome 命中就用它', () => {
    const found = findChrome({ explicit: '/custom/chrome', platform: 'linux', isFile: only('/custom/chrome') })
    expect(found).toBe('/custom/chrome')
  })

  it('显式 --chrome 不存在 → null，且**不回落**到别的浏览器', () => {
    // 「用户点了名却悄悄换一个」会让「我验的是哪个 Chrome」变成运气
    const found = findChrome({
      explicit: '/nope/chrome',
      platform: 'linux',
      isFile: only('/usr/bin/google-chrome'),
    })
    expect(found).toBeNull()
  })

  it('环境变量优先于平台默认候选，且 CHROME_PATH 先于 CHROME_BIN', () => {
    const viaPath = findChrome({
      platform: 'linux',
      env: { CHROME_PATH: '/from/path', CHROME_BIN: '/from/bin' },
      isFile: only('/from/path', '/from/bin', '/usr/bin/google-chrome'),
    })
    expect(viaPath).toBe('/from/path')

    const viaBin = findChrome({
      platform: 'linux',
      env: { CHROME_BIN: '/from/bin' },
      isFile: only('/from/bin', '/usr/bin/google-chrome'),
    })
    expect(viaBin).toBe('/from/bin')
  })

  it('环境变量指到不存在的路径时**跳过它**，继续找平台候选（不是直接失败）', () => {
    const found = findChrome({
      platform: 'linux',
      env: { CHROME_PATH: '/stale/chrome' },
      isFile: only('/usr/bin/google-chrome'),
    })
    expect(found).toBe('/usr/bin/google-chrome')
  })

  it('空字符串的环境变量按「没设」处理', () => {
    const found = findChrome({ platform: 'linux', env: { CHROME_PATH: '' }, isFile: only('/usr/bin/google-chrome') })
    expect(found).toBe('/usr/bin/google-chrome')
  })
})

describe('findChrome：平台候选', () => {
  it('Linux：候选里的每一个都能被选中（顺序即优先级，逐项验证不是死列表）', () => {
    for (const candidate of CHROME_CANDIDATES.linux) {
      expect(findChrome({ platform: 'linux', env: {}, isFile: only(candidate) }), candidate).toBe(candidate)
    }
  })

  it('Linux：多个都在时取候选表里靠前的那个（runner 镜像自带 google-chrome）', () => {
    const found = findChrome({
      platform: 'linux',
      env: {},
      isFile: only('/usr/bin/chromium', '/usr/bin/google-chrome'),
    })
    expect(found).toBe('/usr/bin/google-chrome')
  })

  it('Windows：候选是 .exe 路径，能找到（这条分支在 macOS 上跑不到，所以必须有假 fs）', () => {
    const target = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    expect(findChrome({ platform: 'win32', env: {}, isFile: only(target) })).toBe(target)
  })

  it('macOS：App 包内的可执行文件能被找到', () => {
    const target = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    expect(findChrome({ platform: 'darwin', env: {}, isFile: only(target) })).toBe(target)
  })

  it('GitHub ubuntu runner 镜像的真实形态：/usr/bin/google-chrome 命中（挂载车道的 C 段靠它）', () => {
    /*
     * 2026-10-03 复核 runner-images 的 install-google-chrome.sh：它 apt 装 google-chrome-stable，
     * 并把 `CHROME_BIN=/usr/bin/google-chrome` 写进 /etc/environment。这条钉住「CI 腿找得到浏览器」
     * 这个前提——找不到时 C 段会按设计 FAIL（不是 SKIP），整条车道红。
     */
    expect(findChrome({ platform: 'linux', env: {}, isFile: only('/usr/bin/google-chrome') }))
      .toBe('/usr/bin/google-chrome')
    // 同一个脚本把 CHROME_BIN 写进环境；那条分支独立命中同一个路径
    expect(findChrome({
      platform: 'linux',
      env: { CHROME_BIN: '/usr/bin/google-chrome' },
      isFile: only('/usr/bin/google-chrome'),
    })).toBe('/usr/bin/google-chrome')
  })

  it('镜像里的 Chromium 走 /usr/local/share/chromium（不是发行版包，which 找不到它）', () => {
    /*
     * 同一个安装脚本把 Chromium 解压到 chromium-browser-snapshots 的 `chrome-linux/chrome`。
     * 这个路径此前不在候选表里——「镜像只装了 Chromium / 用户拆掉了 Chrome」时会误报找不到。
     */
    const target = '/usr/local/share/chromium/chrome-linux/chrome'
    expect(findChrome({ platform: 'linux', env: {}, isFile: only(target) })).toBe(target)
  })

  it('Chrome 与 Chromium 都在时优先 Google Chrome（候选表顺序即优先级）', () => {
    const found = findChrome({
      platform: 'linux',
      env: {},
      isFile: only('/usr/bin/google-chrome', '/usr/local/share/chromium/chrome-linux/chrome'),
    })
    expect(found).toBe('/usr/bin/google-chrome')
  })

  it('未知平台 → null（不抛错）', () => {
    expect(findChrome({ platform: 'aix', env: {}, isFile: () => true })).toBeNull()
  })

  it('一个都没有 → null，且 describeChromeSearch 说明了找过哪些地方', () => {
    expect(findChrome({ platform: 'linux', env: {}, isFile: () => false })).toBeNull()
    const text = describeChromeSearch('linux')
    expect(text).toContain('CHROME_PATH')
    expect(text).toContain('/usr/bin/google-chrome')
  })
})

describe('真实本机（现算，不是假 fs）', () => {
  it('本机（macOS 开发机）确实能找到一个浏览器；找不到则说明这台机器跑不了渲染验收', () => {
    const found = findChrome()
    // 这条不做断言式失败：验收脚本自己会在找不到时给出可读的 FAIL。
    // 这里只断言「返回的要么是 null、要么真能过 X_OK 检查」——防止返回一个假路径。
    if (found !== null) {
      expect(typeof found).toBe('string')
      expect(findChrome({ explicit: found })).toBe(found)
    }
  })
})

describe('playwrightChromeCandidates：收口原先手抄两份的那段扫描', () => {
  /** 造一个假缓存目录树：`{ '<base>': ['chromium-1234', ...] }`。 */
  const fakeCache = (tree) => ({
    readdir: (dir) => {
      const key = Object.keys(tree).find((base) => dir.endsWith(base))
      if (key === undefined) throw new Error('ENOENT ' + dir)
      return tree[key]
    },
    exists: (dir) => Object.keys(tree).some((base) => dir.endsWith(base)),
  })

  it('扫到 chromium-<数字> 目录下的三种平台布局', () => {
    const { readdir, exists } = fakeCache({ 'ms-playwright': ['chromium-1234'] })
    const found = playwrightChromeCandidates({ home: '/home/u', platform: 'darwin', readdir, exists })
    expect(found).toHaveLength(4)
    expect(found[0]).toContain('chrome-mac-arm64')
    expect(found.some((p) => p.endsWith('chrome-linux/chrome'))).toBe(true)
    expect(found.some((p) => p.endsWith('chrome-win/chrome.exe'))).toBe(true)
  })

  it('**版本号大的排前面**（numeric 排序，不是裸字符串比较）', () => {
    // 裸字符串比较下 'chromium-999' > 'chromium-1234'（'9' > '1'），那是反的
    const { readdir, exists } = fakeCache({ 'ms-playwright': ['chromium-999', 'chromium-1234'] })
    const found = playwrightChromeCandidates({ home: '/home/u', platform: 'darwin', readdir, exists })
    expect(found[0]).toContain('chromium-1234')
  })

  it('只认 `chromium-<数字>`：headless shell / ffmpeg 那些不是浏览器', () => {
    const { readdir, exists } = fakeCache({
      'ms-playwright': ['chromium_headless_shell-1234', 'ffmpeg-1011', 'chromium-1234'],
    })
    const found = playwrightChromeCandidates({ home: '/home/u', platform: 'darwin', readdir, exists })
    expect(found).toHaveLength(4)
    expect(found.every((p) => p.includes('chromium-1234'))).toBe(true)
  })

  it('只扫**当前平台**的缓存目录（darwin 不碰 .cache/ms-playwright）', () => {
    const { readdir, exists } = fakeCache({
      'Library/Caches/ms-playwright': ['chromium-111'],
      '.cache/ms-playwright': ['chromium-222'],
    })
    const onMac = playwrightChromeCandidates({ home: '/home/u', platform: 'darwin', readdir, exists })
    expect(onMac.every((p) => p.includes('Library/Caches'))).toBe(true)

    const onLinux = playwrightChromeCandidates({ home: '/home/u', platform: 'linux', readdir, exists })
    expect(onLinux.every((p) => p.includes('.cache/ms-playwright'))).toBe(true)
  })

  it('缓存目录不存在 → 空数组（不是抛错：没装 playwright 是正常状态）', () => {
    const found = playwrightChromeCandidates({
      home: '/home/u',
      platform: 'linux',
      readdir: () => {
        throw new Error('ENOENT')
      },
      exists: () => false,
    })
    expect(found).toEqual([])
  })

  it('三个平台都有缓存目录条目（Windows 那条是 %LOCALAPPDATA% 形态）', () => {
    expect(PLAYWRIGHT_CACHE_DIRS.map(([, p]) => p).sort()).toEqual(['darwin', 'linux', 'win32'])
    expect(PLAYWRIGHT_CACHE_DIRS.some(([rel]) => rel.includes('AppData/Local'))).toBe(true)
  })
})

describe('findChrome：extraCandidates 插在环境变量之后、平台候选之前', () => {
  it('没给 extraCandidates 时行为一字未变（既有调用方零影响）', () => {
    const found = findChrome({ platform: 'linux', env: {}, isFile: only('/usr/bin/google-chrome') })
    expect(found).toBe('/usr/bin/google-chrome')
  })

  it('extraCandidates 优先于平台候选（playwright 缓存那个确定性版本要赢过随便装的 Chrome）', () => {
    const found = findChrome({
      platform: 'linux',
      env: {},
      extraCandidates: ['/pw/chrome'],
      isFile: only('/pw/chrome', '/usr/bin/google-chrome'),
    })
    expect(found).toBe('/pw/chrome')
  })

  it('环境变量仍优先于 extraCandidates（CHROME_PATH 是用户显式指定的）', () => {
    const found = findChrome({
      platform: 'linux',
      env: { CHROME_PATH: '/from/env' },
      extraCandidates: ['/pw/chrome'],
      isFile: only('/from/env', '/pw/chrome'),
    })
    expect(found).toBe('/from/env')
  })

  it('extraCandidates 不存在时**继续往下找**（不是直接失败）', () => {
    const found = findChrome({
      platform: 'linux',
      env: {},
      extraCandidates: ['/nope/chrome'],
      isFile: only('/usr/bin/google-chrome'),
    })
    expect(found).toBe('/usr/bin/google-chrome')
  })

  it('也接受函数形态（惰性求值：找不到浏览器时才去读目录）', () => {
    let called = false
    const found = findChrome({
      platform: 'linux',
      env: { CHROME_PATH: '/from/env' },
      extraCandidates: () => {
        called = true
        return ['/pw/chrome']
      },
      isFile: only('/from/env', '/pw/chrome'),
    })
    expect(found).toBe('/from/env')
    expect(called, '环境变量已命中时不该去读缓存目录').toBe(false)
  })
})
