/**
 * 仓库级真机脚本的安全守卫：`scripts/live-host-smoke.mjs`。
 *
 * ## 为什么用「读源码断言」而不是跑它
 *
 * 跑它要有真 DSH、要起宿主、会写 `~/.dsh/profiles`——进不了 CI。而它必须守住的那几条
 * 性质是**静态可见**的（只建/只删自己的一次性 profile、拒绝覆盖、两个实例各一份拷贝、
 * 刻意不隔离 DSH_HOME）。真正的执行验证由脚本自身跑起来时完成；这里守的是「别在后续
 * 重构里把它改坏」。
 *
 * 与 `packages/codegraph/test/verify-scripts-safety.test.ts` 同一个思路：真机脚本的最大
 * 风险不是「验不出来」，而是**污染用户的真实环境**（CG45 实测过：一个脚本把托管行写进了
 * 用户真实的 `~/.dsh/cordis.patch.yml`，指向随后被删掉的临时目录）。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../../scripts/live-host-smoke.mjs', import.meta.url), 'utf8')
const bootstrapSource = readFileSync(new URL('../../scripts/live-profile.mjs', import.meta.url), 'utf8')
const ci = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8')
const release = readFileSync(new URL('../../.github/workflows/release.yml', import.meta.url), 'utf8')

describe('live-host-smoke：绝不动用户既有 profile', () => {
  it('一次性 profile 名带 live-smoke- 前缀 + pid（不可能撞上用户的名字）', () => {
    expect(source).toMatch(/const profileName = `live-smoke-\$\{String\(process\.pid\)\}`/)
    expect(source).toMatch(/const name = `\$\{profileName\}-\$\{suffix\}`/)
  })

  it('拒绝覆盖已存在的 profile（宁可失败也不吞掉别人的目录）', () => {
    expect(source).toMatch(/if \(fs\.existsSync\(to\)\) throw new Error/)
  })

  it('删除只作用于自己创建的那几份（列表来自 makeProfile，不是按前缀扫目录）', () => {
    expect(source).toContain('const profileDirs = []')
    expect(source).toMatch(/profileDirs\.push\(dir\)/)
    // 只允许删记录下来的 dir；不存在「按目录扫一遍再删」这种写法
    expect(source).toMatch(/for \(const dir of profileDirs\) \{/)
    expect(source, '不许直接对 profilesDir 动手').not.toMatch(/rmSync\(\s*profilesDir/)
    expect(source, '不许按前缀扫目录再删（那会把别人的 live-smoke-* 一起删掉）').not.toMatch(/readdirSync\(profilesDir\)\.filter\([^)]*live-smoke/)
  })

  it('两个实例各一份 profile 拷贝（共用会让 A 的降权写盘污染 B 的断言）', () => {
    expect(source).toMatch(/await makeProfile\('a'\)/)
    expect(source).toMatch(/await makeProfile\('b'\)/)
    expect(source, 'A 那次调用不该复用 B 的 profile 名').toMatch(/const nameA = await makeProfile\('a'\)/)
    expect(source).toMatch(/const nameB = await makeProfile\('b'\)/)
  })

  it('只播种本机目标（验收不该去连别人的机器）', () => {
    expect(source).toContain('kind: local')
    expect(source).toContain('const LIVE_TARGET = ')
  })
})

describe('live-host-smoke：刻意不隔离 DSH_HOME（相对符号链接）', () => {
  it('不设置 DSH_HOME，只读它来定位 profiles 目录', () => {
    // 为什么不断言「隔离」：profile 里的 node_modules 是指向本仓的**相对**符号链接，
    // 把 profile 挪到别的 DSH_HOME 下会整批断掉、插件被跳过（实测：插件全 skipped，
    // 连路由都不存在）。所以它走「在真 DSH_HOME 里建一次性 profile」这条路——
    // 这条断言是给想「顺手加上隔离」的人看的：先读脚本头与本测试的说明。
    expect(source).toMatch(/const dshHome = process\.env\.DSH_HOME \?\?/)
    expect(source, '不许把 DSH_HOME 指向别处（会断掉 profile 里的相对符号链接）').not.toMatch(/DSH_HOME\s*[:=]/)
    expect(bootstrapSource, 'bootstrap 也不许自己改 DSH_HOME：它必须落在调用方看到的那个 profiles 目录里').not.toMatch(/DSH_HOME\s*[:=]/)
  })
})

describe('live-host-smoke：--bootstrap 也只碰自己造的那一份', () => {
  it('只有显式 --bootstrap（且没点名 --from）才现场造，默认行为不变', () => {
    expect(source).toMatch(/if \(source === null && bootstrap && value\('--from'\) === undefined\)/)
    // 造失败是**失败**，不是跳过：造不出来还退 0 就成了「假装验过」
    expect(source).toMatch(/--bootstrap 失败[\s\S]{0,240}process\.exit\(1\)/)
  })

  it('造出来的模板 profile 也进「待删列表」（删除只认列表，不按前缀扫目录）', () => {
    expect(source).toMatch(/profileDirs\.push\(made\.dir\)/)
    expect(bootstrapSource, '模块自己不删目录：删除由调用方按记录做').not.toMatch(/rmSync\(/)
  })

  it('拒绝覆盖已存在的目录（宁可失败也不吞掉别人的 profile）', () => {
    expect(bootstrapSource).toMatch(/if \(fs\.existsSync\(dir\)\) \{/)
    expect(bootstrapSource).toContain('拒绝覆盖')
  })

  it('复制 profile 不许用 `fs.cpSync`（Windows 上它会把 junction 展开成 124MB 真副本 → 插件 import 失败）', () => {
    // 只禁**调用**（注释里正当地提了 cpSync 为什么不能用）
    expect(source, 'copyProfile 走 copyProfileTree').not.toMatch(/cpSync\s*\(/)
    expect(bootstrapSource).toMatch(/export function copyProfileTree/)
    expect(bootstrapSource, '链接（含 junction）要建成链接').toMatch(/if \(stat\.isSymbolicLink\(\)\) \{/)
  })

  it('link 的目标只能由 repoRoot + packages/<pkg> 拼出来（不接受外部路径）', () => {
    expect(bootstrapSource).toMatch(/link:\$\{path\.join\(repoRoot, 'packages', pkg\)\}/)
    // 全文件只有这一处拼 link:（没有第二处可以塞进用户给的路径）
    const linkTemplates = [...bootstrapSource.matchAll(/`link:\$\{[^}]*\}`/g)].map((m) => m[0])
    expect(linkTemplates).toHaveLength(1)
  })

  it('自证插件真进了阵容（cohort 不匹配时 DSH 会整批 disabled → 假绿的源头）', () => {
    expect(bootstrapSource).toMatch(/--dump-config/)
    expect(bootstrapSource).toMatch(/@hyzyn\/dsh-\$\{pkg\}/)
    expect(bootstrapSource).toContain('缺本仓插件')
  })

  it('模板用的是 dsh **自带**的名字，不是某个用户的 profile', () => {
    expect(bootstrapSource).toMatch(/BOOTSTRAP_TEMPLATE = 'web'/)
    expect(bootstrapSource).toMatch(/--from-default-profile/)
  })
})

describe('live-host-smoke：授权落点隔离（kit D12）', () => {
  it('两个实例都用一次性 profile 里的 .kit-home 当 DSH_KIT_HOME（否则「无授权实例」会继承你的持久授权）', () => {
    /*
     * 2026-09-27 实测（就是这条守卫要拦住的那次）：开发机在卡片上授权过之后，
     * `~/.dsh/dsh-kit/capability-grants.json` 里有了记录，而 A 实例共用同一个 DSH_HOME
     * → A1/A2/A3/A5/A5b/A5c/A6/A7/A7b 九条全红，红的理由却是「它其实已授权」。
     */
    expect(source, 'startHost 必须给实例注入隔离的授权目录').toMatch(/env\.DSH_KIT_HOME = kitHome/)
    expect(source, '隔离目录放在一次性 profile 里（随 profile 一起删，不引入第二处清理路径）').toMatch(
      /const kitHome = path\.join\(profilesDir, profileName, '\.kit-home'\)/,
    )
    // 覆盖是「按实例」的：两个实例各拿自己的 profile 目录，不能共用一份
    expect(source).toMatch(/startHost\(\{ profileName: nameA/)
    expect(source).toMatch(/startHost\(\{ profileName: nameB/)
  })

  it('仍然不许动 DSH_HOME（相对符号链接那条理由没变）', () => {
    expect(source).toMatch(/const dshHome = process\.env\.DSH_HOME \?\?/)
    expect(source, '授权落点覆写不许被写成 DSH_HOME 覆写').not.toMatch(/DSH_HOME\s*[:=]/)
  })

  it('只**读**你自己的授权文件（打印条数），不写：写的一侧是宿主，宿主只看得见隔离目录', () => {
    expect(source).toMatch(/fs\.readFileSync\(yours, 'utf8'\)/)
    expect(source, '脚本里不许出现对 dsh-kit 授权文件的写').not.toMatch(/writeFileSync\([^)]*capability-grants/)
  })
})

