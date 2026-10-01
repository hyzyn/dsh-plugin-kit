/**
 * @hyzyn/dsh-tty — 「失败即解释」的上下文包单测（0.24.0）。
 *
 * 这个功能里唯一能被**确定性**测住的就是这一层：把终端现场压成喂给模型的那段文本。
 * `ctx.llm.stream` 的调用、徽标的出现时机、浮层的渲染都能用假件覆盖，但「喂进去的东西
 * 干不干净」只有纯函数能钉死——而它恰好决定了整个功能的上限（垃圾进、垃圾出）。
 *
 * 本文件钉五件事：
 *   1. 哪些退出码该弹徽标（130 / 141 必须豁免，否则天天误报）；
 *   2. 遮盖规则**逐条**有例（新增一条规则就必须补一条用例，见 SECRET_RULE_WHY），
 *      外加一条**反向**用例——正常日志不许被改；
 *   3. 压缩：剥转义、收敛 \r 覆盖、折重复行、取尾部、注明省略行数；
 *   4. 从答案里取命令只认围栏代码块（没围栏就返回空串，客户端据此禁用「填入」）；
 *   5. 「输出优先、屏幕兜底」的取材规则，以及**遮盖发生在组装之后**——
 *      密钥在到达模型之前就被换掉了。
 */
import './isolated-home.js'
import { describe, expect, it } from 'vitest'
import {
  CONTEXT_MAX_CHARS,
  SECRET_RULE_WHY,
  buildFailurePrompt,
  compressTerminalText,
  extractCommandFromAnswer,
  maskSecrets,
  plainAnswerText,
  shouldExplainExit,
} from '../src/assist.js'
import { cleanAnsi } from '../src/ansi.js'

/** 反引号（围栏）经占位符落进源码，免得在生成器里被转义链坑到。 */
const BT = '\u0060\u0060\u0060'

describe('shouldExplainExit：哪些退出码值得弹徽标', () => {
  it('0、null、undefined 都不弹', () => {
    expect(shouldExplainExit(0)).toBe(false)
    expect(shouldExplainExit(null)).toBe(false)
    expect(shouldExplainExit(undefined)).toBe(false)
  })

  it('130（Ctrl-C）与 141（SIGPIPE）豁免——它们天天出现，误报会逼用户关掉整个功能', () => {
    expect(shouldExplainExit(130)).toBe(false)
    expect(shouldExplainExit(141)).toBe(false)
  })

  it('真失败要弹：1 / 2 / 127 / 255', () => {
    for (const code of [1, 2, 127, 255]) expect(shouldExplainExit(code)).toBe(true)
  })
})

describe('maskSecrets：逐条规则 + 反向（不许错杀）', () => {
  it('每一条规则都有自己的用例（规则表加一条就得加一条）', () => {
    // [输入, 绝不能原样外发的子串]。断言盯的是**秘密本身消失了**，而不是遮盖后的
    // 字面量——一条输入可能被两条规则先后命中（`API_KEY=sk-…` 会先中 sk- 再中被键值对
    // 规则吃掉整个值），钉字面量就等于把规则的**执行顺序**写进测试，改顺序就红。
    const cases: Array<[string, string]> = [
      ['-----BEGIN RSA PRIVATE KEY-----\nMIIEow\n-----END RSA PRIVATE KEY-----', 'MIIEow'],
      ['sk-abcdefghijklmnop', 'sk-abcdefghijklmnop'],
      ['AKIAIOSFODNN7EXAMPLE', 'AKIAIOSFODNN7EXAMPLE'],
      ['ghp_0123456789012345678901', 'ghp_0123456789012345678901'],
      ['eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abcdefghijk', 'eyJhbGciOiJIUzI1NiJ9'],
      ['postgres://user:s3cret@db.internal:5432/app', 's3cret'],
      ['password=hunter2', 'hunter2'],
      ['TOKEN: abcdefg', 'abcdefg'],
    ]
    // 用例数**不少于**规则数：一条规则可以有多条用例（键值对就有 password= / TOKEN: 两种
    // 形态），但一条都不许少——所以规则表里加了新条目，这里就得补用例
    expect(cases.length).toBeGreaterThanOrEqual(SECRET_RULE_WHY.length)
    for (const [input, secret] of cases) {
      const out = maskSecrets(input)
      expect(out.text).not.toContain(secret)
      expect(out.text).toContain('[已遮盖')
      expect(out.count).toBeGreaterThan(0)
    }
  })

  it('反向：普通日志一个字都不许改（错杀比漏掉一个罕见格式更伤信任）', () => {
    const lines = [
      'npm error code ENOENT',
      'npm error path /Users/czz/demo/package.json',
      'Process exited with status 127',
      '[INFO] tokenizer loaded in 120ms',
      'total 48\ndrwxr-xr-x  5 czz staff  160 Oct  1 12:00 src',
    ].join('\n')
    const out = maskSecrets(lines)
    expect(out.text).toBe(lines)
    expect(out.count).toBe(0)
  })
})

