/**
 * 客户端半体「document 级点击委托必须限定在自己的 DOM 内」规则。
 *
 * ## 这条规则换来的教训（2026-10-03 实测）
 *
 * profile 卡片与 prompt 卡片**同时**挂在设置 →「插件配置」页上（页面由各插件的客户端半体
 * 各自 mount）。两者都把 `click` 监听器绑在 `document` 上（**捕获阶段**，为了在 React 的
 * 合成事件之外拿到整页点击），然后各自用 `closest('[data-action]')` 取动作：
 *
 *   - profile 的处理器有作用域判定（`panelEl.contains(target)`）；
 *   - prompt 的处理器**没有**——它把整页任何 `[data-action]` 元素都当成自己的命令。
 *
 * 于是点 profile 卡片的「删除」（`data-action="delete" data-name="<profile>"`，**没有**
 * `data-id`）时，prompt 的处理器也接走了这一次点击：`id === undefined` → 仍然弹一次
 * `window.confirm('删除 prompt「undefined」')` → `POST /api/dsh-prompt/delete {promptId: undefined}`
 * → 宿主 400 `prompt 不存在: ` → **红字提示**。用户看到的就是「点 profile 删除，报 prompt 不存在」。
 *
 * 跨卡误触不止这一对：静态比对四张绑了 document 的卡片（mcp / profile / prompt / rss）发现
 * `refresh` / `edit` / `editor-save` / `delete` 也在别的卡片上被接走（见
 * `scripts/test/client-click-scope.test.ts` 的对照断言）。所以规则收在这里，而不是只修 prompt。
 *
 * ## 判定口径
 *
 * 只在**同一个处理器函数体**里找 `X.contains(...)`：这正是 profile 的既有写法
 * （`if (!target || !panelEl || !panelEl.contains(target)) return`），也是 rss 修好之后
 * 的写法（自己的卡片根 + 自己的浮层根各判一次）。
 *
 * 为什么**不**接受 `closest('.myRoot')` 当作用域判定：prompt 的 bug 代码里恰好就有
 * `target.closest('[data-action]')`——那是**取动作**，不是判作用域，认它会漏报。
 *
 * 刻意不查什么：不绑 `document` 的处理器（React/`onClick` 那条链路天生有作用域）、
 * 非 `click` 的事件（`keydown` / `input` 等由各自元素绑定），以及注释与字符串里的示例代码。
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/** 给失败者的修法提示（CLI 与单测共用一处措辞）。 */
export const CLICK_SCOPE_RULE_HINT = '在处理器第一行加作用域判定：'
  + '`if (!root || !root.contains(target)) return`。'
  + 'root 就是本插件自己 DOM 的根（卡片宿主；有挂到 document.body 的浮层时，把浮层根也算进来，'
  + '例如 `panelEl.contains(t) || modalEl?.contains(t)`）。'

/**
 * 把注释替换成等长空白（换行保留），其余字节保持原位——这样注册点的匹配不会被注释里的
 * 示例代码骗到，而 `line` / `col` 仍按原文计算。字符串**不**屏蔽：`'click'` 就在字符串里。
 *
 * @param source - 源码文本。
 * @returns 与 `source` 等长、注释被空格覆盖的文本。
 */
function maskComments(source) {
  let out = ''
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i]
    const next = source[i + 1]
    if (ch === '/' && next === '/') {
      const nl = source.indexOf('\n', i)
      const end = nl === -1 ? source.length : nl
      out += ' '.repeat(end - i)
      i = end - 1
      continue
    }
    if (ch === '/' && next === '*') {
      const close = source.indexOf('*/', i + 2)
      const end = close === -1 ? source.length : close + 2
      out += source.slice(i, end).replace(/[^\n]/g, ' ')
      i = end - 1
      continue
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      let j = i + 1
      for (; j < source.length; j += 1) {
        if (source[j] === '\\') { j += 1; continue }
        if (source[j] === ch) break
      }
      out += source.slice(i, Math.min(j + 1, source.length))
      i = Math.min(j, source.length - 1)
      continue
    }
    out += ch
  }
  return out
}

/** 字符串 / 模板串字面量的区间——用来排除「字符串里写着一段代码」这种假注册点。 */
function stringSpans(masked) {
  const spans = []
  for (let i = 0; i < masked.length; i += 1) {
    const ch = masked[i]
    if (ch !== "'" && ch !== '"' && ch !== '`') continue
    const start = i
    for (i += 1; i < masked.length; i += 1) {
      if (masked[i] === '\\') { i += 1; continue }
      if (masked[i] === ch) break
    }
    spans.push([start, i])
  }
  return spans
}

