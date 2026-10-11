# @hyzyn/dsh-loglens 缺陷编号字典

> **这份文件是代码注释的编号字典，不是审计报告。** `src/` / `client-src/` / `test/` / `scripts/`
> 里的 `（loglens Dxx）` 注释，含义是「这段代码为什么长这样」，编号的出处就是本文。
> 拿到任意一个 `（loglens Dxx）`：先查 [§1 编号索引表](#1-编号索引表) 知道**当年坏了什么**，
> 再查 [§2 编号字典](#2-编号字典这段代码为什么长这样) 知道**所以代码为什么写成这样**。
>
> **编号是硬契约**：`D01–D01` 是 `packages/loglens` 内部序列，与 `docker` / `tty` 的 `Dxx`
> **不共享**；跨包引用请写「loglens D01 / docker D03」。新缺陷接在 `D01` 之后，
> **不得重号、不得回收空号**——源码里已有注释指向它们。
>
> **本文不含**：逐条 postmortem（现场复现 / 回归 / 反向验证）。那是 commit message / PR
> description 的内容；本文只留**结论与取舍**。

## 1. 编号索引表

> 只回答「当年坏了什么」。**症状列的关键词就是检索锚点**——`git log -S'<关键词>'` 能直接落到修复提交。

| D | 症状（一句话：当年坏了什么） | 涉及文件 |
|---|---|---|
| D01 | 文件头的块注释里写了 glob（`packages/<pkg>/test/` 的上一版是带星号的写法），那个星号加斜杠提前闭合注释，整个测试文件加载失败、套件报 `ReferenceError: test is not defined` | test/loglens.test.ts |

## 2. 编号字典（这段代码为什么长这样）

### `D01` 块注释里的 `*/` 是注释结束符，不是 glob

**症状**：`packages/loglens/test/loglens.test.ts` 一加载就失败，报 `ReferenceError: test is not defined`，
错误位置指向注释行本身（`packages/*/test/**` 里那个 `*/` 之后）。

**根因**：文件头是 `/** … */` 块注释，而注释里写了一句「vitest 的 include 是 `packages/*/test/**`」——
其中的 `*/` 提前把块注释闭合了，紧随其后的「；由仓库根 `pnpm test` 收集…」于是变成了真代码。

**为什么值得记**：这不是手滑一次就绝迹的错——`templates/hello/test/hello.test.ts` 的同一句里
**专门放了一个零宽空格**来躲开它，而 `pnpm create-plugin` 会把这个文件复制进**每一个**新包
（2026-10-11 建包当天实测：loglens 就是这么整份套件加载失败的）。
写这类「glob 形态」的注释时一律写成 `packages/<pkg>/test/`，不要出现 `*/`。

**修法**：把注释里的 glob 换掉（`packages/<pkg>/test/`），并在这里留下编号。

## 现状

**已修 1 / 待修 0**，编号至 `D01`。逐条症状见 §1，设计意图见 §2，**还没做的见
[ROADMAP.md](./ROADMAP.md)**。

## 维护规则

1. **新缺陷只做两件事** → [conventions.md § 编号规范 硬规矩 7](../../docs/conventions.md#编号规范)。
2. **索引表的写入纪律** → [同上，硬规矩 4](../../docs/conventions.md#编号规范)。
3. **阈值 / 口径 / 基线数字只增不改** → [conventions.md § 文档分档 三条纪律第 3 条](../../docs/conventions.md#文档分档)。