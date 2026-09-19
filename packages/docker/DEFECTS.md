# @hyzyn/dsh-docker 缺陷审计报告（v0.6.4）

> **这是一份时点记录。** 2026-09-19 对 v0.6.4（HEAD `d09e40dc`）做了一次系统性只读审计：
> 8 路并行（宿主外壳 / HTTP 路由、agent 工具、`docker.ts` 解析层、`ssh-exec.ts` 传输层、客户端三段、
> 工程闸门与文档），再由 Lead 逐条复核（剔除臆测、合并重复、拆分复合项，对关键项做运行时复现）。
> 共 **79 条：P1×4 / P2×21 / P3×54**。
>
> **✅ 修复记录（2026-09-19，同日）**：79 条**全部修复**，按文末「建议批次」的四个批次一次做完
> （0.6.5 = D01–D16、0.6.6 = D17–D24 + D54–D62 + D65–D67 + D69 + D75–D79、0.6.7 = D26–D30 + D33–D53、
> 0.7.0 = D25 + D31–D32 + D63–D64 + D68 + D70–D74；四个集合互不重叠，合计 79 条）。下文正文保留**审计时点原文**（行号、证据均为 v0.6.4 的样子），仅
> 现状、批次、复核方式三节随修复更新。修复要点与审计建议的差异：
> - **D09/D10**：`applySection` 改为按差异（enabled / dockerBin / targets 含凭证）判定才 `closeAllStreams`；
>   `POST /config` 对 hostKeys 改**并集合并 + 显式 `hostKeysRemove`**（比原建议少了确认位——并集语义下
>   空数组天然不清空）。
> - **D11**：crash-loop 判据 =「重启计数 ≥ 3 且 2 分钟内刚启动」（不敢对全部运行中容器做 inspect——
>   面板 5s 轮询成本太高），inspect 批量上限 300。
> - **D12/D42**：`attention()` 返回 `{items, total, truncated, degraded}`，工具与 `/attention` 路由同步。
> - **D14**：新增 `ExecOptions.keepTail`（logs / pull / 三个 prune 使用），短命令路径统一改为
>   `ByteSink` 字节收集 + 收尾 `StringDecoder` 解码（与 D08 一并解决）。
> - **D31**：127/8 + IPv6 等价形式同步判定；Host 别名走异步 DNS——**字面量环回保持同步判定**，
>   以免破坏「第一拍建流」的时序。tty / dsh-mcp 的同款问题**未在本轮处理**。
> - **D32**：按「至少」档执行——四条 SSE + 七条变更路由要求同源证明（Origin 或
>   `Sec-Fetch-Site: same-origin`），pull 仍是 GET+SSE（一次性 token 留在待办）。
> - **D51**：**更正**——实测（`defineTool` 编译一个带 enum 的参数）`enum` **是支持的**：
>   `enum: ['start','stop','restart','remove']` 能通过编译并进入参数 schema；真正不支持的是
>   `minimum` / `maximum`（抛 `unsupported JSON schema: … is not supported by the value schema DSL`）。
>   本轮只收紧了描述文案，**`action` 的 enum 属「可改而未改」**，建议补上；边界夹紧的回显未做。
> - **D63**：按建议的后半档做了 `logStats` useMemo + `.dk_logLine` 的 `content-visibility`；
>   完整虚拟滚动仍在待办。
> - **D70**：三套脚本以 ubuntu-only step 进 CI（依赖 D25 先行——route-smoke 已 hermetic，
>   实测 2m0.5s → 0.8s）。
>
> **✅ 第二轮修复记录（2026-09-19，同日）**：第二轮 46 条（D80–D125）**全部修复**，另补掉第一轮唯一残留
> （D51 的 `enum`）。做法与审计建议的差异：
> - **D80**：把 `Sec-Fetch-Site` / Origin 两段检查提到 DNS 分支**之前**，别名主机名不再跳过它们；
>   顺带按 D110 给别名解析加了 500ms 超时与 60s LRU（失败不缓存）。
> - **D81**：`agentForward` 复用「有没有 agent」的同一个判定，无 `SSH_AUTH_SOCK` 时**静默降级**
>   （没加 `logger.warn`：`buildConnectConfig` 是纯构造，加 warn 要改签名）。
> - **D85/D86/D87**：attention 改**分块 inspect**（默认每批 ≤40，按 `maxOutputKb` 收缩、下限 8）+
>   **补捞独立预算**（`ATTENTION_FRESH_BUDGET = 50`）+ `uninspected > 0 → degraded`（沿用既有布尔，
>   不新增返回字段 —— 工具 schema 是 `additionalProperties:false`，加字段要动两处）。
> - **D91**：直接去掉 `.dk_logLine` 的 `content-visibility`（恢复精确 `scrollHeight`），D63 只保留
>   `logStats` 的 useMemo；真窗口化仍在待办。
> - **D95**：登记 `tab.actions.close` 句柄（Set，兼容分屏）+ `openPanel` 先收标签，并保留
>   `dockerPanelWanted` 的粘性重开语义。
> - **D99**：`assertSince` 放宽 duration（含小数、`0`）与裸 Unix 秒、收紧时间戳（必须含时间），
>   错误里回显原文 —— 这会让 route-smoke 里那条旧断言（`/since 只支持/`）失效，已同步改成新文案。
> - **D101**：客户端计数改用服务端 `total`，新增 `attentionNotice` 提示行；异常表仍按实际行数渲染。
> - **D107**：`refreshTools` 逐条兜错 + 保存路径 `forceRefreshTools` 无条件重注册，半套状态可自愈。
> - **D113**：数字输入用**本地草稿**（可全删再打），仍然只把合法整数写进表单（D69 的前提不变）。
> - **D121/D122**：三套脚本改成末尾 `process.exit(...)`（排空期不再依赖被清掉的看门狗，client-smoke
>   从 5.3s 降到 0.6s）；`CASE_TIMEOUT_MS` 15s → 25s（> 20s 建连超时），并加了
>   `DSH_DOCKER_CONNECT_TIMEOUT_MS` 这一**仅测试/排障用**的可注入建连超时。
> - **D120**：`files` 补 `client-src`（否则发布包里的 `npm run smoke` 仍会在 client-smoke 段 ENOENT）。
> - **D123/D124**：新增 8 条宿主单测（`inflight` / `keepTail` 取尾 / `assertSince` 六类输入 / 区间端口 /
>   attention 补捞与分块 / 建连失败不留池条目）+ 3 条客户端总览断言；`auth=key` 用例名与断言对齐，
>   并补了真实私钥分支。
>
> **怎么读**：① 先看「现状」与「索引」（一行一条，含位置与批次）；② 再按编号读详情 —— P1/P2 给完整证据、
> 触发场景与修法，P3 是压缩条目；③ 详情是审计时点原文，修复实现以代码为准。
>
> **编号约定**：本文件的 `D01…D79` 在 `packages/docker` 内独立编号，**与 `packages/tty/DEFECTS.md` 的
> D01–D48 不是同一序列**；跨包引用请写「docker D03 / tty D12」。
>
> 审计基线：v0.6.4（HEAD `d09e40dc`）｜单测 6 套 103 例、`smoke` 36/36、`route-smoke` 60/60、
> `client-smoke` 62/62 全绿；`tsc --noEmit` 与 `client-lint` 通过；`client.js` 与 `lib/` 与源码逐字节一致
> （见「复核方式」）。**本机 docker daemon 未运行**，涉及真机 docker 输出形状的条目已标明「待验证」，
> 其余条目都由源码或运行时复现证明。

## 现状

**第一轮：已修 79 / 待修 0**（P1×4、P2×21、P3×54，2026-09-19 四个批次一次修完）。

**第二轮（同日，对修复波自身）：发现 46 条** —— P1×2、P2×15、P3×29（D80–D125）。
改动面 15 个文件、+1517/−403（`src` + `client-src` 占 1243 行新增），按与第一轮同一规格重审。
其中 **29 条是「修复不完整」**（第一轮的 D 号只修了一半，症状仍在），**16 条是新引入的**
（修复改变了行为，产生新的失败路径），另 1 条是身份归一没跟上的边界项。
**第二轮 46 条现已全部修复**（含第一轮唯一残留 D51 的 `enum`），见文首「第二轮修复记录」；
本轮同时把「第二轮 P1/P2 的 Lead 复读 + 运行时复现」与「修复后的回归门槛」写进文末。

审计时点的结论（原文保留）：「默认只读」的闸门是干净的、命令注入面是干净的、解析器的大体形状是对的——
缺陷集中在三类：

1. **长连接与长命令的生命周期**（D01、D05–D09、D13–D14、D17、D62）：已修——空闲回收计入在途一次性
   命令（inflight 计数）、并发首连先占坑、`dropConn` 带身份校验、传输错误重连先 `end()` 且配额类错误
   不再触发重连、SSE 加背压（有界缓冲 + drain）、TOFU 落盘不再掐流、客户端 deps 补 `active`。
2. **静默的错误结果**（D11–D14、D16、D19、D41、D53）：已修——crash-loop 补捞、attention 截断/降级
   信号、列表类截断即报错、logs/pull/prune 保留尾部、pull 超时报错、初始目标对列表校验、零值时间归一、
   零目标兜底。
3. **跨插件与跨文件的约定漂移**（D03、D10、D15、D45、D75–D79）：已修——指纹改 `fingerprints[]` 且
   host 小写化、hostKeys 并集合并 + 显式删除、凭证按连接身份继承、`assertSince` 统一口径、README 四类
   漂移对齐实现。

工程面同步完成：route-smoke hermetic 化（2m0.5s → 0.8s）并进 CI、三套脚本加看门狗、`files` 补 `scripts`、
TOFU / 连接构造补 7 套单测（vitest 6 套 103 例 → **7 套 119 例**）、client-lint 锚点放宽到全部
client-src 模块（并当场抓到一次 `useMemo` 未定义的真错误）。

## 索引

