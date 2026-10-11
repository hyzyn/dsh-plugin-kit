# @hyzyn/dsh-loglens — 路线图

> **状态：包已创建（2026-10-11，P0-乙 进行中）。** `packages/loglens/` 现在是 workspace 包
> （`@hyzyn/dsh-loglens@0.1.2`，已进 [publish-targets.mjs](../../scripts/publish-targets.mjs) 与两份聚合清单，
> `pnpm-lock.yaml` 已同步）——所以 [docs-index 判据 5](../../scripts/docs-index.mjs) 现在**看得见它**，
> 而不再是「本目录不在解析面里」。设计与契约见 [docs/design.md](./docs/design.md)；
> `README.md` 目前还是模板生成的骨架，按 [conventions § 文档分档](../../docs/conventions.md#文档分档) 补内容排在 P1。
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
| **P5** | Docker 作为来源（**选项 0**，零新机制） | ✅ |
| **P6** | Loki `tail`（`ws`）/ 直方图 / 浏览器视图（design.md §5 三选一） | — |
| **P7** | 需要**跨后端统一查询**时才申请宿主半体插件间服务 | — |

**P1 的前置**：§3.3 的 `cursor_expired`、`track_total_hits` 归属、Loki 顺序稳定性三件定稿后再落契约。

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

5. **私网语义**：私网允许、链路本地 / 云元数据与公网默认禁——确认（P4 出站围栏定稿前）。
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

### P0-乙：原子建包（2026-10-11 落地 8 / 10 项；第 6、8 项见下）

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

**未落地 2 项（别丢：本次已把硬要求查清）**

`loglens` **还没有客户端半体**（`client-src/` 与 `client.js` 都不存在），因此第 6 项（`files` 加 `client.js`）与第 8 项
（构建型声明）没落：`files` 仍是模板的 `["lib", "cordis.patch.yml", "README.md"]`、`build` 仍是纯 `tsc`。
[i18n.md](../../docs/i18n.md) 里那句已按纪律 3 **加标注**（「已拍板、尚未落地」）而不是硬改数。落地时要知道：

1. `client-src/index.js` 必须含 `const ROW_CONFIG_KEYS = [`，有一个 `<X>SettingsCard` 组件，且照
   [plugin-settings-surface.test.ts](../../scripts/test/plugin-settings-surface.test.ts) 的 `expectedBlock()` 写**逐字节**契约块，否则那份用例红；
2. 构建脚本照 [codegraph 的 build-client.mjs](../../packages/codegraph/scripts/build-client.mjs)：产物**单文件无 import**、遇残留 import `exit(1)`；
   内联 `pure.js` 时替换必须用**函数**形式（字符串替换会把 `$&` 当替换模式吃掉，且整个过程确定性、CI 照绿）；
3. `files` 加 `client.js`、`build` 串上 client 构建；`pnpm -r build` 后 `git diff` 必须干净（产物闸门）；
4. 三处仓库级名单要加 `loglens`：[client-host-url.test.ts](../../scripts/test/client-host-url.test.ts) 与
   [client-click-scope.test.ts](../../scripts/test/client-click-scope.test.ts) 的包数组、[plugin-settings-surface.test.ts](../../scripts/test/plugin-settings-surface.test.ts)
   的期望名单与循环名单——不加 = 仓库级规则对 loglens **零覆盖**；
5. 落地当天把 i18n.md 的注记摘掉、名单加回去（两处）。

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
