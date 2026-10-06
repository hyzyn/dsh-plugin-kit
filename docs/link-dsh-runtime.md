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

「运行时存储目录在哪」这件事的**唯一一份**实现是
[`scripts/lib/dsh-runtime-store.mjs`](../scripts/lib/dsh-runtime-store.mjs)——本脚本与
[主题名字快照](#顺带宿主主题的名字快照样式变量守卫的燃料)共用它（两处各写一份时，下次换 npm
prefix / 换 profile 布局只会改一处，另一处静默失效）。

顺带把声明依赖的包里的 `@hyzyn/dsh-kit` 链到本仓库 workspace 包（`packages/kit`）：
registry 发布版的类型会经 `.pnpm` 解析出另一份 cordis（与插件侧那份不同源），
tsc 会报 `Context` 互不兼容；链到 workspace 后两边 cordis 同源。

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
dsh runtime store: /Users/you/.npm-global/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai
dsh version      : 0.1.2-alpha.5
- tty node_modules/@deepseek-ai/dsh-tools:
    before: ../../../../node_modules/.pnpm/@deepseek-ai+dsh-tools@0.1.1-rc.2_.../node_modules/@deepseek-ai/dsh-tools
    after : /Users/you/.npm-global/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-tools
relinked 22 @deepseek-ai entries
audit log appended: /Users/you/coding/project/dsh-plugin-kit/node_modules/.dsh-links.log
```

## 修改记录

每次实际运行都会把逐条 before/after 追加到 `node_modules/.dsh-links.log`
（带时间戳与 dsh 版本；位于 node_modules 内，不进入 git）。

查看：

```bash
tail node_modules/.dsh-links.log
```

## 顺带：宿主主题的名字快照（样式变量守卫的燃料）

客户端半体只许引用宿主主题里**真实存在**的 `--dsw-*` 变量——写错一个名字，那条
`border` / `background` 声明会**整条作废**（框直接消失，规则与四个真机现场见
[conventions.md § 客户端半体 ④](./conventions.md#客户端半体四条硬规矩)）。那张名字表是**生成物**，
从同一个运行时存储目录里的 `@deepseek-ai/dsh-client-ui-theme/lib/client.js` 抽出来：

```bash
node scripts/sync-dsh-theme-tokens.mjs            # 重新生成 scripts/fixtures/dsh-theme-tokens.json
node scripts/sync-dsh-theme-tokens.mjs --check    # 拿真宿主逐字比对：0 一致 / 1 有差异 / 2 找不到宿主
```

**换 dsh 版本、或跑完本脚本重链之后，顺手 `--check` 一次**：它同时是「宿主改名或删掉了某个
token，而我们还在用」的告警。这一档需要本机装着 `dsh`，所以**不进 CI**（与
`check-dsh-peers.mjs --app-boot` 同一档）；静态那一半由 `client-lint` 的检查四在
`pnpm -r typecheck` 里跑。

## 注意事项

- **`pnpm install` 会重建 node_modules，冲掉这些链接**。装完依赖后需重新执行一次本脚本。
- 若某个包在 dsh 运行时里不存在（改名/下线），脚本会移除该链接并告警——运行期若仍被
  import 会直接报 `ERR_MODULE_NOT_FOUND`，这正是兼容性信号，不是 bug。
- 该脚本只改 node_modules 里的 symlink，不改任何源码/package.json/锁文件。

## Windows

真机（Windows 11 ARM64）实测踩过的两点，脚本已处理：

- **探测运行时不再用 `process.env.HOME`**（那在 Windows 上不存在，是 `USERPROFILE`），
  改用 `os.homedir()`；候选里同时列了 npm 全局的两种布局——POSIX 是
  `<prefix>/lib/node_modules/...`，Windows 直接在 `<prefix>/node_modules/...`。
  旧版在**构造候选数组时**就抛 `ERR_INVALID_ARG_TYPE`，整个脚本第一步即死。
- **链接用 junction 而不是符号链接**：Windows 建目录符号链接要「开发者模式」或管理员
  （`SeCreateSymbolicLinkPrivilege`），普通用户直接 EPERM，而
  `scripts/windows/README.md` 的流程正是让普通用户跑这一步。junction 只认绝对目标，
  所以脚本内部统一按 resolve 后的路径建链、并按 resolve 后的路径判断「是否已指向」。
  重复执行仍然幂等（第二次 `relinked 0`）。
