/**
 * **跨包真机脚本**的安全守卫（L0）——`scripts/` 根下不属于任何单个包的验证脚本，
 * 外加公共隔离引导 [`scripts/lib/live-harness.mjs`](../lib/live-harness.mjs)。
 *
 * 三组，判据不同是因为**它们碰宿主的方式不同**：
 *
 * | 组 | 形状 | 判据 |
 * | --- | --- | --- |
 * | `SCRIPTS` | 打**已经在跑**的外部宿主 | 自己绝不碰真实 `~/.dsh`；临时资源带前缀；写宿主配置必须能复位 |
 * | `SELF_HOSTED_SCRIPTS` | **自己 spawn** 宿主 | 必须隔离（`DSH_HOME` + `DSH_KIT_HOME`）；收尾自证；只删自己记下的目录 |
 * | `IN_PROCESS_SCRIPTS` | **进程内挂真模块**（不 spawn） | 必须在 import 插件前隔离 home；补丁比对结果必须被断言；只认 harness 的清理；不许自己 spawn 宿主 |
 *
 * ## 为什么与 `packages/codegraph/test/verify-scripts-safety.test.ts` 分家
 *
 * 那个文件守的是 codegraph 自己的 5 个 `verify-codegraph-*.mjs`（L1：包内脚本、包内教训）；
 * 这里这 4 个分别是 `mcp` / `rss` / 通用 UI 的，**要同时照顾多个包 → L0**（见
 * [docs/conventions.md § L0 / L1 的边界判据](../../docs/conventions.md#l0--l1-的边界判据)）。
 * 分工与仓库既有的「`packages/codegraph/test/defects-ledger.test.ts`（包内）+
 * `scripts/test/defects-table.test.ts`（跨包）」完全同构，不新造结构。
 *
 * ## `SCRIPTS` 那组与 codegraph 那 5 个的**关键区别**
 *
 * 它们打的是**已经跑着的外部宿主**（`--host` / `--url`），所以「隔离 DSH_HOME」这条对它们
 * **不适用**——它们既不起宿主、也不推导 home。对应的性质换成三条：
 *
 *   ① **自己绝不碰真实 `~/.dsh`**：源码里不许出现 `DSH_HOME` 赋值或 `.dsh` 字面量；
 *   ② **临时资源带可识别前缀**（`dsh-opml-` / `mcp-probe-` …）：删除时只认自己记录下来的路径；
 *   ③ **对宿主的状态变更必须能复位**：会写宿主配置的那两个，收尾必须有写回（含产物刷新）。
 *
 * 每条都带 **fixture 反例**：在真实源码上做一次字符串替换，断言检查函数**报出对应的违规**
 * ——静态守卫不许做成恒绿（本仓刚发生过「命中 0 个文件、恒绿、拦不住任何东西」的闸门）。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * 每个脚本的**形状声明**（照 [scripts/defects-table.mjs](../defects-table.mjs) 的 `LEDGER_SPECS`
 * 写法：没有的显式写 `null` / `[]`，而不是让正则碰运气）。
 *
 * - `tempPrefixes`：必须出现、且**恰好是这些**前缀的临时资源（空数组 = 本脚本不建临时资源）；
 * - `hostWrites`：`null` = 只读宿主；否则列出「收尾复位」必须有的源码标记。
 */
const SCRIPTS = [
  {
    file: 'verify-mcp-http.mjs',
    // 它自己起一个**临时端口**的 MCP 服务器（listen(0)），不建临时目录；只 POST /api/dsh-mcp/test
    tempPrefixes: [],
    hostWrites: null,
  },
  {
    file: 'verify-mcp-tools.mjs',
    // 夹具调用日志：`join(tmpdir(), \`mcp-probe-${pid}.jsonl\`)`
    tempPrefixes: ['mcp-probe-'],
    hostWrites: {
      // 它**必须**写宿主配置（保存夹具条目 → 用完清空 → 把原条目逐条写回）
      restoreMarkers: ["clearAll: true", 'restoreList', 'M4 跑完把宿主原有条目原样写回'],
    },
  },
  {
    file: 'verify-rss-opml.mjs',
    // 下载目录：`mkdtempSync(join(tmpdir(), 'dsh-opml-'))`
    tempPrefixes: ['dsh-opml-'],
    hostWrites: {
      restoreMarkers: ['const baseline = await readConfig()', 'writeConfig(baseline)', 'C1 收尾'],
    },
  },
  {
    file: 'verify-client-ui.mjs',
    // 只驱动浏览器（截图 / 报告写到调用方给的路径），既不建临时目录也不写宿主
    tempPrefixes: [],
    hostWrites: null,
  },
]

