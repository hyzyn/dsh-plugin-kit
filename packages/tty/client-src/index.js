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
 *     筛选选择器（宿主 /api/dsh-tty/env-vars，仅 env 插件托管变量名）
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
 *   - 会话持久化（设置 persistence=tmux）：「+」菜单出现「持久终端」、SSH
 *     对话框/连接簿出现「持久会话」——spawn/ssh 帧带 persist + 稳定
 *     persistName，宿主以 `tmux -L dsh-tty new-session -A -s <名>` 托管；
 *     断线保活超时 / 宿主重启后重开标签按同名接回原现场（tmux 重画可见屏，
 *     正在跑的程序原样存活）；连接栏与 ready 帧带 tmux 持久标记
 * 帧协议与宿主半体（src/index.ts）对齐：spawn/ssh/input/resize/kill/
 * sessions/attach ↔ ready/data/exit/error/sessions。
 */
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { SearchAddon } from '@xterm/addon-search'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { WebglAddon } from '@xterm/addon-webgl'
import xtermCss from '@xterm/xterm/css/xterm.css'

/* ================================ CSS ================================ */

const CSS = [
  '.tt_sidebarEntry{width:100%;height:32px;color:var(--dsw-alias-label-secondary);cursor:pointer;white-space:nowrap;background:0 0;border:none;border-radius:8px;align-items:center;gap:8px;padding:0 12px;font-size:13px;display:flex}',
  '.tt_sidebarEntry:hover{background:var(--dsw-specific-sidebar-nav-item-hover);color:var(--dsw-alias-label-primary)}',
  '.tt_sidebarEntry[data-active]{background:var(--dsw-specific-sidebar-nav-item-active);color:var(--dsw-alias-label-primary);font-weight:600}',
  '.tt_sidebarEntryIcon{flex:none;justify-content:center;align-items:center;display:inline-flex}',
  '.tt_sidebarEntryLabel{text-overflow:ellipsis;overflow:hidden}',
  '[data-sidebar-collapsed] .tt_sidebarEntry{justify-content:center;width:100%;padding:0}',
  '[data-sidebar-collapsed] .tt_sidebarEntryLabel{display:none}',
  '.tt_modalBackdrop{z-index:1300;background:var(--dsw-alias-bg-mask-1);justify-content:center;align-items:flex-start;display:flex;position:fixed;inset:0;padding-top:5vh}',
  '.tt_modal{background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l2);width:min(1180px,96vw);height:min(84vh,920px);box-shadow:var(--dsw-shadow-lv3);color:var(--dsw-alias-label-primary);border-radius:14px;flex-direction:column;gap:0;display:flex;overflow:hidden}',
  // 单行头部（0.9）：标题图标 + 标签区（兼标题行）+ 状态/连接信息 + 工具/窗口按钮
  '.tt_header{flex:none;align-items:center;gap:8px;padding:4px 10px;border-bottom:1px solid var(--dsw-alias-border-l1);display:flex}',
  '.tt_titleIcon{flex:none;display:inline-flex;color:var(--dsw-alias-label-primary)}',
  '.tt_status{font-size:11px;color:var(--dsw-alias-label-tertiary);align-items:center;gap:6px;display:flex;white-space:nowrap;flex:none}',
  '.tt_statusDot{width:8px;height:8px;border-radius:50%;background:var(--dsw-alias-label-tertiary);flex:none}',
  '.tt_statusDot[data-state=connected]{background:var(--dsw-alias-state-success-primary)}',
  '.tt_statusDot[data-state=error]{background:var(--dsw-alias-state-error-primary)}',
  '.tt_toolBtn{appearance:none;background:0 0;border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);border-radius:8px;height:26px;padding:0 8px;cursor:pointer;font-size:12px;flex:none;white-space:nowrap}',
  '.tt_toolBtn:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}',
  // 图标化工具按钮（搜索/清屏/复制/粘贴）：语义靠 tooltip 与固定次序
  '.tt_iconBtn{width:26px;padding:0;display:inline-flex;align-items:center;justify-content:center}',
  // 连接栏扩展按钮（图标 + 文字）
  '.tt_connAct{display:inline-flex;align-items:center;gap:5px}',
  '.tt_searchInput{width:140px;height:26px;background:var(--dsw-specific-input-major);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;color:inherit;font:inherit;font-size:12px;padding:0 8px;flex:none}',
  '.tt_searchInput:focus{border-color:var(--dsw-alias-state-business-primary);outline:none}',
  '.tt_min{appearance:none;background:0 0;border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);border-radius:8px;width:26px;height:26px;cursor:pointer;font-size:14px;line-height:1;flex:none}',
  '.tt_close{appearance:none;background:0 0;border:none;color:var(--dsw-alias-label-tertiary);border-radius:8px;width:26px;height:26px;cursor:pointer;font-size:15px;line-height:1;flex:none}',
  '.tt_min:hover,.tt_close:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}',
  // 最小化：弹窗仅隐藏（会话与输出缓冲保持存活），状态合并进侧边栏
  // 「终端」入口（会话数徽标 + 状态点，点击入口恢复）；入口不存在时才
  // 退回紧凑悬浮条
  '.tt_modalBackdrop[data-minimized]{display:none}',
  '.tt_sidebarEntryBadge{display:none;align-items:center;gap:5px;margin-left:auto;padding-left:8px;flex:none}',
  '.tt_sidebarEntry[data-minimized]{color:var(--dsw-alias-label-primary)}',
  '.tt_sidebarEntry[data-minimized] .tt_sidebarEntryBadge{display:inline-flex}',
  '[data-sidebar-collapsed] .tt_sidebarEntryBadge{margin-left:0;padding-left:0}',
  '[data-sidebar-collapsed] .tt_sidebarBadgeCount{display:none}',
  '.tt_sidebarBadgeDot{width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-label-tertiary);flex:none}',
  '.tt_sidebarBadgeDot[data-state=connected]{background:var(--dsw-alias-state-success-primary)}',
  '.tt_sidebarBadgeDot[data-state=error]{background:var(--dsw-alias-state-error-primary)}',
  '@keyframes ttPulse{from{box-shadow:0 0 0 5px rgba(63,185,80,.35)}to{box-shadow:0 0 0 0 rgba(63,185,80,0)}}',
  '.tt_sidebarBadgeDot[data-active],.tt_dockDot[data-active]{animation:ttPulse .9s ease-out}',
  '.tt_dockCompact .tt_dockStatus{display:none}',
  '.tt_dock{position:fixed;right:18px;bottom:18px;z-index:1300;display:inline-flex;align-items:center;gap:10px;height:38px;padding:0 8px 0 16px;border-radius:999px;background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l2);box-shadow:var(--dsw-shadow-lv3);color:var(--dsw-alias-label-primary);font-size:13px;cursor:pointer;user-select:none}',
  '.tt_dock:hover{border-color:var(--dsw-alias-label-dimmed)}',
  '.tt_dockTitle{display:flex;align-items:center;gap:8px;font-weight:600;white-space:nowrap}',
  '.tt_dockCount{color:var(--dsw-alias-label-tertiary);font-size:12px;font-weight:400}',
  '.tt_dockStatus{max-width:220px;color:var(--dsw-alias-label-tertiary);font-size:12px;white-space:nowrap;text-overflow:ellipsis;overflow:hidden}',
  '.tt_dockDot{width:8px;height:8px;border-radius:50%;background:var(--dsw-alias-label-tertiary);flex:none}',
  '.tt_dockDot[data-state=connected]{background:var(--dsw-alias-state-success-primary)}',
  '.tt_dockDot[data-state=error]{background:var(--dsw-alias-state-error-primary)}',
  '.tt_dockClose{appearance:none;background:0 0;border:none;color:var(--dsw-alias-label-tertiary);border-radius:50%;width:26px;height:26px;cursor:pointer;font-size:14px;line-height:1;flex:none;display:inline-flex;align-items:center;justify-content:center}',
  '.tt_dockClose:hover{color:var(--dsw-alias-state-error-primary)}',
  // 标签区并入头部行：吃掉剩余空间，多标签时横向滚动（滚动条尽量细）
  '.tt_tabs{flex:1 1 0;min-width:0;display:flex;align-items:center;gap:6px;overflow-x:auto;overflow-y:hidden;padding:2px 0;scrollbar-width:thin}',
  '.tt_tab{display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 8px 0 12px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font-size:12px;cursor:pointer;flex:none;white-space:nowrap}',
  '.tt_tab:hover{color:var(--dsw-alias-label-primary)}',
  '.tt_tab[data-active]{background:var(--dsw-specific-sidebar-nav-item-active);color:var(--dsw-alias-label-primary);font-weight:600}',
  '.tt_tabClose{appearance:none;background:0 0;border:none;color:inherit;cursor:pointer;font-size:13px;line-height:1;padding:0 2px}',
  '.tt_tabRename{width:96px;height:20px;font-size:12px;border:1px solid var(--dsw-alias-state-business-primary);border-radius:4px;background:var(--dsw-alias-bg-layer-3);color:inherit;padding:0 4px;box-sizing:border-box;font-family:inherit}',
  '.tt_tabClose:hover{color:var(--dsw-alias-state-error-primary)}',
  '.tt_tabAdd{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border:1px dashed var(--dsw-alias-border-l2);border-radius:8px;background:0 0;color:var(--dsw-alias-label-secondary);font-size:16px;cursor:pointer;flex:none}',
  '.tt_tabAdd:hover{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-label-secondary)}',
  '.tt_body{flex:1;min-height:0;position:relative;background:#0d1117;overflow:hidden}',
  // 连接栏（仅 SSH 标签显示）：左侧连接状态，右侧 SFTP / 后续扩展按钮
  '.tt_connbar{flex:none;display:flex;align-items:center;gap:8px;padding:3px 10px;border-bottom:1px solid var(--dsw-alias-border-l1)}',
  '.tt_connbar[data-hidden]{display:none}',
  '.tt_connArea{flex:1 1 auto;min-width:0;display:flex;align-items:center;gap:8px}',
  '.tt_connDot{width:8px;height:8px;border-radius:50%;background:var(--dsw-alias-label-tertiary);flex:none}',
  '.tt_connDot[data-state=connected]{background:var(--dsw-alias-state-success-primary)}',
  '.tt_connDot[data-state=connecting]{background:var(--dsw-alias-state-warning-primary,#d29922)}',
  '.tt_connDot[data-state=exited]{background:var(--dsw-alias-label-tertiary)}',
  '.tt_connDot[data-state=error]{background:var(--dsw-alias-state-error-primary)}',
  '.tt_connTarget{font:12px "SF Mono",Menlo,Consolas,monospace;color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}',
  '.tt_connActions{display:flex;align-items:center;gap:6px;flex:none;margin-left:auto}',
  '.tt_connActions{display:flex;align-items:center;gap:6px;flex:none}',
  '.tt_tunnelPop{position:fixed;z-index:1350;display:flex;flex-direction:column;gap:8px;padding:10px 12px;background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l2);border-radius:10px;box-shadow:var(--dsw-shadow-lv3);min-width:280px;max-width:380px;color:var(--dsw-alias-label-primary)}',
  '.tt_tunnelPopRow{display:flex;align-items:center;gap:8px;min-width:0}',
  '.tt_term{position:absolute;inset:0;padding:8px 10px}',
  '.tt_term .xterm{height:100%}',
  '.tt_overlay{position:absolute;inset:0;align-items:center;justify-content:center;background:rgba(0,0,0,.55);color:#e6edf3;font-size:13px;cursor:pointer;display:flex;z-index:5}',
  '.tt_overlay:empty{display:none}',
  '.tt_card{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;list-style:none;transition:border-color .16s,background .16s}',
  '.tt_card:hover{border-color:var(--dsw-alias-label-dimmed)}',
  '.tt_cardOpen{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-label-dimmed)}',
  '.tt_cardHeader{appearance:none;width:100%;font:inherit;color:inherit;text-align:left;cursor:pointer;background:0 0;border:0;border-radius:12px;align-items:center;gap:12px;padding:14px 16px;display:flex}',
  '.tt_cardHeadText{flex-direction:column;flex:1;gap:4px;min-width:0;display:flex}',
  '.tt_cardName{color:var(--dsw-alias-label-primary);font-size:15px;font-weight:600;line-height:1.4}',
  '.tt_cardDescription{color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:1.5}',
  '.tt_cardChevron{color:var(--dsw-alias-label-tertiary);flex:none;transition:transform .16s}',
  '.tt_cardChevronOpen{transform:rotate(180deg)}',
  '.tt_cardBody{border-top:1px solid var(--dsw-alias-border-l2);margin:0 16px;padding-bottom:8px}',
  '.tt_cardField{flex-direction:column;gap:6px;padding:12px 0;display:flex}',
  '.tt_cardField+.tt_cardField{border-top:1px solid var(--dsw-alias-border-l2)}',
  '.tt_cardLabel{min-width:0;color:var(--dsw-alias-label-primary);flex:1;font-size:13px;font-weight:500;line-height:1.5}',
  '.tt_cardInput{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);height:34px;font:inherit;color:var(--dsw-alias-label-primary);border-radius:8px;padding:0 12px;font-size:13px;line-height:1.5;box-sizing:border-box}',
  '.tt_cardInput:focus-visible{border-color:var(--dsw-alias-state-business-primary);outline:none}',
  '.tt_cardCheckbox{width:16px;height:16px;accent-color:var(--dsw-alias-state-business-primary)}',
  '.tt_cardRow{align-items:center;gap:8px;display:flex;flex-direction:row}',
  '.tt_cardHint{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:1.5;margin-top:2px}',
  '.tt_cardSave{appearance:none;font:inherit;cursor:pointer;border-radius:8px;padding:5px 14px;font-size:13px;line-height:1.5;background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-3);border:1px solid transparent}',
  '.tt_cardSave:disabled{opacity:.4;cursor:default}',
  '.tt_cardMessage{margin:8px 0 0;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-tertiary)}',
  '.tt_cardMessageOk{color:var(--dsw-alias-state-success-primary)}',
  '.tt_cardMessageError{color:var(--dsw-alias-state-error-primary)}',
  // 「+」新建菜单（本地终端 / SSH 连接簿 / SSH 连接…）
  '.tt_addMenu{position:fixed;z-index:1400;min-width:220px;max-width:320px;background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l2);border-radius:10px;box-shadow:var(--dsw-shadow-lv3);padding:6px;display:flex;flex-direction:column;gap:2px}',
  '.tt_addMenuItem{appearance:none;background:0 0;border:none;color:var(--dsw-alias-label-primary);text-align:left;font:inherit;font-size:13px;padding:7px 10px;border-radius:8px;cursor:pointer;display:flex;flex-direction:column;gap:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
  '.tt_addMenuItem:hover{background:var(--dsw-alias-interactive-bg-hover)}',
  '.tt_addMenuSub{font-size:11px;color:var(--dsw-alias-label-tertiary)}',
  '.tt_addMenuRow{display:flex;align-items:center;gap:4px}',
  '.tt_addMenuRow .tt_addMenuItem{flex:1;min-width:0}',
  '.tt_addMenuEdit{appearance:none;background:0 0;border:none;color:var(--dsw-alias-label-tertiary);cursor:pointer;font-size:14px;line-height:1;flex:none;padding:6px 8px;border-radius:8px}',
  '.tt_addMenuEdit:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}',
  '.tt_addMenuSep{height:1px;background:var(--dsw-alias-border-l1);margin:4px 2px}',
  '.tt_addMenuTitle{font-size:11px;color:var(--dsw-alias-label-tertiary);padding:4px 10px 2px}',
  // SSH 连接对话框
  '.tt_sshBackdrop{position:fixed;inset:0;z-index:1400;background:var(--dsw-alias-bg-mask-1);display:flex;align-items:center;justify-content:center}',
  '.tt_sshCard{width:min(430px,92vw);max-height:86vh;overflow-y:auto;background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l2);border-radius:14px;box-shadow:var(--dsw-shadow-lv3);color:var(--dsw-alias-label-primary);padding:18px;display:flex;flex-direction:column;gap:10px}',
  '.tt_sshTitle{margin:0;font-size:15px;font-weight:600}',
  '.tt_sshRow{display:flex;flex-direction:column;gap:5px}',
  '.tt_sshGrid{display:grid;grid-template-columns:1fr 110px;gap:10px}',
  '.tt_sshActions{display:flex;gap:10px;justify-content:flex-end;margin-top:4px}',
  '.tt_sshError{color:var(--dsw-alias-state-error-primary);font-size:12px;min-height:16px;line-height:1.4}',
  '.tt_sshHostRow{display:flex;align-items:center;gap:8px;padding:6px 0;border-top:1px solid var(--dsw-alias-border-l1)}',
  '.tt_sshHostMeta{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}',
  '.tt_sshHostName{font-size:13px;font-weight:500;color:var(--dsw-alias-label-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
  '.tt_sshHostTarget{font-size:12px;color:var(--dsw-alias-label-tertiary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
  // 连接簿行内编辑表单
  '.tt_sshEdit{border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-layer-3);display:flex;flex-direction:column;gap:8px;padding:10px;margin:4px 0 8px}',
  // 隧道状态点（活跃绿 / 连接中蓝 / 错误红 / 停止灰）
  // 隧道添加表单栅格：本地方向 = 端口窄列 + 主机吃满；远程方向 = 两端口等分
  '.tt_tunnelGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px}',
  '.tt_tunnelGridLocal{display:grid;grid-template-columns:100px minmax(0,1fr) 100px;gap:10px}',
  '.tt_tunnelGrid .tt_cardInput,.tt_tunnelGridLocal .tt_cardInput{min-width:0;width:auto}',
  // 连接簿 / 主机密钥记录列表：条目多时限高滚动
  '.tt_hostList{max-height:200px;overflow-y:auto;display:flex;flex-direction:column}',
  // 隧道状态点（活跃绿 / 连接中蓝 / 错误红 / 停止灰）
  '.tt_tunnelDot{width:8px;height:8px;border-radius:50%;flex:none;background:var(--dsw-alias-label-tertiary)}',
  '.tt_tunnelDot[data-state=active]{background:var(--dsw-alias-state-success-primary)}',
  '.tt_tunnelDot[data-state=connecting]{background:var(--dsw-alias-state-business-primary)}',
  '.tt_tunnelDot[data-state=error]{background:var(--dsw-alias-state-error-primary)}',
  // env:VAR 选择器（筛选框 + 限高滚动列表）
  '.tt_envList{max-height:132px;overflow-y:auto;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-3);display:flex;flex-direction:column;gap:2px;padding:4px}',
  '.tt_envItem{appearance:none;background:0 0;border:none;color:var(--dsw-alias-label-primary);text-align:left;font:12px "SF Mono",Menlo,Consolas,monospace;padding:5px 8px;border-radius:6px;cursor:pointer}',
  '.tt_envItem:hover{background:var(--dsw-alias-interactive-bg-hover)}',
  '.tt_envItem[data-danger]{color:var(--dsw-alias-state-error-primary);font-weight:600}',
  '.tt_envMore{font-size:11px;color:var(--dsw-alias-label-tertiary);padding:4px 8px}',
  '.tt_shellList{margin-top:6px}',
  // SFTP 文件浏览对话框（工具栏 + 行内编辑器 + 列表 + 状态行；列表滚动，卡片定高）
  '.tt_sftpCard{width:min(720px,94vw);height:min(640px,86vh);background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l2);border-radius:14px;box-shadow:var(--dsw-shadow-lv3);color:var(--dsw-alias-label-primary);padding:16px;display:flex;flex-direction:column;gap:10px;overflow:hidden}',
  // 标题行：标题吃满，✕ 固定右上角（统一关闭交互）
  '.tt_sftpTitleRow{display:flex;align-items:center;gap:10px}',
  '.tt_sftpTitleRow .tt_sshTitle{flex:1}',
  '.tt_sftpBar{display:flex;gap:8px;align-items:center}',
  '.tt_sftpPath{flex:1;min-width:0;height:30px;background:var(--dsw-specific-input-major);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;color:inherit;font:12px "SF Mono",Menlo,Consolas,monospace;padding:0 10px;box-sizing:border-box}',
  '.tt_sftpPath:focus{border-color:var(--dsw-alias-state-business-primary);outline:none}',
  '.tt_sftpList{flex:1;min-height:200px;overflow-y:auto;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-3);display:flex;flex-direction:column}',
  // 拖拽上传高亮（0.8.0）：文件/文件夹拖到列表上时显示可放置提示
  '.tt_sftpList[data-drag]{border-color:var(--dsw-alias-state-business-primary);border-style:dashed;background:var(--dsw-alias-interactive-bg-hover)}',
  '.tt_sftpRow{appearance:none;background:0 0;border:none;color:var(--dsw-alias-label-primary);text-align:left;font:inherit;font-size:13px;display:flex;align-items:center;gap:8px;padding:6px 10px;cursor:pointer}',
  '.tt_sftpRow:hover{background:var(--dsw-alias-interactive-bg-hover)}',
  '.tt_sftpIcon{flex:none;width:18px;text-align:center}',
  '.tt_sftpName{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
  '.tt_sftpMeta{flex:none;font-size:11px;color:var(--dsw-alias-label-tertiary);font-family:"SF Mono",Menlo,Consolas,monospace}',
  '.tt_sftpAct{appearance:none;background:0 0;border:none;color:var(--dsw-alias-label-tertiary);cursor:pointer;font-size:13px;line-height:1;flex:none;padding:3px 5px;border-radius:6px}',
  '.tt_sftpAct:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}',
  '.tt_sftpAct[data-danger]{color:var(--dsw-alias-state-error-primary);font-size:12px;font-weight:600}',
  '.tt_sftpEditor{display:flex;gap:8px;align-items:center}',
  '.tt_sftpEditor .tt_cardInput{flex:1;min-width:0;height:30px;font-size:12px}',
  '.tt_sftpFoot{display:flex;align-items:center;gap:10px}',
  '.tt_sftpStatus{flex:1;min-width:0;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-tertiary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
  '.tt_sftpStatus[data-state=error]{color:var(--dsw-alias-state-error-primary)}',
  '.tt_sftpStatus[data-state=busy]{color:var(--dsw-alias-state-business-primary)}',
  // 双栏 SFTP（0.9.0，sftpStyle=dual）：左本机 / 右远程两栏，行内 ⇨/⇦ 直传
  '.tt_sftpDualCard{width:min(1180px,96vw);height:min(720px,88vh);background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l2);border-radius:14px;box-shadow:var(--dsw-shadow-lv3);color:var(--dsw-alias-label-primary);padding:16px;display:flex;flex-direction:column;gap:10px;overflow:hidden}',
  '.tt_sftpDual{flex:1;min-height:0;display:flex;gap:12px}',
  '.tt_sftpPane{flex:1;min-width:0;display:flex;flex-direction:column;gap:8px}',
  '.tt_sftpPaneHead{font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary);white-space:nowrap}',
  '.tt_sftpPane .tt_sftpBar{flex:none}',
  '.tt_sftpTransfer{align-items:center;justify-content:center;display:flex}',
  '.tt_sftpTransferAct{appearance:none;background:0 0;border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);border-radius:8px;min-width:34px;height:26px;cursor:pointer;font-size:14px;flex:none}',
  '.tt_sftpTransferAct:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}',
  '.tt_sftpTransferAct:disabled{opacity:.4;cursor:default}',
].join('\n')

