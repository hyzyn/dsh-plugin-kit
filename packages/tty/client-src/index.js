/* eslint-disable */
/**
 * @hyzyn/dsh-tty — 浏览器半体：侧边栏「终端」入口 + 大弹窗 xterm 面板。
 * 由 scripts/build-client.mjs 用 esbuild 打包为单文件 IIFE（xterm 内核随
 * bundle 分发），经 window.__ModuleLoader__.load 注册。
 *
 * v0.2 能力：
 * v0.3 能力：
 *   - 最小化/折叠：点空白处、Esc 或「—」按钮把弹窗收起，PTY 会话与输出
 *     缓冲保持存活；最小化状态合并进侧边栏「终端」入口（会话数徽标 +
 *     状态点，点击入口恢复），入口不在时才退回紧凑悬浮条；✕ 才真正关闭
 *   - 多会话标签页（每标签一个 sid 的 xterm 实例，可切换/关闭/新建）
 *   - 新标签默认在当前会话工作目录打开（注入 sessions 客户端服务）
 *   - 便利功能：终端内搜索（Ctrl+F）、可点击链接、清屏/复制/粘贴按钮
 * v0.4 能力：
 *   - 标签栏「+」改为菜单：本地终端 / SSH 连接簿（读 /api/dsh-tty/config 的
 *     sshHosts）/ SSH 连接…（host/port/username/auth 表单，可保存回连接簿）
 *   - SSH 会话：{t:'ssh'} 帧创建（name 引用连接簿或内联字段），ready 帧的
 *     target 回显到状态栏与标签标题；respawn 复用原 spawnSpec
 *   - 设置卡片维护 SSH 连接簿（列表 + 删除，随「保存」写入 tty settings）
 * v0.5 能力：
 *   - 断线保活与重连：异常断开（刷新页面/网络抖动）后会话在宿主保活
 *     reconnectGraceSec（默认 120s），客户端自动重连（指数退避封顶 5s），
 *     对存活标签发 {t:'attach'} 恢复并回放缓冲；页面刷新后从 sessionStorage
 *     恢复标签列表（未存活者自动丢弃）；✕ 关闭才真正结束全部会话
 *   - WebGL 渲染器（@xterm/addon-webgl，上下文丢失自动回退 DOM 渲染器）
 * v0.6 能力：
 *   - SSH 对话框：agent forwarding 勾选；密码/口令字段「从 env 插件变量填入」
 *     凭据引用选择器（候选来自连接簿里在用的引用名，与 env 插件解耦）
 *   - 「+」菜单连接簿条目带 ✎ 编辑：对话框编辑模式（预填全字段，可改名，
 *     「保存修改」按原名替换条目），连接照常可用
 *   - 设置卡片：从 ~/.ssh/config 导入连接簿（同名跳过）；从 known_hosts 导入
 *     主机指纹（TOFU 预填充）；shell 集成开关；连接簿行内编辑表单；
 *     Shell 路径可选可输入（自绘下拉候选来自 /api/dsh-tty/shells）
 *   - 标签双击重命名（随标签持久化，断线恢复保留）
 * v0.8 能力：
 *   - SFTP 文件浏览：文件 / 文件夹拖到对话框任意位置即上传（webkitGetAsEntry
 *     递归展开整文件夹、保留层级，逐文件进度 i/n），拖入时列表高亮可放置
 * v0.9 能力：
 *   - 紧凑头部：标签行兼作标题行（去「终端」标题文字与常态「已连接」状态
 *     文字，异常/瞬时消息才点亮；搜索/清屏/复制/粘贴改图标按钮），下方保留
 *     一条 SSH 连接栏——左侧状态点 + 目标，右侧 SFTP / 隧道等图标扩展按钮，
 *     本地终端标签整栏隐藏
 *   - SFTP 双栏风格（设置 sftpStyle 可选 dialog/dual）：左本机 / 右远程两栏，
 *     行内 ⇨/⇦ 由宿主 /api/dsh-tty/local-fs/transfer 服务端直传（目录递归、
 *     同名覆盖，字节不经过浏览器）；单窗体风格照旧
 * v0.10 能力：
 *   - 会话持久化（设置 persistence=tmux 即唯一开关）：新开的本地/SSH 标签
 *     默认持久化——spawn/ssh 帧带 persist + 稳定 persistName，宿主以
 *     `tmux -L dsh-tty new-session -A -s <名>` 托管；断线保活超时 / 宿主
 *     重启后重开标签按同名接回原现场（tmux 重画可见屏，正在跑的程序原样
 *     存活）；连接栏与 ready 帧带 tmux 持久标记；0.10.1 起持久标签规格
 *     另存 localStorage（跨窗口），新窗口经 sessions 帧的 tmux 清单确认
 *     后自动接回；reset 后以 refresh 帧请宿主 refresh-client 重画
 * v0.11 能力：
 *   - SSH 连接测试：设置卡片连接簿条目行内「测试」按钮 + SSH 连接对话框
 *     「试连」按钮——按当前填写的 host/port/认证 走宿主 /api/dsh-tty/probe
 *     做 TCP → 主机密钥（TOFU）→ 认证 逐段诊断，不建会话不占名额；连接簿
 *     测试随行展示结果（成功/失败原因 + host key 记录/匹配/变更提示）
 *   - SFTP 传输进度条：底部状态行新增细进度条 + 百分比——上传（XHR 流式，
 *     多文件带 i/n 标签）、下载（改流式读 response.body，content-length
 *     算百分比；无双栏整传走服务端直传时为不定进度脉冲）
 * v0.12 能力（视觉 overhaul）：
 *   - 样式表独立成 client-src/tty.css，并引入 --tt-* 令牌层（圆角/控件高度/
 *     间距/动效统一，颜色全部派生自 --dsw-* 皮肤 token；注意令牌声明在
 *     :where(html, body) 上——DSH 的深色主题是挂 body[data-ds-dark-theme]
 *     覆盖 --dsw-* 的，声明在 :root 会永远取到浅色值）
 *   - 面板/头部/标签/连接栏/终端区重排：投影 + 圆角 + 入场动效、活动标签强调、
 *     状态胶囊限宽省略、连接栏 tmux 持久徽标独立成 chip、终端底色与 xterm
 *     配色（光标取皮肤强调色、行高 1.35、JetBrains Mono 优先）
 *   - 图标全面矢量化为内置 SVG 常量（窗口按钮 / 菜单 / SFTP 行内操作 / 文件
 *     类型），替换 emoji 与文字符号；行内操作按钮改为悬停显现
 *   - 遮罩改为「图标 + 标题 + 可点副文案」动作卡片；toast 分 warn/error/info
 *     三态配色；SFTP 双栏每栏独立条目数；env 变量列表改为聚焦展开
 * 帧协议与宿主半体（src/index.ts）对齐：spawn/ssh/input/resize/kill/
 * sessions/attach ↔ ready/data/exit/error/sessions。
 */
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { SearchAddon } from '@xterm/addon-search'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { WebglAddon } from '@xterm/addon-webgl'
import xtermCss from '@xterm/xterm/css/xterm.css'
import ttyCss from './tty.css'
import { formatJumpShorthand, parseJumpShorthand } from './jump-field.js'
import { resolveDockOwner, dockPaneVisible } from './dock-owner.js'
import { deriveWsUrl } from './ws-url.js'
import { asciiRefToken, derivedCredentialRef } from './credential-ref.js'
import { applyTunnelEdit, buildTunnelFromDraft as buildTunnelSpec, tunnelNameClash } from './tunnel-edit.js'
import { currentSessionCwd } from './current-session.js'
import { eventOwnsStatus, needsStatusResync, statusForTab } from './status-line.js'
import { formatBytes, formatRate, hasUsableStats, statsFrameFresh, statsItemSpecs, statsItemValues, statsLevel } from './stats-bar.js'

/* ================================ CSS ================================ */

// 样式表独立成 client-src/tty.css，经 esbuild 的 text loader 内联进 client.js
// （与 xterm.css 同一条路径），便于按组件维护。

/* ================================ 国际化 ================================ */

/*
 * 界面文案走宿主 `@deepseek-ai/dsh-client-locale` 的目录（方案见 docs/i18n.md）。
 * 目录**内联在 client-src/index.js**（不是单独一个模块）：本包用 esbuild 打成单文件 IIFE，
 * 多一个模块就多一层「谁在什么时候加载」的不确定性，而 docs/i18n.md 明确要求目录住在主半体里。
 *
 * **目录与本段的 `t` 声明在模块作用域，不在 module-loader 的 factory 里**——这是本包与
 * codegraph 的区别：tty 的界面代码绝大部分（连接栏 / SFTP / 状态条 / 面板骨架 / 状态行）
 * 都在 factory 之前的模块顶层函数里，只有设置卡片与 `exports.apply` 在 factory 内。声明在
 * 模块顶层，两边才都能看见同一个 `t`。sibling 模块（stats-bar / status-line / tunnel-edit）
 * **不 import 这里的 `t`**（那会成环），而是把它当参数传进去——与 codegraph 的 pure.js 同一套。
 *
 * 下面这一对目录由 `scripts/check-i18n.mjs` 静态校验：zh/en 键集一致、`{name}` 占位符两边
 * 一致、代码里 `t('…')` 用到的键必须在这里有定义。
 *
 * **模块级常量里的 `t()` 必须走 getter / 函数**：`t()` 在模块加载时求值等于把当前语言
 * 冻住（`installI18n(ctx)` 要等 apply 才跑，语言切换也不会重算）——本包的 `STATS_ITEM_SPECS`
 * 因此改成了 `statsItemSpecs(t)` 函数（见 client-src/stats-bar.js）。
 *
 * `tty_capture{last}` 这类**语法示例**里的花括号会被 `i18nFormat` 当成占位符——只在
 * 传了 params 时才会替换，这几条键的调用一律不传 params，所以原样显示。
 */
/* ==== dsh-i18n:begin ==== */
const I18N_NS = 'tty'
const I18N_ZH = {
  'error.credServiceMissing': '宿主未提供凭据服务（remote.credentials）',
  'error.credServiceIncomplete': '凭据服务不完整',
  'error.credStoreUnavailable': '宿主未提供凭据服务（remote.credentials），无法存入',
  'error.credStoreFailed': '存入凭据存储失败：{error}',
  'error.credClearUnavailable': '宿主未提供凭据服务（remote.credentials），无法清除',
  'error.credClearFailed': '清除失败：{error}',
  'error.credRefNeedsHost': '先填「主机」和「用户名」再存入——引用名由这两者派生',
  'btn.reopen': '重新打开',
  'btn.reopenTitle': '以原连接信息重开会话',
  'btn.sftpTitle': '打开该连接的文件浏览（SFTP）',
  'btn.tunnels': '隧道 {count}',
  'btn.tunnelsTitle': '查看该连接的端口转发隧道',
  'btn.more': '更多',
  'btn.moreTitle': '更多操作（端口转发…）',
  'btn.reopenSession': '重新打开会话',
  'status.exited': '会话已退出',
  'status.ended': '会话已结束',
  'btn.clickReopen': '点击重新打开',
  'btn.clickRerun': '点击重新执行',
  'msg.passwordNotStored': '出于安全考虑，明文密码/口令不随浏览器存储保留，本次连接需要重新输入：重开标签时再填一次，或在设置卡片把凭据换成 env: 引用（值存宿主凭据存储）。',
  'error.terminalNeedsCommand': 'ttyTerminal 需要 command',
  'error.terminalCommandSingleLine': 'command 必须是单行',
  'error.terminalNeedsHost': 'ttyTerminal.mount 需要 HTMLElement 作为挂载点',
  'error.panelNotReady': 'ttyPanel.mountPane：终端面板未就绪',
  'panel.dragHeight': '拖动调整高度',
  'panel.dragWidth': '拖动调整宽度',
  'btn.closePane': '关闭侧栏',
  'btn.expandPane': '展开侧栏',
  'btn.collapsePane': '收起侧栏',
  'panel.tabLabel': '终端 {n}',
  'btn.close': '关闭',
  'btn.closeTabAria': '关闭标签：{label}',
  'btn.newTab': '新建（本地 / SSH）',
  'meta.tunnelRemote': '远程:{host}:{port} → 本机:{local}',
  'meta.tunnelLocal': '本机:{local} → {host}:{port}',
  'status.tmuxPersistedTitle': '已由 tmux 托管 — 断线 / 宿主重启后按名接回现场',
  'status.notPersisted': '未持久化',
  'status.tmuxUnavailableTitle': '请求了持久会话，但 tmux 不可用 — 当前为普通会话',
  'status.connected': '已连接',
  'status.connecting': '连接中',
  'status.errored': '连接出错',
  'panel.tunnels': '端口转发',
  'hint.tunnelsSettings': '在 设置 → 插件 → 终端面板 里配置',
  'panel.tunnelsFor': '端口转发 — {name}',
  'list.loading': '加载中…',
  'hint.tunnelsCard': '增删/启停在 插件配置 → 终端面板 的端口转发区块维护',
  'list.noActiveTunnels': '该连接暂无启用的隧道',
  'status.fatalSuffix': '（不重试，需修配置）',
  'msg.maxSessions': '会话数已达上限（共 {live} 个 / 上限 {max}：本窗口 {own} 个{others}）——关闭不用的窗口/标签，或在设置卡片调大「并发会话上限」',
  'msg.maxSessionsOthers': ' + 其他窗口 {count} 个',
  'error.probeHttp': '连接测试失败（HTTP {status}）',
  'msg.probing': '连接测试中…',
  'meta.reachable': '通',
  'meta.unreachable': '不通',
  'meta.probeBanner': 'banner 正常',
  'meta.hostKeyMatched': '主机密钥匹配',
  'meta.hostKeyRecorded': '主机密钥已记录（TOFU）',
  'meta.hostKeyMismatch': '主机密钥不匹配！',
  'meta.authOkMs': '认证通过（{ms}ms）',
  'meta.authOk': '认证通过',
  'meta.probeOk': '✅ 连接成功：{detail}',
  'error.unknown': '未知错误',
  'btn.maxSessionsTitle': '会话数已达上限——点击查看怎么办',
  'option.localTerminal': '本地终端',
  'hint.tmuxHosted': 'tmux 托管 · 宿主重启后可恢复',
  'hint.openInSessionCwd': '在当前会话工作目录打开',
  'panel.sshBook': 'SSH 连接簿',
  'btn.sftpFileBrowse': 'SFTP 文件浏览',
  'btn.editConnection': '编辑连接',
  'list.emptySshBook': '（空 — 在设置卡片或「SSH 连接…」里保存）',
  'option.sshConnect': 'SSH 连接…',
  'hint.sshConnect': '手动填写主机 / 用户 / 认证方式',
  'panel.editConnection': '编辑连接 · {name}',
  'panel.sshConnect': 'SSH 连接',
  'section.jump': '跳板机',
  'field.jumpHost': '跳板机（[用户@]主机[:端口]，留空 = 直连）',
  'placeholder.jumpHost': '例如 bastion.corp:2222',
  'check.jumpOwnCred': '跳板机使用独立凭据',
  'field.jumpUsername': '跳板机用户名（留空沿用目标）',
  'field.jumpAuth': '跳板机认证方式（留空沿用目标）',
  'hint.jumpInherit': '留空凭据 = 沿用上面那台主机的认证方式与钥匙；跳板机连不上时错误文案会点名它（不会伪装成目标超时）。',
  'meta.jumpStage': '跳板机 {label}',
  'meta.viaJump': '⇢ 经 {label}',
  'meta.viaProxy': '⇢ 经代理命令',
  'section.proxyCommand': '代理命令',
  'field.proxyCommand': '代理命令（ProxyCommand，留空 = 不用）',
  'placeholder.proxyCommand': '例如 ssh -W %h:%p bastion',
  'hint.proxyCommand': '本机执行的命令，它的 stdin/stdout 就是到目标的 SSH 传输（等价于 OpenSSH 的 ProxyCommand）。支持 %h 目标主机、%p 端口、%r 用户名、%n 主机、%% 字面 %；其余写法原样保留。与跳板机同时填时跳板机优先（OpenSSH 语义）。需要下面那个开关，~/.ssh/config 导入不会自动带入它。',
  'hint.proxyCommandDisabled': '⚠ 当前「允许 ProxyCommand」未打开：这条命令不会执行，连接会明确失败（不会退回直连）。到 插件配置 → 终端面板 打开开关后生效。',
  'meta.probeProxy': '代理命令',
  'meta.probeProxyOff': '代理命令（未启用）',
  'meta.probeTcpSkipped': '直连预检已跳过（走代理命令）',
  'section.connection': '连接',
  'field.host': '主机',
  'placeholder.host': 'example.com 或 IP',
  'field.port': '端口',
  'field.username': '用户名',
  'section.auth': '认证',
  'field.authMethod': '认证方式',
  'option.authInherit': '（沿用目标）',
  'option.authAgent': 'agent — 使用本机 ssh-agent',
  'option.authKey': 'key — 私钥文件',
  'option.authPassword': 'password — 密码',
  'field.keyPath': '私钥路径',
  'field.passphrase': '私钥口令（可空）',
  'field.password': '密码',
  'placeholder.credRef': '或：选择凭据存储里的引用名',
  'hint.credRefCandidates': '候选 = 凭据存储里已有的引用名 + 本机连接簿里在用的引用名',
  'list.credOverwrite': '{name}（再点覆盖已填）',
  'list.moreMatches': '还有 {count} 个 — 继续输入筛选',
  'list.noCredRef': '没有匹配的引用',
  'check.rememberCredential': '保存时存入凭据存储',
  'hint.rememberCredential': '勾选后，点「保存修改」或「连接（并保存）」时把密码写进官方凭据存储，字段里只留 env: 引用（值在 ~/.dsh/.credentials.yaml，不进环境、不回传浏览器；挡不住同用户进程与 agent）。不勾选则按现状明文写进设置文件。能用密钥 / agent 就别存密码。',
  'btn.clearCredential': '清除已存凭据',
  'error.credPlainUnavailable': '宿主未提供凭据服务（remote.credentials），只能明文保存',
  'error.credPlainIncomplete': '凭据服务不完整，只能明文保存',
  'status.credUnreported': '引用 {ref}：宿主未报告状态',
  'error.credStatusFailed': '读取凭据状态失败：{error}',
  'status.credStored': '已存入{source} · {ref}',
  'meta.credSource': '（来源 {source}）',
  'status.credUnknown': '引用 {ref}：存储里还没有这个值',
  'hint.noCredRefPassphrase': '还没有别的连接用过凭据引用 — 可在私钥口令框直接手输 env:NAME',
  'hint.noCredRefPassword': '还没有别的连接用过凭据引用 — 勾上面的「保存时存入凭据存储」新建一个，或直接在密码框手输 env:NAME',
  'section.options': '选项',
  'check.agentForward': 'agent forwarding（远程可用本地 ssh-agent 钥匙，如远程 git clone）',
  'check.persist': '持久会话（tmux 托管，断线/重启后恢复现场；远程需安装 tmux）',
  'check.saveToBook': '保存到连接簿（同名覆盖）',
  'field.bookName': '连接簿名称',
  'placeholder.bookName': '留空则用主机名',
  'error.hostUserRequired': '主机与用户名必填',
  'error.keyPathRequired': 'auth=key 需要私钥路径',
  'error.passwordRequired': 'auth=password 需要密码',
  'btn.cancel': '取消',
  'btn.connect': '连接',
  'btn.fileBrowse': '文件浏览',
  'btn.browseTitle': '不动终端，直接以当前填写的信息打开 SFTP 文件浏览',
  'btn.probe': '试连',
  'btn.probeTitle': '按当前填写诊断连接（TCP → 主机密钥 → 认证）；不会新建会话，也不记录主机指纹',
  'error.saveCredFailed': '保存失败：{error}',
  'btn.saveEdit': '保存修改',
  'error.saveBookFailed': '保存连接簿失败：{error}',
  'error.bookNameTaken': '连接簿里已有同名条目: {name}',
  'panel.sftpDual': 'SFTP 双栏 · {label}',
  'status.failed': '失败',
  'status.done': '完成',
  'placeholder.localPath': '本机路径（回车跳转）',
  'placeholder.remotePath': '远程路径（回车跳转）',
  'btn.refresh': '刷新',
  'btn.mkdir': '新建目录',
  'error.dirNotReady': '目录尚未定位完成',
  'meta.dir': '目录',
  'btn.transferTo': '传输到{target}：{path}',
  'meta.local': '本机',
  'meta.remote': '远程',
  'error.transferDirsNotReady': '两侧目录尚未定位完成，等列表加载后再传输',
  'msg.transferring': '传输 {name}…',
  'error.transferFailed': '传输失败',
  'error.noTaskId': '服务端未返回任务 id',
  'msg.transferCanceled': '已取消传输 {name}',
  'msg.transferred': '已传输 {name}',
  'btn.download': '下载 {name}',
  'btn.rename': '重命名 {name}',
  'placeholder.newName': '新名称',
  'btn.deleteEntry': '删除 {name}',
  'btn.deleteEntryDir': '删除 {name}（含内容）',
  'msg.deleted': '已删除 {name}',
  'list.parentDir': '..（上级目录）',
  'list.emptyDir': '（空目录）',
  'list.truncated': '…其余 {rest} 项未渲染（共 {total} 项）——用上方路径框跳转到子目录定位',
  'list.itemCount': '{count} 项',
  'placeholder.newDirName': '新目录名（相对当前目录）',
  'msg.creatingDir': '创建目录 {name}…',
  'btn.ok': '确定',
  'btn.confirm': '确认?',
  'btn.cancelTransfer': '取消传输',
  'msg.downloadCanceled': '已取消下载 {name}',
  'error.downloadFailed': '下载失败',
  'msg.downloaded': '已下载 {name}（{size}）',
  'error.downloadTooBig': '文件超过下载上限（{size}）：请用双栏 ⇦ 直传或终端 scp/rsync',
  'msg.canceled': '已取消',
  'btn.upload': '上传',
  'btn.uploadTitle': '选择文件上传；也可以把文件 / 文件夹直接拖进列表',
  'msg.uploading': '上传中…',
  'msg.uploadDone': '上传完成',
  'error.uploadFailed': '上传失败',
  'error.networkError': '网络错误',
  'error.uploadCountExceeded': '文件数超过上限（{max}）：本次 {count} 个，请分批上传',
  'status.overLimit': '超限',
  'error.uploadTooBig': '文件超过上传上限（{size}）：{name}，请用双栏 ⇨ 直传或终端 scp/rsync',
  'error.uploadTotalTooBig': '文件总大小超过上传上限：请分批上传（或用双栏 ⇨ 直传）',
  'msg.uploadCanceled': '已取消上传（已传 {done}/{total} 个）',
  'status.allDone': '全部完成',
  'msg.uploadDoneCount': '上传完成 {count} 个文件',
  'error.connectFailed': '连接失败：{error}',
  'status.connectingEllipsis': '连接中…',
  'status.connectedPid': '已连接 pid={pid}',
  'status.connectedSsh': 'SSH {target}已连接',
  'status.exitedWith': '已退出 {detail}',
  'status.error': '错误：{message}',
  'status.retryHint': '{message} · 点击重试',
  'btn.clickRetry': '点击重试',
  'status.disconnectedReconnecting': '连接断开 — 自动重连中',
  'status.disconnected': '连接断开',
  'status.reconnecting': '自动重连中…',
  'error.copyFailed': '复制失败：当前环境不允许访问剪贴板（http 访问时请改用 localhost 或终端内快捷键）',
  'error.pasteFailed': '浏览器不允许网页读取剪贴板（http 访问时常见）：请在终端里按 Ctrl+V / Cmd+V 粘贴',
  'status.initializing': '初始化…',
  'placeholder.search': '搜索 (Enter 下一个, Shift+Enter 上一个)',
  'btn.searchTitle': '搜索 (Ctrl+F)',
  'btn.clearTitle': '清屏',
  'btn.copyTitle': '复制选中内容',
  'btn.pasteTitle': '粘贴',
  'btn.minimizeTitle': '最小化（会话保持运行，状态并入侧边栏入口）',
  'btn.closePanelTitle': '关闭面板（结束会话，标签保留，重开即恢复列表）',
  'btn.restoreDock': '点击恢复终端窗口',
  'panel.title': '终端',
  'status.minimized': '终端已最小化 — 点击恢复',
  'error.configLoadFailed': '读取配置失败',
  'error.saveTunnelFailed': '保存隧道失败',
  'error.tunnelNameTaken': '已存在同名隧道「{name}」——同一「连接簿条目 + 方向 + 端口」只能有一条。改端口会得到新名字，或先删掉旧的那条。',
  'msg.tunnelApplied': '隧道「{name}」已生效',
  'msg.tunnelUpdated': '隧道「{name}」已更新',
  'error.nameHostUserRequired': '名称、主机、用户名必填',
  'msg.hostEdited': '已修改条目「{name}」— 随「保存」写入配置',
  'error.probeFailed': '❌ 连接失败：{error}',
  'error.hostKeyDeleteFailed': '删除主机密钥记录失败',
  'msg.hostKeyDeleted': '已删除主机密钥记录（下次连接重新记录指纹）',
  'error.sshConfigReadFailed': '读取 ~/.ssh/config 失败',
  'msg.proxySkipped': '{count} 条用了跳板机但解析不出跳板机（别名缺失 / 别名自己还依赖跳板机）未导入：{names}',
  'msg.proxyCommandSkipped': '{count} 条只配了代理命令（ProxyCommand）未导入：{names} —— 代理命令是「本机执行一条命令」那一档，导入不会自动带入；需要时在连接簿里手填并打开「允许 ProxyCommand」',
  'msg.skippedNotConcrete': '{count} 条不是具体主机（通配 / 无 User）',
  'list.separator': '、',
  'meta.etc': ' 等',
  'msg.importOverflow': '超过导入上限的 {count} 条未导入',
  'list.separatorFull': '；',
  'msg.noNewEntries': '没有新条目（{count} 条同名跳过）',
  'msg.noImportableHosts': '~/.ssh/config 里没有可导入的具体主机',
  'msg.importedHosts': '已导入 {added} 条（同名跳过 {skipped} 条），随「保存」写入配置',
  'error.knownHostsReadFailed': '读取 ~/.ssh/known_hosts 失败',
  'msg.noNewFingerprints': '没有新指纹（{count} 条已存在）',
  'msg.noImportableKnownHosts': 'known_hosts 里没有可导入的具体主机',
  'error.saveHostKeysFailed': '保存 hostKeys 失败',
  'msg.importedFingerprints': '已导入 {added} 条主机的指纹（跳过 {skipped} 条已存在）',
  'hint.knownHostsTruncated': '；注意：known_hosts 超过 500 条主机，本次仅导入前 500 条',
  'error.saveFailed': '保存失败',
  'msg.saved': '已保存并热生效',
  'check.rememberCredentialApply': '应用时存入凭据存储',
  'hint.appliedOnSave': '随卡片「保存」写入配置',
  'card.name': '终端面板',
  'card.desc': 'xterm 终端面板：多标签页、断线自动重连、cwd 跟随会话、SSH 连接簿与主机指纹钉扎、tmux 会话持久化。',
  'card.descFull': 'xterm 终端面板：多标签页、断线自动重连、cwd 跟随会话、SSH 连接簿与主机指纹钉扎、tmux 会话持久化；shell / TERM / 并发上限等保存即热生效。',
  'list.loadingConfig': '加载配置中…',
  'section.basic': '基础',
  'check.enabled': '启用插件（保存即热生效：工具与面板入口立刻收起，会话转保活）',
  'check.announce': '向 agent 公告终端面板能力',
  'check.shellIntegration': 'shell 集成（OSC 133/7 注入）',
  'check.shellIntegrationWindows': 'shell 集成（OSC 133/7 注入，tty_capture{last} 与 cwd 跟随依赖它）',
  'hint.shellIntegrationWindows': 'Windows 宿主上不适用：注入走的是 POSIX 的 `-c` 包装层与 rc 桩，cmd / PowerShell 上都不成立（实测 cmd 忽略 `-c` 空跑、PowerShell 报 export 不存在）。因此**本地**标签的 cwd 跟随与 tty_capture{last} 不可用；远程 Linux / macOS 主机照旧支持。',
  'section.sftp': 'SFTP 文件传输',
  'field.sftpStyle': 'SFTP 文件浏览风格',
  'option.sftpDialog': '单窗体 — 远程目录 + 上传/下载/拖拽',
  'option.sftpDual': '双栏 — 左本机 / 右远程，选中直传',
  'hint.sftpDual': '双栏在本机与远程之间对拷文件（目录递归、同名覆盖）；重新打开 SFTP 后生效',
  'field.sftpLimits': 'SFTP 传输限制（0 = 不限）',
  'field.downloadLimit': '下载上限 (MB)',
  'field.uploadLimit': '上传上限 (MB)',
  'field.uploadCountLimit': '批量文件数上限',
  'hint.sftpLimits': '浏览器侧保护：单个文件超过上限时中止下载/上传（大文件请用双栏 ⇨/⇦ 直传或终端 scp/rsync，不占浏览器内存）；文件数上限针对一次批量/拖拽上传；保存即热生效',
  'section.session': '会话',
  'field.persistence': '会话持久化（tmux）',
  'option.persistOff': '关闭 — 会话随面板/宿主结束（默认）',
  'option.persistTmux': 'tmux — 新开的终端/SSH 标签默认持久化',
  'hint.persistence': '开启后所有新标签（本地/SSH 连接簿/SSH 连接对话框）默认由 tmux 托管、可跨宿主重启恢复；需本机/远程安装 tmux；SSH 对话框可对单次连接取消勾选；已有标签不受影响',
  'hint.persistenceWindows': '；Windows 宿主上 tmux 不可用，本地标签会照常打开但不受托管',
  'check.endOnPageClose': '关闭页面后结束持久会话（不保活）',
  'check.statsEnabled': '服务器状态条（CPU / 内存 / 磁盘 / 在线 / TCP / 网速；采不到的项显示「无」）',
  'hint.statsEnabled': '默认关闭：整个页面关闭时持久会话留存（保活期后可再恢复）；开启则页面断开且保活期结束时连 tmux 会话一起结束——注意刷新页面在保活期内不受影响',
  'check.allowProxyCommand': '允许 ProxyCommand（本机执行命令；默认关）',
  'hint.allowProxyCommand': '打开后，连接簿条目里填的代理命令会在这台机器上执行，它的 stdin/stdout 当作到目标的 SSH 传输（等价于 OpenSSH 的 ProxyCommand）。这是本插件唯一「配置里写一行就在本机跑命令」的开关，所以默认关：关着时携带代理命令的连接会明确失败（不会退回直连）。~/.ssh/config 导入永不自动带入代理命令。',
  'field.maxSessions': '并发会话上限（1~16）',
  'hint.maxSessions': '超过上限的新标签会被拒绝；保存即热生效',
  'field.shell': 'Shell 路径（默认 $SHELL）',
  'field.shellWindows': 'Shell 路径（默认 %COMSPEC%）',
  'placeholder.shell': '留空使用 $SHELL',
  'placeholder.shellWindows': '留空使用 %COMSPEC%（也可填 powershell.exe / pwsh.exe 完整路径）',
  'list.noShellCandidate': '没有匹配的候选 — 直接输入任意路径即可',
  'hint.shellCandidatesWindows': 'Windows 宿主：候选来自 %COMSPEC% 与已安装的 PowerShell（Windows PowerShell 5.1 / PowerShell 7），也可直接输入任意路径；cmd / PowerShell 没有 POSIX 的命令边界钩子，所以这两者不支持 shell 集成',
  'hint.shellCandidates': '可下拉选择本机已安装 shell（$SHELL 优先），也可直接输入任意路径；zsh / bash 支持 shell 集成',
  'hint.term': 'TUI 程序依赖此值',
  'field.cwd': '兜底工作目录（客户端当前会话 cwd 优先）',
  'placeholder.cwd': '留空使用宿主进程启动目录',
  'field.grace': '断线保活（秒，0 = 立即结束）',
  'hint.grace': '刷新页面/网络抖动后会话保活等待重连，超时后结束；保存即热生效',
  'section.ssh': 'SSH 连接',
  'btn.probeRowTitle': '试连该条目：TCP → 主机密钥 → 认证逐段诊断',
  'msg.testing': '测试中…',
  'btn.test': '测试',
  'btn.edit': '编辑',
  'btn.delete': '删除',
  'list.emptySshHosts': '暂无条目 — 终端面板「+」→ SSH 连接… 勾选「保存到连接簿」即可添加',
  'btn.importSshConfig': '从 ~/.ssh/config 导入',
  'hint.importSshConfig': '同名跳过；随「保存」写入配置',
  'hint.sshBook': '随「保存」一并写入配置；密码/口令支持 env:VAR 引用，避免明文入库',
  'check.tunnelEnabled': '启用',
  'list.emptyTunnels': '暂无隧道 — 把远程数据库/内部服务映射到本地端口',
  'field.direction': '转发方向',
  'option.localForwardTitle': '本地转发 -L：本机监听，连到 SSH 服务器侧的目标',
  'option.localForward': '本地 -L',
  'option.remoteForwardTitle': '远程转发 -R：SSH 服务器侧监听，拨回本机服务',
  'option.remoteForward': '远程 -R',
  'option.selectBook': '选择连接簿条目',
  'hint.tunnelViaBook': '经 {book} 连接 — 隧道的主机与认证取自该连接簿条目',
  'hint.tunnelBookEmpty': '选择这条隧道要走哪台 SSH 连接（主机与认证取自连接簿）',
  'hint.localListenFixed': '本机监听地址固定 127.0.0.1（不暴露到局域网）',
  'placeholder.localPort': '本机端口',
  'field.localListenPort': '本机监听端口',
  'hint.flowLocalToRemote': '数据流向：本机 → SSH 服务器侧',
  'placeholder.remoteHost': '服务器侧主机',
  'hint.remoteHostTitle': '目标主机名或 IP（由 SSH 服务器侧访问；127.0.0.1 = 服务器自身）',
  'field.remoteHost': '服务器侧目标主机',
  'placeholder.port': '端口',
  'field.remotePort': '服务器侧目标端口',
  'placeholder.remoteListenHost': '服务器侧监听地址',
  'hint.remoteListenHost': '服务器侧监听地址（缺省 127.0.0.1；留空即只让服务器自己访问）',
  'field.remoteListenHost': '服务器侧监听地址',
  'placeholder.listenPort': '监听端口',
  'field.remoteListenPort': '服务器侧监听端口',
  'hint.flowRemoteToLocal': '数据流向：本机 ← SSH 服务器侧',
  'hint.localDialFixed': '本机拨号地址固定 127.0.0.1',
  'placeholder.localTargetPort': '本机服务端口',
  'field.localTargetPort': '本机目标端口',
  'hint.tunnelLocalSummary': '左：本机监听（固定 127.0.0.1）→ 右：由 SSH 服务器侧访问的目标',
  'hint.tunnelRemoteSummary': '左：SSH 服务器侧监听 → 右：本机被访问的服务（固定 127.0.0.1）',
  'btn.addTunnel': '添加隧道',
  'hint.tunnelAdd': '添加后立即生效；断线自动重连；本地端口建议 1024 以上；远程主机由 SSH 服务器侧访问（127.0.0.1 = 服务器自身）',
  'hint.tunnelEditing': '正在编辑「{name}」——改端口/条目会按规则生成新名字；保存后立即生效',
  'panel.hostKeys': 'SSH 主机密钥记录（TOFU）',
  'btn.importKnownHosts': '从 known_hosts 导入',
  'list.emptyHostKeys': '暂无记录 — 首次 SSH 连接成功后自动记录主机指纹',
  'hint.hostKeys': '一机多把钥匙（如 rsa + ed25519）各记一条指纹，任一匹配即放行；指纹变更时连接会被拒绝（防中间人），确认安全后删除对应记录即可重连',
  'msg.saving': '保存中…',
  'btn.save': '保存',
  'list.none': '无',
  'meta.mem': '内存',
  'meta.disk': '磁盘',
  'meta.cores': '核心',
  'meta.uptime': '在线',
  'meta.temp': 'CPU温度',
  'meta.net': '网络',
  'error.tunnelNoBook': '请先在连接簿里添加 SSH 条目',
  'error.tunnelRemotePortRequired': '远程监听端口与本地目标端口必填（1~65535）',
  'error.tunnelLocalRequired': '本地端口、远程主机、远程端口必填',
  'error.tunnelMissing': '隧道「{name}」已不存在（可能被另一个窗口删除）',
  'error.tunnelClash': '已存在同名隧道「{name}」——请先处理那条同名的。',
  'msg.renaming': '重命名 {name}…',
  'msg.deleting': '删除 {name}…',
  'msg.downloading': '下载 {name}…',
  'msg.uploadingName': '上传 {name}',
  'error.invalidTaskState': '服务端返回了非法的任务状态',
  'hint.rememberCredentialApply': '勾选后，点「应用」时把密码写进官方凭据存储，字段里只留 env: 引用（值在 ~/.dsh/.credentials.yaml，不进环境、不回传浏览器；挡不住同用户进程与 agent）。不勾选则按现状明文写进设置文件。能用密钥 / agent 就别存密码。',
  'hint.noCredRefPasswordApply': '还没有别的连接用过凭据引用 — 勾上面的「应用时存入凭据存储」新建一个，或直接在密码框手输 env:NAME',
  'hint.bookNameConflict': '同名冲突会被拒绝',
  'btn.apply': '应用',
}
const I18N_EN = {
  'error.credServiceMissing': 'The host does not provide the credential service (remote.credentials)',
  'error.credServiceIncomplete': 'The credential service is incomplete',
  'error.credStoreUnavailable': 'The host does not provide the credential service (remote.credentials); cannot store',
  'error.credStoreFailed': 'Failed to store the credential: {error}',
  'error.credClearUnavailable': 'The host does not provide the credential service (remote.credentials); cannot clear',
  'error.credClearFailed': 'Failed to clear: {error}',
  'error.credRefNeedsHost': 'Fill in host and username first — the reference name is derived from them',
  'btn.reopen': 'Reopen',
  'btn.reopenTitle': 'Reopen the session with the original connection settings',
  'btn.sftpTitle': 'Open the SFTP file browser for this connection',
  'btn.tunnels': 'Tunnels {count}',
  'btn.tunnelsTitle': 'View the port-forwarding tunnels of this connection',
  'btn.more': 'More',
  'btn.moreTitle': 'More actions (port forwarding…)',
  'btn.reopenSession': 'Reopen session',
  'status.exited': 'Session exited',
  'status.ended': 'Session ended',
  'btn.clickReopen': 'Click to reopen',
  'btn.clickRerun': 'Click to run again',
  'msg.passwordNotStored': 'For security, plaintext passwords/passphrases are not kept in browser storage, so this connection needs them again: re-enter them when reopening the tab, or switch the credential to an env: reference in the settings card (the value lives in the host credential store).',
  'error.terminalNeedsCommand': 'ttyTerminal requires a command',
  'error.terminalCommandSingleLine': 'command must be a single line',
  'error.terminalNeedsHost': 'ttyTerminal.mount requires an HTMLElement as the mount point',
  'error.panelNotReady': 'ttyPanel.mountPane: the terminal panel is not ready',
  'panel.dragHeight': 'Drag to resize height',
  'panel.dragWidth': 'Drag to resize width',
  'btn.closePane': 'Close the side pane',
  'btn.expandPane': 'Expand the side pane',
  'btn.collapsePane': 'Collapse the side pane',
  'panel.tabLabel': 'Terminal {n}',
  'btn.close': 'Close',
  'btn.closeTabAria': 'Close tab: {label}',
  'btn.newTab': 'New (local / SSH)',
  'meta.tunnelRemote': 'remote:{host}:{port} → local:{local}',
  'meta.tunnelLocal': 'local:{local} → {host}:{port}',
  'status.tmuxPersistedTitle': 'Hosted by tmux — the session is reattached by name after a disconnect or host restart',
  'status.notPersisted': 'Not persisted',
  'status.tmuxUnavailableTitle': 'A persistent session was requested but tmux is unavailable — this is a plain session',
  'status.connected': 'Connected',
  'status.connecting': 'Connecting',
  'status.errored': 'Connection error',
  'panel.tunnels': 'Port forwarding',
  'hint.tunnelsSettings': 'Configure in Settings → Plugins → Terminal panel',
  'panel.tunnelsFor': 'Port forwarding — {name}',
  'list.loading': 'Loading…',
  'hint.tunnelsCard': 'Add, remove, enable, or disable tunnels in the port-forwarding section of Settings → Plugins → Terminal panel',
  'list.noActiveTunnels': 'No enabled tunnels for this connection',
  'status.fatalSuffix': ' (no retry; fix the config)',
  'msg.maxSessions': 'Session limit reached ({live} total / max {max}: {own} in this window{others}) — close unused windows or tabs, or raise “Concurrent session limit” in the settings card',
  'msg.maxSessionsOthers': ' + {count} in other windows',
  'error.probeHttp': 'Connection test failed (HTTP {status})',
  'msg.probing': 'Testing the connection…',
  'meta.reachable': 'reachable',
  'meta.unreachable': 'unreachable',
  'meta.probeBanner': 'banner ok',
  'meta.hostKeyMatched': 'Host key matched',
  'meta.hostKeyRecorded': 'Host key recorded (TOFU)',
  'meta.hostKeyMismatch': 'Host key mismatch!',
  'meta.authOkMs': 'Authenticated ({ms}ms)',
  'meta.authOk': 'Authenticated',
  'meta.probeOk': '✅ Connected: {detail}',
  'error.unknown': 'Unknown error',
  'btn.maxSessionsTitle': 'Session limit reached — click to see what to do',
  'option.localTerminal': 'Local terminal',
  'hint.tmuxHosted': 'Hosted by tmux · recoverable after a host restart',
  'hint.openInSessionCwd': 'Open in the current session working directory',
  'panel.sshBook': 'SSH host book',
  'btn.sftpFileBrowse': 'SFTP file browser',
  'btn.editConnection': 'Edit connection',
  'list.emptySshBook': '(empty — save one in the settings card or via “SSH connection…”)',
  'option.sshConnect': 'SSH connection…',
  'hint.sshConnect': 'Fill in host, user, and authentication manually',
  'panel.editConnection': 'Edit connection · {name}',
  'panel.sshConnect': 'SSH connection',
  'section.jump': 'Jump host',
  'field.jumpHost': 'Jump host ([user@]host[:port]; empty = direct)',
  'placeholder.jumpHost': 'e.g. bastion.corp:2222',
  'check.jumpOwnCred': 'Use separate credentials for the jump host',
  'field.jumpUsername': 'Jump host user (empty = same as the target)',
  'field.jumpAuth': 'Jump host auth (empty = same as the target)',
  'hint.jumpInherit': 'Empty credentials reuse the target host’s auth method and keys. When the jump host itself is unreachable the error names it (it will not masquerade as a target timeout).',
  'meta.jumpStage': 'Jump host {label}',
  'meta.viaJump': '⇢ via {label}',
  'meta.viaProxy': '⇢ via proxy command',
  'section.proxyCommand': 'Proxy command',
  'field.proxyCommand': 'Proxy command (ProxyCommand; empty = unused)',
  'placeholder.proxyCommand': 'e.g. ssh -W %h:%p bastion',
  'hint.proxyCommand': 'A command run on this machine whose stdin/stdout become the SSH transport to the target (the same idea as OpenSSH’s ProxyCommand). Supports %h host, %p port, %r user, %n host and %% for a literal %; anything else is left as written. If a jump host is set too, the jump host wins (OpenSSH semantics). It needs the switch below, and importing ~/.ssh/config never fills it in.',
  'hint.proxyCommandDisabled': '⚠ “Allow ProxyCommand” is off right now: this command will not run and the connection fails explicitly (it does not fall back to a direct connection). Turn it on in Plugin settings → Terminal panel.',
  'meta.probeProxy': 'Proxy command',
  'meta.probeProxyOff': 'Proxy command (disabled)',
  'meta.probeTcpSkipped': 'Direct TCP check skipped (using the proxy command)',
  'section.connection': 'Connection',
  'field.host': 'Host',
  'placeholder.host': 'example.com or IP',
  'field.port': 'Port',
  'field.username': 'Username',
  'section.auth': 'Authentication',
  'field.authMethod': 'Auth method',
  'option.authInherit': '(same as the target)',
  'option.authAgent': 'agent — use the local ssh-agent',
  'option.authKey': 'key — private key file',
  'option.authPassword': 'password — password',
  'field.keyPath': 'Private key path',
  'field.passphrase': 'Key passphrase (optional)',
  'field.password': 'Password',
  'placeholder.credRef': 'Or: pick a reference name from the credential store',
  'hint.credRefCandidates': 'Candidates = reference names already in the credential store + those in use by the local host book',
  'list.credOverwrite': '{name} (click again to overwrite)',
  'list.moreMatches': '{count} more — keep typing to filter',
  'list.noCredRef': 'No matching reference',
  'check.rememberCredential': 'Store in the credential store on save',
  'hint.rememberCredential': 'When checked, “Save changes” or “Connect (and save)” writes the password into the official credential store and leaves only an env: reference in the field (the value lives in ~/.dsh/.credentials.yaml; it is not put into the environment and is not sent back to the browser; it does not protect against same-user processes or the agent). Unchecked keeps today\'s plaintext write into the settings file. If a key or the agent works, do not store a password.',
  'btn.clearCredential': 'Clear stored credential',
  'error.credPlainUnavailable': 'The host does not provide the credential service (remote.credentials); plaintext save only',
  'error.credPlainIncomplete': 'The credential service is incomplete; plaintext save only',
  'status.credUnreported': 'Reference {ref}: the host reported no status',
  'error.credStatusFailed': 'Failed to read the credential status: {error}',
  'status.credStored': 'Stored{source} · {ref}',
  'meta.credSource': ' (source: {source})',
  'status.credUnknown': 'Reference {ref}: the store does not have this value yet',
  'hint.noCredRefPassphrase': 'No other connection uses a credential reference yet — you can type env:NAME straight into the passphrase box',
  'hint.noCredRefPassword': 'No other connection uses a credential reference yet — check “Store in the credential store on save” above to create one, or type env:NAME straight into the password box',
  'section.options': 'Options',
  'check.agentForward': 'agent forwarding (the remote side can use local ssh-agent keys, e.g. remote git clone)',
  'check.persist': 'Persistent session (hosted by tmux, survives a disconnect/restart; tmux must be installed on the remote)',
  'check.saveToBook': 'Save to the host book (overwrite the same name)',
  'field.bookName': 'Host book name',
  'placeholder.bookName': 'Leave empty to use the host name',
  'error.hostUserRequired': 'Host and username are required',
  'error.keyPathRequired': 'auth=key requires a private key path',
  'error.passwordRequired': 'auth=password requires a password',
  'btn.cancel': 'Cancel',
  'btn.connect': 'Connect',
  'btn.fileBrowse': 'File browser',
  'btn.browseTitle': 'Open the SFTP file browser with the values currently filled in, without touching a terminal',
  'btn.probe': 'Test',
  'btn.probeTitle': 'Diagnose the connection with the values currently filled in (TCP → host key → authentication); no session is created and no host fingerprint is recorded',
  'error.saveCredFailed': 'Save failed: {error}',
  'btn.saveEdit': 'Save changes',
  'error.saveBookFailed': 'Failed to save the host book: {error}',
  'error.bookNameTaken': 'The host book already has an entry named: {name}',
  'panel.sftpDual': 'SFTP dual pane · {label}',
  'status.failed': 'Failed',
  'status.done': 'Done',
  'placeholder.localPath': 'Local path (Enter to go)',
  'placeholder.remotePath': 'Remote path (Enter to go)',
  'btn.refresh': 'Refresh',
  'btn.mkdir': 'New folder',
  'error.dirNotReady': 'The directory is not resolved yet',
  'meta.dir': 'folder',
  'btn.transferTo': 'Transfer to {target}: {path}',
  'meta.local': 'local',
  'meta.remote': 'remote',
  'error.transferDirsNotReady': 'Both directories are not resolved yet; wait for the lists to load before transferring',
  'msg.transferring': 'Transferring {name}…',
  'error.transferFailed': 'Transfer failed',
  'error.noTaskId': 'The server returned no task id',
  'msg.transferCanceled': 'Transfer canceled: {name}',
  'msg.transferred': 'Transferred {name}',
  'btn.download': 'Download {name}',
  'btn.rename': 'Rename {name}',
  'placeholder.newName': 'New name',
  'btn.deleteEntry': 'Delete {name}',
  'btn.deleteEntryDir': 'Delete {name} (with contents)',
  'msg.deleted': 'Deleted {name}',
  'list.parentDir': '.. (parent folder)',
  'list.emptyDir': '(empty folder)',
  'list.truncated': '…{rest} more not rendered ({total} total) — use the path box above to jump to a subfolder',
  'list.itemCount': '{count} items',
  'placeholder.newDirName': 'New folder name (relative to the current folder)',
  'msg.creatingDir': 'Creating folder {name}…',
  'btn.ok': 'OK',
  'btn.confirm': 'Confirm?',
  'btn.cancelTransfer': 'Cancel transfer',
  'msg.downloadCanceled': 'Download canceled: {name}',
  'error.downloadFailed': 'Download failed',
  'msg.downloaded': 'Downloaded {name} ({size})',
  'error.downloadTooBig': 'The file exceeds the download limit ({size}); use dual-pane ⇦ direct transfer or scp/rsync in the terminal',
  'msg.canceled': 'Canceled',
  'btn.upload': 'Upload',
  'btn.uploadTitle': 'Pick files to upload, or drag files/folders straight into the list',
  'msg.uploading': 'Uploading…',
  'msg.uploadDone': 'Upload finished',
  'error.uploadFailed': 'Upload failed',
  'error.networkError': 'Network error',
  'error.uploadCountExceeded': 'Too many files (limit {max}): {count} this time — upload in batches',
  'status.overLimit': 'Over the limit',
  'error.uploadTooBig': 'The file exceeds the upload limit ({size}): {name} — use dual-pane ⇨ direct transfer or scp/rsync in the terminal',
  'error.uploadTotalTooBig': 'The total size exceeds the upload limit: upload in batches (or use dual-pane ⇨ direct transfer)',
  'msg.uploadCanceled': 'Upload canceled ({done}/{total} done)',
  'status.allDone': 'All done',
  'msg.uploadDoneCount': 'Uploaded {count} files',
  'error.connectFailed': 'Connection failed: {error}',
  'status.connectingEllipsis': 'Connecting…',
  'status.connectedPid': 'Connected pid={pid}',
  'status.connectedSsh': 'SSH {target}connected',
  'status.exitedWith': 'Exited {detail}',
  'status.error': 'Error: {message}',
  'status.retryHint': '{message} · click to retry',
  'btn.clickRetry': 'Click to retry',
  'status.disconnectedReconnecting': 'Disconnected — reconnecting',
  'status.disconnected': 'Disconnected',
  'status.reconnecting': 'Reconnecting…',
  'error.copyFailed': 'Copy failed: this environment does not allow clipboard access (over http, use localhost or the terminal\'s own shortcuts)',
  'error.pasteFailed': 'The browser does not allow pages to read the clipboard (common over http): paste with Ctrl+V / Cmd+V inside the terminal',
  'status.initializing': 'Initializing…',
  'placeholder.search': 'Search (Enter next, Shift+Enter previous)',
  'btn.searchTitle': 'Search (Ctrl+F)',
  'btn.clearTitle': 'Clear',
  'btn.copyTitle': 'Copy selection',
  'btn.pasteTitle': 'Paste',
  'btn.minimizeTitle': 'Minimize (sessions keep running; the status moves into the sidebar entry)',
  'btn.closePanelTitle': 'Close the panel (ends sessions; tabs are kept and the list comes back on reopen)',
  'btn.restoreDock': 'Click to restore the terminal window',
  'panel.title': 'Terminal',
  'status.minimized': 'Terminal minimized — click to restore',
  'error.configLoadFailed': 'Failed to load the config',
  'error.saveTunnelFailed': 'Failed to save the tunnel',
  'error.tunnelNameTaken': 'A tunnel named “{name}” already exists — each “host book entry + direction + port” combination can appear once. Change the port to get a new name, or delete the old one first.',
  'msg.tunnelApplied': 'Tunnel “{name}” is active',
  'msg.tunnelUpdated': 'Tunnel “{name}” updated',
  'error.nameHostUserRequired': 'Name, host, and username are required',
  'msg.hostEdited': 'Entry “{name}” updated — written to the config on “Save”',
  'error.probeFailed': '❌ Connection failed: {error}',
  'error.hostKeyDeleteFailed': 'Failed to delete the host key record',
  'msg.hostKeyDeleted': 'Host key record deleted (the fingerprint is recorded again on the next connection)',
  'error.sshConfigReadFailed': 'Failed to read ~/.ssh/config',
  'msg.proxySkipped': '{count} entries use a jump host that could not be resolved (missing alias, or the alias itself needs a jump host) and were not imported: {names}',
  'msg.proxyCommandSkipped': '{count} entries only set a proxy command (ProxyCommand) and were not imported: {names} — a proxy command is local command execution, so importing never fills it in; add it by hand on the connection-book entry and turn on “Allow ProxyCommand”',
  'msg.skippedNotConcrete': '{count} entries are not a concrete host (wildcard / no User)',
  'list.separator': ', ',
  'meta.etc': ' etc.',
  'msg.importOverflow': '{count} entries beyond the import limit were not imported',
  'list.separatorFull': '; ',
  'msg.noNewEntries': 'No new entries ({count} skipped as duplicates)',
  'msg.noImportableHosts': '~/.ssh/config has no concrete hosts to import',
  'msg.importedHosts': 'Imported {added} (skipped {skipped} duplicates); written to the config on “Save”',
  'error.knownHostsReadFailed': 'Failed to read ~/.ssh/known_hosts',
  'msg.noNewFingerprints': 'No new fingerprints ({count} already exist)',
  'msg.noImportableKnownHosts': 'known_hosts has no concrete hosts to import',
  'error.saveHostKeysFailed': 'Failed to save hostKeys',
  'msg.importedFingerprints': 'Imported fingerprints for {added} hosts (skipped {skipped} that already existed)',
  'hint.knownHostsTruncated': '; note: known_hosts has more than 500 hosts — only the first 500 were imported',
  'error.saveFailed': 'Save failed',
  'msg.saved': 'Saved and applied live',
  'check.rememberCredentialApply': 'Store in the credential store on apply',
  'hint.appliedOnSave': 'Written to the config with the card\'s “Save”',
  'card.name': 'Terminal panel',
  'card.desc': 'xterm terminal panel: multiple tabs, automatic reconnect after a drop, cwd follows the session, SSH host book with host-key pinning, tmux session persistence.',
  'card.descFull': 'xterm terminal panel: multiple tabs, automatic reconnect after a drop, cwd follows the session, SSH host book with host-key pinning, tmux session persistence; shell / TERM / concurrency limits apply live on save.',
  'list.loadingConfig': 'Loading the config…',
  'section.basic': 'Basics',
  'check.enabled': 'Enable the plugin (applies live on save: tools and the panel entry are withdrawn immediately, sessions move to keepalive)',
  'check.announce': 'Announce the terminal panel capabilities to the agent',
  'check.shellIntegration': 'Shell integration (OSC 133/7 injection)',
  'check.shellIntegrationWindows': 'Shell integration (OSC 133/7 injection; tty_capture{last} and cwd following depend on it)',
  'hint.shellIntegrationWindows': 'Not applicable on Windows hosts: injection relies on the POSIX `-c` wrapper and rc stubs, which do not hold for cmd / PowerShell (cmd ignores `-c` and exits, PowerShell reports that export does not exist). So cwd following and tty_capture{last} are unavailable for **local** tabs; remote Linux / macOS hosts are unaffected.',
  'section.sftp': 'SFTP file transfer',
  'field.sftpStyle': 'SFTP file browser style',
  'option.sftpDialog': 'Single pane — remote directory + upload/download/drag',
  'option.sftpDual': 'Dual pane — local on the left, remote on the right, direct transfer on selection',
  'hint.sftpDual': 'Dual pane copies files between local and remote (recursive, overwriting same names); takes effect after reopening SFTP',
  'field.sftpLimits': 'SFTP transfer limits (0 = unlimited)',
  'field.downloadLimit': 'Download limit (MB)',
  'field.uploadLimit': 'Upload limit (MB)',
  'field.uploadCountLimit': 'Batch file count limit',
  'hint.sftpLimits': 'Browser-side guard: a single file over the limit aborts the download/upload (for large files use dual-pane ⇨/⇦ direct transfer or scp/rsync in the terminal; they do not consume browser memory); the file count limit applies to one batch/drag upload; applies live on save',
  'section.session': 'Sessions',
  'field.persistence': 'Session persistence (tmux)',
  'option.persistOff': 'Off — sessions end with the panel/host (default)',
  'option.persistTmux': 'tmux — new terminal/SSH tabs are persistent by default',
  'hint.persistence': 'When on, all new tabs (local / SSH host book / SSH connection dialog) are hosted by tmux by default and survive a host restart; tmux must be installed locally/remotely; the SSH dialog can opt out per connection; existing tabs are unaffected',
  'hint.persistenceWindows': '; tmux is unavailable on Windows hosts, so local tabs still open but are not hosted',
  'check.endOnPageClose': 'End persistent sessions when the page closes (no keepalive)',
  'check.statsEnabled': 'Server stats bar (CPU / memory / disk / uptime / TCP / network; items that cannot be sampled show “N/A”)',
  'hint.statsEnabled': 'Off by default: persistent sessions survive closing the whole page (recoverable after the keepalive window); when on, they end together with the tmux session once the page disconnects and the keepalive window expires — note that refreshing the page within the keepalive window is unaffected',
  'check.allowProxyCommand': 'Allow ProxyCommand (runs a command on this machine; off by default)',
  'hint.allowProxyCommand': 'When on, a proxy command set on a connection-book entry runs on this machine, and its stdin/stdout become the SSH transport to the target (the same idea as OpenSSH’s ProxyCommand). This is the only switch in this plugin that turns a settings field into local command execution, so it is off by default: while off, a connection carrying a proxy command fails explicitly (it does not fall back to a direct connection). Importing ~/.ssh/config never fills one in.',
  'field.maxSessions': 'Concurrent session limit (1–16)',
  'hint.maxSessions': 'New tabs beyond the limit are rejected; applies live on save',
  'field.shell': 'Shell path (defaults to $SHELL)',
  'field.shellWindows': 'Shell path (defaults to %COMSPEC%)',
  'placeholder.shell': 'Leave empty to use $SHELL',
  'placeholder.shellWindows': 'Leave empty to use %COMSPEC% (or enter the full path to powershell.exe / pwsh.exe)',
  'list.noShellCandidate': 'No matching candidate — just type any path',
  'hint.shellCandidatesWindows': 'Windows host: candidates come from %COMSPEC% and the installed PowerShell (Windows PowerShell 5.1 / PowerShell 7), and you can type any path; cmd / PowerShell have no POSIX command-boundary hooks, so shell integration is unsupported for them',
  'hint.shellCandidates': 'Pick an installed shell from the list ($SHELL first) or type any path; zsh / bash support shell integration',
  'hint.term': 'TUI programs depend on this value',
  'field.cwd': 'Fallback working directory (the client\'s current session cwd wins)',
  'placeholder.cwd': 'Leave empty to use the host process start directory',
  'field.grace': 'Disconnect keepalive (seconds, 0 = end immediately)',
  'hint.grace': 'Sessions are kept alive for reconnect after a page refresh or network hiccup and end on timeout; applies live on save',
  'section.ssh': 'SSH connections',
  'btn.probeRowTitle': 'Test this entry: per-stage diagnosis of TCP → host key → authentication',
  'msg.testing': 'Testing…',
  'btn.test': 'Test',
  'btn.edit': 'Edit',
  'btn.delete': 'Delete',
  'list.emptySshHosts': 'No entries — add one via the terminal panel\'s “+” → SSH connection… and check “Save to the host book”',
  'btn.importSshConfig': 'Import from ~/.ssh/config',
  'hint.importSshConfig': 'Same names are skipped; written to the config on “Save”',
  'hint.sshBook': 'Written to the config together with “Save”; passwords/passphrases support env:VAR references to avoid plaintext storage',
  'check.tunnelEnabled': 'Enable',
  'list.emptyTunnels': 'No tunnels — map a remote database or internal service to a local port',
  'field.direction': 'Forwarding direction',
  'option.localForwardTitle': 'Local forward -L: listen locally and connect to a target on the SSH server side',
  'option.localForward': 'Local -L',
  'option.remoteForwardTitle': 'Remote forward -R: listen on the SSH server side and dial back to a local service',
  'option.remoteForward': 'Remote -R',
  'option.selectBook': 'Pick a host book entry',
  'hint.tunnelViaBook': 'Connects via {book} — the tunnel\'s host and credentials come from that host book entry',
  'hint.tunnelBookEmpty': 'Pick which SSH connection this tunnel uses (host and credentials come from the host book)',
  'hint.localListenFixed': 'The local listen address is fixed to 127.0.0.1 (not exposed to the LAN)',
  'placeholder.localPort': 'Local port',
  'field.localListenPort': 'Local listen port',
  'hint.flowLocalToRemote': 'Traffic flow: local → SSH server side',
  'placeholder.remoteHost': 'Server-side host',
  'hint.remoteHostTitle': 'Target host name or IP (reached from the SSH server side; 127.0.0.1 = the server itself)',
  'field.remoteHost': 'Server-side target host',
  'placeholder.port': 'Port',
  'field.remotePort': 'Server-side target port',
  'placeholder.remoteListenHost': 'Server-side listen address',
  'hint.remoteListenHost': 'Server-side listen address (defaults to 127.0.0.1; leave empty to allow only the server itself)',
  'field.remoteListenHost': 'Server-side listen address',
  'placeholder.listenPort': 'Listen port',
  'field.remoteListenPort': 'Server-side listen port',
  'hint.flowRemoteToLocal': 'Traffic flow: local ← SSH server side',
  'hint.localDialFixed': 'The local dial address is fixed to 127.0.0.1',
  'placeholder.localTargetPort': 'Local service port',
  'field.localTargetPort': 'Local target port',
  'hint.tunnelLocalSummary': 'Left: local listener (fixed 127.0.0.1) → Right: target reached from the SSH server side',
  'hint.tunnelRemoteSummary': 'Left: SSH server-side listener → Right: local service being reached (fixed 127.0.0.1)',
  'btn.addTunnel': 'Add tunnel',
  'hint.tunnelAdd': 'Takes effect immediately; reconnects automatically after a drop; prefer local ports above 1024; remote hosts are reached from the SSH server side (127.0.0.1 = the server itself)',
  'hint.tunnelEditing': 'Editing “{name}” — changing the port/entry derives a new name by rule; takes effect immediately on save',
  'panel.hostKeys': 'SSH host key records (TOFU)',
  'btn.importKnownHosts': 'Import from known_hosts',
  'list.emptyHostKeys': 'No records — the host fingerprint is recorded automatically after the first successful SSH connection',
  'hint.hostKeys': 'A host with several keys (e.g. rsa + ed25519) gets one fingerprint each and any match is accepted; a changed fingerprint rejects the connection (MITM protection) — delete that record once you are sure it is safe, then reconnect',
  'msg.saving': 'Saving…',
  'btn.save': 'Save',
  'list.none': 'N/A',
  'meta.mem': 'Memory',
  'meta.disk': 'Disk',
  'meta.cores': 'Cores',
  'meta.uptime': 'Uptime',
  'meta.temp': 'CPU temp',
  'meta.net': 'Network',
  'error.tunnelNoBook': 'Add an SSH entry to the host book first',
  'error.tunnelRemotePortRequired': 'A remote listen port and a local target port are required (1–65535)',
  'error.tunnelLocalRequired': 'Local port, remote host, and remote port are required',
  'error.tunnelMissing': 'Tunnel “{name}” no longer exists (it may have been deleted by another window)',
  'error.tunnelClash': 'A tunnel named “{name}” already exists — handle that one first.',
  'msg.renaming': 'Renaming {name}…',
  'msg.deleting': 'Deleting {name}…',
  'msg.downloading': 'Downloading {name}…',
  'msg.uploadingName': 'Uploading {name}',
  'error.invalidTaskState': 'The server returned an invalid task state',
  'hint.rememberCredentialApply': 'When checked, “Apply” writes the password into the official credential store and leaves only an env: reference in the field (the value lives in ~/.dsh/.credentials.yaml; it is not put into the environment and is not sent back to the browser; it does not protect against same-user processes or the agent). Unchecked keeps today\'s plaintext write into the settings file. If a key or the agent works, do not store a password.',
  'hint.noCredRefPasswordApply': 'No other connection uses a credential reference yet — check “Store in the credential store on apply” above to create one, or type env:NAME straight into the password box',
  'hint.bookNameConflict': 'A same-name conflict is rejected',
  'btn.apply': 'Apply',
}
/* ==== dsh-i18n:end ==== */

/** 占位符替换：`{name}` → params.name（缺参留空，不抛错——文案不该打死界面）。 */
function i18nFormat(text, params) {
  if (params === undefined) return text
  return String(text).replace(/\{(\w+)\}/g, (_match, name) => (params[name] === undefined ? '' : String(params[name])))
}

/** 中文兜底：老宿主（DSH ≤0.1.5）没有 locale 服务时，界面不能变成一串键名。 */
function i18nFallback(key, params) {
  return i18nFormat(I18N_ZH[key] !== undefined ? I18N_ZH[key] : key, params)
}

let t = i18nFallback

/**
 * 注册目录并绑定翻译函数。**动态 inject**：老宿主上回调永不触发、`t` 保持中文兜底；
 * 写成静态 `inject: ['locale']` 会让整张卡片在老宿主上根本不挂。
 *
 * 语言切换不用自己订阅：插槽 outlet 随 locale revision 重渲染（renderer 的
 * `useLocaleRevision`），而 `bind()` 返回的翻译函数在**调用时**读当前语言。
 */
function installI18n(ctx) {
  ctx.inject(['locale'], (i18nCtx) => {
    const disposeZh = i18nCtx.locale.register(I18N_NS, 'zh', I18N_ZH)
    const disposeEn = i18nCtx.locale.register(I18N_NS, 'en', I18N_EN)
    t = i18nCtx.locale.bind(I18N_NS)
    return () => {
      disposeEn()
      disposeZh()
      t = i18nFallback
    }
  })
}

/* ================================ 基础工具 ================================ */

/* WS 地址的推导规则已抽到 client-src/ws-url.js —— 那里是纯逻辑、带单测
 * （test/ws-url.test.ts）。原先这里只用 location 拼，桌面版（origin 是
 * dsh-app://app）会拼出连不上的 ws://app/...；推导与成因见那个文件。 */
function wsUrl() {
  return deriveWsUrl(document.baseURI, globalThis.__DSH_TRANSPORT__?.streamBaseUrl)
}

/* 凭据引用名的派生规则（asciiRefToken / derivedCredentialRef）已抽到
 * client-src/credential-ref.js —— 那里是纯逻辑、带单测（test/credential-ref.test.ts），
 * 也是文档示例的"事实来源"。此前规则只活在注释里，示例漂了两次都没人发现。 */

/* ==================== 凭据引用（连接对话框与设置卡片共用） ==================== */

/**
 * 浏览器侧凭据服务（`ctx.remote.credentials`）。宿主没装 / 没提供时返回 null，
 * 调用方据此降级成「只能明文保存」并说明原因，而不是抛错。
 */
function credentialStore() {
  return credentialsRemote !== null && typeof credentialsRemote.describe === 'function' ? credentialsRemote : null
}

/** 字段值是不是 `env:` 引用；是则返回引用名（去掉 `env:` 前缀），否则空串。 */
function credentialRefOfValue(value) {
  const text = String(value ?? '').trim()
  return text.startsWith('env:') ? text.slice(4).trim() : ''
}

/**
 * 候选引用名的来源一：本机连接簿里**已经在用**的 `env:` 引用。
 * 官方口径：配置界面从自己的 settings schema 得知有哪些引用。
 */
function bookCredentialRefNames() {
  const seen = new Set()
  for (const entry of sshHostsCache) {
    for (const value of [entry?.password, entry?.passphrase]) {
      const name = credentialRefOfValue(value)
      if (name !== '') seen.add(name)
    }
  }
  return [...seen]
}

/**
 * 候选引用名的来源二：凭据存储里**已知的**名字（宿主 `/api/dsh-tty/credential-refs`，只要名字）。
 * 路由不可用（旧宿主）/ 网络失败 → 空数组：候选退回连接簿里的那些，不报错。
 */
async function fetchCredentialStoreNames() {
  try {
    const res = await fetch('/api/dsh-tty/credential-refs', { cache: 'no-store' })
    const data = await res.json()
    if (data.ok && Array.isArray(data.names)) {
      return data.names.filter((name) => typeof name === 'string' && name !== '')
    }
  } catch {
    /* 见上：静默降级 */
  }
  return []
}

/** 两个来源合并去重、排序——对话框与设置卡片的引用选择器列的是同一份候选。 */
async function credentialRefCandidates() {
  const names = [...new Set([...bookCredentialRefNames(), ...(await fetchCredentialStoreNames())])]
  return names.sort()
}

/**
 * 问一条引用的状态。`describe` 只回 configured / writable / source，**永不回值**。
 * @returns `{ view: { configured, writable, source } }`（宿主报告了状态）
 *        | `{ unreported: true }`（宿主没报告这条引用）
 *        | `{ error }`（服务缺位 / describe 抛错）
 */
async function describeCredentialRef(ref) {
  const remote = credentialStore()
  if (remote === null) {
    return {
      error: credentialsRemote === null
        ? t('error.credServiceMissing')
        : t('error.credServiceIncomplete'),
    }
  }
  try {
    const response = await remote.describe([ref])
    const view = response?.ok === true ? response.value?.[ref] : undefined
    if (view === undefined) return { unreported: true }
    return {
      view: {
        configured: view.configured === true,
        writable: view.writable === true,
        source: typeof view.source === 'string' ? view.source : '',
      },
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
}

/** 把一条明文写进凭据存储。@returns `{ value }`（要写进配置的 `env:NAME`）或 `{ error }` */
async function storeCredentialRef(ref, value) {
  const remote = credentialStore()
  if (remote === null || typeof remote.set !== 'function') {
    return { error: t('error.credStoreUnavailable') }
  }
  try {
    await remote.set(ref, value)
    return { value: 'env:' + ref }
  } catch (error) {
    // 官方要求：拒绝要**原文**给用户看（典型是只读源遮蔽了这个引用）
    return { error: t('error.credStoreFailed', { error: error instanceof Error ? error.message : String(error) }) }
  }
}

/** 清掉一条已存凭据（`unset`）。@returns `{}` 或 `{ error }` */
async function clearCredentialRef(ref) {
  const remote = credentialStore()
  if (remote === null || typeof remote.unset !== 'function') {
    return { error: t('error.credClearUnavailable') }
  }
  try {
    await remote.unset(ref)
    return {}
  } catch (error) {
    return { error: t('error.credClearFailed', { error: error instanceof Error ? error.message : String(error) }) }
  }
}

/**
 * 「保存时存入凭据存储」的共用保存路径：勾了、且字段还是明文时写进存储，返回引用。
 *
 * 引用名由**资源身份**派生（derivedCredentialRef），与连接名无关——所以改连接名不会换键、
 * 也不会留孤儿。两个界面（连接对话框的「保存修改 / 连接（并保存）」、设置卡片的「应用」）
 * 走的是同一条路径，语义不会漂移。
 *
 * @returns `{ value }`（要写进配置的密码值，缺省 = 保持原样）或 `{ error }`（显示并中止保存）
 */
async function storeCredentialIfRequested(remember, inputValue, host, port, username, suffix) {
  if (remember !== true) return {}
  const value = String(inputValue ?? '').trim()
  if (value === '' || value.startsWith('env:')) return {}
  const ref = derivedCredentialRef(host, port, username, suffix)
  if (ref === '') return { error: t('error.credRefNeedsHost') }
  return storeCredentialRef(ref, value)
}

function newSid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
}

let styleEl
function ensureStyle() {
  if (document.getElementById('dsh-tty-style')) return
  styleEl = document.createElement('style')
  styleEl.id = 'dsh-tty-style'
  styleEl.textContent = ttyCss + '\n' + xtermCss
  document.head.appendChild(styleEl)
}

/* ================================ 终端面板 ================================ */

const TERMINAL_ICON =
  '<svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 5l3.5 3L3 11"/><path d="M8.5 11H13"/></svg>'

// 头部工具按钮图标（14px 线性风格，与 TERMINAL_ICON 同族）：搜索 / 清屏 / 复制 / 粘贴
const ICON_SEARCH =
  '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="7" cy="7" r="4.4"/><path d="M10.4 10.4L14 14"/></svg>'
const ICON_CLEAR =
  '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 4.5h11"/><path d="M6 4.5V3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5"/><path d="M4.5 4.5l.7 8.1a1 1 0 0 0 1 .9h3.6a1 1 0 0 0 1-.9l.7-8.1"/></svg>'
const ICON_COPY =
  '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5.5" y="5.5" width="8" height="8" rx="1.4"/><path d="M3.5 10.5h-1v-8h8v1"/></svg>'
const ICON_PASTE =
  '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="3" width="9" height="11" rx="1.4"/><rect x="5.5" y="1.5" width="5" height="3" rx="1" fill="var(--dsw-alias-bg-base,#fff)"/></svg>'
// 连接栏扩展按钮图标（14px）：重新连接 / SFTP / 端口转发隧道
const ICON_RECONNECT =
  '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9"/><path d="M13.7 1.8v2.7H11"/></svg>'
const ICON_SFTP =
  '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1.8 12.8V4.2a1 1 0 0 1 1-1h3l1.4 1.6h6a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H2.8a1 1 0 0 1-1-1z"/></svg>'
const ICON_TUNNEL =
  '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 5.5L2 8l2.5 2.5"/><path d="M11.5 5.5L14 8l-2.5 2.5"/><path d="M2.8 8h10.4"/></svg>'
/** 连接栏「⋯」更多：低频入口（当前用于「没配隧道时」仍能找到端口转发）。 */
const ICON_MORE =
  '<svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor" stroke="none" aria-hidden="true"><circle cx="3.4" cy="8" r="1.35"/><circle cx="8" cy="8" r="1.35"/><circle cx="12.6" cy="8" r="1.35"/></svg>'
// 窗口按钮 / 通用（16 网格，线宽 1.6，统一视觉重量）
const ICON_MIN =
  '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M4 8h8"/></svg>'
const ICON_CLOSE =
  '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M4.5 4.5l7 7"/><path d="M11.5 4.5l-7 7"/></svg>'
const ICON_PLUS =
  '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M8 3.6v8.8"/><path d="M3.6 8h8.8"/></svg>'
// 文件系统（SFTP 列表 / 菜单）
const ICON_FOLDER =
  '<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12.4V3.9a.9.9 0 0 1 .9-.9h2.9l1.4 1.6h5.9a.9.9 0 0 1 .9.9v6.9a.9.9 0 0 1-.9.9H2.9a.9.9 0 0 1-.9-.9z"/></svg>'
const ICON_FILE =
  '<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 2.6h4.4l3.6 3.6v7.2a.9.9 0 0 1-.9.9H4.9a.9.9 0 0 1-.9-.9V3.5a.9.9 0 0 1 .9-.9z"/><path d="M8.2 2.7v3.4h3.4"/></svg>'
const ICON_LINK =
  '<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6.4 9.6l3.2-3.2"/><path d="M9.2 4.6l1-1a2.5 2.5 0 0 1 3.5 3.5l-1 1"/><path d="M6.8 11.4l-1 1a2.5 2.5 0 0 1-3.5-3.5l1-1"/></svg>'
const ICON_UP =
  '<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 12.6V4.2"/><path d="M4.4 7.8L8 4.2l3.6 3.6"/></svg>'
const ICON_DOWNLOAD =
  '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3v7.2"/><path d="M5 7.4L8 10.4l3-3"/><path d="M3.4 12.8h9.2"/></svg>'
const ICON_UPLOAD =
  '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 10.4V3.2"/><path d="M5 6.2L8 3.2l3 3"/><path d="M3.4 12.8h9.2"/></svg>'
const ICON_EDIT =
  '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11.2 2.9l1.9 1.9-7.3 7.3-2.4.5.5-2.4z"/></svg>'
const ICON_TRASH =
  '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 4.6h10"/><path d="M6.2 4.6V3.4a.8.8 0 0 1 .8-.8h2a.8.8 0 0 1 .8.8v1.2"/><path d="M4.6 4.6l.6 8a.9.9 0 0 0 .9.8h3.8a.9.9 0 0 0 .9-.8l.6-8"/></svg>'
const ICON_REFRESH =
  '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13.2 8a5.2 5.2 0 1 1-1.5-3.7"/><path d="M13.4 2.2v2.6h-2.6"/></svg>'
const ICON_MKDIR =
  '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12.4V3.9a.9.9 0 0 1 .9-.9h2.9l1.4 1.6h5.9a.9.9 0 0 1 .9.9v6.9a.9.9 0 0 1-.9.9H2.9a.9.9 0 0 1-.9-.9z"/><path d="M8 6.6v3.6"/><path d="M6.2 8.4h3.6"/></svg>'
const ICON_ARROW_RIGHT =
  '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.4 8h9"/><path d="M9.2 4.8L12.4 8l-3.2 3.2"/></svg>'
const ICON_ARROW_LEFT =
  '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12.6 8h-9"/><path d="M6.8 4.8L3.6 8l3.2 3.2"/></svg>'
const ICON_ARROW_DOWN =
  '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3.4v9"/><path d="M4.8 9.2L8 12.4l3.2-3.2"/></svg>'
const ICON_SERVER =
  '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.4" y="3.2" width="11.2" height="4" rx="1.2"/><rect x="2.4" y="8.8" width="11.2" height="4" rx="1.2"/><path d="M5 5.2h.01"/><path d="M5 10.8h.01"/></svg>'
// 状态 / 提示
const ICON_WARN =
  '<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 2.6l5.8 10.4H2.2z"/><path d="M8 6.4v3.2"/><path d="M8 11.6h.01"/></svg>'
const ICON_INFO =
  '<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="8" cy="8" r="5.6"/><path d="M8 7.2v3.6"/><path d="M8 5.1h.01"/></svg>'
const ICON_STOP =
  '<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="8" r="5.6"/><path d="M6 6l4 4"/><path d="M10 6l-4 4"/></svg>'
const ICON_POWER =
  '<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 2.8v5"/><path d="M11.6 4.6a5.2 5.2 0 1 1-7.2 0"/></svg>'
const ICON_KEY =
  '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="5.6" cy="6" r="2.8"/><path d="M7.8 7.9l5.4 5.4"/><path d="M10.6 10.7l1.2-1.2"/></svg>'

let sessionsService = null
let socket = null
let modalEl = null
let statusChipEl = null

/**
 * 状态胶囊当前「讲的是哪个标签」：sid，或 null（面板级 / 宿主级消息，不属于任何标签）。
 * 切标签 / 关标签后拿它跟活动标签比，不一致就用活动标签自己记下的状态重算——
 * 否则失败标签的错误会一直挂在头上（见 status-line.js 的文件头）。
 */
let statusSid = null

/**
 * 官方凭据引用的**浏览器侧命名空间**（`ctx.remote.credentials`）。
 *
 * 「记住密码」要落到官方凭据存储，而不是把明文写进设置文件——配置持引用、值归存储，
 * 这既是 SecureCRT「命名凭据集按标题引用」那一派，也正是 DSH 自己设置卡片的做法
 * （`describe` / `set` / `unset`，值**单向写入、没有任何读路径**）。
 *
 * 可选：老宿主没有 `remote` 时保持 null，对话框那一行会禁用按钮并说明原因。
 */
let credentialsRemote = null
let statusEl = null
let statusDotEl = null
let tabbarEl = null
let connbarEl = null
let connDotEl = null
let connTargetEl = null
let connBadgeEl = null
let connActionsEl = null
let bodyEl = null
/** 终端区 + 右侧挂载位的横向容器（openModal 建立；ttyPanel.mountPane 往这里插 pane）。 */
let workEl = null
let searchInputEl = null
let bodyOverlayEl = null
let intentionalClose = false
let resizeObserver = null
/** 最小化状态：弹窗隐藏但会话保活，由右下角悬浮条（dock）恢复。 */
let minimized = false
let dockEl = null
let dockCountEl = null
let dockStatusEl = null
let dockDotEl = null
let dockActivityTimer = null
/** 断线自动重连：指数退避（1s 起步、封顶 5s），面板开着就一直尝试。 */
let reconnectTimer = null
let reconnectDelay = 1000
/** 标签列表持久化（sessionStorage）：页面刷新后按 sid 重连宿主保活的会话。 */
const PERSIST_KEY = 'dsh-tty:tabs'

/** sid → 标签页 */
const tabs = new Map()
/**
 * 嵌入式终端（0.15.0）：其他插件（如 dsh-docker）经 ttyTerminal.mount 把终端挂到
 * 自己的面板里。它们与标签共用同一条 WebSocket 与会话表，但**不进标签栏、不写
 * sessionStorage、也不随 tty 面板关闭而销毁**——这里单独记 sid，便于廉价判断
 * 「还有没有嵌入会话在跑」（决定关面板时要不要留连接）。
 */
const embeddedSids = new Set()
const hasEmbedded = () => embeddedSids.size > 0
/** 连接尚未就绪时挂起的创建帧（嵌入式终端可能在 socket 打开前就挂载）。 */
const pendingSpawns = new Set()
let activeSid = null
let tabCounter = 0
let connecting = false
/** 「+」新建菜单与 SSH 连接对话框（挂在 document.body 的浮层）。 */
let addMenuEl = null
let sshDialogEl = null
/** SSH 连接簿缓存：/api/dsh-tty/config 的 sshHosts（设置卡片保存后同步）。 */
let sshHostsCache = []
/* ---------- 服务器状态条（0.17.0） ---------- */
/** 配置开关（/api/dsh-tty/config 的 statsEnabled；关掉后整条收起且不发订阅）。 */
let statsEnabledCache = true
/** 状态条 DOM（每个面板一条，跟随活动标签；挂在 .tt_body 里、终端容器之前）。 */
let statsBarEl = null
/** 当前已向宿主订阅的 sid（可见性驱动；null = 没订阅）。 */
let statsSubSid = null
/** 陈旧检测定时器：面板打开期间每秒复查（采集端静默停止时要能自己收起状态条）。 */
let statsStaleTimer = null
/**
 * 状态条条目 DOM 引用（与 statsItemSpecs(t) 同序、等长；null = 还没建 / 已随面板作废）。
 * 条目**只建一次**，之后每次刷新只写真的变了的文本——整条 innerHTML 重写会丢掉 CSS
 * 过渡、把横向滚动位置弹回 0，且任何值位数变化都会推着后面所有条目横移（见 stats-bar.js
 * 文件头：用户报的「定期闪动」）。
 */
let statsItemEls = null
/** 已渲染的数据签名（sid + 帧时间）：同一条数据不重复渲染（1s 陈旧检测也走 applyStatsBar）。 */
let statsRenderKey = null
/**
 * 连接栏按钮注册表（0.13.0）：内置动作（重新打开 / SFTP / 隧道）与第三方插件
 * 经客户端服务 `ttyConnbar` 注册的按钮走**同一条通道**，显示顺序 = 注册顺序。
 * 每次 renderConnbar 按当前标签调用一遍全部工厂，工厂自行决定这次要不要加按钮。
 */
const connbarActions = new Set()

/** 注册一个连接栏按钮工厂；返回注销函数。 */
function registerConnbarAction(factory) {
  connbarActions.add(factory)
  return () => connbarActions.delete(factory)
}

// 内置动作：与第三方扩展同一通道，因此顺序与权限完全一致（插件禁用时全部收起）
registerConnbarAction(({ tab, addAction }) => {
  if (!entryVisible) return
  if (tab.exited) addAction(ICON_RECONNECT, t('btn.reopen'), t('btn.reopenTitle'), () => respawnTab(tab.sid))
})
registerConnbarAction(({ tab, addAction }) => {
  if (!entryVisible) return
  // 归属这个标签：切到别的标签时文件浏览跟着收起（它连的是这个标签的那台主机）
  addAction(ICON_SFTP, 'SFTP', t('btn.sftpTitle'), () => openSftpBrowser(tab.spawnSpec, tab.sid))
})
registerConnbarAction(({ bookName, addAction }) => {
  if (!entryVisible) return
  const count = bookName !== '' ? tunnelCountFor(bookName) : 0
  if (count > 0) {
    // 该连接有启用隧道：常驻按钮（带数量），一眼可见、可点开看实时状态
    addAction(ICON_TUNNEL, t('btn.tunnels', { count }), t('btn.tunnelsTitle'), (event) => openTunnelPopover(event.currentTarget, bookName))
    return
  }
  /*
   * 该连接没有启用隧道：收进「⋯」更多，而不是常驻一个「隧道 0」。
   *
   * 为什么不常驻：连接栏紧挨着标签条，宽度是先被标签吃掉的（D24 那类"窄屏挤没"的教训），
   * 而绝大多数连接确实没配隧道——常驻一个 0 是纯噪音。
   * 为什么仍要留入口：此前**完全不可见**，用户只能自己摸到设置卡片才知道有这功能；
   * 「⋯」是低频通道，既有发现路径、又不占常驻宽度。
   *
   * 前提：隧道必须引用连接簿条目，所以只有条目式连接（bookName 非空）才有这个入口；
   * 「新建连接」对话框里未保存的临时连接配不了隧道（默认走第一个条目，语义不对）。
   */
  if (bookName === '') return
  addAction(ICON_MORE, t('btn.more'), t('btn.moreTitle'), (event) => openConnbarMoreMenu(event.currentTarget, bookName))
})

function setStatus(text, state) {
  if (statusEl === null) return
  /*
   * 胶囊只放**第一句**，完整说明进 tooltip：宿主那句「会话数已达上限（4）——每个窗口的每个
   * 标签各占一个名额：关闭不用的窗口/标签，或在设置卡片调大「并发会话上限」」有六十多字，
   * 即使有 max-width + 省略号也会把标签条吃掉三分之一（实测截图里活动标签被挤到只剩半个）。
   * 本仓的状态文案用 `——` 分隔「结论」与「解释」，所以按它切一刀就够。
   */
  statusEl.textContent = text.split('——')[0]
  statusEl.title = text
  statusDotEl.dataset.state = state
  // 单行头部常态不占位：state=connected 时收起状态块，异常/瞬时消息才点亮
  if (statusChipEl !== null) statusChipEl.style.display = state === 'connected' ? 'none' : ''
  // 最小化时用户只看得到侧边栏入口徽标 / 兜底悬浮条，状态同步到那里
  if (dockStatusEl !== null) dockStatusEl.textContent = text
  if (dockDotEl !== null) dockDotEl.dataset.state = state
  const badgeDot = document.querySelector('[data-dsh-tty-entry] .tt_sidebarBadgeDot')
  if (badgeDot !== null) badgeDot.dataset.state = state
}

/**
 * 标签级状态：把原文记在这个标签自己身上，并且**只在它是活动标签时**才占用胶囊。
 *
 * 记下来是为了「切走再切回来」能还原同一条消息（SSH 失败原因、退出码都在里面），
 * 而不是退成一句泛泛的兜底文案；后台标签的事件只记不显示，免得它在别的主机上
 * 顶掉你正看着的那个会话的状态（见 status-line.js 的 eventOwnsStatus）。
 *
 * @param sid 这条消息属于哪个标签；宿主级消息（没有 sid）传 undefined/null。
 */
function setTabStatus(sid, text, state) {
  const owner = typeof sid === 'string' && sid !== '' ? sid : null
  if (owner !== null) {
    const tab = tabs.get(owner)
    if (tab !== undefined) {
      tab.statusText = text
      tab.statusState = state
    }
  }
  // 归属判定用归一化后的 owner（null = 宿主级），别再用原始 sid：
  // 同一个函数里两套「空值」口径容易在后续改动里分叉
  if (!eventOwnsStatus(owner, activeSid)) return
  statusSid = owner
  setStatus(text, state)
}

/** 面板级 / 宿主级状态（WebSocket 连接中、断开重连……）：不属于任何标签。 */
function setPanelStatus(text, state) {
  statusSid = null
  setStatus(text, state)
}

/**
 * 活动标签变了（切换 / 关闭 / 恢复）之后重算胶囊。
 *
 * 这是「窗口关了，错误迟迟不消失」的修复点：只在归属 ≠ 活动标签时才动，
 * 免得盖掉刚写进去的瞬时消息（传输进度之类）。
 */
function syncStatusToActiveTab() {
  if (!needsStatusResync(statusSid, activeSid)) return
  const tab = activeSid === null ? undefined : tabs.get(activeSid)
  statusSid = tab === undefined ? null : activeSid
  const next = statusForTab(tab, t)
  setStatus(next.text, next.state)
}

function sendFrame(msg) {
  if (socket !== null && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(msg))
  }
}

/* ============================ 服务器状态条（0.17.0） ============================ */

/**
 * 建状态条条目（每面板一次，DOM 结构与 statsItemSpecs(t) 一一对应）。
 *
 * 为什么不让每次 stats 帧重建 HTML（D49）：整条 `innerHTML` 重写会（a）丢掉
 * `.tt_statsMeterFill` 的宽度过渡——元素每秒被重建，过渡永远没机会跑；（b）把横向
 * 滚动位置弹回 0（窄窗口下 0.19.0 的 D33 允许横滚着看右侧条目）；（c）任何值的位数
 * 变化都会把后面所有条目推着横移。第 (c) 条就是用户报的「状态条定期闪动」。
 * 这里的固定槽位（`min-width: Nch`，值右对齐）配上「只写变化过的文本」，
 * 让「CPU 5% → 12%」「TCP 36 → 1024」都不再改变任何条目的几何。
 */
function buildStatsBarDom() {
  const refs = []
  const fragment = document.createDocumentFragment()
  for (const spec of statsItemSpecs(t)) {
    const item = document.createElement('span')
    item.className = 'tt_statsItem'
    const label = document.createElement('span')
    label.className = 'tt_statsLabel'
    label.textContent = spec.label
    item.appendChild(label)
    let meter = null
    let fill = null
    if (spec.kind === 'pct') {
      meter = document.createElement('span')
      meter.className = 'tt_statsMeter'
      fill = document.createElement('span')
      fill.className = 'tt_statsMeterFill'
      meter.appendChild(fill)
      item.appendChild(meter)
    }
    const value = document.createElement('span')
    value.className = 'tt_statsValue'
    item.appendChild(value)
    fragment.appendChild(item)
    // slot 先记 null（而不是 spec.slot）：网络条的槽位随「有没有速率」变（0 / 23），
    // 首帧必须按实际值设一次，不能想当然套用 spec 里的默认值
    refs.push({ item, value, meter, fill, slot: null })
  }
  if (statsBarEl !== null) statsBarEl.appendChild(fragment)
  return refs
}

/**
 * 把一帧数据写进已建好的条目——**只有真的变了才碰 DOM**（文本 / 进度宽度 / 档位 / title）。
 *
 * title 用 `setAttribute` 写：不再是拼字符串的 HTML 属性，值里出现 `"` `<` 也不会破坏结构。
 * 最小值守卫：宿主清洗 + `statsItemValues` 兜底之后 pct 只可能是 0~100，这里仍夹一次，
 * 免得第三方实现塞进来的越界值把进度条拉出容器。
 */
function updateStatsItems(refs, tab) {
  const values = statsItemValues(tab !== undefined ? tab.stats : null, t)
  for (let index = 0; index < refs.length; index += 1) {
    const ref = refs[index]
    const next = values[index]
    if (next === undefined) continue
    // 槽位本身也只在变的时候写：固定槽位是「更新不改布局」的根，写错/漏写都等于没修
    if (ref.slot !== next.slot) {
      ref.slot = next.slot
      ref.value.style.minWidth = next.slot > 0 ? next.slot + 'ch' : ''
    }
    if (ref.value.textContent !== next.value) ref.value.textContent = next.value
    if (ref.item.getAttribute('title') !== next.title) ref.item.setAttribute('title', next.title)
    if (ref.fill !== null && ref.meter !== null) {
      const width = next.pct === null ? '0%' : Math.max(0, Math.min(100, next.pct)).toFixed(1) + '%'
      if (ref.fill.style.width !== width) ref.fill.style.width = width
      const level = statsLevel(next.pct)
      if (ref.meter.dataset.level !== level) ref.meter.dataset.level = level
    }
  }
}

/** 条目引用随状态条 DOM 一起作废（面板重建 / 关闭 / 隐藏清空时都要调用）。 */
function discardStatsItems() {
  statsItemEls = null
  statsRenderKey = null
}

/** 状态条可见性：面板开着、没最小化、开关开、活动标签有新鲜数据。 */
function statsBarVisible() {
  if (modalEl === null || minimized || !statsEnabledCache) return false
  const tab = activeTab()
  if (tab === undefined || tab.embedded === true || tab.exited === true) return false
  if (tab.stats === null || tab.stats === undefined) return false
  return statsFrameFresh(tab.statsAt)
}

/**
 * 状态条显隐切换后的尺寸重算：条高改变了终端可用高度（.tt_term 的 top 偏移），
 * 不重跑 fit 就会行数错位 / 底部被裁。复用 switchTab 同一条路径（fit + sendResize）。
 */
function refitActiveTab() {
  if (minimized) return // 最小化时容器不可见：fit 会算出退化尺寸并可能 sendResize（0.19.0）
  const tab = activeTab()
  if (tab === undefined || tab.embedded === true || tab.fit === null) return
  try {
    tab.fit.fit()
  } catch {
    return // 容器还没布局（隐藏标签/面板正在收）
  }
  // sendResize 里的 proposeDimensions 在终端已 dispose 时可能抛：绝不让它冒泡
  try {
    if (tab.spawned && !tab.exited) sendResize(tab)
  } catch {
    /* 忽略：尺寸同步失败不该影响状态条显隐 */
  }
}

/**
 * 重画状态条（对外入口）。整体兜底：任何意外都退回「不显示」——绝不能留下
 * 半截偏移（.tt_body[data-stats] 加上了但条没出来）把终端顶歪或让面板抛崩。
 */
function applyStatsBar() {
  try {
    applyStatsBarInner()
  } catch (error) {
    console.warn('[dsh-tty] 状态条渲染失败（已收起）: ' + (error instanceof Error ? error.message : String(error)))
    try {
      if (statsBarEl !== null) {
        statsBarEl.hidden = true
        statsBarEl.textContent = ''
      }
      // 内容被清空 = 之前建的条目全不在文档里了：引用与数据签名必须一起作废，
      // 否则下一次显示会往游离节点上写，状态条看着永远空着
      discardStatsItems()
      if (bodyEl !== null) delete bodyEl.dataset.stats
    } catch {
      /* 连兜底都失败：静默，至少不再抛 */
    }
  }
}

/** 重画状态条；只有「显隐翻转」时才需要 fit（数据每秒刷新不该反复抖动终端）。 */
function applyStatsBarInner() {
  if (bodyEl === null || statsBarEl === null) return
  const visible = statsBarVisible()
  const changed = (bodyEl.dataset.stats !== undefined) !== visible
  if (!visible) {
    if (changed) delete bodyEl.dataset.stats
    statsBarEl.hidden = true
    // 隐藏时把条目一起丢掉（省 DOM）：下次显示重建，也就自然拿到了新标签的数据
    if (statsItemEls !== null) {
      statsBarEl.textContent = ''
      discardStatsItems()
    }
    if (changed) refitActiveTab()
    return
  }
  statsBarEl.hidden = false
  if (statsItemEls === null) statsItemEls = buildStatsBarDom()
  const tab = activeTab()
  /*
   * 同一条数据不重复渲染：1s 陈旧检测定时器也走这里，但它的职责只是「数据停了就收起」。
   * 原先每次调用都重写整条 innerHTML —— 于是状态条每秒被重建两次（stats 帧一次 +
   * 定时器一次），这正是「定期闪动」的第二个放大器。
   */
  const key = tab === undefined ? '' : tab.sid + ':' + String(tab.statsAt || 0)
  if (key !== statsRenderKey) {
    statsRenderKey = key
    updateStatsItems(statsItemEls, tab)
  }
  if (changed) {
    bodyEl.dataset.stats = ''
    refitActiveTab()
  }
}

/** 陈旧检测：采集端静默停止（无 /proc、exec 被拒、配置关闭）时前端要自己收起。 */
function ensureStatsStaleTimer() {
  if (statsStaleTimer !== null) return
  statsStaleTimer = setInterval(() => applyStatsBar(), 1000)
}

function stopStatsStaleTimer() {
  if (statsStaleTimer === null) return
  clearInterval(statsStaleTimer)
  statsStaleTimer = null
}

/** 需要订阅的 sid：只有可见标签才采（最小化/嵌入/已退出/开关关闭都不采）。 */
function desiredStatsSid() {
  if (modalEl === null || minimized || !statsEnabledCache) return null
  const tab = activeTab()
  if (tab === undefined || tab.embedded === true || tab.exited === true) return null
  return tab.sid
}

/**
 * 订阅对齐（幂等）：把宿主的采集器开关对齐到「当前可见标签」。tab 切换、面板
 * 开合/最小化、开关热生效、断线重连（statsSubSid 置 null 后由 ready 重新对齐）
 * 都调这里；退订后宿主侧会停表并关掉远端 exec channel。
 */
function syncStatsSubscription() {
  const want = desiredStatsSid()
  if (want === statsSubSid) return
  if (statsSubSid !== null) sendFrame({ t: 'statsOff', sid: statsSubSid })
  statsSubSid = want
  if (want !== null) sendFrame({ t: 'statsOn', sid: want })
}

/**
 * 会话就绪后补发订阅。新标签的 statsOn 是在 spawn 帧之前发的（switchTab 早于
 * spawnTab），宿主那边会话还没登记，会被按「未知 sid」静默忽略；所以 ready 之后
 * 必须再对齐一次（attach / 断线重连同理）。宿主侧订阅是 Set 语义，重复 statsOn
 * 幂等，不会重复启动采集。
 */
function resubscribeStats(sid) {
  if (sid !== desiredStatsSid()) {
    syncStatsSubscription()
    return
  }
  if (statsSubSid !== null && statsSubSid !== sid) sendFrame({ t: 'statsOff', sid: statsSubSid })
  statsSubSid = sid
  sendFrame({ t: 'statsOn', sid })
}

function activeTab() {
  return activeSid !== null ? tabs.get(activeSid) : undefined
}

/**
 * 当前 DSH 会话的工作目录（sessions 客户端服务快照）——新开的标签就落在这里，
 * 而不是宿主的启动目录。0.1.6 起列表快照没有 current 字段，取法见 current-session.js
 * （改看 retainedBy.mainView，官方 dsh-client-ui-session 与本地 codegraph 同一判据）。
 */
function currentCwd() {
  try {
    return currentSessionCwd(sessionsService?.list?.getSnapshot?.())
  } catch {
    return undefined
  }
}

/**
 * 持久（tmux）标签的自愈：tmux 只重画可见屏，外层 xterm 的缓冲行数正常应
 * 恰好等于视口行数；一旦超出（字体加载后收缩、标签切换的连接栏显隐、窗口
 * 尺寸变化等把多出的行推进 scrollback）→ reset 清掉残 scrollback 后发
 * refresh 帧请宿主 refresh-client 重画。非持久标签不干预。
 */
function settleNow(tab) {
  if (tab.term === null || tab.exited) return
  try {
    if (tab.term.buffer.active.length <= tab.term.rows) return
  } catch {
    return
  }
  tab.term.reset()
  sendFrame({ t: 'refresh', sid: tab.sid })
}

let settleTimer = null
function scheduleSettle(delay) {
  if (settleTimer !== null) clearTimeout(settleTimer)
  settleTimer = setTimeout(() => {
    settleTimer = null
    const tab = activeTab()
    if (tab !== undefined) settleNow(tab)
  }, delay ?? 200)
}

/**
 * 持久化安全化（0.19.0）：SSH 明文凭证（password/passphrase）不落浏览器存储
 * ——sessionStorage['dsh-tty:tabs'] 与 localStorage['dsh-tty:persist-specs']
 * 同源脚本可读。只作用于持久化副本：`env:` 引用不是明文，保留；明文剥掉并
 * 打 `credsStripped` 标记，恢复 / 重开时在终端提示重新输入。内存里的
 * spawnSpec 保持原值，本次会话的连接 / respawn 不受影响。
 */
const SENSITIVE_SPEC_FIELDS = ['password', 'passphrase']
function persistSafeSpec(spec) {
  if (spec === null || typeof spec !== 'object' || spec.t !== 'ssh') return spec
  let stripped = spec.credsStripped === true
  const next = { ...spec }
  for (const field of SENSITIVE_SPEC_FIELDS) {
    const value = next[field]
    if (typeof value === 'string' && value !== '' && !value.startsWith('env:')) {
      delete next[field]
      stripped = true
    }
  }
  if (stripped) next.credsStripped = true
  return next
}

/** 标签列表持久化（sessionStorage，随浏览器标签页生命周期）：只存未退出的标签。
 *  载荷带版本号 v（0.19.0）：结构升级时按版本迁移或丢弃，旧数据不再按新语义误读；
 *  写入失败（配额溢出等）不再静默——至少留下 console 警告。 */
const PERSIST_VERSION = 1
function persistTabs() {
  try {
    const data = [...tabs.values()]
      .filter((tab) => !tab.exited && tab.embedded !== true) // 嵌入会话不进标签持久化
      .map((tab) => ({ sid: tab.sid, spawnSpec: persistSafeSpec(tab.spawnSpec), label: tab.label }))
    if (data.length === 0 || modalEl === null) sessionStorage.removeItem(PERSIST_KEY)
    else sessionStorage.setItem(PERSIST_KEY, JSON.stringify({ v: PERSIST_VERSION, tabs: data }))
    // 持久规格独立留存：exit 帧（自然退出/回收器回收/宿主重启）不淘汰规格——
    // 那正是需要恢复的场景；规格只随「标签被主动关闭」（closeTab）淘汰。
    // 恢复时按规格 respawn：tmux 会话存活则接回原现场，已消失则新开 shell
    syncPersistSpecStore([...tabs.values()].filter((tab) => tab.embedded !== true).map((tab) => ({ spawnSpec: persistSafeSpec(tab.spawnSpec), label: tab.label })))
  } catch (error) {
    // 隐私模式存储不可用属正常；QuotaExceededError 等会被静默丢标签，必须留痕
    console.warn('[dsh-tty] 标签持久化失败（本次刷新后标签列表可能丢失）: ' + (error instanceof Error ? error.message : String(error)))
  }
}

/**
 * 持久标签规格（localStorage，跨浏览器标签页/窗口存活）：sessionStorage 只
 * 有同一个浏览器标签页能看到，dsh 重启自动打开的新窗口读不到——持久化的
 * 「宿主重启后恢复」就断在这一环。规格跨窗口共享，恢复前经宿主 sessions
 * 帧的 tmux 会话名清单确认仍存活（已关闭/已消失的规格自动淘汰）。
 */
const PERSIST_SPEC_KEY = 'dsh-tty:persist-specs'

function syncPersistSpecStore(data) {
  try {
    const specs = data
      .filter((tab) => isPersistentSpec(tab.spawnSpec))
      .map((tab) => ({ spawnSpec: tab.spawnSpec, label: tab.label }))
    if (specs.length === 0) localStorage.removeItem(PERSIST_SPEC_KEY)
    else localStorage.setItem(PERSIST_SPEC_KEY, JSON.stringify(specs))
  } catch {
    /* 存储不可用：静默跳过 */
  }
}

/** 读取跨窗口的持久标签规格（结构不合法的条目丢弃）。 */
function loadPersistSpecs() {
  try {
    const raw = localStorage.getItem(PERSIST_SPEC_KEY)
    if (raw === null) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item) => item !== null && typeof item === 'object' && isPersistentSpec(item.spawnSpec))
  } catch {
    return []
  }
}

/** 读取持久化标签（页面刷新后重开面板用）；结构不合法的条目直接丢弃。
 *  兼容两种载荷：v1 对象（{v, tabs}）与历史数组（读取后随下次 persistTabs 升级）。 */
function loadPersistedTabs() {
  try {
    const raw = sessionStorage.getItem(PERSIST_KEY)
    if (raw === null) return []
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed.filter((item) => item !== null && typeof item === 'object' && typeof item.sid === 'string' && item.sid !== '' && item.spawnSpec !== null && typeof item.spawnSpec === 'object')
    if (parsed !== null && typeof parsed === 'object' && parsed.v === PERSIST_VERSION && Array.isArray(parsed.tabs)) {
      return parsed.tabs.filter((item) => item !== null && typeof item === 'object' && typeof item.sid === 'string' && item.sid !== '' && item.spawnSpec !== null && typeof item.spawnSpec === 'object')
    }
    // 未知版本：结构可能已不兼容，按「丢弃」处理而不是猜
    return []
  } catch {
    return []
  }
}

/**
 * 等待某一类型的第一帧（独立监听，主 onmessage 同时照常处理）；
 * 超时返回 null（宿主不支持该帧 / 网络异常）。
 * socket 引用在进入时就捕获（0.19.0）：等待期间发生 connect()（先 close 旧
 * socket 再新建）时，监听器清理必须对着当次实例——此前清理读模块级 socket
 * 变量，旧监听器留在已关闭的 socket 上且必然 resolve(null)，恢复流程误判
 * 「宿主一个会话都没有」，可重跑标签被 restoreTabAsNew 双开。
 */
function waitFrame(type, timeoutMs) {
  const ws = socket
  return new Promise((resolve) => {
    let timer = null
    const onMsg = (event) => {
      let msg
      try {
        msg = JSON.parse(event.data)
      } catch {
        return
      }
      if (msg.t !== type) return
      if (timer !== null) clearTimeout(timer)
      ws.removeEventListener('message', onMsg)
      // 连接已被换掉：旧 socket 上的帧不再可信，按超时处理让调用方重新评估
      resolve(ws === socket ? msg : null)
    }
    timer = setTimeout(() => {
      ws.removeEventListener('message', onMsg)
      resolve(null)
    }, timeoutMs)
    ws.addEventListener('message', onMsg)
  })
}

function sendResize(tab) {
  if (tab === undefined || tab.fit === undefined) return
  const dims = tab.fit.proposeDimensions()
  if (dims !== undefined) sendFrame({ t: 'resize', sid: tab.sid, cols: dims.cols, rows: dims.rows })
}

/**
 * 终端区尺寸变化（窗口缩放、挂载位开合）后的重新 fit。
 *
 * 不能只调 fit 就完事：xterm 在 rows 变化时会按自己的规则挪视口，用户看到的就是
 * 「开个面板，终端里的文字被往上顶了」。这里按用户当时的意图锚定视口——
 * 本来就贴着底部（在看最新输出）就继续贴底；翻在历史里就锁住原来那几行不跳。
 */
function refitTerminal(tab) {
  if (tab === undefined || tab.fit === undefined) return
  const term = tab.term
  const buffer = term !== null && term.buffer !== undefined ? term.buffer.active : null
  const anchor = buffer == null ? null : { atBottom: buffer.viewportY >= buffer.baseY, line: buffer.viewportY }
  try {
    tab.fit.fit()
  } catch {
    return // 容器还没布局（面板最小化等）：交给下一次
  }
  if (anchor !== null) {
    try {
      if (anchor.atBottom) term.scrollToBottom()
      else term.scrollToLine(Math.min(anchor.line, term.buffer.active.baseY))
    } catch {
      /* 极端时序下 term 可能已 dispose：忽略 */
    }
  }
  if (!tab.exited) sendResize(tab)
}

/**
 * 终端区遮罩：空串清除，否则渲染成「图标 + 主文案 + 副文案」的动作卡片
 * （会话退出 / 连接错误 / 断线重连中三种语义）。整块可点，点击重开或重连。
 */
function showTabOverlay(tab, text, hint, kind) {
  if (tab.overlayEl === null || tab.overlayEl === undefined) return
  const el = tab.overlayEl
  if (text === '' || text === undefined) {
    el.textContent = ''
    return
  }
  const level = kind === 'error' || kind === 'info' ? kind : 'exited'
  el.innerHTML = '<div class="tt_overlayCard" data-kind="' + level + '">' +
    '<span class="tt_overlayIcon">' + (level === 'error' ? ICON_STOP : level === 'info' ? ICON_REFRESH : ICON_POWER) + '</span>' +
    '<span class="tt_overlayText"><span class="tt_overlayMain"></span>' +
    (hint === undefined || hint === '' ? '' : '<span class="tt_overlayHint"></span>') +
    '</span></div>'
  el.querySelector('.tt_overlayMain').textContent = text
  if (hint !== undefined && hint !== '') el.querySelector('.tt_overlayHint').textContent = hint
}

/** 读取宿主主题变量（拿不到时用兜底值），让 xterm 配色跟随皮肤。 */
function cssVar(name, fallback) {
  try {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
    return value !== '' ? value : fallback
  } catch {
    return fallback
  }
}

function createTerminal(tab) {
  // 终端底色固定深色（与主流终端一致），强调色跟随宿主皮肤
  const accent = cssVar('--dsw-alias-state-business-primary', '#7c9cff')
  const term = new Terminal({
    cursorBlink: true,
    cursorStyle: 'bar',
    cursorInactiveStyle: 'outline',
    fontSize: 13,
    fontFamily: '"JetBrains Mono", "SF Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
    fontWeight: 400,
    fontWeightBold: 600,
    lineHeight: 1.35,
    scrollback: 5000,
    convertEol: false,
    // 搜索高亮装饰（SearchAddon decorations）依赖提案 API
    allowProposedApi: true,
    theme: {
      background: '#0b0e14',
      foreground: '#d7dce5',
      cursor: accent,
      cursorAccent: '#0b0e14',
      selectionBackground: 'rgba(124, 156, 255, .30)',
      black: '#1b2028',
      red: '#f07178',
      green: '#7ec699',
      yellow: '#e6b673',
      blue: '#7aa2f7',
      magenta: '#c792ea',
      cyan: '#7fdbca',
      white: '#c8d0dc',
      brightBlack: '#556070',
      brightRed: '#ff8b92',
      brightGreen: '#9fe0b4',
      brightYellow: '#f5cc8c',
      brightBlue: '#9ab8ff',
      brightMagenta: '#dbb3ff',
      brightCyan: '#a3f0e2',
      brightWhite: '#eef2f8',
    },
  })
  const fit = new FitAddon()
  const search = new SearchAddon()
  term.loadAddon(fit)
  term.loadAddon(search)
  term.loadAddon(new WebLinksAddon())

  const termEl = document.createElement('div')
  termEl.className = 'tt_term'
  const overlayEl = document.createElement('div')
  overlayEl.className = 'tt_overlay'
  overlayEl.addEventListener('click', () => {
    overlayEl.textContent = ''
    respawnTab(tab.sid)
  })
  // 键盘可达（0.19.0）：退出/错误浮层此前 div+click，键盘用户重开不了会话
  overlayEl.setAttribute('role', 'button')
  overlayEl.setAttribute('aria-label', t('btn.reopenSession'))
  overlayEl.tabIndex = 0
  overlayEl.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault()
      overlayEl.textContent = ''
      respawnTab(tab.sid)
    }
  })
  termEl.appendChild(overlayEl)

  term.open(termEl)
  try {
    fit.fit()
  } catch {
    /* 容器尚未布局完成时忽略 */
  }
  // WebGL 渲染器：高吞吐输出（build 日志）性能质变；上下文丢失（多标签
  // 超出浏览器 WebGL 上下文配额等）时释放本 addon，xterm 自动回退 DOM 渲染器
  try {
    const webgl = new WebglAddon()
    webgl.onContextLoss(() => {
      try {
        webgl.dispose()
      } catch {
        /* 已释放 */
      }
    })
    term.loadAddon(webgl)
  } catch {
    /* WebGL 不可用：保持 DOM 渲染器 */
  }

  term.onData((data) => {
    sendFrame({ t: 'input', sid: tab.sid, d: data })
  })
  // 持久（tmux）标签尺寸自愈：SSH↔本地标签切换会改变终端区高度（连接栏
  // 显隐），xterm 收缩的瞬间多出的行被推进 scrollback——幽灵滚动条 + 视口
  // 停在顶部。onResize 时检测缓冲超出视口即 reset + refresh 重画
  term.onResize(() => {
    if (isPersistentSpec(tab.spawnSpec)) scheduleSettle(200)
  })
  term.attachCustomKeyEventHandler((event) => {
    // 嵌入式终端没有搜索框（搜索是 tty 面板头部的 UI），Ctrl+F 交还给浏览器
    if (tab.embedded === true) return true
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
      event.preventDefault()
      toggleSearch()
      return false
    }
    return true
  })

  tab.term = term
  tab.fit = fit
  tab.search = search
  tab.termEl = termEl
  tab.overlayEl = overlayEl
}

/**
 * 新建标签页。spawnSpec 为创建帧的可变部分（本地 {t:'spawn',cwd} / SSH
 * {t:'ssh',...}），随标签保存以便 respawn 复用；label 为标签标题（SSH 标签
 * 传连接名或 user@host，缺省显示「终端 N」）。未指定 spawnSpec 时（默认本地
 * 终端），持久化开启则默认由 tmux 托管。
 */
/**
 * 同一个「连接 + 命令」的复用键。
 *
 * 键必须**稳定**：不能直接 `JSON.stringify(spec)`——键顺序不同就会漏判，而从 sessionStorage
 * 恢复的 spec 与现场构造的 spec 顺序未必一致。所以按固定字段列表取值。
 */
function specReuseKey(spec) {
  if (spec === null || typeof spec !== 'object') return ''
  const fields = ['t', 'name', 'host', 'port', 'username', 'command', 'cwd', 'persist', 'persistName']
  return fields.map((field) => field + '=' + String(spec[field] ?? '')).join('\u0000')
}

/** 找一个与 spec 同「连接 + 命令」且**还活着**的标签（复用它，而不是再堆一个重复的）。 */
function findReusableTab(spec) {
  const key = specReuseKey(spec)
  if (key === '') return null
  for (const tab of tabs.values()) {
    if (tab.exited === true) continue
    if (tab.embedded === true) continue
    if (specReuseKey(tab.spawnSpec) === key) return tab
  }
  return null
}

function addTab(spawnSpec, label) {
  const sid = newSid()
  const tab = {
    sid,
    term: null,
    fit: null,
    search: null,
    termEl: null,
    overlayEl: null,
    exited: false,
    spawned: false,
    spawnSpec: spawnSpec ?? defaultLocalSpec(),
    label,
  }
  createTerminal(tab)
  tabs.set(sid, tab)
  tabCounter += 1
  renderTabbar()
  switchTab(sid)
  spawnTab(tab)
  persistTabs()
  return tab
}

/**
 * 采纳 agent 开的会话（0.20.0，tty_open）。
 *
 * 设计前提：agent 开的终端**必须对用户可见可接管**（不做隐形会话——D06 那类
 * 僵尸会话正是隐形会话的产物：用户不知道机器上跑着什么）。宿主在 agent 开关
 * 会话后推一帧 sessions，这里把还没有本地标签的 agent 会话建成标签并 attach。
 *
 * 与 restoreTab 的区别：那个走 sessionStorage 里的已知 sid，这个是**被通知**的
 * 新 sid（宿主侧已存在，attach 即接回现场），所以 spawnSpec 用一个占位（本地
 * spawn），标签标记 agentOwned 供 UI 区分。
 */
function adoptAgentSessions(list) {
  if (!Array.isArray(list)) return
  for (const entry of list) {
    if (entry === null || typeof entry !== 'object') continue
    if (entry.owner !== 'agent') continue // 只采纳 agent 开的
    const sid = typeof entry.sid === 'string' ? entry.sid : ''
    if (sid === '') continue
    if (tabs.has(sid)) continue // 已经在本地有标签（用户已接管过）
    const tab = {
      sid,
      term: null,
      fit: null,
      search: null,
      termEl: null,
      overlayEl: null,
      exited: false,
      spawned: false,
      agentOwned: true,
      spawnSpec: { t: 'spawn', cwd: typeof entry.cwd === 'string' ? entry.cwd : currentCwd() },
      label: 'agent' + (entry.kind === 'ssh' && typeof entry.target === 'string' && entry.target !== '' ? ' · ' + entry.target : ''),
    }
    createTerminal(tab)
    tabs.set(sid, tab)
    tabCounter += 1
    renderTabbar()
    // 刻意不 switchTab：面板可能没打开（bodyEl 为 null），且 agent 开的终端
    // 不该抢用户当前的焦点——它在后台待着，用户点标签才切过去。
    if (panelVisible() && tab.termEl !== null && bodyEl !== null && activeSid === null) {
      switchTab(sid)
    }
    sendFrame({ t: 'attach', sid })
    persistTabsForAgent()
  }
}

/** 面板当前是否可见（modalEl 存在且未最小化）——决定采纳 agent 标签时能否切过去。 */
function panelVisible() {
  return modalEl !== null && minimized !== true
}

/** agent 标签也要能在页面刷新后恢复（与普通标签同样的持久化）。 */
function persistTabsForAgent() {
  try {
    persistTabs()
  } catch {
    /* 持久化失败不影响会话 */
  }
}

/**
 * 同步「agent 开的会话」标签集合：宿主推来的清单里 owner=agent 且本地没有的
 * 建标签；本地有、宿主已不在的 agent 标签标记退出（用户可手动关掉）。
 */
function syncAgentTabs(list) {
  adoptAgentSessions(list)
  if (!Array.isArray(list)) return
  const alive = new Set(list.filter((e) => e !== null && typeof e === 'object' && e.owner === 'agent').map((e) => e.sid))
  for (const [sid, tab] of [...tabs]) {
    if (tab.agentOwned !== true) continue
    if (alive.has(sid)) continue
    // 宿主侧已结束（agent 调了 tty_close 或进程退出）：标退出，等 exit 帧或用户关闭
    if (tab.exited !== true && tab.live === true) {
      tab.exited = true
      tab.live = false
      renderTabbar()
    }
  }
}

/**
 * 页面刷新后恢复标签：沿用持久化的 sid / spawnSpec / label，发 attach 重连
 * 宿主保活的会话（不再 spawnTab）；attach 失败会走 error 浮层（点击 respawn）。
 */
function restoreTab(saved) {
  // 去重（0.19.0）：并发恢复 / 复制标签页场景下同一 sid 已在 tabs 里时不再重建
  // ——重复的 xterm/termEl 永不 dispose（幽灵 DOM 叠在终端上）
  if (tabs.has(saved.sid)) return tabs.get(saved.sid)
  const tab = {
    sid: saved.sid,
    term: null,
    fit: null,
    search: null,
    termEl: null,
    overlayEl: null,
    exited: false,
    spawned: false,
    spawnSpec: saved.spawnSpec,
    label: typeof saved.label === 'string' ? saved.label : undefined,
  }
  createTerminal(tab)
  tabs.set(tab.sid, tab)
  tabCounter += 1
  renderTabbar()
  switchTab(tab.sid)
  sendFrame({ t: 'attach', sid: tab.sid })
}

/** 恢复 / 重开带 credsStripped 标记的 SSH 标签：明文凭证没被保留，先在终端里说明。 */
function warnStrippedCredentials(tab) {
  if (tab?.spawnSpec?.credsStripped !== true || tab.term === null) return
  try {
    tab.term.writeln('\x1b[2m[dsh-tty] ' + t('msg.passwordNotStored') + '\x1b[0m')
  } catch {
    /* 终端已释放 */
  }
}

/** 按标签保存的 spawnSpec 发创建帧（sid/cols/rows 由本地补齐）。 */
function spawnTab(tab) {
  warnStrippedCredentials(tab)
  const dims = tab.fit !== null ? tab.fit.proposeDimensions() : undefined
  const frame = {
    ...tab.spawnSpec,
    sid: tab.sid,
    cols: dims !== undefined ? dims.cols : 80,
    rows: dims !== undefined ? dims.rows : 24,
  }
  if (socket === null || socket.readyState !== WebSocket.OPEN) {
    // 连接还没就绪：挂起，onopen 后补发。嵌入式终端是「冷启动」的（面板没开也可能
    // 被挂载），必然走到这条路径；面板流程下创建帧本来就在 onopen 之后发。
    pendingSpawns.add({ tab, frame })
    return
  }
  sendFrame(frame)
}

/**
 * 持久标签在宿主侧已结束（宿主重启/保活超时）时的恢复：换新 sid 按原
 * spawnSpec（含原 persistName）重新 spawn —— 宿主 `tmux new-session -A` 按
 * 同名接回原会话现场；非持久标签不走这里（维持丢弃语义）。
 */
function restoreTabAsNew(saved) {
  const tab = {
    sid: newSid(),
    term: null,
    fit: null,
    search: null,
    termEl: null,
    overlayEl: null,
    exited: false,
    spawned: false,
    spawnSpec: saved.spawnSpec,
    label: typeof saved.label === 'string' ? saved.label : undefined,
  }
  createTerminal(tab)
  tabs.set(tab.sid, tab)
  tabCounter += 1
  renderTabbar()
  switchTab(tab.sid)
  spawnTab(tab)
}

/** 退出后重开：换新 sid 重新 spawn（保留标签位，复用原 spawnSpec/label）。 */
function respawnTab(oldSid) {
  const old = tabs.get(oldSid)
  if (old === undefined) return
  if (old.embedded === true) {
    // 嵌入终端没有「标签位」概念：原地重建，DOM 仍挂在调用方的容器里
    respawnEmbedded(old)
    return
  }
  const spawnSpec = old.spawnSpec
  const label = old.label
  if (!old.exited) sendFrame({ t: 'kill', sid: oldSid })
  if (old.term !== null) {
    try {
      old.term.dispose()
    } catch {
      /* 忽略 */
    }
  }
  if (old.termEl !== null) old.termEl.remove()
  tabs.delete(oldSid)
  const tab = { sid: newSid(), term: null, fit: null, search: null, termEl: null, overlayEl: null, exited: false, spawned: false, spawnSpec, label }
  createTerminal(tab)
  tabs.set(tab.sid, tab)
  renderTabbar()
  switchTab(tab.sid)
  spawnTab(tab)
  persistTabs()
}

function closeTab(sid) {
  const tab = tabs.get(sid)
  if (tab === undefined) return
  // 挂载位归属这个标签：标签都没了，面板不能再留着——收起态的面板 DOM 还在，
  // 里面的 SFTP 在途传输 / docker 轮询会继续对着已经关掉的连接干活，而且它的
  // 归属标签永远回不来（切不回这个标签），等于一块看不见的僵尸面板。
  if (dockPane !== null && dockPane.ownerKey === sid) teardownDockPane(true)
  if (!tab.exited) sendFrame({ t: 'kill', sid })
  tabs.delete(sid)
  embeddedSids.delete(sid) // 兜底：嵌入终端正常走 disposeEmbedded，这里防漏
  // 彻底移除：dispose xterm 实例并把 termEl（含错误/退出浮层）从面板拿走，
  // 否则被关闭标签的幽灵 DOM 会叠在其它标签上
  if (tab.term !== null) {
    try {
      tab.term.dispose()
    } catch {
      /* 忽略 */
    }
  }
  if (tab.termEl !== null) tab.termEl.remove()
  if (activeSid === sid) {
    activeSid = null
    // 只在普通标签里选邻居（0.19.0）：tabs 里还装着 dsh-docker 等挂进来的
    // 嵌入会话，`[...keys()].pop()` 会选中它——标签栏没有它、普通终端全
    // display:none（看起来是空面板），连接栏/胶囊还在描述一个不在标签栏
    // 里的会话
    const next = [...tabs.entries()].filter(([, t]) => t.embedded !== true).map(([key]) => key).pop() ?? null
    if (next !== null) switchTab(next)
  }
  renderTabbar()
  // 关掉的正是胶囊「讲」的那个标签时，把文案换成剩下那个活动标签自己的——
  // 否则用户关掉连不上的窗口后，那行红字还会一直挂在头上
  syncStatusToActiveTab()
  // 注意判据是「没有自己的标签了」：嵌入终端不占标签位，不该因为它而留住空面板
  if (![...tabs.values()].some((tab) => tab.embedded !== true)) closeModal()
  else persistTabs()
}

/* ============================ 嵌入式终端（0.15.0） ============================ */

/**
 * 校验并规范化 ttyTerminal 的 command：必填、单行（宿主包装层按单行拼接）。
 * open 与 mount 共用，保证两个入口的入参约束一致。
 */
function normalizeTerminalCommand(options) {
  const command = typeof options?.command === 'string' ? options.command.trim() : ''
  if (command === '') throw new Error(t('error.terminalNeedsCommand'))
  if (/[\r\n\0]/.test(command)) throw new Error(t('error.terminalCommandSingleLine'))
  return command
}

/** 由 options 组装创建帧：book > spec > 本地（三者互斥），与 open 语义一致。 */
function buildTerminalSpec(options, command) {
  if (typeof options?.book === 'string' && options.book !== '') return { t: 'ssh', name: options.book, command }
  if (options?.spec !== null && typeof options?.spec === 'object') return { t: 'ssh', ...options.spec, command }
  return { t: 'spawn', ...(typeof options?.cwd === 'string' && options.cwd !== '' ? { cwd: options.cwd } : {}), command }
}

/** 嵌入终端的尺寸跟随：挂载容器变化即 fit，并把精确尺寸同步给 PTY。 */
function observeEmbeddedResize(tab) {
  const controller = tab.controller
  if (controller === undefined || controller.observer !== null) return
  controller.observer = new ResizeObserver(() => {
    if (controller.disposed || controller.tab !== tab || tab.term === null) return
    try {
      tab.fit.fit()
    } catch {
      return // 容器还没布局（抽屉 display:none 时）
    }
    if (tab.spawned && !tab.exited) sendResize(tab)
  })
  controller.observer.observe(controller.hostEl)
}

/** 在挂载容器里建一个嵌入标签（不进标签栏、不写 sessionStorage）。 */
function createEmbeddedTab(controller, spawnSpec, label) {
  const tab = {
    sid: newSid(),
    term: null,
    fit: null,
    search: null,
    termEl: null,
    overlayEl: null,
    exited: false,
    spawned: false,
    embedded: true,
    controller,
    spawnSpec,
    label,
  }
  createTerminal(tab)
  tabs.set(tab.sid, tab)
  embeddedSids.add(tab.sid)
  controller.hostEl.appendChild(tab.termEl)
  observeEmbeddedResize(tab)
  spawnTab(tab)
  return tab
}

/** 嵌入终端的原地重建（退出后点击重开 / 宿主重启后重新跑命令）：DOM 位置不变。 */
function respawnEmbedded(old) {
  const controller = old.controller
  if (controller === undefined || controller.disposed) return undefined
  if (!old.exited) sendFrame({ t: 'kill', sid: old.sid })
  try {
    old.term?.dispose()
  } catch {
    /* 忽略 */
  }
  old.termEl?.remove()
  tabs.delete(old.sid)
  embeddedSids.delete(old.sid)
  if (controller.observer !== null) {
    controller.observer.disconnect()
    controller.observer = null
  }
  controller.tab = createEmbeddedTab(controller, old.spawnSpec, old.label)
  // respawn 换了 sid：若活动标签/胶囊正指着旧 sid，改指新 sid 并重算，
  // 否则 activeSid 悬垂、胶囊继续讲一个已经不存在的会话
  if (activeSid === old.sid) {
    activeSid = controller.tab.sid
    syncStatusToActiveTab()
  }
  return controller.tab
}

/**
 * 把终端挂到调用方提供的元素里（ttyTerminal.mount，0.15.0）。
 *
 * 与标签共用同一条 WebSocket 与会话表，但语义是「别人面板里的一块终端」：
 *   - 不进标签栏、不参与 switchTab 的显隐、不写 sessionStorage；
 *   - tty 面板关闭时不销毁（closeModal 只清自己的标签，连接也留着）；
 *   - 断线自动重连、宿主重启后按原命令重跑、resize 跟随容器，都复用既有逻辑。
 * 返回 dispose()：结束会话并卸载 DOM——调用方在自己的抽屉关闭时调用它。
 */
function mountTerminal(hostEl, options) {
  if (!(hostEl instanceof HTMLElement)) throw new Error(t('error.terminalNeedsHost'))
  const command = normalizeTerminalCommand(options)
  const spawnSpec = buildTerminalSpec(options, command)
  const label = typeof options?.label === 'string' && options.label !== '' ? options.label : undefined
  ensureStyle()
  const controller = { hostEl, tab: null, observer: null, disposed: false }
  controller.tab = createEmbeddedTab(controller, spawnSpec, label)
  // 冷启动：面板没开时也要把连接拉起来（创建帧已在 spawnTab 里挂起，onopen 补发）
  ensureSocket()
  return () => disposeEmbedded(controller)
}

/** 卸载嵌入终端：结束会话、拆 DOM，若已无其他消费者则顺手收掉连接。 */
function disposeEmbedded(controller) {
  if (controller.disposed) return
  controller.disposed = true
  if (controller.observer !== null) {
    controller.observer.disconnect()
    controller.observer = null
  }
  const tab = controller.tab
  if (tab !== null) {
    if (!tab.exited) sendFrame({ t: 'kill', sid: tab.sid })
    try {
      tab.term?.dispose()
    } catch {
      /* 忽略 */
    }
    tab.termEl?.remove()
    tabs.delete(tab.sid)
    embeddedSids.delete(tab.sid)
    controller.tab = null
  }
  // 面板没开、也没有别的嵌入终端：连接留着没意义，收掉（下次挂载会重新连）
  if (modalEl === null && !hasEmbedded() && socket !== null) {
    intentionalClose = true
    try {
      socket.close()
    } catch {
      /* 忽略 */
    }
    socket = null
  }
}

/* ============================ 右侧挂载位（ttyPanel，0.16.0） ============================ */

/**
 * 其他插件（如 dsh-docker）在终端面板里挂一块**自己的**界面，终端保持可见可交互。
 * 与 ttyTerminal.mount 互为镜像：那边是「tty 往调用方给的元素里塞终端」，这边是
 * 「tty 给调用方一个元素去 render」。
 *
 * 生命周期约定（写进 README 的客户端服务契约）：
 *   - pane 的 DOM 长在 .tt_modal 里：面板最小化 / 恢复跟着走，消费者不需要做任何事；
 *   - 面板被关闭（✕ / 宿主卸载）时，tty 先调挂载时传入的 onClose（消费者在这里
 *     unmount 自己的 React root 等），随后才摘 DOM；
 *   - 消费者主动收起用返回值的 dispose()（幂等，不会再触发 onClose）；
 *   - v1 同时只挂一个 pane：后来的 mountPane 会先收掉前一个（并通知它）。
 *   - 0.18.4 起每块 pane 记「归属标签」（`options.ownerSid`，默认当前活动标签）：
 *     切到别的标签时整块收起、切回来恢复现场；标签被关掉时面板一并收掉。
 *     挂载位是**连接级**的——凭证 / 目标来自打开它的那个标签，不认标签就会在切换后
 *     把 A 主机的文件列表留在 B 标签底下（标题与标签对不上，最坏往错主机上传）。
 */
const DOCK_DEFAULT_WIDTH = 460
const DOCK_MIN_WIDTH = 280
const DOCK_DEFAULT_HEIGHT = 320
const DOCK_MIN_HEIGHT = 160
let dockPane = null
/** 记住用户拖出来的尺寸，下次挂载沿用（同一次会话内，两个方向各记一份）。 */
let dockWidth = DOCK_DEFAULT_WIDTH
let dockHeight = DOCK_DEFAULT_HEIGHT

/** 终端面板卡片（.tt_modal）的矩形：dock 的上限与初始尺寸都以它为准。 */
function panelCardRect() {
  const card = modalEl !== null ? modalEl.querySelector('.tt_modal') : null
  const el = card !== null ? card : modalEl
  return el !== null ? el.getBoundingClientRect() : null
}

const dockMinSize = (side) => (side === 'bottom' ? DOCK_MIN_HEIGHT : DOCK_MIN_WIDTH)

/** dock 尺寸上限：面板卡片长边的 72%，给终端留足位置。 */
function dockMaxSize(side) {
  const rect = panelCardRect()
  if (rect === null) return 900
  const base = side === 'bottom' ? rect.height : rect.width
  return Math.max(dockMinSize(side), Math.round(base * 0.72))
}

function clampDockSize(side, value) {
  return Math.min(dockMaxSize(side), Math.max(dockMinSize(side), Math.round(value)))
}

/** 把折叠态 / 尺寸落到 inline style（折叠交给 CSS 的窄条样式）。 */
function applyDockGeometry() {
  const pane = dockPane
  if (pane === null) return
  if (pane.collapsed) {
    pane.el.style.width = ''
    pane.el.style.height = ''
    pane.el.style.flexBasis = ''
    return
  }
  if (pane.side === 'bottom') {
    dockHeight = clampDockSize('bottom', dockHeight)
    pane.el.style.width = ''
    pane.el.style.height = String(dockHeight) + 'px'
    pane.el.style.flexBasis = String(dockHeight) + 'px'
    return
  }
  dockWidth = clampDockSize('right', dockWidth)
  pane.el.style.height = ''
  pane.el.style.width = String(dockWidth) + 'px'
  pane.el.style.flexBasis = String(dockWidth) + 'px'
}

/** 卸载 pane：notify=true 表示由 tty 发起（先通知消费者清理）。 */
function teardownDockPane(notify) {
  const pane = dockPane
  if (pane === null) return
  dockPane = null
  pane.disposed = true
  if (notify && pane.onClose !== null) {
    try {
      pane.onClose()
    } catch (error) {
      // 消费者的清理异常不该拖垮终端面板（面板照常关）
      console.warn('[dsh-tty] ttyPanel.onClose 抛错：' + (error instanceof Error ? error.message : String(error)))
    }
  }
  try {
    pane.el.remove()
  } catch {
    /* 忽略 */
  }
  // 摘掉方向标记：下一个 pane 可能挂在另一侧
  if (workEl !== null) delete workEl.dataset.side
}

/**
 * 挂一个 pane。options：
 *   title（标题）· hint（标题右侧灰字）· side（'right' 默认 | 'bottom'）·
 *   size（初始尺寸 px：右侧 = 宽度，底部 = 高度）· min（最小尺寸 px）·
 *   ownerSid（归属标签：省略 = 当前活动标签，null = 不隶属任何标签）·
 *   onClose（被 tty 收掉时的回调）
 * 返回 handle：element（消费者 render 的宿主）· setTitle / setHint ·
 *   expand / collapse / toggle / isCollapsed · dispose()。
 *
 * 方向按内容形态挑：竖向列表 / 列表+详情（容器面板）用 right；横向宽表（SFTP
 * 文件列表、本地↔远程双栏）用 bottom —— 全宽摆得下更多列，也不挤终端宽度。
 */
function mountDockPane(options) {
  ensureModalVisible()
  if (workEl === null) throw new Error(t('error.panelNotReady'))
  if (dockPane !== null) teardownDockPane(true)
  ensureStyle()

  // 归属标签：默认 = 此刻的活动标签（连接栏 SFTP / dsh-docker 的「容器」都走这条）。
  // ownerSid: null 显式声明「不隶属任何标签」（面板开着但一个标签都没有的入口）。
  const ownerKey = resolveDockOwner(options?.ownerSid, activeSid)

  const side = options?.side === 'bottom' ? 'bottom' : 'right'
  const minSize = Math.max(side === 'bottom' ? 120 : 200, Math.round(typeof options?.min === 'number' && Number.isFinite(options.min) ? options.min : dockMinSize(side)))
  if (typeof options?.size === 'number' && Number.isFinite(options.size)) {
    const wanted = clampDockSize(side, options.size)
    if (side === 'bottom') dockHeight = wanted
    else dockWidth = wanted
  }

  const el = document.createElement('div')
  el.className = 'tt_dockPane'
  el.dataset.side = side
  workEl.dataset.side = side
  el.innerHTML =
    '<div class="tt_dockPaneResize" title="' + (side === 'bottom' ? t('panel.dragHeight') : t('panel.dragWidth')) + '"></div>' +
    '<div class="tt_dockPaneHead">' +
    '<span class="tt_dockPaneTitle"></span>' +
    '<span class="tt_dockPaneHint"></span>' +
    '<span class="tt_dockPaneSpacer"></span>' +
    '<button class="tt_dockPaneFold" type="button"></button>' +
    '<button class="tt_dockPaneClose" type="button" title="' + t('btn.closePane') + '">' + ICON_CLOSE + '</button>' +
    '</div>' +
    '<div class="tt_dockPaneBody"></div>'
  workEl.appendChild(el)

  const titleEl = el.querySelector('.tt_dockPaneTitle')
  const hintEl = el.querySelector('.tt_dockPaneHint')
  const paneBodyEl = el.querySelector('.tt_dockPaneBody')
  const foldEl = el.querySelector('.tt_dockPaneFold')
  const closeEl = el.querySelector('.tt_dockPaneClose')
  const resizeEl = el.querySelector('.tt_dockPaneResize')

  const pane = {
    el,
    element: paneBodyEl,
    disposed: false,
    collapsed: false,
    side,
    minSize,
    /** 归属标签（sid，或「不隶属任何标签」的全局面板）：切换标签时据此显隐，见 syncDockPaneVisibility。 */
    ownerKey,
    onClose: typeof options?.onClose === 'function' ? options.onClose : null,
  }

  const foldIcon = () => {
    if (side === 'bottom') return pane.collapsed ? ICON_UP : ICON_ARROW_DOWN
    return pane.collapsed ? ICON_ARROW_LEFT : ICON_ARROW_RIGHT
  }

  const setCollapsed = (value) => {
    pane.collapsed = value === true
    if (pane.collapsed) el.dataset.collapsed = '1'
    else delete el.dataset.collapsed
    foldEl.innerHTML = foldIcon()
    foldEl.title = pane.collapsed ? t('btn.expandPane') : t('btn.collapsePane')
    foldEl.setAttribute('aria-label', foldEl.title)
    applyDockGeometry()
  }

  pane.setTitle = (text) => { titleEl.textContent = typeof text === 'string' ? text : '' }
  pane.setHint = (text) => { hintEl.textContent = typeof text === 'string' ? text : '' }
  pane.isCollapsed = () => pane.collapsed === true
  pane.collapse = () => setCollapsed(true)
  pane.expand = () => setCollapsed(false)
  pane.toggle = () => setCollapsed(!pane.collapsed)
  pane.dispose = () => {
    if (pane.disposed || dockPane !== pane) return
    teardownDockPane(false)
  }

  // 拖边缘调尺寸（右侧拖左边、底部拖上边）：上限随面板卡片走，拖动期间锁文本选中
  resizeEl.addEventListener('mousedown', (event) => {
    if (event.button !== 0 || pane.collapsed) return
    event.preventDefault()
    const startX = event.clientX
    const startY = event.clientY
    const rect = el.getBoundingClientRect()
    const onMove = (moveEvent) => {
      if (side === 'bottom') {
        dockHeight = clampDockSize('bottom', Math.max(minSize, rect.height + (startY - moveEvent.clientY)))
      } else {
        dockWidth = clampDockSize('right', Math.max(minSize, rect.width + (startX - moveEvent.clientX)))
      }
      applyDockGeometry()
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.userSelect = ''
    }
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  })
  // 双击顶边折叠 / 展开（与 docker 抽屉的手感一致）
  resizeEl.addEventListener('dblclick', () => setCollapsed(!pane.collapsed))
  foldEl.addEventListener('click', () => setCollapsed(!pane.collapsed))
  // ✕：由 tty 收掉并通知消费者（消费者在 onClose 里做自己的清理）
  closeEl.addEventListener('click', () => teardownDockPane(true))

  pane.setTitle(typeof options?.title === 'string' ? options.title : '')
  pane.setHint(typeof options?.hint === 'string' ? options.hint : '')
  setCollapsed(options?.collapsed === true)
  dockPane = pane
  // setCollapsed 里的 applyDockGeometry 此时还没认领到 pane：挂上后再落一次宽度
  applyDockGeometry()
  // 归属别的标签时挂完就收起（消费方照样 render，只是先看不见）
  syncDockPaneVisibility()
  return pane
}

/**
 * 让挂载位跟着活动标签走（0.18.4）：归属当前标签（或全局）时显示，否则整块收起。
 *
 * 只改显隐（`data-dock-hidden`）与 `.tt_work` 的排布方向，**不动 DOM、不碰消费者状态**
 * ——隐藏期间消费方的 React 树 / 在途传输都保活，切回该标签即恢复现场。终端区尺寸
 * 变化由既有的 ResizeObserver 接住，自动 refit 并把新行列数同步给 PTY。
 */
function syncDockPaneVisibility() {
  const pane = dockPane
  if (pane === null) return
  if (dockPaneVisible(pane.ownerKey, activeSid)) {
    delete pane.el.dataset.dockHidden
    if (workEl !== null) workEl.dataset.side = pane.side
    return
  }
  pane.el.dataset.dockHidden = '1'
  // 没有可见的 pane 时不留方向标记：否则终端区空着还按 column 排版
  if (workEl !== null) delete workEl.dataset.side
}

function switchTab(sid) {
  const tab = tabs.get(sid)
  if (tab === undefined) return
  // 嵌入会话不是标签页（0.19.0）：不进标签栏、由挂载方控制显隐——
  // 拒绝把它设为 activeSid（否则面板空白、连接栏描述一个看不见的会话）
  if (tab.embedded === true) return
  activeSid = sid
  for (const [otherSid, other] of tabs) {
    // 嵌入终端的显隐由挂载方（抽屉/面板）决定，这里不碰
    if (other.embedded === true) continue
    if (other.termEl !== null) other.termEl.style.display = otherSid === sid ? '' : 'none'
  }
  if (tab.embedded !== true && bodyEl !== null && tab.termEl !== null && tab.termEl.parentElement !== bodyEl) {
    bodyEl.appendChild(tab.termEl)
  }
  // 状态条跟随活动标签：先对齐订阅（宿主懒启动采集），再按已有数据显示/收起
  syncStatsSubscription()
  applyStatsBar()
  renderTabbar()
  renderConnbar()
  // 挂载位跟着标签走：SFTP 文件浏览 / 容器面板都是连接级的（凭证 / 目标来自打开它的
  // 那个标签），切到别的标签必须收起——否则标题写着 A、底下标签是 B，最坏会往错主机上传
  syncDockPaneVisibility()
  try {
    tab.fit.fit()
  } catch {
    /* 忽略 */
  }
  if (tab.spawned && !tab.exited) {
    sendResize(tab)
  }
  showTabOverlay(tab, tab.exited ? t('status.exited') : '', tab.exited ? t('btn.clickReopen') : '', 'exited')
  // 胶囊跟着活动标签走：上一个标签留下的错误（如 SSH 握手超时）不该跟着切过来
  syncStatusToActiveTab()
}

/**
 * 标签状态点轻量刷新：只更新 dot 的颜色（ready/exit/error 时调用），
 * 避免整把重建 tabbar 打断正在进行的双击重命名。
 */
function refreshTabDot(sid) {
  if (tabbarEl === null) return
  const tab = tabs.get(sid)
  if (tab === undefined) return
  const btn = tabbarEl.querySelector(`[data-sid="${sid}"]`)
  const dot = btn?.querySelector('.tt_tabDot')
  if (dot === undefined || dot === null) return
  dot.dataset.state = tab.exited ? 'exited' : tab.live === true ? 'connected' : tab.errored === true ? 'error' : 'connecting'
}

let tabbarRenderPending = false
function renderTabbar() {
  if (tabbarEl === null) return
  // 行内重命名进行中延后重建（0.19.0）：ready 帧等触发的全量重建会移除正在
  // 输入的 .tt_tabRename，未提交文本直接丢失；重命名结束后的下一次调用补上
  if (tabbarEl.querySelector('.tt_tabRename') !== null) {
    if (!tabbarRenderPending) {
      tabbarRenderPending = true
      setTimeout(() => {
        tabbarRenderPending = false
        renderTabbar()
      }, 1000)
    }
    return
  }
  tabbarEl.textContent = ''
  for (const [sid, tab] of tabs) {
    if (tab.embedded === true) continue // 嵌入终端不进标签栏
    const btn = document.createElement('button')
    btn.className = 'tt_tab'
    btn.dataset.sid = sid
    if (sid === activeSid) btn.dataset.active = ''
    // 标签状态点：与连接栏状态点同语义（连接中 / 活跃 / 出错 / 已退出）
    const dotEl = document.createElement('span')
    dotEl.className = 'tt_tabDot'
    dotEl.dataset.state = tab.exited ? 'exited' : tab.live === true ? 'connected' : tab.errored === true ? 'error' : 'connecting'
    btn.appendChild(dotEl)
    // 标签标题：SSH 标签用 label（连接名 / target），本地标签用「终端 N」
    const labelEl = document.createElement('span')
    labelEl.className = 'tt_tabLabel'
    labelEl.textContent = tab.label || t('panel.tabLabel', { n: tabCounterLabel(sid) })
    // 双击重命名：行内 input，Enter/失焦提交（空还原），Esc 取消
    labelEl.addEventListener('dblclick', (event) => {
      event.stopPropagation()
      startTabRename(sid, btn)
    })
    const closeEl = document.createElement('span')
    closeEl.className = 'tt_tabClose'
    closeEl.title = t('btn.close')
    closeEl.textContent = '✕'
    // 键盘可达（0.19.0）：✕ 此前只能鼠标点（tab 本身的 Enter 走 switchTab）
    closeEl.setAttribute('role', 'button')
    closeEl.setAttribute('aria-label', t('btn.closeTabAria', { label: tab.label || '' }))
    closeEl.tabIndex = 0
    closeEl.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
        event.preventDefault()
        event.stopPropagation()
        closeTab(sid)
      }
    })
    btn.title = labelEl.textContent
    btn.appendChild(labelEl)
    btn.appendChild(closeEl)
    btn.addEventListener('click', (event) => {
      if (event.target.closest('.tt_tabClose') !== null) {
        event.stopPropagation()
        closeTab(sid)
        return
      }
      switchTab(sid)
    })
    tabbarEl.appendChild(btn)
  }
  // 活动标签滚进视野：标签多了以后它可能被挤在可视区外，而「切过去了但看不见」比没切更迷惑。
  // block/inline 都用 nearest → 已经可见时**不动**，所以不会跟用户的手动滚动打架。
  const activeEl = tabbarEl.querySelector('[data-active]')
  if (activeEl !== null && typeof activeEl.scrollIntoView === 'function') {
    activeEl.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }
  const add = document.createElement('button')
  add.className = 'tt_tabAdd'
  add.title = t('btn.newTab')
  add.innerHTML = ICON_PLUS
  add.addEventListener('click', () => {
    openAddMenu(add)
  })
  tabbarEl.appendChild(add)
}

/* ================================ 连接栏 ================================ */

/** 隧道规则展示（与设置卡片同语义的轻量副本，供连接栏弹层使用）。 */
function tunnelRuleText(tunnel) {
  return tunnel?.direction === 'remote'
    ? t('meta.tunnelRemote', { host: tunnel.remoteHost || '127.0.0.1', port: String(tunnel.remotePort ?? 0), local: String(tunnel.localTargetPort ?? 0) })
    : t('meta.tunnelLocal', { local: String(tunnel?.localPort ?? 0), host: tunnel?.remoteHost ?? '?', port: String(tunnel?.remotePort ?? 0) })
}

/**
 * 连接栏（仅 SSH 标签显示，本地终端 / 无会话时整栏隐藏，会话退出等状态由
 * 终端体内遮罩表达）：左侧状态点 + 目标（user@host:port / 连接名），右侧
 * 扩展按钮区（图标 + 文字）——SFTP（复用该标签的连接规格，凭证不重复录入）
 * 与 隧道 N（有启用隧道时，弹层看实时状态）；已退出标签放「重新打开」。
 * 随 switchTab 与会话状态事件刷新。
 */
function renderConnbar() {
  if (connbarEl === null || connTargetEl === null || connActionsEl === null || connDotEl === null) return
  connActionsEl.textContent = ''
  const tab = activeTab()
  const spec = tab?.spawnSpec ?? {}
  if (tab === undefined || spec.t !== 'ssh') {
    connbarEl.dataset.hidden = ''
    return
  }
  delete connbarEl.dataset.hidden
  const port = Number(spec.port)
  // 持久状态徽标：ready.persist=true → 已由 tmux 托管；规格请求了持久但
  // ready 没带（远程无 tmux 降级等）→ 常驻提示「未持久化」，不再只靠 spawn
  // 时的一行灰字（容易滚走被忽略）
  connTargetEl.textContent = typeof tab.target === 'string' && tab.target !== ''
    ? tab.target
    : typeof spec.name === 'string' && spec.name !== ''
      ? spec.name
      : String(spec.username ?? '') + '@' + String(spec.host ?? '') + (Number.isInteger(port) && port !== 22 ? ':' + port : '')
  // 持久状态单独成徽标（不再拼进目标文本里），一眼能分辨「已托管 / 未持久化」
  if (connBadgeEl !== null) {
    if (tab.persistTmux === true) {
      connBadgeEl.textContent = 'tmux'
      connBadgeEl.dataset.state = 'ok'
      connBadgeEl.title = t('status.tmuxPersistedTitle')
    } else if (spec.persist === true && tab.spawned === true) {
      connBadgeEl.textContent = t('status.notPersisted')
      connBadgeEl.dataset.state = 'warn'
      connBadgeEl.title = t('status.tmuxUnavailableTitle')
    } else {
      connBadgeEl.textContent = ''
      delete connBadgeEl.dataset.state
      connBadgeEl.removeAttribute('title')
    }
  }
  const state = tab.exited ? 'exited' : tab.live === true ? 'connected' : tab.errored === true ? 'error' : 'connecting'
  connDotEl.dataset.state = state
  connDotEl.title = state === 'connected' ? t('status.connected') : state === 'connecting' ? t('status.connecting') : state === 'error' ? t('status.errored') : t('status.exited')
  const action = (icon, label, title, onClick) => {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'tt_toolBtn tt_connAct'
    btn.title = title
    // icon 为内置图标常量，label 文本走 textContent（用户数据不进 innerHTML）
    btn.innerHTML = icon + '<span></span>'
    btn.lastElementChild.textContent = label
    btn.addEventListener('click', onClick)
    connActionsEl.appendChild(btn)
  }
  /*
   * 命令标签（spawnSpec.command 非空）不展示扩展按钮区。
   *
   * 那些扩展都作用于**连接本身**：SFTP 浏览这条连接、隧道状态、第三方注册的面板（如
   * dsh-docker 的容器面板）。而命令标签的语义是「在那条连接上跑一条命令」——给它挂上
   * SFTP 只会误导：用户以为在看容器里的文件，实际浏览的是宿主机。内置动作与第三方动作
   * 走同一个工厂集合，所以拦住这一处即全覆盖。
   *
   * 退出态的重开入口**不靠这里**：终端体内的浮层本来就有「点击重新打开」。
   *
   * 判据用 spawnSpec.command，而不是新加一个标签字段：command 已经跟着标签持久化、规格
   * 留存、刷新恢复、tmux 重跑全链路走；新字段只活在内存里，刷新一次按钮就又冒出来了。
   */
  if (typeof spec.command === 'string' && spec.command !== '') return
  // 内置动作与第三方扩展同一通道（见文件上方 connbarActions）；单个工厂抛错只记
  // 日志，不影响连接栏与其他按钮
  const bookName = typeof spec.name === 'string' ? spec.name : ''
  for (const factory of connbarActions) {
    try {
      factory({ tab, spec, bookName, addAction: action })
    } catch (error) {
      console.warn('[dsh-tty] connbar action failed: ' + (error instanceof Error ? error.message : String(error)))
    }
  }
}

/**
 * 连接栏「⋯」更多菜单。
 *
 * 目前只有一个条目（端口转发），但它是**低频入口**的落脚点：连接栏宽度优先给标签条，
 * 常驻按钮只留高频项（SFTP / 容器 / 已有隧道）。后续再有低频动作也加在这里，别再往
 * 连接栏上堆。
 */
function openConnbarMoreMenu(anchor, bookName) {
  if (connbarMoreEl !== null) {
    closeConnbarMoreMenu()
    return
  }
  const menu = document.createElement('div')
  menu.className = 'tt_addMenu tt_connMore'
  connbarMoreEl = menu
  // 不给"跳转设置卡片"的假按钮：宿主没有开放程序化导航到设置面板的接口（实测
  // dsh-client-ui-settings 没有暴露 openSettings / 路由 hash），做了也只能是个不动的
  // 按钮。改成**把路径写清楚**——用户照着一句话就能找到，比一个点了没反应的跳转强。
  addMenuItem(menu, t('panel.tunnels'), t('hint.tunnelsSettings'), () => {
    closeConnbarMoreMenu()
    openTunnelPopover(anchor, bookName)
  }, undefined, ICON_TUNNEL)
  document.body.appendChild(menu)
  const rect = anchor.getBoundingClientRect()
  const width = menu.offsetWidth
  const preferRight = rect.left + width > window.innerWidth - 8
  const left = preferRight ? rect.right - width : rect.left
  menu.style.left = Math.max(8, Math.min(left, window.innerWidth - width - 8)) + 'px'
  menu.style.top = rect.bottom + 6 + 'px'
  const onDocMouseDown = (event) => {
    if (connbarMoreEl !== menu) return
    if (menu.contains(event.target) || anchor.contains(event.target)) return
    closeConnbarMoreMenu()
  }
  connbarMoreDismiss = onDocMouseDown
  setTimeout(() => document.addEventListener('mousedown', onDocMouseDown, true), 0)
}

function closeConnbarMoreMenu() {
  if (connbarMoreDismiss !== null) {
    document.removeEventListener('mousedown', connbarMoreDismiss, true)
    connbarMoreDismiss = null
  }
  if (connbarMoreEl !== null) {
    connbarMoreEl.remove()
    connbarMoreEl = null
  }
}

let tunnelPopoverEl = null
let tunnelPopoverDismiss = null
/** 连接栏「⋯」更多菜单的元素与外部点击卸载回调（同 tunnelPopover 的两件套）。 */
let connbarMoreEl = null
let connbarMoreDismiss = null

function closeTunnelPopover() {
  if (tunnelPopoverDismiss !== null) {
    document.removeEventListener('mousedown', tunnelPopoverDismiss, true)
    tunnelPopoverDismiss = null
  }
  if (tunnelPopoverEl !== null) {
    tunnelPopoverEl.remove()
    tunnelPopoverEl = null
  }
}

/** 隧道状态弹层：该连接簿条目的启用隧道 + 实时状态（编辑仍在设置卡片）。 */
function openTunnelPopover(anchor, bookName) {
  if (tunnelPopoverEl !== null) {
    closeTunnelPopover()
    return
  }
  const pop = document.createElement('div')
  pop.className = 'tt_tunnelPop'
  const title = document.createElement('div')
  title.className = 'tt_tunnelPopTitle'
  title.textContent = t('panel.tunnelsFor', { name: bookName })
  pop.appendChild(title)
  const listEl = document.createElement('div')
  listEl.textContent = t('list.loading')
  pop.appendChild(listEl)
  const hint = document.createElement('span')
  hint.className = 'tt_cardHint'
  hint.textContent = t('hint.tunnelsCard')
  pop.appendChild(hint)
  document.body.appendChild(pop)
  tunnelPopoverEl = pop
  const rect = anchor.getBoundingClientRect()
  pop.style.top = String(rect.bottom + 6) + 'px'
  pop.style.left = String(Math.max(8, rect.right - 340)) + 'px'
  const onDocMouseDown = (event) => {
    if (tunnelPopoverEl !== pop) return
    if (pop.contains(event.target) || anchor.contains(event.target)) return
    closeTunnelPopover()
  }
  tunnelPopoverDismiss = onDocMouseDown
  setTimeout(() => document.addEventListener('mousedown', onDocMouseDown, true), 0)
  void (async () => {
    let statusList = []
    try {
      const res = await fetch('/api/dsh-tty/tunnels', { cache: 'no-store' })
      const data = await res.json()
      if (data.ok && Array.isArray(data.tunnels)) statusList = data.tunnels
    } catch {
      /* 状态获取失败：按无状态渲染 */
    }
    if (tunnelPopoverEl !== pop) return // 弹层已被关闭
    listEl.textContent = ''
    const mine = tunnelsCache.filter((tunnel) => tunnel?.bookName === bookName && tunnel?.enabled !== false)
    if (mine.length === 0) {
      const empty = document.createElement('span')
      empty.className = 'tt_cardHint'
      empty.textContent = t('list.noActiveTunnels')
      listEl.appendChild(empty)
      return
    }
    for (const tunnel of mine) {
      const st = statusList.find((s) => s?.name === tunnel?.name)
      const state = st?.state ?? 'stopped'
      const row = document.createElement('div')
      row.className = 'tt_tunnelPopRow'
      const dot = document.createElement('span')
      dot.className = 'tt_connDot'
      dot.dataset.state = state === 'active' ? 'connected' : state === 'error' ? 'error' : 'connecting'
      const text = document.createElement('span')
      text.className = 'tt_connTarget'
      text.title = String(st?.error ?? st?.lastForwardError ?? '')
      // fatal（本地监听失败等）不会自愈：只写 state 会让人一直等「连接中」（D58）
      text.textContent = tunnelRuleText(tunnel) + ' · ' + state + (st?.fatal === true ? t('status.fatalSuffix') : '')
      row.appendChild(dot)
      row.appendChild(text)
      listEl.appendChild(row)
    }
  })()
}

/** 标签显示序号（按创建顺序，简化：Map 序 +1）。 */
function tabCounterLabel(sid) {
  let index = 1
  for (const key of tabs.keys()) {
    if (key === sid) return String(index)
    index += 1
  }
  return String(index)
}

/** 行内重命名标签：Enter/失焦提交（空则还原默认），Esc 取消；写回持久化。 */
function startTabRename(sid, tabBtn) {
  const tab = tabs.get(sid)
  if (tab === undefined || tabBtn.querySelector('.tt_tabRename') !== null) return
  const labelEl = tabBtn.querySelector('.tt_tabLabel')
  if (labelEl === null) return
  const input = document.createElement('input')
  input.className = 'tt_tabRename'
  input.value = tab.label || t('panel.tabLabel', { n: tabCounterLabel(sid) })
  labelEl.replaceWith(input)
  input.focus()
  input.select()
  let done = false
  const commit = () => {
    if (done) return
    done = true
    const value = input.value.trim()
    tab.label = value !== '' ? value : undefined
    renderTabbar()
    persistTabs()
  }
  const cancel = () => {
    if (done) return
    done = true
    renderTabbar()
  }
  input.addEventListener('keydown', (event) => {
    event.stopPropagation()
    if (event.key === 'Enter') commit()
    else if (event.key === 'Escape') cancel()
  })
  input.addEventListener('blur', commit)
  input.addEventListener('click', (event) => event.stopPropagation())
}

/* ============================ 「+」菜单 / SSH 连接 ============================ */

/** 连接簿缓存同步：config 快照里带 sshHosts 时整体覆盖（设置卡片保存后也走这里）。 */
let tunnelsCache = []
/** SFTP 界面风格缓存（dialog 单窗体 / dual 双栏）：config 快照与设置保存同步。 */
let sftpStyleCache = 'dialog'
/** 会话持久化模式缓存（off / tmux）：config 快照与设置保存同步，控制「+」菜单与 SSH 对话框的持久入口。 */
let persistenceCache = 'off'
/** SFTP 传输限制缓存（0 = 不限）：跟随 config 快照，浏览器侧执行。 */
let sftpLimitsCache = { maxDownloadMb: 1024, maxUploadMb: 2048, maxUploadFiles: 1000 }
/** 宿主并发会话上限与最近一次查询的存活会话数（新增标签的前置校验用）。 */
let maxSessionsCache = null
/**
 * ProxyCommand 闸门缓存（默认关）：config 快照与设置保存同步。
 *
 * 用途只有一个——SSH 对话框里如实说明这条字段**现在生效不生效**（关着时配了也不会执行，
 * 试连会点名开关）。它**不是**安全边界：真正的闸门在宿主侧（关着时连接明确失败）。
 */
let allowProxyCommandCache = false
let liveSessionCount = null
/* ============================ 入口显隐闸门 ============================ */

/**
 * 侧栏「终端」入口与连接栏内置动作的显隐：config 确认「插件已禁用」
 * （enabled === false）后收起，其余情况（含 config 拉取失败）保持显示——只对
 * 确认禁用收起，避免瞬时故障把没禁用用户的入口藏掉。entryGate 由 apply 挂载
 * 期间注入（null = 已卸载，迟到的缓存刷新不允许再把入口挂回来）。
 */
let entryGate = null
let entryVisible = false

function setEntryVisible(visible) {
  entryVisible = visible
  if (entryGate !== null) entryGate.set(visible)
}

/** 由 config 推进入口显隐：仅「确认 enabled:false」收起；顺带热生效状态条开关。 */
function syncEntryFromConfig(config) {
  setEntryVisible(!(config !== null && typeof config === 'object' && config.enabled === false))
  if (config !== null && typeof config === 'object' && typeof config.statsEnabled === 'boolean' && config.statsEnabled !== statsEnabledCache) {
    statsEnabledCache = config.statsEnabled
    // 热生效：关闭即退订 + 收起（宿主侧同时停表）；打开即重新订阅（幂等）
    syncStatsSubscription()
    applyStatsBar()
  }
}

function syncSshHostsCache(config) {
  syncEntryFromConfig(config)
  if (config !== null && typeof config === 'object' && Array.isArray(config.sshHosts)) {
    sshHostsCache = config.sshHosts
  }
  if (config !== null && typeof config === 'object' && Array.isArray(config.tunnels)) {
    tunnelsCache = config.tunnels
  }
  if (config !== null && typeof config === 'object' && (config.sftpStyle === 'dual' || config.sftpStyle === 'dialog')) {
    sftpStyleCache = config.sftpStyle
  }
  if (config !== null && typeof config === 'object' && (config.persistence === 'tmux' || config.persistence === 'off')) {
    persistenceCache = config.persistence
  }
  if (config !== null && typeof config === 'object' && typeof config.sftpLimits === 'object' && config.sftpLimits !== null) {
    sftpLimitsCache = { ...sftpLimitsCache, ...config.sftpLimits }
  }
  if (config !== null && typeof config === 'object' && Number.isInteger(config.maxSessions) && config.maxSessions >= 1) {
    maxSessionsCache = config.maxSessions
  }
  if (config !== null && typeof config === 'object' && typeof config.allowProxyCommand === 'boolean') {
    allowProxyCommandCache = config.allowProxyCommand
  }
}

/**
 * 轻量 toast 提醒（自动消失）。kind：warn（默认，软性限制）/ error（失败）/
 * info（中性提示）——决定左侧色条与图标，避免把「达到并发上限」这类可继续
 * 操作的提醒渲染成红色报错。
 */
function showToast(text, kind) {
  const level = kind === 'error' || kind === 'info' ? kind : 'warn'
  const toast = document.createElement('div')
  toast.className = 'tt_toast'
  toast.dataset.kind = level
  toast.innerHTML = '<span class="tt_toastIcon">' +
    (level === 'error' ? ICON_STOP : level === 'info' ? ICON_INFO : ICON_WARN) +
    '</span><span class="tt_toastText"></span>'
  toast.lastElementChild.textContent = text
  document.body.appendChild(toast)
  setTimeout(() => toast.remove(), 4000)
}

/** 查询宿主当前存活会话数（sessions 帧）。 */
async function refreshSessionCount() {
  try {
    sendFrame({ t: 'sessions' })
    const frame = await waitFrame('sessions', 3000)
    if (frame !== null && Array.isArray(frame.list)) {
      liveSessionCount = frame.list.length
      return liveSessionCount
    }
  } catch {
    /* 查询失败：保持上次值 */
  }
  return null
}

/**
 * 新增标签的前置校验：达到并发上限时弹 toast 提醒并返回提示文案（调用方
 * 不再创建标签）；未达上限或状态未知（放行，交由宿主兜底）返回 null。
 */
async function sessionLimitNotice() {
  await refreshSessionCount()
  if (maxSessionsCache === null || liveSessionCount === null) return null
  if (liveSessionCount < maxSessionsCache) return null
  // 分账：本窗口标签数可数，其余来自其他窗口/页面（含待恢复会话）
  const ownCount = [...tabs.values()].filter((tab) => !tab.exited).length
  const othersCount = Math.max(0, liveSessionCount - ownCount)
  // 分账里的「其他窗口」是可选的：值进句子中间、影响语序，所以整体交给目录（见 docs/i18n.md）
  const others = othersCount > 0 ? t('msg.maxSessionsOthers', { count: othersCount }) : ''
  const text = t('msg.maxSessions', { live: liveSessionCount, max: maxSessionsCache, own: ownCount, others })
  showToast(text)
  return text
}

/** 是否已知达到上限（菜单置灰用；点击时仍会实时复核）。 */
function atSessionLimit() {
  return maxSessionsCache !== null && liveSessionCount !== null && liveSessionCount >= maxSessionsCache
}

/**
 * 持久标签的 tmux 会话名（客户端生成、随标签规格保存）：重开标签/宿主重启后
 * 携同一名字 spawn，宿主按 `tmux new-session -A -s dsh-<名>` 接回原会话。
 * 只用安全字符集（宿主 sanitizePersistName 校验）。
 */
function newPersistName() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}

/** 连接簿条目名下的启用隧道数（「+」菜单徽标用）。 */
function tunnelCountFor(bookName) {
  return tunnelsCache.filter((tunnel) => tunnel?.bookName === bookName && tunnel?.enabled !== false).length
}

/** 连接簿条目的展示副标题：user@host[:port] · auth[ · fwd]。 */
function sshHostTargetLabel(entry) {
  const port = Number(entry?.port)
  const suffix = Number.isInteger(port) && port !== 22 ? ':' + port : ''
  const auth = entry?.auth === 'key' ? 'key' : entry?.auth === 'password' ? 'password' : 'agent'
  const fwd = entry?.agentForward === true ? ' · fwd' : ''
  return String(entry?.username ?? '') + '@' + String(entry?.host ?? '') + suffix + ' · ' + auth + fwd
}

/** POST /api/dsh-tty/probe 发起一次 SSH 连接测试；返回 result 或 {error}。 */
async function probeSshFetch(spec, bookRecord) {
  const res = await fetch('/api/dsh-tty/probe', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...spec, bookRecord: bookRecord === true }),
  })
  const data = await res.json().catch(() => ({}))
  if (data && data.ok === false && data.error) return { error: String(data.error) }
  if (data && data.result) return { result: data.result }
  return { error: String(data && data.error ? data.error : t('error.probeHttp', { status: res.status })) }
}

/** 把 probe 结果压缩成一行摘要（按钮旁/卡片内提示用）。 */
function probeSummary(probeResult, opts) {
  if (!probeResult) return t('msg.probing')
  const r = probeResult
  const tcpMs = typeof r.tcp?.ms === 'number' ? r.tcp.ms : null
  const authMs = typeof r.auth?.ms === 'number' ? r.auth.ms : null
  const tail = []
  // 有跳板机时 `tcp` 探的就是**跳板机**（目标那一跳不能直连）：先摆它，免得读成「目标 TCP 可达」
  if (r.jump !== null && typeof r.jump === 'object' && typeof r.jump.label === 'string' && r.jump.label !== '') {
    const jumpMs = typeof r.jump.tcp?.ms === 'number' ? r.jump.tcp.ms : null
    const state = r.jump.tcp?.ok ? (jumpMs !== null ? jumpMs + 'ms' : t('meta.reachable')) : t('meta.unreachable')
    tail.push(t('meta.jumpStage', { label: r.jump.label }) + ' ' + state)
  }
  // 代理命令：配了就有这一行（关着时如实说「未启用」，别让人把这句读成网络问题）
  if (r.proxy !== null && typeof r.proxy === 'object') {
    tail.push(r.proxy.active === true ? t('meta.probeProxy') : t('meta.probeProxyOff'))
  }
  if (r.tcp?.ok) tail.push('TCP ' + (tcpMs !== null ? tcpMs + 'ms' : t('meta.reachable')))
  else if (r.tcp?.skipped === true) tail.push(t('meta.probeTcpSkipped'))
  if (r.banner?.ok) tail.push(t('meta.probeBanner'))
  const hk = r.hostkey?.state
  if (hk === 'matched') tail.push(t('meta.hostKeyMatched'))
  else if (hk === 'recorded') tail.push(t('meta.hostKeyRecorded'))
  else if (hk === 'mismatch') tail.push(t('meta.hostKeyMismatch'))
  if (r.auth?.ok) {
    const authText = authMs !== null ? t('meta.authOkMs', { ms: authMs }) : t('meta.authOk')
    return t('meta.probeOk', { detail: authText + (tail.length ? ' · ' + tail.join(' · ') : '') })
  }
  /*
   * 失败原因的选择顺序：auth → tcp（**跳过的 tcp 不算原因**）→ 未知。
   * 跳过那一档必须排除掉：它带着一条说明性 error（「走代理命令，目标不可直连」），
   * 一旦被当成失败原因，用户会拿这句话去排查网络。
   */
  const tcpError = r.tcp?.skipped === true ? '' : r.tcp?.error
  const failed = r.auth?.error || tcpError || t('error.unknown')
  const detail = failed + (tail.length ? ' · ' + tail.join(' · ') : '')
  // `opts.prefix`：调用方要换前缀时用它（现无调用方传值，保留兼容）
  return opts?.prefix !== undefined ? opts.prefix + detail : t('error.probeFailed', { detail })
}

/** 拉取连接簿（失败静默保留旧缓存）；菜单开着时原位刷新条目。 */
async function refreshSshHosts() {
  try {
    const res = await fetch('/api/dsh-tty/config', { cache: 'no-store' })
    const data = await res.json()
    if (data.ok && typeof data.config === 'object' && data.config !== null) {
      const before = sshHostsCache
      syncSshHostsCache(data.config)
      if (addMenuEl !== null && sshHostsCache !== before) renderAddMenuItems(addMenuEl)
    }
  } catch {
    /* 网络失败：保留旧缓存 */
  }
}

function onDocAddMenuMouseDown(event) {
  if (addMenuEl === null) return
  // 点在菜单里或「+」上（由「+」自己 toggle）不收起，其余一律收起
  if (event.target instanceof Element && (addMenuEl.contains(event.target) || event.target.closest('.tt_tabAdd') !== null)) return
  closeAddMenu()
}

/** 标签栏「+」菜单：本地终端 / SSH 连接簿 / SSH 连接…（再点一次「+」收起）。 */
function openAddMenu(anchorBtn) {
  if (addMenuEl !== null) {
    closeAddMenu()
    return
  }
  void refreshSshHosts()
  void refreshSessionCount().then(() => {
    if (addMenuEl !== null) renderAddMenuItems(addMenuEl)
  })
  const menu = document.createElement('div')
  menu.className = 'tt_addMenu'
  addMenuEl = menu
  renderAddMenuItems(menu)
  document.body.appendChild(menu)
  const rect = anchorBtn.getBoundingClientRect()
  const width = menu.offsetWidth
  const preferRight = rect.left + width > window.innerWidth - 8
  const left = preferRight ? rect.right - width : rect.left
  menu.style.left = Math.max(8, Math.min(left, window.innerWidth - width - 8)) + 'px'
  menu.style.top = rect.bottom + 6 + 'px'
  document.addEventListener('mousedown', onDocAddMenuMouseDown, true)
}

function closeAddMenu() {
  if (addMenuEl === null) return
  document.removeEventListener('mousedown', onDocAddMenuMouseDown, true)
  addMenuEl.remove()
  addMenuEl = null
}

function addMenuItem(menu, label, sub, onClick, disabled, icon) {
  const item = document.createElement('button')
  item.type = 'button'
  item.className = 'tt_addMenuItem'
  if (disabled === true) {
    // 不用原生 disabled：禁用按钮不派发点击事件，用户点了没有任何反馈；
    // 视觉置灰 + 可点击 → 点击时弹 toast 说明
    item.setAttribute('data-soldout', '')
    item.title = t('btn.maxSessionsTitle')
  }
  if (icon !== undefined) {
    const iconEl = document.createElement('span')
    iconEl.className = 'tt_addMenuIcon'
    iconEl.innerHTML = icon
    item.appendChild(iconEl)
  }
  const text = document.createElement('span')
  text.className = 'tt_addMenuText'
  const main = document.createElement('span')
  main.className = 'tt_addMenuMain'
  main.textContent = label
  text.appendChild(main)
  if (sub !== '') {
    const subEl = document.createElement('span')
    subEl.className = 'tt_addMenuSub'
    subEl.textContent = sub
    text.appendChild(subEl)
  }
  item.appendChild(text)
  item.addEventListener('click', onClick)
  menu.appendChild(item)
}

function renderAddMenuItems(menu) {
  menu.textContent = ''
  const atLimit = atSessionLimit()
  addMenuItem(menu, t('option.localTerminal'), persistenceCache === 'tmux' ? t('hint.tmuxHosted') : t('hint.openInSessionCwd'), async () => {
    if (await sessionLimitNotice()) return
    closeAddMenu()
    addTab()
  }, atLimit, TERMINAL_ICON)
  const sep1 = document.createElement('div')
  sep1.className = 'tt_addMenuSep'
  menu.appendChild(sep1)
  const bookTitle = document.createElement('div')
  bookTitle.className = 'tt_addMenuTitle'
  bookTitle.textContent = t('panel.sshBook')
  menu.appendChild(bookTitle)
  for (const entry of sshHostsCache) {
    if (entry === null || typeof entry !== 'object' || typeof entry.name !== 'string' || entry.name === '') continue
    // 条目行 = 连接项（点击连接）+ ✎ 编辑（打开对话框编辑模式）
    const rowEl = document.createElement('div')
    rowEl.className = 'tt_addMenuRow'
    const item = document.createElement('button')
    item.type = 'button'
    item.className = 'tt_addMenuItem'
    if (atLimit) {
      item.setAttribute('data-soldout', '')
      item.title = t('btn.maxSessionsTitle')
    }
    const iconEl = document.createElement('span')
    iconEl.className = 'tt_addMenuIcon'
    iconEl.innerHTML = ICON_SERVER
    const text = document.createElement('span')
    text.className = 'tt_addMenuText'
    const main = document.createElement('span')
    main.className = 'tt_addMenuMain'
    main.textContent = entry.name
    const sub = document.createElement('span')
    sub.className = 'tt_addMenuSub'
    const tunnelCount = tunnelCountFor(entry.name)
    const jumpHintText = formatJumpShorthand(entry.jump)
    sub.textContent = sshHostTargetLabel(entry)
      + (jumpHintText === '' ? '' : ' ' + t('meta.viaJump', { label: jumpHintText }))
      // 代理命令：只标「有没有配」，不回显命令原文（可能含凭据，且它本来就长）
      + (typeof entry.proxyCommand === 'string' && entry.proxyCommand.trim() !== '' ? ' ' + t('meta.viaProxy') : '')
      + (tunnelCount > 0 ? ' · ⇄' + String(tunnelCount) : '')
    text.appendChild(main)
    text.appendChild(sub)
    item.appendChild(iconEl)
    item.appendChild(text)
    item.addEventListener('click', async () => {
      if (await sessionLimitNotice()) return
      closeAddMenu()
      // 持久化：全局开关是总闸，条目级 persist 是**取消项**——显式取消过（false）的条目不再托管，
      // 其余（true / 没写过）跟随全局。没写过这个字段的条目同样跟随全局，导入条目因此不受影响。
      const persistSpec = persistenceCache === 'tmux' && entry.persist !== false
        ? { persist: true, persistName: newPersistName() }
        : {}
      addTab({ t: 'ssh', name: entry.name, ...persistSpec }, entry.name)
    })
    const browse = document.createElement('button')
    browse.type = 'button'
    browse.className = 'tt_addMenuEdit'
    browse.title = t('btn.sftpFileBrowse')
    browse.innerHTML = ICON_FOLDER
    browse.addEventListener('click', () => {
      closeAddMenu()
      // 归属当前活动标签（与连接栏那条同一个规则）：切走收起、切回恢复。这里刻意不传
      // null —— 面板明明在眼前却「切了标签也不跟着走」，正是用户报的那个 bug
      openSftpBrowser({ name: entry.name })
    })
    const edit = document.createElement('button')
    edit.type = 'button'
    edit.className = 'tt_addMenuEdit'
    edit.title = t('btn.editConnection')
    edit.innerHTML = ICON_EDIT
    edit.addEventListener('click', () => {
      closeAddMenu()
      openSshDialog(entry)
    })
    rowEl.appendChild(item)
    rowEl.appendChild(browse)
    rowEl.appendChild(edit)
    menu.appendChild(rowEl)
  }
  if (sshHostsCache.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'tt_addMenuTitle'
    empty.textContent = t('list.emptySshBook')
    menu.appendChild(empty)
  }
  const sep2 = document.createElement('div')
  sep2.className = 'tt_addMenuSep'
  menu.appendChild(sep2)
  addMenuItem(menu, t('option.sshConnect'), t('hint.sshConnect'), () => {
    closeAddMenu()
    openSshDialog()
  }, false, ICON_KEY)
}

/**
 * SSH 连接对话框：host/port/username/auth（agent/key/password，key 附
 * keyPath/passphrase，password 附密码）+「保存到连接簿」与名称。传入 entry
 * 时为编辑模式（「+」菜单 ✎ 进入）：预填全字段，出现「保存修改」按钮
 * （按原始名称替换条目，支持改名），连接按钮照常可用。
 * 字段全部用 DOM API 创建与取值，用户输入不经过 innerHTML。
 */
function openSshDialog(entry) {
  if (sshDialogEl !== null) return
  const editing = entry !== null && typeof entry === 'object' ? entry : null
  const isEdit = editing !== null
  const backdrop = document.createElement('div')
  backdrop.className = 'tt_sshBackdrop'
  const card = document.createElement('div')
  card.className = 'tt_sshCard'

  const title = document.createElement('div')
  title.className = 'tt_sshTitle'
  title.innerHTML = ICON_KEY + '<span></span>'
  title.lastElementChild.textContent = isEdit ? t('panel.editConnection', { name: String(editing.name ?? '') }) : t('panel.sshConnect')
  card.appendChild(title)

  /** 表单分组小标题：把「连接 / 认证 / 选项」三段分开，长表单不再糊成一片。 */
  const sectionLabel = (text) => {
    const el = document.createElement('div')
    el.className = 'tt_sshSection'
    el.textContent = text
    return el
  }

  const fields = {}
  const fieldRow = (key, labelText, options) => {
    const row = document.createElement('label')
    row.className = 'tt_sshRow'
    const label = document.createElement('span')
    label.className = 'tt_cardLabel'
    label.textContent = labelText
    row.appendChild(label)
    let input
    if (options?.select !== undefined) {
      input = document.createElement('select')
      for (const option of options.select) {
        const optionEl = document.createElement('option')
        optionEl.value = option.value
        optionEl.textContent = option.label
        input.appendChild(optionEl)
      }
    } else {
      input = document.createElement('input')
      input.type = options?.type ?? 'text'
      input.placeholder = options?.placeholder ?? ''
    }
    input.className = 'tt_cardInput'
    input.autocomplete = 'off'
    input.spellcheck = false
    row.appendChild(input)
    fields[key] = input
    return row
  }

  card.appendChild(sectionLabel(t('section.connection')))
  const grid = document.createElement('div')
  grid.className = 'tt_sshGrid'
  grid.appendChild(fieldRow('host', t('field.host'), { placeholder: t('placeholder.host') }))
  grid.appendChild(fieldRow('port', t('field.port'), { placeholder: '22' }))
  card.appendChild(grid)
  card.appendChild(fieldRow('username', t('field.username'), { placeholder: 'root' }))
  card.appendChild(sectionLabel(t('section.auth')))
  card.appendChild(fieldRow('auth', t('field.authMethod'), {
    select: [
      { value: 'agent', label: t('option.authAgent') },
      { value: 'key', label: t('option.authKey') },
      { value: 'password', label: t('option.authPassword') },
    ],
  }))
  const keyRow = fieldRow('keyPath', t('field.keyPath'), { placeholder: '~/.ssh/id_ed25519' })
  const passphraseRow = fieldRow('passphrase', t('field.passphrase'), { type: 'password' })
  const passwordRow = fieldRow('password', t('field.password'), { type: 'password' })

  /**
   * 凭据引用选择器：筛选框 + 限高滚动列表（候选 = 凭据存储里的引用名 ∪ 连接簿里在用的
   * 引用名，见下面的 applyCredentialNames）。点击项填入 env:NAME——目标为空或已是
   * env: 引用时直接替换；有手输内容时首击只进确认态（4s 复位），再击才覆盖（密码框是
   * 掩码显示，不该被一次误点静默清空）。
   *
   * **构造时这一行不显形**（filter 与 emptyEl 都 hidden）：候选要先问一次宿主，拿到答复后
   * 由 `setNames` 一次定稿。所以调用方**必须调用一次 setNames**（宿主失败也要调，传空数组），
   * 否则这一行永远不出现。
   *
   * **零候选时这一行整体退化成一行说明**（文案由调用方给 `emptyHint`：密码那行的上方有
   * 勾选框可以新建，口令那行没有，措辞不一样）。为什么必须退化：那时摆一个永远点不开的
   * 输入框，看着就像坏了。
   */
  const envSelectRow = (targetInput, emptyHint) => {
    const row = document.createElement('div')
    row.className = 'tt_sshRow tt_envRow'
    const filter = document.createElement('input')
    filter.type = 'text'
    filter.className = 'tt_cardInput'
    filter.placeholder = t('placeholder.credRef')
    filter.title = t('hint.credRefCandidates')
    filter.autocomplete = 'off'
    filter.spellcheck = false
    // 零候选时顶替筛选框的那行说明（显隐见 setNames）
    const emptyEl = document.createElement('span')
    emptyEl.className = 'tt_cardHint tt_envEmpty'
    emptyEl.textContent = emptyHint
    emptyEl.hidden = true
    // 初始两者都不显形：候选要先问一次宿主（存储里的名字），拿到答复后由 setNames 一次定稿——
    // 免得先闪一下"零候选"的说明、或先出现一个点不开的输入框。
    filter.hidden = true
    const list = document.createElement('div')
    list.className = 'tt_envList'
    // 默认收起：只在筛选框获得焦点时展开，避免对话框被一长条变量清单撑长
    list.dataset.hidden = ''
    let names = []
    const renderList = () => {
      list.textContent = ''
      if (names.length === 0) {
        // 正常路径走不到这里（零候选时列表不展开，说明由 emptyEl 承担）；留着当兜底
        const hint = document.createElement('span')
        hint.className = 'tt_cardHint'
        hint.textContent = emptyHint
        list.appendChild(hint)
        return
      }
      const kw = filter.value.trim().toUpperCase()
      const hit = kw === '' ? names : names.filter((name) => name.toUpperCase().includes(kw))
      for (const name of hit.slice(0, 30)) {
        const item = document.createElement('button')
        item.type = 'button'
        item.className = 'tt_envItem'
        item.textContent = name
        const ref = 'env:' + name
        let confirmTimer = null
        const disarm = () => {
          if (confirmTimer !== null) {
            clearTimeout(confirmTimer)
            confirmTimer = null
          }
          item.textContent = name
          delete item.dataset.danger
        }
        // 按下不抢焦点：列表在 blur 时收起，否则点击项会被 display:none 吃掉
        item.addEventListener('mousedown', (event) => event.preventDefault())
        item.addEventListener('click', () => {
          const current = targetInput.value
          if (current === '' || current.startsWith('env:') || confirmTimer !== null) {
            disarm()
            targetInput.value = ref
            targetInput.focus()
            // 程序性赋值**不会**触发 change（浏览器的 dirty flag 只认用户输入），所以手动派一次：
            // 密码框上挂着「凭据存储」那一行的 refresh —— 选完引用要立刻从"勾选框"换成
            // "已存入 · 引用名"，否则勾选框会一直留在那儿、看着像"两件事都会发生"。
            targetInput.dispatchEvent(new Event('change'))
            return
          }
          item.textContent = t('list.credOverwrite', { name })
          item.dataset.danger = ''
          confirmTimer = setTimeout(disarm, 4000)
        })
        list.appendChild(item)
      }
      if (hit.length > 30) {
        const more = document.createElement('span')
        more.className = 'tt_envMore'
        more.textContent = t('list.moreMatches', { count: hit.length - 30 })
        list.appendChild(more)
      } else if (hit.length === 0) {
        const none = document.createElement('span')
        none.className = 'tt_envMore'
        none.textContent = t('list.noCredRef')
        list.appendChild(none)
      }
    }
    filter.addEventListener('input', renderList)
    filter.addEventListener('focus', () => {
      // 一个候选都没有时不展开（那时这一行已经换成 emptyEl 说明，见 setNames）：
      // 展开只会盖住下面的内容，而列表里没东西可点。
      if (names.length > 0) delete list.dataset.hidden
    })
    filter.addEventListener('blur', () => {
      if (filter.value.trim() === '') list.dataset.hidden = ''
    })
    row.appendChild(filter)
    row.appendChild(emptyEl)
    row.appendChild(list)
    return {
      row,
      setNames(next) {
        names = Array.isArray(next) ? next : []
        // 零候选 = 这行退化成说明行：筛选框收起来，别摆一个点不开的下拉
        const hasNames = names.length > 0
        filter.hidden = !hasNames
        emptyEl.hidden = hasNames
        renderList()
      },
    }
  }
  /**
   * 「凭据存储」那一行：状态 + 存入 / 清除。
   *
   * 模型与**官方的设置卡片**一致（`ctx.remote.credentials`）：值**永不回显**——只有 describe
   * 给的 configured / writable / source；而**引用是可见的**，存完字段里就是 `env:NAME`，
   * 用户看得见发生了什么、也能直接改名字。
   *
   * 因为保存 / 试连 / 连接读的都是 `fields.*.value`，把字段换成引用之后下游一行都不用动。
   */
  /**
   * 「保存时存入凭据存储」那一行。
   *
   * 交互刻意压到**明文态只有一行**：一个勾选框 + （有引用时才出现的）清除按钮与状态。
   * 「存入」不再是一个独立动作——它跟着「保存修改 / 连接（并保存）」一起发生，省掉一次点击，
   * 也不会出现"存了但没保存"的悬空引用。勾选框的 title 里写清边界，正文不再铺三行说明。
   *
   * **默认勾选**（宿主提供 remote.credentials 时；服务缺位则拨回未勾 + 禁用）：明文密码存进
   * 凭据存储比写进设置文件更好——设置会被送到浏览器，凭据存储的值永不回传。
   *
   * 模型与**官方的设置卡片**一致（`ctx.remote.credentials`）：值永不回显，只有 describe 给的
   * configured / writable / source；**引用是可见的**，存完字段里就是 `env:NAME`。
   */
  const credentialRow = (input, suffix) => {
    const row = document.createElement('div')
    row.className = 'tt_sshRow tt_credRow'
    const toggle = document.createElement('label')
    toggle.className = 'tt_credToggle'
    const remember = document.createElement('input')
    remember.type = 'checkbox'
    remember.className = 'tt_cardCheckbox'
    const rememberText = document.createElement('span')
    // 与**下面**的选择器是二选一：这个把刚输的明文存成新名字，那个选一个已有的名字。
    // 顺序上勾选框在前——因为选择器的下拉是向下展开的，放它在上面才不会盖住这一行。
    rememberText.textContent = t('check.rememberCredential')
    toggle.appendChild(remember)
    toggle.appendChild(rememberText)
    // **默认勾上**：输一个明文密码再保存时，值进凭据存储、字段里只留引用——这比把它明文写进
    // 设置文件更好（设置会被送到浏览器，凭据存储的值永不回传）。两个前提：
    //   · 宿主得真的提供 remote.credentials：没有的话勾着只会让保存被 storeIfRequested 的错误
    //     挡住（下面 refresh 的 remote === null 分支会把它拨回未勾 + 禁用）；
    //   · 字段已经是引用时这一行换成「清除」按钮，勾选框不参与（refMode 下 toggle 隐藏）。
    remember.checked = credentialsRemote !== null
    toggle.title = t('hint.rememberCredential')
    const clearBtn = document.createElement('button')
    clearBtn.type = 'button'
    clearBtn.className = 'tt_toolBtn tt_credClear'
    clearBtn.textContent = t('btn.clearCredential')
    clearBtn.dataset.hidden = ''
    const status = document.createElement('span')
    status.className = 'tt_credStatus'
    row.appendChild(toggle)
    row.appendChild(clearBtn)
    row.appendChild(status)

    const setDialogStatus = (text, kind) => {
      status.textContent = text
      status.dataset.kind = kind
    }

    /** 只问状态、不问值：`describe` 没有读路径（共用助手见文件顶部「凭据引用」一节）。 */
    const refresh = async () => {
      const ref = credentialRefOfValue(input.value)
      const refMode = ref !== ''
      // 已是引用 = 值已经存过了：勾选框没有意义，换上「清除」与状态
      toggle.hidden = refMode
      clearBtn.hidden = !refMode
      status.hidden = false
      if (credentialStore() === null) {
        remember.disabled = true
        // 服务缺位时把默认勾选拨回去：勾着也存不成，只会让保存被错误挡住（见 storeIfRequested）
        remember.checked = false
        clearBtn.disabled = true
        setDialogStatus(credentialsRemote === null ? t('error.credPlainUnavailable') : t('error.credPlainIncomplete'), 'muted')
        return
      }
      remember.disabled = false
      if (!refMode) {
        // 明文态保持安静：打开对话框不该先念一段说明
        status.hidden = true
        setDialogStatus('', 'plain')
        return
      }
      const probe = await describeCredentialRef(ref)
      if (probe.unreported === true) {
        setDialogStatus(t('status.credUnreported', { ref }), 'plain')
        return
      }
      if (probe.error !== undefined) {
        setDialogStatus(t('error.credStatusFailed', { error: probe.error }), 'error')
        return
      }
      const view = probe.view
      setDialogStatus(view.configured
        ? t('status.credStored', { ref, source: view.source !== '' ? t('meta.credSource', { source: view.source }) : '' })
        : t('status.credUnknown', { ref }), view.configured ? 'ok' : 'plain')
      clearBtn.disabled = view.configured !== true || view.writable !== true
    }

    clearBtn.addEventListener('click', () => {
      void (async () => {
        const ref = credentialRefOfValue(input.value)
        if (ref === '') return
        const out = await clearCredentialRef(ref)
        if (out.error !== undefined) {
          setDialogStatus(out.error, 'error')
          return
        }
        input.value = ''
        await refresh()
      })()
    })

    /**
     * 保存路径共用：勾了"存入"且字段还是明文时，把它写进凭据存储并返回引用。
     *
     * 不需要连接簿名称：引用名由**资源身份**（用户名 + 主机 + 非默认端口）派生，见
     * derivedCredentialRef —— 所以改连接名不会换键、也不会留孤儿。设置卡片走同一个助手。
     * @returns `{ value }`（要写进配置的密码值，缺省表示保持原样）或 `{ error }`（要显示并中止保存）
     */
    const storeIfRequested = async () => {
      const out = await storeCredentialIfRequested(
        remember.checked === true,
        input.value,
        fields.host.value,
        fields.port.value,
        fields.username.value,
        suffix,
      )
      if (out.value !== undefined) {
        input.value = out.value
        await refresh()
      }
      return out
    }

    // 失焦时对一次状态（手改引用名也算）；不用 input 事件——密码框每敲一个字符都去问宿主没必要。
    input.addEventListener('change', () => { void refresh() })
    return { row, refresh, storeIfRequested }
  }

  // 零候选时那行说明的文案：密码那行上方有勾选框可新建，口令那行没有，措辞分开写
  const passphraseEnv = envSelectRow(
    fields.passphrase,
    t('hint.noCredRefPassphrase'),
  )
  const passwordEnv = envSelectRow(
    fields.password,
    t('hint.noCredRefPassword'),
  )
  const passwordCred = credentialRow(fields.password, 'PASSWORD')
  /*
   * 候选引用名的**两个来源**（合并逻辑在文件顶部的 credentialRefCandidates）：
   *   1. 本机连接簿里已经在用的 `env:` 引用（我们的 settings 就是这本连接簿，官方口径
   *      "配置界面从自己的 settings schema 得知有哪些引用"）；
   *   2. 凭据存储里**已知的**名字（宿主 /api/dsh-tty/credential-refs，只回名字）。
   *
   * 为什么还要问宿主：官方把「引用半边」设计成**不可枚举**——`dsh-credentials` 的
   * `listRecords` 注释原话是 "Unlike the reference half, which has no enumeration because
   * configuration surfaces learn which references exist from settings schemas"，浏览器侧
   * `ctx.remote.credentials`（dsh-api-settings-controller）也只开 describe / set / unset，
   * 连 listRecords 都没开。所以"这本存储里已经存过哪些名字"在浏览器侧根本问不到 ✗——
   * 只能让宿主读一次 `~/.dsh/.credentials.yaml` 把**键名**回给我们 ✓。
   *
   * 代价与边界（如实写在这，也写进 README）：这是**绕过官方"不可枚举"设计**的一条只读通路
   * （你明确选的 B 方案）；回给浏览器的只有名字、永不含值 ✓；宿主侧若给 provider 配了自定义
   * `path`，那些引用这里看不到 ✓。前端只把它当"候选"，最终能不能解析仍由连接时的凭据层判定 ✓。
   *
   * 只取名字、不取值：候选列表里永远不会出现密码本身。**设置卡片的编辑表单列的是同一份候选**。
   */
  void (async () => {
    // 一次定稿：拿到宿主答复（或失败）后才第一次 setNames——那之前这一行不显形，
    // 免得先闪一下"零候选"的说明再换成输入框。
    const names = await credentialRefCandidates()
    passphraseEnv.setNames(names)
    passwordEnv.setNames(names)
  })()

  card.appendChild(keyRow)
  card.appendChild(passphraseRow)
  card.appendChild(passphraseEnv.row)
  card.appendChild(passwordRow)
  card.appendChild(passwordCred.row)
  card.appendChild(passwordEnv.row)

  /*
   * 跳板机（ProxyJump 单跳）。界面只给一个输入框（`[用户@]主机[:端口]`，与 OpenSSH 的写法
   * 一致），凭据默认沿用目标那一跳——企业内网里通常共用一把钥匙或同一个 agent，所以绝大
   * 多数情况只填这一行。勾掉「使用独立凭据」才展开覆盖字段。
   */
  card.appendChild(sectionLabel(t('section.jump')))
  const jumpHostRow = fieldRow('jumpHost', t('field.jumpHost'), { placeholder: t('placeholder.jumpHost') })
  card.appendChild(jumpHostRow)
  const jumpOwnRow = document.createElement('label')
  jumpOwnRow.className = 'tt_sshRow'
  const jumpOwnCheck = document.createElement('input')
  jumpOwnCheck.type = 'checkbox'
  const jumpOwnText = document.createElement('span')
  jumpOwnText.className = 'tt_cardLabel'
  jumpOwnText.textContent = t('check.jumpOwnCred')
  jumpOwnRow.appendChild(jumpOwnCheck)
  jumpOwnRow.appendChild(jumpOwnText)
  card.appendChild(jumpOwnRow)
  const jumpUsernameRow = fieldRow('jumpUsername', t('field.jumpUsername'), { placeholder: 'root' })
  const jumpAuthRow = fieldRow('jumpAuth', t('field.jumpAuth'), {
    select: [
      { value: '', label: t('option.authInherit') },
      { value: 'agent', label: t('option.authAgent') },
      { value: 'key', label: t('option.authKey') },
      { value: 'password', label: t('option.authPassword') },
    ],
  })
  const jumpKeyRow = fieldRow('jumpKeyPath', t('field.keyPath'), { placeholder: '~/.ssh/id_ed25519' })
  const jumpPassphraseRow = fieldRow('jumpPassphrase', t('field.passphrase'), { type: 'password' })
  const jumpPasswordRow = fieldRow('jumpPassword', t('field.password'), { type: 'password' })
  for (const row of [jumpUsernameRow, jumpAuthRow, jumpKeyRow, jumpPassphraseRow, jumpPasswordRow]) card.appendChild(row)
  const jumpHint = document.createElement('div')
  jumpHint.className = 'tt_cardHint'
  jumpHint.textContent = t('hint.jumpInherit')
  card.appendChild(jumpHint)

  /*
   * 代理命令（ProxyCommand）。与跳板机同属「怎么到达目标」，但**信任级完全不同**：
   * 它是「本机任意命令执行」，所以宿主侧默认关闭（`allowProxyCommand`）。
   *
   * 界面决策：这一行**始终显示、始终可填**，关着时用一行灰字如实说明「现在不生效」。
   * 藏掉字段会更糟——用户换了台机器/关了开关之后，条目里配过什么就无从查看，也解释不了
   * 「我明明填过为什么没反应」。真正的闸门在宿主侧（关着时连接明确失败，不退回直连），
   * 这里的文案只是提前把话说清楚。
   */
  card.appendChild(sectionLabel(t('section.proxyCommand')))
  const proxyCommandRow = fieldRow('proxyCommand', t('field.proxyCommand'), { placeholder: t('placeholder.proxyCommand') })
  card.appendChild(proxyCommandRow)
  const proxyHint = document.createElement('div')
  proxyHint.className = 'tt_cardHint'
  proxyHint.textContent = t('hint.proxyCommand')
  card.appendChild(proxyHint)
  const proxyGateHint = document.createElement('div')
  proxyGateHint.className = 'tt_cardHint tt_sshProbeWarn'
  proxyGateHint.textContent = t('hint.proxyCommandDisabled')
  card.appendChild(proxyGateHint)
  /** 闸门提示只在「填了命令 + 开关关着」时出现；开关状态随 config 快照刷新。 */
  const syncProxyGate = () => {
    const filled = fields.proxyCommand.value.trim() !== ''
    proxyGateHint.style.display = filled && !allowProxyCommandCache ? '' : 'none'
  }
  fields.proxyCommand.addEventListener('input', syncProxyGate)
  syncProxyGate()

  /**
   * 跳板机那一跳的规格（没填就返回 undefined）。
   *
   * 与宿主侧的 `sanitizeJumpSpec` 同一口径：**缺省字段不写进结果**——「没写」的含义是
   * 「继承目标那一跳」，写成空串会变成「显式空凭据」，跳板机就认证不上了。
   */
  const jumpFromFields = () => {
    const shorthand = parseJumpShorthand(fields.jumpHost.value)
    if (shorthand === undefined) return undefined
    if (jumpOwnCheck.checked !== true) return shorthand
    // 显式放宽类型：下面要往这个对象上补 auth/keyPath/...（parseJumpShorthand 只声明了三个字段）
    const jump = /** @type {Record<string, unknown>} */ ({ ...shorthand })
    const username = fields.jumpUsername.value.trim()
    if (username !== '') jump.username = username
    const auth = fields.jumpAuth.value
    if (auth === 'agent' || auth === 'key' || auth === 'password') jump.auth = auth
    const keyPath = fields.jumpKeyPath.value.trim()
    if (keyPath !== '') jump.keyPath = keyPath
    if (fields.jumpPassphrase.value !== '') jump.passphrase = fields.jumpPassphrase.value
    if (fields.jumpPassword.value !== '') jump.password = fields.jumpPassword.value
    return jump
  }

  /**
   * 代理命令那一行（没填就返回 undefined）。
   *
   * 与宿主侧 `sanitizeProxyCommand` 同口径：**空 = 这个字段不存在**（不写空串进 spec）。
   * 与跳板机同时填时**不在这里二选一**：优先关系（ProxyJump 优先）由宿主侧的拨号处
   * 一处决定并记 warn，界面只管把用户填的东西如实带过去。
   */
  const proxyCommandFromFields = () => {
    const raw = fields.proxyCommand.value.trim()
    return raw === '' ? undefined : raw
  }

  /** 显隐：没填跳板机时整段退化成一个输入框；勾了独立凭据才展开覆盖字段。 */
  const syncJumpRows = () => {
    const hasJump = parseJumpShorthand(fields.jumpHost.value) !== undefined
    const own = hasJump && jumpOwnCheck.checked === true
    jumpOwnRow.style.display = hasJump ? '' : 'none'
    for (const row of [jumpUsernameRow, jumpAuthRow, jumpKeyRow, jumpPassphraseRow, jumpPasswordRow]) {
      row.style.display = own ? '' : 'none'
    }
    // 认证方式选了 key 才显示私钥/口令；password 才显示密码（与上面目标那段同规则）
    jumpKeyRow.style.display = own && fields.jumpAuth.value === 'key' ? '' : 'none'
    jumpPassphraseRow.style.display = own && fields.jumpAuth.value === 'key' ? '' : 'none'
    jumpPasswordRow.style.display = own && fields.jumpAuth.value === 'password' ? '' : 'none'
    jumpHint.style.display = hasJump ? '' : 'none'
  }
  fields.jumpHost.addEventListener('input', syncJumpRows)
  fields.jumpAuth.addEventListener('change', syncJumpRows)
  jumpOwnCheck.addEventListener('change', syncJumpRows)

  card.appendChild(sectionLabel(t('section.options')))
  const fwdRow = document.createElement('label')
  fwdRow.className = 'tt_cardRow'
  const fwdCheck = document.createElement('input')
  fwdCheck.type = 'checkbox'
  fwdCheck.className = 'tt_cardCheckbox'
  const fwdLabel = document.createElement('span')
  fwdLabel.className = 'tt_cardLabel'
  fwdLabel.textContent = t('check.agentForward')
  fwdRow.appendChild(fwdCheck)
  fwdRow.appendChild(fwdLabel)
  card.appendChild(fwdRow)

  // 持久会话（0.10.0，宿主 persistence=tmux 时显示）：远程 tmux 托管，断线/
  // 宿主重启后重开即恢复；随连接簿条目保存
  const persistRow = document.createElement('label')
  persistRow.className = 'tt_cardRow'
  const persistCheck = document.createElement('input')
  persistCheck.type = 'checkbox'
  persistCheck.className = 'tt_cardCheckbox'
  const persistLabel = document.createElement('span')
  persistLabel.className = 'tt_cardLabel'
  persistLabel.textContent = t('check.persist')
  persistRow.appendChild(persistCheck)
  persistRow.appendChild(persistLabel)
  // 设置开关是唯一开关：开启时默认勾选（可对单次连接取消）
  persistCheck.checked = persistenceCache === 'tmux'
  if (persistenceCache === 'tmux') card.appendChild(persistRow)

  const saveRow = document.createElement('label')
  saveRow.className = 'tt_cardRow'
  const saveCheck = document.createElement('input')
  saveCheck.type = 'checkbox'
  saveCheck.className = 'tt_cardCheckbox'
  const saveLabel = document.createElement('span')
  saveLabel.className = 'tt_cardLabel'
  saveLabel.textContent = t('check.saveToBook')
  saveRow.appendChild(saveCheck)
  saveRow.appendChild(saveLabel)
  card.appendChild(saveRow)
  const nameRow = fieldRow('name', t('field.bookName'), { placeholder: t('placeholder.bookName') })
  nameRow.style.display = 'none'
  card.appendChild(nameRow)
  saveCheck.addEventListener('change', () => {
    nameRow.style.display = saveCheck.checked ? '' : 'none'
    if (saveCheck.checked && fields.name.value.trim() === '' && fields.host.value.trim() !== '') {
      fields.name.value = fields.host.value.trim()
    }
    if (saveCheck.checked) fields.name.focus()
  })
  // 编辑模式：不勾选保存，直接以「保存修改」写回连接簿（名称字段常驻可改名）
  if (isEdit) {
    saveRow.style.display = 'none'
    fields.name.value = String(editing.name ?? '')
    nameRow.style.display = ''
    fields.host.value = String(editing.host ?? '')
    fields.port.value = String(editing.port ?? 22)
    fields.username.value = String(editing.username ?? '')
    fields.auth.value = editing.auth === 'key' || editing.auth === 'password' ? String(editing.auth) : 'agent'
    fields.keyPath.value = String(editing.keyPath ?? '')
    fields.passphrase.value = String(editing.passphrase ?? '')
    fields.password.value = String(editing.password ?? '')
    // 跳板机回填：简写进输入框；有显式凭据才勾「独立凭据」并展开
    const editingJump = editing.jump !== null && typeof editing.jump === 'object' ? /** @type {Record<string, unknown>} */ (editing.jump) : null
    fields.jumpHost.value = formatJumpShorthand(editingJump)
    if (editingJump !== null) {
      const ownJumpCred = editingJump.auth !== undefined || editingJump.keyPath !== undefined || editingJump.password !== undefined || editingJump.passphrase !== undefined
      jumpOwnCheck.checked = ownJumpCred
      if (ownJumpCred) {
        fields.jumpUsername.value = String(editingJump.username ?? '')
        fields.jumpAuth.value = editingJump.auth === 'key' || editingJump.auth === 'password' ? String(editingJump.auth) : ''
        fields.jumpKeyPath.value = String(editingJump.keyPath ?? '')
        fields.jumpPassphrase.value = String(editingJump.passphrase ?? '')
        fields.jumpPassword.value = String(editingJump.password ?? '')
      }
    }
    fwdCheck.checked = editing.agentForward === true
    // 代理命令回填（原样字符串：它本来就是一条命令行，不做简写解析）
    fields.proxyCommand.value = String(editing.proxyCommand ?? '')
    syncProxyGate()
    persistCheck.checked = persistenceCache === 'tmux'
  }

  /*
   * 状态带：错误与试连结果是「同一块地方的两条消息」，统一收进一个**定高**容器。
   * 定高是为了不让消息出现时把卡片撑高——卡片在遮罩里垂直居中，一变高整个对话框
   * 都会跳（试连按钮点一下布局就动，实测很难受）。空消息靠 :empty 隐藏。
   */
  const statusEl = document.createElement('div')
  statusEl.className = 'tt_sshStatus'
  const errorEl = document.createElement('div')
  errorEl.className = 'tt_sshError'
  const probeEl = document.createElement('div')
  probeEl.className = 'tt_sshProbeResult'
  statusEl.appendChild(errorEl)
  statusEl.appendChild(probeEl)
  card.appendChild(statusEl)
  syncJumpRows()

  /** 从当前对话框字段收集 probe spec（不含 name/persist）；字段不齐返回 null 并提示。 */
  const collectProbeSpec = () => {
    errorEl.textContent = ''
    const host = fields.host.value.trim()
    const username = fields.username.value.trim()
    let port = Number(fields.port.value)
    if (!Number.isInteger(port) || port < 1 || port > 65535) port = 22
    if (host === '' || username === '') {
      errorEl.textContent = t('error.hostUserRequired')
      return null
    }
    const auth = fields.auth.value
    const spec = { host, port, username, auth }
    const jump = jumpFromFields()
    if (jump !== undefined) spec.jump = jump
    const proxyCommand = proxyCommandFromFields()
    if (proxyCommand !== undefined) spec.proxyCommand = proxyCommand
    if (auth === 'key') {
      const keyPath = fields.keyPath.value.trim()
      if (keyPath === '') {
        errorEl.textContent = t('error.keyPathRequired')
        return null
      }
      spec.keyPath = keyPath
      const passphrase = fields.passphrase.value
      if (passphrase !== '') spec.passphrase = passphrase
    }
    if (auth === 'password') {
      const password = fields.password.value
      if (password === '') {
        errorEl.textContent = t('error.passwordRequired')
        return null
      }
      spec.password = password
    }
    if (fwdCheck.checked) spec.agentForward = true
    return spec
  }

  // 动作行分两组：左侧次要操作（取消 / 文件浏览 / 保存修改 / 试连），
  // 右侧主操作（连接）——编辑态按钮多时不至于挤成一排
  const actions = document.createElement('div')
  actions.className = 'tt_sshActions'
  const actionsSecondary = document.createElement('div')
  actionsSecondary.className = 'tt_sshActionsGroup'
  const actionsPrimary = document.createElement('div')
  actionsPrimary.className = 'tt_sshActionsGroup'
  actions.appendChild(actionsSecondary)
  actions.appendChild(actionsPrimary)
  const cancelBtn = document.createElement('button')
  cancelBtn.type = 'button'
  cancelBtn.className = 'tt_toolBtn'
    cancelBtn.textContent = t('btn.cancel')
  const connectBtn = document.createElement('button')
  connectBtn.type = 'button'
  connectBtn.className = 'tt_cardSave'
    connectBtn.textContent = t('btn.connect')
  actionsSecondary.appendChild(cancelBtn)
  const sftpBtn = document.createElement('button')
  sftpBtn.type = 'button'
  sftpBtn.className = 'tt_toolBtn'
    sftpBtn.textContent = t('btn.fileBrowse')
    sftpBtn.title = t('btn.browseTitle')
  sftpBtn.addEventListener('click', () => {
    errorEl.textContent = ''
    const host = fields.host.value.trim()
    const username = fields.username.value.trim()
    let port = Number(fields.port.value)
    if (!Number.isInteger(port) || port < 1 || port > 65535) port = 22
    if (host === '' || username === '') {
      errorEl.textContent = t('error.hostUserRequired')
      return
    }
    const auth = fields.auth.value
    const spec = { host, port, username, auth }
    const jump = jumpFromFields()
    if (jump !== undefined) spec.jump = jump
    const proxyCommand = proxyCommandFromFields()
    if (proxyCommand !== undefined) spec.proxyCommand = proxyCommand
    if (auth === 'key') {
      const keyPath = fields.keyPath.value.trim()
      if (keyPath === '') {
        errorEl.textContent = t('error.keyPathRequired')
        return
      }
      spec.keyPath = keyPath
      const passphrase = fields.passphrase.value
      if (passphrase !== '') spec.passphrase = passphrase
    }
    if (auth === 'password') {
      const password = fields.password.value
      if (password === '') {
        errorEl.textContent = t('error.passwordRequired')
        return
      }
      spec.password = password
    }
    if (fwdCheck.checked) spec.agentForward = true
    closeSshDialog()
    // 连接对话框里填的临时规格：同样归属当前活动标签（规则统一，见「+」菜单那条）
    openSftpBrowser(spec)
  })
  actionsSecondary.appendChild(sftpBtn)
  let saveEditBtn = null
  if (isEdit) {
    saveEditBtn = document.createElement('button')
    saveEditBtn.type = 'button'
    saveEditBtn.className = 'tt_toolBtn'
        saveEditBtn.textContent = t('btn.saveEdit')
    saveEditBtn.addEventListener('click', () => {
      errorEl.textContent = ''
      const host = fields.host.value.trim()
      const username = fields.username.value.trim()
      if (host === '' || username === '') {
        errorEl.textContent = t('error.hostUserRequired')
        return
      }
      let port = Number(fields.port.value)
      if (!Number.isInteger(port) || port < 1 || port > 65535) port = 22
      const auth = fields.auth.value
      const name = fields.name.value.trim() || host
      const next = {
        name,
        host,
        port,
        username,
        auth,
        keyPath: auth === 'key' ? fields.keyPath.value.trim() : '',
        passphrase: fields.passphrase.value,
        password: fields.password.value,
        agentForward: fwdCheck.checked,
        persist: persistCheck.checked,
      }
      // 跳板机：留空就不写这个字段（宿主侧的「没写」= 直连／继承，空对象反而会走清洗）
      const nextJump = jumpFromFields()
      if (nextJump !== undefined) next.jump = nextJump
      // 代理命令：编辑对话框里清空 = 就是要删掉它，所以这里**空串也写**（清洗会当没配）
      next.proxyCommand = fields.proxyCommand.value.trim()
      if (auth === 'key' && next.keyPath === '') {
        errorEl.textContent = t('error.keyPathRequired')
        return
      }
      if (saveEditBtn !== null) saveEditBtn.disabled = true
      void (async () => {
        const stored = await passwordCred.storeIfRequested()
        if (stored.error !== undefined) {
          errorEl.textContent = stored.error
          if (saveEditBtn !== null) saveEditBtn.disabled = false
          return
        }
        if (stored.value !== undefined) next.password = stored.value
        const error = await saveSshHostUpdate(String(editing.name ?? ''), next)
        if (saveEditBtn !== null) saveEditBtn.disabled = false
        if (error !== undefined) {
                    errorEl.textContent = t('error.saveCredFailed', { error })
          return
        }
        closeSshDialog()
      })()
    })
    actionsSecondary.appendChild(saveEditBtn)
  }
  // 试连：不建会话、不占名额；按当前填写诊断 TCP/主机密钥/认证（不落盘 TOFU）
  const probeBtn = document.createElement('button')
  probeBtn.type = 'button'
  probeBtn.className = 'tt_toolBtn'
    probeBtn.textContent = t('btn.probe')
    probeBtn.title = t('btn.probeTitle')
  probeBtn.addEventListener('click', () => {
    const spec = collectProbeSpec()
    if (spec === null) return
    probeEl.className = 'tt_sshProbeResult'
        probeEl.textContent = t('msg.probing')
    probeBtn.disabled = true
    void probeSshFetch(spec, false).then((out) => {
      probeBtn.disabled = false
      if (out.result) {
        probeEl.className = 'tt_sshProbeResult' + (out.result.auth?.ok === true ? ' tt_sshProbeOk' : ' tt_sshProbeBad')
        probeEl.textContent = probeSummary(out.result)
      } else {
        probeEl.className = 'tt_sshProbeResult tt_sshProbeBad'
                probeEl.textContent = t('error.probeFailed', { detail: String(out.error || t('error.unknown')) })
      }
    })
  })
  actionsSecondary.appendChild(probeBtn)
  actionsPrimary.appendChild(connectBtn)
  card.appendChild(actions)

  const syncAuthRows = () => {
    keyRow.style.display = fields.auth.value === 'key' ? '' : 'none'
    passphraseRow.style.display = fields.auth.value === 'key' ? '' : 'none'
    passphraseEnv.row.style.display = fields.auth.value === 'key' ? '' : 'none'
    passwordRow.style.display = fields.auth.value === 'password' ? '' : 'none'
    passwordEnv.row.style.display = fields.auth.value === 'password' ? '' : 'none'
    passwordCred.row.style.display = fields.auth.value === 'password' ? '' : 'none'
  }
  fields.auth.addEventListener('change', syncAuthRows)
  syncAuthRows()
  // 新建连接也要对一次凭据状态：宿主没有凭据服务时，这一行得先禁用并说明原因
  void passwordCred.refresh()

  cancelBtn.addEventListener('click', () => closeSshDialog())
  backdrop.addEventListener('mousedown', (event) => {
    if (event.target === backdrop) closeSshDialog()
  })

  connectBtn.addEventListener('click', async () => {
    errorEl.textContent = ''
    // 并发上限前置校验：达到上限不发起连接（对话框留在原地提示）
    const limitText = await sessionLimitNotice()
    if (limitText !== null) {
      errorEl.textContent = limitText
      return
    }
    const host = fields.host.value.trim()
    const username = fields.username.value.trim()
    let port = Number(fields.port.value)
    if (!Number.isInteger(port) || port < 1 || port > 65535) port = 22
    if (host === '' || username === '') {
      errorEl.textContent = t('error.hostUserRequired')
      return
    }
    const auth = fields.auth.value
    const spec = { t: 'ssh', host, port, username, auth }
    /*
     * 跳板机 / 代理命令必须同时进**两条路**：本次连接的 spec，以及（勾了保存时的）连接簿条目。
     *
     * 这里曾经漏过一遍（2026-09-25）：对话框里填了跳板机，连出去却是直连、存下来的条目也没有
     * 跳板机——「配了等于没配」，而且症状是「连不上」（没有任何提示说跳板机被丢了）。四个出口
     * （连接 / 试连 / 文件浏览 / 保存修改）必须走同一个取值函数，漏一个就是这一类缺陷。
     */
    const jump = jumpFromFields()
    if (jump !== undefined) spec.jump = jump
    const proxyCommand = proxyCommandFromFields()
    if (proxyCommand !== undefined) spec.proxyCommand = proxyCommand
    if (auth === 'key') {
      const keyPath = fields.keyPath.value.trim()
      if (keyPath !== '') spec.keyPath = keyPath
      const passphrase = fields.passphrase.value
      if (passphrase !== '') spec.passphrase = passphrase
    }
    if (auth === 'password') {
      const password = fields.password.value
      if (password !== '') spec.password = password
    }
    if (fwdCheck.checked) spec.agentForward = true
    if (persistCheck.checked) {
      spec.persist = true
      spec.persistName = newPersistName()
    }
    const targetLabel = port !== 22 ? username + '@' + host + ':' + port : username + '@' + host
    const proceed = (bookName) => {
      closeSshDialog()
      if (modalEl === null) return // 对话框存续期间面板被关闭：不再开标签
      addTab(spec, bookName !== '' ? bookName : targetLabel)
    }
    if (!saveCheck.checked) {
      // 没勾「保存到连接簿」就没有配置可依附：这时不存密码（否则留下一个没人引用的孤儿）。
      // 凭据那一行的勾选框只对"会保存"的路径生效，label 里已写明「保存时存入」。
      proceed('')
      return
    }
    const bookName = fields.name.value.trim() || host
    connectBtn.disabled = true
    void (async () => {
      const stored = await passwordCred.storeIfRequested()
      if (stored.error !== undefined) {
        errorEl.textContent = stored.error
        connectBtn.disabled = false
        return
      }
      const password = stored.value ?? spec.password ?? ''
      const error = await saveSshHostEntry({
        name: bookName,
        host,
        port,
        username,
        auth,
        keyPath: spec.keyPath ?? '',
        passphrase: spec.passphrase ?? '',
        password,
        agentForward: fwdCheck.checked,
        persist: persistCheck.checked,
        // 同上：存进连接簿的那一份也要带跳板机 / 代理命令，否则「连接这次成功、下次直连」
        ...(jump !== undefined ? { jump } : {}),
        proxyCommand: fields.proxyCommand.value.trim(),
      })
      connectBtn.disabled = false
      if (error !== undefined) {
                errorEl.textContent = t('error.saveBookFailed', { error })
        return
      }
      proceed(bookName)
    })()
  })

  backdrop.appendChild(card)
  document.body.appendChild(backdrop)
  sshDialogEl = backdrop
  fields.host.focus()
}

function closeSshDialog() {
  if (sshDialogEl === null) return
  sshDialogEl.remove()
  sshDialogEl = null
}

/** 保存一条连接簿：sshHosts 整体替换（同名覆盖）；返回错误信息或 undefined。 */
async function saveSshHostEntry(entry) {
  const next = [...sshHostsCache.filter((host) => host?.name !== entry.name), entry]
  try {
    const res = await fetch('/api/dsh-tty/config', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sshHosts: next }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.ok) return String(data.error || 'HTTP ' + res.status)
    syncSshHostsCache(data.config)
    return undefined
  } catch (error) {
    return String(error && error.message ? error.message : error)
  }
}

/** 编辑保存：按原始名称替换连接簿条目（支持改名，冲突校验）；返回错误信息或 undefined。 */
async function saveSshHostUpdate(originalName, entry) {
  if (entry.name !== originalName && sshHostsCache.some((host) => host?.name === entry.name)) {
        return t('error.bookNameTaken', { name: entry.name })
  }
  const next = sshHostsCache.map((host) => (host?.name === originalName ? entry : host))
  try {
    const res = await fetch('/api/dsh-tty/config', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sshHosts: next }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.ok) return String(data.error || 'HTTP ' + res.status)
    syncSshHostsCache(data.config)
    return undefined
  } catch (error) {
    return String(error && error.message ? error.message : error)
  }
}

/* ============================ SFTP 双栏浏览器 ============================ */

/**
 * SFTP 双栏浏览器（0.9.0，设置 sftpStyle=dual 时替代单窗体）：左本机 / 右远程
 * 两栏，行内「⇨ / ⇦」把条目对拷到对面栏的当前目录——走
 * /api/dsh-tty/local-fs/transfer 由宿主服务端流式直传（目录递归、同名覆盖，
 * 字节不经过浏览器）；本机侧浏览/改名/删除走同路由，远程侧复用单窗体的
 * /api/dsh-tty/sftp/*。与单窗体共用 sftpDialogEl 互斥与 Esc 关闭。
 */
function openSftpDual(spec, label, ownerKey) {
  const owner = resolveDockOwner(ownerKey, activeSid)
  if (isSftpOpen(owner)) return

  const card = document.createElement('div')
  card.className = 'tt_sftpDualCard'

  // 标题行：标题 + 右上角 ✕ 关闭
  const titleRow = document.createElement('div')
  titleRow.className = 'tt_sftpTitleRow'
  const title = document.createElement('div')
  title.className = 'tt_sshTitle'
  title.innerHTML = ICON_FOLDER + '<span></span>'
    title.lastElementChild.textContent = t('panel.sftpDual', { label })
  const titleClose = document.createElement('button')
  titleClose.type = 'button'
  titleClose.className = 'tt_close'
    titleClose.title = t('btn.close')
  titleClose.innerHTML = ICON_CLOSE
  titleClose.addEventListener('click', () => closeSftpDialog(owner))
  titleRow.appendChild(title)
  titleRow.appendChild(titleClose)
  card.appendChild(titleRow)

  const status = document.createElement('div')
  status.className = 'tt_sftpStatus'
  const setDialogStatus = (text, kind) => {
    status.textContent = text
    if (kind === undefined) delete status.dataset.state
    else status.dataset.state = kind
  }

  /** 两侧栏共享传输互斥：传输期间两栏都置忙。 */
  let jointBusy = false
  const runJoint = (busyText, task) => {
    if (jointBusy || panes.local.busy || panes.remote.busy) return
    jointBusy = true
    for (const pane of [panes.local, panes.remote]) pane.setBusy(true)
    setDialogStatus(busyText, 'busy')
    Promise.resolve()
      .then(task)
      .catch((error) => {
        // 传输任务失败也要让进度条着色（正常终态由任务内 done/reset 处理）
        if (error === null || typeof error !== 'object' || error.name !== 'TransferCanceledError') {
                    progress.fail(t('status.failed'))
        }
        setDialogStatus(String(error && error.message ? error.message : error), 'error')
      })
      .finally(() => {
        jointBusy = false
        for (const pane of [panes.local, panes.remote]) pane.setBusy(false)
      })
  }

  /** 把行内编辑器插到对应栏的工具行之下（与单窗体一致的视觉位置）。 */
  const showEditor = (kind) => {
    panes[kind].bar.after(editor)
    editor.style.display = ''
    editorInput.focus()
    editorInput.select()
  }

  const panes = {}

  /**
   * 构建一侧栏。api 按 kind 分发：remote → /api/dsh-tty/sftp/*（带 spec），
   * local → /api/dsh-tty/local-fs/*。返回 loadDir / renderRows / 传输入口。
   */
  const buildPane = (kind, titleText) => {
    const pane = { kind, path: '', busy: false }
    const wrap = document.createElement('div')
    wrap.className = 'tt_sftpPane'

    const head = document.createElement('div')
    head.className = 'tt_sftpPaneHead'
    const headTitle = document.createElement('span')
    headTitle.textContent = titleText
    // 每栏自己的条目数：不再共用一个底部状态行（否则只有后加载的一栏有数字）
    const headMeta = document.createElement('span')
    headMeta.className = 'tt_sftpPaneMeta'
    head.appendChild(headTitle)
    head.appendChild(headMeta)
    wrap.appendChild(head)

    const bar = document.createElement('div')
    bar.className = 'tt_sftpBar'
    const pathInput = document.createElement('input')
    pathInput.type = 'text'
    pathInput.className = 'tt_sftpPath'
        pathInput.placeholder = kind === 'local' ? t('placeholder.localPath') : t('placeholder.remotePath')
    pathInput.spellcheck = false
    pathInput.autocomplete = 'off'
    const refreshBtn = document.createElement('button')
    refreshBtn.type = 'button'
    refreshBtn.className = 'tt_toolBtn'
        refreshBtn.innerHTML = ICON_REFRESH + '<span>' + t('btn.refresh') + '</span>'
    const mkdirBtn = document.createElement('button')
    mkdirBtn.type = 'button'
    mkdirBtn.className = 'tt_toolBtn'
        mkdirBtn.innerHTML = ICON_MKDIR + '<span>' + t('btn.mkdir') + '</span>'
    bar.appendChild(pathInput)
    bar.appendChild(refreshBtn)
    bar.appendChild(mkdirBtn)
    wrap.appendChild(bar)

    const list = document.createElement('div')
    list.className = 'tt_sftpList'
    wrap.appendChild(list)
    pane.bar = bar // 行内编辑器插入位置（工具行之下）

    const setBusy = (busy) => {
      pane.busy = busy
      for (const el of [refreshBtn, mkdirBtn]) el.disabled = busy
      pathInput.disabled = busy
    }

    const api = async (action, payload) => {
      const base = kind === 'local' ? '/api/dsh-tty/local-fs/' : '/api/dsh-tty/sftp/'
      const body = kind === 'local' ? payload : { ...spec, ...payload }
      const res = await fetch(base + action, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data.ok !== true) throw new Error(String(data.error || 'HTTP ' + res.status))
      return data
    }

    const runTask = (busyText, task) => {
      if (pane.busy || jointBusy) return
      setBusy(true)
      setDialogStatus(busyText, 'busy')
      return Promise.resolve()
        .then(task)
        .catch((error) => setDialogStatus(String(error && error.message ? error.message : error), 'error'))
        .finally(() => setBusy(false))
    }

    // base 为空（目录未定位）时抛错而不是拼出 "/name"（0.19.0：空 base 会被
    // 服务端按相对路径/宿主 cwd 解析）
    const joinChild = (dir, name) => {
            if (dir === undefined || dir === '') throw new Error(t('error.dirNotReady'))
      return dir.endsWith('/') || dir.endsWith('\\') ? dir + name : dir + '/' + name
    }

    const rowOf = (entry) => {
      const full = joinChild(pane.path, entry.name)
      const metaParts = []
            if (entry.isDir === true) metaParts.push(t('meta.dir'))
      else metaParts.push(formatBytes(Number(entry.size)) || '—')
      const mtime = formatMtime(Number(entry.mtime))
      if (mtime !== '') metaParts.push(mtime)
      const row = listRow(entry.isDir ? ICON_FOLDER : entry.isSymlink ? ICON_LINK : ICON_FILE, entry.name, metaParts.join(' · '), entry.isDir === true ? 'dir' : entry.isSymlink === true ? 'link' : 'file')
      const reload = () => pane.loadDir(pane.path)
      const other = kind === 'local' ? panes.remote : panes.local
      if (entry.isDir === true) {
        row.addEventListener('click', (event) => {
          if (event.target instanceof Element && event.target.closest('.tt_sftpAct') !== null) return
          void pane.loadDir(full)
        })
      }
      // 直传：⇨ 本机→远程 / ⇦ 远程→本机（对面栏当前目录下；目录递归、同名覆盖）
      // 0.12.0：服务端任务化——start 拿 jobId，轮询进度（真实字节百分比），
      // ✕ 打 cancel 中止（服务端销毁流并删半截文件）。
            appendAct(row, kind === 'local' ? ICON_ARROW_RIGHT : ICON_ARROW_LEFT, t('btn.transferTo', { target: kind === 'local' ? t('meta.remote') : t('meta.local'), path: other.path }), () => {
        // 路径未就绪（0.19.0）：列表还没回包 / 本机 list 失败时 path 为空——
        // 空路径发给宿主会被按宿主进程 cwd 解析，整树落到安装目录之类位置
        if (pane.path === '' || other.path === '') {
                    setDialogStatus(t('error.transferDirsNotReady'), 'error')
          return
        }
        progress.reset()
        progress.pulse(0)
                runJoint(t('msg.transferring', { name: entry.name }), async () => {
          const res = await fetch('/api/dsh-tty/local-fs/transfer', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              action: 'start',
              direction: kind === 'local' ? 'up' : 'down',
              ...spec,
              localPath: kind === 'local' ? full : joinChild(other.path, entry.name),
              remotePath: kind === 'local' ? joinChild(other.path, entry.name) : full,
            }),
          })
          const data = await res.json().catch(() => ({}))
          if (!res.ok || data.ok !== true) {
                        progress.fail(t('error.transferFailed'))
            throw new Error(String(data.error || 'HTTP ' + res.status))
          }
          const jobId = data.job?.id
          if (typeof jobId !== 'string' || jobId === '') {
                        progress.fail(t('error.transferFailed'))
                        throw new Error(t('error.noTaskId'))
          }
          const outcome = await trackTransfer(jobId, entry.name)
          if (outcome === 'canceled') {
            progress.reset()
                        setDialogStatus(t('msg.transferCanceled', { name: entry.name }))
          } else {
                        progress.done(t('status.done'))
            setTimeout(() => progress.reset(), 1500)
                        setDialogStatus(t('msg.transferred', { name: entry.name }))
          }
          await other.loadDir(other.path)
        })
      })
      if (kind !== 'local' && entry.isDir !== true) {
        // 远程文件保留浏览器下载（⬇）
                appendAct(row, ICON_DOWNLOAD, t('btn.download', { name: entry.name }), () => void downloadRemoteEntry(entry, full))
      }
            appendAct(row, ICON_EDIT, t('btn.rename', { name: entry.name }), () => {
                editorInput.placeholder = t('placeholder.newName')
        editorInput.value = entry.name
        showEditor(kind)
        editorCommit = async () => {
          const value = editorInput.value.trim()
          if (value === '' || value === entry.name) return
          closeEditor()
                    await pane.runTask(t('msg.renaming', { name: entry.name }), async () => {
            await api('rename', { from: full, to: joinChild(pane.path, value) })
            await reload()
          })
        }
      })
            appendDelete(row, () => pane.runTask(t('msg.deleting', { name: entry.name }), async () => {
        await api('remove', { path: full, recursive: entry.isDir === true })
        await reload()
                setDialogStatus(t('msg.deleted', { name: entry.name }))
      }), entry)
      return row
    }

    const renderRows = (entries) => {
      list.textContent = ''
      if (pane.path !== '' && pane.path !== '/' && /^[A-Za-z]:[\\/]?$/.test(pane.path) === false) {
                const up = listRow(ICON_UP, t('list.parentDir'), '', 'up')
        up.addEventListener('click', () => {
          // 本机栏用独立的父级函数（0.19.0）：parentRemotePath 只按 '/' 切、
          // index<=0 回 '/'——Windows 上 C:\Users\me 点「..」会请求 listLocalDir('/')
          // 直接跳到盘根且再点出不去
          const parent = kind === 'local' ? parentLocalPath(pane.path) : parentRemotePath(pane.path)
          if (parent !== null) void pane.loadDir(parent)
        })
        list.appendChild(up)
      }
      const rows = Array.isArray(entries) ? entries : []
      if (rows.length === 0) {
        const empty = document.createElement('div')
        empty.className = 'tt_addMenuTitle'
                empty.textContent = t('list.emptyDir')
        list.appendChild(empty)
        return
      }
      // 大目录截断渲染（0.19.0）：每行 3-5 个按钮 + 独立监听器，万级条目会把
      // 面板卡死——先渲染前 500 行，其余用占位行提示（过滤/跳转即可定位）
      const RENDER_CAP = 500
      for (const entry of rows.slice(0, RENDER_CAP)) {
        if (entry === null || typeof entry !== 'object' || typeof entry.name !== 'string' || entry.name === '') continue
        list.appendChild(rowOf(entry))
      }
      if (rows.length > RENDER_CAP) {
        const more = document.createElement('div')
        more.className = 'tt_addMenuTitle'
                more.textContent = t('list.truncated', { rest: rows.length - RENDER_CAP, total: rows.length })
        list.appendChild(more)
      }
    }

    pane.loadDir = async (pathArg) => {
      try {
        const data = await api('list', { path: pathArg ?? pane.path })
        pane.path = typeof data.path === 'string' && data.path !== '' ? data.path : pane.path
        pathInput.value = pane.path
        const count = Array.isArray(data.entries) ? data.entries.length : 0
        renderRows(data.entries)
                headMeta.textContent = t('list.itemCount', { count })
        setDialogStatus(pane.path)
      } catch (error) {
        setDialogStatus(String(error && error.message ? error.message : error), 'error')
      }
    }
    pane.runTask = runTask
    pane.setBusy = setBusy
    panes[kind] = pane

    refreshBtn.addEventListener('click', () => {
            void pane.runTask(t('list.loading'), () => pane.loadDir(pane.path))
    })
    mkdirBtn.addEventListener('click', () => {
      if (pane.busy || jointBusy) return
            editorInput.placeholder = t('placeholder.newDirName')
      editorInput.value = ''
      showEditor(kind)
      editorCommit = async () => {
        const value = editorInput.value.trim()
        if (value === '') return
        closeEditor()
        await pane.runTask(t('msg.creatingDir', { name: value }), async () => {
          await api('mkdir', { path: joinChild(pane.path, value), parents: true })
          await pane.loadDir(pane.path)
        })
      }
    })
    pathInput.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return
      event.preventDefault()
      if (pane.busy || jointBusy) return
      const target = pathInput.value.trim()
      if (target === '') return
            void pane.runTask(t('list.loading'), () => pane.loadDir(target))
    })

    return wrap
  }

  /* 行内编辑器（重命名 / 新建目录共用，最后操作的栏生效）+ 列表行工厂 */
  const editor = document.createElement('div')
  editor.className = 'tt_sftpEditor'
  editor.style.display = 'none'
  const editorInput = document.createElement('input')
  editorInput.type = 'text'
  editorInput.className = 'tt_cardInput'
  editorInput.spellcheck = false
  editorInput.autocomplete = 'off'
  const editorOk = document.createElement('button')
  editorOk.type = 'button'
  editorOk.className = 'tt_toolBtn'
    editorOk.textContent = t('btn.ok')
  const editorCancel = document.createElement('button')
  editorCancel.type = 'button'
  editorCancel.className = 'tt_toolBtn'
    editorCancel.textContent = t('btn.cancel')
  editor.appendChild(editorInput)
  editor.appendChild(editorOk)
  editor.appendChild(editorCancel)
  let editorCommit = null
  const closeEditor = () => {
    editor.style.display = 'none'
    editorInput.value = ''
    editorCommit = null
  }
  editorOk.addEventListener('click', () => void editorCommit?.())
  editorCancel.addEventListener('click', closeEditor)
  editorInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      void editorCommit?.()
    } else if (event.key === 'Escape') {
      event.stopPropagation()
      closeEditor()
    }
  })

  const listRow = (icon, name, meta, kind) => {
    const row = document.createElement('button')
    row.type = 'button'
    row.className = 'tt_sftpRow'
    const iconEl = document.createElement('span')
    iconEl.className = 'tt_sftpIcon'
    iconEl.innerHTML = icon
    if (kind !== undefined) iconEl.dataset.kind = kind
    const nameEl = document.createElement('span')
    nameEl.className = 'tt_sftpName'
    nameEl.textContent = name
    nameEl.title = name
    row.appendChild(iconEl)
    row.appendChild(nameEl)
    if (meta !== '') {
      const metaEl = document.createElement('span')
      metaEl.className = 'tt_sftpMeta'
      metaEl.textContent = meta
      row.appendChild(metaEl)
    }
    return row
  }

  const appendAct = (row, glyph, titleText, onClick) => {
    const act = document.createElement('button')
    act.type = 'button'
    act.className = 'tt_sftpAct'
    act.innerHTML = glyph
    act.title = titleText
    act.addEventListener('click', (event) => {
      event.stopPropagation()
      onClick()
    })
    row.appendChild(act)
  }

  /** 删除按钮：首击变「确认?」（4s 复位），再击执行（目录递归由请求带出）。 */
  const appendDelete = (row, onConfirm, entry) => {
    const act = document.createElement('button')
    act.type = 'button'
    act.className = 'tt_sftpAct'
    act.innerHTML = ICON_TRASH
        act.title = entry.isDir ? t('btn.deleteEntryDir', { name: entry.name }) : t('btn.deleteEntry', { name: entry.name })
    let confirmTimer = null
    act.addEventListener('click', (event) => {
      event.stopPropagation()
      if (confirmTimer !== null) {
        clearTimeout(confirmTimer)
        confirmTimer = null
        act.innerHTML = ICON_TRASH
        delete act.dataset.danger
        onConfirm()
        return
      }
            act.textContent = t('btn.confirm')
      act.dataset.danger = ''
      confirmTimer = setTimeout(() => {
        confirmTimer = null
        act.innerHTML = ICON_TRASH
        delete act.dataset.danger
      }, 4000)
    })
    row.appendChild(act)
  }

  /** 远程文件浏览器下载（双栏里保留；整传用 ⇦ 走服务端直传）。 */
    const downloadRemoteEntry = (entry, full) => panes.remote.runTask(t('msg.downloading', { name: entry.name }), async () => {
    progress.reset()
    let blob
    try {
      blob = await fetchBlobWithProgress('/api/dsh-tty/sftp/download', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...spec, path: full }),
      }, (loaded, total) => {
        progress.set(loaded, total)
      }, sftpLimitsCache.maxDownloadMb, (cancel) => progress.setCancel(cancel))
    } catch (error) {
      if (isCanceled(error)) {
        progress.reset()
                setDialogStatus(t('msg.downloadCanceled', { name: entry.name }))
        return
      }
            progress.fail(t('error.downloadFailed'))
      throw error
    }
                progress.done(t('status.done'))
    triggerBlobDownload(blob, entry.name)
    setTimeout(() => progress.reset(), 1500)
        setDialogStatus(t('msg.downloaded', { name: entry.name, size: formatBytes(blob.size) || String(blob.size) + ' B' }))
  })

    const localWrap = buildPane('local', t('meta.local'))
    const remoteWrap = buildPane('remote', t('meta.remote'))
  panes.local.wrap = localWrap
  panes.remote.wrap = remoteWrap

  const dual = document.createElement('div')
  dual.className = 'tt_sftpDual'
  dual.appendChild(localWrap)
  dual.appendChild(remoteWrap)
  card.appendChild(dual)
  // 行内编辑器（重命名 / 新建目录）：挂在两栏之下、状态行之上
  card.appendChild(editor)

  const foot = document.createElement('div')
  foot.className = 'tt_sftpFoot'
  const progress = makeProgressBar()
  foot.appendChild(progress.el)
  foot.appendChild(status)
  card.appendChild(foot)

  /**
   * 轮询一个服务端直传任务直到终态（0.12.0）：每 400ms 拉一次 job 快照，
   * 有 total 就显示真实百分比（否则不定进度 + 当前文件名）；期间 ✕ 打到
   * /transfer cancel 上。返回 'done' | 'canceled'；error 直接 throw
   * （runJoint 的 catch 会落到状态行，无需这里挂着红色进度条等调用方）。
   * 轮询而非 WebSocket：传输是低频、单次的，轮询的复杂度代价在这里更低。
   */
  const trackTransfer = async (jobId, label) => {
    let canceling = false
    progress.setCancel(() => {
      if (canceling) return
      canceling = true
      void fetch('/api/dsh-tty/local-fs/transfer', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'cancel', job: jobId }),
      }).catch(() => {})
    })
    try {
      for (;;) {
        await new Promise((resolve) => setTimeout(resolve, 400))
        const res = await fetch('/api/dsh-tty/local-fs/transfer', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'status', job: jobId }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok || data.ok !== true) {
          if (canceling) return 'canceled'
          throw new Error(String(data.error || 'HTTP ' + res.status))
        }
        const job = data.job
                if (job === null || typeof job !== 'object') throw new Error(t('error.invalidTaskState'))
        if (job.state === 'running') {
          const name = typeof job.current === 'string' && job.current !== '' ? job.current : label
                    setDialogStatus(t('msg.transferring', { name }), 'busy')
          if (Number.isFinite(job.total) && job.total > 0) progress.set(Number(job.bytes) || 0, job.total)
          else progress.pulse(Number(job.bytes) || 0)
          continue
        }
        if (job.state === 'canceled') return 'canceled'
                if (job.state !== 'done') throw new Error(String(job.error || t('error.transferFailed')))
        return 'done'
      }
    } finally {
      progress.setCancel(null)
    }
  }

  // 双栏两栏并排，给足高度（面板卡片高度的 56%，还能自己拖高）
  const cardRect = panelCardRect()
  const dualSize = cardRect === null ? 420 : Math.round(cardRect.height * 0.56)
    mountSftpSurface(card, t('panel.sftpDual', { label }), dualSize, owner)
  void panes.local.loadDir('')
  void panes.remote.loadDir('')
}

/* ============================ SFTP 文件浏览 ============================ */

/** 模态宿主（.tt_sshBackdrop，覆盖整个终端面板）。 */
let sftpDialogEl = null
/** 挂载位宿主（ttyPanel 的 pane，0.16.0）：终端保持可见时走这条。 */
let sftpDockPane = null

/**
 * 「眼前那块 SFTP 面板」的归属键。
 *
 * 省略参数的入口（Esc / 最小化 / 关面板 / 卡片的 ✕）都该关掉**看得见的那块**：
 * 从「+」菜单按连接簿条目打开的面板归属是全局（ownerSid: null），此时活动标签的
 * sid 对不上它——按活动标签去查会「装看不见」，于是 Esc 关不掉一块明晃晃的面板。
 */
function visibleSftpOwner() {
  if (sftpDockPane !== null && dockPaneVisible(sftpDockPane.ownerKey, activeSid)) return sftpDockPane.ownerKey
  return resolveDockOwner(undefined, activeSid)
}

/**
 * 这个归属标签下的 SFTP 是否已经开着。
 *
 * 按归属判定（0.18.4）：A 标签收起的文件浏览**不该**让 B 标签连接栏的「SFTP」变成哑
 * 按钮——在 A 开了 SFTP、切到 B 再点 SFTP 毫无反应，正是此前的现象之一。模态那份是
 * 全局的（它盖住整个面板，谁点都得先关掉它）。
 */
const isSftpOpen = (ownerKey = visibleSftpOwner()) =>
  sftpDialogEl !== null || (sftpDockPane !== null && sftpDockPane.ownerKey === ownerKey)

/**
 * 把 SFTP 卡片放进宿主（0.16.0）：终端面板开着**且本标签的挂载位空着**时挂成挂载位，
 * 终端继续可见可用；否则（面板没开 / 已被别的面板占用）退回原来的居中对话框。
 * 只挂不占用别人的位置——同一标签上已有 dsh-docker 的容器面板时不会把它挤掉。
 *
 * 0.18.4：占用者若是**别的标签**收起的面板，不算占用——那块面板本来就不该在眼前，
 * 挂载会把它收掉（`mountDockPane` 只保留一个 pane）。
 */
function mountSftpSurface(card, title, height, ownerKey) {
  const owner = resolveDockOwner(ownerKey, activeSid)
  const sameTabBusy = dockPane !== null && dockPane.ownerKey === owner
  if (modalEl !== null && !minimized && workEl !== null && !sameTabBusy) {
    try {
      // 文件列表是横向宽表（双栏更是两栏并排）：挂**下方**全宽比右侧窄栏好用，
      // 终端也因此保住宽度（长命令行不会折行）
      const pane = mountDockPane({ title, side: 'bottom', size: height, min: 200, ownerSid: owner, onClose: () => closeSftpDialog(owner) })
      pane.element.appendChild(card)
      sftpDockPane = pane
      return
    } catch (error) {
      console.warn('[dsh-tty] SFTP 挂到终端挂载位失败，回退对话框：' + (error instanceof Error ? error.message : String(error)))
    }
  }
  const backdrop = document.createElement('div')
  backdrop.className = 'tt_sshBackdrop'
  backdrop.appendChild(card)
  backdrop.addEventListener('mousedown', (event) => {
    if (event.target === backdrop) closeSftpDialog()
  })
  document.body.appendChild(backdrop)
  sftpDialogEl = backdrop
}

/**
 * 在途传输的取消按钮（0.12.0）：进度条在传输期间把它登记到这里，
 * closeSftpDialog 关窗体时顺手触发——关掉对话框不该留下「看不见但还在
 * 写远端/本机」的传输。
 */
let sftpCancelHook = null

function cancelActiveTransfer() {
  const btn = sftpCancelHook
  sftpCancelHook = null
  if (btn === null) return
  try {
    btn.click()
  } catch {
    /* 按钮已随 DOM 移除 */
  }
}

/** UTF-8 安全的 base64url（upload 的 x-dsh-sftp-meta 头用；服务端 Buffer base64url 解）。 */
function b64uEncode(text) {
  const bytes = new TextEncoder().encode(text)
  let bin = ''
  for (const byte of bytes) bin += String.fromCharCode(byte)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/* formatBytes / formatRate 见 client-src/stats-bar.js（状态条与 SFTP 共用同一份实现；
   D49 修复时搬过去，顺带让这两个纯函数第一次有了测试覆盖）。 */

function formatMtime(ms) {
  const date = new Date(ms)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (v) => String(v).padStart(2, '0')
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes())
}

function parentRemotePath(path) {
  const trimmed = String(path).replace(/\/+$/, '')
  const index = trimmed.lastIndexOf('/')
  if (index <= 0) return '/'
  return trimmed.slice(0, index)
}

/**
 * 本机路径的父级（0.19.0）：认 `\` 与 `/`、盘根与 UNC——已是根时返回 null
 * （调用方隐藏/忽略「..」），绝不落到 '/' 让 Windows 跳盘根。
 *   C:\Users\me → C:\Users → C:\ ；\\srv\share → \\srv\share（share 层是根）
 */
function parentLocalPath(path) {
  let p = String(path).trim()
  if (p === '') return null
  p = p.replace(/[\\/]+$/, '')
  if (p === '') return null // 根本身
  // Windows 盘符：C:\... 或 C:...
  const drive = p.match(/^([A-Za-z]:)(.*)$/)
  if (drive !== null) {
    const rest = drive[2]
    if (rest === '') return null // 已是盘根（C:）
    const idx = Math.max(rest.lastIndexOf('\\'), rest.lastIndexOf('/'))
    if (idx <= 0) return drive[1] + '\\' // 下一层就是盘根
    return drive[1] + rest.slice(0, idx)
  }
  // UNC：\\srv\share\...
  if (p.startsWith('\\\\') || p.startsWith('//')) {
    const body = p.slice(2)
    const parts = body.split(/[\\/]/).filter((seg) => seg !== '')
    if (parts.length <= 2) return null // \\srv 或 \\srv\share：已是根
    const idx = Math.max(body.lastIndexOf('\\'), body.lastIndexOf('/'))
    return p.slice(0, 2) + body.slice(0, idx)
  }
  // POSIX
  const idx = p.lastIndexOf('/')
  if (idx <= 0) return idx === 0 ? '/' : null
  return p.slice(0, idx)
}

function joinRemotePath(dir, name) {
  return dir.endsWith('/') ? dir + name : dir + '/' + name
}

/**
 * 传输进度条（0.11.0；0.12.0 加取消按钮）：状态行右侧的细条 + 百分比。
 * 返回受控对象：
 *   el —— 挂到 foot（status 前）的容器
 *   set(loaded, total, label) —— 更新进度（total 未知时显示文本不定进度）
 *   pulse(label) —— 总字节未知的忙碌态（如服务端直传）
 *   done(label) / fail(label) —— 终态着色
 *   reset() —— 隐藏并复位（下一次传输前调用）
 *   setCancel(handler) —— 显示 ✕ 取消按钮；传 null 隐藏（传输结束自动隐藏）
 * 进度只做视觉反馈，不阻塞调用方；label 可带「文件 i/n · 名字」。
 */
function makeProgressBar() {
  const el = document.createElement('div')
  el.className = 'tt_sftpProgress'
  const track = document.createElement('div')
  track.className = 'tt_sftpTrack'
  const fill = document.createElement('div')
  fill.className = 'tt_sftpFill'
  track.appendChild(fill)
  const pct = document.createElement('span')
  pct.className = 'tt_sftpPct'
  pct.textContent = ''
  // 取消按钮（传输期间可见）：点了就中断在途请求，服务端随之清理半截文件
  const cancelBtn = document.createElement('button')
  cancelBtn.type = 'button'
  cancelBtn.className = 'tt_sftpCancel'
    cancelBtn.title = t('btn.cancelTransfer')
  cancelBtn.textContent = '✕'
  cancelBtn.style.display = 'none'
  let onCancel = null
  cancelBtn.addEventListener('click', (event) => {
    event.stopPropagation()
    const handler = onCancel
    if (handler === null) return
    cancelBtn.disabled = true
    handler()
  })
  el.appendChild(track)
  el.appendChild(pct)
  el.appendChild(cancelBtn)
  const setText = (text) => { pct.textContent = text }
  // 效率：文本去重（同文本不重复写 DOM）+ 宽度只按整数百分比更新
  let lastText = ''
  let lastWidth = -1
  const setTextOnce = (text) => {
    if (text !== lastText) {
      lastText = text
      pct.textContent = text
    }
  }
  const setWidth = (percent) => {
    const rounded = Math.round(percent)
    if (rounded !== lastWidth) {
      lastWidth = rounded
      fill.style.width = rounded + '%'
    }
  }
  const hideCancel = () => {
    onCancel = null
    // 关对话框 / 最小化时也调它：保证不留「看不见但还在写远端」的传输
    if (sftpCancelHook === cancelBtn) sftpCancelHook = null
    cancelBtn.style.display = 'none'
    cancelBtn.disabled = false
  }
  const api = {
    el,
    reset() {
      delete el.dataset.active
      delete el.dataset.state
      lastText = ''
      lastWidth = -1
      this._last = undefined
      this._lastAt = 0
      this._rate = undefined
      fill.style.width = '0%'
      pct.textContent = ''
      hideCancel()
    },
    /** 挂上取消动作（显示 ✕）；传 null 收起按钮。终态自动收起。 */
    setCancel(handler) {
      if (handler === null || handler === undefined) {
        hideCancel()
        return
      }
      onCancel = handler
      // 登记到全局钩子：对话框被关掉时能顺手把在途传输一起收掉
      sftpCancelHook = cancelBtn
      cancelBtn.disabled = false
      cancelBtn.style.display = ''
    },
    /**
     * loaded/total 都明确：真实百分比 + 实时速率（bytes/s）。
     * 速率按调用间隔滑动平均（EMA），高频 chunk 不抖动。
     */
    set(loaded, total) {
      el.dataset.active = ''
      delete el.dataset.state
      const now = Date.now()
      if (this._last !== undefined && now > this._lastAt) {
        const inst = (loaded - this._last) / ((now - this._lastAt) / 1000)
        this._rate = this._rate === undefined ? inst : this._rate * 0.7 + inst * 0.3
      }
      this._last = loaded
      this._lastAt = now
      if (Number.isFinite(total) && total > 0) {
        const percent = Math.min(100, Math.max(0, (loaded / total) * 100))
        setWidth(percent)
        const rate = this._rate !== undefined && this._rate >= 0 ? formatRate(this._rate) : ''
        setTextOnce(Math.round(percent) + '%' + (rate !== '' ? ' · ' + rate : ''))
      } else {
        fill.style.width = ''
        const rate = this._rate !== undefined && this._rate >= 0 ? formatRate(this._rate) : ''
        setTextOnce(formatBytes(loaded) + (rate !== '' ? ' · ' + rate : ''))
      }
    },
    /** 总量未知（无 content-length）：走不定进度（条纹动画）+ 已传字节 + 速率。 */
    pulse(loaded) {
      el.dataset.active = ''
      delete el.dataset.state
      fill.style.width = '45%'
      fill.style.transition = 'none'
      setTimeout(() => { fill.style.transition = 'width .15s linear' }, 30)
      const now = Date.now()
      if (this._last !== undefined && now > this._lastAt) {
        const inst = (loaded - this._last) / ((now - this._lastAt) / 1000)
        this._rate = this._rate === undefined ? inst : this._rate * 0.7 + inst * 0.3
      }
      this._last = loaded
      this._lastAt = now
      const rate = this._rate !== undefined && this._rate >= 0 ? formatRate(this._rate) : ''
      setTextOnce((Number.isFinite(loaded) ? formatBytes(loaded) : '…') + (rate !== '' ? ' · ' + rate : ''))
    },
    done(label) {
      el.dataset.active = ''
      el.dataset.state = 'done'
      fill.style.width = '100%'
      lastWidth = 100
      hideCancel()
            setTextOnce(label !== undefined && label !== '' ? label : t('status.done'))
    },
    fail(label) {
      el.dataset.active = ''
      el.dataset.state = 'error'
      hideCancel()
            setTextOnce(label !== undefined && label !== '' ? label : t('status.failed'))
    },
    /** 文本状态（兼容仅文案提示）。 */
    text(text) {
      delete el.dataset.state
      if (text === undefined || text === '') {
        el.dataset.active = ''
        lastText = ''
        pct.textContent = ''
      } else {
        el.dataset.active = ''
        fill.style.width = ''
        lastWidth = -1
        setTextOnce(text)
      }
    },
  }
  return api
}

/**
 * 流式下载为 Blob 并汇报进度（0.11.0；0.12.0 支持取消）：fetch 端点带
 * content-length 时按 response.body reader 累积算百分比；无 length 时降级
 * 不定进度。返回 Blob（被取消时返回 null）。
 * maxMb（0 = 不限）：content-length 超限在开始前中止；无长度时累计超限中止
 * （reader.cancel 停下载流，避免整文件灌内存）。
 * registerCancel 传入回调登记函数：登记到的动作由调用方（进度条 ✕）触发，
 * 触发即 cancel 掉在途流——服务端 `res.on('close')` 随之回收 SFTP 读流。
 */
async function fetchBlobWithProgress(url, init, onProgress, maxMb = 0, registerCancel = null) {
  const maxBytes = maxMb > 0 ? maxMb * 1024 * 1024 : 0
  const controller = typeof AbortController === 'function' ? new AbortController() : null
  let canceled = false
  if (controller !== null) {
    init = { ...init, signal: controller.signal }
    if (typeof registerCancel === 'function') {
      registerCancel(() => {
        canceled = true
        controller.abort()
      })
    }
  }
  const res = await fetch(url, init)
  if (!res.ok) {
    let message = 'HTTP ' + res.status
    try {
      const data = await res.json()
      if (data !== null && typeof data === 'object' && typeof data.error === 'string') message = data.error
    } catch {
      /* 保底状态码 */
    }
    throw new Error(message)
  }
  const total = Number(res.headers.get('content-length'))
  const totalFinite = Number.isFinite(total) && total > 0
  if (maxBytes > 0 && totalFinite && total > maxBytes) {
    try {
      await res.body?.cancel()
    } catch {
      /* 已取消 */
    }
    throw new Error(t('error.downloadTooBig', { size: formatBytes(maxBytes) }))
  }
  const body = res.body
  if (body === null || typeof body.getReader !== 'function') {
    // 极老浏览器无流式 body：退回一次性 blob（无进度）
    const blob = await res.blob()
    if (maxBytes > 0 && blob.size > maxBytes) {
      throw new Error(t('error.downloadTooBig', { size: formatBytes(maxBytes) }))
    }
    if (totalFinite) onProgress(total, total)
    return blob
  }
  const reader = body.getReader()
  const chunks = []
  let received = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (value !== undefined && value.byteLength > 0) {
        received += value.byteLength
        if (maxBytes > 0 && received > maxBytes) {
          try {
            await reader.cancel()
          } catch {
            /* 已取消 */
          }
          throw new Error(t('error.downloadTooBig', { size: formatBytes(maxBytes) }))
        }
        chunks.push(value)
        onProgress(received, totalFinite ? total : NaN)
      }
    }
  } catch (error) {
    // 用户点 ✕：abort 让 fetch 以 AbortError 收尾，这里转成语义明确的信号
    if (canceled || (error !== null && typeof error === 'object' && error.name === 'AbortError')) {
      try {
        await reader.cancel()
      } catch {
        /* 已取消 */
      }
      throw new TransferCanceledError()
    }
    throw error
  }
  return new Blob(chunks, { type: 'application/octet-stream' })
}

/** 取消不是失败：单独一类，调用方据此走「已取消」文案而非红色错误态。 */
class TransferCanceledError extends Error {
  constructor() {
        super(t('msg.canceled'))
    this.name = 'TransferCanceledError'
  }
}

function isCanceled(error) {
  return error instanceof TransferCanceledError
}

/** 触发浏览器下载（Blob → 临时 <a download>）。 */
function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

/**
 * 收集拖放进来的文件（0.8.0）：目录条目经 webkitGetAsEntry 递归展开
 * （readEntries 每批 ≤100 需循环读完），返回 [{ relPath, file }]——relPath
 * 保留文件夹层级（如 "assets/img/logo.png"），上传端据此补齐远程父目录；
 * 无 entries（纯文件拖放/不支持 DataTransferItem）退回 dataTransfer.files。
 */
async function collectDroppedFiles(dataTransfer) {
  if (dataTransfer === null || dataTransfer === undefined) return []
  const items = typeof dataTransfer.items !== 'undefined' ? [...dataTransfer.items] : []
  const entries = []
  for (const item of items) {
    const entry = typeof item.webkitGetAsEntry === 'function' ? item.webkitGetAsEntry() : null
    if (entry !== null) entries.push(entry)
  }
  if (entries.length === 0) {
    return [...(dataTransfer.files ?? [])].map((file) => ({ relPath: file.name, file }))
  }
  const out = []
  // 上限（0 = 不限）：展开途中即拦截，避免大目录一次攒几千个 File 引用
  const maxFiles = sftpLimitsCache.maxUploadFiles
  const maxBytes = sftpLimitsCache.maxUploadMb > 0 ? sftpLimitsCache.maxUploadMb * 1024 * 1024 : 0
  const tooMany = () => maxFiles > 0 && out.length >= maxFiles
  let totalBytes = 0
  const walkEntry = (entry, prefix) => new Promise((resolve) => {
    if (tooMany()) {
      resolve()
      return
    }
    if (entry.isFile === true) {
      entry.file(
        (file) => {
          if (maxBytes > 0 && totalBytes + (file.size ?? 0) > maxBytes) {
            // 超总量上限：本次收集直接标记（由调用方报错）
            out._limitExceeded = true
          } else {
            out.push({ relPath: prefix + entry.name, file })
            totalBytes += file.size ?? 0
          }
          resolve()
        },
        () => resolve()
      )
      return
    }
    if (entry.isDirectory !== true) {
      resolve()
      return
    }
    const reader = entry.createReader()
    const readBatch = () => {
      reader.readEntries(async (batch) => {
        if (batch.length === 0) {
          resolve()
          return
        }
        for (const child of batch) {
          if (tooMany()) break
          await walkEntry(child, prefix + entry.name + '/')
        }
        if (tooMany()) {
          resolve()
          return
        }
        readBatch()
      }, () => resolve())
    }
    readBatch()
  })
  for (const entry of entries) await walkEntry(entry, '')
  return out
}

/**
 * SFTP 文件浏览对话框（0.7.0）：目录列表 / 进入上级与子目录（路径框回车跳转）/
 * 新建目录 / 重命名（行内编辑器）/ 删除（目录递归，🗑 二次点击确认）/
 * 上传（XHR 流式 + 进度）/ 下载（POST → blob → a[download]）。
 * specInput = {name}（连接簿条目，服务端按连接簿解析凭证）或内联 SSH 字段
 * （SSH 连接对话框「文件浏览」带字段进来）；每个请求都带全 spec，凭证只走
 * loopback POST 体 / meta 头，不进 URL。下载经浏览器内存（大文件建议终端 scp）。
 *
 * ownerSid（0.18.4）：这次浏览归属哪个标签——**所有入口都归属「打开它的那一刻的活动标签」**
 * （连接栏「SFTP」、连接簿条目的 📂、SSH 对话框 / 设置卡片的「文件浏览」用同一套规则，
 * 例如切走收起、切回恢复）；面板开着但一个标签都没有时归为「不隶属任何标签」，永远可见。
 */
function openSftpBrowser(specInput, ownerSid) {
  const ownerKey = resolveDockOwner(ownerSid, activeSid)
  if (isSftpOpen(ownerKey)) return
  const raw = specInput !== null && typeof specInput === 'object' ? specInput : {}
  const spec = {}
  if (typeof raw.name === 'string' && raw.name !== '') {
    spec.name = raw.name
  } else {
    for (const key of ['host', 'username', 'auth', 'keyPath', 'passphrase', 'password']) {
      if (typeof raw[key] === 'string' && raw[key] !== '') spec[key] = raw[key]
    }
    const port = Number(raw.port)
    if (Number.isInteger(port) && port >= 1 && port <= 65535) spec.port = port
    if (raw.agentForward === true) spec.agentForward = true
  }
  const label = spec.name ?? (spec.username !== undefined ? spec.username + '@' + String(spec.host ?? '') : String(spec.host ?? ''))
  // 双栏风格（设置 sftpStyle=dual）：转交双栏浏览器，共用互斥锁与关闭逻辑
  if (sftpStyleCache === 'dual') {
    openSftpDual(spec, label, ownerKey)
    return
  }

  const card = document.createElement('div')
  card.className = 'tt_sftpCard'

  // 标题行：标题 + 右上角 ✕ 关闭（挂进侧栏时由 CSS 隐藏，标题在侧栏标题栏上）
  const titleRow = document.createElement('div')
  titleRow.className = 'tt_sftpTitleRow'
  const title = document.createElement('div')
  title.className = 'tt_sshTitle'
  title.innerHTML = ICON_FOLDER + '<span></span>'
  title.lastElementChild.textContent = 'SFTP · ' + label
  const titleClose = document.createElement('button')
  titleClose.type = 'button'
  titleClose.className = 'tt_close'
    titleClose.title = t('btn.close')
  titleClose.innerHTML = ICON_CLOSE
  titleClose.addEventListener('click', () => closeSftpDialog(ownerKey))
  titleRow.appendChild(title)
  titleRow.appendChild(titleClose)
  card.appendChild(titleRow)

  /* 工具栏：路径输入（回车跳转）+ 刷新 / 新建目录 / 上传（隐藏 file input） */
  const bar = document.createElement('div')
  bar.className = 'tt_sftpBar'
  const pathInput = document.createElement('input')
  pathInput.type = 'text'
  pathInput.className = 'tt_sftpPath'
  pathInput.placeholder = t('placeholder.remotePath')
  pathInput.spellcheck = false
  pathInput.autocomplete = 'off'
  const refreshBtn = document.createElement('button')
  refreshBtn.type = 'button'
  refreshBtn.className = 'tt_toolBtn'
      refreshBtn.innerHTML = ICON_REFRESH + '<span>' + t('btn.refresh') + '</span>'
  const mkdirBtn = document.createElement('button')
  mkdirBtn.type = 'button'
  mkdirBtn.className = 'tt_toolBtn'
      mkdirBtn.innerHTML = ICON_MKDIR + '<span>' + t('btn.mkdir') + '</span>'
  const uploadBtn = document.createElement('button')
  uploadBtn.type = 'button'
  uploadBtn.className = 'tt_toolBtn'
  uploadBtn.innerHTML = ICON_UPLOAD + '<span>' + t('btn.upload') + '</span>'
  uploadBtn.title = t('btn.uploadTitle')
  const fileInput = document.createElement('input')
  fileInput.type = 'file'
  fileInput.multiple = true
  fileInput.style.display = 'none'
  bar.appendChild(pathInput)
  bar.appendChild(refreshBtn)
  bar.appendChild(mkdirBtn)
  bar.appendChild(uploadBtn)
  card.appendChild(bar)
  card.appendChild(fileInput)

  /* 行内编辑器（mkdir / rename 共用）：输入 + 确定 / 取消 */
  const editor = document.createElement('div')
  editor.className = 'tt_sftpEditor'
  editor.style.display = 'none'
  const editorInput = document.createElement('input')
  editorInput.type = 'text'
  editorInput.className = 'tt_cardInput'
  editorInput.spellcheck = false
  editorInput.autocomplete = 'off'
  const editorOk = document.createElement('button')
  editorOk.type = 'button'
  editorOk.className = 'tt_toolBtn'
    editorOk.textContent = t('btn.ok')
  const editorCancel = document.createElement('button')
  editorCancel.type = 'button'
  editorCancel.className = 'tt_toolBtn'
    editorCancel.textContent = t('btn.cancel')
  editor.appendChild(editorInput)
  editor.appendChild(editorOk)
  editor.appendChild(editorCancel)
  card.appendChild(editor)
  let editorCommit = null
  const closeEditor = () => {
    editor.style.display = 'none'
    editorCommit = null
  }
  editorOk.addEventListener('click', () => {
    void editorCommit?.()
  })
  editorCancel.addEventListener('click', closeEditor)
  editorInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      void editorCommit?.()
    } else if (event.key === 'Escape') {
      event.stopPropagation()
      closeEditor()
    }
  })

  const list = document.createElement('div')
  list.className = 'tt_sftpList'
  card.appendChild(list)

  const foot = document.createElement('div')
  foot.className = 'tt_sftpFoot'
  const status = document.createElement('div')
  status.className = 'tt_sftpStatus'
  const progress = makeProgressBar()
  foot.appendChild(progress.el)
  foot.appendChild(status)
  card.appendChild(foot)

  const state = { path: '', busy: false }
  const setDialogStatus = (text, kind) => {
    status.textContent = text
    if (kind === undefined) delete status.dataset.state
    else status.dataset.state = kind
  }
  const setBusy = (busy) => {
    state.busy = busy
    for (const el of [refreshBtn, mkdirBtn, uploadBtn]) el.disabled = busy
    pathInput.disabled = busy
  }

  const api = async (action, payload) => {
    const res = await fetch('/api/dsh-tty/sftp/' + action, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...spec, ...payload }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || data.ok !== true) throw new Error(String(data.error || 'HTTP ' + res.status))
    return data
  }

  /** 任务包装：置忙 → 执行 → 失败置错误态 → 解忙（loadDir 的错误在内部消化）。 */
  const runTask = async (busyText, task) => {
    if (state.busy) return
    setBusy(true)
    setDialogStatus(busyText, 'busy')
    try {
      await task()
    } catch (error) {
      setDialogStatus(String(error && error.message ? error.message : error), 'error')
    } finally {
      setBusy(false)
    }
  }

  const listRow = (icon, name, meta, kind) => {
    const row = document.createElement('button')
    row.type = 'button'
    row.className = 'tt_sftpRow'
    const iconEl = document.createElement('span')
    iconEl.className = 'tt_sftpIcon'
    iconEl.innerHTML = icon
    if (kind !== undefined) iconEl.dataset.kind = kind
    const nameEl = document.createElement('span')
    nameEl.className = 'tt_sftpName'
    nameEl.textContent = name
    nameEl.title = name
    row.appendChild(iconEl)
    row.appendChild(nameEl)
    if (meta !== '') {
      const metaEl = document.createElement('span')
      metaEl.className = 'tt_sftpMeta'
      metaEl.textContent = meta
      row.appendChild(metaEl)
    }
    return row
  }

  const appendAct = (row, glyph, titleText, onClick) => {
    const act = document.createElement('button')
    act.type = 'button'
    act.className = 'tt_sftpAct'
    act.innerHTML = glyph
    act.title = titleText
    act.addEventListener('click', (event) => {
      event.stopPropagation()
      onClick()
    })
    row.appendChild(act)
  }

  /** 删除按钮：首击变「确认?」（4s 复位），再击执行（目录带 recursive）。 */
  const appendDelete = (row, entry, full) => {
    const act = document.createElement('button')
    act.type = 'button'
    act.className = 'tt_sftpAct'
    act.innerHTML = ICON_TRASH
        act.title = entry.isDir ? t('btn.deleteEntryDir', { name: entry.name }) : t('btn.deleteEntry', { name: entry.name })
    let confirmTimer = null
    act.addEventListener('click', (event) => {
      event.stopPropagation()
      if (state.busy) return
      if (confirmTimer !== null) {
        clearTimeout(confirmTimer)
        confirmTimer = null
        act.innerHTML = ICON_TRASH
        delete act.dataset.danger
        void runTask(t('msg.deleting', { name: entry.name }), async () => {
          await api('remove', { path: full, recursive: entry.isDir === true })
          await loadDir(state.path)
                  setDialogStatus(t('msg.deleted', { name: entry.name }))
        })
        return
      }
            act.textContent = t('btn.confirm')
      act.dataset.danger = ''
      confirmTimer = setTimeout(() => {
        confirmTimer = null
        act.innerHTML = ICON_TRASH
        delete act.dataset.danger
      }, 4000)
    })
    row.appendChild(act)
  }

  const renderRows = (entries) => {
    list.textContent = ''
    if (state.path !== '' && state.path !== '/') {
              const up = listRow(ICON_UP, t('list.parentDir'), '', 'up')
      up.addEventListener('click', () => {
        void runTask(t('list.loading'), () => loadDir(parentRemotePath(state.path)))
      })
      list.appendChild(up)
    }
    const rows = Array.isArray(entries) ? entries : []
    if (rows.length === 0) {
      const empty = document.createElement('div')
      empty.className = 'tt_addMenuTitle'
              empty.textContent = t('list.emptyDir')
      list.appendChild(empty)
      return
    }
    // 大目录截断渲染（0.19.0，与双栏 renderRows 的 RENDER_CAP 同参数）：每行
    // 3-5 个按钮 + 独立监听器，万级条目把面板卡死——先渲染前 500 行，占位行提示
    const RENDER_CAP = 500
    for (const entry of rows.slice(0, RENDER_CAP)) {
      if (entry === null || typeof entry !== 'object' || typeof entry.name !== 'string' || entry.name === '') continue
      const full = joinRemotePath(state.path, entry.name)
      const metaParts = []
            if (entry.isDir === true) metaParts.push(t('meta.dir'))
      else metaParts.push(formatBytes(Number(entry.size)) || '—')
      const mtime = formatMtime(Number(entry.mtime))
      if (mtime !== '') metaParts.push(mtime)
      const row = listRow(entry.isDir ? ICON_FOLDER : entry.isSymlink ? ICON_LINK : ICON_FILE, entry.name, metaParts.join(' · '), entry.isDir === true ? 'dir' : entry.isSymlink === true ? 'link' : 'file')
      if (entry.isDir === true) {
        row.addEventListener('click', (event) => {
          if (event.target instanceof Element && event.target.closest('.tt_sftpAct') !== null) return
          void runTask(t('list.loading'), () => loadDir(full))
        })
      } else {
        // 文件单击即下载；行内按钮经 stopPropagation 不会二次触发
        row.addEventListener('click', (event) => {
          if (event.target instanceof Element && event.target.closest('.tt_sftpAct') !== null) return
          void downloadEntry(entry, full)
        })
        appendAct(row, ICON_DOWNLOAD, t('btn.download', { name: entry.name }), () => void downloadEntry(entry, full))
      }
            appendAct(row, ICON_EDIT, t('btn.rename', { name: entry.name }), () => {
                editorInput.placeholder = t('placeholder.newName')
        editorInput.value = entry.name
        editor.style.display = ''
        editorInput.focus()
        editorInput.select()
        editorCommit = async () => {
          const value = editorInput.value.trim()
          if (value === '' || value === entry.name) return
          closeEditor()
          await runTask(t('msg.renaming', { name: entry.name }), async () => {
            await api('rename', { from: full, to: joinRemotePath(state.path, value) })
            await loadDir(state.path)
          })
        }
      })
      appendDelete(row, entry, full)
      list.appendChild(row)
    }
    if (rows.length > RENDER_CAP) {
      const more = document.createElement('div')
      more.className = 'tt_addMenuTitle'
              more.textContent = t('list.truncated', { rest: rows.length - RENDER_CAP, total: rows.length })
      list.appendChild(more)
    }
  }

  /** 目录加载（busy 由调用方管）：path 为空时服务端 realpath 解析登录 home。 */
  const loadDir = async (pathArg) => {
    try {
      const data = await api('list', { path: pathArg ?? state.path })
      state.path = typeof data.path === 'string' && data.path !== '' ? data.path : '/'
      pathInput.value = state.path
      const count = Array.isArray(data.entries) ? data.entries.length : 0
      renderRows(data.entries)
      setDialogStatus(state.path + ' — ' + t('list.itemCount', { count }))
    } catch (error) {
      setDialogStatus(String(error && error.message ? error.message : error), 'error')
    }
  }

  const downloadEntry = (entry, full) => runTask(t('msg.downloading', { name: entry.name }), async () => {
    progress.reset()
    let blob
    try {
      blob = await fetchBlobWithProgress('/api/dsh-tty/sftp/download', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...spec, path: full }),
      }, (loaded, total) => {
        progress.set(loaded, total)
      }, sftpLimitsCache.maxDownloadMb, (cancel) => progress.setCancel(cancel))
    } catch (error) {
      if (isCanceled(error)) {
        // 取消不是失败：灰色文案 + 留在目录里（服务端已回收读流）
        progress.reset()
                setDialogStatus(t('msg.downloadCanceled', { name: entry.name }))
        return
      }
            progress.fail(t('error.downloadFailed'))
      throw error
    }
                progress.done(t('status.done'))
    triggerBlobDownload(blob, entry.name)
    setTimeout(() => progress.reset(), 1500)
        setDialogStatus(t('msg.downloaded', { name: entry.name, size: formatBytes(blob.size) || String(blob.size) + ' B' }))
  })

  /**
   * 单个文件上传（XHR 流式 + 进度 + 可取消）。cancelRef 由批次共享：
   * 点 ✕ 时调 abort() —— XHR 断开 → 宿主 req 'aborted' → 打断 pipeline
   * 并删除远端半截文件；剩余未发的文件随即被批次循环跳过（stopped）。
   */
  const uploadOne = (file, relPath, index, total, cancelRef) => new Promise((resolve, reject) => {
    const meta = b64uEncode(JSON.stringify({ ...spec, path: joinRemotePath(state.path, relPath) }))
    const xhr = new XMLHttpRequest()
    cancelRef.abort = () => {
      cancelRef.stopped = true
      xhr.abort()
    }
    xhr.open('POST', '/api/dsh-tty/sftp/upload')
    xhr.setRequestHeader('x-dsh-sftp-meta', meta)
    const label = total > 1 ? String(index) + '/' + String(total) + ' ' : ''
    // 文件名/序号归状态行（进度条只显示百分比，两者不重复）
    setDialogStatus(t('msg.uploadingName', { name: label + relPath }), 'busy')
    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) {
        progress.set(event.loaded, event.total)
      } else {
        progress.pulse(0)
      }
    })
    // abort 与 error 会成对到达（各浏览器顺序不一）：共用一条「只兑现一次」
    // 的收尾逻辑，stopped 标记决定它是取消还是真失败
    let settled = false
    const finish = (error) => {
      if (settled) return
      settled = true
      if (error === null) resolve()
      else reject(error)
    }
    xhr.addEventListener('load', () => {
      if (xhr.status === 200) {
        if (total === 1) progress.done(t('msg.uploadDone'))
        finish(null)
        return
      }
      if (cancelRef.stopped) return
      progress.fail(t('error.uploadFailed'))
      let message = 'HTTP ' + xhr.status
      try {
        const data = JSON.parse(xhr.responseText)
        if (data !== null && typeof data === 'object' && typeof data.error === 'string') message = data.error
      } catch {
        /* 保底 HTTP 状态码 */
      }
      finish(new Error(message))
    })
    xhr.addEventListener('error', () => {
      if (cancelRef.stopped) {
        finish(new TransferCanceledError())
        return
      }
      progress.fail(t('error.uploadFailed'))
      finish(new Error(t('error.networkError')))
    })
    // 用户点 ✕ 中断：XHR 以 abort 事件收尾，转成语义明确的信号
    xhr.addEventListener('abort', () => {
      finish(new TransferCanceledError())
    })
    xhr.send(file)
  })

  /**
   * 上传一批条目（选择器或拖入，relPath 保留文件夹层级）：文件夹拖入时先
   * 按 relPath 补齐远程父目录（mkdir parents，已存在的失败忽略——真正的
   * 失败由随后那一个文件的上传请求带出），再逐个流式上传。
   * 入口处做限制校验（文件数 / 单文件大小，0 = 不限），超限不发起上传。
   * 0.12.0：整批可取消——✕ 中断在途那一个，剩下的直接跳过（半截文件由
   * 服务端删除）。
   */
  const uploadFiles = async (items) => runTask(t('msg.uploading'), async () => {
    const limits = sftpLimitsCache
    // 拖拽收集途中已按 File 数/单文件上限拦截；这里兜底校验（file input 路径）
    if (limits.maxUploadFiles > 0 && items.length > limits.maxUploadFiles) {
      setDialogStatus(t('error.uploadCountExceeded', { max: limits.maxUploadFiles, count: items.length }), 'error')
      progress.fail(t('status.overLimit'))
      return
    }
    const maxBytes = limits.maxUploadMb > 0 ? limits.maxUploadMb * 1024 * 1024 : 0
    const tooBig = items.find((item) => maxBytes > 0 && (item.file?.size ?? 0) > maxBytes)
    if (tooBig !== undefined) {
      setDialogStatus(t('error.uploadTooBig', { size: formatBytes(maxBytes), name: String(tooBig.relPath ?? '') }), 'error')
      progress.fail(t('status.overLimit'))
      return
    }
    if (items._limitExceeded === true) {
      setDialogStatus(t('error.uploadTotalTooBig'), 'error')
      progress.fail(t('status.overLimit'))
      return
    }
    const dirs = new Set()
    for (const item of items) {
      const cut = item.relPath.lastIndexOf('/')
      if (cut <= 0) continue
      const dir = item.relPath.slice(0, cut)
      if (dirs.has(dir)) continue
      dirs.add(dir)
      await api('mkdir', { path: joinRemotePath(state.path, dir), parents: true }).catch(() => {})
    }
    progress.reset()
    // 批次共享的取消句柄：uploadOne 登记当前 XHR 的 abort，✕ 触发它
    const cancelRef = { stopped: false, abort: null }
    progress.setCancel(() => cancelRef.abort?.())
    let index = 0
    let uploaded = 0
    try {
      for (const item of items) {
        if (cancelRef.stopped) break
        index += 1
        cancelRef.abort = null
        try {
          await uploadOne(item.file, item.relPath, index, items.length, cancelRef)
          uploaded += 1
        } catch (error) {
          if (isCanceled(error) || cancelRef.stopped) break
          throw error
        }
      }
    } finally {
      // 真错误也收起 ✕（uploadOne 内部已 fail 着色；这里的 finally 防遗漏）
      progress.setCancel(null)
    }
    if (cancelRef.stopped) {
      progress.reset()
      setDialogStatus(t('msg.uploadCanceled', { done: uploaded, total: items.length }))
      await loadDir(state.path)
      return
    }
    progress.done(t('status.allDone'))
    setTimeout(() => progress.reset(), 1500)
    setDialogStatus(t('msg.uploadDoneCount', { count: items.length }))
    await loadDir(state.path)
  })

  refreshBtn.addEventListener('click', () => {
    void runTask(t('list.loading'), () => loadDir(state.path))
  })
  mkdirBtn.addEventListener('click', () => {
    if (state.busy) return
          editorInput.placeholder = t('placeholder.newDirName')
    editorInput.value = ''
    editor.style.display = ''
    editorInput.focus()
    editorCommit = async () => {
      const value = editorInput.value.trim()
      if (value === '') return
      closeEditor()
      await runTask(t('msg.creatingDir', { name: value }), async () => {
        await api('mkdir', { path: joinRemotePath(state.path, value) })
        await loadDir(state.path)
      })
    }
  })
  uploadBtn.addEventListener('click', () => {
    if (state.busy === false) fileInput.click()
  })
  fileInput.addEventListener('change', () => {
    const files = [...(fileInput.files ?? [])].map((file) => ({ relPath: file.name, file }))
    fileInput.value = ''
    if (files.length > 0) void uploadFiles(files)
  })
  // 拖拽上传（0.8.0）：文件 / 文件夹拖到对话框任意位置即上传到当前目录；
  // dragenter/leave 用计数器防子元素间移动闪烁
  let dragDepth = 0
  const setDragActive = (active) => {
    if (active) list.dataset.drag = ''
    else delete list.dataset.drag
  }
  card.addEventListener('dragenter', (event) => {
    event.preventDefault()
    dragDepth += 1
    setDragActive(true)
  })
  card.addEventListener('dragover', (event) => {
    event.preventDefault()
  })
  card.addEventListener('dragleave', () => {
    dragDepth = Math.max(0, dragDepth - 1)
    if (dragDepth === 0) setDragActive(false)
  })
  card.addEventListener('drop', (event) => {
    event.preventDefault()
    dragDepth = 0
    setDragActive(false)
    if (state.busy) return
    void collectDroppedFiles(event.dataTransfer).then((items) => {
      if (items.length > 0 || items._limitExceeded === true) void uploadFiles(items)
    })
  })
  pathInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return
    event.preventDefault()
    if (state.busy) return
    const target = pathInput.value.trim()
    if (target === '') return
    void runTask(t('list.loading'), () => loadDir(target))
  })
  const singleRect = panelCardRect()
  mountSftpSurface(card, 'SFTP · ' + label, singleRect === null ? 340 : Math.round(singleRect.height * 0.46), ownerKey)
  void runTask(t('status.connectingEllipsis'), () => loadDir(''))
}

/**
 * 关掉这个归属标签下的 SFTP（挂载位或模态兜底）。
 *
 * ownerKey 省略 = 当前活动标签：Esc / 最小化 / 关面板这些「顺手关掉眼前的东西」的
 * 入口都不用带参数。归属别的标签的**收起**面板不在这里被关掉——它不在眼前，关它
 * 等于悄悄掐断用户在另一台机器上的上传。
 */
function closeSftpDialog(ownerKey) {
  const owner = ownerKey === undefined ? visibleSftpOwner() : ownerKey
  const dialogEl = sftpDialogEl
  const pane = sftpDockPane !== null && sftpDockPane.ownerKey === owner ? sftpDockPane : null
  if (dialogEl === null && pane === null) return
  // 在途传输随窗体一起收掉（否则关了界面、服务端还在写远端半截文件）
  cancelActiveTransfer()
  // 先清引用：pane 的 ✕ 会经 onClose 回到这里，重复调用要是幂等的
  sftpDialogEl = null
  if (pane !== null) sftpDockPane = null
  if (dialogEl !== null) dialogEl.remove()
  if (pane !== null) pane.dispose()
}

function toggleSearch() {
  if (searchInputEl === null) return
  const hidden = searchInputEl.style.display === 'none' || searchInputEl.style.display === ''
  searchInputEl.style.display = hidden ? '' : 'none'
  const btn = modalEl !== null ? modalEl.querySelector('[data-act=search]') : null
  if (btn !== null) {
    if (hidden) btn.dataset.on = ''
    else delete btn.dataset.on
  }
  if (hidden) searchInputEl.focus()
}

/** 搜索高亮装饰：深色终端背景（#0d1117）下的高对比配色。 */
const SEARCH_DECORATIONS = {
  matchBackground: '#3d2b00',
  matchBorder: '#8a5a00',
  activeMatchBackground: '#b06a00',
  activeMatchBorder: '#ffb84d',
  matchOverviewRuler: '#8a5a00',
  activeMatchColorOverviewRuler: '#ffb84d',
}

function doSearch(backwards) {
  const tab = activeTab()
  if (tab === undefined || tab.search === undefined) return
  const query = searchInputEl.value
  if (query === '') return
  const options = { decorations: SEARCH_DECORATIONS }
  if (backwards) tab.search.findPrevious(query, options)
  else tab.search.findNext(query, options)
}

/** 断线自动重连：指数退避封顶 5s；面板开着就一直尝试，✕ 关闭时停止。 */
function scheduleReconnect() {
  // 面板关着**且**没有嵌入式终端在跑才放弃重连（嵌入终端可能在别人的面板里展示）
  if (intentionalClose || (modalEl === null && !hasEmbedded()) || reconnectTimer !== null) return
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    connect()
  }, reconnectDelay)
  reconnectDelay = Math.min(reconnectDelay * 2, 5000)
}

/** 持久标签判定：spawnSpec 带 persist 标记与稳定 persistName（tmux 侧按名接回）。 */
function isPersistentSpec(spec) {
  return spec !== null && typeof spec === 'object' && spec.persist === true && typeof spec.persistName === 'string' && spec.persistName !== ''
}

/**
 * 可自动重开的标签（0.14.0）：持久标签（tmux 按名接回）之外，**命令标签**
 * （spawnSpec.command，如 dsh-docker 的 `docker exec -it …`）也算——它的语义就是
 * 「跑这条命令」，宿主重启/断线后重新执行一次比留个「会话不存在」的报错更有用。
 */
function isRerunnableSpec(spec) {
  return isPersistentSpec(spec) || (spec !== null && typeof spec === 'object' && typeof spec.command === 'string' && spec.command !== '')
}

/** 持久化开启时的本地默认规格（设置开关是唯一开关：新标签默认 tmux 托管）。 */
function defaultLocalSpec() {
  return persistenceCache === 'tmux'
    ? { t: 'spawn', cwd: currentCwd(), persist: true, persistName: newPersistName() }
    : { t: 'spawn', cwd: currentCwd() }
}

/**
 * 连接建立后的恢复流程：
 *   - 面板内还有未退出标签（同页断线重连）→ 逐个 attach 回场；宿主已重启
 *     （sid 消失）的持久标签按原 persistName 重新 spawn，tmux -A 接回原现场；
 *   - 空面板但有 sessionStorage 持久化（页面刷新后重开）→ 查询宿主仍保活
 *     的会话，能 attach 的恢复标签；持久标签即使宿主重启也重新 spawn 接回
 *     （非持久标签维持旧行为丢弃）；
 *   - 全新窗口/浏览器（sessionStorage 为空，dsh 重启自动打开的新窗口）→
 *     localStorage 里的持久标签规格直接按 persistName respawn——不做事前
 *     存活确认（规格只随「标签被主动关闭/退出」淘汰，存在即用户意图；
 *     tmux 会话存活则 `tmux -A` 接回原现场，已消失则开新 shell）；
 *   - 都没有则新建首个标签。
 */
async function afterSocketOpen() {
  // 并发守卫（0.19.0）：socket.onopen 与 openModal「socket 已 OPEN」两个触发点
  // 可在重连窗口内并发跑——同一 persistName 双开（两个标签 attach 同一 tmux
  // 会话）、两次 restoreTab 用同一 sid 互相覆盖（前一个 xterm 永不 dispose）。
  // 先到者做完全部恢复，后到者直接让路。
  if (afterSocketRecovering) return
  afterSocketRecovering = true
  try {
    await afterSocketOpenInner()
  } finally {
    afterSocketRecovering = false
  }
}
let afterSocketRecovering = false

async function afterSocketOpenInner() {
  // 先拉一次配置：persistenceCache（持久化开关）决定默认本地标签是否 tmux 托管，
  // 必须在恢复/新建标签之前就位
  await refreshSshHosts()
  // 面板没开（例如只有 dsh-docker 的嵌入终端在跑）：只做嵌入会话的回场，
  // 不碰标签恢复、也不新建标签
  if (modalEl === null) {
    await recoverEmbeddedTabs()
    return
  }
  const restored = loadPersistedTabs()
  const specs = loadPersistSpecs()
  // 判据是「没有自己的标签」而不是 tabs.size===0——嵌入终端不占标签位
  if (![...tabs.values()].some((tab) => tab.embedded !== true)) {
    if (restored.length > 0 || specs.length > 0) {
      sendFrame({ t: 'sessions' })
      const frame = await waitFrame('sessions', 4000)
      const alive = new Map()
      if (frame !== null && Array.isArray(frame.list)) {
        for (const entry of frame.list) {
          if (entry !== null && typeof entry === 'object' && entry.attachable === true) alive.set(entry.sid, entry)
        }
      }
      const seenNames = new Set()
      for (const saved of restored) {
        if (alive.has(saved.sid)) {
          restoreTab(saved)
        } else if (isRerunnableSpec(saved.spawnSpec)) {
          // 持久标签按 tmux 名接回；命令标签重新执行一次（0.14.0）
          restoreTabAsNew(saved)
        } else {
          continue // 非持久且宿主侧已结束：维持旧行为丢弃
        }
        if (isPersistentSpec(saved.spawnSpec)) seenNames.add(saved.spawnSpec.persistName)
      }
      for (const spec of specs) {
        const name = spec.spawnSpec.persistName
        if (seenNames.has(name)) continue // sessionStorage 已恢复（避免同标签双开）
        restoreTabAsNew(spec)
        seenNames.add(name)
      }
      persistTabs()
    }
    if (![...tabs.values()].some((tab) => tab.embedded !== true)) {
      if (await sessionLimitNotice()) return // 上限已满：不再创建注定失败的空标签
      addTab()
    }
    return
  }
  // 同页断线重连：宿主重启过的持久标签 sid 已失效，先查 sessions 分流。
  // liveTabs 含嵌入式终端；respawnTab 按 embedded 分流到「原地重建」。
  // 还没 ready 的嵌入会话要排除——宿主可能尚未登记它的 sid，误判会双开
  const liveTabs = [...tabs.values()].filter((tab) => !tab.exited && (tab.embedded !== true || tab.spawned === true))
  const rerunnableTabs = liveTabs.filter((tab) => isRerunnableSpec(tab.spawnSpec))
  let deadPersistSids = null
  if (rerunnableTabs.length > 0) {
    sendFrame({ t: 'sessions' })
    const frame = await waitFrame('sessions', 4000)
    const aliveSids = new Set((frame !== null && Array.isArray(frame.list) ? frame.list : []).map((entry) => entry?.sid).filter((sid) => typeof sid === 'string'))
    deadPersistSids = rerunnableTabs.filter((tab) => !aliveSids.has(tab.sid))
    for (const tab of deadPersistSids) {
      // 换新 sid 重发 spawnSpec：持久标签 tmux -A 接回，命令标签重新执行命令
      respawnTab(tab.sid)
    }
  }
  const respawned = deadPersistSids !== null ? new Set(deadPersistSids.map((tab) => tab.sid)) : new Set()
  for (const tab of liveTabs) {
    if (respawned.has(tab.sid)) continue
    sendFrame({ t: 'attach', sid: tab.sid })
  }
}

/** 确保有一条可用连接（面板与嵌入终端共用；已连/在连则不动）。 */
function ensureSocket() {
  if (socket !== null && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return
  connect()
}

/**
 * 嵌入终端的回场（面板没开时走这里，0.15.0）：宿主保活的 attach 回去，宿主重启过
 * 的就按原 spawnSpec 重新跑一次命令（命令标签语义 = 跑这条命令）。非命令规格
 * （理论上不会出现）标成已退出，交给调用方的遮罩提示。
 */
async function recoverEmbeddedTabs() {
  const embeddedTabs = [...tabs.values()].filter((tab) => tab.embedded === true && !tab.exited)
  if (embeddedTabs.length === 0) return
  sendFrame({ t: 'sessions' })
  const frame = await waitFrame('sessions', 4000)
  const alive = new Set((frame !== null && Array.isArray(frame.list) ? frame.list : []).map((entry) => entry?.sid).filter((sid) => typeof sid === 'string'))
  for (const tab of embeddedTabs) {
    // 刚挂上、还没收到 ready 的会话：宿主侧的会话表可能还没登记（SSH 建链有耗时），
    // 这时按「已死」重开会话会导致双开——直接跳过，交给它的 spawn 帧正常走完
    if (tab.spawned !== true) continue
    if (alive.has(tab.sid)) {
      sendFrame({ t: 'attach', sid: tab.sid })
    } else if (isRerunnableSpec(tab.spawnSpec)) {
      respawnEmbedded(tab)
    } else {
      tab.exited = true
      tab.live = false
      showTabOverlay(tab, t('status.ended'), t('btn.clickRerun'), 'exited')
    }
  }
}

function connect() {
  if (socket !== null) {
    try {
      socket.close()
    } catch {
      /* 忽略 */
    }
    socket = null
  }
  intentionalClose = false
  clearTimeout(reconnectTimer)
  reconnectTimer = null
  connecting = true
  setPanelStatus(t('status.connectingEllipsis'), '')
  try {
    socket = new WebSocket(wsUrl())
  } catch (error) {
    connecting = false
    setPanelStatus(t('error.connectFailed', { error: error.message }), 'error')
    scheduleReconnect()
    return
  }

  socket.onopen = () => {
    connecting = false
    reconnectDelay = 1000
    // 新连接上没有订阅记录：置空后由 ready / switchTab 重新对齐（幂等）
    statsSubSid = null
    setPanelStatus(t('status.connected'), 'connected')
    // 先补发挂起的创建帧（嵌入式终端冷启动时排在这里），再走面板的恢复流程
    for (const entry of [...pendingSpawns]) {
      pendingSpawns.delete(entry)
      if (tabs.has(entry.tab.sid)) sendFrame(entry.frame)
    }
    void afterSocketOpen()
  }
  socket.onmessage = (event) => {
    let msg
    try {
      msg = JSON.parse(event.data)
    } catch {
      return
    }
    const sid = msg.sid
    if (msg.t === 'ready') {
      // SSH 会话 ready 带 target（user@host[:port]，pid 为 null）；本地带 pid。
      // attach 重连也复用 ready 帧（多带 reattached:true），后跟一帧 data 回放缓冲
      const target = typeof msg.target === 'string' ? msg.target : ''
      setTabStatus(sid, msg.kind === 'ssh' ? t('status.connectedSsh', { target: target !== '' ? target + ' ' : '' }) : t('status.connectedPid', { pid: msg.pid }), 'connected')
      const tab = tabs.get(sid)
      if (tab !== undefined) {
        tab.exited = false
        tab.spawned = true
        tab.live = true
        tab.errored = false
        tab.target = target // 连接栏展示用（label 可能是自定义连接名）
        tab.persistTmux = msg.persist === true // tmux 持久会话（连接栏徽标用）
        if (msg.kind === 'ssh' && target !== '' && !tab.label) {
          tab.label = target // 标签缺标题时（如旧缓存条目）用宿主回显的 target
          renderTabbar()
        }
        renderConnbar()
        refreshTabDot(sid)
        showTabOverlay(tab, '')
        sendResize(tab) // spawn/attach 就绪后补一次精确尺寸
        if (msg.persist === true) {
          // 持久标签（tmux）：字体加载后的收缩等会在重画后推开 scrollback，
          // 字体就绪后跑一次自愈（onResize 的切换/窗口抖动自愈见 createTerminal）
          const fontsReady = document.fonts !== undefined && document.fonts.ready !== undefined ? document.fonts.ready : Promise.resolve()
          Promise.race([fontsReady, new Promise((r) => setTimeout(r, 500))]).then(() => scheduleSettle(150))
        }
        syncEntryBadge() // 断线重连后徽标计数恢复
        // 就绪/重连后对齐状态条订阅（spawn 前的 statsOn 会被宿主按未知 sid 忽略）
        resubscribeStats(sid)
        persistTabs()
      }
    } else if (msg.t === 'sessions') {
      // agent 开关会话时宿主主动推的清单（0.20.0）：把 agent 开的会话建成可见标签。
      // 注意 waitFrame('sessions') 的拉取路径也走这里（重复采纳是幂等的，见
      // adoptAgentSessions 的 tabs.has 去重）。
      syncAgentTabs(msg.list)
    } else if (msg.t === 'data') {
      const tab = tabs.get(sid)
      if (tab !== undefined && tab.term !== null) {
        tab.term.write(String(msg.d ?? ''))
        flashDockActivity()
      }
    } else if (msg.t === 'exit') {
      const tab = tabs.get(sid)
      if (tab !== undefined) {
        tab.exited = true
        tab.live = false
        tab.stats = null // 会话结束：状态条数据作废（宿主侧采集器也随会话停）
        if (sid === activeSid) applyStatsBar()
        const code = msg.code !== null && msg.code !== undefined ? 'code=' + msg.code : ''
        const signal = msg.signal !== null && msg.signal !== undefined ? 'signal=' + msg.signal : ''
        setTabStatus(sid, t('status.exitedWith', { detail: [code, signal].filter(Boolean).join(' ') }), '')
        renderConnbar()
        refreshTabDot(sid)
        showTabOverlay(tab, t('status.exited'), t('btn.clickReopen'), 'exited')
        syncEntryBadge() // 最小化时徽标计数同步减少
        persistTabs() // 已退出的标签不再持久化
      }
    } else if (msg.t === 'stats') {
      // 服务器状态条（0.17.0）：只存数据 + 重画；显隐由 applyStatsBar 统一裁决。
      // 整段兜底：一帧坏数据（旧版宿主/第三方实现/假数据）绝不能把 onmessage
      // 抛崩——那会连带后面所有 WS 帧（data/exit）一起失效。
      try {
        const tab = tabs.get(sid)
        if (tab !== undefined) {
          const stats = msg.stats
          // 结构不合法或一个可用字段都没有 → 按「无数据」处理（隐藏，而不是显示一排「无」）
          tab.stats = hasUsableStats(stats) ? stats : null
          tab.statsAt = Date.now()
          if (sid === activeSid) applyStatsBar()
        }
      } catch (error) {
        console.warn('[dsh-tty] stats 帧处理失败（已忽略）: ' + (error instanceof Error ? error.message : String(error)))
      }
    } else if (msg.t === 'error') {
      setTabStatus(sid, t('status.error', { message: String(msg.m ?? '') }), 'error')
      if (typeof sid === 'string') {
        const tab = tabs.get(sid)
        if (tab !== undefined) {
          if (!tab.live) tab.errored = true // spawn/attach 失败：连接栏状态点转错误色
          renderConnbar()
          refreshTabDot(sid)
          showTabOverlay(tab, t('status.errored'), t('status.retryHint', { message: String(msg.m ?? '') }), 'error')
        }
      } else {
        showBodyOverlay(t('btn.clickRetry'))
      }
    }
  }
  socket.onclose = () => {
    connecting = false
    if (intentionalClose) return
    setPanelStatus(t('status.disconnectedReconnecting'), 'error')
    // 不再把未退出标签标记为 exited：会话在宿主保活，重连后 attach 恢复
    for (const tab of tabs.values()) {
      if (!tab.exited) showTabOverlay(tab, t('status.disconnected'), t('status.reconnecting'), 'info')
    }
    scheduleReconnect()
  }
  socket.onerror = () => {
    /* onclose 会跟随触发 */
  }
}

function showBodyOverlay(text) {
  if (bodyOverlayEl === null) return
  bodyOverlayEl.textContent = text
}

/**
 * 让终端面板**可见**：没有就创建，最小化中就恢复。
 *
 * 别把这里退回成 `if (modalEl === null) openModal()`：**最小化不是关闭**——`modalEl` 还在，
 * 于是内容会被加进一个隐藏的弹窗，消费方（dsh-docker 卡片上的「终端」按钮）看到的是
 * 「点了没反应」。`openModal()` 自己已经处理了「最小化中 → restoreModal()」，缺的只是有人叫它。
 * 实测复现：开一个 exec 标签 → 再开一个终端标签 → 最小化 → 再点 exec，毫无反应。
 */
function ensureModalVisible() {
  if (modalEl === null || minimized) openModal()
}

/**
 * 剪贴板降级（0.19.0）：`navigator.clipboard` 在非 secure context（如
 * `http://<局域网IP>:3080`）下是 undefined——此前直接调 writeText/readText
 * 会在「粘贴」处同步取属性抛 TypeError，整条复制/粘贴不可用（localhost 自测
 * 发现不了）。降级路径：隐藏 textarea + execCommand（copy 普遍可用；paste 在
 * 部分浏览器被禁，失败时提示用 Ctrl+V）。
 */
function clipboardAvailable() {
  return typeof navigator !== 'undefined' && navigator.clipboard !== undefined && typeof navigator.clipboard.writeText === 'function'
}

async function copyTerminalText(text) {
  if (clipboardAvailable()) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      /* 权限被拒等：落到降级 */
    }
  }
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  let ok = false
  try {
    ok = document.execCommand('copy')
  } catch {
    ok = false
  }
  textarea.remove()
  if (!ok) setStatus(t('error.copyFailed'), 'error')
  return ok
}

async function pasteTerminalText(tab) {
  if (clipboardAvailable() && typeof navigator.clipboard.readText === 'function') {
    try {
      const text = await navigator.clipboard.readText()
      if (text !== '') sendFrame({ t: 'input', sid: tab.sid, d: text })
      return true
    } catch {
      /* 无权限：落到降级 */
    }
  }
  const textarea = document.createElement('textarea')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.focus()
  let ok = false
  try {
    ok = document.execCommand('paste')
    const text = ok ? textarea.value : ''
    if (text !== '') sendFrame({ t: 'input', sid: tab.sid, d: text })
  } catch {
    ok = false
  }
  textarea.remove()
  if (!ok) setStatus(t('error.pasteFailed'), 'error')
  return ok
}

function openModal() {
  if (modalEl !== null) {
    // 已在运行：最小化中则从悬浮条恢复，否则保持现状
    if (minimized) restoreModal()
    return
  }
  ensureStyle()

  modalEl = document.createElement('div')
  modalEl.className = 'tt_modalBackdrop'
  modalEl.innerHTML =
    '<div class="tt_modal">' +
    // 两行头部：标签行（图标 + 标签区 + 状态 + 工具/窗口按钮）+ SSH 连接栏
    '<div class="tt_header">' +
    '<span class="tt_titleIcon">' + TERMINAL_ICON + '</span>' +
    '<div class="tt_tabs"></div>' +
    '<div class="tt_status"><span class="tt_statusDot"></span><span class="tt_statusText">' + t('status.initializing') + '</span></div>' +
    '<input class="tt_searchInput" style="display:none" placeholder="' + t('placeholder.search') + '" />' +
    '<span class="tt_toolGroup">' +
    '<button class="tt_toolBtn tt_iconBtn" data-act="search" title="' + t('btn.searchTitle') + '">' + ICON_SEARCH + '</button>' +
    '<button class="tt_toolBtn tt_iconBtn" data-act="clear" title="' + t('btn.clearTitle') + '">' + ICON_CLEAR + '</button>' +
    '<button class="tt_toolBtn tt_iconBtn" data-act="copy" title="' + t('btn.copyTitle') + '">' + ICON_COPY + '</button>' +
    '<button class="tt_toolBtn tt_iconBtn" data-act="paste" title="' + t('btn.pasteTitle') + '">' + ICON_PASTE + '</button>' +
    '</span>' +
    '<span class="tt_winGroup">' +
    '<button class="tt_min" title="' + t('btn.minimizeTitle') + '">' + ICON_MIN + '</button>' +
    '<button class="tt_close" title="' + t('btn.closePanelTitle') + '">' + ICON_CLOSE + '</button>' +
    '</span>' +
    '</div>' +
    // 连接栏：左侧连接状态，右侧 SFTP / 扩展按钮；本地终端时隐藏（renderConnbar 控制）
    '<div class="tt_connbar" data-hidden><div class="tt_connArea"><span class="tt_connDot"></span><span class="tt_connTarget">—</span><span class="tt_connBadge"></span></div><div class="tt_connActions"></div></div>' +
    // 终端区与「右侧挂载位」并排：其他插件（如 dsh-docker）经 ttyPanel.mountPane
    // 把界面挂进 .tt_work，终端保持可见——这是从 SSH 连接栏打开容器面板的主路径
    '<div class="tt_work">' +
    // 状态条（0.17.0）与终端容器同级：绝对定位在 body 顶部，显隐只改 .tt_term 的
    // top 偏移——不能塞进 .tt_term 里，否则 FitAddon 会把条高算进行数
    '<div class="tt_body"><div class="tt_statsBar" hidden></div><div class="tt_overlay"></div></div>' +
    '</div>' +
    '</div>'
  document.body.appendChild(modalEl)

  statusChipEl = modalEl.querySelector('.tt_status')
  statusEl = modalEl.querySelector('.tt_statusText')
  statusDotEl = modalEl.querySelector('.tt_statusDot')
  tabbarEl = modalEl.querySelector('.tt_tabs')
  connbarEl = modalEl.querySelector('.tt_connbar')
  connDotEl = modalEl.querySelector('.tt_connDot')
  connTargetEl = modalEl.querySelector('.tt_connTarget')
  connBadgeEl = modalEl.querySelector('.tt_connBadge')
  connActionsEl = modalEl.querySelector('.tt_connActions')
  workEl = modalEl.querySelector('.tt_work')
  bodyEl = modalEl.querySelector('.tt_body')
  statsBarEl = modalEl.querySelector('.tt_statsBar')
  // 新面板 = 新的（空的）状态条节点：上一份条目引用与数据签名一起作废，下次显示重建
  discardStatsItems()
  statsSubSid = null
  ensureStatsStaleTimer()
  bodyOverlayEl = modalEl.querySelector('.tt_body > .tt_overlay')
  searchInputEl = modalEl.querySelector('.tt_searchInput')

  bodyOverlayEl.addEventListener('click', () => {
    bodyOverlayEl.textContent = ''
    connect()
  })
  const searchBtn = modalEl.querySelector('[data-act=search]')
  searchBtn.addEventListener('click', () => {
    toggleSearch()
    if (searchInputEl.style.display !== 'none') searchInputEl.focus()
  })
  // 搜索框开合与按钮按下态联动（data-on 由 toggleSearch 维护）
  searchBtn.dataset.on = ''
  searchInputEl.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      doSearch(event.shiftKey)
    } else if (event.key === 'Escape') {
      // 只收起搜索框：阻断冒泡，避免文档级 Esc 处理器把整个面板最小化
      event.stopPropagation()
      searchInputEl.style.display = 'none'
    }
  })
  modalEl.querySelector('[data-act=clear]').addEventListener('click', () => {
    const tab = activeTab()
    if (tab !== undefined && tab.term !== null) tab.term.clear()
  })
  modalEl.querySelector('[data-act=copy]').addEventListener('click', () => {
    const tab = activeTab()
    if (tab === undefined || tab.term === null) return
    const selection = tab.term.getSelection()
    if (selection !== '') void copyTerminalText(selection)
  })
  modalEl.querySelector('[data-act=paste]').addEventListener('click', () => {
    const tab = activeTab()
    if (tab === undefined) return
    void pasteTerminalText(tab)
  })
  modalEl.querySelector('.tt_min').addEventListener('click', () => {
    minimizeModal()
  })
  modalEl.querySelector('.tt_close').addEventListener('click', () => {
    closeModal()
  })
  // 点空白处 = 最小化而不是关闭：会话保活，随时从悬浮条恢复
  modalEl.addEventListener('mousedown', (event) => {
    if (event.target === modalEl) minimizeModal()
  })
  document.addEventListener('keydown', onModalKeydown)

  resizeObserver = new ResizeObserver(() => {
    if (minimized) return // display:none 下 fit 尺寸无意义，恢复时统一重算
    // 面板变窄/变矮时 dock 也要跟着收（否则会把终端挤到没有位置）
    applyDockGeometry()
    refitTerminal(activeTab())
  })
  resizeObserver.observe(bodyEl)

  // 首帧渲染：标签区的「+」要立即可见；连接栏按当前标签决定显隐
  renderTabbar()
  renderConnbar()

  // 连接可能已经因为嵌入终端而存在：复用它，并把面板自己的标签/恢复流程补上
  if (socket !== null && socket.readyState === WebSocket.OPEN) void afterSocketOpen()
  else connect()
}

/** 右下角悬浮条：展示会话数 / 连接状态，点击恢复窗口。 */
function buildDock() {
  dockEl = document.createElement('div')
  dockEl.className = 'tt_dock'
  dockEl.title = t('btn.restoreDock')
  dockEl.innerHTML =
    '<span class="tt_dockTitle">' + TERMINAL_ICON + '<span>' + t('panel.title') + '</span><span class="tt_dockCount"></span></span>' +
    '<span class="tt_dockStatus"></span>' +
    '<span class="tt_dockDot"></span>' +
    '<button class="tt_dockClose" title="' + t('btn.closePanelTitle') + '">✕</button>'
  dockCountEl = dockEl.querySelector('.tt_dockCount')
  dockStatusEl = dockEl.querySelector('.tt_dockStatus')
  dockDotEl = dockEl.querySelector('.tt_dockDot')
  const running = [...tabs.values()].filter((tab) => !tab.exited).length
  dockCountEl.textContent = tabs.size > 0 ? '· ' + running + '/' + tabs.size : ''
  // 快照当前状态（此后 setStatus 会持续同步）
  if (statusEl !== null) dockStatusEl.textContent = statusEl.textContent
  if (statusDotEl !== null) dockDotEl.dataset.state = statusDotEl.dataset.state ?? ''
  dockEl.addEventListener('click', (event) => {
    if (event.target.closest('.tt_dockClose') !== null) {
      event.stopPropagation()
      closeModal()
      return
    }
    restoreModal()
  })
  document.body.appendChild(dockEl)
}

/** 最小化：隐藏弹窗但保留 DOM / WebSocket / xterm 缓冲；状态合并进侧边栏入口。 */
function minimizeModal() {
  if (modalEl === null || minimized) return
  closeAddMenu()
  closeSshDialog()
  // SFTP 不关（0.19.0）：挂载位 pane 随面板显隐走（挂载位契约「面板最小化 /
  // 恢复跟着走，消费者不需要做任何事」），收起态的 SFTP 浮层藏起、恢复时放回
  // ——最小化只是想看别的窗口，不该把在途传输取消掉（远端留半截文件）
  minimized = true
  if (sftpDialogEl !== null) sftpDialogEl.style.display = 'none'
  if (searchInputEl !== null) searchInputEl.style.display = 'none'
  modalEl.dataset.minimized = ''
  // 最小化 = 没有可见终端：退订（宿主侧停表、关远端 exec channel），收起状态条，
  // 陈旧检测定时器一并停（0.19.0：此前只在 closeModal 停，最小化期间空转）
  stopStatsStaleTimer()
  syncStatsSubscription()
  applyStatsBar()
  if (document.querySelector('[data-dsh-tty-entry]') !== null) {
    syncEntryBadge()
  } else {
    // 兜底：侧边栏入口不在（被宿主卸载等）才用紧凑悬浮条
    buildDock()
    dockEl.classList.add('tt_dockCompact')
  }
}

/**
 * 最小化状态的唯一可见载体是侧边栏「终端」入口本身：
 * 入口右侧追加「运行中/总数」徽标与状态点，点击入口即恢复（openModal 已处理）。
 */
function syncEntryBadge() {
  const entry = document.querySelector('[data-dsh-tty-entry]')
  if (entry === null) return
  let badge = entry.querySelector('.tt_sidebarEntryBadge')
  if (!minimized) {
    if (badge !== null) badge.remove()
    delete entry.dataset.minimized
    entry.removeAttribute('title')
    return
  }
  if (badge === null) {
    badge = document.createElement('span')
    badge.className = 'tt_sidebarEntryBadge'
    badge.innerHTML = '<span class="tt_sidebarBadgeDot"></span><span class="tt_sidebarBadgeCount"></span>'
    entry.appendChild(badge)
  }
  // 入口的「已最小化」态（强调底色 + 显示徽标）靠这个属性驱动，别漏
  entry.dataset.minimized = ''
  entry.title = t('status.minimized')
  const running = [...tabs.values()].filter((tab) => !tab.exited).length
  badge.querySelector('.tt_sidebarBadgeCount').textContent = running + '/' + tabs.size
  const dot = badge.querySelector('.tt_sidebarBadgeDot')
  if (dot !== null && statusDotEl !== null) dot.dataset.state = statusDotEl.dataset.state ?? ''
}

/** 最小化期间有输出到达：脉冲提示（入口徽标状态点，兜底时为悬浮条状态点）。 */
function flashDockActivity() {
  if (!minimized) return
  const dot = document.querySelector('[data-dsh-tty-entry] .tt_sidebarBadgeDot') ?? dockDotEl
  if (dot === null) return
  dot.dataset.active = ''
  clearTimeout(dockActivityTimer)
  dockActivityTimer = setTimeout(() => {
    delete dot.dataset.active
  }, 900)
}

/** 从悬浮条恢复弹窗：重新 fit 并把精确尺寸同步给 PTY。 */
function restoreModal() {
  if (modalEl === null || !minimized) return
  minimized = false
  delete modalEl.dataset.minimized
  // 最小化期间被藏起的 SFTP 浮层放回（传输进度还在原界面里）
  if (sftpDialogEl !== null) sftpDialogEl.style.display = ''
  clearTimeout(dockActivityTimer)
  if (dockEl !== null) {
    dockEl.remove()
    dockEl = null
  }
  dockCountEl = null
  dockStatusEl = null
  dockDotEl = null
  syncEntryBadge()
  ensureStatsStaleTimer() // 与 minimizeModal 成对（0.19.0）：恢复时重新起陈旧检测
  syncStatsSubscription()
  applyStatsBar()
  const tab = activeTab()
  if (tab !== undefined && tab.fit !== undefined) {
    try {
      tab.fit.fit()
    } catch {
      /* 忽略 */
    }
    if (tab.spawned && !tab.exited) sendResize(tab)
  }
  if (tab !== undefined && tab.term !== null) tab.term.focus()
}

function closeModal() {
  if (modalEl === null) return
  // 面板被收掉：先通知 pane 的消费者清理自己的界面（React root 等），再摘 DOM
  teardownDockPane(true)
  // 还有嵌入终端（如 dsh-docker 抽屉里的那个）在跑时：连接不能断，也不能标成
  // 主动关闭——否则重连停摆、别人的终端跟着黑掉
  const keepSocket = hasEmbedded()
  intentionalClose = !keepSocket
  minimized = false
  closeAddMenu()
  closeConnbarMoreMenu()
  closeTunnelPopover()
  closeSshDialog()
  closeSftpDialog()
  clearTimeout(dockActivityTimer)
  clearTimeout(reconnectTimer)
  reconnectTimer = null
  reconnectDelay = 1000
  if (dockEl !== null) {
    dockEl.remove()
    dockEl = null
  }
  dockCountEl = null
  dockStatusEl = null
  dockDotEl = null
  syncEntryBadge()
  if (socket !== null) {
    for (const tab of tabs.values()) {
      // 只结束面板自己的会话；嵌入终端由调用方（抽屉关闭时）收尾
      if (!tab.exited && tab.embedded !== true) sendFrame({ t: 'kill', sid: tab.sid })
    }
    if (!keepSocket) {
      try {
        socket.close()
      } catch {
        /* 忽略 */
      }
      socket = null
    }
  }
  if (resizeObserver !== null) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
  for (const [sid, tab] of [...tabs]) {
    if (tab.embedded === true) continue // 嵌入终端的 xterm 与 DOM 归挂载方管
    if (tab.term !== null) {
      try {
        tab.term.dispose()
      } catch {
        /* 忽略 */
      }
    }
    tabs.delete(sid)
  }
  activeSid = null
  // 胶囊归属一并清空：不变式是「statusSid ∈ {null, activeSid}」，
  // 只清 activeSid 会让它悬垂在一个已经关掉的标签上
  statusSid = null
  document.removeEventListener('keydown', onModalKeydown)
  modalEl.remove()
  modalEl = null
  workEl = null
  statusChipEl = null
  statusEl = null
  statusDotEl = null
  tabbarEl = null
  connbarEl = null
  connDotEl = null
  connTargetEl = null
  connBadgeEl = null
  connActionsEl = null
  closeTunnelPopover()
  stopStatsStaleTimer()
  statsBarEl = null
  discardStatsItems()
  statsSubSid = null
  bodyEl = null
  bodyOverlayEl = null
  searchInputEl = null
  tabCounter = 0
  // 主动关闭 = 结束全部会话：清掉持久化，下次打开从全新面板开始
  try {
    sessionStorage.removeItem(PERSIST_KEY)
  } catch {
    /* 忽略 */
  }
}

function onModalKeydown(event) {
  if (event.key === 'Escape' && modalEl !== null) {
    event.preventDefault()
    // Esc 优先关浮层（SFTP 浏览 / SSH 对话框 /「+」菜单），再最小化（会话保活）；✕ 才真正关闭
    if (sftpDialogEl !== null) {
      closeSftpDialog()
      return
    }
    if (sshDialogEl !== null) {
      closeSshDialog()
      return
    }
    if (addMenuEl !== null) {
      closeAddMenu()
      return
    }
    minimizeModal()
  }
}

/* ================================ 侧边栏入口 ================================ */

function sidebarRoot() {
  const column = document.querySelector('[data-pane="sidebar"], [class*="sidebarCol"]')
  if (column === null) return undefined
  return column.querySelector('[class*="logoRow"]')?.parentElement ?? column.firstElementChild
}

function newSessionButton(root) {
  const nested = root.querySelector('button[class*="newSession"]')
  if (nested !== null) return nested
  for (const child of root.children) {
    if (child.tagName === 'BUTTON') return child
  }
  return undefined
}

function createSidebarEntry() {
  const entry = document.createElement('div')
  entry.dataset.dshTtyEntry = ''
  entry.className = 'tt_sidebarEntry'
  entry.setAttribute('role', 'button')
  entry.setAttribute('aria-label', t('panel.title'))
  // 键盘可达（0.19.0，WCAG 2.1.1）：纯键盘用户此前进不了面板
  entry.tabIndex = 0
  entry.innerHTML = '<span class="tt_sidebarEntryIcon">' + TERMINAL_ICON + '</span><span class="tt_sidebarEntryLabel">' + t('panel.title') + '</span>'
  entry.addEventListener('click', (event) => {
    event.preventDefault()
    openModal()
  })
  entry.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault()
      openModal()
    }
  })
  return entry
}

function placeSidebarEntry(root, entry) {
  const button = newSessionButton(root)
  if (button === undefined) return false
  if (entry.parentElement !== root) {
    const row = button.closest('[class*="logoRow"]')
    const base = row !== null && row.parentElement === root ? row : button
    const family = Array.from(root.children).filter((el) => el instanceof HTMLElement && el.matches('[data-dsh-global-search-entry], [data-dsh-rss-entry], [data-dsh-taskboard-entry], [data-dsh-ssh-entry], [data-dsh-tty-entry]'))
    if (family.length > 0) {
      const last = family[family.length - 1]
      root.insertBefore(entry, last.nextSibling)
    } else {
      root.insertBefore(entry, base.nextElementSibling)
    }
  }
  return true
}

function mountSidebarEntry() {
  ensureStyle() // 入口必须先于任何交互注入样式（首屏即带内边距/悬停效果）
  if (typeof document !== 'undefined' && document.querySelector('[data-dsh-tty-entry]') !== null) return () => {}
  const entry = createSidebarEntry()
  let root
  let placed = false

  const tryPlace = () => {
    if (root !== undefined && !root.isConnected) {
      rootObserver.disconnect()
      root = undefined
      placed = false
    }
    if (placed) {
      if (document.body.contains(entry)) return
      rootObserver.disconnect()
      root = undefined
      placed = false
    }
    root ??= sidebarRoot()
    if (root === undefined) return
    placed = placeSidebarEntry(root, entry)
    if (placed) {
      rootObserver.observe(root, { childList: true, subtree: true })
    }
  }

  const waitObserver = new MutationObserver(() => {
    tryPlace()
  })
  waitObserver.observe(document.body, { childList: true, subtree: true })

  const rootObserver = new MutationObserver(() => {
    if (root === undefined || !root.isConnected) {
      placed = false
      tryPlace()
      return
    }
    if (!root.contains(entry)) placed = placeSidebarEntry(root, entry)
  })

  tryPlace()
  return () => {
    waitObserver.disconnect()
    rootObserver.disconnect()
    entry.remove()
  }
}

/* ================================ 注册 ================================ */

window.__ModuleLoader__.load({
  id: '@hyzyn/dsh-tty',
  factory: (require) => {
    const exports = {}
    // React 必须取自宿主（与 module loader 共享同一实例）；require 是加载器传入的
    // 参数（作用域内遮蔽全局），esbuild 不会把它打包进 bundle。
    const React = require('react')
    const { jsx, jsxs } = require('react/jsx-runtime')

// 与官方 GUI / 其他插件设置卡片一致的「V」形展开箭头（14×14，展开时旋转 180°）
const CHEVRON_PATH = 'M11.8486 5.5L11.4238 5.92383L8.69727 8.65137C8.44157 8.90706 8.21562 9.13382 8.01172 9.29785C7.79912 9.46883 7.55595 9.61756 7.25 9.66602C7.08435 9.69222 6.91565 9.69222 6.75 9.66602C6.44405 9.61756 6.20088 9.46883 5.98828 9.29785C5.78438 9.13382 5.55843 9.13382 5.30273 8.65137L2.57617 5.92383L2.15137 5.5L3 4.65137L3.42383 5.07617L6.15137 7.80273C6.42595 8.07732 6.59876 8.24849 6.74023 8.3623C6.87291 8.46904 6.92272 8.47813 6.9375 8.48047C6.97895 8.48703 7.02105 8.48703 7.0625 8.48047C7.07728 8.47813 7.12709 8.46904 7.25977 8.3623C7.40124 8.24849 7.57405 8.07732 7.84863 7.80273L10.5762 5.07617L11 4.65137L11.8486 5.5Z'

/**
 * 设置 → 插件 →「终端面板」卡片：读取/编辑 tty settings 命名空间。
 * 注意：React 必须取自 module loader 的 require（宿主 GUI 同一个 React 实例），
 * 不能把独立副本打进 bundle（hooks 依赖渲染器的 dispatcher）。
 */
function TtySettingsCard(props) {
  // DSH ≥0.1.6 的插件配置页把同一条目按 view 渲染两次：summary 一句话摘要、page 完整表单。
  // 旧版（≤0.1.5）的 settings.plugin.item 卡片不带 view，走原有可折叠卡片分支。
  const view = props && props.view
  const pageView = view === 'page'
  const [open, setOpen] = React.useState(pageView)
  const [form, setForm] = React.useState(null)
  const [loaded, setLoaded] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [message, setMessage] = React.useState({ kind: '', text: '' })
  /** 已安装 shell 候选（/api/dsh-tty/shells，加载失败保持空 = 纯手输）。 */
  const [shellOptions, setShellOptions] = React.useState([])
  const [shellListOpen, setShellListOpen] = React.useState(false)

  /** 设置卡片分组小标题：字段多了以后靠它把卡片切成可扫读的几段。 */
  const sectionTitle = (text) => jsx('div', { className: 'tt_cardSection', children: text })

  const load = async () => {
    try {
      const res = await fetch('/api/dsh-tty/config', { cache: 'no-store' })
      const data = await res.json()
      if (data.ok && typeof data.config === 'object' && data.config !== null) {
        setForm(data.config)
        syncSshHostsCache(data.config) // 连接簿缓存与设置保持一致（「+」菜单共用）
      } else setMessage({ kind: 'error', text: String(data.error || t('error.configLoadFailed')) })
    } catch (error) {
      setMessage({ kind: 'error', text: String(error && error.message ? error.message : error) })
    }
  }
  const loadShellOptions = async () => {
    try {
      const res = await fetch('/api/dsh-tty/shells', { cache: 'no-store' })
      const data = await res.json()
      if (data.ok && Array.isArray(data.shells)) setShellOptions(data.shells)
    } catch {
      /* 网络失败：候选保持为空，输入框照常可用 */
    }
  }
  React.useEffect(() => {
    if (open && !loaded) {
      setLoaded(true)
      void load()
      void loadShellOptions()
    }
  }, [open])

  const set = (key, value) => setForm((current) => ({ ...(current || {}), [key]: value }))
  /** sftpLimits 单项更新（函数式合并，避免连续编辑覆盖）。 */
  const setSftpLimit = (key, value) => setForm((current) => ({
    ...(current || {}),
    sftpLimits: { ...((current?.sftpLimits) ?? {}), [key]: value },
  }))
  const [editing, setEditing] = React.useState(null)
  const [editForm, setEditForm] = React.useState(null)
  const [editError, setEditError] = React.useState('')
  /**
   * 编辑表单里的凭据引用候选（连接簿在用的 `env:` 名字 ∪ 凭据存储里的名字）：
   * 进入编辑时拉一次，与连接对话框的引用选择器**同一份候选**（见 credentialRefCandidates）。
   * `null` = 还没问到（这一行先不显形，免得先闪一下"零候选"再换成输入框）。
   */
  const [credNames, setCredNames] = React.useState(null)
  /** 引用选择器展开在哪一行（'' = 不收）；筛选框内容与「再点覆盖」的确认态跟着它走。 */
  const [credPicker, setCredPicker] = React.useState('')
  const [credFilter, setCredFilter] = React.useState('')
  const [credConfirm, setCredConfirm] = React.useState('')
  const credConfirmTimer = React.useRef(null)
  /** 「应用时存入凭据存储」：默认勾选（宿主提供 remote.credentials 时），与对话框同款默认。 */
  const [credRemember, setCredRemember] = React.useState(false)
  const [credStatus, setCredStatus] = React.useState({ text: '', kind: '' })
  const [credClearable, setCredClearable] = React.useState(false)
  /** 编辑表单里的试连结果（测的是**尚未应用**的填写，对话框「试连」同款）。 */
  const [editProbe, setEditProbe] = React.useState({ running: false, ok: false, text: '' })
  /** 连接簿条目「测试」状态：{ [name]: { running:boolean, ok?:boolean, text:string } }。 */
  const [probeStates, setProbeStates] = React.useState({})
  /** 隧道实时状态（卡片展开期间 2s 轮询 /api/dsh-tty/tunnels）。 */
  const [tunnelStatus, setTunnelStatus] = React.useState([])
  const [tunnelDraft, setTunnelDraft] = React.useState({ direction: 'local', localPort: '', remoteHost: '', remotePort: '', localTargetPort: '', bookName: '' })
  /**
   * 正在编辑的隧道**原始 name**（null = 新增模式）。
   *
   * 为什么定位用原始 name 而不是索引：隧道名由规则派生（`<bookName>-L<localPort>`），
   * 编辑端口就会换名字——拿新名字去列表里找是找不到的，必须按**进编辑时那个** name
   * 定位（连接簿条目的 startEditSshHost 同款做法，改名/改端口都安全）。
   */
  const [editingTunnel, setEditingTunnel] = React.useState(null)
  React.useEffect(() => {
    if (!open) return undefined
    let alive = true
    const poll = async () => {
      try {
        const res = await fetch('/api/dsh-tty/tunnels', { cache: 'no-store' })
        const data = await res.json()
        if (alive && data.ok && Array.isArray(data.tunnels)) setTunnelStatus(data.tunnels)
      } catch {
        /* 网络失败：保留上次状态 */
      }
    }
    void poll()
    const timer = setInterval(poll, 2000)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [open])
  const setDraft = (key) => (event) => setTunnelDraft((current) => ({ ...(current || {}), [key]: event.target.value }))
  /** 直接按值写草稿（分段控件这类不是 input 事件的场景用）。 */
  const setDraftValue = (key, value) => setTunnelDraft((current) => ({ ...(current || {}), [key]: value }))
  const tunnelRule = (tunnel) => (tunnel?.direction === 'remote'
    ? t('meta.tunnelRemote', { host: tunnel.remoteHost || '127.0.0.1', port: String(tunnel.remotePort ?? 0), local: String(tunnel.localTargetPort ?? 0) })
    : t('meta.tunnelLocal', { local: String(tunnel?.localPort ?? 0), host: tunnel?.remoteHost ?? '?', port: String(tunnel?.remotePort ?? 0) }))
  const selectedBook = (form?.sshHosts ?? []).find((host) => host?.name === tunnelDraft?.bookName)
  /** 立即提交当前隧道列表（写 settings → reconcile 热生效）；失败回滚提示。 */
  const pushTunnels = async (next) => {
    try {
      const res = await fetch('/api/dsh-tty/config', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tunnels: next }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) {
        setMessage({ kind: 'error', text: String(data.error || t('error.saveTunnelFailed')) })
        return false
      }
      return true
    } catch (error) {
      setMessage({ kind: 'error', text: String(error && error.message ? error.message : error) })
      return false
    }
  }
  /** 添加隧道（append 进 form.tunnels 并立即生效；重名自动加后缀）。 */
  /**
   * 从表单草稿拼出一条隧道规格（**新增与编辑共用**，实现在 client-src/tunnel-edit.js）。
   * 校验与命名规则只有那一份——各写一份必然漂（"新增能过、编辑过不了"）。
   */
  const buildTunnelFromDraft = () => buildTunnelSpec(tunnelDraft, (Array.isArray(form?.sshHosts) ? form.sshHosts : []).map((h) => h?.name), t)

  /** 进入隧道编辑：把该条回填到下方表单（编辑态按原始 name 定位）。 */
  const startEditTunnel = (tunnel) => {
    setMessage({ kind: '', text: '' })
    setEditingTunnel(String(tunnel?.name ?? ''))
    setTunnelDraft({
      direction: tunnel?.direction === 'remote' ? 'remote' : 'local',
      bookName: String(tunnel?.bookName ?? ''),
      localPort: tunnel?.localPort ? String(tunnel.localPort) : '',
      remoteHost: String(tunnel?.remoteHost ?? ''),
      remotePort: tunnel?.remotePort ? String(tunnel.remotePort) : '',
      localTargetPort: tunnel?.localTargetPort ? String(tunnel.localTargetPort) : '',
    })
  }
  const cancelEditTunnel = () => {
    setEditingTunnel(null)
    setMessage({ kind: '', text: '' })
    setTunnelDraft((current) => ({ ...(current || {}), localPort: '', remoteHost: '', remotePort: '', localTargetPort: '' }))
  }

  const addTunnel = () => {
    setMessage({ kind: '', text: '' })
    const built = buildTunnelFromDraft()
    if (!built.ok) {
      setMessage({ kind: 'error', text: built.error })
      return
    }
    const tunnel = built.tunnel
    const list = Array.isArray(form?.tunnels) ? form.tunnels : []
    // 名字冲突改为**提示**而不是静默加 `-2`（D56）：自动后缀会凭空多出一条同名不同尾的
    // 隧道，用户以为在改/加同一条，实际得到两条，排查时极难看出。
    if (tunnelNameClash(list, tunnel.name) !== undefined) {
      setMessage({ kind: 'error', text: t('error.tunnelNameTaken', { name: tunnel.name }) })
      return
    }
    const next = [...list, tunnel]
    setForm((current) => ({ ...(current || {}), tunnels: next }))
    setTunnelDraft((current) => ({ ...(current || {}), localPort: '', remoteHost: '', remotePort: '', localTargetPort: '' }))
    void pushTunnels(next).then((ok) => {
      if (ok) setMessage({ kind: 'ok', text: t('msg.tunnelApplied', { name: tunnel.name }) })
    })
  }

  /** 保存编辑：按**原始 name** 定位替换（名字/端口可能已变），失败回滚。 */
  const saveTunnelEdit = () => {
    if (editingTunnel === null) return
    setMessage({ kind: '', text: '' })
    const built = buildTunnelFromDraft()
    if (!built.ok) {
      setMessage({ kind: 'error', text: built.error })
      return
    }
    const before = Array.isArray(form?.tunnels) ? form.tunnels : []
    const applied = applyTunnelEdit(before, editingTunnel, built.tunnel, t)
    if (!applied.ok) {
      // 那条已不存在（另一个窗口删了）：退出编辑模式，别让表单留着一份改不动的草稿
      if (applied.reason === 'missing') setEditingTunnel(null)
      setMessage({ kind: 'error', text: applied.error })
      return
    }
    const next = applied.tunnels
    setForm((current) => ({ ...(current || {}), tunnels: next }))
    void pushTunnels(next).then((ok) => {
      if (ok !== true) {
        setForm((current) => ({ ...(current || {}), tunnels: before }))
        return
      }
      setEditingTunnel(null)
      setTunnelDraft((current) => ({ ...(current || {}), localPort: '', remoteHost: '', remotePort: '', localTargetPort: '' }))
      setMessage({ kind: 'ok', text: t('msg.tunnelUpdated', { name: built.tunnel.name }) })
    })
  }
  /**
   * 提交隧道列表（乐观更新 → 失败回滚）。
   *
   * 回滚是必须的：宿主校验会拒（重名 / 连接簿条目不存在 / 端口非法），拒绝后
   * 如果只弹一条错误、表单却停在「改过的样子」，用户以为已生效——列表与真实
   * 配置就此不一致（而卡片上的勾选/行是唯一能看出的地方）。回滚到提交前的
   * 快照，让界面重新等于真相。
   */
  const commitTunnels = (next, before) => {
    setForm((current) => ({ ...(current || {}), tunnels: next }))
    void pushTunnels(next).then((ok) => {
      if (ok !== true) setForm((current) => ({ ...(current || {}), tunnels: before }))
    })
  }
  const removeTunnel = (name) => {
    const before = Array.isArray(form?.tunnels) ? form.tunnels : []
    // 删掉的正是正在编辑的那条：一并退出编辑态，否则表单留着一条已不存在的隧道的草稿，
    // 点「保存」只会得到「已不存在」的错误（或更糟——被当成新增提交出去）
    if (editingTunnel !== null && String(name ?? '') === editingTunnel) {
      setEditingTunnel(null)
      setTunnelDraft((current) => ({ ...(current || {}), localPort: '', remoteHost: '', remotePort: '', localTargetPort: '' }))
    }
    commitTunnels(before.filter((tunnel) => tunnel?.name !== name), before)
  }
  const toggleTunnelEnabled = (name, checked) => {
    const before = Array.isArray(form?.tunnels) ? form.tunnels : []
    commitTunnels(before.map((tunnel) => (tunnel?.name === name ? { ...tunnel, enabled: checked } : tunnel)), before)
  }
  /** 进入编辑：复制条目到表单（按原始 name 定位，改名也安全）。 */
  const startEditSshHost = (host) => {
    setEditing(host?.name ?? null)
    setEditError('')
    setEditProbe({ running: false, ok: false, text: '' })
    setCredPicker('')
    setCredFilter('')
    disarmCredConfirm()
    // 默认勾选与对话框一致：宿主提供了凭据服务才勾得上（缺位由 refreshCredStatus 拨回）
    setCredRemember(credentialsRemote !== null)
    setEditForm({
      name: host?.name ?? '',
      host: host?.host ?? '',
      port: String(host?.port ?? 22),
      username: host?.username ?? '',
      auth: host?.auth === 'key' || host?.auth === 'password' ? host.auth : 'agent',
      keyPath: host?.keyPath ?? '',
      passphrase: host?.passphrase ?? '',
      password: host?.password ?? '',
      agentForward: host?.agentForward === true,
      // persist 必须一起带出来：否则在设置里编辑一条 tmux 托管条目会**静默丢掉**持久化开关。
      // 没写过这个字段的条目（如 ~/.ssh/config 导入的）默认跟随全局开关注：`!== false` 就是
      // "显式取消过才算取消"，与「+」菜单的判定一致。
      persist: host?.persist !== false,
    })
    // 候选与状态都是异步问宿主：进来先问一次，不阻塞表单渲染
    void credentialRefCandidates().then((names) => setCredNames(names))
    void refreshCredStatus(host?.password ?? '')
  }
  const cancelEditSshHost = () => {
    setEditing(null)
    setEditForm(null)
    setEditError('')
    setEditProbe({ running: false, ok: false, text: '' })
    setCredPicker('')
    setCredFilter('')
    disarmCredConfirm()
  }
  /**
   * 应用编辑：按原始 name 替换条目（支持改名）；只改本地表单，随「保存」写入。
   *
   * 与对话框的「保存修改」走**同一条凭据路径**：勾了「应用时存入凭据存储」且密码还是明文时，
   * 先写进官方凭据存储、字段里换成 `env:NAME`，写失败就中止应用并把官方原文显示出来
   * （绝不偷偷退回明文）。**边界**：值先落存储、配置要等卡片「保存」才引用它——若此后放弃保存，
   * 存储里会留下一个尚未被引用的名字（引用选择器里可见、可清）。
   */
  const applyEditSshHost = async () => {
    if (editForm === null) return
    const name = editForm.name.trim()
    const hostAddr = editForm.host.trim()
    const username = editForm.username.trim()
    if (name === '' || hostAddr === '' || username === '') {
      setEditError(t('error.nameHostUserRequired'))
      return
    }
    let port = Number(editForm.port)
    if (!Number.isInteger(port) || port < 1 || port > 65535) port = 22
    if ((form?.sshHosts ?? []).some((h) => h?.name === name && name !== editing)) {
      setEditError(t('error.bookNameTaken', { name }))
      return
    }
    if (editForm.auth === 'key' && editForm.keyPath.trim() === '') {
      setEditError(t('error.keyPathRequired'))
      return
    }
    setEditError('')
    let password = editForm.password
    if (editForm.auth === 'password') {
      const stored = await storeCredentialIfRequested(credRemember, editForm.password, hostAddr, port, username, 'PASSWORD')
      if (stored.error !== undefined) {
        setEditError(stored.error)
        return
      }
      if (stored.value !== undefined) password = stored.value
    }
    setForm((current) => ({
      ...(current || {}),
      sshHosts: (Array.isArray(current?.sshHosts) ? current.sshHosts : []).map((h) => h?.name === editing
        ? {
            name,
            host: hostAddr,
            port,
            username,
            auth: editForm.auth,
            keyPath: editForm.keyPath.trim(),
            passphrase: editForm.passphrase,
            password,
            agentForward: editForm.agentForward,
            persist: editForm.persist === true,
          }
        : h),
    }))
    setProbeStates((current) => {
      const next = { ...current }
      delete next[name]
      if (editing !== name) delete next[editing]
      return next
    })
    setEditing(null)
    setEditForm(null)
    setEditProbe({ running: false, ok: false, text: '' })
    setMessage({ kind: 'ok', text: t('msg.hostEdited', { name }) })
  }
  /** 删除连接簿条目（随「保存」一并提交）。 */
  const removeSshHost = (name) => {
    if (editing === name) cancelEditSshHost()
    setProbeStates((current) => {
      const next = { ...current }
      delete next[name]
      return next
    })
    setForm((current) => ({
      ...(current || {}),
      sshHosts: (Array.isArray(current?.sshHosts) ? current.sshHosts : []).filter((host) => host?.name !== name),
    }))
  }
  /** 测试连接簿条目：展开成内联 spec 走 /api/dsh-tty/probe（bookRecord=完整 TOFU）。 */
  const testSshHost = async (host) => {
    const name = host?.name ?? ''
    if (name === '') return
    const spec = {
      host: host?.host ?? '',
      port: Number(host?.port) || 22,
      username: host?.username ?? '',
      auth: host?.auth === 'key' || host?.auth === 'password' ? host.auth : 'agent',
      keyPath: host?.keyPath ?? '',
      passphrase: host?.passphrase ?? '',
      password: host?.password ?? '',
      agentForward: host?.agentForward === true,
    }
    setProbeStates((current) => ({ ...current, [name]: { running: true, text: t('msg.probing') } }))
    const out = await probeSshFetch(spec, true)
    setProbeStates((current) => {
      const prev = current[name] || {}
      if (out.result) {
        const ok = out.result.auth?.ok === true
        return { ...current, [name]: { running: false, ok, text: probeSummary(out.result) } }
      }
      return { ...current, [name]: { running: false, ok: false, text: t('error.probeFailed', { detail: String(out.error || t('error.unknown')) }) } }
    })
  }
  /** 立即删除一条 TOFU 主机指纹记录（指纹变更且确认安全后，删掉即可重连）。 */
  const removeHostKey = async (record) => {
    const next = (Array.isArray(form?.hostKeys) ? form.hostKeys : []).filter(
      (hk) => !(hk?.host === record?.host && Number(hk?.port) === Number(record?.port)),
    )
    setForm((current) => ({ ...(current || {}), hostKeys: next }))
    try {
      const res = await fetch('/api/dsh-tty/config', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ hostKeys: next }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) setMessage({ kind: 'error', text: String(data.error || t('error.hostKeyDeleteFailed')) })
      else setMessage({ kind: 'ok', text: t('msg.hostKeyDeleted') })
    } catch (error) {
      setMessage({ kind: 'error', text: String(error && error.message ? error.message : error) })
    }
  }
  /** 从 ~/.ssh/config 导入连接簿候选：同名跳过，随「保存」写入（新增不落盘）。 */
  const importSshConfig = async () => {
    setMessage({ kind: '', text: '' })
    try {
      const res = await fetch('/api/dsh-tty/ssh-config', { cache: 'no-store' })
      const data = await res.json()
      if (!data.ok) {
        setMessage({ kind: 'error', text: String(data.error || t('error.sshConfigReadFailed')) })
        return
      }
      const candidates = Array.isArray(data.entries) ? data.entries : []
      const merged = [...(Array.isArray(form?.sshHosts) ? form.sshHosts : [])]
      const existing = new Set(merged.map((host) => host?.name))
      let added = 0
      let skipped = 0
      for (const candidate of candidates) {
        if (candidate === null || typeof candidate !== 'object' || typeof candidate.name !== 'string') continue
        if (existing.has(candidate.name)) {
          skipped += 1
          continue
        }
        existing.add(candidate.name)
        merged.push({
          name: candidate.name,
          host: String(candidate.host ?? candidate.name),
          port: Number(candidate.port) || 22,
          username: String(candidate.username ?? ''),
          auth: candidate.auth === 'key' ? 'key' : 'agent',
          keyPath: String(candidate.keyPath ?? ''),
          passphrase: '',
          password: '',
          agentForward: false,
        })
        added += 1
      }
      setForm((current) => ({ ...(current || {}), sshHosts: merged }))
      /*
       * 丢弃要有信号（项目级 ROADMAP 第 2 项）。两类分开报：
       *   - `proxy`：用了 ProxyJump 但**解析不出跳板机**（别名缺失 / 别名自己还要跳板机）；
       *   - `proxyCommand`：只配了 ProxyCommand —— 它是「本机执行命令」那一档，导入**永不**
       *     自动带入，所以这里不能与上一类混成一句话（一句「依赖跳板机」会让人以为配了就行）。
       */
      const proxyNames = Array.isArray(data.proxy) ? data.proxy.filter((name) => typeof name === 'string') : []
      const proxyCount = Number.isInteger(data.proxyCount) ? data.proxyCount : proxyNames.length
      const proxyCommandNames = Array.isArray(data.proxyCommand) ? data.proxyCommand.filter((name) => typeof name === 'string') : []
      const proxyCommandCount = Number.isInteger(data.proxyCommandCount) ? data.proxyCommandCount : proxyCommandNames.length
      const others = Number.isInteger(data.skippedOther) ? data.skippedOther : 0
      const overflow = Number.isInteger(data.droppedOverflow) ? data.droppedOverflow : 0
      const extras = []
      if (proxyCount > 0) extras.push(t('msg.proxySkipped', { count: proxyCount, names: proxyNames.slice(0, 5).join(t('list.separator')) + (proxyCount > 5 ? t('meta.etc') : '') }))
      if (proxyCommandCount > 0) extras.push(t('msg.proxyCommandSkipped', { count: proxyCommandCount, names: proxyCommandNames.slice(0, 5).join(t('list.separator')) + (proxyCommandCount > 5 ? t('meta.etc') : '') }))
      if (others > 0) extras.push(t('msg.skippedNotConcrete', { count: others }))
      if (overflow > 0) extras.push(t('msg.importOverflow', { count: overflow }))
      const tail = extras.length > 0 ? t('list.separatorFull') + extras.join(t('list.separatorFull')) : ''
      if (added === 0) {
        const base = skipped > 0 ? t('msg.noNewEntries', { count: skipped }) : t('msg.noImportableHosts')
        setMessage({ kind: extras.length > 0 ? 'error' : 'ok', text: base + tail })
      } else {
        setMessage({ kind: extras.length > 0 ? 'error' : 'ok', text: t('msg.importedHosts', { added, skipped }) + tail })
      }
    } catch (error) {
      setMessage({ kind: 'error', text: String(error && error.message ? error.message : error) })
    }
  }
  /** 一条 hostKeys 记录的指纹集合（0.19.0 起一机多指纹；旧版单 fingerprint 字段兼容读取）。 */
  const hostKeyFingerprints = (record) => {
    if (record === null || typeof record !== 'object') return []
    if (Array.isArray(record.fingerprints)) return record.fingerprints.filter((fp) => typeof fp === 'string' && fp !== '')
    return typeof record.fingerprint === 'string' && record.fingerprint !== '' ? [record.fingerprint] : []
  }
  /** 从 ~/.ssh/known_hosts 导入指纹（TOFU 预填充）：立即 POST；同 host:port 并入已有记录的指纹集合，已存在同指纹跳过。 */
  const importKnownHosts = async () => {
    setMessage({ kind: '', text: '' })
    try {
      const res = await fetch('/api/dsh-tty/known-hosts', { cache: 'no-store' })
      const data = await res.json()
      if (!data.ok) {
        setMessage({ kind: 'error', text: String(data.error || t('error.knownHostsReadFailed')) })
        return
      }
      const incoming = Array.isArray(data.entries) ? data.entries : []
      const merged = [...(Array.isArray(form?.hostKeys) ? form.hostKeys : [])]
      const byKey = new Map()
      for (const record of merged) {
        if (record === null || typeof record !== 'object') continue
        byKey.set(String(record.host ?? '') + ':' + String(record.port ?? 22), { record, fps: new Set(hostKeyFingerprints(record)) })
      }
      let added = 0
      let skipped = 0
      for (const record of incoming) {
        if (record === null || typeof record !== 'object' || typeof record.host !== 'string') continue
        const fps = Array.isArray(record.fingerprints) ? record.fingerprints.filter((fp) => typeof fp === 'string' && fp !== '') : []
        if (typeof record.fingerprint === 'string' && record.fingerprint !== '') fps.push(record.fingerprint)
        if (fps.length === 0) continue
        const key = record.host + ':' + String(record.port ?? 22)
        const entry = byKey.get(key)
        if (entry !== undefined) {
          let mergedAny = false
          for (const fp of fps) {
            if (entry.fps.has(fp) || entry.fps.size >= 8) continue
            entry.fps.add(fp)
            mergedAny = true
          }
          if (!mergedAny) {
            skipped += 1
            continue
          }
          delete entry.record.fingerprint // 规范化为多指纹形态
          entry.record.fingerprints = [...entry.fps]
          added += 1
          continue
        }
        const created = { host: record.host, port: Number(record.port) || 22, fingerprints: [...new Set(fps)].slice(0, 8) }
        byKey.set(key, { record: created, fps: new Set(created.fingerprints) })
        merged.push(created)
        added += 1
      }
      if (added === 0) {
        setMessage({ kind: 'ok', text: skipped > 0 ? t('msg.noNewFingerprints', { count: skipped }) : t('msg.noImportableKnownHosts') })
        return
      }
      setForm((current) => ({ ...(current || {}), hostKeys: merged }))
      try {
        const saveRes = await fetch('/api/dsh-tty/config', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ hostKeys: merged }),
        })
        const saveData = await saveRes.json().catch(() => ({}))
        if (!saveRes.ok || !saveData.ok) {
          setMessage({ kind: 'error', text: String(saveData.error || t('error.saveHostKeysFailed')) })
          return
        }
        setMessage({ kind: 'ok', text: t('msg.importedFingerprints', { added, skipped }) + (data.truncated === true ? t('hint.knownHostsTruncated') : '') })
      } catch (error) {
        setMessage({ kind: 'error', text: String(error && error.message ? error.message : error) })
      }
    } catch (error) {
      setMessage({ kind: 'error', text: String(error && error.message ? error.message : error) })
    }
  }
  const save = async () => {
    setSaving(true)
    setMessage({ kind: '', text: '' })
    // 只提交配置项：快照里的 toolsRegistered 等非配置键会被宿主 normalizePatch 拒绝
    const body = {}
    for (const key of ['enabled', 'announceToAgent', 'maxSessions', 'shell', 'term', 'colorTerm', 'cwd', 'reconnectGraceSec', 'shellIntegration', 'sftpStyle', 'persistence', 'endOnPageClose', 'statsEnabled', 'allowProxyCommand']) {
      const value = (form || {})[key]
      if (value !== undefined && value !== '') body[key] = value
    }
    body.sshHosts = Array.isArray(form?.sshHosts) ? form.sshHosts : []
    body.tunnels = Array.isArray(form?.tunnels) ? form.tunnels : []
    // sftpLimits：对象整体提交（宿主按字段校验；0 = 不限）
    if (form?.sftpLimits && typeof form.sftpLimits === 'object') {
      body.sftpLimits = {
        maxDownloadMb: Number(form.sftpLimits.maxDownloadMb) || 0,
        maxUploadMb: Number(form.sftpLimits.maxUploadMb) || 0,
        maxUploadFiles: Number(form.sftpLimits.maxUploadFiles) || 0,
      }
    }
    try {
      const res = await fetch('/api/dsh-tty/config', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) setMessage({ kind: 'error', text: String(data.error || t('error.saveFailed')) })
      else {
        setMessage({ kind: 'ok', text: t('msg.saved') })
        if (data.config) {
          setForm(data.config)
          syncSshHostsCache(data.config)
        }
      }
    } catch (error) {
      setMessage({ kind: 'error', text: String(error && error.message ? error.message : error) })
    }
    setSaving(false)
  }

  /* ---------------- 编辑表单里的凭据引用（React 版，语义与对话框逐条对齐） ---------------- */

  const disarmCredConfirm = () => {
    if (credConfirmTimer.current !== null) {
      clearTimeout(credConfirmTimer.current)
      credConfirmTimer.current = null
    }
    setCredConfirm('')
  }

  /**
   * 问一次字段里那个引用的状态（只问状态、不问值）。文案与对话框**逐字一致**：
   * 明文态保持安静；引用态显示 `已存入（来源 file）· 引用名` 或「存储里还没有这个值」。
   */
  const refreshCredStatus = async (rawValue) => {
    const ref = credentialRefOfValue(rawValue)
    if (credentialStore() === null) {
      setCredRemember(false)
      setCredClearable(false)
      setCredStatus({
        text: credentialsRemote === null ? t('error.credPlainUnavailable') : t('error.credPlainIncomplete'),
        kind: 'muted',
      })
      return
    }
    if (ref === '') {
      setCredClearable(false)
      setCredStatus({ text: '', kind: '' })
      return
    }
    const probe = await describeCredentialRef(ref)
    if (probe.unreported === true) {
      setCredClearable(false)
      setCredStatus({ text: t('status.credUnreported', { ref }), kind: 'plain' })
      return
    }
    if (probe.error !== undefined) {
      setCredClearable(false)
      setCredStatus({ text: t('error.credStatusFailed', { error: probe.error }), kind: 'error' })
      return
    }
    const view = probe.view
    setCredStatus({
      text: view.configured
        ? t('status.credStored', { ref, source: view.source !== '' ? t('meta.credSource', { source: view.source }) : '' })
        : t('status.credUnknown', { ref }),
      kind: view.configured ? 'ok' : 'plain',
    })
    setCredClearable(view.configured === true && view.writable === true)
  }

  /** 清除已存凭据（对话框同款）：清完把字段里的引用一并抹掉。 */
  const clearStoredCredential = async () => {
    const ref = credentialRefOfValue(editForm?.password ?? '')
    if (ref === '') return
    const out = await clearCredentialRef(ref)
    if (out.error !== undefined) {
      setCredStatus({ text: out.error, kind: 'error' })
      return
    }
    setEditForm((current) => ({ ...(current || {}), password: '' }))
    setCredStatus({ text: '', kind: '' })
    setCredClearable(false)
  }

  /**
   * 选中一个候选引用。目标为空或已是引用时直接替换；有手输内容时**首击只进确认态**
   * （4s 复位），再击才覆盖——密码框是掩码显示，不该被一次误点静默清空（对话框同款）。
   */
  const pickCredential = (key, name) => {
    const current = String(editForm?.[key] ?? '')
    if (current === '' || current.startsWith('env:') || credConfirm === name) {
      disarmCredConfirm()
      setEditForm((form0) => ({ ...(form0 || {}), [key]: 'env:' + name }))
      setCredPicker('')
      if (key === 'password') void refreshCredStatus('env:' + name)
      return
    }
    setCredConfirm(name)
    if (credConfirmTimer.current !== null) clearTimeout(credConfirmTimer.current)
    credConfirmTimer.current = setTimeout(() => {
      credConfirmTimer.current = null
      setCredConfirm('')
    }, 4000)
  }

  /**
   * 引用选择器。与对话框同一份候选（credentialRefCandidates）；差别只在**呈现**：卡片里
   * 做成**内联**列表而不是浮层——卡片本身就是可滚动的长表单，浮层在这里只会被裁掉。
   * 候选还没问到（credNames === null）时整行不显形，免得先闪一下"零候选"再换成输入框。
   */
  const renderCredPicker = (key, emptyHint) => {
    if (credNames === null) return null
    if (credNames.length === 0) {
      return jsx('span', { className: 'tt_cardHint', children: emptyHint })
    }
    const open = credPicker === key
    const kw = credFilter.trim().toUpperCase()
    const hit = kw === '' ? credNames : credNames.filter((name) => name.toUpperCase().includes(kw))
    return jsxs('div', {
      className: 'tt_credPicker',
      children: [
        jsx('input', {
          className: 'tt_cardInput',
          value: open ? credFilter : '',
          placeholder: t('placeholder.credRef'),
          title: t('hint.credRefCandidates'),
          autoComplete: 'off',
          spellCheck: false,
          onFocus: () => {
            setCredPicker(key)
            setCredFilter('')
          },
          onBlur: (event) => {
            // 焦点离开整个选择器（含候选列表）才收起；点候选由 mousedown preventDefault 保住焦点
            if (!event.currentTarget.parentElement.contains(event.relatedTarget)) setCredPicker('')
          },
          onChange: (event) => {
            setCredFilter(event.target.value)
            setCredPicker(key)
          },
        }),
        ...(open ? [jsx('div', {
          className: 'tt_envList',
          children: [
            ...(hit.length === 0
              ? [jsx('span', { className: 'tt_envMore', children: t('list.noCredRef') })]
              : hit.slice(0, 30).map((name) => jsx('button', {
                  type: 'button',
                  className: 'tt_envItem',
                  'data-danger': credConfirm === name ? '' : undefined,
                  onMouseDown: (event) => event.preventDefault(),
                  onClick: () => pickCredential(key, name),
                  children: credConfirm === name ? t('list.credOverwrite', { name }) : name,
                }, name))),
            ...(hit.length > 30
              ? [jsx('span', { className: 'tt_envMore', children: t('list.moreMatches', { count: hit.length - 30 }) })]
              : []),
          ],
        }, 'cred-list-' + key)] : []),
      ],
    })
  }

  /** 「凭据存储」那一行（React 版）：明文态 = 勾选框；引用态 = 清除按钮 + 状态。 */
  const renderCredentialRow = () => {
    const ref = credentialRefOfValue(editForm?.password ?? '')
    const refMode = ref !== ''
    const missing = credentialStore() === null
    return jsxs('div', {
      className: 'tt_sshRow tt_credRow',
      children: [
        refMode
          ? jsx('button', {
              type: 'button',
              className: 'tt_toolBtn tt_credClear',
              disabled: credClearable !== true,
              onClick: () => void clearStoredCredential(),
              children: t('btn.clearCredential'),
            })
          : jsx('label', {
              className: 'tt_credToggle',
              title: t('hint.rememberCredentialApply'),
              children: [
                jsx('input', {
                  type: 'checkbox',
                  className: 'tt_cardCheckbox',
                  checked: credRemember,
                  disabled: missing,
                  onChange: (event) => setCredRemember(event.target.checked),
                }),
                jsx('span', { children: t('check.rememberCredentialApply') }),
              ],
            }),
        credStatus.text === ''
          ? null
          : jsx('span', { className: 'tt_credStatus', 'data-kind': credStatus.kind, children: credStatus.text }),
        missing && credStatus.text === ''
          ? jsx('span', { className: 'tt_credStatus', 'data-kind': 'muted', children: t('error.credPlainUnavailable') })
          : null,
      ],
    })
  }

  /** 从编辑器字段收集一份 SSH spec（不含 name/persist）；字段不齐返回 null 并写入 editError。 */
  const collectEditSpec = () => {
    const host = String(editForm?.host ?? '').trim()
    const username = String(editForm?.username ?? '').trim()
    let port = Number(editForm?.port)
    if (!Number.isInteger(port) || port < 1 || port > 65535) port = 22
    if (host === '' || username === '') {
      setEditError(t('error.hostUserRequired'))
      return null
    }
    const auth = editForm?.auth
    const spec = { host, port, username, auth }
    if (auth === 'key') {
      const keyPath = String(editForm?.keyPath ?? '').trim()
      if (keyPath === '') {
        setEditError(t('error.keyPathRequired'))
        return null
      }
      spec.keyPath = keyPath
      if (editForm?.passphrase !== '') spec.passphrase = editForm.passphrase
    }
    if (auth === 'password') {
      const password = String(editForm?.password ?? '')
      if (password === '') {
        setEditError(t('error.passwordRequired'))
        return null
      }
      spec.password = password
    }
    if (editForm?.agentForward === true) spec.agentForward = true
    return spec
  }

  /** 编辑器内的「试连」：测的是**当前填写**（含尚未应用的改动），不建会话、不落 TOFU。 */
  const probeEditForm = () => {
    setEditError('')
    const spec = collectEditSpec()
    if (spec === null) return
    setEditProbe({ running: true, ok: false, text: t('msg.probing') })
    void probeSshFetch(spec, false).then((out) => {
      if (out.result) {
        const ok = out.result.auth?.ok === true
        setEditProbe({ running: false, ok, text: probeSummary(out.result) })
        return
      }
      setEditProbe({ running: false, ok: false, text: t('error.probeFailed', { detail: String(out.error || t('error.unknown')) }) })
    })
  }

  /** 编辑器内的「文件浏览」：按当前填写直接开 SFTP（与对话框同款，不走连接簿）。 */
  const browseEditForm = () => {
    setEditError('')
    const spec = collectEditSpec()
    if (spec === null) return
    // 设置卡片里按表单填的规格浏览：规则同上——归属当前活动标签（面板没开时本来就走
    // 居中对话框，这条路径用不到归属）
    openSftpBrowser(spec)
  }

  /**
   * 连接簿编辑表单（行内展开；只改本地表单，随卡片「保存」写入）。
   *
   * 字段与分组**与终端「+」→ 编辑连接对话框对齐**（连接 / 认证 / 选项 + 凭据引用选择器 +
   * 凭据存储 + 试连 + 文件浏览）：同一个连接在哪儿编辑都该是同一套能力，改字段不必换个地方。
   * 差异只有两处，都是**有意**的：① 提交入口叫「应用」（写进卡片表单，再随「保存」落盘）；
   * ② 引用候选列表内联展开，不做浮层（卡片会滚，浮层会被裁）。
   */
  const renderSshHostEditor = () => {
    if (editForm === null) return null
    const editField = (label, key, placeholder, type, extra) => jsxs('label', {
      className: 'tt_sshRow',
      children: [
        jsx('span', { className: 'tt_cardLabel', children: label }),
        jsx('input', {
          className: 'tt_cardInput',
          type: type ?? 'text',
          value: editForm[key] ?? '',
          placeholder: placeholder ?? '',
          autoComplete: 'off',
          spellCheck: false,
          onChange: (event) => {
            const value = event.target.value
            setEditForm((current) => ({ ...(current || {}), [key]: value }))
          },
          ...(extra ?? {}),
        }),
      ],
    })
    return jsxs('div', {
      className: 'tt_sshEdit',
      children: [
        jsx('div', { className: 'tt_sshSection', children: t('section.connection') }),
        jsxs('div', { className: 'tt_sshGrid', children: [
          editField(t('field.bookName'), 'name', t('hint.bookNameConflict')),
          editField(t('field.port'), 'port', '22'),
        ] }),
        editField(t('field.host'), 'host', t('placeholder.host')),
        editField(t('field.username'), 'username', 'root'),
        jsx('div', { className: 'tt_sshSection', children: t('section.auth') }),
        jsxs('label', { className: 'tt_sshRow', children: [
          jsx('span', { className: 'tt_cardLabel', children: t('field.authMethod') }),
          jsxs('select', {
            className: 'tt_cardInput',
            value: editForm.auth,
            onChange: (event) => setEditForm((current) => ({ ...(current || {}), auth: event.target.value })),
            children: [
              jsx('option', { value: 'agent', children: t('option.authAgent') }),
              jsx('option', { value: 'key', children: t('option.authKey') }),
              jsx('option', { value: 'password', children: t('option.authPassword') }),
            ],
          }),
        ] }),
        ...(editForm.auth === 'key' ? [
          editField(t('field.keyPath'), 'keyPath', '~/.ssh/id_ed25519'),
          editField(t('field.passphrase'), 'passphrase', '', 'password'),
          renderCredPicker('passphrase', t('hint.noCredRefPassphrase')),
        ] : []),
        ...(editForm.auth === 'password' ? [
          editField(t('field.password'), 'password', '', 'password', {
            // 失焦对一次状态（手改引用名也算）：不用 onChange——密码框每敲一个字符都去问宿主没必要
            onBlur: () => void refreshCredStatus(editForm.password),
          }),
          renderCredentialRow(),
          renderCredPicker('password', t('hint.noCredRefPasswordApply')),
        ] : []),
        jsx('div', { className: 'tt_sshSection', children: t('section.options') }),
        jsxs('label', { className: 'tt_cardRow', children: [
          jsx('input', { type: 'checkbox', className: 'tt_cardCheckbox', checked: editForm.agentForward === true, onChange: (event) => setEditForm((current) => ({ ...(current || {}), agentForward: event.target.checked })) }),
          jsx('span', { className: 'tt_cardLabel', children: t('check.agentForward') }),
        ] }),
        // 条目级持久化：只在设置里开着 tmux 持久化时才有意义（与对话框同款条件）；没写过的条目
        // 跟随全局开关，显式取消过（persist:false）的条目保持取消——「+」菜单按这个值决定是否托管
        persistenceCache === 'tmux'
          ? jsxs('label', { className: 'tt_cardRow', children: [
              jsx('input', {
                type: 'checkbox',
                className: 'tt_cardCheckbox',
                checked: editForm.persist === true,
                onChange: (event) => setEditForm((current) => ({ ...(current || {}), persist: event.target.checked })),
              }),
              jsx('span', { className: 'tt_cardLabel', children: t('check.persist') }),
            ] })
          : null,
        editProbe.text !== ''
          ? jsx('div', { className: 'tt_sshProbeResult' + (!editProbe.running && editProbe.ok ? ' tt_sshProbeOk' : '') + (!editProbe.running && !editProbe.ok ? ' tt_sshProbeBad' : ''), children: editProbe.text })
          : null,
        editError !== '' ? jsx('span', { className: 'tt_cardMessage tt_cardMessageError', children: editError }) : null,
        jsxs('div', { className: 'tt_sshActions', children: [
          jsxs('div', { className: 'tt_sshActionsGroup', children: [
            jsx('button', { type: 'button', className: 'tt_toolBtn', onClick: cancelEditSshHost, children: t('btn.cancel') }),
            jsx('button', { type: 'button', className: 'tt_toolBtn', title: t('btn.browseTitle'), onClick: browseEditForm, children: t('btn.fileBrowse') }),
            jsx('button', { type: 'button', className: 'tt_toolBtn', disabled: editProbe.running, title: t('btn.probeTitle'), onClick: probeEditForm, children: editProbe.running ? t('msg.probing') : t('btn.probe') }),
          ] }),
          jsxs('div', { className: 'tt_sshActionsGroup', children: [
            jsx('button', { type: 'button', className: 'tt_cardSave', onClick: () => void applyEditSshHost(), children: t('btn.apply') }),
            jsx('span', { className: 'tt_cardHint', children: t('hint.appliedOnSave') }),
          ] }),
        ] }),
      ],
    })
  }
  const textField = (label, key, placeholder, hint) => jsxs('label', {
    className: 'tt_cardField',
    children: [
      jsx('span', { className: 'tt_cardLabel', children: label }),
      jsx('input', { className: 'tt_cardInput', value: form[key] ?? '', placeholder: placeholder ?? '', onChange: (event) => set(key, event.target.value) }),
      hint ? jsx('span', { className: 'tt_cardHint', children: hint }) : null,
    ],
  })
  const boolField = (label, key, extraClass) => jsxs('label', {
    className: 'tt_cardField tt_cardRow' + (typeof extraClass === 'string' && extraClass !== '' ? ' ' + extraClass : ''),
    children: [
      jsx('input', { type: 'checkbox', className: 'tt_cardCheckbox', checked: form[key] === true, onChange: (event) => set(key, event.target.checked) }),
      jsx('span', { className: 'tt_cardLabel', children: label }),
    ],
  })
  /**
   * 宿主平台（配置快照里的 `platform`）：Windows 上默认 shell、shell 集成、tmux 持久化
   * 都是另一套说法，界面上分别给对应的说明，而不是让用户照着 POSIX 的文案去填。
   */
  const winHost = form?.platform === 'win32'

  if (view === 'summary') {
    return t('card.desc')
  }

  // page 视图：新页面自己画标题/图标/面包屑，这里只交表单本体，不渲染卡片头。
  return jsxs(pageView ? 'div' : 'li', {
    className: pageView ? 'tt_pageHost' : (open ? 'tt_card tt_cardOpen' : 'tt_card'),
    children: [
      pageView ? null : jsxs('button', {
        type: 'button',
        className: 'tt_cardHeader',
        'aria-expanded': open,
        onClick: () => setOpen((current) => !current),
        children: [
          jsxs('span', {
            className: 'tt_cardHeadText',
            children: [
              jsx('span', { className: 'tt_cardName', children: t('card.name') }),
              jsx('span', { className: 'tt_cardDescription', children: t('card.descFull') }),
            ],
          }),
          jsx('span', { className: 'dshkit_badge', children: 'Kit' }),
          jsx('svg', {
            width: '14',
            height: '14',
            viewBox: '0 0 14 14',
            fill: 'none',
            xmlns: 'http://www.w3.org/2000/svg',
            className: open ? 'tt_cardChevron tt_cardChevronOpen' : 'tt_cardChevron',
            children: jsx('path', { d: CHEVRON_PATH, fill: 'currentColor' }),
          }),
        ],
      }),
      (pageView || open) ? jsxs('div', {
        className: 'tt_cardBody',
        children: [
          form === null
            ? jsx('div', { className: 'tt_cardMessage', children: t('list.loadingConfig') })
            : jsxs('div', { children: [
                sectionTitle(t('section.basic')),
                boolField(t('check.enabled'), 'enabled'),
                boolField(t('check.announce'), 'announceToAgent'),
                winHost
                  ? jsxs('div', {
                      className: 'tt_cardField',
                      children: [
                        jsxs('label', { className: 'tt_cardRow', children: [
                          jsx('input', { type: 'checkbox', className: 'tt_cardCheckbox', checked: false, disabled: true }),
                          jsx('span', { className: 'tt_cardLabel', children: t('check.shellIntegration') }),
                        ] }),
                        jsx('span', { className: 'tt_cardHint', children: t('hint.shellIntegrationWindows') }),
                      ],
                    })
                  : boolField(t('check.shellIntegrationWindows'), 'shellIntegration'),
                sectionTitle(t('section.sftp')),
                jsxs('div', {
                  className: 'tt_cardField',
                  children: [
                    jsx('span', { className: 'tt_cardLabel', children: t('field.sftpStyle') }),
                    jsxs('select', {
                      className: 'tt_cardInput',
                      value: form.sftpStyle === 'dual' ? 'dual' : 'dialog',
                      onChange: (event) => set('sftpStyle', event.target.value),
                      children: [
                        jsx('option', { value: 'dialog', children: t('option.sftpDialog') }),
                        jsx('option', { value: 'dual', children: t('option.sftpDual') }),
                      ],
                    }),
                    jsx('span', { className: 'tt_cardHint', children: t('hint.sftpDual') }),
                  ],
                }),
                jsxs('div', {
                  className: 'tt_cardField',
                  children: [
                    jsx('span', { className: 'tt_cardLabel', children: t('field.sftpLimits') }),
                    jsxs('div', { className: 'tt_limitGrid', children: [
                      jsxs('label', { className: 'tt_sshRow', children: [
                        jsx('span', { className: 'tt_cardLabel', children: t('field.downloadLimit') }),
                        jsx('input', {
                          className: 'tt_cardInput',
                          type: 'number',
                          min: 0,
                          value: String(Number.isFinite(Number(form?.sftpLimits?.maxDownloadMb)) ? Number(form.sftpLimits.maxDownloadMb) : 1024),
                          onChange: (event) => setSftpLimit('maxDownloadMb', Number(event.target.value) || 0),
                        }),
                      ] }),
                      jsxs('label', { className: 'tt_sshRow', children: [
                        jsx('span', { className: 'tt_cardLabel', children: t('field.uploadLimit') }),
                        jsx('input', {
                          className: 'tt_cardInput',
                          type: 'number',
                          min: 0,
                          value: String(Number.isFinite(Number(form?.sftpLimits?.maxUploadMb)) ? Number(form.sftpLimits.maxUploadMb) : 2048),
                          onChange: (event) => setSftpLimit('maxUploadMb', Number(event.target.value) || 0),
                        }),
                      ] }),
                      jsxs('label', { className: 'tt_sshRow', children: [
                        jsx('span', { className: 'tt_cardLabel', children: t('field.uploadCountLimit') }),
                        jsx('input', {
                          className: 'tt_cardInput',
                          type: 'number',
                          min: 0,
                          value: String(Number.isFinite(Number(form?.sftpLimits?.maxUploadFiles)) ? Number(form.sftpLimits.maxUploadFiles) : 1000),
                          onChange: (event) => setSftpLimit('maxUploadFiles', Number(event.target.value) || 0),
                        }),
                      ] }),
                    ] }),
                    jsx('span', { className: 'tt_cardHint', children: t('hint.sftpLimits') }),
                  ],
                }),
                sectionTitle(t('section.session')),
                jsxs('div', {
                  className: 'tt_cardField',
                  children: [
                    jsx('span', { className: 'tt_cardLabel', children: t('field.persistence') }),
                    jsxs('select', {
                      className: 'tt_cardInput',
                      value: form.persistence === 'tmux' ? 'tmux' : 'off',
                      onChange: (event) => set('persistence', event.target.value),
                      children: [
                        jsx('option', { value: 'off', children: t('option.persistOff') }),
                        jsx('option', { value: 'tmux', children: t('option.persistTmux') }),
                      ],
                    }),
                    jsx('span', { className: 'tt_cardHint', children: t('hint.persistence') + (winHost ? t('hint.persistenceWindows') : '') }),
                    boolField(t('check.endOnPageClose'), 'endOnPageClose'),
                    boolField(t('check.statsEnabled'), 'statsEnabled'),
                    jsx('span', { className: 'tt_cardHint', children: t('hint.statsEnabled') }),
                    /*
                     * ProxyCommand 闸门。刻意与其它开关**不同色**（tt_cardDanger）：它是本插件
                     * 唯一「由设置字段驱动本机任意命令执行」的开关，默认关，打开前该看清代价。
                     */
                    boolField(t('check.allowProxyCommand'), 'allowProxyCommand', 'tt_cardDanger'),
                    jsx('span', { className: 'tt_cardHint', children: t('hint.allowProxyCommand') }),
                  ],
                }),
                textField(t('field.maxSessions'), 'maxSessions', '4', t('hint.maxSessions')),
                jsxs('div', {
                  className: 'tt_cardField',
                  onBlur: (event) => {
                    // 焦点离开整个字段（含下拉列表）才收起；点击候选项由
                    // preventDefault 保持焦点在输入框内，不会触发这里的收起
                    if (!event.currentTarget.contains(event.relatedTarget)) setShellListOpen(false)
                  },
                  children: [
                    jsx('span', { className: 'tt_cardLabel', children: winHost ? t('field.shellWindows') : t('field.shell') }),
                    jsx('input', {
                      className: 'tt_cardInput',
                      value: form.shell ?? '',
                      placeholder: winHost ? t('placeholder.shellWindows') : t('placeholder.shell'),
                      autoComplete: 'off',
                      spellCheck: false,
                      onFocus: () => setShellListOpen(true),
                      onClick: () => setShellListOpen(true),
                      onKeyDown: (event) => {
                        if (event.key === 'Escape') setShellListOpen(false)
                      },
                      onChange: (event) => {
                        set('shell', event.target.value)
                        setShellListOpen(true)
                      },
                    }),
                    ...(shellListOpen ? [jsx('div', {
                      className: 'tt_envList tt_shellList',
                      children: (() => {
                        const kw = (form.shell ?? '').trim().toLowerCase()
                        const hit = kw === '' ? shellOptions : shellOptions.filter((path) => path.toLowerCase().includes(kw))
                        if (hit.length === 0) {
                          return jsx('span', { className: 'tt_envMore', children: t('list.noShellCandidate') })
                        }
                        return hit.map((path) => jsx('button', {
                          type: 'button',
                          className: 'tt_envItem',
                          onMouseDown: (event) => event.preventDefault(),
                          onClick: () => {
                            set('shell', path)
                            setShellListOpen(false)
                          },
                          children: path,
                        }, path))
                      })(),
                    }, 'shell-list')] : []),
                    jsx('span', { className: 'tt_cardHint', children: winHost
                      ? t('hint.shellCandidatesWindows')
                      : t('hint.shellCandidates') }),
                  ],
                }, 'shell-field'),
                textField('TERM', 'term', 'xterm-256color', t('hint.term')),
                textField('COLORTERM', 'colorTerm', 'truecolor', ''),
                textField(t('field.cwd'), 'cwd', '', t('placeholder.cwd')),
                textField(t('field.grace'), 'reconnectGraceSec', '120', t('hint.grace')),
                sectionTitle(t('section.ssh')),
                jsxs('div', {
                  className: 'tt_cardField',
                  children: [
                    jsx('span', { className: 'tt_cardLabel', children: t('panel.sshBook') }),
                    ...(Array.isArray(form.sshHosts) && form.sshHosts.length > 0
                      ? [jsx('div', {
                          className: 'tt_hostList',
                          // 展开编辑表单时取消 208px 滚动限制：编辑表单比列表高得多，
                          // 困在滚动容器里会连着「应用/取消」一起被裁掉
                          'data-editing': editing !== null ? '' : undefined,
                          children: form.sshHosts.map((host) => jsxs('div', {
                            children: [
                              jsxs('div', {
                                className: 'tt_sshHostRow',
                                children: [
                                  jsx('div', { className: 'tt_sshHostMeta', children: [
                                    jsx('span', { className: 'tt_sshHostName', children: host?.name ?? '' }),
                                    jsx('span', { className: 'tt_sshHostTarget', children: sshHostTargetLabel(host ?? {}) }),
                                  ] }),
                                  jsx('button', { type: 'button', className: 'tt_toolBtn', disabled: probeStates[host?.name]?.running === true, onClick: () => void testSshHost(host), title: t('btn.probeRowTitle'), children: probeStates[host?.name]?.running === true ? t('msg.testing') : t('btn.test') }),
                                  jsx('button', { type: 'button', className: 'tt_toolBtn', onClick: () => startEditSshHost(host), children: t('btn.edit') }),
                                  jsx('button', { type: 'button', className: 'tt_toolBtn', onClick: () => removeSshHost(host?.name), children: t('btn.delete') }),
                                ],
                              }),
                              probeStates[host?.name] && probeStates[host?.name].text
                                ? jsx('div', { className: 'tt_sshProbeResult' + (probeStates[host?.name].ok ? ' tt_sshProbeOk' : ' tt_sshProbeBad'), children: probeStates[host?.name].text })
                                : null,
                              editing === host?.name ? renderSshHostEditor() : null,
                            ],
                          }, String(host?.name ?? ''))),
                        })]
                      : [jsx('span', { className: 'tt_cardHint', children: t('list.emptySshHosts') })]),
                    jsxs('div', {
                      className: 'tt_cardRow',
                      children: [
                        jsx('button', { type: 'button', className: 'tt_toolBtn', onClick: () => void importSshConfig(), children: t('btn.importSshConfig') }),
                        jsx('span', { className: 'tt_cardHint', children: t('hint.importSshConfig') }),
                      ],
                    }),
                    jsx('span', { className: 'tt_cardHint', children: t('hint.sshBook') }),
                  ],
                }),
                jsxs('div', {
                  className: 'tt_cardField',
                  children: [
                jsxs('div', {
                  className: 'tt_cardField',
                  children: [
                    jsx('span', { className: 'tt_cardLabel', children: t('panel.tunnels') }),
                    ...(Array.isArray(form.tunnels) && form.tunnels.length > 0
                      ? [jsx('div', {
                          children: form.tunnels.map((tunnel) => {
                            const st = tunnelStatus.find((s) => s.name === tunnel?.name)
                            const state = st?.state ?? 'stopped'
                            const isEditing = editingTunnel !== null && String(tunnel?.name ?? '') === editingTunnel
                            return jsxs('div', {
                              className: 'tt_sshHostRow',
                              'data-editing': isEditing ? '' : undefined,
                              children: [
                                jsx('span', { className: 'tt_tunnelDot', 'data-state': state, title: state }),
                                jsx('div', { className: 'tt_sshHostMeta', children: [
                                  jsx('span', { className: 'tt_sshHostName', children: (tunnel?.name ?? '') + ' · ' + tunnelRule(tunnel ?? {}) }),
                                  jsx('span', { className: 'tt_sshHostTarget', children: (tunnel?.bookName ?? '') + (st?.error ? ' · ' + st.error : '') + (st?.lastForwardError ? ' · ' + st.lastForwardError : '') }),
                                ] }),
                                jsx('input', { type: 'checkbox', className: 'tt_cardCheckbox', checked: tunnel?.enabled !== false, title: t('check.tunnelEnabled'), onChange: (event) => toggleTunnelEnabled(tunnel?.name, event.target.checked) }),
                                // 编辑：回填到下方表单（改端口/条目 = 换名字，按原始 name 定位保存）
                                jsx('button', { type: 'button', className: 'tt_toolBtn', onClick: () => startEditTunnel(tunnel), children: t('btn.edit') }),
                                jsx('button', { type: 'button', className: 'tt_toolBtn', onClick: () => removeTunnel(tunnel?.name), children: t('btn.delete') }),
                              ],
                            }, String(tunnel?.name ?? ''))
                          }),
                        })]
                      : [jsx('span', { className: 'tt_cardHint', children: t('list.emptyTunnels') })]),
                    jsxs('div', {
                      className: 'tt_sshEdit',
                      children: [
                        jsxs('div', {
                          className: 'tt_cardRow tt_tunnelHead',
                          children: [
                            // 方向用分段控件：只有两个值，下拉太重；文案保留 -L/-R 便于对照 ssh 命令行
                            jsxs('div', { className: 'tt_segmented', role: 'group', 'aria-label': t('field.direction'), children: [
                              jsx('button', {
                                type: 'button',
                                className: 'tt_segmentedBtn',
                                'data-active': tunnelDraft.direction !== 'remote' ? '' : undefined,
                                title: t('option.localForwardTitle'),
                                onClick: () => setDraftValue('direction', 'local'),
                                children: t('option.localForward'),
                              }),
                              jsx('button', {
                                type: 'button',
                                className: 'tt_segmentedBtn',
                                'data-active': tunnelDraft.direction === 'remote' ? '' : undefined,
                                title: t('option.remoteForwardTitle'),
                                onClick: () => setDraftValue('direction', 'remote'),
                                children: t('option.remoteForward'),
                              }),
                            ] }),
                            jsxs('select', { className: 'tt_cardInput', value: tunnelDraft.bookName, onChange: setDraft('bookName'), children: [
                              jsx('option', { value: '', children: t('option.selectBook') }),
                              ...(Array.isArray(form?.sshHosts) ? form.sshHosts.map((host) => jsx('option', { value: host?.name ?? '', children: host?.name ?? '' })) : []),
                            ] }),
                          ],
                        }),
                        jsx('span', { className: 'tt_cardHint', children: selectedBook !== undefined
                          ? t('hint.tunnelViaBook', { book: sshHostTargetLabel(selectedBook) })
                          : t('hint.tunnelBookEmpty') }),
                        /*
                         * 两端「地址:端口」成对呈现 + 箭头示明流向。
                         *
                         * 每个方向都**恰好有一端是固定的**（宿主把这一端硬编码了）：
                         *   -L：本机固定监听 127.0.0.1，SSH 服务器侧目标可填；
                         *   -R：本机固定拨号 127.0.0.1，SSH 服务器侧监听可填。
                         * 固定端渲染成**静态文本而不是输入框**——给一个改不动的框是骗人。
                         * 箭头方向 = 数据流向（-R 时 CSS 翻转 180°）。
                         */
                        tunnelDraft.direction === 'local'
                          ? jsxs('div', { className: 'tt_tunnelEndpoints', children: [
                              jsxs('div', { className: 'tt_tunnelHop', children: [
                                jsxs('div', { className: 'tt_tunnelEndpoint', children: [
                                  jsx('span', { className: 'tt_tunnelEndpointStatic', title: t('hint.localListenFixed'), children: '127.0.0.1' }),
                                  jsx('span', { className: 'tt_tunnelColon', children: ':' }),
                                  jsx('input', { className: 'tt_cardInput tt_tunnelPort', placeholder: t('placeholder.localPort'), value: tunnelDraft.localPort, autoComplete: 'off', inputMode: 'numeric', 'aria-label': t('field.localListenPort'), onChange: setDraft('localPort') }),
                                ] }),
                                jsx('span', { className: 'tt_tunnelArrow', 'data-direction': 'local', title: t('hint.flowLocalToRemote'), 'aria-hidden': 'true', children: '→' }),
                              ] }),
                              jsxs('div', { className: 'tt_tunnelEndpoint', children: [
                                jsx('input', { className: 'tt_cardInput tt_tunnelHost', placeholder: t('placeholder.remoteHost'), title: t('hint.remoteHostTitle'), value: tunnelDraft.remoteHost, autoComplete: 'off', 'aria-label': t('field.remoteHost'), onChange: setDraft('remoteHost') }),
                                jsx('span', { className: 'tt_tunnelColon', children: ':' }),
                                jsx('input', { className: 'tt_cardInput tt_tunnelPort', placeholder: t('placeholder.port'), value: tunnelDraft.remotePort, autoComplete: 'off', inputMode: 'numeric', 'aria-label': t('field.remotePort'), onChange: setDraft('remotePort') }),
                              ] }),
                            ] })
                          : jsxs('div', { className: 'tt_tunnelEndpoints', children: [
                              jsxs('div', { className: 'tt_tunnelHop', children: [
                                jsxs('div', { className: 'tt_tunnelEndpoint', children: [
                                  jsx('input', { className: 'tt_cardInput tt_tunnelHost', placeholder: t('placeholder.remoteListenHost'), title: t('hint.remoteListenHost'), value: tunnelDraft.remoteHost, autoComplete: 'off', 'aria-label': t('field.remoteListenHost'), onChange: setDraft('remoteHost') }),
                                  jsx('span', { className: 'tt_tunnelColon', children: ':' }),
                                  jsx('input', { className: 'tt_cardInput tt_tunnelPort', placeholder: t('placeholder.listenPort'), value: tunnelDraft.remotePort, autoComplete: 'off', inputMode: 'numeric', 'aria-label': t('field.remoteListenPort'), onChange: setDraft('remotePort') }),
                                ] }),
                                jsx('span', { className: 'tt_tunnelArrow', 'data-direction': 'remote', title: t('hint.flowRemoteToLocal'), 'aria-hidden': 'true', children: '→' }),
                              ] }),
                              jsxs('div', { className: 'tt_tunnelEndpoint', children: [
                                jsx('span', { className: 'tt_tunnelEndpointStatic', title: t('hint.localDialFixed'), children: '127.0.0.1' }),
                                jsx('span', { className: 'tt_tunnelColon', children: ':' }),
                                jsx('input', { className: 'tt_cardInput tt_tunnelPort', placeholder: t('placeholder.localTargetPort'), value: tunnelDraft.localTargetPort, autoComplete: 'off', inputMode: 'numeric', 'aria-label': t('field.localTargetPort'), onChange: setDraft('localTargetPort') }),
                              ] }),
                            ] }),
                        jsx('div', { className: 'tt_tunnelEndpoints', children: [
                          jsx('span', { className: 'tt_tunnelEndLabel', children: tunnelDraft.direction === 'local'
                            ? t('hint.tunnelLocalSummary')
                            : t('hint.tunnelRemoteSummary') }),
                        ] }),
                        jsx('div', { className: 'tt_cardRow tt_tunnelActions', children: [
                          editingTunnel === null
                            ? jsx('button', { type: 'button', className: 'tt_cardSave', onClick: addTunnel, children: t('btn.addTunnel') })
                            : jsx('button', { type: 'button', className: 'tt_cardSave', onClick: saveTunnelEdit, children: t('btn.saveEdit') }),
                          editingTunnel === null
                            ? null
                            : jsx('button', { type: 'button', className: 'tt_toolBtn', onClick: cancelEditTunnel, children: t('btn.cancel') }),
                          jsx('span', { className: 'tt_cardHint', children: editingTunnel === null
                            ? t('hint.tunnelAdd')
                            : t('hint.tunnelEditing', { name: editingTunnel }) }),
                        ] }),
                      ],
                    }),
                  ],
                }),
                jsxs('div', {
                  className: 'tt_cardField',
                  children: [
                    jsx('span', { className: 'tt_cardLabel', children: t('panel.hostKeys') }),
                        jsx('button', { type: 'button', className: 'tt_toolBtn', onClick: () => void importKnownHosts(), children: t('btn.importKnownHosts') }),
                      ],
                    }),
                    ...(Array.isArray(form.hostKeys) && form.hostKeys.length > 0
                      ? [jsx('div', {
                          className: 'tt_hostList',
                          children: form.hostKeys.map((hk, index) => jsxs('div', {
                            className: 'tt_sshHostRow',
                            children: [
                              jsx('div', { className: 'tt_sshHostMeta', children: [
                                jsx('span', { className: 'tt_sshHostName', children: String(hk?.host ?? '') + ':' + String(hk?.port ?? 22) }),
                                jsx('span', { className: 'tt_sshHostTarget', children: hostKeyFingerprints(hk).map((fp) => 'sha256:' + fp).join(' / ') }),
                              ] }),
                              jsx('button', { type: 'button', className: 'tt_toolBtn', onClick: () => void removeHostKey(hk), children: t('btn.delete') }),
                            ],
                          }, String(hk?.host ?? '') + ':' + String(hk?.port ?? 22) + '#' + String(index))),
                        })]
                      : [jsx('span', { className: 'tt_cardHint', children: t('list.emptyHostKeys') })]),
                    jsx('span', { className: 'tt_cardHint', children: t('hint.hostKeys') }),
                  ],
                }),
                jsxs('div', {
                  className: 'tt_cardField tt_cardRow',
                  children: [
                    jsx('button', { className: 'tt_cardSave', disabled: saving, onClick: () => void save(), children: saving ? t('msg.saving') : t('btn.save') }),
                    jsx('span', { className: 'tt_cardMessage' + (message.kind === 'ok' ? ' tt_cardMessageOk' : message.kind === 'error' ? ' tt_cardMessageError' : ''), children: message.text }),
                  ],
                }),
              ] }),
        ],
      }) : null,
    ],
  })
}


    exports.inject = ['slots', 'sessions']

    /**
     * DSH ≥0.1.6-alpha.2 的行配置 key：`<bundle 包名>#<行 id>`，行 id 取自 bundle 的
     * cordis.patch.yml。独立安装时 bundle 是本包，装全家桶时是 @hyzyn/dsh-all —— 两个都注册，
     * 未命中的那个只是躺在 ledger 里，不会渲染。
     */
    const ROW_CONFIG_KEYS = [
      '@hyzyn/dsh-tty#tty',
      '@hyzyn/dsh-all#tty',
    ]
    exports.apply = (ctx) => {
      installI18n(ctx)
      sessionsService = ctx.sessions
      /*
       * 官方凭据引用的浏览器侧命名空间（可选）。
       *
       * **必须同时声明 `remote.credentials`**：命名空间不是 `remote` 上的普通属性，而是网关
       * 安装的**独立服务**（`remoteServiceKey(ns)` = `remote.<ns>`，见 dsh-api-gateway）——
       * 只声明 `remote` 时 `remote.credentials` 就是 undefined（实测踩过：界面会把锅甩给宿主，
       * 显示"宿主未提供凭据服务"，其实是自己的依赖没声明）。
       *
       * 用 `ctx.inject` 而不是静态 `exports.inject`：没装 / 老宿主上回调不触发，插件照常加载，
       * 对话框那一行自己降级。
       */
      ctx.inject(['remote', 'remote.credentials'], (remoteCtx) => {
        // 两种取值都试一遍：命名空间是**独立服务**（`remote.credentials`），网关同时把它挂在
        // `remote` 上供消费方嵌套访问（官方设置卡片用的是 `ctx.remote.credentials.*`）。
        credentialsRemote = remoteCtx.remote?.credentials ?? remoteCtx['remote.credentials'] ?? null
        return () => { credentialsRemote = null }
      })
      // 侧栏入口先按可见挂载（与旧行为一致），config 确认禁用后由闸门收起；
      // 运行期显隐由 syncSshHostsCache（各处 config 拉取/保存共用出口）驱动
      let entryMounted = false
      let unmountEntry = () => {}
      entryGate = {
        set(visible) {
          if (visible === entryMounted) return
          entryMounted = visible
          if (visible) {
            unmountEntry = mountSidebarEntry()
            return
          }
          unmountEntry()
          unmountEntry = () => {}
          // 禁用瞬间的终端面板一起收掉：存量 WS 已被服务端关闭，面板留着只会不停重连失败
          closeModal()
          renderConnbar()
        },
      }
      setEntryVisible(true)
      // 挂载时拉一次 config：预热连接簿缓存 + 驱动入口显隐（失败静默，各入口打开时会再拉）
      void refreshSshHosts()
      // DSH ≥0.1.6-alpha.2：侧边栏「插件」页里该行的配置页。插槽不存在时 inject 不会触发，
      // 因此在旧版上完全无副作用，一份代码同时兼容两代。
      for (const key of ROW_CONFIG_KEYS) {
        ctx.slots.inject('plugins.row.config', () => ctx.slots.register({
          name: 'plugins.row.config',
          key,
        }, TtySettingsCard))
      }
      // DSH ≥0.1.6：设置里与「通用设置」平级的「插件配置」页（子 slot 由
      // @hyzyn/dsh-kit-settings 声明）。不传 view，卡片走各自原有的可折叠形态。
      ctx.slots.inject('settings.kit.item', () => ctx.slots.register({
        name: 'settings.kit.item',
        id: 'tty',
        order: 80,
        label: () => t('card.name'),
      }, TtySettingsCard))
      // DSH ≤0.1.5：设置 → 插件 的「插件配置」标签页，keyed 插槽按 settings 命名空间派发。
      ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
        name: 'settings.plugin.item',
        // settings.plugin.item 是 keyed 插槽：key 必须是该卡片所编辑的 settings 命名空间
        key: 'tty',
        order: 100,
      }, TtySettingsCard))
      // 连接栏按钮注册点：其他插件（如 dsh-docker）经 ctx.inject(['ttyConnbar'])
      // 注册上下文按钮；内置动作也走同一通道，tty 不感知具体插件
      const disposeConnbar = ctx.provide('ttyConnbar', {
        /** 契约版本：1 = addAction + requestRender（payload 见 README「客户端服务契约」）。 */
        version: 1,
        addAction: registerConnbarAction,
        requestRender() {
          renderConnbar()
        },
      })
      // 终端服务（0.14.0 起）：其他插件（如 dsh-docker）可以「跑一条命令拿一个终端」，
      // 用于 `docker exec -it <容器> sh` 这类交互式进入。两个入口：
      //   open  —— 在 tty 面板里新开一个标签（会弹面板，命令标签随之持久化重跑）
      //   mount —— 把终端挂进调用方自己的容器（就地嵌入，不弹面板、不进标签栏）
      // 契约见 README「客户端服务契约」；消费方应按 version 校验后再用。
      const disposeTerminal = ctx.provide('ttyTerminal', {
        /** 契约版本：1 = open；2 = 增加 mount（就地嵌入）；3 = open 默认复用同连接同命令的标签。 */
        version: 3,
        /**
         * 新开标签并执行命令。options：
         *   command（必填，单行）· book（连接簿条目名，走 SSH）·
         *   spec（内联 SSH 字段，走 SSH）· label（标签名）· cwd（本地标签工作目录）·
         *   reuse（默认 true：同「连接 + 命令」已有活标签就聚焦它，不再新开）
         * 三者互斥：book > spec > 本地。返回被打开或被复用的标签。
         */
        open(options) {
          // 插件禁用时不提供终端能力（服务端 WS 闸门也会拒绝 spawn）
          if (!entryVisible) return
          const command = normalizeTerminalCommand(options)
          const spawnSpec = buildTerminalSpec(options, command)
          const label = typeof options?.label === 'string' && options.label !== '' ? options.label : undefined
          ensureStyle()
          /*
           * 复用：同一个「连接 + 命令」再开一次 = **聚焦已有标签**，不再堆一个重复的。
           *
           * 动机是实测：容器卡片「终端」按钮连点几下就冒出三个一模一样的 exec 标签，而每个
           * 标签各占一个会话名额——并发上限被白白吃光，接着满屏都是「会话数已达上限」。
           * 真想要并列两个同样的会话，传 `reuse: false` 显式声明。
           */
          if (options?.reuse !== false) {
            const existing = findReusableTab(spawnSpec)
            if (existing !== null) {
              ensureModalVisible()
              switchTab(existing.sid)
              return existing
            }
          }
          // 最小化中也要恢复（否则标签加进隐藏的弹窗里，用户看到"点了没反应"）
          ensureModalVisible()
          return addTab(spawnSpec, label)
        },
        /**
         * 把终端挂进 hostEl（就地嵌入，0.15.0）。options 与 open 相同，额外：
         * hostEl 需是 HTMLElement（挂载点，建议 position:relative、有确定尺寸）。
         * 返回 dispose()：调用方在收起自己的容器时调用，结束会话并卸载 DOM。
         * 嵌入终端与面板标签共用连接，但 tty 面板关闭不会波及它。
         */
        mount(hostEl, options) {
          if (!entryVisible) return () => {}
          return mountTerminal(hostEl, options)
        },
      })
      // 面板内挂载位（0.16.0）：其他插件在终端面板右侧挂一块自己的界面（dsh-docker
      // 的容器面板就走这里），终端保持可见。契约见 README「客户端服务契约」。
      const disposePanel = ctx.provide('ttyPanel', {
        /** 契约版本：2 = 增加 minimize()（1 = mountPane + isOpen）。 */
        version: 2,
        /** 面板是否正开着（最小化不算）：调用方据此决定挂进来还是走自己的弹窗。 */
        isOpen() {
          return modalEl !== null && !minimized
        },
        /**
         * 挂一块 pane（同一时刻只有一个，返回的 handle 见函数注释）。
         *
         * `options.ownerSid`（0.18.4，可选）：这块 pane 归属哪个标签——默认当前活动
         * 标签；切换标签时归属别的标签的 pane 会**收起**（DOM 与你 render 的树都保活，
         * 切回来即恢复），传 `null` 表示不隶属任何标签（永远可见）。
         */
        mountPane(options) {
          return mountDockPane(options)
        },
        /**
         * 最小化整个终端面板：弹窗藏起来，但 DOM / WebSocket / xterm 缓冲全保留、会话继续
         * 跑；恢复靠侧边栏「终端」入口（那上面会挂徽标与状态点）。
         *
         * 消费方用它「把舞台让出去」——典型是 dsh-docker 把日志交给会话之后，自动折起终端
         * 让用户看到会话，而不是对着一个盖住会话的弹窗猜「点了没有反应」。
         *
         * @returns 调用之后面板是否处于最小化态（没开、已最小化、或状态不允许时返回 false，
         *   调用方据此决定要不要把指引写进提示文案）。
         */
        minimize() {
          minimizeModal()
          return modalEl !== null && minimized
        },
      })
      return () => {
        entryGate = null
        entryVisible = false
        unmountEntry()
        disposePanel()
        disposeTerminal()
        disposeConnbar()
        closeModal()
      }
    }
    return exports
  },
})