describe('live-host-smoke：CI 形态（2026-10-03 政策变更——此前是「不进 CI」）', () => {
  /*
   * ## 这条政策为什么变了
   *
   * 原文是「CI 与发布流水里都没有它（CI 里没有 DSH）」——那条判断在 2026-10-03 被有意推翻：
   * 本仓的 9 道 CI 闸门全在验「这棵树自洽吗」，**没有一道会加载 client.js**，而 client.js
   * 才是用户实际运行的东西（`vitest.config.ts` 明写「打包后的 client.js 不在本层测」，
   * tty D61 就是这么漏掉的）。「构建绿 + 单测绿 + 用户白屏」此前在 CI 里完全不可见。
   *
   * 所以现在 CI 与发布闸**都**跑它，形态固定为
   * `pnpm live-smoke --bootstrap --strict --render --chrome-arg --no-sandbox`。
   *
   * ⚠️ 三条**不可退化**的性质随这次变更一起钉住（它们才是这条车道安全的根据）：
   *   ① `--bootstrap` 必须在场：CI 腿是干净环境，没有它就没有可挂的 profile（会 SKIP）；
   *   ② `--strict` 必须在场：否则「没装 DSH」会退 0，而 SKIP 是「我跑过了」里最容易被当成
   *      PASS 的东西——加了 --strict 它才是失败；
   *   ③ `--no-sandbox` 必须在场：容器化 runner 里 Chrome 自己的 sandbox 起不来，不带它
   *      CDP 只会报超时（本机沙箱实测：不带必超时，带了 5/5 全绿）。
   */
  const CI_CMD = 'pnpm live-smoke --bootstrap --strict --render --chrome-arg --no-sandbox'

  /*
   * 从 workflow 文本里取**实际的 run 命令行**（去掉注释行）。
   *
   * 为什么必须这样做：第一版直接对全文 `toContain('--no-sandbox')`——而同一份文件里**解释这个
   * 旗标的注释**也含这个词，于是「把旗标从命令里删掉」这个反例**照绿**（实测：只红了
   * 「命令逐字一致」那一条）。这正是本仓反复吃过的那类恒绿闸门（`:(glob)` pathspec 命中 0 个
   * 文件、写死路径的守卫扫不到）。注释里正当地提了这些旗标名，所以判据只能看命令本身。
   */
  const runLines = (text) =>
    text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => !line.startsWith('#'))
      .filter((line) => /^(- )?run:\s/.test(line) || /^pnpm live-smoke/.test(line))
      .join('\n')

  it('CI 与发布闸都跑挂载车道，且命令逐字一致', () => {
    expect(ci).toContain(CI_CMD)
    expect(release).toContain(CI_CMD)
  })

  it('CI 形态的四个旗标一个都不能少（在**命令行**里，不是注释里）', () => {
    for (const [name, text] of [['ci.yml', ci], ['release.yml', release]]) {
      const commands = runLines(text)
      expect(commands, `${name} 里要能找到挂载命令`).toContain('live-smoke')
      expect(commands, `${name} 的挂载命令缺 --bootstrap：干净腿没有可挂的 profile，会退化成 SKIP`).toContain('--bootstrap')
      expect(commands, `${name} 的挂载命令缺 --strict：没装 DSH 会退 0（假装验过）`).toContain('--strict')
      expect(commands, `${name} 的挂载命令缺 --no-sandbox：容器里 Chrome sandbox 起不来，只会报超时`).toContain('--no-sandbox')
      expect(commands, `${name} 的挂载命令缺 --render：退化成纯 HTTP 断言，client.js 又没人加载了`).toContain('--render')
    }
  })

  it('CI 里真的装了 DSH 并 pin 住版本（不装则整条车道只会 SKIP）', () => {
    expect(ci).toMatch(/npm install -g @deepseek-ai\/dsh@\d+\.\d+\.\d+/)
    expect(release).toMatch(/npm install -g @deepseek-ai\/dsh@\d+\.\d+\.\d+/)
    // pin 的版本与根 package.json 的 peer 范围同档（升 cohort 时两边一起改）
    const pinned = /npm install -g @deepseek-ai\/dsh@([\d.]+[\w.-]*)/.exec(ci)?.[1]
    const peer = /"@deepseek-ai\/dsh":\s*"([^"]+)"/.exec(
      readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
    )?.[1]
    expect(pinned, 'ci.yml 里要能解析出 pin 的 dsh 版本').toBeDefined()
    expect(peer, `pin 的 ${String(pinned)} 应在 peer 范围内：${String(peer)}`).toContain(pinned)
  })

  it('没装 DSH / 找不到 link profile 时打印 SKIP（退出 0），--strict 才失败', () => {
    expect(source).toMatch(/process\.exit\(strict \? 1 : 0\)/)
    expect(source).toContain('SKIP')
  })

  it('显式 --from 却不合格 → 直接失败（用户点名了它，静默跳过等于假装验过）', () => {
    expect(source).toMatch(/if \(asked !== undefined\) \{/)
    expect(source).toMatch(/FAIL：--from \$\{asked\} 不是「link 到本仓」的 profile/)
  })

  it('脚本里的文案不再自称「不进 CI」（代码变了、文案没跟是最容易被信的那种错）', () => {
    /*
     * 实际踩到：接进 CI 之后跑出来的汇总仍然印着「这是本地门槛，不进 CI（CI 里没有 DSH）」
     * ——一条跑在 CI 里的命令自己说它不在 CI 里。这类「代码已变、文案没跟」比代码错更难发现，
     * 因为没人会去质疑一句打印出来的话。
     */
    expect(source, '汇总文案里不许再出现「不进 CI」').not.toContain('不进 CI')
    expect(source, '脚本头不许再自称「本地门槛」').not.toMatch(/^\s*\*\s*真宿主验收[^\n]*本地门槛/m)
  })
})

