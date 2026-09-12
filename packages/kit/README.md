# @hyzyn/dsh-kit

dsh-plugin-kit 的插件开发工具包：类型助手与共用代码。
零运行时依赖（`@deepseek-ai/cordis` 仅为类型）。

## API

- `definePlugin(plugin)` —— 类型化身份函数，返回带 `DshPlugin<C>` 精确类型的插件对象；
- `DshPlugin<C>` / `PluginConfig` —— 插件对象与配置的类型。

```ts
import { definePlugin } from '@hyzyn/dsh-kit'

const plugin = definePlugin<{ enabled?: boolean }>({
  name: 'my-plugin',
  inject: [],
  apply(ctx, config) {
    /* 挂载逻辑 */
  },
})

export const { name, inject, apply } = plugin
```

## `enabled` 开关约定

kit 生态的插件统一支持 `enabled` 配置（默认 `true`），语义分两层：

- **挂载层**：composition 配置里 `enabled: false` 时 `apply` 直接返回，
  不注册任何服务、路由与设置卡片（卸载级禁用，重启后保持）。
- **运行层**：用户在设置卡片里关掉「启用插件」写的是 settings 命名空间，
  插件保持挂载，但必须**热生效**：
  1. agent 工具全部注销（`refreshTools` 入口按 `enabled` 短路）；
  2. 数据类 HTTP 路由一律 403，仅保留 `GET/POST /config` —— 设置卡片靠它
     渲染，也是重新启用插件的唯一 UI 入口，**不能**一并关掉；
  3. systemPrompt 能力公告按 `enabled && announceToAgent` 重建（撤下 / 恢复）。

设置卡片在禁用后必须仍然可见可保存，否则用户没有 UI 入口重新打开插件；
不要把「禁用」实现成不注册 settings 命名空间。参考实现：
`packages/docker/src/index.ts`（`refreshTools` / 路由守卫 / `refreshAnnouncement`）、
`packages/tty/src/index.ts`（同约定，另有 WS 升级闸门：禁用时断开存量连接并拒绝
新升级，PTY 进程转孤儿保活，重新启用后客户端自动重连 attach）。

## 设置卡片约定（settings.plugin.item）

kit 插件的设置面板统一注册到宿主 `settings.plugin.item` 插槽（key = 各自的
settings 命名空间），渲染在 设置 → 插件 → 插件配置 列表里。**不另开设置导航
入口**：配置只有一个寻址点；功能面走主界面侧栏入口（与宿主「插件市场」的
导航项 + 列表卡片分层同构）。

### order 取号

卡片排序共用 **90-119 段**，逐个占号；新插件从 106 起顺延，不要复用已占的号
（撞号时渲染顺序未定义）：

| key | 插件 | order |
| --- | --- | --- |
| prompt-manager | Prompt 管理 | 90 |
| profile-manager | Profile 管理 | 92 |
| rss-digest | RSS / 新闻聚合 | 94 |
| mcp-config | MCP 服务器配置 | 96 |
| env-manager | 环境变量 / 密钥管理 | 98 |
| tty | 终端面板 | 100 |
| docker | Docker 容器面板 | 102 |
| codegraph | Codegraph | 104 |

### 套件徽标

每张卡片头部右侧放统一徽标，视觉上承认同族（不靠导航结构）：头部按钮内、
chevron 之前插入 `<span class="dshkit_badge">Kit</span>`，并把共用样式注入本
插件的样式表：

```css
.dshkit_badge{flex:none;margin-left:auto;padding:1px 8px;border-radius:999px;font-size:11px;font-weight:600;line-height:16px;letter-spacing:.02em;color:var(--dsw-alias-label-dimmed);background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1)}
```

tty / docker 分别用 `--tt-*` / `--dk-*` 令牌派生配色（见各自 css 文件里的
`.dshkit_badge` 规则），其余插件直接用上面的 `--dsw-*` 版本。
