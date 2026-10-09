# 能力开关的「OS 级同意」通道实施方案

> 执行对象：AI 代理。本文自包含，按 PR 顺序执行；每节末尾有可勾选验收项。
> **状态**：**方案已定，代码未动（2026-10-07）**。§0 的威胁模型与 §1 的不变量是动手前必须先读的；
> §2 给出现算事实与**一条决定成败的实现约束**。
> **实测基准**：本文 §2.1 的三条事实全部是照着 **DSH `0.2.1-alpha.2`** 现算的
> （2026-10-07 首测于 `0.2.1-alpha.1`，2026-10-09 随宿主升级逐条复核，见 §2.1 末「升级复核」）。
> 宿主是外部依赖，**它升级后这三条都可能变**——所以基准版本必须留在这里，
> 且 `scripts/test/os-consent-scope.test.ts` 会拿它当升级绊线（版本对不上就报错，逼人回来复核）。
> **引用宿主的写法**（2026-10-07 review C2 定的）：只写 **包名 + 符号名**
> （如「`dsh-user-approval` 的 `ApprovalService.request()`」），**不写行号**。
> 理由是 [conventions.md § 编号规范 硬规矩 4](./conventions.md#编号规范) 的同一条道理在本仓
> 早已成立（「索引表不写行号——修复后代码可能移位」），而**对外部依赖成立得更彻底**：
> 宿主的行号会随它自己的每个补丁漂，而这里没有任何守卫能发现（守卫只钉形态、不钉行号）。
> 需要定位实现时，按符号名 grep——那比一个会过期的行号可靠。
> **编号纪律**：本方案**不预设任何 `Dxx`**；实施中挖出的缺陷按各包台账序列接在当时的最大号之后，
> 编号增改属 [AI 协作边界](./conventions.md#ai-协作边界什么改动要先问) 的「先问」项。
>
> **一句话**：`capability-elevation-plan.md` §9 把「OS 级同意」（宿主弹原生对话框）列为
> 「『一键开 **且** 挡页内脚本』的唯一正解，值得单独立项」。本文就是那次立项。
> **结论**：§9 **是对的**——原生对话框确实能同时做到「一键开」与「挡住页内脚本」，
> **但只在一个形态下成立**：对话框由**宿主进程自己 spawn**、用户的选择由**子进程的退出码 / stdout**
> 读回（宿主自带的 directory-picker 就是这个形态：`dsh-host-directory-picker-native` 的 `pickNativeDirectory`
> 把答案从 `.stdout` 与 `code === 1` 读出来，**不经过页面**）。
> **诱人的那个替代形态**——把对话框接到宿主现成的 `approval/request` 瀑布上——**会静默丢掉这条防护**
> （那个 waterfall 的答案今天由**页面**回答，见 §2.1 事实 1）。所以本文真正的产出不是「要不要做」，
> 而是**这条不许走错的实现约束**。

## 0. 动机与威胁模型

### 0.1 这一项要补的是哪个洞

`capability-elevation-plan.md` §0 的对手表（**沿用它的编号，别另起一套**）：

| 对手 | 能力 | 现状（两条通道：启动环境 / 就地提权） |
|---|---|---|
| (a) 跨站页面 | 能发回环请求；浏览器不给它读响应 | **拦**（回环围栏 + 同源证明） |
| (b) 页内脚本（第三方插件 `client.js` / XSS） | 同源：能读响应、能发任意请求、**能碰页面 DOM** | **拦**（靠「写不了宿主文件」，见 §0.2） |
| (c) 本机同用户进程 | 能读自己发的响应、能读写本机文件、能读 tty、能自己 spawn `osascript` | **不拦（明确出模型）** |
| (d) 被误导 / 被注入的 agent | 模型判断被污染，亲手调高危工具 | 归 tier gate（另一层，见 permission-tier-plan） |

**本项只针对 (b)。** (c) 不是本项目标（§0.3 说明为什么这条边界不该被这次改动悄悄挪动）。

### 0.2 现状已经挡得住 (b)——本项买的是 UX 不是安全等级

- **启动环境通道**与 (b) 无关（(b) 改不了宿主进程的环境变量）。
- **就地提权**（`elevation.ts`）挡 (b) 靠的是「**写不了宿主文件**」：`begin` 只发布 nonce，
  真正的凭据是「有人在宿主文件系统上把那个随机名文件落下来」，而页内脚本没有文件系统。
  这条**今天成立**（`grant-store.ts` 的 0600 + 目录 0700 是它的物质基础）。
- §9 想解决的是**那个过程的麻烦**：今天用户必须去宿主终端**粘贴一条命令**（`commandFor()`
  生成的那条 `touch '<path>'`）。OS 级同意把这个动作换成「点一下框」。

**所以本项的准确表述是**：它在**不牺牲 (b)** 的前提下，把「去终端粘贴」换成「点一下」。
**它不提高对 (b) 的防护等级**——(b) 今天已经被挡住了。

### 0.3 边界纪律：这次改动**不许**把 (c) 挪进模型内

`elevation.ts` 文件头与 `capability.ts` 都已写明 (c) 出模型，且理由是**结构性的**（它本来
就能直接跑 `docker`、读 `~/.dsh/.credentials.yaml`）。原生对话框对 (c) 至多是**「没那么顺手」
的速度楔子**——它能自己 spawn 一个同名对话框、能合成点击、也能直接写那个 grant 文件。
**文案只许**说「同用户进程需要一次人眼确认」，**不许**说「同用户进程被拦住了」。

## 1. 不变量（任何 PR 不得破坏）

1. **答案只许从子进程读回**（本项的核心）。用户的选择必须由**宿主**从被 spawn 的子进程
   （退出码 / stdout / 一个宿主自读的带外落点）取得，**绝不经过页面、绝不经过 `approval/request`
   瀑布**。理由见 §2.2：任何「页面回答」的形态都会把 (b) 的防护当场丢掉。
2. **不许削弱现有的 (b) 防护**。落地后必须仍满足「页内脚本无法自己获得授权」：
   `elevation.ts` 不变量 1（凭据 = 宿主文件系统上落地一个随机名文件）**保持不变**；
   对话框只是**替你**写那个文件，不新增凭据形式（附录 A 说明为什么不加 `CapabilityGrantVia` 枚举值）。
3. **凭据绝不进 argv / 日志**。对话框的参数会出现在进程 argv 里，而 argv 在宿主 `ps` 下对
   同用户可见——与「日志落盘」同级。所以对话框**只许**携带能力名与人读的说明，
   **绝不携带 nonce / 路径 / 任何凭据**。
4. **降权零门槛**（沿 elevation 不变量 5）：撤销永远不要求确认。
5. **三种结局都要有明确语义**：`确认` / `取消` / `超时或弹不出`——**后者 fail-closed（不授权）**。
6. **无人值守环境不许 brick**。宿主可能跑在没有显示器的机器上（systemd / CI / 远程 SSH）。
   弹不出框时**必须**退回「就地提权那条命令」的既有路径，而不是报错或挂住。
7. **不许引入平台专属的必装依赖**。macOS `osascript` 系统自带；Linux 的 `zenity` / `kdialog`
   **不一定装了**（宿主自己的 picker 就为此写了「两个都试、都没有就报错」：
   `dsh-host-directory-picker-native` 的「两个都试、都没有就报错」）。缺工具 = 走不变量 6 的降级路径。
8. **审计**：决定落一行（沿 elevation 的 `grant` / `revoke` 审计行，出口 `console.log`，kit D14），
   **不含凭据**（不变量 3）。

## 2. 现算事实与那条实现约束

### 2.1 三条实测事实（DSH `0.2.1-alpha.2`，2026-10-07 首测 · 10-09 复核）

**事实 1：审批瀑布的答案今天由「页面」给出。**

宿主的 approval 服务把请求派发到一条 agent 作用域的 waterfall：

```
dsh-user-approval · ApprovalService.request()
ctx.waterfall(scopeTarget(req.agent, req.agent), 'approval/request', req, () => Promise.resolve('unavailable'))
```

它有两个 answerer（**这条瀑布不是一个，别写成「唯一」**）：宿主侧的 ACP
（`dsh-acp` 的 `ctx.on('approval/request', …)`，但它在
`record === undefined || request.callId === undefined` 时立刻 `next()` 让位——它只认自己
拥有的 ACP 会话的**工具调用**），以及**浏览器侧的审批面板**：

```
dsh-client-ui-approval · client.js
ctx.remote.$on('approval/request', function(request, next) { return answerApproval(...) })
```

**对本方案要紧的是**：在 Web 会话里，实际拍板的是**页面**那个 answerer（ACP 那条对普通
Web 会话直接让位——§2.2 形态 A 的否决理由正是建立在这一点上，见下面 §2.2 的同一条引用）。
所以下文的「答案走页面」是指**有效路径**，不是「全宿主只有这一个 answerer」。

答案经 HTTP RPC 回到宿主：`dsh-api-gateway` 的 `$events/result` 端点
`rpc.call("/api", "$events/result", { args: result })`（端点名见同文件 `:110`）。
`approval/request` 在 forwarded-Remote 白名单里（`dsh-api-remotes` 的 `API_REMOTE_FORWARDED_EVENTS`
`{ event: 'approval/request', mode: 'waterfall' }`），所以它是**合法的 `ctx.remote.$on` 键**。

**事实 2：第三方插件的 client 半体与宿主 UI 在同一个 JS realm，没有 iframe / 沙箱、也没有 CSP 拦。**

```
`dsh-client-modules` 的 `defaultLoadBundle`
/** Default bundle-load hook: same-origin external classic script. */
const defaultLoadBundle = (url) => { … el.src = url; document.head.append(el) }
```

插件 bundle 是**同源 classic script**（`window.__ModuleLoader__.load({id, factory})` 注册），
不是 iframe / `srcdoc` / worker（`dsh-client-*/lib` 下 `iframe|srcdoc` 零命中）。
动态装入的半体更进一步：`new Function(...)` 后注册进 `globalThis.__ModuleLoader__`
（`dsh-cordis-client-runner` 的 `new Function(...)` 与 `globalThis.__ModuleLoader__.load`），该文件自己写明
「This is API discipline, not a security boundary」。

**「页内脚本够得着官方面板」这条论证有两条腿，缺一条都不完整**（2026-10-07 review 指出此处
原先只写了第一条）：

1. **同 realm**（上面那段）：脚本与官方面板共享 `window` / `document` / `ctx`；
2. **宿主不发 CSP**：实测 `dsh-web-frontend/dist/index.html` **0** 处 `Content-Security-Policy`，
   `dsh-host-webserver` 与 `dsh-host-frontend-static` 也**都不发**该响应头
   （唯一设它的地方是 `dsh-api-session-controller` 的 `/api/file` 响应，作用域仅
   `/api/file` 的媒体响应，与页面无关）。

第二条腿的意义要说准：**今天它让「够得着」更容易，但即便宿主加了 CSP，这条结论仍然成立**——
CSP 管不了**同源**脚本。所以它不是「因为没 CSP 才成立」，而是「连 CSP 这层都没有」。
`scripts/test/os-consent-scope.test.ts` 把两条腿都钉住：一旦宿主开始发 CSP，
守卫会提醒回来复核（那说明宿主在往隔离方向走）。

⇒ 官方面板 `div[data-approval-key]` 与插件脚本共享 `window`/`document`。

**事实 3：宿主确实有原生对话框的**能力**，且它的答案是宿主自读的。**

```
`dsh-host-directory-picker-native` 的 `pickNativeDirectory`
darwin: osascript -e 'choose folder with prompt "…"'   → 读 .stdout
linux:  zenity --file-selection --directory            → 读 .stdout；kdialog 兜底
win32:  IFileOpenDialog（spawned worker + koffi COM，worker.cjs）
```

它是**能力证明**：技术上弹得出原生框，且**答案是子进程的 stdout / 退出码**（`:239/251/263` 的
`.stdout`，`:241` 用 `errorCode === 1` 判取消）——**整条通路在宿主侧，页面够不着**。

**升级复核（2026-10-09，宿主 `0.2.1-alpha.1` → `0.2.1-alpha.2`）**：三条事实逐条重跑，都还成立——
① 审批瀑布仍是 `dsh-user-approval` 的 `ctx.waterfall(…, "approval/request", req, () => Promise.resolve("unavailable"))`，
浏览器侧的 answerer 仍是 `dsh-client-ui-approval` 的 `.$on("approval/request", …)` → `answerApproval(…)`
（面板节点 `data-approval-key` 也还在）；② `dsh-client-modules` 的 `defaultLoadBundle` 仍是同源 classic
script，`dsh-web-frontend/dist/index.html` 与 `dsh-host-webserver` / `dsh-host-frontend-static` 仍是
**0** 处 CSP（唯一那条仍在 `dsh-api-session-controller` 的 `/api/file` 响应上）；
③ `dsh-host-directory-picker-native` 仍是 `osascript` / `zenity` / `kdialog` + 子进程 `.stdout`，
取消仍按 `errorCode(error) === 1`（或 `-128`）判。载体包的逐字节比对：`dsh-user-approval` /
`dsh-client-ui-approval` / `dsh-client-modules` / `dsh-host-directory-picker-native` / `dsh-api-gateway` /
`dsh-host-frontend-static` **除 `package.json` 外无变化**；变了的是 `dsh-acp`（0 行 approval 相关改动）、
`dsh-api-remotes` 的 `client.js`（只有行号字符串位移）、`dsh-web-frontend` 的 dist 产物（重建，`index.html`
仍无 CSP）与 `dsh-cordis-client-runner` 的 `client.js`（`new Function(…)` 与 `__ModuleLoader__.load` 仍在）。
同一轮里 `scripts/test/os-consent-scope.test.ts` 的 18 条结构断言全绿，红的只有「基准版本对不上」
这条绊线——本节基准随之更新到 `0.2.1-alpha.2`。

### 2.2 把事实合起来：两个形态，只有一个成立

**形态 A（诱人，但会丢掉 (b) 防护）：把对话框接到 `approval/request` 瀑布上。**

两个独立的理由否掉它：

- **形状不对**。`ApprovalRequest` 是 `{agent, toolName, callId?, reason?, displayReason?, signal?}`
  （`dsh-user-approval` 的 `ApprovalRequest` 类型），`request()` 还要求**有打开的回合**
  （`lib/index.js:130` `if (!hasOpenTurn(session)) throw new Error('approval.request() outside an open turn…')`）。
  它天然回答的是**「某个 agent 的某次工具调用」**，不是「页面上这次提权点击」。
  拿它回答提权，等于把会话级的追问塞进一条只在 agent 上下文成立的通道，还会与 tier gate 和
  ACP（`dsh-acp` 也在这条瀑布上）争抢同一个请求。
- **更要紧的是**：即便硬塞进去，**答案仍走页面**（事实 1）。任何与宿主 UI 同 realm 的脚本
  都能 `ctx.remote.$on('approval/request', …)` **先于**官方面板回答，或直接读转发帧、
  用自己已观察到的 `clientId` 向 `$events/result` POST 一个伪结果。
  ⇒ **形态 A 的「同意」是可被页内脚本伪造的**，它在安全上等于没有。

**形态 B（成立）：宿主自己 spawn 对话框，答案从子进程读回（= 事实 3 那个形态）。**

页内脚本**无法**让宿主进程去 spawn 一个对话框，也读不到那个子进程的 stdout；
它与「就地提权要用户手动 `touch`」在 (b) 上**强度相同**（两条都是「页面碰不到宿主文件系统」），
而操作步骤从「去终端粘贴」降到「点一下」。**这就是 §9 想要的那个东西，且它是成立的。**

### 2.3 结论

- **§9 的判断成立**（「一键开 且 挡 (b)」的正解）——**前提是做成形态 B**。这一点要写进原文，
  并把这**条实现约束**一起指过去（§5 PR1）。
- **真正要防的失败模式是形态 A**：它看起来最自然（宿主已有 approval 服务、已有 UI 面板），
  做起来也最省事，但会把 (b) 的防护**静默**换掉——**没有任何测试会红**，
  而文案却会写着「现在有 OS 级同意了」。这正是 `capability-elevation-plan.md` 附录 B/v1
  那次错误的**同一形状**（宣称了一个不成立的安全性质）。§3 的守卫就是钉这个的。
- **一句必须说清的定位**：(b) 今天**已经被挡住**（§0.2）。本项是**把提问变得更方便**，
  不是「补上一个漏掉的防护」。任何把它说成「补上了页内脚本的洞」的文案都是错的。

## 3. 验收判据

- [ ] **形态 B 的硬约束有守卫**：断言对话框答案的读取路径**不经过** `approval/request` /
      `$events/result` / 页面；**判别性**：把答案改成经一个 HTTP 回调返回 → 红；
- [ ] **对话框 argv 不含凭据**：单测断言传给 `osascript` / `zenity` 的 argv 只有能力名与文案
      （不变量 3）；**判别性**：往 argv 里塞一个 nonce → 红；
- [ ] **三种结局各有用例**：`确认` / `取消` / `超时或弹不出`（后者**不授权**，不变量 5）；
- [ ] **无显示器 / 缺 zenity·kdialog / osascript 抛错** 走既有就地提权命令的降级路径，
      不报错、不挂住（不变量 6、7）；
- [ ] **审计行落 `console.log` 且不含凭据**（不变量 8）；
- [ ] **§2.1 三条事实各有守卫**：宿主仍是页面 remote answerer、插件 client 仍是同源 script、
      **宿主仍不发 CSP**、原生框仍只在 directory-picker 接缝。任一处变化 → 红，逼人重读本文
      （本文结论依赖它们；与 `scripts/test/exec-terminal-scope.test.ts` 同款：真实文本现算 + 反例）。
      **已落地（2026-10-07，PR3 完成）**：`scripts/test/os-consent-scope.test.ts`——
      判据抽成纯函数、真实世界与反例**共用同一条代码路径**；宿主缺失时整块 `skipped`（响亮），
      宿主在而文件缺失则**判红**；另有「基准版本对得上」的升级绊线；
      **2026-10-09 宿主升到 `0.2.1-alpha.2` 时它按设计红过一次**（基准版本 + picker 判据两处口径），
      三条事实与那份 resolver 逐条复核后已收敛，复核记录见 §2.1 末与 §4 第 2 条；
- [ ] **真机（macOS）**：点一次框 → 授权生效、审计行出现；**并且**用 CDP 在页面里跑
      `ctx.remote.$on('approval/request', …)` 抢答 —— 在形态 B 下**应当抢不到任何东西**
      （提权根本不走那条瀑布）。这一条是形态 B 与形态 A 的**判别实验**。

## 4. 落地形态（PR4 的详细设计）

1. **复用现有机制，不新增通道**。对话框写的就是那个随机名文件（`commandFor()` 今天生成给用户
   粘贴的那条 `touch '<path>'`，改成宿主自己执行）。于是 `elevation.ts` 的探测循环、TTL、
   限流、`grant-store` 的 0600 **全部原样复用**。
2. **「宿主坐在屏幕前吗」**这点**不许另写一份判据**（2026-10-07 review C1）。宿主**已经有**
   这套 resolver，而且是**可以复用**的：

   ```
   dsh-host-directory-picker-auto · resolveDirectoryPickerBackend(facts)
   // 它的判据（五条，全是必需的——缺一条就得回落 browse）
   // 2026-10-09 按 `0.2.1-alpha.2` 的实际口径逐条复核（上一版基准是三条，见下面第 2 条）：
   //   ① allowsRemoteAuthorities             → browse（Connection 信任策略放行了远端 authority，
   //                                           那会招来远程浏览器，而 OS 框它够不着）
   //   ② !isLoopbackHost(bindHost)           → browse（具体网卡地址与「全网卡绑定」同样够不着）
   //   ③ launchedThroughSsh(launchEnvironment) → browse（SSH 端口转发下，框会开在**无人值守的那台**上）
   //   ④ platform 是 darwin / win32          → native
   //   ⑤ platform 是 linux 且 PATH 里有可用 chooser（zenity / kdialog）
   //                                          且 DISPLAY 或 WAYLAND_DISPLAY 非空 → native
   ```

   原先这里只写了「判据与宿主 picker 同级」——**同级 ≠ 复用**，那句话会引导 PR4 另写一份
   `DISPLAY`/`SSH_*` 判断，于是仓里就出现**第二处「宿主坐在屏幕前吗」的真相源**，
   而两边迟早会漂（这正是本仓最忌讳的重复）。正确做法是**复用 `resolveDirectoryPickerBackend`**：

   - 它**已被该包 `export`**（不是私有函数），可直接 import；
   - 它吃的 `facts` 全是**调用方采样**的（`ctx.webServer.host` / `process.platform` /
     `process.env` / `PATH` 探测），**不需要**该包内部状态。**但 `0.2.1-alpha.2` 起要多采两条**
     （这一档宿主换了口径，绊线当轮报过红）：`allowsRemoteAuthorities` 取自 Connection 信任策略
     （`ctx.connection` 上已有的字段），`bindHost` 的环回判定要用**同一个** `isLoopbackHost()`
     （`dsh-host-webserver` 的导出）——各写各的，两边口径迟早又漂成两份真相源。采不到就
     **落 `browse`**（不弹框、走粘贴路径），与不变量 6 的 fail-closed 同向。
   - ③ 用到的 `launchedThroughSsh` 只是读 `SSH_CONNECTION` / `SSH_TTY` 两个环境变量
     （`dsh-launch-environment` 的实现），而 **kit 已经有读启动快照的通道**
     （`capability.ts` 的 `resolveEnvSource` 就是结构读 `launchEnvironment` 槽位）——
     所以 kit 侧**不必新增对宿主包的依赖**也能采到同一个事实。
   - **若该包不在**（老宿主 / 没装它）：退回「找不到判据 ⇒ 不弹框，走粘贴路径」，
     与不变量 6 的 fail-closed 方向一致——**不**自己现编一套。

3. **平台**：macOS `osascript -e 'display dialog …'`（取消 = 退出码 1 / `-128`）、
   Linux `zenity --question` / `kdialog --yesno`。**Windows 不实现**：宿主自己的 native picker
   在 win32 上要 spawn 一个 koffi COM worker + 合成 Alt 按键（`lib/worker.cjs`），
   那个复杂度不该由本特性承担；win32 继续走粘贴路径。**文档要写明这条，不做三平台空头承诺。**
4. **超时**：明确一个超时（如 60s），到点当**取消**，并清掉那个随机名文件。
5. **配置**：一个开关（默认**开**——它只减操作、不减安全），关掉回到粘贴路径。
   开关**本身不需要**能力授权（它不放开任何能力，只改变提问方式）。

**为什么值得做**：今天用户必须开终端面板、粘贴、等探测周期——三个动作，每一步都可能被误解成
「开关坏了」。这是 `ROADMAP` 里真实记过的 UX 痛点（两次授权要粘贴两次那条）。

## 5. PR 顺序

| PR | 内容 | 落点 |
|---|---|---|
| PR1 | **给 §9 补上实现约束**（不改代码）：§9 那句「唯一正解」**成立**，但要标明「必须是宿主 spawn + 子进程读回；接到 `approval/request` 瀑布上会丢掉对 (b) 的防护」，并指向本文 | `docs/capability-elevation-plan.md` §9 |
| PR2 | **收窄三处「要拦它只有 OS 级同意」**：说清「挡谁」——对 (b) 成立（形态 B），对 (c) **不成立**（它能自己 spawn 框 / 写 grant 文件） | `docs/architecture.md` §7、`packages/kit/src/capability.ts`、`packages/kit/src/elevation.ts` |
| PR3 | **加 §2.1 三条事实的守卫**（会红），防止宿主改架构后本文结论静默过期 | `scripts/test/`（与 `exec-terminal-scope.test.ts` 同款） |
| PR4 | （可选，UX）形态 B：原生框替粘贴 | `packages/kit/src/elevation.ts` + 各消费插件文案 + 真机验收 |

**PR1–PR3 是「让文档说准 + 钉住结论」，与功能无关，建议先做。** PR4 是独立价值判断：
**不做也完全成立**——(b) 今天已被挡住，缺的只是一个更方便的提问方式。

## 附录 A：本文不涉及什么

- **不碰 tier gate**（那是对手 (d)，机制在 `tier-gate.ts`，独立立项已完成）。
- **不碰 (c)**（同用户进程）：出模型是结构性的（§0.3）。
- **不把提权接到 `approval/request` 瀑布上**：§2.2 形态 A 已否（形状不对 + 答案走页面）。
- **不改 `CapabilityGrantVia`**：即便做 PR4，凭据仍是 `'file'`（对话框替你写了那个文件）。
  加一个 `'dialog'` 之类的枚举值会**诱导后人以为存在一条不经文件的授权通道**——那正是本条不变量
  要保的东西，所以坚决不加。

## 附录 B：顺手发现、但不属本项的一件事（留给维护者）

调查中实测到：`webServer.register()` 是**无内建鉴权的原始席位**
（`dsh-host-webserver` 的 `register()` 只登记、派发时不查信任），
而插件 bundle 路由 `/plugins`（`dsh-client-modules` 的 `PLUGIN_ROUTE` + `serveBundle`）
与 HMR 流 `/plugins/events`（`dsh-client-hmr` 的 `EVENTS_ENDPOINT`）**都没有调用 `admit`**——
对比 `/api`（`dsh-client-connection` 的 `admit()`）、Remote mux WebSocket、
inspector 等路由都是过的。

**影响面**：这两个路由只提供**插件 JS 与 HMR 事件**，其内容本来就要发给页面，所以「未鉴权」
的直接风险有限；**但它意味着「插件自建路由默认不受围栏」是一条真实存在的形状**，
而后文的结论（形态 A 会被同页面脚本伪造）也建立在「围栏管不到页内脚本」这个前提上。
**是否收紧、以及它算不算缺陷**，属维护者判断——本文只如实记录，不擅自定级、不改代码。
