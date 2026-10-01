/** 命令输出尾部保留行数。 */
export declare const CONTEXT_TAIL_LINES = 40;
/** 上下文正文的字符上限（超出从头部丢弃，并注明丢了多少行）。 */
export declare const CONTEXT_MAX_CHARS = 6000;
/** 屏幕文本的行数上限（只在「没有命令输出」时才用屏幕兜底）。 */
export declare const SCREEN_TAIL_LINES = 30;
/**
 * 这个退出码值不值得摆徽标。
 *
 * 0 不弹；`null` / `undefined`（没拿到退出码 = 命令边界不可信）也不弹——
 * 宁可少弹一次，也不要在正常的提示符下摆一张「它失败了」的脸。
 *
 * **130 / 141 是刻意豁免的**：前者是 Ctrl-C（用户自己按的），后者是 SIGPIPE
 * （`… | head` 的常态）。这两个天天出现，为它们弹徽标会让用户干脆把整个功能关掉。
 */
export declare function shouldExplainExit(code: number | null | undefined): boolean;
/** 规则表只读导出，供单测逐条枚举（新加一条规则必须同时加一条用例）。 */
export declare const SECRET_RULE_WHY: readonly string[];
export declare function maskSecrets(text: string): {
    text: string;
    count: number;
};
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
export declare function compressTerminalText(raw: string, options?: {
    maxLines?: number;
    maxChars?: number;
}): string;
/**
 * 从模型答案里取出**一条**可直接填入的命令行。
 *
 * 只认**围栏代码块**：没有围栏就返回空串（客户端据此禁用「填入」）。刻意不去散文里
 * 猜哪一行像命令——猜错的下场是往用户的 PTY 里写进一句解释文字，比不给按钮糟得多。
 */
export declare function extractCommandFromAnswer(answer: string): string;
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
export declare function plainAnswerText(answer: string): string;
/** 上下文包输入（宿主侧从会话状态取材，见 index.ts 的 buildAssistContext）。 */
export interface AssistPromptInput {
    shell: string;
    cwd: string;
    /** 上一条已完成命令的命令行（拿不到时省略）。 */
    command?: string;
    exitCode?: number | null;
    /** 上一条命令的输出（B..D 捕获窗口，未压缩）。 */
    output?: string;
    /** 当前屏纯文本（tty_screen 产物）；只在没有命令输出时兜底。 */
    screen?: string;
    /** 界面语言；模型据此决定用中文还是英文作答。 */
    lang?: 'zh' | 'en';
}
export declare function systemPromptFor(lang: 'zh' | 'en' | undefined): string;
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
export declare function buildFailurePrompt(input: AssistPromptInput): {
    system: string;
    user: string;
};
