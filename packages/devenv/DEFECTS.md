# @hyzyn/dsh-devenv 缺陷编号字典

> **这份文件是代码注释的编号字典，不是审计报告。**
>
> `src/` / `test/` / `scripts/` 里有带 `Dxx` 的注释，含义是「这段代码为什么长这样」，
> 编号的出处就是本文。拿到任意一个 `Dxx`，查 [§1 编号索引表](#1-编号索引表)。
>
> **编号是硬契约**：`D01–D02` 是 `packages/devenv` 内部序列，与其它包的 `Dxx` **不共享**；
> 跨包引用请写全名（`devenv D01` / `tty D61` / `docker D13`）。新缺陷接在 `D02` 之后，
> **不得重号、不得回收空号**。
>
> 本文这两条都是**真机首跑**（2026-10-02，248 上真 SSH / 真容器）暴露出来的：单测当时全绿，
> 因为假夹具照自己的想象回数据。现场 / 根因 / 修法的完整叙述在
> [docs/devdata-plan.md § 16.1.4](../../docs/devdata-plan.md)，本文只留编号与落点。

**已修 2 / 待修 0**，编号至 `D02`。症状见 §1。索引表**不写行号、也不保留修复提交 sha**
（[conventions.md § 编号规范](../../docs/conventions.md#编号规范) 硬规矩 4）：定位实现用
`git log -S'<症状关键词>'`，或读代码里带编号的注释。

## 1. 编号索引表

| 编号 | 症状（当年坏了什么） | 涉及文件 |
|---|---|---|
| D01 | **挂载脚本收尾撞 `ENOTEMPTY`**：收到 SIGTERM 的被测宿主还在收尾（它会再写一次 `dsh-home/.anonymous-user-id`），`rmSync` 删完之后那个文件又回来 → 目录非空 → 脚本**在收尾处崩掉、临时目录留下**，而前面所有断言都是绿的（报告看起来像「脚本坏了」，不是「脚本没验到」） | `scripts/verify-devenv-host-mount.mjs` · `test/host-mount-script-safety.test.ts` 的反例⑤ |
| D02 | **假 docker 夹具泄漏临时目录**：`installFakeDocker()` 每装一次建一个目录，`cleanup()` 只还原 `PATH` 而不删目录——一轮全量用例之后系统临时区积了 570 个（每个一个 `docker` 脚本 + `calls.log`）。这类泄漏**不会让任何断言变红**，所以只能靠行为断言抓 | `test/fake-docker.ts`（`cleanup()` 里删，且删在最前） · `test/fixture-hygiene.test.ts` |
