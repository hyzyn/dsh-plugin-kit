# link-dsh-runtime：把插件共享依赖链到 dsh 运行时库

## 背景

本仓库插件（`packages/*`）在 dsh 里以本地路径加载（如 `~/.dsh/profiles/test` 里 `link:` 指向仓库目录）。
插件代码 `import '@deepseek-ai/cordis'` 等共享依赖时，Node 按文件真实路径向上找 `node_modules`，
默认会解析到**仓库自己 `.pnpm` 里那套依赖**，而不是 dsh 宿主进程正在用的那套。

升级 dsh 后，若插件仍加载仓库里的旧版 `@deepseek-ai/*`，会出现两类假象：

- 插件与宿主各持一份不同版本的库 → `instanceof`/schema 等对不上，报出与真实无关的错；
- 插件继续用旧 API 悄悄跑通 → 掩盖真实兼容性问题。

`link-dsh-runtime.mjs` 把 `packages/*/node_modules/@deepseek-ai/*` 的链接统一改为指向
**dsh 运行时自带的那套库**（`~/.npm-global/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai`），
让插件与宿主共享同一份、同版本的库，从而诚实观察兼容性。

## 用法

```bash
# 查看将发生什么（不改动）
node scripts/link-dsh-runtime.mjs --dry-run

# 实际重链
node scripts/link-dsh-runtime.mjs

# 指定运行时目录（默认自动探测 npm 全局 dsh）
node scripts/link-dsh-runtime.mjs --runtime /path/to/@deepseek-ai
```

输出示例：

```
dsh runtime store: /Users/czz/.npm-global/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai
dsh version      : 0.1.2-alpha.5
- tty node_modules/@deepseek-ai/dsh-tools:
    before: ../../../../node_modules/.pnpm/@deepseek-ai+dsh-tools@0.1.1-rc.2_.../node_modules/@deepseek-ai/dsh-tools
    after : /Users/czz/.npm-global/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-tools
relinked 22 @deepseek-ai entries
audit log appended: /Users/czz/coding/project/dsh-plugin-kit/node_modules/.dsh-links.log
```

## 修改记录

每次实际运行都会把逐条 before/after 追加到 `node_modules/.dsh-links.log`
（带时间戳与 dsh 版本；位于 node_modules 内，不进入 git）。

查看：

```bash
tail node_modules/.dsh-links.log
```

## 注意事项

- **`pnpm install` 会重建 node_modules，冲掉这些链接**。装完依赖后需重新执行一次本脚本。
- 若某个包在 dsh 运行时里不存在（改名/下线），脚本会移除该链接并告警——运行期若仍被
  import 会直接报 `ERR_MODULE_NOT_FOUND`，这正是兼容性信号，不是 bug。
- 该脚本只改 node_modules 里的 symlink，不改任何源码/package.json/锁文件。
