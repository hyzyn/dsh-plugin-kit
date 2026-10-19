# @hyzyn/dsh-loglens — 路线图

> **状态：P0 / P1 / P2（含真机验收）/ P3 / P4（含出站围栏）/ P5 / P6 全部落地（2026-10-11 ~ 10-12）——设置面、查询地基、
> Loki 与 ES / OpenSearch 适配器、出站围栏、agent 工具（**名单以 `src/tools.ts` 注册处为准**，`loglens_facets`
> 是当天后补的第五个）、Docker 的选项 0 两格（agent 指路 + 面板容器日志区）、浏览器侧的结果视图都可用；
> **Loki 分页已在真 Loki 3.7.8 上验收并翻成 `cursor`**（真机抓到 D02/D03 两个缺陷，见「P2 真机验收」一节）；
> **但 Loki 本版不从界面提供**（2026-10-18，维护者决定：适配器与上面那次验收都在仓库里，缺的是
> **能力闸**那一段真机验收 ⇒ 类型下拉不列它、新行默认 ES；恢复是一行，见下面
> §「Loki 本版不从界面提供」）；
> Loki 的 `tail`（WebSocket 跟随）**已决定暂缓**（2026-10-12，理由见「P2 真机验收 → 还没做的」那一节；
> `capabilities().follow` 因此诚实地声明为 `false`）；**时间分布（直方图）**当天也已落地；**面板的
> 「按字段分组」榜（terms）**（2026-10-13 补上，见文末那一节）；「待拍板」的
> 5 / 6 两项都已拍板（6 取选项 1「受控重复」，见 [design.md §5](./docs/design.md)）。**
> `packages/loglens/` 现在是 workspace 包
> （`@hyzyn/dsh-loglens@0.1.2`，已进 [publish-targets.mjs](../../scripts/publish-targets.mjs) 与两份聚合清单，
> `pnpm-lock.yaml` 已同步）——所以 [docs-index 判据 5](../../scripts/docs-index.mjs) 现在**看得见它**，
> 而不再是「本目录不在解析面里」。设计与契约见 [docs/design.md](./docs/design.md)；
> `README.md` 已按 [conventions § 文档分档](../../docs/conventions.md#文档分档) 补到当前状态（配置面 / 解剖 / 已知限制）。
>
> **id 已定：`loglens`**（包 `@hyzyn/dsh-loglens`）。`logs` 这个 loader id 已被第三方插件
> `dsh-logbook` 占用，npm 上的 `dsh-logs` 也已被他人占位——理由与证据见 [design.md §8](./docs/design.md#8-已实测前提)。
>
> **2026-10-13 ~ 10-18 这一段（上方状态段没覆盖到的）**：面板交互连做了三十余刀——字段面板收成
> 「只选列」、筛选收成两格输入框、直方图重做（读数气泡 / 峰值记号 / 基线裁剪）、查询串方言澄清 +
> 字段名补全 + 正文高亮、截断提示分两档、Docker 那一档重排、来源行的保存 / 索引标签 / 删除权重、
> 加载中可点、输入框可清空，最后补了 `README.en.md`。**逐条见文末 `## 已完成` 各节**（每节都有
> 落点、反例与门槛），这里不复述。仍未做的两项与它们的位置见 [§ 分期](#分期) 的 P8 注与
> [design.md §9](./docs/design.md) 的头部标注（右侧栏工作台**一期都没落地**）。

本文只放**还没做的事**；落地记录排在文末 `## 已完成（落点 + 门槛）` 之后
（判据：[docs-index](../../scripts/docs-index.mjs) 的 `checkPackageRoadmapLanded`）。

---

## P0-甲：模板 kit 钉子（独立改动，与本包无关）

**为什么先做**：[templates/hello/package.json](../../templates/hello/package.json) 钉
`@hyzyn/dsh-kit: "0.3.0"`，而 kit 是 `0.5.2`、其余 **9 个消费者全部 `0.5.2`**
（2026-10-11 复核修正：这里原先写的「10 个」是错的 —— `kit-settings` 与 `all` 都不声明 kit，闸门实测就是 9 处）。
[check-kit-pins.mjs](../../scripts/check-kit-pins.mjs) 的 `collectKitPins()` 只 `readdirSync(packages)`，
`templates/` **不在扫描面** → 该漂移**现在无人会红**（实测 `node scripts/check-kit-pins.mjs --quiet` 退出码 `0`）。

不修的后果：`pnpm create-plugin loglens` 会带着 `0.3.0` 进 `packages/`，立刻触发「全仓出现 2 个不同钉子」；
且根 `.npmrc` 的 `link-workspace-packages=true` 只对**范围**生效，**精确钉子不匹配就不 link**，
会真去 registry 拉旧 kit——正是 `kit D11`（模块级单例失效）要防的那一侧。

**四步（一次改动；做到可提交状态，`不 commit`——`git commit` 在
[conventions § AI 协作边界](../../docs/conventions.md#ai-协作边界什么改动要先问) 的先问清单里）**

1. [templates/hello/package.json](../../templates/hello/package.json) 的 kit 钉子：`0.3.0` → `0.5.2`。
2. [create-plugin.mjs](../../scripts/create-plugin.mjs)：生成时从 `packages/kit/package.json#version` **现算**钉字，
   不再信任模板字面值（模板不是运行期事实：`pnpm-workspace.yaml` 只有 `packages/*`，
   `pnpm-lock.yaml` 对 `templates/hello` 零命中）。
3. 纯函数反例：把纯函数抽到 **`scripts/` 根**（落地为 [scripts/create-plugin-manifest.mjs](../../scripts/create-plugin-manifest.mjs)）
   并 `export`，`create-plugin.mjs` 与新测试都 import 它；测试喂 `kitVersion = 9.9.9`、断言生成的 pin 是 `9.9.9`。
   **不要 import `create-plugin.mjs`**——它带 shebang，而
   [check-kit-pins.mjs](../../scripts/check-kit-pins.mjs) 已登记「被测试 import 的 `.mjs` 带 shebang + CRLF → 整份套件加载失败」。
   **落点由 `scripts/lib/` 改为 `scripts/` 根**（落地时的改判）：[vitest.config.ts](../../vitest.config.ts)
   把「被用例直接 import 的纯模块」定在 `scripts/` 根、与脚本同目录（先例 `client-host-url.mjs`），
   而它给 `scripts/lib/` 的口径是**真机脚本共享的隔离引导**。`scripts/lib/dsh-runtime-store.mjs` 事实上
   也被测试 import、与那段口径不符 —— 按纪律 3 **只加了标注**，没改口径（见文末落地记录）。
4. [RELEASING.md](../../RELEASING.md) 发布门槛补一句：模板钉子的真相来源已改为生成时现算。

**刻意不做的**：把 `templates/hello` 加进 `collectKitPins()` 的扫描面。按判据 3，钉子必须**等于 kit 当前版本**
⇒ 每次 bump kit 都要改模板，等于给 [RELEASING.md](../../RELEASING.md) 那条「跟齐每一个消费者」的门槛
**新增一个人工同步点**（漏了在发版中途红）。若日后仍要守卫，判据应写成
「模板钉子是**合法的精确版本**」，而**不是**「等于当前 kit 版本」。

---

## 独立待办：loader id 撞名的运行时行为（隔离 profile 实测）

**为什么单列**：这不只服务本包。2026-10-11 实测确认生态里**真的会撞 id**——`dsh-logbook` 的
`cordis.patch.yml` 就是 `- id: logs`，与任何取 `logs` 的插件在同一 profile 里争同一个 loader entry id。
[architecture.md §4](../../docs/architecture.md#4-谁写哪个文件跨包冲突的唯一来源) 登记的 `duplicate loader entry id`
说的是**手工往同一个 patch 文件追加**那一侧；**两个独立 bundle 各 insert 同一个 id** 会怎样
（报错 / 后者覆盖 / 静默跳过 / 谁赢）本仓**没实测过**，也没有任何守卫看得见。

**做法**：起一个隔离 profile（独立 `DSH_HOME`、临时资源可识别前缀、跑完自证真实配置未变），
同时挂两个各自 `insert` 同一个 id 的 bundle，观察启动日志与两个插件的挂载结果；结论写进
[troubleshooting.md](../../docs/troubleshooting.md)（「跨包通用故障诊断路径」的归宿）。

**门槛**：说清「症状 / 谁赢 / 有没有日志 / 能不能自愈」四格，并给出用户侧的排查顺序。

> **✅ 2026-10-12 收口：做完了**（隔离 profile 实测，四格 + 用户侧排查顺序都落进
> [troubleshooting.md](../../docs/troubleshooting.md) 的「报 duplicate loader entry id？」那一块；
> 原文按纪律 3 保留，本节只加这一句指路）。一句话结论：
>
> - **谁赢**：组合顺序里**靠后的那个 bundle**（`dsh.profile.bundles` 越靠后越赢），两向都实测过；
> - **有没有日志**：**一条都没有**——输的那个插件的 `apply()` 从未被调用，路由 404、卡片不见，
>   宿主照常启动照常服务。而且**不是「打了没看见」**：机制所在的
>   `cordis-plugin-loader@1.0.6-alpha.1` 的 `lib/index.js` 里 `Object.fromEntries` 按 id 建 map
>   （同 id 后写覆盖先写），全文 `grep duplicate` **零命中**——**这条日志路径根本不存在**。
>   （本文档复核过 loader 源码：`newMap = Object.fromEntries(config.map((o) => [o.id ?? Symbol('anonymous'), o]))`
>   与「无 duplicate 告警」两点都亲自确认。）
> - **能不能自愈**：不能。重启不变、换顺序只是**赢家换人**、用户层 patch 写 `disabled: true` 反而
>   **两个都不挂**；**唯一根治是改 id**。
>
> **纪律 3 的例外说明**：本节的待办文字**保留**（它记的是「当时为什么单列」），完成标记是上面这段。
> 顺带产出的一个**建议**（未实施，留给维护者拍板）：加一道**纯静态守卫**——现算各包
> `cordis.patch.yml` 的 insert `id`，断言仓内两两不同（挡「本仓两个包抢同一个通用词 id」）。

---
## P0-乙：原子建包（必须一次提交，中间态必红）

| # | 动作 | 守卫 |
|---|---|---|
| 1 | `pnpm create-plugin loglens`（自带 `pnpm aggregate`） | — |
| 2 | [publish-targets.mjs](../../scripts/publish-targets.mjs) 补一行 | [check-publishable.mjs](../../scripts/check-publishable.mjs) 的覆盖度判据 |
| 3 | [architecture.md §2 包清单](../../docs/architecture.md#2-包清单) 加一行 | [docs-index 判据 5](../../scripts/docs-index.mjs) |
| 4 | 计数同步（**分三类，见下**） | **无守卫会红** |
| 5 | [search 的 PANEL_DIRECTORY](../search/src/index.ts) 加条目（`registryName` = cordis id） | **无守卫** → 补一条 |
| 6 | `files` 字段：`lib` / `client.js` / `cordis.patch.yml` / `README.md` | [check-package-contents.mjs](../../scripts/check-package-contents.mjs) |
| 7 | peer **逐 cohort 写全 5 档**；`engines.dsh` = `>=0.1.7-rc.2` | [check-dsh-peers.mjs](../../scripts/check-dsh-peers.mjs) |
| 8 | 构建型声明（design.md §7 那三件） | [check-i18n.mjs](../../scripts/check-i18n.mjs) / [client-lint.mjs](../../scripts/client-lint.mjs) |
| 9 | 台账登记：`LEDGER_SPECS` 加一项 + [编号规范表](../../docs/conventions.md#编号规范) 补一行 + `DEFECTS.md` 首行写「本包序列」 | [defects-table.test.ts](../../scripts/test/defects-table.test.ts)（**硬编码数组，不登记就静默不查**） |
| 10 | 先问 4 件事落地（见文末） | — |

### 计数的三类处理（**不许一律改成新数**）

[conventions § 文档分档 三条纪律第 3 条](../../docs/conventions.md#文档分档) 原文：
「不写死计数……阈值、命令、基线数字属**技术事实**，只增不改；发现过期或自相矛盾**只加标注，不擅自"修正"**。」
⇒ 加包引出的计数与名单**远不止 23 处**（2026-10-11 全仓勘察：A 类 14 + C 类 13 + B 类 20），
要按下面三类分别处理；**全量清单见本节末尾的「P0-乙 计数清单」**。

| 类 | 处理 | 落点 |
|---|---|---|
| **A 结构断言**（当前真相） | **改**（或按纪律 3 的推荐：去数字化、改为指向 §2 那张**有守卫**的表）。**两条出路选哪条本身要维护者拍板** | `architecture.md` 标题 / §1 图 / `§7.1` 表行；`README.md` 包索引；`glossary.md` 的「聚合包」行 |
| **B 带日期的实测快照** | **不改数**；要新数据就**另起一行带日期** | `conventions.md` 的两处「10 个客户端半体」（139 / 53）、`client-style-spec.mjs`、`client-design-tokens.mjs`、`docs-index.mjs` 的「12/12」注记 |
| **C 覆盖面枚举** | **核对成员，不只是数字** | `i18n.md` 的「3 个有构建步骤」（正确，loglens 进构建型后 3 → 4）、`client-lint.mjs` 的名单（**已过期**，见 design.md §8） |

**什么不会红、什么会红**（2026-10-11 全仓逐条实测修正：本节原写「全仓只有 4 处计数断言」，
少算了**会红的两处绝对名单断言**）

| 形态 | 站点 | 加包后 |
|---|---|---|
| 绝对地板 | `docs-index.test.ts:95` `>= 12`、`package-contents.test.ts:177` `>= 13` | **永不红**（13 / 14 照样过；忘了补 `publish-targets.mjs` 那一行也照样绿——`inputs.targets` 就是那个数组） |
| 相对站点（两边现算） | `docs-index.test.ts:98` / `:99` / `:100` / `:371` | 漏登记 `architecture.md §2` 就红；补了则绿 |
| **绝对名单（会红）** | `plugin-settings-surface.test.ts:116` `toEqual([…8 个包名])` | loglens 一带设置卡片就是 9 ≠ 8 |
| **绝对名单（会红）** | `defects-table.test.ts:63` `toEqual([…4 名])` | 登记 `LEDGER_SPECS` 就红；**不登记则静默不查** |
| 潜伏名单 | `client-click-scope.test.ts:163` | loglens 不在 `:140` 的扫描名单里，**根本不被扫** |

⇒ 「地板型断言永远不会提醒人『该改文案了』」这句成立；但**名单型断言会红**——加包当天真正拦人的是那两道。
另外 `check-publishable.mjs:31-44` 的覆盖度判据也是**名单型且会红**：加包当天漏补 `publish-targets.mjs` 立刻 exit 1。

### P0-乙 计数清单（2026-10-11 全仓勘察）

**A 类：当前真相，加包要改（或去数字化）**

| file:line | 原文片段 | 处理 |
|---|---|---|
| `AGENTS.md:12` | 系统怎么运作、**12 个包**谁依赖谁 | 12 → 13 |
| `README.md:70` | **1 个共享库 + 10 个功能插件 + 1 个聚合包** | 1 + 11 + 1 |
| `README.md:86` | 聚合安装包：一条 bundle patch 挂载上面 **10 个插件** | 10 → 11 |
| `README.md:200` | **12 个包**怎么协作 | 12 → 13 |
| `architecture.md:1` / `:3` | 架构：**12 个包**…／「**12 个包**关系与协作」的唯一归宿 | 12 → 13（或去数字化） |
| `architecture.md:13` | ↑ 被下面 **9 个插件**依赖（`kit-settings` 是唯一例外） | 9 → 10 |
| `architecture.md:14` | `@hyzyn/dsh-<插件> ×10` | ×11 |
| `architecture.md:16` / `:36` | 一条 bundle patch 挂载上面 **10 个** | 10 → 11 |
| `architecture.md:138` | 同步档 `isLoopbackRequest`（**9 个插件**的历史口径） | **勘察新发现**：与同文 `:145`「其余 **7 个**插件」**现在就自相矛盾**；跟 §7.1 档位结论一起改 |
| `architecture.md:145` | 其余 **7 个插件** | 7 → 8（若 loglens 走同步档） |
| `glossary.md:15` | 一条 bundle patch 挂载全部 **10 个插件** | 10 → 11 |
| `packages/kit/README.md:93` | **9 个插件**的重复围栏收敛于此（同步档） | **勘察新发现**，本文原文没列 |
| `docs/conventions.md:781` | **12 个可安装包**各自在 `peerDependencies` 里… | **口径需拍板**：12 与 workspace 包数同值但含义不同（可安装目标实测 13 个） |
| 根 `package.json` / `packages/all` / 两个 `cordis.patch.yml` | 10 个 `@hyzyn/dsh-*` 依赖、11 条 `insert` | `pnpm aggregate` 现算，**加包后必须跑**（`aggregate:check` 会红） |

**C 类：覆盖面枚举，核对成员**

| file:line | 现状 | 加包后 |
|---|---|---|
| `i18n.md:24` / `:25` / `:95` | 「10 个包里只有 3 个有构建步骤」（`tty`/`docker`/`codegraph`）、其余 7 个裸 `client.js` | 走构建型则 3 → 4、10 → 11、裸包成员换一个 |
| `client-lint.mjs:19-21` | 「只有 docker / tty 两个包有 `client-src/`；其余 7 个（codegraph / env / …）」 | **两处错且互相抵消**：漏 `codegraph` 出「两个包」、名单又把 `codegraph` 放错侧并漏 `kit-settings`；数字 7 恰好对上。按纪律 3 只加标注 |
| `client-lint.mjs:126` | 「7 个裸 `client.js` 的包走这条」 | 同上 |
| `client-host-url.test.ts:128`、`client-click-scope.test.ts:140` | 硬编码 10 包名单 | 加 `loglens`，否则仓库级规则测试对它**零覆盖** |
| `plugin-settings-surface.test.ts:119` | 硬编码 8 名循环 | 加 `loglens`（否则它的设置面契约无人验） |
| `defects-table.test.ts:63` | 4 名硬编码 | 登记台账时同步加 |
| `search/src/index.ts:628-746` `PANEL_DIRECTORY` | 15 条（5 section + 10 card），其中 7 条带 `registryName` | 加 `loglens` 条目（`registryName` 也取 `loglens`）；**顺带**：`search/README.md:55` 与 `panel-catalog.test.ts:98` 写「六个插件卡片」，实际已是 **7**（与加包无关的既有漂移） |
| `scripts/windows/*.mjs`、`verify-client-ui.mjs` | 9 / 10 / 八个 的硬编码数组与 Set | 真机脚本**不进 CI**，漏了无人红，且这些脚本不会覆盖 loglens |

**B 类：带日期的实测快照，按纪律 3 不改数**（`conventions.md:377` / `:418` / `:855`、
`client-style-spec.mjs:17` / `:66` / `:891`、`client-design-tokens.mjs:42` / `:57`、
`check-package-contents.mjs:45`、`package-contents.test.ts:6` / `:163`、`docs-index.mjs:32` / `:414`、
根 `ROADMAP.md:223` / `:543`、`i18n.md:8`、`codegraph/README.md:123` / `:132-135`、`tty/README.md:134`、
`tty/DEFECTS.md:246`、`pr-body-dsh-market.md` 四处、`windows/README.md:216`、
`verify-client-ui.mjs:26` / `:174` / `:183` / `:370`、`agent-real-test.md:135` / `:161`）。

---

## 分期

| 期 | 内容 | 可独立交付 |
|---|---|---|
| **P0-甲** | 模板 kit 钉子（上节） | ✅ |
| **P0-乙** | 原子建包 + 计数三类 + 台账登记 | ✅ |
| **P1** | 契约 + 纯模块 + vitest 反例（含「同 ts 三行 / limit=2」与「同 ts 同内容两行 / limit=1」） | ✅ |
| **P2** | Loki 打通（本地容器真机验；并**单独测同 ts 多行的顺序稳定性**） | ✅ |
| **P3** | `loglens_search` / `loglens_fields` / `loglens_sources` / `loglens_context` + 分类表与守卫 | ✅ |
| **P4** | ES / OpenSearch 一个适配器（复用 P1 游标；`flavor` 分流） | ✅ |
| **P4 尾** | 出站围栏 `src/net.ts`（设计 §4.1 那四条） | ✅ |
| **P5** | Docker 作为来源（**选项 0**，零新机制） | ✅ |
| **P6** | Loki `tail`（`ws`）**已决定暂缓**（2026-10-12）；直方图与浏览器视图（**口径已拍板 = 选项 1**）**已落地**（2026-10-12）；面板的**按字段分组榜**（terms）**已落地**（2026-10-13，见文末）；design.md §5 | — |
| **P7** | 需要**跨后端统一查询**时才申请宿主半体插件间服务 | — |
| **P8-甲** | **工作台承载**：新增右侧栏标签挂载点（`sidebarRightTabs.register` + `sidebar.right.pane.tab`，key 用实现 id）+ guide 入口 + 卡片里一个「打开查询台」按钮；拿不到服务**安静退回卡片**。**零契约改动**，四条既有路由原样 | ✅ |
| **P8-乙** | **左栏 + 结果表**：字段侧栏（「这一页命中」/「其余可用字段」/「有类型冲突」三分区，复用 `/fields`）+ 结果表列集与行展开（`labels` 表 + `raw`）。**零契约改动**（`raw` 与 `labels` 本就随响应回来）。**已落地**（2026-10-17 第十刀）：字段侧栏三分区 + 子串过滤；列集（4 列上限、缺值画 `—`、正文 198px 下限 + 横向滚动）；行展开（全部标签 + 原文截断报原长）。P6 第六刀的「1 个身份标签 + ＋N」保留 | ✅ |
| **P8-丙** | **查询栏收口**：绝对时间输入（复用宿主 `asTime` 的既有口径）+ 自动刷新（相对档随当前时刻重算、绝对档不跟）+ 筛选芯片两格（从行上取值加筛选 / 界面侧 mute）+ 直方图放大补「再点一次取消」+ localStorage 记忆（列集 / 间隔 / 最近查询）。**零契约改动**。**已提前落地一部分**（2026-10-16）：从行上取值加筛选（与点榜下钻同一个 `drillDown`）+ 级别下拉（复用宿主既有 `level`，页内筛已如实标注）+ 直方图放大补「再点一次取消」+ 回车即查；**自动刷新 / mute / 绝对时间输入 / localStorage 还没做** | ✅ |
| **P8-丁** | **要先问的一期**：`NormalizedQuery` 加 `sort`（服务端排序）、`FacetsSpec` 加 `min`/`max`/`cardinality`（字段统计的另一半）、`capabilities().queryLanguage` 分档到 ES\|QL（要 ES 8.11+ 真机）。**每处都要同步 `capabilities()` ↔ 实现的对账守卫** | ✅（**但做之前单独一轮确认 + 真机验收**） |

**P8 的设计交底在 [design.md §9](./docs/design.md#9-查询工作台借-kibana-的核心不做-11-复刻)**——
「借什么 / 不借什么 / 承载 / 契约影响 / 边界与失败模式 / 验收口径」都在那一节，**本表只放判据与落点**
（不复制设计正文：复制即第二真相源）。P8-甲…丙 一条共同的前提：**零宿主改动**，
全走既有 `/config` `/query` `/fields` `/facets` 与既有形状，新增的只有浏览器侧状态与 `pure.js` 纯函数。

> **⚠️ 本表第三列的 `✅` 不是状态列**（表头写的是「**可独立交付**」）。它回答的是「这一期能不能单独发」，
> **不是「做完没有」**——2026-10-18 复核时发现，`P8-甲` 就是被读成「已完成」的那一格：
> 代码里**没有** `sidebarRightTabs` / `sidebar.right.pane.tab` / 「打开查询台」任何一处
> （`packages/loglens/client-src/index.js` 零命中），右侧栏工作台**一期都没落地**；
> 真正落地的是 `P8-乙` / `P8-丙` 的**面板内**部分（第十刀起那十几刀，记录在
> `## 已完成` 那节的各刀里）。要判断哪一期真做了，**读那一节的落地记录**，别读这张表。

**P1 的前置**（2026-10-11 已定稿，见 [design.md §3.2 / §3.3](./docs/design.md) 的「P1 定稿」两段）：
§3.3 的 `cursor_expired` 与 `hit_limit` 分家、`track_total_hits` 归适配器、Loki 顺序稳定性的保守退路
（这项的真机验证仍是 P2 的活；P1 只保证「声明成什么就按什么用」，不在本层假设顺序）。

**验证与验收**

- 全仓门禁 `pnpm typecheck && pnpm build && pnpm test && pnpm aggregate` 全绿；`lib/` 与 `client.js` 入库、`git diff` 干净（产物闸门）。
- 每个后端的解析 / 夹取 / 截断归并都有**宿主侧纯模块 + vitest 反例**（真机脚本进不了 CI，见
  [conventions § 真机脚本与 CI 接线](../../docs/conventions.md#真机脚本与-ci-接线)）。
- **P0-乙 建包当天跑一次 `pnpm coverage:check` 留基线证据**：`coverage-ratchet.mjs` 的范围是
  `packages/*/src/**`（glob），loglens 的 `src` 会自动进面；它**只在 nightly 跑、不在 ci.yml**
  （文件头自述「不挡任何人」），但降了就要么补用例、要么显式 `pnpm coverage:write`。
  模板自带 `src` + 一个会被 vitest 收集的测试，所以建包当天大致中性；真正的暴露是**之后**加 `src` 不加测试。
- 真机脚本：Loki 用本地容器；`DSH_HOME` 隔离 + 自证真实配置未变；新增 smoke 脚本照
  [tty 的 `windows-smoke`](../tty/package.json) 登记成 npm script。

---

## 待拍板（先问清单）

**2026-10-11 已拍板 4 项**（维护者逐条确认，本轮 P0-乙 就按这些落地）：

1. ✅ **档位**：进**加固档** → `isLoopbackRequestStrict` + `hasSameOriginProof`；`/config` 按**动作**豁免
   （`enabled` 免、`targets` 增删改要同源证明），并记下不对称（3 个包整体豁免 + 1 个包按动作部分豁免）。
2. ✅ **编号**：mint `loglens Dxx`（**从 D01 起**）+ 登记 `LEDGER_SPECS` + conventions 编号规范表补一行 +
   `DEFECTS.md` 首行写「本包序列」。
3. ✅ **构建型**：新包**可以**选 `client-src/` + 构建步骤（i18n 内联在 `client-src/index.js`、构建脚本遇残留 import `exit(1)`）。
4. ✅ **建包方式**：`packages/loglens/` 里已有当天新建的两份文档 → 先挪到 `/tmp`、跑 `create-plugin`、再挪回
   （两份文档内容一字未改；`pnpm aggregate` 与 `pnpm install --lockfile-only` 随后跑）。

**仍未拍板 2 项**（第 7 项落在 P7；第 8 项是 2026-10-15 新加的查询工作台前置。5 与 6 都已拍板，
保留原编号与结论）：

5. **私网语义** ✅ **已拍板（2026-10-11，常规做法）**：**连接面 = 你配置的来源**——回环 / 私网 / 公网
   一律放行，只有**链路本地 / 云元数据**被无条件拒绝（外加：只认 http(s)、不跟随重定向、解析后的 IP 判定、
   体积与超时上限）。当天先落地的「公网默认拒 + 按来源开 `allowPublic`」**已推翻并整条拆掉**，
   理由与证据见文末「公网档改判」一节。
6. **浏览器视图** ✅ **已拍板（2026-10-12，取选项 1「受控重复」）**：日志视图建在**各自插件自己的**
   卡片里，不做 `docker` 暴露视图挂载服务、也不新增共享包。判据在 [design.md §5](./docs/design.md)：
   两份视图**不是同一件事**（loglens 的是每个来源的结果视图，docker 的是容器日志工作台），
   而选项 2 要抽的正是那件工作台、改的是 ~9200 行的客户端 bundle——**不是做不到，是不值得**；
   将来真要时按 docker 消费 `ttyTerminal` 那个现成形状反过来做即可（不需要新机制）。
7. **宿主服务**：只在 P7 需要时再批（本仓第一条宿主半体插件间服务）。
8. **查询工作台（P8）的三件事**（定于 2026-10-15，设计见 [design.md §9](./docs/design.md#9-查询工作台借-kibana-的核心不做-11-复刻)）：
   ① **新增右侧栏标签挂载点**（`sidebarRightTabs.register` + `sidebar.right.pane.tab`）——跨包观感，
   **老宿主 / 拿不到服务的回退路径要一起定**（我们的口径：卡片保留今天的查询区，行为一点不减）；
   ② **改 [search/src/index.ts](../search/src/index.ts) 的 loglens 面板描述**（跨包一行；描述现在写着
   「面板侧只有来源清单与开关」，工作台落地后过期，而 `panel-registry-names.test.ts` 只查 `registryName`、
   **抓不到描述过期**）；③ **P8-丁 的契约改动**（`NormalizedQuery.sort` / 新聚合 / `queryLanguage` 分档到
   ES\|QL）——单独一轮 + 真机验收，且每处都要同步 `capabilities()` ↔ 实现的对账守卫。
   前两件在 P8-甲 / 乙 之前定；第三件是 P8-丁 的前置。

---

## Loki 本版不从界面提供（2026-10-18，维护者决定）

**变的是什么、没变的是什么**：变的是「提不提供」——`client-src/pure.js` 的 `KIND_OPTIONS` 不再列
`loki`、`DEFAULT_KIND` 改成 `elasticsearch`，设置卡片的描述也不再拿 Loki 当招牌。**没变**的是能力：
适配器、游标、`D02`/`D03` 的修复与 P2 那次真机验收全部保留，宿主的 `SOURCE_KINDS` 一个字没动
（仍收 `kind: loki`，面板也仍能查一条已存在的 Loki 来源）。

**为什么**：缺的是**能力闸那一段真机验收**——见本文 §「没验到的（明写，不混进 PASS）」第一条
（临时 profile 里没有 Loki 来源，那段只有用例与冒烟覆盖）。既然没在真机上验过，就先不摆到用户面前。

**恢复**：把 `'loki'` 加回 `KIND_OPTIONS`（一行）。⚠️ **别顺手把 `KNOWN_KINDS` 一起删**：它是
`draftFromTarget` / `draftProblem` 的**有效性**判据，删了会让一条已存在的 Loki 行被静默改写成默认
类型（状态还是 loki、下拉却画成第一项，而卡片其余部分按 loki 走）——那正是本包 `D04` 的形状。
下拉靠 `kindOptionsFor(kind)` 把「已知但已不提供」的类型附在当前行末尾，避免 `<select>` 回落画第一项。
守卫：[test/client-pure.test.ts](./test/client-pure.test.ts) 两条（下拉里没有 Loki / 已知的不被改写）。

**还没做的（本条目下的）**：真机验一次 Loki 的**能力闸**——临时 profile 里配一个 Loki 来源，把
「来源不支持聚合」那两句、字段清单与分页游标各走一遍，验完按上面一行恢复。

---

## 已完成（落点 + 门槛）

### P0-甲：模板 kit 钉子（2026-10-11 落地）

**改了什么**

- [templates/hello/package.json](../../templates/hello/package.json)：kit 钉子 `0.3.0` → `0.5.2`，把当时那处漂移归零。
- 新增 [scripts/create-plugin-manifest.mjs](../../scripts/create-plugin-manifest.mjs)：`readKitVersion()`（读
  `packages/kit/package.json#version`）+ 纯函数 `applyKitPin(manifestText, kitVersion)`。三条判据都不许
  「匹配不到就算过」：文本必须是合法 JSON、模板**必须**已声明 kit、kit 版本必须是**精确版本**
  （复用 [check-kit-pins.mjs](../../scripts/check-kit-pins.mjs) 的 `EXACT_VERSION`，两边同一个判据）。
- [create-plugin.mjs](../../scripts/create-plugin.mjs)：生成后按**现算值**重写新包的 `package.json`；失败即
  `exit 1`，不留「静默产出一个没有钉子的包」这条路。
- 新增 [scripts/test/create-plugin-manifest.test.ts](../../scripts/test/create-plugin-manifest.test.ts)：17 条用例
  （真实仓库形态 3 + 现算 / 形态 / 幂等 5 + 反例 9）。
- [RELEASING.md](../../RELEASING.md) 发布门槛第 4 条：补「新包的钉子生成时现算，模板字面值不是真相源」。

**门槛与证据（全部实跑）**

| 闸 | 结果 |
|---|---|
| `node scripts/check-kit-pins.mjs` | 通过：9 处声明同一精确版本 `0.5.2`。**改前也是通过**——模板不在扫描面，这正是「为什么先做」 |
| `/tmp` 仓根副本跑同一份 `create-plugin.mjs` | `packages/kit` 喂 `0.5.2` → 生成包钉 `0.5.2`；喂 `9.9.9` → 钉 `9.9.9`（现算真的生效） |
| 同上：模板删掉 kit 声明 / kit 版本写成 `^0.5.2` | 两次都 `exit 1`，stderr 说清原因、不打「已生成」日志 |
| `vitest run scripts/test/create-plugin-manifest.test.ts` | 17 tests 全过 |
| `node scripts/check-test-collection.mjs` | 通过：盘面 151 / 收集 150 / 豁免 1（新用例确实会被收集） |
| `node scripts/check-dsh-peers.mjs` | 通过：13 个可安装插件（含 `templates/hello`） |
| `node scripts/check-doc-links.mjs` | 通过：506 条相对链接、46 条同文件锚点（本节自身的链接已计入） |
| `node scripts/docs-index.mjs` / `node scripts/check-no-public-ip.mjs` | 通过 |

**两处计划外的记录**

1. **消费者是 9 个、不是 10 个**：本文原写「其余 10 个消费者全部 `0.5.2`」是错的——`kit-settings` 与 `all`
   都不声明 kit。已按闸门实测（9 处）改正；这是当天新写的文字、不是历史口径，所以是「改」而不是「加标注」。
2. **纯函数落点由 `scripts/lib/` 改为 `scripts/` 根**（第 3 步）。顺带发现一处**自相矛盾**：
   [vitest.config.ts](../../vitest.config.ts) 说 `scripts/lib/` 那类是「不起宿主、不被 import 进来跑」的隔离引导，
   而 `scripts/lib/dsh-runtime-store.mjs` **被** `scripts/test/dsh-runtime-store.test.ts` import。
   按纪律 3 只加标注、未改口径，标注就落在 `vitest.config.ts` 那段注释里。

**刻意不做的（原样保留）**：不把 `templates/hello` 加进 `collectKitPins()` 的扫描面——判据 3 要求钉子等于 kit
当前版本，那会把每次 bump kit 变成一次「模板必须同轮改」的人工同步点。模板钉位现在只被新用例断言为
**合法的精确版本**（挡 `^0.5.2` 这类会拉出第二份 kit 的形态），**不**断言「等于当前 kit 版本」。

---

### P0-乙：原子建包（2026-10-11 落地 10 / 10 项）

**落地了什么**

| # | 项 | 落点 |
|---|---|---|
| 1 | `create-plugin loglens` | `packages/loglens/`（`@hyzyn/dsh-loglens@0.1.2`；kit 钉子 `0.5.2` 由 P0-甲 的现算逻辑写入、peer 5 档全写、`dsh.engines.dsh: ">=0.1.7-rc.2"`）。建包前把本目录原有的 `ROADMAP.md` 与 `docs/` 临时挪到 `/tmp`、建完挪回，**两份文档一字未改** |
| 2 | 发布清单 | [publish-targets.mjs](../../scripts/publish-targets.mjs)：在 `packages/tty` 之后、`packages/all` 之前加一行 |
| 3 | `architecture.md §2` 加行 | [architecture.md](../../docs/architecture.md)（类型 = 插件，链接 README / 设计 / ROADMAP） |
| 4 | 计数三类 | **A 类**改数（`AGENTS.md` · 根 `README.md` 与 `README.en.md` 中英两侧 · `architecture.md` 标题/§1 图/§2 · `glossary.md` · `packages/kit/README.md`）；**C 类**成员重列（`i18n.md`、三处硬编码包名单）；**B 类一处未改数**（带日期的实测快照按纪律 3 原样保留） |
| 5 | 搜索面板目录 **+ 补了守卫** | [search/src/index.ts](../../packages/search/src/index.ts) 加 `loglens` card（`registryName: 'loglens'`）；**新增** [panel-registry-names.test.ts](../../packages/search/test/panel-registry-names.test.ts)——现算「`cordis.patch.yml` 里 `name` 等于本包 `package.json#name` 的那一行」= 该包自己的插件 id，再与 `PANEL_DIRECTORY` 的 `registryName` 对账；含 fixture 自证（喂不存在的名字 / 重复声明必须报） |
| 7 | peer / engines | 模板自带；`check-dsh-peers` 通过（14 个可安装目标，五档全写） |
| 9 | 台账登记 | `LEDGER_SPECS` 加 `loglens` 项 + [defects-table.test.ts](../../scripts/test/defects-table.test.ts) 名单加 `'loglens'` + [conventions § 编号规范](../../docs/conventions.md#编号规范) 补一行 + 新建 [packages/loglens/DEFECTS.md](../../packages/loglens/DEFECTS.md)（首行「本包序列，与其它包不共享」） |
| 10 | 先问 4 件 | 见上方「已拍板 4 项」 |

**`D01` 是建包当天真实发生的那一条，不是凑数**：`test/loglens.test.ts` 的文件头块注释里写了 glob，那个「星号 + 斜杠」
提前闭合了注释，整份套件加载失败（`ReferenceError: test is not defined`）。`templates/hello/test/hello.test.ts` 的同一句里
**专门放了一个零宽空格**来躲开它——也就是说这个坑会随 `create-plugin` 复制进每一个新包。修法与编号见
[DEFECTS.md](./DEFECTS.md)，源码侧也留了指向它的注释。

### P0-乙 收尾：客户端半体 + 设置面（2026-10-11 当天落地）

**改了什么**

- [client-src/index.js](../loglens/client-src/index.js)（设置卡片）+ [client-src/pure.js](../loglens/client-src/pure.js)
  （纯逻辑，进 vitest）+ [scripts/build-client.mjs](../loglens/scripts/build-client.mjs)——照 codegraph 那条路：
  剥掉 pure.js 的 import、把它的 export 前缀去掉后内联进 factory 的内联锚点、发现残留 import 直接 `exit(1)`；
  产物 `client.js` 入库。
- 卡片：来源清单（类型 / 名称 / 地址三列，逐行保存与删除）、插件开关、以及「查询能力还没实现」这句明写的提示。
  **一行一次请求**——新增走 `targets.add`、改走 `targets.update`、删走 `targets.remove`、开关走 `enabled`；
  界面永远以宿主返回的那份为准（不做本地乐观合并）。
- 设置面契约块从 [plugin-settings-surface.test.ts](../../scripts/test/plugin-settings-surface.test.ts) 的
  `expectedBlock()` **正身**取出来拼接（不是手抄），所以「逐字节相同」是机械保证的。
- `package.json`：`files` 加 `client.js`、`build` 串上客户端构建、`typecheck` 串上 `client-lint`
  （模板给的 `tsc --noEmit` 对客户端半体零覆盖）、补 `lint:client`；三处仓库级名单加 `loglens`
  （client-host-url / client-click-scope / plugin-settings-surface）。
- **宿主侧同时补了最小可用的设置面**：`/api/dsh-loglens/config` 的 GET 与 POST
  （[src/index.ts](../loglens/src/index.ts)），配置写在 `settings.update('loglens', …)` 的 volatile 路径上；
  来源清单的纯判据在 [src/config.ts](../loglens/src/config.ts)（id 生成 / 地址校验 / 宽松读盘 / 增删改）。
- [docs/i18n.md](../../docs/i18n.md) 的注记按计划摘掉，两个名单更新（构建型 3 → 4、客户端半体 11 个）。

**门槛与证据（全部实跑）**

| 闸 | 结果 |
|---|---|
| `pnpm typecheck` | 通过；loglens 的 `client-lint`：宿主地址来源 0 处、样式变量 55 处全部存在、胶囊/正圆 1 处配对 `corner-shape`、发丝线 5 处、圆角 6 处、危险按钮 1 处、按钮族 3 个类、排版 13 处、输入档 1 处、颜色 55 处 |
| `plugin-settings-surface.test.ts` | 通过（12 条；含 loglens 的契约块逐字节比对与「bundle.config key 全仓两两不同」） |
| `client-host-url` / `client-click-scope` 用例 | 通过（24 / 22 条）。loglens 已进两份名单；`bound` 那份「谁绑了 document 点击」的快照仍是 mcp / profile / prompt / rss 四张——本卡片用 React 的 onClick，不挂 document |
| `check-i18n` | 通过：**11 / 11** 个客户端半体接入；loglens 30 条键 zh/en 一致、用法命中、剩余中文字面量 0 条 |
| `check-package-contents` | 通过：loglens 10 个文件（含 `client.js`）都在 tarball 里 |
| `check-test-collection` | 通过：盘面 155 / 收集 154 / 豁免 1 |
| 全仓门禁 | `pnpm typecheck && pnpm build && pnpm test && pnpm aggregate` 全绿：**154 文件 / 2585 用例** |
| 本包单测 | 49 条（来源纯判据 22 + 宿主路由与围栏 17 + 客户端纯逻辑 10） |

**刻意的边界（别当成漏做）**

- **查询面一行都没有**：没有适配器、没有 agent 工具、没有结果视图。卡片上把这句话写着——给一个
  「看起来能用」的假界面比空着更糟。
- 客户端只做**即时反馈**（`draftProblem`）；链路本地地址刻意不在浏览器侧拦——判据与围栏只有宿主一份
  （`normalizeUrl` + 路由层的同源证明），堵两处就会有两份会漂的规则。
- 不做 `docker exec`、不做写操作、不建浏览器侧共享包（i18n 目录内联在 `client-src/index.js`）。



**门槛与证据（全部实跑）**

| 闸 | 结果 |
|---|---|
| `pnpm typecheck && pnpm build && pnpm test && pnpm aggregate` | 全绿：**152 files / 2532 tests**、`aggregate` 无 diff（`11 个插件`） |
| `check-dsh-peers` / `check-publishable` | 通过：**14 个可安装目标**在发布清单内 |
| `check-kit-pins` | 通过：**10 处**声明同一精确版本 `0.5.2`（loglens 是第 10 个消费者） |
| `docs-index` | 通过：workspace 包 **13 个** / §2 包清单 **13 行** |
| `check-doc-links` | 通过：533 条相对链接、48 条同文件锚点 |
| `check-test-collection` | 通过：新用例都真的会被 vitest 收集 |
| `defects-table.test.ts` | 通过：33 条（含新登记的 `loglens`） |
| `check-aggregate` | **红到提交为止**：它比对 `git diff`，本轮尚未 commit——这正是「聚合层与包必须一起提交」的本意 |
| `check-i18n` / `check-engine-strict` / `check-no-public-ip` | 通过 |

**同轮修掉的三处自伤（记一笔）**：① `test/loglens.test.ts` 里描述 `D01` 时**又写了一次字面量斜杠**，把注释重新闭合（同一条缺陷的第二次踩中）；
② `src/index.ts` 的 JSDoc 里写了仓内 markdown 相对链接，被 `published-links` 抓出会随 `lib/index.d.ts` 发出去；③ 建包前 `packages/loglens/` 已存在导致 `create-plugin` 拒绝，靠临时挪目录解决。
### P1：契约 + 纯模块 + 反例（2026-10-11 落地）

**改了什么**

- [src/backends/types.ts](../loglens/src/backends/types.ts)：契约形状——`LogBackend` / `BackendCaps` /
  `NormalizedQuery` / `LogLine` / `LogCounts` / `Truncation` / `TruncationReason` / `LogQueryResult`。
  只放形状、不放实现；契约正文仍在 [docs/design.md](./docs/design.md) §3。
- [src/query.ts](../loglens/src/query.ts)：归一化与夹取——时间戳必须 **epoch 毫秒**（写成秒直接报错，
  否则查的是 1970 年）、时间窗超上限**报错而不静默截短**（静默截短会把「查到的就是全部」变成谎话）、
  `limit` 超上限是夹取 + 警告、方向默认 `backward`、游标只透传、`filters` 校验；`countsOf`
  （`totalKnown` 只在真有精确总数时为真：ES 的 `relation === 'gte'` 不算）与 `truncationOf`
  （理由集合与顺序固定）。
- [src/cursor.ts](../loglens/src/cursor.ts)：Loki 游标——`{ endNs, streamIdx, ordinalAtTs }` 三件套 +
  `slicePage` 切页；`decodeCursor` 解不开就报 `invalid`，**不回落成「当作没有游标」**——那会把
  「续页」悄悄变成「重头再来」，用户看到的是重复行而不是一条错误。
- 用例：`test/query.test.ts`（23 条）+ `test/cursor.test.ts`（12 条）。两条点名要有的反例在里面：
  **同 ts 三行 / limit=2 不丢第三行**、**同 ts 同内容两行 / limit=1 不吞第二行**；另把反面教材
  「按最旧 ts − 1ns 续页」写成了用例，证明那样会把整个同值批丢掉。

**门槛与证据（全部实跑）**

| 闸 | 结果 |
|---|---|
| 本包单测 | **84 条**（来源纯判据 22 + 宿主路由与围栏 17 + 客户端纯逻辑 10 + 归一化 23 + 游标 12） |
| `pnpm --filter @hyzyn/dsh-loglens typecheck` | 通过（tsc + client-lint 十六条） |
| 全仓门禁 | `pnpm typecheck && pnpm build && pnpm test && pnpm aggregate` 全绿：**156 文件 / 2620 用例**；doc-links / i18n / no-public-ip / package-contents / test-collection / publishable / kit-pins / dsh-peers / engines / toolchain / issue-forms / dsh-home 全绿 |

**刻意不做的**

- 不做后端适配器、不注册 agent 工具、不给浏览器面加查询 UI——那是 P2 / P3 / P6。
- 不在本层假设 Loki 的返回顺序稳定：`pagination` 由适配器声明，测不出稳定序就声明 `'none'`。

### P2（代码半体）：Loki 适配器（2026-10-11 落地；真机验收待办）

**为什么只有一半**：P2 的定义是「Loki 打通（本地容器真机验；并单独测同 ts 多行的顺序稳定性）」，
而**本机没有 Loki 环境**。适配器本身不依赖真环境——它只是一层薄的翻译与摊平——所以先把代码与
wire 级用例做完，真机那一半等有环境（你自带的 Loki，或允许在本机起容器）再补。

**改了什么**

- [src/backends/loki.ts](../loglens/src/backends/loki.ts)：`query_range` 的请求构造（路径拼接不丢子路径
  前缀、纳秒时间戳用字符串原样传、空查询串发 `{}`）、`streams[].values` 摊平成行并**补一个确定的
  跨流合并顺序**（Loki 按流返回，跨流没有全局顺序）、stats 搬进 `scannedRows` / `scannedBytes`、
  `/labels` 与 `/ready`、请求超时（AbortController）与错误文案（状态码 + Loki 的 `error`）。
- **同 ts 多行的边界**交给 P1 的游标：带游标时把窗口右端收到游标那个 ts（`minNanoString` 在纳秒
  层面取较早者——先换成 ms 再换回来会把亚毫秒边界磨掉，那一批行就再也取不回来）。
- **分页能力当前声明 `'none'`**（`LOKI_PAGINATION`）：顺序稳定性还没在真机上测过，所以不对外给游标，
  只报 `hit_limit`，让调用方说「命中可能不完整，请缩小时间窗」。实现与用例都已就位，测出稳定序后
  改这一个常量即可。
- 结构化 `filters` 直接报错（LogQL 没有对应的独立参数）——**不静默忽略**：那会让用户以为筛过了。

**门槛与证据（全部实跑）**

| 闸 | 结果 |
|---|---|
| 本包单测 | **104 条**（+20 条 Loki wire 级：真 `node:http` 假 Loki、真 fetch、真参数与响应体） |
| 用例覆盖 | 请求形态（纳秒 / limit / direction / 子路径前缀 / `{}`）、跨流合并顺序、同 ts 序号、stats 计数、`pagination:'none'` 的保守退路、**cursor 路径下的两条「不丢行」**、游标解不开报错、500 / 非 JSON / `status:error` / 超时、`/labels` 与 `/ready` |
| 全仓门禁 | `pnpm typecheck && pnpm build && pnpm test && pnpm aggregate` 全绿：**157 文件 / 2640 用例** |
| 守卫 | doc-links / i18n / no-public-ip / package-contents / test-collection / aggregate:check / artifacts:check 全绿 |

**待办（P2 剩下的一半）**

1. 起一个 Loki（本机容器，或你已有的环境），用真数据跑一次 `query_range`；
2. **单独测同 ts 多行的顺序稳定性**：同 stream 同纳秒写 N 行、重复查询多次，看返回顺序稳不稳；
3. 稳定 → `LOKI_PAGINATION` 改 `'cursor'`（用例里那条路径已经覆盖）；不稳定 → 保持 `'none'`，
   并把「命中可能不完整」的提示写进工具的返回值。

> **2026-10-12 收口：这三步做完了，结论是「顺序**不**稳定，但游标照样能成立」——见下面
> 「P2 真机验收」一节。** 上面第 3 步的二分法（稳定才给游标）本身被真机推翻了：
> 顺序确实不稳，可把坐标从「组内第几行」换成「完整 ts 组」之后，游标就是不丢不重的。
> 原文保留（纪律 3）。

### P2 真机验收：真 Loki 3.7.8 上的分页（2026-10-12）

**环境**（隔离，跑完即删）：本机 `/tmp/loglens-real/` 放 Loki **3.7.8** 的 darwin-arm64 官方二进制
（Docker Hub 在本机不可达，改从 GitHub Release 取），独立 `data/` 目录、端口 13100、
`auth_enabled: false`。**没有碰任何用户配置**。

**为什么这件事必须真机做**：P1 的游标实现、它的用例、它的注释三处自洽，但都建立在一条
**没验过的前提**上——「同一 stream、同一 ts 内多行的返回顺序稳定」。假 Loki 只是回一份固定 body、
根本不看 `start`/`end`/`limit`，所以那条前提在 CI 里永远「成立」。真机一上，前提就塌了。

#### 抓到的两个缺陷（都已修，编号 D02 / D03）

| 编号 | 真机现场 | 根因 | 修法 |
|---|---|---|---|
| **D02** | 续页**回 0 行**，写入 80 行只取回 7 行 | Loki 的 `query_range` **`start` 闭、`end` 开**（逐纳秒实测：`end = ts` 命中 0 行、`end = ts+1ns` 才命中），而游标按「含边界」把窗口右端收成了游标那个 ts → 整组落在窗口外 | 续页边界改成 `boundaryNs + 1ns` |
| **D03** | 修完 D02 后**原地重复**：连翻 41 页拿到 280 行，去重只有 7 行 | 「同 ts 第几行」不是稳定坐标：① 流在响应里的次序随窗口变；② `limit` 切在同纳秒组中间时 Loki 交回的行也不稳 | 换坐标：组内按**内容**定序、`LogLine.id` 去掉流序号；每页末组**整组补齐**；forward 从 `末组ts + 1ns` 起、backward 到 `末组ts` 止 |

两条都记进 [DEFECTS.md](./DEFECTS.md)（§1 索引表 + §2 编号字典），
`docs/conventions.md` 的编号规范表同步到 `D01–D03`。

#### 顺序稳定性：**测出来了，是不稳定**

同一份数据、同一查询，重复 10 次：**10/10 完全一致**（单机单 ingester 的常见情形）。
但**换窗口/换 limit 就会变**——这正是 D03 的成因。所以「顺序稳定」这个前提应当判为
**不成立**，游标的成立靠的是换坐标，不是靠赌顺序。

#### 修好之后的真机对账（**12/12 PASS**）

数据：3 条流 × 8 个时间点 × 每点每流 **同一个纳秒** 5 行 = **120 行**；
用插件**自己的** `createLokiBackend()` + `slicePage()` 逐页翻完（每页都走真 HTTP）：

| 方向 | limit | 返回 | 唯一 | 重复 | 判定 |
|---|---|---|---|---|---|
| forward | 1 / 3 / 7 / 11 / 13 / 25 | 120 | 120 | 0 | **PASS** ×6 |
| backward | 1 / 3 / 7 / 11 / 13 / 25 | 120 | 120 | 0 | **PASS** ×6 |

（limit 刻意取质数，专切同纳秒组中间——那正是 D03 的触发条件。）

#### 连带改动

- `LOKI_PAGINATION` 由 `'none'` 翻成 **`'cursor'`**：从今往后 Loki 来源会给 `nextCursor`，
  调用方可以真正翻页。
- 假 Loki 升级为 **`startRealisticLoki`**：按真语义过滤（`start` 闭 / `end` 开）与截断（`limit`），
  并支持打乱流次序。**这一条是 D02/D03 反例能不能拦住人的关键**——假服务器不实现真语义，
  反例就是装饰（旧版假 Loki 就是这个问题，两条 bug 在它面前全绿）。
- 用例：`cursor.test.ts` 整组重写（按完整 ts 组切页、`groupFingerprint` 对顺序免疫、
  `lineFromLoki` 的 id 不含流序号）；`loki.test.ts` 加 D02/D03 两条反例 + 流次序打乱的反例。
- 行为取舍（明写）：**末组补齐会让页略超 `limit`**（组是切不开的，宁可多给几行也不丢行）；
  末组大到补不齐（`LOKI_GROUP_MAX = 5000`）时**不产出游标**，只报 `hit_limit`。

#### 还没做的

- **Loki 的 `tail`（WebSocket 跟随）：已决定「暂缓」（2026-10-12，维护者）**——**不是被卡住，是主动不做**。
  两条理由：
  ① **没有消费者**：工具与面板都没有用它。`stream()` 从没实现过，所以 `capabilities().follow` 诚实地
    声明为 **`false`**（这一位会经 `loglens_sources` 原样回给 agent，声明成 true 等于指一个不存在的入口）；
    守卫 [test/capabilities.test.ts](../loglens/test/capabilities.test.ts) 钉住「声明 follow 就必须真的有
    `stream()`」，实现那天改回来。
  ② 维护者判断**验证不值**：手上真在用的日志来源是 **ES**（它的「跟随」是 `_search` + 轮询，不是 WebSocket），
    Loki 的 tail 因此没有一个「真实的来源」可验收。
  > **一条事实说明**（免得下一个人误以为是缺环境）：Loki 的验收环境本身**是能搭的**——P2 那次真机验收
  > 就是在本机跑真 Loki 3.7.8 二进制（Docker Hub 不可达时从 GitHub Release 取的）。真正缺的是
  > **长连接的验收口径**（tail 是持续流，「什么算通过」得先定）与一个会用到它的消费者。要做时按
  > [design.md §6](./docs/design.md) 的 `ws` 方案、**连消费者一起**落地，再把这一位改回来。
- 真机只在本机单 ingester 上跑过；**多 ingester / 集群**下的组内次序没测（判据已改成不依赖它）。

### P3：四个 agent 工具 + 档位分类表（2026-10-11 落地）

> 本节是**当天那一刻**的落地记录，「四个」是那时的真实数目。同日更晚的真机反馈第 2 条补上了
> `loglens_facets`（见「真机反馈第五批」），所以**现在的名单是五个**——以
> [src/tools.ts](../loglens/src/tools.ts) 的注册处为准，本节的数字按纪律 3 **不改**。

**改了什么**

- [src/tools.ts](../loglens/src/tools.ts)：`loglens_sources` / `loglens_search` / `loglens_fields` /
  `loglens_context` 四个工具 + 分类表 `LOGLENS_TIER_CLASS`（**四个全是 `read`**）与前缀
  `LOGLENS_TIER_PREFIXES`；`backendFor(kind)` 是后端注册表（目前只有 Loki）。
- [src/index.ts](../loglens/src/index.ts)：`ctx.inject(['tools'])` 里注册工具与 `attachTierGate`，
  与 `enabled` 同生命周期（禁用热生效时一起撤下；`persist` 会调 `refreshTools` 重挂）。
- 用例 [test/tools.test.ts](../loglens/test/tools.test.ts)（20 条，假后端）+ 
  [test/tier-gate.test.ts](../loglens/test/tier-gate.test.ts)（8 条：对账守卫 + 真闸行为）。
- [docs/permission-tier-plan.md](../../docs/permission-tier-plan.md) §2.1 多了 **loglens 那张表**（分类表的
  唯一归宿）；[docs/architecture.md](../../docs/architecture.md) 里「分类表在各自 `src/index.ts`」的口径
  补上「loglens 在 `src/tools.ts`」。

**三条贯穿工具面的规矩**（都写进了文件头）

1. **一次一个来源**：省略 `target` 只在「恰好一个来源」时回落，多个时把候选 id 列出来。
2. **没有适配器就说清怎么绕**：Docker 指路到现成的 `docker_logs` / `docker_logs_grep`（选项 0）、
   ES / OpenSearch 说明是 P4——不留一句干巴巴的「不支持」。
3. **诚实的截断信号**：来源声明 `pagination:'none'` 且这一页被 limit 截断时，只报 `hit_limit` +
   一句「命中可能不完整，请缩小时间窗」，**不给会丢行的游标**；声明了 `cursor` 的来源才透传 `nextCursor`。

**门槛与证据（全部实跑）**

| 闸 | 结果 |
|---|---|
| 本包单测 | **132 条**（8 个文件） |
| 对账守卫 | 注册处现算名单 ↔ `LOGLENS_TIER_CLASS` 双向一致；四个工具都落在前缀里；四个全是 `read` |
| 闸行为 | read-only + never 下四个工具全部放行；前缀外（bash / docker_ps / tty_run / loglen_search）零介入；未分类的前缀内工具放行 + 一条告警（兜底是对账守卫） |
| 全仓门禁 | `pnpm typecheck && pnpm build && pnpm test && pnpm aggregate` 全绿：**159 文件 / 2668 用例** |
| 守卫 | doc-links / i18n / no-public-ip / package-contents / test-collection / publishable / kit-pins / dsh-peers 全绿 |

**对账守卫当场抓到一个真问题（记一笔）**：文件头注释里写了「从本文件 `add('loglens_x', …)` 的调用处
现算」——守卫的字面量扫描把注释里那个名字当成了一个真的注册项，两条用例直接红。修法是改注释，不是
放宽守卫：**注册处的字面量就是事实来源，注释里不该出现同形文本**。

### P4：Elasticsearch / OpenSearch 适配器（2026-10-11 落地代码半体）

**改了什么**

- [src/backends/elastic.ts](../loglens/src/backends/elastic.ts)：两家的差异只在方言与版本号，查询面是同一条
  `_search`，所以是**一个适配器 + `flavor` 分流**（设计 §2）。`src/tools.ts` 的 `backendFor` 随之接上
  `elasticsearch` / `opensearch` 两个 kind。
- **分页走 PIT + search_after**（不是 offset）：分的是**同一个快照**。开 PIT 用 `/<index>/_pit?keep_alive=2m`；
  搜索走 `/_search`（带 PIT 时路径上**不许**再带索引，ES 直接报错）；最后一页顺手 `DELETE /_pit`
  （不带游标那次的收尾也一样）。
- **游标过期**：PIT 没了时 ES 回 404 `search_context_missing_exception`——本层把它映射成
  `truncation.reasons = ['cursor_expired']` 而**不重开 PIT**（重开会悄悄换掉快照语义），工具层再补一句
  「请重新发起一次带时间窗的查询」。
- **`track_total_hits` 显式打开**：要报精确命中数就得付这个代价（设计 §3.2 的归属），响应里 `relation` 仍是
  `gte` 时 countsOf 如实把 `totalKnown` 置假。
- **索引表达式取自来源地址的路径**（`http://host:9200/logs-*`，不写就是 `*`）；`user:pass@` 换成 Basic 头、
  **URL 里不留凭据**（错误文案与日志里也不该有密码）。
- [src/cursor.ts](../loglens/src/cursor.ts) 多了 ES 那一份游标（`{ v, kind: 'es', pitId, searchAfter }`）：
  两份形态共用版本号常量，**拿错适配器的游标会在 decode 时被拒**（`kind` 不匹配）。
- 用例 [test/elastic.test.ts](../loglens/test/elastic.test.ts)（20 条，假 ES 是一个真的 `node:http` 服务：
  真 fetch、真请求体、真响应体，连 `search_after` 与 PIT 生命周期都由假服务器自己演）。

**刻意不做的**

- **不谎报方言**：`capabilities().queryLanguage` 报 `lucene`——OpenSearch 的 PPL / SQL、ES 8.11+ 的 ES|QL
  都还没做（设计 §6 列了它们的位置，但没做就不写进能力里）。
- 不做 _msearch / fan-out；一次仍只查一个来源。
- 真机验收（真 ES / OS）与浏览器侧结果视图分别是「待环境」与 P6。

**门槛与证据（全部实跑）**

| 闸 | 结果 |
|---|---|
| 本包单测 | **152 条**（9 个文件） |
| ES 侧覆盖 | 请求形态（PIT 开在哪、搜索为什么不带索引、ISO range、sort 两键、`track_total_hits`）、映射与 labels 上限、`relation` 三态、`timed_out` / 分片失败、游标（复用 PIT / 收尾关 PIT / 过期不重开 / kind 不匹配）、Basic 头、401 与非 JSON、超时、`_field_caps`、`flavor` 不一致的提示 |
| 全仓门禁 | `pnpm typecheck && pnpm build && pnpm test && pnpm aggregate` 全绿（数字见提交） |

**踩到的一个真问题（记一笔）**：第一版把 `access.url` 当成「带索引路径的基址」用，于是搜索请求发到了
`/logs-*/_search`——而带 PIT 的搜索**不能**在路径上带索引，11 条用例一起红。修法是把基址收成 **origin**、
索引由 `targetIndex` 单独给；注释里写清了为什么这两者必须分开。

### P5：Docker 作为来源（选项 0）——agent 侧落地（2026-10-11）

**做法**：**不包一层**（设计 §5 选项 0 的 Agent 那一格）——docker 目标在 `loglens_*` 里只做**指路**，
查询走现成的 `docker_logs` / `docker_logs_grep`。零新机制，也不造第二份口径。

**改了什么**

- [src/tools.ts](../loglens/src/tools.ts)：新增 `hintFor(kind, caps)`——把「下一步怎么走」变成**会出现在
  工具返回值里的判据**（不是埋在文档里的说明文），`loglens_sources` 的每一行多一个 `hint` 字段：
  1. **docker**：用现成的 `docker_logs` / `docker_logs_grep`，本插件不包一层；
  2. **声明 `pagination:'none'` 的来源**（当前是 Loki）：被 limit 截断时只报 `hit_limit`，请缩小时间窗分几次查；
  3. **ES / OpenSearch**：分页走 PIT，游标有寿命，过期后要重新发起一次带时间窗的查询。
- `adapterHint('docker')` 的措辞对齐「采集来源」这一身份（不再是「没有适配器」的口气）。

**实测前提**：**tools 服务**没有列举 API（`@deepseek-ai/dsh-tools@0.1.2-rc.1` 的 `ctx.tools` 只有
`register` / `restrict` / `guard`），所以**不要从 tools 服务猜别的插件在不在**。但**插件本身**在不在有合法判据
——cordis 的 plugin registry（`ctx.registry.values()`，先例是 search 的 `getLoadedRegistryNames`），
P6 的 Docker 那半格用的就是它（见下一节的自我更正）。

**刻意不做的**

- 不为 docker 造 `LogBackend` 适配器（那正是选项 0 要避免的重复）。
- 不在宿主侧探测别的插件在不在（同上：没有公开 API，且用不上）。
- 面板那一格（浏览器相对路径 fetch `/api/dsh-docker/logs`，弱面：无 until、tail 有上限、无 grep）没有做——属 P6。

**门槛与证据（全部实跑）**

| 闸 | 结果 |
|---|---|
| 本包单测 | **154 条**（+2：`hintFor` 的四条分支 + docker 行带替代路径） |
| 全仓门禁 | `pnpm typecheck && pnpm build && pnpm test && pnpm aggregate` 全绿（数字见提交） |

### P6（面板侧第一刀）：HTTP 查询面 + 共用执行层（2026-10-11）

**为什么先做这一刀**：面板要能查，浏览器就得有一条**自己的** HTTP 路径——agent 工具（`loglens_search`）
是模型侧的入口，浏览器调不到。于是把「找来源 / 归一化 / 拼返回形状」抽成一层给两边共用，再给面板开
`/query` 与 `/fields`。

**改了什么**

- 新增 [src/execute.ts](../loglens/src/execute.ts)：`resolveTarget` / `adapterHint` / `hintFor` /
  `describeTarget` 与 `runSearch` / `runFields`——**agent 工具与面板路由共用的唯一实现**（两处各写
  一遍就是两份会漂的真相源，这正是本仓反复出现的反模式）。
- 新增 [src/backends/registry.ts](../loglens/src/backends/registry.ts)：kind → 适配器（Loki / ES / OS；
  Docker 按设计不进这里）。`src/tools.ts` 只留**注册与渲染**，`backendFor` 从注册表来。
- [src/index.ts](../loglens/src/index.ts)：三条路由 `/config` / `/query` / `/fields`。围栏：
  整条走加固档；`/config` 按动作豁免（只有 `enabled` 免证）；**`/query` 与 `/fields` 要同源证明**——
  它们只读，却会**替请求方打到已配置的内网目标**并把结果带回来（设计 §4.3 说的「用读面打它」正是这两条）；
  插件禁用时三条里只留 `/config`。
- 用例 [test/query-route.test.ts](../loglens/test/query-route.test.ts)（9 条，端到端：路由 → 执行层 →
  真 Loki 适配器 → 假 Loki 的真 HTTP 服务）：同源证明（**没证的 403 且根本没打后端**）、GET/未知路由/
  非法 JSON、禁用时只留 /config、非回环、错误原话（找不到来源 / 没有适配器 / 秒级时间戳 / 后端 500）、
  `/fields`。

**门槛与证据（全部实跑）**

| 闸 | 结果 |
|---|---|
| 本包单测 | **163 条**（10 个文件） |
| 全仓门禁 | `pnpm typecheck && pnpm build && pnpm test && pnpm aggregate` 全绿（数字见提交） |

**还差的（P6 剩下的）**：浏览器侧的**结果视图**（表单 + 结果列表 + 截断提示）还没画；Docker 那一格
（面板相对路径 fetch `/api/dsh-docker/logs`）也还没接——两者的宿主侧地基这一刀已经铺好。
> **2026-10-11 后续**：这两格**当天就接完了**——结果视图见下一节「第二刀」，Docker 那一格见「第三刀」。
> 本段是当时的口径，按纪律 3 保留原文。

### P6（面板侧第二刀）：卡片里的查询区（2026-10-11）

**改了什么**

- [client-src/index.js](../loglens/client-src/index.js)：设置卡片里多了一块**查询区**——来源下拉 / 查询串 /
  时间窗（15m · 1h · 6h · 24h）/ 条数 + 「查询」；结果列表（时间到毫秒 · 级别 · 正文，等宽字体）；
  计数行（返回 / 命中或**至少命中** / 扫描行数与字节数）+ 截断理由的文案 + 宿主的 hint；
  有游标时给「下一页」（**按 id 去重**追加）。
- [client-src/pure.js](../loglens/client-src/pure.js)：表单的判据全在纯模块里——`windowRange`（预设 → 时间窗，
  认不出的回落 1 小时）、`queryProblem`（只判面板自己知道的事：选没选来源、条数是不是正整数）、
  `queryPayload`、`appendLines`（去重）、`countsParts`（matched 是下界时用另一个键，界面写「至少」）。
- 刻意**不在浏览器侧复制宿主的规则**（时间戳单位、窗口上限、limit 夹取都交给宿主），面板只显示宿主回的
  原话——两处各写一套判据就是两份会漂的真相源。

**两处被守卫当场抓到的真问题（都记一笔）**

1. **漏了 5 个 `useState`**：查询区的处理函数引用了 `setQuery` / `setOutcome` / `setLines` 等却忘了声明。
   client-lint 的**检查一**一次报出 39 处——正是它存在的理由（这类错误编译不报、只有真渲染到那条分支才炸）。
2. **`rows` 重名**：入口里原有的渲染变量 `rows` 与新增的 state `rows` 撞在**同一个 factory 作用域**
   （纯逻辑是内联进来的，兄弟模块与入口共享作用域）→ 浏览器里是**整个 bundle 解析失败、卡片根本不加载**，
   而 client-lint 当时把 TS2451 归进了**噪音**（只打印、不拦）。修法两条：
   - 把那个 state 改名 `lines`；
   - **把 TS2451 升成致命码**（client-lint 的 `FATAL_CODES` + 文件头的成因说明 + 失败文案），
     并给这条新判据配了反例用例 [scripts/test/client-lint-fatal.test.ts](../../scripts/test/client-lint-fatal.test.ts)：
     临时目录里喂一份重名声明 → lint 必须非零退出且报 TS2451；同一 harness 跑干净文件必须通过（证明不是永远红）。

**门槛与证据（全部实跑）**

| 闸 | 结果 |
|---|---|
| 本包单测 | **169 条**（11 个文件；客户端纯逻辑 16 条） |
| client-lint | loglens 通过：样式变量 64 处全部存在、自定义属性 65 处全部有定义、发丝线 6 处、圆角 7 处、排版 16 处均配对行高与字重、颜色 64 处无字面量兜底 |
| check-i18n | 通过：loglens **58 条键** zh/en 一致、用法命中、剩余中文字面量 0 条（键名域全部落在白名单里——`query.*` 一开始越界，改用 `section` / `hint` / `placeholder` 三个已登记的域） |
| 全仓 | `pnpm typecheck && pnpm build && pnpm test && pnpm aggregate` 全绿（数字见提交）；12 个包的 client-lint 都过（TS2451 升为致命后无人变红） |

**还差的**：Docker 那一格（面板对 docker 目标相对路径 fetch `/api/dsh-docker/logs`）没接；真机验收仍待环境。

### P6（面板侧第三刀）：Docker 目标在面板里看容器日志（2026-10-11）

**做法**：选项 0 的**面板半格**——浏览器**相对路径** fetch Docker 插件自己的路由（同源天然满足，无需端口发现）。
本插件不复制它的实现，只在界面上给它一个入口，并如实标注这条路的弱面。

**改了什么**

- 新增 [src/plugins.ts](../loglens/src/plugins.ts)：`loadedPluginNames` / `dockerPluginLoaded`——「某个插件装没装」的
  宿主侧判据走 **cordis 的 plugin registry**（`ctx.registry.values()` 的 runtime.name）。
- `GET /api/dsh-loglens/config` 的响应多了 `plugins: { docker: boolean }`：面板据此决定**给不给**那半格
  （不给一个按下去 404 的按钮）。
- `hintFor(kind, caps, { dockerLoaded })`：装了指向它的路由，没装就说清缺什么。
- 来源的 `dockerTarget` 字段（**只对 docker 类型有意义**，带上别的类型会 400）：Docker 面板那条路由按它
  **自己的**目标名找主机，两个插件各有各的目标清单，名字不会自动对上，所以显式存一个；留空时由 Docker
  插件自己在「只有一个目标」时回落。面板上它填在**「地址」那一格**（docker 来源本来就没有 URL）。
- 客户端：选中 docker 目标时，查询区换成 **Docker 日志区**——「拉取容器」（`POST /api/dsh-docker/containers`）
  → 选容器 / 行数（50 / 100 / 200 / 500）→「看日志」（`POST /api/dsh-docker/logs`，`since` 复用时间窗预设），
  结果按行渲染；附一句**诚实的弱面**：「这条路没有 until、行数有上限、没有 grep——要精确检索请让 agent 用
  `docker_logs_grep`」。
- 用例：新增 [test/plugins.test.ts](../loglens/test/plugins.test.ts)（registry 枚举 / 没有 registry / 枚举抛错都当
  「没装」）、`config.test.ts` 的三条（dockerTarget 只在 docker 上有意义 / 可留空 / 改判能改）、
  `tools.test.ts` 的 dockerLoaded 两个分支、`loglens.test.ts` 的 `/config` 新键。

**一处自我更正（按实测）**

P5 那段落地记录里写的「宿主侧没**有**判据、那条判据本来就是面板侧的机制」**不准确**，现在改正：
**tools 服务**确实没有列举 API（dsh-tools 0.1.2-rc.1 的 `ctx.tools` 只有 register / restrict / guard）——所以
**不要从 tools 服务猜别的插件在不在**；但**插件本身**在不在有合法判据：cordis 的 plugin registry
（`ctx.registry.values()`，先例是 search 的 `getLoadedRegistryNames`）。这一刀用的就是它。

**门槛与证据（全部实跑）**

| 闸 | 结果 |
|---|---|
| 本包单测 | **179 条**（11 个文件） |
| 全仓 | `pnpm typecheck && pnpm build && pnpm test && pnpm aggregate` 全绿（数字见提交） |
| 守卫 | check-i18n（loglens 66 条键 zh/en 一致）、published-links、doc-links、no-public-ip、package-contents、test-collection、aggregate:check 全绿 |

**还差的**：真机验收（本机 Docker 有容器时可直接在面板里点一遍）；Loki / ES 的真机验收仍待环境。

### 建包缺口的补丁：客户端半体要在 manifest 里**声明**（2026-10-11 真机验收抓到）

**现场**：loglens 装进 test-logs 后，「插件列表」里是 running、`/api/dsh-loglens/config` 也通，
但 **设置 → 插件配置里永远没有卡片**。查下来不是注册写法的问题（与 env / profile 逐字同款），
而是本包 `package.json` 少了同伴都有、而**没有任何守卫在查**的两条声明：

- `dsh.client = { platform: 'web', inject: [] }`
- `exports['./client'] = './client.js'`

宿主侧的 client-modules 按这份声明把包变成可加载的浏览器 bundle（文档原话：「浏览器插件包在其
package.json 中以 platform: 'web' 声明 dsh.client，导出 ./client bundle」）——**缺了它，`client.js`
一次都不会被加载**，而 `files` 里有它照样打得出包、i18n 与 client-lint 也照样全过：表现就是
「装了、在跑、就是看不到」。

**修了什么**

- 本包 manifest 补上两条（与 env / profile / codegraph / search / docker / tty 对齐）；
- **补守卫** [scripts/test/client-manifest.test.ts](../../scripts/test/client-manifest.test.ts)：盘上有
  `client.js` 或 `client-src/index.js` 的包，逐个对账这两条；配四条 fixture 反例（缺 `dsh.client` /
  platform 写错 / 少 `exports['./client']` / 指向别的文件）。此前 `check-package-contents`（只看 tarball
  条目）、check-i18n 与 client-lint 都查不到这个缺口；
- 设计文档里「构建型要写死的三件事」因此变**四件**（见 design.md §7）。

**一处连带发现**：宿主侧对**包元数据**的缓存是「按 Loader specifier 与 tree base URL 缓存至重启」——
所以修完 manifest 后，那个**已经在跑**的宿主仍然认旧元数据，要**重启**（或让插件条目重新标脏）才会把
客户端半体算进启动图。这条对「改完想看效果」的人很重要，记在这里。
### 真机验收（用户环境）：ES 7.10 的三处差异（2026-10-11）

用户拿一台 **Elasticsearch 7.10.2**（INFINI Labs 那套发行版）当来源，第一次查询直接报
「[elasticsearch] 打开 PIT 没拿到 id」。逐条打那台机器后确认三件事，全部已修并配了用例
（[test/elastic-710.test.ts](../loglens/test/elastic-710.test.ts)）：

| 差异 | 7.10 的实际行为 | 适配器怎么改 |
|---|---|---|
| PIT 响应键 | `{"pit_id": "..."}`（7.12+ 才改叫 `id`） | 两个键都认 |
| `_shard_doc` | **不存在**：回「No mapping found for [_shard_doc]」 | 退到 `_id`（真字段、可排序），**按目标记住**这次探测，之后不再白试 |
| 失败的表现 | `_shard_doc` 那次的失败是 **HTTP 200 + `_shards.failed` + 空 hits**（不是 4xx） | 除了 catch 异常，还看响应体里的失败原因 |

**真机验收结果**（用修好的适配器直接打用户那台 ES，只读）：

    counts: {"returned":3,"totalKnown":true,"matched":24588}
    truncation: {"truncated":true,"reasons":["hit_limit"]}   nextCursor: 有
    第二页: 3 行 ✓

`track_total_hits` 在这台上给的是**精确值**（`relation === "eq"`），所以 `totalKnown: true`；
时间字段是 `@timestamp`（`app-logs-*` 的映射里就有）。**索引表达式写在来源地址的路径里**最好
（不写会用 `*` 扫全部索引，包括 `.infini_*` 这类内部索引——又慢又噪）。
### P4 尾：出站围栏 `src/net.ts`（2026-10-11 落地）

设计 §4.1 那四条从「待做」变成代码。判据与分寸写在 [design.md §4.1](./docs/design.md#4-安全与凭据) 的落地记录里，
这里只记**落点与门槛**：

| # | 内容 | 落点 | 用例 |
|---|---|---|---|
| 1 | 解析后的 IP 判定（`dns.lookup` 之后；多地址逐条过；`localhost` 不打 DNS） | `src/net.ts` 的 `assertReachable` / `classifyAddress` | 六档分档表 · 元数据域名 · 多地址混合 · FQDN 尾点 |
| 2 | **不跟随重定向**（`redirect:'manual'`，3xx 即失败并回显 `Location`） | 同上 `requestJson` | 302 用例**直接数那台服务器的请求数**（诱饵服务器必须收到 0 个请求） |
| 3 | **公网默认拒 + 来源级 `allowPublic`**（链路本地 / 元数据无豁免） | `config.ts`（target 字段）→ `net.ts`（判据） | 默认拒 · 开了才放行 · 开了也不放行元数据 · HTTP 面往返 |
| 4 | 体积上限（8 MiB：先看 `content-length` 再边读边数）与超时（默认 20s） | `net.ts` | 声明超限 · 未声明也拦得住 · 超时 · 连不上（`transport`） |

**两条落在边界上的选择**（都记在这里，别当成遗漏）：

- **判定与建连是两步**，DNS rebinding 的窗口关不掉（要关得把校验下沉到连接层，如 undici 的
  `connect.lookup`）。来源地址是操作者自己填的，这一层的活是挡事故与过期的名字——README 的「已知限制」写了这句。
- **非 2xx 不在围栏里抛**：ES 的 `cursor_expired` 判定要读失败响应体（7.10 上还是 200 + 分片失败），
  所以 `net.ts` 把 status / text / body 原样交给适配器，只在「请求没打成 / 打成但形状不能要」时抛。
  Loki 与 ES 各自的失败形状（`[loki] HTTP …` / `ElasticHttpError`）因此**一个字都没改**——既有断言全绿是证据。

**上游**：设计 §4.1 记的「第二个消费者出现时上收到 kit」**不触发**——两个消费者（Loki / ES）都在本包内。
真要上收时，`net.ts` 是从 `assertReachable` + `requestJson` 两个导出切出去的。

### 公网档改判：连接面 = 你配置的来源（2026-10-11，推翻当天早先的「公网默认拒」）

**改的是什么**：`assertReachable` 不再因 `public` 档拒请求；`allowPublic` 字段、卡片上那一格（含三组 i18n 键）
与全部相关用例一并拆掉。留下的是四件与「公网」无关的保护：只认 http(s)、**不跟随重定向**、
**解析之后的 IP 判定**、体积（8 MiB）与超时（20s）。

**为什么改**（两条，第二条更硬）：

1. **常规做法**：日志/监控类工具连接面就是你配的那串地址——Grafana / Kibana / logcli 都不会因为目标是
   公网段就拒绝。这不是「安全功能」，是产品定位的表达，而它带来的是每次都要多点一下的摩擦。
2. **真机证伪**：用户的内网日志服务器在 `172.172/16`——RFC 1918 只覆盖 `172.16/12`（172.16~172.31），
   **172.172 不在里面**。于是「公网默认拒」实打实挡下了他唯一可用的来源，而那个地址**流量根本没出内网**。
   （中文企业内网不 NAT、直接用公网段很常见。）这一条把「纸面语义」和「现场语义」的差别摆到了明面上。

**留下的是什么**：真正的 SSRF 面是**链路本地 / 云元数据**（`169.254.169.254` 这类能换出云凭据，
实测里也确实只有它是「攻击者想要的那个地址」），以及**域名解析出来的东西 ≠ 你填的那个字符串**
（所以判定在 `dns.lookup` 之后）。这两条一条都没动。

**代价与残余风险**（明写，别当成没有）：插件现在能把请求打到任何 http(s) 地址上——包括回环上的别的服务。
挡住「拿它当通用 fetcher」的是另外两条：`/query` 要**同源证明**（跨站页面借不走读面）、
来源清单只能由**本机操作者**在设置卡片里加（`/config` 的增删改要同源证明）。
DNS rebinding 的窗口照旧关不掉（判定与建连是两步），这一点从头就在文档里。

**连带**：REVISION 记录进 [design.md §4.1](./docs/design.md#4-安全与凭据)（原文保留 + 改判理由），
本文件「待拍板第 5 项」相应改成已拍板。

### 真机反馈第五批：聚合与结构化过滤（2026-10-11）

第 2 条（也是 agent 最想要的一条）：它真正要回答的是「考试服务健不健康」，靠的是 terms / date_histogram
聚合；而插件面没有这个能力。更别扭的是 `filters` 的通道**早就在契约里**（`query.ts` 校验、
`NormalizedQuery.filters` 有它），ES 适配器却直接抛「暂不支持结构化 filters」，工具面也没暴露——
于是 agent 只能手写 Lucene 的 `container.name.keyword:"…"` 去猜约定，而 `.keyword` 这件事 schema 里一个字没提。

| 动作 | 落点 |
|---|---|
| **`filters` 打通**：ES / OpenSearch 查一次 `_field_caps`（按 target+字段缓存）决定打 term / `.keyword` / `match_phrase` | `elastic.ts` 的 `decideFieldShape` + `filterClauses`；工具面 `loglens_search.filters` |
| **`loglens_facets`**：按字段分组（terms，size 默认 10 / 硬上限 100）+ 按时间分桶（`fixed_interval`，`min_doc_count: 1` 只发有数据的点） | 契约 `LogBackend.facets?` + `FacetsSpec/FacetsResult`；执行层 `runFacets`；工具与 `/facets` 路由 |
| **近似性如实回报**：`otherCount`（`sum_other_doc_count`）与 `countErrorUpperBound` 进返回值与 warning | `FacetsResult`；渲染里也写「另有 N 条在没列出来的桶里」 |
| **`aggregations` 的诚实**：Loki 的 `capabilities().aggregations` 从 true 改成 **false**（它没有 facets 实现，LogQL 指标查询是另一件活） | `loki.ts`；调用方按这一位给指路文案（`facetsHint`） |

**为什么 `filters` 不许让调用方写 `.keyword`**：那是 ES 映射的约定，各家索引不一样，而且写错了**不会报错**——
`term` 打在 text 字段上匹配的是分词后的词，全串永远打不中，结果是一个静默的空集。所以解析权在适配器，
判据（`native` / `keyword` / `text`）还带缓存，一次查询里同一字段只问一次 `_field_caps`。

用例：`elastic.test.ts` 五条（filters 的两种打法、聚合请求体与三个信号、text 无子字段时的明确报错、
既没给 by 也没给 interval、字段表里不列 `.keyword` 子字段行）、`tools.test.ts` 三条（分组结果与两条 warning、
interval 形态与硬上限、无能力来源的指路）、`tier-gate.test.ts`（五个工具全是 read）、
`query-route.test.ts`（/facets 要同源证明）。

**真机复核（2026-10-11，只读打用户那台 7.10.2）**——这一批的每一项都在真集群上验过：

| 动作 | 真机结果 |
|---|---|
| `scope()` 回显 | `app-logs-*`（显式 index） |
| `fields` | **187 个字段、truncated=true**，前几个就是 `container.name` / `host.name` / `log.file.path` / `stream` / `log.level`；`.keyword` 重复行已去掉（改前 agent 拿到的是 45KB 且看不出截断） |
| `probe` | `7.10.2（elasticsearch）`，**最近 15 分钟 5987 条** |
| `facets by container.name`（近 1h） | `app-svc-1 13404`、`app-svc-2 10001`、`app-svc-3 324`、prometheus 238、grafana 190…；**其余 32 条落在没列出来的桶里**（如实回报）——**三个业务服务名已脱敏为 `app-svc-N`**（原名为内网服务标识，不入公共仓库；条数、桶数与各项结论一字未改） |
| `facets interval=10m`（近 1h） | 7 个时间点，1300~4300 条/10 分钟 |
| `filters {container.name}` | 命中 13404，.keyword 解析成功（调用方没写 `.keyword`） |
| 行的标签 | `container.name / host.name / log.file.path / stream / container.image.name / agent.name …`——agent 当初要的就是这个 |
| 级别 | `[DEBUG] …` 这类正文推断出 debug，并标 `levelInferred`（这台集群的 `log.level` 确实是空的） |

顺带一个**只有真机才能看到的观察**：`app-logs-*` 里混着 prometheus / grafana / filebeat 自己容器的日志——
所以「哪个服务在报错」这句话在数据层面本来就要求先分组再筛，光靠拉行是拉不出来的（正是第 2 条的分量所在）。

### 真机反馈第四批：来源的范围要看得见（索引表达式 + 探测条数）（2026-10-11）

第 3 条：索引表达式从**地址路径**悄悄推出来，配置里只写 `http://host:9200` 的一条来源其实是**全集群
通配**（那台机器上混着 grafana / prometheus / filebeat / easysearch 与 `.kibana_1` / `.infini_*`），
而 `loglens_sources` 只回 URL、probe 只看存活——agent 只能自己 curl 去问「这台 ES 里到底有什么」。

| 动作 | 落点 |
|---|---|
| target 加 **`index`**（只对 ES / OpenSearch；不许含空白 / 斜杠 / `?` / `#`），解析顺序：显式 index → 地址路径 → 默认 | `src/config.ts`（`INDEX_SHAPE`）、`elastic.ts` 的 `targetIndex` |
| 默认索引从 `*` 改成 **`*,-.*`**：点号索引是系统索引，不是日志（要查它得显式写 index） | `ES_DEFAULT_INDEX` |
| **回显范围**：适配器加可选 `scope(target)`，sources 行多一格 `scope`（ES 回解析后的索引表达式） | `types.ts` 的 `LogBackend.scope?`、`tools.ts` 的 `SourceRow.scope` |
| probe 顺带报 **「最近 15 分钟 N 条」**（`_count` + 时间范围；探不到就不写，别拿 0 冒充「没有数据」） | `BackendHealth.recent` + `ES_PROBE_WINDOW_MS` |
| 面板：ES / OpenSearch 行的地址格里**竖着多一行索引表达式**输入（横着再加一列会把行挤到看不清） | `client-src/index.js` 的 `.ll_stack`；`pure.js` 只在 es/os 的载荷里发 `index`（其余类型带上它宿主会 400） |

用例：`config.test.ts`（index 的取值与拒绝面）、`elastic.test.ts`（`targetIndex` 三条优先顺序 + 请求路径
变成 `/*,-.*/_pit`）、`tools.test.ts`（scope / recent 回显，且没有 scope 的适配器不许凭空造一个）、
`client-pure.test.ts`（index 只进 es/os 载荷）、`client-smoke`（索引输入框只出现在 ES 行、保存时进请求体）。

### 真机反馈第三批：字段清单要带上限与顺序（2026-10-11）

第 4 条：`loglens_fields` 打的是裸的 `/<index>/_field_caps?fields=*`——**没上限、没顺序、不看有没有数据**，
在一台全集群通配（索引表达式是 `*`）的来源上回了 45620 字节、还被截断落盘，agent 把它当成了全部字段。

| 动作 | 落点 |
|---|---|
| 契约改成 `{ fields, total, truncated }`（裸数组 → 带截断信号的形状） | `src/backends/types.ts` 的 `FieldsResult` / `FieldsOptions`；Loki 与 ES 两侧同形（Loki 的标签本来就短，truncated 恒 false） |
| 上限：默认 80、硬上限 200（工具面要更多会被夹并给 warning） | `execute.ts` 的 `FIELDS_DEFAULT_LIMIT` / `FIELDS_MAX_LIMIT`；ES 侧另有自己的默认值 |
| 顺序：**常用筛选项排前面**（container.name / pod / host.name / service.name / log.file.path / log.level …），其余按字母 | `elastic.ts` 的 `PREFERRED_FIELDS` + `sortFieldNames`；被标 `preferred: true` |
| 去掉 ES 内部字段（下划线开头：`_id` / `_index` 这类） | 同上，列之前过滤 |

> **2026-10-14 修订**：上面那张表里的「上限」一栏**已被推翻**——默认不再截断（见文末
> 「字段清单不再截断（对齐 Kibana 的长度处理）」）。当时那条反馈要的是**看得出被截断**，
> 「所以砍到 80」是被读歪了的一步；顺序、去内部字段、去 `.keyword` 子行这三条仍然作数。

**顺带修一句假话**：卡片的 `hint.notImplemented` 还写着「查询能力还没实现，这张卡片现在只管来源清单」——
面板里早就有查询区了（P6 第二刀），工具也早就有了。改成「下面可以直接问当前来源；字段清单与上下文在
agent 侧的两个工具里」。界面文案说的是**做不到什么**，说错了比不说更糟。

用例：`elastic.test.ts` 两条（优先键排序 + 被上限截断时 total/truncated 如实回报）、`loki.test.ts` 形状、
`tools.test.ts` 两条（搬运新形状 + 硬上限夹取与 limit 校验）。

### 真机反馈第二批：行的可观性（标签展平 + 级别）（2026-10-11）

agent 在真集群上给的批评里**代价最大**的一条：它拿到的 60 行输出里唯一的标签是 `stream=stdout`，
看不出是哪台机器、哪个容器——于是只能绕出插件去 curl，而一绕出去，出站围栏 / 认证 / 归一化全没了。

| # | 问题 | 落点 |
|---|---|---|
| 1 | `lineFromHit` 只把**标量**收进 labels，filebeat 的 container / host / agent / log 全是嵌套对象，整棵被跳过 | `src/line.ts` 的 `flattenLabels`：点分路径展平（下钻 3 层、标量数组拼逗号、值超 160 字符截断）+ **优先键**先占名额（container.name / pod / host.name / service.name / log.file.path / stream …；采集器 `agent.name` 刻意排后面——它整个集群都一样，是背景不是身份） |
| 7 | `level` 是空字段（这套集群 `log.level` 是空桶，级别长在正文里），"只看错误"只能退化成 `message:ERROR`，还会捞进 logback 的 `Propagating ERROR level on Logger[...]` 噪声 | 级别**归一化**成六档（trace/debug/info/warn/error/fatal，含 SEVERE / CRITICAL / dbg 这类别名）+ 只在「级别该出现的位置」**推断**（行首断语、`level=ERROR`、logback 时间戳后那一位），推断来的标 `levelInferred: true`；`loglens_search` 加 `level` 参数（**及以上**语义，warn 得 warn+error+fatal） |

**level 过滤在本页做，并把范围写在明面上**：级别字段在各家索引里名字与存在性都不一样，推给后端
就会变成「有时候筛了、有时候静默没筛」。所以 execute 层如实做页内筛 + 一条 warning
（「N / M 行被筛掉，counts 与 truncation 仍是未筛的整页」）；行上没有级别**不算命中**——
不能把「不知道」当成「是 error」。要按级别看全量是聚合的活（下一批的 `loglens_facets`）。

用例：`test/line.test.ts` 14 条（照 filebeat 真实文档形状写夹具：容器名 / 主机名 / 日志路径 / 深度上限 /
值截断 / 优先键占位；五种真机写法各一条推断 + **噪声反例**）、`elastic.test.ts` 两条（嵌套文档进 labels、
文档有 log.level 时不标推断）、`tools.test.ts` 一条端到端（及以上语义 / 页内筛 warning / 非法级别报错 /
不筛时没有这条噪音）。

### 真机反馈第一批：时间入参与窗口兜底（2026-10-11）

agent 在真集群上用完插件后给了 7 条批评，这是其中最便宜、收益最直接的两条（同一处：`src/query.ts`）。

| # | 问题 | 落点 |
|---|---|---|
| 6 | 只收 epoch 毫秒，模型**手算绝对毫秒会算错**（用户那次差了 4 个月，白跑一轮） | `asTime()`：epoch 毫秒整数 / ISO 8601（带时区按它自己说的算，不带时区按**本机**时区）/ 相对时间 `-30m` `-2h` `-1d` `now` / 纯数字字符串。工具 schema 用 `oneOf` 同时收 number 与 string（宿主 schema 方言支持 `oneOf`） |
| 5 | **文档与实现打架**：`requiresTimeRange: true` 让「只给 to」报「缺 from」，而工具文案写着「to 缺省取当前时刻」——照 schema 办事的 agent 被自己的插件打回 | 只给一端一律**兜底 + warning**（`from` 缺省 = to 前面 15 分钟，`FALLBACK_WINDOW_MS`）；两端都不给才报错，且文案点明「至少给 to」。兜底窗口随 `window` 一起回显，warning 里写明是兜底来的——语义没被悄悄改 |

**兜底窗口取 15 分钟而不是 24 小时**：最常见的问法是「给我看最新的日志」，而 24 小时的尾部在
真集群上动辄几万行；宽窗该由调用方自己说明。这条判据也写进了 `query.test.ts`（兜底恒为 15 分钟，
且**不越过来源自己的 maxWindowMs**——来源上限比 15 分钟还小时按来源的来）。

用例：`query.test.ts` 的时间窗一节重写（ISO / 本机时区 / 相对时间 / 秒的拦截 / 非法值文案列出三种写法 /
只给 to 不再被打回 / 相对时间照样受窗口上限约束），`tools.test.ts` 加一条端到端
（`-30m` 与 `now` 真的落到 window 上、只给 to 时 window.from = to − 15 分钟）。

### P4 尾（面板那一格）：来源行第 4 格「允许公网地址」+ 客户端渲染回归（2026-10-11）

> **⚠ 本节描述的那一格当天晚些时候已被整条推翻，现在不存在**（2026-10-12 加注）：
> `allowPublic` 字段、卡片上这一格开关与三组 i18n 键**全部拆掉了**（判据见下面的「公网档改判」一节）。
> 按 [纪律 3](../../docs/conventions.md#文档分档) 原文保留，但**读它时以「公网档改判」为准**——
> 界面与代码里现在搜不到 `allowPublic`，也没有 `check.allowPublic` 这句文案。
> 本节真机表里「用户的内网来源被公网档拦下」那一行，**正是促成改判的现场**。

出站围栏（上一节）落地时 `allowPublic` 只能从配置面写。这一刀把它做成**界面上的开关**，
并按本仓既有约定给这个包补上第一条**客户端渲染回归**：

| 落点 | 内容 |
|---|---|
| `client-src/pure.js` | 草稿加 `allowPublic`；`draftPayload` **每次都带上它**（true / false 都发）——宿主那边「缺省 = 保持原值」，不发就等于关不掉；docker 分支刻意不带（采集来源没有出站，宿主会 400） |
| `client-src/index.js` | 来源行加第 4 格（固定 112px，**每行都占位**：docker 行放空 span，否则 auto 列各算各的宽度、几行对不齐）；插件启用开关之外的第二个 `.ll_switch` |
| `scripts/client-smoke.mjs` | 无浏览器的装载 + 渲染回归：最小 DOM / React（**会真重渲染**的 hook 运行时）/ fetch 桩，4 条用例（产物形状 · 四个槽 · 来源行第 4 格与 docker 占位 · 勾选→保存→请求体带 `allowPublic`，关掉时带 `false`） |

**两个坑，都记在这里免得下一个人再踩**：

1. **渲染桩里的 `useCallback` 必须按依赖记忆**。第一版桩让 `useCallback` 每轮返回新函数，
   于是卡片那个 `useEffect(..., [open, pageView, load])` 每轮都重跑 → 重新拉 `/config` →
   把界面上**还没保存的编辑**冲掉。桩报出来的「保存没带上 allowPublic」是**桩在撒谎**，
   不是产品的 bug（真实 React 里 `applyConfig` / `load` 的身份是稳的）。修正桩之后 4/4 通过。
2. **假宿主必须让 POST 真的改状态**（`applyAction` 那一小段）：保存后卡片会用响应里的 config
   刷新草稿，桩若永远回同一份旧配置，勾选框会在保存后弹回未勾——同样是桩的错，不是产品的错。

**这一刀也把「说不清的那一格」补上了**：围栏报错点名的「允许公网地址」现在界面上真的有这个字样
（`check.allowPublic`），用户按报错去找就能找到。


**真机复核（2026-10-11，只读打用户那台 ES）**——围栏在**真实代码路径**上四面都验了：

| 输入 | 结果 |
|---|---|
| 用户的内网 ES 来源（`172.172/16` 段上的一台） | **被公网档拦下**：它的地址不在 RFC 1918（`172.16/12` = 172.16~172.31）里。具体主机号不入库（本仓有 no-public-ip 闸门，且那是真实内网地址） |
| `169.254.169.254` 来源 | `blocked_address`，文案点出「云元数据」 |
| 文档段公网来源（`198.51.100.7`） | `public_address` |
| 同一公网来源 + `allowPublic` | 围栏放行（往后才轮到网络本身失败） |

**第一行是这次最有价值的发现**：用户的内网日志服务器装在**公网段**上（内网不 NAT 的常见做法），
所以「公网默认拒」会实打实地挡下他的唯一可用来源——**这条开关不是纸面设计**。因此：

- 围栏文案同时给出两种解释（托管服务 / 内网用非 RFC 1918 网段），并点名去勾那张卡片里的
  「允许公网地址」；夹具用 RFC 5737 文档段钉住这段文案。
- 设置卡片把开关做成了**那一行的第 4 格**（按来源，不是按插件），面板与 agent 走同一份判据。
- 若维护者更愿意「公网默认放行、只拦链路本地 / 元数据」，改的是 `assertReachable` 里那一处判据——
  **本条仍属待拍板第 5 项**，代码按设计 §4.1 的现行口径落地。

### 能力自述的对账：Loki 的 `follow` 说了没做（2026-10-12）

**现场**：`loglens_sources` 会把 `capabilities()` **原样回给 agent**，而 Loki 的 `follow` 写的是 `true`——
同一个文件里 `aggregations` 早在 2026-10-11 就因「声明成 true 等于撒谎，调用方会照着文案去试一个
永远报错的入口」改成了 `false`，**`follow` 漏了**。同一条判据只改了一个，漏掉的那个照样会被 agent 看到
（而且它比 `aggregations` 更直接：那一位是「能不能持续跟随」，agent 会照着去挂一个不存在的入口）。

**改了什么**

| 落点 | 内容 |
|---|---|
| [src/backends/loki.ts](../loglens/src/backends/loki.ts) | `follow: true` → **`false`**，并写上与 `aggregations` 同款的判据注释（`stream()` 仍未实现——Loki 的 tail 是 WebSocket，属 P6，见 [design.md §6](./docs/design.md)） |
| [src/backends/registry.ts](../loglens/src/backends/registry.ts) | 新增 `ALL_BACKENDS` 与 `capabilityGaps()`：对账「自述为真」↔「方法在场」（`follow` ⇒ `stream()`、`aggregations` ⇒ `facets()`） |
| [test/capabilities.test.ts](../loglens/test/capabilities.test.ts) | **10 条**：注册表逐个过对账；`ALL_BACKENDS` ↔ `backendFor` 两侧对账（新适配器漏登记会被抓到）；4 条反例 + 2 条对照组 |
| client-src/index.js | 清掉 **2 条死 i18n 键**（`field.index` / `placeholder.dockerTarget`，zh + en 共 4 行） |
| 本文件 | 本节；另给「P4 尾（面板那一格）」加注——那一格（`allowPublic`）当天晚些时候已整条拆掉，原文的现在时说法会误导读者 |

**判据的写法**（本节的重点）：对账函数判的是**「声明与实现一不一致」**，不是「有没有方法」——
所以「声明 `false` 且方法确实没有」**不报**（对照组 1），「方法在场但没声明」也**不报**（对照组 2，
实现多于自述不是谎话）。判成后者的话，`follow: false` 这个**正确**的写法反而会被守卫打红。

**反向验证**：把 `follow` 改回 `true` 再跑 `test/capabilities.test.ts` → **3 条红**，报的正是
`declared: 'follow' / missing: 'stream()'`（`每个适配器都过对账` / 正面断言 / 钉住本条的那一条）。
改回来即绿——守卫不是装饰。

**门槛与证据（实跑）**

| 闸 | 结果 |
|---|---|
| `test/capabilities.test.ts` | **10 条**全绿；反向验证见上 |
| `check-i18n` | 本包 **71 条键** zh/en 一致、用法命中、**告警 0 条**（改前 73 条 + 2 条「没被静态扫到」——留着会让这条告警变噪音，下次真有死键就看不见了） |
| 全仓门禁 | `pnpm typecheck && pnpm build && pnpm test && pnpm aggregate` 全绿：**168 文件 / 2809 用例** |
| 守卫 | check-doc-links（587 条链接 / 48 条锚点）、docs-index、no-public-ip、defects-table（33 条）全绿 |

**刻意不做的**：**不实现 `stream()`**。Loki 的 tail 是 **WebSocket**（要 `ws` 依赖），而它现在
**没有任何消费者**（没有工具 / 路由用它）——按「不给不存在的入口」这同一条判据，先诚实地声明 `false`；
P6 真要做 tail 时把 `stream()` 与消费者一起落地，再把这一位改回来。**声明与实现对上了**才是这一节的交付物，
不是 tail 本身。

### P6 剩下的那格：时间分布（直方图）（2026-10-12 落地）

**这一格此前是一半的**：后端能力（`date_histogram` → `FacetsResult.overTime`）与 agent 工具都有了
（真机反馈第五批，`loglens_facets` 把它铺成一行行文本），但**面板里一点都没有**——`client-src/index.js`
的旧文件头还写着「直方图还没有」（那一句也是过期的，见下）。

**判据（本格的核心，写在 `client-src/pure.js` 的函数头里）**：分布**只能来自后端的按时间分桶**，
**不许数页面上这一页的行**。那一页是 `limit` 截断过的，数它量到的是「这一页的分布」——`limit=100`
打在「最近 1 小时」上会画出一条「后 10 分钟占 100%」的假曲线。同一条判据的两个推论：

- **相邻桶之间的空档必须补 0**：适配器传 `min_doc_count: 1`（没数据的桶不在响应里，这是对的），
  照数组直接画就会把空档压掉、两根柱子挨在一起——图上看起来「一直在刷日志」，而事实是那段时间一条都没有。
  末尾那段安静同理要留着。
- **合计只在没截断时才敢写**：图被上限兜底截断时，合计是**少算的**，那就一个字都不写。

**改了什么**

| 落点 | 内容 |
|---|---|
| [src/index.ts](../loglens/src/index.ts) | `/query` 响应多一位 `capabilities`（`capabilitiesOf`）：面板据此决定画不画分布。**`RouteState` 多一个 `backendFor`**，与执行层用的是**同一个函数**——能力自述必须描述**真正跑的那个后端** |
| [client-src/pure.js](../loglens/client-src/pure.js) | `histogramInterval`（按窗口挑档，柱数 ≤ 60）、`histogramPayload`（**窗口取响应回显的那一份**，不完整就回 `null` 让界面不发请求）、`histogramBars`（铺满窗口 / 空档补 0 / 峰值归一化 / 上限兜底带 `truncated`） |
| [client-src/index.js](../loglens/client-src/index.js) | 结果区上方的分布块（柱高是内联 style，外观走类）；`loadHistogram` 三类收尾：**不支持就不发请求**、**拿不到只说那句话**（不动结果列表）、**翻页不重拉**（窗口与查询串没变） |
| 用例 | `client-pure.test.ts` **+19 条**（间隔 `{ms,key}` 三元形态、柱数上限、**空档补 0 的反例**、末尾安静、同一 ts 相加、桶边界对齐、坏输入不抛、上限截断、载荷取回显窗口、**能力自述的三态读法**）；`query-route.test.ts` **+4 条**（能力随 `/query` 下发、**换桩就跟着变**（不是面板猜的）、真 Loki 聚合为假且只打 `query_range`、只有 `/query` 带这一位）；`capabilities.test.ts` +1 条（ES / OS 聚合为真、Loki 为假） |
| `scripts/client-smoke.mjs` | **+4 条渲染回归**（柱子数 = 窗口/间隔且空档是空的、Loki 不画也不发请求、拉不到时结果列表还在、**宿主没给 capabilities 时什么都不说**）；桩加了「按 path 挂响应」的能力（含演后端报错那一侧） |

**反向验证**：把 `histogramBars` 的补 0 拿掉（`if (count === 0) continue`）→ 纯逻辑**红 3 条**、
渲染回归**红 1 条**；改回来即绿。**两处守卫都会咬人**，不是装饰。

**同轮自伤（记一笔，按先例不占编号）**：第一版把「宿主**没给** `capabilities`」与「宿主说**不支持**」
走同一支，于是旧版宿主（或不是 `/query` 回来的响应）会让界面写一句「当前来源不支持聚合」——
**替对方说一句我们没依据的话**。这正是本仓已有的判据（`dockerFlagOf` 的「不知道 ≠ 没装」）被我
在同一天、同一张卡片上违反了一次。修法是把它变成**三态**（`supportsAggregation` 返回
`true` / `false` / `undefined`），并且**有对象但缺这一位也算不知道**——「缺字段」与「明确说我不能」
是两句话，只有后者才配上界面。反例已进用例（`{}` / `{ capabilities: {} }` / 字符串 `'true'` 都不许落成
`false`）与渲染回归（没给 capabilities 时什么都不说、也不去试那一枪）。

**顺手修掉的三处过期头注释**（同一类问题：注释说的与代码做的相反）

- `client-src/index.js`：原写「当前能力只有来源清单与开关……直方图还没有」——实际早有查询区（P6 第二刀）；
- `src/index.ts`：原写「落地范围只有来源清单与开关，查询能力还没有」——同上；
- `src/index.ts` 的 `runFacets`：原写「面板还没画它，路由先留着」——这一刀补上了。

**门槛与证据（实跑）**

| 闸 | 结果 |
|---|---|
| 本包单测 | **293 条**（15 个文件） |
| `client-smoke` | **8/8**（新增 4 条全过） |
| `client-lint` | 通过：样式变量 71 处、自定义属性 72 处、**排版 17 处**字号均配对行高与官方字重、中性边框 7 处发丝线、圆角 8 处 token |
| `check-i18n` | 本包 **80 条键** zh/en 一致、告警 0 条（新增 9 条键全落在已登记的 `panel.` / `meta.` / `hint.` / `error.` 域里，**没有新造域**） |
| 全仓门禁 | `pnpm typecheck && pnpm build && pnpm test && pnpm aggregate` 全绿（数字见提交） |

**刻意不做的**

- **不做「按字段分组」的界面**（terms 那张榜）：`loglens_facets` 已经能按字段分组，但面板这一格只回答
  「量随时间怎么变」。要做榜是另一件事，且它需要一套自己的排序 / 截断文案——不是这一格的顺带。
  > **2026-10-13 追记**：这一格后来**补上了**（见文末「P6 补的那格」）。上一句的判断成立——它确实
  > 不是直方图的顺带，所以是单独一轮；原文按纪律 3 保留，这里只加指路。
- **不给 Loki 造一个「假分布」**：它 `aggregations: false`，面板就**不画**、界面上说清为什么，而不是
  拉一页行到本地数出来充数（正是上面那条判据要挡的事）。Loki 接上 LogQL 指标查询那天，
  `capabilities().aggregations` 翻真，分布图会自动出现——**那是一次看得见的改动**。

### P6 补的那格：面板的「按字段分组」榜（terms）（2026-10-13 落地）

**这一格是上一节「刻意不做」里点名剩下的那件**（「要做榜是另一件事，且它需要一套自己的排序 / 截断文案」）。
补它是因为它是 agent 那句话里真正的问题——「**哪个服务在报错**」——的直接答案：光拉一页行答不出来，
得先分组再排（真机反馈第 2 条就是这么说的）。`loglens_facets` 早在 2026-10-11 就有 `by`，
面板一直没有它。

#### 判据（写进 [client-src/pure.js](../loglens/client-src/pure.js) 的函数头）

1. **榜只能来自后端的 terms 聚合**，不许数这一页的行——与直方图同一条。那一页被 `limit` 截断过：
   `limit=100` 打在「最近 1 小时」上，数出来的是「这一页的排名」，一个只出现 3 次的容器会被排到第一。
2. **保持后端给的顺序**（契约就是按 `count` 降序，见 [src/backends/types.ts](../loglens/src/backends/types.ts)）：
   前端再排一次，等于把「后端顺序不对」这回事盖掉——榜的顺序就是结论本身。
3. **不写合计**：列出来的桶加起来**不是**命中总数（没列出来的在 `otherCount` 里）。写一个「部分之和」
   会被读成「这个窗口一共这么多」。同理「计数是近似值」（`countErrorUpperBound`）**照抄宿主的警告原话**
   ——agent 工具看得到的东西，面板也得看得到。
4. 两条小的：**空值键**显示成「（空值）」而不是一条没有名字的横条（文档缺这个字段时 ES 给的 key 是
   空串）；**分组字段没有默认值**——各家索引的字段名不一样，猜一个 `container.name` 等于替用户
   伪造一个范围。

**发不发的四条**（与直方图**共用**同一份判据，不另写一份）：

| 情形 | 行为 |
|---|---|
| 来源**明确说**不支持聚合（Loki） | 不发请求、不画；与直方图**共用同一句**「当前来源不支持聚合……没有时间分布与分组榜」——同一件事说两遍是噪音 |
| 宿主**没给**能力自述（旧版宿主） | 什么都不说、也不去试那一枪（`supportsAggregation` 的三态读法，见直方图那节） |
| **没填**分组字段 | 不发请求；点「分组」给一句「先填要分组的字段」，不是静默无操作 |
| **翻下一页** | 不重拉（窗口与查询串都没变，榜也不会变） |

**字段名由回显决定**：榜标题显示的是 `groups.by`（这一次**真正用的**字段），不是输入框里此刻的字——
用户改了输入框还没点「分组」时，榜的标题不能跟着改，那会变成「说的和画的不一样」。「有哪些字段」
只用来给输入框做候选（`datalist`），**不传 `limit`**（用宿主自己的默认值与它那句截断警告，
不在浏览器侧抄一份会漂的默认值）。

#### 改了什么

| 落点 | 内容 |
|---|---|
| 宿主侧 | **一个字没改**：`/facets` 路由、`runFacets`、`terms` / `otherCount` / `countErrorUpperBound` 都是 2026-10-11 那批就有的 |
| [client-src/pure.js](../loglens/client-src/pure.js) | 抽出共用信封 `facetsEnvelope`（直方图与榜共用「窗口取回显那一份」的判据——原先它长在 `histogramPayload` 里）；新增 `groupProblem` / `groupPayload` / `groupBars`（不排序、不合计、标空值键、兜底上限 50 根） |
| [client-src/index.js](../loglens/client-src/index.js) | 查询区的「分组」行（字段输入 + `datalist` 候选 + 「有哪些字段」/「分组」）、结果区下方的榜（横向条 + 宿主警告照抄）、`loadGroups` / `loadFields` / `runGroups`、8 个类与 16 条 i18n 键；`datalist` 的 id **每张卡片实例一个**（写死时后一张卡的候选会指向先一张的——同一页挂两张卡不是假想） |
| 顺手改对的两句文案 | `card.desc` 还写着「当前只有来源清单与开关」（查询区早就在了）；`hint.notImplemented` 说「字段清单面板暂不画」——现在面板有它的一半（只做候选） |
| 用例 | `client-pure.test.ts` **+11 条**（载荷三种 null / 不写合计的形状断言 / 空值键 / 畸形桶 / 空榜 / 兜底上限 / 字段名判据）；`client-smoke.mjs` **+5 条**（回显窗口与条宽 / Loki 不发不画且按钮是灰的 / 拉不到只说那一句 / 没填字段不发 / 「有哪些字段」的候选与不传 limit） |

#### 反向验证（四条都实跑，守卫都会咬人）

| 拆掉哪一条 | 谁咬 |
|---|---|
| `groupBars` 多返回一个 `total` | pure「**不写合计**」红（形状断言）+「空榜」红 |
| `groupPayload` 的空字段守卫 | pure「字段为空就回 null」红 |
| `loadGroups` 的「没填字段就不发」 | smoke「没填字段就不发」红（抓到的正是 `true !== false`：请求发出去了） |
| `loadGroups` 的能力闸（`!== true`） | smoke 的 Loki 那条红（断言不发请求） |

#### 门槛与证据（实跑）

| 闸 | 结果 |
|---|---|
| 本包单测 | **304 条**（15 个文件）——原 293 + 新 11 |
| `client-smoke` | **13/13**（新增 5 条全过） |
| `client-lint` | 通过：样式变量 83 处、自定义属性 84 处、排版 19 处字号均配对行高与官方字重、圆角 11 处 token |
| `check-i18n` | 本包 **96 条键**（原 80）zh/en 一致、用法命中、告警 0 条 |
| 全仓门禁 | `pnpm typecheck && pnpm build && pnpm test && pnpm aggregate` 全绿：**170 文件 / 2864 用例** |

**证据的范围**：第一轮只有**纯逻辑用例 + 无浏览器渲染回归**（与上一格直方图同一尺度），断言的是渲染树、
请求体与能力闸；**当晚补了一次真机验收**（真宿主 + 真 ES，见下 § 真机验收：真宿主 + 真 ES 的 terms 榜），
结论 PASS，没验到的也逐条列在那一节。第一轮当时被沙箱挡住的那一步（起 test profile 的宿主会写
`$DSH_HOME/profiles/*`，在 workspace 之外，`workspace-write` 会拒）在补验收时**逐条授权**后走通了：
隔离靠的是**复制一份 profile**（真 `DSH_HOME`，设置与凭据都在），不是隔离 home——方案见
[真机测试 runbook](../../docs/agent-real-test.md)。

#### 真机验收：真宿主 + 真 ES 的 terms 榜（2026-10-13）

**环境**（跑完即关）：复制 `~/.dsh/profiles/test-logs` → 临时 profile，`dsh --profile <临时名> --port 3199`，
真 Chrome（Playwright）点真界面。**源 profile 未动**（`test-logs/cordis.patch.yml` 的 mtime 仍是 10-11）；
验收产物（截图 / DOM 快照）**没进仓库**（含内网标识，已移出工作区）。

| 步骤 | 原始返回（**内网标识已脱敏**） | 判定 |
|---|---|---|
| 打开卡片 | `card.desc` = 「……来源清单、直连查询、时间分布与按字段分组。」 | **PASS**：这是**新版**文案（旧版写的是「当前只有来源清单与开关」）⇒ 页面确实加载了这次构建的 bundle |
| 选来源 →「查询」（近 1h / 100 行 / 查询串空） | `返回 100 行`、`命中 26087`、`已截断：达到条数上限` | **PASS** |
| 时间分布（同一次响应带 capabilities） | `每根柱子 1m`、`峰值 1214 条`、`共 26087 条`；**61 根柱子逐桶有数**（1h / 1m，首桶对齐到窗口起点那一分钟，末桶 18:10:00）——合计 26087 与上面 `命中 26087` 对得上 | **PASS**（上一格没被这一格弄坏） |
| 点「有哪些字段」 | `/fields` → 200；`fields` **80 个**、`total: 102`、`truncated: true`；界面照抄宿主的「只列了前 80 个（这个来源共有 102 个字段）…」 | **PASS**（候选拿到了；截断警告没吞） |
| 填 `container.name` → 点「分组」 | 请求体 `{"target":"<id>","q":"","from":…,"to":…,"by":"container.name"}`——**没有 `size`** | **PASS**：窗口是回显那一份、字段进了 `by`、面板没写死桶数 |
| 榜渲染 | 10 个桶，**顺序与后端一致**（`app-svc-1` 13442 / `app-svc-2` 11493 / `app-svc-3` 312 / prometheus 240 / …）；标题回显 `container.name`；宿主警告「还有 32 条落在没列出来的桶里…」 | **PASS**（`otherCount` 那条路真机上走通了） |
| 换 `log.level`（这台集群该字段整列是空的）再点「分组」 | 桶为空 → 界面写「这个窗口里没有可分组的数据」，**没有横条**、也没有静默无反应 | **PASS**（空榜如实说，不假装有数据） |

**没验到的（明写，不混进 PASS）**

- **空值键**（`（空值）` 那一支）：这台集群的字段要么有值、要么整列皆空（走了上面的空榜），没撞到
  「部分文档缺字段」的中间态——它只有用例与渲染回归覆盖。
- **Loki 的能力闸**：临时 profile 里没有 Loki 来源，真机没跑（用例与冒烟覆盖）。
- **桶计数的近似性警告**（`countErrorUpperBound > 0`）：这台集群没报（报的是 `otherCount`），
  界面上那条「计数是近似值」文案真机未验。

**真机顺带抓到的一条**（同一次验收的副产品，已修）：宿主启动日志写着
`[dsh-loglens] mounted（来源 2 / 32，查询能力尚未实现）`——**这句是过期的**（查询区、四条路由与
agent 工具早就在了）。它与上一格修掉的三处头注释属同一类「说得比做的少」，宿主日志又是排查时
第一眼看的东西，所以就地改对（[src/index.ts](../loglens/src/index.ts) 的 announce）：

    [dsh-loglens] mounted（来源 N / 32，路由 config / query / fields / facets，agent 工具 loglens_*）

这条**不占 `Dxx` 编号**（先例同上：文案与实现的对账记在 ROADMAP，不进缺陷台账）。

#### 刻意不做的

- **不做「字段表格」**：`/fields` 只用来给分组字段做候选。整份字段清单与逐行上下文仍在 agent 的
  `loglens_fields` / `loglens_context` 里——面板不做第二份会漂的字段视图。
- **不传 `size`**：桶数上限由后端默认值与宿主硬上限管，面板不写死「前十」（写了就成了第二份会漂的默认值）。
- **不做「点桶筛选」**（点一下把这个值加进 filters 再查一次）：那是另一个交互，要动查询串 / 过滤器状态，
  不是这一格的顺带。
  > **2026-10-13 追记：这一格已经单独做了**——见文末「P6 第三格：面板点桶下钻（结构化筛选）」。
  > 当时这句判断的两半都成立：它确实**不是**榜的顺带（要新开一份筛选状态、还要把行 / 分布 / 榜三处
  > 同时收窄），也确实是接着该做的那一件（榜把「哪个服务在报错」答出来了，答完没法往下走）。


### P6 第三格：面板点桶下钻（结构化筛选）（2026-10-13 落地）

**这一格是上一格「刻意不做」里点名剩下的那件**（「不做「点桶筛选」……那是另一个交互」）。补它是因为
上一格把「**哪个服务在报错**」答出来了，答完却没法接着往下走：看到第一个桶是某个服务，下一步
必然是「**看它的日志**」，而面板只能让人把这句条件**手抄进查询串**——各家后端的查询语法还不一样。

宿主的通道 2026-10-11 就在了：`/query` 一直收 `filters`（[src/query.ts](../loglens/src/query.ts) 的
`asFilters`），ES / OpenSearch 适配器也一直实现了它（`term` / `.keyword` / `match_phrase` 的分流，
[src/backends/elastic.ts](../loglens/src/backends/elastic.ts) 的 `filterClauses`）——**面板是那条链上
唯一缺的一环**，所以这一格是「接上去」，不是「造机制」。

#### 判据（写进 [client-src/pure.js](../loglens/client-src/pure.js) 的函数头）

1. **下钻必须真的重查一次**：不许「拿已经到手的这一页在本地过一遍」——那一页被 `limit` 截断过，
   数它只会得到一个假的分布与假的排名（与直方图 / 榜同一条判据）。
2. **过滤一处生效、三处一致**：行、时间分布、分组榜读的是**同一份草稿里的那个筛选**。否则下钻之后
   分布画在整个窗口上、而行是筛过的——同一屏三个数字说的不是一件事（直方图当年用「回显窗口」也是这条）。
3. **筛选状态是有序数组，不是对象**：线上 `filters` 是 `Record<字段, 值>`，**一个字段只有一个值**；
   界面上存数组只为芯片顺序稳定，同一个字段**就地替换**（并存会静默盖掉一条，界面上却留着两枚芯片）。
4. **值不做 trim**：`log.level` 的值可能是 `"ERROR "`——键名里那个空格是内容的一部分，裁掉就
   **静默**筛不到东西（比报错更难查）。空值判定用 `trim()`，进载荷的是原值。
5. **空值那一桶不给下钻**：`filters` 只能表达「字段 = 某值」，表达不了「字段缺失」（榜上「（空值）」
   那一桶是后者）。给一个点得动、筛的却是别的东西的入口，比不给入口更坏——所以那一行是**一行死文字**，
   并把「为什么」挂在 `title` 上。
6. **「没变」时不重查**：已经在筛同一个「字段 = 值」时 `filterAdd` **原样返回入参**（同一个引用）；
   **再点一次就是取消**——同时把这一条高亮出来，让「这一屏是筛过的」看得见。
7. **没有筛选就不带 `filters` 键**（不是带一个空对象）：线上形状与加筛选之前**逐字节一致**。

**发不发的判据**：不新增闸。筛选只能从榜上来，而榜本身已经由能力自述（`supportsAggregation`）与
分组字段名把着门——Loki 根本到不了这里。但**见到了就要说**：芯片那一行写着「Loki 不支持结构化筛选
——用它时把条件写进查询串」。因为「换了来源、筛选还留着」是可能的（把它从 ES 换成 Loki），那时宿主会
原话报错，界面上得先有一句解释。

#### 改了什么

| 落点 | 内容 |
|---|---|
| 宿主侧 | **一个字没改**（`asFilters` / `filterClauses` 都是 10-11 / 10-12 那两批就有的） |
| [client-src/pure.js](../loglens/client-src/pure.js) | 新增 `filterProblem` / `filterOf` / `filterHas` / `filterAdd` / `filterRemove` / `filtersOf`；`emptyQuery` 加 `filters: []`（筛选**放进草稿**：行与两份聚合才可能读同一份）；`queryPayload` 与共用的 `facetsEnvelope` 都带上它 |
| [client-src/index.js](../loglens/client-src/index.js) | 榜上每条变成 `<button>`（空值那条仍是 `div`）、`drillDown` / `removeFilter`、芯片行（`field.filters` + `×` + 那句说明）、`runQuery(append, override)` 的 override 线程（`loadHistogram` / `loadGroups` 跟着收 draft——它们默认读闭包里的**旧** `query`，这是本格最容易埋错的一处）；8 个类与 7 条 i18n 键 |
| 用例 | [client-pure.test.ts](../loglens/test/client-pure.test.ts) **+7 条**；[client-smoke.mjs](../loglens/scripts/client-smoke.mjs) **+4 条** |

#### 反向验证（五条都实跑，守卫都会咬人）

| 拆掉哪一条 | 谁咬 |
|---|---|
| `queryPayload` 不再带 `filters` | pure 红 2 条（「值不做 trim」「有筛选才带 filters」） |
| 聚合信封不再带 `filters` | pure「聚合载荷也带筛选」红 + smoke「点桶下钻」红 |
| `filterAdd` 改成无脑追加（同字段并存） | pure 红 2 条（「就地替换」「原样返回同一个引用」） |
| 空值那一桶也变成可点的按钮 | smoke「空值那一桶不给点」红 |
| `runQuery` 不认 `override`（读闭包里的旧 draft） | smoke 红 3 条（下钻 / 取消 / ×——都是「请求里没有 filters」） |

> `drillDown` 里那道 `filterProblem` 兜底**没有用例看得见**（渲染那一侧已经把空值行做成死文字，
> 这条路从界面到不了）。留着它是为了「将来的改动不该能悄悄下发一条 `{字段: ""}`」——**它在已知
> 不可达的位置上，如实记在这里**，不当成有守卫的规矩。

#### 门槛与证据（实跑）

| 闸 | 结果 |
|---|---|
| 本包单测 | **311 条**（15 个文件）——原 304 + 新 7 |
| `client-smoke` | **17/17**（新增 4 条全过） |
| `client-lint` | 通过：样式变量 95 处、自定义属性 97 处、排版 22 处字号均配对行高与官方字重、圆角 14 处 token、中性边框 9 处 0.5px 发丝线 |
| `check-i18n` | 本包 **103 条键**（原 96）zh/en 一致、用法命中（剩余中文字面量仍是 2 条，与上一格同一条既有噪音） |
| 全仓门禁 | `pnpm typecheck && pnpm build && pnpm test && pnpm aggregate` 全绿：**170 文件 / 2871 用例** |

#### 真机验收：真宿主 + 真 ES 上点一次榜（2026-10-13）

**怎么跑的**：把 `~/.dsh/profiles/test-logs` 复制成一份临时 profile（**真 `DSH_HOME`**——设置与凭据都在，
不隔离 home），`dsh --profile <临时名> --port 3199` 起真宿主，真 Chrome（Playwright）点真界面；
收尾关宿主、关页面，临时的 `loglens-drill-20261013` **删掉**（删之前先问过维护者；临时名带日期、
可识别，是本仓真机测试的老规矩）。**源 profile 一行未动**：`cordis.patch.yml` 的 sha256 与 mtime（18:21:39）
跑前跑后逐字一致。产物（截图 / DOM 快照 / 网络记录）含内网标识，**移出仓库**到 `/tmp/loglens-drill-20261013/`。
下面把内网标识脱敏（服务名写成 `app-svc-*`，主机与索引不写）。

| 步骤 | 原始返回（脱敏） | 判定 |
|---|---|---|
| 起宿主 | `[dsh-loglens] mounted（来源 2 / 32，路由 config / query / fields / facets，agent 工具 loglens_*）` | **PASS**（上一格修的那行日志，在真宿主上就是这个形状） |
| 选来源 → 查询（近 1h / 100 行 / 查询串空） | `返回 100 行` · `命中 30103` · `已截断：达到条数上限` | **PASS** |
| 时间分布（同一次响应带 capabilities） | `每根柱子 1m` · `峰值 1366 条` · `共 30103 条` | **PASS** |
| 点「有哪些字段」 | `只列了前 80 个（这个来源共有 102 个字段）：…` | **PASS** |
| 填 `container.name` →「分组」 | 10 个桶；**DOM 实测 `.ll_groupRow` 10 个、`tagName === 'BUTTON'` 10 个**（这一格之前它们是 `div`）；宿主警告「还有 11 条落在没列出来的桶里：把 size 调大（上限 100）或收窄时间窗 / 加 filters」 | **PASS**（榜上每一条真的成了下钻入口） |
| **点第二个桶（`app-svc-2`，13442 条）** | 请求体 `{"target":"<id>","q":"","from":…,"to":…,"limit":100,"filters":{"container.name":"app-svc-2"}}` | **PASS** |
| 同一屏的两份聚合 | 分布 `{…,"filters":{"container.name":"app-svc-2"},"interval":"1m"}`、榜 `{…,"filters":{…},"by":"container.name"}`（**都不带 `size`**） | **PASS**（聚合与新行是**同一个子集**） |
| 下钻之后 | `返回 100 行` · `命中 29945`（原 30103）；分布 `峰值 239 条 / 共 13407 条`；榜收窄到 1 个桶 `13407 条`——**与分布合计逐字相同**；芯片行 `筛选 container.name = app-svc-2 ×`；`.ll_groupRowActive` 命中那一条 | **PASS** |
| **再点同一条（取消）** | 请求体回到 `{"target":"<id>","q":"","from":…,"to":…,"limit":100}`——**没有 `filters` 这个键**；芯片行消失、`.ll_groupRowActive` 0 个、榜回到 10 条 | **PASS** |
| 换一个**整列皆空**的字段（`log.level`） | `这个窗口里没有可分组的数据`（ES 对这种字段一个桶都不返回） | **PASS**（不是本格的功能，顺带确认没被本格弄坏） |
| 换一个 **text 且无 `.keyword`** 的字段（`event.dataset`） | 宿主 400 原话：`[elasticsearch] 字段 event.dataset 是 text 且没有 .keyword 子字段：terms 聚合没法按它分组（换一个字段，或给索引加 keyword 子字段；也可以先用 filters 加 match_phrase 近似筛）`；界面照抄；**结果列表 100 行一条不少** | **PASS**（「聚合失败不带走结果列表」在真机上确认） |

**关于两个数字**（免得被读成矛盾）：下钻是**另一次查询**，窗口按 `Date.now()` 重新算（比上一次晚约 50 秒），
所以「13442（上一次窗口里的桶计数）」与「13407（这一次窗口里的分布合计）」不是同一次测量的两个值；
本格的判据是**同一屏内**分布合计与桶计数逐字相同（实测相同）。

**没验到的（不混进 PASS）**：
- **空值那一桶 `（空值）` 的行**：这台集群没撞到「部分文档缺该字段」的中间态——整列皆空走的是「一个桶都没有」
  （见上表），而 `container.name` 的 10 个桶全是有名字的（没列出来的 11 条在宿主 warning 里）。
  所以**「空值那一行是 `div`、不给点」这一支仍只有 smoke 用例覆盖**（它的守卫做过反向验证：改成可点按钮 → 用例红）。
- 空值行那句 `title` 与它的样式（同上，没造出数据）。
- 有筛选时的 `countErrorUpperBound`（近似计数）警告：这台集群报的是 `otherCount`。
- 两次运行之间的**分桶档位**都没跨档（都是 1m），所以「窗口变了档位跟着变」这一条没在真机上复验。

#### 顺带修的一处：刚进卡片时「来源」下拉在说假话（loglens D04，2026-10-13）

> 立了号：`D04` 记在 [DEFECTS.md](./DEFECTS.md)（索引表加一行 + 代码注释里落编号，按
> [conventions § 编号规范](../../docs/conventions.md#编号规范) 硬规矩 7）；下面这段是这一格的落地记录，
> 逐条的现场 / 根因 / 修法与反向验证同时在修复提交的 message 里。

**怎么发现的**：上面那次真机验收之后，维护者打开卡片贴了一张图：查询区的「来源」下拉写着
「161（Docker）」，可下面画的是**普通查询行**（Docker 来源该画容器日志区）、分组那两个按钮是灰的、
点「查询」只会回一句「先选一个来源」。

**根因（一处，症状三处）**：`<select value={query.target}>`，而 `query.target` 在刚进卡片时是空串——
**没有一个 value 为空串的选项时，浏览器会回落显示第一项**。于是下拉「说」选了第一项（Docker），
面板其余部分却全按「没选来源」走（`isDocker` 为假、`selectedDraft === undefined`、分组按钮灰、
查询走 `needTarget`）。这正是本仓那条老判据的违例：**说的和画的不一样**。

**修法**：
- 下拉的 value 改成**回落之后的那一项**（`chosenTarget`，与 `selectedDraft` / `queryProblem` /
  `queryPayload` 同一份判据），并加一个 value 为空串的**占位项**（「（先选一个来源）」，不可选）；
- 顺带兜住同源的另一个边：**选中的来源被删掉之后**，`query.target` 还留着那个不存在的 id——
  这时下拉与请求**一起回落**（`runQuery` 里改用回落后的 `effective` 草稿），否则会出现「下拉写着没选、
  请求却打一个已经不存在的 id」（真打得出去，宿主会回「找不到来源」）。

**守卫**（三条 smoke，都做过反向验证）：

| 用例 | 拆掉什么会咬 |
|---|---|
| 刚进卡片：下拉 value 为空、第一项是占位且不可选、分组按钮是灰的、点查询**不发请求**且回「先选一个来源」 | 拆掉占位项 → 红 1 条 |
| 只有一个来源：下拉就显示它，且请求里的 `target` 与它逐字相同 | 下拉 value 退回 `query.target` → 红 2 条（带上一条） |
| 选中的来源被删掉：下拉回占位、查询不发、回「先选一个来源」 | 同上；`runQuery` 不认回落后的来源 → 红 1 条 |

同一类判据本包早有先例：`dockerTargetChoices` 遇到「当前值不在清单里」也是**显式给出来**
（标成「（不在 Docker 面板的目标里）」），而不是让那一格静默变成别的东西。这一格的修法不同
（这里该显示的恰恰是「还没选」），出发点一样：**显示的那一项必须与真正用的那一项是同一个判断**。

#### 顺带改的一处：字段候选换成自画的浮层 + 箭头换成官方那颗 chevron（2026-10-13）

**怎么发现的**：维护者贴了候选浮层的图，两句话——「这个样式优化一下」「图标要和官方的一致」。

**为什么必须自画**：`<input list>` + `<datalist>` 那个浮层是**浏览器画的**，CSS 一点都改不动
（字体、行高、圆角、投影、滚动条全是平台的）。一张卡片里和宿主自己的下拉并排，一眼看出是两个东西。

**官方配方从哪来（可复核）**：读**宿主自己的构建产物**，不靠猜——
`…/@deepseek-ai/dsh-web-frontend/dist/assets/index-*.css` 里的菜单模块（`._list_4ub78_7` / `._item_4ub78_90`）：

| 件 | 官方取值（逐条抄进本卡片） |
|---|---|
| 浮层 | `padding:4px` · `border:0` · `box-shadow:var(--dsw-elevation-prominent)` · `--dsw-elevation-stroke-color:var(--dsw-alias-border-l1)`（那层描边在投影里，不是 `border`） · `top:calc(100% + 4px)` · `z-index:100` · `border-radius:var(--dsw-radius-lg)` |
| 行 | `min-height:34px` · `padding:6px 8px` · `border:none` · `border-radius:var(--dsw-radius-md)` · `background:transparent` · `font-size:13px/line-height:20px` · hover 与聚焦都用 `var(--dsw-alias-interactive-bg-hover)` |
| 箭头 | `IconChevronDownOutlineRegular`：`viewBox 0 0 16 16`、14×14、`stroke-width:1`、`fill="none"` + `stroke="currentColor"`、路径 `M4 6L7.29289 9.29289C7.68342 9.68342 8.31658 9.68342 8.70711 9.29289L12 6`（取自同目录的 `index-*.js`） |

> 官方那条 `list` 规则自己**没写背景**（它的祖先给）。这里按本卡片既有层级用 `--dsw-alias-bg-layer-2`
> ——这一处是**我们的选择**，不是抄来的，写在这里免得下一个人以为是逐字照抄。
>
> 本卡片原来那颗箭头是**另一套图标的填色 chevron**（`viewBox 0 0 14 14` + `fill="currentColor"`）。
> 现在**卡头折叠箭头与字段框箭头共用官方这一颗**（`CHEVRON_VIEWBOX` / `CHEVRON_STROKE` / `CHEVRON_PATH`）。

**换成自画的，就得把原生浮层自带的能力接回来**（不然是**悄悄降级**：鼠标能用、键盘只能一路 Tab）：

| 原来的（原生） | 现在的 |
|---|---|
| 输入时按字过滤候选 | `fieldChoices`（子串、大小写不敏感、**保持宿主顺序**、命中 0 个回空 → 界面**不画**空浮层） |
| 方向键在候选里走 | `pickMove`（**到头就停，不绕回**）+ 当前行高亮（`ll_pickItemActive`，与 hover 同一个底） |
| 回车选中 | 回车取**当前那一行**（没挪过就是第一条） |
| Esc 关掉 | Esc 收起 |
| 点一行即填 | 点一行即填（行自己 `preventDefault` 保住输入框焦点；失焦用 `relatedTarget` 判「还在不在这一格」） |

**顺带清掉一个隐患**：原生 `datalist` 要靠一个**全局唯一 id** 关联，同一页挂两张卡时得给每张卡
生成一个（原来的 `fieldsListSeq`）。自画的浮层没有 id，那一套连同注释一起去掉了。

**守卫**（`client-smoke` 这几条都会咬人，逐条做过反向验证）：

| 拆掉什么 | 谁红 |
|---|---|
| `fieldChoices` 不按输入值过滤 | pure「子串过滤」红 + smoke「筛候选」红 2 条 |
| 命中 0 个也画浮层（只看 `pickOpen`） | smoke「命中 0 个不该画一个空浮层」红 |
| 换回旧那颗填色 chevron | smoke「官方那颗 chevron」红 |
| 失焦就收（不看 `relatedTarget`） | smoke「焦点还在格子里不许收」红 |
| `pickMove` 不夹取（越界照给） | pure「到头就停」红 + smoke 方向键那条红 |
| 回车死取第一条（不看当前行） | smoke 红 |
| 当前行不高亮 | smoke 红 |

**门槛**：`client-smoke` **23/23**（上一格 20 条 → 把原 datalist 那条换成 3 条候选浮层的 + 1 条箭头，
现 23）；本包单测 **72 条**（+5：`fieldChoices` 4 条 + `pickMove` 1 条）；`client-lint` 通过
（样式变量 106 处、自定义属性 107 处、圆角 16 处、排版 23 处）。

**真机验收**（真宿主 + 真 Chrome；隔离方式同上，临时 profile `loglens-pick-20261013` 跑完即删）：

| 步骤 | 实测 | 判定 |
|---|---|---|
| 刚进卡片 | DOM 里「来源」下拉是 `option "（先选一个来源）" [disabled] [selected]`（**上一格 D04 的修法在真机上也对**） | PASS |
| 点「有哪些字段」 | 浮层直接摆出来，`document.querySelectorAll('.ll_pickItem').length === 80`（宿主的默认上限） | PASS |
| 浮层外观 | 截图：4px 内边距 + `radius-lg` + 发丝描边投影 + 34px 行高 + 首行 hover/当前行高亮，与宿主自己的下拉一致 | PASS |
| 输入框右侧箭头 | DOM 读出 `viewBox="0 0 16 16"`、`stroke-width="1"`、`d="M4 6L7.29289…"`、`stroke="currentColor"`、**无 `fill`** | PASS |
| 方向键 | 按两下 `ArrowDown` → `.ll_pickItemActive` = `log.file.path`（第 3 行），且 `document.activeElement` 仍是那个输入框（光标没跑、浮层没关） | PASS |
| 回车 | 输入框的 value 变成 `log.file.path`、浮层收起 | PASS |

产物（三张截图 / DOM 快照）含内网标识，**移出仓库**到 `/tmp/loglens-pick-20261013/`。

#### 再改一处：字段候选改成**点开即拉**，「有哪些字段」那个按钮去掉了（2026-10-13）

**怎么决定的**：上一格的截图贴出去之后，维护者问「字段做成点击下拉选自动 loading 出来是不是更好」。
是——原生 `<datalist>` 本来就是点开就有，而上一格留下的「先按按钮 → 再点输入框」是**两步做一件事**，
而且「按了按钮之后候选藏在输入框里」这一步还要用户自己猜。

**改成什么**：

| 之前 | 现在 |
|---|---|
| 一个「有哪些字段」按钮负责拉，结果只有一句「字段清单 80 个」 | **点开那一格就拉**（`openPick`）：浮层先画出来、里面是「加载中…」，拿到候选原地换上去——点了绝不会「像没反应」 |
| 每次点开都打一枪后端（如果每次都拉）或永远不刷新（如果拉一次就一直用） | 缓存**按来源**（`fieldFetchNeeded`：没拉过 / 换了来源才拉），页脚留一个「**刷新**」——字段会随新数据长出来，必须留口子 |
| 拉失败走卡片顶部那条错误行（和查询失败混在一起） | 失败**落在浮层里**（「字段清单取不到：宿主原话」），不动卡片顶部、不动结果列表——字段候选是附加信息 |
| 空清单只有一句旁注 | 浮层里四种状态各有一句话：在途 / 失败 / 这个来源没有字段名 / 有候选；**只有「输入的字筛不出候选」才不画**（那是用户自己在收窄） |
| 那一行是「字段 + 两个按钮 + 旁注」四列 | 变成「字段 + 一个按钮 + 说明」三列 |

**守卫**（5 条反向验证，逐条实跑）：

| 拆掉什么 | 谁红 |
|---|---|
| `fieldFetchNeeded` 永远 true（不缓存） | pure 红 + smoke「同一个来源不重拉」红 |
| `openPick` 不真的拉（只开浮层） | smoke 5 条红（点开就拉 / 缓存 / 失败 / 筛候选 / 点一行） |
| 失败也写缓存（`setFieldsSource` 也进 catch） | smoke「失败不留缓存，再点开要重试」红 |
| 空清单那一支永远不走 | smoke「空清单也要开浮层说清楚」红 |
| 在途时不画「加载中…」 | smoke「点开就拉」红（它先断言这一格） |
| 去掉在途闩（`fieldsFlightRef`） | smoke「一次点击只打一枪」红（真机抓到的那一处） |

**门槛**：`client-smoke` **27/27**（上一格 23 条 → 字段候选那几条改写 + 新增缓存 / 刷新 / 失败 / 空清单 / 一次点击只一枪）；
本包单测 **73 条**（+1：`fieldFetchNeeded`）；`client-lint` 通过（样式变量 113 处、自定义属性 114 处、
中性边框 10 处仍全是 0.5px）；`check-i18n` **103 条键**（去掉 `btn.fields` / `btn.fieldsLoading` /
`msg.fieldsLoaded`，加上 `btn.refreshFields` / `error.fields`）。

> 上面那一节（顺带改的一处）里「点「有哪些字段」」的写法**保留原文**——它记的是那一天的流程，
> 这一节是它的后一轮。要照现在的界面操作，看这一节。

**真机验收**（真宿主 + 真 Chrome；临时 profile `loglens-open-20261013` 跑完即删，源 profile 的 sha256 与
mtime（18:21:39）跑前跑后逐字一致）：

| 步骤 | 实测 | 判定 |
|---|---|---|
| 选来源后**点一下**那一格 | 面板当场打开、里面是「加载中…」（同一个 evaluate 里读到的：`{open:true, text:"加载中…", rows:0}`） | PASS |
| 1.2 秒后 | `rows: 80`；页脚 = 宿主的截断警告原话 + 「刷新」（`{foot:"只列了前 80 个（这个来源共有 102 个字段）：…刷新", refresh:true}`） | PASS |
| 关掉再点开（同一来源） | `/fields` 的 resource 计数**没变**（还是那一枪） | PASS（缓存真的生效） |
| 点页脚「刷新」 | 计数 +1 | PASS |
| **第一版抓到的一处**：第一次点开 | `/fields` 的计数 **+2**——一次鼠标点击**先 focus 再 click**，两条路都走到 `openPick`，而 `fieldsSource` / `fieldsBusy` 都是这一轮渲染的旧值，于是白打了两枪 | **FAIL → 已修** |
| 修完再点一次 | 同一个读数变成 **+1**（用 ref 做在途闩：`fieldsFlightRef`，同一个来源在途直接 return；失败也放开，好让下次重试） | PASS |

**这一处（点一下打两枪）是这一格唯一的新缺陷，也是 smoke 用例看不见的那类**：桩里 `onFocus` 与
`onClick` 是被分开调的，只有**真浏览器**才会一口气把两条都发出来。修法与用例都在：
`client-smoke` 新增「一次点击（focus 与 click 两条路）只打一枪 /fields」（拆掉在途闩 → 红）。
产物（截图 / DOM 快照）含内网标识，**移出仓库**到 `/tmp/loglens-open-20261013/`。

> 上面那一节记的是 2026-10-13 那一刻的界面（不截断之前：候选 80 行、页脚是宿主那句截断警告）。
> 要照现在的界面写用例，看下面这一节。

### 字段清单不再截断（对齐 Kibana 的长度处理）（2026-10-14）

维护者问「字段不放全是出于什么考虑的」，把 Kibana / Elasticsearch 的做法摆出来对比之后，指令是
**「对齐 长度处理」**。查 Kibana 那一侧（`data_views` 的 `_field_caps` 通路）读到的口径是：

| Kibana 侧 | 事实（读了它的源码与文档） |
|---|---|
| 请求 | `fieldCaps({ fields: ['*']（默认）, include_empty_fields: true, ignore_unavailable: true, … })`——要全量，还主动要「空字段」 |
| 响应 | `readFieldCapsResponse` 里**没有 slice**：一条不漏地读成 `FieldDescriptor`；同名不同类型标 `type: 'conflict'` + `conflictDescriptions`；收尾剔掉 `object` / `nested` 容器行 |
| 规模兜底 | 不是 Kibana 兜的，是 ES 的 `index.mapping.total_fields.limit`（默认 **1000** 个 mapper/索引，含 object 中间节点、`.keyword`、别名、runtime field） |
| 界面 | 字段清单分 Selected / Available / Popular / Empty / Unmapped 区 + 字段名搜索 + 虚拟滚动；「空不空」是**数据侧**信号（来自命中样本），与映射清单分开 |
| 它真截的地方 | 文档摘要（`discover:maxDocFieldsDisplayed`）超了会打 badge 告知（PR #119744，v8.1.0）——与我们的 `total` / `truncated` + warning 同一条判据 |

**结论与落地**：`_field_caps` 从来不 slice，长度交给界面消化。我们这边对应的是
「默认不截断 + 本地子串筛 + 滚动 + 把总数钉在页脚」——**只有调用方显式给 `limit` 才截**：

| 动作 | 落点 |
|---|---|
| 不传 `limit` = 不截断（来源有多少列多少）；`limit` 退化成**可选的显式收窄**，正整数校验仍在、**硬上限取消** | `execute.ts` 的 `runFields`（删掉 `FIELDS_DEFAULT_LIMIT` / `FIELDS_MAX_LIMIT`） |
| ES 适配器同样不 slice（`ES_DEFAULT_FIELD_LIMIT` / `ES_MAX_FIELD_LIMIT` 一并删掉）；顺序、去内部字段、去 `.keyword` 子行三条不变 | `elastic.ts` 的 `fields()` |
| Loki 侧显式 `limit` 才截（形状与 ES 同）；`FieldsOptions` 的注释改为「不传 = 不截断（Kibana 同口径）」 | `loki.ts` / `types.ts` |
| 工具面：描述里写明**默认全列**，并给出成本提示（通配全集群可能上千个字段、响应几十 KB，要窄自己传 `limit`） | `tools.ts` 的 `loglens_fields` |
| 面板：依旧是**不传 limit**（拿全量）；页脚报**宿主的 `total`**「共 N 个字段」+「刷新」 | `client-src/index.js`（新键 `hint.fieldsCount`） |
| 面板浮层改成**两段式**：候选那层自己滚（`.ll_pickScroll`），页脚在它外面钉住 | 同上；`.ll_pickFoot{flex:none}` |

**为什么把页脚钉出来**：不截断之后候选可能有上百行（真机 102 行、滚动区 3468px）。页脚要是跟着滚，
就得先滚到底才看得见「共 102 个字段」——那等于没报，正是这一格最怕的那类「看着像全的」。页脚钉住 +
候选自滚，长度信息就不被长度本身埋掉（Kibana 把计数放在分区头上，是同一个判据）。

**用例**：`elastic.test.ts` **+1**（120 个字段、不传 limit 全列、truncated 恒 false——谁把默认上限加回来就红）；
`tools.test.ts` 那两条重写（不传 = 120 个全给且**无警告**；显式 `limit: 50` 才截、`total`/`truncated`/警告都在，
`limit: 0` 与 `1.5` 仍拒绝）；`client-smoke` **+2**（页脚报宿主的 `total` 而不是本地行数、不截断时没有任何截断警告；
宿主真报截断时照抄那句警告、且不再重复条数）+ 页脚两段式守卫（页脚/「刷新」不许落在 `.ll_pickScroll` 里）。

**反例（拆掉判据必须变红，逐条实跑过）**：

| 拆法 | 变红的用例 |
|---|---|
| ES 适配器装回「默认 80」 | `elastic.test.ts > 不传 limit 就是不截断：120 个字段全列` |
| 执行层恢复「默认 80」 | `tools.test.ts > 不传 limit 就是不截断：120 个字段全给` |
| 页脚改成本地清单长度（丢掉宿主的 `total`） | `client-smoke > 候选浮层页脚：报宿主给的字段总数` |
| 页脚永远显示条数（吞掉宿主警告） | `client-smoke > 宿主真报截断时，照抄那句警告` |
| 警告里去掉「去掉 limit 就是全部」 | `tools.test.ts > 传了 limit 才截` |

**门槛**：本包单测 **319 条**（原 317）；`client-smoke` **29/29**（原 27）；`client-lint` 通过
（样式变量 113 / 自定义属性 114 / 中性边框 10 处仍全是 0.5px）；`check-i18n` 本包 **104 条键**（+`hint.fieldsCount`）；
全仓 `typecheck && build && test && aggregate` 绿：**170 文件 / 2879 用例**（原 2877）。

**真机验收**（真宿主 + 真 Chrome，端口 3199；临时 profile `loglens-len-20261014` 跑完即删；
源 profile `test-logs/cordis.patch.yml` 的 sha256 `d79097fc…` 与 mtime（2026-10-13 18:21:39）跑前跑后逐字一致）：

| 步骤 | 实测 | 判定 |
|---|---|---|
| 选来源后点一下那一格（冷启动第一次） | `.ll_pickItem` **102 个**（此前是 80）；`/fields` 资源计数 **1**（在途闩仍然只让打一枪） | PASS |
| 响应本体（页面内直接 fetch） | `{fields: 102, total: 102, truncated: false, warnings: [], bytes: 6029}`——**不再有截断警告** | PASS |
| 页脚 | `{text:"共 102 个字段\n刷新"}`；`footRect` 887→916 在 `.ll_pickScroll`（708→883，scrollHeight 3468）**外面**，不滚就能看见 | PASS |
| 输入框里打 `name` | 候选 102 → **11**（本地子串筛），**没有新请求**（计数仍 1）；页脚仍「共 102 个字段」 | PASS |
| 关掉再点开（同来源） | `/fields` 计数**不变**（缓存生效） | PASS |
| 点页脚「刷新」 | 计数 **+1** | PASS |
| 显式收窄（页面内 fetch `{limit: 5}`） | `{fields: 5, total: 102, truncated: true}` + 警告「只列了前 5 个（这个来源共有 102 个字段）：…去掉 limit 就是全部…」——截断信号只在**真截**时出现 | PASS |

**产品代价（写下来，别当没有）**：这台来源的字段表是 6.0KB / 102 个字段，全量拉没有感知；
真机历史上那台「全集群通配」的来源是 **45KB**（`elastic.ts` 注释里那份读数），那种来源现在每次点开会
实打实拉 45KB——与 Kibana 付的是同一笔账，换来的是「候选里不会少字段」。真要收，可以给面板加一个
「只拉前 200 个」的开关（`limit` 通路已经在了），但那得先有人提。

### 追加：冲突字段与容器行（对齐 Kibana 的第二刀）（2026-10-14）

上一节末尾列了「没对齐的两处」（类型冲突 / `object`·`nested` 容器行），维护者回「1、2 也对齐」。
先把**事实**量出来再动手（直接打那台来源的 ES，`*,-.*`）：

| 探测 | 实测 |
|---|---|
| `_field_caps?fields=*` 回来的名字 | **200 个** |
| 其中 `object` 容器行 | **10 个**：`input` · `container` · `container.labels` · `agent` · `host.os` · `log.file` · `container` · `container.image` · `ecs` · `host`——**它们没有自己的值**，配对时列出来只会让人选一个「点了没结果」的字段 |
| 多类型字段 | **1 个**：`container.labels.org_label-schema_build-date` = `date` + `text`，且两种类型都带 `indices`（`_field_caps` 的 `indices` 只在多类型时出现——Kibana 的注释也是这么写的） |

落点：

| 动作 | 落点 |
|---|---|
| ES 原生类型 → **宽类型族**（Kibana `castEsToKbnFieldTypeName` 的判据，认不出的归 `unknown`）：**同族的多类型不算冲突**（`text` + `keyword` 都是字符串，Kibana 原话 "ignore the conflict and carry on"）；**异族才算**，标 `conflict: true` + `esTypes` + `conflictDescriptions`（每个类型各在哪些索引） | `elastic.ts` 的 `ES_TYPE_FAMILY` / `esTypeFamily()` + `fields()` |
| `object` / `nested` **容器行不列**（Kibana 收尾也剔）：判据是「**所有**类型都是容器」——既当过容器又当过叶子的名字不剔（那是字段本身的问题，不能顺手藏掉）；`total` 只数可列的 | `elastic.ts` 的 `isContainerRow()` + `fields()` |
| 契约加三个**可选**字段（只有一个类型时不带 `esTypes`/`conflict`：那时候 `kind` 已经说完了，带上只是把载荷撑大） | `types.ts` 的 `FieldInfo`；`execute.ts` 的 `runFields` **原样搬运**（在这一层丢过就不是原样） |
| 工具面：output schema + 渲染 + 描述——冲突字段逐行标「**类型冲突**：date / text」，末尾再给一句合计 | `tools.ts`（渲染抽成 `renderFields`，与 `renderLines` 并排，可直接测） |
| 面板：候选行尾标「类型冲突」（宿主 warn 色），`title` 列两种类型；`fieldChoices` 把冲突信息一路带到行上（普通候选仍只有 `{ name }`） | `pure.js` / `client-src/index.js`（新键 `badge.conflict`，用的是**已有的** `badge.` 域——`tag.` 域不在白名单里，闸门当场拦下了） |

**真机验收**（同一台来源、同一临时 profile，改动前后各跑一次；源 profile 指纹同上一节）：

| 读数 | 改动前 | 改动后 | 判定 |
|---|---|---|---|
| 候选行数 | **102**（含 10 个容器行） | **92**；`containerRowsLeft` 为空数组 | PASS |
| 页脚 | 共 102 个字段 | **共 92 个字段** + 刷新（`total` 与列举一致） | PASS |
| 冲突字段 | 长得跟别的候选一样 | `container.labels.org_label-schema_build-date` 行尾标 **类型冲突**，`title` = `…（类型冲突：date / text）` | PASS |
| 输入框打 `build-date` | — | 两行并排：`container.labels.build-date`（不标）与上面那个（标）——同族/异族的差别一眼可见 | PASS |
| `/fields` 调用次数 | 1 | 1（缓存与在途闩都没被这次改动碰坏） | PASS |

**用例**：`elastic.test.ts` **+3**（异族标冲突 + 同族不标 + 容器行不列且 `total` 一致）；`tools.test.ts` **+4**（执行层不许丢 esTypes/conflict/conflictDescriptions；`renderFields` 三条：标记 + 无冲突不多说 + 截断与警告照旧）；
`client-pure.test.ts` **+1**（`fieldChoices` 带冲突信息、普通候选只有 name）；`client-smoke` **+1**（冲突行有标记、普通行没有、`title` 说全两种类型）。

**反例（拆掉判据必须变红，逐条实跑过）**：

| 拆法 | 变红的用例 |
|---|---|
| 同族多类型也算冲突（判据过宽） | `elastic.test.ts > 同族的多类型**不算**冲突` |
| 从不标冲突（判据整条失效） | `elastic.test.ts > 类型不一致时标 conflict…` |
| 容器行不剔 | `elastic.test.ts > object / nested 容器行不列…` |
| 执行层丢掉冲突信息 | `tools.test.ts > …在**执行层不许丢**，一路到渲染` |
| 渲染不标冲突 | `tools.test.ts > renderFields > 冲突字段逐个标出来…` |
| 面板行不标 | `client-smoke > 类型冲突的字段**在行上**标出来…` |
| `fieldChoices` 不带冲突 | `client-pure.test.ts > 冲突字段把冲突信息带到行上…` |

**门槛**：本包单测 **327 条**（原 319）；`client-smoke` **30/30**（原 29）；`client-lint` 通过
（样式变量 114 / 自定义属性 115 / 排版 26 处均已配对）；`check-i18n` 本包 **105 条键**（+`badge.conflict`）；
全仓 `typecheck && build && test && aggregate` 绿：**170 文件 / 2887 用例**（原 2879）。

**仍然没对齐的**（写下来，别当成已经齐了）：Kibana 还会把 `searchable` / `aggregatable` / `readFromDocValues` /
TSDB 维度等一起带下来，我们只带了「类型」这一轴；它的字段清单还分 Selected / Popular / Empty / Unmapped 区
（那是**数据侧**信号，来自命中样本），我们的「空不空」只有 `loglens_facets` 那一条路可看。

### 容器下拉也自动拉（面板第三刀）（2026-10-14）

维护者：「容器的下拉也做成自动加载。」——与字段候选「点开即拉」同一条判据：**别把「做一件事」拆成两步**
（原来要先点「拉取容器」，容器下拉里才有东西）。

| 判据 | 落点 |
|---|---|
| 缓存键 = 来源 id + Docker 目标名（空目标也算一个确定的键；**没选来源 = 空键，永远不算已缓存**） | `pure.js` 的 `containersKey` |
| 选中 Docker 来源即自动拉（`React.useEffect` + `fieldFetchNeeded`）；依赖里放**键的三个来源**（id / kind / dockerTarget）而不是整个对象——对象每次渲染都是新的，用它当依赖会变成「渲染一次拉一次」 | `client-src/index.js`；`selectedDraft` / `isDocker` 两行**挪到 `view === 'summary'` 那个提前返回之前**（挂 hook 就不能在提前返回之后，否则是条件调用 hook） |
| 去掉「拉取容器」按钮，加「刷新」（容器会变：起停一个清单就旧了）；在途那条 option **排在最后**且 disabled（`value` 与占位项同为空的，排在最前面就等于在加载期间谎报「已经选中了它」——与 D04 同一个坑） | 同上 |
| 失败**落在那一格**（新键 `error.containers`，不动卡片顶部那条错误行）、**不写缓存**（下次触发仍会重试）、并清掉清单与选中项（留着一个下拉里没有的 id 就是 D04 那一类） | 同上 |
| 换目标后选中项**跟着新清单走**：旧 id 还在就留着，不在就换成第一条 | 同上 |
| i18n：删 `btn.containers`（「拉取容器」），加 `btn.refresh` / `error.containers` | 105 → **106** 键 |

**真机验收**（真宿主 + 真 Chrome；临时 profile 同前，源 profile 指纹跑前跑后逐字一致）：

| 步骤 | 实测 | 判定 |
|---|---|---|
| 选中 Docker 来源 | **不用点任何按钮**就开始拉；下拉当场是「容器 / 加载中…」（在途那条在最末） | PASS |
| 约 7 秒后 | 下拉 **35 项**（34 个容器 + 占位），**第一条自动选中**；`/api/dsh-docker/containers` **1 次**、7.1s、18.2KB——走 SSH 的目标本来就慢，界面在途有话可说比快慢重要 | PASS |
| 页面上 | 没有「拉取容器」按钮；有「刷新」 | PASS |
| 点「刷新」 | 点下去 200ms 读到「加载中…」；完成后请求数 **1 → 2**，仍是 35 项 | PASS |
| Docker 目标下拉 | 5 个选项（占位 + 4 个目标） | PASS（换目标重拉在 smoke 里逐条钉住，真机没再花一次 7 秒 SSH） |

容器名是内网标识，**不落仓库**（真机截图移到 `/tmp/loglens-dk-20261014/`）。

**用例**：`client-pure.test.ts` **+4**（键的四种输入：同键 / 换目标 / 换来源 / 空键）；`client-smoke` **+4**
（自动拉 + 第一条自动选中 + 没有按钮 / 同键不重拉 + 换目标重拉 + 在途那条不顶到最前 / 失败只落那一格且不留缓存 / 「刷新」强制重拉）。
顺带把 harness 里「找来源下拉」那段抽成 `sourceSelect()`（新用例要用，别抄第二份）。

**反例（拆掉判据必须变红）**——这一轮有两条**第一版没咬住**，值得记下来：

| 拆法 | 结果 |
|---|---|
| effect 空转（不自动拉） | 红：`自动拉容器` |
| 缓存判据失效（每次都拉） | 红：`自动拉容器`（同一目标被拉第二次） |
| 失败也写缓存 | **第一版没咬住** → 改测法后红 |
| 失败落到卡片顶部错误行 | 红：`失败只落在那一格` |
| 在途那条挪到最前 | **第一版没咬住** → 改成整段替换后红 |
| 「刷新」不重拉 | 红：`「刷新」强制重拉` |
| 键忽略 Docker 目标 | 红：`换目标重拉`（+ `containersKey` 的 pure 用例） |
| 换目标后不换选中项 | 红：`选中项跟着新清单走` |

两条没咬住的原因（守卫的教训）：
① 「失败也写缓存」第一版用**换目标**去验——换目标本来就换了键，缓存写没写都会重拉，等于没验；改成
「换来源走开、再选回这条 Docker 来源」才把两种情况分开。
② 「在途那条排到最前面」第一版只在**末尾前多插了一条**（原来那条还在）→ 断言仍然成立；要**整段替换**（真挪位）才咬得住。

**门槛**：本包单测 **331 条**（原 327）；`client-smoke` **34/34**（原 30）；`client-lint` 通过；
`check-i18n` 本包 **106 条键**；全仓 `typecheck && build && test && aggregate` 绿：**170 文件 / 2891 用例**（原 2887）。

### 容器下拉：还没有选项的那几秒要有过渡（面板第四刀）（2026-10-14）

维护者两句话：「这个文案优化一下」（真机截图中「（先选一个来源）」被原生箭头切成「（先选一个来源」），
「下拉选没有拉取到容器选项的时候，要有过渡」。

| 判据 | 落点 |
|---|---|
| **占位项 = 过渡态本身**：原先把「加载中…」挂在**最末一条** option 上，于是「正在拉」的那一秒下拉**依然显示上次那句占位**——看起来就是一个没人碰过的空下拉。现在第一项（那个空 value 的占位项）自己说状态：`加载中…` / `加载失败` / `没有容器` / 默认 `容器` | `client-src/index.js` 的 `containerSlotText()` + `containerSlot`；判据全在 `pure.js` 的 `containerSlotState` |
| 优先级 **有清单 > 失败 > 在途 > 空清单**：有清单一律回默认（换目标 / 刷新时旧清单还摆在眼前，把占位项改成「加载中…」等于替用户扔掉看得见的东西，那几秒他是有**上一条目标**的选项的）；**失败压在在途前面**（失败时故意不写缓存，`pending` 一直为真——顺序放反，一次失败会让这一格永远写着「加载中…」）；插件不在时回默认（请求根本发不出去，写「加载中…」就是永远不落地的谎） | `pure.js` `containerSlotState` |
| `pending` **自己算**（不是等 `busy`）：它在 `busy` 翻起来之前就为真（effect 还没跑、响应还没回来的那一帧），靠它这一格从**第一帧**起就是「加载中…」，而不是先闪一下「没有容器」再改口 | `index.js` `containersPending` |
| 「正在拉」这句话另有一个落点：**「刷新」按钮自己在途时写「加载中…」**（与旁边「看日志」同一个写法）。占位项要留给「下拉此刻显示哪一项」 | 同上 |
| 「（先选一个来源）」→ 「选择来源**: 占位项是一句话加括号（9 字 117px）放不进最窄那列（去 padding 与原生箭头只剩约 66px），被硬切成一半。改成 4 字短标签；「还要先做什么」由旁边那条错误行说（`error.needTarget` 就是原话） | i18n `option.pickTarget` |
| 输入框 / 下拉加 `text-overflow:ellipsis`：装不下时**硬切**会切掉半个字，省略号至少说明「后面还有」 | `.ll_input` |
| 空清单的 hint：`hint.containersEmpty`（**只列运行中的**——请求带的是 `all:false`）否则「没有容器」会被读成这个目标上什么都没有 | `index.js` + i18n |
| i18n：加 `msg.containersEmpty` / `msg.containersFailed` / `hint.containersEmpty` | 106 → **109** 键 |

**宽度预算的看守**（文案是下次改动里最长胖的东西，它只要读起来通顺就行，没人会去量）：

| 判据 | 出处 |
|---|---|
| 一句占位 / 过渡文案放得进最窄那一列：预算 **5 个汉字**（`.ll_queryGrid` 第一列最窄 110px − 左右 12px padding − 约 20px 原生箭头 ≈ **66px**；`.ll_input` 13px 全角字一字 13px → 5 字 65px） | `client-smoke.mjs` `assertNarrowLabel` + `labelUnits`（全角 / CJK 标点算 1，拉丁与空格算 0.5） |
| 「正在拉」这句话不许**只**落在占位项上：有旧清单时占位项保持回默认 | `Docker 区：同一目标不重拉…` 那条 |

**真机验收**（临时 profile `loglens-len-20261014`，源 profile 指纹跑前跑后逐字一致）：

| 步骤 | 实测 |
|---|---|
| 选中 Docker 来源的第一帧 | 占位项就是「**加载中…**」（不动一下再改口），下拉禁用、「刷新」显示「加载中…」 |
| 约 7 秒后 | 占位项回到「**容器**」，第一条容器自动选中 |
| 刚进卡片、未选来源 | 「来源」下拉四个字完整为「**选择来源**」，末尾不再缺半个字 |
| 空清单目标 | 占位项「**没有容器**」，下面 hint：「这个 Docker 目标上没有运行中的容器（这里只列运行中的）」。真机上没有这种目标，这条**用语法夹具（`containers: []`）逐字钉住** |
| 拉失败 | 占位项「**加载失败**」+ hint 里宿主原话。同样**只能用夹具**（真机上那条 SSH 目标是通的） |

**用例**：`client-pure.test.ts` **+5**（`containerSlotState`：有清单 / 三态优先序 / 失败压倒在途 / 插件不在 / 垃圾入参）；
`client-smoke` 36 条里 4 条在本轮新写或改写（过渡态那一帧**不用 `runPanelQueryFull`**——那个助手会把每件事 settle
到稳定，正好吃掉要看的那一帧，所以手动挂载、自己控制 tick）。

**反例（拆掉判据必须变红）**：

| 拆法 | 结果 |
|---|---|
| `containerSlotState` 永远回 `'default'` | 红：占位项不写状态（`加载中…` / `没有容器` / `加载失败` 三条一起红） |
| 优先级改成「在途 > 失败」 | 红：失败态写着「加载中…」（`containerSlotState` 单测里那条 `pending: true, busy: false, error`） |
| 去掉 `pending`、只信 `busy` | 红：第一帧占位项还是「容器」（`清单还没到的那几秒…` 那条） |
| 占位项只在**末尾**加过渡 option | 红：第一帧显示的仍是默认那句（`assert.equal(treeText(slot), '加载中…')`） |
| 占位项长回「（先选一个来源）」 | 红：`assertNarrowLabel`（宽度预算） |
| `flex`/`disabled` 判断丢掉 | 红：默认态被误禁用 / 过渡态反可选 |

### 点柱放大：直方图上点一根柱 = 把窗口夹到那一档（面板第五刀）（2026-10-15 收口）

维护者在乎的那句话是「点柱放大有接线与用例」——这一刀把上一轮**只写了一半**的实现收口：
柱子已经改成 `<button>`、`zoomToBar` 已经有实现，但 `client-src/index.js` 的 import 表里
**少了 `zoomToBar`**（`client-lint` 检查①当场红：`TS2552 Cannot find name 'zoomToBar'`），
`changePreset` 是死代码（预设下拉仍走内联 `setQuery`），且产物 `client.js` 落后于源码。
**收口前它是红的：`pnpm typecheck` 里 client-lint 报 1 处致命诊断。**

| 判据 | 落点 |
|---|---|
| 补 import：`./pure.js` 的 import 表加 `zoomToBar`（就是那条致命诊断）；`windowOptions` 随之不再被这个文件用到，删掉（`pure.js` 仍导出它，`client-pure.test.ts` 仍在用） | `client-src/index.js` 的 import 表 |
| **窗口随这一次查询走**（与 `filters` 的 override 同一条判据）：自定义窗口住在**草稿**里（`draft.window` + `preset: 'custom'`），经 `runQuery(append, override)` 的 override 参数进这一枪；**拆掉「闭包读旧值」那条路**——否则放大第一枪永远查 1 小时（`preset` 已写成 `custom`，发出去的还是旧窗口，`loglens D04` 那一类） | `runQuery` 读 `effective.window`，不再读任何组件状态；`zoomToBarAt` 把 `zoomed.query` 原样交给它 |
| 下拉说实话：预设 `<select>` 的 `onChange` 接到 `changePreset`（原来内联 `setQuery` = 死代码，换了档还留着自定义段）；`windowLabel` 补 `custom` 分支，文案按**真实范围**现算（`option.custom` 带 `{from}` / `{to}` 占位符，跨天时连日期一起写） | `client-src/index.js` 的 `windowLabel` / `changePreset`；`pure.js` 的 `windowChoices`（选中的档必须**真的在选项里**，否则浏览器回落显示第一项——`D04` 同一个坑） |
| 柱子可点：`count > 0` 的柱改成 `<button>`（`background:none;border:0` + hover 底 + `focus-visible` 焦点环）；类名刻意**不带 `btn`**——`scripts/client-style-spec.mjs` 的 `BUTTON_CLASS = /btn/i` 会把柱子卷进「同族几何一致」（柱高是内联的、每条都不一样，本来就谈不上同族）；`onClick` 调 `zoomToBarAt(bar.ts, histogram.stepMs)`；`stepMs` 跟着柱子一起存（不另算一份，两处各算必然漂） | `client-src/index.js` 的 `ll_histBars` 渲染段 + `.ll_histBarClick` 样式 |
| **空桶不给点**：保持静态 `div` + 现有 `title`（点进一个 0 条的时间段只会得到「没有命中」，看不出是自己点的——与榜上「空值那一桶不给点」同一条判据） | 同上；守卫按 `bar.type !== 'button'` 断言 |
| `zoomedBar` 给「正在放大在哪一档」加高亮（`.ll_histBarActive`，与 `.ll_groupRowActive` 同一条「这一屏是筛过的」判据）；`zoomClamped` 在直方图那一行如实说一句 | 同上；新键 `hint.zoomBar` / `hint.zoomClamped` / `option.custom` / `error.badWindow` |
| 被夹过要说出来：`clamped: true`（低于 `ZOOM_MIN_MS` = 1 分钟）时显示「已放大到最短 1 分钟」，**不静默收窄** | `pure.js` 的 `zoomToBar` 返回 `{ query, clamped }`；`index.js` 据此渲染那一句 |
| `custom` 档必须带一段能用的窗口：`queryProblem` 在 `preset === 'custom'` 且 `windowProblem` 非空时回 `badWindow`（缺了它**不静默落回 1 小时**——那会让「说的窗口」与「查的窗口」变成两件事） | `pure.js` 的 `windowProblem` / `queryProblem`；`queryPayload` 只把这段用在新档上（不合法才回落预设，那是给绕过 `queryProblem` 的兜底） |

**用例**：`client-pure.test.ts` **+7**（`zoomToBar` 四条：正常档 / 被 `ZOOM_MIN_MS` 夹 / 垃圾入参回 `null` / 不动 `filters` 与 `q`；`queryPayload` 的 custom 两条：带 window 用那一段、custom 但 window 不合法走既有回落；`windowChoices` 一条：custom **只在自己被选中时**才补进下拉；`windowProblem`/`queryProblem` 的 custom 档一条）；
`client-smoke` **+4**（点一根有数据的柱 → 请求体 `from`/`to` 恰是那一档 + 聚合同一窗口 + 下拉变「自定义」且文案是真范围 + 高亮在场 / 空桶是静态 `div` 且无 `onClick` / 换预设后 `customWindow` 清掉且再查是预设窗 / 被夹时那句提示在场）。

**反例（拆掉判据必须变红，逐条实跑过）**——这一轮**11 条**，覆盖每一处新判据：

| 拆法 | 变红的用例 |
|---|---|
| 拆掉 `zoomToBar` 的 import | `client-lint`（那条致命诊断当场回来） |
| `runQuery` 读闭包里的旧草稿（拆 override） | smoke：点柱放大（两条）+ 点桶下钻（三条） |
| 预设下拉不接 `changePreset`（换档留着自定义段） | smoke：`换预设档 = 把这一段撤掉` |
| `queryPayload` 拆掉 custom 分支 | pure：`custom 档用**草稿自带的那一段**` |
| `windowLabel` 拆掉 custom 分支 | smoke：`点一根有数据的柱`（下拉显示裸键 `custom`） |
| 拆掉「正在放大哪一档」高亮 | smoke：`点一根有数据的柱` |
| 拆掉「被夹过要说出来」 | smoke：`被下限夹过时**说出来**` |
| 空桶也做成可点按钮 | smoke：`空桶是**静态**的，点不动` |
| 拆掉 `ZOOM_MIN_MS` 夹取 | pure：`比下限还窄的档夹到 1 分钟` |
| `windowChoices` 不补 custom | pure：`下拉里实际要摆的档` |
| 拆掉 `queryProblem` 的 badWindow 挡板 | pure：`custom 档必须带一段能用的窗口` |

**门槛**：本包单测 **343 条**（原 331；`client-pure.test.ts` 90 条）；`client-smoke` **40/40**（原 36）；
`client-lint` 通过（样式变量 119 / 自定义属性 120 / 中性边框 10 处仍全是 0.5px / 按钮族 5 个类——
柱子刻意不进这一族）；`check-i18n` 本包 **113 条键**（相对 `HEAD` 的 103 是**加 11 删 1**——
本轮新增的 `option.custom` / `error.badWindow` / `hint.zoomBar` / `hint.zoomClamped`，以及同一批在途改动
一并结清的 `hint.fieldsCount` / `badge.conflict` / `msg.containersEmpty` / `msg.containersFailed` /
`error.containers` / `hint.containersEmpty` / `btn.refresh`；删掉的是被「刷新」取代的 `btn.containers`）；
全仓 `typecheck && build && test && aggregate` 绿：**170 文件 / 2903 用例**（原 2891）。

**产物闸门**：本批改动**尚未提交**，所以 `pnpm artifacts:check`（它比的是工作树 vs 索引，
判据是「提交里的产物落后于源码」）对一批未提交改动必然报「落后」——那不是产物漂移的证据。
本轮按**幂等**验：先记下 `lib/**` 与 `client.js` 的 md5，跑一次 `pnpm -r build`，再记一次——
**两次逐字节相同**（构建后无残余 diff），即「源码 → 产物」这条变换在本批改动上是确定的。
提交时按 [conventions § 提交](../../docs/conventions.md#提交) 把 `lib/` 与 `client.js` 一并提交，
那时的 `artifacts:check` 才是真判据。

**还没做的（如实记下，别当已经验过）**：这一刀**没跑真机验收**——覆盖是 `client-lint`（静态）、
`client-pure.test.ts`（纯函数）、`client-smoke`（无浏览器的渲染树 + 请求体）三层。
真机上还没看过的是**观感**那几项：柱子在真实宽度下的可点面积、hover 底与 `focus-visible` 焦点环、
高亮色（`--dsw-alias-state-business-primary`）与旁边那两根「正在下钻」的条是否一致。
要真机时按 [design.md §9.7](./docs/design.md#97-验收口径) 的口径跑（临时 profile + 真 ES + 真 Chrome，
产物含内网标识移出仓库到 `/tmp/`）。

### 面板操作流：行上看得见「谁写的」+ 点值即筛 + 级别下拉（面板第六刀）（2026-10-16）

维护者两句话：「交互上还是不是很友好，操作麻烦」+「看看能优化吗」。先把**麻烦在哪**量出来（全部对着
源码与产物核过，不是感觉），再挑两个"操作最贵"的做：

| 症状（核过的事实） | 证据 |
|---|---|
| **结果行看不到标签**：`line.labels` / `line.raw` 随响应回来，面板一行都没渲染——「这行是哪个容器写的」在卡片里根本看不到 | 行渲染只有 `ll_resultTime` / `ll_resultLevel` / `ll_resultMsg` 三格；`line.labels` 在 `client-src/index.js` 出现 **0 次** |
| **想按某个标签值筛：没有这条路**。只能先手填「分组字段」→ 点「分组」→ 再点榜上那条——三步，且前提是你**已经知道字段名** | `filterAdd` 只在 `drillDown()` 里被调用（榜那条路），行上没有任何入口 |
| **级别筛选没有入口**：宿主 `/query` 早就收 `level`，面板一个入口都没有；要只看 error 得自己写查询串，而 Loki / ES 的方言不同 | `queryPayload` 不产 `level`；`levelMatches` / `readLevel` 在 client-src 里 0 次 |

| 判据 | 落点 |
|---|---|
| **行上摆出「谁写的」**：按**宿主给的顺序**取前 3 个标签（`LABEL_PRIORITY` 已经排的是「排查时先问什么」，**不在这里重挑**——再挑一次就是第二份会漂的判据）；空值不摆（占位会把有值的挤掉）；超长截断并带 `…`（**值本身不截**：下发给筛选的必须是原值，截过的值筛不到东西） | `pure.js` 的 `rowLabels` / `rowLabelOverflow`；`ROW_LABEL_MAX` / `ROW_LABEL_VALUE_MAX` |
| **点标签值 = 按「字段 = 值」加一条筛选并立刻重查**：与点榜下钻走**同一个** `drillDown`（判据只有一份，不新写一遍「怎么筛」）；类名刻意**不带 `btn`**（按钮族几何检查按 `/btn/i` 抓类名——这些是行内的小标签，几何本来就跟按钮不同族，与直方图柱子同一条做法） | `index.js` 的 `ll_resultTags` / `ll_resultTagHit` + `.ll_resultTag*` 样式 |
| **不可点的标签照旧摆出来**（空值那类）：筛选表达不了「字段缺失」，给个点得动、筛的却是别的东西的入口更坏——判据就是 `rowFilterProblem`（它转调既有的 `filterProblem`，**值不做 trim** 那条一并继承） | `pure.js` 的 `rowFilterProblem` |
| **悬停说全**：时间 + 级别（**推断出来的标出「从正文推断」**——`level` 是筛选项，两种可信度不是一回事）+ 全部标签 + 原文 `raw`；行尾写「另有 N 个标签」（N **只数有值的**，否则悬停里是空值、那句话就成了假的） | `pure.js` 的 `lineTitle` / `rowLabelOverflow` |
| **级别下拉**（不限 + 六档）：复用宿主既有 `level` 入参，**零契约改动**；草稿里放 `level: ''` 表示不限，**载荷里不带这个键**（线上形状与加它之前逐字节一致，与 `filters` 空数组同一条） | `pure.js` 的 `levelChoices` / `levelFilterOf`；`queryPayload` |
| **不认识的值收成「不限」**（不直接下发）：`level` 是枚举，宿主 `readLevel` 收到认不出的会**报错**——宁可不下发，也不发一个会把整次查询变成错误的枚举值。原生 `<select>` 在所选值不在选项里时回落显示第一项，而第一项就是「不限」，界面自洽 | `pure.js` 的 `levelFilterOf` |
| **页内筛必须说出来**：宿主是在**返回的这一页**上过滤的（`src/execute.ts` 的既有口径），`counts` / `truncation` 仍是未筛的整页。不说出来就会把「这一页里的 error」读成「窗口里一共多少 error」 | 新键 `hint.levelPaged`；判据 `pure.js` 的 `levelFiltered`（看**下发的载荷**，不看回显——查询在途的那几秒也该在场） |
| **改级别不自动重查**（与改查询串 / 时间窗同一条）：都在草稿里，由「查询」那一下一起发——一改就查会在连点时打出一串请求 | `index.js` 的 `onChange` 只写草稿 |
| **敏感字段那句话**：`raw` 与全部标签原样来自后端，行详情里写明（与 docker「投递给 Agent 时留意凭证」同一条态度） | 新键 `hint.rowSensitive` |

**用例**：`client-pure.test.ts` **+13**（`levelChoices` 与宿主 `CANONICAL_LEVELS` 的对偶 / `levelFilterOf` 七种输入 / `levelFiltered` 与载荷同真同假 / 载荷带不带 `level` 三条 / `rowLabels` 按宿主顺序 + 空值不摆 + 超长截断且值不截 + 垃圾入参 / `rowLabelOverflow` 只数有值的 / `lineTitle` 推断标记 / `rowFilterProblem` 空值挡下 / 值不 trim）；
`client-smoke` **+4**（行上摆 3 个 + 悬停说全 + 行尾「另有 2 个」+ 敏感字段那句 / 点标签 → 请求体恰是那一对 + 聚合带同一份筛选 + 芯片出现 / 空值不占位 / 级别选中 → 载荷带 `level` + 页内筛那句在场 + 回到不限后**不带这个键**）。

**反例（拆掉判据必须变红，逐条实跑过）**——**12 条**：

| 拆法 | 变红的用例 |
|---|---|
| `levelFilterOf` 不收回枚举（垃圾值直接下发） | pure：三条级别用例（`levelFilterOf` / `levelFiltered` / 载荷不带键） |
| `rowLabels` 自己挑（挑最短的） | pure：`按**宿主给的顺序**取前 3 个` |
| 空值也摆出来 | pure：`空值不摆` |
| 截断不带 `…` | pure：`超长值截断并带省略号` |
| `rowLabelOverflow` 把空值也算进去 | pure：`rowLabelOverflow 报「还有几个没摆出来」` |
| 行上不渲染标签（回到旧三格） | smoke：行上的标签三条一起红 |
| 标签值不可点 | smoke：行上的标签三条一起红 |
| 级别下拉不写进草稿 | smoke：`级别筛选：下拉六档 + 不限` |
| 去掉「页内筛」那句边界声明 | smoke：同上 |
| 改级别后自动重查 | smoke：同上 |
| `level` 空值时也带一个空键 | pure：四条（**含三条既有的 queryPayload 用例**——形状守卫是共用的） |
| 下发前把值 `trim` 了 | pure：`**值不做 trim**` |

**门槛**：本包单测 **356 条**（原 343；`client-pure.test.ts` 103）；`client-smoke` **44/44**（原 40）；
`client-lint` 通过（样式变量 130 / 自定义属性 132 / 中性边框 11 处仍全是 0.5px / 按钮族仍 5 个类——
行上的标签刻意不进这一族）；`check-i18n` 本包 **125 条键**（+`field.level` + 级别七档 + `hint.levelPaged` /
`hint.rowLabelFilter` / `hint.rowMoreLabels` / `hint.rowSensitive`）；全仓
`typecheck && build && test && aggregate` 绿：**170 文件 / 2916 用例**（原 2903）。

**这一刀与设计的分期**：它**提前落地**了 [design.md §9.3](./docs/design.md#93-借什么按优先级每条带落点--契约影响--诚实边界)
的第 2 项（行详情）与第 3 项（从行上取值加筛选）——设计正文已随之改成「已落地」，P8-乙 / 丙 的两行也标了
提前量（见那一节的「已提前落地」注）。判据本身没变，变的只是它落在了哪一期。

**还没做的（如实记下）**：这一刀**没跑真机**——覆盖是 `client-lint`（静态）、`client-pure.test.ts`（纯函数）、
`client-smoke`（无浏览器的渲染树 + 请求体）三层。真机上还没看过的是**观感**：标签在真实行宽下的换行与
拥挤程度（一屏六行、每行 3 个标签）、可点标签与不可点标签**一眼看得出区别**（现在只有 hover 底与 cursor）、
以及 `<select>` 多一格之后那一行在窄卡片里的排布。要真机时按
[design.md §9.7](./docs/design.md#97-验收口径) 的口径跑（临时 profile + 真 ES + 真 Chrome，产物含内网标识
移出仓库到 `/tmp/`）。

### 面板第七刀：回车即查 + 放大后取消（2026-10-16）

接上一刀（维护者：「交互上还是不是很友好，操作麻烦」）。上一刀我列了五处麻烦、他选了第 1+2 与第 3 项，
剩下第 4（回车即查）与第 5（放大后取消）没做——**这一刀把这两处补完**，交互回路才算闭上。

| 判据 | 落点 |
|---|---|
| **回车即查**：查询栏里的**输入框**（查询串 / 条数）按回车 = 点「查询」（同一条路 `runQuery(false)`）。浏览器里所有搜索框都认回车，而「打完字 → 手离开键盘 → 移到鼠标 → 点按钮」每天要重复几十次 | `client-src/index.js` 的 `runOnEnter`；两个输入框的 `onKeyDown` |
| **只认回车**：其它键一律不发（否则每敲一个字打一枪）；**在途 / 保存中不发**——与按钮的 `disabled` **同一条件**，不然会出现「按钮灰着但回车还能打枪」这种两套说法 | 同上（`event.key !== 'Enter'` + `saving \|\| querying`） |
| **再点一次取消**：点**正放大着的那一档**（就是高亮那根）= 回到放大之前那一档。判据与高亮**同一条**（`zoomedBar.from`）：高亮哪一根、点哪一根能撤销，说的是同一件事（照点榜下钻「再点一次取消」的既有交互） | `zoomToBarAt` 的取消分支 + `pure.js` 的 `unzoomQuery` |
| **必须记住「从哪一档放大的」**：窗口一旦改成 `custom`，草稿里就没有任何地方能反推出原来选的是 15 分钟还是 24 小时。取消时随手回落某个默认档 = **替用户改窗口**（他点那一下的意思明明是「我不放大了」） | 新增 `zoomFrom` 回显状态（与 `zoomedBar` / `zoomClamped` 同一族） |
| **连点两根柱之后仍回到最初那一档**：第二次是在 `custom` 里再放大，`zoomFrom` **不许**被写成 `custom`——那会让 `unzoomQuery` 认不出、取消变成**点了没反应**（静默死胡同）。所以 `preset === 'custom'` 时保留原有那一档 | 同上；用例见下 |
| **撤窗口要撤干净**：`unzoomQuery` 只改 `preset` 并**删掉 `window`**（留着就是「下拉写着 1 小时、草稿里还夹着自定义段」的第二份真相）；查询串 / 筛选 / 条数 / 级别一律不动 | `pure.js` 的 `unzoomQuery` |
| **认不出就什么都不做**：`from` 不是真预设时 `unzoomQuery` 回 `null`、界面不发请求——宁可那一下没反应（下拉还在，用户照样能自己选一档），也不替用户挑一档或退回一个没有窗口的 `custom`（那会被 `queryProblem` 挡成 `badWindow`，点一下得到一句报错） | 同上 |
| **悬停说实话**：高亮那根的悬停写「再点一次取消放大（回到放大之前那一档）」，其余写「点一下放大到这一段」——同一个手势在两档上是两件事，不说清就成了「点不动」的错觉 | 新键 `hint.zoomBarCancel` |

**用例**：`client-pure.test.ts` **+3**（`unzoomQuery` 回原档且撤窗口、其余字段一律不动、入参不被改；
`from` 七种非法输入一律回 `null`、四档预设都认、草稿缺席也回 `null`；与 `zoomToBar` 配成一对的往返一致）；
`client-smoke` **+3**（回车即查：非回车不发 + 查询串原样下发 + 条数那格也认回车 /
取消放大：窗口回到 1 小时 + 聚合同一段 + 下拉与高亮一起回落 + 被夹那句跟着撤 /
**连点两根柱之后取消仍回到最初那一档**）。

**反例（拆掉判据必须变红，逐条实跑过）**——**7 条**：

| 拆法 | 变红的用例 |
|---|---|
| 拆掉取消分支（再点高亮那根 = 又放大一次） | smoke：`放大后取消` |
| 取消时把 `window` 留着（第二份真相） | pure：两条（回原档 / 与 zoomToBar 往返） |
| `from` 认不出也硬回一档（替用户挑） | pure：`from 必须是真预设` |
| 查询串输入框不接回车 | smoke：`回车即查` |
| `runOnEnter` 不判键（每敲一个字发请求） | smoke：`回车即查` |
| 取消时不还原 `preset`（只删窗口） | smoke：`放大后取消` |
| `zoomFrom` 每次覆盖（连点后变 `custom`） | smoke：`连点两根柱`（**这条第一版没咬住**，见下） |

**一条第一版没咬住的（守卫的教训）**：`zoomFrom` 被写成 `custom` 这条，我最初只写了「点一根柱 → 取消」
的用例——那一次 `zoomFrom` 从 `1h` 直接记下，覆盖与否都一样，所以**拆了也不红**。补上「**连点两根**、
第二次从自定义档再放大」之后才咬住：那一支真的会把 `zoomFrom` 写成 `custom`，接着取消就成了
`unzoomQuery(query, 'custom')` → `null` → **点了没反应**。这正是「守卫没咬住 = 判据没被测到」的又一例。

**门槛**：本包单测 **359 条**（原 356；`client-pure.test.ts` 106）；`client-smoke` **47/47**（原 44）；
`client-lint` 通过（样式变量 130 / 自定义属性 132 / 中性边框 11 处全 0.5px）；`check-i18n` 本包
**126 条键**（+`hint.zoomBarCancel`）；全仓 `pnpm typecheck && build && test && aggregate` 绿：
**170 文件 / 2919 用例**（原 2916）。

**还没做的（如实记下）**：与第六刀一样**没跑真机**。真机上还没看过的是：回车在 `type=number` 那格上的
真实行为（有的浏览器对数字框的回车有自己的处理）、以及连点放大后取消这条路上高亮是否始终跟手。
要真机时按 [design.md §9.7](./docs/design.md#97-验收口径) 的口径跑。

### 面板第八刀：条件改了就不许拿旧结果翻页 + 查询串方言（2026-10-17）

维护者：「优化一下 loglens es 的 ui 交互，可以使用 test-logs（3085）profile 验证」。这一刀对着
**test-logs（3085）+ 真 ES** 实际点出来的几处，不是凭感觉列。

| 症状（核过的事实） | 证据 |
|---|---|
| **条件改了还能点「下一页」**：`runQuery(true)` 用**当前草稿**拼载荷，却把 `cursor` 原样带上是**上一次查询**的 | `runQuery` 里 `payload = queryPayload(effective…)` + `if (append && cursor !== undefined) payload.cursor = cursor`；条件变了没有任何一处清游标。ES 的游标是 PIT + `search_after`：**不会报错**，只会把旧快照里的位置当成新条件的下一页（少行 / 错位都看不出来）。真机复现：1 小时查完 → 时间窗改 15 分钟 → 点「下一页」，请求体是**新窗口 + 旧游标**，列表从 100 行变成 200 行 |
| **查询串占位符对 ES 说 LogQL** | `placeholder.query` 写死「Loki 是 LogQL」；ES / OpenSearch 走的是 Lucene 的 `query_string`（`capabilities().queryLanguage` 也是 `lucene`） |
| **级别下拉的提示指了一条走不通的路** | 原话「要按级别看全量请用分组榜」。真机这台 ES：`log.level` 在字段清单里，但按它 terms 聚合返回 **0 个桶**（一小时窗口里 26272 行）；级别是 `levelInferred: true` 从正文推断的——分组榜拿不到级别。宿主那条 `level=…` warning 也写着「请用聚合（loglens_facets）」，且 `**返回的这一页**` 的星号会原样漏在面板上 |
| **结果行的正文被标签挤成 0 宽**（真机 1470px） | 行是 grid，标签列 `auto` 的 max-content（3 个 220px 芯片 + 「另有 N 个」）吃掉正文那列 `minmax(0,1fr)`——正文变成一字一行。这一处在本轮起手时工作区已有一版未提交的 flex 修法，本轮保留、并在真机上复核（读数见下） |

| 判据 | 落点 |
|---|---|
| **条件指纹只取会影响请求的字段**：来源 / 查询串 / 预设档 / custom 窗口 / 级别（与载荷同一条归一）/ 条数 / 筛选（按字段排序，一个字段一条） | `pure.js` 的 `querySignature` |
| **预设档只比档名**：`1h` 每次查都是「到此刻为止」，比绝对毫秒会把时钟走动误判成改动；`custom` 才比真实 from/to | 同上 |
| **查询串不 trim**：`queryPayload` 原样下发，比较也必须原样（末尾多一个空格也算改过） | 同上 |
| **「过期」= 与上一次「成功」跑的那份草稿不同**；还没查过 / 刚清空不算过期（那时屏上根本没有结果） | `pure.js` 的 `queryStale`；`index.js` 的 `lastRun`（在 `runQuery` 成功分支写 `effective`，`clearResults` 一并撤） |
| **条件改了要明说**：结果区顶上一句「下面这份还是上一次查询的」 | 新键 `hint.staleResults`；`index.js` 的 `.ll_hint.ll_warn` |
| **「下一页」只在条件没变时给**：游标属于上一次查询；ES 的 PIT 混着用不会报错 | `index.js` 的 `cursor === undefined || isDocker || stale ? null` |
| **「分组」同样停**：它取当前查询串 + 上一次回显的窗口（`facetsEnvelope`），条件变了会画出「新查询串 + 旧窗口」的榜 | `disabled: … || stale` |
| **占位提示按来源方言**：ES / OpenSearch → Lucene，Loki → LogQL，其余通用；**逐条列字面量**（静态闸门扫不到动态键） | `index.js` 的 `queryPlaceholder` + 3 条 `placeholder.query*` |
| **级别提示说实话**：页内筛的边界不变；补上「要按级别看全量得后端真有级别字段（ES 上常为空），否则只能搜关键字」 | `hint.levelPaged`（中英都改）；宿主 `src/execute.ts` 那条 warning 同步去 Markdown 星号；`src/tools.ts` 里 `loglens_search.level` 的参数说明也改掉（agent 会把这句错建议转述给人） |
| **行排版用 flex**：正文 `flex:1` 永远分得到宽度；标签最多 38% 且可换行 | `.ll_resultRow` / `.ll_resultMsg` / `.ll_resultTags` |

**用例**：`client-pure.test.ts` **+8**（同一份条件不算过期 / 七类字段逐项改都算 / 查询串不 trim /
预设档不看绝对毫秒 / custom 档看真实窗口 / 筛选不看数组顺序 / 级别与载荷同一条归一 /
`lastRun` 缺席与垃圾入参）；`client-smoke` **+3**（ES 占位是 Lucene、Loki 才是 LogQL /
条件改了提示在场 + 「下一页」收起 + 「分组」禁用 + 重查后恢复且翻页带新窗口 /
只改级别也走同一份判据）。另修通 `hint.levelPaged` 与宿主 warning 的文案。

**反例（拆掉判据必须变红，逐条实跑过）**——**7 条**：

| 拆法 | 变红的用例 |
|---|---|
| `queryStale` 恒 false | pure：3 条（七类字段 / 不 trim / custom 窗口） |
| 条件指纹不取 `q` | pure：2 条（七类字段 / 不 trim） |
| 条件指纹直接用原始级别（不与载荷同口径） | pure：`级别与载荷同一条归一` |
| 不写 `lastRun`（查完也判不出过期） | smoke：2 条（条件改了 / 只改级别） |
| 「下一页」不判 `stale` | smoke：2 条（条件改了 / 只改级别） |
| 「分组」不判 `stale` | smoke：`条件改了…` |
| ES 占位符改回 LogQL | smoke：查询串占位 |

**真机验收（test-logs profile @ 3085，真 ES；内网地址不入库）**，逐条读数：

| 步骤 | 读数 | 结论 |
|---|---|---|
| 选 ES 来源 | 查询串占位 = `查询串（Lucene，如 level:error 或 "timeout"；留空即全量）` | PASS |
| 1 小时窗查询 | 返回 100 行 / 命中 26272 / `已截断：达到条数上限`；无「条件改过」误报 | PASS |
| 时间窗 1h → 15m（不查） | 橙色提示在场；「下一页」消失；「分组」禁用；没有新请求 | PASS |
| 点「查询」 | 提示撤掉；「下一页」/「分组」恢复；命中 6571（15 分钟） | PASS |
| 点「下一页」 | 请求体 `to - from = 900000`（15 分钟）+ 游标；列表 100 → 200 行 | PASS（旧游标不再配新条件） |
| 分组 `container.name` | 榜首一个服务 15235 条，其后 9988 / 288 / 239 / 177 / 123… | PASS |
| 点榜上一条下钻 | 芯片 `container.name = <服务>`；行 / 分布 / 榜一起收窄；**不误报「条件改过」**（`lastRun` 跟着 override 走） | PASS |
| 级别 = error（不查） | 提示出现、「下一页」收起、「分组」禁用；页面级提示改成「后端要有级别字段」 | PASS |
| 级别上再下钻（真查） | 宿主 warning：`100 / 100 行被筛掉`、无 `**` 原样漏出；这套 ES 的级别确实是推断的 | PASS |
| 按 `log.level` 分组 | `buckets: []`（窗口内 26272 行） | 证明原提示是死路，已改 |
| 行排版（1470px 宽） | 正文分到约 59% 宽度、标签最多 38% 且悬停给全 | PASS（观感项，无自动守卫） |

**门槛**：本包单测 **367 条**（原 359；`client-pure.test.ts` 114）；`client-smoke` **50/50**（原 47）；
`client-lint` 通过（样式变量 130 / 自定义属性 132 / 中性边框 11 处全 0.5px）；`check-i18n` 本包
**129 条键**（+`placeholder.queryLogql` +`placeholder.queryLucene` +`hint.staleResults`）；
全仓 `pnpm typecheck && build && aggregate` 绿，`test` **2925 / 2927**——**红的 2 条不在本包**：
`scripts/test/os-consent-scope.test.ts` 的「OS 级同意」升级绊线（本机 DSH `0.2.1-alpha.5` 与方案基准
`0.2.1-alpha.2` 不一致，是那条绊线**按设计**该在宿主升级时报的红，与本刀无关）。顺带修掉
`ROADMAP.md` 里一条指向仓外 skill 目录的死链（改成仓内 [真机测试 runbook](../../docs/agent-real-test.md)）。

**还没做的（如实记下）**：
- 条件改了**不自动重查**（既有判据：一改就查会在连点时打出一串请求），也没有把旧结果灰掉 / 清空——
  只做「明说 + 收起两个会静默出错的入口」。要不要在改条件时直接清空结果，留给下一轮决定。
- 结果行仍没有「展开看 raw / 复制正文」（design.md §9.3 第 2 项的后半）。
- 行排版的 flex 修法是**观感项**，只有真机读数，没有自动守卫（现有 smoke 里没有可信的 CSS 布局落点）。

### 面板第九刀：行上只留 1 个身份标签 + 「＋N」浮层（2026-10-17）

维护者发了一张截图，箭头指着一行里的 `host.name 38ed…`：「这个标签的必要性如何」。先量，再改：

| 量到的事实（同一来源，100 行） | 读数 |
|---|---|
| `container.name` | 4 个值（哪个服务） |
| `host.name` | **1 个值**（容器 ID 风格的 hostname）——整页恒定，且看不出是谁 |
| `log.file.path` | 4 个值，与 `container.name` 一一对应（一个容器一条路径） |
| `stream` | 2 个值（stdout / stderr），但按固定优先级轮不到它 |
| 行高 | 3 个 chip + 「另有 17 个」= 4 行（约 72px）；短消息行被撑到约 74px，一屏 5 行 |

结论不是「标签没用」——它是**没有先验知识时唯一的一键筛选入口**；问题是**固定优先级挑出的 3 个**
对这份数据并不都有信息量（恒定值 + 冗余值占了 2/3 的位置）。所以不删机制，只把行内占用压下去。

| 判据 | 落点 |
|---|---|
| 行上只摆**宿主顺序的第一个**有值标签（仍一键筛） | `index.js` 的 `rowLabels(line, 1)` |
| 其余收进「＋N」（N = 有值标签数 - 1；**0 时不画**） | `rowLabelOverflow(line, 1)`；`hint.rowMoreLabels` 改为 `＋{count}` |
| 「＋N」点开**全部标签**浮层，每条仍可点筛（与行上走同一个 `drillDown`） | `labelPanel` 状态 + `allRowLabels`；`index.js` 的 `ll_labelPanel` |
| 浮层**画在 `.ll_results` 外面**：那个容器 `max-height:420px; overflow-y:auto` 会把绝对定位的子元素裁掉 | `.ll_labelLayer{position:fixed}` + 视口坐标（锚在被点的按钮上，左右 / 上下夹在视口内） |
| 收起：点背景 / × / Esc / **任何滚动**（页面或列表）、重查后行没了 | `.ll_labelBackdrop` / `.ll_chipBtn` / `closeOnEscape` / capture 的 scroll 监听 |
| 空白值不列（与行上同一条判据），列出来也点不动 | `allRowLabels` 复用 `labelRows`（与 `rowLabels` 同源）；`rowFilterProblem` 挡 |
| 标签的**口径只有一份**：行上前 N 个、浮层全部、「还有几个」都从 `labelRows` 出 | `pure.js` 的 `labelRows`（`rowLabels` / `allRowLabels` / `rowLabelOverflow` 都走它） |
| 悬停仍是全部标签 + 原文（不变） | `lineTitle` |

**用例**：`client-pure.test.ts` **+1**（`allRowLabels` 全部 / 顺序 / 截断 / 空值 / 垃圾入参，且前 N 个与
`rowLabels` 逐项相等）；`client-smoke` 更新 3 条 + **+1**（只摆 1 个 + 「＋4」 / 「＋N」浮层：
结构上不在 `.ll_results` 里、锚点坐标、全部标签、点一条即筛并收起、点背景收起 /
身份标签点筛 / 空值不占位且没有「＋N」）。

**反例（拆掉判据必须变红，逐条实跑过）**——**5 条**：

| 拆法 | 变红的用例 |
|---|---|
| 行上改回摆 3 个 | smoke：只摆 1 个 |
| 有溢出却不画「＋N」 | smoke：只摆 1 个 / 浮层 |
| 浮层里点一条不 `drillDown` | smoke：浮层 |
| `allRowLabels` 只回前 3 个 | pure：allRowLabels + smoke：浮层 |
| 点背景不收起 | smoke：浮层 |

**真机验收（test-logs profile @ 3085，真 ES）**：

| 读数 | 结果 |
|---|---|
| 行上标签 | `container.name <服务>` + `＋19`（这条来源有 20 个有值标签） |
| 短消息行高 | **42px**（标签 18px、正文 36px）；改前同数据是 3 chip + 「另有 N 个」共 4 行、约 74px |
| 浮层 | 点「＋19」出现：`position:fixed`、320×300、全在视口内；标题「全部标签 + 时间」；20 条可点 |
| 点浮层里的 `host.name` | 浮层收起 + 芯片 `host.name = <值>` + 真重查（命中数变了） |
| 点背景 / 页面滚动 | 都收起（滚动用 capture 监听，列表内滚也收） |

**门槛**：本包单测 **368 条**（原 367；`client-pure.test.ts` 115）；`client-smoke` **51/51**（原 50）；
`client-lint` 通过（样式变量 149 / 自定义属性 154 / 中性边框 12 处全 0.5px / 字号 32 处配对）；
`check-i18n` 本包 **132 条键**（+`panel.labels` +`hint.rowLabelPanel` +`btn.closeLabels`）；
全仓 `pnpm typecheck && build && aggregate` 绿，`test` **2926 / 2928**——红的 2 条仍是
`scripts/test/os-consent-scope.test.ts` 的 DSH 升级绊线（本机 `0.2.1-alpha.5` ≠ 方案基准 `0.2.1-alpha.2`，
与本刀无关）；`check-doc-links` / `check-no-public-ip` / `aggregate:check` 全绿。

**还没做的**：
- 没做「常量抑制」（选项 B）：当前列表里所有行都相同的标签仍会在每行的 `＋N` 里出现，只是不再
  逐行画。要按「这一页是不是恒定」动态收，是下一轮的事。
- 浮层是视口坐标（fixed）：宿主若把卡片放进一个**带 transform 的祖先**里，fixed 会相对那个祖先
  而不是视口——真机上当前没有这种祖先，但换宿主版本要复核这一点。
- 没有「按标签值复制」；`raw` 仍只在悬停里。

### 面板第十刀：字段侧栏 + 列集 + 行详情（2026-10-17）

维护者看完「还差 Kibana 核心能力」的逐项对照后，点名先做 **1（字段侧栏）与 2（列集 + 行展开）**。
两件都是 design.md §9.3 的 #1 / #2，共同前提是**零契约改动**：`/fields`、`lines[].labels`、`lines[].raw`
早就随响应回来，缺的只是把它们摆出来。

| 判据 | 落点 |
|---|---|
| 侧栏三分区**互斥**：命中优先；冲突单独一区、不进「其余」 | `pure.js` 的 `fieldSections` |
| 命中区只数**这一页**（按行数降序、同数按名字），空值不算 | `pure.js` 的 `pageFieldUsage` |
| **只有命中区能加列**：列值来自 `line.labels[field]`，其余字段没有逐行值 | 侧栏 `columnable` 只在 hit 分区为真 |
| 列集上限 4；同一入口加/去；不可变返回 | `pure.js` 的 `columnToggle`（`RESULT_COLUMN_MAX`） |
| 缺值画 `—` 并在悬停说明「这一行没有这个字段」，**不造假值** | `pure.js` 的 `columnValue`；`.ll_resultCell` |
| 有列时行用**固定列宽模板**（正文 198px 下限），宽了横向滚动；0 列仍是原 flex 行 | `pure.js` 的 `resultColumnsTemplate`；`.ll_resultsWide` |
| 行详情：全部标签 + 原文；原文 > 2 万字符截断并报原长 | `pure.js` 的 `rawPreview`（`RAW_PREVIEW_MAX`）；`allRowLabels` |
| 一次只展开一行；重查（换一整份结果）时自动收起；翻页（追加）不收起 | `expandedId` 状态；`runQuery` 里 `if (!append) setExpandedId(undefined)` |
| 字段清单**查询成功后自动拉一次**（同来源缓存、失败不写缓存、只落在侧栏） | 新 effect + `fieldFetchNeeded`；`fieldsError` |
| 「筛」= 就地填值 → 走**同一个** `drillDown`（加结构化筛选并立刻重查）；空值不发 | `confirmFieldComposer` + `filterProblem` |
| 字段名**在点处折行**（176px 侧栏一行只放得下 12 字符，硬切会把 `container.*` 全截成同一前缀） | `.ll_fieldName` 两行 + 每段后的 `<wbr>` |
| 长清单不引虚拟滚动：子串过滤 + 分区内滚动 + 「共 N 个」 | `fieldSections` 的 `filterText` + `FIELD_LIST_MAX` |

**用例**：`client-pure.test.ts` **+18**（字段使用计数 / 三分区互斥 / 冲突标记随行 / 子串过滤 / preferred 排序 /
空清单仍给命中区 / 列加去与上限 / 列值缺值 / 原文截断与边界 / 列宽模板 0 列与 4 列上限）；
`client-smoke` **+10**（三分区与动作可见性 / 加列与去列、缺值 `—` / 上限与提示 / 「筛」填值后的请求体 /
行详情全部标签与原文 / 超长原文截断提示 / 侧栏过滤 / 自动拉一次且不重拉 / 拉不到只落侧栏 /
重查收起展开态）。

**反例（拆掉判据必须变红，逐条实跑过）**——**12 条**：

| 拆法 | 变红的用例 |
|---|---|
| 侧栏过滤词不传给 `fieldSections` | smoke：过滤框收窄 |
| 不自动拉字段清单 | smoke：自动拉一次 |
| 自动拉不判缓存（每次查询都拉） | smoke：自动拉一次 |
| 列值恒 `undefined` | smoke：加列 |
| 上限判断去掉 | pure + smoke：上限 |
| 缺值不给 `—`（给空串） | smoke：加列 |
| `rawPreview` 不截断 | pure + smoke：原文截断 |
| 冲突标记不随行 | pure + smoke：三分区 |
| 重查不收拾展开态 | smoke：重查收起 |
| 列宽模板正文下限改成 `0px` | pure：列宽模板 + smoke：加列 |

**真机验收（test-logs profile @ 3085，真 ES；内网地址不入库）**：

| 步骤 | 读数 | 结论 |
|---|---|---|
| 1 小时窗查询 | 100 行；侧栏「本页命中 30～36」「类型冲突 1」「其余可用字段 55～62」（同一来源共 92 字段） | PASS |
| 网络 | `/query` 后自动打一次 `/fields`；同一来源再点「查询」**不再打** | PASS（缓存生效） |
| 点 `host.name` 的「列」 | 芯片 `host.name×`；每行多一格 `38ed559669df`；再点同一颗去掉 | PASS |
| 列宽（detail 页 740px 主栏） | 1 列：`740/740` 不横滚、正文 198px；2 列：`836/740`（横滚 96px）；4 列：`1044/740`、正文**仍是 198px**（改前 flex 会把正文挤成 0 宽、行高 1176px） | PASS |
| 「筛」填值 | 芯片 `container.name = app-svc-1`；请求体 `filters: {"container.name":"app-svc-1"}`；命中数随窗口刷新 | PASS |
| 行详情 | 20 个标签（宿主上限）+ 原文 1698 字符；无截断提示 | PASS |
| 展开互斥 / 重查收起 | 开第二行时第一行收起；重查后详情消失 | PASS |
| 侧栏字段名 | `container.image.name` 在点处折成两行，前缀可区分 | PASS（观感项，无自动守卫） |

**门槛**：本包单测 **386 条**（原 368；`client-pure.test.ts` 133）；`client-smoke` **61/61**（原 51）；
`client-lint` 通过（样式变量 184 / 自定义属性 193 / 中性边框 17 处全 0.5px / 字号 50 处配对）；
`check-i18n` 本包 **160 条键**；全仓 `pnpm typecheck && build && aggregate` 绿，`test` **2944 / 2946**——
红的 2 条仍是 `scripts/test/os-consent-scope.test.ts` 的 DSH 升级绊线（与本刀无关）；
`check-doc-links` / `check-no-public-ip` / `aggregate:check` 全绿。

**还没做的（如实记下）**：
- 列集 / 侧栏过滤词**不跨会话记忆**（design.md §9.3 #9 的 localStorage 属 P8-丙）。
- 没有表头（列名靠芯片行 + 每格悬停）；按本页排序（#8）、筛选 mute（#3）、绝对时间与自动刷新（#4/#5）
  仍属 P8-丙。
- 横向滚动条是浏览器自带的（macOS 上悬停才显形），另外给了一句「列多时可左右滚动」。
- 4 列上限是给 740px 主栏定的；换到更窄的容器里正文仍保 198px，靠横滚消化。

### 面板第十一刀：可读性收口（2026-10-17）

维护者看了第十刀之后的截图：「现在体验一般优化一下」。截图里最扎眼的三件事，逐条量过再改：

| 症状（截图 / 真机读数） | 判据 |
|---|---|
| **一屏只有 3 行**：SQL / 堆栈原样铺开，单行 74～200px；结果区 420px 被两三行占满 | 先试了「默认 clamp 3 行」，维护者反馈**之前的完整模式看日志更方便**——改成**默认完整**（正文全展开），元信息行给「紧凑 / 完整」开关（紧凑才 clamp 3 行，选择记 `localStorage`）；完整消息同时进展开的详情（「消息」块）；**整行可点**展开/收起（行里的按钮除外） |
| **所有级别都染成告警橙**：满屏 `debug` 也像告警（`.ll_resultLevel` 写死 `state-warn-primary`） | `pure.js` 的 `levelTone`：error/fatal 红、warn 橙、info 次要前景、debug/trace/无级别灰；UI 类名按档拼（首字母大写，拼成小写就一条样式都不生效） |
| **身份标签被切成 `app-svc-…`**：`container.name` 前缀 + 值挤在 220px 里 | 行上标签**只显示值**（字段名在行悬停 / ＋N 浮层 / 字段栏里）；真机 136px 放下全值，正文从 305px 回到 389px |
| 常驻两句提示（“面板直查当前来源…”“行详情里可能有敏感字段…”） | 前者只在**还没有结果**时出现；后者只进**展开的详情**（真的看到原文的地方） |
| **字段栏一直占着 176px**：维护者指图「这个有点占地方，用着也不方便」 | 字段栏**默认收起**，元信息行加「字段」开关；收起时退回单列（结果表 928px 整宽、正文 577px），**也不打 `/fields`**；展开时才拉一次（同来源缓存）。**（第十二刀：展开也不再占一栏，改成浮层）** |
| 侧栏每行都有描边按钮 + 底部三行说明 | 列/筛按钮平时低对比、行悬停或聚焦才描边；底下一句改成单行省略（完整句子进 `title`） |
| 密排之后行与行糊在一起 | 行间一条 `0.5px` 发丝分隔线 |

**用例**：`client-pure.test.ts` **+1**（`levelTone` 六档 + 大小写/空格/垃圾入参）；`client-smoke` **+3**
（整行可点：点普通区域展开、点按钮不展开、再点收起；级别染色：debug 灰 / error 红，且类名大小写对得上 CSS；
显示密度：默认完整、点「紧凑」才 clamp、再点切回）。另改写 2 条既有断言（身份标签只剩值、敏感提示只在详情里）。

**反例（拆掉判据必须变红，逐条实跑过）**——**5 条**：

| 拆法 | 变红的用例 |
|---|---|
| 行 onClick 拆掉 | smoke：整行可点 |
| 行 onClick 不挡按钮（closest('button') 判据拆掉） | smoke：整行可点 |
| `levelTone` 把 error 也回 muted | pure + smoke：级别染色 |
| 类名拼成小写（`ll_resultLevelmuted`） | smoke：级别染色 |
| 行上标签改回「键 + 值」 | smoke：身份标签（改断言时实跑过一次：2 条红） |
| 「紧凑」开关不切类名（永远完整） | smoke：显示密度 |
| 字段栏默认展开（回到常驻） | smoke：字段栏默认收起 |

**真机验收（test-logs profile @ 3085，真 ES）**：

| 读数 | 改后 |
|---|---|
| 行高 | 默认完整：这条 4 行消息 79px（长 SQL 仍是原高）；切紧凑：61px（clamp 3 行） |
| 字段栏收起 / 展开 | 收起：结果区 **928px**、正文 **577px**、`/fields` 0 枪；展开：740px / 389px、`/fields` 1 枪；再收起不重拉 |
| 密度开关 | 点「紧凑」→ `ll_resultMsgCompact` + `localStorage.loglens.density='compact'`；点「完整」→ 去掉类名、存 `'full'`；默认无值时按完整 |
| 身份标签 | `app-svc-1` 全值，136px；悬停 `按 container.name = … 加一条筛选` |
| 正文列 | 389px（标签只留值之后从 305px 回来） |
| 级别 | `debug` → `ll_resultLevelMuted`、`error` → `ll_resultLevelError`、`info` → `ll_resultLevelInfo` |
| 行分隔 | 每行 `0.5px` 底边（计算值 1px @DPR2） |
| 展开 | 点行 → 详情（消息 / 全部标签 / 原文 / 敏感提示）；重查收起 |

**门槛**：本包单测 **387 条**（原 386；`client-pure.test.ts` 135）；`client-smoke` **65/65**（原 61）；
`client-lint` 通过（样式变量 193 / 自定义属性 203 / 中性边框 17 处全 0.5px / 字号 51 处配对）；
`check-i18n` 本包 **166 条键**（+`panel.message` / `btn.density*` / `hint.density` / `btn.fields` / `hint.fieldsToggle`）；全仓 `typecheck && build && aggregate` 绿，
`test` **2945 / 2947**——红的 2 条仍是 `scripts/test/os-consent-scope.test.ts` 的 DSH 升级绊线（与本刀无关）；
`check-doc-links` / `check-no-public-ip` / `docs-index` / `aggregate:check` 全绿。

**还没做的**：紧凑模式的 3 行是拍定的（没有「显示行数」设置）；行点开的详情在 `.ll_results` 420px
的滚动区里，展开后要往下滚才看得全（详情本身 1000px+）；密度选择只记在本机浏览器（不写 profile 配置）。

### 面板第十二刀：字段面板挪出布局（浮层，2026-10-17）

维护者对着第十一刀之后的截图（窄窗，字段栏把结果区左侧切成一条）只说了一句：「这个挪走吧，太占地方了」。
第十一刀的「默认收起」只解决了**不看**的时候；一旦点开，它仍然在布局里吃一列——这一刀把它整个挪出布局。

| 症状（真机读数） | 判据 |
|---|---|
| 面板在布局里占一列：点开就把结果区 928px 挤到 740px、正文 577 → 389px（第十一刀读数） | 改成**浮层**：`position:absolute` 浮在结果上（`top:0;bottom:0;left:0`、宽 300px、`max-width:100%`），`.ll_main` 永远整行宽度；浮层高度跟着结果区走，列表自己滚 |
| 浮层浮上去之后怎么收起 | 加一层透明遮罩 `.ll_fieldScrim`（`inset:0;z-index:99`）：点结果上任何地方先收起浮层（一次点击=一件事）；再点「字段」也收起；浮层 `z-index:100` 在遮罩之上 |
| 定高的盒子里头 / 过滤框 / 脚注被 flex 压扁（真机量到脚注 **2px**、过滤框 **17px**，只有列表没被压） | 头 / 过滤框 / 脚注 `flex:none`，只有列表滚；真机复测 18 / 28 / 16，列表 324 |
| 浮层要是再来一圈中性描边 + 投影，就是双线 | 取宿主菜单配方（与字段候选 / 标签浮层同一套）：`border:0` + `--dsw-elevation-stroke-color` + `box-shadow:var(--dsw-elevation-prominent)`——中性 border 不许配投影，`client-style-spec` 会拒 |

**用例**：`client-smoke` 里那条改写（原来断言「点开=两栏、再点=收起」）：默认既没有 `.ll_fields` 也没有遮罩、
`/fields` 0 枪；点「字段」后浮层 + 遮罩都在、`/fields` 1 枪；**收起 / 展开两态下结果区的壳是同一个 class**
（`ll_workbench`，不存在「两栏 / 单列」两套布局，这是浮层的结构判据）；点遮罩收起；再点「字段」还能打开且
不重拉字段清单。纯模块用例不变（浮层只动 CSS 与 DOM 形状，判据仍在 `fieldSections` / `resultColumnsTemplate`）。

**反例（拆掉判据必须变红，逐条实跑过）**——**2 条**：

| 拆法 | 变红的用例 |
|---|---|
| 浮层仍两栏（把 `renderFieldsAside` 放回 `.ll_workbench` 的 grid 列里 / 恢复 `ll_workbenchClosed` 两套 class） | smoke：字段面板（「两态同一个壳」断言） |
| 遮罩拆掉（只剩「字段」按钮能关） | smoke：字段面板（点面板外收起那一段，`ll_fieldScrim` 找不到） |

**真机验收（test-logs profile @ 3085，真 ES，100 行）**：

| 读数 | 收起 | 展开（浮层） |
|---|---|---|
| 结果区 / `.ll_main` 宽 | 928px | **928px**（不缩） |
| 正文宽 | 577px | **577px** |
| 浮层 | 不存在、无遮罩 | 300×420，`position:absolute`、`z-index:100`、`border-width:0`、elevation 投影 |
| `/fields` | 0 枪 | 1 枪（再收起 / 再打开不重拉） |
| 浮层内部 | — | 头 18 / 过滤框 28 / 列表 324（滚 2700）/ 脚注 16，92 个字段 |
| 点面板外 | — | 收起，结果区仍 928px，不多打 `/fields` |
| 浮层开着点日志行 | — | 只收起浮层，**不**顺手展开那一行（再点行才展开） |
| 浮层里点「列」 | — | 芯片 `agent.name ×` 出现、100 个值单元格，浮层不关 |

**门槛**：本包单测 **387 条**（不变）；`client-smoke` **65/65**；`client-lint` 通过（中性边框 16 处全 0.5px、
浮层走 elevation 配方）；`check-i18n` 本包 **166 条键**（没有新键，只改了 `hint.fieldsSidebar` / `hint.fieldsToggle` 的正文）；
全仓 `typecheck && build && aggregate` 绿，`test` **2945 / 2947**（红的 2 条仍是 os-consent 绊线）；
`check-doc-links` / `check-no-public-ip` / `docs-index` / `aggregate:check` 全绿。

**还没做的**：浮层没有 `Esc` 出口（面板本身不可聚焦，关闭靠遮罩与「字段」按钮）；浮层盖住的是结果区
**左边**那 300px（时间 / 级别 / 正文开头），窄窗下占比会更大——真要贴着右边或做成抽屉，等下一次反馈。

### 面板第十三刀：可读性第二刀（分布可读 + 本页排序 + 高度自适应，2026-10-17）

维护者第二次提「优化一下 loglens es 的 ui 和交互」（要求用 test-logs @ 3085 验）。这次先在真机上把
**读数**量下来再改——四条症状，每条都有数：

| 症状（3085 真机读数，1440×900，真 ES「一」，1 小时窗 61 根柱 / 100 行） | 判据 |
|---|---|
| **时间分布只是一片鬼影**：柱子取 `--dsw-alias-interactive-bg-hover` = `#2631480f`（6% 近黑），一整张图看不出哪段量多 | 分布是**数据可视化**，不是控件选中态：柱子改取 `--dsw-alias-state-business-tertiary`（真机计算值 `rgb(228, 237, 253)`），hover / 放大仍用 `state-business-primary` |
| **图上没有一个时间点**：最高的那根是哪一分钟只能数（从左端数第 N 根 × 1 分钟） | 新增横轴刻度：`histogramAxis`（首尾各一格 + 中间按窗口等分并**吸附到柱网格**，最多 4 格）；时刻精度按窗口跨度选（`formatTickTime`：≤2min 到秒 / <12h 时分 / 更长带日期） |
| **一屏只有 7 行**：`max-height:420px` 是死数，900px 高的窗口里 100 行只露 7 行（平均行高 61px），下面还要挤分布与「字段 / 紧凑 / 清空」 | 结果区改**视口相对**：`max-height:min(640px,70vh)` + `min-height:240px`。真机 900px 窗口：420 → **630px**，可见行 7 → **11** |
| **找不到「这一页里的 error」**：宿主只给时间倒序，100 行里翻 error 只能靠眼睛 | 元信息行加「排序」入口（三档循环：时间 / 级别 / 正文），判据在 `sortLines`。**只排这一页**——入口的悬停说明自己先写着这句（设计 §9.3 #8 的边界） |

**顺带修掉的一个真机缺陷**：`.ll_query` 是列向 flex，子项默认 `stretch`，「下一页」那颗按钮被拉成
**整行 928px**（比结果表还宽）。判据是 `align-items:flex-start` + 子项 `width:100%`，只有
`.ll_query>.ll_btnGhost` 例外（`align-self:center;width:auto`）。真机复测：928 → **58px**。

**用例**：`client-pure.test.ts` **+12**（`histogramAxis` 的等距 / 吸附 / 一致性与四种畸形输入、
`formatTickTime` 三档与边界、`sortLines` 三档 + **不改入参** + 同值稳定 + 档位收口）；`client-smoke` **+3**（三档循环与「不重查」、排序不动行数与结果壳、
横轴四格 + 首尾对齐 + 中间按比例）。

**反例（拆掉判据必须变红，逐条实跑过）**——**4 条**：

| 拆法 | 变红的用例 |
|---|---|
| `histogramAxis` 的吸附 `round` → `floor`（回到「从整点起走 N 根柱」的味道） | pure：等距且吸附在柱网格上 |
| `histogramAxis` 的末格改成最后一根柱的起点（不是窗口右端） | pure：首尾各一个刻度 / 窗口越长刻度越稀（4 条红） |
| `sortLines` 的 `LEVEL_RANK` 里无级别不垫底（改成 -1 排最前） | pure：level 从重到轻、无级别垫底 |
| 悬停说明的 `{order}` 塞回 `sortLabel`（「排序：时间」整句） | smoke：横轴 + 排序入口那句（拼出「排序：排序：时间」） |

> 另有两条**看着像反例、实测却不变红**的，如实记下来免得下一个人当成已覆盖：`sortLines` 不拷贝入参
> （排序本来就走 `indexed` 中间数组，原数组不会被写；用例因此改成断言「回新数组 + 入参内容不动」）、
> 拆掉 `left.index - right.index` 兜底（V8 的 `sort` 自 ES2019 起稳定）。后者仍保留显式下标——判据不赌
> 运行时的实现。

**真机验收（test-logs profile @ 3085，真 ES「一」，100 行 / 61 根柱）**：

| 读数 | 改前 | 改后 |
|---|---|---|
| 柱子底色 | `rgba(38,49,72,0.06)` | **`rgb(228, 237, 253)`** |
| 横轴刻度 | 无 | **4 格**：17:30 / 17:50（32.8%）/ 18:11（67.2%）/ 18:31 |
| 结果区高 / 可见行 | 420px / 7 行 | **630px / 11 行**（`max-height` 计算值 630px = min(640, 70vh)） |
| 排序：时间 → 级别 | — | 首 6 行级别 `debug,debug,…` → **`error,error,warn,warn,warn,info`**；再循环回「时间」与改前**逐行相同** |
| 排序是否重查 | — | `/query` 仍是 **1 枪**（三档循环全程不重查） |
| 「下一页」宽 | 928px（整行） | **58px**，`align-self:center` |
| 排序提示 | — | 「本页排序：时间。…只重排**已返回的这一页**」（第一版写成「排序：排序：时间」，真机抓到后拆了 `sortNameKey`） |

**门槛**：本包单测 **402 条**（`client-pure.test.ts` 149）；`client-smoke` **68/68**；`client-lint` 通过
（样式变量 196 / 自定义属性 205 / 中性边框 16 处全 0.5px / 排版 52 处配对）；`check-i18n` 本包 **173 条键**
（+7：`btn.sortTime|Level|Message`、`sort.time|level|message`、`hint.sort`）；全仓 `typecheck && build && aggregate` 绿，
`test` **2959 / 2961**——红的 2 条仍是 `scripts/test/os-consent-scope.test.ts` 的 DSH 版本绊线（与本次改动无关）。

**还没做的**：排序**只管这一页**（服务端排序要动 `NormalizedQuery`，属 P8-丁，进先问清单）；横轴刻度是
「窗口等分 + 吸附」，不是真按每根柱子的量挑位置（真正的柱状图轴要画在柱边界上，这版是**标签**层）；
结果区高度只对窗口高度响应，窗口再高也不超过 640px——要不要让用户拖，等下一次反馈。

### 面板第十四刀：级别下拉的标签收短（`warn+`，2026-10-17）

维护者贴了一张级别下拉的截图，一句话：「可以简化描述：比如 warn+ / error+」。

截图里就是问题本身：七项里有五项都拖着「及以上」四个字（`trace 及以上` / `debug 及以上` / …），
一列下拉读下去全是同一个尾巴，级别名反而成了配角；这一格最窄只有 **96px**（`.ll_queryGrid` 第四列
`minmax(96px,120px)`），`debug 及以上` 已经把它撑到接近满格。

| 项 | 改前 | 改后 |
|---|---|---|
| 不限那一项 | `不限级别` | **`不限`**（那一格本身就叫「级别」，title 里也有 `级别`） |
| 六档 | `trace 及以上` … `error 及以上` | **`trace+` / `debug+` / `info+` / `warn+` / `error+` / `fatal`** |
| 边界说明 | 「级别是在『返回的这一页』上筛的…」 | 「级别按**「及以上」筛（下拉里的 warn+ 就是 warn 及以上）**，且是在『返回的这一页』上筛的…」 |

**判据（为什么可以这样缩）**：`+` 是日志查看器里通行的记号，而且**完整语义没有丢**——`hint.levelPaged`
那句（只在真的筛过级别时出现）自己写着 `warn+ 就是 warn 及以上`。标签缩短、判据不动：载荷里传的仍是
`level: 'warn'`（宿主语义本就是「及以上」），`querySignature` / 页内筛那句的在场条件一个字都没改。

**用例**：`client-smoke` **+1**（`级别下拉的文案短到放得进那一格`：七项逐字断言 + 每项 ≤ 4 个汉字宽），
另有 3 条既有断言改了匹配串（边界说明的判据从「级别是在」改成「是在『返回的这一页』上筛的」，
并在「真的筛过」那条上补了一句「必须把 `+` 讲清」）。

**反例**：把六档改回「… 及以上」→ 新的那条冒烟用例变红（`debug 及以上` = 7 个汉字宽 > 预算 4）；
把 `hint.levelPaged` 里「warn+ 就是 warn 及以上」那半句删掉 → 同一用例的第二条断言变红。

**真机验收（test-logs profile @ 3085）**：下拉七项读作
`不限 / trace+ / debug+ / info+ / warn+ / error+ / fatal`，控件宽 **120px**，没有一项被原生箭头截断。

**门槛**：本包单测 **402 条**（不变）；`client-smoke` **69/69**；`client-lint` 通过；`check-i18n` 本包
**173 条键**（键集不变，只改正文）；`typecheck` / `build` / `aggregate` 绿。

### 面板第十五刀：布局重排（2026-10-17）

维护者贴了 816×782 的整页截图，一句话：「目前布局需要优化一下，现在体验不是很好」。

量了那一屏才看清问题不是观感，是**比例**：面板总高 **1055px**，视口只有 **782px**——一屏装不下
「查询 + 结果 + 分布」，而其中最占地方的一块恰恰是查日志时几乎不动的**来源配置**。

| 区块 | 改前 | 占比 | 改后 |
|---|---|---|---|
| 来源配置（标题 + 3 行说明 + 新增 + 表头 + 2 行表单） | ~300px | 28% | **收起成一行**（摘要 + 折叠把手），展开才铺开 |
| 查询区（标题 + 主行 + 分组行） | 100px | 10% | **两行**，查询串 160px → **473px** |
| 元信息行 | **102px**（三行） | 10% | **28px**（短句 + 按钮）+ 长句另一层 |
| 结果区 | 240px | 23% | **563px**（下限 240→300、上限 640→720） |
| 时间分布 | 136px（在 `outcome` 那张结果**下面**） | 13% | 136px，挪到结果**上面** |
| 面板总高 | **1055px** | — | **1000px**（展开）/ 收起那次实测 1296→1000 |

四处改动，每处都对着一个具体读数：

1. **来源配置可折叠**：插件整页默认收起、设置卡默认展开（`sourcesOpen` 的初值 = `!pageView`）——
   两页的主任务不同，默认值就不该一样。收起态**不渲染**那几行（不是 `display:none`：`display:none`
   的内容留在无障碍树里，读屏还在念一个看不见的表单）。标题行右侧补一句摘要 `2 个来源 · 当前 一`：
   收起之后那是唯一能看出「还查不查得动」的地方。
2. **查询区两行**：主行 = 来源 · 查询串 · 查询；第二行 = 时间窗 · 级别 · 条数 · 分组字段 · 分组。
   分组原本自成一行、模板 `minmax(180px,2fr) auto minmax(0,1fr)`，第三列留着放「一句回话」而实际上
   什么都没有——真机量到那一片**永远空着 ~300px**。合并后空列消失，还省掉一整行。
3. **元信息两层**：`.ll_queryMeta`（计数 · 截断 · 四颗按钮，中间一颗 `flex:1` 弹簧）与
   `.ll_queryNote`（`outcome.hint` + `outcome.warnings`，一句一行）。改前它们同在一个 `flex-wrap`
   行里，宿主那句 90 字的级别 warning 独占一行、按钮被推到第三行——这就是那 102px 的来源。
   `warnings` **一个字都没删**（agent 工具看得到的东西面板也得看得到），只是换了住处。
4. **图挪到结果上面**：先看趋势、再看行（Kibana 同一顺序）。之前它在 `lines.length > 0` 那张结果
   之后，100 行日志把它推到两屏开外——「最高的那根是哪一分钟」这件事得先滚过 100 行才知道。

**守卫（`client-smoke` +4，73/73）**：

| 用例 | 守的是 |
|---|---|
| 来源配置收得起来：插件整页默认收起、点一下铺开、再点收起 | 默认值按页面分 + 收起时**真的不渲染** |
| 设置卡默认展开来源配置 | 与上一条相反的默认值（两页主任务不同） |
| 图在结果上面：`['hist', 'results', 'next']` | 深度优先顺序 = 屏幕顺序 |
| 元信息分两层：长句在 `ll_queryNote`、按钮在 `ll_queryMeta` | 按钮不被散文推走 + 弹簧在场 |

**反例（三条都实跑过，都变红）**：

| 改回什么 | 哪条红 |
|---|---|
| `sourcesOpen` 初值写回 `true`（插件页也默认展开） | 「插件整页默认收起」 |
| 把图挪回结果下面 | 「图在结果上面」 |
| 长句塞回 `.ll_queryMeta`、删掉 `.ll_queryNote` | 「元信息分两层」 |

> 写这几条时踩到的两个坑，记下来：① `client-smoke` 读的是**构建产物** `client.js`，改了
> `client-src/` 不重建就跑，反例根本不会红（第一次就是这样假绿的）；② 断言里把游标字段写成
> `cursor` 而不是 `nextCursor` 不会报错——只是「下一页」永远不出现，那条断言从此空转。

**真机验收（test-logs profile @ 3085，真 ES「一」，100 行 / 61 根柱，816×782）**：

| 读数 | 改前 | 改后 |
|---|---|---|
| 查询串输入框宽 | 160px | **473px** |
| `.ll_queryMeta` 高 | **102px**（三行） | **28px**（一行） |
| `.ll_results` 高 | 240px | **563px** |
| 来源摘要 | 无 | 「**2 个来源 · 当前 一**」 |
| 折叠把手 | 无 | `aria-expanded=false` → 点开 `true` → 再点回 `false`；面板 1296px ↔ **1000px** |
| 首屏内容 | 查询区 + 元信息 3 行 + 2 行结果 | 查询两行 + 元信息一行 + **整张时间分布** + 4 行结果 |

**门槛**：`client-smoke` **73/73**（+4）；`client-pure` 单测 **402 条**（不变，本次没动 `pure.js`）；
`client-lint` 通过（样式变量 204 / 自定义属性 213 / 中性边框 16 处全 0.5px / 圆角 28 处 / 按钮族 6 类 /
排版 55 处）；`check-i18n` 本包 **180 条键**（+7：`btn.sourcesShow|sourcesHide`、
`hint.sourcesExpand|sourcesCollapse`、`list.emptyShort`、`meta.sourceCount|sourceActive`）；
`typecheck` / `build` / `aggregate` / `doc-links` 绿；全仓 `test` **2960 / 2962**——红的 2 条仍是
`scripts/test/os-consent-scope.test.ts` 的 DSH 版本绊线（本机 `0.2.1-rc.1` vs 台账 `alpha.2`，与本次无关）。

**还没做的**：① 结果区高度仍只对**视口**响应，用户不能拖（要 drag 得先有「记住的高度」这件状态，
与 `localStorage` 里那两项偏好同一族）；② 宽屏（≥1200px）两侧仍是空白，没做双栏（左结果 / 右图）；
③ 收起态没有记住选择——每次进插件页都是收起，设置卡都是展开（按页面分是刻意的，但「我上次展开过」
没被记住）。

### 面板第十六刀：直方图（2026-10-17）

维护者贴了两张图，一句话：「柱状图也要优化一下」。第二张是放大图，一眼能看出三个问题：
**原生 tooltip 的灰框正压在横轴刻度上**（`18:28:00.000 · 429 条` 盖住 `18:27`）、**时刻带毫秒**
（1 分钟一档的桶，每一根都是 `:00.000`）、以及**标题写着「峰值 681 条」而图上那根没有任何记号**
（681 与常态 460 只差 1.47 倍，61 根里肉眼挑不出来）。

量了一下才发现第四个、也是最要紧的一个：那不是「三个小毛病」，是**这张图根本没在表达差异**。

| 读数（真机，100 行 / 61 根柱 / 1 小时窗） | 改前 | 改后 |
|---|---|---|
| 柱子高度的分布（相对峰值的百分比分档） | **50 根挤在 60~70% 这一档**（另 6 根 40 档、3 根 50 档） | 10 / 30 / 40 / 50 四档铺开（`min/max = 7.74` 那批走线性，`2.45` 那批走裁剪） |
| 柱子上的原生 `title` | `18:28:00.000 · 429 条` | **拆掉**（改 `aria-label`，完整句子给读屏） |
| 读数（条数 / 占比） | 只有 tooltip，悬停才出现、位置跟着鼠标 | **常驻一行读数条**：`峰值在 19:00 · 681 条 · 占 3%`，悬停换成那一根 |
| 峰值那一根 | 无记号（图上找不出来） | `ll_histBarPeak` 主档强调色，**只有一根** |
| 悬停时的动作提示 | 混在 tooltip 里 | 读数条末尾（「点一下放大到这一段」/「再点一次取消」） |

**四处改动**：

1. **读数条**（`ll_histReadout`）：图上方常驻一行，三格 = 时刻 · 条数 · 占全窗比例。不悬停时说峰值
   那一段，悬停哪一根就说哪一根。时刻按**分桶宽度**选精度（`histogramBucketClock`：桶 ≥ 1 分钟不写秒）。
   高度固定 18px——鼠标进出时下面的横轴不跳。
2. **拆掉原生 tooltip**：它有三个不可控的地方（盖住横轴、约 1 秒才出、内容与读数条重复）。完整句子
   进 `aria-label`（读屏用户没有读数条可看，那里是唯一的完整句子），「点下去做什么」搬进读数条。
3. **峰值记号**：`histogramPeakTs` 挑出峰值那根（并列取第一根），柱子用主档强调色。
   **刻意没有在图上浮一块「峰值」文字**——第一版写了，截图里立刻看出它盖住自己那根柱子与下面的横轴；
   「哪一根是峰值」靠最深的那条 + 读数条那句「峰值在 18:36」两处合起来指认，不靠遮罩。
4. **基线裁剪**（`histogramScale`）：真机 61 根里 50 根落在 60~70% 一档——线性归一化后是平带。
   现在按数据自己挑画法：`max/min ≥ 3` 走 `linear`（诚实、好读），`< 3` 走 `clipped`（从 `min × 0.9`
   起画，把差异拉开），全一样走 `flat`（不裁剪也不解释）。裁剪**必须**明说——柱高不再与条数成正比，
   不说就是把差异读成倍数。

**守卫（`client-smoke` +6，79/79；`client-pure` +7，163 条）**：

| 用例 | 守的是 |
|---|---|
| 读数条常驻 / 悬停跟着换 / 移开复原 | 它不是一个装饰 |
| 悬停里不带毫秒（逐根断言 `/\.\d{3}/`） | 1 分钟一档的桶不该标到毫秒 |
| 峰值恰好一根、且挂在真的最高那根上 | 挑峰值的判据（不是随手挑一根） |
| 一条数据都没有时不画峰值记号 | 不指一个不存在的最忙时段 |
| 平带数据 → 裁剪 + 必说「柱高不与条数成正比」+ 指出读准数的办法 | 裁剪的代价必须付出来 |
| 差得够开 → 走线性、**不写**那句说明 | 没发生的事不用解释 |
| 界面文案里不许出现 `**` | 面板不渲染 Markdown，星号会原样露出来（真机已抓到一次） |

**反例（都实跑过，都变红）**：峰值配色不挂 → 「峰值那根看得出来」红；读数条不跟悬停走 → 「读数条」红；
`histogramBucketClock` 加回 `.000` → smoke 与 pure 各红一条；去掉裁剪分支 → 「平带裁剪」红；
`flat` 也带上裁剪说明 → pure 红 5 条；说明里写回 `**` → `**` 守卫红。

> 写的时候被自己的实现坑了一次：`max === min` 与 `max / min < 3` 写在**同一个 if 里**，于是「全一样」
> 落到裁剪分支、`floor` 把 all-equal 的数据也裁了——是单测（`全一样 → flat`）先红的。判据必须分开写。

**真机验收（test-logs profile @ 3085，真 ES「一」，816×782）**：

| 读数 | 改前 | 改后 |
|---|---|---|
| 柱子 `title` | `18:28:00.000 · 429 条` | `null`（`aria-label` 给全句） |
| 读数条 | 无 | `峰值在 19:00 · 681 条 · 占 3%` |
| 悬停一根 | 原生灰框（盖住 18:27） | 读数条换 `18:57 · 457 条 · 占 2%` + 「点一下放大到这一段」 |
| 峰值记号 | 无 | 恰好 1 根，`background: rgb(65,118,230)` |
| 柱子高度分档（`min/max = 2.45` 那批） | 50/61 根挤在 60~70% | 落在 10/30/40/50 四档 |
| 裁剪说明 | 无 | 「…柱高只表示相对高低，不是与条数成正比。悬停任一根看它的实际条数。」（无星号） |

**门槛**：`client-smoke` **79/79**（+6）；`client-pure` **163 条**（+7）；`client-lint` 通过（样式变量 211 /
自定义属性 220 / 排版 56 处）；`check-i18n` 本包 **186 条键**（+6：`meta.histBucketCount`、
`meta.histPeakShare|PeakBucket|PeakValue`、`hint.zoomBarShort`、`hint.histogramClipped`；
另删掉一个没用上的 `meta.histPeakTag`）；`typecheck` / `build` / `aggregate` / `doc-links` 绿；
全仓 `test` **2974 / 2976**——红的 2 条仍是 `scripts/test/os-consent-scope.test.ts` 的 DSH 版本绊线
（本机 `0.2.1-rc.1` vs 台账 `alpha.2`，与本次无关）。

**还没做的**：① 裁剪判据的阈值（3 倍）是拍的，没有数据支撑——真机只跑过 2.45 与 7.74 两批；
② 读数条占的 18px 是**永久**的（哪怕没有悬停），窗很小时它也在；③ 柱子宽度 `flex:1` 在 500 根以上
会细到 1px（`min-width:1px` 撑着），那时该换成「按像素聚合」而不是继续画。

### 面板第十七刀：读数跟着柱子走（2026-10-17）

维护者贴了放大图，一句话：「这样看柱子信息不太好看，因为柱子和信息隔得太远了」。图里画得清楚：
读数条钉在**容器最左端**，而指着的那根柱子在**图中间**，中间空着一大段——每移一格，眼睛都要横跨
整个图去把「我指着哪根」与「它多少条」对上。

第十六刀把原生 tooltip 换成常驻读数条，解决了「灰框盖住横轴」与「毫秒噪音」，但**住错了地方**：
信息与它描述的东西不在同一列上。这一刀只改位置，不改内容。

| 项 | 改前（第十六刀） | 改后 |
|---|---|---|
| 位置 | 容器左端常驻一行 | **贴在悬停那根柱的正上方**（气泡） |
| 不悬停时 | 显示峰值那一段的摘要 | **不画**（常驻一行仍是「信息在别处」） |
| 位置怎么算 | 无（`display:flex` 从头排） | 柱序号 → `(index + 0.5) / 总数` 百分比 + `translateX(-50%)` |
| 遮不遮图例 | — | 容器 `padding-top` 4 → 24px，气泡画在容器**里面**；高度 56 → 76px 把柱子区补回去 |

**真机读数（3085，61 根柱）**：气泡中心与柱子中心**偏差 0px**；`bubbleInsideContainer: true`；
`overlapsBar: false`（气泡底 589 < 柱顶 627）；空闲时 `.ll_histReadout` 数量 **0**。

**守卫（`client-smoke` 改 2 条 / 79 仍满）**：

| 用例 | 守的是 |
|---|---|
| 悬停哪一根就**贴在哪一根上方** | 悬停后出现气泡 + `left` 是柱序号算的百分比 + 第 2 根不贴最左 |
| 换一根 → 位置跟着换 | 悬停到右边那根时 `left` 变大（不是固定值） |
| 移开 → 气泡消失 | 不回到某个常驻句子 |
| 取消放大那条：先悬停再读 | 气泡只在悬停时存在（原用例直接读常驻行） |

**反例（实跑变红）**：把 `left` 写成 `'0%'`（回到上一版行为）→「贴在哪一根上方」那条红。

> 一个被真机纠正的中间版本：气泡先写成 `bottom: calc(100% + 2px)`（浮在容器**外面**上方），
> 结果它盖住了上面那行图例（`时间分布 · 每根柱子 1m · 峰值…`）——那一行本身也是要读的。
> 现在气泡画在容器**内部**顶部，容器靠 `padding-top` 给它让位。

**门槛**：`client-smoke` **79/79**；`client-pure` **163 条**（不变，这一刀没动 pure.js）；`client-lint` 通过
（样式变量 215 / 自定义属性 224 / 中性边框 18 / 圆角 29 / 排版 56）；`check-i18n` 本包 **184 条键**
（−2：`meta.histPeakBucket` / `meta.histPeakValue` 随常驻摘要一起删掉）；`typecheck` / `build` / `doc-links` 绿；
全仓 `test` **2974 / 2976**——红的 2 条仍是 `os-consent-scope` 的 DSH 版本绊线。

**还没做的**：① 气泡在容器**最左/最右**两端会被 `max-width` 压住，还没有「自动翻到另一侧」的逻辑
（现在靠 `translateX(-50%)` + 容器留白硬扛，窄屏下最边上那根的气泡会与容器边缘贴住）；
② 气泡只在悬停/聚焦时出现，触摸设备上点一下就直接放大了，看不到读数——触屏要另想办法；
③ 柱子本身没有 hover 高亮以外的反馈（气泡已经够用，暂不加）。

### 面板第十八刀：动作按钮图标化（2026-10-17）

维护者贴了那排按钮的放大图，一句话：「这个美化一下，比如图标化，你决定」。

图里是四块**纯文字**按钮并排：`字段` `紧凑` `排序：正文` `清空结果`。三个问题都在这张图上：
① 四段不同长度的字，扫一眼分不出「哪些是开关（字段 / 紧凑）、哪些是一次性动作（清空）」；
② 「排序」那两颗字是**重复**的——它旁边的档位名已经在说排什么，而这一行还要塞另外三颗按钮；
③ 「紧凑 ↔ 完整」切换时按钮宽度会跳（2 字 → 2 字其实没跳，但「排序：正文」换档时 5 字变 5 字，
真机量到的抖动在换档那一瞬）。

| 按钮 | 改前 | 改后 | 图标（宿主原件） |
|---|---|---|---|
| 字段面板 | `字段` | `☰ 字段` | `IconFlatListOutlineRegular`（行首圆点 + 三条横线） |
| 显示密度 | `紧凑` / `完整` | `☰ 紧凑` / `☰ 完整` | `IconWrapLinesOutlineRegular`（长句折行——正是这两档在讲的事） |
| 排序 | `排序：时间` | `⇅ 时间` | `IconChevronsUpDownOutlineRegular`（上下双箭头） |
| 清空 | `清空结果` | `🗑 清空结果` | `IconTrashOutlineRegular` |

**判据（为什么不是「我画了四颗差不多意思的图标」）**：路径**逐字取自宿主自己的前端产物**
（`dsh-web-frontend/dist/assets/index-*.js`），配方也照抄：`viewBox 0 0 16 16` / `fill:none` /
`stroke:currentColor` / `strokeWidth 1`（`…Regular` 那一档就是 1）/ `strokeLinecap` **只在宿主写了的那几颗上出现**。
这与 2026-10-13 那条「图标要和官方的一致」是同一件事——当时的 chevron 就是拿宿主原件换掉自绘的。

> 选图标时被自己坑了一次：第一版把「密度」挑成 `IconCompactOutlineRegular`，抓到路径一看是
> **半圈进度环**（`opacity:0.35` 的整圆 + 一段弧），与「行密度」毫无关系——我抓错了变量（抓到的是
> 别处的 `Cv`）。改用 `IconWrapLinesOutlineRegular`（长句折行，语义正好对上「完整 / 紧凑」）。
> **教训**：拿到变量名之后要看一眼它引用的 svg 本体，不能只信名字。

**排序按钮上只剩档位名**：`排序：时间` → `时间`。「这是排序」由图标说、「排的是哪一档」由字说。
语义一个字没丢——完整那句「本页排序：时间。…只重排**已返回的这一页**」仍在 `aria-label` 与 `title` 里
（第十三刀那条边界说明的落点没动）。顺带删掉三个死键：`btn.sortTime|Level|Message` 与函数 `sortLabel`
一起退场（图标化之后没有人再读它们）。

**真机读数（3085，816×782）**：四颗都带图标（path 数 2 / 5 / 2 / 3，与各自形状一致）；
前三颗**等宽 62px**；元信息行仍是一行 **28px**、宽 663px 只用了 593px（没被挤到换行）；
「紧凑 ↔ 完整」与「时间 ↔ 级别」切换时按钮宽度**不变**（62px 进 62px 出）。

**守卫（`client-smoke` +2 → 81/81）**：

| 用例 | 守的是 |
|---|---|
| 四颗按钮都带图标，且用宿主配方 | 没有图标的不挂 `ll_btnGhostIcon`；`viewBox 16×16` / `fill:none` / `stroke:currentColor` / `strokeWidth 1` / `aria-hidden` |
| 四颗的**形状互不相同** | 同一个 path 套四遍不算图标化（`new Set(shapes).size === 4`） |
| 排序按钮上只剩档位名 | `treeText` 恰好是「时间」，而 `aria-label` 仍是「本页排序：时间」 |

**反例（都实跑变红）**：四个 `children` 改回纯文字 → 两条新用例都红；把「密度」的路径换成字段那一颗
（四颗共用同一形状）→ 「形状互不相同」红。

**门槛**：`client-smoke` **81/81**（+2）；`client-pure` **163 条**（不变，没动 pure.js）；`client-lint` 通过
（按钮族 **7** 个类——新增的 `ll_btnGhostIcon` 自动进了同族几何检查，与 ghost 族一致：H28 / padding 0 8px /
R-sm）；`check-i18n` 本包 **181 条键**（−3：`btn.sortTime|Level|Message` 删掉）；`typecheck` / `build` /
`doc-links` 绿；全仓 `test` **2974 / 2976**——红的 2 条仍是 `os-consent-scope` 的 DSH 版本绊线。

**还没做的**：① 图标是**内联 path**、不是同一份组件复用（宿主那 198 颗图标的机制我们引不进来，
浏览器半体不许 import 宿主模块）；② 没有「只有图标、没有文字」的窄屏档——窗口再窄时这四颗靠
`gap:6px` + `padding:0 8px` 撑着，还没到要收成纯图标的地步；③ 「清空结果」是四颗里唯一的破坏性动作，
现在与其余三颗同色，只有 hover 才看得出它不是开关（要不要染成 danger 色，等下一次反馈）。

### 面板第十九刀：字段侧栏的排版（2026-10-17）

维护者贴了字段面板的放大图，一句话：「字段这个要优化」。

量了那一屏（300px 面板 / 92 个字段）才看清问题不是「字太小」，是**三列互相对不齐**：

| 读数 | 改前 | 改后 |
|---|---|---|
| 行结构 | 一条 `flex` 行（名字 `flex:1` + 计数 `none` + 动作 `none`） | **三列网格** `minmax(0,1fr) auto auto` |
| 计数列宽度 | 18 / 21px 之间跳（`100` / `73` / `72` 各不同） | 固定 30px、右对齐、`tabular-nums`（五行右缘全落在 **327**） |
| 动作按钮 | **21px 透明窄条**，只在行 hover 时长出描边 | 常驻描边胶囊，**26px** 起（右缘全落在 **389**） |
| 分区标题 | 普通文本，滚下去就没了 | `position:sticky` 钉在滚动区顶部 |
| 过滤框 | 光秃秃的输入框 | 放大镜 + **有内容才出现**的 × |

**为什么三列而不是继续 flex**：flex 里三个 `flex:none` 的东西各自按内容取宽，于是计数那列
每换一个数字宽度就变一次——一列字段读下去是锯齿；而动作区被名字挤到只剩 44px 时，
两个按钮各 21px，视觉上与字段名连成一片，**看不出那是能点的东西**。改成 grid 之后三列各就各位。

**动作按钮从「hover 才可见」改成常驻**：原来 `.ll_fieldRow:hover .ll_fieldAct` 才给描边，
静止状态是一段灰字。这条判据当时是为了「少一点视觉噪音」，但代价是**入口在静止时看不见**
——90 个字段里到底哪些能加列、哪些能筛，要一个个划过去才知道。现在常驻描边（`.ll-border-l2`），
hover 时底色加深。

**过滤框加放大镜**：这是这个面板**唯一**的导航方式（92 个字段），而它原来只是一个输入框，
「这是搜索」全靠占位符。放大镜是宿主原件 `IconSearchOutlineRegular`，`pointer-events:none`（纯装饰）；
× 只在有过滤词时出现——空着时给一颗 × 反而让人以为点了会发生什么。

**守卫（`client-smoke` +3 → 84/84）**：

| 用例 | 守的是 |
|---|---|
| 字段行是三列网格：名字 / 计数 / 动作分列 | 第一格必须是名字；计数**在动作之前**（顺序写死，别让某个字段把计数挤到后面） |
| 动作按钮常驻描边 | 两个动作都在，且用 `ll_fieldAct`（不是 hover 才长出来的另一种类） |
| 过滤框带放大镜与清除 | 放大镜在、是 `aria-hidden` 的 svg；空着时**没有** ×；打字后出现，点 × 清空 |
| 分区标题是吸附的 | 标题真的画出来且带计数文案 |

**反例（都实跑变红）**：删掉放大镜 → 「过滤框」那条红；把计数挪到动作之后 → 「三列网格」那条红。

> 写守卫时被自己的选择器绊了一次：放大镜的类挂在**外层 `span`** 上（定位锚），svg 在里面，
> 直接找 `svg.ll_fieldsFilterIcon` 找不到——第一版就是这么假红的。

**真机验收（3085，816×782，92 字段 / 本页命中 35）**：五行字段的计数右缘全部 **327**、动作右缘全部
**389**（两者差 8px 是滚动条，预期内）；动作按钮 **26px**；三个分区标题 `position:sticky`；
过滤框有放大镜、右缘 397 与动作列对齐。

**门槛**：`client-smoke` **84/84**（+3）；`client-pure` **163 条**（不变）；`client-lint` 通过
（样式变量 230 / 自定义属性 239 / 中性边框 20 / 圆角 30 / 排版 57）；`check-i18n` 本包 **182 条键**
（+1：`hint.fieldFilterClear`）；`typecheck` / `build` / `aggregate` / `doc-links` 绿；
全仓 `test` **2974 / 2976**——红的 2 条仍是 `os-consent-scope` 的 DSH 版本绊线。

**还没做的**：① 面板宽度仍是写死的 300px（窄屏时它会盖住更多正文，没有「可拖 / 可收窄」）；
② 92 个字段仍靠子串过滤 + 滚动消化，没做虚拟滚动（与字段候选浮层同一条既有判据）；
③ 「列」「筛」两个动作在触屏上没有 hover 反馈，靠常驻描边撑着。

### 面板第二十刀：字段面板跟着按钮走（2026-10-17）

维护者贴了整页截图，一句话：「字段面板不应该跟着字段按钮走吗」。

图里两支红箭头把问题指得很清楚：一支指着元信息行右侧的「字段」按钮，一支指着左边结果区上的面板
——**按的是右边那颗，展开的东西出现在最左边**，中间隔着整块结果正文。

量了一下：按钮右缘 **527**，面板右缘 **405**，横向差 **123px**（面板 `left:0` 钉在结果区左端）。
这与第十七刀「读数条钉在容器左端、柱子在图中间」是同一条毛病：**能打开它的东西和它本身不在同一处**。

| 项 | 改前 | 改后 |
|---|---|---|
| 定位 | `position:absolute; top:0; bottom:0; left:0`（钉在结果区左端） | `position:fixed` + 由按钮视口坐标算 |
| 与按钮的关系 | 横向差 **123px** | 右缘对齐（差 **0px**）、顶边贴按钮下沿 **4px** |
| 高度 | `top:0;bottom:0` 撑满结果区 | `max-height:min(520px,70vh)`（它不在那一格里了，撑满会垂到屏幕底） |
| 遮罩 | `absolute; inset:0`（只铺结果区） | **`fixed; inset:0`（全屏）** |

**为什么存视口坐标而不是相对偏移**：面板与按钮不在同一个定位上下文里（按钮在元信息行、面板在
结果区里），换算相对坐标要多跨一层 ref；而「展开位置」本来就该是**点下去那一刻**的位置
——窗口滚动后按钮挪了，面板跟着挪反而会飘。与「＋N」全部标签浮层同一套路（那个也是 `fixed`）。

**遮罩必须一起改**：面板浮到元信息行那一层之后，只铺结果区的遮罩就漏掉了上面那几块——
点面板上方的空白不会收起，看着像「点外面没反应」。层级 99 < 面板 100，铺满整屏也不会挡住面板自己。

**守卫（`client-smoke` +2 → 86/86）**：

| 用例 | 守的是 |
|---|---|
| 面板贴在「字段」按钮下方展开（右缘对齐按钮） | `onClick` 收到按钮坐标 → 面板 `style.left = right - 300`、`style.top = bottom + 4` |
| 定位契约（位置由内联 style 给，不是 CSS 钉死） | 面板不再是「一个 CSS 里写死 left:0 的块」 |

**反例（实跑变红）**：把 `style` 那行删掉（回到 CSS 钉死左端）→「贴在按钮下方」那条红。

**真机验收（3085，816×782）**：按钮右缘 527 / 面板右缘 **527**（差 0）；面板顶边 524、按钮下沿 520
（间距 4px）；面板 300×520；遮罩 **816×782**（= 视口），点它面板收起。

**门槛**：`client-smoke` **86/86**（+2）；`client-pure` **163 条**（不变）；`client-lint` 通过
（样式变量 230 / 自定义属性 239 / 中性边框 20 / 圆角 30 / 排版 57）；`check-i18n` 本包 **182 条键**（不变）；
`typecheck` / `build` / `aggregate` / `doc-links` 绿；全仓 `test` **2974 / 2976**——红的 2 条仍是
`os-consent-scope` 的 DSH 版本绊线。

**还没做的**：① 窗口缩放 / 页面滚动后**不重新量**按钮位置（面板会留在原地）——要修得挂 resize / scroll
监听，代价是每次滚动都算一次；② 面板固定 300px 宽，窄屏（<640px）时它会占掉大半个视口；
③ 面板底部没有「贴到视口底就翻到上方」的逻辑（按钮离底很近时面板会被截掉一截）。

### 面板第二十一刀：字段筛选重做（2026-10-17）

维护者贴了字段面板的放大图，一句话：「字段筛选重新设计一下，现在有点难用」。

先把真机数据拉出来（`/fields`，3085 上那台 ES），问题的形状立刻就清楚了：

| 前缀 | 字段数 |
|---|---|
| **`container.labels.*`** | **58**（占 63%） |
| `host` / `host.os` | 7 / 7 |
| `agent` | 5 |
| `log.file` / `log` | 4 / 3 |
| `container` 直接子字段 | **只有 3 个** |
| 其余（`ecs` / `input` / 无前缀） | 5 |

**92 个字段里 58 个是 Docker 标签**，而它们与 `agent.name` 这种常用字段混在一条平铺的列表里；
加上行里写的是完整名，`container.labels.com_docker_compose_project_environment_file` 折成三行、
和 `stream` 这种一行的高矮不齐。过滤框是**唯一**的导航方式，而它只认一整串子串——
打 `container name` 得到 0 个结果。

三处改动，每处对着一个具体读数：

| 改动 | 改前 | 改后 |
|---|---|---|
| **分组** | 92 行平铺 | 按**父路径**分组，11 个可折叠组头（`container.labels` 那 58 个收成一组） |
| **行内文字** | 完整名（长名折 2~3 行） | **只写末段**（`architecture` / `build-date` / …），完整名在 `title` 里 |
| **过滤** | 单串子串（`container name` → 0 个） | **多词 AND**（`cont name` / `container name` 都命中） |
| **反馈** | 右上角永远报「共 92 个字段」 | 搜索时报**命中 N 个**，并自动展开全部分组 |
| **滚动高度** | ~2878px（92 行 + 3 个分区头） | **1494px**（命中区展开 + 其余 6 个折叠组头） |

**为什么按「父路径」而不是「第一段」分组**：按第一段分，`container` 仍是 61 个的一坨
（58 个是 labels）；按父路径分（`container.labels.foo` → `container.labels`），那 58 个收成**一组**，
`container` 组只剩 2 个直接子字段。组的名字就是「这批字段的共同父路径」，没有额外规则要记。
代价是 `container.image.name` 自成一组（它的父路径不是 `container`）——这条规则不认「第一段」，
写进测试钉住了。

**默认展开规则**（两条，按「这组是拿来干什么的」分）：
- 有过滤词 → **全展开**（搜索时匹配上的本来就没几行，再让人点开是多一步）；
- 无过滤词 → **命中区展开**（那是这个来源真在用的字段，多半就是你要的）、其余与冲突**折叠**
  （那是「去里面找一条」的清单，组头带计数让人挑）。

**已选列那一格**（顺手补的）：列芯片画在结果表上方那一行，而面板是**浮在它上面**的——从面板里
点了「列」，芯片正好被面板挡住，看不见自己刚加的那一列。现在面板里也摆一份同一个列集，加与去在同一处。

**守卫（`client-smoke` +4 → 90/90；`client-pure` +10 → 173 条）**：

| 用例 | 守的是 |
|---|---|
| 按**父路径**分组（组头写父路径与计数，行里只写末段） | `container.name` 显示 `name`、`log.file.path` 显示 `path`、顶层字段末段即全名；完整名仍在 `title` |
| 默认展开规则（命中展开 / 其余折叠 / 一搜索就全展开） | 折叠是**默认值**而不是「藏起来」，且搜索路径不被折叠挡住 |
| **反例（核心）**：`cont name` / `container name` 都筛得到 | 多词 AND；顺序无关；命中计数 |
| 面板里能看见并去掉已选列 | 加列之后那一格出现、× 能去掉、没有列时不占行 |
| 纯逻辑：分词 / AND / 叶子与父路径 / 分组不改项的形状 / **真机那一份分布** | 58 个 labels 收成一组、`container` 组降到 2 个 |
| **接线**：`fieldSections` 真的用了多词过滤 | 见下面那条教训 |

> **一条差点漏掉的守卫**：只说 `fieldMatches` 认多词是不够的——反例实测发现，
> 把 `fieldSections` 里的过滤**退回单串子串**时，`fieldMatches` 那几条断言**照样全绿**
> （它们直接测那个函数），面板却已经坏了。补了一条「接线」用例：拿 `fieldSections` 走一遍
> `cont name`。这类「判据写对了但没接上」的漏法，只有从**真实入口**走一遍才拦得住。

**反例（都实跑变红）**：过滤退回单串 → 5 条冒烟红（其中「`cont name` 能筛到」是核心那条）；
默认改成全展开 → 「三分区」「筛」两条红（它们先展开再断言，已经展开时点击变成收起）；
行里写回全名 → 「按父路径分组」红；去掉已选列那一格 → 「已选列」红。

**真机验收（test-logs profile @ 3085，真 ES「一」，92 字段 / 本页命中 35）**：

| 读数 | 结果 |
|---|---|
| 分组 | 16 个组头；命中区 9 组全展开、其余 6 组折叠（`container.labels` 命中 18 / 其余 39 / 冲突 1） |
| 行内文字 | `stream` / `name` / `id` / `type` / `ephemeral_id` / `version`（都是末段） |
| 过滤 `container name` | **命中 6 个**，组 `container` / `container.image` / `container.labels` |
| 过滤 `cont name` | 同上（**6 个**）——改前这一串得到 0 个 |
| 过滤 `labels` | 命中 58 个（三个 `container.labels*` 组） |
| 清空 | 回到「共 92 个字段」 |
| 滚动高度 | **1494px**（面板 520px 高） |
| 已选列 | 点「列」后出现「已选列（1）stream ×」，与结果区上方那排芯片是同一个列集 |

**门槛**：`client-smoke` **90/90**（+4）；`client-pure` **173 条**（+10）；`client-lint` 通过
（样式变量 240 / 自定义属性 250 / 中性边框 20 / 圆角 31 / 排版 60——**lint 抓到一处真实的疏漏**：
`.ll_fieldGroupChevron` 写了 `font-size:10px` 没配 `line-height`，官方字号线是 10→14）；
`check-i18n` 本包 **186 条键**（+4：`field.topLevel`、`hint.fieldGroupToggle`、
`section.columnsPicked`、`meta.fieldsMatched`）；`typecheck` / `build` / `aggregate` / `doc-links` 绿；
全仓 `test` **2984 / 2986**——红的 2 条仍是 `os-consent-scope` 的 DSH 版本绊线。

**还没做的**：① 组的展开状态**不持久化**（关掉面板再开回到默认）——与「密度 / 排序」那两项
偏好同一族，可以记进 `localStorage`；② 分组只按父路径一层，`host` 与 `host.os` 是两组
（读起来像树，但没有真正的树形缩进）；③ 过滤不支持 `*` 通配或 `-` 排除（多词 AND 够用了，
再加语法就得多教一套）；④ 已选列那一格在 4 列满员时会换行（`max-height:56px` 兜着滚动）。

## 面板第二十二刀：筛选行成为「加条件」的入口（2026-10-17）

**问题（用户原话）**：「字段选择筛选直接放在筛选栏是不是更好」，配一张筛选行的截图
（`筛选  container.name = app  ×`）。那一行当时是**只读**的——只显示已生效条件，
只在有条件时出现；而加一条条件要走四步：元信息行点「字段」→ 在 92 个字段里找 → 点「筛」→ 填值。
**条件显示在这儿，加条件的办法却在另一处**。

**做法**：

| 改动 | 判据 |
|---|---|
| 筛选行**常驻**（跑过一次查询就出现，空着时只有「筛选 ＋ 筛选」） | 入口得先存在。空态不说「当前没有筛选」——那句话是噪音；那段长说明只在真有芯片时才排 |
| 尾巴上一颗「＋ 筛选」，打开**同一个**字段面板 | 「加条件」与「看条件」在同一行。面板挂在这一行**下方**（左对齐那颗按钮），所以芯片加进来时不会被面板挡住——真机实测芯片 y=492..516、面板 y=8..488，同屏可见 |
| 两个入口共用开关，且**分得出是哪一颗** | 同一颗再点收起；换另一颗 = 换锚点、保持打开。不分的话，从筛选行按「＋ 筛选」而面板恰好在开，第一下会把它关掉 |
| 面板定位提成纯函数 `panelPlacement`（+ 单测） | 原来只有一条真机读数当判据。现在三条边界各有用例：横向对齐（左/右两种）、优先往下、**上翻**、两边都放不下时**收高度** |

**为什么不是把「过滤字段名」那个框搬上来**：它过滤的是**面板里那 92 行字段**，不是日志；
搬到常驻的筛选行，人打进去会以为在搜日志。两个「筛选」是两件事，合并会把它们变成第三件。

**真机验收（test-logs @ 3085，真 ES「一」，1 小时 26263 命中 / 100 行，816×782）**：

| 读数 | 结果 |
|---|---|
| 筛选行 | 常驻在 `y=492..514`，文字正好 `筛选 ＋ 筛选`（空态无长说明） |
| 点「＋ 筛选」 | 面板 `left=137`（**= 按钮左缘**）、`top=8`、`maxHeight=480`——上面放得下就**上翻**，`bottom=488` 停在按钮上沿（492）之上 4px，**不与按钮重叠**、整块在视口内 |
| 面板里加一条 | 点 `container.name` 的「筛」→ 填 `grafana` → 应用：芯片立刻出现在 `y=492` 那一行，面板仍开着，`chipVisible: true` |
| 从元信息那颗按下 | 面板**不关**、换锚点：`left=227`（= 按钮右缘 527 − 300，右对齐）、`top=46`、`maxHeight` 空（上下放得下 520） |
| 同一颗再点 | 面板与遮罩一起收起，两个入口的 `aria-pressed` 都回到 false |

**反例（都实跑变红）**：筛选行退回「只在有条件时出现」→ 5 条红；长说明改回常排 → 1 条红；
两个入口不分家（退化成 `setFieldsOpen(!open)`）→ 1 条红；「＋ 筛选」也按右对齐 → 3 条红；
面板退回挂在结果区里（`lines.length > 0` 那个判据）→ 「0 行也能打开」红；
两边都放不下时不收高度 → 「不与按钮重叠」红。

**顺手修掉一个死键**：结果 0 行时「字段」按钮按下去什么都不会发生——面板画在 `.ll_workbench` 里，
而那个壳的判据是 `lines.length > 0`。浮层本来就是 `fixed` 的，移到它自己那一层
（`.ll_fieldLayer{display:contents}`，不生成盒子、不占那个 `gap:12px` 的空档）之后就与有没有行无关了。

**门槛**：`client-smoke` **97/97**（+7）；`client-pure` **185 条**（+12）；`client-lint` 通过
（样式变量 252 / 自定义属性 261 / 中性边框 20 / 圆角 32 / 排版 61 / 按钮族 7）；
`check-i18n` 本包 **188 条键**（+2：`btn.addFilter`、`hint.addFilter`）；
`typecheck` / `build` / `aggregate` / `doc-links` 绿；全仓 `test` **2998 / 3000**
（含下面那条筛选修复的 +2）——红的 2 条仍是 `os-consent-scope` 的 DSH 版本绊线。

**还没做的**：① 「＋N」全部标签那个浮层是**另一套**定位实现（`openLabelPanel`，自己的夹取），
没跟着提到 `panelPlacement`——两处判据现在不一致（它只往下、只夹回视口）；② 面板宽度仍是固定值（第二十三刀改成 340px，仍不可拖）；
③ 筛选行那三截在窄屏会换行（没有专门的断点）。

## 真机发现的洞：结构化筛选的 `filters` 被 `runSearch` 丢掉（2026-10-17）

**怎么发现的**：第二十二刀的真机验收里，从面板加了一条 `container.name = grafana`，芯片出现了，
但结果**一行都没收窄**（100 行里躺着 6 个容器，`matched` 还是 26264）。换**行上标签**下钻
（我没碰过的老路）复现同样现象——不是这一刀引入的。抓请求体：`filters: {container.name: prometheus}`
确实发出去了，宿主回的 `matched` 也是未筛的 26267。

**真因**：`src/execute.ts` 的 `runSearch` 拼 `normalizeQuery` 时**没把 `input.filters` 传下去**，
而同文件的 `runFacets` 传了。于是结构化筛选只收窄了**榜与分布**，**行**永远是全量——
面板那句「行、时间分布与分组榜都跟着收窄」里第一个是假的。一起被吞掉的还有 Loki 那句
**诚实的报错**（适配器见不得 `filters` 就抛「暂不支持结构化 filters」，传不到它那儿就变成
「静默给全量」，正是那段注释自己写的最坏情况）。

**修法**：`filters: input.filters,` 一行。守卫加在 `test/query-route.test.ts`：走 **`/query` 路由**
断言桩适配器真收到了 `filters`，以及 Loki 带着 `filters` 进来会回 400（且一个字节都不发给 Loki）。
两条都实跑变红（注回旧写法 → `expected [ undefined ]` / `expected 200 to be 400`）。

**真机证据（同一份 `lib/`，直接打真实 ES，不经 GUI）**：

| 查询 | matched | 返回的 100 行 |
|---|---|---|
| 不带筛选 | 26257 | `app-svc-1` 83 / `app-svc-2` 16 / `grafana` 1 |
| `filters: {container.name: grafana}` | **178** | **grafana 100** |

**注意**：3085 上正在跑的那个宿主进程是**启动时**加载的模块，改 `lib/` 不会热更——
真机上要看到这个修复，得重载插件或重启宿主。GUI 里的读数（26264 / 6 个容器）是修复前的。

**编号**：这是一条真缺陷，该进 `DEFECTS.md`（下一个是 `D05`）。按仓库规矩，
**新增 `Dxx` 编号要先问维护者**，所以这里只留现场，等确认后再补编号与那节「所以代码为什么写成这样」。

## 面板第二十三刀：让面板**读得完**（2026-10-17）

用户第二张截图（`字段 / 共 92 个字段 / 本页命中（36）…` 那一屏）配一句「可以再优化一下」。
先按那张图上的形状量了一遍真机（816×782，真 ES「一」，100 行）：

| 量到的东西 | 读数 | 说明 |
|---|---|---|
| 名字列宽 | **160px** | 11px 等宽 ≈ 24 个字符，而 `container.labels.*` 的末段有 40+ 个字符 |
| 折行的字段 | **10 / 29** | 且都折在词中间：`com_docker_compose_conf` / `ig-hash` |
| 面板脚注 | 格子 **284px**、内容 **464px** | `nowrap + ellipsis`，句子被切在「…其余字段…」 |
| 面板宽 | 300px | 这个数在 **CSS** 与「右缘对齐」的 `panelPlacement` 里**各写了一份** |

三处一起改：

**① 断点给在分隔符上。** CSS 原来用 `overflow-wrap:anywhere`——它允许在**任何**字符处断，
浏览器于是把一行**填满**再断（这就是 `conf` / `ig-hash` 的来源）。改成 `break-word`（只有整段都放不下
才硬断），并在 `_` / `-` / `.` 之后插 `<wbr>`（新纯函数 `fieldNameBreaks`）。连续分隔符算**一处**断点
（`a__b` → `a__` / `b`），拼回去逐字等于末段——显示的名字与真实字段名差一个字符就是「点错字段」，
所以有用例钉着。

**② 面板 300 → 340px，且宽度只留一个权威常量。** 名字列 160 → **200px**。这个数同时决定
CSS 画多宽和「右缘对齐」算出的左缘，两处各写一份会漂（漂了面板就不贴按钮，看着像随机偏了几十像素）。
现在是 `FIELD_PANEL_WIDTH`，`client-smoke` 有一条断言盯着 CSS 那一行——与 `FIELD_PANEL_CEILING` 同一个套路。

**③ 脚注收成一行。** 「数字是本页行数；列要有逐行值才能加。」（18 个汉字宽 ≈ 198px，格子 324px），
完整那段搬进 `title`（不是删掉——想细看的人悬停就有）。判据是**一行读得完**，不是「字越少越好」：
被省略号切在半句的脚注比没有脚注更糟，它看起来像渲染坏了。

**真机读数（改后，同一屏）**：

| 读数 | 改前 | 改后 |
|---|---|---|
| 名字列宽 | 160px | **200px** |
| 折行的字段 | 10 / 29 | **6 / 36** |
| `com_docker_compose_config-hash` | 折成 `…conf` / `ig-hash` | **一行读完** |
| `com_docker_compose_project_environment_file` | 词中间断 | **`com_docker_compose_project_` / `environment_file`** |
| 脚注 | 284 / 464（截断） | **324 / 324（一行）** + `title` 里有完整那段 |
| 面板宽 | 300px | 340px（`left = 按钮右缘 − 340`） |

逐字符量过换行位置（`Range.getBoundingClientRect` 按 top 分组）：折行的 6 个字段，**每一个断点都落在
`_` / `-` 之后**——这是这一刀的核心断言，不是「看着顺眼」。

**反例（都实跑变红）**：CSS 退回 `overflow-wrap:anywhere` → 断言红；名字退回只按点断（第二十一刀那版）
→ `<wbr>` 个数红；脚注退回长句 → 预算红；CSS 宽度退回 300 → 常量一致性红；`fieldNameBreaks` 改成
每个字符都给断点 → 段数红。

**门槛**：`client-smoke` **100/100**（+3）；`client-pure` **190 条**（+5）；`client-lint` 通过
（样式变量 252 / 自定义属性 261 / 中性边框 20 / 圆角 32 / 排版 61 / 按钮族 7）；
`check-i18n` 本包 **189 条键**（+1：`hint.fieldsSidebarFull`）；`typecheck` / `build` / `aggregate` /
`doc-links` 绿；全仓 `test` **3003 / 3005**（红的 2 条仍是 `os-consent-scope` 的 DSH 版本绊线）。

**还没做的**：① 面板宽度仍是**固定** 340px（窗口很宽时它本可以更宽，把 43 个字符的末段也放下一行——
但那样「右缘对齐」就要按面板实时宽度算，`panelPlacement` 与 CSS 又得多一套同步）；② 折行上限是 2 行
（`-webkit-line-clamp:2`），再长的末段仍是省略号——那种字段的完整名只在 `title` 里；
③ 「＋N」全部标签浮层仍没跟着用 `panelPlacement`（两套夹取逻辑，见第二十二刀的「还没做的」）。

## 面板第二十四刀：点字段 → 看 top 值 → 点值直接筛（2026-10-17）

用户第三轮反馈（「你改了什么感觉没变化」）之后定的方向：前两刀都是「读起来更顺」的细节
（断行点、脚注、40px 宽度），面板**长得一模一样**——而字段筛选真正难用的地方不是这些，是
**按字段筛只有一条路：点「筛」然后手打一个值**。真机上没人记得住 `grafana` 还是 `grafana-1`、
`app-svc-1` 还是 `app-svc-1-0`（用户自己那张截图里的 `app` 就是手打出来的）。

**做法**：字段名本身变成开关（名字前一个 caret）。点开 → 向 `/facets` 要这个字段的 top 8 值
（`by=字段`、`size=8`）→ 就地列出**值 + 计数 + 条** → 点一个值就走 `drillDown`
（与榜下钻 / 行上标签 / 手填值**同一条**路）。选完自动收起（同一个字段只允许一条筛选）。

四个判据写死在实现里：

| 判据 | 为什么 |
|---|---|
| 请求体与「榜」**共用同一个信封**（`facetsEnvelope`） | 值的计数必须是**这一屏**（同一窗口 / 查询串 / 筛选）的子集；少带一样就是「上一次条件下的一组值」，且看起来像这一次的 |
| 缓存键 = 字段 + 来源 + 窗口 + 查询串 + 筛选 | 同一份条件只问一次（收起再展开不重发）；条件一变旧答案自动不会被读到（不需要「什么时候清」那种会忘的逻辑） |
| 空值那一行**不给点** | 筛选只能表达「字段 = 某值」，表达不了「字段缺失」（与榜上空值桶同一条） |
| 来源不支持聚合时**不发**请求 | Loki 发了也只会回一句报错；直接复用既有的「当前来源不支持聚合」那句 |

错误态照抄宿主原话（例如「字段 x 是 text 且没有 .keyword 子字段」）——那正是**下一步该怎么做**
（换字段 / 加子字段 / 用手填值），面板不该把它换成一句「没有值」。

**顺手修掉一条看不见的条**：真机量到值条的配色**等于没有**——轨道 `bg-layer-3` 与面板同是纯白、
填充 `interactive-bg-hover` 是 6% 黑，40px × 4px 的一小截肉眼分不出。改成轨道 `border-l1`（4% 黑）、
填充 `label-tertiary`（实灰）、高 6px。榜上的条是同一个毛病（同两个 token），一起换了——
同一屏上不该有「一种条看得见、一种看不见」。

**真机读数（test-logs @ 3085，真 ES「一」，816×782）**：

| 读数 | 结果 |
|---|---|
| 点 `container` 组里的 `name` | 列出 8 个值：`app-svc-1` 15242 / `app-svc-2` 9995 / `app-svc-3` 308 / `prometheus` 247 / `grafana` 178 / `batch-job-admin` 123 / `filebeat` 120 / `redis` 60，条宽 100% / 65.6% / 2.0% / 2% … |
| 点 `grafana` 那一行 | 请求体 `filters: {container.name: grafana}`；**命中 26456 → 177**，返回的 100 行全是 grafana；芯片落在筛选行；值清单收起 |
| 条（改后） | 填充 `rgb(129,133,140)`、轨高 6px——一眼比得出长短 |

**这里有一件只有真机才看得出来的事**：服务端半体（`src/execute.ts` 里漏传 `filters` 那条）改完之后
**必须重载插件**（插件详情页把「启用」关掉再打开）才会生效——客户端半体刷新页面就换，宿主的模块
是启动时加载的。上面那个「26456 → 177」是**重载之后**量的；重载前同样的点击只会得到
「芯片有了、行没收窄」（那次读数 26445 / 100 行里 6 个容器）。

**反例（六条全部实跑变红）**：值清单选完不收起 → 红（断言看的是 `aria-expanded`，不是「有没有行」——
条件变了之后新键还没答案，本来也没有行，只数行会把「开着但还在加载」错当成收起）；
缓存键不带筛选 → 纯逻辑用例红；请求不带 `size` → 红；不支持聚合时照样发 → 红；
空值行也给点 → 红；错误态吞成空态 → 3 条红。

**门槛**：`client-smoke` **106/106**（+6）；`client-pure` **198 条**（+8）；`client-lint` 通过
（样式变量 272 / 自定义属性 284 / 中性边框 20 / 圆角 35 / 排版 66）；
`check-i18n` 本包 **197 条键**（+8）；`typecheck` / `build` / `aggregate` / `doc-links` 绿。

**还没做的**：① 值只能**点一个**（不能多选、不能「排除这个值」——后者要 filters 支持 `!=`，
宿主契约目前只有等值）；② 展开着的时候改了条件，那一格会退回「加载中」再问一次（不会自动刷新，
也不会骗人）；③ 一次只要 8 个值，不可调（再多会把面板推成一屏值）；④ 值的条是**线性**的，
这台机器上 15242 与 60 差 254 倍，除头两条之外全落在 2% 的地板上——绝对比例是诚实的，
但「其余几个谁更重要」看不出来（要看得改用对数轴，那会牺牲「差多少」的直觉）。

## 面板第二十五刀：字段面板**只选列**，筛选搬去「＋ 筛选」（2026-10-17）

**用户原话**：「字段这里的面板没必要这么复杂，只要能选字段就够了吧（剥离筛选的职责）」。
这是对的，而且比自己想的更进一步：这个面板从第十二刀起一直在长东西——三分区、过滤框、
分组折叠、已选列、top 值、点值筛选、每个字段两颗动作按钮。到第二十四刀，它已经同时是
「选列面板」+「筛选面板」+「值浏览器」三合一了。

**关键发现：剥掉筛选之后，那三分区里有两个可以**整个消失**。** 「其余可用字段」「类型冲突」两区
存在的**唯一理由**是给「筛」提供字段（它们没有逐行值，加不了列）。既然列只能从「本页命中」加，
选列面板就只需要那一区——**92 个字段 → 35 个**，而且这 35 个全部能加列（不再有「点了一下没反应」）。

**做法：一个骨架、两种用途。** 搜索框 / 按父路径分组 / 折叠规则 / 滚动 / 脚注全部共用
（`renderFieldPicker({ mode })`）——两边各写一份必然漂，第二十一刀那套分组就是在这里长出来的。

| | 选列面板（元信息行「字段」） | 筛选弹层（筛选行「＋ 筛选」） |
|---|---|---|
| 标题 | 选列 | 筛选字段 |
| 字段 | **本页命中**（35） | 全部（92）：命中 / 冲突 / 其余 |
| 每行动作 | 只有「列」 | 只有「筛」 |
| 名字 | **静态文本**，无 caret，不可点 | 按钮 + caret，点开看 top 8 值 |
| 已选列那一格 | 有（入口与出口在同一处） | **没有**（它不负责列） |
| 脚注 | 「列要有逐行值才能加；数字是本页行数。」 | 「点字段名看它的 top 值，点值直接筛；也能手填一个值。」 |

**真机读数（test-logs @ 3085，真 ES「一」，816×782，100 行）**：

| 读数 | 选列面板 | 筛选弹层 |
|---|---|---|
| 标题 / 计数 | `选列` · 共 **35** 个字段 | `筛选字段` · 共 **92** 个字段 |
| 分区 | **1 个**（可加列的字段 35） | **3 个**（本页命中 35 / 类型冲突 1 / 其余可用 56） |
| 行内动作 | 全是「列」，共 35 颗 | 全是「筛」，共 35 颗（当前展开区） |
| 名字标签 | `SPAN`（静态） | `BUTTON`（可点） |
| caret | **0 个** | 35 个 |
| 滚动高度 | **1278px** | 1470px |

选列面板从「92 个字段 / 1470px」变成「35 个字段 / 1278px」——**少了 57 个永远加不了列的字段**，
那正是用户说的「没必要这么复杂」。

**反例（四条实跑变红）**：选列面板也画「筛」→ 5 条红（含列集那三条）；选列面板列全三个分区 → 红；
选列面板名字又变成可点按钮 → 红；筛选弹层也画「列」→ 6 条红。

**门槛**：`client-smoke` **107/107**；`client-pure` **198**；`client-lint` 通过（样式变量 273 /
自定义属性 285 / 圆角 35 / 排版 66）；`check-i18n` 本包 **205 条键**（+8）；
`typecheck` / `build` / `aggregate` / `doc-links` 绿；loglens 包 453 条全绿。

**还没做的**：① 两个面板共用一份搜索词与折叠态（换面板不重置）——真机上这是好事（刚搜过的
词还在），但如果两个人来回切会觉得「怎么带着上一个的过滤词」，值得再看；② 「＋ 筛选」弹层里
没有「已选列」那一格，从它加完筛选后芯片还在下面那一行（都在视野内，暂不改）；③ 列面板
过滤框搜不到东西时只说「没有匹配」，没说「本页命中为空」与「打了过滤词」的区别（已有两条空态，
但过滤词为空时的空态只覆盖了空页）。

## 面板第二十六刀：选列面板的「列」按钮 → **勾选**（2026-10-17）

**用户原话**：「这里的『列』字很怪，选择字段，要么做成行选中，要么做成 checkbox 勾选」。
「列」是**操作名**（动词），摆在一列字段名右边读起来像是数字/单位的一部分；而这一栏做的事
其实就是「把这些字段选出来」——那是**选择**，不是命令。这是第二十五刀剥离职责之后看得更清楚的一件事：
面板只剩一个用途时，它唯一那颗按钮就该长得像「选中」。

**做法**：

| 改动 | 判据 |
|---|---|
| 每行包成 `<label>`：点名字 / 点数字 / 点勾选框**都算选它** | 16px 的勾选框对鼠标太小；整行可点是清单交互的常态 |
| 勾选框是**真的** `<input type=checkbox>` | 键盘空格、读屏、「已选几项」都不用另写；自己画一个方块这三样都得补 |
| 选中态走 `checked`，不是类名翻转 | 断言的是 `checked === true`（类名翻转可以画出「看起来选中」而实际没选） |
| 满员时**未选**的行禁用并给 `title`，**已选**的仍可点 | 否则满员之后一个都去不掉——那正是「按了没反应」的另一种形态 |
| 「列」那颗按钮**整个删掉**（不是改名） | 动作挪到勾选框之后，按钮是重复入口；留着两颗会让人以为它们做的事不一样 |

`columnPickState` 提成纯函数（`ok` / `picked` / `limit` / `bad`）：它决定**画成什么样**，
而 `columnToggle` 决定「改完之后是什么」——合成一个就得在渲染时先算一遍结果、再假装没算。

**真机读数（test-logs @ 3085，真 ES「一」，816×782，100 行）**：

| 读数 | 结果 |
|---|---|
| 行结构 | **42** 行全是 `<label>`，**42** 个真的 checkbox |
| 勾选框 | `16×16`、`accent-color: rgb(15,17,21)`（宿主中性 brand，**不是** UA 的 `#0275ff` 蓝勾） |
| 点名字文字 | `checked` 变 true、`已选列（1）stream` 出现、列芯片 1 个；再点一次全部回退 |
| 满 4 列 | 前 4 个 `checked + disabled:false`，第 5 个起 `disabled:true`、整行 `opacity:.5`；点第 5 个无反应（列集仍是 4） |
| 已选的仍可取消 | 第 1 个 `disabled:false`，点掉后列芯片回到 3 |

**踩到的一个闸门坑（值得记）**：`client-lint` 的复选框检查从**标记侧**出发（源码里有
`type:'checkbox'` 就必须有一条带 `accent-color` 的规则管到它），而它的 CSS 解析器在属性选择器里
**遇到引号会断错选择器**——`input[type="checkbox"].ll_fieldCheck{…}` 被解析成 `].ll_fieldCheck`，
于是那条 `accent-color` 不被算作覆盖，报 uncovered。写成 `input[type=checkbox].ll_fieldCheck`
（不带引号，等价且宿主自己也这么写）才通过。这不是绕过判据，是判据的实现有这个解析限制。

**反例（四条实跑变红）**：行不包 `<label>`（只剩勾选框）→ 红；满员时连取消勾选也禁用 → 2 条红；
勾选框不报 `checked`（改成 `data-on`）→ 红；未选行在满员时不禁用 → 红。

**门槛**：`client-smoke` **109/109**（+2）；`client-pure` **202 条**（+4）；
`client-lint` 通过（样式变量 280 / 自定义属性 292 / 圆角 36 / 控件选中色 **2** 处均为官方 brand）；
`check-i18n` 本包 **205 条键**；`typecheck` / `build` / `aggregate` / `doc-links` 绿。

**还没做的**：① 没有「全选 / 清空」——4 列的上限让这两个动作没什么用（最多选 4 个）；
② 已选那 4 行的底色与 hover 是同一个 token（`interactive-bg-hover`），两者叠在一起时分不出
「我刚经过它」和「它已选中」——真机上还没到这个程度就先没动；③ 勾选框没有 `indeterminate` 态
（这个面板里没有「部分选中」的语义）。

## 面板第二十七刀：缩进对齐（2026-10-17）

**用户原话**：「没对齐啊」，配一张选列面板的截图。量下来是**两条竖线各偏各的**：

| 量到的东西 | 改前 | 改后 |
|---|---|---|
| 组头箭头 x / 行勾选框 x | **199 / 219（差 20px）** | **199 / 199（差 0）** |
| 组名 x / 字段名 x | **213 / 241（差 28px）** | **219 / 219（差 0）** |
| 名字与勾选框的竖直居中差 | **-4px**（名字比行中线高 4px） | **0** |
| 勾选行高 | **28px**（本该 26） | 26 / 28（28 是长名折两行，正常） |

**三个根因，都是「两套数字各写各的」**：

1. **前导槽宽度不同**：组头是 `箭头 10px + gap 4`，行是 `勾选框 16px + gap 6`。
   前导件一宽一窄，后面的名字必然错开。→ 统一成 **16px 前导槽 + gap 4**。
2. **组体自己还加了一层缩进**（`padding-left:14px`），而行的缩进由它自己再加 4px。
   两处叠起来正好是那 20px 的另一半。→ **组体不再缩进**，缩进只归「前导槽 + padding」这一套。
3. **列模式留了一个空的动作桶 span 占位**：那一行的网格规则只定义了两列
   （`.ll_fieldPick .ll_fieldRow{grid-template-columns:minmax(0,1fr) auto}`），空 span 掉到第二行，
   把名字顶高 4px、行高从 26 撑到 28。→ **列模式整块不画动作桶**，两模式的列宽对齐改由那条两列规则负责。

判据是**同一个数字**，不是「看起来差不多」：`client-smoke` 那条守卫直接断言 CSS 声明串
（两处 `width:16px` / 两处 `gap:4px` / 组体不许有 `padding-left`），改一边就红。
组件这层没有布局引擎、量不到像素，所以真实像素只能靠真机验收——上面那张表就是。

**真机读数（test-logs @ 3085，真 ES「一」，816×782，34 个可加列字段）**：
五组逐一量过，`box − chevron = 0`、`fieldName − groupName = 0`、前六个行的
`nameOffset / boxOffset = 0` —— 全为 0。

**反例（四条实跑变红）**：箭头退回 10px → 红；勾选行 gap 退回 6px → 红；
组体又自己缩进 → 红；列模式又画空动作桶 → 2 条红（含「行结构」那条）。

**门槛**：`client-smoke` **110/110**（+1）；`client-lint` 通过；`build` 绿。

**还没做的**：① 折成两行的长字段名（`com_docker_compose_project_*`）让那一行高 28 而不是 26，
这是折行本身的结果，不是错位——但它让「一列行高」不完全一致；② 这个契约只有 CSS 层面的守卫，
真正的像素对齐靠真机人工验收（没有视觉回归基线）。

## 面板第二十八刀：筛选面板去噪 + 手填归位（2026-10-17）

**用户原话**：「筛选也做一下优化」，配一张筛选弹层的截图——29 行字段，右边挂着一列
**29 颗一模一样的「筛」按钮**。量下来三件事：

| 量到的东西 | 改前 | 改后 |
|---|---|---|
| 每行的动作 | 一颗「筛」（29 颗重复） | **没有**（点字段名才是主路径） |
| 计数列右缘 vs 组头计数右缘 | **429 / 461（差 32px）** | **461 / 461（差 0）** |
| 行高 | **28px**（`min-height:26` 却被撑高） | **26px** |
| 滚动高度 | 1294px | 1261px |

**① 那 29 颗「筛」是噪音。** 第二十四刀之后，点字段名（这一行**最大的**目标）就能列出 top 值、
点值直接筛——那颗按钮是**重复入口**，而它一列排下来把「名字 + 计数」这一行挤成了三列，
计数因此左移 32px。删掉之后两列自然对齐。**手填没消失**，只是挪到了它该在的地方：
展开区里、值清单**下面**（「这些都不是我要的」之后的那条路），一颗虚线胶囊「手填值…」。

**② 行高被 `content-box` 悄悄加了 2px。** `min-height:26px` + `padding:1px 4px`，而
`box-sizing` 是默认的 `content-box` → 实际 28。补 `box-sizing:border-box` 之后真的落地 26。
**这条只有真机能量出来**：组件这层没有布局引擎，`client-smoke` 断言不到，我是量到
`rowH:28 / minHeight:26px / probe(with min-height:0):16` 才定位到的。

**③ 排查途中我自己制造并修掉的两个 bug**（记下来，因为都属于「同一个东西写了两份」）：
- 删旧 composer 的正则匹配到了**新加的那份**，`ll-filter-act-` 一度完全消失（用例立刻红：
  「展开后该有『手填值…』」）；
- 补回之后**两份 composer 并存**，点「手填值…」出现**两组**「确定/取消」（真机截图看出来的）。
  根因是渲染分两处：我把它挂进了 `renderFieldValues`（值清单里），而字段块末尾原来那份还在。

**真机读数（test-logs @ 3085，真 ES「一」，816×782，100 行）**：

| 操作 | 结果 |
|---|---|
| 面板打开 | 每行**零颗**动作按钮（`.ll_fieldActs` 0 个、`button.ll_fieldAct` 0 个） |
| 计数 | 每行 461 = 组头 461（改前 429 / 461） |
| 行高 | **26**（长名折行的仍 30，那是折行本身） |
| 点 `stream` | 展开 `▾ stream 100 / stdout 25953 / stderr 363 / 手填值…` |
| 点「手填值…」 | 就地出现**一组**输入框 + 确定 / 取消 |
| 滚动高度 | 1294 → **1261px** |

**门槛**：`client-smoke` **110/110**；`client-lint` 通过（样式变量 289 / 自定义属性 301 /
圆角 37 / 排版 67）；`check-i18n` 本包 **207 条键**（+2：`btn.filterManual` / `hint.filterManual`）；
`typecheck` / `build` / `doc-links` 绿。

**还没做的**：① 折成两行的长字段名仍让那一行 30px（折行本身，不是错位）；
② 手填格一次只开一个（点另一个字段的手填会把它换掉）——没有「同时填两个」的场景；
③ 展开区的值清单与手填格共用一个 `fieldComposer` 状态，**同一个字段**才互斥，
不同字段之间互不干扰（这是有意的）。

## 面板第二十九刀：tree 层次 + 手填不再需要展开（2026-10-17）

用户第四轮点名两件事：

> 1. 展开没有 tree 那种层次效果
> 2. 需要手填的时候还需要展开去填太麻烦了

### ① tree 层次：一条导轨 + 一层缩进

改前组头与组内的行**挨在同一列上**（组体只有 1px 的缝）——展开与收起在视觉上只是「多了几行」，
看不出谁属于谁。现在：

| 层级 | 视觉 | 真机读数 |
|---|---|---|
| 分组头 | `▾ 顶层字段` + 计数 | x = **145** |
| 组内的字段行 | 右移一格 + 左侧一条 `.5px` 竖向导轨 | x = **162（+17）** |
| 值清单（某字段的子项） | 再右移一层 + 自己的导轨 | 相对行 **+12** |

导轨用 `var(--dsw-alias-border-l1)`（4% 黑）与 `.5px` 发丝线——它在浅色面板里刚好看得见、
不抢注意力（`client-lint` 的 23 处中性边框全是发丝线，这条也算在内）。

**一个自相矛盾的守卫要跟着改**：第二十七刀我写过「组体不许 `padding-left`」，那是为了消掉
「两套数字各写各的」造成的 20px 错位。但这一刀用户要的**就是**缩进，所以合法条件从
「不许缩进」改成「**左边距与左内边距等量**（整体平移，不是压窄行宽）+ 必须有一条导轨」。
判据换了，但那句「同一个数字」的口径没变。

### ② 手填不必展开：悬停行即现的快捷按钮

第二十八刀把手填挪进展开区（值清单下面），用户说麻烦——**确实**：手填的人往往已经知道
要填什么，让他先展开、还要等 top 值那一枪请求回来，是纯白给的一步。

现在每行右缘有一颗「填值」小按钮：**悬停行才现身**（静止 `opacity:0` + `pointer-events:none`），
点一下**直接在行下方**开一格填值——不触发展开、不拉值清单。

| 行为 | 真机读数 |
|---|---|
| 按钮位置 | 行内（`.ll_fieldRow` 里，`absolute` 贴右缘，**不占列宽**） |
| 静止态 | `opacity:0` / `pointer-events:none`（35 行 35 颗，全部不可见不吃点击） |
| 现身 | 悬停行、或按钮自己拿到焦点（`:focus`，键盘 Tab 也算） |
| 点它 | 填值格出现、输入框**自动聚焦**、`aria-expanded` 仍是 `false`（**没有**展开值清单） |
| 行高 | **26px**（未因多一颗按钮变高——它是绝对定位） |

**第一版踩的坑（记下来）**：我先把那颗按钮画在 `.ll_fieldRow` **外面**（字段块的直接子元素）。
`position:absolute` 会相对最近的定位祖先——它落到了 `.ll_fieldBlock` 上，于是 35 颗按钮全堆在
块底部（`quickInFirstRow: false`），行里一颗也没有。真机一量就露馅，挪进行内才对。

**反例（四条实跑变红）**：快捷按钮点了顺手展开值清单 → 红；组体去掉导轨 → 2 条红；
组体不缩进 → 2 条红；值清单没有导轨 → 红。

**门槛**：`client-smoke` **112/112**（+2）；`client-lint` 通过（样式变量 292 / 自定义属性 304 /
中性边框 23 / 圆角 37 / 排版 67）；`check-i18n` 本包 **208 条键**（+1：`btn.quickFilter`）；
`typecheck` / `build` / `doc-links` 绿。

**还没做的**：① 组与组之间仍是平铺（同一分区里的多个组看起来是并列的兄弟，不是一棵真树——
真正的树要把「分组」本身也做成可折叠的节点，那是另一个量级的改动）；② 快捷按钮在触屏上没有
「悬停」，只能靠聚焦（平板用户点第一下是聚焦、第二下才点中——可以改成点行任意处也开）；
③ 导轨只在组体与值清单上，分区标题（`本页命中`）与它下面的组之间没有线。

## 面板第三十刀：筛选收成一条两格输入框（2026-10-17）

用户的原话：

> 筛选做成一个输入框，一边选字段，一边可输可选怎样

问了一句「弹层退场还是保留」，用户选**只留输入框，弹层退场**。

### 退场了什么

| 退场 | 原来干什么 | 现在归谁 |
|---|---|---|
| 筛选行那颗「＋ 筛选」按钮 | 打开一整块字段弹层 | 两格输入框常驻在这一行 |
| 整个筛选弹层（`renderFieldPicker({mode:'filter'})`） | 选字段 / 看 top 值 / 点值筛 / 手填 | 同一格的左右两半 |
| 字段行那半套筛选职责 | 点名字展开值清单、行尾「填值」按钮 | 右格的下拉 |
| `panelToggle` 与「两个入口」那套锚点判据 | 换一颗 = 换锚点不收起 | 只剩一个入口，不需要 |

选列面板（元信息行那颗「字段」）**保留**，但收成了单一面板：分组、折叠、搜索框、已选列那一格
逐字照旧，只是不再有「其余可用 / 类型冲突」两个分区（那两区存在的理由就是给筛选当字段清单）。

### 这一格长什么样

```
筛选  [字段 ▾] = [值 ▾] [确定]      ← 芯片排在更前面
```

三条判据：

1. **右格跟着左格走**——选定字段就把它的 top 值拉出来（`openValueChoices`）。用户说的
   「一边选字段，一边可输可选」就是这一条：两格是**一个**输入框的两半。
2. **两边都能手打**——值那一格不要求从候选里选（候选只有 top 8，长尾值 / 带空格 / `*` 通配
   都只有手打表达得了）。所以「没选中任何候选」是**正常状态**：`choiceMove` 允许落在 −1，
   而 `pickMove`（分组框那个）不允许——两者分开是因为判据不同，不是为了各写一份。
3. **Backspace 在两格之间退**——值格有字时删字、值格空了退回字段格（`filterBoxBack` 判据）。

### 真机上量出来的三个问题（都已修）

| 问题 | 真机读数 | 改法 |
|---|---|---|
| 下拉离它要补的那一格太远 | 挂 `.ll_fx` 时下拉左缘 **105**，值格在 **539**（差 **430px**） | 挂 `.ll_fxBox`：字段那张贴左缘（138=138）、值那张贴右缘（475=475） |
| 字段下拉被拉宽 | 继承 `right:0` 之后宽 **337**、右缘伸到 475 | `.ll_fxListField{left:0;right:auto}`，且**写在 `.ll_fxList{right:0}` 之后**（同权重，靠顺序覆盖） |
| 选完字段焦点还在左格 | `document.activeElement` 仍是 `ll_fxField` | `fxValueRef` 在 `pickFilterField` 里把焦点挪到右格 |

第三个是真 bug 不是观感：选完字段接着打字，字会打进**字段名**里。

### 门槛

`client-smoke` **102/102**（退场 21 条，新增 13 条）；`client-pure` **211**（+9）；
本包 **466**；`client-lint` 通过（样式变量 273 / 属性 289 / 发丝线 23 / 圆角 36 / 排版 67 /
输入档 1）；`check-i18n` 本包 **191 条键**（+4 新增：`placeholder.filterField` / `placeholder.filterFieldFirst` /
`hint.filterValueFirst` / `badge.pageField`；−21 死键：随弹层退场的 `panel.fieldsFilter`、
`section.pageFields`、`btn.quickFilter`、`hint.fieldValuesToggle` 等整批删掉——闸门把「定义而未用」
报成告警，这一刀之后它们一条都不该留着）；
`typecheck` / `build` / `aggregate` 绿；全仓 **3024/3026**（红的仍是 `os-consent-scope` 那两条
DSH 版本绊线）。

**反例（实跑变红）**：候选里把空值那一档放回来 → 红；`choiceMove` 换成 `pickMove`（不给 −1）→ 红；
字段候选改回单选子串（不认 `cont name`）→ 红；右格不自动张开（少调 `openValueChoices`）→ 红。

**真机取值已脱敏**（本节与上面两刀的读数）：内网服务名一律写成 `app-svc-1/2/3` 与 `batch-job-admin`，
条数、命中数与各项结论一字未改。口径与 `92f01eaf6`（内网标识脱敏）同一条。

### 还没做的

① **没有「浏览全部字段」的出口**：左格候选把本页命中排在前面、其余跟上，但一屏只列得下
十几行；要找长尾字段得靠打字收窄。加一颗「全部字段」翻页是下一步（第三十一刀的候选）。
② 右格候选只有 top 8（`FIELD_VALUES_SIZE`），长尾值只能手打——这是有意的（拉更多会让
下拉变成一屏清单），但如果真机上「手打的次数明显多于挑选」，就该把 8 调大或加一个「更多值」。
③ 两格都空时**不出现**「确定」按钮（省噪音），所以「先点确定再填」是走不通的——这是有意的，
但和旁边那些常驻按钮的脾气不一致，用户可能要找一下。

## 面板第三十一刀：用户拿截图问「这交互逻辑对吗」（2026-10-18）

用户贴了一张真机截图（筛选芯片 `container.name = …` + 左格 `container.id` + 值下拉），问：

> 这交互逻辑对吗

**这张截图里的画面本身没有问题**（左格正打着一个字段、右格还没填、下拉列的是那个字段的值），
但顺着它去查那三条路，抓到**两个真 bug** 和一处口径问题。

### ① 已经筛着的字段，换不了值（真 bug）

```
by=container.name, filters={container.name:"a"}  →  buckets=[{a}]
```

值下拉把**当前全部筛选**都下发下去了，包括这个字段自己那一条。后果是聚合只在
「字段 = 当前值」这个子集里算，候选永远只有它自己一条：

| 现象 | 真机读数 |
|---|---|
| 打开正在筛的字段的值下拉 | 候选 **1 条**（就是它自己） |
| 想换成 `app-svc-2` | 换不了——只能先去点芯片上的 × 删掉，再重新选一遍 |
| 画面的误导 | 只有一条的下拉会被读成「这个字段只有一个值」 |

改法：值载荷**摘掉本字段自己的那条筛选**（别的筛选照旧下发——值仍要是这一屏的子集）。
判据落在载荷上（`fieldValuesPayload`），`fieldValuesKey` 跟着变（摘掉之后与「本来就没筛它」同一个键，
所以换值不必重新问后端）。Kibana 对字段候选也是这么做的。

真机修复后：同一个下拉列出 **8 条**（`app-svc-1/2/3` / prometheus / grafana / …），直接换得动。

**口径要说明**：摘掉之后那些数说的是「不受本字段约束的子集」，与页面上的命中数不再是同一个意思。
所以下拉顶部加了一句（`hint.fieldValuesOwnFilter`）——**默默换口径比不换更坏**。

### ② 换字段时右格的值跟着搬过去，回车就静默筛错（真 bug）

第三十刀我在这里刻意写了「改字段不动右格」，理由是「别顺手吞掉用户打的字」。真机走一遍，
那份善意换来的是一个没人会发现的错：

| 步骤 | 屏幕 |
|---|---|
| 选 `host.name`，右格打 `node-1` | field=host.name, value=node-1 |
| 改成 `container.name`（未提交） | field=container.name, **value 仍是 node-1** |
| 按回车 | 芯片 **`container.name = node-1`** ← 静默筛错 |

判据是**值属于字段**，不属于这一格。换了字段，上一格的字就不再是「这个字段的值」。
所以换字段 = 换一个要填的空。

**两个入口都要改**（第一版只改了其一，冒烟当场抓到）：

- 点候选换字段（`pickFilterField`）；
- **手打**改左格（`onChange`）——这条更常见（用户想换字段多半直接删掉重打）。

同字段重复点选**不**清空：那是「重选同一个」，抹掉刚打的字才是捣乱。

### ③ 值行那个数比页面命中数还大（口径，不是逻辑错）

截图里值行写 **15242**、同屏命中写 **15199**。一个值不可能多于总数。

查证：两次请求的窗口（from/to）与 filters **逐字相同**，数却不同——ES 是近实时索引，
`/query` 算完之后又有几十条落进窗口，后跑的聚合多看见了。受控对比（同一进程内连着发）两边都是 15199。

没有便宜的修法（要对齐就得每次聚合前重查一次命中，等于把一次点击变成两次查询）。
所以判据是：**并排摆两个不同口径的数，不如不摆**。

- 值行右缘的数字换成一条**相对长短的条**（条只表达「比旁边的长/短」，这件事在两个瞬间之间不会翻转）；
- 具体条数进 `title`（要核对的人有出处）。

### 门禁

`client-smoke` **107/107**（+5：换字段清空 / 同字段不清空 / 载荷摘掉本字段 / 别的字段照旧 /
口径写明）；`client-pure` **216**（+5）；本包 **471**；
`check-i18n` 本包 **193 条键**（+2：`hint.fieldCountBucket`、`hint.fieldValuesOwnFilter`）；
`typecheck`/`build`/`doc-links`/公网 IP 绿；全仓 **3029/3031**（红的仍是 `os-consent-scope` 两条）。

**反例（三条实跑变红）**：载荷不摘本字段筛选 → 红（纯逻辑 4 条 + 冒烟 1 条）；
换字段不清空右格 → 红；值行放回并排的计数 → 红。

**第一版的教训**：载荷那条反例第一次跑时**冒烟没红**（纯逻辑红了）。原因是断言取的是
「筛选生效**之前**那次请求」——那时本来就不含该条件，摘没摘摘一个样。改成盯
「筛上之后重开下拉」发出的请求才有区分度。**反例不红，守卫就是假的。**

### 还没做的

① 手打改左格时右格被清空，若用户其实只是想改字段名里的一个笔误（`container.nam` → `container.name`），
那半截值也会被清掉。更细的做法是「只在离开焦点 / 值不属于新字段时才清」，但那要判断
「这个值像不像那个字段的值」，做不到就不假装做。
② 值下拉的条数只在 title 里，触屏没有悬停——要核对条数得靠 `＋N` 那条路（还没接）。

## 第三十二刀：语法错误被显示成「部分分片失败」（2026-10-18）

用户问「这个查询怎么用的」，回答时顺手逐个试了常见写法，撞到这一条：

```
q = level:(ERROR     ← 少一个右括号
→ HTTP 200 / ok:true / matched:0 / truncation.reasons:["partial_shards"]
→ 界面上只写：「已截断：部分分片失败」
```

用户看到「0 条 + 分片出问题」，会去怀疑索引、集群、磁盘——而真正的原因是他自己少打了一个括号。

根因在适配器：ES 对**分片级**错误回 `HTTP 200`，原因放在 `_shards.failures[].reason` 里；
而 `elastic.ts` 只数了 `_shards.failed`、翻成 `partial_shards`，**从没读过 `failures`**。
于是「查询串写错了」与「分片真坏了」在界面上长得一模一样，可这两件事该找的人不同。

### 改法

1. `LogQueryResult` 加一条 `warnings?: string[]` 通道（适配器自己要说的话）。
2. `elastic.ts` 的 `shardFailureReasons(shards, limit=3)`：读 `failures[].reason.reason`（给人看的那句）、
   按出现顺序去重、最多 3 条；形状认不出就原样给一小段 JSON。
3. 分片失败时把原话带成 `[分片] <ES 原话>`；`execute.ts` 把它**排在参数类 warning 前面**
   （它解释的是「为什么这一页是这样」，比「你给的参数被夹过」更该先看到）。

真机验证（`q=level:(ERROR`）：

```
warnings: ["[分片] Failed to parse query [level:(ERROR]"]
truncation.reasons: ["partial_shards"]        ← 原话是补充，不是替代
```

界面上是两行：`已截断：部分分片失败` + `[分片] Failed to parse query [level:(ERROR]`。

判据沿用值下拉那条：**取不到就把宿主原话摆出来**，别让一句笼统的分类词替它说话。

### 顺带查清的（不是 bug）

- **`error AND timeout` 回 0 条不等于「AND 不好使」**（第三十四刀更正）：那一次实测里
  `error` 1016 条、`timeout` 53 条，两者**没有一分共现**，所以 0 是**正确答案**。当时把这个 0
  读成了「大写 AND 不是运算符」，于是拿 `error+timeout`（1076 条）当「且」的例子——那其实是
  **并集**。正确判据是算术自洽（|A∩B| = |A|+|B|-|A∪B|），2026-10-18 同一固定窗口：
  `1016 + 1284 - 1789 = 511`，而 `error AND failed` 回 **511**（交集）、`error+failed` 回 **1789**（并集）。
- `error and failed` 回 4505 条：小写 `and` 是**普通词**不是运算符（`query_string` 的运算符要大写）；
  `error or failed` 同理回 2629（把 `or` 当词在搜）。面板不改写用户写的查询串。
- `level:ERROR` 回 0 条：这套索引里 `log.level` 常常为空，级别是从正文**推断**的
  （行上那个 `levelInferred`）。所以按级别筛要走级别下拉（页内筛）或搜正文关键字。
- `nosuchfield:abc` 回 0 条、不报错：ES 对不存在的字段就是 0 命中，这是它的正常行为。
  真机 `container_name:prometheus` 回 0、`container.name:prometheus` 回 240——**打错一个下划线
  就是静默 0 条**，这正是第三十四刀做字段名补全的理由。

### 门禁

`elastic.test.ts` **39**（+3 wire 级：原话带出 / 全好时不带 / 有失败但没原因不造话；
外加 5 条 `shardFailureReasons` 纯逻辑）、`query-route.test.ts` **17**（+1：适配器 warnings
到得了响应）、本包 **480**；`client-smoke` **107/107** 不变；全仓 **3038/3040**
（红的仍是 `os-consent-scope` 两条）。

**反例（两条实跑变红）**：`execute.ts` 不合并适配器 warnings → 路由用例红；
适配器不读 `failures` → wire 用例红。

### 还没做的

`_shards.failed` 仍然只报数量、不报**哪几个索引**失败了（`failures[].index` 拿到了但没往上传）。
真实的多索引场景下「哪个索引没答上来」是有用的信息，但那是另一件事（要往下传结构，不只是字符串）。

## 第三十三刀：查询串旁边的可点例子（2026-10-18）

用户先问「`level:(ERROR` 这类写法怎么用」，讲完一轮之后说：

> Lucene 查询串我不会写，你教我，我去试试

**教一次不够**——下次换个人还是不会。所以把「这一支方言认什么」直接摆在框边上。

### 为什么这件事值得做（而不只是「加几个示例」）

用户真正卡住的不是语法，是**这套面板与 Kibana 不是同一种方言**：

| | Kibana Discover 默认 | 本面板 |
|---|---|---|
| 语言 | **KQL** | **Lucene**（`query_string`） |
| 「且」 | `error and timeout` | `error AND failed`（大写） |
| 「或」 | `error or timeout` | `error failed`（空格，默认 OR） |
| 「排除」 | `error and not timeout` | `error -failed` |

真机读数（**同一固定窗口**，2026-10-18）：

```
error                   → 1016
failed                  → 1284
error failed            → 1789   ← 并集（= 1016 + 1284，两者无共现）
error AND failed        → 511    ← 交集（= 1016 + 1284 − 1789）✓
error+failed            → 1789   ← 粘连的 `+` 只是分隔符，等于空格，即「或」
error and failed        → 4505   ← 小写 `and` 被当成普通词
```

也就是说：**写错不报错，只是数字不对**。这比语法错误难查得多。

> ⚠️ 这一段原先是错的（第三十三刀写的）：它说「`+` 是且」，并拿 `error AND timeout` 回 0
> 当作「大写 AND 不是运算符」的证据。真相是那两个词在那一小时里不共现，0 是正确答案。
> 第三十四刀已更正并改了例子，见该节。

### 做了什么

查询串那一行下面加一排可点的例子（`querySamples(kind)`，按方言给）：

| 方言 | 例子 |
|---|---|
| ES / OpenSearch（Lucene） | `error` · `"Failed to"` · `error AND failed` · `stream:stderr` |
| Loki（LogQL） | `{job="app"}` · `{job="app"} \|= "error"` · `{job="app"} != "debug"` |
| 不认识的 | 空数组（**不给一个点了会报错的例子**） |

三条判据：

1. **点击 = 填进查询串，不自动查**。例子是「看看长什么样」，每次查询都是真的打后端；
   自动查会把「我想看看」变成一次误触。
2. **例子本身不翻译**（它是代码，不是文案）——翻成中文就没法点进去跑了；只有 title 是文案。
3. **占位符也改了**：从 `如 level:error 或 "timeout"` 改成「`+` 是『且』、空格是『或』、引号是短语」。
   原来那句里的 `level:error` 是个**演示了会失败**的例子（这套索引 `log.level` 常为空，
   真机回 0 条）——占位符里放一个照抄就会错的写法，比不写更坏。

### 关于「要不要直接做成 KQL」

查清楚了，**不做**，理由按重要性：

1. **集群不支持**：原生 `kql` 查询类型要 Elastic Stack **9.1+**（9.0 是 preview），
   而这台是 **ES 7.10.2**（`curl :9200` 实测）。要用只能自己写 KQL→DSL 的解析器
   （Kibana 的 `@kbn/es-query` 就是这么干的，但它不发布成可复用库）。那是一个长期维护负担：
   嵌套 `{}`、`not()` 优先级、通配前缀、日期字面量，每一项都要单独写用例。
   出处：[KQL query 参考](https://www.elastic.co/docs/reference/query-languages/query-dsl/query-dsl-kql-query)、
   [KQL 语言参考](https://www.elastic.co/guide/en/kibana/7.16/kuery-query.html)。
2. **面板回答的是一类受限问题**：`字段 = 值` 的筛选栏已经覆盖日常动作（按服务/主机/容器筛、
   换值、叠加）。查询串是长尾（正文关键词、短语、正则）。为长尾承担一套语法的解析成本不划算。
3. **已经有一条更好的路**：让 agent 说人话，它用 `loglens_search` 直接传 `filters` + `level`，
   根本不用写查询串。
4. **两套语法并存是最差形态**：Kibana 自己都只有一个切换开关，从不让两种语法同时在一个框里。

**记账**：等这个集群升到 **ES ≥ 9.1**，加一句 `query: { kql: { query } }` 就能把语法换掉，
零解析器成本。那时候值得做。

### 门禁

`client-pure` **221**（+5：id/sample 齐全 / ES 与 OS 同批 / 只给真认的写法 / LogQL 另一支 / 未知方言空）、
`client-smoke` **108/108**（+1：点例子填进查询串、不自动查、再查时 q 是它）；
`check-i18n` 本包 **195 条键**（+2：`hint.querySamples`、`hint.querySample`）；
本包 **485**；`typecheck`/`build`/`aggregate`/`doc-links`/公网 IP 绿；全仓 **3043/3045**。

**反例（两条实跑变红）**：点例子顺手就查 → 冒烟红；给 Lucene 用户一条 KQL 写法
（`error and timeout`）→ 纯逻辑红。

真机验活：ES 来源下面出现 4 条例子，点一条填进查询串（不自动查），再点「查询」。
（第三十四刀把「且」那一条从 `error+timeout` 换成了 `error AND failed`——原来那条给的是并集。）

### 还没做的

例子只有 4 条，覆盖「基础/短语/且/字段」。**正则 `/.../`、模糊 `~`、区间 `[a TO b]` 没给**——
它们更少见，而且正则写错在 ES 上同样只是 0 条。要加的话按同一形状往 `querySamples` 里添一条即可。
另外例子是**固定的四条**，不是「按当前索引的字段名生成」——后者需要知道字段映射（`/fields` 已有），
但会让这一行在换来源时抖动，暂不做。

## 第三十四刀：更正方言 + 查询串的字段名补全（2026-10-18）

用户看完第三十三刀的结论后，发来一张 Kibana 的补全弹层截图（`container_name` 打进去，
下面列 `container_name.keyword` / `container_name` / `:` / `: *` / `and` / `or`），问：

> 要不要把这个抄过来

回答这个问题之前先量了一遍数据，结果**推翻了第三十三刀自己的结论**。所以这一刀有两件事：
先认错并更正，再决定抄哪一半。

### ① 更正：大写 `AND` 一直是运算符，第三十三刀量错了

第三十三刀的依据是这一行：

```
error AND timeout     → 0        ← 当时读成「大写 AND 不是运算符」
```

**这个 0 是正确答案。** 同一固定窗口里 `error` 1016 条、`timeout` 53 条，而两者**没有一分共现**，
所以交集就是 0。真正能判定运算符的是**算术自洽**：`|A∩B| = |A| + |B| - |A∪B|`。

```
|error| = 1016   |failed| = 1284   |error∪failed| = 1789
算术交集 = 1016 + 1284 − 1789 = 511

error AND failed  → 511    ✓ 就是交集 → 大写 AND 是运算符
+error +failed    → 511    ✓ 同样
error+failed      → 1789   ✗ 等于并集 → 粘连的 `+` 只是分隔符（= 空格 = 「或」）
error and failed  → 4505   ✗ 小写 `and` 是普通词
error -failed     → 504    ✓ `-` 是排除
error NOT failed  → 504    ✓ `NOT`（大写）也是排除
```

第三十三刀因此把 `error+timeout` 标成「且」放进了可点例子——点下去得到的是**并集**，
而标签写着「且」。这正是那一刀自己要防的毛病（写错不报错、只是数字不对），只不过犯在了自己身上。
教训记在 pure.js 的 `querySamples` 注释里：**判据要靠算术自洽，不能靠单个数字**——
单个 0 既可能是「运算符无效」，也可能是「交集本来就空」，两者长得一模一样。

连带改掉的：占位符（原写「`+` 是「且」」）、README 的方言段、ROADMAP 第三十二/三十三刀的读数段。

### ② 抄哪一半：只抄**字段名**，不抄运算符菜单

截图里那个弹层混着两类东西，命运不同：

| 弹层里的东西 | 抄不抄 | 理由 |
|---|---|---|
| `container_name` / `container_name.keyword` 字段名补全 | **抄** | 见下，它防的是一种静默故障 |
| `:` / `: *`（exists） | 抄（`字段:*` 已可用） | 真机 `container.name:*` 回 26331 = `_exists_` 回的一样 |
| `and` / `or` | **不抄** | 那是 **KQL** 的运算符。抄进 Lucene 面板，用户打 `and` 就会被当普通词（4505 条），教错 |

字段名这一半值得抄的**硬理由**（不是「Kibana 有所以我们也要有」）：

```
container_name:prometheus      →     0    ← 用户截图里正在打的那种写法
container.name:prometheus      →   240    ← 这台集群的真实名字
```

这台来源的面板列 **92 个字段**（`/fields` 真机实测；`_field_caps` 打整个集群是 1657 条，
去掉 `.keyword` 重复行与 object 行剩 1274——**但面板只列这个来源自己的索引**）。
最长那个 108 字符：

```
payload.elasticsearch.node_stats.indexing_pressure.memory.current.combined_coordinating_and_primary_in_bytes
```

**打错一个下划线就是静默 0 条**——ES 对不存在的字段不报错。补全防的是这个。

### 做了什么

`pure.js` 三个纯函数 + 界面接线：

- `fieldCompletion(query, caret)`：光标前**那个词**是不是字段名。回 `{ field, start, end }`
  （`start`/`end` 是它在整个查询串里的下标，界面据此**原位替换**）或 `null`。
  `null` 的判据：词里已有 `:`（光标在值那一侧）、词里有引号 / 结尾 `*` `~` / 含 `/`（值的写法）、
  词本身是大写 `AND`/`OR`/`NOT`。**小写 `and` 不吞**——那在 Lucene 里是用户真在找的词。
- `fieldCompletionApply(query, pick, name)`：原位替换成 `字段:`，回 `{ q, caret }`（光标落冒号后）。
- `fieldCompletionChoices(fields, typed, limit)`：**前缀优先、子串次之**，上限 20。
  单独写而不复用 `fieldChoices` 的原因是真机量出来的：那个是子串匹配，打 `cont` 会给出 **62 条**
  候选（`host.containerized` 也在里面），而补全要的是「我正要打的那个名字」。

界面侧：查询串那一格包进 `.ll_qPick`（候选浮层贴着自己开、同宽），三种状态各有各的话
（加载中 / 拉失败的原话 / 有候选就画；命中 0 个不画；Loki 不给）。方向键挪、回车选、Esc 收。

三条判据（与筛选框、分组框同源）：

1. **补一个字段名 ≠ 查一次**：点候选只填进框里，不发 `/query`。
2. **自己拉字段清单**（第一版写反了，维护者看图后否掉）：候选用的那份清单在**第一次需要时
   自动拉**。第一版是「没拉过就提示用户先去展开字段面板 / 点开分组候选」——那是把面板自己的
   懒加载细节摊给了用户，而且正好在最需要它的那一刻挡路。当初的顾虑（「每敲一个字打一枪」）
   本来就不成立：`loadFields` 自带两道闸——按来源的缓存（`fieldFetchNeeded`）与在途闩
   （`fieldsFlightRef`）。真机实测：在一个没拉过的来源上直接打字，`/fields` 只打 **1** 次；
   接着连打 6 个字符，`/fields` 打 **0** 次。
3. **原位替换**：句子中间补全不许把后面的内容顶掉。

### 真机上抓到的两个坑（都是这一刀自己引入的）

**坑一：补完之后浮层不收起。** `focus()` 会同步触发 `onFocus`，而那一刻 React 还没用新的
`query.q` 重渲染——`onFocus` 读到的是补全**之前**的值，按旧光标判「该开」，把刚收起的浮层又打开了。
真机看到的就是「框里写着 `container.name:`、浮层还列着 20 条字段候选」。

**坑二：只把 `setSelectionRange` 挪到 `focus()` 之前不够。** DOM 里那个 `<input>` 的 `value`
这时还是旧的（`cont`，长度 4），`setSelectionRange(15, 15)` 会被夹到 4。

修法：先把新值直接写进 DOM（`el.value = next.q`），再摆光标、再 focus。这不违反受控组件口径——
下一轮渲染 React 用同一个串覆盖它。

**这两个坑冒烟抓不到**（桩不接 DOM，`ref.current` 恒空），是浏览器里点出来的。所以把那条判据的
**前提**钉进了纯逻辑用例：「补完 = 光标在冒号后，且 `fieldCompletion` 对该位置回 `null`」；
反过来说，光标退回冒号前时判据必须仍回字段名那一侧——否则那个 `null` 说明不了任何事。

### 关于「1274 个字段」这个数字（曾经的错误）

我一开始把 `_field_caps?fields=*`（**不带索引**）的 1274 写进了注释和回复。那是整个集群的字段，
不是这个来源的。面板走的是带索引的表达（`app-logs-*`），真机 `/fields` 回 **92**。
注释已改，并注明「这个数字别照抄全集群那份」。

### 门禁

`client-pure` **238**（+17：补全词法 9 条、前缀优先 6 条、光标前提 2 条；另有 1 条把第三十三刀
钉反的断言改回来）、`client-smoke` **110/110**（+2：补全接线 / 两条空态）、
`check-i18n` 本包 **195 条键**（自动化之后那个「先去点别处」的键删掉了，净增 0）。

**反例（三条实跑变红）**：候选 onclick 直接拼 `名字 + ':'`（不原位）→ 冒烟红；
补完之后顺手 `runQuery` → 冒烟红；删掉 `:` 那条判据 → 纯逻辑 2 条红
（冒烟**抓不住**这条，如实记在用例注释里：删掉之后 `container.name:pro` 整词仍匹配不到字段，
画出来同样是 0 行）。

真机验活（ES 来源「一」，`172.172/16` 段上那台 `:19200`；主机号不入库）：拉字段清单 → 92 条；打 `cont` →
20 条候选全以 `container` 开头（`host.containerized` 已退场）；点第一条 → `container.name:`、
光标第 15 位、浮层收起；句子中间 `cont AND error` → `container.name: AND error`（后面没被顶掉）；
补完实查 `container.name:prometheus AND error` → 命中 **239**。

### 还没做的

- **值那一侧不补**（`container.name:` 之后没有值候选）。值候选要按字段拉聚合、还要处理
  「这个字段能不能聚合」，是另一件事——用户这次选的也是「只补字段名」。
- **没有「浏览全部字段」的入口**：`Ctrl+Space` 或空光标时列全部，还没做。
- **Loki 不给补全**：`{job="app"}` 不是「字段:值」形状，硬套会把人引到错的写法上。
  要做是一套单独的 LogQL 补全。

## 第三十五刀：正文里的命中高亮（2026-10-18）

用户发来一张 Kibana Discover 的截图（`message : error` 的查询，正文里的 `ERROR` 被亮黄底标出来）
说：

> 做一下类似于这样的高亮吧

看起来是个纯样式活，实际不是——**颜色是最容易的那一半**。

### 关键决定：位置由**后端**给，界面不自己匹配

第一反应是「拿查询串去正文里找出现位置」。这条路上有三个坑，每一个都会让标注**看起来对、
实际错**：

| 查询串 | 字面匹配会标什么 | 实际命中什么 |
|---|---|---|
| `stream:stderr` | 正文里找 "stream"、"stderr" | 命中在**字段**上，正文里可能一个字都没有 |
| `error -failed` | 找 "error" 也找 "failed" | `failed` 是**排除**，正文有它反而不命中 |
| `error*` / `err~` / `"Failed to"` | 找字面 "error*" | 通配 / 模糊 / 短语，各有各的规则 |

而**标错比不标更坏**：用户看到高亮会以为「这是引擎认出来的命中」，于是拿它当证据。
所以走 ES 原生 `highlight`：

```
body.highlight = { fields: { message: { number_of_fragments: 0, pre_tags: ['\u0001'], post_tags: ['\u0002'] } } }
```

- `number_of_fragments: 0` 要**整段正文**（默认只回一句片段，而我们行里画的是全文）；
- 标签用 **U+0001 / U+0002** 两个控制字符，不用 `<em>`：日志正文里本来就可能有 HTML 标签，
  撞上就分不清哪个是引擎标的；
- 只在 `q !== ''` 时发这个参数（全量查询没有「命中」可言）。

服务端把带标记的片段换算成 `LogLine.highlights: Array<[start, end]>`（字符下标），
界面拿到的是**区间**，不是一段要 `dangerouslySetInnerHTML` 的 HTML——那条路会把日志正文
当 HTML 执行。渲染走 `<span>` 文本节点，正文永远是不可信输入。

### 真机实测推翻了第一版的判据（两处）

**① 「去掉标记后 === 原文」在真机上一条都过不了。** 第一版就是这么写的，结果所有行都没有
高亮，看起来像功能没生效。实测 ES 7.10.2：

```
message    "... to ERROR\n"      ← 正文末尾有换行
fragment   "... to \u0001ERROR"   ← 没有那个换行，长度差 2
```

ES 会**裁掉末尾空白**。正确的判据是：片段去掉标记之后的**字符序列必须是原文的前缀**
（所以现在是边扫边逐字符比对，不一致立刻放弃）。

**② 命中落在正文末尾时没有后标记。** 上面那个 `\u0001ERROR` 就是——`post_tags` 不回来。
不能当成「这段不算」丢掉，那恰好是最常见的一种命中（一行日志以 `ERROR` 收尾）。
未闭合的标记一律算「到片段结尾」。

两条都写进了 `highlightRanges` 的注释与 `elastic.test.ts` 的用例，免得下次有人「简化」回去。

### 界面侧

`pure.js` 的 `messageSegments(message, ranges)` 把区间切成 `[{ text, hit }]`。它只做防御性整理
（后端已保证升序/不重叠/不越界，但界面不该依赖那个）：越界、倒序、非整数 → **整体放弃**回纯文本；
相邻重叠合并；返回的段拼起来必须**正好等于原文**——高亮不许吞字。

没有区间时走原来那条路径（一个文本节点），与加高亮之前逐字一致。

底色用 `--dsw-alias-state-warn-secondary`，**不用截图里那种纯黄**：纯黄是 Kibana 自己的主题色，
搬过来会跟级别标记（error 红 / warn 黄）抢同一套语义，且亮黄底配浅色正文对比度不够。
不加内边距、不给圆角：高亮是文本属性，盒子感会让一行字看着像被切成几块
（`2px` 圆角那版被仓库的圆角守卫拦下来了——它只允许官方尺度 token，这条拦得对）。

### 门禁

`client-pure` **244**（+6：切片 / 无区间 / 整段 / 畸形区间整体放弃 / 重叠合并 / 空正文）、
`elastic.test` **48**（+9：换算 / 裁掉末尾空白也认 / 无后标记 / 多处 / 合并 / 对不上不标 /
空与畸形 / 越界 / lineFromHit 带不带这个键）、`client-smoke` **111/111**（+1：画出来 + 没区间不画）。

**反例（实跑变红）**：`renderMessage` 直接输出 `line.message`（不切片）→ 冒烟红。

真机验活（ES 来源「一」）：`q=timeout` → 53 行、**53 段高亮**全部是 `timeout`，
底色 `rgb(247, 173, 49)` = `state-warn-secondary` 的实际取值。
（服务端半体改了要重新挂载才生效——这次是切换插件启用开关触发的。）

### 还没做的

- **只标 `message` 这一个字段**。ES 也能对 `container.name` 之类的字段出高亮，但行里画的是
  message，标在别处没有落点。
- **详情面板里的原文（`raw`）不标**：那是给「看全貌」用的，标了反而不好复制。
- **不做「命中总数 / 上一处下一处」那种导航**（Kibana 的 `Ctrl+F` 式跳转）：一行日志通常只命中
  一两个词，加了是一套要维护的游标状态。

## 第三十六刀：截断提示分两档——「确定还有」与「可能还有」（2026-10-18）

用户看着结果区的 `已截断：达到条数上限` 问：

> 这个截断对分页有影响吗

查下来：**对分页没有坏影响，但那句话在边界上会说谎**。

### 查清的事实

截断提示与「下一页」**共用同一个判据**（`elastic.ts`）：

```js
const limited = query.limit > 0 && lines.length >= query.limit
if (limited && Array.isArray(lastSort)) result.nextCursor = encodeSearchAfterCursor({ ... })
```

翻页本身是好的（PIT + `search_after`，真机验过第二页能正常取）。
问题在**边界**——真机实测（命中 53 条）：

```
limit=53 → returned 53, total 53 → limited=true   ← 报「已截断」，可一条都没漏
limit=54 → returned 53, total 53 → limited=false  ← 正确
```

代价不止文案：那个判据同时决定**给不给「下一页」**，而翻过去是 **0 行**（真机验过），
用户会以为系统坏了。

顺带查清一件事：这个「可能还有」的口径是从 docker 的 `limited` 继承来的，
`cursor.ts` 的注释写得很清楚——「达到 limit：**可能还有**（不是「确定还有」）」。
**注释是诚实的，界面把「可能」渲染成了「已截断」**，语气从推测变成了断言。

### Kibana 怎么做的（7.10，读源码）

它当时没有「截断」这回事：`size` 固定 `discover.sampleSize`（默认 500），一次全拿、前端分页。
「有限结果」的提示用另一条判据（
[`doc_table.ts`](https://github.com/elastic/kibana/blob/v7.10.2/src/plugins/discover/public/application/angular/doc_table/doc_table.ts)）：

```js
shouldShowLimitedResultsWarning = () =>
  !$scope.pager.hasNextPage && $scope.pager.totalItems < $scope.totalHitCount;
```

文案（[`doc_table_strings.js`](https://github.com/elastic/kibana/blob/v7.10.2/src/plugins/discover/public/application/angular/doc_table/doc_table_strings.js)）：

> **Limited to {resultCount} results. Refine your search.**

三处值得学：

1. **它比的是「本页实际有的」与「ES 声称的总数」**，不是「条数上限」与「返回行数」——
   所以命中恰好等于上限时两边相等、**不会误报**，天然绕开了我们那个边界。
2. **文案不说「已截断」，只说「Limited to N」**，也不说「还有多少」：ES 默认只回 `10000 / gte`，
   连它自己都是下界，说「还有 N 条」等于撒谎。
3. **给动作**：`Refine your search`。

它在第 7 版就有公开抱怨（[issue #142117](https://github.com/elastic/kibana/issues/142117)：
「所谓 sampleSize 其实就是 size，分页数按 500 算而不是命中总数」），维护者承认
「去掉 500 的限制是长期目标」。所以不是全盘照抄的对象，但上面三条判据是对的。

**我们比它强的地方**：显式 `track_total_hits: true`，总数是真的（实测 26280 是真值），
所以能判得比它准——`matched < limit` 就是**确定没有**了。

### 改了什么

`TruncationReason` 加了 `hit_limit_maybe`，判据收成一个共用函数
`src/query.ts` 的 `pageLimitFlags({ returned, limit, matched, totalKnown })`：

| 情形 | 返回 | 界面说法 |
|---|---|---|
| `matched > limit`（精确总数） | `limited` | `已截断：达到条数上限` + 给「下一页」 |
| `matched === limit`（精确总数） | `maybeLimited` | `已显示前 N 行，可能有更多：把条数调大可以看得更全` |
| `matched < limit` | 都不 | 不报 |
| 无精确总数（Loki / `relation: gte`） | `maybeLimited` | 同上（不硬猜） |

- **ES**：`totalKnown` 由 `relation === 'eq'` 决定，判据交给 `pageLimitFlags`。
- **Loki**：`/query_range` 不报总数，`slice.limited` 归到 `maybeLimited`；
  `groupCapped`（末组补不齐 = 这一页自己确定有缺口）仍留在 `limited` 那一档——那不是
  「可能还有更多」，是「这一页不完整」，措辞不能混。
- **游标只在 `limited`（确定还有）时给**：`maybeLimited` 意味着这一页已经覆盖全部命中，
  给游标等于给一个必然空页的入口。
- **界面两句分开说**；同时出现时两句都说（先「可能」后「确定」）。其余理由（分片失败 /
  超时 / 游标过期）仍如实说「已截断」——那些是确定信号，弱化它们才是错的。

### 门禁

`query.test` **33**（+7：确定/恰好/少于/无总数/没到上限/limit=0/两档不同理由）、
`elastic.test` **52**（+4：恰好等于不给游标且关 PIT / 多于给游标 / 少于不报 / `gte` 退回「可能」）、
`client-smoke` **112/112**（+1：两种说法的文案与「下一页」的出现条件）、
`check-i18n` 本包 **197 条键**（+2：`meta.maybeMore`、`status.hit_limit_maybe`）、本包 **528**。

**反例（实跑变红）**：
- 把「可能还有」并回「已截断」那一句 → 冒烟红；
- `pageLimitFlags` 退回旧的 `lines.length >= limit` 一句话 → 纯逻辑 + wire 共 **4** 条红。

真机验活（ES 来源「一」，1 小时窗，`q=timeout`，命中 53）：

```
limit=53 → reasons ["hit_limit_maybe"]  hasCursor false   ← 修好的那一格
limit=54 → reasons []                   hasCursor false
limit=2  → reasons ["hit_limit"]        hasCursor true
```

界面上：`返回 53 行 命中 53 已显示前 53 行，可能有更多：把条数调大可以看得更全`（无「下一页」）；
`返回 2 行 命中 53 已截断：达到条数上限`（有「下一页」）。

（服务端半体改了要重新挂载才生效——这次又是切换插件启用开关触发的。）

### 还没做的

- **没有做 Kibana 那种「精确总数封顶」**：我们本来就发 `track_total_hits: true`，
  在大集群上这确实有代价（跨分片精确计数）。目前这台 26k/小时的量级上 `< 200ms`，
  没到需要改的程度；真到几亿条再说，那时该照 Kibana 那样接受 `gte` 并退回「可能」这一档——
  判据已经支持了。
- **`max_result_window` 那一档没有真机验过**：ES 默认 10000，但我们是 PIT + `search_after`，
  不落在这个窗口里；它是给未来的偏移分页留的位置。

## 第三十七刀：来源列表的布局（2026-10-18）

用户发来来源配置区的截图：

> 如果可以的的话把这个布局再优化一下

看着是纯样式活，但先量了一遍——量出**三个**真问题，都不是「好不好看」。

### 量出来的三个问题

真机（872px 宽的卡片）逐格 `getBoundingClientRect`：

| 问题 | 数字 |
|---|---|
| ① 表头与输入框错位 | 「地址」表头 x=**790**、它下面的输入框 x=**753**，差 **37px** |
| ② 行高不齐、按钮悬空 | Docker 行 **52px**、ES 行 **92px**；两个按钮 `align-items:center`，浮在 ES 行的半空中 |
| ③ 选项被硬切 | 类型列 140px，而最长的「Docker（采集来源）」文字就要 **121px** + 内边距 24 + 原生箭头 20 ≈ **165px** → 截成 `Docker（采集...` |

外加一个：索引表达式的占位符 40+ 字，在约 300px 的格里被切成 `…再留空…`。

### 根因与改法

**① 表头错位**：`.ll_head` 与每个 `.ll_row` 是**两个独立的 grid**，各算各的列宽。动作位写的是
`auto`——行里两个按钮有宽度（44 / 46），表头里那两个空格是 **0**，于是前三列被推歪。

改成**有下限的固定区间** `minmax(44px,72px)`，两处写同一个模板：
- 下限 44 = 中文「保存」的实测宽度；
- 上限 72 ≥ 英文 `Saving…` / `Remove` 的实测宽度（各 67）——**换语言不会溢出**。
  （先试过写死 `44px 46px`，量到英文 `Remove` 是 67px，会截断，所以退回区间。）

**② 行高与按钮**：`align-items:center` → `start`。ES 行多一格「索引表达式」、竖着放两个框，
行因此比 Docker 行高一倍；居中会让保存/删除悬在整行半空、离它要操作的那对输入框很远。
现在按钮与第一行输入框同一条基线，多出来的高度落在最后一格下面——那是那一格自己的事。
按钮同时显式 `height:34px`，与输入框同高（否则它比输入框矮 6px，看着像「贴在上边」）。

顺带把索引那一格降一档（H34 → **H28**）：两个框原来同高同级、看不出主次，而地址是必填、
索引是可留空的。**字号不动**——`.ll_input` 的 13px/1.5 是宿主输入档，单独改会破坏配对
（样式守卫当场拦了，拦得对）。

**③ 类型列**：`minmax(120px,140px)` → `minmax(168px,180px)`。宽度要照顾**最长的那一个选项**，
不是最常选的那一个。

**占位符**：把「留空 = 用地址路径，再留空则 `*,-.*`」整段挪进 `title`（悬停看全），
占位符只说「填什么」。真机验法：`scrollWidth <= clientWidth` 即没被切。

### 门禁

`client-smoke` **113/113**（+1：表头与行的列宽模板**逐字相同** + 类型列下限 ≥160px）。
桩不渲染 CSS、量不到真实坐标，所以那条用例断言**模板**而不是坐标——「两处逐字相同」正是
它们能对齐的唯一理由。

**反例（实跑变红）**：把表头动作位退回 `auto` → 冒烟红。

真机验活（872px 卡片）：
```
表头 x: 354 542 754 1054 1134
行   x: 355 543 754 1053 1133     ← 逐列对齐
行高  : 52 / 86                    （原来 52 / 92）
类型列: 180px，最长选项完整显示
索引占位符: 未被切（scrollWidth 291 = clientWidth）
```

### 还没做的

- **窄屏（< 700px）没有实测**：五列的 grid 在这个宽度下会挤，那时该让「地址」列折到下一行。
  这台宿主窗口够宽，没到需要它的时候。
- **没有做「行内展开/收起」**：现在每条来源都常驻展开。来源多了（>5）该收成可折叠的一行，
  但那是交互改动，不是这次要解决的问题。

## 第三十八刀：Docker 那一档的交互（2026-10-18）

用户发来 Docker 查询区的截图：

> 重构一下这个docker的界面的交互逻辑

先量了一遍再动手——这一档有**三个真问题**，其中一个是静默错。

### 量出来的问题

**① 两个按钮吃掉了整行。** `.ll_dockerGrid` 的两个动作位写 `auto`，在 872px 卡片里：

```
容器 130px | 时间窗 120px | 行数 84px | 「刷新」248px | 「看日志」258px
```

两个按钮占掉 **58%** 的宽度，而真正要选的**容器只有 130px**——容器名（`container.name`
那种）恰恰是这一行最长的内容。改成 `minmax(180px,1.6fr) minmax(110px,130px) minmax(76px,96px) auto auto` 之后：

```
容器 490px | 时间窗 130px | 行数 96px | 「刷新容器清单」68px | 「看日志」56px
```

**② 换容器之后日志不跟着变，而且一个字都不提（这是真错）。** Docker 的日志是**一次按下来
就固定的快照**（`openDockerLogs` 是一个手动动作，不像 ES 那样条件一变就重查）。于是：

```
选中 A → 看日志 → 屏上是 A 的日志
换成 B →（不点「看日志」）→ 屏上还是 A 的日志，界面上没有任何提示
```

用户会拿着 A 容器的日志排查 B 容器的问题，而且**看不出自己拿错了**。真机验过。

改法：记下这批日志是**按什么条件**拉的（`dockerRunKey(container, preset, tail)`），
渲染时与当前条件比，不一致就在**日志上方**说一句：

> 下面这份日志是上一次拉取的，不是「app-svc-3」现在的：改完条件要点「看日志」才会重新拉。

摆在**上方**而不是下方：用户是往下读的，先说清「你看到的不是现在的」，再读那些行；
写在最后一行等于「读完才知道读错了」。

判据与 ES 那边 `hint.staleResults` 是**同一条**（条件变了、结果还是上一次的，必须说出来），
只是那边判查询串，这边判容器/窗口/行数三个。

**③「刷新」这个名字说不清刷的是什么。** 它重拉的是**容器清单**（容器起停之后才会变），
不是屏幕上那份日志。旁边就是「看日志」，两个都叫得挺像，点错了只会觉得「没反应」。
改名为**「刷新容器清单」**，并给它一个 title 解释为什么需要它。

### 门禁

`client-pure` **248**（+4：条件键三项 / 空键不算 stale / 任一项改即 stale / 数字与字符串不敏感）、
`client-smoke` **114/114**（+1：换容器要说「上一次」+ 重拉后提示消失；另有 4 条既有断言
跟着改名更新）、`check-i18n` 本包 **200 条键**（+3：`hint.dockerStale`、`btn.refreshContainers`、
`hint.refreshContainers`）。

**反例（实跑变红）**：把那条 stale 提示去掉 → 冒烟红。

真机验活（Docker 来源「161」，目标 `目标2`）：
```
列宽: 490 / 130 / 96 / 68 / 56        （改前 130 / 120 / 84 / 248 / 258）
选中 A → 看日志 → 200 行，无提示
换到 B → 提示出现：「…不是「app-svc-3」现在的…」
```

### 还没做的

- **日志区没有「跟着容器自动重拉」**：那会让换容器时打一枪后端（而 Docker 那条路是
  `docker logs`，重的）。现在的取舍是「显式那一按 + 明确说清这是旧的」，与 ES 那边
  「改了条件不自动查」同一条。要自动的话得先有防抖与取消，那是另一件事。
- **日志行不能点开、不能筛**：`/api/dsh-docker/logs` 回的是纯文本，没有结构化字段
  （它不像 `docker_logs` 工具那样给每行带 metadata）。要做得先换那条路。
- **没有「复制这段日志」**：长日志目前只能选中复制。

## 第三十九刀：容器下拉换成可搜的自绘候选（2026-10-18）

用户发来一张截图：容器下拉弹开后**铺满整个面板**，从 `app-svc-1` 一路列到
`app-svc-12`，盖住了下面的「看日志」按钮和整个结果区。

> 优化一下docker的ui和交互

### 问题不在「样式不好看」

那是原生 `<select>` 的弹层。三件事它天生做不到，而这台机器上 34 个容器把三件事全踩中了：

1. **高度不受控**：弹层铺满面板、盖住下面的东西（截图里连「看日志」都被压住）；
2. **不能搜**：找 `batch-job-a` 只能滚。34 个名字里有一堆长得很像的（`app-svc-1` /
   `app-svc-3` / `app-svc-8` / `app-svc-4` / `app-svc-5` / …）；
3. **样式改不动**：原生弹层是浏览器画的，字体/行高/圆角/投影全不归我们管。

### 改法：换成项目里**已经验证过**的那一套

不是发明新控件——「分组字段」那一格（`.ll_pick`）和查询串的字段名补全早就是自绘候选了。
容器这一格现在与它们**共用同一套**：`position:relative` 的格子 + 自己画的候选 +
方向键/回车/Esc + 命中 0 个不画。三处一个手感，用户不用学两套。

四条判据照搬过来（都是那两处踩出来的）：

- **命中 0 个不画浮层**，不是一个空盒子（空盒子比不画更像坏了）；
- **`onMouseDown` 里 `preventDefault`**：不这样点候选会先 blur、把浮层关掉，点不中；
- **当前选中的那条带勾**（`ll_pickDone`，`margin-left:auto` 排到行尾）：34 个名字里
  得看得出哪个是当前的；勾跟着文字尾巴跑就没法一眼扫出来；
- **页脚报「命中 N / 共 M」**：收窄时要看得见还剩多少（与分组框的「共 N 个字段」同一条）。

收窄规则与字段补全**同一条**（`containerChoices`）：前缀优先、子串次之、大小写不敏感、
保持清单原顺序。**名字与 id 两边都能搜**——真机上用户既可能记得 `app-svc-3`，
也可能只记得短 id。

### 一个容易踩的接线细节

输入框显示**三个不同的东西**，混了就出错：

| 时刻 | 显示 |
|---|---|
| 过渡态（加载中 / 失败 / 空清单） | 那句状态，且 `readOnly` |
| 有清单、没在搜 | **选中的容器名**（`containerLabel`） |
| 有清单、正在搜 | 搜的那串（`containerQuery`） |

第二与第三条要不要分开很关键：打完字**没选**就点别处，输入框必须退回显示选中的那个，
而不是留着一个没生效的搜索词——否则看起来像已经筛过了。`pickContainer` 里把
`containerQuery` 清空就是这件事。

### 门禁

`client-pure` **254**（+6：全部保持原顺序 / 前缀优先 / id 也能搜 / 没有 name 用 id /
大小写不敏感与空结果 / 脏数据跳过）、`client-smoke` **115/115**（+1：搜、方向键+回车、Esc、
命中 0 个不画；另有 6 条既有断言跟着换控件改写）、`check-i18n` 本包 **203 条键**
（+3：`placeholder.container`、`hint.containersCount`、`hint.containersMatched`）。

**反例（实跑变红）**：候选不过滤（`containerChoices(containers, '')`，回到「只能滚」）→ 冒烟红。

真机验活（Docker 来源「161」，**34 个容器**）：
```
点开:  34 行，浮层 max-height 216px 自己滚（原来铺满整个面板）
搜索:  `batch` → 2 个；`service` → 10 个（页脚「命中 10 个 / 共 34 个」）
空结果: `zzz` → 不画浮层
清空:  回到 34 个
当前项: app-svc-1 那一行带勾（唯一一个）
```

### 还没做的

- **没有按「状态 / Compose 项目」分组**：Docker 面板本身有 compose 项目视图，容器清单接口
  也回 compose 信息，但那个接口给 loglens 的只有 `id` / `name` 两项。要做得分组头，
  是另一件事。
- **没有「只列正在跑的」之外的过滤**（比如「只看 unhealthy」）：那需要 `/api/dsh-docker/containers`
  回更多状态字段。
- **日志区本身仍是纯文本**（第三十八刀记过：那条路没有结构化字段）。

## 第四十刀：撤掉「刷新容器清单」，收进候选页脚（2026-10-18）

用户指着主行那颗按钮问：

> 这个刷新按钮有存在的必要吗

**该撤。** 判据三条：

1. **权重不对。** 同一个「重拉清单」的入口，在字段候选里只是浮层页脚的一个小链接
   （`.ll_pickRefresh`：12px、透明底、hover 才有底色）；而这里它是与「看日志」**并列的实心按钮**。
   两颗同级，可只有一颗是该先按的。
2. **价值被自动拉覆盖了大半。** 选中 Docker 来源会拉、换 Docker 目标会拉、同一个键不重拉
   （第三十八刀那条 effect）。真正需要手动重拉的只剩一种情况：**容器起停之后清单旧了**——
   低频事件，不该常驻占一格的宽度。
3. **第三十七刀只是改了名、加了 title。** 当时以为「说清它是什么」就够了，但用户这一问说明
   **改名解决不了「它不该在这儿」**。名字再准，位置错了还是碍事。

### 改了什么

- **主行从五格变四格**：容器那一格从 490px 拿到 **558px**（省下的就是那颗按钮的宽度 + 间距）。
- **入口收进容器候选浮层的页脚**，与字段候选「共 N 个字段 + 刷新」**逐字同一套**
  （同一个 `.ll_pickFoot` / `.ll_pickRefresh`），文案只留「刷新」（上下文已经说了刷的是什么）。
- **失败态与空清单态也各有一颗**：失败给「重试」、空清单给「刷新」。
  撤掉主行按钮之后，它们是**唯一**的重试入口——不给就是功能丢失。
- 成功态那颗的 title 照旧说清「容器起停之后它才会变；这里刷新的不是下面那份日志」。

### 门禁

`client-smoke` **115/115**（4 条既有断言改写：主行不该再有那颗按钮 / 重试在候选里 /
刷新在页脚里且能真的重拉）。

**反例（实跑变红）**：页脚里不给刷新（等于「撤掉主行按钮但没补新入口」，功能丢失）→ 冒烟红。

真机验活（Docker 来源「161」，34 个容器）：
```
主行:  容器 558px | 时间窗 130px | 行数 96px | 看日志 56px      ← 四格，没有刷新按钮
候选页脚: 「共 34 个容器」 + 「刷新」（h 29px）
失败/空: 页脚分别是「重试」/「刷新」
```

### 还没做的

- **没有做「容器起停后自动感知」**：Docker 面板那边有事件流（`docker_events`），
  loglens 这一档没接。接了就能连这颗页脚刷新都不需要——但那是跨插件的事件订阅，
  比这一刀大得多。

## 第四十一刀：来源列表的交互（2026-10-18）

用户发来来源配置区的截图：

> 这个ui也要美化一下

第三十七刀重排过这块的**几何**（列宽、行高、按钮基线）。这一刀处理的是**交互语义**——
量出来三处，都不是「不好看」。

### ① 保存按钮恒亮：看不出哪一行有未保存的改动

原来每行都摆一颗实心「保存」，不论改没改过。三个后果：

- **多行时看不出哪个没存**——改了三个来源，真正的风险是漏存一个；
- 每行一颗高权重按钮，整块区域全是「动作」，扫不到内容；
- 想「刷新一下」的人会去点它（其实什么都不会发生）。

改法：`draftDirty(draft, saved)` 判「这一行改过没有」，没改动时降为 `.ll_btnGhost`
**并禁用**（一个按了不会有任何反应、也不该有反应的按钮，留着能按就是在骗人），
title 说明「这一行没有改动」。

判据**复用 `draftPayload`** 而不是自己拼字段：那个函数已经做对了两件事——trim 首尾空白、
只带该类型真正下发的字段（docker 不发 url、非索引类型不发 index）。所以：

```
改完又改回去        → 不脏（判据是「与落盘比」，不是「碰过没有」）
只多了个首尾空格    → 不脏（trim 过，与下发口径一致）
新建行（还没 id）   → 恒脏（它总得能保存）
```

落盘快照（`savedDrafts`）只在 `applyConfig` 里跟着服务端那份一起刷新——那正是唯一真正落盘的
时刻（保存成功后会重新读一次配置），所以它天然与「已保存」对齐，不需要另写同步逻辑。

### ② 索引表达式那格**填上内容之后就认不出来了**

它原来只有占位符：空着时看得懂（「索引表达式，如 app-logs-*」），一旦填了 `app-logs-*`
就再也看不出这一格是什么——截图里它悬在地址框下面，像个没头没尾的输入框。
地址那格有列头「地址」管着，而**列头盖不住第二行**。

改法：加一个行内小标签「索引」（11px / 16px，三级文字色）。有了标签，占位符就不必再重复
「索引表达式」四个字，收短成「如 app-logs-*」（真机验过 `scrollWidth <= clientWidth`，不再被切）。

### ③ 删除按钮的权重

保持官方的**描边危险**配方（红字红边、透明底、hover 才有 8% 红底）。看着像「不够美化」，
但那是宿主的规范：实心红在每行常驻会因太扎眼而被误点，做成与「保存」同级又会和主操作抢注意力。
仓库的守卫（`client-style-spec.mjs` 检查十一）也钉着这条。

### 门禁

`client-pure` **261**（+7：一模一样 / 任一字段变 / 只多空白 / 改完改回去 / 换类型 / 新建恒脏 / 畸形入参）、
`client-smoke` **117/117**（+2：保存按钮三种状态 / 索引标签存在；另 2 条既有断言从「按占位符找」
改成「按 title 找」——它们本来按文案定位，一次文案收短就打红了，那是脆弱的定位方式）、
`check-i18n` 本包 **205 条键**（+2：`hint.noChanges`、`field.index`）。

**反例（两条实跑变红）**：保存按钮退回恒亮 → 冒烟红；索引格不给标签 → 冒烟红。

真机验活（872px 卡片）：
```
未改动的行: 保存 = ll_btnGhost + disabled，title「这一行没有改动」
改过之后:   保存 = ll_btn + 可点（真实敲字触发，非桩）
改回原值:   又变回灰的（一个字段都不用点，就知道自己有没有漏存）
索引那格:   标签「索引」+ 占位符「如 app-logs-*」，未被切
```

### 还没做的

- **没有做批量保存**（改多行一次存）：现在仍是逐行。行数多了（>5）才值得做。
- **没有「撤销这一行的改动」**：改坏了只能手改回去。判据已经有了（`savedDrafts` 里就存着原值），
  加一颗「还原」按钮是顺手的事，但那是新功能、不是这次要解决的问题。

## 第四十二刀：加载中也要点得开（2026-10-18）

用户看着容器那一格的「加载中…」说：

> 这个加载中应该改成可以展开但是有loading效果

### 原来为什么像坏了

```js
const openContainerPick = () => {
  if (dockerBusy || containersBusy || !docker) return   // ← 在途时直接不响应
  ...
}
```

再加上输入框 `readOnly`（过渡态显示那句状态），于是清单在拉的那几秒里：

- **点不动**（`openContainerPick` 提前返回）；
- 输入框里只有一句静止的「加载中…」，**没有任何在动的迹象**；
- 而它其实**正在做事**——这是最糟的一种：用户以为控件坏了。

### 判据：「不可编辑」≠「不可点击」

- **不可编辑是必要的**：那一刻没有可选的容器名，能打字反而是错的（打出来的字无处可去）。
- **不可点击是没必要的**：点开看状态是无害的，而且正是用户此刻最想知道的。

所以 `containersBusy` 从 `openContainerPick` 的拦截条件里拿掉了（`dockerBusy` 与「不是 Docker 来源」
仍然拦——那时按了没有意义）。

### 转圈加在两处，因为两处都是「用户正在看的地方」

| 位置 | 什么时候 | 为什么 |
|---|---|---|
| 浮层里（加载中那一格） | 还没拉到过清单 | 一句话说的是「状态」，转圈说的是「还在动」 |
| 输入框内（chevron 让位） | 同上 | 这一格是视线落点，在动的迹象不该只在点开之后才看得见 |
| 页脚「刷新」 | 已有清单、正在重拉 | 此时 `containerSlot` 仍是 `default`（旧清单还在），浮层走的是「有候选」那一支，没有转圈 |

第三条是实测才发现的：重拉时浮层列着旧候选、页脚写着「加载中…」但**是静止的**——
`containerSlot` 判的是「有没有清单」，而重拉时清单还在。

### 动画的两个细节

- `border-radius:50%` **必须配 `corner-shape:round`**：宿主给所有元素设了 `superellipse`，
  不写这个画出来是圆角方形、不是正圆（仓库守卫检查六当场拦了，拦得对）。
- **`prefers-reduced-motion: reduce` 时停止动画**，但标记仍然在（`animation:none` 而不是
  `display:none`）——系统里关掉动效的人应当得到一个静止的「在拉」标记，不是让它消失。

尺寸取 12px、颜色用 `currentColor`：它是个**旁证**，不该比那行文字更抢眼。

### 门禁

`client-smoke` **118/118**（+1：在途时点得开、浮层与框内都有转圈）。
桩里用一条**永不落地**的请求卡住「在途」那一帧（`runPanelQueryFull` 会 settle 到稳定，正好吃掉它）。

**反例（实跑变红）**：`openContainerPick` 把 `containersBusy` 加回拦截条件 → 冒烟红。

真机验活（人为给 `/api/dsh-docker/containers` 加 3s 延迟）：
```
boxValue:       加载中…
inBoxSpinner:   true
listOpen:       true          ← 点得开
inListSpinner:  true
动画:           ll-spin / 0.8s / border-radius 50%
```

### 还没做的

- **没有骨架屏**：候选列表的骨架（几行灰条）比一句话更接近最终形态，但要先知道会有几行，
  而「不知道数量」正是加载中的定义。转圈在这里是更诚实的选择。

## 第四十三刀：输入框无法清空（用户报的 bug，2026-10-18）

> 有个明显的bug，输入框无法清空

### 根因是一行受控输入的两态写法

```js
value: containerQuery !== '' ? containerQuery : containerLabel
```

把字删光的那一刻 `containerQuery` 变成空串，被这句判成「**没在搜**」，显示值立刻退回选中的
容器名。表现出来就是「最后一个字永远删不掉」：

```
框里 app-svc-1 → 删到 e（还在）→ 再按 Backspace
→ containerQuery 变成 ''
→ value 被算成 containerLabel → 框里又弹出 app-svc-1
```

受控输入的 `value` 不由用户决定时，浏览器就表现为**卡住**。这类 bug 有个共同点：
它只在「删到最后一个字符」这一刻出现，所以手快的人会以为是自己点错了。

### 改法：把一个「空串」拆成两个状态

`containerQuery` 从两态改**三态**：

| 值 | 含义 | 输入框显示 |
|---|---|---|
| `null` | **没有在搜** | 选中的容器名 |
| `''` | 在搜、且词是空的（用户把字全删了） | 空 |
| 非空串 | 在搜 | 那一串 |

`pickContainer`（选中之后）设 `null` 而不是 `''`——选中之后该看到的是**那个容器的名字**，
不是空白（这一点第一版写成了 `''`，被新用例当场抓到）。

### 连带修掉的一个状态残留

清了搜索词之后**换一份新清单**（换目标 / 重拉）会留下尴尬态：`container` 已经是新清单的第一条
（候选里带勾），而输入框因为残留的 `''` 画成一个**空盒子**——看起来像「什么都没选」。

所以 `loadContainers` 拿到新清单后把 `containerQuery` 重置为 `null`。

### 门禁

`client-smoke` **119/119**（+1：一个字一个字删到空，每一步都断言显示值；再加「重拉之后回到
显示选中的那个」）。

**反例（实跑变红）**：退回两态写法 → 用例报 `删到 "" 时输入框该显示它，实得 "app-svc-1"`
——正是用户在真机上看到的那个现象。

真机验活：
```
initial: app-svc-1（正确显示选中的那个）
app-svc-1 → app-svc- → app-svc → app-sv → app-s → app- → app → ap → a → ""   每一步都如实回显
清空之后候选恢复 34 个
```

### 踩坑记录：这个环境里 `pnpm --filter … build` 会静默不更新产物

第一次做反例验证时用例**没有变红**，查了半天才发现 `client.js` 里根本没有补丁——
`pnpm --filter @hyzyn/dsh-loglens build >/dev/null 2>&1` 在几条命令串里跑时没真正执行到
`build-client.mjs`。后来改成直接 `cd packages/loglens && node scripts/build-client.mjs` 就稳了。

**教训**：做反例验证时必须**先确认补丁进了产物**（`grep` 一下 `client.js`），
否则「用例没红」会被误读成「用例不严格」——这次差点因此把一条好好的用例改坏。

## 补英文 README（2026-10-18）

本包是**复杂档**（README > 250 行 + 权威 `DEFECTS.md` + 包内 `docs/`），按
[docs/conventions.md § 文档分档](../../docs/conventions.md#文档分档) 纪律 2「中英同结构」，
复杂档与中等档包都该有 `README.en.md`——这个包此前**只有中文版**，而它恰好是本仓对外
面向最广的那几个包之一。补齐 [README.en.md](./README.en.md)：

- **七个章节与中文版逐一对应**（现在能做什么 / HTTP 面 / 来源地址怎么写 / 解剖 / 开发 /
  安装 / 已知限制），含「已知限制」里那三个子条目（时间分布 / 按值分组 / 点桶下钻）。
  结构一致性是**可验的**：`grep '^## '` 两版各七条、顺序相同。
- **不是摘要**：与 `docker` / `tty` / `codegraph` 的英文版同一口径——完整对应翻译，不删信息。
  实测行数 341 → 489：中文单行信息密度高，英文忠实对应必然更长，**行数不是判据**。
- 中文版补上了语言切换行 `中文 | [English](README.en.md)`（这一行此前缺失，其余有英文版的包都有）。
- `files` 里加 `README.en.md`：`npm pack` 其实会自动收录 `README.*`，但写上它换来一条**可判定**的
  事实——`check-package-contents` 的第 2 条判据是「`files` 里的字面路径必须存在于磁盘」，
  于是「英文 README 被删掉/改名而没人发现」这件事从此会红。已实测：临时移走该文件 → 守卫
  报 `files 里的 README.en.md 在磁盘上不存在`。

**门槛**：`check-doc-links`（666 条相对链接全部解析，英文版新增的 20 条链接目标逐个存在）、
`check-internal-identifiers`、`check-no-public-ip`、`docs-index`（现算报出
`README.md 341 行 / README.en.md 489 行 → 复杂档`）全绿。

## README 重排：结构对齐 tty，落地记录回填 ROADMAP（2026-10-18）

维护者：「loglens 的 readme 能不能优化一下，就像 tty 一样：开头简单介绍，后面有 `## 特性` `## 安装`
`## 使用`……，还有这个文档内容太长了，是职责过大还是写的不够精简？」

**先量再改**（量出来的结论决定改法）：中文版 354 行、约 4.5 万字，其中「现在能做什么」一节
**24148 字、占全文一半以上**，23 条 bullet 里 **16 条含「第 N 刀」**、13 条含真机读数、11 条带日期。
抽查 `74px` / `42px` / `2878px` / `1494px` / `15242` 等读数——**ROADMAP 里各有一份全文**。
所以这是**职责错位**（README 吃了 ROADMAP 的落地记录职责，同一事实两处展开 = 本仓定义的唯一债务），
**不是文笔不够精简**：要收敛的是重复，不是篇幅。

**改了什么**

- **结构对齐 `tty` / `docker` 的骨架**：`特性` → `安装` → `使用`（六个子节：查询 / 结果区 /
  时间分布与分组榜 / 字段面板 / 筛选与下钻 / Docker 来源）→ `来源地址怎么写` → `agent 工具` →
  `HTTP 面（回环）` → `解剖` → `开发` → `已知限制`。原来的「现在能做什么」拆成「特性」总述与
  「使用」的操作面；`agent 工具` 从 bullet 里的一段话升成一张表（五个工具逐条对齐 `src/tools.ts`）。
- **落地记录不回填 README**：改前改后读数、第几刀、px 值与 CSS 手法**一条都没搬**——它们本来就在
  本文件的各刀记录里（逐条核过：`102px → 28px` 见第 2277 行、`160px → 473px` 见第 2323 行、
  折行 `10 → 6` 见第 2815 行）。README 只留「读者要据此操作」的结论。
- **中英同步**：`README.en.md` 同结构重写（`grep '^## '` 两版各 9 条、顺序相同，六个子节也一一对应），
  不是摘要。
- `docs/troubleshooting.md` 有一条锚点指向旧的 `#现在能做什么`，同步改为 `#特性`
  （`check-doc-links` 当场报红抓到的）。

**实测**：`README.md 354 → 286 行`、`README.en.md 506 → 367 行`。行数不是判据（复杂档无上界），
判据是「同一事实不再两处展开」。

**第二轮：特性节按「架构与契约」重写**（维护者：「特性 写的太多，而且不够技术派」）。第一版把交互细节
（可点例子、级别染色、空桶不给点、两格输入框）都堆在「特性」里，13 条 4569 字——而 `tty` 是 6 条 1668 字。
量出来的偏差就在这里：特性节该讲**架构与契约**，交互细节归「使用」。改成 6 条 3014 字：

- **薄适配器 + 单一执行层**（`src/backends/` 三个适配器、Docker 不进注册表；夹取只在 `src/query.ts`
  一处；面板与工具共用 `src/execute.ts`）；
- **能力靠 `capabilities(): BackendCaps` 自述**，且 `test/capabilities.test.ts` 逐个适配器对账
  （声明 true 必须有那个方法——Loki 的 `follow` 因此诚实地是 `false`）；
- **计数与截断是契约字段**：`LogCounts.totalKnown`（ES 侧 `track_total_hits` + `relation === 'gte'`
  如实置假）、`Truncation.reasons` 里 `hit_limit` / `hit_limit_maybe` 是两个理由、`cursor_expired` 与它们分开；
- **游标是后端私有编码**：Loki 用完整 ts 组（`loglens D03`）、ES / OpenSearch 是 PIT + `search_after`
  （同一快照，过期报 `cursor_expired` 且**不静默重开**）；decode 认版本与来源，解不开就报错；
- **归一化行模型**：epoch 毫秒、`levelInferred` 区分「文档说的」与「正文推断的」、点分标签、
  高亮走后端给的字符区间（`line.highlights`）；
- **默认只读 + 出站围栏**（`src/net.ts` 判解析后的 IP、不跟随重定向、8 MiB / 20s）。

移出去的交互细节**没有丢**，全部下沉到「使用」的对应小节（查询：方言 / 例子 / KQL 提示 / 分片原话 /
条件改过的提示；结果区：级别染色 + 紧凑 3 行；时间分布：点柱放大与空桶不给点；筛选与下钻：点榜下钻）。
中英同步：`README.en.md` 同样是 6 条，事实逐条对齐。

**实测**：特性节 4569 → 3014 字、13 → 6 条；`README.md 295 行`、`README.en.md 376 行`。

**第三轮：开头的「维护者指针」下移到「开发」**（维护者：「这个不要放得太靠前，这不是给使用者看的」）。
第一版在语言切换行下面紧跟着一段「设计与契约的唯一归宿是 docs/design.md；分期与待办见 ROADMAP；
缺陷编号见 DEFECTS」——那是**改代码的人**才需要的入口，摆在开头对「装个插件来查日志」的读者是噪音
（`tty` / `docker` / `codegraph` 的开头也都只有一句话简介，指针另找地方放）。处理：

- 开头只留「一句话简介 + 可查后端 + Docker 的定位」，删掉「（设计里的「选项 0」）」这类内部黑话；
- 三份文档挪到 `## 开发` 节，做成一张三行表（设计与契约 / 分期与待办 + 真机验收结论 / 缺陷编号），
  与 `tty` 的「0.19.0 的修复与索引见 DEFECTS.md」同一位置、同一用途；
- 中英同步（`## Development` 节同表）。

**实测**：`README.md 300 行`、`README.en.md 380 行`；开头到 `## 特性` 之间只剩 6 行。

**第四轮：特性节改书面技术语域**（维护者：「## 特性 写的还是太口语化」）。上一版内容已经换成了架构与
契约视角，但**语域**还是口语：标题「能力靠自述，不靠猜」「游标是后端私有编码，拿错就报错」
「计数与截断是契约字段，不是文案」，正文里的「不许」「绝不」「自己编」「悄悄换掉」「你配的来源」
「照字面标会错一半」。改成书面技术表述，一条条对应：

| 改前（口语） | 改后（书面） |
|---|---|
| 能力靠自述，不靠猜 | 能力自述驱动 |
| 游标是…拿错就报错 | 游标为后端私有编码（解码失败即报错） |
| 计数与截断是契约字段，不是文案 | 计数与截断为契约字段 |
| 适配器不许自己再夹一遍 | 适配器不得重复夹取 |
| 界面绝不拿查询串做字面匹配 | 界面不对查询串做字面匹配 |
| 界面照抄这些判据，不自己编 | 界面直接呈现上述判据 |
| 重开会**悄悄**换掉快照语义 | 重开会改变快照语义 |
| 出站只打**你配的**来源 | 出站限于**已配置**来源 |
| 照字面标会**错一半** | 字面匹配会产生**误标** |
| 文档说它是 error / 从正文推断是 error | 文档标注的级别 / 由正文推断的级别 |

事实一条没动（`BackendCaps` 七个字段、`totalKnown` 与 `relation === 'gte'`、`Truncation.reasons`
的三个理由、PIT 不静默重开、`line.highlights`）；第六条补回了上一轮漏掉的「五个工具全部归 read 档」。
中英同步（`## Features` 同样 6 条、同一语域）。

**门槛**：`check-doc-links`（684 条相对链接、51 条同文件锚点全部解析）、`docs-index`、`check-i18n`、
`check-internal-identifiers`、`check-no-public-ip`、`check-package-contents`、`pnpm aggregate` 全绿；
全仓 `pnpm test` 3127 passed，唯一红的是 `scripts/test/os-consent-scope.test.ts` 的 DSH 版本绊线
（本机 `0.2.1-rc.1` ≠ 方案基准 `0.2.1-alpha.2`，与本次改动无关，前几刀也已登记为既有噪音）。

**没做的**：README 里那十几处**行为级**细节（浮层配方、气泡定位、`<wbr>` 断点）我只保留了结论句，
手法与读数留在本文件——如果以后有人要改那些地方的实现，从本文件的对应「刀」读起。

## 文档偏移的根因与守卫（2026-10-18）

维护者问「loglens 的文档为什么会偏移」。查完 git 历史，根因有三层，逐层都补了对应措施。

### 一、根因（证据）

1. **没有守卫**：`scripts/docs-index.mjs` 只管包清单对账与 ROADMAP 落地记录的位置，**不读 README 正文**
   （它文件头明说「地图是读者视图」，刻意不管）。README 里的技术陈述是否还成立，全靠写的人记得回头改。
2. **一批提交只改代码不改 README**：`d0f786f3c` 把三处交互都改了、**只往 ROADMAP 记了一笔**；
   `207c87edd`（字段上限）、`d882fd229`（Docker 目标下拉）、`242ae8bfe`（`/logs` 返回对象）、
   `2b9cace57`（缺字段 ≠ 没装）、`18a302608`（D04）同样没动 README。
3. **ROADMAP 的体量让漂移被掩盖**：它 4300+ 行，补一段落地记录几乎零成本；而 README 里找对应那句要费力。
   两者都被当成「文档已更新」。代价是可查的：`c58a42ced` 一次清出 **20 处过期陈述**，
   最要命的是 L0 三处还写着「查询未实现」——而那正是这个包对外最常被问到的能力。

仓库对**同一类问题在代码里**是有守卫的（`FIELD_PANEL_WIDTH` 的注释：「CSS 与定位代码不许各写一份，
`client-smoke` 有一条断言盯着」）；这一轮把那条判据搬到**文档**这一侧。

### 二、三项措施

1. **可判定的事实改成「数字 + 常量名」**：README 里每个由常量决定的数，旁边写上常量名
   （`最多 4 列（RESULT_COLUMN_MAX）`、`340px 浮层（FIELD_PANEL_WIDTH）`、`top 8 值（FIELD_VALUES_SIZE）`、
   `2 万字符（RAW_PREVIEW_MAX）`、`最多 20 条（FIELD_COMPLETION_MAX）`、
   `8 MiB / 20s（NET_MAX_RESPONSE_BYTES / NET_DEFAULT_TIMEOUT_MS）`）。
   读者据此能查到权威值，守卫也能断言「这个名字必须出现」。
   **没改成纯指针**：`min(720px, 72vh)`、`300px`、`198px` 这些埋在 CSS 字符串里、**没有导出常量**，
   写成指针等于让读者去翻一个不存在的名字——那比写数字更坏。要指针化得先把它们提成常量，属另一件事。
2. **一致性守卫**：**全仓通用**的一道闸——[scripts/check-readme-facts.mjs](../../scripts/check-readme-facts.mjs)
   （**不是**按包手写的表：第一版曾做成 `test/readme-facts.test.ts` 里的 7 条硬编码 FACTS，
   那样新包照样不带、新常量照样漏，已删除）。它自动扫 `packages/*/src` 与 `client-src` 里能静态算值的
   `export const`，再与两份 README 里三种写法比对，红时说清「旧值 → 应为」。
   接线三处：`pre-commit --staged`、CI（`pnpm readme-facts:check`）、`scripts/test/readme-facts.test.ts`。
3. **写进提交规矩**：[docs/conventions.md § 提交](../../docs/conventions.md#提交) 新增一条——
   改了对外行为，同一提交里要改两份 README，并写明 **ROADMAP 不能充当 README 的替代品**
   （前者记「这一刀改了什么」，后者答「现在是什么行为」，读者与口径都不同）。

### 三、反例（都是实跑变红，不是声称）

| 反例 | 结果 |
|---|---|
| 把 `RESULT_COLUMN_MAX` 改成 `6`（代码改、README 没改） | 两份 README 双双报红 |
| README 把「最多 4 列」改成「最多 3 列」（README 漂、代码没改） | 报「还写着旧值（找到「最多 3 列」，应为 4）」 |
| 把「超时默认 20s」改成 30s | 报「还写着旧值（找到「超时默认 30s」，应为 20000）」 |
| 删掉 README 里的常量名 | 报「没写常量名 `RESULT_COLUMN_MAX`——数字一旦漂，读者连去哪儿查都不知道」 |
| 给一份没有这些句子的假 README | 每条事实都报「找不到」（不静默跳过） |

**门槛**：`packages/loglens` 16 个套件 550 条全绿（+5：本守卫）；`check-doc-links`（689 条链接）、
`docs-index`、`check-no-public-ip`、`check-internal-identifiers` 绿；全仓 `test` **3132 passed**
（+5），唯一红仍是那条 DSH 版本绊线。

### 四、从「事后」改成「事前」（维护者：「你这是在已经发生的守卫吧，要不要做事前约束」）

一针见血。第一版的真实时序是：改常量 + 忘改 README → **本地提交畅通无阻**（pre-commit 只跑
build / i18n / 公网 IP / 内部标识，**不跑任何测试**）→ 推到远端 → CI 才红。也就是说它连「事后」
都不完整——而那次还是我自己 `git add` 的。改成两道**事前**约束：

- **接进 pre-commit**：`--staged` 只查暂存区涉及的包。判据是纯静态的（读文件 + 算数 + 正则），
  裸 Node 耗时 < 0.1s，相对钩子里已有的 `pnpm -r build`（约 4.6s）可以忽略。
- **全仓通用而不是按包**：32% 的漂移率说明这是系统性问题；按包登记 FACTS 表的结构性缺陷是
  「新包不带、新常量不登记就漏」，所以改成**自动发现**（扫 `export const` 静态算值）。

**上线当天就抓到一处真实的跨包偏移**：`packages/tty/README.en.md:243` 写「At most
`MAX_EXITED_SESSIONS` (8)」，而 `packages/tty/src/index.ts:392` 是 **16**——同一段英文的下文
又写着「the last 16 exited sessions stay readable」，自相矛盾。中文版一直是对的。已修。

**踩到的坑（值得记）**：第一版配对正则只认「`名字`（数）」「`名字` = 数」，**漏了中文文档最常用的
「数（`名字`）」形态**——而漏掉的后果是静默的：配对抽不到 → 没有比对 → 闸门恒绿。实测 loglens
自己 README 的六处全是这个写法，第一版一条都没抽到。这正是「闸门命中数为 0 时比没有更坏」那条
判据在本闸门上的实例。现已补，并加了中文量级词（`2 万字符` = 20000）的换算。

**覆盖率的现状（如实记下）**：可算常量共 62 个（docker 10 / tty 20 / loglens 31 / codegraph 1），
README 里标注了出处的只有 4 个（loglens 2、tty 2）。**刻意不把「必须标注」做成判据**：
绝大多数常量（内部超时、探测窗口）本就不该出现在 README 里，逼着标注只会制造噪音，
而噪音型的闸门最后一定被削弱。它守的是「**写了就必须对**」，不是「必须写」。

**没做的**：散文、语气、章节顺序刻意**不**绑机器判据——把散文绑死只会制造误报，这与
`scripts/docs-index.mjs` 的边界同一条思路。

## 真机反馈第六批：主链路三处卡壳（2026-10-18）

维护者拿这一版做了一次真机试用（「用 loglens 看最近一小时的日志：哪几个服务报错最多 → 挑一条把上下文
拉出来」），体感是「**聚合做得好**（facets 一次到位），但**从聚合命中到拿上下文这条主链路有几处卡壳**」。
逐条落成 [DEFECTS.md](./DEFECTS.md) 的 `D05`–`D07`——症状 / 根因 / 修法只在那边，这里只记落点与门槛：

- **`D05` 带 `q` 的查询必崩**：`LINE_SCHEMA` 补 `highlights`（数组套数组；宿主校验器对 `items` 是递归
  下钻的，用真实现实测过）。**这一条真正的落点是守卫**：schema 导出给用例做契约键集对账
  （`Record<keyof LogLine, true>`），契约加字段而 schema 没跟会在**编译期**报错——这类漂移以前要等
  真机查询撞上，而它撞上的是「带条件的查询全都失败」（不带 `q` 不触发 `highlight`，所以永远测不到）。
- **`D06` 锚点定位不到**：渲染文本在正文**之后**追加 `#<id>`（正文一个字不动）；锚点匹配抽成
  `findAnchor()`，六档优先级（id 精确 → 剥一个前导 `#` 的变体 → 严格相等 → 规范化空白 → 单向包含 →
  只按 `ts` 兜底），高档位一律压过低档位、同档取离 `ts` 最近的、并列按 id 与正文的字典序定。
  **放宽匹配的同时把去歧义规则写死**，否则修掉的是「定位不到」，换来的是「静默定位到别处」。
- **`D07` 0 桶没有解释**：facets 只在**传了 `by`** 时开 `track_total_hits`；窗口命中数经
  `FacetsResult.totalHits` 只给执行层判读、**不进返回值**（facets 的输出 schema 同样是
  `additionalProperties: false`，多一个键就是 `D05` 同款崩溃），措辞一律走 `warnings`。

**门槛**：包内 16 个测试文件 **571 passed**（新增 `test/facets-empty.test.ts` 8 例）；
`pnpm --filter @hyzyn/dsh-loglens typecheck` 全绿；台账侧 `defects-table` **43 passed**。

**顺带补的一道守卫缺口**：判据 8（跨包引用必须指向真实存在的号）的包名正则里**漏了 `loglens`**——
而 `LEDGER_SPECS` 里明明有它：于是「台账自洽」那一组判据覆盖它，跨包引用这条却对它**恒绿**，
任何人写 `loglens <越界号>` 都不会被拦。已补齐并配反例用例（`scripts/test/defects-table.test.ts`）。
**补上之后立刻抓到一条真实的悬空引用——是本次补漏的人自己写下的**（在注释里举例写了越界字面量），
正是那份测试文件头警告过的陷阱：守卫扫的是全仓，**包括写它自己的那一份**。

**这一轮刻意没做的**（维护者同一份反馈里的体验项，属**渲染口径变更**、要单独拍板，不混进缺陷修复）：
行尾那串 `labels` 的折叠 / 两段式（他抱怨「正文被 metadata 淹没」）、行首时间戳从 UTC 改成跟随本地
时区（或标 `+08`）、`multiline` 折叠后的缩进保留；以及「把『Docker 是采集来源』这条提示也带进
`sources` 列表」。四项都记在这里，不占 `Dxx` 编号（它们不是「坏了」，是口径选择）。

### 第二轮收口：独立复核证伪的 9 条（2026-10-18）

第一轮实现被一个**只读的独立复核者**做了对抗性证伪（它的任务书写的是「目标是证伪，不是复述实现者的
自述」），报了 9 条。**其中两条是第一轮自己引入的回退**——这条经验比修复本身更值钱：实现者的自测
（571 条用例全绿）**不足以保证没改坏**，因为它测的是「我以为的行为」。

三条最重的：

- **`ts` 兜底档成了死档**：第一轮把「只按 `ts`」挂在「没给正文」那一支上，于是**行明明在返回值里**
  却报「锚点行没在这次重查里返回」（一句假话），而 README / `DEFECTS.md` 都写着五档链——文档承诺的
  档位是死的。修法：逐档降级，`ts` **永远兜底**，不看有没有给正文。
- **「编译期守卫」挂在没人执行的闸门上**：`Record<keyof LogLine, true>` 写在 `test/` 里，而**全仓没有
  任何 tsconfig 收 `test/`**（包 `include` 只有 `src`；根没有 `tsconfig.json`）。复核者用忠实副本
  实测：给 `LogLine` 加一个字段后，包 `typecheck` **exit 0**、那两条对账用例**仍然全绿**，而运行期
  照样炸 `D05` 同款。修法：键集移进 `src`（`LINE_CONTRACT_KEYS`）——编译期管「契约加了字段」，
  `test/` 里的运行期对账管「schema 与键集一致」。**教训：守卫的判据对不对是第二问，第一问是「它到底
  有没有被执行」**；本仓已栽过一次「命中 0 个文件的闸门」（pathspec 写错），这是第二例、形态不同。
- **并列 tie-break 把结果绑回了来源顺序**：`line.ts > champion.ts` 在 `ts` 相等时恒为假 → 实际是
  「数组里靠后的胜」，而第一轮的用例恰好没覆盖同 `ts` 的情形（真机可达：`loglens_search` 可
  `direction=forward`，而 context 的重查恒 backward；`D03` 又记着组内次序会随窗口变）。
  修法：距离 → **id 字典序** → message 字典序 → ts。

其余六条（包含档要用规范化 needle、空白 needle 退化成「任何含空格的行」、`kind` 被丢导致模糊命中与
id 落空全静默、那条「反向包含不命中」用例其实是假证人、id 为 undefined 渲染 `#undefined`、字段名
不存在却断言「空壳」）逐条修 + 逐条钉用例。

**门槛**：包内 **583 passed**；全仓 **178 files · 3287 passed**；`typecheck` exit 0；产物重建后
`grep` 确认新措辞与 `LINE_CONTRACT_KEYS` 都进了 `lib/`。**`build` 必须先于产物闸门**——本轮中途就
出现过「源码改完、`lib/` 落后两轮」的状态（先重建过一次，之后两个收口又落在它后面）。

**复核顺带暴露的第三条既有缺陷（未修，等拍板）**：`facets` 打的是**裸 `/_search`**（`targetAccess()`
只回 origin，索引表达式被剥掉），而 `query` 打的是 `/<索引表达式>/_search`——**同一张卡片里榜与行
可能来自不同的数据集**（`.kibana_*`、别的应用索引都会被聚合进来），`D07` 的窗口命中数也跟着偏。
它不是本轮引入的（`git diff` 没碰那两行），修它要占一个新编号，故**留在这里等维护者拍板**。

### 第三、四轮：收口复核抓出的新回退（2026-10-18）

第三轮复核专门去验第二轮那 9 条收口，结论是**收口全部成立**——第二轮那 13 条「虫存在」断言
**13/13 复现不出来**（空白差异失配→现在 substring、文案谎报→现在档位编号一一对应、同 ts 翻转→
两种排列同一行、模糊命中静默→现在有 warning……），`F7` 的守卫也用**仓库真实命令**独立验过会红。

但**同一轮又抓出 6 条新东西，其中一条是收口自己引入的新回退**：

- **`H1`（新回退，必修）**：为了让「渲染 token `#doc-42` 回抄」能用，`id` 被剥掉了前导 `#`——于是
  **真以 `#` 开头的 id 反而不可寻址**（ES 的 `_id` 可由用户自定、可以含 `#`；结构化返回值
  `lines[].id` 给的就是 `#abc`，照抄进去却失配，**旧版是命中的**）。修法：**原值优先**、剥 `#` 的变体
  次之，两个候选都算「精确坐标档」。
  **教训与 `D06` 是同一条**：任何「体贴调用方」的改写都必须**排在原值之后**，否则它就从体贴变成了
  改写坐标。
- **`H2`（假话，必修）**：`{ts, id:'stale-id'}` 时同一条 `warnings` 里两句打架——一句说「给的 id 没
  匹配到」，另一句说「调用方没给 id 也没给正文」。修法：ts 分支按**实际入参**拼理由（并把「正文去掉
  空白后是空的」也当成一种要说出来的入参形态）。**再次印证本包那条口径：不说假话比说全更难。**
- **`H3`（明确不修）**：四键全并列（同距 + 同 id + 同 message + 同 ts，只有 labels/source 不同）时仍由
  数组顺序决定。可达性极低（ES `_id` 唯一、Loki 的 id 是 `tsNs:序号` 唯一，只有 `_id` 缺失回落 `''`
  时才可能），**本轮不修**——但原来那句「这是一份**全序**」**确实夸大了**，已改成明确说「不是数学
  意义上的全序」+ 点出这个残余 + 注明不修，并把边界钉成一条可验证的用例。
- `H4`（空 id 字典序最小 → 并列时挑到「没坐标」的行）、`H5`（落空提示回显的是剥过 `#` 的值）、
  `H6`（`clampCount` 的注释说「负数回落缺省值」而实现是负数→0——**只改注释**，实现与既有用例不动）
  一并收掉。

**门槛**：包内 **590 passed**；全仓 **178 files · 3294 passed**；`typecheck` exit 0；产物重建后
`grep` 确认 `idStripped` / `PRECISE_ID_TIERS` / `F8` 新措辞都在 `lib/` 里。实现者另留了两份**独立探针**
（`/tmp/toolsfix-r4` 11 例、`/tmp/toolsfix-verify` 13 例）复跑复核方的原始反例——第二轮那 13 条与
第四轮这 11 条互不覆盖，两次都全绿才算「没打坏旧的」。

**这一节本身也是方法论记录**：四处「以为修好了」都栽在同一件事上——**自测测的是「我以为的行为」**。
四轮里真正把缺陷钉死的不是实现，是那个**只读、任务书写着「目标是证伪」的独立复核者**。

**第四轮定向复验**（只验收口本身）：结论是「**没有发现新回退**」——六档下旧五档语义逐项仍在（`ts` 永远
兜底、全序、`warnings` 与档位一一对应、档位编号不错位、`PRECISE_ID_TIERS` 只吞精确坐标那两档），
`H1`/`H2`/`H4`/`H5`/`H6` 全部成立。它只捞到两条低的，都已收掉：

- **`G1`（`H2` 只修了一半）**：`id: '   '` 时措辞仍说「调用方没给 id」——「给了但被规范化丢掉」与
  「压根没给」在那句话里被混成了一件（正文那侧上一轮加了 `messageBlank`，id 这侧漏了）。补 `idBlank`，
  `warnings` 与失配文案两条路径同一口径。
- **`G2`（文档漂移）**：`DEFECTS.md` 与本文件里「五档」的计数，在档位表变六档之后过期。已改成六档，
  并把「原值优先」那一档的由来（`H1`）写进 `DEFECTS.md`。

**最终门槛**：全仓 **178 files · 3295 passed**（比上一轮 +1，就是 `G1` 那条用例）；`pnpm -r typecheck`
全包 OK；产物重建后 `grep` 确认 `idBlank` 与 `G1` 措辞都在 `lib/` 里。

## 复核遗留收口：`D08` 与标签折叠（2026-10-18）

前四轮收口完成后，把三件「等维护者拍板」的事里定了两件来落地。

### `D08`：facets 越过来源的索引范围

复核在扫请求形态时发现的既有缺陷（**不是本轮引入**）：`facets` 打裸 `/_search`，而 `query` /
`_count` / `_field_caps` 都带 `/<索引表达式>/`。后果是同一张卡片里「榜 / 时间分布」与「行」来自
不同的数据集。症状 / 根因 / 代价见 [DEFECTS.md](./DEFECTS.md) 的 `D08`，这里只记落点与门槛：

- **改法一行**：facets 拼 `/<索引表达式>/_search`。同文件 858 行那处裸 `/_search` **不动**——它带
  PIT，PIT 已经绑定了索引集（`test/elastic.test.ts` 文件头那句「`_search` 为什么不带索引路径」
  依然成立，它是**有条件的**正确，不是普遍规则）。
- **守卫**：假服务器从 `pathname === '/_search'` 放宽成 `endsWith('/_search')`（两种形态都要接住），
  用例加一条**请求形态**断言 `expect(search?.path).toBe('/' + INDEX + '/_search')`。已实测会红：
  改回裸路径 → `expected '/_search' to be '/logs-*/_search'`。
- **门槛**：`elastic.test.ts` 54 + `elastic-710.test.ts` 3 全绿。

### 标签折叠：渲染文本只平铺身份键

真机反馈第 4 条（「一行太长，正文被 metadata 淹没」）落地。`formatLine` 改成：只平铺
`LABEL_PRIORITY` 里命中的**前 3 条**身份键，其余折叠成 `+N labels`。

- **名单不另造**：直接用 `src/line.ts` 的 `LABEL_PRIORITY`——它本来就决定「哪些键能进 labels」，
  再起一份「渲染用的优先键」等于造第二份一定会漂的真相源。
- **折叠不丢信息**：完整 labels 在返回值的 `lines[].labels` 里；计数写成 `+N labels` 而不是省略号，
  是为了让调用方知道「还有东西没显示」，而不是以为这就是全部。
- **顺序依据是名单不是插入顺序**：`log.file.path` 在名单里排在 `stream` 之前，所以它进平铺、
  `stream` 被折叠——用例特地先插 `stream` 再插 `log.file.path` 来钉这一点。`agent.name` 排在名单
  尾部（整个集群都一样的采集器信息是背景不是身份），只有身份键不足 3 条时才露出来。
- **守卫**：实测会红（把 `IDENTITY_LABEL_MAX` 改成 99 → `expected ... not to contain 'stream=stderr'`）。
- **代价（明写）**：`test/tools.test.ts` 里两条既有断言跟着改了口径（`app=demo` 现在折进
  `+1 labels`）。

### 顺带发现的一道守卫脆弱点（未改）

`docs/conventions.md` 那行一旦在注释里写出**第二个** `` `Dxx`–`Dyy` `` 形态的范围，判据 2 取的是
`ranges[ranges.length - 1].to`（**最后一段**），于是读到的是那个次要范围的上界。本次就踩了：注释里
原有 `` `D05`–`D07` `` 与新的 `` `D01`–`D08` `` 并存时守卫读成 7 而红——**它能一直绿是因为那种情形下
两个数字碰巧相等**。已把注释里的次要范围改成 `D05`/`D06`/`D07` 平铺。守卫本身没改（不在本轮范围），
但这条值得记：**「碰巧相等」型守卫会在数字增长那天突然变红，而红的时候改的是文档不是守卫。**

## 渲染口径三件（2026-10-19）

真机反馈第 5、6 条 + 两条降噪一起落地。四处改动都在 `src/tools.ts` 的渲染层，**不在缺陷台账里**
（`Dxx` 记的是「坏了」，这三件是**口径选择**）。

### ⑤ 时间戳带显式偏移（`formatTimestamp`）

**症状**：行首是 `14:01:43Z`（UTC）、正文里是 `22:01:43`（本地），同一行两套时间；用户说「换算 epoch 时
还踩过 `date` 按本地时区解析的坑」。

**改法**：本地时间 + 显式偏移（`2026-10-18T22:01:43.123+08:00`）。三个判据：① 仍是 ISO 8601 且
`Date.parse` 能解回**同一个瞬间**（机器侧不用改解析）；② 人眼看到的时刻与正文一致；③ 偏移**写在字符串
里**，所以远端宿主的情形也不会含糊成「不知道哪个时区」。非法时间渲染成原值而不是 `Invalid Date`。

**没做的**：没给渲染文本加「可切换到 UTC」的开关——工具面没有「调用方偏好」这个输入通道，加一个只是
凭空多一种状态。

### ⑥ 多行正文保留层次（`renderMessage`）

**症状**：「`log.flags=multiline` 的堆栈被折成一个大事件，输出时是行内嵌换行的扁平文本」。

**改法**：续行加 `    | ` 前缀（正文内容一个字不改），超过 **20 行**截断并报出「还有 N 行未显示，
共 M 行」。截断必须报出来——「悄悄少显示几行」比截断更坏，与 `raw` 的 2 万字符预览同一口径。
顺带把 Windows 采集常见的 `\r\n` 归一（否则续行前缀后面会跟一个看不见的 `\r`）。

**边界（明写）**：折叠发生在**采集侧**（filebeat 的 multiline 把多行拼成一个文档、写进同一个
`message`），我们能改的只是「怎么摆」——**不能**把它重新拆成多条独立日志。真要那样得在采集端配。

### 两条降噪

- **`exact` 档**：窗口内正文**唯一**命中时一句都不说（原来每次都说「（不是 id）…要精确锁定请传 id」）。
  多解时才提醒，并把「有几行一样、取的是哪一条」说出来。
- **`normalized` 档**：它是「整条正文只差空白」——内容完全相同，与严格相等几乎一样可靠；原来和
  `substring`（片段，能在几十条里出现）共用同一句「**这是模糊命中，可能不是你要的那一行**」，属过度
  惊吓。现在按档位分开措辞，`substring` 才保留警报级说法。**「每次都响的警报没人读」**会让真正该怕的
  那一档失效——这是降噪的理由，不是「怕话多」。

为此 `findAnchor` 多返回一个 `ties`（当前最低档在窗口内命中了几行）：**「是否唯一」是降噪唯一的判据**，
而这个数只有候选遍历者知道。它只在当前最低档上累积，更高档出现时清零重来。

**门槛**：包内 **594 passed**；四个守卫逐个实测会红——时间戳退回 `toISOString()`、
`renderMessage` 直接返回原文、拆掉 `ties === 1` 的唯一性判断、`normalized` 退回警报级措辞，
各自都能让对应用例变红（反例跑完已还原，`npx vitest run packages/loglens/test/` 回到 594 绿）。

### 第五轮复核：降噪自己引入的回归（2026-10-19）

上面那两条降噪被独立复核证伪了一条**严重的**，值得单独记——因为它正是「降噪」这个动机本身的反面。

**`F1`（严重·正确性，本轮回归）**：`exact` 档在 `ties === 1` 时完全静默，而 `ties` 数的是
**这次重查返回的那一页**——那一页被 `limit = before + after + 1`（默认 11）截过、方向还是 `backward`
（**最旧的行最先被截掉**）。于是「页内唯一」被当成了「窗内唯一」：调用方要的锚点被截到页外、而页内
恰好有一条**同正文、不同时刻**的行时，锚点被**静默换成另一条**，`warnings` 还是空的。
复核实测：随机窗口里 **36%** 会这样。差分也钉死了是我的改动：同一输入 `HEAD` 报错（诚实），
`NOW` 静默换行。
**修法**：`unique` 必须同时满足「页内唯一」与「**整窗取全了**」——`counts.matched === lines.length`
（后端给了命中数时）或 `truncation.truncated === false`（没给时）。两个判据任一到手才算看见全窗。
**这条的教训**：降噪的判据必须与「我想要自信的那个范围」**同尺度**；`ties` 的量纲是「一页」，而
我想下的结论量纲是「一个窗口」——**量纲不匹配时，沉默就是把错误放大**。

- **`F2`（措辞不实）**：多解计数把「页内 11 行」说成「同一时间窗里有 11 行」（窗口其实 30 行，
  **低报**，会让调用方以为缩一点窗口就够）。修法：整窗取全时才说「同一时间窗里」，否则只说
  「**这一页**里」。
- **`F3`（低·边界，未修只记）**：`getTimezoneOffset()` 是**分钟**粒度，1970 年前某些地区的秒级 LMT
  （Monrovia 的 `-00:44:30`）会被写成 `-00:44`，`Date.parse` 回来差几十秒。复核实测 1976–2035
  全时区逐年 25080 次 **0 坏**，现实日志零影响——已写进 `formatTimestamp` 的注释，不为此加复杂度。
- **`F4`（低·边界，已修）**：年份超出 `0000–9999`（只可能是把 µs / ns 当 ms 用）时四位补零写不出
  ISO 8601 的扩展年份，`Date.parse` 得到 `NaN`。这类输入回退到 `toISOString()`（它带符号、可解析）
  ——**不可解析的字符串比不好读的字符串更坏**。

**复核确认干净的两处**（我本来最担心它们）：时区在现实范围全对（418 个时区 × 6 采样、
Chatham 的 `+12:45`/`+13:45`、纽约 DST 中**重复出现的 01:30 两次、偏移各自正确**、负偏移
`-570 → -09:30` 而非 `-10:30`）；`ties` **计数本身**准确（问题在语义被误用，不在算错）；
渲染层**完全不污染**返回值（`message` / `highlights` / `raw` 逐字节不变，深冻结后 render 不抛错）。

**门槛**：包内 **596 passed**；全仓 **178 files · 3300 passed**；`typecheck` OK。F1 与 F4 的守卫
都实测会红——把 `unique` 退回只看 `ties` → 「页被截断时仍要提醒」立刻变红（`expected '' not to be ''`，
那就是**静默**本身）；删掉扩展年份回退 → `10000-01-01T08:00:00.000+08:00 应可被 Date.parse 解回` 变红。
