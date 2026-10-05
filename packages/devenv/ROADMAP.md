# @hyzyn/dsh-devenv 路线图（待办）

> **本文只放「还没做的事」**；做完回填落点与门槛到下面的
> [`## 已完成（落点 + 门槛）`](#已完成落点--门槛)——**这一节是本包的状态真源**。
>
> **设计依据不在本文**：三包边界、就绪清单形态、四道门槛的顺序与代价、为什么要声明式判据，
> 全在 L0 方案 [docs/devdata-plan.md](../../docs/devdata-plan.md) § 13 与 § 16.1。
> 本文只记**状态、落点与门槛**，不复制那套论证（同一事实两处各写一份必然漂）。
>
> **用法与配置**见 [README.md](./README.md)：清单怎么写、报告长什么样、怎么跑各档验证。
>
> **私有包**：`"private": true`，不发 npm、**不带 `dsh.bundle.patch`**（带上就会被
> `scripts/aggregate.mjs` 卷进 `@hyzyn/dsh-all`；代价见 `devdata` 记-4 的实测）。

## 待办

### A. 真机覆盖的空白

> 口径：**验不到的不许报 `✓`**。下面每条都是「单测能过，但真机没验过」——它们不是缺陷，
> 是**已知的盲区**；每条都在代码 / 用例里留了断言，免得下次被当成已验证。
>
> 原来的第 1、2 条（`Health` 路径的真机样本、SSH 目标的 HTTP 探针）已于 2026-10-03 **全部**闭合：
> 落点、门槛与实测证据见 [记-10](#记-10-health-路径与-ssh-目标的-http-探针两条真机盲区2026-10-03)。

1. **冷启动 150 秒那一档的轮询体验** —— ✅ **闭合（2026-10-04；两半都在：机制见 § 已完成 记-12，
   剩下那一步见记-14）**：
   这一版工具面**没有流式进度**，所以「等待期间的输出」只能是**最终报告里的那份过程账**
   （`wait.ts` 的 `ticks` → 报告末尾的「等待过程」）与**取消**（`exec.signal`）——记-12 落地了两件
   （假时钟下逐条断言停止原因 / 记账 / 取消，真时钟下两条机制用例）。
   **原本剩下的那一步**（对一套**真的**慢启动服务跑一次，看那 150 秒里报告读起来够不够回答
   「在等什么」）由记-14 的真机档做掉，并**当场抓到一条缺陷**：那一段最长的话术原本是个裸英文
   Node 错误（`socket hang up`），原因与修法见记-14。

### B. 与另外两包的接缝

6. **一次发布后的证据链对齐**：容器起来了（本包）→ 数据对（`devdata`）→ 页面对（`devfront`）。
   门槛：只读、**不改 Jenkins**；三者能按同一个项目名跑同一批清单。
   > **2026-10-04 闭合（口径 + 守卫）**：方向定的是**不建聚合器**——「这次发布该验哪些项目」是发现
   > 逻辑，正是三包共同划掉的边界（`devfront` `D8` 也明确留着）。落点是 L0：根 ROADMAP 第 14 项 +
   > [conventions.md § 一次发布的证据链](../../docs/conventions.md#一次发布的证据链同一个项目名三份清单)
   > + `scripts/test/release-chain.test.ts`（一个项目目录、三份清单、三个面各认自己那份）。
   >
   > 本包这一面（`ready/<项目>.ready.yaml`）早就有工具面入口（`env_status` / `env_wait`）；**中间那一环**
   > （`devdata` 的 `verify/<项目>.yaml`）**仍然只有库路径**——那条不对称与它的待办见
   > `packages/devdata/ROADMAP.md` 待办 21。所以这话现在得说准：三面按同一个项目名读同一批清单
   > **对容器与页面成立**，数据面还差一个入口。
   >
   > **2026-10-04 追加更正**：中间那一环**已经接上**——`devdata` 当天落了 `devdata_verify`
   > （判据见 `packages/devdata/ROADMAP.md` 记-20）。现在三面**都**有自己的工具面入口
   > （`env_status` / `env_wait` · `devdata_verify` · `site_verify`），不再差那一环；上面原文
   > 保留：写下它的那一刻确实还差。

## 应先迁进 L0 的候选项（本文动手前要搬）

| 候选 | 为什么是 L0 |
|---|---|
| ~~**「项目内只读文本清单」骨架上收进 `kit`**~~ | **已做（2026-10-03）**：落在 `@hyzyn/dsh-kit/manifest`（`kit` 0.8.0），三包共用；见记-9 |

## 已完成（落点 + 门槛）

### 记-1. 建包、通道上收与就绪判据迁入（2026-10-02）

| 落点 | 内容 | 门槛（已验） |
|---|---|---|
| plan § 16.1 | 三包边界定案：**清单与求值跟着「它判的对象」走**——数据服务的「内容」归 `devdata`，容器 / 进程 / 端口 / 探针的「状态」归本包，浏览器「渲染」归 `devfront` | 三包各自成立、互不 import |
| `packages/devenv` | 建包；就绪判据（原 `env-ready.ts` + `env-ready-eval.ts` + 用例，约 990 行）**随建包同一步**从 `devdata` 迁来 | `devdata` 不再导出就绪判据、**也不留转发 shim**（两包同时导出同一 API 会让「谁是归宿」重新变模糊） |
| `packages/kit/src/tty-books.ts` · `ssh-exec.ts` | 连接簿读取（`readTtyBooks` 等）与 SSH 执行层从 `docker` 上收进 `kit`；`docker` 那两份变成再导出壳 | 全仓钉子同步（`check-kit-pins`）+ `ssh-single-source` 守卫：「读取与执行这一跳只有一份实现」 |

### 记-2. 观测层（2026-10-02）

| 落点 | 内容 | 门槛（已验） |
|---|---|---|
| `src/observe.ts` | 只发**两条**只读命令：`docker inspect --format`（一行五字段）+ `docker logs --timestamps`（**没声明 `logPattern` 就不取日志**）。**通道级失败与「容器没起」分开报**——这是本层最容易骗人的地方 | 真机 5/5（248：SSH → 两条命令 → 解析 → 判定；含「容器不存在 ≠ 通道不通」）。命令形式见 [README](./README.md) § 验到哪一档了 |
| `test/fake-docker.ts` | **真进程的假 docker**（临时目录里一个可执行 `docker` 挂到 `PATH` 前）——插件到目标之间隔了四层，mock `child_process` 等于把唯一真跑过的那部分换成想象 | 假 docker 夹具自带用例外，并由此抓出下面那条真缺陷 |
| `test/inspect-template.test.ts` + `test/fixtures/` | 拿真机 `docker inspect` 的**结构样本**（只有键与类型、没有值）逐条解析模板里的字段路径 | 真机首跑暴露：模板写了 `{{.State.RestartCount}}`，而它是**顶层**字段 → **每条 inspect 都失败**，但假夹具照自己的想象回一行、单测全绿。现在由结构样本 + 真机用例两条守着 |

### 记-3. 只读工具面 + 真宿主挂载（2026-10-02）

| 落点 | 内容 | 门槛（已验） |
|---|---|---|
| `src/plugin.ts` | 注册 `env_status`（快照，不等待）/ `env_wait`（等就绪 / 等**明确没戏** / 等满超时）；作用域 fail-closed（空 `scopeDirs` = 处处拒绝，**不替用户补默认目录**）；未启用 / 未配目标时**一个工具都不注册** | 真宿主挂载 **12/12**（连跑两次）：装上 → 挂上 → 两个工具进真 ToolRuntime；没配 `writeCapability` 就没有写入口；收尾临时目录清干净 |
| `test profile` 挂载 | `dsh plugin --profile test add link:…` + 配置层一条 `nas-248`（`kind=ssh` + `book=TEST`，作用域 `/Users/czz/coding/webproject`） | 重启后启动日志确认 `mounted` + `agent tools registered (env_status, env_wait)`，且没有「配置问题 / 工具注册失败 / did not activate」三件中的任何一件 |

### 记-4. 写入口 `env_up` / `env_down` + 四道门槛（2026-10-02）

| 落点 | 内容 | 门槛（已验） |
|---|---|---|
| `src/mutate.ts` | 写动作的**纯逻辑**：`startArgv` / `stopArgv`、`planMutation`（清单 + 观测 → 要动谁）、`runMutation`（逐条执行、单条失败不中断）。三条硬判据：**清单就是白名单**（没有按名字停任意容器的入口）、**`env_up` 不创建容器**（只有 `start`，没有 `run` / `compose up` / `rm` / `rmi`）、**幂等**（先观测再决定） | 用例钉住：观测里混进清单外的容器名不会进计划；`up` 只启没在跑的、`down` 只停在跑的；「本来就那样」的那档也进报告 |
| `src/rejection.ts` | 拒绝码与文案（`[CODE] 正文` + 「恢复路径」），码名与 `devdata` 对齐；本包只多一个 `WRITE_NOT_CONFIGURED`（「那个目标没配写闸门」与「配了没授权」是两件事，恢复路径不同） | 三档拒绝各自的用例；**被拒时执行器零调用** |
| `src/plugin.ts` | 四道门槛，顺序即判据：**作用域 → 清单 → 能力 → 确认**（先能力后确认：反过来的话，用户会在没授权时先被要求「说清要改什么」，说清之后才被告知「你根本没授权」，两次调用都没有进展） | `[OUT_OF_SCOPE]` / `[CAPABILITY_NOT_GRANTED]` / `[CONFIRMATION_REQUIRED]` 三档用例，且都断言「一条命令都没发」 |
| 注册面 | `hasWritableTarget(targets)` 为真才注册 `env_up` / `env_down`：默认配置下它们**不存在**（未注册的 agent 不会去试一个注定被拒的名字） | 真机写路径（门控 `DEVENV_REAL_WRITE_CONTAINER`，人工指名容器）：未授权 + `confirmed` → `CAPABILITY_NOT_GRANTED`；已授权但没带 → `CONFIRMATION_REQUIRED`；**两次被拒都用独立通道回读确认容器没被动过**；带 `confirmed` 的 `env_down` / `env_up` **真的停 / 真启**（独立回读 `exited` / `running`）。收尾把一次性容器删掉，机器还原（24 在跑 / 12 已停） |

> **这一档的边界**：用例自己**不创建、不删除**容器——「谁建的谁拆」是人的事，它只 `start` / `stop`，
> 并在收尾把目标恢复成开场状态。`stop` 走 `--time`（给容器体面收尾的时间）：SIGKILL 是别人的决定，
> 不是默认。

### 记-5. 缺陷台账立号 D01–D02（2026-10-03）

| 落点 | 内容 | 门槛（已验） |
|---|---|---|
| [DEFECTS.md](./DEFECTS.md) | 包内序列立号：`D01`（挂载脚本收尾撞 `ENOTEMPTY`）、`D02`（假 docker 夹具泄漏临时目录）——两条都是真机首跑暴露、单测当时全绿的那一类 | 索引表 2 行、无空号、已修 2 / 待修 0，编号至 `D02` |
| `scripts/defects-table.mjs` · `docs/conventions.md` | 按 [硬规矩 5](../../docs/conventions.md#编号规范) 把本包加进守卫的 `LEDGER_SPECS` 与编号规范表（**新增包时的两步**，这次是真跑了一遍） | `node scripts/defects-table.mjs` 全部一致；`defects-table.test.ts` 33 条绿 |
| 代码注释落编号 | `devenv D01` → `scripts/verify-devenv-host-mount.mjs` 的 `stopChild()`；`D02` → `test/fake-docker.ts` 的 `cleanup()` 与 `test/fixture-hygiene.test.ts` | 硬规矩 7「索引表加一行 + 代码注释里落编号」两步都在 |

### 记-6. 写路径的**常态验证**：本机一次性容器，不需要人指容器（2026-10-03）

**为什么需要这一档**：写路径此前只有两档——假 docker 的单测（快，但**真的 `docker` 进程**从没被
跑过）与真机那一档（记-4，打 248 那台共享机器）。后者刻意要求人**指名**容器（那台机器上有同事在
联调），所以它**不可能**进 CI、也就不可能常态跑。于是这条链路长期是「逻辑有单测、真 CLI 只在人
记得时验一次」。

| 落点 | 内容 | 门槛（已验） |
|---|---|---|
| `test/real-write-local.test.ts` | 靶子换成**本机一次性容器**：`docker create` 一个 `sleep` 着的镜像（唯一名字 + `dsh.devenv.test=write-local` 标签，不绑端口、不挂卷）→ 真跑四道门槛与 `env_up` / `env_down` → `afterAll` 里 `docker rm -f` **并断言容器真的没了**。`kind=local` 走 kit 的 `runLocal`，所以这一跳是**真 docker 进程** | **4/4 PASS**（2026-10-03，Docker Desktop daemon 28.3.2）：被拒的两次（未授权 / 未带 confirmed）读回**仍在跑**；带 `confirmed` 的 `env_down` 真停（读回 `exited`）且同一次调用里的 `env_status` 跟着变成非 `✓`；`env_up` 真启（读回 `running`）；已在跑时 `env_up` 走「无需变更」且不要求确认；清单外的名字只报「观测不到」、不碰别的容器；收尾 `docker ps -aq` = 0 |
| 前提缺失 → SKIP 不报红 | 连不上 daemon、或本机没有可用镜像且拉不到 → 整档 SKIP，**理由写在套件名里**（不是静默跳过） | 本机 daemon 没起时实测 4 skipped；`DEVENV_LOCAL_WRITE_IMAGE` 可指定本机已有镜像（本次验证用的就是它） |
| CI 接线 | ubuntu 腿在 Test 之前预拉 `busybox:latest`，让这一档**真的跑**而不是靠测试期网络；另两腿没有 Linux docker，自动 SKIP | 本地已验真链路；CI 那一跳待下一次推送 |

> **真机验证当场抓到的一个 bug（值得记）**：探针原先写
> `docker version --format '{{.ServerVersion}}'`，而这个字段在 `version` 的 JSON 里**不存在**——
> Docker Desktop 的 CLI 直接报模板错，于是**daemon 明明在跑也会被判成 SKIP**。本机第一次跑正是
> 这样。改成只看 `docker info` 的退出码（版本号另取一次 `docker info --format`，只用于显示）。
> 教训与 D04 / D08 同族：**判据不能比被判的东西更假设**——一个连不上就「跳过」的探针，
> 会把「环境不对」静默伪装成「一切正常」。

### 记-7. 审计落盘：与 `devdata` / `devfront` **共用一份实现**（2026-10-03）

**为什么三包共一份**：`devdata` 早就有 `audit.ts`（JSONL + fail-closed），`devfront` 与 `devenv`
只有宿主日志。按本仓「第三个消费者出现就上收」的判据，实现搬进了 `@hyzyn/dsh-kit/audit`（0.7.0，
子路径导出——它 `import 'node:fs'`，不能进会被客户端半体打包的主入口）。`devdata` 那一份随之变成
**纯再导出 + 自家话术**，行为逐字未变（它的 8 条用例原样通过，含那条精确到字节的 JSON 行断言）。

| 落点 | 内容 | 门槛（已验） |
|---|---|---|
| `@hyzyn/dsh-kit/audit` | 一条 JSON 行 / 调用（键序固定）；两个出口：JSONL（**持久，写失败 = 抛**）与 logger（**不持久**，允许 → `info` / 拒绝 → `warn`）；话术可由调用方给 | `packages/kit/test/audit.test.ts` 9 条；`devdata` 那 8 条原样绿（同一份实现的**等价性**由它钉住） |
| `devenv` | **本包此前没有审计出口**：现在四个工具的每次调用都记（允许 / 拒绝 + 判据码），配 `auditFile` 落 JSONL、否则进日志 | `plugin.test.ts` 新增 4 条：允许与被拒**各落一行**（含 `CONFIRMATION_REQUIRED`）、只读工具也进审计、没配时 `[AUDIT_NOT_DURABLE]` 且**没有一条 start/stop** |
| 第五道门（写类要求持久审计） | `env_up` / `env_down` 在**确认之后、动手之前**要求 `auditFile`（码与 `devdata` 同名 `AUDIT_NOT_DURABLE`） | 「先报能力、后报审计」由用例钉住（避免把人送去改错地方）；三个既有写路径用例改为显式配 `auditFile` |
| `devfront` | 同款：`auditFile` 配了落 JSONL，没配进日志；抽出的 `webAuditSink()` 让这条判据**可单测**（本包没有假宿主夹具） | `plugin.test.ts` 新增 3 条（解析 / 落盘两行 / 日志路由）；`page.test.ts` 原有的「审计写失败 = 动作不返回结果」继续钉住 fail-closed |

> **一条留给维护者的迁移提示**：`test` profile 里那份 `devenv` 配置**没有** `auditFile`，
> 于是它的 `env_up` / `env_down` 现在会被 `[AUDIT_NOT_DURABLE]` 拒（**只读工具不受影响**）。
> 这是 fail-closed 的方向（宁可不动，也别动得没有记录），代价是要在 profile 补一行
> `auditFile: ~/.dsh/devenv-audit.jsonl`。

### 记-8. 与 docker 并存时的口径：**只在一边开门**（2026-10-03，根 ROADMAP 第 10 项）

**问题**：`docker` 的 `allowMutations` 是**插件级**开关（一开就能对任意容器 start / stop / restart /
remove），而本包的「清单就是白名单」只在自己的入口上成立——两条路并存时，白名单可以从旁边绕过去。

**落点**：[devdata-plan.md § 13.1](../../docs/devdata-plan.md) 写出结论（含两边的门逐项对照表、
选「部署纪律」而非「让 docker 也认清单」的理由、以及什么时候该重审）；本包 README 的写入口小节与
`docker` README 的 `allowMutations` 行各加一条**互相指认**的警示。

**门槛（已验）**：两边的门都**读代码读准了**，不是复述记忆——`allowMutations` 的有效值 =
`section.allowMutations === true && capabilityGranted(CAP_MUTATIONS)`，且它有**两条**提权通道
（启动环境 + 就地提权）；本包的 `writeCapability` 只认启动环境（没有客户端半体 ⇒ 没有就地提权），
外加逐次确认与（今天起）写类要求持久审计。对照表就按这些事实写。

**诚实标注**：这条规矩**只有文档、没有守卫**——它约束的是人的部署动作，而仓库里今天没有
「同一目标上不许出现两条容器写入口」这种可判定的配置面。文档里写明了：将来若真要合并，
合的方向是「一处声明、两处生效」（像 tty 连接簿那样），那才是能被守卫化的形态。

### 记-9. 清单骨架上收进 `kit`（2026-10-03）

待办 B5 的落点：`readProjectManifest` / `manifestFileName` / `manifestRelPath` / `projectsInFiles`
落到 `@hyzyn/dsh-kit/manifest`（`kit` 0.8.0 子路径），本包的 `ready-loader.ts` 与 `env-ready.ts`
只剩「档位 → 本包的结果与文案」的映射与领域校验。

**门槛（已验）**：本包 `ready-loader` / `env-ready` 的用例**原样通过**（等价性由它们钉住）；
`packages/kit/test/manifest.test.ts` 12 条钉住骨架本身（五档「读不到」+ 歧义 + 纯函数映射）。
`empty`（空文件）刻意仍走 `validateProfile(undefined)` —— 与上收前的行为逐字一致。

### 记-10. `Health` 路径与 SSH 目标的 HTTP 探针：两条真机盲区（2026-10-03）

待办 A 的前两条（原文见 `git log` 与本文件历史）。两条都**不是缺陷**，是「单测能过、真机没验过」的
覆盖空白——而其中 `Health` 那一条的代价已经被 `RestartCount` 那一次证明过：**模板路径写错时 docker
直接报错、每条 inspect 都失败，而假夹具照样全绿**。

| 落点 | 内容 | 门槛（已验） |
|---|---|---|
| `test/fixtures/docker-inspect.health.json` | **配了健康检查**的容器的结构样本（只有键与类型：多了 `State.Health.{Status,FailingStreak,Log}`）。来源是本机真 daemon 上的一次性容器——248 与 161 上**都没有**任何容器配健康检查（两台都逐容器扫过），要在那儿取样本就得往共享机器上新建容器 | 生成命令（可复现）写进 README § 结构样本怎么来 |
| `test/inspect-shape.ts` | 把「结构样本 ↔ 模板字段路径」的那套判据（`templatePaths` / `walkSample` / `templateProblems` / `shapeOf`）从守卫用例里抽出来：现在有三个消费者（入库样本、**当下这台 daemon 的真输出**、README 的复现命令） | 守卫用例原样通过；`real-health-local.test.ts` 直接用同一份判据 |
| `test/real-health-local.test.ts` | **Health 常态验证**：本机真 daemon 起两个一次性容器（一个转 `healthy`、一个永远 `unhealthy`），跑真 `docker inspect` → 插件本体 → 报告 | **4/4 PASS**（2026-10-03，daemon 28.3.2）：结构满足模板且与入库样本**逐条同类型**；真 CLI 渲染出五段、末段就是 `healthy`；插件对真 `healthy` 给 `✓`、对真 `unhealthy` 给 `✗` 且 `env_wait` **不空等**（停在「明确否证」而不是等满超时） |
| `test/real-probe.test.ts` | **SSH 目标的 HTTP 探针**：走插件本体（连接簿 → `probeHost` → 真网络），两条用例——真 200 与真超时。两个端口由环境变量给（`DEVENV_REAL_PROBE_PORT` / `DEVENV_REAL_PROBE_TIMEOUT_PORT`）：**哪个端口可达、哪个会黑洞是环境事实**，代码定不了 | **2/2 PASS**（2026-10-03，248）：`6080`（rmqdashboard）→ `✓ … 容器在跑，且启动完成证据晚于本次启动` / `· HTTP 200 /`；`10912`（发 HTTP 挂住不响应）→ `! … 探针还没通过：1500ms 内没有响应`（**不是** `✗`——端口没起来该继续等）。同一档在 161 上也跑过真超时那一半（`8080` 被安全组黑洞） |
| 反向验证（Health） | 把模板的 `Health` 路径改成 `.State.Health.State`（一个**看起来合理**的错路径）再跑这一档 | **3/4 变红**，报的正是真机那句 `map has no entry for key "State"`——这条正是入库样本 + `templateProblems` **抓不到**的（错路径落在 `{{if}}` 保护里，而守卫允许受保护的路径在样本里缺席）：只有「真 daemon 跑一遍」能抓 |
| 反向验证（探针） | 把 `channel.ts` 给 SSH 目标的 `probeHost` 从 `spec.host` 改成 `'127.0.0.1'`（一个**能编译、能让全部单测继续绿**的写法）再跑探针档 | **2/2 变红**：真 200 那档拿不到 200（本机没有那个端口），真超时那档根本等不到超时（本机是**连接被拒**）——两条各自盯住了「探针打的是那台主机」与「等满预算」 |
| `scripts/verify-devenv-all.mjs` | 新增第 ⑤ 档（探针），并给「缺上游端口」单列一条 SKIP 理由——一档跳过了不该被第 ④ 档的 PASS 盖住 | 守卫 `verify-all-script-safety.test.ts` 从七条性质扩到**八条**（新加：探针那档必须由两个端口旋钮门控 + 反例⑧）。一键实测：不带凭据 **4 PASS / 3 SKIP**；带 248 只读凭据 + 两个端口 **6 PASS / 1 SKIP**（只剩写入口那档——它要人指名容器） |

**两台目标机上都没有健康检查容器**（248 的 36 个容器——含 24 个在跑的、161 的 48 个，都逐容器扫过
`{{if .State.Health}}`）：所以 `Health` 那一档的样本取自**本机真 daemon**，而要在共享机上取样本就得
新建容器——那不是这一档该做的事（`real-write.test.ts` 连启停都要求人指名，同一条纪律）。

### 记-11. 配置卡片（客户端半体）与 `/config` 那条数据面（2026-10-03）

**为什么这件事值得单独一层**：本包此前**没有客户端半体**，于是「`scopeDirs` 为空 = 处处拒绝」
「`kind` 认不出来」这类**配置问题**只在启动日志里报，用户没有 UI 可以去改；写路径要的 `auditFile`
也只能手改 yaml。卡片补上这一半（另一半是 `devfront` 那次记的同一个缺口）。

| 落点 | 内容 | 门槛（已验） |
|---|---|---|
| `client.js`（手写、无构建步骤） | 卡片：六个标量可改；**目标编辑器**（`id` / `label` / `kind` / `book` / `scopeDirs`，可增删行）；**写闸门只读面板**；**TOFU 指纹只读列表**；**四个槽全注册**（`settings.kit.item` / `plugins.bundle.config` / `plugins.row.config` / `settings.plugin.item`） | 2026-10-03 真机：详情页卡片渲染出 **21 个控件**、两个已有目标与 `kind`/`book` 都回填；写闸门的 `DSH_DEVENV_WRITE` 与「未授权」在文本里、**没有任何输入框的值等于它**；指纹 host 与「指纹 2 条」在文本里。静态：43 条 i18n 键 zh/en 一致、**客户端半体 0 条残留中文字面量**、`client-lint` 过 |
| `src/plugin.ts` 的 `GET/POST /api/dsh-devenv/config` | 围栏与恢复入口口径与 `devfront` **逐条一致**：`isLoopbackRequestStrict` 不过 → 403；非 GET/POST → 405；JSON 坏了 → 400；停用后 `/config` 照旧可用；没有 settings 服务时 `persisted:false` 如实标注（不假装落盘） | `test/card-config.test.ts` **36 条**（含反例）；真机 ③⑦⑧⑨⑫⑬ 全 PASS |
| **能力字段只读**（本轮最要紧的一条判据） | POST 体里出现 `writeCapability` → 400 + `CAPABILITY_READONLY`（目标行里的那一处同样拒）；GET 只给只读档 `writeGates`（声明的变量名 / **当前是否已授权** / 怎么授权） | 用例 + 真机 ⑩。**理由**：授权判据是「宿主**启动继承层**里那个变量的值 ∈ `{1,true,yes,on}`」（`kit` 的 `TRUTHY`），而变量名来自配置——把它指向**另一个已经在启动环境里、值恰好为真**的变量（如 `CI=true`），一条 POST 就等于**免重启提权**。⚠️ 本格此前写的是「改成 `HOME`」，**那是错的**（`HOME` 的值不在白名单里、不会授权）——2026-10-03 更正，代码文案与 README 同轮一并改 |
| 改目标逐次确认 + 审计 | 不带 `confirmTargetEdit` → 400 + `CONFIRMATION_REQUIRED`；成功分 `config.scalars` / `config.targets`，失败带码；审计写不进去 = 抛（fail-closed，走本包**已有的** `auditSink`，没新造 sink） | 用例（含「审计文件是个目录 → 请求不返回成功」）×2 + 真机 ⑮（JSONL 6 行，四种 action/码都在） |
| **改目标不抹掉写闸门** | 同 `id` 目标的 `writeCapability` 原样带过去（客户端提交的行里没有它——它在卡片上只读）；改 `id` 等于换一个目标，闸门不跟过去 | 用例 ×2 + 真机 ⑭：改完目标后 `nas-one` 仍是 `declared:true` / `DSH_DEVENV_WRITE`，工具面仍是四个。**没有它的话**：用户改一个 `scopeDirs` 的错别字就会让 `env_up` / `env_down` 从工具面消失，而卡片上没有任何地方能把它加回来（那是 `devfront`「保存一个标量把站点整批抹掉」的同一类缺陷） |
| `scripts/verify-devenv-card.mjs` + `card-smoke` 入口 | 隔离 `DSH_HOME`（`createLiveHarness({ prefix: 'dsh-devenv-card-' })`）+ 临时 profile 装本包 + 真宿主 + 真 Chrome：数据面 / `writeCapability` 只读那条 400 / 逐次确认 / 审计落盘 / bundle 真被加载（含四个槽）/ 插件页那一行 / 详情页控件 / **目标编辑器的客户端路径（㉓㉔㉕）** / 自证真实补丁未变；`--dump` / `--keep` 同 `devfront` | 2026-10-03 首跑与复跑各 **21 PASS / 0 FAIL**；**2026-10-04 补 ㉓㉔㉕ 后 24 PASS / 0 FAIL**（当天复跑，含反例实测）；真实 `~/.dsh/cordis.patch.yml`（780 字节）逐字节未变。守卫见 `test/verify-script-safety.test.ts`（六条判据 + 五条反例，**判前先去注释**）+ `scripts/test/card-dom-path.test.ts`（跨包：三张卡片的 DOM 路径**在不在**，六条反例） |

**为什么脚本叫 `card-smoke` 而不是 `verify`**：本包的 `verify` 已经是
[`scripts/verify-devenv-all.mjs`](../../scripts/verify-devenv-all.mjs)（一键七步，登记在
`scripts/verify-list.mjs` 里）；重指它会把那条入口弄丢。新脚本另起一个名字（与 `host-mount-smoke` 同族）。

**这一轮没验到 / 已知的两处**：

1. **英文界面下「怎么授权」那一段仍是中文**：那段文案来自 `@hyzyn/dsh-kit` 的 `capabilityHowTo()`
   （宿主侧判据的一部分），不在本包的 i18n 目录里。要么把那一档话术也在 `kit` 里做双语，要么接受
   「授权说明只给中文」。本轮按「不动 `kit`」处理。
2. **`packages/devenv/src/index.ts` 的头注**：写这条时它还写着「没有任何写入口」「没有客户端半体」，
   两条都已经不成立。**2026-10-03 已改**（同一处末尾留了一行更正，注明写入口见记-4 / 记-6、
   客户端半体见记-11；随 `7b843e03` 重建 `lib/` 一并入库）。

### 记-12. `env_wait` 的等待过程与取消：把「在等什么」做成报告的账，把 `exec.signal` 接上（2026-10-04）

**由来**（待办 A1）：冷启动能到 150 秒，而此前 `env_wait` 是「一个 `while` + 最后一份快照」——
等待期间**什么都不发**（这一版工具面也没有给工具用的进度通道，`presentCall` 只拿得到 `args`），
于是 agent 与人都只看到一次迟到的返回；更要紧的是它**完全没接取消**：`execute` 连第二个参数都没有，
SDK 明写的「异步工作必须转发 `exec.signal`」这条契约是空的。后果很具体——调用方已经走了，
工具还在那边每 3 秒打一次 SSH/docker，最长 15 分钟。

| 落点 | 内容 | 门槛（已验） |
|---|---|---|
| `src/wait.ts`（新） | 等待循环：`abortableSleep`（取消能唤醒睡着的等待）、四种停止原因（就绪/否证/超时/**取消**）作为**数据**返回、逐次记账 `WaitTick`、`collapseTicks` 把连续相同结论压成段 | `test/wait.test.ts` **12 条**（假时钟）：首轮就绪不睡、逐次记账的耗时、否证立刻停、超时边界、**取消后不再探**、睡觉期间取消、`abortableSleep` 三条、压段三条 |
| `src/render.ts` | `describeStop()`（**取消那句话要把「不是超时、也不代表环境有问题」说出来**）+ 报告末尾的「等待过程」块（首尾各表 + 说清省略多少段） | `test/render.test.ts` **+5 条**（四种停止原因的话术、逐段渲染、超限省略、`env_status` 不带过程） |
| `src/plugin.ts` | `env_wait` 的 `execute` 接 `exec.signal` 并转发；声明协作式预算 `timeoutMs`（= 900000 + 30s，必须大于自己的钳位上限，否则宿主的调用超时会先砍掉一次正当的长等待）；`waitText` 改走 `wait.ts` | `test/plugin.test.ts` **+2 条**（真时钟）：过程账进报告；**取消后 0.7s 返回**（不取消要等满 60s） |

**反例实测过**（这一条的守卫不能是恒绿的）：把 `exec?.signal` 那一行去掉，取消那条用例
**等满 20 秒**才失败——证明它测的是转发本身，不是「函数能返回」。

**一个仓库级发现（本包之外）**：`exec.signal` 在**全仓 0 个工具**里被转发过（`tty_expect` 能等
600 秒、`devfront` 的 `site_verify` 要开好几个页面），所以这不是本包独有的疏忽，而是一条**缺规矩**。
本轮只修了本包最贵的那一个（15 分钟），其余上提到了根 ROADMAP § 待办第 12 项。

### 记-13. 卡片里「加一行目标」那条路：客户端 DOM 证据 + 一条跨包口径（2026-10-04）

**由来**（根 ROADMAP 待办第 13 项，本包那一半）：记-11 的门槛只验了两样——数据面（脚本自己拼的
POST：⑦⑫⑬⑭）与**渲染**（⑲：控件数与字段回填）。而「在卡片上真的加一行、填值、勾确认、点保存」
这条**客户端路径**一次都没走过。它恰好是静态闸门**看不见**的那一块：`client.js` 不在 vitest 层，
`client-lint` 管语法与地址来源、`check-i18n` 管键集，**都不看客户端拼出来的 payload**——`devfront`
被真机抓出的三条缺陷（`exports["./client"]` 缺失、保存标量抹掉站点、详情页要注册 `bundle.config` 槽）
当时**三条静态闸门全绿**。

| 落点 | 内容 | 门槛（已验） |
|---|---|---|
| `scripts/verify-devenv-card.mjs` 的 ㉓ | 真 Chrome 里点「+ 添加目标」→ 往新行的 **5 个控件**写值（`kind` 是下拉）→ 勾那个**只在 dirty 时渲染**的确认框 → 点保存 → 卡片回「目标已保存（进审计）」 | 行数 3→4、`fieldCount:5`、`tags:INPUT,INPUT,SELECT,INPUT,INPUT` |
| 同文件 ㉔ | HTTP 复核：`dv-dom` 在位，`kind`=`ssh` / `book`=`TEST` / 文案 / 两个作用域与刚填的一致 | `ids=[nas-one,here-two,third-one,dv-dom]` |
| 同文件 ㉕ | 卡片这条写入口**也没抹掉**写闸门（⑭ 的回归网：同一个动作的第二条写入口） | `writeGates[0]` 仍是 `nas-one` / `declared:true` / `DSH_DEVENV_WRITE` |
| `docs/conventions.md` 新增「客户端卡片：改配置那条路要有真机 DOM 证据」 | 把这条口径从「三张卡片各自记得」提到 L0：判据 + 两条技法（确认框要在**嵌套的那层卡片**里找；React 受控输入走**原生 setter + 事件**） | 由 `scripts/test/card-dom-path.test.ts` 守**在不在**（三张卡片 × 五条判据 + 六条反例） |

**反例实测过**（这条证据不能是恒绿的）：把下拉框的 `change` 事件扣掉不派，
**㉓ 照样 PASS**（行数 +1、卡片照回「目标已保存（进审计）」），只有 ㉔ 红——提交上去的 `kind`
停在默认的 `local`。所以这两条**必须成对**：㉓ 管「这条路走得通」，㉔ 管「走出来的东西是对的」。

**为什么故意选 `kind: ssh` + `book`**：那是宿主最**严**的一条判据（ssh 目标没给 `book` 会被**整个
丢掉**，见 `src/plugin-config.ts`），所以「下拉的变更没进 React state」这种坏实现会在这里露出来——
提交上去的 `kind` 停在 `local`，目标照样落地，但字段串了。

**没抓到的**（如实记）：㉓㉔㉕ 一次过，本轮没有新缺陷。价值是把「静态闸门看不见的那一类」
纳入每次 `card-smoke`（21 → 24 条）。

### 记-14. 冷启动那一次真机等待报告：三段现场，以及它当场抓出的那条话术缺陷（2026-10-04）

**由来**（待办 A 第 1 条最后那一步）：记-12 把「等待过程」与取消落地了，但它验的是**机制**——
假时钟下逐条断言，真时钟下两条（过程账进报告、取消 0.7s 返回）。**没人验过这件事本身**：
对一套真的慢启动的服务跑一次，那份报告读起来够不够回答「在等什么」。

| 落点 | 内容 | 门槛（已验） |
|---|---|---|
| `test/real-coldstart-local.test.ts`（新，本机真 daemon + 一次性容器） | 靶子现场分三段演：**端口还没开 → 开了但那条路由还没挂 → 路由挂上**。清单用 `httpProbe`，`pollIntervalMs` 3s、`timeoutMs` 180s（正是待办里写的那个门槛） | 真跑 **2/2**：报告分成 **3 段**、段间话术**互不相同**、末段是「全部 1 个服务就绪」；就绪落在 **+21.4s**（先 `javac` 编译，再干等 12s，服务起来 8s 后挂路由）。同一档还验**取消**：708ms 返回，报告说「被调用方取消…不是超时」 |
| `src/probe.ts` 的 `probeFailureDetail`（**真机抓出来的那一支**） | 新增 `ECONNRESET` → 「连接被重置（多半是端口上还没有能应答的东西）」 | `test/probe.test.ts` +2 条断言（含「没有 code 的同名错误照旧原样带出去」这条契约不变） |

**为什么靶子是 `javac` 现场编译的一段 Java**：本机到 Docker Hub 不通、本机可用镜像里没有
`busybox httpd`（`busybox --list` 里确实没有）、没有 python，Nashorn 那个构建里连 `JavaAdapter`
都没有——而本机唯一的可用镜像是个 JDK。与其为了靶子去改环境，不如用镜像里已有的东西起一个
**可控**的服务：这档要验的是等待报告的读法，不是靶子有多真。镜像仍按本包惯例取
`DEVENV_LOCAL_IMAGE`（见 README 的验证表）。

**真机抓到的**（这一次不是「没抓到」）：Docker Desktop（macOS）在「端口已发布、容器里还没有进程
监听」时**先收下 TCP 连接再空回**，探针拿到的是 `socket hang up`（`ECONNRESET`），于是落到
`probeFailureDetail` 的**兜底分支**——而每次冷启动里**最长**的那一段正是这个状态（实测连续 5 次
观测 ≈15s）。跑之前没人知道它会落到哪个分支：`ECONNREFUSED` 那条分支的单元用例一直是绿的，
真机上根本轮不到它。

这一条的判据不是「文案不好看」，而是**它认错了状态**：兜底那一行的注释写着「其它错误原样带出去，
编一句更好听的话会盖掉真正的原因」——而 `ECONNRESET` 在这里不是「其它」，它是这台机器上冷启动的
**主状态**。改完之后三种状态的处置各有一句中文（等 / 等 / 别等），兜底那一条契约一个字没动。

**报告长什么样**（真机原文；`real-coldstart-local.test.ts` 会把整份打出来，理由写在它的注释里）：

```
等待过程（共观测 8 次）
  · +21ms 还差 1 个服务：dsh-devenv-coldstart-…（探针成功（连接被重置（多半是端口上还没有能应答的东西）））（连续 5 次结论相同）
  · +15.3s 还差 1 个服务：…（探针成功（HTTP 404））（连续 2 次结论相同）
  ✓ +21.4s 全部 1 个服务就绪
```

顺带钉住的一条既有判据：第二段是 `HTTP 404` 而**不是** `refuted`——`4xx` 是**可以等**的
（应用可能刚换了个上下文路径），判成「别等了」是最贵的一种误判。

**没验到的**：150 秒**那个时长**本身（靶子的冷启动只有 ~20s）。理由是判据与时长无关：段数与
「话术有没有变」由 `collapseTicks` 与轮询次数决定，而观测次数多到超过 `WAIT_PHASE_MAX = 10` 段时
那条「首 6 + 尾 3 + 说清省略多少段」的分支另有 `test/render.test.ts` 的假时钟用例逐条钉住。
真机上再等 150 秒只是把同一段代码跑得更久。

### 记-15. 配置卡片的版式重做（2026-10-04，用户提「其它两个 data 插件也美化一下」）

**由来**：卡片自记-13 建起来后一直是「一列五行 + 全宽输入框 + 输入框样式的按钮」：字段标签拖着括号
口径（`tty 连接簿条目名（kind=ssh 时必填）`），目标行、写闸门、指纹三张块各自平铺，看不出层次；
`+ 添加目标` 与「保存」长一个样，`**没有落盘**` 的星号**原样显示在界面上**；写闸门那两张只读块里的
嵌套 `.dv_card` 只是又一个 div，没有视觉边界。这一轮**只做版面**：数据面、裁决、写入路径与审计一行没动。

| 落点 | 内容 | 门槛 |
|---|---|---|
| `client.js` CSS | 四层分组面板（插件配置 / 目标 / 写闸门 / TOFU 指纹）+ 固定两列栅格（`@media (max-width:640px)` 回落单列）+ 行头**写闸门胶囊**（绿「已授权」/ 琥珀「未授权」/ 灰「未声明写闸门」）+ 主色只出现在「保存」 | `typecheck` 里的 `client-lint` 检查 ③：**55 处**主题变量全部存在于宿主 403 个名字里；地址来源 0 处 |
| `client.js` DOM | 字段文案拆成「短标签 + `dv_hint` 小字」（口径不丢，只是下沉），字面 `**` 清掉；写闸门档改两列网格（`writeCapability` 一列、口径在右）；指纹一行改等宽体；空态改虚线块、确认框改琥珀提示块 | `check-i18n`：**50 条键** zh/en 一致、用法命中、0 条残留中文字面量（复用已有的 `status.*`，不另立新域） |
| 胶囊的判据 | 与写闸门表**同一份** `config.writeGates`（宿主投影），按 `targetId` 索引——卡片不自己推「这个目标有没有闸门」 | 真机 ⑳：`hasWriteGateEnv` / `hasNotGranted` / `writeGateEditable:false` 三件仍成立 |
| `client.js` 行高（用户截图指出的**没对齐**） | 标签是 inline `<span>`，行盒高度跟着**字体度量**走：`id`（拉丁）15px vs `名字`（中日韩）17px → 右列压低 2px。标签与小字钉死 `line-height:16px` | 真机量 rect：2 对字段 `inputTop` 相等（751/751 · 835/835），标签行盒统一 16px |
| 契约（刻意不动） | 「+ 添加目标」在编辑器那层 `.dv_card` 里（`closest` 定位）、`.dv_input` 的**顺序**（5 个）、编辑器里第一个复选框就是确认框 | 真机 ㉓㉔㉕ 仍绿：`fieldCount:5`、`tags:[INPUT,INPUT,SELECT,INPUT,INPUT]`、`kind/book/scopeDirs` 没串位 |

**真机证据**：`pnpm --filter @hyzyn/dsh-devenv run card-smoke` → **24 PASS / 0 FAIL**（改版后跑两遍，
一遍带临时截图补丁拍目标行与只读块、一遍用**原脚本**；截图补丁跑完 `git checkout` 还原），
真实 `~/.dsh/cordis.patch.yml`（1086 字节）逐字节未变。

**没抓到的（如实记）**：深色主题只有 token 层的理由、没有截图；窄窗口的单列回落没真机验
（验收窗口 1440px）——与 `devdata` 记-21 那两条同源，理由相同。