| D | 严重度 | 症状（一句话） | 涉及文件（行） | 建议批次 |
|---|---|---|---|---|
| D01 | P1 | 空闲回收只看长流，`docker_image_pull` 这类在途的一次性长命令会被中途掐断 | src/ssh-exec.ts:263,456,339,384 | 0.6.5 |
| D02 | P1 | 同一目标的并发首个请求各建一条 SSH 连接，先建的那条立刻脱管 | src/ssh-exec.ts:508-516,556 | 0.6.5 |
| D03 | P1 | tty 的指纹种子恒为空（tty 已改用 `fingerprints[]`）→ 对 tty 钉扎过的主机静默重新 TOFU | src/index.ts:386-399,506-517 | 0.6.5 |
| D04 | P1 | SSE 无背压：`write()` 返回值被丢弃，慢客户端 + 话痨容器 → 宿主写缓冲无界增长 | src/index.ts:291,903-911 | 0.6.5 |
| D05 | P2 | `client.connect()` 的同步异常留下一条永假的池条目，改对配置也不恢复 | src/ssh-exec.ts:550,553,556,513 | 0.6.5 |
| D06 | P2 | `dropConn(key)` 无身份校验：旧连接的 close/error 会摘掉同键上的**新**连接 | src/ssh-exec.ts:560,540,548,525 | 0.6.5 |
| D07 | P2 | 传输错误重连丢连接却不 `end()`；配额类错误被判成传输错误 → 泄漏健康连接 + 可操作文案永不到达用户 | src/ssh-exec.ts:482-505,252-256 | 0.6.5 |
| D08 | P2 | 短命令路径逐 chunk `toString('utf8')`，跨分片的多字节字符变成 U+FFFD | src/ssh-exec.ts:312-323,653-664 | 0.6.5 |
| D09 | P2 | TOFU 记一条指纹会触发 `applySection` → `closeAllStreams()`：刚开的流被掐、在途 `docker pull` 被中止 | src/index.ts:597-603,2715-2717,935-945 | 0.6.5 |
| D10 | P2 | `POST /config` 整表覆盖 hostKeys（targets 有两重保护、hostKeys 没有）→ 面板一次无关保存即回退钉扎 | src/index.ts:2385-2412,2430 | 0.6.5 |
| D11 | P2 | 「反复重启」判据缺失：`attention()` 取到 RestartCount 却从不参与判据，crash-loop 容器漏报 | src/docker.ts:1039,1059-1064,1076 | 0.6.5 |
| D12 | P2 | `attention()` 的 limit 先切后排且静默 → 最严重的容器可能被切掉，返回体无任何截断信号 | src/docker.ts:1046-1047,1096-1098 | 0.6.5 |
| D13 | P2 | 列表/详情类方法丢弃 `result.truncated`：静默少列容器/镜像/网络/卷；inspect 把「截断」误报成「不存在」 | src/docker.ts:1014-1019,1185-1193 | 0.6.5 |
| D14 | P2 | 截断保留头部、丢弃尾部：logs 丢最新行、pull 丢 digest、prune 丢总计 | src/ssh-exec.ts:312-323,653-664 | 0.6.5 |
| D15 | P2 | 改目标名会静默清掉已存的 password/passphrase（`mergeTargetSecrets` 按 name 匹配） | src/index.ts:401-419,2403 | 0.6.5 |
| D16 | P2 | `docker_image_pull` 的超时被当成成功返回（`pull()` 丢 `timedOut`，`exec()` 会抛错） | src/docker.ts:1380-1388 vs 1462 | 0.6.5 |
| D17 | P2 | 日志 FOLLOW 的 effect 声明了 `active` 却漏进 deps → 折叠面板后 SSE 不断，白占 SSH 通道 | client-src/index.js:1858,1958 | 0.6.6 |
| D18 | P2 | 自动刷新 effect 不认 `active` → 折叠/隐藏后仍每 5s 轮询（总览页是 N 目标各两次 docker 调用） | client-src/index.js:4301-4310 | 0.6.6 |
| D19 | P2 | `chooseInitialTarget` 不校验 `current` → 目标被删/改名后面板每次打开都停在「未知目标」且不自愈 | client-src/index.js:226-234,3980 | 0.6.6 |
| D20 | P2 | 两处「复制命令」直连 `navigator.clipboard`（非安全上下文同步抛错），已有的兜底函数是死代码 | client-src/index.js:1643,4424,4836 | 0.6.6 |
| D21 | P2 | 面板 config 只在挂载时拉一次 → 设置里改「允许变更操作 / exec」对已打开面板不生效 | client-src/index.js:3973-3982,5423-5431 | 0.6.6 |
| D22 | P2 | 设置卡片保存无脏检查：请求飞行期间的编辑（含刚敲的密码）被响应整表回滚 | client-src/index.js:5392-5435 | 0.6.6 |
| D23 | P2 | `sessionScoped` 粘滞 → 从连接栏进入但未匹配到目标后，「切目标中」的锁与胶囊永久失效 | client-src/index.js:3797,4702 | 0.6.6 |
| D24 | P2 | `openContainerPanel` 的 tab 分支不 `closePanel()` → 两个 ContainerPanel 并存并共享模块级 `panelUi` | client-src/index.js:5684-5701 vs 5703-5751 | 0.6.6 |
| D25 | P2 | `route-smoke.mjs` 号称离线，实际向硬编码内网 IP 发起真实 SSH 连接并断言其「不可达」 | scripts/route-smoke.mjs:313-321,864-887 | 0.7.0 |
| D26 | P3 | `stream()` 在池里找不到条目时静默跳过配额判定与 busy 自增（fail-open） | src/ssh-exec.ts:377-385 | 0.6.7 |
| D27 | P3 | `acquire()` 的失败也落在「传输错误重试」范围内 → 不可达目标每次命令等两轮 20s | src/ssh-exec.ts:483-484,254 | 0.6.7 |
| D28 | P3 | `agentForward` 配了等于没配：从不给 `ConnectConfig.agentForward` 赋值 | src/ssh-exec.ts:594-596 | 0.6.7 |
| D29 | P3 | `auth=agent` 缺 `SSH_AUTH_SOCK` 时无预检（tty 已修，docker 未跟上） | src/ssh-exec.ts:578-580 | 0.6.7 |
| D30 | P3 | `expandHome` 只认 `~` 与 `~/`：`~user/...`、Windows 变量一律原样返回 | src/ssh-exec.ts:157-161 | 0.6.7 |
| D31 | P3 | loopback 围栏的 Host 白名单过窄：本机别名 / 非 127.0.0.1 环回地址让整个面板（含唯一的启用入口）403 | src/index.ts:308-328 | 0.7.0 |
| D32 | P3 | 无 `Origin` 的请求靠 `Sec-Fetch-Site` 兜底，而 `GET /images/pull/stream` 是「带副作用的 GET」 | src/index.ts:320-322,2303-2307 | 0.7.0 |
| D33 | P3 | 统计流去重只比较相邻上一条：多容器时同一轮重复采样不会被去掉 | src/index.ts:2188-2216 | 0.6.7 |
| D34 | P3 | `pickTarget` 对非字符串 `target` 静默回落到唯一目标（破坏性操作打错主机的最后一道防线） | src/index.ts:680-687 | 0.6.7 |
| D35 | P3 | `sanitizeTargets` 在读路径就去重/丢弃，下一次保存把丢弃结果固化 → 重名目标永久消失 | src/index.ts:355-383,633-646,2403 | 0.6.7 |
| D36 | P3 | `applySection(patch)` 不在 try 内：`refreshTools` 抛错时用户拿到空 400，而配置已落盘 | src/index.ts:2420-2431 | 0.6.7 |
| D37 | P3 | 写路由对非法引用回 500（客户端错误报成服务端错误），4xx 校验只在少数几条入口做 | src/index.ts:2517-2692 | 0.6.7 |
| D38 | P3 | `parseInspectPorts` 的去重键只有 hostPort → 同端口多 IP 绑定的第二条被并掉，详情比列表少端口 | src/docker.ts:936-943 vs 277 | 0.6.7 |
| D39 | P3 | `parseStatsJson`：`PIDs` 字段缺失时得到 `0` 而不是 `null` | src/docker.ts:367,383 | 0.6.7 |
| D40 | P3 | `parsePorts` 静默丢弃端口区间（`8000-8005->8000-8005/tcp`）→ 端口整行消失 | src/docker.ts:269-273 | 0.6.7 |
| D41 | P3 | docker 的零值时间未归一（`0001-01-01T00:00:00Z`）→ 破坏「最近出事优先」排序，详情/hover 显示公元 1 年 | src/docker.ts:885-886,1090-1095 | 0.6.7 |
| D42 | P3 | `attention()` 静默吞掉 inspect 失败：OOM/退出码/重启次数/时间全降级且无任何标记 | src/docker.ts:1049-1053 | 0.6.7 |
| D43 | P3 | `assertBin` 只把关整串首字符：`docker --version` 能通过校验（不可注入，但报错退化为运行期 ENOENT） | src/docker.ts:44,47-51 | 0.6.7 |
| D44 | P3 | `logs()` 注释称「按到达顺序合并」，实现是 stdout 整段在前、stderr 在后 | src/docker.ts:1390-1399 | 0.6.7 |
| D45 | P3 | `since` 两套口径：events 有白名单（且窄于 docker 的 Go duration 语法），logs 完全不校验 | src/docker.ts:1425；src/index.ts:1603 | 0.6.7 |
| D46 | P3 | 共享 `targetParam` 文案向 12 个单目标工具暗示支持 `*` / 省略=全部，实际报错 | src/index.ts:1126 等 13 处 | 0.6.7 |
| D47 | P3 | `docker_ps` 回完整 64 位 ID（README 写「短 ID」），且与 `docker_attention` 的短 ID 口径不一 | src/index.ts:1273,1387 | 0.6.7 |
| D48 | P3 | `docker_targets{probe:true}` 丢掉 `serverVersion`（README 承诺「探测 docker 版本」） | src/index.ts:1184-1185 | 0.6.7 |
| D49 | P3 | `docker_events` 描述写「八类」，白名单实为九类（README 写九类） | src/index.ts:1561；src/docker.ts:401 | 0.6.7 |
| D50 | P3 | `docker_logs` 描述把默认行数写死 200，实际取配置 `logTailDefault` | src/index.ts:1454,1487 | 0.6.7 |
| D51 | P3 | 参数 schema 无 enum/边界：`action` 无 enum，`tail`/`timeoutSec` 越界被静默夹紧 | src/index.ts:1816,1458,1923,1972 | 0.6.7 |
| D52 | P3 | `docker_stats` 的 `ids` 传空串/纯空白静默变成「全部容器」 | src/index.ts:1537-1542 | 0.6.7 |
| D53 | P3 | `docker_attention` 在「零目标 + `target:'*'`」时渲染成「一切正常」（假阴性） | src/index.ts:1005-1006,1397-1409 | 0.6.7 |
| D54 | P3 | exec 输入框回车绕过 `execRunning` → 连敲回车会并发执行同一条命令 | client-src/index.js:2128-2132,2177 | 0.6.6 |
| D55 | P3 | 统计流结束后 `statsNotice` 常驻并替换正文 → 快照数据到手也不显示 | client-src/index.js:2098,2417-2421 | 0.6.6 |
| D56 | P3 | 「按时间」排序：尾部窗口首行若是无时间戳续行，会被排到窗口最前 | client-src/index.js:3130-3139,3149-3155 | 0.6.6 |
| D57 | P3 | 拉取进度「同层原地替换」只在相邻行成立；超限与暂停缓冲都静默丢行 | client-src/index.js:2830-2834,3335-3337 | 0.6.6 |
| D58 | P3 | 导出 .md 的代码围栏未转义：日志里出现 ``` 会截断代码块 | client-src/index.js:3214-3216 | 0.6.6 |
| D59 | P3 | `.dk_kvVal` 缺 `white-space: pre-line` → 多挂载/多网络等多行值被压成一行 | client-src/docker.css:1236 | 0.6.6 |
| D60 | P3 | 日志过滤工具条无 `flex-wrap`：窄面板下输入框塌到 0 宽、右侧按钮被裁 | client-src/docker.css:892-901 | 0.6.6 |
| D61 | P3 | 聚合日志没有「用户上滚即暂停贴底」：读历史时每来一行都被拽回底部 | client-src/index.js:3369-3373 | 0.6.6 |
| D62 | P3 | 刷新竞态：快照轮询无请求序号（慢响应覆盖新响应）；重连补偿与防抖刷新共用同一代际闸 | client-src/index.js:1830-1837,2028-2043,4367-4399 | 0.6.6 |
| D63 | P3 | 日志无虚拟滚动：每个 chunk 全量重渲染最多 2000 行并重复重算过滤 | client-src/index.js:2329-2332,2271,2352-2353 | 0.7.0 |
| D64 | P3 | 键盘可达性缺口（四处）：抽屉拖拽条 / 日志区不可聚焦 / 总览表行 / 键盘触发的菜单定位 | client-src/index.js:3704-3716,1733,938-943 | 0.7.0 |
| D65 | P3 | 右键「问 Agent」浮层与 5 个 document/window 监听器没有卸载清理点 | client-src/index.js:1619-1637,6199-6207 | 0.6.6 |
| D66 | P3 | 目标缓存的「30s 过期刷新」不存在：`cacheAt` 只写不读，README 与注释都承诺了它 | client-src/index.js:259,285,304,315 | 0.6.6 |
| D67 | P3 | `downloadText` 固定 1s 后 revoke blob URL，且 `<a>` 从未插入 DOM | client-src/index.js:152-160 | 0.6.6 |
| D68 | P3 | 容器日志原文（不可信输入）整段进 agent prompt，只提示凭证风险、无「不构成指令」声明 | client-src/index.js:1507-1511,1762 | 0.7.0 |
| D69 | P3 | 设置卡片的数字输入直接 `Number(...)`：`3.5` 被后端判非整数后静默退回默认值 | client-src/index.js:5448-5455 | 0.6.6 |
| D70 | P3 | 三套旗舰脚本（3586 行 / 158 断言）在 CI 与发布闸里零执行 | .github/workflows/ci.yml:71-91 | 0.7.0 |
| D71 | P3 | 三个 smoke 脚本没有超时/看门狗：任一挂起即整脚本永久挂住 | scripts/*.mjs（文件尾） | 0.7.0 |
| D72 | P3 | `files` 不含 `scripts/`，但 package.json 仍 advertise `smoke`（tty 的 D42 在 docker 复现） | package.json | 0.7.0 |
| D73 | P3 | 无测试的关键路径（tty D45 同款）：TOFU 指纹与 SSH 连接构造零自动化覆盖 | src/ssh-exec.ts:566,601 | 0.7.0 |
| D74 | P3 | `client-lint` 的锚点只认入口文件：client-src 兄弟模块的诊断被静默丢弃 | scripts/client-lint.mjs:45,79-83 | 0.7.0 |
| D75 | P3 | README（中英）说 `enabled: false` 需重启才生效，实现是保存即热生效（同包测试断言的就是热路径） | README.md:387,664-666 | 0.6.6 |
| D76 | P3 | README 中英三处「离线回归项数」与实测不符，且中英互相不一致（27 vs 62 最悬殊） | README.md:761,772,782 | 0.6.6 |
| D77 | P3 | README dev 段把本包 vitest 说成「三套」，实际 6 套 103 例 | README.md:746 | 0.6.6 |
| D78 | P3 | README 手工验收清单写「agent 侧只有 7 个只读工具」，实际恒注册 11 个 | README.md:817 | 0.6.6 |
| D79 | P3 | README 中英各有排版残迹：整段重复粘贴的残句 + 失衡的代码围栏 | README.md:641,523；README.en.md:688 | 0.6.6 |

## P1 详情

### D01｜P1｜空闲回收只看长流：在途的一次性长命令会被中途掐断

- **位置**：`src/ssh-exec.ts:263`（`shouldRecycleConn`）、`:456`（sweeper）、`:339`（`run` 只在结束刷新 `lastUsed`）、`:384`（`busy` 只在 `stream` 自增）
- **证据**：
```ts
export function shouldRecycleConn(conn: { lastUsed: number; busy: number }, now: number, idleMs: number = IDLE_MS): boolean {
  if (conn.busy > 0) return false            // 只有长流算「忙」
  return now - conn.lastUsed >= idleMs
}
// sweeper（每 30s 一跳）：不看连接上有没有打开的一次性 channel
if (!shouldRecycleConn(rt, now)) continue
this.conns.delete(key); rt.client.end()
```
- **触发场景**：agent 调 `docker_image_pull`（默认 `timeoutSec: 600`）打 SSH 目标；拉取期间面板没开、没有别的请求刷新 `lastUsed` → 第 120–150s 的那一跳 sweeper 把连接 `end()` 掉（`IDLE_MS = 120_000`）。`docker logs --tail 5000`、`stop/restart`（60s 起）同理。
- **影响**：命令被杀在半路，`run()` 以 `code = null` 收尾 → 工具把它当「异常结束」返回，用户看到半截输出；重试要重头再来。README 关于「空闲回收不会误杀」的承诺只对长流成立。
- **修法**：给连接加「在途一次性 channel 计数」（`run` 进入/退出配对增减，与 `busy` 分别记账），sweeper 对两者都让路；或 `run` 期间按心跳刷新 `lastUsed`。
- **置信度**：高（代码可证；`run` 全程无 `lastUsed` 刷新这一点是确定的）。

### D02｜P1｜同一目标的并发首连：后建覆盖先建，先建的那条立刻脱管

- **位置**：`src/ssh-exec.ts:508-516`、`:556`、`:547`
- **证据**：
```ts
private async acquire(spec: SshSpec): Promise<Client> {
  this.ensureSweeper()
  const key = poolKey(spec)
  const existing = this.conns.get(key)
  if (existing !== undefined) { existing.lastUsed = Date.now(); return existing.ready }
  const connectConfig = await buildConnectConfig(spec)   // ← 让出事件循环，池里仍无条目
  ...
  this.conns.set(key, { client, lastUsed: Date.now(), ready, busy: 0 })  // ← 覆盖别人的条目
```
- **触发场景**：同一 SSH 目标并发两个操作（面板的「容器列表 + 需关注」、或 agent 一条消息里并行调 `docker_ps` / `docker_stats`）。`await buildConnectConfig` 里含真正的异步（`auth=key/password` 时走凭据服务解析），窗口是**毫秒级**，很容易被并行请求踩中。
- **影响**：先建好的那条连接立即脱管 —— 不在池里 → sweeper 回收不到、`disposeAll()` 关不掉、`stream()` 的配额计数记在另一条连接上（额度失真）；它日后的 `close`/`error` 还会触发 D06 摘掉当前连接。连接数越滚越多，且第一次真正建连的那条一定泄漏。
- **修法**：先放占位条目（`connecting` 状态）再做 `await buildConnectConfig`；或 `set` 时做 compare-and-set（发现已有条目就把自己新建的 client `end()` 掉）。
- **置信度**：高（`acquire` 的去重注释与实现不符，代码可证）。

### D03｜P1｜tty 的指纹种子恒为空：对 tty 已钉扎过的主机，docker 会静默重新 TOFU

- **位置**：`src/index.ts:386-399`（`sanitizeHostKeys`）、`:506-517`（`readTtyHostKeys`）、`:609-613`（`ttySeed` 命中分支）；消费方 `src/ssh-exec.ts:611-617`
- **证据**：
```ts
// src/index.ts:392 —— 只认单数 fingerprint 字段，空即整条丢弃
const fingerprint = typeof item.fingerprint === 'string' ? item.fingerprint.trim() : ''
if (host === '' || fingerprint === '') continue
// tty 0.19.0 起存的是数组（packages/tty/src/index.ts:169-173, :958）
fingerprints: z.array(z.string()).default([]),
fingerprint: z.string().default(''),  // 旧版单指纹字段：仅作迁移输入
const next = [...this.live.hostKeys, { host: host.trim().toLowerCase(), port, fingerprints: [fingerprint] }]
```
  运行时复现（`lib/index.js`）：
```
sanitizeHostKeys([{host:'nas',port:22,fingerprints:['abcd']}])  →  []
sanitizeHostKeys([{host:'nas',port:22,fingerprint:'abcd'}])     →  [{host:'nas',port:22,fingerprint:'abcd'}]
```
- **触发场景**：先在 tty 面板连过主机 H（指纹已钉扎），再在 docker 里把 H 配成目标并执行任意操作 —— 日志仍是 `首次连接，已记录 host key 指纹 …（TOFU）`。
- **影响**：① 跨插件的钉扎一致性丢失：H 的主机密钥若变了（重装 / 换钥匙 / MITM），tty 会拒绝连接，docker 却把它当「首次连接」**静默记下新指纹并放行**，同一台机器两个面板给出相反结论；② 次级：即便补上字段名，`hostKeyStore.get(spec.host, port)` 用原始大小写比较，而 tty 落盘时把 host 小写化（`tty/src/ssh.ts:958`），`lab-a` 这类仍会键不匹配；③ `HostKeyRecord` 是**单**指纹结构（`ssh-exec.ts:28-33`），丢掉了 tty 0.19.0 为修 D12 引入的多指纹集合 —— 同一 host:port 同时有 rsa + ed25519 时会出现 tty 当年修过的「假 MITM 拒绝连接」。
- **修法**：`HostKeyRecord` 改 `fingerprints: string[]`；`sanitizeHostKeys` 同时接受 `fingerprint` 与 `fingerprints[]`；host 统一 `trim().toLowerCase()` 后建键与比较；种子命中时整组指纹一并复制。
- **置信度**：高（两侧源码 + 运行时复现可证）。

### D04｜P1｜SSE 无背压：`write()` 的返回值被丢弃，宿主写缓冲无界增长

- **位置**：`src/index.ts:291`（`ResLike.write` 的返回类型就是背压信号）、`:903-911`（`send`）
- **证据**：
```ts
const send = (frame: string): void => {
  if (done) return
  try {
    write(frame)          // 返回 false = socket 写缓冲已满 → 被忽略；全文件无 drain / pause / writableLength
  } catch {
    clientGone()          // 只有「写抛异常」才算断开
  }
}
```
- **触发场景**：本机目标 + 高速写日志的容器（`while :; do echo ...; done`），浏览器 FOLLOW 打开后切到后台标签 / 慢链路，消费速度掉下来 → `docker logs -f` 子进程持续 `on('data')` → 每块都 `res.write`。
- **影响**：宿主侧 socket 写缓冲无上限增长直至 OOM —— 这是本次唯一可能「搞死宿主」的一条。README 把内存防护归给客户端 5000 行环形缓冲，但那只约束浏览器，约束不了宿主的响应缓冲。本地目标还没有并发流上限。
- **修法**：`send` 收下 `write()` 的返回值，返回 `false` 时暂停上游（本地 `child.stdout.pause()` / 远程 `channel.pause()`）并 `res.once('drain', resume)`；或超出 `writableLength` 阈值时主动断流并发一帧 `error`。
- **置信度**：高（背压处理在整个 `src/` 与 `client-src/` 内均不存在，可 grep 证明）。

## P2 详情

### D05｜P2｜`client.connect()` 的同步异常会留下一条「永远假」的池条目

- **位置**：`src/ssh-exec.ts:550`、`:553`、`:556`、`:513`
- **证据**：
```ts
const ready = new Promise<Client>((resolve, reject) => {   // :520
  ...
  client.connect(connectConfig)                            // :550 同步抛 → ready 直接被 reject
})
ready.catch(() => { /* 由调用方处理 */ })                    // :553
this.conns.set(key, { client, lastUsed: Date.now(), ready, busy: 0 })  // :556 ← 仍然入池
// :512-515 复用
if (existing !== undefined) { existing.lastUsed = Date.now(); return existing.ready }
```
- **触发场景**：`auth=key` + 私钥文件存在但 ssh2 无法解析（加密私钥却没配 passphrase）等 —— 这类错误在 `client.connect()` 内**同步抛出**，落在 Promise executor 里，`ready` 被 reject 但条目照旧入池。
- **影响**：该目标此后**每次操作都返回同一句缓存的旧错误**；用户把私钥改对了也不恢复，因为连接根本不再重建；而且每次复用都刷新 `lastUsed`，只要面板还在轮询就永远不会被回收 —— 典型的「改了配置没反应」。
- **修法**：入池前判断建连是否同步失败，或 `ready.catch(() => this.dropConnIfSame(key, entry))`；并且只在 `ready` resolve 之后刷新 `lastUsed`。
- **置信度**：高。

### D06｜P2｜`dropConn(key)` 没有身份校验：旧连接会摘掉同键上的新连接

- **位置**：`src/ssh-exec.ts:560`（定义）、`:540`、`:548`、`:525`（三个调用点）
- **证据**：
```ts
private dropConn(key: string): void {
  this.conns.delete(key)     // 只认 key，不认是哪个 client
}
client.once('error', (error: Error) => { this.dropConn(key); ... })   // :540
client.once('close', () => { this.dropConn(key) })                    // :548
```
- **触发场景**：连接 A 超时/出错/被远端关闭 → 条目被移除 → 新请求建了连接 B → A 稍后（`once('close')` 仍在）触发 → 把 B 从池里删掉。
- **影响**：活着的 B 脱管：回收不到、`disposeAll()` 关不掉、`stream()` 配额旁路；后续请求再建 C，形成与 D02 同一条放大链。
- **修法**：`dropConn(key, client)`，仅当 `this.conns.get(key)?.client === client` 时才删。
- **置信度**：高。

### D07｜P2｜传输错误重连：丢连接却不关闭，且配额错误被误判成传输错误

- **位置**：`src/ssh-exec.ts:482-505`（`openChannel` 的重试）、`:252-256`（`isTransportError`）、`:233-242`（`describeExecError`）、`:560`（`dropConn` 不 `end()`）
- **证据**：
```ts
if (attempt === 0 && isTransportError(message)) {
  this.dropConn(poolKey(spec))                       // ← 只从池里摘掉，不 client.end()
  return await this.openChannel(spec, command, timeoutMs, 1)   // ← 另起一条新 SSH 连接
}
// :255
return /Channel open failure|open failed|Not connected|.../i.test(message)
```
  同一文件里 `describeExecError` 又说这条文案代表「连接是好的、只是远端通道额度被占满」——两处语义自相矛盾。
- **触发场景**：作者注释里写明的实测场景 —— 8 条长流占满 `MaxSessions` 后再「刷新列表」，ssh2 回 `(SSH) Channel open failure: open failed`。
- **影响**：① 那条**健康**的连接被摘出池后既不回收也不关闭，keepalive 会一直养着它 → 每次配额拒绝泄漏一条远端 SSH 连接（远端会话/进程累积）；② 重连后新连接额度是空的、命令反而成功，于是「关掉部分实时跟随 / 减少聚合容器数」这段指引**永远不会展示**，用户永远学不到该怎么处理。
- **修法**：把配额类错误从 `isTransportError` 移出（或在 `openChannel` 里对这类错误直接抛 `describeExecError(...)` 文案、不重连）；确实要丢的连接补 `client.end()`。
- **置信度**：高（`test/ssh-stream-budget.test.ts` 把该文案固化成「该重连」，属需要一起改的既有断言）。

### D08｜P2｜短命令路径逐 chunk 解码：跨 TCP 分片的多字节字符变成 U+FFFD

- **位置**：`src/ssh-exec.ts:312-323`、`:344-353`（`RemoteExec.run`）、`:653-664`、`:671-680`（`runLocal`）；对照 `:401-402`、`:427-434`（长流路径用了 `StringDecoder`）
- **证据**：
```ts
channel.on('data', (chunk: Buffer) => {
  const next = cap(stdout, stdoutBytes, chunk)   // cap 里：chunk.toString('utf8')，逐块独立解码
  stdout = next.text; stdoutBytes = next.bytes
})
// 截断分支：text + chunk.subarray(0, room).toString('utf8')
```
- **触发场景**：`docker ps --format '{{json .}}'` / `docker_logs` 输出含中文容器名或中文日志，且分片边界正好落在某个多字节字符中间（大输出必现；同样的内容走长流却正常）。
- **影响**：快照结果里出现 `�`，损坏位置随网络分片而变 —— 表现为「同一个容器名有时乱码有时正常」；截断时还会在尾部再补一个。
- **修法**：`run`/`runLocal` 也各持一个 `StringDecoder('utf8')`（收尾 `decoder.end()`），`cap` 只按字节记账。
- **置信度**：高。

### D09｜P2｜TOFU 落盘会连带掐掉所有实时流（含在途的 `docker pull`）

- **位置**：`src/index.ts:597-603`（`persistHostKeys`）→ `:2715-2717`（`settings/updated` 监听）→ `:935-945`（`applySection` 首行 `closeAllStreams()`）
- **证据**：
```ts
const persistHostKeys = (records: HostKeyRecord[]): void => {
  const scope = settingsScope
  if (scope === undefined) return
  void Promise.resolve(scope.update({ hostKeys: records })).catch(...)   // → 触发 settings/updated
}
// applySection
const applySection = (section: Record<string, unknown>): void => {
  closeAllStreams()          // 无差别收尾四条 SSE（子进程 SIGTERM / channel KILL）
  ...
```
  宿主 `@deepseek-ai/dsh-settings` 的提交路径确实会 emit `settings/updated`（`lib/types/index.js:598`，且只在解析值真变化时发）。
- **触发场景**：对一台**首次连接**的 SSH 目标打开日志 FOLLOW 或镜像拉取进度流 → `hostVerifier` 记录指纹 → 落盘 → 事件 → `closeAllStreams()`。因为 D03，**每台主机在 docker 侧都算首次连接**，所以这条路是常态而不是边角。
- **影响**：刚打开的 FOLLOW 无故断开（客户端 EventSource 自动重连，表现为抖动 + 日志重复几行）；更糟的是**在途的 `docker pull` 会被 abort 掉**（关流 = 关子进程），一次白拉的镜像要重来。
- **修法**：`applySection` 前做差异判断 —— 只有 targets / 凭证 / enabled / dockerBin 等影响执行通道的键变化时才 `closeAllStreams()`；`hostKeys` 变化不应触及流与工具注册。
- **置信度**：高（链路逐跳可证；抖动幅度取决于面板重连时机）。

### D10｜P2｜`POST /config` 整表覆盖 hostKeys：面板一次无关保存即回退钉扎

- **位置**：`src/index.ts:2385-2391`（白名单原样进 patch）、`:2403`（targets 有 `mergeTargetSecrets`）、`:2411-2412`（只在客户端**没传**时才保住内存记录）、`:2430`；客户端 `client-src/index.js:5419`（每次保存都回传表单里的整张表）
- **证据**：
```ts
for (const key of Object.keys(body)) { ...; patch[key] = body[key] }   // hostKeys 在白名单里
if (patch.targets !== undefined) patch.targets = mergeTargetSecrets(targetsNow(), patch.targets)  // 只有 targets 有保护
if (patch.hostKeys === undefined) dryRun.hostKeys = live.hostKeys      // 面板永远会传，所以兜不住
```
- **触发场景**（两条都只需面板 + 一次保存）：① 打开设置卡片时 `form.hostKeys` 为 `[]`（还没连过 SSH 目标）→ 到容器页连一次目标（记录指纹并落盘）→ 回设置卡片改任意一项并保存 → `scope.update({hostKeys: []})` 把全部钉扎清空；② 卡片打开期间新记录的指纹被旧快照覆盖。
- **影响**：TOFU 钉扎静默回退 —— 下次连接重新 `record`，指纹变更不再报「主机密钥指纹变更」，与 README「之后每次连接必须匹配，指纹变更直接拒绝连接」的承诺冲突。
- **修法**：服务端对 hostKeys 按 `host:port` 做并集合并，或干脆忽略客户端回传的 hostKeys、把「删除某条记录」做成显式 `hostKeysRemove: [{host,port}]`；空数组清空需要 `clearTargets` 同级的确认位。
- **置信度**：高。

### D11｜P2｜「反复重启」判据缺失：`attention()` 从不使用 RestartCount

- **位置**：`src/docker.ts:1039`（候选筛选）、`:1059-1064`（reasons）、`:1076`（`restartCount` 只回传）
- **证据**：
```ts
const candidates = containers.filter((item) => {
  if (item.health === 'unhealthy') return true
  if (item.state === 'restarting' || item.state === 'dead') return true
  if (item.state === 'exited' && item.exitCode !== null && item.exitCode !== 0) return true
  return false
})
...
restartCount: detail?.restartCount ?? null,   // 取到了，但从不参与判据
```
- **触发场景**：容器配 `restart: unless-stopped` 且反复崩溃（RestartCount=17、多数时间 `Up 3 seconds`，只在退避瞬间显示 Restarting）。`docker_attention` / `GET /attention` / 面板「需关注」都不会列出它。
- **影响**：最该先看的容器漏报；工具描述、README 与排序权重都承诺「反复重启」，而 Running 态没有任何信号能命中（假 Runner 实测：RestartCount=17 且 `Up` 的容器 `reasons=[]`，最终被过滤掉）。
- **修法**：把 `restartCount` 纳入判据（阈值可配，默认 3~5 → `reasons.push('restarting')`）；候选集目前在建 `inspect` 之前就定死，需要允许 inspect 之后补捞。
- **置信度**：高。

### D12｜P2｜`attention()` 的 limit 先切后排且静默

- **位置**：`src/docker.ts:1046-1047`（slice）、`:1096-1098`（sort）
- **证据**：
```ts
const picked = candidates.slice(0, limit)          // 先按 docker ps 的顺序切
...
return items.filter((item) => item.reasons.length > 0)
  .sort((a, b) => weight(a) - weight(b) || at(b) - at(a) || a.name.localeCompare(b.name))  // 排序在切之后
```
- **触发场景**：主机上有 151 个「非零退出」的老容器 + 1 个真正的 OOM/不健康容器（创建较早），模型为省 token 传 `limit: 5` 或默认 100。实测 151 个候选取 100 条返回，多出的 51 条既没 inspect 也没返回。
- **影响**：agent 按工具描述把 `docker_attention` 当排障入口，会把截断后的结果当作全部「需关注」；严重度最高的那条可能因名额被老容器占满而消失，且返回体里**没有任何**截断信号。
- **修法**：截断放到最终 reasons 过滤 + 排序**之后**；返回值加 `truncated`/`total`，或在候选超限时报错提示收窄查询。
- **置信度**：高（假 Runner 实测 151 → 100）。

### D13｜P2｜列表 / 详情类方法丢弃 `result.truncated`

- **位置**：`src/docker.ts:1014-1019`（`listContainers`；`inspect`/`images`/`networks`/`volumes`/`stats`/`events` 同型：`1021`、`1101`、`1144`、`1168`、`1254`、`1313`）、`:1185-1193`（`imageInspect`）
- **证据**：
```ts
const result = await this.runner.run(argv, { timeoutMs: ..., maxBytes: ... })
this.assertOk(result, '列出容器')
return parsePsJson(result.stdout)     // result.truncated 被丢弃
...
if (detail === undefined) throw new Error(`镜像不存在或输出无法解析：${safe}`)
```
- **触发场景**：`maxOutputKb` 的下限是 1KB（`src/index.ts:434`），设为 1KB 时三五个容器的 `docker ps` 就会超限（默认 512KB 需上千容器/镜像）；容器名/镜像名长一些的租户更容易先撞上。实测：`truncated:true` 且 stdout 只有 1 条完整 JSONL 时 `listContainers()` 正常返回 1 条、无任何标记。
- **影响**：面板与 `docker_ps` 静默少列容器/镜像/网络/卷；inspect 系列把「输出被截断」误报成「对象不存在」，把用户引向错误方向。
- **修法**：这些方法检查 `result.truncated` 并抛错或回传；inspect 系列错误文案改成「输出被截断，请调大 maxOutputKb」。
- **置信度**：高（假 Runner 实测）。

### D14｜P2｜截断保留头部、丢弃尾部：logs 丢最新行、pull 丢 digest、prune 丢总计

- **位置**：`src/ssh-exec.ts:312-323`、`:653-664`（两处 `cap`）；消费方 `src/docker.ts:1380-1400`（pull/logs）、`:1243-1250`（prune）
- **证据**：
```ts
const room = maxBytes - current
if (room <= 0) { truncated = true; return { text, bytes: current } }
if (chunk.length > room) { truncated = true; return { text: text + chunk.subarray(0, room).toString('utf8'), bytes: maxBytes } }
```
  实测（`maxBytes=12`，三段各 10 字节）→ `"AAAAAAAAAABB"`：**保留开头、丢弃后续**。
- **触发场景**：`docker_logs{tail:5000}` 命中超过 `maxOutputKb`（默认 512KB）的输出；`docker pull` 超上限时结尾的 `Status: Downloaded …` 与 digest 被丢；`docker image prune -f` 的 `Total reclaimed space:` 在结尾，同样被丢。
- **影响**：只读排障的主路径给出「最旧的一段日志 / 不含结论的拉取输出 / 不含总计的清理清单」，而 `truncated: true` 不说明丢的是哪一端 —— 与 tty 已修的 D05「两处截断方向相反，恰好丢最近输出」同类。
- **修法**：logs / pull / prune 改用「保留尾部」的环形缓冲（超出时从头部丢并置 `truncated`），并在 `truncated` 语义里写清保留端。
- **置信度**：高（`runLocal` 实测）。

### D15｜P2｜改目标名会静默清掉已存的 password/passphrase

- **位置**：`src/index.ts:401-419`（`mergeTargetSecrets`）、`:2403`；客户端 `client-src/index.js:5415`（留空时压根不发 password 字段）
- **证据**：
```ts
 * 合并凭证：…按目标名把已有值补回来，避免「改个名字就把密码清了」。
const name = typeof item.name === 'string' ? item.name.trim() : ''
const before = prev.find((target) => target.name === name)
if (before === undefined) return item          // ← 改名后直接返回，secret 丢
```
- **触发场景**：设置卡片里把一个 `auth=password` 的目标改名（`prod` → `prod-1`）并保存 → `passwordSet` 变 false → 下次连接认证失败。改名 + 同时换 host 时还会把旧密码继承到新名目标上。
- **影响**：用户可见的凭证丢失，且没有任何提示；报错出现在之后某次连接上，归因困难。注释宣称要防的正是这件事。
- **修法**：按「目标身份」（旧名映射表或数组下标）而不是名字合并，或让面板回传 `passwordSet` 由服务端决定保留；至少在丢弃密码时回一条 `warning`。
- **置信度**：高。

### D16｜P2｜`docker_image_pull` 的超时被当成成功返回

- **位置**：`src/docker.ts:1380-1388`（`pull` 丢掉 `timedOut`）vs `:1462`（`exec` 会抛错）；`src/index.ts:1951-1957`（工具在 `code === null` 时省略该字段）
- **证据**：
```ts
const result = await this.runner.run([this.bin, 'pull', safe], { timeoutMs: ..., maxBytes: ... })
return { ref: safe, code: result.code, text, truncated: result.truncated, durationMs: result.durationMs }  // 无 timedOut
...
if (result.timedOut) throw new Error(`exec 超时（…）：${safe}`)   // exec 明确抛
```
- **触发场景**：`docker_image_pull{ref, timeoutSec:600}`，大镜像/慢网 600s 没拉完。本机通道 `code=null` → 工具省略 `code`、渲染成「退出码 ?」；SSH 通道 `code=137`。两种情况工具调用都**成功返回**。
- **影响**：模型看到半截「Downloading 12MB/80MB」+ 没有 error，极易判定为已拉取，直到 `docker_action start` 才暴露 image not found；与 `docker_exec` 的超时语义直接矛盾。
- **修法**：`pull()` 补 `if (result.timedOut) throw …`（或返回 `timedOut` 并在渲染里写「已超时中止，未完成」），提示可加大 `timeoutSec` 或改用面板进度流。
- **置信度**：高。

### D17｜P2｜日志 FOLLOW 的 effect 声明了 `active` 却漏进 deps

- **位置**：`client-src/index.js:1858`（effect 体读 `active`）、`:1958`（deps 数组）；对照 `:2126`（统计流 deps 含 `active`）、`:3367`（聚合日志同）
- **证据**：
```js
useEffect(() => {
  // active=false = tab 被折叠（S3）：隐藏时不该继续挂着 SSE，白占 SSH 通道
  if (!active) return undefined
  if (tab !== 'logs' || !follow) return undefined
  ...
}, [tab, follow, props.target, item.id, logOptions.tail, logOptions.timestamps, loadLogs])   // ← 没有 active
```
- **触发场景**：打开某容器 → 日志页 → 开 FOLLOW → 折叠右侧栏标签或切到别的会话标签（`active` 由 true 变 false）。
- **影响**：effect 不会重跑/清理，`es.close()` 永不执行，`docker logs -f` 持续占着共享的 SSH 通道额度（一个目标只维持一条 TCP 连接）—— 与代码自己写的 S3 目标相反，另外三条流的 deps 都带了 `active`。
- **修法**：deps 补 `active`（一行）。
- **置信度**：高。

### D18｜P2｜自动刷新 effect 不认 `active`

- **位置**：`client-src/index.js:4301-4310`
- **证据**：
```js
useEffect(() => {
  if (!autoRefresh) return undefined
  if (view !== 'overview' && (target === '' || view === 'images')) return undefined
  const timer = setInterval(refresh, Math.max(2, config?.pollIntervalSec ?? 5) * 1000)
  return () => clearInterval(timer)
}, [autoRefresh, refresh, target, config, view])       // ← 没有 active
```
- **触发场景**：打开容器页/总览页的自动刷新后折叠标签或切走会话；tab 是「隐藏而非卸载」。
- **影响**：隐藏面板仍每 5s 轮询；总览页是**每个目标**各一次 `/containers` + `/attention`（SSH 目标各开一条 exec channel），纯烧目标机的 docker CLI 与通道额度；与同文件 SSE「隐藏即断」的设计意图自相矛盾。
- **修法**：effect 开头加 `if (!active) return undefined`，并把 `active` 加进 deps。
- **置信度**：高。

### D19｜P2｜`chooseInitialTarget` 不校验 `current`：目标被删/改名后停在「未知目标」

- **位置**：`client-src/index.js:226-234`（定义）、`:3795`、`:3980`（调用点）
- **证据**：
```js
function chooseInitialTarget(list, current, remembered, sessionScoped) {
  if (sessionScoped) return ''
  if (current !== '') return current          // ← 未与 list 校验就短路
  const names = list.map((item) => item.name)
  if (remembered !== '' && names.includes(remembered)) return remembered
  return names.length > 0 ? names[0] : ''
}
```
- **触发场景**：配好目标 A、B → 打开面板选 A（localStorage 记 A）→ 关面板 → 在插件配置里删除或重命名 A → 重新打开面板（侧栏入口，无 sessionHint）。此时 `current === remembered === 'A'`，`names.includes(remembered)` 那条兜底永远轮不到。
- **影响**：`/containers` 被后端拒（「未知目标：A」）→ 报错横幅 + 空态；`<select value="A">` 因为没有 A 这个 option 会**回落显示第一个选项 B** —— 选择器显示 B、请求打到 A；写回 localStorage 的 effect 还会把 A 固化。与 `:218-221` 注释「被删掉/改名后不能硬选…要对着当前列表校验」直接矛盾。回归用例（`scripts/client-smoke.mjs:1071-1081`）恰好只覆盖了「current 在列表里」的情形。
- **修法**：`if (current !== '' && list.some((item) => item.name === current)) return current`。
- **置信度**：高。

### D20｜P2｜复制命令的兜底是死代码：非安全上下文下点击直接抛错且无提示

- **位置**：`client-src/index.js:1643`（`copyToClipboard`，全文件只有定义、无调用点）、`:4424`、`:4836`（两处直连 `navigator.clipboard`）
- **证据**：
```js
/** 非安全上下文（远端 GUI 用 IP 访问）没有 navigator.clipboard，退回 textarea。 */
function copyToClipboard(text) { if (navigator.clipboard !== undefined && navigator.clipboard !== null) return navigator.clipboard.writeText(text); ... }
// :4424
navigator.clipboard.writeText(command).then(() => { ... }).catch(() => ...)   // 未判空
```
- **触发场景**：用 `http://<主机IP>:3080` 打开 GUI（非 secure context → `navigator.clipboard` 为 `undefined`），点「终端」且 tty 不可用走到「复制命令」兜底，或点「复制 exec 命令」。
- **影响**：属性访问即抛 `TypeError`，`.catch` 挂在调用结果上永远不生效 → 点击「没反应」，既不复制也不报错，降级路径整条失效，`reason` 永远不会显示。
- **修法**：两处改调 `copyToClipboard(command).then(...).catch(...)`。
- **置信度**：高。

### D21｜P2｜面板 config 只在挂载时拉一次：开关热改对已打开面板不生效

- **位置**：`client-src/index.js:3973-3982`（读取点）、`:5423-5431`（保存点只刷 tty 用的缓存）
- **证据**：
```js
api.config().then((payload) => { const next = payload.config; setConfig(next); ... })   // 只此一次
// 保存成功后
primeTargetsCache(response.config); void refreshTargetsCache(); setMessage({ kind: 'ok', text: '已保存并热生效' })
```
- **触发场景**：面板以 dock / 右侧栏标签承载（保持挂载）→ 在插件配置里把「允许变更操作」由开改关 → 回到面板：停止/重启/删除、镜像删除、网络卷 prune 仍可点。
- **影响**：不是安全漏洞（后端闸门仍会拒），但前端放行了后端必拒的操作、「只读模式」徽标不出现，与刚弹出的「已保存并热生效」直接冲突；反向（关→开）同样要重开面板才拿到按钮。
- **修法**：保存成功后向已挂载的面板推送新 config（模块级订阅），或让面板每次渲染从 `configCache` 现取。
- **置信度**：高。

### D22｜P2｜设置卡片保存无脏检查：飞行期间的编辑被整表回滚

- **位置**：`client-src/index.js:5392-5435`
- **证据**：
```js
const save = () => {
  setSaving(true)
  const payload = { ...整表... }
  api.saveConfig(payload).then((response) => { setForm(response.config); ... })   // ← 用服务端快照覆盖用户正在编辑的表单
```
- **触发场景**：点保存 → 在请求飞行期间继续编辑（改端口、敲密码）→ 响应到达 → 整表被服务端快照覆盖，刚敲的内容消失。
- **影响**：静默丢用户输入，密码框尤其危险（用户以为改动已保存）。也解释了为什么「保存后表单看起来回退」。
- **修法**：保存前记录表单版本，响应到达时只在无本地改动时才 `setForm`；或保存期间禁用编辑并给出明确状态。
- **置信度**：高。

### D23｜P2｜`sessionScoped` 粘滞：从连接栏进入但未匹配目标后，旧目标卡片可点

- **位置**：`client-src/index.js:3797`（初值）、`:4702`（`staleList` 的判定）
- **证据**：`sessionScoped` 在「从连接栏进入且没匹配到目标」后恒为 true，`staleList` 依赖它来加「切目标中」胶囊与 `pointer-events` 锁 —— 锁一旦失效，列表里展示的是**上一个目标**的容器卡片，用户可以点进去执行操作。
- **触发场景**：从 tty 连接栏点「容器」进入一个尚未配成 docker 目标的主机 → 面板按 `sessionHint` 提示「还没配置为目标」→ 用户手动在下拉里换目标，但 `staleList` 已不再锁住旧卡片。
- **影响**：错配（看的/点的是一台主机，操作目标是另一台）—— 正是 `:3810` 注释要避免的那类事故；窗口受 20s `readyTimeout` 限制。
- **修法**：`sessionScoped` 只在「本轮匹配失败且仍未换目标」期间为 true，用户手动选择目标后复位。
- **置信度**：中高。

### D24｜P2｜`openContainerPanel` 的 tab 分支不 `closePanel()`：两个面板实例并存

- **位置**：`client-src/index.js:5684-5701`（tab 分支）vs `:5703-5751`（modal/dock 分支先 `closePanel()`）
- **证据**：`openContainerPanel` 的 tab 分支没有先收掉现有实例，而 `ContainerPanel` 的状态托管在**模块级** `panelUi`（`:3760` 的 `usePanelState`）。
- **触发场景**：`carrier` 灰度开关或 dock/tab 混用（先 dock 打开、再切到 tab 承载）时，两个 `ContainerPanel` 同时存活，共享同一份 `panelUi`；模态实例的 backdrop（`z-index: 2140, inset: 0`）还会挡住新面板。
- **影响**：状态互相踩（两个实例写同一份 `panelUi`）、事件流/轮询翻倍、UI 卡在 backdrop 后面。
- **修法**：`openContainerPanel` 也先 `closePanel()`（或把 `panelUi` 换成实例内状态 + 显式单例守卫）。
- **置信度**：中。

### D25｜P2｜`route-smoke.mjs` 号称离线，实际向硬编码内网 IP 发起真实 SSH 连接

- **位置**：`scripts/route-smoke.mjs:313-321`（目标定义）、`:864-887`、`:910`、`:920`（断言）、`:29`（临时目录不清理）
- **证据**：
```js
{ name: '远程', kind: 'ssh', book: 'prod-a' },                                   // :319
{ name: '直连', kind: 'ssh', host: '10.0.0.9', username: 'ops', auth: 'password', password: 'env:FAKE_PW' },
// TTY_CONFIG 里 prod-a = 10.0.0.5:2222（:313-314）
// 断言（:864-865）：远程目标走真 SSH（10.0.0.5 不可达）→ 应报不可用而不是抛异常
assert.equal(remote.ok, false)
```
  实测 `time node scripts/route-smoke.mjs` → `real 2m0.518s`；`lsof -nP -iTCP` 抓到 `TCP 192.0.2.102:55202->10.0.0.5:2222 (SYN_SENT)`（每次连接等 `readyTimeout: 20_000`，`src/ssh-exec.ts:572`）。脚本头部却写「假 ctx + 假 docker CLI，无需真 daemon」。
- **触发场景**：任何人跑 `pnpm smoke`；在 `10.0.0.5` 真有主机的网段上脚本会**假红**（它连上了，`ok === true`），在 DROP 网络里每次连接干等 20s。也会对用户局域网发起真实的 SSH 握手（含 agent 认证尝试）。
- **影响**：脚本的「自包含 / 离线」定位与实现不符；D70 把脚本接进 CI 后，这会变成「+2 分钟且可能随机红」。顺带每次运行在 `os.tmpdir()` 留一份假 CLI 目录。
- **修法**：SSH 目标改用必然**立即**失败的地址（如 `127.0.0.1:1`，ECONNREFUSED）或注入假 runner，断言错误路径而不是断言「某个内网 IP 不可达」；顺手 `rmSync(dir, { recursive: true })`。
- **置信度**：高（`lsof` + 耗时实测）。

## P3 详情

> 压缩条目：**位置**｜证据与影响｜修法。凡标「待验证」的是本次无法在只读条件下证实的可达性细节。

**D26｜P3｜`stream()` 的配额判定 fail-open**｜`src/ssh-exec.ts:377-385`｜`await this.acquire(spec)` 之后 `this.conns.get(key)` 可能是 `undefined`（D02/D06 的脱管态），此时配额判定与 `busy += 1` 被整段跳过 → 该连接上的长流不受 `MAX_STREAMS_PER_TARGET` 约束，可直冲 OpenSSH `MaxSessions=10`。修法：`rt === undefined` 时抛错或重建条目，而不是继续开流。

**D27｜P3｜建连失败也落在重试范围**｜`src/ssh-exec.ts:483-484`、`:254`｜`openChannel` 的 `try` 从 `await this.acquire(spec)` 就开始了，而 `SSH 连接超时` 命中 `isTransportError` 的首选项 → 不可达目标每次命令等两轮 20s（叠加首连 `readyTimeout`）。修法：把 `acquire` 移出重试范围，只对「已池化连接的 exec 请求阶段」重试一次。

**D28｜P3｜`agentForward` 配了等于没配**｜`src/ssh-exec.ts:594-596`｜该分支只设 `base.agent`（认证用途），从不设 `base.agentForward`；ssh2 只有 `cfg.agentForward === true` 才会 `allowAgentFwd` 并发 `auth-agent-req@openssh.com` → 远程永远拿不到本地 agent。配置项在 `src/index.ts:102`，README 也承诺了它。修法：`if (spec.agentForward === true) base.agentForward = true`。

**D29｜P3｜`auth=agent` 缺 `SSH_AUTH_SOCK` 无预检**｜`src/ssh-exec.ts:578-580`｜`base.agent = process.env.SSH_AUTH_SOCK` 可能是 `undefined`，ssh2 于是没有任何可用认证方式，报 `All configured authentication methods failed`，把「agent 没跑」这个最可能的原因藏起来（tty 的同一分支有预检文案，见 tty D16）。修法：`auth === 'agent'` 且无 `SSH_AUTH_SOCK` 时直接抛可操作错误（含「或改用 key / password」）。

**D30｜P3｜`expandHome` 只认 `~` 与 `~/`**｜`src/ssh-exec.ts:157-161`｜`~root/.ssh/id_rsa`、`%USERPROFILE%\.ssh\id_rsa` 原样返回 → `readFileSync` 报 ENOENT 且路径原样呈现，用户易误判；裸 `.ssh/id_rsa` 又按 CWD 解析、可能静默指错文件。修法：支持 `~user` 或明确报「仅支持 `~` 与 `~/`」，并在设置卡片里写清口径。

**D31｜P3｜loopback 围栏的 Host 白名单过窄**｜`src/index.ts:308-328`｜地址只认 `127.0.0.1`/`::1`/`::ffff:127.0.0.1`（BSD/Linux 整个 127/8 都是环回），Host 头只认这三个字面量 + `localhost` → 用本机别名（`/etc/hosts` 里的 `my-dsh`、`<本机名>.local`）访问时**所有路由**（含唯一能重新启用插件的 `/config`）返回 403，UI 上没有任何自救路径。修法：地址放宽到 127/8 与 IPv6 等价形式，Host 判定改为「解析到本机」；这条与 tty/dsh-mcp 同款，若要改建议三个插件一起。

**D32｜P3｜带副作用的 GET + 无 Origin 兜底**｜`src/index.ts:320-322`、`:2303-2307`｜`origin === undefined` 时直接放行，靠 `sec-fetch-site` 兜底（旧 Safari / 部分 WebView 不发该头），而 `GET /images/pull/stream` 会真实拉取镜像、`/logs/stream` 与 `/stats/stream` 可无限拉起本机 docker 子进程 → 恶意页面可用 `<img src="http://127.0.0.1:3080/api/dsh-docker/images/pull/stream?...">` 触发一次写操作（需 `allowMutations` 已开）或做资源消耗。修法：对「既无 Origin 又无 Sec-Fetch-Site」的请求直接拒绝，至少对变更类与长流端点强制同源 Origin；把 pull 改成 POST + SSE 或加一次性 token。**待验证**：可达性取决于浏览器是否发送 `Sec-Fetch-*`。

**D33｜P3｜统计流去重只比较相邻上一条**｜`src/index.ts:2188-2216`｜`lastRaw` 只与紧邻的上一条比：单容器时序列是 `A A`，多容器时是 `A B A B`，于是只有第一个容器的重复项被去掉 → 客户端 60 点环形缓冲被重复点占掉，趋势窗口名义 60s 实际减半（注释里「实际只剩 ~30 秒」的担忧并未真正解决多容器情形）。修法：同轮内用「已见过的对象集合」去重，或按 `Name` 分别记上次值。**待验证**：需一次多容器 `docker stats` 实抓确认渲染顺序。

**D34｜P3｜`pickTarget` 对非字符串静默回落**｜`src/index.ts:680-687`｜`typeof input === 'string'` 不成立就走默认目标分支，于是 `target: 123`（或数组/对象）且只配了一个目标时**不报错**、直接在默认目标上执行；配两个目标才报「target 必填」。破坏性操作打错主机的最后一道防线失效。修法：只对「省略/空串」回落，类型不对时返回 `target 必须是字符串`。

**D35｜P3｜`sanitizeTargets` 在读路径去重并固化**｜`src/index.ts:355-383`、`:633-646`、`:2403`｜`seen.has(name)` 在读路径就丢弃重名条目（`targetsNow()` 每次现读现清洗），空名 / 超 64 字符同理；此后在卡片点一次保存，`scope.update({targets})` 整表替换把丢弃结果永久固化。面板与 agent 只看到第一条，另一台主机凭空消失且无 warning。修法：被丢弃的条目计数并回 `warning`（POST /config 已有该通道），或把重名改成自动后缀而不是丢弃。

**D36｜P3｜`applySection(patch)` 不在 try 内**｜`src/index.ts:2420-2431`｜只有 `scope.update(patch)` 在 try 里，`applySection(patch)` 抛错会穿到宿主 HTTP 层（空 400），而配置**已经落盘** —— 与 `:2404-2409` 注释里描述并修掉过一次的形态同类，只是换了个抛错来源（`tools.register` / `systemPrompt.section`）。干跑只覆盖 `normalizeConfig`，覆盖不到这两个。修法：把 `applySection` 也纳入 try/catch，失败时回滚或返回带原因的 500。**待验证**：可达性依赖 `refreshTools` 抛错。

**D37｜P3｜写路由对非法引用回 500**｜`src/index.ts:2517-2692`｜路由只做 `typeof body.id === 'string'` 这类浅校验，真正的白名单校验（`assertRef` / `assertImageRef` / `assertName`）在 `DockerApi` 里，抛错被外层 `catch` 统一写成 **500**（`/inspect`、`/logs`、`/images/inspect|remove`、`/networks/*`、`/volumes/*`、`/exec` 都如此）→ 客户端错误被报成服务端错误，前端只会显示「HTTP 500」。修法：在路由层先跑一次断言，失败即 400 并带原因。

**D38｜P3｜`parseInspectPorts` 的去重键缺 hostIp**｜`src/docker.ts:936-943` vs `:277`｜键是 `${hostPort}`，`docker inspect` 对 `-p 8080:8080` 给出的 `{HostIp:'0.0.0.0'}` + `{HostIp:'::'}` 只剩第一条（实测），而列表侧 `parsePorts`（键含 hostIp）保留两条 → 详情页/`docker_inspect` 的端口少于列表页。修法：键改 `${hostIp}:${hostPort}`；顺带处理 `HostPort:""` 被 `Number('')===0` 变成 `hostPort: 0` 的幻影映射。

**D39｜P3｜缺 `PIDs` 时得到 0 而不是 null**｜`src/docker.ts:367`、`:383`｜`Number(str(row,'PIDs'))` 对空串得 `0`，再经 `Number.isInteger` 判真 → 字段缺失时显示「0 个进程」，而同函数里 `memUsed`/`memLimit` 缺字段时正确地是 `null`（实测）。修法：空串先转 `NaN`。

**D40｜P3｜`parsePorts` 丢弃端口区间**｜`src/docker.ts:269-273`｜`8000-8005` → `Number` 得 `NaN` → `continue`，`parsePorts('0.0.0.0:8000-8005->8000-8005/tcp')` 实测返回 `[]`，整行端口凭空消失（无日志、无标记）。修法：识别 `a-b` 区间（产出 range 字段，至少保留原文）。**待验证**：`docker ps` 对区间映射的输出形状。

**D41｜P3｜docker 的零值时间未归一**｜`src/docker.ts:885-886`、`:1090-1095`；客户端 `client-src/index.js:629-644`｜从未退出的容器 `FinishedAt` 是 `"0001-01-01T00:00:00Z"`（不是空串），`Date.parse` 得 `-62135596800000` 且 `Number.isFinite` 为真 → ① `attention()` 的「最近出事优先」退化成名字序（实测：刚变 unhealthy 的排到老容器之后）；② `docker_inspect` 文本显示「结束：0001-01-01T00:00:00Z」；③ 总览 hover 显示「结束于 1/1/1 08:05:43」。修法：解析时把零值（含 `StartedAt`）归一为 `null`，`at()` 用 `startedAt` 兜底，客户端 `at()` 再加一道「早于 2000 年视为无」。

**D42｜P3｜`attention()` 静默吞掉 inspect 失败**｜`src/docker.ts:1049-1053`｜`catch {}` 退回摘要口径：`oomKilled:false`、`restartCount/startedAt/finishedAt:null`，OOM 被降级成 `exit-nonzero`，且 `DockerApi` 没有 logger，宿主日志里也看不到。调用方无法区分「没有 OOM」与「权威数据没取到」。修法：返回值加 `degraded`/`detailError`，至少经注入的 logger 记一条 warn。

**D43｜P3｜`assertBin` 只把关整串首字符**｜`src/docker.ts:44`、`:47-51`｜`BIN_RE` 的 `(?!-)` 只看整串开头，内部空格之后的 token 允许 `-` 开头，实测 `assertBin('docker --version')` 通过校验，与注释宣称的「看起来像 flag 的值会被拒」不符。**不可注入**（本机 `spawn` 单 argv 元素、远程 `shJoin` 单引号包住整串），实际影响是这类配置不再得到 400 的清晰报错，退化成运行期「无法执行 docker --version」。修法：`(?!-)[A-Za-z0-9_./:\\-]+(?: (?!-)[A-Za-z0-9_./:\\-]+)*$`。

**D44｜P3｜`logs()` 的拼接顺序与注释不符**｜`src/docker.ts:1390-1399`｜注释写「按到达顺序合并」，实现是 `stdout + '\n' + stderr`（实测 `OUT-1\nOUT-2\n` + `ERR-BETWEEN\n` → 全 stdout 在前）。容器交替写两路输出时，快照日志的时序被打乱。修法：`run()` 侧记录块到达序，或至少把注释改成「stdout 在前、stderr 在后（非到达序）」。

**D45｜P3｜`since` 两套口径**｜`src/docker.ts:1425`；`src/index.ts:1603`｜events 的 `since` 有白名单正则（只认「单个数字 + 单个单位」或时间戳），logs 的完全不校验（工具与 SSE query 都只判非空就透传）。于是 `1h30m`（docker 的 Go duration 语法合法）在 `docker_events` 被拒、在 `docker_logs` 能用；反过来 `docker_logs{since:'--timestamps'}` 会把 docker 的参数错误变成不可读的报错（不可注入：pflag 对 `--since` 无条件取下一个 token；本地 argv、远程 `shJoin` 转义）。修法：抽一个 `assertSince`，接受复合 duration，供两处共用。

**D46｜P3｜共享 `targetParam` 文案与语义矛盾**｜`src/index.ts:1126`（定义）+ 13 处复用｜描述向 12 个单目标工具暗示「省略 = 当前/全部目标」，而 `pickTarget` 只会把 `'*'` 当普通目标名（报「未知目标：\*」）、多目标下省略则报「target 必填」；只有 `docker_ps` / `docker_attention` 真有 `*` 聚合。修法：文案收敛为「`*` 仅 docker_ps / docker_attention 支持」，并让 `pickTarget` 对 `'*'` 给出专门错误。

**D47｜P3｜`docker_ps` 回完整 64 位 ID**｜`src/index.ts:1273`、`:1387`｜`toRow` 用 `row.id`，而 `docker ps` 带 `--no-trunc`（`src/docker.ts:1015`）→ 完整 64 位；README 写「短 ID」，且 `docker_attention` 用的是 `shortId` —— 同一字段跨工具宽度不一，长列表还多烧上千 token。修法：改用 `row.shortId`（或同时输出两字段并同步 README）。

**D48｜P3｜`docker_targets{probe:true}` 丢掉 `serverVersion`**｜`src/index.ts:1184-1185`；`src/docker.ts:1005` 其实返回了它｜README 承诺「逐个探测 docker 版本与 daemon 可达性」，实现只回 `ok`/`error`。修法：output schema 加 `serverVersion?: string` 并映射，或改 README 去掉「docker 版本」。

**D49｜P3｜`docker_events` 描述写「八类」**｜`src/index.ts:1561`；`src/docker.ts:401`｜描述列了 9 个动作名却说「八类」，README 写「九类」。修法：改成「九类」。

**D50｜P3｜`docker_logs` 描述把默认行数写死 200**｜`src/index.ts:1454`、`:1487`｜实际取配置 `logTailDefault`（1~5000，出厂 200）；用户调到 1000 后模型仍按 200 预期。修法：描述改为「默认取配置 `logTailDefault`（出厂 200）」。

**D51｜P3｜参数 schema 无 enum/边界**｜`src/index.ts:1816`（`action` 无 enum）、`:1458`（`tail`）、`:1923`、`:1972`（`timeoutSec`）｜模型传 `action:'pause'` 要等执行期才报错，`tail: 99999` 被静默夹到 5000、`timeoutSec: 0` 被静默夹到 1s，都不告知。修法：能用 schema 表达的就用（`enum` / 边界），或把夹紧结果回显（如 `appliedTail`）。

**D52｜P3｜`docker_stats` 的 `ids` 传空串静默变「全部」**｜`src/index.ts:1537-1542`｜`ids:''`/`' , '` 解析成 `[]` → `docker stats --no-stream` 不带 id = 全部运行中容器，模型可能把别的容器数据当成目标容器的。修法：非 `undefined` 但解析为空时直接抛错。

**D53｜P3｜`docker_attention` 零目标时给「一切正常」**｜`src/index.ts:1005-1006`、`:1397-1409`｜零目标时 `groups: []`，`renderAttention` 的 `total === 0 && groups.every(ok)` 命中「所有目标上没有需要关注的容器」——排障入口给出假阴性；对照 `docker_ps` 的渲染有「尚未配置任何 Docker 目标」兜底。修法：`groups.length === 0` 时返回同款兜底文案。

**D54｜P3｜exec 回车绕过 `execRunning`**｜`client-src/index.js:2128-2132`、`:2177`｜按钮有 `disabled: execRunning`，但 `onKeyDown` 直接调 `runExec()`，函数内部没有在途判断 → 连敲回车会把同一条命令并发执行两次。修法：`runExec` 首行加 `if (execRunning) return`，或用 ref 锁。

**D55｜P3｜统计页被常驻通知替换正文**｜`client-src/index.js:2098`、`:2417-2421`｜`statsNotice` 一旦被设（流自然结束 / 不支持 EventSource）就在渲染开头 `return`，此后快照轮询照常写入 `stats` 也不显示 —— 文案说「已切回快照轮询」，界面上只有一条横幅、没有数值，须再开关一次 FOLLOW 才恢复。修法：通知作为正文上方的横幅，或一次性提示几秒后自动清空。

**D56｜P3｜「按时间」排序的首行初值问题**｜`client-src/index.js:3130-3139`、`:3149-3155`｜尾部窗口被切开时，若窗口首行是无时间戳续行，`carried` 初值仍是 `0` → 该行被排到窗口最前，与它的头行分离（窗口顶部出现「半截堆栈」）；每次 flush 按新边界重排，间歇性反复。修法：`orderRowsByTimestamp(rows, seedTs)` 接收窗口外前一行的 ts。

**D57｜P3｜拉取进度「同层原地替换」只在相邻行成立**｜`client-src/index.js:2830-2834`、`:3335-3337`｜upsert 只比较最后一行 key，多层交错输出时每次都 push → 行数线性增长；超过 `PULL_LINE_LIMIT` 后 `out.shift()` 静默丢弃最早的进度行（主缓冲那条路径会置 `dropped`，这两处不会）。修法：用 `Map<key, index>` 或「key → 最后下标」索引做替换，超限时置截断标志并提示。

**D58｜P3｜导出 .md 的代码围栏未转义**｜`client-src/index.js:3214-3216`｜日志里出现一行 ``` 就会提前闭合围栏，后续日志被当 markdown 正文渲染，工单附件内容错乱。修法：用四个反引号围栏，或把 body 里的 ``` 转义 / 改缩进式代码块。

**D59｜P3｜`.dk_kvVal` 缺 `white-space: pre-line`**｜`client-src/docker.css:1236`｜多处用 `'\n'` 拼多行值（容器详情的挂载、网络详情的子网/标签、卷详情的选项/标签、镜像详情的多标签与 digest），默认 `white-space: normal` 把换行折叠成空格 → 多条目挤成一行，难以分辨边界。修法：`.dk_kvVal { white-space: pre-line; }`（保留换行，仍可自动折行）。

**D60｜P3｜日志过滤工具条无 `flex-wrap`**｜`client-src/docker.css:892-901`、`:883-890`｜聚合日志那一行同时挂 LINES、三个 pill、级别 select、两个导出 chip 与 92px 计数槽，`.dk_filterBar` 与 `.dk_tabs` 都不换行、`.dk_panel { overflow: hidden }` 是最终裁剪点 → 唯一可缩到 0 的过滤输入框塌成一条缝、右侧按钮被裁。修法：`flex-wrap: wrap` + 给输入框一个 `min-width`。置信度中（未在浏览器实测像素）。

**D61｜P3｜聚合日志没有「上滚即暂停贴底」**｜`client-src/index.js:3369-3373`（对照单容器 `:2009-2013`）｜`entries` 一变就无条件 `scrollTop = scrollHeight`，往上滚看历史时每来一行都被拽回底部；单容器视图有 `followAtBottom` + 「回到底部」，两边行为不一致。修法：把这套逻辑提到共用处复用。

**D62｜P3｜刷新竞态两处**｜`client-src/index.js:1830-1837`、`:2028-2043`（快照轮询无请求序号）、`:4367-4399`（重连补偿与 500ms 防抖共用 `listSeq`）｜① 慢目标的 t1 响应晚于 t2 返回会覆盖新快照，`finally` 还会被先返回者清掉 loading（对照 `inspect` 的 `alive` 标志）；② EventSource `onopen` 的补偿刷新与防抖刷新并发调用 `loadContainers`，共用同一代际闸 → 后到者作废，重连对齐可能白做。修法：请求自增 seq 丢弃过期响应 / 同一 item 用 AbortController；`onopen` 改走 `debounced.schedule()`。

**D63｜P3｜日志无虚拟滚动**｜`client-src/index.js:2329-2332`、`:2271`、`:2352-2353`｜每个 SSE chunk 都全量重渲染最多 2000 行（每行跑正则与 `highlight`），`logStats()` 在渲染期被调 2~3 次、每次都 `join/split` 最多 5000 行缓冲 → 消息密集时主线程占满、输入与滚动发粘。修法：窗口化渲染（`content-visibility` 之类）或把 `logStats()` 结果 `useMemo` 到 `[raw, levelMin, needle]`。

**D64｜P3｜键盘可达性缺口（四处）**｜`client-src/index.js:3704-3716`（抽屉拖拽条是纯鼠标 div，无 `tabIndex`/`role`/方向键）、`:1733`（`.dk_logBody` 不可聚焦 → 键盘打不开「问 Agent」，且键盘触发的 contextmenu 坐标为 0 时菜单被夹到左上角）、`:938-943`（总览异常表的行是 `<tr onClick>`，同函数的计数卡与 compose 卡都补齐了 `role/tabIndex/onKeyDown`，只此表漏了）｜修法：按各处补 `tabIndex`/`role`/键盘处理，坐标 0 时改用选区 rect 定位。

**D65｜P3｜右键菜单浮层与 5 个监听器无卸载清理点**｜`client-src/index.js:1619-1637`、`:6199-6207`｜菜单 append 到 `document.body`（不在面板子树里），同时挂了 `document` 上的 keydown/mousedown/wheel/touchmove 与 `window` 的 resize 五个 capture 级监听器；面板关闭（`closePanel()`）不会调 `closeLogMenu()` → 卸载后仍会在下一次手势里触发悬空闭包。有界泄漏，但确实存在「已卸载仍响应事件」的窗口。修法：dispose 与面板卸载 effect 里调 `closeLogMenu()`。

**D66｜P3｜目标缓存的「30s 过期刷新」不存在**｜`client-src/index.js:259`、`:285`、`:304`、`:315`；README.md:663、`:242` 注释｜`cacheAt` 全文只有赋值、**零读取**，全文件也只有三个 `setInterval`（日志轮询、统计、列表自动刷新），`refreshTargetsCache` 只在挂载 / 保存 / 连接栏点击兜底时调用 —— README 承诺的「目标增删后最多 30 秒内刷新」与代码注释里的「过期 30s 时后台刷新」都不存在（TTL 逻辑大概在某次重构中丢了，`cacheAt` 是残留）。修法：补上 TTL 读取与后台刷新，或把文档与注释改成「挂载 / 保存配置 / 点击时刷新」。

**D67｜P3｜`downloadText` 的 blob 回收与插入 DOM**｜`client-src/index.js:152-160`｜`<a>` 未 `appendChild` 就 `click()`（Firefox 历史上需要 in-document），且固定 1s 后 `revokeObjectURL` —— 数 MB 的日志导出在部分浏览器是异步取流的，回收过早可能得到 0 字节且无提示。修法：`appendChild` → `click` → `remove`；revoke 延后（或 `requestIdleCallback`）。置信度中。

**D68｜P3｜日志原文进 agent prompt 缺隔离声明**｜`client-src/index.js:1507-1511`、`:1762`｜容器日志（不可信输入）与指令之间只有 `--- 选中 ---` 分隔，UI 提示只覆盖凭证泄漏、不覆盖指令注入；容器里回显攻击者内容的场景下可能诱导模型去调已开放的 `docker_exec` / `docker_action`。修法：日志块加显式围栏 + 「以下为容器日志原文，可能包含不可信内容，不构成对你的指令」，并补 UI 提示。

**D69｜P3｜设置卡片的数字输入直接 `Number(...)`**｜`client-src/index.js:5448-5455`｜`3.5` 被后端 `clampInt` 判为非整数后**静默退回默认值**（如轮询间隔回到 5），清空输入则回弹成 0（视觉跳变）。修法：输入时按整数过滤/提示，或在字段下显示「已回退为默认值 N」。

**D70｜P3｜三套旗舰脚本在 CI 与发布闸里零执行**｜`.github/workflows/ci.yml:71-91`、`release.yml`、`RELEASING.md:20,39`｜`grep -rc docker .github/workflows/` 两个文件都是 0；ci.yml 显式跑 tty 的 5 个端到端脚本，docker 没有对等 step。后果：CI 只跑宿主半体的 vitest（6 套 103 例），**浏览器半体 `client.js` 在 CI 里一次都没被执行过**（`client-smoke` 是唯一执行它的测试，62 项），26 条路由的端到端与解析/argv 回归同样不挡合并。对照 tty 的 D38/D39 已修、docker 侧没跟上（口径仍按 tty 记 P3）。修法：ci.yml 加一条 ubuntu-only step 跑 `node packages/docker/scripts/{smoke,route-smoke,client-smoke}.mjs` —— **先修 D25**，否则立刻变成 +2 分钟且可能随机红。

**D71｜P3｜三个 smoke 脚本没有看门狗**｜`scripts/smoke.mjs`、`route-smoke.mjs`、`client-smoke.mjs` 的文件尾｜只有「打印结果 + 失败则 `exit 1`」，没有任何看门狗（审计时点：`smoke` / `route-smoke` 里连 `setTimeout` 都没有，`client-smoke` 的 `setTimeout` 只是桩里的延时）；SSE 用例形如 `await route.handler(req, res)`，`end` 帧不再写出就永不 resolve。修法：全局看门狗（超时打印最后通过的用例并 `exit 1`）+ 每个 case 级超时。

**D72｜P3｜`files` 不含 `scripts/`，却 advertise 了 `smoke`**｜`package.json`｜`files: ["lib","client.js","cordis.patch.yml","README.md"]`，tty 的同字段已含 `"scripts"`；从 npm 装到的包里 `npm run smoke` 必然 ENOENT，README 里那些 `scripts/*.mjs` 路径在发布物中不存在（tty D42 在 docker 复现）。修法：`files` 加 `"scripts"`（与 tty 对齐），或从发布脚本里去掉 `smoke`。

**D73｜P3｜无测试的关键路径：TOFU 与连接构造**｜`src/ssh-exec.ts:566`、`:601`；接线 `src/index.ts:2032-2034`｜`applyHostKeyPolicy` / `buildConnectConfig` / `createRemoteExec` / `resolveSecret` / `setCredentialResolver` / `expandHome` / `sshTarget` 在 `test/` 与 `scripts/` 里零引用，而 README 把 TOFU 写成安全保证（「变更即拒绝连接（防中间人）」）；`applyHostKeyPolicy` 的三条分支（首记 / 命中 / 变更拒绝 + 文案）一条都没测。其它零覆盖导出还有 `parseJsonLines`、`parseExitCode`、`deriveState`、`deriveHealth`、`parseLabels`、`parseInspectPorts`、`formatEventTime`。修法：用假 store/logger 做纯函数测试（首记返回 true 且 record、命中返回 true、变更返回 false 且 `mismatchMessage()` 含「删除该主机记录再重连」），`buildConnectConfig` 至少断言 `readyTimeout=20s`、`hostHash='sha256'`、三个 auth 分支，注入假 `credentials` 走一条 `setCredentialResolver` 的接线用例。

**D74｜P3｜`client-lint` 的锚点只认入口文件**｜`scripts/client-lint.mjs:45`、`:79-83`｜tsc program 实际包含 `client-src/session-target.js` 与 `current-session.js`（`--listFiles` 可证），但诊断过滤用入口路径当锚点 → 兄弟模块的 `TS2304`/`TS2448` 被静默丢弃（合成诊断实测只命中 1/3）。这两个模块目前靠 vitest 兜着，将来新增模块若无单测就会漏（历史上这类未定义名字正是「整块面板空白」的成因）。修法：锚点放宽到 program 内所有 `client-src/**`。

**D75｜P3｜README 说 `enabled: false` 需重启才生效**｜`README.md:387`、`:664-666`；`README.en.md:433`｜实现是保存即热生效：`refreshTools()` 先 dispose 全部工具再 `if (!live.enabled) return`（`src/index.ts:1120-1125`）、公告撤下（`:2074`）、除 `/config` 外数据路由 403（`:2364`），都由 `settings/updated` 触发；同包的 `route-smoke.mjs:968,1000` 断言的正是热路径，同文件 `:46-47` 也写着「保存即热生效」——文档自己和自己、和测试互相打脸（只有「路由对象本身不卸载、靠 403 拦」这半句与实现一致）。修法：中英各两处改为「保存即热生效：工具立即注销、公告撤下、除 `/config` 外的数据路由 403，`/config` 始终可读写（设置卡片是恢复入口）」。

**D76｜P3｜README 的离线回归项数过期**｜`README.md:761`、`:772`、`:782`；`README.en.md:803`、`:814`、`:826`｜文档写 smoke 35（英文 33）/ route-smoke 54 / client-smoke 27，实测分别是 **36 / 60 / 62**（client-smoke 差 2.3 倍），中英还互相不一致。修法：删掉硬编码项数（脚本尾部已自报），或与脚本同步。

**D77｜P3｜README 把本包 vitest 说成「三套」**｜`README.md:746`、`README.en.md:800`｜实际 6 套 103 例；未提及的 `config-route`(11) / `current-session`(7) / `session-target`(17) 恰好是「Windows 盘符」「DSH 0.1.6 会话形状」「连接簿 host 兜底」三个已修 bug 的守门用例。修法：改为「6 套 / 103 例」并点名三套。

**D78｜P3｜README 说「agent 侧只有 7 个只读工具」**｜`README.md:817`、`README.en.md:870`｜实际恒注册 11 个（`docker_targets/ps/attention/inspect/logs/stats/events/images/image_inspect/networks/volumes`），README 自己的工具表与 `route-smoke.mjs:345-348` 都断言 11 个。修法：改成 11（或写「数量以工具表为准」）。

**D79｜P3｜README 排版残迹**｜`README.md:641`、`:523`；`README.en.md:688`｜`:641` 有一整句被重复粘贴（`…但 \`stats\` 与- **podman 兼容靠 dockerBin**…` 断在同一行），英文同款；`:523` 的反引号错位（``字段与 `/`stats` 快照完全一致``）。修法：删重复半句、修反引号。

## 待办 / 路线图（修复后剩余部分）

> 下面是**规划**，不是缺陷 —— 单人项目不另开 Issue，待办记在这里，做完打勾。

- ~~**D51 残留：`docker_action.action` 的 `enum`**~~ —— 已修（第二轮修复记录）：`enum: ['start','stop','restart','remove']`
  进了参数 schema（实测 DSL 支持 `enum`，不支持的是 `minimum`/`maximum`）。边界夹紧的回显仍未做。
- **`ProxyJump` / `ProxyCommand`（跳板机）** —— `buildConnectConfig` 从不设 ssh2 的 `sock`，企业内网主机几乎都要过 bastion（与 `packages/tty/DEFECTS.md` 的待办第 1 条同一个缺口）。短期至少做到：配了跳板机的目标连不上时给出明确文案，而不是 20s 后一句通用超时。
- **agent 侧的网络 / 卷变更工具** —— 面板有 `networks/remove|prune`、`volumes/remove|prune` 的按钮，agent 侧一个都没有（当前是有意为之：这类删除最容易误伤）。若要做，必须与面板同一把 `allowMutations` 闸门 + 破坏性后果复述；DRAFT 之前不要绕过面板。
- **日志渲染性能（D63 的根治）** —— `logStats` 记忆化与 `content-visibility` 窗口化已随 D63 落地；完整虚拟滚动（DOM 节点数与缓冲行数解耦）与「按时间」重排彻底脱离窗口边界仍是可选的下一步。
- **跨目标聚合的取消语义** —— `aggregateAcrossTargets` 的 45s 超时只 `race`，不 `abort` 底层命令（`mapLimit` 之后那次 docker 调用会继续跑完）。要么把 AbortSignal 串下去，要么在文案里说明「超时的目标仍在后台执行」。
- **一次性 token 收紧变更端点** —— D32 已要求同源证明，但信任模型仍是 loopback-only（任何本机进程都能先 `POST /config {allowMutations:true}` 再调 `/action`）。docker socket 等价目标主机 root，值得给变更类端点加一次性 token（tty / dsh-mcp 同款问题）。
- **`isConcurrencySafe` 未声明** —— 所有 `docker_*` 工具都被宿主当作独占而串行化，只读工具（`docker_ps` / `docker_logs`）本可并行。这是本仓库各插件的共性（tty/codegraph 同样未声明），要改建议一起。
- **面板端 i18n** —— `README.en.md` 与中文版手工同步，已经出现中英项数不一致（D76 的计数文案已删，此类风险仍在）。
- **tty / dsh-mcp 的 loopback 围栏同款 widening** —— docker 的 D31（127/8 + DNS 别名）与 D32（同源证明）修完，tty 与 dsh-mcp 还是旧口径，建议同步。

## 建议批次

| 批次 | 内容 | 状态 |
|---|---|---|
| 0.6.5 | D01–D16（全部 P1 + 服务端/SSH/解析层的 P2） | ✅ 已修 |
| 0.6.6 | D17–D24、D54–D62、D65–D67、D69、D75–D79（客户端 P2/P3 + 文档） | ✅ 已修 |
| 0.6.7 | D26–D30、D33–D53（边界、解析口径、工具描述与 schema） | ✅ 已修 |
| 0.7.0 | D25、D31–D32、D63–D64、D68、D70–D74（工程闸门 + 硬化 + 性能） | ✅ 已修 |

四个批次已于 2026-09-19 全部完成（见文首「修复记录」）；发版流程见 `RELEASING.md`。

## 复核方式（第二轮修复后基线，2026-09-19）

- **单测与静态检查**：`npx vitest run packages/docker`（**7 套 127 例**——`ssh-connect.test.ts` 覆盖
  TOFU 三分支 / buildConnectConfig 四态（含「有 agentForward 无 agent」的降级）/ 凭据接线 /
  `expandHome` / `assertSince` 六类输入 / 区间端口 / attention 的分块与补捞 / 建连失败不留池条目）、
  `npx tsc --noEmit`、`node scripts/client-lint.mjs`（通过，忽略 7 条已知噪音 TS2307×4 + TS2339×3；
  锚点已放宽到全部 client-src 模块，D74）。
- **旗舰脚本**（都需先 `pnpm --filter @hyzyn/dsh-docker build`，它们读 `lib/`）：
  `node scripts/smoke.mjs`（40/40）、`node scripts/route-smoke.mjs`（60/60，**hermetic 后实测 0.7s**，
  D25）、`node scripts/client-smoke.mjs`（**65/65**，含新增的三条总览截断/降级断言，实测 0.6s）。
  三套均已进 CI（ubuntu-only step，D70）+ 发布闸（D119）并带看门狗（D71：单用例 **25s** + 全局 90s，
  末尾 `process.exit` 保证退出，D121/D122）。
- **产物与源码一致**：CI 闸门（`pnpm -r build` 后 `git diff --exit-code`）照旧；本轮修复后
  `lib/` 与 `client.js` 已重建，并用内存重建逐字节复核（`client.js` 229759 字节，`identical: true`）。
- **真机验收**：需要真 docker daemon 的条目（D33 的多容器 stats 去重、D40/D102/D103 的端口区间输出形状、
  D11/D87/D106 的 crash-loop 实机形态）仍见 README 的「手工验收」一节；本机 daemon 未运行，
  附录 C 中其余「待验证」项的可达性仍未实测。
- **仅测试/排障用的开关**：`DSH_DOCKER_CONNECT_TIMEOUT_MS`（覆盖 SSH 建连超时，默认 20s；用于让
  「不可达目标」的路径在毫秒级被单测覆盖，D122）。
- **本轮独立复核（2026-09-19，修复波的第三方复核）**：
  ① **审计原文**：带行号锚点的 **77 条**（D71/D72 只写了文件、无行号）逐条回填
  `git show d09e40dc:<path>` 核对（**全部命中，无漂移**）；正文中的可证伪数字抽验通过（`code.includes(` 67 处、`targetParam` 13 处引用、
  `cacheAt` 4 处赋值 0 处读取、`smoke.mjs:219` 的零值时间样本、workflows 对 docker 零引用、
  `ssh2/lib/client.js:203/243/261/267` 的同步抛错、以及 D73 的零覆盖清单——`resolveSecretVia`
  有 10 处引用而 `resolveSecret` **0 处**）。
  ② **修复声明**：重跑回归 = vitest **7 套 119 例**、`tsc --noEmit` 与 `client-lint` 通过、
  `smoke` **40/40**、`route-smoke` **60/60（实测 0.57s）**、`client-smoke` **62/62**，
  与本节数值一致；再抽验实现：D01（inflight 计数）/ D02（先占坑再 await 建连配置）/
  D05+D06（`dropConn(key, client)` 身份校验 + `settleError` 同时摘条目与 `end()`）/
  D07（配额文案移出 `isTransportError`、重连前 `end()`）/ D08（`ByteSink` + `StringDecoder`）/
  D09（按 enabled/dockerBin/targets 差异才收流）/ D10（并集合并 + `hostKeysRemove`）/
  D11（阈值 3 + 2 分钟新鲜度）/ D12+D42（`{items,total,truncated,degraded}`，先排序后截断）/
  D13（`assertComplete` 截断即抛）/ D14（`keepTail` 真截头）/ D15（按连接身份继承凭证）/
  D16（pull 超时抛错）/ D17+D18（`active` 进 deps）/ D19 / D20 / D25（`127.0.0.1:1`）/
  D31（127/8 + IPv6 + 别名异步 DNS）/ D32（同源证明）/ D37（路由层 400）/ D41（零值时间归 null）/
  D45（`assertSince` 两处共用）/ D51（描述收紧）/ D63（`useMemo` + `content-visibility`）/
  D66（`TARGETS_CACHE_TTL_MS`）/ D70 / D71（15s + 90s 看门狗）/ D72 / D74（锚点放宽）/
  D75 / D78 / D79 —— 全部落地。
  ③ **唯一的更正**：文首 D51 关于 `enum` 的说明（实测 `enum` 受支持，`minimum`/`maximum` 不支持）。
  ④ 复核同时修正了本文件的 6 处小问题：`ci.yml:71-92 → :71-91`（基线 91 行）、附录 A 的
  「21 条路由」→ 26 条（20 + `/config` + `/targets`）、建议批次的区间重叠（四个集合现互不重叠、
  合计 79）、附录 B 的「工作树干净」加上审计时点限定、D13 的「必然截断」措辞、D71 的「全文件无超时」措辞。
- **第二轮修复的验证（2026-09-19，修完即跑）**：三路并行改三个文件（`ssh-exec.ts` / `docker.ts` /
  `client-src`）+ Lead 改 `src/index.ts`、`scripts/`、`.github/workflows/release.yml`、`package.json`、
  `test/`、README（写作用域互不重叠），改完由 Lead 统一重建产物并跑全套：
  **vitest 7 套 127 例 / tsc / client-lint / smoke 40/40 / route-smoke 60/60 / client-smoke 65/65 全绿**，
  `client.js` 与内存重建逐字节一致。P1 两条另有独立复现：D80 用控制流复刻（别名 Host 在修复前 →
  `true`）、D81 用真 `ssh2@1.17.0` 观察 `connect()` 的同步抛错（修复前抛、修复后不抛且不设
  `agentForward`）。修完后自查还发现并修掉两处**修复自身的瑕疵**：`attentionInspectBatch` 在
  `maxOutputKb=1KB` 时会退化成每批 1 个（加了 8 的下限把调用次数限住）、route-smoke 里那条
  `since` 旧文案断言（D99 改了文案，断言同步更新）。

## 第二轮：修复波的复核缺陷（D80–D125）

> **状态：本节 46 条已全部修复**（2026-09-19 同日，见文首「第二轮修复记录」）。下面保留审计时点的原文。
>
> **性质**：这不是新代码的「功能不全」，而是**修复波自身**的问题 —— 第一轮的 D 号有 29 条只修了一半
> （症状仍在，只是换了入口），另有 16 条是修复改变行为后**新引入**的失败路径，另 1 条是身份归一
> 没跟上的边界项。编号接着 D79 往下排（与第一轮同一份文档、同一套严重度口径）。
>
> **怎么做出来的**：5 路并行只读审计（`git diff d09e40dc` 的改动面：`ssh-exec.ts` / `docker.ts` / `index.ts` /
> `client-src` / 脚本·测试·CI·文档），每路都读改动后的**完整函数体**而不只看 hunk；再由 Lead 逐条复读源码
> 验证，并对 P1/P2 做运行时复现（DNS 围栏控制流复刻、`ssh2` 同步抛错、`attention` 300/320 候选、
> 单批 inspect × 512KB、`runLocal` 的 `keepTail` 取尾、`ByteSink` 边界、看门狗排空计时）。
> 修复波的全绿基线（vitest 7 套 119 例、smoke 40/40、route-smoke 60/60、client-smoke 62/62、`tsc`、
> `client-lint`）**仍然成立** —— 第二轮 46 条里有相当一部分正是这些测试**照不到**的地方。

### 第二轮索引

| D | 严重度 | 症状（一句话） | 位置 | 性质 |
|---|---|---|---|---|
| D80 | P1 | 别名 Host 走异步分支时提前 `return`，`cross-site`/Origin 检查被整段跳过 → 围栏被绕过 | src/index.ts:372-383 | 新引入（D31） |
| D81 | P1 | `agentForward: true` + 宿主无 `SSH_AUTH_SOCK` → ssh2 同步抛错，该目标每次都连不上 | src/ssh-exec.ts:718-720 | 新引入（D28） |
| D82 | P2 | 保存飞行期间删除的主机指纹被静默丢弃：钉扎删不掉，UI 却显示已删 | client-src/index.js:5636-5683 | 新引入（D10×D22） |
| D83 | P2 | `finish()` 清空背压队列：`end`/队尾帧被丢，慢客户端重连并**重拉镜像** | src/index.ts:1074-1087 | 新引入（D04） |
| D84 | P2 | 关掉「允许变更操作」不终止在途的镜像拉取流 | src/index.ts:1168-1170 | 新引入（D09） |
| D85 | P2 | attention 候选 >300 时第 301 条起没有 inspect 详情，`degraded` 仍为 false | src/docker.ts:1158-1165,1217 | 新引入（D11/D12/D42） |
| D86 | P2 | 300 id 单批 inspect × 默认 512KB：一截断就**整批**降级，D11 判据整体失效 | src/docker.ts:1160,1100-1105 | 新引入（D13×D11） |
| D87 | P2 | crash-loop 补捞预算被合法候选吃光 → D11 在最需要时不出手且零信号 | src/docker.ts:1149-1153 | 修复不完整（D11） |
| D88 | P2 | `stream()` 的 `busy` 记在重连前的废条目上：配额失效 + 长流 120s 后被 sweeper 掐断 | src/ssh-exec.ts:456-467 | 修复不完整（D26/D01） |
| D89 | P2 | D35 新增的「无效条目已丢弃」warning 是死代码，永不触发 | src/index.ts:2705-2714 | 修复不完整（D35） |
| D90 | P2 | D21 只推 `config` 不推目标列表：下拉里有已删目标、缺新目标 | client-src/index.js:4128-4134,4211 | 修复不完整（D21） |
| D91 | P2 | `content-visibility` 让 `scrollHeight` 变估算值 → FOLLOW 贴底失效、「回到底部」也回不到底 | client-src/docker.css:1116-1123 | 新引入（D63） |
| D92 | P2 | 聚合日志重建流时不复位 `atBottom`（D61 只做了一半） | client-src/index.js:3469-3474 | 修复不完整（D61） |
| D93 | P2 | 重连补偿改走共享尾沿防抖，事件密集时被无限取消 | client-src/index.js:4620-4626 | 新引入（D62） |
| D94 | P2 | 占位条目在建连途中被摘掉后，`ready` 仍 resolve 出一条脱管连接 | src/ssh-exec.ts:620-651 | 修复不完整（D02） |
| D95 | P2 | `closePanel()` 管不到 tab 实例：从连接栏进入仍可并存两个面板 | client-src/index.js:5856-5882 | 修复不完整（D24） |
| D96 | P2 | 新安全闸门的拒绝分支零回归（删掉调用，三套脚本 + 119 例仍全绿） | scripts/route-smoke.mjs:268 | 修复不完整（D32/D70） |
| D97 | P3 | `/action`、`/stats`、`/exec`（空 command）仍回 500 而非 400 | src/index.ts:2869-2879 | 修复不完整（D37） |
| D98 | P3 | `POST /logs` 的 `since` 仍未过 `assertSince`；空串在工具侧报「必填」、在 SSE 侧被忽略 | src/index.ts:2920 | 修复不完整（D45） |
| D99 | P3 | `assertSince` 与 docker 口径两向不吻合（`1.5h`/`0` 被拒，裸日期被放行） | src/docker.ts:179-185 | 修复不完整（D45） |
| D100 | P3 | 单目标 `docker_attention` 的渲染丢 `total/truncated/degraded` | src/index.ts:1639-1641 | 修复不完整（D12/D42） |
| D101 | P3 | 面板与 `/attention` 路由都没接 `total/truncated/degraded`，计数静默 ≤100 | src/index.ts:2891-2893 | 修复不完整（D12） |
| D102 | P3 | `parseInspectPorts` 仍整段丢弃区间端口（详情比列表少端口） | src/docker.ts:1003-1010 | 修复不完整（D40） |
| D103 | P3 | 区间端口字段无任何消费方：显示成单端口（`8000→8000/tcp`） | src/index.ts:1537 | 修复不完整（D40） |
| D104 | P3 | `imageInspect` 的两段 `docker history` 从不检查 `truncated` | src/docker.ts:1314-1332 | 修复不完整（D13） |
| D105 | P3 | `assertComplete` 把「静默部分结果」变成「整体失败」，文案对 agent 不可执行 | src/docker.ts:1100-1105 | 新引入（D13 代价） |
| D106 | P3 | `FRESH_UP_RE` 只认 ≤59 秒，与 `ATTENTION_FRESH_MS`（120s）不一致 | src/docker.ts:271,1152 | 新引入（D11） |
| D107 | P3 | `refreshTools` 半套注册 + D09 差异判定 → 重存同一配置不自愈 | src/index.ts:2759-2768 | 修复不完整（D36） |
| D108 | P3 | `sameTargets` 按下标比较：仅顺序变化即收流 | src/index.ts:1139-1154 | 修复不完整（D09） |
| D109 | P3 | `hostKeysRemove` 与并集顺序：同一请求的删除被撤销；非法形状静默忽略 | src/index.ts:2721-2734 | 修复不完整（D10） |
| D110 | P3 | 请求路径内的 DNS 判定无超时、无缓存，且发生在写响应之前 | src/index.ts:346-355 | 新引入（D31） |
| D111 | P3 | `poolKey` 未小写化：同一主机建两条连接，通道额度被悄悄翻倍 | src/ssh-exec.ts:195-197 | 边界 |
| D112 | P3 | `run()` 的 `inflight` 只靠 channel 事件释放，超时定时器不兜底 → 连接永不回收 | src/ssh-exec.ts:386,439-441 | 新引入（D01） |
| D113 | P3 | 数字输入框无法「清空再重打」（空串被整数正则拒绝） | client-src/index.js:5715 | 新引入（D69） |
| D114 | P3 | `sessionScoped` state 化后，`deps: []` 的挂载 effect 仍读首帧闭包 | client-src/index.js:4207,4230 | 修复不完整（D23） |
| D115 | P3 | README 的 `hostKeys[]` 表仍是单数 `fingerprint` | README.md:429-435 | 修复不完整（D03） |
| D116 | P3 | README 路由表 `/attention` 行仍是旧形状（只有 `items`） | README.md:484 | 修复不完整（D12/D42） |
| D117 | P3 | README 未记录 D32 收紧的行为（缺同源证明 → 403） | README.md:471-475 | 修复不完整（D32） |
| D118 | P3 | README 的 vitest 清单仍写「六套」，漏掉本波新增的 `ssh-connect` | README.md:747 | 修复不完整（D77） |
| D119 | P3 | CI 补了、**发布闸没补**：`release.yml` 仍零执行三套脚本 | .github/workflows/release.yml:29-44 | 修复不完整（D70） |
| D120 | P3 | `files` 加了 `scripts` 仍不够：`client-smoke` 读未发布的 `client-src/` → `npm run smoke` 仍坏 | packages/docker/package.json | 修复不完整（D72） |
| D121 | P3 | 三套看门狗在主体结束即 `clearTimeout`，退出前的排空期失去保护 | scripts/client-smoke.mjs:1812 | 修复不完整（D71） |
| D122 | P3 | 建连超时路径脚本/单测双双归零，且 15s 用例上限 < 20s 建连超时 | scripts/route-smoke.mjs:33-37 | 修复不完整（D25/D71） |
| D123 | P3 | 本波新行为（`inflight`/`keepTail`/无 sock 的 `agentForward`/`assertSince`）零自动化覆盖 | test/ssh-connect.test.ts | 修复不完整（D73） |
| D124 | P3 | 新测试里 `auth=key` 用例名与断言不符（实际走 password 分支） | test/ssh-connect.test.ts:112-116 | 新引入 |
| D125 | P3 | README（中）两处删「（N 项）」时吃掉了后面的空格 | README.md:773,783 | 新引入（排版） |

### 第二轮 P1 详情

#### D80｜P1｜别名 Host 走异步分支时提前 return：cross-site / Origin 检查被整段跳过

- **位置**：`src/index.ts:372-383`（`isLoopbackHttp`）
- **证据**：
```ts
const literalLoopback = hostname === 'localhost' || hostname.endsWith('.localhost') || isLoopbackAddress(hostname)
if (!literalLoopback) return hostResolvesToLoopback(hostname)   // ← 直接 return，下面两段检查永远不跑
if (req.headers['sec-fetch-site'] === 'cross-site') return false
const origin = req.headers.origin
if (origin === undefined) return true
try { return new URL(origin).host === hostUrl.host } catch { return false }
```
- **触发场景**：恶意页面向 `http://127.0.0.1.nip.io:3080/api/dsh-docker/config` 发简单请求（`text/plain` + JSON 体，无预检）。
  `.nip.io` / `.sslip.io` 是公共泛解析域名，解析到 127.0.0.1；`/etc/hosts` 别名同理 —— 而后者正是 D31 想支持的部署形态。
  Lead 复刻该函数控制流实测：`Host: 127.0.0.1:3080` → false、`localhost:3080` → false、**`127.0.0.1.nip.io:3080` → true（cross-site + 异源 Origin 全被跳过）**。
- **影响**：把 D31 原本要修的「别名导致 403」翻成了「别名绕过整个围栏」。`MUTATION_SUBROUTES` 的 8 条与四条 SSE 仍由独立的
  `hasSameOriginProof` 挡住，**唯独 `/config` 不要求同源证明**（它又能打开 `allowMutations`/`allowExec`、改 targets、
  删主机指纹）→ 能力开关的写入点成了跨站可写面；旧代码（`d09e40dc`）对非白名单 Host 一律 false，所以这是**变宽**。
- **修法**：把两段检查提到 DNS 之前（先判 `cross-site`、再判 Origin，最后才 `return literalLoopback ? true : hostResolvesToLoopback(hostname)`）；
  建议别名改成显式 allowlist 而不是「任何解析到本机的主机名」。
- **置信度**：高（代码路径 + 控制流复现；现有测试只构造字面量 Host，异步分支零覆盖）。

#### D81｜P1｜`agentForward: true` + 宿主无 `SSH_AUTH_SOCK` → 该目标每次都连不上

- **位置**：`src/ssh-exec.ts:714-720`（`buildConnectConfig`）
- **证据**：
```ts
if (spec.agentForward === true && process.env.SSH_AUTH_SOCK !== undefined && process.env.SSH_AUTH_SOCK !== '') {
  base.agent = base.agent ?? process.env.SSH_AUTH_SOCK       // 上一行刚判过「有没有 agent」
}
if (spec.agentForward === true) base.agentForward = true     // ← 这里却无条件设，没复用同一个判定
```
  ssh2 1.17 在 `connect()` 里硬校验（`node_modules/.pnpm/ssh2@1.17.0/…/lib/client.js:225-246`）：
```js
this.config.allowAgentFwd = (cfg.agentForward === true && this.config.agent !== undefined);
if (cfg.agentForward === true && !this.config.allowAgentFwd) throw new Error('You must set a valid agent path to allow agent forwarding')
```
- **触发场景**：面板勾了「转发本机 ssh-agent」，而 `dsh web` 是从没有 `SSH_AUTH_SOCK` 的环境起来的（launchd / systemd / GUI 启动、Windows 宿主）。
  `auth=agent` 会被 D29 的预检挡住并给出可读文案；**`auth=key` / `auth=password` 时 `base.agent` 是 `undefined`，直接落进 ssh2 的抛错**。
- **影响**：`client.connect()` 同步抛 → `settleError` → 该目标**每一次**操作（列表 / inspect / 日志 / 拉取）都失败，
  错误是裸英文 `You must set a valid agent path to allow agent forwarding`。D28 从「配置等于没配」翻成了「配置即不可用」，
  而 README 的承诺是「`SSH_AUTH_SOCK` 存在时生效」（不存在应静默降级）。
- **修法**：`if (spec.agentForward === true && base.agent !== undefined) base.agentForward = true`，缺 sock 时 `logger.warn` 一行说明声明被忽略。
- **置信度**：高（源码 + ssh2 校验 + 运行时复现：无 sock 时 `connect()` 同步抛，无 `agentForward` 时正常）。

### 第二轮 P2 详情

#### D82｜P2｜保存飞行期间删除的主机指纹被静默丢弃

- **位置**：`client-src/index.js:5636`（入队）、`:5673`（组包）、`:5678`（响应处理无条件清空）
- **证据**：payload 组包时带上 `hostKeysRemove: removedHostKeysRef.current`；响应回调第一行就是 `removedHostKeysRef.current = []`，
  而 `setForm` 只在「无新编辑」时才同步（D22）。飞行期间新入队的删除项既没进这次 payload、又被清掉 → 下一次保存也带不上。
- **影响**：`hostKeysRemove` 是**唯一**的删除通道（D10 后不再整表回传 hostKeys）→ 服务端钉扎永远删不掉，而界面显示记录已消失、
  回执是「已保存并热生效」，重开卡片记录又回来。属安全相关的静默失败（用户以为删掉了可疑指纹）。
- **修法**：只清「已经发出」的那批（`removedHostKeysRef.current = removedHostKeysRef.current.slice(sent.length)`），或改用集合并按 `{host,port}` 逐条摘除。
- **置信度**：高。

#### D83｜P2｜`finish()` 清空背压队列：终止帧被丢，慢客户端重连并重拉镜像

- **位置**：`src/index.ts:1074-1087`（`finish`）、`:1098-1113`（`send`/`flushPending`）
- **证据**：`send` 在 socket 写缓冲满时把帧入队等 `drain`；而收尾路径 `finish()` 是 `pendingFrames = []; …; res.end()` ——
  已入队但从未 `write()` 的帧不会被 `end()` 刷出。实测 `res.write` 确实返回 false 且 `'drain'` 会触发（`writes=4 false=4 drain=3`）。
- **触发场景**：慢客户端（后台标签 / 慢链路）+ 输出密集的 `docker pull` 或 `docker logs -f` 收尾：
  最后一帧写入返回 false → 队列非空 → 执行器 resolve → `end` 帧入队 → `finish()` 清队列 + `res.end()`。
- **影响**：客户端拿不到终止帧；拉取进度流靠 `end` 帧判完成（`client-src/index.js:3046` 的 `setRunning(false)`），
  丢帧后连接直接关闭 → EventSource 自动重连 → 服务端**重新拉一次镜像**（慢客户端可循环）。
- **修法**：收尾前先落地队列（`res.end(pendingFrames.join(''))`，`ResLike.end` 已支持 body），或把 `send` 的队列排空后才 `finish()`。
- **置信度**：高（机制可证）；「重连 → 重拉」这一后果置信度中（已读客户端代码，未跑慢链路真机）。

#### D84｜P2｜关掉「允许变更操作」不终止在途的镜像拉取

- **位置**：`src/index.ts:1168-1170`（`applySection` 的收流条件）、`:2598-2602`（pull 流门禁）
- **证据**：收流条件只看 `enabled` / `dockerBin` / `targets` 差异；旧代码是首行无条件 `closeAllStreams()`，所以当时关开关会连带 abort 在途 pull。
- **影响**：能力开关不是即时 kill switch —— 关掉之后，已建立的 `/images/pull/stream` 仍会跑完并继续写目标机镜像存储、占带宽。
  与 `refreshTools` 注释里「运行期关掉也要立刻生效」的语义不一致；测试只覆盖「插件禁用（enabled=false）统一收尾」。
- **修法**：把 `allowMutations` 纳入收流条件（尤其 true→false），或在 pull 流的 `run` 里挂「开关撤销即 abort」的检查。
- **置信度**：高。

#### D85｜P2｜attention 候选 >300 时第 301 条起没有详情，却仍宣称权威

- **位置**：`src/docker.ts:1158-1165`（`inspect` 只取 `picked.slice(0, ATTENTION_INSPECT_CAP)`）、`:1217`（`degraded` 只看整批抛错）
- **证据**：`items = picked.map(...)` 用的是**全部**候选，`details` 只有前 300 条；`degraded` 仅在 `inspect` 整批抛错时为 true。
  运行时复现（320 个 `Exited (143)` + 最后一个才是真 OOM）：`items=320 / total=320 / truncated=false / degraded=false`，
  真 OOM 的 `reasons=['exit-nonzero']`、`oomKilled=false`、排名 320/320；默认 `limit=100` 时它根本不在返回里。
- **影响**：① `degraded=false` 明确宣示「权威数据齐全」，实际有 N−300 条是摘要口径 —— D42 想消灭的「分不清『没有 OOM』与『没取到』」原样复活；
  ② D12 的「先按严重度排序再截断」在这批数据上失效（OOM 权重 0 被降级成 4 → 排最后 → 正好被 limit 切掉）。
- **修法**：把「未取到详情」也算作降级（`uninspected > 0` → `degraded=true` 并回传计数）；更好的做法是分块 inspect（见 D86）。
- **置信度**：高（运行时复现）。

#### D86｜P2｜300 id 单批 inspect × 默认 512KB：一截断就整批降级

- **位置**：`src/docker.ts:1160`（单批 300 个 id）、`:1100-1105`（`assertComplete` 截断即抛）
- **证据**：`512KB ÷ 300 ≈ 1.7KB/容器`，而真实容器的 inspect JSON 普遍 2–6KB（Config/Labels/Mounts/NetworkSettings/HostConfig）
  → 候选上百的主机必然截断 → `inspect` 抛错 → `attention` 的 `catch` 把**整批**降级，所有条目的 `restartCount=null`、`oomKilled=false`。
  修复前只是「尾部详情被静默丢弃」，现在是「全部详情一起丢」。
- **影响**：又忙又乱的主机上 `docker_attention` 退化成纯摘要口径（OOM 全变 exit-nonzero、反复重启全漏报），
  而 D11 的 crash-loop 判据恰恰只在候选很多的忙主机上才需要。
- **修法**：分块 inspect（每批 32–50 个 id 或按字节预算切），每批独立 try/catch 并把失败批记入 `uninspected`；
  或至少给这一次批量 inspect 单独更大的 `maxBytes`。
- **置信度**：高（机制与体积关系确定；「100–170 个候选起触发」是估算）。

#### D87｜P2｜crash-loop 补捞预算被合法候选吃光

- **位置**：`src/docker.ts:1149-1153`
- **证据**：补捞循环的条件是 `if (picked.length >= ATTENTION_INSPECT_CAP) break` —— 预算与「原有三类候选」共用同一个 300。
  运行时复现：300 个 `Up 3 days (unhealthy)` + 1 个 `Up 5 seconds`、`RestartCount=20` 的 crash-loop 容器 →
  补捞容器**根本没进 inspect**，`items=300 / total=300 / truncated=false / degraded=false`，结果里没有它。
- **影响**：主机越乱越查不出 crash-loop，与「反复重启最容易被忽略」的初衷相反；三个信号都不体现「还有 K 个刚启动的容器没被检查」。
- **修法**：给补捞独立预算（如 `ATTENTION_FRESH_BUDGET=50`），并把因预算丢弃的补捞候选数并入返回体。
- **置信度**：高（运行时复现）。

#### D88｜P2｜`stream()` 的 `busy` 记在重连前的废条目上

- **位置**：`src/ssh-exec.ts:456-467`（对照 `run()` 的 `:384-386`）
- **证据**：`stream()` 先 `const rt = this.conns.get(poolKey(spec))`、再 `rt.busy += 1`，**之后**才 `openChannel`；
  而 `openChannel` 在传输错误时会 `dropConn + end()` 并**另建连接**。用假 ssh2 Client 复现（首次 `exec` 回 `connection lost`）：
  `exec 调用次数 = 2`，池里那条活连接的 `busy=0` —— 计数留在被摘掉的旧条目上。
- **影响**：① `streamBudgetError` 少算 → `MAX_STREAMS_PER_TARGET` 的 fail-closed 保护在这条路径失效；
  ② `shouldRecycleConn` 看的是活连接的 `busy/inflight`（都是 0）→ 120s 后 sweeper 把**用户正在看的 `docker logs -f`** 掐断，
  正是 D01 要消灭的那类症状；`release()` 也只刷新废条目的 `lastUsed`。
- **修法**：把计数挂到可变的 holder 上，`openChannel` 返回后按现取条目搬家（配额判定仍留在 open 之前，否则被拒的流已经开了通道）。
- **置信度**：高（机制已复现；触发条件就是 D07 重试的既定场景）。

#### D89｜P2｜D35 的 warning 是死代码

- **位置**：`src/index.ts:2705-2714`
- **证据**：`rawTargets` 与 `keptTargets` 都取自 `mergeTargetSecrets` 前后长度，而它是 1:1 的 `map`（从不丢条目）→ `rawTargets > keptTargets` 恒为 false。
  运行时复现：`mergeTargetSecrets(prev, [重名, 空名, 超64, 正常])` 4→4；同一输入 `sanitizeTargets` → 1（丢弃发生在之后）。
- **影响**：D35 想补的「另一台主机凭空消失」信号完全没接上 —— 仍是一次静默丢弃，下一次保存把结果固化。
- **修法**：用真正会丢弃的口径计数（`sanitizeTargets(patch.targets)?.length` 或 `normalizeConfig(dryRun).targets.length`）。
- **置信度**：高（运行时复现）。

#### D90｜P2｜D21 只推 `config`，没推目标列表

- **位置**：`client-src/index.js:4128-4134`（`configSubscribers` 只 `setConfig`）、`:4211-4214`（`/targets` 只在挂载时拉一次）、`:5245-5252`（下拉数据源）
- **证据**：`notify` 里只有 `setConfig(next)`；面板的目标下拉读的是 `targets` state，唯一来源是挂载时那次 `api.targets()`（deps `[]`）。
- **影响**：面板保持挂载（dock / 右侧栏标签）时在设置卡片增删目标 → 新目标在下拉里不存在（切不过去），已删目标仍在列表里，
  选中即被后端拒成「未知目标」+ 错误横幅 —— 正是 D19 修掉的那一类错配，只是入口换成热配置。
- **修法**：`notify` 里顺带用 `next.targets` 更新选择器数据源，或让面板在 config 引用变化时重拉一次 `/targets`。
- **置信度**：高。

#### D91｜P2｜`content-visibility` 让 `scrollHeight` 变估算值，打穿 FOLLOW 贴底

- **位置**：`client-src/docker.css:1116-1123`；消费方 `client-src/index.js:2073`、`:2120`、`:3447`、`:3451`
- **证据**：
```css
.dk_logLine { …; content-visibility: auto; contain-intrinsic-size: auto 19px }
```
```js
body.scrollTop = body.scrollHeight                                          // 贴底
setFollowAtBottom(body.scrollHeight - body.scrollTop - body.clientHeight < 24)
```
  被跳过渲染的行按 19px 估算，折行长行实际 38px 起；`scrollTop = scrollHeight` 落在估算底部，且全文件没有二次测量。
- **影响**：贴底到不了底 → `atBottom` 被判 false → 自动跟随静默停止、「回到底部」常驻且点了也回不到底；
  单容器 FOLLOW 与聚合日志两条路径同时中招 —— 而 FOLLOW 的全部价值就是贴底看最新行。
- **修法**：贴底改两趟（`scrollTop = scrollHeight` 后在 `requestAnimationFrame` 里复测一次，最多 2 轮）；
  或日志行不用 `content-visibility`，改真窗口化（D63 待办的后半档）。
- **置信度**：中（`content-visibility: auto` 下 `scrollHeight` 是估算值属规范行为；幅度需真机 Chrome 复验）。

#### D92｜P2｜聚合日志重建流不复位 `atBottom`

- **位置**：`client-src/index.js:3469-3474`（对照单容器视图 `:1981` 的 `setFollowAtBottom(true)`）
- **证据**：ComposeLogs 的流 effect 重置了 `entriesRef` / `pendingRef` / `bufferRef` / `entries` / `bufferedCount` / `dropped`，**唯独没有 `setAtBottom(true)`**。
- **影响**：上滚看过历史后改「LINES」/ 换目标 / 换 items → 内容已清空重来，但 `atBottom` 仍是 false → 新日志停在顶部不跟随，
  「回到底部」持续显示（状态行却写着「已连接 N 条容器日志流」）。同一波修复的两个视图行为不一致。
- **修法**：与 `setDropped(false)` 并列补 `setAtBottom(true)`。
- **置信度**：高。

#### D93｜P2｜重连补偿改走共享尾沿防抖，事件密集时被无限取消

- **位置**：`client-src/index.js:4620-4626`（改点）、`:4580-4583`（共享的 500ms 尾沿防抖）
- **证据**：`onopen` 从直接 `load()` 改成 `debounced.schedule()`，而 `onEvent` 每来一条事件也 `schedule()`。
- **影响**：容器多 + healthcheck 时事件持续 >2 条/秒 → 定时器被反复推后 → 重连补偿永远等不到 500ms 静默窗口，列表停在断线前状态。
  而被替换掉的那次直接 `load()` 其实无害：`loadContainers` 有 `listSeqRef` 代际闸（后到者胜），并发两次只是作废一份响应。
- **修法**：重连补偿不要走事件驱动的那个防抖（独立调度带 maxWait，或直接 `void loadContainersRef.current?.()`）。
- **置信度**：中。

#### D94｜P2｜占位条目被摘掉后，`ready` 仍 resolve 出脱管连接

- **位置**：`src/ssh-exec.ts:620-651`
- **证据**：`client.once('ready')` 只挡「本流程已失败/超时」（`if (settled) return`），**没有**「条目仍属于我」的校验（`conns.get(key) === entry`）；
  而 `disposeAll()`（插件卸载）与 sweeper 都可能把占位条目摘掉/`end()`。
- **影响**：调用方拿到一条不在池里的活连接 —— 回收不到、`disposeAll` 再关不掉、keepalive 一直养着；
  `run()` 随后取不到条目，D01 的 `inflight` 保护一并失效。窗口窄（建连途中被摘），但与 D02 的原始症状同形。
- **修法**：`ready` 分支与 `settleError` 都加归属校验（不属于自己就 `destroy()` 后 reject）；`disposeAll` 给 connecting 条目打标记。
- **置信度**：中。

#### D95｜P2｜`closePanel()` 管不到 tab 实例

- **位置**：`client-src/index.js:5856-5882`（`closePanel` 只处理 `root` / `hostEl` / `dockedPane`）、`:6443-6459`（连接栏入口直接 `openPanel`）
- **证据**：D24 的修法只覆盖 `openContainerPanel`；tty 连接栏点「容器」走的是 `openPanel`（内部 `closePanel()` 对 tab 实例是 no-op）→ 挂出 dock 实例。
- **影响**：右侧栏已有 Docker 标签时，dock + tab 两个 `ContainerPanel` 并存，共享模块级 `panelUi`（切视图互相干扰）、
  轮询与事件流各翻一倍 —— 正是 D24 记录的原始症状。
- **修法**：`openPanel` 也先收掉 tab 实例（把 `info.tab.actions.close` 句柄登记到模块变量），或禁止两者并存。
- **置信度**：中。

#### D96｜P2｜新安全闸门的拒绝分支零回归

- **位置**：`scripts/route-smoke.mjs:268`（`makeReq` 无条件带 `origin`）、`test/logs-stream.test.ts:451`、`test/streams.test.ts:112`
- **证据**：`grep -rn "缺少同源证明" test/ scripts/` → **0 命中**；`makeReq` 把 `origin: 'http://127.0.0.1:3080'` 写死进所有请求，
  于是 `hasSameOriginProof()` 的 false 分支（缺 Origin / 异源 Origin → 403）与 `Sec-Fetch-Site: same-origin` 放行分支都不可达。
- **影响**：把 `src/index.ts:2813/2824` 两处调用删掉、或让 `hasSameOriginProof` 恒真，三套脚本 + 119 例单测 + CI 仍**全绿** ——
  而 D32 是本波唯一新增的安全闸门（防 `<img src=…/images/pull/stream>` 这类带副作用的 GET）。
- **修法**：`makeReq` 加 origin 参数（可传「不发头」/「异源」），补 4 条负例/替代分支断言。
- **置信度**：高。

### 第二轮 P3 详情（压缩）

**D97｜P3｜路由层断言漏了 `/action`、`/stats` 与空 command**｜`src/index.ts:2869-2879`｜前移断言只覆盖 inspect/logs/exec(id)/images/networks/volumes 的 8 条；`/action` 的 `body.id`、`/stats` 的 `body.ids[]`、`/exec` 的空 `command` 仍由 `DockerApi` 抛出 → 外层 catch 统一 **500**（客户端错误报成服务端错误）。修法：把这三处并进前移断言，或给整段 switch 包一层「断言类 Error → 400」的映射。

**D98｜P3｜`POST /logs` 的 `since` 没走 `assertSince`**｜`src/index.ts:2920`｜工具（`:1769`）与 `/logs/stream`（`:2404-2411`）都校验了，快照路由仍裸透传 → 非法值变 docker 报错再变 500；`since:''` 在工具侧抛「since 必填」、在 SSE 侧被忽略。修法：三处统一走 `assertSince`，空/纯空白一律视为未传。

**D99｜P3｜`assertSince` 与 docker 口径两向不吻合**｜`src/docker.ts:179-185`｜duration 分支 `^(\d+(ns|us|µs|ms|s|m|h))+$` 拒绝 Go 合法的 `1.5h` 与 `0`；timestamp 分支放行 `2026-09-13`、`2026-09-13 10:00`（非 RFC3339Nano，docker 多半原样报参数错误）。修法：duration 改 `^(?:\d+(?:\.\d+)?(?:ns|us|µs|μs|ms|s|m|h))+$|^0$`，时间戳收紧到 RFC3339，错误里回显原文。**待验证**：放行方向依赖 docker CLI 实现。

**D100｜P3｜单目标 `docker_attention` 渲染丢信号**｜`src/index.ts:1639-1641`｜单目标分支只传 `{target,label,ok,items}`，而 `renderAttention` 的截断/降级提示要求 `total`/`truncated`/`degraded` → 最常见的调用路径上「实际共 N 条、已截断」与「inspect 降级」两段提示都不出现（`*` 路径正常）。修法：把那三个字段一起传进去。

**D101｜P3｜面板与路由都没接 `total/truncated/degraded`**｜`src/index.ts:2891-2893`、`client-src/index.js:772,4387`｜`/attention` 路由不传 `limit`（恒 100），客户端只存 `payload.items` → 面板「需关注」计数恒 ≤100 却标成权威值，截断与降级在 UI 里没有呈现。修法：路由接受并夹紧 `limit`，客户端存整个载荷、计数用 `total`、截断/降级时出提示。

**D102｜P3｜`parseInspectPorts` 仍整段丢弃区间端口**｜`src/docker.ts:1003-1010`｜D40 只改了 `parsePorts`；inspect 的键 `"8000-8005/tcp"` 经 `Number()` 得 `NaN` → `continue`，整段丢（实测 `[]`）→ 详情比列表少一条端口。修法：复用 `parsePortToken`。

**D103｜P3｜区间端口字段无消费方**｜`src/index.ts:1296,1537`、`client-src/index.js:101-102`｜服务端已产出 `hostPortRange`/`containerPortRange`，但列表列、`docker_inspect` 正文、面板三处都只打下界 → `-p 8000-8005:8000-8005` 显示成 `8000→8000/tcp`（看起来更确定、实际是错的）。修法：抽一个 `formatPort(p)` 三处共用。

**D104｜P3｜`imageInspect` 的 `docker history` 不看截断**｜`src/docker.ts:1314-1332`｜两段 history 调用都没有 `assertComplete` 也没有判 `truncated`，`historyError` 仍为 `null` → 层数多的镜像构建历史静默变短，且分不清「就这么几层」与「被截断」。修法：判 `truncated` 后写入 `historyError`（不抛错）。

**D105｜P3｜`assertComplete` 的失败模式与文案**｜`src/docker.ts:1100-1105`｜D13 把「静默部分结果」改成「整体失败」后，`/containers`、`/attention`、`/stats`、`docker_ps`、`docker_events` 在大输出时直接 500/抛错；文案只让「调大 maxOutputKb」，而 agent 改不了插件设置（能做的是缩小 `since`、`all=false`、只查 ids），也没回显当前上限。修法：按方法给可执行替代并带上当前上限与 label；列表类可考虑「部分结果 + 显式 truncated」。

**D106｜P3｜`FRESH_UP_RE` 与 `ATTENTION_FRESH_MS` 不一致**｜`src/docker.ts:271,1152`｜摘要窗口是 `/^up (less than a second|\d+ seconds?)( \(|$)/i`（<60s），判据却允许 120s；docker 的 `Up About a minute`（60–119s）不匹配 → 「跑 1–2 分钟才崩」的 crash-loop 在运行阶段一次都不会进 inspect。修法：把 `about a minute` 纳入 RE，或直接解析 `runningFor` 成秒。

**D107｜P3｜`refreshTools` 半套 + 差异判定 → 重存不自愈**｜`src/index.ts:2759-2768`、`:1357-1370`｜`tools.register` 抛错时 `applySection` 抛 500，而 `refreshTools` 是「先全拆再注册」→ 只留半套工具；此时 `live` 与盘上配置都是新值，用户按提示重存**同一份**配置时 D09 的差异判定不会再触发 `refreshTools()` → 半套状态一直缺到重启。修法：注册失败保留旧工具集，或 POST 路径在 applySection 后无条件再跑一次幂等的 `refreshTools()`。**待验证**：可达性依赖 `tools.register` 抛错。

**D108｜P3｜`sameTargets` 按下标比较**｜`src/index.ts:1139-1154`｜`a.every((item, i) => … === b[i])` → 同一批目标仅**顺序**变化即判「目标变了」→ `closeAllStreams()`（在途 pull 会被 abort，正是 D09 要消除的「一次白拉」）。修法：先按 name 建索引再逐字段比较。

**D109｜P3｜`hostKeysRemove` 与并集顺序**｜`src/index.ts:2721-2734`｜先按 `removeKeys` 剔除 base、再与请求里的 hostKeys 做并集 → 同一请求同时带 `hostKeys` 与 `hostKeysRemove` 时删除被静默撤销；`hostKeysRemove` 形状非法/条目非法时也无 warning。当前客户端只发 `hostKeysRemove`，故只影响手写请求与旧客户端。修法：以删除为准（并集后再剔除），非法形状补 warning。

**D110｜P3｜请求路径内的 DNS 无超时、无缓存**｜`src/index.ts:346-355`、`:2650-2657`｜别名 Host 的每个请求都要过一次 `dns.lookup`（Node 不自带缓存），且发生在写任何响应之前 → 解析器慢时连 403 都返回不了，SSE「第一拍建流」对别名不再成立。修法：加超时 + 结果 LRU，或对别名只做显式 allowlist。

**D111｜P3｜`poolKey` 未小写化**｜`src/ssh-exec.ts:195-197`｜D03 把 TOFU 的 host 归一成小写，`poolKey` 仍用原样 host → `NAS.example` 与 `nas.example` 各建一条连接，`MAX_STREAMS_PER_TARGET` 按连接计 → 同一主机的通道额度被悄悄翻倍（掩盖 D07 想暴露的 MaxSessions 问题）。修法：`poolKey` 用 `host.trim().toLowerCase()`。

**D112｜P3｜`run()` 的 `inflight` 没有兜底释放**｜`src/ssh-exec.ts:386,396-404,439-441`｜超时定时器只 `channel.signal('KILL') + close()`，不等 `close`/`error` 也不 settle → 若通道永不 emit，`inflight` 永久 ≥1 → `shouldRecycleConn` 对该连接永远 false（假 Client 复现：10 分钟后仍未回收）。修法：定时器里直接 settle，或加按时间的强制释放。**置信度中**（真机上 keepalive 掉线最终会 emit `close`）。

**D113｜P3｜数字输入框无法清空重打**｜`client-src/index.js:5715`｜`if (!/^-?\d+$/.test(raw)) return` 把空串也拒了（受控 input 立刻回弹）→ 退格删不掉最后一位，改成 12 得先全选；`type=number` 的中间态（`1e`、`-`、空串）同样回弹。修法：允许空串作为本地草稿，或 `^-?\d*$` + 失焦时夹紧回显。

**D114｜P3｜`sessionScoped` 首帧闭包陈旧**｜`client-src/index.js:4014,4207,4230`｜`sessionScoped` 改成 state 后，`deps: []` 的挂载 effect 里两处 `chooseInitialTarget(..., sessionScoped)` 仍读首帧的 `true` → 用户在 `/config` 返回前手动选了目标，迟到的 `setTarget` 会用 `''` 覆盖它。修法：改用 ref，或把那次「校正」收敛到 `/targets` 一次。**待验证**（窗口取决于两个请求先后）。

**D115｜P3｜README 的 hostKeys 表仍是单数 `fingerprint`**｜`README.md:429-435`｜记录形状已改成 `fingerprints: string[]`（`fingerprint` 仅作旧版迁移输入），README `:816` 还教用户「手动改掉 hostKeys 里的指纹」。修法：表格改成 `fingerprints`（多指纹）并注明旧字段仅迁移用。

**D116｜P3｜README 路由表 `/attention` 仍是旧形状**｜`README.md:484`、`README.en.md:532`｜文档写「单目标 `{ok:true, items}`」，实现已变成 `{items,total,truncated,degraded}`（同批 route-smoke 就断言了新字段）→ 照文档接的消费者会漏掉 D12 的截断信号。修法：中英同步为四字段并注明 `limit` 在排序后生效。

**D117｜P3｜README 未记录同源证明**｜`README.md:471-475`、`:488`｜全 README grep「同源」为 0，而实现要求 4 条 SSE + 8 条变更子路由带 `Origin` 或 `Sec-Fetch-Site: same-origin`，否则 403（curl / 老 Safari / 部分 WebView 会撞上）。修法：信任模型段与路由表补一句，手工验收加一格「无 Origin → 403」。

**D118｜P3｜README 的 vitest 清单仍是六套**｜`README.md:747`、`README.en.md:801`｜实测 7 套 119 例，第七套是本波新增的 `test/ssh-connect.test.ts`（14 例），而 DEFECTS 自己的复核节写的是「7 套 119 例」。修法：补上 `ssh-connect`，中英同步。

**D119｜P3｜发布闸没补三套脚本**｜`.github/workflows/release.yml:29-44`｜CI 加了 ubuntu-only step，release.yml 仍是 install → build → typecheck → aggregate → publishable → engines → **publish**，中间没有 `pnpm test` 也没有三套脚本 → 打 tag 发版可以整条绕过这些回归。修法：在 `Publish to npm` 之前加同一条 step。

**D120｜P3｜`files` 加 `scripts` 仍不够**｜`packages/docker/package.json`、`scripts/client-smoke.mjs:1165`｜`client-smoke.mjs` **无条件**读 `../client-src/index.js`，而 `client-src/` 不在 `files` 白名单（无 `.npmignore`）→ 从 npm 装到的包跑 `npm run smoke` 仍会在第三段 ENOENT（D72 只是把失败从第一个脚本挪到第三个）。修法：`files` 加 `"client-src"`，或该断言改 `existsSync` 守卫。

**D121｜P3｜看门狗在排空期失去保护**｜`scripts/client-smoke.mjs:1812`、`smoke.mjs:869`、`route-smoke.mjs:1086`｜三处都是主体结束时 `clearTimeout(watchdog)`、之后才 `if (failed > 0) process.exit(1)` → 成功路径不 `process.exit`，若有用例留下周期句柄（例如把组件挂在自动刷新态不卸载）进程永不退出，而看门狗已经关掉（正是 D71 要消灭的场景）。实测 client-smoke 结尾排空 **4.76s**（5.34s − 0.58s）。修法：末尾直接 `process.exit(failed > 0 ? 1 : 0)`。

**D122｜P3｜建连超时路径零回归 + 档位冲突**｜`scripts/route-smoke.mjs:33-37`、`src/ssh-exec.ts:640-646`｜D25 换成 `127.0.0.1:1` 后唯一的失败形态是立即 ECONNREFUSED；「不可达 → 20s 建连超时」在脚本与单测里都没有用例（`grep 连接超时` 只命中一条纯谓词入参字符串），D27 的不变量、超时文案、`settleError` 的收尾都只在注释里；且 15s 的用例上限 **小于** 20s 建连超时，真在 DROP 环境跑会把真因盖成「用例超时」。修法：把连接超时做成可注入（默认 20s），单测用 50ms 触发；`CASE_TIMEOUT_MS` 提到 25s。

**D123｜P3｜本波新行为零自动化覆盖**｜`test/`、`scripts/`｜`inflight`（`shouldRecycleConn` 的 `inflight?` 可选形参让「忘传」在类型层也看不出来）、`keepTail` 的截断方向、无 `SSH_AUTH_SOCK` 时的 `agentForward`（D81 的回归正是从这里漏过去的）、新导出的 `assertSince`、`createRemoteExec`、`resolveSecret`、`parseJsonLines` 在 `test/` + `scripts/` 里 grep 计数全部为 0。修法：按清单各补 1–2 条行为断言。

**D124｜P3｜新测试的用例名与断言不符**｜`test/ssh-connect.test.ts:112-116`｜名称写 `auth=key + env: 引用…`，体内是 `auth: 'password'` → 验证的是 password 分支；`auth=key` 的 passphrase / `readFileSync` 路径仍未覆盖。修法：改名，或补一条真 key 分支（临时目录写 0600 假私钥）。

**D125｜P3｜README（中）排版**｜`README.md:773,783`｜删「（54 项）」「（27 项）」时把后面的空格一起吃掉了（英文版同位置有空格）。修法：各补一个空格。

### 第二轮的处理建议

| 批次 | 内容 | 理由 |
|---|---|---|
| 1（先做） | D80、D81 | 一个是安全围栏被绕过，一个是「勾了就整个目标不可用」——都属回归，且都是一行级修复 |
| 2 | D82、D83、D84、D88、D94 | 数据与「在途操作」的正确性：指纹删不掉、终止帧丢失、开关不生效、长流被掐、连接脱管 |
| 3 | D85、D86、D87、D106 | attention 的预算与降级口径（共享 CAP 与批量 inspect 这个根因，建议一起改成分块 inspect + 独立补捞预算 + `uninspected` 计数） |
| 4 | D89、D90、D91、D92、D93、D95 | 客户端与配置写入路径（D91 需真机确认滚动行为） |
| 5 | D96、D119–D124 | 工程闸门：补负例、发布闸、`files`、看门狗、超时注入、覆盖缺口 |
| 6 | D97–D105、D107–D118、D125 | 边界、文案、文档对齐 |

## 附录

### 附录 A｜审计方法与分工

8 路并行**只读**审计（每路独立读源码 + 运行时复现，写回本文前由 Lead 逐条复核）：

| 分路 | 范围 |
|---|---|
| 1 | `src/docker.ts`：argv 构造与断言、各 `parse*` 解析器、`DockerApi` 全部方法、超时与截断语义 |
| 2 | `src/ssh-exec.ts`：SSH 连接池与回收、长流预算、凭据解析、`shJoin` 转义、TOFU 策略 |
| 3 | `src/index.ts` 外壳与 HTTP 侧：配置 schema、密钥合并、目标解析、四条 SSE、26 条路由（20 个 POST 子路由 + `/config` + `/targets`）与两把闸门 |
| 4 | `src/index.ts` agent 工具块 + README 工具表逐条对照 |
| 5–7 | `client-src/index.js` 三段（1–1765 基础设施与纯逻辑 / 1766–3762 各视图 / 3763–6211 面板外壳与设置卡片）+ `docker.css` |
| 8 | 工程闸门：三套 smoke、6 套 vitest、CI / release、包元数据、README 与 README.en 漂移 |

Lead 的复核动作：对每条 P1/P2 回到源码确认行号与语义；剔除了若干**看起来像缺陷但其实正确**的项（见附录 B）；
把重复发现合并（例如「tty 指纹种子」由两路独立命中，「截断丢最新行」由两路独立命中 —— 两处独立命中反而提高了置信度）；
对可疑项做了运行时复现（`sanitizeHostKeys` 的字段不匹配、`parseInspectPorts` 的去重键、`parsePorts` 的区间、
`assertBin` 的内部 token、`parseStatsJson` 的 PIDs、三个 smoke 的实测计数与 `route-smoke` 的 2 分钟耗时）。

### 附录 B｜检查过但**不**认为是缺陷的可疑点

写在这里是为了让后来者不必重复怀疑：

- **命令注入面**：`assertRef` / `assertImageRef` / `assertName` 要求首字符为字母数字，`-f`、`--force`、`a b`、
  `a;b`、`a$(id)`、反引号、换行、NUL、超长全部被拒；本机 `spawn(bin, args)` 不经 shell，远程 `shJoin`
  逐参数单引号转义（`'` → `'\''`）正确；`docker exec` 的 command 是 `sh -c` 的**单个 argv 元素**。
  唯一「未校验就进 argv」的是 `docker_logs` 的 `since`（D45），但同样不可注入（pflag 把它当值）。
- **修改闸门**：9 个破坏性端点 + 5 个变更类工具逐条核对过 `live.allowMutations` / `live.allowExec`，
  工具侧是「注册条件 + 执行体二次检查」双保险，默认配置下不可达；**没有发现绕过路径**。
- **XSS**：`dangerouslySetInnerHTML` 只喂 `ICON_*` 模块常量；docker 返回的容器名/镜像/日志/网络名全走
  React children 或 `textContent`。
- **SSE 帧转义**：`event` 是代码字面量、`data` 一律 `JSON.stringify`，换行/引号/U+2028 都不会造成帧伪造。
- **断开清理链**：心跳 `clearInterval`、`activeStreams.delete`、`controller.abort()` → 本机 SIGTERM→2s SIGKILL、
  远程 `channel.signal('KILL') + close()`，执行器抛错会发 `error` 帧而不是静默断流（唯一缺口是 D04 的背压）。
- **破坏性命令的形状**：`docker rm` / `image rm` 不带 `-f`，三个 prune 不带 `--all`（只清 dangling / 未用），
  删运行中容器有「先停止再删除」提示；`target` 省略只在「恰好一个目标」时回落 → 不存在「静默删错主机」。
- **配置脱敏**：`snapshot()` 只回 `passwordSet`/`passphraseSet`；`/targets` 只回 name/kind/label；错误文案不含
  任何 secret（`resolveSecretVia` 的错误只含引用名与 provider message）。
- **`readJsonBody`**：1MB 超限时提前返回，实测客户端能正常收到 400 JSON（语义上应是 413，不值一条）。
- **测试无假绿**：6 套 vitest 无 `skip`/`todo`、无 `if (!env) return`、无空转断言；三套 mock 了
  `node:child_process`（文件头已披露取舍）。`client-smoke` 里有 67 处对 minified bundle 的字符串断言（弱，
  但用例名自称「装配进 bundle」，且与 JSX 树遍历的行为断言并存）。
- **包元数据**：`main`/`types`/`exports`/`dsh.bundle.patch`/`dsh.client.platform` 指向存在文件，内部依赖版本与
  workspace 一致，聚合层与根 bundle 都钉 0.6.4（**审计时点**工作树干净；修复波以未提交改动落在工作树里，
  发布前仍需 bump 版本并重建产物）。
- **`formatBytes(999.6)` → `"1000 B"`** 之类的显示边界：不参与任何逻辑或比较，不单列。

### 附录 C｜「待验证」清单（不要当成已确认）

| 条目 | 需要的验证手段 |
|---|---|
| D25 的假红/假绿 | 在 `10.0.0.5` 真有主机的网段上跑一次 `route-smoke.mjs` |
| D32 的可达性 | 用旧 Safari / 不发 `Sec-Fetch-Site` 的 WebView 打 `GET /images/pull/stream` |
| D33 的多容器去重 | 抓一次多容器 `docker stats` 的原始字节，确认重复采样的顺序（`A B A B` vs `A A B B`） |
| D36 的可达性 | 构造 `tools.register` 抛错（如重复注册）后 `POST /config`，看是否拿到空 400 |
| D40 的输出形状 | `docker run -d -p 8000-8005:8000-8005 nginx` 后 `docker ps --format '{{json .}}'` |
| D67 的下载失败 | 用数 MB 日志导出，在 Firefox / Safari 上观察是否得到 0 字节 |
| D60 的像素 | 把面板压到 ~520px 后量 `.dk_filterBar` 与输入框的实际宽度 |
| D31 的部署形态 | 用 `/etc/hosts` 别名访问 `dsh web` 复现 403 |

（本机 docker daemon 未运行，以上真机项均未实测；其余 70 余条都有源码或运行时证据。修复后的说明：
D25 已按「立即拒绝连接」的地址 hermetic 化，其「假红/假绿」验证不再需要；D31/D32/D60 的修复实现见
文首「修复记录」，本节的可达性疑问（浏览器是否发 Sec-Fetch-Site、窄面板像素等）仍可在真机复验。）
