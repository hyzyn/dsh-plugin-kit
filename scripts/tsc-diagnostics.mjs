/**
 * `client-lint` 的「名字解析」那一半：挑一个**能被 node 直接执行**的 tsc 入口，并把
 * `tsc --checkJs` 的输出解析成结构化诊断（纯逻辑，供 `scripts/client-lint.mjs` 调用；
 * 用例见 `scripts/test/tsc-diagnostics.test.ts`）。
 *
 * ## 为什么不用 `node_modules/.bin/tsc`（2026-10-18 的 Windows 红）
 *
 * `.bin/tsc` 在 POSIX 上是 pnpm 生成的 **sh 包装脚本**（无扩展名）。Windows 上 `spawnSync`
 * 起它直接 `ENOENT`：CreateProcess 只认 PE 映像（`.exe` / `.com`），而批处理（`.cmd` / `.bat`）
 * 又**只能经 shell 启动**（Node 不带 `shell: true` 时拒跑），无扩展名的 shim 两者都不是。
 * 本仓已经踩过同形的坑并写在 `scripts/dsh-exec.mjs` 文件头：npm 全局 shim 里的无扩展名 POSIX
 * 脚本在 Windows 上 `spawn` 直接 `ENOENT`，`live-host-smoke` 第一次在 Windows 上跑就死在那一步；
 * 那个模块的解法与这里相同——**解析出真正的 JS 入口，用当前这个 node 跑它**。
 *
 * 后果不是「少跑一道检查」，而是**闸门静默恒绿**：`spawnSync` 把失败放进 `result.error`、
 * `stdout` 留空，而调用方当时只看 stdout——于是「检查器根本没跑起来」被读成「这个文件
 * 一处诊断都没有」。2026-10-18 `main` 的 CI 就是这个形状：Windows 腿唯一一条红是
 * `scripts/test/client-lint-fatal.test.ts`（loglens 那一轮补的 TS2451 反例），它喂了一份
 * **必然报 TS2451** 的 client-src，lint 却打印「通过……无诊断」并以 0 退出，
 * 而 macOS / ubuntu 两条腿全绿——**闸门只在它唯一需要起作用的那条腿上失效**。
 *
 * 所以这里两件事一起做：
 *
 *   1. 入口换成 typescript 自己的 **JS 入口**（`lib/tsc.js`），用 `process.execPath` 跑——
 *      三平台走同一条路径，不再依赖平台的包装脚本形态；
 *   2. **只要 tsc 没能正常跑完就返回失败**（`ok: false`），由调用方非零退出。
 *      四种形态都算「没跑成」，见 `runTscCheck`：缺 typescript / 起不来 / 被信号终止 /
 *      **非零退出却一条诊断都没解析出来**（`output` 分支——半装的 typescript 报
 *      `error TS2318: Cannot find global type 'Array'.`、目标不存在报 `TS6053`、以及
 *      `--pretty` 那种 `file:line:col - error TS…` 排版，都落进这一档）。
 *      「0 命中」与「没跑」从此不共用一个出口。
 *
 * ## 诊断锚点
 *
 * 只收锚点匹配的诊断。源码模式（`client-src/`）放宽到 program 内的全部 `client-src/**`
 * ——tsc 会经 import 把兄弟模块拉进同一个 program（docker D74），只认入口文件会把它们的
 * 诊断静默丢掉；裸 `client.js` 的包没有兄弟源码，维持原锚点。
 *
 * 路径分隔符两种都收：tsc 内部把 `\` 归一成正斜杠，但那是它的实现细节、不是本仓的契约
 * （归一化后回写为 `/`，报出来的路径与平台无关）。
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

/**
 * 传给 tsc 的固定参数（除 `--pretty false` 外与改造前逐字一致，入口换成了 JS 形态）。
 *
 * `--pretty false` 是 2026-10-18 补的：tsc 的 `defaultIsPretty` 是「stdout 是 TTY 且没设
 * NO_COLOR」，而 `spawnSync` 走管道、子进程 `isTTY` 为 undefined ⇒ 默认本来就关着。
 * **但那是它的实现细节，不是我们的契约**：排版一换（`file:line:col - error TS…`）锚点就全灭，
 * 而且**剥掉颜色也救不回来**——显式关掉才是把「解析安全」建在参数上，而不是建在别人的默认值上。
 */
const TSC_ARGS = [
  '--noEmit',
  '--allowJs',
  '--checkJs',
  '--target', 'esnext',
  '--module', 'esnext',
  '--moduleResolution', 'bundler',
  '--lib', 'esnext,dom,dom.iterable',
  '--skipLibCheck',
  '--pretty', 'false',
]

