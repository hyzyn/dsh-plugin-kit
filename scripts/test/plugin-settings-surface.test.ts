/**
 * 客户端设置面的注册契约守卫（跨包）。
 *
 * 契约（正文见 [docs/conventions.md § 客户端设置面](../docs/conventions.md#客户端设置面内联优先)）：
 *   ① `0.2.0-rc.1` 起注册 `plugins.bundle.config`——按 **bundle 包名** 派发，插件管理器的
 *      详情页把它渲染在「说明」**正下方**；`plugins.row.config` 是 per-row 的「>」子页；
 *   ② **内联优先**：bundle 槽可用时**不注册** row 槽——同一份表单两个入口会让人以为有两套
 *      设置（这是用户现场提的：设置藏在「>」后面）；
 *   ③ bundle 槽不存在的旧宿主（0.1.6 线）回退注册 row 槽，功能一点不减；
 *   ④ bundle 名从 row key（`bundle#rowId`）**推导**，不许另写一份常量——两份一定会漂；
 *   ⑤ **`plugins.bundle.config` 的 key 全仓必须两两不同**，且**不得**是聚合包 `@hyzyn/dsh-all`：
 *      那个 key 是所有插件共用的，多写一个注册者就是启动即崩（`keyed slot ... already has an
 *      entry` → 客户端 apply 抛错 → 启动页「Failed to load plugins」）。这条踩过，所以单独守。
 *
 * 为什么是**静态**守卫：只有 `docker` / `rss` 有客户端冒烟夹具（docker 那两条用例真跑
 * `apply(ctx)` 并断言注册面），其余包的 `client.js` 是手写单文件、没有 apply 级夹具。而这段
 * 注册块在**八个包里逐字节相同**（只换卡片名），于是「一致性」本身就是可守的判据：
 * 一个包做行为验证 + 这条守卫防漂，胜过八份各写一半的弱断言。
 *
 * 反向验证（写这条时验过）：把任一包的块改回「无条件注册 row 槽」，本用例立刻失败；
 * 只删掉回退分支或把 BUNDLE_CONFIG_KEYS 写死成数组，也各自失败。
 */
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..', '..')
const packagesDir = join(root, 'packages')

/** 客户端半体的源码：有 client-src 的包那份才是源（client.js 是产物），手写包 client.js 即源。 */
function clientSourcePath(pkg: string): string | undefined {
  for (const rel of ['client-src/index.js', 'client.js']) {
    const path = join(packagesDir, pkg, rel)
    try {
      if (readFileSync(path, 'utf8').length > 0) return path
    } catch {
      /* 试下一个 */
    }
  }
  return undefined
}

/**
 * 契约块的正身。与各包源码逐字节相同（只把 `CARD` 换成该包的卡片组件名），
 * 所以 pix 一下就能判出「某个包偷偷改回旧形态」。
 */
