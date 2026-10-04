#!/usr/bin/env node
/**
 * @hyzyn/dsh-tty — Windows 端到端冒烟（DEFECTS D45 的最后一格）。
 *
 * 为什么单独一个脚本：integration.mjs 的 103 个用例是 POSIX 形状的（TERM 注入的
 * `-c` 包装层、shell 集成 OSC 桩、tmux、`stty size` 校验），在 Windows 上一条都
 * 不适用；而 0.18.1 修的那类 bug（默认 shell 回落 /bin/zsh、POSIX 包装层让 cmd
 * 空跑一场就退出）恰好只在「真实 cmd.exe + ConPTY」上暴露。所以这里只钉最小
 * 但真实的一条链路：挂载真实插件 → ws 协议 → spawn → ready(pid) → 输入回显 →
 * kill → exit，外加「跑起来的是 %COMSPEC% 而不是 POSIX 包装层」的直接证据。
 *
 * 非 Windows 平台**优雅跳过**（退出码 0，打印原因）：本脚本是给 CI 的
 * windows-latest 用的，在 macOS/Linux 上假装跑过没有意义。
 *
 * 用法：pnpm --filter @hyzyn/dsh-tty windows-smoke
 * 退出码：0 = 全部 PASS 或跳过，1 = 任一 FAIL。
 */
import { Context } from '@deepseek-ai/cordis'
import WebServerRuntime from '@deepseek-ai/dsh-host-webserver'
import { LocalSubprocessRuntime } from '@deepseek-ai/dsh-subprocess-local'
import WebSocket from 'ws'
import { name, inject, apply } from '../lib/index.js'
import { createPhaseTracer, describeCrashPoint, traceSync } from './lib/crash-trace.mjs'

if (process.platform !== 'win32') {
  console.log(`[windows-smoke] 跳过：当前平台 ${process.platform}——本脚本只在 Windows 上跑（真实验证 cmd.exe / ConPTY 链路），CI 的 windows-latest job 会执行它`)
  process.exit(0)
}

/**
 * 阶段留痕（2026-10-04 加，起因是 CI 上那次 `0xC0000374` 原生崩溃）。
 *
 * **为什么不能用 `console.log`**：Node 官方规定 **Windows 上 stdout 到管道是异步的**
 * （Linux/macOS 同步）。CI 上 stdout 正是管道，于是 `console.log('[W6] …')` 只把字节交给
 * libuv 写队列——**进程原生崩溃那一刻队列一起没了**，日志里连 `[W6]` 都看不到，
 * 只剩一个「什么都没说」的退出码。所以这里用 `fs.writeSync` 直写 fd 1（见 crash-trace.mjs）。
 *
 * **判据是配对**：`enter` 没配对 `leave` 的阶段 = 崩溃最可能的位置；若最后一条 `enter`
 * 有对应的 `leave`，则崩溃在**下一个阶段入口之前**。2026-10-04 那次正是后者
 * （W5 的 leave 打出来了、W6 的 enter 没打出来 ⇒ 崩在 W5 结束后、W6 入口前）。
 */
const tracer = createPhaseTracer()

/* 看门狗：任何环节卡死时留痕退出（正常路径会先 process.exit）。 */
const watchdog = setTimeout(() => {
  // 卡死也是「失败」，先把诊断同步打出去（console.error 在 Windows 管道上同样会丢）
  traceSync(describeCrashPoint({ openPhases: tracer.snapshot(), exitCode: 2 }))
  console.error('[watchdog] 90s 看门狗触发：windows-smoke 卡死')
  process.exit(2)
}, 90000)
watchdog.unref()

/**
 * 原生崩溃（段错误 / 堆损坏）会**绕过**所有 JS 异常处理，`uncaughtException` 也接不到。
 * 所以真正的保证是上面那条「每阶段同步留痕」——崩溃点 = 最后一条没配对 `leave` 的 `enter`。
 *
 * 下面这几层是**尽力而为**的补充，只捕获 JS 层的漏网异常（那类崩溃此前也只剩一个退出码）。
 */
let exitingNormally = false

