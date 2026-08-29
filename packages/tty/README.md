# @hyzyn/dsh-tty

DSH Web GUI 的**终端面板**插件：侧边栏「终端」入口打开一个大弹窗，内嵌
xterm.js 全交互终端（node-pty 真实 PTY），支持**多标签页**，可运行任意
命令与 TUI 程序（vim / htop / dev server 等）。浏览器半体打包了 xterm
内核，宿主半体经 WebSocket 与 PTY 会话双向透传。0.2.0 起支持 **SSH 连接
（方案 C）**：`ssh2` 原生直连远程主机，像本地终端一样交互（见下文）。

![终端面板：多标签页 xterm 弹窗，工具栏含搜索/清屏/复制/粘贴，标题栏含最小化「—」与关闭 ✕](../../docs/dsh-plugin-kit-tty.png)

## 安装

```bash
dsh plugin --profile web add @hyzyn/dsh-tty    # npm 安装（发布后）
dsh plugin --profile web add link:$(pwd)/packages/tty   # 仓库开发调试
```

装完重启 `dsh web`，侧边栏出现「终端」入口，点击打开面板；设置 → 插件 →
「终端面板」卡片可改配置（**保存即热生效**，无需重启）。

## 使用

- 打开面板自动创建第一个终端（默认 `$SHELL`，macOS 上通常是 zsh）；
- **多标签页**：标签栏「+」新建终端（0.2.0 起「+」为菜单：本地终端 /
  SSH 连接簿 / SSH 连接…，SSH 见下节）、标签 ✕ 关闭；每个标签独立会话
  （本地 PTY 或 SSH channel）；
- **工作目录跟随当前 DSH 会话**：新标签默认在当前会话工作目录打开
  （宿主配置 `cwd` 作兜底）；
- 支持 vim / htop / less 等 TUI（TERM 已注入为 `xterm-256color`）；
- 面板大小变化自动 resize（xterm fit → PTY 原生 resize）；
- **Ctrl+F 终端内搜索**（Enter 下一个 / Shift+Enter 上一个 / Esc 只关搜索框），
  输出中的链接可点击，工具栏提供 清屏 / 复制选中 / 粘贴；
- **最小化（状态并入侧边栏入口）**：点弹窗外空白处、按 Esc 或标题栏「—」
  把面板收起——PTY 会话与输出缓冲保持存活，侧边栏「终端」入口上显示
  「运行中/总数」徽标与状态点（有输出时脉冲提示），点击入口即可恢复；
  悬浮条 ✕ / 标题栏 ✕ 才真正关闭并结束全部会话；
- 标题栏 ✕ 关闭面板并结束全部会话（PTY 树级清理）；会话退出后点终端区域可重开；
- 并发上限默认 4（配置 `maxSessions`，1~16）。

![终端面板设置卡片：shell / TERM / 并发上限等保存即热生效](../../docs/dsh-plugin-kit-tty-setting.png)

## agent 工具（P1）

插件向 agent 注入三个工具（与 bash 工具同权，操作实时显示在用户终端里）：

| 工具 | 作用 |
| --- | --- |
| `tty_list` | 列出活跃终端会话（sid / kind（local\|ssh）/ target / pid / cwd / 活动时间；SSH 会话无 pid，显示 target） |
| `tty_capture` | 读取指定会话的近期输出（尾部 N 行，默认 60）——查看 dev server / build 日志 |
| `tty_send` | 向指定会话发送按键/文本（如 dev server 的 q 键、菜单选择） |

典型用法：用户在终端面板里跑了 `pnpm dev`，agent 用 `tty_list` 找到 sid →
`tty_capture` 看日志 → `tty_send` 发 `q` 停止。

SSH 会话同表调度：`tty_list` 里 `kind: 'ssh'` 的条目按 `target`
（user@host[:port]）识别，`tty_capture` / `tty_send` 用法与本地会话完全
一致——远程机器上的 dev server 日志与按键交互照常可用。

## SSH 连接（方案 C）

0.2.0 起标签栏「+」变为一键菜单，除本地终端外还能开 **SSH 标签页**：宿主
半体用 `ssh2` 原生建立连接并打开 shell channel（不经过本地 ssh 进程，也
不占 node-pty），包装成与本地 PTY 完全一致的会话对象——输入、resize、
关闭、输出缓冲、背压与 agent 工具全部复用同一套调度。

- **「+」菜单三个入口**：本地终端 / **SSH 连接簿**（配置里保存过的条目，
  显示 `user@host[:port] · auth`）/ **SSH 连接…**（表单手填 host / port /
  username / auth，连接前可勾选保存）；
