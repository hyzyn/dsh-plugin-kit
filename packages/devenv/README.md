# @hyzyn/dsh-devenv

开发/测试环境的**编排与观测面**：判**容器 / 进程 / 端口 / HTTP 探针的状态**，并把
「在等什么」写成可校验的清单。私有包，不发布。

> 边界（一条判据）：**清单与求值跟着「它判的对象」走**——状态归本包，数据服务的**内容**归
> `@hyzyn/dsh-devdata`，浏览器**渲染**的结果归 `@hyzyn/dsh-devfront`。正文与代价见
> [docs/devdata-plan.md § 16.1](../../docs/devdata-plan.md)。
>
> **状态真源在 [ROADMAP.md](./ROADMAP.md)**：待办（含还没验到的盲区）与逐条落点 / 门槛都在那里；
> 本文只讲**现在有什么**与**怎么用**。

## 现在有什么（按落地方案的前置清单）

| 步 | 内容 | 状态 |
|---|---|---|
| 1 | 通道：SSH 执行层与连接簿读取上收进 `@hyzyn/dsh-kit` | ✅ 2026-10-02（B1） |
| 2 | 建包 + 就绪判据（`env-ready*`）从 `devdata` 迁来 | ✅ 2026-10-02 |
| 3 | 观测层：经通道取容器状态 / `StartedAt` / 退出码 / 健康 / 日志尾部 / HTTP 探针 | ✅ 2026-10-02 |
| 4 | 只读工具面：`env_status` / `env_wait`（**默认只给这两个**） | ✅ 2026-10-02 |
| 5 | `env_up` / `env_down`：能力闸门 + 二次确认（`env_down` 会打到正在联调的同事） | ✅ 2026-10-02（**只配了闸门的目标才注册**；见下） |

**默认（没配 `writeCapability` 时）这个包一个写入口都没有**：工具面只有 `env_status` / `env_wait`，
两个都是只读（`docker inspect` / `docker logs` / HTTP 探针）。写入口只在**某个目标配了写能力闸门**时
才注册——工具面里没有的东西，agent 不会去试。

## 装进去怎么配

```yaml
# ~/.dsh/profiles/<profile>/cordis.patch.yml（托管区块）
- id: devenv
  name: '@hyzyn/dsh-devenv'
  config:
    targets:
      - id: nas                       # 工具就是按它选的
        label: 248 NAS
        kind: ssh                     # local 或 ssh
        book: 248                     # ssh 目标：引 tty 连接簿的条目名（本包不自建连接簿界面）
        scopeDirs: [/Users/me/coding] # 空数组不是「不限制」，是**处处拒绝**
      - id: here
        kind: local                   # 在宿主这台机器上跑 docker
        scopeDirs: [/Users/me/coding]
    logTail: 200                      # 取多少行日志（只有声明 logPattern 的服务才取）
    pollIntervalMs: 3000              # env_wait 的轮询间隔
    waitTimeoutMs: 180000             # env_wait 的缺省总超时（冷启动可到 150 秒）
```

`local` 目标用宿主那台机器的 `docker`；`ssh` 目标经**与容器面板同一份**执行层连过去
（连接池 / TOFU 指纹 / 跳板机 / 代理命令都在 `@hyzyn/dsh-kit/ssh-exec`，本包不自建第三份）。
指纹记录**种子来自 tty 的连接簿**，新指纹写进本插件自己的 settings entry
（不写 tty 的：那是另一个插件的配置）。

### 写入口：`env_up` / `env_down`（默认不注册）

只有配了写能力闸门的目标上才有这两个工具：

```yaml
- id: devenv
  config:
    stopTimeoutSec: 10                     # docker stop --time 的秒数（给容器体面收尾的时间）
    auditFile: ~/.dsh/devenv-audit.jsonl    # 持久审计；**写类动作的前提**（没配 → 上面的写入口一律被拒）
    targets:
      - id: nas-248
        kind: ssh
        book: TEST
        scopeDirs: [/Users/me/coding]
        writeCapability:                   # 配了它，env_up / env_down 才会注册
          env: DSH_DEVENV_WRITE            # 真正的授权：宿主启动环境里的这个变量（=1/true/yes/on）
          label: 变更操作（启停容器）
```

**五道门槛，缺一不可**（顺序也是判据：**作用域 → 清单 → 能力 → 确认 → 持久审计**）：