function reportCrash(why, detail) {
  traceSync(describeCrashPoint({ openPhases: tracer.snapshot(), exitCode: process.exitCode }))
  traceSync(`${why}${detail ? '：' + detail : ''}`)
}
process.on('uncaughtException', (error) => {
  exitingNormally = true // 自己报过了，别让 exit 钩子再报一遍
  reportCrash('uncaughtException', error?.stack ?? String(error))
  process.exit(1)
})
process.on('unhandledRejection', (reason) => {
  exitingNormally = true
  reportCrash('unhandledRejection', reason instanceof Error ? reason.stack : String(reason))
  process.exit(1)
})
process.on('exit', (code) => {
  /*
   * 只在**异常终止**时报：正常收尾（末尾那段汇总 + flush 屏障 + exit）已经把事情说清了，
   * 再打一段「崩溃点诊断」只会误导（断言失败被说成崩溃）。
   * 判据用 `exitingNormally` 而不是 code：正常的失败路径 code 也是 1。
   */
  if (exitingNormally) return
  reportCrash('进程在收尾之前退出', `code=${String(code)}`)
})

const RESULTS = []
function pass(label) { RESULTS.push(['PASS', label]); console.log('  ✔ PASS  ' + label) }
function fail(label, detail) { RESULTS.push(['FAIL', label, detail]); console.error('  ✘ FAIL  ' + label + (detail ? ' — ' + detail : '')) }
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** 简易 ws 会话客户端（与 integration.mjs 同形，只保留本脚本要用的部分）。 */
function openSession(port) {
  const client = new WebSocket(`ws://127.0.0.1:${port}/api/dsh-tty/ws`)
  client.setMaxListeners(0)
  const state = { frames: [], text: '', ready: null, exited: null, errors: [], waiters: [], closed: false }
  client.on('message', (raw) => {
    const msg = JSON.parse(raw.toString())
    state.frames.push(msg)
    if (msg.t === 'data') state.text += String(msg.d ?? '')
    if (msg.t === 'ready') state.ready = msg
    if (msg.t === 'exit') state.exited = { sid: msg.sid, code: msg.code, signal: msg.signal }
    if (msg.t === 'error') state.errors.push(String(msg.m ?? ''))
    for (const w of [...state.waiters]) w()
  })
  client.on('close', () => {
    state.closed = true
    for (const w of [...state.waiters]) w()
  })
  const waitFor = async (pred, timeoutMs = 15000, label = '条件') => {
    const start = Date.now()
    while (!pred()) {
      if (Date.now() - start > timeoutMs) {
        const details = [`已收文本: ${JSON.stringify(state.text.slice(-300))}`]
        if (state.errors.length > 0) details.push(`error 帧: ${JSON.stringify(state.errors.slice(-3))}`)
        if (state.exited !== null) details.push(`进程已退出: ${JSON.stringify(state.exited)}`)
        throw new Error(`等待${label}超时（${details.join('；')}）`)
      }
      await Promise.race([new Promise((resolve) => state.waiters.push(resolve)), sleep(200)])
    }
  }
  const open = async () => {
    const start = Date.now()
    let lastError = ''
    while (client.readyState !== WebSocket.OPEN) {
      if (Date.now() - start > 10000) throw new Error('ws 连接超时：' + (lastError || '无错误事件'))
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, 100)
        client.once('open', () => { clearTimeout(timer); resolve() })
        client.once('error', (error) => { lastError = error.message })
        client.once('close', () => { clearTimeout(timer); resolve() })
      })
    }
  }
  return { client, state, waitFor, open }
}

/** ConPTY 里按 Enter 是 \r（顺带补 \n 兼容两种翻译），cmd 才会执行。 */
const ENTER = '\r\n'

/**
 * 注册进来的 agent 工具定义（W6 要**直接调 `tty_send` 的工具路径**——D74 修的就是它）。
 * 原先 stub 的 `register` 只吞掉返回值，等于这里没有 agent 工具入口。
 */
const TOOLS = new Map()

