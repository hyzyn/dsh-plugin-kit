/* eslint-disable */
/**
 * @hyzyn/dsh-devdata — 浏览器半体：官方「插件配置」里的一张卡片。
 *
 * ## 为什么有这张卡片
 *
 * 这一版宿主**没有任何客户端代码消费 `autoGenerate`**（`devfront` 真机三面扫过），所以「按
 * Config schema 生成表单」这条路走不通——每张卡片都得自己写（tty / docker 同款）。在那之前
 * devdata 只能在 profile 补丁层手改配置，而 `capabilities` / `doctor` 报出来的「配置问题」用户
 * 没有 UI 可以去改。
 *
 * 这张卡片补上三件：
 *
 *   1. **标量**可改并落盘：`enabled` / `announceToAgent` / `auditFile` / `timeoutMs` /
 *      计划护栏 `plan.maxRows` · `plan.maxCost`；
 *   2. **目标编辑器**（结构化表单，不是 YAML 自由文本）：每行 id / 名字 / 引擎 / 环境档 /
 *      作用域目录 / `maxScanCount` / 连接（host·port·db）/ 凭据引用，可增删改。**改目标要逐次
 *      确认**（那个复选框 → `confirmTargetEdit: true`）——它决定「工具能在哪个目标、哪个引擎、
 *      哪个环境、哪个范围上动手」，与 `env_down` 同一档；
 *   3. **能力档只读面板**：`writeCapability` / `dangerousReadCapability` 两档的
 *      「声明的变量名 + 当前是否已授权 + 怎么授权」。
 *
 * ## 能力档**刻意只读**（这是本卡片最重要的一条设计）
 *
 * 这两档的授权判据是「**宿主启动继承层**里那个变量的值 ∈ `1/true/yes/on`」，而变量名来自配置。
 * 把它指向**另一个恰好为真**的变量（例如 `CI=true`），页内脚本一条 `POST` 就等于**免重启提权**——那恰好违反根
 * `ROADMAP.md` §5.1 的不变量「**HTTP 只能关、不能开**」。（别用 `HOME` 当例子：它的值不在白名单里，
 * 指向它并不会授权。2026-10-03 更正。）所以卡片只**摆出**当前状态与「怎么授权」，
 * 编辑仍走 `~/.dsh/profiles/<profile>/cordis.patch.yml`；服务端对这两个字段在写入路径上**一律
 * 400**（含藏在 `targets[i]` 里的那种写法）。
 *
 * 连带的一条要注意：目标编辑是**替换整份 `targets`**，所以服务端会按 id 把**原有**的能力声明
 * 原样带回来（新行没有声明 = 未接入闸门）；**改 id 等于新增一个目标**，声明不会跟过去。
 *
 * 数据面是宿主那条 `GET/POST /api/dsh-devdata/config`（同源相对路径：宿主地址一律不硬编码，
 * 静态规则见 `scripts/client-lint.mjs`）。
 */
