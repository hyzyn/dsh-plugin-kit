# @hyzyn/dsh-devfront

> **私有包，不发布。** `"private": true`。自用的开发/测试环境工具，不是插件市场的条目。
>
> **三包中的第三个**（方案 §16）：`devdata`（数据面 + 验活断言库）、`devenv`（环境编排，
> **已建**：[packages/devenv](../devenv/README.md)）、**本包 = 前端效果验证**。
>
> **判定层、CDP 驱动与宿主工具注册都已就位**：七个 `site_*` 工具能真的打开站点、截图、收 console，
> 还能**按项目清单跑一批断言**（`site_verify`）、**按发布清单一次跑多个项目**（`site_verify_release`），
> `site_fill` 还能填**凭据引用**（口令不落明文）；
> **有配置卡片**（客户端半体，2026-10-03）：标量与站点都可改并落盘。**没有独立面板**。

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

**这份清单就是边界**（§15.3）：不做定时任务、不做爬虫、不做批量操作——**唯一的那「一批」**是
`site_verify` 按项目清单跑一批**已声明**的断言（要访问哪些页面由清单逐条写死，不由工具去发现，
见 § 跑批验活）。边界不靠「叫 agent 别那么干」来守——那是一条没有守卫的规矩——而靠**工具面里
根本没有那些动作**。

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

### 跑批验活（`site_verify`，2026-10-04）

把上面那份清单**跑成一份结果**。在那之前，清单只能靠 agent 拿几个动作手工串一遍——那不可积累、
不可复审（这次验过了，下次换个人又从头编一遍，没人说得清「它到底验了什么」）。

```jsonc
// 调用：target = 站点 id，cwd = 项目根（project 缺省取 cwd 的目录名，即 web/<目录名>.yaml）
{ "target": "w-cdqas", "cwd": "/Users/me/work/cdqas" }
```

| 它做什么 | 它不做什么 |
|---|---|
| 只开**清单里逐条声明**的 URL，且每个都过 `site_open` 那道同一套判据（同源 + 声明路径前缀 + 目录作用域） | 不发现 URL：不跟随链接、不按规则猜、不爬 |
| **N 条断言一次取全**：同一个 URL 的多条断言共用一次观察（文本 + 声明的选择器 + console 一起取回） | 不点击、不填值、不做「批量开页面」（集合由清单给定，不是由发现给定） |
| 逐条给「通过 / 失败 / 验不了」与**依据**（期望 vs 实际） | 不替调用方重试；失败时只给复核动作的提示 |
| 页面打不开 / 观察失败 → 那些断言判 `unknown` 并单列进 `problems`（**没验成 ≠ 验出问题**），且**一次越界只砸那一页** | 不把「整批」当原子操作：其余页面照跑 |
| 每次开页进审计（**含被拒的那些**）；跑批自身再留一行（`action: verify`，subject = 项目名） | 不绕过审计，也不因为「这次只是读」就不记 |

清单读不到 / 内容不成立 / 这份清单里没有这个 `target` 的断言——三类**整体性**问题都在**碰浏览器
之前**报出来，并带上「这个目录下现在有哪些清单」的对照（项目名与文件名不一致是最常见的写错方式）。

### 一次发布验多个项目（`site_verify_release`，2026-10-04）

