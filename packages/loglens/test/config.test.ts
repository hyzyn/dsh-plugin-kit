/**
 * @hyzyn/dsh-loglens — 来源清单纯逻辑的用例。
 *
 * 这些判据决定「用户在卡片上填什么能存下来」与「存下来的脏数据怎么读回来」，所以每条
 * 规则都配一条反例；用例不碰网络、不起宿主（见 ../src/config.ts 的文件头）。
 */
import { describe, expect, it } from 'vitest'
import {
  MAX_TARGETS,
  addTarget,
  emptyConfig,
  isLinkLocalHost,
  normalizeConfig,
  normalizeUrl,
  removeTarget,
  slugId,
  slugSourceForUrl,
  uniqueId,
  updateTarget,
  validateTargetInput,
} from '../src/config.js'
import type { LoglensConfig } from '../src/config.js'

/** 用宽松读盘造一份合法配置（全部来源都必须是合法的，否则会被当成坏行丢掉）。 */
function configWith(...targets: unknown[]): LoglensConfig {
  return normalizeConfig({ targets }).config
}

describe('normalizeConfig：宽松读盘', () => {
  it('非对象 / 缺 targets 都退回默认（启用、无来源）', () => {
    expect(normalizeConfig(undefined).config).toEqual({ enabled: true, targets: [] })
    expect(normalizeConfig('nope').config).toEqual({ enabled: true, targets: [] })
    expect(normalizeConfig({ targets: 'nope' }).config).toEqual({ enabled: true, targets: [] })
  })

  it('enabled 只在显式 false 时为假（其余形态按启用处理）', () => {
    expect(normalizeConfig({ enabled: false }).config.enabled).toBe(false)
    expect(normalizeConfig({ enabled: 'no' }).config.enabled).toBe(true)
    expect(normalizeConfig({}).config.enabled).toBe(true)
  })

  it('坏行逐个丢掉并计数，好行照常可用（不整份作废）', () => {
    const result = normalizeConfig({
      targets: [
        { kind: 'loki', url: 'http://127.0.0.1:3100' },
        { kind: 'nope', url: 'http://127.0.0.1:3100' },
        { kind: 'loki' },
        { kind: 'loki', url: '不是地址' },
        { kind: 'docker' },
      ],
    })
    expect(result.dropped).toBe(3)
    expect(result.config.targets.map((target) => target.id)).toEqual(['127-0-0-1-3100', 'target'])
  })

  it('来源条数超上限时多出来的算丢弃（不是静默忽略）', () => {
    const many = Array.from({ length: MAX_TARGETS + 2 }, (_item, index) => ({
      kind: 'loki',
      label: 'target-' + String(index),
      url: 'http://127.0.0.1:' + String(3100 + index),
    }))
    const result = normalizeConfig({ targets: many })
    expect(result.config.targets).toHaveLength(MAX_TARGETS)
    expect(result.dropped).toBe(2)
  })
})

describe('normalizeUrl：只收 http / https 的绝对地址', () => {
  it('私网允许（这是产品语义，不是漏网）', () => {
    expect(normalizeUrl('http://192.168.1.9:3100')).toEqual({ ok: true, url: 'http://192.168.1.9:3100' })
    expect(normalizeUrl('https://logs.internal:9200')).toEqual({ ok: true, url: 'https://logs.internal:9200' })
  })

  it('首尾空白被去掉，合法地址原样保留', () => {
    expect(normalizeUrl('  http://127.0.0.1:3100  ')).toEqual({ ok: true, url: 'http://127.0.0.1:3100' })
  })

  it('缺协议 / 非 http / 空值都拒，并说清原因', () => {
    expect(normalizeUrl('127.0.0.1:3100').ok).toBe(false)
    expect(normalizeUrl('ftp://127.0.0.1').ok).toBe(false)
    expect(normalizeUrl('javascript:alert(1)').ok).toBe(false)
    expect(normalizeUrl('   ').ok).toBe(false)
    expect(normalizeUrl(42).ok).toBe(false)
    const empty = normalizeUrl('')
    expect(empty.ok === false ? empty.error : '').toContain('地址不能为空')
  })

  it('链路本地 / 云元数据被拒（设计 §1 的非目标）', () => {
    expect(normalizeUrl('http://169.254.169.254/latest/meta-data').ok).toBe(false)
    expect(normalizeUrl('http://metadata.google.internal').ok).toBe(false)
    expect(normalizeUrl('http://[fe80::1]:3100').ok).toBe(false)
    expect(isLinkLocalHost('169.254.0.7')).toBe(true)
    // 反例用 RFC 5737 的文档网段（公共地址里专门留给文档/示例的那三段），不要写真实公网地址
    expect(isLinkLocalHost('203.0.113.7')).toBe(false)
    expect(isLinkLocalHost('[::1]')).toBe(false)
  })
})

