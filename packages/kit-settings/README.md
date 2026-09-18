# @hyzyn/dsh-kit-settings · kit 插件配置入口

在 DSH Web GUI 的**「设置」里补一行与「通用设置」平级的「插件配置」页**，把 dsh-plugin-kit
插件族的配置表单收在一处。

## 为什么需要它

DSH ≥ `0.1.6-alpha.2` 把插件配置从「设置 → 插件 → 插件配置」搬到了侧边栏的「插件」页，
设置里那一行只剩只读清单（官方 `settings.plugin.item` 插槽已退役，见
[官方设计笔记](https://github.com/deepseek-ai/deepseek-harness/blob/master/.agents/notes/implemented/architecture/2026-09-16-plugin-configuration-on-the-plugins-page.zh.md)）。

如果你更习惯「设置里一行、点开就是各插件配置」的形态，装上本包即可恢复：它是官方支持的
`settings.section` 扩展点（官方的「通用设置 / 模型 / 内置插件 / Agent 预设 / 已归档会话」
五行都是这么注册的），不是绕过设计。

## 装什么

```sh
dsh plugin --profile web add @hyzyn/dsh-kit-settings
```

单独装本包不会显示任何卡片——它只是一个**宿主页**。各插件把自己的配置卡片注册进本页声明的
子 slot `settings.kit.item`，所以：

- 装了本包 + 任意 kit 插件 → 设置里出现「插件配置」行，行内是该插件的卡片；
- 只装 kit 插件、不装本包 → 设置里没有这一行（插件照常工作，配置走侧边栏「插件」页）；
- 只装本包、不装任何 kit 插件 → 这一行会显示「暂无可用配置项」。

装 `@hyzyn/dsh-all` 全家桶会自动带上本包。

## 两种配置入口的关系

在 DSH ≥ `0.1.6-alpha.2` 上，kit 插件同时提供两个入口，指向**同一份配置**：

| 入口 | 位置 | 形态 |
|---|---|---|
| 官方插件页 | 侧边栏「插件」→ 选插件 → 该行的「配置」 | 新版两视图（一句话摘要 + 表单页） |
| 本包提供的行 | 设置 →「插件配置」 | 0.1.5 时代那种可折叠卡片 |

在 DSH ≤ `0.1.5` 上，插件自己注册的 `settings.plugin.item` 仍然生效——官方那一行「插件」
本来就有「插件配置」标签页和这些卡片。本包注册的 `settings.section` 同样会出现在设置里，
于是**同一批卡片会显示两处**（官方「插件」行内 + 本包的「插件配置」行）。

所以：**0.1.5 上不要装本包**（没有必要）；本包是给 DSH ≥ `0.1.6-alpha.2` 用的——
那一版的官方行只剩只读清单，本包才是恢复「设置里一行装全部配置」的手段。

## 实现

- 宿主半体（`src/index.ts`）：只为让本包在 Loader 里成为一行，不注册路由、不占 settings 命名空间。
- 浏览器半体（`client.js`）：注册 `settings.section`（id `kit`，order 16，紧随官方「内置插件」），
  并通过本次注册的 `children` 声明子 slot `settings.kit.item`（`kind: 'list'`），
  再由 `renderSlot('settings.kit.item')` 渲染全部条目。
- 各 kit 插件注册进子 slot 时**不传 `view`**，于是卡片走各自原有的可折叠分支——两种形态共用同一份组件。

## License

Apache-2.0
