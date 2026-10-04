/**
 * `scripts/check-toolchain-pins.mjs` 的用例 —— 两处「版本声明必须自洽」的闸门。
 *
 * 这组用例守四件事：
 *
 * 1. **两条判据各自的反例都要抓住**（这是闸门存在的全部理由）：
 *    ① vitest 与 `@vitest/coverage-v8` 脱版——2026-10-04 实测：改成 `3.2.0` 后
 *       pnpm 装成功、五道闸门全绿、`coverage:check` 照常出正常数字（而 peer 是精确
 *       `3.2.7`，coverage-v8 源码里**没有任何版本自检**）；
 *    ② workflow 里的 dsh CLI pin 漂移——实测改成 `0.1.6-alpha.2`（真实存在、但不在
 *       cohort 列表里）后，`dsh-peers:check` 与 `kit-pins:check` 都绿。
 * 2. **判据 1a 是自维护的**：不写死 `3.2.7`，升 vitest 时自动跟随——所以用例用
 *    **非 3.2.7 的假版本**（如 `4.0.0`）验证它，而不是拿真版本去断言。
 * 3. **数据源耦合要钉住**：`parseCohorts(根 peer 范围)` 必须等于 `check-dsh-peers.mjs`
 *    里的 `DSH_COHORTS`。这两处是**同一份事实的两个投影**（后者拿 `DSH_COHORTS` 拼出
 *    `EXPECTED_RANGE` 并要求每个包的 peer 逐字等于它），一旦漂了，先红的是
 *    `dsh-peers:check`——但这条用例让本闸门**当场**报出来，而不是等别人发现。
 * 4. **形态不认识时不许猜**：`parseCohorts` 遇到非「逐 cohort 的 `^` 用 `||` 连起来」
 *    的写法返回 `undefined`（CLI 会报错退出），而不是拆出一个空列表然后恒绿。
 *
 * 全部走注入（纯函数），不碰真实 `node_modules`、不改 workflow——所以是**毫秒级**的。
 * 真实仓库那两条由 CLI 路径（`pnpm toolchain:check`）覆盖。
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import {
  ALLOWED_OLDER_PINS,
  checkDshPins,
  checkVitestPairing,
  EXACT_VERSION,
  parseCohorts,
} from '../check-toolchain-pins.mjs'

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url))
const COHORTS = ['0.1.7-rc.2', '0.2.0-rc.1', '0.2.0-rc.2', '0.2.1-alpha.1']

/** 一份「配对正确」的基准输入；各用例只改需要变的那一项。 */
const paired = {
  installedVitest: '3.2.7',
  installedCoverage: '3.2.7',
  declaredCoverage: '3.2.7',
  coveragePeerVitest: '3.2.7',
}

describe('checkVitestPairing：覆盖率引擎与测试引擎必须配套', () => {
  it('配对正确 → 无差异', () => {
    expect(checkVitestPairing(paired)).toEqual([])
  })

  it('**实装版本不同 → 报**（2026-10-04 实测的洞：改 3.2.0 后五道闸门全绿）', () => {
    const violations = checkVitestPairing({ ...paired, installedCoverage: '3.2.0', coveragePeerVitest: '3.2.0' })
    expect(violations.join('\n')).toContain('实装版本不同')
    expect(violations.join('\n')).toContain('3.2.7')
    expect(violations.join('\n')).toContain('3.2.0')
  })

  it('判据是**自维护**的：换一对非 3.2.7 的版本仍判绿（没有写死版本号）', () => {
    expect(
      checkVitestPairing({
        installedVitest: '4.1.11',
        installedCoverage: '4.1.11',
        declaredCoverage: '4.1.11',
        coveragePeerVitest: '4.1.11',
      }),
    ).toEqual([])
  })

  it('自维护的另一面：4.x 的 vitest 配 3.x 的 coverage → 报', () => {
    const violations = checkVitestPairing({ ...paired, installedVitest: '4.1.11' })
    expect(violations.join('\n')).toContain('实装版本不同')
  })

  it('coverage 声明的精确 peer 与实际 vitest 不符 → 报（「这一份不是给这个 vitest 用的」）', () => {
    const violations = checkVitestPairing({ ...paired, coveragePeerVitest: '3.2.0' })
    expect(violations.join('\n')).toContain('peer')
    expect(violations.join('\n')).toContain('3.2.0')
  })

  it('**声明写成范围 → 报**（范围会让它解析出与 vitest 不同的一份）', () => {
    for (const bad of ['^3.2.7', '~3.2.7', '>=3.2.7', 'latest']) {
      const violations = checkVitestPairing({ ...paired, declaredCoverage: bad })
      expect(violations.join('\n'), `${bad} 应被拒`).toContain('必须是精确版本')
    }
  })

  it('**没装 → 报「无法判定」**（不许让「没装」伪装成「配对正确」）', () => {
    expect(checkVitestPairing({ ...paired, installedVitest: undefined }).join('\n')).toContain('找不到')
    expect(checkVitestPairing({ ...paired, installedCoverage: undefined }).join('\n')).toContain('找不到')
    expect(checkVitestPairing({ ...paired, installedVitest: undefined, installedCoverage: undefined }).join('\n')).toContain('vitest')
  })

  it('peer 是范围形态且不等于实装版本 → 报「不做范围求解」（不假装判过）', () => {
    const violations = checkVitestPairing({ ...paired, coveragePeerVitest: '^3.2.7' })
    expect(violations.join('\n')).toContain('范围形态')
    expect(violations.join('\n')).toContain('不做范围求解')
  })
})

