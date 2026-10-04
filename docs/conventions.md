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
| **agent 的入口与门禁**（先读什么 / 确切命令 / 不可逆边界 / 完成定义；**只做路由，不复制规矩正文**） | 仓根 [`AGENTS.md`](../AGENTS.md)。它是**入口不是归宿**：每一条的真相源仍在本文或 `docs/`——加内容前先读本文 [§ 常量](#常量什么该提什么不该提) 那条判据的同款问法：「这条会不会让我做出不同的 action？它的真相源在哪？」守卫是 `scripts/test/string-contracts.guard.test.ts`（入口文件存在 + 四份 L0 都被路由到 + 没抄分节标题）。**若要加 `CLAUDE.md`：只写一行 `@AGENTS.md`，不要维护两份独立指令**（业界口径，见该守卫的文件头注释） |
| 12 包关系与协作 | L0 [`docs/architecture.md`](./architecture.md) |
| 命名 / 提交 / 文档 / 编号规范 | 本文 |
| 跨包路线图 | L0 [`ROADMAP.md`](../ROADMAP.md) |
| 跨包通用故障诊断路径 | L0 [`docs/troubleshooting.md`](./troubleshooting.md) |
| **跨包行为约定**（回环围栏 / body 围栏 / 截断信号） | L0 [`docs/architecture.md` § 7](./architecture.md#7-一条请求经过什么) |
| **字符串契约常量的判据**（什么该提常量、什么不该；服务名 / 环境层名的归宿与守卫） | L0 本文 [§ 常量](#常量什么该提什么不该提) |
| **面板端 GUI 的文案与语言（i18n）** | L0 [`docs/i18n.md`](./i18n.md)（方案 + 规范片段 + 进度表） |
| **跳板机（ProxyJump / ProxyCommand）完整实现的方案**（2026-09-25 已按它落地，`ProxyCommand` 见其 §6.1 的闸门定案表；保留为**活**的作业面：多跳链与后续坑仍以它为准） | L0 [`docs/proxyjump-plan.md`](./proxyjump-plan.md) |
| **能力开关「就地提权」的当前权威实施方案**（2026-09-26 已按它落地：两条通道、落点、威胁模型、逐 PR 顺序；实施偏差见其附录 C。原先的 `…-plan.v2.md` 已按命名规范改名成本文件名） | L0 [`docs/capability-elevation-plan.md`](./capability-elevation-plan.md) |
| **开发数据套件（SQL 只读 / NoSQL 受限 / 消息中间件控制台）的方案**（2026-10-01 立项：定位与边界、三条数据通路、三档能力模型、必须先真机确认的 C1–C6、分步顺序与验收清单。**进展以三个包各自的状态真源为准，不看本行**：`devdata` → [`packages/devdata/ROADMAP.md`](../packages/devdata/ROADMAP.md)、`devenv` → [`packages/devenv/ROADMAP.md`](../packages/devenv/ROADMAP.md)、`devfront` → [`packages/devfront/ROADMAP.md`](../packages/devfront/ROADMAP.md)。三包均已建并有真机落地记录） | L0 [`docs/devdata-plan.md`](./devdata-plan.md) |
| **能力开关「就地提权」方案的 v1（已删除，仅历史）**——它设计的「宿主终端确认码」通道**在代码里不存在**（`CapabilityGrantVia` 只有一个值 `'file'`），保留只为追溯取舍过程；**不要照着执行**（改动去上面那份） | 冻结指针 `git show 79ca434e:docs/capability-elevation-plan.md`（223 行）· 检索入口见 [`ROADMAP.md` 的「已由 L0 资产承接」表](../ROADMAP.md) |
| AI 真机测试约束 | L0 [`docs/agent-real-test.md`](./agent-real-test.md) |
| 术语 | L0 [`docs/glossary.md`](./glossary.md) |
| 发布流程 | L0 [`RELEASING.md`](../RELEASING.md) |
| 开发环境（DSH runtime 链接） | L0 [`docs/link-dsh-runtime.md`](./link-dsh-runtime.md) |
| 包内使用 / 配置 / 工具 | L1 `packages/<pkg>/README.md` |
| 包内缺陷编号 | L1 `packages/<pkg>/DEFECTS.md` |
| 包内待办 | L1 `packages/<pkg>/ROADMAP.md` |
| **包内已完成落点 / 工作记录**（做完回填的「落点 + 门槛」、逐轮实测、刻意不做的边界） | L1 `packages/<pkg>/ROADMAP.md` 的 `## 已完成（落点 + 门槛）` 节，**形态照 L0 [ROADMAP.md](../ROADMAP.md#已完成落点--门槛) 的同名节**：`### ✅` 与 `## <日期>：` 这类落地记录节**必须排在这一节之后**（包内 ROADMAP 头部写的是「只放还没做的事」——记录不许散在待办里，否则几百行落地记录会把待办淹掉）。判据见 [`scripts/docs-index.mjs`](../scripts/docs-index.mjs) 的 `checkPackageRoadmapLanded`（2026-10-01 起）。落点与门槛写这里，缺陷的症状 / 根因 / 修法仍只在 `DEFECTS.md` |
| 包特有的深层设计 / API | L1 `packages/<pkg>/docs/`（仅需要时建） |
| **已完成批次 / 设计方案的冻结记录** | L1 `packages/<pkg>/docs/`（设计方案，例：[codegraph/docs/p0-plan.md](../packages/codegraph/docs/p0-plan.md)——首行即标「已实现」，**不是活待办**）；**指针表**在各包 `DEFECTS.md` §4「冻结记录」，检索方式 `git show <sha>:<path>` |
| **入库产物与 CI 产物闸门** | L0 [docs/conventions.md § 真机脚本与 CI 接线](./conventions.md#真机脚本与-ci-接线) |
| **测试面与覆盖率口径**（三个测试面怎么分 / `pnpm test:coverage` 的排除项与理由 / 阈值是棘轮不是目标线 / 为什么刻意不进 CI 门禁） | L0 [`docs/testing.md`](./testing.md)（**参数改在 [`vitest.config.ts`](../vitest.config.ts)**，本文只讲为什么） |
| **提 issue 的格式约束**（表单字段 / 自查结果 / 空白 issue 已关闭） | L0 [`.github/ISSUE_TEMPLATE/`](../.github/ISSUE_TEMPLATE/)（两张表单是**字段真相**）+ 本文 [§ Issue](./conventions.md#issue提-issue-的格式约束)（规矩）。字段与 [troubleshooting.md 的通用顺序](./troubleshooting.md#通用顺序)一一对应；schema 与表单内链接的闸门是 [`scripts/check-issue-forms.mjs`](../scripts/check-issue-forms.mjs) |
| **投稿材料**（面向 DSH 插件市场） | L0 [`docs/pr-body-dsh-market.md`](./pr-body-dsh-market.md)（**提给市场仓库的 PR 正文**，其相对链接指向目标仓库）与 [`docs/community-submission.json`](./community-submission.json)（提交载荷）。两者都是**对外投稿物**，不是本仓架构 / 规范；**保留原路径**——`community-submission.json` 可能被市场按 `@main/docs/` URL 取。它们属于**「创意工坊」那条投稿轨道**，与市场卡片上分类标签的实际来源不是一回事：见下行 |
| **插件市场索引**（卡片分类标签从哪来 · 我们 8 条的现状 · 改分类怎么提 PR） | L0 [`docs/market-index.md`](./market-index.md) |
| **CI 与 `package.json` 的脚本双真相源：收敛方案**（改动点 / rename 面 / CI 影响 / 验收；**已执行：方案 A + B**） | L0 [`docs/ci-scripts-plan.md`](./ci-scripts-plan.md)（本文 [§ 真机脚本与 CI 接线](#真机脚本与-ci-接线)只留诊断，执行记录在那份里） |
| **AI 协作边界**（哪些改动必须先问维护者） | L0 本文 [§ AI 协作边界](#ai-协作边界什么改动要先问) |

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
| 复杂 | `docker` · `tty` · `codegraph` · `devdata` · `devenv` · `devfront` |
| 中等 | `kit` · `rss` · `search` · `mcp` |
| 简单 | `profile` · `env` · `prompt` · `kit-settings` · `all` |

> **档位与台账（2026-10-03；`devenv` 的上界 2026-10-04 更新）**：`devdata` / `devenv` 都落在**复杂档**，
> 两者的 `DEFECTS.md` 也都已建立并登记进 `scripts/defects-table.mjs` 与本表（`devdata D01`–`D09` 与
> `devenv D01`–`D03`，后者有几条是 2026-10-03 补立的号；`devenv D03` 是 2026-10-04 立的——真机冷启动
> 档当场抓到的那一条，见 [`packages/devenv/ROADMAP.md`](../packages/devenv/ROADMAP.md) 记-14）。
> **2026-10-04**：`devfront` 也进了复杂档并立了 `D01`——它的 README 早已超过 250 行（分档是**现算
> 的判据**，不是记忆），而那份台账一直没建。`D01` 是本轮改动**自己引入、真机验收抓到**的那一条
> （站点编辑器保存会把不认识的字段整批重建掉），见下 § 客户端卡片那条同族规矩。
> 补立时用的两条判据：① **一次真跑暴露的缺陷要留编号**——已经修在
> 代码里、却没有号，下次同样的坑就没人认得出；② 反之，**修在仓根 / 规范里、包内没有一行代码因它
> 长成现在这样**的缺口不硬塞包内号（例：2026-10-03 `devdata/lib` 那次陈旧产物——它的守卫与规矩
> 都在 L0，编号在包内会得到一个没有 L2 指针的空号）。

**三条纪律**：

1. **升档不强制回填**：档位只约束**新写**的文档。**复杂档不设行数上界**（表里只有它的下界），
   长本身不构成债务，不强制裁剪。**本仓的「债务」只有一个定义：同一事实在两处展开**——
   这与本文开头「每类知识只在且仅在一个层级展开」是同一条规矩：要收敛的是**重复**，不是篇幅。
   各包 README 的行数与档位由 `node scripts/docs-index.mjs` 现算报出（**只报告，不判红**）。
2. **中英同结构**：有 `README.en.md` 的包，两版章节结构必须一致（不要求逐字对应）。
   **简单包免英文**（当前 `kit` / `kit-settings` / `all` 无英文版，属已登记债务）。
3. **不写死计数**：文档里不写「N 条路由」「N 个测试」这类会漂的数字，改成指向脚本 / CI 输出。
   阈值、命令、基线数字属**技术事实**，只增不改；发现过期或自相矛盾**只加标注，不擅自"修正"**。

## 编号规范

缺陷编号是**包内序列**，前缀由包自定：

| 包 | 前缀 | 当前范围 |
|---|---|---|
| `docker` | `D` | `D01`–`D159` |
| `tty` | `D` | `D01`–`D95` |
| `codegraph` | `CG` | `CG01`–`CG65` |
| `kit` | `D` | `D01`–`D05` 是**转入镜像**：这些编号的权威记录在**原包**（主要是 `codegraph CG`），kit 侧只是「改 kit 的人不必翻别人的台账」的入口，**引用时优先写原编号**（如 `codegraph CG05`）；`D06`–`D14` 是**本包自研**：在 kit 内部发现、权威记录就在 kit。 |
| `devenv` | `D` | `D01`–`D03` |
| `devdata` | `D` | `D01`–`D09`（2026-10-03 补立：此前只以叙述形态住在它 `ROADMAP.md` 的 记-12 / 记-14 / 记-16 里） |
| `devfront` | `D` | `D01`–`D01`（2026-10-04 立：本包此前根本没有台账，见下面那条注） |
| 其它包 | 需要时自定，从 `01` 起 | — |

> 表里的上界数字（以及各包 `DEFECTS.md` 文件头自称的范围、「接在 `Dxx` 之后」、跨包互称的范围、
> 索引表末列 `✓` 说的「代码/测试里引用了该编号」）由
> [`scripts/test/defects-table.test.ts`](../scripts/test/defects-table.test.ts) **现算**核对：
> **改了台账就要同步改这里，否则 CI 红**。反向禁止：守卫报红时**只改文档侧**，
> 绝不为让它变绿去增删 / 重排 / 改号任何台账行——「编号不回收、不重号、不丢失」比「数字对得上」硬得多。

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
4. **索引表不写行号、也不保留修复提交 sha**：修复后代码可能移位、整段被删或重写，
   审计时点的行号与 sha 同样只会误导。定位实现用
   `git log -S'<症状关键词>'`，或读代码里带编号的注释。
5. **台账自洽**：`DEFECTS.md` 的「现状」行数字必须与表内现算一致。
   六包（`docker` / `tty` / `codegraph` / `kit` / `devenv` / `devdata`）都在
   [`scripts/test/defects-table.test.ts`](../scripts/test/defects-table.test.ts) 的守卫范围内
   （本包自带的那份是 `packages/codegraph/test/defects-ledger.test.ts`，只管 codegraph）。
   新增包时：把它加进守卫的包清单，上表也补一行。
6. **外部真机缺陷报告用 `报告 #N`**（带 `#`）：`#N` 只指**外部报告**的序号，
   **不是检索入口**——其结论必须已经落到某个台账号或某条 ROADMAP 行，否则就是漏记。
   **台账号永不带 `#`**，两种形态因此永不冲突。
   > 为什么需要它：真机验证脚本与测试里会引用「用户报的第 N 份缺陷报告」，而它既不属于任何包、
   > 也不该占用台账号段。实测撞过车：`packages/kit/test/decode.test.ts` 里的「报告 D2」与
   > `kit D02`（权威记录 = `codegraph CG36`）在**同一目录、同一个号、不同含义**。
   > **报告号与台账号之间不建立自动映射**：只有当某条台账行的症状与报告原文逐字对得上时，
   > 才在括号里补「（见 `codegraph CGxx`）」；对不上就只写 `报告 #N`，不要猜。
7. **新缺陷只做两件事**：对应包的 `DEFECTS.md` 索引表加一行 + 在代码注释里落编号。详细的现场 /
   根因 / 修法 / 反向验证写进 **commit message**，正文不展开。
8. **编号只在「已不再被源码 / 测试注释引用」时才可移出索引表**：被引用的一律**留在原地**——
   索引表是代码注释的**字典**，搬走编号就等于让注释失去解析处。
   **不设「超过 N 行就归档」这种无条件触发器**（表长反映的是引用量，不是债务）：表变长时按编号
   **分段**（在同一张表里加小标题），而不是把号搬走。判据的实测依据见
   [`packages/docker/DEFECTS.md` 的 ⚠️ 标注](../packages/docker/DEFECTS.md#维护规则)。

> **7–8 原本逐字抄在三份 L1 台账里**（`packages/docker` / `packages/tty` / `packages/codegraph`
> 的 `DEFECTS.md` §「维护规则」）：同一条规矩三份正文，改一处漏两处。现在通用条目只在本文写一次，
> L1 **只留指针**（条目编号不变，历史引用不失效）；**包特有条目**（各包的冻结记录说明、
> `CGxx` / `Dxx` 前缀的检索提示等）仍留在各包，**没有上收**。L1 §维护规则 第 4 条那一类
> （阈值 / 口径 / 基线数字只增不改）的 L0 正文在 [§ 文档分档](#文档分档) 的「三条纪律」第 3 条。

## 命名

| 对象 | 规则 | 例 |
|---|---|---|
| 包名 | `@hyzyn/dsh-<name>` | `@hyzyn/dsh-docker` |
| 插件 id | 短横线小写，与包名后缀一致 | `docker`、`kit-settings` |
| **agent 工具名** | `<域>_<动作>`；域 = 该工具**操作的对象或能力**（不是包名）。**不得占用宿主已用的域前缀**——目前保留 `web_`（宿主 `@deepseek-ai/dsh-tool-web` 的 `web_search` / `web_fetch`，那是**公网**）与 `ui_`（GUI 自己的 `ui-*` 插件）。守卫见 `scripts/test/tool-names.test.ts` | `docker_ps`、`tty_open`、`sftp_read`、`site_console` |
| 配置命名空间 | 同插件 id | `ctx.settings` 里的 `docker` |
| HTTP 路由 | `/api/dsh-<插件 id>/…` | `/api/dsh-docker/containers` |
| 环境变量 | `DSH_<插件 id 大写>_<项>` | `DSH_RSS_DIGEST_DIR` |
| 缺陷编号 | 见上 | `docker D03` |
| 文档文件名 | **同一主题只允许一份活文档**：`v2` / `-v3` / `(新)` 这类版本后缀**不得出现在文件名里**。历史版本的去处是仓库已有的机制——内容留在提交历史（`git show <sha>:<path>` 取回），并在该主题的台账 / 文档「冻结记录」小节登记指针；同一份文档要出新版就**原地改写**，让旧版只存在于历史里。唯一的例外必须**显式登记**在 `scripts/docs-index.mjs` 的 `VERSION_SUFFIX_ALLOWLIST` 并写明理由（守卫会查例外是否还真实存在） | `proxyjump-plan.md`（不是 `proxyjump-plan-v2.md`） |

## 提交

- **Conventional Commits**，中文正文：`fix(mcp): 修复连接测试超时`。
  跨包改动可不带 scope（`docs: …`）。
- **用户可见变更请附截图或验证证据**。
- **提交信息也要过公网 IP 闸门**：`.githooks/commit-msg` 调 `scripts/check-no-public-ip.mjs`。
  真实内网 IP、真实主机名一律换成文档网段 / 中性取值。
  **闸门只管公网地址，内网地址靠同一条口径人工守**（本仓是公开仓库，`192.168.x` 写进去照样等于
  公开内网拓扑）：真机脚本与用例的目标地址**不留内网默认值**，必须显式给环境变量
  （`DEVDATA_REDIS_HOST` / `DEVENV_REAL_SSH_HOST` / `DEVDATA_SSH_HOST`），缺了就 SKIP 并说清怎么给。
- **密钥扫描**（2026-10-03 加）：`.githooks/pre-commit` 用 `gitleaks git --staged` 扫**暂存内容**
  （口径与上一条公网 IP 相同——进历史的只有 index），CI 用 `gitleaks git --log-opts=<base>..<head>`
  扫**推送区间**（`ci.yml` 的 `Check the pushed range for secrets`）。**刻意只扫增量**：全历史扫会在
  2026-10 之前那批 marketplace HTML 上命中 862 条既有结果（`generic-api-key` 假阳性），一道总在报
  旧事的闸门会被学会无视。夹具里的假密钥按 `.gitleaksignore` 的容器口径登记（每条是
  `<文件>:<规则>:<行>` 指纹）；**没装 gitleaks 的机器上本地那步会明说跳过，CI 仍无条件扫**。
- **提交前门禁**：`pnpm typecheck && pnpm build && pnpm test && pnpm aggregate`。
  `.githooks/pre-commit` 会自动重建产物并 `git add`，然后按 **index** 扫公网 IP。
  **覆盖率不在门禁里**：它是本地工具，按需 `pnpm test:coverage`（口径、排除理由、阈值棘轮与
  「为什么不进 CI」见 [testing.md](./testing.md)）。
- 增删插件后必须跑 `pnpm aggregate` 重新生成 `packages/all` 的聚合清单。
- **产物与源码必须双向对得上**（`packages/<pkg>/lib/**` ↔ `packages/<pkg>/src/**`）：
  `tsc` **只写不删**，源码搬走或删掉后旧产物会留在原地，而「重建后 `git diff` 干净」那道闸门
  **永远发现不了**它（没人会重建一个已经没有源码的文件）。反向那一半同样要守：`src/` 里除
  `.d.ts` 外每个文件都要有 `.js` + `.d.ts`——`git diff --exit-code` 不报 untracked，所以
  「提交了源码、忘了提交产物」在 CI 上是绿的。判据与反例：
  [`scripts/test/lib-artifacts.test.ts`](../scripts/test/lib-artifacts.test.ts)。

## Issue（提 issue 的格式约束）

**所有 issue 走表单**（[`.github/ISSUE_TEMPLATE/`](../.github/ISSUE_TEMPLATE/)），空白 issue 入口
已关闭（`config.yml` 的 `blank_issues_enabled: false`）。两张表单（Bug 报告 / 功能请求）的字段
不是礼节，而是**排查一个插件问题最小需要的信息**——每一项都对应
[troubleshooting.md 的通用顺序](./troubleshooting.md#通用顺序)里的一步：

| 表单字段 | 对应排查动作 |
|---|---|
| 插件版本 / DSH 版本 / 安装方式 | 兼容性校验（peer 下限）、产物是否最新（是否 `link:` 装的）；插件版本的**可抄查法**见下条规矩 |
| 运行形态（`dsh web` / 桌面版） | 两套 origin → 桌面版独有故障（`tty D61`、`docker D139`）先在这一栏分叉 |
| 问题类型（401/403 还是 404） | 路由「没注册」与「被围栏挡回」是两类问题，先在这一栏分叉 |
| **是否回归（以前能用吗）** | 「以前能用、现在坏了」是**查最近变更**与**查环境**的分水岭，与「复现稳定性」同等重要——不逼这一栏，用户不会主动写 |
| 自查结果 | 通用顺序 1–5 步 + 双形态对照：重启宿主 / `dsh --profile web --dump-config` / 卡片在不在 / 已知限制 / 是否重建 / 桌面版与浏览器是否都试过 |

**硬规矩**：

1. **必填项不许编**。填不出来就写「不知道 / 做不了 + 原因」——这比一个像样的猜测有用：
   猜测会把排查引到错方向，而「不知道」至少告诉下一个人该去查什么。
2. **「自查结果」必须真跑过**。它对应通用顺序 1–5 步加双形态对照（重启宿主、`--dump-config` 看
   插件行、看卡片在不在、对一遍已知限制、源码装的是否已重建、桌面版与浏览器是否都试过），这几步
   能把相当一部分报告在提出来之前就解决掉。
3. **现象 / 证据 / 环境三样齐全**。没有版本、没有复现步骤、只有一句「不工作」的报告，维护者
   只能回问，一来一回就是一周。日志贴**原始报错**（宿主终端里那段），不要转述、不要只贴截图。
4. **表单里写「怎么查」的地方，命令必须真跑过**。反例是插件版本：表单一度只给了
   `@hyzyn/dsh-tty@0.22.0` 这种格式示例，而全仓没有任何地方写过**去哪看版本**——表单指了路、
   路却不存在，用户只会卡在那里，然后填一个猜的版本。可抄查法：
   `dsh plugin --profile <profile> ls <包名> --depth 0` 或读 profile 的 `package.json`
   （`dsh plugin` 只是把参数转发给 pnpm；profile 里可能只写了范围，那就照抄范围）。
   加任何新字段前，先自己按 description 走一遍。
5. **给用户的信息与给维护者的约定要分开**。`报告 #N`（见上文[编号规范](#编号规范)第 6 条）
   是**维护者侧**的台账引用规则：提 issue 的人对它无法采取任何行动，写在表单上只会让人困惑
   「我要做什么吗」。这类约定只留在本文，不进表单；反向也一样——表单不承载仓库内部流程。
6. **改表单本身就是改 L0 资产**（它决定所有未来 issue 的字段）。schema 与表单里指向仓库
   文件的链接由 [`scripts/check-issue-forms.mjs`](../scripts/check-issue-forms.mjs) 守着
   （CI 必跑，含 `--self-test`）；要**靠人守**的只剩文档散文三处：本表的「提 issue 的格式
   约束」行、本文这一节、[`README.md` 的参与贡献](../README.md#参与贡献)入口说明——表格是
   散文不是索引，硬绑机器判据只会制造误报（这个取舍写在闸门文件头的「已知边界」里）。

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
  （**守卫**：`scripts/docs-index.mjs` 判据 5 现算 `pnpm-workspace.yaml` 的包集合与这张表逐一对账，
  多一个少一个都报）

## 工具面：长等待的工具必须转发 `exec.signal`

`defineTool` 的 `execute(args, exec)` 第二参里带着 `exec.signal`，SDK 契约原文是
「Async work must observe or forward `exec.signal` and settle only after its owned work reaches
quiescence」。**判据**：一个工具的等待上限（自己的 `timeoutSec` / `timeoutMs` / 自己的循环）
**达到 30 秒**，就必须：

1. `execute(args, exec)` 接第二个参数，并把 `signal` 传进等待处；
2. 等待里的睡眠 / 竞速要能被 abort **唤醒**（不是「等这一轮睡完再看」）；
3. 取消**自成一档**（既不是超时，也不是业务失败）：报告与渲染里说清「调用方不等了」，
   并交代「怎么接着用」（会话 / 页面 / 数据还在不在）；
4. 声明协作式预算 `timeoutMs`（略大于自己的上限）——声明了就等于承诺可取消，1–3 一起做。

**为什么要有这条**：取消不生效的代价是**静默的**——调用方已经走了，工具还在每 N 秒打一次 SSH /
开一个页面 / 挂一个监听器。2026-10-04 现算：全仓 **0 个**工具接过这个参数，所以这先是一条
**缺规矩**（当时上提到根 ROADMAP 第 12 项），再逐包补齐。

**执行点是 runtime 用例，不是静态扫描**：判「这个 `execute` 有没有接第二个参数」需要 AST 级提取，
而用例直接验「取消之后多久返回」——没接线时它会一直等到自己的上限（或测试超时），
两边的差距是数量级。四条落点见根 ROADMAP § 已完成第 12 项。

## 插件配置：`.volatile()` 是**承诺**，不是标注

`Config` 里标 `.volatile()` 的字段 = 「**可以热写、且不重挂插件**」。loader 检出「只变了 volatile
字段」后只把配置引用**就地改写**、再发 `loader/volatile-update`——插件**不会**被重新 `apply`。

**所以声明 volatile 就等于承诺：本插件自己订阅那个事件并重读。** 两条：

1. **不订阅的后果是「改了不生效」，而且它不报错**：写入成功、落盘成功，插件继续用旧值；
   `dsh-settings` 那边还会把 descriptor 标成 `applies: "live"`（**写死**的）。
   **但要说清这一版的实际可达性**——真机实测（2026-10-02，profile 3082 + 真 Chrome）：**Web GUI
   里没有配置面**，插件详情页没有表单、「插件配置」页只有 8 张客户端卡片（都是自带客户端半体的
   那些）、「内置插件」页是只读清单，且**全安装没有任何客户端代码消费 `autoGenerate`**。
   宿主侧的 `describe()` 确实按 `volatileForm(schema)` 列表单（**没有 volatile 字段的 entry
   根本不进这份清单**，`update()` 也会抛 `has no volatile fields`），只是这一版没人渲染它。
   所以这条义务目前是**潜伏**的：本版 GUI 里没有触发它的写入方（`settings.update` RPC 与
   配置编辑器仍在，仍是真实入口）。
2. **订阅之后要自己收尾**：重读 → 拆掉上一轮登记 → 重建只在构造时读配置的东西（如浏览器进程）
   → 重新注册。**值没变就别动**——`loader/volatile-update` 是**全仓广播**的，
   `settingsEntryScope` 的 `onChanged` 不按 entry 过滤，别的插件改配置也会打到你这里。

读配置先过 `plainConfig()`（volatile 字段被解析成冻结引用 `{ get() }`）。机制正文与 API 在
`packages/kit/src/settings.ts` 的模块注释；**可照抄的完整写法**是 `docker` / `tty` / `codegraph`
三处的 `scope.onChanged(() => …(scope.get()))`。

**守卫**：`scripts/test/plugin-volatile-contract.test.ts` —— 只要包里有 `.volatile()` 字段，
源码里就必须出现订阅（`loader/volatile-update` 字面量，或 `settingsEntryScope` + `onChanged`）；
**只在注释里提一句不算**。

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

### ①b 语法错是**致命**的（`client-lint` 不许把它当噪音）

`client-lint` 用 `tsc --allowJs --checkJs` 扫客户端半体，只把几类错误当失败（`TS2304` / `TS2552` /
`TS2448` / `TS2454`），其余归「已知噪音」。**`TS1xxx`（语法族）不在此列**：一个少写的逗号意味着
**整个 bundle 解析不了、这个插件的界面全没了**。2026-10-03 实测漏过一次：`devfront` 的 i18n 目录块
漏了逗号，`check-i18n`（容错解析仍拿得到键）与 `client-lint`（当噪音）**都绿**，只有真机验收
（真宿主 + 真 Chrome）发现卡片不见了。判据用前缀族而不是逐个码列举——语法错会换码。

### ② 要判对错的客户端逻辑，抽成 `client-src/*.js` 纯模块 + vitest 用例

`client.js` 是构建产物、不在 vitest 层测；`client-lint` 只查静态问题（名字解析、宿主地址来源）、
**不验行为**——逻辑留在组件闭包里就等于没有测试入口。`client-lint` 查的是**全量**
`client-src/**` 而不只是入口，兄弟模块同样受管。

范例：`packages/tty/client-src/ws-url.js` + `packages/tty/test/ws-url.test.ts`
（用例里必须有一条 `dsh-app://app` 场景）。

## 客户端设置面：内联优先

DSH `0.2.0-rc.1` 的插件管理页把插件配置渲染在**插件详情页「说明」正下方**，靠的是
`plugins.bundle.config` 这个**按 bundle 包名派发**的槽；`plugins.row.config` 是 per-row 的
「>」子页（侧边栏「插件」→ 该 bundle 的**行**）。两者是同一份表单的两个位置，不是两套设置。

四条契约（八个包逐字节相同，只换卡片组件名）：

1. **挂 `plugins.bundle.config`**，key 只挂**本包自己的** bundle 包名（`@hyzyn/dsh-x`）。
   **不许挂聚合包 `@hyzyn/dsh-all`**：那个 key 是**全仓共享**的（所有插件都在同一个聚合 bundle
   里），多写一个注册者就是 `keyed slot ... already has an entry` **直接抛错** → 客户端 `apply`
   崩 → 启动页变「Failed to load plugins」（**踩过**，见本条末的守卫）。聚合安装下的设置面走它
   自己的 row 入口；
2. **内联优先**：bundle 槽可用就**不注册本包那份** row 槽——同一份表单两个入口会让人以为有两套
   设置（用户现场：「设置要点『>』再进二级页」）；**聚合包那份 row 入口要保留**（那是它在聚合
   安装下的唯一入口）；
3. **旧宿主回退**：bundle 槽不存在时（0.1.6 线）回退注册 row 槽，功能一点不减；`≤0.1.5` 仍是
   `settings.plugin.item` 卡片。两侧就绪顺序不敏感——任一侧先到都收敛到「内联优先」（后到的
   row 注册会被撤掉）；
4. **bundle 名从 row key 推导**（`ROW_CONFIG_KEYS.map((key) => key.split('#')[0])`）——另写一份
   常量一定会漂。

卡片在 `view === 'page'` 下**只渲染表单、不画卡片头**（标题与面包屑由宿主页面提供），所以同一个
组件能同时落在「插件配置」行、详情页内联与行详情三处。

守卫：`scripts/test/plugin-settings-surface.test.ts`（跨包一致性 + **bundle key 两两不同** +
反例）。行为验证在
`packages/docker/scripts/client-smoke.mjs` 的两条用例里（真跑 `apply(ctx)`：新宿主只注册两个
bundle key 且没有 row 入口、旧宿主只注册两个 row key）——其余包是手写单文件、没有 apply 级夹具，
故以「逐字节一致」当防漂判据。

## 客户端卡片：改配置那条路要有真机 DOM 证据

> **判据**：一张卡片只要能**保存配置**（写的是 profile 补丁层里那份声明的形状），它所在的包就必须
> 有一条真机脚本里的 DOM 证据：**在卡片上真的加一行 → 填值 → 勾确认框 → 点保存 → HTTP 复核**。
> **只验渲染不算**——「控件渲染出 21 个」「值回填对了」说的是这张卡片**画出来了**，不是它写得动。

**为什么**：`client.js` 是构建产物、不在 vitest 层；`client-lint` 只管语法与地址来源、
`check-i18n` 只管键集，**都不看客户端拼出来的 payload 长什么样**。`devfront` 的卡片被真机抓出过
三条静态闸门全绿的缺陷，其中一条就是「保存一个标量把站点整批抹掉」。

> **2026-10-04 追加（同族第四次）**：加一个**卡片不认识的新字段**（`login`）时又撞了一次同一条路——
> 保存时 `targets` 是整批重建的，于是「加一个字段」与「点一次保存就把它删掉」只差一行透传，而且
> 界面**看不到**它、也不报错（下一次 `site_login` 才说「没声明登录流程」，那份声明其实还在配置里，
> 是保存时被抹的）。编号：`devfront D01`；守卫是 `scripts/verify-devfront-card.mjs` 的第 ⑳ 步
> （保存之后**读回来核对声明还在**——只验「保存成功」不算）。**加字段就要跟着改客户端的编解码**，
> 这一句现在有编号了。

**两条技法**（照抄，别自己发明）：

1. **确认框要在嵌套的那层卡片里找**（`<编辑器>.closest('.xx_card')`）：
   `card.querySelector('input[type=checkbox]')` 会先命中标量那一段的复选框，于是「我勾了确认」是假的；
2. **React 受控输入必须走原生 setter + 事件**：文本框派 `input`、下拉框派 `change`。
   只改 `.value` 时 React 的 value tracker 不认，提交上去的还是旧值 / 空行。

**DOM 那条断言通过 ≠ payload 对**（2026-10-04 反例实测）：把下拉框的 `change` 扣掉不派，
`devenv` 的 DOM 那条**照绿**（行数 +1、卡片回「目标已保存（进审计）」），只有紧随其后的 HTTP 复核
红了——提交上去的 `kind` 停在默认值上。所以那两条**必须成对**：DOM 那条管「这条路走得通」，
HTTP 那条管「走出来的东西是对的」。

**落点**：三张卡片的真机脚本各有一对——`devfront` ⑰⑱、`devdata` ㉕㉖、`devenv` ㉓㉔
（外加 ㉕ 那条写闸门回归）。**在不在**由 `scripts/test/card-dom-path.test.ts` 守；
**对不对**只有那三条真机脚本每次真跑才算数。

## 一次发布的证据链：同一个项目名，三份清单

> **判据**：一次发布之后要回答三个问题——**容器起来了**（`devenv`）→ **数据对**（`devdata`）→
> **页面对**（`devfront`）。三面靠**同一个项目名**对齐：项目仓库里放三份文本清单，各面只读自己那一份。

| 面 | 清单（相对项目根） | 今天谁在读 |
|---|---|---|
| 容器 | `ready/<项目>.ready.yaml` | `devenv` 的 `env_status` / `env_wait`（agent 工具） |
| 数据 | `verify/<项目>.yaml` | `devdata` 的 `devdata_verify`（agent 工具） |
| 页面 | `web/<项目>.yaml` | `devfront` 的 `site_verify`（agent 工具） |

**三条约束**（是口径的一部分，不是建议）：

1. **只读**：三面执行清单时只发读语句 / 只开页面看——不写目标、**不改 Jenkins**；
2. **不做发现**：「这次发布该验哪些项目」由**人给出**（与 `jenkins-release` 的 job → 项目映射对齐）。
   自动发现正是三包共同划掉的边界，所以这条链**刻意没有聚合器**：「一次调用跨多个项目」是另一件，
   在 `devfront` 的 `D8` 里明确留着；
3. **项目名只有一处**：清单**文件名**里的项目名就是它；清单里再写一遍必须一致——不一致在三个面上
   **一律是配置错误**（防复制粘贴改漏：那会让断言跑到别的项目上去，而报告看起来是绿的）。

**守卫**：[`scripts/test/release-chain.test.ts`](../scripts/test/release-chain.test.ts)——一个项目目录、
三份清单、三个面各认自己那份（**互不读取**）；三份路径并列钉住；项目名串了要红。

**一处实测出来的不对称（2026-10-04，当天已闭合）**：立这份口径时中间那一环**只能由人 / 脚本接上**
——`verify/<项目>.yaml` 在 `packages/devdata/src/verify.ts` 之外**没有任何消费者**（真机启动日志里
`devdata` 注册的四个工具没有一个是清单驱动的），于是「三面按同一个项目名跑同一批清单」这句
**当时对容器与页面两面成立、对数据面还差一个入口**（已记进 `packages/devdata/ROADMAP.md` 待办 21）。
守卫里那条 tripwire 就是为这件事留的针：**接上之后它会红**——2026-10-04 当天就红了，也按它自己的
提示翻成了正向断言（保留反例：把消费者删掉就报空），第三列同时改成 `devdata_verify`。
新入口的判据见 `packages/devdata/ROADMAP.md` 记-20：只读、逐条 `pass` / `fail` / `unknown`、
**「没验成」不许冒充「验出问题」**、进审计；今天只接得住真能跑的引擎（Redis），
清单里 SQL / RocketMQ 的断言逐条记「没验成」而不是假装跑过。

### 发布清单：由人给出的「这次该验哪些项目」

> **判据**：一次发布要验的项目**由人写下来**——「这次发布该验哪些项目」是发现逻辑，而「不做发现」
> 是这条链的边界（三包一起划掉的）。补它的唯一办法是一份**人写的清单**，不是让工具去扫目录。

| 项 | 口径 |
|---|---|
| 路径 | `release/<发布名>.yaml`（工作目录下）。**名字只有一处**：清单里的 `release` 与文件名必须一致，不一致是配置错误 |
| 内容 | `projects[]` 逐条 `{ project, root, target }`：**项目名**（与三份清单同一个，也是唯一对齐键）、**项目根**（清单在它下面；相对**本文件所在目录**解析）、**本面按哪个目标验** |
| 谁读 | 读它是**各面自己的事**：`devfront` 的 `site_verify_release` 读 `target`（站点），按 `root` 跑到那个项目里读**它自己的** `web/<项目>.yaml`。另外两面要接时各读自己那一列——**它不是一个聚合器**，三面仍然各读各的清单 |
| 不做发现 | `projects` 逐条写死；解析器不 glob、不扫目录（列目录只用在「这里现在有哪些发布清单」那句报错文案上——与「这里现在有哪些清单」同一用途） |
| 缺省即无 | 没有这份文件 = 没有发布清单；**不回落**成「按目录发现全部项目」 |
| 两种拒绝分开 | **发布名与文件名不一致 / 字段写错**是配置错误（读清单时就报，指到字段）；**列了但那个项目里没有清单**是「没验成」——它记进报告的问题块，**不是**「验出问题」，也**不算通过** |

**守卫**：[`scripts/test/release-chain.test.ts`](../scripts/test/release-chain.test.ts)——发布清单里列的
每个项目 ↔ 那个项目里三份清单的项目名逐一对齐（`releaseAlignmentProblems`）；列了但没有清单要报出来；
路径口径钉住；三条反例（某一份清单项目名串了 / 项目里没有清单 / 发布清单里的名字与目录里的对不上）。

**落到工具面**：`devfront` 的 `site_verify_release`（2026-10-04，见
[devfront ROADMAP 记-31](../packages/devfront/ROADMAP.md)）——一次调用按发布清单跑多个项目，
每个项目仍然只做「打开 + 观察」，并把**没跑成的项目**单列出来。

## 常量：什么该提，什么不该提

> **判据是「编译器管不管得住」，不是「出现了几次」。**

| 形态 | 谁保证不漂 | 要不要常量 |
|---|---|---|
| **类型联合的取值**：`kind: 'read' \| 'write-scoped'`、`'full-scan'`、`'SELECT'` | **TypeScript**——写错编译就报，比对也受联合收窄 | ❌ **不要**。提出去只是把类型系统做过的事再做一遍，还多一层间接 |
| **跨进程 / 跨包的运行时字符串键**：宿主服务名、启动环境层名、环境变量名、文件名 / 目录名、协议标记 | **没人**——它们是字符串，写错不报错，运行时**静默走另一条分支** | ✅ **要** |
| **错误码** | 没人，且它是对外契约（agent 按码决定下一步） | ✅ 要，且必须有**单一真相源** |

**为什么「出现次数」不是判据**：`'write-scoped'` 在 4 个文件里出现 8 次——它已经由类型管住了，
重构它没有收益。反过来 `getService(ctx, 'settings')` 只写一次也是风险：拼错一个字母，
`getService` 返回 `undefined`，卡片少一块、能力判定换一条路，**没有任何报错**。

**为什么这类错误特别难发现**：本仓 `tsconfig` 是白名单式装载（`include: ["src"]`），
所以这类名字**不会**进类型检查；而「取不到服务」的代码路径按设计是**降级**（返回 `undefined`），
不是抛错。两者叠加就是静默。

**归宿**：`kit` 的 `HOST_SERVICES` 与 `LAUNCH_ENV_LAYERS`（`packages/kit/src/host-services.ts`）。
`launchEnvironment` 单独点名：它错了会**静默换掉能力闸门的判定源**（回落到冻结的
`process.env` 拷贝）——安全相关，不是体验问题。

**守卫**：`scripts/test/string-contracts.guard.test.ts` +
`scripts/lib/string-contracts.ts`（源码扫描，跳过注释行——注释里会写反面示例）。
它只认 `getService(ctx, '…')` 这一种写法；**另一种写法它看不见**，所以这条规矩以本节为准，
守卫是补强不是唯一保障。

## 三条跨包一致的行为约定（正文不在这里）

三条的名字是 **回环围栏** · **body 围栏** · **截断要有信号**。它们的正文、以及它们为什么长这样
（请求链路图 + 每条对应的历史事故），唯一归宿在
[architecture.md § 一条请求经过什么](./architecture.md#7-一条请求经过什么) —— 那边上下文更完整，
本文只留这个检索入口，不复制。

## 面板端 i18n

**界面文案的语言只认宿主**（`@deepseek-ai/dsh-client-locale` 的 `ctx.locale`），
每个包自带 `zh` + `en` 两份目录、按同一段片段注册。**方案、规范片段、键名规范、
目录放哪、范围纪律与迁移进度表全部在 [docs/i18n.md](./i18n.md)**——那边是唯一归宿，
本文只留这四条硬规矩：

1. **不引共享模块、不建新包、不给手写 `client.js` 的包加构建步骤**：插件之间不许互相
   `import`，`kit` 是宿主半体库（入口 import 了 `node:*`），能在浏览器侧共享的通道只有
   宿主服务本身。
2. **不自己读 `navigator.language`**：语言来源（持久化偏好 / 浏览器推导 / 原生壳注入）
   已经是宿主的职责，插件再推一遍就是两套不兼容的写法。
3. **目录必须双份且机器对得上**：`node scripts/check-i18n.mjs` 是唯一闸门
   （CI ubuntu step + pre-commit；纯逻辑用例在 `scripts/test/i18n.test.ts`）——
   键集、占位符、以及**代码里 `t('…')` 用到的键必须有定义**。第三条是主要理由：
   写错一个字母只会让界面露出键名，没有任何测试会红。
4. **只翻浏览器半体的界面文案**：工具 `description:` / `*_GUIDANCE` / 工具输出是**模型
   读的提示词**，翻它等于改提示词；宿主半体的报错正文保持中文（`ctx.locale` 是浏览器侧
   服务，宿主半体看不到它）。

## 真机脚本与 CI 接线

- **真机脚本进不了 CI**（需要真机 / 真宿主 / 真浏览器）。所以：能静态断言的性质，补一条
  vitest 守卫（例：`packages/codegraph/test/verify-scripts-safety.test.ts` 断言它那 5 个
  `verify-codegraph-*.mjs`「隔离 DSH_HOME」「自证真实配置未变」；跨包的那 4 个（`mcp` / `rss` /
  通用 UI）与公共隔离引导 `scripts/lib/live-harness.mjs` 由 `scripts/test/live-scripts-safety.test.ts`
  按同一口径断言——**包内的进包内用例、跨包的进 L0**）；真机脚本的正确性**只能靠跑一遍**。
- **每个真机脚本都要有可粘贴入口**：`pnpm --filter <包名> run <条目>`（条目名照各包既有形态，
  如 tty 的 `integration` / `ssh-smoke`），`pnpm verify:list` 只列不跑地摊开这 9 个脚本的
  「所在包 / 需要什么 / 是否进 CI / 那条命令」——**不要**做成「一条命令全跑」：它们会起真宿主与
  真 Chrome，半路失败会留下垃圾进程与临时目录。Runbook 见
  [agent-real-test.md § 各包真机入口](./agent-real-test.md#各包真机入口)。
- **包内脚本不搬家**：`scripts/` 下的包内脚本与 `package.json` 的 `smoke` / CI step 直接接线，
  移动会打断它们。项目级 Runbook 见 [agent-real-test.md](./agent-real-test.md)。
- **要真宿主的验收放根 `scripts/` 且不进 CI**：`scripts/live-host-smoke.mjs`（`pnpm live-smoke`）
  是唯一需要**真 DSH 宿主**的脚本——它起两个一次性宿主实例，验能力开关的授权阶梯 / 路由门控 /
  agent 工具清单 / 试连文案 / 宿主正在服务的 `client.js`。为什么不进 CI：CI 里没有 DSH（装一个
  全局 DSH 是又慢又漂的重依赖），所以它是**发布门槛 #3 的自动化形态**，属于本地门槛；
  本机没装 DSH 时打印 SKIP（不假装验过），`--strict` 则失败。安全前提写在脚本头：**绝不碰你的
  profile**（复制两份一次性 profile，跑完删）、独立端口、只播种一个本地 docker 目标。
  **干净机器**（VM / 新克隆 / CI 腿）上没有可当模板的 link profile，此时加 `--bootstrap`：
  [scripts/live-profile.mjs](../scripts/live-profile.mjs) 从 dsh **自带**的 `web` 模板初始化一个
  一次性 profile、link 本仓的 docker/tty、写一层让「配置里写着 true」成立的 patch，最后用
  `--dump-config` **自证**插件真进了阵容（cohort 不匹配时 DSH 会整批 disabled，不查就会跑出
  一堆假 FAIL），跑完与两份拷贝一起删。
  **静态守卫**：`scripts/test/live-host-smoke-safety.test.ts` 读源码钉住这些性质（只建/只删
  带 `live-smoke-<pid>` 前缀的一次性 profile、bootstrap 也只建 `live-smoke-src-<pid>`、拒绝覆盖、
  两实例各一份拷贝、link 目标只能由 `repoRoot` 拼出、**刻意不隔离 DSH_HOME**、CI / release 里
  都不出现它）；生成物形状由 `scripts/test/live-profile.test.ts` 钉住（docker 开关必须写 true，
  否则 A1「配置里 true 却打不开」是空断言）。
- **CI 与发布闸要成对**：只在 CI 补而漏了 `release.yml`，发布路径仍能整条绕过。
- **同一个真机 / 冒烟脚本有两个真相源（2026-09-30 诊断）**：
  CI 用**写死路径**跑 hermetic 脚本，而同一批脚本在包内 `package.json` 里另有条目。后果是
  **改名只红一处**：改脚本文件名 → workflow 立刻红（路径找不到），而
  `pnpm --filter … run <条目>` 那条**悄悄烂掉**（CI 从不跑它，没人会红）；反过来改条目名 →
  workflow 照样绿，只有手动跑的人受影响。
  **收敛方案与执行记录见 [docs/ci-scripts-plan.md](./ci-scripts-plan.md)**：**方案 A 已于 2026-10-01
  执行**（workflow 改成调用包内条目，14 行 → 10 行、`grep -c 'node packages/'` = 0 / 0；真相源收敛到
  `package.json`），**方案 B（守卫）同轮也已做**——`scripts/ci-script-truth.mjs`（写死路径不许回来、
  每个 `--filter` 引用都要能解析、两侧命令逐字一致、发布闸不许跑 CI 不认的入口、命中不是 0）；
  改动点、rename 面、CI 影响、验收与回滚都在那一份里。
  **现算纠正一条**：docker 那 3 条**在 `release.yml` 里也各写了一遍**（现算 14 处写死路径），
  所以收敛必须两个 workflow 一起改——「只在 CI 补、发布路径照样绕过」本仓已经吃过一次（docker D119）。
- **文档链接闸门**：`node scripts/check-doc-links.mjs` 校验全仓 markdown 的**相对链接**与
  **锚点**（跨文件与同文件都查）。**尚未进 CI**，目前手动跑（见 [ROADMAP.md](../ROADMAP.md) 第 7 项）。
  已知的「相对的是别的仓库」的链接走脚本里的**精确白名单**（当前 3 条，属
  `docs/pr-body-dsh-market.md`——它是提给市场仓库的 PR 正文副本，详见其文件头注释）。
  **2026-09-25 起已接进 CI**（ubuntu-only step，与其它发布不变量检查同列）。
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

  **现状**：`.githooks/pre-commit` 与 `.github/workflows/ci.yml` **都用的是正确写法**。
  CI 那处此前长期是失效写法（**本地防得住、CI 防不住**，风险面限于绕过钩子的提交：
  浅克隆 / `--no-verify` / 直接在 CI 环境重建产物的人），2026-09-25 修好——
  该 step 的注释里也记了这个坑，免得后人「顺手简化」回去。

## AI 协作边界：什么改动要先问

> 本节是这条边界的**唯一归宿**。对话记录、临时提示词、commit 草稿里写的都不算登记：
> 只读得到本节的人与读得到别处的人，行为必须一致。判据是**可逆性 × 影响面**，不是难度。

**先问，再动手**（不可逆，或影响仓库外的人）：

| 动作 | 为什么要卡 |
|---|---|
| `git commit` / `git push` | 提交信息是公开产物，且本仓 `commit-msg` 钩子会扫公网 IP |
| 删除或改名任何文件 | 与「信息只搬家不丢失」直接冲突。要删先证明可取回：`git cat-file -t <sha>:<path>`、取回行数、一个特征串命中，再把 `git show <sha>:<path>` 登记进冻结记录，**然后**才删 |
| 改 `.github/` 与 `.githooks/` | 共享状态，而且改错的闸门是**静默**的：上面那条命中 0 个文件的 pathspec 在 CI 里躺了很久，没有任何一次红 |
| 增、删、改任何 `Dxx` / `CGxx` 编号 | 硬契约，源码注释指向它们。守卫报红一律改文档侧，不许反过来动台账 |
| 放宽隔离或安全前提 | 独立 `DSH_HOME`、临时资源可识别前缀、自证真实配置未变，是 `codegraph CG45` / `CG48` 换来的 |

**不必先问**（可逆，影响面在仓库内）：改文档正文、修死链、同步中英、给守卫加判据与 fixture 反例、
把散落的事实上收到本表指定的归宿。

**一条推论**：写进提示词的规矩若不在本节，它就是一条**没登记的规矩**（同 § 文档分档 的债务定义：
同一事实住在了它该住的地方之外）。所以维护提示词应当只留**读法与流程**，实质内容落到仓库。
