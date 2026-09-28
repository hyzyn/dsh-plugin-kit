# @hyzyn/dsh-kit 缺陷台账（**转入**）

> **本文件是「转入台账」，不是本包的权威序列。** 下表 `kit D01`–`kit D05` 是**转入镜像**——
> 权威记录在**原包**（主要是 `codegraph CGxx`），kit 侧只是「改 kit 的人不必翻别人的台账」的入口。
> **引用时优先写原编号**（如 `codegraph CG05`）；kit 内部新发现的缺陷才接在 `D13` 之后编号。
> 跨包引用一律写 `<包名> <前缀><号>`（如 `codegraph CG05`、`tty D61`、`docker D13`），
> 裸编号只在本包文件内使用。规范见 [docs/conventions.md § 编号规范](../../docs/conventions.md#编号规范)。

## 这个文件为什么长这样

`@hyzyn/dsh-kit` 是**共享库**：它的缺陷绝大多数是在**消费包**里被发现、修在 kit 侧
（codegraph 的 `killProcessTree` / `dshHome` / settings 适配层，tty 的 `windows-shim` 测试）。
完整记录与编号留在**发现它的那个包**的台账里。

于是出现一个问题：改 `packages/kit/src/*` 的人，得去翻 `codegraph` 的台账才知道
「这段代码为什么长这样」。

本文就是为解决它而建的**转入台账**：

- 每条只写**一句话**（这段代码为什么长这样）+ **指回原编号**；
- **不复制原文、不重新编号、不删除原编号**（原编号仍是权威记录）；
- 新的、**在 kit 内部发现**的缺陷，直接接在 `D13` 之后编号，写在本文件里。

## 现状

**已修 13 / 待修 0**（`D01–D05` 为「在消费包发现、修在 kit」，`D06`–`D13` 是**本包内部**发现的）。
逐条见下表；`D01–D05` 原文见 [codegraph 的台账](../codegraph/DEFECTS.md)对应行。

## 转入清单

| kit | 原编号 | 这一条在说什么（这段代码为什么长这样） | 落点 |
|---|---|---|---|
| **kit D01** | `codegraph CG05` | `killProcessTree` 在 POSIX 上曾是 **no-op**，超时 / 取消没有兜底；现在支持 POSIX **进程组**（`detached` 组长），并有真机进程组测试 | [src/windows-shim.ts](../../packages/kit/src/windows-shim.ts) · [test/windows-shim.test.ts](../../packages/kit/test/windows-shim.test.ts) |
| **kit D02** | `codegraph CG36` | D01 的进程组击杀对「**不是组长**的子进程」会误打 `-pid`（正常 ESRCH 被吞，窄窗口是 pid 被复用为组长）→ 收窄成 `{ group }` 选项且**默认关**，只有自己 detached 启动的调用方显式 opt-in | [src/windows-shim.ts](../../packages/kit/src/windows-shim.ts) |
| **kit D03** | `codegraph CG13` | `~/.dsh` 缺失时挂载期抛错、**整个插件起不来**；`DSH_HOME=~/x` 时写的与 loader watch 的**不是同一个文件** → `dshHome()` 归一化（`~` 展开 + resolve，与 loader 同口径） | [src/services.ts](../../packages/kit/src/services.ts) |
| **kit D04** | `codegraph CG35` | D03 只做了一半：全仓还有 **8 处 raw 副本**，`DSH_HOME=~/x` 时两个包会写**两个不同**的 `cordis.patch.yml` → 8 处全改走 kit 的 `dshHome()`，并加 `scripts/check-dsh-home.mjs` 防回归闸（只认 kit 一份推导） | [src/services.ts](../../packages/kit/src/services.ts)（消费方改动在各包） |
| **kit D05** | `codegraph CG63` | DSH 0.1.7-rc.1 起 `ctx.settings.register(ns, schema)` / `settings.get(ns)` **已删除**（换成 `SettingsForms`）→ kit 新增 settings 适配层：`settingsEntryScope`（读 `describe()` / 写 `update(entryId, patch)` / 订阅 `loader/volatile-update`）、`plainConfig()`（还原 volatile 冻结引用）、`readSettingsEntry`、`suppressAutoSettingsPage` | [src/settings.ts](../../packages/kit/src/settings.ts) |
| **kit D06** | —（本包内部） | `writeFileAtomic` 的权限位随**进程 umask** 漂：`writeFileSync(tmp, data, { mode })` 得到的是 `mode & ~umask`，于是同一个调用在 umask 0 的机器上写 `0640`、在 umask 077 的机器上写 `0600`——而它管的是 `~/.dsh` 配置与密钥文件的可见范围，权限应当是**确定的**。修法：写入后按调用方要的 mode 显式 `chmod` 一次（不放宽：创建那一步仍先被 umask 收紧，chmod 只补回被削掉的位；Windows 跳过） | [src/managed-block.ts](../../packages/kit/src/managed-block.ts) · [test/kit.test.ts](../../packages/kit/test/kit.test.ts) |
| **kit D07** | —（本包内部） | 提权的环境变量判定源是**当次 `process.env`**（首查一次），而不是「宿主启动时继承的环境」：`.env` / `~/.dsh/env.yml` 这类**运行期可写**的文件因此可能被算成授权——是否成立取决于别的插件 `apply()` 的先后顺序（环境变量卡片写的就是 env.yml）。而 `capabilityHowTo` 恰好**推荐**「写入 ~/.dsh/env.yml」，等于教用户走一条不保证生效的路。修法：各插件在 `apply()` 第一行 `bindCapabilitySources(ctx)`，判定源改成宿主启动快照的 `process` 层（`ctx.get('launchEnvironment').getFrom(name, ['process'])`），文案同步改成「export + 重启」并明说 `.env` / `env.yml` 不算授权 | [src/capability.ts](../../packages/kit/src/capability.ts) · [test/capability.test.ts](../../packages/kit/test/capability.test.ts) |
| **kit D08** | —（本包内部） | 带外授权的**落点不带归属**：`capability-grants.json` 与 `grant-confirm/` 直接平铺在 DSH 主目录。那一层是**所有所有者共用**的（官方的 `sessions/` `logs/` `storages/`，本仓的 `tty/` `rss-digest/` `rss.json`），而这两个名字描述的是**机制**、不是所有者——等于替「集中式能力同意存储」这个位置预设占用者（DSH 核心将来加同名目录完全合理）。而且路径原本**两处各拼一遍**（存储自己拼文件名、插件自己 `join(dshHome(),'grant-confirm')`），改目录名必然漂一半。修法：收进 `<DSH home>/dsh-kit/`，路径只在 `capabilityPaths()` 里拼一次；权限归 kit 自己那一级目录（不再去 chmod DSH 主目录）。**对外无需迁移**（这个路径从未发布过），但本机开发期已经积下一份授权（改动前的构建写下的，`allowMutations` / `allowExec` 各一条）——就地把文件搬到新目录即可，已办 | [src/grant-store.ts](../../packages/kit/src/grant-store.ts) · [src/elevation.ts](../../packages/kit/src/elevation.ts) |
| **kit D09** | —（本包内部） | **持久授权重启后不可见**：带外授权是持久的——宿主重启后**直接生效、不再有任何一次确认**，而原来的审计只有 `begin` / `grant` / `expire` / `revoke` 四条，**载入（load）不在内**；`grantedAt` 虽然写进了授权文件，但快照不返回、卡片不显示、启动日志不打。于是「上个月授权的能力，今天一开机就静默开着」在日志与界面上都查不到——一次持久提权没有任何痕迹。修法：`auditLoadedGrants()`（启动期逐条打 `elevation: load capability=… via=file grantedAt=…`，仍不含 nonce 与路径）+ `capabilityGrantAt()` + 快照 `*GrantedAt` + 卡片上逐能力一行的「已授权 · YYYY-MM-DD HH:mm:ss」（**只有 `file` 通道有时刻**：环境变量通道编不出一个真时间，显示假时间比不显示更糟） | [src/elevation.ts](../../packages/kit/src/elevation.ts) · [src/capability.ts](../../packages/kit/src/capability.ts) · [test/elevation.test.ts](../../packages/kit/test/elevation.test.ts) |
| **kit D10** | —（本包内部） | 界面文案里点名**插件私有的文件名**：`capabilityHowTo` / 两侧客户端的 `elev.envHow` 原本写着「写项目 `.env` 或 `~/.dsh/env.yml` 都不算授权」——`.env` 是项目目录概念、`~/.dsh/env.yml` 更是**环境变量插件**才会有的东西，没装它的用户看到只会困惑（用户原话：「别人不见得会装 env 插件」）。规则本身（**启动之后再设、或写进别的配置文件都不算**）是安全相关的，必须留；实现细节（哪两个文件、为什么它们运行期可写）留给源码注释与文档。同一轮还扫掉两处**字面 `**`**（tty 新文案里我手写的「就地发起一次授权」——客户端没有 markdown 渲染器，与 docker D143 同一类） | [src/capability.ts](../../packages/kit/src/capability.ts) · [test/capability.test.ts](../../packages/kit/test/capability.test.ts) |

| **kit D11** | —（本包内部） | 能力判定在 kit 里是**模块级单例**（`bindCapabilitySources` 后绑定覆盖前一次），而各插件各 `new GrantStore(...)`——每个插件因此拿一份**文件快照副本**（该类是「首查读盘 + 进程内缓存」）。真机实测（2026-09-27，docker + tty 同装）：用户在 **tty 卡片**上完成就地授权，授权文件里明明有了这条记录，**tty 自己的快照却报 `granted: false`**（此刻绑定的是 docker 的实例，它在启动时缓存了「还没有这条授权」的表）→ 界面显示「未获宿主授权」、连撤销按钮都不渲染，策略重算也问的是错的来源（授权等于没生效）。也不能用「多来源取并集」糊过去：一个过期副本会**否决撤销**，方向恰好是危险的那一侧。修法：`sharedGrantStore(dir)`（按 `resolve` 后的目录 memo，同一目录只造一个实例），docker 与 tty 都改用它；单测同时钉住「共享 = 互相可见」与「各自 new = 互相看不见（这一条的理由）」 | [src/grant-store.ts](../../packages/kit/src/grant-store.ts) · [test/grant-store.test.ts](../../packages/kit/test/grant-store.test.ts) |

| **kit D12** | —（本包内部） | 真宿主验收里的「**无授权实例**」会**继承开发机上的持久授权**：带外授权是持久的（落在 `<DSH home>/dsh-kit/`，kit D09），而验收必须跑在用户真实的 DSH 主目录里（profile 里的 `node_modules` 是相对符号链接，换 `DSH_HOME` 会整批失联），于是只要用户在卡片上授权过一次，那个「无授权」实例就白拿那份授权。真机实测（2026-09-27）：`live-host-smoke` 的 A 段 **9/9 全红**（A1/A2/A3/A5/A5b/A5c/A6/A7/A7b），红的理由却与产品行为无关（该实例其实已授权；同轮 B 段 7/7 绿，A7 甚至显示代理命令真的跑起来了——那是闸门放行，不是缺陷）。这类闸门最坏的地方是**恒红且理由错**：跑几次之后没人再看它，真正的回归会一起被无视。修法：kit 新增 `DSH_KIT_HOME` 覆写（**测试 / 诊断用**，不是给用户调的旋钮——能设置宿主环境变量的人本来就能用启动环境变量直接授权，那条通道更强；这里只是把「授权落在哪个目录」也变成可注入的），验收给每个实例一份一次性 profile 里的 `.kit-home` 作授权目录，并把自己那份授权文件**只读地**念一遍（打印条数）留作现场 | [src/grant-store.ts](../../packages/kit/src/grant-store.ts) · [scripts/live-host-smoke.mjs](../../scripts/live-host-smoke.mjs) · [scripts/test/live-host-smoke-safety.test.ts](../../scripts/test/live-host-smoke-safety.test.ts) · [test/grant-store.test.ts](../../packages/kit/test/grant-store.test.ts) |
| **kit D13** | —（本包内部） | `consoleEncoding`（Windows 控制台代码页探测）把**超时**与「没有控制台」合成同一个确定性结论、并**进程级缓存**：`chcp` 探测超时是瞬态的（宿主启动争抢期 `cmd.exe` 能被拉起过 3s），而结论写入 `cachedConsoleEncoding` 后再不重试——**一次争抢就把整个会话钉死成错码表解码**，此后每条 CLI 输出都按 `windows-1252` 重解（CP936 中文系统上就是乱码被当成真实工具输出），恢复要重启宿主。同一条路径还漏了「为什么失败」：裸 `catch` 把超时与「没有控制台」写成了同一句话。修法：探测用 `undefined` 表示「没探明白」（判据只认 `killed` / `signal` / `ETIMEDOUT` 标记，不猜文案），超时结论**不缓存**、只在 30s 退避窗口内直接给兜底（免得每次建解码器都同步起一次 `cmd.exe`），窗口过后自动重探；确定性失败照旧缓存。`setConsoleEncodingProbe` 是给三平台矩阵用的注入缝——非 Windows 恒返回 UTF-8，跑不到这条分支 | [src/decode.ts](../../packages/kit/src/decode.ts) · [test/decode.test.ts](../../packages/kit/test/decode.test.ts) |

## 维护规则

1. **在 kit 内部发现**的缺陷：接在 `D13` 之后编号，只加一行 + 在代码注释里落编号；
   详细 postmortem 写进 commit message。
2. **在消费包发现、修在 kit** 的缺陷：原编号留在那个包的台账（权威），本文加一行转入记录。
   **不要**在两个地方都写详细正文。
3. 引用本包编号写 `kit Dxx`；引用别的包写 `<包名> <前缀><号>`。
4. 阈值 / 口径 / 基线数字**只增不改**；发现过期或矛盾只加 `> ⚠️ 标注`。
