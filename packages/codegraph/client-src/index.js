/* eslint-disable */
/**
 * @hyzyn/dsh-codegraph — 浏览器半体（**源码**）。包根的 client.js 是它的构建产物：
 * `pnpm --filter @hyzyn/dsh-codegraph build` 经 scripts/build-client.mjs 产出
 * （去掉下面那行对 pure.js 的 import，再把 pure.js 的 `export` 前缀剥掉后内联进
 * factory），CI 的 artifact-diff 以逐字节一致为闸——以前是手写产物、与源码之间
 * 没有闸，漂移 CI 看不见（CG28）。
 *
 * 纯逻辑（无 DOM / React 依赖的判定）放 client-src/pure.js，因为那边能进 vitest；
 * 本文件里剩下的都是 React 组件与宿主交互，没有测试底座。新增纯判定请加到 pure.js，
 * 不要写回这里的闭包。
 * 同时注册 DSH ≤0.1.5 的 settings.plugin.item 与 ≥0.1.6-alpha.2 的 plugins.row.config，跨版本兼容。
 * 纯前端 React 卡片，宿主经 client-modules 的 combo 路由（/plugins/??<id>/client.js&rev=…）
 * 按 boot graph 下发的 URL 提供；单包直链 /plugins/@hyzyn/dsh-codegraph/client.js 在
 * 当前 DSH（0.1.5-rc.2）上不再直接可用。
 */
import { REL_LIMIT, adoptionText, fmtBytes, fmtNum, fmtTime, nextRetryDelayMs, seenAgoText, shortPath, staleReasons, truncationNote } from './pure.js'

