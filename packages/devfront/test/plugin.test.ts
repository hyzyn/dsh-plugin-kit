/**
 * 宿主半体的纯逻辑测试（`docs/devdata-plan.md` §15.2）。
 *
 * 只测**配置解析**这一层：它决定了工具会不会被注册、以及作用域判据拿到的目录是什么。
 * 工具本身的行为已经在 `page.test.ts` 里测过（判定层不依赖宿主），驱动在 `cdp-driver.test.ts`。
 *
 * 重点在一条：**空 `scopeDirs` 必须保留为空**——那是「处处拒绝」，替用户补一个默认目录
 * 等于替他授权。
 */

import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { CARD_FIELDS, DEVFONT_GUIDANCE, configSnapshotFrom, normalizeCardPatch, normalizeConfig, parseViewport, webAuditSink } from '../src/index.js'

describe('parseViewport：站点视口（**按站点**，2026-10-02 加）', () => {
  it('收 `390x844` 这类；`x` / `X` / `×` 与前后空白都认', () => {
    expect(parseViewport('390x844')).toEqual({ width: 390, height: 844 })
    expect(parseViewport('1440X900')).toEqual({ width: 1440, height: 900 })
    expect(parseViewport(' 390 × 844 ')).toEqual({ width: 390, height: 844 })
    expect(parseViewport('1280x720')).toEqual({ width: 1280, height: 720 })
  })

  it('**不猜**：写坏了当作没写（宁可浏览器默认，也不在一个没人选过的窗口里验活）', () => {
    // 猜一个尺寸比不设视口更坏：一次验活会在没人选过的窗口里通过或失败。
    for (const bad of ['', '   ', 'abc', '390', '390x', 'x844', '0x0', '5x5', '390x844x1', '10.5x20', 390, null, undefined, {}, ['390x844']]) {
      expect(parseViewport(bad), JSON.stringify(bad) ?? String(bad)).toBeUndefined()
    }
  })
})

describe('normalizeConfig：视口带进 LiveTarget', () => {
  it('写了的带出来；没写 / 写坏的不编一个默认值', () => {
    const withViewport = normalizeConfig({ targets: [{ id: 'a', url: 'https://a.com/', viewport: '390x844' }] })
    expect(withViewport.targets[0]?.viewport).toEqual({ width: 390, height: 844 })

    const without = normalizeConfig({ targets: [{ id: 'a', url: 'https://a.com/' }] })
    expect(without.targets[0]?.viewport).toBeUndefined()

    const broken = normalizeConfig({ targets: [{ id: 'a', url: 'https://a.com/', viewport: 'nope' }] })
    expect(broken.targets[0]?.viewport).toBeUndefined()
  })
})

describe('normalizeConfig：站点解析', () => {
  it('解析出 id / label / url / scopeDirs / allowedOrigins', () => {
    const live = normalizeConfig({
      targets: [{ id: 'cdqas', label: '海关前端', url: 'https://cdqas.example.com/', scopeDirs: ['/work/cdqas'] }],
    })
    expect(live.targets).toEqual([
      {
        id: 'cdqas',
        label: '海关前端',
        url: 'https://cdqas.example.com/',
        scopeDirs: ['/work/cdqas'],
        // 缺省空 = 只能在声明源上**动手**（读不受限）。与 scopeDirs 同一条原则：
        // 不替用户补默认值——补了就等于替他授权。
        allowedOrigins: [],
      },
    ])
  })

  it('**空 allowedOrigins 保留为空**（空 = 只能在声明源上动手）', () => {
    for (const allowedOrigins of [undefined, [], ['  ', '']]) {
      const live = normalizeConfig({ targets: [{ id: 'x', url: 'https://a.com/', allowedOrigins }] })
      expect(live.targets[0]?.allowedOrigins, JSON.stringify(allowedOrigins)).toEqual([])
    }
  })

  it('allowedOrigins 原样带出（SSO 的 IdP 源要靠它显式声明）', () => {
    const live = normalizeConfig({
      targets: [
        { id: 'x', url: 'https://a.com/', allowedOrigins: ['https://idp.example.com', '  '] },
      ],
    })
    expect(live.targets[0]?.allowedOrigins).toEqual(['https://idp.example.com'])
  })

  it('label 缺省回落成 id（报告里不能出现空名字）', () => {
    const live = normalizeConfig({ targets: [{ id: 'x', url: 'https://a.com/' }] })
    expect(live.targets[0]?.label).toBe('x')
  })

  it('**空 scopeDirs 保留为空**（那是「处处拒绝」，不替用户补默认目录）', () => {
    // 失败意味着：插件替用户授权了一个目录，于是「没配过」变成了「配过了」。
    for (const scopeDirs of [undefined, [], ['  ', '']]) {
      const live = normalizeConfig({ targets: [{ id: 'x', url: 'https://a.com/', scopeDirs }] })
      expect(live.targets[0]?.scopeDirs, JSON.stringify(scopeDirs)).toEqual([])
    }
  })

  it('缺 id 或 url 的站点被丢掉（半条配置不该变成一个半可用的目标）', () => {
    const live = normalizeConfig({
      targets: [{ id: '', url: 'https://a.com/' }, { id: 'y' }, { id: 'z', url: 'https://z.com/' }],
    })
    expect(live.targets.map((t) => t.id)).toEqual(['z'])
  })

  it('credentialRef 只在非空时带上（不造一个空引用）', () => {
    const withRef = normalizeConfig({ targets: [{ id: 'a', url: 'https://a.com/', credentialRef: 'env:TOKEN' }] })
    expect(withRef.targets[0]?.credentialRef).toBe('env:TOKEN')
    const without = normalizeConfig({ targets: [{ id: 'b', url: 'https://b.com/', credentialRef: '' }] })
    expect(without.targets[0]?.credentialRef).toBeUndefined()
  })

  it('targets 缺失 / 不是数组 → 空列表（而不是抛）', () => {
    expect(normalizeConfig({}).targets).toEqual([])
    expect(normalizeConfig({ targets: 'nope' }).targets).toEqual([])
  })
})

