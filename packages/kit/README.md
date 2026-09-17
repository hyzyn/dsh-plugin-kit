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
import { dshHome, getService } from '@hyzyn/dsh-kit'

const sessionQuery = getService(ctx, 'sessionQuery')
const patchFile = join(dshHome(), 'cordis.patch.yml')
```

### HTTP 路由辅助（`http`）

宿主半体路由的共用围栏与响应样板，类型是结构化的 `ReqLike` / `ResLike`
（不绑定 node:http 版本，测试可直接传假对象）：

- `isLoopbackRequest(req): boolean` —— loopback-only + 同源围栏：remoteAddress 必须是
  回环地址、Host 必须指向本机（防 DNS rebinding）、`sec-fetch-site: cross-site` 拒绝、
  `Origin`（若有）必须与 Host 同源。9 个插件的重复围栏收敛于此。
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
