# @hyzyn/dsh-devfront

> **私有包，不发布。** `"private": true`。自用的开发/测试环境工具，不是插件市场的条目。
>
> **三包中的第三个**（方案 §16）：`devdata`（数据面 + 验活断言库）、`devenv`（环境编排，
> **已建**：[packages/devenv](../devenv/README.md)）、**本包 = 前端效果验证**。
>
> **判定层、CDP 驱动与宿主工具注册都已就位**：六个 `site_*` 工具能真的打开站点、截图、收 console，
> 并已接进宿主的工具面与审计。**没有面板**（客户端半体尚未建）。

前端发布后的**效果验证**工具，面向 DSH 里的 coding agent。方案见
[docs/devdata-plan.md](../../docs/devdata-plan.md) §15。

## 它解决的那个洞

前端发布走 CIFS 推静态文件，验活一直只到「`CIFS: Transferred N file(s)` 且数量与历史同量级」——
**没有任何技术手段能确认页面真的对**，后半句「再到站点上实际看」是纯人工的。
`jenkins-release` 技能里那 7 个 CIFS job 全靠人点页面。

本仓已有两套 Chrome CDP 驱动的夹具（把 `client.js` 装进假宿主页 → 截图），
**同一套驱动换个目标就是「打开真站点 → 截图 / 收 console」**。本包是这件事的判定层。

## 现在有什么

### 动作白名单（`page.ts`）

```
WEB_ACTIONS = open | shot | click | fill | text | console
```

**这份清单就是边界**（§15.3）：不做定时任务、不做爬虫、不做批量操作。
边界不靠「叫 agent 别那么干」来守——那是一条没有守卫的规矩——而靠**工具面里根本没有那些动作**。

三道判据的顺序是契约：

1. **动作在不在白名单里**（未登记一律拒）；
2. **当前目录在不在目标的 `scopeDirs` 内**——空 = 处处拒绝（fail closed）。
   这条**复用**数据面的 `scope.ts`，前端验活同样会打到共享的测试环境上；
3. **站点范围**：`open` 只能打开目标**声明过的站点**（同源 + 声明路径前缀之内）。

第 3 条是本层特有的：数据面的目标是一个连接串，而这里的目标是一个**站点**——给一个 URL 就能打开，
是最容易被顺手扩成爬虫的入口。所以站点必须在 `WebTarget.url` 里声明。

### console 分类（`console.ts`）

§15.2 说 console 错误是**发布后最常见的前端故障信号**，但直接列出全部 `error` 会把信号淹掉：
真实站点的 console 里常驻噪声（favicon 404、扩展注入、第三方埋点被拦、`ResizeObserver` 告警）。
噪声与故障混在一张表里，结果就是**没人再看这张表**。

三档：`error`（**来自本站资源**的错误）/ `warning`（异源、或来源不明）/ `noise`（命中的已知规则）。

两条刻意的判据：

- **主判据是来源，不是措辞**——业务文案会改，来源不会；
- **来源不明时不判失败**——宁可漏报也不误报，否则一条拿不到来源的错就能让整次验活红掉。

**噪声不丢弃**：报告里保留它并标注为什么算噪声。这条判据本身会被改，全藏掉就查不出来源了。

### 前端验活断言（`web-verify.ts`）

与数据面断言库（§3.9）**同构**：项目内文本清单（`web/<project>.yaml`）+ DSH 侧只读 +
缺省即无（fail-closed）+ 三态（`pass` / `fail` / `unknown`）。

```yaml
version: 1
project: cdqas
assertions:
  - id: order-list
    url: https://cdqas.example.com/order/list
    target: w-cdqas
    expect:
      toContain: 订单编号
      elementExists: '#order-table'
      consoleClean: true
    severity: fail
```

**预期算子刻意与数据面不同**：DOM 上用 `toContain` / `elementExists` / `elementText` / `consoleClean`，
而不是 `eq` / `gte` / `rowCount`——把 `gte` 搬到 DOM 上没有意义，把 `toContain` 搬到结果集上
又要先决定「比第几列」（那是数据面已经解决过的问题）。

### 宿主半体（`plugin.ts`）

Cordis 插件（`{ name, inject, apply }`）+ 六个工具注册：`site_open` / `site_shot` / `site_click` /
`site_fill` / `site_text` / `site_console`。三条注册纪律：

1. **没启用 / 没配站点 → 一个工具都不注册**。未注册的工具 agent 根本看不到，于是不会去试、不会撞墙；
2. **作用域 fail-closed**：`scopeDirs` 为空 = 处处拒绝。插件**不替用户补默认目录**——那等于替他授权；
3. **拒绝带着恢复路径抛出去**（不返回 `{ok:false}` 信封）：DSH 的工具错误本身就是给模型看的一句话，
   而且不会出现「调用方忘了看 ok 字段」这种沉默失败。

