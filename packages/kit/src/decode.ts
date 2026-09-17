/**
 * 子进程输出的编码容错解码。
 *
 * 问题：Windows 上 cmd.exe **自己的**错误消息（`'foo' 不是内部或外部命令，也不是
 * 可运行的程序或批处理文件。`）按**控制台代码页**写进管道——中文系统是 CP936，
 * 而 `Buffer#toString()` / `TextDecoder` 默认按 UTF-8 解，于是卡片上那句报错变成
 * `'foo' �����ڲ����ⲿ���Ҳ���ǿ����еĳ�����������ļ���`，可诊断性归零。
 *
 * 解法：先按**严格** UTF-8 试解；一旦遇到真正非法的字节序列，就把**这一路流**整体
 * 回落到控制台代码页重解一次，之后固定用该编码。判定只在开头的一段回放窗口内进行
 * （见 `REPLAY_WINDOW_BYTES`），所以既是 O(n)、也不需要无限缓冲。
 *
 * 两个刻意的设计：
 *   - **UTF-8 仍是主路径**：Node 写的 CLI、SSH 输出、MCP 协议……绝大多数是 UTF-8，
 *     严格解码成功就直接产出，不做任何猜测。
 *   - **按流实例独立**：stdout 与 stderr 各持一个解码器。实测同一进程里 stdout 是
 *     UTF-8、stderr 是 CP936 完全正常（cmd.exe 的报错走 stderr，CLI 的 JSON 走
 *     stdout），共用一个解码器反而会把两边一起带偏。
 */

import { execFileSync } from 'node:child_process'
import { TextDecoder } from 'node:util'

/** 入口用 `TextDecoder` 的 WHATWG 标签（`gbk` 即 CP936；Node 官方版带 full-icu）。 */
const UTF8 = 'utf-8'

/**
 * 回放窗口：判定编码时最多保留这么多原始字节。
 *
 * 超过它仍未出现过非法字节，就认定这条流是 UTF-8 并丢弃回放缓冲——否则为了「将来
 * 可能回落」而把整段输出留两份。64 KiB 远大于任何一条 cmd.exe 报错，也大于常见
 * CLI 的首屏输出；代价是「64 KiB 合法 UTF-8 之后才混进非 UTF-8 字节」这种流不再
 * 回落（改成替换字符），这在实际中不存在。
 */
const REPLAY_WINDOW_BYTES = 64 * 1024

/** 控制台代码页号 → WHATWG 编码标签。只列 Windows 上真会遇到的。 */
const CODE_PAGE_ENCODINGS: Record<number, string> = {
  // 437 / 850（西欧 OEM）**刻意不列**：WHATWG 没有它们的标签，硬指一个更糟——
  // 早先映射到 `ibm866`（西里尔），会把西欧文本解成西里尔字母。留空即落到下面的
  // `windows-1252` 兜底（西欧 ANSI），方向是对的。en-US 的 x64 Windows 默认就是 437，
  // 这条分支在那边比 CP936 更常走到。
  866: 'ibm866',
  874: 'windows-874',
  932: 'shift_jis',
  936: 'gbk',
  949: 'euc-kr',
  950: 'big5',
  1250: 'windows-1250',
  1251: 'windows-1251',
  1252: 'windows-1252',
  1253: 'windows-1253',
  1254: 'windows-1254',
  1255: 'windows-1255',
  1256: 'windows-1256',
  1257: 'windows-1257',
  1258: 'windows-1258',
  65001: UTF8,
}

/**
 * 控制台代码页号 → 可用的 WHATWG 编码标签；无对应（或本机 Node 缺表）时返回 undefined，
 * 由调用方回落到 `windows-1252`。
 *
 * 单独导出是为了能断言「437 / 850 必须返回 undefined」这条刻意的决定（见表中注释）——
 * 它们没有 WHATWG 标签，硬指一个错的会把西欧文本解成西里尔。
 */
export function codePageEncoding(codePage: number): string | undefined {
  const label = CODE_PAGE_ENCODINGS[codePage]
  return label !== undefined ? usableEncoding(label) : undefined
}

let cachedConsoleEncoding: string | undefined

/** 该编码标签在当前 Node 上可用则原样返回，否则 undefined（ICU 裁剪过的发行版会缺表）。 */
function usableEncoding(label: string): string | undefined {
  try {
    // eslint-disable-next-line no-new
    new TextDecoder(label)
    return label
  } catch {
    return undefined
  }
}

/**
 * 当前进程所在控制台的输出代码页（非 Windows 恒为 UTF-8），结果进程内缓存。
 *
 * 用 `chcp` 而不是注册表：注册表给的是系统 ANSI 代码页，而 cmd.exe 写管道用的是
 * **控制台输出**代码页，两者在 `chcp` 改过之后会不一致。取不到时回落到
 * `windows-1252`——单字节表不依赖 ICU，永远可用，至少不会把字节丢掉。
 */
export function consoleEncoding(): string {
  if (cachedConsoleEncoding === undefined) cachedConsoleEncoding = detectConsoleEncoding()
  return cachedConsoleEncoding
}

