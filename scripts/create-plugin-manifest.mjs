/**
 * 脚手架生成期的 **manifest 收尾**：把 `@hyzyn/dsh-kit` 的钉子写成**现算值**。
 *
 * ## 为什么不能在模板里写死
 *
 * [templates/hello/package.json](../templates/hello/package.json) 曾经钉 `0.3.0`，而 kit 已经是
 * `0.5.2`、其余 10 个消费者全是 `0.5.2` —— 这个漂移**此前无人会红**：
 * [check-kit-pins.mjs](./check-kit-pins.mjs) 的 `collectKitPins()` 只 `readdirSync(packages)`，
 * `templates/` 不在扫描面；模板也不在运行期事实里（`pnpm-workspace.yaml` 只收 `packages/*`，
 * `pnpm-lock.yaml` 对 `templates/hello` 零命中）。
 *
 * 后果不是「模板难看」：`pnpm create-plugin <name>` 会带着那个旧钉子进 `packages/`，全仓立刻
 * 出现两个不同的 kit 钉子；而根 `.npmrc` 的 `link-workspace-packages=true` 只对**范围**生效，
 * 精确钉子不匹配就不 link，于是真去 registry 拉一份旧 kit —— 正是 `kit D11`（模块级单例失效）
 * 要防的那一侧（全文见 [check-kit-pins.mjs](./check-kit-pins.mjs) 的文件头与
 * [RELEASING.md](../RELEASING.md) 发布门槛第 4 条）。
 *
 * 所以生成期的钉子**从 `packages/kit/package.json#version` 现算**。模板里的字面值退化成给人看的
 * 参考，**不再是真相源** —— 模板仍要跟着 bump 改（见 RELEASING.md 的「攒批」那一步），但漏改不会
 * 再让新包带着旧钉子上路。
 *
 * ## 为什么放在 `scripts/` 根、而不是 `scripts/lib/`
 *
 * [vitest.config.ts](../vitest.config.ts) 把两条车道分开：**被用例直接 import 的纯模块**放
 * `scripts/` 根、与脚本同目录（先例 `client-host-url.mjs`），`scripts/lib/` 那份的口径是
 * 真机脚本共享的隔离引导。本模块由 `create-plugin.mjs` 与
 * `scripts/test/create-plugin-manifest.test.ts` 共享，走前者。
 *
 * 本文件**不写 shebang**：它要被 vitest import（本仓实测过「被测试 import 的 `.mjs` 带 shebang +
 * CRLF → 整份套件加载失败」，见 `check-kit-pins.mjs` 的同款注释）。
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { DEPENDENCY_FIELDS, EXACT_VERSION, KIT_NAME } from './check-kit-pins.mjs'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/** 读 kit 自己的版本 —— 生成期钉子的**唯一**真相源。 */
export function readKitVersion(root = REPO_ROOT) {
  return JSON.parse(readFileSync(join(root, 'packages', 'kit', 'package.json'), 'utf8')).version
}

/** 读脚手架模板的 manifest 原文（`applyKitPin` 的真实输入形态）。 */
export function readTemplateManifest(root = REPO_ROOT) {
  return readFileSync(join(root, 'templates', 'hello', 'package.json'), 'utf8')
}

/**
 * 纯函数：把生成出来的 manifest 文本里的 kit 钉子换成 `kitVersion`。
 *
 * 三条判据，都不许「匹配不到就算过」：
 *
 * 1. 文本必须是**合法 JSON**；
 * 2. 它**必须**已经声明了 `@hyzyn/dsh-kit` —— 模板哪天删掉这一条，生成期立刻失败，
 *    而不是静默产出一个没有钉子的包（那正是这道改动要消灭的失败形态）；
 * 3. `kitVersion` 必须是**精确版本**，与守卫同一个正则（`EXACT_VERSION`）—— 避免把
 *    `^0.5.2` / `next` / `workspace:*` 这类会让两个消费者解析到不同版本的写法钉进新包。
 *
 * 输出按本仓既有形态（2 空格缩进 + 结尾换行）重新序列化；键序由 `JSON.parse` 保留，
 * 所以只有钉子会变。
 *
 * @param {string} manifestText 生成出来的 `package.json` 原文
 * @param {string} kitVersion `packages/kit` 的版本
 * @returns {string} 换好钉子的 `package.json` 原文
 */
export function applyKitPin(manifestText, kitVersion) {
  let manifest
  try {
    manifest = JSON.parse(manifestText)
  } catch (error) {
    throw new Error(`生成出来的 package.json 不是合法 JSON：${error.message}`)
  }

  const field = DEPENDENCY_FIELDS.find((candidate) => manifest[candidate]?.[KIT_NAME] !== undefined)
  if (field === undefined) {
    throw new Error(
      `生成出来的 package.json 在 ${DEPENDENCY_FIELDS.join(' / ')} 里都没有 ${KIT_NAME} —— ` +
        '模板里的那一条是这套现算逻辑的锚点，删了就生成不出带钉子的包',
    )
  }

  if (!EXACT_VERSION.test(kitVersion)) {
    throw new Error(`packages/kit 的版本 ${JSON.stringify(kitVersion)} 不是精确版本，不能当钉子`)
  }

  manifest[field][KIT_NAME] = kitVersion
  return `${JSON.stringify(manifest, undefined, 2)}\n`
}