- **连接簿**：SSH 连接对话框勾选「保存到连接簿」即存为条目（同名覆盖，
  名称留空用主机名）；也可在 设置 → 插件 → 终端面板 卡片维护（列表 +
  删除，随「保存」一并写入配置）；
- **认证方式（auth）三选一**：
  - `agent`（默认）——走 ssh-agent（`SSH_AUTH_SOCK`），凭证不落盘，最推荐；
  - `key`——`keyPath` 私钥文件（`~` 开头可省略 home），`passphrase` 可选；
  - `password`——密码认证，同时挂 keyboard-interactive（不少服务端只开这个）；
- **密码 / 口令支持 `env:VAR`**：`password` / `passphrase` 填 `env:MY_SECRET`
  时从宿主进程环境变量取值（配合 dsh-env-manager 插件托管密钥，避免明文
  写进 settings 文件）；
- **端口**：默认 22，非 22 端口在 target 里显示为 `user@host:port`；
- **标签与状态**：SSH 标签标题用连接名或 `user@host`（本地标签是
  「终端 N」）；连接中先回显灰字 `Connecting user@host …`，就绪后状态栏
  显示 `SSH user@host 已连接`；连接失败（连接超时 / 认证被拒 / 主机
  不可达）以 `error` 帧带回原因，标签规格已随标签保存，点终端区域可按
  原规格重开；
- **计入 `maxSessions` 并发上限**；关断与本地会话一致：标签 ✕ / `kill`
  帧关闭 ssh2 channel，`exit` 帧照常带回退出码 / 信号。

## 配置（设置 → 插件 → 终端面板，保存即热生效）

| 项 | 默认 | 说明 |
| --- | --- | --- |
| `enabled` | true | 关闭整个插件（需重启生效） |
| `announceToAgent` | true | 是否向 agent 公告终端面板能力（systemPrompt 注入） |
| `maxSessions` | 4 | 并发 PTY 会话上限（1~16） |
| `shell` | `$SHELL` | shell 路径 |
| `term` | `xterm-256color` | TERM 值 |
| `colorTerm` | `truecolor` | COLORTERM 值 |
| `cwd` | 宿主启动目录 | 兜底工作目录（客户端当前会话 cwd 优先） |
| `sshHosts` | `[]` | SSH 连接簿（面板「+」菜单可选）：条目 `{name, host, port=22, username, auth=agent\|key\|password, keyPath, passphrase, password}`；保存时整体替换、同名覆盖；`password` / `passphrase` 支持 `env:VAR` 引用，避免明文入库 |

## 帧协议（/api/dsh-tty/ws，JSON 文本帧；v2 支持单连接多会话）

| 方向 | 帧 | 说明 |
| --- | --- | --- |
| C→S | `{t:'spawn', sid?, cols?, rows?, cwd?}` | 创建会话；sid 缺省由宿主生成，cwd 缺省用配置兜底 |
| C→S | `{t:'ssh', sid?, cols?, rows?, name? \| host, username, …}` | 创建 SSH 会话（ssh2 原生）；`name` 引用连接簿条目作基底，内联 `host/port/username/auth/keyPath/passphrase/password` 可逐项覆盖 |
| C→S | `{t:'input', sid?, d}` | 按键/粘贴数据 |
| C→S | `{t:'resize', sid?, cols, rows}` | 面板尺寸变化 |
| C→S | `{t:'kill', sid?}` | 关闭会话 |
| S→C | `{t:'ready', sid, pid, kind, target?}` | 会话就绪；`kind:'local'` 带 pid，`kind:'ssh'` 时 pid=null、target=user@host[:port] |
| S→C | `{t:'data', sid, d}` | 终端输出（utf8 文本） |
| S→C | `{t:'exit', sid, code, signal}` | PTY 退出事实（恰好一次） |
| S→C | `{t:'error', sid?, m}` | 错误 |

sid 省略时按「该连接唯一会话」路由；连接上存在 0 或多个会话时省略 sid
会报错。upgrade 路由带 loopback 信任围栏（remoteAddress + Host + Origin
校验），仅本机 Web GUI 可连。

## 开发

```bash
pnpm --filter @hyzyn/dsh-tty build        # tsc 宿主 + esbuild 浏览器半体（client.js）
pnpm --filter @hyzyn/dsh-tty typecheck
pnpm --filter @hyzyn/dsh-tty probe        # M0 探针：PTY 原语验证（需真实 PTY）
pnpm --filter @hyzyn/dsh-tty integration  # 集成测试：真实插件 × 真实 DSH 服务组合
pnpm --filter @hyzyn/dsh-tty live         # 对运行中的 dsh web 做存活冒烟
pnpm --filter @hyzyn/dsh-tty tui          # TUI 冒烟：vim/nano 全屏渲染
pnpm --filter @hyzyn/dsh-tty ssh-smoke    # SSH 冒烟：内存 SSH server（ssh2.Server）× 真实 spawnSsh 端到端（需先 build）
```

