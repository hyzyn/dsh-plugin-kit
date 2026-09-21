/* eslint-disable */
/**
 * dsh-tty 预览夹具：加载 client.js → 以假 ctx 挂载 → 按 ?scenario= 驱动界面到
 * 指定状态，供 scripts/preview.mjs 截图。仅供开发走查，不随 npm 包发布。
 */
(function () {
  'use strict'

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const waitFor = async (fn, timeout = 3000) => {
    const start = Date.now()
    for (;;) {
      let value
      try {
        value = fn()
      } catch {
        value = null
      }
      if (value) return value
      if (Date.now() - start > timeout) throw new Error('waitFor timeout')
      await sleep(25)
    }
  }
  const q = (sel) => document.querySelector(sel)
  const qa = (sel) => [...document.querySelectorAll(sel)]

  /* ---------- 挂载插件 ---------- */
  // 场景之间共用同一个页面 target，必须先清掉上一个场景的标签持久化
  try {
    sessionStorage.clear()
    localStorage.clear()
  } catch {
    /* file:// 下存储可能不可用 */
  }
  const mod = window.__ttyModule
  if (!mod) throw new Error('client.js 未注册到 __ModuleLoader__')
  const requireShim = (name) => {
    if (name === 'react') return window.React
    if (name === 'react/jsx-runtime') return window.__jsxRuntime
    // dsh-docker 的客户端用 createRoot 挂面板（React 18 的 react-dom/client 入口）
    if (name === 'react-dom') return window.ReactDOM
    if (name === 'react-dom/client') return { createRoot: window.ReactDOM.createRoot, hydrateRoot: window.ReactDOM.hydrateRoot }
    throw new Error('预览夹具未提供模块：' + name)
  }
  const exports = mod.factory(requireShim)
  const cards = []
  /** 客户端服务表：tty 提供 ttyConnbar，夹具里也允许注册消费方（见 connbarActions）。 */
  const services = new Map()
  const ctx = {
    sessions: {
      list: {
        // 按**真实宿主**的形状桩（DSH 0.1.6）：会话列表快照没有 current，选中项靠
        // retainedBy.mainView 表达——夹具要是照旧塞个 current，就又把新读法的 bug 遮住了
        getSnapshot: () => ({
          ids: ['s1'],
          byId: { s1: { id: 's1', cwd: window.__PREVIEW_CWD || '/home/user/project', retainedBy: { mainView: 1 } } },
          phase: 'ready',
          subagentsByParent: {},
          jobsBySession: {},
        }),
      },
    },
    slots: {
      inject: (_name, cb) => cb(),
      register: (spec, Component) => {
        cards.push({ spec, Component })
        return () => {}
      },
    },
    // cordis 服务面（tty 客户端 0.13.0 起用 ctx.provide 暴露连接栏注册点）
    provide: (name, value) => {
      services.set(name, value)
      return () => services.delete(name)
    },
    get: (name) => services.get(name),
    inject: (names, cb) => {
      // 与真实 cordis 一致：依赖里有任何一个服务不存在时**不触发**回调，而不是塞一堆
      // undefined 进去。塞 undefined 的后果是消费方（如 dsh-docker 的 sidebarRight 那一支）
      // 在回调里直接 `scope.foo.register` 炸掉——一个可选依赖就能让整个预览场景全挂。
      if (names.some((name) => !services.has(name))) return () => {}
      const scope = {}
      for (const name of names) scope[name] = services.get(name)
      cb(scope)
      return () => {}
    },
    effect: (cb) => {
      const dispose = cb()
      return () => {
        if (typeof dispose === 'function') dispose()
      }
    },
    reflect: {
      provide: (name, value) => {
        services.set(name, value)
        return () => services.delete(name)
      },
    },
  }
  // 宿主会话服务也进服务表：docker 那一半是经 ctx.inject(['sessions']) 取的（夹具里
  // ctx.sessions 是直接属性、不走服务表，这里补一份，免得那条 inject 永远等不到依赖）
  services.set('sessions', ctx.sessions)
  exports.apply(ctx)

  /**
   * docker 插件（可选）：与 tty 共用同一个 ctx——tty 已经 ctx.provide 了 ttyConnbar /
   * ttyTerminal，所以 docker 的 ctx.inject 能拿到真实服务。这就是「ttyTerminal.mount
   * 就地嵌入」的端到端联调场景（不是靠 mock 服务自欺）。
   */
  const dockerModule = window.__modules.get('@hyzyn/dsh-docker')
  if (dockerModule) {
    const dockerExports = dockerModule.factory(requireShim)
    dockerExports.apply(ctx)
  }

  /* ---------- 交互助手 ---------- */
  const entry = () => q('[data-dsh-tty-entry]')
  const modal = () => q('.tt_modal')
  const tabs = () => qa('.tt_tab')
  const activeTabEl = () => q('.tt_tab[data-active]')
  const sidOf = (el) => el && el.dataset ? el.dataset.sid : undefined
  const socket = () => window.__mockSockets[window.__mockSockets.length - 1]
  const emit = (msg) => {
    const s = socket()
    if (s) s._deliver(msg)
  }

  const openPanel = async () => {
    await waitFor(() => entry())
    entry().click()
    await waitFor(() => modal())
    await waitFor(() => tabs().length > 0, 4000)
    await sleep(120)
  }
  const clickAdd = async () => {
    q('.tt_tabAdd').click()
    await waitFor(() => q('.tt_addMenu'))
    await sleep(80)
  }
  const clickMenuItem = async (label) => {
    const item = await waitFor(() => qa('.tt_addMenuItem').find((el) => el.textContent.includes(label)))
    item.click()
    await sleep(200)
    return item
  }
  /** SFTP 落点断言：卡片在挂载位里（docked）还是退回了居中对话框（modal）。 */
  const sftpSurfaceAssert = () => ({
    docked: q('.tt_dockPaneBody > .tt_sftpCard') !== null || q('.tt_dockPaneBody > .tt_sftpDualCard') !== null,
    modal: q('.tt_sshBackdrop > .tt_sftpCard') !== null || q('.tt_sshBackdrop > .tt_sftpDualCard') !== null,
    cardTitleRowHidden: (() => {
      const row = q('.tt_dockPaneBody .tt_sftpTitleRow')
      return row === null ? null : getComputedStyle(row).display
    })(),
    rows: qa('.tt_sftpRow').length,
    termWidth: Math.round((q('.tt_body') || { getBoundingClientRect: () => ({ width: 0 }) }).getBoundingClientRect().width),
    // 卡片必须完整落在挂载位里（border-box 回归）：右边/底边不溢出，工具栏最右按钮不被裁
    fitsDock: (() => {
      const body = q('.tt_dockPaneBody')
      if (body === null) return null
      const card = q('.tt_dockPaneBody > .tt_sftpCard, .tt_dockPaneBody > .tt_sftpDualCard')
      if (card === null) return null
      const b = body.getBoundingClientRect()
      const c = card.getBoundingClientRect()
      const bar = q('.tt_dockPaneBody .tt_sftpBar')
      return {
        overflowRight: Math.round(c.right - b.right),
        overflowBottom: Math.round(c.bottom - b.bottom),
        actionsFit: bar === null ? null : Math.round(bar.getBoundingClientRect().right) <= Math.round(b.right),
      }
    })(),
  })

  /** 终端里最后一行非空文本（xterm 会把光标所在行渲染成空 div）。 */
  const lastTermRowText = () => {
    const rows = qa('.tt_term .xterm-rows > div')
    for (let i = rows.length - 1; i >= 0; i -= 1) {
      const text = rows[i].textContent.trim()
      if (text !== '') return text
    }
    return null
  }

  /** 终端里第一行非空文本（判断视口有没有跳）。 */
  const firstTermRowText = () => {
    const rows = qa('.tt_term .xterm-rows > div')
    for (let i = 0; i < rows.length; i += 1) {
      const text = rows[i].textContent.trim()
      if (text !== '') return text
    }
    return null
  }

  const feed = (text) => {
    const el = activeTabEl()
    if (el) emit({ t: 'data', sid: sidOf(el), d: text })
  }

  const SCENARIOS = {
    /* 单标签本地终端（含服务器状态条：订阅链路必须真的建立起来） */
    async local() {
      await openPanel()
      await waitFor(() => q('.tt_statsBar') !== null)
      // 状态条要等 1s 内的 stats 帧才显示；这里等到它带着内容出现
      await waitFor(() => {
        const bar = q('.tt_statsBar')
        return bar !== null && bar.hidden !== true && /CPU/.test(bar.textContent)
      }, 4000)
      await sleep(200)
      window.__previewAssert = async () => {
        const bar = q('.tt_statsBar')
        if (bar === null) return '状态条 DOM 缺失'
        if (bar.hidden === true) return '状态条未显示（stats 订阅链路可能断开）'
        const text = bar.textContent
        if (!/CPU/.test(text) || !/内存/.test(text) || !/网络/.test(text)) return '状态条内容不完整：' + text
        /*
         * 订阅时序：客户端**故意**在 spawn 之前就发一次 statsOn（switchTab 早于 spawnTab），
         * 宿主此时还没登记这个 sid，会按「未知 sid」忽略——这是设计里的正常现象，所以
         * 断言不能要求「从没发过未知订阅」。要钉的是 ready 之后**重新对齐**过：最后一次
         * 订阅必须被接受（否则状态条该出不来），且早期那次不该被重复轰炸。
         */
        const logged = window.__mockLog || []
        const subscriptions = logged.filter((entry) => entry === 'in:statsOn' || entry === 'in:statsOn(unknown)')
        if (subscriptions[subscriptions.length - 1] === 'in:statsOn(unknown)') return '最后一次 statsOn 仍被宿主按未知 sid 忽略（ready 后没有重新对齐）'
        const ignored = logged.filter((entry) => entry === 'in:statsOn(unknown)').length
        if (ignored > 1) return 'spawn 前的 statsOn 重复发送（' + String(ignored) + ' 次未对齐订阅）'
        return null
      }
    },
    /* 服务器状态条关闭（statsEnabled=false）：整条收起，WS 也不该收到订阅 */
    async 'stats-off'() {
      // 必须在开面板（拉配置）之前改：客户端按 config 决定订阅与显隐
      window.__PREVIEW_CONFIG.statsEnabled = false
      await openPanel()
      await waitFor(() => tabs().length === 1)
      await sleep(400)
      window.__previewAssert = async () => {
        const bar = q('.tt_statsBar')
        if (bar === null) return '服务器状态条 DOM 缺失'
        if (bar.hidden !== true) return 'statsEnabled=false 时状态条仍然可见'
        // 隐藏必须是「真的不占位」：author 的 display:flex 会压过 UA 的
        // [hidden]{display:none}，一旦仍占 24px 就会盖住终端第一行（界面变形）
        const height = bar.getBoundingClientRect().height
        if (height > 0) return '隐藏状态下状态条仍占位（height=' + String(height) + '）'
        if (document.querySelector('.tt_body[data-stats]') !== null) return '隐藏状态下仍给终端加了状态条偏移'
        const logged = window.__mockLog || []
        if (logged.some((entry) => entry === 'in:statsOn')) return '关闭状态下仍发送了 statsOn'
        return null
      }
    },
    /* 宿主采样慢（D50）：stats 帧 4 秒才来一次——旧代码的 3s 陈旧窗口会让状态条
       每秒整条收起再出现（用户报的「瞬间消失又出现」）。这里连续采样 9 秒（跨两个
       帧间隔），要求状态条**一次都没有**隐藏过。 */
    async 'stats-slow'() {
      window.__PREVIEW_STATS_INTERVAL_MS = 4000
      await openPanel()
      await waitFor(() => tabs().length === 1)
      // 首帧立即推 → 状态条先出来
      await waitFor(() => {
        const bar = q('.tt_statsBar')
        return bar !== null && bar.hidden !== true && /CPU/.test(bar.textContent)
      }, 4000)
      const visible = []
      const timer = setInterval(() => {
        const bar = q('.tt_statsBar')
        visible.push(bar !== null && bar.hidden !== true)
      }, 100)
      await sleep(9000)
      clearInterval(timer)
      window.__previewAssert = async () => {
        const hidden = visible.filter((value) => value !== true).length
        if (hidden > 0) {
          return '4s 一帧时状态条有 ' + String(hidden) + '/' + String(visible.length) + ' 次采样是隐藏的（整条消失又出现）'
        }
        return null
      }
    },
    /* 坏数据兜底：宿主发来的 stats 帧是垃圾（字符串/数组/null/越界值/缺字段），
       面板必须既不抛异常也不出现非法渲染——最多整条隐藏 */
    async 'stats-broken'() {
      window.__PREVIEW_STATS_PAYLOAD = [
        'not-an-object',
        [1, 2, 3],
        null,
        { cpuPct: 'x', cores: -5, memUsed: 1e30, memTotal: 1e30, uptimeSec: Number.MAX_SAFE_INTEGER, tcpConns: -1, tempC: {} },
        {},
        { cpuPct: 12.5, cores: 8, memTotal: 17179869184, memUsed: 9663676416, memPct: 56, uptimeSec: 3600, tcpConns: 12 },
      ]
      await openPanel()
      await waitFor(() => tabs().length === 1)
      await sleep(1800) // 至少走两轮坏帧
      window.__previewAssert = async () => {
        const bar = q('.tt_statsBar')
        if (bar === null) return '状态条 DOM 缺失'
        const text = bar.textContent || ''
        if (/-5|NaN|undefined|Infinity|e\+30|x%/.test(text)) return '坏数据被渲染出来了：' + text
        const height = bar.getBoundingClientRect().height
        if (bar.hidden === true && height > 0) return '隐藏态仍占位（height=' + String(height) + '）'
        if (bar.hidden !== true && height <= 0) return '显示态却没有高度'
        return null
      }
    },
    /* 多标签（含 SSH 标签 → 连接栏；开启 tmux 持久化以展示持久徽标） */
    async multi() {
      window.__PREVIEW_CONFIG.persistence = 'tmux'
      await openPanel()
      await clickAdd()
      await clickMenuItem('prod-web-01')
      await waitFor(() => tabs().length === 2)
      await clickAdd()
      await clickMenuItem('staging-db')
      await waitFor(() => tabs().length === 3)
      await clickAdd()
      await clickMenuItem('本地终端')
      await waitFor(() => tabs().length === 4)
      tabs()[1].click()
      await sleep(250)
      // 切到另一个标签后状态条要跟着走：显示新标签的数据，且偏移与显隐一致
      // （跨标签/跨平台混用时，这里出问题就会表现为终端被顶歪）
      await waitFor(() => {
        const bar = q('.tt_statsBar')
        return bar !== null && bar.hidden !== true && /CPU/.test(bar.textContent)
      }, 4000)
      window.__previewAssert = async () => {
        const bar = q('.tt_statsBar')
        const body = q('.tt_body')
        if (bar === null || body === null) return '状态条/终端容器缺失'
        const shifted = body.dataset.stats !== undefined
        const visible = bar.hidden !== true && bar.getBoundingClientRect().height > 0
        if (visible !== shifted) return '显隐与终端偏移不一致（visible=' + String(visible) + ' shifted=' + String(shifted) + '）'
        return null
      }
    },
    /* 「+」菜单 */
    async menu() {
      await openPanel()
      await clickAdd()
    },
    /* SSH 连接对话框（新建） */
    async ssh() {
      await openPanel()
      await clickAdd()
      await clickMenuItem('SSH 连接…')
      await waitFor(() => q('.tt_sshCard'))
      await sleep(150)
    },
    /* SSH 连接对话框：跑一次「试连」并展示结果（验证状态带不撑动布局） */
    async 'ssh-probe'() {
      await openPanel()
      await clickAdd()
      await clickMenuItem('SSH 连接…')
      await waitFor(() => q('.tt_sshCard'))
      const inputs = qa('.tt_sshCard input')
      inputs[0].value = '192.0.2.10'
      inputs[1].value = '22'
      inputs[2].value = 'root'
      const probeBtn = qa('.tt_sshActions .tt_toolBtn').find((b) => b.textContent.includes('试连'))
      probeBtn.click()
      const resultEl = () => q('.tt_sshProbeResult')
      await waitFor(() => resultEl() && resultEl().textContent !== '' && !resultEl().textContent.includes('测试中'))
      await sleep(250)
    },
    /* SSH 连接对话框（编辑连接簿条目，含 env 选择器） */
    async 'ssh-edit'() {
      await openPanel()
      await clickAdd()
      const rows = await waitFor(() => {
        const r = qa('.tt_addMenuRow')
        return r.length > 0 ? r : null
      })
      const editBtn = rows[1].querySelector('.tt_addMenuEdit[title="编辑连接"]')
      editBtn.click()
      await waitFor(() => q('.tt_sshCard'))
      await sleep(200)
    },
    /* 设置卡片（展开） */
    async settings() {
      const host = document.createElement('div')
      host.id = 'preview-settings'
      host.style.cssText = 'position:fixed;inset:24px 24px 24px 260px;overflow:auto;z-index:2000;background:var(--dsw-alias-bg-base);padding:8px;border-radius:16px'
      document.body.appendChild(host)
      const card = cards[0]
      const root = window.ReactDOM.createRoot(host)
      root.render(window.React.createElement(card.Component))
      await waitFor(() => q('#preview-settings .tt_card'))
      await sleep(80)
      q('#preview-settings .tt_cardHeader').click()
      await waitFor(() => q('#preview-settings .tt_cardBody'))
      await sleep(400)
    },
    /* 端口转发：编辑一条隧道（此前隧道区块零界面回归，D53/D54/D56 就是这么潜伏的） */
    async 'tunnel-edit'() {
      const host = document.createElement('div')
      host.id = 'preview-settings'
      host.style.cssText = 'position:fixed;inset:24px 24px 24px 260px;overflow:auto;z-index:2000;background:var(--dsw-alias-bg-base);padding:8px;border-radius:16px'
      document.body.appendChild(host)
      const root = window.ReactDOM.createRoot(host)
      root.render(window.React.createElement(cards[0].Component))
      await waitFor(() => q('#preview-settings .tt_card'))
      await sleep(80)
      q('#preview-settings .tt_cardHeader').click()
      await waitFor(() => q('#preview-settings .tt_cardBody'))
      await sleep(400)

      const rowOf = (name) => [...document.querySelectorAll('#preview-settings .tt_sshHostRow')]
        .find((r) => (r.querySelector('.tt_sshHostName')?.textContent ?? '').startsWith(name))
      const buttonsIn = (el) => [...el.querySelectorAll('button')]

      // 「编辑」按钮是本次新增的能力：先在第一条隧道行上找到它
      const firstRow = rowOf('staging-pg')
      if (firstRow === undefined) throw new Error('找不到 staging-pg 行（fixture 应有该隧道）')
      const editBtn = buttonsIn(firstRow).find((b) => b.textContent === '编辑')
      if (editBtn === undefined) throw new Error('隧道行没有「编辑」按钮')
      editBtn.click()
      await sleep(150)

      // 把隧道区块滚进视口：截图要能拍到表单本身（设置卡片很长，隧道在下方）
      const scrollTunnelIntoView = () => {
        const anchor = document.querySelector('#preview-settings .tt_segmented') ?? document.querySelector('#preview-settings .tt_tunnelEndpoints')
        if (anchor !== null) anchor.scrollIntoView({ block: 'center' })
      }
      scrollTunnelIntoView()
      await sleep(120)

      // 回填：本地转发那边「127.0.0.1:<端口>」成对呈现，端口输入带 aria-label 标识
      const localPortInput = document.querySelector('#preview-settings [aria-label="本机监听端口"]')
      if (localPortInput === null) throw new Error('本地转发表单没渲染（找不到本机监听端口输入）')
      if (localPortInput.value !== '15432') throw new Error('编辑未回填本地端口：' + String(localPortInput.value))

      // 固定端必须是**静态文本**而不是输入框（宿主硬编码了 127.0.0.1，给个能改的框是骗人）
      const staticEnd = document.querySelector('#preview-settings .tt_tunnelEndpointStatic')
      if (staticEnd === null) throw new Error('固定端没有渲染成静态文本')
      if (staticEnd.textContent !== '127.0.0.1') throw new Error('固定端文本不对：' + String(staticEnd.textContent))
      if (staticEnd.tagName === 'INPUT') throw new Error('固定端是输入框（应为静态文本）')

      // 端点必须是成对呈现（host+port 同组），且中间有方向箭头
      const endpointCount = document.querySelectorAll('#preview-settings .tt_tunnelEndpoint').length
      if (endpointCount !== 2) throw new Error('端点组数不为 2：' + String(endpointCount))
      if (document.querySelector('#preview-settings .tt_tunnelArrow') === null) throw new Error('缺少方向箭头')

      // 分段控件：本地/远程可切换，当前项高亮
      const segBtns = [...document.querySelectorAll('#preview-settings .tt_segmentedBtn')]
      if (segBtns.length !== 2) throw new Error('分段控件按钮数不为 2：' + String(segBtns.length))
      const activeSeg = segBtns.filter((b) => b.hasAttribute('data-active'))
      if (activeSeg.length !== 1) throw new Error('分段控件没有唯一高亮项：' + String(activeSeg.length))

      // 切到「远程 -R」：固定端应换到**右侧**（本机拨号），左侧变成可填的服务器侧监听地址
      // ——两个方向的固定端不同，这正是不能照搬单一形状的原因
      segBtns.find((b) => (b.textContent ?? '').includes('远程')).click()
      await sleep(200)
      scrollTunnelIntoView()
      const remoteEndpoints = [...document.querySelectorAll('#preview-settings .tt_tunnelEndpoint')]
      if (remoteEndpoints.length !== 2) throw new Error('远程方向端点组数不为 2：' + String(remoteEndpoints.length))
      const hasStaticInFirst = remoteEndpoints[0].querySelector('.tt_tunnelEndpointStatic') !== null
      const hasStaticInSecond = remoteEndpoints[1].querySelector('.tt_tunnelEndpointStatic') !== null
      if (hasStaticInFirst || !hasStaticInSecond) {
        throw new Error('远程方向的固定端没有换到右侧（左静态=' + String(hasStaticInFirst) + ' 右静态=' + String(hasStaticInSecond) + '）')
      }
      // 箭头在远程方向应翻转（CSS 旋转 180°，data-direction 决定）
      const arrow = document.querySelector('#preview-settings .tt_tunnelArrow')
      if (arrow === null || arrow.getAttribute('data-direction') !== 'remote') {
        throw new Error('远程方向的箭头没有翻转标记')
      }
      // 切回本地 -L，后续断言按本地方向的期望继续
      segBtns.find((b) => (b.textContent ?? '').includes('本地')).click()
      await sleep(200)
      scrollTunnelIntoView()
      await sleep(80)

      /*
       * 窄容器下的排布：端点用 flex-wrap，最怕的是"挤不下也不换行 → 内容溢出到卡片外"。
       * 设置卡片在真实界面里可能只有一栏宽度，所以这里把容器压到 420px 验证：
       * ① 端点该换行（不是硬挤一行）；② 没有任何子元素横向溢出容器。
       */
      {
        const settingsHost = document.querySelector('#preview-settings')
        const originalWidth = settingsHost.style.width
        settingsHost.style.width = '420px'
        await sleep(200)
        const endpointsRow = document.querySelector('#preview-settings .tt_tunnelEndpoints')
        const card = document.querySelector('#preview-settings .tt_card')
        if (endpointsRow !== null && card !== null) {
          const rowRect = endpointsRow.getBoundingClientRect()
          const cardRect = card.getBoundingClientRect()
          if (rowRect.right > cardRect.right + 1) {
            throw new Error('窄容器下端点半点溢出卡片（右边界 ' + rowRect.right.toFixed(0) + ' > 卡片 ' + cardRect.right.toFixed(0) + '）')
          }
          // 两个端点必须真的换行（上下排布），而不是压成一行把内容挤扁
          const groups = [...document.querySelectorAll('#preview-settings .tt_tunnelEndpoint')]
          if (groups.length === 2) {
            const a = groups[0].getBoundingClientRect()
            const b = groups[1].getBoundingClientRect()
            if (Math.abs(a.top - b.top) < 4) {
              throw new Error('窄容器下两个端点没有换行（仍在同一行，会被挤扁）')
            }
          }
        }
        settingsHost.style.width = originalWidth
        await sleep(200)
        scrollTunnelIntoView()
      }

      // 方向切换会重渲表单：DOM 节点可能被替换，重新取一次（别用切换前的引用）
      const localPortInput2 = document.querySelector('#preview-settings [aria-label="本机监听端口"]')
      if (localPortInput2 === null) throw new Error('切回本地后表单没渲染')

      const body = q('#preview-settings .tt_cardBody')
      if (buttonsIn(body).find((b) => b.textContent === '保存修改') === undefined) throw new Error('编辑态没有「保存修改」')
      if (buttonsIn(body).find((b) => b.textContent === '取消') === undefined) throw new Error('编辑态没有「取消」')
      if (buttonsIn(body).find((b) => b.textContent === '添加隧道') !== undefined) {
        throw new Error('编辑态仍显示「添加隧道」（会误加一条而不是改这条）')
      }
      if (document.querySelectorAll('#preview-settings .tt_sshHostRow[data-editing]').length !== 1) {
        throw new Error('正在编辑的行没有唯一标记（data-editing）')
      }

      // 改端口 → 保存：名字必须按规则**重新派生**（`<bookName>-L<localPort>`）。
      //
      // 注意 fixture 里那条叫 `staging-pg`（手写的假名字，不符合派生规则），
      // bookName 是 `staging-db`——所以编辑后新名字是 `staging-db-L15433`。
      // 真实数据里隧道名一律由规则派生（UI 没有"自定义名字"入口），编辑不会改名；
      // 这里恰好顺带钉住了"名字按规则重算"这个语义。
      //
      // 直接 `input.value = x` 对 React 无效：React 在 input 上装了 value 的原生
      // setter，直接赋值后它读到的还是旧值（受控组件状态不更新）。必须先取 prototype
      // 上的原生 setter 赋值、再派发冒泡的 input 事件。harness 里此前没有"往输入框
      // 打字"的场景，这是第一个（`setReactInput` 供后续场景复用）。
      const setReactInput = (el, value) => {
        const desc = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')
        desc.set.call(el, value)
        el.dispatchEvent(new window.Event('input', { bubbles: true }))
      }
      setReactInput(localPortInput2, '15433')
      await sleep(150)
      buttonsIn(body).find((b) => b.textContent === '保存修改').click()
      await sleep(400)

      window.__previewAssert = async () => {
        const problems = []
        const names = [...document.querySelectorAll('#preview-settings .tt_sshHostName')].map((el) => el.textContent ?? '')
        if (!names.some((n) => n.startsWith('staging-db-L15433'))) {
          problems.push('改端口后名字没按规则重新派生：' + names.join(' | '))
        }
        if (names.some((n) => n.startsWith('staging-pg'))) {
          problems.push('旧名字仍在（按原始名定位替换失败）')
        }
        // 另一条隧道不能受影响（编辑只动被编辑的那条）
        if (!names.some((n) => n.startsWith('prod-redis'))) {
          problems.push('编辑波及了别的隧道')
        }
        if (buttonsIn(document.querySelector('#preview-settings .tt_cardBody')).find((b) => b.textContent === '添加隧道') === undefined) {
          problems.push('保存后没有退出编辑态')
        }
        return problems.length > 0 ? problems.join('；') : null
      }
    },
    /* 设置卡片：docker 与 tty 并排（同一张 ul 里），核对两家的观感是否一致 */
    async 'settings-docker'() {
      const host = document.createElement('div')
      host.id = 'preview-settings'
      host.style.cssText = 'position:fixed;inset:24px 24px 24px 260px;overflow:auto;z-index:2000;background:var(--dsw-alias-bg-base);padding:8px;border-radius:16px'
      document.body.appendChild(host)
      const list = document.createElement('ul')
      list.style.cssText = 'display:flex;flex-direction:column;gap:12px;margin:0;padding:0'
      host.appendChild(list)
      const docker = cards.find((c) => c.spec.key === 'docker')
      const tty = cards.find((c) => c.spec.key === 'tty')
      if (docker === undefined) throw new Error('未注册 docker 设置卡片')
      const root = window.ReactDOM.createRoot(list)
      root.render(window.React.createElement(window.React.Fragment, null,
        window.React.createElement(tty.Component),
        window.React.createElement(docker.Component),
      ))
      await waitFor(() => q('.dk_settingsCard'), 3000)
      q('.tt_cardHeader').click()
      await sleep(300)
      q('.dk_settingsHead').click()
      await waitFor(() => q('.dk_settingsBody'), 4000)
      await sleep(600)
      const box = (sel) => {
        const el = q(sel)
        if (el === null) return null
        const cs = getComputedStyle(el)
        return { radius: cs.borderRadius, border: cs.borderColor, bg: cs.backgroundColor, pad: cs.padding, w: Math.round(el.getBoundingClientRect().width) }
      }
      window.__previewAssert = {
        dockerCard: box('.dk_settingsCard'),
        ttyCard: box('.tt_card'),
        dockerName: getComputedStyle(q('.dk_settingsName')).fontSize + '/' + getComputedStyle(q('.dk_settingsName')).fontWeight,
        ttyName: getComputedStyle(q('.tt_cardName')).fontSize + '/' + getComputedStyle(q('.tt_cardName')).fontWeight,
        dockerDesc: getComputedStyle(q('.dk_settingsDesc')).fontSize,
        ttyDesc: getComputedStyle(q('.tt_cardDescription')).fontSize,
      }
    },
    /* SFTP 单窗体（0.16.0 起挂进右侧挂载位，终端保持可见） */
    async sftp() {
      await openPanel()
      await clickAdd()
      await clickMenuItem('prod-web-01')
      await waitFor(() => tabs().length === 2)
      await sleep(200)
      const sftpBtn = qa('.tt_connAct').find((b) => b.textContent.includes('SFTP'))
      sftpBtn.click()
      await waitFor(() => q('.tt_sftpCard'))
      await waitFor(() => qa('.tt_sftpRow').length > 1)
      await sleep(250)
      window.__previewAssert = sftpSurfaceAssert()
    },
    /* SFTP 双栏（同样挂进挂载位，初始给到面板宽度的 62%） */
    async 'sftp-dual'() {
      // 双栏风格由 config.sftpStyle 决定，必须在开面板（拉配置）之前改
      window.__PREVIEW_CONFIG.sftpStyle = 'dual'
      await openPanel()
      await clickAdd()
      await clickMenuItem('prod-web-01')
      await waitFor(() => tabs().length === 2)
      await sleep(200)
      const sftpBtn = qa('.tt_connAct').find((b) => b.textContent.includes('SFTP'))
      sftpBtn.click()
      await waitFor(() => q('.tt_sftpDualCard'))
      await waitFor(() => qa('.tt_sftpRow').length > 2)
      await sleep(250)
      window.__previewAssert = sftpSurfaceAssert()
    },
    /* 挂载位跟着标签切（0.18.4）
       复现：标签 A（prod-web-01）开 SFTP 文件浏览 → 切到标签 B（staging-db）→ 面板
       此前**没跟着切**：标题仍是 A、底下文件列表是 A 那台主机的，而活动标签是 B。
       同一 bug 也砸中 dsh-docker 挂进来的容器面板。修复=挂载位记归属标签，切换时收起
       不属于当前标签的那块（收起 ≠ 关掉：DOM / 在途传输保活）；连带修掉「A 收起的面板
       把 B 的『SFTP』按钮堵成哑按钮」。 */
    async 'dock-pane-tab'() {
      const dockState = () => {
        const el = q('.tt_dockPane')
        const body = q('.tt_body')
        if (el === null) return { present: false, hidden: null, display: null, width: 0, height: 0, rows: 0, title: '', termWidth: 0, termHeight: 0 }
        return {
          present: true,
          hidden: el.dataset.dockHidden === '1',
          display: getComputedStyle(el).display,
          width: Math.round(el.getBoundingClientRect().width),
          height: Math.round(el.getBoundingClientRect().height),
          rows: qa('.tt_dockPaneBody .tt_sftpRow').length,
          title: q('.tt_dockPaneTitle') === null ? '' : q('.tt_dockPaneTitle').textContent,
          // 挂载位在下方占高度、在右侧占宽度：收起后终端该拿回对应的那一轴
          termWidth: body === null ? 0 : Math.round(body.getBoundingClientRect().width),
          termHeight: body === null ? 0 : Math.round(body.getBoundingClientRect().height),
        }
      }
      const sftpButton = () => {
        const btn = qa('.tt_connAct').find((b) => b.textContent.includes('SFTP'))
        if (btn === undefined) throw new Error('连接栏没有「SFTP」按钮')
        return btn
      }

      await openPanel()
      await clickAdd()
      await clickMenuItem('prod-web-01')
      await waitFor(() => tabs().length === 2)
      await clickAdd()
      await clickMenuItem('staging-db')
      await waitFor(() => tabs().length === 3)
      await sleep(250)

      // A = prod-web-01（第二个标签）：在它上面开文件浏览
      const tabA = tabs()[1]
      const tabB = tabs()[2]
      tabA.click()
      await sleep(250)
      const sidA = sidOf(tabA)
      sftpButton().click()
      await waitFor(() => q('.tt_dockPaneBody .tt_sftpRow'), 5000)
      await sleep(300)
      const onA = dockState()
      const cardOnA = q('.tt_dockPaneBody > .tt_sftpCard')
      if (cardOnA === null) throw new Error('SFTP 卡片没有挂进挂载位')

      // 切到 B：必须收起（且只是收起——DOM 还在，在途传输不会被掐断）
      tabB.click()
      await sleep(450)
      const onB = dockState()
      const cardAliveAfterSwitch = cardOnA.isConnected === true
      const sidB = sidOf(tabB)

      // 在 B 点「SFTP」：A 收起的面板不该把 B 的入口堵死（旧实现这里是哑按钮）
      sftpButton().click()
      await waitFor(() => {
        const el = q('.tt_dockPane')
        return el !== null && el.dataset.dockHidden !== '1'
      }, 5000)
      await waitFor(() => qa('.tt_dockPaneBody .tt_sftpRow').length > 1, 5000)
      await sleep(300)
      const onBOpened = dockState()
      // 被顶掉的那块（A 的）应当真的收掉了，不留僵尸
      const oldCardGone = cardOnA.isConnected !== true

      window.__previewAssert = () => {
        const problems = []
        if (onA.hidden === true || onA.rows < 1) problems.push('在归属标签上 SFTP 没挂进挂载位：' + JSON.stringify(onA))
        if (onB.hidden !== true) problems.push('切到另一个标签后挂载位没跟着收起：' + JSON.stringify(onB))
        if (onB.display !== 'none') problems.push('收起态不是 display:none（' + String(onB.display) + '）')
        if (onB.height !== 0 || onB.width !== 0) problems.push('收起态仍占位（width=' + String(onB.width) + ' height=' + String(onB.height) + '）')
        if (onB.termHeight <= onA.termHeight && onB.termWidth <= onA.termWidth) {
          problems.push('挂载位收起后终端没有拿回空间（宽 ' + String(onA.termWidth) + '→' + String(onB.termWidth)
            + ' 高 ' + String(onA.termHeight) + '→' + String(onB.termHeight) + '）')
        }
        if (cardAliveAfterSwitch !== true) problems.push('收起时把面板 DOM 摘掉了（在途传输会被打断）')
        if (onBOpened.hidden === true || onBOpened.rows < 1) problems.push('另一个标签上「SFTP」是哑的：' + JSON.stringify(onBOpened))
        if (oldCardGone !== true) problems.push('新面板没把上一块收起（同时挂了两块）')
        return problems.length === 0 ? null : problems.join('；')
      }
      window.__previewAssert.data = { sidA, sidB, onA, onB, onBOpened, cardAliveAfterSwitch, oldCardGone }
    },
    /* SFTP 落点断言：挂载位（dock）还是退回了对话框 */
    async 'sftp-fallback'() {
      // 抽屉已被 dsh-docker 的容器面板占用 → SFTP 应退回居中对话框，不能挤掉它
      await SCENARIOS['docker-dock']()
      const before = { dockerPanel: q('.tt_dockPaneBody .dk_panel') !== null }
      const sftpBtn = qa('.tt_connAct').find((b) => b.textContent.includes('SFTP'))
      sftpBtn.click()
      await waitFor(() => q('.tt_sshBackdrop .tt_sftpCard'), 4000)
      await sleep(250)
      window.__previewAssert = {
        ...sftpSurfaceAssert(),
        dockerPanelBefore: before.dockerPanel,
        dockerPanelAfter: q('.tt_dockPaneBody .dk_panel') !== null,
      }
    },
    /* 最小化（状态并入侧边栏入口） */
    async minimized() {
      await openPanel()
      q('.tt_min').click()
      await waitFor(() => q('[data-dsh-tty-entry][data-minimized]'))
      await sleep(150)
    },
    /* 会话退出遮罩 */
    async exited() {
      await openPanel()
      const el = activeTabEl()
      emit({ t: 'exit', sid: sidOf(el), code: 0 })
      await sleep(200)
    },
    /* 连接错误遮罩 */
    async error() {
      await openPanel()
      const el = activeTabEl()
      emit({ t: 'error', sid: sidOf(el), m: 'SSH 认证失败：Permission denied (publickey)' })
      await sleep(200)
    },
    /* 隧道状态弹层 */
    async tunnel() {
      await openPanel()
      await clickAdd()
      await clickMenuItem('staging-db')
      await waitFor(() => tabs().length === 2)
      await sleep(200)
      const btn = qa('.tt_connAct').find((b) => b.textContent.includes('隧道'))
      if (btn) btn.click()
      await waitFor(() => q('.tt_tunnelPop'))
      await sleep(300)
    },
    /*
     * 连接栏「⋯」更多（没有启用隧道的连接）。
     *
     * 这条路径此前**完全不可见**：隧道入口只在 `count > 0` 时出现，没配隧道的连接在界面上
     * 没有任何线索能发现"这里可以配端口转发"。现在没隧道时收进「⋯」——既有发现路径、
     * 又不占常驻宽度（连接栏宽度优先给标签条）。
     */
    async 'connbar-more'() {
      await openPanel()
      // bare-host 在 fixture 里刻意没有任何隧道
      await clickAdd()
      await clickMenuItem('bare-host')
      await waitFor(() => tabs().length === 2)
      await sleep(300)

      const acts = qa('.tt_connAct')
      // 没有隧道 ⇒ 不该出现常驻「隧道 N」按钮
      if (acts.some((b) => b.textContent.includes('隧道'))) {
        throw new Error('没有隧道的连接却出现了常驻「隧道」按钮')
      }
      const more = acts.find((b) => b.textContent.includes('更多'))
      if (more === undefined) throw new Error('没有隧道的连接缺少「⋯ 更多」入口')
      more.click()
      await waitFor(() => q('.tt_connMore'))
      await sleep(250)

      // 闭环：菜单项必须真的可点、并给出可执行的信息（该连接没有启用隧道 + 去哪配）
      const item = qa('.tt_connMore .tt_addMenuItem').find((el) => el.textContent.includes('端口转发'))
      if (item === undefined) throw new Error('「⋯」菜单里没有端口转发项')
      item.click()
      await waitFor(() => q('.tt_tunnelPop'))
      await sleep(300)
      window.__previewAssert = async () => {
        const pop = q('.tt_tunnelPop')
        if (pop === null) return '点击菜单项后没有打开隧道弹层'
        const text = pop.textContent ?? ''
        if (!text.includes('暂无启用')) return '弹层没有说明「该连接暂无启用的隧道」：' + text
        if (!text.includes('插件配置') && !text.includes('设置')) return '弹层没有告诉用户去哪配置'
        return null
      }
    },
    /* 搜索框展开 */
    async search() {
      await openPanel()
      q('[data-act=search]').click()
      await sleep(120)
      q('.tt_searchInput').value = 'client.js'
      await sleep(80)
    },
    /* 嵌入终端：ttyTerminal.mount 挂到一块普通 div（面板不开，冷启动连接） */
    async embed() {
      const host = document.createElement('div')
      host.id = 'preview-embed'
      host.style.cssText = 'position:fixed;left:120px;top:120px;width:840px;height:420px;z-index:3000;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;overflow:hidden;background:#0b0e14'
      document.body.appendChild(host)
      const terminal = services.get('ttyTerminal')
      if (terminal === undefined) throw new Error('ttyTerminal 服务不存在')
      window.__embedDispose = terminal.mount(host, { command: 'docker exec -it app-web-1 sh', label: 'app-web-1 · exec' })
      await waitFor(() => q('#preview-embed .xterm'), 4000)
      await sleep(700)
    },
    /* 共存：先挂嵌入终端，再开/关 tty 面板 —— 嵌入会话必须活着 */
    async 'embed-panel'() {
      await SCENARIOS.embed()
      await openPanel()
      await sleep(400)
      q('.tt_close').click()
      await sleep(500)
      const frames = (window.__mockLog || []).join(' ')
      window.__previewAssert = {
        embedAlive: q('#preview-embed .xterm') !== null,
        killFrames: (frames.match(/in:kill/g) || []).length,
        socketOpen: window.__mockSockets.some((s) => s.readyState === 1),
      }
    },
    /* docker 面板（列表视图）：看容器卡片与动作条分组 */
    async 'docker-panel'() {
      const entry = await waitFor(() => q('[data-dsh-docker-entry]'), 4000)
      entry.click()
      await waitFor(() => q('.dk_panel'), 5000)
      await waitFor(() => qa('.dk_card').length >= 4, 5000)
      await sleep(350)
    },
    /* docker 面板（允许变更）：动作条右组可用的样子 */
    async 'docker-panel-rw'() {
      window.__PREVIEW_DOCKER_CONFIG.allowMutations = true
      await SCENARIOS['docker-panel']()
    },
    /* docker 面板 → 卡片「终端」→ 抽屉里的嵌入式终端 */
    async 'docker-exec'() {
      const entry = await waitFor(() => q('[data-dsh-docker-entry]'), 4000)
      entry.click()
      await waitFor(() => q('.dk_panel'), 5000)
      const card = await waitFor(() => qa('.dk_card')[0], 5000)
      // 卡片动作条第一个图标按钮就是「终端」（docker exec -it）
      card.querySelector('.dk_iconBtn').click()
      await waitFor(() => q('.dk_drawer'), 4000)
      await waitFor(() => q('.dk_drawerBody .xterm'), 4000)
      await sleep(700)
    },
    /* docker：终端抽屉 + 日志页共存，折叠只隐藏不结束会话（0.2.0 回归） */
    async 'docker-exec-logs'() {
      await SCENARIOS['docker-exec']()
      // 抽屉开着的同时进日志页：两边都得活着
      qa('.dk_card')[0].querySelectorAll('.dk_iconBtn')[1].click()
      await waitFor(() => q('.dk_logs'), 4000)
      await waitFor(() => q('.dk_drawerBody .xterm'), 4000)
      await sleep(300)
      const fold = await waitFor(() => q('.dk_drawerFold'), 3000)
      fold.click()
      await waitFor(() => q('.dk_drawer[data-collapsed="1"]'), 3000)
      await sleep(250)
      const termAliveWhenCollapsed = q('.dk_drawerBody .xterm') !== null
      const collapsedHeight = Math.round(q('.dk_drawer').getBoundingClientRect().height)
      fold.click()
      await waitFor(() => !q('.dk_drawer[data-collapsed="1"]'), 3000)
      await sleep(300)
      window.__previewAssert = {
        termAliveWhenCollapsed,
        collapsedHeight,
        expandedHeight: Math.round(q('.dk_drawer').getBoundingClientRect().height),
        logLines: document.querySelectorAll('.dk_logLine').length,
        sockets: window.__mockSockets.length,
      }
    },
    /* 右侧挂载位（ttyPanel.mountPane）：骨架 + 终端共存 */
    async 'dock-pane'() {
      await openPanel()
      const service = services.get('ttyPanel')
      if (service === undefined) throw new Error('ttyPanel 服务不存在')
      const pane = service.mountPane({ title: '演示侧栏', hint: 'ttyPanel v1', size: 420 })
      pane.element.innerHTML = '<div style="padding:16px;color:var(--tt-label-2);font-size:13px;line-height:1.8">'
        + '这块由消费插件自己 render（dsh-docker 的容器面板就走这里）。<br>'
        + '拖左边缘可调宽，标题栏右侧箭头可折叠，终端始终可见可用。</div>'
      await waitFor(() => q('.tt_dockPane'), 3000)
      await sleep(300)
      window.__previewAssert = {
        width: Math.round(q('.tt_dockPane').getBoundingClientRect().width),
        collapsed: pane.isCollapsed(),
        termVisible: q('.tt_term') !== null,
      }
    },
    /* 底部挂载位 + 终端重排：缩高度后视口必须钉在底部（输出不被顶上去） */
    async 'dock-pane-bottom'() {
      await openPanel()
      const el = tabs()[0]
      const sid = sidOf(el)
      let text = ''
      for (let i = 1; i <= 200; i += 1) text += 'line-' + i + '\r\n'
      text += 'END-OF-OUTPUT\r\n'
      emit({ t: 'data', sid, d: text })
      await sleep(400)
      const before = lastTermRowText()
      const rowsBefore = qa('.tt_term .xterm-rows > div').length
      const pane = services.get('ttyPanel').mountPane({ title: '演示底部面板', hint: 'side=bottom', side: 'bottom', size: 320 })
      pane.element.innerHTML = '<div style="padding:12px;color:var(--tt-label-2);font-size:13px">底部面板（等同 SFTP 落点）</div>'
      await waitFor(() => q('.tt_dockPane[data-side="bottom"]'), 3000)
      await sleep(600)
      const phaseA = {
        rowsAfter: qa('.tt_term .xterm-rows > div').length,
        after: lastTermRowText(),
        pinnedToBottom: lastTermRowText() === 'END-OF-OUTPUT',
        viewportAtBottom: (() => {
          const el2 = q('.tt_term .xterm-viewport')
          return el2 === null ? null : el2.scrollTop + el2.clientHeight >= el2.scrollHeight - 2
        })(),
      }
      // B) 翻在历史里时再改一次高度（折叠再展开）：视口停在原处，不该跳到别处
      const vp = q('.tt_term .xterm-viewport')
      vp.scrollTop = 0
      await sleep(250)
      const historyBefore = firstTermRowText()
      q('.tt_dockPaneFold').click()
      await sleep(350)
      q('.tt_dockPaneFold').click()
      await sleep(550)
      const historyAfter = firstTermRowText()
      window.__previewAssert = {
        before,
        rowsBefore,
        // A) 贴着底部开面板：最新一行必须还在视口里
        ...phaseA,
        // B) 翻在历史里改高度：视口锁在同几行
        historyBefore,
        historyAfter,
        historyStable: historyBefore === historyAfter,
        bodyH: Math.round(q('.tt_body').getBoundingClientRect().height),
        screenH: Math.round(q('.tt_term .xterm-screen').getBoundingClientRect().height),
        termH: Math.round(q('.tt_term').getBoundingClientRect().height),
      }
    },
    /* docker 面板挂进 tty 右侧 dock（连接栏「容器」→ 不盖住终端，0.16.0 端到端） */
    async 'docker-dock'() {
      await openPanel()
      await clickAdd()
      await clickMenuItem('prod-web-01')
      await waitFor(() => tabs().length === 2)
      await sleep(250)
      const btn = qa('.tt_connAct').find((b) => b.textContent.includes('容器'))
      if (btn === undefined) throw new Error('连接栏没有「容器」按钮')
      btn.click()
      await waitFor(() => q('.tt_dockPane'), 5000)
      await waitFor(() => qa('.tt_dockPaneBody .dk_card').length >= 3, 5000)
      await sleep(400)
      const before = {
        modalWidth: Math.round(q('.tt_modal').getBoundingClientRect().width),
        bodyWidth: Math.round(q('.tt_body').getBoundingClientRect().width),
        paneWidth: Math.round(q('.tt_dockPane').getBoundingClientRect().width),
      }
      // 折叠 → 终端拿回宽度；展开 → 恢复
      q('.tt_dockPaneFold').click()
      await sleep(300)
      const collapsed = {
        paneWidth: Math.round(q('.tt_dockPane').getBoundingClientRect().width),
        bodyWidth: Math.round(q('.tt_body').getBoundingClientRect().width),
        // 折叠只是 display:none，DOM（和消费插件的 React 树）必须还在
        bodyDisplay: getComputedStyle(q('.tt_dockPaneBody')).display,
      }
      q('.tt_dockPaneFold').click()
      await sleep(300)
      const expanded = { paneWidth: Math.round(q('.tt_dockPane').getBoundingClientRect().width) }
      window.__previewAssert = {
        docked: q('.tt_dockPaneBody .dk_panel[data-dock="1"]') !== null,
        modalBackdrop: q('.dk_backdrop') !== null,
        cards: qa('.tt_dockPaneBody .dk_card').length,
        before,
        collapsed,
        expanded,
        ttTerms: document.querySelectorAll('.tt_term').length,
      }
    },
    /* toast 提醒（并发上限） */
    async toast() {
      // 先开面板拿到首个标签，再进入「已达上限」状态（否则开面板本身就被拦下）
      await openPanel()
      window.__PREVIEW_AT_LIMIT = true
      await clickAdd()
      await clickMenuItem('本地终端')
      await waitFor(() => q('.tt_toast'))
      await sleep(200)
    },
  }

  const name = new URLSearchParams(location.search).get('scenario') || 'local'
  const run = SCENARIOS[name]
  window.__previewState = { name, done: false, error: null }
  const promise = (run ? run() : Promise.reject(new Error('未知场景：' + name)))
    .then(() => {
      window.__previewState.done = true
      return name
    })
    .catch((error) => {
      window.__previewState.error = String((error && error.message) || error)
      window.__previewState.done = true
      throw error
    })
  window.__previewDiag = () => {
    const rect = (sel) => {
      const el = document.querySelector(sel)
      if (!el) return null
      const r = el.getBoundingClientRect()
      return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y) }
    }
    return {
      scenario: name,
      modal: rect('.tt_modal'),
      sftp: rect('.tt_sftpCard') || rect('.tt_sftpDualCard'),
      ssh: rect('.tt_sshCard'),
      // 分组标签与状态带：核对「选项」不再重复、试连结果落在定高状态带里
      sshSections: [...document.querySelectorAll('.tt_sshSection')].map((el) => el.textContent),
      sshStatus: (() => {
        const band = document.querySelector('.tt_sshStatus')
        if (!band) return null
        return {
          h: Math.round(band.getBoundingClientRect().height),
          error: band.querySelector('.tt_sshError')?.textContent || '',
          probe: band.querySelector('.tt_sshProbeResult')?.textContent || '',
        }
      })(),
      addMenu: rect('.tt_addMenu'),
      toast: rect('.tt_toast'),
      dock: rect('.tt_dock'),
      tabs: document.querySelectorAll('.tt_tab').length,
      rows: document.querySelectorAll('.tt_sftpRow').length,
      // 终端渲染自检：xterm 是否真的画出了字符
      term: {
        sockets: window.__mockSockets.length,
        frames: (window.__mockLog || []).slice(-10).join(' '),
        xtermEls: document.querySelectorAll('.tt_term .xterm').length,
        canvases: document.querySelectorAll('.tt_term canvas').length,
        rowCount: document.querySelectorAll('.tt_term .xterm-rows > div').length,
        text: (document.querySelector('.tt_term .xterm-rows')?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120),
        screenText: (() => {
          const el = document.querySelector('.tt_term .xterm-screen')
          return el ? el.getBoundingClientRect().width + 'x' + Math.round(el.getBoundingClientRect().height) : null
        })(),
      },
      docker: {
        panel: document.querySelector('.dk_panel') !== null,
        cards: document.querySelectorAll('.dk_card').length,
        // 卡片动作条：分组、间距、配色（用来核对「查看 / 变更」两组的划分）
        actionBar: (() => {
          const bar = document.querySelector('.dk_actionBar')
          if (!bar) return null
          return [...bar.children].map((el) => {
            const box = el.getBoundingClientRect()
            const style = getComputedStyle(el)
            return {
              cls: el.classList.contains('dk_actionBarSep') ? 'SEP' : el.className.replace('dk_iconBtn', 'btn').trim(),
              x: Math.round(box.x),
              w: Math.round(box.width),
              gapBefore: el.previousElementSibling === null ? null : Math.round(box.x - el.previousElementSibling.getBoundingClientRect().right),
              color: style.color,
              disabled: el.disabled === true,
            }
          })
        })(),
        drawer: !!rect('.dk_drawer'),
        drawerTerm: document.querySelector('.dk_drawerBody .xterm') !== null,
        drawerText: (document.querySelector('.dk_drawerBody .xterm-rows')?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80),
      },
      embed: {
        host: document.querySelector('#preview-embed .xterm') !== null,
        text: (document.querySelector('#preview-embed .xterm-rows')?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80),
      },
      assert: window.__previewAssert ?? null,
      bodyChildren: [...document.body.children].map((el) => el.className || el.tagName).slice(0, 12),
      // 样式自检：浏览器实际解析出的规则数（与 tty.css 的规则数比对，能发现
      // 语法错误导致的静默丢弃——esbuild 的 text loader 不解析 CSS）
      cssRules: (() => {
        const sheet = document.getElementById('dsh-tty-style')?.sheet
        if (!sheet) return null
        const count = (rules) => [...rules].reduce((n, r) => n + 1 + (r.cssRules ? count(r.cssRules) : 0), 0)
        try {
          return count(sheet.cssRules)
        } catch {
          return 'blocked'
        }
      })(),
      // 主题自检：确认暗色 token 真的生效（截图颜色异常时先看这里）
      theme: {
        darkAttr: document.body.hasAttribute('data-ds-dark-theme'),
        bgBase: getComputedStyle(document.body).getPropertyValue('--dsw-alias-bg-base').trim(),
        layer2: getComputedStyle(document.body).getPropertyValue('--dsw-alias-bg-layer-2').trim(),
        headerBg: getComputedStyle(document.querySelector('.tt_header') || document.body).backgroundImage.slice(0, 80),
      },
    }
  }
  window.__previewReady = promise
  window.__preview = { sleep, waitFor, openPanel, clickAdd, clickMenuItem, feed, emit, tabs, modal, cards, scenarios: Object.keys(SCENARIOS) }
})()