/** 跳过字符串 / 模板串 / 行注释 / 块注释后，取 `source[start]`（开括号）到配对闭括号的子串。 */
function balancedSlice(source, start) {  const open = source[start]
  const close = open === '{' ? '}' : open === '(' ? ')' : open === '[' ? ']' : undefined
  if (close === undefined) return undefined
  let depth = 0
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i]
    const next = source[i + 1]
    if (ch === '/' && next === '/') {
      const nl = source.indexOf('\n', i)
      i = nl === -1 ? source.length : nl
      continue
    }
    if (ch === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2)
      i = end === -1 ? source.length : end + 1
      continue
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      for (let j = i + 1; j < source.length; j += 1) {
        if (source[j] === '\\') { j += 1; continue }
        if (source[j] === ch) { i = j; break }
      }
      continue
    }
    if (ch === open) depth += 1
    else if (ch === close) {
      depth -= 1
      if (depth === 0) return source.slice(start, i + 1)
    }
  }
  return undefined
}

/** 取具名处理器的函数体；`function f()` 与 `const f = (...) => {}` 两种写法都认。 */
function handlerBody(source, name) {
  const declared = new RegExp('function\\s+' + name + '\\s*\\(').exec(source)
  if (declared !== null) {
    const paren = source.indexOf('(', declared.index)
    const params = balancedSlice(source, paren)
    if (params === undefined) return undefined
    const brace = source.indexOf('{', paren + params.length)
    return brace === -1 ? undefined : balancedSlice(source, brace)
  }
  const assigned = new RegExp('(?:const|let|var)\\s+' + name + '\\s*=\\s*').exec(source)
  if (assigned !== null) {
    const rest = source.slice(assigned.index + assigned[0].length)
    const arrow = rest.indexOf('=>')
    if (arrow === -1) return undefined
    const after = assigned.index + assigned[0].length + arrow + 2
    const brace = source.indexOf('{', after)
    return brace === -1 ? undefined : balancedSlice(source, brace)
  }
  return undefined
}

/**
 * 扫一段客户端半体源码里的 document 级点击委托。
 *
 * @param file - 用于报告的文件名（CLI 传仓库根相对路径）。
 * @param source - 源码文本。
 * @returns 每处「绑了 document 点击但处理器里没有 `.contains(` 作用域判定」的
 *   `{ file, line, col, handler }`；合规时为空数组。
 */
export function scanClickScopeUses(file, source) {
  const found = []
  /* 注册点在屏蔽注释后的文本上找（注释里的示例代码不算），但定位与函数体取原文。 */
  const masked = maskComments(source)
  const spans = stringSpans(masked)
  const registration = /document\s*\.\s*addEventListener\s*\(\s*(['"])click\1\s*,\s*([^,)]+)/g
  for (const match of masked.matchAll(registration)) {
    /* 落在字符串字面量里的（有人在字符串里写了一段示例代码）不是注册点。 */
    if (spans.some(([start, end]) => match.index > start && match.index < end)) continue
    const handler = match[2].trim()
    const line = source.slice(0, match.index).split('\n').length
    const col = match.index - source.lastIndexOf('\n', match.index - 1)
    const named = /^[A-Za-z_$][\w$]*$/.test(handler)
    let body
    if (named) {
      body = handlerBody(source, handler)
    } else {
      /* 内联箭头 / 函数表达式：从注册点往后取第一个 `{` 的配对体。 */
      const brace = source.indexOf('{', match.index)
      body = brace === -1 ? undefined : balancedSlice(source, brace)
    }
    if (body === undefined) {
      found.push({ file, line, col, handler, detail: '处理器函数体无法定位（请用 `function 名(...)` 或 `const 名 = (...) => {}`）' })
      continue
    }
    if (!/\.contains\s*\(/.test(body)) found.push({ file, line, col, handler, detail: '处理器里没有 `.contains(` 作用域判定' })
  }
  return found
}

/**
 * 一个包的客户端半体扫描集合与 `client-lint` 同口径：有 `client-src/` 查源码全量，
 * 否则查裸 `client.js`。
 *
 * @param packageDir - 包目录绝对路径。
 * @returns `{ file, source }[]`；没有客户端半体时为空数组。
 */
export function listClickScopeTargets(packageDir) {
  const candidates = ['client-src/index.js', 'client.js']
    .map((rel) => join(packageDir, rel))
    .filter((abs) => existsSync(abs))
  return candidates.map((abs) => ({ file: abs, source: readFileSync(abs, 'utf8') }))
}
