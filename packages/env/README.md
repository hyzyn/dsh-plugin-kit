# @hyzyn/dsh-env

DSH Web GUI 的 **环境变量 / 密钥管理插件**：官方 设置 → 插件 里的「环境变量 / 密钥管理」卡片，提供图形化管理。浏览器半体通过核心 `settings.plugin.item` 插槽注册。

配置保存在 `~/.dsh/env.yml`（可用环境变量 `DSH_ENV_FILE` 覆盖）的托管区块中，支持：

- 普通字符串值
- `js:` 前缀的 `!!js` 表达式（如 `js:process.env.API_KEY`、`js:process.env.HOME + '/x'`）
- 密钥标记：条目值不下发到浏览器（list 返回 value: null），GUI 以密码框显示、留空保存＝保持已存值；文件与接口均不做加密
- 保存后默认写入当前进程的 `process.env`，供宿主和后续启动的子进程使用

## 路由

仅限 loopback + 同源访问：

- `GET /api/dsh-env/list` —— 列出全部环境变量（密钥条目 value 为 null，不回明文）
- `POST /api/dsh-env/save` —— 整体保存（校验键名、去重后写回托管区块；条目 value 为 null 表示保留已存值）

## 安装

```bash
pnpm --filter @hyzyn/dsh-env build
dsh plugin --profile web add link:$(pwd)/packages/env
```

插件自身行由 `cordis.patch.yml` 的 `insert: { id: env-manager, name: '@hyzyn/dsh-env' }` 挂载；保存环境变量后立即写入 `process.env`，无需重启宿主进程。

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
- env 文件落盘固定 0600（承载明文密钥，不继承既有宽松权限）。
- 安全提示：路由仅信任 loopback + 同源请求，且无鉴权——凡能以本机回环身份到达端口的进程或隧道（如 `ssh -L` 端口转发、把 Host 改写为 localhost 的本机反向代理）都能读取全部值；`js:` 前缀值会在宿主进程内执行，等同于本机代码执行。不要将 GUI 端口经隧道 / 代理暴露给不可信网络，除非额外加鉴权。
