/**
 * 测试助手：临时把 `process.platform` 换成指定值跑一段。
 *
 * **为什么需要它**：`tty_send` 的写入路径读的就是 `process.platform`（**D74**：Windows 本地会话里
 * 裸 LF 要归一成 CRLF，否则 Enter 不提交；SSH 会话与非 win32 原样透传）。于是「写进 PTY 的字节」
 * 这类断言天然吃平台——**同一条用例在 Windows 腿与 macOS/ubuntu 腿上会拿到不同的字节**，
 * 而 CI 是三条腿都跑的（2026-10-01 实测：`send-keys.test.ts` 就因为断言里写死了 `\n`
 * 在 windows-latest 上红，见 CI run 36864303722）。
 *
 * **两种改法，选后者**：① 按平台分支写期望值（两个平台都"能过"，但断言本身随环境变）；
 * ② 把平台**钉住**——一条用例只断言一件事（这里是 keys 的字节与顺序），平台归一交给
 * `send-normalize.test.ts` 对**两个分支各测一遍**。钉住更诚实：期望值在任何机器上都是同一个字符串。
 *
 * vitest 默认按文件隔离 worker，所以这次改写不会外溢到别的用例文件；`finally` 一定还原
 * （用例里抛错也一样）。
 */
export async function withPlatform<T>(platform: NodeJS.Platform, run: () => Promise<T>): Promise<T> {
  const original = process.platform
  Object.defineProperty(process, 'platform', { value: platform, configurable: true })
  try {
    return await run()
  } finally {
    Object.defineProperty(process, 'platform', { value: original, configurable: true })
  }
}
