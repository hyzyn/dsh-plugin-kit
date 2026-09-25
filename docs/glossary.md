# 术语表

> 只收录**本仓库特有**或**容易理解偏**的词。DSH 官方术语以 DSH 文档为准。

## 宿主与插件

| 术语 | 含义 |
|---|---|
| **DSH** | DeepSeek Harness。本仓库全部插件都挂在它的 Web GUI（`dsh web`）上 |
| **宿主半体** | 插件的 `src/` —— Node 侧代码，跑在 dsh 进程里（路由、子进程、SSH、文件） |
| **浏览器半体 / 客户端半体** | 插件的 `client-src/` → 构建产物 `client.js`。跑在浏览器或桌面壳里（React UI） |
| **插件 id** | 短横线小写标识（`docker`、`kit-settings`）。决定路由前缀 `/api/dsh-<id>/` 与配置命名空间 |
| **profile** | `~/.dsh/profiles/<name>` 下的一套独立 DSH 环境（自己的 bundle 层与补丁文件）。`dsh web` 默认用 `web` |
| **bundle / bundle 补丁** | 一个声明了 `dsh.bundle.patch` → `cordis.patch.yml` 的包。装它 = 按补丁把插件挂进 profile 阵容 |
| **聚合包** | `@hyzyn/dsh-all`：一条 bundle patch 挂载全部 10 个插件。仓库根 `package.json` 也是同等的 bundle |
| **Cordis** | DSH 的插件框架。插件导出 `{ name, inject, apply }` |
| **scope** | Cordis 的隔离层。`agent.ctx` 本身就是一个 scope（per-agent MCP 挂载就挂在这里） |

## 配置

| 术语 | 含义 |
|---|---|
| **托管区块**（managed block） | 插件在用户文件里**自动生成**的一段，带起止标记。**请勿手改**——下次保存会被覆盖或冲突 |
| **插件 entry 配置** | DSH 0.1.7-rc.1 起设置存在「当前 profile 的插件 entry」里（`cordis.patch.yml` 用户层），不再是全局 `settings.yaml` section |
| **`!!js` / `js:` 表达式** | 配置里以 `js:` 前缀书写的表达式（如 `js:process.env.TOKEN`），保存时求值 |
| **写前复核（弱 CAS）** | 写共享文件前记下 mtime+size，写完复核；变了就重读重算（≤3 次）。`mcp` 与 `codegraph` 都写 `cordis.patch.yml`，靠它避免丢行 |
| **定点行编辑** | 只改自己那一行（如 `cwd:`），其余字节不动。相对的是**整块重写**——后者是**有损往返**，会吃掉别人的 override 与注释 |

## 安全

| 术语 | 含义 |
|---|---|
| **回环围栏** | 只接受来自 `127/8` / `::1` / IPv6 映射地址的请求。全部路由的第一道闸 |
| **同源证明** | 变更端点（POST）额外要求 `Origin` 或 `Sec-Fetch-Site` 证明请求来自本页。**必须排在 DNS 等异步分支之前**，否则会被跳过 |
| **TOFU** | Trust On First Use：首次连接记下主机指纹，之后不一致即拒绝 |
| **指纹钉扎** | 把指纹写进配置，之后必须匹配。`docker` 复用 `tty` 的连接簿与钉扎记录作种子 |
| **连接簿** | `tty` 里保存的 SSH 主机条目（`book`）。`docker` 的 `kind=ssh` 目标可直接引用它的**名字**（数据级复用） |
| **`env:VAR` 引用** | 配置里只写变量名，明文放环境变量 / 官方凭据存储，**永不回传浏览器** |

## 客户端与供给

| 术语 | 含义 |
|---|---|
| **`__DSH_TRANSPORT__`** | 宿主注入到页面的传输基址（`streamBaseUrl`）。客户端半体拼地址的**唯一**合法来源 |
| **`dsh-app://app`** | 桌面版（Electron）的页面 origin。与 `dsh web` 的 `http://127.0.0.1:<port>` **不是同一个 origin** |
| **combo 路由** | 宿主把多个 `client.js` 合成一次响应（`/plugins/??<id>/client.js&rev=<hash>`）。`rev` 是**内容哈希**，猜必 404 |
| **三代插槽** | `plugins.row.config`（官方新版行配置）/ `settings.kit.item` / `settings.plugin.item`。客户端半体同时注册三代，一份产物通吃 |
| **产物闸门** | `pnpm -r build` 后 `git diff --exit-code -- 'packages/*/client.js' ':(glob)packages/*/lib/**'`。产物随源码入库，必须同步。闸门细节与实测见 [conventions.md § 真机脚本与 CI 接线](./conventions.md#真机脚本与-ci-接线) |

## 流与错误

| 术语 | 含义 |
|---|---|
| **SSE 长流** | 服务端推送的事件流（日志 / 统计 / 事件 / 拉取）。要有**背压**（`write()` 返回值 + `drain`）与**心跳** |
| **背压** | 慢客户端时不能无界缓冲。本仓库做法：队列 + `drain` 续写 + 每条流上限 |
| **截断信号** | 数据被截断时必须显式告知（`truncated` / 「已显示前 N 条，共 M 条」）。**静默少列**是本仓库历史上出现最多的一类缺陷 |
| **降级（degraded）** | 「权威数据没取到」要显式标记，**不能**当成「没有异常」 |
| **优雅退化** | 跨插件依赖缺失 / 版本过低时降级而不是报错（如 docker 的终端按钮三级退化） |
| **空壳行** | `DEFECTS.md` 里只有编号、没有症状或修法说明的行。台账守卫会拦 |

## 台账

| 术语 | 含义 |
|---|---|
| **L0 / L1 / L2** | 项目级文档 / 包级文档 / 代码注释。见 [conventions.md](./conventions.md#文档分层) |
| **编号字典** | `packages/<pkg>/DEFECTS.md`。它的真实角色是**代码注释的编号字典**，不是审计报告 |
| **转入台账** | `packages/kit/DEFECTS.md` 的形态：本包自己的序列，每条只写一句 + 指回原编号（`codegraph CG05`） |
| **冻结记录** | `DEFECTS.md` 的 §4：被移出正文的内容在哪个 sha 里能取回 |
