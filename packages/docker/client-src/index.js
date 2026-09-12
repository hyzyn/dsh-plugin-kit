/* eslint-disable */
/**
 * @hyzyn/dsh-docker — 浏览器半体：侧边栏「容器」入口 + Docker 面板 + 设置卡片。
 * 由 scripts/build-client.mjs 用 esbuild 打包为单文件 IIFE，经
 * window.__ModuleLoader__.load 注册；React / ReactDOM 取自宿主（共用同一实例）。
 *
 * 能力：
 *   - 目标切换（本机 / SSH 主机，来自宿主 /api/dsh-docker/targets）
 *   - 容器卡片：状态徽章、镜像、compose 项目、端口；搜索 + 状态筛选 + 含已停止
 *   - 详情抽屉：概览（inspect）/ 日志（tail、时间戳、过滤、下载）/ 统计（CPU/内存条）
 *   - 生命周期操作（启动 / 停止 / 重启 / 删除）——默认只读，需在设置里开开关
 *   - 一次性 exec（默认关闭，需在设置里开开关）
 *   - 镜像列表（仓库:标签 / 大小 / 创建时间）
 *   - 设置卡片：目标 CRUD、能力开关、参数、TOFU 主机指纹记录
 *
 * 安全约定：面板只渲染宿主返回的数据；破坏性操作一律二次确认；凭证永不回显
 * （宿主只回 passwordSet / passphraseSet 布尔）。
 */
import dockerCss from './docker.css'

const API = '/api/dsh-docker'
const PANEL_STYLE_ID = 'dsh-docker-style'

/* ================================ 基础 ================================ */

function ensureStyle() {
  if (document.getElementById(PANEL_STYLE_ID) !== null) return
  const styleEl = document.createElement('style')
  styleEl.id = PANEL_STYLE_ID
  styleEl.textContent = dockerCss
  document.head.appendChild(styleEl)
}

async function request(path, init) {
  const response = await fetch(API + path, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  })
  let payload = null
  try {
    payload = await response.json()
  } catch {
    /* 非 JSON 响应 */
  }
  if (!response.ok) {
    const message = payload !== null && typeof payload.error === 'string' ? payload.error : `HTTP ${String(response.status)}`
    throw new Error(message)
  }
  if (payload !== null && payload.ok === false) {
    throw new Error(typeof payload.error === 'string' ? payload.error : '请求失败')
  }
  return payload
}

const api = {
  config: () => request('/config'),
  saveConfig: (patch) => request('/config', { method: 'POST', body: JSON.stringify(patch) }),
  targets: () => request('/targets'),
  probe: (target) => request('/probe', { method: 'POST', body: JSON.stringify({ target }) }),
  containers: (target, all) => request('/containers', { method: 'POST', body: JSON.stringify({ target, all }) }),
  inspect: (target, id) => request('/inspect', { method: 'POST', body: JSON.stringify({ target, id }) }),
  logs: (target, id, options) => request('/logs', { method: 'POST', body: JSON.stringify({ target, id, ...options }) }),
  stats: (target, ids) => request('/stats', { method: 'POST', body: JSON.stringify({ target, ids }) }),
  images: (target) => request('/images', { method: 'POST', body: JSON.stringify({ target }) }),
  action: (target, action, id) => request('/action', { method: 'POST', body: JSON.stringify({ target, action, id }) }),
  exec: (target, id, command, timeoutSec) => request('/exec', { method: 'POST', body: JSON.stringify({ target, id, command, timeoutSec }) }),
}

/* ================================ 格式化 ================================ */

function fmtPercent(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  return value.toFixed(value >= 10 ? 1 : 2) + '%'
}

function portText(port) {
  if (port.hostPort === undefined) return String(port.containerPort) + '/' + port.protocol
  return String(port.hostPort) + '→' + String(port.containerPort) + '/' + port.protocol
}

function portsText(ports) {
  if (!Array.isArray(ports) || ports.length === 0) return '无端口映射'
  // 同一映射会在 IPv4 / IPv6 各出现一次：按「宿主端口→容器端口/协议」文本去重
  const seen = new Set()
  const out = []
  for (const port of ports) {
    const text = portText(port)
    if (seen.has(text)) continue
    seen.add(text)
    out.push(text)
  }
  return out.join('  ')
}

/** docker 的 CreatedAt（`2026-09-09 16:11:22 +0800 CST`）压成 `2026-09-09 16:11`。 */
function fmtCreated(text) {
  const match = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/.exec(text)
  return match === null ? text : match[1] + ' ' + match[2]
}

function stateLabel(state) {
  const map = {
    running: '运行中',
    exited: '已停止',
    created: '已创建',
    paused: '已暂停',
    restarting: '重启中',
    dead: 'dead',
    removing: '删除中',
    unknown: '未知',
  }
  return map[state] ?? state
}

function downloadText(filename, text) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/* ============================ 容器 exec 命令 ============================ */

/**
 * 构造交互式进入容器的命令（单行）。容器名按 docker 命名规则只含
 * `[A-Za-z0-9_.-]`，这里仍加单引号包裹以防意外字符破坏远端 shell。
 */
function buildExecCommand(name) {
  const safe = String(name).replaceAll("'", "'\\''")
  return "docker exec -it '" + safe + "' sh"
}

/* ============================ 目标缓存（连接栏按钮匹配用） ============================ */

/**
 * tty 的连接栏每次渲染都是同步的，所以「当前会话对应哪个 docker 目标」必须
 * 用缓存同步回答。缓存来源：/config（含 targets 定义与 ttyBooks）+ /targets
 * （含已解析的 user@host:port label）；在插件挂载、面板加载、设置保存后刷新，
 * 过期 30s 时由连接栏扩展触发一次后台刷新并请求 tty 重绘。
 */
/** tty 的终端服务（可选注入；null = 不可用，走复制命令兜底）。 */
let terminalApi = null

/**
 * tty 的面板挂载位（可选注入，tty ≥ 0.16 的 ttyPanel 服务；null = 不可用）。
 * 面板开着时把容器面板挂成右侧侧栏，SSH 终端保持可见——从连接栏点「容器」的
 * 主路径；拿不到或面板没开就回到自带 backdrop 的全屏模态。
 */
let panelApi = null

/** tty 的连接栏服务（可选注入；null = 不可用）。闸门切换显隐时用它请求重绘。 */
let connbarApi = null

let configCache = null
let targetsCache = []
let cacheAt = 0

/* ============================ 入口显隐闸门 ============================ */

/**
 * 侧栏入口与连接栏「容器」按钮的显隐：config 确认「插件已禁用」（enabled ===
 * false）后收起，其余情况（含 config 拉取失败）保持显示——只对确认禁用收起，
 * 避免瞬时故障把没禁用用户的入口藏掉。entryGate 由 apply 挂载期间注入
 * （null = 已卸载，迟到的缓存刷新不允许再把入口挂回来）；entryVisible 供
 * 连接栏工厂同步判定，宿主下次渲染连接栏时生效。
 */
let entryGate = null
let entryVisible = false

function setEntryVisible(visible) {
  entryVisible = visible
  if (entryGate !== null) entryGate.set(visible)
}

/** 由 config 推进入口显隐：仅「确认 enabled:false」收起。 */
function syncEntryFromConfig(config) {
  setEntryVisible(!(config !== null && typeof config === 'object' && config.enabled === false))
}

function primeTargetsCache(config) {
  if (config !== null && typeof config === 'object') configCache = config
  cacheAt = Date.now()
  syncEntryFromConfig(configCache)
}

async function refreshTargetsCache() {
  let ok = true
  try {
    const configPayload = await api.config()
    configCache = configPayload.config
    cacheAt = Date.now()
    syncEntryFromConfig(configCache)
  } catch (error) {
    ok = false
    // 挂载时那次请求可能早于宿主就绪（或瞬时失败）：留下可诊断日志；
    // 点击路径还会再兜底拉一次，不会因此永远匹配不上
    console.warn('[dsh-docker] 配置缓存刷新失败：' + (error instanceof Error ? error.message : String(error)))
  }
  try {
    const targetsPayload = await api.targets()
    targetsCache = targetsPayload.targets ?? []
    cacheAt = Date.now()
  } catch (error) {
    // 插件禁用时宿主会拒掉 /targets（403）：禁用状态下这是预期，不算失败也不刷警告；
    // /config 与 /targets 分开拉，禁用态下 config 的成功结果不能被 targets 拖垮
    if (entryVisible) {
      ok = false
      console.warn('[dsh-docker] 目标缓存刷新失败：' + (error instanceof Error ? error.message : String(error)))
    }
  }
  return ok
}

/**
 * 连接栏按钮点击时的目标解析：先用缓存，命中不了就**现场再拉一次**再判定。
 * 否则挂载时那次 fetch 若失败，按钮会一直停在「未配置目标」分支。
 */
async function resolveTargetForSession(spec, bookName) {
  const cached = matchTargetForSession(spec, bookName)
  if (cached !== undefined) return cached
  await refreshTargetsCache()
  return matchTargetForSession(spec, bookName)
}

/**
 * 用 SSH 会话规格匹配已配置的 docker 目标：连接簿条目名优先（会话来自连接簿
 * 时最准确），其次用 /targets 的 label（user@host:port）按 host:port 匹配——
 * 这样即使目标本身是用连接簿配的，也能命中。
 */
function matchTargetForSession(spec, bookName) {
  const targets = (configCache !== null && Array.isArray(configCache.targets)) ? configCache.targets : []
  if (typeof bookName === 'string' && bookName !== '') {
    const byBook = targets.find((item) => item.kind === 'ssh' && item.book === bookName)
    if (byBook !== undefined) return byBook.name
  }
  const host = typeof spec?.host === 'string' ? spec.host : ''
  if (host === '') return undefined
  const rawPort = Number(spec?.port)
  const port = Number.isInteger(rawPort) && rawPort > 0 ? rawPort : 22
  for (const row of targetsCache) {
    if (row.kind !== 'ssh' || typeof row.label !== 'string') continue
    const parsed = /^([^@]+)@(.+?)(?::(\d+))?$/.exec(row.label)
    if (parsed === null) continue
    if (parsed[2] === host && Number(parsed[3] ?? 22) === port) return row.name
  }
  return undefined
}

/* ================================ 图标 ================================ */

const ICON_BOX =
  '<svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 1.8l5.4 3.1v6.2L8 14.2 2.6 11.1V4.9z"/><path d="M2.6 4.9L8 8l5.4-3.1"/><path d="M8 8v6.2"/></svg>'
/** 连接栏按钮用的 13px 版本（与 tty 的 SFTP / 隧道按钮同尺寸）。 */
const ICON_BOX_SM =
  '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 1.8l5.4 3.1v6.2L8 14.2 2.6 11.1V4.9z"/><path d="M2.6 4.9L8 8l5.4-3.1"/><path d="M8 8v6.2"/></svg>'
const ICON_REFRESH =
  '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13.2 8a5.2 5.2 0 1 1-1.5-3.7"/><path d="M13.4 2.2v2.6h-2.6"/></svg>'
const ICON_CLOSE =
  '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M4.5 4.5l7 7"/><path d="M11.5 4.5l-7 7"/></svg>'
const ICON_PLAY =
  '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 3.4l7.4 4.6L5 12.6z"/></svg>'
const ICON_STOP =
  '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4.2" y="4.2" width="7.6" height="7.6" rx="1.2"/></svg>'
const ICON_RESTART =
  '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13.2 8a5.2 5.2 0 1 1-1.5-3.7"/><path d="M13.4 2.2v2.6h-2.6"/></svg>'
const ICON_TRASH =
  '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 4.6h10"/><path d="M6.2 4.6V3.4a.8.8 0 0 1 .8-.8h2a.8.8 0 0 1 .8.8v1.2"/><path d="M4.6 4.6l.6 8a.9.9 0 0 0 .9.8h3.8a.9.9 0 0 0 .9-.8l.6-8"/></svg>'
