/**
 * @hyzyn/dsh-loglens — 客户端纯逻辑的用例（构建型包：源在 client-src/，产物是 client.js）。
 */
import { describe, expect, it } from 'vitest'
import { draftFromTarget, draftPayload, draftProblem, emptyDraft, kindOptions } from '../client-src/pure.js'

describe('draft 形状', () => {
  it('kindOptions 是副本：改动不会污染模块内部', () => {
    const options = kindOptions()
    options.push('splunk')
    expect(kindOptions()).toEqual(['loki', 'elasticsearch', 'opensearch', 'docker'])
  })

  it('emptyDraft 是「还没落盘」的新行', () => {
    expect(emptyDraft()).toEqual({ id: '', kind: 'loki', label: '', url: '' })
  })

  it('draftFromTarget 缺字段补空串、未知类型回落 loki', () => {
    expect(draftFromTarget(undefined)).toEqual({ id: '', kind: 'loki', label: '', url: '' })
    expect(draftFromTarget({ id: 'es', kind: 'elasticsearch', label: 'ES', url: 'http://127.0.0.1:9200' }))
      .toEqual({ id: 'es', kind: 'elasticsearch', label: 'ES', url: 'http://127.0.0.1:9200' })
    expect(draftFromTarget({ kind: 'splunk', id: 7 }).kind).toBe('loki')
    expect(draftFromTarget({ kind: 'splunk', id: 7 }).id).toBe('')
  })
})

describe('draftProblem', () => {
  it('地址齐了的 loki 可以提交', () => {
    expect(draftProblem({ id: '', kind: 'loki', label: 'loki', url: 'http://127.0.0.1:3100' })).toBe('')
  })

  it('缺地址 / 不合法地址分别回报 needUrl 与 badUrl', () => {
    expect(draftProblem({ kind: 'loki', url: '' })).toBe('needUrl')
    expect(draftProblem({ kind: 'loki', url: '   ' })).toBe('needUrl')
    expect(draftProblem({ kind: 'loki', url: '127.0.0.1:3100' })).toBe('badUrl')
    expect(draftProblem({ kind: 'elasticsearch', url: 'ftp://127.0.0.1' })).toBe('badUrl')
  })

  it('docker 是采集来源：地址留空也能提交', () => {
    expect(draftProblem({ kind: 'docker', url: '' })).toBe('')
  })

  it('类型不认识时报 badKind', () => {
    expect(draftProblem({ kind: 'splunk', url: 'http://127.0.0.1:3100' })).toBe('badKind')
  })

  it('链路本地地址刻意不在这层拦：宿主 400 会带原因（判据只有宿主一份）', () => {
    expect(draftProblem({ kind: 'loki', url: 'http://169.254.169.254/loki' })).toBe('')
  })
})

describe('draftPayload', () => {
  it('只发三列并去掉首尾空白（id 不进载荷）', () => {
    expect(draftPayload({ id: 'loki', kind: 'loki', label: '  本地 Loki  ', url: '  http://127.0.0.1:3100  ' }))
      .toEqual({ kind: 'loki', label: '本地 Loki', url: 'http://127.0.0.1:3100' })
  })

  it('缺字段不产出 undefined（宿主拿到的是字符串）', () => {
    expect(draftPayload({ kind: 'docker' })).toEqual({ kind: 'docker', label: '', url: '' })
  })
})
