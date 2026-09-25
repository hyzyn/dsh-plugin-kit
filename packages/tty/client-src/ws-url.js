/**
 * @hyzyn/dsh-tty — 终端 WebSocket 地址的推导规则（纯逻辑）。
 *
 * 为什么单独成文件（2026-09-24）：规则原先直接写在 `client-src/index.js` 的
 * `wsUrl()` 里、且**只用 `location`** 拼地址，在桌面版（DeepSeek Harness Desktop）
 * 下算错。桌面渲染器的 origin 是 Electron 自定义协议 `dsh-app://app`（宿主以
 * `protocol.handle("dsh-app", …)` 把页面请求转发到真实宿主 origin），于是拼出
 * `ws://app/api/dsh-tty/ws`：
 *
 *   ① `app` 不是可解析主机名，连接必然失败；
 *   ② 就算能解析，桌面壳的 cookie/Origin 拦截只覆盖 `ws://127.0.0.1/*`
 *      （`app.asar/lib/main.js` 的 `onBeforeSendHeaders`），这条 URL 落在范围外，
 *      拿不到宿主 cookie。
 *
 * 症状很有迷惑性：面板能正常打开、设置卡片/SSH 连接簿/配置读写全好（那些都是**相对
 * 路径** HTTP，经 `dsh-app://app` 的 `protocol.handle` 转发到宿主），只有终端连不上
 * ——状态条停在「连接中…」→「连接断开 — 自动重连中」按 1s→5s 退避无限重试。
 *
 * 正确的来源是宿主注入的 `globalThis.__DSH_TRANSPORT__.streamBaseUrl`（桌面 preload
 * 注入真实宿主 origin，如 `http://127.0.0.1:19387`）；核心的 `dsh-client-connection` /
 * `dsh-api-gateway` 也走这一条（`globals.__DSH_TRANSPORT__?.streamBaseUrl ?? document.baseURI`）。
 * 浏览器直连（`dsh web`）下该全局不存在，退回页面自身 baseURI，与旧的 `location.host`
 * 行为**逐字等价**（路径不参与，host 相同）。
 *
 * 抽成纯模块后可直接单测（`test/ws-url.test.ts`），与 `credential-ref.js` /
 * `status-line.js` / `stats-bar.js` 同款；esbuild 打包时按普通本地模块内联，产物形态不变。
 */

/** 宿主注册的终端 upgrade 路由（webServer.registerUpgrade）。 */
export const WS_PATH = '/api/dsh-tty/ws'

/**
 * 由页面地址与宿主传输信息推导终端 WebSocket 的绝对地址。
 *
 * @param pageHref - 页面自身地址（浏览器里传 `document.baseURI`）
 * @param streamBaseUrl - 宿主注入的 `__DSH_TRANSPORT__.streamBaseUrl`；缺省 / 空串时退回页面自身
 * @returns 绝对 `ws://` / `wss://` 地址（`http:` → `ws:`，`https:` → `wss:`）
 */
export function deriveWsUrl(pageHref, streamBaseUrl) {
  const base = new URL(streamBaseUrl ?? pageHref, pageHref)
  const proto = base.protocol === 'https:' ? 'wss:' : 'ws:'
  return proto + '//' + base.host + WS_PATH
}