function detectConsoleEncoding(): string {
  if (process.platform !== 'win32') return UTF8
  let codePage: number | undefined
  try {
    // encoding 用 latin1：`chcp` 的行本身可能是本地化文本（`活动代码页: 936`），
    // 但数字是 ASCII，任何单字节解码都读得对。
    const out = execFileSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'chcp'], {
      encoding: 'latin1',
      timeout: 3_000,
      windowsHide: true,
    })
    const matched = /(\d{3,5})/.exec(out)
    if (matched !== null) codePage = Number(matched[1])
  } catch {
    /* 没有控制台 / chcp 不可用：走下面的兜底 */
  }
  const label = codePage !== undefined ? codePageEncoding(codePage) : undefined
  return label ?? 'windows-1252'
}

/** 供测试重置进程内缓存（真机上不必调用）。 */
export function resetConsoleEncodingCache(): void {
  cachedConsoleEncoding = undefined
}

export interface OutputDecoderOptions {
  /**
   * 非 UTF-8 时使用的编码标签；缺省取 `consoleEncoding()`。
   * 显式传 `'utf-8'` 表示「只可能是 UTF-8，非法字节按替换字符处理」。
   */
  fallbackEncoding?: string
}

export interface OutputDecoder {
  /** 吃一块输出，返回可以立即交付的文本（不完整的字节留在内部）。 */
  decode(chunk: Uint8Array | string): string
  /** 流结束时调用：吐出内部残留字节对应的文本。 */
  flush(): string
}

/**
 * 建一个容错解码器。用法与 `TextDecoder` 的流式模式一致，但**不会**因为
 * 「块边界切在多字节字符中间」而误判编码（严格解码器把不完整尾巴留在内部，
 * 不抛错），所以可以安全地按 `data` 事件逐块喂。
 */
export function createOutputDecoder(options: OutputDecoderOptions = {}): OutputDecoder {
  let utf8 = new TextDecoder(UTF8, { fatal: true })
  let fallback: TextDecoder | undefined
  let mode: 'utf8' | 'fallback' = 'utf8'
  let committed = false
  let replay: Buffer[] = []
  let replayBytes = 0
  /** 已经交付出去的字符数：整体重解时用来只补差量，避免重复吐同一段。 */
  let emittedChars = 0

  const fallbackDecoder = (): TextDecoder => {
    if (fallback === undefined) {
      const requested = options.fallbackEncoding ?? consoleEncoding()
      const label = usableEncoding(requested) ?? usableEncoding('windows-1252') ?? UTF8
      // 显式要求 UTF-8 时用宽松模式：宁可出替换字符，也不抛错。
      fallback = label === UTF8 ? new TextDecoder(UTF8) : new TextDecoder(label)
    }
    return fallback
  }

  const keepReplay = (buf: Buffer): void => {
    if (committed) return
    replay.push(buf)
    replayBytes += buf.length
    if (replayBytes > REPLAY_WINDOW_BYTES) {
      committed = true
      replay = []
      replayBytes = 0
    }
  }

  /**
   * 判定这条流不是 UTF-8：用控制台代码页把**已见过的全部字节**重解一遍，
   * 只把「还没交付过」的那一段交出去。
   */
  const switchToFallback = (): string => {
    mode = 'fallback'
    committed = true
    const all = Buffer.concat(replay)
    replay = []
    replayBytes = 0
    const text = fallbackDecoder().decode(all, { stream: true })
    const fresh = text.length > emittedChars ? text.slice(emittedChars) : ''
    emittedChars = text.length
    return fresh
  }

  return {
    decode(chunk: Uint8Array | string): string {
      const buf = typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : Buffer.from(chunk)
      if (buf.length === 0) return ''
      if (mode === 'fallback') return fallbackDecoder().decode(buf, { stream: true })

      keepReplay(buf)
      try {
        const text = utf8.decode(buf, { stream: true })
        emittedChars += text.length
        return text
      } catch {
        // 严格解码器一旦吞过非法字节就不可再用，必须换新的
        utf8 = new TextDecoder(UTF8, { fatal: true })
        if (committed) {
          // 回放窗口已经关掉：只能宽松解这一段，绝不再抛
          const text = new TextDecoder(UTF8).decode(buf)
          emittedChars += text.length
          return text
        }
        return switchToFallback()
      }
    },

    flush(): string {
      if (mode === 'fallback') return fallbackDecoder().decode()
      try {
        const text = utf8.decode()
        emittedChars += text.length
        return text
      } catch {
        // 结尾停在一个残缺序列上——按非 UTF-8 结案，整段重解
        utf8 = new TextDecoder(UTF8, { fatal: true })
        mode = 'fallback'
        committed = true
        const all = Buffer.concat(replay)
        replay = []
        replayBytes = 0
        const text = fallbackDecoder().decode(all)
        const fresh = text.length > emittedChars ? text.slice(emittedChars) : ''
        emittedChars = text.length
        return fresh
      }
    },
  }
}

/**
 * 一次性解码整段输出（用于已经把全部字节攒在手里的场景，如 `execFile` 的
 * `encoding: 'buffer'`）。等价于 `createOutputDecoder().decode(buf) + flush()`。
 */
export function decodeOutput(buf: Uint8Array, options: OutputDecoderOptions = {}): string {
  const decoder = createOutputDecoder(options)
  return decoder.decode(buf) + decoder.flush()
}
