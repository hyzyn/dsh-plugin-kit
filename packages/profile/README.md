# @hyzyn/dsh-profile

中文 | [English](README.en.md)

> DSH **设置 → 插件** 里的「Profile 管理」卡片：查看、创建、复制、重命名、删除 DSH profile，不用记命令。

## 特性

- **模板化创建，不手抄清单**：三种模板一键创建（`@deepseek-ai/dsh-base` 仅核心，或再加 `dsh-web-app` / `dsh-headless`）；复制跳过 `node_modules` 与 lockfile 并自动 `pnpm install`。
- **端口随 profile 落盘**：为每个 profile 记录启动端口，复制出的启动命令自动带 `--port`，多个 web profile 不再撞端口。
- **重命名同步目录与 manifest**：一次操作同时完成目录移动与 `package.json` 改名；删除在面板内二次确认（不可撤销）。
- **状态与结构直读**：初始化徽章、bundle 层、依赖数、目录路径；缺 `cordis.patch.yml` 会提示。

## Profile 是什么

每个 profile 是 `$DSH_HOME/profiles`（默认 `~/.dsh/profiles`，可用环境变量 `DSH_HOME` 覆盖）下的独立目录，拥有自己的 bundle 层与补丁文件：

```
~/.dsh/profiles/<name>/
├── package.json          # dsh.profile.bundles：本 profile 的 bundle 层阵容
├── cordis.patch.yml      # 补丁层：bundle 层之后应用的 loader patch 列表
├── pnpm-workspace.yaml   # profile 工作区（nodeLinker: hoisted）
└── profile.runtime.json  # （可选）本插件的运行配置，如启动端口
```

## 结构

| 文件 | 说明 |
| --- | --- |
| `src/index.ts` | 宿主半体：profile 目录读写、校验、创建 / 复制 / 重命名 / 删除、`/api/dsh-profile/*` 路由（loopback-only 围栏） |
| `client.js` | 浏览器半体：注册 `settings.plugin.item` 卡片（React 外壳 + 纯 DOM 管理面板，`window.__ModuleLoader__.load` 格式） |
| `cordis.patch.yml` | bundle 补丁：把插件行插入 profile 阵容 |

路由（仅限 loopback + 同源）：

- `GET /api/dsh-profile/list` —— 列出全部 profile 及状态
- `POST /api/dsh-profile/create` —— 新建（`name` + 可选 `template` / `port`）
- `POST /api/dsh-profile/duplicate` —— 复制（`name` + `from`）
- `POST /api/dsh-profile/rename` —— 重命名（`name` + `newName`）
- `POST /api/dsh-profile/port` —— 设置端口（`name` + `port`，`port` 留空清除）
- `POST /api/dsh-profile/delete` —— 删除（`name`）

## 安装

```bash
pnpm --filter @hyzyn/dsh-profile build
dsh plugin --profile web add link:$(pwd)/packages/profile
```

插件自身行由 `cordis.patch.yml` 的 `insert: { id: profile-manager, name: '@hyzyn/dsh-profile' }` 挂载；`dsh plugin add` 会同时把本包装进 profile 依赖并加入 `dsh.profile.bundles` 补丁层，**只需挂载这一次**，重启 `dsh web` 后生效。

## 配置

```ts
interface Config {
  /** 关闭整个插件。默认 false。 */
  enabled?: boolean
  /** 是否向 agent 注入插件能力公告。默认 true。 */
  announceToAgent?: boolean
}
```

## 界面预览

设置 → 插件 →「Profile 管理」卡片（配置界面）：

![Profile 管理配置界面](https://cdn.jsdelivr.net/gh/hyzyn/dsh-plugin-kit@main/docs/dsh-plugin-kit-profile.png)

用 `headless` 模板建好 profile 后，命令行可直接以该 profile 启动 headless 会话（一次性回答一个任务、打印结果后退出）：

![命令行启动 headless profile 示例](https://cdn.jsdelivr.net/gh/hyzyn/dsh-plugin-kit@main/docs/dsh-plugin-kit-profile-example-headless1.png)

```bash
# 以 headless profile 启动：回答一个任务、打印结果后退出
dsh --profile headless "run the tests"
# dsh web 即 --profile web 的别名
```

## 说明

- 创建逻辑与 `dsh-app-boot` 的 `initProfile` 对齐：生成 `package.json`（`dsh.profile.bundles`）、空补丁文件 `cordis.patch.yml`（`[]`）与 `pnpm-workspace.yaml`
- 名称只允许 `[A-Za-z0-9][A-Za-z0-9._-]*`，且不能是 `node_modules` / `.` / `..`
- 复制自动跳过 `node_modules` 与 `pnpm-lock.yaml`，不搬运安装产物，但会自动执行 `pnpm install` 重建依赖；`profile.runtime.json` 会随目录一起复制。`pnpm` 经 `@hyzyn/dsh-kit` 的 `spawnPortable` 启动——Windows 上 pnpm 只有 `pnpm.CMD`，裸 spawn 既解析不到 `.cmd` 也会因 Node 的加固报 `EINVAL`（真机实测过 `spawnSync pnpm ENOENT`）；装依赖失败会把复制出来的目录回滚，语义是「要么复制成功，要么什么都没发生」
- 端口配置保存在 `profile.runtime.json`，只影响本插件生成的启动命令，不会写入 DSH 官方 `package.json` / `cordis.patch.yml`
- 删除为递归删除、不可撤销，面板内会二次确认；内置的 `web` 默认 profile 不允许删除，`headless` 可以删除
- 新建的 profile 首次使用前需按需安装依赖：`dsh plugin --profile <name> add <包>`（在 profile 目录内跑 pnpm）
- 浏览器半体依赖核心 `slots` 服务，只有 `dsh-web-app` 的官方设置面板才提供该插槽
