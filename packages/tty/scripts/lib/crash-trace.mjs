/**
 * Windows 冒烟脚本的**崩溃诊断留痕**——`fs.writeSync` 直写 fd 1，绕开 stdout 缓冲。
 *
 * ## 为什么需要它（2026-10-04 实测）
 *
 * CI run `37170601433` 的 Windows 腿上，`windows-smoke` 以
 * **`Exit status 3221226356`（= `0xC0000374`，Windows 堆损坏）** 退出。W1–W5 五条断言
 * 全 PASS，但**日志里连 `[W6]` 那行都没有**——看起来像「跑到 W5 就没了」。
 *
 * 而 `[W6]` 是**下一行的 `console.log`**。它为什么不在日志里？Node 官方对 stdout 的
 * 同步性有明确规定：
 *
 * | 目标 | Linux / macOS | Windows |
 * |---|---|---|
 * | 文件 | 同步 | 同步 |
 * | TTY | 同步 | **异步** |
 * | **管道** | 同步 | **异步** |
 *
 * CI 上 stdout 正是**管道**，而 Windows 上它是**异步**的。所以 `console.log('[W6] …')`
 * 只是把字节交给了 libuv 的写队列，**进程在原生崩溃那一刻直接没了，队列里的字节一起没了**。
 * 结果就是：**崩溃点之前的那几行诊断信息凭空消失**，留下一个「什么都没说」的退出码。
 *
 * 这与本仓已记在案的一类问题同形——`windows-smoke` 自己文件头就记着 D62：
 * 「`process.exit()` 会丢掉管道里还没 flush 的写……CI 上 stdout 正是管道，缓冲 64 KB：
 * 实测『写 300 KB 后直接 exit』只活下来 65 536 字节」。D62 修的是**正常退出**路径
 * （末尾用空串写入做 flush 屏障）；**本条是它在原生崩溃上的另一半**——崩溃没有「末尾」，
 * 屏障来不及跑，只能靠**同步写**。
 *
 * ## 判据：只留「能定位崩溃点」的东西，不是把日志改道
 *
 * 正常路径**照旧走 `console.log`**（异步没关系，进程会正常走完 D62 的 flush 屏障）。
 * 只有**阶段边界**（每开/关一个会话、每次原生资源动作）用同步写记一行，因为那正是
 * 崩溃会落在的地方。这样：
 *
 *   - 正常时：多出几行 `[trace]` 前缀的同步行，无害；
 *   - 崩溃时：**最后一行 `[trace]` 就是崩溃点**，而且它一定在日志里。
 *
 * ## 为什么是 `writeSync(1, …)` 而不是 `fs.appendFileSync(某文件)`
 *
 * 崩溃诊断要出现在**CI 日志**里，写文件还得再 upload artifact 才看得到。
 * `writeSync(1, …)` 直写 fd 1，不经过 stream 缓冲，**同步落进管道**。
 *
 * 不写 shebang：本文件要被 `packages/tty/test/crash-trace.test.ts` import。
 */
import { writeSync } from 'node:fs'

/** 同步行前缀。用固定标记，便于在几千行 CI 日志里 grep。 */
export const TRACE_PREFIX = '[trace]'

/**
 * 同步写一行到 stdout（**不经过 stream 缓冲**）。
 *
 * 写失败**吞掉**：诊断留痕不该成为新的失败源——它是在「主流程可能已经出问题」的
 * 场景里跑的，此时 fd 1 可能已不可写（管道对端没了）。吞掉后主流程照旧。
 *
 * @param message - 要写的内容（自动补换行）
 * @param options.writeSyncImpl - 注入写函数（测试用；默认 `fs.writeSync`）
 * @returns 真的写了 → `true`；写失败 → `false`
 */
export function traceSync(message, options = {}) {
  const { writeSyncImpl = writeSync } = options
  try {
    writeSyncImpl(1, `${TRACE_PREFIX} ${String(message)}\n`)
    return true
  } catch {
    return false
  }
}

/**
 * 造一个「阶段留痕器」：`enter(label)` 记进入、`leave(label)` 记离开。
 *
 * 崩溃点 = **最后一条 `enter` 没有对应的 `leave`**。这比只记「走到哪」更强：
 * 它能区分「卡在这个阶段里」与「这个阶段跑完了、崩在下一个阶段的入口之前」——
 * 2026-10-04 那次正是后者（W5 的 `leave` 有没有打出来，直接决定崩在 W5 内部还是 W6 入口）。
 *
 * @param options.trace - 注入留痕函数（默认 `traceSync`）
 * @param options.now - 注入时钟（默认 `Date.now`；测试用）
 * @returns `{ enter, leave, snapshot }`
 */
