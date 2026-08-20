# @hyzyn/dsh-tty

DSH Web GUI 的**终端面板**插件：侧边栏「终端」入口打开一个大弹窗，内嵌
xterm.js 全交互终端（node-pty 真实 PTY），可运行任意命令与 TUI 程序
（vim / htop / dev server 等）。浏览器半体打包了 xterm 内核，宿主半体
经 WebSocket 与 PTY 会话双向透传。

## 安装

```bash
dsh plugin --profile web add @hyzyn/dsh-tty    # npm 安装（发布后）
dsh plugin --profile web add link:$(pwd)/packages/tty   # 仓库开发调试
```

装完重启 `dsh web`，侧边栏出现「终端」入口，点击打开面板；设置 → 插件 →
「终端面板」卡片可改配置（保存后需重启生效，插件配置在启动时读取）。

## 使用

- 打开面板即自动连接并启动 shell（默认 `$SHELL`，macOS 上通常是 zsh），
  工作目录为宿主进程启动目录；
- 支持 vim / htop / less 等 TUI（TERM 已注入为 `xterm-256color`）；
- 面板大小变化自动 resize（xterm fit → PTY 原生 resize）；
- 关闭面板或按 Esc 即结束会话（PTY 树级清理）；会话退出后点终端区域可重开；
- 并发上限默认 4（配置 `maxSessions`，1~16）。

## 配置（设置 → 插件 → 终端面板）

| 项 | 默认 | 说明 |
| --- | --- | --- |
| `enabled` | true | 关闭整个插件 |
| `announceToAgent` | true | 是否向 agent 公告终端面板能力（systemPrompt 注入） |
| `maxSessions` | 4 | 并发 PTY 会话上限（1~16） |
| `shell` | `$SHELL` | shell 路径 |
| `term` | `xterm-256color` | TERM 值 |
| `colorTerm` | `truecolor` | COLORTERM 值 |
| `cwd` | 宿主启动目录 | 会话工作目录 |

## 帧协议（/api/dsh-tty/ws，JSON 文本帧）

| 方向 | 帧 | 说明 |
| --- | --- | --- |
| C→S | `{t:'spawn', cols?, rows?}` | 连接后首帧，创建会话（单会话/连接） |
| C→S | `{t:'input', d}` | 按键/粘贴数据 |
| C→S | `{t:'resize', cols, rows}` | 面板尺寸变化 |
| C→S | `{t:'kill'}` | 关闭会话 |
| S→C | `{t:'ready', pid}` | 会话就绪 |
| S→C | `{t:'data', d}` | 终端输出（utf8 文本） |
| S→C | `{t:'exit', code, signal}` | PTY 退出事实（恰好一次） |
| S→C | `{t:'error', m}` | 错误 |

upgrade 路由带 loopback 信任围栏（remoteAddress + Host + Origin 校验），
仅本机 Web GUI 可连。

## 开发

```bash
pnpm --filter @hyzyn/dsh-tty build        # tsc 宿主 + esbuild 浏览器半体（client.js）
pnpm --filter @hyzyn/dsh-tty typecheck
pnpm --filter @hyzyn/dsh-tty probe        # M0 探针：PTY 原语验证（需真实 PTY）
pnpm --filter @hyzyn/dsh-tty integration  # M1 集成测试：真实插件 × 真实 DSH 服务组合
```

浏览器半体源码在 `client-src/index.js`，构建产物 `client.js`（含 xterm 内核）。
改客户端后需重新 `pnpm build` 并重启 `dsh web`。

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
- 第一版为单会话/连接：同连接二次 spawn 会被拒绝，重新打开面板即新会话。

## 工作原理

```
浏览器半体 (client.js, esbuild bundle)
  ├─ 侧边栏「终端」入口 → 大弹窗
  ├─ xterm.js + fit addon
  └─ WebSocket ──→ /api/dsh-tty/ws (webServer.registerUpgrade)
                        │
宿主半体 (src/index.ts)
  ├─ SessionManager（maxSessions 上限）
  ├─ ctx.get('subprocess').spawnTerminal({ argv: shell -c 包装层, ... })
  └─ 帧协议：input/resize/kill 上行；data/exit/error 下行 + 背压
```

M0 探针与 M1 集成测试在真实 DSH 服务组合（dsh-host-webserver +
dsh-subprocess-local）上验证过：TERM 注入、resize 透传、单会话约束、
并发上限、loopback 围栏、kill→exit 全链路。
