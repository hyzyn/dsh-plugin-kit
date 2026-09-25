# @hyzyn/dsh-docker 路线图（待办）

> **本文只放「还没做的事」；「已经发生的事」在 [DEFECTS.md](./DEFECTS.md)。**
> 从 DEFECTS.md 的「待办 / 路线图」一节原样拆出（2026-09-25），**没有删减任何一条**。
> 缺陷仍按 `Dxx` 编号记在 DEFECTS.md 的索引表里；本文每一项在动手前先转成可验收条目
> （做完回填「落点 + 门槛」），不要只停留在规划里。

## 待办（8 项）

> 下面都是**规划**，不是缺陷：单人项目不另开 Issue，待办记在这里，做完打勾。
> 新发现的缺陷接着编号记进 [DEFECTS.md](./DEFECTS.md) 的索引表（加一行），不在本文展开。

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