describe('cleanAnsi / compressTerminalText：把终端输出压成模型读得懂的正文', () => {
  it('剥转义：颜色、光标、OSC 命令标记一个都不留', () => {
    const raw = '\x1b]133;A\x07\x1b[32mok\x1b[0m \x1b[2Kdone\x1b]133;D;0\x07'
    expect(cleanAnsi(raw)).toBe('ok done')
  })

  it('收敛 \r 覆盖：进度条只留最后一帧（zsh 的 \r\r\n 不许把整行抹掉）', () => {
    expect(compressTerminalText('10%\r55%\r100% done\r\nnext line')).toBe('100% done\nnext line')
  })

  it('折掉连续空行与连续重复行：重复行全删，空行**留一个**当段落分隔', () => {
    // 刻意留一个空行：编译器/构建工具的空行是它自己的分块方式，全删掉反而更难读；
    // 被折掉的是**连续**的空行（三连空行 → 一个）
    const raw = ['warn: x', 'warn: x', 'warn: x', '', '', '', 'error: boom'].join('\n')
    expect(compressTerminalText(raw)).toBe('warn: x\n\nerror: boom')
  })

  it('超过行数上限时取**尾部**并注明省略了多少行（否则模型会把首行当报错）', () => {
    const raw = Array.from({ length: 100 }, (_v, i) => 'line ' + String(i)).join('\n')
    const out = compressTerminalText(raw, { maxLines: 5 })
    expect(out.startsWith('…（前面 95 行已省略）')).toBe(true)
    expect(out).toContain('line 99')
    expect(out).not.toContain('line 94')
  })

  it('超过字符上限时从**整行**开始切（半截命令会让模型编出后半段）', () => {
    const raw = Array.from({ length: 40 }, (_v, i) => 'x'.repeat(200) + ' ' + String(i)).join('\n')
    const out = compressTerminalText(raw, { maxChars: CONTEXT_MAX_CHARS })
    expect(out.length).toBeLessThanOrEqual(CONTEXT_MAX_CHARS + 32)
    // 每一行都是完整的（都以行号结尾），没有被切一半的行
    for (const line of out.split('\n')) {
      if (line === '' || line.startsWith('…（前面')) continue
      expect(line).toMatch(/ \d+$/)
    }
  })
})

describe('extractCommandFromAnswer：只认围栏代码块', () => {
  it('取围栏里的第一条命令，剥掉 $ 提示符与注释行', () => {
    const answer = '**发生了什么**：没找到包\n\n**下一步**：\n' + BT + 'sh\n# 先看看包名\n$ npm ls \n' + BT
    expect(extractCommandFromAnswer(answer)).toBe('npm ls')
  })

  it('没有围栏就返回空串——不许去散文里猜哪一行像命令', () => {
    const answer = '**发生了什么**：你大概想跑 npm install。\n**下一步**：先执行 npm install 试试。'
    expect(extractCommandFromAnswer(answer)).toBe('')
  })

  it('围栏里只有空行/注释也是空串', () => {
    const answer = BT + 'sh\n# 只有注释\n\n' + BT
    expect(extractCommandFromAnswer(answer)).toBe('')
  })
})

