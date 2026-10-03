/**
 * 「去哪找 Chrome / Chromium」——一个可测的小模块，只干这一件事。
 *
 * ## 为什么不是一个常量了事
 *
 * `chrome-cdp.mjs` 原本只导出一个 macOS 常量（`/Applications/Google Chrome.app/…`），
 * `verify-client-ui.mjs` 里又抄了一份同样的写死路径。本机（macOS）能用，但一旦要有
 * **任何非 macOS** 的调用方——Ubuntu CI 腿、Linux 服务器、Windows——那个常量就永远指不到
 * 可执行文件，而症状是 `Chrome 的 CDP 端点没起来`（看不出「路径根本不存在」）。
 *
 * 顺带把**优先级**明确下来：显式 `--chrome` > 环境变量（`CHROME_PATH` / `CHROME_BIN`，
 * 这两个是社区通行名，容器镜像里常被设）> 平台默认候选。显式给的名字不存在就**返回 null**
 * （而不是继续猜）——用户点了名却悄悄换了另一个浏览器，等于把「我验的是哪个 Chrome」变成运气。
 *
 * ## 为什么单独成文件（与 dsh-exec.mjs 同一条理由）
 *
 * Windows / Linux 的分支在 macOS 开发机上**天然跑不到**，所以把 `platform` 与「文件在不在」
 * 都做成可注入的，让 `scripts/test/chrome-path.test.ts` 在任何平台上都能把
 * 「Windows 的候选路径」「Linux 的候选顺序」跑一遍。
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/** 各平台按**可能命中的概率**排的候选（顺序进测试，是行为的一部分）。 */
export const CHROME_CANDIDATES = {
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  ],
  linux: [
    /*
     * GitHub 的 ubuntu runner 镜像把 Google Chrome 装到这里，并把 `CHROME_BIN` 写成同一个值
     * （runner-images 的 install-google-chrome.sh：`apt-get install google-chrome-stable_current_amd64.deb`
     * + `set_etc_environment_variable "CHROME_BIN" "/usr/bin/google-chrome"`）。所以它排第一，
     * 且环境变量那条分支也会独立命中同一个路径。
     */
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    /*
     * 同一个脚本把 Chromium 解压到 `/usr/local/share/chromium/chrome-linux/chrome`（不是发行版包，
     * 所以 `which chromium` 找不到它）。列在这里是为了「镜像只装了 Chromium / 用户拆掉了 Chrome」
     * 时仍能找到——2026-10-03 复核 runner 镜像安装脚本时补，此前这个路径不在候选表里。
     */
    '/usr/local/share/chromium/chrome-linux/chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
    '/opt/google/chrome/chrome',
  ],
  win32: [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ],
}

/** 环境变量里可以点名浏览器的两个通行名字（顺序即优先级）。 */
export const CHROME_ENV_VARS = ['CHROME_PATH', 'CHROME_BIN']

/**
 * Playwright 下载浏览器缓存的位置（相对 home；顺序即查找顺序）。
 *
 * `packages/tty` / `packages/search` 的 preview 脚本原本各抄了一份「先扫这里、再退回
 * 平台候选」的逻辑——**那份顺序是有意的**：playwright 缓存的 Chrome for Testing 版本确定，
 * 比机器上随便装的 Chrome 更适合当截图基准，所以它排在平台候选之前。
 * 收口成这一个函数时把顺序原样保留（见 `findChrome` 的 `extraCandidates`）。
 *
 * Windows 那条是 `%LOCALAPPDATA%\ms-playwright`（Playwright 官方文档给的位置），
 * 相对路径按 `AppData/Local/...` 拼。
 */
export const PLAYWRIGHT_CACHE_DIRS = [
  ['Library/Caches/ms-playwright', 'darwin'],
  ['.cache/ms-playwright', 'linux'],
  ['AppData/Local/ms-playwright', 'win32'],
]

/** Chrome for Testing 在各平台缓存目录里的相对形态（一个版本目录下三种布局）。 */
const PLAYWRIGHT_BROWSER_PATHS = [
  'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  'chrome-mac/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  'chrome-linux/chrome',
  'chrome-win/chrome.exe',
]