window.__ModuleLoader__.load({
  id: '@hyzyn/dsh-codegraph',
  factory: (require) => {
    const exports = {}

    /* __CODEGRAPH_PURE_INLINE__ */

    const React = require('react')
    const { jsx, jsxs } = require('react/jsx-runtime')

    /* ================================ CSS ================================ */

    const CSS = [
      '.cg_pageHost{display:block}',
      '.cg_pluginCard{list-style:none;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;transition:border-color .16s,background .16s}',
      '.cg_pluginCard:hover{border-color:var(--dsw-alias-label-dimmed)}',
      '.cg_pluginCardOpen{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-label-dimmed)}',
      '.cg_cardHeader{appearance:none;width:100%;color:inherit;font:inherit;text-align:left;cursor:pointer;background:0 0;border:0;border-radius:12px;display:flex;align-items:center;gap:12px;padding:14px 16px}',
      '.cg_cardHeader:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}',
      '.cg_cardHeadText{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}',
      '.cg_cardName{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:600}',
      '.dshkit_badge{flex:none;margin-left:auto;padding:1px 8px;border-radius:999px;font-size:11px;font-weight:600;line-height:16px;letter-spacing:.02em;color:var(--dsw-alias-label-dimmed);background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1)}',
      '.cg_cardDescription{color:var(--dsw-alias-label-secondary);font-size:12px}',
      '.cg_chevron{flex:none;color:var(--dsw-alias-label-tertiary);transition:transform .16s}',
      '.cg_pluginCardOpen .cg_chevron{transform:rotate(180deg)}',
      '.cg_cardBody{padding:2px 16px 16px}',
      '.cg_panel{display:flex;flex-direction:column;gap:12px;color:var(--dsw-alias-label-primary);font-family:var(--dsw-font-family);box-sizing:border-box}',
      // 面板头只剩标题（布局分组后工具栏自成分组，不再挤在标题旁边），包一层的
      // .cg_panelHeader 随之删除；.cg_panelTitle 原来的 flex:1 是给「标题 + 按钮组」
      // 那个 flex 行用的，单独成行后留着只会在列布局里引入无意义的伸缩。
      '.cg_panelTitle{margin:0;font-size:15px;font-weight:700;white-space:nowrap}',
      // 面板标题行：标题 + 忙碌指示器（+ 取消）。忙碌指示器放在这里而不是正文中间，
      // 是因为索引操作可能跑十分钟——放正文里会随滚动移出视野，而且插入/移除会让
      // 下面整组控件上下跳动。标题行本来就在，挂在它右边是**零布局跳动**且常驻可见。
      '.cg_panelHeader{display:flex;align-items:center;gap:10px;flex-wrap:wrap}',
      // 忙碌指示器：转圈 + 「在做什么」+（可取消时）取消按钮，三者挨着——
      // 「停」的对象就是左边那件事，不该分到另一行去。
      '.cg_busy{display:inline-flex;align-items:center;gap:7px;font-size:12px;color:var(--dsw-alias-label-secondary);min-width:0}',
      // 纯 CSS 转圈：不引图标、不加 DOM。用当前色描边 + 主题色顶边，跟着文字颜色走。
      '.cg_spinner{flex:none;width:12px;height:12px;border:2px solid var(--dsw-alias-border-l2);border-top-color:var(--dsw-alias-state-business-primary);border-radius:50%;animation:cg_spin .7s linear infinite}',
      // 按钮内的忙碌内容（转圈 + 文案）。按钮本身是 inline 元素，包一层 inline-flex
      // 才能让转圈与文字基线对齐；不设固定宽度——忙碌文案比静止时略长，按钮会宽一点，
      // 这点局部位移远好过「点了没有任何反馈」。
      '.cg_btnBusy{display:inline-flex;align-items:center;gap:6px}',
      '@keyframes cg_spin{to{transform:rotate(360deg)}}',
      // 尊重「减少动态效果」：关掉旋转，靠文案与取消按钮继续表达「正在进行」。
      // 组头里的图标按钮：紧凑、无边框，hover 才给底色——它是辅助动作，不抢视觉。
      '.cg_iconBtn{display:inline-flex;align-items:center;justify-content:center;flex:none;width:24px;height:24px;padding:0;color:var(--dsw-alias-label-secondary);background:0 0;border:1px solid transparent;border-radius:6px;cursor:pointer}',
      '.cg_iconBtn:hover:not(:disabled){color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}',
      '.cg_iconBtn:disabled{opacity:.5;cursor:default}',
      // 刷新进行中：图标自转（复用 cg_spin）。只在**本动作**在跑时转（data-busy 由
      // busyAction 驱动），否则搜个符号也会让刷新图标转起来，等于报错信息。
      '.cg_iconBtn[data-busy="1"] svg{animation:cg_spin .7s linear infinite}',
      '@media (prefers-reduced-motion:reduce){.cg_spinner,.cg_iconBtn[data-busy="1"] svg{animation:none}}',
      '.cg_subtitle{color:var(--dsw-alias-label-tertiary);font-size:11.5px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:360px}',
      // 索引维护按钮组改成「可换行的行」而不是「整组 nowrap」：
      // 早先只有 5 个按钮，整组 nowrap + margin-left:auto 能让它们要么留在标题右边、
      // 要么整组换行；P2 加到 12 个之后这招失效——12 个按钮约 900px，而侧边栏只有
      // ~360px，整组不许断行就只能溢出被裁（实测截图里「撤销索引」被切掉）。
      // 布局分组后 margin-left:auto + 右对齐也一并去掉：按钮组不再和标题抢一行，
      // 右对齐只会让折行后的行尾参差（截图实证：「诊断包 / 撤销索引」孤零零悬在
      // 第二行右侧）。现在组自成分组、左对齐自然换行，阅读顺序 = 视觉顺序。
      '.cg_toolbarBtns{display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
      '.cg_btn{color:var(--dsw-alias-label-primary-foreground);background:var(--dsw-alias-button-info-fill);border:none;border-radius:8px;padding:6px 14px;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap}',
      '.cg_btn:hover:not(:disabled){background:var(--dsw-alias-button-info-hover)}',
      '.cg_btn:disabled{opacity:.5;cursor:default}',
      '.cg_btnGhost{color:var(--dsw-alias-label-primary);background:0 0;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:5px 12px;font-size:12px;cursor:pointer;white-space:nowrap}',
      // 「初始化索引」的二次确认态：它会往用户项目里写 .codegraph/，用告警色区别于普通按钮
      '.cg_btnDanger{color:var(--dsw-alias-state-error-primary);background:0 0;border:1px solid color-mix(in srgb,var(--dsw-alias-state-error-primary) 45%,transparent);border-radius:8px;padding:5px 12px;font-size:12px;cursor:pointer;white-space:nowrap}',
      '.cg_btnGhost:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}',
      '.cg_input{color:var(--dsw-alias-label-primary);background:var(--dsw-specific-input-major);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;outline:none;padding:6px 10px;font-family:inherit;font-size:13px;box-sizing:border-box;width:100%}',
      '.cg_input:focus{border-color:var(--dsw-alias-state-business-primary)}',
      '.cg_input::placeholder{color:var(--dsw-alias-label-tertiary)}',
      // 搜索行：原来固定 3 列 grid（路径输入 / 搜索输入 / 搜索按钮）。P2 把「探索」「上下文」
      // 也放进这一行（它们吃搜索框的关键词），4-5 列会把两个输入框挤到无法使用，
      // 所以改成 flex：输入框按 flex 比例伸缩，按钮按内容宽度、放不下就整行换行。
      '.cg_row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}',
      '.cg_row .cg_input{flex:1 1 160px;width:auto;min-width:120px}',
      '.cg_list{display:flex;flex-direction:column;gap:8px;max-height:360px;overflow-y:auto}',
      '.cg_item{background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);border-radius:10px;padding:8px 10px;cursor:pointer;font-size:12.5px}',
      '.cg_item:hover{border-color:var(--dsw-alias-label-dimmed)}',
      '.cg_itemName{font-weight:600;color:var(--dsw-alias-label-primary)}',
      '.cg_itemMeta{color:var(--dsw-alias-label-tertiary);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;margin-top:2px}',
      '.cg_pre{background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);border-radius:8px;padding:10px;max-height:320px;overflow:auto;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11.5px;white-space:pre-wrap;word-break:break-all;color:var(--dsw-alias-label-primary)}',
      // 空态文案（列表为空时的占位）。`.cg_loading` 已退役：忙碌态改成标题行里的
      // 内联指示器（见 .cg_busy / .cg_spinner）——原先它是**居中大块**
      // （padding:24px 12px），既不说在加载什么、又把下面整组控件推下去（布局跳动），
      // 而且 Sync 跑十分钟时它会随滚动移出视野。
      '.cg_empty{text-align:center;color:var(--dsw-alias-label-tertiary);padding:24px 12px;font-size:12.5px}',
      '.cg_error{color:var(--dsw-alias-state-error-primary);font-size:12px;margin:0;white-space:pre-wrap}',
      '.cg_ok{color:var(--dsw-alias-state-success-primary);font-size:12px;margin:0}',
      '.cg_sectionTitle{margin:0;font-size:13px;font-weight:700;color:var(--dsw-alias-label-secondary)}',
      // 面板分组（布局重构）：小标题 + 通栏细线。把原先「12 个按钮 + 5 类控件挤在一条
      // 无分层长列」的面板（截图实证：按钮换行后行尾参差、复选框和说明文字混排、
      // 「设为默认项目」孤悬在两组控件之间）按语义分组，每组内部仍是可换行的 flex 行。
      //
      // UX 重构后的自上而下顺序：目标项目 → 索引状态 → 索引维护 → 搜索与查询 →
      // Agent 集成。此前「索引状态」沉在最底部，打开卡片要先越过两行输入框和 9 个
      // 按钮才知道索引健不健康——状态先于操作，且「过期警告」与修它的「重建索引」
      // 按钮上下相邻。
      '.cg_section{display:flex;flex-direction:column;gap:8px}',
      '.cg_sectionHead{display:flex;align-items:center;gap:10px}',
      '.cg_sectionHeadText{font-size:11px;font-weight:700;letter-spacing:.08em;color:var(--dsw-alias-label-tertiary);white-space:nowrap}',
      '.cg_sectionRule{flex:1;height:1px;background:var(--dsw-alias-border-l1)}',
      '.cg_grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px}',
      '.cg_cell{background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);border-radius:10px;padding:8px 10px;min-width:0}',
      '.cg_k{color:var(--dsw-alias-label-tertiary);font-size:11px;letter-spacing:.02em}',
      '.cg_v{color:var(--dsw-alias-label-primary);font-size:13px;font-weight:600;margin-top:3px;overflow-wrap:anywhere}',
      '.cg_vMono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11.5px;font-weight:500}',
      '.cg_badgeOk{color:var(--dsw-alias-state-success-primary)}',
      '.cg_badgeWarn{color:var(--dsw-alias-state-warning-primary,var(--dsw-alias-state-error-primary))}',
      '.cg_details{border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-2)}',
      '.cg_details>summary{cursor:pointer;padding:7px 10px;font-size:12px;color:var(--dsw-alias-label-secondary);list-style:none}',
      '.cg_details>summary::-webkit-details-marker{display:none}',
      '.cg_details>summary::before{content:"▸ ";color:var(--dsw-alias-label-tertiary)}',
      '.cg_details[open]>summary::before{content:"▾ "}',
      '.cg_details .cg_pre{border:0;border-top:1px solid var(--dsw-alias-border-l1);border-radius:0 0 9px 9px;max-height:260px;margin:0}',
      '.cg_rel{display:flex;flex-direction:column;gap:4px}',
      '.cg_relItem{display:flex;gap:8px;align-items:baseline;font-size:12px;min-width:0}',
      '.cg_relName{color:var(--dsw-alias-label-primary);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.cg_relMeta{color:var(--dsw-alias-label-tertiary);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.cg_mcpMeta{color:var(--dsw-alias-label-tertiary);font-size:11.5px;line-height:1.5;min-width:0}',
      '.cg_warn{color:var(--dsw-alias-state-warning-primary,var(--dsw-alias-state-error-primary));font-size:12px;line-height:1.55;margin:0;white-space:pre-wrap}',
      // 探测失败的实测原文：用等宽 + 淡色和上面的指引分开，让「ENOENT / 非零退出 / 超时」
      // 一眼可辨，而不是混在说明文字里被当成人话略过去。
      '.cg_probeDetail{color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-base,#00000010);border-radius:6px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11.5px;line-height:1.5;margin:0;padding:6px 8px;white-space:pre-wrap;word-break:break-all}',
      '.cg_checks{display:flex;align-items:center;gap:16px;flex-wrap:wrap;font-size:12.5px;color:var(--dsw-alias-label-secondary)}',
      '.cg_check{display:inline-flex;align-items:center;gap:6px;cursor:pointer}',
      '.cg_check input{cursor:pointer}',
      '.cg_check[data-off="1"]{opacity:.55;cursor:default}',
      // P2 项目列表：一行横向滚动的胶囊按钮。flex-wrap 而不是滚动条——项目一般
      // 个位数，换行比隐藏更利于发现；窄屏下自动堆成多行。
      '.cg_projects{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:12px}',
      '.cg_projectsLabel{color:var(--dsw-alias-label-tertiary);font-size:11px;white-space:nowrap}',
      '.cg_projectBtn{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);border-radius:999px;padding:2px 10px;font-size:11.5px;cursor:pointer;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;white-space:nowrap;max-width:260px;overflow:hidden;text-overflow:ellipsis}',
      '.cg_projectBtn:hover:not(:disabled){border-color:var(--dsw-alias-state-business-primary)}',
      '.cg_projectBtn:disabled{opacity:.45;cursor:default}',
      // P2 查询参数面板：小号输入 + 内联标签，跟搜索行区分开（搜索行是主操作）
      '.cg_queryOpts{display:flex;align-items:center;gap:12px;flex-wrap:wrap;font-size:12px}',
      '.cg_opt{display:inline-flex;align-items:center;gap:6px;color:var(--dsw-alias-label-tertiary);white-space:nowrap}',
      '.cg_optWide{flex:1;min-width:220px}',
      '.cg_optWide .cg_inputSm{flex:1}',
      '.cg_inputSm{width:150px;padding:4px 8px;font-size:12px}',
      // 「上限」这类纯数字小输入用不着 150px，紧凑尺寸让参数行一行能多放一项
      '.cg_inputXs{width:64px;padding:4px 8px;font-size:12px}',
      // 组内小标题（UX 重构）：比 .cg_sectionHeadText 更轻，用于一个分组内部的子层级——
      // 「生命周期 / 查看与诊断 / 危险」「符号查询 / 改动影响」「跟随与提示词 / MCP 挂载」。
      // 只留文字不带通栏线：组已经有自己的分隔线，组内再画一条就是噪音。
      '.cg_rowLabel{font-size:11px;font-weight:600;letter-spacing:.06em;color:var(--dsw-alias-label-tertiary);white-space:nowrap}',
      // 删除类动作的行内槽位：与左侧常规按钮之间一道**竖向虚线**。
      // 为什么是行内槽而不是独立一行：独立成行会让「一个按钮 + 右侧大片空白」看起来
      // 像换行 bug（用户实证提问），而它本来就属于「生命周期」这一档。竖向虚线保留
      // 「这个与前面那几个不是一类」的标记，又不浪费一整行。
      // 换行时它可能落到行首，那时左边虚线正好当行首标记，仍然成立。
      '.cg_dangerSlot{display:inline-flex;align-items:center;padding-left:9px;margin-left:1px;border-left:1px dashed var(--dsw-alias-border-l2)}',
      // 结果区页签栏：下划线的页签（比按钮更像「视图切换」），底部一条细线把整栏连起来。
      '.cg_tabs{display:flex;align-items:center;gap:2px;flex-wrap:wrap;border-bottom:1px solid var(--dsw-alias-border-l1)}',
      '.cg_tab{color:var(--dsw-alias-label-secondary);background:0 0;border:0;border-bottom:2px solid transparent;padding:5px 10px;font-size:12.5px;font-family:inherit;cursor:pointer;white-space:nowrap}',
      '.cg_tab:hover{color:var(--dsw-alias-label-primary)}',
      '.cg_tabOn{color:var(--dsw-alias-label-primary);font-weight:600;border-bottom-color:var(--dsw-alias-state-business-primary)}',
      // 面板给个内边距，让内容与页签栏分开；min-height 避免空态时整块塌成一条线。
      '.cg_tabPanel{padding-top:2px;min-height:20px}',
    ].join('\n')

    // CG08/CG37：样式引用计数。同一次挂载会把这张卡片注册进多个插槽（0.1.6 上
    // plugins.row.config 与 settings.kit.item 会同时命中），「任一实例卸载即 remove」
    // 会让另一张还在显示的卡片瞬间全裸。且**计数必须挂在元素上**（dataset）、不能
    // 挂在闭包里：同一份 client.js 可能被宿主再次执行（HMR / 重载不换 document 的
    // 场景），闭包计数是每一代各一份、节点却是文档共享的——闭包计数下旧一代卸载
    // 会摘掉新一代在用的节点，新一代也因 getElementById 早退而永远摘不掉。
    function ensureStyle() {
      let el = document.getElementById('dsh-codegraph-style')
      if (el === null) {
        el = document.createElement('style')
        el.id = 'dsh-codegraph-style'
        el.textContent = CSS
        document.head.appendChild(el)
      }
      el.dataset.cgRefs = String(Number(el.dataset.cgRefs ?? '0') + 1)
    }
    function releaseStyle() {
      const el = document.getElementById('dsh-codegraph-style')
      if (el === null) return
      const refs = Math.max(0, Number(el.dataset.cgRefs ?? '1') - 1)
      if (refs === 0) el.remove()
      else el.dataset.cgRefs = String(refs)
    }

    /* ================================ API ================================ */

    async function api(path, options) {
      const response = await fetch(path, options)
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.error || ('HTTP ' + response.status))
      }
      return data
    }

    const qs = (params) => {
      const search = new URLSearchParams()
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null && value !== '') search.set(key, String(value))
      }
      const text = search.toString()
      return text ? ('?' + text) : ''
    }

    /* ======================== 运行时会话引用 ======================== */

    // apply 时注入的 sessions 服务（浏览器运行时全局 store，非 React 内部状态）。
    // 用于读取「当前活动会话的工作目录」，让 Codegraph 默认跟随当前项目，
    // 而不是钉死在宿主启动目录（process.cwd()）。
    let sessionsService = null

    /**
     * 当前活动会话的工作目录；没有活动会话（或它没有 cwd）时返回 ''。
     *
     * 会话列表快照（SessionListState）只有 ids / byId / phase / subagentsByParent /
     * jobsBySession —— **没有 current 字段**，所以旧实现读的 `snapshot.current` 恒为
     * undefined，`byId[undefined]` 取不到任何会话，cwd 永远是 ''：卡片不跟随会话，
     * 上报接口只会报到空路径，托管行 cwd 就永远停在默认项目上。
     *
     * 「主视图正在展示的那个会话」由 retainedBy.mainView > 0 标记，宿主自带的
     * layout / workspace / cordis / settings-general 等客户端插件都这么取。
     */
    const activeSessionCwd = () => {
      try {
        const snapshot = sessionsService?.list?.getSnapshot?.()
        const active = Object.values(snapshot?.byId ?? {}).find((row) => (row?.retainedBy?.mainView ?? 0) > 0)
        const cwd = active?.cwd
        return typeof cwd === 'string' && cwd !== '' ? cwd : ''
      } catch {
        return ''
      }
    }

    /* ================================ 设置卡片 ================================ */

    /**
     * 刷新图标（Material「refresh」的路径，viewBox 24×24）。
     * 组头里的动作用图标而不是文字：它是「属于这一组」的辅助动作，不该和组内主控件
     * 抢视觉重量（用户建议改成图标）。语义靠 `title` + `aria-label` 补足——
     * 纯图标按钮对读屏与悬停都必须有话说。
     */
    const REFRESH_PATH = 'M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-8 8s3.58 8 8 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z'
    const CHEVRON_PATH = 'M11.8486 5.5L11.4238 5.92383L8.69727 8.65137C8.44157 8.90706 8.21562 9.13382 8.01172 9.29785C7.79912 9.46883 7.55595 9.61756 7.25 9.66602C7.08435 9.69222 6.91565 9.69222 6.75 9.66602C6.44405 9.61756 6.20088 9.46883 5.98828 9.29785C5.78438 9.13382 5.55843 9.13382 5.30273 8.65137L2.57617 5.92383L2.15137 5.5L3 4.65137L3.42383 5.07617L6.15137 7.80273C6.42595 8.07732 6.59876 8.24849 6.74023 8.3623C6.87291 8.46904 6.92272 8.47813 6.9375 8.48047C6.97895 8.48703 7.02105 8.48703 7.0625 8.48047C7.07728 8.47813 7.12709 8.46904 7.25977 8.3623C7.40124 8.24849 7.57405 8.07732 7.84863 7.80273L10.5762 5.07617L11 4.65137L11.8486 5.5Z'

    // P3：fmtNum / fmtBytes / fmtTime 已抽到 client-src/pure.js（可直接进 vitest），
    // 构建时内联进本 factory；此处只留调用点。

    /** 一个「标签 + 值」的单元格。 */
    const cell = (key, value, options) => jsxs('div', {
      className: 'cg_cell',
      children: [
        jsx('div', { className: 'cg_k', children: key }),
        jsx('div', {
          className: (options && options.mono ? 'cg_v cg_vMono' : 'cg_v') + (options && options.tone ? ' ' + options.tone : ''),
          title: options && options.title ? options.title : undefined,
          children: value,
        }),
      ],
    }, 'cell-' + key)

    /**
     * 索引状态：按 CLI `status --json` 的字段铺成紧凑网格。
     * 形状不符（JSON 解析失败时的 `{raw}`、或 CLI 报错文本）才回落到原始文本。
     */
    const statusCells = (status) => {
      const pending = status.pendingChanges && typeof status.pendingChanges === 'object' ? status.pendingChanges : {}
      return [
        cell('状态', status.initialized ? '● 已索引' : '○ 未初始化', { tone: status.initialized ? 'cg_badgeOk' : 'cg_badgeWarn' }),
        cell('版本', String(status.version ?? '—'), { mono: true }),
        cell('项目', String(status.projectPath ?? '—'), { mono: true, title: status.projectPath }),
        cell('规模', fmtNum(status.fileCount) + ' 文件 · ' + fmtNum(status.nodeCount) + ' 符号 · ' + fmtNum(status.edgeCount) + ' 边'),
        cell('最后索引', fmtTime(status.lastIndexed)),
        cell('待同步', '+' + fmtNum(pending.added ?? 0) + ' ~' + fmtNum(pending.modified ?? 0) + ' -' + fmtNum(pending.removed ?? 0)),
        cell('语言', Array.isArray(status.languages) && status.languages.length > 0 ? status.languages.join(' / ') : '—'),
        cell('索引库', fmtBytes(status.dbSizeBytes), { mono: true }),
      ]
    }

    // CG11 的 staleReasons 已抽到 client-src/pure.js（可直接进 vitest），构建时内联进本
    // factory；此处只留调用点（面板警告行）。

    /** 关系列表（callers / callees / affected 共用）；超过 REL_LIMIT 条给出截断计数（CG17）。 */
    const relList = (title, items, emptyText) => {
      const truncated = truncationNote(items.length, REL_LIMIT)
      return jsxs('div', {
        children: [
          jsx('p', { className: 'cg_sectionTitle', children: title }),
          items.length === 0
            ? jsx('div', { className: 'cg_itemMeta', children: emptyText })
            : jsxs('div', {
              className: 'cg_rel',
              children: [
                ...items.slice(0, REL_LIMIT).map((item, index) => jsxs('div', {
                  className: 'cg_relItem',
                  children: [
                    jsx('span', { className: 'cg_relName', children: item.name || '(unnamed)' }),
                    jsx('span', { className: 'cg_relMeta', children: (item.kind || '') + ' · ' + (item.filePath || '') + (item.startLine ? ':' + item.startLine : '') }),
                  ],
                }, 'rel-' + title + '-' + index)),
                ...(truncated === ''
                  ? []
                  : [jsx('div', { className: 'cg_itemMeta', children: truncated }, 'rel-truncated-' + title)]),
              ],
            }),
        ],
      })
    }

    /**
     * 面板分组（布局重构）：小标题 + 通栏细线的分组头，下面挂该组的具体控件行。
     * 为什么分组：控件涨到 P2 规模后（12 个工具按钮、4 个开关、3 类查询参数），
     * 一条无分层的长列在窄栏里就是「按钮换行行尾参差、开关和说明文字混排、
     * 「设为默认项目」孤悬两组之间」的乱（用户截图实证）；按「目标项目 / 搜索与
     * 查询 / 索引维护 / Agent 集成 / 索引状态」分组后，每组语义单一，扫一眼能定位。
     */
    /**
     * 结果区的页签（顺序 = 展示顺序）。触发按钮用同一批 key 调 setActiveTab，
     * 所以新增一种查询时只需在这里加一行、在按钮上接一次 busyOr/setActiveTab。
     */
    const RESULT_TABS = [
      { key: 'search', label: '搜索结果' },
      { key: 'files', label: '文件' },
      { key: 'affected', label: '影响面' },
      { key: 'explore', label: '探索' },
      { key: 'context', label: '上下文' },
      { key: 'detail', label: '符号详情' },
    ]
    /** 会被「索引变化」弄陈旧的那几个页签（重建 / 撤销后要清掉）。 */
    const INDEX_RESULT_TABS = ['files', 'affected', 'explore', 'context']

    /** 单个查询结果（files / affected / explore / context）的正文。 */
    const renderOutputBody = (output) => (output.text !== ''
      // explore / context 的 markdown：原样按等宽显示（卡片不做 markdown 渲染，
      // 免得引一套 renderer；内容本身就是给模型读的源码 + 关系）
      ? jsx('pre', { className: 'cg_pre', children: output.text.slice(0, 4000) })
      : Array.isArray(output.json)
        ? (output.json.length === 0
          ? jsx('p', { className: 'cg_mcpMeta', children: '（空）' })
          : jsx('pre', {
            className: 'cg_pre',
            children: output.json.map((item) => typeof item === 'string'
              ? item
              : (item.path ?? item.file ?? JSON.stringify(item))).join('\n'),
          }))
        : jsx('pre', { className: 'cg_pre', children: (output.raw || '（无输出）').slice(0, 4000) }))

    /**
     * 面板分组：小标题 + 通栏细线 +（可选）尾随动作。
     *
     * `action` 是「属于本组的那个动作」——典型例子是「刷新状态」：它重新读取的正是
     * 「索引状态」这一组的数据，原先却放在「索引维护 → 查看与诊断」里，隔着一整屏
     * （用户直接问「这个状态和刷新状态有关系吗」）。放到组头右侧，关系一眼可见。
     *
     * 细线用显式元素而不是 `::after`：伪元素永远排在盒内最后，尾随按钮会跑到细线
     * **左边**（贴着标签），右对齐就失效了。
     */
    const group = (label, children, action) => jsxs('div', {
      className: 'cg_section',
      children: [
        jsxs('div', {
          className: 'cg_sectionHead',
          children: [
            jsx('span', { className: 'cg_sectionHeadText', children: label }),
            jsx('span', { className: 'cg_sectionRule' }),
            ...(action === undefined || action === null ? [] : [action]),
          ],
        }),
        ...children,
      ],
    }, 'cg-group-' + label)

    function CodegraphSettingsCard(props) {
      // DSH ≥0.1.6 的插件配置页把同一条目按 view 渲染两次：summary 一句话摘要、page 完整表单。
      // 旧版（≤0.1.5）的 settings.plugin.item 卡片不带 view，走原有可折叠卡片分支。
      const view = props && props.view
      const pageView = view === 'page'
      // CG08：样式跟着卡片实例走（引用计数，见 ensureStyle/releaseStyle）
      React.useEffect(() => {
        ensureStyle()
        return releaseStyle
      }, [])
      const [open, setOpen] = React.useState(pageView)
      const [path, setPath] = React.useState('')
      const [manual, setManual] = React.useState(false)
      const [status, setStatus] = React.useState(null)
      const [query, setQuery] = React.useState('')
      // P2 查询参数面板：CLI 的 -k/--kind 与 -l/--limit 此前卡片够不着（limit 固定 20）。
      // kind 刻意用**自由文本**而不是下拉枚举：上游加新 kind 时插件不必跟着改，
      // 填错 CLI 自己会回空结果（与卡片上其它旋钮的取向一致）。
      const [queryKind, setQueryKind] = React.useState('')
      // P2「影响面」：affected 需要一份**改动文件**列表。刻意不让插件去猜（不读 git status、
      // 不猜编辑器状态）——待测文件从哪来是用户/上游流程的事，插件只负责把给定的列表
      // 交给 CLI。多行或逗号分隔都收。
      const [changedFiles, setChangedFiles] = React.useState('')
      const [queryLimit, setQueryLimit] = React.useState('20')
      const [results, setResults] = React.useState([])
      const [selected, setSelected] = React.useState(null)
      const [detail, setDetail] = React.useState(null)
      const [error, setError] = React.useState('')
      const [ok, setOk] = React.useState('')
      const [loading, setLoading] = React.useState(false)
      /**
       * 忙碌指示器上那句「在做什么」（`''` = 不显示）。
       *
       * 为什么不能只有一个布尔：索引重建可能跑十分钟，而一句笼统的「加载中…」既让
       * 用户不知道在等什么、也无法判断该不该按「取消」。各动作进入忙碌态时给一句
       * 具体文案（同步中 / 重建索引中 / 搜索中…），由 {@link beginBusy} 统一设置。
       */
      const [busy, setBusy] = React.useState('')
      /**
       * 正在跑的是**哪个动作**（`''` = 没有）。用于让被点的那个按钮自己显示忙碌态。
       *
       * 为什么不能只靠标题行的全局指示器（用户截图实证）：卡片很长，滚到下半部分
       * （搜索与查询 / Agent 集成）时标题行已经移出视野——在那里点「搜索」「影响面」
       * 完全没有反馈。按钮就在手指底下，是唯一「无论滚到哪都看得见」的位置。
       */
      const [busyAction, setBusyAction] = React.useState('')
      const [mcp, setMcp] = React.useState(null)
      // GET /default-path 的索引态：默认项目（= 托管 MCP 的 cwd）是否真是有效索引。
      // 只看 mcp.mode 会把「已对齐一个非项目目录」显示成一切正常。
      const [defaultInfo, setDefaultInfo] = React.useState(null)
      const [settingDefault, setSettingDefault] = React.useState(false)
      // CG21：「重新探测」和「设为默认项目」是两个动作，各自有忙态——共用一个布尔
      // 会把对方一起禁掉（点一个灰另一个）。
      const [reprobing, setReprobing] = React.useState(false)
      // P1-b：诊断包（GET /diagnose 回一段纯文本）。与其它忙态分开：它会读 daemon 日志，
      // 不该把「刷新状态 / 重新探测」一起灰掉。
      const [diagnosing, setDiagnosing] = React.useState(false)
      const [report, setReport] = React.useState('')
      // P1「采纳率仪表」：本会话/本项目里模型用 codegraph 还是用 grep/read。
      const [adoption, setAdoption] = React.useState(null)
      // P2 项目列表：一键切换的候选（宿主侧登记表，只含工作过的目录）。
      const [projects, setProjects] = React.useState([])
      // P2 CLI 面：explore / context 的文本输出（markdown），files / affected 的结构化结果。
      /**
       * 查询结果按**路由分槽**保存（`files` / `affected` / `explore` / `context` 各一格）。
       *
       * 为什么不再用单槽：结果区改成页签后，切回上一个页签必须还能看到那次的结果——
       * 单槽会让「点文件 → 点探索 → 切回文件」变成空白。
       */
      const [outputs, setOutputs] = React.useState({})
      /**
       * 结果区当前显示的页签：`'search'` / `'detail'` / 四个查询路由之一。
       * 由触发它的按钮设置，所以「点哪就跳到哪一页」。
       */
      const [activeTab, setActiveTab] = React.useState('')
      /** 结果区容器：查询完成后若它不在视野里就滚过去（否则「点了看不到」）。 */
      const resultRef = React.useRef(null)
      // P2 遥测提示：上游 CLI 会为 init / index 发匿名用量统计，用户该看得见这件事。
      const [telemetry, setTelemetry] = React.useState(null)
      // 撤销索引是破坏性动作（删 .codegraph/）：与「初始化索引」一样两步确认
      const [confirmUninit, setConfirmUninit] = React.useState(false)
      // CG05：sync / index / init 是可能跑 10 分钟的索引类操作，进行中给出「取消」。
      const [cancelable, setCancelable] = React.useState(false)
      // 「初始化索引」是两步确认：它会**往用户的项目里写 `.codegraph/`**，是本卡片唯一
      // 的写操作。第一次点只改成确认文案，第二次才真的发请求（比 window.confirm 可控，
      // 也不用为一次动作引一套弹窗组件）。
      const [confirmInit, setConfirmInit] = React.useState(false)

      // 当前活动会话的工作目录（随会话切换实时更新；无活动会话时为 ''）。
      const currentCwd = React.useSyncExternalStore(
        (subscribe) => sessionsService.list.subscribe(subscribe),
        activeSessionCwd,
      )

      // 有效路径：手动编辑过就用手动值（清空则回落后端默认）；
      // 未编辑过则跟随当前活动会话的工作目录。
      const effectivePath = path !== '' ? path : (manual ? '' : currentCwd)

      const loadMcpStatus = React.useCallback(async () => {
        try {
          const data = await api('/api/dsh-codegraph/default-path')
          setMcp(data.mcp || null)
          setDefaultInfo({
            defaultPath: typeof data.defaultPath === 'string' ? data.defaultPath : '',
            indexed: data.indexed === true,
            indexState: typeof data.indexState === 'string' ? data.indexState : '',
            // 提示词注入开关（settings 命名空间里的真值）+ CLI 探测结果
            // （undefined = 宿主还没探测完，此时不提示不可用）。
            announceToAgent: data.announceToAgent === true,
            usageGuidance: data.usageGuidance === true,
            cliAvailable: data.cliAvailable,
            // 探测失败的实测原因（ENOENT / 非零退出 / 超时原文）与探测时刻。
            // 有它才能把「常见原因是…」这种猜测换成用户一眼能判断的原文。
            cliProbeError: typeof data.cliProbeError === 'string' ? data.cliProbeError : '',
            cliProbeAt: typeof data.cliProbeAt === 'number' ? data.cliProbeAt : 0,
            command: typeof data.command === 'string' ? data.command : '',
            followSession: data.followSession === true,
            effectivePath: typeof data.effectivePath === 'string' ? data.effectivePath : '',
            sessionPath: typeof data.sessionPath === 'string' ? data.sessionPath : '',
            // P0：MCP 挂载模式。requested = 用户选的，effective = 实际生效的；
            // 两者不等时说明前提不成立（宿主没有 agent 事件面 / 有区块外手工行），
            // 原因由宿主给出，卡片照原样显示——静默退回等于骗用户。
            mcpScope: typeof data.mcpScope === 'string' ? data.mcpScope : 'managed',
            effectiveMcpScope: typeof data.effectiveMcpScope === 'string' ? data.effectiveMcpScope : 'managed',
            mcpScopeReason: typeof data.mcpScopeReason === 'string' ? data.mcpScopeReason : '',
            agentMounts: typeof data.agentMounts === 'number' ? data.agentMounts : 0,
          })
        } catch {
          setMcp(null)
          setDefaultInfo(null)
        }
      }, [])

      /**
       * 进入 / 退出忙碌态。`loading` 管「禁用控件」，`busy` 管「在做什么」——
       * 两个一起动，避免出现「控件灰着但不知道在等什么」或「提示说在忙但按钮还能点」。
       * 文案一律具体到动作（不用笼统的「加载中」）。
       */
      const beginBusy = (label, action) => {
        setLoading(true)
        setBusy(label)
        setBusyAction(action)
      }
      const endBusy = () => {
        setLoading(false)
        setBusy('')
        setBusyAction('')
      }

      /**
       * 按钮内容的忙碌呈现：正在跑的那个动作显示「转圈 + 忙碌文案」，其余保持原样。
       * 局部反馈（这里）与全局指示器（标题行）**都要有**：前者保证「点哪看得见哪」，
       * 后者保证「滚到顶时一眼看到在忙什么」。
       */
      const busyOr = (action, idle, active) => (busyAction === action
        ? jsxs('span', { className: 'cg_btnBusy', children: [jsx('span', { className: 'cg_spinner' }), active] })
        : idle)

      const loadStatus = React.useCallback(async () => {
        beginBusy('读取索引状态…', 'status')
        setError('')
        setOk('')
        try {
          const data = await api('/api/dsh-codegraph/status' + qs({ path: effectivePath }))
          setStatus(data.status || data)
          if (!manual && !currentCwd) setPath(data.path || '')
        } catch (err) {
          setError(err.message)
        } finally {
          endBusy()
        }
      }, [effectivePath, manual, currentCwd])

      /**
       * 取采纳率（P1）。刻意**不**并入 loadStatus：采纳率是宿主侧内存里的累计值，
       * 与目标路径的索引状态是两件事——某个项目未索引也可能有数字（模型在这个目录里
       * 用不用 codegraph），失败不该影响状态面板。
       */
      const loadAdoption = React.useCallback(async () => {
        try {
          const data = await api('/api/dsh-codegraph/metrics' + qs({ path: effectivePath }))
          setAdoption(data && data.summary ? data.summary : null)
        } catch {
          // 采纳率是观测功能：拿不到就不显示，不打扰用户（也不覆盖已有的错误提示）
          setAdoption(null)
        }
      }, [effectivePath])

      /**
       * 拉项目列表（P2）。候选由宿主侧登记表给出——只含「用户真的在这里工作过」的目录
       * （活跃会话 / 跟随上报 / 查过状态的路径），每条现算索引态。
       */
      const loadTelemetry = React.useCallback(async () => {
        try {
          const data = await api('/api/dsh-codegraph/telemetry')
          setTelemetry({ enabled: data.enabled, output: typeof data.output === 'string' ? data.output : '' })
        } catch {
          // 旧版 CLI 没有 telemetry 子命令：不显示这一行，也不打扰用户
          setTelemetry(null)
        }
      }, [])

      const loadProjects = React.useCallback(async () => {
        try {
          const data = await api('/api/dsh-codegraph/projects')
          setProjects(Array.isArray(data.projects) ? data.projects : [])
        } catch {
          // 项目列表是便利功能：拿不到就不显示，不打扰用户
          setProjects([])
        }
      }, [])

      /**
       * 结果出来后，若结果区不在视野里就滚过去。
       *
       * 为什么需要：触发按钮与结果区隔着一段（「文件」在索引维护、结果区在搜索与查询
       * 下方），窄面板 + 展开的诊断包会把结果推到视野外——用户报的「点击文件看不到
       * 对应的列表」正是如此。`block:'nearest'` 的语义是**已经在视野里就不动**，
       * 所以手动切页签时页面不会无故跳动。
       */
      React.useEffect(() => {
        if (activeTab === '') return
        const el = resultRef.current
        // 预览的假 DOM 里 ref.current 恒为 null、节点也没有 scrollIntoView：静默跳过
        if (el === null || el === undefined || typeof el.scrollIntoView !== 'function') return
        try {
          el.scrollIntoView({ block: 'nearest' })
        } catch {
          /* 老浏览器不认参数对象：忽略（不滚也比抛错好） */
        }
      }, [activeTab])

      React.useEffect(() => {
        if (open) {
          loadStatus()
          loadMcpStatus()
          loadAdoption()
          loadProjects()
          loadTelemetry()
        }
      }, [open, loadStatus, loadMcpStatus, loadAdoption, loadProjects, loadTelemetry])

      // 跟随当前项目：打开卡片或切换会话时，若用户未手动编辑过路径，
      // 自动采用当前活动会话的工作目录；手动编辑后停止跟随。
      React.useEffect(() => {
        if (!open || manual) return
        setPath(currentCwd)
      }, [open, manual, currentCwd])

      // 目标路径一换，上一个目录的「确认初始化」就不该还挂着——否则很容易在 A 目录点上
      // 确认、切到 B 目录再点一次，把 B 给初始化了（那正是这个动作最该防的误伤）。
      React.useEffect(() => {
        setConfirmInit(false)
        setConfirmUninit(false)
      }, [effectivePath, open])

      const search = async () => {
        if (!query.trim()) return
        beginBusy('搜索中…', 'search')
        setError('')
        setOk('')
        setSelected(null)
        setDetail(null)
        try {
          const limit = Number(queryLimit)
          const data = await api('/api/dsh-codegraph/query' + qs({
            q: query.trim(),
            path: effectivePath,
            limit: Number.isInteger(limit) && limit > 0 ? String(limit) : '20',
            ...(queryKind.trim() === '' ? {} : { kind: queryKind.trim() }),
          }))
          setResults(Array.isArray(data.results) ? data.results : [])
          setActiveTab('search')
        } catch (err) {
          setError(err.message)
        } finally {
          endBusy()
        }
      }

      const loadSymbol = async (name) => {
        beginBusy('加载符号详情…', 'symbol')
        setError('')
        setOk('')
        // CG16：先清掉上一个符号的详情——标题马上要换成新符号，面板还挂着旧的
        // callers/callees/impact，加载失败时就是张冠李戴（search() 清了，这里漏了）
        setDetail(null)
        setSelected(name)
        setActiveTab('detail')
        try {
          const [node, callers, callees, impact] = await Promise.all([
            api('/api/dsh-codegraph/node' + qs({ name, path: effectivePath })),
            api('/api/dsh-codegraph/callers' + qs({ symbol: name, path: effectivePath })),
            api('/api/dsh-codegraph/callees' + qs({ symbol: name, path: effectivePath })),
            api('/api/dsh-codegraph/impact' + qs({ symbol: name, path: effectivePath, depth: 2 })),
          ])
          setDetail({ node, callers, callees, impact })
        } catch (err) {
          setError(err.message)
        } finally {
          endBusy()
        }
      }

      /**
       * 索引被重建 / 撤销后，之前查的「文件 / 影响面 / 探索 / 上下文」结果就是陈旧的了
       * （它们描述的是旧索引），清掉并把页签退出去——留着会让用户照着旧文件列表做判断。
       * 搜索结果与符号详情不清：那是符号级查询，用户多半还要对照着看。
       */
      const clearIndexResults = () => {
        setOutputs({})
        setActiveTab((current) => (INDEX_RESULT_TABS.includes(current) ? '' : current))
      }

      const runAction = async (action) => {
        // 忙碌文案按动作分派：重建索引可能跑十分钟，用户需要知道在等的是哪件事，
        // 才能判断该不该按旁边的「取消」
        beginBusy({ sync: '同步中…', index: '重建索引中…', unlock: '解锁中…' }[action] || '处理中…', action)
        setError('')
        setOk('')
        // unlock 是秒级操作，不给取消按钮（给了一个点完就消失的「取消」只会让人困惑）
        setCancelable(action === 'sync' || action === 'index')
        // 文案按动作分派；`unlock` 的 CLI 输出在「本来就没锁」时是
        // "No stale lock files found"，原样带出来最诚实
        const successLabel = { sync: '已同步', index: '已重建', unlock: '解锁完成' }[action] || '已完成'
        try {
          const data = await api('/api/dsh-codegraph/' + action, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ path: effectivePath }),
          })
          setOk(successLabel + '：' + (data.output || '').slice(0, 200))
          await loadStatus()
        } catch (err) {
          setError(err.message)
        } finally {
          endBusy()
          setCancelable(false)
        }
      }

      /**
       * 撤销索引（P2）：删除 `.codegraph/`。与 init 反向，是本卡片第二个破坏性动作，
       * 所以同样两步确认；目标路径一换就重置确认态（同 init 的理由：避免在 A 目录
       * 点上确认、切到 B 再点一次，把 B 给删了）。
       */
      const runUninit = async () => {
        if (!confirmUninit) {
          setConfirmUninit(true)
          setError('')
          setOk('')
          clearIndexResults()
          return
        }
        setConfirmUninit(false)
        beginBusy('撤销索引中…', 'uninit')
        setError('')
        setOk('')
        setCancelable(true)
        try {
          const data = await api('/api/dsh-codegraph/uninit', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ path: effectivePath }),
          })
          setOk('已撤销 ' + (data.path || effectivePath) + ' 的索引（.codegraph/ 已删除，源文件未动）：' + (data.output || '').slice(0, 160))
          setStatus(null)
          clearIndexResults()
          await Promise.all([loadStatus(), loadMcpStatus(), loadProjects()])
        } catch (err) {
          setError(err.message)
        } finally {
          endBusy()
          setCancelable(false)
        }
      }

      /** 把「改动文件」输入解析成数组（逗号 / 换行 / 空格分隔都收，去重去空）。 */
      const manualFiles = () => {
        const seen = new Set()
        for (const piece of changedFiles.split(/[\n,]/)) {
          const value = piece.trim()
          if (value !== '') seen.add(value)
        }
        return [...seen]
      }

      /**
       * 跑一个只读文本/结构化命令（P2）：files / affected / explore / context。
       * 与 runAction 分开是因为它们**不改状态**，只需展示输出，不该触发 loadStatus。
       */
      const runQuery = async (route, params = {}) => {
        beginBusy({ files: '读取文件结构…', affected: '分析影响面…', explore: '探索中…', context: '组装上下文…' }[route] || '查询中…', route)
        setError('')
        setOk('')
        try {
          const data = await api('/api/dsh-codegraph/' + route + qs({ path: effectivePath, ...params }))
          // explore / context 回 markdown 文本；files / affected 回结构化数组。
          // 按路由分槽保存，切页签回来还在（见 outputs 的注释）。
          setOutputs((previous) => ({
            ...previous,
            [route]: {
              route,
              text: typeof data.output === 'string' ? data.output : '',
              json: data.files ?? data.affected ?? null,
              raw: typeof data.raw === 'string' ? data.raw : '',
            },
          }))
          setActiveTab(route)
          if (data.files !== undefined && (!Array.isArray(data.files) || data.files.length === 0)) {
            setOk('索引里没有匹配的文件')
          }
        } catch (err) {
          setError(err.message)
        } finally {
          endBusy()
        }
      }

      /** 取消进行中的 sync / index / init（CG05：以前关标签页都止不住 10 分钟的 index）。 */
      const cancelRun = async () => {
        setError('')
        try {
          await api('/api/dsh-codegraph/cancel', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ path: effectivePath }),
          })
          setOk('已发送取消请求：CLI 进程正在被终止（SIGTERM，3s 后强制）。')
        } catch (err) {
          setError(err.message)
        }
      }

      /**
       * 在未初始化的项目里跑 `codegraph init`（建 `.codegraph/` + 首次索引）。
       *
       * 为什么需要它：`codegraph index` / `sync` 都要求项目**已经** init 过——对干净目录
       * 直接报 `CodeGraph not initialized in <path>` / `Run "codegraph init" first`
       * （`index --help` 那句「same result as a fresh init」说的是全量重建的结果，不是
       * 「index 会替你初始化」）。没有这个按钮，本卡片是唯一还要把用户赶回终端的一步；
       * 而 MCP 托管行也只在目标已是有效索引时才写，新项目等于整块功能不可用。
       */
      const runInit = async () => {
        if (!confirmInit) {
          setConfirmInit(true)
          setError('')
          setOk('')
          return
        }
        setConfirmInit(false)
        beginBusy('初始化索引中…', 'init')
        setError('')
        setOk('')
        setCancelable(true)
        try {
          const data = await api('/api/dsh-codegraph/init', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ path: effectivePath }),
          })
          setOk('已初始化并建立索引：' + (data.output || '').slice(0, 200))
          clearIndexResults()
          await loadStatus()
          // 索引态变了 → MCP 托管行的决策也跟着变，必须重新取一次
          await loadMcpStatus()
        } catch (err) {
          setError(err.message)
        } finally {
          endBusy()
          setCancelable(false)
        }
      }

      // 把当前有效路径设为默认项目：宿主会持久化并热切换 codegraph MCP 服务器
      const setDefaultProject = async () => {
        if (!effectivePath) return
        setSettingDefault(true)
        setError('')
        setOk('')
        try {
          const data = await api('/api/dsh-codegraph/default-path', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ path: effectivePath }),
          })
          setMcp(data.mcp || null)
          setOk('已把默认项目切到 ' + (data.defaultPath || effectivePath) + (data.persisted === false ? '（本次会话内生效）' : '') + '，并关闭「跟随当前项目」；codegraph MCP 服务器将热切换。')
          await loadMcpStatus()
        } catch (err) {
          setError(err.message)
        } finally {
          setSettingDefault(false)
        }
      }

      /**
       * 切到某个项目：复用「设为默认项目」那条链路（它会持久化 defaultPath 并关掉跟随、
       * 热切换 MCP 服务器）。与点「设为默认项目」的区别只是路径来自列表而不是输入框。
       */
      const switchProject = async (target) => {
        if (!target) return
        setSettingDefault(true)
        setError('')
        setOk('')
        try {
          const data = await api('/api/dsh-codegraph/default-path', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ path: target }),
          })
          // 切完把输入框也同步过去，否则卡片上「正在看的路径」还是旧的那个
          setManual(true)
          setPath(target)
          setMcp(data.mcp || null)
          setOk('已切换到 ' + (data.defaultPath || target) + '，并关闭「跟随当前项目」；codegraph MCP 服务器将热切换。')
          await Promise.all([loadMcpStatus(), loadProjects()])
        } catch (err) {
          setError(err.message)
        } finally {
          setSettingDefault(false)
        }
      }

      // 提示词注入开关：写 settings 命名空间（宿主即时增删 systemPrompt section，
      // 不需要重启）；CLI 探测失败时禁用——那时候两段本来就不会注入。
      const toggleSetting = async (key, value) => {
        setError('')
        setOk('')
        try {
          await api('/api/dsh-codegraph/settings', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ [key]: value }),
          })
          await loadMcpStatus()
          setOk({
            announceToAgent: '能力公告已更新',
            usageGuidance: '使用指引已更新',
            followSession: value ? '已开启跟随当前项目' : '已关闭跟随，托管行使用默认项目',
            mcpScope: value === 'per-agent'
              ? '已切到 per-agent：新会话将各挂一个独立的 MCP 进程（已开的会话也会补挂）'
              : '已切回 managed：全局托管行已恢复，per-agent 挂载已回收',
          }[key] || '设置已更新')
        } catch (err) {
          setError(err.message)
          await loadMcpStatus()
        }
      }

      /**
       * 重新探测 CLI。为什么必须是一个显式动作：探测结果原先是挂载时锁存的一个布尔，
       * 刷新卡片只是再读一次同一个缓存——那句「刷新本卡片重试」在服务端不可能生效。
       * 现在它真的会重跑 `<command> --version`，并把实测原因（含失败原文）取回来。
       * 忙态独立于「设为默认项目」（CG21：共用一个布尔会互相禁用）。
       */
      const reprobe = async () => {
        setReprobing(true)
        setError('')
        setOk('')
        try {
          const data = await api('/api/dsh-codegraph/reprobe', { method: 'POST' })
          await loadMcpStatus()
          setOk(data.cliAvailable === true
            ? '重新探测成功：CLI 可用，systemPrompt 两段已注入。'
            : '重新探测完成：CLI 仍不可用，原因见下方。')
        } catch (err) {
          setError(err.message)
          await loadMcpStatus()
        } finally {
          setReprobing(false)
        }
      }

      /**
       * 拉诊断包（P1-b）。为什么值得做成按钮：这个插件的故障几乎全是环境性的——
       * PATH 里没有 CLI、`~/.codegraph` 被当成项目索引、托管行 cwd 被删、一次被强杀的
       * index 留下坏锁、daemon 登记的是另一个版本。以前这些要用户从四五个地方凑原文，
       * 而排查者最需要的就是那几段原文。结果是一整段纯文本，直接复制即可。
       */
      const loadReport = async () => {
        setDiagnosing(true)
        setError('')
        setOk('')
        try {
          const data = await api('/api/dsh-codegraph/diagnose' + qs({ path: effectivePath }))
          setReport(typeof data.report === 'string' ? data.report : '')
        } catch (err) {
          setError(err.message)
        } finally {
          setDiagnosing(false)
        }
      }

      /** 复制诊断包到剪贴板：优先 Clipboard API，不可用（非安全上下文）时退回选中文本。 */
      const copyReport = async () => {
        setError('')
        try {
          const clipboard = typeof navigator !== 'undefined' ? navigator.clipboard : undefined
          if (clipboard && typeof clipboard.writeText === 'function') {
            await clipboard.writeText(report)
            setOk('诊断包已复制到剪贴板。')
            return
          }
          throw new Error('当前环境没有 navigator.clipboard（非安全上下文？）')
        } catch (err) {
          // 退回「让用户自己按 Ctrl/Cmd+C」：把一个可展开的 pre 放在眼前，比一句
          // 「复制失败」有用——文本已经拿到了，差的只是一次系统级操作。
          setOk('自动复制不可用（' + err.message + '）：诊断包已展开在下方，手动全选复制即可。')
        }
      }

      const mcpText = React.useMemo(() => {
        if (!mcp) return 'MCP：状态未知'
        // 所有模式都带上宿主给的 note：未索引 / 手工行 / 联动关闭这些「没有托管」的
        // 情况必须说出来，否则「已对齐 cwd」看起来像一切正常。
        const note = mcp.note ? ' · ' + mcp.note : ''
        const following = defaultInfo && defaultInfo.followSession && defaultInfo.sessionPath && defaultInfo.sessionPath !== defaultInfo.defaultPath
          ? ' · 跟随会话 ' + defaultInfo.sessionPath
          : ''
        // CG12：项目被删 / uninit 后坏行会一直留在 cordis.patch.yml 里（没有 fs.watch），
        // 卡片至少要把「cwd 目录已经不在了」说出来。
        const deadCwd = mcp.cwdExists === false ? ' · ⚠ cwd 目录已不存在' : ''
        if (mcp.mode === 'own') return 'MCP：已托管（本插件维护工作目录）· cwd ' + (mcp.cwd || '(未设置)') + (mcp.disabled ? ' · 已停用' : '') + deadCwd + following + note
        if (mcp.mode === 'dsh-mcp') return 'MCP：已对齐 MCP 卡片里的行 · cwd ' + (mcp.cwd || '(未设置)') + (mcp.disabled ? ' · 已停用' : '') + deadCwd + following + note
        if (mcp.mode === 'external') return 'MCP：检测到手工配置行，插件不接管'
        return 'MCP：' + (mcp.note || '未托管')
      }, [mcp, defaultInfo])

      // 托管行实际用的目录不是有效索引时必须点名：MCP 服务器以它为 cwd，未加载项目时
      // codegraph_* 工具会要求显式传 projectPath（家目录最常见——~/.codegraph 是
      // codegraph CLI 自己的安装目录，插件不认它之后这里就会报警）。
      const defaultWarning = React.useMemo(() => {
        if (!defaultInfo || defaultInfo.indexed) return ''
        const why = defaultInfo.indexState === 'not-a-project'
          ? '它的 .codegraph/ 里没有索引库，不是 codegraph 项目（家目录最常见：~/.codegraph 是 CLI 自身的安装目录）'
          : '它没有 .codegraph/ 索引'
        const shown = defaultInfo.effectivePath || defaultInfo.defaultPath || '(未设置)'
        const source = defaultInfo.followSession && defaultInfo.sessionPath === shown
          ? '（来自当前会话）'
          : '（来自默认项目）'
        const fix = status && status.initialized === true && effectivePath && effectivePath !== shown
          ? '当前路径 ' + effectivePath + ' 已是有效索引，点「设为默认项目」即可修复。'
          // 注意这里谈的是**托管行用的那个目录**（shown），它未必等于下面你正在看的路径；
          // 所以只给不依赖「当前路径」的说法，别让人以为点卡片上的按钮就能修它。
          : '把默认项目切到已索引目录即可自动挂载（也可以直接在该目录里运行 `codegraph init` 建索引）。'
        return '⚠ 托管行用的目录 ' + shown + source + ' 不是有效索引：' + why + '。未加载项目的 codegraph_* 工具需要显式传 projectPath；' + fix
      }, [defaultInfo, status, effectivePath])

      const cliWarning = defaultInfo && defaultInfo.cliAvailable === false
        ? '⚠ 探测不到可执行的 CLI 命令 ' + (defaultInfo.command || 'codegraph') + '（`--version` 失败）：systemPrompt 的能力公告与使用指引都不会注入，卡片里的状态 / 搜索 / sync / 重建索引也会报错。'
          + '\n修法二选一：① 把插件配置里的 command 写成该 CLI 的绝对路径（改 profile 补丁会触发热重载并重新探测）；② 从新开的终端重启宿主，让新的环境块生效。'
          + '注意：宿主进程的 PATH 在它启动时就固定了，刷新页面 / 重开卡片都不会改变它——改完上面任一项后，点「重新探测」即可就地确认，不必重启宿主。'
        : ''

      /** 某个页签有没有内容（决定它是否出现在页签栏里）。 */
      const hasResultTab = (key) => (key === 'search'
        ? results.length > 0
        : key === 'detail'
          ? selected !== null
          : outputs[key] !== undefined)

      /**
       * 结果区可见的页签 = **有内容的那些** + 当前活动那个。
       *
       * 为什么把 activeTab 也算进来：查询返回空结果时该页签没有内容，但用户刚点了
       * 它——这时候页签栏不能整个消失（否则「点了没反应」），要让他看到
       * 「没有匹配的符号」这种明确的空态。
       */
      const resultTabs = RESULT_TABS.filter((tab) => hasResultTab(tab.key) || tab.key === activeTab)

      /**
       * 忙碌指示器文案。`loading` 的文案由各动作经 beginBusy 给出；「重新探测」与
       * 「收集诊断包」有自己的忙态布尔（CG21：两个动作各有忙态，共用一个会把对方
       * 一起禁掉），文案在这里补上，好让标题行统一显示「在做什么」。
       */
      const busyText = loading
        ? (busy || '处理中…')
        : reprobing
          ? '重新探测 CLI…'
          : diagnosing
            ? '收集诊断信息…'
            : ''

      /** 探测失败的实测原文：ENOENT / 非零退出 / 超时三种情况靠它区分。 */
      const cliProbeDetail = defaultInfo && defaultInfo.cliAvailable === false && defaultInfo.cliProbeError
        ? '实测原因：' + defaultInfo.cliProbeError
          + (defaultInfo.cliProbeAt ? '\n上次探测：' + new Date(defaultInfo.cliProbeAt).toLocaleTimeString() : '')
        : ''

      // 状态区：能识别的 status 形状就铺成网格，否则回落到原始文本（CLI 报错时 status 可能是 {raw}）
      const statusIsStructured = status !== null && typeof status === 'object' && typeof status.initialized === 'boolean'
      const statusRawText = status
        ? JSON.stringify(status, null, 2)
        : ''

      /** callers / callees / impact 取列表（形状随 CLI 版本可能稍有差异，取不到就当空）。 */
      const relItems = (value, key) => {
        const list = value && value[key]
        return Array.isArray(list) ? list : []
      }

      if (view === 'summary') {
        return '代码图谱：索引状态、符号搜索、探索/上下文、影响面分析、一键 sync/index。'
      }

      // page 视图：新页面自己画标题/图标/面包屑，这里只交表单本体，不渲染卡片头。
      return jsxs(pageView ? 'div' : 'li', {
        className: pageView ? 'cg_pageHost' : (open ? 'cg_pluginCard cg_pluginCardOpen' : 'cg_pluginCard'),
        children: [
          pageView ? null : jsxs('button', {
            type: 'button',
            className: 'cg_cardHeader',
            'aria-expanded': open,
            onClick: () => setOpen((current) => !current),
            children: [
              jsxs('span', {
                className: 'cg_cardHeadText',
                children: [
                  jsx('span', { className: 'cg_cardName', children: 'Codegraph' }),
                  jsx('span', { className: 'cg_cardDescription', children: '代码图谱：索引状态、符号搜索、callers/callees/impact、一键 sync/index。' }),
                ],
              }),
              jsx('span', { className: 'dshkit_badge', children: 'Kit' }),
              jsx('svg', {
                width: '14',
                height: '14',
                viewBox: '0 0 14 14',
                fill: 'none',
                xmlns: 'http://www.w3.org/2000/svg',
                className: 'cg_chevron',
                children: jsx('path', { d: CHEVRON_PATH, fill: 'currentColor' }),
              }),
            ],
          }),
          (pageView || open) ? jsx('div', {
            className: 'cg_cardBody',
            children: jsxs('div', {
              className: 'cg_panel',
              children: [
                // 面板标题行：标题 + 忙碌指示器（+ 取消）。这是**全局**指示器。
                //
                // 分工（两级反馈都要有）：
                //   - **按钮自己**（busyOr）负责「点哪看得见哪」——卡片很长，滚到下半部分
                //     时标题行已移出视野，那时点「搜索 / 影响面」只有按钮上的反馈看得见；
                //   - **这里**负责「滚到顶时一眼看到在忙什么」，以及承载「取消」。
                //
                // 这里也替代了原先正文中间那句**居中大块**的「加载中…」（padding:24px 12px）：
                // 它既不说在加载什么、又把下面整组控件上下推（布局跳动，用户截图实证）。
                jsxs('div', {
                  className: 'cg_panelHeader',
                  children: [
                    jsx('span', { className: 'cg_panelTitle', children: 'Codegraph 控制台' }),
                    busyText !== ''
                      ? jsxs('span', {
                        className: 'cg_busy',
                        // 屏幕阅读器：进度文案变化时播报（视觉上转圈，非视觉上靠这句）
                        'aria-live': 'polite',
                        children: [
                          jsx('span', { className: 'cg_spinner' }),
                          jsx('span', { children: busyText }),
                          // 「取消」紧挨着它要停的那件事。原先它在危险行里，与进度提示
                          // 之间隔着用量统计——真要取消时找不到。
                          cancelable && loading
                            ? jsx('button', {
                              type: 'button',
                              className: 'cg_btnGhost',
                              title: '终止正在跑的 codegraph CLI（SIGTERM，3s 后整组 SIGKILL）',
                              onClick: cancelRun,
                              children: '取消',
                            })
                            : null,
                        ],
                      })
                      : null,
                  ],
                }),
                // ── 目标项目 ──「在看哪个目录 / 设默认 / 托管行状态 / 见过哪些项目」
                // 收进同一组。此前路径输入框在面板第二行、「设为默认项目」孤悬在查询
                // 参数之后（截图实证：按钮和它作用的路径隔了两屏），托管行文案又挂在
                // 按钮后面——三件事散在三处，现在自上而下是一条「我在看哪个项目」的动线。
                group('目标项目', [
                  jsxs('div', {
                    className: 'cg_row',
                    children: [
                      jsx('input', {
                        className: 'cg_input',
                        placeholder: '项目路径（留空使用默认）',
                        value: path,
                        onChange: (event) => {
                          const value = event.target.value
                          setManual(value !== '')
                          setPath(value)
                        },
                      }),
                      jsx('button', {
                        type: 'button',
                        className: 'cg_btnGhost',
                        disabled: settingDefault || loading || !effectivePath,
                        title: '把当前路径持久化为默认项目（同时关闭「跟随当前项目」，避免被会话切换顶掉），codegraph MCP 服务器的工作目录随之热切换',
                        onClick: setDefaultProject,
                        children: settingDefault ? '切换中…' : '设为默认项目',
                      }),
                    ],
                  }),
                  jsx('span', { className: 'cg_mcpMeta', children: mcpText }),
                  // P2 项目列表：一台 MCP 服务器同一时刻只挂一个项目，所以「换项目」是
                  // 高频动作；以前只能手敲绝对路径。只列「用户真在这里工作过」的目录
                  // （活跃会话 / 跟随上报 / 查过状态），不做全盘扫描。
                  // 未索引的也列出来并标灰——用户会想知道「这个项目还没索引」，但它不能
                  // 作为切换目标（切换要求有效索引），所以按钮禁用而不是隐藏。
                  projects.length > 0
                    ? jsxs('div', {
                      className: 'cg_projects',
                      children: [
                        jsx('span', { className: 'cg_projectsLabel', children: '已见项目' }),
                        ...projects.map((item) => jsx('button', {
                          type: 'button',
                          key: 'cg-project-' + item.path,
                          className: 'cg_projectBtn',
                          disabled: settingDefault || !item.indexed || item.path === effectivePath,
                          title: item.indexed
                            ? item.path + '（' + seenAgoText(item.seenAgoMs) + '见过，来自' + item.via + '）'
                            : item.path + '：未索引，切换无效——先在该目录跑 codegraph init（' + item.via + '）',
                          onClick: () => switchProject(item.path),
                          children: shortPath(item.path) + (item.indexed ? '' : ' · 未索引'),
                        })),
                      ],
                    })
                    : null,
                ]),
                // ── 索引状态（UX 重构：状态先于操作）── 原先这组在面板最底部：打开卡片要
                // 先越过两行输入框和 9 个按钮才知道「这个目录索引健不健康」。卡片回答的
                // 第一个问题应该是「现在状态如何」，所以它紧跟目标项目；紧接着的索引维护
                // 组就是「看到问题 → 修复它」的那一排按钮（过期警告与「重建索引」上下相邻）。
                // 本组**无条件渲染**（即使还没拿到数据）：「刷新」按钮挂在这个组的组头，
                // 若整组随 status 一起消失，读取失败时用户就没有就地重试的入口了。
                group('索引状态', status === null
                  ? [jsx('p', { className: 'cg_mcpMeta', children: '还没读取到索引状态。' })]
                  : statusIsStructured
                    ? [
                        jsx('div', { className: 'cg_grid', children: statusCells(status) }),
                        // CG11：CLI 明说「建议重建」时不能只报「● 已索引」——MCP 这时给的是旧图。
                        // 实测补一句「Sync 修不了它」：codegraph 1.6.0 的 `sync` 对「提取器版本
                        // 落后」这类过期返回 Already up to date 且不清除信号，只有「重建索引」能修。
                        // 以前文案只说「点重建索引可修复」，用户很可能先点 Sync 然后发现没用。
                        staleReasons(status).length > 0
                          ? jsx('p', {
                            className: 'cg_warn',
                            children: '⚠ 索引可能过期：' + staleReasons(status).join('；')
                              + '。MCP 工具此刻给的是旧提取器产出的图——点「重建索引」修复（实测此时 Sync 会报 Already up to date 且不解决问题）。',
                          })
                          : null,
                        status.initialized === false
                          ? jsx('p', { className: 'cg_mcpMeta', children: '该目录还没有索引：点下方「初始化索引」即可在本目录跑一次 `codegraph init`（只创建 .codegraph/，源文件不动；可用 `codegraph uninit` 撤销）。' })
                          : null,
                        statusRawText !== ''
                          ? jsxs('details', {
                            className: 'cg_details',
                            children: [
                              jsx('summary', { children: '原始 JSON（status --json）' }),
                              jsx('pre', { className: 'cg_pre', children: statusRawText }),
                            ],
                          })
                          : null,
                      ]
                    : [jsx('pre', { className: 'cg_pre', children: statusRawText })], jsx('button', {
                  type: 'button',
                  className: 'cg_iconBtn',
                  disabled: loading,
                  // 只有**本动作**在跑时才转（busyAction），不是任何动作都转
                  'data-busy': busyAction === 'status' ? '1' : undefined,
                  'aria-label': busyAction === 'status' ? '正在读取索引状态' : '刷新索引状态',
                  title: busyAction === 'status'
                    ? '正在读取索引状态…'
                    : '重新读取 `codegraph status --json`，刷新本组的索引状态（不会重建索引）',
                  onClick: loadStatus,
                  children: jsx('svg', {
                    width: '14',
                    height: '14',
                    viewBox: '0 0 24 24',
                    fill: 'none',
                    xmlns: 'http://www.w3.org/2000/svg',
                    'aria-hidden': 'true',
                    children: jsx('path', { d: REFRESH_PATH, fill: 'currentColor' }),
                  }),
                })),
                // ── 索引维护（UX 重构：贴着索引状态，按钮分三层）──
                // 原先把 9 个按钮无层级地铺在一行里：每天点的 Sync、排障用的诊断包、罕见的
                // 解锁、破坏性的撤销索引完全同样式混排（用户看到的「乱」主要在这里）。
                // 现在按「动作性质」分三行并给 Sync 主按钮样式：
                //   生命周期（会写索引）→ 查看与诊断（只读）→ 危险（删数据，视觉隔开）。
                group('索引维护', [
                  // 生命周期：改索引的动作。Sync 是这张卡片最高频的安全操作，给主按钮样式
                  // 做视觉锚点；「初始化索引」在未索引时是唯一主操作，排在最前（判定见下）。
                  jsx('div', { className: 'cg_rowLabel', children: '生命周期' }),
                  // 按钮要包一层 .cg_toolbarBtns 行容器：group 本体是纵向 flex（分组头 +
                  // 内容自上而下），按钮直接塞进去会被拉成一条条通栏；包一行容器才能
                  // 左对齐横向排布、放不下再折行。
                  jsxs('div', {
                    className: 'cg_toolbarBtns',
                    children: [
                      // 只有「用户正看着的这个目录还不是有效索引」时才出现。放在最前面：
                      // 那种情况下它就是这张卡片的主操作。
                      //
                      // 判定必须用 `status.initialized === false`（= /status?path=<本卡片路径>），
                      // **不能**用 `defaultInfo.indexed`：那个来自 /default-path，走的是后端的
                      // effectiveProjectPath——「跟随当前项目」开着、而会话目录未索引时，它会回落到
                      // **默认项目**，于是回一个 `indexed: true`（默认项目往往正是某个已索引的仓库），
                      // 按钮就永远不出现。两个口径在这个场景下必然分叉，这里跟底部那句文案
                      // （同一个条件）保持一致。
                      status && status.initialized === false
                        ? jsx('button', {
                          type: 'button',
                          className: confirmInit ? 'cg_btnDanger' : 'cg_btnGhost',
                          disabled: loading,
                          title: confirmInit
                            ? '再点一次即在 ' + (effectivePath || '(默认项目)') + ' 里创建 .codegraph/ 并建立首次索引'
                            : 'codegraph index / sync 都要求项目先初始化过（干净目录会报 “CodeGraph not initialized”）。这个按钮在该目录跑一次 `codegraph init`。',
                          onClick: runInit,
                          children: busyOr('init', confirmInit ? '确认初始化？' : '初始化索引', '初始化中…'),
                        })
                        : null,
                      jsx('button', {
                        type: 'button',
                        className: 'cg_btn',
                        disabled: loading,
                        title: 'codegraph sync：增量同步索引（只更新改动的部分；全量重建用右边的「重建索引」）',
                        onClick: () => runAction('sync'),
                        children: busyOr('sync', 'Sync', '同步中…'),
                      }),
                      jsx('button', {
                        type: 'button',
                        className: 'cg_btnGhost',
                        disabled: loading,
                        onClick: () => runAction('index'),
                        children: busyOr('index', '重建索引', '重建中…'),
                      }),
                      // 清陈旧锁：一次被强杀的 index 留下的 codegraph.lock 会挡住后续
                      // **所有**索引操作，而在此之前卡片没有任何入口（只能去终端）。
                      // CLI 侧幂等（没锁时 exit 0），所以不需要二次确认。
                      jsx('button', {
                        type: 'button',
                        className: 'cg_btnGhost',
                        disabled: loading,
                        title: 'codegraph unlock：清掉挡住索引的陈旧锁文件（索引被强杀后常见）。没锁时什么也不做',
                        onClick: () => runAction('unlock'),
                        children: busyOr('unlock', '解锁', '解锁中…'),
                      }),
                      // 撤销索引（唯一的删除类动作）接在生命周期行尾，用**竖向虚线**与
                      // 常规按钮隔开。
                      //
                      // 为什么不再单独占一行：上一版把它放进独立的 .cg_dangerRow，结果是
                      // 「一个按钮 + 上方虚线 + 右侧大片空白」——用户直接问「为什么单独换行」，
                      // 看起来像换行 bug 而不是有意的安全标记。而它**本来就是生命周期动作**
                      // （写索引，与 Sync/重建/解锁同一档），不该另起一档。
                      //
                      // 安全上真正的防线是**两步确认**（第一次点击只进入红色确认态，
                      // 单次误点删不掉任何东西）；视觉分隔只提供边际收益，不值得一整行。
                      status && status.initialized === true
                        ? jsx('span', {
                          className: 'cg_dangerSlot',
                          children: jsx('button', {
                            type: 'button',
                            className: confirmUninit ? 'cg_btnDanger' : 'cg_btnGhost',
                            disabled: loading,
                            title: confirmUninit
                              ? '再点一次即删除 ' + (effectivePath || '(默认项目)') + ' 的 .codegraph/（索引数据全部丢失，源文件不动）'
                              : 'codegraph uninit：删除该项目的 .codegraph/（索引数据全部丢失，源文件不动）。这是本卡片唯一的删除类动作',
                            onClick: runUninit,
                            children: busyOr('uninit', confirmUninit ? '确认撤销？' : '撤销索引', '撤销中…'),
                          }),
                        })
                        : null,
                    ],
                  }),
                  // 查看与诊断：只读动作（刷新卡片数据 / 重新探测 CLI / 看文件结构 / 收诊断包）。
                  // 与「会写索引」的按钮分开，扫一眼就知道这排不会改任何东西。
                  jsx('div', { className: 'cg_rowLabel', children: '查看与诊断' }),
                  jsxs('div', {
                    className: 'cg_toolbarBtns',
                    children: [
                      jsx('button', {
                        type: 'button',
                        className: 'cg_btnGhost',
                        disabled: reprobing,
                        title: '重跑一次 `<command> --version`：CLI 是后装的、或 command 改成了绝对路径时，无需重启宿主即可恢复',
                        onClick: reprobe,
                        children: reprobing ? '探测中…' : '重新探测',
                      }),
                      // 一键诊断包（P1-b）：把 PATH / 托管行 / 索引 / daemon / 最近失败
                      // 的原文一次收齐，供排障与贴 issue。它是**只读**动作，排在危险动作之前；
                      // 此前排在「撤销索引」之后、紧邻「取消」，语义上是错位的。
                      jsx('button', {
                        type: 'button',
                        className: 'cg_btnGhost',
                        disabled: diagnosing,
                        title: '收集一段可直接复制的诊断文本：CLI 探测实测原文、托管行与补丁区块（值已脱敏）、索引状态、codegraph daemon 与日志尾、最近一次 CLI 失败',
                        onClick: loadReport,
                        children: diagnosing ? '收集中…' : '诊断包',
                      }),
                    ],
                  }),
                  // P2 遥测提示：`init` / `index` 会触发上游的匿名用量统计。只如实转达 CLI 的
                  // 状态并指出关闭方式，**不给开关**——那是用户的全局偏好，存在
                  // ~/.codegraph/telemetry.json，插件替他翻等于越权改别人的全局设置。
                  telemetry !== null
                    ? jsx('p', {
                      className: 'cg_mcpMeta',
                      children: telemetry.enabled === true
                        ? '匿名用量统计：已开启（init / 重建索引会向上游发送匿名用量数据）。要关掉运行 `codegraph telemetry off`，或设 CODEGRAPH_TELEMETRY=0。'
                        : telemetry.enabled === false
                          ? '匿名用量统计：已关闭。'
                          : '匿名用量统计：状态未知（CLI 输出未含可识别的状态行）。',
                    })
                    : null,
                ]),
                // 动作反馈（加载 / 出错 / 成功 / 诊断包）：紧跟索引维护组——大部分按钮在
                // 这里，反馈落在按键下方最近的位置；来自搜索的报错也汇到同一条反馈区。
                error ? jsx('p', { className: 'cg_error', children: error }) : null,
                ok ? jsx('p', { className: 'cg_ok', children: ok }) : null,
                // 诊断包（P1-b）：**默认折叠** + 复制按钮。它很长（补丁区块 + daemon 日志尾，
                // 上限 260px），自动展开会把下方的「搜索与查询 / 结果区」整块推远——用户
                // 反馈的「文件与结果太割裂」里，这一块正是中间那道墙。摘要行本身（含「复制」）
                // 出现就是「已生成」的反馈，要看内容点一下即可。
                report !== ''
                  ? jsxs('details', {
                    className: 'cg_details',
                    children: [
                      jsxs('summary', {
                        children: [
                          '诊断包（可整段复制贴 issue）',
                          jsx('button', {
                            type: 'button',
                            className: 'cg_btnGhost',
                            style: { marginLeft: '8px' },
                            onClick: (event) => {
                              // details 的 summary 上放按钮：不拦住冒泡的话点「复制」
                              // 会顺带把这块折叠起来
                              event.preventDefault()
                              event.stopPropagation()
                              copyReport()
                            },
                            children: '复制',
                          }),
                        ],
                      }),
                      jsx('pre', { className: 'cg_pre', children: report }),
                    ],
                  })
                  : null,
                // ── 搜索与查询（UX 重构：拆两个工作流）──
                // 「搜索 / 探索 / 上下文」是符号查询（吃同一个关键词），「改动文件 + 影响面」
                // 是「改动 → 受影响测试」的另一个工作流——原先两者混在一行参数里，
                // 看起来像一回事。现在符号查询在上、「改动影响」单列一行小标题。
                group('搜索与查询', [
                  jsx('div', {
                    className: 'cg_row',
                    children: [
                      jsx('input', {
                        className: 'cg_input',
                        placeholder: '搜索符号，例如 definePlugin',
                        value: query,
                        onChange: (event) => setQuery(event.target.value),
                        onKeyDown: (event) => { if (event.key === 'Enter') search() },
                      }),
                      jsx('button', {
                        type: 'button',
                        className: 'cg_btn',
                        disabled: loading || !query.trim(),
                        onClick: search,
                        children: busyOr('search', '搜索', '搜索中…'),
                      }),
                      // explore / context 与「搜索」共用 query，语义上是一组（见上）。
                      jsx('button', {
                        type: 'button',
                        className: 'cg_btnGhost',
                        disabled: loading || !query.trim(),
                        title: 'codegraph explore：与 MCP 的 codegraph_explore 同输出（相关符号源码 + 调用路径）。用左侧搜索框里的关键词',
                        onClick: () => runQuery('explore', { q: query.trim() }),
                        children: busyOr('explore', '探索', '探索中…'),
                      }),
                      jsx('button', {
                        type: 'button',
                        className: 'cg_btnGhost',
                        disabled: loading || !query.trim(),
                        title: 'codegraph context：为一个任务组装上下文（相关符号 + 关系 + 代码块）。用左侧搜索框里的关键词',
                        onClick: () => runQuery('context', { q: query.trim() }),
                        children: busyOr('context', '上下文', '组装中…'),
                      }),
                      // kind / limit 是 query 的 -k/-l：贴着它们作用的搜索，不另起一行。
                      jsx('label', {
                        className: 'cg_opt',
                        title: 'codegraph query -k/--kind：按节点类型过滤（function / class / method / interface / type_alias / constant / variable / property / file / import）',
                        children: [
                          '类型',
                          jsx('input', {
                            className: 'cg_input cg_inputSm',
                            placeholder: '任意（function…）',
                            value: queryKind,
                            onChange: (event) => setQueryKind(event.target.value),
                            onKeyDown: (event) => { if (event.key === 'Enter') search() },
                          }),
                        ],
                      }),
                      jsx('label', {
                        className: 'cg_opt',
                        title: 'codegraph query -l/--limit：返回条数上限（默认 20）。callers/callees 也吃这个值',
                        children: [
                          '上限',
                          jsx('input', {
                            className: 'cg_input cg_inputXs',
                            value: queryLimit,
                            onChange: (event) => setQueryLimit(event.target.value),
                            onKeyDown: (event) => { if (event.key === 'Enter') search() },
                          }),
                        ],
                      }),
                    ],
                  }),
                  // 其他查询：**不用搜索框关键词**的几种查询。与上面那行分开是因为它们的
                  // 心智不同（上面是「拿关键词查符号」），混在一起会让人以为「文件」也吃关键词。
                  //
                  // 「文件」原先在「查看与诊断」里，与它的结果分居两处——用户直接问
                  // 「上面的文件和下面的搜索是一个东西吗，现在太割裂了」。按钮和它产生的
                  // 结果必须挨着：结果区（页签）就在本组下方，所以它属于这一组。
                  //
                  // 「改动文件 / 影响面」：插件刻意不自己去猜改动列表（不读 git status、
                  // 不猜编辑器状态），所以需要用户手填；「影响面」吃左边这份列表，
                  // 依赖关系贴着输入框一眼可见。窄栏下自动折行。
                  jsx('div', { className: 'cg_rowLabel', children: '其他查询' }),
                  jsxs('div', {
                    className: 'cg_queryOpts',
                    children: [
                      jsx('button', {
                        type: 'button',
                        className: 'cg_btnGhost',
                        disabled: loading,
                        title: 'codegraph files --json：列出索引里的文件结构（语言 / 符号数 / 大小）。不吃搜索框的关键词',
                        onClick: () => runQuery('files'),
                        children: busyOr('files', '文件', '读取中…'),
                      }),
                      jsx('label', {
                        className: 'cg_opt cg_optWide',
                        title: 'codegraph affected <files…>：由改动文件反查受影响的测试。一行一个，也可用逗号分隔；留空则 CLI 回「No files provided」',
                        children: [
                          '改动文件',
                          jsx('input', {
                            className: 'cg_input cg_inputSm',
                            placeholder: '如 packages/codegraph/src/index.ts（点「影响面」查询）',
                            value: changedFiles,
                            onChange: (event) => setChangedFiles(event.target.value),
                            onKeyDown: (event) => { if (event.key === 'Enter') runQuery('affected', { files: manualFiles() }) },
                          }),
                        ],
                      }),
                      jsx('button', {
                        type: 'button',
                        className: 'cg_btnGhost',
                        disabled: loading || !(status && status.projectPath),
                        title: 'codegraph affected <files>：由改动文件反查受影响的测试。用左侧「改动文件」里的列表',
                        onClick: () => runQuery('affected', { files: manualFiles() }),
                        children: busyOr('affected', '影响面', '分析中…'),
                      }),
                    ],
                  }),
                ]),
                // ── 结果（UX 重构：页签 + 上移）──
                // 用户反馈：「点击文件看不到对应的列表」。根因是结果区原先在面板**最底部**
                // （Agent 集成之后），而触发它的按钮在「索引维护 / 搜索与查询」——点完要往下
                // 翻两屏，中间还可能横着一个展开的诊断包。
                //
                // 三处改动一起解决「看不到」：
                //   ① 结果区上移到「搜索与查询」正下方（离触发按钮最近的位置）；
                //   ② 各类结果做成**页签**，点哪个按钮就切到哪一页——位置固定，不用找；
                //   ③ outputs 按路由分槽，切页签不会丢上一次的结果。
                // 另有 useEffect 在结果出来且不在视野时滚过去（block:'nearest'，已在视野就不动）。
                resultTabs.length > 0
                  ? group('结果', [
                      jsxs('div', {
                        className: 'cg_tabs',
                        children: resultTabs.map((tab) => jsx('button', {
                          type: 'button',
                          key: 'cg-tab-' + tab.key,
                          className: tab.key === activeTab ? 'cg_tab cg_tabOn' : 'cg_tab',
                          'aria-selected': tab.key === activeTab,
                          onClick: () => setActiveTab(tab.key),
                          children: tab.label,
                        })),
                      }),
                      jsx('div', {
                        className: 'cg_tabPanel',
                        ref: resultRef,
                        children: activeTab === 'search'
                          // 搜索结果：点一行下钻到符号详情（同时切到「符号详情」页签）
                          ? (results.length > 0
                            ? jsx('div', {
                              className: 'cg_list',
                              children: results.map((item, index) => {
                                const node = item && item.node ? item.node : item
                                return jsxs('div', {
                                  className: 'cg_item',
                                  key: 'cg-result-' + index,
                                  onClick: () => loadSymbol(node.qualifiedName || node.name),
                                  children: [
                                    jsx('div', { className: 'cg_itemName', children: node.qualifiedName || node.name || '(unnamed)' }),
                                    jsx('div', { className: 'cg_itemMeta', children: (node.kind || '') + ' · ' + (node.filePath || '') + ':' + (node.startLine || '') }),
                                  ],
                                })
                              }),
                            })
                            : jsx('p', { className: 'cg_mcpMeta', children: '没有匹配的符号。换个关键词，或去掉「类型」过滤。' }))
                          : activeTab === 'detail'
                            ? (detail
                              ? jsxs('div', {
                                children: [
                                  jsx('p', { className: 'cg_sectionTitle', children: '符号详情：' + selected }),
                                  // node 侧返回的是带行号的 markdown 源码/调用轨迹（不是 JSON），直接按文本显示
                                  typeof detail.node?.node === 'string' && detail.node.node.trim() !== ''
                                    ? jsx('pre', { className: 'cg_pre', children: detail.node.node })
                                    : null,
                                  relList('调用者 (callers)', relItems(detail.callers?.callers, 'callers'), '没有调用者'),
                                  relList('被调用 (callees)', relItems(detail.callees?.callees, 'callees'), '没有下游调用'),
                                  jsxs('div', {
                                    children: [
                                      jsx('p', {
                                        className: 'cg_sectionTitle',
                                        children: '影响面 (impact) · ' + fmtNum(detail.impact?.impact?.nodeCount) + ' 个节点 / ' + fmtNum(detail.impact?.impact?.edgeCount) + ' 条边',
                                      }),
                                      relList('受影响符号', relItems(detail.impact?.impact?.affected, 'affected'), '没有受影响的符号'),
                                    ],
                                  }),
                                  jsxs('details', {
                                    className: 'cg_details',
                                    children: [
                                      jsx('summary', { children: '原始 JSON（node / callers / callees / impact）' }),
                                      jsx('pre', { className: 'cg_pre', children: JSON.stringify(detail, null, 2) }),
                                    ],
                                  }),
                                ],
                              })
                              : jsx('p', { className: 'cg_mcpMeta', children: '正在加载符号详情…' }))
                            : (outputs[activeTab] !== undefined
                              ? renderOutputBody(outputs[activeTab])
                              : jsx('p', { className: 'cg_mcpMeta', children: '（还没有结果）' })),
                      }),
                    ])
                  : null,
                // ── Agent 集成 ── 提示词注入与 MCP 挂载的开关、相关警告收进一组。
                // UX 重构：四个开关拆两行——「跟随与提示词」是轻量行为开关，
                // 「per-agent MCP 隔离」是改 MCP 拓扑、有内存代价的决策，视觉同权正是
                // 「乱」的来源之一。各自一行小标题，代价与后果各归各位。
                group('Agent 集成', [
                  // UX 重构：四个开关拆两行——「跟随与提示词」是轻量行为开关，
                  // 「per-agent MCP 隔离」是改 MCP 拓扑、有内存代价的决策，两者视觉同权
                  // 正是「乱」的来源之一。各自一行小标题，代价与后果各归各位。
                  jsx('div', { className: 'cg_rowLabel', children: '跟随与提示词' }),
                  jsxs('div', {
                    className: 'cg_checks',
                    children: [
                      jsx('label', {
                        className: 'cg_check',
                        title: '开启后：会话切到某个已索引项目时，MCP 托管行的 cwd 自动对齐它；会话目录没有索引时回落到默认项目。「设为默认项目」会关掉它（那是一次显式指定）',
                        children: [
                          jsx('input', {
                            type: 'checkbox',
                            checked: defaultInfo ? defaultInfo.followSession === true : false,
                            disabled: !defaultInfo,
                            onChange: (event) => toggleSetting('followSession', event.target.checked),
                          }),
                          '跟随当前项目',
                        ],
                      }),
                      jsx('label', {
                        className: 'cg_check',
                        'data-off': !defaultInfo || defaultInfo.cliAvailable !== true ? '1' : undefined,
                        title: defaultInfo && defaultInfo.cliAvailable === true
                          ? '向 agent 注入本插件的能力公告（一段中文提示，告诉模型有这张卡片）'
                          : 'codegraph CLI 不可用，公告不会注入',
                        children: [
                          jsx('input', {
                            type: 'checkbox',
                            checked: defaultInfo ? defaultInfo.announceToAgent === true : false,
                            disabled: !defaultInfo || defaultInfo.cliAvailable !== true,
                            onChange: (event) => toggleSetting('announceToAgent', event.target.checked),
                          }),
                          '向 agent 公告能力',
                        ],
                      }),
                      jsx('label', {
                        className: 'cg_check',
                        'data-off': !defaultInfo || defaultInfo.cliAvailable !== true ? '1' : undefined,
                        title: defaultInfo && defaultInfo.cliAvailable === true
                          ? '注入 CodeGraph 使用指引（CODEGRAPH_START 区块：何时优先用 codegraph、失败怎么兜底）'
                          : 'codegraph CLI 不可用，使用指引不会注入',
                        children: [
                          jsx('input', {
                            type: 'checkbox',
                            checked: defaultInfo ? defaultInfo.usageGuidance === true : false,
                            disabled: !defaultInfo || defaultInfo.cliAvailable !== true,
                            onChange: (event) => toggleSetting('usageGuidance', event.target.checked),
                          }),
                          '注入使用指引',
                        ],
                      }),
                    ],
                  }),
                  jsx('div', { className: 'cg_rowLabel', children: 'MCP 挂载' }),
                  jsx('div', {
                    className: 'cg_checks',
                    children:
                      // P0：MCP 挂载模式。默认 managed（保持原行为），per-agent 是显式选择。
                      // 用户选了 per-agent 但前提不成立时，宿主会退回 managed 并给出原因——
                      // 卡片必须显示「已退回」，否则用户以为开了、实际没开。
                      // 与旧版一致，整个 label 仍以 defaultInfo 为前提（它直接读
                      // defaultInfo.mcpScope；探测结果没回来时无从渲染，preview-card 的
                      // null 探测用例盯的就是这条）。
                      defaultInfo
                        ? jsx('label', {
                          className: 'cg_check',
                          'data-off': defaultInfo.mcpScope !== 'per-agent' ? '1' : undefined,
                          title: '每 agent 一个独立的 codegraph MCP 进程（cwd = 该 agent 会话的索引根）：多项目并行时不再共享一个全局 cwd，也不再需要写盘热切换。代价是每个 agent 一个子进程（约 40MB 内存 / 每个），且只有会话目录真的**有索引**时才挂。',
                          children: [
                            jsx('input', {
                              type: 'checkbox',
                              checked: defaultInfo.mcpScope === 'per-agent',
                              disabled: !defaultInfo,
                              onChange: (event) => toggleSetting('mcpScope', event.target.checked ? 'per-agent' : 'managed'),
                            }),
                            'per-agent MCP 隔离',
                          ],
                        })
                        : null,
                  }),
                  // 退回提示：只在「用户要 per-agent、实际不是」时出现。
                  defaultInfo && defaultInfo.mcpScope === 'per-agent' && defaultInfo.effectiveMcpScope !== 'per-agent'
                    ? jsx('p', {
                      className: 'cg_warn',
                      children: '⚠ per-agent 未生效，已退回 managed：'
                        + (defaultInfo.mcpScopeReason || '前提不成立')
                        + '（当前仍是单服务器按会话热切换，功能正常）',
                    })
                    : null,
                  defaultInfo && defaultInfo.effectiveMcpScope === 'per-agent'
                    ? jsx('p', {
                      className: 'cg_mcpMeta',
                      title: '每个 agent 一个独立的 codegraph MCP 进程；会话目录没有可用索引的 agent 不会挂载（避免拿到别的项目上下文）',
                      children: 'per-agent 生效中：已挂载 ' + String(defaultInfo.agentMounts)
                        + ' 个 agent 的独立 MCP 进程。全局托管行已挂起（disabled: true），切回 managed 会自动恢复。',
                    })
                    : null,
                  cliWarning ? jsx('p', { className: 'cg_warn', children: cliWarning }) : null,
                  cliProbeDetail ? jsx('p', { className: 'cg_probeDetail', children: cliProbeDetail }) : null,
                  defaultWarning ? jsx('p', { className: 'cg_warn', children: defaultWarning }) : null,
                  // P1 采纳率：模型到底用不用 codegraph。放在开关下面——它是「配置对不对」
                  // 之后的第二个问题（「配好了，模型买账吗」）。
                  adoptionText(adoption) !== ''
                    ? jsx('p', {
                      className: 'cg_subtitle',
                      title: '来自宿主的内存计数（session/event 的 tool/call），宿主重启即归零；项目按索引根归并。「文件探索」= grep/glob/read 这类本可交给 codegraph 的工具，bash 等不计入',
                      children: adoptionText(adoption),
                    })
                    : null,
                ]),
              ],
            }),
          }) : null,
        ],
      })
    }

    /* ============================ 活动会话上报 ============================ */

    /**
     * 把当前活动会话的工作目录报给宿主，让宿主把 MCP 托管行的 cwd 对齐过去。
     *
     * 为什么放在 apply 而不是卡片里：卡片只在设置面板展开时挂载，而「跟着当前项目走」
     * 必须在这之前就成立。客户端半体在页面加载时就跑 apply，所以订阅会话列表放在这里。
     * 连续切换（打开会话 → 切项目）用 400ms 合并，只在取值变化时发一次请求。
     *
     * CG15：失败要能重试。旧实现把 lastSent 写在 fetch 之前、失败只 console.warn——
     * 一次网络抖动 / 宿主重启就把「跟随当前项目」永久关死，直到用户切换会话。现在
     * lastSent 只在成功（或服务端明确拒绝的 4xx）后落位；网络错误 / 5xx 走指数退避
     * 重试（1s 起、封顶 30s）；404（宿主启动期路由未挂上）与 5xx 同为瞬态，一并重试。
     */
    function installSessionReporter(ctx) {
      let lastSent = null
      let timer = null
      let retryTimer = null
      let retryDelayMs = 0
      let disposed = false

      const readCwd = () => activeSessionCwd()

      const report = async () => {
        const cwd = readCwd()
        if (disposed || cwd === lastSent) return
        try {
          const response = await fetch('/api/dsh-codegraph/follow', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ path: cwd }),
          })
          // 404 也要重试（评审追记）：宿主启动期路由还没挂上时 /follow 会 404，那是
          // 瞬态而不是拒绝；5xx 是服务端抖动。其余 4xx（400 目录不存在、403 越权）
          // 才是明确拒绝——记下这个值等下一次会话变化，不重试轰炸。
          if (!response.ok && (response.status === 404 || response.status >= 500)) {
            throw new Error('HTTP ' + response.status)
          }
          lastSent = cwd
          retryDelayMs = 0
        } catch (error) {
          console.warn('[dsh-codegraph] 上报活动会话目录失败，将重试：' + (error instanceof Error ? error.message : String(error)))
          if (disposed) return
          retryDelayMs = nextRetryDelayMs(retryDelayMs)
          if (retryTimer !== null) clearTimeout(retryTimer)
          retryTimer = setTimeout(() => {
            retryTimer = null
            void report()
          }, retryDelayMs)
        }
      }

      const schedule = () => {
        if (disposed) return
        if (timer !== null) clearTimeout(timer)
        timer = setTimeout(() => {
          timer = null
          void report()
        }, 400)
      }

      ctx.effect(() => {
        const subscribe = sessionsService?.list?.subscribe
        // 首次进入先报一次：宿主重启后也能立刻对齐，不用等用户切会话
        schedule()
        const off = typeof subscribe === 'function' ? subscribe(schedule) : undefined
        return () => {
          disposed = true
          if (timer !== null) clearTimeout(timer)
          if (retryTimer !== null) clearTimeout(retryTimer)
          if (typeof off === 'function') off()
        }
      })
    }

    /* ================================ 插件入口 ================================ */

    exports.inject = ['slots', 'sessions']

    /**
     * DSH ≥0.1.6-alpha.2 的行配置 key：`<bundle 包名>#<行 id>`，行 id 取自 bundle 的
     * cordis.patch.yml。独立安装时 bundle 是本包，装全家桶时是 @hyzyn/dsh-all —— 两个都注册，
     * 未命中的那个只是躺在 ledger 里，不会渲染。
     */
    const ROW_CONFIG_KEYS = [
      '@hyzyn/dsh-codegraph#codegraph',
      '@hyzyn/dsh-all#codegraph',
    ]

    exports.apply = (ctx) => {
      sessionsService = ctx.sessions
      installSessionReporter(ctx)
      // 样式由卡片实例自管（ensureStyle/releaseStyle 引用计数，CG08）——这里不再全局
      // 注入一次又随插件卸载摘掉，那会让另一张还在显示的卡片全裸。
      // DSH ≥0.1.6-alpha.2：侧边栏「插件」页里该行的配置页。插槽不存在时 inject 不会触发，
      // 因此在旧版上完全无副作用，一份代码同时兼容两代。
      for (const key of ROW_CONFIG_KEYS) {
        ctx.slots.inject('plugins.row.config', () => ctx.slots.register({
          name: 'plugins.row.config',
          key,
        }, CodegraphSettingsCard))
      }
      // DSH ≥0.1.6：设置里与「通用设置」平级的「插件配置」页（子 slot 由
      // @hyzyn/dsh-kit-settings 声明）。不传 view，卡片走各自原有的可折叠形态。
      ctx.slots.inject('settings.kit.item', () => ctx.slots.register({
        name: 'settings.kit.item',
        id: 'codegraph',
        order: 60,
        label: () => "Codegraph",
      }, CodegraphSettingsCard))
      // DSH ≤0.1.5：设置 → 插件 的「插件配置」标签页，keyed 插槽按 settings 命名空间派发。
      ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
        name: 'settings.plugin.item',
        // settings.plugin.item 是 keyed 插槽：key 必须是该卡片所编辑的 settings 命名空间
        key: 'codegraph',
        order: 104,
      }, CodegraphSettingsCard))
    }

    return exports
  },
})
