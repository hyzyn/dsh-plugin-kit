# @hyzyn/dsh-docker 缺陷编号字典

> **这份文件是代码注释的编号字典，不是审计报告。**
>
> `src/` / `client-src/` / `test/` / `scripts/` 里有大量 `（Dxx）` 注释，含义是「这段代码为什么
> 长这样」，编号的出处就是本文。拿到任意一个 `（Dxx）`：先查 [§1 编号索引表](#1-编号索引表)
> 知道**当年坏了什么**，再查 [§2 编号字典](#2-编号字典这段代码为什么长这样) 知道**所以代码为什么
> 写成这样**。
>
> **编号是硬契约**：`D01–D163` 是 `packages/docker` 内部序列，与 `packages/tty/DEFECTS.md` 的
> `D01–D95` **不共享**；跨包引用请写「docker D03 / tty D12」。新缺陷接在 `D163` 之后，
> **不得重号、不得回收空号**——源码里已有注释指向它们。

> **本文不含**：逐条 postmortem（症状 / 现场复现 / 根因 / 修法 / 回归 / 反向验证）。
> 那是 commit message / PR description 的内容；本文只留**结论与取舍**，正文在哪见
> [§4 冻结记录](#4-冻结记录被移出正文的内容在哪)。


## 维护规则

> **通用条目已上收到 L0，本块只留指针**（同一条规矩原先逐字抄在三份 `DEFECTS.md` 里，改一处
> 漏两处）。条目编号保持不变，各处「维护规则 N」的引用继续有效；**包特有的东西不在上收范围**
> ——本文件里的 ⚠️ 标注、§4 冻结记录说明都留在原地。

1. **新缺陷只做两件事** → [conventions.md § 编号规范 硬规矩 7](../../docs/conventions.md#编号规范)。
2. **索引表的归档判据** → [同上，硬规矩 8](../../docs/conventions.md#编号规范)。
3. **索引表的写入纪律** → [同上，硬规矩 4](../../docs/conventions.md#编号规范)。
4. **阈值 / 口径 / 基线数字只增不改** → [conventions.md § 文档分档 三条纪律第 3 条](../../docs/conventions.md#文档分档)。

> ⚠️ **标注（本次未擅改）——规则 2 的阈值已被现状越过。**
> 当前索引表 **140 行**，远超 80 行；但 `D01–D140` 里有 **115 个编号**被（该数在 `D138`
> 时点实测，未重算）
> `src/` / `client-src/` / `test/` / `scripts/` 引用（共 320 处 `（Dxx）`），
> 整批搬去 archive 会让源码里的注释失去解析处。**归档只能针对"已不再被源码引用"的编号**，
> 当前一个这样的编号都没有。故此处只记录规则与现状，不执行搬迁。

## 现状

**已修 163 / 待修 0**，编号至 `D163`。逐条症状见 §1，设计意图见 §2，**还没做的见
[ROADMAP.md](./ROADMAP.md)**。

> ⚠️ **标注（本次未擅改）——两处口径不一致，原文未改：**
> 1. 本文原开头写「**125 条已全部修复**，随 docker 0.7.0 发布」；而编号已到 `D140`
>    ——「125」是 0.7.0 时点的数字，此后用户实测 / 复核 / 真机波又加了 `D126–D140`（15 条）。
> 3. **⚠️ 2026-09-26 补记（计数漂移已修）**：`D139` 是上一轮加进索引表的，但当时**没同步
>    更新「现状」行与文件头的编号范围**（仍写 `已修 138 / 编号至 D138`，而表里已有 139 行）。
>    本次把计数改成与表内一致（`已修 140 / 编号至 D140`，含新增的 D140），并按
>    [conventions.md § 编号规范](../../docs/conventions.md#编号规范) 的硬规矩在此记下漂移是怎么发生的。
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
| D139 | 桌面版四条流全断：桌面壳把 `dsh-app://app/api/…` 的请求转给宿主时删掉 `Origin` / `Sec-Fetch-Site`、只重写 `Cookie`，而 D32 的同源证明要求两者之一 → 四条 SSE 与八条变更路由在桌面版**全部** 403；客户端看到的是无限「连接中断，正在自动重连…」+ 0 行日志，宿主侧当时**一条日志都没有**（同面板的只读路由照常可用，所以看着像"只有流坏了"） | src/index.ts、test/logs-stream.test.ts、test/streams.test.ts、README.md、README.en.md |
| D140 | 代理命令（ProxyCommand）失败时的错误文案**可能只剩一句「连接已关闭」**：ssh2 一看到流断了就报错，而「子进程退出 / 传输关闭」这两个事件比它晚 1~2ms，那一刻失败事实还是 null → 用户拿不到子进程自己打印的原因（`ECONNREFUSED` / `Cannot find module` 这类）。**只有真机验收能暴露**（真 ssh2 + 真子进程的时序） | src/ssh-exec.ts、test/ssh-proxy-command.test.ts |
| D141 | 能力开关的有效值（**配置 && 已授权**）被折叠进 `live`，而 `applySection` 重算的输入也是 `live`——于是「配置早就是 true、之后才拿到授权」这一路永远回不到有效值：授权到了、破坏档工具却不注册（半个状态）。`onGrantChange` 里调 `applySection({})` 也救不回来，因为折叠后的 `false` 已经把配置里的 `true` 吃掉了 | src/index.ts（把**配置值**单独留一份 `configuredCapabilities`，重算时用它覆盖折叠值）、test/elevate-route.test.ts（配置预言 true + 授权到达 → 工具立即注册，且全程**没有** `/config` 写入） |
| D142 | `snapshot()` 只回 `*Granted`，不回**配置值**与**授权来源**：「配置开着但没获授权」这个状态在界面上无法表达（只剩一句长黄字，用户多半当成插件坏了），「撤销」入口也无从区分带外授权（可撤销）与启动环境授权（撤不了，只能去改启动环境） | src/index.ts（新增 `*Configured` / `*GrantSource`）、client-src/index.js（未生效徽标 + 来源行）、test/elevate-route.test.ts |
| D143 | 设置卡片有 6 处文案带字面 `**`（`hint.byteCap` / `hint.logTailDefault` / `hint.maxOutput` 的 zh 与 en）——客户端没有 markdown 渲染器，用户看到的是两个星号 | client-src/index.js（改成「」/ “”）（目录头注释里写明这条规矩） |
| D144 | 同源证明的判据是「**精确子路径** + POST」：`/elevate` 族有三条子路由，只把 `'/elevate'` 写进 `MUTATION_SUBROUTES`（或把某一条做成 GET）会让另外两条**裸奔**——跨站页面能撤销授权、能反复对着确认挑战试错。**从测试里才发现**：一开始把整段分发写在证明检查**之前**，等于所有子路由都不设防 | 三条子路径**逐条**列入 `MUTATION_SUBROUTES`、全做成 POST、分发挪到证明检查之后；test/elevate-route.test.ts 逐条断言 403（并核对错误文案是「同源证明」那条） |
| D145 | 建连失败时 ssh2 会 emit **不止一个** `error`（socket 层一次、client 层的「握手完成前关闭」再一次），而 `acquire()` 用的是 `client.once('error')`：第一个 error 消费掉监听之后，第二个成了「没有监听者的 `error` 事件」——Node 按约定**直接抛成 uncaught exception**。症状是「目标不可达」这条最平常的路径把进程带崩：本机 `pnpm test` 22 条断言全过、**退出码却是 1**（vitest 只把它记成 runner 级 Unhandled Error，任何断言都不会变红，所以既有用例在修之前也一直是绿的） | `client.on('error')` / `client.on('close')` 常驻（`settleError` 已按 `settled` 幂等，重复进来是 no-op）；test/ssh-connect.test.ts 新增一条**自己接住 `uncaughtException` 并断言「一次都没发生」**的用例——反向验证过：把两处改回 `once` 就能让它红 |
| D146 | 同一个设置卡片里两种「删除」外观：目标行的删除按钮是 `.dk_btnDanger`（红框、按内容宽、右对齐），TOFU 指纹行那一处却只写了 `.dk_btn`——于是它既不吃 `.dk_targetRow > .dk_btnDanger { justify-self: end }`（被拉满 150px 的操作列），又是中性色。两行用的是**同一套**列模板（`1fr 96px 1fr 150px`），同一个卡片里两种删除说不通 | TOFU 那处补上 `dk_btnDanger`；CSS 规则改成按**位置**生效（`.dk_targetRow > .dk_btn, .dk_targetRow > .dk_btnDanger`），后来人换类名也不会掉出去。实测 6 个按钮（3 目标 + 3 指纹）类名 / 宽度 50 / 右缘 1067 / 边框与文字色全同 |

| D147 | 可点的开关行**没有手型**：`input[type=checkbox]` 的 `cursor` 由浏览器 UA 样式定死（`default`），**不随 label 继承**——`.dk_check` / `.dk_capRow` 只给 label 写 `cursor: pointer` 时，鼠标停在最该点的那 16px 复选框上却是箭头（用户反馈：「这个没做手型」） | 两处都补 `.dk_check input[type="checkbox"], .dk_capRow input[type="checkbox"] { cursor: pointer }`；真机实测（CDP）label 与 checkbox 的 computed cursor 都是 `pointer` |
| D148 | 「撤销宿主授权」与**同一个卡片里的 `删除`** 风格不一：删除（目标 / 指纹）是危险色，撤销却是中性灰——两处都是「按下去少一条记录、要重新配回来」的动作，红/灰混用会让人以为撤销可随手点；而且 tty 卡片那份 `tt_capRevoke` 本来就是危险色，同一个按钮在两个卡片里两种样子（用户反馈：「为什么撤销的按钮风格不统一」） | `className` 加上 `dk_btnDanger`（与那 6 个删除按钮**同一个类**，实测同为 `rgb(236, 19, 19)` + 危险色边框）；`dk_capRevoke` 只留「右对齐」那一条 |
| D149 | 提权面板的动作按钮与说明文字**混排**：命令、复制、倒计时、等待说明、重新生成各占一条栅格行，「重新生成」被两行说明文字隔在下面——按钮离自己的命令越远，越像「不知道点了会发生什么」（2026-09-27 真机报告：Windows 缩放下的截图里这一整片读起来是散的）。同一份报告里的「这两个按钮没有手型」**未复现**：`.dk_btn` 从 docker 0.1.0 起就写着 `cursor: pointer`，CDP 实测 computed cursor 为 `pointer`、按钮中心命中自身；宿主 CSS 的 58 条 `cursor` 规则与全部 `html[data-platform=…]` 规则也压不掉它 | `client-src/index.js` 把「复制 / 重新生成 / 倒计时」并成 `.dk_elevActions` 一行、紧贴命令；`client-src/docker.css` 给面板与步骤容器加 `grid-template-columns: minmax(0, 1fr)` + `min-width: 0`（命令是等宽长串，auto 轨道按 max-content 会顶出卡片右边界，窄栏 + Windows 125%~150% 缩放最明显），动作行 `flex-wrap: wrap` 兜住极窄宽度。CDP 实测 360/420/520/700/900px 五种宽度：面板不溢出、命令在框内横向滚动、两个按钮均命中自身 |
| D150 | 一个 SSH 目标只维持**一条**连接，而远端 `MaxSessions` 的 10 个 session 槽是**按连接**算的：长流上限 8 留出的两条余量只够**串行**的短命令用，可真实面板一次点击就会并发发出不止两条（详情页的概览 inspect + 日志快照 + 统计快照），agent 侧也会并发调 `docker_logs` / `docker_inspect`。多出来的那条通道被远端**直接拒绝**：用户看到「FOLLOW / 自动刷新都关着，日志却读不出来」，报 `(SSH) Channel open failure: open failed`——248 的 sshd 侧原文是 `error: no more sessions`（2026-09-29 14:24:55–14:32:19，同一条连接反复拒收）。更糟的是这条连接**不会自己恢复**：中止长流时发的 `signal('KILL')` 在部分 sshd 上被拒（`error: session_signal_req: session signalling requires privilege separation`），而 sshd 在子进程仍活着时**延迟释放** session 槽（`session.c`：`delay detach of session`），于是插件侧 `busy` 已归零、远端仍占着槽位 →「重试」永远打在一条满连接上（每次 `acquire()` 还刷新 `lastUsed`，连 120s 空闲回收都推后了），直到连接被换掉才恢复（实测 14:31:18 换连接后立刻正常，此前 13:59 / 14:06 两次配置保存也各换过一条） | `src/ssh-exec.ts`：① 新增 `ShortChannelGate`——**每个池键最多 2 条并发短命令**，其余 FIFO 排队（名额转交而非「先减后加」，不许新来的抢走刚释放的名额；`DSH_DOCKER_SHORT_CHANNELS` 可覆盖，仅测试 / 排障），`disposeAll()` 放行排队者；② `openChannel` 新增 `isChannelExhaustedError`（认 ssh2 的 `Channel open failure` / `open failed` 与 sshd 原话 `no more sessions`）分支：与传输错误一样**丢连接 + `end()` + 重建一次**，并留一行 warn（D07「不重连」的取舍在此让位于「满连接不会自愈」，但 `end()` 与可操作文案都保留）；③ `describeExecError` 文案补上「插件已重建连接自动重试一次」；④ `stream()` 的中止路径注明「KILL 不保证生效、槽位延迟释放」这一事实。回归：`test/ssh-channel-gate.test.ts`（假 ssh2 真跑 `RemoteExec`：闸门把 3 条并发压成 2、额度满换连接且旧连接被 `end()`、重连后仍失败只重试一次、调大上限后并发升到 3 的反向验证）。**有意接受的代价**：重建会断开该连接上正在跟随的长流，由面板 SSE 自动重连（日志流按 D133 用 `tail=0` 续尾）——比「一条永远满的连接 + 重试永远失败」划算 |

| D151 | 日志 / 拉取流是**一个 stdout chunk 一帧 SSE**：分片边界由上游决定（未缓冲 stdout 的容器逐行 flush，`docker logs -f` 推多快就多碎），而每个 chunk 的固定开销与「一行多少字节」**无关**——服务端一次 `JSON.stringify` + 一次 `res.write`，客户端一次 SSE 派发 + 一次 `JSON.parse` + 一次 `pushChunk`（字符串拼接 + 扫换行）。话痨容器每秒几千个 chunk 时，这些固定开销全砸在浏览器主线程上，与 D128 已治好的「逐 chunk 重渲染」是两笔独立的账。实测（`scripts/log-perf.mjs` 的事件洪泛剖面，**同一行速率** 6.2k 行/秒）：每事件 1 行 → 事件循环最大延迟 49~53ms、1 个 >50ms 长帧；每事件 50 行 → 37~38ms、0 个 | `src/index.ts` 新增 `createSseCoalescer`：50ms 窗口把分片按通道合成一帧（**同一通道严格保序**、stdout 先于 stderr、攒满 256KB 立刻推、`end` 帧前由调用方 `flush()`），日志流与拉取流两条 `run` 用它包住 handlers 并在 `finally` 里 `flush()` + `dispose()`。窗口 50ms 比客户端渲染合帧的 150ms 小一个数量级，用户看不见。回归：`test/sse-coalesce.test.ts`（窗口合并 / 跨窗口分批 / 攒满即推 / flush 幂等 / dispose 停表 / 空分片忽略）＋ `test/logs-stream.test.ts` 两条路由级用例（十个分片只出一个 line 帧；**未到窗口就收尾**时 `end` 仍排在这些行之后）。**本轮同时实测并否掉两条客户端「优化」**（记在这里，免得后人重做）：① 行元素缓存（按 id 复用 element 让 React bailout）在 5k 与 20k 行/秒下都是 ±0——瓶颈不在造元素；② 合帧间隔退避（150ms→800ms）把最大延迟从 85ms **抬到** 144ms——退避只是把同样的 DOM 改动攒进更重的一帧。稳态剩下的是**挂载 5000 行的 DOM churn**（20k 行/秒下 6s 内 25~26 个 >50ms 长帧）——D152 用窗口化挂载把它解决（见下一行） |

| D152 | 日志正文**挂着全部行**：5000 行 × 每行 4 个元素 ≈ 10000 个 DOM 节点，而持续洪泛时每一帧都要淘汰上千行、插入上千行——`scripts/log-perf.mjs` 的持续洪泛场景（20k 行/秒 × 6s）量到 25~26 个 >50ms 长帧 / 最大延迟 70~97ms，真机上就是「日志一快整页就卡」。同轮实测已排除两条更便宜的路（D151 记了：按 id 复用 element ±0、合帧间隔退避把最大延迟抬到 144ms）；`content-visibility` 也不能用（D91：估算高度打穿贴底判定） | `client-src/log-window.js`（新增，纯逻辑：实测行高缓存 + 前缀和 + 窗口定位 + 锚点修正，15 例单测）＋ `client-src/index.js` 的 `useLogRows`（两个日志视图共用：量高、锚点修正、贴底钉住在**绘制前**的 layout effect 里一次做完）＋ `.dk_logPad` 上下垫高。DOM 从 ~10000 节点掉到 ~230（实测挂 53~57 行）；**显示层不截断**落在数据上——全部行都能滚到、都能导出（`LINES` 选多少就是多少，D129 的语义未变）。实测改后：快照 5000 行 179ms / 229 节点；突发 20k 行最大延迟 2ms；持续洪泛 20k 行/秒 × 6s 最大延迟 6ms、长帧 >50ms **0 个**、213 节点。回归：`test/log-window.test.ts`（15 例）、`test/log-buffer.test.ts` 同层、`scripts/client-smoke.mjs` 的 `__logWindow` 缝与渲染期守卫（`ReactStub` 补 `useLayoutEffect`）、`scripts/log-perf.mjs` 新增**窗口化正确性**断言（滚到顶第一行必须是 `seq=0`、滚到底最后一行必须是 `seq=4999`、洪泛结束后最后一行必须是最新行）＋ 挂载行数上限 200。**真机回修（同日）**：第一版把「贴底锁存」只交给 scroll 事件算，banner 一弹（面板高度变）就被误判成「用户上滚」→ 跟随悄悄停掉，而窗口还按状态里的旧滚动位置渲染 → **正文空白**（用户现场截图）。现在窗口以 DOM 真实滚动位置为准（每次提交先同步、状态只是镜像），锁存只在「位置真上移且内容没变短」时才清，`.dk_logBody` 另加 `overflow-anchor: none` 挡住浏览器滚动锚定；`scripts/log-perf.mjs` 增加「积压 → 重连」回归（可见行数 / 回到底部按钮 / 重连后是否贴回最新行）。**第二处真机回修**：上滚判定改成**只认手势**（wheel / 触摸 / 拖滚动条 / 键盘，1.5s 窗口）——洪泛里位置被夹紧或抖动不再把跟随停掉（真机第二次截图里右下角冒出「回到底部」就是这个误判；顺带发现第一版把手势监听挂在 ref 上，而日志页不是首屏 tab、挂载时 body 还不存在 → 监听根本没生效，D61 会整个失效）。门禁两个方向都断言：真手势上滚**必须**停跟随并可一键恢复，无手势的位移**必须不停**且下一帧贴回最新行 |
| D153 | 背压处理有两个独立的老问题，叠在话痨容器上就是「日志页在重连里打转」：① **写过的帧被重排一遍**——`write()` 返回 false 只表示「越过高水位」，数据**已经收下**（Node 契约），老代码把它当失败又 push 进队列，drain 时会重写同一帧（客户端收到重复日志行，`pendingBytes` 也虚高）；② **积压就掐流**：队列超过 8MB 就补 `end{output-limit}` 收尾，客户端只能重连，而重连期间面板是「连接中断 + 正文不动」——真机现场（2026-09-29，LINES=5000 + FOLLOW + 话痨容器）正是这条：两条警告 banner 之后正文空白、状态在重连 | `src/index.ts` 的 `openSseStream`：① 写入契约改成三态 `tryWrite → 'ok' \| 'pressure' \| 'gone'`，`waitingDrain` 标记高水位，**写一次就是写一次**，drain 只续写排队的帧；② 新增 `overflow: 'end' \| 'drop'` 选项——日志流与拉取流（**文本尾部流**）用 `'drop'`：丢最旧的整帧、留最新，并推一条 `skip{frames,bytes}` 通知（`skip` 帧自身永不参与丢弃），流**不断**；统计流 / 事件流保持 `'end'`（采样少一个就是错，宁可收尾重连）。客户端：`client-src/log-stream.js` 新增 `skip` 监听与 `onSkip`，单容器视图用它写进提示横幅、聚合视图并进状态行（i18n `hint.logSkipped` / `hint.logSkippedNoCount`，中英各一份）。回归：`test/logs-stream.test.ts` 两条（背压不重写：越过高水位的帧只出现一次；积压后丢最旧 + `skip{"frames":1}` 且 `ended === false`）＋ `test/streams.test.ts` 一条（统计流仍走 `end{output-limit}`，假 res 补 `blocked` / `drain` 支持） |
| D154 | D152 的锚点修正**只补得到「量高」，补不到「淘汰」**：`reanchor` 以「本次渲染自己的 anchorOffset」为基准，同一份布局内量高产生的位移能抵消；但洪泛稳态下环形缓冲每帧都在淘汰最旧的行，锚点**上方**的总高持续变短、整个内容上移——用户上滚读历史时视口内容持续上飘，读史成了自动「倒带」。门禁此前没有「洪泛中驻留历史」的场景，这条一直漏网 | `client-src/index.js` 的 `useLogRows`：跨提交记一份稳定锚（上一帧可见区顶行 + 它当时的**绝对**偏移），下一帧用 `reanchor` 相对这份记录补偿——淘汰、量高修正、聚合视图按时间插行三类位移被同一个差值吸收；贴底时置空（绝对钉尾无需补偿）。`client-src/log-window.js` 新增 `offsetOf`（某行在当前缓存下的绝对偏移）。回归：`test/log-window.test.ts`（`offsetOf` 与「淘汰头部后补偿量 = 被淘汰行总高」两条）、`scripts/log-perf.mjs` 新增**驻留历史**场景（慢速洪泛下驻留 1.2s，可见区顶行必须还是同一行、位移 ≤24px；**判别性已实测**：把 `useLogRows` 退回旧逻辑后该断言确实失败）。**它的安全前提是换代必作废锚**（D155 的 `resetKey`）：快照行的 id 是位置寻址（`'s'+index`），快照刷新是「非空 → 非空」替换且同一 id 空间——不换代的话，跨帧锚会把**上一代的行**当成「该钉住的那一行」，几何也按上一代的高度算（旧代码用同一次渲染的 `anchorOffset`，反而没这条风险）。实测口径（门禁）：换代不作废时，刷新回普通行后 `scrollHeight` 虚高 **35644px**（135557 → 99913）——不会一次「传送」，但滚动条、跳转、「滚到顶看到第几行」全部按错的一代算 |
| D155 | `log-window` 的高度缓存**从未被清过**：模块契约写明「换流 / 重建缓冲时 `clear()`——行 id 会从 1 起复用」，但没有任何调用点。两个日志视图每次重开流都新建缓冲、id 从 1 重来，上一代容器行的实测高度被套到这一代同 id 的陌生行上。**快照刷新同样中招**：快照行 id 是**位置寻址**（`'s'+index`），刷新后同一 id 就是另一行内容，缓存不但错、还是「同名不同行」的错——它同时是 D154 跨帧锚在快照模式下的安全前提 | `client-src/index.js` 的 `useLogRows`：新增 `options.resetKey`（调用方说明「这一屏行属于哪一代缓冲」——单容器视图跟随传缓冲对象身份、快照传 `logs` 响应对象身份；聚合视图传缓冲身份），身份一变就 `clear()` + 作废锚点；「有行 → 空」保留为**兜底**信号（调用方漏传时仍能自愈，过滤把 `matched` 清空也会走到，清了重测无害）。回归：`scripts/client-smoke.mjs` 新增「换代作废」用例（源码级锁接线：hook 接 `resetKey`、换代分支同时清缓存与锚、两个视图都传、兜底信号不许丢、产物里能看到契约）＋ `log-window` 的 `clear()` / `offsetOf` 用例。门禁补了端到端场景（`scripts/log-perf.mjs` 的**换代回归**）：闸门自己喂的快照先刷成一代会折行的高行（每行 ~150px）并扫 6 个位置把它们量进缓存，再刷回普通行——判据是**几何**（这一代的垫高必须由这一代的实测高度算出来，`scrollHeight` ≤ 5000×20px + 余量），不是滚动位置。**判别性已实测**：把 `resetKey` 分支禁掉后该断言确实失败（滚动高 135557px vs 上限 115000px）。为什么不判滚动位置：跨帧锚本来就应该补偿视口上方行高的真实变化（D154 的正当职责），拿它当判据会把正确实现判成错的——第一版就是这么写错的，实测正确实现会位移 1881px 而被误报 |
| D156 | `skip` 账目**少报**：skip 帧排队期间（高水位未退）再发生丢弃，账目虽然累加了，却在 skip 真正写出时被 `tryWrite` 的清零一起吞掉——客户端看到的第一段缺口永远偏小，第二段缺口完全不可见。D153 的测试只覆盖「丢一批 → 报一批」，两批叠着丢没测到 | `src/index.ts` 的 `dropOldestFrames`：队列里已有未落地的 skip 时**原地更新**它的 `{frames,bytes}`（改还没写到 socket 的帧正合适，时序不变）；`tryWrite` 的清零仍发生在写出时。回归：`test/logs-stream.test.ts` 新增「skip 排队期间再丢弃」——46 块逐块对账，不变式「每一帧要么送达、要么被 skip 记账」（旧实现只报得出 15） |
| D157 | `skip` 提示两处小洞：① 客户端**覆盖**不累计——skip 是增量通知（每丢一批报一批），只显示最后一批在长洪泛里严重少报；② 聚合视图重连成功后**不清除**（单容器视图清），提示跨过重连一直挂着 | `client-src/index.js` 两个日志视图：各加一个累计 ref，`onSkip` 累加后显示累计值；`onStatus 'open'`（重连成功）时计数与提示一并清零——语义是「本次连接共跳过多少」。i18n 无新增（复用 `hint.logSkipped`，数字变累计值） |
| D158 | 设置面改挂 `plugins.bundle.config` 时**把共享的聚合包 key 当成了每包私有**：该槽的 key 是**共享命名空间**（同一 key 只能有一个注册者，重复注册**直接抛错**），而 `@hyzyn/dsh-all` 是所有插件共用的聚合 bundle —— 于是八个插件都去注册它，第二个注册者抛 `keyed slot "plugins.bundle.config" already has an entry for key "@hyzyn/dsh-all"`，客户端 `apply` 抛错 = 整个插件起不来，用户启动页直接变「Failed to load plugins」（现场两条：`@hyzyn/dsh-codegraph` / `@hyzyn/dsh-tty`，即抢 key 输掉的那些）。窗口期极短：从 `8ef7b6a9` 引入到 `237e8ac5` 修掉 | `client-src/index.js` 的注册块（八个包同一段）：**只挂本包自己的 bundle 名**；聚合包不挂内联位、继续走 `plugins.row.config` 的 `@hyzyn/dsh-all#<rowId>`（那份 row 入口即使内联可用也保留）；内联可用时只撤掉**本包**那份 row 入口；旧宿主回退注册全部 row 槽。定位方式（可复用）：把 profile + `$DSH_HOME` 复制到 `/tmp`，`DSH_HOME=… dsh --profile test --port <空闲端口>` 起隔离宿主，再用 `scripts/chrome-cdp.mjs` 抓浏览器侧 `Runtime.exceptionThrown`。回归：`scripts/test/plugin-settings-surface.test.ts` 新增 **bundle key 全仓两两不同、且不得是聚合包** 的跨包守卫（判别性已实测）；`packages/docker/scripts/client-smoke.mjs` 两条用例改成新期望（内联只注册本包 key / 内联可用时仍保留聚合包 row key / 旧宿主两条 row key 都在） |
| D159 | 「连接本机」的只读探测有两处把话说死/说空：① `probe()` **不认超时**——`docker version` 挂住时 `code` 是 `null`，兜底文案「退出码 null」对用户零信息量，而超时（daemon 卡死 / `docker context` 指向连不上的远端）恰恰是可修的一类，且它与「daemon 没起」的可修动作完全不同；② 探测只认 `dockerBin` 一个二进制、**完全没考虑 podman**——只有 podman 的机器上收到的是「请先安装 Docker」，用户得自己猜到去设置卡片把「docker CLI」改成 podman（README 也只写了这条手动路径）。另有一个实测出来的放大器：超时**只杀直接子进程**，`dockerBin` 指向包装脚本时孙进程仍握着 stdout/stderr，'close' 迟迟不来，15s 上限被拖成分钟级（真机实测 3s 上限拖到 60.3s） | `src/docker.ts` 的 `probe()`：新增 `ProbeResult.timedOut`，超时单独一档返回 `${bin} version 超时（15 秒未返回）`，不再落进退出码兜底；`src/index.ts` 新增 `isLocalCliMissing`（判据单一来源，文案分档与「要不要找候选」共用）、`findAlternativeLocalCli`（只读扫 `PATH`，按 **basename** 比对——按原字符串比会在 `dockerBin=/usr/local/bin/docker` 时给出「把 docker 改成 docker」的废话）、`localProbeReason`（接线，且**只在 CLI 缺失那一档**才去 accessSync），`describeLocalProbeFailure` 加 `LocalProbeHint` 入参（超时档 + 候选 CLI）。**只提示不静默改配置**：绝不替用户改写 `dockerBin`。`src/ssh-exec.ts` 的 `runLocal`：到点先 SIGKILL，再给 `KILL_GRACE_MS`(500ms) 收敛期，仍不 close 就自行 destroy 管道收尾——超时路径上「按时返回」优先于「拿到退出码」（本来就是 null）。回归：`test/connect-local.test.ts`（13 条新增，含用临时目录造 隔离 `PATH` 的可执行位用例——不依赖跑测试的机器装了什么）、`test/streams.test.ts` 的 `probe()` 六条出口、路由级用例（真 `accessSync` + 断言 `dockerBin` 未被改写）。**判别性已实测**：移除超时分支 / 断开候选接线后对应断言确实失败 |
| D160 | 「活动」条（docker events 事件流）进了 `closed` 是**终止态**，但界面把它渲染得像会自愈：`onEnd`（`docker events` 退出 / 服务端发 `end`）与带 `data` 的 `onError` 都 `setEventsStatus('closed')` **并 `close()`**，之后没有任何东西会再开它；而文案「事件流已断开」加上 EventSource 平时确实会自动重连，让人以为等等就好。实测用户路径：daemon 没起时开面板 → 流立刻带错退出 → 用户看到「事件流已断开」；随后 daemon 起来、点工具条 ⟳，列表正常回来了，活动条却永远停在那句。**⟳ 也救不活**：`refresh()` 只做 `loadContainers()` + `setRefreshToken(v+1)`，而事件流 effect 的依赖是 `[active, view, target]`——`refreshToken` 根本没进那条 effect（它只被详情抽屉的三个 effect 消费）。当时只有刷新整个页面（重挂载）或切页 / 切目标能恢复 | `client-src/index.js`：新增 `eventsReconnect` 自增令牌并进事件流 effect 依赖；`refreshManually()` 抽出「刷列表 + 重连」（⟳ 与活动条重连按钮都走它），而 **AUTO REFRESH 轮询仍只调 `refresh()`**——塞进轮询会让终止态被不断重开，既掩盖「它断了」又白建 SSE；`canReconnectEvents(status)` 抽成纯函数（离线冒烟的 React 桩把 `useState` 冻在初值上，组件里那个 `eventsStatus` 恒为 `''`，判定必须能直接驱动），**只认 `closed`**（`unsupported` 不给——重连必然再失败）；`ActivityBar` 加 `dk_activityHeadRow` 容器，重连按钮是折叠头的**兄弟**而非子元素（原来那层已经是 `<button>`，按钮里嵌按钮既非法也让读屏把两个动作听成一个）；断开时右侧那句「暂无事件」换成「不会自己回来」的说明。补偿判据 `sameTarget && (opened || manualReconnect)`：只用 `opened` 会漏掉「daemon 全程没起、流从未 open 过」——重连成功却不刷列表，活动条绿了而列表仍停在错误态。回归：`scripts/client-smoke.mjs` 三条用例（纯函数四态 + 源码级接线判据：依赖含令牌、令牌自增、按钮不嵌套、⟳ 接 `refreshManually`、轮询仍 `setInterval(refresh`、补偿含 `manualReconnect`）。**判别性已实测**：移除依赖里的令牌 / 把按钮挪进折叠头 / 退回只按 `opened` 判，三条分别红 |
| D161 | 跨目标聚合的单目标预算到点**只 `Promise.race`、不取消底层**：外层 `reject` 后 `aggregateAcrossTargets` 那一格返回 `ok:false`，而底下的命令**继续跑完**——超时那条 SSH channel 仍占着 `MaxSessions` 的会话槽（sshd 在子进程活着时不释放，见 D150），于是这台慢机器上的后续短命令被远端拒绝（`error: no more sessions` / `(SSH) Channel open failure: open failed`）。真实触发面是**多目标总览 / `docker_attention` 打慢目标**：`attention()` 是 `listContainers(true) → inspect(...)` 的**串行**序列——1 条 ps + 最多 9 批 inspect（`ATTENTION_INSPECT_CAP 300 + 补捞 50`，每批 ≤ 40），**最少两段 60s 就已越过外层的 45s**，最坏 10 × 30s ≈ 300s；`listContainers` 单发一条命令的 `docker_ps` / `/containers` 则由内层 30s 先到期，外层那个 45s 基本是死代码 | `src/docker.ts`：`Runner.run` 的 options 增**可选** `signal`（可选才不会波及 20+ 个既有调用点与假 runner），`createRunner()` 的 **local 与 ssh 两个分支都透传**（只改一边 = 「本机能取消、SSH 不能」，比不改更糟）；`src/ssh-exec.ts`：`ExecOptions.signal`，`RemoteExec.run` / `runLocal` 各自把 abort **并入已有的那一条收尾路径**（SSH 是 `signal('KILL')` + `close()` + `finish(null)`，复用 D112 的 `settled` 幂等守卫与 `finally` 里的 `inflight` 递减；本地是 `SIGKILL` + 复用 D159 的 `KILL_GRACE_MS` `reapTimer` 收敛期），收尾后摘 abort 监听，已 abort 的信号**不再开门 / 不再 spawn**；`src/index.ts`：`AbortController` 建在 `run()` **之前**（Runner 在 `apiFor` 里构造，signal 当场绑定），超时分支**先 `abort()` 再 `reject`**，`finally` 兜底 `abort()`（幂等）。**预算取舍**：不把外层提到「单目标最坏序列」（`attention` 最坏 = 1 条 ps + 最多 9 批 inspect，即 10 × 30s ≈ 300s，那样总览要等五分钟），改为**内层超时是唯一真相源、外层只做兜底**，外层取 3 × 单条预算 = 90s（`DSH_DOCKER_AGG_TIMEOUT_MS` 可覆盖，仅测试 / 排障）。返回契约不变：超时只污染自己那一格。回归：`test/aggregate-cancel.test.ts` 16 条（假 channel / 假 ChildProcess / 假宿主三套桩，端到端断言「abort 后底层真的收到取消」而不只是 `ok:false`）。**判别性已实测**：去掉超时分支的 `controller.abort()` → 3 条红；摘掉 `createRunner` 的 signal 透传 → 5 条红 |
| D162 | 能力使用审计的出口走了 `ctx.logger`：真机验收（2026-10-07，DSH 0.2.1-alpha.1）实测插件经 `ctx.logger.info` 打的行**既不出现在宿主 stdout、也找不到落盘文件**——能看到的 `[dsh-docker]` 行全部是 `console.log` 调用点（mounted / config applied / agent tools registered / tier-gate；tier-gate 的日志出口默认就是 console，见 kit `tier-gate.ts`），而审计行的意义全在「出问题时翻得到」，走一个不可见的通道等于没写 | `src/audit.ts`：出口固定 `console.log`（行前缀已带 `[dsh-docker]`），**刻意不做参数**——出口是本模块的取舍、不是调用方的选择（文件头有 D162 锚点）；`auditCapabilityUse` / `audited` 因此去掉 logger 形参，`src/index.ts` 全部调用点随之瘦身；`test/capability-audit.test.ts` 与 `scripts/route-smoke.mjs` 的断言面改为 **console 捕获**（捕到的就是真宿主 stdout 上会出现的字节）。kit elevation 的授权行（begin / grant / expire / revoke / load）走 `ctx.logger` 是同一问题，因台账守卫「待修必须为 0」不能以未修条目入 kit 台账，记在根 ROADMAP 待办（kit 修好后两类行同通道，README 的表述同步） |
| D163 | **「`allowExec` 闸住了 docker exec」这句声称的安全性质比实际多一条**（2026-10-07 用户拿着一张设置卡片 + 面板截图问「这算是漏洞吗」）：卡片上两个开关都显示「未生效：未获宿主授权」，而面板里容器卡片的**终端按钮照常能进容器敲命令**（`docker exec -it '<容器>' sh`，经 tty 的 `ttyTerminal` 承载）。实现本身是**刻意的**——那个按钮从设计起就属「查看 / 进入」组、只读模式下也永远可用（README 的动作条表格就是这么定的），exec 被关时面板的提示原文甚至直接让用户「复制卡片上的 exec 命令到终端面板交互式进入容器」；坏的是**说法**：`DOCKER_GUIDANCE` 写的是「…拉取镜像、docker exec，都需要用户显式打开『允许变更操作』『允许 exec』后才有对应**工具和按钮**」，而 README 的安全模型只列 `/exec` 与 `docker_exec` 被挡、没有一句说明**另一条同效通道不在它管辖内**——读者（包括当时在场的用户）会推成「exec 整体被挡住」。**同时暴露一条没写进威胁模型的效力缺口**：仓库四处都声称能力开关能拦「页内脚本（第三方 client 半体 / XSS）」，但装上 tty 之后，页内脚本经 `ttyTerminal.open` 或 WS `spawn` 帧就能跑任意命令，**比本插件的一次性 exec 还强**——`allowExec` 对页内脚本从来不是边界。功能无改动，纯口径修正 | 对外文案统一收窄到「**一次性**的 exec 通道」并各自点明终端按钮不受门控：`src/index.ts` 的 `DOCKER_GUIDANCE`；`packages/docker/README.md` / `README.en.md` 的安全模型第 1 条 + 动作条表格「查看 / 进入」行 + 配置表的 `allowExec` 行 + 「已知限制」新增「`allowExec` 不是『进不了容器』的闸」一条（含代价段）；威胁模型的边界补在 `packages/kit/src/capability.ts` 与 `docs/architecture.md` § 7（两处都是「同一条边界还适用于**能力面**」）；tty README 中英各补一条「`ttyTerminal` / WS `spawn` 是没有静态能力闸的命令面，消费方别把别人的 exec 开关宣传成进不了容器的边界」。回归：`scripts/test/exec-terminal-scope.test.ts`（**条数不写死**：`pnpm test` 现算；2026-10-07 review B4 指出本行原先「9 条」与「四处文案 / 七份文本 / 四类漂法」三处计数互相打架、且都与实际不符——实为 9 个 claim site / 7 个文件 / 5 条反例，现已把散文里的数字删掉并加一条「覆盖范围现算」判据）三层判据——① **事实层**从 `client-src/index.js` 的 `openExec` 现算函数体，断言它**不含** `allowExec`（正控制：确实走 `buildExecCommand` 的交互式路径），同时断言该有闸的两处（`docker_exec` 工具、`/exec` 路由）仍在判；② **文案层**`CLAIM_SITES` 里每一处文案各有一条锚点句，该句必含「一次性 / one-shot」与「终端按钮不受门控」；③ **反例层**每一类漂法各造一个反例。**判别性已实测**：`git stash` 掉全部文案改动后重跑 → `7 failed / 2 passed`（红的正是文案层与反例层的「锚点句不见了」，绿的两条是事实层——`openExec` 本来就没有 `allowExec` 判断）。**第一版判据是「全文含『一次性』」的全文匹配，反例当场证明它恒绿**（README 的配置表里本来就写着「允许一次性 exec」），故判据改成「先定位锚点句、只查那句」——这一条也写进了用例文件头 | src/index.ts、README.md、README.en.md、packages/kit/src/capability.ts、docs/architecture.md、packages/tty/README.md、packages/tty/README.en.md、scripts/test/exec-terminal-scope.test.ts |

## 2. 编号字典：这段代码为什么长这样

> 本节由原「修复记录摘要（第一轮 D01–D79 / 第二轮 D80–D125）」**重排**而来，「决策 / 机制」
> 一列是原文，未改写；**「相关编号」一列是本次新加的逆向索引**（依据 §1 的症状列回填，
> 非原文自带），用途是让 §1 的编号能反向查到设计意图。行号、提交号一律不写。

| 主题 | 决策 / 机制（原文，未改写） | 相关编号 |
|---|---|---|
| 连接生命周期 | 空闲回收把**在途的一次性命令**计入 `inflight`——长流之外的一次性长命令不能被中途掐断 | D01、D112 |
| | **外部取消（`AbortSignal`）并入已有的收尾路径**：超时与 abort 走同一段 `signal('KILL') + close()` / `SIGKILL` + 收敛期，靠同一个 `settled` 幂等守卫收尾。**超时不能只 `race` 不取消**——外层拿到 `ok:false` 时底层还在跑，占的资源（SSH 会话槽）要等它自然结束才还 | D112、D159、D161 |
| | 并发首连**先占坑再 `await`** 建连配置，避免同目标并存两条连接、先建的那条脱管 | D02、D94 |
| | `dropConn(key, client)` 带**身份校验**：陈旧 close/error 不得摘掉同键上的新连接 | D06 |
| | 传输错误重连前先 `end()`；**配额类错误不再触发重连**（否则泄漏健康连接 + 可操作文案永不到达用户） | D07 |
| | 短命令按池键**排队**（每条连接最多 2 条并发，FIFO + 名额转交）；**远端通道额度满**与传输错误同走「丢连接 + `end()` + 重建一次」，且额度满这条留 warn。D07 的边界在此**收窄**：「配额类不重连」只对**长流配额**成立，对**远端 `MaxSessions` 被打满**不成立——那种连接不会自愈，不重建就永远是「重试也没用」 | D07、D150 |
| | `ByteSink` + `StringDecoder` 统一解码，跨分片的多字节字符不再变 U+FFFD | D08 |
| | `keepTail` 让 logs / pull / prune **保留尾部**（截断宁可丢开头，也不丢最新行与 digest） | D14 |
| | SSH 池键小写化：同一主机不得建两条连接，把通道额度悄悄翻倍 | D111 |
| SSE | 背压队列 + `drain` 续写 + 每流 **8MB** 上限（超限视为客户端已死）；收尾前把队列交给 `res.end` 落地，**队尾帧不能丢** | D04、D83 |
| | 按 `enabled` / `dockerBin` / `targets` 的差异收流；**撤销 `allowMutations` 也收流** | D09、D84、D108 |
| attention | 返回 `{items,total,truncated,degraded}`——**截断与降级必须有信号**，不许静默（含单目标渲染与面板计数） | D12、D42、D85、D100、D101 |
| | **先按严重度排序再截断**；crash-loop 判据 = 重启 ≥3 且 2 分钟内刚启动 | D11、D12、D87、D106 |
| | 分块 inspect + **补捞独立预算** + 未取到详情计入 `degraded` | D85、D86、D87 |
| 跨目标聚合 | 并发上限 4 + **单目标预算**：内层每命令超时是唯一真相源，外层只做兜底；到点**先 abort 再 reject**（底层真被取消），失败只污染自己那一格 | D161 |
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

> **2026-09-25 落点迁移（安全围栏那三行）**：D31 / D32 / D80 / D110 / D139 的**实现**已整体上提到
> `@hyzyn/dsh-kit`（[`packages/kit/src/http.ts`](../kit/src/http.ts) 的 `isLoopbackAddress` /
> `isLoopbackRequestStrict` / `hasSameOriginProof` / `originProofHint`），本包只留一处指针注释并改走
> kit 的导出；**行为一字未改**（12 个既有路由 / 流用例未动一行即全绿）。三包共用一份的理由见
> [项目级 ROADMAP](../../ROADMAP.md) 第 1 项；**本包仍是那段加固档的来源**，成因说明以 kit 那份为唯一归宿。

### 2.1 D126–D139（用户实测 / 现场复核 / 真机波）的**刻意取舍**

这 14 条的 postmortem 正文已冻结进 git（见 §4）。**唯独"刻意不做什么"必须留在正文**——
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
| D139 | **不撤 D32**，只给它开一条**可验证的**窄路：判定项从「两条证明都缺省」改成「都缺省**且**带宿主 Cookie」。桌面壳这条转发链**必带** Cookie（`authenticateWebHost` 换不来就整体 503），浏览器又伪造不了 Cookie 头、跨站请求必带 `sec-fetch-site: cross-site`——所以放宽的是桌面壳，不是浏览器。**刻意不做的两件事**：① 不改成 `origin === undefined → true`（全仓另外 9 个插件就是这个宽松版，但 docker 路由握的是 docker socket ≈ 宿主 root，D32 的收紧有理由）；② 不把 SSE 改成 `streamBaseUrl` 绝对地址直连宿主——那是**跨源**请求，会同时要求 CORS 头与「接受 `cross-site` 标记」，比带 Cookie 的这条路危险得多 |
| D140 | 给传输补一个 **`stderrHint()`**（已经攒到的 stderr 摘要，空串表示没收到任何输出），只在**错误路径**被 `proxyFailureSuffix` 兜底使用；`failure()` 的**严格语义不动**（只有子进程真退出 / 传输真关闭才算失败事实）。**刻意不做**：不把 `failure()` 放宽成「有 stderr 就算失败」——那会让「健康的命令写了一句警告」也被记成失败，而这是两个不同的判断（前者是事实，后者是线索）；也**没有**在调用方加 `await` 等那 1~2ms——四个连接点的错误路径都是同步构造文案，为一个时序竞态引入异步等待会把简单的地方变复杂 |

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