/* ================================ 基础工具 ================================ */

const WS_PATH = '/api/dsh-tty/ws'

function wsUrl() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
  return proto + '//' + location.host + WS_PATH
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
  styleEl.textContent = CSS + '\n' + xtermCss
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

let sessionsService = null
let socket = null
let modalEl = null
let statusChipEl = null
let statusEl = null
let statusDotEl = null
let tabbarEl = null
let connbarEl = null
let connDotEl = null
let connTargetEl = null
let connActionsEl = null
let bodyEl = null
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
let activeSid = null
let tabCounter = 0
let connecting = false
/** 「+」新建菜单与 SSH 连接对话框（挂在 document.body 的浮层）。 */
let addMenuEl = null
let sshDialogEl = null
/** SSH 连接簿缓存：/api/dsh-tty/config 的 sshHosts（设置卡片保存后同步）。 */
let sshHostsCache = []

function setStatus(text, state) {
  if (statusEl === null) return
  statusEl.textContent = text
  statusDotEl.dataset.state = state
  // 单行头部常态不占位：state=connected 时收起状态块，异常/瞬时消息才点亮
  if (statusChipEl !== null) statusChipEl.style.display = state === 'connected' ? 'none' : ''
  // 最小化时用户只看得到侧边栏入口徽标 / 兜底悬浮条，状态同步到那里
  if (dockStatusEl !== null) dockStatusEl.textContent = text
  if (dockDotEl !== null) dockDotEl.dataset.state = state
  const badgeDot = document.querySelector('[data-dsh-tty-entry] .tt_sidebarBadgeDot')
  if (badgeDot !== null) badgeDot.dataset.state = state
}

function sendFrame(msg) {
  if (socket !== null && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(msg))
  }
}

function activeTab() {
  return activeSid !== null ? tabs.get(activeSid) : undefined
}

/** 当前 DSH 会话的工作目录（sessions 客户端服务快照）。 */
function currentCwd() {
  try {
    const snapshot = sessionsService?.list?.getSnapshot?.()
    const cwd = snapshot?.byId?.[snapshot?.current]?.cwd
    return typeof cwd === 'string' && cwd !== '' ? cwd : undefined
  } catch {
    return undefined
  }
}

/** 标签列表持久化（sessionStorage，随浏览器标签页生命周期）：只存未退出的标签。 */
function persistTabs() {
  try {
    const data = [...tabs.values()]
      .filter((tab) => !tab.exited)
      .map((tab) => ({ sid: tab.sid, spawnSpec: tab.spawnSpec, label: tab.label }))
    if (data.length === 0 || modalEl === null) sessionStorage.removeItem(PERSIST_KEY)
    else sessionStorage.setItem(PERSIST_KEY, JSON.stringify(data))
  } catch {
    /* 隐私模式等存储不可用：静默跳过 */
  }
}

/** 读取持久化标签（页面刷新后重开面板用）；结构不合法的条目直接丢弃。 */
function loadPersistedTabs() {
  try {
    const raw = sessionStorage.getItem(PERSIST_KEY)
    if (raw === null) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item) => item !== null && typeof item === 'object' && typeof item.sid === 'string' && item.sid !== '' && item.spawnSpec !== null && typeof item.spawnSpec === 'object')
  } catch {
    return []
  }
}

/**
 * 等待某一类型的第一帧（独立监听，主 onmessage 同时照常处理）；
 * 超时返回 null（宿主不支持该帧 / 网络异常）。
 */
