# @hyzyn/dsh-loglens

把**异构日志后端归一化成一个查询面**：Loki / Elasticsearch / OpenSearch / Docker 各走一层薄适配器，
对外只有一套「归一化行模型 + 诚实的计数与截断信号 + 交给 Agent 的工具」。

> **状态：只有骨架（2026-10-11 建包；P0-乙 进行中）。** 现在挂载只打印一行日志，**还没有任何查询能力**。
> 设计与契约的唯一归宿是 [docs/design.md](./docs/design.md)；分期与待办见 [ROADMAP.md](./ROADMAP.md)。
> 本 README 会在 P1 按 [conventions § 文档分档](../../docs/conventions.md#文档分档) 补齐用法与已知限制。

## 解剖

| 文件 | 说明 |
| --- | --- |
| `package.json` | `dsh.bundle.patch` 指向 `cordis.patch.yml`；`main` / `exports["."]` 指向 `lib/index.js` |
| `cordis.patch.yml` | bundle 补丁：`insert: { id: loglens, name: '@hyzyn/dsh-loglens' }` 把本插件行插入 profile 阵容 |
| `src/index.ts` | 宿主半体（当前是骨架） |
| `client-src/` → `client.js` | 构建型客户端半体：`pnpm build` 时由 `scripts/build-client.mjs` 打包（i18n 内联在 `client-src/index.js`） |
| `test/` | vitest 用例（仓库根 `pnpm test` 收集 `packages/*/test/**`） |

## 开发

```bash
pnpm --filter @hyzyn/dsh-loglens build       # tsc → lib/，并重建 client.js
pnpm --filter @hyzyn/dsh-loglens typecheck
```

## 安装到 DSH

```bash
dsh plugin --profile web add link:$(pwd)/packages/loglens
```