# @hyzyn/dsh-rss 路线图（已完成落点）

> 本包是中等档，没有独立缺陷台账（`DEFECTS.md` 不存在）：缺陷直接记在提交信息与本文的落地记录里。
> **本文只放还没做的事**（当前为空）与**已完成的落点 + 门槛**；对外行为见 [README.md](./README.md)。
> 知识归属见 [docs/conventions.md § 知识归属表](../../docs/conventions.md#知识归属表唯一归宿)。

## 已完成（落点 + 门槛）

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
