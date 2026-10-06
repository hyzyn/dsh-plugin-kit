# AGENTS.md

本文件是**入口与门禁**，不是知识库。规矩的**判据与代价**、以及每条规矩的**唯一归宿**在 `docs/`——
本文件只留**动作名与入口**，判据、代价、细则一律指向那一处（复制即造第二份真相源，
见 [docs/conventions.md](docs/conventions.md#文档分层)）。

## 先读什么

| 想知道 | 读 |
|---|---|
| 项目是什么、装哪个、怎么开发新插件 | [README.md](README.md)（含文档地图） |
| 系统怎么运作、12 个包谁依赖谁 | [docs/architecture.md](docs/architecture.md) |
| **改代码必须守什么**（命名 / 提交 / 文档分层 / 编号 / 客户端半体） | [docs/conventions.md](docs/conventions.md) |
| 真机测试怎么跑、什么算通过 | [docs/agent-real-test.md](docs/agent-real-test.md) |
| 某个包的用法 / 缺陷台账 / 待办 | `packages/<pkg>/README.md` · `DEFECTS.md` · `ROADMAP.md` |

**知识只在一个层级展开**：L0 在仓根与 `docs/`、L1 在 `packages/<pkg>/`、L2 在代码注释里。
看到同一事实有两份全文，那是债，不是方便。

## 命令

**前置**：Node ≥ 22.19 与 pnpm 10（[README.md § 系统要求](README.md#系统要求)）。这是**强制**的：
根 `package.json` 的顶层 `engines` + `.npmrc` 的 `engine-strict=true` 让不满足的环境在
`pnpm install` 时**直接失败**（`ERR_PNPM_UNSUPPORTED_ENGINE`、退出码 1，不是警告）。
四处的声明必须自洽，`pnpm engines:check` 会拦（判据与实测见
[docs/conventions.md § 环境下限](docs/conventions.md#环境下限声明--engine-strict-才真的会拦)）。

```sh
pnpm install                                        # 安装
pnpm -r typecheck                                   # 全仓类型检查 + 客户端四条硬规矩的静态检查
pnpm -r build                                       # 构建（lib/ 是**入库产物**，改源码后必须重建）
pnpm test                                           # 全仓单测（根 script 是 `vitest run`，**不是** -r 的别名）
pnpm create-plugin <name> [id]                      # 生成新插件包（复制 templates/hello）
pnpm aggregate                                      # 重新生成聚合清单（新增/删除包后必须跑）

# 提交前的门禁（顺序以 docs/conventions.md § 提交 为准；typecheck / build 是上面前两条的别名）
pnpm typecheck && pnpm build && pnpm test && pnpm aggregate
```

改了 `packages/*/src` 就要重建并**一起提交** `lib/`——CI 有一道产物闸门：
build 之后 `git diff` 必须干净（`scripts/` 下那些脚本是例外，它们不入库产物）。

`.githooks/` 里的钩子**不会自动生效**，先启用一次（否则上面那条产物闸门全靠你自己记得跑）：

```sh
git config core.hooksPath .githooks                 # 克隆后做一次
```

启用后钩子会替你把产物重建并入本次提交，另跑两道闸门——**具体行为与顺序以
[docs/conventions.md § 提交](docs/conventions.md#提交) 为准**（本文件不复述机制）。

## 不可逆的边界（做之前先问）

下面这些**动作不要自作主张**，先跟维护者确认。**每一条的判据与代价见**
[docs/conventions.md § AI 协作边界](docs/conventions.md#ai-协作边界什么改动要先问)
（**以那一节为准**；本表只列动作名）：

- `git commit` / `git push`
- 删除或改名任何文件
- 改 `.github/` 与 `.githooks/`
- 增、删、改任何 `Dxx` / `CGxx` 编号
- 放宽隔离或安全前提（独立 `DSH_HOME`、临时资源前缀、自证配置未变）

**不必先问**：改文档正文、修死链、同步中英、给守卫加判据与 fixture 反例、
把散落的事实上收到知识归属表指定的归宿。

## 完成定义

一个改动算完，要满足：相关包的 `typecheck` 与单测通过、**全仓闸门绿**
（`docs/` 与包清单的一致性、i18n 目录、客户端地址来源、kit 钉子一致、链接与锚点，
各自都有守卫），且新增规则配了守卫或反例用例——**没有守卫的规矩会在下一次改动里漂掉**。