浏览器半体源码在 `client-src/index.js`，构建产物 `client.js`（含 xterm 内核）。
改客户端后需重新 `pnpm build` 并刷新页面（可能需硬刷新）。

## 已知限制

- **resize 为内部耦合**：DSH 的 `spawnTerminal` handle 未暴露 resize，
  插件直接透传 `(handle).terminal.resize(cols, rows)`（node-pty 原生 API，
  同进程可达）。DSH 升级若改内部结构可能失效，届时退化为固定尺寸。
- **TERM 注入用 `-c` 包装层**：DSH 硬编码 node-pty `name:"dumb"`，而
  node-pty 里 name 优先于 env.TERM，因此 shell 以
  `sh -c 'export TERM=...; exec "$shell"'` 方式启动（对用户透明）。
- **terminate() 有「幸存者」竞态**：DSH 树级清理偶发报
  `terminal cleanup failed; surviving pids`，插件按 best-effort 处理
  （失败降级对顶层 shell 直接 SIGKILL），退出码/信号可能为 null。
- **输出为 utf8 文本流**：node-pty 数据经 DSH 按 utf8 编码传输，非 UTF-8
  字节会被替换字符吃掉（如 `cat` 二进制文件），属预期行为。
- 浏览器半体依赖官方 `dsh-web-app` 的侧边栏结构（`[data-pane="sidebar"]`），
  非官方 Web GUI 可能不显示入口。
- 连接断开（如宿主重启）时所有会话结束，需重新连接后重开标签。
- **SSH host key 当前为 accept-and-log**：不做 known_hosts 钉扎，每次连接
  记录 sha256 指纹后无条件放行，等同于手敲
  `ssh -o StrictHostKeyChecking=no`（而非 accept-new）——首次连接不询问、
  主机指纹变更不告警，存在 MITM（中间人）冒充风险；loopback 围栏保证只有
  本机 Web GUI 能发起连接，仅作为缓解，known_hosts 钉扎留作后续项。
- **SSH 密码 / 口令建议 `env:VAR` 引用**：连接簿随 settings 文件落盘，
  `password` / `passphrase` 明文入库有泄露面；建议 `env:VAR` +
  dsh-env-manager 托管，或直接用 `agent` 认证（凭证不落盘）。
- **SSH 会话没有本地 pid**：ssh2 shell channel 不是本机进程，`ready.pid`
  为 `null`、`tty_list` 显示 `target` 而非 pid，本机 `ps` / `kill` 对远程
  进程无效——关闭请用标签 ✕ 或 `kill` 帧（关闭的是 ssh2 channel）。

## 工作原理

```
浏览器半体 (client.js, esbuild bundle)
  ├─ 侧边栏「终端」入口 → 大弹窗
  ├─ 标签栏：每标签一个 xterm.js 实例（独立 sid）
  ├─ sessions 客户端服务：新标签带当前会话 cwd
  └─ WebSocket ──→ /api/dsh-tty/ws (webServer.registerUpgrade)
                        │
宿主半体 (src/index.ts)
  ├─ 连接内会话表（sid → 本地 PTY / SSH channel，单连接多会话）
  ├─ SessionManager（maxSessions 上限，热调整；SSH 会话同表调度）
  ├─ 本地路径：ctx.get('subprocess').spawnTerminal({ argv: shell -c 包装层, cwd })
  └─ 帧协议：spawn|ssh / input / resize / kill ↔ ready/data/exit/error + 背压

SSH 路径 (src/ssh.ts，方案 C)
  └─ {t:'ssh'} → spawnSsh：ssh2 Client 原生连接（agent / key / password，
     password·passphrase 支持 env:VAR 取密），开 shell channel 包装成与
     PTY 同形状的 TermHandle（pid=null，kind='ssh'，target=user@host[:port]），
     背压一并透传到 channel —— 之后与本地 PTY 无差别调度
```

M0 探针、集成测试（12 项）与真实实例冒烟（live / TUI）在真实 DSH 服务组合
上验证过：TERM 注入、resize 透传、sid 冲突、并发上限、loopback 围栏、
多会话数据隔离、cwd 跟随与校验、配置热生效（settings/updated）、
kill→exit 全链路。SSH 路径由 `ssh-smoke`（内存 SSH server × 真实
`spawnSsh`）验证：password 认证建链与 prompt、命令往返、pty-req 初始
尺寸与 resize（window-change）、terminate / exit-status 全链路。