describe('plainAnswerText：界面正文只「去标记」，不「解释标记」', () => {
  it('丢掉围栏代码块（命令另有专门一行展示），保留正文', () => {
    const answer = '发生了什么：依赖没装。\n\n下一步：\n' + BT + 'sh\nnpm install\n' + BT + '\n装完再跑一次。'
    const out = plainAnswerText(answer)
    expect(out).toContain('发生了什么：依赖没装。')
    expect(out).toContain('装完再跑一次。')
    expect(out).not.toContain('npm install')
    expect(out).not.toContain(BT)
  })

  it('去掉 ** 强调标记（界面不渲染 Markdown，留着就是满屏星号）', () => {
    expect(plainAnswerText('**发生了什么**：出错了')).toBe('发生了什么：出错了')
  })

  it('丢掉围栏后留下的连续空行折成一个，首尾空白去掉', () => {
    expect(plainAnswerText('\n\na\n\n' + BT + '\nx\n' + BT + '\n\n\nb\n\n')).toBe('a\n\nb')
  })

  it('没有围栏也没有标记时原样返回（不许顺手改用户的正文）', () => {
    const plain = '发生了什么：找不到文件。\n\n下一步：检查路径。'
    expect(plainAnswerText(plain)).toBe(plain)
  })
})

describe('buildFailurePrompt：取材规则与遮盖时机', () => {
  const base = { shell: 'zsh', cwd: '/Users/czz/demo' }

  it('输出与屏幕互补时两段都发：命令行**只存在于屏幕上**（实测输出里没有回显）', () => {
    const p = buildFailurePrompt({
      ...base,
      exitCode: 2,
      output: 'ls: /definitely-not-here: No such file or directory',
      screen: '(base) czz@192 /tmp % ls /definitely-not-here\nls: /definitely-not-here: No such file or directory\n(base) czz@192 /tmp %',
    })
    expect(p.user).toContain('[命令输出]')
    expect(p.user).toContain('[当前屏幕（含你敲的命令行与提示符）]')
    expect(p.user).toContain('ls /definitely-not-here')
    expect(p.user).toContain('退出码: 2')
  })

  it('屏幕被输出完全覆盖时不再重复发（tmux 持久会话里两者本是同一份 pane 快照）', () => {
    const shared = ['total 0', 'drwxr-xr-x 2 czz staff 64 Oct 1 12:00 src', 'error: boom']
    const p = buildFailurePrompt({ ...base, output: shared.join('\n'), screen: shared.join('\n') })
    expect(p.user).toContain('[命令输出]')
    expect(p.user).not.toContain('[当前屏幕')
  })

  it('只有屏幕（TUI 重画吃掉了输出）时屏幕就是正文', () => {
    const p = buildFailurePrompt({ ...base, output: '', screen: 'SCREEN-MARKER' })
    expect(p.user).toContain('[当前屏幕（含你敲的命令行与提示符）]')
    expect(p.user).toContain('SCREEN-MARKER')
    // 没有输出段落，也不该出现一个空的「[命令输出]」标题
    expect(p.user).not.toContain('[命令输出]')
  })

  it('遮盖发生在组装之后：密钥在离开本机前就已经被换掉', () => {
    const p = buildFailurePrompt({ ...base, output: 'export API_KEY=sk-abcdefghijklmnop\nboom' })
    expect(p.user).not.toContain('abcdefghijklmnop')
    expect(p.user).toContain('[已遮盖')
    // 另一半同样重要：遮盖不许把现场一起吃掉——该留的上下文一个字不少
    expect(p.user).toContain('boom')
    expect(p.user).toContain('cwd: /Users/czz/demo')
  })

  it('语言分派：zh 走中文系统提示，en 走英文', () => {
    expect(buildFailurePrompt({ ...base, lang: 'zh' }).system).toContain('回答语言：中文')
    expect(buildFailurePrompt({ ...base, lang: 'en' }).system).toContain('Answer language: English')
    expect(buildFailurePrompt(base).system).toContain('回答语言：中文')
  })

  it('没有输出也没有屏幕时不留空档（明说没拿到，而不是留一段空白让模型自由发挥）', () => {
    expect(buildFailurePrompt(base).user).toContain('(没有拿到输出)')
  })
})
