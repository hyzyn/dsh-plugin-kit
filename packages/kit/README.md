# @hyzyn/dsh-kit

dsh-plugin-kit 的插件开发工具包：类型助手 + 宿主半体共享工具库。
运行时依赖只有 `js-yaml`（!!js 表达式方言）；`@deepseek-ai/cordis` 仅为类型。

## API

### 类型助手

- `definePlugin(plugin)` —— 类型化身份函数，返回带 `DshPlugin<C>` 精确类型的插件对象；
- `DshPlugin<C>` / `PluginConfig` —— 插件对象与配置的类型。

```ts
import { definePlugin } from '@hyzyn/dsh-kit'

const plugin = definePlugin<{ enabled?: boolean }>({
  name: 'my-plugin',
  inject: [],
  apply(ctx, config) {
    /* 挂载逻辑 */
  },
})

export const { name, inject, apply } = plugin
```

### Windows `.cmd` shim（`windows-shim`）

Windows 上 npm / pnpm / 独立安装器给出的 CLI 往往只有 `.cmd` shim，没有真正的
`.exe`。`spawn` / `execFile` 默认 `shell: false` 时：裸命令名解析不到 `.cmd`
（`spawn codegraph ENOENT`），写绝对 `.cmd` 路径又被 Node 因 CVE-2024-27980 加固拒绝
（`spawn … EINVAL`）。本模块把命令行交给 `%COMSPEC% /d /s /c`，转义规则同 cross-spawn
（MCP 官方 SDK 的做法）。

- `spawnPortable(command, args, options)` —— 跨平台启动外部命令；Windows 上非 `.exe` /
  `.com` 自动套 cmd.exe。**参数转义由本模块负责，调用方只管传 argv**；
- `portableSpawnPlan(command, args, { platform, comspec })` —— 纯函数，决定「直连」还是
  「经 cmd.exe」。抽出来是为了能在任何平台断言这条分支（选错就等于命令注入或必然 ENOENT）；
- `escapeCommand` / `escapeArgument` / `windowsCommandLine` —— cmd.exe 转义规则；
- `taskkillArgs(pid)` / `killProcessTree(pid)` / `terminateChild(child)` —— Windows 上
  `/T` 收整棵进程树：shim 里真正的程序是 cmd.exe 的**孙**进程，只 `child.kill()` 会留下孤儿。

```ts
import { spawnPortable, terminateChild } from '@hyzyn/dsh-kit'

const child = spawnPortable('codegraph', ['serve', '--mcp'], { cwd: project })
// ...
await terminateChild(child)
```

### 子进程输出解码（`decode`）

Windows 上 cmd.exe 自己的错误消息按**控制台代码页**（中文系统 CP936）写管道，而
`Buffer#toString()` 默认 UTF-8 —— 卡片上的报错会整段变成 `���`。

- `createOutputDecoder({ fallbackEncoding? })` —— 流式容错解码器：严格 UTF-8 优先，
  遇到真正非法的字节就把**整条流**回落到控制台代码页重解一次；不完整的多字节尾巴留在
  内部，所以**块边界切在字符中间也不会误判**；
- `decodeOutput(buf, options)` —— 一次性版本（适合 `execFile` 的 `encoding: 'buffer'`）；
- `consoleEncoding()` —— 当前控制台输出代码页对应的编码标签（Windows 上问 `chcp`，
  其余平台恒为 `utf-8`），进程内缓存。

```ts
import { createOutputDecoder } from '@hyzyn/dsh-kit'

const stderr = createOutputDecoder()
child.stderr?.on('data', (chunk) => (tail += stderr.decode(chunk)))
child.on('close', () => (tail += stderr.flush()))
```

### 服务与 DSH 目录（`services`）

- `getService(ctx, name): unknown` —— 读宿主服务：先 `ctx.get(name)`，取不到再回退
  `ctx[name]`（兼容宿主不同版本 / 插件直接挂属性的写法）；服务真值是 falsy 时不会
  误回退。
- `dshHome(): string` —— DSH 主目录：`DSH_HOME`（trim 后）优先，否则 `~/.dsh`。
  全仓曾有 8 份逐字重复的推导，读的是同一份配置目录，新代码一律用这个函数。

