# CI 与 `package.json` 的脚本双真相源：收敛方案（**待批准**）

> **状态：已执行（2026-10-01）——方案 A 已落地；方案 B（守卫）未做**。
> 按 [conventions.md § AI 协作边界](./conventions.md#ai-协作边界什么改动要先问)，「改 `.github/`」属于
> **先问再动手**：所以本文先作为提案写完、经维护者批准后才执行；执行记录见 § 9。
> 诊断（症状、后果、为什么危险）在 [conventions.md § 真机脚本与 CI 接线](./conventions.md#真机脚本与-ci-接线)；
> 本文是那条诊断的**执行方案**，也是它的唯一归宿：改动点、rename 面、CI 影响、验收、回滚都只在这里展开。

## 0. 一句话

同一批 hermetic 脚本现在有**两个真相源**：workflow 里的**写死路径**（现算 14 处）与包内
`package.json` 的**条目**（11 个脚本 / 9 条条目）。于是改名只红一处，另一处**静默腐烂**——
没人跑得到的那一半，正是「一条命令全跑」被刻意否掉之后**唯一**留给人的可粘贴入口。

**方案 A**（推荐，要动 workflow）：workflow 的 `run:` 改成调用包内条目 —— 真相源收敛到 `package.json`。
**方案 B**（更省，不动 workflow，可先做）：加一条守卫，让两个真相源**不许漂**。

## 1. 现状（现算，2026-10-01）

```sh
grep -c 'node packages/' .github/workflows/*.yml        # ci.yml: 11   release.yml: 3
grep -o 'node packages/[a-z-]*/scripts/[a-z-]*\.mjs' .github/workflows/*.yml | sort | uniq -c
```

| workflow | 行 | 写死了什么 |
|---|---|---|
| `ci.yml` | 152–158 | tty 的 7 条（`integration` / `ssh-smoke` / `probe-smoke` / `probe-route-smoke` / `jump-smoke` / `proxycommand-smoke` / `sftplimits-smoke`），step `if: matrix.os == 'ubuntu-latest'` |
| `ci.yml` | 165–167 | docker 的 3 条（`smoke` / `route-smoke` / `client-smoke`），同一个 ubuntu step |
| `ci.yml` | 173 | tty 的 `windows-smoke`，`if: matrix.os == 'windows-latest'` |
| `release.yml` | 54–56 | **docker 那 3 条又写了一遍**（发布闸自带一份，注释里写着 docker D119 的教训） |

**11 个脚本、14 处写死路径**；同一批脚本在包内的条目是 8 + 1 条（docker 的 `smoke` 一条覆盖 3 个脚本，
`node scripts/smoke.mjs && node scripts/route-smoke.mjs && node scripts/client-smoke.mjs`——与 CI 逐条跑
**逐字等价**）。逐条核对：**11/11 都能找到指向同一文件的条目**，没有一条是「CI 跑了但没有可粘贴入口」。

两个后果（诊断里写过，这里是现算确认）：改**脚本文件名** → 两个 workflow 立刻红，而
`pnpm --filter … run <条目>` 那条**悄悄烂掉**（CI 从不跑它）；改**条目名** → workflow **全绿**，
只有手动跑的人受影响。

## 2. 方案 A（推荐）：workflow 调用包内条目

| workflow | 行 | 现在 | 改成 |
|---|---|---|---|
| `ci.yml` | 152–158 | 7 条 `node packages/tty/scripts/*.mjs` | 7 行 `pnpm --filter @hyzyn/dsh-tty run <条目>`（条目名与脚本同名，逐个对应） |
| `ci.yml` | 165–167 | 3 条 docker | **1 行**：`pnpm --filter @hyzyn/dsh-docker run smoke` |
| `ci.yml` | 173 | `node packages/tty/scripts/windows-smoke.mjs` | `pnpm --filter @hyzyn/dsh-tty run windows-smoke` |
| `release.yml` | 54–56 | 3 条 docker | **1 行**：`pnpm --filter @hyzyn/dsh-docker run smoke` |

**改动量：14 行 → 10 行，step 数一个不变**（4 个 step），`if:` / `matrix.os` 全部不动
（tty 7 条 + docker 3 条仍只在 ubuntu leg，`windows-smoke` 仍只在 windows leg）。

差异与风险（逐条）：

- 每个 step 多一行 `pnpm` 自己的输出；多一层 `pnpm` 进程（毫秒级，相对这些脚本自带的「起内存 sshd /
  跑真 PTY」可以忽略）；
- 退出码照传：条目里命令非零 → `pnpm run` 非零 → step 失败，语义不变；
- CI 的 cwd 是仓库根，且前面已经 `pnpm install --frozen-lockfile`，`--filter` 一定可用；
- **生命周期钩子**：本仓没有 `pre<条目>` / `post<条目>` 形态的钩子（`tty` 的 `preview` 只是普通条目名，
  不触发任何东西），所以不会多跑出别的东西；
- `windows-smoke` 那条要在 windows 腿上**实测一次**才算数（`pnpm run` 在 Windows 走 cmd）。

## 3. 方案 B（已实现，2026-10-01）：一条守卫

落点：`scripts/ci-script-truth.mjs`（纯函数 + CLI）+ `scripts/test/ci-script-truth.test.ts`（10 条用例）。
方案 A 之后 workflow 里已经没有写死路径，所以守卫的口径随之变成「**收敛后的形态不许再漂**」五条：

1. **写死路径不许回来**（`ci.hardcodedPath`）——它一回来，包内条目又开始腐烂；
2. workflow 里每个 `pnpm --filter <包名> run <条目>` 都要能解析：包名在 workspace 里
   （`ci.entry.unknown`）、条目在该包 `package.json` 里（`ci.entry.missing`）；
3. 两个 workflow 引用**同一个**入口时命令必须逐字一致（`ci.crossWorkflow.mismatch`）——比较前会归一
   YAML 步骤写法（`run: <cmd>` 单行 vs `run: |` 块内一行），免得把「同一件事的两种写法」判成不一致；
4. `release.yml` 引用的入口必须也在 `ci.yml` 出现（`ci.releaseOnly`）——发布闸不许跑 CI 不认的入口
   （那种入口平时无声，坏了没人知道）；
5. **命中不是 0**（`ci.empty`）：一个引用都抓不到时报警（恒绿闸门比没有更坏）。

价值：把「两个真相源不许漂」变成会红的判据，且**不碰 `.github/`**；它在 `pnpm test` 里跑，
所以 CI 自带这一道。

## 4. rename 面（改一个名字，红在哪）

| 动作 | 现状 | 方案 A | 方案 A + B |
|---|---|---|---|
| 脚本改名 + 条目跟着改 | workflow 红（两处），**手动入口**若不跟着改就烂着 | workflow 红（pnpm 找不到文件）✅ | 同左，且守卫点名 |
| 只改脚本名、忘改条目 | workflow 红，手动入口**烂着**（没人跑得到） | workflow 红 ✅ | 同左 |
| **只改条目名** | workflow **全绿**（写死路径照跑），只有手动入口红 | workflow 红（旧条目名不存在）✅ | 同左 |
| 删脚本 / 搬脚本 | conventions 已写「包内脚本不搬家」 | 同上 | 守卫红 |

## 5. CI 影响

- step 数、矩阵、超时、缓存策略都不变；只有 `run:` 的行数与内容变。
- 时间：每 step 多一次 `pnpm` 启动（本机与 CI 都是毫秒级）；`pnpm -r build` / `pnpm test` 这些重活不变。
- **`release.yml` 必须同改**：否则「CI 收敛了、发布路径还写死」——本仓已经吃过一次这个亏
  （docker D119：那一步的注释就写着「发布闸自己也要挡一次」）。
- 两条 workflow 都不需要新的 secrets / 环境变量。

## 6. 验收（执行时照这个做的；结果见 § 9）

1. `grep -c 'node packages/' .github/workflows/ci.yml .github/workflows/release.yml` → **0 / 0**；
2. 本地逐条演练 9 条入口（tty 8 条 + `docker smoke`），全绿；
3. **反向验证**：临时把 `packages/tty/scripts/ssh-smoke.mjs` 改名 → `pnpm --filter @hyzyn/dsh-tty run ssh-smoke`
   立刻红（这正是方案 A 的意义：一条路径不再有第二个写死副本）；还原后 sha256 比对一致；
4. 方案 B 的守卫：把某条 workflow 的 `run` 改回写死路径 → 守卫红；
5. 两条 workflow 的 diff **只含 `run:` 行与注释**（无 step 增删、无 `if:` 改动）。

## 7. 回滚

单提交、只动 `run:` 行。`git revert <sha>` 即回，**不需要**动任何脚本或包内条目。

## 8. 明确不做

- **不搬脚本**：`conventions § 真机脚本与 CI 接线` 写着「包内脚本不搬家」（`scripts/` 下的包内脚本与
  `package.json` 条目、CI step 直接接线）；
- **不让真机脚本进 CI**：它们要真机 / 真宿主 / 真 Chrome；能静态断言的性质由既有守卫钉住
  （`packages/codegraph/test/verify-scripts-safety.test.ts`、`scripts/test/live-scripts-safety.test.ts`）；
- **不做「一条命令全跑」**：半路失败会留下垃圾进程与临时目录（同节已写明）；
- **不把 `pnpm verify:list` 当第三份真相源**：它读各包 `package.json` 的 `scripts`，是**派生视图**，
  这一条刻意保留。

## 9. 执行记录（2026-10-01，方案 A）

**改了什么**：只动两条 workflow 的 `run:` 行与注释，**step 数、`if:`、矩阵一律未动**。

| workflow | 改前 | 改后 |
|---|---|---|
| `ci.yml` `dsh-tty end-to-end scripts` | 7 条写死路径 | 7 行 `pnpm --filter @hyzyn/dsh-tty run <条目>` |
| `ci.yml` `dsh-docker smoke scripts` | 3 条写死路径 | 1 行 `pnpm --filter @hyzyn/dsh-docker run smoke` |
| `ci.yml` `dsh-tty Windows smoke` | 1 条写死路径 | `pnpm --filter @hyzyn/dsh-tty run windows-smoke` |
| `release.yml` `Test (repo vitest + dsh-docker smoke scripts)` | 3 条写死路径 | 1 行 `pnpm --filter @hyzyn/dsh-docker run smoke` |

合计 **14 → 10 行**；现算 `grep -c 'node packages/' .github/workflows/*.yml` = **0 / 0**。

**做了什么验证**（全部在本机可复现）：

1. 两份 workflow YAML 仍可解析（`yaml` 包 parse 通过）；
2. **机械等价 14 条**：HEAD 里每条写死路径，都能在对应包 `package.json` 里找到**同名条目**，
   且条目命令逐字指向同一个脚本文件；
3. **本地逐条演练 9 个入口**：docker `smoke`（2s）、tty 的 `ssh-smoke` / `probe-smoke`(11s) /
   `probe-route-smoke` / `jump-smoke` / `proxycommand-smoke` / `sftplimits-smoke` / `windows-smoke`
   全绿（`windows-smoke` 在非 Windows 上按设计自跳过）；
4. **改名演练（反向验证）**：把 `packages/tty/scripts/ssh-smoke.mjs` 改名 →
   `pnpm --filter @hyzyn/dsh-tty run ssh-smoke` **立刻红**（`Cannot find module …ssh-smoke.mjs`）——
   而同一时刻旧写法的 `node <改名后的路径>` 照跑。**这就是方案 A 要消灭的那半静默腐烂**：
   旧世界里「改了脚本名 + 同步改了 workflow 路径、却忘了包内条目」时，CI 全绿而手动入口已经烂掉。
   还原后 sha256 一致（`43ba067f…`）。

**未验证 / 留给 CI 的**：

- `integration`（tty 旗舰）**在本机跑不起来**：本环境无法开 PTY（`posix_openpt failed:
  Operation not permitted`）——**旧写法同样失败**，所以这是环境限制，不是本次改动引起；CI 的 ubuntu 腿能开。
- `windows-smoke` 在 windows 腿上的 `pnpm run` 路径（`pnpm run` 走 cmd）**没有本地证据**，第一次 CI 跑要盯一眼；
- 两条 workflow 的真执行要等推上去那一轮才算数。

**方案 B（守卫）同轮已做**：`scripts/ci-script-truth.mjs` + `scripts/test/ci-script-truth.test.ts`
（10 条用例，含五条反例：写死路径回归 / 条目改名 / 包名打错 / 发布闸跑 CI 不认的入口 / 同一入口两侧
命令不一致），另加「命中不是 0」的恒绿警戒与 CRLF 免疫。**端到端反证**：把
`node packages/tty/scripts/ssh-smoke.mjs` 塞回 `ci.yml` → 守卫报 `ci.hardcodedPath`、用例 4 条红；
用 `cp` 还原（**不碰 git**）后 sha256 一致（`2df46d2d…`）且守卫复绿。

