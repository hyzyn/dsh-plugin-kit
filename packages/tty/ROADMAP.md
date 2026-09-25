# @hyzyn/dsh-tty 路线图（待办）

> **本文只放「还没做的事」；「已经发生的事」在 [DEFECTS.md](./DEFECTS.md)。**
> 从 DEFECTS.md 的「待办 / 路线图」一节原样拆出（2026-09-25），**没有删减任何一条**——
> 包括原文里 2026-09-20 复核时逐项标注的「已经做掉的 / 仍缺的」。
> 缺陷仍按 `Dxx` 编号记在 DEFECTS.md 的索引表里；本文每一项在动手前先转成可验收条目
> （做完回填「落点 + 门槛」），不要只停留在规划里。

## 待办（8 项）

> 下面 7 条是**规划**，不是缺陷——单人项目不另开 Issue，待办就记在这里，做完打勾。
> 新发现的缺陷也接着编号记在本文，不要只留在对话里。
> **2026-09-20 复核**：7 条中 2 条已被部分做掉（SFTP 双栏、状态条与图元边界，已在原地逐项标注
> 「已经做掉的 / 仍缺的」），1 条已整条做掉（agent 侧 `tty_open` / `tty_close`，见下方标注），
> 其余 4 条与代码现状一致。

- **机器级资源的 profile 维度（D60）** —— 复制 profile 会把固定端口（webserver / 隧道
  `localPort`）一并拷走，且 tmux socket（`-L dsh-tty`）全 profile 共用。本次只做了
  「可诊断 + 文档」。**待做**：复制时自动错开/停用隧道端口（或只提示）；保存隧道时探测端口
  占用；tmux socket 按 profile 命名（`dsh-tty-<profile>`）。*（2026-09-24 新增）*
- **跳板机（ProxyJump / ProxyCommand）** —— `ssh-config.ts` 明写忽略、`buildConnectConfig` 从不设
  ssh2 的 `sock`；企业内网主机几乎都靠 bastion。**短期至少做到**：导入时跳过依赖跳板机的块并提示，
  不要静默产出一条注定 20s 超时的连接簿条目。*（复核：仍未做，`ssh-config.ts:9` 的行为没变）*
- **agent 侧没有 `tty_open` / `tty_close`** —— ✅ **已做（0.20.0）**：`tty_open` 开本地会话
  （可带 `command` / `persistName`），`tty_close` 关自己开的；agent 开的会话是**面板里的普通
  标签**（用户可见可接管），并豁免孤儿回收（理由见 [DEFECTS.md](./DEFECTS.md) §2.2「设计决定：agent 自开终端」）。同时补了
  `tty_stats`（CPU/内存/磁盘/网络/温度）。README「与 bash 工具同权」已订正为「16 个工具 +
  开/关能力，但关不掉用户的标签」。
- **隧道没有 agent 侧 start/stop** —— 只有 `tunnel_list`，启停全在设置卡片。*（复核：仍未做）*
- **SFTP 双栏交互** —— **已经做掉的**：本机栏排序（D32，与远程栏同一套「目录优先 +
  `localeCompare`」）。**仍缺的**：双栏内的拖拽上传（拖拽只在**单窗体**里有——0.8.0 起，
  全仓只有一处 `drop` 处理器）、隐藏文件开关、断点续传 / 增量（跳过两侧 size+mtime 相同的文件）。
  大目录**已有截断渲染兜底**（`RENDER_CAP = 500` + 「其余 N 项未渲染」提示；`sftp_list` 亦有
  默认 500 的 `maxEntries`），真正的虚拟滚动仍未做。
- **状态条与图元边界** —— **已经做掉的**：状态条窄屏布局（D33，改为横向滚动看右侧条目）。
  **仍缺的**：WebGL 上下文丢失后的重试恢复（xterm 自身只回退 DOM，无 `contextlost` 处理）；
  磁盘多挂载点（仍固定取 `/`，Windows 取系统盘）。
- **`HostKeyAlias` / 别名参与 TOFU 定位**（可搭 D12 的多指纹 schema 一起做）。*（复核：仍未做，
  全仓无 `HostKeyAlias`）*
- **客户端接线进 CI**（D38 遗留，单独立项）—— `preview.mjs` 的 30 个界面场景需要 Chrome：要么加一个
  带浏览器的 CI job，要么继续把 UI 纯逻辑外抽成可单测模块。*（复核：CI 仍未跑 `preview.mjs`；
  「外抽」这条路已多一个——D49 落地的 `client-src/stats-bar.js` 带 17 条单测，现在这类模块共
  4 个：`stats-bar` / `status-line` / `dock-owner` / `current-session`，各有同名测试文件）*