/**
 * **自起宿主**类脚本的形状声明（与上面 `SCRIPTS` 的「打外部宿主」判据不同）。
 *
 * 分家的理由：`SCRIPTS` 那 4 个打的是**已经在跑**的宿主，所以「不许出现 `DSH_HOME`」是对的；
 * 而 `verify-issue-13-14.mjs` **自己起**宿主，它**必须**设 `DSH_HOME`——不设就会写用户的真实配置
 * （这正是本仓 `verify-codegraph-agent-integration.mjs` 第一版踩过的坑）。
 * 所以这一组的判据是「**必须**隔离」而不是「不许碰」。
 */
const SELF_HOSTED_SCRIPTS = [
  {
    file: 'verify-issue-13-14.mjs',
    /**
     * 收尾自证必须有的标记。缺任何一条，这条脚本的「不污染真实配置」就退化成一句承诺
     * （`docs/agent-real-test.md` 硬约束 ① 的「必须自证」）。
     */
    selfProofMarkers: [
      'const REAL_FILES = [',
      'record(\'SELF\'',
      'fs.readFileSync(abs)',
    ],
    /** 隔离必须同时覆盖 home 与授权落点（kit D12：只隔离 home 会继承机器上已有的带外授权）。 */
    isolationMarkers: ['DSH_HOME: isoHome', 'DSH_KIT_HOME: kitHome'],
    /** 只删自己记下来的目录。 */
    cleanupMarkers: ['createdDirs.push(isoHome)', 'for (const dir of createdDirs)'],
  },
]

/**
 * **进程内**真机脚本（挂真宿主模块，不 spawn 宿主）——`verify-tier-restrict.mjs`（档位契约）与
 * `verify-mcp-on-demand.mjs`（工具面按需加载）。
 *
 * 为什么单列一组：它们既不像 `SCRIPTS` 那样「打外部宿主所以不该推导 home」（它们**必须**隔离），
 * 也不像 `SELF_HOSTED_SCRIPTS` 那样 spawn 宿主（所以没有 `DSH_KIT_HOME` 那类环境变量要覆盖）。
 * 判据只剩三条硬的：**隔离在 import 插件之前**、**补丁比对被真的断言**、**只删 harness 给的目录**；
 * 外加一条反向的：**不许自己起宿主**（串了就变成「真机里再起真机」，慢一倍还多一处要收）。
 *
 * 这一组的必要性与 `SELF_HOSTED` 同源：进程内挂 `apply()` 一样会落盘（`codegraph` 第一版就写进了
 * 真实 `~/.dsh/cordis.patch.yml`），而它没有 spawn 这个显眼动作，更容易被当成「只是跑了个函数」。
 *
 * 两个脚本的判据**故意完全相同**：它们碰宿主的方式一样（进程内挂真插件 + 隔离 home），
 * 只是验的功能不同——判据跟着「怎么碰宿主」走，不跟着功能走（按功能分叉就会给下一个脚本留口子）。
 */
const IN_PROCESS_SCRIPTS = [
  {
    file: 'verify-tier-restrict.mjs',
    /** 不许出现的 spawn 形态（真机分层：这一组只在进程内挂模块）。 */
    forbidSpawn: ["execFileSync('dsh'", 'spawn(\'dsh\'', 'spawnSync(\'dsh\''],
  },
  {
    file: 'verify-mcp-on-demand.mjs',
    /** 同上：它自己拉的是 MCP **探针服务器**子进程（由 `dsh-mcp-client` 管），不是 DSH 宿主。 */
    forbidSpawn: ["execFileSync('dsh'", 'spawn(\'dsh\'', 'spawnSync(\'dsh\''],
  },
]

