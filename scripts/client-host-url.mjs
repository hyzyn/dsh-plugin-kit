/**
 * 客户端半体的「宿主地址来源」规则（纯逻辑，供 `scripts/client-lint.mjs` 调用）。
 *
 * ## 为什么需要这条规则
 *
 * 桌面版（DeepSeek Harness Desktop / Electron）的**页面 origin 不是 HTTP**：UI 由自定义协议
 * `dsh-app://app` 提供，宿主以 `protocol.handle("dsh-app", …)` 把页面请求转发到真实的宿主
 * origin（`http://127.0.0.1:<动态端口>`）。于是「从 `location` 推地址」这类写法在桌面版下
 * 会算出**连不上的地址**，而在浏览器直连（`dsh web`，页面 origin 就是
 * `http://127.0.0.1:<port>`）下完全正常。
 *
 * 实测代价见 `packages/tty/DEFECTS.md` 的 **tty D61**：终端面板的 WS 地址用 `location.host`
 * 拼成了 `ws://app/api/dsh-tty/ws`（`app` 不是可解析主机名，且落在桌面壳 `ws://127.0.0.1/*`
 * 的 cookie/Origin 拦截范围之外）→ 面板能打开、设置卡片全好，只有终端永远连不上。
 *
 * ## 为什么这条检查非有不可（四层防线全漏）
 *
 * | 层 | 为什么漏 |
 * |---|---|
 * | vitest（node env） | `vitest.config.ts` 明文「浏览器半体不在本层测」→ 推导逻辑没被评估 |
 * | 本脚本的 tsc 检查 | 只把 TS2304/2552/2448/2454（名字解析）当失败 → `location.host` 零信号 |
 * | `verify-client-ui.mjs`（CDP） | 驱动 `http://127.0.0.1:3082` 的 test profile → 那里 `location` 就是对的，缺陷**按构造不可见** |
 * | 各包的 preview harness | mock 宿主里是**假 WebSocket**，URL 算成什么都不影响 |
 *
 * 也就是说：没有任何一层用**非 HTTP origin** 评估过客户端推导出的地址。这条规则补的就是它。
 *
 * ## 正确写法
 *
 *   推导基址 = `globalThis.__DSH_TRANSPORT__?.streamBaseUrl ?? document.baseURI`
 *
 * 这是核心（`dsh-client-connection` / `dsh-api-gateway`）自己用的写法；桌面 preload 会注入
 * 真实宿主 origin。浏览器直连下该全局不存在，退回 `document.baseURI`——与 `location.host`
 * **逐字等价**。
 *
 * 凡是要跟宿主建连的地址，**抽成 `client-src/*.js` 纯模块 + vitest 覆盖 `dsh-app://app`
 * 场景**（范例：`packages/tty/client-src/ws-url.js` + `test/ws-url.test.ts`）。规矩比测试重要：
 * 它决定下一个人会不会再踩。
 *
 * ## 刻意不查什么（想放松规则前先读这段）
 *
 * **不查**「硬编码 `http://127.0.0.1` / `http://localhost` 字面量」。看起来该查，但存量里就有
 * 合法用例：`packages/mcp/client.js` 的 `<input placeholder="http://localhost:3000/mcp">`
 * 是给用户看的**输入提示**，不是要请求的地址。一条会对合法代码报错的规则，最后一定会被人
 * 削弱或加豁免，不如一开始就收紧到**不会误报**的范围：
 *
 *   1. 从 `location` 读 `protocol` / `host` / `hostname` / `origin` / `port`（这五个属性除了
 *      拼绝对地址没有别的合法用途；`pathname` / `search` / `hash` 是深链，**不查**）；
 *   2. `ws://` / `wss://` 字符串字面量（客户端半体里没有任何合法理由硬编码它）。
 *
 * 用 TypeScript 的 AST 而不是正则：注释与字符串天然免疫——本文件自己就写了 `ws://app` 和
 * `location.host` 这些字样，正则会把自己拦下。
 */
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import ts from 'typescript'

/** `location` 上「只用于拼绝对地址」的属性；读它们即判定为违规。 */
const ORIGIN_PROPERTIES = new Set(['protocol', 'host', 'hostname', 'origin', 'port'])

