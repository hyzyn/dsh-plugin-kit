# @hyzyn/dsh-env

DSH Web GUI 的 **环境变量 / 密钥管理插件**：官方 设置 → 插件 里的「环境变量 / 密钥管理」卡片，提供图形化管理。浏览器半体通过核心 `settings.plugin.item` 插槽注册。

配置保存在 `~/.dsh/env.yml`（可用环境变量 `DSH_ENV_FILE` 覆盖）的托管区块中；**密钥条目的明文值默认存入官方凭据存储**（`~/.dsh/.credentials.yaml` 的 refs，经 `ctx.credentials` seam 读写），env 文件只保留清单不落密钥明文。支持：

- 普通字符串值
- `js:` 前缀的 `!!js` 表达式（如 `js:process.env.API_KEY`、`js:process.env.HOME + '/x'`）——本质是引用，保留在 env 文件
- 密钥标记：明文值迁入官方凭据存储（write-only），接口不下发到浏览器（list 返回 `value: null` 并带 `storage` 字段），GUI 以密码框显示、留空保存＝保持已存值；文件与接口均不做加密
- 保存后默认写入当前进程的 `process.env`（凭据存储的值经 `resolve` 桥接），供宿主和后续启动的子进程使用

## 路由

仅限 loopback + 同源访问：

- `GET /api/dsh-env/list` —— 列出全部环境变量（密钥条目 value 为 null，不回明文；`storage: refs` 表示值在官方凭据存储，`file` 表示留在 env 文件）
- `POST /api/dsh-env/save` —— 整体保存（校验键名、去重后写回；条目 value 为 null 表示保留已存值；密钥值自动写入凭据存储，写入失败留在文件并返回 `warnings`）

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
  /** 密钥值是否存入官方凭据存储（.credentials.yaml refs）。默认 true；关闭则全部留在 env 文件。 */
  secretsInCredentials?: boolean
}
```

## 说明

- 托管区块以 `# --- dsh-env-manager managed ...` 标记，插件只改写该区块，其余内容原样保留。
- **凭据存储迁移**：启动时自动把带明文值的密钥条目迁入官方凭据存储，幂等且非破坏——只有写入成功的条目才从 env 文件移除值。三类条目保留在 env 文件：`js:` 引用、空值（官方存储拒绝空串）、被启动环境遮蔽或 refs 已有同名键（**不覆盖**用户经官方界面存过的值）。
- 宿主未提供凭据 seam 或配置 `secretsInCredentials: false` 时，插件整体退回 env 文件单存储模式。
- 键名只允许 `[A-Za-z_][A-Za-z0-9_]*`，且不能重复。
- `js:` 表达式在宿主内评估（与 loader 相同的信任模型），仅建议存放本机可解析的表达式。
- env 文件落盘固定 0600（承载清单与少量遗留明文，不继承既有宽松权限）。
- 升级提示：迁移后密钥值在 `.credentials.yaml`，不建议回退到未迁移的旧版本插件使用同一 `~/.dsh`。
- 安全提示：路由仅信任 loopback + 同源请求，且无鉴权——凡能以本机回环身份到达端口的进程或隧道（如 `ssh -L` 端口转发、把 Host 改写为 localhost 的本机反向代理）都能读取未迁入凭据存储的值；`js:` 前缀值会在宿主进程内执行，等同于本机代码执行。不要将 GUI 端口经隧道 / 代理暴露给不可信网络，除非额外加鉴权。
