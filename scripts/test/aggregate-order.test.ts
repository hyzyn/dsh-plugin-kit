/**
 * `scripts/aggregate-order.mjs` 的用例 —— 聚合层的挂载顺序。
 *
 * ## 这份用例守两件事
 *
 * 1. **纯函数的行为**：优先级清单里的包排最前、其余保持字母序；清单不命中时
 *    `missingPriority` 必须报出来（生成器据此中止——否则顺序会悄悄退回字母序而没人发现）。
 * 2. **真实仓库的产物被钉住**：`cordis.patch.yml`（根与 `packages/all`）里 `env-manager`
 *    必须是**第一个插件行**。这一条不是重复 `aggregate:check`（那道只验「重新生成后无 diff」），
 *    它守的是**契约本身**：谁把优先级清单删了、或手改了生成物顺序，这里当场红。
 *
 * 反例全部用合成列表造（不修改任何受版本控制的文件）；真实仓库那组只读生成物。
 */
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { MOUNT_PRIORITY, missingPriority, orderPlugins } from '../aggregate-order.mjs'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

/** 从一份生成物里按出现顺序取 `- id:` 序列。 */
function ids(relPath) {
  const text = readFileSync(join(REPO_ROOT, relPath), 'utf8')
  return [...text.matchAll(/^\s*-\s+id:\s*(\S+)/gm)].map((match) => match[1])
}

/** 造一个插件条目；只有 dir / name 参与排序。 */
const plugin = (dir) => ({ dir, name: `@hyzyn/dsh-${dir}` })

describe('orderPlugins：优先级 → 其余字母序', () => {
  it('env 排最前，其余保持字母序', () => {
    const plugins = [plugin('codegraph'), plugin('docker'), plugin('env'), plugin('mcp')]
    expect(orderPlugins(plugins).map((item) => item.dir)).toEqual(['env', 'codegraph', 'docker', 'mcp'])
  })

  it('不改输入数组（纯函数）', () => {
    const plugins = [plugin('codegraph'), plugin('env')]
    const snapshot = plugins.map((item) => item.dir)
    orderPlugins(plugins)
    expect(plugins.map((item) => item.dir)).toEqual(snapshot)
  })

  it('多个优先级按清单顺序，而不是字母序', () => {
    const plugins = [plugin('a'), plugin('b'), plugin('c')]
    expect(orderPlugins(plugins, ['@hyzyn/dsh-b', '@hyzyn/dsh-a']).map((item) => item.dir)).toEqual(['b', 'a', 'c'])
  })

  it('清单外的新插件落在后面，仍按字母序', () => {
    const plugins = [plugin('zzz'), plugin('env'), plugin('aaa')]
    expect(orderPlugins(plugins).map((item) => item.dir)).toEqual(['env', 'aaa', 'zzz'])
  })

  it('清单项没有对应插件 → missingPriority 报出来（生成器据此中止）', () => {
    expect(missingPriority([plugin('env')])).toEqual([])
    expect(missingPriority([plugin('mcp')])).toEqual(MOUNT_PRIORITY)
  })
})

describe('真实仓库：env 是第一个插件行', () => {
  it('packages/all 与根 bundle 都把 env-manager 排在最前（自身行之后）', () => {
    expect(ids('packages/all/cordis.patch.yml').slice(0, 3)).toEqual(['all', 'env-manager', 'codegraph'])
    expect(ids('cordis.patch.yml').slice(0, 3)).toEqual(['dsh-plugin-kit', 'env-manager', 'codegraph'])
  })

  it('优先级清单目前只有 env（多塞一项就要在 aggregate-order.mjs 头部补理由）', () => {
    expect(MOUNT_PRIORITY).toEqual(['@hyzyn/dsh-env'])
  })
})
