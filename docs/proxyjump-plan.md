# 跳板机（ProxyJump / ProxyCommand）完整实现方案

> **状态：未开工（活的待办方案，不是冻结记录）。** 短期那一半已落地（2026-09-25，见
> [项目级 ROADMAP.md 第 2 项](../ROADMAP.md)）：`~/.ssh/config` 导入跳过依赖跳板机的块并点名、
> 超时 / 探针 / 通道错误 / 条目缺失四处文案点出成因，顺带修掉导入的四种静默丢弃（tty D63）。
> **本文只写「完整实现（真的经跳板机连）该怎么做、坑在哪、怎么验收」**，动手前先读一遍。
>
> 立项理由与「为什么是 L0」在 [项目级 ROADMAP.md](../ROADMAP.md)（原文照录，含两包各自的原始措辞）：
> 两包各有一套连接构造，跳板机必须**一起做**——「docker 目标能过 bastion、终端不行」这种
> 半吊子状态比不做更糟。
>
> 涉及包：`tty`（`src/ssh.ts` · `src/probe.ts` · `src/tunnels.ts` · `src/sftp.ts` · `src/index.ts` ·
> `client-src/`）· `docker`（`src/ssh-exec.ts` · `src/index.ts` · `client-src/`）。

## 0. 一句话方案

在 `SshSpec` 上加一个可选的 `jump`（跳板机规格）；连接时先拨跳板机，用它的
`forwardOut(target.host, target.port)` 拿到一条**通道**，把这条通道当 `ConnectConfig.sock`
交给目标连接——ssh2 本身支持这么做，**不需要新依赖**。`tty` 与 `docker` 同步实现，且
docker 的连接池键必须把跳板机身份并进去。`ProxyCommand` 单独一档（信任级不同），
**不随 `~/.ssh/config` 导入带进来**。

## 1. 已经具备的条件（省掉一半工作量）

| 能力 | 出处 | 说明 |
|---|---|---|
| `ConnectConfig.sock?: Readable` | ssh2 1.17 类型（`@types/ssh2` 的 `ConnectConfig`） | 目标 client 可以直接跑在一条已有通道上；**ssh2 在 `sock` 分支同样会武装 `readyTimeout`** |
| `Client.forwardOut(srcIP, srcPort, dstIP, dstPort, cb)` | ssh2 类型 | 本仓已在用：`tty/src/tunnels.ts` 的 `-L` 本地转发就是它（通道往返有集成用例 B20） |
| 主机密钥策略可复用 | `tty/src/ssh.ts` 的 `applyHostKeyPolicy`、`docker/src/ssh-exec.ts` 的同名函数 | 参数化在 `(connectConfig, spec, store, logger, target)` 上，没有任何单连接闭包——跳板机再来一次即可 |
| 连接簿是 docker 读得到的 | `docker/src/index.ts` 的 `readTtyBooks()`（`settings.get('tty')`） | 跳板机只需要在 **tty 的连接簿**里配一次，docker 目标引用同一本簿就跟着有 |
| 两侧都有「试连」探针 | `tty/src/probe.ts`、docker 的面板 | 用户遇到连不上时第一个会点的按钮 |

## 2. 数据模型

在**两包各自的** `SshSpec` 上加同一形状的字段（两包不许互相 import，类型各写一份，
形状由本文钉住）：

```ts
/** 跳板机规格：与 SshSpec 同形但不再嵌套（不支持跳板机的跳板机）。 */
export interface SshJumpSpec {
  /** tty 连接簿条目名：给出时以该条目的字段为基底，内联字段逐项覆盖。 */
  book?: string
  host: string
  port?: number
  username: string
  auth?: 'agent' | 'key' | 'password'
  keyPath?: string
  passphrase?: string
  password?: string
}

export interface SshSpec {
  // …既有字段…
  /** 经跳板机连接（ProxyJump 语义）。 */
  jump?: SshJumpSpec
}
```

