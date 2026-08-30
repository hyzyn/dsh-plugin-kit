# @hyzyn/dsh-hello

dsh-plugin-kit 的最小 host 插件模板 —— 新插件的复制蓝本（`pnpm create-plugin <name>` 即复制本目录并替换包名与插件 id）。

## 解剖

| 文件 | 说明 |
| --- | --- |
| `package.json` | `dsh.bundle.patch` 指向 cordis.patch.yml；`main` / `exports["."]` 指向 lib/index.js |
| `cordis.patch.yml` | bundle 补丁：`insert: { id: hello, name: '@hyzyn/dsh-hello' }` 把本插件行插入 profile 阵容 |
| `src/index.ts` | 导出 `{ name, inject, apply }` 形状的 Cordis 插件宿主半体 |
| `tsconfig.json` | 继承根 tsconfig.base.json，tsc 产出 lib/ |

## 开发

```bash
pnpm --filter @hyzyn/dsh-hello build
pnpm --filter @hyzyn/dsh-hello typecheck
```

## 安装到 DSH

```bash
dsh plugin --profile web add link:$(pwd)
```

## 扩展方向

- 宿主能力：从 ctx 取 `tools` / `webServer` / `systemPrompt` 等服务（inject 声明或 ctx.get 判空）；
- 配置：用 schemastery 导出同名 `Config` schema；
- 浏览器半体：加 `dsh.client` + `./client` 导出。
