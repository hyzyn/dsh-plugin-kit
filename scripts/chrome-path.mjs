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

/** 各平台按**可能命中的概率**排的候选（顺序进测试，是行为的一部分）。 */
export const CHROME_CANDIDATES = {
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  ],
  linux: [
    // GitHub 的 ubuntu runner 镜像自带 Google Chrome（浏览器测试用），所以它排第一
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
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
 * 找一个可用的 Chrome / Chromium 可执行文件。
 *
 * @param options.explicit - `--chrome <path>` 指定的路径（给了就不再搜索；不存在则返回 `null`）。
 * @param options.platform - 注入平台（默认 `process.platform`；测试用它跑 Windows / Linux 分支）。
 * @param options.env - 注入环境变量（默认 `process.env`）。
 * @param options.isFile - 「这个路径是可执行文件吗」（默认真 fs 检查；测试注入假值）。
 * @returns 可执行文件的绝对路径；找不到时 `null`。
 */
export function findChrome(options = {}) {
  const {
    explicit,
    platform = process.platform,
    env = process.env,
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
