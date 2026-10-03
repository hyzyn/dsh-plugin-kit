/**
 * `scripts/verify-devenv-host-mount.mjs` 的**安全与一致性守卫**（**脚本在仓根、守卫在包内**——
 * 与 devdata / codegraph 同一分工：脚本位置在根是为了进 `pnpm verify:list`，守卫留在包内是因为
 * 它只关乎本包）。
 *
 * ## 为什么用「读源码断言」而不是跑脚本
 *
 * 跑真机脚本要装 DSH、起宿主、写工作区之外的路径——进不了 CI。而它的隔离性质是**纯静态**的，
 * 源码里看得见；真正的执行验证由脚本自己在收尾断言（它跑起来时会自证「真实补丁逐字节未变」）。
 *
 * ## 四类性质
 *
 * 1. **独立 `DSH_HOME`**（[docs/agent-real-test.md](../../../docs/agent-real-test.md) 的硬约束）：
 *    被测宿主的每一次 spawn 都用隔离 home——继承真实值会让插件把托管行写进用户真实配置；
 * 2. **临时资源带可识别前缀**：`dsh-devenv-mount-`，删除时只认自己记录下来的路径；
 * 3. **自证真实配置未变**：收尾必须有 `verifyRealPatchUnchanged(...)` 的比对（不是只声明快照）；
 * 4. **脚本断言的日志前缀与工具名，必须与插件真的打的那一行 / 真的注册的那些对得上**。
 *
 * 第 4 条是**写完脚本、真跑一遍才补上的**，代价是一条假失败：脚本里那两条 `waitFor` 的正则写着
 * `\[dsh-devdata\] mounted`（方括号带转义，字符串替换漏掉了它），于是宿主**明明挂上了**却报 ✗——
 * 报告说「没挂上」，而真相是「断言在看另一个前缀」。所以这一条不是洁癖：**脚本与插件之间靠
 * 『字符串对得上』维系，那条约定必须有东西守着**。
 *
 * 每条都带**反例**：在真实源码上做一次替换，断言检查函数报出对应违规——静态守卫不许恒绿。
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const SCRIPT_SOURCE = readFileSync(new URL('../../../scripts/verify-devenv-host-mount.mjs', import.meta.url), 'utf8')
const PLUGIN_SOURCE = readFileSync(new URL('../src/plugin.ts', import.meta.url), 'utf8')
const PREFIX = 'dsh-devenv-mount-'

/**
 * 检查一个真机脚本源码是否满足隔离性质（**纯函数**，喂 fixture 就能造反例）。
 *
 * @param source - 脚本源码。
 * @returns 违规描述数组（空 = 通过）。
 */
