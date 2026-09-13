# @hyzyn/dsh-docker

DSH Web GUI 的 **Docker 容器面板**插件：侧边栏「容器」入口打开面板，查看
**本机或 SSH 主机**上的容器列表 / 状态 / 端口 / 日志 / 资源占用与镜像，并在
显式打开开关后执行启停删与一次性 `docker exec`。宿主半体用 `ssh2` 的
**exec channel**（非 PTY）在远程跑 docker CLI，本机目标直接 spawn；agent 侧
配套 `docker_*` 工具，**默认只读**。

## 与 dsh-tty 的关系

本插件自成一体：不 import 任何 tty 代码，tty 也无需改一行源码，两者可各自单独安装、
各自升级；装了 tty 就在下面这些可选扩展点上协作，没装则安静降级。

| 维度 | 说明 |
| --- | --- |
| 插件形态 | 独立包 `@hyzyn/dsh-docker`，不 import 任何 tty 代码，tty 也无需改一行源码；两者可各自单独安装、各自升级 |
| 连接簿 | SSH 目标可**引用 tty 连接簿条目名**（只读 `ctx.settings.get('tty')` 的 `sshHosts`）；tty 未安装时退化为「内联 host/username」或本机目标 |
| 主机指纹 | 本插件自持一份 `hostKeys`（TOFU），并**优先以 tty 已记录的指纹作种子**——同一主机不必在两处各确认一次 |
| 执行通道 | 自持池化 SSH exec（`src/ssh-exec.ts`），与 tty 的 PTY 会话完全独立，互不占名额 |
| 上下文入口 | tty ≥ 0.13.0 时可选消费其客户端服务 `ttyConnbar`，在 SSH 连接栏（SFTP 旁）插入「容器」按钮（**注册即显示**），目标在点击时按当前会话解析；tty 未装 / 版本过旧则静默跳过 |
| 面板承载 | tty ≥ 0.16 且终端面板正开着时，容器面板经 `ttyPanel.mountPane` **挂在终端右侧的 dock**（拖宽 / 折叠 / ✕ 由 tty 提供），终端继续可见可用；否则回退到自带 backdrop 的全屏模态。面板本身是同一份组件，只是宿主不同。dock 同一时刻只挂一个：本插件挂上去时会收掉前一个（例如 tty 自己的 SFTP），反过来 SFTP 遇到已被占用的挂载位会退回它自己的对话框 |
| 终端承载 | 交互式终端由 tty 承载（它才是 PTY 的所有者）：tty ≥ 0.15 时经 `ttyTerminal.mount` **就地嵌入**到本面板底部的终端抽屉（dock 模式下改为在同面板**新开标签**，避免终端套面板套终端），tty ≥ 0.14 时退回「开标签 + 收面板」，都没有则复制命令。本插件不实现 PTY / xterm / 重连栈 |
| 分工 | **交互式排障**（`docker exec -it`、容器内 shell、TUI）由 tty 承载（抽屉内嵌或标签）；**只读巡检与 agent 自动化**用本插件自己的 exec 通道 |

数据级复用、代码级不耦合：连接簿与指纹种子是「读同一份 settings」，连接栏按钮是
「消费一个通用扩展点」，都不是「依赖 tty 的模块」，因此 tty 升级或卸载都不会连带
弄坏本插件。

## 安装

```bash
dsh plugin --profile web add @hyzyn/dsh-docker              # npm 安装（发布后）
dsh plugin --profile web add link:$(pwd)/packages/docker    # 仓库开发调试
```

聚合包 `@hyzyn/dsh-all`（或仓库根 bundle）已包含本插件，一次装齐时不必单独
add。装完重启 `dsh web`，侧边栏出现「容器」入口；设置 → 插件 →
「Docker 容器面板」卡片维护目标与开关，**保存即热生效**（`settings/updated`
触发重解析，无需重启）。

> 已在 web profile 里装过 `@hyzyn/dsh-all` 或根 bundle 时**不要**再 add 本包，
> 否则插件行重复挂载，启动报 `duplicate loader entry id`。

## 使用

两个入口，同一个面板：