**为什么不是 OpenSSH 的 `user@host:port` 字符串**：字符串装不下凭据，而本仓所有认证都走
`resolveSecret`（`env:NAME` 引用、凭据存储层）——跳板机同样需要 key / password / agent 三态。

**为什么用 `book` 引用而不是无限嵌套**：`SSH_HOST_SCHEMA` 是 schemastery 的 `z.object`，
自引用要写成惰性 thunk；而且连接簿本来就是「一处维护、多处引用」的形态。
`book` 在 **tty 侧**解析（`findSshHost`）；docker 侧由它自己的 `readTtyBooks()` 解析
（docker 的目标本来就能引用连接簿条目）。

## 3. 连接构造：拨跳板机 → forwardOut → sock

目标连接的完整序列（两包各写一遍，但必须逐句同序）：

```ts
// ① 跳板机：与普通连接完全同一条路（buildConnectConfig + applyHostKeyPolicy）
const bastionConfig = await buildConnectConfig(jumpSpec)
const bastionPolicy = applyHostKeyPolicy({ connectConfig: bastionConfig, spec: jumpSpec, store, logger, target: jumpTarget })
const bastion = new Client()
bastion.on('keyboard-interactive', …)            // tryKeyboard 时（password 认证）
bastion.on('error', (error) => fail(bastionPolicy.mismatchMessage() ?? `跳板机连接失败（${jumpTarget}）：${classifyError(error.message)}`))
bastion.on('close', () => fail(`跳板机连接已关闭（${jumpTarget}）：目标连接尚未建立`))
bastion.connect(bastionConfig)
await once(bastion, 'ready')                      // 失败路径必须显式 reject 目标那条 promise

// ② 借一条通道当 sock
const sock = await new Promise<ClientChannel>((resolve, reject) =>
  bastion.forwardOut('127.0.0.1', 0, spec.host, spec.port ?? 22, (error, channel) => error ? reject(error) : resolve(channel)))

// ③ 目标连接：host/port 仍照写（标签与认证用），但真实传输走 sock
const connectConfig = await buildConnectConfig(spec)
connectConfig.sock = sock
const policy = applyHostKeyPolicy({ connectConfig, spec, store, logger, target })
// …之后与既有代码逐字相同（spawnSsh / acquire 的 ready / error / close 处理）
```

**要点**：

- **两跳各有自己的 `applyHostKeyPolicy` 与 `mismatchMessage()` 句柄**：指纹变更提示必须来自
  正确的那一跳，否则用户会去改对端主机而问题在跳板机。
- **TOFU 指纹库的键是 `(host, port)`**（两包同形）。跳板机与目标撞 `host:port`（NAT 后面
  的 `127.0.0.1:22` 很常见）会共用一套指纹 → 假 MISMATCH。**要么把跳板机身份并进指纹键，
  要么在跳板机上不带指纹库**（只记录、不比对）——二选一，写进实现注释。
- **超时归属**：ssh2 在 `sock` 分支也会武装 `readyTimeout`，报的是
  `Timed out while waiting for handshake`，经 `classifyError` 后「跳板机不可达」与
  「目标不可达」长得一模一样。**必须自己记阶段**（拨跳板机 / 等通道 / 目标握手三个计时），
  并在文案里带上阶段名——现状 tty 只有 channel 打开之后的 15s 看门狗，覆盖不到这里。
- **docker 的 `acquire()` 要保持「先占坑再异步解析配置」**（D02）：跳板机的 Client 必须在
  `conns.set(key, entry)` **之后**建，才能被 `settleError` / `ownsEntry()` 的归属校验管住。
- **`proxyJump` 与 `ProxyCommand` 只用一条**：两者同时给时按 OpenSSH 语义
  （`ProxyJump` 优先）并记一条 warn，别静默。

## 4. 生命周期与清理（最容易漏、漏了就是脱管连接）

**所有权规则**：跳板机 Client 拥有通道；目标 Client 只是**借用**。ssh2 的 `end()` / `destroy()`
只关借来的通道，**不关跳板机传输**。所以：