window.__ModuleLoader__.load({
  id: '@hyzyn/dsh-devdata',
  factory: (require) => {
    const exports = {}

    const React = require('react')
    const { jsx, jsxs } = require('react/jsx-runtime')

    const CONFIG_PATH = '/api/dsh-devdata/config'

    /* ================================ CSS ================================ */

    const CSS = [
      '.dd_card{display:flex;flex-direction:column;gap:10px;max-width:820px;color:var(--dsw-alias-label-primary)}',
      '.dd_head{display:flex;flex-direction:column;gap:4px}',
      '.dd_name{margin:0;font-size:15px;font-weight:600}',
      '.dd_desc{margin:0;font-size:13px;color:var(--dsw-alias-label-tertiary)}',
      '.dd_field{display:flex;flex-direction:column;gap:4px;margin:0}',
      '.dd_row{display:flex;align-items:center;gap:8px}',
      '.dd_label{font-size:13px;font-weight:500}',
      '.dd_input{padding:4px 8px;border:1px solid var(--dsw-alias-border-secondary);border-radius:6px;background:var(--dsw-alias-bg-primary);color:inherit;font-size:13px}',
      '.dd_hint{margin:0;font-size:12px;color:var(--dsw-alias-label-tertiary)}',
      '.dd_targets{display:flex;flex-direction:column;gap:6px;margin:0;padding:0;list-style:none}',
      '.dd_target{padding:6px 8px;border:1px solid var(--dsw-alias-border-secondary);border-radius:6px;font-size:12px;display:flex;flex-direction:column;gap:6px}',
      '.dd_targetName{font-weight:600}',
      '.dd_caps{margin:0;padding:6px 8px;border:1px dashed var(--dsw-alias-border-secondary);border-radius:6px}',
      '.dd_cap{margin:0;font-size:12px}',
      '.dd_actions{display:flex;align-items:center;gap:8px}',
      '.dd_remove{padding:2px 8px;border:1px solid var(--dsw-alias-border-secondary);border-radius:6px;background:transparent;color:inherit;cursor:pointer;font-size:12px}',
      '.dd_save{padding:4px 12px;border:1px solid var(--dsw-alias-border-secondary);border-radius:6px;background:var(--dsw-alias-bg-primary);color:inherit;cursor:pointer;font-size:13px}',
      '.dd_msg{font-size:12px}',
      '.dd_msgOk{color:var(--dsw-alias-label-tertiary)}',
      '.dd_msgErr{color:var(--dsw-alias-state-error-primary, #d33)}',
    ]

    let styleEl

    function ensureStyle() {
      if (styleEl !== undefined && styleEl.isConnected) return
      styleEl = document.createElement('style')
      styleEl.textContent = CSS.join('\n')
      document.head.appendChild(styleEl)
    }

    /* ================================ 国际化 ================================ */

    /*
     * 界面文案走宿主 `@deepseek-ai/dsh-client-locale` 的目录（方案见 docs/i18n.md，
     * 静态校验见 `scripts/check-i18n.mjs`）。目录内联在 client.js 里——本包没有构建步骤，
     * client.js 就是源。
     */
    /* ==== dsh-i18n:begin ==== */
    const I18N_NS = 'devdata'
    const I18N_ZH = {
      'card.name': '开发数据面',
      'card.desc': '经判据层访问开发/测试环境的数据服务：目标、能力闸门、审计与计划护栏。',
      'section.config': '插件配置',
      'section.targets': '目标（可改）',
      'section.capability': '能力档（只读）',
      'check.enabled': '启用本插件',
      'check.announce': '向 agent 注入能力公告',
      'check.confirmTargets': '我知道这会写进 profile 补丁层（~/.dsh/profiles/<profile>/cordis.patch.yml），并进审计',
      'field.auditFile': '持久审计文件（留空 = 只进宿主日志；**写类操作会因此被拒**）',
      'field.timeoutMs': '单次连接 + 命令超时（毫秒，100~60000；留空 = 不改）',
      'field.planMaxRows': '计划护栏：最大估算扫描行数（留空 = 不做这一层检查；0 = 一行都不许）',
      'field.planMaxCost': '计划护栏：最大估算代价（留空 / 0 = 不做这一层检查）',
      'field.targetId': 'id（工具按它选目标）',
      'field.targetLabel': '名字',
      'field.targetEngine': '引擎',
      'field.targetEnv': '环境档',
      'field.targetScope': '作用域目录（逗号分隔；留空 = 处处拒绝）',
      'field.targetMaxScan': 'SCAN 上限（1~1000；留空 = 默认 200）',
      'field.targetHost': '主机（与端口一起给；都不给 = 没有连接）',
      'field.targetPort': '端口（1~65535）',
      'field.targetDb': '库号（留空 = 不发 SELECT）',
      'field.targetCredential': '凭据引用（如 env:REDIS_PASS；留空 = 不登录）',
      'option.envUnset': '（不标注 = unknown = 不可写）',
      'option.enginePick': '（选一个引擎）',
      'btn.addTarget': '+ 添加目标',
      'btn.removeTarget': '删除',
      'btn.save': '保存',
      'btn.saving': '保存中…',
      'msg.saved': '已保存',
      'msg.targetsSaved': '目标已保存（进审计）',
      'msg.savedNotPersisted': '已在本进程生效，但宿主没有 settings 服务，**没有落盘**',
      'msg.targetsNeedConfirm': '改目标要先勾选下面那个确认框：它是「工具能在哪个目标、哪个引擎、哪个环境、哪个范围上动手」的变更。',
      'msg.loading': '正在读取配置…',
      'msg.loadFailed': '读取配置失败：',
      'msg.saveFailed': '保存失败：',
      'list.emptyTargets': '还没有配置任何目标——卡片不编一个默认目标出来（作用域与环境档都该由你声明）。',
      'hint.capReadonly': '能力档只读：授权判据是「宿主启动时那个环境变量是不是 TRUTHY」，而变量名来自配置——若这张卡片能改它，一条 POST 就等于免重启提权（HTTP 只能关、不能开）。要改请改 profile 补丁层并重启宿主。',
      'hint.capNewRow': '这一行还没保存过（或刚改过 id）：卡片读不到它的能力声明——声明不随行复制，改 id 等于新增一个目标。',
      'meta.capDeclared': '变量名：{env}（{label}）',
      'meta.capNotWired': '**未接入闸门**（因此该档入口不出现）',
      'meta.capGranted': '**已授权**（通道：{via}）',
      'meta.capDenied': '**当前未获授权**',
      'meta.capHowTo': '怎么授权：{howTo}',
      'meta.grantViaEnv': '启动环境',
      'meta.grantViaFile': '带外确认',
    }
    const I18N_EN = {
      'card.name': 'Dev data plane',
      'card.desc': 'Judge-gated access to development/test data services: targets, capability gates, audit and plan guardrails.',
      'section.config': 'Plugin configuration',
      'section.targets': 'Targets (editable)',
      'section.capability': 'Capability tiers (read-only)',
      'check.enabled': 'Enable this plugin',
      'check.announce': 'Inject the capability notice to the agent',
      'check.confirmTargets': 'I understand this is written into the profile patch layer (~/.dsh/profiles/<profile>/cordis.patch.yml) and audited',
      'field.auditFile': 'Durable audit file (empty = host log only; **write operations are then refused**)',
      'field.timeoutMs': 'Connect + command timeout (ms, 100~60000; empty = unchanged)',
      'field.planMaxRows': 'Plan guardrail: max estimated rows scanned (empty = no such check; 0 = not even one row)',
      'field.planMaxCost': 'Plan guardrail: max estimated cost (empty / 0 = no such check)',
      'field.targetId': 'id (tools pick the target by it)',
      'field.targetLabel': 'Name',
      'field.targetEngine': 'Engine',
      'field.targetEnv': 'Environment tier',
      'field.targetScope': 'Scope dirs (comma separated; empty = always refused)',
      'field.targetMaxScan': 'SCAN cap (1~1000; empty = default 200)',
      'field.targetHost': 'Host (give it together with the port; neither = no connection)',
      'field.targetPort': 'Port (1~65535)',
      'field.targetDb': 'DB index (empty = no SELECT)',
      'field.targetCredential': 'Credential ref (e.g. env:REDIS_PASS; empty = no login)',
      'option.envUnset': '(unlabelled = unknown = not writable)',
      'option.enginePick': '(pick an engine)',
      'btn.addTarget': '+ Add a target',
      'btn.removeTarget': 'Remove',
      'btn.save': 'Save',
      'btn.saving': 'Saving…',
      'msg.saved': 'Saved',
      'msg.targetsSaved': 'Targets saved (audited)',
      'msg.savedNotPersisted': 'Applied in this process, but the host has no settings service — **nothing was persisted**',
      'msg.targetsNeedConfirm': 'Tick the confirmation box first: this changes which target, engine, environment and scope the tools may act on.',
      'msg.loading': 'Loading configuration…',
      'msg.loadFailed': 'Failed to load configuration: ',
      'msg.saveFailed': 'Failed to save: ',
      'list.emptyTargets': 'No targets configured yet — the card will not invent one (scope and environment tier must be declared by you).',
      'hint.capReadonly': 'Capability tiers are read-only: the grant test is "was that environment variable TRUTHY when the host started", and the variable name comes from the config — if this card could change it, one POST would be a restart-free privilege escalation (HTTP may only turn things off, never on). Edit the profile patch layer and restart the host instead.',
      'hint.capNewRow': 'This row has not been saved yet (or its id just changed): the card cannot read its capability declarations — declarations do not follow a row, changing the id means adding a new target.',
      'meta.capDeclared': 'Variable name: {env} ({label})',
      'meta.capNotWired': '**Not wired to a gate** (so that tier has no entry point)',
      'meta.capGranted': '**Granted** (channel: {via})',
      'meta.capDenied': '**Not granted right now**',
      'meta.capHowTo': 'How to grant: {howTo}',
      'meta.grantViaEnv': 'launch environment',
      'meta.grantViaFile': 'out-of-band confirmation',
    }
    /* ==== dsh-i18n:end ==== */

    /** 占位符替换：`{name}` → params.name（缺参留空，不抛错——文案不该打死界面）。 */
    function i18nFormat(text, params) {
      if (params === undefined) return text
      return String(text).replace(/\{(\w+)\}/g, (_match, name) => (params[name] === undefined ? '' : String(params[name])))
    }

    /** 中文兜底：老宿主（DSH ≤0.1.5）没有 locale 服务时，界面不能变成一串键名。 */
    function i18nFallback(key, params) {
      return i18nFormat(I18N_ZH[key] !== undefined ? I18N_ZH[key] : key, params)
    }

    let t = i18nFallback

    /** 注册目录并绑定翻译函数（动态 inject：老宿主上保持中文兜底，卡片照挂）。 */
    function installI18n(ctx) {
      ctx.inject(['locale'], (i18nCtx) => {
        const disposeZh = i18nCtx.locale.register(I18N_NS, 'zh', I18N_ZH)
        const disposeEn = i18nCtx.locale.register(I18N_NS, 'en', I18N_EN)
        t = i18nCtx.locale.bind(I18N_NS)
        return () => {
          disposeEn()
          disposeZh()
          t = i18nFallback
        }
      })
    }

    /* ================================= 卡片 ================================= */

    /** 数值输入：空串 = **不改**（不是 0——`plan.maxRows: 0` 的语义是「一行都不许」）。 */
    function numberOrOmit(value) {
      return String(value).trim() === '' ? undefined : Number(value)
    }

    /** 只把要显示的键挑出来（数值字段留成字符串：输入框里要能是空的）。 */
    function pickScalars(config) {
      const plan = typeof config.plan === 'object' && config.plan !== null ? config.plan : {}
      return {
        enabled: config.enabled === true,
        announceToAgent: config.announceToAgent !== false,
        auditFile: typeof config.auditFile === 'string' ? config.auditFile : '',
        timeoutMs: typeof config.timeoutMs === 'number' ? String(config.timeoutMs) : '',
        planMaxRows: typeof plan.maxRows === 'number' ? String(plan.maxRows) : '',
        planMaxCost: typeof plan.maxCost === 'number' ? String(plan.maxCost) : '',
      }
    }

    /** 快照里的目标 → **可编辑草稿**（列表字段用逗号拼起来，方便一个输入框改）。 */
    function draftTargets(config) {
      const rows = Array.isArray(config.targets) ? config.targets : []
      return rows.map((target) => ({
        id: typeof target.id === 'string' ? target.id : '',
        label: typeof target.label === 'string' ? target.label : '',
        engine: typeof target.engine === 'string' ? target.engine : '',
        env: typeof target.env === 'string' ? target.env : '',
        scopeDirs: Array.isArray(target.scopeDirs) ? target.scopeDirs.join(', ') : '',
        maxScanCount: typeof target.maxScanCount === 'number' ? String(target.maxScanCount) : '',
        host: typeof target.host === 'string' ? target.host : '',
        port: typeof target.port === 'number' ? String(target.port) : '',
        db: typeof target.db === 'number' ? String(target.db) : '',
        credentialRef: typeof target.credentialRef === 'string' ? target.credentialRef : '',
      }))
    }

    /** 快照里按 id 索引的目标（能力档只读面板从它取「当前状态」）。 */
    function capabilityIndex(config) {
      const rows = Array.isArray(config.targets) ? config.targets : []
      const index = {}
      for (const target of rows) {
        if (target !== null && typeof target === 'object' && typeof target.id === 'string') index[target.id] = target
      }
      return index
    }

    /** 逗号分隔 → 字符串数组（空项丢掉；**不去重、不排序**：顺序是用户的意图）。 */
    function splitList(value) {
      return String(value)
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item !== '')
    }

    /** 草稿 → 提交给宿主的 payload 形状（空字段**不占位**，让「没写」保持没写）。 */
    function targetsPayload(rows) {
      return rows.map((row) => {
        const maxScanCount = numberOrOmit(row.maxScanCount)
        const host = row.host.trim()
        const port = numberOrOmit(row.port)
        const db = numberOrOmit(row.db)
        return {
          id: row.id.trim(),
          engine: row.engine.trim(),
          scopeDirs: splitList(row.scopeDirs),
          ...(row.label.trim() === '' ? {} : { label: row.label.trim() }),
          ...(row.env.trim() === '' ? {} : { env: row.env.trim() }),
          ...(maxScanCount === undefined ? {} : { maxScanCount }),
          ...(host === '' ? {} : { host }),
          ...(port === undefined ? {} : { port }),
          ...(db === undefined ? {} : { db }),
          ...(row.credentialRef.trim() === '' ? {} : { credentialRef: row.credentialRef.trim() }),
        }
      })
    }

    /** 标量草稿 → payload（数值留空则**不带那个键** = 不改；`auditFile` 空串是「显式清掉」）。 */
    function scalarsPayload(form) {
      const timeoutMs = numberOrOmit(form.timeoutMs)
      const maxRows = numberOrOmit(form.planMaxRows)
      const maxCost = numberOrOmit(form.planMaxCost)
      return {
        enabled: form.enabled,
        announceToAgent: form.announceToAgent,
        auditFile: form.auditFile.trim(),
        ...(timeoutMs === undefined ? {} : { timeoutMs }),
        ...(maxRows === undefined ? {} : { 'plan.maxRows': maxRows }),
        ...(maxCost === undefined ? {} : { 'plan.maxCost': maxCost }),
      }
    }

    function DevdataCard() {
      const [form, setForm] = React.useState(null)
      const [targets, setTargets] = React.useState([])
      const [targetsFromServer, setTargetsFromServer] = React.useState([])
      const [caps, setCaps] = React.useState({})
      const [engines, setEngines] = React.useState([])
      const [envs, setEnvs] = React.useState([])
      const [confirmTargets, setConfirmTargets] = React.useState(false)
      const [busy, setBusy] = React.useState(false)
      const [message, setMessage] = React.useState({ text: '', kind: '' })

      const adopt = React.useCallback((config) => {
        setForm(pickScalars(config))
        setTargets(draftTargets(config))
        setTargetsFromServer(draftTargets(config))
        setCaps(capabilityIndex(config))
        setEngines(Array.isArray(config.engines) ? config.engines : [])
        setEnvs(Array.isArray(config.envs) ? config.envs : [])
      }, [])

      const load = React.useCallback(() => {
        fetch(CONFIG_PATH, { cache: 'no-store' })
          .then((res) => res.json())
          .then((data) => {
            if (data !== null && typeof data === 'object' && data.ok === true && typeof data.config === 'object') {
              adopt(data.config)
              return
            }
            setMessage({ text: t('msg.loadFailed') + String(data && data.error ? data.error : ''), kind: 'err' })
          })
          .catch((error) => {
            setMessage({ text: t('msg.loadFailed') + String(error && error.message ? error.message : error), kind: 'err' })
          })
      }, [adopt])

      React.useEffect(() => {
        load()
      }, [load])

      const setField = (key, value) => {
        setForm((prev) => (prev === null ? prev : { ...prev, [key]: value }))
      }

      const setTargetField = (index, key, value) => {
        setTargets((rows) => rows.map((row, i) => (i === index ? { ...row, [key]: value } : row)))
      }

      const targetsDirty = JSON.stringify(targets) !== JSON.stringify(targetsFromServer)

      const save = () => {
        if (form === null || busy) return
        if (targetsDirty && !confirmTargets) {
          setMessage({ text: t('msg.targetsNeedConfirm'), kind: 'err' })
          return
        }
        setBusy(true)
        setMessage({ text: '', kind: '' })
        const payload = scalarsPayload(form)
        if (targetsDirty) {
          payload.targets = targetsPayload(targets)
          payload.confirmTargetEdit = true
        }
        fetch(CONFIG_PATH, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        })
          .then((res) => res.json())
          .then((data) => {
            setBusy(false)
            if (data === null || typeof data !== 'object' || data.ok !== true) {
              setMessage({ text: t('msg.saveFailed') + String(data && data.error ? data.error : ''), kind: 'err' })
              return
            }
            adopt(data.config)
            setConfirmTargets(false)
            const done = targetsDirty ? t('msg.targetsSaved') : t('msg.saved')
            setMessage({ text: data.persisted === false ? t('msg.savedNotPersisted') : done, kind: data.persisted === false ? 'err' : 'ok' })
          })
          .catch((error) => {
            setBusy(false)
            setMessage({ text: t('msg.saveFailed') + String(error && error.message ? error.message : error), kind: 'err' })
          })
      }

      const toggle = (key, label) =>
        jsxs('label', {
          className: 'dd_row',
          children: [
            jsx('input', {
              type: 'checkbox',
              checked: form !== null && form[key] === true,
              disabled: form === null,
              onChange: (event) => {
                setField(key, event.target.checked)
              },
            }),
            jsx('span', { className: 'dd_label', children: label }),
          ],
        })

      const text = (key, label, hint) =>
        jsxs('label', {
          className: 'dd_field',
          children: [
            jsx('span', { className: 'dd_label', children: label }),
            jsx('input', {
              className: 'dd_input',
              type: key === 'auditFile' ? 'text' : 'number',
              value: form === null ? '' : String(form[key]),
              disabled: form === null,
              onChange: (event) => {
                setField(key, event.target.value)
              },
            }),
            hint === undefined ? null : jsx('span', { className: 'dd_hint', children: hint }),
          ],
        })

      /** 一个目标草稿的文本字段（标签 + 输入框）。 */
      const targetField = (index, key, label) =>
        jsxs('label', {
          className: 'dd_field',
          children: [
            jsx('span', { className: 'dd_label', children: label }),
            jsx('input', {
              className: 'dd_input',
              type: 'text',
              value: targets[index] === undefined ? '' : String(targets[index][key]),
              onChange: (event) => {
                setTargetField(index, key, event.target.value)
              },
            }),
          ],
        })

      /**
       * 一个目标草稿的**下拉**字段。
       *
       * 选项来自宿主快照（`config.engines` / `config.envs`）——枚举的真相在宿主侧的
       * `operations.ts` / `env.ts`，卡片再抄一份字面量必然漂。
       */
      const targetSelect = (index, key, label, options) =>
        jsxs('label', {
          className: 'dd_field',
          children: [
            jsx('span', { className: 'dd_label', children: label }),
            jsx('select', {
              className: 'dd_input',
              value: targets[index] === undefined ? '' : String(targets[index][key]),
              onChange: (event) => {
                setTargetField(index, key, event.target.value)
              },
              children: [
                jsx('option', { value: '', children: key === 'engine' ? t('option.enginePick') : t('option.envUnset') }, 'empty'),
                ...options.map((option) => jsx('option', { value: option, children: option }, option)),
              ],
            }),
          ],
        })

      /** 一档能力的只读一行（**只读**：写入路径上服务端一律 400，见文件头）。 */
      const capLine = (target, field, label) => {
        const server = caps[target.id.trim()]
        const spec = server === undefined ? undefined : server[field]
        if (spec === undefined || typeof spec !== 'object') {
          return jsxs('div', {
            className: 'dd_cap',
            children: [
              jsx('span', { className: 'dd_label', children: label }),
              jsx('p', { className: 'dd_hint', children: t('meta.capNotWired') }),
            ],
          })
        }
        const via = spec.via === 'env' ? t('meta.grantViaEnv') : t('meta.grantViaFile')
        return jsxs('div', {
          className: 'dd_cap',
          children: [
            jsx('span', { className: 'dd_label', children: label }),
            jsx('p', {
              className: 'dd_hint',
              children: t('meta.capDeclared', { env: spec.env, label: spec.label }),
            }),
            jsx('p', {
              className: 'dd_hint',
              children: spec.granted === true ? t('meta.capGranted', { via }) : t('meta.capDenied'),
            }),
            // 「怎么授权」**一直给**（已授权时也留着）：它是这张只读面板存在的理由——用户要能一眼
            // 看到「这条闸门靠什么开、现在开没开」，而不是在猜里过日子。
            jsx('p', { className: 'dd_hint', children: t('meta.capHowTo', { howTo: spec.howTo }) }),
          ],
        })
      }

      const targetEditor = jsxs('div', {
        className: 'dd_card',
        children: [
          jsx('p', { className: 'dd_hint', children: t('section.targets') }),
          targets.length === 0
            ? jsx('p', { className: 'dd_hint', children: t('list.emptyTargets') })
            : jsx('ul', {
                className: 'dd_targets',
                children: targets.map((row, index) =>
                  jsxs(
                    'li',
                    {
                      className: 'dd_target',
                      children: [
                        jsxs('div', {
                          className: 'dd_row',
                          children: [
                            jsx('span', { className: 'dd_targetName', children: row.id.trim() === '' ? t('field.targetId') : row.id }),
                            jsx('button', {
                              type: 'button',
                              className: 'dd_remove',
                              onClick: () => {
                                setTargets((rows) => rows.filter((_item, i) => i !== index))
                                setConfirmTargets(false)
                              },
                              children: t('btn.removeTarget'),
                            }),
                          ],
                        }),
                        targetField(index, 'id', t('field.targetId')),
                        targetField(index, 'label', t('field.targetLabel')),
                        targetSelect(index, 'engine', t('field.targetEngine'), engines),
                        targetSelect(index, 'env', t('field.targetEnv'), envs),
                        targetField(index, 'scopeDirs', t('field.targetScope')),
                        targetField(index, 'maxScanCount', t('field.targetMaxScan')),
                        targetField(index, 'host', t('field.targetHost')),
                        targetField(index, 'port', t('field.targetPort')),
                        targetField(index, 'db', t('field.targetDb')),
                        targetField(index, 'credentialRef', t('field.targetCredential')),
                        jsxs('div', {
                          className: 'dd_caps',
                          children: [
                            jsx('p', { className: 'dd_label', children: t('section.capability') }),
                            capLine(row, 'writeCapability', 'writeCapability'),
                            capLine(row, 'dangerousReadCapability', 'dangerousReadCapability'),
                            row.id.trim() !== '' && caps[row.id.trim()] === undefined
                              ? jsx('p', { className: 'dd_hint', children: t('hint.capNewRow') })
                              : null,
                            jsx('p', { className: 'dd_hint', children: t('hint.capReadonly') }),
                          ],
                        }),
                      ],
                    },
                    'target-' + String(index),
                  ),
                ),
              }),
          jsx('button', {
            type: 'button',
            className: 'dd_save',
            onClick: () => {
              setTargets((rows) => [
                ...rows,
                {
                  id: '',
                  label: '',
                  engine: '',
                  env: '',
                  scopeDirs: '',
                  maxScanCount: '',
                  host: '',
                  port: '',
                  db: '',
                  credentialRef: '',
                },
              ])
              setConfirmTargets(false)
            },
            children: t('btn.addTarget'),
          }),
          targetsDirty
            ? jsx('label', {
                className: 'dd_row',
                children: [
                  jsx('input', {
                    type: 'checkbox',
                    checked: confirmTargets,
                    onChange: (event) => {
                      setConfirmTargets(event.target.checked)
                    },
                  }),
                  jsx('span', { className: 'dd_hint', children: t('check.confirmTargets') }),
                ],
              })
            : null,
        ],
      })

      return jsxs('div', {
        className: 'dd_card',
        children: [
          jsxs('header', {
            className: 'dd_head',
            children: [
              jsx('h3', { className: 'dd_name', children: t('card.name') }),
              jsx('p', { className: 'dd_desc', children: t('card.desc') }),
            ],
          }),
          form === null
            ? jsx('p', { className: 'dd_hint', children: message.text === '' ? t('msg.loading') : message.text })
            : jsxs('div', {
                className: 'dd_card',
                children: [
                  jsx('p', { className: 'dd_hint', children: t('section.config') }),
                  toggle('enabled', t('check.enabled')),
                  toggle('announceToAgent', t('check.announce')),
                  text('auditFile', t('field.auditFile')),
                  text('timeoutMs', t('field.timeoutMs')),
                  text('planMaxRows', t('field.planMaxRows')),
                  text('planMaxCost', t('field.planMaxCost')),
                  targetEditor,
                  jsxs('div', {
                    className: 'dd_actions',
                    children: [
                      jsx('button', {
                        type: 'button',
                        className: 'dd_save',
                        disabled: busy,
                        onClick: save,
                        children: busy ? t('btn.saving') : t('btn.save'),
                      }),
                      message.text === '' ? null : jsx('span', { className: 'dd_msg' + (message.kind === 'err' ? ' dd_msgErr' : ' dd_msgOk'), children: message.text }),
                    ],
                  }),
                ],
              }),
        ],
      })
    }

    /* ================================ 插件入口 ================================ */

    exports.inject = ['slots']

    exports.apply = (ctx) => {
      installI18n(ctx)
      ctx.effect(() => {
        ensureStyle()
        return () => {
          styleEl?.remove()
          styleEl = undefined
        }
      })

      // 设置 → 插件配置（`@hyzyn/dsh-kit-settings` 声明的那一页里的一张卡）。
      ctx.slots.inject('settings.kit.item', () =>
        ctx.slots.register({ name: 'settings.kit.item', id: 'devdata', order: 90, label: () => t('card.name') }, DevdataCard),
      )
      /*
       * 侧边栏「插件」页：**两个槽都要注册**（devfront 真机验收抓到的）——列表行用
       * `plugins.row.config`（key 是 `<包名>#<行 id>`），而点「查看」进的那个**详情页**用
       * `plugins.bundle.config`（key 是**包名**）。只注册前者时详情页里的卡片是空的。
       *
       * 刻意**不**走 `ROW_CONFIG_KEYS` + 「内联优先」那一套：本包只有自己一个 bundle，
       * 而 `scripts/test/plugin-settings-surface.test.ts` 的「内联优先」契约是为**那些包**
       * （docker / tty / codegraph 等，同时进独立包与聚合包）写的；照 devfront 这条唯一的
       * 卡片模板写，两处入口都在，卡片在三处设置面都能用。
       */
      ctx.slots.inject('plugins.bundle.config', () =>
        ctx.slots.register({ name: 'plugins.bundle.config', key: '@hyzyn/dsh-devdata' }, DevdataCard),
      )
      ctx.slots.inject('plugins.row.config', () =>
        ctx.slots.register({ name: 'plugins.row.config', key: '@hyzyn/dsh-devdata#devdata' }, DevdataCard),
      )
      // DSH ≤0.1.5：设置 → 插件 的「插件配置」标签页（keyed 插槽按 settings 命名空间派发）。
      ctx.slots.inject('settings.plugin.item', () =>
        ctx.slots.register({ name: 'settings.plugin.item', key: 'devdata', order: 90 }, DevdataCard),
      )
    }

    return exports
  },
})
