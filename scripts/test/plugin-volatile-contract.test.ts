/**
 * volatile 契约守卫（跨包）。
 *
 * ## 契约（正文见 [docs/conventions.md § 插件配置](../../docs/conventions.md#插件配置volatile-是承诺不是标注)）
 *
 * `Config` 里标 `.volatile()` 的字段 = 「**可以热写、且不重挂插件**」。loader 检出「只变了
 * volatile 字段」后只把配置引用**就地改写**、发 `loader/volatile-update`，插件**不会**被重新
 * `apply`。所以声明 volatile 就等于**承诺自己订阅重读**。
 *
 * 不订阅的后果是「**改了不生效**」且**不报错**：写入成功、落盘成功，插件继续用旧值，而
 * `dsh-settings` 的 descriptor 还写着 `applies: "live"`（写死的）。
 *
 * **可达性要说清**：这一版 Web GUI 里**没有**配置面——2026-10-02 真机实测（profile 3082 +
 * 真 Chrome）：插件详情页无表单、「插件配置」页只有 8 张客户端卡片、「内置插件」页是只读清单，
 * 且全安装没有客户端代码消费 `autoGenerate`。所以这条义务目前是**潜伏**的：触发它的写入方
 * （`settings.update` RPC、配置编辑器）仍在，只是 GUI 里够不着。devfront 那次违背因此是
 * **契约违背**（与 docker / tty / codegraph 不一致），不是已被用户撞到的故障。
 *
 * ## 为什么是静态守卫
 *
 * 这是「**A 文件声明 + B 文件订阅**」的一致性：跑起来才验得到，而且要真宿主 + 真配置页。
 * 而判据本身完全静态——**有 volatile 字段的包，源码里必须出现订阅**。仓库里这条规矩原先只
 * 活在三个包的实现里（docker / tty / codegraph 各抄一遍），没有任何东西守着它，于是 devfront
 * 漏了、而且漏得没人发现——**这正是一条没有守卫的规矩会漂掉的实证**。
 *
 * ## 刻意不守的东西
 *
 * 不检查 `plainConfig()`：只用 `scope.get()` 取值的插件本来就不需要它（那份投影已经是纯值），
 * 硬要求会造出一条在合法写法上误伤的死规矩。也不检查订阅的**行为正确性**（重读到没有、拆干净
 * 没有）——那是各包自己的用例该钉的，跨包静态判据只能守「有没有订阅」这一层。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..', '..')
const packagesDir = join(root, 'packages')

/** 去掉注释：**只在注释里提一句事件名不算订阅**（那正是最容易骗过静态判据的写法）。 */
export function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
}

/** 递归取下该包 `src/` 下所有 `.ts` 源码（拼接；守卫只需要「整包里出现过什么」）。 */
function readPackageSource(pkg: string): string {
  const out: string[] = []
  const walk = (dir: string): void => {
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      return
    }
    for (const entry of entries) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) walk(full)
      else if (entry.endsWith('.ts')) out.push(readFileSync(full, 'utf8'))
    }
  }
  walk(join(packagesDir, pkg, 'src'))
  return out.join('\n')
}

/** 该包声明了 volatile 字段吗（schemastery 的 `.volatile()` 调用，注释不算）。 */
export function hasVolatileConfig(code: string): boolean {
  return /\.volatile\(\)/.test(stripComments(code))
}

/**
 * 该包订阅了 volatile 变更吗。
 *
 * 两种合法写法：直接 `ctx.on('loader/volatile-update', …)`，或走 kit 的
 * `settingsEntryScope(...).onChanged(...)`（后者把事件名藏在契约里，是推荐路径）。
 */
export function hasVolatileSubscription(code: string): boolean {
  const body = stripComments(code)
  if (body.includes('loader/volatile-update')) return true
  return body.includes('settingsEntryScope') && /\.onChanged\s*\(/.test(body)
}

/** 声明了 volatile 字段的包 = 必须满足契约的包。 */
function packagesWithVolatileConfig(): string[] {
  const found: string[] = []
  for (const pkg of readdirSync(packagesDir, { withFileTypes: true })) {
    if (!pkg.isDirectory()) continue
    if (hasVolatileConfig(readPackageSource(pkg.name))) found.push(pkg.name)
  }
  return found.sort()
}

describe('volatile 契约：声明了 volatile 就必须订阅重读（跨包）', () => {
  const declared = packagesWithVolatileConfig()

  it('把「声明了 volatile 的包」都收进来了（新增一个包漏了契约会在这里露出来）', () => {
    expect(declared).toEqual(['codegraph', 'devdata', 'devenv', 'devfront', 'docker', 'tty'])
  })

  for (const name of ['codegraph', 'devdata', 'devenv', 'devfront', 'docker', 'tty']) {
    it(`${name}：声明了 volatile 字段，且订阅了变更`, () => {
      const code = readPackageSource(name)
      expect(hasVolatileConfig(code), `${name} 应当声明过 volatile 字段（名单漂了？）`).toBe(true)
      expect(
        hasVolatileSubscription(code),
        `${name} 声明了 .volatile() 却没有订阅 loader/volatile-update——配置页上改的值会静默不生效`,
      ).toBe(true)
    })
  }

  it('反例：删掉订阅、或只在注释里提一句，都必须被判为不合规', () => {
    const source = readPackageSource('docker')
    expect(hasVolatileSubscription(source)).toBe(true)

    // ① 真删掉订阅（模拟 devfront 原先的形态）→ 必须被抓住
    const removed = source.replace(/scope\.onChanged\s*\(/g, 'void (')
    expect(hasVolatileSubscription(removed)).toBe(false)

    // ② 只在注释里写事件名 → 不算数（否则这条守卫会被一句注释骗过去）
    expect(hasVolatileSubscription("// 记得订阅 loader/volatile-update 重读\n")).toBe(false)
    expect(hasVolatileSubscription("/* settingsEntryScope(...).onChanged(...) */\n")).toBe(false)

    // ③ 有 volatile 字段但整包没有订阅 → 正是要拦的形态
    const fake = "export const Config = z.object({ enabled: z.boolean().default(true).volatile() })\n"
    expect(hasVolatileConfig(fake)).toBe(true)
    expect(hasVolatileSubscription(fake)).toBe(false)
  })
})
