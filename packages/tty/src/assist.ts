/**
 * 「失败即解释」的上下文包（0.24.0）。
 *
 * 这一层的职责只有一个：把终端现场压成**模型读得懂、又淹不掉它**的一小段文本。
 * 它是这个功能真正的工程主体——`ctx.llm.stream` 那条路 rss 已经走通（连 finish 块的
 * 形状、reasoning 模型的 max-tokens 拐点都有注释留档），难的是**喂什么进去**：
 * 终端输出里全是 ANSI、\r 覆盖行、进度条刷屏与重复日志，直接丢给模型就是垃圾进垃圾出。
 *
 * 全部导出都是**纯函数**（不碰 ctx、不碰会话对象）——这是整个功能里唯一能被确定性
 * 测住的部分，所以逻辑尽量往这里收。
 */
import { cleanAnsi } from './ansi.js'

/** 命令输出尾部保留行数。 */
export const CONTEXT_TAIL_LINES = 40
/** 上下文正文的字符上限（超出从头部丢弃，并注明丢了多少行）。 */
export const CONTEXT_MAX_CHARS = 6000
/** 屏幕文本的行数上限（只在「没有命令输出」时才用屏幕兜底）。 */
export const SCREEN_TAIL_LINES = 30

/**
 * 这个退出码值不值得摆徽标。
 *
 * 0 不弹；`null` / `undefined`（没拿到退出码 = 命令边界不可信）也不弹——
 * 宁可少弹一次，也不要在正常的提示符下摆一张「它失败了」的脸。
 *
 * **130 / 141 是刻意豁免的**：前者是 Ctrl-C（用户自己按的），后者是 SIGPIPE
 * （`… | head` 的常态）。这两个天天出现，为它们弹徽标会让用户干脆把整个功能关掉。
 */
export function shouldExplainExit(code: number | null | undefined): boolean {
  if (code === null || code === undefined) return false
  if (code === 0) return false
  return code !== 130 && code !== 141
}

/**
 * 外发前的轻量遮盖。
 *
 * 这不是「防住攻击者」，而是**兜住常识**：终端屏幕上出现密钥、token、连接串是家常便饭，
 * 而这一段文本要离开本机。成本极低，但它决定了这个开关该怎么向用户交代。
 *
 * 只做**形态明确**的规则——宁可漏，不可错杀：把一段正常日志改成 [已遮盖] 比漏掉一个
 * 罕见格式的密钥更伤信任（用户会以为功能坏了）。
 */
