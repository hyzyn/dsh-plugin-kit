/**
 * 「link 到本仓」的 profile：**现场造一个**，给干净机器（CI 腿 / VM / 新克隆）上的真宿主验收用。
 *
 * ## 为什么要有它
 *
 * [live-host-smoke.mjs](./live-host-smoke.mjs) 的前提是「机器上已经有一个 link 到本仓的
 * profile」——本机开发时它天然存在（`test` / `web` 是手工建的），可**任何干净环境都没有**：
 * CI 容器、Parallels 里的 Windows / Ubuntu 腿、别人的新克隆。没有它，那条真宿主验收就只能
 * 打印 SKIP——而 SKIP 在「我跑过了」这句话里是最容易被当成 PASS 的东西。这个模块把那一步
 * 自动化掉：从 dsh **自带的** `web` 模板初始化一个新 profile、link 本仓的两个插件、写一层
 * 让「配置里写着 true」成立的 patch，然后**自证**插件真的进了阵容。
 *
 * ## 三条硬性质
 *
 * - **只造自己的**：名字固定 `live-smoke-src-<pid>`，目录已存在就抛错（绝不覆盖），删除由
 *   调用方按**记录下来的路径**做——不按前缀扫目录（那会连别人的一起删）。
 * - **不写用户的配置**：新建的 profile 目录整个属于本次运行；patch 层是脚本生成的，不改
 *   任何既有 profile 的 `cordis.patch.yml`。
 * - **自证，不假定**：如果本仓插件的 peer 范围与这台机器的 dsh cohort 不匹配，DSH 会在**启动前**
 *   把它们整批 `disabled`（只剩 base + web-app）——那时验收会跑出一堆莫名其妙的 FAIL，
 *   看起来像代码坏了。所以这里最后用 `dsh --dump-config` 读一遍**组合结果**：本仓的插件行
 *   必须真的在里面，否则直接抛错并说明是 cohort 不匹配。
 *
 * boot-free：初始化走 `--dump-config`（它只 `prepareProfile` 再打印组合，不启动宿主、不挂插件）。
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

/** 初始化用的自带模板名（对应 dsh 的 `PROFILE_TEMPLATES` 里的 `web`）。 */
export const BOOTSTRAP_TEMPLATE = 'web'
/**
 * bootstrap 时挂进模板 profile 的本仓包（目录名）。
 *
 * 只挂**验收真正要用的两个**：挂全仓会把「某个不相干的包在干净机器上装不起来」变成这条
 * 验收的失败原因，而它要验的是能力开关的授权阶梯，不是全部插件的可安装性。
 */
export const BOOTSTRAP_PACKAGES = ['docker', 'tty']
/** 一次性模板 profile 的名字前缀（后面接 pid）。 */
export const BOOTSTRAP_PREFIX = 'live-smoke-src'

/** 一次性模板 profile 的名字：带 pid，撞不上用户手建的 profile。 */
export function bootstrapProfileName(pid = process.pid) {
  return `${BOOTSTRAP_PREFIX}-${String(pid)}`
}

/**
 * 生成模板 profile 的 patch 层。
 *
 * docker 的两个开关**故意写成 `true`**：验收的 A 段要证的正是「配置里写着 true、宿主没授权时
 * 有效值仍是 false」——patch 里不写 true，那条断言就是个空断言（真机跑过：没有这一层时
 * `allowMutations` 直接是默认 false，「配置里的 true 不算授权」根本没被验到）。
 *
 * @param options.target - 播种进去的**本机** docker 目标名（验收只碰本机）。
 * @returns 写进 profile `cordis.patch.yml` 的 YAML 文本。
 */
export function bootstrapPatchYaml({ target }) {
  return [
    '# live-host-smoke 的一次性模板 profile：本文件由脚本生成，profile 跑完即删。',
    '# docker 的两个开关故意写 true —— 验收要证的是「配置里写着 true，宿主没授权时有效值仍是 false」。',
    '- id: docker',
    '  config:',
    '    enabled: true',
    '    allowMutations: true',
    '    allowExec: true',
    '    targets:',
    `      - name: ${target}`,
    '        kind: local',
    '- id: tty',
    '  config:',
    '    enabled: true',
    '    allowProxyCommand: false',
    '',
  ].join('\n')
}

/**
 * 跑一次 dsh，收 stdout/stderr（不抛错，交给调用方判 status）。
 *
 * `dsh` 是 `{ binary, argv0 }` 描述符而不是一个路径：Windows 上真正能跑的是
 * `node …/@deepseek-ai/dsh/lib/bin.js`（npm 的 dsh shim 是无扩展名的 shell 脚本 + `.cmd`，
 * 两者直接 spawn 都有坑）——把入口解析出来是调用方 `findDsh()` 的职责。
 */
function runDsh(dsh, args, cwd) {
  const result = spawnSync(dsh.binary, [...dsh.argv0, ...args], { cwd, encoding: 'utf8', timeout: 120_000 })
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: (result.stderr ?? '') + (result.error === undefined ? '' : String(result.error)),
  }
}

