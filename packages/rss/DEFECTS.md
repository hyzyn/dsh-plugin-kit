# @hyzyn/dsh-rss 缺陷编号字典

> **这份文件是编号字典，不是审计报告。** `src/` / `client-src/` / `test/` / `scripts/`
> 里的 `（rss Dxx）` 注释，含义是「这段代码为什么长这样」，编号的出处就是本文。
> 拿到任意一个 `（rss Dxx）`：先查 [§1 编号索引表](#1-编号索引表) 知道**当年坏了什么**，
> 再查 [§2 编号字典](#2-编号字典这段代码为什么长这样) 知道**所以代码为什么写成这样**。
>
> **编号是硬契约**：`D01–D02` 是 `packages/rss` 内部序列，与 `docker` / `tty` / `loglens`
> 的 `Dxx` **不共享**；跨包引用请写「rss D01 / docker D03」。新缺陷接在 `D02` 之后，
> **不得重号、不得回收空号**。规范见 [docs/conventions.md § 编号规范](../../docs/conventions.md#编号规范)。
>
> **本文不含**逐条 postmortem（现场复现 / 回归 / 反向验证）——那是 commit message / PR
> description 的内容；本文只留**结论与取舍**。

## 1. 编号索引表

> 只回答「当年坏了什么」。**症状列的关键词就是检索锚点**——`git log -S'<关键词>'` 能直接落到修复提交。

| D | 症状（一句话：当年坏了什么） | 涉及文件 |
|---|---|---|
| D01 | **真机脚本 `verify-rss-opml` 的 O1 把「宿主没有存储源」判成回归**：通过条件里含 `baseline.sources.length > 0`，而 `~/.dsh/rss.json` 写着 `sources: []`（**显式空数组**，`readRssStore()` 不会给它补内置默认）的宿主导出 0 个源本就是与宿主状态一致的正确答案——2026-11-14 在 `test` profile（3082）上就这样红了一条，红得没有信息量、还容易被当成产品回归 | scripts/verify-rss-opml.mjs |
| D02 | **侧栏入口在收起动画的第一帧就切 rail**：`data-sidebar-collapsed` 是外壳点下「收起」即刻打的框架属性，而布局要到 settle（150ms）之后才落到 rail——入口跟着它立刻切成「无标签 + 居中」（被推到冻结宽度的一半），与同栏官方面板行不同拍。修法：rail 覆盖改挂宿主 README 承诺给集成方的稳定标记 `data-sidebar-scrollport`（只在展开时挂在视口上），写成 `:not([data-sidebar-scrollport] *)` | client.js |

**已修 2 / 待修 0**（编号至 `D02`）

## 2. 编号字典（这段代码为什么长这样）

### D01 真机脚本的隐含前置假设：判据要求「宿主有存储的订阅源」

**症状**：在 `sources: []` 的宿主上跑 `node scripts/verify-rss-opml.mjs --url … --token …`，
O1 恒红，而其余 7 条全绿、收尾复原也正常。

**根因**：O1 原来的通过条件是

```js
exported !== undefined && baseline.sources.length > 0 && missing.length === 0
```

第一个合取项（得有下载文件）正是它要验的东西；**第二个合取项是写判据时带进来的隐含前置假设**
——它假设宿主一定至少有一个「存储的」订阅源。而 rss 的配置解析里两件事是分开的：

- `readRssStore()` 只对**缺失**的 `sources` 用默认值；文件里写了 `sources: []`，
  `Array.isArray(parsed.sources)` 为真，**空数组原样覆盖**；
- digest 走的是另一条回落 `sources.length > 0 ? sources : defaultSources()`，
  所以「配置 0 个源、每天照样出 digest、导出 0 个源的 OPML」是**完全自洽**的状态。

于是这条判据在「只用内置源的宿主」上永远无从核对——它证明不了导出对，也证明不了导出错。

**修法**：基行为空时记 **WARN**（正文写明「宿主配置里 sources 为空，digest 走内置源，
导出属预期；O1 无从核对——不是回归」），并**保留** FAIL 给「点了导出却没有文件下来」
——那与源数量无关，是按钮或下载链断了。汇总改成 `PASS / WARN / FAIL` 三段、退出码只看 FAIL，
形态与 `scripts/verify-client-ui.mjs` 一致（`ok: true` + `warned: true`）。
「该记 WARN 的别记 FAIL」的规矩侧归宿在 [docs/agent-real-test.md](../../docs/agent-real-test.md)
（2026-11-14 已把本例补进去）。
