# @hyzyn/dsh-rss 路线图（已完成落点）

> 本包是中等档，没有独立缺陷台账（`DEFECTS.md` 不存在）：缺陷直接记在提交信息与本文的落地记录里。
> **本文只放还没做的事**（当前为空）与**已完成的落点 + 门槛**；对外行为见 [README.md](./README.md)。
> 知识归属见 [docs/conventions.md § 知识归属表](../../docs/conventions.md#知识归属表唯一归宿)。

## 已完成（落点 + 门槛）

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
折叠 rail 同为 36×36、18px 图标。

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
