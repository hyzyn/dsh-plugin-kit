/**
 * @hyzyn/dsh-docker — 就地提权「逐能力 pending 记录」的纯逻辑。
 *
 * 为什么单独成文件（本仓客户端硬规矩 ②，也是 ROADMAP 记过的教训）：离线冒烟的 React 桩把
 * `useState` 冻在初值上、**不执行函数组件体**，状态留在卡片闭包里就等于没有测试入口——
 * 「两个 pending 时取哪几条命令、按什么顺序、怎么连接」这条判定必须能直接驱动。
 *
 * 背景（2026-09-26 设置卡片截图实测）：单槽 state 下点第二个开关会把第一个能力的面板**替换**掉，
 * 前一条命令从界面消失（宿主侧 challenge 仍在 pending），用户于是要在宿主终端**粘贴两次**。
 * 改成逐能力记录后，两块面板同时在场，合并复制把 N 条命令一次交给用户。
 */

/**
 * 能力名 → 该能力的 pending 记录。**数组**（不是 Map）：面板按发起顺序纵向堆叠，
 * 顺序本身就是界面语义（先点的排在上面），而对象键序在删改后不再可靠。
 *
 * 记录形状（与卡片里的 state 逐字对应）：
 * - `{ capability, command, expiresAt }` —— 宿主已回 begin 的 pending
 * - `{ capability, error }`              —— begin 失败 / 抛错
 * - `{ capability }`                     —— begin 在途（还没拿到命令）
 */

/**
 * 增改一条记录，**不动**别的 pending（这是本改造的核心：单槽 → 逐能力）。
 *
 * 幂等：同一能力再次 begin（「重新生成」按钮）**原地替换**那条记录、保留它原来的位置——
 * 重排会让面板在用户眼皮底下跳走。新能力追加到末尾，于是「发起顺序」就是数组顺序。
 */
export function upsertElevationRecord(records, capability, changes) {
  const list = Array.isArray(records) ? records : []
  const index = list.findIndex((item) => item !== null && item !== undefined && item.capability === capability)
  if (index === -1) return [...list, { capability, ...changes }]
  const next = list.slice()
  next[index] = { ...list[index], ...changes }
  return next
}

/** 关掉**一个**能力的面板（面板上的 ✕）：其余 pending 原样留着。 */
export function removeElevationRecord(records, capability) {
  const list = Array.isArray(records) ? records : []
  return list.filter((item) => item === null || item === undefined || item.capability !== capability)
}

/**
 * 收掉「已授权」的留痕：组里一个 pending 都不剩时，整组清空（含留痕）。
 *
 * 为什么必须有：留痕只服务「还有别的能力没解锁」这一个场景。若让它单独活下来，
 * 下一次点开关会出现「一条留痕 + 一条新 pending」的假两组——合并按钮就会为一个**单个**
 * pending 冒出来（正是验收里「单个 pending → 无合并按钮」要挡掉的那种界面）。
 */
export function pruneElevationRecords(records) {
  const list = Array.isArray(records) ? records : []
  const hasPending = list.some((item) => item !== null && item !== undefined && item.granted !== true)
  return hasPending ? list : []
}

/**
 * 某个能力授权到了：标成「已授权」并清掉命令（面板据此消失），**记录本身先留着**。
 *
 * 为什么留痕而不是立刻删掉（本改造最容易做错的一处）：合并按钮的存续跟着「这一组里点过几个
 * 能力」，不是跟着「当前还有几条命令」——
 * - 两个都点过、其中一个先解锁 → 按钮留着把**剩下那条**交给用户（此时把他赶回单条面板里找
 *   命令，等于把刚刚那次「一次粘贴」拆回去）；
 * - 全都解锁 → 组里没有可复制命令，留痕由 `pruneElevationRecords` 收掉、按钮自然消失；
 * - 只点过一个（单个 pending）→ 组里只有一条记录，压根不出按钮（那条命令就在自己的面板里）。
 *
 * **不存在**这个能力时一个字段都不动（返回原数组）：否则「点了一个宿主其实早已授权的开关」
 * 会凭空多出一条空记录，跟着影响合并按钮的判定。
 */
export function markElevationGranted(records, capability) {
  const list = Array.isArray(records) ? records : []
  let touched = false
  const next = list.map((item) => {
    if (item === null || item === undefined || item.capability !== capability) return item
    touched = true
    return {
      capability,
      command: undefined,
      expiresAt: undefined,
      error: undefined,
      granted: true,
    }
  })
  return touched ? pruneElevationRecords(next) : list
}