审计**含被拒绝的尝试**（那才是「agent 试过什么」的证据）。2026-10-03 起它与 `devdata` / `devenv`
**共用同一份实现**（[`@hyzyn/dsh-kit/audit`](../kit/README.md#审计出口audit-子路径)）：

- **没配 `auditFile`**（缺省）：只进宿主日志——允许 → `info`、拒绝 → `warn`。**不持久**：
  日志会被轮转、也未必落盘；
- **配了 `auditFile`**：一条 JSON 行 / 调用落盘，**含被拒的尝试与判据码**；写不进去时本次调用
  **不返回结果**（fail-closed——审计写不进就不能装作记下了）。

```yaml
- id: devfront
  config:
    auditFile: ~/.dsh/devfront-audit.jsonl   # 不写 = 只进日志
```

与 `devdata` / `devenv` 的差别只有一处：本包的动作面是**站点交互**（点一下、填个值），不改共享
基础设施的状态，所以**没有**「写类动作要求持久审计」那道门——要落盘是配置选择，不是准入条件。

`announceToAgent` 打开时注入一段能力公告（六个动作 + 边界 + console 三档口径）。

### CDP 驱动（`cdp-driver.ts`）

`CdpWebDriver` 实现 `WebDriver`：真的起 headless Chrome、导航、截图、点击 / 填值、取可见文本、收 console。
Chrome 客户端本身在 `@hyzyn/dsh-kit`（`kit` 是**唯一的库**——把它放在本包会让根 `scripts/` 反向依赖一个私有包）。

**三处必须做对的地方**（错了都不报错，只会让验活结论变成假的）：

1. **console 要在导航之前订阅**。`Runtime.consoleAPICalled` / `Log.entryAdded` /
   `Runtime.exceptionThrown` 都是**事件**，页面加载期间产生的在订阅前就发出去了，事后订阅什么都收不到
   ——而首屏那几秒恰恰最要紧。
2. **未捕获的异常是另一个事件**。`setTimeout` 里 `throw`、事件处理器里 `throw`、模块求值失败，
   走 `Runtime.exceptionThrown`，**不走 `consoleAPICalled`**。只订阅 console API 会把「页面抛了未捕获异常」
   整类漏掉——而那正是「页面坏了」最常见的信号，且漏得毫无症状（报告显示「console 干净」）。
3. **`text` 取可见文本**（`document.body.innerText`），不是 `outerHTML`。断言里的 `toContain`
   是给人写的（「订单编号」），拿 HTML 去比会把标签带上，于是「明明页面上有」却匹配不上。

**`noSandbox` 默认关**：受限环境里 Chrome 沙箱初始化失败、进程带 `SIGTRAP` 退出
（表现为「端点起来了 1 秒就没了」）。这时要显式打开；代价是关掉浏览器进程隔离，
而验活会打开内网站点，所以不该是默认值。

## 三条不变量（用例钉住的）

1. **边界靠动作不存在**：动作清单里没有 `batch` / `crawl` / `schedule` 之类，且有用例逐一断言；
2. **未登记 / 越界**一律拒，且**不进入执行路径**（执行器零调用）；
3. **`unknown` 自成一档**：观察结果缺失是「没观测到」，不是「页面上没有」——报成 `fail` 会让 agent 去查站点。

## 用法

```ts
import { adjudicateWebAction, invokeWebAction, type WebDriver } from '@hyzyn/dsh-devfront'

// 判定（纯函数，不连浏览器）
const decision = adjudicateWebAction({ target, action: 'open', cwd, url: 'https://cdqas.example.com/order/list' })

// 调用（驱动注入；真实实现是 CDP，测试里是假实现）
const outcome = await invokeWebAction({ request: { target, action: 'console', cwd }, driver })
```

## 测试

```sh
pnpm vitest run packages/devfront
```

`test/`（112 例）：`page.test.ts` 钉白名单、站点范围与「不进入执行路径」；
`console.test.ts` 钉噪声判据（含「每条噪声规则都要写得出理由」）；
`plugin.test.ts` 钉配置解析（**空作用域必须保留为空**、`noSandbox` 默认关）与能力公告覆盖六个动作；
`web-verify.test.ts` 钉断言的三态与清单校验；
`cdp-driver.test.ts` 纯函数必跑 + **真的起 Chrome 的集成用例**（`it.skipIf` 门控在「本机有 Chrome」
 上，没装就跳过而不是红掉）；`scope-consistency.test.ts` 钉**本包用的是数据面那一份 `scope.ts`**。

## 刻意没有的东西

- **没有 `dsh.bundle.patch`**：一旦带上，`scripts/aggregate.mjs` 会把本包卷进 `@hyzyn/dsh-all`
  聚合包（该脚本**不看 `private`**，已实测）。带上它 = 私有工具被塞进公开发布的聚合包；
- **没有 `build` script**：只有 `check-publishable` 认 `private`，`.gitignore` 与 pre-commit 都不认，
  带 `build` 会每次重建 `lib/` 又被一起 `git add`（`devdata` 记-4 的实测教训）；
- **没有客户端半体**：只有 agent 工具面，没有独立面板；
- **没有工具注册**：六个动作还没注册成宿主工具（判定层与驱动都已就位）。

## 还没做

- **客户端半体（面板 / 设置卡片）**：现在只有 agent 工具面，站点配置走宿主的配置编辑；
  一建 `client-src/` 就会被 `check-i18n` 与 `client-lint` 纳入管辖（那是方案的 P14）；
- **登录会话**：凭据走 `resolveSecret` 口径（§3.7-1），且只对已在 `scopeDirs` 内的目标；
- **与 Jenkins 的关联**（§3.9 约束 4 的口径）：前端验活跑在一次发布之后，结果与 CIFS 传输量并列；
- **就绪/等待**：环境就绪判据在 `@hyzyn/dsh-devenv`（2026-10-02 从 `devdata` 迁出；**刻意不合并**——
  就绪是等待期判据、断言是验证期判据，合并会让「还没渲染完」被报成「验证失败」）。
