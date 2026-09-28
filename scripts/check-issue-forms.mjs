#!/usr/bin/env node
/**
 * Issue 表单闸门：`.github/ISSUE_TEMPLATE/*.yml` 的 schema 与表单内仓库链接必须有效。
 *
 * ## 为什么要有这一份
 *
 * 表单是「提 issue 的格式约束」的强制点（见 docs/conventions.md § Issue），但它的两类坏法
 * 全都是**静默**的——没有任何别的东西会红：
 *
 *   1. **schema 破**（重复 id / label 撞车 / 缩进错）：GitHub 只是在 issue 选择器里
 *      **不显示这张表**，等用户来报「表单没了」才知道；
 *   2. **表单内链接死**：description / contact_links 里指向仓库文档的链接，在文档搬家或
 *      改名后变 404——`check-doc-links.mjs` 只扫 markdown，**不扫 yml**；
 *   3. **`config.yml` 的 `blank_issues_enabled: false` 被改回 / 文件被删**：空白 issue
 *      入口悄悄回来，「限制」名存实亡。
 *
 * 所以这道闸的职责 = 「该有的东西找不到就报缺失」，与本仓其它闸门同一套设计原则。
 *
 * ## 已知边界（是取舍，不是 bug）
 *
 *   - 只验指向**本仓**的链接（`github.com/hyzyn/dsh-plugin-kit/blob/<branch>/<path>` 与
 *     仓库根 `#锚点`）。issues 查询等其它 URL 不验——那是外链可达性，同 check-doc-links
 *     的取舍（要联网，不适合放进闸门）。
 *   - 不验 conventions.md § Issue 那张「字段↔排查动作」表与表单字段的同步：表是散文不是
 *     索引，硬绑只会让改措辞的人被误报。那三处文档同步靠 conventions.md § Issue 第 6 条。
 *   - `upload` 类型只查 label——本仓表单没用它，遇到了再补细则。
 *
 * ## 为什么强制每个输入项给 `id`
 *
 * GitHub 没给 `id` 时用 label 生成字段引用，生成器是 Rails `parameterize`——**中文 label
 * 可能被处理成空串而互相撞车**（报 "labels are too similar"）。官方解法就是给唯一 `id`，
 * 所以本仓把「显式 id」从官方的可选升成必选，一次写好，不靠人记。
 *
 * 用法：
 *   node scripts/check-issue-forms.mjs              # 查真实仓库（CI 用）
 *   node scripts/check-issue-forms.mjs --self-test  # 自检判据（CI 用）
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import YAML from 'yaml'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const TEMPLATE_DIR = '.github/ISSUE_TEMPLATE'

/** GitHub 表单 schema 允许的输入类型（与官方文档一致）。 */
const TYPES = new Set(['markdown', 'textarea', 'input', 'dropdown', 'checkboxes', 'upload'])

/** 每种类型允许的 attributes 键；出现表外键多半是写错了位置（比如把 placeholder 写到 dropdown 上）。 */
const ATTR_KEYS = {
  markdown: new Set(['value']),
  input: new Set(['label', 'description', 'placeholder', 'value']),
  textarea: new Set(['label', 'description', 'placeholder', 'value', 'render']),
  dropdown: new Set(['label', 'description', 'multiple', 'options', 'default']),
  checkboxes: new Set(['label', 'description', 'options']),
  upload: new Set(['label', 'description']),
}

const ID_RE = /^[A-Za-z0-9_-]+$/
const NON_EMPTY = (v) => typeof v === 'string' && v.trim() !== ''

/**
 * GitHub 标题锚点的近似实现——**与 check-doc-links.mjs 同款**，刻意各自留一份拷贝：
 * 两处判据独立演化时，谁改坏了另一处还能报出来。
 */
