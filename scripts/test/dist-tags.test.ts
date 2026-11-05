/**
 * `scripts/lib/dist-tags.mjs` 的单元测试 —— `next` dist-tag 的判据与修法文案。
 *
 * 为什么有这份测试：这条判据唯一的消费方是**发布脚本的收尾**，而收尾只在每次 tag 时跑一次。
 * 它漂掉的样子是「发版照常绿、`@next` 却停留在半年前的 rc 上」——**没有任何反馈**，直到有人
 * 按文档装 `@next` 才发现（2026-11-05 实测：`dsh-tty` 的 `next` 是 `0.22.0-rc.2`，`dsh-loglens`
 * 干脆没有这个 tag，最少落后 15 个版本）。
 *
 * 四组断言各有分工：
 *   ① 稳定版：`next` 与 `latest` 都必须等于本次版本（少一个就红）；
 *   ② 预发布：`next` 要跟上，但 **`latest` 保持旧值是合法的**（预发布不抢正式通道）；
 *   ③ 「没有 tag」与「指向错版本」分开报——前者要 `add`、后者要覆盖，混成一句会让人查错方向；
 *   ④ 修法文案必须带 `--registry`：本机 `~/.npmrc` 可能指向内网镜像，缺了它就打到镜像上。
 *
 * 判据用**相等**而不是 semver 比较，理由写在 `dist-tags.mjs` 头部：指向一个「未来版本」同样是
 * 错的（有人在仓库外发过包 / 上次发布回滚了一半），而 `不落后` 会让这种错静默通过。
 */
import { describe, expect, it } from 'vitest'

import { describeDistTagFix, isPrerelease, judgeNextTag, LATEST_TAG, NEXT_TAG } from '../lib/dist-tags.mjs'

const stable = (next: string | undefined, latest: string | undefined) => ({
  ...(next === undefined ? {} : { [NEXT_TAG]: next }),
  ...(latest === undefined ? {} : { [LATEST_TAG]: latest }),
})

describe('稳定版：next 与 latest 都要指向本次版本', () => {
  it('两者都对 → 绿', () => {
    expect(judgeNextTag({ name: 'p', version: '0.38.0', tags: stable('0.38.0', '0.38.0') })).toEqual([])
  })

  it('next 落后于本次版本 → 红，且点名两个版本', () => {
    const violations = judgeNextTag({ name: 'p', version: '0.38.0', tags: stable('0.22.0-rc.2', '0.38.0') })
    expect(violations).toHaveLength(1)
    expect(violations[0]).toContain('0.22.0-rc.2')
    expect(violations[0]).toContain('0.38.0')
  })

  it('next 指向「未来」的版本也红（不落后 ≠ 正确）', () => {
    const violations = judgeNextTag({ name: 'p', version: '0.38.0', tags: stable('0.39.0', '0.38.0') })
    expect(violations).toHaveLength(1)
    expect(violations[0]).toContain('0.39.0')
  })

  it('latest 落后 → 红（说明这次发布没落地到正式通道）', () => {
    const violations = judgeNextTag({ name: 'p', version: '0.38.0', tags: stable('0.38.0', '0.37.3') })
    expect(violations).toHaveLength(1)
    expect(violations[0]).toContain(LATEST_TAG)
  })

  it('两个都错 → 两条，按 next 在前', () => {
    const violations = judgeNextTag({ name: 'p', version: '0.38.0', tags: stable('0.1.0', '0.2.0') })
    expect(violations).toHaveLength(2)
    expect(violations[0]).toContain(NEXT_TAG)
  })
})

describe('「没有这个 tag」与「指向错版本」必须分开报', () => {
  it('没有 next → 文案说「没有」而不是「指向 undefined」', () => {
    const violations = judgeNextTag({ name: 'dsh-loglens', version: '0.1.8', tags: stable(undefined, '0.1.8') })
    expect(violations).toHaveLength(1)
    expect(violations[0]).toContain('没有')
    expect(violations[0]).not.toContain('undefined')
  })

  it('registry 读不到（tags 为 undefined）→ 同样按「没有」报，不静默通过', () => {
    const violations = judgeNextTag({ name: 'p', version: '0.1.0', tags: undefined })
    expect(violations.length).toBeGreaterThan(0)
    expect(violations.every((line) => line.startsWith('p '))).toBe(true)
  })
})

describe('预发布：next 要跟上，latest 保持旧值是合法的', () => {
  it('预发布 + next 指向它 + latest 仍是上一个稳定版 → 绿', () => {
    expect(isPrerelease('0.16.0-rc.1')).toBe(true)
    expect(judgeNextTag({ name: 'p', version: '0.16.0-rc.1', tags: stable('0.16.0-rc.1', '0.15.2') })).toEqual([])
  })

  it('预发布但 next 没跟上 → 红', () => {
    const violations = judgeNextTag({ name: 'p', version: '0.16.0-rc.2', tags: stable('0.16.0-rc.1', '0.15.2') })
    expect(violations).toHaveLength(1)
    expect(violations[0]).toContain('0.16.0-rc.1')
  })

  it('预发布时 latest 恰好等于它也不是错（只是不判这一条）', () => {
    expect(judgeNextTag({ name: 'p', version: '0.16.0-rc.1', tags: stable('0.16.0-rc.1', '0.16.0-rc.1') })).toEqual([])
  })
})

describe('修法文案：可直接粘，且带 registry', () => {
  it('给出 `npm dist-tag add <name>@<version> next --registry …`', () => {
    const fix = describeDistTagFix({ name: '@hyzyn/dsh-tty', version: '0.38.0' })
    expect(fix).toBe('npm dist-tag add @hyzyn/dsh-tty@0.38.0 next --registry https://registry.npmjs.org')
  })
})
