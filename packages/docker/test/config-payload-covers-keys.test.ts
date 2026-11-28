/**
 * 配置卡片「整表提交」的覆盖守卫 —— 宿主接受的每个可写键都必须出现在保存 payload 里（0.17.5）。
 *
 * ## 要防的那次事故
 *
 * 现场：设置 → 插件配置 → 容器，把「切换会话时」从「同一工作区内跟随」改成「不跟随（默认）」，
 * 点保存、回执也写着已保存，**重新打开还是跟随**；反过来把「不跟随」改成「同一工作区内跟随」
 * 也存不进去。真因不在宿主（`POST /config` 的白名单与 `normalizeConfig` 都认这个键），而在
 * 卡片的 `toPayload()`：它是**整表**提交，漏掉的键宿主按默认值写回，于是响应快照把控件弹回
 * 原值——界面表现出「选项存不上」，服务端从来没有收到这个字段。
 *
 * 这类漏键**没有运行时入口**（要真 DOM + 真宿主 + 一次保存往返），照本仓「新规矩必须配守卫」
 * 的纪律钉源码形状：宿主侧的键表与客户端侧的 payload 各自从源码里抽，做集合覆盖比对。
 *
 * ## 边界
 *
 * - 只比对「键名是否出现」，不判值怎么归一（值的口径在 `normalizeConfig` 与两端的单测里）。
 * - `hostKeys` 是**刻意**不整表回传的（服务端并集合并，删除走显式 `hostKeysRemove`，见 D10），
 *   作为唯一例外列在 `INTENTIONAL_ABSENT` 里；例外表本身也校验，宿主改了名它要一起红。
 * - 抽不出键表 / payload 函数体就**判红**（返回问题串），不静默通过。
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const HOST_SOURCE = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')
const CLIENT_SOURCE = readFileSync(new URL('../client-src/index.js', import.meta.url), 'utf8')

/** 刻意不进保存 payload 的键（附理由，别加空）。 */
const INTENTIONAL_ABSENT = new Map<string, string>([
  ['hostKeys', '不整表回传（D10）：服务端并集合并，删除走显式 hostKeysRemove'],
])

/** 从宿主的 `KNOWN_CONFIG_KEYS` 集合字面量里抽键名。抽不出返回 null。 */
function hostWritableKeys(source: string): string[] | null {
  const start = source.indexOf('const KNOWN_CONFIG_KEYS = new Set([')
  if (start === -1) return null
  const end = source.indexOf('])', start)
  if (end === -1) return null
  const keys = [...source.slice(start, end).matchAll(/'([A-Za-z][A-Za-z0-9_]*)'/g)].map((match) => match[1])
  return keys.length === 0 ? null : keys
}

/** 从卡片的 `toPayload` 箭头函数体里抽命中形状的原文。抽不出返回 null。 */
function payloadBody(source: string): string | null {
  const start = source.indexOf('const toPayload = (source) => ({')
  if (start === -1) return null
  const end = source.indexOf('\n      })', start)
  if (end === -1) return null
  return source.slice(start, end)
}

/** 判据：返回「宿主接受但 payload 从不发送」的键（空数组 = 通过）。 */
function missingKeys(writable: string[] | null, body: string | null): string[] {
  if (writable === null) return ['<宿主 KNOWN_CONFIG_KEYS 抽不出来>']
  if (body === null) return ['<客户端 toPayload 抽不出来>']
  return writable.filter((key) => !INTENTIONAL_ABSENT.has(key) && !new RegExp(`\\b${key}\\b`).test(body))
}

describe('配置卡片保存 payload 覆盖宿主可写键（0.17.5）', () => {
  it('宿主接受的每个可写键都出现在 toPayload 里', () => {
    expect(missingKeys(hostWritableKeys(HOST_SOURCE), payloadBody(CLIENT_SOURCE))).toEqual([])
  })

  it('例外表不腐烂：hostKeys 仍在宿主键表里', () => {
    const writable = hostWritableKeys(HOST_SOURCE)
    expect(writable).not.toBeNull()
    for (const key of INTENTIONAL_ABSENT.keys()) expect(writable).toContain(key)
  })

  it('反例：从 payload 里删掉一个键必须报红（守卫不是恒真）', () => {
    const body = payloadBody(CLIENT_SOURCE)
    expect(body).not.toBeNull()
    const mutated = String(body).split('\n').filter((line) => !/^\s*reopenAcrossSessions:/.test(line)).join('\n')
    expect(missingKeys(hostWritableKeys(HOST_SOURCE), mutated)).toEqual(['reopenAcrossSessions'])
  })
})
