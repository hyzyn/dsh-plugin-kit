# @hyzyn/dsh-docker 缺陷编号字典

> **这份文件是代码注释的编号字典，不是审计报告。**
>
> `src/` / `client-src/` / `test/` / `scripts/` 里有大量 `（Dxx）` 注释，含义是「这段代码为什么
> 长这样」，编号的出处就是本文。拿到任意一个 `（Dxx）`：先查 [§1 编号索引表](#1-编号索引表)
> 知道**当年坏了什么**，再查 [§2 编号字典](#2-编号字典这段代码为什么长这样) 知道**所以代码为什么
> 写成这样**。
>
> **编号是硬契约**：`D01–D138` 是 `packages/docker` 内部序列，与 `packages/tty/DEFECTS.md` 的
> `D01–D61` **不共享**；跨包引用请写「docker D03 / tty D12」。新缺陷接在 `D138` 之后，
> **不得重号、不得回收空号**——源码里已有注释指向它们。

> **本文不含**：逐条 postmortem（症状 / 现场复现 / 根因 / 修法 / 回归 / 反向验证）。
> 那是 commit message / PR description 的内容；本文只留**结论与取舍**，正文在哪见
> [§4 冻结记录](#4-冻结记录被移出正文的内容在哪)。

## 维护规则

1. **新缺陷只做两件事**：索引表加一行 + 在代码注释里落编号。详细的现场 / 根因 / 修法 / 反向验证
   写进 **commit message**，正文不展开。
2. **索引表超过约 80 行时**，把最老的 20 条整体移到 `DEFECTS-archive.md`。
3. 索引表**不写行号、不保留修复提交 sha**：修复后代码移了位、有的整段被删或重写，审计时点的行号
   只会误导。定位实现请用症状列的关键词 `git log -S'<关键词>'`，或读代码里带编号的注释。
4. 阈值 / 口径 / 基线数字**只增不改**：发现过期或自相矛盾，就在原处加一行 `> ⚠️ 标注`
   说明，**不擅自"修正"**。

> ⚠️ **标注（本次未擅改）——规则 2 的阈值已被现状越过。**
> 当前索引表 **138 行**，远超 80 行；但 `D01–D138` 里有 **115 个编号**被
> `src/` / `client-src/` / `test/` / `scripts/` 引用（共 320 处 `（Dxx）`），
> 整批搬去 archive 会让源码里的注释失去解析处。**归档只能针对"已不再被源码引用"的编号**，
> 当前一个这样的编号都没有。故此处只记录规则与现状，不执行搬迁。

## 现状

**已修 138 / 待修 0**，编号至 `D138`。逐条症状见 §1，设计意图见 §2，**还没做的见
[ROADMAP.md](./ROADMAP.md)**。

> ⚠️ **标注（本次未擅改）——两处口径不一致，原文未改：**
> 1. 本文原开头写「**125 条已全部修复**，随 docker 0.7.0 发布」；而编号已到 `D138`
>    ——「125」是 0.7.0 时点的数字，此后用户实测 / 复核 / 真机波又加了 `D126–D138`（13 条）。
> 2. §3 小节标题写「**0.7.0 基线**」，而 `packages/docker/package.json` 现为 `0.7.3`。
>
> 原始发布记录（照录，未改）：docker **0.7.0** 为 minor —— `/attention` 返回体新增
> `total/truncated/degraded`（`items` 仍在）、变更端点与四条 SSE 新增同源证明、列表类截断
> 从「静默少列」改为报错、hostKeys 的删除改为优先于并集、空 `since` 视为未传，均属行为变化；
> 同批 `@hyzyn/dsh-all` 0.1.37 / `@hyzyn/dsh-plugin-kit` 0.1.31；tag `v0.1.37`。

## 1. 编号索引表

> 只回答「当年坏了什么」。**症状列的关键词就是检索锚点**（如 `inflight`、`keepTail`、
> `assertSince`、`dropConn`）——`git log -S'<关键词>'` 能直接落到修复提交。
> 严重度（P1/P2/P3）与「第一轮 / 第二轮 / 新引入」的考古信息**已按维护规则 3 移出**：
> 前者是按行重数的时点分档，后者是修复波的批次，两者都不参与「这段代码为什么长这样」。

| D | 症状（一句话：当年坏了什么） | 涉及文件 |
|---|---|---|
| D01 | 空闲回收只看长流，`docker_image_pull` 这类在途的一次性长命令会被中途掐断 | src/ssh-exec.ts |
| D02 | 同一目标的并发首个请求各建一条 SSH 连接，先建的那条立刻脱管 | src/ssh-exec.ts |
| D03 | tty 的指纹种子恒为空（tty 已改用 `fingerprints[]`）→ 对 tty 钉扎过的主机静默重新 TOFU | src/index.ts |
| D04 | SSE 无背压：`write()` 返回值被丢弃，慢客户端 + 话痨容器 → 宿主写缓冲无界增长 | src/index.ts |
| D05 | `client.connect()` 的同步异常留下一条永假的池条目，改对配置也不恢复 | src/ssh-exec.ts |
| D06 | `dropConn(key)` 无身份校验：旧连接的 close/error 会摘掉同键上的**新**连接 | src/ssh-exec.ts |
| D07 | 传输错误重连丢连接却不 `end()`、配额类错误被判成传输错误 → 泄漏健康连接 + 可操作文案永不到达用户 | src/ssh-exec.ts |
| D08 | 短命令路径逐 chunk `toString('utf8')`，跨分片的多字节字符变成 U+FFFD | src/ssh-exec.ts |
| D09 | TOFU 记一条指纹会触发 `applySection` → `closeAllStreams()`：刚开的流被掐、在途 `docker pull` 被中止 | src/index.ts |
| D10 | `POST /config` 整表覆盖 hostKeys（targets 有两重保护、hostKeys 没有）→ 面板一次无关保存即回退钉扎 | src/index.ts |
| D11 | 「反复重启」判据缺失：`attention()` 取到 RestartCount 却从不参与判据，crash-loop 容器漏报 | src/docker.ts |
| D12 | `attention()` 的 limit 先切后排且静默 → 最严重的容器可能被切掉，返回体无任何截断信号 | src/docker.ts |
| D13 | 列表/详情类方法丢弃 `result.truncated`：静默少列容器/镜像/网络/卷、inspect 把「截断」误报成「不存在」 | src/docker.ts |
| D14 | 截断保留头部、丢弃尾部：logs 丢最新行、pull 丢 digest、prune 丢总计 | src/ssh-exec.ts |
| D15 | 改目标名会静默清掉已存的 password/passphrase（`mergeTargetSecrets` 按 name 匹配） | src/index.ts |
| D16 | `docker_image_pull` 的超时被当成成功返回（`pull()` 丢 `timedOut`，`exec()` 会抛错） | src/docker.ts、1462 |
| D17 | 日志 FOLLOW 的 effect 声明了 `active` 却漏进 deps → 折叠面板后 SSE 不断，白占 SSH 通道 | client-src/index.js |
| D18 | 自动刷新 effect 不认 `active` → 折叠/隐藏后仍每 5s 轮询（总览页是 N 目标各两次 docker 调用） | client-src/index.js |
| D19 | `chooseInitialTarget` 不校验 `current` → 目标被删/改名后面板每次打开都停在「未知目标」且不自愈 | client-src/index.js |
| D20 | 两处「复制命令」直连 `navigator.clipboard`（非安全上下文同步抛错），已有的兜底函数是死代码 | client-src/index.js |
| D21 | 面板 config 只在挂载时拉一次 → 设置里改「允许变更操作 / exec」对已打开面板不生效 | client-src/index.js |
| D22 | 设置卡片保存无脏检查：请求飞行期间的编辑（含刚敲的密码）被响应整表回滚 | client-src/index.js |
| D23 | `sessionScoped` 粘滞 → 从连接栏进入但未匹配到目标后，「切目标中」的锁与胶囊永久失效 | client-src/index.js |
| D24 | `openContainerPanel` 的 tab 分支不 `closePanel()` → 两个 ContainerPanel 并存并共享模块级 `panelUi` | client-src/index.js、5703-5751 |
| D25 | `route-smoke.mjs` 号称离线，实际向硬编码内网 IP 发起真实 SSH 连接并断言其「不可达」 | scripts/route-smoke.mjs |
| D26 | `stream()` 在池里找不到条目时静默跳过配额判定与 busy 自增（fail-open） | src/ssh-exec.ts |
| D27 | `acquire()` 的失败也落在「传输错误重试」范围内 → 不可达目标每次命令等两轮 20s | src/ssh-exec.ts |
| D28 | `agentForward` 配了等于没配：从不给 `ConnectConfig.agentForward` 赋值 | src/ssh-exec.ts |
| D29 | `auth=agent` 缺 `SSH_AUTH_SOCK` 时无预检（tty 已修，docker 未跟上） | src/ssh-exec.ts |
| D30 | `expandHome` 只认 `~` 与 `~/`：`~user/...`、Windows 变量一律原样返回 | src/ssh-exec.ts |
| D31 | loopback 围栏的 Host 白名单过窄：本机别名 / 非 127.0.0.1 环回地址让整个面板（含唯一的启用入口）403 | src/index.ts |
| D32 | 无 `Origin` 的请求靠 `Sec-Fetch-Site` 兜底，而 `GET /images/pull/stream` 是「带副作用的 GET」 | src/index.ts |
| D33 | 统计流去重只比较相邻上一条：多容器时同一轮重复采样不会被去掉 | src/index.ts |
| D34 | `pickTarget` 对非字符串 `target` 静默回落到唯一目标（破坏性操作打错主机的最后一道防线） | src/index.ts |
| D35 | `sanitizeTargets` 在读路径就去重/丢弃，下一次保存把丢弃结果固化 → 重名目标永久消失 | src/index.ts |
| D36 | `applySection(patch)` 不在 try 内：`refreshTools` 抛错时用户拿到空 400，而配置已落盘 | src/index.ts |
| D37 | 写路由对非法引用回 500（客户端错误报成服务端错误），4xx 校验只在少数几条入口做 | src/index.ts |
| D38 | `parseInspectPorts` 的去重键只有 hostPort → 同端口多 IP 绑定的第二条被并掉，详情比列表少端口 | src/docker.ts、277 |
| D39 | `parseStatsJson`：`PIDs` 字段缺失时得到 `0` 而不是 `null` | src/docker.ts |
| D40 | `parsePorts` 静默丢弃端口区间（`8000-8005->8000-8005/tcp`）→ 端口整行消失 | src/docker.ts |
| D41 | docker 的零值时间未归一（`0001-01-01T00:00:00Z`）→ 破坏「最近出事优先」排序，详情/hover 显示公元 1 年 | src/docker.ts |
| D42 | `attention()` 静默吞掉 inspect 失败：OOM/退出码/重启次数/时间全降级且无任何标记 | src/docker.ts |
| D43 | `assertBin` 只把关整串首字符：`docker --version` 能通过校验（不可注入，但报错退化为运行期 ENOENT） | src/docker.ts |
| D44 | `logs()` 注释称「按到达顺序合并」，实现是 stdout 整段在前、stderr 在后 | src/docker.ts |
| D45 | `since` 两套口径：events 有白名单（且窄于 docker 的 Go duration 语法），logs 完全不校验 | src/docker.ts、src/index.ts |
| D46 | 共享 `targetParam` 文案向 12 个单目标工具暗示支持 `*` / 省略=全部，实际报错 | src/index.ts |
| D47 | `docker_ps` 回完整 64 位 ID（README 写「短 ID」），且与 `docker_attention` 的短 ID 口径不一 | src/index.ts |
| D48 | `docker_targets{probe:true}` 丢掉 `serverVersion`（README 承诺「探测 docker 版本」） | src/index.ts |
| D49 | `docker_events` 描述写「八类」，白名单实为九类（README 写九类） | src/index.ts、src/docker.ts |
| D50 | `docker_logs` 描述把默认行数写死 200，实际取配置 `logTailDefault` | src/index.ts |
| D51 | 参数 schema 无 enum/边界：`action` 无 enum，`tail`/`timeoutSec` 越界被静默夹紧 | src/index.ts |
| D52 | `docker_stats` 的 `ids` 传空串/纯空白静默变成「全部容器」 | src/index.ts |
| D53 | `docker_attention` 在「零目标 + `target:'*'`」时渲染成「一切正常」（假阴性） | src/index.ts |
| D54 | exec 输入框回车绕过 `execRunning` → 连敲回车会并发执行同一条命令 | client-src/index.js |
| D55 | 统计流结束后 `statsNotice` 常驻并替换正文 → 快照数据到手也不显示 | client-src/index.js |
| D56 | 「按时间」排序：尾部窗口首行若是无时间戳续行，会被排到窗口最前 | client-src/index.js |
| D57 | 拉取进度「同层原地替换」只在相邻行成立、超限与暂停缓冲都静默丢行 | client-src/index.js |
| D58 | 导出 .md 的代码围栏未转义：日志里出现 ``` 会截断代码块 | client-src/index.js |
| D59 | `.dk_kvVal` 缺 `white-space: pre-line` → 多挂载/多网络等多行值被压成一行 | client-src/docker.css |
| D60 | 日志过滤工具条无 `flex-wrap`：窄面板下输入框塌到 0 宽、右侧按钮被裁 | client-src/docker.css |
| D61 | 聚合日志没有「用户上滚即暂停贴底」：读历史时每来一行都被拽回底部 | client-src/index.js |
| D62 | 刷新竞态：快照轮询无请求序号（慢响应覆盖新响应）、重连补偿与防抖刷新共用同一代际闸 | client-src/index.js |
| D63 | 日志无虚拟滚动：每个 chunk 全量重渲染最多 2000 行并重复重算过滤 | client-src/index.js |
| D64 | 键盘可达性缺口（四处）：抽屉拖拽条 / 日志区不可聚焦 / 总览表行 / 键盘触发的菜单定位 | client-src/index.js |
| D65 | 右键「问 Agent」浮层与 5 个 document/window 监听器没有卸载清理点 | client-src/index.js |
| D66 | 目标缓存的「30s 过期刷新」不存在：`cacheAt` 只写不读，README 与注释都承诺了它 | client-src/index.js |
| D67 | `downloadText` 固定 1s 后 revoke blob URL，且 `<a>` 从未插入 DOM | client-src/index.js |
| D68 | 容器日志原文（不可信输入）整段进 agent prompt，只提示凭证风险、无「不构成指令」声明 | client-src/index.js |
| D69 | 设置卡片的数字输入直接 `Number(...)`：`3.5` 被后端判非整数后静默退回默认值 | client-src/index.js |
| D70 | 三套旗舰脚本（3586 行 / 158 断言）在 CI 与发布闸里零执行 | .github/workflows/ci.yml |
| D71 | 三个 smoke 脚本没有超时/看门狗：任一挂起即整脚本永久挂住 | scripts/*.mjs（文件尾） |
| D72 | `files` 不含 `scripts/`，但 package.json 仍 advertise `smoke`（tty 的 D42 在 docker 复现） | package.json |
| D73 | 无测试的关键路径（tty D45 同款）：TOFU 指纹与 SSH 连接构造零自动化覆盖 | src/ssh-exec.ts |
| D74 | `client-lint` 的锚点只认入口文件：client-src 兄弟模块的诊断被静默丢弃 | scripts/client-lint.mjs |
| D75 | README（中英）说 `enabled: false` 需重启才生效，实现是保存即热生效（同包测试断言的就是热路径） | README.md |
| D76 | README 中英三处「离线回归项数」与实测不符，且中英互相不一致（27 vs 62 最悬殊） | README.md |
| D77 | README dev 段把本包 vitest 说成「三套」，实际 6 套 103 例 | README.md |
| D78 | README 手工验收清单写「agent 侧只有 7 个只读工具」，实际恒注册 11 个 | README.md |
| D79 | README 中英各有排版残迹：整段重复粘贴的残句 + 失衡的代码围栏 | README.md、README.en.md |
| D80 | 别名 Host 走异步分支时提前 `return`，`cross-site`/Origin 检查被整段跳过 → 围栏被绕过 | src/index.ts |
| D81 | `agentForward: true` + 宿主无 `SSH_AUTH_SOCK` → ssh2 同步抛错，该目标每次都连不上 | src/ssh-exec.ts |
| D82 | 保存飞行期间删除的主机指纹被静默丢弃：钉扎删不掉，UI 却显示已删 | client-src/index.js |
| D83 | `finish()` 清空背压队列：`end`/队尾帧被丢，慢客户端重连并**重拉镜像** | src/index.ts |
| D84 | 关掉「允许变更操作」不终止在途的镜像拉取流 | src/index.ts |
| D85 | attention 候选 >300 时第 301 条起没有 inspect 详情，`degraded` 仍为 false | src/docker.ts |
| D86 | 300 id 单批 inspect × 默认 512KB：一截断就**整批**降级，D11 判据整体失效 | src/docker.ts |
| D87 | crash-loop 补捞预算被合法候选吃光 → D11 在最需要时不出手且零信号 | src/docker.ts |
| D88 | `stream()` 的 `busy` 记在重连前的废条目上：配额失效 + 长流 120s 后被 sweeper 掐断 | src/ssh-exec.ts |
| D89 | D35 新增的「无效条目已丢弃」warning 是死代码，永不触发 | src/index.ts |
| D90 | D21 只推 `config` 不推目标列表：下拉里有已删目标、缺新目标 | client-src/index.js |
| D91 | `content-visibility` 让 `scrollHeight` 变估算值 → FOLLOW 贴底失效、「回到底部」也回不到底 | client-src/docker.css |
| D92 | 聚合日志重建流时不复位 `atBottom`（D61 只做了一半） | client-src/index.js |
| D93 | 重连补偿改走共享尾沿防抖，事件密集时被无限取消 | client-src/index.js |
| D94 | 占位条目在建连途中被摘掉后，`ready` 仍 resolve 出一条脱管连接 | src/ssh-exec.ts |
| D95 | `closePanel()` 管不到 tab 实例：从连接栏进入仍可并存两个面板 | client-src/index.js |
| D96 | 新安全闸门的拒绝分支零回归（删掉调用，三套脚本 + 119 例仍全绿） | scripts/route-smoke.mjs |
| D97 | `/action`、`/stats`、`/exec`（空 command）仍回 500 而非 400 | src/index.ts |
| D98 | `POST /logs` 的 `since` 仍未过 `assertSince`、空串在工具侧报「必填」、在 SSE 侧被忽略 | src/index.ts |
| D99 | `assertSince` 与 docker 口径两向不吻合（`1.5h`/`0` 被拒，裸日期被放行） | src/docker.ts |
| D100 | 单目标 `docker_attention` 的渲染丢 `total/truncated/degraded` | src/index.ts |
| D101 | 面板与 `/attention` 路由都没接 `total/truncated/degraded`，计数静默 ≤100 | src/index.ts |
| D102 | `parseInspectPorts` 仍整段丢弃区间端口（详情比列表少端口） | src/docker.ts |
| D103 | 区间端口字段无任何消费方：显示成单端口（`8000→8000/tcp`） | src/index.ts |
| D104 | `imageInspect` 的两段 `docker history` 从不检查 `truncated` | src/docker.ts |
| D105 | `assertComplete` 把「静默部分结果」变成「整体失败」，文案对 agent 不可执行 | src/docker.ts |
| D106 | `FRESH_UP_RE` 只认 ≤59 秒，与 `ATTENTION_FRESH_MS`（120s）不一致 | src/docker.ts |
| D107 | `refreshTools` 半套注册 + D09 差异判定 → 重存同一配置不自愈 | src/index.ts |
| D108 | `sameTargets` 按下标比较：仅顺序变化即收流 | src/index.ts |
| D109 | `hostKeysRemove` 与并集顺序：同一请求的删除被撤销、非法形状静默忽略 | src/index.ts |
| D110 | 请求路径内的 DNS 判定无超时、无缓存，且发生在写响应之前 | src/index.ts |
| D111 | `poolKey` 未小写化：同一主机建两条连接，通道额度被悄悄翻倍 | src/ssh-exec.ts |
| D112 | `run()` 的 `inflight` 只靠 channel 事件释放，超时定时器不兜底 → 连接永不回收 | src/ssh-exec.ts |
| D113 | 数字输入框无法「清空再重打」（空串被整数正则拒绝） | client-src/index.js |
| D114 | `sessionScoped` state 化后，`deps: []` 的挂载 effect 仍读首帧闭包 | client-src/index.js |
| D115 | README 的 `hostKeys[]` 表仍是单数 `fingerprint` | README.md |
| D116 | README 路由表 `/attention` 行仍是旧形状（只有 `items`） | README.md |
| D117 | README 未记录 D32 收紧的行为（缺同源证明 → 403） | README.md |
| D118 | README 的 vitest 清单仍写「六套」，漏掉本波新增的 `ssh-connect` | README.md |
| D119 | CI 补了、**发布闸没补**：`release.yml` 仍零执行三套脚本 | .github/workflows/release.yml |
| D120 | `files` 加了 `scripts` 仍不够：`client-smoke` 读未发布的 `client-src/` → `npm run smoke` 仍坏 | package.json |
| D121 | 三套看门狗在主体结束即 `clearTimeout`，退出前的排空期失去保护 | scripts/client-smoke.mjs |
| D122 | 建连超时路径脚本/单测双双归零，且 15s 用例上限 < 20s 建连超时 | scripts/route-smoke.mjs |
| D123 | 本波新行为（`inflight`/`keepTail`/无 sock 的 `agentForward`/`assertSince`）零自动化覆盖 | test/ssh-connect.test.ts |
| D124 | 新测试里 `auth=key` 用例名与断言不符（实际走 password 分支） | test/ssh-connect.test.ts |
| D125 | README（中）两处删「（N 项）」时吃掉了后面的空格 | README.md |
| D126 | 目标引用的连接簿条目失效时**界面上看不出来**：`book` 下拉的候选来自 ttyBooks，失效名字没有对应 option → 下拉渲染成**空白**；且错误文案让人「去 tty 终端面板的设置卡片里添加」，而那张卡片改不了 docker 目标的引用 | src/index.ts、client-src/index.js、client-src/session-target.js |
| D127 | docker 设置卡片「目标名」输入框**打一个字就失焦**：`dk_targetRow` 的 React key 写成 `String(index) + item.name`，key 含被编辑的字段 → 每次输入 key 变化、React 卸载重建整行，输入框当场丢焦点（表现为"无法聚焦"） | client-src/index.js |
| D128 | 日志大流量**逐 chunk 全量重渲染**（打开 FOLLOW 的 tail 突发即数百次全量 reconcile，且每 chunk 对全缓冲 join/split 大字符串）叠加**缓冲只限行数不限字节、残行无界** → 话痨 / 大行容器把渲染进程吃到 OOM，网页直接崩溃 | client-src/index.js、client-src/log-buffer.js（新增） |
| D129 | 修 D128 时顺手把显示层截断到 400 行（并另设 2000 行导出上限）——`LINES` 选 5000 实际只显示 400 行，与「选多少看多少」的设计不符；且「行数闸」与设置卡片的「输出上限（KB）字节闸」在 UI 上没区分 | client-src/index.js |
| D130 | `docker_ps` 把双栈端口渲染成重复映射：去重键含 hostIp（`0.0.0.0` 与 `[::]` 不同），render 又丢掉 hostIp → `6379→6379/tcp,6379→6379/tcp`；顺带修掉裸 `84->84/tcp` 被切成 `hostIp:'8'` | src/docker.ts、scripts/smoke.mjs |
| D131 | host 网络容器在 `docker_ps` 里 `ports` 为空，与「确实没暴露端口」无法区分（用户为此多 inspect 了 5 个容器） | src/docker.ts、src/index.ts、client-src/index.js |
| D132 | `docker_inspect` 未命中只回 `No such object: <id>`，不给近似候选（如 `607023340cbb_rmqnamesrv`） | src/docker.ts、src/index.ts |
| D133 | 日志流断线重连**重放历史**：EventSource 自动重连复用带 `tail` 的 URL，服务端把最后 tail 行当新行重推，客户端缓冲只在 effect 重跑时重建 → 日志里凭空多出一段重复并挤掉真正的历史；宿主侧 8MB 背压队列溢出走静默 `res.end()`，客户端把它当「流正常结束」再自动重连，同样触发重放 | src/docker.ts、src/index.ts、client-src/log-stream.js（新增）、client-src/index.js |
| D134 | 镜像拉取进度流**逐行落地**：每个 SSE line 都跑一次 `mergeProgress`（slice + 重建 key 索引，O(行数)）再 `setLines` → 长拉取（多 GB / 数十层）时每秒数百次 2000 行重渲染，与 D128 同一类写法只是量级小 | client-src/index.js |
| D135 | 日志级别过滤对 `%5p` **右填充**的级别（`[INFO ]` / `[WARN ]`）完全失效：选到 `WARN+` 乃至 `ERROR+` 仍显示一屏 INFO，且这些行**没有分级着色** | client-src/index.js |
| D136 | `LINES` 选 N 行、右侧计数显示 **N+1**：快照切分用 `text.split('\n')`，而 docker logs 每行都以 `\n` 结尾（终止符），于是多切出一条空行——计数多 1、末尾多一条不可见空行、导出也多一行；同一份日志在快照视图与 FOLLOW 视图下行数不同 | client-src/index.js、client-src/log-buffer.js |
| D137 | 日志导出的两个格式（`.log` / `.md`）各占一个 chip，窄面板下 `.dk_filterBar` 一换行 `.md` 就被甩到第二行、把行数计数也带下去，工具条长成两行 | client-src/index.js、client-src/docker.css |
| D138 | 单目标数据路由的目标侧失败（SSH 不可达 / 私钥读不到 / docker 不在）被统一写成 **500**，而 `target:'*'` 对同一件事回 200 + `groups[].ok:false`——同一句错误两种形状，「目标不可达」被当成服务端故障 | src/index.ts |

## 2. 编号字典：这段代码为什么长这样

> 本节由原「修复记录摘要（第一轮 D01–D79 / 第二轮 D80–D125）」**重排**而来，「决策 / 机制」
> 一列是原文，未改写；**「相关编号」一列是本次新加的逆向索引**（依据 §1 的症状列回填，
> 非原文自带），用途是让 §1 的编号能反向查到设计意图。行号、提交号一律不写。

| 主题 | 决策 / 机制（原文，未改写） | 相关编号 |
|---|---|---|
| 连接生命周期 | 空闲回收把**在途的一次性命令**计入 `inflight`——长流之外的一次性长命令不能被中途掐断 | D01、D112 |
| | 并发首连**先占坑再 `await`** 建连配置，避免同目标并存两条连接、先建的那条脱管 | D02、D94 |
| | `dropConn(key, client)` 带**身份校验**：陈旧 close/error 不得摘掉同键上的新连接 | D06 |
| | 传输错误重连前先 `end()`；**配额类错误不再触发重连**（否则泄漏健康连接 + 可操作文案永不到达用户） | D07 |
| | `ByteSink` + `StringDecoder` 统一解码，跨分片的多字节字符不再变 U+FFFD | D08 |
| | `keepTail` 让 logs / pull / prune **保留尾部**（截断宁可丢开头，也不丢最新行与 digest） | D14 |
| | SSH 池键小写化：同一主机不得建两条连接，把通道额度悄悄翻倍 | D111 |
| SSE | 背压队列 + `drain` 续写 + 每流 **8MB** 上限（超限视为客户端已死）；收尾前把队列交给 `res.end` 落地，**队尾帧不能丢** | D04、D83 |
| | 按 `enabled` / `dockerBin` / `targets` 的差异收流；**撤销 `allowMutations` 也收流** | D09、D84、D108 |
| attention | 返回 `{items,total,truncated,degraded}`——**截断与降级必须有信号**，不许静默（含单目标渲染与面板计数） | D12、D42、D85、D100、D101 |
| | **先按严重度排序再截断**；crash-loop 判据 = 重启 ≥3 且 2 分钟内刚启动 | D11、D12、D87、D106 |
| | 分块 inspect + **补捞独立预算** + 未取到详情计入 `degraded` | D85、D86、D87 |
| 解析与命令 | `assertComplete` **截断即抛**，并给出**可执行替代**（把「静默部分结果」换成明确失败） | D13、D104、D105 |
| | docker 零值时间归一为 `null`，否则破坏「最近出事优先」排序、详情显示公元 1 年 | D41 |
| | **端口区间不再丢弃**，列表与详情同口径 | D40、D102、D103 |
| | `assertSince` **一处实现三处共用**；空 `since` 视为未传（而非 `Number('')` 落进 0） | D45、D98、D99 |
| | `assertBin` **逐 token** 挡 `-` 开头 | D43 |
| | inspect 端口去重键含 hostPort **与** IP，双栈绑定不得并成一条 | D38、D130、D131 |
| 配置与凭据 | hostKeys **并集**合并 + 显式 `hostKeysRemove`（**删除优先于并集**） | D10、D109 |
| | 凭证按「**连接身份**」而不是名字继承——改名不再静默清掉已存口令 | D15 |
| | 指纹改 `fingerprints[]` 且 host 小写化 | D03、D115 |
| 客户端 | `config` publish/subscribe：已打开的面板**即时跟随**开关变化 | D21、D90 |
| | `active` 进 effect 依赖：**折叠 / 隐藏的面板不许继续占用 SSH 通道** | D17、D18 |
| | 初始目标对列表校验：目标被删/改名后「每次打开都停在未知目标且不自愈」是坏的 | D19 |
| | **请求序号**防旧响应覆盖；重连补偿**不共用**同一代际防抖（事件密集时会被无限取消） | D62、D93 |
| | 目标缓存 TTL 必须**真读**（`cacheAt` 只写不读 = 对 README 与注释的死承诺） | D66 |
| | 数字输入改**本地草稿**：飞行期间的编辑（含刚敲的密码）不被整表回滚 | D69、D113 |
| | 键盘可达性：抽屉拖拽条 / 日志区可聚焦 / 总览表行 / 键盘触发菜单定位 | D64 |
| | 日志渲染必须有上限（后被 D128/D129 改为**行数 + 字节双限、显示层不截断**） | D63、D128、D129 |
| 工程闸门 | 三套脚本 **hermetic 化 + 看门狗 + 进 CI「与发布闸」**——只在 CI 跑等于没跑 | D25、D70、D71、D119、D121、D122 |
| | `files` 补 `scripts` 与 `client-src`：advertise 的 `smoke` 必须**真能跑** | D72、D120 |
| | `client-lint` 锚点放宽到**全部** client-src 模块（否则兄弟模块的诊断被静默丢弃） | D74 |
| | TOFU 指纹与 SSH 连接构造补单测（无覆盖的关键路径） | D73、D123 |
| 安全围栏 | loopback 白名单 127/8 + `::1` + IPv6 映射；**别名主机名不等于放行** | D31、D80 |
| | 别名主机名走带 **500ms 超时与 60s 缓存**的 DNS，且来源检查（`Sec-Fetch-Site` / `Origin`）**提到 DNS 分支之前** | D80、D110 |
| | 四条 SSE 与变更子路由要求**同源证明**；**新闸门必须带「拒绝分支」的负例**——差异化的回归测试 | D32、D96、D117 |
| 通用反模式 | 「同一件事实现在两处」必然给出两个答案：切分规则 / 渲染路径 / 闸门判定都要**收成一份定义** | D44、D95、D108、D136、D137 |

### 2.1 D126–D138（用户实测 / 现场复核 / 真机波）的**刻意取舍**

这 13 条的 postmortem 正文已冻结进 git（见 §4）。**唯独"刻意不做什么"必须留在正文**——
不写下来，下一个人会把它当成遗漏给"补上"。

| 编号 | 取舍（刻意不做 / 为什么这样写） |
|---|---|
| D126 | tty 未安装 / 连接簿为空时**不标失效**——那是「宿主没装 tty」，与「引用了一个不存在的名字」是两回事，标黄会误导 |
| D127 | 只把 key 从 `String(index) + item.name` 改成 `String(index)`。`activity` 的 key（`index+name+time`）**不是 bug**：纯展示、不可就地编辑，key 变化打断不了任何输入，不一起改 |
| D128 | 行 key 用**单调 id** + 缓冲**行数 / 字节双限**（`log-buffer.js`）+ FOLLOW **150ms 合帧**：渲染频率与 chunk 速率解耦、内存有界 |
| D129 | **显示层不截断**——`LINES` 选多少渲染多少。D128 里"顺手"限成 400 行正是本案要撤销的过度修正 |
| D130 | `docker_ps` 的去重键要含 hostIp，**并且 render 要真的输出 hostIp**；两者缺一，双栈就渲染成重复映射 |
| D131 | host 网络容器的 `ports` 为空**必须**与「确实没暴露端口」可区分（否则用户只能逐个 inspect） |
| D132 | 未命中时给近似候选，但**不改变「没找到」这个结论** |
| D133 | **首连带 `tail`、重连一律 `tail=0`**（`--tail 0` = 不补历史、只跟随）；宿主在背压溢出前补 `end{reason:'output-limit'}`，客户端据此提示「主机侧积压」而不是静默重连。代价：真机语义（docker CLI 对 `--tail 0` 的处理）**首连时待现场验证** |
| D134 | 真相源仍是 `linesRef.current`（同步更新、结束时不会丢行），**只把 DOM 落地改成 150ms 合帧**；`end` 前 `flushNow()` 把窗口里剩余的行刷出去，卸载时清定时器 |
| D135 | 正则**只放宽方括号内的空白**，**不放宽到裸级别名**（`INFO ...`）——那会把正文里以 ERROR 开头的行也吃成级别前缀。**宁可少认，不可误认** |
| D136 | 切分收进 `splitLogLines()`，**只剥结尾一个** `\n`（`a\n\n` 是两行，空行要留住）。**刻意不剥 `\r`**：`pushChunk` 也不剥，两个视图必须继续给同一答案 |
| D137 | 复用既有 `openLogMenu` 浮层，**不另造下拉**——Esc / 点外部 / 滚轮 / 触摸 / resize 的关闭语义必须与右键「问 Agent」菜单一致；两个格式收成一份定义供两个视图共用 |
| D138 | `guardTargetFailures` **只标「从 `api.*` 抛出的错误」**。刻意**不是**「把外层 catch 全改成 200」——那会让我们自己的 bug（如解析写错抛的 TypeError）伪装成「目标不可达」，正是本仓最忌讳的静默错误结果；也**没有**逐个调用点包 try/catch（20 处，必然漏几个——D80–D125 那批 29 条就是这么来的） |

## 3. 复核方式（原文标称 0.7.0 基线，见 §现状的标注）

- **单测与静态检查**：`npx vitest run packages/docker`（**8 套 157 例**）、`npx tsc --noEmit`、
  `node scripts/client-lint.mjs`（忽略 7 条已知噪音 TS2307×4 + TS2339×3）。
- **旗舰脚本**（都需先 `pnpm --filter @hyzyn/dsh-docker build`，它们读 `lib/`）：
  `node scripts/smoke.mjs`（44/44）、`node scripts/route-smoke.mjs`（61/61，hermetic，实测 0.7s）、
  `node scripts/client-smoke.mjs`（72/72，实测 0.6s）。三套都在 CI（ubuntu-only step）与发布闸里跑，
  并带看门狗（单例 25s / 全局 90s；末尾 `process.exit` 保证退出）。
- **产物与源码一致**：`pnpm -r build` 后
  `git diff --exit-code -- 'packages/*/client.js' ':(glob)packages/*/lib/**'`（CI 闸门；
  `:(glob)` 为什么必需见 [conventions.md § 真机脚本与 CI 接线](../../docs/conventions.md#真机脚本与-ci-接线)）；
  0.7.0 时另用内存重建逐字节核对过 `client.js`（229759 字节，`identical: true`）。
- **真机 / 浏览器（0.7.0 时本机无法验）**：多容器 `docker stats` 的重复采样顺序、端口区间在
  `docker ps` / `docker inspect` 里的输出形状、crash-loop 的实机形态、别名 Host 的部署形态、
  移除 `content-visibility` 之后的贴底手感、窄面板下的过滤条像素。当时本机 docker daemon 未运行，
  这些项以「可达性未经实测」为准。（后续 D130–D138 已用 test profile 与 Windows 真机补上部分现场。）

## 4. 冻结记录：被移出正文的内容在哪

> 「信息只搬家、不丢失」的检索入口。每条被移出的 postmortem 都**仍在它自己的修复提交里**，
> 用 `git show <sha>:packages/docker/DEFECTS.md` 取回该时点的全文。

| 范围 | 在哪 |
|---|---|
| **D01–D125** 逐条证据 / 触发场景 / 修法（约 1200 行，含两轮审计原文与「附录」） | `git show 96cf4305:packages/docker/DEFECTS.md` |
| 修复波自身的落点（D01–D125 全量提交） | `git show a6c8b62d --stat` |
| 本文上一次瘦身（1201 → 247 行，确立「索引不写行号」） | `git show a546e52c` |
| D126 / D127 详细章节 | `git show 8fbd490f:packages/docker/DEFECTS.md`、`git show 6f6c5a03:packages/docker/DEFECTS.md` |
| D133 / D134 详细章节 | `git show ac386ca2:packages/docker/DEFECTS.md` |
| D135 / D136 详细章节 | `git show 4a6e9157:packages/docker/DEFECTS.md`、`git show d84fc837:packages/docker/DEFECTS.md` |
| D137 / D138 详细章节 | `git show 504182cf:packages/docker/DEFECTS.md`、`git show c9d6d52e:packages/docker/DEFECTS.md` |
| 被移出的「第一轮 / 第二轮修复记录摘要」逐条清单 | 本文 §2 已完整覆盖（决策原文 + 新增逆向索引） |

> D128–D132 **从未有过详情节**（只有索引行），不是本次移出的。

## 5. 待办 / 路线图

**已拆分为独立文档：[ROADMAP.md](./ROADMAP.md)（8 项，一项未删）。**
本文只放「已经发生的事」；「还没做的事」一律去那里。
