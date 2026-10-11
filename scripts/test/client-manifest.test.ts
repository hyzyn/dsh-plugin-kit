/**
 * 客户端半体的 **manifest 声明**守卫（2026-10-11 加）。
 *
 * 现场（loglens 建包后第一次真机验收）：包里有 client.js、i18n 与 client-lint 全过、插件在宿主里也
 * running，但**设置里永远看不到卡片**——因为客户端半体不是「有 client.js 就会被加载」，而是要在
 * `package.json` 里显式声明：
 *
 *   - `dsh.client = { platform: 'web', inject: [...] }`：宿主侧的 client-modules 扫描**已启用的 Loader
 *     条目**、按这份声明把包变成可加载的浏览器 bundle（见 @deepseek-ai/dsh-client-modules 的文档：
 *     「浏览器插件包在其 package.json 中以 platform: 'web' 声明 dsh.client，导出 ./client bundle」）；
 *   - `exports['./client'] = './client.js'`：bundle 的入口。
 *
 * 两条缺一条，宿主就**永远**不把它算进启动图——而 `files` 里有 client.js 也照样打得出包，
 * 于是「装了、在跑、就是没卡片」。这条守卫补的正是那个缺口：现有守卫只查 tarball 条目、i18n
 * 与构建型三件，没人查这份声明。
 */
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const packagesDir = join(root, 'packages')

interface Manifest {
  name?: unknown
  dsh?: { client?: { platform?: unknown } } | unknown
  exports?: Record<string, unknown> | unknown
}

/**
 * 判据本体（纯函数，便于配 fixture 反例）：有客户端半体的包，manifest 必须把两件事都声明到位。
 * @param manifest 该包的 package.json 内容
 * @param clientEntry 该包客户端半体的相对路径（如 'client.js'），没有就别调这个函数
 */
export function clientManifestProblems(manifest: Manifest, clientEntry: string): string[] {
  const problems: string[] = []
  const dsh = typeof manifest.dsh === 'object' && manifest.dsh !== null ? (manifest.dsh as Record<string, unknown>) : {}
  const client = typeof dsh.client === 'object' && dsh.client !== null ? (dsh.client as Record<string, unknown>) : undefined
  if (client === undefined) {
    problems.push('缺 dsh.client（宿主不会把它的 client.js 算进启动图 → 卡片永远不出现）')
  } else if (client.platform !== 'web') {
    problems.push("dsh.client.platform 必须是 'web'（收到：" + JSON.stringify(client.platform) + '）')
  }
  const exportsField = typeof manifest.exports === 'object' && manifest.exports !== null ? (manifest.exports as Record<string, unknown>) : {}
  if (exportsField['./client'] !== './' + clientEntry) {
    problems.push("exports['./client'] 必须指向 './" + clientEntry + "'（收到：" + JSON.stringify(exportsField['./client']) + '）')
  }
  return problems
}

/** 真实语料：盘上有客户端半体的包，逐个对账。 */
function packagesWithClient(): Array<{ pkg: string; entry: string; manifest: Manifest }> {
  const found: Array<{ pkg: string; entry: string; manifest: Manifest }> = []
  for (const name of readdirSync(packagesDir)) {
    let manifest: Manifest
    try {
      manifest = JSON.parse(readFileSync(join(packagesDir, name, 'package.json'), 'utf8')) as Manifest
    } catch {
      continue
    }
    const has = (file: string): boolean => {
      try {
        return readFileSync(join(packagesDir, name, file), 'utf8').length > 0
      } catch {
        return false
      }
    }
    if (has('client-src/index.js')) found.push({ pkg: name, entry: 'client.js', manifest })
    else if (has('client.js')) found.push({ pkg: name, entry: 'client.js', manifest })
  }
  return found
}

describe('客户端半体的 manifest 声明', () => {
  it('每个有客户端半体的包都声明了 dsh.client 与 exports[./client]', () => {
    const rows = packagesWithClient()
    expect(rows.length, '一个客户端半体都没扫到，夹具本身可能漂了').toBeGreaterThanOrEqual(10)
    const problems: string[] = []
    for (const row of rows) {
      for (const problem of clientManifestProblems(row.manifest, row.entry)) problems.push(row.pkg + '：' + problem)
    }
    expect(problems, problems.join('；')).toEqual([])
  })

  it('反例：缺 dsh.client / platform 写错 / 少 exports[./client] 都必须被抓住', () => {
    const good: Manifest = { dsh: { client: { platform: 'web' } }, exports: { './client': './client.js' } }
    expect(clientManifestProblems(good, 'client.js')).toEqual([])

    expect(clientManifestProblems({ exports: { './client': './client.js' } }, 'client.js')[0]).toContain('缺 dsh.client')
    expect(clientManifestProblems({ dsh: { client: {} }, exports: { './client': './client.js' } }, 'client.js')[0]).toContain("必须是 'web'")
    expect(clientManifestProblems({ dsh: { client: { platform: 'web' } }, exports: {} }, 'client.js')[0]).toContain("exports['./client']")
    expect(clientManifestProblems({ dsh: { client: { platform: 'web' } }, exports: { './client': './client.js' } }, 'other.js')[0]).toContain('./other.js')
  })
})
