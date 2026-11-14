# @hyzyn/dsh-rss 路线图（已完成落点）

> 本包是中等档，没有独立缺陷台账（`DEFECTS.md` 不存在）：缺陷直接记在提交信息与本文的落地记录里。
> **本文只放还没做的事**（当前为空）与**已完成的落点 + 门槛**；对外行为见 [README.md](./README.md)。
> 知识归属见 [docs/conventions.md § 知识归属表](../../docs/conventions.md#知识归属表唯一归宿)。

## 已完成（落点 + 门槛）

### ✅ 收起动画期间入口先于宿主切 rail（2026-11-14）

**现场**（用户报告，桌面端点「收起」）：kit 的四个侧栏入口已经只剩图标、还被居中推到冻结宽度的
一半，而同栏的「插件 / 插件市场 / 更多」仍保持宽态在淡出——两边不在同一拍上。

**成因**（真宿主 `0.2.2-rc.3` 实测）：外壳点下收起的那一刻就给**框架**打
`data-sidebar-collapsed`，但**布局要到 `COLLAPSE_SETTLE_MS`（150ms）之后**才落到 rail——宽内容
先固定在展开宽度淡出，settle 时才卸载宽内容、换成 36×36。入口原先直接拿框架属性当 rail 门控，
于是收起的第一帧就切。

**改法**（`client.js` 内联样式数组）：rail 覆盖改挂宿主 README 承诺给集成方的**稳定标记**
`data-sidebar-scrollport`（**只在展开时**挂在滚动视口上），写成
`[data-sidebar-collapsed] .rss_sidebarEntry:not([data-sidebar-scrollport] *)`：淡出阶段标记还在 → 保持宽态，settle 后标记消失 → 与宿主同时切。老宿主没有该标记时
`:not()` 恒真，退回「点了就切」的原行为，不会比以前更差。

**门槛**：新增 `scripts/sidebar-entry-rail.mjs` + `scripts/test/sidebar-entry-rail.test.ts`（四个
入口包的客户端样式里，**每一条** `[data-sidebar-collapsed]` 规则都必须带这层门控；四包各设条数
下限，防「前缀一改 = 0 命中恒绿」）；真宿主实测：淡出帧入口仍是 264×32、标签可见（与宿主行同形），
settle 后 35×36 / 18px 图标 / x=10，与宿主 rail 行逐项相等。

### ✅ 侧栏入口挪进宿主面板导航、与宿主面板行同规格（2026-11-14）

**落点**：入口从「侧栏顶层、新建会话下方」搬进宿主的**面板导航里、紧跟固定面板「插件」那一行**
（`placeInPanelNav`：从宿主的 `.panelRow` 往上找它的 `nav`，插在第一条面板行之后），并带
`data-dsh-kit-sidebar-rank = 10`，与同族（全局搜索 20 / 终端 30 / 容器 40）按属性让位而不是靠加载顺序。

**样式**：`.rss_sidebarEntry` 换成宿主面板行的规格——`font: inherit`（14px，不再是 13px）、
`color: inherit`（主文字色，不再是 secondary）、行内边距与标签间距取宿主 `--dsh-sidebar-*`
几何契约、圆角走 `--dsw-radius-md`（不再是字面量 8px）、悬停用宿主侧栏自己在用的
`--dsw-alias-interactive-bg-hover`、键盘焦点走宿主全局焦点环。顺带删掉从没被写过的
`[data-active]` 死规则。

**门槛**：`node scripts/client-lint.mjs`（样式变量 / 圆角档位 / 字号配行高 / 颜色出处）
+ 真宿主 0.2.2-rc.3 实测：图标 x=20、文字 x=42、行 32px、14/22 字号，与宿主「插件」行逐项相等；
折叠 rail 同为 36×36、18px 图标。图标笔画在入口内覆盖成 `1`：宿主面板图标是 `viewBox 16` +
`stroke-width="1"` 的 sprite symbol（16px 时实心 1.0px），本包图标常量按 18px 设计写的是 1.7，
直接并排会粗 70%。

### ✅ 刷新过渡层（0.3.1）：与 dsh-docker 同一套语言的提示

**落点**：两处刷新路径注入「2px 不定长流光进度条 + 蓝色胶囊」，与 dsh-docker 的 `dk_switchOverlay`
同一形态；绝对定位在 `.rss_modalFilter` 上，不占文档流。

**取过的教训**（都实测过，别再踩）：

- **两个 token 别混**：进度条流光的插值色必须用强调色 `--dsw-alias-state-business-primary`
  （实测 `#4176e6`）；`--dsw-alias-brand-primary` 在这个皮肤里是 `#0f1115`（品牌墨色、近黑），
  写成它「波纹」就渲染成一条黑线。两者名字都像「主色」，真正表示强调色的是前者。
- **`position:absolute` 必须显式写**：漏掉它 `left` / `bottom` / `transform` 全部失效，
  胶囊退化成流式元素把列表整块顶下去（实测 +38px）。
- **观感对齐有据**：两处胶囊的计算颜色实测完全一致（底色 `color(srgb .91 .94 .99)`、
  文字 `rgb(65,118,230)`）；刷新前后区块 / 标题 / 统计 / 首条 / 搜索框位置不变。

**门槛**：`pnpm --filter @hyzyn/dsh-rss smoke` 的 6 条静态断言——守「绝对定位不推版 / 消抖门 /
文案形态 / 落地标记 / 原有保护」。