7 个 CIFS job 分属 7 个项目，而 `site_verify` 一次跑**一个**项目（`web/<项目>.yaml`）。
**「这次发布该验哪些项目」不能靠工具发现**——那正是本套件划掉的爬虫 / 批量边界。补法是
**由人写一份发布清单**（口径与三条约束见
[conventions.md § 发布清单](../../docs/conventions.md#发布清单由人给出的这次该验哪些项目)）：

```yaml
# release/2026-10-04-hg.yaml —— 人写；每个面读自己那一列
version: 1
release: 2026-10-04-hg
projects:
  - project: cdqas        # 与三份清单同一个项目名（唯一对齐键）
    root: ../cdqas        # 项目根：清单在它下面（相对本文件所在目录）
    target: cdqas-test    # 本面（devfront）按哪个站点验
  - project: ems
    root: ../ems
    target: ems-test
```

```jsonc
// 调用：一次调用把清单里列的项目全跑完
{ "release": "2026-10-04-hg", "cwd": "/Users/me/releases" }
```

| 它做什么 | 它不做什么 |
|---|---|
| 按发布清单**逐个**项目读**它自己**的 `web/<项目>.yaml` 跑批（判定、依据、一次取全与 `site_verify` 完全相同） | **不发现项目**：不扫目录、不 glob、不跟随链接——项目逐条来自那份清单 |
| 每个项目**各留一行** `action: verify` 审计（subject = 项目名），页级拒绝照旧各自一行 | 不做一个「三面一起跑」的聚合器：每个面读自己那一份清单 |
| **没跑成的项目单列**（没配站点 / 没有清单 / 清单不成立 / 那份清单里没有这个站点的断言），一律算「没验成」 | 不因为一个项目不成立就丢掉其余项目（一次配置问题只砸那一个项目） |
| 整批 `fail` > `warn` > `unknown` > `pass`：某项目失败 → 整批失败；有项目没验成 → 至少 `unknown` | 不把「没跑到」算成通过，也不算成失败 |

### 凭据（`site_fill` 的 `credentialRef`，2026-10-04）

`WebTarget.credentialRef` 从 2026-10-02 起就在配置里、卡片上，但**没有任何消费者**——于是
「登录后才有的页面」只能靠人手：要么把口令贴进对话（进会话记录），要么放弃这一类页面。
现在 `site_fill` 的值有两种给法，**二选一**：

| | 用途 | 值去哪了 |
|---|---|---|
| `value` | 非敏感值（搜索词、编号） | 就在参数里——本来也不是秘密 |
| `credentialRef` | 口令一类 | 参数里只有**引用名**（`env:APP_PWD`）；值由官方凭据服务解析，**不进返回、不进会话记录、不进审计** |

**三条判据**：

1. **只认引用，不认明文**：`credentialRef` 必须是 `env:NAME` 形状。明文一旦进了工具参数，
   它就会同时进会话记录、审计行与日志——那正是引用要防的事；
2. **只认这个目标声明过的那一个**（`WebTarget.credentialRef`）。**agent 能取到的凭据集合 =
   维护者写在 profile 里的那一个**——「能读任意环境变量」与「能读这一个」是两回事，而工具面里
   没有前者。用了别的引用、或目标一个都没声明 → `CREDENTIAL_NOT_DECLARED`；
3. **每次操作重新解析**（官方 provider 的契约，`kit` 也不缓存）：改完凭据下一个动作即生效，
   不必重启宿主。

**保护强度必须一起回**（plan §3.7-1：不许把「方便」说成「防护」）。返回里带 `protection`
（`none` / `weak` / `strong` / `unknown`）与一句话说清它到底防不防：

```
已填值到 #pwd（来自凭据引用 env:APP_PWD；保护强度 none：继承来的环境变量：agent 与用户同 uid，读得到——方便，不是防护）
```

今天 provider 会给的来源层（`env` / `file` / `project-env` / `user-env`）**全是 `none`**——
它与 agent 同 uid，读得到。只有带上游 ACL 的来源（macOS Keychain 一类，`source: keychain`）
才算 `strong`；**没登记过的来源层落在 `unknown`，按「不防护」对待**——不知道就不许说安全。

```yaml
# ~/.dsh/profiles/<profile>/cordis.patch.yml
- id: devfront
  config:
    targets:
      - id: w-cdqas
        url: https://cdqas.example.com/
        scopeDirs: [/Users/me/work/cdqas]
        credentialRef: env:CDQAS_APP_PWD   # 这一行就是「agent 可以用哪一个凭据」
```

凭据本身存在官方凭据存储里（环境变量卡片 / `$DSH_HOME/.credentials.yaml`），**不进 profile**。

> 解析这一跳的实现只有一份，在 `@hyzyn/dsh-kit`（2026-10-04 上收，见根 ROADMAP 第 11 项）；
> 本包只做「来源层 → 保护强度」的翻译与失败话术（`src/credential.ts`）。

### 宿主半体（`plugin.ts`）

Cordis 插件（`{ name, inject, apply }`）+ 八个工具注册：`site_open` / `site_shot` / `site_click` /
`site_fill` / `site_text` / `site_console` / `site_verify` / `site_verify_release`。三条注册纪律：

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

`announceToAgent` 打开时注入一段能力公告（七个动作 + 边界 + console 三档口径）。

### 面板（客户端半体，`client.js`）

2026-10-03 建。它就是记-15 那个缺口的另一半：宿主那套「按 `Config` schema 生成表单」在这一版
**没有渲染方**（真机三面扫过），所以每个插件的卡片都得自己写（tty / docker 同款）——在那之前
devfront 只能在 profile 补丁层手改配置，而工具报出来的「配置问题」用户没有 UI 可改。

- **能改（标量）**：`enabled` / `announceToAgent` / `settleMs` / `noSandbox` / `chromePath` /
  `shotDir` / `auditFile`；
- **能改（站点）**：`targets` —— 结构化表单（每行 id / 名字 / 入口 URL / 作用域 / 允许动手的源 /
  视口 / 凭据引用），可增删改。**改站点要逐次确认**（卡片上那个复选框 → `confirmSiteEdit: true`），
  与 `env_down` 同一档：它决定「工具能在哪些站点、哪些范围、哪些源上动手」。
- **站点这个表单凭什么评审**（四条一起才成立）：① 结构化表单（不是 YAML 自由文本）；② 服务端
  **同一套判据**（`normalizeTargets` 严格校验、**不静默丢行**，并要求 `normalizeConfig` 把校验过的行
  一行不少地收下——两套规则分叉时保存就报错）；③ **逐次确认**；④ **每次变更进审计**（含被拒的尝试）。
  更彻底的那条路——站点声明**随项目走**（像 `verify/` / `ready/` 那样进项目仓库评审）——也已落地
  （2026-10-03，见下面 § 站点声明随项目走）；
- **数据面**：宿主那条 `GET/POST /api/dsh-devfront/config`。POST 走**官方持久化通道**
  `settings.update(entryId, patch)`（写 volatile 字段 → loader 广播 → 本插件 `applySection` 热应用，
  不重启）；宿主没有 settings 服务时退化成「只在本进程生效」，响应里如实带 `persisted: false`，
  卡片也照实提示「**没有落盘**」；
- **围栏**：只放回环 + 强来源判据（`isLoopbackRequestStrict`，与 tty / docker 的 `gateRoute` 同一套）。
  `POST /config` **刻意不额外要求同源证明**——卡片是插件被停用后唯一的恢复入口（与 tty / docker 的
  `/config` 同口径）；
- **校验在写之前**（`normalizeCardPatch`，纯函数、有用例）：不认识的字段**报错而不是静默丢弃**，
  `targets` 直接指到 profile 补丁层，类型/范围先判——非法值不许先落地再抛（docker 踩过：非法值写进
  `settings.yaml` 之后整段配置在下次启动静默退回默认）；
- **界面文案走 i18n 目录**（`docs/i18n.md`）：`client.js` 是**源**（本包没有构建步骤），目录内联在
  文件里，`check-i18n` 与 `client-lint` 都管着它。

**真机验收**（`pnpm --filter @hyzyn/dsh-devfront run verify` → `scripts/verify-devfront-card.mjs`）：
起一个**隔离 home 里的一次性 profile**、装本包、起真宿主、开真 Chrome，跑一遍断言
（**条数以脚本末尾那行汇总为准**——它会随功能增长，不在这里写死）：数据面
（快照字段 / 保存落盘且**站点不被抹掉** / `targets` 与未知字段被拒 / 405 / 改站点必须带
`confirmSiteEdit` 且变更进审计）+ bundle 真的被宿主按批量
URL 加载 + 插件页里那一行 + **详情页卡片渲染**（控件数与两个站点的只读信息）+ **站点编辑器的客户端路径**
（DOM 上加一行、填 7 个字段、勾确认框、点保存，再用 HTTP 复核那份 payload 真的生效）
+ 真实 `~/.dsh` 逐字节未变的自证。`--dump` 只打插件页结构（迭代 DOM 断言用），`--keep` 失败时留现场。

> **这张卡片真机验过**（2026-10-03 首验，当天现算 15 条 / 0 条失败）。第一次验收抓到两条、第二次抓到第三条**只有真机才会暴露**
> 的问题：缺 `exports["./client"]` → bundle 404、卡片永不渲染；保存标量把 `targets` 清空；详情页
> 要求注册 `plugins.bundle.config`（只注册行槽时详情页是空的）。三条都已修，并各有一条断言钉住。

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

**`observe` 是「一次取全」的那一次往返**（2026-10-04）：文本 + 若干选择器 + console 由一个
`Runtime.evaluate` 一起取回。两处刻意的实现选择：**一个坏选择器不许把整次观察带下去**（它只在结果里
带 `error`，求值层据此把**用它**的那几条断言判 `unknown`，同页其它断言照常有结论）；
**取不到结果就抛**（页面正在导航时抛错，把这一页判成「观察失败」，而不是拿半截观察去下结论）。

**`noSandbox` 默认关**：受限环境里 Chrome 沙箱初始化失败、进程带 `SIGTRAP` 退出
（表现为「端点起来了 1 秒就没了」）。这时要显式打开；代价是关掉浏览器进程隔离，
而验活会打开内网站点，所以不该是默认值。

## 三条不变量（用例钉住的）

1. **边界靠动作不存在**：动作清单里没有 `batch` / `crawl` / `schedule` 之类，且有用例逐一断言。
   `site_verify` 是那条边界上**唯一**的一批：要访问哪些页面由项目清单**逐条写死**，不由工具发现；
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

`test/`（条数不写在这里——它会随功能增长）：`page.test.ts` 钉白名单、站点范围与「不进入执行路径」；
`console.test.ts` 钉噪声判据（含「每条噪声规则都要写得出理由」）；
`plugin.test.ts` 钉配置解析（**空作用域必须保留为空**、`noSandbox` 默认关）与能力公告覆盖每个动作；
`web-verify.test.ts` 钉断言的三态、清单校验与「坏选择器是 `unknown` 不是「元素不存在」」；
`web-run.test.ts` 钉跑批执行器（**同一个 URL 只观察一次**、一次拒绝只砸一页、审计三类行）；
`tools.test.ts` 用假宿主钉「按 `cwd` 读清单 → 选目标 → 清单问题在碰浏览器之前报出来」；
`tool-contract.test.ts` 把**声明的**输出契约与实际产出对起来（含 `site_verify` 那份）；
`tool-smoke.test.ts` **把八个工具真的跑一遍**（真 Chrome，含 `site_verify` 与 `site_verify_release`
两条端到端）；`release.test.ts` / `release-run.test.ts` 钉发布清单的加载校验与跨项目跑批（后者依赖全注入，
不连浏览器）；
`cdp-driver.test.ts` 纯函数必跑 + **真的起 Chrome 的集成用例**（`it.skipIf` 门控在「本机有 Chrome」
 上，没装就跳过而不是红掉）；`scope-consistency.test.ts` 钉**本包用的是数据面那一份 `scope.ts`**。

## 刻意没有的东西

> ⚠️ **2026-10-03 更正（原文照旧留在 git 历史里）**：本节原来还写着「没有客户端半体」「没有工具注册」
> ——两条**都已落地**：`site_*` 工具早进了宿主工具面（记-3），配置卡片也建了（记-21）。

> ⚠️ **2026-10-04 更正**：本节还写着「没有 `dsh.bundle.patch`」「没有 `build` script」「卡片里不能改
> 站点」——三条**都已过时**：三包入库那次（`b32324c4`）同时给本包加了 bundle patch 与 `build`，
> 而卡片现在能增删改站点（记-24）。原判断的理由（聚合脚本不认 `private`、pre-commit 会 `git add lib/`）
> 在当时成立，**判据变了就该作废**：`aggregate.mjs` 现在跳过 `private`（N1 已落地）。

- **没有「面板式」UI**：客户端半体只有一张**设置卡片**（见 § 面板），没有侧边栏面板 / 独立窗口 ——
  本包的动作面是「跑一次验活」，不是盯着看的控制台。

## 站点声明随项目走（`web/sites.yaml`）

卡片能改的是 **profile 里**的站点（宿主侧配置）。想让站点声明**随项目走**——进项目仓库、随代码
评审——就把它写进项目里的 `web/sites.yaml`，并在 profile 里打开那条开关：

```yaml
# ~/.dsh/profiles/<profile>/cordis.patch.yml
- id: devfront
  config:
    # 站点声明随项目走：每次调用按 cwd 找这个相对路径（推荐 web/sites.yaml）
    projectSitesFile: web/sites.yaml
```

项目里的清单（与就绪清单 `ready/`、验活断言 `web/<项目>.yaml` 同一形态）：

```yaml
version: 1
sites:
  - id: app
    label: 应用
    url: https://app.test/
    scopeDirs: [/Users/me/work/app]
    allowedOrigins: [https://sso.test]
    viewport: 390x844
```

判据：

- **默认关闭**：`projectSitesFile` 为空 = 只认 profile 的站点。这条开关必须由**维护者在宿主侧**打开，
  因为站点清单**能凭空多出一个「工具可以在它上面动手」的站点**——这一点与 `devdata` / `devenv` 的
  项目清单**不对称**（那两包声明的是「怎么访问那个目标」，目标本身已在 profile 里声明过）；
- **并集**：profile 的站点 + 项目清单的站点；**同一个 id 出现在两处 = 配置问题，报出来**（不静默取
  一个——两份声明可能给出不同的 url / 范围 / 允许源，静默取一个的后果是「工具按哪份在动手」说不清）；
- **四态分明**：本目录没有这份文件 = 安静地用 profile；文件在但读不了 / YAML 语法错 / 空文件 / 内容
  不成立 = **报错并指出原因**（空文件与「没有声明」是两件事）；
- 行的校验用的是**卡片保存那一套**（`normalizeTargets`）——两套规则必然漂；
- 项目清单里的站点**不在卡片里改**（它归项目仓库管）；卡片改的始终是 profile 那份。

> 共用件：读盘走 `@hyzyn/dsh-kit/manifest`（三包同一份骨架，2026-10-03 上收）。

## 还没做

- **一次登录会话的编排**（凭据那一半已通，见上）：今天要验「登录后才有的页面」，得自己
  按 `site_open` → `site_fill`（可用 `credentialRef`）→ `site_click` → 再验 的顺序走一遍；
  驱动在进程里保持着这个浏览器与页面，所以**登录状态在后续调用里是活的**，但没有一个
  「按声明的登录步骤自动走一遍」的动作——那需要先定「登录页/选择器/提交按钮」的声明形态，
  而那等于把一个站点专属的流程写进配置（要不要做，先看真机用几次之后的手感）；
- **真正有防护的凭据来源**：今天 `credentialRef` 能指到的来源层全是 `none`（见 § 凭据）；
  macOS Keychain 一类带上游 ACL 的 provider 一出现，保护强度那一列就会变成 `strong`——本包
  不用改代码（`source` 已经是数据），但**报告里的那句话会跟着变**；
- ~~**一次调用跨多个项目**~~ —— **已落地（2026-10-04）**：`site_verify_release` 按**人写的**发布清单
  （`release/<发布名>.yaml`）一次跑多个项目，见上一节与 ROADMAP 记-31。**刻意不自动发现**
  「这次发布该验哪些项目」——那正是 §15.3 要防的发现逻辑；发布清单是这条边界上唯一被允许的补法。
  **7 个 job 仍然要人来列**：`jenkins-release` 的 job → 项目映射是那份清单的**输入**，不是它的替身；
- **与 Jenkins 的关联**（§3.9 约束 4 的口径）：前端验活跑在一次发布之后，结果与 CIFS 传输量并列；
- **就绪/等待**：环境就绪判据在 `@hyzyn/dsh-devenv`（2026-10-02 从 `devdata` 迁出；**刻意不合并**——
  就绪是等待期判据、断言是验证期判据，合并会让「还没渲染完」被报成「验证失败」）。