async function run() {
  const app = new Context()
  const wsFiber = app.plugin(WebServerRuntime, { host: '127.0.0.1', port: 0 })
  const subFiber = app.plugin(LocalSubprocessRuntime)
  const stubFiber = app.plugin({
    name: 'windows-smoke-stub',
    apply: (ctx) => {
      // DSH ≥0.1.7 的 settings 服务（SettingsForms）：describe / update / configure。
      // 本用例不测配置持久化，空 describe 即可（插件的 settings effect 拿到空值）。
      ctx.provide('settings', { describe: () => [], update: async () => {}, configure: () => () => {} })
      ctx.provide('tools', { register: (definition) => { TOOLS.set(definition.name, definition); return () => {} } })
    },
  })
  await stubFiber.await()
  const pluginFiber = app.plugin({ name, inject, apply }, { maxSessions: 2, term: 'xterm-256color', colorTerm: 'truecolor' })
  await wsFiber.await()
  await subFiber.await()
  await pluginFiber.await()
  const port = app.webServer.port
  console.log(`webServer on 127.0.0.1:${port}，插件已挂载`)
  await sleep(400) // 等 ctx.inject(['webServer']) 回调完成路由注册

  // W1：spawn → ready（默认 shell 必须是 %COMSPEC%，且真的起来了）
  console.log('\n[W1] spawn → ready（默认 shell = %COMSPEC%）')
  tracer.enter('W1 openSession + ws 连接')
  const s = openSession(port)
  await s.open()
  tracer.leave('W1 openSession + ws 连接')
  tracer.enter('W1 spawn → ready')
  s.client.send(JSON.stringify({ t: 'spawn', cols: 100, rows: 30 }))
  try {
    await s.waitFor(() => s.state.ready !== null, 20000, 'ready')
    const pid = s.state.ready.pid
    // ConPTY 不给本机 pid：Windows 上 node-pty 的 pid 恒为 0（首个 CI 跑就是被这条
    // 断言卡的，而 W2/W3 早已证明会话真的活着）。所以这里只要求「是数字且非负」，
    // 会话是否真跑起来交给 W2/W3 的输出断言。
    if (typeof pid === 'number' && pid >= 0) pass(`W1 spawn → ready（pid=${pid}${pid === 0 ? '（ConPTY 不暴露本机 pid）' : ''}）`)
    else fail('W1 spawn → ready', `ready 帧的 pid 不是数字：${JSON.stringify(s.state.ready)}`)
  } catch (error) {
    fail('W1 spawn → ready', error.message)
  }
  tracer.leave('W1 spawn → ready')

  // W2：跑起来的是 %COMSPEC%（cmd.exe），不是 POSIX 包装层
  console.log('\n[W2] 输入回显：跑起来的是 cmd.exe')
  tracer.enter('W2 %COMSPEC% 回显')
  try {
    s.client.send(JSON.stringify({ t: 'input', d: `echo IT_SHELL_%COMSPEC%${ENTER}` }))
    await s.waitFor(() => /IT_SHELL_.*cmd\.exe/i.test(s.state.text), 15000, 'cmd.exe 回显')
    pass('W2 %COMSPEC% 生效（cmd.exe 在跑，说明没有 POSIX 包装层把命令吃掉）')
  } catch (error) {
    fail('W2 %COMSPEC% 生效', error.message)
  }
  tracer.leave('W2 %COMSPEC% 回显')

  // W3：命令真的被执行（不是只回显了输入）——靠 %OS% 展开证明
  console.log('\n[W3] 命令执行（%OS% 由 shell 展开）')
  tracer.enter('W3 %OS% 展开')
  try {
    s.client.send(JSON.stringify({ t: 'input', d: `echo IT_WIN_%OS%${ENTER}` }))
    await s.waitFor(() => /IT_WIN_Windows_NT/.test(s.state.text), 15000, '%OS% 展开')
    pass('W3 命令执行生效（IT_WIN_Windows_NT —— %OS% 由 cmd 展开，回显里只有 %OS% 字面量）')
  } catch (error) {
    fail('W3 命令执行生效', error.message)
  }
  tracer.leave('W3 %OS% 展开')

  // W4：kill 帧 → exit，会话名额释放
  console.log('\n[W4] kill → exit')
  tracer.enter('W4 kill → exit')
  try {
    s.client.send(JSON.stringify({ t: 'kill' }))
    await s.waitFor(() => s.state.exited !== null, 15000, 'exit 帧')
    pass('W4 kill 帧结束会话（收到 exit）')
  } catch (error) {
    fail('W4 kill 帧结束会话', error.message)
  }
  tracer.leave('W4 kill → exit')
  tracer.enter('W4 s.client.close()')
  try { s.client.close() } catch { /* 已关闭 */ }
  tracer.leave('W4 s.client.close()')

  // W5：kill 之后还能再开一个（名额与清理都正确）
  console.log('\n[W5] kill 后重新 spawn')
  tracer.enter('W5 openSession')
  const s2 = openSession(port)
  tracer.leave('W5 openSession')
  tracer.enter('W5 第二次 spawn → ready → kill → exit')
  try {
    await s2.open()
    s2.client.send(JSON.stringify({ t: 'spawn', cols: 80, rows: 24 }))
    await s2.waitFor(() => s2.state.ready !== null, 20000, '第二次 ready')
    pass('W5 kill 后可重新 spawn（会话清理与名额释放正确）')
    s2.client.send(JSON.stringify({ t: 'kill' }))
    await s2.waitFor(() => s2.state.exited !== null, 15000, '第二次 exit')
  } catch (error) {
    fail('W5 kill 后可重新 spawn', error.message)
  }
  tracer.leave('W5 第二次 spawn → ready → kill → exit')
  tracer.enter('W5 s2.client.close()')
  try { s2.client.close() } catch { /* 已关闭 */ }
  tracer.leave('W5 s2.client.close()')

  // W6：agent 侧 `tty_send` 发**裸 LF** 也能提交命令（D74，2026-09-27 真机报告）
  //
  // 为什么必须在真机上钉这条：报告的第 1 条是 conhost 的**真实行为**（Enter 是 CR，
  // 裸 LF 只把光标下移、不提交命令行）。本地单测只能在 macOS/Linux 上 mock
  // `process.platform` 验「插件有没有归一化」，验不了「归一化之后 conhost 真的执行了」。
  // 这里用 `%OS%` 展开做判据，理由同 W3：回显里只有 `%OS%` 字面量。
  console.log('\n[W6] tty_send 的 \\n 归一化（真实 conhost：裸 LF 不提交命令）')
  let agentSid = null
  tracer.enter('W6 tty_open → tty_send → tty_capture')
  try {
    const open = TOOLS.get('tty_open')
    const send = TOOLS.get('tty_send')
    const capture = TOOLS.get('tty_capture')
    if (open === undefined || send === undefined || capture === undefined) {
      throw new Error('agent 工具没注册进 stub（注册到的：' + [...TOOLS.keys()].join(', ') + '）')
    }
    const opened = await open.execute({ cwd: process.cwd(), cols: 100, rows: 30 })
    agentSid = opened.sid
    await send.execute({ sid: agentSid, data: 'echo IT_LF_%OS%\n' })
    const deadline = Date.now() + 15000
    let tail = ''
    for (;;) {
      tail = String((await capture.execute({ sid: agentSid, lines: 60 })).tail ?? '')
      if (/IT_LF_Windows_NT/.test(tail)) break
      if (Date.now() > deadline) throw new Error('15s 内没等到 %OS% 展开；尾部：' + tail.slice(-300))
      await sleep(200)
    }
    pass('W6 tty_send 的裸 LF 在 ConPTY 上提交并执行了命令（D74：win32 归一化成 CRLF）')
  } catch (error) {
    fail('W6 tty_send 的裸 LF 提交命令（D74）', error.message)
  }
  tracer.leave('W6 tty_open → tty_send → tty_capture')
  if (agentSid !== null) {
    try {
      await TOOLS.get('tty_close').execute({ sid: agentSid })
    } catch {
      /* 已关闭 */
    }
  }

  // W7：进程退出后转「只读保留」——输出还能读回来（D77，issue #4 的正题）
  //
  // 为什么必须在真机上钉：条目链路在真实 ConPTY 上才完整——`command` 型会话跑完，
  // ConPTY 侧进程退出、句柄收尾、宿主把会话**留在表里**而不是摘掉；本地单测用的是
  // 假 PTY，验不到「真机上退出之后 tty_capture 还读得到输出」。
  console.log('\n[W7] 退出后的只读保留（D77）')
  tracer.enter('W7 退出后的只读保留')
  let retainedSid = null
  try {
    const open = TOOLS.get('tty_open')
    const list = TOOLS.get('tty_list')
    const capture = TOOLS.get('tty_capture')
    const send = TOOLS.get('tty_send')
    if (open === undefined || list === undefined || capture === undefined || send === undefined) {
      throw new Error('agent 工具没注册进 stub（注册到的：' + [...TOOLS.keys()].join(', ') + '）')
    }
    // `command` 直接跑一条会结束的命令（正是上报现场那种用法）
    const opened = await open.execute({ cwd: process.cwd(), command: 'echo IT_RETAIN_%OS%' })
    retainedSid = opened.sid
    const deadline = Date.now() + 20000
    let entry = null
    for (;;) {
      entry = (await list.execute({})).sessions.find((x) => x.sid === retainedSid) ?? null
      if (entry !== null && entry.exited === true) break
      if (Date.now() > deadline) throw new Error('20s 内没等到 exited:true；最近一条：' + JSON.stringify(entry))
      await sleep(200)
    }
    pass('W7a 命令退出后会话仍是只读保留态（exited:true）')
    const read = await capture.execute({ sid: retainedSid, lines: 60 })
    if (read.exited === true && /IT_RETAIN_Windows_NT/.test(String(read.tail ?? ''))) {
      pass('W7b 退出之后 tty_capture 仍读得到退出前的输出')
    } else {
      fail('W7b 退出之后 tty_capture 仍读得到输出（D77）', JSON.stringify(read).slice(0, 200))
    }
    let refused = false
    try {
      await send.execute({ sid: retainedSid, data: 'echo nope\n' })
    } catch {
      refused = true
    }
    if (refused) pass('W7c 对只读保留态 tty_send 明确拒写')
    else fail('W7c 对只读保留态 tty_send 明确拒写', '居然写进去了')
  } catch (error) {
    fail('W7 退出后的只读保留（D77）', error.message)
  }
  if (retainedSid !== null) {
    try {
      await TOOLS.get('tty_close').execute({ sid: retainedSid })
      const gone = !(await TOOLS.get('tty_list').execute({})).sessions.some((x) => x.sid === retainedSid)
      if (gone) pass('W7d tty_close 释放保留态（关掉后从清单消失）')
      else fail('W7d tty_close 释放保留态', '仍在清单里')
    } catch (error) {
      fail('W7d tty_close 释放保留态', error.message)
    }
  }
  tracer.leave('W7 退出后的只读保留')
}

