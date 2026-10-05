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

**配置 UI**（2026-10-03 起）：设置 → 插件配置里的「环境编排」卡片能改标量与目标名单，
并把「写闸门」与「TOFU 指纹」**只读**摆出来——见下面的
[配置卡片](#配置卡片客户端半体) 一节。此前改配置只能手改 profile 补丁层。

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

> **「写路径要 `auditFile`」这条现在可以在卡片上补**：`auditFile` 是配置卡片六个可改标量之一
> （见下面的「配置卡片」一节），填上它就落盘、并**立刻**对写类动作生效（volatile 字段热应用，不重启宿主）。
> 还没补时那两档的行为是 `[AUDIT_NOT_DURABLE]`——**只读工具不受影响**。

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
| `env_wait <target> [project] [cwd] [timeoutMs]` | 等到就绪 / 等到**明确没戏** / 等满超时 / 等到**调用方取消** |

两个都要求目标在 `scopeDirs` 内（判据用的是 `cwd` 参数，缺省取宿主进程的工作目录），
都在 `ready/<project>.ready.yaml` 里读判据（`project` 缺省取 `cwd` 的目录名）。

**探针是从运行本工具的机器发出的**（不是从目标主机内部），所以清单里的 `port` 必须从这台机器
可达——一般是 docker 发布到宿主机的端口。只支持 http：清单里没有协议字段，而把 https 当 http 探
只会得到一句连接错误，于是「服务没起来」和「协议写错了」变成同一句话。

### 等待过程：报告要能回答「在等什么」（2026-10-04）

这一版工具面**没有给工具用的进度通道**（`presentCall` 只拿得到 `args`，拿不到运行中的事实），
所以冷启动那 150 秒里 agent 拿到的仍然是**一次**返回。能做的是让那一次返回带上**过程**：

```
停止等待的原因：全部就绪
...
等待过程（共观测 3 次）
  · +0ms 还差 1 个服务：ems-service（还没观测到这个容器）（连续 2 次结论相同）
  ✓ +6.0s 全部 1 个服务就绪
```

逐段列出（结论与那句话都没变的连续几次并成一段并注明次数），段数过多时首尾各表 + **说清省略了
多少段**。这样「一直卡着」与「在往前走」在报告里是两件看得出来的事——而这两种情况下一步动作
完全不同。

**取消**（`exec.signal`）：`env_wait` 的上限是 15 分钟，所以「取消不生效」是很贵的——调用方已经
走了，工具还在那边每 3 秒打一次 SSH/docker。现在：

- 每一轮观测**之前**先看信号（取消后不再探一轮），睡着的等待也能被立刻唤醒；
- 取消**不是**超时、也**不代表**环境有问题——报告里那句话把三件事分开（否则下一次就会有人去查环境）；
- 工具声明了协作式预算（`timeoutMs`），按 SDK 契约声明了就必须转发信号，两件事一起做。

> **这一条是修缺陷，不是新功能**：`exec.signal` 是 SDK 明写的契约（「Async work must observe or
> forward `exec.signal`」），而此前 `env_wait` 的 `execute` 连第二个参数都没接。
> 机制在 [`src/wait.ts`](./src/wait.ts)，用例见 `test/wait.test.ts`（假时钟）与 `test/plugin.test.ts`
> 里那条真时钟的取消用例——**反例实测过**：把转发那一行去掉，那条用例等满 20 秒才失败。

## 配置卡片（客户端半体）

设置 → 插件配置里那张「环境编排」卡（`packages/devenv/client.js`，手写、**没有构建步骤**：
它本身就是源）。数据面是宿主那条 `GET/POST /api/dsh-devenv/config`（同源相对路径，客户端
不硬编码宿主地址）。

**版面**（2026-10-04，与 `devdata` / `devfront` 两张卡同一套）：四层分组面板（插件配置 / 目标 /
写闸门 / TOFU 指纹）+ 两列栅格（窄窗口 <640px 回落单列）+ **行头写闸门胶囊**（已授权 / 未授权 /
未声明写闸门，判据与下面那张只读表同一份 `writeGates`）+ 主色只出现在「保存」。字段文案拆成
「短标签 + 灰色口径小字」两组键（口径一条不丢，只是下沉；顺带清掉了文案里的字面 `**`）。
**这三件都是视觉**：`.dv_card` 的嵌套（「+ 添加目标」所在那层必须能被 `closest('.dv_card')` 命中，
否则确认框会先命中标量那一段）、`.dv_input` 的**顺序**（id / 文案 / kind / 连接簿条目 / 作用域）
与「编辑器那层里第一个复选框就是确认框」，都是验收脚本 ㉓ 定位用的契约，改版时不能动。

**能改什么、不能改什么**——这张表就是判据，不是排版：

| 面 | 能改吗 | 为什么 |
|---|---|---|
| 标量：`enabled` / `announceToAgent` / `auditFile` / `probeTimeoutMs` / `waitTimeoutMs` / `pollIntervalMs` | ✅ | 它们只影响「怎么看、等多久」 |
| 目标：`id` / `label` / `kind`(`local`\|`ssh`) / `book` / `scopeDirs` | ✅ **逐次确认** | 它是「agent 能用哪些目标、在哪些目录里动手」的**声明**，与就绪清单同一类 → 每次保存都要勾那个确认框（`confirmTargetEdit: true`），不勾就是 400 + `CONFIRMATION_REQUIRED`；变更进审计 |
| `writeCapability` | ❌ **只读** | 见下 |
| `hostKeys`（TOFU 指纹记录） | ❌ 只读展示 | 改它等于放弃指纹校验。卡片只摆 host / 端口 / 指纹**条数** |
| `execTimeoutMs` / `logTail` / `stopTimeoutSec` | 走 profile 补丁层 | 运维旋钮；卡片只暴露上面那六个——多一个可写字段就多一片要评审的面 |

**为什么 `writeCapability` 必须只读**（这是这张卡片最重要的一条判据）：授权判据是「宿主**启动继承层**
里那个环境变量的值 ∈ `1`/`true`/`yes`/`on`」（`kit` 的 `TRUTHY`；`project-env` / `user-env` 两层刻意
排除），而变量名来自配置。所以**真正的口子不是「随手改成 `HOME`」**（它的值不在白名单里，`env` 名指向
它**不会**授权），而是**把它指向另一个已经在启动环境里、值恰好为真的变量**（例如 `CI=true`）——那样
页面脚本一次 `POST` 就等于**免重启提权**。（2026-10-03 更正：这处此前用 `HOME` 当例子，是错的。）所以：

- `POST` 体里出现 `writeCapability` → **400**，码 `CAPABILITY_READONLY`（目标行里的那一处同样拒）；
- 卡片只**显示**这一档：每个目标一行，给出「声明的环境变量名 + 当前是否已授权（判据是宿主启动环境，
  不是配置文件）+ 怎么授权」，并说明**没声明 `writeCapability` 的目标 = `env_up` / `env_down` 根本不注册**；
- 与之配套的一条：**改目标不会顺手把写闸门抹掉**（同 `id` 的目标，其 `writeCapability` 原样带过去）。
  否则用户只改一个 `scopeDirs` 的错别字，写工具就从工具面消失了——而卡片上没有任何地方能把它加回来
  （它是只读的）。改 `id` 等于换一个目标，闸门不跟过去，要重新在补丁层声明一次。

`GET` 快照把 `writeCapability` 投影成**只读档** `writeGates`（`writeCapability` 这个名字在
POST 里是被拒的），把指纹投影成 `hostKeys: [{ host, port, fingerprints }]`（`fingerprints` 是**条数**）。

要不要用卡片改配置，可以先看这一条判据：**它只碰「怎么看」与「允许哪些目标在哪些目录里」，
绝不碰「谁能动手」**。后面那条改动每次都要勾确认框、也进审计。

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

**一条命令跑完**（七步，缺前提的那几档如实报 SKIP 不报红）：

```sh
pnpm --filter @hyzyn/dsh-devenv run verify
```

它跑：① `pnpm -r typecheck` → ② `pnpm -r build` → ③ 本包全量单测 → ④ 真机只读链路 →
⑤ 真机 HTTP 探针 → ⑥ 真机写入口 → ⑦ 真宿主挂载验收（委托给隔离脚本）。**真机那三档要凭据，而脚本刻意
不去读凭据存储**（那属于凭据服务）：要么自己 `read -rs DEVENV_REAL_SSH_PASSWORD && export …`，要么
那几档跳过。第 ⑤ 档还要两个**环境事实**（一个从本机可达、会回 2xx/3xx 的端口
`DEVENV_REAL_PROBE_PORT`，一个从本机发 HTTP 永远没响应的端口 `DEVENV_REAL_PROBE_TIMEOUT_PORT`），
第 ⑥ 档还要人**指名**一个可以动的容器（`DEVENV_REAL_WRITE_CONTAINER`）。**每一档单独 SKIP、理由单独打**
——一档跳过了不该被另一档的 PASS 盖住。

**配置卡片那一档不在这条一键里**（它要真 Chrome，与 `devfront` 同档）：单独跑
`pnpm --filter @hyzyn/dsh-devenv run card-smoke`，见下表。

各档单独跑也可以：

| 档 | 怎么跑 | 实测 |
|---|---|---|
| 单测 | `npx vitest run packages/devenv` | ✅ 假宿主 + **真进程的假 docker** + 真临时清单 + 真 HTTP 服务 |
| **真 DSH 挂载** | `pnpm --filter @hyzyn/dsh-devenv run host-mount-smoke` | ✅ 2026-10-02 **12/12**（连跑两次）：装上 → 挂上 → `env_status` / `env_wait` 进真 ToolRuntime，没配 `writeCapability` 就没有写入口，收尾连临时目录都清干净 |
| **配置卡片**（起真宿主 + 真 Chrome） | `pnpm --filter @hyzyn/dsh-devenv run card-smoke`（= `node scripts/verify-devenv-card.mjs`；`--dump` 只打插件页与卡片结构、`--keep` 失败时留现场） | ✅ 2026-10-03 首跑与复跑各 **21 PASS / 0 FAIL**（隔离 `DSH_HOME` + 一次性 profile）：数据面 9 条 + `writeCapability` 只读那条 400 + 改目标逐次确认 + 改目标不抹掉写闸门 + 审计 6 行 + bundle 真被加载（含四个槽）+ 插件页那一行（running）+ **详情页卡片渲染出 21 个控件**（目标编辑器 / 写闸门只读面板 / 指纹只读列表）+ 真实 `~/.dsh/cordis.patch.yml` 逐字节未变。**2026-10-04 补齐客户端那一路**（㉓㉔㉕）：在卡片上真的加一行 → 填 5 个控件（含 `kind` 下拉）→ 勾确认 → 点保存 → 回「目标已保存（进审计）」→ HTTP 复核 `dv-dom` 的 `kind` / `book` / 两个作用域，外加「这条写入口**也没抹掉**写闸门」；当天复跑 **24 PASS / 0 FAIL**，并做了反例实测（扣掉下拉框的 `change`：DOM 那条照绿、HTTP 复核红）。口径见 [conventions.md § 客户端卡片](../../docs/conventions.md#客户端卡片改配置那条路要有真机-dom-证据) |
| **真机观测链路** | `DEVENV_REAL=1 DEVENV_REAL_SSH_PASSWORD=… npx vitest run packages/devenv/test/real-machine.test.ts` | ✅ 2026-10-02 **5/5**（248：SSH → `docker inspect` / `docker logs` → 解析 → 判定；含插件本体与「容器不存在 ≠ 通道不通」） |
| **真机 SSH 探针** | `DEVENV_REAL=1 DEVENV_REAL_SSH_PASSWORD=… DEVENV_REAL_PROBE_PORT=<会回 2xx/3xx 的端口> DEVENV_REAL_PROBE_TIMEOUT_PORT=<发 HTTP 永远没响应的端口> npx vitest run packages/devenv/test/real-probe.test.ts` | ✅ 2026-10-03 **2/2**（248，同一天两半各一次）：`6080`（rmqdashboard）**真 200** → `✓ … HTTP 200 /`；`10912` 发 HTTP 挂住不响应 → 探针等满 1500ms 预算，报 `!`（继续等）而**不是** `✗`（别等了）。两条都走插件本体（连接簿 → `probeHost = 那台主机的地址` → 真网络） |
| **真机写入口** | `DEVENV_REAL=1 DEVENV_REAL_WRITE_CONTAINER=<你指名的容器> DEVENV_REAL_SSH_PASSWORD=… npx vitest run packages/devenv/test/real-write.test.ts` | ✅ 2026-10-02 **6/6**（对 248 上一个一次性容器真停/真启，两次拒绝都**一条命令都没发**；收尾**还原现场**） |
| **写入口常态验证**（本机一次性容器，不用人指容器） | 就在 `npx vitest run packages/devenv` 里（**不需要**指定容器）。靶子镜像默认用本机已有的 `busybox` / `alpine`，都没有就拉一次；两者都不成（例如 Docker Hub 不通）再用 `DEVENV_LOCAL_IMAGE=<本机镜像>` | ✅ 2026-10-03 **4/4**（真 daemon 28.3.2：被拒两次读回仍在跑、真停真启、幂等走「无需变更」、清单外不碰；收尾 `docker ps -aq` = 0）。**没起 Docker 时整档 SKIP**，理由写在套件名里；本次靶子是用 `DEVENV_LOCAL_IMAGE` 指的本机镜像——这台机器到 Docker Hub 不通，默认路径在这里会如实 SKIP，CI 那步会先预拉 |
| **Health 常态验证**（本机一次性健康检查容器） | 就在 `npx vitest run packages/devenv` 里；靶子镜像与上一档共用 `DEVENV_LOCAL_IMAGE`（旧的 `DEVENV_LOCAL_WRITE_IMAGE` 仍认） | ✅ 2026-10-03 **4/4**（真 daemon 28.3.2）：真 `docker inspect` 的结构满足模板且与入库样本**逐条同类型**、真 CLI 渲染出五段且末段就是健康状态；插件本体对真 `healthy` 给 `✓`、对真 `unhealthy` 给 `✗` 且 `env_wait` **不空等**。连不上 daemon / 没有可用镜像时整档 SKIP |
| **冷启动等待报告**（本机一次性容器，真的慢启动） | 就在 `npx vitest run packages/devenv` 里（**不需要**指定容器）；靶子镜像同样取 `DEVENV_LOCAL_IMAGE`——本机到 Docker Hub 不通时它必填，且镜像里要有 `javac`（靶子用它现场起一个可控的 HTTP 服务，理由见 ROADMAP 记-14） | ✅ 2026-10-04 **2/2**（真 daemon 28.3.2）：真慢启动 21.4s 的报告分成 **3 段**、段间话术互不相同、末段是就绪（中间那段是 `HTTP 404`，**可以等**、不是「别等了」）；同一档验取消（708ms 返回）。**这一档当场抓出一条缺陷**——冷启动最长那一段原本报裸英文 `socket hang up`，`probeFailureDetail` 因此多了 `ECONNRESET` 一支；落点与理由见 ROADMAP 记-14。没起 Docker / 镜像里没有 `javac` 时整档 SKIP，理由写在套件名里 |

**真机那一档抓到过一个单测抓不到的缺陷**：`INSPECT_TEMPLATE` 原先写 `{{.State.RestartCount}}`，
而 `RestartCount` 是**顶层**字段——docker 的模板对缺失的键直接报错，于是**每条 inspect 都失败**，
`env_status` 只会说「取观测失败」。假 docker 夹具照自己的想象回一行，所以单测全绿：**夹具与真机之间
的保真度缺口**。现在有两条东西守着它：`test/inspect-template.test.ts` 拿真机 `docker inspect` 的
**结构样本**逐条解析模板里的字段路径（两份样本都在 `test/fixtures/`，只有键与类型、没有值），
以及两档真 daemon 用例本身。

### 结构样本怎么来（可复现）

模板里的字段路径只有在**真 docker 的结构**里才判得准（`RestartCount` 那次就是假夹具骗过了所有人）。
样本只有键与类型，**一个值都不进仓库**；两份各守一档：`docker-inspect.state.json` 来自**没有**健康检查
的容器，`docker-inspect.health.json` 来自**配了**健康检查的容器。

```sh
# ① 起一个配了健康检查、且会转成 healthy 的一次性容器（本机真 daemon 即可）
docker run -d --name dsh-devenv-sample --health-cmd 'test -f /tmp/ok' \
  --health-interval 1s --health-timeout 2s --health-retries 3 \
  --entrypoint sh <镜像> -c 'touch /tmp/ok; sleep 300'

# ② 取结构（`shapeOf` 与 test/inspect-shape.ts 里那个同构：标量 → 类型名，数组 → 一个代表性元素）
docker inspect dsh-devenv-sample | node -e '
const shape = (v) => Array.isArray(v) ? (v.length === 0 ? [] : [shape(v[0])])
  : (v !== null && typeof v === "object") ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, shape(v[k])]))
  : typeof v
const raw = JSON.parse(require("fs").readFileSync(0, "utf8"))[0]
process.stdout.write(JSON.stringify({ RestartCount: shape(raw.RestartCount), State: shape(raw.State) }, null, 2) + "\n")'

# ③ 收尾
docker rm -f dsh-devenv-sample
```

> 一份样本只说明**那一刻**的结构。带健康检查那份的守法是**双份**：入库样本 + `real-health-local.test.ts`
> 拿当下这台 daemon 的真输出再验一遍（两者的模板路径类型必须逐条一致）——样本过期的表现就是那一条开始红。

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

剩下一条盲区——**冷启动 150 秒那一档的轮询体验**：2026-10-04 把两件可离线验的做完了
（等待过程进报告、取消真的生效，见上），但**真冷启动服务那一次仍然没跑**（本机 docker daemon
没起、248 要 VPN）。剩下的门槛与判据收在 [ROADMAP.md](./ROADMAP.md) § 待办 A（**状态真源**），
本文不复述。

配置卡片那一档顺带带出一条**已知的**边界：英文界面下「怎么授权」那段话术来自
`@hyzyn/dsh-kit` 的 `capabilityHowTo()`（宿主侧判据的一部分，中文），不在本包的 i18n 目录里——
卡片自己是双语的，**这一段不是**。要不要把它也在 `kit` 里做双语，记在
[ROADMAP.md](./ROADMAP.md) 记-11 的「这一轮没验到 / 已知的两处」。

原来的三条已于 2026-10-03 落地：`Health` 路径的真机覆盖（本机真 daemon 上的一次性健康检查容器）、
SSH 目标的 HTTP 探针（248 上**真 200 与真超时各一次**，见上表与 ROADMAP 记-10）、以及更早的
「写路径的常态验证」（记-6）。口径与记-4 相同：**验不到的不许报 `✓`**。

## 开发

```sh
pnpm -r typecheck          # 全仓类型检查
npx vitest run packages/devenv   # 本包用例
pnpm -r build              # lib/ 是入库产物，改源码必须重建
```
