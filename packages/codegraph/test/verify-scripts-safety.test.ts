import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

/*
 * 真机脚本的**安全守卫**（L1：codegraph 的五个 `scripts/verify-codegraph-*.mjs`）：
 * 它们不许污染用户真实的 ~/.dsh。
 *
 * 实测过的 bug（CG45）：两个 verify 脚本起被测宿主时继承真实 DSH_HOME，而插件会按
 * dshHome() 把 codegraph 托管行写进 $DSH_HOME/cordis.patch.yml——指向的却是脚本的
 * **临时项目目录**。脚本结束即 rmSync 那个目录，于是用户真实配置里留下一行指向不存在
 * 路径的托管行。这不是「可能」，是实测：去掉隔离后跑一次，~/.dsh/cordis.patch.yml
 * 从 427B 变 447B、cwd 被写成 /var/folders/.../cg-host-contract-xxx/project。
 *
 * 为什么用「读源码断言」而不是跑脚本：跑真机脚本要装 DSH、起宿主、写工作区外路径，
 * 进不了 CI；而这两条性质（传隔离 DSH_HOME、断言真实文件未变）是纯静态的，源码里
 * 看得见。真正的执行验证由脚本自身的收尾断言完成（它跑起来时会自证）。
 *
 * **2026-09-30 隔离引导抽取后的两处变化**（迁移说明）：
 *   1. 隔离正文（临时目录 / 隔离 home / profile 播种 / 补丁比对 / 运行时同源解析）现在只有
 *      一份，住在 [`scripts/lib/live-harness.mjs`](../../../scripts/lib/live-harness.mjs)；
 *      于是这里的断言从「源码里有没有 mkdtemp / cpSync」改成「有没有调用 harness 的对应能力」，
 *      而 **harness 自身的性质由 L0 的 `scripts/test/live-scripts-safety.test.ts` 钉住**（跨包 → L0；
 *      与「defects-ledger.test.ts 管包内 + defects-table.test.ts 管跨包」同一分工）。
 *   2. indexforce 原先**声明了 `realPatchBefore` 却从未比对**（旧断言 `toContain('realPatchBefore')`
 *      命中的是声明、`/未被改动|逐字节/` 命中的是文件头一句注释），本轮把比对补上并改钉
 *      「真的调用了 `verifyRealPatchUnchanged(harness.patch)`」——静态守卫不该能被注释满足。
 */
const HARNESS_URL = new URL('../../../scripts/lib/live-harness.mjs', import.meta.url)
const HARNESS = readFileSync(HARNESS_URL, 'utf8')
/** 读一个真机脚本的源码。 */
const src = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8')

