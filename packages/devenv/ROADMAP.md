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

1. **`Health` 路径**：`{{if .State.Health}}{{.State.Health.Status}}{{end}}` 这条模板路径**没有真机样本**
   ——这台机器上 24 个容器**都没有**配健康检查，所以样本里没有 `Health`。守卫只能验它「写成受
   `{{if}}` 保护」，验不到「路径真的对」。门槛：找到一台配了健康检查的容器，取一回真 `inspect`，
   结构样本进 `test/fixtures/`。
2. **SSH 目标的 HTTP 探针**：探针是**从运行本工具的机器**发出的，而 248 上那 24 个容器只跑在
   容器网络里、没有发布端口，所以这一档没跑过。门槛：目标机上有一个从本机可达的端口，
   探针真取到 200 与真超时各一次。
3. **冷启动 150 秒那一档的轮询体验**：单测里有 `missing-then-ok` 的轮询用例，但那不是体验。
   门槛：对一套真的冷启动服务跑一次 `env_wait`，看等待期间的输出够不够回答「在等什么」。

### B. 与另外两包的接缝

5. **「项目内只读文本清单」骨架的上收**：本包与 `devdata` / `devfront` 都在读同一形态的清单
   （项目内文本 + DSH 侧只读 + 缺省即无），骨架同构却是三份实现。第三个消费者已经出现。
   门槛：上收进 `kit` 后三包各自用例绿 + 全仓钉子同步（属 L0，动手前先从本文迁进根 `ROADMAP.md`）。
6. **一次发布后的证据链对齐**：容器起来了（本包）→ 数据对（`devdata`）→ 页面对（`devfront`）。
   门槛：只读、**不改 Jenkins**；三者能按同一个项目名跑同一批清单。

### C. 结构性的债

8. **同一台机器上的两套写入口**：`docker` 的 `allowMutations` 能启停**任意**容器，而本包的
   「清单就是白名单」只在自己的入口上成立。当前口径只有 plan § 13 风险段的「与 docker 同档」，
   **没有**记「并存时怎么办」。门槛：先落一条部署纪律（共享机器上不开 docker 的 `allowMutations`），
   再决定是否让 docker 的变更面也认同一份清单（与根 `ROADMAP.md` 第 9 项合并处理）。

## 应先迁进 L0 的候选项（本文动手前要搬）

| 候选 | 为什么是 L0 |
|---|---|
| **「项目内只读文本清单」骨架上收进 `kit`** | 见待办 B5：要同时改 `devdata` / `devfront` / `devenv` 三包，并动 `kit` 的导出面与全仓钉子（含守卫） |

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
