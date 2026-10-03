/**
 * 最小 Chrome DevTools Protocol 客户端（零依赖：Node 22 自带 fetch 与全局 WebSocket）。
 *
 * 由 `scripts/verify-client-ui.mjs`（设置卡片点击级）与 `scripts/verify-rss-opml.mjs`
 * （客户端半体的功能路径）共用 —— 原先那份是内联在 UI 脚本里的，抽出来免得两份驱动
 * 慢慢漂移。
 *
 * **2026-10-03**：`DEFAULT_CHROME` 从一个 macOS 常量改成 `findChrome()` 的结果——原先的常量
 * 让任何非 macOS 调用方（Ubuntu CI 腿、Linux 服务器）必然拿到一个不存在的路径，而症状只有
 * 「CDP 端点没起来」。现在 macOS / Linux / Windows 都有候选表，也可用 `--chrome` /
 * `CHROME_PATH` 点名，见 [chrome-path.mjs](./chrome-path.mjs)。
 */
import { spawn } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { findChrome } from './chrome-path.mjs'

/**
 * 本机找到的浏览器路径（找不到时 `undefined`——`launch()` 会给出可读的报错）。
 *
 * 保留这个导出名是为了兼容既有调用方（`verify-rss-opml.mjs` 等 import 它当默认值）；
 * 语义从「macOS 写死路径」变成「现算的本机浏览器」。
 */
export const DEFAULT_CHROME = findChrome() ?? undefined

export class Chrome {
  /**
   * 起一个 headless Chrome 并等 CDP 端点可用。
   * @param {{ path?: string, port?: number, userDataDir?: string, extraArgs?: string[] }} options
   */
  static async launch({ path = DEFAULT_CHROME, port, userDataDir, extraArgs = [] } = {}) {
    if (path === undefined || path === null || path === '') {
      throw new Error(
        '找不到 Chrome / Chromium：请用 --chrome <path> 或设置 CHROME_PATH 环境变量点名一个可执行文件',
      )
    }
    const dir = userDataDir ?? join(tmpdir(), `dsh-cdp-${String(process.pid)}-${String(port ?? 0)}`)
    rmSync(dir, { recursive: true, force: true })
    mkdirSync(dir, { recursive: true })
    const child = spawn(
      path,
      [
        '--headless=new',
        `--remote-debugging-port=${String(port ?? 0)}`,
        `--user-data-dir=${dir}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-gpu',
        '--disable-extensions',
        '--window-size=1440,900',
        ...extraArgs,
        'about:blank',
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    )
    let stderr = ''
    child.stderr?.on('data', (chunk) => (stderr += String(chunk)))
    // 端口可能由 Chrome 自己挑（--remote-debugging-port=0）：那就从它的 stderr 里读回来。
    // 早先这里只会去轮询 9222，于是「不指定端口」直接失败。
    const deadline = Date.now() + 20_000
    let version
    let actualPort = port === undefined || port === 0 ? undefined : port
    while (Date.now() < deadline) {
      if (actualPort === undefined) {
        const match = /DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//.exec(stderr)
        if (match !== null) actualPort = Number(match[1])
      }
      if (actualPort !== undefined) {
        try {
          version = await (await fetch(`http://127.0.0.1:${String(actualPort)}/json/version`)).json()
          break
        } catch {
          /* 端点还没起来 */
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
    if (version === undefined) {
      try {
        child.kill()
      } catch {
        /* 已退 */
      }
      throw new Error(`Chrome 的 CDP 端点没起来（路径 ${path}）；stderr=${stderr.slice(0, 400)}`)
    }
    return new Chrome(child, actualPort, version, dir)
  }

  constructor(child, port, version, userDataDir) {
    this.child = child
    this.port = port
    this.version = version
    this.userDataDir = userDataDir
    this.nextId = 1
    this.pending = new Map()
    this.listeners = new Map()
    this.socket = undefined
  }

  async attachToPage() {
    const list = await (await fetch(`http://127.0.0.1:${String(this.port)}/json/list`)).json()
    const page = list.find((item) => item.type === 'page') ?? list[0]
    if (page === undefined) throw new Error('没有可附加的 target')
    await this.connect(page.webSocketDebuggerUrl)
    return page
  }

  connect(url) {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url)
      this.socket = socket
      socket.addEventListener('open', () => resolve())
      socket.addEventListener('error', (event) => reject(new Error(`CDP WS error: ${String(event?.message ?? 'unknown')}`)))
      socket.addEventListener('message', (event) => {
        let message
        try {
          message = JSON.parse(String(event.data))
        } catch {
          return
        }
        if (message.id !== undefined) {
          const pending = this.pending.get(message.id)
          if (pending === undefined) return
          this.pending.delete(message.id)
          if (message.error !== undefined) pending.reject(new Error(JSON.stringify(message.error)))
          else pending.resolve(message.result)
          return
        }
        for (const listener of this.listeners.get(message.method) ?? []) listener(message.params)
      })
    })
  }

  send(method, params = {}) {
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.socket.send(JSON.stringify({ id, method, params }))
      setTimeout(() => {
        if (!this.pending.has(id)) return
        this.pending.delete(id)
        reject(new Error(`CDP ${method} 超时`))
      }, 30_000)
    })
  }

  on(method, listener) {
    const list = this.listeners.get(method) ?? []
    list.push(listener)
    this.listeners.set(method, list)
  }

  async evaluate(expression, { awaitPromise = true } = {}) {
    const result = await this.send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true })
    if (result.exceptionDetails !== undefined) {
      throw new Error(`页面里抛错：${result.exceptionDetails.exception?.description ?? JSON.stringify(result.exceptionDetails)}`)
    }
    return result.result?.value
  }

  async screenshot(file) {
    const shot = await this.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    writeFileSync(file, Buffer.from(shot.data, 'base64'))
    return file
  }

  close() {
    try {
      this.socket?.close()
    } catch {
      /* 已关 */
    }
    try {
      this.child.kill()
    } catch {
      /* 已退 */
    }
    // Chrome 可能还在收尾写 profile：清理失败不该影响退出码
    try {
      rmSync(this.userDataDir, { recursive: true, force: true, maxRetries: 3 })
    } catch {
      /* 临时目录交给系统回收 */
    }
  }
}