describe('live-host-smoke：--render 的 C 段真的存在且不可退化成 HTTP-only', () => {
  /*
   * 这条守的是本次变更的**核心价值**：车道必须有真浏览器，否则又退回「字节对就算过」。
   * 与上面同一条思路——静态断言防的是后续重构把它改坏。
   */
  it('存在独立的渲染断言函数，且在 B 段之后按 --render 调用', () => {
    expect(source, '渲染断言要独立成函数').toMatch(/async function assertRendered\(host\)/)
    expect(source, '只有显式 --render 才跑（默认行为不变）').toMatch(/if \(render\) await assertRendered\(hostB\)/)
  })

  it('渲染断言用的是真浏览器（Chrome.launch），不是再打一次 HTTP', () => {
    expect(source).toMatch(/chrome = await Chrome\.launch\(/)
    expect(source).toMatch(/Page\.navigate/)
  })

  it('C2 断言「插件 bundle 在真浏览器里被加载」——用 performance 现算，不是读宿主日志', () => {
    expect(source).toContain("performance.getEntriesByType('resource')")
    expect(source).toContain('C2 本仓插件的客户端 bundle 在真浏览器里被真的加载了')
    // 抠出**所有** @hyzyn 段（client 是合并请求，只取第一个会少数 8 个——verify-client-ui 踩过）
    expect(source).toContain('matchAll(/@hyzyn(?:%2F|\\\\/)([a-z-]+)/g)')
  })

  it('渲染断言收尾一定关浏览器（失败路径也要关）', () => {
    expect(source).toMatch(/finally \{\s*chrome\.close\(\)/)
  })

  it('--render 找不到浏览器 → 失败，不是静默跳过', () => {
    expect(source).toMatch(/C0 无头渲染：本机没有可用的 Chrome/)
    expect(source).toMatch(/C0 无头渲染：本机没有可用的 Chrome \/ Chromium/)
  })

  it('用带 token 的 URL 打开（真实首访路径），而不是手工注入 cookie', () => {
    expect(source).toMatch(/host\.base\}\/\?token=\$\{String\(host\.token\)\}/)
    expect(source, '句柄要留住 token').toMatch(/handle\.token = tokenUrl\.token/)
  })
})

describe('浏览器路径发现：不许退回写死的 macOS 常量', () => {
  it('chrome-cdp.mjs 走 findChrome（Linux / Windows 腿才找得到浏览器）', () => {
    const cdp = readFileSync(new URL('../../scripts/chrome-cdp.mjs', import.meta.url), 'utf8')
    expect(cdp).toMatch(/import \{ findChrome \} from '\.\/chrome-path\.mjs'/)
    expect(cdp).toMatch(/export const DEFAULT_CHROME = findChrome\(\)/)
    expect(cdp, '不许再有写死的 macOS 路径').not.toContain('/Applications/Google Chrome.app')
  })

  /*
   * 2026-10-03 补：此前只守住了 `chrome-cdp.mjs`，而 `packages/` 下另有**四处**各自
   * 抄了一份浏览器发现——tty 与 search 的 preview **逐字相同**（都只在 macOS 上找得到），
   * codegraph 的 preview-card 与 docker 的 log-perf 直接写死 macOS 路径。
   * 「只修一半」正是这一组要拦的形状：改了一处、漏了另外几处，而漏掉的那些在
   * macOS 开发机上照样能跑，所以本地永远发现不了。
   */
  const CALL_SITES = [
    ['packages/tty/scripts/preview.mjs', '../../../scripts/chrome-path.mjs'],
    ['packages/search/scripts/preview.mjs', '../../../scripts/chrome-path.mjs'],
    ['packages/codegraph/scripts/preview-card.mjs', '../../../scripts/chrome-path.mjs'],
    ['packages/docker/scripts/log-perf.mjs', '../../../scripts/chrome-path.mjs'],
  ]

  it.each(CALL_SITES)('%s 走共享的 findChrome（不再自抄一份）', (rel, importPath) => {
    const text = readFileSync(new URL('../../' + rel, import.meta.url), 'utf8')
    expect(text, '要从根 scripts/chrome-path.mjs 取浏览器发现').toContain(`from '${importPath}'`)
    expect(text, '不许再有写死的 macOS 路径').not.toContain('/Applications/Google Chrome.app')
    // 自抄一份的指纹：自己再定义一个同名的本地函数（收口后应改成 resolveChrome 之类的薄包装）
    expect(text, '不许再自带一份 findChrome 实现').not.toMatch(/^function findChrome\(/m)
  })

  it('四处都不再自己扫 playwright 缓存（那份扫描只在 chrome-path.mjs 里有一份）', () => {
    for (const [rel] of CALL_SITES) {
      const text = readFileSync(new URL('../../' + rel, import.meta.url), 'utf8')
      expect(text, `${rel} 不该再手抄 playwright 缓存路径`).not.toContain('Library/Caches/ms-playwright')
    }
  })
})