```ts
import { HOST_SERVICES, dshHome, getService } from '@hyzyn/dsh-kit'

// 服务名走常量，不要写字面量：它是运行时字符串键，拼错了不报错、只静默降级
// （`getService` 返回 undefined）。判据见 docs/conventions.md § 常量。
const sessionQuery = getService(ctx, HOST_SERVICES.sessionQuery)
const patchFile = join(dshHome(), 'cordis.patch.yml')
```

### 字符串契约常量（`host-services`）

**跨进程 / 跨包的字符串键**——类型管不住、写错了不报错的那一类。判据见
[docs/conventions.md § 常量](../../docs/conventions.md#常量什么该提什么不该提)：
**类型联合的取值不要提常量，运行时字符串键要提。**

- `HOST_SERVICES` —— 宿主服务名（`settings` / `launchEnvironment` / `llm` / `tools` /
  `sessions` / `sessionQuery` / `sessionPersistence` / `agentDefaultModel`）。**不是穷举**：
  只登记本仓用到的，新增一处补一行即可。
- `HOST_SERVICE_NAMES` —— 上面全部值（守卫与用例用）。
- `LAUNCH_ENV_LAYERS` —— 启动环境的层名（`process` / `project-env` / `user-env`）。
  **`process` 是唯一可用于授权的层**；后两层运行期可写（环境变量卡片），拿它们当授权
  等于把提权路径搬到那张卡片上。

`launchEnvironment` 为什么单独点名：它错了会**静默换掉能力闸门的判定源**（回落到冻结的
`process.env` 拷贝）——安全相关，不是体验问题。

守卫：`scripts/test/string-contracts.guard.test.ts`（源码扫描，跳过注释行；
只认 `getService(ctx, '…')` 一种写法）。

### HTTP 路由辅助（`http`）

宿主半体路由的共用围栏与响应样板，类型是结构化的 `ReqLike` / `ResLike`
（不绑定 node:http 版本，测试可直接传假对象）：

- `isLoopbackRequest(req): boolean` —— loopback-only + 同源围栏：remoteAddress 必须是
  回环地址、Host 必须指向本机（防 DNS rebinding）、`sec-fetch-site: cross-site` 拒绝、
  `Origin`（若有）必须与 Host 同源。9 个插件的重复围栏收敛于此（**同步档**，语义未动）。
- **加固档**（2026-09-25 自 `docker` 上提，`docker` · `tty` · `dsh-mcp` 三包在用；
  两档的边界见 [architecture.md § 一条请求经过什么](../../docs/architecture.md#7-一条请求经过什么)）：
  - `isLoopbackRequestStrict(req): boolean | Promise<boolean>` —— 127/8 全段 + `::1` +
    IPv6 映射、`*.localhost` 与 `/etc/hosts` 别名的 DNS 确认（500ms 超时 / 60s LRU）、
    **来源检查排在 DNS 之前**。字面量环回走同步分支（保持「第一拍就建流」的时序），
    所以**调用方必须处理 Promise 那一支**；
  - `hasSameOriginProof(req): boolean` —— 变更端点与长流端点的同源证明：`Sec-Fetch-Site:
    same-origin` 或同源 `Origin`；两者都缺省时只放行**带宿主 Cookie** 的请求（桌面壳那条
    转发链会删掉前两个头，见 `docker D139`）；
  - `originProofHint(req): string` —— 403 的成因摘要（只报三个头的有无，**不落 Cookie 值**）；
  - `isLoopbackAddress(address): boolean` —— 地址判定本身（127/8 全段 + IPv6 等价形式）。
- `writeJson(res, status, body, headers?)` —— JSON 响应基线（content-type /
  referrer-policy / cache-control: no-store / x-content-type-options: nosniff），
  `headers` 可覆盖单条。
- `readJsonBody(req, maxBytes = 1MB)` —— 聚合请求体并解析对象；超限、流错误、
  非法 JSON、非对象结果一律返回 `undefined`（调用方按 400 处理）。

```ts
if (!isLoopbackRequest(req)) return writeJson(res, 403, { error: 'forbidden: loopback-only' })
const body = await readJsonBody(req)
if (body === undefined) return writeJson(res, 400, { error: 'invalid json body' })
```

```ts
// 加固档：字面量环回同步、别名主机名才等 DNS——所以要处理两种返回
const loopback = isLoopbackRequestStrict(req)
const ok = loopback instanceof Promise ? await loopback : loopback
if (!ok) return writeJson(res, 403, { error: 'forbidden: loopback-only' })
if (!hasSameOriginProof(req)) return writeJson(res, 403, { error: '缺少同源证明' })
```

### 能力开关的宿主侧授权（`capability` / `grant-store` / `elevation`）

危险能力开关（docker 的 `allowMutations` / `allowExec`、tty 的 `allowProxyCommand`）的
**提权通道**。为什么需要它：回环围栏与同源证明都拦不住**跨站页面与页内脚本**（它们能发
HTTP，也能自己填 `Sec-Fetch-Site: same-origin`——那是请求头不是凭据），于是
`POST /config {allowMutations:true}` 曾经一次就能把危险能力打开。为什么不是给 `/config`
加一次性 token：它是插件被禁用后**唯一**的恢复入口，token 化等于把用户锁在外面
（取舍与威胁模型边界见 [architecture.md § 一条请求经过什么](../../docs/architecture.md#7-一条请求经过什么)）。

两条通道：

1. **启动环境变量**（最严档）：判定源是宿主的**启动环境快照**，且**只认继承来的 `process`
   层**——`project-env`（`<cwd>/.env`）与 `user-env`（`$DSH_HOME/.env`，环境变量卡片写的
   `~/.dsh/env.yml` 就是它）都算**不**授权：它们都有运行期写入路径，拿它们当闸门等于没有闸门。
2. **就地提权**（免重启档）：页内点开关 → 面板给出一条「在宿主上落地一个随机名文件」的命令
   → 宿主发现该文件即授权，写进 `grant-store`（`<DSH home>/dsh-kit/capability-grants.json`，0600，
   原子写；确认目录 `<DSH home>/dsh-kit/grant-confirm/`）。**落点收在 `dsh-kit/` 这一级**：DSH
   主目录是所有所有者共用的平铺目录（官方的 `sessions/` `storages/`，本仓的 `tty/` `rss-digest/`），
   而 `capability-grants.json` / `grant-confirm/` 描述的是**机制**、不带所有者，铺在那一层容易与
   官方或别的插件撞名（**kit D08**）。拦得住跨站页面与页内脚本；**拦不住**能在本机执行命令的
   同用户进程——它读得到自己那次 `begin` 的响应、也写得了那个文件，本来还能直接跑 `docker`
   （不在威胁模型内）。

- `bindCapabilitySources(ctx, grants?)` —— **各插件在 `apply()` 第一行调用**：绑定「这次宿主
  的启动环境」与带外授权存储（不传 = 本插件只有启动环境通道；docker / tty 都传了存储）；
- `capabilityGranted(spec): boolean` —— 有没有授权（环境变量值为 `1` / `true` / `yes` / `on`
  才算；**绑定后运行期改 `process.env` 不生效**）；
- `capabilityGrantVia(spec): 'env' | 'file' | undefined` —— 由哪条通道授权（两条都命中时报
  `'env'`：那时撤销带外授权并不能真的关掉能力，界面据此不给「撤销」按钮）；
- `capabilityGrantAt(spec): number | undefined` —— 授权时刻（Unix 秒；**只有 `file` 通道有值**，
  环境变量通道没有「授权时刻」）。授权是**持久**的：重启后直接生效、不再确认，界面至少要能说出
  它是什么时候来的（**kit D09**）；界面按**逐能力一行**把它显示在对应开关后面（不是两个能力合排一行）；
- `capabilityHowTo(spec, { inPlace? })` / `capabilityDeniedMessage(spec, { inPlace? })` ——
  界面提示与 400 文案（**把通道说清**：哪条变量、要不要重启、`.env` / `env.yml` 不算授权；
  `inPlace: true` 才提「就地确认」，否则用户会去卡片上找一个不存在的入口）；
- `capabilityPaths(dshHomeDir): { dir, grantsFile, confirmDir }` —— kit 的落盘布局，
  **路径只在这里拼一次**；插件不要自己 `join(dshHome(), …)`（两处各拼一遍就是漂的种子）。
  `DSH_KIT_HOME` 能把这一级的目录整份换掉（`resolve` 归一后使用；空串 / 全空白视为没设）：
  **这是测试 / 诊断用的旋钮，不是给用户调的**——能设置宿主环境变量的人本来就能用启动环境变量
  那条通道直接授权，这里只是把「授权落在哪个目录」也变成可注入的。真宿主验收
  （[live-host-smoke.mjs](../../scripts/live-host-smoke.mjs)）靠它给「无授权实例」一份空目录：
  带外授权是持久的，不隔离的话那个实例会继承你机器上的授权，A 段九条断言就全是假红（**kit D12**）；
- `sharedGrantStore(dir)` —— **插件取授权存储的唯一正确方式**：同一个目录在同一进程里只造一个
  实例。为什么不是「各插件自己 `new GrantStore(dir)`」：能力判定是模块级单例（`bindCapabilitySources`
  后绑定覆盖前一次），而 `GrantStore` 是首查读盘 + 进程内缓存——各 `new` 一个等于每个插件拿一份
  快照副本，后授权的插件在别的插件眼里永远「没授权」（真机实测：tty 授权成功后自己的快照仍是
  `false`，界面连撤销按钮都不渲染 → **kit D11**）。也不能改成「多来源取并集」：过期副本会否决撤销；
- `GrantStore` / `createElevationManager({ confirmDir, store, logger, onGrantChange })` ——
  授权存储与就地提权管理器。`onGrantChange` **必填**：授权到达与撤销都要回调宿主重算
  （少了它，症状是「授权成功但工具没注册」或者「撤销了工具还开着」）；
- `auditLoadedGrants(store, capabilities, logger, logPrefix?)` —— **启动期审计**：把盘上已有的
  带外授权逐条打出来（`elevation: load capability=… via=file grantedAt=…`）。不带它，重启后
  「静默继承」的授权在日志里查不到（**kit D09**）。

**已知限制**（经复核确认，刻意不修，别当缺陷重报）：运行期改 / 删授权文件**不生效**（要重启才
读到——删文件当撤销是容易误以为生效的一侧，界面上的「撤销宿主授权」才是正路）；授权记录的 key 是
**裸环境变量名**、不含插件身份（同名 env 的两个插件会共享一条授权）；没有「仅本次运行有效」档位
（TTL / boot 计数），持久生效是刻意的。

```ts
const CAP = { env: 'DSH_DOCKER_ALLOW_MUTATIONS', label: '变更操作' }
apply(ctx) {
  const paths = capabilityPaths(dshHome())
  const store = sharedGrantStore(paths.dir)               // 必须在第一次 capabilityGranted 之前
  bindCapabilitySources(ctx, store)
  auditLoadedGrants(store, [CAP.env], logger, '[dsh-docker]')   // 持久授权的「载入」也要留痕
}
// 有效值 = 配置值 && 授权；HTTP 侧给 true 而无授权直接 400（不能凭空升）
if (patch.allowMutations === true && !capabilityGranted(CAP)) return writeJson(res, 400, { error: capabilityDeniedMessage(CAP, { inPlace: true }) })
```

### !!js 表达式（`js-expr`）

DSH 配置里的 `!!js <expr>` 方言（loader 用同一方言求值）：

- `JsExpr` / `isJsExpr(value)` —— `{ __jsExpr: string }` 节点与判定；
- `JsExprType` / `jsYamlSchema` —— js-yaml 自定义类型与带 !!js 支持的 schema
  （load / dump 无损往返）；
- `evalJsExpr(expr): unknown` —— 等价 `new Function('process', 'return (' + expr + ')')`；
- `dtoValue` / `fromDtoValue` —— 浏览器 DTO 的 `"js:" + expr` 前缀互转。

信任模型：表达式来自用户自己的配置文件，求值等价于用户在自己机器上执行代码
（与 loader / mcp / env 的现状一致）。不要把外部输入送进 `evalJsExpr`。

### 托管区块（`managed-block`）

env.yml / cordis.patch.yml / prompts.yml 共用的「注释标记圈出自动生成内容」模式，
纯函数、参数化标记，供后续迁移与新插件使用：

- `spliceManagedBlock(text, { beginMarker, endMarker, body })` —— 区块整体替换；
  无区块追加到文件末尾（前置空行）；`body: ''` 删除整个区块（含标记）；区块外
  内容逐字节保留，重复写入逐字节稳定；
- `readManagedBlock(text, { beginMarker, endMarker })` —— 返回标记间正文；缺起始
  或结束标记返回 `undefined`（损坏，调用方应报错而不是用半截内容）；
- `writeFileAtomic(file, data, mode = 0o600)` —— 同目录临时文件 + rename 原子写
  （配置 watch 不会读到半截文件），mode 只会被 umask 进一步收紧。

### 审计出口（`./audit` 子路径）

**一条 JSON 行 / 调用，含被拒绝的尝试**——共享环境里唯一能事后回答「谁在什么时候动了什么」的东西。
三个消费者共用同一份实现：`devdata`（数据面）、`devfront`（前端验活）、`devenv`（环境编排）。
2026-10-03 从 `devdata` 上收（第三个消费者出现时上收，是本仓的既定判据）。

```ts
import { createJsonlAuditSink, createLoggerAuditSink, auditLine } from '@hyzyn/dsh-kit/audit'

const sink = auditFile === ''
  ? createLoggerAuditSink(logger, { tag: 'dsh-devdata' })          // 只进日志：**不持久**
  : createJsonlAuditSink(auditFile)                                // 持久：写不进去 = 抛
sink.record({ at: Date.now(), targetId: 'redis-248', action: 'set', allowed: false, code: 'CAPABILITY_NOT_GRANTED' })
```

**两个出口的区别必须说清**（消费者要在自己的配置面里如实标出来）：

- `createJsonlAuditSink`：**持久**。写失败 = **抛**，调用方据此让本次调用**不返回结果**——
  审计记的是「试过什么」，写不进去就不能装作它被记下了；
- `createLoggerAuditSink`：只进宿主日志，**不持久**（日志会被轮转、也未必落盘）。它的意义是
  「没配 `auditFile` 时至少别什么都不记」，路由统一为**允许 → `info`、拒绝 → `warn`**；
  话术归调用方（`render`），因为它常带领域字段（`devfront` 的站点 `subject`）。

**为什么是子路径**：它 `import 'node:fs'`，而客户端半体（`client-src/*.js` → `client.js`）会打包
主入口——进主入口等于把 `node:fs` 带进浏览器那一侧。

**谁该要求「持久」**：各包自己定，但口径一致——**写类动作要求持久审计**（没配就拒，
`AUDIT_NOT_DURABLE`）：`devdata` 的写命令、`devenv` 的 `env_up` / `env_down` 都在这条线上
（后者停的可能是同事正在联调的那一份，事后必须说得清）。只读动作不受影响。

### 项目内只读清单骨架（`./manifest` 子路径）

三包的东西**同一形态**：`verify/<项目>.yaml`（数据面验活断言）、`web/<项目>.yaml`（前端验活断言）、
`ready/<项目>.ready.yaml`（环境就绪清单）——都是「**项目内文本 + DSH 侧只读 + 缺省即无**」。
2026-10-03 把加载骨架从三份几乎逐字相同的实现上收成一份（第三个消费者已到）。

```ts
import { readProjectManifest, manifestRelPath, projectsInFiles } from '@hyzyn/dsh-kit/manifest'

const read = readProjectManifest([join(root, manifestRelPath('verify', project, '.yaml'))])
// read.kind: missing | unreadable | malformed | empty | multiple | parsed
```

**这一层只做「读」，不做「判」**：它不知道什么叫断言、什么叫服务。领域校验（`version`、字段形状、
跨字段约束）留在各包。它只把「读一份清单会遇到的事」逐个分开——因为**下一步动作完全不同**：

| 结果 | 含义 | 下一步 |
|---|---|---|
| `missing` | 文件不存在 | 「这个项目**没有**清单」——**不是**「用默认清单」（缺省即无，fail-closed） |
| `unreadable` | 文件在，读不了 | 去看权限 / 挂载 |
| `malformed` | YAML 语法错 | 去改清单（解析器那句话通常带行列） |
| `empty` | 空文件 | **「空文件」与「没有清单」是两件事**：文件在说明有人打算写 |
| `multiple` | 多个候选都读到了 | 歧义——报出来，**不按顺序静默取胜** |
| `parsed` | 读到了，`data` 原样交回 | 各包自己校验 |

**YAML 用 `JSON_SCHEMA`**：清单是**配置数据**，不是「能求值的表达式」。默认 schema 会放进 `!!js`
一类标签——那等于把「断言」变成「脚本」，评审面完全不同。

**为什么是子路径**：它 `import 'node:fs'`（与 `js-yaml` 同进），不能让这些进客户端半体的 bundle。
`projectsInFiles` / `manifestFileName` / `manifestRelPath` 三个纯函数把「哪个文件名算清单」这件事
收在一处——两处不一致时的症状是「明明有清单却报无要求」，而那正好是「缺省即无」的**假阴性**。

### SSH 执行层（`./ssh-exec` 子路径）与连接簿读取（`tty-books`）

一次性命令的执行通道：**懒连接池 + TOFU 主机指纹 + 超时与输出上限**，本地目标走
`runLocal()`。它与 `tty` 的 PTY 实现是**两份**，刻意不合并——PTY 会话会挂住、没有总超时，
一次性命令有；合并等于让一边的取舍吃进另一边的失败模式。

```ts
import { RemoteExec, sshTarget } from '@hyzyn/dsh-kit/ssh-exec'
import { readTtyBooks, readTtyProxyCommandAllowed } from '@hyzyn/dsh-kit'

const books = readTtyBooks(settingsApi)                       // tty 连接簿 → SshSpec
const exec = new RemoteExec(logger, hostKeyStore, {
  proxyCommandAllowed: () => readTtyProxyCommandAllowed(settingsApi),
  tag: 'dsh-docker',        // 日志前缀：属于调用方（缺省 dsh-kit）
  mismatchHint: '到 … → SSH 主机密钥记录 删除该主机再重连。',   // 处置入口也属于调用方
})
const out = await exec.run(books.get('nas')!, ['docker', 'ps'])
```

**两条边界，都有守卫**（`scripts/test/ssh-single-source.test.ts`）：

- **只许一份实现**。`tty-books` / `ssh-exec` 的实现在 `kit` **一处**；消费者
  （`docker`，以及环境编排 `devenv`）要么直接 import 子路径，要么保留一个**纯再导出**的壳
  （`packages/docker/src/ssh-exec.ts` 就是壳），**不许把实现抄回去**——TOFU 口径 / 通道额度 /
  跳板机语义一旦分叉，症状是「容器面板连得上、环境编排连不上」，而两边各自看着都对；
- **日志前缀与处置文案归调用方**（`tag` / `mismatchHint`）。这一层同时替多个面板干活，
  写死成某一个的名字，另一个的日志就会指错人、错误提示会指到不存在的入口。

**为什么 `./ssh-exec` 是子路径而不是主入口导出**：它 `import { Client } from 'ssh2'`，
进主入口等于让十个不需要 SSH 的插件都多加载一个传输库；而且它与 `scope` 各有一个
`expandHome`，**语义不同**（`scope` 那个只认 `~` / `~/`，`ssh-exec` 那个对 `~user` 抛错），
同名不同义的两个导出不能同在 `export *` 里。`tty-books` 只有纯函数（不依赖 `ssh2`），
所以它在主入口。



### Chrome DevTools Protocol 客户端（`chrome-cdp`）

零依赖的最小 CDP 客户端（Node 22 自带 `fetch` 与全局 `WebSocket`）：起一个 headless
Chrome、连上它的 CDP 端点、发命令、收事件、截图。消费者是**验证类**脚本与工具
（仓根 `scripts/verify-*.mjs`、`packages/docker/scripts/*`、`packages/devfront` 的浏览器驱动）。

```ts
const chrome = await Chrome.launch()
await chrome.attachToPage()
await chrome.send('Page.navigate', { url: 'https://example.com/' })
await chrome.screenshot('/tmp/shot.png')
chrome.close()   // 必须调：忘了会留下 Chrome 进程
```

**`noSandbox` 只在必要时开**：受限环境（容器 / CI / 受限的 macOS 沙箱）里 Chrome 的沙箱
初始化会失败，进程随后带 `SIGTRAP` 退出——表现为「CDP 端点起来了 1 秒就没了」，很难归因。
`Chrome.launch` 会在进程已死时**立刻**失败并给出这条提示（不再等满 20 秒超时），
但**不会自动关沙箱**：

```ts
const chrome = await Chrome.launch({ noSandbox: true })   // 代价是关掉浏览器进程隔离
```


```ts
const markers = { beginMarker: '# --- my-plugin managed ---', endMarker: '# --- end my-plugin managed ---' }
const text = existsSync(file) ? readFileSync(file, 'utf8') : ''
writeFileAtomic(file, spliceManagedBlock(text, { ...markers, body: renderRows(rows) }))
```

## `enabled` 开关约定

kit 生态的插件统一支持 `enabled` 配置（默认 `true`），语义分两层：

- **挂载层**：composition 配置里 `enabled: false` 时 `apply` 直接返回，
  不注册任何服务、路由与设置卡片（卸载级禁用，重启后保持）。
- **运行层**：用户在设置卡片里关掉「启用插件」写的是 settings 命名空间，
  插件保持挂载，但必须**热生效**：
  1. agent 工具全部注销（`refreshTools` 入口按 `enabled` 短路）；
  2. 数据类 HTTP 路由一律 403，仅保留 `GET/POST /config` —— 设置卡片靠它
     渲染，也是重新启用插件的唯一 UI 入口，**不能**一并关掉；
  3. systemPrompt 能力公告按 `enabled && announceToAgent` 重建（撤下 / 恢复）。

设置卡片在禁用后必须仍然可见可保存，否则用户没有 UI 入口重新打开插件；
不要把「禁用」实现成不注册 settings 命名空间。参考实现：
`packages/docker/src/index.ts`（`refreshTools` / 路由守卫 / `refreshAnnouncement`）、
`packages/tty/src/index.ts`（同约定，另有 WS 升级闸门：禁用时断开存量连接并拒绝
新升级，PTY 进程转孤儿保活，重新启用后客户端自动重连 attach）、
`packages/rss/src/index.ts`（开关写 store 文件 `~/.dsh/rss.json` 而非 settings
命名空间：数据路由守卫 + 调度器 tick 短路 + systemPrompt section 撤下/重挂）。

## 设置卡片约定（settings.plugin.item）

kit 插件的设置面板统一注册到宿主 `settings.plugin.item` 插槽（key = 各自的
settings 命名空间），渲染在 设置 → 插件 → 插件配置 列表里。**不另开设置导航
入口**：配置只有一个寻址点；功能面走主界面侧栏入口（与宿主「插件市场」的
导航项 + 列表卡片分层同构）。

### order 取号

卡片排序共用 **90-119 段**，逐个占号；新插件从 106 起顺延，不要复用已占的号
（撞号时渲染顺序未定义）：

| key | 插件 | order |
| --- | --- | --- |
| prompt-manager | Prompt 管理 | 90 |
| profile-manager | Profile 管理 | 92 |
| rss-digest | RSS / 新闻聚合 | 94 |
| mcp-config | MCP 服务器配置 | 96 |
| env-manager | 环境变量 / 密钥管理 | 98 |
| tty | 终端面板 | 100 |
| docker | Docker 容器面板 | 102 |
| codegraph | Codegraph | 104 |

### 套件徽标

每张卡片头部右侧放统一徽标，视觉上承认同族（不靠导航结构）：头部按钮内、
chevron 之前插入 `<span class="dshkit_badge">Kit</span>`，并把共用样式注入本
插件的样式表：

```css
.dshkit_badge{flex:none;margin-left:auto;padding:1px 8px;border-radius:999px;font-size:11px;font-weight:600;line-height:16px;letter-spacing:.02em;color:var(--dsw-alias-label-dimmed);background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1)}
```

tty / docker 分别用 `--tt-*` / `--dk-*` 令牌派生配色（见各自 css 文件里的
`.dshkit_badge` 规则），其余插件直接用上面的 `--dsw-*` 版本。
