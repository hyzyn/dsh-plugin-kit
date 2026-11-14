import { describe, expect, it } from 'vitest'
import {
  WORKFLOW_FILE,
  REPO,
  allowsPublish,
  decideAction,
  isAtLeast,
  matchesWorkflow,
  parseTrustList,
} from '../trusted-publishing.mjs'

/**
 * 这组用例盯的是「要不要动 registry」的判据。
 *
 * 两种错法都不可本地复现（要真账号动真 registry），所以每种出口都必须有反例：
 * 把「没有配置」判成「读不到」→ 全部跳过却报告正常；把「已有别的配置」判成「没有配置」
 * → 发创建请求被 registry 拒（同包只允许一条），更糟的是有人照报错去 revoke 把好配置删了。
 */

describe('parseTrustList：三态', () => {
  it('空 stdout 是「没有配置」，不是「读不到」', () => {
    // npm --json 下空配置一个字都不打印（dialogue 在 json 模式被抑制）。
    // 判成 null 会让 14 个包全部跳过，而报告看上去一切正常。
    expect(parseTrustList('')).toEqual([])
    expect(parseTrustList('   \n\t ')).toEqual([])
  })

  it('单个配置对象包成数组', () => {
    const config = { id: 'abc', type: 'github', file: WORKFLOW_FILE, repository: REPO }
    expect(parseTrustList(JSON.stringify(config))).toEqual([config])
  })

  it('数组原样返回', () => {
    const configs = [{ id: 'a' }, { id: 'b' }]
    expect(parseTrustList(JSON.stringify(configs))).toEqual(configs)
  })

  it('空对象按「没有配置」处理', () => {
    expect(parseTrustList('{}')).toEqual([])
  })

  it('解析不了返回 null（不能当成没有配置）', () => {
    expect(parseTrustList('npm error something')).toBeNull()
    expect(parseTrustList('{"truncated":')).toBeNull()
    expect(parseTrustList(null)).toBeNull()
    expect(parseTrustList(undefined)).toBeNull()
    // 合法 JSON 但不是对象/数组
    expect(parseTrustList('"text"')).toBeNull()
    expect(parseTrustList('42')).toBeNull()
  })
})

describe('matchesWorkflow', () => {
  it('命中本仓 workflow', () => {
    expect(matchesWorkflow({ repository: REPO, file: WORKFLOW_FILE })).toBe(true)
  })

  it('大小写不敏感，且仓库名不区分大小写（npm 与 GitHub 都不区分）', () => {
    expect(matchesWorkflow({ repository: REPO.toUpperCase(), file: WORKFLOW_FILE })).toBe(true)
  })

  it('别名字段也算（repo / workflow / claims 形态）', () => {
    expect(matchesWorkflow({ repo: REPO, workflow: WORKFLOW_FILE })).toBe(true)
    expect(matchesWorkflow({ claims: { repository: REPO, workflow_ref: { file: WORKFLOW_FILE } } })).toBe(true)
  })

  it('workflow_ref 是路径形态时按后缀匹配', () => {
    expect(
      matchesWorkflow({
        repository: REPO,
        claims: { workflow_ref: { file: `${REPO}/.github/workflows/${WORKFLOW_FILE}@refs/tags/v0.1.85` } },
      }),
    ).toBe(true)
  })

  it('仓库不同 → 不命中（fork 的 workflow 不能替本仓发布）', () => {
    expect(matchesWorkflow({ repository: 'someone/dsh-plugin-kit', file: WORKFLOW_FILE })).toBe(false)
  })

  it('workflow 文件不同 → 不命中（别的 workflow 不能替 release 发布）', () => {
    expect(matchesWorkflow({ repository: REPO, file: 'ci.yml' })).toBe(false)
  })

  it('字段缺失 → 不命中（宁可 blocked，不可猜成命中）', () => {
    expect(matchesWorkflow({ file: WORKFLOW_FILE })).toBe(false)
    expect(matchesWorkflow({ repository: REPO })).toBe(false)
    expect(matchesWorkflow({})).toBe(false)
    expect(matchesWorkflow(null)).toBe(false)
  })

  it('后缀匹配不能被「文件名是另一个的前缀」骗到', () => {
    // xrelease.yml 的结尾也是 release.yml —— 但后缀匹配到这里是正确的，
    // 因为 workflow_ref 的真后缀就是文件名；这里钉住的是「不能命中 ci.yml」这类。
    expect(matchesWorkflow({ repository: REPO, file: 'my-ci.yml' })).toBe(false)
  })
})

describe('allowsPublish', () => {
  it('createPackage 命中', () => {
    expect(allowsPublish({ permissions: ['createPackage'] })).toBe(true)
  })

  it('只有 stage publish → 不算', () => {
    expect(allowsPublish({ permissions: ['createStagedPackage'] })).toBe(false)
  })

  it('permissions 缺省按允许处理（老配置的语义）', () => {
    expect(allowsPublish({})).toBe(true)
    expect(allowsPublish({ permissions: [] })).toBe(true)
  })

  it('非对象 → 不允许', () => {
    expect(allowsPublish(null)).toBe(false)
  })
})

describe('decideAction：四种出口', () => {
  const mine = { id: 'x', type: 'github', repository: REPO, file: WORKFLOW_FILE, permissions: ['createPackage'] }

  it('没有配置 → create', () => {
    expect(decideAction([]).action).toBe('create')
  })

  it('已是本 workflow 且有 publish 权限 → skip', () => {
    expect(decideAction([mine]).action).toBe('skip')
  })

  it('读不到 → blocked（不能据此重配）', () => {
    expect(decideAction(null).action).toBe('blocked')
  })

  it('已有别的配置 → blocked（换代是人的决定）', () => {
    const other = { id: 'y', type: 'github', repository: 'someone/other', file: WORKFLOW_FILE }
    expect(decideAction([other]).action).toBe('blocked')
  })

  it('本 workflow 但只有 stage 权限 → blocked（发布会被拦）', () => {
    const stageOnly = { ...mine, permissions: ['createStagedPackage'] }
    expect(decideAction([stageOnly]).action).toBe('blocked')
  })

  it('多条里只要有一条是本 workflow 且能发布 → skip', () => {
    const other = { id: 'y', type: 'github', repository: 'someone/other', file: WORKFLOW_FILE }
    expect(decideAction([other, mine]).action).toBe('skip')
  })
})

describe('isAtLeast', () => {
  it('npm trust 下限是 11.15.0', () => {
    expect(isAtLeast('11.15.0', [11, 15, 0])).toBe(true)
    expect(isAtLeast('11.19.1', [11, 15, 0])).toBe(true)
    expect(isAtLeast('12.0.0', [11, 15, 0])).toBe(true)
    expect(isAtLeast('11.14.9', [11, 15, 0])).toBe(false)
    expect(isAtLeast('10.30.3', [11, 15, 0])).toBe(false)
  })

  it('预发布后缀被忽略', () => {
    expect(isAtLeast('11.15.0-rc.1', [11, 15, 0])).toBe(true)
  })

  it('解析不了 → false（不能放行）', () => {
    expect(isAtLeast('', [11, 15, 0])).toBe(false)
    expect(isAtLeast('abc', [11, 15, 0])).toBe(false)
  })
})