await run()
// 正常收尾（无论有没有断言失败）：告诉 exit 钩子「别打崩溃诊断」——那段是给
// **异常终止**用的，断言失败被说成「崩溃」只会误导。
exitingNormally = true
const failed = RESULTS.filter((row) => row[0] === 'FAIL')
console.log('\n==== Windows 冒烟：' + String(RESULTS.length - failed.length) + '/' + String(RESULTS.length) + ' PASS ====')
// 同步再打一份结论：万一下面的 flush 屏障之前进程就没了（原生崩溃），至少这一行一定在。
traceSync(`Windows 冒烟结论：${String(RESULTS.length - failed.length)}/${String(RESULTS.length)} PASS`)
for (const row of failed) console.error('  ✘ ' + row[1] + (row[2] ? ' — ' + row[2] : ''))
clearTimeout(watchdog)
/**
 * 先把两条流排空再退（D62）。
 *
 * `process.exit()` 会**丢掉管道里还没 flush 的写**（Node 文档原话：尽快退出，不等
 * 未完成的异步操作）。CI 上 stdout 正是管道，缓冲 64 KB：实测「写 300 KB 后直接
 * exit」只活下来 65 536 字节。所以 2026-09-25 那次 CI 只留下
 * `##[error]Process completed with exit code 1.` —— 五条断言全是 PASS、没有 ✘ 行、
 * 也没有末尾的汇总行，失败原因整段被吞掉，只能靠拆发布记录反推"大概是哪一步"。
 *
 * 空串写入的回调在**前面那些写都落盘之后**才触发，等于一个 flush 屏障；拿到它再退，
 * 输出就一定完整。仍然用 exit 而不是 `process.exitCode`（D121：主体结束后可能有
 * 周期句柄漏着，不显式退就会挂死，而看门狗已经 clear 了）。
 */
await new Promise((resolve) => {
  process.stdout.write('', () => {
    resolve()
  })
})
await new Promise((resolve) => {
  process.stderr.write('', () => {
    resolve()
  })
})
process.exit(failed.length === 0 ? 0 : 1)