/**
 * 这条记录**曾经拿到过命令**吗（现在是否还 pending 不问）。
 *
 * 合并按钮的「参与计数」用它：一个能力点过开关、宿主也回过命令，它就参与过这次「一次粘贴」；
 * 只有没拿到过命令的（begin 报错 / 还在途）不参与——它们没有可粘贴的东西。
 */
export function hasElevationCommand(record) {
  return record !== null && record !== undefined
    && (record.granted === true || (typeof record.command === 'string' && record.command !== ''))
}

/**
 * 从逐能力记录里取出「合并复制」要用的命令，**按发起顺序**（= 数组顺序）。
 *
 * 只收真的拿到命令、且**尚未过期**的那些：
 * - 在途（没有 command）与失败（有 error）本来就没有可执行的命令；
 * - 过期的那条再复制过去只会让宿主侧 `probe` 落一个「过期后出现的文件」——用户以为解锁了、
 *   界面却在倒计时归零后不动（最坏的一种困惑），所以过期的从合并里剔掉。
 *
 * 参数 `now` 缺省取当前时刻，便于用例钉住边界（`expiresAt` 恰好等于 now 算过期）。
 */
export function mergeElevationCommands(records, now) {
  const at = now === undefined ? Date.now() : now
  const list = Array.isArray(records) ? records : []
  const commands = []
  for (const item of list) {
    if (item === null || item === undefined) continue
    if (item.granted === true) continue
    if (typeof item.command !== 'string' || item.command === '') continue
    if (Number.isFinite(item.expiresAt) && Number(item.expiresAt) <= at) continue
    commands.push(item.command)
  }
  return commands
}

/**
 * 合并复制的**唯一**连接方式：换行符。
 *
 * 为什么不是 `&&` / `;`（刻意写死在这里，别在调用点各写一遍）：
 * - PowerShell 5.1 不认 `&&`（PS 7 才加），cmd 不认 `;`——用它们连接等于挑平台；
 * - 换行是**四条 shell 都逐行执行**的形态：bash / zsh 逐行跑、PowerShell 与 cmd 粘贴多行
 *   同样逐行跑。命令本身是 `touch '…'` / `powershell …`，两条之间没有依赖，不需要条件连接。
 */
export function joinElevationCommands(commands) {
  const list = Array.isArray(commands) ? commands : []
  return list.filter((command) => typeof command === 'string' && command !== '').join('\n')
}

/**
 * 「复制全部」那一个动作：取命令 + 连接，合成最终要写进剪贴板的字符串。
 *
 * 把两步合成一个纯函数是为了让**验收门槛逐字节可钉**：合并按钮复制的内容必须恰好等于
 * 各条 pending 命令按发起顺序用 `\n` 连接的字节串（多一个换行、少一条、顺序反了都算错）。
 */
export function buildMergedElevationText(records, now) {
  return joinElevationCommands(mergeElevationCommands(records, now))
}

/**
 * 「复制全部」那个主按钮要不要出。
 *
 * 两个条件缺一不可：
 * 1. **组里至少两条记录拿到过命令**（`hasElevationCommand`）——不是「点了几个开关」：
 *    点了开关但 begin 报错、或 begin 还在途的能力**没有**可粘贴的东西，让它们参与计数会出
 *    一个只剩一条命令的「复制全部（1 条）」，那正是本仓最忌讳的「按钮说了但它做的事没意义」；
 * 2. **当前至少还有一条可复制的命令**（两个都解锁 / 都过期之后，按钮必须自己消失——留着它
 *    等于承诺一个不可能发生的解锁）。
 *
 * 为什么已经解锁的那条**仍然计数**（条件 1 看的是「拿到过命令」而不是「现在还 pending」）：
 * 两个能力各点一次之后，其中一个先解锁是常态（两个探测周期独立）。此时剩下那条仍要让用户
 * **一次粘贴**拿到手——按钮消失会把他赶回单条面板里再找一遍，等于把刚做的动作拆回去。
 */
export function shouldOfferMerge(records, now) {
  const list = Array.isArray(records) ? records : []
  const participants = list.filter(hasElevationCommand).length
  return participants >= 2 && buildMergedElevationText(list, now) !== ''
}
