# @hyzyn/dsh-docker 缺陷审计与修复记录（v0.6.4 → 0.7.0）

> **这是一份时点记录。** 2026-09-19 对 v0.6.4 做了两轮**只读**审计：第一轮 8 路并行
> 审全包源码 → **79 条**（D01–D79）；修复波落地后，第二轮 5 路审**改动面**（15 文件 / +1517 −403）→
> **46 条**（D80–D125，其中 29 条是第一轮「修到一半」、16 条是修复**新引入**的回归），另补掉第一轮唯一
> 残留（D51 的 `enum`）。**125 条已全部修复，无待修**（随 docker 0.7.0 发布）。
>
> **怎么读**：本文只保留「现状 / 索引 / 待办 / 修复记录摘要 / 复核方式」这些**活的部分**。125 条的逐条
> 证据、触发场景与修法（约 1200 行）冻结在 git 历史里：`git show 96cf4305:packages/docker/DEFECTS.md`（1201 行，含审计原文与两轮修复记录）。
> **索引不写行号** —— 修复后代码移了位，审计时点的行号只会误导（`packages/tty/DEFECTS.md` 在同一轮里
> 也去掉了行号）；要定位实现请用症状列的关键词 `git log -S'<关键词>'`，或看代码里带编号的注释。
>
> **编号约定**：`D01…D125` 是 `packages/docker` 内部序列，与 `packages/tty/DEFECTS.md` 的 D01–D48
> **不共享**；跨包引用请写「docker D03 / tty D12」。代码与测试里 `（Dxx）` 形式的注释解释的是
> 「这段代码为什么长这样」，出处是本文 + 上面那个 sha。
>
> **发布**：docker **0.7.0**（minor —— `/attention` 返回体新增 `total/truncated/degraded`（`items` 仍在）、
> 变更端点与四条 SSE 新增同源证明、列表类截断从「静默少列」改为报错、hostKeys 的删除改为优先于并集、
> 空 `since` 视为未传，都属行为变化）／`@hyzyn/dsh-all` 0.1.37／`@hyzyn/dsh-plugin-kit` 0.1.31；
> tag `v0.1.37`。

## 现状

**已修 127 / 待修 0**（P1×6、P2×38、P3×83；第一轮 79 + 第二轮 46 + 线上实测 2）。

第一轮集中在三类：**长连接与长命令的生命周期**（空闲回收、并发首连、陈旧 close 事件、SSE 背压）、
**静默的错误结果**（把截断当完整、把超时当成功、把「取不到权威数据」当「没有异常」）、
**跨插件与跨文件的约定漂移**（tty 的指纹结构、targets 与 hostKeys 的保护不对称、README 与实现互相打脸）。
审计当时也确认了两件**没有问题**的事：默认只读的闸门逐条核对**没有绕过路径**，命令注入面
（argv + `shJoin` + `assert*` 白名单）**没有洞**。

第二轮性质不同：它审的是**修复波自身** —— 29 条「修到一半」（症状换了个入口仍在）、16 条**新引入**的
失败路径、1 条身份归一没跟上。值得记一笔的是：修复波当时的全绿基线（vitest / 三套脚本）**仍然成立**，
第二轮里相当一部分正是这些测试**照不到**的地方 —— 最典型的是新加的同源证明闸门没有任何负例，
把两处调用删掉、三套脚本 + 119 例单测**仍全绿**。

工程面同步：三套脚本 hermetic 化（route-smoke 2m0.5s → 0.7s）并进 CI 与发布闸；三套加看门狗；
`files` 补 `scripts` 与 `client-src`；vitest 6 套 103 例 → **7 套 127 例**；client-smoke 62 → **65**。

## 索引

