/**
 * `closeModal()` 必须作废跨窗口的持久规格 —— 源码形状守卫（0.40.0）。
 *
 * ## 要防的那次事故
 *
 * 现场：`persistence=tmux` 的 profile，用户把 `startup` 从 `local` 改成 `ask` 之后，重新打开
 * 面板**还是一打开就有一个本机标签**，看起来像「启动行为没生效」。真因在既有的持久化链路：
 *
 *   - 持久标签的规格存在 `localStorage['dsh-tty:persist-specs']`（跨窗口/宿主重启的恢复依据）；
 *   - 规格**只随「标签被主动关闭」淘汰**（`closeTab` → `persistTabs()` → `syncPersistSpecStore`）；
 *   - 而关掉**最后一个**标签 / 点面板 ✕ 走的是 `closeModal()`——那条路不调 `persistTabs()`，
 *     于是规格留了下来：下次打开按规格「恢复」出一个已经结束的会话，`ask` / `book:` 永远
 *     轮不到。
 *
 * 修法就一行：`closeModal()` 里在结束自己的会话之后 `syncPersistSpecStore([])`。这条不变量
 * **没有运行时入口**（要真 DOM + 真 localStorage + 面板关闭流程），所以按本仓「新规矩必须配
 * 守卫」的纪律钉源码形状：判据是纯函数，反例在内存字符串上做（不碰受版本控制的文件）。
 *
 * ## 边界
 *
 * - 只认 `closeModal()` 自己的函数体，**不**扫整份 `client-src/index.js`：`syncPersistSpecStore`
 *   在 `persistTabs()` 里也出现，全局搜会恒真、守不住「这条挂在关面板那条路上」。
 * - 提取不到函数体就**判红**（返回 null），不静默通过——「匹配不到就算过」的闸门比没有更坏。
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const CLIENT_SOURCE = readFileSync(new URL('../client-src/index.js', import.meta.url), 'utf8')
/** 唯一允许的写法：把规格表当成空表重算（`syncPersistSpecStore` 对空表 = 删键）。 */
const REQUIRED_CALL = 'syncPersistSpecStore([])'

/**
 * 取出 `closeModal()` 的函数体原文（从 `function closeModal` 之后到顶格的 `}`）。
 * 认不出形状时返回 `null`，调用方据此判红。
 */
function closeModalBody(source: string): string | null {
  const start = source.indexOf('function closeModal()')
  if (start === -1) return null
  const end = source.indexOf('\n}', start)
  if (end === -1) return null
  return source.slice(start, end)
}

/** 判据：关面板那条路必须把跨窗口持久规格作废（返回违规理由，null = 通过）。 */
function specCleanupViolation(body: string | null): string | null {
  if (body === null) return '找不到 closeModal() 的函数体（改名或换形态时这条要先红）'
  if (!body.includes(REQUIRED_CALL)) return 'closeModal() 没有清掉 localStorage 里的持久规格：关掉的面板会被下次打开「恢复」回来'
  return null
}

describe('closeModal 作废持久规格（0.40.0）', () => {
  it('关面板那条路清了跨窗口持久规格', () => {
    expect(specCleanupViolation(closeModalBody(CLIENT_SOURCE))).toBeNull()
  })

  it('反例：把这一行删掉必须报红（守卫不是恒真）', () => {
    const body = closeModalBody(CLIENT_SOURCE)
    expect(body).not.toBeNull()
    const mutated = String(body).replaceAll(REQUIRED_CALL, '')
    expect(mutated).not.toContain(REQUIRED_CALL)
    expect(specCleanupViolation(mutated)).not.toBeNull()
  })

  it('反例：形似但不等价的写法不算（例如传当前标签列表）', () => {
    const body = String(closeModalBody(CLIENT_SOURCE))
    const mutated = body.replace(REQUIRED_CALL, 'syncPersistSpecStore([...tabs.values()])')
    expect(specCleanupViolation(mutated)).not.toBeNull()
  })

  it('提取不到函数体时判红（改名 / 换形态不许静默通过）', () => {
    expect(specCleanupViolation(closeModalBody('const nothing = 1'))).not.toBeNull()
  })
})