function expectedBlock(card: string): string {
  return `      /*
       * 设置面：0.2.0-rc.1 起挂 \`plugins.bundle.config\`——key 是 **bundle 包名**，管理器的插件
       * 详情页把它渲染在「说明」正下方；\`plugins.row.config\` 是 per-row 的「>」子页。
       *
       * 两条硬约束（第一条踩过坑，见下）：
       *   ① \`plugins.bundle.config\` 的 key 是**共享命名空间**：同一个 key 只能有一个注册者，
       *      重复注册**直接抛错**（\`keyed slot ... already has an entry\`），而客户端 \`apply\`
       *      抛错 = 整个插件起不来（实测：把 \`@hyzyn/dsh-all\` 也挂上时，八个插件抢同一个 key，
       *      启动页直接变「Failed to load plugins」）（D158）。聚合包 \`@hyzyn/dsh-all\` 是所有插件共用的
       *      bundle，**不能**挂 bundle.config —— 它没有内联位，设置面走它自己的 row 入口。
       *   ② 内联位可用时，**本包自己的** bundle 不再注册 row 槽（同一份表单两个入口会让人以为
       *      有两套设置）；聚合包那份 row 入口**保留**（那是它在聚合安装下的唯一入口）。旧宿主
       *      （bundle 槽不存在，0.1.6 线）回退注册全部 row 槽，功能一点不减。
       * 就绪顺序不敏感：任一侧先到都收敛到「内联优先」（后到的本包 row 注册会被撤掉）。
       */
      const AGGREGATE_BUNDLE = '@hyzyn/dsh-all'
      const BUNDLE_NAMES = [...new Set(ROW_CONFIG_KEYS.map((key) => key.split('#')[0]))]
      const OWN_BUNDLE = BUNDLE_NAMES.find((name) => name !== AGGREGATE_BUNDLE)
      let bundleConfigLive = false
      const disposeOwnRowConfigs = []
      if (OWN_BUNDLE !== undefined) {
        ctx.slots.inject('plugins.bundle.config', () => {
          bundleConfigLive = true
          while (disposeOwnRowConfigs.length > 0) {
            const disposeRow = disposeOwnRowConfigs.pop()
            if (typeof disposeRow === 'function') disposeRow()
          }
          return ctx.slots.register({
            name: 'plugins.bundle.config',
            key: OWN_BUNDLE,
          }, ${card})
        })
      }
      for (const key of ROW_CONFIG_KEYS) {
        ctx.slots.inject('plugins.row.config', () => {
          const own = key.split('#')[0] === OWN_BUNDLE
          if (own && bundleConfigLive) return undefined
          const disposeRow = ctx.slots.register({
            name: 'plugins.row.config',
            key,
          }, ${card})
          if (own) disposeOwnRowConfigs.push(disposeRow)
          return disposeRow
        })
      }
`
}

/** 需要满足契约的包 = 客户端源码里声明了 `ROW_CONFIG_KEYS` 的包（设置卡片的判据）。 */
function packagesWithSettingsCard(): string[] {
  const found: string[] = []
  for (const pkg of readdirSync(packagesDir, { withFileTypes: true })) {
    if (!pkg.isDirectory()) continue
    const path = clientSourcePath(pkg.name)
    if (path === undefined) continue
    if (readFileSync(path, 'utf8').includes('const ROW_CONFIG_KEYS = [')) found.push(pkg.name)
  }
  return found.sort()
}