/**
 * 进程内脚本的检查（**纯函数**，喂 fixture 就能造反例）。
 *
 * @param source - 脚本源码。
 * @param spec - `IN_PROCESS_SCRIPTS` 里的一项。
 * @returns 违规描述数组（空 = 通过）。
 */
export function inProcessViolationsOf(source, spec) {
  const problems = []
  // ① 隔离必须在 import 插件**之前**：`dshHome()` 读 `process.env`，而 `apply()` 就会落盘。
  if (!/process\.env\.DSH_HOME\s*=\s*isolatedHome/.test(source)) {
    problems.push('没有把 DSH_HOME 指向隔离 home：进程内挂真插件时 apply() 会写进真实 ~/.dsh')
  }
  // ② 一次性目录必须带可识别前缀（与另两组同一条规矩）。
  if (!/createLiveHarness\(\{\s*prefix:\s*'[a-z][a-z0-9-]*-'\s*\}\)/.test(source)) {
    problems.push("没有用带可识别前缀的 createLiveHarness：临时目录失去「是谁的」这条线索")
  }
  // ③ 真实补丁的比对结果必须**被断言**：只声明快照比不比对更糟（indexforce 的实测教训）。
  // `[^)\n]` 而不是 `[^)]`：后者会跨行匹配到下一行的 `realPatchCheck.unchanged`（三元式的分支），
  // 于是「把 record 里的比对结果换成 true」这个反例仍然命中——第一次就是这么假绿的。
  if (!/record\([^)\n]*realPatchCheck\.unchanged/.test(source)) {
    problems.push('verifyRealPatchUnchanged 的结果没有被断言（只声明快照等于不证明隔离）')
  }
  // ④ 清理只能走 harness 交给它的那个目录。
  if (!/harness\.cleanup\(\)/.test(source)) {
    problems.push('收尾没有调用 harness.cleanup()：临时资源会留在机器上')
  }
  // ⑤ 反向：这一组不许自己起宿主（那是 SELF_HOSTED 的活）。
  for (const marker of spec.forbidSpawn ?? []) {
    if (source.includes(marker)) problems.push(`进程内脚本不该自己 spawn 宿主：${marker}`)
  }
  return problems
}

/**
 * 自起宿主脚本的检查（**纯函数**）。
 *
 * @param source - 脚本源码。
 * @param spec - `SELF_HOSTED_SCRIPTS` 里的一项。
 * @returns 违规描述数组（空 = 通过）。
 */
