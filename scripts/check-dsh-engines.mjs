#!/usr/bin/env node
/**
 * 防回归：可安装为 DSH 插件的包必须声明 `dsh.engines.dsh`，且只能是唯一支持形式。
 *
 * 为什么这是硬门禁：
 *  - 未声明 —— dsh-web 的插件市场与插件管理器把兼容性显示为「未知」，用户无法判断
 *    能不能装；
 *  - 声明成 `^0.1.2` / `~0.1.2` / 光秃秃 `0.1.2` / 两段式 `>=0.1.2-rc.1 <0.2.0`
 *    —— dsh-web 的解析器（`packages/dsh-plugin-manager/src/core/version.ts` 的
 *    `MINIMUM_RANGE_PATTERN`）只认 `>=X.Y.Z[-预发布]`，其余形态一律返回 undefined；
 *    而按该模块的契约，**已声明但无法验证是 fail-closed**——更新会被直接拦下，
 *    比不声明更糟（上游 issue #754）。
 *    注意 `^0.1.2` 另有陷阱：`^` 不包含下限版本自身的预发布，DSH 长期以 `-rc.N`
 *    发布，已实测可用的 `0.1.2-rc.1` 会被判成不兼容。所以下限必须显式带 RC。
 *
 * 覆盖范围：`scripts/publish-targets.mjs` 里**声明了 `dsh.bundle.patch`** 的包
 * （= 能被 `dsh plugin` 挂载的插件，含 packages/all 与根 bundle）+ `templates/hello`
 * 模板（新插件由它复制生成，模板不合规等于批量制造不合规插件）。
 * 纯库包（如 `@hyzyn/dsh-kit`，没有 `dsh.bundle`）不参与挂载，不加这个字段；反过来
 * 给库包加 `dsh` 字段还会让「有 dsh 字段即插件」的启发式判定误认它为插件，故排除。
 *
 * 用法：node scripts/check-dsh-engines.mjs（CI 与 release workflow 均调用）
 */
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { targets } from './publish-targets.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** dsh-web 解析器支持的唯一形式：`>=X.Y.Z`，可选 `-rc.N` 之类的预发布后缀。 */
const SUPPORTED = /^>=\s*v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/

/** 新插件模板也必须合规，否则每个新包都带着同一个缺口出厂。 */
const TEMPLATE = 'templates/hello/package.json'

function readJson(rel) {
  return JSON.parse(readFileSync(join(root, rel), 'utf8'))
}

const problems = []
const floors = new Map()

/** 校验一个「可挂载插件」包的声明；返回声明的下限值（可能为 undefined）。 */
function checkPlugin(rel, name) {
  let pkg
  try {
    pkg = readJson(rel)
  } catch (err) {
    problems.push({ name, rel, kind: '读取失败', detail: err.message })
    return undefined
  }
  const dsh = pkg.dsh ?? {}
  if (dsh.bundle?.patch === undefined) {
    // 不是可挂载插件，不参与本检查
    return undefined
  }
  const declared = dsh.engines?.dsh
  if (declared === undefined) {
    problems.push({
      name,
      rel,
      kind: '缺少 dsh.engines.dsh',
      detail: '市场 / 插件管理器会把兼容性显示为「未知」',
    })
    return undefined
  }
  if (typeof declared !== 'string' || !SUPPORTED.test(declared.trim())) {
    problems.push({
      name,
      rel,
      kind: '形式不受支持',
      detail: `${JSON.stringify(declared)} —— 只支持 ">=X.Y.Z[-预发布]"，其余形态会被判为「无法验证」并 fail-closed（更新被拦）`,
    })
    return undefined
  }
  // 顶层 engines.dsh 是插件管理器兼容读取的备用位；两者并存时以 dsh.engines.dsh 为准，
  // 但留着旧位置容易让人以为改了这里就生效，且历史遗留值多为不受支持的两段式范围。
  const legacy = pkg.engines?.dsh
  if (legacy !== undefined) {
    problems.push({
      name,
      rel,
      kind: '顶层 engines.dsh 残留',
      detail: `${JSON.stringify(legacy)} —— 统一写进 dsh.engines.dsh，删掉顶层这个备用位`,
    })
  }
  return declared.trim()
}

for (const [dir, name] of targets) {
  const rel = dir === '.' ? 'package.json' : `${dir}/package.json`
  const floor = checkPlugin(rel, name)
  if (floor !== undefined) floors.set(name, floor)
}

// 模板不在发布清单里，单独查
try {
  const tpl = readJson(TEMPLATE)
  const declared = tpl.dsh?.engines?.dsh
  if (typeof declared !== 'string' || !SUPPORTED.test(declared.trim())) {
    problems.push({
      name: '@hyzyn/dsh-hello（模板）',
      rel: TEMPLATE,
      kind: '缺少或形式不受支持的 dsh.engines.dsh',
      detail: `当前 ${JSON.stringify(declared)} —— 新插件从模板复制，必须同步合规`,
    })
  } else {
    floors.set('@hyzyn/dsh-hello（模板）', declared.trim())
  }
} catch (err) {
  problems.push({ name: '@hyzyn/dsh-hello（模板）', rel: TEMPLATE, kind: '读取失败', detail: err.message })
}

if (problems.length > 0) {
  console.error(`✘ dsh.engines.dsh 检查未通过：${problems.length} 处问题\n`)
  for (const p of problems) {
    console.error(`  ${p.name}  (${p.rel})`)
    console.error(`    ${p.kind}：${p.detail}`)
  }
  console.error(
    '\n修复：在包的 package.json 里写\n' +
      '  "dsh": {\n' +
      '    "bundle": { "patch": "./cordis.patch.yml" },\n' +
      '    "engines": { "dsh": ">=0.1.2-rc.1" }\n' +
      '  }\n' +
      '下限跟随当前适配的 DSH cohort，SDK cohort 升级时同步提升全部包的该字段。\n',
  )
  process.exit(1)
}

const distinct = new Set(floors.values())
console.log(`✔ dsh.engines.dsh 检查通过：${floors.size} 个可安装插件声明有效`)
if (distinct.size > 1) {
  // 本仓库按 cohort 整体升级；出现分叉通常是有包在升级时被漏掉，值得人工确认。
  console.warn(`⚠ 下限声明不一致（${[...distinct].join(' / ')}）：cohort 升级时应同步提升全部包`)
}
