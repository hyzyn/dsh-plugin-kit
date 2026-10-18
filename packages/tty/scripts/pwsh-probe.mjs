#!/usr/bin/env node
/**
 * @hyzyn/dsh-tty — PowerShell 家族真机对照探针（Windows PowerShell 5.1 ↔ PowerShell 7）。
 *
 * 为什么单独一个探针：`windows-smoke.mjs` 的 W8 只钉两条断言（桩生效 = 收到首个 A；
 * 一条命令发全 B/D 且真的执行了），而且它在有 pwsh 的机器上**只跑 pwsh**。也就是说
 * 「5.1 与 7 行为差异」这一整类事实在真机上从来没有被对照过。本探针把支持面在两个
 * shell 上跑**同一套**用例并排输出：桩生效 / cwd 跟随（含含空格的路径）/ running 三态 /
 * 退出码（命令级与会话级）/ `tty_expect` 早停与**回显剔除** / `capture{last}` 的输出窗口 /
 * 命令型会话（`tty_run`）/ `&&` 的语法差异。
 *
 * 判据分两档：
 *   - PASS / FAIL：该行为**应当**如此，不对就是缺陷（退出码非 0）；
 *   - INFO：测量值与原始证据——给「要不要修、怎么修」提供数字。INFO 不影响退出码。
 *
 * 两条刻意的设计（否则会自欺）：
 *   1. **pattern 不能字面出现在命令行里**的用例，用 `('A'+'_B')` 拼出来 —— 否则命中的
 *      可能只是命令回显（这正是 D75 要防的假绿）；
 *   2. `tty_expect` 的耗时**有下界**：命令里带 `Start-Sleep -Seconds 2`，命中早于 1.5s
 *      就说明命中的是回显、不是输出。
 *
 * 用法（Windows）：
 *   node packages/tty/scripts/pwsh-probe.mjs                    # 自动找 5.1 与 7，两个都跑
 *   node packages/tty/scripts/pwsh-probe.mjs --shell <path> --label <名字>
 *   node packages/tty/scripts/pwsh-probe.mjs --n 20             # P6 的采样次数（默认 20）
 *
 * 非 Windows 平台优雅退出（退出码 0）：本探针的全部价值都在真实 ConPTY 上。
 */
import { existsSync } from 'node:fs'
import { Context } from '@deepseek-ai/cordis'
import WebServerRuntime from '@deepseek-ai/dsh-host-webserver'
import { LocalSubprocessRuntime } from '@deepseek-ai/dsh-subprocess-local'
import { name, inject, apply } from '../lib/index.js'

if (process.platform !== 'win32') {
  console.log(`[pwsh-probe] 跳过：当前平台 ${process.platform}——本探针只在 Windows 上跑（真实 ConPTY + 真实 PowerShell）`)
  process.exit(0)
}

const argv = process.argv.slice(2)
function argOf(flag) {
  const i = argv.indexOf(flag)
  return i === -1 ? undefined : argv[i + 1]
}
const N = Math.max(1, Number(argOf('--n') ?? 20))
const ONLY_SHELL = argOf('--shell')
const ONLY_LABEL = argOf('--label')

const CANDIDATES = [
  { label: 'PowerShell 7 (pwsh)', shell: 'C:/Program Files/PowerShell/7/pwsh.exe' },
  { label: 'Windows PowerShell 5.1', shell: 'C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe' },
]

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const ROWS = []
function row(shell, item, status, detail) {
  ROWS.push({ shell, item, status, detail })
  const mark = status === 'PASS' ? '  ✔ PASS  ' : status === 'FAIL' ? '  ✘ FAIL  ' : '  ℹ  INFO  '
  const line = mark + '[' + shell + '] ' + item + (detail === undefined ? '' : ' — ' + detail)
  if (status === 'FAIL') console.error(line)
  else console.log(line)
}
function pass(shell, item, detail) { row(shell, item, 'PASS', detail) }
function fail(shell, item, detail) { row(shell, item, 'FAIL', detail) }
function info(shell, item, detail) { row(shell, item, 'INFO', detail) }

/** 注册进来的 agent 工具（与 windows-smoke.mjs 同形：直接走 `execute`，即 agent 的真实路径）。 */
const TOOLS = new Map()
function tool(name) {
  const t = TOOLS.get(name)
  if (t === undefined) throw new Error(`agent 工具没注册：${name}（注册到的：${[...TOOLS.keys()].join(', ')}）`)
  return t
}

