# @dsh-kit/all

dsh-plugin-kit 聚合安装包：一条 bundle patch 挂载仓库内全部插件。

- `cordis.patch.yml` 由 `scripts/aggregate.mjs` 自动生成 —— 不要手改；
- `dependencies` 同样由聚合脚本同步为各插件的 `workspace:*`；
- 新增/删除插件后重跑 `pnpm aggregate`。

安装整个库：

```bash
dsh plugin --profile web add link:$(pwd)
```
