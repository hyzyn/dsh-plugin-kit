# 真机测试：约束与 Runbook

> **本文是「AI 真机测试约束」的唯一归宿。** 平台环境搭建见
> [../scripts/windows/README.md](../scripts/windows/README.md)（Windows 11）；
> 通用排障见 [troubleshooting.md](./troubleshooting.md)。

## 为什么单开一层

**真机脚本进不了 CI。** 它们要真实 PTY、真实 SSH、真实浏览器、真实宿主，CI runner 给不了。
后果是：**真机脚本的正确性只能靠跑一遍**——静态断言可以守住「脚本里有隔离」，守不住
「拷两次不会崩」。

实测教训（`codegraph CG48`）：给 indexForce 脚本加的 `cpSync` 隔离**从没被运行过**，
第二轮往已存在的目标上拷时崩掉，于是「indexForce 真机验证通过」对其中一半是**假的**，
而 `verify-scripts-safety.test.ts` 全程绿。

所以本层的目标是：**让下一次真机测试不重踩同样的坑，且能判断「通过」是不是真的。**

## 三条硬约束

### ① 不污染用户的真实配置

被测插件会按 `dshHome()` 往 `$DSH_HOME/cordis.patch.yml` 写托管行。脚本若继承真实
`DSH_HOME`，就会把**指向临时目录**的行写进用户真实配置，脚本结束一 `rmSync`，
用户配置里留下一条指向不存在路径的托管行。

**做法**：给被测宿主**隔离的 `DSH_HOME`**——整份拷入被测 profile，组装产物与托管行全部落在
临时目录，真实 `~/.dsh` 全程只读。

**必须自证**：收尾加一条断言「真实补丁逐字节未变」，把「不污染」从承诺变成会被执行的检查。
（范本：`scripts/verify-codegraph-host-contract.mjs`，`codegraph CG45`。）

### ② 不把「环境限制」当成「代码回归」

受限沙箱下 `posix_openpt` 会被拒，`tty` 的 `integration.mjs` 会在 `[1] 全链路` 直接崩——
那是**沙箱限制**，不是回归。同样地，假的 docker 是 `#!/bin/sh` 脚本，`docker` 的路由冒烟在
Windows 上按设计跑不了（CI 里也是 ubuntu-only）。

**`integration.mjs` 在 Windows 上也按设计跑不了**（2026-09-26 实测）：它给终端送的是 POSIX
命令（`printf "IT_TERM_%s\n" "$TERM"`），而 Windows 侧是 cmd.exe——`[1] 全链路` 会等超时，
报错里能看到 cmd 把整行原样回显。Windows 的对应入口是 `windows-smoke.mjs`（10/10，用的是
`%OS%` 这类 cmd 原生写法；W6 钉 D74 的裸 LF 归一化、W7 钉 D77 的「退出后仍可读」）。

**判据**：先问「这条在受限环境下有没有可能过」，再决定是修代码还是记成覆盖缺口。

### ③ 隔离与审批

- 文件策略通常是 `workspace-write`（只允许改仓库内）。把文件写到仓库外、或执行
  `prlctl` / 装包这类命令，需要**一次性的更宽权限**，逐条申请。
- 不要为了图省事把整台机器的权限要下来。逐条申请、逐条说明。
- **长驻进程用终端面板会话跑**（dev server / watch / 交互式程序），不要在一次性命令里挂起等待。

## 通用验证闭环

真机验证的骨架（平台细节见 `scripts/windows/README.md`）：

