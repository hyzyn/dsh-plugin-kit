import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

/*
 * 真机脚本的**安全守卫**：它们不许污染用户真实的 ~/.dsh。
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
 */
// 脚本在**仓库根**的 scripts/ 下（不是包内），从本文件出发要上三级
const SCRIPTS = [
  '../../../scripts/verify-codegraph-host-contract.mjs',
  '../../../scripts/verify-codegraph-indexforce.mjs',
]

describe('P0：agent-scope 机制脚本不得碰用户配置与真实仓库', () => {
  const src = readFileSync(new URL('../../../scripts/verify-codegraph-agent-scope.mjs', import.meta.url), 'utf8')

  it('只在自己的临时目录里造项目（不在真实仓库上跑 codegraph init）', () => {
    // 它自造带 .codegraph/ 的临时项目；绝不能出现 init 子命令或真实仓库硬编码
    expect(src).toContain('mkdtempSync')
    expect(src, '不该出现 codegraph init（会在真实仓库上建索引）').not.toMatch(/['"]init['"]/)
    expect(src, '不该硬编码用户机器上的真实仓库路径').not.toMatch(/\/Users\//)
  })

  it('不写 DSH_HOME（它不启动宿主，也不该碰 ~/.dsh）', () => {
    // 与另两个脚本不同：本脚本建的是**最小 Cordis 根**，没有 DSH_HOME 语义。
    // 一旦它开始写 DSH_HOME，就说明有人把它改成「起真宿主」了——那属于 host-contract 的职责。
    expect(src).not.toMatch(/DSH_HOME\s*[:=]/)
    expect(src).not.toContain('cordis.patch.yml')
  })

  it('收尾回收自己拉起的 MCP 子进程（不让临时项目的进程变成孤儿）', () => {
    expect(src, '缺少兜底 SIGTERM').toContain("'SIGTERM'")
    expect(src, '缺少临时目录清理').toContain('rmSync(workDir')
  })

  it('从 dsh-mcp-client 所在层解析其余运行时包（保证只加载一份 dsh-scope）', () => {
    // kScope 是模块内局部 Symbol：第二份 dsh-scope 副本会让 scopeOf() 全返回
    // undefined，隔离静默失效。这条断言守住「同源解析」这个前提。
    expect(src).toContain('mcpClientPath')
    expect(src, '应基于 mcp-client 的路径上溯解析').toMatch(/runtimeScopeDir/)
  })
})

describe('CG45：真机脚本必须隔离 DSH_HOME，不许写用户真实配置', () => {
  for (const rel of SCRIPTS) {
    const src = readFileSync(new URL(rel, import.meta.url), 'utf8')
    const name = rel.split('/').pop()

    it(`${name}：spawn 被测宿主时显式传入隔离的 DSH_HOME`, () => {
      expect(src, '缺少隔离 home 变量').toContain('isolatedHome')
      // spawn 的 env 必须覆盖 DSH_HOME（否则继承真实值 → 写真实补丁）
      expect(src, 'spawn 未覆盖 DSH_HOME').toMatch(/env:\s*\{[^}]*DSH_HOME:\s*isolatedHome/)
    })

    it(`${name}：把被测 profile 拷进隔离目录（而不是让 DSH 写真实 profiles）`, () => {
      // 为什么是拷贝而不是软链：软链下 DSH 仍会往 ~/.dsh/profiles/<p>/cordis.yml 写，
      // 实测在只读沙箱里直接 EPERM；整份拷贝几十 KB，既彻底又不受权限影响。
      expect(src).toContain('cpSync')
      expect(src).toMatch(/cpSync\(join\(realDshHome, 'profiles', profile\)/)
    })

    it(`${name}：收尾断言真实补丁逐字节未变（把承诺变成检查）`, () => {
      expect(src).toContain('realPatchBefore')
      expect(src).toContain('realPatchPath')
      expect(src, '缺少「未改动」自证').toMatch(/未被改动|逐字节/)
    })
  }
})