describe('P0：agent-scope 机制脚本不得碰用户配置与真实仓库', () => {
  const scopeSrc = src('../../../scripts/verify-codegraph-agent-scope.mjs')

  it('只在自己的临时目录里造项目（前缀可识别，不在真实仓库上跑 codegraph init）', () => {
    expect(scopeSrc, '临时目录要走公共引导并带上本脚本原有的前缀').toContain("createTempWorkDir('dsh-cg-agent-scope-')")
    expect(scopeSrc, '不该出现 codegraph init（会在真实仓库上建索引）').not.toMatch(/['"]init['"]/)
    expect(scopeSrc, '不该硬编码用户机器上的真实仓库路径').not.toMatch(/\/Users\//)
  })

  it('不写 DSH_HOME（它不启动宿主，也不该碰 ~/.dsh）', () => {
    // 与另几个脚本不同：本脚本建的是**最小 Cordis 根**，没有 DSH_HOME 语义。
    // 一旦它开始写 DSH_HOME，就说明有人把它改成「起真宿主」了——那属于 host-contract 的职责。
    expect(scopeSrc).not.toMatch(/DSH_HOME\s*[:=]/)
    expect(scopeSrc).not.toContain('cordis.patch.yml')
  })

  it('收尾回收自己拉起的 MCP 子进程（不让临时项目的进程变成孤儿）', () => {
    expect(scopeSrc, '缺少兜底 SIGTERM').toContain("'SIGTERM'")
    expect(scopeSrc, '缺少临时目录清理').toContain('cleanup()')
  })

  it('从 dsh-mcp-client 所在层解析其余运行时包（保证只加载一份 dsh-scope）', () => {
    // kScope 是模块内局部 Symbol：第二份 dsh-scope 副本会让 scopeOf() 全返回
    // undefined，隔离静默失效。这条断言守住「同源解析」这个前提。
    expect(scopeSrc).toContain('resolveRuntimeLoader(repoRoot)')
    expect(HARNESS, 'harness 应实现同源解析').toContain('mcpClientPath')
    expect(HARNESS, '应基于 mcp-client 的路径上溯解析').toMatch(/runtimeScopeDir/)
  })
})

describe('P0：agent-integration 集成脚本必须隔离 DSH_HOME（它会挂真插件）', () => {
  const integrationSrc = src('../../../scripts/verify-codegraph-agent-integration.mjs')

  it('挂真插件前就把 DSH_HOME 指向隔离目录', () => {
    // 这个脚本与 agent-scope 的关键区别：它挂的是**真插件**，所以 apply() 会去写
    // $DSH_HOME/cordis.patch.yml。第一版没设隔离，插件当场去写真实 ~/.dsh（被沙箱
    // EPERM 拦下才发现）——所以这条断言必须钉住「隔离赋值发生在 import 插件之前」。
    expect(integrationSrc).toContain('process.env.DSH_HOME = isolatedHome')
    const assignAt = integrationSrc.indexOf('process.env.DSH_HOME = isolatedHome')
    const importAt = integrationSrc.indexOf("import(pathToFileURL(join(repoRoot, 'packages', 'codegraph', 'lib', 'index.js'))")
    expect(assignAt, '找不到隔离赋值').toBeGreaterThan(-1)
    expect(importAt, '找不到插件 import').toBeGreaterThan(-1)
    expect(assignAt, 'DSH_HOME 必须在 import 插件之前设置').toBeLessThan(importAt)
    // 隔离 home 来自公共引导（前缀保持原样），不是脚本自己 mkdtemp
    expect(integrationSrc).toContain("createLiveHarness({ prefix: 'cg-agent-integration-' })")
  })

  it('收尾**真的比对**真实补丁未变（不是只声明快照）', () => {
    expect(integrationSrc, '必须调用 harness 的比对结果').toMatch(/verifyRealPatchUnchanged\(harness\.patch\)/)
    expect(integrationSrc).toMatch(/未被改动|逐字节/)
    // per-agent 模式下插件只撤销、不新建托管行——断言方向不能写反
    expect(integrationSrc).toContain('mcp-codegraph-managed')
  })

  it('只在自己的临时目录里造项目，且从 mcp-client 同层解析运行时包', () => {
    expect(integrationSrc, '不该出现 codegraph init').not.toMatch(/['"]init['"]/)
    expect(integrationSrc, '不该硬编码用户机器上的真实仓库路径').not.toMatch(/\/Users\//)
    expect(integrationSrc).toMatch(/resolveRuntimeLoader\(repoRoot\)/)
  })

  it('收尾回收自己拉起的 MCP 子进程（并排除 CLI 自带的常驻 daemon）', () => {
    expect(integrationSrc, '缺少兜底 SIGTERM').toContain("'SIGTERM'")
    expect(integrationSrc, '缺少临时目录清理').toContain('harness.cleanup()')
    // CG46：同一 cwd 下有两个 pid，必须按 daemon.pid 排除，否则断言会把上游的正常
    // 行为误判成「泄漏」
    expect(integrationSrc, '应按 daemon.pid 排除 CLI 常驻 daemon').toContain('daemon.pid')
  })
})

describe('per-agent 检查器：对**正在跑的宿主**，必须只读', () => {
  const src2 = readFileSync(new URL('../../../scripts/check-codegraph-per-agent.mjs', import.meta.url), 'utf8')

  it('不写任何文件、不发任何写请求', () => {
    // 它对着用户正在用的实例跑，只许读：写配置会改用户状态，而它的职责只是「看」
    expect(src2, '不该写文件').not.toMatch(/writeFileSync|appendFileSync|mkdirSync|rmSync/)
    expect(src2, '不该发写请求').not.toMatch(/method:\s*['"]POST['"]|method:\s*['"]PUT['"]|method:\s*['"]DELETE['"]/)
    expect(src2, '只应 GET 插件路由').toContain('fetch(')
  })

  it('DSH_HOME 若已设置，它就是 ~/.dsh（多拼一层会静默 SKIP 掉互斥检查）', () => {
    // 本脚本第一版写成 join(DSH_HOME ?? homedir(), '.dsh', ...)，在 DSH_HOME=~/.dsh 时
    // 得到 ~/.dsh/.dsh/cordis.patch.yml → 文件不存在 → 整条互斥检查被 SKIP 成「通过」
    //
    // 断言只匹配**代码形态**（join(process.env.DSH_HOME…）：第一版写成宽松的
    // `DSH_HOME[\s\S]{0,40}'\.dsh'`，结果被上面这段**记录踩坑的注释本身**命中而假红
    // ——这个仓库里同一个坑踩过好几次（注释里引用了被禁的写法）。
    expect(src2, '不该在 DSH_HOME 后再拼 .dsh').not.toMatch(/join\(process\.env\.DSH_HOME/)
    expect(src2).toContain("join(dshHome, 'cordis.patch.yml')")
  })

  it('进程层用「宿主直接子进程」而不是全局按名匹配（CG46：daemon 会数出双倍）', () => {
    expect(src2).toContain("'-P'")
    expect(src2, '应注释说明为什么').toMatch(/daemon/)
  })
})

describe('CG49：真浏览器 UI 脚本（自起隔离宿主 + 真 Chrome）', () => {
  const uiSrc = src('../../../scripts/verify-codegraph-client-ui.mjs')

  it('隔离 DSH_HOME，且拷 profile 前先清空目标（CG48 的教训）', () => {
    expect(uiSrc, 'spawn 必须用 harness 的隔离 env').toContain('harness.hostEnv()')
    expect(uiSrc).toContain('harness.syncProfile()')
    // 目标先 rm 再拷：往已存在的目标上拷会让残留符号链接指回源树、cpSync 直接崩（CG48）
    // —— 这段语义现在在 harness 里，一处管五个脚本
    expect(HARNESS, '拷 profile 前应先清空目标').toMatch(/rmSync\(profileDir[\s\S]*?cpSync\(/)
  })

  it('收尾断言真实补丁未变，并回收自己起的宿主', () => {
    expect(uiSrc).toMatch(/verifyRealPatchUnchanged\(harness\.patch\)/)
    expect(uiSrc).toMatch(/未被改动|逐字节/)
    expect(uiSrc, '缺少兜底 SIGKILL').toContain("'SIGKILL'")
  })

  it('受限环境要显式传 --no-sandbox（否则 CDP 只会报「超时」，指不到真因）', () => {
    expect(uiSrc).toContain("'--no-sandbox'")
    expect(uiSrc, '应透传给通用 UI 验证器').toContain("'--chrome-arg'")
  })

  it('用**真有索引**的项目（假索引会让 /status 按设计 500，UI8 假红）', () => {
    // 第一版用「临时目录 + 空 codegraph.db」凑数，于是 status 500、控制台记一条错误、
    // UI8 判「本次新增错误 1」而红——看起来像插件 bug，其实是夹具的
    expect(uiSrc).toContain("existsSync(join(projectDir, '.codegraph'))")
  })
})

describe('CG45：两个起真宿主的脚本必须走 harness 的隔离 env，并自证真实配置未变', () => {
  const SCRIPTS = [
    ['verify-codegraph-host-contract.mjs', 'cg-host-contract-'],
    ['verify-codegraph-indexforce.mjs', 'cg-force-'],
  ]

  for (const [file, prefix] of SCRIPTS) {
    const scriptSrc = src(`../../../scripts/${file}`)

    it(`${file}：spawn 被测宿主时经 harness 显式传入隔离的 DSH_HOME`, () => {
      // spawn 的 env 必须覆盖 DSH_HOME（否则继承真实值 → 写真实补丁）；
      // 覆盖逻辑本身在 harness 的 hostEnv 里，所以两处都要钉
      expect(scriptSrc, 'spawn 未走 harness.hostEnv()').toMatch(/env:\s*harness\.hostEnv\(/)
      expect(HARNESS, 'harness.hostEnv 必须显式覆盖 DSH_HOME').toMatch(/DSH_HOME:\s*isolatedHome/)
    })

    it(`${file}：把被测 profile 拷进隔离目录（而不是让 DSH 写真实 profiles）`, () => {
      // 为什么是拷贝而不是软链：软链下 DSH 仍会往 ~/.dsh/profiles/<p>/cordis.yml 写，
      // 实测在只读沙箱里直接 EPERM；整份拷贝几十 KB，既彻底又不受权限影响。
      expect(scriptSrc).toContain('harness.syncProfile()')
      expect(scriptSrc, '临时目录前缀必须保持本脚本原有的那个').toContain(`prefix: '${prefix}'`)
      expect(HARNESS).toMatch(/cpSync\(join\(home, 'profiles', profile\)/)
    })

    it(`${file}：收尾断言真实补丁逐字节未变（把承诺变成检查）`, () => {
      expect(scriptSrc).toMatch(/verifyRealPatchUnchanged\(harness\.patch\)/)
      expect(scriptSrc, '缺少「未改动」自证').toMatch(/未被改动|逐字节/)
      expect(HARNESS, 'harness 必须真的比对前后').toMatch(/unchanged:\s*after === snapshot\.before/)
      expect(scriptSrc, '缺少临时目录清理').toContain('harness.cleanup()')
    })
  }
})
