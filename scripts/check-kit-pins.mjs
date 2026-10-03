/**
 * `@hyzyn/dsh-kit` 钉子守卫：**一个宿主进程里只允许解析出一份 kit**。
 *
 * ## 为什么这是一条正确性判据，而不是整洁度
 *
 * kit 是共享库，而它修 `kit D11` 用的手段是**模块级单例**：`sharedGrantStore()` 的实例表
 * （`packages/kit/src/grant-store.ts`）与能力判定源的绑定（`packages/kit/src/capability.ts`）
 * 都挂在模块作用域上。所以「一个进程一份 kit」是那个修复成立的前提——两份 kit 就是两套单例，
 * `kit D11` 的症状会原样回来：在一个卡片上完成授权，另一个卡片仍报未授权（连撤销按钮都不渲染），
 * 而方向恰好是危险的那一侧。
 *
 * 而 pnpm 的 hoisted 布局（DSH 给 profile 选的 `nodeLinker`）只能把**一个**版本提升到顶层，
 * 另一个版本会被嵌进消费者自己的 `node_modules`。2026-09-27 的真机报告就是现场：tty 已升到新
 * kit、其余插件还钉着旧 kit，`.modules.yaml` 的 `hoistedLocations` 里两份 kit 各占一行。
 *
 * ## 本仓的做法与这道闸补的洞
 *
 * 做法是「同批发布、钉版同步」：一次发布把每个消费者的钉子跟到同一个 kit 版本
 * （见 [RELEASING.md](../RELEASING.md) 的发布门槛）。但那此前**只是一条纪律**——
 * 没有任何脚本检查它，漏掉一个包会一路发到 npm，而 npm 侧看不出问题（装得下，只是两份）。
 *
 * ## 三条判据（都不许「匹配不到就算过」）
 *
 * 1. 声明了 kit 的包必须写**精确版本**。范围（`^` / `~` / `>=`）会让两个消费者解析到不同
 *    版本——正是要拦的事；`workspace:` / `file:` / `link:` / git URL 则会让钉子无法静态判定；
 * 2. 所有消费者的钉子必须**逐字相同**；
 * 3. 那个值必须等于 `packages/kit/package.json` 自己的 `version`（bump 了 kit 就得跟齐消费者）。
 *
 * 不写 shebang：本仓 CI 实测过「被测试 import 的 `.mjs` 带 shebang + CRLF → 整份套件加载失败」，
 * 而本文件要被 `scripts/test/check-kit-pins.test.ts` import（调用方式是 `node scripts/check-kit-pins.mjs`）。
 *
 * 用法：
 *   node scripts/check-kit-pins.mjs            # 有差异则打印并退出 1
 *   node scripts/check-kit-pins.mjs --quiet    # 只打印差异
 */
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/** 共享库包名：插件的唯一非 DSH 运行时依赖（见 docs/architecture.md 的依赖方向）。 */
export const KIT_NAME = '@hyzyn/dsh-kit'

/**
 * 参与判定的字段。
 *
 * ## 为什么 `devDependencies` **也**算（2026-10-01 改，原先不算）
 *
 * 原先的理由是「devDependencies 不进消费者的树」——那对**消费者的安装结果**成立，
 * 但对**本仓这棵树**不成立：pnpm 的 `link-workspace-packages=true` 只在范围匹配得上
 * 本地包版本时才 link，否则**从 registry 拉一份**。也就是说，一个 devDependency 钉着旧 kit，
 * 结果就是**同一个 workspace 树里装了两份 kit**——正是这道闸门要拦的事（见文件头）。
 *
 * 触发这次修改的实例：仓根的 `scripts/` 会用 kit（Chrome CDP 客户端来自
 * `@hyzyn/dsh-kit`），而根清单的 kit 钉子落在 `devDependencies` 里。不改这条判据，
 * 根清单那颗钉子就**不受管辖**：它可以钉着旧版本而闸门照样报绿。
 */
export const DEPENDENCY_FIELDS = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']

/** 精确版本（`0.5.0-rc.1` 合格）。范围 / dist-tag / 协议 / git URL 一律不合格。 */
export const EXACT_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z][0-9A-Za-z.-]*)?$/