export function hostMountViolations(source: string): string[] {
  const problems: string[] = []
  // ① 独立 DSH_HOME（spawn 被测宿主时必须显式覆盖）
  if (!/DSH_HOME:\s*isolatedHome/.test(source)) {
    problems.push('spawn 的 env 没有显式覆盖 DSH_HOME：会继承真实值，插件的托管行会写进用户配置')
  }
  if (!/\.\.\.process\.env/.test(source)) {
    problems.push('env 没有从 process.env 派生（那样 PATH / HOME 会缺，宿主起不来）')
  }
  // ② 临时资源带可识别前缀
  if (!source.includes('mkdtempSync(join(tmpdir(), PREFIX))')) {
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
  if (!/finally\s*\{[\s\S]*?removeWorkDir\(workDir\)/.test(source)) {
    problems.push('临时目录没有在 finally 里清掉（失败路径会留下垃圾）')
  }
  // ④ 带外授权的落点也要隔离：那份授权是**持久**的，写进真实 `dsh-kit/` 会污染用户环境
  if (!/DSH_KIT_HOME\s*=\s*kitHome/.test(source)) {
    problems.push('没有隔离 DSH_KIT_HOME：带外授权是持久的，会落进用户真实的 dsh-kit/')
  }
  /*
   * ⑤ 收尾必须先**等子进程退出**再删目录。
   *
   * 实测过一次（三次里一次）：收到 SIGTERM 的宿主在收尾时又写了一次
   * `dsh-home/.anonymous-user-id`，`rmSync` 于是报 `ENOTEMPTY`——脚本在收尾处崩掉、
   * 临时目录留下，而**前面所有断言都是绿的**（报告看起来像「脚本坏了」，不是「产品坏了」）。
   */
  if (!/await stopChild\(child\)/.test(source)) {
    problems.push('收尾没有等子进程退出就去删目录（会撞上 ENOTEMPTY，且临时目录会留下）')
  }
  if (!/removeWorkDir\(workDir\)/.test(source) || /else rmSync\(workDir/.test(source)) {
    problems.push('临时目录的删除没有走带重试与报错的封装：删失败会静默留下垃圾（或直接崩掉收尾）')
  }
  return problems
}

/**
 * 去掉注释。
 *
 * 必须去：脚本里有一句**历史说明**提到 `[dsh-devdata]`（解释「写死前缀会让断言变空」那条教训），
 * 而注释里的前缀不是断言。不去注释的话，这条守卫会被一句注释判红——与
 * `scripts/test/ssh-single-source.test.ts` 里 `stripComments` 同一个理由。
 */
export function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

/** 源码里出现过的日志前缀（如 `[dsh-devenv]`），**排序去重**；注释里的不算。 */
export function logPrefixesIn(source: string): string[] {
  return [...new Set([...stripComments(source).matchAll(/\[dsh-[a-z0-9-]+\]/g)].map((match) => match[0]))].sort()
}

/**
 * 脚本里**断言用**的前缀——只认转义形态 `\[dsh-…\]`。
 *
 * 为什么不能拿「源码里出现过的前缀」直接比：脚本里那几行 `check('…有 `[dsh-devenv] mounted`')`
 * 是**给人看的标签**（不带转义），把正确的前缀又写了一遍；于是「把正则改成别的插件」这种改动
 * 会被标签掩盖过去——第一版守卫就是这么假绿的（实测：改完正则，守卫仍报通过）。
 *
 * 转义形态只可能出现在**正则字面量**里，所以它精确对应「脚本真的在等哪一行日志」。
 */
export function assertedPrefixesIn(source: string): string[] {
  return [...new Set([...stripComments(source).matchAll(/\\\[dsh-[a-z0-9-]+\\\]/g)].map((match) => match[0].replaceAll('\\', '')))].sort()
}

/** 源码里 `defineTool({ … name: '…' })` 的工具名（与 `scripts/test/tool-names.test.ts` 同一抠法）。 */
export function toolNamesIn(source: string): string[] {
  const out: string[] = []
  const re = /defineTool\(\{[\s\S]{0,300}?name:\s*'([^']+)'/g
  let match: RegExpExecArray | null
  const body = stripComments(source)
  while ((match = re.exec(body)) !== null) out.push(match[1] as string)
  return out.sort()
}

/** 脚本里 `const EXPECTED_TOOLS = [...]` 声明的名字。 */
export function expectedToolsIn(source: string): string[] {
  const matched = /const EXPECTED_TOOLS = \[([^\]]*)\]/.exec(source)
  if (matched === null) return []
  return [...(matched[1] as string).matchAll(/'([^']+)'/g)].map((item) => item[1] as string).sort()
}

/**
 * 脚本与插件的一致性（**纯函数**）。
 *
 * 三个方向，各自对应一类真事故：
 *   - **脚本断言的前缀插件里没有** → 宿主明明挂上了却报「没挂上」（本例，真踩过）；
 *   - **插件打的前缀脚本里根本没提** → 改插件的人不会想到有脚本在看日志（反向漂移）；
 *   - **工具面对不上** → 报告会说「注册的恰好是 A」，而插件实际注册的是 B。
 */
export function consistencyProblems(script: string, plugin: string): string[] {
  const problems: string[] = []
  const pluginPrefixes = logPrefixesIn(plugin)
  for (const prefix of assertedPrefixesIn(script)) {
    if (!pluginPrefixes.includes(prefix)) {
      problems.push(`脚本断言的是 ${prefix}，而插件里没有这个前缀：报告会说「没挂上」，而真相是断言看错了`)
    }
  }
  for (const prefix of pluginPrefixes) {
    if (!script.includes(prefix)) {
      problems.push(`插件打的是 ${prefix}，而脚本里没有提到它：脚本不会再验到这一行`)
    }
  }
  /*
   * 只读工具与写工具是**条件注册**的（写入口只在有目标配了写闸门时出现），所以这里判的是
   * **子集**：脚本那份配置下期望出现的那批，必须是插件**有可能**注册的那批的子集。
   * 反向不成立（插件能注册 4 个，而脚本那份配置只该出现 2 个）——反向由脚本自己的
   * `FORBIDDEN_TOOLS` 断言补上（它明确要求 `env_up` / `env_down` **不出现**）。
   */
  const expected = expectedToolsIn(script)
  const actual = toolNamesIn(plugin)
  const missing = expected.filter((name) => !actual.includes(name))
  if (missing.length > 0) {
    problems.push(`脚本期望的工具面里有插件根本不会注册的名字：${missing.join('/')}（插件能注册的是 ${actual.join('/')}）`)
  }
  return problems
}

/** 在真实源码上做一次替换造反例；**替换没生效就抛**（否则反例会变成空测试）。 */
function mutate(source: string, from: string, to: string): string {
  if (!source.includes(from)) throw new Error(`fixture 替换没匹配上：${from.slice(0, 60)}`)
  const mutated = source.replace(from, to)
  expect(mutated, 'fixture 必须真的改动文本').not.toBe(source)
  return mutated
}

describe('devenv 的挂载脚本：隔离性质', () => {
  it('真实源码满足四条（含 DSH_KIT_HOME 隔离）', () => {
    expect(hostMountViolations(SCRIPT_SOURCE)).toEqual([])
  })

  it('反例①：spawn 不隔离 DSH_HOME / env 不从 process.env 派生 → 都报出来', () => {
    const noHome = hostMountViolations(mutate(SCRIPT_SOURCE, 'DSH_HOME: isolatedHome', 'DSH_HOME: process.env.DSH_HOME'))
    expect(noHome.join('\n')).toContain('没有显式覆盖 DSH_HOME')
    const noEnv = hostMountViolations(mutate(SCRIPT_SOURCE, "...process.env, DSH_HOME", "DSH_HOME"))
    expect(noEnv.join('\n')).toContain('没有从 process.env 派生')
  })

  it('反例②：换掉临时前缀 / 改成拼真实 .dsh → 都报出来', () => {
    const otherPrefix = hostMountViolations(mutate(SCRIPT_SOURCE, `const PREFIX = '${PREFIX}'`, "const PREFIX = 'tmp-'"))
    expect(otherPrefix.join('\n')).toContain('前缀常量不是')
    const realHome = hostMountViolations(mutate(SCRIPT_SOURCE, "join(repoRoot, 'packages', 'devenv')", "join(process.env.HOME, '.dsh')"))
    expect(realHome.join('\n')).toContain("拼接真实 home")
  })

  it('反例③：删掉收尾自证与清理 → 都报出来', () => {
    const noSelfCheck = hostMountViolations(mutate(SCRIPT_SOURCE, 'verifyRealPatchUnchanged(patchSnapshot)', 'true'))
    expect(noSelfCheck.join('\n')).toContain('没有比对真实补丁')
    const noClean = hostMountViolations(mutate(SCRIPT_SOURCE, 'removeWorkDir(workDir)', 'void workDir'))
    expect(noClean.join('\n')).toContain('没有在 finally 里清掉')
  })

  it('反例④：不隔离 DSH_KIT_HOME → 报出来（带外授权是持久的）', () => {
    const problems = hostMountViolations(mutate(SCRIPT_SOURCE, 'shellEnv.DSH_KIT_HOME = kitHome', 'void kitHome'))
    expect(problems.join('\n')).toContain('DSH_KIT_HOME')
  })

  it('反例⑤：不等子进程退出就删目录 / 直接 rmSync → 都报出来（真踩过：三次里一次 ENOTEMPTY）', () => {
    const noWait = hostMountViolations(mutate(SCRIPT_SOURCE, 'await stopChild(child)', 'void child'))
    expect(noWait.join('\n')).toContain('没有等子进程退出')
    const rawRm = hostMountViolations(mutate(SCRIPT_SOURCE, 'else check(\'临时目录已清理\', removeWorkDir(workDir), workDir)', 'else rmSync(workDir, { recursive: true, force: true })'))
    expect(rawRm.join('\n')).toContain('没有走带重试与报错的封装')
  })
})

describe('devenv 的挂载脚本：脚本与插件必须对得上', () => {
  it('真实源码一致（前缀同一套、工具面同一批）', () => {
    expect(logPrefixesIn(PLUGIN_SOURCE)).toEqual(['[dsh-devenv]'])
    expect(consistencyProblems(SCRIPT_SOURCE, PLUGIN_SOURCE)).toEqual([])
  })

  it('插件**可能**注册的四个：两个只读 + 两个写（写入口条件注册）', () => {
    expect(toolNamesIn(PLUGIN_SOURCE)).toEqual(['env_down', 'env_status', 'env_up', 'env_wait'])
    // 而挂载脚本那份配置（没有 writeCapability）下只该出现前两个。
    expect(expectedToolsIn(SCRIPT_SOURCE)).toEqual(['env_status', 'env_wait'])
  })

  it('反例⑤：脚本断言的日志前缀写成别的插件（**这次真踩过**）→ 报出来', () => {
    // 两条正则都要换：只换一条的话，脚本里仍留着正确的那个前缀，守卫就抓不到（第一版就是这样，红了）
    if (!SCRIPT_SOURCE.includes('\\[dsh-devenv\\]')) throw new Error('fixture 替换没匹配上')
    const stale = SCRIPT_SOURCE.replaceAll('\\[dsh-devenv\\]', '\\[dsh-devdata\\]')
    expect(stale).not.toBe(SCRIPT_SOURCE)
    const problems = consistencyProblems(stale, PLUGIN_SOURCE)
    expect(problems.join('\n')).toContain('脚本断言的是 [dsh-devdata]')
    expect(problems.join('\n')).toContain('断言看错了')
  })

  it('反例⑥：脚本期望了一个插件根本不会注册的名字 → 报出来', () => {
    const problems = consistencyProblems(mutate(SCRIPT_SOURCE, "const EXPECTED_TOOLS = ['env_status', 'env_wait']", "const EXPECTED_TOOLS = ['env_status', 'env_wait', 'env_erase']"), PLUGIN_SOURCE)
    expect(problems.join('\n')).toContain('插件根本不会注册')
  })

  it('反例⑦：插件换了前缀而脚本没跟 → 报出来（改插件的人不会想到有脚本在看日志）', () => {
    // **全部**替换：插件里有好几行日志都带这个前缀，只换一处的话前缀集合里还留着旧的那个。
    if (!PLUGIN_SOURCE.includes('[dsh-devenv]')) throw new Error('fixture 替换没匹配上')
    const renamed = PLUGIN_SOURCE.replaceAll('[dsh-devenv]', '[dsh-devenv2]')
    expect(renamed).not.toBe(PLUGIN_SOURCE)
    expect(consistencyProblems(SCRIPT_SOURCE, renamed).join('\n')).toContain('插件打的是 [dsh-devenv2]')
  })
})
