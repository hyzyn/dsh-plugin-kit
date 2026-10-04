/**
 * agent 工具**命名**的守卫。
 *
 * ## 为什么需要它
 *
 * 工具名是**模型选工具时唯一看到的标识**。撞族（同一前缀、不同域）的代价不是"不好看"，
 * 而是一条具体的误选路径：
 *
 * > 宿主自带 `web_search` / `web_fetch`（**公网**检索与抓取）。如果本仓再加 `web_open` /
 * > `web_text`（内网站点的真浏览器），模型会在同一族名字里选。而 **SPA 用 `web_fetch`
 * > 拉回来是个空壳**（JS 没执行），它据此判断「页面坏了」——正是前端验活插件要消灭的假阴性。
 *
 * 这条撞族发生过一次：`devfront` 的六个工具原本叫 `web_*`（照 plan §15.2 抄的，而 §15.2 写的时候
 * 还没和宿主的 `web_*` 对上）。改名成 `site_*` 之后，这道守卫负责**不让它漂回去**。
 *
 * ## 判据
 *
 * 1. **不得使用保留前缀**（`web_` / `ui_`）——宿主已经用它们命名自己的工具面；
 * 2. **前缀必须是登记的域**：新加工具时要显式在本文件登记「域 → 归属包」，
 *    这条防的是「随手起个前缀」导致两个包各起一个近义前缀（`site_` / `page_` / `browser_` 并存）。
 * 3. 名字形状：`<域>_<动作>`，小写字母数字与下划线。
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url))

/**
 * 宿主已经占用的域前缀。
 *
 * 依据：宿主 `@deepseek-ai/dsh-tool-web` 定义 `web_search` / `web_fetch`；
 * GUI 自己的插件 id 是 `ui-*`（`ui-chat` / `ui-theme` / …），其工具面同域。
 */
const RESERVED_PREFIXES = ['web_', 'ui_'] as const

/**
 * 本仓登记过的工具域 → 归属包。
 *
 * **新加一个域要在这里加一行**，并说明它操作的对象是什么。
 */
const REGISTERED_DOMAINS: Record<string, { pkg: string; what: string }> = {
  docker_: { pkg: 'docker', what: 'Docker 容器 / 镜像 / 网络 / 卷' },
  tty_: { pkg: 'tty', what: '终端面板会话' },
  sftp_: { pkg: 'tty', what: 'SSH 远端文件传输' },
  // `tunnel_` 也在 tty 包里，但域是**端口转发隧道**而不是终端会话——
  // 这正是本守卫要显式登记的原因：同包不同域是允许的，但必须是有意的，不能是随手起的。
  tunnel_: { pkg: 'tty', what: 'SSH 端口转发隧道' },
  site_: { pkg: 'devfront', what: '声明过的内网**站点**（真浏览器，作用域受限）' },
  devdata_: { pkg: 'devdata', what: '开发/测试环境的**数据服务**（SQL / Redis / MQ，经判据层）' },
  /*
   * `env_` 归**环境编排**（容器 / 端口 / 探针的**状态**），不是「环境变量」——后者的插件是
   * `@hyzyn/dsh-env`（它今天不注册任何工具，所以这个域没有第二个占用者）。
   * 两个概念都简称 env，所以这一行必须写清判的对象：容器与探针，不是进程环境变量。
   */
  env_: { pkg: 'devenv', what: '开发/测试环境的**运行状态**（容器 / 进程 / 端口 / 探针的就绪判据）' },
}

/** 从源码里抠出 `defineTool({ name: '...' })` 的工具名。 */
function toolNamesIn(source: string): string[] {
  const out: string[] = []
  // 只在 defineTool 之后的一小段窗口里找 name，避免把别的 `name:` 字段当成工具名。
  const re = /defineTool\(\{[\s\S]{0,300}?name:\s*'([^']+)'/g
  let match: RegExpExecArray | null
  while ((match = re.exec(source)) !== null) out.push(match[1] as string)
  return out
}