| 位置 | 现在只关了什么 | 要加什么 |
|---|---|---|
| `tty/src/ssh.ts` 的 `finish()` | `conn.end()` | 先目标、后 `bastion.end()`（顺序反了会在目标还活着时抽掉通道） |
| `docker/src/ssh-exec.ts` 的 `settleError()` / `dropConn()` | `dropConn(key, client)` + `forceClose()` | 同时关闭该连接的 bastion（`RuntimeConn` 加一个 `jump?: Client`，或 `extra: Client[]`） |
| `docker/src/ssh-exec.ts` 的 `disposeAll()` | 只 `rt.client.end()` | bastion 也要 `end()` + `disposed = true` |
| `openChannel` 的传输错误重连路径 | 丢目标 client 后重连 | bastion 一起丢、一起重拨（否则每次重试漏一条 keepalive 一直养着的连接） |

**连接池键**（docker 独有，**必须一起改**）：现在是
`poolKey(spec) = user@host:port`（`ssh-exec.ts`）——跳板机 A 与跳板机 B 到同一目标会并成
**同一条**连接，静默走错 bastion。改成把跳板机身份并进去，例如
`${basis}|jump:${jump.book ?? `${jump.username}@${jump.host}:${jump.port ?? 22}`}`。
tty 侧没有连接池（`spawnSsh` 一次一连接），但 **SFTP 池的键是 `JSON.stringify(spec)`**
（`sftp.ts` 的 `signatureOf`）——加字段后自动参与，改跳板机即失效重连，符合预期。

## 5. 探针与 UI

- **`tty/src/probe.ts` 要加一跳**：现状是「TCP 预检（6s）→ ssh2 握手（8s）」，两阶段都只针对
  目标。有跳板机时：先对**跳板机**做 TCP 预检 + 握手（复用同一套），再经通道做目标的握手；
  `ProbeResult` 增加跳板机维度（至少：跳板机是否可达 / 认证是否通过 / 通道是否打开）。
  只有 TCP 预检那一层需要 `net.connect` 直连——有跳板机时**目标那一跳的 TCP 预检没有意义**，
  要么跳过并如实说明，要么经通道再探一次（成本高，建议前者 + 文案说明）。
- **连接簿 / 目标配置界面**：tty 的 SSH 对话框与连接簿条目加「跳板机」一组字段
  （先做成「引用另一个连接簿条目」的下拉 + 手填兜底，避免一次加十几个输入框）；
  docker 侧**不加新界面**——它的目标本来就引用 tty 连接簿，跳板机在那边配一次即可。
- **扁平白名单（约 20 处）必须全部补上，漏一处就是「配了等于没配」**——这是本项最容易
  半途而废的地方，列清楚：

  | 包 | 位置（按符号） |
  |---|---|
  | tty | `SSH_HOST_SCHEMA`（settings schema）、`sanitizeSshHosts`、`validateSshHosts`、`mergeSshSpec`、probe 路由里手搓的 spec、`tunnels.ts` 里那份 spec 拷贝、`ssh-config.ts` 的导入映射、`probe.ts` 的 `validateSshFields` |
  | tty 客户端 | SSH 对话框（提交 / 试连 / 保存三处）、卡片编辑与保存映射、SFTP 用的 spec |
  | docker | `TARGET_SCHEMA`、`sanitizeTargets`、`readTtyBooks`、`resolveTarget` 的内联分支、目标改名时的身份字段匹配表 |
  | docker 客户端 | 目标内联 SSH 字段那一组（若决定支持内联跳板机；本轮可只支持「经连接簿」） |

- **导入映射（`~/.ssh/config`）**：短期那一半是「跳过并点名」。完整实现时要做**第二遍解析**：
  `ProxyJump` 的值可能是 `user@host:port`，也可能是**同一份 config 里的另一个 Host 别名**
  ——后者要按 OpenSSH 的 Host 模式匹配（含通配 / 否定）去解析，且块序任意（可能引用后面的块）。
  解析不出来就**照旧跳过并点名**，不要产出一条注定连不上的条目。
  另外 `Include` 目前不展开，跨文件的别名解析不了——如实说「引用的是别的文件里的别名」。