export function selfHostedViolationsOf(source, spec) {
  const problems = []
  for (const marker of spec.isolationMarkers) {
    if (!source.includes(marker)) problems.push(`隔离缺一项：${marker}（漏 DSH_KIT_HOME 会继承机器上已有的带外授权）`)
  }
  for (const marker of spec.selfProofMarkers) {
    if (!source.includes(marker)) problems.push(`缺少收尾自证：${marker}`)
  }
  for (const marker of spec.cleanupMarkers) {
    if (!source.includes(marker)) problems.push(`清理没有只认自己记下的路径：${marker}`)
  }
  /*
   * 隔离目录的前缀必须可识别（与 SCRIPTS 同一条规矩），但**只针对新建的那个**：
   * 脚本里还会出现 `path.join(os.homedir(), '.dsh')`——那是**读**真实 home 用来做收尾自证，
   * 本来就该是 `.dsh`。第一版把两者一起判，于是正确的代码被判红（判据要测对对象）。
   * 判法：只检查**带模板占位 / 变量后缀**的那些（即真正在造新目录的）。
   */
  for (const match of source.matchAll(/join\(\s*os\.homedir\(\)\s*,\s*(['"`])([^'"`]+)\1/g)) {
    const literal = match[2]
    // 纯字面量（如 `.dsh`）= 指向真实 home 的常量，不是新建的隔离目录
    if (!literal.includes('${') && !literal.includes('$')) continue
    if (!/^\.[a-z][a-z0-9-]*-/.test(literal)) {
      problems.push(`隔离目录前缀不可识别（没有「是谁的」这条线索）：${literal}`)
    }
  }
  return problems
}

/**
 * 真机脚本的通用检查（**纯函数**，喂 fixture 就能造反例）。
 *
 * @param source - 脚本源码。
 * @param spec - `SCRIPTS` 里的一项。
 * @returns 违规描述数组（空 = 通过）。
 */
export function violationsOf(source, spec) {
  const problems = []

  // ① 自己绝不碰真实 ~/.dsh（打外部宿主的脚本没有隔离 home 的语义，只能不碰）
  if (/DSH_HOME\s*[:=]/.test(source)) {
    problems.push('出现 DSH_HOME 赋值/传参：这 4 个脚本打的是外部宿主，不该自己推导 home')
  }
  if (/['"`]\.dsh['"`]/.test(source)) {
    problems.push("出现 '.dsh' 字面量：不该拼真实 home 路径")
  }

  // ② 临时资源带可识别前缀（`join(tmpdir(), '<prefix>…')` 的每一处）
  for (const match of source.matchAll(/join\(\s*tmpdir\(\)\s*,\s*(['"`])([^'"`]+)\1/g)) {
    if (!/^[a-z][a-z0-9-]*-/.test(match[2])) {
      problems.push(`临时资源前缀不可识别（没有「是谁的」这条线索）：${match[2]}`)
    }
  }
  for (const prefix of spec.tempPrefixes) {
    if (!source.includes(`tmpdir(), '${prefix}'`) && !source.includes(`tmpdir(), \`${prefix}`)) {
      problems.push(`缺少带前缀 ${prefix} 的临时资源（前缀是删除时的唯一凭据）`)
    }
  }

  // ③ 对宿主的状态变更必须能复位
  if (spec.hostWrites === null) {
    if (/\/servers\/save|\/api\/dsh-rss\/config['"`]\s*,\s*\{|writeConfig\(/.test(source)) {
      problems.push('声明为「只读宿主」，源码里却出现了写宿主配置的调用')
    }
  } else {
    for (const marker of spec.hostWrites.restoreMarkers) {
      if (!source.includes(marker)) problems.push(`缺少收尾复位的证据：${marker}`)
    }
  }
  return problems
}

/**
 * 公共隔离引导的形状检查（**纯函数**，同样可造反例）。
 *
 * 它守的是 codegraph 那 5 个脚本**委托出去**的那三条性质——抽取不能成为「把隔离抽没了」：
 * 隔离 home 的显式覆盖、profile 的先清空再拷、真实补丁的逐字节比对。
 */
export function harnessViolations(source) {
  const problems = []
  if (!/hostEnv\(extra\)\s*\{[\s\S]*?DSH_HOME:\s*isolatedHome/.test(source)) {
    problems.push('hostEnv 没有显式覆盖 DSH_HOME：spawn 被测宿主时会继承真实值（CG45）')
  }
  if (!/syncProfile\(\)\s*\{[\s\S]*?rmSync\(profileDir[\s\S]*?cpSync\(/.test(source)) {
    problems.push('syncProfile 没有「先清空目标再拷」：CG48 的 cpSync 崩溃会回来')
  }
  if (!/unchanged:\s*after === snapshot\.before/.test(source)) {
    problems.push('verifyRealPatchUnchanged 没有真的比对前后：自证会退化成只声明快照')
  }
  if (!/mkdtempSync\(join\(tmpdir\(\), prefix\)\)/.test(source)) {
    problems.push('临时目录没有用调用方给的前缀：临时资源失去可识别性')
  }
  return problems
}

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8')
/** 在真实源码上做一次替换造反例；**替换没生效就抛**（否则反例会变成空测试）。 */
const mutate = (source, from, to) => {
  if (!source.includes(from)) throw new Error(`fixture 替换没匹配上：${from.slice(0, 60)}`)
  const mutated = source.replace(from, to)
  expect(mutated, 'fixture 必须真的改动文本').not.toBe(source)
  return mutated
}

/**
 * 同 `mutate`，但**替换全部出现**。
 *
 * 为什么需要它：`String.replace` 只换第一处。删「写回」这种反例时，标记往往出现多次
 * （声明 + 使用 + 日志），只换第一处会让 fixture 仍留着标记、反例变成空测试——第一版
 * 就是这么假绿了一次（换取一处 `restoreList` 后，检查函数仍然通过）。
 */
const mutateAll = (source, from, to) => {
  if (!source.includes(from)) throw new Error(`fixture 替换没匹配上：${from.slice(0, 60)}`)
  const mutated = source.replaceAll(from, to)
  expect(mutated, 'fixture 必须真的改动文本').not.toBe(source)
  return mutated
}

describe('跨包真机脚本：形状现算（真实仓库必须零违规）', () => {
  for (const spec of SCRIPTS) {
    it(`${spec.file}：不碰真实 ~/.dsh + 临时资源带前缀 + 宿主写操作可复位`, () => {
      const source = read(`../${spec.file}`)
      expect(violationsOf(source, spec).join('\n')).toBe('')
    })
  }

  it('公共隔离引导 live-harness.mjs：隔离 home / 先清空再拷 / 真的比对补丁 / 前缀由调用方给', () => {
    expect(harnessViolations(read('../lib/live-harness.mjs')).join('\n')).toBe('')
  })

  for (const spec of SELF_HOSTED_SCRIPTS) {
    it(`${spec.file}（自起宿主）：隔离 home + 授权落点 + 收尾自证 + 只删自己记下的目录`, () => {
      const source = read(`../${spec.file}`)
      expect(selfHostedViolationsOf(source, spec).join('\n')).toBe('')
    })
  }

  for (const spec of IN_PROCESS_SCRIPTS) {
    it(`${spec.file}（进程内）：先隔离再挂 + 补丁比对被断言 + 只删 harness 的目录 + 不起宿主`, () => {
      const source = read(`../${spec.file}`)
      expect(inProcessViolationsOf(source, spec).join('\n')).toBe('')
    })
  }
})

describe('反例 1：碰了真实 home → 必须报出来', () => {
  it('往跨包脚本里塞一句 DSH_HOME 赋值 → 报', () => {
    const spec = SCRIPTS[0]
    const fixture = mutate(read(`../${spec.file}`), 'const argv = process.argv.slice(2)', "process.env.DSH_HOME = '/tmp/x'\nconst argv = process.argv.slice(2)")
    expect(violationsOf(fixture, spec).join('\n')).toContain('不该自己推导 home')
  })

  it('拼真实 home 路径（`.dsh`）→ 报', () => {
    const spec = SCRIPTS[0]
    const fixture = mutate(read(`../${spec.file}`), 'const argv = process.argv.slice(2)', "const realHome = join(homedir(), '.dsh')\nconst argv = process.argv.slice(2)")
    expect(violationsOf(fixture, spec).join('\n')).toContain("'.dsh' 字面量")
  })
})

describe('反例 2：临时资源失去可识别前缀 → 必须报出来', () => {
  it('把 rss 的 dsh-opml- 前缀换成裸 mkdtemp（后缀无前缀）→ 报', () => {
    const spec = SCRIPTS.find((item) => item.file === 'verify-rss-opml.mjs')
    const fixture = mutate(read(`../${spec.file}`), "mkdtempSync(join(tmpdir(), 'dsh-opml-'))", "mkdtempSync(join(tmpdir(), 'x'))")
    const problems = violationsOf(fixture, spec).join('\n')
    expect(problems).toContain('缺少带前缀 dsh-opml-')
    expect(problems).toContain('临时资源前缀不可识别')
  })

  it('把 mcp-tools 的夹具日志前缀去掉 → 报', () => {
    const spec = SCRIPTS.find((item) => item.file === 'verify-mcp-tools.mjs')
    const fixture = mutate(read(`../${spec.file}`), 'mcp-probe-${String(process.pid)}', 'probe-${String(process.pid)}')
    expect(violationsOf(fixture, spec).join('\n')).toContain('缺少带前缀 mcp-probe-')
  })
})

describe('反例 3：宿主写操作不可复位（或只读脚本偷偷写）→ 必须报出来', () => {
  it('删掉 mcp-tools 的写回调用 → 报', () => {
    const spec = SCRIPTS.find((item) => item.file === 'verify-mcp-tools.mjs')
    // 换个**不含原标记**的名字：`restoreList` → `restoreListRenamed` 里仍然含有子串
    // `restoreList`，检查函数会照样通过（第一次就是这么假绿的）
    const fixture = mutateAll(read(`../${spec.file}`), 'restoreList', 'savedEntriesBeforeRun')
    expect(violationsOf(fixture, spec).join('\n')).toContain('缺少收尾复位的证据：restoreList')
  })

  it('删掉 rss 的基线写回 → 报', () => {
    const spec = SCRIPTS.find((item) => item.file === 'verify-rss-opml.mjs')
    const fixture = mutate(read(`../${spec.file}`), 'writeConfig(baseline)', 'writeConfig(baselineRenamed)')
    expect(violationsOf(fixture, spec).join('\n')).toContain('缺少收尾复位的证据：writeConfig(baseline)')
  })

  it('给「只读」的通用 UI 脚本塞一个写宿主配置的调用 → 报', () => {
    const spec = SCRIPTS.find((item) => item.file === 'verify-client-ui.mjs')
    const fixture = mutate(read(`../${spec.file}`), "import { Chrome } from './chrome-cdp.mjs'", "import { Chrome } from './chrome-cdp.mjs'\n// fixture：假装它开始写宿主\nconst save = () => fetch('/api/dsh-mcp/servers/save', { method: 'POST' })")
    expect(violationsOf(fixture, spec).join('\n')).toContain('却出现了写宿主配置的调用')
  })
})

describe('反例 4：把隔离抽没了 → harness 检查必须报出来', () => {
  const real = read('../lib/live-harness.mjs')

  it('hostEnv 不再覆盖 DSH_HOME（隔离失效）→ 报', () => {
    const fixture = mutate(real, 'DSH_HOME: isolatedHome', 'DSH_HOME: process.env.DSH_HOME')
    expect(harnessViolations(fixture).join('\n')).toContain('没有显式覆盖 DSH_HOME')
  })

  it('syncProfile 不再先清空目标（CG48 会回来）→ 报', () => {
    const fixture = mutate(real, 'rmSync(profileDir, { recursive: true, force: true })', 'void 0')
    expect(harnessViolations(fixture).join('\n')).toContain('先清空目标再拷')
  })

  it('补丁比对退化（只声明快照）→ 报', () => {
    const fixture = mutate(real, 'unchanged: after === snapshot.before', 'unchanged: true')
    expect(harnessViolations(fixture).join('\n')).toContain('没有真的比对前后')
  })

  it('临时目录不用调用方给的前缀 → 报', () => {
    const fixture = mutate(real, 'mkdtempSync(join(tmpdir(), prefix))', "mkdtempSync(join(tmpdir(), 'tmp-'))")
    expect(harnessViolations(fixture).join('\n')).toContain('没有用调用方给的前缀')
  })
})

describe('反例 5：自起宿主脚本把隔离抽掉 → 必须报出来', () => {
  const real = read('../verify-issue-13-14.mjs')
  const spec = SELF_HOSTED_SCRIPTS[0]

  it('漏掉 DSH_KIT_HOME（会继承机器上已有的带外授权）→ 报', () => {
    const fixture = mutate(real, 'DSH_KIT_HOME: kitHome, ', '')
    expect(selfHostedViolationsOf(fixture, spec).join('\n')).toContain('隔离缺一项')
  })

  it('删掉收尾自证（不污染真实配置退化成承诺）→ 报', () => {
    const fixture = mutate(real, "record('SELF'", "record('SKIPPED'")
    expect(selfHostedViolationsOf(fixture, spec).join('\n')).toContain('缺少收尾自证')
  })

  it('清理改成按前缀扫（会删别人的目录）→ 报', () => {
    const fixture = mutate(real, 'createdDirs.push(isoHome)', 'void 0')
    expect(selfHostedViolationsOf(fixture, spec).join('\n')).toContain('清理没有只认自己记下的路径')
  })

  it('隔离目录前缀失去「是谁的」线索 → 报', () => {
    const fixture = mutate(real, '`.dsh-verify-${pid}`', '`${pid}`')
    expect(selfHostedViolationsOf(fixture, spec).join('\n')).toContain('隔离目录前缀不可识别')
  })
})

describe('反例 6：进程内脚本把隔离 / 自证抽掉 → 必须报出来', () => {
  const real = read('../verify-tier-restrict.mjs')
  const spec = IN_PROCESS_SCRIPTS[0]

  it('不设隔离 DSH_HOME（真机里 apply() 会写真实 ~/.dsh）→ 报', () => {
    const fixture = mutate(real, 'process.env.DSH_HOME = isolatedHome', 'void 0')
    expect(inProcessViolationsOf(fixture, spec).join('\n')).toContain('没有把 DSH_HOME 指向隔离 home')
  })

  it('临时目录前缀不可识别 → 报', () => {
    const fixture = mutate(real, "createLiveHarness({ prefix: 'tier-restrict-' })", "createLiveHarness({ prefix: 'x' })")
    expect(inProcessViolationsOf(fixture, spec).join('\n')).toContain('带可识别前缀')
  })

  it('补丁比对退化（结果不再被断言）→ 报', () => {
    const fixture = mutate(real, 'realPatchCheck.unchanged,', 'true,')
    expect(inProcessViolationsOf(fixture, spec).join('\n')).toContain('没有被断言')
  })

  it('忘了 harness.cleanup() → 报', () => {
    const fixture = mutate(real, 'harness.cleanup()', 'void 0')
    expect(inProcessViolationsOf(fixture, spec).join('\n')).toContain('没有调用 harness.cleanup()')
  })

  it('进程内脚本偷偷 spawn 宿主 → 报', () => {
    const fixture = mutate(real, "const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')",
      "const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')\nconst child = spawn('dsh', ['web'])")
    expect(inProcessViolationsOf(fixture, spec).join('\n')).toContain('不该自己 spawn 宿主')
  })
})

describe('反例 6b：按需加载脚本把隔离 / 自证抽掉 → 必须报出来', () => {
  /*
   * 与反例 6 同形，但对象换成 `verify-mcp-on-demand.mjs`：判据是**同一个纯函数**，
   * 所以这里证明的是「新登记的那一条真的接在同一条判据上」，而不是另写了一套更松的检查。
   */
  const real = read('../verify-mcp-on-demand.mjs')
  const spec = IN_PROCESS_SCRIPTS[1]

  it('不设隔离 DSH_HOME（真机里 apply() 会写真实 ~/.dsh）→ 报', () => {
    const fixture = mutate(real, 'process.env.DSH_HOME = isolatedHome', 'void 0')
    expect(inProcessViolationsOf(fixture, spec).join('\n')).toContain('没有把 DSH_HOME 指向隔离 home')
  })

  it('补丁比对退化（结果不再被断言）→ 报', () => {
    const fixture = mutate(real, 'realPatchCheck.unchanged,', 'true,')
    expect(inProcessViolationsOf(fixture, spec).join('\n')).toContain('没有被断言')
  })

  it('忘了 harness.cleanup() → 报', () => {
    const fixture = mutate(real, 'harness.cleanup()', 'void 0')
    expect(inProcessViolationsOf(fixture, spec).join('\n')).toContain('没有调用 harness.cleanup()')
  })
})