const SECRET_RULES: Array<{ re: RegExp; to: string; why: string }> = [
  { re: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, to: '[已遮盖私钥]', why: 'PEM 私钥块' },
  { re: /\bsk-[A-Za-z0-9_-]{8,}/g, to: 'sk-[已遮盖]', why: 'OpenAI 风格密钥' },
  { re: /\bAKIA[0-9A-Z]{16}\b/g, to: 'AKIA[已遮盖]', why: 'AWS access key id' },
  { re: /\bgh[pousr]_[A-Za-z0-9]{20,}/g, to: 'gh_[已遮盖]', why: 'GitHub token' },
  { re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, to: '[已遮盖 JWT]', why: 'JWT' },
  { re: /(\/\/[^/\s:@]+):[^/\s:@]+@/g, to: '$1:[已遮盖]@', why: 'URL 里的密码' },
  {
    re: /((?:password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|authorization|密码)\s*[:=]\s*)([^\s'"]{3,})/gi,
    to: '$1[已遮盖]',
    why: '键值对里的秘密',
  },
]

/** 规则表只读导出，供单测逐条枚举（新加一条规则必须同时加一条用例）。 */
export const SECRET_RULE_WHY: readonly string[] = SECRET_RULES.map((rule) => rule.why)

export function maskSecrets(text: string): { text: string; count: number } {
  let out = text
  let count = 0
  for (const rule of SECRET_RULES) {
    out = out.replace(rule.re, (...args: unknown[]) => {
      count += 1
      // 手写 $1 展开：用了回调就不能再靠 String.replace 的替换串语法
      return rule.to.replace(/\$(\d)/g, (_m, d: string) => String(args[Number(d)] ?? ''))
    })
  }
  return { text: out, count }
}

/**
 * 把一段终端输出压成上下文正文。
 *
 * 四步，每一步都对应一种真实的噪声：
 *   1. 剥转义（颜色/光标/进度条转义）——不剥的话模型看到的是满屏控制码；
 *   2. \r 覆盖收敛——`npm install` 那一类会把同一行重画几百次；
 *   3. 折掉连续空行与**连续重复行**——重复日志（同一句 warning 刷 50 遍）是纯浪费预算；
 *   4. 取尾部并按字符上限硬切——报错在末尾，且开头半行要丢掉（半行命令比没有更误导）。
 *
 * 头部被丢弃时**显式注明行数**：否则模型会把「输出第一行就是报错」当成事实。
 */
export function compressTerminalText(raw: string, options?: { maxLines?: number; maxChars?: number }): string {
  const maxLines = options?.maxLines ?? CONTEXT_TAIL_LINES
  const maxChars = options?.maxChars ?? CONTEXT_MAX_CHARS
  const lines = cleanAnsi(raw).split('\n').map((line) => line.replace(/[ \t]+$/, ''))
  const kept: string[] = []
  for (const line of lines) {
    const prev = kept[kept.length - 1]
    if (line === '') {
      if (prev === '' || prev === undefined) continue
    } else if (line === prev) {
      continue
    }
    kept.push(line)
  }
  while (kept.length > 0 && kept[kept.length - 1] === '') kept.pop()
  const joined = kept.join('\n')
  let text = joined
  let byChars = false
  if (joined.length > maxChars) {
    text = joined.slice(-maxChars)
    const nl = text.indexOf('\n')
    // 从一个整行开始，别把一行切成半截（半截命令会让模型编出后半段）
    text = nl === -1 ? text : text.slice(nl + 1)
    byChars = true
  }
  if (!byChars && kept.length > maxLines) {
    text = kept.slice(-maxLines).join('\n')
  }
  const shown = text === '' ? 0 : text.split('\n').length
  const omitted = kept.length - shown
  return omitted > 0 ? '…（前面 ' + String(omitted) + ' 行已省略）\n' + text : text
}

/**
 * 从模型答案里取出**一条**可直接填入的命令行。
 *
 * 只认**围栏代码块**：没有围栏就返回空串（客户端据此禁用「填入」）。刻意不去散文里
 * 猜哪一行像命令——猜错的下场是往用户的 PTY 里写进一句解释文字，比不给按钮糟得多。
 */
export function extractCommandFromAnswer(answer: string): string {
  const fence = /```[A-Za-z0-9_-]*\n([\s\S]*?)```/.exec(answer)
  if (fence === null) return ''
  for (const raw of fence[1].split('\n')) {
    const line = raw.trim()
    /*
     * 注释行**先判**。`#` 既是注释符、又是 root 提示符：反过来先剥提示符的话
     * 「# 先看看包名」会被当成一条命令填进终端（这个坑是单测当场抓出来的——
     * 见 test/assist-context.test.ts 的「围栏里只有空行/注释也是空串」）。
     * 代价是 root 会话里 `# cmd` 形态的首行取不到，而系统提示本来就要求不要 $ 前缀。
     */
    if (line === '' || line.startsWith('#')) continue
    return line.replace(/^[$>]\s+/, '')
  }
  return ''
}

/**
 * 把模型答案变成**界面正文用的纯文本**。
 *
 * 只做「去掉标记」，**不做「解释标记」**——模型输出是不可信文本，任何 Markdown 渲染都是
 * 一条新攻击面；而原样显示又满屏是星号与围栏。所以折中成两条纯删减：
 *   - 丢掉围栏代码块：命令另有一行 `.tt_assistCmd` 专门展示（还带「填入」按钮），
 *     正文里再来一遍是重复；
 *   - 去掉 `**` 强调标记。
 * 顺带折掉连续空行（丢掉围栏后常留下整块空白）。
 */
export function plainAnswerText(answer: string): string {
  const withoutFence = answer.replace(/```[A-Za-z0-9_-]*\n[\s\S]*?```/g, '').replace(/```[A-Za-z0-9_-]*/g, '')
  const kept: string[] = []
  for (const raw of withoutFence.split('\n')) {
    const line = raw.replace(/\*\*/g, '').replace(/[ \t]+$/, '')
    if (line === '' && (kept.length === 0 || kept[kept.length - 1] === '')) continue
    kept.push(line)
  }
  while (kept.length > 0 && kept[kept.length - 1] === '') kept.pop()
  return kept.join('\n')
}

/** 上下文包输入（宿主侧从会话状态取材，见 index.ts 的 buildAssistContext）。 */
export interface AssistPromptInput {
  shell: string
  cwd: string
  /** 上一条已完成命令的命令行（拿不到时省略）。 */
  command?: string
  exitCode?: number | null
  /** 上一条命令的输出（B..D 捕获窗口，未压缩）。 */
  output?: string
  /** 当前屏纯文本（tty_screen 产物）；只在没有命令输出时兜底。 */
  screen?: string
  /** 界面语言；模型据此决定用中文还是英文作答。 */
  lang?: 'zh' | 'en'
}

/**
 * 系统提示。
 *
 * 三条硬约束写进去的原因：
 *   - **固定两节标题**：界面按节渲染，多出来的前言/总结只是噪声；
 *   - **命令放进围栏且每条一行**：客户端的「填入」按钮就是从围栏里取第一条
 *     （extractCommandFromAnswer），格式漂了这个按钮就哑了；
 *   - **不要编造路径/IP、拿不准就给一条查证命令**：终端里照着模型编的路径敲下去，
 *     比不回答更糟。
 */
const SYSTEM_ZH = [
  '你是终端里的排错助手。用户刚在终端里跑了一条命令、它以非零状态结束（或屏幕上出现了报错）。',
  '用最短的篇幅说清两件事：出了什么事、下一步该敲什么。',
  '',
  '输出格式（严格遵守，**纯文本**，界面不渲染 Markdown）：',
  '第一行就以「发生了什么：」开头，一到两句，说人话。不要复述输出、不要贴日志原文。',
  '空一行后写「下一步：」，紧接一个 SH 围栏代码块（三个反引号 + sh），里面放一到两条可以直接粘贴执行的命令，每条命令单独一行，不要 $ 前缀、不要行内注释。',
  '然后在代码块下方用一句话说明需要用户补什么（如果需要的话）。',
  '',
  '规则：',
  '- **不要用 Markdown 加粗 / 标题 / 列表符号**（星号和井号会原样出现在界面上）；只允许那个 SH 围栏代码块。',
  '- 不要前言、不要总结、不要客套、不要问「需要我帮你做别的吗」。',
  '- 需要用户填空的地方用 <尖括号> 标出；**不要编造具体的路径、文件名、IP、版本号**。',
  '- 拿不准原因时直说拿不准，并给出**一条能查证它**的命令（看日志、看版本、看帮助）。',
  '- 不要建议安装软件、不要建议改系统配置，除非错误信息明确指向它。',
  '- 你没有执行能力：不要说自己运行了什么，也不要假设你能看到用户没给你的输出。',
  '- 回答语言：中文。',
].join('\n')

const SYSTEM_EN = [
  'You are a troubleshooting assistant inside a terminal panel. The user just ran a command that exited non-zero (or the screen shows an error).',
  'Explain, in as few words as possible: what went wrong, and what to type next.',
  '',
  'Output format (strict, **plain text** — the panel does not render Markdown):',
  'Start with "What happened: " on the first line, one or two sentences, plain language. Do not restate the raw output.',
  'Then a blank line and "Next step: ", immediately followed by one SH fenced block (three backticks + sh) with one or two commands that can be pasted directly, one command per line, no $ prefix, no inline comments.',
  'Then one short line saying what the user still needs to fill in, if anything.',
  '',
  'Rules:',
  '- **No Markdown bold / headings / bullets** (asterisks and hashes show up literally in the panel); the single SH fenced block is the only exception.',
  '- No preamble, no summary, no pleasantries, no "anything else I can help with".',
  '- Mark blanks as <angle brackets>; never invent paths, file names, IPs or versions.',
  '- If unsure, say so and give ONE command that would verify it (check logs, version, help).',
  '- Do not suggest installing software or changing system config unless the error clearly points there.',
  '- You cannot execute anything: never claim you ran something, and never assume output you were not given.',
  '- Answer language: English.',
].join('\n')

export function systemPromptFor(lang: 'zh' | 'en' | undefined): string {
  return lang === 'en' ? SYSTEM_EN : SYSTEM_ZH
}

/**
 * 屏幕是否带来了输出里没有的东西。
 *
 * 判据是**尾段三行的包含关系**，不是「谁更有用」这种说不清的话：tmux 持久会话里
 * `lastCommand.output` 本来就是 capture-pane 快照（OSC 133;T），与屏幕是同一份内容，
 * 再发一遍纯属浪费 token；而普通会话里两者**互补**——输出是 B..D 精确捕获的（干净，
 * 但**不含命令回显**：zsh 的 preexec 发出的 B 标记在用户输入回显之后，实测确认），
 * 命令行只存在于屏幕上。
 */
function screenAddsContext(output: string, screen: string): boolean {
  if (screen.trim() === '') return false
  if (output.trim() === '') return true
  const probe = screen.split('\n').filter((line) => line.trim() !== '').slice(-3)
  if (probe.length === 0) return false
  return !probe.every((line) => output.includes(line))
}

/**
 * 组装一次解释请求。
 *
 * **命令输出为主，屏幕补它缺的东西**（见 screenAddsContext）。两段各有不可替代之处：
 * 输出回答了「这条命令干了什么」，屏幕回答了「敲的是哪条命令」——后者恰恰是输出里
 * 没有的（实测：`tty_capture{last}` 的正文只有 `ls: … No such file or directory`）。
 *
 * `input.command` 目前**没有调用方会填**：shell 集成桩只发 A/B/D/T，不带命令行，
 * 所以这个字段留着等「桩改成 C 标记带命令」那一轮（见 ROADMAP）。
 */
export function buildFailurePrompt(input: AssistPromptInput): { system: string; user: string } {
  const out = compressTerminalText(input.output ?? '')
  const screen = compressTerminalText(input.screen ?? '', { maxLines: SCREEN_TAIL_LINES })
  const lines: string[] = [
    '[终端现场]',
    'shell: ' + (input.shell !== '' ? input.shell : '(未知)'),
    'cwd: ' + (input.cwd !== '' ? input.cwd : '(未知)'),
  ]
  if (input.command !== undefined && input.command !== '') lines.push('命令: ' + input.command)
  if (input.exitCode !== undefined && input.exitCode !== null) lines.push('退出码: ' + String(input.exitCode))
  const hasOut = out.trim() !== ''
  const hasScreen = screenAddsContext(out, screen)
  if (hasOut) lines.push('', '[命令输出]', out)
  if (hasScreen) lines.push('', '[当前屏幕（含你敲的命令行与提示符）]', screen)
  if (!hasOut && !hasScreen) lines.push('', '(没有拿到输出)')
  const masked = maskSecrets(lines.join('\n'))
  return { system: systemPromptFor(input.lang), user: masked.text }
}