describe('normalizeConfig：开关与默认值', () => {
  it('enabled / announceToAgent 默认开，显式 false 才关', () => {
    expect(normalizeConfig({})).toMatchObject({ enabled: true, announceToAgent: true })
    expect(normalizeConfig({ enabled: false })).toMatchObject({ enabled: false })
    expect(normalizeConfig({ announceToAgent: false })).toMatchObject({ announceToAgent: false })
  })

  it('**noSandbox 默认关**（关沙箱是安全相关的默认值，只有显式 true 才开）', () => {
    expect(normalizeConfig({}).noSandbox).toBe(false)
    expect(normalizeConfig({ noSandbox: false }).noSandbox).toBe(false)
    // 只有真 true 才算——`'true'` 这种字符串不该把它打开。
    expect(normalizeConfig({ noSandbox: 'true' as unknown as boolean }).noSandbox).toBe(false)
    expect(normalizeConfig({ noSandbox: true }).noSandbox).toBe(true)
  })

  it('settleMs 缺省 800；非法值不生效', () => {
    expect(normalizeConfig({}).settleMs).toBe(800)
    expect(normalizeConfig({ settleMs: 0 }).settleMs).toBe(0)
    expect(normalizeConfig({ settleMs: 'soon' as unknown as number }).settleMs).toBe(800)
  })

  it('chromePath / shotDir 缺省空串（空串 = 交给驱动的默认行为）', () => {
    expect(normalizeConfig({})).toMatchObject({ chromePath: '', shotDir: '' })
    expect(normalizeConfig({ chromePath: '/x/chrome', shotDir: '/tmp/shots' })).toMatchObject({
      chromePath: '/x/chrome',
      shotDir: '/tmp/shots',
    })
  })
})

describe('能力公告', () => {
  it('七个动作都点到名（公告里缺一个，agent 就不知道它能用）', () => {
    for (const tool of ['site_open', 'site_shot', 'site_click', 'site_fill', 'site_text', 'site_console', 'site_verify']) {
      expect(DEVFONT_GUIDANCE).toContain(tool)
    }
  })

  it('写明边界：不做定时 / 爬虫 / 批量', () => {
    expect(DEVFONT_GUIDANCE).toContain('不做定时任务、不做爬虫、不做批量操作')
  })

  it('把 console 三档的口径说清（否则 agent 会把噪声当故障）', () => {
    expect(DEVFONT_GUIDANCE).toContain('来自本站资源')
    expect(DEVFONT_GUIDANCE).toContain('噪声')
  })

  it('写明 site_text **取不到什么**（真机实测：标题/水印可能烤在整屏背景图里）', () => {
    // 2026-10-02 第一次指向真站点：`mtc.example.com/hcckc-h5` 把「网络安全知识竞赛」标题与
    // 「承办单位」水印**烤进**一张 1425×757 的伪元素背景 JPEG，`innerText` 里根本没有那些字。
    // 于是「页面应包含某段文字」会**假阴性**——公告必须把这条边界说出来，并给出复核动作。
    expect(DEVFONT_GUIDANCE).toContain('innerText')
    expect(DEVFONT_GUIDANCE).toContain('background-image')
    expect(DEVFONT_GUIDANCE).toContain('site_shot')
  })

  it('写明噪声规则里**哪些实际不可能出现**（真机审计：全新 profile 没有扩展）', () => {
    // 2026-10-02 双读审计带出：`extension-inject` / `third-party-blocked` 的可达条件分别要求
    // `chrome-extension://` 来源与 `ERR_BLOCKED_BY_CLIENT`，**两者都来自浏览器扩展**，
    // 而本工具起的是全新临时 profile（没有任何扩展）→ 这两条**永不命中**。
    // 公告不写这一句，agent 会把「没看到它们」当成漏判。
    expect(DEVFONT_GUIDANCE).toContain('extension-inject')
    expect(DEVFONT_GUIDANCE).toContain('全新 profile')
    expect(DEVFONT_GUIDANCE).toContain('别把')
  })
})