| D | 严重度 | 症状（一句话） | 涉及文件 | 性质 |
|---|---|---|---|---|
| D01 | P1 | 空闲回收只看长流，`docker_image_pull` 这类在途的一次性长命令会被中途掐断 | src/ssh-exec.ts | 第一轮 |
| D02 | P1 | 同一目标的并发首个请求各建一条 SSH 连接，先建的那条立刻脱管 | src/ssh-exec.ts | 第一轮 |
| D03 | P1 | tty 的指纹种子恒为空（tty 已改用 `fingerprints[]`）→ 对 tty 钉扎过的主机静默重新 TOFU | src/index.ts | 第一轮 |
| D04 | P1 | SSE 无背压：`write()` 返回值被丢弃，慢客户端 + 话痨容器 → 宿主写缓冲无界增长 | src/index.ts | 第一轮 |
| D05 | P2 | `client.connect()` 的同步异常留下一条永假的池条目，改对配置也不恢复 | src/ssh-exec.ts | 第一轮 |
| D06 | P2 | `dropConn(key)` 无身份校验：旧连接的 close/error 会摘掉同键上的**新**连接 | src/ssh-exec.ts | 第一轮 |
| D07 | P2 | 传输错误重连丢连接却不 `end()`、配额类错误被判成传输错误 → 泄漏健康连接 + 可操作文案永不到达用户 | src/ssh-exec.ts | 第一轮 |
| D08 | P2 | 短命令路径逐 chunk `toString('utf8')`，跨分片的多字节字符变成 U+FFFD | src/ssh-exec.ts | 第一轮 |
| D09 | P2 | TOFU 记一条指纹会触发 `applySection` → `closeAllStreams()`：刚开的流被掐、在途 `docker pull` 被中止 | src/index.ts | 第一轮 |
| D10 | P2 | `POST /config` 整表覆盖 hostKeys（targets 有两重保护、hostKeys 没有）→ 面板一次无关保存即回退钉扎 | src/index.ts | 第一轮 |
| D11 | P2 | 「反复重启」判据缺失：`attention()` 取到 RestartCount 却从不参与判据，crash-loop 容器漏报 | src/docker.ts | 第一轮 |
| D12 | P2 | `attention()` 的 limit 先切后排且静默 → 最严重的容器可能被切掉，返回体无任何截断信号 | src/docker.ts | 第一轮 |
| D13 | P2 | 列表/详情类方法丢弃 `result.truncated`：静默少列容器/镜像/网络/卷、inspect 把「截断」误报成「不存在」 | src/docker.ts | 第一轮 |
| D14 | P2 | 截断保留头部、丢弃尾部：logs 丢最新行、pull 丢 digest、prune 丢总计 | src/ssh-exec.ts | 第一轮 |
| D15 | P2 | 改目标名会静默清掉已存的 password/passphrase（`mergeTargetSecrets` 按 name 匹配） | src/index.ts | 第一轮 |
| D16 | P2 | `docker_image_pull` 的超时被当成成功返回（`pull()` 丢 `timedOut`，`exec()` 会抛错） | src/docker.ts、1462 | 第一轮 |
| D17 | P2 | 日志 FOLLOW 的 effect 声明了 `active` 却漏进 deps → 折叠面板后 SSE 不断，白占 SSH 通道 | client-src/index.js | 第一轮 |
| D18 | P2 | 自动刷新 effect 不认 `active` → 折叠/隐藏后仍每 5s 轮询（总览页是 N 目标各两次 docker 调用） | client-src/index.js | 第一轮 |
| D19 | P2 | `chooseInitialTarget` 不校验 `current` → 目标被删/改名后面板每次打开都停在「未知目标」且不自愈 | client-src/index.js | 第一轮 |
| D20 | P2 | 两处「复制命令」直连 `navigator.clipboard`（非安全上下文同步抛错），已有的兜底函数是死代码 | client-src/index.js | 第一轮 |
| D21 | P2 | 面板 config 只在挂载时拉一次 → 设置里改「允许变更操作 / exec」对已打开面板不生效 | client-src/index.js | 第一轮 |
| D22 | P2 | 设置卡片保存无脏检查：请求飞行期间的编辑（含刚敲的密码）被响应整表回滚 | client-src/index.js | 第一轮 |
| D23 | P2 | `sessionScoped` 粘滞 → 从连接栏进入但未匹配到目标后，「切目标中」的锁与胶囊永久失效 | client-src/index.js | 第一轮 |
| D24 | P2 | `openContainerPanel` 的 tab 分支不 `closePanel()` → 两个 ContainerPanel 并存并共享模块级 `panelUi` | client-src/index.js、5703-5751 | 第一轮 |
| D25 | P2 | `route-smoke.mjs` 号称离线，实际向硬编码内网 IP 发起真实 SSH 连接并断言其「不可达」 | scripts/route-smoke.mjs | 第一轮 |
| D26 | P3 | `stream()` 在池里找不到条目时静默跳过配额判定与 busy 自增（fail-open） | src/ssh-exec.ts | 第一轮 |
| D27 | P3 | `acquire()` 的失败也落在「传输错误重试」范围内 → 不可达目标每次命令等两轮 20s | src/ssh-exec.ts | 第一轮 |
| D28 | P3 | `agentForward` 配了等于没配：从不给 `ConnectConfig.agentForward` 赋值 | src/ssh-exec.ts | 第一轮 |
| D29 | P3 | `auth=agent` 缺 `SSH_AUTH_SOCK` 时无预检（tty 已修，docker 未跟上） | src/ssh-exec.ts | 第一轮 |
| D30 | P3 | `expandHome` 只认 `~` 与 `~/`：`~user/...`、Windows 变量一律原样返回 | src/ssh-exec.ts | 第一轮 |
| D31 | P3 | loopback 围栏的 Host 白名单过窄：本机别名 / 非 127.0.0.1 环回地址让整个面板（含唯一的启用入口）403 | src/index.ts | 第一轮 |
| D32 | P3 | 无 `Origin` 的请求靠 `Sec-Fetch-Site` 兜底，而 `GET /images/pull/stream` 是「带副作用的 GET」 | src/index.ts | 第一轮 |
| D33 | P3 | 统计流去重只比较相邻上一条：多容器时同一轮重复采样不会被去掉 | src/index.ts | 第一轮 |
| D34 | P3 | `pickTarget` 对非字符串 `target` 静默回落到唯一目标（破坏性操作打错主机的最后一道防线） | src/index.ts | 第一轮 |
| D35 | P3 | `sanitizeTargets` 在读路径就去重/丢弃，下一次保存把丢弃结果固化 → 重名目标永久消失 | src/index.ts | 第一轮 |
| D36 | P3 | `applySection(patch)` 不在 try 内：`refreshTools` 抛错时用户拿到空 400，而配置已落盘 | src/index.ts | 第一轮 |
| D37 | P3 | 写路由对非法引用回 500（客户端错误报成服务端错误），4xx 校验只在少数几条入口做 | src/index.ts | 第一轮 |
| D38 | P3 | `parseInspectPorts` 的去重键只有 hostPort → 同端口多 IP 绑定的第二条被并掉，详情比列表少端口 | src/docker.ts、277 | 第一轮 |
| D39 | P3 | `parseStatsJson`：`PIDs` 字段缺失时得到 `0` 而不是 `null` | src/docker.ts | 第一轮 |
| D40 | P3 | `parsePorts` 静默丢弃端口区间（`8000-8005->8000-8005/tcp`）→ 端口整行消失 | src/docker.ts | 第一轮 |
| D41 | P3 | docker 的零值时间未归一（`0001-01-01T00:00:00Z`）→ 破坏「最近出事优先」排序，详情/hover 显示公元 1 年 | src/docker.ts | 第一轮 |
| D42 | P3 | `attention()` 静默吞掉 inspect 失败：OOM/退出码/重启次数/时间全降级且无任何标记 | src/docker.ts | 第一轮 |
| D43 | P3 | `assertBin` 只把关整串首字符：`docker --version` 能通过校验（不可注入，但报错退化为运行期 ENOENT） | src/docker.ts | 第一轮 |
| D44 | P3 | `logs()` 注释称「按到达顺序合并」，实现是 stdout 整段在前、stderr 在后 | src/docker.ts | 第一轮 |
| D45 | P3 | `since` 两套口径：events 有白名单（且窄于 docker 的 Go duration 语法），logs 完全不校验 | src/docker.ts、src/index.ts | 第一轮 |
| D46 | P3 | 共享 `targetParam` 文案向 12 个单目标工具暗示支持 `*` / 省略=全部，实际报错 | src/index.ts | 第一轮 |
| D47 | P3 | `docker_ps` 回完整 64 位 ID（README 写「短 ID」），且与 `docker_attention` 的短 ID 口径不一 | src/index.ts | 第一轮 |
| D48 | P3 | `docker_targets{probe:true}` 丢掉 `serverVersion`（README 承诺「探测 docker 版本」） | src/index.ts | 第一轮 |
| D49 | P3 | `docker_events` 描述写「八类」，白名单实为九类（README 写九类） | src/index.ts、src/docker.ts | 第一轮 |
| D50 | P3 | `docker_logs` 描述把默认行数写死 200，实际取配置 `logTailDefault` | src/index.ts | 第一轮 |
| D51 | P3 | 参数 schema 无 enum/边界：`action` 无 enum，`tail`/`timeoutSec` 越界被静默夹紧 | src/index.ts | 第一轮 |
| D52 | P3 | `docker_stats` 的 `ids` 传空串/纯空白静默变成「全部容器」 | src/index.ts | 第一轮 |
| D53 | P3 | `docker_attention` 在「零目标 + `target:'*'`」时渲染成「一切正常」（假阴性） | src/index.ts | 第一轮 |
| D54 | P3 | exec 输入框回车绕过 `execRunning` → 连敲回车会并发执行同一条命令 | client-src/index.js | 第一轮 |
| D55 | P3 | 统计流结束后 `statsNotice` 常驻并替换正文 → 快照数据到手也不显示 | client-src/index.js | 第一轮 |
| D56 | P3 | 「按时间」排序：尾部窗口首行若是无时间戳续行，会被排到窗口最前 | client-src/index.js | 第一轮 |
| D57 | P3 | 拉取进度「同层原地替换」只在相邻行成立、超限与暂停缓冲都静默丢行 | client-src/index.js | 第一轮 |
| D58 | P3 | 导出 .md 的代码围栏未转义：日志里出现 ``` 会截断代码块 | client-src/index.js | 第一轮 |
| D59 | P3 | `.dk_kvVal` 缺 `white-space: pre-line` → 多挂载/多网络等多行值被压成一行 | client-src/docker.css | 第一轮 |
| D60 | P3 | 日志过滤工具条无 `flex-wrap`：窄面板下输入框塌到 0 宽、右侧按钮被裁 | client-src/docker.css | 第一轮 |
| D61 | P3 | 聚合日志没有「用户上滚即暂停贴底」：读历史时每来一行都被拽回底部 | client-src/index.js | 第一轮 |
| D62 | P3 | 刷新竞态：快照轮询无请求序号（慢响应覆盖新响应）、重连补偿与防抖刷新共用同一代际闸 | client-src/index.js | 第一轮 |
| D63 | P3 | 日志无虚拟滚动：每个 chunk 全量重渲染最多 2000 行并重复重算过滤 | client-src/index.js | 第一轮 |
| D64 | P3 | 键盘可达性缺口（四处）：抽屉拖拽条 / 日志区不可聚焦 / 总览表行 / 键盘触发的菜单定位 | client-src/index.js | 第一轮 |
| D65 | P3 | 右键「问 Agent」浮层与 5 个 document/window 监听器没有卸载清理点 | client-src/index.js | 第一轮 |
| D66 | P3 | 目标缓存的「30s 过期刷新」不存在：`cacheAt` 只写不读，README 与注释都承诺了它 | client-src/index.js | 第一轮 |
| D67 | P3 | `downloadText` 固定 1s 后 revoke blob URL，且 `<a>` 从未插入 DOM | client-src/index.js | 第一轮 |
| D68 | P3 | 容器日志原文（不可信输入）整段进 agent prompt，只提示凭证风险、无「不构成指令」声明 | client-src/index.js | 第一轮 |
| D69 | P3 | 设置卡片的数字输入直接 `Number(...)`：`3.5` 被后端判非整数后静默退回默认值 | client-src/index.js | 第一轮 |
| D70 | P3 | 三套旗舰脚本（3586 行 / 158 断言）在 CI 与发布闸里零执行 | .github/workflows/ci.yml | 第一轮 |
| D71 | P3 | 三个 smoke 脚本没有超时/看门狗：任一挂起即整脚本永久挂住 | scripts/*.mjs（文件尾） | 第一轮 |
| D72 | P3 | `files` 不含 `scripts/`，但 package.json 仍 advertise `smoke`（tty 的 D42 在 docker 复现） | package.json | 第一轮 |
| D73 | P3 | 无测试的关键路径（tty D45 同款）：TOFU 指纹与 SSH 连接构造零自动化覆盖 | src/ssh-exec.ts | 第一轮 |
| D74 | P3 | `client-lint` 的锚点只认入口文件：client-src 兄弟模块的诊断被静默丢弃 | scripts/client-lint.mjs | 第一轮 |
| D75 | P3 | README（中英）说 `enabled: false` 需重启才生效，实现是保存即热生效（同包测试断言的就是热路径） | README.md | 第一轮 |
| D76 | P3 | README 中英三处「离线回归项数」与实测不符，且中英互相不一致（27 vs 62 最悬殊） | README.md | 第一轮 |
| D77 | P3 | README dev 段把本包 vitest 说成「三套」，实际 6 套 103 例 | README.md | 第一轮 |
| D78 | P3 | README 手工验收清单写「agent 侧只有 7 个只读工具」，实际恒注册 11 个 | README.md | 第一轮 |
| D79 | P3 | README 中英各有排版残迹：整段重复粘贴的残句 + 失衡的代码围栏 | README.md、README.en.md | 第一轮 |
| D80 | P1 | 别名 Host 走异步分支时提前 `return`，`cross-site`/Origin 检查被整段跳过 → 围栏被绕过 | src/index.ts | 新引入（D31） |
| D81 | P1 | `agentForward: true` + 宿主无 `SSH_AUTH_SOCK` → ssh2 同步抛错，该目标每次都连不上 | src/ssh-exec.ts | 新引入（D28） |
| D82 | P2 | 保存飞行期间删除的主机指纹被静默丢弃：钉扎删不掉，UI 却显示已删 | client-src/index.js | 新引入（D10×D22） |
| D83 | P2 | `finish()` 清空背压队列：`end`/队尾帧被丢，慢客户端重连并**重拉镜像** | src/index.ts | 新引入（D04） |
| D84 | P2 | 关掉「允许变更操作」不终止在途的镜像拉取流 | src/index.ts | 新引入（D09） |
| D85 | P2 | attention 候选 >300 时第 301 条起没有 inspect 详情，`degraded` 仍为 false | src/docker.ts | 新引入（D11/D12/D42） |
| D86 | P2 | 300 id 单批 inspect × 默认 512KB：一截断就**整批**降级，D11 判据整体失效 | src/docker.ts | 新引入（D13×D11） |
| D87 | P2 | crash-loop 补捞预算被合法候选吃光 → D11 在最需要时不出手且零信号 | src/docker.ts | 修复不完整（D11） |
| D88 | P2 | `stream()` 的 `busy` 记在重连前的废条目上：配额失效 + 长流 120s 后被 sweeper 掐断 | src/ssh-exec.ts | 修复不完整（D26/D01） |
| D89 | P2 | D35 新增的「无效条目已丢弃」warning 是死代码，永不触发 | src/index.ts | 修复不完整（D35） |
| D90 | P2 | D21 只推 `config` 不推目标列表：下拉里有已删目标、缺新目标 | client-src/index.js | 修复不完整（D21） |
| D91 | P2 | `content-visibility` 让 `scrollHeight` 变估算值 → FOLLOW 贴底失效、「回到底部」也回不到底 | client-src/docker.css | 新引入（D63） |
| D92 | P2 | 聚合日志重建流时不复位 `atBottom`（D61 只做了一半） | client-src/index.js | 修复不完整（D61） |
| D93 | P2 | 重连补偿改走共享尾沿防抖，事件密集时被无限取消 | client-src/index.js | 新引入（D62） |
| D94 | P2 | 占位条目在建连途中被摘掉后，`ready` 仍 resolve 出一条脱管连接 | src/ssh-exec.ts | 修复不完整（D02） |
| D95 | P2 | `closePanel()` 管不到 tab 实例：从连接栏进入仍可并存两个面板 | client-src/index.js | 修复不完整（D24） |
| D96 | P2 | 新安全闸门的拒绝分支零回归（删掉调用，三套脚本 + 119 例仍全绿） | scripts/route-smoke.mjs | 修复不完整（D32/D70） |
| D97 | P3 | `/action`、`/stats`、`/exec`（空 command）仍回 500 而非 400 | src/index.ts | 修复不完整（D37） |
| D98 | P3 | `POST /logs` 的 `since` 仍未过 `assertSince`、空串在工具侧报「必填」、在 SSE 侧被忽略 | src/index.ts | 修复不完整（D45） |
| D99 | P3 | `assertSince` 与 docker 口径两向不吻合（`1.5h`/`0` 被拒，裸日期被放行） | src/docker.ts | 修复不完整（D45） |
| D100 | P3 | 单目标 `docker_attention` 的渲染丢 `total/truncated/degraded` | src/index.ts | 修复不完整（D12/D42） |
| D101 | P3 | 面板与 `/attention` 路由都没接 `total/truncated/degraded`，计数静默 ≤100 | src/index.ts | 修复不完整（D12） |
| D102 | P3 | `parseInspectPorts` 仍整段丢弃区间端口（详情比列表少端口） | src/docker.ts | 修复不完整（D40） |
| D103 | P3 | 区间端口字段无任何消费方：显示成单端口（`8000→8000/tcp`） | src/index.ts | 修复不完整（D40） |
| D104 | P3 | `imageInspect` 的两段 `docker history` 从不检查 `truncated` | src/docker.ts | 修复不完整（D13） |
| D105 | P3 | `assertComplete` 把「静默部分结果」变成「整体失败」，文案对 agent 不可执行 | src/docker.ts | 新引入（D13 代价） |
| D106 | P3 | `FRESH_UP_RE` 只认 ≤59 秒，与 `ATTENTION_FRESH_MS`（120s）不一致 | src/docker.ts | 新引入（D11） |
| D107 | P3 | `refreshTools` 半套注册 + D09 差异判定 → 重存同一配置不自愈 | src/index.ts | 修复不完整（D36） |
| D108 | P3 | `sameTargets` 按下标比较：仅顺序变化即收流 | src/index.ts | 修复不完整（D09） |
| D109 | P3 | `hostKeysRemove` 与并集顺序：同一请求的删除被撤销、非法形状静默忽略 | src/index.ts | 修复不完整（D10） |
| D110 | P3 | 请求路径内的 DNS 判定无超时、无缓存，且发生在写响应之前 | src/index.ts | 新引入（D31） |
| D111 | P3 | `poolKey` 未小写化：同一主机建两条连接，通道额度被悄悄翻倍 | src/ssh-exec.ts | 边界 |
| D112 | P3 | `run()` 的 `inflight` 只靠 channel 事件释放，超时定时器不兜底 → 连接永不回收 | src/ssh-exec.ts | 新引入（D01） |
| D113 | P3 | 数字输入框无法「清空再重打」（空串被整数正则拒绝） | client-src/index.js | 新引入（D69） |
| D114 | P3 | `sessionScoped` state 化后，`deps: []` 的挂载 effect 仍读首帧闭包 | client-src/index.js | 修复不完整（D23） |
| D115 | P3 | README 的 `hostKeys[]` 表仍是单数 `fingerprint` | README.md | 修复不完整（D03） |
| D116 | P3 | README 路由表 `/attention` 行仍是旧形状（只有 `items`） | README.md | 修复不完整（D12/D42） |
| D117 | P3 | README 未记录 D32 收紧的行为（缺同源证明 → 403） | README.md | 修复不完整（D32） |
| D118 | P3 | README 的 vitest 清单仍写「六套」，漏掉本波新增的 `ssh-connect` | README.md | 修复不完整（D77） |
| D119 | P3 | CI 补了、**发布闸没补**：`release.yml` 仍零执行三套脚本 | .github/workflows/release.yml | 修复不完整（D70） |
| D120 | P3 | `files` 加了 `scripts` 仍不够：`client-smoke` 读未发布的 `client-src/` → `npm run smoke` 仍坏 | package.json | 修复不完整（D72） |
| D121 | P3 | 三套看门狗在主体结束即 `clearTimeout`，退出前的排空期失去保护 | scripts/client-smoke.mjs | 修复不完整（D71） |
| D122 | P3 | 建连超时路径脚本/单测双双归零，且 15s 用例上限 < 20s 建连超时 | scripts/route-smoke.mjs | 修复不完整（D25/D71） |
| D123 | P3 | 本波新行为（`inflight`/`keepTail`/无 sock 的 `agentForward`/`assertSince`）零自动化覆盖 | test/ssh-connect.test.ts | 修复不完整（D73） |
| D124 | P3 | 新测试里 `auth=key` 用例名与断言不符（实际走 password 分支） | test/ssh-connect.test.ts | 新引入 |
| D125 | P3 | README（中）两处删「（N 项）」时吃掉了后面的空格 | README.md | 新引入（排版） |
| D126 | P2 | 目标引用的连接簿条目失效时**界面上看不出来**：`book` 下拉的候选来自 ttyBooks，失效名字没有对应 option → 下拉渲染成**空白**；且错误文案让人「去 tty 终端面板的设置卡片里添加」，而那张卡片改不了 docker 目标的引用 | src/index.ts、client-src/index.js、client-src/session-target.js | 2026-09-21 用户实测上报 |
| D127 | P2 | docker 设置卡片「目标名」输入框**打一个字就失焦**：`dk_targetRow` 的 React key 写成 `String(index) + item.name`，key 含被编辑的字段 → 每次输入 key 变化、React 卸载重建整行，输入框当场丢焦点（表现为"无法聚焦"） | client-src/index.js | 2026-09-21 用户实测上报 |
| D128 | P1 | 日志大流量**逐 chunk 全量重渲染**（打开 FOLLOW 的 tail 突发即数百次全量 reconcile，且每 chunk 对全缓冲 join/split 大字符串）叠加**缓冲只限行数不限字节、残行无界** → 话痨 / 大行容器把渲染进程吃到 OOM，网页直接崩溃 | client-src/index.js、client-src/log-buffer.js（新增） | 2026-09-24 用户实测上报 |
| D129 | P2 | 修 D128 时顺手把显示层截断到 400 行（并另设 2000 行导出上限）——`LINES` 选 5000 实际只显示 400 行，与「选多少看多少」的设计不符；且「行数闸」与设置卡片的「输出上限（KB）字节闸」在 UI 上没区分 | client-src/index.js | 2026-09-24 用户实测上报（D128 的过度修正） |
### D126：失效的连接簿引用在界面上看不出来（2026-09-21 用户实测上报）

- **症状**：docker 面板顶部报「目标「目标1」引用的连接簿条目不存在：HS-248」，同时下方又有一条
  说「到 插件配置 → Docker 容器面板 添加一条目标」——**两条指引互相矛盾**；而设置卡片里那条
  目标的「连接簿」下拉**显示为空白**，看不出引用错了。
- **根因**（本机实测：目标 `book=HS-248`，tty 连接簿为 `cdc-test-161 / TEST / HS_248_ADMIN /
  111 / 192.168.80.248`）：
  1. **下拉的候选项来自 `ttyBooks`**，而 `item.book` 的值不在其中时，没有任何 `<option>` 与之
     匹配 → React 渲染出**空白下拉**。用户无法从这里发现"引用的是个不存在的名字"，只会以为
     "没选"；要等真去连才报错。
  2. **错误文案指向了做不到的动作**：原文说「请在 tty 终端面板的设置卡片里添加，或改为内联
     host/username」——但那张卡片管的是 **tty 自己的连接簿条目**，改不了 docker 目标引用的名字。
     用户照它找，永远找不到"改引用"的地方。
- **成因（历史）**：0.6.4 那次修复的测试夹具与提交信息里，条目名是 `HS-248`（说明当时连接簿里
  确实有该条目）；后来 tty 侧条目改名成 `HS_248_ADMIN`，**docker 目标的引用没跟着
  改**，于是成了悬空引用。这类"改名之后悬空"是结构性风险，不是一次性事故。
- **修法**：① 错误文案改为指向**本卡片这条目标的「连接簿」下拉**（附备选：补同名条目 /
  清空改手填）；② 设置卡片用新增的纯函数 `staleBookRef(target, ttyBooks)` 检测悬空引用，
  命中时给该行加 `data-stale`（标黄 + 左侧色条）、在下拉里**补一个显式 option**
  `⚠ 条目已不存在：<名字>`（否则就是空白），并在下方给可执行指引。
- **刻意不做的**：tty 未安装 / 连接簿为空时**不标失效**——那是"宿主没装 tty / 条目还没建"，
  与"引用了一个不存在的名字"是两回事，标黄会误导。
- **回归门槛**：`test/session-target.test.ts` 新增 6 例（存在 / 悬空 / trim / 本机与内联不算 /
  连接簿为空不算 / 坏输入不抛）；`scripts/smoke.mjs` 钉住新文案（含**反向断言**：不得再出现
  「请在 tty 终端面板的设置卡片里添加」）；tty 预览新增 `docker-stale-book` 场景（渲染真实
  卡片，断言恰好 1 行标黄、下拉显示得出失效名字、有警示文案、正常引用不被误标）。
- **验证**：全仓 vitest **687/687**；docker smoke **40/40**、route-smoke **60/60**、
  client-smoke **65/65**；tty 预览 **33/33**。**反向验证有效**：把 `staleBookRef` 的调用注回
  旧行为（恒为 undefined）→ 场景立即变红并同时报出三条原因，恢复后转绿。


### D127：目标名输入框打一个字就失焦（2026-09-21 用户实测上报）

- **症状**：设置卡片 → 目标 → 「目标名」输入框**无法正常输入**——敲进第一个字符就掉焦，
  看着像"点不进去 / 聚焦不了"。
- **根因**：那一行的 React key 写成 `String(index) + item.name`。**key 里含正在被编辑的字段**，
  于是每敲一个字符 `item.name` 一变，key 就跟着变——React 判定为"这是另一个元素"，**卸载旧
  DOM、挂载新 DOM**，输入框随之丢失焦点。经典的反模式：key 必须在该元素的整个生命周期内稳定。
- **修法**：key 只留 `String(index)`。目标行是**按位置**编辑的（`patchTarget(index, …)`），
  行的身份就是它的下标；顺序变化由数组本身负责，名字不该参与身份判定。
- **顺带排查**：全仓扫了同类模式，`activity` 那个 key（`String(index)+name+time`）**不是 bug**
  ——活动条目是纯展示、不可就地编辑，key 变化不会打断任何输入。其余 map 的 key 都只用 index。
- **为什么既有测试没抓到**：`client-smoke` 用的是 **stub React + stub DOM**（不出真实 DOM、
  也没有焦点概念），所以"key 抖动导致失焦"这类问题它天然看不见；必须靠真实渲染（preview）
  才能暴露。
- **回归门槛**：tty 预览的 `docker-stale-book` 场景（渲染**真实** docker 设置卡片）新增焦点断言：
  逐个字符派发 input 事件，**每敲一次都检查 `document.activeElement` 仍是同一个节点**，
  最后校验文本累积完整。
- **验证**：tty 预览 **33/33**、全仓 vitest **687/687**、docker smoke **40/40** /
  route-smoke **60/60** / client-smoke **65/65**。**反向验证有效**：把 key 改回
  `String(index) + item.name` → 场景立即变红，报出「敲入第 1 个字符后输入框失焦」，
  与用户描述的现象完全一致。


## 待办 / 路线图（本文唯一「还没做」的部分）

> 下面都是**规划**，不是缺陷：单人项目不另开 Issue，待办记在这里，做完打勾。
> 新发现的缺陷接着编号记进本文（索引表加行）。

- **跳板机（ProxyJump / ProxyCommand）** —— `buildConnectConfig` 从不设 ssh2 的 `sock`，tty 的连接簿也不
  支持跳板机条目；企业内网主机几乎都要过 bastion。短期至少做到：配了跳板机的目标连不上时给出明确文案，
  而不是 20s 后一句通用超时。
- **agent 侧的网络 / 卷变更工具** —— 面板有 `networks/remove|prune`、`volumes/remove|prune` 的按钮，
  agent 侧一个都没有（当前是有意为之：这类删除最容易误伤）。若要做，必须与面板**同一把** `allowMutations`
  闸门 + 破坏性后果复述。
- **日志真虚拟滚动（可选的后续项）** —— D63 已随 D128 根治：行 key 用单调 id + 缓冲行数/字节双限
  （`log-buffer.js`）+ FOLLOW 150ms 合帧——渲染频率与 chunk 速率解耦、内存有界；**显示层不截断**
  （`LINES` 选多少渲染多少；曾被短暂限成 400 行，见 D129）。绝对定位的真虚拟化只剩「5000 行时再压
  DOM 节点数」的边际收益，且要自己维护高度缓存，没有实测痛点前不必做。`content-visibility` 依旧
  不要开（D91：估算高度打穿贴底判定）。
- **跨目标聚合的取消语义** —— 45s 超时只 `race`，不 abort 底层命令（超时的目标仍在后台跑完）。
  要么把 AbortSignal 串下去，要么在文案里说明。
- **变更端点的一次性 token** —— 当前信任模型是 loopback + 同源证明（D31/D32）；本机任意进程仍可直接
  读写配置（它能先 `POST /config {allowMutations:true}`）。docker socket 等价目标主机 root，值得再收紧。
- **`isConcurrencySafe` 未声明** —— 所有 `docker_*` 工具都被宿主当作独占而串行化，只读工具本可并行。
  这是本仓库各插件的共性（tty / codegraph 同样未声明），要改建议一起。
- **面板端 i18n** —— 界面只有中文；`README.en.md` 与中文版手工同步（D76 那类「文档里写死计数」的漂移
  已经去掉，但双份维护的风险仍在）。
- **tty / dsh-mcp 的围栏口径未同步** —— 与 docker 同款的 loopback 围栏加固（D31/D32）尚未同步到这两个包。
  这里只记**结论**，不在公开文档里展开具体手法；要做的话直接对齐 `src/index.ts` 里那两个函数。

## 修复记录摘要

> 逐条证据与修法见 `git show 96cf4305:packages/docker/DEFECTS.md`；这里只留「改成了什么」，
> 供后来者判断设计意图（代码里的注释逐条带了编号）。

**第一轮（D01–D79，四个批次一次做完）**

- **连接生命周期**：空闲回收把在途的一次性命令计入 `inflight`；并发首连先占坑再 `await` 建连配置；
  `dropConn(key, client)` 带身份校验、陈旧 close 不再摘掉新连接；传输错误重连前先 `end()` 且配额类错误
  不再触发重连；`ByteSink` + `StringDecoder` 统一解码；`keepTail` 让 logs/pull/prune 保留尾部。
- **SSE**：背压队列 + `drain` 续写 + 每流 8MB 上限（超限视为客户端已死）；收尾前把队列交给 `res.end` 落地；
  按 enabled / dockerBin / targets 的差异收流；撤销 `allowMutations` 也收流。
- **attention**：返回 `{items,total,truncated,degraded}`、先按严重度排序再截断、crash-loop 判据
  （重启 ≥3 且 2 分钟内刚启动）、分块 inspect + 补捞独立预算 + 未取到详情计入 `degraded`。
- **解析与命令**：`assertComplete` 截断即抛（并给出可执行替代）；docker 零值时间归一为 null；
  端口区间不再丢弃；`assertSince` 一处实现三处共用；`assertBin` 逐 token 挡 `-` 开头。
- **配置与凭据**：hostKeys 并集合并 + 显式 `hostKeysRemove`（删除优先于并集）；凭证按「连接身份」而不是
  名字继承；指纹改 `fingerprints[]` 且 host 小写化。
- **客户端**：config publish/subscribe 让已打开面板即时跟随开关；`active` 进 effect 依赖；
  初始目标对列表校验；折叠面板不再占用 SSH 通道；请求序号防旧响应覆盖；目标缓存 TTL；
  数字输入改本地草稿；键盘可达性；日志渲染上限。
- **工程闸门**：三套脚本 hermetic 化 + 看门狗 + 进 CI 与发布闸；`files` 补齐；client-lint 锚点放宽到
  全部 client-src 模块；TOFU / 连接构造补单测。
- **安全围栏**：127/8 + `::1` + IPv6 映射；别名主机名走带 500ms 超时与 60s 缓存的 DNS；
  四条 SSE 与变更子路由要求同源证明。

**第二轮（D80–D125，修的是第一轮修出来的问题）**

- **安全 / 回归**：别名的来源检查（`Sec-Fetch-Site` / Origin）提到 DNS 分支**之前**，不再被异步分支跳过；
  `agentForward` 复用「有没有 agent」的同一个判定（无 `SSH_AUTH_SOCK` 时静默降级）。
- **在途操作**：`stream()` 的 `busy` 跟着活条目搬家（重连后不再记在废条目上）；占位条目加 `disposed`
  标记 + 归属校验 + `destroy()` 兜底；`run()` 的超时定时器直接 settle（`inflight` 有兜底释放）。
- **配置 / 客户端**：hostKeys 删除只清「已发出」的那一批；config 订阅顺带同步目标列表；
  去掉 `.dk_logLine` 的 `content-visibility`（恢复精确 `scrollHeight`）；聚合日志重建流时复位 `atBottom`；
  重连补偿不再走事件驱动的防抖；tab 承载的实例可被 `openPanel` 收起。
- **信号与展示**：单目标 `docker_attention` 的渲染也带 `total/truncated/degraded`；面板接入这三个信号
  （计数用 `total`，截断 / 降级出提示行）；区间端口补齐消费方（不再只显示下界）。
- **工程**：发布闸也跑 vitest + 三套脚本；`files` 补 `client-src`；看门狗退出路径 + 单例 25s 档；
  新增 `DSH_DOCKER_CONNECT_TIMEOUT_MS`（**仅测试 / 排障用**，覆盖 20s 建连超时）；
  新增 8 条宿主断言 + 3 条客户端断言。

## 复核方式（0.7.0 基线）

- **单测与静态检查**：`npx vitest run packages/docker`（**7 套 127 例**）、`npx tsc --noEmit`、
  `node scripts/client-lint.mjs`（忽略 7 条已知噪音 TS2307×4 + TS2339×3）。
- **旗舰脚本**（都需先 `pnpm --filter @hyzyn/dsh-docker build`，它们读 `lib/`）：
  `node scripts/smoke.mjs`（40/40）、`node scripts/route-smoke.mjs`（60/60，hermetic，实测 0.7s）、
  `node scripts/client-smoke.mjs`（65/65，实测 0.6s）。三套都在 CI（ubuntu-only step）与发布闸里跑，
  并带看门狗（单例 25s / 全局 90s；末尾 `process.exit` 保证退出）。
- **产物与源码一致**：`pnpm -r build` 后 `git diff --exit-code -- 'packages/*/client.js' 'packages/*/lib'`
  （CI 闸门）；本次另用内存重建逐字节核对过 `client.js`（229759 字节，`identical: true`）。
- **真机 / 浏览器（本机无法验，见下）**：多容器 `docker stats` 的重复采样顺序、端口区间在
  `docker ps` / `docker inspect` 里的输出形状、crash-loop 的实机形态、别名 Host 的部署形态、
  移除 `content-visibility` 之后的贴底手感、窄面板下的过滤条像素。本机 docker daemon 未运行，
  这些项以「可达性未经实测」为准。
