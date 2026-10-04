# @hyzyn/dsh-devenv 缺陷编号字典

> **这份文件是代码注释的编号字典，不是审计报告。**
>
> `src/` / `test/` / `scripts/` 里有带 `Dxx` 的注释，含义是「这段代码为什么长这样」，
> 编号的出处就是本文。拿到任意一个 `Dxx`，查 [§1 编号索引表](#1-编号索引表)。
>
> **编号是硬契约**：`D01–D04` 是 `packages/devenv` 内部序列，与其它包的 `Dxx` **不共享**；
> 跨包引用请写全名（`devenv D01` / `tty D61` / `docker D13`）。新缺陷接在 `D04` 之后，
> **不得重号、不得回收空号**。
>
> 本文前三条都是**真机跑**暴露出来的（`D01` / `D02` 是 2026-10-02 的 248 真 SSH / 真容器首跑，
> `D03` 是 2026-10-04 的本机真 daemon 冷启动档）：当时**单测要么全绿**（假夹具照自己的想象回
> 数据）、**要么那一档根本没在真机上跑过**。`D01` / `D02` 的现场 / 根因 / 修法在
> [docs/devdata-plan.md § 16.1.4](../../docs/devdata-plan.md)，`D03` 的在
> [ROADMAP.md](./ROADMAP.md) 记-14。本文只留编号与落点。
>
> **`D04`（2026-10-04）与前三条不同**：它是**静态就能验**的一条——`client.js` 的样式变量名
> 写错了（`--dsw-alias-border-secondary` / `--dsw-alias-bg-primary`，宿主主题的 403 个 token 里
> 都没有），于是 `dv_input` / `dv_item` / `dv_remove` / `dv_save` 的框**整条作废**、输入框底色
> 变透明，而不含变量的布局声明照常生效——现场像「样式没加载」。判据已固化成 `client-lint` 的
> 检查 ③ + 宿主主题名字快照，规矩在
> [conventions.md § 客户端半体 ③](../../docs/conventions.md#客户端半体三条硬规矩)。

**已修 4 / 待修 0**，编号至 `D04`。症状见 §1。索引表**不写行号、也不保留修复提交 sha**
（[conventions.md § 编号规范](../../docs/conventions.md#编号规范) 硬规矩 4）：定位实现用
`git log -S'<症状关键词>'`，或读代码里带编号的注释。

## 1. 编号索引表

| 编号 | 症状（当年坏了什么） | 涉及文件 |
|---|---|---|
| D01 | **挂载脚本收尾撞 `ENOTEMPTY`**：收到 SIGTERM 的被测宿主还在收尾（它会再写一次 `dsh-home/.anonymous-user-id`），`rmSync` 删完之后那个文件又回来 → 目录非空 → 脚本**在收尾处崩掉、临时目录留下**，而前面所有断言都是绿的（报告看起来像「脚本坏了」，不是「脚本没验到」） | `scripts/verify-devenv-host-mount.mjs` · `test/host-mount-script-safety.test.ts` 的反例⑤ |
| D02 | **假 docker 夹具泄漏临时目录**：`installFakeDocker()` 每装一次建一个目录，`cleanup()` 只还原 `PATH` 而不删目录——一轮全量用例之后系统临时区积了 570 个（每个一个 `docker` 脚本 + `calls.log`）。这类泄漏**不会让任何断言变红**，所以只能靠行为断言抓 | `test/fake-docker.ts`（`cleanup()` 里删，且删在最前） · `test/fixture-hygiene.test.ts` |
| D03 | **冷启动里最长的那一段报裸英文错误**：Docker Desktop（macOS）在「端口已发布、容器里还没有进程监听」时**先收下 TCP 连接再空回**，探针拿到的是 `socket hang up`（`ECONNRESET`），于是落到 `probeFailureDetail` 的**兜底分支**——而每次冷启动里最长的正是这个状态（真机实测：连续 5 次观测 ≈15s 都报这一句）。它**认错了状态**：兜底那条契约是「其它错误原样带出去，编一句更好听的话会盖掉真正的原因」，可 `ECONNRESET` 在这台机器上是**主状态**，不是「其它」。后果具体：用户盯得最久的那句话既看不出「还没起来」、也看不出「该继续等」 | `src/probe.ts`（`ECONNRESET` → 「连接被重置（多半是端口上还没有能应答的东西）」） · `test/probe.test.ts` · `test/real-coldstart-local.test.ts`（抓到它的那一档） |
| D04 | **样式变量名写错，输入框与清单行整条没有框**：`client.js` 引用了宿主主题里不存在的 `--dsw-alias-border-secondary` / `--dsw-alias-bg-primary`（403 个 token 里都没有）→ `border` / `background` 声明在计算值阶段整条作废，`dv_input` / `dv_item` / `dv_remove` / `dv_save` 全部无框、输入框底色变透明，而布局照常。同族共四处（`devdata D10` / `devfront D02` / `mcp D01` / `codegraph CG66`），按「编号不跨包」各自立号 | `client.js`（`border` 改 `--dsw-alias-border-l4` / `-l2`，底色改 `--dsw-specific-input-major`） · 判据 `scripts/client-lint.mjs` 检查 ③ + 宿主主题名字快照 `scripts/fixtures/dsh-theme-tokens.json` |
