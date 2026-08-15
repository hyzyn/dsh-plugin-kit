# @hyzyn/dsh-prompt

DSH Web GUI 的 **Prompt 管理插件**：官方 设置 → 插件 里的「Prompt 管理」卡片，提供 systemPrompt 的可视化编辑、版本管理、A/B 测试、导出/分享。浏览器半体通过核心 `settings.plugin.item` 插槽注册。

配置保存在 `~/.dsh/prompts.yml`（可用环境变量 `DSH_PROMPT_FILE` 覆盖）的托管区块中。

## 能力

- **可视化编辑 systemPrompt**：在卡片里维护多个 Prompt，每个 Prompt 可包含多份版本内容；启用某个 Prompt 后，其内容会作为 `systemPrompt` section 注入。
- **版本管理**：
  - 保存为新版本：编辑内容后一键存为新版本，旧版本完整保留
  - 切换/回滚：在版本列表点击即可切换激活版本
  - 版本标签与备注：方便区分 v1 / v2 / 简洁版等
- **A/B 测试**：
  - 为同一个 Prompt 选择 A/B 两个版本，设置 A 流量权重（0~100%）
  - 启用后宿主按权重随机选择一个版本注入 systemPrompt，当前命中可通过 `GET /api/dsh-prompt/active` 查看
- **导出 / 分享**：
  - 导出单个或全部 Prompt 为 JSON / Markdown
  - 一键复制分享 JSON 到剪贴板
  - 支持从 JSON 文件导入

## 路由

仅限 loopback + 同源访问：

- `GET /api/dsh-prompt/list` —— 列出全部 Prompt 与激活状态
- `POST /api/dsh-prompt/save` —— 新建 / 整体保存 Prompt
- `POST /api/dsh-prompt/activate` —— 启用某个 Prompt（可指定激活版本；`promptId` 为空表示停用）
- `POST /api/dsh-prompt/abtest` —— 配置 A/B 测试
- `POST /api/dsh-prompt/delete` —— 删除 Prompt
- `GET /api/dsh-prompt/active` —— 查看当前注入 systemPrompt 的文本与命中版本
- `GET /api/dsh-prompt/export?format=json|markdown&promptId=...` —— 导出
- `POST /api/dsh-prompt/import` —— 导入 JSON

## 安装

```bash
pnpm --filter @hyzyn/dsh-prompt build
dsh plugin --profile web add link:$(pwd)/packages/prompt
```

插件自身行由 `cordis.patch.yml` 的 `insert: { id: prompt-manager, name: '@hyzyn/dsh-prompt' }` 挂载；保存 Prompt 后宿主会立即刷新 systemPrompt section，无需重启。

## 配置

```ts
interface Config {
  /** 关闭整个插件。默认 false。 */
  enabled?: boolean
  /** 是否向 agent 注入插件能力公告。默认 true。 */
  announceToAgent?: boolean
  /** 是否把启用的 Prompt 注入 systemPrompt。默认 true。 */
  applyToSystemPrompt?: boolean
}
```

## 说明

- 托管区块以 `# --- dsh-prompt-manager managed ...` 标记，插件只改写该区块，其余内容原样保留。
- 每个 Prompt 至少需要一个版本；版本内容最大 500KB。
- A/B 测试的随机选择发生在 systemPrompt 刷新时（保存/启用/启动），适合快速对比不同 system prompt 文案；如需按会话粒度分流，可在上层接入实验平台。
- 浏览器半体依赖核心 `slots` 服务，只有 `dsh-web-app` 的官方设置面板才提供该插槽。
