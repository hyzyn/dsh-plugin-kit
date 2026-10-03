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
| **面板端 GUI 的文案与语言（i18n）** | L0 [`docs/i18n.md`](./i18n.md)（方案 + 规范片段 + 进度表） |
| **跳板机（ProxyJump / ProxyCommand）完整实现的方案**（2026-09-25 已按它落地，`ProxyCommand` 见其 §6.1 的闸门定案表；保留为**活**的作业面：多跳链与后续坑仍以它为准） | L0 [`docs/proxyjump-plan.md`](./proxyjump-plan.md) |
| **能力开关「就地提权」的当前权威实施方案**（2026-09-26 已按它落地：两条通道、落点、威胁模型、逐 PR 顺序；实施偏差见其附录 C。原先的 `…-plan.v2.md` 已按命名规范改名成本文件名） | L0 [`docs/capability-elevation-plan.md`](./capability-elevation-plan.md) |
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
| **提 issue 的格式约束**（表单字段 / 自查结果 / 空白 issue 已关闭） | L0 [`.github/ISSUE_TEMPLATE/`](../.github/ISSUE_TEMPLATE/)（两张表单是**字段真相**）+ 本文 [§ Issue](./conventions.md#issue提-issue-的格式约束)（规矩）。字段与 [troubleshooting.md 的通用顺序](./troubleshooting.md#通用顺序)一一对应；schema 与表单内链接的闸门是 [`scripts/check-issue-forms.mjs`](../scripts/check-issue-forms.mjs) |
| **投稿材料**（面向 DSH 插件市场） | L0 [`docs/pr-body-dsh-market.md`](./pr-body-dsh-market.md)（**提给市场仓库的 PR 正文**，其相对链接指向目标仓库）与 [`docs/community-submission.json`](./community-submission.json)（提交载荷）。两者都是**对外投稿物**，不是本仓架构 / 规范；**保留原路径**——`community-submission.json` 可能被市场按 `@main/docs/` URL 取。它们属于**「创意工坊」那条投稿轨道**，与市场卡片上分类标签的实际来源不是一回事：见下行 |
| **插件市场索引**（卡片分类标签从哪来 · 我们 8 条的现状 · 改分类怎么提 PR） | L0 [`docs/market-index.md`](./market-index.md) |
| **CI 与 `package.json` 的脚本双真相源：收敛方案**（改动点 / rename 面 / CI 影响 / 验收；**已执行——方案 A + 守卫，含 2026-10-03 根级扩展**） | L0 [`docs/ci-scripts-plan.md`](./ci-scripts-plan.md) |
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
| 复杂 | `docker` · `tty` · `codegraph` |
| 中等 | `kit` · `rss` · `search` · `mcp` |
| 简单 | `profile` · `env` · `prompt` · `kit-settings` · `all` |

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
| `docker` | `D` | `D01`–`D158` |
| `tty` | `D` | `D01`–`D95` |
| `codegraph` | `CG` | `CG01`–`CG65` |
| `kit` | `D` | `D01`–`D05` 是**转入镜像**：这些编号的权威记录在**原包**（主要是 `codegraph CG`），kit 侧只是「改 kit 的人不必翻别人的台账」的入口，**引用时优先写原编号**（如 `codegraph CG05`）；`D06`–`D13` 是**本包自研**：在 kit 内部发现、权威记录就在 kit。 |
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
   四包（`docker` / `tty` / `codegraph` / `kit`）都在
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
- **提交前门禁**：`pnpm typecheck && pnpm build && pnpm test && pnpm aggregate`。
  `.githooks/pre-commit` 会自动重建产物并 `git add`，然后按 **index** 扫公网 IP。
- 增删插件后必须跑 `pnpm aggregate` 重新生成 `packages/all` 的聚合清单。

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

## 客户端半体：三条硬规矩

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

`client.js` 是构建产物、不在 vitest 层测；`client-lint` 只查静态问题（名字解析、宿主地址来源、
点击委托作用域）、
**不验行为**——逻辑留在组件闭包里就等于没有测试入口。`client-lint` 查的是**全量**
`client-src/**` 而不只是入口，兄弟模块同样受管。

范例：`packages/tty/client-src/ws-url.js` + `packages/tty/test/ws-url.test.ts`
（用例里必须有一条 `dsh-app://app` 场景）。

### ③ 绑在 `document` 上的点击委托，必须限定在自己的 DOM 内

同一个设置页上同时挂着多张插件的卡片，各自把 `click` 绑在 `document`（捕获阶段）上再用
`closest('[data-action]')` 取动作——`data-action` 是**跨卡共享**的通用名，于是没有作用域判定的
处理器会接走**别张卡片**的按钮：

```js
// ❌ 点 profile 卡片的「删除」（data-action="delete"、没有 data-id）也会进到这里
function handleClick(event) {
  const el = event.target.closest('[data-action]')
  if (el === null) return
  if (el.dataset.action === 'delete') deletePrompt(el.dataset.id) // id 是 undefined
}
// ✅ 先判「这次点击是不是落在自己的 DOM 里」，自己的浮层挂在 body 上就一并算进来
function handleClick(event) {
  const target = event.target
  if (!panelEl || !panelEl.contains(target)) return
  const el = target.closest('[data-action]')
  if (el === null) return
  if (el.dataset.action === 'delete') deletePrompt(el.dataset.id)
}
```

2026-10-03 实测的后果：点 profile 的「删除」多弹一次 `删除 prompt「undefined」` 确认框，随后
宿主 400、卡片上出现 `prompt 不存在: ` 的红字（用户的报告就是这一条）。静态比对四张绑了
`document` 的卡片（mcp / profile / prompt / rss）还有 `refresh` / `edit` / `editor-save` 三处
同类误触。`scripts/client-lint.mjs` 的**检查三**静态拦下这类处理器（规则与成因见
`scripts/client-click-scope.mjs`，用例见 `scripts/test/client-click-scope.test.ts`）。

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
- **CI 与发布闸要成对**：只在 CI 补而漏了 `release.yml`，发布路径仍能整条绕过（docker D119）。
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
- **根级 `scripts/` 那批发布不变量闸：2026-10-03 已按同一套收敛**（[§ 10](./ci-scripts-plan.md#10-根级扩展2026-10-03同一套收敛延伸到根-scripts-的发布不变量闸)）。
  § 9 只收了**包内**条目；根级 `check-*.mjs` 当时仍是写死路径，**且同一批命令在 `ci.yml` 与
  `release.yml` 各写一遍**——方案 A 要消灭的两个真相源在根级原样存在，只是守卫扫不到。
  现在两条 workflow 一律裸调用 `pnpm <条目>`（13 个新条目），两条新判据把形态钉住：
  `ci.rootHardcodedPath`（`node scripts/…` 不许回来）、`ci.rootEntry.missing`（裸调用必须能在根
  `package.json` 解析；pnpm 内建命令走白名单，注释行不算引用）。
  **`aggregate:check` / `artifacts:check` 落成脚本**（而不是继续内联多行）是因为原来的
  `cmd || { echo …; exit 1; }` 组语法在 Windows 的 cmd 下不成立，而闸门条目要三平台都能当粘贴入口；
  脚本里 `execFileSync` 的 argv 数组直传 git，`:(glob)` magic 与引号语义跨平台一致。
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

  **现状**：`.githooks/pre-commit` 与 `.github/workflows/ci.yml` **都用的是正确写法**
  （2026-10-03 起 CI 那处搬进了 `scripts/check-artifacts.mjs`（`pnpm artifacts:check`），
  两条教训随注释一起搬过去：`:(glob)` + 双星的写法与「`*` 会跨 `/`」的反例）。
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
