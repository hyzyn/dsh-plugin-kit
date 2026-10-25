# @hyzyn/dsh-env

中文 | [English](README.en.md)

> DSH 的「环境变量 / 密钥管理」卡片：图形化管理 `~/.dsh/env.yml`（可用 `DSH_ENV_FILE` 覆盖），**密钥明文默认进官方凭据存储**，env 文件不落明文。

## 特性

- **密钥值不入 env 文件**：密钥值写入官方凭据存储（`~/.dsh/.credentials.yaml` 的 refs），env 文件只留清单；接口不下发明文（`value: null`），GUI 以密码框呈现，留空保存＝保持原值。
- **`js:` 表达式由宿主延迟求值**：`js:process.env.API_KEY` 这类表达式留在文件里、由宿主求值（YAML `!!js` 方言，与 dsh 补丁文件一致），密钥不必写死。
- **保存即写入当前进程**：解析结果写进当前进程的 `process.env`，宿主与后续子进程立刻可用，无需重启。
- **启动期同步预注入**：冷启动时，凭据存储（ref 托管）里的密钥在 `apply()` 返回前就已同步写进 `process.env`，赶得上其它插件条目的求值时机——MCP 认证头写的就是 `js:process.env.XXX`，等异步凭据 seam 会输掉这场竞态（症状：卡片「未连接」/ `ValidationError` + 「1 entry did not activate」）。
- **`dshEnvReady` 就绪服务**：同步注入完成后 `ctx.provide('dshEnvReady', { enabled, keys, at })`（`keys` 只含键名、不含值）；被禁用时也 provide `{ enabled: false }`。消费者（如 codegraph 的 per-agent MCP 挂载）用 `ctx.inject` 等它，从而不依赖插件加载顺序。**注意**：它保证的只是「注入先于消费者动手」；热重载不会让**已经挂上**的消费者（如已 spawn 的 MCP 子进程）重新同步一份环境——那种同步只在启动时发生一次——契约见 [architecture.md § 5](../../docs/architecture.md#5-跨插件协作数据级复用不是代码依赖)。
- **存储降级是全有全无**：宿主没有凭据 seam 或关掉 `secretsInCredentials` 时退回「env 文件单存储」，不产生半迁移状态。
- **围栏与文件权限显式约束**：路由仅 loopback + 同源，env 文件固定 0600；明确提示不要把 GUI 端口经隧道 / 反代暴露。

![环境变量 / 密钥管理卡片](https://cdn.jsdelivr.net/gh/hyzyn/dsh-plugin-kit@main/docs/dsh-plugin-kit-env.png)

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

设置面在宿主里的位置随 DSH 版本变，但**始终是同一份表单**：`0.2.0-rc.1` 起挂
`plugins.bundle.config`——**插件详情页「说明」正下方内联**，不必再点「>」进二级页；旧宿主
（0.1.6 线）自动回退到侧边栏「插件」页里该行的「>」子页，`≤0.1.5` 用设置页卡片。

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
- **启动期同步预注入**：`secret: true` 且没有内联 `value` 的条目，值在 `.credentials.yaml` 的 `refs` 里。插件启动时**同步**读该文档（`$DSH_HOME/.credentials.yaml`，可用 `DSH_ENV_CREDENTIALS_FILE` 覆盖）并把值**写进** `process.env`，**`apply()` 返回时值已就位**——这是 MCP 认证头那类 `!!js process.env.X` 在冷启动时能取到值的唯一原因。**优先权跟随宿主 seam**：同名 key 既在存储又在启动环境时**写存储值**（`0.2.1-alpha.3` 起宿主的层级是 `$DSH_HOME/.credentials.yaml > inherited env > cwd/.env > $DSH_HOME/.env`，`0.2.1-alpha.2` 相反——翻转落在 alpha.3），这样 `ctx.credentials.resolve()` 与 `!!js process.env.X` 才会同答——不同答就是「卡片说已配置、MCP 却 401」。代价：显式导出的启动值（`KEY=… dsh`、CI secret）不再覆盖已存储的同名 key，想保留覆盖就别把那个 key 存进 DSH。旧档（alpha.2 及更早）上的落差**有界且自愈**：宿主读的是启动快照而非实时 `process.env`，随后的异步 seam 对账会把环境改回继承值。**删除语义**留给那条异步对账，但它**先查 `refs` 文件再决定删不删**：文件里还有值时按文件写回、绝不删除（否则「seam 一时答不出来」会把刚注入的值抹掉，症状正是「今天为什么又丢了」），只有文件里也确实没有这个键了才删除变量；凭据文档缺失/损坏只是这一次不预注入，不影响插件启动。聚合层因此把它排在**第一个**挂载（见 [`@hyzyn/dsh-all`](../all/README.md)）。
- 宿主未提供凭据 seam 或配置 `secretsInCredentials: false` 时，插件整体退回 env 文件单存储模式（**此时也不做启动期预注入**：那种模式下凭据存储不是真源）。
- 键名只允许 `[A-Za-z_][A-Za-z0-9_]*`，且不能重复。
- `js:` 表达式在宿主内评估（与 loader 相同的信任模型），仅建议存放本机可解析的表达式。
- env 文件落盘固定 0600（承载清单与少量遗留明文，不继承既有宽松权限）。
- 升级提示：迁移后密钥值在 `.credentials.yaml`，不建议回退到未迁移的旧版本插件使用同一 `~/.dsh`。
- 安全提示：路由仅信任 loopback + 同源请求，且无鉴权——凡能以本机回环身份到达端口的进程或隧道（如 `ssh -L` 端口转发、把 Host 改写为 localhost 的本机反向代理）都能读取未迁入凭据存储的值；`js:` 前缀值会在宿主进程内执行，等同于本机代码执行。不要将 GUI 端口经隧道 / 代理暴露给不可信网络，除非额外加鉴权。