async function mount(shell) {
  TOOLS.clear()
  const app = new Context()
  const wsFiber = app.plugin(WebServerRuntime, { host: '127.0.0.1', port: 0 })
  const subFiber = app.plugin(LocalSubprocessRuntime)
  const stubFiber = app.plugin({
    name: 'pwsh-probe-stub',
    apply: (ctx) => {
      ctx.provide('settings', { describe: () => [], update: async () => {}, configure: () => () => {} })
      ctx.provide('tools', { register: (definition) => { TOOLS.set(definition.name, definition); return () => {} } })
    },
  })
  await stubFiber.await()
  const pluginFiber = app.plugin({ name, inject, apply }, { shell, term: 'xterm-256color', colorTerm: 'truecolor', maxSessions: 4 })
  await wsFiber.await()
  await subFiber.await()
  await pluginFiber.await()
  await sleep(400) // 等 ctx.inject(['webServer']) 回调注册路由
  return app
}

async function entryOf(sid) {
  const listed = await tool('tty_list').execute({})
  return listed.sessions.find((s) => s.sid === sid) ?? null
}

/** 等 tty_list 上某个字段满足条件；超时抛错（带上最后一次快照）。 */
async function waitEntry(sid, pred, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs
  let last = null
  for (;;) {
    last = await entryOf(sid)
    if (last !== null && pred(last)) return last
    if (Date.now() > deadline) throw new Error(`等不到「${label}」（${timeoutMs}ms）；最后一次快照：${JSON.stringify(last)}`)
    await sleep(100)
  }
}

/**
 * 发一条命令并等它结束（判据用 `lastExitAt` 前进，不依赖具体输出）。
 *
 * **只用 tty_list 轮询**——`tty_capture` 会推进已读水位线，而下面有几条用例正是要
 * 「命令结束之后、还没读过任何输出」这一刻的现场（D72/D75 的闸门都看这个水位线）。
 */
async function runCommand(sid, command, timeoutMs = 20000) {
  const before = (await entryOf(sid))?.lastExitAt ?? 0
  await tool('tty_send').execute({ sid, data: command + '\n' })
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const snap = await entryOf(sid)
    if (snap !== null && snap.running === false && (snap.lastExitAt ?? 0) > before) return snap
    if (Date.now() > deadline) throw new Error(`命令「${command}」在 ${timeoutMs}ms 内没结束；快照：${JSON.stringify(snap)}`)
    await sleep(80)
  }
}

/** 读「上一条已完成命令」（命令在途时等它落地）。 */
async function lastCommand(sid, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    try {
      const read = await tool('tty_capture').execute({ sid, last: true })
      if (read.inProgress !== true) return read
    } catch (error) {
      // 「暂无上一条命令」在命令刚发出去时是正常的（B 标记还没到），继续等
      if (!/暂无|没有「上一条命令」/.test(String(error?.message ?? ''))) throw error
    }
    if (Date.now() > deadline) return { sid, tail: '', source: 'last', inProgress: true }
    await sleep(80)
  }
}

/** 人读起来短一点的原始尾部。 */
function short(text, n = 200) {
  return JSON.stringify(String(text ?? '').replace(/\s+/g, ' ').slice(-n))
}