describe('审计落盘（2026-10-03：与 devdata / devenv 同一份实现）', () => {
  it('`auditFile` 解析：去空白；不写 / 写空 = 只进日志', () => {
    expect(normalizeConfig({ auditFile: '  ~/.dsh/devfront-audit.jsonl  ' }).auditFile).toBe('~/.dsh/devfront-audit.jsonl')
    expect(normalizeConfig({}).auditFile).toBe('')
    expect(normalizeConfig({ auditFile: '   ' }).auditFile).toBe('')
    expect(normalizeConfig({ auditFile: 42 }).auditFile).toBe('')
  })

  it('配了文件 → 允许与被拒**各落一行**（含码）', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'dsh-devfront-audit-')), 'a.jsonl')
    try {
      const sink = webAuditSink({ auditFile: file, logger: { info: () => {}, warn: () => {} } })
      sink.record({ at: 1, targetId: 'w', action: 'open', allowed: true, subject: 'https://x.test/' })
      sink.record({ at: 2, targetId: 'w', action: 'click', allowed: false, code: 'PAGE_ORIGIN_NOT_ALLOWED' })
      const lines = readFileSync(file, 'utf8').trim().split('\n').map((line) => JSON.parse(line) as Record<string, unknown>)
      expect(lines.map((line) => [line.action, line.allowed, line.code])).toEqual([
        ['open', true, undefined],
        ['click', false, 'PAGE_ORIGIN_NOT_ALLOWED'],
      ])
      expect(lines[0]?.subject).toBe('https://x.test/')
    } finally {
      rmSync(dirname(file), { recursive: true, force: true })
    }
  })

  it('没配文件 → 只进日志（允许 info / 拒绝 warn），话术带站点与 subject', () => {
    const calls: Array<[string, string]> = []
    const sink = webAuditSink({
      auditFile: '',
      logger: { info: (m) => calls.push(['info', m]), warn: (m) => calls.push(['warn', m]) },
    })
    sink.record({ at: 1, targetId: 'w', action: 'open', allowed: true, subject: 'https://x.test/' })
    sink.record({ at: 2, targetId: 'w', action: 'click', allowed: false, code: 'PAGE_ORIGIN_NOT_ALLOWED' })
    expect(calls[0]).toEqual(['info', '[dsh-devfront] 允许 open https://x.test/ @w'])
    expect(calls[1]).toEqual(['warn', '[dsh-devfront] 拒绝 click @w (PAGE_ORIGIN_NOT_ALLOWED)'])
  })
})

