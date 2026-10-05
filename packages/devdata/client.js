/* eslint-disable */
/**
 * @hyzyn/dsh-devdata — 浏览器半体：官方「插件配置」里的一张卡片。
 *
 * ## 为什么有这张卡片
 *
 * 这一版宿主**没有任何客户端代码消费 `autoGenerate`**（`devfront` 真机三面扫过），所以「按
 * Config schema 生成表单」这条路走不通——每张卡片都得自己写（tty / docker 同款）。在那之前
 * devdata 只能在 profile 补丁层手改配置，而 `capabilities` / `doctor` 报出来的「配置问题」用户
 * 没有 UI 可以去改。
 *
 * 这张卡片补上三件：
 *
 *   1. **标量**可改并落盘：`enabled` / `announceToAgent` / `auditFile` / `timeoutMs` /
 *      计划护栏 `plan.maxRows` · `plan.maxCost`；
 *   2. **目标编辑器**（结构化表单，不是 YAML 自由文本）：每行 id / 名字 / 引擎 / 环境档 /
 *      作用域目录 / `maxScanCount` / 连接（host·port·db）/ 凭据引用，可增删改。**改目标要逐次
 *      确认**（那个复选框 → `confirmTargetEdit: true`）——它决定「工具能在哪个目标、哪个引擎、
 *      哪个环境、哪个范围上动手」，与 `env_down` 同一档；
 *   3. **能力档只读面板**：`writeCapability` / `dangerousReadCapability` 两档的
 *      「声明的变量名 + 当前是否已授权 + 怎么授权」。
 *
 * ## 能力档**刻意只读**（这是本卡片最重要的一条设计）
 *
 * 这两档的授权判据是「**宿主启动继承层**里那个变量的值 ∈ `1/true/yes/on`」，而变量名来自配置。
 * 把它指向**另一个恰好为真**的变量（例如 `CI=true`），页内脚本一条 `POST` 就等于**免重启提权**——那恰好违反根
 * `ROADMAP.md` §5.1 的不变量「**HTTP 只能关、不能开**」。（别用 `HOME` 当例子：它的值不在白名单里，
 * 指向它并不会授权。2026-10-03 更正。）所以卡片只**摆出**当前状态与「怎么授权」，
 * 编辑仍走 `~/.dsh/profiles/<profile>/cordis.patch.yml`；服务端对这两个字段在写入路径上**一律
 * 400**（含藏在 `targets[i]` 里的那种写法）。
 *
 * 连带的一条要注意：目标编辑是**替换整份 `targets`**，所以服务端会按 id 把**原有**的能力声明
 * 原样带回来（新行没有声明 = 未接入闸门）；**改 id 等于新增一个目标**，声明不会跟过去。
 *
 * 数据面是宿主那条 `GET/POST /api/dsh-devdata/config`（同源相对路径：宿主地址一律不硬编码，
 * 静态规则见 `scripts/client-lint.mjs`）。
 */
