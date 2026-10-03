/**
 * `scripts/verify-devdata-host-mount.mjs` 的**安全守卫**（**脚本在仓根、守卫在包内**——
 * 与 codegraph 的 5 个 `verify-codegraph-*.mjs` 同一分工：脚本位置在根是为了进 `pnpm verify:list`，
 * 而守卫留在包内是因为它只关乎本包）。
 *
 * ## 为什么用「读源码断言」而不是跑脚本
 *
 * 跑真机脚本要装 DSH、起宿主、写工作区之外的路径——进不了 CI。而它的三条隔离性质是**纯静态**的，
 * 源码里看得见；真正的执行验证由脚本自己在收尾断言（它跑起来时会自证「真实补丁逐字节未变」）。
 * 与本仓既有分工一致：`codegraph/test/verify-scripts-safety.test.ts`（包内 L1）+ 那个脚本自己的收尾断言。
 *
 * ## 三条性质（[docs/agent-real-test.md](../../../docs/agent-real-test.md) 的硬约束）
 *
 * 1. **独立 `DSH_HOME`**：被测宿主的每一次 spawn 都用隔离 home——继承真实值会让插件把托管行写进
 *    用户真实配置（codegraph CG45 实测过：`~/.dsh/cordis.patch.yml` 从 427B 变 447B）；
 * 2. **临时资源带可识别前缀**：`dsh-devdata-mount-`，删除时只认自己记录下来的路径；
 * 3. **自证真实配置未变**：收尾必须有 `verifyRealPatchUnchanged(...)` 的比对（不是只声明快照）。
 *
 * 每条都带**反例**：在真实源码上做一次字符串替换，断言检查函数报出对应违规——静态守卫不许恒绿。
 */

import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const SCRIPT_PATH = new URL('../../../scripts/verify-devdata-host-mount.mjs', import.meta.url)
const SOURCE = readFileSync(SCRIPT_PATH, 'utf8')
const PREFIX = 'dsh-devdata-mount-'

/**
 * 检查一个真机脚本源码是否满足三条隔离性质（**纯函数**，喂 fixture 就能造反例）。
 *
 * @param source - 脚本源码。
 * @returns 违规描述数组（空 = 通过）。
 */
export function hostMountViolations(source) {
  const problems = []
  // ① 独立 DSH_HOME（spawn 被测宿主时必须显式覆盖）
  if (!/DSH_HOME:\s*isolatedHome/.test(source)) {
    problems.push('spawn 的 env 没有显式覆盖 DSH_HOME：会继承真实值，插件的托管行会写进用户配置')
  }
  if (!/\.\.\.process\.env/.test(source)) {
    problems.push('env 没有从 process.env 派生（那样 PATH / HOME 会缺，宿主起不来）')
  }
  // ② 临时资源带可识别前缀
  if (!source.includes(`mkdtempSync(join(tmpdir(), PREFIX))`)) {
    problems.push('临时目录没有走带前缀的 mkdtemp（前缀是删除时的唯一凭据）')
  }
  if (!new RegExp(`const PREFIX = '${PREFIX}'`).test(source)) {
    problems.push(`前缀常量不是 ${PREFIX}（改名会让「这个目录是谁的」这条线索失效）`)
  }
  if (/join\([^)]*['"]\.dsh['"]/.test(source)) {
    problems.push("出现拼接真实 home 的 '.dsh' 路径：隔离就没意义了")
  }
  // ③ 收尾自证：真实补丁逐字节比对 + 清掉自己的临时目录
  if (!/verifyRealPatchUnchanged\(patchSnapshot\)/.test(source)) {
    problems.push('收尾没有比对真实补丁：自证会退化成「只声明快照」')
  }
  if (!/finally\s*\{[\s\S]*?rmSync\(workDir, \{ recursive: true, force: true \}\)/.test(source)) {
    problems.push('临时目录没有在 finally 里清掉（失败路径会留下垃圾）')
  }
  if (!/DSH_KIT_HOME/.test(source)) {
    problems.push('没有隔离 DSH_KIT_HOME：带外授权是持久的，会落到真实的 dsh-kit/ 里')
  }
  return problems
}

describe('devdata 真机脚本：不碰用户的 ~/.dsh', () => {
  it('真实源码满足三条隔离性质', () => {
    expect(hostMountViolations(SOURCE)).toEqual([])
  })

  it('反例①：去掉 spawn 的隔离 DSH_HOME → 报出来', () => {
    const broken = SOURCE.replace('DSH_HOME: isolatedHome', '')
    expect(hostMountViolations(broken).join('\n')).toContain('没有显式覆盖 DSH_HOME')
  })

  it('反例②：换掉临时前缀 / 改成拼真实 .dsh → 都报出来', () => {
    const renamed = SOURCE.replace(`const PREFIX = '${PREFIX}'`, "const PREFIX = 'tmp-'")
    expect(hostMountViolations(renamed).join('\n')).toContain('前缀常量不是')

    const realHome = SOURCE.replace(`mkdtempSync(join(tmpdir(), PREFIX))`, "mkdtempSync(join(home, '.dsh'))")
    expect(hostMountViolations(realHome).join('\n')).toContain("'.dsh'")
  })

  it('反例③：删掉收尾自证与清理 → 都报出来', () => {
    const noProof = SOURCE.replace('const patch = verifyRealPatchUnchanged(patchSnapshot)', 'const patch = patchSnapshot')
    expect(hostMountViolations(noProof).join('\n')).toContain('收尾没有比对真实补丁')

    const noCleanup = SOURCE.replace('rmSync(workDir, { recursive: true, force: true })', 'void workDir')
    expect(hostMountViolations(noCleanup).join('\n')).toContain('没有在 finally 里清掉')
  })

  it('反例④：不隔离 DSH_KIT_HOME → 报出来（带外授权是持久的）', () => {
    const noKit = SOURCE.replace(/DSH_KIT_HOME/g, 'SOME_OTHER_HOME')
    expect(hostMountViolations(noKit).join('\n')).toContain('没有隔离 DSH_KIT_HOME')
  })
})