/** 给违规点的统一处方。 */
export const HOST_URL_RULE_HINT
  = '改用宿主注入的基址：globalThis.__DSH_TRANSPORT__?.streamBaseUrl ?? document.baseURI'
    + '（桌面版页面 origin 是 dsh-app://app，从 location 推出来的地址连不上宿主；'
    + '范例见 packages/tty/client-src/ws-url.js）'

/**
 * 判断一个表达式是不是「页面位置对象」：`location` 本身，或任意以 `.location` 结尾的链
 * （`document.location` / `window.location` / `self.location` / `top.location` …），
 * 以及它们的 `['location']` 下标形式。
 *
 * 刻意不枚举宿主对象名：多认几个（`foo.location`）在客户端半体里的误报风险极低，
 * 而漏认一个（比如以后有人写 `globalThis.location`）的代价是真 bug 溜过去。
 */
function isLocationLike(node) {
  if (ts.isIdentifier(node)) return node.text === 'location'
  if (ts.isPropertyAccessExpression(node)) return node.name.text === 'location'
  if (ts.isElementAccessExpression(node)) {
    const key = node.argumentExpression
    return ts.isStringLiteral(key) && key.text === 'location'
  }
  return false
}

/** 一个节点是否是「读 location 的 origin 类属性」，是则返回属性名。 */
function originPropertyRead(node) {
  if (ts.isPropertyAccessExpression(node) && ORIGIN_PROPERTIES.has(node.name.text) && isLocationLike(node.expression)) {
    return node.name.text
  }
  if (ts.isElementAccessExpression(node) && isLocationLike(node.expression)) {
    const key = node.argumentExpression
    if (ts.isStringLiteral(key) && ORIGIN_PROPERTIES.has(key.text)) return key.text
  }
  return undefined
}

/** 字面量文本硬编码了 WS 地址？（模板串的头部也算，`` `ws://${host}` `` 同样是硬编码） */
function hardcodedWsLiteral(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node)) {
    return /^wss?:\/\//i.test(node.text)
  }
  return false
}

/**
 * 扫一份客户端半体源码，列出所有「从 location 推宿主地址」与「硬编码 WS 地址」的位置。
 *
 * @param fileName - 文件名，只进返回值（调用方给什么就回什么，便于打印包内相对路径）
 * @param text - 源码全文
 * @returns 违规列表（按出现顺序）；`kind` 区分两类，`snippet` 是被判定的原表达式
 */
export function scanHostUrlUses(fileName, text) {
  const sourceFile = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  const found = []

  const record = (node, kind, detail) => {
    const start = node.getStart(sourceFile)
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(start)
    found.push({
      file: fileName,
      line: line + 1,
      col: character + 1,
      kind,
      detail,
      snippet: node.getText(sourceFile).replace(/\s+/g, ' ').slice(0, 120),
    })
  }

  const visit = (node) => {
    const property = originPropertyRead(node)
    if (property !== undefined) record(node, 'location-origin', 'location.' + property)
    else if (hardcodedWsLiteral(node)) record(node, 'hardcoded-ws', 'string literal')
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)

  return found
}

/** 规则命中的人类可读描述（CLI 与测试共用，避免两处文案漂移）。 */
export function describeHostUrlUse(finding) {
  return finding.kind === 'location-origin'
    ? '从 location 推宿主地址（' + finding.detail + '）：' + finding.snippet
    : '硬编码 WS 地址：' + finding.snippet
}

/**
 * 一个包目录里该被本规则检查的客户端半体文件（绝对路径）。
 *
 * 口径与 `client-lint.mjs` 的 tsc 锚点一致（docker D74）：有 `client-src/` 就查**源码全量**
 * ——tsc 的 program 会经 import 拉进兄弟模块（如 docker 的 `session-target.js`），
 * 规则检查也不能只看入口；只有裸 `client.js` 的包才查构建产物。
 *
 * 收在这里而不是写在 CLI 里：CLI 与测试必须查同一批文件，两处各写一份迟早漂。
 *
 * @param root - 包目录
 * @returns `.js` 文件路径列表（无客户端半体时为空数组）
 */
export function listClientSourceFiles(root) {
  const sourceDir = join(root, 'client-src')
  if (existsSync(sourceDir)) {
    return readdirSync(sourceDir, { recursive: true })
      .map((entry) => join(sourceDir, entry))
      .filter((file) => file.endsWith('.js') && statSync(file).isFile())
  }
  const bare = join(root, 'client.js')
  return existsSync(bare) ? [bare] : []
}