const ICON_COPY =
  '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5.5" y="5.5" width="8" height="8" rx="1.4"/><path d="M3.5 10.5h-1v-8h8v1"/></svg>'
const ICON_DOWNLOAD =
  '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3v7.2"/><path d="M5 7.4L8 10.4l3-3"/><path d="M3.4 12.8h9.2"/></svg>'
const ICON_WARN =
  '<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 2.6l5.8 10.4H2.2z"/><path d="M8 6.4v3.2"/><path d="M8 11.6h.01"/></svg>'
const ICON_TERM =
  '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 5l3.5 3L3 11"/><path d="M8.5 11H13"/></svg>'
const ICON_LOGS =
  '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M3 4.5h10"/><path d="M3 8h10"/><path d="M3 11.5h6"/></svg>'
const ICON_STATS =
  '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M3.5 12.5v-4"/><path d="M7 12.5v-8"/><path d="M10.5 12.5v-5"/><path d="M13 12.5v-2"/></svg>'
const ICON_BACK =
  '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12.5 8h-9"/><path d="M7 4.5L3.5 8 7 11.5"/></svg>'
const ICON_CHEVRON =
  '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6.5L8 10.5l4-4"/></svg>'

/* ================================ 注册 ================================ */

window.__ModuleLoader__.load({
  id: '@hyzyn/dsh-docker',
  factory: (require) => {
    const React = require('react')
    const { jsx, jsxs } = require('react/jsx-runtime')
    const { createRoot } = require('react-dom/client')

    const { useState, useEffect, useRef, useCallback } = React

    /** 日志高亮：把匹配片段包成 <mark>（React 元素，不走 innerHTML）。 */
    function highlight(text, query, keyPrefix) {
      if (query === '') return text
      const lower = text.toLowerCase()
      const needle = query.toLowerCase()
      const parts = []
      let cursor = 0
      let index = lower.indexOf(needle)
      let count = 0
      while (index >= 0 && count < 500) {
        if (index > cursor) parts.push(text.slice(cursor, index))
        parts.push(jsx('mark', { children: text.slice(index, index + needle.length) }, keyPrefix + '-m' + String(count)))
        cursor = index + needle.length
        count += 1
        index = lower.indexOf(needle, cursor)
      }
      if (cursor < text.length) parts.push(text.slice(cursor))
      return parts
    }

    /* ------------------------------------------------------------------ *
     * 小部件
     * ------------------------------------------------------------------ */

    function Badge(props) {
      const state = props.health === 'unhealthy' ? 'unhealthy' : props.state
      const label = props.health === 'unhealthy' ? '不健康' : stateLabel(props.state)
      return jsx('span', { className: 'dk_badge', 'data-state': state, title: props.status ?? '', children: label })
    }

    function Banner(props) {
      return jsxs('div', {
        className: 'dk_banner',
        'data-kind': props.kind ?? 'error',
        children: [
          jsx('span', { className: 'dk_bannerIcon', dangerouslySetInnerHTML: { __html: ICON_WARN } }, 'icon'),
          jsxs('div', { className: 'dk_bannerBody', children: [
            jsx('div', { children: props.title }),
            props.hint === undefined ? null : jsx('div', { className: 'dk_hint', style: { marginTop: 4 }, children: props.hint }),
          ] }, 'body'),
          props.action === undefined ? null : jsx('div', { className: 'dk_bannerAction', children: props.action }, 'action'),
        ],
      })
    }

    function ConfirmDialog(props) {
      return jsxs('div', {
        className: 'dk_confirmBackdrop',
        onMouseDown: (event) => event.stopPropagation(),
        children: [jsxs('div', {
          className: 'dk_confirm',
          children: [
            jsx('div', { className: 'dk_confirmTitle', children: props.title }),
            jsx('div', { className: 'dk_confirmText', children: props.text }),
            jsxs('div', { className: 'dk_confirmActions', children: [
              jsx('button', { type: 'button', className: 'dk_btn', onClick: props.onCancel, children: '取消' }),
              jsx('button', { type: 'button', className: 'dk_btn dk_btnDanger', onClick: props.onConfirm, children: props.confirmLabel }),
            ] }),
          ],
        })],
      })
    }

    function ActionButton(props) {
      return jsx('button', {
        type: 'button',
        className: 'dk_btn' + (props.danger === true ? ' dk_btnDanger' : ''),
        disabled: props.disabled === true,
        title: props.title ?? '',
        onClick: (event) => {
          event.stopPropagation()
          props.onClick()
        },
        children: props.children,
      })
    }

    /* ------------------------------------------------------------------ *
     * 容器卡片
     * ------------------------------------------------------------------ */

    /** 卡片里的「标签 + 值」一行（值等宽、可省略；与参考布局一致）。 */
    function CardRow(props) {
      return jsxs('div', { className: 'dk_cardRow', children: [
        jsx('span', { className: 'dk_cardLabel', children: props.label }),
        jsx('span', { className: 'dk_cardValue', title: String(props.value), children: props.value }),
      ] })
    }

    /** 卡片/工具条上的图标按钮（无文字，hover 出 title）。 */
    function IconAction(props) {
      const disabled = props.disabled === true
      return jsx('button', {
        type: 'button',
        className: 'dk_iconBtn' + (props.danger === true ? ' dk_iconBtnDanger' : ''),
        'data-on': props.on === true ? '1' : undefined,
        // 刷新类按钮的 loading 态：图标自己转（见 docker.css）
        'data-spin': props.spin === true ? '1' : undefined,
        disabled,
        title: props.title,
        'aria-label': props.title,
        onClick: (event) => {
          event.stopPropagation()
          if (disabled) return
          props.onClick()
        },
        children: jsx('span', { className: 'dk_iconGlyph', dangerouslySetInnerHTML: { __html: props.icon } }),
      })
    }

    function ContainerCard(props) {
      const item = props.item
      const readOnly = props.allowMutations !== true
      const running = item.state === 'running' || item.state === 'paused' || item.state === 'restarting'
      const created = item.createdAt === null ? (item.runningFor === '' ? '—' : item.runningFor) : fmtCreated(item.createdAt)
      return jsxs('div', {
        className: 'dk_card',
        role: 'button',
        tabIndex: 0,
        'data-selected': props.selected === true ? '1' : '0',
        onClick: () => props.onOpen(item, 'overview'),
        onKeyDown: (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            props.onOpen(item, 'overview')
          }
        },
        children: [
          jsxs('div', { className: 'dk_cardHead', children: [
            jsx('span', { className: 'dk_cardName', title: item.name, children: item.name }),
            jsx(Badge, { state: item.state, health: item.health, status: item.status }),
          ] }, 'head'),
          jsxs('div', { className: 'dk_cardRows', children: [
            jsx(CardRow, { label: '镜像', value: item.image }, 'image'),
            jsx(CardRow, { label: 'ID', value: item.shortId }, 'id'),
            jsx(CardRow, { label: '端口', value: portsText(item.ports) }, 'ports'),
            jsx(CardRow, { label: '创建', value: created }, 'created'),
            item.composeProject === null ? null : jsx(CardRow, { label: 'compose', value: item.composeProject + (item.composeService === null ? '' : '/' + item.composeService) }, 'compose'),
          ] }, 'rows'),
          /*
           * 动作条按「会不会改变容器状态」分两组，中间竖线分隔：
           *   左：进入 / 查看（终端、日志、统计）——只读模式下也永远可用；
           *   右：变更（启停、重启、删除）——按破坏性递增排列，只读时整组禁用。
           * 混排（原先 停止|重启 夹在 终端 与 日志 之间）会让误点变更操作的概率变高，
           * 也让「哪些按钮在只读模式下会失效」看不出来。
           */
          jsxs('div', { className: 'dk_actionBar', children: [
            jsx(IconAction, { icon: ICON_TERM, title: '在容器内打开交互式终端（docker exec -it ' + item.name + ' sh）', onClick: () => props.onExec(item) }, 'exec'),
            jsx(IconAction, { icon: ICON_LOGS, title: '查看日志', onClick: () => props.onOpen(item, 'logs') }, 'logs'),
            jsx(IconAction, { icon: ICON_STATS, title: '资源占用', onClick: () => props.onOpen(item, 'stats') }, 'stats'),
            jsx('span', { className: 'dk_actionBarSep', 'aria-hidden': 'true' }, 'sep'),
            jsx(IconAction, { icon: running ? ICON_STOP : ICON_PLAY, title: readOnly ? '需要打开「允许变更操作」' : (running ? '停止容器' : '启动容器'), disabled: readOnly, onClick: () => props.onAction(running ? 'stop' : 'start', item) }, 'power'),
            jsx(IconAction, { icon: ICON_RESTART, title: readOnly ? '需要打开「允许变更操作」' : '重启容器', disabled: readOnly, onClick: () => props.onAction('restart', item) }, 'restart'),
            jsx(IconAction, { icon: ICON_TRASH, danger: true, title: readOnly ? '需要打开「允许变更操作」' : '删除容器（不可恢复）', disabled: readOnly, onClick: () => props.onAction('remove', item) }, 'remove'),
          ] }, 'actions'),
        ],
      })
    }

    /* ------------------------------------------------------------------ *
     * 容器详情（整栏视图：概览 / 日志 / 统计）
     * ------------------------------------------------------------------ */

    /**
     * 日志行前缀解析：时间戳与级别各自成 span，便于分级着色。两种常见格式都吃：
     *   `[INFO] [2026-09-09 18:05:52] ...`（级别在前）
     *   `16:11:34,150 |INFO in ...`（Spring Boot，时间戳在前、级别用竖线）
     */
    const LOG_TS_RE = /^\s*(\[\d{4}-\d{2}-\d{2}[ T][0-9:.,]+\]|\d{2}:\d{2}:\d{2}[,.]\d{3})/
    const LOG_LEVEL_RE = /^\s*(\[(?:TRACE|DEBUG|INFO|WARN|ERROR|FATAL)\]|\|\s*(?:TRACE|DEBUG|INFO|WARN|ERROR|FATAL))/
    const LOG_LEVEL_NAME_RE = /(TRACE|DEBUG|INFO|WARN|ERROR|FATAL)/
    /** 着色行数上限：超大日志整篇着色会拖慢渲染，超出只对尾部着色。 */
    const LOG_COLOR_LIMIT = 2000

    function renderLogLine(line, index, query) {
      const nodes = []
      let rest = line
      // 最多吃掉两个前缀（时间戳 + 级别，顺序不限）
      for (let pass = 0; pass < 2; pass += 1) {
        const ts = LOG_TS_RE.exec(rest)
        if (ts !== null) {
          nodes.push(jsx('span', { className: 'dk_logTs', children: ts[1] }, 'ts' + String(pass)))
          rest = rest.slice(ts[0].length)
          continue
        }
        const level = LOG_LEVEL_RE.exec(rest)
        if (level !== null) {
          const name = LOG_LEVEL_NAME_RE.exec(level[1])
          nodes.push(jsx('span', { className: 'dk_logLevel', 'data-level': name === null ? '' : name[1], children: level[1].trim() }, 'lv' + String(pass)))
          rest = rest.slice(level[0].length)
          continue
        }
        break
      }
      nodes.push(jsx('span', { className: 'dk_logText', children: highlight(rest, query, 'x' + String(index)) }, 'tx'))
      return jsxs('div', { className: 'dk_logLine', children: nodes }, String(index))
    }

    function ContainerView(props) {
      const item = props.item
      const config = props.config
      const [tab, setTab] = useState(props.initialTab ?? 'overview')
      const [detail, setDetail] = useState(null)
      const [detailError, setDetailError] = useState('')
      const [logOptions, setLogOptions] = useState({ tail: config.logTailDefault, timestamps: false })
      const [logs, setLogs] = useState(null)
      const [logsError, setLogsError] = useState('')
      const [logsLoading, setLogsLoading] = useState(false)
      const [logFilter, setLogFilter] = useState('')
      const [logAuto, setLogAuto] = useState(false)
      const [logIntervalSec, setLogIntervalSec] = useState(3)
      const [stats, setStats] = useState(null)
      const [statsError, setStatsError] = useState('')
      const [execCommand, setExecCommand] = useState('')
      const [execResult, setExecResult] = useState(null)
      const [execError, setExecError] = useState('')
      const [execRunning, setExecRunning] = useState(false)

      useEffect(() => {
        let alive = true
        setDetail(null)
        setDetailError('')
        api.inspect(props.target, item.id).then((payload) => {
          if (alive) setDetail(payload.details?.[0] ?? null)
        }).catch((error) => {
          if (alive) setDetailError(error.message)
        })
        return () => { alive = false }
      }, [props.target, item.id, props.refreshToken])

      const loadLogs = useCallback(() => {
        setLogsLoading(true)
        setLogsError('')
        api.logs(props.target, item.id, { tail: logOptions.tail, timestamps: logOptions.timestamps })
          .then((payload) => setLogs(payload.logs))
          .catch((error) => setLogsError(error.message))
          .finally(() => setLogsLoading(false))
      }, [props.target, item.id, logOptions.tail, logOptions.timestamps])

      useEffect(() => {
        if (tab !== 'logs') return undefined
        loadLogs()
        return undefined
      }, [tab, loadLogs, props.refreshToken])

      // 日志自动刷新（参考布局的 AUTO REFRESH + 间隔）：只在日志页且开关打开时轮询
      useEffect(() => {
        if (tab !== 'logs' || !logAuto) return undefined
        const timer = setInterval(loadLogs, Math.max(1, logIntervalSec) * 1000)
        return () => clearInterval(timer)
      }, [tab, logAuto, logIntervalSec, loadLogs])

      useEffect(() => {
        if (tab !== 'stats') return undefined
        let alive = true
        const tick = () => {
          api.stats(props.target, [item.id]).then((payload) => {
            if (alive) {
              setStats(payload.stats?.[0] ?? null)
              setStatsError('')
            }
          }).catch((error) => {
            if (alive) setStatsError(error.message)
          })
        }
        tick()
        const timer = setInterval(tick, Math.max(2, config.pollIntervalSec) * 1000)
        return () => {
          alive = false
          clearInterval(timer)
        }
      }, [tab, props.target, item.id, config.pollIntervalSec, props.refreshToken])

      const runExec = () => {
        if (execCommand.trim() === '') return
        setExecRunning(true)
        setExecError('')
        setExecResult(null)
        api.exec(props.target, item.id, execCommand, config.execTimeoutSec)
          .then((payload) => setExecResult(payload.result))
          .catch((error) => setExecError(error.message))
          .finally(() => setExecRunning(false))
      }

      const overview = () => {
        if (detailError !== '') return jsx(Banner, { title: '读取容器详情失败', hint: detailError })
        if (detail === null) return jsx('div', { className: 'dk_empty', children: [jsx('span', { className: 'dk_spin' }), jsx('div', { children: '读取中…' })] })
        const rows = [
          ['状态', detail.state + (detail.health === null ? '' : ' / ' + detail.health) + (detail.status === '' ? '' : '（' + detail.status + '）')],
          ['镜像', detail.image],
          ['容器 ID', detail.shortId],
          ['启动时间', detail.startedAt ?? '—'],
          ['结束时间', detail.finishedAt ?? '—'],
          ['退出码', detail.exitCode === null ? '—' : String(detail.exitCode)],
          ['重启次数', detail.restartCount === null ? '—' : String(detail.restartCount)],
          ['重启策略', detail.restartPolicy ?? '—'],
          ['PID', detail.pid === null ? '—' : String(detail.pid)],
          ['端口', detail.ports.length === 0 ? '—' : portsText(detail.ports)],
          ['挂载', detail.mounts.length === 0 ? '—' : detail.mounts.map((mount) => mount.source + '→' + mount.destination + (mount.readWrite ? '' : '（只读）')).join('\n')],
          ['网络', detail.networks.length === 0 ? '—' : detail.networks.map((net) => net.name + (net.ip === null ? '' : '（' + net.ip + '）')).join(', ')],
          ['命令', (detail.entrypoint + ' ' + detail.command).trim() || '—'],
          ['工作目录', detail.workingDir === '' ? '—' : detail.workingDir],
          ['用户', detail.user === '' ? '—' : detail.user],
        ]
        const kv = jsxs('div', { className: 'dk_kv', children: rows.flatMap(([key, value], index) => [
          jsx('div', { className: 'dk_kvKey', children: key }, 'k' + String(index)),
          jsx('div', { className: 'dk_kvVal' + (key === '容器 ID' || key === '命令' || key === '镜像' ? ' dk_kvValMono' : ''), children: value }, 'v' + String(index)),
        ]) })
        return jsxs('div', { children: [
          detail.healthLogTail === null ? null : jsx('div', { className: 'dk_hint', style: { marginBottom: 8 }, children: '最近健康检查输出：' + detail.healthLogTail }),
          kv,
          jsx('div', { className: 'dk_cardSection', style: { marginTop: 16 }, children: '一次性命令（docker exec）' }),
          config.allowExec !== true
            ? jsx(Banner, { kind: 'info', title: 'exec 未启用', hint: '到 设置 → 插件 → Docker 容器面板 打开「允许 exec」，或直接复制卡片上的 exec 命令到终端面板交互式进入容器。' })
            : jsxs('div', { children: [
              jsxs('div', { className: 'dk_row', children: [
                jsx('input', {
                  className: 'dk_input',
                  style: { flex: '1 1 auto' },
                  placeholder: '如 ls -la /app 或 cat /etc/nginx/nginx.conf',
                  value: execCommand,
                  onChange: (event) => setExecCommand(event.target.value),
                  onKeyDown: (event) => { if (event.key === 'Enter') runExec() },
                }),
                jsx('button', { type: 'button', className: 'dk_btn dk_btnPrimary', disabled: execRunning, onClick: runExec, children: execRunning ? '执行中…' : '执行' }),
              ] }),
              execError === '' ? null : jsx(Banner, { title: '执行失败', hint: execError }),
              execResult === null ? null : jsxs('div', { style: { marginTop: 8 }, children: [
                jsx('div', { className: 'dk_hint', children: '退出码 ' + (execResult.code === null ? '?' : String(execResult.code)) + ' · 耗时 ' + String(execResult.durationMs) + 'ms' + (execResult.truncated ? ' · 输出已截断' : '') }),
                jsx('pre', { className: 'dk_logBox', style: { marginTop: 6 }, children: (execResult.stdout || '') + (execResult.stderr === '' ? '' : '\n[stderr]\n' + execResult.stderr) || '(无输出)' }),
              ] }),
            ] }),
        ] })
      }

      /** 日志统计（工具条与正文共用）。 */
      const logStats = () => {
        // 只认 string：宿主 /logs 的形状是 { id, text, truncated }，但客户端不该
        // 因为一个畸形/旧版响应就在渲染期抛错——那会连整块面板和 exec 终端一起被
        // React 卸载掉（一次日志请求赔进去一个正在跑的容器会话）。
        const raw = logs !== null && typeof logs === 'object' && typeof logs.text === 'string' ? logs.text : ''
        const needle = logFilter.trim().toLowerCase()
        const allLines = raw === '' ? [] : raw.split('\n')
        const matchedLines = needle === '' ? allLines : allLines.filter((line) => line.toLowerCase().includes(needle))
        return { raw, needle, allLines, matchedLines }
      }

      const logPill = (on, label, onClick) => jsx('button', {
        type: 'button',
        className: 'dk_pill',
        'data-on': on ? '1' : '0',
        onClick,
        children: label,
      })

      /** 日志工具条：并入详情头部那一行（紧凑布局，参考 tabby-docker-console）。 */
      const logControls = () => {
        const { raw } = logStats()
        const tailOptions = [...new Set([100, 200, 500, 1000, 5000, Number(config.logTailDefault) || 200, Number(logOptions.tail) || 200])]
          .filter((value) => Number.isInteger(value) && value > 0)
          .sort((a, b) => a - b)
        return jsxs('div', { className: 'dk_logTools', children: [
          jsx('span', { className: 'dk_toolLabel', children: 'LINES' }),
          jsx('select', {
            className: 'dk_select dk_selectSm',
            value: String(logOptions.tail),
            onChange: (event) => setLogOptions({ ...logOptions, tail: Number(event.target.value) }),
            children: tailOptions.map((value) => jsx('option', { value: String(value), children: value === 5000 ? 'Last 5000' : 'Last ' + String(value) }, String(value))),
          }),
          jsx('span', { className: 'dk_toolLabel', children: 'TIMESTAMPS' }),
          logPill(logOptions.timestamps, logOptions.timestamps ? 'On' : 'Off', () => setLogOptions({ ...logOptions, timestamps: !logOptions.timestamps })),
          jsx('span', { className: 'dk_toolLabel', children: 'AUTO REFRESH' }),
          logPill(logAuto, logAuto ? 'On' : 'Off', () => setLogAuto((value) => !value)),
          jsx('select', {
            className: 'dk_select dk_selectSm',
            value: String(logIntervalSec),
            // 间隔随时可改：关掉 AUTO REFRESH 时先选好、再开，不该被禁用
            title: '自动刷新间隔（开启 AUTO REFRESH 后按此轮询）',
            onChange: (event) => setLogIntervalSec(Number(event.target.value)),
            children: [2, 3, 5, 10].map((value) => jsx('option', { value: String(value), children: String(value) + 's' }, String(value))),
          }),
          /*
           * 刷新中的反馈做成「图标自己转」，不再另插一个 dk_spin 圆环：
           * 圆环是独立元素、又在刷新按钮左边，工具条整体右对齐 → 每次轮询开始 /
           * 结束，LINES / TIMESTAMPS / AUTO REFRESH 那一串都被横推 ~23px（实测，
           * 自动刷新 3s 一次就是持续抖动）；而且圆环离真正要点的按钮隔着一个控件，
           * 看不出是谁在转。与概览页 / 列表页的刷新按钮同款（IconAction 的 spin →
           * data-spin → 图标转 + 高亮当前色）。
           */
          jsx(IconAction, { icon: ICON_REFRESH, title: '刷新日志', spin: logsLoading, onClick: loadLogs }, 'refresh'),
          jsx(IconAction, { icon: ICON_DOWNLOAD, title: '下载日志', disabled: raw === '', onClick: () => downloadText(item.name + '.log', raw) }, 'download'),
        ] })
      }

      /**
       * 过滤行：并入标签页那一行。输入框**常驻**（原来那个「收起 / 展开」按钮点了会
       * 挤动整行，作用也不直观）；有内容时框内右侧浮出一个「清空过滤」按钮——
       * 绝对定位，不占布局，所以出现 / 消失都不会让任何东西位移。
       */
      const logFilterBar = () => {
        const { needle, allLines, matchedLines } = logStats()
        return jsxs('div', { className: 'dk_filterBar', children: [
          jsxs('div', { className: 'dk_filterWrap', children: [
            jsx('input', {
              className: 'dk_input dk_filterInput',
              placeholder: '过滤日志…',
              value: logFilter,
              onChange: (event) => setLogFilter(event.target.value),
              // Esc 清空过滤（而不是冒泡去最小化 / 关闭面板）
              onKeyDown: (event) => {
                if (event.key === 'Escape' && logFilter !== '') {
                  event.stopPropagation()
                  setLogFilter('')
                }
              },
            }),
            logFilter === '' ? null : jsx('button', {
              type: 'button',
              className: 'dk_filterClear',
              title: '清空过滤',
              'aria-label': '清空过滤',
              onClick: () => setLogFilter(''),
              children: jsx('span', { className: 'dk_iconGlyph', dangerouslySetInnerHTML: { __html: ICON_CLOSE } }),
            }, 'clear'),
          ] }),
          jsx('span', { className: 'dk_filterCount', children: needle === '' ? String(allLines.length) + ' 行' : String(matchedLines.length) + ' / ' + String(allLines.length) + ' 行匹配' }),
        ] })
      }

      const logsView = () => {
        const { needle, matchedLines } = logStats()
        const shown = matchedLines.length > LOG_COLOR_LIMIT ? matchedLines.slice(-LOG_COLOR_LIMIT) : matchedLines
        return jsxs('div', { className: 'dk_logs', children: [
          logsError === '' ? null : jsx(Banner, {
            title: '读取日志失败',
            hint: logsError + (logsError.includes('Failed to fetch') ? '（网络请求没到宿主：宿主可能刚重启、或连接被中断）' : ''),
            action: jsx('button', { type: 'button', className: 'dk_btn', disabled: logsLoading, onClick: loadLogs, children: '重试' }),
          }),
          logs !== null && logs.truncated === true ? jsx(Banner, { kind: 'warn', title: '日志输出超过上限，已截断', hint: '调小「LINES」或到设置卡片调大「单次命令输出上限」。' }) : null,
          jsxs('div', { className: 'dk_logBody', children: [
            matchedLines.length > shown.length
              ? jsx('div', { className: 'dk_logLine dk_logMore', children: '（只显示最近 ' + String(LOG_COLOR_LIMIT) + ' 行，共 ' + String(matchedLines.length) + ' 行匹配）' }, 'more')
              : null,
            logsError !== ''
              ? null
              : logs === null
                ? jsx('div', { className: 'dk_logLine', children: '读取中…' }, 'loading')
                : (shown.length === 0
                  ? jsx('div', { className: 'dk_logLine', children: needle === '' ? '(无日志)' : '(无匹配日志)' }, 'empty')
                  : shown.map((line, index) => renderLogLine(line, index, needle))),
          ] }),
        ] })
      }

      const statsView = () => {
        if (statsError !== '') return jsx(Banner, { title: '读取统计失败', hint: statsError })
        if (stats === null) return jsx('div', { className: 'dk_empty', children: [jsx('span', { className: 'dk_spin' }), jsx('div', { children: '读取中…' })] })
        const cpu = stats.cpuPercent ?? 0
        const mem = stats.memPercent ?? 0
        const bar = (value) => jsxs('div', { className: 'dk_bar', children: [jsx('div', {
          className: 'dk_barFill',
          'data-warn': value >= 60 && value < 85 ? '1' : undefined,
          'data-danger': value >= 85 ? '1' : undefined,
          style: { width: Math.min(100, Math.max(0, value)) + '%' },
        })] })
        const row = (label, value, extra) => jsxs('tr', { children: [
          jsx('td', { children: label }),
          jsx('td', { className: 'dk_num', children: value }),
          jsx('td', { children: extra ?? null }),
        ] }, label)
        return jsxs('table', { className: 'dk_stats', children: [
          jsx('thead', { children: jsxs('tr', { children: [
            jsx('th', { children: '指标' }), jsx('th', { children: '数值' }), jsx('th', { children: '占用' }),
          ] }) }),
          jsx('tbody', { children: [
            row('CPU', fmtPercent(stats.cpuPercent), bar(cpu)),
            row('内存', stats.memUsage, bar(mem)),
            row('网络 IO', stats.netIO, null),
            row('磁盘 IO', stats.blockIO, null),
            row('PIDs', stats.pids === null ? '—' : String(stats.pids), null),
          ] }),
        ] })
      }

      const tabs = [['overview', '概览'], ['logs', '日志'], ['stats', '统计']]
      // 当前页是否还在取数：刷新按钮据此转圈（点刷新后必然转，首次打开也转，符合「正在取数」的直觉）
      const refreshing = tab === 'overview'
        ? detail === null && detailError === ''
        : tab === 'stats' ? stats === null && statsError === '' : false
      // 紧凑布局：详情视图自己渲染顶栏（不再叠加面板头/工具条/过滤行三层）
      //   第一行 = 返回 + 容器名 + 状态 + 目标主机 +（日志页：LINES/TIMESTAMPS/AUTO REFRESH…）+ 关闭
      //   第二行 = 标签页 +（日志页：过滤行）
      return jsxs('div', { className: 'dk_detail', children: [
        jsxs('div', { className: 'dk_header dk_headerDetail', children: [
          jsx(IconAction, { icon: ICON_BACK, title: '返回容器列表', onClick: props.onBack }, 'back'),
          jsx('span', { className: 'dk_detailTitle', title: item.name, children: item.name }),
          jsx(Badge, { state: item.state, health: item.health, status: item.status }),
          jsx('span', { className: 'dk_detailSub', children: props.targetLabel ?? '' }),
          jsx('span', { className: 'dk_headerSpacer' }),
          tab === 'logs' ? logControls() : jsx(IconAction, { icon: ICON_REFRESH, title: '刷新', spin: refreshing, onClick: props.onRefresh }, 'refresh'),
          // dock 模式的 ✕ 在 tty 的挂载位标题栏上（这里再来一个会重复）
          props.docked === true ? null : jsx('button', { type: 'button', className: 'dk_iconBtn', title: '关闭面板', onClick: props.onClose, children: jsx('span', { className: 'dk_iconGlyph', dangerouslySetInnerHTML: { __html: ICON_CLOSE } }) }, 'close'),
        ] }),
        jsxs('div', { className: 'dk_tabs', children: [
          ...tabs.map(([key, label]) => jsx('button', {
            type: 'button',
            className: 'dk_tab',
            'data-on': tab === key ? '1' : '0',
            onClick: () => setTab(key),
            children: label,
          }, key)),
          tab === 'logs' ? jsx('span', { className: 'dk_headerSpacer' }, 'spacer') : null,
          tab === 'logs' ? logFilterBar() : null,
        ] }),
        jsx('div', { className: 'dk_detailBody', children: tab === 'overview' ? overview() : tab === 'logs' ? logsView() : statsView() }),
      ] })
    }

    /* ------------------------------------------------------------------ *
     * 主面板
     * ------------------------------------------------------------------ */

    /**
     * 交互式终端抽屉（0.15.0）：tty 把终端就地挂进 hostRef，面板不收起。
     *
     * 高度与折叠（0.2.0）：抽屉会挤占面板正文（容器列表 / 日志 / 统计）的高度，
     * 所以它必须能被用户自己让位——顶部拖拽调高矮，或折叠成一条标题栏。
     * **折叠只隐藏，不 dispose**：会话照旧跑着，展开即原样回来；真正结束会话
     * 的是右侧那个 ✕（以及关闭面板，两者都会走结束确认）。
     * 挂载点始终在 DOM 里（折叠时靠 CSS 隐藏），否则 tty 那边的 xterm 会被拆掉。
     */
    function ExecDrawer(props) {
      const collapsed = props.collapsed === true
      return jsxs('div', {
        className: 'dk_drawer',
        'data-collapsed': collapsed ? '1' : undefined,
        style: collapsed || props.height === null ? undefined : { height: String(props.height) + 'px' },
        children: [
          jsx('div', {
            className: 'dk_drawerResize',
            title: '拖动调整终端高度（双击折叠 / 展开）',
            onMouseDown: props.onResizeStart,
            onDoubleClick: props.onToggleCollapse,
          }, 'resize'),
          jsxs('div', {
            className: 'dk_drawerHead',
            children: [
              jsx('span', { className: 'dk_drawerIcon', dangerouslySetInnerHTML: { __html: ICON_TERM } }),
              jsx('span', { className: 'dk_drawerTitle', title: props.label, children: props.label }),
              jsx('span', {
                className: 'dk_drawerHint',
                children: collapsed ? '已折叠 · 会话保持运行' : '由终端面板承载 · 折叠保留会话',
              }),
              jsx('span', { className: 'dk_headerSpacer' }),
              jsx('button', {
                type: 'button',
                className: 'dk_iconBtn dk_drawerFold',
                title: collapsed ? '展开终端（会话未中断）' : '折叠终端（会话保持运行）',
                onClick: props.onToggleCollapse,
                children: jsx('span', { className: 'dk_iconGlyph', dangerouslySetInnerHTML: { __html: ICON_CHEVRON } }),
              }, 'fold'),
              jsx('button', {
                type: 'button',
                className: 'dk_iconBtn',
                title: '结束终端会话并收起抽屉',
                onClick: props.onClose,
                children: jsx('span', { dangerouslySetInnerHTML: { __html: ICON_CLOSE } }),
              }, 'close'),
            ],
          }),
          jsx('div', { className: 'dk_drawerBody', ref: props.hostRef }),
        ],
      })
    }

    function ContainerPanel(props) {
      const [config, setConfig] = useState(null)
      const [targets, setTargets] = useState([])
      const [target, setTarget] = useState(props.initialTarget ?? '')
      /** 从 tty 连接栏进来、但会话主机没匹配到任何目标：不自动选目标，只提示去配置。 */
      const sessionScoped = props.sessionHint !== undefined && (props.initialTarget ?? '') === ''
      const [view, setView] = useState('containers')
      const [containers, setContainers] = useState([])
      const [images, setImages] = useState([])
      const [loading, setLoading] = useState(false)
      const [error, setError] = useState('')
      const [notice, setNotice] = useState('')
      const [all, setAll] = useState(true)
      const [search, setSearch] = useState('')
      const [stateFilter, setStateFilter] = useState('all')
      const [autoRefresh, setAutoRefresh] = useState(false)
      /** 打开中的容器详情：{ id, tab, item }（item 为快照，列表刷新后优先用新数据）。 */
      const [detail, setDetail] = useState(null)
      const [refreshToken, setRefreshToken] = useState(0)
      const [confirm, setConfirm] = useState(null)
      const [imageSearch, setImageSearch] = useState('')
      const mountedRef = useRef(true)
      /**
       * 就地嵌入的交互式终端（tty ≥ 0.15 的 ttyTerminal.mount）：{ label, options }。
       * 非 null 时面板底部出现终端抽屉——不再「开标签 + 收起面板」，
       * 用户看容器日志/进容器敲命令的上下文不中断。
       */
      const [exec, setExec] = useState(null)
      const execHostRef = useRef(null)
      /** 终端抽屉折叠 / 高度：折叠只是藏起来，会话照跑；height=null 用样式默认值。 */
      const [execFold, setExecFold] = useState(false)
      const [execHeight, setExecHeight] = useState(null)
      /** 关闭面板 = tty dispose 掉抽屉终端（会话结束）：有活动会话时先确认。 */
      const [closeConfirm, setCloseConfirm] = useState(false)
      const panelRef = useRef(null)
      /** 记录 mousedown 是否落在 backdrop 上（决定 mouseup 时算不算「点击外部」）。 */
      const backdropDownRef = useRef(false)

      useEffect(() => () => { mountedRef.current = false }, [])

      // 抽屉挂载/卸载：交给 tty 的 mount 托管，卸载时 dispose（结束会话 + 拆 DOM）。
      // 依赖只有 exec —— 换容器时旧的先 dispose，新的再挂上。
      useEffect(() => {
        if (exec === null) return undefined
        const host = execHostRef.current
        if (host === null) return undefined
        let dispose = null
        try {
          dispose = terminalApi.mount(host, exec.options)
        } catch (error) {
          setNotice('终端启动失败：' + (error instanceof Error ? error.message : String(error)))
          setExec(null)
          return undefined
        }
        return () => {
          try {
            dispose?.()
          } catch {
            /* 忽略：卸载失败不该影响面板关闭 */
          }
        }
      }, [exec])

      /**
       * 抽屉拖拽调高：上限取面板高度的 75%，免得日志/统计连标题都被挤没；
       * 拖动期间锁住文本选中，否则会顺手把面板文字刷蓝。
       */
      const startDrawerResize = (event) => {
        if (event.button !== undefined && event.button !== 0) return
        const drawer = event.currentTarget.parentElement
        const panel = panelRef.current
        if (drawer === null || panel === null) return
        event.preventDefault()
        const startY = event.clientY
        const startHeight = drawer.getBoundingClientRect().height
        const maxHeight = Math.max(160, Math.round(panel.getBoundingClientRect().height * 0.75))
        const onMove = (moveEvent) => {
          const next = Math.round(startHeight + (startY - moveEvent.clientY))
          setExecHeight(Math.min(maxHeight, Math.max(160, next)))
        }
        const onUp = () => {
          document.removeEventListener('mousemove', onMove)
          document.removeEventListener('mouseup', onUp)
          document.body.style.userSelect = ''
        }
        document.body.style.userSelect = 'none'
        document.addEventListener('mousemove', onMove)
        document.addEventListener('mouseup', onUp)
      }

      /**
       * 关闭面板：面板一卸载，tty 就会 dispose 掉抽屉里的终端（会话结束）。
       * 有活动会话时先确认——点 backdrop 空白处也会走到这里，一声不吭地杀掉
       * 一个正在排障的容器 shell 代价太大（tty 面板自身也是「点空白 = 最小化」
       * 而不是结束会话，这里与它对齐）。
       */
      const requestClose = () => {
        if (exec === null) {
          props.onClose()
          return
        }
        setCloseConfirm(true)
      }

      useEffect(() => {
        api.config().then((payload) => {
          const next = payload.config
          setConfig(next)
          // 上下文入口（tty 连接栏）已指定目标时不覆盖；从连接栏进来但没匹配到目标时
          // 也不自动选第一个——否则面板会显示「另一台主机」的容器，误导性太强
          if (!sessionScoped && Array.isArray(next.targets) && next.targets.length > 0) {
            setTarget((current) => (current === '' ? next.targets[0].name : current))
          }
          primeTargetsCache(next)
        }).catch((error_) => setError(error_.message))
        api.targets().then((payload) => {
          setTargets(payload.targets ?? [])
          targetsCache = payload.targets ?? []
          const first = (payload.targets ?? [])[0]
          if (first !== undefined && !sessionScoped) setTarget((current) => (current === '' ? first.name : current))
        }).catch(() => { /* 目标列表失败时下面的容器加载会给出错误 */ })
      }, [])

      const loadContainers = useCallback(() => {
        if (target === '') return
        setLoading(true)
        api.containers(target, all)
          .then((payload) => {
            if (!mountedRef.current) return
            setContainers(payload.containers ?? [])
            setError('')
          })
          .catch((error_) => {
            if (mountedRef.current) setError(error_.message)
          })
          .finally(() => {
            if (mountedRef.current) setLoading(false)
          })
      }, [target, all])

      const loadImages = useCallback(() => {
        if (target === '') return
        setLoading(true)
        api.images(target)
          .then((payload) => {
            if (!mountedRef.current) return
            setImages(payload.images ?? [])
            setError('')
          })
          .catch((error_) => {
            if (mountedRef.current) setError(error_.message)
          })
          .finally(() => {
            if (mountedRef.current) setLoading(false)
          })
      }, [target])

      /** 详情视图刷新：只让当前容器的 inspect / 日志 / 统计重取，不动列表。 */
      const refreshDetail = useCallback(() => setRefreshToken((value) => value + 1), [])

      const refresh = useCallback(() => {
        if (view === 'images') loadImages()
        else loadContainers()
        setRefreshToken((value) => value + 1)
      }, [view, loadContainers, loadImages])

      useEffect(() => {
        if (target === '') return undefined
        refresh()
        return undefined
      }, [target, all, view])

      // 自动刷新只服务容器列表（状态会变）；镜像列表变化慢，跟着每 5s 跑一次 docker images
      // 纯属白烧目标机的 docker CLI，所以镜像页不轮询、也不显示这个开关
      useEffect(() => {
        if (!autoRefresh || target === '' || view !== 'containers') return undefined
        const timer = setInterval(refresh, Math.max(2, config?.pollIntervalSec ?? 5) * 1000)
        return () => clearInterval(timer)
      }, [autoRefresh, refresh, target, config, view])

      useEffect(() => {
        if (notice === '') return undefined
        const timer = setTimeout(() => setNotice(''), 4000)
        return () => clearTimeout(timer)
      }, [notice])

      /** 复制 docker exec 命令（终端能力不可用时的兜底）。 */
      const copyExecCommand = (item, reason) => {
        const command = buildExecCommand(item.name)
        navigator.clipboard.writeText(command).then(() => {
          setNotice('已复制：' + command + (reason === undefined ? '' : '（' + reason + '）'))
        }).catch(() => setNotice('复制失败，请手动执行：' + command))
      }

      /**
       * 卡片「终端」按钮：跑 `docker exec -it` 交互式进入容器。三级降级——
       *   1. ttyTerminal.mount（契约版本 ≥ 2）：面板底部开一个终端抽屉、就地嵌入，
       *      面板不收起，看日志 → 进容器的上下文不断；
       *   2. ttyTerminal.open（契约版本 1）：借 tty 弹窗开标签，随后收起本面板
       *      （本面板 z-index 2140 > 弹窗 1300，不收起用户只会觉得「点了没反应」）；
       *   3. 复制命令到剪贴板（未装 tty / 版本过旧 / 内联目标 key·password 拿不到凭证）。
       */
      const openExec = (item) => {
        const command = buildExecCommand(item.name)
        if (terminalApi === null) {
          // 区分两种原因：tty 未安装（没有终端面板入口）还是版本过旧（面板在、但没有
          // ttyTerminal 服务）。提示要能直接指导用户下一步做什么。
          const ttyInstalled = document.querySelector('[data-dsh-tty-entry]') !== null
          copyExecCommand(item, ttyInstalled
            ? '终端面板版本过旧（交互式进入容器需要 dsh-tty ≥ 0.14.0），命令已复制，可粘贴到系统终端执行'
            : '未安装 dsh-tty 终端面板，命令已复制，可粘贴到系统终端执行（装 dsh-tty 后可直接在此开终端）')
          return
        }
        const cfg = (config?.targets ?? []).find((entry) => entry.name === target)
        const label = item.name + ' · exec'
        // 组装 tty 的 options：book > spec > 本机（与 ttyTerminal 的约定一致）；
        // 内联目标用 key/password 时浏览器端拿不到凭证 → null，走复制兜底
        const options = (() => {
          if (cfg === undefined || cfg.kind === 'local') return { command, label }
          if (typeof cfg.book === 'string' && cfg.book !== '') return { book: cfg.book, command, label }
          if ((cfg.auth ?? 'agent') === 'agent') {
            return {
              spec: { host: cfg.host, port: cfg.port, username: cfg.username, auth: 'agent', agentForward: cfg.agentForward === true },
              command,
              label,
            }
          }
          return null
        })()
        if (options === null) {
          copyExecCommand(item, '内联目标用了 key/password 认证，浏览器端拿不到凭证')
          return
        }
        // 0) dock 模式：面板已经长在 tty 面板里了，再嵌一层终端就成了「终端套面板
        //    套终端」——同一面板新开一个标签才是这里的自然语义（标签会切到前台，
        //    容器列表继续留在右侧）
        if (props.docked === true) {
          try {
            terminalApi.open(options)
          } catch (error) {
            copyExecCommand(item, error instanceof Error ? error.message : String(error))
          }
          return
        }
        // 1) 就地嵌入（契约版本 2 才保证有 mount）
        if (typeof terminalApi.mount === 'function' && Number(terminalApi.version ?? 0) >= 2) {
          setExec({ label, options })
          setExecFold(false) // 换容器时展开：新会话总该看得见
          return
        }
        // 2) 借 tty 弹窗承载
        try {
          terminalApi.open(options)
          props.onClose()
        } catch (error) {
          copyExecCommand(item, error instanceof Error ? error.message : String(error))
        }
      }

      const doAction = (action, item) => {
        setConfirm({
          title: action === 'remove' ? '删除容器' : (action === 'stop' ? '停止容器' : (action === 'start' ? '启动容器' : '重启容器')),
          text: action === 'remove'
            ? `确定删除容器 ${item.name}？容器的可写层与配置会被删除（命名数据卷保留），此操作不可恢复。`
            : `确定对容器 ${item.name} 执行${action === 'stop' ? '停止' : action === 'start' ? '启动' : '重启'}操作？`,
          confirmLabel: action === 'remove' ? '删除' : '确定',
          run: () => {
            setConfirm(null)
            api.action(target, action, item.id)
              .then((payload) => {
                setNotice(`${payload.result.action} ${item.name}：${payload.result.message}`)
                refresh()
              })
              .catch((error_) => setError(error_.message))
          },
        })
      }

      const selected = detail === null
        ? null
        : (containers.find((item) => item.id === detail.id) ?? detail.item)
      const filtered = containers.filter((item) => {
        if (stateFilter === 'running' && !(item.state === 'running' || item.state === 'paused' || item.state === 'restarting')) return false
        if (stateFilter === 'stopped' && item.state === 'running') return false
        if (stateFilter === 'unhealthy' && item.health !== 'unhealthy') return false
        const needle = search.trim().toLowerCase()
        if (needle === '') return true
        return item.name.toLowerCase().includes(needle) || item.image.toLowerCase().includes(needle) || item.id.toLowerCase().includes(needle)
      })
      const filteredImages = images.filter((item) => {
        const needle = imageSearch.trim().toLowerCase()
        return needle === '' || item.reference.toLowerCase().includes(needle) || item.id.toLowerCase().includes(needle)
      })

      const targetLabel = (name) => {
        const found = targets.find((item) => item.name === name)
        if (found === undefined) return name
        return found.label === undefined ? name : name + ' · ' + found.label
      }

      const empty = () => {
        if (loading) return jsx('div', { className: 'dk_empty', children: [jsx('span', { className: 'dk_spin' }), jsx('div', { children: '读取中…' })] })
        if (target === '') {
          if (sessionScoped) {
            return jsxs('div', { className: 'dk_empty', children: [
              jsx('div', { className: 'dk_emptyTitle', children: '当前会话主机还不是 Docker 目标' }),
              jsx('div', { className: 'dk_emptyHint', children: '按上面的提示到 设置 → 插件 → Docker 容器面板 添加一条目标（推荐直接选连接簿条目），保存后回到这里刷新。为避免张冠李戴，面板不会自动切到其他目标。' }),
            ] })
          }
          return jsxs('div', { className: 'dk_empty', children: [
            jsx('div', { className: 'dk_emptyTitle', children: '还没有配置 Docker 目标' }),
            jsx('div', { className: 'dk_emptyHint', children: '到 设置 → 插件 → Docker 容器面板 添加一个目标：本机直接选「本机」；远程主机可以引用 tty 终端面板的连接簿条目。' }),
          ] })
        }
        return jsxs('div', { className: 'dk_empty', children: [
          jsx('div', { className: 'dk_emptyTitle', children: view === 'images' ? '没有镜像' : '没有容器' }),
          jsx('div', { className: 'dk_emptyHint', children: search.trim() === '' ? '目标上没有匹配的数据，或筛选条件过窄。' : '没有匹配「' + search.trim() + '」的结果。' }),
        ] })
      }

      const body = () => {
        if (view === 'images') {
          // 搜索框在工具条里（固定区，不随镜像列表滚走）；表体自己滚，表头钉住
          return jsxs('div', { className: 'dk_imagesView', children: [
            filteredImages.length === 0
              ? empty()
              : jsx('div', { className: 'dk_tableWrap', children: jsxs('table', { className: 'dk_images', children: [
                jsx('thead', { children: jsxs('tr', { children: [
                  jsx('th', { children: '镜像' }), jsx('th', { children: '大小' }), jsx('th', { children: '创建' }), jsx('th', { children: 'ID' }),
                ] }) }),
                jsx('tbody', { children: filteredImages.map((item) => jsxs('tr', { children: [
                  jsx('td', { className: 'dk_mono', children: item.reference }),
                  jsx('td', { children: item.sizeText }),
                  jsx('td', { children: item.createdSince }),
                  jsx('td', { className: 'dk_mono', children: item.shortId }),
                ] }, item.id + item.reference)) }),
              ] }) }),
          ] })
        }
        if (filtered.length === 0) return empty()
        return jsx('div', { className: 'dk_grid', children: filtered.map((item) => jsx(ContainerCard, {
          item,
          selected: detail !== null && item.id === detail.id,
          allowMutations: config?.allowMutations === true,
          onOpen: (picked, tab) => setDetail({ id: picked.id, tab, item: picked }),
          onExec: openExec,
          onAction: doAction,
          onCopyExec: (picked) => {
            navigator.clipboard.writeText('docker exec -it ' + picked.name + ' sh').then(() => setNotice('已复制：docker exec -it ' + picked.name + ' sh')).catch(() => setNotice('复制失败，请手动复制'))
          },
        }, item.id)) })
      }

      const docked = props.docked === true
      const panelChildren = [selected !== null ? [
            jsx(ContainerView, {
              item: selected,
              target,
              targetLabel: targetLabel(target),
              config: config ?? { pollIntervalSec: 5, logTailDefault: 200, allowExec: false, execTimeoutSec: 30 },
              initialTab: detail.tab,
              refreshToken,
              onBack: () => setDetail(null),
              onRefresh: refreshDetail,
              onClose: requestClose,
              docked,
            }, 'detail'),
            confirm === null ? null : jsx(ConfirmDialog, {
              title: confirm.title,
              text: confirm.text,
              confirmLabel: confirm.confirmLabel,
              onCancel: () => setConfirm(null),
              onConfirm: confirm.run,
            }, 'confirm'),
          ] : [
            /*
             * 头部：dock 模式下**整条不渲染**——标题与 ✕ 已经在 tty 的侧栏标题栏上，
             * 再留一条只挂着一个刷新按钮的空行（520px 窄栏里特别刺眼）不如把这几个
             * 控件并进工具条首行（见下面的 refresh / 只读徽标 / loading）。
             */
            docked ? null : jsxs('div', { className: 'dk_header', children: [
              jsx('span', { className: 'dk_titleIcon', dangerouslySetInnerHTML: { __html: ICON_BOX } }),
              jsx('span', { className: 'dk_title', children: 'Docker 容器' }),
              config?.allowMutations === true ? null : jsx('span', { className: 'dk_badge', 'data-state': 'paused', children: '只读模式' }),
              jsx('span', { className: 'dk_headerSpacer' }),
              // 刷新中让图标自己转（loading 也用于镜像列表）
              selected !== null ? null : jsx('button', { type: 'button', className: 'dk_iconBtn', title: '刷新列表', 'data-spin': loading ? '1' : undefined, onClick: refresh, children: jsx('span', { className: 'dk_iconGlyph', dangerouslySetInnerHTML: { __html: ICON_REFRESH } }) }),
              jsx('button', { type: 'button', className: 'dk_iconBtn', title: '关闭面板', onClick: requestClose, children: jsx('span', { dangerouslySetInnerHTML: { __html: ICON_CLOSE } }) }),
            ] }),
            /* 工具栏：只在列表视图显示；容器详情是整栏视图，列表筛选在这里没有意义 */
            selected !== null ? null : jsxs('div', { className: 'dk_toolbar', children: [
              // dock 模式（没有头部那条）：刷新 / 只读徽标并到首行，别浪费一整行；
              // 刷新中图标自己转，所以这里不再另挂一个 spinner
              docked ? jsx('button', { type: 'button', className: 'dk_iconBtn', title: '刷新列表', 'data-spin': loading ? '1' : undefined, onClick: refresh, children: jsx('span', { className: 'dk_iconGlyph', dangerouslySetInnerHTML: { __html: ICON_REFRESH } }) }, 'refresh') : null,
              docked && config?.allowMutations !== true ? jsx('span', { className: 'dk_badge', 'data-state': 'paused', children: '只读模式' }, 'readonly') : null,
              jsx('select', {
                className: 'dk_select',
                value: target,
                onChange: (event) => {
                  setTarget(event.target.value)
                  setDetail(null)
                  props.onTargetChange?.(targetLabel(event.target.value))
                },
                children: [
                  // 会话主机未匹配目标时保持「未选择」，让用户显式挑一个，不替他默认
                  ...(target === '' ? [jsx('option', { value: '', children: '（未选择目标）' }, '__none')] : []),
                  ...(targets.length === 0 && target !== '' ? [{ name: target, label: undefined }] : targets)
                    .map((item) => jsx('option', { value: item.name, children: targetLabel(item.name) }, item.name)),
                ],
              }),
              jsx('div', { className: 'dk_seg', children: [['containers', '容器'], ['images', '镜像']].map(([key, label]) => jsx('button', {
                type: 'button',
                className: 'dk_segBtn',
                'data-on': view === key ? '1' : '0',
                onClick: () => { setView(key); setDetail(null) },
                children: label,
              }, key)) }),
              view === 'containers' ? jsx('input', {
                className: 'dk_input dk_search',
                placeholder: '搜索名称 / 镜像 / ID',
                value: search,
                onChange: (event) => setSearch(event.target.value),
              }) : null,
              // 镜像搜索与容器搜索同处工具条（固定区）：长列表滚起来后搜索框仍在原地
              view === 'images' ? jsx('input', {
                className: 'dk_input dk_search',
                placeholder: '搜索镜像（仓库 / 标签 / ID）',
                value: imageSearch,
                onChange: (event) => setImageSearch(event.target.value),
              }) : null,
              view === 'images' ? jsx('span', { className: 'dk_hint dk_searchCount', children: String(filteredImages.length) + ' / ' + String(images.length) + ' 个镜像' }) : null,
              view === 'containers' ? jsx('div', { className: 'dk_seg', children: [['all', '全部'], ['running', '运行中'], ['stopped', '已停止'], ['unhealthy', '不健康']].map(([key, label]) => jsx('button', {
                type: 'button',
                className: 'dk_segBtn',
                'data-on': stateFilter === key ? '1' : '0',
                onClick: () => setStateFilter(key),
                children: label,
              }, key))}) : null,
              view === 'containers' ? jsx('label', { className: 'dk_check', children: [
                jsx('input', { type: 'checkbox', checked: all, onChange: (event) => setAll(event.target.checked) }),
                '含已停止',
              ] }) : null,
              // 镜像页没有「状态」可轮询：开关只在容器页出现（切回容器页时原设置照旧生效）
              view === 'containers' ? jsx('label', { className: 'dk_check', children: [
                jsx('input', { type: 'checkbox', checked: autoRefresh, onChange: (event) => setAutoRefresh(event.target.checked) }),
                '自动刷新',
              ] }) : null,
            ] }),
            /* 主体 */
            jsxs('div', { className: 'dk_body', children: [
              jsxs('div', { className: 'dk_main' + (view === 'images' ? ' dk_mainImages' : ''), children: [
                error === '' ? null : jsx(Banner, { title: '操作失败', hint: error }),
                notice === '' ? null : jsx(Banner, { kind: 'info', title: notice }),
                props.sessionHint === undefined ? null : jsx(Banner, {
                  kind: 'info',
                  title: '当前会话主机还没配置为 Docker 目标',
                  hint: '会话主机：' + props.sessionHint.host + (props.sessionHint.port === 22 ? '' : ':' + String(props.sessionHint.port))
                    + (props.sessionHint.book === '' ? '' : '（连接簿：' + props.sessionHint.book + '）')
                    + ' — 到 设置 → 插件 → Docker 容器面板 添加一条 kind=ssh 目标'
                    + (props.sessionHint.book === '' ? '（填 host/username，或用连接簿条目）' : '，直接选连接簿条目「' + props.sessionHint.book + '」')
                    + '，保存后回到这里刷新即可。',
                }),
                config !== null && config.allowMutations !== true
                  ? jsx(Banner, { kind: 'info', title: '当前为只读模式', hint: '启动 / 停止 / 重启 / 删除需要到 设置 → 插件 → Docker 容器面板 打开「允许变更操作」。' })
                  : null,
                body(),
              ] }),
            ] }),
            confirm === null ? null : jsx(ConfirmDialog, {
              title: confirm.title,
              text: confirm.text,
              confirmLabel: confirm.confirmLabel,
              onCancel: () => setConfirm(null),
              onConfirm: confirm.run,
            }),
          ],
          /* 交互式终端抽屉（就地嵌入，面板不收起）；详情/列表切换时保持挂载 */
          exec === null ? null : jsx(ExecDrawer, {
            label: exec.label,
            hostRef: execHostRef,
            collapsed: execFold,
            height: execHeight,
            onToggleCollapse: () => setExecFold((value) => !value),
            onResizeStart: startDrawerResize,
            onClose: () => setExec(null),
          }, 'execDrawer'),
          /* 有活动终端会话时关面板要确认（见 requestClose） */
          closeConfirm && exec !== null ? jsx(ConfirmDialog, {
            title: '结束容器终端会话',
            text: '关闭面板会结束「' + exec.label + '」的终端会话（docker exec -it …）。'
              + '若只是想给日志 / 列表腾地方，先点抽屉右上角的折叠按钮即可，会话会保持运行。',
            confirmLabel: '结束并关闭',
            onCancel: () => setCloseConfirm(false),
            onConfirm: () => {
              setCloseConfirm(false)
              props.onClose()
            },
          }, 'closeConfirm') : null,
      ]

      const panel = jsxs('div', {
        className: 'dk_panel' + (docked ? ' dk_panelDock' : ''),
        'data-dock': docked ? '1' : undefined,
        ref: panelRef,
        onMouseDown: (event) => event.stopPropagation(),
        children: panelChildren,
      })

      // dock 模式（0.3.0）：面板长在 tty 面板的右侧挂载位里，不再自带 backdrop——
      // 终端就在旁边，必须保持可见、可点、可输入
      if (docked) return panel

      return jsxs('div', {
        className: 'dk_backdrop',
        // 「点击外部关闭」要求按下与松开都落在 backdrop 上：从面板里按下、拖到
        // 外面松手不再算关闭（那一下会顺手结束正在跑的终端会话）
        onMouseDown: (event) => { backdropDownRef.current = event.target === event.currentTarget },
        onMouseUp: (event) => {
          const outside = backdropDownRef.current && event.target === event.currentTarget
          backdropDownRef.current = false
          if (outside) requestClose()
        },
        children: [panel],
      })
    }

    /* ------------------------------------------------------------------ *
     * 设置卡片
     * ------------------------------------------------------------------ */

    function DockerSettingsCard() {
      const [open, setOpen] = useState(false)
      const [form, setForm] = useState(null)
      const [loaded, setLoaded] = useState(false)
      const [saving, setSaving] = useState(false)
      const [message, setMessage] = useState({ kind: '', text: '' })
      /** 卡片加载时看到的目标数：用于区分「用户删空了」与「卡片拿到了空列表」。 */
      const loadedCountRef = useRef(0)

      const load = useCallback(() => {
        api.config().then((payload) => {
          setForm(payload.config)
          primeTargetsCache(payload.config)
          loadedCountRef.current = Array.isArray(payload.config?.targets) ? payload.config.targets.length : 0
          setLoaded(true)
        }).catch((error) => {
          setMessage({ kind: 'error', text: '读取配置失败：' + error.message })
          setLoaded(true)
        })
      }, [])

      useEffect(() => { if (open && !loaded) load() }, [open, loaded, load])

      const patch = (changes) => setForm((current) => ({ ...current, ...changes }))
      const patchTarget = (index, changes) => setForm((current) => {
        const targets = current.targets.slice()
        targets[index] = { ...targets[index], ...changes }
        return { ...current, targets }
      })

      const addTarget = () => setForm((current) => ({
        ...current,
        targets: [...current.targets, { name: '目标' + String(current.targets.length + 1), kind: 'local', book: '', host: '', port: 22, username: '', auth: 'agent', keyPath: '', agentForward: false, passwordSet: false, passphraseSet: false }],
      }))

      const removeTarget = (index) => setForm((current) => ({ ...current, targets: current.targets.filter((_, i) => i !== index) }))

      const removeHostKey = (record) => setForm((current) => ({
        ...current,
        hostKeys: current.hostKeys.filter((item) => !(item.host === record.host && item.port === record.port)),
      }))

      const save = () => {
        setSaving(true)
        setMessage({ kind: '', text: '' })
        const payload = {
          enabled: form.enabled,
          announceToAgent: form.announceToAgent,
          dockerBin: form.dockerBin,
          allowMutations: form.allowMutations,
          allowExec: form.allowExec,
          execTimeoutSec: form.execTimeoutSec,
          pollIntervalSec: form.pollIntervalSec,
          logTailDefault: form.logTailDefault,
          maxOutputKb: form.maxOutputKb,
          targets: form.targets.map((item) => ({
            name: item.name,
            kind: item.kind,
            book: item.book ?? '',
            host: item.host ?? '',
            port: Number(item.port) || 22,
            username: item.username ?? '',
            auth: item.auth ?? 'agent',
            keyPath: item.keyPath ?? '',
            // 空字符串 = 保留原有凭证（宿主按 undefined 处理会覆盖为空，这里显式跳过）
            ...(item.password === undefined || item.password === '' ? {} : { password: item.password }),
            ...(item.passphrase === undefined || item.passphrase === '' ? {} : { passphrase: item.passphrase }),
            agentForward: item.agentForward === true,
          })),
          hostKeys: form.hostKeys,
          // 只有「加载到过非空目标、现在被用户删空」才算显式清空；否则宿主会拒绝写入空数组
          ...(form.targets.length === 0 && loadedCountRef.current > 0 ? { clearTargets: true } : {}),
        }
        api.saveConfig(payload).then((response) => {
          setForm(response.config)
          primeTargetsCache(response.config)
          loadedCountRef.current = Array.isArray(response.config?.targets) ? response.config.targets.length : 0
          // 目标增删会影响 tty 连接栏按钮：刷新解析后的目标列表
          void refreshTargetsCache()
          setMessage(response.warning === undefined
            ? { kind: 'ok', text: '已保存并热生效' }
            : { kind: 'error', text: response.warning })
        }).catch((error) => {
          setMessage({ kind: 'error', text: '保存失败：' + error.message })
        }).finally(() => setSaving(false))
      }

      const sectionTitle = (text) => jsx('div', { className: 'dk_cardSection', children: text })
      const field = (label, control, hint, span) => jsxs('div', {
        className: 'dk_field',
        'data-span': span === undefined ? undefined : String(span),
        children: [
          jsx('span', { className: 'dk_label', children: label }),
          control,
          hint === undefined ? null : jsx('span', { className: 'dk_hint', children: hint }),
        ],
      })

      const numberInput = (key, min, max, hint) => jsx('input', {
        className: 'dk_input',
        type: 'number',
        min,
        max,
        value: form[key],
        onChange: (event) => patch({ [key]: Number(event.target.value) }),
      })

      /*
       * 卡片外壳：整条 li 就是卡片（标题行 + 展开体在同一张卡里），
       * 与 DSH 内置卡片 / 其他插件卡片（pM_pluginCard、tt_card）用同一套度量，
       * 别再用内联样式自己捏一个「看起来是另一套」的头部。
       */
      const card = (body) => jsxs('li', {
        className: 'dk_settingsCard' + (open ? ' dk_settingsCardOpen' : ''),
        children: [
          jsxs('button', {
            type: 'button',
            className: 'dk_settingsHead',
            'aria-expanded': open,
            onClick: () => setOpen((value) => !value),
            children: [
              jsxs('span', { className: 'dk_settingsHeadText', children: [
                jsx('span', { className: 'dk_settingsName', children: 'Docker 容器面板' }),
                jsx('span', { className: 'dk_settingsDesc', children: '本机 / SSH 主机上的容器与镜像；默认只读，变更操作需显式开启' }),
              ] }),
              jsx('span', { className: 'dshkit_badge', children: 'Kit' }),
              jsx('span', { className: 'dk_settingsChevron', dangerouslySetInnerHTML: { __html: ICON_CHEVRON } }),
            ],
          }),
          open ? jsx('div', { className: 'dk_settingsBody', children: body }) : null,
        ],
      })

      if (!open) return card(null)
      if (!loaded || form === null) {
        return card(jsxs('div', { className: 'dk_row', children: [jsx('span', { className: 'dk_spin' }), '读取配置…'] }))
      }

      return card([
        sectionTitle('基本'),
        jsxs('div', { className: 'dk_row', children: [
          jsx('label', { className: 'dk_check', children: [jsx('input', { type: 'checkbox', checked: form.enabled, onChange: (event) => patch({ enabled: event.target.checked }) }), '启用插件'] }),
          jsx('label', { className: 'dk_check', children: [jsx('input', { type: 'checkbox', checked: form.announceToAgent, onChange: (event) => patch({ announceToAgent: event.target.checked }) }), '向 agent 公告能力'] }),
        ] }),
        // 字段用栅格而不是 flex 换行：标签 + 控件按列对齐，数字框宽度一致
        jsxs('div', { className: 'dk_fieldGrid', children: [
          field('docker CLI', jsx('input', { className: 'dk_input', value: form.dockerBin, onChange: (event) => patch({ dockerBin: event.target.value }) }), '默认 docker；podman 可填 podman'),
          field('统计刷新间隔（秒）', numberInput('pollIntervalSec', 1, 60)),
          field('日志默认行数', numberInput('logTailDefault', 1, 5000)),
          field('输出上限（KB）', numberInput('maxOutputKb', 1, 8192)),
          field('exec 超时（秒）', numberInput('execTimeoutSec', 1, 120)),
        ] }),

        sectionTitle('能力开关（默认关闭）'),
        jsxs('div', { className: 'dk_row', children: [
          jsx('label', { className: 'dk_check', children: [jsx('input', { type: 'checkbox', checked: form.allowMutations, onChange: (event) => patch({ allowMutations: event.target.checked }) }), '允许变更操作（启动 / 停止 / 重启 / 删除）'] }),
          jsx('label', { className: 'dk_check', children: [jsx('input', { type: 'checkbox', checked: form.allowExec, onChange: (event) => patch({ allowExec: event.target.checked }) }), '允许 exec（在容器内执行命令）'] }),
        ] }),
        jsx('span', { className: 'dk_hint', children: 'docker socket 等价于目标主机的 root 权限。开启后，浏览器面板与 agent 都能执行对应操作，请只在可信环境下打开。' }),

        sectionTitle('目标'),
        ...form.targets.map((item, index) => jsxs('div', { className: 'dk_targetRow', children: [
          jsx('input', { className: 'dk_input', value: item.name, placeholder: '目标名', onChange: (event) => patchTarget(index, { name: event.target.value }) }),
          jsx('select', { className: 'dk_select', value: item.kind, onChange: (event) => patchTarget(index, { kind: event.target.value }), children: [
            jsx('option', { value: 'local', children: '本机' }),
            jsx('option', { value: 'ssh', children: 'SSH 主机' }),
          ] }),
          item.kind === 'local'
            ? jsx('span', { className: 'dk_hint', children: '宿主所在机器上的 docker' })
            : jsxs('div', { className: 'dk_row', style: { gridColumn: 'span 1' }, children: [
              jsx('select', {
                className: 'dk_select',
                value: item.book ?? '',
                onChange: (event) => patchTarget(index, { book: event.target.value }),
                children: [
                  jsx('option', { value: '', children: form.ttyBooks.length === 0 ? '（无 tty 连接簿，请填内联信息）' : '（不用连接簿，手填）' }),
                  ...form.ttyBooks.map((name) => jsx('option', { value: name, children: '连接簿：' + name }, name)),
                ],
              }),
            ] }),
          jsx('button', { type: 'button', className: 'dk_btn dk_btnDanger', onClick: () => removeTarget(index), children: '删除' }),
          /*
           * 内联 SSH 字段：栅格而不是 flex 换行——host / port / username / auth 与上方
           * 目标名那行上下对齐，凭据（私钥或密码）单独占一行，复选框固定在行尾列。
           */
          item.kind === 'ssh' && (item.book ?? '') === '' ? jsxs('div', { className: 'dk_targetInline', children: [
            jsx('input', { className: 'dk_input', placeholder: 'host', value: item.host ?? '', onChange: (event) => patchTarget(index, { host: event.target.value }) }),
            jsx('input', { className: 'dk_input', placeholder: '22', title: '端口', value: item.port ?? 22, onChange: (event) => patchTarget(index, { port: Number(event.target.value) || 22 }) }),
            jsx('input', { className: 'dk_input', placeholder: 'username', value: item.username ?? '', onChange: (event) => patchTarget(index, { username: event.target.value }) }),
            jsx('select', { className: 'dk_select', value: item.auth ?? 'agent', onChange: (event) => patchTarget(index, { auth: event.target.value }), children: [
              jsx('option', { value: 'agent', children: 'ssh-agent' }),
              jsx('option', { value: 'key', children: '私钥' }),
              jsx('option', { value: 'password', children: '密码' }),
            ] }),
            (item.auth ?? 'agent') === 'key' ? jsx('input', { className: 'dk_input dk_credential', placeholder: '~/.ssh/id_ed25519', value: item.keyPath ?? '', onChange: (event) => patchTarget(index, { keyPath: event.target.value }) }) : null,
            (item.auth ?? 'agent') === 'password' ? jsx('input', { className: 'dk_input dk_credential', type: 'password', placeholder: item.passwordSet === true ? '（已设置，留空保持不变）' : 'env:SSH_PASSWORD', value: item.password ?? '', onChange: (event) => patchTarget(index, { password: event.target.value }) }) : null,
            jsx('label', { className: 'dk_check', children: [jsx('input', { type: 'checkbox', checked: item.agentForward === true, onChange: (event) => patchTarget(index, { agentForward: event.target.checked }) }), 'agent forwarding'] }),
          ] }) : null,
        ] }, String(index) + item.name)),
        jsxs('div', { className: 'dk_row', children: [
          jsx('button', { type: 'button', className: 'dk_btn', onClick: addTarget, children: '添加目标' }),
          jsx('span', { className: 'dk_hint', children: 'SSH 目标推荐直接选 tty 终端面板的连接簿条目（凭证只需维护一处）；手填时密码 / 口令建议写 env:VAR。' }),
        ] }),

        sectionTitle('SSH 主机密钥记录（TOFU）'),
        ...(form.hostKeys.length === 0
          ? [jsx('span', { className: 'dk_hint', children: '暂无记录 — 首次 SSH 连接成功后自动记录主机指纹（若 tty 已记录同一主机，会直接复用）。' }, 'none')]
          : form.hostKeys.map((record) => jsxs('div', { className: 'dk_targetRow', children: [
            jsx('span', { children: record.host + ':' + String(record.port) }),
            jsx('span', { className: 'dk_hint', style: { gridColumn: 'span 2', wordBreak: 'break-all' }, children: 'sha256:' + record.fingerprint }),
            jsx('button', { type: 'button', className: 'dk_btn', onClick: () => removeHostKey(record), children: '删除' }),
          ] }, record.host + ':' + String(record.port)))),
        jsx('span', { className: 'dk_hint', children: '指纹变更时连接会被拒绝（防中间人）；确认安全后删除对应记录即可重连。' }),

        jsxs('div', { className: 'dk_row', children: [
          jsx('button', { type: 'button', className: 'dk_btn dk_btnPrimary', disabled: saving, onClick: save, children: saving ? '保存中…' : '保存' }),
          jsx('span', { className: 'dk_msg', 'data-kind': message.kind, children: message.text }),
        ] }),
      ])
    }

    /* ------------------------------------------------------------------ *
     * 面板挂载 / 侧边栏入口
     * ------------------------------------------------------------------ */

    let hostEl = null
    let root = null
    /** dock 模式的宿主（tty 面板右侧挂载位）；模态模式下为 null。 */
    let dockedPane = null

    /** 收起当前面板（模态宿主 / dock pane 都要清干净）。 */
    function closePanel() {
      const currentRoot = root
      const currentHost = hostEl
      const currentPane = dockedPane
      root = null
      hostEl = null
      dockedPane = null
      // 先摘宿主再卸载（卸载是异步的，避免在 React 渲染中 unmount）；pane 也先摘，
      // 否则紧接着的这次点击会撞上「宿主还在、面板已不可见」的窗口被吞掉
      if (currentHost !== null) currentHost.remove()
      if (currentRoot !== null) {
        setTimeout(() => {
          try {
            currentRoot.unmount()
          } catch {
            /* 已卸载 */
          }
        }, 0)
      }
      if (currentPane !== null) {
        try {
          currentPane.dispose()
        } catch {
          /* 忽略：pane 可能已经被 tty 收掉 */
        }
      }
    }

    /** 鸭子判定挂载点（不依赖宿主全局 HTMLElement，离线冒烟里也能跑）。 */
    function isMountable(value) {
      return value !== null && typeof value === 'object' && typeof value.appendChild === 'function'
    }

    /** tty ≥ 0.16 的右侧挂载位（ttyPanel）：面板开着时优先挂进去，终端保持可见。 */
    function ttyPanelCanDock() {
      return typeof panelApi?.mountPane === 'function'
        && typeof panelApi.isOpen === 'function'
        && Number(panelApi.version ?? 0) >= 1
        && panelApi.isOpen() === true
    }

    function openPanel(options) {
      closePanel()
      ensureStyle()
      const panelProps = {
        onClose: closePanel,
        initialTarget: options?.target ?? '',
        sessionHint: options?.sessionHint,
      }
      // 1) 终端面板开着 → 挂成右侧侧栏（从 SSH 连接栏点「容器」的主路径）
      if (ttyPanelCanDock()) {
        let pane = null
        try {
          pane = panelApi.mountPane({
            title: 'Docker 容器',
            hint: options?.target === undefined || options.target === '' ? '' : options.target,
            size: 520,
            min: 360,
            // 面板自身被关（tty ✕ / 宿主卸载）时，把 docker 这边的 React 树一起收掉
            onClose: () => closePanel(),
          })
        } catch (error) {
          pane = null
          console.warn('[dsh-docker] 挂载到终端面板失败，回退弹窗：' + (error instanceof Error ? error.message : String(error)))
        }
        if (pane !== null && isMountable(pane.element)) {
          dockedPane = pane
          root = createRoot(pane.element)
          root.render(jsx(ContainerPanel, {
            ...panelProps,
            docked: true,
            // 在面板里换目标时同步侧栏灰字（侧栏标题由 tty 渲染，只能经 handle 改）
            onTargetChange: (label) => {
              try {
                pane.setHint(label)
              } catch {
                /* pane 已被收掉 */
              }
            },
          }))
          return
        }
      }
      // 2) 兜底：自带 backdrop 的全屏模态
      hostEl = document.createElement('div')
      document.body.appendChild(hostEl)
      root = createRoot(hostEl)
      root.render(jsx(ContainerPanel, panelProps))
    }

    function sidebarRoot() {
      const column = document.querySelector('[data-pane="sidebar"], [class*="sidebarCol"]')
      if (column === null) return undefined
      return column.querySelector('[class*="logoRow"]')?.parentElement ?? column.firstElementChild
    }

    function newSessionButton(rootNode) {
      const nested = rootNode.querySelector('button[class*="newSession"]')
      if (nested !== null) return nested
      for (const child of rootNode.children) {
        if (child.tagName === 'BUTTON') return child
      }
      return undefined
    }

    function createSidebarEntry() {
      const entry = document.createElement('div')
      entry.dataset.dshDockerEntry = ''
      entry.className = 'dk_sidebarEntry'
      entry.setAttribute('role', 'button')
      entry.setAttribute('aria-label', '容器')
      entry.innerHTML =
        '<span class="dk_entryIcon">' + ICON_BOX + '</span>' +
        '<span class="dk_entryLabel">容器</span>'
      entry.addEventListener('click', (event) => {
        event.preventDefault()
        openPanel()
      })
      return entry
    }

    function placeSidebarEntry(rootNode, entry) {
      const button = newSessionButton(rootNode)
      if (button === undefined) return false
      if (entry.parentElement !== rootNode) {
        const row = button.closest('[class*="logoRow"]')
        const base = row !== null && row.parentElement === rootNode ? row : button
        const family = Array.from(rootNode.children).filter((el) => el instanceof HTMLElement && el.matches('[data-dsh-global-search-entry], [data-dsh-rss-entry], [data-dsh-taskboard-entry], [data-dsh-ssh-entry], [data-dsh-tty-entry], [data-dsh-docker-entry]'))
        if (family.length > 0) {
          const last = family[family.length - 1]
          rootNode.insertBefore(entry, last.nextSibling)
        } else {
          rootNode.insertBefore(entry, base.nextElementSibling)
        }
      }
      return true
    }

    function mountSidebarEntry() {
      ensureStyle()
      if (document.querySelector('[data-dsh-docker-entry]') !== null) return () => {}
      const entry = createSidebarEntry()
      let rootNode
      let placed = false

      const tryPlace = () => {
        if (rootNode !== undefined && !rootNode.isConnected) {
          rootObserver.disconnect()
          rootNode = undefined
          placed = false
        }
        if (placed) {
          if (document.body.contains(entry)) return
          rootObserver.disconnect()
          rootNode = undefined
          placed = false
        }
        rootNode ??= sidebarRoot()
        if (rootNode === undefined) return
        placed = placeSidebarEntry(rootNode, entry)
        if (placed) rootObserver.observe(rootNode, { childList: true, subtree: true })
      }

      const waitObserver = new MutationObserver(() => {
        tryPlace()
      })
      waitObserver.observe(document.body, { childList: true, subtree: true })

      const rootObserver = new MutationObserver(() => {
        if (rootNode === undefined || !rootNode.isConnected) {
          placed = false
          tryPlace()
          return
        }
        if (!rootNode.contains(entry)) placed = placeSidebarEntry(rootNode, entry)
      })

      tryPlace()
      return () => {
        waitObserver.disconnect()
        rootObserver.disconnect()
        entry.remove()
      }
    }

    /* ------------------------------------------------------------------ *
     * 注册
     * ------------------------------------------------------------------ */

    const exports = {}
    exports.inject = ['slots']
    exports.apply = (ctx) => {
      ensureStyle()
      // 侧栏入口先按可见挂载（与旧行为一致），config 确认禁用后由闸门收起；
      // 运行期显隐由 syncEntryFromConfig（缓存刷新 / 设置卡片保存后）驱动
      let entryMounted = false
      let unmountEntry = () => {}
      entryGate = {
        set(visible) {
          if (visible === entryMounted) return
          entryMounted = visible
          if (visible) {
            unmountEntry = mountSidebarEntry()
            return
          }
          unmountEntry()
          unmountEntry = () => {}
          // 禁用瞬间的面板一起收掉：面板里的数据请求已被宿主 403，留着只会报错
          closePanel()
          if (typeof connbarApi?.requestRender === 'function') connbarApi.requestRender()
        },
      }
      setEntryVisible(true)
      const disposeCard = ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
        name: 'settings.plugin.item',
        // key 必须是该卡片所编辑的 settings 命名空间
        key: 'docker',
        order: 102,
      }, DockerSettingsCard))

      // 上下文入口（可选）：tty 0.13.0 起提供 ttyConnbar 客户端服务，在 SSH 连接栏
      // 里插入「容器」按钮。**注册即显示**（SSH 标签一律显示），目标在点击时解析：
      // 命中已配置目标 → 直接打开该目标；未命中 → 打开面板并提示如何配置。
      // 终端能力（可选）：tty 0.14.0 起提供 ttyTerminal 服务，卡片「终端」按钮
      // 直接开一个标签跑 `docker exec -it <容器> sh`；拿不到就退回复制命令
      ctx.inject(['ttyTerminal'], (terminalCtx) => {
        terminalApi = terminalCtx.ttyTerminal ?? null
        return () => { terminalApi = null }
      })

      // 面板挂载位（可选）：tty 0.16.0 起提供 ttyPanel 服务，面板开着时容器面板
      // 直接挂进它的右侧侧栏，不再用模态盖住终端
      ctx.inject(['ttyPanel'], (panelCtx) => {
        panelApi = panelCtx.ttyPanel ?? null
        return () => { panelApi = null }
      })

      let disposeConnbarAction = () => {}
      void refreshTargetsCache()
      ctx.inject(['ttyConnbar'], (connbarCtx) => {
        const connbar = connbarCtx.ttyConnbar
        if (connbar === undefined) return
        connbarApi = connbar
        disposeConnbarAction = connbar.addAction((payload) => {
          // 插件禁用时连接栏不提供「容器」按钮（tty 下次渲染连接栏时生效）
          if (!entryVisible) return
          const spec = payload?.spec ?? {}
          if (spec.t !== 'ssh') return
          const bookName = typeof payload?.bookName === 'string' ? payload.bookName : ''
          const matched = matchTargetForSession(spec, bookName)
          const title = matched !== undefined
            ? `打开该主机的 Docker 容器面板（目标：${matched}）`
            : configCache === null
              // 缓存还没拿到（挂载时的请求可能仍在飞/失败）：别断言「未配置」
              ? '打开当前会话主机的 Docker 容器面板'
              : '该主机尚未配置为 Docker 目标 — 点击打开面板查看/配置'
          payload.addAction(ICON_BOX_SM, '容器', title, () => {
            // 点击时以「现场解析」为准：缓存没命中就现拉一次，避免启动期竞态
            void (async () => {
              const resolved = await resolveTargetForSession(spec, bookName)
              const rawPort = Number(spec.port)
              openPanel({
                target: resolved ?? '',
                sessionHint: resolved === undefined
                  ? { host: typeof spec.host === 'string' ? spec.host : '', port: Number.isInteger(rawPort) && rawPort > 0 ? rawPort : 22, book: bookName }
                  : undefined,
              })
            })()
          })
        })

        // 首次缓存兜底重试（挂载时那次请求可能早于宿主就绪）：成功后请 tty 重绘，
        // 让按钮标题与匹配状态立刻变准；三次都失败则留给点击路径现场再拉。
        void (async () => {
          for (let attempt = 0; attempt < 3; attempt += 1) {
            if (await refreshTargetsCache()) {
              if (typeof connbar.requestRender === 'function') connbar.requestRender()
              return
            }
            await new Promise((resolve) => setTimeout(resolve, 2000))
          }
        })()
      })

      return () => {
        disposeConnbarAction()
        disposeCard()
        entryGate = null
        entryVisible = false
        connbarApi = null
        unmountEntry()
        closePanel()
      }
    }
    return exports
  },
})
