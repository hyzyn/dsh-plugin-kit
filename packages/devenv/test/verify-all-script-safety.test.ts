/**
 * `scripts/verify-devenv-all.mjs` 的**安全与诚实守卫**（**脚本在仓根、守卫在包内**——与
 * `verify-devdata-all.mjs` / 两个挂载脚本同一分工）。
 *
 * ## 为什么这类脚本需要守卫
 *
 * 一键脚本是**最容易被改坏的那一类代码**：它不进 CI 的判据面（它自己就是验证入口），跑起来又慢，
 * 所以「改坏了没人发现」的窗口很长。而它坏掉的方式恰恰是最糟的两种：**吞掉失败**（步骤红了但退出码
 * 是 0）与**越权去拿它不该拿的东西**（凭据）。所以这里把六条性质逐条钉住，每条配反例。
 *
 * ## 七条性质
 *
 * 1. **不自己起宿主 / 不建临时目录**：需要动真实 DSH 的那一步委托给挂载脚本（那边有隔离守卫与收尾自证）；
 * 2. **真机那两档必须先探可达性**：不可达时 SKIP 不报红（拿网络状况当失败信号会训练人忽略红灯）；
 * 3. **失败必须非零退出**（不许吞）；
 * 4. **不推导 / 不碰真实 DSH home**；
 * 5. **不读凭据存储**（`~/.dsh/.credentials.yaml`）——真机那两档要凭据，而一个验证脚本伸手进凭据服务
 *    等于绕过它的所有权；缺凭据就 SKIP，这是**刻意**的（本包独有的一条，devdata 那边不需要因为它的
 *    真机目标没有密码）；
 * 6. **写入口那一档必须由「人指名的容器」门控**：不许自动挑一个容器——目标机上有同事在联调。
 * 7. **目标地址不许留内网默认值**（2026-10-03 加）：本仓是**公开仓库**，`?? '192.168.x.y'` 这种便利写法等于公开内网拓扑。
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const SOURCE = readFileSync(new URL('../../../scripts/verify-devenv-all.mjs', import.meta.url), 'utf8')

/**
 * 去掉注释。
 *
 * **必须去**：这个脚本的头注里正好写着「本脚本**不会**自己去读 `~/.dsh/.credentials.yaml`」——
 * 那是对**行为**的说明，而不去注释的话它会被自己的判据当成违规（第一版就是这么红的：
 * 一条解释「我不做什么」的注释，把守卫判成了「它在做那件事」）。
 */
export function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

/**
 * 检查一键脚本源码是否满足六条性质（**纯函数**，喂 fixture 就能造反例）。
 *
 * @param raw - 脚本源码（注释会自动去掉）。
 * @returns 违规描述数组（空 = 通过）。
 */