export function createPhaseTracer(options = {}) {
  const { trace = traceSync, now = Date.now } = options
  /** 已进入未离开的阶段（栈：嵌套阶段按后进先出记）。 */
  const open = []
  const startedAt = now()

  return {
    /**
     * 记「进入某阶段」。带**自启动以来的毫秒数**——原生崩溃的时间点往往比阶段名更能
     * 说明问题（例如「每次都是启动后 3.2s 崩」会指向某个固定动作）。
     *
     * ## 为什么 `enter` 要把**整个栈**写进去（2026-10-04 实测后改的）
     *
     * 第一版只写「栈深 N」，靠 `describeCrashPoint` 在 `process.on('exit')` 里输出完整诊断。
     * 实测发现**原生崩溃时 `exit` 钩子根本不触发**：
     *
     * ```
     * $ node -e "process.on('exit', c => writeSync(1,'HOOK\n')); process.abort()"
     * （只有 abort 前的输出，HOOK 从未出现）
     * ```
     *
     * 于是「靠收尾钩子打诊断」这条路在**最需要它的场景**（段错误 / 堆损坏）里失效。
     * 改成：**每一行 `enter` 自带完整栈**——最后一行就是完整诊断，不依赖任何收尾代码。
     * 代价是行变长（阶段多时是 O(n²) 总量），但冒烟脚本只有 7 个阶段、几十行，可忽略。
     */
    enter(label) {
      open.push({ label, at: now() })
      trace(`+${String(now() - startedAt)}ms enter｜栈：${renderStack(open)}`)
    },
    /** 记「离开某阶段」。栈空时也照记（说明调用方配对错了，这本身是信息）。 */
    leave(label) {
      const index = open.map((entry) => entry.label).lastIndexOf(label)
      const entry = index === -1 ? undefined : open.splice(index, 1)[0]
      const spent = entry === undefined ? '?' : String(now() - entry.at)
      trace(`+${String(now() - startedAt)}ms leave ${label}（用了 ${spent}ms）｜栈：${renderStack(open)}`)
    },
    /** 当前还开着的阶段（崩溃后无法调用它——留给正常路径与测试用）。 */
    snapshot() {
      return open.map((entry) => entry.label)
    },
  }
}

/** 把阶段栈渲染成 `A → B`；空栈渲染成 `（空）`——空栈本身就是信息（崩在所有阶段之外）。 */
function renderStack(open) {
  return open.length === 0 ? '（空）' : open.map((entry) => entry.label).join(' → ')
}

/**
 * 把「崩溃点」渲染成人话。
 *
 * ## 它的定位（2026-10-04 实测后收窄）
 *
 * **不是**主要手段——原生崩溃时 `process.on('exit')` **不触发**（实测：`process.abort()`
 * 时钩子从未跑到），所以「靠收尾钩子打诊断」在最需要它的场景里失效。真正的保证是
 * `createPhaseTracer` 的**每行 `enter` 自带完整栈**。
 *
 * 这个函数留给**能触发的地方**：
 *   - 看门狗超时（`setTimeout` 里的 `process.exit`，钩子会跑）；
 *   - `uncaughtException` / `unhandledRejection`（JS 层异常，钩子会跑）；
 *   - 人肉排查时对着日志调用。
 *
 * @param input - `{ openPhases, exitCode }`
 * @returns 多行诊断
 */
export function describeCrashPoint({ openPhases = [], exitCode } = {}) {
  const lines = []
  lines.push('==== 崩溃点诊断 ====')
  if (openPhases.length === 0) {
    lines.push('所有阶段都已配对离开：崩溃发生在**最后一个阶段结束之后**（或首个阶段开始之前）')
  } else {
    lines.push(`未配对离开的阶段（崩溃最可能落在**最后一个**里）：${openPhases.join(' → ')}`)
  }
  if (exitCode !== undefined) {
    const hex = typeof exitCode === 'number' && exitCode >= 0 ? `0x${exitCode.toString(16).toUpperCase()}` : '?'
    lines.push(`退出码：${String(exitCode)}（${hex}）`)
    // 这两个是本仓实际遇到过的形态，写进来省得每次查
    if (exitCode === 3221226356) lines.push('  ↑ 0xC0000374 = STATUS_HEAP_CORRUPTION（Windows 堆损坏，原生层）')
    if (exitCode === 3221225477) lines.push('  ↑ 0xC0000005 = STATUS_ACCESS_VIOLATION（原生层访问越界）')
  }
  lines.push('定位方法：上面最后一条 `[trace] enter …` 就是崩溃点所在阶段；')
  lines.push('它若没有对应的 `leave`，崩溃发生在该阶段**内部**；若有，则在**下一个阶段入口之前**。')
  return lines.join('\n')
}
