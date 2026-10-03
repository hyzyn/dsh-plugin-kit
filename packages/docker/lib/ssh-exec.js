/**
 * @hyzyn/dsh-docker — 远程 / 本地一次性命令执行层（**已上收，本文件是纯再导出**）。
 *
 * ## 这一份实现现在住在 `@hyzyn/dsh-kit/ssh-exec`
 *
 * 2026-10-02 按 [docs/devdata-plan.md § 16.1](../../../docs/devdata-plan.md) 的 **B1** 上收：
 * 环境编排（`devenv`）与容器面板要的是**同一个机制**——「拿一条连接规格，在目标主机上跑一条
 * 一次性命令」——而共享机制按判据归 `kit`（共享数据/配置才读对方的 settings entry）。
 * 上收的理由不是整洁：留下第二份实现，TOFU 口径 / 通道额度（D150）/ 跳板机与代理命令语义
 * 一旦分叉，症状是「容器面板连得上、环境编排连不上」，而两边各自看着都对。
 *
 * ## 为什么保留这个文件而不是删掉
 *
 * 三条，都是实测过的代价：
 *
 * 1. 本包的 6 个用例（`test/ssh-*.test.ts`、`test/logs-stream.test.ts`）从 `./ssh-exec.js`
 *    取名字。删掉这个文件就要同时改 6 处测试 import——那是**同一批**改动，混在一起会让
 *    「上收到 kit」与「测试搬家」两件事的回归信号互相掩盖；
 * 2. `lib/` 是入库产物，`tsc` **不会清理**已删源文件对应的旧产物——删了 `src/ssh-exec.ts`，
 *    构建后 `lib/ssh-exec.js` 仍会留在包里（并被 `files` 带进产物）；
 * 3. 再导出是**单向**的：这里没有一行实现，也没有 `ssh2` 的 import（真实现只在 kit 一处）。
 *
 * `scripts/test/ssh-single-source.test.ts` 钉住这三点——尤其是第 3 点：有人把实现抄回来
 * 时它会红（「只许一份实现」是本仓判据，不是口号）。
 */
export * from '@hyzyn/dsh-kit/ssh-exec';
//# sourceMappingURL=ssh-exec.js.map