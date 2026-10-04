/**
 * @hyzyn/dsh-devfront — volatile 契约回归（2026-10-02 查实）。
 *
 * ## 为什么值得一组专门的用例
 *
 * `Config` 的字段全标 `.volatile()`，而那个声明的**唯一**含义是「可以热写、插件自己订阅
 * `loader/volatile-update` 重读」（见 `@hyzyn/dsh-kit` 的 `settingsEntryScope`）。loader 检出
 * 「只变了 volatile 字段」后**不重挂插件**，只把配置引用就地改写——所以「订阅」不是可选优化，
 * 而是那份声明成立的条件。
 *
 * 此前没有订阅、也不重读（只在 `apply` 里读一次），后果是**静默的**：插件配置页上改站点会
 * 写盘成功、descriptor 里还写着 `applies: "live"`，而工具描述里嵌的「可用站点名单」一直停在
 * 旧值——用户以为配上了，agent 那边却只看到旧站点甚至一个都没有。这组用例把「改完真的生效」
 * 钉住，而不只是断言「订阅了」。
 *
 * 顺带钉住三件容易在重构里丢掉的事：**空对象不能当配置**（`describe` 未就绪时会返回 `{}`，
 * 认它会把已声明的站点整批抹掉）、**值没变的广播不该拆装工具**（`loader/volatile-update` 是
 * 全仓广播的，kit 的订阅不按 entry 过滤）、**没有 settings 服务的宿主照旧可用**。
 */

import { describe, expect, it } from 'vitest'

import { makeHost } from './fake-host.js'

const TARGET = (id: string): Record<string, unknown> => ({
  id,
  url: `https://${id}.test/`,
  scopeDirs: [`/w/${id}`],
})

const SEVEN = ['site_open', 'site_shot', 'site_click', 'site_fill', 'site_text', 'site_console', 'site_verify']

/* ------------------------------------------------------------------ *
 * 核心：改配置 → 真的生效
 * ------------------------------------------------------------------ */

describe('volatile 契约：配置改了必须真的生效', () => {
  it('★ 走真实的写入路径（settings.update）改站点名单：工具重新注册，可用站点换成新的', async () => {
    const host = makeHost()
    host.mount({ targets: [TARGET('a')] })
    expect(host.descriptionOf('site_open', 'target')).toContain('可用：a')

    // 用户在插件配置页上改：写入 → loader 广播 volatile 更新 → 插件重读。
    await host.settings.update('devfront', { targets: [TARGET('b')] })

    expect(host.descriptionOf('site_open', 'target')).toContain('可用：b')
    expect(host.descriptionOf('site_open', 'target')).not.toContain('可用：a')
    // 七个工具都得在：只有描述变了，不是一个都没了。
    expect([...host.tools.keys()].sort()).toEqual([...SEVEN].sort())
  })

  it('重新注册前先拆掉上一轮（同名工具不该留下两份）', () => {
    const host = makeHost()
    host.mount({ targets: [TARGET('a')] })
    const afterMount = host.counts.registrations

    host.emit('loader/volatile-update') // 值没变 → 不动（见下一条）
    expect(host.counts.registrations).toBe(afterMount)

    host.stored.targets = [TARGET('b')]
    host.emit('loader/volatile-update')
    expect(host.counts.registrations).toBe(afterMount + SEVEN.length)
    expect(host.counts.disposals).toBe(afterMount)
  })

  it('enabled 关掉：七个工具全部撤下（而不是留在那儿必然失败的入口）', () => {
    const host = makeHost()
    // settings 层才是「配置页读到的那份」：mount 的 config 只是初始值，二者要一致。
    host.stored.targets = [TARGET('a')]
    host.mount({ targets: [TARGET('a')] })
    expect(host.tools.size).toBe(SEVEN.length)

    host.stored.enabled = false
    host.emit('loader/volatile-update')
    expect(host.tools.size).toBe(0)

    // 再打开要能回来（不是单向的拆卸）。
    host.stored.enabled = true
    host.emit('loader/volatile-update')
    expect(host.tools.size).toBe(SEVEN.length)
  })

  it('targets 清空：工具撤下（没站点可验时不该给 agent 一排必然失败的入口）', () => {
    const host = makeHost()
    host.mount({ targets: [TARGET('a')] })
    host.stored.targets = []
    host.emit('loader/volatile-update')
    expect(host.tools.size).toBe(0)
  })

  it('announceToAgent 关掉：公告段撤下；再打开：回来', () => {
    const host = makeHost()
    host.mount({ targets: [TARGET('a')] })
    expect(host.counts.sections).toBe(1)

    host.stored.announceToAgent = false
    host.emit('loader/volatile-update')
    expect(host.counts.sections).toBe(0)

    host.stored.announceToAgent = true
    host.emit('loader/volatile-update')
    expect(host.counts.sections).toBe(1)
  })

  it('resolved 值才是权威：settings 层的站点压过 apply 时拿到的那份 config', () => {
    const host = makeHost()
    host.stored.targets = [TARGET('from-settings')]
    // `seed: false`：这份 config **只**交给 apply（模拟「bundle 层给的」与「settings 解析的」不同）
    host.mount({ targets: [TARGET('from-config')] }, { seed: false })
    expect(host.descriptionOf('site_open', 'target')).toContain('可用：from-settings')
  })
})

/* ------------------------------------------------------------------ *
 * 边界：三件容易在重构里丢掉的事
 * ------------------------------------------------------------------ */

describe('volatile 契约的边界', () => {
  it('★ describe 还没准备好（空对象）不能当作「用户清空了配置」——站点会整批消失', () => {
    const host = makeHost()
    host.mount({ targets: [TARGET('a')] })

    host.notReady()
    host.emit('loader/volatile-update')

    expect(host.tools.size).toBe(SEVEN.length)
    expect(host.descriptionOf('site_open', 'target')).toContain('可用：a')
  })

  it('★ 值没变的广播不拆装工具（别人的配置变更也会打到我们这里）', () => {
    const host = makeHost()
    host.mount({ targets: [TARGET('a')] })
    const before = { ...host.counts }

    // kit 的 onChanged 不按 entry 过滤：别的插件改配置同样会触发这次回调。
    for (let i = 0; i < 5; i += 1) host.emit('loader/volatile-update')

    expect(host.counts.registrations).toBe(before.registrations)
    expect(host.counts.disposals).toBe(before.disposals)
  })

  it('宿主没有 settings 服务（最小宿主 / 冒烟夹具）：照旧按 config 注册，不因订阅而挂', () => {
    const host = makeHost({ settings: false })
    host.mount({ targets: [TARGET('a')] })
    expect(host.tools.size).toBe(SEVEN.length)
    expect(host.descriptionOf('site_open', 'target')).toContain('可用：a')

    // 没人订阅，广播不该有任何动静（也不该抛）。
    host.emit('loader/volatile-update')
    expect(host.tools.size).toBe(SEVEN.length)
  })
})