async function probeShell({ label, shell }) {
  console.log(`\n===== ${label} — ${shell} =====`)
  await mount(shell)

  // ---------- P0 版本（证明探针真的跑在这个 shell 上）----------
  try {
    const run = await tool('tty_run').execute({ command: '$PSVersionTable.PSVersion.ToString() + " / " + $PSVersionTable.PSEdition' })
    const text = String(run.tail ?? '').split('\n').map((x) => x.trim()).filter((x) => /^\d+\.\d+/.test(x)).pop() ?? ''
    pass(label, 'P0 版本自述', `${text}（exitCode=${String(run.exitCode ?? '?')}）`)
  } catch (error) {
    fail(label, 'P0 版本自述', error.message)
  }

  // ---------- P1 shell 集成生效（sawMark 可信 → running 是三态里的布尔）----------
  const opened = await tool('tty_open').execute({ cwd: process.cwd(), cols: 100, rows: 30 })
  const sid = opened.sid
  try {
    const snap = await waitEntry(sid, (e) => e.running === false, 25000, 'shell 集成标记（running 变布尔）')
    pass(label, 'P1 桩载入 + shell 集成生效', `running=${String(snap.running)}（省略 = 没见过 OSC 133 标记）`)
  } catch (error) {
    fail(label, 'P1 桩载入 + shell 集成生效', error.message)
  }

  // ---------- P2 cwd 跟随（OSC 7 上报；上报的是 URI 形态，分隔符是正斜杠）----------
  try {
    await runCommand(sid, 'Set-Location C:\\Windows')
    const snap = await entryOf(sid)
    // OSC 7 是 file:///C:/Windows 这种 URI 形态 → 解出来是 `C:/Windows`（正斜杠）。
    // 两种分隔符都接受：这里判的是「cwd 有没有跟着走」，不是分隔符风格。
    if (snap !== null && /^[A-Za-z]:[\\/]Windows$/.test(String(snap.cwd))) pass(label, 'P2a cwd 跟随 Set-Location', String(snap.cwd))
    else fail(label, 'P2a cwd 跟随 Set-Location', `cwd=${JSON.stringify(snap?.cwd)}`)
  } catch (error) {
    fail(label, 'P2a cwd 跟随 Set-Location', error.message)
  }
  try {
    await runCommand(sid, "Set-Location 'C:\\Program Files'")
    const snap = await entryOf(sid)
    if (snap !== null && /Program Files$/i.test(String(snap.cwd))) pass(label, 'P2b cwd 跟随（路径含空格，验 OSC 7 的 %20 解码）', String(snap.cwd))
    else fail(label, 'P2b cwd 跟随（路径含空格）', `cwd=${JSON.stringify(snap?.cwd)}`)
  } catch (error) {
    fail(label, 'P2b cwd 跟随（路径含空格）', error.message)
  }

  // ---------- P3 running 三态 ----------
  try {
    await tool('tty_send').execute({ sid, data: 'Start-Sleep -Seconds 3\n' })
    let sawTrue = false
    const deadline = Date.now() + 2500
    while (Date.now() < deadline) {
      const snap = await entryOf(sid)
      if (snap?.running === true) { sawTrue = true; break }
      await sleep(100)
    }
    if (!sawTrue) fail(label, 'P3a 命令在跑时 running=true', '2.5s 内没看到 running:true')
    else pass(label, 'P3a 命令在跑时 running=true')
    await waitEntry(sid, (e) => e.running === false, 15000, '命令结束后 running=false')
    pass(label, 'P3b 命令结束后 running=false')
  } catch (error) {
    fail(label, 'P3 running 三态', error.message)
  }

  // ---------- P4 退出码 ----------
  try {
    await runCommand(sid, 'cmd /c exit 7')
    const read = await lastCommand(sid)
    if (read.exitCode === 7) pass(label, 'P4a 命令级退出码（原生命令 $LASTEXITCODE=7）', 'capture{last}.exitCode=7')
    else fail(label, 'P4a 命令级退出码', `capture{last}.exitCode=${JSON.stringify(read.exitCode)} tail=${short(read.tail, 120)}`)
  } catch (error) {
    fail(label, 'P4a 命令级退出码', error.message)
  }
  try {
    const opened2 = await tool('tty_open').execute({ cwd: process.cwd(), cols: 80, rows: 24 })
    await tool('tty_send').execute({ sid: opened2.sid, data: 'exit 3\n' })
    const snap = await waitEntry(opened2.sid, (e) => e.exited === true, 15000, '会话退出')
    if (snap.exitCode === 3) pass(label, 'P4b 会话级退出码（exit 3 → exited + exitCode）', `exitCode=${String(snap.exitCode)}`)
    else fail(label, 'P4b 会话级退出码', `exited=${String(snap.exited)} exitCode=${JSON.stringify(snap.exitCode)}`)
    await tool('tty_close').execute({ sid: opened2.sid }).catch(() => {})
  } catch (error) {
    fail(label, 'P4b 会话级退出码', error.message)
  }

  // ---------- P5 tty_expect：早停、回显剔除、以及回显到底落在哪一段边界里 ----------
  // P5a：pattern **不字面出现**在命令行里（用拼接造出来）→ 只能命中真实输出。
  try {
    const opened3 = await tool('tty_open').execute({ cwd: process.cwd(), cols: 100, rows: 30 })
    await tool('tty_send').execute({ sid: opened3.sid, data: "Start-Sleep -Seconds 2; echo ('PROBE'+'_READY_OK')\n" })
    const started = Date.now()
    const matched = await tool('tty_expect').execute({ sid: opened3.sid, pattern: 'PROBE_READY_OK', timeoutSec: 20 })
    const elapsed = Date.now() - started
    if (matched.matched === true && elapsed >= 1500 && elapsed < 12000) pass(label, 'P5a tty_expect 命中真实输出即返回', `${elapsed}ms，matchedFrom=${String(matched.matchedFrom ?? '?')}`)
    else fail(label, 'P5a tty_expect 命中真实输出即返回', `matched=${String(matched.matched)} elapsed=${elapsed}ms matchedFrom=${String(matched.matchedFrom ?? '?')} text=${short(matched.text, 160)}`)
    await tool('tty_close').execute({ sid: opened3.sid }).catch(() => {})
  } catch (error) {
    fail(label, 'P5a tty_expect 命中真实输出即返回', error.message)
  }

  // P5b：pattern **字面出现**在命令行里，而命令前面有 2s 的睡眠。
  //   命中早于 1.5s = 命中的是回显（命令还没跑完）→ D75 要防的假绿。
  try {
    const opened4 = await tool('tty_open').execute({ cwd: process.cwd(), cols: 100, rows: 30 })
    await tool('tty_send').execute({ sid: opened4.sid, data: 'Start-Sleep -Seconds 2; echo PROBE_ECHO_QQQ\n' })
    const started = Date.now()
    const matched = await tool('tty_expect').execute({ sid: opened4.sid, pattern: 'PROBE_ECHO_QQQ', timeoutSec: 20 })
    const elapsed = Date.now() - started
    if (matched.matched === true && elapsed >= 1500) pass(label, 'P5b 回显不算命中（命令在跑时）', `${elapsed}ms 命中真实输出，matchedFrom=${String(matched.matchedFrom ?? '?')}`)
    else if (matched.matched === true) fail(label, 'P5b 回显不算命中（命令在跑时）', `${elapsed}ms 就命中了——命令还在 Start-Sleep，命中的只能是回显（D75 的剔除在 inCommand 时不启用）`)
    else fail(label, 'P5b 回显不算命中（命令在跑时）', `matched=${String(matched.matched)} elapsed=${elapsed}ms text=${short(matched.text, 160)}`)
    await sleep(1200) // 让这条命令真的跑完，别把它的 D 标记留给下一条用例
    await tool('tty_close').execute({ sid: opened4.sid }).catch(() => {})
  } catch (error) {
    fail(label, 'P5b 回显不算命中（命令在跑时）', error.message)
  }

  // P5c：命令**只有回显、没有任何 stdout**（`| Out-Null`），pattern 只出现在命令行里。
  //   命令结束后立刻注册 expect（中间不读任何输出，水位线不许推进）：
  //     - 命中 → 命中的只能是回显（这是判据的核心：那里根本没有输出）；
  //     - matchedFrom 顺带说明回显落在哪条路径上（last = B..D 窗口被回显污染）。
  try {
    const opened5 = await tool('tty_open').execute({ cwd: process.cwd(), cols: 100, rows: 30 })
    await waitEntry(opened5.sid, (e) => e.running === false, 25000, 'P5c 会话就绪')
    await runCommand(opened5.sid, 'echo PROBE_ECHO_ONLY_ZZZ | Out-Null')
    const started = Date.now()
    const matched = await tool('tty_expect').execute({ sid: opened5.sid, pattern: 'PROBE_ECHO_ONLY_ZZZ', timeoutSec: 2 })
    const elapsed = Date.now() - started
    const detail = `matched=${String(matched.matched)} matchedFrom=${String(matched.matchedFrom ?? '-')} ${elapsed}ms`
    if (matched.matched === true) fail(label, 'P5c 只有回显、没有输出时不该命中', `${detail}（那条命令用 Out-Null 吞了输出，pattern 只存在于命令行里）`)
    else info(label, 'P5c 只有回显、没有输出时不命中（D75 的 A..B 边界前提成立）', detail)
    await tool('tty_close').execute({ sid: opened5.sid }).catch(() => {})
  } catch (error) {
    fail(label, 'P5c 只有回显、没有输出时不该命中', error.message)
  }

  // ---------- P6 capture{last} 的输出窗口（pattern 用拼接造，确保命中一定来自 stdout）----------
  let immediateMiss = 0
  let delayedMiss = 0
  let bufferMiss = 0
  let inProgress = 0
  let echoInWindow = 0
  for (let i = 0; i < N; i += 1) {
    const mark = `PROBE_LAST_${String(i)}_END`
    // 命令行本身：注意它**不含** mark（拼接形态），所以窗口里出现它 = 回显混进了 B..D 窗口
    const commandText = `echo ('PROBE_LAST_${String(i)}' + '_END')`
    try {
      await runCommand(sid, commandText)
      const now = await tool('tty_capture').execute({ sid, last: true })
      if (now.inProgress === true) inProgress += 1
      if (!String(now.tail ?? '').includes(mark)) immediateMiss += 1
      if (String(now.tail ?? '').includes(`PROBE_LAST_${String(i)}'`)) echoInWindow += 1
      await sleep(700)
      const later = await tool('tty_capture').execute({ sid, last: true })
      if (!String(later.tail ?? '').includes(mark)) delayedMiss += 1
      const tail = await tool('tty_capture').execute({ sid, lines: 40 })
      if (!String(tail.tail ?? '').includes(mark)) bufferMiss += 1
    } catch (error) {
      immediateMiss += 1
      delayedMiss += 1
      bufferMiss += 1
      info(label, `P6 第 ${String(i + 1)} 轮异常`, error.message)
    }
  }
  info(label, `P6 capture{last} 空窗率（N=${String(N)}）`,
    `立即读取空 ${String(immediateMiss)}/${String(N)}；延迟 700ms 后取空 ${String(delayedMiss)}/${String(N)}；同一时刻纯尾部读（lines）取空 ${String(bufferMiss)}/${String(N)}；inProgress ${String(inProgress)}/${String(N)}；窗口里混进命令行回显 ${String(echoInWindow)}/${String(N)}`)

  // P6b/P6c：文档里那条「PowerShell 7 上 stdout 晚于 D、窗口可能为空」的限制，输出量与时序各变一档。
  try {
    await runCommand(sid, '1..2000 | ForEach-Object { "BIG_" + $_ }', 60000)
    const read = await lastCommand(sid)
    if (String(read.tail ?? '').includes('BIG_2000')) pass(label, 'P6b 大输出（2000 行）的窗口不空且保尾', `exitCode=${JSON.stringify(read.exitCode)} 末行在窗口里`)
    else fail(label, 'P6b 大输出（2000 行）的窗口不空且保尾', `tail=${short(read.tail, 160)}`)
  } catch (error) {
    fail(label, 'P6b 大输出（2000 行）的窗口', error.message)
  }
  try {
    await runCommand(sid, '1..20 | ForEach-Object { "TRICKLE_" + $_; Start-Sleep -Milliseconds 100 }', 60000)
    const read = await lastCommand(sid)
    if (String(read.tail ?? '').includes('TRICKLE_20')) pass(label, 'P6c 慢输出（2s 内分 20 次）的窗口不空', `exitCode=${JSON.stringify(read.exitCode)}`)
    else fail(label, 'P6c 慢输出（2s 内分 20 次）的窗口不空', `tail=${short(read.tail, 160)}`)
  } catch (error) {
    fail(label, 'P6c 慢输出的窗口', error.message)
  }

  // ---------- P7 命令型会话（tty_run，走 -Command）----------
  try {
    const run = await tool('tty_run').execute({ command: 'echo RUN_$env:OS' })
    if (run.exitCode === 0 && /RUN_Windows_NT/.test(String(run.tail ?? ''))) pass(label, 'P7a tty_run 成功路径（-Command，$env:OS 展开）', `exitCode=0，closed=${String(run.closed)}`)
    else fail(label, 'P7a tty_run 成功路径', `exitCode=${JSON.stringify(run.exitCode)} tail=${short(run.tail, 160)}`)
  } catch (error) {
    fail(label, 'P7a tty_run 成功路径', error.message)
  }
  try {
    const run = await tool('tty_run').execute({ command: 'exit 5' })
    if (run.exitCode === 5) pass(label, 'P7b tty_run 退出码透传（exit 5）', 'exitCode=5')
    else fail(label, 'P7b tty_run 退出码透传（exit 5）', `exitCode=${JSON.stringify(run.exitCode)} tail=${short(run.tail, 160)}`)
  } catch (error) {
    fail(label, 'P7b tty_run 退出码透传（exit 5）', error.message)
  }
  try {
    // PowerShell 的 `-Command` 语义：末条命令非零时进程退出码塌成 1（不是那条命令的码）。
    // 这不是插件的缺陷，但用户在 `tty_run` 里等到的就是它 —— 如实量一份。
    const run = await tool('tty_run').execute({ command: 'cmd /c exit 5' })
    info(label, 'P7c PowerShell -Command 的退出码塌陷（原生命令非零 → 1；要具体码值就让命令自己 exit）', `cmd /c exit 5 → exitCode=${JSON.stringify(run.exitCode)}`)
  } catch (error) {
    info(label, 'P7c PowerShell -Command 的退出码塌陷', error.message)
  }

  // ---------- P8 `&&`：PS 5.1 不认、PS 7 认（`commandShellHint` 的文案指着这条差异）----------
  try {
    await runCommand(sid, 'echo A && echo B')
    const read = await lastCommand(sid)
    const tail = short(read.tail, 200)
    const hasB = /(^|\n)\s*B\s*(\n|$)/.test(String(read.tail ?? ''))
    if (label.includes('5.1')) {
      // 5.1 是解析错误：命令一条都没跑（输出里只有错误文本，没有 A / B）
      info(label, 'P8 `&&` 在 5.1 上是解析错误（命令没执行）', `exitCode=${JSON.stringify(read.exitCode)} hasB=${String(hasB)} tail=${tail}`)
      if (read.exitCode === 0) info(label, 'P8 附注：5.1 把解析错误报成 exitCode=0（成功）', 'agent 只看退出码会误判成功——输出文本里才是真相')
    } else if (read.exitCode === 0 && hasB) {
      pass(label, 'P8 `&&` 可用（PS 7 支持 &&）', `exitCode=0 tail=${tail}`)
    } else {
      fail(label, 'P8 `&&` 可用（PS 7）', `exitCode=${JSON.stringify(read.exitCode)} hasB=${String(hasB)} tail=${tail}`)
    }
  } catch (error) {
    fail(label, 'P8 `&&` 语法差异', error.message)
  }

  // ---------- P8b 两版都不合法的一行（解析错误）该报什么退出码 ----------
  try {
    await runCommand(sid, 'echo (1')
    const read = await lastCommand(sid)
    info(label, 'P8b 解析错误的退出码（两版都不合法的 `echo (1`）', `exitCode=${JSON.stringify(read.exitCode)} tail=${short(read.tail, 160)}`)
  } catch (error) {
    info(label, 'P8b 解析错误的退出码', error.message)
  }

  // ---------- 清理 ----------
  await tool('tty_close').execute({ sid }).catch(() => {})
}

const shells = ONLY_SHELL !== undefined
  ? [{ label: ONLY_LABEL ?? ONLY_SHELL, shell: ONLY_SHELL }]
  : CANDIDATES.filter((c) => { try { return existsSync(c.shell) } catch { return false } })

if (shells.length === 0) {
  console.log('[pwsh-probe] 本机既没有 PowerShell 7 也没有 Windows PowerShell 5.1，无可测对象')
  process.exit(0)
}

for (const s of shells) {
  try {
    await probeShell(s)
  } catch (error) {
    fail(s.label, '探针整体异常', error?.stack ?? String(error))
  }
}

const failed = ROWS.filter((r) => r.status === 'FAIL')
const passed = ROWS.filter((r) => r.status === 'PASS')
console.log(`\n==== pwsh-probe：${String(passed.length)} PASS / ${String(failed.length)} FAIL / ${String(ROWS.length - passed.length - failed.length)} INFO（shell：${shells.map((s) => s.label).join(' + ')}）====`)
for (const r of failed) console.error(`  ✘ [${r.shell}] ${r.item} — ${String(r.detail ?? '')}`)
process.exit(failed.length === 0 ? 0 : 1)