| 门 | 判据 | 拒绝码 |
|---|---|---|
| 作用域 | 目标只能从 `scopeDirs` 内的目录使用 | `[OUT_OF_SCOPE]` |
| 清单 | 项目里有 `ready/<项目名>.ready.yaml` | 「没有清单 = 没有就绪要求」 |
| 能力 | 宿主启动环境里的 `DSH_DEVENV_WRITE=1`（配置里那一行只是「这个目标有写入口」） | `[CAPABILITY_NOT_GRANTED]` |
| 确认 | 每次调用都要 `confirmed: true`；第一次会被拒并**列出要动哪些容器** | `[CONFIRMATION_REQUIRED]` |
| 持久审计 | 配了 `auditFile`（**写类动作的前提**：`env_down` 停的可能是同事正在联调的那一份，事后必须说得清） | `[AUDIT_NOT_DURABLE]` |

审计的**前四道门都在它之前**：一个「没授权 / 没确认」的调用该报的仍然是它自己那一档，否则用户会先
去配审计、再撞一次「没授权」——那是本仓最忌讳的错诊断。审计的实现与口径见
[`@hyzyn/dsh-kit/audit`](../kit/README.md#审计出口audit-子路径)：**一条 JSON 行 / 调用，含被拒绝的尝试**；
写不进去时本次调用不返回结果（fail-closed）。**只读工具（`env_status` / `env_wait`）不受这道门限制**，
但同样进审计（默认出口是宿主日志）。

> ⚠️ **白名单的前提是这台机器上没有更宽的入口**：`docker` 的 `allowMutations` 一旦打开，
> `docker_action` 就能对**任意**容器动手 —— 那时本包的「清单就是白名单」**可以从旁边绕过去**。
> 共享机器上**只在一边开门**；代价与另一条路（让 docker 也认清单）为什么不做，见
> [devdata-plan.md § 13.1](../../docs/devdata-plan.md)。

**顺序为什么是「先能力、后确认」**：反过来的话，用户会在没授权时先被要求「说清要改什么」、说清之后
才被告知「你根本没授权」——两次调用都没有进展，而正确的那一次本该是「去启动环境加个变量再重启」。
（`devdata` 记录过同一类错诊断。）

**它做什么、不做什么**：

- **只动清单里声明的容器**——清单就是白名单。没有「按名字停任意容器」的入口：一台共享机器上的一次
  名字写错，可能就是同事正在联调的那一份；而 agent 的失败模式是**自信地重试**（换个拼法再来一次）。
- **`env_up` 只 `docker start`，不创建容器**：没有 `run` / `compose up` / `rm` / `rmi`。「起一份副本」
  是另一件事（镜像、卷、端口、责任），那是 `test-isolated` 的活；清单里写了但目标上没有的容器会在
  报告里单列一档。
- **幂等**：先观测再决定动谁（`up` 只启没在跑的、`down` 只停在跑的），所以重试是安全的；
  「本来就那样」的那一档也会出现在报告里（否则「写了三个服务、报告只有两个」会被读成漏做）。
- **`env_down` 用 `--time`**（给容器体面收尾的时间）：SIGKILL 是别人的决定，不是默认。

### 两个（只读）工具

| 工具 | 作用 |
|---|---|
| `env_status <target> [project] [cwd]` | 看一眼现在什么样，**不等待** |
| `env_wait <target> [project] [cwd] [timeoutMs]` | 等到就绪 / 等到**明确没戏** / 等满超时 |

两个都要求目标在 `scopeDirs` 内（判据用的是 `cwd` 参数，缺省取宿主进程的工作目录），
都在 `ready/<project>.ready.yaml` 里读判据（`project` 缺省取 `cwd` 的目录名）。

**探针是从运行本工具的机器发出的**（不是从目标主机内部），所以清单里的 `port` 必须从这台机器
可达——一般是 docker 发布到宿主机的端口。只支持 http：清单里没有协议字段，而把 https 当 http 探
只会得到一句连接错误，于是「服务没起来」和「协议写错了」变成同一句话。

## 就绪判据：它在解决什么

`env_wait` 最难的不是等待，是**知道在等什么**。没有声明式判据，它只能猜——而猜错的方向是
「以为起来了，其实还在热启动」，接下去跑测试得到一串**假阴性**，人再查一圈，最后发现
问题不在代码上。

### 一条硬判据：两个证据缺一不可

1. **`StartedAt` 必须落在可判的位置**——容器可能刚起、可能反复重启；
2. **启动完成行必须出现，且必须晚于本次 `StartedAt`**。

第 2 条里「晚于本次」是关键：容器重启后日志缓冲区里**还留着上一个进程的启动完成行**，
只看「有没有这一行」会在重启的那一瞬间判成就绪——而那正是最不该放行的一刻。

### 三种状态，不是为了好看

| 判定 | 含义 | 该做什么 |
|---|---|---|
| `ready` | 全部证据到齐且都成立 | 继续 |
| `unready` | 证据不足 / 还没到 | **继续等**（这是等待的常态） |
| `refuted` | 已有证据**明确否证**（容器退出了、健康检查是 unhealthy） | **别等了**——等下去不会有结果 |

把 `refuted` 混进 `unready` 的代价是：容器崩了还要等满超时（冷启动可配 150 秒），而 agent
拿到的是「超时」——它多半会**再等一次**。

### 清单长什么样

文件名 `<project>.ready.yaml`（**清单里的 `project` 必须与文件名一致**，不一致直接报错）：

```yaml
version: 1
project: ems
note: 冷启动 150 秒
services:
  - name: ems-service
    ready: { kind: logPattern, pattern: 'Started .*Application in' }
    timeoutMs: 150000
  - name: ems-redis
    # 不给 ready = 只要求容器在跑（「起个 redis 就完事」这类服务）
  - name: ems-gateway
    ready: { kind: httpProbe, path: /actuator/health, port: 8080 }
  - name: ems-worker
    ready: { kind: healthcheck }
```

## 一份真实报告长什么样

下面这段是 2026-10-02 从 248 上真取回来的（走插件本体、真 SSH；服务刻意都没声明 `logPattern`，
所以报告里不含任何日志内容）：

```
目标 nas-248（248（NAS，共享联调））· 项目 demo · 清单 ready/demo.ready.yaml
观测时刻：2026-10-02T14:04:01.006Z（这是**快照**：报告说的是那一刻的样子）

✓ ems-service-test（container）（耗时 0ms） 容器在跑（清单未要求更多）
    · 容器在跑
! cdc-service-test（healthcheck）（耗时 0ms） 等健康检查转 healthy（现在：容器没有配健康检查）
    · 容器在跑
    · 注意：已重启 1 次
    · StartedAt 可解析
    · 还缺：健康检查 healthy（现在：容器没有配健康检查）
! devenv-no-such-container（container）（耗时 0ms） 还没观测到这个容器
    · 还缺：容器存在
✓ redis（container）（耗时 0ms） 容器在跑（清单未要求更多）
    · 容器在跑

还差 2 个服务：cdc-service-test（健康检查 healthy（现在：容器没有配健康检查））、devenv-no-such-container（容器存在）
```

三件事一眼可见：**结论与证据并列**（不是一句「未就绪」）、**重启次数这种「不算否证但降低可信度」
的事实留着**（`已重启 1 次`）、以及**快照是哪一刻的**（观测时刻）。

## 这一层的三条纪律

1. **判定与观测分开**。`env-ready-eval.ts` 是纯函数（观测 + 要求 → 判定），**不发请求、不碰
   docker**；探针由执行层探完带回来。这样「判定对了没有」可以在没有真机的情况下被完整测试——
   而这一层最容易悄悄错掉的正是判定时机，不是崩溃。
2. **清单在加载时定死**。`ready` 必须**恰好**给一种判据，正则合法性、端口范围、未知字段
   都在加载时报错——留到运行时才发现，调用方已经在计时了。
3. **取不到证据 ≠ 否证**。`StartedAt` 解析不了、日志行没有时间戳，都只是 `unready`（继续等）；
   只有「容器不在跑」「健康检查 unhealthy」「探针 5xx」才是 `refuted`。

## 与其它包的关系

- **`@hyzyn/dsh-kit`**：唯一的依赖。SSH 执行层（`@hyzyn/dsh-kit/ssh-exec`）与 tty 连接簿读取
  （`tty-books`）都在那里，**本包不自建第三份实现**（守卫：`scripts/test/ssh-single-source.test.ts`）；
- **`@hyzyn/dsh-devdata`**：数据面。两包的清单同构（项目内文本 + DSH 侧只读 + 缺省即无），
  但**刻意不共用加载器**——目录约定由调用方给，因为判的对象不同、失败模式也不同；
- **`@hyzyn/dsh-docker`**：容器面板。它读同一份 tty 连接簿、走同一个执行层，两边**都不做**
  自己的跳板机 / 代理命令界面（一处配置、两处生效）。**注意两者不共用容器观测本身**：面板那一整套
  （ps / stats / images / events / exec / 长流）是它自己的面，本包只发两条只读命令
  （`docker inspect --format` + `docker logs --timestamps`），因为要判的字段就那么五个。

## 验到哪一档了（照实写）

**一条命令跑完**（六步，缺前提的那两步如实报 SKIP 不报红）：

```sh
pnpm --filter @hyzyn/dsh-devenv run verify
```

它跑：① `pnpm -r typecheck` → ② `pnpm -r build` → ③ 本包全量单测 → ④ 真机只读链路 →
⑤ 真机写入口 → ⑥ 真宿主挂载验收（委托给隔离脚本）。**真机那两步要凭据，而脚本刻意不去读凭据存储**
（那属于凭据服务）：要么自己 `read -rs DEVENV_REAL_SSH_PASSWORD && export …`，要么那两步跳过。
写入口那一步还要人**指名**一个可以动的容器（`DEVENV_REAL_WRITE_CONTAINER`）。

各档单独跑也可以：

| 档 | 怎么跑 | 实测 |
|---|---|---|
| 单测 | `npx vitest run packages/devenv` | ✅ 假宿主 + **真进程的假 docker** + 真临时清单 + 真 HTTP 服务 |
| **真 DSH 挂载** | `pnpm --filter @hyzyn/dsh-devenv run host-mount-smoke` | ✅ 2026-10-02 **12/12**（连跑两次）：装上 → 挂上 → `env_status` / `env_wait` 进真 ToolRuntime，没配 `writeCapability` 就没有写入口，收尾连临时目录都清干净 |
| **真机观测链路** | `DEVENV_REAL=1 DEVENV_REAL_SSH_PASSWORD=… npx vitest run packages/devenv/test/real-machine.test.ts` | ✅ 2026-10-02 **5/5**（248：SSH → `docker inspect` / `docker logs` → 解析 → 判定；含插件本体与「容器不存在 ≠ 通道不通」） |
| **真机写入口** | `DEVENV_REAL=1 DEVENV_REAL_WRITE_CONTAINER=<你指名的容器> DEVENV_REAL_SSH_PASSWORD=… npx vitest run packages/devenv/test/real-write.test.ts` | ✅ 2026-10-02 **6/6**（对 248 上一个一次性容器真停/真启，两次拒绝都**一条命令都没发**；收尾**还原现场**） |
| **写入口常态验证**（本机一次性容器，不用人指容器） | 就在 `npx vitest run packages/devenv` 里（**不需要**指定容器）。靶子镜像默认用本机已有的 `busybox` / `alpine`，都没有就拉一次；两者都不成（例如 Docker Hub 不通）再用 `DEVENV_LOCAL_WRITE_IMAGE=<本机镜像>` | ✅ 2026-10-03 **4/4**（真 daemon 28.3.2：被拒两次读回仍在跑、真停真启、幂等走「无需变更」、清单外不碰；收尾 `docker ps -aq` = 0）。**没起 Docker 时整档 SKIP**，理由写在套件名里；本次靶子是用 `DEVENV_LOCAL_WRITE_IMAGE` 指的本机镜像——这台机器到 Docker Hub 不通，默认路径在这里会如实 SKIP，CI 那步会先预拉 |

**真机那一档抓到过一个单测抓不到的缺陷**：`INSPECT_TEMPLATE` 原先写 `{{.State.RestartCount}}`，
而 `RestartCount` 是**顶层**字段——docker 的模板对缺失的键直接报错，于是**每条 inspect 都失败**，
`env_status` 只会说「取观测失败」。假 docker 夹具照自己的想象回一行，所以单测全绿：**夹具与真机之间
的保真度缺口**。现在有两条东西守着它：`test/inspect-template.test.ts`（拿真机 `docker inspect` 的
**结构样本**逐条解析模板里的字段路径，样本在 `test/fixtures/`，只有键与类型、没有值）与真机用例本身。

### 已经在哪几个 profile 里

| profile | 状态 |
|---|---|
| `test` | ✅ 2026-10-02 装了 `link:` 包 + 配置层（目标 `nas-248`，`kind=ssh` + `book=TEST`，作用域 `/Users/czz/coding/webproject`），**重启后已在启动日志里确认挂上**（见下） |

重启后的启动日志（`test` profile）：

```
[dsh-devenv] mounted (enabled=true, targets=1, logTail=200, execTimeoutMs=10000)
[dsh-devenv] agent tools registered (env_status, env_wait)
```

三件都没出现：`[dsh-devenv] 配置问题：…`、`[dsh-devenv] 工具注册失败：…`、`1 entry did not activate`
（前两件由隔离宿主脚本验过，最后那件用真 schema 单独验过——`patch` 层那份配置经 `Config` 解析后
是干净的）。

### 还没验到的

三条盲区——`Health` 路径的真机样本、SSH 目标的 HTTP 探针、冷启动 150 秒的轮询体验——各自的判据与
门槛收在 [ROADMAP.md](./ROADMAP.md) § 待办 A（**状态真源**），本文不复述。（原来的第四条「写路径的
常态验证」已于 2026-10-03 落地：本机一次性容器那一档，见上表与 ROADMAP 记-6。）
口径与记-4 相同：**验不到的不许报 `✓`**。

## 开发

```sh
pnpm -r typecheck          # 全仓类型检查
npx vitest run packages/devenv   # 本包用例
pnpm -r build              # lib/ 是入库产物，改源码必须重建
```
