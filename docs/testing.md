# 测试与覆盖率：口径 · 命令 · 阈值规矩

> **本文管「跑什么、算什么、哪些线是故意画的」。** 真机脚本怎么跑、什么算通过见
> [agent-real-test.md](./agent-real-test.md)；门禁与 CI 接线的规矩见
> [conventions.md § 真机脚本与 CI 接线](./conventions.md#真机脚本与-ci-接线)。
> **覆盖率的唯一实现是 [`vitest.config.ts`](../vitest.config.ts) 的 `coverage` 块**——
> 本文只讲它为什么长这样，参数改在那里改，不许在这里抄一份。

## 三个测试面，别混着看

| 面 | 跑法 | 在哪 | 判什么 |
|---|---|---|---|
| **单测 + 集成型用例** | `pnpm test` | `packages/*/test/`、`scripts/test/`（`vitest.config.ts` 的 `include`） | 宿主半体纯逻辑、从浏览器半体抽出的纯模块、仓库脚本的纯逻辑 |
| **真机脚本** | `pnpm verify:list` 列出可粘贴命令 | 根 `scripts/` 与各包 `scripts/` | 真宿主 / 真浏览器 / 真 PTY——**进不了 CI**，见 [agent-real-test.md](./agent-real-test.md) |
| **构建产物** | 各包 `build` | `packages/*/lib`、`packages/*/client.js` | esbuild / tsc 产物，走各自管线，**不在 vitest 层测** |

前两面的边界值得记住：**留在 `client-src/index.js`（浏览器 bundle 入口）里的逻辑等于没有测试入口**
——要判对错的逻辑必须抽成不依赖 DOM 的纯模块（`packages/tty/client-src/ws-url.js` 这类），
抽出来才自动回到上面的统计里。规矩正文见
[conventions.md § 客户端半体：三条硬规矩](./conventions.md#客户端半体三条硬规矩)。

## 命令

```sh
pnpm test                      # 全量用例（= vitest run），CI 与提交前门禁跑的就是它
pnpm test:watch                # 开发时挂着跑
pnpm test:coverage             # 全量用例 + 覆盖率（v8 provider）
pnpm test:coverage --reporters=dot                    # 想看用例列表时可以加参数
npx vitest run packages/tty/test/ws-url.test.ts       # 只跑一份（CI 的 test_filter 也是这个形态）
```

覆盖率要**人眼可读的 HTML**时临时开一个 reporter（默认没开，产物没必要入库）：

```sh
pnpm test:coverage --coverage.reporter=html    # 出到 coverage/index.html
```

## 覆盖率口径：只统计「有测试入口」的面

`coverage.include` 收三个面：`packages/*/src/**`、`packages/*/client-src/**`、`scripts/**/*.mjs`。
**按设计不在本层测的代码被显式排除**——否则全量口径会把这些 0% 的面全算进来，得出一个人人会
学会无视的假数字（三份浏览器 bundle 入口合计上万行语句，真机 / Windows / E2E 脚本又是几千行）。
排除项各有理由，**加一条排除必须同时说清理由**（写在 `vitest.config.ts` 的注释里）：

| 排除 | 为什么 |
|---|---|
| `**/client-src/index.js` | 浏览器 bundle 入口，esbuild 产物，由各包的 smoke / verify 脚本验证；判对错的逻辑该抽成纯模块（抽出来的自然回到统计里） |
| `scripts/lib/**` | 真机脚本共享的隔离引导，由 `scripts/test/live-scripts-safety.test.ts` 读源码钉住，不是拿覆盖率衡量的东西 |
| `scripts/fixtures/**` | 测试夹具自身 |
| `scripts/windows/**` | Windows E2E，真机面 |
| `scripts/test/**` | 测试代码自己 |
| `**/*.d.ts` | 类型声明，没有可执行行 |

**口径前后差多少，现算，不写死**（数字会漂，规矩见
[conventions.md § 文档分档](./conventions.md#文档分档) 的「不写死计数」）：

```sh
pnpm test:coverage        # 末三行 text-summary 就是当前口径的 Statements / Branches / Functions / Lines
```

报告产物落在 `coverage/`：`coverage-summary.json`（机器读——CI 门禁 / 徽章 / diff-coverage 那类
消费），终端里同时打 `text` 表格与 `text-summary`。**`coverage/` 是本地产物、已在 `.gitignore`**，
连同目录一起被排除出 `check-doc-links.mjs` 的扫描面。

## 夹具自己建的临时资源，自己删

测试夹具里凡是用 `mkdtempSync` / `mkdtemp` 建了临时资源的，**清理函数必须删掉它**——不是「最好删」，
是「不删就是一条看不见的泄漏」：它不会让任何断言变红，只有去看文件系统才发现，而它恰好长在「跑测试」
这件事上（跑得越多、脏得越快，最后没人敢全量跑）。

**实测**（2026-10-02，`packages/devenv/test/fake-docker.ts`）：那个夹具每装一次就建一个临时目录，
而 `cleanup()` 只还原了 `PATH` 与环境变量、从不删目录。一轮全量用例之后：

```
$ ls -d $TMPDIR/dsh-devenv-fake-docker-* | wc -l
570
```

每个目录里一个 `docker` 脚本 + 一个 `calls.log`。两条配套的做法：

1. **清理函数里删，且删在最前**（后面的环境还原不会失败，而此时 `PATH` 还没还原）；
2. **临时的项目目录在 `beforeAll` 里建，不在模块顶层**——顶层建的目录在**导入期**出一点问题
   （哪怕只是一个语法错）之后就再也没机会删：文件一跑挂、`afterAll` 根本没注册（实测留了一个）。

判据由**行为断言**钉住（`packages/devenv/test/fixture-hygiene.test.ts`：装一次、清一次、看目录还在不在），
不是「读源码找没找到 `rmSync`」——后者能被一句注释骗过去。

## 阈值是棘轮，不是目标线

`coverage.thresholds` **只钉已经过 80% 的包**，各留余量防无意识回落。**弱包故意不钉**——
钉一条达不到的线只是把「没测」变成「红」，不会多出任何用例；爬覆盖率要爬的是用例，不是数字。
所以改阈值的唯一正当情形是**用例先落地、数字跟着涨**，改完在提交信息里说清落了哪些用例。

**2026-10-02 撤掉了 kit 那条钉子**（它原先钉 84，而实测是 72.43%）——按上面这条规矩，72% 的包
本来就不该被钉。撤的原因是它**名存实亡**：`chrome-cdp.ts`（166 句，6.6%）、`scope.ts`（30 句，20%）、
`settings.ts`（81 句，8.6%）三个文件落地时没补用例，而覆盖率不进 CI，所以那条红线一直红着、也没人看见。
撤的具体数字与「怎么爬回去」写在 [`vitest.config.ts`](../vitest.config.ts) 的注释里（唯一归宿）。
**要爬回 84 是给那三个文件补用例（约 277 句），不是把数字改回去。**

**余量不是装饰：覆盖率输出本身就有小幅 run-to-run 抖动。** 2026-10-02 同一天连跑三次
`pnpm test:coverage`（三次之间只有 `vitest.config.ts` 的注释差异，行为应完全相同），
**退出码三次都是 0**，但计数不同：

| 运行 | Lines covered / total | Branches covered / total |
|---|---|---|
| 1 | 17479 / 30166 | 5838 / 7380 |
| 2 | 17476 / 30166 | 5833 / 7376 |
| 3 | 17476 / 30166 | 5836 / 7379 |

逐文件比对第 2 / 3 次，波动定位到三处，形态一律是 `total` 与 `covered` 同时 +1：

```text
packages/docker/src/ssh-exec.ts    branches  414 → 415 / 307 → 308
packages/tty/src/ssh-config.ts     branches   84 →  85 /  76 →  77
packages/codegraph/src/index.ts    branches 1141 →1142 / 930 → 931
```

成因是 v8 provider 的**分支枚举依赖实际执行到的路径**（这三处都涉及 spawn / 解析，跨 worker
的执行与合并会有出入），**不是用例 flaky**——没有一次失败。所以守住阈值的**不是确定性，
而是上面留的余量**：codegraph/src 共 2569 行，3 行抖动 ≈ 0.12%，离 90% 的线还有 2.3 个点。
**真要接成门禁，得按这份记录重算余量，并先确认跨平台会不会把这个抖动放大**
（见下一节第 1 条）。

复核方法：连跑两次，每次跑完立刻把 `coverage/coverage-summary.json` 另存一份（它每跑一次会被
重写），再逐文件比 `lines` / `branches` 字段。

> 上面的数字是**带日期的观测记录**（规矩见
> [conventions.md § 文档分档](./conventions.md#文档分档) 的「只增不改」），**不是当前状态**；
> 要看今天的样子就跑一次 `pnpm test:coverage`。

## 为什么不进 CI 门禁

覆盖率是**本地工具**：`pnpm test:coverage` 不会出现在 `.github/workflows/ci.yml` 里，
提交前门禁（[conventions.md § 提交](./conventions.md#提交)）也仍是
`pnpm typecheck && pnpm build && pnpm test && pnpm aggregate`。理由与代价：

- 阈值只在**本机**验过；三平台（ubuntu / windows / macos）矩阵上是否稳定**没有验证过**，
  直接当门禁可能把平台差异变成假红。本仓库的用例靠参数注入覆盖双平台、理论上不漂移，
  但「理论上」不足以当门禁——**要当门禁，先在三平台各跑一轮确认阈值不漂**。
- **真机脚本进的 CI 与发布闸必须成对**，覆盖率要进门禁时照同一条规矩办：`.github/workflows/ci.yml`
  与 `release.yml` 一起改，别只补一处让发布路径绕过去（这条本仓已经吃过一次，见
  [conventions.md § 真机脚本与 CI 接线](./conventions.md#真机脚本与-ci-接线)）。
- 覆盖率作为**本地信号**已经够了：它进不了 CI 的唯一后果是「没人替你自动看」，而它本来的用途
  就是「改这个包之前先看哪块没测」，不是拦截提交。