describe('id 生成', () => {
  it('slugId 依次尝试各来源，都不成词时回落 target', () => {
    expect(slugSourceForUrl('http://127.0.0.1:3100/loki')).toBe('127.0.0.1:3100/loki')
    expect(slugId('Local Loki', 'http://127.0.0.1:3100')).toBe('local-loki')
    expect(slugId('', '127.0.0.1:3100')).toBe('127-0-0-1-3100')
    expect(slugId('中文名', '')).toBe('target')
  })

  it('uniqueId 冲突时依次 -2 / -3', () => {
    expect(uniqueId('loki', [])).toBe('loki')
    expect(uniqueId('loki', ['loki'])).toBe('loki-2')
    expect(uniqueId('loki', ['loki', 'loki-2'])).toBe('loki-3')
  })

  it('validateTargetInput：中文名就回落 target，第二条是 target-2', () => {
    const first = validateTargetInput({ kind: 'docker', label: '本机日志' }, [])
    expect(first.ok && first.target.id).toBe('target')
    const second = validateTargetInput({ kind: 'docker', label: '本机日志' }, ['target'])
    expect(second.ok && second.target.id).toBe('target-2')
  })

  it('label 留空时回落 id（界面不至于出现空行）', () => {
    const checked = validateTargetInput({ kind: 'loki', url: 'http://127.0.0.1:3100' }, [])
    expect(checked.ok && checked.target.label).toBe('127-0-0-1-3100')
  })

  it('docker 允许空地址；其余类型必须填', () => {
    expect(validateTargetInput({ kind: 'docker' }, []).ok).toBe(true)
    const missing = validateTargetInput({ kind: 'loki' }, [])
    expect(missing.ok === false ? missing.error : '').toContain('地址不能为空')
  })

  it('类型不认识时 400 文案点出支持面', () => {
    const bad = validateTargetInput({ kind: 'splunk', url: 'http://127.0.0.1:3100' }, [])
    expect(bad.ok === false ? bad.error : '').toContain('loki / elasticsearch / opensearch / docker')
  })

  it('dockerTarget 只对 docker 来源有意义（别的类型带上它直接报错）', () => {
    const docker = validateTargetInput({ kind: 'docker', label: '本机', dockerTarget: 'local' }, [])
    expect(docker.ok && docker.target.dockerTarget).toBe('local')
    const loki = validateTargetInput({ kind: 'loki', url: 'http://127.0.0.1:3100', dockerTarget: 'local' }, [])
    expect(loki.ok).toBe(false)
    expect(loki.ok === false ? loki.error : '').toContain('只对 docker 来源有意义')
  })

  it('dockerTarget 可以留空（由 Docker 面板自己在只有一个目标时回落）', () => {
    const checked = validateTargetInput({ kind: 'docker', label: '本机' }, [])
    expect(checked.ok && checked.target.dockerTarget).toBeUndefined()
  })

  it('改判也能改 dockerTarget', () => {
    const start = configWith({ kind: 'docker', label: '本机 Docker', dockerTarget: 'local' })
    // 这条来源的 id 由 label 推出来（「本机 Docker」→ docker）
    const updated = updateTarget(start, 'docker', { dockerTarget: 'remote-1' })
    expect(updated.ok ? updated.config.targets[0].dockerTarget : '').toBe('remote-1')
  })

  it('allowPublic 只对查询类来源有意义（docker 没有出站，带上它直接报错）', () => {
    const loki = validateTargetInput({ kind: 'loki', url: 'http://127.0.0.1:3100', allowPublic: true }, [])
    expect(loki.ok && loki.target.allowPublic).toBe(true)
    const docker = validateTargetInput({ kind: 'docker', label: '本机', allowPublic: true }, [])
    expect(docker.ok).toBe(false)
    expect(docker.ok === false ? docker.error : '').toContain('只对查询类来源有意义')
  })

  it('allowPublic 缺省不写进目标（默认拒公网，别给配置面留一个恒为 false 的字段）', () => {
    const checked = validateTargetInput({ kind: 'loki', url: 'http://127.0.0.1:3100' }, [])
    expect(checked.ok && 'allowPublic' in checked.target).toBe(false)
    // 不是布尔的真值不当真（'yes' / 1 一律按「没开」）
    const loose = validateTargetInput({ kind: 'loki', url: 'http://127.0.0.1:3100', allowPublic: 'yes' }, [])
    expect(loose.ok && loose.target.allowPublic).toBeUndefined()
  })

  it('改判能开也能关 allowPublic（关了要真的从目标上消失）', () => {
    const start = configWith({ kind: 'loki', label: 'loki', url: 'http://127.0.0.1:3100' })
    const opened = updateTarget(start, 'loki', { allowPublic: true })
    expect(opened.ok && opened.config.targets[0].allowPublic).toBe(true)
    // 只改 label 时不该把开关冲掉
    const kept = updateTarget(opened.ok ? opened.config : start, 'loki', { label: '本地 Loki' })
    expect(kept.ok && kept.config.targets[0].allowPublic).toBe(true)
    const closed = updateTarget(kept.ok ? kept.config : start, 'loki', { allowPublic: false })
    expect(closed.ok && closed.config.targets[0].allowPublic).toBeUndefined()
  })

  it('非对象输入拒（数组也算）', () => {
    expect(validateTargetInput([], []).ok).toBe(false)
    expect(validateTargetInput(null, []).ok).toBe(false)
    expect(validateTargetInput('loki', []).ok).toBe(false)
  })
})