- **侧边栏「容器」**（总入口）：任何目标都能用，包括本机 docker 与多目标切换。
- **SSH 连接栏「容器」按钮**（上下文快捷方式，tty ≥ 0.13.0）：在 tty 终端面板的
  SSH 标签里，连接栏 SFTP 按钮旁会出现「容器」——**注册即显示**，点击直接用
  **当前会话那台主机**打开面板，不用再选目标。目标解析发生在点击时：会话来自
  连接簿时按条目名匹配，否则按 `host:port` 匹配已解析的目标；**没配到目标也不会
  藏按钮**——面板会带一条提示告诉你会话主机（含连接簿名）该去设置卡片怎么配。

  ![docker 面板挂进终端面板右侧 dock：终端保持可见可用](https://cdn.jsdelivr.net/gh/hyzyn/dsh-plugin-kit@main/docs/dsh-plugin-kit-docker-dock.png)

  这条路径打开的面板**不会盖住终端**：tty ≥ 0.16 时它挂在终端面板右侧的 dock 里
  （可拖宽、可折叠成窄条、✕ 收起），终端照常敲命令；tty 更旧或面板没开时才退回
  全屏模态。dock 模式下卡片「终端」按钮改为**在同一终端面板新开标签**执行
  `docker exec -it`（面板已经在一个终端里了，再嵌一层没有意义）；同时**不再渲染
  面板自己的头部**——标题与 ✕ 由侧栏标题栏承担，刷新与只读徽标并进工具条首行
  （刷新中图标自己转，不再另挂 spinner），520px 窄栏里不会白留一条空行。

面板内：

![容器列表：目标选择 / 搜索与状态筛选 / 卡片动作条（查看 · 变更两组）](https://cdn.jsdelivr.net/gh/hyzyn/dsh-plugin-kit@main/docs/dsh-plugin-kit-docker-panel.png)

- **目标选择**：面板先选目标（来自配置 `targets`，本机 / SSH）；只配置了一个
  目标时默认选中它，agent 工具也可以省略 `target` 参数。
- **容器列表**：名称 / 状态 / 健康态 / 镜像 / 端口映射 / compose 项目与服务 /
  短 ID；支持按名称或镜像**搜索**、按状态**筛选**（运行中 / 已停止 / 全部），
  以及**自动刷新**（按 `pollIntervalSec` 轮询，切到镜像页会暂停且不显示该开关——
  镜像变化慢，没必要每 5s 跑一次 `docker images`；切回容器页原设置照旧生效）。
- **容器卡片**：与参考布局一致的「标签 + 值」行（镜像 / ID / 端口 / 创建 /
  compose，值等宽、可省略）+ 一排图标操作按钮，**按「查看 / 变更」两组用竖线分隔**：

  | 组 | 按钮 | 说明 |
  | --- | --- | --- |
  | 查看 / 进入 | 终端、日志、资源占用 | 不改容器状态，只读模式下也永远可用 |
  | 变更 | 启停、重启、删除 | 按破坏性递增排列；只在 `allowMutations` 开启后可用，未开启时整组置灰 |

  删除额外做了两点防护：破坏性配色 + 与「重启」之间留出间距，点击后仍需二次确认。
  点卡片本体进入概览。
- **容器详情（整栏视图）**：顶部为「返回 + 容器名 + 状态徽标 + 目标主机」，
  下方三个标签页——概览（`docker inspect` 权威数据 + 一次性 exec）、日志、
  统计。从卡片的日志 / 统计图标可直接落到对应标签页。
- **日志视图（紧凑两行）**：第一行 = 返回 + 容器名 + 状态 + 目标主机 +
  `LINES`（尾部行数）/ `TIMESTAMPS` / `AUTO REFRESH`（开关 + 2/3/5/10s 间隔，
  仅日志页轮询）+ 刷新 / 下载 / 关闭；第二行 = 标签页 + **常驻**的「过滤日志」
  输入框（右侧固定槽显示「N 行」/「N / M 行匹配」；有内容时框内浮出 ✕ 清空，
  Esc 也能清空）。输入框宽度与位置恒定，输入 / 清空都不会挤动这一行。日志正文按级别着色（`[INFO]` 与 `|INFO` 两种常见前缀
  都能识别），时间戳压暗，过滤命中高亮；超过 2000 行只对尾部着色并提示。
  详情视图下不再叠加列表工具条与面板头，每屏只有一个刷新入口。
- **概览**：`docker inspect` 的权威数据——状态与健康、退出码、重启次数与策略、
  端口映射、挂载（含只读标记）、网络与 IP、entrypoint 与命令、最近一次健康
  检查输出；下方可执行一次性 `docker exec`（需 `allowExec`）。
- **日志**：`docker logs --tail` 的尾部快照（默认 `logTailDefault` 行），可切
  时间戳与 `--since`；输出超过 `maxOutputKb` 会截断并标记。

![日志页：级别着色 + 常驻过滤框 + 行数统计](https://cdn.jsdelivr.net/gh/hyzyn/dsh-plugin-kit@main/docs/dsh-plugin-kit-docker-logs.png)
- **统计**：`docker stats --no-stream` 快照（CPU% / 内存用量与占比 / 网络 IO /
  块 IO / PIDs），面板按 `pollIntervalSec` 轮询刷新。
- **镜像**：`docker images` 列表（reference / 大小 / 创建时间 / 短 ID）；
  `<none>:<none>` 的 dangling 镜像带 `dangling` 标记。**只有列表，没有删除 /
  拉取 / 构建**。搜索框与「N / M 个镜像」计数**固定在工具条里**（不随列表滚走），
  表头列名在表体内吸顶——镜像多的时候滚到哪都还知道自己在看什么列。

![镜像页：搜索框固定在工具条，表头吸顶](https://cdn.jsdelivr.net/gh/hyzyn/dsh-plugin-kit@main/docs/dsh-plugin-kit-docker-images.png)
- **一次性 exec**：`allowExec` 开启后可输入命令，等价
  `docker exec <容器> sh -c "<命令>"`，返回退出码与 stdout/stderr（无 TTY）。
- **交互式终端（卡片第一个图标）**：跑 `docker exec -it '<容器>' sh`。按 tty 能力
  三级降级——
  ![exec 终端抽屉 + 日志页共存：折叠只藏起来、会话保持运行](https://cdn.jsdelivr.net/gh/hyzyn/dsh-plugin-kit@main/docs/dsh-plugin-kit-docker-exec.png)

  1. **就地嵌入（tty ≥ 0.15，推荐）**：在面板底部开一个**终端抽屉**，由 tty 的
     `ttyTerminal.mount` 把终端挂进来。面板不收起，看着容器日志直接进容器敲命令，
     上下文不断。抽屉会挤占正文高度，所以它可以让位而不结束会话：
     **折叠**（标题栏右侧的箭头，或双击顶边）只把抽屉压成一条标题栏，会话照旧跑着；
     **拖拽顶边**可调高度（上限为面板高度的 75%）。真正结束会话的动作只有两个——
     抽屉上的 ✕，以及关闭面板；有活动会话时关闭面板会先弹确认，避免点 backdrop
     空白处时误杀一个正在排障的容器 shell（全局终端面板也是「点空白 = 最小化」，同一取向）。
  2. **借 tty 弹窗开标签（tty ≥ 0.14）**：tty 新开一个标签执行同一命令，随后收起本
     面板（本面板 z-index 更高，不收起用户只会觉得「点了没反应」）。
  3. **复制命令**：未装 tty / 版本过旧 / 内联目标用了 key·password 认证（浏览器端
     没有凭证）时，退化为复制该命令并提示到终端面板粘贴。

  本地目标开本地会话，SSH 目标按连接簿条目名（或 agent 认证的内联字段）走 SSH，
  标签/抽屉标题为 `<容器> · exec`。能力判断走服务契约版本
  （`ttyTerminal.version >= 2` 才有 `mount`），不是猜函数存不存在。

### 目标（本机 / SSH）

| `kind` | 说明 |
| --- | --- |
| `local` | 宿主所在机器上的 docker CLI（`spawn` 直接执行，不经 shell） |
| `ssh` | 经 `ssh2` 连到远程主机，在远程执行 docker CLI（argv 经单引号转义） |

`kind=ssh` 有两种填法：

1. **引用 tty 连接簿条目**：`book` 填条目名（在 设置 → 插件 → 终端面板 的
   连接簿里维护），主机 / 端口 / 用户名 / 认证方式随之生效。设置卡片的下拉
   只列出 tty 已保存的连接簿条目；tty 未安装或条目不存在时，该目标解析失败，
   面板与 agent 工具都会给出明确错误。
2. **内联字段**：`host` + `username` 必填，其余按需（`port` / `auth` /
   `keyPath` / `password` / `passphrase` / `agentForward`）。

目标解析是**每次操作现算**的：在 tty 卡片里改了连接簿条目（换端口、改密码），
下一次操作立即用新值，无需重启。远端需要满足：装了 docker CLI，且当前账号
**免 sudo** 可用 docker（通常在 `docker` 组），否则 `probe` 会原样透出
`permission denied while trying to connect to the Docker daemon socket`
之类的错误。

## 配置（设置 → 插件 → Docker 容器面板，保存即热生效）

![设置卡片：目标 CRUD、能力开关与参数，保存即热生效](https://cdn.jsdelivr.net/gh/hyzyn/dsh-plugin-kit@main/docs/dsh-plugin-kit-docker-setting.png)

配置落在 settings 命名空间 `docker`，即 `~/.dsh/settings.yaml` 的 `docker:`
段（`$DSH_HOME/settings.yaml`；DSH 的 settings 文件由宿主 `dsh-settings-file`
提供）。插件行里的 composition 配置作为 schema `base` 打底，settings 层覆盖
它；HTTP `POST /api/dsh-docker/config` 是卡片的写入通道，只接受下表这些键
（未知键返回 400）。

| 项 | 默认 | 说明 |
| --- | --- | --- |
| `enabled` | true | 关闭整个插件（**需重启 `dsh web` 生效**，与 tty 同语义） |
| `announceToAgent` | true | 是否向 agent 注入能力公告（systemPrompt section `plugin:dsh-docker`） |
| `dockerBin` | `docker` | docker CLI 可执行名或路径（podman 可填 `podman`）；只允许字母、数字与 `_ . / -` |
| `allowMutations` | false | 允许 start / stop / restart / remove（面板按钮与 `docker_action` 工具；关闭时 `/action` 返回 403） |
| `allowExec` | false | 允许一次性 `docker exec`（面板 exec 输入与 `docker_exec` 工具；关闭时 `/exec` 返回 403） |
| `execTimeoutSec` | 30 | exec 默认超时秒数（1~120） |
| `pollIntervalSec` | 5 | 面板统计刷新间隔秒数（1~60） |
| `logTailDefault` | 200 | 日志默认尾部行数（1~5000） |
| `maxOutputKb` | 512 | 单次命令输出上限（KB，1~8192）；超出截断并标记 `truncated` |
| `targets` | `[]` | 目标列表，见下 |
| `hostKeys` | `[]` | SSH 主机指纹记录（TOFU，自动维护） |

数值越界会被夹到边界内，类型不符则回落到默认值。

### `targets[]` 字段

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `name` | —（必填） | 目标展示名，唯一；空名或重名条目在保存时被丢弃（≤64 字符） |
| `kind` | `local` | `local` 本机 / `ssh` 远程 |
| `book` | `''` | `kind=ssh` 时引用 tty 连接簿条目名（留空则用下面的内联字段） |
| `host` | `''` | 内联主机名或 IP（无 `book` 时必填） |
| `port` | 22 | SSH 端口（1~65535，越界回落 22） |
| `username` | `''` | 内联 SSH 用户名（无 `book` 时必填） |
| `auth` | `agent` | `agent`（走 `SSH_AUTH_SOCK`）/ `key`（用 `keyPath`）/ `password`（用 `password`，同时挂 keyboard-interactive） |
| `keyPath` | `''` | `auth=key` 的私钥路径（`~` 开头会展开为 home） |
| `password` | `''` | `auth=password` 的密码；**建议填 `env:VAR`** 引用环境变量 |
| `passphrase` | `''` | 私钥口令；**建议填 `env:VAR`** 引用环境变量 |
| `agentForward` | false | 是否转发本机 ssh-agent（`SSH_AUTH_SOCK` 存在时生效） |

`password` / `passphrase` 里的 `env:VAR` 在连接时才解析（`process.env[VAR]`），
变量缺失或为空会明确报 `环境变量未设置: VAR`。这两个值**永不回传浏览器**：
配置快照里只给 `passwordSet` / `passphraseSet` 两个布尔位。

### `hostKeys[]`（SSH 主机指纹，TOFU）

| 字段 | 说明 |
| --- | --- |
| `host` | 主机名或 IP（必填） |
| `port` | 端口，默认 22（按 host:port 唯一） |
| `fingerprint` | `hostHash: 'sha256'` 回调收到的原样十六进制指纹（必填） |

首次连接自动记录并落盘；之后每次连接必须匹配，**指纹变更直接拒绝连接**，
错误信息带「删除该主机记录再重连」的指引。记录列表在设置卡片里可删除重置。

## agent 工具

| 工具 | 注册条件 | 参数 | 作用 / 典型用法 |
| --- | --- | --- | --- |
| `docker_targets` | 恒注册 | `probe?: boolean` | 列出目标（name / kind / label）；`probe:true` 逐个探测 docker 版本与 daemon 可达性（SSH 目标会建连接，较慢）。其他工具的 `target` 取自这里 |
| `docker_ps` | 恒注册 | `target?`、`all?: boolean` | 列容器（名称 / 状态 / 健康 / 镜像 / 端口 / compose 项目与服务 / 短 ID）；默认只列运行中，`all:true` 含已停止。排障第一步 |
| `docker_inspect` | 恒注册 | `target?`、`id`（必填） | `docker inspect` 的权威详情：状态 / 健康检查 / 退出码 / 重启次数 / 端口 / 挂载 / 网络 / 启动命令 |
| `docker_logs` | 恒注册 | `target?`、`id`、`tail?`（1~5000，默认 `logTailDefault`）、`timestamps?`、`since?` | `docker logs --tail` 尾部；`since` 用 docker 语法（如 `10m`、`2026-09-09T10:00:00`）；超上限标记 `truncated` |
| `docker_stats` | 恒注册 | `target?`、`ids?`（逗号分隔的容器名/ID） | `docker stats --no-stream` 快照：CPU% / 内存用量与占比 / 网络 IO / 块 IO / PIDs；`ids` 省略 = 全部运行中容器 |
| `docker_images` | 恒注册 | `target?` | 镜像列表（仓库:标签 / 大小 / 创建时间 / 短 ID） |
| `docker_action` | 仅 `allowMutations` | `target?`、`action`（`start` \| `stop` \| `restart` \| `remove`）、`id` | 容器生命周期操作。`remove` 是破坏性的：删除容器配置与可写层（数据卷不在其中），执行前必须向用户确认目标容器 |
| `docker_exec` | 仅 `allowExec` | `target?`、`id`、`command`（必填，经容器内 `sh -c` 执行）、`timeoutSec?`（1~120，默认 `execTimeoutSec`） | 一次性 `docker exec`，返回退出码 / stdout / stderr；无 TTY，交互式排障请让用户到 tty 面板跑 `docker exec -it <容器> sh` |

- `target` 省略时回落到**唯一**已配置目标；配置了多个目标则必填，错误信息会
  列出可用目标名。
- 两个开关变化会**立即重注册**工具：关掉 `allowMutations` / `allowExec` 后，
  对应工具从 agent 侧消失，无需重启。
- 推荐排障顺序：`docker_targets` → `docker_ps` → `docker_logs` →
  `docker_inspect` → `docker_stats`。
- `announceToAgent` 开启时，插件向 systemPrompt 注入一段能力公告（含「默认
  只读」「docker socket ≈ 目标主机 root」的约束提醒），让模型先列目标再动手。

## HTTP 路由（`/api/dsh-docker` 前缀，全部 loopback 围栏）

围栏校验 `remoteAddress`（127.0.0.1 / ::1 / ::ffff:127.0.0.1）、`Host`、
`Origin` 与 `sec-fetch-site`；非本机请求一律 403 `forbidden: loopback-only`。
请求体上限 1MB，响应统一 `application/json` + `referrer-policy: no-referrer`。

| 路由 | 方法 | 请求体 | 返回 |
| --- | --- | --- | --- |
| `/config` | GET | — | `{ok:true, config}`：配置快照（targets 只给 `passwordSet` / `passphraseSet`，另附只读的 `ttyBooks` / `ttyAvailable` / `toolsRegistered`） |
| `/config` | POST | 上表配置键的任意子集 | `{ok:true, config}`；未知键 400，非法 JSON 400 |
| `/targets` | GET / POST | — | `{ok:true, targets:[{name, kind, label?\|error?}]}` |
| `/probe` | POST | `{target?}` | `{ok:true, probe:{ok, bin, serverVersion, error, target}}` |
| `/containers` | POST | `{target?, all?}` | `{ok:true, containers: ContainerSummary[]}` |
| `/inspect` | POST | `{target?, id}` | `{ok:true, details: ContainerDetail[]}` |
| `/stats` | POST | `{target?, ids?: string[]}` | `{ok:true, stats: ContainerStats[]}` |
| `/logs` | POST | `{target?, id, tail?, timestamps?, since?}` | `{ok:true, logs:{id, text, truncated}}` |
| `/images` | POST | `{target?}` | `{ok:true, images: ImageSummary[]}` |
| `/action` | POST | `{target?, action, id}` | 需 `allowMutations`（否则 403）；`{ok:true, result:{id, action, message}}` |
| `/exec` | POST | `{target?, id, command, timeoutSec?}` | 需 `allowExec`（否则 403）；`{ok:true, result:{id, command, code, stdout, stderr, truncated, durationMs}}` |

其余子路径 404（`unknown route: ...`）；`/config` 与 `/targets` 之外的 GET
返回 405；执行失败（docker 报错、目标解析失败等）返回 500 或 400 加
`{error}` 文本。

## 安全模型

**docker socket ≈ 目标主机的 root 权限。** 能访问 daemon 就能挂载宿主目录、
以特权模式起容器、读容器里的密钥——因此本插件按「只读优先」设计：

1. **默认只读**。`allowMutations` 未开启时，`/action` 返回 403，面板的启停删
   不可用，`docker_action` 工具**根本不注册**；`allowExec` 未开启时，`/exec`
   返回 403，`docker_exec` 工具同样不注册。两个开关互相独立，必须在设置卡片
   由用户显式打开。
2. **破坏性操作要复述后果**。`remove` 映射为 `docker rm`（**不带 `-f`**），
   agent 公告要求执行前向用户确认目标容器；运行中容器会报错并附
   「容器仍在运行：先停止再删除」的提示，不会静默强删。
3. **凭证不落明文（建议）**。`password` / `passphrase` 支持 `env:VAR` 引用，
   配合 dsh-env-manager 托管密钥可避免明文写进 `settings.yaml`；`agent`
   认证（`SSH_AUTH_SOCK`）则完全不落盘。配置快照只回「是否已设置」。
4. **主机指纹 TOFU 钉扎**。首次连接记录 sha256 指纹，之后必须一致，变更即
   拒绝连接（防中间人）；tty 已确认过的主机会被当作种子直接信任并复制进
   本插件的记录。TOFU 的固有边界是「首次若已遭遇 MITM，记下的就是伪指纹」，
   以及按 host:port 只存一条（同主机多密钥类型可能误报变更，删除记录重连
   即可重新校准）。
5. **命令一律 argv 构造，绝不做字符串拼接**。容器名 / ID 先过白名单
   `assertRef`（`[A-Za-z0-9][A-Za-z0-9_.-]*`，≤128 字符，拒绝空格、`;`、
   `$()`、反引号等），镜像与容器引用同理；远程经 `shJoin` 逐参数单引号
   转义后交给远端 shell，本机 `spawn(bin, args)` 不经 shell。
6. **输出有上限**。`maxOutputKb` 限制单次命令的 stdout/stderr 字节数，超出
   截断并标记，避免大日志撑爆内存或 agent 上下文。
7. **HTTP 只对本机开放**。全部路由走 loopback 围栏，远程浏览器无法调用。

## 已知限制

- **没有交互式 TTY**：`exec` 是一次性命令（`docker exec <id> sh -c <cmd>`，
  不带 `-i` / `-t`），不能跑 vim / top / 交互式 shell，也不能喂 stdin 做
  对话。交互排障请到 tty 面板执行 `docker exec -it <容器> sh`（本机与 SSH
  目标都可以）。
- **没有实时日志流**：日志是 `--tail` 快照，要看新内容需重新拉取；`stats`
  是 `--no-stream` 单次快照，面板靠 `pollIntervalSec` 轮询。
- **docker CLI 版本差异**：解析走 `--format '{{json .}}'`，字段随版本增减，
  解析器一律降级而不抛异常（例如 `State` 缺失就从 `Status` 推导状态，健康态
  从 `(healthy)` / `(unhealthy)` 提取）；缺字段时对应列可能为空，需要权威
  数据请用详情（`docker inspect`）。
- **`docker rm` 不带 `-f`**：运行中的容器删除会失败，错误里附「先停止再删除」
  提示；要强制删除得去 tty 面板手动 `docker rm -f`。
- **SSH 目标需要免 sudo 的 docker**：账号不在 docker 组时 docker 报权限错误，
  面板与工具原样透出，不做自动 sudo 提权。
- **远端未安装 docker**：`probe` 失败（`command not found` / 退出码 127），
  面板显示错误；PATH 不一致时可把 `dockerBin` 填成绝对路径。
- **podman 兼容靠 `dockerBin`**：填 `podman` 即可跑，但 `stats` 与
  `--format '{{json .}}'` 的字段和输出格式与 docker 有差异，只能依赖解析器
  的降级路径，未逐项验证。
- **没有镜像删除 / 拉取 / 构建**：镜像区是只读列表。
- **没有多目标聚合视图**：一次只对一个目标操作，切目标需在面板或工具参数里
  显式选择。
- **连接栏按钮需要一条匹配的目标才有数据**：按钮在 SSH 标签上一律显示，但若会话
  主机没有对应的 `kind=ssh` 目标（连接簿名或 `host:port` 都匹配不上），点开只会看到
  「尚未配置为 Docker 目标」的提示而不是容器列表；本地标签的连接栏本身隐藏。
  目标增删后最多 30 秒内刷新（设置卡片保存会立即刷新）。
- **`enabled: false` 需重启**：关闭插件不会卸载已注册的路由与工具，重启
  `dsh web` 才彻底停用。
- **变更操作无独立审计日志**：只有 docker 自身的记录与宿主 `ctx.logger` 的
  常规输出。

## 工作原理

```
浏览器半体 (client.js)
  ├─ 侧边栏「容器」入口 → 面板：目标选择 / 容器列表（搜索 + 状态筛选）/
  │   容器卡片（动作条分两组：查看=终端/日志/统计 ｜ 变更=启停/重启/删除）/ 镜像列表 / 一次性 exec
  │     └─ 终端抽屉：tty ≥ 0.15 时经 ttyTerminal.mount 就地嵌入 tty 的终端
  │        （面板不收起；折叠/拖拽只改尺寸，会话不中断；✕ 或关面板才 dispose，
  │        有活动会话时关面板先确认 → tty 那边结束会话并拆 DOM）
  │     └─ fetch → /api/dsh-docker/*（loopback 围栏）
  ├─ 可选消费 tty 的 ttyConnbar 服务 → SSH 连接栏「容器」按钮
  │   （按 book 名 / host:port 匹配已配置目标，命中才出现）
  ├─ 可选消费 tty 的 ttyPanel 服务（0.16.0）→ 终端面板开着时挂右侧 dock
  └─ 可选消费 tty 的 ttyTerminal 服务 → 卡片「终端」按钮直接开 docker exec 标签
      （tty 不可用 / 凭证不在浏览器时退回复制命令）

宿主半体 (src/index.ts)
  ├─ settings 命名空间 docker（~/.dsh/settings.yaml）
  │   DOCKER_SETTINGS_SCHEMA → normalizeConfig（夹紧 / 白名单键）
  ├─ 只读复用 tty settings 的 sshHosts（连接簿）与 hostKeys（指纹种子）
  ├─ resolveTarget：local → runLocal；ssh → book 查连接簿或内联字段
  ├─ 每目标一个 DockerApi（src/docker.ts）
  │   ├─ argv 构造 + assertRef 白名单 + 输出上限（maxOutputKb）
  │   └─ 解析容错：{{json .}} 逐行/数组、字段名大小写兼容、缺字段降级
  ├─ RemoteExec（src/ssh-exec.ts）
  │   ├─ 懒连接池：同 user@host:port 复用一条连接，空闲 120s 回收
  │   │   （每 30s 扫一次，连接超时 20s，keepalive 10s）
  │   ├─ 非 PTY exec channel：一命令一 channel，收完 stdout/stderr 即关
  │   ├─ shJoin 单引号转义（远端 shell 解析）；env:VAR 取密
  │   └─ hostVerifier TOFU 钉扎（首次记录、变更拒绝）
  ├─ runLocal：spawn(dockerBin, args)（不经 shell，本机目标）
  └─ agent 工具：docker_targets / docker_ps / docker_inspect /
     docker_logs / docker_stats / docker_images（恒注册）
     + docker_action（allowMutations）/ docker_exec（allowExec）
```

## 开发与验收

```bash
pnpm --filter @hyzyn/dsh-docker build       # tsc → lib/（宿主半体）+ esbuild → client.js（浏览器半体）
pnpm --filter @hyzyn/dsh-docker typecheck
pnpm --filter @hyzyn/dsh-docker smoke       # 三套离线回归，都不需要 docker daemon
```

`scripts/smoke.mjs`（22 项，读取 `lib/` 构建产物）覆盖纯逻辑：ps 解析（字段映射 /
compose 标签 / 端口 / `State` 缺失推导 / 噪声行 / JSON 数组）、端口串解析与去重、
stats 解析（百分比 / 内存 / IO / PIDs）、size 与 percent 的异常输入、images 解析
（dangling）、inspect 解析（状态 / 健康 / 退出码 / 挂载 / 网络 / 端口 / 缺字段不抛
异常）、`assertRef` 注入拒绝、`assertBin`、`shJoin` 转义、`DockerApi` 的 argv 构造
（ps / logs / action / exec / probe 成败）、`normalizeConfig` 默认值与夹紧、
`sanitizeTargets` / `sanitizeHostKeys`、`resolveTarget` 的四种路径、
`mergeTargetSecrets` 的凭证保留语义。

`scripts/route-smoke.mjs`（28 项）用**假 cordis ctx + 假 docker CLI 脚本**跑端到端：
插件挂载（settings / 工具 / 路由 / 能力公告注册）、11 条路由的实际调用与返回、
`/config` 凭证脱敏、未知配置键 400、默认只读时 `/action` 与 `/exec` 403 且对应
工具不注册、打开开关后（含 `settings/updated` 热更新路径）立即解锁、非 loopback
403、容器名注入尝试被白名单拒绝、省略 `target` 的回落与多目标报错。

`scripts/client-smoke.mjs`（11 项）在 Node 里用最小 DOM / React 桩执行构建产物
`client.js`：验证注册 id 与 factory 形状、只 require 平台 seed 提供的模块
（`react` / `react/jsx-runtime` / `react-dom/client`）、`apply` 注册的 settings
卡片 key 等于命名空间 `docker`、找不到宿主侧边栏时安静降级且卸载可重复调用，ttyConnbar 集成的四条路径（连接簿名命中 / host:port 命中 / 未配置主机不加按钮 / tty 未安装静默跳过），以及侧边栏折叠态（`data-sidebar-collapsed`）隐藏入口标签的样式规则。
需要真 daemon 的验证走下面的手工清单。

### 手工验收清单

1. **本机目标**：加一条 `kind=local` 的 `本机`，`probe` 返回 server 版本；
   容器列表与 `docker ps -a` 一致（含已停止容器）。
2. **SSH 目标**：tty 连接簿里已有条目时，用 `book` 引用它 → 容器列表 / 详情 /
   日志正常；首次连接日志里出现「已记录 host key 指纹（TOFU）」，第二次不再
   提示；手动改掉 `hostKeys` 里的指纹后重连，应**被拒绝**并给出重置指引。
3. **只读拦截**：两个开关都关时，`/action` 与 `/exec` 返回 403，agent 侧看不到
   `docker_action` / `docker_exec`，面板对应按钮不可用。
4. **日志 / 统计 / 镜像**：`tail` 与 `timestamps` / `since` 生效；统计显示
   CPU、内存、网络与块 IO；镜像列表含 dangling 条目标记。
5. **`allowMutations` 打开后**：stop / start / restart 成功；对运行中容器
   remove 报错并附「先停止再删除」提示，先 stop 再 remove 成功。
6. **`allowExec` 打开后**：`ls -la /app` 之类命令返回 stdout 与退出码；把命令
   换成 `sleep 60`（`timeoutSec` 调小）应被中断并报超时；`command` 超过 8000
   字符被拒绝。
7. **exec 抽屉与正文共存**（tty ≥ 0.15）：卡片「终端」开抽屉后切到日志 / 统计 /
   另一台容器的详情，抽屉与终端会话都必须活着；**折叠**（箭头或双击顶边）把抽屉
   压成一条标题栏、会话继续跑（展开即回原样）；**拖拽顶边**能调高度且不超过面板
   的 75%；此时点 backdrop 空白处或面板 ✕ 应弹「结束容器终端会话」确认，取消后
   会话仍在，确认才结束（tty 侧收到 kill）。
   离线回归：`node packages/tty/scripts/preview.mjs docker-exec-logs`
   （无头 Chrome 跑真实客户端：抽屉 + 日志页 + 折叠展开，断言会话未被结束）。
8. **从连接栏进容器面板（dock 模式，需 tty ≥ 0.16）**：tty 面板里开一个 SSH 标签 →
   连接栏「容器」→ 容器面板应挂在**终端右侧**（不是全屏弹窗），终端仍可输入；
   拖左边缘可调宽（上限面板宽 72%）、标题栏箭头折叠成窄条（终端拿回全部宽度、
   容器面板不卸载）、✕ 收起面板且 SSH 标签不受影响；此时点卡片「终端」应在同一
   终端面板**新开一个 `<容器> · exec` 标签**，而不是再嵌一个终端抽屉。
   离线回归：`node packages/tty/scripts/preview.mjs docker-dock`
   （断言 docked / 无 backdrop / 折叠后终端变宽 / 容器面板存活）。

## 版本 / 许可证

`@hyzyn/dsh-docker` 0.3.1 · [Apache License 2.0](../../LICENSE)
