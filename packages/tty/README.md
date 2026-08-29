# @hyzyn/dsh-tty

DSH Web GUI 的**终端面板**插件：侧边栏「终端」入口打开一个大弹窗，内嵌
xterm.js 全交互终端（node-pty 真实 PTY），支持**多标签页**，可运行任意
命令与 TUI 程序（vim / htop / dev server 等）。浏览器半体打包了 xterm
内核，宿主半体经 WebSocket 与 PTY 会话双向透传。

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
- **多标签页**：标签栏「+」新建终端、标签 ✕ 关闭；每个标签独立 PTY 会话；
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
| `tty_list` | 列出活跃终端会话（sid / pid / cwd / 活动时间） |
| `tty_capture` | 读取指定会话的近期输出（尾部 N 行，默认 60）——查看 dev server / build 日志 |
| `tty_send` | 向指定会话发送按键/文本（如 dev server 的 q 键、菜单选择） |

典型用法：用户在终端面板里跑了 `pnpm dev`，agent 用 `tty_list` 找到 sid →
`tty_capture` 看日志 → `tty_send` 发 `q` 停止。

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

## 帧协议（/api/dsh-tty/ws，JSON 文本帧；v2 支持单连接多会话）

| 方向 | 帧 | 说明 |
| --- | --- | --- |
| C→S | `{t:'spawn', sid?, cols?, rows?, cwd?}` | 创建会话；sid 缺省由宿主生成，cwd 缺省用配置兜底 |
| C→S | `{t:'input', sid?, d}` | 按键/粘贴数据 |
| C→S | `{t:'resize', sid?, cols, rows}` | 面板尺寸变化 |
| C→S | `{t:'kill', sid?}` | 关闭会话 |
| S→C | `{t:'ready', sid, pid}` | 会话就绪 |
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

## 工作原理

```
浏览器半体 (client.js, esbuild bundle)
  ├─ 侧边栏「终端」入口 → 大弹窗
  ├─ 标签栏：每标签一个 xterm.js 实例（独立 sid）
  ├─ sessions 客户端服务：新标签带当前会话 cwd
  └─ WebSocket ──→ /api/dsh-tty/ws (webServer.registerUpgrade)
                        │
宿主半体 (src/index.ts)
  ├─ 连接内会话表（sid → PTY，单连接多会话）
  ├─ SessionManager（maxSessions 上限，热调整）
  ├─ ctx.get('subprocess').spawnTerminal({ argv: shell -c 包装层, cwd })
  └─ 帧协议：spawn/input/resize/kill ↔ ready/data/exit/error + 背压
```

M0 探针、集成测试（12 项）与真实实例冒烟（live / TUI）在真实 DSH 服务组合
上验证过：TERM 注入、resize 透传、sid 冲突、并发上限、loopback 围栏、
多会话数据隔离、cwd 跟随与校验、配置热生效（settings/updated）、
kill→exit 全链路。
