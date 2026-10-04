/**
 * `scripts/check-test-collection.mjs` 的用例 —— 「写了测试但从不运行」这道闸。
 *
 * 这组用例守三件事：
 *
 * 1. **两种漏法都要抓住**（这是闸门存在的全部理由）：
 *    ① 放错目录（`packages/<pkg>/tests/` 而非 `test/`）；② 扩展名写错（`.spec.ts` 而非
 *    `.test.ts`）。两者都会让 vitest **静默不收集**——`pnpm test` 照旧全绿。
 *    2026-10-04 实测反证：一条 `expect(1).toBe(999)` 的文件放进 `packages/tty/tests/zz-probe.spec.ts`
 *    后，vitest 收集 0 个、`pnpm test` 113 passed / 1768 passed 全绿、十二道闸门无一变红。
 * 2. **白名单不许腐烂**：`ALLOWED_UNCOLLECTED` 里指向的文件被删/改名后仍留着，
 *    会在将来同位置出现**真的**漏检时把它一起豁免掉。判据 3 就是钉这个。
 * 3. **路径归一跨平台**：vitest 在 Windows 上输出反斜杠、`git ls-files` 输出正斜杠，
 *    不归一会让闸门在 Windows 腿上**全量假阳性**（2026-10-03 的 `chrome-path.test.ts`
 *    踩过同一个坑：断言里写死正斜杠，Windows 上 `path.join` 产反斜杠直接红）。
 *
 * 全部走注入（`onDisk` / `collected` / `allowed` 都是参数），不碰真实仓库、不跑 vitest——
 * 所以单测是**秒级**的，而闸门自己的真实收集成本（0.32s）只在 CLI 路径上付一次。
 */
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { ALLOWED_UNCOLLECTED, checkTestCollection, normalizeRepoPath } from '../check-test-collection.mjs'

/** 判据里报出来的「哪一条违规」——路径类取冒号前那截（路径本身不含全角冒号）。 */
function kindsOf(input) {
  return checkTestCollection(input).violations.map((v) => v.split('：')[0])
}

/** 违规全文拼起来，供「消息里必须含某段话」这类断言用（白名单那条的前缀里还有别的冒号）。 */
function messagesOf(input) {
  return checkTestCollection(input).violations.join('\n')
}

describe('checkTestCollection：未被收集的测试文件必须报出来', () => {
  it('全部被收集 → 无差异', () => {
    const input = {
      onDisk: ['packages/a/test/x.test.ts', 'scripts/test/y.test.ts'],
      collected: ['packages/a/test/x.test.ts', 'scripts/test/y.test.ts'],
    }
    expect(checkTestCollection(input).violations).toEqual([])
    expect(checkTestCollection(input).checked).toBe(2)
  })

  it('**放错目录（tests/ 而非 test/）→ 报**（2026-10-04 实测的第一种漏法）', () => {
    const input = { onDisk: ['packages/tty/tests/zz-probe.spec.ts'], collected: [] }
    expect(kindsOf(input)).toEqual(['packages/tty/tests/zz-probe.spec.ts'])
    expect(checkTestCollection(input).uncollected).toEqual(['packages/tty/tests/zz-probe.spec.ts'])
  })

  it('**扩展名写成 .spec.ts → 报**（第二种漏法：目录对、名字错）', () => {
    const input = { onDisk: ['packages/tty/test/zz-probe.spec.ts'], collected: [] }
    expect(kindsOf(input)).toEqual(['packages/tty/test/zz-probe.spec.ts'])
  })

  it('盘面侧认全 vitest 默认形态（.test.jsx / .spec.mjs 等），不照抄 include', () => {
    // 照抄 include（只认 .test.ts）的话，「把 .test.ts 写成 .spec.ts」这个最常见的漏法就抓不到
    const input = {
      onDisk: ['scripts/test/a.test.jsx', 'scripts/test/b.spec.mjs', 'scripts/test/c.test.mts'],
      collected: [],
    }
    expect(checkTestCollection(input).uncollected).toHaveLength(3)
  })

  it('报错信息要说清「两个原因」与「怎么修」（否则看到的人只会删文件）', () => {
    const input = { onDisk: ['packages/a/tests/x.test.ts'], collected: [] }
    const [message] = checkTestCollection(input).violations
    expect(message).toContain('不会被 vitest 收集')
    expect(message, '要说清 include 只认哪两条').toContain('packages/<pkg>/test/')
    expect(message, '要给出白名单这条出路').toContain('ALLOWED_UNCOLLECTED')
  })

  it('收集到的文件比盘面多时不报（那不是这道闸的职责，别的闸门管）', () => {
    const input = { onDisk: ['packages/a/test/x.test.ts'], collected: ['packages/a/test/x.test.ts', 'packages/a/test/extra.test.ts'] }
    expect(checkTestCollection(input).violations).toEqual([])
  })
})