```sh
node -v ; pnpm -v ; dsh --version
# dsh 必须是**本仓 cohort**（= 各包 peer 下限），不是 npm 的 latest——低一档会让全部插件
# 被兼容性 preflight **静默**整行 disabled（宿主照常启动，日志里才有一行 disabling）

pnpm install
pnpm -r build
pnpm -r typecheck

# 关键一步：让插件与宿主共用同一份 @deepseek-ai/*
node scripts/link-dsh-runtime.mjs --dry-run
node scripts/link-dsh-runtime.mjs

# 测试 profile = 根 bundle + **Web 应用**
dsh plugin --profile <测试 profile> add link:$(pwd)
dsh plugin --profile <测试 profile> add "@deepseek-ai/dsh-web-app@<cohort>"
#   版本必须钉：裸包名解析到 npm 的 latest（0.0.1-rc.1），会被 preflight 正当地拒掉
dsh --profile <测试 profile> --dump-config

# 起宿主：用 patch 指定端口（`dsh --profile X web` 不是合法形式，见 scripts/windows/README.md）
dsh --profile <测试 profile> --patch <port.yml>
#   日志里出现 `dsh web: http://127.0.0.1:<port>/?token=…` 才算真起来了——「插件 mounted」不够
```

- **`link-dsh-runtime` 是必需的**：插件从本地路径加载时，Node 会解析到仓库 `.pnpm` 里那套
  `@deepseek-ai/*`，而不是宿主进程正在用的那套。升级 dsh 后会出两类**假象**——
  `instanceof` / schema 对不上报出与真实无关的错，或插件继续用旧 API 悄悄跑通、掩盖真实兼容性问题。
  详见 [link-dsh-runtime.md](./link-dsh-runtime.md)。
- ⚠️ **`pnpm install` 会重建 `node_modules`、冲掉这些链接**——装完依赖要重跑一次。
  pnpm 10 还会默认拦掉原生模块的构建脚本（esbuild / node-pty / ssh2 …），不补跑
  （`pnpm rebuild <pkgs>`）就打不出浏览器半体、真 PTY 也起不来。
- ⚠️ 别同时装 `@hyzyn/dsh-all`（或任一子包）与根 bundle，插件行重复挂载会报
  `duplicate loader entry id`。
- **用专门的测试 profile**（如 `compat` / `wintest`），不要用 `web`。
  **脚本里别写死 profile 名**——启动方式会变，写死会让断言在换 profile 时永久变红。
- **profile 里没有 `dsh-web-app` 时，宿主会「起来但没端口」**：进程活着、插件全 mounted、
  日志一切正常，`netstat` 里却什么都没有。阶段 B 的活体探针全部无从谈起——
  所以上面第 4 步那两条 `dsh plugin add` 缺一不可。

## 驱动真宿主的面板：浏览器半体的真机验证

客户端半体（面板 / 卡片）的行为只有**真浏览器 + 真宿主**能验：`packages/tty` 的 `preview`
是 mock 宿主（验布局与文案，见 [tty 包 README](../packages/tty/README.md) 的预览一节），验不到
「宿主推的真帧到达之后，客户端怎么反应」。这条路有四条实测约束（2026-10-10 走通一次，方法照抄即可）：

1. **token 只有自己起的宿主才有。** `dsh web` 打印的 `?token=…` 是**进程内随机**
   （`processLaunchToken` → `randomBytes`，不落盘），而子进程环境里的 `DSH_WEB_URL`
   **不带 token**。于是**已经在跑的宿主，agent 驱动不了它的页面**（`GET /` 与 `/api/*` 都是 401）
   ——`verify-client-ui.mjs --url <宿主> --token <token>` 里那个 token，只能是**你自己起的那一个**，
   或由用户从他的地址栏给你。
2. **要「真设置 + 能跑 agent」，用真 `DSH_HOME` + 复制一份 profile**（不要隔离 home）：

   ```sh
   cp -R ~/.dsh/profiles/<源> ~/.dsh/profiles/<临时名>   # 相对符号链接同深度，拷完照常可用
   dsh --profile <临时名> --port <空闲端口>              # stdout 那行 `dsh web: …/?token=…` 就是入口
   ```

   副本跑在**真 `DSH_HOME`** 上，所以用户的设置、模型路由与凭据都在（隔离 home 里没有这些，
   除非另行播种）⇒ **宿主里的 agent 真能跑**；profile 名与端口都不同，也不会去抢源 profile 的 tmux socket。Windows 上别用 `fs.cpSync`
   （会把 junction 展开成真副本）——`scripts/live-host-smoke.mjs` 的 `copyProfileTree` 就是为这个写的。
   收尾：关宿主、关页面；临时 profile 的删除先问用户。
3. **驱动用会话里的浏览器自动化**（Playwright MCP 的 `browser_*`，或仓内零依赖的
   `scripts/chrome-cdp.mjs`）。三个坑都是实测踩到的：
   - **先确认页面跑的是哪一版产物**：bundle 从磁盘现读、rev 按 `mtime/ctime/size` 现算，
     所以「源码改了」不等于「这个页面加载了新代码」。拿**新版才有的 DOM 节点 / 样式规则**当探针
     最省事（本次用的是面板骨架里的 `.tt_exitBar` 节点与样式表里的 `.tt_confirmLayer` 规则）。
   - **模态背后的输入框点不到、但能键入**：`element.focus()` + `page.keyboard.type()` 照常送达；
     `document.execCommand('insertText')` 在那套富文本编辑器上**不生效**（`textContent` 仍是空），
     别用它；也别在核对 `textContent` 之前按 Enter（会发出一条空/半截的消息）。
   - **权限档位会拦 agent 的工具调用**：默认「工作区内修改」下 `tty_open` 之类会停在
     「等待审批：拒绝 / 允许一次」——驱动脚本要能等到并点掉它，否则断言卡在「目标没出现」，
     看起来像产品缺陷。
4. **断言要取两侧**：宿主侧的工具输出只说明「会话没了」，面板里的标签有没有收走是**客户端**的行为
   （`tty_list` 看到 0 条、标签栏却还挂着，正是 tty D97 的现场）。要区分「用户亲手点过」与
   「客户端自己顶上来」，就用**真点击**（`page.click()`）制造前者。

## 各包真机入口

**入口一律写成一条可粘贴命令**（包的脚本条目在各自 `package.json` 里）。仓库根那 9 个
`scripts/verify-*.mjs` 也能被一条命令列全：`pnpm verify:list`——它现算「脚本 / 所在包 /
需要什么 / 是否进 CI / 那条命令」，且**只列不跑**（它们会起真宿主与真 Chrome，聚合执行会把
垃圾进程与临时目录留在机器上）。

| 包 | 一条可粘贴命令 | 需要什么 |
|---|---|---|
| `tty` | `pnpm --filter @hyzyn/dsh-tty run integration`（真实 PTY 全链路）、`… run ssh-smoke`（内存 sshd）、`… run probe-smoke`、`… run probe-route-smoke`、`… run sftplimits-smoke`、`… run preview`（Chrome，**mock** 宿主，界面场景）、`… run windows-smoke`（仅 Windows 有意义）；「真宿主 + 真浏览器驱动面板」见 [§ 驱动真宿主的面板](#驱动真宿主的面板浏览器半体的真机验证） | 真实 PTY / Chrome / Windows |
| `codegraph` | `pnpm --filter @hyzyn/dsh-codegraph run agent-scope-smoke`（最小 Cordis 根）、`… run agent-integration-smoke`（真 `AgentRegistry` 驱动真 `agent/created`）、`… run indexforce-smoke`、`… run host-contract-smoke`（真宿主路由与开关）、`… run client-ui-smoke`（自起隔离宿主 + 真 Chrome） | 真 DSH 宿主 / 真 CLI / Chrome |
| `mcp` | `pnpm --filter @hyzyn/dsh-mcp run http-smoke`（streamable-http 的三种响应模式；只打 `/api/dsh-mcp/test`，不写配置）、`… run tools-smoke`（保存 → 热加载 → 工具真的进注册表；会写宿主 MCP 配置并**逐条写回**） | 正在跑的宿主（装了 `dsh-mcp`；`tools-smoke` 的 L2 那半还需 `dsh-search` 与一次 agent 回合） |
| `rss` | `pnpm --filter @hyzyn/dsh-rss run opml-smoke`（OPML 导入 / 导出 / 回环；先存基线，收尾写回并重刷 digest） | 正在跑的宿主 + token + 真 Chrome（受限沙箱加 `--chrome-arg --no-sandbox`） |
| `docker` | `pnpm --filter @hyzyn/dsh-docker run smoke`（`smoke.mjs` + `route-smoke.mjs` + `client-smoke.mjs`，hermetic，能进 CI）；真机项需真 docker daemon | 真 docker |
| 通用（L0） | `node scripts/verify-client-ui.mjs --url <宿主> --token <token>`（应用壳 + 逐插件配置页；`--mode boot` 只验壳；**token 从哪来见 [§ 驱动真宿主的面板](#驱动真宿主的面板浏览器半体的真机验证）**）、`pnpm verify:list`（只列不跑） | 正在跑的宿主 + token + 真 Chrome |
| 全部 | `pnpm live-smoke`（= `node scripts/live-host-smoke.mjs`；干净机器 `node scripts/live-host-smoke.mjs --bootstrap --strict`）（真宿主：能力开关授权阶梯 / 路由门控 / 工具清单 / 试连文案 / 宿主正服务的 `client.js`） | 装了 DSH 的任意机器（干净机器加 `--bootstrap`） |
| 全部 | `node scripts/windows/setup-dsh-testenv.ps1 -WithRepo` | Windows 11 |

> ✅ **2026-09-30 真机分诊 → 复跑 → 修复的结论**：
> `… run client-ui-smoke` 与 `node scripts/verify-client-ui.mjs --mode full` 当时**全红**（UI8/UI9/UI11/UI12），
> 根因是**四条过期的选择器 / 结构口径**（DOM dump 实测，不是读代码）：① 插件页行文案从短名改成
> 全包名（`codegraph` → `@hyzyn/dsh-codegraph`）；② 行级 `配置 <key>` 入口与 `[data-plugin-row-detail]`
> 已不存在——卡片改由 `plugins.bundle.config` **内联渲染在包详情页**；③ 侧边栏「终端」是
> `div[role=button]` 而不是 `<button>`；④ 设置面板的定位当时被「添加一个 API Key」引导弹窗抢走。
> **当日已按当前形状修好**（判据改的是「怎么找」，不是「要不要过」：控件数 / 文本长度两个下限沿用
> 原来的 `> 0` / `> 40`）。`… run opml-smoke` 当时在受限沙箱里起不来 Chrome（`Runtime.enable` 超时）
> 是因为它**没有 Chrome 参数透传口**，本轮按 `verify-client-ui.mjs` 的既有形态补上了可重复的
> `--chrome-arg <参数>`（**默认关**；受限沙箱里用 `--chrome-arg --no-sandbox`）。
> **本轮逐条重跑（依据 2026-09-30 重跑记录，各脚本自己有报告）：9 个脚本 9 个跑过并通过、0 个被挡**——
> `agent-scope` 10/10、`agent-integration` 9/9、`indexforce` 5/5、`host-contract` 42/42、
> **`client-ui-smoke` 18 PASS / 1 WARN / 0 FAIL**、**`opml-smoke` 9/9**（带 `--chrome-arg --no-sandbox`）、
> `mcp-http` 7/7、`mcp-tools` 7 PASS / 1 WARN / 0 FAIL，通用 `verify-client-ui.mjs --mode full`
> 18 PASS / 1 WARN / 0 FAIL。两条 WARN 都是**设计内**的：UI11 的沙箱 `posix_openpt` 被拒
> （与上文「三条硬约束 ②：不把环境限制当成代码回归」同因，环境限制记 WARN 而不是 FAIL）、
> `mcp-tools` 的 L2 需要一次 agent 回合（它只负责 L1）。

> **三层真机脚本的分工**（codegraph 的实践，可照搬）：
> **机制**（最小 Cordis 根 + 假 agent）→ **宿主契约**（真宿主，验路由 / 开关 / 托管行）→
> **集成**（真插件 + 真 `AgentRegistry` 驱动真事件）。
> 补第三层的理由：前两层全绿也**证明不了「用户开会话时功能真的生效」**——机制脚本用假 agent，
> 宿主脚本里没有 agent 被创建（每轮都是 `mounted=0`）。而全部价值就在那条路径上。

## Windows / Parallels 实测经验

> 2026-09-25 一轮 Windows 真机验证里实际踩到的坑，记下来省下一次重踩。

- **`prlctl exec` 以 SYSTEM 身份运行**，看不到某个用户的安装（SYSTEM 的 Node 装在
  `C:\Windows\System32\config\systemprofile\...`，普通用户 `Access denied`）。
- **无密码的 Windows 账户无法用 `prlctl exec -u <user> --password` 认证**。
  绕法：建**交互式计划任务**（`schtasks /create ... /ru <user> /it`），它会以该用户身份跑。
- **cmd 的解析期展开**：`%VAR%` 与 `%ERRORLEVEL%` 在**整行解析时**就展开完了——
  在 batch 里读它们会拿到过期值（我因此读到过一个假的 `CURL=0`）。用 `setlocal enabledelayedexpansion`
  配 `!VAR!`，或拆成多行。
- **在 batch 里调 `dsh.cmd` 必须写 `call dsh`**，否则控制权被它拿走、后续行不执行。
- **计划任务的 batch 要 `chcp 65001`**；读输出用 `Get-Content -Encoding UTF8`
  （cmd 重定向写的是系统代码页，直接读会乱码）。
- **`\\Mac\Home` 只暴露 Desktop / Documents / Downloads / Movies / Music / Pictures**，
  仓库目录不在其中 → 代码传输要另想办法（临时 HTTP 服务 / `git archive` 打包）。
- **别删了再忘**：`-WithRepo` 会往 VM 里落仓库副本、`node_modules`、profile 与 overlay 文件。
  收尾把计划任务、node 进程、日志、临时目录一并清掉。
- **`prlctl exec` 的 SYSTEM 身份这次反而省事（2026-09-26）**：VM 里 SYSTEM 侧已有上一轮装的
  node / pnpm / dsh（`…\systemprofile\AppData\Local\dsh-nodes\v22.23.3`，正是本仓要的
  cohort 0.1.7-rc.2），于是全程按 SYSTEM 跑，**绕开了交互式计划任务那套**；用户 `czz` 侧反而
  没有工具链。先探一句 `where node` 再决定走哪条路，能省一大截。
- **`\\Mac\Home\Downloads` 在 SYSTEM 上下文里也能读**（这次实测）：runbook 原来只记了
  「仓库目录不在共享列表」——`Downloads` 恰好在共享列表里，把 tarball 放那儿再反向拷日志回来
  是最省事的通道；仓库本身走临时 HTTP（`python3 -m http.server` + `curl.exe`）即可。
- **本地 macOS 有 ssh-agent 会掩盖 CI 红**（这次最值钱的一条）：`auth` 默认 `agent`，
  而 `buildConnectConfig` 在没有 `SSH_AUTH_SOCK` 的环境会**先抛**「未设置 ssh-agent」——
  于是那些用例在 macOS 上全绿，**在 ubuntu CI 与 Windows 上本来就是红的**，只是没人跑过。
  写法：`vi.stubEnv('SSH_AUTH_SOCK', '/tmp/…')`（既有范本 `packages/docker/test/ssh-connect.test.ts`）
  或把 spec 写成 `auth: 'password'`。**自查命令：`env -u SSH_AUTH_SOCK pnpm test`**——它能在
  macOS 上等价复现 ubuntu CI 的这类依赖，比等 CI 便宜得多。
- **`os.homedir()` 在 Windows 看 `USERPROFILE`、不看 `HOME`**：只改 `HOME` 的用例在 macOS /
  ubuntu 上绿，在 Windows 上路由读到的是真实 profile（那儿没有 `.ssh/config`）→ 断言全崩。
  改法：两个变量一起设、一起还原。
- **Ubuntu（Parallels，干净 VM）腿的实测（2026-09-26）**：
  - **VM 里没有工具链，apt 的 `nodejs` 只到 18**（本仓要 ≥22.19）→ 从 nodejs.org 取官方
    arm64 tarball 解到 `/usr/local`（`tar -xJf … --strip-components=1`）+ `npm i -g pnpm@10.30.3`。
  - **VM→外网很慢**：nodejs.org 实测 ~30KB/s、npm registry ~155KB/s。**大文件在宿主机下好、
    用 `python3 -m http.server` + `curl` 从 `10.211.55.2` 喂进去**（这条链是本地网络，快得多）；
    `pnpm install --frozen-lockfile` 在这条链上花了 **7m47s**（可接受）。
  - **`prlctl exec <vm> bash -c "含空格的命令"` 会被拆参数**（Linux 与 Windows 都踩到）：
    现象是 `cd /root/x && pnpm …` 只剩 `cd` 生效，pnpm 在 `/` 里跑（`ERR_PNPM_NO_PKG_MANIFEST`）。
    稳妥写法：把步骤写成**一个脚本**（宿主机生成、HTTP 送进去），`prlctl exec <vm> bash /root/run.sh <step>`
    —— argv 里没有空格，就没有解析歧义。
  - **更好的写法（2026-09-26 补）：脚本走 stdin** —— `prlctl exec <vm> bash < run.sh`。
    实测 `bash -c 'echo hi'` / `bash -lc 'echo hi'` 都**没有任何输出**（`-c` 后面的串进不去），
    而 `cat run.sh | prlctl exec <vm> bash` 正常工作；普通命令加空格不受影响
    （`prlctl exec <vm> /bin/echo 'a b'` → `a b`）。**一条多行脚本可以一次跑完**，不必再拆步骤。
    注意 `prlctl exec` 的环境很干净：`PATH=/bin:/sbin:/usr/bin:/usr/sbin`（**没有 `/usr/local/bin`**）、
    `HOME=/`——脚本里自己 `export PATH=/usr/local/bin:$PATH`。
  - **`git archive` 不带 `.git`，于是 `artifact`（`git diff` 产物）与 `no-public-ip`
    （`git ls-files`）两个闸门跑不了**（报 `not a git repository`，看起来像断言失败）。
    两条路：传 `git bundle`，或就地 `git init && git add -A && git commit` —— 解出来的树**就是
    HEAD 的内容**，所以就地提交与 CI 的语义等价（本次用后者，两个闸门随后全绿）。
  - **umask 会把权限断言打红**：Ubuntu 上以 root 跑（umask 077）时，
    `packages/kit/test/kit.test.ts` 的 `0640` 断言失败（`expected 384 to be 416`）。本机 macOS
    上 DSH 宿主进程的 umask 是 **0**，所以一直绿。**本地复现**：
    `bash -c 'umask 077; npx vitest run packages/kit/test/kit.test.ts'`。这暴露的是**实现**问题
    （权限随 umask 漂），修在 kit `writeFileAtomic`（见 `kit D06`），不是放宽断言。
  - **rc.1 与 rc.2 的 DSH 不能混用**：这台 VM 的 `/usr/local/bin` 里只有一个 rc.1 的宿主，
    而各包 peer 下限是 rc.2——所以宿主相关的验收（`live-host-smoke`）在 Linux 上要先装对 cohort；
    纯 hermetic 的冒烟与 vitest 不受影响（本次全部跑绿）。**`--bootstrap`（见下）现在会把这件事
    变成一条明确的报错**：cohort 不匹配时 DSH 会把本仓插件整批 `disabled`，自证那步直接失败，
    而不是让验收跑出一堆看起来像代码坏了的 FAIL。
- **Windows：`where dsh` 的第一条不能拿去 spawn（2026-09-26）**：npm 全局装出来的 `dsh`
  是**无扩展名的 POSIX shell 脚本** + `dsh.cmd`，`where` 先返回前者，`spawn` 它直接
  `ENOENT`（`live-host-smoke` 第一次在 Windows 上跑就死在这儿）。而 `.cmd` 只能经 shell 启动，
  `shell: true` 又会把 `link:C:\含 空格的路径\packages\tty` 交给 cmd 再解析一遍。
  做法：解析出**真正的 JS 入口**（`…/@deepseek-ai/dsh/lib/bin.js`）用当前这个 node 跑
  （`scripts/dsh-exec.mjs`，platform 与搜索函数可注入，所以这条 Windows 分支在 macOS / ubuntu
  上也能被单测跑到）。
- **Windows：`fs.cpSync` 会把 junction 展开成真目录（这条最贵）**：pnpm 的 `link:` 依赖在
  Windows 上是 **junction**，`cpSync(..., { verbatimSymlinks: true, dereference: false })`
  照样把它复制成**真目录**——实测一个链接的包变成 **124MB 的真副本**（两份拷贝 ≈ 250MB）。
  后果不是慢而是**坏**：副本里没有它依赖的兄弟包（`@deepseek-ai/cosmokit` 那种只在宿主 store
  里与 schemastery 并列的包），插件 `import` 直接失败，宿主日志只有一句
  `docker (@hyzyn/dsh-docker): failed to import`，路由全 404、18 条断言里 17 条红——
  **看起来像插件在 Windows 上坏了**。做法：自己走目录树，链接（含 junction）建成链接
  （`copyProfileTree`：Windows 必须建成 `junction` 类型，且 junction 只认绝对目标）。
- **往 Windows VM 传仓库时要排除 `node_modules`**：`tar` 会把宿主机上的符号链接原样带过去
  （`packages/*/node_modules/@deepseek-ai/*` 在 macOS 上是**绝对** mac 路径），落地后链接看着
  还在、`dir` 也正常，Node 却解析不到（`Cannot find package 'js-yaml'`）——
  本次为此白跑两轮。收尾一律 `pnpm install` + `node scripts/link-dsh-runtime.mjs` 重建。
- **给 VM 的 `.bat` 一律纯 ASCII**：cmd 在非 65001 代码页下会把含中文的 `.bat` 解析错位
  （现象是 `'ayedexpansion' 不是内部或外部命令`、`copy` 变成 `py`，整段命令错行）。
  node 输出的中文照常——那是 stdout，与 batch 解析无关。
- **失败时要打宿主日志**：`live-host-smoke` 现在每条 FAIL 之后会打印两个宿主实例的日志尾部
  （「路由 404 / 工具没注册 / client.js 是空的」这类失败，全部线索都在那里）。上面第 2 条就是
  靠它一眼看出 `failed to import` 的——没有它只能猜。
- **macOS 的 `tar` 会带出 `._*.ts` 垃圾文件**：把改动打包进 Windows（bsdtar 带 xattr）后，
  vitest 会把 `._foo.test.ts` 当成测试文件，报 4 个「文件失败」而**每条断言都是通过的**——
  看着像代码坏了。打包加 `COPYFILE_DISABLE=1`，或落地后删 `._*`。

## 干净机器上的真宿主验收：`--bootstrap`

`pnpm live-smoke`（[scripts/live-host-smoke.mjs](../scripts/live-host-smoke.mjs)）的前提是
**机器上已有一个「link 到本仓」的 profile**——开发机上它天然存在，而**干净环境全都没有**：
CI 腿、Parallels 的 Windows / Ubuntu 腿、别人的新克隆。以前这种情况下它只能打印 SKIP，而
SKIP 在「我跑过了」这句话里最容易被当成 PASS。

```bash
# 干净机器（VM / 新克隆）：没有 link profile 也一条命令跑完
pnpm install --frozen-lockfile
node scripts/link-dsh-runtime.mjs          # 插件与宿主共用同一份 @deepseek-ai/*（必需）
node scripts/live-host-smoke.mjs --bootstrap --strict    # 18 条断言，含两个宿主实例
```

**落地顺序不能省**：`pnpm install` 会重建 `node_modules`（冲掉 `link-dsh-runtime` 的链接），
所以每次传完/装完都要重跑一次 `link-dsh-runtime`；漏掉它的症状是插件 import 失败、路由全 404，
而不是一条「链接不对」的报错。

`--bootstrap` 做的事（[scripts/live-profile.mjs](../scripts/live-profile.mjs)）：

1. `dsh --profile live-smoke-src-<pid> --from-default-profile web --dump-config` —— 从 dsh
   **自带**的 `web` 模板初始化一个一次性 profile（`--dump-config` 是**不启动宿主**的那条路）；
2. `dsh plugin --profile <它> add link:<本仓>/packages/{docker,tty}` —— 挂本仓的两个插件
   （只挂验收真正要用的两个：挂全仓会把不相干的安装问题变成这条验收的失败原因）；
3. 写它的 `cordis.patch.yml`：docker 的 `allowMutations/allowExec` **故意写 true** —— 验收的
   A 段要证的正是「配置里写着 true、宿主没授权时有效值仍是 false」。**少了这一层，A1 就是一条
   恒真的空断言**（这条有单测守着）；
4. **自证**：再 `--dump-config` 一次读组合结果，本仓的插件行必须真的在里面——没有就是被 DSH 的
   兼容性闸门整批 `disabled`（cohort 不匹配），这时**直接失败并说明原因**。

跑完连这个模板 profile 一起删（与两份拷贝同属「本次运行自己造的」，删除只认记录下来的路径）。

**两条腿的实测（2026-09-26）**：Windows 11（SYSTEM 上下文）与 Ubuntu 24.04 都是
**18/18 PASS**——即「干净机器上一条命令连宿主一起验」这件事本身在两个 CI 平台上都成立。
Linux 侧顺带确认：profile 里的链接是**相对符号链接**，`copyProfileTree` 原样保留（可搬迁）；
Windows 侧则是 junction，必须建成 junction（建目录符号链接要特权）。
另外两条 VM 用法上的经验：

- **只为跑这条验收装依赖时可以用 filter**：`pnpm install --frozen-lockfile --filter
  @hyzyn/dsh-kit --filter @hyzyn/dsh-docker --filter @hyzyn/dsh-tty` 只装这三棵子树
  （Ubuntu 上 store 已热：**641ms**，而不是整仓那次的 7m47s）。要跑 vitest / 冒烟就还是得整仓装。
- **`prlctl exec` 的环境里 `HOME=/`**（不是 `/root`）：于是 `os.homedir()` 推出的 DSH home 是
  **`/.dsh`**，profile 与日志都落在根目录下。跑完随手 `rm -rf /.dsh`（本次留下的只有匿名凭据、
  空的 profiles 目录与 storages）——这也是为什么脚本**不自己设 `DSH_HOME`**：宿主与脚本看到的
  必须是同一个目录。

安全性质由 `scripts/test/live-host-smoke-safety.test.ts` 读源码钉住（名字带 pid、拒绝覆盖、
只删记录下来的目录、不设 `DSH_HOME`、非 CI）；生成物本身的形状由
`scripts/test/live-profile.test.ts` 钉住。

## 什么算「真机验证通过」

**绿灯不算。** 至少要有：

1. **反向验证 / 变异验证**：把修复改回去（或把守卫去掉），确认新用例**立刻变红**，
   且报出的信息与现象一致。只加一条「修前修后都绿」的用例等于没测。
2. **判据要测对对象**：`tty D51` 的教训——断言数「重画次数」而非「是否回放缓冲」，
   次数无法归因，于是偶发假红；假红会训练人忽略红。
3. **数字要现算**：台账 / README 里的计数由脚本从事实推导，不写死期望值。
4. **说清「没验的部分」**：哪些项「已修但未现场压测」要显式写出来，不要混进「通过」。
