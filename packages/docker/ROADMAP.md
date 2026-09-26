# @hyzyn/dsh-docker 路线图（待办）

> **本文只放「还没做的事」；「已经发生的事」在 [DEFECTS.md](./DEFECTS.md)。**
> 从 DEFECTS.md 的「待办 / 路线图」一节原样拆出（2026-09-25），**没有删减任何一条**。
> 缺陷仍按 `Dxx` 编号记在 DEFECTS.md 的索引表里；本文每一项在动手前先转成可验收条目
> （做完回填「落点 + 门槛」），不要只停留在规划里。

## 待办（3 项）

> 下面都是**规划**，不是缺陷：单人项目不另开 Issue，待办记在这里，做完打勾。
> 新发现的缺陷接着编号记进 [DEFECTS.md](./DEFECTS.md) 的索引表（加一行），不在本文展开。
>
> **2026-09-25 分档**：原有 8 项里 5 项**要同时改 ≥2 个包**（跳板机、统一安全围栏、变更端点的信任模型、
> `isConcurrencySafe`、面板端 i18n），已按 [docs/conventions.md 的边界判据](../../docs/conventions.md#l0--l1-的边界判据)
> 上提到项目级 [ROADMAP.md](../../ROADMAP.md)，**原文在那里逐字保留**。本文只留「改 docker 一个包就能做完」的 3 项。

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

## 已上提到项目级（不在本文展开）

跳板机（ProxyJump）· 统一安全围栏（对齐 tty / dsh-mcp）· 变更端点的信任模型（一次性 token）·
`isConcurrencySafe` 未声明 · 面板端 i18n —— 见 [项目级 ROADMAP.md](../../ROADMAP.md)。

**2026-09-25 更新**（三项已落地，落点与门槛见项目级 ROADMAP 的 § 已完成）：

- **统一安全围栏**：本包那份加固档（D31 / D32 / D80 / D110 / D139 的实现）**整体上提到
  `@hyzyn/dsh-kit`**，docker 改走 kit 的导出——行为一字未改（12 个既有路由 / 流用例未动一行
  即全绿），三包共用一份；DEFECTS.md 的「安全围栏」节下有落点迁移标注；
- **`isConcurrencySafe`**：11 个只读工具声明、5 个变更工具**刻意不声明**；
- **跳板机（ProxyJump / ProxyCommand）**：**已全部落地**（2026-09-25）。先把「短期一半」
  （超时 / 通道错误 / 条目缺失三处文案点出成因）补上，随后做完整实现：`readTtyBooks` 把
  `jump` 带进规格、`poolKey` 并入 `|jump:<user@host:port>`（不同跳板机到同一目标不再并成一条
  连接）、`acquire` 先拨跳板机再把 `forwardOut` 通道当 `sock`、`disposeAll` / 空闲回收 /
  传输错误重连都成对收尾。
- **`ProxyCommand`**：同样落地，但**闸门只有一处**——读 tty settings 的 `allowProxyCommand`
  （**默认关**），且**每次拨号现读**（关掉立刻生效，不留缓存）；关着时携带代理命令的目标
  明确失败（不退回直连）。本包**不新建界面**：连接簿在 tty 配一次，两个面板一起生效；
  池键并入 `|cmd:<sha256 前 12 位>`——**只并入摘要**，因为命令原文可能含凭据而池键会进诊断路径。
  方案与全部已知坑见 [docs/proxyjump-plan.md](../../docs/proxyjump-plan.md)（§6.1 闸门定案表）。