describe('白名单：豁免要有理由，且不许腐烂', () => {
  const entry = { path: 'templates/hello/test/hello.test.ts', why: '模板' }

  it('豁免的文件不报（templates/hello 是有意不收集的）', () => {
    const input = {
      onDisk: [entry.path],
      collected: [],
      allowed: [entry],
      allowedExist: { [entry.path]: true },
    }
    expect(checkTestCollection(input).violations).toEqual([])
  })

  it('**豁免的文件没了 → 报「白名单腐烂」**（这条豁免该跟着删）', () => {
    const input = {
      onDisk: [],
      collected: ['packages/a/test/x.test.ts'],
      allowed: [{ path: 'templates/hello/test/GONE.test.ts', why: '模板' }],
      allowedExist: { 'templates/hello/test/GONE.test.ts': false },
    }
    const kinds = kindsOf(input)
    expect(kinds).toContain('ALLOWED_UNCOLLECTED 里的 `templates/hello/test/GONE.test.ts` 在磁盘上不存在了')
    expect(messagesOf(input)).toContain('白名单会腐烂')
  })

  it('真实白名单的每一条都带 why（没有理由的豁免会在下次误报时被当成惯例留着）', () => {
    expect(ALLOWED_UNCOLLECTED.length).toBeGreaterThan(0)
    for (const item of ALLOWED_UNCOLLECTED) {
      expect(item.why, `${item.path} 缺理由`).toBeTruthy()
      expect(item.why.length, `${item.path} 的理由太短，说不清为什么有意不收集`).toBeGreaterThan(20)
    }
  })
})

describe('路径归一：跨平台不许假阳性', () => {
  it('Windows 反斜杠与 POSIX 正斜杠等价（否则 Windows 腿全量假阳性）', () => {
    const input = { onDisk: ['packages\\a\\test\\x.test.ts'], collected: ['packages/a/test/x.test.ts'] }
    expect(checkTestCollection(input).violations).toEqual([])
  })

  it('去掉 ./ 前缀', () => {
    expect(normalizeRepoPath('./packages/a/test/x.test.ts')).toBe('packages/a/test/x.test.ts')
  })

  it('绝对路径（仓库内）归一成相对路径', () => {
    // 用 fileURLToPath 而不是 `new URL(...).pathname`：后者在 Windows 上给 `/D:/a/...`
    // （带前导斜杠），正是下面那条反例要钉的形态。
    const abs = normalizeRepoPath(fileURLToPath(new URL('../check-test-collection.mjs', import.meta.url)))
    expect(abs).toBe('scripts/check-test-collection.mjs')
  })

  it('**Windows 的 `/D:/…` 前导斜杠也要归一**（2026-10-04 Windows 腿实测的真 bug）', () => {
    /*
     * 起因：Windows 上 `new URL(x, import.meta.url).pathname` 返回 `/D:/a/repo/…`，
     * 而 `path.resolve(root)` 给 `D:\a\repo`（不带前导斜杠）。两者归一后仍差一个斜杠，
     * 于是 `startsWith` 匹配不上、**归一静默失效**——Windows 腿实测报
     * `expected '/D:/a/dsh-plugin-kit/dsh-plugin-kit/s…' to be 'scripts/…'`。
     *
     * ## 为什么 root 也写成带前导斜杠的形态
     *
     * 这条用例要在**任何平台**都跑出同一个结论。`normalizeRepoPath` 内部对 root 调
     * `path.resolve`，而 POSIX 上 `resolve('D:/a/x')` 会把它当**相对路径**解析成
     * `<cwd>/D:/a/x`（实测：用例因此在 macOS 上红过一次）。
     * 写成 `'/D:/a/dsh-plugin-kit'` 则两边都稳：POSIX 上它已是绝对路径、`resolve` 原样返回；
     * Windows 上 `resolve('/D:/…')` 也给出 `D:\…`。两条路归一后都等于 `D:/a/dsh-plugin-kit`。
     */
    const root = '/D:/a/dsh-plugin-kit'
    expect(normalizeRepoPath('/D:/a/dsh-plugin-kit/scripts/test/x.test.ts', root)).toBe('scripts/test/x.test.ts')
    // 反斜杠 + 前导斜杠的组合（vitest 在 Windows 上的输出形态）
    expect(normalizeRepoPath('/D:\\a\\dsh-plugin-kit\\packages\\a\\test\\x.test.ts', root)).toBe('packages/a/test/x.test.ts')
    // root 自身也带前导斜杠时同样成立（两种写法都归一）
    expect(normalizeRepoPath('D:/a/dsh-plugin-kit/scripts/test/x.test.ts', root)).toBe('scripts/test/x.test.ts')
  })

  it('POSIX 路径不被前导斜杠规则误伤（`/usr/…` 必须原样）', () => {
    expect(normalizeRepoPath('/usr/local/x.test.ts', '/repo')).toBe('/usr/local/x.test.ts')
  })

  it('仓库外的绝对路径保持原样（不硬塞成相对路径，免得把别处的文件算成「仓库内」）', () => {
    expect(normalizeRepoPath('/somewhere/else/x.test.ts')).toBe('/somewhere/else/x.test.ts')
  })
})