/**
 * 复制一个 profile 目录树（把符号链接 / Windows junction **原样**建成链接）。
 *
 * ## 为什么不用 `fs.cpSync`（Windows 真机实测）
 *
 * pnpm 在 Windows 上把 `link:` 依赖建成 **junction**。`fs.cpSync(..., { verbatimSymlinks: true,
 * dereference: false })` 在 Windows 上**照样把 junction 展开成真目录**：实测模板 profile 里
 * `node_modules/@hyzyn/dsh-docker` 是一个 junction（`dir /AL` 显示 `<JUNCTION>`，Node 的
 * `lstat().isSymbolicLink()` 也返回 true），cpSync 之后变成 **124MB 的真副本**。
 *
 * 后果不只是慢：副本里没有它依赖的**兄弟包**（像 `@deepseek-ai/cosmokit` 这种只在宿主 store 里
 * 与 schemastery 并列存在的包），于是插件 import 直接失败——启动日志只有一句
 * `docker (@hyzyn/dsh-docker): failed to import`，路由全 404、17 条断言里 16 条红，
 * 看起来像插件代码在 Windows 上坏了。所以这里自己走一遍目录树：
 *
 * - **链接（含 junction）→ 建成链接**（Windows 上必须建成 `junction` 类型：建目录符号链接要特权，
 *   而 junction 谁都能建；junction 也只认绝对目标，正好 `readlink` 给的就是绝对路径）；
 * - 目录 → 递归；普通文件 → `copyFileSync`。
 *
 * @param from - 源目录。
 * @param to - 目标目录（调用方负责「已存在就拒绝」与跑完删除）。
 */
export function copyProfileTree(from, to) {
  const stat = fs.lstatSync(from)
  if (stat.isSymbolicLink()) {
    const target = fs.readlinkSync(from)
    fs.symlinkSync(target, to, process.platform === 'win32' ? 'junction' : undefined)
    return
  }
  if (stat.isDirectory()) {
    fs.mkdirSync(to, { recursive: true })
    for (const entry of fs.readdirSync(from)) copyProfileTree(path.join(from, entry), path.join(to, entry))
    return
  }
  fs.copyFileSync(from, to)
}

/**
 * 现场造一个「link 到本仓」的 profile 当模板。
 *
 * @param options.dsh - dsh 的启动描述符 `{ binary, argv0 }`（见 `runDsh`）。
 * @param options.profilesDir - `<DSH_HOME>/profiles`（**不设 DSH_HOME**：子进程继承当前环境，
 *   这样它与调用方看到的 profile 目录永远是同一个）。
 * @param options.repoRoot - 本仓根目录（link: 的目标）。
 * @param options.target - 播种的本地 docker 目标名。
 * @param options.packages - 要挂的本仓包目录名（默认 `BOOTSTRAP_PACKAGES`）。
 * @param options.pid - 用来组名字（测试可注入）。
 * @param options.log - 逐行日志。
 * @returns `{ name, dir, mounted }`：新 profile 的名字、**绝对路径**（调用方据此删除）、
 *   以及已进阵容的本仓包名。
 * @throws 目录已存在 / 初始化失败 / link 失败 / 自证不通过（含 cohort 不匹配的说明）。
 */
export function bootstrapLinkProfile(options) {
  const {
    dsh,
    profilesDir,
    repoRoot,
    target,
    packages = BOOTSTRAP_PACKAGES,
    pid = process.pid,
    log = () => {},
  } = options
  const name = bootstrapProfileName(pid)
  const dir = path.join(profilesDir, name)
  if (fs.existsSync(dir)) {
    throw new Error(`bootstrap 目标已存在，拒绝覆盖：${dir}（换个 PID 或先手动删掉）`)
  }

  // ① 从 dsh 自带模板初始化（--dump-config = 只准备 + 打印组合，不启动宿主）
  log(`bootstrap：dsh --profile ${name} --from-default-profile ${BOOTSTRAP_TEMPLATE} --dump-config`)
  const init = runDsh(dsh, ['--profile', name, '--from-default-profile', BOOTSTRAP_TEMPLATE, '--dump-config'], repoRoot)
  if (init.status !== 0) {
    throw new Error(`bootstrap 初始化 profile 失败（exit ${String(init.status)}）：${init.stderr.trim().slice(-500)}`)
  }

  // ② link 本仓的包（dsh plugin 会顺带把它们写进 dsh.profile.bundles）
  const links = packages.map((pkg) => `link:${path.join(repoRoot, 'packages', pkg)}`)
  log(`bootstrap：dsh plugin --profile ${name} add ${links.join(' ')}`)
  const added = runDsh(dsh, ['plugin', '--profile', name, 'add', ...links], repoRoot)
  if (added.status !== 0) {
    throw new Error(`bootstrap link 本仓包失败（exit ${String(added.status)}）：${added.stderr.trim().slice(-500)}`)
  }

  // ③ 写 patch 层（让「配置里写着 true」成立）
  fs.writeFileSync(path.join(dir, 'cordis.patch.yml'), bootstrapPatchYaml({ target }))

  // ④ 自证：组合结果里必须有本仓的插件行——没有就是被兼容性闸门整批跳过了
  const dump = runDsh(dsh, ['--profile', name, '--dump-config'], repoRoot)
  if (dump.status !== 0) {
    throw new Error(`bootstrap 自证失败：--dump-config exit ${String(dump.status)}：${dump.stderr.trim().slice(-500)}`)
  }
  const mounted = packages.filter((pkg) => dump.stdout.includes(`@hyzyn/dsh-${pkg}`))
  if (mounted.length !== packages.length) {
    const missing = packages.filter((pkg) => !mounted.includes(pkg)).join(', ')
    throw new Error(
      `bootstrap 造出来的 profile 里缺本仓插件：${missing}。`
      + '多半是 dsh 版本与本仓 cohort 不匹配（peer 范围不符时 DSH 会把插件整批 disabled，'
      + `验收会跑出一堆假 FAIL）。装与本仓 cohort 一致的 dsh 后重跑。dsh=${dsh.label ?? dsh.binary}\n`
      + `stderr: ${dump.stderr.trim().slice(-300)}`,
    )
  }
  log(`bootstrap：${name} 就绪（${mounted.join(', ')} 已进阵容）`)
  return { name, dir, mounted }
}