export function verifyAllViolations(raw: string): string[] {
  const source = stripComments(raw)
  const problems: string[] = []

  // ① 不自己起宿主 / 不建临时目录
  if (/mkdtempSync|mkdtemp\(/.test(source)) {
    problems.push('自己建了临时目录：动 DSH 的那一步该委托给挂载脚本（那边有隔离守卫与收尾自证）')
  }
  if (/spawn(Sync)?\(\s*['"]dsh['"]/.test(source) || /run\([^)]*['"]dsh['"]/.test(source)) {
    problems.push('自己起了 dsh 宿主：该委托给挂载脚本')
  }

  // ② 真机那两档必须先探可达性
  if (!/canConnect\(SSH_HOST, SSH_PORT\)/.test(source)) {
    problems.push('真机那两档没有先探可达性：不可达会被报成失败（拿网络状况当失败信号）')
  }
  if (!/await canConnect\(/.test(source)) {
    problems.push('可达性探测没有被 await：判定会在探测完成之前发生')
  }

  // ③ 失败必须非零退出
  if (!/process\.exit\(1\)/.test(source)) {
    problems.push('失败时没有非零退出：红了也会被当成通过')
  }
  if (!/status === 0 \? 'PASS' : 'FAIL'/.test(source)) {
    problems.push('没有按退出码判 PASS/FAIL：失败会被吞掉')
  }

  // ④ 不推导 / 不碰真实 DSH home
  if (/DSH_HOME/.test(source)) {
    problems.push('出现了 DSH_HOME：这个脚本不该碰真实 DSH home（隔离是挂载脚本的事）')
  }
  // 路径形态也要抓：`${repoRoot}/.dsh` 这种拼接没有引号围着
  if (/(['"`]|\/)\.dsh\b/.test(source)) {
    problems.push("出现指向真实 `.dsh` 的路径：不该拼真实 home 路径")
  }

  /*
   * ⑤ 不读凭据存储。
   *
   * 这是本包独有的一条：真机那两档要 SSH 凭据，而**最方便的写法**正好是错的——把那行口令从
   * `~/.dsh/.credentials.yaml` 里抠出来。那样做绕过了凭据服务的所有权，还把口令带进了这个进程的
   * 环境与可能的日志。缺凭据的正确处置是 **SKIP 并说清怎么给**（口令由人 export）。
   */
  if (/credentials\.yaml/.test(source)) {
    problems.push('读了凭据存储（credentials.yaml）：那属于凭据服务，验证脚本不许伸手进去；缺凭据应当 SKIP')
  }
  if (!/hasCredential\(\)/.test(source)) {
    problems.push('没有「有没有凭据」这一层判断：会把「没给凭据」和「链路坏了」混成一件事')
  }

  // ⑥ 写入口那一档由「人指名的容器」门控
  if (!/DEVENV_REAL_WRITE_CONTAINER/.test(source)) {
    problems.push('写入口那一档没有要求人指名容器：它会在共享机器上真启停容器')
  }
  if (!/WRITE_CONTAINER === ''/.test(source)) {
    problems.push('写入口那一档没有「没指名就 SKIP」的分支')
  }

  /*
   * ⑦ 目标地址不许留**内网默认值**（2026-10-03 加）。
   *
   * 本仓是**公开仓库**：`?? '192.168.x.y'` 这种便利写法等于把内网拓扑与主机编号一起公开出去
   * （公网 IP 有闸门管，私网地址没有）。所以目标地址必须是「显式给环境变量」的形态。
   */
  if (!/DEVENV_REAL_SSH_HOST \?\? ''/.test(source)) {
    problems.push("目标地址没有走「必须显式给」的形态（DEVENV_REAL_SSH_HOST ?? ''）：留了默认值就会把地址写进公开仓库")
  }
  if (/192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\b10\.\d+\.\d+\.\d+/.test(source)) {
    problems.push('源码里出现了内网地址字面量：本仓是公开仓库，那等于把内网拓扑公开出去')
  }
  return problems
}

/** 在真实源码上做一次替换造反例；**替换没生效就抛**（否则反例会变成空测试）。 */
function mutate(from: string, to: string): string {
  if (!SOURCE.includes(from)) throw new Error(`fixture 替换没匹配上：${from.slice(0, 50)}`)
  const mutated = SOURCE.replace(from, to)
  expect(mutated, 'fixture 必须真的改动文本').not.toBe(SOURCE)
  return mutated
}

describe('devenv 一键验证脚本：七条性质', () => {
  it('真实源码满足七条', () => {
    expect(verifyAllViolations(SOURCE)).toEqual([])
  })

  it('反例①：自己起宿主 / 建临时目录 → 都报出来', () => {
    const withHost = verifyAllViolations(mutate("run('⑥ 真 DSH 宿主挂载验收（隔离 profile）', 'node', [join(here, 'verify-devenv-host-mount.mjs')])", "run('⑥ 自起宿主', 'dsh', ['--profile', 'x'])"))
    expect(withHost.join('\n')).toContain('自己起了 dsh 宿主')
    const withTmp = verifyAllViolations(mutate("const repoRoot = resolve(here, '..')", "const repoRoot = resolve(here, '..')\nconst tmp = mkdtempSync('/tmp/x')"))
    expect(withTmp.join('\n')).toContain('自己建了临时目录')
  })

  it('反例②：去掉可达性探测（真机那两档直接跑）→ 报出来', () => {
    const problems = verifyAllViolations(mutate('await canConnect(SSH_HOST, SSH_PORT)', 'true'))
    expect(problems.join('\n')).toContain('没有先探可达性')
  })

  it('反例⑦：把内网地址写回目标默认值 → 两条都报出来', () => {
    const leaked = mutate("process.env.DEVENV_REAL_SSH_HOST ?? ''", "process.env.DEVENV_REAL_SSH_HOST ?? '192.168.80.248'")
    const problems = verifyAllViolations(leaked).join('\n')
    expect(problems).toContain('内网地址字面量')
    expect(problems).toContain('必须显式给')
  })

  it('反例③：把失败吞掉（不看退出码 / 不非零退出）→ 都报出来', () => {
    const swallowed = verifyAllViolations(mutate("results.push({ label, state: status === 0 ? 'PASS' : 'FAIL', detail: `exit=${String(status)}` })", "results.push({ label, state: 'PASS', detail: '' })"))
    expect(swallowed.join('\n')).toContain('没有按退出码判 PASS/FAIL')
    const noExit = verifyAllViolations(mutate('  process.exit(1)\n', '  console.error("失败了但继续")\n'))
    expect(noExit.join('\n')).toContain('没有非零退出')
  })

  it('反例④：自己推导真实 DSH home → 报出来', () => {
    const problems = verifyAllViolations(mutate("console.log(`[devenv-verify] 仓库：${repoRoot}`)", "console.log(process.env.DSH_HOME)\nconsole.log(`${repoRoot}/.dsh`)"))
    expect(problems.join('\n')).toContain('不该碰真实 DSH home')
    expect(problems.join('\n')).toContain('指向真实 `.dsh` 的路径')
  })

  it('反例⑤：脚本自己去读凭据存储（**最诱人的那种写法**）→ 报出来', () => {
    const problems = verifyAllViolations(mutate("function hasCredential() {", "function readStore() { return readFileSync(join(homedir(), '.dsh', '.credentials.yaml'), 'utf8') }\nfunction hasCredential() {"))
    expect(problems.join('\n')).toContain('读了凭据存储')
  })

  it('反例⑥：写入口那档不看人指名的容器（自动挑一个）→ 报出来', () => {
    const problems = verifyAllViolations(mutate("if (WRITE_CONTAINER === '') {", 'if (false) {'))
    expect(problems.join('\n')).toContain('没有「没指名就 SKIP」的分支')
  })

  it('SKIP 不报红：缺凭据走的是 skip 分支，而不是 run', () => {
    // 三条 skip 分支各自说清理由（拿环境状况当失败信号会训练人忽略红灯）
    expect(SOURCE).toContain("skip(`④ 真机只读链路")
    expect(SOURCE).toContain("skip('⑤ 真机写入口'")
    expect(SOURCE).toMatch(/SKIP：\$\{reason\}/)
  })
})
