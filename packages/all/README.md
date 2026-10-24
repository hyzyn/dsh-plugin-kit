# @hyzyn/dsh-all

dsh-plugin-kit 聚合安装包：一条 bundle patch 挂载仓库内全部插件。

- `cordis.patch.yml` 由 `scripts/aggregate.mjs` 自动生成 —— 不要手改；
- `dependencies` 同样由聚合脚本同步为各插件的 `workspace:*`；
- 新增/删除插件后重跑 `pnpm aggregate`。

**挂载顺序不是纯字母序**：`@hyzyn/dsh-env` 固定排第一（优先级清单在
[`scripts/aggregate-order.mjs`](../../scripts/aggregate-order.mjs)）。原因：env 的启动期同步预注入
（`apply()` 里把凭据 refs 写进 `process.env`）必须先于任何依赖 `process.env` 的插件——最直接的是
**在托管行里写 `!!js process.env.*` 认证头的 MCP 条目**（求值成 `undefined` 就是 `Basic
base64("undefined:undefined")`，服务器回 401 而界面一片绿）；codegraph 的 per-agent 挂载则走另一条路
（它不写 headers，只是 spawn 的子进程要继承到注入的变量）。行序**不是**运行时保证——加载器并发
create，真正表达先后的是 `dshEnvReady` 服务（见 `packages/env/README.md`）。加新插件时不要往优先级
清单里塞无关项；清单写错包名会让 `pnpm aggregate` 直接报错停下。

> 注意：这只钉住**配置行序**；运行时 apply 顺序由加载器的并发 create 与依赖就绪决定，
> 不是硬保证（边界与替代方案见 `scripts/aggregate-order.mjs` 文件头）。

安装整个库：

```bash
dsh plugin --profile web add link:$(pwd)
```
