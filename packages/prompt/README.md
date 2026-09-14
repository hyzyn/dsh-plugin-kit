# @hyzyn/dsh-prompt

中文 | [English](README.en.md)

> DSH **设置 → 插件** 里的「Prompt 管理」卡片：可视化编辑 systemPrompt，带版本管理与 A/B 测试。配置存在 `~/.dsh/prompts.yml`（可用 `DSH_PROMPT_FILE` 覆盖）。

## 特性

- **多 Prompt × 多版本**：一个 Prompt 可存多份版本，一键存为新版本 / 点一下回滚，旧版本完整保留。
- **A/B 测试**：按比例随机命中 A/B 版本，用真实使用验证提示词改动。
- **启用即注入**：选中的 Prompt 作为 `systemPrompt` section 注入，保存即热生效。
- **导出与分享**：Prompt 可导出带走或分享给别人。

![Prompt 管理卡片：可视化编辑 / 版本管理 / A/B 测试](https://cdn.jsdelivr.net/gh/hyzyn/dsh-plugin-kit@main/docs/dsh-plugin-kit-prompt.png)

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
