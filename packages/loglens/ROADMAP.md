# @hyzyn/dsh-loglens — 路线图

> **状态：P0 / P1 / P3 / P4（含出站围栏）/ P5（agent 侧）全部落地，P2 的代码半体也落地（2026-10-11）——设置面、查询地基、Loki 与 ES / OpenSearch 适配器、出站围栏、四个 agent 工具、Docker 的选项 0 指路都可用；剩下三条后端的**真机验收**（待有环境）与浏览器侧的结果视图（P6，含 Docker 面板那一格）。** `packages/loglens/` 现在是 workspace 包
> （`@hyzyn/dsh-loglens@0.1.2`，已进 [publish-targets.mjs](../../scripts/publish-targets.mjs) 与两份聚合清单，
> `pnpm-lock.yaml` 已同步）——所以 [docs-index 判据 5](../../scripts/docs-index.mjs) 现在**看得见它**，
> 而不再是「本目录不在解析面里」。设计与契约见 [docs/design.md](./docs/design.md)；
> `README.md` 已按 [conventions § 文档分档](../../docs/conventions.md#文档分档) 补到当前状态（配置面 / 解剖 / 已知限制）。
>
> **id 已定：`loglens`**（包 `@hyzyn/dsh-loglens`）。`logs` 这个 loader id 已被第三方插件
> `dsh-logbook` 占用，npm 上的 `dsh-logs` 也已被他人占位——理由与证据见 [design.md §8](./docs/design.md#8-已实测前提)。

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
| **P6** | Loki `tail`（`ws`）/ 直方图 / 浏览器视图（design.md §5 三选一） | — |
| **P7** | 需要**跨后端统一查询**时才申请宿主半体插件间服务 | — |

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

**仍未拍板 3 项**（都不挡 P0-乙，分别落在 P4 / P6 / P7）：

5. **私网语义** ✅ **已拍板（2026-10-11，常规做法）**：**连接面 = 你配置的来源**——回环 / 私网 / 公网
   一律放行，只有**链路本地 / 云元数据**被无条件拒绝（外加：只认 http(s)、不跟随重定向、解析后的 IP 判定、
   体积与超时上限）。当天先落地的「公网默认拒 + 按来源开 `allowPublic`」**已推翻并整条拆掉**，
   理由与证据见文末「公网档改判」一节。
6. **浏览器视图**：受控重复（默认）还是 `docker` 暴露视图服务（P6 三选一）。
7. **宿主服务**：只在 P7 需要时再批（本仓第一条宿主半体插件间服务）。

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

### P3：四个 agent 工具 + 档位分类表（2026-10-11 落地）

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
| `facets by container.name`（近 1h） | `chendan-ems-service 13404`、`chendan-cwms-service 10001`、`chendan-cdc-service 324`、prometheus 238、grafana 190…；**其余 32 条落在没列出来的桶里**（如实回报） |
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

