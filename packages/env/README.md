# @dsh-kit/env

DSH Web GUI 的 **环境变量 / 密钥管理插件**：官方 设置 → 插件 里的「环境变量 / 密钥管理」卡片，提供图形化管理。浏览器半体通过核心 `settings.plugin.item` 插槽注册。

配置保存在 `~/.dsh/env.yml`（可用环境变量 `DSH_ENV_FILE` 覆盖）的托管区块中，支持：

- 普通字符串值
- `js:` 前缀的 `!!js` 表达式（如 `js:process.env.API_KEY`、`js:process.env.HOME + '/x'`）
- 密钥标记：标记为密钥的条目在 Web GUI 中以密码框显示
- 保存后默认写入当前进程的 `process.env`，供宿主和后续启动的子进程使用

## 路由

仅限 loopback + 同源访问：

- `GET /api/dsh-env/list` —— 列出全部环境变量
- `POST /api/dsh-env/save` —— 整体保存（校验键名、去重后写回托管区块）

## 安装

```bash
pnpm --filter @dsh-kit/env build
dsh plugin --profile web add link:$(pwd)/packages/env
```

插件自身行由 `cordis.patch.yml` 的 `insert: { id: env-manager, name: '@dsh-kit/env' }` 挂载；保存环境变量后立即写入 `process.env`，无需重启宿主进程。

## 配置

```ts
interface Config {
  /** 关闭整个插件。默认 false。 */
  enabled?: boolean
  /** 是否向 agent 注入插件能力公告。默认 true。 */
  announceToAgent?: boolean
  /** 保存/启动时是否把解析后的值写入 process.env。默认 true。 */
  applyToProcessEnv?: boolean
}
```

## 说明

- 托管区块以 `# --- dsh-env-manager managed ...` 标记，插件只改写该区块，其余内容原样保留。
- 键名只允许 `[A-Za-z_][A-Za-z0-9_]*`，且不能重复。
- `js:` 表达式在宿主内评估（与 loader 相同的信任模型），仅建议存放本机可解析的表达式。
