/**
 * `scripts/verify-devdata-all.mjs` 的**安全守卫**（**脚本在仓根、守卫在包内**，同 `host-mount` 那份）。
 *
 * ## 它守什么
 *
 * 一键脚本最容易出的三类问题，每类一条判据（都带反例）：
 *
 * 1. **暗中碰真实 `~/.dsh`**：它自己不该建临时目录、不该起宿主、不该推导 home——需要动 DSH 的第 ⑤ 步
 *    **委托**给已有守卫的 `verify-devdata-host-mount.mjs`（那个脚本自带隔离 home 与收尾自证）。这一条防的是
 *    「一键脚本图省事，把挂载逻辑抄一份进来，于是隔离也跟着抄丢」；
 * 2. **把环境问题报成失败**：真机那一步必须先**探可达性**，不可达 → `SKIP` 而不是红——否则没连
 *    VPN 的人会看到红灯，而红灯的理由与代码无关（本仓真机脚本一贯如此）；
 * 3. **吞掉失败**：每一步都要看退出码，任何 FAIL 必须非零退出——一个永远退 0 的一键脚本比没有更坏。
 *
 * ## 为什么是静态检查
 *
 * 真跑一遍要几分钟、要网络、要装 DSH——进不了 CI。而这三条性质在源码里看得见；真正的执行验证由
 * 维护者手动跑（以及 `verify-devdata-host-mount.mjs` 自己的收尾断言）完成。
 */

import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const SOURCE = readFileSync(new URL('../../../scripts/verify-devdata-all.mjs', import.meta.url), 'utf8')

/**
 * 去掉注释后的源码。
 *
 * **必须去注释**：本文件第一条检查是「有没有委托给 `verify-devdata-host-mount.mjs`」，而文件头注释里就写着
 * 那个名字——不去注释的话，一条**注释**就能让守卫变绿（本仓记过这一类：静态守卫不该能被注释满足，
 * 见 `scripts/test/live-scripts-safety.test.ts` 的 ② 反例）。
 */
export function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
}

/**
 * 检查一键验证脚本源码（**纯函数**，喂 fixture 就能造反例）。
 *
 * @param source - 脚本源码（内部会先去注释）。
 * @returns 违规描述数组（空 = 通过）。
 */
export function verifyAllViolations(source) {
  const code = stripComments(source)
  const problems = []

  // ① 不碰真实 ~/.dsh：自己不起宿主、不推导 home，而且要**委托**给已守卫的挂载脚本
  if (/DSH_HOME\s*[:=]/.test(code)) {
    problems.push('出现 DSH_HOME 赋值/传参：一键脚本自己不该起宿主（那是 verify-devdata-host-mount.mjs 的职责）')
  }
  if (/['"`]\.dsh['"`]/.test(code)) {
    problems.push("出现 '.dsh' 字面量：不该拼真实 home 路径")
  }
  if (!code.includes('verify-devdata-host-mount.mjs')) {
    problems.push('没有委托给 verify-devdata-host-mount.mjs：挂载验收的隔离与守卫会在这里被复制丢')
  }
  if (/plugin\s+['"]?--profile|plugin', 'add|mkdtemp/.test(code)) {
    problems.push('源码里出现了装插件 / 建临时目录：那一半必须留在已守卫的挂载脚本里')
  }

  // ② 真机步骤先探可达性，不可达 = SKIP（不是 FAIL）
  //
  //    断言的是**调用点**（`if (await canConnect(`）而不是「源码里出现过 canConnect」——
  //    后者会被函数**声明**满足，于是「有探测函数但没在门口用」这种改法照样绿（本文件的反例②
  //    第一版就是这么漏掉的）。
  if (!/if \(await canConnect\(/.test(code)) {
    problems.push('没有在真机那一步的门口调用可达性探测：没 VPN 的机器会红成「代码坏了」')
  }
  if (!/skip\(/.test(code)) {
    problems.push('没有 SKIP 路径：不可达的环境问题会被算成失败')
  }
  if (!/DEVDATA_REDIS_HOST/.test(code)) {
    problems.push('没有给出换目标的办法（DEVDATA_REDIS_HOST）：探测失败时人只能去改源码')
  }

  // ③ 吞掉失败 = 更坏
  if (!/status\s*!==\s*0|\?\?\s*1/.test(code)) {
    problems.push('没有看退出码：子进程失败会被静默吞掉')
  }
  if (!/process\.exit\(1\)/.test(code)) {
    problems.push('失败时没有非零退出：一键脚本会永远「通过」')
  }
  return problems
}

describe('devdata 一键验证脚本：不越界、不吞错、不把环境问题当代码问题', () => {
  it('真实源码满足三条性质', () => {
    expect(verifyAllViolations(SOURCE)).toEqual([])
  })

  it('反例①：把挂载逻辑抄进来（起宿主 / mkdtemp）→ 报出来', () => {
    const copied = SOURCE.replace(
      "run('⑤ 真 DSH 宿主挂载验收（隔离 profile）', 'node', [join(here, 'verify-devdata-host-mount.mjs')])",
      "run('⑤ 挂载', 'node', ['-e', 'const d=mkdtempSync(1); spawn(dsh, [\"plugin\", \"add\", \"link:x\"])'])",
    )
    const problems = verifyAllViolations(copied).join('\n')
    expect(problems).toContain('verify-devdata-host-mount.mjs')
    expect(problems).toContain('装插件 / 建临时目录')
  })

  it('反例②：去掉可达性探测，真机那步直接跑 → 报出来', () => {
    const noProbe = SOURCE.replace('if (await canConnect(REDIS_HOST, REDIS_PORT)) {', 'if (true) {')
    const problems = verifyAllViolations(noProbe).join('\n')
    expect(problems).toContain('没有在真机那一步的门口调用可达性探测')
  })

  it('反例③：把失败吞掉（不看退出码 / 不非零退出）→ 报出来', () => {
    const swallowed = SOURCE.replace('const status = result.status ?? 1', 'const status = 0').replace(
      'process.exit(1)',
      'void 0',
    )
    const problems = verifyAllViolations(swallowed).join('\n')
    expect(problems).toContain('没有看退出码')
    expect(problems).toContain('没有非零退出')
  })

  it('反例④：自己推导 DSH home → 报出来', () => {
    const bad = SOURCE.replace('const repoRoot', "const home = join(process.env.HOME, '.dsh')\nconst repoRoot")
    const problems = verifyAllViolations(bad).join('\n')
    expect(problems).toContain("'.dsh'")
  })
})
