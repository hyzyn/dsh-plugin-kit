# @hyzyn/dsh-kit 缺陷台账（**转入**）

> **本文件是「转入台账」，不是本包的权威序列。** 下表 `kit D01`–`kit D05` 是**转入镜像**——
> 权威记录在**原包**（主要是 `codegraph CGxx`），kit 侧只是「改 kit 的人不必翻别人的台账」的入口。
> **引用时优先写原编号**（如 `codegraph CG05`）；kit 内部新发现的缺陷才接 `D06` 往后编号。
> 跨包引用一律写 `<包名> <前缀><号>`（如 `codegraph CG05`、`tty D61`、`docker D13`），
> 裸编号只在本包文件内使用。规范见 [docs/conventions.md § 编号规范](../../docs/conventions.md#编号规范)。

## 这个文件为什么长这样

`@hyzyn/dsh-kit` 是**共享库**：它的缺陷绝大多数是在**消费包**里被发现、修在 kit 侧
（codegraph 的 `killProcessTree` / `dshHome` / settings 适配层，tty 的 `windows-shim` 测试）。
完整记录与编号留在**发现它的那个包**的台账里。

于是出现一个问题：改 `packages/kit/src/*` 的人，得去翻 `codegraph` 的台账才知道
「这段代码为什么长这样」。

本文就是为解决它而建的**转入台账**：

- 每条只写**一句话**（这段代码为什么长这样）+ **指回原编号**；
- **不复制原文、不重新编号、不删除原编号**（原编号仍是权威记录）；
- 新的、**在 kit 内部发现**的缺陷，直接接在 `D05` 之后编号，写在本文件里。

## 现状

**已修 5 / 待修 0**（全部为「在消费包发现、修在 kit」）。逐条见下表；
原文见 [codegraph 的台账](../codegraph/DEFECTS.md)对应行。

## 转入清单

| kit | 原编号 | 这一条在说什么（这段代码为什么长这样） | 落点 |
|---|---|---|---|
| **kit D01** | `codegraph CG05` | `killProcessTree` 在 POSIX 上曾是 **no-op**，超时 / 取消没有兜底；现在支持 POSIX **进程组**（`detached` 组长），并有真机进程组测试 | [src/windows-shim.ts](../../packages/kit/src/windows-shim.ts) · [test/windows-shim.test.ts](../../packages/kit/test/windows-shim.test.ts) |
| **kit D02** | `codegraph CG36` | D01 的进程组击杀对「**不是组长**的子进程」会误打 `-pid`（正常 ESRCH 被吞，窄窗口是 pid 被复用为组长）→ 收窄成 `{ group }` 选项且**默认关**，只有自己 detached 启动的调用方显式 opt-in | [src/windows-shim.ts](../../packages/kit/src/windows-shim.ts) |
| **kit D03** | `codegraph CG13` | `~/.dsh` 缺失时挂载期抛错、**整个插件起不来**；`DSH_HOME=~/x` 时写的与 loader watch 的**不是同一个文件** → `dshHome()` 归一化（`~` 展开 + resolve，与 loader 同口径） | [src/services.ts](../../packages/kit/src/services.ts) |
| **kit D04** | `codegraph CG35` | D03 只做了一半：全仓还有 **8 处 raw 副本**，`DSH_HOME=~/x` 时两个包会写**两个不同**的 `cordis.patch.yml` → 8 处全改走 kit 的 `dshHome()`，并加 `scripts/check-dsh-home.mjs` 防回归闸（只认 kit 一份推导） | [src/services.ts](../../packages/kit/src/services.ts)（消费方改动在各包） |
| **kit D05** | `codegraph CG63` | DSH 0.1.7-rc.1 起 `ctx.settings.register(ns, schema)` / `settings.get(ns)` **已删除**（换成 `SettingsForms`）→ kit 新增 settings 适配层：`settingsEntryScope`（读 `describe()` / 写 `update(entryId, patch)` / 订阅 `loader/volatile-update`）、`plainConfig()`（还原 volatile 冻结引用）、`readSettingsEntry`、`suppressAutoSettingsPage` | [src/settings.ts](../../packages/kit/src/settings.ts) |

## 维护规则

1. **在 kit 内部发现**的缺陷：接在最大号之后编号（当前 `D05`），只加一行 + 在代码注释里落编号；
   详细 postmortem 写进 commit message。
2. **在消费包发现、修在 kit** 的缺陷：原编号留在那个包的台账（权威），本文加一行转入记录。
   **不要**在两个地方都写详细正文。
3. 引用本包编号写 `kit Dxx`；引用别的包写 `<包名> <前缀><号>`。
4. 阈值 / 口径 / 基线数字**只增不改**；发现过期或矛盾只加 `> ⚠️ 标注`。