## 6. `ProxyCommand`：单独一档，本轮不做

`ProxyCommand` 是**设置字段驱动的本地任意命令执行**，信任级与「回环围栏 + 显式开关之后的
路由」完全不同。要做必须先定闸门（谁能在什么条件下写这个字段、要不要二次确认、要不要与
docker 的 `allowMutations` 同款的显式开关），并且：

- **绝不在 `~/.ssh/config` 导入时自动带进来**（短期那一半已经这么做了，保持）；
- 实现上它和跳板机走同一个 `sock`，但流是 `child_process` 的 stdio：
  `Duplex.from({ readable: child.stdout, writable: child.stdin })`，并且**必须**把
  `child.stderr` 排空、child 退出与 sock 销毁双向接线（ssh2 不管子进程的生死）；
- 单独一轮做，不要在跳板机那一轮顺手带上——`ProxyJump` 已经有足够的坑了。

## 7. 分步落地顺序（每一步都要保持「两包同时可用」）

1. **类型与白名单**（两包）：`SshJumpSpec` + `jump` 字段 + 上面那张白名单表全部补上，
   连接构造先**明确拒绝**（`jump` 存在时抛「尚不支持」并带 ROADMAP 指引），
   让「配了但没用」变成看得见的错而不是静默直连。**门槛**：白名单的往返用例（保存 → 读回 → 相等）。
2. **tty 拨号 + 清理**：`ssh.ts` 的跳板机拨号、阶段化超时、`finish()` 关两层；
   SFTP 与隧道自动受益（同一入口）。**门槛**：假 ssh2 的单测（`tunnels.test.ts` 已有 `forwardOut`
   桩的写法）+ 真机：本机 sshd 当跳板机，终端标签经它连到第二台（`scripts/integration.mjs` 加一档）。
3. **docker 拨号 + 池键 + 清理**：`acquire` / `poolKey` / `disposeAll` / 重连路径。
   **门槛**：`ssh-connect.test.ts` 加「不同跳板机不共用连接」的用例（池键）+ 真机
   （docker 目标经跳板机跑一次 `docker ps`）。
4. **探针与 UI**：`probe.ts` 的跳板机维度 + 对话框字段 + 卡片展示。
   **门槛**：`probe.test.ts` 的字段校验 + `preview.mjs` 的界面场景（人工看）。
5. **导入第二遍解析**：`ProxyJump` 别名解析 + 解析不出时的点名（沿用短期的结构）。
   **门槛**：`ssh-config.test.ts` 加「别名解析 / 通配别名 / 跨文件别名 / 引用不存在的别名」。

## 8. 验收门槛（全绿才叫做完）

```sh
pnpm -r typecheck && pnpm -r build && pnpm test      # 全仓，防跨包回归
node scripts/check-i18n.mjs                          # 若新增界面文案（见 docs/i18n.md）
git diff --exit-code -- 'packages/*/client.js' ':(glob)packages/*/lib/**'   # 产物=源码
```

**真机（不可省）**：本仓的取向是「真机脚本的正确性只能靠跑一遍」，而这一项**没有任何单测
能替代**下面三条：

1. **跳板机可用**：本机 docker 起一台 sshd（或本机 sshd 起第二个实例）当 bastion，
   tty 终端标签 / SFTP / 隧道各连一次；
2. **跳板机不可达 / 认证失败**：文案必须点名**跳板机**（而不是目标），且不留下脱管连接
   （`ps` 里不应多出残留的 ssh 进程、宿主退出后连接全部消失）；
3. **docker 目标经跳板机**：`docker_ps` 跑一次；再配两个不同 bastion 指向同一目标，
   确认没有共用连接（池键那条）。

**刻意不做**：不做「只让一个包能过 bastion」；不在跳板机那一轮带 `ProxyCommand`；
不改 `~/.ssh/config` 的 `Include` 展开语义（跨文件别名如实说不支持）。
