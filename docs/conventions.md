# 规范：命名 · 提交 · 文档 · 编号

> **本文是「规矩」的唯一归宿。** 架构见 [architecture.md](./architecture.md)；
> 发版流程见 [../RELEASING.md](../RELEASING.md)（不在这里重复）。

## 文档分层

三层，每类知识**只在且仅在一个层级**展开，其他位置只引用不复制：

| 层 | 位置 | 放什么 | 读者 |
|---|---|---|---|
| **L0** | 仓库根 + `docs/` | 跨包共享：定位、架构、规范、术语、跨包路线图、诊断路径、真机约束 | 新人 / 接手整个仓库的人 |
| **L1** | `packages/<pkg>/` | 包内独有：使用 / 配置 / 工具、缺陷编号、包内待办、包特有深层设计 | 改这个包的人 |
| **L2** | 代码注释 | 「这段代码为什么长这样」，带缺陷编号 | 读这段代码的人 |

### 知识归属表（唯一归宿）

| 知识类型 | 归宿 |
|---|---|
| 项目定位 / 装哪个 | L0 [`README.md`](../README.md) |
| 12 包关系与协作 | L0 [`docs/architecture.md`](./architecture.md) |
| 命名 / 提交 / 文档 / 编号规范 | 本文 |
| 跨包路线图 | L0 [`ROADMAP.md`](../ROADMAP.md) |
| 跨包通用故障诊断路径 | L0 [`docs/troubleshooting.md`](./troubleshooting.md) |
| **跨包行为约定**（回环围栏 / body 围栏 / 截断信号） | L0 [`docs/architecture.md` § 7](./architecture.md#7-一条请求经过什么) |
| AI 真机测试约束 | L0 [`docs/agent-real-test.md`](./agent-real-test.md) |
| 术语 | L0 [`docs/glossary.md`](./glossary.md) |
| 发布流程 | L0 [`RELEASING.md`](../RELEASING.md) |
| 开发环境（DSH runtime 链接） | L0 [`docs/link-dsh-runtime.md`](./link-dsh-runtime.md) |
| 包内使用 / 配置 / 工具 | L1 `packages/<pkg>/README.md` |
| 包内缺陷编号 | L1 `packages/<pkg>/DEFECTS.md` |
| 包内待办 | L1 `packages/<pkg>/ROADMAP.md` |
| 包特有的深层设计 / API | L1 `packages/<pkg>/docs/`（仅需要时建） |
| **已完成批次 / 设计方案的冻结记录** | L1 `packages/<pkg>/docs/`（设计方案，例：[codegraph/docs/p0-plan.md](../packages/codegraph/docs/p0-plan.md)——首行即标「已实现」，**不是活待办**）；**指针表**在各包 `DEFECTS.md` §4「冻结记录」，检索方式 `git show <sha>:<path>` |
| **入库产物与 CI 产物闸门** | L0 [docs/conventions.md § 真机脚本与 CI 接线](./conventions.md#真机脚本与-ci-接线) |
| **投稿材料**（面向 DSH 插件市场） | L0 [`docs/pr-body-dsh-market.md`](./pr-body-dsh-market.md)（**提给市场仓库的 PR 正文**，其相对链接指向目标仓库）与 [`docs/community-submission.json`](./community-submission.json)（提交载荷）。两者都是**对外投稿物**，不是本仓架构 / 规范；**保留原路径**——`community-submission.json` 可能被市场按 `@main/docs/` URL 取 |

### L0 / L1 的边界判据

> **改一个包就能做完 → L1。要同时改 ≥2 个包，或要动 L0 资产（CI / 脚本 / 规范 / 客户端硬规矩）→ L0。**

例：「跳板机（ProxyJump）」同时涉及 `docker` 与 `tty` 两套连接构造 → **L0**。
「docker 的 CLI 面补全」只动一个包 → **L1**。

### L0 内部：architecture 与 conventions 谁管什么

上一条只分开了 L0 与 L1，分不开 L0 里这两个文件——**同一个事实在两边各写一份全文**就是这么发生的。
可执行的区分：

> **讲「系统怎么运作、谁依赖谁、数据怎么流」→ [architecture.md](./architecture.md)；
> 讲「改代码时必须守什么、怎么命名怎么提交」→ 本文。
> 同一事实两边都要出现时：按「它是在描述系统，还是在约束你」选一边放正文，另一边**只留指针**。**

对照（本次实际的分工）：请求链路与三条行为约定 → architecture § 7（描述系统）；
编号 / 命名 / 提交 / 文档分层 / 客户端半体写法 → 本文（约束你）。

## 文档分档

**不是每个包都需要全套文档。** 按实测规模定档：

| 档 | 判据 | 该有哪些文档 |
|---|---|---|
| **复杂** | README > 250 行 **或** 已有**作为本包序列权威**的 `DEFECTS.md`（**转入台账不计**，见下）**或** 包内 `docs/` ≥ 2 篇 | `README.md` + `DEFECTS.md` + `ROADMAP.md` + `docs/`（按需） |
| **中等** | README 100–250 行 | `README.md`（≤ 250 行）+ 按需 `DEFECTS.md` / `ROADMAP.md` |
| **简单** | README ≤ 100 行 | 仅 `README.md`（≤ 100 行） |

当前档位（数字会漂，以实际文件为准）：

| 档 | 包 |
|---|---|
| 复杂 | `docker` · `tty` · `codegraph` |
| 中等 | `kit` · `rss` · `search` · `mcp` |
| 简单 | `profile` · `env` · `prompt` · `kit-settings` · `all` |

**三条纪律**：

1. **升档不强制回填**：档位只约束**新写**的文档。已有超长 README 登记为债务，不强制裁剪。
2. **中英同结构**：有 `README.en.md` 的包，两版章节结构必须一致（不要求逐字对应）。
   **简单包免英文**（当前 `kit` / `kit-settings` / `all` 无英文版，属已登记债务）。
3. **不写死计数**：文档里不写「N 条路由」「N 个测试」这类会漂的数字，改成指向脚本 / CI 输出。
   阈值、命令、基线数字属**技术事实**，只增不改；发现过期或自相矛盾**只加标注，不擅自"修正"**。

## 编号规范

缺陷编号是**包内序列**，前缀由包自定：

| 包 | 前缀 | 当前范围 |
|---|---|---|
| `docker` | `D` | `D01`–`D138` |
| `tty` | `D` | `D01`–`D61` |
| `codegraph` | `CG` | `CG01`–`CG63` |
| `kit` | `D` | `D01`–`D05`——**转入镜像**：这些编号的权威记录在**原包**（主要是 `codegraph CG`），kit 侧只是「改 kit 的人不必翻别人的台账」的入口。**引用时优先写原编号**（如 `codegraph CG05`）；kit 内部新发现的缺陷才接 `D06` 往后 |
| 其它包 | 需要时自定，从 `01` 起 | — |

**硬规矩**：

1. **包内序列不共享**：`docker D13` 与 `tty D13` 是两条完全不同的缺陷。新包的 `DEFECTS.md`
   第一行必须写明「本包序列，与其它包不共享」。
2. **跨包引用一律写 `<包名> <前缀><号>`**：`codegraph CG05`、`tty D61`、`docker D13`。
   **裸编号只允许出现在该编号的属主包内。**
   > 这条以前被违反过：`packages/kit/src/*` 里写的是裸 `CG05` / `CG13` / `CG36`，
   > 而定义在 `packages/codegraph/DEFECTS.md`；`README.md` / `scripts/client-lint.mjs` /
   > `vitest.config.ts` 里写裸 `D61`（tty 的），而 **`docker` 也有一个 D61**（聚合日志贴底），
   > 同号不同义。跨包引用一律补包名。
3. **编号不回收、不重号**：新缺陷接在最大号之后；已关闭的编号**保留在表内**并写明关闭理由。
4. **索引表不写行号**：修复后代码移了位，审计时点的行号只会误导。定位实现用
   `git log -S'<症状关键词>'`，或读代码里带编号的注释。
5. **台账自洽**：`DEFECTS.md` 的「现状」行数字必须与表内现算一致。
   `codegraph` 有 `test/defects-ledger.test.ts` 守卫这条（其它包按需补）。
6. **外部真机缺陷报告用 `报告 #N`**（带 `#`）：`#N` 只指**外部报告**的序号，
   **不是检索入口**——其结论必须已经落到某个台账号或某条 ROADMAP 行，否则就是漏记。
   **台账号永不带 `#`**，两种形态因此永不冲突。
   > 为什么需要它：真机验证脚本与测试里会引用「用户报的第 N 份缺陷报告」，而它既不属于任何包、
   > 也不该占用台账号段。实测撞过车：`packages/kit/test/decode.test.ts` 里的「报告 D2」与
   > `kit D02`（权威记录 = `codegraph CG36`）在**同一目录、同一个号、不同含义**。
   > **报告号与台账号之间不建立自动映射**：只有当某条台账行的症状与报告原文逐字对得上时，
   > 才在括号里补「（见 `codegraph CGxx`）」；对不上就只写 `报告 #N`，不要猜。

## 命名

| 对象 | 规则 | 例 |
|---|---|---|
| 包名 | `@hyzyn/dsh-<name>` | `@hyzyn/dsh-docker` |
| 插件 id | 短横线小写，与包名后缀一致 | `docker`、`kit-settings` |
| 配置命名空间 | 同插件 id | `ctx.settings` 里的 `docker` |
| HTTP 路由 | `/api/dsh-<插件 id>/…` | `/api/dsh-docker/containers` |
| 环境变量 | `DSH_<插件 id 大写>_<项>` | `DSH_RSS_DIGEST_DIR` |
| 缺陷编号 | 见上 | `docker D138` |

## 提交

- **Conventional Commits**，中文正文：`fix(mcp): 修复连接测试超时`。
  跨包改动可不带 scope（`docs: …`）。
- **用户可见变更请附截图或验证证据**。
- **提交信息也要过公网 IP 闸门**：`.githooks/commit-msg` 调 `scripts/check-no-public-ip.mjs`。
  真实内网 IP、真实主机名一律换成文档网段 / 中性取值。
- **提交前门禁**：`pnpm typecheck && pnpm build && pnpm test && pnpm aggregate`。
  `.githooks/pre-commit` 会自动重建产物并 `git add`，然后按 **index** 扫公网 IP。
- 增删插件后必须跑 `pnpm aggregate` 重新生成 `packages/all` 的聚合清单。

## 插件包解剖

以 `templates/hello` 为范本（`pnpm create-plugin <name> [id]` 生成）：

| 文件 / 字段 | 作用 |
|---|---|
| `package.json#dsh.bundle.patch` | 指向 `cordis.patch.yml`，声明本包是 bundle 补丁层 |
| `cordis.patch.yml` | `insert` 一行，把插件挂进 profile 阵容 |
| `src/index.ts` | 宿主半体：导出 `{ name, inject, apply }` 形状的 Cordis 插件 |
| `package.json#dsh.client` | 可选：声明浏览器半体，Web GUI 以 `/plugins/<id>/client.js` 加载 |

服务注入两种写法：`inject: ['tools', 'webServer']` 后直接 `ctx.tools`；或运行时 `ctx.get('tools')` 判空。
配置用 schemastery 导出同名 `Config` schema。

**新增一个包时要建的文档**（按档位）：

- 简单：`README.md`（≤100 行，中英同结构或按「简单包免英文」）
- 中等：`README.md` ≤250 行
- 复杂：再加 `DEFECTS.md`（第一行写明「本包序列」）与 `ROADMAP.md`
- 任何档位都要在 [architecture.md § 包清单](./architecture.md#2-包清单) 加一行

## 客户端半体：两条硬规矩

### ① 跟宿主建连的地址，基址只能来自宿主注入的 `__DSH_TRANSPORT__`

别从 `location.protocol` / `location.host` / `location.hostname` / `location.origin` /
`location.port` 拼地址，也别硬编码 `ws://` / `wss://`：

```js
// ❌ 浏览器里一切正常，桌面版算出连不上的地址
const url = (location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + location.host + '/api/x/ws'
// ✅ 两种形态都对
const base = new URL(globalThis.__DSH_TRANSPORT__?.streamBaseUrl ?? document.baseURI, document.baseURI)
const url = (base.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + base.host + '/api/x/ws'
```

原因：**桌面版的页面 origin 不是 HTTP，而是 Electron 自定义协议 `dsh-app://app`**，真实宿主在另一个
origin 上。从 `location` 推出来的地址在浏览器里完全正常、**只有桌面版连不上**；而 CDP 冒烟驱动的是
`http://127.0.0.1:3082`（那里 `location` 恰好是对的）、各包 preview harness 里是假 WebSocket——
**四层防线都看不见它**。`tty D61` 就是这么发生的。

`pnpm -r typecheck` 里的 `scripts/client-lint.mjs` 会静态拦下这两类写法
（AST 检查，注释与字符串免疫；规则与成因见 `scripts/client-host-url.mjs`），覆盖全部客户端半体。

### ② 要判对错的客户端逻辑，抽成 `client-src/*.js` 纯模块 + vitest 用例

`client.js` 是构建产物、不在 vitest 层测；`client-lint` 只查静态问题（名字解析、宿主地址来源）、
**不验行为**——逻辑留在组件闭包里就等于没有测试入口。`client-lint` 查的是**全量**
`client-src/**` 而不只是入口，兄弟模块同样受管。

范例：`packages/tty/client-src/ws-url.js` + `packages/tty/test/ws-url.test.ts`
（用例里必须有一条 `dsh-app://app` 场景）。

## 三条跨包一致的行为约定（正文不在这里）

三条的名字是 **回环围栏** · **body 围栏** · **截断要有信号**。它们的正文、以及它们为什么长这样
（请求链路图 + 每条对应的历史事故），唯一归宿在
[architecture.md § 一条请求经过什么](./architecture.md#7-一条请求经过什么) —— 那边上下文更完整，
本文只留这个检索入口，不复制。

## 真机脚本与 CI 接线

- **真机脚本进不了 CI**（需要真机 / 真宿主 / 真浏览器）。所以：能静态断言的性质，补一条
  vitest 守卫（例：`packages/codegraph/test/verify-scripts-safety.test.ts` 断言真机脚本
  「隔离 DSH_HOME」「自证真实配置未变」）；真机脚本的正确性**只能靠跑一遍**。
- **包内脚本不搬家**：`scripts/` 下的包内脚本与 `package.json` 的 `smoke` / CI step 直接接线，
  移动会打断它们。项目级 Runbook 见 [agent-real-test.md](./agent-real-test.md)。
- **CI 与发布闸要成对**：只在 CI 补而漏了 `release.yml`，发布路径仍能整条绕过。
- **产物闸门：`lib/` 那半边必须带 `:(glob)`**。git 默认 pathspec 下 `*` **不递归目录内容**，
  而 `'packages/*/lib'` 这个模式要求路径以 `lib` 结尾——它**命中 0 个文件**，闸门恒绿。
  实测命中数（命令如下，可随时重算）：

  ```sh
  git ls-files -- 'packages/*/client.js'      | wc -l   # 10  这半边是好的
  git ls-files -- 'packages/*/lib'            | wc -l   #  0  失效：不递归
  git ls-files -- ':(glob)packages/*/lib/**'  | wc -l   # 99  ✅ 正确写法
  git ls-files | grep -cE '^packages/[^/]+/lib/'        # 99  与上一行相等才算对
  git ls-files -- 'packages/*/lib/*'          | wc -l   # 100 ⚠️ 多 1 个
  ```

  第 5 行多出来的那个是 `packages/tty/scripts/lib/test-sshd.mjs`——默认 pathspec 下 `*` 会跨 `/`
  把它也算了进来，所以**不要**图省事写 `'packages/*/lib/**'`。正确形式：

  ```sh
  git diff --exit-code -- 'packages/*/client.js' ':(glob)packages/*/lib/**'
  ```

  **现状差异**：`.githooks/pre-commit` 用的**是**正确写法（`SPEC_LIB=':(glob)packages/*/lib/**'`）；
  `.github/workflows/ci.yml` 用的**仍是失效写法**——**本地防得住、CI 防不住**。
  该洞已登记为 L0 待办（见 [ROADMAP.md](../ROADMAP.md)），本轮**不改 CI**。