function waitFrame(type, timeoutMs) {
  return new Promise((resolve) => {
    const onMsg = (event) => {
      let msg
      try {
        msg = JSON.parse(event.data)
      } catch {
        return
      }
      if (msg.t === type) {
        clearTimeout(timer)
        socket.removeEventListener('message', onMsg)
        resolve(msg)
      }
    }
    const timer = setTimeout(() => {
      socket.removeEventListener('message', onMsg)
      resolve(null)
    }, timeoutMs)
    socket.addEventListener('message', onMsg)
  })
}

function sendResize(tab) {
  if (tab === undefined || tab.fit === undefined) return
  const dims = tab.fit.proposeDimensions()
  if (dims !== undefined) sendFrame({ t: 'resize', sid: tab.sid, cols: dims.cols, rows: dims.rows })
}

function showTabOverlay(tab, text) {
  if (tab.overlayEl === null || tab.overlayEl === undefined) return
  tab.overlayEl.textContent = text
}

function createTerminal(tab) {
  const term = new Terminal({
    cursorBlink: true,
    fontSize: 13,
    fontFamily: '"SF Mono", Menlo, Consolas, "Courier New", monospace',
    scrollback: 5000,
    convertEol: false,
    // 搜索高亮装饰（SearchAddon decorations）依赖提案 API
    allowProposedApi: true,
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
  term.attachCustomKeyEventHandler((event) => {
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
 * 传连接名或 user@host，缺省显示「终端 N」）。
 */
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
    spawnSpec: spawnSpec ?? { t: 'spawn', cwd: currentCwd() },
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
 * 页面刷新后恢复标签：沿用持久化的 sid / spawnSpec / label，发 attach 重连
 * 宿主保活的会话（不再 spawnTab）；attach 失败会走 error 浮层（点击 respawn）。
 */
function restoreTab(saved) {
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

/** 按标签保存的 spawnSpec 发创建帧（sid/cols/rows 由本地补齐）。 */
function spawnTab(tab) {
  const dims = tab.fit !== null ? tab.fit.proposeDimensions() : undefined
  sendFrame({
    ...tab.spawnSpec,
    sid: tab.sid,
    cols: dims !== undefined ? dims.cols : 80,
    rows: dims !== undefined ? dims.rows : 24,
  })
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
  if (!tab.exited) sendFrame({ t: 'kill', sid })
  tabs.delete(sid)
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
    const next = [...tabs.keys()].pop() ?? null
    if (next !== null) switchTab(next)
  }
  renderTabbar()
  if (tabs.size === 0) closeModal()
  else persistTabs()
}

function switchTab(sid) {
  const tab = tabs.get(sid)
  if (tab === undefined) return
  activeSid = sid
  for (const [otherSid, other] of tabs) {
    if (other.termEl !== null) other.termEl.style.display = otherSid === sid ? '' : 'none'
  }
  if (bodyEl !== null && tab.termEl !== null && tab.termEl.parentElement !== bodyEl) {
    bodyEl.appendChild(tab.termEl)
  }
  renderTabbar()
  renderConnbar()
  try {
    tab.fit.fit()
  } catch {
    /* 忽略 */
  }
  if (tab.spawned && !tab.exited) {
    sendResize(tab)
  }
  showTabOverlay(tab, tab.exited ? '会话已退出 — 点击重新打开' : '')
}

function renderTabbar() {
  if (tabbarEl === null) return
  tabbarEl.textContent = ''
  for (const [sid, tab] of tabs) {
    const btn = document.createElement('button')
    btn.className = 'tt_tab'
    if (sid === activeSid) btn.dataset.active = ''
    // 标签标题：SSH 标签用 label（连接名 / target），本地标签用「终端 N」
    const labelEl = document.createElement('span')
    labelEl.textContent = tab.label || '终端 ' + tabCounterLabel(sid)
    // 双击重命名：行内 input，Enter/失焦提交（空还原），Esc 取消
    labelEl.addEventListener('dblclick', (event) => {
      event.stopPropagation()
      startTabRename(sid, btn)
    })
    const closeEl = document.createElement('span')
    closeEl.className = 'tt_tabClose'
    closeEl.title = '关闭'
    closeEl.textContent = '✕'
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
  const add = document.createElement('button')
  add.className = 'tt_tabAdd'
  add.title = '新建（本地 / SSH）'
  add.textContent = '+'
  add.addEventListener('click', () => {
    openAddMenu(add)
  })
  tabbarEl.appendChild(add)
}

/* ================================ 连接栏 ================================ */

/** 隧道规则展示（与设置卡片同语义的轻量副本，供连接栏弹层使用）。 */
function tunnelRuleText(t) {
  return t?.direction === 'remote'
    ? `远程:${t.remoteHost || '127.0.0.1'}:${String(t.remotePort ?? 0)} → 本机:${String(t.localTargetPort ?? 0)}`
    : `本机:${String(t?.localPort ?? 0)} → ${t?.remoteHost ?? '?'}:${String(t?.remotePort ?? 0)}`
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
  connTargetEl.textContent = (typeof tab.target === 'string' && tab.target !== ''
    ? tab.target
    : typeof spec.name === 'string' && spec.name !== ''
      ? spec.name
      : String(spec.username ?? '') + '@' + String(spec.host ?? '') + (Number.isInteger(port) && port !== 22 ? ':' + port : ''))
    + (tab.persistTmux === true ? ' · tmux 持久' : '')
  connDotEl.dataset.state = tab.exited ? 'exited' : tab.live === true ? 'connected' : tab.errored === true ? 'error' : 'connecting'
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
  if (tab.exited) {
    action(ICON_RECONNECT, '重新打开', '以原连接信息重开会话', () => respawnTab(tab.sid))
  }
  action(ICON_SFTP, 'SFTP', '打开该连接的文件浏览（SFTP）', () => openSftpBrowser(tab.spawnSpec))
  const bookName = typeof spec.name === 'string' ? spec.name : ''
  const tunnelCount = bookName !== '' ? tunnelCountFor(bookName) : 0
  if (tunnelCount > 0) {
    action(ICON_TUNNEL, '隧道 ' + tunnelCount, '查看该连接的端口转发隧道', (event) => {
      openTunnelPopover(event.currentTarget, bookName)
    })
  }
}

let tunnelPopoverEl = null
let tunnelPopoverDismiss = null

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
  title.textContent = '端口转发 — ' + bookName
  pop.appendChild(title)
  const listEl = document.createElement('div')
  listEl.textContent = '加载中…'
  pop.appendChild(listEl)
  const hint = document.createElement('span')
  hint.className = 'tt_cardHint'
  hint.textContent = '增删/启停在 设置 → 插件 → 终端面板 的端口转发区块维护'
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
    const mine = tunnelsCache.filter((t) => t?.bookName === bookName && t?.enabled !== false)
    if (mine.length === 0) {
      const empty = document.createElement('span')
      empty.className = 'tt_cardHint'
      empty.textContent = '该连接暂无启用的隧道'
      listEl.appendChild(empty)
      return
    }
    for (const t of mine) {
      const st = statusList.find((s) => s?.name === t?.name)
      const state = st?.state ?? 'stopped'
      const row = document.createElement('div')
      row.className = 'tt_tunnelPopRow'
      const dot = document.createElement('span')
      dot.className = 'tt_connDot'
      dot.dataset.state = state === 'active' ? 'connected' : state === 'error' ? 'error' : 'connecting'
      const text = document.createElement('span')
      text.className = 'tt_connTarget'
      text.title = String(st?.error ?? st?.lastForwardError ?? '')
      text.textContent = tunnelRuleText(t) + ' · ' + state
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
  const labelEl = tabBtn.querySelector('span:not(.tt_tabClose)')
  if (labelEl === null) return
  const input = document.createElement('input')
  input.className = 'tt_tabRename'
  input.value = tab.label || '终端 ' + tabCounterLabel(sid)
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
function syncSshHostsCache(config) {
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
  return tunnelsCache.filter((t) => t?.bookName === bookName && t?.enabled !== false).length
}

/** 连接簿条目的展示副标题：user@host[:port] · auth[ · fwd][ · tmux]。 */
function sshHostTargetLabel(entry) {
  const port = Number(entry?.port)
  const suffix = Number.isInteger(port) && port !== 22 ? ':' + port : ''
  const auth = entry?.auth === 'key' ? 'key' : entry?.auth === 'password' ? 'password' : 'agent'
  const fwd = entry?.agentForward === true ? ' · fwd' : ''
  const persist = entry?.persist === true ? ' · tmux' : ''
  return String(entry?.username ?? '') + '@' + String(entry?.host ?? '') + suffix + ' · ' + auth + fwd + persist
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
  const menu = document.createElement('div')
  menu.className = 'tt_addMenu'
  addMenuEl = menu
  renderAddMenuItems(menu)
  document.body.appendChild(menu)
  const rect = anchorBtn.getBoundingClientRect()
  menu.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - 340)) + 'px'
  menu.style.top = rect.bottom + 4 + 'px'
  document.addEventListener('mousedown', onDocAddMenuMouseDown, true)
}

function closeAddMenu() {
  if (addMenuEl === null) return
  document.removeEventListener('mousedown', onDocAddMenuMouseDown, true)
  addMenuEl.remove()
  addMenuEl = null
}

function addMenuItem(menu, label, sub, onClick) {
  const item = document.createElement('button')
  item.type = 'button'
  item.className = 'tt_addMenuItem'
  const main = document.createElement('span')
  main.textContent = label
  item.appendChild(main)
  if (sub !== '') {
    const subEl = document.createElement('span')
    subEl.className = 'tt_addMenuSub'
    subEl.textContent = sub
    item.appendChild(subEl)
  }
  item.addEventListener('click', onClick)
  menu.appendChild(item)
}

function renderAddMenuItems(menu) {
  menu.textContent = ''
  addMenuItem(menu, '本地终端', '在当前会话工作目录打开', () => {
    closeAddMenu()
    addTab()
  })
  if (persistenceCache === 'tmux') {
    addMenuItem(menu, '持久终端（tmux）', '宿主重启 / 断线超时后重开即恢复现场', () => {
      closeAddMenu()
      addTab({ t: 'spawn', cwd: currentCwd(), persist: true, persistName: newPersistName() }, '持久终端')
    })
  }
  const sep1 = document.createElement('div')
  sep1.className = 'tt_addMenuSep'
  menu.appendChild(sep1)
  const bookTitle = document.createElement('div')
  bookTitle.className = 'tt_addMenuTitle'
  bookTitle.textContent = 'SSH 连接簿'
  menu.appendChild(bookTitle)
  for (const entry of sshHostsCache) {
    if (entry === null || typeof entry !== 'object' || typeof entry.name !== 'string' || entry.name === '') continue
    // 条目行 = 连接项（点击连接）+ ✎ 编辑（打开对话框编辑模式）
    const rowEl = document.createElement('div')
    rowEl.className = 'tt_addMenuRow'
    const item = document.createElement('button')
    item.type = 'button'
    item.className = 'tt_addMenuItem'
    const main = document.createElement('span')
    main.textContent = entry.name
    const sub = document.createElement('span')
    sub.className = 'tt_addMenuSub'
    const tunnelCount = tunnelCountFor(entry.name)
    const persistMark = entry.persist === true ? ' · tmux' : ''
    sub.textContent = sshHostTargetLabel(entry) + persistMark + (tunnelCount > 0 ? ' · ⇄' + String(tunnelCount) : '')
    item.appendChild(main)
    item.appendChild(sub)
    item.addEventListener('click', () => {
      closeAddMenu()
      // 条目勾了「持久会话」且宿主开着持久化：随标签生成稳定 tmux 会话名
      const persistSpec = entry.persist === true && persistenceCache === 'tmux'
        ? { persist: true, persistName: newPersistName() }
        : {}
      addTab({ t: 'ssh', name: entry.name, ...persistSpec }, entry.name)
    })
    const browse = document.createElement('button')
    browse.type = 'button'
    browse.className = 'tt_addMenuEdit'
    browse.title = 'SFTP 文件浏览'
    browse.textContent = '📂'
    browse.addEventListener('click', () => {
      closeAddMenu()
      openSftpBrowser({ name: entry.name })
    })
    const edit = document.createElement('button')
    edit.type = 'button'
    edit.className = 'tt_addMenuEdit'
    edit.title = '编辑连接'
    edit.textContent = '✎'
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
    empty.textContent = '（空 — 在设置卡片或「SSH 连接…」里保存）'
    menu.appendChild(empty)
  }
  const sep2 = document.createElement('div')
  sep2.className = 'tt_addMenuSep'
  menu.appendChild(sep2)
  addMenuItem(menu, 'SSH 连接…', '手动填写主机 / 用户 / 认证方式', () => {
    closeAddMenu()
    openSshDialog()
  })
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
  title.textContent = isEdit ? '编辑连接 — ' + String(editing.name ?? '') : 'SSH 连接'
  card.appendChild(title)

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

  const grid = document.createElement('div')
  grid.className = 'tt_sshGrid'
  grid.appendChild(fieldRow('host', '主机', { placeholder: 'example.com 或 IP' }))
  grid.appendChild(fieldRow('port', '端口', { placeholder: '22' }))
  card.appendChild(grid)
  card.appendChild(fieldRow('username', '用户名', { placeholder: 'root' }))
  card.appendChild(fieldRow('auth', '认证方式', {
    select: [
      { value: 'agent', label: 'agent — 使用本机 ssh-agent' },
      { value: 'key', label: 'key — 私钥文件' },
      { value: 'password', label: 'password — 密码' },
    ],
  }))
  const keyRow = fieldRow('keyPath', '私钥路径', { placeholder: '~/.ssh/id_ed25519' })
  const passphraseRow = fieldRow('passphrase', '私钥口令（可空）', { type: 'password' })
  const passwordRow = fieldRow('password', '密码', { type: 'password' })

  /**
   * env:VAR 选择器：筛选框 + 限高滚动列表（数据源为 env 插件托管的变量名，
   * 宿主 /api/dsh-tty/env-vars 只回名字）。点击项填入 env:NAME——目标为空或
   * 已是 env: 引用时直接替换；有手输内容时首击只进确认态（4s 复位），再击
   * 才覆盖（密码框是掩码显示，不该被一次误点静默清空）；列表空时给
   * 「去 env 插件托管」的提示。
   */
  const envSelectRow = (targetInput) => {
    const row = document.createElement('div')
    row.className = 'tt_sshRow'
    const filter = document.createElement('input')
    filter.type = 'text'
    filter.className = 'tt_cardInput'
    filter.placeholder = '筛选 env 托管变量后点击填入'
    filter.autocomplete = 'off'
    filter.spellcheck = false
    const list = document.createElement('div')
    list.className = 'tt_envList'
    let names = []
    const renderList = () => {
      list.textContent = ''
      if (names.length === 0) {
        const hint = document.createElement('span')
        hint.className = 'tt_cardHint'
        hint.textContent = 'env 插件还没有托管变量 — 在其设置卡片添加后这里可选，也可手输 env:NAME'
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
        item.addEventListener('click', () => {
          const current = targetInput.value
          if (current === '' || current.startsWith('env:') || confirmTimer !== null) {
            disarm()
            targetInput.value = ref
            targetInput.focus()
            return
          }
          item.textContent = name + '（再点覆盖已填）'
          item.dataset.danger = ''
          confirmTimer = setTimeout(disarm, 4000)
        })
        list.appendChild(item)
      }
      if (hit.length > 30) {
        const more = document.createElement('span')
        more.className = 'tt_envMore'
        more.textContent = '还有 ' + (hit.length - 30) + ' 个 — 继续输入筛选'
        list.appendChild(more)
      } else if (hit.length === 0) {
        const none = document.createElement('span')
        none.className = 'tt_envMore'
        none.textContent = '没有匹配的变量'
        list.appendChild(none)
      }
    }
    filter.addEventListener('input', renderList)
    row.appendChild(filter)
    row.appendChild(list)
    return {
      row,
      setNames(next) {
        names = Array.isArray(next) ? next : []
        renderList()
      },
    }
  }
  const passphraseEnv = envSelectRow(fields.passphrase)
  const passwordEnv = envSelectRow(fields.password)
  let envNamesLoaded = false
  const loadEnvNames = async () => {
    if (envNamesLoaded) return
    envNamesLoaded = true
    try {
      const res = await fetch('/api/dsh-tty/env-vars', { cache: 'no-store' })
      const data = await res.json()
      if (data.ok && Array.isArray(data.names)) {
        passphraseEnv.setNames(data.names)
        passwordEnv.setNames(data.names)
      }
    } catch {
      /* 网络失败：列表保持空态提示 */
    }
  }
  void loadEnvNames()

  card.appendChild(keyRow)
  card.appendChild(passphraseRow)
  card.appendChild(passphraseEnv.row)
  card.appendChild(passwordRow)
  card.appendChild(passwordEnv.row)

  const fwdRow = document.createElement('label')
  fwdRow.className = 'tt_cardRow'
  const fwdCheck = document.createElement('input')
  fwdCheck.type = 'checkbox'
  fwdCheck.className = 'tt_cardCheckbox'
  const fwdLabel = document.createElement('span')
  fwdLabel.className = 'tt_cardLabel'
  fwdLabel.textContent = 'agent forwarding（远程可用本地 ssh-agent 钥匙，如远程 git clone）'
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
  persistLabel.textContent = '持久会话（tmux 托管，断线/重启后恢复现场；远程需安装 tmux）'
  persistRow.appendChild(persistCheck)
  persistRow.appendChild(persistLabel)
  if (persistenceCache === 'tmux') card.appendChild(persistRow)

  const saveRow = document.createElement('label')
  saveRow.className = 'tt_cardRow'
  const saveCheck = document.createElement('input')
  saveCheck.type = 'checkbox'
  saveCheck.className = 'tt_cardCheckbox'
  const saveLabel = document.createElement('span')
  saveLabel.className = 'tt_cardLabel'
  saveLabel.textContent = '保存到连接簿（同名覆盖）'
  saveRow.appendChild(saveCheck)
  saveRow.appendChild(saveLabel)
  card.appendChild(saveRow)
  const nameRow = fieldRow('name', '连接簿名称', { placeholder: '留空则用主机名' })
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
    fwdCheck.checked = editing.agentForward === true
    persistCheck.checked = editing.persist === true
  }

  const errorEl = document.createElement('div')
  errorEl.className = 'tt_sshError'
  card.appendChild(errorEl)

  const actions = document.createElement('div')
  actions.className = 'tt_sshActions'
  const cancelBtn = document.createElement('button')
  cancelBtn.type = 'button'
  cancelBtn.className = 'tt_toolBtn'
  cancelBtn.textContent = '取消'
  const connectBtn = document.createElement('button')
  connectBtn.type = 'button'
  connectBtn.className = 'tt_cardSave'
  connectBtn.textContent = '连接'
  actions.appendChild(cancelBtn)
  const sftpBtn = document.createElement('button')
  sftpBtn.type = 'button'
  sftpBtn.className = 'tt_toolBtn'
  sftpBtn.textContent = '文件浏览'
  sftpBtn.title = '不动终端，直接以当前填写的信息打开 SFTP 文件浏览'
  sftpBtn.addEventListener('click', () => {
    errorEl.textContent = ''
    const host = fields.host.value.trim()
    const username = fields.username.value.trim()
    let port = Number(fields.port.value)
    if (!Number.isInteger(port) || port < 1 || port > 65535) port = 22
    if (host === '' || username === '') {
      errorEl.textContent = '主机与用户名必填'
      return
    }
    const auth = fields.auth.value
    const spec = { host, port, username, auth }
    if (auth === 'key') {
      const keyPath = fields.keyPath.value.trim()
      if (keyPath === '') {
        errorEl.textContent = 'auth=key 需要私钥路径'
        return
      }
      spec.keyPath = keyPath
      const passphrase = fields.passphrase.value
      if (passphrase !== '') spec.passphrase = passphrase
    }
    if (auth === 'password') {
      const password = fields.password.value
      if (password === '') {
        errorEl.textContent = 'auth=password 需要密码'
        return
      }
      spec.password = password
    }
    if (fwdCheck.checked) spec.agentForward = true
    closeSshDialog()
    openSftpBrowser(spec)
  })
  actions.appendChild(sftpBtn)
  let saveEditBtn = null
  if (isEdit) {
    saveEditBtn = document.createElement('button')
    saveEditBtn.type = 'button'
    saveEditBtn.className = 'tt_toolBtn'
    saveEditBtn.textContent = '保存修改'
    saveEditBtn.addEventListener('click', () => {
      errorEl.textContent = ''
      const host = fields.host.value.trim()
      const username = fields.username.value.trim()
      if (host === '' || username === '') {
        errorEl.textContent = '主机与用户名必填'
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
      if (auth === 'key' && next.keyPath === '') {
        errorEl.textContent = 'auth=key 需要私钥路径'
        return
      }
      if (saveEditBtn !== null) saveEditBtn.disabled = true
      void saveSshHostUpdate(String(editing.name ?? ''), next).then((error) => {
        if (saveEditBtn !== null) saveEditBtn.disabled = false
        if (error !== undefined) {
          errorEl.textContent = '保存失败：' + error
          return
        }
        closeSshDialog()
      })
    })
    actions.appendChild(saveEditBtn)
  }
  actions.appendChild(connectBtn)
  card.appendChild(actions)

  const syncAuthRows = () => {
    keyRow.style.display = fields.auth.value === 'key' ? '' : 'none'
    passphraseRow.style.display = fields.auth.value === 'key' ? '' : 'none'
    passphraseEnv.row.style.display = fields.auth.value === 'key' ? '' : 'none'
    passwordRow.style.display = fields.auth.value === 'password' ? '' : 'none'
    passwordEnv.row.style.display = fields.auth.value === 'password' ? '' : 'none'
  }
  fields.auth.addEventListener('change', syncAuthRows)
  syncAuthRows()

  cancelBtn.addEventListener('click', () => closeSshDialog())
  backdrop.addEventListener('mousedown', (event) => {
    if (event.target === backdrop) closeSshDialog()
  })

  connectBtn.addEventListener('click', () => {
    errorEl.textContent = ''
    const host = fields.host.value.trim()
    const username = fields.username.value.trim()
    let port = Number(fields.port.value)
    if (!Number.isInteger(port) || port < 1 || port > 65535) port = 22
    if (host === '' || username === '') {
      errorEl.textContent = '主机与用户名必填'
      return
    }
    const auth = fields.auth.value
    const spec = { t: 'ssh', host, port, username, auth }
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
      proceed('')
      return
    }
    const bookName = fields.name.value.trim() || host
    connectBtn.disabled = true
    void saveSshHostEntry({
      name: bookName,
      host,
      port,
      username,
      auth,
      keyPath: spec.keyPath ?? '',
      passphrase: spec.passphrase ?? '',
      password: spec.password ?? '',
      agentForward: fwdCheck.checked,
      persist: persistCheck.checked,
    }).then((error) => {
      connectBtn.disabled = false
      if (error !== undefined) {
        errorEl.textContent = '保存连接簿失败：' + error
        return
      }
      proceed(bookName)
    })
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
    return '连接簿里已有同名条目: ' + entry.name
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
function openSftpDual(spec, label) {
  if (sftpDialogEl !== null) return

  const backdrop = document.createElement('div')
  backdrop.className = 'tt_sshBackdrop'
  const card = document.createElement('div')
  card.className = 'tt_sftpDualCard'

  // 标题行：标题 + 右上角 ✕ 关闭
  const titleRow = document.createElement('div')
  titleRow.className = 'tt_sftpTitleRow'
  const title = document.createElement('div')
  title.className = 'tt_sshTitle'
  title.textContent = 'SFTP 双栏 — ' + label
  const titleClose = document.createElement('button')
  titleClose.type = 'button'
  titleClose.className = 'tt_close'
  titleClose.title = '关闭'
  titleClose.textContent = '✕'
  titleClose.addEventListener('click', closeSftpDialog)
  titleRow.appendChild(title)
  titleRow.appendChild(titleClose)
  card.appendChild(titleRow)

  const status = document.createElement('div')
  status.className = 'tt_sftpStatus'
  const setStatus = (text, kind) => {
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
    setStatus(busyText, 'busy')
    Promise.resolve()
      .then(task)
      .catch((error) => setStatus(String(error && error.message ? error.message : error), 'error'))
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
    head.textContent = titleText
    wrap.appendChild(head)

    const bar = document.createElement('div')
    bar.className = 'tt_sftpBar'
    const pathInput = document.createElement('input')
    pathInput.type = 'text'
    pathInput.className = 'tt_sftpPath'
    pathInput.placeholder = kind === 'local' ? '本机路径（回车跳转）' : '远程路径（回车跳转）'
    pathInput.spellcheck = false
    pathInput.autocomplete = 'off'
    const refreshBtn = document.createElement('button')
    refreshBtn.type = 'button'
    refreshBtn.className = 'tt_toolBtn'
    refreshBtn.textContent = '刷新'
    const mkdirBtn = document.createElement('button')
    mkdirBtn.type = 'button'
    mkdirBtn.className = 'tt_toolBtn'
    mkdirBtn.textContent = '新建目录'
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
      setStatus(busyText, 'busy')
      return Promise.resolve()
        .then(task)
        .catch((error) => setStatus(String(error && error.message ? error.message : error), 'error'))
        .finally(() => setBusy(false))
    }

    const joinChild = (dir, name) => (dir.endsWith('/') || dir.endsWith('\\') ? dir + name : dir + '/' + name)

    const rowOf = (entry) => {
      const full = joinChild(pane.path, entry.name)
      const metaParts = []
      if (entry.isDir === true) metaParts.push('目录')
      else metaParts.push(formatBytes(Number(entry.size)) || '—')
      const mtime = formatMtime(Number(entry.mtime))
      if (mtime !== '') metaParts.push(mtime)
      const row = listRow(entry.isDir ? '📁' : entry.isSymlink ? '↗' : '📄', entry.name, metaParts.join(' · '))
      const reload = () => pane.loadDir(pane.path)
      const other = kind === 'local' ? panes.remote : panes.local
      if (entry.isDir === true) {
        row.addEventListener('click', (event) => {
          if (event.target instanceof Element && event.target.closest('.tt_sftpAct') !== null) return
          void pane.loadDir(full)
        })
      }
      // 直传：⇨ 本机→远程 / ⇦ 远程→本机（对面栏当前目录下；目录递归、同名覆盖）
      appendAct(row, kind === 'local' ? '⇨' : '⇦', '传输到' + (kind === 'local' ? '远程' : '本机') + '：' + other.path, () => {
        runJoint('传输 ' + entry.name + '…', async () => {
          const res = await fetch('/api/dsh-tty/local-fs/transfer', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              direction: kind === 'local' ? 'up' : 'down',
              ...spec,
              localPath: kind === 'local' ? full : joinChild(other.path, entry.name),
              remotePath: kind === 'local' ? joinChild(other.path, entry.name) : full,
            }),
          })
          const data = await res.json().catch(() => ({}))
          if (!res.ok || data.ok !== true) throw new Error(String(data.error || 'HTTP ' + res.status))
          setStatus('已传输 ' + entry.name)
          await other.loadDir(other.path)
        })
      })
      if (kind !== 'local' && entry.isDir !== true) {
        // 远程文件保留浏览器下载（⬇）
        appendAct(row, '⬇', '下载 ' + entry.name, () => void downloadRemoteEntry(entry, full))
      }
      appendAct(row, '✎', '重命名 ' + entry.name, () => {
        editorInput.placeholder = '新名称'
        editorInput.value = entry.name
        showEditor(kind)
        editorCommit = async () => {
          const value = editorInput.value.trim()
          if (value === '' || value === entry.name) return
          closeEditor()
          await pane.runTask('重命名 ' + entry.name + '…', async () => {
            await api('rename', { from: full, to: joinChild(pane.path, value) })
            await reload()
          })
        }
      })
      appendDelete(row, () => pane.runTask('删除 ' + entry.name + '…', async () => {
        await api('remove', { path: full, recursive: entry.isDir === true })
        await reload()
        setStatus('已删除 ' + entry.name)
      }), entry)
      return row
    }

    const renderRows = (entries) => {
      list.textContent = ''
      if (pane.path !== '' && pane.path !== '/' && /^[A-Za-z]:[\\/]?$/.test(pane.path) === false) {
        const up = listRow('📁', '..（上级目录）', '')
        up.addEventListener('click', () => {
          void pane.loadDir(parentRemotePath(pane.path))
        })
        list.appendChild(up)
      }
      const rows = Array.isArray(entries) ? entries : []
      if (rows.length === 0) {
        const empty = document.createElement('div')
        empty.className = 'tt_addMenuTitle'
        empty.textContent = '（空目录）'
        list.appendChild(empty)
        return
      }
      for (const entry of rows) {
        if (entry === null || typeof entry !== 'object' || typeof entry.name !== 'string' || entry.name === '') continue
        list.appendChild(rowOf(entry))
      }
    }

    pane.loadDir = async (pathArg) => {
      try {
        const data = await api('list', { path: pathArg ?? pane.path })
        pane.path = typeof data.path === 'string' && data.path !== '' ? data.path : pane.path
        pathInput.value = pane.path
        const count = Array.isArray(data.entries) ? data.entries.length : 0
        renderRows(data.entries)
        setStatus(pane.path + ' — ' + String(count) + ' 项')
      } catch (error) {
        setStatus(String(error && error.message ? error.message : error), 'error')
      }
    }
    pane.runTask = runTask
    pane.setBusy = setBusy
    panes[kind] = pane

    refreshBtn.addEventListener('click', () => {
      void pane.runTask('加载中…', () => pane.loadDir(pane.path))
    })
    mkdirBtn.addEventListener('click', () => {
      if (pane.busy || jointBusy) return
      editorInput.placeholder = '新目录名（相对当前目录）'
      editorInput.value = ''
      showEditor(kind)
      editorCommit = async () => {
        const value = editorInput.value.trim()
        if (value === '') return
        closeEditor()
        await pane.runTask('创建目录 ' + value + '…', async () => {
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
      void pane.runTask('加载中…', () => pane.loadDir(target))
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
  editorOk.textContent = '确定'
  const editorCancel = document.createElement('button')
  editorCancel.type = 'button'
  editorCancel.className = 'tt_toolBtn'
  editorCancel.textContent = '取消'
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

  const listRow = (icon, name, meta) => {
    const row = document.createElement('button')
    row.type = 'button'
    row.className = 'tt_sftpRow'
    const iconEl = document.createElement('span')
    iconEl.className = 'tt_sftpIcon'
    iconEl.textContent = icon
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
    act.textContent = glyph
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
    act.textContent = '🗑'
    act.title = '删除 ' + entry.name + (entry.isDir ? '（含内容）' : '')
    let confirmTimer = null
    act.addEventListener('click', (event) => {
      event.stopPropagation()
      if (confirmTimer !== null) {
        clearTimeout(confirmTimer)
        confirmTimer = null
        act.textContent = '🗑'
        delete act.dataset.danger
        onConfirm()
        return
      }
      act.textContent = '确认?'
      act.dataset.danger = ''
      confirmTimer = setTimeout(() => {
        confirmTimer = null
        act.textContent = '🗑'
        delete act.dataset.danger
      }, 4000)
    })
    row.appendChild(act)
  }

  /** 远程文件浏览器下载（双栏里保留；整传用 ⇦ 走服务端直传）。 */
  const downloadRemoteEntry = (entry, full) => panes.remote.runTask('下载 ' + entry.name + '…', async () => {
    const res = await fetch('/api/dsh-tty/sftp/download', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...spec, path: full }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(String(data.error || 'HTTP ' + res.status))
    }
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = entry.name
    anchor.click()
    setTimeout(() => URL.revokeObjectURL(url), 30_000)
    setStatus('已下载 ' + entry.name + '（' + (formatBytes(blob.size) || String(blob.size) + ' B') + '）')
  })

  const localWrap = buildPane('local', '本机')
  const remoteWrap = buildPane('remote', '远程')
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
  foot.appendChild(status)
  card.appendChild(foot)

  backdrop.addEventListener('mousedown', (event) => {
    if (event.target === backdrop) closeSftpDialog()
  })

  backdrop.appendChild(card)
  document.body.appendChild(backdrop)
  sftpDialogEl = backdrop
  void panes.local.loadDir('')
  void panes.remote.loadDir('')
}

/* ============================ SFTP 文件浏览 ============================ */

let sftpDialogEl = null

/** UTF-8 安全的 base64url（upload 的 x-dsh-sftp-meta 头用；服务端 Buffer base64url 解）。 */
function b64uEncode(text) {
  const bytes = new TextEncoder().encode(text)
  let bin = ''
  for (const byte of bytes) bin += String.fromCharCode(byte)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function formatBytes(n) {
  if (!Number.isFinite(n) || n <= 0) return ''
  if (n < 1024) return String(n) + ' B'
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = n
  let index = -1
  do {
    value /= 1024
    index += 1
  } while (value >= 1024 && index < units.length - 1)
  return (value >= 100 ? value.toFixed(0) : value.toFixed(1)) + ' ' + units[index]
}

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

function joinRemotePath(dir, name) {
  return dir.endsWith('/') ? dir + name : dir + '/' + name
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
  const walkEntry = (entry, prefix) => new Promise((resolve) => {
    if (entry.isFile === true) {
      entry.file(
        (file) => {
          out.push({ relPath: prefix + entry.name, file })
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
        for (const child of batch) await walkEntry(child, prefix + entry.name + '/')
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
 */
function openSftpBrowser(specInput) {
  if (sftpDialogEl !== null) return
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
    openSftpDual(spec, label)
    return
  }

  const backdrop = document.createElement('div')
  backdrop.className = 'tt_sshBackdrop'
  const card = document.createElement('div')
  card.className = 'tt_sftpCard'

  // 标题行：标题 + 右上角 ✕ 关闭
  const titleRow = document.createElement('div')
  titleRow.className = 'tt_sftpTitleRow'
  const title = document.createElement('div')
  title.className = 'tt_sshTitle'
  title.textContent = 'SFTP — ' + label
  const titleClose = document.createElement('button')
  titleClose.type = 'button'
  titleClose.className = 'tt_close'
  titleClose.title = '关闭'
  titleClose.textContent = '✕'
  titleClose.addEventListener('click', closeSftpDialog)
  titleRow.appendChild(title)
  titleRow.appendChild(titleClose)
  card.appendChild(titleRow)

  /* 工具栏：路径输入（回车跳转）+ 刷新 / 新建目录 / 上传（隐藏 file input） */
  const bar = document.createElement('div')
  bar.className = 'tt_sftpBar'
  const pathInput = document.createElement('input')
  pathInput.type = 'text'
  pathInput.className = 'tt_sftpPath'
  pathInput.placeholder = '远程路径（回车跳转）'
  pathInput.spellcheck = false
  pathInput.autocomplete = 'off'
  const refreshBtn = document.createElement('button')
  refreshBtn.type = 'button'
  refreshBtn.className = 'tt_toolBtn'
  refreshBtn.textContent = '刷新'
  const mkdirBtn = document.createElement('button')
  mkdirBtn.type = 'button'
  mkdirBtn.className = 'tt_toolBtn'
  mkdirBtn.textContent = '新建目录'
  const uploadBtn = document.createElement('button')
  uploadBtn.type = 'button'
  uploadBtn.className = 'tt_toolBtn'
  uploadBtn.textContent = '上传'
  uploadBtn.title = '选择文件上传；也可以把文件 / 文件夹直接拖进列表'
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
  editorOk.textContent = '确定'
  const editorCancel = document.createElement('button')
  editorCancel.type = 'button'
  editorCancel.className = 'tt_toolBtn'
  editorCancel.textContent = '取消'
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
  foot.appendChild(status)
  card.appendChild(foot)

  const state = { path: '', busy: false }
  const setStatus = (text, kind) => {
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
    setStatus(busyText, 'busy')
    try {
      await task()
    } catch (error) {
      setStatus(String(error && error.message ? error.message : error), 'error')
    } finally {
      setBusy(false)
    }
  }

  const listRow = (icon, name, meta) => {
    const row = document.createElement('button')
    row.type = 'button'
    row.className = 'tt_sftpRow'
    const iconEl = document.createElement('span')
    iconEl.className = 'tt_sftpIcon'
    iconEl.textContent = icon
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
    act.textContent = glyph
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
    act.textContent = '🗑'
    act.title = '删除 ' + entry.name + (entry.isDir ? '（含内容）' : '')
    let confirmTimer = null
    act.addEventListener('click', (event) => {
      event.stopPropagation()
      if (state.busy) return
      if (confirmTimer !== null) {
        clearTimeout(confirmTimer)
        confirmTimer = null
        act.textContent = '🗑'
        delete act.dataset.danger
        void runTask('删除 ' + entry.name + '…', async () => {
          await api('remove', { path: full, recursive: entry.isDir === true })
          await loadDir(state.path)
          setStatus('已删除 ' + entry.name)
        })
        return
      }
      act.textContent = '确认?'
      act.dataset.danger = ''
      confirmTimer = setTimeout(() => {
        confirmTimer = null
        act.textContent = '🗑'
        delete act.dataset.danger
      }, 4000)
    })
    row.appendChild(act)
  }

  const renderRows = (entries) => {
    list.textContent = ''
    if (state.path !== '' && state.path !== '/') {
      const up = listRow('📁', '..（上级目录）', '')
      up.addEventListener('click', () => {
        void runTask('加载中…', () => loadDir(parentRemotePath(state.path)))
      })
      list.appendChild(up)
    }
    const rows = Array.isArray(entries) ? entries : []
    if (rows.length === 0) {
      const empty = document.createElement('div')
      empty.className = 'tt_addMenuTitle'
      empty.textContent = '（空目录）'
      list.appendChild(empty)
      return
    }
    for (const entry of rows) {
      if (entry === null || typeof entry !== 'object' || typeof entry.name !== 'string' || entry.name === '') continue
      const full = joinRemotePath(state.path, entry.name)
      const metaParts = []
      if (entry.isDir === true) metaParts.push('目录')
      else metaParts.push(formatBytes(Number(entry.size)) || '—')
      const mtime = formatMtime(Number(entry.mtime))
      if (mtime !== '') metaParts.push(mtime)
      const row = listRow(entry.isDir ? '📁' : entry.isSymlink ? '↗' : '📄', entry.name, metaParts.join(' · '))
      if (entry.isDir === true) {
        row.addEventListener('click', (event) => {
          if (event.target instanceof Element && event.target.closest('.tt_sftpAct') !== null) return
          void runTask('加载中…', () => loadDir(full))
        })
      } else {
        // 文件单击即下载；行内按钮经 stopPropagation 不会二次触发
        row.addEventListener('click', (event) => {
          if (event.target instanceof Element && event.target.closest('.tt_sftpAct') !== null) return
          void downloadEntry(entry, full)
        })
        appendAct(row, '⬇', '下载 ' + entry.name, () => void downloadEntry(entry, full))
      }
      appendAct(row, '✎', '重命名 ' + entry.name, () => {
        editorInput.placeholder = '新名称'
        editorInput.value = entry.name
        editor.style.display = ''
        editorInput.focus()
        editorInput.select()
        editorCommit = async () => {
          const value = editorInput.value.trim()
          if (value === '' || value === entry.name) return
          closeEditor()
          await runTask('重命名 ' + entry.name + '…', async () => {
            await api('rename', { from: full, to: joinRemotePath(state.path, value) })
            await loadDir(state.path)
          })
        }
      })
      appendDelete(row, entry, full)
      list.appendChild(row)
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
      setStatus(state.path + ' — ' + String(count) + ' 项')
    } catch (error) {
      setStatus(String(error && error.message ? error.message : error), 'error')
    }
  }

  const downloadEntry = (entry, full) => runTask('下载 ' + entry.name + '…', async () => {
    const res = await fetch('/api/dsh-tty/sftp/download', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...spec, path: full }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(String(data.error || 'HTTP ' + res.status))
    }
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = entry.name
    anchor.click()
    setTimeout(() => URL.revokeObjectURL(url), 30_000)
    setStatus('已下载 ' + entry.name + '（' + (formatBytes(blob.size) || String(blob.size) + ' B') + '）')
  })

  const uploadOne = (file, relPath, index, total) => new Promise((resolve, reject) => {
    const meta = b64uEncode(JSON.stringify({ ...spec, path: joinRemotePath(state.path, relPath) }))
    const xhr = new XMLHttpRequest()
    xhr.open('POST', '/api/dsh-tty/sftp/upload')
    xhr.setRequestHeader('x-dsh-sftp-meta', meta)
    const label = total > 1 ? String(index) + '/' + String(total) + ' ' : ''
    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) {
        setStatus('上传 ' + label + relPath + ' ' + String(Math.round((event.loaded / event.total) * 100)) + '%', 'busy')
      }
    })
    xhr.addEventListener('load', () => {
      if (xhr.status === 200) {
        resolve()
        return
      }
      let message = 'HTTP ' + xhr.status
      try {
        const data = JSON.parse(xhr.responseText)
        if (data !== null && typeof data === 'object' && typeof data.error === 'string') message = data.error
      } catch {
        /* 保底 HTTP 状态码 */
      }
      reject(new Error(message))
    })
    xhr.addEventListener('error', () => reject(new Error('网络错误')))
    xhr.send(file)
  })

  /**
   * 上传一批条目（选择器或拖入，relPath 保留文件夹层级）：文件夹拖入时先
   * 按 relPath 补齐远程父目录（mkdir parents，已存在的失败忽略——真正的
   * 失败由随后那一个文件的上传请求带出），再逐个流式上传。
   */
  const uploadFiles = async (items) => runTask('上传中…', async () => {
    const dirs = new Set()
    for (const item of items) {
      const cut = item.relPath.lastIndexOf('/')
      if (cut <= 0) continue
      const dir = item.relPath.slice(0, cut)
      if (dirs.has(dir)) continue
      dirs.add(dir)
      await api('mkdir', { path: joinRemotePath(state.path, dir), parents: true }).catch(() => {})
    }
    let index = 0
    for (const item of items) {
      index += 1
      await uploadOne(item.file, item.relPath, index, items.length)
    }
    setStatus('上传完成 ' + String(items.length) + ' 个文件')
    await loadDir(state.path)
  })

  refreshBtn.addEventListener('click', () => {
    void runTask('加载中…', () => loadDir(state.path))
  })
  mkdirBtn.addEventListener('click', () => {
    if (state.busy) return
    editorInput.placeholder = '新目录名（相对当前目录）'
    editorInput.value = ''
    editor.style.display = ''
    editorInput.focus()
    editorCommit = async () => {
      const value = editorInput.value.trim()
      if (value === '') return
      closeEditor()
      await runTask('创建目录 ' + value + '…', async () => {
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
      if (items.length > 0) void uploadFiles(items)
    })
  })
  pathInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return
    event.preventDefault()
    if (state.busy) return
    const target = pathInput.value.trim()
    if (target === '') return
    void runTask('加载中…', () => loadDir(target))
  })
  backdrop.addEventListener('mousedown', (event) => {
    if (event.target === backdrop) closeSftpDialog()
  })

  backdrop.appendChild(card)
  document.body.appendChild(backdrop)
  sftpDialogEl = backdrop
  void runTask('连接中…', () => loadDir(''))
}

function closeSftpDialog() {
  if (sftpDialogEl === null) return
  sftpDialogEl.remove()
  sftpDialogEl = null
}

function toggleSearch() {
  if (searchInputEl === null) return
  const hidden = searchInputEl.style.display === 'none' || searchInputEl.style.display === ''
  searchInputEl.style.display = hidden ? '' : 'none'
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
  if (intentionalClose || modalEl === null || reconnectTimer !== null) return
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
 * 连接建立后的恢复流程：
 *   - 面板内还有未退出标签（同页断线重连）→ 逐个 attach 回场；宿主已重启
 *     （sid 消失）的持久标签按原 persistName 重新 spawn，tmux -A 接回原现场；
 *   - 空面板但有 sessionStorage 持久化（页面刷新后重开）→ 查询宿主仍保活
 *     的会话，能 attach 的恢复标签；持久标签即使宿主重启也重新 spawn 接回
 *     （非持久标签维持旧行为丢弃）；都没有则新建首个标签。
 */
async function afterSocketOpen() {
  const restored = loadPersistedTabs()
  if (tabs.size === 0) {
    if (restored.length > 0) {
      sendFrame({ t: 'sessions' })
      const frame = await waitFrame('sessions', 4000)
      const alive = new Map()
      if (frame !== null && Array.isArray(frame.list)) {
        for (const entry of frame.list) {
          if (entry !== null && typeof entry === 'object' && entry.attachable === true) alive.set(entry.sid, entry)
        }
      }
      for (const saved of restored) {
        if (alive.has(saved.sid)) {
          restoreTab(saved)
        } else if (isPersistentSpec(saved.spawnSpec)) {
          restoreTabAsNew(saved)
        }
        // 非持久且宿主侧已结束：维持旧行为丢弃
      }
      persistTabs()
    }
    if (tabs.size === 0) addTab()
    return
  }
  // 同页断线重连：宿主重启过的持久标签 sid 已失效，先查 sessions 分流
  const liveTabs = [...tabs.values()].filter((tab) => !tab.exited)
  const persistTabsDead = liveTabs.filter((tab) => isPersistentSpec(tab.spawnSpec))
  let deadPersistSids = null
  if (persistTabsDead.length > 0) {
    sendFrame({ t: 'sessions' })
    const frame = await waitFrame('sessions', 4000)
    const aliveSids = new Set((frame !== null && Array.isArray(frame.list) ? frame.list : []).map((entry) => entry?.sid).filter((sid) => typeof sid === 'string'))
    deadPersistSids = persistTabsDead.filter((tab) => !aliveSids.has(tab.sid))
    for (const tab of deadPersistSids) {
      respawnTab(tab.sid) // 换新 sid 重发 spawnSpec（含原 persistName）→ 宿主 tmux -A 接回
    }
  }
  const respawned = deadPersistSids !== null ? new Set(deadPersistSids.map((tab) => tab.sid)) : new Set()
  for (const tab of liveTabs) {
    if (respawned.has(tab.sid)) continue
    sendFrame({ t: 'attach', sid: tab.sid })
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
  setStatus('连接中…', '')
  try {
    socket = new WebSocket(wsUrl())
  } catch (error) {
    connecting = false
    setStatus('连接失败：' + error.message, 'error')
    scheduleReconnect()
    return
  }

  socket.onopen = () => {
    connecting = false
    reconnectDelay = 1000
    setStatus('已连接', 'connected')
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
      setStatus(msg.kind === 'ssh' ? 'SSH ' + (target !== '' ? target + ' ' : '') + '已连接' : '已连接 pid=' + msg.pid, 'connected')
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
        showTabOverlay(tab, '')
        sendResize(tab) // spawn/attach 就绪后补一次精确尺寸
        syncEntryBadge() // 断线重连后徽标计数恢复
        persistTabs()
      }
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
        const code = msg.code !== null && msg.code !== undefined ? 'code=' + msg.code : ''
        const signal = msg.signal !== null && msg.signal !== undefined ? 'signal=' + msg.signal : ''
        setStatus('已退出 ' + [code, signal].filter(Boolean).join(' '), '')
        renderConnbar()
        showTabOverlay(tab, '会话已退出 — 点击重新打开')
        syncEntryBadge() // 最小化时徽标计数同步减少
        persistTabs() // 已退出的标签不再持久化
      }
    } else if (msg.t === 'error') {
      setStatus('错误：' + String(msg.m ?? ''), 'error')
      if (typeof sid === 'string') {
        const tab = tabs.get(sid)
        if (tab !== undefined) {
          if (!tab.live) tab.errored = true // spawn/attach 失败：连接栏状态点转错误色
          renderConnbar()
          showTabOverlay(tab, '错误：' + String(msg.m ?? '') + ' — 点击重试')
        }
      } else {
        showBodyOverlay('点击重试')
      }
    }
  }
  socket.onclose = () => {
    connecting = false
    if (intentionalClose) return
    setStatus('连接断开 — 自动重连中', 'error')
    // 不再把未退出标签标记为 exited：会话在宿主保活，重连后 attach 恢复
    for (const tab of tabs.values()) {
      if (!tab.exited) showTabOverlay(tab, '连接断开 — 自动重连中…')
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
    '<div class="tt_status"><span class="tt_statusDot"></span><span class="tt_statusText">初始化…</span></div>' +
    '<input class="tt_searchInput" style="display:none" placeholder="搜索 (Enter 下一个, Shift+Enter 上一个)" />' +
    '<button class="tt_toolBtn tt_iconBtn" data-act="search" title="搜索 (Ctrl+F)">' + ICON_SEARCH + '</button>' +
    '<button class="tt_toolBtn tt_iconBtn" data-act="clear" title="清屏">' + ICON_CLEAR + '</button>' +
    '<button class="tt_toolBtn tt_iconBtn" data-act="copy" title="复制选中内容">' + ICON_COPY + '</button>' +
    '<button class="tt_toolBtn tt_iconBtn" data-act="paste" title="粘贴">' + ICON_PASTE + '</button>' +
    '<button class="tt_min" title="最小化到悬浮条（会话保持运行）">—</button>' +
    '<button class="tt_close" title="关闭终端（结束所有会话）">✕</button>' +
    '</div>' +
    // 连接栏：左侧连接状态，右侧 SFTP / 扩展按钮；本地终端时隐藏（renderConnbar 控制）
    '<div class="tt_connbar" data-hidden><div class="tt_connArea"><span class="tt_connDot"></span><span class="tt_connTarget">—</span></div><div class="tt_connActions"></div></div>' +
    '<div class="tt_body"><div class="tt_overlay"></div></div>' +
    '</div>'
  document.body.appendChild(modalEl)

  statusChipEl = modalEl.querySelector('.tt_status')
  statusEl = modalEl.querySelector('.tt_statusText')
  statusDotEl = modalEl.querySelector('.tt_statusDot')
  tabbarEl = modalEl.querySelector('.tt_tabs')
  connbarEl = modalEl.querySelector('.tt_connbar')
  connDotEl = modalEl.querySelector('.tt_connDot')
  connTargetEl = modalEl.querySelector('.tt_connTarget')
  connActionsEl = modalEl.querySelector('.tt_connActions')
  bodyEl = modalEl.querySelector('.tt_body')
  bodyOverlayEl = modalEl.querySelector('.tt_body > .tt_overlay')
  searchInputEl = modalEl.querySelector('.tt_searchInput')

  bodyOverlayEl.addEventListener('click', () => {
    bodyOverlayEl.textContent = ''
    connect()
  })
  modalEl.querySelector('[data-act=search]').addEventListener('click', () => {
    toggleSearch()
    if (searchInputEl.style.display !== 'none') searchInputEl.focus()
  })
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
    if (selection !== '') navigator.clipboard.writeText(selection).catch(() => {})
  })
  modalEl.querySelector('[data-act=paste]').addEventListener('click', () => {
    const tab = activeTab()
    if (tab === undefined) return
    navigator.clipboard.readText().then((text) => {
      sendFrame({ t: 'input', sid: tab.sid, d: text })
    }).catch(() => {})
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
    const tab = activeTab()
    if (tab !== undefined && tab.fit !== undefined) {
      try {
        tab.fit.fit()
      } catch {
        return
      }
      if (!tab.exited) sendResize(tab)
    }
  })
  resizeObserver.observe(bodyEl)

  // 首帧渲染：标签区的「+」要立即可见；连接栏按当前标签决定显隐
  renderTabbar()
  renderConnbar()

  connect()
}

/** 右下角悬浮条：展示会话数 / 连接状态，点击恢复窗口。 */
function buildDock() {
  dockEl = document.createElement('div')
  dockEl.className = 'tt_dock'
  dockEl.title = '点击恢复终端窗口'
  dockEl.innerHTML =
    '<span class="tt_dockTitle">' + TERMINAL_ICON + '<span>终端</span><span class="tt_dockCount"></span></span>' +
    '<span class="tt_dockStatus"></span>' +
    '<span class="tt_dockDot"></span>' +
    '<button class="tt_dockClose" title="关闭终端（结束所有会话）">✕</button>'
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
  closeSftpDialog()
  minimized = true
  if (searchInputEl !== null) searchInputEl.style.display = 'none'
  modalEl.dataset.minimized = ''
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
  entry.title = '终端已最小化 — 点击恢复'
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
  clearTimeout(dockActivityTimer)
  if (dockEl !== null) {
    dockEl.remove()
    dockEl = null
  }
  dockCountEl = null
  dockStatusEl = null
  dockDotEl = null
  syncEntryBadge()
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
  intentionalClose = true
  minimized = false
  closeAddMenu()
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
      if (!tab.exited) sendFrame({ t: 'kill', sid: tab.sid })
    }
    try {
      socket.close()
    } catch {
      /* 忽略 */
    }
    socket = null
  }
  if (resizeObserver !== null) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
  for (const tab of tabs.values()) {
    if (tab.term !== null) {
      try {
        tab.term.dispose()
      } catch {
        /* 忽略 */
      }
    }
  }
  tabs.clear()
  activeSid = null
  document.removeEventListener('keydown', onModalKeydown)
  modalEl.remove()
  modalEl = null
  statusChipEl = null
  statusEl = null
  statusDotEl = null
  tabbarEl = null
  connbarEl = null
  connDotEl = null
  connTargetEl = null
  connActionsEl = null
  closeTunnelPopover()
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
  entry.setAttribute('aria-label', '终端')
  entry.innerHTML = '<span class="tt_sidebarEntryIcon">' + TERMINAL_ICON + '</span><span class="tt_sidebarEntryLabel">终端</span>'
  entry.addEventListener('click', (event) => {
    event.preventDefault()
    openModal()
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
function TtySettingsCard() {
  const [open, setOpen] = React.useState(false)
  const [form, setForm] = React.useState(null)
  const [loaded, setLoaded] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [message, setMessage] = React.useState({ kind: '', text: '' })
  /** 已安装 shell 候选（/api/dsh-tty/shells，加载失败保持空 = 纯手输）。 */
  const [shellOptions, setShellOptions] = React.useState([])
  const [shellListOpen, setShellListOpen] = React.useState(false)

  const load = async () => {
    try {
      const res = await fetch('/api/dsh-tty/config', { cache: 'no-store' })
      const data = await res.json()
      if (data.ok && typeof data.config === 'object' && data.config !== null) {
        setForm(data.config)
        syncSshHostsCache(data.config) // 连接簿缓存与设置保持一致（「+」菜单共用）
      } else setMessage({ kind: 'error', text: String(data.error || '读取配置失败') })
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
  const [editing, setEditing] = React.useState(null)
  const [editForm, setEditForm] = React.useState(null)
  const [editError, setEditError] = React.useState('')
  /** 隧道实时状态（卡片展开期间 2s 轮询 /api/dsh-tty/tunnels）。 */
  const [tunnelStatus, setTunnelStatus] = React.useState([])
  const [tunnelDraft, setTunnelDraft] = React.useState({ direction: 'local', localPort: '', remoteHost: '', remotePort: '', localTargetPort: '', bookName: '' })
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
  const tunnelRule = (t) => (t?.direction === 'remote'
    ? `远程:${t.remoteHost || '127.0.0.1'}:${String(t.remotePort ?? 0)} → 本机:${String(t.localTargetPort ?? 0)}`
    : `本机:${String(t?.localPort ?? 0)} → ${t?.remoteHost ?? '?'}:${String(t?.remotePort ?? 0)}`)
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
        setMessage({ kind: 'error', text: String(data.error || '保存隧道失败') })
        return false
      }
      return true
    } catch (error) {
      setMessage({ kind: 'error', text: String(error && error.message ? error.message : error) })
      return false
    }
  }
  /** 添加隧道（append 进 form.tunnels 并立即生效；重名自动加后缀）。 */
  const addTunnel = () => {
    setMessage({ kind: '', text: '' })
    const d = tunnelDraft || {}
    const bookName = d.bookName || (Array.isArray(form?.sshHosts) ? form.sshHosts[0]?.name : '') || ''
    if (bookName === '') {
      setMessage({ kind: 'error', text: '请先在连接簿里添加 SSH 条目' })
      return
    }
    const num = (v) => {
      const n = Number(v)
      return Number.isInteger(n) && n >= 1 && n <= 65535 ? n : 0
    }
    let tunnel
    if (d.direction === 'remote') {
      tunnel = { name: '', bookName, direction: 'remote', remotePort: num(d.remotePort), localTargetHost: '', localTargetPort: num(d.localTargetPort), enabled: true }
      if (tunnel.remotePort < 1 || tunnel.localTargetPort < 1) {
        setMessage({ kind: 'error', text: '远程监听端口与本地目标端口必填（1~65535）' })
        return
      }
      tunnel.name = `${bookName}-R${String(tunnel.remotePort)}`
    } else {
      tunnel = { name: '', bookName, direction: 'local', localPort: num(d.localPort), remoteHost: d.remoteHost.trim(), remotePort: num(d.remotePort), enabled: true }
      if (tunnel.localPort < 1 || tunnel.remoteHost === '' || tunnel.remotePort < 1) {
        setMessage({ kind: 'error', text: '本地端口、远程主机、远程端口必填' })
        return
      }
      tunnel.name = `${bookName}-L${String(tunnel.localPort)}`
    }
    const existing = new Set((Array.isArray(form?.tunnels) ? form.tunnels : []).map((t) => t?.name))
    let finalName = tunnel.name
    let n = 2
    while (existing.has(finalName)) {
      finalName = `${tunnel.name}-${String(n)}`
      n += 1
    }
    tunnel.name = finalName
    const next = [...(Array.isArray(form?.tunnels) ? form.tunnels : []), tunnel]
    setForm((current) => ({ ...(current || {}), tunnels: next }))
    setTunnelDraft((current) => ({ ...(current || {}), localPort: '', remoteHost: '', remotePort: '', localTargetPort: '' }))
    void pushTunnels(next).then((ok) => {
      if (ok) setMessage({ kind: 'ok', text: `隧道「${finalName}」已生效` })
    })
  }
  const removeTunnel = (name) => {
    const next = (Array.isArray(form?.tunnels) ? form.tunnels : []).filter((t) => t?.name !== name)
    setForm((current) => ({ ...(current || {}), tunnels: next }))
    void pushTunnels(next)
  }
  const toggleTunnelEnabled = (name, checked) => {
    const next = (Array.isArray(form?.tunnels) ? form.tunnels : []).map((t) => (t?.name === name ? { ...t, enabled: checked } : t))
    setForm((current) => ({ ...(current || {}), tunnels: next }))
    void pushTunnels(next)
  }
  /** 进入编辑：复制条目到表单（按原始 name 定位，改名也安全）。 */
  const startEditSshHost = (host) => {
    setEditing(host?.name ?? null)
    setEditError('')
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
      persist: host?.persist === true,
    })
  }
  const cancelEditSshHost = () => {
    setEditing(null)
    setEditForm(null)
    setEditError('')
  }
  /** 应用编辑：按原始 name 替换条目（支持改名）；只改本地表单，随「保存」写入。 */
  const applyEditSshHost = () => {
    if (editForm === null) return
    const name = editForm.name.trim()
    const hostAddr = editForm.host.trim()
    const username = editForm.username.trim()
    if (name === '' || hostAddr === '' || username === '') {
      setEditError('名称、主机、用户名必填')
      return
    }
    let port = Number(editForm.port)
    if (!Number.isInteger(port) || port < 1 || port > 65535) port = 22
    if ((form?.sshHosts ?? []).some((h) => h?.name === name && name !== editing)) {
      setEditError('连接簿里已有同名条目: ' + name)
      return
    }
    if (editForm.auth === 'key' && editForm.keyPath.trim() === '') {
      setEditError('auth=key 需要私钥路径')
      return
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
            password: editForm.password,
            agentForward: editForm.agentForward,
            persist: editForm.persist === true,
          }
        : h),
    }))
    setEditing(null)
    setEditForm(null)
    setEditError('')
    setMessage({ kind: 'ok', text: '已修改条目「' + name + '」— 随「保存」写入配置' })
  }
  /** 删除连接簿条目（随「保存」一并提交）。 */
  const removeSshHost = (name) => {
    if (editing === name) cancelEditSshHost()
    setForm((current) => ({
      ...(current || {}),
      sshHosts: (Array.isArray(current?.sshHosts) ? current.sshHosts : []).filter((host) => host?.name !== name),
    }))
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
      if (!res.ok || !data.ok) setMessage({ kind: 'error', text: String(data.error || '删除主机密钥记录失败') })
      else setMessage({ kind: 'ok', text: '已删除主机密钥记录（下次连接重新记录指纹）' })
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
        setMessage({ kind: 'error', text: String(data.error || '读取 ~/.ssh/config 失败') })
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
      if (added === 0) setMessage({ kind: 'ok', text: skipped > 0 ? `没有新条目（${skipped} 条同名跳过）` : '~/.ssh/config 里没有可导入的具体主机' })
      else setMessage({ kind: 'ok', text: `已导入 ${added} 条（同名跳过 ${skipped} 条），随「保存」写入配置` })
    } catch (error) {
      setMessage({ kind: 'error', text: String(error && error.message ? error.message : error) })
    }
  }
  /** 从 ~/.ssh/known_hosts 导入指纹（TOFU 预填充）：立即 POST，同名 host:port 跳过。 */
  const importKnownHosts = async () => {
    setMessage({ kind: '', text: '' })
    try {
      const res = await fetch('/api/dsh-tty/known-hosts', { cache: 'no-store' })
      const data = await res.json()
      if (!data.ok) {
        setMessage({ kind: 'error', text: String(data.error || '读取 ~/.ssh/known_hosts 失败') })
        return
      }
      const incoming = Array.isArray(data.entries) ? data.entries : []
      const merged = [...(Array.isArray(form?.hostKeys) ? form.hostKeys : [])]
      const existing = new Set(merged.map((hk) => String(hk?.host ?? '') + ':' + String(hk?.port ?? 22)))
      let added = 0
      let skipped = 0
      for (const record of incoming) {
        if (record === null || typeof record !== 'object' || typeof record.host !== 'string' || typeof record.fingerprint !== 'string') continue
        const key = record.host + ':' + String(record.port ?? 22)
        if (existing.has(key)) {
          skipped += 1
          continue
        }
        existing.add(key)
        merged.push({ host: record.host, port: Number(record.port) || 22, fingerprint: record.fingerprint })
        added += 1
      }
      if (added === 0) {
        setMessage({ kind: 'ok', text: skipped > 0 ? `没有新指纹（${skipped} 条已存在）` : 'known_hosts 里没有可导入的具体主机' })
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
          setMessage({ kind: 'error', text: String(saveData.error || '保存 hostKeys 失败') })
          return
        }
        setMessage({ kind: 'ok', text: `已导入 ${added} 条指纹（跳过 ${skipped} 条已存在）` })
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
    for (const key of ['enabled', 'announceToAgent', 'maxSessions', 'shell', 'term', 'colorTerm', 'cwd', 'reconnectGraceSec', 'shellIntegration', 'sftpStyle', 'persistence']) {
      const value = (form || {})[key]
      if (value !== undefined && value !== '') body[key] = value
    }
    body.sshHosts = Array.isArray(form?.sshHosts) ? form.sshHosts : []
    body.tunnels = Array.isArray(form?.tunnels) ? form.tunnels : []
    try {
      const res = await fetch('/api/dsh-tty/config', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) setMessage({ kind: 'error', text: String(data.error || '保存失败') })
      else {
        setMessage({ kind: 'ok', text: '已保存并热生效' })
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

  /** 连接簿编辑表单（行内展开；只改本地表单，随卡片「保存」写入）。 */
  const renderSshHostEditor = () => {
    if (editForm === null) return null
    const editField = (label, key, placeholder, type) => jsxs('label', {
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
          onChange: (event) => setEditForm((current) => ({ ...(current || {}), [key]: event.target.value })),
        }),
      ],
    })
    return jsxs('div', {
      className: 'tt_sshEdit',
      children: [
        jsxs('div', { className: 'tt_sshGrid', children: [
          editField('名称', 'name', '同名冲突会被拒绝'),
          editField('端口', 'port', '22'),
        ] }),
        editField('主机', 'host', 'example.com 或 IP'),
        editField('用户名', 'username', 'root'),
        jsxs('label', { className: 'tt_sshRow', children: [
          jsx('span', { className: 'tt_cardLabel', children: '认证方式' }),
          jsxs('select', {
            className: 'tt_cardInput',
            value: editForm.auth,
            onChange: (event) => setEditForm((current) => ({ ...(current || {}), auth: event.target.value })),
            children: [
              jsx('option', { value: 'agent', children: 'agent — 使用本机 ssh-agent' }),
              jsx('option', { value: 'key', children: 'key — 私钥文件' }),
              jsx('option', { value: 'password', children: 'password — 密码' }),
            ],
          }),
        ] }),
        ...(editForm.auth === 'key' ? [editField('私钥路径', 'keyPath', '~/.ssh/id_ed25519'), editField('私钥口令（可空，支持 env:VAR）', 'passphrase', '', 'password')] : []),
        ...(editForm.auth === 'password' ? [editField('密码（支持 env:VAR）', 'password', '', 'password')] : []),
        jsxs('label', { className: 'tt_cardRow', children: [
          jsx('input', { type: 'checkbox', className: 'tt_cardCheckbox', checked: editForm.agentForward === true, onChange: (event) => setEditForm((current) => ({ ...(current || {}), agentForward: event.target.checked })) }),
          jsx('span', { className: 'tt_cardLabel', children: 'agent forwarding' }),
        ] }),
        jsxs('label', { className: 'tt_cardRow', children: [
          jsx('input', { type: 'checkbox', className: 'tt_cardCheckbox', checked: editForm.persist === true, onChange: (event) => setEditForm((current) => ({ ...(current || {}), persist: event.target.checked })) }),
          jsx('span', { className: 'tt_cardLabel', children: '持久会话（tmux 托管，断线/重启后恢复）' }),
        ] }),
        editError !== '' ? jsx('span', { className: 'tt_cardMessage tt_cardMessageError', children: editError }) : null,
        jsxs('div', { className: 'tt_cardRow', children: [
          jsx('button', { type: 'button', className: 'tt_cardSave', onClick: applyEditSshHost, children: '应用' }),
          jsx('button', { type: 'button', className: 'tt_toolBtn', onClick: cancelEditSshHost, children: '取消' }),
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
  const boolField = (label, key) => jsxs('label', {
    className: 'tt_cardField tt_cardRow',
    children: [
      jsx('input', { type: 'checkbox', className: 'tt_cardCheckbox', checked: form[key] === true, onChange: (event) => set(key, event.target.checked) }),
      jsx('span', { className: 'tt_cardLabel', children: label }),
    ],
  })

  return jsxs('li', {
    className: open ? 'tt_card tt_cardOpen' : 'tt_card',
    children: [
      jsxs('button', {
        type: 'button',
        className: 'tt_cardHeader',
        'aria-expanded': open,
        onClick: () => setOpen((current) => !current),
        children: [
          jsxs('span', {
            className: 'tt_cardHeadText',
            children: [
              jsx('span', { className: 'tt_cardName', children: '终端面板' }),
              jsx('span', { className: 'tt_cardDescription', children: 'xterm 终端面板：多标签页、断线自动重连、cwd 跟随会话、SSH 连接簿与主机指纹钉扎、tmux 会话持久化；shell / TERM / 并发上限等保存即热生效。' }),
            ],
          }),
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
      open ? jsxs('div', {
        className: 'tt_cardBody',
        children: [
          form === null
            ? jsx('div', { className: 'tt_cardMessage', children: '加载配置中…' })
            : jsxs('div', { children: [
                boolField('启用插件（需重启生效）', 'enabled'),
                boolField('向 agent 公告终端面板能力', 'announceToAgent'),
                boolField('shell 集成（OSC 133/7 注入，tty_capture{last} 与 cwd 跟随依赖它）', 'shellIntegration'),
                jsxs('div', {
                  className: 'tt_cardField',
                  children: [
                    jsx('span', { className: 'tt_cardLabel', children: 'SFTP 文件浏览风格' }),
                    jsxs('select', {
                      className: 'tt_cardInput',
                      value: form.sftpStyle === 'dual' ? 'dual' : 'dialog',
                      onChange: (event) => set('sftpStyle', event.target.value),
                      children: [
                        jsx('option', { value: 'dialog', children: '单窗体 — 远程目录 + 上传/下载/拖拽' }),
                        jsx('option', { value: 'dual', children: '双栏 — 左本机 / 右远程，选中直传' }),
                      ],
                    }),
                    jsx('span', { className: 'tt_cardHint', children: '双栏在本机与远程之间对拷文件（目录递归、同名覆盖）；重新打开 SFTP 后生效' }),
                  ],
                }),
                jsxs('div', {
                  className: 'tt_cardField',
                  children: [
                    jsx('span', { className: 'tt_cardLabel', children: '会话持久化（tmux）' }),
                    jsxs('select', {
                      className: 'tt_cardInput',
                      value: form.persistence === 'tmux' ? 'tmux' : 'off',
                      onChange: (event) => set('persistence', event.target.value),
                      children: [
                        jsx('option', { value: 'off', children: '关闭 — 会话随面板/宿主结束（默认）' }),
                        jsx('option', { value: 'tmux', children: 'tmux — 「持久终端」标签跨宿主重启恢复' }),
                      ],
                    }),
                    jsx('span', { className: 'tt_cardHint', children: '开启后「+」菜单出现「持久终端」、SSH 对话框出现「持久会话」；需本机安装 tmux（≥3.3 体验完整，agent 命令粒度工具依赖 passthrough）；已有持久标签不受开关影响' }),
                  ],
                }),
                textField('并发会话上限（1~16）', 'maxSessions', '4', '超过上限的新标签会被拒绝；保存即热生效'),
                jsxs('div', {
                  className: 'tt_cardField',
                  onBlur: (event) => {
                    // 焦点离开整个字段（含下拉列表）才收起；点击候选项由
                    // preventDefault 保持焦点在输入框内，不会触发这里的收起
                    if (!event.currentTarget.contains(event.relatedTarget)) setShellListOpen(false)
                  },
                  children: [
                    jsx('span', { className: 'tt_cardLabel', children: 'Shell 路径（默认 $SHELL）' }),
                    jsx('input', {
                      className: 'tt_cardInput',
                      value: form.shell ?? '',
                      placeholder: '留空使用 $SHELL',
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
                          return jsx('span', { className: 'tt_envMore', children: '没有匹配的候选 — 直接输入任意路径即可' })
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
                    jsx('span', { className: 'tt_cardHint', children: '可下拉选择本机已安装 shell（$SHELL 优先），也可直接输入任意路径；zsh / bash 支持 shell 集成' }),
                  ],
                }, 'shell-field'),
                textField('TERM', 'term', 'xterm-256color', 'TUI 程序依赖此值'),
                textField('COLORTERM', 'colorTerm', 'truecolor', ''),
                textField('兜底工作目录（客户端当前会话 cwd 优先）', 'cwd', '', '留空使用宿主进程启动目录'),
                textField('断线保活（秒，0 = 立即结束）', 'reconnectGraceSec', '120', '刷新页面/网络抖动后会话保活等待重连，超时后结束；保存即热生效'),
                jsxs('div', {
                  className: 'tt_cardField',
                  children: [
                    jsx('span', { className: 'tt_cardLabel', children: 'SSH 连接簿' }),
                    ...(Array.isArray(form.sshHosts) && form.sshHosts.length > 0
                      ? [jsx('div', {
                          className: 'tt_hostList',
                          children: form.sshHosts.map((host) => jsxs('div', {
                            children: [
                              jsxs('div', {
                                className: 'tt_sshHostRow',
                                children: [
                                  jsx('div', { className: 'tt_sshHostMeta', children: [
                                    jsx('span', { className: 'tt_sshHostName', children: host?.name ?? '' }),
                                    jsx('span', { className: 'tt_sshHostTarget', children: sshHostTargetLabel(host ?? {}) }),
                                  ] }),
                                  jsx('button', { type: 'button', className: 'tt_toolBtn', onClick: () => startEditSshHost(host), children: '编辑' }),
                                  jsx('button', { type: 'button', className: 'tt_toolBtn', onClick: () => removeSshHost(host?.name), children: '删除' }),
                                ],
                              }),
                              editing === host?.name ? renderSshHostEditor() : null,
                            ],
                          }, String(host?.name ?? ''))),
                        })]
                      : [jsx('span', { className: 'tt_cardHint', children: '暂无条目 — 终端面板「+」→ SSH 连接… 勾选「保存到连接簿」即可添加' })]),
                    jsxs('div', {
                      className: 'tt_cardRow',
                      children: [
                        jsx('button', { type: 'button', className: 'tt_toolBtn', onClick: () => void importSshConfig(), children: '从 ~/.ssh/config 导入' }),
                        jsx('span', { className: 'tt_cardHint', children: '同名跳过；随「保存」写入配置' }),
                      ],
                    }),
                    jsx('span', { className: 'tt_cardHint', children: '随「保存」一并写入配置；密码/口令支持 env:VAR 引用，避免明文入库' }),
                  ],
                }),
                jsxs('div', {
                  className: 'tt_cardField',
                  children: [
                jsxs('div', {
                  className: 'tt_cardField',
                  children: [
                    jsx('span', { className: 'tt_cardLabel', children: '端口转发' }),
                    ...(Array.isArray(form.tunnels) && form.tunnels.length > 0
                      ? [jsx('div', {
                          children: form.tunnels.map((t) => {
                            const st = tunnelStatus.find((s) => s.name === t?.name)
                            const state = st?.state ?? 'stopped'
                            return jsxs('div', {
                              className: 'tt_sshHostRow',
                              children: [
                                jsx('span', { className: 'tt_tunnelDot', 'data-state': state, title: state }),
                                jsx('div', { className: 'tt_sshHostMeta', children: [
                                  jsx('span', { className: 'tt_sshHostName', children: (t?.name ?? '') + ' · ' + tunnelRule(t ?? {}) }),
                                  jsx('span', { className: 'tt_sshHostTarget', children: (t?.bookName ?? '') + (st?.error ? ' · ' + st.error : '') + (st?.lastForwardError ? ' · ' + st.lastForwardError : '') }),
                                ] }),
                                jsx('input', { type: 'checkbox', className: 'tt_cardCheckbox', checked: t?.enabled !== false, title: '启用', onChange: (event) => toggleTunnelEnabled(t?.name, event.target.checked) }),
                                jsx('button', { type: 'button', className: 'tt_toolBtn', onClick: () => removeTunnel(t?.name), children: '删除' }),
                              ],
                            }, String(t?.name ?? ''))
                          }),
                        })]
                      : [jsx('span', { className: 'tt_cardHint', children: '暂无隧道 — 把远程数据库/内部服务映射到本地端口' })]),
                    jsxs('div', {
                      className: 'tt_sshEdit',
                      children: [
                        jsxs('div', {
                          className: 'tt_cardRow',
                          children: [
                            jsxs('select', { className: 'tt_cardInput', value: tunnelDraft.direction, onChange: setDraft('direction'), children: [
                              jsx('option', { value: 'local', children: '本地转发（-L）：本机端口 → 远程服务' }),
                              jsx('option', { value: 'remote', children: '远程转发（-R）：远程端口 → 本机服务' }),
                            ] }),
                            jsxs('select', { className: 'tt_cardInput', value: tunnelDraft.bookName, onChange: setDraft('bookName'), children: [
                              jsx('option', { value: '', children: '选择连接簿条目' }),
                              ...(Array.isArray(form?.sshHosts) ? form.sshHosts.map((host) => jsx('option', { value: host?.name ?? '', children: host?.name ?? '' })) : []),
                            ] }),
                          ],
                        }),
                        jsx('span', { className: 'tt_cardHint', children: selectedBook !== undefined
                          ? '经 ' + sshHostTargetLabel(selectedBook) + ' 连接 — 隧道的主机与认证取自该连接簿条目'
                          : '选择这条隧道要走哪台 SSH 连接（主机与认证取自连接簿）' }),
                        tunnelDraft.direction === 'local'
                          ? jsxs('div', { className: 'tt_tunnelGridLocal', children: [
                              jsx('input', { className: 'tt_cardInput', placeholder: '本地端口', value: tunnelDraft.localPort, autoComplete: 'off', onChange: setDraft('localPort') }),
                              jsx('input', { className: 'tt_cardInput', placeholder: '远程主机（从服务器侧访问，如 db.internal）', value: tunnelDraft.remoteHost, autoComplete: 'off', onChange: setDraft('remoteHost') }),
                              jsx('input', { className: 'tt_cardInput', placeholder: '远程端口', value: tunnelDraft.remotePort, autoComplete: 'off', onChange: setDraft('remotePort') }),
                            ] })
                          : jsxs('div', { className: 'tt_tunnelGrid', children: [
                              jsx('input', { className: 'tt_cardInput', placeholder: '远程监听端口', value: tunnelDraft.remotePort, autoComplete: 'off', onChange: setDraft('remotePort') }),
                              jsx('input', { className: 'tt_cardInput', placeholder: '本地目标端口', value: tunnelDraft.localTargetPort, autoComplete: 'off', onChange: setDraft('localTargetPort') }),
                            ] }),
                        jsx('div', { className: 'tt_cardRow', children: [
                          jsx('button', { type: 'button', className: 'tt_cardSave', onClick: addTunnel, children: '添加隧道' }),
                          jsx('span', { className: 'tt_cardHint', children: '添加后立即生效；断线自动重连；本地端口建议 1024 以上；远程主机由 SSH 服务器侧访问（127.0.0.1 = 服务器自身）' }),
                        ] }),
                      ],
                    }),
                  ],
                }),
                jsxs('div', {
                  className: 'tt_cardField',
                  children: [
                    jsx('span', { className: 'tt_cardLabel', children: 'SSH 主机密钥记录（TOFU）' }),
                        jsx('button', { type: 'button', className: 'tt_toolBtn', onClick: () => void importKnownHosts(), children: '从 known_hosts 导入' }),
                      ],
                    }),
                    ...(Array.isArray(form.hostKeys) && form.hostKeys.length > 0
                      ? [jsx('div', {
                          className: 'tt_hostList',
                          children: form.hostKeys.map((hk) => jsxs('div', {
                            className: 'tt_sshHostRow',
                            children: [
                              jsx('div', { className: 'tt_sshHostMeta', children: [
                                jsx('span', { className: 'tt_sshHostName', children: String(hk?.host ?? '') + ':' + String(hk?.port ?? 22) }),
                                jsx('span', { className: 'tt_sshHostTarget', children: 'sha256:' + String(hk?.fingerprint ?? '') }),
                              ] }),
                              jsx('button', { type: 'button', className: 'tt_toolBtn', onClick: () => void removeHostKey(hk), children: '删除' }),
                            ],
                          }, String(hk?.host ?? '') + ':' + String(hk?.port ?? 22))),
                        })]
                      : [jsx('span', { className: 'tt_cardHint', children: '暂无记录 — 首次 SSH 连接成功后自动记录主机指纹' })]),
                    jsx('span', { className: 'tt_cardHint', children: '主机指纹变更时连接会被拒绝（防中间人）；确认安全后删除对应记录即可重连' }),
                  ],
                }),
                jsxs('div', {
                  className: 'tt_cardField tt_cardRow',
                  children: [
                    jsx('button', { className: 'tt_cardSave', disabled: saving, onClick: () => void save(), children: saving ? '保存中…' : '保存' }),
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
    exports.apply = (ctx) => {
      sessionsService = ctx.sessions
      mountSidebarEntry()
      ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
        name: 'settings.plugin.item',
        // settings.plugin.item 是 keyed 插槽：key 必须是该卡片所编辑的 settings 命名空间
        key: 'tty',
        order: 110,
      }, TtySettingsCard))
      return () => {
        closeModal()
      }
    }
    return exports
  },
})