/**
 * 列出 Playwright 缓存里所有可用的 Chrome 候选（**新的排前面**）。
 *
 * 版本目录名形如 `chromium-1234` / `chromium_headless_shell-1234`；后者是 headless shell，
 * **不含完整浏览器**（跑不了需要 DOM/截图的场景），所以只认 `chromium-<数字>` 这一种形态
 * （原有两份手抄版用的就是 `startsWith('chromium')`，但那样会把 headless shell 也收进来，
 * 它的目录结构不同、命中不了下面的浏览器路径，属于无害的多余候选——这里顺手收窄）。
 *
 * @param options.home - home 目录（默认 `os.homedir()`；测试注入）。
 * @param options.platform - 注入平台。
 * @param options.readdir - 「列目录」（默认 `fs.readdirSync`；测试注入）。
 * @param options.exists - 「目录在不在」（默认 `fs.existsSync`；测试注入）。
 * @returns 候选绝对路径数组（按版本目录名**倒序**＝新的优先）。
 */
export function playwrightChromeCandidates(options = {}) {
  const {
    home = os.homedir(),
    platform = process.platform,
    readdir = (dir) => fs.readdirSync(dir),
    exists = (path) => fs.existsSync(path),
  } = options

  const found = []
  for (const [rel, forPlatform] of PLAYWRIGHT_CACHE_DIRS) {
    if (forPlatform !== platform) continue
    const base = path.join(home, rel)
    let entries
    try {
      if (!exists(base)) continue
      entries = readdir(base)
    } catch {
      // 读不到就跳过：缓存目录权限异常不该让「找个浏览器」整个失败
      continue
    }
    // 倒序：版本号大的排前面。用 `numeric: true` 而不是裸字符串比较——后者下
    // `chromium-999` 会排在 `chromium-1234` 前面（'9' > '1'），那是反的。
    for (const dir of [...entries].sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))) {
      if (!/^chromium-\d+$/.test(dir)) continue
      for (const browserPath of PLAYWRIGHT_BROWSER_PATHS) {
        found.push(path.join(base, dir, browserPath))
      }
    }
  }
  return found
}

/**
 * 找一个可用的 Chrome / Chromium 可执行文件。
 *
 * @param options.explicit - `--chrome <path>` 指定的路径（给了就不再搜索；不存在则返回 `null`）。
 * @param options.platform - 注入平台（默认 `process.platform`；测试用它跑 Windows / Linux 分支）。
 * @param options.env - 注入环境变量（默认 `process.env`）。
 * @param options.isFile - 「这个路径是可执行文件吗」（默认真 fs 检查；测试注入假值）。
 * @param options.extraCandidates - 插在**环境变量之后、平台候选之前**的额外候选（数组或返回数组的函数）。
 *   存在的理由是 playwright 缓存那条顺序（见 `playwrightChromeCandidates` 的注释：确定性版本
 *   要优先于机器上随便装的 Chrome）。**默认空**，所以既有调用方的行为一字未变。
 * @returns 可执行文件的绝对路径；找不到时 `null`。
 */
export function findChrome(options = {}) {
  const {
    explicit,
    platform = process.platform,
    env = process.env,
    extraCandidates = [],
    isFile = (candidate) => {
      try {
        // 只判「文件且可执行」：EACCES 的路径 spawn 起来只在运行时才炸
        fs.accessSync(candidate, fs.constants.X_OK)
        return fs.statSync(candidate).isFile()
      } catch {
        return false
      }
    },
  } = options

  // 显式点名：认它，但**不替用户猜**（名字不对就是找不到，别悄悄换一个）
  if (explicit !== undefined && explicit !== '') return isFile(explicit) ? explicit : null

  for (const name of CHROME_ENV_VARS) {
    const fromEnv = env[name]
    if (typeof fromEnv === 'string' && fromEnv !== '' && isFile(fromEnv)) return fromEnv
  }

  const extra = typeof extraCandidates === 'function' ? extraCandidates() : extraCandidates
  for (const candidate of extra ?? []) {
    if (isFile(candidate)) return candidate
  }

  const candidates = CHROME_CANDIDATES[platform] ?? []
  for (const candidate of candidates) {
    if (isFile(candidate)) return candidate
  }
  return null
}

/** 给人类看的一句话（失败时用来说明「找过哪些地方」）。 */
export function describeChromeSearch(platform = process.platform) {
  return `找过的位置：${CHROME_ENV_VARS.join(' / ')} 环境变量，以及 ${(CHROME_CANDIDATES[platform] ?? []).join('、') || '(该平台无内置候选)'}`
}