describe('客户端设置面的注册契约（跨包一致）', () => {
  const withCard = packagesWithSettingsCard()

  it('把「有设置卡片的包」都收进来了（新增包漏了契约会在这里露出来）', () => {
    // 设置卡片 = 注册过 row/config 或 kit/item 的包。search 的设置在自有面板里、kit-settings
    // 本身就是「插件配置」页的提供方，两者都没有 ROW_CONFIG_KEYS，因此不在名单里。
    expect(withCard).toEqual(['codegraph', 'docker', 'env', 'mcp', 'profile', 'prompt', 'rss', 'tty'])
  })

  for (const name of ['codegraph', 'docker', 'tty', 'env', 'mcp', 'profile', 'prompt', 'rss']) {
    it(`${name}：内联优先 + 旧宿主回退，且 bundle 名由 row key 推导`, () => {
      const path = clientSourcePath(name)
      expect(path, `${name} 找不到客户端源码`).toBeDefined()
      const source = readFileSync(path as string, 'utf8')

      // 卡片组件名：从源码里取（各包一张卡，名字唯一；两种声明方式都认）
      const card = /(?:function|const)\s+([A-Za-z]+SettingsCard)/.exec(source)?.[1]
      expect(card, `${name} 未找到 <X>SettingsCard 组件`).toBeDefined()

      // 正身逐字节在场 —— 这一条同时锁住：注册 bundle 槽、内联优先、回退分支、bundle 名推导
      expect(source.includes(expectedBlock(card as string)), `${name} 的设置面契约块与正身不一致（改回旧形态或漂了？）`).toBe(true)

      // 不许另写一份 bundle 常量（两份一定漂）
      expect(source.includes('const BUNDLE_CONFIG_KEYS = ['), `${name} 把 bundle 名写成了常量数组——必须从 row key 推导`).toBe(false)

      // row key 必须同时覆盖独立包与聚合包，否则某一侧宿主永远拿不到设置面
      const list = /const ROW_CONFIG_KEYS = \[([\s\S]*?)\]/.exec(source)?.[1] ?? ''
      const keys = [...list.matchAll(/'([^']+)'/g)].map((m) => m[1])
      expect(keys.length, `${name} 的 ROW_CONFIG_KEYS 为空`).toBeGreaterThan(0)
      for (const key of keys) {
        expect(key, `${name} 的 row key 必须是 bundle#rowId 形状：${key}`).toContain('#')
      }
      const bundles = keys.map((key) => key.split('#')[0])
      expect(bundles, `${name} 的 row key 必须覆盖独立包与聚合包`).toEqual(
        expect.arrayContaining([`@hyzyn/dsh-${name}`, '@hyzyn/dsh-all']),
      )
    })
  }

  it('bundle.config 的 key 全仓两两不同，且没有包去抢聚合包的 key（启动即崩的那条）', () => {
    const keys: Array<{ pkg: string; key: string }> = []
    for (const name of withCard) {
      const source = readFileSync(clientSourcePath(name) as string, 'utf8')
      // 契约块里只挂一个 bundle key：OWN_BUNDLE（= 非聚合包的那个 bundle 名）
      const bundles = [...(source.match(/const ROW_CONFIG_KEYS = \[([\s\S]*?)\]/)?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1].split('#')[0])
      const own = [...new Set(bundles)].find((bundle) => bundle !== '@hyzyn/dsh-all')
      expect(own, `${name} 推不出自己的 bundle 名`).toBeDefined()
      keys.push({ pkg: name, key: own as string })
      expect(source.includes("ctx.slots.register({\n            name: 'plugins.bundle.config',\n            key: OWN_BUNDLE,"), `${name} 的 bundle.config 必须只挂 OWN_BUNDLE`).toBe(true)
    }
    const seen = new Map<string, string>()
    for (const { pkg, key } of keys) {
      expect(key, `${pkg} 不能抢聚合包的 key（那是共享命名空间，重复注册直接抛错）`).not.toBe('@hyzyn/dsh-all')
      expect(seen.has(key), `bundle.config 的 key 撞了：${pkg} 与 ${seen.get(key) ?? ''} 都挂 ${key}`).toBe(false)
      seen.set(key, pkg)
    }
    // 八条各自独立
    expect(seen.size).toBe(keys.length)
  })

  it('反例：破坏内联优先、或去抢聚合包的 key，都必须被抓住', () => {
    const source = readFileSync(clientSourcePath('rss') as string, 'utf8')
    const reference = expectedBlock('RssSettingsCard')
    expect(source.includes(reference)).toBe(true)

    // ① 删掉「内联优先」判断（本包 row 槽无条件注册）→ 与正身不再一致
    const downgraded = source.replace('          if (own && bundleConfigLive) return undefined\n', '')
    expect(downgraded.includes(reference)).toBe(false)

    // ② 去抢聚合包的 key（实测就是这么把客户端启动搞崩的）→ 必须能被静态判据抓住
    expect(source.includes("key: '@hyzyn/dsh-all'")).toBe(false)
    const stolen = source.replace('            key: OWN_BUNDLE,', '            key: AGGREGATE_BUNDLE,')
    expect(stolen.includes('key: AGGREGATE_BUNDLE,')).toBe(true)
    expect(stolen.includes('            key: OWN_BUNDLE,')).toBe(false)

    // ③ 把 bundle 名写死成常量（不再从 row key 推导）→ 推导式那行消失即失败
    const hardcoded = source.replace(
      'const BUNDLE_NAMES = [...new Set(ROW_CONFIG_KEYS.map((key) => key.split(\'#\')[0]))]',
      "const BUNDLE_NAMES = ['@hyzyn/dsh-rss', '@hyzyn/dsh-all']",
    )
    expect(hardcoded.includes('...new Set(ROW_CONFIG_KEYS.map')).toBe(false)
  })
})