describe('checkDshPins：workflow 装的 dsh CLI 必须是最新 cohort', () => {
  it('pin 就是最新档 → 无差异', () => {
    expect(checkDshPins({ cohorts: COHORTS, pins: [{ file: 'ci.yml', version: '0.2.1-alpha.1' }] })).toEqual([])
  })

  it('**pin 不在 cohort 列表里 → 报**（实测改成 0.1.6-alpha.2 后两道闸门全绿）', () => {
    const violations = checkDshPins({ cohorts: COHORTS, pins: [{ file: '.github/workflows/ci.yml', version: '0.1.6-alpha.2' }] })
    expect(violations.join('\n')).toContain('不在 peer 声明的 cohort 列表里')
    expect(violations.join('\n'), '要列出合法档位').toContain('0.1.7-rc.2')
  })

  it('**pin 落后于最新档 → 报**（更隐蔽：它在 cohort 里，但最新档从没被车道验过）', () => {
    const violations = checkDshPins({ cohorts: COHORTS, pins: [{ file: '.github/workflows/ci.yml', version: '0.2.0-rc.2' }] })
    expect(violations.join('\n')).toContain('落后于最新 cohort')
    expect(violations.join('\n')).toContain('0.2.1-alpha.1')
  })

  it('`@latest` 这类 dist-tag 也会被抓（它不在 cohort 列表里）', () => {
    const violations = checkDshPins({ cohorts: COHORTS, pins: [{ file: 'ci.yml', version: 'latest' }] })
    expect(violations.join('\n')).toContain('不在 peer 声明的 cohort 列表里')
  })

  it('两个 workflow 都被扫到（ci.yml 与 release.yml 各一处）', () => {
    const violations = checkDshPins({
      cohorts: COHORTS,
      pins: [
        { file: '.github/workflows/ci.yml', version: '0.2.0-rc.2' },
        { file: '.github/workflows/release.yml', version: '0.2.0-rc.1' },
      ],
    })
    expect(violations).toHaveLength(2)
    expect(violations[0]).toContain('ci.yml')
    expect(violations[1]).toContain('release.yml')
  })

  it('豁免要能生效，且**只对同一个 file+version**生效', () => {
    const pin = { file: '.github/workflows/ci.yml', version: '0.2.0-rc.2' }
    const allowed = [{ file: pin.file, version: pin.version, why: '最新档 CLI 还没发出来' }]
    expect(checkDshPins({ cohorts: COHORTS, pins: [pin], allowed })).toEqual([])
    // 另一个文件同版本仍报——豁免不是「按版本全局放行」
    const other = { file: '.github/workflows/release.yml', version: pin.version }
    expect(checkDshPins({ cohorts: COHORTS, pins: [other], allowed }).join('\n')).toContain('落后于最新 cohort')
  })

  it('真实豁免表目前为空（有豁免就必须带理由，不许悄悄放行）', () => {
    expect(ALLOWED_OLDER_PINS).toEqual([])
  })
})