function slug(heading) {
  return heading
    .replace(/[*`]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N} _-]/gu, '')
    .replace(/ /g, '-')
}

/** 收集一段 markdown 的标题锚点集合。 */
function anchorsOf(text) {
  return new Set([...text.matchAll(/^#{1,6} (.+)$/gm)].map((m) => slug(m[1])))
}

/** 从 yml 原文里抽出指向本仓的 URL（含 blob 链接与仓库根锚点链接）。 */
const REPO_URL_RE = /https:\/\/github\.com\/hyzyn\/dsh-plugin-kit(?:\/[^\s)"'`\]]+)?(?:#[^\s)"'`\]]+)?/g

/**
 * 校验一张表单的解析结果（YAML 已 parse 成对象）。
 * @returns {Array<{kind, message}>}
 */
export function checkForm(file, doc) {
  const diffs = []
  const at = (kind, message) => diffs.push({ kind, file, message })

  for (const k of ['name', 'description']) {
    if (!NON_EMPTY(doc?.[k])) at('form.toplevel.absent', `缺顶层键 ${k}（或非空字符串）`)
  }
  if (doc && !Array.isArray(doc.body)) at('form.toplevel.absent', '缺顶层键 body（必须是数组）')
  if (diffs.length > 0) return diffs

  if (doc.body.length === 0) at('form.body.empty', 'body 是空数组')
  if (doc.body.every((e) => e?.type === 'markdown')) {
    at('form.body.markdownOnly', 'body 全是 markdown：至少需要一个输入项（GitHub 拒绝纯说明的表单）')
  }

  const ids = new Set()
  const labels = new Set()
  const checkboxLabels = []

  doc.body.forEach((el, i) => {
    const p = `body[${i}]`
    if (!el || typeof el !== 'object') return at('form.element.invalid', `${p} 不是对象`)
    if (!TYPES.has(el.type)) return at('form.type.invalid', `${p} 非法 type：${JSON.stringify(el.type)}`)
    for (const k of Object.keys(el)) {
      if (!['type', 'id', 'attributes', 'validations'].includes(k)) {
        at('form.element.key', `${p} 出现不允许的键 ${k}（只认 type/id/attributes/validations）`)
      }
    }

    const attrs = el.attributes ?? {}
    for (const k of Object.keys(attrs)) {
      if (!ATTR_KEYS[el.type].has(k)) at('form.attr.key', `${p}（${el.type}）的 attributes 里不该有 ${k}`)
    }
    if (el.validations !== undefined) {
      for (const k of Object.keys(el.validations)) {
        if (k !== 'required') at('form.validations.key', `${p} 的 validations 里不该有 ${k}`)
      }
      if (el.validations.required !== undefined && typeof el.validations.required !== 'boolean') {
        at('form.validations.key', `${p} 的 validations.required 不是布尔`)
      }
    }

    if (el.type === 'markdown') {
      if (!NON_EMPTY(attrs.value)) at('form.markdown.value.absent', `${p} markdown 缺 attributes.value`)
      return
    }

    // —— 输入项 ——
    if (!NON_EMPTY(attrs.label)) at('form.label.absent', `${p}（${el.type}）缺 attributes.label`)
    else if (labels.has(attrs.label)) at('form.label.duplicate', `${p} label 重复：「${attrs.label}」`)
    else labels.add(attrs.label)

    if (el.id === undefined) {
      at('form.id.absent', `${p}（${el.type}「${attrs.label ?? '?'}」）缺 id：中文 label 经 parameterize 可能撞车，本仓强制显式给 id`)
    } else if (!ID_RE.test(el.id)) {
      at('form.id.charset', `${p} id「${el.id}」含非法字符（只许字母/数字/-/_）`)
    } else if (ids.has(el.id)) {
      at('form.id.duplicate', `${p} id 重复：${el.id}`)
    } else ids.add(el.id)

    if (el.type === 'dropdown') {
      const opts = attrs.options
      if (!Array.isArray(opts) || opts.length === 0) at('form.dropdown.options', `${p} dropdown 缺非空 options`)
      else {
        for (const o of opts) if (!NON_EMPTY(o)) at('form.dropdown.options', `${p} 存在空 option`)
        if (new Set(opts).size !== opts.length) at('form.dropdown.options', `${p} options 有重复`)
      }
      if (attrs.multiple !== undefined && typeof attrs.multiple !== 'boolean') {
        at('form.attr.key', `${p} dropdown 的 multiple 不是布尔`)
      }
    }

    if (el.type === 'checkboxes') {
      const opts = attrs.options
      if (!Array.isArray(opts) || opts.length === 0) at('form.checkbox.options', `${p} checkboxes 缺非空 options`)
      else {
        for (const o of opts) {
          if (!o || typeof o !== 'object' || !NON_EMPTY(o.label)) at('form.checkbox.options', `${p} 存在缺 label 的 checkbox`)
          else checkboxLabels.push(o.label)
          if (o && typeof o === 'object') {
            for (const k of Object.keys(o)) {
              if (!['label', 'required'].includes(k)) at('form.checkbox.options', `${p} checkbox 项里不该有 ${k}`)
            }
            if (o.required !== undefined && typeof o.required !== 'boolean') {
              at('form.checkbox.options', `${p} checkbox 的 required 不是布尔`)
            }
          }
        }
      }
    }
  })

  // checkbox label 既要在组内唯一，也不能与任何输入项 label 撞车（GitHub 文档原文要求）
  for (const l of checkboxLabels) {
    if (labels.has(l)) at('form.checkbox.label.clash', `checkbox「${l}」与某个输入项 label 撞车`)
    if (checkboxLabels.filter((x) => x === l).length > 1) at('form.checkbox.label.clash', `checkbox label 组内重复：「${l}」`)
  }
  return diffs
}

/** 校验 config.yml（本仓硬决定：空白 issue 必须关）。 */
export function checkConfig(doc) {
  const diffs = []
  const at = (kind, message) => diffs.push({ kind, file: 'config.yml', message })
  if (doc?.blank_issues_enabled !== false) {
    at('config.blank.enabled', 'blank_issues_enabled 不是 false：空白 issue 入口回来了，「格式限制」名存实亡')
  }
  if (doc?.contact_links !== undefined) {
    if (!Array.isArray(doc.contact_links)) at('config.links.invalid', 'contact_links 必须是数组')
    else {
      doc.contact_links.forEach((l, i) => {
        for (const k of ['name', 'url', 'about']) {
          if (!NON_EMPTY(l?.[k])) at('config.links.invalid', `contact_links[${i}] 缺 ${k}`)
        }
        if (NON_EMPTY(l?.url) && !/^https:\/\//.test(l.url)) {
          at('config.links.invalid', `contact_links[${i}] 的 url 不是 https（GitHub 只收绝对 https 链接）`)
        }
      })
    }
  }
  return diffs
}

/** 校验 yml 原文里指向本仓的链接（blob 路径存在；.md 锚点命中标题）。 */
export function checkLinks(file, text, io) {
  const diffs = []
  const at = (kind, message) => diffs.push({ kind, file, message })
  for (const m of text.matchAll(REPO_URL_RE)) {
    const [withoutHash, hash] = m[0].split('#', 2)
    const rest = withoutHash.replace('https://github.com/hyzyn/dsh-plugin-kit', '')
    let rel
    if (rest.startsWith('/blob/')) {
      rel = rest.slice('/blob/'.length).split('/').slice(1).join('/') // 去掉分支名
    } else if (rest === '') {
      if (!hash) continue // 纯仓库链接，没有可验目标
      rel = 'README.md' // 仓库根锚点 = README 的标题
    } else {
      continue // /issues?q=… 等其它 URL：不验（见文件头「已知边界」）
    }
    if (!io.exists(rel)) {
      at('link.path.absent', `指向仓库的链接落空了：${m[0]}（仓库里没有 ${rel}）`)
      continue
    }
    if (hash && rel.endsWith('.md')) {
      const anchors = anchorsOf(io.readText(rel))
      if (!anchors.has(hash)) {
        at('link.anchor.absent', `锚点落空：${m[0]}（${rel} 里没有对应标题）`)
      }
    }
  }
  return diffs
}

/**
 * 校验整个模板目录。
 * @param input `{ files, exists, readText }`：files 是 `{name, text}` 数组；后两个是仓库文件访问口。
 */
export function checkTemplateDir({ files, exists, readText }) {
  const diffs = []
  const forms = files.filter((f) => f.name !== 'config.yml')
  const names = new Set()

  if (forms.length === 0) diffs.push({ kind: 'template.none', message: 'ISSUE_TEMPLATE 里一张表单都没有' })
  if (!files.some((f) => f.name === 'config.yml')) {
    diffs.push({ kind: 'config.absent', message: 'config.yml 没了：blank_issues_enabled 约束随之消失，空白 issue 入口会回来' })
  }

  for (const { name, text } of files) {
    let doc
    try {
      doc = YAML.parse(text)
    } catch (e) {
      diffs.push({ kind: 'form.yaml.parse', file: name, message: `YAML 解析失败：${String(e.message).split('\n')[0]}` })
      continue
    }
    diffs.push(...(name === 'config.yml' ? checkConfig(doc) : checkForm(name, doc)))
    if (name !== 'config.yml' && NON_EMPTY(doc?.name)) {
      if (names.has(doc.name)) diffs.push({ kind: 'form.name.duplicate', file: name, message: `表单 name 重复：「${doc.name}」` })
      names.add(doc.name)
    }
    diffs.push(...checkLinks(name, text, { exists, readText }))
  }
  return diffs
}

/** 读真实仓库（只读）。 */
export function checkRepo(repoRoot = root) {
  const dir = join(repoRoot, TEMPLATE_DIR)
  const files = readdirSync(dir)
    .filter((n) => /\.ya?ml$/.test(n))
    .sort()
    .map((name) => ({ name, text: readFileSync(join(dir, name), 'utf8') }))
  return checkTemplateDir({
    files,
    exists: (rel) => existsSync(join(repoRoot, rel)),
    readText: (rel) => readFileSync(join(repoRoot, rel), 'utf8'),
  })
}

/** 自检：把判据钉死在夹具上（CI 跑，防止闸门自己被改坏）。 */
function selfTest() {
  const io = {
    exists: (rel) => new Set(['docs/troubleshooting.md', 'README.md']).has(rel),
    readText: (rel) => (rel === 'docs/troubleshooting.md' ? '## 通用顺序\n\n正文\n' : '## 文档地图\n\n正文\n'),
  }
  const goodForm = `name: 🐞 测试表单
description: 说明
body:
  - type: markdown
    attributes:
      value: 看 [排障](https://github.com/hyzyn/dsh-plugin-kit/blob/main/docs/troubleshooting.md#通用顺序)
  - type: input
    id: dsh_version
    attributes:
      label: DSH 版本
  - type: dropdown
    id: runtime
    attributes:
      label: 运行形态
      options: [浏览器, 桌面版]
  - type: checkboxes
    id: ack
    attributes:
      label: 提交前确认
      options:
        - label: 我确认
          required: true
`
  const goodConfig = `blank_issues_enabled: false
contact_links:
  - name: 📖 排障文档
    url: https://github.com/hyzyn/dsh-plugin-kit/blob/main/docs/troubleshooting.md
    about: 先自查
`
  const base = (body, extra = '') => `name: 测试\ndescription: 说明\nbody:\n${body}${extra}`
  const oneInput = '  - type: input\n    id: a\n    attributes:\n      label: 字段甲\n'
  const cases = [
    ['好表单 + 好 config + 好链接', { 'a.yml': goodForm, 'config.yml': goodConfig }, []],
    ['缺 id', { 'a.yml': base('  - type: input\n    attributes:\n      label: 字段甲\n'), 'config.yml': goodConfig }, ['form.id.absent']],
    ['id 含中文', { 'a.yml': base('  - type: input\n    id: 版本\n    attributes:\n      label: 字段甲\n'), 'config.yml': goodConfig }, ['form.id.charset']],
    ['label 重复', { 'a.yml': base(oneInput + '  - type: input\n    id: b\n    attributes:\n      label: 字段甲\n'), 'config.yml': goodConfig }, ['form.label.duplicate']],
    ['body 全是 markdown', { 'a.yml': base('  - type: markdown\n    attributes:\n      value: 只有说明\n'), 'config.yml': goodConfig }, ['form.body.markdownOnly']],
    ['dropdown 选项重复', { 'a.yml': base('  - type: dropdown\n    id: a\n    attributes:\n      label: 类型\n      options: [甲, 甲]\n'), 'config.yml': goodConfig }, ['form.dropdown.options']],
    ['checkbox 与输入项 label 撞车', { 'a.yml': base(oneInput + '  - type: checkboxes\n    id: c\n    attributes:\n      label: 确认\n      options:\n        - label: 字段甲\n'), 'config.yml': goodConfig }, ['form.checkbox.label.clash']],
    ['元素里多了键', { 'a.yml': base('  - type: input\n    id: a\n    visible: true\n    attributes:\n      label: 字段甲\n'), 'config.yml': goodConfig }, ['form.element.key']],
    ['属性放错类型', { 'a.yml': base('  - type: dropdown\n    id: a\n    attributes:\n      label: 类型\n      placeholder: 选一个\n      options: [甲]\n'), 'config.yml': goodConfig }, ['form.attr.key']],
    ['缺 config.yml', { 'a.yml': goodForm }, ['config.absent']],
    ['空白 issue 被打开', { 'a.yml': goodForm, 'config.yml': 'blank_issues_enabled: true\n' }, ['config.blank.enabled']],
    ['表单 name 重复', { 'a.yml': goodForm, 'b.yml': goodForm, 'config.yml': goodConfig }, ['form.name.duplicate']],
    ['死链接', { 'a.yml': goodForm.replace('docs/troubleshooting.md', 'docs/gone.md'), 'config.yml': goodConfig }, ['link.path.absent']],
    ['死锚点', { 'a.yml': goodForm.replace('#通用顺序', '#不存在的小节'), 'config.yml': goodConfig }, ['link.anchor.absent']],
    ['YAML 语法破', { 'a.yml': 'name: [未闭合\n', 'config.yml': goodConfig }, ['form.yaml.parse']],
  ]
  let failed = 0
  for (const [label, fileMap, expectedKinds] of cases) {
    const files = Object.entries(fileMap).map(([name, text]) => ({ name, text }))
    const kinds = new Set(checkTemplateDir({ files, exists: io.exists, readText: io.readText }).map((d) => d.kind))
    for (const k of expectedKinds) {
      if (!kinds.has(k)) { failed += 1; console.error(`  ✘ ${label}：期望报 ${k}，实得 ${[...kinds].join(', ') || '（无差异）'}`) }
    }
    if (expectedKinds.length === 0 && kinds.size > 0) { failed += 1; console.error(`  ✘ ${label}：期望无差异，实得 ${[...kinds].join(', ')}`) }
  }
  if (failed > 0) { console.error(`✘ [check-issue-forms] 自检失败 ${failed} 项`); process.exit(1) }
  console.log(`✓ [check-issue-forms] 自检通过（${cases.length} 组夹具）`)
  process.exit(0)
}

/* ------------------------------ CLI ------------------------------ */

if (process.argv.includes('--self-test')) selfTest()

const diffs = checkRepo()
if (diffs.length > 0) {
  console.error('[check-issue-forms] Issue 表单闸门未通过：')
  for (const d of diffs) console.error(`  ✘ ${d.kind}  ${d.file ?? ''} ${d.message}`)
  console.error('\n表单 schema 见 GitHub 文档；判据与本仓取舍见 scripts/check-issue-forms.mjs 文件头。')
  process.exit(1)
}
console.log('[check-issue-forms] 通过：表单 schema 与表单内仓库链接全部有效')