/**
 * 读出 kit 自己的版本与全仓所有对它的声明。
 *
 * 目录里没有 `package.json` 就跳过：`packages/` 下可能存在非包的残留目录（历史产物等），
 * 它们不是消费者，也不该让闸门抛异常。
 *
 * **根清单也算消费者**（2026-10-01 补）：仓根的 `scripts/` 会用 kit——例如
 * `verify-client-ui.mjs` 的 Chrome CDP 客户端就来自 `@hyzyn/dsh-kit`。原先只扫 `packages/*`，
 * 于是根清单里那颗钉子**不受这道闸门管辖**：它可以钉着旧版本而闸门照样报绿，
 * 而「一个进程里只允许一份 kit」正是本闸门存在的理由（见文件头）。
 *
 * @param {string} root 仓库根
 * @returns {{ kitVersion: string, pins: { pkg: string, file: string, field: string, spec: string }[] }}
 */
export function collectKitPins(root = REPO_ROOT) {
  const kitVersion = JSON.parse(readFileSync(join(root, 'packages', 'kit', 'package.json'), 'utf8')).version
  const pins = []

  /** 收一份清单里的声明。 */
  const collect = (manifest, file) => {
    for (const field of DEPENDENCY_FIELDS) {
      const spec = manifest[field]?.[KIT_NAME]
      if (spec !== undefined) {
        pins.push({ pkg: manifest.name ?? file, file, field, spec })
      }
    }
  }

  // 根清单
  try {
    collect(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')), 'package.json')
  } catch {
    /* 没有根清单就跳过（子目录里跑时不至于抛） */
  }

  for (const name of readdirSync(join(root, 'packages'))) {
    if (name === 'kit') continue
    let manifest
    try {
      manifest = JSON.parse(readFileSync(join(root, 'packages', name, 'package.json'), 'utf8'))
    } catch {
      continue
    }
    collect(manifest, `packages/${name}/package.json`)
  }
  return { kitVersion, pins }
}

/**
 * 纯判定：只吃「kit 自己的版本 + 全部声明」，不碰文件系统（反例由测试用 fixture 造）。
 *
 * @param {{ kitVersion: string, pins: { pkg: string, file: string, field: string, spec: string }[] }} input
 * @returns {string[]} 差异描述；空数组 = 绿
 */
export function findKitPinViolations({ kitVersion, pins }) {
  const violations = []
  const where = (pin) => `${pin.file}  ${pin.field}["${KIT_NAME}"] = ${JSON.stringify(pin.spec)}`

  const exact = []
  for (const pin of pins) {
    if (EXACT_VERSION.test(pin.spec)) exact.push(pin)
    else violations.push(`${where(pin)}  —— 不是精确版本`)
  }

  const versions = [...new Set(exact.map((pin) => pin.spec))].sort()
  if (versions.length > 1) {
    violations.push(`全仓出现 ${String(versions.length)} 个不同的 kit 钉子：${versions.join(' / ')}`)
    for (const version of versions) {
      const files = exact.filter((pin) => pin.spec === version).map((pin) => pin.file)
      violations.push(`  ${version}：${files.join('、')}`)
    }
  }

  const aligned = versions.length === 1 ? versions[0] : undefined
  if (aligned !== undefined && aligned !== kitVersion) {
    violations.push(`全仓钉子 ${aligned} ≠ packages/kit 的版本 ${kitVersion}（bump 了 kit 就要跟齐消费者）`)
  }

  return violations
}

/** 对真实仓库跑全部判据（返回差异数组；空数组 = 绿）。 */
export function checkRepo(root = REPO_ROOT) {
  return findKitPinViolations(collectKitPins(root))
}

/* CLI（人工核对用；测试走 checkRepo / 各 check* 函数） */
if (process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`) {
  const quiet = process.argv.includes('--quiet')
  const { kitVersion, pins } = collectKitPins()
  const violations = findKitPinViolations({ kitVersion, pins })
  if (!quiet) {
    console.log(`[check-kit-pins] packages/kit 版本 ${kitVersion}；声明了 ${KIT_NAME} 的包共 ${String(pins.length)} 处`)
  }
  for (const violation of violations) console.error(`  ✘ ${violation}`)
  if (violations.length > 0) {
    console.error(`[check-kit-pins] 未通过：kit 的钉子必须在全仓一致且等于 packages/kit 的版本`)
    console.error('两份 kit 会让 kit D11 的模块级单例失效（授权存储 / 能力绑定各一套），')
    console.error('hoisted 布局下同一棵树里两份 kit 各有 hoistedLocations 一行。')
    console.error('修法：把上面点名的包改成本轮 kit 的精确版本，一起 bump、一起发（见 RELEASING.md 发布门槛）。')
    process.exit(1)
  }
  if (!quiet) console.log(`[check-kit-pins] 通过：${String(pins.length)} 处声明都是同一个精确版本 ${kitVersion}`)
}