/**
 * tsc 的 JS 入口路径（**纯路径拼接，不碰磁盘**，所以可以被用例喂假 repoRoot）。
 *
 * 用 `typescript/lib/tsc.js` 而不是 `typescript/bin/tsc`：后者是带 shebang 的 shim，
 * 虽然也能被 node 执行，但多一层 `require` 间接；`lib/tsc.js` 是同一份实现的直接入口。
 */
export function tscEntryPath(repoRoot) {
  return join(repoRoot, 'node_modules', 'typescript', 'lib', 'tsc.js')
}

function escapeRegExp(literal) {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 把 tsc 的输出解析成诊断数组。
 *
 * 只认 `file(line,col): error TSxxxx: text` 这一种形态——`--pretty false` 就是这一种
 * （参数里显式关掉了 pretty，见 `TSC_ARGS`；**不依赖**「管道 ⇒ tsc 自动关色」那个默认值）。
 * 解析不出来的输出不再等于「干净」：`runTscCheck` 会在非零退出且 0 解析时判失败。
 */
export function parseTscDiagnostics(output, target) {
  // 源码模式下 tsc 的 program 会通过 import 拉进兄弟模块，锚点必须放宽到全部 client-src/**
  // （docker D74：只认入口时合成诊断实测只命中 1/3）。两种分隔符都收，理由见文件头。
  const anchor = target.startsWith('client-src/')
    ? String.raw`client-src[\\/][^\s()]+\.js`
    : escapeRegExp(target)
  const pattern = new RegExp('(' + anchor + ')\\((\\d+),(\\d+)\\): error (TS\\d+): (.*)', 'g')
  return [...output.matchAll(pattern)].map((match) => ({
    file: match[1].replaceAll('\\', '/'),
    line: Number(match[2]),
    col: Number(match[3]),
    code: match[4],
    text: match[5].trim(),
  }))
}

/**
 * 跑一次 `tsc --checkJs`。
 *
 * @returns `{ ok: true, entry, output, diagnostics }`
 *        | `{ ok: false, reason: 'missing' | 'spawn' | 'status' | 'output', path, entry?, error? }`
 *
 * 四个 `reason` 就是「检查器没能跑成」的全部形态——调用方**必须**据此非零退出，
 * 不许把 `diagnostics: []` 当成「干净」。`spawn` 参数只为用例注入而存在（默认真 `spawnSync`）。
 */
export function runTscCheck({ repoRoot, cwd, target, spawn = spawnSync }) {
  const path = tscEntryPath(repoRoot)
  if (!existsSync(path)) return { ok: false, reason: 'missing', path }

  const result = spawn(process.execPath, [path, ...TSC_ARGS, target], { cwd, encoding: 'utf8' })
  // 起不来（ENOENT / EINVAL…）：Windows 上拿 `.bin/tsc` 当入口就是这个分支，2026-10-18 的现场。
  if (result.error !== undefined && result.error !== null) {
    return { ok: false, reason: 'spawn', path, entry: path, error: result.error }
  }
  // 没有退出码 = 被信号终止（`status` 为 null）。同样不能读成「没有诊断」。
  if (typeof result.status !== 'number') return { ok: false, reason: 'status', path, entry: path }

  const output = (result.stdout ?? '') + (result.stderr ?? '')
  const diagnostics = parseTscDiagnostics(output, target)
  /*
   * 非零退出却**一条都解析不出来** ⇒ 这轮输出不是我们认识的那个形状（整程序性错误
   * `error TS2318` / `TS6053` 没有 `file(line,col)` 前缀；半装的 typescript 会刷一屏；
   * `--pretty` 若被打开则是另一种排版）。tsc 有错误时本来就非零退出，所以这一档
   * 挡的不是「有错」而是「我们没读懂」——照样按失败处理，不许退化成「0 处诊断」。
   * 见 `scripts/test/tsc-diagnostics.test.ts` 的注入用例（2026-10-18 独立复核发现的通道）。
   */
  if (result.status !== 0 && diagnostics.length === 0) {
    return { ok: false, reason: 'output', path, entry: path, output, status: result.status }
  }
  return { ok: true, entry: path, output, diagnostics }
}

/** 把失败结果翻成一句人话（措辞在这里、不在调用处，用例才好钉住它）。 */
export function describeTscFailure(failure) {
  if (failure.reason === 'missing') {
    return '找不到 tsc（' + failure.path + '）——先在仓库根 pnpm install'
  }
  if (failure.reason === 'spawn') {
    return 'tsc 起不来（' + failure.entry + '）：' + String(failure.error?.message ?? failure.error)
  }
  if (failure.reason === 'output') {
    return 'tsc 退出码 ' + String(failure.status) + ' 却一条诊断都没解析出来（输出形态不认识，见 scripts/tsc-diagnostics.mjs）：'
      + failure.output.trim().split('\n').slice(0, 3).join(' / ')
  }
  return 'tsc 没有正常退出（' + failure.entry + '）——被信号终止'
}
