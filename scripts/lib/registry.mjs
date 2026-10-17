/**
 * npm registry 读取助手（发布流共用：`release-publish-tag.mjs` / `release-publish-all.mjs`）。
 *
 * 两条纪律都在这里、都别再各写一份：
 *
 * 1. **轮询一律走「单版本小端点」**，不拉整份 packument：整份 packument 实测 144 KB
 *    （`@hyzyn/dsh-docker`，2026-09-25），按 6 秒间隔轮询 20 次等于把同一份文档反复拉 20 遍，
 *    极易被 CDN 缓存 / 限流；而 `curl -sf` 遇非 2xx 直接抛错、又被 catch 吞掉，于是表现为
 *    「publish 其实成功、回查却说没读到」的假失败——v0.1.39 / v0.1.41 / v0.1.44 三次发布都因此
 *    误红，每次都要人工删 tag 重打一遍才收场。
 * 2. **`Cache-Control: no-cache` + 随机 `?cb=`**：提示中间层回源，并让它无法命中缓存
 *    （registry 一侧忽略未知查询参数，实测 `/<pkg>/latest?cb=…` 照常 200）。
 */
import { execSync } from 'node:child_process'

/** 发布目标 registry（本仓只发 npmjs；镜像会让包「发成功但用户装不到」，见 RELEASING 排错表）。 */
export const REGISTRY = 'https://registry.npmjs.org'

let reqSeq = 0

/** 生成一个无法命中缓存的查询串。 */
export function cacheBust() {
  reqSeq += 1
  return `cb=${Date.now()}-${reqSeq}`
}

/**
 * 拉一个 registry JSON 端点（curl 带重试；非 2xx 抛错）。
 *
 * @param {string} path 端点路径（不含 registry 前缀，包名需自行 encodeURIComponent）
 * @returns {any}
 */
export function curlJson(path) {
  const out = execSync(
    `curl -sf --retry 3 -H 'Cache-Control: no-cache' '${REGISTRY}/${path}?${cacheBust()}'`,
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  )
  return JSON.parse(out)
}

/**
 * 取某个包某个版本的 manifest。
 *
 * `/  <pkg>/<ref>`：ref 可以是版本号，也可以是 dist-tag——registry 自动解析（实测
 * `@deepseek-ai/dsh/next` → 0.1.7-rc.2 而 `/latest` → 0.1.5-rc.3，确实按 tag 取值），
 * 只返回那一个 version 的 manifest，实测 3.1 KB，比整份 packument 小 46 倍。
 *
 * @param {string} name 包名
 * @param {string} ref 版本号或 dist-tag
 * @returns {any}
 */
export function fetchManifest(name, ref) {
  return curlJson(`${encodeURIComponent(name)}/${encodeURIComponent(ref)}`)
}

/**
 * 取整份 packument（144 KB）：只用在两处非轮询场景——探测包是否存在、窗口耗尽后的权威复核。
 *
 * @param {string} name 包名
 * @returns {any}
 */
export function fetchPackument(name) {
  return curlJson(encodeURIComponent(name))
}