describe('增删改', () => {
  it('addTarget 追加并保留原有来源', () => {
    const start = configWith({ kind: 'loki', label: 'loki', url: 'http://127.0.0.1:3100' })
    const added = addTarget(start, { kind: 'elasticsearch', label: 'es', url: 'http://127.0.0.1:9200' })
    expect(added.ok).toBe(true)
    expect(added.ok ? added.config.targets.map((target) => target.id) : []).toEqual(['loki', 'es'])
  })

  it('addTarget 到上限后报错，不悄悄丢掉', () => {
    const many = Array.from({ length: MAX_TARGETS }, (_item, index) => ({
      kind: 'docker',
      label: 'd' + String(index),
      url: '',
    }))
    const full = configWith(...many)
    expect(full.targets).toHaveLength(MAX_TARGETS)
    const outcome = addTarget(full, { kind: 'docker', label: 'extra' })
    expect(outcome.ok).toBe(false)
    expect(outcome.ok === false ? outcome.error : '').toContain(String(MAX_TARGETS))
  })

  it('updateTarget 换地址但 id 不变', () => {
    const start = configWith({ kind: 'loki', label: 'loki', url: 'http://127.0.0.1:3100' })
    const updated = updateTarget(start, 'loki', { url: 'http://127.0.0.1:3200' })
    expect(updated.ok).toBe(true)
    expect(updated.ok ? updated.config.targets[0] : undefined).toEqual({
      id: 'loki',
      kind: 'loki',
      label: 'loki',
      url: 'http://127.0.0.1:3200',
    })
  })

  it('updateTarget 的 patch 里的 id 会被忽略（id 不可改）', () => {
    const start = configWith({ kind: 'loki', label: 'loki', url: 'http://127.0.0.1:3100' })
    const updated = updateTarget(start, 'loki', { id: 'renamed', label: '改名' })
    expect(updated.ok ? updated.config.targets[0].id : '').toBe('loki')
    expect(updated.ok ? updated.config.targets[0].label : '').toBe('改名')
  })

  it('updateTarget 的非法值不落盘（400 文案带原因）', () => {
    const start = configWith({ kind: 'loki', label: 'loki', url: 'http://127.0.0.1:3100' })
    const bad = updateTarget(start, 'loki', { kind: 'splunk' })
    expect(bad.ok).toBe(false)
    const badPatch = updateTarget(start, 'loki', 'nope')
    expect(badPatch.ok === false ? badPatch.error : '').toContain('patch 必须是对象')
  })

  it('找不到来源时增删改都报「来源不存在」', () => {
    const start = emptyConfig()
    for (const outcome of [updateTarget(start, 'ghost', {}), removeTarget(start, 'ghost')]) {
      expect(outcome.ok).toBe(false)
      expect(outcome.ok === false ? outcome.error : '').toContain('来源不存在')
    }
  })

  it('removeTarget 只删指定的那一条', () => {
    const start = configWith(
      { kind: 'loki', label: 'loki', url: 'http://127.0.0.1:3100' },
      { kind: 'docker', label: 'docker', url: '' },
    )
    const removed = removeTarget(start, 'loki')
    expect(removed.ok ? removed.config.targets.map((target) => target.id) : []).toEqual(['docker'])
  })
})