describe('parseCohorts：只认本仓唯一合法写法，不认识就返回 undefined（不猜）', () => {
  it('标准形态（逐 cohort 的 ^ 用 || 连起来）', () => {
    expect(parseCohorts(COHORTS.map((c) => `^${c}`).join(' || '))).toEqual(COHORTS)
  })

  it('无空格 / 单 cohort 都认', () => {
    expect(parseCohorts('^0.1.7-rc.2||^0.2.0-rc.1')).toEqual(['0.1.7-rc.2', '0.2.0-rc.1'])
    expect(parseCohorts('^0.1.7-rc.2')).toEqual(['0.1.7-rc.2'])
  })

  it('**范围形态不认**（返回 undefined 让 CLI 报错，而不是拆出空列表然后恒绿）', () => {
    expect(parseCohorts('>=0.1.7-rc.2 <0.3.0')).toBeUndefined()
    expect(parseCohorts('~0.1.7-rc.2')).toBeUndefined()
    expect(parseCohorts('0.1.7-rc.2')).toBeUndefined()
  })

  it('空串 / 非字符串不认', () => {
    expect(parseCohorts('')).toBeUndefined()
    expect(parseCohorts('   ')).toBeUndefined()
    expect(parseCohorts(undefined)).toBeUndefined()
  })

  it('**数据源耦合**：根 peer 范围拆出的 cohort == check-dsh-peers.mjs 的 DSH_COHORTS', () => {
    // 同一份事实的两个投影：后者拿 DSH_COHORTS 拼 EXPECTED_RANGE 并要求各包 peer 逐字等于它。
    // 漂了先红的是 dsh-peers:check，但这条让本闸门当场报出来。
    const manifest = JSON.parse(readFileSync(`${REPO_ROOT}package.json`, 'utf8'))
    const fromPeer = parseCohorts(manifest.peerDependencies['@deepseek-ai/dsh'])
    const peersScript = readFileSync(`${REPO_ROOT}scripts/check-dsh-peers.mjs`, 'utf8')
    const declared = /const DSH_COHORTS = (\[[^\]]*\])/.exec(peersScript)
    expect(declared, 'check-dsh-peers.mjs 里应能找到 DSH_COHORTS 字面量').not.toBeNull()
    expect(fromPeer).toEqual(JSON.parse(declared[1].replace(/'/g, '"')))
  })

  it('真实仓库的 pin 确实是最新 cohort（CLI 判据的用例侧复算）', () => {
    const manifest = JSON.parse(readFileSync(`${REPO_ROOT}package.json`, 'utf8'))
    const cohorts = parseCohorts(manifest.peerDependencies['@deepseek-ai/dsh'])
    const newest = cohorts[cohorts.length - 1]
    for (const file of ['ci.yml', 'release.yml']) {
      const text = readFileSync(`${REPO_ROOT}.github/workflows/${file}`, 'utf8')
      // 逐行找**非注释**行：注释里那条 `…dsh@<pin>` 示例不是 pin（第一版闸门就被它绊倒过）
      const pins = text
        .split('\n')
        .filter((line) => !line.trimStart().startsWith('#'))
        .map((line) => /npm\s+install\s+-g\s+@deepseek-ai\/dsh@(\S+)/.exec(line))
        .filter((m) => m !== null)
        .map((m) => m[1])
      expect(pins, `${file} 里应恰有一处 dsh CLI 安装 pin`).toHaveLength(1)
      expect(pins[0], `${file} 的 pin 应是最新 cohort`).toBe(newest)
    }
  })

  it('**注释里的 `dsh@<pin>` 示例不算 pin**（第一版闸门第一次跑就报了自己写的注释）', () => {
    // 这是真发生过的：本闸门的 step 注释里写了 `npm install -g @deepseek-ai/dsh@<pin>` 当示例，
    // 而第一版没排除注释行 → `pnpm toolchain:check` 直接红，报「<pin> 不在 cohort 列表里」。
    const withComment = [
      '# 说明：`npm install -g @deepseek-ai/dsh@<pin>` 是占位符',
      '      - run: npm install -g @deepseek-ai/dsh@0.2.1-alpha.1',
    ].join('\n')
    const pins = withComment
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('#'))
      .map((line) => /npm\s+install\s+-g\s+@deepseek-ai\/dsh@(\S+)/.exec(line))
      .filter((m) => m !== null)
      .map((m) => m[1])
    expect(pins).toEqual(['0.2.1-alpha.1'])
  })
})

describe('EXACT_VERSION：精确版本的判据', () => {
  it('接受精确版本（含预发布）', () => {
    for (const ok of ['3.2.7', '0.2.1-alpha.1', '0.1.7-rc.2', '4.1.11']) expect(EXACT_VERSION.test(ok), ok).toBe(true)
  })

  it('拒绝范围 / dist-tag / 协议', () => {
    for (const bad of ['^3.2.7', '~3.2.7', '>=3.2.7', 'latest', 'next', 'workspace:*', 'file:../x', 'git+https://x']) {
      expect(EXACT_VERSION.test(bad), bad).toBe(false)
    }
  })
})