/** 扫全仓所有包源码（每个包的 `src` 目录）里的工具名。 */
function repoToolNames(): { name: string; file: string }[] {
  const out: { name: string; file: string }[] = []
  const packagesDir = join(REPO_ROOT, 'packages')
  for (const dir of readdirSync(packagesDir)) {
    const srcDir = join(packagesDir, dir, 'src')
    let files: string[]
    try {
      files = readdirSync(srcDir)
    } catch {
      continue
    }
    for (const file of files) {
      if (!file.endsWith('.ts')) continue
      const source = readFileSync(join(srcDir, file), 'utf8')
      for (const name of toolNamesIn(source)) out.push({ name, file: `packages/${dir}/src/${file}` })
    }
  }
  return out
}

describe('工具命名：不得占用宿主保留的域', () => {
  it('没有任何工具用 `web_` / `ui_` 前缀', () => {
    // 失败意味着：本仓的工具与宿主的 `web_search` / `web_fetch`（公网）或 GUI 的 `ui-*`
    // 挤在同一个前缀下，模型会在同族名字里误选。
    const offenders = repoToolNames().filter((tool) => RESERVED_PREFIXES.some((prefix) => tool.name.startsWith(prefix)))
    expect(offenders, `这些工具占了宿主保留前缀：${JSON.stringify(offenders)}`).toEqual([])
  })

  it('保留前缀清单本身有依据（不是随手写的）', () => {
    expect([...RESERVED_PREFIXES]).toEqual(['web_', 'ui_'])
  })
})

describe('工具命名：前缀必须是登记的域', () => {
  it('每个工具的前缀都在 REGISTERED_DOMAINS 里', () => {
    for (const tool of repoToolNames()) {
      const domain = Object.keys(REGISTERED_DOMAINS).find((prefix) => tool.name.startsWith(prefix))
      expect(domain, `${tool.file} 的 ${tool.name} 用了一个没登记的域前缀`).toBeDefined()
    }
  })

  it('名字形状：`<域>_<动作>`，只剩小写字母数字与下划线', () => {
    for (const tool of repoToolNames()) {
      expect(tool.name, tool.file).toMatch(/^[a-z][a-z0-9]*_[a-z][a-z0-9_]*$/)
    }
  })

  it('域前缀与归属包对得上（`site_*` 属于 devfront，写错包就是复制粘贴改漏）', () => {
    for (const tool of repoToolNames()) {
      const domain = Object.keys(REGISTERED_DOMAINS).find((prefix) => tool.name.startsWith(prefix))
      if (domain === undefined) continue
      const expected = REGISTERED_DOMAINS[domain]?.pkg
      // 只有被登记的域才检查归属；`run` 这类间接注册不走这条路。
      if (expected !== undefined && tool.file.startsWith('packages/')) {
        const pkgDir = tool.file.split('/')[1]
        expect(pkgDir, `${tool.name} 的域 ${domain} 登记给了 ${expected}，但它在 ${pkgDir} 里`).toBe(expected)
      }
    }
  })

  it('扫到了足够多的工具（防「读空 = 恒绿」）', () => {
    const names = repoToolNames()
    expect(names.length).toBeGreaterThan(20)
    expect(names.some((tool) => tool.name.startsWith('site_'))).toBe(true)
    expect(names.some((tool) => tool.name.startsWith('docker_'))).toBe(true)
  })
})

describe('devfront 的工具名', () => {
  it('是 site_* 而不是 web_*（这条是那次改名的回归钉子）', () => {
    const names = repoToolNames()
      .filter((tool) => tool.file.startsWith('packages/devfront/'))
      .map((tool) => tool.name)
      .sort()
    expect(names).toEqual(['site_click', 'site_console', 'site_fill', 'site_open', 'site_shot', 'site_text', 'site_verify'])
  })
})