describe('配置卡片的数据面（宿主侧纯函数，2026-10-03）', () => {
  it('`normalizeCardPatch`：只认卡片字段，类型与范围**先判**（非法值不许先落地再抛）', () => {
    expect(normalizeCardPatch({})).toEqual({ error: '没有要改的字段（patch 是空的）' })
    expect(normalizeCardPatch({ nope: 1 })).toEqual({ error: '不认识的字段：nope' })
    expect(normalizeCardPatch({ enabled: 'yes' })).toEqual({ error: 'enabled 必须是布尔值' })
    expect(normalizeCardPatch({ settleMs: 30_001 })).toEqual({ error: 'settleMs 必须是 0~30000 的整数（毫秒）' })
    expect(normalizeCardPatch({ settleMs: 1.5 })).toEqual({ error: 'settleMs 必须是 0~30000 的整数（毫秒）' })
    expect(normalizeCardPatch({ chromePath: 7 })).toEqual({ error: 'chromePath 必须是字符串' })

    expect(normalizeCardPatch({ enabled: false, settleMs: 0, auditFile: '  ~/.dsh/a.jsonl  ' })).toEqual({
      patch: { enabled: false, settleMs: 0, auditFile: '~/.dsh/a.jsonl' },
    })
    expect(CARD_FIELDS).toContain('auditFile')
  })

  it('站点不带 `confirmSiteEdit` → 逐次确认那一档（码要能被 agent 认出来）', () => {
    const result = normalizeCardPatch({ targets: [{ id: 'w', url: 'https://x.test/' }] })
    expect('error' in result).toBe(true)
    if ('error' in result) {
      expect(result.code).toBe('CONFIRMATION_REQUIRED')
      expect(result.error).toContain('confirmSiteEdit')
      expect(result.error).toContain('profile 补丁层')
    }
  })

  it('站点带 `confirmSiteEdit` → patch 里就是**校验过**的行（列表字段去空、`label` 去空白）', () => {
    const result = normalizeCardPatch({
      confirmSiteEdit: true,
      targets: [
        {
          id: 'w',
          url: 'https://x.test/app/',
          label: '  站点  ',
          scopeDirs: ['/a', '   '],
          allowedOrigins: ['https://sso.test'],
          viewport: '390x844',
          credentialRef: 'secret:x',
        },
      ],
    })
    expect(result).toEqual({
      patch: {
        targets: [
          {
            id: 'w',
            label: '站点',
            url: 'https://x.test/app/',
            scopeDirs: ['/a'],
            allowedOrigins: ['https://sso.test'],
            viewport: '390x844',
            credentialRef: 'secret:x',
          },
        ],
      },
    })
  })

  it('站点校验**逐行逐字段报错**（不静默丢行）', () => {
    const cases: Array<[unknown, string]> = [
      ['not-an-array', 'targets 必须是数组'],
      [[{ url: 'https://x.test/' }], 'targets[0].id'],
      [[{ id: 'w' }], 'targets[0].url'],
      [[{ id: 'w', url: 'https://x.test/' }, { id: 'w', url: 'https://y.test/' }], '重名'],
      [[{ id: 'w', url: 'https://x.test/', viewport: 'nope' }], 'targets[0].viewport'],
      [[{ id: 'w', url: 'https://x.test/', scopeDirs: 'a,b' }], 'targets[0].scopeDirs'],
    ]
    for (const [targets, needle] of cases) {
      const result = normalizeCardPatch({ confirmSiteEdit: true, targets })
      expect('error' in result, JSON.stringify(targets)).toBe(true)
      if ('error' in result) expect(result.error, JSON.stringify(targets)).toContain(needle)
    }
  })

  it('标量与站点可以一次改：`confirmSiteEdit` 是确认位，**不进配置**', () => {
    expect(normalizeCardPatch({ confirmSiteEdit: true, settleMs: 500, targets: [] })).toEqual({
      patch: { settleMs: 500, targets: [] },
    })
    // 删光站点也是合法状态（「没配站点 = 一个工具都不注册」那条 fail-closed 判据由注册面钉住）
    expect(normalizeCardPatch({ confirmSiteEdit: true, targets: [] })).toEqual({ patch: { targets: [] } })
  })

  it('`configSnapshotFrom`：站点全量只读展示（含范围 / 允许源 / 视口 / 凭据引用）', () => {
    const snapshot = configSnapshotFrom({
      enabled: true,
      announceToAgent: false,
      settleMs: 800,
      noSandbox: false,
      chromePath: '/usr/bin/chrome',
      shotDir: '/tmp/shots',
      auditFile: '',
      targets: [
        {
          id: 'w',
          label: '测试站点',
          url: 'https://x.test/app/',
          scopeDirs: ['/work/a'],
          allowedOrigins: ['https://sso.test'],
          viewport: { width: 390, height: 844 },
          credentialRef: 'secret:x',
        },
      ],
    })
    expect(snapshot.auditFile).toBe('')
    expect(snapshot.targets).toEqual([
      {
        id: 'w',
        label: '测试站点',
        url: 'https://x.test/app/',
        scopeDirs: ['/work/a'],
        allowedOrigins: ['https://sso.test'],
        viewport: '390x844',
        credentialRef: 'secret:x',
      },
    ])
  })

  it('`configSnapshotFrom`：没写视口 / 允许源 / 凭据引用的站点不带那些键（不是 null 占位）', () => {
    const snapshot = configSnapshotFrom({
      enabled: false,
      announceToAgent: true,
      settleMs: 800,
      noSandbox: true,
      chromePath: '',
      shotDir: '',
      auditFile: 'a.jsonl',
      targets: [{ id: 'w', label: 'w', url: 'https://x.test/', scopeDirs: [] }],
    })
    expect(snapshot.targets).toEqual([{ id: 'w', label: 'w', url: 'https://x.test/', scopeDirs: [], allowedOrigins: [] }])
  })
})
