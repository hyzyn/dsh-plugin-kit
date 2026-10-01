/**
 * 终端文本的转义序列清洗原语（0.24.0 从 index.ts 抽出）。
 *
 * 为什么单独立一个文件：`tty_capture` 的尾部清洗与「失败即解释」的上下文压缩
 * 建立在同一套正则上。各留一份的下场是漂移——一边补了新的转义形态、另一边不知道，
 * 表现就是「工具输出里看着干干净净，发给模型的是满屏 `\x1b[32m`」。
 *
 * 逐行近似，**不追求完整 VT 语义**：要完整画面用 `tty_screen` 的 xterm-headless 虚拟屏。
 */

/** 剥离 OSC 序列（`\x1b]…BEL/ST`）：命令标记 133、cwd 上报 7、超链接 8 都在这里。 */
export function stripOsc(text: string): string {
  return text.replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
}

/** 剥离 CSI 与其余 ESC 序列（颜色、光标移动、清屏）。 */
export function stripAnsi(raw: string): string {
  const withoutOsc = stripOsc(raw)
  const withoutCsi = withoutOsc.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
  return withoutCsi.replace(/\x1b[@-Z\\-_]/g, '')
}

/**
 * 同行内 `\r` 覆盖收敛为**最后一次覆盖的结果**（进度条不再刷屏）。
 *
 * 先把「行尾 \r\n」（zsh 行结束常为 \r\r\n）归一成 \n，再处理剩余孤立的 \r ——
 * 否则回显/输出行会被误判为覆盖而整行抹掉。
 */
export function collapseCarriageReturns(text: string): string {
  const normalized = text.replace(/\r+\n/g, '\n')
  return normalized.split('\n').map((line) => {
    const idx = line.lastIndexOf('\r')
    return idx === -1 ? line : line.slice(idx + 1)
  }).join('\n')
}

/** 转义清洗的合成（原 `cleanAnsiTail` 的行为，逐字节等价）。 */
export function cleanAnsi(raw: string): string {
  return collapseCarriageReturns(stripAnsi(raw))
}