window.__ModuleLoader__.load({
  id: '@hyzyn/dsh-devdata',
  factory: (require) => {
    const exports = {}

    const React = require('react')
    const { jsx, jsxs } = require('react/jsx-runtime')

    const CONFIG_PATH = '/api/dsh-devdata/config'
    /*
     * 静态预检（`POST /api/dsh-devdata/preflight`）：**只发 `{ root, project, target }`**——
     * `target` 是**已保存目标的 id**，作用域 / 引擎 / 连接 / 能力一律由宿主从 `live.targets` 现取。
     * 这条路上没有网络之外的副作用（不保存配置、不写审计、不发 Redis 命令），所以它可以在
     * 「连目标之前」跑。
     *
     * 宿主半体上那条旧的 `/api/dsh-devdata/project-context`（纯模型归一化、不认识配置）**保留不动**
     * ——它是既有的对外 API（`test/config-route.test.ts` 仍钉着它）；卡片换用上面这条更严的预检，
     * 不再调用它。
     */
    const PREFLIGHT_PATH = '/api/dsh-devdata/preflight'
    /*
     * 证据链总览（P13 第一版）：宿主侧只读项目里的三份清单，**不连目标、不写任何东西**。
     * 用 POST 而不是 GET：项目根与项目名里可能有中文与空格，塞查询串要来回编码。
     */
    const EVIDENCE_PATH = '/api/dsh-devdata/evidence'
    /*
     * 看数据（P14 第一版）：宿主把这句话交给 `invokeRedisCommand`——**与 agent 同一个函数**。
     * 它可能会**真的连目标**（那是它的本事），所以它比上面那条证据路由重，但判据一个字都没放宽。
     */
    const QUERY_PATH = '/api/dsh-devdata/query'

    /* ================================ CSS ================================ */

    /*
     * devdata D10：样式变量只许写宿主主题里**真实存在**的名字。
     *
     * 变量不存在时那条声明在**计算值阶段**整条作废（`border` 是 shorthand，它的所有 longhand
     * 一起回落 `unset`，而 `border-style` 的初始值就是 `none`）——框会**直接消失**，而布局类
     * 声明照常生效，看着像「样式没加载」。本包 2026-10-04 就是这样：输入框 / 按钮 / 目标行
     * 全都没有框。名字表是生成物 `scripts/fixtures/dsh-theme-tokens.json`，判据在
     * `scripts/client-lint.mjs` 的检查 ③（`pnpm -r typecheck` 里跑）。
     */
    /*
     * 版式：**面板 → 目标行 → 能力档**三层（层与层之间有边框与底色差），字段走两列栅格，
     * 窄容器里 `auto-fit` 自动回落单列。视觉语言刻意与官方设置页一致：细边框、圆角、面板底色
     * 取官方的 `--dsw-alias-settings-card-fill` 与 `--dsw-alias-settings-card-stroke`、主色
     * **只出现在「保存」**这一处。
     *
     * 三条**不能动**的约束（`scripts/verify-devdata-card.mjs` 的 ㉕㉖ 按它们定位）：
     *   - 目标编辑器那一层必须带 `dd_card`：脚本用 `.dd_targets` → `closest('.dd_card')` 找它，
     *     为的是**确认框不能在标量那一层**被先命中（外面那张卡也是 `.dd_card`，取最近的那个）；
     *   - 每行目标的 10 个字段必须带 `dd_input` 且**DOM 顺序不变**（id / 名字 / 引擎 / 环境档 /
     *     作用域 / SCAN 上限 / 主机 / 端口 / 库号 / 凭据引用）——栅格只改视觉，不改顺序；
     *   - 目标行里**不许出现别的复选框**：脚本取 `editor.querySelector('input[type="checkbox"]')`，
     *     第一个必须就是那个确认框。
     */
    const CSS = [
      '.dd_card{display:flex;flex-direction:column;gap:14px;max-width:880px;color:var(--dsw-alias-label-primary);font-size:13px}',

      /* 头部 */
      '.dd_head{display:flex;flex-direction:column;gap:3px}',
      '.dd_name{margin:0;font-size:15px;font-weight:600;letter-spacing:.01em}',
      '.dd_desc{margin:0;font-size:12px;line-height:1.55;color:var(--dsw-alias-label-tertiary)}',

      /* 分组面板 */
      '.dd_panel{display:flex;flex-direction:column;gap:12px;padding:14px;border:1px solid var(--dsw-alias-settings-card-stroke);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-settings-card-fill)}',
      '.dd_panelHead{display:flex;align-items:center;gap:8px}',
      '.dd_panelTitle{margin:0;font-size:13px;font-weight:600}',
      '.dd_count{padding:0 8px;border:1px solid var(--dsw-alias-border-l2);border-radius:999px;font-size:11px;line-height:17px;color:var(--dsw-alias-label-tertiary)}',

      /* 表单栅格：固定两列（字段成对填满，不留空洞），窄窗口回落单列 */
      '.dd_grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 12px}',
      '@media (max-width:640px){.dd_grid{grid-template-columns:minmax(0,1fr)}}',
      '.dd_caption{margin:0;grid-column:1/-1;font-size:12px;font-weight:500;color:var(--dsw-alias-label-secondary)}',
      '.dd_field{display:flex;flex-direction:column;gap:5px;margin:0;min-width:0}',
      '.dd_label{font-size:12px;font-weight:500;line-height:16px;color:var(--dsw-alias-label-secondary)}',
      '.dd_hint{margin:0;font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary)}',

      /* 输入控件 */
      '.dd_input{box-sizing:border-box;width:100%;padding:6px 9px;border:1px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-sm);background:var(--dsw-specific-input-major);color:inherit;font-size:13px;line-height:18px}',
      '.dd_input:hover:not(:disabled){border-color:var(--dsw-alias-label-dimmed)}',
      '.dd_input:focus,.dd_input:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}',
      '.dd_input:disabled{opacity:.55;cursor:not-allowed}',

      /* 开关 */
      '.dd_switch{display:flex;align-items:flex-start;gap:9px;cursor:pointer}',
      '.dd_switch input{width:14px;height:14px;margin:1px 0 0;flex:none;accent-color:var(--dsw-alias-brand-primary);cursor:pointer}',
      '.dd_switchText{display:flex;flex-direction:column;gap:2px;min-width:0}',

      /* 目标行 */
      '.dd_targets{display:flex;flex-direction:column;gap:10px;margin:0;padding:0;list-style:none}',
      '.dd_target{display:flex;flex-direction:column;gap:12px;padding:12px;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-3)}',
      '.dd_targetHead{display:flex;align-items:center;gap:8px;min-height:22px}',
      '.dd_ordinal{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;flex:none;border:1px solid var(--dsw-alias-border-l2);border-radius:999px;background:var(--dsw-alias-bg-layer-2);font-size:11px;color:var(--dsw-alias-label-tertiary)}',
      '.dd_targetName{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',

      /* 状态胶囊：一个色 + 一个点，不引第二种底色（深浅两套主题都不用另写覆盖） */
      '.dd_chip{display:inline-flex;align-items:center;gap:5px;flex:none;padding:1px 8px;border:1px solid currentColor;border-radius:999px;font-size:11px;line-height:16px}',
      '.dd_dot{width:5px;height:5px;flex:none;border-radius:50%;background:currentColor}',
      '.dd_chipOk{color:var(--dsw-alias-state-success-primary)}',
      '.dd_chipWarn{color:var(--dsw-alias-state-warn-label)}',
      '.dd_chipIdle{color:var(--dsw-alias-label-tertiary)}',
      /* 比 idle 更淡的一档：一行上可能同时挂「目标声明」「点一下切过去」两个胶囊，它们不该抢名字的注意力。 */
      '.dd_chipFaint{opacity:.72}',

      /* 能力档（只读） */
      '.dd_caps{display:flex;flex-direction:column;gap:8px;padding:10px 12px;border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-2)}',
      '.dd_capsHead{display:flex;align-items:baseline;gap:8px}',
      /* 第一列要放得下 `dangerousReadCapability`（23 字符等宽体）；真放不下时**折行**，不压到状态列上 */
      '.dd_cap{display:grid;grid-template-columns:minmax(0,180px) 1fr;gap:2px 10px;align-items:baseline;margin:0}',
      '.dd_capName{font-family:var(--dsw-font-markdown-code-font-family);font-size:12px;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere;line-height:16px}',
      '.dd_capState{margin:0;font-size:12px}',
      '.dd_capMeta{margin:0;grid-column:2;font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary)}',
      '.dd_stateGranted{color:var(--dsw-alias-state-success-primary)}',
      '.dd_stateDenied{color:var(--dsw-alias-state-warn-label)}',
      '.dd_stateUnwired{color:var(--dsw-alias-label-tertiary)}',

      /* 空态与确认提示 */
      '.dd_empty{margin:0;padding:16px;border:1px dashed var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm);font-size:12px;line-height:1.6;color:var(--dsw-alias-label-tertiary);text-align:center}',
      '.dd_confirm{display:flex;align-items:flex-start;gap:9px;padding:10px 12px;border:1px solid var(--dsw-alias-border-l2);border-left:3px solid var(--dsw-alias-state-warn-primary);border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-2);cursor:pointer}',
      '.dd_confirm input{width:14px;height:14px;margin:1px 0 0;flex:none;accent-color:var(--dsw-alias-brand-primary);cursor:pointer}',

      /* 证据链总览（P13 第一版）：三面清单的**形状**，不是结论 */
      '.dd_eviRows{display:flex;flex-direction:column;gap:6px;margin:0;padding:0;list-style:none}',
      '.dd_eviRow{display:grid;grid-template-columns:56px minmax(0,1fr) auto;gap:4px 10px;align-items:baseline;padding:8px 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-2)}',
      '.dd_eviName{font-size:12px;font-weight:600;line-height:16px}',
      '.dd_eviPath{font-family:var(--dsw-font-markdown-code-font-family);font-size:12px;line-height:16px;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}',
      '.dd_eviState{font-size:12px;line-height:16px;text-align:right}',
      '.dd_eviMeta{margin:0;grid-column:2/-1;font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary)}',
      '.dd_eviOk{color:var(--dsw-alias-state-success-primary)}',
      '.dd_eviWarn{color:var(--dsw-alias-state-warn-label)}',
      '.dd_eviBad{color:var(--dsw-alias-state-error-primary)}',
      '.dd_eviIdle{color:var(--dsw-alias-label-tertiary)}',

      /* 看数据（P14 第一版）：预设按钮 + 结果块 */
      '.dd_presets{display:flex;flex-wrap:wrap;gap:6px}',
      '.dd_queryOut{margin:0;padding:10px 12px;max-height:260px;overflow:auto;border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-3);font-family:var(--dsw-font-markdown-code-font-family);font-size:12px;line-height:16px;white-space:pre-wrap;overflow-wrap:anywhere}',
      '.dd_queryOut[data-kind="err"]{border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary)}',
      '.dd_queryOut[data-kind="ok"]{color:var(--dsw-alias-label-primary)}',

      /* 按钮 */
      '.dd_btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:6px 14px;border:1px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-size:13px;line-height:18px;cursor:pointer;transition:background .16s,border-color .16s}',
      '.dd_btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}',
      '.dd_btnGhost{border-style:dashed;background:transparent;color:var(--dsw-alias-label-secondary)}',
      '.dd_addBtn{align-self:flex-start}',
      '.dd_btnPrimary{border-color:transparent;background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-inverted);font-weight:500}',
      '.dd_btnPrimary:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover)}',
      '.dd_btnPrimary:disabled{border-color:transparent;background:var(--dsw-alias-button-primary-dimmed);color:var(--dsw-alias-label-tertiary);cursor:default}',
      '.dd_remove{margin-left:auto;flex:none;padding:3px 10px;border:1px solid transparent;border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-tertiary);font-size:12px;cursor:pointer}',
      '.dd_remove:hover{background:var(--dsw-alias-interactive-bg-hover-danger);color:var(--dsw-alias-state-error-primary)}',

      /* 侧边栏「数据浏览器」面板（P14 第二版，2026-10-04）：左侧 key 列表 + 右侧详情 */
      '.dd_shell{display:flex;flex-direction:column;height:100%;min-height:0;color:var(--dsw-alias-label-primary);font-size:13px}',
      '.dd_shellHead{display:flex;align-items:center;gap:10px;padding:12px 18px;border-bottom:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2)}',
      '.dd_shellTitle{margin:0;font-size:14px;font-weight:600}',
      /*
       * 工具条**顶对齐**（不是 `flex-end`）：作用域那个字段比别的字段多一行提示，底对齐会把
       * 「目标」整个往下推——两个字段的**标签**差着 20 多像素，看着像没排版（P14 第二版实测）。
       */
      '.dd_shellBar{display:flex;flex-wrap:wrap;align-items:flex-start;gap:12px;padding:12px 18px;border-bottom:1px solid var(--dsw-alias-border-l1)}',
      '.dd_shellBar .dd_field{flex:0 1 auto;min-width:160px}',
      '.dd_shellBar .dd_input{min-width:150px}',
      '.dd_fieldStack{display:flex;flex-direction:column;gap:4px;align-items:flex-start}',
      /*
       * 「高级」：折起来时它只是工具条右侧的一个 `<summary>`；**展开后走横排**——
       * `COUNT` 的标签与上面两个字段的标签**同一行**、输入框与它们的输入框同一行。
       *
       * 原来是竖排（`summary` 压在字段上面），于是展开后「COUNT」比「目标」低了整整一个
       * `summary` 的高度（真机量到 20px），而且那个输入框是 `width:100%`、会被拉成半个工具条
       * 那么宽（391px）——看着就像这块脱离了整个工具条（用户反馈「高级的布局有问题」）。
       * 横排 + 定宽就同时解决这两条：标签对齐、控件宽度和上面那两个字段一个量级。
       */
      '.dd_advanced{display:flex;flex-direction:column;gap:6px}',
      '.dd_advanced[open]{flex-direction:row;align-items:flex-start;gap:10px}',
      '.dd_advanced > summary{flex:none;white-space:nowrap;font-size:12px;color:var(--dsw-alias-label-secondary);cursor:pointer}',
      '.dd_advanced[open] > summary{padding-top:2px}',
      '.dd_advanced .dd_field{flex:0 0 auto;width:260px}',
      '.dd_shellBody{display:grid;grid-template-columns:minmax(280px,380px) minmax(0,1fr);flex:1;min-height:0}',
      '.dd_shellCol{display:flex;flex-direction:column;min-height:0;overflow:auto;padding:10px 12px;gap:6px}',
      '.dd_shellCol + .dd_shellCol{border-left:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2)}',
      '.dd_shellSub{margin:0;font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary)}',
      /*
       * 工具条之下那两条**通栏**信息（「发了：SCAN …」与出错的那句话）：它们不在任何一列里，
       * 所以必须**自己带内边距**——否则文字会贴在面板最左边（比头部与工具条少 18px），
       * 面板贴着窗口边时连第一个字都被切掉（P14 第二版实测）。
       */
      '.dd_shellMeta{margin:0;padding:7px 18px}',
      '.dd_shellNote{margin:0;padding:7px 18px}',
      '.dd_tree{display:flex;flex-direction:column;gap:1px}',
      '.dd_treeNode{display:flex;flex-direction:column;gap:1px}',
      '.dd_treeChildren{display:flex;flex-direction:column;gap:1px}',
      '.dd_treeRow{display:flex;align-items:center;gap:6px;padding:3px 6px;border:1px solid transparent;border-radius:var(--dsw-radius-sm);font-size:12px;line-height:16px}',
      '.dd_treeL0{gap:8px;font-size:13px;font-weight:600}',
      '.dd_treeL1{padding-left:18px}',
      '.dd_treeL2{padding-left:36px}',
      '.dd_treeL3{padding-left:44px}',
      '.dd_treeMuted{color:var(--dsw-alias-label-tertiary)}',
      '.dd_treeTwisty{flex:none;width:11px;color:var(--dsw-alias-label-tertiary);font-size:11px}',
      /*
       * 能折叠的那一行：整行可点（不只是那 10px 的三角——它太小了），三角本身是个真按钮，
       * 键盘 Tab 到它按回车/空格就能折。两条入口都调 `toggleNode`，按钮那条 `stopPropagation`
       * 免得点一次折两次（净效果 = 不动）。
       */
      '.dd_treeBranch{cursor:pointer}',
      '.dd_treeBranch:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.dd_treeToggle{padding:0;border:0;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11px;line-height:1;height:16px;display:inline-flex;align-items:center;justify-content:center;cursor:pointer}',
      '.dd_treeToggle:hover{color:var(--dsw-alias-label-primary)}',
      '.dd_treeIcon{flex:none;color:var(--dsw-alias-label-secondary)}',
      '.dd_treeName{overflow-wrap:anywhere;font-family:var(--dsw-font-markdown-code-font-family)}',
      '.dd_treeNameStrong{font-family:inherit;font-weight:600}',
      '.dd_treeCount{margin-left:auto;flex:none;padding-left:8px;color:var(--dsw-alias-label-tertiary);font-size:11px}',
      '.dd_treeKey{width:100%;text-align:left;background:transparent;border:none;color:inherit;cursor:pointer}',
      '.dd_treeKey:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      /*
       * 选中那一行：**左边一条直轨**，左边两角改直角。
       * 原来写的是圆角行 + `inset 2px 0 0`——圆角会把这条 2px 的阴影在左上/左下削成一道弧形，
       * 看上去像行首多了一个黑色的括号（P14 第二版实测）。直角 + 3px 才是干净的竖轨。
       */
      '.dd_treeKey[data-on="1"]{background:var(--dsw-alias-interactive-bg-hover);border-radius:0 var(--dsw-radius-sm) var(--dsw-radius-sm) 0;box-shadow:inset 3px 0 0 var(--dsw-alias-brand-primary)}',
      /* 工具条会换行：左列不宽，MATCH 独占一行、两个按钮并排在下一行——**按钮不许被压成竖排字**。 */
      '.dd_treeBar{flex-wrap:wrap;gap:6px}',
      '.dd_treeBar .dd_inputSm{flex:1 1 100%;min-width:0}',
      '.dd_treeBar .dd_btnSm{flex:none;white-space:nowrap}',
      '.dd_inputSm{padding:2px 8px;font-size:12px;min-width:120px}',
      '.dd_btnSm{padding:2px 10px;font-size:12px;line-height:16px}',
      '.dd_shellColTree{gap:4px}',
      '.dd_keyList{display:flex;flex-direction:column;gap:2px;margin:0;padding:0;list-style:none}',
      '.dd_keyItemBtn{width:100%;text-align:left;padding:4px 8px;border:1px solid transparent;border-radius:var(--dsw-radius-sm);background:transparent;color:inherit;font-family:var(--dsw-font-markdown-code-font-family);font-size:12px;line-height:16px;cursor:pointer;overflow-wrap:anywhere}',
      '.dd_keyItemBtn:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.dd_keyItemBtn[data-on="1"]{border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-interactive-bg-hover)}',
      '.dd_kv{margin:0;border-collapse:collapse;width:100%;font-size:12px}',
      '.dd_kv td{padding:3px 8px;border-bottom:1px solid var(--dsw-alias-border-l1);vertical-align:top;overflow-wrap:anywhere}',
      '.dd_kv td:first-child{width:1%;white-space:nowrap;color:var(--dsw-alias-label-tertiary);font-family:var(--dsw-font-markdown-code-font-family)}',
      '.dd_metaRow{display:flex;flex-wrap:wrap;gap:12px;margin:0;font-size:12px;color:var(--dsw-alias-label-secondary)}',
      '@media (max-width:760px){.dd_shellBody{grid-template-columns:minmax(0,1fr)}.dd_shellCol + .dd_shellCol{border-left:none;border-top:1px solid var(--dsw-alias-border-l1)}}',

      /* 底部动作条 */
      '.dd_actions{display:flex;align-items:center;gap:12px;padding-top:12px;border-top:1px solid var(--dsw-alias-border-l1)}',
      '.dd_msg{margin:0;font-size:12px}',
      '.dd_msgOk{color:var(--dsw-alias-state-success-primary)}',
      '.dd_msgErr{color:var(--dsw-alias-state-error-primary)}',
      '.dd_spacer{flex:1}',

      /*
       * ===================== P14 第三版（2026-10-05）：视觉覆盖层 =====================
       *
       * 维护者原话「还是没变化，给我美化一下」。**只加规则、不改上面那 80 行**——上面每一条注释都
       * 对应一个实测踩过的坑（对比度、粘顶、弹层宽度、圆角把选中轨削成括号…），重写会把「为什么
       * 长这样」连同代码一起丢掉；覆盖层只调观感，不动那些判据。
       *
       * 这一版动了三处，都是截图里直接看得见的东西：
       *   ① 树里那一大段灰色说明（`INFO keyspace` 的取数口径，五行字）**搬出树**：树里只留一行短的
       *      「哪两个真源拼的」（`hint.keyspaceDbSource`），长的折进一个 `<details>`（`btn.keyspaceWhy`）；
       *   ② 头部与工具条固定、两栏各自滚动：key 列表长起来不再把工具条顶出视野（栏头粘顶）；
       *   ③ 类型上色（string / list / set / hash / zset 各一族）——key 行、类型分组、详情页签三处同色，
       *      `TYPE` 的原话照原样显示，颜色只是**读数辅助**，不改变任何判据。
       */
      /* 宽屏居中：1440 时左右留白对称，避免头左 / 头右两头沉；窄屏走 padding 自动对齐 */
      '.dd_shell{box-sizing:border-box;max-width:1280px;margin:0 auto;width:100%}',
      '.dd_shellHead{gap:9px;height:52px;flex:none;padding:0 18px}',
      /* 头部左侧的「数据浏览器 + 只读」与右上「重新扫描」之间那条隐式分界线：库数胶囊挪过去 */
      '.dd_shellHead .dd_chip{margin-left:6px}',
      '.dd_glyph{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;flex:none;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-brand-primary)}',
      '.dd_shellTitle{font-size:14px;letter-spacing:.01em}',
      '.dd_shellBar{gap:12px 18px;flex:none;padding:12px 18px}',
      /* 下拉框：抹掉系统箭头，画一个跟主题同色的（否则深浅两套主题下它都是系统的灰箭头） */
      '.dd_selectWrap{position:relative;display:block;width:100%}',
      '.dd_selectWrap select{appearance:none;padding-right:26px;cursor:pointer}',
      '.dd_selectWrap::after{content:"▾";position:absolute;right:10px;top:50%;margin-top:-8px;font-size:10px;line-height:16px;color:var(--dsw-alias-label-tertiary);pointer-events:none}',

      /* 主体两栏：栏内滚动 + 细滚动条 */
      '.dd_shellBody{grid-template-columns:minmax(300px,390px) minmax(0,1fr)}',
      '.dd_shellCol{padding:12px 14px;gap:8px}',
      '.dd_shellCol::-webkit-scrollbar{width:10px;height:10px}',
      '.dd_shellCol::-webkit-scrollbar-thumb{border-radius:999px;background:var(--dsw-alias-scrollbar-bg-l2)}',
      '.dd_shellCol::-webkit-scrollbar-thumb:hover{background:var(--dsw-alias-scrollbar-hover-l2)}',
      '.dd_shellCol::-webkit-scrollbar-track{background:transparent}',
      /* 栏头：粘在栏顶（`-12px/-14px` 把它顶到栏内边距之外，滚动时内容不从缝里钻出来） */
      '.dd_colHead{position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:8px;margin:-12px -14px 0;padding:12px 14px 8px;background:var(--dsw-alias-bg-layer-1)}',
      '.dd_shellCol + .dd_shellCol .dd_colHead{background:var(--dsw-alias-bg-layer-2)}',
      '.dd_shellSub{font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary)}',
      '.dd_shellMeta{padding:6px 18px;border-bottom:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);font-family:var(--dsw-font-markdown-code-font-family);font-size:11px}',
      '.dd_shellNote{padding:8px 18px;border-bottom:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2)}',

      /* 树：行高、圆角、缩进各调一档；库行 / key 行共用同一条选中轨 */
      '.dd_tree{gap:2px}',
      '.dd_treeRow{min-height:26px;padding:3px 8px;border-radius:6px;gap:7px}',
      '.dd_treeL1{padding-left:16px}',
      '.dd_treeL2{padding-left:30px}',
      '.dd_treeL3{padding-left:44px}',
      '.dd_treeKey{padding-left:44px}',
      '.dd_treeRow[data-current="1"]{background:var(--dsw-alias-bg-layer-2);box-shadow:inset 3px 0 0 var(--dsw-alias-brand-primary)}',
      /* 带选中轨的行左边两角必须是**直角**：圆角会把那条 3px 的轨在角上削成弧形（见上一版的注释） */
      '.dd_treeRow[data-current="1"]{border-radius:0 6px 6px 0}',
      '.dd_treeRow[data-current="1"] .dd_treeName{font-weight:600}',
      '.dd_treeKey[data-on="1"]{background:var(--dsw-alias-bg-layer-2);box-shadow:inset 3px 0 0 var(--dsw-alias-brand-primary)}',
      '.dd_treeIcon{color:var(--dsw-alias-label-tertiary)}',

      /* 类型一族：key 行、类型分组行、详情页签共用（后写的赢，所以 `.dd_kt_*` 必须在 `.dd_pill` 之后） */
      '.dd_pill{display:inline-flex;align-items:center;gap:4px;flex:none;padding:0 7px;border:1px solid var(--dsw-alias-border-l2);border-radius:999px;background:var(--dsw-alias-bg-layer-1);font-size:11px;line-height:17px;color:var(--dsw-alias-label-secondary)}',
      '.dd_pillType{border-color:currentColor;background:transparent;font-family:var(--dsw-font-markdown-code-font-family);font-weight:600}',
      '.dd_kt_string{color:var(--dsw-alias-state-success-primary)}',
      '.dd_kt_list{color:var(--dsw-alias-state-warn-primary)}',
      '.dd_kt_set{color:var(--dsw-alias-state-error-primary)}',
      '.dd_kt_hash{color:var(--dsw-alias-state-business-primary)}',
      '.dd_kt_zset{color:var(--dsw-alias-brand-primary)}',
      '.dd_kt_other{color:var(--dsw-alias-label-tertiary)}',
      '.dd_kt_string .dd_treeIcon,.dd_kt_list .dd_treeIcon,.dd_kt_set .dd_treeIcon,.dd_kt_hash .dd_treeIcon,.dd_kt_zset .dd_treeIcon{color:currentColor}',
      '.dd_chipBrand{color:var(--dsw-alias-brand-primary)}',

      /* 当前那个库行下面的工具条：一张小卡片，和 key 列表分开 */
      '.dd_treeBar{padding:6px 8px;border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-1)}',

      /* 行内详情：通栏，贴在**你点的那一行**下面（左边一道品牌色竖轨，指明它是哪一行的） */
      '.dd_rowDetail{flex:none;display:flex;flex-direction:column;gap:9px;padding:10px 12px 12px;border-bottom:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);box-shadow:inset 3px 0 0 var(--dsw-alias-brand-primary)}',
      '.dd_rowDetail .dd_kvWrap{background:var(--dsw-alias-bg-layer-1)}',
      /* 行内详情里的 key 名可以比表头大一点：它是这一块的标题 */
      '.dd_rowDetail .dd_keyName{font-size:13px}',

      /* 详情内容：key 名 + 一枚复制按钮 + 类型/TTL/大小的页签行 + 条纹表 */
      '.dd_detail{gap:9px}',
      '.dd_detailHead{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0}',
      '.dd_keyName{margin:0;font-family:var(--dsw-font-markdown-code-font-family);font-size:13px;line-height:20px;font-weight:600;overflow-wrap:anywhere}',
      '.dd_copyBtn{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;flex:none;padding:0;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:1;cursor:pointer}',
      '.dd_copyBtn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
      '.dd_blank{display:flex;align-items:center;justify-content:center;margin:0;padding:28px 16px;border:1px dashed var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);font-size:12px;line-height:1.6;color:var(--dsw-alias-label-tertiary);text-align:center}',
      '.dd_kvWrap{border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-md);overflow:auto;background:var(--dsw-alias-bg-layer-1)}',
      '.dd_kv td{padding:6px 10px;line-height:17px;font-family:var(--dsw-font-markdown-code-font-family)}',
      '.dd_kv td:first-child{color:var(--dsw-alias-label-secondary);font-weight:600}',
      '.dd_kv tbody tr:nth-child(even){background:var(--dsw-alias-bg-layer-2)}',
      '.dd_kv tbody tr:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.dd_kv tbody tr:last-child td{border-bottom:none}',

      /* 面板底部：四条口径折起来（原来是一整段常驻文本，占掉整个视野底部） */
      '.dd_foot{flex:none;padding:8px 18px 10px;border-top:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2)}',
      '.dd_more{margin:2px 0 0 16px}',
      '.dd_dbsrc{margin-top:2px;padding-top:2px;padding-bottom:2px}',
      '.dd_dbsrc .dd_hint{font-size:11px;line-height:15px}',
      '.dd_rules summary,.dd_more summary{font-size:11px;line-height:18px;color:var(--dsw-alias-label-tertiary);cursor:pointer}',
      '.dd_rules[open] summary,.dd_more[open] summary{color:var(--dsw-alias-label-secondary)}',
      '.dd_rules p,.dd_more p{margin:6px 0 0}',
      /*
       * ============ P14 第四版（2026-10-05）：照维护者贴的对象浏览器图改成**表** ============
       *
       * 图里的三件东西这一版都要有：**三栏**（树选库 / 表看 key / 右详情）、**五列**
       * （Key / Type / Value / Size / TTL）、**顶部 `Keys Contain` 搜索框**，外加 key 名按 `:`
       * 折出来的前缀行（`actor (986)` 那种）。仍然只加规则、不改前几版——那些注释各对应一个实测坑。
       */
      '.dd_shellBody{grid-template-columns:272px minmax(0,1fr)}',
      '.dd_shellColTable{padding:12px 14px 12px}',
      '@media (max-width:1080px){.dd_shellBody{grid-template-columns:minmax(0,1fr)}.dd_shellCol + .dd_shellCol{border-left:none;border-top:1px solid var(--dsw-alias-border-l1)}}',

      /* 第一行的提示条：仅第一次显示，消失后不再占位 */
      '.dd_readHint{margin:0 0 8px;padding:7px 10px;border:1px solid var(--dsw-alias-border-l1);border-left:3px solid var(--dsw-alias-brand-primary);border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-1);font-size:11px;line-height:15px;color:var(--dsw-alias-label-secondary)}',

            /* 顶部搜索栏：`Keys Contain [🔍]` + 读取这一页 + 那行代价 */
      /*
       * 搜索栏：横向三件（搜索框 / 🔍 按钮 / 「读取这一页」）同排、同一高度（26px）、同一圆角。
       * 搜索框里**只**有 input + 嵌入的放大镜 + 框右边的 x 号；外层那枚放大镜按钮保留——
       * 两枚放大镜一枚回车一枚点击，两条入口是同一件事（**不藏起来**）。
       */
      /*
       * 搜索栏排成**两行**：第一行是「搜索框 + 🔍 + 读取这一页」，第二行是那行代价 / 状态提示。
       * 挤成一行时那段说明会被压进按钮右边的窄缝里（一长条小字贴着按钮，2026-10-05 截图），
       * 分两行之后：控件一行、说明一行，各自都有整行宽度。
       */
      '.dd_searchBar{display:flex;align-items:flex-end;gap:8px;flex-wrap:wrap;padding-bottom:10px}',
      '.dd_searchBox{display:flex;flex-direction:column;gap:4px;flex:1 1 260px;min-width:0}',
      '.dd_searchLabel{font-size:11px;line-height:14px;color:var(--dsw-alias-label-tertiary);font-weight:500}',
      '.dd_searchField{position:relative;display:flex;align-items:center}',
      '.dd_searchGlyph{position:absolute;left:10px;color:var(--dsw-alias-label-tertiary);pointer-events:none}',
      '.dd_searchInput{padding-left:30px;height:26px;font-size:12px}',
      /* 同排按钮：高度 / 圆角 / 字体大小与搜索框对齐；否则三个控件看着像三个产物 */
      '.dd_searchBar .dd_btn{height:26px;padding:0 12px;font-size:12px;border-radius:6px;align-items:center;display:inline-flex}',
      '.dd_btnGlyph{display:inline-flex;align-items:center}',
      /* 提示行从独占一整行改成紧贴右下：标签式、不抢地方 */
      '.dd_searchBar .dd_hint{flex:1 1 100%;margin:0;padding-bottom:2px;font-size:11px;line-height:15px}',

      /* 表格：表头与行**共用同一套列宽**（两处各写一份必然漂） */
      '.dd_tbl{flex:1;min-height:0;display:flex;flex-direction:column;border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-1);overflow:hidden}',
      /*
       * 列宽照图量（图 958px 宽时大约是 Key 22% / Type 12% / **Value 47%** / Size 9% / TTL 8%）：
       * 这里写成「Key 与 Value 按 0.9 : 2.2 分走剩下的宽度，Type / Size / TTL 定宽」——
       * **Value 永远是第二宽的**（图里它最宽），而 TTL 那 96px 是照着 `(TTL 3600 秒)` 实测定的
       * （再窄就被省略号吃掉，图里之所以只要 8% 是因为它写的是更短的 `(No TTL)`）。
       */
      /* 列宽：Key 0.95 / Type 86 / Value 2.4 / Size 78 / TTL 90（Value 更宽、Size 右对齐的留白更紧） */
      '.dd_tblHead,.dd_tblRow{display:grid;grid-template-columns:minmax(120px,0.95fr) 86px minmax(150px,2.2fr) 78px 104px;align-items:center;gap:0}',
      /*
       * 库那一行：`db0` **不许被劈成「db」+「0」两行**（`flex:0 0 auto` + `nowrap`）；键数靠右；
       * 两枚胶囊放不下时**整块**折到第二行（不是把名字切开）。
       */
      '.dd_treeRow[data-db]{flex-wrap:wrap;row-gap:3px;align-items:center}',
      '.dd_treeRow[data-db] .dd_treeName{flex:0 0 auto;white-space:nowrap}',
      '.dd_treeRow[data-db] .dd_treeCount{margin-left:auto}',
      '.dd_dbChips{display:flex;gap:5px;flex:0 0 auto;padding-left:22px}',
      /*
       * 库那一行里的胶囊**比别处的更小一档**：左栏只有 272px，`当前浏览` + `目标声明` 两枚按常规尺寸
       * 放不下，会把每一行撑成两行（一屏只看得见两三个库）。字号 10px、内边距 0 4px 之后，
       * `db0 · 0 个 key · 当前浏览 · 目标声明` 正好一行放得下。
       */
      '.dd_dbChips .dd_chip{padding:0 5px;font-size:10px;line-height:14px;gap:3px}',
      '.dd_treeRow[data-db] .dd_treeCount{font-size:10px}',
      /* 连接那一行：`redis-two` 不许被劈成两半；地址跟在名字后面，放不下才折到第二行 */
      '.dd_treeL0{flex-wrap:wrap;row-gap:2px}',
      '.dd_treeL0 .dd_treeName{flex:0 0 auto;white-space:nowrap}',
      '.dd_treeL0 .dd_treeCount{margin-left:auto;padding-left:8px}',
      '.dd_tblHead{flex:none;border-bottom:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2)}',
      /* 表头：底色比正文行更浅一层（与库的斑马行不再撞），列间一条细竖线 */
      '.dd_tblHead{background:var(--dsw-alias-bg-layer-1)}',
      '.dd_tblHead .dd_cell{font-size:11px;font-weight:600;color:var(--dsw-alias-label-secondary);padding:7px 10px;background:var(--dsw-alias-bg-layer-1)}',
      '.dd_tblHead .dd_cell + .dd_cell{border-left:1px solid var(--dsw-alias-border-l1)}',
      '.dd_tblHead .dd_cell:last-child{text-align:right}',
      '.dd_tblBody{flex:1;min-height:0;overflow:auto;display:flex;flex-direction:column}',
      '.dd_tblRow{width:100%;flex:none;min-height:25px;text-align:left;border:0;border-bottom:1px solid var(--dsw-alias-border-l1);background:transparent;color:inherit;font:inherit;font-size:12px;line-height:16px;cursor:pointer}',
      '.dd_tblRow:last-child{border-bottom:0}',
      '.dd_tblBody > .dd_tblRow:nth-child(even){background:var(--dsw-alias-bg-layer-2)}',
      '.dd_tblRow:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.dd_cell{min-width:0;padding:4px 10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dd_cellKey{display:flex;align-items:center}',
      '.dd_keyWrap{display:flex;align-items:center;gap:6px;min-width:0}',
      /* Type 列：`• hash`（点在文字前面），点取类型色 */
      '.dd_cellType{display:flex;align-items:center;gap:6px;font-size:12px}',
      '.dd_cellValue{font-family:var(--dsw-font-markdown-code-font-family);font-size:11px;color:var(--dsw-alias-label-secondary)}',
      '.dd_cellSize{font-family:var(--dsw-font-markdown-code-font-family);font-size:11px;color:var(--dsw-alias-label-tertiary);text-align:right}',
      '.dd_cellTtl{font-size:11px;color:var(--dsw-alias-label-tertiary)}',
      '.dd_cellErr{color:var(--dsw-alias-state-error-primary)}',
      '.dd_tblKeyRow{display:grid}',
      '.dd_tblKeyRow .dd_treeName{font-family:inherit;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      /* 选中行：极淡的品牌色底（用 color-mix 把品牌色稀释到 8%），加上 3px 直角左轨——与 hover 行分得开 */
      '.dd_tblKeyRow[data-on="1"]{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 8%,var(--dsw-alias-bg-layer-1));box-shadow:inset 3px 0 0 var(--dsw-alias-brand-primary)}',
      '.dd_tblKeyRow[data-on="1"] .dd_treeName{font-weight:600}',
      /* 前缀行：**不加底色**（图里就是普通行 + 粗一点的名字 + 灰色的计数），只有 hover 有反馈 */
      '.dd_tblFolder{color:var(--dsw-alias-label-secondary)}',
      '.dd_tblFolder .dd_treeName{font-weight:600;color:var(--dsw-alias-label-primary)}',
      '.dd_tblFolder .dd_treeCount{padding-left:6px;font-size:11px;color:var(--dsw-alias-label-tertiary)}',
      '.dd_tblFolder .dd_treeToggle{width:12px}',
      '.dd_tblKeyRow[data-on="1"]{border-radius:0}',

      /* 库那一层读不上时贴出来的那句原话：给个框，别混在树的行里 */
      '.dd_tree pre[data-db-err]{margin:2px 0 0 16px;padding:8px 10px;border:1px solid var(--dsw-alias-state-error-primary);border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-1);font-size:11px;line-height:16px;white-space:pre-wrap;overflow-wrap:anywhere}',

      /*
       * ===================== P14 第五版（2026-10-05）：交互重构 + 观感 =====================
       *
       * 维护者原话「重构一下 ui 交互和美化一下」（截图：满屏黑破折号、两条灰提示叠着、readHint
       * 看着像一个两行高的大括号）。依旧只加规则、不改前几版。四处：
       *
       *   ① 搜索框的一键清掉（`×`）——第四版注释里就写着「框右边的 x 号」，这一版真的补上。
       *      它**必须是 `<span>` 不是 `<button>`**：验收脚本 ㊳ 取 `.dd_searchBar button` 的第一个当
       *      搜索按钮，多一枚真按钮会把它顶到第二位（点「×」却去执行搜索）；
       *   ② 那条一次性提示（`.dd_readHint`）从「左侧 3px 品牌色竖轨」改成虚线便签——竖轨紧贴文字
       *      在截图里被读成一个巨大的「【」；运行时也改了：读过本页任意一行就收（原来「还有未读」
       *      期间一直挂着，与下面的代价行叠成两行灰字）；
       *   ③ 没读过的格子（`—`）降档：类型一格原本继承正文色（截图里最重的那列黑破折号就是它）。
       *      「还没问过」是占位不是数据，不该与真值抢注意力——降到三级灰 + 半透明；
       *   ④ 「发了：…」那行只报命令与游标：「本页 N 个 key」与表格栏头那枚数字重复，删的是前者
       *      （数字贴着表才是它的位置）。
       */
      '.dd_searchInput{padding:0 22px 0 30px;height:26px;font-size:12px}',
      '.dd_searchClear{position:absolute;right:6px;display:inline-flex;align-items:center;justify-content:center;width:15px;height:15px;flex:none;border-radius:999px;font-size:12px;line-height:1;color:var(--dsw-alias-label-tertiary);cursor:pointer;user-select:none}',
      '.dd_searchClear:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
      '.dd_readHint{margin:0 0 8px;padding:6px 10px;border:1px dashed var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm);background:transparent;font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary)}',
      '.dd_cellDash{color:var(--dsw-alias-label-tertiary);opacity:.6}',

      /* 配置卡片五区：上下文只在顶部输入一次，证据 / 高级设置 / 高级查询三块按需展开。 */
      '.dd_configAdvanced > summary,.dd_eviPanel > summary,.dd_queryPanel > summary{font-size:13px;font-weight:600;line-height:20px;cursor:pointer;color:var(--dsw-alias-label-secondary)}',
      '.dd_configAdvanced[open] > summary,.dd_eviPanel[open] > summary,.dd_queryPanel[open] > summary{margin-bottom:12px}',
      '.dd_configBody{display:flex;flex-direction:column;gap:14px}',
      '.dd_contextSummary{margin:0;padding:8px 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-2);font-size:12px;line-height:18px;overflow-wrap:anywhere}',
      '.dd_resultRow{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:5px 12px;padding:10px 12px;border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-2)}',
      '.dd_resultRow .dd_hint{grid-column:1/-1;overflow-wrap:anywhere;white-space:pre-wrap}',
      '.dd_resultState{font-size:12px;font-weight:600}',
      '.dd_resultCategory{grid-column:1/-1;font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary)}',
      '.dd_invalidated{margin:0;color:var(--dsw-alias-state-warn-primary)}',
      '.dd_resultRow[data-state="pass"] .dd_resultState{color:var(--dsw-alias-state-success-primary)}',
      '.dd_resultRow[data-state="fail"] .dd_resultState{color:var(--dsw-alias-state-error-primary)}',
      '.dd_resultRow[data-state="not-verified"] .dd_resultState{color:var(--dsw-alias-label-tertiary)}',
      '.dd_preflightPanel .dd_actions,.dd_queryPanel .dd_actions{flex-wrap:wrap}',
      '.dd_sectionBody{display:flex;flex-direction:column;gap:10px}',
      /* 没有已保存目标时那枚入口：它是**定位到高级设置里的目标编辑器**，不是另一个保存入口。 */
      '.dd_targetsLink{align-self:flex-start;padding:0;border:0;background:transparent;color:var(--dsw-alias-state-business-primary);font-size:12px;line-height:18px;text-decoration:underline;cursor:pointer}',
      '.dd_targetsLink:hover{color:var(--dsw-alias-brand-primary)}',
    ]

    let styleEl

    function ensureStyle() {
      if (styleEl !== undefined && styleEl.isConnected) return
      styleEl = document.createElement('style')
      styleEl.textContent = CSS.join('\n')
      document.head.appendChild(styleEl)
    }

    /* ================================ 国际化 ================================ */

    /*
     * 界面文案走宿主 `@deepseek-ai/dsh-client-locale` 的目录（方案见 docs/i18n.md，
     * 静态校验见 `scripts/check-i18n.mjs`）。目录内联在 client.js 里——本包没有构建步骤，
     * client.js 就是源。
     */
    /* ==== dsh-i18n:begin ==== */
    const I18N_NS = 'devdata'
    const I18N_ZH = {
      'card.name': '开发测试套件 / 数据检查',
      'card.desc': '先填写项目上下文，再检查字段、查看项目证据或读取已保存的数据目标。',
      'section.config': '插件行为',
      'section.results': '检查结果',
      'section.advanced': '高级设置',
      'section.queryLimits': '查询限制',
      'section.audit': '审计',
      'hint.advanced': '修改插件行为或目标后，使用这里的「保存高级设置」。检查配置与读取目标都不保存配置。',
      'hint.savedTarget': '只列出已保存的数据目标；目标草稿保存后才会出现在这里。',
      'field.contextTarget': '已保存的数据目标',
      'option.noTarget': '没有已保存的数据目标',
      'hint.contextRoot': '项目根只在这里填写，证据链和默认查询作用域共同使用。',
      'hint.contextProject': '必填；与三份清单的文件名使用同一个项目名。',
      'hint.readonlySession': '本区主动作只读；权限仍由目标作用域、环境档和宿主安全闸门裁决。',
      'btn.configureTargets': '配置数据目标',
      'hint.configureTargets': '还没有已保存的数据目标：点它会展开并定位到高级设置里的目标编辑器，在那里添加并保存。',
      'btn.readTarget': '读取目标',
      'hint.readonlyCheck': '读取目标固定发送 DBSIZE，确认这次读取能否完成；它不执行项目业务断言。',
      'status.pass': '通过',
      'status.fail': '失败',
      'status.notVerified': '尚未验证',
      /*
       * 失败**分类**（`data-category`，值域固定为 configuration / execution / audit / response /
       * transport）。分类**不靠猜**：只有服务端显式给出 `data.category` 或命中已知的码 / 响应形状时
       * 才落档，其余一律 `unknown`（`status.notVerified` 那条路）。分类只是标签，任何一档都不改变
       * 「通过 / 失败 / 尚未验证」三态本身。
       */
      'status.categoryConfiguration': '配置',
      'status.categoryExecution': '执行',
      'status.categoryAudit': '审计',
      'status.categoryResponse': '响应',
      'status.categoryTransport': '传输',
      'status.categoryUnknown': '未分类',
      'meta.category': '分类：{category}',
      'panel.result.preflight': '项目上下文与目标配置',
      'panel.result.evidence': '三份清单可读取且项目名一致',
      'panel.result.readonly': '目标只读响应',
      'hint.resultsEmpty': '尚未运行检查。填写项目并选择目标后，检查配置或读取目标。',
      'hint.scopeEmpty': '未配置允许目录，拒绝所有访问',
      'hint.resultPreflightIdle': '无法完成配置检查，尚未验证；请查看原因后重试。',
      'hint.resultPreflightPass': '配置检查通过，尚未连接目标',
      'hint.resultPreflightFail': '下一步：按上面每条问题的恢复路径修正，再重新检查配置。',
      'hint.resultInvalidated': '项目根、项目名或目标已改变，旧结果立即作废——请重新检查配置或重新读取目标。',
      'hint.resultEvidenceIdle': '下一步：在项目证据链点击「看证据」，只读取清单及项目名。',
      'hint.resultEvidencePass': '三份清单已解析且项目名一致；各面的运行结论仍未验证。',
      'hint.resultEvidenceFail': '下一步：查看项目证据链每行的路径和错误，修正清单后重新读取。',
      'hint.resultReadonlyIdle': '尚未取得可确认的目标只读响应。下一步：选已保存的 Redis 目标，再点「读取目标」。',
      'hint.resultReadonlyPass': '这次只读请求已完成；不证明业务数据正确，也不授予任何能力。',
      'hint.resultReadonlyFail': '下一步：根据拒绝码检查已保存目标、作用域和连接信息；权限问题在高级设置查看。',
      'hint.sharedContext': '项目：{project} · 项目根：{root}',
      'hint.contextMissing': '尚未填写；请在上面填写项目根和项目名。',
      'check.queryOverride': '本次查询使用独立作用域',
      'hint.queryOverride': '仅勾选时生效。修改项目上下文会撤销并清空此作用域。',
      'msg.evidenceNeedProject': '先在上面填写项目名',
      'hint.querySavedTarget': '数据目标与顶部一致；当前执行通路支持 Redis。',
      'hint.queryUnsupported': '所选目标当前没有卡片执行通路。请在顶部选择已保存的 Redis 目标。',
      'section.targets': '目标（可改）',
      'section.capability': '能力档（只读）',
      'check.enabled': '启用本插件',
      'check.announce': '向 agent 注入能力公告',
      'check.confirmTargets': '我知道这会写进 profile 补丁层（~/.dsh/profiles/<profile>/cordis.patch.yml），并进审计',
      /*
       * 字段文案拆成「标签 + 提示」两键：标签是**一眼扫得过的短名**，括号里的口径下沉成灰色小字。
       * 顺带清掉了旧文案里的字面 `**`——它是 markdown 语法，而在卡片上**原样显示成了星号**。
       */
      'field.auditFile': '持久审计文件',
      'field.auditFile.hint': '留空 = 只进宿主日志；写类操作会因此被拒',
      'field.timeoutMs': '单次连接 + 命令超时',
      'field.timeoutMs.hint': '毫秒，100~60000；留空 = 不改',
      'panel.planGroup': '计划护栏（可选）',
      'field.planMaxRows': '最大估算扫描行数',
      'field.planMaxRows.hint': '留空 = 不做这一层检查；0 = 一行都不许',
      'field.planMaxCost': '最大估算代价',
      'field.planMaxCost.hint': '留空 / 0 = 不做这一层检查',
      'field.targetId': 'id',
      'field.targetId.hint': '工具按它选目标',
      'field.targetLabel': '名字',
      'field.targetEngine': '引擎',
      'field.targetEnv': '环境档',
      'field.targetScope': '允许的本机项目目录',
      'field.targetScope.hint': '访问目标时用项目根匹配此白名单，多个目录用逗号分隔。留空会拒绝所有访问。',
      'field.targetMaxScan': '单次 SCAN 工作量上限',
      'field.targetMaxScan.hint': '1~1000，留空默认 200。限制单次扫描提示量，不保证结果条数，也不代表已扫描完整个库。',
      'field.targetHost': '主机',
      'field.targetHost.hint': '与端口一起给；都不给 = 没有连接',
      'field.targetPort': '端口',
      'field.targetPort.hint': '1~65535',
      'field.targetDb': '库号',
      'field.targetDb.hint': '默认打开的 Redis 库号；留空不发 SELECT，沿用连接默认库。',
      'field.targetDbs': '额外允许浏览的库号',
      'field.targetDbs.hint': '逗号分隔（如 0, 1）。这是允许浏览的额外库号声明，不会自动发现或创建库。',
      'field.targetCredential': '凭据引用',
      'field.targetCredential.hint': '只填引用，不填明文（如 env:REDIS_PASS）。当前 Redis 连接器尚未解析凭据引用。',
      'badge.envWritable': '环境档允许写',
      'badge.envConfirm': '环境档写需确认',
      'badge.envReadonly': '只读',
      'badge.envUnset': '未标注 · 只读',
      'option.envUnset': '（不标注 = unknown = 不可写）',
      'option.enginePick': '（选一个引擎）',
      'btn.addTarget': '+ 添加目标',
      'btn.removeTarget': '删除',
      'btn.save': '保存高级设置',
      'btn.saving': '保存中…',
      'msg.saved': '已保存',
      'msg.targetsSaved': '目标已保存（进审计）',
      'msg.savedNotPersisted': '已在本进程生效，但宿主没有 settings 服务，没有落盘',
      'msg.targetsNeedConfirm': '改目标要先勾选下面那个确认框：它是「工具能在哪个目标、哪个引擎、哪个环境、哪个范围上动手」的变更。',
      'msg.loading': '正在读取配置…',
      'msg.loadFailed': '读取配置失败：',
      'msg.saveFailed': '保存失败：',
      'list.emptyTargets': '还没有配置任何目标——卡片不编一个默认目标出来（作用域与环境档都该由你声明）。',
      'hint.capReadonly': '能力授权只读。请按各目标显示的授权指引配置宿主并重启，当前页面不能授予能力。',
      'hint.capNewRow': '这一行还没保存过（或刚改过 id）：卡片读不到它的能力声明——声明不随行复制，改 id 等于新增一个目标。',
      'meta.capDeclared': '变量名：{env}（{label}）',
      'meta.capNotWired': '未接入闸门（该档入口不出现）',
      'meta.capGranted': '已授权（通道：{via}）',
      'meta.capDenied': '当前未获授权',
      'meta.capHowTo': '怎么授权：{howTo}',
      'meta.grantViaEnv': '启动环境',
      'meta.grantViaFile': '带外确认',
      'hint.pluginDisabled': '已保存配置中插件处于停用状态。先在高级设置启用并保存，再读取数据。',
      'hint.contextReuse': '沿用顶部填的项目根和项目名；修改上下文会清除旧结果。',
      'hint.envPermission': '环境档描述风险和允许的操作类别。环境档允许写，不等于写闸门已授权；此卡片不会自动授予能力。',
      'field.targetEnv.hint': '风险与权限分类，不是连接地址；未标注按只读处理。',
      'hint.readonlyNeedRoot': '读取目标暂不可用：先在上面填写项目根。',
      /*
       * 证据链总览（P13 第一版，2026-10-04）。这一屏**只报形状、不报结论**，所以它的文案要能
       * 自己说清这件事——否则人会把「读到了」当成「验过了」，那正是这套东西最怕的假绿。
       */
      'section.context': '项目上下文',
      'field.contextRoot': '项目根',
      'field.contextProject': '项目名（必填）',
      'btn.preflight': '检查配置',
      'msg.preflightRunning': '正在检查…',
      'msg.preflightFailed': '配置检查未通过：',
      'hint.preflightScope': '检查配置：静态、只读、不保存配置，不连接目标；不检查或证明目录存在。',
      'section.evidence': '项目证据链',
      'btn.checkEvidence': '看证据',
      'panel.faceReady': '容器',
      'panel.faceVerify': '数据',
      'panel.faceWeb': '页面',
      'status.evMissing': '没有这份清单',
      'status.evUnreadable': '读不了',
      'status.evMalformed': '解析失败',
      'status.evEmpty': '空文件',
      'status.evMultiple': '多个候选',
      'status.evParsed': '读到了',
      'meta.evCount': '{count} 条',
      'meta.evCountUnknown': '条目数读不出来',
      'meta.evProjectOk': '清单里的项目名与文件名一致',
      'meta.evProjectMismatch': '清单里的项目名是 {name}——与文件名不一致',
      'meta.evProjectMissing': '清单里没写 project（文件名是唯一对齐键，漏写就是没对齐）',
      'meta.evTool': '看结论用 {tool}',
      'hint.businessUnverified': '项目业务数据断言尚未验证；需要执行项目验证清单才能取得结论。',
      'hint.evidenceScope': '这一屏只回答「三份清单在不在、项目名对不对」。结论归各面自己的工具：它要连目标、要跑一遍，这里不替它们下结论。',
      'msg.evidenceLoading': '正在读三份清单…',
      'msg.evidenceFailed': '读取失败：',
      'msg.evidenceNeedRoot': '先填项目根目录（绝对路径）',
      /*
       * 看数据（P14 第一版）。口径一句话：**面板不是特权路径**——它与 agent 走同一个函数，
       * 所以文案里必须把「同一条链、同一档拒绝码、同一本账」说出来，否则人以为面板更宽。
       */
      'section.query': '高级查询',
      'field.queryTarget': '目标',
      'field.queryTarget.hint': '今天只有 Redis 有执行通路',
      'field.queryCommand': '命令原文',
      'field.queryCommand.hint': '只发这一条命令；判据链与 agent 那条完全一样',
      'field.queryCwd': '作用域基准',
      'field.queryCwd.hint': '绝对路径；留空时用上面那个项目根。不在目标的作用域目录里会被拒',
      'btn.queryRun': '跑一次',
      'list.noRedisTargets': '这份配置里没有 redis 目标：面板不编一个出来（先在上面配一个）。',
      'msg.queryRunning': '正在跑…',
      'msg.queryFailed': '跑不了：',
      'msg.readonlyNotCount': 'DBSIZE 的回复不是非负安全整数，这次读取不成立：',
      'msg.queryNeedCwd': '先填作用域基准（绝对路径），或先把上面那个项目根填上',
      'hint.querySameChain': '查询受目标作用域和宿主授权限制，每次请求均记录审计。',
      'hint.queryRecovery': '恢复路径：{hint}',
      /*
       * 数据浏览器（P14 第二版）。三条口径必须在界面上说出来：只读且同一条链、key/模式不许有空白
       * （命令原文按空白切分）、预览有上限——不然人会以为「面板看不到的」就是「不存在」。
       */
      'panel.keyspaceTitle': '数据浏览器',
      'panel.keyspaceDbs': '库',
      'panel.keyspaceKeys': 'Key',
      'badge.keyspaceReadOnly': '只读',
      'field.keyspaceTarget': '目标',
      'field.keyspaceScope': '作用域基准（项目根）',
      'field.keyspaceCount': 'COUNT',
      'btn.keyspaceMore': '继续扫描（游标 {cursor}）',
      'btn.keyspaceRefresh': '重新扫描',
      'list.keyspaceNoTargets': '这份配置里没有 redis 目标——面板不编一个出来（先在插件配置里配一个）。',
      'list.keyspaceEmpty': '这一页没有 key：MATCH 可能太窄，或这个库是空的。',
      'list.keyspacePickKey': '点这一行读它的类型与值（3~4 次调用，进审计）；再点一下收起。',
      'msg.keyspaceLoading': '正在读…',
      'msg.keyspaceFailed': '读不了：',
      'msg.keyspaceNeedScope': '先填作用域基准（绝对路径）——作用域判据按它判，空着等于没有基准',
      'msg.keyspaceDbOldHost': '宿主半体是旧版（它的 key 路由不返回 db）：库那一层今天只能看、切不动——重启宿主之后这一层才能切。',
      'meta.keyspaceCommand': '发了：{command}',
      'meta.keyspaceCursor': '下一页游标：{cursor}',
      'meta.keyspaceTtlSeconds': 'TTL {ttl} 秒',
      'meta.keyspaceTtlForever': '无过期',
      'meta.keyspaceTtlMissing': 'key 不存在',
      'meta.keyspaceTotalBytes': '{total} 字节',
      'meta.keyspaceTotalItems': '{total} 个元素',
      'meta.keyspaceTotalFields': '{total} 个字段',
      'meta.keyspaceTotalMembers': '{total} 个成员',
      'meta.keyspaceTruncated': '只列了前一部分（还有更多）',
      'meta.keyspaceNoPreview': '这个类型（{type}）还没有预览——不猜内容',
      'meta.keyspaceMissingKey': '这个 key 现在不存在（可能刚过期或被删）',
      'field.keyspaceAdvanced': '高级',
      'list.keyspaceIdle': '点「扫描」开始（目标一选定它会自己扫一次）。',
      'hint.keyspaceScopeDirs': '这个目标允许的目录：{dirs}（作用域按它判）',
      'hint.keyspaceNoScopeDirs': '这个目标没有声明作用域目录 ⇒ 处处拒绝（这是设计，不是坏了）：先在插件配置里给它加一个 scopeDirs。',
      'hint.keyspaceCount': 'SCAN 每次提示服务端返回多少（不是「只显示这么多」；条数是服务端说了算）',
      'meta.keyspaceDbCurrent': '当前浏览',
      'meta.keyspaceDbDeclared': '目标声明',
      'meta.keyspaceDbReported': '服务器上报',
      'meta.keyspaceDbUnknown': '键数未知',
      'meta.keyspaceDbKeys': '{count} 个 key',
      'meta.keyspaceTypePageCount': '本页 {count} 个',
      'meta.keyspaceCellEmpty': '空',
      'hint.keyspaceDbSource': '库的来源：目标声明 ∪ INFO keyspace（它只列有 key 的库）',
      'hint.keyspaceDbSourceMore': 'INFO 只列「有 key 的库」——空库一行都不报，所以看不见的那几个是空的，不是丢了；要连空库一起列出来，在插件配置里把它加进目标的「可浏览的库」（保存即生效）。反过来：一个 key 都没有的库这里画「0 个 key」，那是 INFO 真回了才敢写的数；INFO 读不上时这里写「键数未知」，绝不写 0。',
      'hint.keyspaceDbFallback': '库这一层**没读上**（原因见下）：下面列的是目标声明的库，键数一律显示「未知」——key 列表照样能扫。',
      'hint.keyspaceDbSwitch': '点这一行切到这个库（只读；切过去会重新扫一页）',
      'col.keyspaceKey': 'Key',
      'col.keyspaceType': '类型',
      'col.keyspaceValue': '值',
      'col.keyspaceSize': '大小',
      'col.keyspaceTtl': 'TTL',
      'field.keyspaceContain': 'Key 包含',
      'btn.keyspaceSearch': '搜索（重新扫一页）',
      'btn.keyspaceRead': '读取这一页',
      'msg.keyspaceReading': '读到 {done}/{total}…',
      'hint.keyspaceReadCost': '还没读的 {count} 个 key：每行要 TYPE + 大小 + 值 + TTL（约 {calls} 次调用、{calls} 行审计）。点了才付，分批读（每批最多 20 个），读到的行当场填上。',
      'hint.keyspaceFirstRead': '点右边一行就读这一行的值；想一次把整页填上，用「读取这一页」（分批，代价写在旁边那行）。',
      'hint.keyspaceReadDone': '这一页都读过了（`—` 的地方是这个类型没做预览，不是没读）。',
      /* 第三版新增的四个小文案：都挂在折叠标题与详情页签上（`⧉` 那枚复制按钮的两态）。 */
      'btn.keyspaceWhy': '为什么有的库看不见？',
      'btn.keyspaceRules': '读法（4 条口径）',
      'btn.keyspaceClear': '清掉这个筛选（按无筛选重扫一页）',
      'btn.keyspaceCopy': '复制这个 key 名',
      'btn.keyspaceCopied': '已复制',
      'hint.keyspaceRules': '四条口径：① 只发只读命令，与 agent 走同一条判据链（作用域按上面那个项目根判，每次调用都进审计）；② key 与模式里不能有空白——命令原文按空白切分，含空白的发不出去；③ 预览有上限（字符串 200 字符 / 列表与有序集合 100 条 / 哈希与集合一页 50）；④ 面板能去的库只有两种来源——**目标声明的**（「库」+「可浏览的库」）与 **INFO keyspace 当场报的**（服务器说有 key 的库）；浏览器自己造不出一个库号（它只能挑，`SELECT` 由执行器按目标声明发）。',
    }
    const I18N_EN = {
      'card.name': 'Development test suite / Data checks',
      'card.desc': 'Enter the project context, check its fields, inspect project evidence, or read a saved data target.',
      'section.config': 'Plugin behaviour',
      'section.results': 'Check results',
      'section.advanced': 'Advanced settings',
      'section.queryLimits': 'Query limits',
      'section.audit': 'Audit',
      'hint.advanced': 'Use Save advanced settings here after editing plugin behaviour or targets. Neither Check configuration nor Read target saves configuration.',
      'hint.savedTarget': 'Only saved data targets are listed. Draft targets appear here after saving.',
      'field.contextTarget': 'Saved data target',
      'option.noTarget': 'No saved data target',
      'hint.contextRoot': 'Enter the project root only here. Evidence and the default query scope share it.',
      'hint.contextProject': 'Required; use the same project name as the three manifest file names.',
      'hint.readonlySession': 'The main actions here are read-only. Target scope, environment tier, and host safety gates still decide access.',
      'btn.configureTargets': 'Configure a data target',
      'hint.configureTargets': 'There is no saved data target yet: this opens and locates the target editor in Advanced settings, where you add and save one.',
      'btn.readTarget': 'Read target',
      'hint.readonlyCheck': 'Read target always sends DBSIZE to check whether this read completes. It does not run project business assertions.',
      'status.pass': 'Pass',
      'status.fail': 'Fail',
      'status.notVerified': 'Not verified',
      'status.categoryConfiguration': 'Configuration',
      'status.categoryExecution': 'Execution',
      'status.categoryAudit': 'Audit',
      'status.categoryResponse': 'Response',
      'status.categoryTransport': 'Transport',
      'status.categoryUnknown': 'Unclassified',
      'meta.category': 'Category: {category}',
      'panel.result.preflight': 'Project context and target configuration',
      'panel.result.evidence': 'Three manifests readable with matching project names',
      'panel.result.readonly': 'Target read-only response',
      'hint.resultsEmpty': 'No checks run yet. Enter the project and select a target, then check configuration or read the target.',
      'hint.scopeEmpty': 'No allowed directories configured; all access is refused',
      'hint.resultPreflightIdle': 'The configuration check could not complete and remains unverified. Review the reason and retry.',
      'hint.resultPreflightPass': 'Configuration check passed; no target has been contacted yet',
      'hint.resultPreflightFail': 'Next: follow each problem’s recovery path above, then run Check configuration again.',
      'hint.resultInvalidated': 'The project root, project name, or target changed, so the old result was discarded immediately — run Check configuration or Read target again.',
      'hint.resultEvidenceIdle': 'Next: select Show evidence in Project evidence chain to read the manifests and project names only.',
      'hint.resultEvidencePass': 'All three manifests parsed with matching project names. Each face’s execution verdict remains unverified.',
      'hint.resultEvidenceFail': 'Next: inspect the paths and errors in Project evidence chain, correct the manifests, and read them again.',
      'hint.resultReadonlyIdle': 'No confirmed read-only response is available yet. Next: select a saved Redis target and select Read target.',
      'hint.resultReadonlyPass': 'This read-only request completed. It does not prove business data correctness or grant a capability.',
      'hint.resultReadonlyFail': 'Next: use the rejection code to check the saved target, scope, and connection details. Inspect permissions under Advanced settings.',
      'hint.sharedContext': 'Project: {project} · Root: {root}',
      'hint.contextMissing': 'Not entered yet; fill in the project root and name above.',
      'check.queryOverride': 'Use a separate scope for this query',
      'hint.queryOverride': 'Used only while checked. Editing the project context clears and disables this scope.',
      'msg.evidenceNeedProject': 'Enter the project name above first',
      'hint.querySavedTarget': 'The data target is shared with the top of the card. The execution path currently supports Redis.',
      'hint.queryUnsupported': 'This target has no execution path in the card today. Select a saved Redis target at the top.',
      'section.targets': 'Targets (editable)',
      'section.capability': 'Capability tiers (read-only)',
      'check.enabled': 'Enable this plugin',
      'check.announce': 'Inject the capability notice to the agent',
      'check.confirmTargets': 'I understand this is written into the profile patch layer (~/.dsh/profiles/<profile>/cordis.patch.yml) and audited',
      'field.auditFile': 'Durable audit file',
      'field.auditFile.hint': 'Empty = host log only; write operations are then refused',
      'field.timeoutMs': 'Connect + command timeout',
      'field.timeoutMs.hint': 'Milliseconds, 100~60000; empty = unchanged',
      'panel.planGroup': 'Plan guardrails (optional)',
      'field.planMaxRows': 'Max estimated rows scanned',
      'field.planMaxRows.hint': 'Empty = no such check; 0 = not even one row',
      'field.planMaxCost': 'Max estimated cost',
      'field.planMaxCost.hint': 'Empty / 0 = no such check',
      'field.targetId': 'id',
      'field.targetId.hint': 'Tools pick the target by it',
      'field.targetLabel': 'Name',
      'field.targetEngine': 'Engine',
      'field.targetEnv': 'Environment tier',
      'field.targetScope': 'Allowed local project directories',
      'field.targetScope.hint': 'The project root is matched against this allowlist when accessing the target. Separate directories with commas; empty denies every access.',
      'field.targetMaxScan': 'Per-SCAN work hint cap',
      'field.targetMaxScan.hint': '1~1000; empty defaults to 200. Caps each scan hint, not the result count or a guarantee that the whole database was scanned.',
      'field.targetHost': 'Host',
      'field.targetHost.hint': 'Give it with the port; neither = no connection',
      'field.targetPort': 'Port',
      'field.targetPort.hint': '1~65535',
      'field.targetDb': 'DB index',
      'field.targetDb.hint': 'The Redis database opened by default. Empty sends no SELECT and retains the connection default.',
      'field.targetDbs': 'Additional browsable database indices',
      'field.targetDbs.hint': 'Comma-separated (e.g. 0, 1). Declares additional indices that may be browsed; it does not discover or create databases.',
      'field.targetCredential': 'Credential reference',
      'field.targetCredential.hint': 'Enter a reference only, never plaintext (e.g. env:REDIS_PASS). The current Redis connector does not yet resolve credential references.',
      'badge.envWritable': 'Tier allows writes',
      'badge.envConfirm': 'Tier requires write confirmation',
      'badge.envReadonly': 'Read-only',
      'badge.envUnset': 'Unlabelled · read-only',
      'option.envUnset': '(unlabelled = unknown = not writable)',
      'option.enginePick': '(pick an engine)',
      'btn.addTarget': '+ Add a target',
      'btn.removeTarget': 'Remove',
      'btn.save': 'Save advanced settings',
      'btn.saving': 'Saving…',
      'msg.saved': 'Saved',
      'msg.targetsSaved': 'Targets saved (audited)',
      'msg.savedNotPersisted': 'Applied in this process, but the host has no settings service — nothing was persisted',
      'msg.targetsNeedConfirm': 'Tick the confirmation box first: this changes which target, engine, environment and scope the tools may act on.',
      'msg.loading': 'Loading configuration…',
      'msg.loadFailed': 'Failed to load configuration: ',
      'msg.saveFailed': 'Failed to save: ',
      'list.emptyTargets': 'No targets configured yet — the card will not invent one (scope and environment tier must be declared by you).',
      'hint.capReadonly': 'Capability grants are read-only. Follow each target’s instructions to configure and restart the host. This page cannot grant a capability.',
      'hint.capNewRow': 'This row has not been saved yet (or its id just changed): the card cannot read its capability declarations — declarations do not follow a row, changing the id means adding a new target.',
      'meta.capDeclared': 'Variable name: {env} ({label})',
      'meta.capNotWired': 'Not wired to a gate (so that tier has no entry point)',
      'meta.capGranted': 'Granted (channel: {via})',
      'meta.capDenied': 'Not granted right now',
      'meta.capHowTo': 'How to grant: {howTo}',
      'meta.grantViaEnv': 'launch environment',
      'meta.grantViaFile': 'out-of-band confirmation',
      'hint.pluginDisabled': 'The saved configuration disables this plugin. Enable it under Advanced settings and save before reading data.',
      'hint.contextReuse': 'Uses the project root and name entered at the top of the card. Editing that context clears old results.',
      'hint.envPermission': 'An environment tier describes risk and allowed operation categories. A tier that allows writes does not mean the write gate is granted. This card never grants a capability automatically.',
      'field.targetEnv.hint': 'Risk and permission category, not a connection address. Unlabelled targets are treated as read-only.',
      'hint.readonlyNeedRoot': 'Read target is unavailable: enter the project root above first.',
      'section.context': 'Project context',
      'field.contextRoot': 'Project root',
      'field.contextProject': 'Project name (required)',
      'btn.preflight': 'Check configuration',
      'msg.preflightRunning': 'Checking…',
      'msg.preflightFailed': 'Configuration check did not pass: ',
      'hint.preflightScope': 'Check configuration is static and read-only: no save, target connection, or directory existence check.',
      'section.evidence': 'Project evidence chain',
      'btn.checkEvidence': 'Show evidence',
      'panel.faceReady': 'Containers',
      'panel.faceVerify': 'Data',
      'panel.faceWeb': 'Pages',
      'status.evMissing': 'No such manifest',
      'status.evUnreadable': 'Unreadable',
      'status.evMalformed': 'Parse failed',
      'status.evEmpty': 'Empty file',
      'status.evMultiple': 'Several candidates',
      'status.evParsed': 'Read',
      'meta.evCount': '{count} entries',
      'meta.evCountUnknown': 'Entry count not readable',
      'meta.evProjectOk': 'The manifest’s project name matches the file name',
      'meta.evProjectMismatch': 'The manifest says {name} — which is not the file name',
      'meta.evProjectMissing': 'The manifest has no project field (the file name is the only alignment key)',
      'meta.evTool': 'For the verdict use {tool}',
      'hint.businessUnverified': 'Project business assertions remain unverified until the project verification manifest is executed.',
      'hint.evidenceScope': 'This screen answers only "are the three manifests there, and is the project name right". The verdicts belong to each face’s own tool: they connect to targets and actually run; nothing here decides for them.',
      'msg.evidenceLoading': 'Reading the three manifests…',
      'msg.evidenceFailed': 'Read failed: ',
      'msg.evidenceNeedRoot': 'Fill in the project root first (absolute path)',
      'section.query': 'Advanced query',
      'field.queryTarget': 'Target',
      'field.queryTarget.hint': 'Only Redis has an execution path today',
      'field.queryCommand': 'Command text',
      'field.queryCommand.hint': 'Exactly this one command; the judgement chain is the same one the agent uses',
      'field.queryCwd': 'Scope basis',
      'field.queryCwd.hint': 'Absolute path; empty = the project root above. Refused when outside the target’s scope dirs',
      'btn.queryRun': 'Run once',
      'list.noRedisTargets': 'No redis target in this configuration: the panel will not invent one (add one above first).',
      'msg.queryRunning': 'Running…',
      'msg.queryFailed': 'Cannot run: ',
      'msg.readonlyNotCount': 'The DBSIZE reply is not a non-negative safe integer, so this read does not stand: ',
      'msg.queryNeedCwd': 'Fill in the scope basis (absolute path), or fill in the project root above',
      'hint.querySameChain': 'Queries follow target scope and host grants. Every request is audited.',
      'hint.queryRecovery': 'Recovery: {hint}',
      'panel.keyspaceTitle': 'Data browser',
      'panel.keyspaceDbs': 'Databases',
      'panel.keyspaceKeys': 'Keys',
      'badge.keyspaceReadOnly': 'Read-only',
      'field.keyspaceTarget': 'Target',
      'field.keyspaceScope': 'Scope basis (project root)',
      'field.keyspaceCount': 'COUNT',
      'btn.keyspaceMore': 'Scan more (cursor {cursor})',
      'btn.keyspaceRefresh': 'Scan again',
      'list.keyspaceNoTargets': 'No redis target in this configuration: the panel will not invent one (add one in the plugin configuration first).',
      'list.keyspaceEmpty': 'No keys on this page: the MATCH may be too narrow, or this database is empty.',
      'list.keyspacePickKey': 'Click this row to read its type and value (3~4 calls, audited); click again to collapse.',
      'msg.keyspaceLoading': 'Reading…',
      'msg.keyspaceFailed': 'Cannot read: ',
      'msg.keyspaceNeedScope': 'Fill in the scope basis (absolute path) first — the scope test uses it, empty means no basis',
      'msg.keyspaceDbOldHost': 'The host half is an older build (its key route returns no db): this layer can be viewed but not switched today — restart the host to enable switching.',
      'meta.keyspaceCommand': 'Sent: {command}',
      'meta.keyspaceCursor': 'Next cursor: {cursor}',
      'meta.keyspaceTtlSeconds': 'TTL {ttl}s',
      'meta.keyspaceTtlForever': 'No TTL',
      'meta.keyspaceTtlMissing': 'key does not exist',
      'meta.keyspaceTotalBytes': '{total} bytes',
      'meta.keyspaceTotalItems': '{total} item(s)',
      'meta.keyspaceTotalFields': '{total} field(s)',
      'meta.keyspaceTotalMembers': '{total} member(s)',
      'meta.keyspaceTruncated': 'only the first part is listed (more exist)',
      'meta.keyspaceNoPreview': 'No preview for this type ({type}) — nothing is guessed',
      'meta.keyspaceMissingKey': 'This key does not exist right now (it may have just expired or been deleted)',
      'field.keyspaceAdvanced': 'Advanced',
      'list.keyspaceIdle': 'Press Scan to start (it scans once by itself as soon as a target is chosen).',
      'hint.keyspaceScopeDirs': 'Dirs this target allows: {dirs} (scope is tested against it)',
      'hint.keyspaceNoScopeDirs': 'This target declares no scope dir ⇒ always refused (that is the design, not a bug): add a scopeDirs to it in the plugin configuration first.',
      'hint.keyspaceCount': 'How many entries SCAN asks the server for per round (not a display cap; the server decides how many come back)',
      'meta.keyspaceDbCurrent': 'browsing now',
      'meta.keyspaceDbDeclared': 'declared',
      'meta.keyspaceDbReported': 'server-reported',
      'meta.keyspaceDbUnknown': 'key count unknown',
      'meta.keyspaceDbKeys': '{count} keys',
      'meta.keyspaceTypePageCount': '{count} on this page',
      'meta.keyspaceCellEmpty': 'empty',
      'hint.keyspaceDbSource': 'dbs = declared by the target union INFO keyspace (only dbs that hold keys)',
      'hint.keyspaceDbSourceMore': 'INFO lists only dbs that hold keys — an empty one gets no line at all, so the missing ones are empty rather than lost; to list an empty db too, add it to the browsable dbs of that target in the plugin configuration (saved values apply right away). Conversely, a db that holds no keys shows 0 keys here, and that number is only written when INFO actually answered; when INFO cannot be read this line says the key count is unknown and never 0.',
      'hint.keyspaceDbFallback': 'This layer could not be read (reason below): the rows come from the target declaration and every key count says unknown — the key list still works.',
      'hint.keyspaceDbSwitch': 'Click this row to switch to that db (read-only; it rescans a page)',
      'col.keyspaceKey': 'Key',
      'col.keyspaceType': 'Type',
      'col.keyspaceValue': 'Value',
      'col.keyspaceSize': 'Size',
      'col.keyspaceTtl': 'TTL',
      'field.keyspaceContain': 'Keys contain',
      'btn.keyspaceSearch': 'Search (scan again)',
      'btn.keyspaceRead': 'Read this page',
      'msg.keyspaceReading': 'Read {done}/{total}…',
      'hint.keyspaceReadCost': '{count} keys on this page are not read yet: each row needs TYPE + size + value + TTL (about {calls} calls, {calls} audit rows). You pay when you click; it reads in batches of at most 20 and fills each row as it arrives.',
      'hint.keyspaceFirstRead': 'Click any row on the right to read that row; to fill the whole page at once, use the “Read this page” button (batched, cost shown next to it).',
      'hint.keyspaceReadDone': 'Every key on this page has been read (a dash means this type has no preview, not that it was skipped).',
      'btn.keyspaceWhy': 'Why are some databases missing?',
      'btn.keyspaceRules': 'How to read this (4 rules)',
      'btn.keyspaceClear': 'Clear this filter (rescans without it)',
      'btn.keyspaceCopy': 'Copy this key name',
      'btn.keyspaceCopied': 'Copied',
      'hint.keyspaceRules': 'Four rules: (1) only read commands, through the very same judgement chain the agent uses (scope is tested against the project root above, every call is audited); (2) keys and patterns may not contain whitespace — the command text is split on whitespace, so such a key cannot be sent; (3) previews are bounded (strings 200 chars / lists and sorted sets 100 entries / hashes and sets 50 per page); (4) the panel can only reach dbs from two sources — those the target declares (the "db" field plus "browsable dbs") and those INFO keyspace reports right now (a db the server says holds keys); the browser cannot invent an index (it only picks; SELECT is sent by the executor from the target declaration).',
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

    /** 注册目录并绑定翻译函数（动态 inject：老宿主上保持中文兜底，卡片照挂）。 */
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

    /* ================================= 卡片 ================================= */

    /** 数值输入：空串 = **不改**（不是 0——`plan.maxRows: 0` 的语义是「一行都不许」）。 */
    function numberOrOmit(value) {
      return String(value).trim() === '' ? undefined : Number(value)
    }

    /** 只把要显示的键挑出来（数值字段留成字符串：输入框里要能是空的）。 */
    function pickScalars(config) {
      const plan = typeof config.plan === 'object' && config.plan !== null ? config.plan : {}
      return {
        enabled: config.enabled === true,
        announceToAgent: config.announceToAgent !== false,
        auditFile: typeof config.auditFile === 'string' ? config.auditFile : '',
        timeoutMs: typeof config.timeoutMs === 'number' ? String(config.timeoutMs) : '',
        planMaxRows: typeof plan.maxRows === 'number' ? String(plan.maxRows) : '',
        planMaxCost: typeof plan.maxCost === 'number' ? String(plan.maxCost) : '',
      }
    }

    /** 快照里的目标 → **可编辑草稿**（列表字段用逗号拼起来，方便一个输入框改）。 */
    function draftTargets(config) {
      const rows = Array.isArray(config.targets) ? config.targets : []
      return rows.map((target) => ({
        id: typeof target.id === 'string' ? target.id : '',
        label: typeof target.label === 'string' ? target.label : '',
        engine: typeof target.engine === 'string' ? target.engine : '',
        env: typeof target.env === 'string' ? target.env : '',
        scopeDirs: Array.isArray(target.scopeDirs) ? target.scopeDirs.join(', ') : '',
        maxScanCount: typeof target.maxScanCount === 'number' ? String(target.maxScanCount) : '',
        host: typeof target.host === 'string' ? target.host : '',
        port: typeof target.port === 'number' ? String(target.port) : '',
        db: typeof target.db === 'number' ? String(target.db) : '',
        dbs: Array.isArray(target.dbs) ? target.dbs.join(', ') : '',
        credentialRef: typeof target.credentialRef === 'string' ? target.credentialRef : '',
      }))
    }

    /** 快照里按 id 索引的目标（能力档只读面板从它取「当前状态」）。 */
    function capabilityIndex(config) {
      const rows = Array.isArray(config.targets) ? config.targets : []
      const index = {}
      for (const target of rows) {
        if (target !== null && typeof target === 'object' && typeof target.id === 'string') index[target.id] = target
      }
      return index
    }

    /**
     * 快照里按环境档名索引的**只读属性面**（`config.envFacts`，宿主 `env.ts` 的 `envFacts()`）。
     *
     * 卡片拿它渲染环境胶囊（可写 / 写需确认 / 只读）——判据仍然只有一处（`env.ts` 的档位表），
     * 卡片**不按名字猜**：`test-shared` 与 `test-isolated` 光看名字都像「测试」，而写权限正好相反。
     * 老宿主（快照里没有这一项）时索引为空，胶囊退化成「未标注」以外的中性态（见 `envChip`）。
     */
    function envFactIndex(config) {
      const rows = Array.isArray(config.envFacts) ? config.envFacts : []
      const index = {}
      for (const row of rows) {
        if (row !== null && typeof row === 'object' && typeof row.env === 'string') index[row.env] = row
      }
      return index
    }

    /** 逗号分隔 → 字符串数组（空项丢掉；**不去重、不排序**：顺序是用户的意图）。 */
    function splitList(value) {
      return String(value)
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item !== '')
    }

    /** 草稿 → 提交给宿主的 payload 形状（空字段**不占位**，让「没写」保持没写）。 */
    function targetsPayload(rows) {
      return rows.map((row) => {
        const maxScanCount = numberOrOmit(row.maxScanCount)
        const host = row.host.trim()
        const port = numberOrOmit(row.port)
        const db = numberOrOmit(row.db)
        /*
         * 「可浏览的库」：**照原样发上去，由宿主判**（不在这里静默过滤）。
         * 客户端悄悄丢掉一个写错的库号，用户会以为「我写了、它就算了」；让服务端回一句
         * 「dbs 里有不是库号的值 "abc"」才是诚实的失败方式。
         */
        const dbs = splitList(row.dbs).map((item) => (/^\d+$/.test(item) ? Number(item) : item))
        return {
          id: row.id.trim(),
          engine: row.engine.trim(),
          scopeDirs: splitList(row.scopeDirs),
          ...(row.label.trim() === '' ? {} : { label: row.label.trim() }),
          ...(row.env.trim() === '' ? {} : { env: row.env.trim() }),
          ...(maxScanCount === undefined ? {} : { maxScanCount }),
          ...(host === '' ? {} : { host }),
          ...(port === undefined ? {} : { port }),
          ...(db === undefined ? {} : { db }),
          ...(dbs.length === 0 ? {} : { dbs }),
          ...(row.credentialRef.trim() === '' ? {} : { credentialRef: row.credentialRef.trim() }),
        }
      })
    }

    /** 标量草稿 → payload（数值留空则**不带那个键** = 不改；`auditFile` 空串是「显式清掉」）。 */
    function scalarsPayload(form) {
      const timeoutMs = numberOrOmit(form.timeoutMs)
      const maxRows = numberOrOmit(form.planMaxRows)
      const maxCost = numberOrOmit(form.planMaxCost)
      return {
        enabled: form.enabled,
        announceToAgent: form.announceToAgent,
        auditFile: form.auditFile.trim(),
        ...(timeoutMs === undefined ? {} : { timeoutMs }),
        ...(maxRows === undefined ? {} : { 'plan.maxRows': maxRows }),
        ...(maxCost === undefined ? {} : { 'plan.maxCost': maxCost }),
      }
    }

    function DevdataCard() {
      const [form, setForm] = React.useState(null)
      const [targets, setTargets] = React.useState([])
      const [targetsFromServer, setTargetsFromServer] = React.useState([])
      const [savedEnabled, setSavedEnabled] = React.useState(false)
      const [caps, setCaps] = React.useState({})
      const [engines, setEngines] = React.useState([])
      const [envs, setEnvs] = React.useState([])
      const [envFacts, setEnvFacts] = React.useState({})
      const [confirmTargets, setConfirmTargets] = React.useState(false)
      const [busy, setBusy] = React.useState(false)
      const [message, setMessage] = React.useState({ text: '', kind: '' })
      // 项目上下文只有快速开始一处输入；证据、查询与结果均绑定这一轮上下文。
      const [evidence, setEvidence] = React.useState(null)
      const [evidenceBusy, setEvidenceBusy] = React.useState(false)
      const [evidenceMsg, setEvidenceMsg] = React.useState({ text: '', kind: '' })
      const [queryTarget, setQueryTarget] = React.useState('')
      const [queryCommand, setQueryCommand] = React.useState('DBSIZE')
      const [queryCwd, setQueryCwd] = React.useState('')
      const [queryOverride, setQueryOverride] = React.useState(false)
      const [queryOut, setQueryOut] = React.useState(null)
      const [readonlyResult, setReadonlyResult] = React.useState(null)
      const [queryBusy, setQueryBusy] = React.useState(false)
      const [queryMsg, setQueryMsg] = React.useState({ text: '', kind: '' })
      const queryPanelRef = React.useRef(null)
      /** 高级设置那块 `<details>`（「配置数据目标」那枚入口要展开它）。 */
      const advancedPanelRef = React.useRef(null)
      /** 高级设置里的目标编辑器（入口展开后滚动定位到它）。 */
      const targetEditorRef = React.useRef(null)
      const requestEpoch = React.useRef(0)
      /*
       * 顶部的项目上下文只有三样输入：项目根、项目名、**已保存**的数据目标。检查配置只核对它们与
       * 已保存目标的作用域 / 引擎，不保存配置、不连目标（`/preflight` 是纯静态的）。
       */
      const [contextRoot, setContextRoot] = React.useState('')
      const [contextProject, setContextProject] = React.useState('')
      const [contextResult, setContextResult] = React.useState(null)
      const [contextBusy, setContextBusy] = React.useState(false)
      /*
       * 「上一次的结论因为上下文变了而作废」——只在**真的清掉过一份结论**时亮（见
       * `clearContextResult`）。它不是状态机的一环，只是给「结果行怎么突然回到未验证」一个解释。
       */
      const [invalidated, setInvalidated] = React.useState(false)

      const adopt = React.useCallback((config) => {
        requestEpoch.current += 1
        setSavedEnabled(config.enabled === true)
        const savedIds = Array.isArray(config.targets) ? config.targets.map((row) => String(row.id)) : []
        setQueryTarget((value) => savedIds.includes(value) ? value : '')
        setQueryOverride(false)
        setQueryCwd('')
        setContextResult(null)
        setEvidence(null)
        setEvidenceMsg({ text: '', kind: '' })
        setQueryOut(null)
        setQueryMsg({ text: '', kind: '' })
        setReadonlyResult(null)
        setForm(pickScalars(config))
        setTargets(draftTargets(config))
        setTargetsFromServer(draftTargets(config))
        setCaps(capabilityIndex(config))
        setEngines(Array.isArray(config.engines) ? config.engines : [])
        setEnvs(Array.isArray(config.envs) ? config.envs : [])
        setEnvFacts(envFactIndex(config))
      }, [])

      const load = React.useCallback(() => {
        fetch(CONFIG_PATH, { cache: 'no-store' })
          .then((res) => res.json())
          .then((data) => {
            if (data !== null && typeof data === 'object' && data.ok === true && typeof data.config === 'object') {
              adopt(data.config)
              return
            }
            setMessage({ text: t('msg.loadFailed') + String(data && data.error ? data.error : ''), kind: 'err' })
          })
          .catch((error) => {
            setMessage({ text: t('msg.loadFailed') + String(error && error.message ? error.message : error), kind: 'err' })
          })
      }, [adopt])

      React.useEffect(() => {
        load()
      }, [load])

      const setField = (key, value) => {
        if (busy) return
        setForm((prev) => (prev === null ? prev : { ...prev, [key]: value }))
      }

      const setTargetField = (index, key, value) => {
        if (busy) return
        setTargets((rows) => rows.map((row, i) => (i === index ? { ...row, [key]: value } : row)))
        setConfirmTargets(false)
      }

      const targetsDirty = JSON.stringify(targets) !== JSON.stringify(targetsFromServer)

      const save = () => {
        if (form === null || busy || contextBusy || evidenceBusy || queryBusy) return
        if (targetsDirty && !confirmTargets) {
          setMessage({ text: t('msg.targetsNeedConfirm'), kind: 'err' })
          return
        }
        setBusy(true)
        setMessage({ text: '', kind: '' })
        const payload = scalarsPayload(form)
        if (targetsDirty) {
          payload.targets = targetsPayload(targets)
          payload.confirmTargetEdit = true
        }
        fetch(CONFIG_PATH, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        })
          .then((res) => res.json())
          .then((data) => {
            setBusy(false)
            if (data === null || typeof data !== 'object' || data.ok !== true) {
              setMessage({ text: t('msg.saveFailed') + String(data && data.error ? data.error : ''), kind: 'err' })
              return
            }
            adopt(data.config)
            setConfirmTargets(false)
            const done = targetsDirty ? t('msg.targetsSaved') : t('msg.saved')
            setMessage({ text: data.persisted === false ? t('msg.savedNotPersisted') : done, kind: data.persisted === false ? 'err' : 'ok' })
          })
          .catch((error) => {
            setBusy(false)
            setMessage({ text: t('msg.saveFailed') + String(error && error.message ? error.message : error), kind: 'err' })
          })
      }

      /*
       * 任何一次上下文变更（项目根 / 项目名 / 目标）都要**立刻**把旧结果清掉：`requestEpoch` 那一次
       * 自增同时保护在途响应——它回来时 epoch 已经变了，`then` 里直接返回，不会把旧结论写进新界面。
       * 这是「预检不是授权缓存」在界面一侧的落点（判据在 `docs/devkit-config.md` §安全不变量）。
       */
      const clearContextResult = () => {
        requestEpoch.current += 1
        setQueryOverride(false)
        setQueryCwd('')
        /*
         * 「旧结论作废」要说出来：清掉之前**真的有过结论**时才点亮那一句提示——否则人只看到结果行
         * 从「通过」变回「尚未验证」，会以为界面抽风（而不是「我改了输入，结论确实不再适用」）。
         */
        if (contextResult !== null || evidence !== null || readonlyResult !== null) setInvalidated(true)
        setContextResult(null)
        setEvidence(null)
        setEvidenceMsg({ text: '', kind: '' })
        setQueryOut(null)
        setQueryMsg({ text: '', kind: '' })
        setReadonlyResult(null)
      }
      const contextLocked = busy || contextBusy || evidenceBusy || queryBusy
      const sharedRoot = contextResult?.ok === true ? String(contextResult.context.root) : contextRoot.trim()
      const sharedProject = contextResult?.ok === true ? String(contextResult.context.project) : contextProject.trim()
      const savedTargets = targetsFromServer.filter((row) => String(row.id).trim() !== '')
      const effectiveTarget = savedTargets.some((row) => row.id === queryTarget) ? queryTarget : (savedTargets[0]?.id ?? '')
      const selectedTarget = savedTargets.find((row) => row.id === effectiveTarget)
      const canReadTarget = savedEnabled && selectedTarget?.engine === 'redis'
      const effectiveCwd = queryOverride ? queryCwd.trim() : sharedRoot
      const sharedContextText = t('hint.sharedContext', {
        project: sharedProject === '' ? t('hint.contextMissing') : sharedProject,
        root: sharedRoot === '' ? t('hint.contextMissing') : sharedRoot,
      })
      const clearQueryResult = () => {
        requestEpoch.current += 1
        setQueryOut(null)
        setQueryMsg({ text: '', kind: '' })
        setReadonlyResult(null)
      }

      /*
       * 失败**分类**：值域固定为 configuration / execution / audit / response / transport（外加
       * `unknown`）。分类**不靠猜**——只认服务端显式给的 `data.category`，或**精确**命中已知的
       * 拒绝码 / 响应形状（等值匹配，不做子串推断）。任何一档都不改变三态本身：分类是标签，
       * 「通过 / 失败 / 尚未验证」由响应的**形状**决定。
       *
       * 为什么不做子串推断：`data.error` 里出现 "scope" 不等于它是配置错——一句无关的传输错误
       * 正文里带同样的词就会被归错档，而错档的恢复路径会把人引到错的方向（本仓最忌的错诊断）。
       */
      const CATEGORY_BY_CODE = {
        // 配置类：输入 / 目标 / 作用域 / 能力 / 计划护栏——恢复路径都是「改配置或改输入」。
        BAD_TARGET: 'configuration', BAD_CWD: 'configuration', BAD_COMMAND: 'configuration',
        BAD_ROOT: 'configuration', BAD_PROJECT: 'configuration', BAD_DB: 'configuration',
        BAD_KEYS: 'configuration', BAD_CURSOR: 'configuration',
        UNKNOWN_TARGET: 'configuration', ENGINE_NOT_SERVED: 'configuration',
        OUT_OF_SCOPE: 'configuration', ENV_NOT_WRITABLE: 'configuration',
        CAPABILITY_NOT_DECLARED: 'configuration', CAPABILITY_NOT_GRANTED: 'configuration',
        CREDENTIAL_UNPROTECTED: 'configuration', UNCLASSIFIED_OPERATION: 'configuration',
        OPERATION_FORBIDDEN: 'configuration', CONFIRMATION_REQUIRED: 'configuration',
        COST_TOO_HIGH: 'configuration', FULL_SCAN: 'configuration', PLAN_UNAVAILABLE: 'configuration',
        PLAN_UNRECOGNIZED: 'configuration', TOO_MANY_KEYS: 'configuration', PLUGIN_DISABLED: 'configuration',
        CONNECTION_INCOMPLETE: 'configuration',
        // 执行类：裁决放行了，是执行层自己失败。
        EXECUTION_FAILED: 'execution', UNEXPECTED_REPLY: 'execution',
        // 审计类：写类操作没有持久审计出口。
        AUDIT_NOT_DURABLE: 'audit', AUDIT_FAILED: 'audit',
      }
      /** 服务端显式给的分类（只有它是权威）；认不出的值一律 `undefined`，不猜。 */
      const CATEGORIES = ['configuration', 'execution', 'audit', 'response', 'transport']
      const explicitCategory = (data) => (typeof data?.category === 'string' && CATEGORIES.includes(data.category)
        ? data.category
        : undefined)
      /** 精确的码 → 分类（等值匹配；认不出返回 `undefined`）。 */
      const categoryByCode = (data) => (typeof data?.code === 'string' && CATEGORY_BY_CODE[data.code] !== undefined
        ? CATEGORY_BY_CODE[data.code]
        : undefined)
      /*
       * 分类的展示文案：**逐条写成字面量**（不是 `t(变量)`）——`check-i18n` 只静态扫得动
       * `t('字面量')`，走映射表时这 6 条会被报成「可能是死键」；而「删掉一条闸门也不会红」
       * 正是那条闸门存在的理由（同 `faceLabel` / `stateLabel` 的写法）。
       */
      const categoryLabel = (category) => {
        if (category === 'configuration') return t('status.categoryConfiguration')
        if (category === 'execution') return t('status.categoryExecution')
        if (category === 'audit') return t('status.categoryAudit')
        if (category === 'response') return t('status.categoryResponse')
        if (category === 'transport') return t('status.categoryTransport')
        return t('status.categoryUnknown')
      }

      /*
       * 静态预检（`POST /api/dsh-devdata/preflight`）。
       *
       * **只发三个字段**：`{ root, project, target }`——`target` 是**已保存目标的 id**，不是连接
       * 快照。作用域、引擎、host/port、能力声明一律由宿主从 `live.targets` 现取：浏览器自报任何
       * 一份「快照」都是多一条「页内脚本自己宣布自己有权限」的路（宿主对未知字段逐条拒）。
       *
       * 成功只有**一种**形状算通过：`ok:true` + `context` 是对象（`readOnly:true`、root/project
       * 非空、三面开关都是布尔）+ `target` 带 `{ id, engine }` + `problems` 是空数组。任何别的东西
       * ——包括一个 `ok:true` 但缺 `target` 的响应——都**不许**记成通过（假绿是这套东西最怕的事）。
       *
       * 这条路上没有网络之外的副作用：它不保存配置、不写审计、不发 Redis 命令（真机 ㊶ 用
       * 「跑前跑后 config 与审计逐字节相同」钉住）。
       */
      const runPreflight = () => {
        if (contextLocked) return
        clearContextResult()
        setInvalidated(false)
        const epoch = requestEpoch.current
        setContextBusy(true)
        fetch(PREFLIGHT_PATH, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ root: contextRoot, project: contextProject, target: effectiveTarget }),
        })
          .then((res) => res.json())
          .then((data) => {
            if (epoch !== requestEpoch.current) return
            const context = data?.context
            const target = data?.target
            const shapeOk = data !== null && typeof data === 'object' && data.ok === true
              && context !== null && typeof context === 'object'
              && context.readOnly === true
              && typeof context.root === 'string' && context.root.trim() !== ''
              && typeof context.project === 'string' && context.project.trim() !== ''
              && context.mode === 'readonly'
              && ['environment', 'data', 'front'].every((face) => context.enabled?.[face] === false)
              && target !== null && typeof target === 'object'
              && target.id === effectiveTarget
              && target.engine === selectedTarget?.engine
              && Array.isArray(data.problems) && data.problems.length === 0
            if (shapeOk) {
              setContextResult(data)
              return
            }
            if (data !== null && typeof data === 'object' && data.ok === false && Array.isArray(data.problems)) {
              setContextResult(data)
              return
            }
            // 形状认不出（`ok:true` 但缺字段、或根本不是预检响应）：这是**响应**类，不是通过。
            setContextResult({ ok: false, context: null, target: null, problems: [], category: 'response', error: String(data?.error ?? '') })
          })
          .catch((error) => {
            if (epoch !== requestEpoch.current) return
            setContextResult({
              ok: false, context: null, target: null, problems: [],
              category: 'transport', error: String(error?.message ?? error),
            })
          })
          .finally(() => { setContextBusy(false) })
      }

      const contextInput = (value, setter, label, name, hint) => jsxs('label', {
        className: 'dd_field',
        children: [
          jsx('span', { className: 'dd_label', children: label }),
          jsx('input', {
            className: 'dd_input', name, value, disabled: contextLocked,
            onChange: (event) => {
              if (contextLocked) return
              setter(event.target.value)
              clearContextResult()
            },
          }),
          jsx('span', { className: 'dd_hint', children: hint }),
        ],
      })
      /*
       * 顶部面板：**只有三样输入**（项目根 / 项目名 / 已保存目标）与两个动作（检查配置 / 读取目标）。
       *
       * 刻意**没有** mode 选择与三个面开关：预检不接受它们（宿主对未知字段逐条拒），卡片也不该
       * 摆出「我能选」的样子。旧的 `/project-context` 还认它们，但那条路已经不在卡片上。
       */
      const quickStartPanel = jsxs('section', {
        className: 'dd_panel dd_preflightPanel', 'data-zone': 'context',
        children: [
          jsxs('div', { className: 'dd_panelHead', children: [
            jsx('h4', { className: 'dd_panelTitle', children: t('section.context') }),
            jsx('span', { className: 'dd_chip dd_chipIdle', children: t('badge.keyspaceReadOnly') }),
          ] }),
          jsxs('div', {
            className: 'dd_grid',
            children: [
              contextInput(contextRoot, setContextRoot, t('field.contextRoot'), 'root', t('hint.contextRoot')),
              contextInput(contextProject, setContextProject, t('field.contextProject'), 'project', t('hint.contextProject')),
              jsxs('label', { className: 'dd_field', children: [
                jsx('span', { className: 'dd_label', children: t('field.contextTarget') }),
                jsx('select', {
                  className: 'dd_input', name: 'target', value: effectiveTarget,
                  disabled: contextLocked || savedTargets.length === 0,
                  onChange: (event) => {
                    if (contextLocked) return
                    setQueryTarget(event.target.value)
                    clearContextResult()
                  },
                  children: savedTargets.length === 0
                    ? jsx('option', { value: '', children: t('option.noTarget') })
                    : savedTargets.map((row) => jsx('option', {
                      value: row.id, children: (row.label === '' ? row.id : row.label) + ' · ' + row.engine,
                    }, row.id)),
                }),
                jsx('span', { className: 'dd_hint', children: t('hint.savedTarget') }),
              ] }),
            ],
          }),
          jsx('p', { className: 'dd_hint', children: t('hint.readonlySession') }),
          jsx('p', { className: 'dd_hint', children: t('hint.preflightScope') }),
          jsxs('div', {
            className: 'dd_actions',
            children: [
              jsx('button', {
                type: 'button', className: 'dd_btn', disabled: contextLocked, onClick: runPreflight,
                children: contextBusy ? t('msg.preflightRunning') : t('btn.preflight'),
              }),
              jsx('button', {
                type: 'button', className: 'dd_btn', disabled: contextLocked || !canReadTarget || sharedRoot === '',
                onClick: () => runQuery('DBSIZE'),
                children: queryBusy ? t('msg.queryRunning') : t('btn.readTarget'),
              }),
            ],
          }),
          jsx('p', { className: 'dd_hint', children: t('hint.readonlyCheck') }),
          /*
           * 没有已保存目标时给一枚**入口**（不是第二个保存入口）：点它展开高级设置并定位到目标编辑器。
           * 只把「去哪配」说清楚——目标本身仍只能在高级设置里添加、确认、保存。
           */
          savedTargets.length === 0
            ? jsxs('div', { className: 'dd_field', children: [
              jsx('button', {
                type: 'button', className: 'dd_targetsLink',
                onClick: () => {
                  if (advancedPanelRef.current !== null) advancedPanelRef.current.open = true
                  if (targetEditorRef.current !== null && typeof targetEditorRef.current.scrollIntoView === 'function') {
                    targetEditorRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
                  }
                },
                children: t('btn.configureTargets'),
              }),
              jsx('p', { className: 'dd_hint', children: t('hint.configureTargets') }),
            ] })
            : null,

        ],
      })

      // 证据区沿用快速开始，预检通过时使用归一化值；不另外推导或输入项目名。
      const runEvidence = () => {
        if (contextLocked) return
        const root = sharedRoot
        const project = sharedProject
        setEvidence(null)
        if (root === '') {
          setEvidenceMsg({ text: t('msg.evidenceNeedRoot'), kind: 'err' })
          return
        }
        if (project === '') {
          setEvidenceMsg({ text: t('msg.evidenceNeedProject'), kind: 'err' })
          return
        }
        setInvalidated(false)
        const epoch = requestEpoch.current
        setEvidenceBusy(true)
        setEvidenceMsg({ text: '', kind: '' })
        fetch(EVIDENCE_PATH, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ root, project }),
        })
          .then((res) => res.json())
          .then((data) => {
            if (epoch !== requestEpoch.current) return
            if (data === null || typeof data !== 'object' || data.ok !== true || data.report === null || typeof data.report !== 'object') {
              setEvidenceMsg({ text: t('msg.evidenceFailed') + String(data && data.error ? data.error : ''), kind: 'err' })
              return
            }
            setEvidence(data.report)
          })
          .catch((error) => {
            if (epoch !== requestEpoch.current) return
            setEvidenceMsg({ text: t('msg.evidenceFailed') + String(error && error.message ? error.message : error), kind: 'err' })
          })
          .finally(() => { setEvidenceBusy(false) })
      }

      /*
       * 三面在卡片上的名字（**不是**包名：包名在 `meta.evTool` 那句里给）。
       *
       * 刻意写成显式分支而不是两张映射表：`check-i18n` 只静态扫得动 `t('字面量')`，走映射表时
       * 这 9 条会被报成「可能是死键」——那不是噪声，它意味着**删掉一条键闸门也不会红**。
       */
      const faceLabel = (face) => (face === 'ready' ? t('panel.faceReady') : face === 'verify' ? t('panel.faceVerify') : t('panel.faceWeb'))
      const stateLabel = (state) => {
        if (state === 'missing') return t('status.evMissing')
        if (state === 'unreadable') return t('status.evUnreadable')
        if (state === 'malformed') return t('status.evMalformed')
        if (state === 'empty') return t('status.evEmpty')
        if (state === 'multiple') return t('status.evMultiple')
        if (state === 'parsed') return t('status.evParsed')
        return t('status.notVerified')
      }
      const STATE_CLASSES = {
        parsed: 'dd_eviOk',
        missing: 'dd_eviIdle',
        empty: 'dd_eviWarn',
        malformed: 'dd_eviBad',
        unreadable: 'dd_eviBad',
        multiple: 'dd_eviBad',
      }

      const evidenceMeta = (face) => {
        const bits = []
        if (face.state === 'parsed') {
          bits.push(face.count === null ? t('meta.evCountUnknown') : t('meta.evCount', { count: String(face.count) }))
          if (face.projectMatches === true) bits.push(t('meta.evProjectOk'))
          else if (face.projectInFile === null) bits.push(t('meta.evProjectMissing'))
          else bits.push(t('meta.evProjectMismatch', { name: String(face.projectInFile) }))
        } else if (typeof face.message === 'string' && face.message !== '') {
          // 读不了 / 解析失败时把**原话**带上：它通常带路径或行列，改写一遍就丢了信息。
          bits.push(face.message)
        }
        bits.push(t('meta.evTool', { tool: String(face.tool) }))
        return bits.join(' · ')
      }

      const evidenceRow = (face) =>
        jsxs(
          'li',
          {
            className: 'dd_eviRow',
            'data-face': face.face,
            children: [
              jsx('span', { className: 'dd_eviName', children: faceLabel(face.face) }),
              jsx('span', { className: 'dd_eviPath', children: face.path }),
              jsx('span', {
                className: 'dd_eviState ' + (STATE_CLASSES[face.state] === undefined ? 'dd_eviIdle' : STATE_CLASSES[face.state]),
                children: stateLabel(face.state),
              }),
              jsx('p', { className: 'dd_eviMeta', children: evidenceMeta(face) }),
            ],
          },
          face.face,
        )

      /*
       * 证据链总览那一区。**刻意不放在** `.dd_card`（目标编辑器那一层）里面：验收脚本用
       * `.dd_targets` → `closest('.dd_card')` 定位编辑器，多一层 `.dd_card` 会把它的判据挪位。
       */
      const evidencePanel = jsxs('details', {
        className: 'dd_panel dd_eviPanel', 'data-zone': 'evidence',
        children: [
          jsx('summary', { children: t('section.evidence') }),
          jsx('p', { className: 'dd_contextSummary', children: sharedContextText }),
          jsx('p', { className: 'dd_hint', children: t('hint.contextReuse') }),
          jsxs('div', {
            className: 'dd_actions',
            children: [
              jsx('button', {
                type: 'button',
                className: 'dd_btn dd_btnGhost',
                disabled: contextLocked,
                onClick: runEvidence,
                children: evidenceBusy ? t('msg.evidenceLoading') : t('btn.checkEvidence'),
              }),
              evidenceMsg.text === '' ? null : jsx('span', {
                className: 'dd_msg ' + (evidenceMsg.kind === 'err' ? 'dd_msgErr' : 'dd_msgOk'),
                children: evidenceMsg.text,
              }),
            ],
          }),
          evidence === null || !Array.isArray(evidence.faces)
            ? null
            : jsx('ul', { className: 'dd_eviRows', children: evidence.faces.map(evidenceRow) }),
          jsx('p', { className: 'dd_hint', children: t('hint.evidenceScope') }),
          jsx('p', { className: 'dd_hint', 'data-business-state': 'not-verified', children: t('hint.businessUnverified') }),
        ],
      })

      /*
       * 「读取目标」发的是一条**固定**命令（用户传不了命令）：`DBSIZE`。
       *
       * 它算通过的条件只有**一条**：响应是 `{ ok: true, text }`，而 `text` 是一个**非负安全整数**
       * 的规范写法（允许首尾空白）。为什么要这么严：
       *
       *   - `DBSIZE` 的语义就是一个计数，负数 / 小数 / 非数字 / 超出 `Number.MAX_SAFE_INTEGER`
       *     都不是「合法的观测值」——把 `abc` 或 `-1` 记成「通过」等于用一个坏回复宣布只读通路健康；
       *   - **规范写法**（`0` 或 `[1-9][0-9]*`）挡住 `007` / `+7` / `7.0` / `1e3` 这类写法：
       *     它们能解析成数字，但不是这个接口承诺的形状，认了就等于把解析器的宽容当成契约；
       *   - 服务端那条路由把整数渲染成 `JSON.stringify(number)`（`renderResult`），所以合法值到了
       *     这里一定就是规范十进制串——**这条判据与渲染方式是一对**，换渲染就要一起看。
       */
      const FIXED_READ_COMMAND = 'DBSIZE'
      const canonicalCount = (value) => {
        if (typeof value !== 'string') return undefined
        const trimmed = value.trim()
        if (!/^(?:0|[1-9][0-9]*)$/.test(trimmed)) return undefined
        const parsed = Number(trimmed)
        return Number.isSafeInteger(parsed) ? parsed : undefined
      }

      const runQuery = (fixedCommand) => {
        if (contextLocked) return
        if (!canReadTarget) {
          setQueryMsg({ text: t('list.noRedisTargets'), kind: 'err' })
          return
        }
        const checkingReadonly = fixedCommand === FIXED_READ_COMMAND
        const cwd = checkingReadonly ? sharedRoot : effectiveCwd
        if (cwd === '') {
          setQueryMsg({ text: t('msg.queryNeedCwd'), kind: 'err' })
          return
        }
        const command = checkingReadonly ? FIXED_READ_COMMAND : queryCommand.trim()
        setInvalidated(false)
        const epoch = requestEpoch.current
        setQueryBusy(true)
        setQueryMsg({ text: '', kind: '' })
        setQueryOut(null)
        setReadonlyResult(null)
        fetch(QUERY_PATH, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ target: effectiveTarget, command, cwd }),
        })
          .then((res) => res.json())
          .then((data) => {
            if (epoch !== requestEpoch.current) return
            if (data !== null && typeof data === 'object' && data.ok === true && typeof data.text === 'string') {
              if (!checkingReadonly) {
                setQueryOut({ text: data.text, kind: 'ok' })
                return
              }
              /*
               * 固定只读检查：**只有合法观测值才算通过**。认不出形状时既不是通过、也不是「目标坏了」
               * ——它是**响应**类的一次「没验成」，照实记 not-verified，并把原话摊在结果块里。
               */
              const count = canonicalCount(data.text)
              if (count === undefined) {
                const detail = t('msg.readonlyNotCount') + JSON.stringify(data.text)
                setQueryOut({ text: detail, kind: 'err' })
                setReadonlyResult({ state: 'not-verified', category: 'response', text: detail })
                return
              }
              setQueryOut({ text: String(count), kind: 'ok' })
              setReadonlyResult({ state: 'pass', text: '' })
              return
            }
            /*
             * 拒绝也是结果：把**码 + 正文 + 恢复路径**原样摊出来。面板若把它缩成一句「失败」，
             * 人就没法判断该去开闸门、改作用域，还是改命令——而那正是判据层写这段文案的目的。
             *
             * **分类不猜**：只有服务端显式给的 `category` 或**精确命中**已知拒绝码才落档；认不出
             * 就是「未分类」。而分类**不改三态**——结构化拒绝（作用域 / 执行 / 审计）一律
             * `not-verified`：它是「没验成」，不是「验出问题」（把没验成冒充问题，恢复路径就会
             * 指向错的方向）。
             */
            const parts = []
            if (typeof data?.code === 'string' && data.code !== '') parts.push(data.code)
            if (typeof data?.error === 'string') parts.push(data.error)
            if (typeof data?.hint === 'string' && data.hint !== '') parts.push(t('hint.queryRecovery', { hint: data.hint }))
            // 兜底：认不出的响应也**必须**在结果块里露一句话——空块看起来像「什么都没发生」。
            if (parts.length === 0) parts.push(t('msg.queryFailed') + JSON.stringify(data ?? null))
            const detail = parts.join('\n')
            const category = explicitCategory(data) ?? categoryByCode(data) ?? 'response'
            setQueryOut({ text: detail, kind: 'err' })
            if (checkingReadonly) setReadonlyResult({ state: 'not-verified', category, text: detail })
          })
          .catch((error) => {
            if (epoch !== requestEpoch.current) return
            const text = String(error && error.message ? error.message : error)
            setQueryMsg({ text: t('msg.queryFailed') + text, kind: 'err' })
            setQueryOut({ text: t('msg.queryFailed') + text, kind: 'err' })
            // 传输错自成一档，同样是「没验成」。
            if (checkingReadonly) setReadonlyResult({ state: 'not-verified', category: 'transport', text: t('msg.queryFailed') + text })
          })
          .finally(() => { setQueryBusy(false) })
      }

      /*
       * 「看数据」那一区（P14 第一版）。**默认折叠**（`<details class="dd_panel dd_queryPanel">`）：
       * 顶层只留上下文与两个动作，命令原文那条路属于「高级」。
       *
       * 目标只列**服务端快照里**的 redis 目标（不是草稿）：草稿里那些还没保存的行在宿主侧根本不存在，
       * 拿它去查只会得到 `UNKNOWN_TARGET` —— 那种「界面让你选、选完报错」是最坏的形态。
       */
      const QUERY_PRESETS = ['PING', 'DBSIZE', 'INFO memory', 'SCAN 0 MATCH * COUNT 50']

      const queryPanel = jsxs('details', {
        className: 'dd_panel dd_queryPanel', 'data-zone': 'query', ref: queryPanelRef,
        children: [
          jsx('summary', { children: t('section.query') }),
          jsx('p', { className: 'dd_contextSummary', children: sharedContextText }),
          jsx('p', { className: 'dd_hint', children: t('hint.contextReuse') }),
          jsx('p', { className: 'dd_hint', children: t('field.queryTarget') + ': ' + (selectedTarget === undefined ? t('option.noTarget') : (selectedTarget.label || selectedTarget.id)) }),
          jsx('p', { className: 'dd_hint', children: t('hint.querySavedTarget') }),
          jsx('p', { className: 'dd_hint', children: t('field.queryTarget.hint') }),
          !savedEnabled ? jsx('p', { className: 'dd_hint', children: t('hint.pluginDisabled') })
            : !canReadTarget ? jsx('p', { className: 'dd_hint', children: t('hint.queryUnsupported') })
              : sharedRoot === '' ? jsx('p', { className: 'dd_hint', children: t('hint.readonlyNeedRoot') }) : null,
          /*
           * **这里刻意不再放第二颗「读取目标」**：固定只读检查只有顶那一颗（文案唯一、位置唯一），
           * 这一区只留「命令原文」那条路（`跑一次`）。两个入口讲同一件事，人会以为是两条不同的检查。
           */
          jsxs('div', {
            className: 'dd_sectionBody',
            children: [
              jsxs('label', { className: 'dd_switch', children: [
                jsx('input', {
                  type: 'checkbox', name: 'scopeOverride', checked: queryOverride, disabled: contextLocked,
                  onChange: (event) => {
                    if (contextLocked) return
                    setQueryOverride(event.target.checked)
                    clearQueryResult()
                  },
                }),
                jsx('span', { className: 'dd_label', children: t('check.queryOverride') }),
              ] }),
              jsx('p', { className: 'dd_hint', children: t('hint.queryOverride') }),
              jsxs('div', { className: 'dd_grid', children: [
                jsxs('label', { className: 'dd_field', children: [
                  jsx('span', { className: 'dd_label', children: t('field.queryCwd') }),
                  jsx('input', {
                    className: 'dd_input', name: 'cwd', value: queryCwd, placeholder: sharedRoot,
                    disabled: contextLocked || !queryOverride,
                    onChange: (event) => {
                      if (contextLocked || !queryOverride) return
                      setQueryCwd(event.target.value)
                      clearQueryResult()
                    },
                  }),
                  jsx('span', { className: 'dd_hint', children: t('field.queryCwd.hint') }),
                ] }),
                jsxs('label', { className: 'dd_field', children: [
                  jsx('span', { className: 'dd_label', children: t('field.queryCommand') }),
                  jsx('input', {
                    className: 'dd_input', name: 'command', value: queryCommand, disabled: contextLocked,
                    onChange: (event) => {
                      if (contextLocked) return
                      setQueryCommand(event.target.value)
                      clearQueryResult()
                    },
                  }),
                  jsx('span', { className: 'dd_hint', children: t('field.queryCommand.hint') }),
                ] }),
              ] }),
              jsx('div', { className: 'dd_presets', children: QUERY_PRESETS.map((preset) => jsx('button', {
                type: 'button', className: 'dd_btn dd_btnGhost', disabled: contextLocked,
                onClick: () => { setQueryCommand(preset); clearQueryResult() }, children: preset,
              }, preset)) }),
              jsx('button', {
                type: 'button', className: 'dd_btn dd_btnGhost', disabled: contextLocked || !canReadTarget,
                onClick: () => runQuery(), children: queryBusy ? t('msg.queryRunning') : t('btn.queryRun'),
              }),
              jsx('p', { className: 'dd_hint', children: t('hint.querySameChain') }),
            ],
          }),
          queryMsg.text === '' ? null : jsx('span', { className: 'dd_hint dd_msgErr', role: 'status', children: queryMsg.text }),
          queryOut === null ? null : jsx('pre', { className: 'dd_queryOut', 'data-kind': queryOut.kind, children: queryOut.text }),
        ],
      })

      const preflightState = contextResult?.ok === true ? 'pass'
        : contextResult?.ok === false && !contextResult.category ? 'fail' : 'not-verified'
      /*
       * 预检失败也**要分类**（`data-category`）：配置错、执行错、审计错、响应错、传输错不是一回事，
       * 恢复路径也不同。分类来源只有两处——服务端显式给的 `category`，或**精确命中**问题里那个
       * `code`（`CATEGORY_BY_CODE` 的等值查表）；都认不出就落 `response`（「这个响应不是预检的形状」）。
       * **不做子串推断**：正文里出现 "scope" 不等于它是配置错。
       */
      const preflightCategory = contextResult === null || contextResult.ok === true
        ? undefined
        : (explicitCategory(contextResult)
          ?? (Array.isArray(contextResult.problems)
            ? contextResult.problems.map((problem) => CATEGORY_BY_CODE[problem?.code]).find((value) => value !== undefined)
            : undefined)
          ?? (contextResult.problems?.length > 0 ? 'configuration' : 'response'))
      const faces = Array.isArray(evidence?.faces) ? evidence.faces : []
      const knownFaces = faces.filter((face) => ['ready', 'verify', 'web'].includes(face.face))
      const completeEvidence = ['ready', 'verify', 'web'].every((name) => knownFaces.some((face) => face.face === name))
      const evidenceFailed = knownFaces.some((face) => ['missing', 'unreadable', 'malformed', 'empty', 'multiple'].includes(face.state)
        || (face.state === 'parsed' && face.projectMatches !== true))
      const evidencePassed = completeEvidence && knownFaces.length === 3
        && knownFaces.every((face) => face.state === 'parsed' && face.projectMatches === true)
      const evidenceState = evidenceFailed ? 'fail' : evidencePassed ? 'pass' : 'not-verified'
      /*
       * 结果行：三态 +（失败时）分类。`data-category` **只在有分类时**写出来——没分类的行不带这个
       * 属性，比带一个 `unknown` 更诚实（`unknown` 会被读成「已经归过档」）。
       */
      const resultRow = (name, label, state, hint, detail, category) => jsxs('li', {
        className: 'dd_resultRow', 'data-check': name, 'data-state': state,
        ...(category === undefined ? {} : { 'data-category': category }),
        children: [
          jsx('span', { className: 'dd_label', children: label }),
          jsx('span', { className: 'dd_resultState', children: state === 'pass' ? t('status.pass') : state === 'fail' ? t('status.fail') : t('status.notVerified') }),
          category === undefined ? null : jsx('span', { className: 'dd_resultCategory', children: t('meta.category', { category: categoryLabel(category) }) }),
          jsx('p', { className: 'dd_hint', children: hint }),
          detail === '' || detail === undefined ? null : jsx('p', { className: 'dd_hint', children: detail }),
        ],
      }, name)
      const problemText = (problem) => [
        (problem.code ? '[' + problem.code + '] ' : '') + problem.field + ': ' + problem.message,
        typeof problem.root === 'string' ? t('field.contextRoot') + ': ' + problem.root : '',
        Array.isArray(problem.scopeDirs) ? t('field.targetScope') + ': ' + (problem.scopeDirs.join(' · ') || t('hint.scopeEmpty')) : '',
        typeof problem.hint === 'string' ? t('hint.queryRecovery', { hint: problem.hint }) : '',
      ].filter(Boolean).join('\n')
      const hasResults = contextResult !== null || readonlyResult !== null || evidence !== null || evidenceMsg.text !== ''
      const resultsPanel = jsxs('section', {
        className: 'dd_panel dd_resultsPanel', 'data-zone': 'results', 'aria-live': 'polite',
        children: [
          jsx('h4', { className: 'dd_panelTitle', children: t('section.results') }),
          invalidated ? jsx('p', { className: 'dd_hint dd_invalidated', children: t('hint.resultInvalidated') }) : null,
          !hasResults ? jsx('p', { className: 'dd_hint dd_resultsEmpty', children: t('hint.resultsEmpty') }) : null,
          jsx('ul', { className: 'dd_eviRows', children: [
            contextResult === null ? null : resultRow('preflight', t('panel.result.preflight'), preflightState,
              preflightState === 'pass' ? t('hint.resultPreflightPass')
                : preflightState === 'fail' ? t('hint.resultPreflightFail') : t('hint.resultPreflightIdle'),
              contextResult?.ok === false
                ? (Array.isArray(contextResult.problems) && contextResult.problems.length > 0
                  ? contextResult.problems.map(problemText).join('\n\n')
                  : t('msg.preflightFailed') + String(contextResult.error ?? ''))
                : '',
              preflightCategory),
            /*
             * 只读结果行：**只有合法观测值（非负安全整数）才算 pass**；结构化拒绝与传输错都是
             * 「没验成」（`not-verified`），分类另记。这条与 `runQuery` 的判据是一对。
             */
            readonlyResult === null ? null : resultRow('readonly', t('panel.result.readonly'), readonlyResult?.state ?? 'not-verified',
              readonlyResult?.state === 'pass' ? t('hint.resultReadonlyPass')
                : readonlyResult?.state === 'fail' ? t('hint.resultReadonlyFail') : t('hint.resultReadonlyIdle'),
              readonlyResult?.text ?? '', readonlyResult?.category),
            evidence === null && evidenceMsg.text === '' ? null : resultRow('evidence', t('panel.result.evidence'), evidenceState,
              evidenceState === 'pass' ? t('hint.resultEvidencePass')
                : evidenceState === 'fail' ? t('hint.resultEvidenceFail') : t('hint.resultEvidenceIdle'),
              evidenceMsg.text, evidenceState === 'fail' ? 'configuration' : undefined),
          ] }),

        ],
      })

      const toggle = (key, label, hint) =>
        jsxs('label', {
          className: 'dd_switch',
          children: [
            jsx('input', {
              type: 'checkbox',
              /* `name` 是验收脚本定位标量开关的稳定锚点（与 `text()` 同口径）。 */
              name: key,
              checked: form !== null && form[key] === true,
              disabled: form === null || busy,
              onChange: (event) => {
                setField(key, event.target.checked)
              },
            }),
            jsxs('span', {
              className: 'dd_switchText',
              children: [
                jsx('span', { className: 'dd_label', children: label }),
                hint === undefined ? null : jsx('span', { className: 'dd_hint', children: hint }),
              ],
            }),
          ],
        })

      /** 标量字段：短标签 + 输入框 +（可选）灰色口径小字。 */
      const text = (key, label, hint) =>
        jsxs('label', {
          className: 'dd_field',
          children: [
            jsx('span', { className: 'dd_label', children: label }),
            jsx('input', {
              className: 'dd_input',
              /*
               * `name` 是**给验收脚本定位用的稳定锚点**（真机 ㊹ 按 `name === 'timeoutMs'` 找那个
               * 输入框再改值）——卡片内部本来靠 `key` 闭包读写，但脚本只看得到 DOM。
               */
              name: key,
              type: key === 'auditFile' ? 'text' : 'number',
              value: form === null ? '' : String(form[key]),
              disabled: form === null || busy,
              onChange: (event) => {
                setField(key, event.target.value)
              },
            }),
            hint === undefined ? null : jsx('span', { className: 'dd_hint', children: hint }),
          ],
        })

      /** 一个目标草稿的文本字段（短标签 + 输入框 + 可选小字）。 */
      const targetField = (index, key, label, hint) =>
        jsxs('label', {
          className: 'dd_field',
          children: [
            jsx('span', { className: 'dd_label', children: label }),
            jsx('input', {
              className: 'dd_input',
              type: 'text', disabled: busy,
              value: targets[index] === undefined ? '' : String(targets[index][key]),
              onChange: (event) => {
                setTargetField(index, key, event.target.value)
              },
            }),
            hint === undefined ? null : jsx('span', { className: 'dd_hint', children: hint }),
          ],
        })

      /**
       * 一个目标草稿的**下拉**字段。
       *
       * 选项来自宿主快照（`config.engines` / `config.envs`）——枚举的真相在宿主侧的
       * `operations.ts` / `env.ts`，卡片再抄一份字面量必然漂。
       */
      const targetSelect = (index, key, label, options) =>
        jsxs('label', {
          className: 'dd_field',
          children: [
            jsx('span', { className: 'dd_label', children: label }),
            jsx('select', {
              className: 'dd_input',
              value: targets[index] === undefined ? '' : String(targets[index][key]), disabled: busy,
              onChange: (event) => {
                setTargetField(index, key, event.target.value)
              },
              children: [
                jsx('option', { value: '', children: key === 'engine' ? t('option.enginePick') : t('option.envUnset') }, 'empty'),
                ...options.map((option) => jsx('option', { value: option, children: option }, option)),
              ],
            }),
            key === 'env' ? jsx('span', { className: 'dd_hint', children: t('field.targetEnv.hint') }) : null,
          ],
        })

      /**
       * 环境胶囊：把「这一档能不能写」摆到行头上——**这是本卡片最该一眼看到的东西**。
       *
       * 判据来自宿主快照的 `envFacts`（`env.ts` 的档位表）而不是环境名：`test-shared` 与
       * `test-isolated` 光看名字都像「测试」，可写权限正好相反，**按名字猜就是猜**。老宿主
       * （快照里没有这一项）只摆名字、不猜权限。
       */
      const envChip = (row) => {
        const name = String(row.env === undefined ? '' : row.env).trim()
        const fact = envFacts[name]
        let tone = 'dd_chipIdle'
        let word = t('badge.envUnset')
        if (fact !== undefined) {
          if (fact.allowsWrite !== true) {
            tone = 'dd_chipIdle'
            word = t('badge.envReadonly')
          } else if (fact.requiresConfirm === true) {
            tone = 'dd_chipWarn'
            word = t('badge.envConfirm')
          } else {
            tone = 'dd_chipOk'
            word = t('badge.envWritable')
          }
        } else if (name !== '') {
          word = name
        }
        return jsxs('span', {
          className: 'dd_chip ' + tone,
          title: name === '' ? t('option.envUnset') : name + ' · ' + word,
          children: [jsx('span', { className: 'dd_dot' }), word],
        })
      }

      /** 一档能力的只读一行（**只读**：写入路径上服务端一律 400，见文件头）。 */
      const capLine = (target, field, label) => {
        const server = caps[target.id.trim()]
        const spec = server === undefined ? undefined : server[field]
        if (spec === undefined || typeof spec !== 'object') {
          return jsxs('div', {
            className: 'dd_cap',
            children: [
              jsx('span', { className: 'dd_capName', children: label }),
              jsx('span', { className: 'dd_capState dd_stateUnwired', children: t('meta.capNotWired') }),
            ],
          })
        }
        const via = spec.via === 'env' ? t('meta.grantViaEnv') : t('meta.grantViaFile')
        return jsxs('div', {
          className: 'dd_cap',
          children: [
            jsx('span', { className: 'dd_capName', children: label }),
            jsx('span', {
              className: 'dd_capState ' + (spec.granted === true ? 'dd_stateGranted' : 'dd_stateDenied'),
              children: spec.granted === true ? t('meta.capGranted', { via }) : t('meta.capDenied'),
            }),
            jsx('p', { className: 'dd_capMeta', children: t('meta.capDeclared', { env: spec.env, label: spec.label }) }),
            // 「怎么授权」**一直给**（已授权时也留着）：它是这张只读面板存在的理由——用户要能一眼
            // 看到「这条闸门靠什么开、现在开没开」，而不是在猜里过日子。
            jsx('p', { className: 'dd_capMeta', children: t('meta.capHowTo', { howTo: spec.howTo }) }),
          ],
        })
      }

      /*
       * 目标编辑器：**这一层必须带 `dd_card`**（验收脚本 ㉕ 用 `.dd_targets` → `closest('.dd_card')`
       * 定位它，为的是让确认框与标量里那两个复选框区分开）。`dd_panel` 只是视觉上的分组面板。
       */
      const targetEditor = jsxs('div', {
        className: 'dd_card dd_panel',
        /* 「配置数据目标」那枚入口展开高级设置后滚动定位到这一层（`targetEditorRef`）。 */
        ref: targetEditorRef,
        children: [
          jsxs('div', {
            className: 'dd_panelHead',
            children: [
              jsx('span', { className: 'dd_panelTitle', children: t('section.targets') }),
              jsx('span', { className: 'dd_count', children: String(targets.length) }),
            ],
          }),
          targets.length === 0
            ? jsx('p', { className: 'dd_empty', children: t('list.emptyTargets') })
            : jsx('ul', {
                className: 'dd_targets',
                children: targets.map((row, index) =>
                  jsxs(
                    'li',
                    {
                      className: 'dd_target',
                      children: [
                        jsxs('div', {
                          className: 'dd_targetHead',
                          children: [
                            jsx('span', { className: 'dd_ordinal', children: String(index + 1) }),
                            jsx('span', { className: 'dd_targetName', children: row.id.trim() === '' ? t('field.targetId') : row.id }),
                            envChip(row),
                            jsx('button', {
                              type: 'button',
                              className: 'dd_remove', disabled: busy,
                              onClick: () => {
                                if (busy) return
                                setTargets((rows) => rows.filter((_item, i) => i !== index))
                                setConfirmTargets(false)
                              },
                              children: t('btn.removeTarget'),
                            }),
                          ],
                        }),
                        /*
                         * 这 11 个字段的**顺序就是验收脚本按 `.dd_input` 取的顺序**（它按下标写值：
                         * [0]=id … [8]=库 / [9]=可浏览的库 / [10]=凭据引用）。栅格改的是视觉，不是顺序
                         * ——重排这里等于把 ㉕㉖ 弄红。
                         */
                        jsxs('div', {
                          className: 'dd_grid',
                          children: [
                            targetField(index, 'id', t('field.targetId'), t('field.targetId.hint')),
                            targetField(index, 'label', t('field.targetLabel')),
                            targetSelect(index, 'engine', t('field.targetEngine'), engines),
                            targetSelect(index, 'env', t('field.targetEnv'), envs),
                            targetField(index, 'scopeDirs', t('field.targetScope'), t('field.targetScope.hint')),
                            targetField(index, 'maxScanCount', t('field.targetMaxScan'), t('field.targetMaxScan.hint')),
                            targetField(index, 'host', t('field.targetHost'), t('field.targetHost.hint')),
                            targetField(index, 'port', t('field.targetPort'), t('field.targetPort.hint')),
                            targetField(index, 'db', t('field.targetDb'), t('field.targetDb.hint')),
                            targetField(index, 'dbs', t('field.targetDbs'), t('field.targetDbs.hint')),
                            targetField(index, 'credentialRef', t('field.targetCredential'), t('field.targetCredential.hint')),
                          ],
                        }),
                        row.id.trim() !== '' && caps[row.id.trim()] === undefined
                          ? jsx('p', { className: 'dd_hint', children: t('hint.capNewRow') }) : null,
                      ],
                    },
                    'target-' + String(index),
                  ),
                ),
              }),
          jsx('button', {
            type: 'button',
            className: 'dd_btn dd_btnGhost dd_addBtn', disabled: busy,
            onClick: () => {
              if (busy) return
              setTargets((rows) => [
                ...rows,
                {
                  id: '',
                  label: '',
                  engine: '',
                  env: '',
                  scopeDirs: '',
                  maxScanCount: '',
                  host: '',
                  port: '',
                  db: '',
                  dbs: '',
                  credentialRef: '',
                },
              ])
              setConfirmTargets(false)
            },
            children: t('btn.addTarget'),
          }),
          targetsDirty
            ? jsxs('label', {
                className: 'dd_confirm',
                children: [
                  jsx('input', {
                    type: 'checkbox',
                    checked: confirmTargets, disabled: busy,
                    onChange: (event) => {
                      if (busy) return
                      setConfirmTargets(event.target.checked)
                    },
                  }),
                  jsx('span', { className: 'dd_hint', children: t('check.confirmTargets') }),
                ],
              })
            : null,
        ],
      })

      return jsxs('div', {
        className: 'dd_card',
        children: [
          jsxs('header', {
            className: 'dd_head',
            children: [
              jsx('h3', { className: 'dd_name', children: t('card.name') }),
              jsx('p', { className: 'dd_desc', children: t('card.desc') }),
            ],
          }),
          quickStartPanel,
          resultsPanel,
          jsxs('details', {
            className: 'dd_panel dd_configAdvanced', 'data-zone': 'advanced',
            ref: advancedPanelRef,
            children: [
              jsx('summary', { children: t('section.advanced') }),
              jsx('p', { className: 'dd_hint', children: t('hint.advanced') }),
              form === null
                ? jsx('p', { className: 'dd_hint', children: message.text === '' ? t('msg.loading') : message.text })
                : jsxs('div', { className: 'dd_configBody', children: [
                  jsxs('section', { className: 'dd_panel', children: [
                    jsx('h4', { className: 'dd_panelTitle', children: t('section.config') }),
                    toggle('enabled', t('check.enabled')),
                    toggle('announceToAgent', t('check.announce')),
                  ] }),
                  targetEditor,
                  jsxs('section', { className: 'dd_panel', children: [
                    jsx('h4', { className: 'dd_panelTitle', children: t('section.capability') }),
                    jsx('p', { className: 'dd_hint', children: t('hint.capReadonly') }),
                    jsx('p', { className: 'dd_hint', children: t('hint.envPermission') }),
                    savedTargets.length === 0 ? jsx('p', { className: 'dd_empty', children: t('list.emptyTargets') })
                      : savedTargets.map((row) => jsxs('div', { className: 'dd_caps', children: [
                        jsx('h5', { className: 'dd_panelTitle', children: row.label || row.id }),
                        capLine(row, 'writeCapability', 'writeCapability'),
                        capLine(row, 'dangerousReadCapability', 'dangerousReadCapability'),
                      ] }, row.id)),
                  ] }),
                  jsxs('section', { className: 'dd_panel', children: [
                    jsx('h4', { className: 'dd_panelTitle', children: t('section.queryLimits') }),
                    text('timeoutMs', t('field.timeoutMs'), t('field.timeoutMs.hint')),
                    jsxs('div', { className: 'dd_grid', children: [
                      jsx('p', { className: 'dd_caption', children: t('panel.planGroup') }),
                      text('planMaxRows', t('field.planMaxRows'), t('field.planMaxRows.hint')),
                      text('planMaxCost', t('field.planMaxCost'), t('field.planMaxCost.hint')),
                    ] }),
                  ] }),
                  jsxs('section', { className: 'dd_panel', children: [
                    jsx('h4', { className: 'dd_panelTitle', children: t('section.audit') }),
                    text('auditFile', t('field.auditFile'), t('field.auditFile.hint')),
                  ] }),
                  jsxs('div', { className: 'dd_actions', children: [
                    message.text === '' ? null : jsx('span', {
                      className: 'dd_msg ' + (message.kind === 'err' ? 'dd_msgErr' : 'dd_msgOk'), role: 'status', children: message.text,
                    }),
                    jsx('span', { className: 'dd_spacer' }),
                    jsx('button', {
                      type: 'button', className: 'dd_btn dd_btnPrimary', disabled: contextLocked,
                      onClick: save, children: busy ? t('btn.saving') : t('btn.save'),
                    }),
                  ] }),
                ] }),
            ],
          }),
          evidencePanel,
          queryPanel,
        ],
      })
    }

    /* ========================= 侧边栏面板：数据浏览器 ========================= */

    /*
     * **P14 第二版**（2026-10-04）：把「树」做出来——目标 → key → 内容预览。
     *
     * 三条判据在这一层就要守住（它们是这套东西的立身之本，不是装饰）：
     *   1. **只发只读命令，且只经那两条宿主路由**：面板不拼命令原文去 `/query`（那条路是给
     *      「有判断力的调用方」的），它用 `/keys` 与 `/key`——宿主侧固定形态、照样过同一条链；
     *   2. **不许有空白**：key 与 MATCH 模式含空白时，服务端会拒（命令原文按空白切分）——界面
     *      提前拦一次只是省一个来回，**真正的判据在服务端**（这一层拦不住绕过 UI 的请求）；
     *   3. **预览有上限**：上限在宿主侧写死（`keyspace.ts`），界面只如实标「还有更多」。
     */
    const KEYS_PATH = '/api/dsh-devdata/keys'
    const KEY_PATH = '/api/dsh-devdata/key'
    /** 三条路由：库那一层（`INFO keyspace`）、表格的一页（`/rows`）、一个 key 的详情（`/key`）。 */
    const KEYSPACE_PATH = '/api/dsh-devdata/keyspace'
    const ROWS_PATH = '/api/dsh-devdata/rows'
    /** 面板记住「上次用的目标 / 项目根」——它是每次开面板都要重填的两个框。 */
    const PANEL_STORE = 'dsh-devdata:panel'

    function readPanelStore() {
      try {
        const raw = window.localStorage.getItem(PANEL_STORE)
        const parsed = raw === null ? null : JSON.parse(raw)
        if (parsed !== null && typeof parsed === 'object') return parsed
      } catch {
        /* 读不到就当没有：面板不该因为 localStorage 坏了打不开 */
      }
      return {}
    }

    /**
     * 面板的记住项（`localStorage`）：**目标 + 作用域基准 + 每个目标上次看的那个库**。
     *
     * `dbs` 是 `{目标 id: 库号}` 的小表：库号是「哪个目标上的哪个库」，所以按目标分开记——否则切到
     * 另一台机器会带着上一台选的库号过去。它**只是偏好**：下次打开照样由宿主判能不能去（`/keys`
     * 的 `db` 参数），判不过就回落到目标声明的缺省库。
     */
    function writePanelStore(patch, targetId, db) {
      try {
        const before = readPanelStore()
        const dbs = before.dbs !== null && typeof before.dbs === 'object' && !Array.isArray(before.dbs) ? before.dbs : {}
        const nextDbs = targetId === undefined || typeof db !== 'number' ? dbs : { ...dbs, [targetId]: db }
        window.localStorage.setItem(PANEL_STORE, JSON.stringify({ ...before, ...patch, dbs: nextDbs }))
      } catch {
        /* 同上：存不下只是下次要重填 */
      }
    }

    /** 一个 key 的类型 / 预览视图（宿主 `/key` 的返回体）。 */
    function KeyspacePanel() {
      const remembered = React.useMemo(readPanelStore, [])
      const [targets, setTargets] = React.useState([])
      const [target, setTarget] = React.useState(typeof remembered.target === 'string' ? remembered.target : '')
      const [scope, setScope] = React.useState(typeof remembered.scope === 'string' ? remembered.scope : '')
      const [match, setMatch] = React.useState('')
      const [count, setCount] = React.useState('200')
      const [cursor, setCursor] = React.useState('0')
      const [keys, setKeys] = React.useState([])
      const [command, setCommand] = React.useState('')
      const [scanned, setScanned] = React.useState(false)
      const [listMsg, setListMsg] = React.useState({ text: '', kind: '' })
      const [listBusy, setListBusy] = React.useState(false)
      /*
       * 库那一层：**一个对象装完**（`kind` 三态），因为「INFO 说没有库」与「INFO 读不上」必须分开——
       * 混成一个空数组，界面就会在**读失败**时画出「这台机器上还没有任何库」「0 个 key」，
       * 而 key 列表明明扫出来了（2026-10-04 维护者截图里正是这种自相矛盾）。
       *
       *   - `loading`：还没读；
       *   - `ok`：INFO 真的回了。`reported` = 它报的（**只含有 key 的库**）；`declared` = 目标声明的
       *     允许集（`db` ∪ `dbs`）；`current` = 打开时默认去那个库；
       *   - `failed`：读不上（`dbError` 里有原因）。这时**只有** `declared` 可用（来自 `/config` 快照），
       *     键数一律显示「未知」——绝不当成 0。
       */
      const [dbInfo, setDbInfo] = React.useState({ kind: 'loading' })
      /** 当前浏览的库（数值；`null` = 还没定）。库号只来自声明集或服务器报的（宿主判，见 `/keys` 路由）。 */
      const [db, setDb] = React.useState(null)
      /** 库那一层的错误：**单独一格**——它不能被 `scan()` 的成功清掉（那正是上面那种矛盾的成因之一）。 */
      const [dbError, setDbError] = React.useState('')
      /* 树中间那层：类型（**按本页统计**，用户点了才付那 N 次调用）。 */
      /*
       * 表格里每一行的 Type / Value / Size / TTL：`{key: row}`。**没读过的 key 不在表里**——
       * 界面把「还没问过」画成 `—`，把「问过了、是空的」画成 `空`，两者不许混成一句。
       */
      const [rows, setRows] = React.useState({})
      const [rowsBusy, setRowsBusy] = React.useState(false)
      /** 这一轮「读取这一页」已经读回来几个（按钮上的进度，纯显示）。 */
      const [rowsDone, setRowsDone] = React.useState(0)
      const [selected, setSelected] = React.useState('')
      const [detail, setDetail] = React.useState(null)
      const [detailBusy, setDetailBusy] = React.useState(false)
      /**
       * 「刚复制过」那一秒（详情头上那枚 ✓）。**只在真的写进剪贴板之后才亮**——
       * 剪贴板拿不到（非安全上下文 / 用户没授权）时不亮、也不报错，就当没这一下。
       */
      const [copied, setCopied] = React.useState(false)
      React.useEffect(() => {
        if (!copied) return undefined
        const timer = setTimeout(() => setCopied(false), 1600)
        return () => clearTimeout(timer)
      }, [copied])
      /*
       * 树自己的折叠态：`closedNodes[nodeId] === true` = 折起来了。**默认全展开**
       * （只有真有子节点的行才进这个表：连接、当前那个库、按类型分组后的每一组）。
       * 键是 `conn` / `db<index>` / `type:<bucket>`——它们只在这一次渲染里有意义，不进 localStorage。
       */
      const [closedNodes, setClosedNodes] = React.useState({})
      const isNodeOpen = (nodeId) => closedNodes[nodeId] !== true
      const toggleNode = (nodeId) => {
        setClosedNodes((prev) => ({ ...prev, [nodeId]: prev[nodeId] !== true }))
      }

      const redisTargets = targets.filter((row) => row.engine === 'redis' && String(row.id).trim() !== '')
      const effectiveTarget = target !== '' ? target : redisTargets.length === 0 ? '' : String(redisTargets[0].id)
      const currentTarget = redisTargets.find((row) => String(row.id) === effectiveTarget)
      const scopeDirs = currentTarget !== undefined && Array.isArray(currentTarget.scopeDirs)
        ? currentTarget.scopeDirs.map((dir) => String(dir)).filter((dir) => dir !== '')
        : []
      const scopeUsable = scope.trim() !== '' && (scopeDirs.length === 0 || scopeDirs.includes(scope.trim()))
      const keyItems = Array.isArray(keys) ? keys : []
      const connection = currentTarget === undefined ? '' : [currentTarget.host, currentTarget.port].filter((part) => part !== undefined && part !== '').join(':')

      const fail = (data, error) => {
        const parts = []
        if (typeof data?.code === 'string' && data.code !== '') parts.push(data.code)
        if (typeof data?.error === 'string') parts.push(data.error)
        if (typeof data?.hint === 'string' && data.hint !== '') parts.push(t('hint.queryRecovery', { hint: data.hint }))
        if (parts.length === 0) parts.push(String(error && error.message ? error.message : error))
        return parts.join('\n')
      }

      const post = (path, body) =>
        fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((res) => res.json())

      /**
       * 复制一个 key 名到剪贴板。**本地的、不发请求**——所以它不经过判据链、也不进审计；
       * 拿不到剪贴板（非安全上下文）时静默收场：不弹错，也不亮那枚 ✓（不假装成功）。
       */
      const copyKey = (text) => {
        try {
          const done = navigator.clipboard?.writeText(text)
          if (done !== undefined && typeof done.then === 'function') done.then(() => setCopied(true), () => {})
        } catch {
          /* 同上：静默 */
        }
      }

      /**
       * 目标声明里允许浏览的库（**读不上 INFO 时的退路**）。
       *
       * 用面板已经拿到的 `/config` 快照（`db` ∪ `dbs`）——所以库那一层读失败时，树**照样**能列出
       * 声明的库、照样能扫 key，只是键数显示「未知」。没有快照时退回 `[0]`（Redis 连接的默认库）。
       */
      const declaredFromSnapshot = (targetId) => {
        const row = redisTargets.find((item) => String(item.id) === targetId)
        const list = []
        if (row !== undefined) {
          if (typeof row.db === 'number') list.push(row.db)
          if (Array.isArray(row.dbs)) for (const item of row.dbs) if (typeof item === 'number') list.push(item)
        }
        if (list.length === 0) list.push(0)
        return [...new Set(list)].sort((left, right) => left - right)
      }

      /**
       * 读树的第一层：`INFO keyspace`（一条命令，照样过判据链）。
       *
       * 返回**这次该去哪个库**（调用方拿它去扫第一页）——它可能因为「请求的库不在允许集里」而回落到
       * 缺省那个库。`wanted` 只是「尽量去这个」，**能不能去由宿主判**。
       */
      const loadKeyspace = (targetId, cwd, wanted) => {
        if (targetId === '' || cwd.trim() === '') return Promise.resolve(undefined)
        const giveUp = (text) => {
          const declared = declaredFromSnapshot(targetId)
          setDbInfo({ kind: 'failed', declared, current: declared[0] })
          setDbError(text)
          const next = typeof wanted === 'number' ? wanted : declared[0]
          setDb(next)
          return next
        }
        return post(KEYSPACE_PATH, { target: targetId, cwd: cwd.trim() })
          .then((data) => {
            if (data !== null && typeof data === 'object' && data.ok === true && Array.isArray(data.dbs)) {
              const reported = data.dbs.filter(
                (row) => row !== null && typeof row === 'object' && typeof row.index === 'number' && typeof row.keys === 'number',
              )
              const declaredRaw = Array.isArray(data.declared) ? data.declared.filter((index) => typeof index === 'number') : []
              const current = typeof data.current === 'number' ? data.current : 0
              const declared = declaredRaw.length > 0 ? declaredRaw : [current]
              setDbInfo({ kind: 'ok', reported, declared, current })
              setDbError('')
              const allowed = [...new Set([...declared, ...reported.map((row) => row.index)])]
              const next = typeof wanted === 'number' && allowed.includes(wanted) ? wanted : current
              setDb(next)
              return next
            }
            return giveUp(t('msg.keyspaceFailed') + fail(data, ''))
          })
          .catch((error) => giveUp(t('msg.keyspaceFailed') + fail(null, error)))
      }

      /**
       * 扫一页（**显式传目标 / 基准 / 库**：切目标、切库时状态还没落地，不能读 state）。
       *
       * `dbIndex` 一定来自 `loadKeyspace` 的结果或用户点的那一行（两者都是宿主判过允许的编号）——
       * 宿主那边还会再判一次（`/keys` 的 `db` 参数），所以这里传错也只是被拒，不会跑偏。
       */
      /**
       * 搜索框里的字 → 真正发给服务端的 `MATCH` 模式。
       *
       * **没有通配符时当成「包含」**：两边补 `*`（`user` → `*user*`）——图里那个框叫 `Keys Contain`，
       * 而这个动作就是它的语义；写了 `*` / `?` / `[` 就**原样发**（那是人在写模式）。
       *
       * 补星号这件事**不许藏在暗处**：真正发出去的那条命令一直印在下面那行「发了：…」里，所以
       * 「我输的是 user，发出去的怎么是 `*user*`」当场就能看见。含空白的模式照旧在服务端被拒
       * （解析层按空白切分，见 `keyspace.ts`）。
       */
      const patternFrom = (raw) => {
        const text = String(raw === undefined ? '' : raw).trim()
        if (text === '') return undefined
        return /[*?[\]]/.test(text) ? text : '*' + text + '*'
      }
      const matchPattern = () => patternFrom(match)

      /*
       * `patternText`：**显式的模式覆盖**（第五版，给搜索框那枚「×」用）。不传 = 按输入框当前的值
       * （`matchPattern()`）；传**空串** = 这一页不带 MATCH（那就是「清掉筛选再扫一页」）。直接读
       * state 是不行的：`setMatch('')` 之后同一个闭包里的 `match` 还是旧值，清掉的重扫会把旧模式
       * 又发一遍。
       */
      const scanWith = (targetId, cwd, dbIndex, from, patternText) => {
        if (listBusy) return
        if (targetId === '') {
          setListMsg({ text: t('list.keyspaceNoTargets'), kind: 'err' })
          return
        }
        if (cwd.trim() === '') {
          setListMsg({ text: t('msg.keyspaceNeedScope'), kind: 'err' })
          return
        }
        const cursorFrom = from === undefined || from === null ? '0' : String(from)
        setListBusy(true)
        setListMsg({ text: '', kind: '' })
        post(KEYS_PATH, {
          target: targetId,
          cwd: cwd.trim(),
          ...(typeof dbIndex === 'number' ? { db: dbIndex } : {}),
          cursor: cursorFrom,
          match: patternText === undefined ? matchPattern() : patternFrom(patternText),
          count: count.trim() === '' ? undefined : Number(count),
        })
          .then((data) => {
            setListBusy(false)
            if (data !== null && typeof data === 'object' && data.ok === true && Array.isArray(data.keys)) {
              setKeys(data.keys.map((key) => String(key)))
              setCursor(String(data.cursor))
              setCommand(typeof data.command === 'string' ? data.command : '')
              setScanned(true)
              setRows({})
              setListMsg({ text: '', kind: '' })
              // 握手：回复里带 `db` = 宿主半体支持切库（见 `dbSwitchable`）。
              setDbSwitchable(typeof data.db === 'number')
              if (cursorFrom === '0') {
                setSelected('')
                setDetail(null)
              }
              writePanelStore({ target: targetId, scope: cwd.trim() }, targetId, typeof dbIndex === 'number' ? dbIndex : undefined)
              return
            }
            setListMsg({ text: t('msg.keyspaceFailed') + fail(data, ''), kind: 'err' })
          })
          .catch((error) => {
            setListBusy(false)
            setListMsg({ text: t('msg.keyspaceFailed') + fail(null, error), kind: 'err' })
          })
      }

      /** 工具条上的「扫描 / 继续扫描」：用当前目标 + 基准 + 库。 */
      const scan = (next) => {
        scanWith(effectiveTarget, scope, db, next)
      }

      /**
       * 宿主半体支不支持**切库**（握手，一行）。
       *
       * `/keys` 的回复里带不带 `db` 就是那个握手：新版带（选中的库是它的返回值之一），旧版不带。
       * 为什么要这一步：旧宿主**不认** `db` 参数，会照目标声明的库去扫——界面把行标成「当前浏览 db2」
       * 而实际扫的是 db0，那是**谎报**（比功能缺失坏得多）。所以旧宿主上：行照列（INFO 报的还在），
       * 但**点不动**，并明写「重启宿主后这一层才能切」。
       */
      const [dbSwitchable, setDbSwitchable] = React.useState(true)

      /**
       * 切到另一个库（树上一行点一下）。
       *
       * 切库 = **重新扫一页**（key 列表是「某个库的 key」，不是全局的），并清掉旧的选中与详情——
       * 留着上一个库的 key 详情才是错诊断（那个 key 在这个库里可能根本不存在）。
       */
      const switchDb = (index) => {
        if (index === db || listBusy) return
        if (dbSwitchable !== true) {
          setListMsg({ text: t('msg.keyspaceDbOldHost'), kind: 'err' })
          return
        }
        setDb(index)
        setKeys([])
        setSelected('')
        setDetail(null)
        setScanned(false)
        setCursor('0')
        setRows({})
        setListMsg({ text: '', kind: '' })
        scanWith(effectiveTarget, scope, index, '0')
      }

      /** 还没读过的那几个 key（按钮上的 `—` 就是它们）。 */
      const pendingCount = () => keyItems.filter((key) => (rows !== null && typeof rows === 'object' ? rows[key] : undefined) === undefined).length

      /*
       * 「读取这一页」：把这一页还没读的行**分批**读回来，一边读一边填。
       *
       * 一批最多 `ROW_CHUNK` 个（= 宿主那条路由写死的 `ROW_BATCH_MAX`：一个 key 3~4 条命令，
       * 一批就是 60~80 次调用 / 同样多行审计）。分批的**不是**为了绕过上限，是为了让 59 个 key 的
       * 一页别再等一个长请求——每批回来就填一批，进度写在按钮上。
       */
      const ROW_CHUNK = 20

      const readRows = () => {
        if (rowsBusy || listBusy || !scopeUsable) return
        const pending = keyItems.filter((key) => (rows !== null && typeof rows === 'object' ? rows[key] : undefined) === undefined)
        if (pending.length === 0) return
        setRowsBusy(true)
        setRowsDone(0)
        const step = (index, done) => {
          if (index >= pending.length) {
            setRowsBusy(false)
            return
          }
          const slice = pending.slice(index, index + ROW_CHUNK)
          post(ROWS_PATH, {
            target: effectiveTarget,
            cwd: scope.trim(),
            ...(typeof db === 'number' ? { db } : {}),
            keys: slice,
          })
            .then((data) => {
              if (data === null || typeof data !== 'object' || data.ok !== true || !Array.isArray(data.rows)) {
                setRowsBusy(false)
                setListMsg({ text: t('msg.keyspaceFailed') + fail(data, ''), kind: 'err' })
                return
              }
              const next = {}
              for (const row of data.rows) if (row !== null && typeof row === 'object' && typeof row.key === 'string') next[row.key] = row
              setRows((prev) => ({ ...prev, ...next }))
              setRowsDone(done + slice.length)
              step(index + slice.length, done + slice.length)
            })
            .catch((error) => {
              setRowsBusy(false)
              setListMsg({ text: t('msg.keyspaceFailed') + fail(null, error), kind: 'err' })
            })
        }
        step(0, 0)
      }

      const openKey = (key) => {
        if (detailBusy) return
        setSelected(key)
        setDetailBusy(true)
        setDetail({ pending: true })
        post(KEY_PATH, {
          target: effectiveTarget,
          cwd: scope.trim(),
          ...(typeof db === 'number' ? { db } : {}),
          key,
        })
          .then((data) => {
            setDetailBusy(false)
            if (data !== null && typeof data === 'object' && data.ok === true && typeof data.key === 'object') {
              setDetail(data.key)
              /*
               * 顺手把**表格那一行**填上：`/key` 与 `/rows` 给的是同一份视图（同一个 `shapeKeyView`
               * + 同一个 `previewText`），所以点开一行不该让那一行的格子还是 `—`——那看着像没读到。
               * 这一格**不多花一次调用**（这几条命令本来就发了）。
               */
              setRows((prev) => ({
                ...prev,
                [key]: {
                  key,
                  type: data.key.type,
                  ttl: data.key.ttl,
                  total: data.key.total,
                  totalKind: data.key.totalKind,
                  preview: data.key.preview,
                  truncated: data.key.truncated,
                },
              }))
              return
            }
            setDetail({ error: fail(data, '') })
          })
          .catch((error) => {
            setDetailBusy(false)
            setDetail({ error: fail(null, error) })
          })
      }

      React.useEffect(() => {
        fetch(CONFIG_PATH, { cache: 'no-store' })
          .then((res) => res.json())
          .then((data) => {
            if (data !== null && typeof data === 'object' && data.ok === true && Array.isArray(data.config?.targets)) {
              setTargets(data.config.targets)
            }
          })
          .catch(() => {
            /* 目标表读不到时面板仍要能打开：下面会显示「没有 redis 目标」。 */
          })
      }, [])

      /*
       * 「打开就能看」：作用域目录一确定就填上基准 → **同时**读库列表（树的第二层）并扫一页。
       * `autoRan` 是 ref 而不是 state——否则每次渲染都会再发一次。
       */
      const autoRan = React.useRef(false)
      React.useEffect(() => {
        if (scopeDirs.length > 0 && (scope.trim() === '' || !scopeDirs.includes(scope.trim()))) {
          setScope(scopeDirs[0])
          return
        }
        if (autoRan.current || effectiveTarget === '' || scope.trim() === '') return
        autoRan.current = true
        const targetId = effectiveTarget
        const cwd = scope
        const rememberedDb = remembered.dbs !== null && typeof remembered.dbs === 'object' ? remembered.dbs[targetId] : undefined
        loadKeyspace(targetId, cwd, typeof rememberedDb === 'number' ? rememberedDb : undefined).then((dbIndex) => {
          scanWith(targetId, cwd, dbIndex, '0')
        })
      }, [effectiveTarget, scope, scopeDirs.join('|')])

      /* 切换目标：库层与 key 层都要重新读（不同目标可能是不同机器 / 不同库）。 */
      const pickTarget = (nextId) => {
        setTarget(nextId)
        setListMsg({ text: '', kind: '' })
        setDbInfo({ kind: 'loading' })
        setDb(null)
        setDbError('')
        setKeys([])
        setSelected('')
        setDetail(null)
        setScanned(false)
        setCursor('0')
        setRows({})
        const row = redisTargets.find((item) => String(item.id) === nextId)
        const dirs = row !== undefined && Array.isArray(row.scopeDirs) ? row.scopeDirs.map((dir) => String(dir)).filter((dir) => dir !== '') : []
        const nextScope = dirs.length > 0 ? dirs[0] : scope.trim()
        setScope(nextScope)
        autoRan.current = true
        /* 库号**记住在那个目标上**：切回来仍去同一个库（它是宿主判过允许的编号，回来还会再判一次）。 */
        const rememberedDb = remembered.dbs !== null && typeof remembered.dbs === 'object' ? remembered.dbs[nextId] : undefined
        loadKeyspace(nextId, nextScope, typeof rememberedDb === 'number' ? rememberedDb : undefined).then((dbIndex) => {
          scanWith(nextId, nextScope, dbIndex, '0')
        })
      }

      const ttlText = (value) => {
        if (value === -2) return t('meta.keyspaceTtlMissing')
        if (value === -1) return t('meta.keyspaceTtlForever')
        return t('meta.keyspaceTtlSeconds', { ttl: String(value) })
      }

      const totalText = (view) => {
        if (view.total === null || view.total === undefined) return null
        if (view.totalKind === 'bytes') return t('meta.keyspaceTotalBytes', { total: String(view.total) })
        if (view.totalKind === 'items') return t('meta.keyspaceTotalItems', { total: String(view.total) })
        if (view.totalKind === 'fields') return t('meta.keyspaceTotalFields', { total: String(view.total) })
        return t('meta.keyspaceTotalMembers', { total: String(view.total) })
      }

      /* ------------------------------- 视觉零件 ------------------------------- */

      /**
       * 图标：第三个参数是**附加 class**（只有类型上色用 `dd_kt_*`）。
       * 不给就还是原来那个灰——图标本身不带语义，语义在颜色与旁边的文字里。
       */
      const icon = (path, size, extra) =>
        jsx('svg', {
          className: extra === undefined ? 'dd_treeIcon' : 'dd_treeIcon ' + extra,
          width: size === undefined ? 14 : size,
          height: size === undefined ? 14 : size,
          viewBox: '0 0 16 16',
          'aria-hidden': 'true',
          children: jsx('path', { fill: 'currentColor', d: path }),
        })
      const DB_ICON = 'M8 1.2c-3.1 0-5.6 1-5.6 2.3v8.9c0 1.3 2.5 2.4 5.6 2.4s5.6-1.1 5.6-2.4V3.5c0-1.3-2.5-2.3-5.6-2.3Zm0 1.4c2.5 0 4.1.7 4.1 1.2s-1.6 1.2-4.1 1.2S3.9 4.3 3.9 3.8 5.5 2.6 8 2.6Zm4.1 9.8c0 .5-1.6 1.2-4.1 1.2s-4.1-.7-4.1-1.2v-2c1 .5 2.5.8 4.1.8s3.1-.3 4.1-.8v2Zm0-3.6c0 .5-1.6 1.2-4.1 1.2s-4.1-.7-4.1-1.2V7c1 .5 2.5.8 4.1.8S11.1 7.5 12.1 7v1.8Z'
      const KEY_ICON = 'M9.5 1a5.5 5.5 0 0 0-5.2 7.3L1 11.6V15h3.4l.8-.8v-1.4h1.4l.8-.8v-1.4h1.4l1.1-1.1A5.5 5.5 0 1 0 9.5 1Zm2.2 5.4a1.4 1.4 0 1 1 0-2.8 1.4 1.4 0 0 1 0 2.8Z'
      const TYPE_ICON = 'M3 2.5h10v2H3v-2Zm0 4.5h10v2H3V7Zm0 4.5h6v2H3v-2Z'
      /**
       * 折叠 / 展开那两个字符：**图里就是 `>` 与 `⌄`**（不是 `▸` / `▾`）。
       * 有子节点的行才画它——给没有子节点的行画一个能点的箭头才是骗人（见 `twisty`）。
       */
      const COLLAPSED = '>'
      const EXPANDED = '⌄'

      /** 搜索框与搜索按钮上的放大镜（图里那枚）。 */
      const SEARCH_ICON = 'M6.8 1.6a5.2 5.2 0 1 0 3.2 9.3l3.1 3.1 1.1-1.1-3.1-3.1A5.2 5.2 0 0 0 6.8 1.6Zm0 1.6a3.6 3.6 0 1 1 0 7.2 3.6 3.6 0 0 1 0-7.2Z'

      /**
       * `TYPE` 的原话 → 一个颜色族。**纯粹是观感**（读数辅助）：界面上显示的一直是 `TYPE` 的原话，
       * 连模块类型（`ReJSON-RL` 之类）也照原样显示，只是落进 `dd_kt_other` 那一档的灰。
       */
      const kindClass = (type) => {
        if (type === 'string') return 'dd_kt_string'
        if (type === 'list') return 'dd_kt_list'
        if (type === 'set') return 'dd_kt_set'
        if (type === 'hash') return 'dd_kt_hash'
        if (type === 'zset') return 'dd_kt_zset'
        return 'dd_kt_other'
      }

      /*
       * 三角：**有子节点的行才是开关**。
       *
       *   - 传了 `nodeId` → 一个真按钮（`aria-expanded` + 键盘可达）：点子节点会折叠/展开；
       *   - 只传 `open` → 一个**纯装饰**的三角（目前只用于将来可能的分组行）；
       *   - `open === undefined` → **空白占位**（等宽）：这一行没有子节点。给没有子节点的行画一个
       *     `▸` 才是骗人——用户会去点它，然后发现毫无反应。
       *
       * 这三态是 P14 第二版补的：第一版把三角画成了纯装饰（硬写 `open=true`），于是树看着能
       * 展开、点下去一点反应都没有（用户反馈原话：「树怎么没法展开和折叠」）。
       */
      const twisty = (open, nodeId) => {
        if (nodeId !== undefined) {
          return jsx('button', {
            type: 'button',
            className: 'dd_treeTwisty dd_treeToggle',
            'data-open': open ? '1' : '0',
            'aria-expanded': open ? 'true' : 'false',
            onClick: (event) => {
              event.stopPropagation()
              toggleNode(nodeId)
            },
            children: open ? EXPANDED : COLLAPSED,
          })
        }
        return jsx('span', {
          className: 'dd_treeTwisty',
          'data-open': open === true ? '1' : '0',
          'aria-hidden': 'true',
          children: open === undefined ? '' : open ? EXPANDED : COLLAPSED,
        })
      }

      const field = (label, child) =>
        jsxs('div', {
          className: 'dd_field',
          children: [jsx('span', { className: 'dd_label', children: label }), child],
        })

      const metaLine = () => {
        if (command === '') return null
        /*
         * 只报**发了什么**（命令 + 游标）：「本页 N 个 key」与表格栏头那枚数字是同一个数，
         * 两处都印就是重复（2026-10-05 截图）——数字贴着表才是它的位置，这里删的是前者。
         * `MATCH *user*` 的判据（补星号不藏在暗处）照样印在这一行里。
         */
        const parts = [t('meta.keyspaceCommand', { command })]
        if (cursor !== '0') parts.push(t('meta.keyspaceCursor', { cursor }))
        return jsx('p', { className: 'dd_metaRow dd_shellMeta', children: parts.join(' · ') })
      }

      /* --------------------------- 树：连接 → 库 → key --------------------------- */

      /* ========================= 表格：Key / Type / Value / Size / TTL ========================= */

      /**
       * 一行「值 / 大小 / TTL」从哪来：`rows`（`/rows` 或 `/key` 读回来的那一行）。
       *
       * **没读过就是 `—`，不是空**——空值看着像「这个 key 是空的」，而真相是「我们还没问过」。
       * 这是这张表唯一一条不许含糊的口径。
       */
      const rowOf = (key) => (rows !== null && typeof rows === 'object' ? rows[key] : undefined)
      const DASH = '—'

      /** 类型：表格里那一格读回来才有，**不猜**（`—` = 还没读）。 */
      const typeOf = (key) => {
        const row = rowOf(key)
        return row !== undefined && typeof row.type === 'string' && row.type !== '' ? row.type : undefined
      }

      /*
       * 占位格（`—`）挂 `dd_cellDash` 降一档：截图里一列黑破折号最重的就是类型那格（它原本
       * 继承正文色）。「还没问过」是占位不是数据——颜色与透明度都让开，真值来了自然比它重。
       */
      const cell = (className, text, title) =>
        jsx('span', {
          className: 'dd_cell ' + className + (text === DASH ? ' dd_cellDash' : ''),
          title: title === undefined ? text : title,
          children: text,
        })

      /**
       * 类型那一格：**点 + 类型名**（图里就是 `• hash`——点在 Type 列里，不在 Key 列里）。
       * 点的颜色 = 类型色族（`.dd_dot` 取 `currentColor`），Key 列因此干净得只剩 key 名。
       */
      const typeCell = (key) => {
        const type = typeOf(key)
        if (type === undefined) return cell('dd_cellType', DASH)
        return jsx('span', {
          className: 'dd_cell dd_cellType ' + kindClass(type),
          children: [jsx('span', { className: 'dd_dot' }), jsx('span', { className: 'dd_typeName', children: type })],
        })
      }

      /** 值那一格：单行、截断照实（`previewText` 在宿主侧压好的同一份）。 */
      const valueCell = (key) => {
        /* 正在读这一行：先把「正在读」写进那一格——点下去就有反馈，比空白等着强 */
        if (detailBusy && selected === key) return cell('dd_cellValue', t('msg.keyspaceLoading'))
        const row = rowOf(key)
        if (row === undefined) return cell('dd_cellValue', DASH)
        if (typeof row.error === 'string' && row.error !== '') return cell('dd_cellValue dd_cellErr', row.error, row.error)
        if (typeof row.preview === 'string') return cell('dd_cellValue', row.preview === '' ? t('meta.keyspaceCellEmpty') : row.preview)
        return cell('dd_cellValue', DASH)
      }

      const sizeCell = (key) => {
        const row = rowOf(key)
        if (row === undefined || typeof row.error === 'string') return cell('dd_cellSize', DASH)
        const text = totalText(row)
        return cell('dd_cellSize', text === null ? DASH : text)
      }

      const ttlCell = (key) => {
        const row = rowOf(key)
        if (row === undefined || typeof row.error === 'string') return cell('dd_cellTtl', DASH)
        /* 图里的 TTL 列是 `(No TTL)` 这种**带括号**的短形态（详情里那枚页签不带括号） */
        return cell('dd_cellTtl', '(' + ttlText(row.ttl) + ')')
      }

      /**
       * key 那一行（**表的一行**，不是树的一个节点）：点一下看详情，并把这一行的类型 / 值 / 大小 /
       * TTL 当场填上（`/key` 顺手带回 `preview`，所以「填表」不多花一条命令）。
       *
       * 它仍然是 `.dd_treeKey` + `.dd_treeName`（真机验收脚本按这两个类取 key 名与点击），
       * 只是外面套上了表格的列。
       */
      const keyRow = (key, depth) => {
        return jsxs(
          'button',
          {
            type: 'button',
            className: 'dd_tblRow dd_tblKeyRow dd_treeKey',
            'data-on': selected === key ? '1' : '0',
            'data-key': key,
            title: t('list.keyspacePickKey'),
            onClick: () => {
              openKey(key)
            },
            children: [
              jsx('span', {
                className: 'dd_cell dd_cellKey',
                /* 缩进按**层级**（和前缀行同一把尺子）：图里叶子就排在自己的前缀行下面 */
                style: { paddingLeft: String(10 + (depth === undefined ? 0 : depth) * 14) + 'px' },
                children: jsx('span', { className: 'dd_treeName', children: key }),
              }),
              typeCell(key),
              valueCell(key),
              sizeCell(key),
              ttlCell(key),
            ],
          },
          key,
        )
      }

      /**
       * 前缀那一行（图里 `actor (986)` / `movie` → `action (2)` 那种折叠）。
       *
       * 计数是**本页的**（`title` 里写清「本页 N 个」）：Redis 4 上没有「某个前缀下一共有多少 key」
       * 这种便宜来源，而把这页数说成总数就是编。**默认展开**——折叠是给人看「这一页长什么样」用的，
       * 一进来就全折上，等于让人多点两下才看得见 key。
       */
      const folderRow = (nodeId, open, label, count, depth) => {
        const row = jsxs(
          'div',
          {
            className: 'dd_tblRow dd_tblFolder',
            'data-folder': nodeId,
            'data-open': open ? '1' : '0',
            onClick: () => {
              toggleNode(nodeId)
            },
            children: [
              jsx('span', {
                className: 'dd_cell dd_cellKey',
                style: { paddingLeft: String(6 + depth * 14) + 'px' },
                children: jsxs('span', {
                  className: 'dd_keyWrap',
                  children: [
                    twisty(open, nodeId),
                    jsx('span', { className: 'dd_treeName dd_treeNameStrong', children: label }),
                    jsx('span', {
                      className: 'dd_treeCount',
                      title: t('meta.keyspaceTypePageCount', { count: String(count) }),
                      children: '(' + String(count) + ')',
                    }),
                  ],
                }),
              }),
              jsx('span', { className: 'dd_cell' }),
              jsx('span', { className: 'dd_cell' }),
              jsx('span', { className: 'dd_cell' }),
              jsx('span', { className: 'dd_cell' }),
            ],
          },
          'folder-' + nodeId,
        )
        return row
      }

      /** key 名按 `:` 切出来的**前缀树**（只装这一页的 key）。 */
      const buildPrefixTree = () => {
        const root = { children: new Map(), keys: [] }
        for (const key of keyItems) {
          const parts = key.split(':')
          let node = root
          for (const part of parts.slice(0, -1)) {
            if (!node.children.has(part)) node.children.set(part, { children: new Map(), keys: [] })
            node = node.children.get(part)
          }
          node.keys.push(key)
        }
        return root
      }

      const subtreeCount = (node) => {
        let total = node.keys.length
        for (const child of node.children.values()) total += subtreeCount(child)
        return total
      }

      const prefixRows = (node, depth, path) => {
        const out = []
        for (const [segment, child] of node.children) {
          const nodeId = 'pfx:' + path + segment
          const open = isNodeOpen(nodeId)
          out.push(folderRow(nodeId, open, segment, subtreeCount(child), depth))
          if (open) out.push(...prefixRows(child, depth + 1, path + segment + ':'))
        }
        for (const key of node.keys) {
          out.push(keyRow(key, depth))
          /*
           * 点开的那一行**就在它下面**展开详情（通栏，不是右边再开一栏）：Navicat 那种表里，
           * 值就在你点的那一行上——鼠标不用在窗口里来回跑。同一时刻只开一行（手风琴）。
           */
          if (key === selected) out.push(rowDetail())
        }
        return out
      }

      /** 表格主体：扫出来的 key（前缀树）+ 还没扫时的三句话（还没扫 / 扫了没有 / 正在读）。 */
      const tableRows = () => {
        if (keyItems.length === 0) {
          return jsx('p', {
            className: 'dd_blank',
            children: listBusy ? t('msg.keyspaceLoading') : scanned ? t('list.keyspaceEmpty') : t('list.keyspaceIdle'),
          })
        }
        return jsxs('div', { className: 'dd_tblBody', children: prefixRows(buildPrefixTree(), 0, '') })
      }

      /**
       * 表格那一行表头（与 `.dd_tblRow` 共用同一套列宽）。
       *
       * 五条文案**逐条写成字面量**（不是 `t(变量)`）：i18n 那道闸门是**静态**扫 `t('…')` 的，
       * 写成变量它就只能报「疑似死键」——而「界面露出键名」正是它存在的理由（见 docs/i18n.md）。
       */
      /*
       * 顶部那条一次性提示：**本页还一行都没读过**的时候才显示。答案是「怎么让格子有值」——写在
       * 一行专门的话上；但原来「还有未读」期间它一直挂着，与下面那行代价提示叠成两行灰字
       * （2026-10-05 截图）。读过任意一行（点一行或整页读）就收：那句话已经兑现，不用再念。
       */
      const readHint = () => {
        if (rowsBusy || keyItems.length === 0 || Object.keys(rows).length > 0) return null
        return jsx('p', {
          className: 'dd_readHint',
          children: t('hint.keyspaceFirstRead'),
        })
      }

      const tableHead = () =>
        jsxs('div', {
          className: 'dd_tblHead',
          children: [
            jsx('span', { className: 'dd_cell', children: t('col.keyspaceKey') }),
            jsx('span', { className: 'dd_cell', children: t('col.keyspaceType') }),
            jsx('span', { className: 'dd_cell', children: t('col.keyspaceValue') }),
            jsx('span', { className: 'dd_cell', children: t('col.keyspaceSize') }),
            jsx('span', { className: 'dd_cell', children: t('col.keyspaceTtl') }),
          ],
        })

      /**
       * 顶部那条搜索栏（图里 `Keys Contain [ 🔍 ]`）。
       *
       * 语义按 Redis 的来：框里**没有通配符**时当成「包含」，两边补 `*`（`user` → `*user*`）；写了
       * `*` / `?` / `[` 就**原样**发（那是用户在写模式）。发给服务端的那条命令一直印在下面那行
       * 「发了：…」里——这个补星号的动作不许藏在暗处。
       */
      const searchBar = () =>
        jsxs('div', {
          className: 'dd_searchBar',
          children: [
            jsxs('label', {
              className: 'dd_searchBox',
              children: [
                jsx('span', { className: 'dd_searchLabel', children: t('field.keyspaceContain') }),
                jsxs('span', { className: 'dd_searchField', children: [
                  icon(SEARCH_ICON, 13, 'dd_searchGlyph'),
                  jsx('input', {
                    className: 'dd_input dd_searchInput',
                    value: match,
                    placeholder: 'user:*',
                    onChange: (event) => {
                      setMatch(event.target.value)
                    },
                    onKeyDown: (event) => {
                      if (event.key === 'Enter' && !listBusy && scopeUsable) scan(undefined)
                    },
                  }),
                  /*
                   * 一键清掉（P14 第五版）：有输入时才出现；点它 = 清输入框 + 立刻按**无 MATCH**
                   * 重扫一页（`patternText` 传空串——见 `scanWith` 的注释）。**是 `<span>` 不是
                   * `<button>`**：验收脚本 ㊳ 取 `.dd_searchBar button` 的第一个当搜索按钮，
                   * 多一枚真按钮会把「×」顶到第一位、点清掉却去执行搜索。
                   */
                  match === ''
                    ? null
                    : jsx('span', {
                        className: 'dd_searchClear',
                        role: 'button',
                        title: t('btn.keyspaceClear'),
                        onClick: () => {
                          setMatch('')
                          if (scopeUsable && !listBusy) scanWith(effectiveTarget, scope, db, undefined, '')
                        },
                        children: '×',
                      }),
                ] }),
              ],
            }),
            jsx('button', {
              type: 'button',
              className: 'dd_btn dd_btnGhost',
              disabled: listBusy || !scopeUsable,
              title: t('btn.keyspaceSearch'),
              onClick: () => {
                scan(undefined)
              },
              children: icon(SEARCH_ICON, 13),
            }),
            cursor !== '0'
              ? jsx('button', {
                  type: 'button',
                  className: 'dd_btn dd_btnGhost',
                  disabled: listBusy || !scopeUsable,
                  onClick: () => {
                    scan(cursor)
                  },
                  children: t('btn.keyspaceMore', { cursor }),
                })
              : null,
            /*
             * 「读取这一页」：Navicat 那张表每一格都有值，是因为它把每一行都读了（一个 key 3~4 条
             * 命令）。这里同样是「逐行真读」，只是**代价写在按钮上、由人点**、并且**分批**读——
             * 面板从不偷偷发 4N 条命令。
             */
            jsx('button', {
              type: 'button',
              className: 'dd_btn dd_btnGhost',
              disabled: rowsBusy || listBusy || !scopeUsable || pendingCount() === 0,
              title: t('hint.keyspaceReadCost', { count: String(pendingCount()), calls: String(pendingCount() * 4) }),
              onClick: readRows,
              children: rowsBusy ? t('msg.keyspaceReading', { done: String(rowsDone), total: String(pendingCount() + rowsDone) }) : t('btn.keyspaceRead'),
            }),
            /* 提示行从「独占一整行」改成紧贴右侧：标签式、不抢地方 */
            jsx('span', {
              className: 'dd_hint',
              children:
                pendingCount() === 0
                  ? t('hint.keyspaceReadDone')
                  : t('hint.keyspaceReadCost', { count: String(pendingCount()), calls: String(pendingCount() * 4) }),
            }),
          ],
        })

      /**
       * 库那一层的一行（左栏那棵树）。
       *
       * 与上一版的差别只有一处：**选中那一行原来会在它下面展开「工具条 + key 列表」**，现在那两样
       * 搬到中间那一栏的表格里了（Navicat 也是这样：树管选库，表管看 key）。于是这一层回到
       * 「一行一个库、点一下就切过去」，给没有子节点的行画一个能点的 `▸` 才是骗人。
       *
       * 键数那条判据一个字没改：INFO 报的照它画；INFO 报里没有的（= 空库，前提是 INFO 真回了）
       * 画 `0 个 key`；INFO **读不上**时画「键数未知」——上一版在这种情况下画 `0 个 key`、旁边却
       * 列着扫出来的 key，那是自相矛盾。
       */
      const dbRow = (index, isDeclared, info) => {
        const isCurrent = index === db
        const countText =
          info !== undefined
            ? t('meta.keyspaceDbKeys', { count: String(info.keys) })
            : dbInfo.kind === 'ok'
              ? t('meta.keyspaceDbKeys', { count: '0' })
              : t('meta.keyspaceDbUnknown')
        return jsxs(
          'div',
          {
            className: 'dd_treeRow dd_treeL1 dd_treeBranch',
            'data-db': String(index),
            'data-current': isCurrent ? '1' : '0',
            title: isCurrent
              ? t('meta.keyspaceDbCurrent')
              : dbSwitchable === true
                ? t('hint.keyspaceDbSwitch')
                : t('msg.keyspaceDbOldHost'),
            onClick: () => {
              switchDb(index)
            },
            children: [
              icon(DB_ICON, 14),
              jsx('span', { className: 'dd_treeName', children: 'db' + String(index) }),
              jsx('span', { className: 'dd_treeCount dd_pill', children: countText }),
              /*
               * 胶囊（P14 第五版砍成一行一枚）：「点一下切过去」原来挂在**每一行**非当前库上，
               * 与来源胶囊一起把每个库行都撑成两行——整棵树一半是胶囊。行本身可点、悬停提示
               * （`hint.keyspaceDbSwitch`）说了会发生什么，常驻的那句是噪音。留下的只有：
               * 当前行一枚「当前浏览」（品牌色），每行一枚来源（目标声明 / 服务器上报）。
               * 验收 ㉛ 按行文断言的四个词（当前浏览 / 目标声明 / 服务器上报 / 0 个 key）一个没少。
               */
              jsxs('span', {
                className: 'dd_dbChips',
                children: [
                  isCurrent ? jsx('span', { className: 'dd_chip dd_chipBrand', children: t('meta.keyspaceDbCurrent') }) : null,
                  jsx('span', { className: 'dd_chip dd_chipIdle dd_chipFaint', children: isDeclared ? t('meta.keyspaceDbDeclared') : t('meta.keyspaceDbReported') }),
                ],
              }),
            ],
          },
          'db-' + String(index),
        )
      }

      const treeBody = () => {
        if (dbInfo.kind === 'loading') return jsx('p', { className: 'dd_hint', children: t('msg.keyspaceLoading') })
        const nodes = []
        const connOpen = isNodeOpen('conn')
        nodes.push(
          jsxs(
            'div',
            {
              className: 'dd_treeRow dd_treeL0 dd_treeBranch',
              onClick: () => {
                toggleNode('conn')
              },
              children: [
                twisty(connOpen, 'conn'),
                icon(DB_ICON, 15),
                jsx('span', { className: 'dd_treeName dd_treeNameStrong', children: effectiveTarget }),
                connection === '' ? null : jsx('span', { className: 'dd_treeCount', children: connection }),
              ],
            },
            'conn',
          ),
        )
        if (!connOpen) return jsxs('div', { className: 'dd_tree', children: nodes })
        /*
         * 库这一层是**两个真源拼起来的**（不猜）：
         *
         *   1. `INFO keyspace` 报的（**只含有 key 的库**——Redis 对空库一行都不报，所以 16 个库里
         *      通常只看得见一两个）；
         *   2. 目标声明的允许集（`declared` = `db` ∪ `dbs`）——**哪怕 INFO 没报、哪怕一个 key 都没有**，
         *      它也得有那一行：key 列表与扫描工具条都挂在这一行下面。
         *
         * 「一共配了几个库」只能靠 `CONFIG GET databases` 问，而 `CONFIG` 在禁表里——所以这里
         * 既不补 0..15，也不假装知道总数：**INFO 真回了**的时候，没报的就是空库（如实画 `0 个 key`）；
         * **INFO 没读上**时这一层只剩声明的那些，键数一律画「未知」并挂出原因（见 `dbInfo`）。
         */
        const declared = dbInfo.kind === 'ok' || dbInfo.kind === 'failed' ? dbInfo.declared : []
        const reported = dbInfo.kind === 'ok' ? dbInfo.reported : []
        const indexes = [...new Set([...declared, ...reported.map((row) => row.index)])].sort((left, right) => left - right)
        nodes.push(
          jsx(
            'div',
            {
              className: 'dd_treeRow dd_treeL1 dd_treeMuted dd_dbsrc',
              'data-dbsrc': '1',
              children: jsx('span', {
                className: 'dd_hint',
                children:
                  dbInfo.kind !== 'ok'
                    ? t('hint.keyspaceDbFallback')
                    : dbSwitchable === true
                      ? t('hint.keyspaceDbSource')
                      : t('hint.keyspaceDbSource') + ' ' + t('msg.keyspaceDbOldHost'),
              }),
            },
            'dbsrc',
          ),
        )
        if (dbInfo.kind === 'failed') {
          nodes.push(
            jsx(
              'pre',
              {
                className: 'dd_msgErr',
                'data-db-err': '1',
                children: dbError,
              },
              'dberr',
            ),
          )
        }
        for (const index of indexes) nodes.push(dbRow(index, declared.includes(index), reported.find((row) => row.index === index)))
        /*
         * 长的那段口径（为什么一台机器上只看得见一两个库）**折起来挂在树的末尾**：
         * 它常驻在树上时是五行灰字，把 key 列表直接挤出了屏幕（维护者截图里那一大段）。
         * 只在 INFO 真回了的时候挂——读失败时上面那行已经说了原因，再堆一段等于噪音。
         */
        if (dbInfo.kind === 'ok') {
          nodes.push(
            jsxs(
              'details',
              {
                className: 'dd_more',
                children: [
                  jsx('summary', { children: t('btn.keyspaceWhy') }),
                  jsx('p', { className: 'dd_hint', children: t('hint.keyspaceDbSourceMore') }),
                ],
              },
              'dbmore',
            ),
          )
        }
        return jsxs('div', { className: 'dd_tree', children: nodes })
      }

      /* ------------------------------- 行内详情 ------------------------------- */

      /** 点开的那一行下面的通栏详情（`.dd_tblBody` 里唯一不是网格行的元素）。 */
      const rowDetail = () => jsx('div', { className: 'dd_rowDetail', 'data-detail': '1', children: detailBody() }, 'row-detail')

      const detailBody = () => {
        if (detail === null) return jsx('p', { className: 'dd_blank', children: t('list.keyspacePickKey') })
        if (detail.pending === true || detailBusy) return jsx('p', { className: 'dd_blank', children: t('msg.keyspaceLoading') })
        if (typeof detail.error === 'string') return jsx('pre', { className: 'dd_queryOut', 'data-kind': 'err', children: detail.error })

        const view = detail
        const total = totalText(view)
        const table =
          Array.isArray(view.rows) && view.rows.length > 0
            ? jsx('table', {
                className: 'dd_kv',
                children: jsx('tbody', {
                  children: view.rows.map((row, index) =>
                    jsx(
                      'tr',
                      {
                        children: (Array.isArray(row) ? row : [String(row)]).map((cell, cellIndex) => jsx('td', { children: cell }, String(cellIndex))),
                      },
                      String(index),
                    ),
                  ),
                }),
              })
            : null
        const note =
          view.kind === 'none'
            ? jsx('p', { className: 'dd_hint', children: t('meta.keyspaceMissingKey') })
            : view.rows === null
              ? jsx('p', { className: 'dd_hint', children: t('meta.keyspaceNoPreview', { type: String(view.type) }) })
              : view.rows.length === 0
                ? jsx('p', { className: 'dd_hint', children: t('list.keyspaceEmpty') })
                : null
        /*
         * 详情的头：key 名（等宽、可选中）+ 一枚复制按钮 + 三枚页签（类型 / TTL / 元素数）。
         * 类型那枚带类型色（与左边树里同一个色族），`TYPE` 的原话照原样显示。
         */
        return jsxs('div', {
          className: 'dd_detail',
          children: [
            jsxs('div', {
              className: 'dd_detailHead',
              children: [
                jsx('h4', { className: 'dd_keyName', children: String(view.key) }),
                jsx('button', {
                  type: 'button',
                  className: 'dd_copyBtn',
                  title: copied ? t('btn.keyspaceCopied') : t('btn.keyspaceCopy'),
                  'aria-label': t('btn.keyspaceCopy'),
                  onClick: () => {
                    copyKey(String(view.key))
                  },
                  children: copied ? '✓' : '⧉',
                }),
                jsx('span', { className: 'dd_pill dd_pillType ' + kindClass(String(view.type)), children: String(view.type) }),
                jsx('span', { className: 'dd_pill', children: ttlText(view.ttl) }),
                total === null ? null : jsx('span', { className: 'dd_pill', children: total }),
                view.truncated === true ? jsx('span', { className: 'dd_pill', children: t('meta.keyspaceTruncated') }) : null,
              ],
            }),
            note,
            table === null ? null : jsx('div', { className: 'dd_kvWrap', children: table }),
          ],
        })
      }

      return jsxs('div', {
        className: 'dd_shell',
        children: [
          jsxs('div', {
            className: 'dd_shellHead',
            children: [
              jsx('span', { className: 'dd_glyph', children: icon(DB_ICON, 15) }),
              jsx('h3', { className: 'dd_shellTitle', children: t('panel.keyspaceTitle') }),
              jsx('span', { className: 'dd_chip dd_chipIdle dd_chipFaint', children: t('badge.keyspaceReadOnly') }),
              jsx('span', { className: 'dd_spacer' }),
              jsx('button', {
                type: 'button',
                className: 'dd_btn dd_btnGhost dd_btnSm',
                disabled: listBusy || !scopeUsable,
                onClick: () => {
                  loadKeyspace(effectiveTarget, scope)
                  scan(cursor !== '0' ? '0' : undefined)
                },
                children: '↻ ' + t('btn.keyspaceRefresh'),
              }),
            ],
          }),
          jsxs('div', {
            className: 'dd_shellBar',
            children: [
              field(
                t('field.keyspaceTarget'),
                redisTargets.length === 0
                  ? jsx('span', { className: 'dd_hint', children: t('list.keyspaceNoTargets') })
                  : jsx('span', {
                      className: 'dd_selectWrap',
                      children: jsx('select', {
                        className: 'dd_input',
                        value: effectiveTarget,
                        onChange: (event) => {
                          pickTarget(event.target.value)
                        },
                        children: redisTargets.map((row) =>
                          jsx('option', { value: String(row.id), children: String(row.label === '' ? row.id : row.label) }, String(row.id)),
                        ),
                      }),
                    }),
              ),
              field(
                t('field.keyspaceScope'),
                jsxs('div', {
                  className: 'dd_fieldStack',
                  children: [
                    jsx('input', {
                      className: 'dd_input',
                      value: scope,
                      placeholder: '/Users/me/coding/my-project',
                      onChange: (event) => {
                        setScope(event.target.value)
                      },
                    }),
                    scopeDirs.length === 0
                      ? jsx('span', { className: 'dd_hint dd_msgErr', children: t('hint.keyspaceNoScopeDirs') })
                      : jsx('span', { className: 'dd_hint', children: t('hint.keyspaceScopeDirs', { dirs: scopeDirs.join(' · ') }) }),
                  ],
                }),
              ),
              jsxs('details', {
                className: 'dd_advanced',
                children: [
                  jsx('summary', { children: t('field.keyspaceAdvanced') }),
                  field(
                    t('field.keyspaceCount'),
                    jsxs('div', {
                      className: 'dd_fieldStack',
                      children: [
                        jsx('input', {
                          className: 'dd_input',
                          value: count,
                          onChange: (event) => {
                            setCount(event.target.value)
                          },
                        }),
                        jsx('span', { className: 'dd_hint', children: t('hint.keyspaceCount') }),
                      ],
                    }),
                  ),
                ],
              }),
            ],
          }),
          listMsg.text === '' ? null : jsx('p', { className: 'dd_hint dd_msgErr dd_shellNote', children: listMsg.text }),
          metaLine(),
          /*
           * 两栏（第四版照维护者贴的那张对象浏览器图排的）：
           *   - 左：**连接 → 库**（树只管选库；键数是 INFO / 声明的，不编）；
           *   - 中：**搜索框 + 表格**（Key / Type / Value / Size / TTL，key 名按 `:` 折成前缀树）；
           * 点一行 key：详情**就在那一行下面**展开（不再往右边再开一栏——表里点、表里看）。
           * 左栏窄、中栏吃掉剩下的宽度——表格是主角，那 5 列在窗口不够宽时最先牺牲掉的是 TTL 的留白，
           * 不是 key 名（见 `.dd_tblRow` 的列宽）。
           */
          jsxs('div', {
            className: 'dd_shellBody',
            children: [
              jsxs('div', {
                className: 'dd_shellCol dd_shellColTree',
                children: [
                  jsxs('div', {
                    className: 'dd_colHead',
                    children: [
                      jsx('span', { className: 'dd_shellSub', children: t('panel.keyspaceDbs') }),
                      /*
                       * 这里**不放**「本页 N 个 key」：那是表格那一栏的数字，挂在「库」这一层会让人
                       * 以为它说的是「库里有几个 key」。它现在只出现在表格栏头（贴着 Key 表头那一行）。
                       */
                    ],
                  }),
                  treeBody(),
                ],
              }),
              jsxs('div', {
                className: 'dd_shellCol dd_shellColTable',
                children: [
                  /* 表格栏头：`Key` + 「本页 N 个」——这枚数字只属于这一栏 */
                  jsxs('div', {
                    className: 'dd_colHead',
                    children: [
                      jsx('span', { className: 'dd_shellSub', children: t('panel.keyspaceKeys') }),
                      jsx('span', { className: 'dd_count', children: t('meta.keyspaceTypePageCount', { count: String(keyItems.length) }) }),
                    ],
                  }),
                  searchBar(),
                  readHint(),
                  jsxs('div', {
                    className: 'dd_tbl',
                    children: [tableHead(), tableRows()],
                  }),
                ],
              }),
            ],
          }),
          /* 四条口径折起来（原来常驻在底部，一屏里最显眼的就是这段灰字） */
          jsx('div', {
            className: 'dd_foot',
            children: jsxs('details', {
              className: 'dd_rules',
              children: [
                jsx('summary', { children: t('btn.keyspaceRules') }),
                jsx('p', { className: 'dd_hint', children: t('hint.keyspaceRules') }),
              ],
            }),
          }),
        ],
      })
    }

    /** 侧边栏那颗图标（宿主给 `size` / `active`；画一个「数据库」）。 */
    function KeyspaceIcon(props) {
      const size = typeof props?.size === 'number' ? props.size : 16
      return jsx('svg', {
        width: size,
        height: size,
        viewBox: '0 0 16 16',
        'aria-hidden': 'true',
        children: jsx('path', {
          fill: 'currentColor',
          d: 'M8 1.2c-3.1 0-5.6 1-5.6 2.3v8.9c0 1.3 2.5 2.4 5.6 2.4s5.6-1.1 5.6-2.4V3.5c0-1.3-2.5-2.3-5.6-2.3Zm0 1.4c2.5 0 4.1.7 4.1 1.2s-1.6 1.2-4.1 1.2S3.9 4.3 3.9 3.8 5.5 2.6 8 2.6Zm4.1 9.8c0 .5-1.6 1.2-4.1 1.2s-4.1-.7-4.1-1.2v-2c1 .5 2.5.8 4.1.8s3.1-.3 4.1-.8v2Zm0-3.6c0 .5-1.6 1.2-4.1 1.2s-4.1-.7-4.1-1.2V7c1 .5 2.5.8 4.1.8S11.1 7.5 12.1 7v1.8Z',
        }),
      })
    }

    /* ================================ 插件入口 ================================ */

    exports.inject = ['slots']

    exports.apply = (ctx) => {
      installI18n(ctx)
      ctx.effect(() => {
        ensureStyle()
        return () => {
          styleEl?.remove()
          styleEl = undefined
        }
      })

      // 设置 → 插件配置（`@hyzyn/dsh-kit-settings` 声明的那一页里的一张卡）。
      ctx.slots.inject('settings.kit.item', () =>
        ctx.slots.register({ name: 'settings.kit.item', id: 'devdata', order: 90, label: () => t('card.name') }, DevdataCard),
      )
      /*
       * 侧边栏「插件」页：**两个槽都要注册**（devfront 真机验收抓到的）——列表行用
       * `plugins.row.config`（key 是 `<包名>#<行 id>`），而点「查看」进的那个**详情页**用
       * `plugins.bundle.config`（key 是**包名**）。只注册前者时详情页里的卡片是空的。
       *
       * 刻意**不**走 `ROW_CONFIG_KEYS` + 「内联优先」那一套：本包只有自己一个 bundle，
       * 而 `scripts/test/plugin-settings-surface.test.ts` 的「内联优先」契约是为**那些包**
       * （docker / tty / codegraph 等，同时进独立包与聚合包）写的；照 devfront 这条唯一的
       * 卡片模板写，两处入口都在，卡片在三处设置面都能用。
       */
      ctx.slots.inject('plugins.bundle.config', () =>
        ctx.slots.register({ name: 'plugins.bundle.config', key: '@hyzyn/dsh-devdata' }, DevdataCard),
      )
      ctx.slots.inject('plugins.row.config', () =>
        ctx.slots.register({ name: 'plugins.row.config', key: '@hyzyn/dsh-devdata#devdata' }, DevdataCard),
      )
      // DSH ≤0.1.5：设置 → 插件 的「插件配置」标签页（keyed 插槽按 settings 命名空间派发）。
      ctx.slots.inject('settings.plugin.item', () =>
        ctx.slots.register({ name: 'settings.plugin.item', key: 'devdata', order: 90 }, DevdataCard),
      )
      /*
       * **侧边栏独立面板**（P14 第二版）：宿主侧契约是「`sidebar.panellist` 的每个 id 对应
       * `main` 上同名的那个面板」——图标由侧边栏画、label 从列表元数据取（thunk 每次投影都重读，
       * 所以切换语言不用重注册）。两处要**成对**注册：只注册一边 = 点了没反应 / 面板永不显示。
       */
      ctx.slots.inject('sidebar.panellist', () =>
        ctx.slots.register({ name: 'sidebar.panellist', id: 'devdata', order: 20, label: () => t('panel.keyspaceTitle') }, KeyspaceIcon),
      )
      ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: 'devdata' }, KeyspacePanel))
    }

    return exports
  },
})
